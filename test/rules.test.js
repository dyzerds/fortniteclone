import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Inventory, healResult, applyDamage, weaponDamage, fallDamage } from '../src/combat/rules.js';

test('inventory fills slots, stacks heals, swaps when full', () => {
  const inv = new Inventory();
  for (let i = 0; i < 5; i++) assert.equal(inv.add({ kind: 'weapon', cls: 'ar', rarity: 0, mag: 30 }), null);
  assert.equal(inv.add({ kind: 'weapon', cls: 'smg', rarity: 1, mag: 30 }), false, 'full + pickaxe selected = not taken');
  inv.select(3);
  const out = inv.add({ kind: 'weapon', cls: 'smg', rarity: 1, mag: 30 });
  assert.equal(out.cls, 'ar');
  assert.equal(inv.current.cls, 'smg');

  const h = new Inventory();
  h.add({ kind: 'heal', id: 'shieldcell', count: 4 });
  assert.equal(h.add({ kind: 'heal', id: 'shieldcell', count: 4 }), null);
  assert.deepEqual(h.slots.map((s) => s?.count ?? 0), [6, 2, 0, 0, 0]);
});

test('ammo, mats and reload respect caps', () => {
  const inv = new Inventory();
  assert.equal(inv.addMat('wood', 1200), 999);
  assert.equal(inv.spendMat('brick', 10), false);
  inv.addAmmo('medium', 12);
  const ar = { kind: 'weapon', cls: 'ar', rarity: 0, mag: 25 };
  assert.equal(inv.reload(ar), 5);
  assert.equal(inv.ammo.medium, 7);
});

test('cycle skips empty slots, useOne removes empty stacks', () => {
  const inv = new Inventory();
  inv.slots[2] = { kind: 'heal', id: 'bandage', count: 1 };
  inv.cycle(1); assert.equal(inv.sel, 3);
  inv.cycle(1); assert.equal(inv.sel, 0);
  inv.cycle(-1); assert.equal(inv.sel, 3);
  inv.useOne(); assert.equal(inv.slots[2], null); assert.equal(inv.sel, 0);
});

test('heal caps and shield-first damage', () => {
  assert.deepEqual(healResult('bandage', 70, 0), { health: 75, shield: 0 });
  assert.equal(healResult('bandage', 80, 0), null);
  assert.equal(healResult('shieldcell', 100, 50), null);
  assert.deepEqual(healResult('shieldcore', 100, 60), { health: 100, shield: 100 });
  assert.deepEqual(applyDamage(100, 30, 50), { health: 80, shield: 0, toShield: 30, toHealth: 20 });
});

test('shotgun falloff and headshots', () => {
  assert.equal(weaponDamage('ar', 0, 50, false), 30);
  assert.equal(weaponDamage('ar', 0, 50, true), 45);
  const near = weaponDamage('shotgun', 0, 5, false), far = weaponDamage('shotgun', 0, 40, false);
  assert.ok(far < near && Math.abs(far - near * 0.35) < 1e-9);
});

test('fall damage matches the build-floor table', () => {
  const floors = (n) => fallDamage(n * 3.75);
  assert.equal(floors(3), 0);
  assert.equal(Math.round(floors(4)), 21);
  assert.equal(Math.round(floors(5)), 52);
  assert.ok(floors(6) >= 100, '6 floors kills from full health');
  assert.ok(fallDamage(30) > floors(6), 'keeps growing past the table');
  assert.equal(fallDamage(2.3), 0, 'a jump never hurts');
});
