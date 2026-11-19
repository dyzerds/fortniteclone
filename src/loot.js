// Ground loot, chests and ammo boxes. Weapons/heals need Interact; ammo and materials are picked up by walking over them.
import * as THREE from 'three';
import { AMMO, CONSUMABLES, RARITIES, WEAPONS, WORLD } from './config.js';
import { raycast } from './physics.js';
import { getHeight, isLand } from './world/terrain.js';
import { weaponModel, consumableModel, ammoModel, materialModel, chestModel, ammoBoxModel } from './models.js';
import { glowTexture } from './textures.js';
import { settings } from './settings-store.js';

const CLASS_WEIGHTS = [['ar', 30], ['shotgun', 25], ['smg', 20], ['pistol', 15], ['sniper', 10]];
const RARITY_WEIGHTS = [40, 30, 18, 9, 3];
const HEAL_WEIGHTS = [['bandage', 35], ['shieldcell', 30], ['medkit', 15], ['shieldcore', 20]];
const VIEW = 90; // meshes beyond this distance are hidden (ponytail: distance cull instead of LOD/merging)

function weighted(list, r = Math.random()) {
  let t = r * list.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of list) if ((t -= w) <= 0) return k;
  return list[0][0];
}
export function rollWeapon(bonus = 0) {
  const cls = weighted(CLASS_WEIGHTS);
  let rarity = Math.min(4, Number(weighted(RARITY_WEIGHTS.map((w, i) => [i, w]))) + bonus);
  rarity = Math.max(rarity, WEAPONS[cls].minRarity ?? 0);
  return { kind: 'weapon', cls, rarity, mag: WEAPONS[cls].mag };
}
export const rollHeal = () => { const id = weighted(HEAL_WEIGHTS); return { kind: 'heal', id, count: id === 'bandage' ? 5 : id === 'shieldcell' ? 3 : 1 }; };
export const itemName = (it) => (it.kind === 'weapon' ? `${RARITIES[it.rarity].name} ${WEAPONS[it.cls].name}` : CONSUMABLES[it.id].name);
export const itemRarity = (it) => (it.kind === 'weapon' ? it.rarity : CONSUMABLES[it.id].rarity);

export function createLoot(scene, fx) {
  const ground = [];     // { item | ammo | mat, n, pos, mesh, beam, t, from, to, spin }
  const containers = []; // { kind: 'chest' | 'ammo', pos, mesh, glow, open, lid, lidT }
  const templates = new Map();
  const tpl = (key, make) => { if (!templates.has(key)) templates.set(key, make()); return templates.get(key).clone(); };
  const glowMat = (color) => new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const beamMats = RARITIES.map((r) => glowMat(r.color)), chestGlow = glowMat('#ffd84a');
  const groundY = (x, y, z) => {
    const hit = raycast({ x, y: y + 1.2, z }, { x: 0, y: -1, z: 0 }, 6, null, (c) => !c.isSensor());
    return hit && hit.tag?.kind !== 'char' ? hit.point.y : Math.max(getHeight(x, z), WORLD.waterLevel);
  };

  function meshFor(e) {
    if (e.item?.kind === 'weapon') return tpl(`w:${e.item.cls}:${e.item.rarity}`, () => weaponModel(e.item.cls, e.item.rarity));
    if (e.item) return tpl(`h:${e.item.id}`, () => consumableModel(e.item.id));
    if (e.ammo) return tpl(`a:${e.ammo}`, () => ammoModel(e.ammo));
    return tpl(`m:${e.mat}`, () => materialModel(e.mat));
  }

  // spawn an entry flying from `from` to a nearby resting spot
  function drop(e, from, spread = 1.5) {
    const a = Math.random() * Math.PI * 2, d = spread * (0.4 + Math.random() * 0.6);
    const x = from.x + Math.cos(a) * d, z = from.z + Math.sin(a) * d;
    e.from = new THREE.Vector3().copy(from);
    e.to = new THREE.Vector3(x, groundY(x, from.y, z) + 0.45, z);
    e.pos = e.from.clone(); e.t = 0; e.spin = Math.random() * 6;
    e.mesh = meshFor(e);
    if (e.item) {
      e.beam = new THREE.Sprite(beamMats[itemRarity(e.item)]);
      e.beam.scale.set(0.9, 2.6, 1); e.mesh.add(e.beam); e.beam.position.y = 0.9;
    }
    scene.add(e.mesh);
    ground.push(e);
    return e;
  }

  function remove(e) {
    const i = ground.indexOf(e);
    if (i >= 0) ground.splice(i, 1);
    e.mesh.removeFromParent();
  }

  function addContainer(kind, x, y, z) {
    const mesh = tpl(kind, kind === 'chest' ? chestModel : ammoBoxModel);
    const yaw = Math.random() * Math.PI * 2;
    mesh.position.set(x, y, z); mesh.rotation.y = yaw;
    scene.add(mesh);
    const c = { kind, pos: mesh.position, mesh, open: false, lid: mesh.getObjectByName('lid'), lidT: 0 };
    if (kind === 'chest') { c.glow = new THREE.Sprite(chestGlow); c.glow.scale.setScalar(2.2); c.glow.position.y = 0.5; mesh.add(c.glow); }
    containers.push(c);
  }

  function open(c, by) {
    if (c.open) return;
    c.open = true;
    if (c.glow) c.glow.visible = false;
    const at = new THREE.Vector3(c.pos.x, c.pos.y + 0.6, c.pos.z);
    if (c.kind === 'chest') {
      const w = rollWeapon(1);
      drop({ item: w }, at);
      drop({ ammo: WEAPONS[w.cls].ammo, n: AMMO[WEAPONS[w.cls].ammo].pickup }, at);
      drop({ item: rollHeal() }, at);
      drop({ mat: 'wood', n: 30 }, at);
      fx.burst(at, '#ffd84a', 12, 0.12, 5);
    } else {
      const types = Object.keys(AMMO);
      for (let k = 0; k < 2; k++) { const t = types[Math.floor(Math.random() * types.length)]; drop({ ammo: t, n: AMMO[t].pickup }, at); }
    }
    by?.ctx.sound?.('chest', by.ch);
  }

  // try to take a ground entry into a character's inventory; returns true when the entry is used up
  function take(e, hands) {
    const inv = hands.inv;
    if (e.item) {
      const out = inv.add(e.item);
      if (out === false) return false; // full (a heal stack may have been partly taken)
      if (out) { hands.cancel(); drop({ item: out }, hands.ch.pos, 0.8); }
    } else {
      e.n -= e.ammo ? inv.addAmmo(e.ammo, e.n) : inv.addMat(e.mat, e.n);
      if (e.n > 0) return false;
    }
    remove(e);
    hands.ctx.sound?.('pickup', hands.ch);
    return true;
  }

  // what the character would interact with right now (closest in front, within reach)
  const _f = new THREE.Vector3();
  function focus(ch) {
    let best = null, bestD = 2.6;
    _f.set(-Math.sin(ch.yaw), 0, -Math.cos(ch.yaw));
    const consider = (obj, p) => {
      const dx = p.x - ch.pos.x, dz = p.z - ch.pos.z, dy = p.y - ch.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > bestD || dy < -1 || dy > 2.2) return;
      if (d > 0.8 && (dx * _f.x + dz * _f.z) / d < 0.35) return; // must be roughly in front
      best = obj; bestD = d;
    };
    for (const c of containers) if (!c.open) consider(c, c.pos);
    for (const e of ground) if (e.item && e.t >= 1) consider(e, e.pos);
    return best;
  }

  function interact(hands) {
    const f = focus(hands.ch);
    if (!f) return false;
    if (f.kind === 'chest' || f.kind === 'ammo') open(f, hands); else take(f, hands);
    return true;
  }

  function dropAll(hands) {
    const inv = hands.inv, at = new THREE.Vector3().copy(hands.ch.pos).setY(hands.ch.pos.y + 0.8);
    inv.slots.forEach((it, i) => { if (it) drop({ item: it }, at, 2); inv.slots[i] = null; });
    for (const [t, n] of Object.entries(inv.ammo)) if (n > 0) drop({ ammo: t, n }, at, 2);
    for (const [m, n] of Object.entries(inv.mats)) if (n > 0) drop({ mat: m, n }, at, 2);
    inv.reset();
  }

  function populate(spots) {
    for (const s of spots) {
      if (s.kind === 'chest' || s.kind === 'ammo') addContainer(s.kind, s.x, s.y, s.z);
      else {
        const at = new THREE.Vector3(s.x, s.y + 0.5, s.z);
        if (Math.random() < 0.7) { const w = rollWeapon(); drop({ item: w }, at, 0.6); drop({ ammo: WEAPONS[w.cls].ammo, n: AMMO[WEAPONS[w.cls].ammo].pickup }, at, 1); }
        else drop({ item: rollHeal() }, at, 0.6);
      }
    }
    // some floor loot out in the wild so landing anywhere is viable
    for (let n = 0, tries = 0; n < 40 && tries < 400; tries++) {
      const x = (Math.random() - 0.5) * WORLD.islandRadius * 1.8, z = (Math.random() - 0.5) * WORLD.islandRadius * 1.8;
      if (!isLand(x, z)) continue;
      n++;
      const at = new THREE.Vector3(x, getHeight(x, z) + 0.5, z);
      drop(Math.random() < 0.6 ? { item: rollWeapon() } : { item: rollHeal() }, at, 0.3);
    }
  }

  function reset() {
    for (const e of ground) e.mesh.removeFromParent();
    for (const c of containers) c.mesh.removeFromParent();
    ground.length = 0; containers.length = 0;
  }

  // per fixed tick: settle drops, auto-pickup ammo/materials
  function tick(dt, chars) {
    for (const e of ground) {
      if (e.t < 1) {
        e.t = Math.min(1, e.t + dt / 0.5);
        e.pos.lerpVectors(e.from, e.to, e.t);
        e.pos.y += Math.sin(e.t * Math.PI) * 1.2;
      }
    }
    for (const ch of chars) {
      if (!ch.alive || ch.mode !== 'ground') continue;
      // ammo/mats always; weapons too for the player with Auto Pick Up on and a free slot
      const auto = !ch.isBot && settings.autoPickup === 'On' && ch.hands.inv.slots.includes(null);
      for (let i = ground.length - 1; i >= 0; i--) {
        const e = ground[i];
        if ((e.item && !(auto && e.item.kind === 'weapon')) || e.t < 1 || e.pos.distanceToSquared(ch.pos) > 2.2) continue;
        take(e, ch.hands);
      }
    }
    for (const c of containers) if (c.open && c.lid && c.lidT < 1) { c.lidT = Math.min(1, c.lidT + dt * 4); c.lid.rotation.x = -1.9 * c.lidT; }
  }

  // per render frame: animate and cull
  function frame(dt, cam) {
    const t = performance.now() * 0.001;
    for (const e of ground) {
      const vis = e.pos.distanceToSquared(cam) < VIEW * VIEW;
      e.mesh.visible = vis;
      if (!vis) continue;
      e.mesh.position.copy(e.pos);
      if (e.t >= 1) e.mesh.position.y += Math.sin(t * 2 + e.spin) * 0.06;
      e.mesh.rotation.y = t * 1.2 + e.spin;
    }
    chestGlow.opacity = 0.55 + Math.sin(t * 4) * 0.25;
    for (const c of containers) c.mesh.visible = c.pos.distanceToSquared(cam) < VIEW * VIEW * 1.5;
  }

  return { ground, containers, drop, take, focus, interact, dropAll, populate, reset, tick, frame, open };
}
