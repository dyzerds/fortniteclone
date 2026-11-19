import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placement, BuildGrid, keyOf, pieceBox, touches, cardinal } from '../src/build/grid.js';
import { GRID } from '../src/config.js';

const C = GRID.cell, H = GRID.height;
const flat = () => 0;
const YAW = { north: 0, east: -Math.PI / 2, south: Math.PI, west: Math.PI / 2 }; // forward = (-sin, -cos)

test('cardinal directions', () => {
  assert.equal(cardinal(YAW.north), 0);
  assert.equal(cardinal(YAW.east), 1);
  assert.equal(cardinal(YAW.south), 2);
  assert.equal(cardinal(YAW.west), 3);
});

test('wall goes on the edge of the current cell you face', () => {
  const pos = { x: 2.5, y: 0, z: 2.5 };
  assert.deepEqual(placement('wall', pos, YAW.east, 0), { type: 'wall', dir: 'z', i: 1, k: 0, l: 0 });
  assert.deepEqual(placement('wall', pos, YAW.north, 0), { type: 'wall', dir: 'x', i: 0, k: 0, l: 0 });
  assert.equal(placement('wall', pos, YAW.north, 0.9).l, 1, 'looking up builds one level higher');
});

test('ramp continues up a ramp', () => {
  // standing mid-ramp in cell 0 (rising east), feet at half height, ramp ahead must be level 1
  const r = placement('ramp', { x: 2.5, y: H / 2, z: 2.5 }, YAW.east, 0, { slope: H / C });
  assert.equal(r.i, 1); assert.equal(r.l, 1); assert.equal(r.rot, 1);
  // on flat ground: level 0 in the next cell
  const g = placement('ramp', { x: 2.5, y: 0.1, z: 2.5 }, YAW.east, 0);
  assert.equal(g.i, 1); assert.equal(g.l, 0);
});

test('floor above when looking up, under when looking down', () => {
  const pos = { x: 2.5, y: 0, z: 2.5 };
  assert.deepEqual(placement('floor', pos, 0, 1.0), { type: 'floor', i: 0, k: 0, l: 1 });
  assert.deepEqual(placement('floor', pos, 0, -1.0), { type: 'floor', i: 0, k: 0, l: 0 });
});

test('wall and floor at the same level touch; distant pieces do not', () => {
  const w = pieceBox({ type: 'wall', dir: 'x', i: 0, k: 1, l: 0 });
  const f = pieceBox({ type: 'floor', i: 0, k: 0, l: 0 });
  const far = pieceBox({ type: 'floor', i: 5, k: 5, l: 0 });
  assert.ok(touches(w, f));
  assert.ok(!touches(f, far));
});

test('integrity: removing the only grounded support drops the tower', () => {
  const g = new BuildGrid(flat);
  const base = g.add({ type: 'wall', dir: 'x', i: 0, k: 0, l: 0 });
  const mid = g.add({ type: 'wall', dir: 'x', i: 0, k: 0, l: 1 });
  const top = g.add({ type: 'floor', i: 0, k: 0, l: 2 });
  const side = g.add({ type: 'floor', i: 3, k: 3, l: 0 });
  assert.ok(base.grounded && !mid.grounded && !top.grounded && side.grounded);
  const n = g.neighbors(base);
  g.remove(base);
  const fell = g.unsupported(n).map(keyOf).sort();
  assert.deepEqual(fell, [keyOf(mid), keyOf(top)].sort());
});

test('integrity: a second support keeps the structure up', () => {
  const g = new BuildGrid(flat);
  const a = g.add({ type: 'wall', dir: 'x', i: 0, k: 0, l: 0 });
  g.add({ type: 'wall', dir: 'x', i: 1, k: 0, l: 0 });
  g.add({ type: 'floor', i: 0, k: 0, l: 1 });
  g.add({ type: 'floor', i: 1, k: 0, l: 1 });
  const n = g.neighbors(a);
  g.remove(a);
  assert.deepEqual(g.unsupported(n), []);
});
