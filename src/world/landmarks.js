import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID } from '../config.js';
import { R, addStatic } from '../physics.js';
import { getHeight } from './terrain.js';

// Town props (lamps, fountains, bridges, towers...). Everything is merged into two meshes:
// `body` (lit, shadowed) and `glow` (unlit bulbs / flames / water spout).

const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0), ZAX = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4();
const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

let M = new THREE.Matrix4(); // current prop transform
let BODY = [], GLOW = [], LL = 0, Y0 = 0, barrelN = 0, seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const sh = (hex, dl) => new THREE.Color(hex).offsetHSL(0, 0, dl);
const hash = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); };

// Transform a local-space geometry by (pos, rot/quat, scale) then the prop matrix; paint it; queue it.
function put(g, x, y, z, col, o = {}) {
  if (o.q) _q.copy(o.q); else if (o.r) _q.setFromEuler(_e.set(o.r[0] || 0, o.r[1] || 0, o.r[2] || 0)); else _q.identity();
  _m.compose(_p.set(x, y, z), _q, o.s ? _v.set(o.s[0], o.s[1], o.s[2]) : ONE);
  g.applyMatrix4(_m).applyMatrix4(M);
  if (g.index) g = g.toNonIndexed();
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(col);
  if (!o.glow && !o.nj) c.offsetHSL(0, 0, (rnd() - 0.5) * 0.08);
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  (o.glow ? GLOW : BODY).push(g);
}
// Base-anchored primitives (y = bottom, x/z = center).
const box = (w, h, d, x, y, z, c, o) => put(new THREE.BoxGeometry(w, h, d), x, y + h / 2, z, c, o);
const cyl = (rt, rb, h, x, y, z, c, o = {}) => put(new THREE.CylinderGeometry(rt, rb, h, o.seg || 10, 1, !!o.open), x, y + h / 2, z, c, o);
const sph = (r, x, y, z, c, o = {}) => put(new THREE.IcosahedronGeometry(r, o.d ?? 1), x, y, z, c, o); // centered
const dome = (r, x, y, z, c, o = {}) => put(new THREE.SphereGeometry(r, o.seg || 14, 6, 0, PI * 2, o.low ? PI / 2 : 0, PI / 2), x, y, z, c, o);
const tor = (r, t, x, y, z, c, o = {}) => put(new THREE.TorusGeometry(r, t, 6, o.seg || 16), x, y, z, c, o); // centered, faces z
// Box / rod between two local points.
function beam(a, b, tw, th, c, o = {}) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length();
  put(new THREE.BoxGeometry(tw, th, L), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, c, { ...o, q: new THREE.Quaternion().setFromUnitVectors(ZAX, _d.normalize()) });
}
function rod(a, b, r, c, o = {}) {
  _d.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const L = _d.length();
  put(new THREE.CylinderGeometry(r, r, L, o.seg || 6), (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, c, { ...o, q: new THREE.Quaternion().setFromUnitVectors(UP, _d.normalize()) });
}
// n boxes around a circle (w tangent, d radial), each facing outward.
function ring(n, Rr, w, h, d, y, c, o = {}) {
  for (let i = 0; i < n; i++) { const a = (i / n) * PI * 2; box(w, h, d, Math.sin(a) * Rr, y, Math.cos(a) * Rr, c, { ...o, r: [0, a, 0] }); }
}
const lumpy = (g, amt) => {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + amt * (hash(Math.round(x * 20), Math.round(y * 20), Math.round(z * 20)) - 0.5); p.setXYZ(i, x * k, y * k, z * k); }
  g.computeVertexNormals(); return g;
};

// Static collider: local center + half extents, transformed by the prop matrix (and optional extra local tilt quaternion).
function coll(k, lx, ly, lz, a, b, c, tilt) {
  M.decompose(_p2, _q2, _s2); const sc = _s2.x;
  _p.set(lx, ly, lz).applyMatrix4(M);
  const d = k === 'b' ? R.ColliderDesc.cuboid(a * sc, b * sc, c * sc) : k === 'c' ? R.ColliderDesc.cylinder(a * sc, b * sc) : R.ColliderDesc.ball(a * sc);
  const q = tilt ? _q2.clone().multiply(tilt) : _q2;
  d.setTranslation(_p.x, _p.y, _p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
  addStatic(d, { kind: 'static' });
}

const WOOD = '#8b6a45', WOOD_D = '#5d4330', STEEL = '#7d8a93', STONE = '#d9d2c3', WHITE = '#f4f1e8';
const STRIPES = ['#e0453a', '#2f7fe0', '#2fae6e', '#f2a516'];

const B = {
  lamp() {
    cyl(0.26, 0.34, 0.3, 0, 0, 0, '#2e3b37', { seg: 6 });
    cyl(0.1, 0.12, 5.2, 0, 0, 0, '#3a4a45', { seg: 8, open: true });
    beam([0, 5.0, 0], [1.2, 5.4, 0], 0.1, 0.1, '#3a4a45');
    cyl(0, 0.42, 0.25, 1.2, 5.42, 0, '#f1e7c8', { seg: 6 });
    sph(0.2, 1.2, 5.3, 0, '#fff2c4', { d: 0, glow: true });
    coll('c', 0, 2.6, 0, 2.6, 0.15, 0);
  },
  fountain() {
    cyl(3.4, 3.4, 0.3, 0, 0, 0, '#bdb5a4', { seg: 16 });
    ring(16, 3.4, 1.5, 0.7, 0.4, 0, STONE, { nj: false });
    ring(16, 3.4, 1.55, 0.12, 0.6, 0.7, '#e8e1d2');
    cyl(3.2, 3.2, 0.05, 0, 0.45, 0, '#5fc8f0', { seg: 16, nj: true });
    cyl(0.4, 0.6, 1.5, 0, 0.3, 0, '#c9c1b0');
    cyl(1.1, 0.5, 0.35, 0, 1.5, 0, STONE, { seg: 14 });
    cyl(0.95, 0.95, 0.05, 0, 1.82, 0, '#5fc8f0', { seg: 14, nj: true });
    cyl(0.1, 0.18, 0.9, 0, 1.85, 0, '#bff0ff', { seg: 8, glow: true });
    sph(0.32, 0, 2.8, 0, '#bff0ff', { d: 1, glow: true });
    coll('c', 0, 0.35, 0, 0.35, 3.6, 0);
    coll('c', 0, 0.9, 0, 0.9, 0.5, 0);
  },
  awning(p) {
    const w = p.w || 6, n = Math.max(1, Math.ceil(w)), sw = w / n, ang = Math.atan2(0.6, 2), len = Math.hypot(2, 0.6);
    const c2 = STRIPES[Math.abs(Math.floor(p.x * 7.3)) % 4];
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (i + 0.5) * sw, c = i % 2 ? WHITE : c2;
      put(new THREE.BoxGeometry(sw, 0.06, len), x, 2.7, 1.0, c, { r: [ang, 0, 0] });
      box(sw, 0.25, 0.05, x, 2.15, 2.0, c);
    }
    box(w, 0.08, 0.08, 0, 2.96, 0.04, '#4a4f55');
  },
  bridge(p) {
    const len = p.len || 24, h = len / 2, n = Math.max(1, Math.floor(len / 0.9));
    for (let i = 0; i < n; i++) box(8, 0.12, len / n - 0.06, 0, 0.03, -h + (i + 0.5) * len / n, '#a9784a');
    for (const sx of [-3, 3]) box(0.5, 0.6, len, sx, -0.57, 0, '#6a4a30');
    const m = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i <= m; i++) for (const sx of [-3.85, 3.85]) box(0.2, 1, 0.2, sx, 0.15, -h + i * len / m, '#7a5535');
    for (const sx of [-3.85, 3.85]) { box(0.14, 0.14, len, sx, 0.95, 0, '#8d6340'); box(0.1, 0.1, len, sx, 0.55, 0, '#7a5535'); }
    const k = Math.max(2, Math.round(len / 8) + 1), yb = -3 - Y0;
    for (let i = 0; i < k; i++) for (const sx of [-3, 3]) cyl(0.5, 0.62, -0.57 - yb, sx, yb, -h + 1 + i * (len - 2) / (k - 1), '#8a857b', { seg: 8 });
    coll('b', 0, 0, 0, 4, 0.15, h);
    for (const sx of [-3.9, 3.9]) coll('b', sx, 0.65, 0, 0.1, 0.5, h);
  },
  vent() {
    box(2.3, 0.15, 1.7, 0, 0, 0, '#6e757c');
    box(2.2, 1.05, 1.6, 0, 0.15, 0, '#a9b1b8');
    for (let i = 0; i < 3; i++) box(1.5, 0.08, 0.05, 0, 0.4 + i * 0.25, 0.81, '#6e757c');
    cyl(0.55, 0.55, 0.08, -0.3, 1.2, 0, '#3a3f44', { seg: 12 });
    tor(0.55, 0.05, -0.3, 1.25, 0, '#8a9299', { r: [PI / 2, 0, 0] });
    box(1.0, 0.04, 0.08, -0.3, 1.28, 0, '#8a9299'); box(0.08, 0.04, 1.0, -0.3, 1.28, 0, '#8a9299');
    cyl(0.14, 0.14, 0.9, 0.7, 1.2, 0.4, '#9aa0a6'); cyl(0.2, 0.2, 0.08, 0.7, 2.1, 0.4, '#6e757c');
    coll('b', 0, 0.6, 0, 1.1, 0.6, 0.8);
  },
  waterTower() {
    const lg = (y) => 3 - 0.05 * y, RB = '#6b3a2e';
    const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    for (const [sx, sz] of cs) rod([sx * 3, 0, sz * 3], [sx * lg(12), 12, sz * lg(12)], 0.18, RB);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4];
      for (let j = 0; j < 3; j++) {
        const y0 = j * 4, y1 = y0 + 4;
        beam([ax * lg(y0), y0, az * lg(y0)], [bx * lg(y1), y1, bz * lg(y1)], 0.1, 0.1, '#8a5340');
        if (j) beam([ax * lg(y0), y0, az * lg(y0)], [bx * lg(y0), y0, bz * lg(y0)], 0.16, 0.16, RB);
      }
    }
    cyl(3.9, 3.9, 0.2, 0, 11.8, 0, '#55575c', { seg: 16 });
    cyl(3.2, 3.2, 4.5, 0, 12, 0, '#c9d4dc', { seg: 16 });
    cyl(3.25, 3.25, 0.7, 0, 13.6, 0, '#e0453a', { seg: 16 });
    cyl(0.4, 3.5, 1.6, 0, 16.5, 0, '#8a3b30', { seg: 16 });
    sph(0.28, 0, 18.2, 0, '#6b3a2e', { d: 1 });
    ring(12, 3.7, 0.1, 1.0, 0.1, 12, '#55575c');
    tor(3.7, 0.06, 0, 13.0, 0, '#55575c', { r: [PI / 2, 0, 0], seg: 24 });
    for (const [sx, sz] of cs) coll('c', sx * 2.7, 6, sz * 2.7, 6, 0.3, 0);
    coll('c', 0, 14.25, 0, 2.25, 3.2, 0);
  },
  crane() {
    const Y = '#f2b61f', DK = '#3a3f44', CON = '#a5a39b';
    box(5, 1, 5, 0, 0, 0, CON);
    box(1.6, 26, 1.6, 0, 1, 0, Y);
    for (let f = 0; f < 4; f++) {
      const a = f * PI / 2, fp = (u, y) => [u * Math.cos(a) + 0.82 * Math.sin(a), y, -u * Math.sin(a) + 0.82 * Math.cos(a)];
      for (let y = 1; y < 27; y += 3) { beam(fp(-0.75, y), fp(0.75, y + 3), 0.12, 0.12, DK); }
    }
    box(1.9, 2, 2.2, 1.75, 22, 0.2, Y); box(2.1, 0.12, 2.4, 1.75, 24, 0.2, DK);
    box(1.5, 0.9, 0.05, 1.75, 22.7, 1.33, '#2c4a73', { nj: true });
    // jib + counter-jib
    box(0.3, 0.3, 22, 0, 28.0, 11, Y); box(0.3, 0.3, 22, 0, 27.0, 11, Y);
    for (let z = 0; z < 22; z += 2) beam([0, 27.15, z], [0, 28.15, z + 2], 0.1, 0.1, DK);
    box(0.3, 0.3, 8, 0, 28.0, -8, Y); box(0.3, 0.3, 8, 0, 27.0, -8, Y);
    for (let z = -8; z < 0; z += 2) beam([0, 27.15, z], [0, 28.15, z + 2], 0.1, 0.1, DK);
    box(2.4, 1.6, 1.6, 0, 25.4, -6.5, CON); box(2.4, 0.3, 1.6, 0, 27.0, -6.5, '#8a8880');
    box(0.8, 4, 0.8, 0, 28.3, 0, Y);
    rod([0, 32.2, 0], [0, 28.2, 21.8], 0.05, DK); rod([0, 32.2, 0], [0, 28.2, -7.8], 0.05, DK);
    box(1.0, 0.5, 1.2, 0, 26.4, 14, DK);
    rod([0, 26.4, 14], [0, 10.2, 14], 0.04, '#2c3036'); box(0.6, 0.8, 0.5, 0, 9.4, 14, Y);
    tor(0.22, 0.05, 0, 9.1, 14, '#2c3036', { r: [0, PI / 2, 0] });
    coll('b', 0, 0.5, 0, 2.5, 0.5, 2.5);
    coll('b', 0, 14, 0, 0.8, 13, 0.8);
  },
  silo(p) {
    const H = 13 / 6;
    for (let i = 0; i < 6; i++) { const r = 3 + (i % 2) * 0.05; cyl(r, r, H, 0, i * H, 0, sh('#b9c8d4', ((i * 7) % 5 - 2) * 0.012), { seg: 16, nj: true }); }
    cyl(3.2, 3.2, 0.5, 0, 0, 0, '#9c9a94', { seg: 16 });
    dome(3, 0, 13, 0, '#9fb4c4', { seg: 16 });
    sph(0.25, 0, 16.05, 0, '#6e757c', { d: 1 });
    for (const sx of [-0.3, 0.3]) box(0.06, 12.6, 0.1, sx, 0.4, 3.08, '#4a4f55');
    for (let y = 0.8; y < 12.8; y += 0.8) box(0.66, 0.06, 0.1, 0, y, 3.1, '#4a4f55');
    coll('c', 0, 6.5, 0, 6.5, 3, 0);
  },
  windmill() {
    const lg = (y) => 1.3 - 0.8 * y / 11;
    const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]];
    for (const [sx, sz] of cs) rod([sx * 1.3, 0, sz * 1.3], [sx * 0.5, 11, sz * 0.5], 0.07, STEEL);
    for (let i = 0; i < 4; i++) {
      const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4];
      for (let j = 0; j < 3; j++) {
        const y0 = j * 3.67, y1 = y0 + 3.67;
        beam([ax * lg(y0), y0, az * lg(y0)], [bx * lg(y1), y1, bz * lg(y1)], 0.05, 0.05, WOOD);
        if (j) beam([ax * lg(y0), y0, az * lg(y0)], [bx * lg(y0), y0, bz * lg(y0)], 0.09, 0.09, WOOD_D);
      }
    }
    box(1.6, 0.15, 1.6, 0, 10.95, 0, WOOD);
    box(0.6, 0.5, 1.1, 0, 11.1, 0.1, '#5e6a72');
    cyl(0.2, 0.2, 0.5, 0, 11.85, 0.75, '#5e6a72', { r: [PI / 2, 0, 0], seg: 8 });
    tor(2.4, 0.04, 0, 12.1, 0.95, '#8a9299', { seg: 24 });
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * PI * 2, rm = 1.4;
      box(0.45, 2.1, 0.04, Math.cos(a) * rm, 12.1 + Math.sin(a) * rm - 1.05, 0.95, i % 2 ? '#e8edf0' : '#b9c4cc', { r: [0.25, 0, a - PI / 2] });
    }
    rod([0, 12.0, 0], [0, 12.1, -2.4], 0.05, STEEL); box(0.04, 1.0, 1.3, 0, 11.6, -3.0, '#d9473c');
    coll('b', 0, 5.5, 0, 0.7, 5.5, 0.7);
  },
  hay() {
    cyl(0.85, 0.85, 1.4, 0, 0.15, 0, '#e6c35a', { seg: 12, r: [0, 0, PI / 2], nj: false });
    put(new THREE.CylinderGeometry(0.86, 0.86, 0.02, 12), 0.7, 0.85, 0, '#b99132', { r: [0, 0, PI / 2] });
    put(new THREE.CylinderGeometry(0.86, 0.86, 0.02, 12), -0.7, 0.85, 0, '#b99132', { r: [0, 0, PI / 2] });
    for (const x of [-0.3, 0.3]) put(new THREE.CylinderGeometry(0.87, 0.87, 0.06, 12), x, 0.85, 0, '#c9a444', { r: [0, 0, PI / 2] });
    for (const s of [1, -1]) for (const [r, c] of [[0.62, '#a88328'], [0.38, '#b48d2e'], [0.15, '#a07a22']]) // rolled layers on each end
      put(new THREE.RingGeometry(r - 0.035, r + 0.035, 16), 0.715 * s, 0.85, 0, c, { r: [0, s * PI / 2, 0] });
    coll('b', 0, 0.85, 0, 0.7, 0.8, 0.8);
  },
  fence(p) {
    const len = p.len || 5, n = Math.max(1, Math.ceil(len / 2.5));
    for (let i = 0; i <= n; i++) box(0.15, 1.2, 0.15, 0, 0, -len / 2 + i * len / n, WHITE);
    box(0.06, 0.12, len, 0, 0.3, 0, '#ebe7da'); box(0.06, 0.12, len, 0, 0.8, 0, '#ebe7da');
    coll('b', 0, 0.6, 0, 0.075, 0.6, len / 2);
  },
  pier(p) {
    const len = p.len || 12, n = Math.floor(len / 0.36);
    for (let i = 0; i < n; i++) box(3.2, 0.12, 0.3, 0, 0.88, 0.2 + i * 0.36, '#a9784a');
    for (const sx of [-1.2, 1.2]) box(0.2, 0.3, len, sx, 0.58, len / 2, '#6a4a30');
    for (let z = 0.5; z < len; z += 3) for (const sx of [-1.5, 1.5]) cyl(0.17, 0.2, 4.15 - (z > len - 1 ? 0.5 : 0), sx, -3, z, '#5d4330', { seg: 6 });
    for (const sx of [-1.3, 1.3]) cyl(0.17, 0.17, 0.5, sx, 1.0, len - 0.3, '#2e3b37', { seg: 8 });
    coll('b', 0, 0.85, len / 2, 1.6, 0.15, len / 2);
  },
  boat(p) {
    const blue = Math.abs(Math.floor(p.x * 3.1)) % 2, bot = blue ? '#2f5fa0' : '#d9473c';
    dome(1, 0, 0.5, 0, bot, { low: true, seg: 14, s: [1.3, 0.9, 3.5] });
    cyl(1, 1, 0.4, 0, 0.5, 0, '#f2efe6', { seg: 14, s: [1.3, 1, 3.5] });
    cyl(1, 1, 0.02, 0, 0.88, 0, '#b98a56', { seg: 14, s: [1.15, 1, 3.3] });
    box(1.7, 1.3, 2.0, 0, 0.9, -0.6, WHITE);
    box(1.95, 0.15, 2.3, 0, 2.2, -0.6, bot);
    for (const sx of [-0.86, 0.86]) box(0.04, 0.5, 0.8, sx, 1.4, -0.9, '#2c4a73', { nj: true });
    box(1.2, 0.5, 0.04, 0, 1.4, 0.42, '#2c4a73', { nj: true });
    cyl(0.06, 0.08, 3.2, 0, 0.9, 1.9, '#6e757c', { seg: 6 }); beam([0, 3.0, 1.9], [0, 2.1, 0.9], 0.04, 0.04, '#6e757c');
    coll('b', 0, 0.6, 0, 1.2, 0.6, 3.3);
  },
  campfire() {
    cyl(0.7, 0.8, 0.08, 0, 0, 0, '#2d221c', { seg: 10 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; sph(0.24, Math.sin(a), 0.12, Math.cos(a), '#8d8d92', { s: [1, 0.75, 1] }); }
    for (let i = 0; i < 3; i++) { const a = i * 2.1 + 0.4; rod([Math.sin(a) * 0.75, 0.1, Math.cos(a) * 0.75], [-Math.sin(a) * 0.2, 0.55, -Math.cos(a) * 0.2], 0.1, '#6b4a2e', { seg: 7 }); }
    cyl(0, 0.38, 1.0, 0, 0.1, 0, '#ff6a1f', { seg: 7, glow: true });
    for (let i = 0; i < 3; i++) { const a = i * 2.1; cyl(0, 0.22, 0.65, Math.sin(a) * 0.22, 0.1, Math.cos(a) * 0.22, '#ffb347', { seg: 6, glow: true }); }
  },
  bench() {
    cyl(0.25, 0.25, 2.0, 0, -0.55, 0, '#8b6a45', { r: [0, 0, PI / 2], seg: 8, s: [1, 1, 1] });
    for (const sx of [-0.7, 0.7]) cyl(0.28, 0.3, 0.35, sx, 0, 0, WOOD_D, { seg: 8 });
    coll('b', 0, 0.4, 0, 1, 0.3, 0.3);
  },
  lookout() {
    const cs = [[1, 1], [1, -1], [-1, -1], [-1, 1]], LG = '#7a5230';
    for (const [sx, sz] of cs) { rod([sx * 1.5, 0, sz * 1.5], [sx * 1.4, 7, sz * 1.4], 0.18, LG, { seg: 7 }); }
    for (let i = 0; i < 4; i++) {
      const [ax, az] = cs[i], [bx, bz] = cs[(i + 1) % 4];
      beam([ax * 1.45, 2.3, az * 1.45], [bx * 1.45, 2.3, bz * 1.45], 0.12, 0.12, WOOD_D);
      beam([ax * 1.45, 4.7, az * 1.45], [bx * 1.45, 4.7, bz * 1.45], 0.12, 0.12, WOOD_D);
      beam([ax * 1.48, 0.3, az * 1.48], [bx * 1.43, 4.7, bz * 1.43], 0.08, 0.08, WOOD_D);
    }
    box(3.5, 0.25, 3.5, 0, 6.75, 0, '#a8794a');
    for (const [sx, sz] of cs) { box(0.14, 1.0, 0.14, sx * 1.7, 7, sz * 1.7, LG); box(0.14, 3, 0.14, sx * 1.55, 7, sz * 1.55, LG); }
    for (const s of [-1, 1]) {
      box(3.5, 0.1, 0.1, 0, 7.9, s * 1.7, WOOD); box(3.5, 0.1, 0.1, 0, 7.45, s * 1.7, WOOD);
      if (s < 0) { box(0.1, 0.1, 3.5, s * 1.7, 7.9, 0, WOOD); box(0.1, 0.1, 3.5, s * 1.7, 7.45, 0, WOOD); box(0.1, 0.1, 3.5, -s * 1.7, 7.9, 0, WOOD); box(0.1, 0.1, 3.5, -s * 1.7, 7.45, 0, WOOD); }
    }
    box(3.4, 0.12, 3.4, 0, 9.95, 0, WOOD_D);
    cyl(0, 2.9, 1.3, 0, 10.07, 0, '#a3412f', { seg: 4, r: [0, PI / 4, 0] });
    for (const sx of [-0.4, 0.4]) rod([sx, 0, 2.0], [sx, 7.2, 1.55], 0.05, LG);
    for (let y = 0.4; y < 7; y += 0.5) box(0.8, 0.07, 0.07, 0, y, 2.0 - (y / 7.2) * 0.45, WOOD);
    for (const [sx, sz] of cs) coll('c', sx * 1.45, 3.5, sz * 1.45, 3.5, 0.22, 0);
    coll('b', 0, 6.875, 0, 1.75, 0.125, 1.75);
  },
  hedge(p) {
    const len = p.len || 6, n = Math.ceil(len / 0.75), G = ['#3f8f3a', '#4a9c42', '#357d33', '#47963e'];
    box(0.9, 0.7, len + 0.2, 0, 0, 0, '#2f6e2d');
    for (let i = 0; i < n; i++) sph(1, 0, 0.8 + (rnd() - 0.5) * 0.12, -len / 2 + (i + 0.5) * len / n + (rnd() - 0.5) * 0.15, G[i % 4], { s: [0.52, 0.62, 0.62] });
    coll('b', 0, 0.7, 0, 0.5, 0.7, len / 2);
  },
  tower() {
    cyl(3.5, 3.6, 0.6, 0, 0, 0, '#7e7a72', { seg: 14, nj: true });
    for (let i = 0; i < 10; i++) { const r = 3.2 + (i % 2) * 0.05; cyl(r, r, 1.04, 0, 0.6 + i * 1.04, 0, sh('#9a958c', (rnd() - 0.5) * 0.12), { seg: 14, nj: true }); }
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2; box(1.3, 0.5 + rnd() * 0.6, 0.7, Math.sin(a) * 3.0, 11, Math.cos(a) * 3.0, '#a39e94', { r: [0, a, 0] }); }
    for (const [a, y] of [[0.4, 5], [2.5, 8], [4.4, 3]]) box(0.25, 1.1, 0.25, Math.sin(a) * 3.2, y, Math.cos(a) * 3.2, '#2b2a30', { r: [0, a, 0], nj: true });
    coll('c', 0, 5.5, 0, 5.5, 3.2, 0);
  },
  canopy() {
    const W = '#f4f4f2', RED = '#e0453a';
    for (const sx of [-6.5, 6.5]) for (const sz of [-3.5, 3.5]) { box(0.4, 5, 0.4, sx, 0, sz, W); box(0.44, 0.5, 0.44, sx, 0.3, sz, RED); coll('b', sx, 2.5, sz, 0.2, 2.5, 0.2); }
    box(16, 0.8, 10, 0, 5, 0, W);
    for (const s of [-1, 1]) { box(16.1, 0.5, 0.12, 0, 5.15, s * 5.0, RED); box(0.12, 0.5, 10.1, s * 8.0, 5.15, 0, RED); }
    box(15.6, 0.1, 9.6, 0, 4.95, 0, '#d9d9d6');
    coll('b', 0, 5.4, 0, 8, 0.4, 5);
    for (const sx of [-3, 3]) {
      box(1.0, 0.2, 3.2, sx, 0, 0, '#a5a39b');
      [[-0.9, '#e0453a'], [0.9, '#2f7fe0']].forEach(([z, c]) => {
        box(0.6, 1.5, 0.5, sx, 0.2, z, c); box(0.4, 0.4, 0.04, sx, 1.0, z + 0.27, '#2b3a4a', { nj: true }); box(0.7, 0.12, 0.6, sx, 1.7, z, '#3a3f44');
        coll('b', sx, 0.95, z, 0.3, 0.75, 0.25);
      });
    }
  },
  lighthouse() {
    const rr = (y) => 3.6 - y / 19;
    cyl(4.3, 4.4, 0.9, 0, 0, 0, '#8c8a86', { seg: 14 });
    for (let i = 0; i < 4; i++) { const y0 = i * 4.75, y1 = y0 + 4.75; cyl(rr(y1), rr(y0), 4.75, 0, y0, 0, i % 2 ? '#f4f1e8' : '#d9473c', { seg: 16 }); }
    box(1.0, 2, 0.4, 0, 0.7, 3.5, '#4a2e2a', { nj: true });
    for (const [a, y] of [[1.2, 7], [3.0, 11], [5.0, 15]]) box(0.25, 0.9, 0.3, Math.sin(a) * (rr(y) - 0.05), y, Math.cos(a) * (rr(y) - 0.05), '#2b3a4a', { r: [0, a, 0], nj: true });
    cyl(3.7, 3.7, 0.25, 0, 19, 0, '#3a3f44', { seg: 16 });
    ring(14, 3.55, 0.12, 1.0, 0.12, 19.25, '#3a3f44');
    tor(3.55, 0.06, 0, 20.25, 0, '#3a3f44', { r: [PI / 2, 0, 0], seg: 24 });
    cyl(1.5, 1.5, 1.8, 0, 19.25, 0, '#bfe9ff', { seg: 12, nj: true });
    cyl(0.7, 0.7, 1.0, 0, 19.65, 0, '#fff6c8', { seg: 10, glow: true });
    ring(6, 1.5, 0.14, 1.8, 0.14, 19.25, '#3a3f44');
    cyl(0.2, 2.0, 1.6, 0, 21.05, 0, '#8a2a28', { seg: 12 });
    sph(0.22, 0, 22.8, 0, '#3a3f44', { d: 1 });
    coll('c', 0, 11, 0, 11, 3.4, 0);
  },
  bleachers(p) {
    const len = p.len || 10, n = Math.max(1, Math.round(len / 2)), sw = len / n, G = '#7b838a';
    for (let i = 0; i < 5; i++) {
      const top = 0.5 * (i + 1), z = -i * 0.9;
      for (let j = 0; j < n; j++) box(sw - 0.05, 0.1, 0.5, -len / 2 + (j + 0.5) * sw, top - 0.1, z + 0.15, (i + j) % 2 ? WHITE : '#2f7fe0');
      box(len, 0.4, 0.06, 0, top - 0.5, z + 0.43, '#9aa2a8');
      coll('b', 0, top / 2, z, len / 2, top / 2, 0.45);
    }
    const cnt = Math.floor(len / 3) + 1;
    for (let i = 0; i < cnt; i++) {
      const x = cnt > 1 ? -len / 2 + 0.15 + i * (len - 0.3) / (cnt - 1) : 0;
      beam([x, 0.1, 0.5], [x, 2.4, -3.7], 0.1, 0.1, G); box(0.1, 2.5, 0.1, x, 0, -3.7, G); box(0.1, 0.1, 4.4, x, 0, -1.6, G);
    }
  },
  arch() {
    for (const sx of [-6.5, 6.5]) { box(1, 6.5, 1, sx, 0, 0, '#d8d6d0'); box(1.06, 0.4, 1.06, sx, 0, 0, '#3a3f44'); box(1.1, 0.25, 1.1, sx, 6.5, 0, '#3a3f44'); coll('b', sx, 3.25, 0, 0.5, 3.25, 0.5); }
    box(14.2, 0.25, 0.7, 0, 6.5, 0, '#3a3f44');
    for (let r = 0; r < 2; r++) for (let i = 0; i < 10; i++) box(1.2, 0.7, 0.4, -5.4 + i * 1.2, 6.75 + r * 0.7, 0, (i + r) % 2 ? '#f4f4f2' : '#1b1b1f', { nj: true });
  },
  conveyor() {
    const th = Math.atan2(7.5, 20), yz = (z) => 0.5 + 7.5 * (z + 10) / 20, DK = '#5b6168';
    const a = [0, 0.5, -10], b = [0, 8, 10];
    beam(a, b, 1.0, 0.15, '#26282c', { nj: true });
    for (const sx of [-0.7, 0.7]) beam([sx, 0.4, -10], [sx, 7.9, 10], 0.15, 0.4, '#f2b61f');
    for (let z = -10; z <= 10; z += 5) {
      const hy = yz(z) - 0.3;
      for (const sx of [-1, 1]) { beam([sx * 1.0, 0, z], [sx * 0.55, hy, z], 0.12, 0.12, DK); coll('b', sx * 0.78, hy / 2, z, 0.12, hy / 2, 0.12); }
      box(1.3, 0.12, 0.14, 0, hy - 0.06, z, DK);
    }
    cyl(0, 3.0, 2.4, 0, 0, 11.4, '#9a9387', { seg: 10 });
    sph(0.8, 1.6, 0.4, 10.4, '#8d867a', { d: 1, s: [1, 0.7, 1] }); sph(0.7, -1.3, 0.3, 12.4, '#a49d90', { d: 1, s: [1, 0.7, 1] });
  },
  gravelPile(p) {
    const s = p.s || 1;
    put(lumpy(new THREE.CylinderGeometry(0, 5, 3, 12, 4), 0.25), 0, 1.5, 0, '#9a9387');
    for (const [x, z, r] of [[2.6, -1.4, 1.5], [-2.2, 1.9, 1.3], [0.4, 3.0, 1.1]]) put(lumpy(new THREE.IcosahedronGeometry(r, 1), 0.3), x, r * 0.35, z, '#8d867a', { s: [1, 0.7, 1] });
    if (R.ColliderDesc.cone) { // cone collider: tapering like the pile
      M.decompose(_p2, _q2, _s2); _p.set(0, 1.5, 0).applyMatrix4(M);
      addStatic(R.ColliderDesc.cone(1.5 * s, 4.6 * s).setTranslation(_p.x, _p.y, _p.z).setRotation({ x: _q2.x, y: _q2.y, z: _q2.z, w: _q2.w }), { kind: 'static' });
    } else coll('c', 0, 1.2, 0, 1.2, 4, 0);
  },
  wreck() {
    const W1 = '#7a5a3c', W2 = '#5d4330', W3 = '#6b4d33', zs = [], NR = 9;
    for (let i = 0; i < NR; i++) zs.push(-5.4 + i * 1.35);
    const pt = (i, k, sd) => { const z = zs[i], w = 2.1 * Math.sqrt(Math.max(0, 1 - (z / 6.3) ** 2)) + 0.15, f = k * PI / 9; return [sd * w * Math.sin(f), 0.2 + 2.2 * (1 - Math.cos(f)), z]; };
    box(0.3, 0.3, 12, 0, 0, 0, W2);
    for (let i = 0; i < NR; i++) for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) beam(pt(i, k, sd), pt(i, k + 1, sd), 0.16, 0.16, W3);
    for (let i = 0; i < NR - 1; i++) for (let k = 1; k <= 4; k++) {
      beam(pt(i, k, 1), pt(i + 1, k, 1), 0.1, 0.2, W1);
      if (i < 3) beam(pt(i, k, -1), pt(i + 1, k, -1), 0.1, 0.2, W1);
    }
    rod([0, 0.2, 1], [0.3, 4.2, 1.2], 0.18, W2, { seg: 7 });
    cyl(0, 0.2, 0.5, 0.3, 4.2, 1.2, W1, { seg: 5 });
    beam([0.2, 3.0, 1.1], [2.8, 1.2, 1.5], 0.1, 0.1, W2);
    box(2.4, 1.6, 0.03, 1.5, 1.6, 1.3, '#e8dcc0', { r: [0, 0.1, -0.6], nj: false });
    box(1.1, 0.9, 0.03, -0.4, 1.9, 1.1, '#d9ceb0', { r: [0, 0, 0.2] });
    coll('b', 0, 1.1, 0, 2.3, 1.1, 6);
  },
  crate() {
    box(1.2, 1.2, 1.2, 0, 0, 0, '#b88650');
    for (const sx of [-0.6, 0.6]) for (const sz of [-0.6, 0.6]) box(0.14, 1.24, 0.14, sx, -0.02, sz, '#7a5230');
    for (const s of [-0.6, 0.6]) { box(1.3, 0.12, 0.12, 0, 1.12, s, '#7a5230'); box(0.12, 0.12, 1.3, s, 1.12, 0, '#7a5230'); }
    coll('b', 0, 0.6, 0, 0.6, 0.6, 0.6);
  },
  barrel() {
    const c = barrelN++ % 2 ? '#2f5fa0' : '#c4612a', dk = sh(c, -0.12);
    cyl(0.45, 0.45, 1.1, 0, 0, 0, c, { seg: 10 });
    for (const y of [0.22, 0.8]) cyl(0.465, 0.465, 0.07, 0, y, 0, dk, { seg: 10, nj: true });
    cyl(0.38, 0.38, 0.03, 0, 1.09, 0, dk, { seg: 10, nj: true });
    coll('c', 0, 0.55, 0, 0.55, 0.45, 0);
  },
};

export function createLandmarks(scene, towns) {
  BODY = []; GLOW = []; barrelN = 0; seed = 1;
  for (const T of towns || []) {
    LL = Math.round(T.poi.h / GRID.height) * GRID.height;
    for (const p of T.props || []) {
      const f = B[p.type];
      if (!f) continue;
      const t = p.type, gh = getHeight(p.x, p.z);
      Y0 = t === 'awning' || t === 'bridge' ? LL : t === 'vent' ? LL + (p.y || 0) : t === 'pier' || t === 'boat' ? 0 : t === 'wreck' ? gh - 0.8 : gh;
      const sc = p.s || 1;
      M.compose(_p.set(p.x, Y0, p.z), _q.setFromAxisAngle(UP, p.rot || 0), _v.set(sc, sc, sc));
      if (t === 'wreck') M.multiply(_m.makeRotationZ(-0.26));
      f(p);
    }
  }
  const mk = (parts, mat, shadow) => {
    if (!parts.length) return null;
    const m = new THREE.Mesh(mergeGeometries(parts), mat);
    m.castShadow = m.receiveShadow = shadow;
    scene.add(m);
    return m;
  };
  const body = mk(BODY, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }), true);
  const glow = mk(GLOW, new THREE.MeshBasicMaterial({ vertexColors: true }), false);
  BODY = []; GLOW = [];
  return { body, glow };
}
