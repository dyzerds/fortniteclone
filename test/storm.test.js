import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stormPlan, stormAt, outside } from '../src/storm.js';
import { rng } from '../src/util.js';
import { STORM } from '../src/config.js';

test('each circle sits inside the previous one', () => {
  for (let seed = 1; seed < 30; seed++) {
    const c = stormPlan(rng(seed), STORM);
    assert.equal(c.length, STORM.phases.length + 1);
    for (let i = 1; i < c.length; i++) {
      assert.ok(c[i].r <= c[i - 1].r);
      assert.ok(Math.hypot(c[i].x - c[i - 1].x, c[i].z - c[i - 1].z) + c[i].r <= c[i - 1].r + 1e-6);
    }
  }
});

test('stormAt waits, then shrinks linearly, then holds', () => {
  const c = stormPlan(rng(7), STORM), p = STORM.phases;
  const s0 = stormAt(c, p, 1);
  assert.equal(s0.shrinking, false); assert.equal(s0.r, c[0].r); assert.equal(s0.left, p[0].wait - 1);
  const mid = stormAt(c, p, p[0].wait + p[0].shrink / 2);
  assert.ok(mid.shrinking); assert.ok(Math.abs(mid.r - (c[0].r + c[1].r) / 2) < 1e-9);
  const end = stormAt(c, p, 1e6);
  assert.equal(end.r, 0); assert.ok(outside(end, end.x + 1, end.z));
});
