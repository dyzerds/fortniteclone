// Island layout: one data file drives the terrain, towns, roads, vegetation, minimap and full map.
// Pure data + small geometry helpers (no three.js), so node tests can import it.
// Axes: +x east, +z south (north is up on the map). Heights in meters above sea level.
import { makeNoise, fbm, smoothstep, lerp } from '../util.js';

export const WORLD = {
  size: 1200,          // terrain square side (m), centered on origin
  res: 385,            // heightfield points per side
  seed: 1337,
  waterLevel: 0,
  islandRadius: 470,   // rough coast radius (loot scatter, bus door, lobby stage search)
};

// Named locations. Terrain flattens to `h` inside radius r (blend width `fall`); pois.js builds each `type`.
// h is a multiple of GRID.height (3.75) so ground floors sit flush on the pad.
export const POIS = [
  { name: 'Frostwhistle Peak', type: 'snow',       x: -290, z: -320, r: 36, h: 52.5, fall: 60 },
  { name: 'Pebblewick',        type: 'suburb',     x: -110, z: -250, r: 58, h: 11.25 },
  { name: 'Stonegate Quarry',  type: 'quarry',     x: 30,   z: -330, r: 42, h: 7.5, fall: 22 },
  { name: 'Hollowpine Camp',   type: 'camp',       x: 265,  z: -270, r: 42, h: 18.75 },
  { name: 'Thistle Heights',   type: 'mansion',    x: 370,  z: -170, r: 38, h: 30, fall: 55 },
  { name: 'Old Crown Keep',    type: 'ruins',      x: -395, z: -125, r: 34, h: 26.25, fall: 55 },
  { name: 'Lilac Lanes',       type: 'town',       x: -60,  z: -50,  r: 62, h: 11.25 },
  { name: 'Copperpot Market',  type: 'retail',     x: 205,  z: -100, r: 50, h: 15 },
  { name: 'Kettle Creek',      type: 'creek',      x: 110,  z: 60,   r: 44, h: 3.75 },
  { name: 'Sundial Flats',     type: 'desert',     x: 355,  z: 25,   r: 44, h: 15 },
  { name: 'Beacon Bluff',      type: 'lighthouse', x: 492,  z: 100,  r: 22, h: 15, fall: 25 },
  { name: 'Brightwater Shore', type: 'lakeside',   x: -205, z: 60,   r: 36, h: 3.75, fall: 30 },
  { name: 'Mossbrook Mill',    type: 'farm',       x: -355, z: 170,  r: 54, h: 7.5 },
  { name: 'Thunder Oval',      type: 'track',      x: -105, z: 175,  r: 54, h: 7.5 },
  { name: 'Rustbolt Yard',     type: 'industrial', x: 235,  z: 215,  r: 54, h: 7.5 },
  { name: 'Gullrock Harbor',   type: 'harbor',     x: -70,  z: 318,  r: 44, h: 3.75 },
  { name: 'Driftwood Cove',    type: 'cove',       x: -270, z: 365,  r: 32, h: 3.75, fall: 30 },
];

// Coastline radius every 22.5 degrees, starting at angle -180 (west), going through north (-90), east (0), south (90).
export const COAST = [460, 475, 492, 455, 440, 430, 448, 468, 455, 440, 420, 410, 450, 462, 484, 452];
export const PENINSULA = { a: [395, 72], b: [515, 104], r: 42 };   // land added: east cape under the lighthouse
export const BAY = { x: 20, z: 420, r: 115 };                       // water cut: southern bay beside the harbor

// Mountain ridges: segment a-b, peak height h, half width w.
export const MOUNTAINS = [
  { a: [-440, -190], b: [-300, -335], h: 44, w: 95 },
  { a: [-250, -385], b: [-20, -415], h: 24, w: 70 },
  { a: [190, -395], b: [385, -280], h: 28, w: 80 },
  { a: [430, -60], b: [470, 40], h: 10, w: 45 },
];

export const LAKE = { x: -205, z: -55, r: 58, depth: 5 };
// River from a mountain spring down to the bay. w = channel half width (m) at each point.
export const RIVER = [
  [128, -368, 3], [118, -320, 4], [130, -260, 5], [108, -200, 6], [124, -140, 7], [112, -80, 8], [126, -10, 8], [110, 60, 9],
  [92, 120, 9], [78, 170, 10], [58, 225, 10], [34, 270, 11], [22, 330, 12], [15, 400, 14],
];

export const DESERT = { x: 345, z: 45, r: 150, soft: 70 };
// Dense woods (tree probability boost) and open farmland (no trees).
export const FORESTS = [
  { x: 255, z: -290, r: 140 }, { x: -380, z: -30, r: 95 }, { x: -170, z: -170, r: 80 }, { x: 140, z: 330, r: 80 }, { x: -20, z: 90, r: 55 },
];
export const FIELDS = [{ x: -355, z: 170, r: 95 }];

// Roads between towns: [from, to, kind]. 'road' = asphalt, 'trail' = dirt. A road ends at a town's edge.
export const ROADS = [
  ['Pebblewick', 'Lilac Lanes', 'road'],
  ['Lilac Lanes', 'Brightwater Shore', 'road'],
  ['Lilac Lanes', 'Kettle Creek', 'road'],
  ['Kettle Creek', 'Copperpot Market', 'road'],
  ['Kettle Creek', 'Rustbolt Yard', 'road'],
  ['Copperpot Market', 'Sundial Flats', 'road'],
  ['Copperpot Market', 'Thistle Heights', 'road'],
  ['Lilac Lanes', 'Thunder Oval', 'road'],
  ['Thunder Oval', 'Gullrock Harbor', 'road'],
  ['Brightwater Shore', 'Mossbrook Mill', 'road'],
  ['Rustbolt Yard', 'Gullrock Harbor', 'road'],
  ['Sundial Flats', 'Beacon Bluff', 'trail'],
  ['Pebblewick', 'Stonegate Quarry', 'trail'],
  ['Stonegate Quarry', 'Hollowpine Camp', 'trail'],
  ['Hollowpine Camp', 'Thistle Heights', 'trail'],
  ['Pebblewick', 'Old Crown Keep', 'trail'],
  ['Pebblewick', 'Frostwhistle Peak', 'trail'],
  ['Mossbrook Mill', 'Driftwood Cove', 'trail'],
  ['Stonegate Quarry', 'Copperpot Market', 'trail'],
];
export const ROAD_W = { road: 3.6, trail: 2.2 }; // half widths (m)

// ---------- helpers ----------
export const poiByName = (n) => POIS.find((p) => p.name === n);

export function distSeg(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
  return { d: Math.hypot(x - ax - dx * t, z - az - dz * t), t };
}

// distance to the river centerline and the channel half width there
export function riverAt(x, z) {
  let best = { d: Infinity, w: 0 };
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az, aw] = RIVER[i], [bx, bz, bw] = RIVER[i + 1];
    const { d, t } = distSeg(x, z, ax, az, bx, bz);
    if (d < best.d) best = { d, w: aw + (bw - aw) * t, i, t };
  }
  return best;
}

// Road polylines with a gentle S-bend, clipped to start/end at each town's edge.
export function roadPaths() {
  return ROADS.map(([a, b, kind], n) => {
    const A = poiByName(a), B = poiByName(b);
    const dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    const s = A.r * 0.55, e = L - B.r * 0.55;
    const bend = ((n * 37) % 11 - 5) * 0.035 * L; // deterministic sideways sway
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const t = i / 16, d = s + (e - s) * t, off = Math.sin(t * Math.PI) * bend * Math.sin(t * Math.PI * 2 + n);
      pts.push([A.x + ux * d - uz * off, A.z + uz * d + ux * off]);
    }
    return { kind, pts, w: ROAD_W[kind], from: a, to: b };
  });
}

// ---------- terrain height (raw, before grid sampling) ----------
const noise = makeNoise(WORLD.seed), noise2 = makeNoise(WORLD.seed + 7);
export { noise as islandNoise, noise2 as islandNoise2 };

// signed distance-ish to the coast: > 0 on land (m); the waterline sits ~30 m inside s = 0
export function coastSdf(x, z) {
  const ang = Math.atan2(z, x), u = ((ang + Math.PI) / (Math.PI * 2)) * COAST.length;
  const i = Math.floor(u), f = u - i, at = (k) => COAST[((k % COAST.length) + COAST.length) % COAST.length];
  // periodic Catmull-Rom through the control radii
  const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
  const base = 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f);
  const coast = base * (1 + 0.045 * noise(Math.cos(ang) * 2.2 + 5, Math.sin(ang) * 2.2 + 5) + 0.025 * noise(x * 0.012, z * 0.012));
  let s = coast - Math.hypot(x, z);
  const P = PENINSULA;
  s = Math.max(s, P.r - distSeg(x, z, P.a[0], P.a[1], P.b[0], P.b[1]).d + 8 * noise(x * 0.03, z * 0.03));
  s = Math.min(s, Math.hypot(x - BAY.x, z - BAY.z) - BAY.r + 6 * noise(x * 0.02 + 9, z * 0.02));
  return s;
}

const disc = (list, x, z) => list.reduce((m, c) => Math.max(m, smoothstep(c.r, c.r * 0.55, Math.hypot(x - c.x, z - c.z))), 0);
export const desertAt = (x, z) => smoothstep(DESERT.r + DESERT.soft, DESERT.r - DESERT.soft * 0.3, Math.hypot(x - DESERT.x, z - DESERT.z));
export const forestAt = (x, z) => disc(FORESTS, x, z);
export const fieldAt = (x, z) => disc(FIELDS, x, z);
// snow on the high northern mountains
export const snowAt = (x, z, h) => smoothstep(27, 36, h + 6 * noise(x * 0.03, z * 0.03)) * smoothstep(-60, -180, z);

export function heightAt(x, z) {
  const land = smoothstep(-30, 70, coastSdf(x, z));
  let h = 4 + (fbm(noise, x * 0.0045, z * 0.0045, 5) * 0.5 + 0.5) * 20;
  for (const m of MOUNTAINS) { // ridges, craggy on top
    const t = smoothstep(m.w, m.w * 0.1, distSeg(x, z, m.a[0], m.a[1], m.b[0], m.b[1]).d);
    if (t <= 0) continue;
    const ridge = 1 - Math.abs(fbm(noise2, x * 0.006 + 3, z * 0.006 - 2, 4));
    h += m.h * t * (0.6 + 0.55 * ridge * ridge);
  }
  const des = desertAt(x, z);
  if (des > 0) { // stepped mesas
    const hm = 9 + (fbm(noise2, x * 0.006 + 31, z * 0.006, 3) * 0.5 + 0.5) * 24, step = 6.5;
    const k = Math.floor(hm / step), f = hm / step - k;
    h = lerp(h, (k + smoothstep(0.78, 0.95, f)) * step + 4, des);
  }
  h = lerp(1.2, h, smoothstep(0.15, 0.6, land)); // gentle beaches
  h = lerp(-16, h, land);
  for (const p of POIS) { // town pads have the last word over hills and coast
    const t = smoothstep(p.r + (p.fall ?? 42), p.r * 0.97, Math.hypot(x - p.x, z - p.z));
    if (t > 0) h = lerp(h, p.h, t);
  }
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z); // lake basin
  h = lerp(h, -LAKE.depth, smoothstep(LAKE.r + 38, LAKE.r * 0.55, dl + 5 * noise(x * 0.04, z * 0.04)));
  const rv = riverAt(x, z); // river: a low valley, then the channel
  if (rv.d < rv.w + 70) {
    h = lerp(h, Math.min(h, 2.6 + rv.d * 0.02), smoothstep(rv.w + 70, rv.w + 5, rv.d));
    h = Math.min(h, lerp(h, -2.4, smoothstep(rv.w + 1.5, rv.w * 0.35, rv.d)));
  }
  return h;
}
