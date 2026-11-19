// One match: characters, their hands, damage/eliminations, player input. Bus, storm and bots plug in here.
import * as THREE from 'three';
import { MOVE } from './config.js';
import { world } from './physics.js';
import { getHeight, resetProps } from './world/terrain.js';
import { Character, emptyInput } from './player/controller.js';
import { Hands, emptyIntent, PIECES, updateProjectiles } from './player/hands.js';
import { applyDamage } from './combat/rules.js';
import { input } from './input.js';
import { settings } from './settings-store.js';

export function createMatch({ scene, rig, fx, building, pois, loadout, events = {} }) {
  const chars = [];
  let time = 0;
  const ctx = {
    building, fx, chars,
    hurt(t, dmg, attacker, info = {}) {
      if (!t.alive || dmg <= 0) return;
      const r = applyDamage(t.health, t.shield, dmg);
      t.health = r.health; t.shield = r.shield; t.lastHurt = time; t.lastAttacker = attacker;
      if (attacker === player) events.damage?.(info.point, Math.round(dmg), { shield: r.toShield > 0 && !r.toHealth, head: info.head });
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

  function eliminate(t, by, cls) {
    t.alive = false; t.mode = 'dead'; t.health = 0;
    t.vel.set(0, 0, 0);
    if (by && by !== t) by.kills++;
    t.hands.setMode('combat');
    events.eliminated?.(t, by, cls);
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
  }

  // ---- fixed tick ----
  function tick(dt) {
    time += dt;
    readPlayer();
    hands.eye.copy(rig.camera.position); hands.dir.copy(rig.dir); hands.aimPoint.copy(rig.aim);
    hands.tick(it, dt);
    inp.ads = hands.ads;
    for (const ch of chars) {
      if (ch === player) ch.move(inp, dt);
      else ch.move(ch.inp, dt);
    }
    updateProjectiles(dt, fx);
    building.update(dt);
    world.step();
  }

  // ---- render frame ----
  function frame(dt, look) {
    look.pitch -= hands.kick; hands.kick = 0;
    inp.yaw = look.yaw; inp.pitch = look.pitch;
    for (const ch of chars) { ch.animate(dt, ch === player ? look.emote : null); ch.hands.updateVisual(ch === player && !!look.emote); }
    const cur = hands.inv.current;
    rig.update(player, dt, { ads: hands.ads, scope: hands.ads && cur?.cls === 'sniper' });
    fx.update(dt);
  }

  function spawnPlayer(x, z) {
    player.teleport(x, getHeight(x, z) + 1, z);
    player.mode = 'ground';
  }

  function reset() {
    building.reset(); resetProps();
    pois.build(building);
    for (const ch of chars) { ch.health = 100; ch.shield = 0; ch.alive = true; ch.kills = 0; ch.hands.inv.reset(); }
  }

  return { chars, player, hands, ctx, tick, frame, spawnPlayer, reset, get time() { return time; } };
}
