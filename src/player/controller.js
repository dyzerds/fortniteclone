// Character movement (shared by player and bots) + third-person camera rig.
import * as THREE from 'three';
import { MOVE, CAMERA, PLAYER, WORLD } from '../config.js';
import { R, world, setTag, raycast, removeCollider } from '../physics.js';
import { getHeight } from '../world/terrain.js';
import { clamp, damp, angleDiff } from '../util.js';
import { Avatar } from './avatar.js';

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
    return true;
  }

  teleport(x, y, z) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.body.setTranslation(this.pos, true);
    this.body.setNextKinematicTranslation(this.pos);
    this.airTop = y;
  }

  get forward() { return _v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  get groundY() { return getHeight(this.pos.x, this.pos.z); }

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
      const above = this.pos.y - Math.max(this.groundY, WORLD.waterLevel);
      if (this.mode === 'skydive') {
        const dive = clamp(-this.pitch, 0, 1.2) / 1.2;
        const fall = MOVE.skydiveFall + (MOVE.skydiveDive - MOVE.skydiveFall) * dive * Math.max(0, inp.mz);
        this.vel.y = damp(this.vel.y, -fall, 2, dt);
        const sp = MOVE.skydiveSteer * (1 - dive * 0.4);
        this.vel.x = damp(this.vel.x, wx * sp, 1.6, dt); this.vel.z = damp(this.vel.z, wz * sp, 1.6, dt);
        if (above < MOVE.autoGlideHeight || (inp.jump && above > 25)) this.mode = 'glide';
      } else {
        this.vel.y = damp(this.vel.y, -MOVE.glideFall * (inp.mz > 0.1 ? 1.25 : 1), 3, dt);
        const sp = MOVE.glideSpeed * (inp.mz < -0.1 ? 0.45 : 1);
        const gx = fx * Math.max(0.35, inp.mz) * sp + rx * inp.mx * 9, gz = fz * Math.max(0.35, inp.mz) * sp + rz * inp.mx * 9;
        this.vel.x = damp(this.vel.x, gx, 1.5, dt); this.vel.z = damp(this.vel.z, gz, 1.5, dt);
      }
      const landed = this.applyMove(dt);
      if (landed || this.swimming) { this.mode = 'ground'; this.airTop = this.pos.y; this.landT = 0.25; }
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
    const wantCrouch = inp.crouch || this.sliding;
    if (wantCrouch !== this.crouching) {
      if (this.setHeight(wantCrouch ? MOVE.crouchHeight : MOVE.height) !== false) this.crouching = wantCrouch;
    }
    this.sprinting = inp.sprint && inp.mz > 0.1 && !this.crouching && !inp.ads && !this.swimming;

    if (this.sliding) {
      const vl = Math.hypot(this.vel.x, this.vel.z);
      const dx = this.vel.x / (vl || 1), dz = this.vel.z / (vl || 1);
      const slope = (this.groundY - getHeight(this.pos.x + dx, this.pos.z + dz)); // + when downhill
      let nv = vl - MOVE.slideFriction * dt + clamp(slope, -1, 1) * MOVE.slideSlopeAccel * dt;
      nv = Math.min(nv, 16);
      this.vel.x = dx * nv + wx * dt * 3; this.vel.z = dz * nv + wz * dt * 3;
      if (nv < MOVE.slideMin || !inp.crouch || !this.grounded) this.sliding = false;
    } else {
      let speed = this.swimming ? MOVE.swim : this.crouching ? MOVE.crouch : this.sprinting ? MOVE.sprint : MOVE.jog;
      if (inp.ads) speed *= 0.65;
      if (inp.mz < -0.1) speed *= 0.85;
      speed *= this.speedMul;
      const acc = this.grounded || this.swimming ? MOVE.accelGround : MOVE.accelAir;
      const tx = wx * speed, tz = wz * speed;
      const k = Math.min(1, acc * dt / Math.max(0.001, Math.hypot(tx - this.vel.x, tz - this.vel.z)));
      if (this.grounded || this.swimming || wl > 0.1) { this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k; }
    }

    if (this.swimming) {
      this.vel.y = damp(this.vel.y, (WORLD.waterLevel - 1.25 - this.pos.y) * 4, 6, dt);
      if (inp.jump && this.pos.y > WORLD.waterLevel - 1.5) this.vel.y = 6;
    } else if (this.grounded) {
      this.vel.y = Math.min(this.vel.y, 0) - 1; // stick to slopes
      if (inp.jump) {
        if (this.crouching && !this.sliding) { this.setHeight(MOVE.height); this.crouching = false; }
        this.vel.y = Math.sqrt(2 * MOVE.gravity * MOVE.jumpHeight);
        this.sliding = false; this.grounded = false;
      }
    } else {
      this.vel.y -= MOVE.gravity * dt;
      if (inp.jumpHeld && inp.mz > 0.3 && this.vel.y < 3) this.tryMantle();
    }
    if (inp.jump && !this.grounded && inp.mz > 0.3) this.tryMantle();
    if (this.mode === 'mantle') return;

    this.applyMove(dt);
    if (!this.grounded) this.airTop = Math.max(this.airTop, this.pos.y);
    if (this.grounded && !wasGrounded) {
      const drop = this.airTop - this.pos.y;
      if (drop > MOVE.fallSafe && !this.swimming) this.onFallDamage?.((drop - MOVE.fallSafe) * MOVE.fallDmgPerM);
      this.landT = 0.18;
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
    if (dt > 0) {
      // lose velocity into walls so we don't keep pushing
      if (Math.abs(m.x) < Math.abs(want.x) * 0.5) this.vel.x = m.x / dt;
      if (Math.abs(m.z) < Math.abs(want.z) * 0.5) this.vel.z = m.z / dt;
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
    if (t >= 1) { this.mode = 'ground'; this.grounded = true; this.airTop = this.pos.y; }
  }

  // visual update (every render frame)
  animate(dt, emote) {
    const a = this.avatar;
    a.root.position.copy(this.pos);
    if (this.mode === 'dead') { a.play('dead', 0.2); a.upper = null; a.update(dt); return; }
    a.root.rotation.y = this.yaw + Math.PI;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moveSpeed = hs;
    let st = 'idle', ts = 1;
    a.twist = 0;
    if (this.mode === 'skydive') st = 'skydive';
    else if (this.mode === 'glide') st = 'glide';
    else if (this.mode === 'mantle') st = 'jump';
    else if (this.swimming) st = 'swim';
    else if (this.sliding) st = 'slide';
    else if (!this.grounded && this.landT <= 0) st = this.vel.y > 0 ? 'jump' : 'fall';
    else if (this.crouching) st = hs > 0.5 ? 'crouchWalk' : 'crouch';
    else if (hs > 0.5) {
      st = this.sprinting ? 'sprint' : 'jog';
      // strafe/backpedal: twist hips toward travel, play backwards when moving back
      const travel = Math.atan2(-this.vel.x, -this.vel.z);
      let rel = angleDiff(this.yaw, travel);
      const back = Math.abs(rel) > Math.PI / 2 + 0.2;
      if (back) { rel = angleDiff(Math.PI, rel); ts = -1; }
      a.twist = clamp(rel, -1, 1) * 0.8;
      ts *= hs / (this.sprinting ? MOVE.sprint : MOVE.jog);
    } else if (emote) st = `emote_${emote}`;
    a.play(st, 0.15, ts);
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
  }

  update(ch, dt, { ads = false, scope = false, extraDist = 0 } = {}) {
    const cam = this.camera;
    const yaw = ch.yaw + (this.freeOrbit ? this.orbitYaw : 0), pitch = ch.pitch;
    const dir = this.dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const air = ch.mode === 'skydive' || ch.mode === 'glide' || ch.mode === 'bus';
    const wantDist = (scope ? 0.3 : ads ? CAMERA.adsDist : CAMERA.dist) + (air ? 4 + extraDist : 0);
    this.dist = damp(this.dist, wantDist, 12, dt);
    this.fov = damp(this.fov, scope ? CAMERA.scopeFov : ads ? this.baseFov * (CAMERA.adsFov / CAMERA.fov) : this.baseFov, 14, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    const sh = air ? 0 : CAMERA.shoulder * (scope ? 0 : 1);
    const pivotY = (ch.crouching ? CAMERA.pivotY - 0.45 : CAMERA.pivotY) + (air ? 1 : 0);
    const px = ch.pos.x + rx * sh, py = ch.pos.y + pivotY, pz = ch.pos.z + rz * sh;
    // spring arm: pull in when something is between pivot and camera
    const back = { x: -dir.x, y: -dir.y, z: -dir.z };
    const hit = raycast({ x: px, y: py, z: pz }, back, this.dist + 0.3, ch.collider, (c) => !c.isSensor());
    const d = hit ? Math.max(0.2, hit.dist - 0.3) : this.dist;
    cam.position.set(px - dir.x * d, py - dir.y * d, pz - dir.z * d);
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
