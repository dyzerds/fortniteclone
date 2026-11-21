// What a character does with its hands: harvest, build, edit, shoot, reload, heal.
// Shared by player and bots: the owner fills an intent and the aim (eye, dir, aimPoint) every fixed tick.
import * as THREE from 'three';
import { BUILD_COST, CONSUMABLES, HARVEST, MATERIALS, MOVE, WEAPONS } from '../config.js';
import { raycast } from '../physics.js';
import { damageProp } from '../world/terrain.js';
import { Inventory, healResult, weaponDamage } from '../combat/rules.js';
import { weaponModel, pickaxeModel, consumableModel, gliderModel } from '../models.js';
import { wrapFor } from '../cosmetics.js';
import { settings } from '../settings-store.js';

export const emptyIntent = () => ({
  fire: false, fireHeld: false, fireUp: false, alt: false, altHeld: false,
  reload: false, slot: -1, scroll: 0, build: null, edit: false, matNext: false,
});

export const PIECES = ['wall', 'floor', 'ramp', 'cone'];
const MAT_ORDER = ['wood', 'brick', 'metal'];
const PROP_MAT = { tree: 'wood', rock: 'brick', metal: 'metal' };
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();

export const projectiles = []; // sniper rounds in flight

// random direction inside a cone around dir
function spreadDir(dir, spread, out) {
  if (spread <= 0) return out.copy(dir);
  _a.set(dir.z, 0, -dir.x); if (_a.lengthSq() < 1e-6) _a.set(1, 0, 0); _a.normalize();
  _b.crossVectors(dir, _a);
  const ang = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
  return out.copy(dir).addScaledVector(_a, Math.cos(ang) * r).addScaledVector(_b, Math.sin(ang) * r).normalize();
}

export class Hands {
  constructor(ch, ctx) {
    this.ch = ch; this.ctx = ctx; // ctx: { building, fx, chars, hurt(target, dmg, attacker, info), onHit?, onGain?, sound? }
    this.inv = new Inventory();
    this.mode = 'combat'; // combat | build | edit
    this.piece = 'wall'; this.rot = 0; this.mat = 'wood';
    this.eye = new THREE.Vector3(); this.dir = new THREE.Vector3(0, 0, -1); this.aimPoint = new THREE.Vector3();
    this.cool = 0; this.swingT = -1; this.combo = 1; this.weak = null; this.turboT = 0;
    this.edit = null; // { p, sel, paint, back }
    this.reloadT = 0; this.useT = 0; this.bloom = 0; this.kick = 0; this.ads = false;
    this.held = null; this.heldKey = ''; this.models = new Map();
    this.target = null;
  }

  get spread() {
    const cur = this.inv.current;
    if (cur?.kind !== 'weapon') return 0;
    const w = WEAPONS[cur.cls], ch = this.ch;
    const moving = Math.hypot(ch.vel.x, ch.vel.z) > 1 || !ch.grounded;
    const s = Math.min(w.spreadMax, w.spreadMin + this.bloom + (moving ? w.spreadMove : 0));
    return this.ads ? s * w.adsMul : s;
  }

  cancel() { this.reloadT = 0; this.useT = 0; this.swingT = -1; }

  setMode(m) {
    if (this.mode === 'edit' && m !== 'edit') this.endEdit(false);
    if (m !== 'build' && !this.ch.isBot) this.ctx.building.showGhost(null);
    this.mode = m;
  }

  tick(it, dt) {
    const ch = this.ch, inv = this.inv;
    this.cool -= dt; this.turboT -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 0.2);
    if (!ch.alive || ch.mode !== 'ground' || ch.swimming) {
      if (this.mode !== 'combat') this.setMode('combat');
      this.cancel(); this.ads = false; ch.speedMul = 1;
      return;
    }
    if (it.slot >= 0 || (it.scroll && this.mode === 'combat')) {
      this.cancel();
      if (it.slot >= 0) inv.select(it.slot); else inv.cycle(it.scroll);
      this.setMode('combat');
    }
    if (it.build) { this.cancel(); this.setMode('build'); this.piece = it.build; }
    if (it.edit) { if (this.mode === 'edit') this.endEdit(true); else this.startEdit(); }

    if (this.mode === 'build') this.tickBuild(it);
    else if (this.mode === 'edit') this.tickEdit(it);
    else {
      const cur = inv.current;
      if (!cur) this.tickPickaxe(it, dt);
      else if (cur.kind === 'heal') this.tickHeal(it, dt, cur);
      else this.tickGun(it, dt, cur);
    }
    const cur = inv.current;
    // reloading a scoped weapon drops you out of the scope
    this.ads = this.mode === 'combat' && it.altHeld && cur?.kind === 'weapon' && !(this.reloadT > 0 && WEAPONS[cur.cls].scope);
    ch.speedMul = this.useT > 0 ? 0.6 : 1;
  }

  // ---------- building ----------
  tickBuild(it) {
    const { building } = this.ctx, inv = this.inv;
    if (it.alt || it.matNext) this.mat = MAT_ORDER[(MAT_ORDER.indexOf(this.mat) + 1) % 3];
    if (it.reload) this.rot = (this.rot + 1) % 4;
    if (it.scroll) this.piece = PIECES[(PIECES.indexOf(this.piece) + it.scroll + 4) % 4];
    const t = this.target = building.target(this.ch, this.piece, this.rot);
    const ok = t.valid && inv.mats[this.mat] >= BUILD_COST;
    if (!this.ch.isBot) building.showGhost(t.spec, ok);
    const want = it.fire || (it.fireHeld && this.turboT <= 0 && (this.ch.isBot || settings.turboBuild === 'On'));
    if (want && ok) this.placePiece(t.spec);
  }

  placePiece(spec) {
    const { building, chars } = this.ctx;
    this.inv.spendMat(this.mat, BUILD_COST);
    const p = building.place(spec, this.mat, { owner: this.ch });
    building.unstick(chars, p);
    this.turboT = 0.08;
    this.ctx.sound?.('build', this.ch);
    return p;
  }

  // ---------- edit ----------
  startEdit() {
    const hit = raycast(this.eye, this.dir, 9, this.ch.collider);
    const p = hit?.tag?.kind === 'piece' ? hit.tag.ref : null;
    if (!p || p.owner !== this.ch || p.type === 'cone') return;
    const back = this.mode;
    this.cancel(); this.setMode('edit');
    this.edit = { p, sel: [...p.tiles], paint: null, back };
    this.ctx.building.showEdit(p, this.edit.sel);
  }

  tickEdit(it) {
    const e = this.edit, b = this.ctx.building, bx = e.p.box;
    const far = this.ch.pos.distanceTo(_v.set((bx.min[0] + bx.max[0]) / 2, (bx.min[1] + bx.max[1]) / 2, (bx.min[2] + bx.max[2]) / 2)) > 10;
    if (e.p.dead || far) return this.endEdit(false);
    if (it.alt) { e.sel.fill(1); return this.endEdit(true); } // reset
    const tile = b.tileUnderRay(e.p, this.eye, this.dir);
    if (it.fire && tile >= 0) e.paint = e.sel[tile] ? 0 : 1;
    if (it.fireHeld && e.paint !== null && tile >= 0 && e.sel[tile] !== e.paint) { e.sel[tile] = e.paint; b.showEdit(e.p, e.sel); }
    if (it.fireUp && e.paint !== null) { e.paint = null; if (settings.editRelease === 'On') this.endEdit(true); }
  }

  endEdit(apply) {
    const e = this.edit;
    if (!e) return;
    this.edit = null;
    const b = this.ctx.building;
    b.hideEdit(e.p);
    if (apply && !e.p.dead && e.sel.some(Boolean) && e.sel.some((v, i) => v !== e.p.tiles[i])) { b.setTiles(e.p, e.sel); this.ctx.sound?.('edit', this.ch); }
    this.mode = e.back === 'edit' ? 'combat' : e.back;
  }

  // ---------- harvesting ----------
  tickPickaxe(it, dt) {
    if (this.swingT >= 0) {
      const prev = this.swingT;
      this.swingT += dt;
      if (prev < HARVEST.hitAt && this.swingT >= HARVEST.hitAt) this.harvestHit();
      if (this.swingT > 0.5) this.swingT = -1;
    }
    if (it.fireHeld && this.cool <= 0) { this.cool = HARVEST.swing; this.swingT = 0; this.combo ^= 1; this.ch.avatar.swing(this.combo); }
  }

  harvestHit() {
    const ch = this.ch, { fx } = this.ctx;
    const chest = _a.set(ch.pos.x, ch.pos.y + 1.2, ch.pos.z);
    const hit = raycast(this.eye, this.dir, this.eye.distanceTo(chest) + HARVEST.reach, ch.collider);
    if (!hit) return;
    const point = _v.copy(hit.point);
    if (point.distanceTo(chest) > HARVEST.reach + 0.6) return;
    const tag = hit.tag;
    if (tag?.kind === 'char') {
      if (tag.ref.alive) this.ctx.hurt(tag.ref, HARVEST.charDmg, ch, { point: point.clone(), cls: 'pickaxe' });
      return;
    }
    if (tag?.kind !== 'prop' && tag?.kind !== 'piece') { fx.puff(point, '#d8c9a8', 0.5, 0.25); return; }
    const ref = tag.ref, isProp = tag.kind === 'prop';
    const crit = this.weak?.ref === ref && this.weak.point.distanceTo(point) < 0.55;
    const dmg = HARVEST.structDmg * (crit ? HARVEST.critMult : 1);
    const broke = isProp ? damageProp(ref, dmg) : this.ctx.building.damage(ref, dmg);
    const mat = isProp ? PROP_MAT[ref.kind] : ref.owner ? null : ref.mat; // other players' builds give nothing
    if (mat) {
      const n = this.inv.addMat(mat, HARVEST.yield[isProp ? ref.kind : mat] * (crit ? 2 : 1));
      if (n) this.ctx.onGain?.(this, mat, n);
    }
    const col = MATERIALS[mat ?? ref.mat]?.color ?? '#cfcfcf';
    fx.burst(point, col, crit ? 10 : 5, 0.14, 4);
    if (crit) fx.puff(this.weak.point, '#bff6ff', 1.2, 0.18);
    this.ctx.onHit?.(this, point.clone(), dmg, { kind: 'struct', crit, ref, pick: true });
    this.ctx.sound?.(crit ? 'crit' : 'harvest', ch);
    if (broke) { fx.burst(point, col, 14, 0.18, 6); this.weak = null; return; }
    // next weak point: random spot near the hit, on the hit surface
    _n.set(hit.normal.x, hit.normal.y, hit.normal.z);
    _a.set(-_n.z, 0, _n.x); if (_a.lengthSq() < 0.01) _a.set(1, 0, 0); _a.normalize();
    _b.crossVectors(_n, _a);
    const ang = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.4;
    this.weak = { ref, normal: _n.clone(), point: point.clone().addScaledVector(_a, Math.cos(ang) * r).addScaledVector(_b, Math.sin(ang) * r * 0.8).addScaledVector(_n, 0.03) };
  }

  // ---------- guns ----------
  tickGun(it, dt, cur) {
    const w = WEAPONS[cur.cls], inv = this.inv;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) inv.reload(cur);
      return;
    }
    if (it.reload && cur.mag < w.mag && inv.ammo[w.ammo] > 0) return this.startReload(cur);
    if (!(w.auto ? it.fireHeld : it.fire) || this.cool > 0) return;
    if (cur.mag <= 0) {
      if (inv.ammo[w.ammo] > 0) this.startReload(cur); else this.ctx.sound?.('empty', this.ch);
      return;
    }
    this.fire(cur, w);
    if (cur.mag === 0 && inv.ammo[w.ammo] > 0) this.startReload(cur);
  }

  startReload(cur) { this.reloadT = WEAPONS[cur.cls].reload[cur.rarity]; this.ctx.sound?.('reload', this.ch); }

  fire(cur, w) {
    const spread = this.spread;
    cur.mag--;
    this.cool = 1 / w.rate;
    this.bloom = Math.min(w.spreadMax, this.bloom + w.spreadShot);
    this.kick += w.recoil;
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    this.ctx.fx.puff(muzzle, '#ffe08a', 0.35, 0.06);
    this.ctx.sound?.(`shot_${cur.cls}`, this.ch);
    if (w.projectile) {
      spreadDir(this.dir, spread, _d);
      projectiles.push({ owner: this, cls: cur.cls, rarity: cur.rarity, pos: this.eye.clone(), vel: _d.clone().multiplyScalar(w.projectile), dist: 0, from: muzzle });
      return;
    }
    const acc = new Map();
    for (let i = 0; i < (w.pellets ?? 1); i++) {
      spreadDir(this.dir, spread, _d);
      const hit = raycast(this.eye, _d, w.range, this.ch.collider);
      const end = hit ? _v.copy(hit.point) : _v.copy(this.eye).addScaledVector(_d, w.range);
      if (i < 4) this.ctx.fx.tracer(muzzle, end);
      if (hit) this.collect(hit, cur.cls, cur.rarity, acc);
    }
    this.deliver(acc, cur.cls);
  }

  // accumulate damage per thing hit (shotgun pellets add up into one number)
  collect(hit, cls, rarity, acc) {
    const tag = hit.tag, point = new THREE.Vector3().copy(hit.point);
    if (tag?.kind === 'char') {
      const t = tag.ref;
      if (!t.alive || t === this.ch) return;
      const head = point.y - t.pos.y > MOVE.headY * (t.height / MOVE.height);
      const a = acc.get(t) ?? { kind: 'char', dmg: 0, head: false, point };
      a.dmg += weaponDamage(cls, rarity, hit.dist, head); a.head ||= head;
      acc.set(t, a);
    } else if (tag?.kind === 'piece' || tag?.kind === 'prop') {
      const a = acc.get(tag.ref) ?? { kind: tag.kind, dmg: 0, point };
      a.dmg += weaponDamage(cls, rarity, hit.dist, false);
      acc.set(tag.ref, a);
      this.ctx.fx.burst(point, tag.kind === 'piece' ? MATERIALS[tag.ref.mat].color : '#b9a27a', 2, 0.08, 3);
    } else {
      this.ctx.fx.puff(point, '#e8dcc0', 0.4, 0.25);
    }
  }

  deliver(acc, cls) {
    for (const [ref, a] of acc) {
      if (a.kind === 'char') { this.ctx.hurt(ref, a.dmg, this.ch, { head: a.head, point: a.point, cls }); continue; }
      if (a.kind === 'piece') this.ctx.building.damage(ref, a.dmg);
      else damageProp(ref, a.dmg);
      this.ctx.onHit?.(this, a.point, a.dmg, { kind: 'struct', ref });
    }
  }

  // ---------- heals ----------
  tickHeal(it, dt, cur) {
    const ch = this.ch;
    if (this.useT > 0) {
      this.useT -= dt;
      if (this.useT > 0) return;
      const r = healResult(cur.id, ch.health, ch.shield);
      if (r) { ch.health = r.health; ch.shield = r.shield; this.inv.useOne(); this.ctx.sound?.('heal', ch); }
      return;
    }
    if (it.fireHeld && healResult(cur.id, ch.health, ch.shield)) { this.useT = CONSUMABLES[cur.id].time; this.ctx.sound?.('use', ch); }
  }

  // ---------- visuals (render frame) ----------
  muzzleWorld(out) {
    const h = this.held;
    if (h?.userData.muzzle) return h.localToWorld(out.copy(h.userData.muzzle));
    return out.set(this.ch.pos.x, this.ch.pos.y + 1.4, this.ch.pos.z);
  }

  model(key, cur) {
    if (!this.models.has(key)) {
      const m = key === 'pick' ? pickaxeModel(this.ch.cosmetics.pickaxe ?? 'pick')
        : cur.kind === 'heal' ? consumableModel(cur.id)
        : weaponModel(cur.cls, cur.rarity, wrapFor(this.ch.cosmetics, cur.cls));
      if (key === 'pick') m.rotation.x = -Math.PI / 2;
      this.models.set(key, m);
    }
    return this.models.get(key);
  }

  updateVisual(emoting = false) {
    const ch = this.ch, a = ch.avatar, cur = this.inv.current;
    let key = '', pose = null;
    if (ch.alive && ch.mode === 'ground' && !ch.swimming && !emoting) {
      if (this.mode !== 'combat') pose = 'build';
      else if (!cur) { key = 'pick'; pose = ch.sprinting ? null : 'pickaxe'; } // sprint: arms pump
      else if (cur.kind === 'heal') { key = `heal:${cur.id}`; pose = this.useT > 0 ? 'consume' : 'pickaxe'; }
      else { key = `w:${cur.cls}:${cur.rarity}`; pose = cur.cls === 'pistol' ? 'pistol' : 'rifle'; }
    }
    a.upper = pose;
    if (key !== this.heldKey) {
      this.held?.removeFromParent();
      this.held = key ? this.model(key, cur) : null;
      this.heldKey = key;
      if (this.held) (key.startsWith('w:') ? ch.scene : a.bones.RightHand).add(this.held);
    }
    if (this.held && key.startsWith('w:')) {
      // guns follow the hand but point at what the character aims at
      a.handWorld('Right', this.held.position);
      this.held.lookAt(_v.copy(this.held.position).multiplyScalar(2).sub(this.aimPoint));
      this.held.translateY(0.1); this.held.translateZ(-0.12);
    }
    const gliding = ch.mode === 'glide' && ch.alive;
    if (gliding && !this.glider) {
      const g = this.glider = gliderModel(ch.cosmetics.glider ?? 'sail');
      const bb = new THREE.Box3().setFromObject(g); // wing tips (glider space) for the contrails
      g.userData.tips = [new THREE.Vector3(bb.min.x, 0, bb.max.z), new THREE.Vector3(bb.max.x, 0, bb.max.z)];
      g.rotation.y = Math.PI; a.root.add(g);
    }
    if (this.glider) {
      this.glider.visible = gliding;
      // unfolds: hidden 0.5 s, then pops open with overshoot by 1.4 s
      const u = Math.min(1, Math.max(0, (ch.deployT - 0.5) / 0.9)), k = 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2;
      this.glider.scale.setScalar(Math.max(0.001, k));
      this.glider.position.y = 1.9 + 0.7 * u;
      this.glider.rotation.z = ch.gliderRoll;
    }
    if (!ch.isBot) {
      const wk = this.ctx.fx.weak, show = this.weak && key === 'pick' && (this.weak.ref.alive ?? !this.weak.ref.dead);
      wk.visible = !!show;
      if (show) { wk.position.copy(this.weak.point); wk.lookAt(_v.copy(this.weak.point).add(this.weak.normal)); }
    }
  }

  dispose() {
    this.held?.removeFromParent();
    for (const m of this.models.values()) m.traverse((o) => o.geometry?.dispose());
    this.models.clear();
  }
}

// sniper rounds: gravity drop, swept raycast each tick
export function updateProjectiles(dt, fx) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i], w = WEAPONS[p.cls];
    p.vel.y -= w.drop * dt;
    const step = p.vel.length() * dt;
    _d.copy(p.vel).normalize();
    const hit = raycast(p.pos, _d, step, p.owner.ch.collider);
    const end = hit ? _v.copy(hit.point) : _v.copy(p.pos).addScaledVector(p.vel, dt);
    fx.tracer(p.dist === 0 ? p.from : p.pos, end);
    p.dist += step;
    if (hit) {
      const acc = new Map();
      p.owner.collect({ ...hit, dist: p.dist }, p.cls, p.rarity, acc);
      p.owner.deliver(acc, p.cls);
    }
    if (hit || p.dist > w.range) projectiles.splice(i, 1);
    else p.pos.copy(end);
  }
}
