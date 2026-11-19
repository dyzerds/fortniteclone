// PURE build-grid logic: piece keys, placement from aim, boxes, support graph. No three.js (node-testable).
import { GRID } from '../config.js';

const C = GRID.cell, H = GRID.height, T = GRID.thick;
export const CONE_H = H * 0.55;
export const TILES = { wall: [3, 3], floor: [2, 2], ramp: [2, 2], cone: [1, 1] };
export const tileCount = (type) => TILES[type][0] * TILES[type][1];

// Walls sit on cell edges: dir 'x' = edge along X at z=k*C; dir 'z' = edge along Z at x=i*C.
export const keyOf = (p) => (p.type === 'wall' ? `wall:${p.i},${p.l},${p.k},${p.dir}` : `${p.type}:${p.i},${p.l},${p.k}`);

// ramp rot: direction the ramp rises. 0:-Z 1:+X 2:+Z 3:-X
export const ROT_DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export function cardinal(yaw) {
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  if (Math.abs(fx) > Math.abs(fz)) return fx > 0 ? 1 : 3;
  return fz > 0 ? 2 : 0;
}

const cellOf = (x, z) => [Math.floor(x / C), Math.floor(z / C)];

// pos = feet {x,y,z}; slope = rise per meter of the surface under the player in the facing direction (ramps)
export function placement(type, pos, yaw, pitch, { rotOffset = 0, slope = 0 } = {}) {
  const rot = cardinal(yaw);
  const [dx, dz] = ROT_DIRS[rot];
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const [ci, ck] = cellOf(pos.x, pos.z);
  if (type === 'wall') {
    let l = Math.floor((pos.y + 1.0) / H) + (pitch > 0.62 ? 1 : 0) - (pitch < -0.95 ? 1 : 0);
    if (rot === 1) return { type, dir: 'z', i: ci + 1, k: ck, l };
    if (rot === 3) return { type, dir: 'z', i: ci, k: ck, l };
    if (rot === 2) return { type, dir: 'x', i: ci, k: ck + 1, l };
    return { type, dir: 'x', i: ci, k: ck, l };
  }
  const feetL = Math.floor((pos.y + 0.3) / H);
  if (type === 'floor' || type === 'cone') {
    const up = type === 'cone' ? 0.35 : 0.75;
    if (pitch > up) return { type, i: ci, k: ck, l: feetL + 1 };
    if (type === 'floor' && pitch < -0.6) return { type, i: ci, k: ck, l: feetL };
    const [fi, fk] = cellOf(pos.x + fx * C * 0.7, pos.z + fz * C * 0.7);
    if (fi === ci && fk === ck) return { type, i: ci, k: ck, l: feetL };
    return { type, i: fi, k: fk, l: Math.round(pos.y / H) };
  }
  // ramp: cell in front, level from the feet height extrapolated to the entry edge
  const [fi, fk] = cellOf(pos.x + dx * C * 0.6, pos.z + dz * C * 0.6);
  const r = (rot + rotOffset) % 4;
  if (fi === ci && fk === ck) return { type, i: ci, k: ck, l: feetL, rot: r };
  const edge = dx ? (dx > 0 ? (ci + 1) * C - pos.x : pos.x - ci * C) : (dz > 0 ? (ck + 1) * C - pos.z : pos.z - ck * C);
  const yEdge = pos.y + slope * edge;
  return { type, i: fi, k: fk, l: Math.floor((yEdge + 0.25 * H) / H), rot: r };
}

export function pieceBox(p) {
  const x0 = p.i * C, z0 = p.k * C, y0 = p.l * H;
  switch (p.type) {
    case 'floor': return { min: [x0, y0 - T / 2, z0], max: [x0 + C, y0 + T / 2, z0 + C] };
    case 'ramp': return { min: [x0, y0, z0], max: [x0 + C, y0 + H, z0 + C] };
    case 'cone': return { min: [x0, y0, z0], max: [x0 + C, y0 + CONE_H, z0 + C] };
    default: return p.dir === 'x'
      ? { min: [x0, y0, z0 - T / 2], max: [x0 + C, y0 + H, z0 + T / 2] }
      : { min: [x0 - T / 2, y0, z0], max: [x0 + T / 2, y0 + H, z0 + C] };
  }
}

export function touches(a, b, eps = 0.06) {
  for (let d = 0; d < 3; d++) if (a.min[d] > b.max[d] + eps || b.min[d] > a.max[d] + eps) return false;
  return true;
}

// A piece is grounded when its lowest point is at or below the terrain somewhere in its footprint.
export function groundedOn(box, groundFn) {
  const xs = [box.min[0] + 0.3, (box.min[0] + box.max[0]) / 2, box.max[0] - 0.3];
  const zs = [box.min[2] + 0.3, (box.min[2] + box.max[2]) / 2, box.max[2] - 0.3];
  let top = -Infinity;
  for (const x of xs) for (const z of zs) top = Math.max(top, groundFn(x, z));
  return box.min[1] <= top + 0.15;
}
// Entirely below ground = can't be placed.
export function buriedIn(box, groundFn) {
  const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2;
  return box.max[1] < Math.min(groundFn(cx, cz), groundFn(box.min[0] + 0.3, box.min[2] + 0.3), groundFn(box.max[0] - 0.3, box.max[2] - 0.3)) - 0.1;
}

export class BuildGrid {
  constructor(groundFn) { this.groundFn = groundFn; this.pieces = new Map(); this.buckets = new Map(); }

  static bucketKey(i, l, k) { return `${i},${l},${k}`; }

  add(p) {
    p.key = keyOf(p);
    p.box = pieceBox(p);
    p.grounded = groundedOn(p.box, this.groundFn);
    this.pieces.set(p.key, p);
    const bk = BuildGrid.bucketKey(p.i, p.l, p.k);
    if (!this.buckets.has(bk)) this.buckets.set(bk, new Set());
    this.buckets.get(bk).add(p);
    return p;
  }

  remove(p) {
    this.pieces.delete(p.key);
    this.buckets.get(BuildGrid.bucketKey(p.i, p.l, p.k))?.delete(p);
  }

  has(key) { return this.pieces.has(key); }
  clear() { this.pieces.clear(); this.buckets.clear(); }

  neighbors(p) {
    const out = [];
    for (let di = -1; di <= 1; di++) for (let dl = -1; dl <= 1; dl++) for (let dk = -1; dk <= 1; dk++) {
      const b = this.buckets.get(BuildGrid.bucketKey(p.i + di, p.l + dl, p.k + dk));
      if (b) for (const q of b) if (q !== p && touches(p.box, q.box)) out.push(q);
    }
    return out;
  }

  // Call after removing `removed` from the grid, with the neighbors it had. Returns pieces with no path to ground.
  unsupported(formerNeighbors) {
    const safe = new Set(), doomed = new Set();
    for (const start of formerNeighbors) {
      if (safe.has(start) || doomed.has(start) || !this.pieces.has(start.key)) continue;
      const seen = new Set([start]), queue = [start];
      let grounded = false;
      while (queue.length && !grounded) {
        const p = queue.shift();
        if (p.grounded || safe.has(p)) { grounded = true; break; }
        for (const n of this.neighbors(p)) if (!seen.has(n)) { seen.add(n); queue.push(n); }
      }
      for (const p of seen) (grounded ? safe : doomed).add(p);
    }
    return [...doomed];
  }
}
