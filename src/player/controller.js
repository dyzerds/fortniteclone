// Character movement (shared by player and bots) + third-person camera rig.
import * as THREE from 'three';
import { MOVE, CAMERA, PLAYER, WORLD } from '../config.js';
import { R, world, setTag, raycast, removeCollider } from '../physics.js';
import { getHeight } from '../world/terrain.js';
import { clamp, damp, angleDiff } from '../util.js';
import { Avatar } from './avatar.js';
import { fallDamage } from '../combat/rules.js';

let kcc = null;
function controller() {
  if (kcc) return kcc;
  kcc = world.createCharacterController(0.03);
  kcc.enableAutostep(0.45, 0.2, false);
  kcc.enableSnapToGround(0.35);
  kcc.setMaxSlopeClimbAngle(52 * Math.PI / 180);
  kcc.setMinSlopeSlideAngle(60 * Math.PI / 180);
  kcc.setApplyImpulsesToDynamicBodies(false);
  return kcc;
}

export const emptyInput = () => ({ mx: 0, mz: 0, yaw: 0, pitch: 0, jump: false, jumpHeld: false, sprint: false, crouch: false, ads: false });

const _v = new THREE.Vector3();


export class Character {
  constructor(scene, { name = 'Player', isBot = false, outfit = 'comet', backbling = 'none', cosmetics = {} } = {}) {
    this.name = name; this.isBot = isBot; this.scene = scene;
    this.cosmetics = { outfit, backbling, ...cosmetics };
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.mode = 'ground'; // bus | skydive | glide | ground | mantle | dead
    this.grounded = false; this.crouching = false; this.sprinting = false; this.sliding = false; this.swimming = false;
    this.health = PLAYER.maxHealth; this.shield = 0; this.alive = true;
    this.kills = 0; this.airTop = 0; this.speedMul = 1; this.ads = false;
    this.mantle = null; this.landT = 0; this.lastHurt = -99; this.moveSpeed = 0;
    this.airT = 0; this.jumped = false; this.swimJump = false; this.jumpT = 0;
    this.deployT = 0; this.steer = 0; this.skyFwd = false; this.bank = 0; this.tilt = 0; this.gliderRoll = 0;
    this.avatar = new Avatar(outfit, backbling);
    scene.add(this.avatar.root);
    this.body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased());
    this.height = MOVE.height;
    this.collider = world.createCollider(this.capsuleDesc(MOVE.height), this.body);
    setTag(this.collider, { kind: 'char', ref: this });
  }

  capsuleDesc(h) {
    return R.ColliderDesc.capsule(h / 2 - MOVE.radius, MOVE.radius).setTranslation(0, h / 2, 0);
  }

  setHeight(h) {
    if (this.height === h) return;
    if (h > this.height) {
      // only stand up when there is room
      const top = { x: this.pos.x, y: this.pos.y + this.height - 0.05, z: this.pos.z };
      if (raycast(top, { x: 0, y: 1, z: 0 }, h - this.height + 0.1, this.collider)) return false;
    }
    this.height = h;
    this.collider.setHalfHeight(h / 2 - MOVE.radius);
    this.collider.setTranslationWrtParent({ x: 0, y: h / 2, z: 0 });
    // the world pose only follows the parent offset at the next physics step; without this the grown capsule
    // sits around its old centre for a tick, sunk into the ground (jumping out of a crouch or slide bonked)
    this.collider.setTranslation({ x: this.pos.x, y: this.pos.y + h / 2, z: this.pos.z });
    return true;
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.jumped = false; this.airT = 0; this.swimJump = false;
    this.body.setTranslation(this.pos, true);
    this.body.setNextKinematicTranslation(this.pos);
    this.airTop = y;
  }

  get forward() { return _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get groundY() { return getHeight(this.pos.x, this.pos.z); }
  get above() { return this.pos.y - Math.max(this.groundY, WORLD.waterLevel); }
  get canClose() { return this.above > MOVE.autoGlideHeight + 5; } // else the glider would reopen at once

  // one fixed-step tick of movement
  move(inp, dt) {
    if (!this.alive) return;
    this.yaw = inp.yaw; this.pitch = inp.pitch; this.ads = inp.ads;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy, rx = cy, rz = -sy;
    let wx = fx * inp.mz + rx * inp.mx, wz = fz * inp.mz + rz * inp.mx;
    const wl = Math.hypot(wx, wz);
    if (wl > 1) { wx /= wl; wz /= wl; }

    if (this.mode === 'bus') return;
    if (this.mode === 'mantle') return this.tickMantle(dt);

    if (this.mode === 'skydive' || this.mode === 'glide') {
      const above = this.above;
      this.steer = inp.mx; this.skyFwd = inp.mz > 0.1;
      if (this.mode === 'skydive') {
        const dive = clamp(-this.pitch, 0, 1.2) / 1.2;
        const fall = MOVE.skydiveFall + (MOVE.skydiveDive - MOVE.skydiveFall) * dive * Math.max(0, inp.mz);
        this.vel.y = damp(this.vel.y, -fall, 2, dt);
        const sp = MOVE.skydiveSteer * (1 - dive * 0.4);
        this.vel.x = damp(this.vel.x, wx * sp, 1.6, dt); this.vel.z = damp(this.vel.z, wz * sp, 1.6, dt);
        // opens by itself near the ground; by hand any time there is room
        if (above < MOVE.autoGlideHeight || (inp.jump && above > MOVE.minDeploy)) this.deploy();
      } else {
        this.deployT += dt;
        if (inp.jump && this.canClose) this.mode = 'skydive'; // back to free fall
        this.vel.y = damp(this.vel.y, -MOVE.glideFall * (inp.mz > 0.1 ? MOVE.glideFwdMul : 1), 3, dt);
        const sp = MOVE.glideSpeed * (inp.mz < -0.1 ? 0.45 : 1);
        const gx = fx * Math.max(0.35, inp.mz) * sp + rx * inp.mx * 9, gz = fz * Math.max(0.35, inp.mz) * sp + rz * inp.mx * 9;
        this.vel.x = damp(this.vel.x, gx, 1.5, dt); this.vel.z = damp(this.vel.z, gz, 1.5, dt);
      }
      const landed = this.applyMove(dt);
      if (landed || this.swimming) { this.mode = 'ground'; this.airTop = this.pos.y; this.landT = 0.15; this.vel.y = 0; this.jumped = false; }
      return;
    }

    // ---- ground mode ----
    const wasGrounded = this.grounded;
    if (inp.crouchPressed && this.grounded && this.sprinting && Math.hypot(this.vel.x, this.vel.z) > MOVE.jog) {
      this.sliding = true;
      const sp = Math.max(Math.hypot(this.vel.x, this.vel.z), MOVE.slideBoost);
      const vl = Math.hypot(this.vel.x, this.vel.z) || 1;
      this.vel.x = this.vel.x / vl * sp; this.vel.z = this.vel.z / vl * sp;
    }
    if (!inp.crouch) this.crouchBlock = false; // a slide that ran out keeps you standing until crouch is let go
    const wantCrouch = (inp.crouch && !this.crouchBlock) || this.sliding;
    if (wantCrouch !== this.crouching) {
      if (this.setHeight(wantCrouch ? MOVE.crouchHeight : MOVE.height) !== false) this.crouching = wantCrouch;
    }
    if (inp.mz <= 0.1 || inp.ads) this.slideSprint = false; // out of a slide you keep sprinting while W is held
    this.sprinting = (inp.sprint || this.slideSprint) && inp.mz > 0.1 && !this.crouching && !inp.ads && !this.swimming;

    if (this.sliding) {
      const vl = Math.hypot(this.vel.x, this.vel.z);
      const dx = this.vel.x / (vl || 1), dz = this.vel.z / (vl || 1);
      const slope = (this.groundY - getHeight(this.pos.x + dx, this.pos.z + dz)); // + when downhill
      let nv = vl - MOVE.slideFriction * dt + clamp(slope, -1, 1) * MOVE.slideSlopeAccel * dt;
      nv = Math.min(nv, 16);
      // the slide turns toward the keys (or the camera with no keys) at a fixed rate, never adding speed
      const toKeys = wl > 0.1 && wx * fx + wz * fz > -0.1;
      const turn = clamp(angleDiff(Math.atan2(-dx, -dz), toKeys ? Math.atan2(-wx, -wz) : this.yaw), -MOVE.slideTurn * dt, MOVE.slideTurn * dt);
      const h = Math.atan2(-dx, -dz) + turn;
      this.vel.x = -Math.sin(h) * nv; this.vel.z = -Math.cos(h) * nv;
      // airT, not grounded: the capsule shrink and small bumps unground us for a tick or two
      if (nv < MOVE.slideMin || !inp.crouch || inp.sprintPressed || this.airT > 0.15) { // Shift cancels into a run
        this.sliding = false; this.crouchBlock = true; this.slideSprint = inp.mz > 0.1;
        inp.crouch = false; // a slide that ends stands you up (toggle crouch: back to standing)
      }
    } else {
      let speed = this.swimming ? MOVE.swim : this.crouching ? MOVE.crouch : this.sprinting ? MOVE.sprint : MOVE.jog;
      if (inp.ads) speed *= 0.65;
      // strafing and back-pedalling are slower than running forward
      if (wl > 0.1 && !this.swimming) { const f = inp.mz / Math.hypot(inp.mx, inp.mz); speed *= MOVE.strafeMul + ((f >= 0 ? 1 : MOVE.backMul) - MOVE.strafeMul) * f * f; }
      speed *= this.speedMul;
      let tx = wx * speed, tz = wz * speed;
      if (this.grounded || this.swimming) {
        // build speed up over ~0.4 s but stop (or turn away) almost at once
        const tl = Math.hypot(tx, tz), ux = tl > 0.01 ? tx / tl : 0, uz = tl > 0.01 ? tz / tl : 0;
        let along = this.vel.x * ux + this.vel.z * uz;
        let px = this.vel.x - ux * along, pz = this.vel.z - uz * along;
        const pl = Math.hypot(px, pz), pk = pl > 0 ? Math.max(0, pl - MOVE.accelStop * dt) / pl : 0;
        px *= pk; pz *= pk;
        along = along < tl ? Math.min(tl, along + (along < 0 ? MOVE.accelStop : MOVE.accelRun) * dt) : Math.max(tl, along - MOVE.accelStop * dt);
        this.vel.x = ux * along + px; this.vel.z = uz * along + pz;
      } else if (wl > 0.1) {
        // air control never brakes the part of your speed that already goes where you steer (slide jumps keep their speed)
        const along = (this.vel.x * wx + this.vel.z * wz) / wl;
        if (along > speed) { tx *= along / speed; tz *= along / speed; }
        const k = Math.min(1, MOVE.accelAir * dt / Math.max(0.001, Math.hypot(tx - this.vel.x, tz - this.vel.z)));
        this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
      }
    }

    const floatY = WORLD.waterLevel - MOVE.swimDepth;
    if (this.swimJump && this.vel.y < 0 && this.pos.y < floatY) { this.swimJump = false; this.jumped = false; } // back in: sink a bit, bob up
    if (this.swimming) {
      if (this.swimJump) this.vel.y -= MOVE.gravity * dt; // leaping out of the water: plain ballistics until back in
      else this.vel.y = damp(this.vel.y, (floatY - this.pos.y) * 4, 6, dt);
      if (inp.jump && !this.swimJump && this.pos.y > floatY - 0.3) { this.vel.y = MOVE.swimJump; this.swimJump = this.jumped = true; this.onSound?.('jump'); }
    } else if (this.grounded) {
      // no downward speed while grounded: snap-to-ground follows slopes down, and any downward push
      // gets projected along the slope by the character controller (dragging you downhill, stalling you uphill)
      this.vel.y = 0;
      if (inp.jump) {
        if (this.crouching && !this.sliding) { this.setHeight(MOVE.height); this.crouching = false; }
        this.vel.y = MOVE.jumpSpeed; this.jumpT = MOVE.jumpHold;
        if (this.sliding) { this.crouchBlock = true; this.slideSprint = inp.mz > 0.1; } // a slide jump comes out standing and sprinting
        this.sliding = false; this.grounded = false; this.jumped = true;
        this.onSound?.('jump');
      }
    } else {
      // a jump rises at a steady speed for a moment before gravity takes over (snappy, high, short)
      this.jumpT -= dt;
      if (this.jumpT > 0 && this.vel.y > 0) this.vel.y = MOVE.jumpSpeed; else this.vel.y -= MOVE.gravity * dt;
      if (inp.jumpHeld && inp.mz > 0.3 && this.vel.y < 3) this.tryMantle();
    }
    if (inp.jump && !this.grounded && inp.mz > 0.3) this.tryMantle();
    if (this.mode === 'mantle') return;
    // falling off something tall: open the glider mid-air
    if (inp.jump && !this.grounded && !this.swimming && this.airT > 0.2 && this.deployRoom() > MOVE.minDeploy) return this.deploy();

    this.applyMove(dt);
    if (!this.grounded) this.airTop = Math.max(this.airTop, this.pos.y);
    this.airT = this.grounded || this.swimming ? 0 : this.airT + dt;
    if (this.grounded && !wasGrounded) {
      const drop = this.airTop - this.pos.y;
      const dmg = this.swimming ? 0 : fallDamage(drop);
      if (dmg > 0) this.onFallDamage?.(dmg);
      if (drop > 0.5 || this.jumped) this.landT = 0.2;
      if (drop > 0.8) this.onSound?.('land');
      this.onLand?.(drop);
      this.jumped = false; this.swimJump = false;
    }
    if (this.grounded || this.swimming) this.airTop = this.pos.y;
    this.landT = Math.max(0, this.landT - dt);
  }

  applyMove(dt) {
    const want = { x: this.vel.x * dt, y: this.vel.y * dt, z: this.vel.z * dt };
    const c = controller();
    c.computeColliderMovement(this.collider, want, R.QueryFilterFlags.EXCLUDE_SENSORS);
    const m = c.computedMovement();
    this.grounded = c.computedGrounded();
    if (this.vel.y > 0 && m.y < want.y * 0.5) this.vel.y = 0; // bonk ceiling
    // lose the speed that pushes into walls (not into walkable slopes) so we don't keep grinding on them
    for (let i = c.numComputedCollisions(); i-- > 0;) {
      const n = c.computedCollision(i)?.normal1;
      if (!n || Math.abs(n.y) > 0.6) continue;
      const into = this.vel.x * n.x + this.vel.z * n.z, h = n.x * n.x + n.z * n.z;
      if (into < 0 && h > 1e-6) { this.vel.x -= into * n.x / h; this.vel.z -= into * n.z / h; }
    }
    this.pos.x += m.x; this.pos.y += m.y; this.pos.z += m.z;
    // never fall through the terrain (fast skydive)
    const gy = this.groundY;
    if (this.pos.y < gy - 0.3) { this.pos.y = gy; this.vel.y = 0; this.grounded = true; }
    this.swimming = this.pos.y < WORLD.waterLevel - 1.2 && gy < WORLD.waterLevel - 1.2;
    if (this.swimming) this.grounded = false;
    this.body.setNextKinematicTranslation(this.pos);
    return this.grounded;
  }

  deploy() { this.mode = 'glide'; this.deployT = 0; this.sliding = false; if (this.crouching) this.setHeight(MOVE.height); this.crouching = false; }

  // free air under the feet (terrain, water or anything built)
  deployRoom() {
    const hit = raycast({ x: this.pos.x, y: this.pos.y - 0.05, z: this.pos.z }, { x: 0, y: -1, z: 0 }, MOVE.minDeploy + 1, this.collider);
    return hit ? Math.min(hit.dist, this.above) : this.above;
  }

  tryMantle() {
    if (this.mode !== 'ground' || this.crouching || this.swimming) return;
    const f = this.forward;
    const chest = { x: this.pos.x, y: this.pos.y + 1.0, z: this.pos.z };
    const hit = raycast(chest, { x: f.x, y: 0, z: f.z }, MOVE.radius + 0.6, this.collider);
    if (!hit || hit.tag?.kind === 'char') return;
    const d = hit.dist + 0.35;
    const from = { x: this.pos.x + f.x * d, y: this.pos.y + MOVE.mantleMax + 0.4, z: this.pos.z + f.z * d };
    const top = raycast(from, { x: 0, y: -1, z: 0 }, MOVE.mantleMax + 0.4, this.collider);
    if (!top || top.normal.y < 0.7) return;
    const rise = top.point.y - this.pos.y;
    if (rise < 0.5 || rise > MOVE.mantleMax) return;
    if (raycast({ x: top.point.x, y: top.point.y + 0.05, z: top.point.z }, { x: 0, y: 1, z: 0 }, MOVE.height, this.collider)) return;
    this.mode = 'mantle';
    this.mantle = { t: 0, from: this.pos.clone(), to: new THREE.Vector3(top.point.x, top.point.y + 0.02, top.point.z) };
    this.vel.set(0, 0, 0);
  }

  tickMantle(dt) {
    const m = this.mantle;
    m.t += dt / 0.35;
    const t = Math.min(1, m.t);
    const up = Math.min(1, t * 1.6), fw = Math.max(0, (t - 0.4) / 0.6);
    this.pos.set(m.from.x + (m.to.x - m.from.x) * fw, m.from.y + (m.to.y - m.from.y) * up, m.from.z + (m.to.z - m.from.z) * fw);
    this.body.setNextKinematicTranslation(this.pos);
    if (t >= 1) { this.mode = 'ground'; this.grounded = true; this.airTop = this.pos.y; this.jumped = false; this.vel.y = 0; }
  }

  // visual update (every render frame)
  animate(dt, emote) {
    const a = this.avatar;
    a.root.position.copy(this.pos);
    if (this.mode === 'dead') { a.root.rotation.z = 0; a.tilt = 0; a.play('dead', 0.2); a.upper = null; a.update(dt); return; }
    a.root.rotation.y = this.yaw + Math.PI;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moveSpeed = hs;
    let st = 'idle', ts = 1, fade = 0.15, bodyOff = 0;
    a.twist = 0;
    a.land = this.grounded && this.mode === 'ground' ? Math.sin(Math.min(1, this.landT / 0.2) * Math.PI) * 0.8 : 0;
    // free fall: belly-down when pushing forward (tipping head-down as you look down), upright spread when not.
    // Gliding: the glider banks into turns and the body swings out under it, hanging from the handles.
    const sky = this.mode === 'skydive', glide = this.mode === 'glide';
    const turn = sky || glide ? clamp(angleDiff(this.lastYaw ?? this.yaw, this.yaw) / Math.max(dt, 1e-3) * 0.6 - this.steer, -1, 1) : 0;
    this.lastYaw = this.yaw;
    this.bank = damp(this.bank, turn, 4, dt);
    this.tilt = damp(this.tilt, sky ? (this.skyFwd ? 80 + clamp(-this.pitch, 0, 1.4) / 1.4 * 85 : 12) * Math.PI / 180 : 0, 7, dt);
    a.tilt = this.tilt;
    const roll = glide ? -this.bank * 0.45 + Math.sin(performance.now() * 0.0022) * 0.06 : sky ? -this.bank * 0.17 : 0, hang = glide ? 2.4 : 0;
    // glider is parented to the body and turned π about Y, so its roll axis is flipped: undo the body swing, keep 0.26 of the bank
    this.gliderRoll = glide ? this.bank * 0.26 + roll : 0;
    a.root.rotation.z = roll;
    if (roll && hang) { // swing about the handles, not the feet
      const ox = hang * Math.sin(roll), ry = a.root.rotation.y;
      a.root.position.x += ox * Math.cos(ry); a.root.position.y += hang * (1 - Math.cos(roll)); a.root.position.z -= ox * Math.sin(ry);
    }
    // short hops off bumps and ramps edges stay in the run cycle; real jumps and drops use jump/fall
    const air = !this.grounded && !this.swimming && this.mode === 'ground' && (this.jumped || this.airT > 0.18);
    if (sky) st = this.skyFwd ? 'skydive' : 'skyfloat';
    else if (glide) st = 'glide';
    else if (this.mode === 'mantle') st = 'jump';
    else if (this.swimming) { if (this.swimJump) st = this.vel.y > 0 ? 'jump' : 'fall'; else { st = hs > 0.6 ? 'swim' : 'tread'; fade = 0.3; } }
    else if (this.sliding) st = 'slide';
    else if (air && this.airT > MOVE.fallFlail) { st = 'flail'; fade = 0.35; }
    else if (air) { st = this.jumped && this.vel.y > 1 ? 'jump' : 'fall'; fade = st === 'fall' && a.state === 'jump' ? 0.3 : 0.12; }
    else if (hs > 0.5) {
      // strafe/backpedal: twist hips toward travel, play backwards when moving back
      const travel = Math.atan2(-this.vel.x, -this.vel.z);
      let rel = angleDiff(this.yaw, travel);
      const back = Math.abs(rel) > Math.PI / 2 + 0.2;
      if (back) { rel = angleDiff(Math.PI, rel); ts = -1; }
      if (this.crouching) {
        st = 'crouchWalk'; a.twist = clamp(rel, -1, 1) * 0.65; // crouch strafe: legs shuffle sideways, body stays on the camera
        ts *= hs / MOVE.crouch;
      } else {
        st = this.sprinting ? 'sprint' : 'jog';
        // forward diagonals turn the whole body toward travel; aiming or holding a gun keeps the chest on the aim (hips only),
        // and so do pure strafes and backpedals
        const gun = a.upper === 'rifle' || a.upper === 'pistol';
        if (this.sprinting || (!back && Math.abs(rel) < 1.1 && !this.ads && !gun)) bodyOff = clamp(rel, -0.7, 0.7);
        else a.twist = clamp(rel, -1, 1) * 0.65;
        ts *= hs / (this.sprinting ? MOVE.sprint : MOVE.jog);
      }
    } else if (this.crouching) st = 'crouch'; else if (emote) st = `emote_${emote}`;
    this.bodyOff = damp(this.bodyOff ?? 0, bodyOff, 10, dt);
    a.root.rotation.y += this.bodyOff;
    a.play(st, fade, ts);
    a.aimPitch = this.pitch;
    a.update(dt);
  }

  dispose() {
    this.scene.remove(this.avatar.root);
    this.avatar.mesh.geometry.dispose();
    removeCollider(this.collider);
    world.removeRigidBody(this.body);
  }
}

// ---------- camera ----------
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.dist = CAMERA.dist; this.fov = CAMERA.fov; this.baseFov = CAMERA.fov;
    this.aim = new THREE.Vector3(); this.dir = new THREE.Vector3();
    this.shake = 0; this.orbitYaw = 0; this.freeOrbit = false;
    this.scopeT = 0; this.scoped = false; // scoped: zoomed all the way into a scope (first person, overlay on)
  }

  update(ch, dt, { ads = false, scope = false, extraDist = 0 } = {}) {
    const cam = this.camera;
    const yaw = ch.yaw + (this.freeOrbit ? this.orbitYaw : 0), pitch = ch.pitch;
    const dir = this.dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const air = ch.mode === 'skydive' || ch.mode === 'glide' || ch.mode === 'bus';
    this.scopeT = scope ? this.scopeT + dt : 0;
    this.scoped = this.scopeT > 0.12;
    const airDist = ch.mode === 'skydive' ? CAMERA.skydiveDist : ch.mode === 'glide' ? CAMERA.glideDist : ch.mode === 'bus' ? 4 + extraDist : 0;
    const wantDist = (scope ? 0 : ads ? CAMERA.adsDist : CAMERA.dist) + airDist - (ch.sliding ? 0.3 : 0);
    this.dist = this.scoped ? 0 : damp(this.dist, wantDist, 12, dt);
    // FOV settings are horizontal (the same view on any screen shape); three.js wants the vertical angle
    this.fov = damp(this.fov, scope ? CAMERA.scopeFov : ads ? this.baseFov * (CAMERA.adsFov / CAMERA.fov) : this.baseFov, 14, dt);
    const vfov = 2 * Math.atan(Math.tan(this.fov * Math.PI / 360) / cam.aspect) * 180 / Math.PI;
    if (Math.abs(cam.fov - vfov) > 0.01) { cam.fov = vfov; cam.updateProjectionMatrix(); }
    // shoulder and height blend (landing, crouching), except into the scope, which is instant
    const wantSh = air || scope ? 0 : CAMERA.shoulder, wantPy = CAMERA.pivotY - (ch.sliding ? 0.9 : ch.crouching ? 0.45 : 0) + (air ? 1 : 0);
    this.sh = scope || this.sh === undefined ? wantSh : damp(this.sh, wantSh, 9, dt);
    this.py = this.py === undefined ? wantPy : damp(this.py, wantPy, 9, dt);
    const sh = this.sh, pivotY = this.py;
    const px = ch.pos.x + rx * sh, py = ch.pos.y + pivotY, pz = ch.pos.z + rz * sh;
    // spring arm: pull in when something is between pivot and camera
    const back = { x: -dir.x, y: -dir.y, z: -dir.z };
    const hit = raycast({ x: px, y: py, z: pz }, back, this.dist + 0.3, ch.collider, (c) => !c.isSensor());
    const d = this.scoped ? 0 : hit ? Math.max(0.2, hit.dist - 0.3) : this.dist; // scoped: eye at the head (body is hidden)
    cam.position.set(px - dir.x * d, py - dir.y * d, pz - dir.z * d);
    if (ch.swimming) cam.position.y = Math.max(cam.position.y, WORLD.waterLevel + 0.3); // never dip under the surface
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 3);
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.15; cam.position.y += (Math.random() - 0.5) * this.shake * 0.15;
    }
    cam.lookAt(cam.position.x + dir.x, cam.position.y + dir.y, cam.position.z + dir.z);
    // aim point: what the crosshair is on
    const o = { x: cam.position.x, y: cam.position.y, z: cam.position.z };
    const ah = raycast(o, { x: dir.x, y: dir.y, z: dir.z }, 1500, ch.collider, (c) => !c.isSensor());
    if (ah && ah.dist > d + 0.4) this.aim.set(ah.point.x, ah.point.y, ah.point.z);
    else this.aim.set(o.x + dir.x * 1500, o.y + dir.y * 1500, o.z + dir.z * 1500);
    this.aimHit = ah;
  }
}
