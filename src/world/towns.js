// Town layouts: streets, ground pads, buildings, landmarks and car spots for every POI.
// Pure data from island.js (no three.js): terrain.js paints streets/pads, pois.js builds the rest.
// Building: { i0, k0, w, d (cells), stories, mat, wall, front?, roof, roofKind: gable|flat|none, door: 0 -z|1 +z|2 -x|3 +x, doorAt }
import { GRID } from '../config.js';
import { rng, pick } from '../util.js';
import { POIS, LAKE, BAY, riverAt, heightAt } from './island.js';

const C = GRID.cell;
const HOUSE_WALLS = ['sidingWhite', 'sidingBlue', 'sidingYellow', 'sidingMint', 'sidingPink', 'sidingSage'];
const HOUSE_ROOFS = ['roofRed', 'roofBlue', 'roofTeal', 'roofBrown', 'roofGreen', 'roofGrey'];
const SHOP_WALLS = ['brickRed', 'brickTan', 'stuccoPeach'];
const CONTAINERS = ['containerRed', 'containerBlue', 'containerGreen', 'containerYellow'];

const house = (r, o = {}) => ({
  kind: 'house', w: 2 + (r() < 0.45), d: 2 + (r() < 0.5), stories: r() < 0.5 ? 2 : 1, mat: r() < 0.5 ? 'wood' : 'brick',
  wall: pick(r, HOUSE_WALLS), roof: pick(r, HOUSE_ROOFS), roofKind: 'gable', floor: 'floorWood', ...o,
});
const shop = (r, o = {}) => ({
  kind: 'shop', w: 2 + (r() < 0.5), d: 2 + (r() < 0.5), stories: r() < 0.6 ? 2 : 1, mat: 'brick',
  wall: pick(r, SHOP_WALLS), front: 'shopfront', roof: 'roofTar', roofKind: 'flat', floor: 'floorTile', ...o,
});

function site(poi) {
  const r = rng((Math.round(poi.x * 31 + poi.z * 17) >>> 0) + 11);
  const cx = Math.round(poi.x / C) * C, cz = Math.round(poi.z / C) * C;
  const used = new Set(), key = (i, k) => `${i},${k}`;
  const T = { poi, cx, cz, r, R: Math.floor((poi.r - 6) / C) * C, streets: [], pads: [], buildings: [], props: [], cars: [] };
  // a cell can hold a building when its ground is the town pad (not river, lake, slope or sea)
  T.okCell = (i, k) => {
    const x = (i + 0.5) * C, z = (k + 0.5) * C;
    if (Math.hypot(x - poi.x, z - poi.z) > poi.r * 0.9) return false;
    const rv = riverAt(x, z);
    if (rv.d < rv.w + 8) return false;
    for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) {
      const h = heightAt(x + dx, z + dz);
      if (h > poi.h + 0.35 || h < poi.h - 2.5 || h < 1) return false;
    }
    return true;
  };
  T.free = (i0, k0, w, d, m = 1) => {
    for (let i = i0 - m; i < i0 + w + m; i++) for (let k = k0 - m; k < k0 + d + m; k++) if (used.has(key(i, k))) return false;
    for (let i = i0; i < i0 + w; i++) for (let k = k0; k < k0 + d; k++) if (!T.okCell(i, k)) return false;
    return true;
  };
  T.claimRect = (x0, z0, x1, z1) => {
    for (let i = Math.floor(x0 / C); i < Math.ceil(x1 / C); i++) for (let k = Math.floor(z0 / C); k < Math.ceil(z1 / C); k++) used.add(key(i, k));
  };
  T.street = (x0, z0, x1, z1) => { T.streets.push({ x0, z0, x1, z1 }); T.claimRect(x0, z0, x1, z1); };
  T.pad = (p) => { T.pads.push(p); if (p.claim) T.claimRect(p.x0 ?? p.x - p.r, p.z0 ?? p.z - p.r, p.x1 ?? p.x + p.r, p.z1 ?? p.z + p.r); };
  T.add = (b) => {
    b.i0 = Math.round(b.i0); b.k0 = Math.round(b.k0);
    if (!T.free(b.i0, b.k0, b.w, b.d, b.margin ?? 1)) return null;
    for (let i = b.i0; i < b.i0 + b.w; i++) for (let k = b.k0; k < b.k0 + b.d; k++) used.add(key(i, k));
    T.buildings.push(b);
    return b;
  };
  T.prop = (type, x, z, o = {}) => T.props.push({ type, x, z, rot: 0, ...o });
  // buildings in a row facing a street that runs along x at z = zs (side -1 = north of it, +1 = south)
  T.rowX = (zs, xa, xb, sides, mk) => {
    for (const side of sides) for (let i = Math.ceil(xa / C); i * C < xb;) {
      const b = mk(T.r, side);
      Object.assign(b, { i0: i, k0: side < 0 ? zs / C - 2 - b.d : zs / C + 2, door: side < 0 ? 1 : 0, doorAt: Math.floor(b.w / 2) });
      if ((b.i0 + b.w) * C <= xb && T.add(b)) i += b.w + 1 + (T.r() < 0.35); else i++;
    }
  };
  T.rowZ = (xs, za, zb, sides, mk) => {
    for (const side of sides) for (let k = Math.ceil(za / C); k * C < zb;) {
      const b = mk(T.r, side);
      [b.w, b.d] = [b.d, b.w];
      Object.assign(b, { k0: k, i0: side < 0 ? xs / C - 2 - b.w : xs / C + 2, door: side < 0 ? 3 : 2, doorAt: Math.floor(b.d / 2) });
      if ((b.k0 + b.d) * C <= zb && T.add(b)) k += b.d + 1 + (T.r() < 0.35); else k++;
    }
  };
  // scattered buildings, door facing the town center
  T.scatter = (n, mk, tries = 80) => {
    for (let t = 0, made = 0; t < tries && made < n; t++) {
      const b = mk(T.r);
      const a = T.r() * Math.PI * 2, d = poi.r * (0.15 + T.r() * 0.6);
      b.i0 = Math.round((poi.x + Math.cos(a) * d) / C - b.w / 2); b.k0 = Math.round((poi.z + Math.sin(a) * d) / C - b.d / 2);
      const dx = poi.x - (b.i0 + b.w / 2) * C, dz = poi.z - (b.k0 + b.d / 2) * C;
      b.door = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 2 : 3) : (dz < 0 ? 0 : 1);
      b.doorAt = Math.floor((b.door < 2 ? b.w : b.d) / 2);
      if (T.add(b)) made++;
    }
  };
  T.lamps = (x0, z0, x1, z1, every = 22) => {
    const L = Math.hypot(x1 - x0, z1 - z0);
    for (let s = every / 2; s < L; s += every) T.prop('lamp', x0 + (x1 - x0) * s / L, z0 + (z1 - z0) * s / L, { rot: Math.atan2(x1 - x0, z1 - z0) });
  };
  return T;
}

// first water point from (x, z) along a direction
function shoreToward(x, z, tx, tz) {
  const L = Math.hypot(tx - x, tz - z), ux = (tx - x) / L, uz = (tz - z) / L;
  for (let s = 0; s < 160; s += 1) if (heightAt(x + ux * s, z + uz * s) < -0.6) return { x: x + ux * s, z: z + uz * s, rot: Math.atan2(ux, uz) };
  return null;
}

const LAYOUT = {
  suburb(T) {
    const { cx, cz, R } = T, zx = cx + 15;
    T.street(cx - R, cz - 4, cx + R, cz + 4);
    T.street(zx - 4, cz + 4, zx + 4, cz + R);
    T.rowX(cz, cx - R, cx + R, [-1, 1], house);
    T.rowZ(zx, cz + 5, cz + R, [-1, 1], house);
    T.lamps(cx - R, cz - 5.5, cx + R, cz - 5.5);
    for (let n = 0; n < 4; n++) T.cars.push({ x: cx - R + 12 + T.r() * (2 * R - 24), z: cz + (n % 2 ? 2.2 : -2.2), rot: Math.PI / 2 + (n % 2) * Math.PI });
  },
  town(T) {
    const { cx, cz, R } = T, za = cz - 15, zb = cz + 20;
    T.street(cx - R, za - 4, cx + R, za + 4);
    T.street(cx - R, zb - 4, cx + R, zb + 4);
    T.street(cx - 4, cz - R, cx + 4, cz + R);
    T.pad({ kind: 'plaza', x: cx, z: cz + 2.5, r: 9, claim: true });
    T.prop('fountain', cx, cz + 2.5);
    const mk = (r) => (Math.abs(T.r() - 0.5) < 0.3 ? shop(r) : house(r));
    T.rowX(za, cx - R, cx + R, [-1, 1], mk);
    T.rowX(zb, cx - R, cx + R, [1], mk);
    T.rowZ(cx, cz - R, za - 5, [-1, 1], house);
    T.lamps(cx - R, za - 5.5, cx + R, za - 5.5); T.lamps(cx - R, zb + 5.5, cx + R, zb + 5.5);
    for (let n = 0; n < 5; n++) T.cars.push({ x: cx - R + 10 + T.r() * (2 * R - 20), z: (n % 2 ? za : zb) + (n % 3 ? 2.2 : -2.2), rot: Math.PI / 2 + (n % 2) * Math.PI });
  },
  retail(T) {
    const { cx, cz, R } = T, zs = cz + 20;
    T.street(cx - R, zs - 4, cx + R, zs + 4);
    T.pad({ kind: 'parking', x0: cx - 32, z0: cz + 1, x1: cx + 32, z1: zs - 4, claim: true });
    for (let i = Math.floor((cx - 38) / C); i * C < cx + 38;) {
      const b = shop(T.r, { stories: T.r() < 0.4 ? 2 : 1, w: 2 + Math.floor(T.r() * 2), d: 3 });
      Object.assign(b, { i0: i, k0: cz / C - 1 - b.d, door: 1, doorAt: Math.floor(b.w / 2) });
      if (T.add(b)) { i += b.w + 1; T.prop('awning', (i - 1 - b.w / 2) * C, cz - 5, { w: b.w * C - 1 }); } else i++;
    }
    T.rowX(zs, cx - R, cx + R, [1], house);
    T.lamps(cx - 30, zs - 5.5, cx + 30, zs - 5.5, 20);
    for (let n = 0; n < 6; n++) T.cars.push({ x: cx - 26 + n * 10 + T.r() * 2, z: cz + 6 + (n % 2) * 6, rot: (n % 2) * Math.PI });
  },
  creek(T) {
    const { cx, cz, R } = T;
    T.street(cx - R, cz - 4, cx + R, cz + 4);
    T.rowX(cz, cx - R, cx + R, [-1, 1], house);
    let best = { d: 1e9, x: cx };
    for (let x = cx - R; x <= cx + R; x += 1) { const rv = riverAt(x, cz); if (rv.d < best.d) best = { d: rv.d, x, w: rv.w }; }
    T.prop('bridge', best.x, cz, { len: best.w * 2 + 20, rot: Math.PI / 2 });
    T.lamps(cx - R, cz - 5.5, cx + R, cz - 5.5);
    for (let n = 0; n < 3; n++) T.cars.push({ x: cx - R + 8 + T.r() * 20 + n * 30, z: cz + 2.2, rot: Math.PI / 2 });
  },
  industrial(T) {
    const { cx, cz, poi } = T;
    T.pad({ kind: 'concrete', x: cx, z: cz, r: poi.r * 0.92 });
    for (const [dx, dz] of [[-22, -20], [10, 12], [-25, 16], [14, -24]]) {
      const big = T.add({ kind: 'warehouse', i0: (cx + dx) / C, k0: (cz + dz) / C, w: 4, d: 3, stories: 2, hollow: true, mat: 'metal',
        wall: 'metalShed', roof: 'roofTin', roofKind: 'flat', floor: 'floorConcrete', door: 1, doorAt: 2 });
      if (big) T.prop('vent', (big.i0 + 1) * C, (big.k0 + 1.5) * C, { y: 7.5 });
    }
    for (let n = 0, t = 0; n < 9 && t < 60; t++) {
      const along = T.r() < 0.5, i0 = Math.round((cx + (T.r() - 0.5) * 80) / C), k0 = Math.round((cz + (T.r() - 0.5) * 80) / C);
      if (T.add({ kind: 'container', i0, k0, w: along ? 2 : 1, d: along ? 1 : 2, stories: 1, mat: 'metal', margin: 1,
        wall: pick(T.r, CONTAINERS), roof: 'roofTin', roofKind: 'flat', floor: 'metal', door: along ? 2 : 0, doorAt: 0 })) n++;
    }
    T.prop('waterTower', cx + 30, cz - 2);
    T.prop('crane', cx - 4, cz - 2, { rot: 0.6 });
    for (let n = 0; n < 4; n++) T.cars.push({ x: cx - 30 + n * 18, z: cz + 34 - (n % 2) * 4, rot: T.r() * 6 });
  },
  farm(T) {
    const { cx, cz } = T;
    T.pad({ kind: 'dirt', x: cx, z: cz, r: 28 });
    T.add({ kind: 'barn', i0: cx / C - 1, k0: cz / C - 6, w: 3, d: 4, stories: 2, hollow: true, mat: 'wood', wall: 'barnRed', roof: 'roofTin', roofKind: 'gable', floor: 'floorWood', door: 1, doorAt: 1 });
    T.add({ kind: 'house', i0: cx / C - 7, k0: cz / C, w: 2, d: 3, stories: 2, mat: 'wood', wall: 'sidingWhite', roof: 'roofGreen', roofKind: 'gable', floor: 'floorWood', door: 3, doorAt: 1 });
    T.add({ kind: 'shed', i0: cx / C + 4, k0: cz / C + 2, w: 2, d: 2, stories: 1, mat: 'wood', wall: 'barnRed', roof: 'roofTin', roofKind: 'gable', floor: 'floorWood', door: 2, doorAt: 1 });
    T.prop('silo', cx + 14, cz - 22); T.prop('silo', cx + 21, cz - 18, { s: 0.85 });
    T.prop('windmill', cx - 26, cz - 24);
    for (let n = 0; n < 7; n++) T.prop('hay', cx - 12 + T.r() * 30, cz + 10 + T.r() * 14, { rot: T.r() * 3 });
    // crop fields around the yard
    for (const [dx, dz, w, d] of [[-75, -40, 40, 55], [40, -20, 45, 40], [-40, 40, 60, 35], [30, 35, 40, 38]]) {
      const x0 = cx + dx, z0 = cz + dz;
      T.pads.push({ kind: 'field', x0, z0, x1: x0 + w, z1: z0 + d, alongX: (dx + dz) % 2 === 0 });
      T.prop('fence', x0 + w / 2, z0 - 1, { len: w, rot: Math.PI / 2 }); T.prop('fence', x0 + w / 2, z0 + d + 1, { len: w, rot: Math.PI / 2 });
    }
    T.cars.push({ x: cx + 2, z: cz + 4, rot: 0.3 });
  },
  harbor(T) {
    const { cx, cz, R } = T, zs = cz - 12;
    T.street(cx - R, zs - 4, cx + R, zs + 4);
    T.rowX(zs, cx - R, cx + R, [-1], house);
    T.rowX(zs, cx - R, cx + R, [1], (r) => ({ kind: 'shed', w: 3, d: 2, stories: 1, mat: r() < 0.5 ? 'metal' : 'wood',
      wall: r() < 0.5 ? 'metalShed' : 'sidingDrift', roof: 'roofTin', roofKind: 'gable', floor: 'floorConcrete' }));
    T.pad({ kind: 'concrete', x: cx + 10, z: cz + 18, r: 26 });
    const s = shoreToward(cx, cz, BAY.x, BAY.z);
    if (s) for (const off of [-16, 16]) {
      const ox = Math.cos(s.rot) * off, oz = -Math.sin(s.rot) * off;
      T.prop('pier', s.x + ox - Math.sin(s.rot) * 8, s.z + oz - Math.cos(s.rot) * 8, { len: 34, rot: s.rot });
      T.prop('boat', s.x + ox * 1.6 + Math.sin(s.rot) * 18, s.z + oz * 1.6 + Math.cos(s.rot) * 18, { rot: s.rot + 0.2 });
    }
    T.lamps(cx - R, zs + 5.5, cx + R, zs + 5.5);
    T.cars.push({ x: cx - 10, z: zs + 2.2, rot: Math.PI / 2 }, { x: cx + 20, z: cz + 14, rot: 1 });
  },
  camp(T) {
    T.pad({ kind: 'dirt', x: T.cx, z: T.cz, r: 16, claim: true });
    T.prop('campfire', T.cx, T.cz);
    for (let n = 0; n < 3; n++) { const a = n * 2.1 + 0.4; T.prop('bench', T.cx + Math.cos(a) * 4.5, T.cz + Math.sin(a) * 4.5, { rot: -a }); }
    T.scatter(6, (r) => ({ kind: 'cabin', w: 2, d: 2 + (r() < 0.4), stories: r() < 0.25 ? 2 : 1, mat: 'wood', wall: 'logWall', roof: r() < 0.5 ? 'roofBrown' : 'roofGreen', roofKind: 'gable', floor: 'floorWood' }));
    T.prop('lookout', T.cx + 22, T.cz - 20);
  },
  snow(T) {
    T.pad({ kind: 'stone', x: T.cx, z: T.cz, r: 9, claim: true });
    T.add({ kind: 'lodge', i0: T.cx / C - 2, k0: T.cz / C - 6, w: 4, d: 3, stories: 2, mat: 'wood', wall: 'logWall', roof: 'roofSnow', roofKind: 'gable', floor: 'floorWood', door: 1, doorAt: 2 });
    T.scatter(3, () => ({ kind: 'cabin', w: 2, d: 2, stories: 1, mat: 'wood', wall: 'logWall', roof: 'roofSnow', roofKind: 'gable', floor: 'floorWood' }));
    T.prop('campfire', T.cx, T.cz + 3);
  },
  mansion(T) {
    const { cx, cz } = T;
    T.pad({ kind: 'asphalt', x: cx, z: cz + 4, r: 9 });
    T.add({ kind: 'mansion', i0: cx / C - 5, k0: cz / C - 5, w: 4, d: 3, stories: 2, mat: 'brick', wall: 'stuccoWhite', roof: 'roofGrey', roofKind: 'gable', floor: 'floorTile', door: 1, doorAt: 2 });
    T.add({ kind: 'mansion', i0: cx / C + 2, k0: cz / C - 3, w: 3, d: 4, stories: 2, mat: 'brick', wall: 'stuccoPeach', roof: 'roofBlue', roofKind: 'gable', floor: 'floorTile', door: 2, doorAt: 2 });
    T.pad({ kind: 'pool', x0: cx - 26, z0: cz + 6, x1: cx - 12, z1: cz + 14, claim: true });
    T.pad({ kind: 'pool', x0: cx + 4, z0: cz + 18, x1: cx + 18, z1: cz + 26, claim: true });
    T.prop('hedge', cx - 12, cz - 30, { len: 30, rot: Math.PI / 2 });
    T.cars.push({ x: cx + 2, z: cz + 6, rot: 2.2 });
  },
  ruins(T) {
    const { cx, cz } = T;
    T.pad({ kind: 'stone', x0: cx - 22, z0: cz - 22, x1: cx + 22, z1: cz + 22 });
    T.add({ kind: 'keep', i0: cx / C - 1, k0: cz / C - 2, w: 3, d: 3, stories: 2, mat: 'brick', wall: 'stone', roof: 'stoneFloor', roofKind: 'flat', floor: 'stoneFloor', door: 1, doorAt: 1, broken: 0.15 });
    T.buildings.push({ kind: 'walls', i0: cx / C - 4, k0: cz / C - 4, w: 9, d: 9, stories: 1, mat: 'brick', wall: 'stone', roofKind: 'none', noFloor: true, broken: 0.35, door: 1, doorAt: 4 });
    for (const [dx, dz] of [[-20, -20], [25, -20], [-20, 25], [25, 25]]) T.prop('tower', cx + dx, cz + dz);
  },
  desert(T) {
    const { cx, cz, R } = T;
    T.street(cx - R, cz - 4, cx + R, cz + 4);
    T.pad({ kind: 'asphalt', x0: cx - 2, z0: cz - 22, x1: cx + 26, z1: cz - 5 });
    T.prop('canopy', cx + 12, cz - 13);
    T.add({ kind: 'shop', i0: (cx - 2) / C - 3, k0: (cz - 22) / C, w: 3, d: 2, stories: 1, mat: 'brick', wall: 'stuccoPeach', front: 'shopfront', roof: 'roofTar', roofKind: 'flat', floor: 'floorTile', door: 1, doorAt: 1 });
    T.rowX(cz, cx - R, cx + R, [1], (r) => ({ kind: 'trailer', w: 2, d: 1 + (r() < 0.3), stories: 1, mat: 'metal', wall: 'trailer', roof: 'roofTin', roofKind: 'flat', floor: 'floorWood' }));
    T.prop('waterTower', cx - 24, cz - 18, { s: 0.8 });
    T.cars.push({ x: cx + 8, z: cz - 13, rot: 0 }, { x: cx - 20, z: cz + 2.2, rot: Math.PI / 2 });
  },
  lighthouse(T) {
    const { cx, cz } = T;
    T.pad({ kind: 'stone', x: cx + 6, z: cz, r: 9 });
    T.prop('lighthouse', cx + 6, cz);
    T.add({ kind: 'house', i0: cx / C - 3, k0: cz / C - 1, w: 2, d: 2, stories: 1, mat: 'brick', wall: 'sidingWhite', roof: 'roofRed', roofKind: 'gable', floor: 'floorWood', door: 3, doorAt: 1 });
  },
  lakeside(T) {
    T.scatter(5, (r) => house(r, { stories: r() < 0.3 ? 2 : 1, d: 2 }));
    const s = shoreToward(T.cx, T.cz, LAKE.x, LAKE.z);
    if (s) {
      T.prop('pier', s.x - Math.sin(s.rot) * 6, s.z - Math.cos(s.rot) * 6, { len: 24, rot: s.rot });
      T.prop('boat', s.x + Math.sin(s.rot) * 12 + 6, s.z + Math.cos(s.rot) * 12, { rot: s.rot + 1.2, s: 0.7 });
    }
  },
  track(T) {
    const { cx, cz } = T;
    T.pad({ kind: 'track', x: cx, z: cz, rx: 40, rz: 24, w: 5 });
    T.add({ kind: 'garage', i0: cx / C - 2, k0: cz / C - 1, w: 4, d: 2, stories: 1, mat: 'metal', wall: 'metalShed', roof: 'roofTin', roofKind: 'flat', floor: 'floorConcrete', door: 1, doorAt: 1 });
    T.prop('bleachers', cx, cz - 33, { len: 34 });
    T.prop('bleachers', cx, cz + 33, { len: 26, rot: Math.PI });
    T.prop('arch', cx + 40, cz, { rot: 0 });
    for (let n = 0; n < 3; n++) T.cars.push({ x: cx - 30 + n * 6, z: cz - 22, rot: Math.PI / 2 });
  },
  quarry(T) {
    const { cx, cz } = T;
    T.pad({ kind: 'gravel', x: cx, z: cz, r: T.poi.r * 0.9 });
    T.add({ kind: 'shed', i0: cx / C - 5, k0: cz / C - 4, w: 3, d: 2, stories: 1, mat: 'metal', wall: 'metalShed', roof: 'roofTin', roofKind: 'gable', floor: 'floorConcrete', door: 1, doorAt: 1 });
    T.add({ kind: 'shed', i0: cx / C + 2, k0: cz / C + 2, w: 2, d: 2, stories: 2, mat: 'metal', wall: 'metalShed', roof: 'roofTin', roofKind: 'flat', floor: 'floorConcrete', door: 2, doorAt: 1 });
    T.prop('conveyor', cx + 4, cz - 12, { rot: 0.4 });
    for (let n = 0; n < 4; n++) T.prop('gravelPile', cx - 20 + n * 12, cz + 18 - (n % 2) * 8, { s: 0.8 + T.r() * 0.6 });
    T.cars.push({ x: cx - 12, z: cz + 6, rot: 1.1 });
  },
  cove(T) {
    const { cx, cz } = T;
    T.prop('wreck', cx + 12, cz + 10, { rot: -0.5 });
    T.scatter(2, () => ({ kind: 'shed', w: 2, d: 2, stories: 1, mat: 'wood', wall: 'sidingDrift', roof: 'roofTin', roofKind: 'gable', floor: 'floorWood' }));
    for (let n = 0; n < 5; n++) T.prop(n % 2 ? 'crate' : 'barrel', cx - 8 + T.r() * 20, cz - 6 + T.r() * 16, { rot: T.r() * 3 });
  },
};

let towns = null;
export function getTowns() {
  if (!towns) towns = POIS.map((poi) => { const T = site(poi); LAYOUT[poi.type]?.(T); return T; });
  return towns;
}
