// Pure combat rules: inventory, heals, damage. No three.js so node:test can run it.
import { AMMO, CONSUMABLES, MAT_CAP, PLAYER, WEAPONS } from '../config.js';

// Items: { kind: 'weapon', cls, rarity, mag } | { kind: 'heal', id, count }
export class Inventory {
  constructor() { this.reset(); }

  reset() {
    this.slots = Array(PLAYER.slots).fill(null);
    this.sel = 0; // 0 = pickaxe, 1..5 = item slots
    this.ammo = Object.fromEntries(Object.keys(AMMO).map((k) => [k, 0]));
    this.mats = { wood: 0, brick: 0, metal: 0 };
  }

  get current() { return this.sel ? this.slots[this.sel - 1] : null; }

  // Returns null when fully taken, false when not taken (item may be partly stacked),
  // or the item that was swapped out of the selected slot (caller drops it).
  add(item) {
    if (item.kind === 'heal') {
      const max = CONSUMABLES[item.id].stack;
      for (const s of this.slots) {
        if (s?.kind !== 'heal' || s.id !== item.id || s.count >= max) continue;
        const n = Math.min(max - s.count, item.count);
        s.count += n; item.count -= n;
        if (!item.count) return null;
      }
    }
    const free = this.slots.indexOf(null);
    if (free >= 0) { this.slots[free] = item; return null; }
    if (!this.sel) return false;
    const out = this.slots[this.sel - 1];
    this.slots[this.sel - 1] = item;
    return out;
  }

  addAmmo(type, n) { const t = Math.min(n, AMMO[type].cap - this.ammo[type]); this.ammo[type] += t; return t; }
  addMat(type, n) { const t = Math.min(n, MAT_CAP - this.mats[type]); this.mats[type] += t; return t; }
  spendMat(type, n) { if (this.mats[type] < n) return false; this.mats[type] -= n; return true; }

  select(i) { if (i === 0 || this.slots[i - 1]) this.sel = i; }
  cycle(dir) {
    for (let k = 1; k <= PLAYER.slots + 1; k++) {
      const i = (this.sel + dir * k + (PLAYER.slots + 1) * 2) % (PLAYER.slots + 1);
      if (i === 0 || this.slots[i - 1]) { this.sel = i; return; }
    }
  }

  removeSlot(i) { const it = this.slots[i]; this.slots[i] = null; if (this.sel === i + 1) this.sel = 0; return it; }
  useOne() {
    const it = this.current;
    if (it?.kind === 'heal' && --it.count <= 0) this.removeSlot(this.sel - 1);
  }

  // moves rounds from the ammo pool into the magazine; returns rounds loaded
  reload(item) {
    const w = WEAPONS[item.cls];
    const n = Math.min(w.mag - item.mag, this.ammo[w.ammo]);
    item.mag += n; this.ammo[w.ammo] -= n;
    return n;
  }
}

// New { health, shield } after a consumable, or null when it would do nothing.
export function healResult(id, health, shield) {
  const c = CONSUMABLES[id];
  if (c.heal) return health >= c.cap ? null : { health: Math.min(c.cap, health + c.heal), shield };
  return shield >= c.cap ? null : { health, shield: Math.min(c.cap, shield + c.shield) };
}

// Shield absorbs first.
export function applyDamage(health, shield, dmg) {
  const toShield = Math.min(shield, dmg);
  const toHealth = Math.min(health, dmg - toShield);
  return { health: health - toHealth, shield: shield - toShield, toShield, toHealth };
}

// Damage of one bullet/pellet.
export function weaponDamage(cls, rarity, dist, head) {
  const w = WEAPONS[cls];
  let d = w.dmg[rarity];
  if (w.falloffStart) {
    const t = Math.min(1, Math.max(0, (dist - w.falloffStart) / (w.falloffEnd - w.falloffStart)));
    d *= 1 - t * (1 - w.falloffMin);
  }
  return head ? d * w.head : d;
}
