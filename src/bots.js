// Bot brains. Each bot fills a movement input and a hands intent, exactly like the player does.
// Goals in priority order: drop -> fight -> escape storm -> heal -> find a weapon -> harvest -> roam toward the zone.
import * as THREE from 'three';
import { BOT, WEAPONS, MOVE } from './config.js';
import { raycast } from './physics.js';
import { props } from './world/terrain.js';
import { emptyInput } from './player/controller.js';
import { emptyIntent } from './player/hands.js';
import { outside } from './storm.js';
import { settings } from './settings-store.js';
import { healResult } from './combat/rules.js';

const DIFF = {
  Easy: { err: 2.2, react: 1.7, build: 0.2, track: 0.6 },
  Normal: { err: 1, react: 1, build: 0.55, track: 1 },
  Hard: { err: 0.5, react: 0.6, build: 0.9, track: 1.5 },
};
const PREFER = { near: ['shotgun', 'smg', 'ar', 'pistol', 'sniper'], mid: ['ar', 'smg', 'pistol', 'sniper', 'shotgun'], far: ['sniper', 'ar', 'pistol', 'smg', 'shotgun'] };
const A = ['Sunny', 'Brisk', 'Mellow', 'Zippy', 'Cosmic', 'Rusty', 'Pebble', 'Frosty', 'Lucky', 'Sly', 'Turbo', 'Misty', 'Pixel', 'Noodle', 'Crispy'];
const B = ['Otter', 'Comet', 'Bramble', 'Gizmo', 'Maple', 'Sprocket', 'Puffin', 'Nimbus', 'Wombat', 'Pickle', 'Badger', 'Pepper', 'Mango', 'Quokka', 'Biscuit'];
export const botName = (r) => `${A[Math.floor(r() * A.length)]}${B[Math.floor(r() * B.length)]}${10 + Math.floor(r() * 89)}`;

const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const _v = new THREE.Vector3();

export class BotBrain {
  constructor(ch, m) {
    this.ch = ch; this.m = m; // m: { player, chars, loot, storm(), time() }
    ch.inp = emptyInput(); this.it = emptyIntent();
    this.d = DIFF[settings.difficulty] ?? DIFF.Normal;
    this.goal = null; this.enemy = null; this.los = false;
    this.thinkT = Math.random() * 0.3; this.reactT = 0;
    this.strafe = 1; this.strafeT = 0; this.stuckT = 0; this.avoidT = 0; this.avoidYaw = 0;
    this.buildCool = 0; this.jitter = new THREE.Vector3();
    this.dropT = 0; this.landing = null; this.task = ''; this.ignore = new Set(); this.breachT = 0;
  }

  // ---- slow decisions ----
  think() {
    const ch = this.ch, m = this.m, inv = ch.hands.inv, it = this.it;
    if (ch.mode === 'bus' || ch.mode === 'skydive' || ch.mode === 'glide') return;
    const storm = m.storm();
    // enemy: whoever hurt us, else the closest visible character
    const prev = this.enemy;
    this.enemy = null; this.los = false;
    let best = BOT.sight;
    const att = ch.lastAttacker;
    if (att?.alive && att !== ch && m.time() - ch.lastHurt < 3) { this.enemy = att; best = ch.pos.distanceTo(att.pos); }
    for (const o of m.chars) {
      if (o === ch || !o.alive || o.mode === 'bus') continue;
      const d = o.pos.distanceTo(ch.pos);
      if (d < best && this.canSee(o)) { if (prev !== o) this.reactT = (BOT.reaction[0] + Math.random() * (BOT.reaction[1] - BOT.reaction[0])) * this.d.react; best = d; this.enemy = o; }
    }
    if (this.enemy) this.los = this.canSee(this.enemy);
    this.jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2 * BOT.aimError * this.d.err);

    it.slot = -1; it.reload = false; it.build = null;
    // heal when hurt, only with an item that still does something (a shield cell stops at 50)
    const heal = (ch.health < 75 || ch.shield < 60) ? inv.slots.findIndex((s) => s?.kind === 'heal' && healResult(s.id, ch.health, ch.shield)) : -1;

    const want = this.enemy ? this.bestWeapon(best) : -1;
    if (this.enemy && (this.los || best < 40) && (want >= 0 || best < 6)) {
      this.task = 'fight';
      if (inv.sel !== want + 1) it.slot = want + 1;
      return;
    }
    const storming = outside(storm, ch.pos.x, ch.pos.z) || (storm.next && outside({ ...storm.next, r: storm.next.r * 0.9 }, ch.pos.x, ch.pos.z) && storm.left < 25);
    if (storming) { this.task = 'storm'; this.goal = { x: storm.next.x, z: storm.next.z }; if (inv.sel === 0 || inv.current?.kind === 'heal') it.slot = Math.max(0, this.bestWeapon(30) + 1); return; }
    if (heal >= 0) { this.task = 'heal'; if (inv.sel !== heal + 1) it.slot = heal + 1; this.goal = null; return; }
    const cur = inv.current;
    if (cur?.kind === 'weapon' && cur.mag < WEAPONS[cur.cls].mag && inv.ammo[WEAPONS[cur.cls].ammo] > 0) it.reload = true;

    const hasGun = inv.slots.some((s) => s?.kind === 'weapon');
    const lootGoal = this.nearestLoot(hasGun ? 25 : 120, !hasGun);
    if (lootGoal) {
      // give up on loot we cannot reach (inside a closed house, up a cliff)
      const key = lootGoal.entry ?? lootGoal.box;
      const gd = Math.hypot(lootGoal.x - ch.pos.x, lootGoal.z - ch.pos.z);
      if (this.goalKey !== key || gd < this.goalBest - 1) { this.goalKey = key; this.goalBest = gd; this.goalSince = this.m.time(); }
      else if (this.m.time() - this.goalSince > 7) this.ignore.add(key); // no progress for 7 s
      this.task = 'loot'; this.goal = lootGoal; return;
    }
    if (inv.mats.wood < 60 && !this.enemy) {
      const tree = this.nearestTree(45);
      if (tree) { this.task = 'harvest'; this.goal = { x: tree.x, z: tree.z, prop: tree }; if (inv.sel !== 0) it.slot = 0; return; }
    }
    this.task = 'roam';
    if (!this.goal || this.goal.entry || this.goal.prop || Math.hypot(this.goal.x - ch.pos.x, this.goal.z - ch.pos.z) < 4) {
      const n = storm.next, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * n.r * 0.7;
      this.goal = { x: n.x + Math.cos(a) * r, z: n.z + Math.sin(a) * r };
    }
    const g = this.bestWeapon(30);
    if (g >= 0 && inv.sel !== g + 1) it.slot = g + 1;
  }

  canSee(o) {
    const ch = this.ch;
    const from = { x: ch.pos.x, y: ch.pos.y + 1.5, z: ch.pos.z };
    const to = _v.set(o.pos.x - from.x, o.pos.y + 1.2 - from.y, o.pos.z - from.z);
    const d = to.length(); to.divideScalar(d);
    const hit = raycast(from, to, d + 0.5, ch.collider);
    return hit?.tag?.ref === o;
  }

  bestWeapon(dist) {
    const inv = this.ch.hands.inv;
    const order = dist < 14 ? PREFER.near : dist < 60 ? PREFER.mid : PREFER.far;
    for (const cls of order) {
      const i = inv.slots.findIndex((s) => s?.kind === 'weapon' && s.cls === cls && (s.mag > 0 || inv.ammo[WEAPONS[cls].ammo] > 0));
      if (i >= 0) return i;
    }
    return -1;
  }

  nearestLoot(range, weaponsOnly) {
    const ch = this.ch, { loot } = this.m;
    let best = null, bd = range;
    for (const e of loot.ground) {
      if (!e.item || e.t < 1 || this.ignore.has(e) || (weaponsOnly && e.item.kind !== 'weapon')) continue;
      if (e.item.kind === 'heal' && ch.hands.inv.slots.every(Boolean)) continue;
      if (e.item.kind === 'weapon' && ch.hands.inv.slots.some((s) => s?.kind === 'weapon' && s.cls === e.item.cls && s.rarity >= e.item.rarity)) continue;
      const d = e.pos.distanceTo(ch.pos);
      if (d < bd && Math.abs(e.pos.y - ch.pos.y) < 2.5) { bd = d; best = { x: e.pos.x, z: e.pos.z, entry: e }; } // no stairs pathing, so same floor only
    }
    for (const c of loot.containers) {
      if (c.open || c.kind !== 'chest' || this.ignore.has(c)) continue;
      const d = c.pos.distanceTo(ch.pos);
      if (d < bd && Math.abs(c.pos.y - ch.pos.y) < 2.5) { bd = d; best = { x: c.pos.x, z: c.pos.z, box: c }; }
    }
    return best;
  }

  // next point toward (gx, gz): loot inside a house goes through its door, around the house corners if needed
  route(gx, gz) {
    const p = this.ch.pos, inBox = (h, x, z, m = 0) => x > h.x0 - m && x < h.x1 + m && z > h.z0 - m && z < h.z1 + m;
    const hg = this.m.houses?.find((h) => inBox(h, gx, gz));
    const hb = this.m.houses?.find((h) => inBox(h, p.x, p.z, 0.3));
    // in the doorway lane: within 0.45 m of the door axis and 2.2 m of the wall (side: +1 outside, -1 inside)
    const lane = (h, side) => {
      const nx = (h.out[0] - h.in[0]) / 3.2, nz = (h.out[1] - h.in[1]) / 3.2, rx = p.x - (h.in[0] + h.out[0]) / 2, rz = p.z - (h.in[1] + h.out[1]) / 2;
      const depth = (rx * nx + rz * nz) * side;
      return Math.abs(rx * nz - rz * nx) < 0.45 && depth > -0.5 && depth < 2.2;
    };
    if (hb && hb !== hg) return lane(hb, -1) ? hb.out : hb.in; // leave a house by its door
    if (!hg || hb === hg) return [gx, gz];
    if (lane(hg, 1)) return hg.in;
    if (!crosses(hg, p.x, p.z, hg.out[0], hg.out[1])) return hg.out;
    // shortest way round: bot -> corner (-> next corner) -> door; corners sit 1.5 m off the walls
    const cs = [[hg.x0 - 1.5, hg.z0 - 1.5], [hg.x1 + 1.5, hg.z0 - 1.5], [hg.x1 + 1.5, hg.z1 + 1.5], [hg.x0 - 1.5, hg.z1 + 1.5]];
    const sees = (a, b) => !crosses(hg, a[0], a[1], b[0], b[1]), dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const toDoor = cs.map((c) => (sees(c, hg.out) ? dist(c, hg.out) : Math.min(...cs.map((c2) => (sees(c2, hg.out) && sees(c, c2) ? dist(c, c2) + dist(c2, hg.out) : Infinity)))));
    let best = hg.out, bd = Infinity;
    cs.forEach((c, i) => {
      if (dist(c, [p.x, p.z]) < 1.5 || !sees([p.x, p.z], c)) return; // not the corner we stand on
      const d = dist(c, [p.x, p.z]) + toDoor[i];
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  }

  // a build piece right ahead at knee height (low tiles stay when windows are cut)
  wallAhead(fx, fz) {
    const ch = this.ch;
    return raycast({ x: ch.pos.x, y: ch.pos.y + 0.6, z: ch.pos.z }, { x: fx, y: 0, z: fz }, 2.2, ch.collider)?.tag?.kind === 'piece';
  }

  nearestTree(range) {
    let best = null, bd = range * range;
    for (const p of props) {
      if (!p.alive || p.kind !== 'tree') continue;
      const d = (p.x - this.ch.pos.x) ** 2 + (p.z - this.ch.pos.z) ** 2;
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  // ---- every fixed tick ----
  tick(dt) {
    const ch = this.ch, inp = ch.inp, it = this.it, h = ch.hands;
    this.thinkT -= dt; this.reactT -= dt; this.breachT -= dt; this.buildCool -= dt; this.strafeT -= dt; this.avoidT -= dt;
    if (this.thinkT <= 0) {
      const far = this.m.player.pos.distanceTo(ch.pos) > BOT.farDist;
      this.thinkT = 1 / (far ? BOT.farThinkHz : BOT.thinkHz);
      this.think();
    } else { it.slot = -1; it.reload = false; }
    it.fire = it.fireHeld = false; it.build = null; it.edit = false;
    inp.jump = false; inp.mx = 0; inp.mz = 0; inp.sprint = false; inp.crouch = false;

    if (ch.mode === 'bus') return;
    if (ch.mode === 'skydive' || ch.mode === 'glide') {
      const L = this.landing, dx = L.x - ch.pos.x, dz = L.z - ch.pos.z, d = Math.hypot(dx, dz);
      inp.yaw = yawTo(dx, dz); inp.mz = d > 6 || ch.mode === 'skydive' ? 1 : 0; // W in free fall: diving needs it even right above the spot
      inp.pitch = ch.mode === 'skydive' ? (d < (ch.pos.y - MOVE.autoGlideHeight) * 0.6 ? -1.2 : -0.2) : -0.3;
      return;
    }

    const e = this.enemy;
    let yaw = inp.yaw, pitch = 0;
    if (this.task === 'fight' && e?.alive) {
      const dx = e.pos.x - ch.pos.x, dz = e.pos.z - ch.pos.z, d = Math.hypot(dx, dz);
      const tx = e.pos.x + this.jitter.x * d, ty = e.pos.y + 1.15 + this.jitter.y * d, tz = e.pos.z + this.jitter.z * d;
      h.eye.set(ch.pos.x, ch.pos.y + 1.5, ch.pos.z);
      h.aimPoint.set(tx, ty, tz);
      h.dir.copy(h.aimPoint).sub(h.eye).normalize();
      yaw = yawTo(dx, dz); pitch = Math.asin(h.dir.y);
      const cls = h.inv.current?.cls, ideal = !cls ? 1.2 : cls === 'shotgun' ? 6 : cls === 'sniper' ? 70 : 22;
      inp.mz = d > ideal + 6 ? 1 : d < ideal - 6 ? -1 : 0;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 0.5 + Math.random(); }
      inp.mx = this.strafe;
      if (Math.random() < 0.01) inp.jump = true;
      if (this.los && this.reactT <= 0 && (h.inv.current?.kind === 'weapon' || (!cls && d < 2.6))) it.fire = it.fireHeld = true;
      // took fire: throw up cover
      if (this.m.time() - ch.lastHurt < 0.4 && this.buildCool <= 0 && h.inv.mats.wood >= 10 && Math.random() < this.d.build) {
        this.buildCool = 2.5; it.build = Math.random() < 0.6 ? 'wall' : 'ramp'; it.fire = true;
        this.backTo = h.inv.sel;
      }
      if (h.mode === 'build' && !it.build) it.slot = this.backTo ?? 0;
    } else if (this.goal) {
      const dx = this.goal.x - ch.pos.x, dz = this.goal.z - ch.pos.z, d = Math.hypot(dx, dz);
      const [sx, sz] = this.goal.prop ? [this.goal.x, this.goal.z] : this.route(this.goal.x, this.goal.z);
      yaw = yawTo(sx - ch.pos.x, sz - ch.pos.z);
      const reach = this.goal.prop ? 2.2 : 2.4; // player interact reach is 2.6
      if (d > reach) {
        // still walled off (upper floor, blocked door): pickaxe through
        if ((this.goal.entry || this.goal.box) && sx === this.goal.x && sz === this.goal.z && d < 8 && this.stuckT > 0.3 && this.wallAhead(dx / d, dz / d)) this.breachT = 1.2;
        if (this.breachT > 0) { this.avoidT = 0; if (h.inv.sel !== 0) it.slot = 0; else it.fireHeld = true; } else { inp.mz = 1; inp.sprint = d > 8; }
      }
      else if (this.goal.entry) { this.m.loot.take(this.goal.entry, h); this.goal = null; }
      else if (this.goal.box) { this.m.loot.open(this.goal.box, h); this.goal = null; }
      else if (this.goal.prop) {
        if (!this.goal.prop.alive) this.goal = null;
        else { it.fireHeld = true; h.eye.set(ch.pos.x, ch.pos.y + 1.5, ch.pos.z); h.dir.set(dx, 1.0 - 1.5, dz).normalize(); pitch = -0.1; }
      }
    } else if (this.task === 'heal') it.fireHeld = true;
    if (h.mode === 'build' && this.task !== 'fight') it.slot = 0;

    // unstick: jump, then turn aside for a moment
    const moving = inp.mz !== 0 || inp.mx !== 0;
    if (moving && Math.hypot(ch.vel.x, ch.vel.z) < 1) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 0.5 && ch.grounded) inp.jump = true;
    if (this.stuckT > 1.2) { this.avoidT = 1; this.avoidYaw = (Math.random() < 0.5 ? 1 : -1) * 1.3; this.stuckT = 0; }
    if (this.avoidT > 0 && this.task !== 'fight') yaw += this.avoidYaw;
    const tr = BOT.aimTrack * this.d.track * 4 * dt;
    inp.yaw += Math.max(-tr, Math.min(tr, Math.atan2(Math.sin(yaw - inp.yaw), Math.cos(yaw - inp.yaw))));
    inp.pitch = pitch;
    if (this.task !== 'fight') { h.eye.set(ch.pos.x, ch.pos.y + (this.breachT > 0 ? 0.6 : 1.5), ch.pos.z); if (!this.goal?.prop) h.dir.set(-Math.sin(inp.yaw), 0, -Math.cos(inp.yaw)); h.aimPoint.copy(h.eye).addScaledVector(h.dir, 30); }
    h.tick(it, dt);
    inp.ads = false; inp.jumpHeld = inp.jump;
  }
}

// does segment (ax,az)-(bx,bz) pass through house box h (slab test)
function crosses(h, ax, az, bx, bz) {
  let t0 = 0, t1 = 1;
  for (const [a, d, lo, hi] of [[ax, bx - ax, h.x0, h.x1], [az, bz - az, h.z0, h.z1]]) {
    if (Math.abs(d) < 1e-9) { if (a <= lo || a >= hi) return false; continue; }
    let u = (lo - a) / d, v = (hi - a) / d;
    if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 >= t1) return false;
  }
  return true;
}
