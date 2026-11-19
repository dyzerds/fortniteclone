// One match: sky barge drop, storm, characters and their hands, loot, bots, eliminations, victory/defeat.
import * as THREE from 'three';
import { MATCH, STORM, WORLD, POIS } from './config.js';
import { world } from './physics.js';
import { getHeight, isLand, resetProps } from './world/terrain.js';
import { Character, emptyInput } from './player/controller.js';
import { Hands, emptyIntent, PIECES, updateProjectiles, projectiles } from './player/hands.js';
import { applyDamage } from './combat/rules.js';
import { createLoot } from './loot.js';
import { stormPlan, stormAt, outside, createStormWall } from './storm.js';
import { BotBrain, botName } from './bots.js';
import { bargeModel } from './models.js';
import { OUTFITS, BACKBLINGS, PICKAXES, GLIDERS } from './cosmetics.js';
import { input } from './input.js';
import { settings } from './settings-store.js';
import { rng, pick } from './util.js';

export function createMatch({ scene, rig, fx, building, pois, loadout, events = {} }) {
  const chars = [];
  let time = 0, state = 'idle', circles = null, stormNow = null, stormTick = 0, result = null;
  const loot = createLoot(scene, fx);
  const wall = createStormWall(scene);
  const barge = bargeModel(); barge.visible = false; scene.add(barge);
  const bus = { from: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(), dir: new THREE.Vector3(), t: 0, dur: 1, yaw: 0, open: false };

  const ctx = {
    building, fx, chars,
    hurt(t, dmg, attacker, info = {}) {
      if (!t.alive || dmg <= 0 || state === 'over') return;
      const r = applyDamage(t.health, t.shield, dmg);
      t.health = r.health; t.shield = r.shield; t.lastHurt = time; t.lastAttacker = attacker;
      if (attacker === player && info.point) events.damage?.(info.point, Math.round(dmg), { shield: r.toShield > 0 && !r.toHealth, head: info.head });
      if (t === player) events.hurt?.(attacker, dmg);
      if (t.health <= 0) eliminate(t, attacker, info.cls);
    },
    onHit(h, point, dmg, info) { if (h === hands) events.damage?.(point, Math.round(dmg), { struct: true, crit: info.crit }); },
    onGain(h, mat, n) { if (h === hands) events.gain?.(mat, n); },
    sound: (name, ch) => events.sound?.(name, ch),
  };

  const player = new Character(scene, { name: 'You', outfit: loadout.outfit, backbling: loadout.backbling, cosmetics: loadout });
  const hands = new Hands(player, ctx);
  player.hands = hands;
  player.onFallDamage = (d) => ctx.hurt(player, d, null, { cls: 'fall' });
  chars.push(player);

  const alive = () => chars.reduce((n, c) => n + (c.alive ? 1 : 0), 0);
  const brainCtx = { player, chars, loot, storm: () => stormNow, time: () => time };

  function makeBots(n) {
    for (const c of chars.splice(1)) { c.hands.dispose(); c.dispose(); }
    for (let i = 0; i < n; i++) {
      const r = rng(i * 977 + Math.floor(Math.random() * 1e6));
      const cos = { pickaxe: pick(r, PICKAXES).id, glider: pick(r, GLIDERS).id };
      const b = new Character(scene, { name: botName(r), isBot: true, outfit: pick(r, OUTFITS).id, backbling: pick(r, BACKBLINGS).id, cosmetics: cos });
      b.hands = new Hands(b, ctx);
      b.brain = new BotBrain(b, brainCtx);
      b.onFallDamage = (d) => ctx.hurt(b, d, null, { cls: 'fall' });
      chars.push(b);
    }
  }

  function eliminate(t, by, cls) {
    t.alive = false; t.mode = 'dead'; t.health = 0; t.shield = 0; t.deadT = 0;
    t.vel.set(0, 0, 0);
    t.collider.setEnabled(false);
    t.hands.setMode('combat'); t.hands.cancel();
    if (by && by !== t) by.kills++;
    loot.dropAll(t.hands);
    const left = alive();
    events.eliminated?.(t, by, cls, left);
    if (t === player) finish(false, left + 1);
    else if (left === 1 && player.alive) finish(true, 1);
  }

  function finish(victory, place) {
    if (state === 'over') return;
    state = 'over';
    const xp = MATCH.xpBase + player.kills * MATCH.xpPerKill + Math.round(MATCH.xpPerPlace * (1 - (place - 1) / chars.length));
    result = { victory, place, kills: player.kills, xp, total: chars.length };
    events.over?.(result);
  }

  // ---- player input -> movement input + hands intent ----
  const inp = emptyInput(), it = emptyIntent();
  let sprintToggle = false;
  function readPlayer() {
    inp.mz = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0);
    inp.mx = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
    inp.jump = input.pressed('jump'); inp.jumpHeld = input.down('jump');
    if (settings.toggleSprint === 'On') { if (input.pressed('sprint')) sprintToggle = !sprintToggle; inp.sprint = sprintToggle; }
    else inp.sprint = input.down('sprint');
    inp.crouchPressed = input.pressed('crouch');
    if (settings.toggleCrouch === 'On') { if (inp.crouchPressed) inp.crouch = !inp.crouch; }
    else inp.crouch = input.down('crouch');
    if (inp.jump) inp.crouch = false;
    it.fire = input.codePressed('Mouse0'); it.fireHeld = input.codeDown('Mouse0'); it.fireUp = input.codeReleased('Mouse0');
    it.alt = input.codePressed('Mouse2'); it.altHeld = input.codeDown('Mouse2');
    it.reload = input.pressed('reload'); it.edit = input.pressed('edit'); it.matNext = input.pressed('material');
    it.build = PIECES.find((k) => input.pressed(k)) ?? null;
    it.slot = input.pressed('pickaxe') ? 0 : [1, 2, 3, 4, 5].find((i) => input.pressed(`slot${i}`)) ?? -1;
    it.scroll = input.takeWheel();
    if (input.pressed('interact') && player.alive) loot.interact(hands);
    if (input.pressed('map')) events.map?.();
  }

  // ---- start ----
  function start({ bots = Number(settings.bots), dev = false } = {}) {
    building.reset(); resetProps(); loot.reset(); projectiles.length = 0;
    loot.populate(pois.build(building));
    makeBots(bots);
    for (const ch of chars) {
      ch.health = 100; ch.shield = 0; ch.alive = true; ch.kills = 0; ch.deadT = 0; ch.lastHurt = -99; ch.lastAttacker = null;
      ch.collider.setEnabled(true); ch.hands.inv.reset(); ch.hands.setMode('combat'); ch.avatar.root.visible = true;
      ch.setHeight(1.85); ch.crouching = false; ch.sliding = false;
    }
    inp.crouch = false;
    time = 0; stormTick = 0; result = null;
    const r = rng(Math.floor(Math.random() * 1e9));
    circles = stormPlan(r, STORM, (x, z) => isLand(x, z));
    stormNow = stormAt(circles, STORM.phases, 0);
    // barge path: enters from a random side, crosses near the middle
    const a = r() * Math.PI * 2, off = (r() - 0.5) * 250;
    bus.dir.set(Math.cos(a + Math.PI), 0, Math.sin(a + Math.PI));
    const mid = new THREE.Vector3(-bus.dir.z * off, MATCH.busHeight, bus.dir.x * off);
    bus.from.copy(mid).addScaledVector(bus.dir, -720); bus.to.copy(mid).addScaledVector(bus.dir, 720);
    bus.dur = 1440 / MATCH.busSpeed; bus.t = 0; bus.yaw = Math.atan2(-bus.dir.x, -bus.dir.z);
    bus.pos.copy(bus.from);
    // bots pick a drop time and a landing spot (mostly towns)
    for (const b of chars) {
      if (!b.brain) continue;
      const poi = r() < 0.75 ? pick(r, POIS) : null;
      const L = poi ? { x: poi.x + (r() - 0.5) * poi.r, z: poi.z + (r() - 0.5) * poi.r } : (() => { for (;;) { const x = (r() - 0.5) * 800, z = (r() - 0.5) * 800; if (isLand(x, z)) return { x, z }; } })();
      b.brain.landing = L;
      // jump when the barge is closest to the landing spot, give or take
      const k = Math.max(0.1, Math.min(0.9, (new THREE.Vector3(L.x, MATCH.busHeight, L.z).sub(bus.from).dot(bus.dir)) / 1440 + (r() - 0.5) * 0.15));
      b.brain.dropT = k * bus.dur;
    }
    if (dev) { // skip the barge: everyone starts on the ground
      state = 'play';
      for (const b of chars) if (b.brain) { b.teleport(b.brain.landing.x, getHeight(b.brain.landing.x, b.brain.landing.z) + 1, b.brain.landing.z); b.mode = 'ground'; }
      return;
    }
    state = 'bus'; barge.visible = true;
    for (const ch of chars) { ch.mode = 'bus'; ch.avatar.root.visible = false; }
  }

  function exitBus(ch) {
    if (ch.mode !== 'bus') return;
    ch.teleport(bus.pos.x + (Math.random() - 0.5) * 3, bus.pos.y - 3, bus.pos.z + (Math.random() - 0.5) * 3);
    ch.vel.copy(bus.dir).multiplyScalar(MATCH.busSpeed * 0.4);
    ch.mode = 'skydive'; ch.avatar.root.visible = true;
    if (ch === player) events.jumped?.();
  }

  function spawnPlayer(x, z) {
    player.teleport(x, getHeight(x, z) + 1, z);
    player.mode = 'ground';
  }

  // ---- fixed tick ----
  function tick(dt) {
    if (state === 'idle') return;
    time += dt;
    readPlayer();
    if (state === 'bus') {
      bus.t += dt;
      const k = Math.min(1, bus.t / bus.dur);
      bus.pos.lerpVectors(bus.from, bus.to, k);
      bus.open = Math.hypot(bus.pos.x, bus.pos.z) < WORLD.islandRadius + 40;
      for (const ch of chars) {
        if (ch.mode !== 'bus') continue;
        ch.pos.copy(bus.pos); ch.body.setNextKinematicTranslation(ch.pos);
        if ((ch === player && inp.jump && bus.open) || (ch.brain && bus.t >= ch.brain.dropT) || k >= 1) exitBus(ch);
      }
      if (chars.every((c) => c.mode !== 'bus')) { state = 'play'; }
      inp.jump = false;
    }
    if (state === 'play') {
      stormNow = stormAt(circles, STORM.phases, time);
      stormTick += dt;
      if (stormTick >= 1) {
        stormTick -= 1;
        for (const ch of chars) {
          if (!ch.alive || ch.mode === 'bus' || !outside(stormNow, ch.pos.x, ch.pos.z)) continue;
          ch.health = Math.max(0, ch.health - stormNow.dps); ch.lastHurt = time;
          if (ch === player) events.hurt?.(null, stormNow.dps);
          if (ch.health <= 0) eliminate(ch, null, 'storm');
        }
      }
    }
    if (player.alive) {
      hands.eye.copy(rig.camera.position); hands.dir.copy(rig.dir); hands.aimPoint.copy(rig.aim);
      hands.tick(it, dt);
    }
    inp.ads = hands.ads;
    for (const ch of chars) {
      if (!ch.alive) { ch.deadT += dt; continue; }
      if (ch.brain) { ch.brain.tick(dt); ch.move(ch.inp, dt); }
      else ch.move(inp, dt);
    }
    updateProjectiles(dt, fx);
    loot.tick(dt, chars);
    building.update(dt);
    world.step();
  }

  // ---- render frame ----
  const camPos = new THREE.Vector3();
  function frame(dt, look) {
    if (state === 'idle') return;
    look.pitch -= hands.kick; hands.kick = 0;
    inp.yaw = look.yaw; inp.pitch = look.pitch;
    camPos.copy(rig.camera.position);
    for (const ch of chars) {
      const d2 = ch.pos.distanceToSquared(camPos);
      const vis = ch.mode !== 'bus' && d2 < 300 * 300 && (ch.alive || ch.deadT < 2.5);
      ch.avatar.root.visible = vis;
      if (!vis) { if (ch.hands.held) ch.hands.held.visible = false; continue; }
      if (ch.hands.held) ch.hands.held.visible = true;
      // far characters animate at a lower rate
      ch.animAcc = (ch.animAcc ?? 0) + dt;
      if (d2 > 80 * 80 && ch.animAcc < 0.1) continue;
      ch.animate(ch.animAcc, ch === player ? look.emote : null); ch.animAcc = 0;
      ch.hands.updateVisual(ch === player && !!look.emote);
    }
    if (state === 'bus' || barge.visible) {
      barge.position.copy(bus.pos); barge.rotation.y = bus.yaw;
      barge.rotation.z = Math.sin(time * 0.8) * 0.03;
      for (const s of [1, -1]) barge.getObjectByName(`prop${s}`).rotation.z += dt * 18 * s;
      if (state !== 'bus' && bus.t < bus.dur) { bus.t += dt; bus.pos.lerpVectors(bus.from, bus.to, Math.min(1, bus.t / bus.dur)); }
      if (bus.t >= bus.dur && state !== 'bus') barge.visible = false;
    }
    const cur = hands.inv.current;
    rig.update(player, dt, { ads: hands.ads, scope: hands.ads && cur?.cls === 'sniper', extraDist: player.mode === 'bus' ? 14 : 0 });
    if (stormNow) wall.update(stormNow, time);
    loot.frame(dt, camPos);
    fx.update(dt);
  }

  return {
    chars, player, hands, loot, ctx, tick, frame, start, spawnPlayer, exitBus,
    get time() { return time; }, get state() { return state; }, get storm() { return stormNow; }, get circles() { return circles; },
    get alive() { return alive(); }, get result() { return result; }, get bus() { return bus; },
    end() { state = 'idle'; barge.visible = false; },
  };
}
