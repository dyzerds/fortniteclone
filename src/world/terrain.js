import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, POIS } from '../config.js';
import { heightAt, desertAt, forestAt, snowAt, roadPaths, islandNoise as noise, islandNoise2 as noise2 } from './island.js';
import { makeNoise, fbm, rng, smoothstep, clamp, lerp } from '../util.js';
import { R, addStatic, removeCollider } from '../physics.js';
import { GRID } from '../config.js';
import { getTowns } from './towns.js';

const N = WORLD.res, SIZE = WORLD.size, STEP = SIZE / (N - 1), HALF = SIZE / 2;

export const heights = new Float32Array(N * N);
export const colors = new Float32Array(N * N * 3); // linear rgb per grid point, also used by the map

const C = (hex) => new THREE.Color(hex);
const PAL = {
  sand: C('#f2d9a2'), wetSand: C('#d6bf8a'), seabed: C('#58c4b6'),
  grassA: C('#5fbf3f'), grassB: C('#8fcf48'), grassC: C('#3f9e3a'), grassD: C('#b3d65a'), forest: C('#3d8f35'),
  rock: C('#9b8e84'), rockLight: C('#c4b6a6'), rockSnow: C('#93a2b8'),
  dirt: C('#b88a58'), field: C('#a8743f'),
  desert: C('#efc07e'), desertB: C('#e2a865'), mesa: C('#d27a4f'), mesaB: C('#b85f3d'),
  snow: C('#e4ebf3'), snowShade: C('#bccbe0'),
};
function computeColor(x, z, h, ny, out) {
  const n = fbm(noise2, x * 0.02, z * 0.02, 3);
  const n2 = noise(x * 0.06 + 40, z * 0.06);
  if (h < 0.4) return out.copy(PAL.seabed).lerp(PAL.wetSand, smoothstep(-4, 0.4, h));
  if (h < 2.0) return out.copy(PAL.sand);
  out.copy(PAL.grassA).lerp(PAL.grassB, smoothstep(-0.1, 0.6, n) * 0.8);
  out.lerp(PAL.grassC, smoothstep(0.1, 0.7, -n) * 0.7);
  out.lerp(PAL.grassD, smoothstep(0.55, 0.95, n2) * 0.35);
  out.lerp(PAL.forest, forestAt(x, z) * 0.75);
  out.lerp(PAL.sand, smoothstep(3.0, 2.0, h));
  const rock = smoothstep(0.86, 0.7, ny);
  const des = desertAt(x, z), snow = snowAt(x, z, h);
  if (des > 0) {
    _c.copy(PAL.desert).lerp(PAL.desertB, smoothstep(-0.3, 0.5, n));
    _c.lerp(PAL.mesa, rock).lerp(PAL.mesaB, rock * smoothstep(0, 0.8, n2) * 0.6);
    out.lerp(_c, des);
  }
  if (rock > 0) {
    _c.copy(PAL.rock).lerp(PAL.rockLight, smoothstep(-0.2, 0.7, n2) * 0.6).lerp(PAL.rockSnow, snow);
    out.lerp(_c, rock * (1 - des));
  }
  if (snow > 0) out.lerp(_c.copy(PAL.snow).lerp(PAL.snowShade, smoothstep(0.2, 0.9, n2) * 0.5), snow * (1 - rock * 0.6));
  return out;
}
const _c = new THREE.Color();

export function getHeight(x, z) {
  const fx = clamp((x + HALF) / STEP, 0, N - 1.001), fz = clamp((z + HALF) / STEP, 0, N - 1.001);
  const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz;
  const i = iz * N + ix;
  const a = heights[i], b = heights[i + 1], c = heights[i + N], d = heights[i + N + 1];
  // match the triangle split used by both the mesh and the heightfield
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

export function getNormalY(x, z) {
  const e = 1.5;
  const dx = getHeight(x + e, z) - getHeight(x - e, z), dz = getHeight(x, z + e) - getHeight(x, z - e);
  return 2 * e / Math.hypot(dx, 2 * e, dz);
}

export const isLand = (x, z) => getHeight(x, z) > 1.5;

// ---------- ground paint: roads, streets, pads, fields. One canvas over the whole map, also drawn on the minimap ----------
const PAINT = 2048, PK = PAINT / SIZE;
export const paint = document.createElement('canvas');
let paintData = null;
// paint coverage (0..1) at a world point: vegetation and grass stay off roads and pads
export const paintedAt = (x, z) => {
  const px = Math.floor((x + HALF) * PK), pz = Math.floor((z + HALF) * PK);
  return px < 0 || pz < 0 || px >= PAINT || pz >= PAINT ? 0 : paintData[(pz * PAINT + px) * 4 + 3] / 255;
};

function paintGround() {
  paint.width = paint.height = PAINT;
  const g = paint.getContext('2d'), P = (v) => (v + HALF) * PK, r = rng(4242);
  const shape = (p, inset = 0) => {
    g.beginPath();
    if (p.r != null) g.arc(P(p.x), P(p.z), (p.r - inset) * PK, 0, Math.PI * 2);
    else g.rect(P(p.x0 + inset), P(p.z0 + inset), (p.x1 - p.x0 - 2 * inset) * PK, (p.z1 - p.z0 - 2 * inset) * PK);
  };
  const lines = (p, step, col, w, alongX = true) => {
    g.save(); shape(p); g.clip(); g.strokeStyle = col; g.lineWidth = w * PK; g.beginPath();
    const x0 = p.x0 ?? p.x - p.r, x1 = p.x1 ?? p.x + p.r, z0 = p.z0 ?? p.z - p.r, z1 = p.z1 ?? p.z + p.r;
    if (alongX) for (let z = z0; z < z1; z += step) { g.moveTo(P(x0), P(z)); g.lineTo(P(x1), P(z)); }
    else for (let x = x0; x < x1; x += step) { g.moveTo(P(x), P(z0)); g.lineTo(P(x), P(z1)); }
    g.stroke(); g.restore();
  };
  const speckle = (p, n, cols) => {
    g.save(); shape(p); g.clip();
    const x0 = p.x0 ?? p.x - p.r, z0 = p.z0 ?? p.z - p.r, w = (p.x1 ?? p.x + p.r) - x0, d = (p.z1 ?? p.z + p.r) - z0;
    for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(P(x0 + r() * w), P(z0 + r() * d), 1 + r() * 2, 1 + r() * 2); }
    g.restore();
  };
  const towns = getTowns();
  for (const T of towns) for (const p of T.pads) {
    switch (p.kind) {
      case 'field':
        g.fillStyle = '#8c5d34'; shape(p); g.fill();
        lines(p, 2.2, '#6fae3c', 1.2, p.alongX); break;
      case 'dirt': case 'gravel': case 'sand': {
        const col = { dirt: '#b58b5c', gravel: '#aba395', sand: '#ecd29b' }[p.kind];
        g.globalAlpha = 0.9; g.fillStyle = col;
        for (let i = 0; i < 9; i++) { const a = r() * 6.28, d = r() * p.r * 0.35; g.beginPath(); g.arc(P(p.x + Math.cos(a) * d), P(p.z + Math.sin(a) * d), p.r * (0.6 + r() * 0.25) * PK, 0, 7); g.fill(); }
        g.globalAlpha = 1;
        speckle({ x: p.x, z: p.z, r: p.r * 0.8 }, p.r * 60, ['#8f7b62', '#cdbf9f', '#7a6a55']); break;
      }
      case 'concrete': g.fillStyle = '#b8b4ab'; shape(p); g.fill(); lines(p, 5, 'rgba(70,70,70,0.25)', 0.15); lines(p, 5, 'rgba(70,70,70,0.25)', 0.15, false); break;
      case 'stone': g.fillStyle = '#aaa39a'; shape(p); g.fill(); lines(p, 2.5, 'rgba(60,55,50,0.35)', 0.2); lines(p, 3.5, 'rgba(60,55,50,0.3)', 0.2, false); break;
      case 'asphalt': g.fillStyle = '#5c6068'; shape(p); g.fill(); break;
      case 'parking':
        g.fillStyle = '#5c6068'; shape(p); g.fill();
        g.save(); g.strokeStyle = '#f2f2ea'; g.lineWidth = 0.18 * PK; g.beginPath();
        for (let x = p.x0 + 3; x < p.x1; x += 3) { g.moveTo(P(x), P(p.z0 + 0.5)); g.lineTo(P(x), P(p.z0 + 5.5)); g.moveTo(P(x), P(p.z1 - 5.5)); g.lineTo(P(x), P(p.z1 - 0.5)); }
        g.stroke(); g.restore(); break;
      case 'plaza':
        g.fillStyle = '#d6c7ab'; shape(p); g.fill();
        g.strokeStyle = '#b9a88a'; g.lineWidth = 0.5 * PK; for (let k = 2; k < p.r; k += 2.5) { g.beginPath(); g.arc(P(p.x), P(p.z), k * PK, 0, 7); g.stroke(); } break;
      case 'pool':
        g.fillStyle = '#f2efe6'; shape(p); g.fill(); g.fillStyle = '#3cc4ee'; shape(p, 1); g.fill(); break;
      case 'track':
        g.lineWidth = p.w * 2 * PK; g.strokeStyle = '#b5824f';
        g.beginPath(); g.ellipse(P(p.x), P(p.z), p.rx * PK, p.rz * PK, 0, 0, 7); g.stroke();
        g.lineWidth = 0.3 * PK; g.strokeStyle = '#f4efe2';
        for (const o of [-p.w + 0.4, p.w - 0.4]) { g.beginPath(); g.ellipse(P(p.x), P(p.z), (p.rx + o) * PK, (p.rz + o) * PK, 0, 0, 7); g.stroke(); }
        break;
    }
  }
  // roads between towns: dark edge, asphalt, faded center dashes; trails are dirt
  for (const rd of roadPaths()) {
    const path = () => { g.beginPath(); rd.pts.forEach(([x, z], i) => (i ? g.lineTo(P(x), P(z)) : g.moveTo(P(x), P(z)))); };
    g.lineCap = g.lineJoin = 'round';
    if (rd.kind === 'road') {
      path(); g.strokeStyle = '#8f8a7e'; g.lineWidth = (rd.w + 0.7) * 2 * PK; g.stroke();
      path(); g.strokeStyle = '#5c6068'; g.lineWidth = rd.w * 2 * PK; g.stroke();
      path(); g.setLineDash([3 * PK, 3 * PK]); g.strokeStyle = 'rgba(245,226,140,0.8)'; g.lineWidth = 0.22 * PK; g.stroke(); g.setLineDash([]);
    } else {
      path(); g.strokeStyle = 'rgba(181,139,92,0.55)'; g.lineWidth = (rd.w + 1.2) * 2 * PK; g.stroke();
      path(); g.strokeStyle = '#b58b5c'; g.lineWidth = rd.w * 2 * PK; g.stroke();
    }
  }
  // town streets with light curbs
  for (const T of towns) for (const s of T.streets) {
    g.fillStyle = '#c9c4b8'; g.fillRect(P(s.x0 - 1.2), P(s.z0 - 1.2), (s.x1 - s.x0 + 2.4) * PK, (s.z1 - s.z0 + 2.4) * PK);
  }
  for (const T of towns) for (const s of T.streets) {
    g.fillStyle = '#5c6068'; g.fillRect(P(s.x0), P(s.z0), (s.x1 - s.x0) * PK, (s.z1 - s.z0) * PK);
    const alongX = s.x1 - s.x0 > s.z1 - s.z0;
    g.fillStyle = 'rgba(250,250,240,0.85)';
    if (alongX) for (let x = s.x0 + 2; x < s.x1 - 2; x += 6) g.fillRect(P(x), P((s.z0 + s.z1) / 2 - 0.1), 3 * PK, 0.2 * PK);
    else for (let z = s.z0 + 2; z < s.z1 - 2; z += 6) g.fillRect(P((s.x0 + s.x1) / 2 - 0.1), P(z), 0.2 * PK, 3 * PK);
  }
  // nothing painted under water (bridges carry roads over the river)
  const img = g.getImageData(0, 0, PAINT, PAINT), d = img.data;
  for (let pz = 0; pz < PAINT; pz += 2) for (let px = 0; px < PAINT; px += 2) {
    if (getHeight(px / PK - HALF, pz / PK - HALF) > 0.15) continue;
    for (const o of [0, 4, PAINT * 4, PAINT * 4 + 4]) d[(pz * PAINT + px) * 4 + o + 3] = 0;
  }
  g.putImageData(img, 0, 0);
  paintData = d;
}

// tileable soft value noise for painterly ground variation
function noiseTexture() {
  const s = 256, c = Object.assign(document.createElement('canvas'), { width: s, height: s }), g = c.getContext('2d'), r = rng(9);
  g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 420; i++) {
    const x = r() * s, y = r() * s, rad = 6 + r() * 34, v = r() < 0.5 ? 255 : 0;
    for (const ox of [-s, 0, s]) for (const oy of [-s, 0, s]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, `rgba(${v},${v},${v},0.16)`); gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function groundMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const paintTex = new THREE.CanvasTexture(paint);
  paintTex.colorSpace = THREE.SRGBColorSpace; paintTex.anisotropy = 8; paintTex.flipY = false; // canvas rows run with +z
  const uniforms = { uPaint: { value: paintTex }, uNoise: { value: noiseTexture() }, uSize: { value: SIZE } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'varying vec3 vWp; varying float vNy;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n vNy = objectNormal.y;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D uPaint, uNoise; uniform float uSize; varying vec3 vWp; varying float vNy;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float n1 = texture2D(uNoise, vWp.xz * 0.012).r, n2 = texture2D(uNoise, vWp.xz * 0.09).r, n3 = texture2D(uNoise, vWp.xz * 0.5).r;
        diffuseColor.rgb *= 0.8 + n1 * 0.28 + n2 * 0.16 + n3 * 0.08;
        float rockW = smoothstep(0.2, 0.36, 1.0 - vNy);
        float band = 0.84 + 0.16 * smoothstep(-0.3, 0.3, sin(vWp.y * 1.3 + n1 * 5.0 + n2 * 2.0));
        diffuseColor.rgb *= mix(1.0, band, rockW);
        vec4 pc = texture2D(uPaint, vWp.xz / uSize + 0.5);
        diffuseColor.rgb = mix(diffuseColor.rgb, pc.rgb * (0.92 + n3 * 0.16), pc.a * (1.0 - rockW));`);
  };
  return mat;
}

// ---------- props (harvestable trees / rocks) ----------
export const props = [];
const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);

export function addProp(kind, x, y, z, hp, inst, colliderDesc, r) {
  const p = { kind, x, y, z, r, hp, maxHp: hp, inst, desc: colliderDesc, collider: null, alive: true, shake: 0 };
  p.collider = addStatic(colliderDesc, { kind: 'prop', ref: p });
  props.push(p);
  return p;
}

const SHAKE_T = 0.65; // prop sway after a hit (s)
export function damageProp(p, dmg) {
  if (!p.alive) return false;
  p.hp -= dmg;
  p.shake = SHAKE_T;
  if (p.hp > 0) return false;
  p.alive = false;
  for (const [mesh, idx] of p.inst) { mesh.setMatrixAt(idx, _zero); mesh.instanceMatrix.needsUpdate = true; }
  removeCollider(p.collider);
  p.collider = null;
  return true;
}

export function resetProps() {
  for (const p of props) {
    p.hp = p.maxHp; p.shake = 0;
    for (const [mesh, idx, mat] of p.inst) { mesh.setMatrixAt(idx, mat); mesh.instanceMatrix.needsUpdate = true; }
    if (!p.alive) { p.collider = addStatic(p.desc, { kind: 'prop', ref: p }); p.alive = true; }
  }
}

function shakeProps(dt) {
  for (const p of props) {
    if (p.shake <= 0 || !p.alive) continue;
    p.shake = Math.max(0, p.shake - dt);
    const k = Math.sin((SHAKE_T - p.shake) * 31.4) * (p.shake / SHAKE_T) * 0.04; // ~5 Hz sway, dies out
    for (const [mesh, idx, mat] of p.inst) {
      _m.makeRotationZ(k).premultiply(mat);
      _m.copyPosition(mat);
      mesh.setMatrixAt(idx, p.shake > 0 ? _m : mat);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}

// ---------- geometry builders ----------
function colorize(geo, bottom, top) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  geo.computeBoundingBox();
  const { min, max } = geo.boundingBox;
  for (let i = 0; i < pos.count; i++) {
    const t = clamp((pos.getY(i) - min.y) / (max.y - min.y + 1e-6) * 0.6 + nrm.getY(i) * 0.4, 0, 1);
    c.copy(bottom).lerp(top, t);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function blob(r, x, y, z, sy = 0.85, detail = 2) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(1, sy, 1).translate(x, y, z);
  return g;
}

// lumpy sphere: noise-displaced icosahedron, so canopies read as soft painted clumps rather than balls
function lump(r, x, y, z, sy = 0.85, seed = 1, amt = 0.16) {
  const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position, nz = makeNoise(seed), v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = 1 + amt * nz(v.x * 1.3 / r + seed, v.y * 1.3 / r + v.z * 0.9 / r); p.setXYZ(i, v.x * k, v.y * k * sy, v.z * k); }
  g.computeVertexNormals();
  return g.translate(x, y, z);
}
const nonIdx = (g) => (g.index ? g.toNonIndexed() : g);
const paintGeo = (g, col) => { const c = new THREE.Color(col), a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) a.set([c.r, c.g, c.b], i); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const merge = (parts) => mergeGeometries(parts.map((g) => { g = nonIdx(g); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));

function treeGeos() {
  const trunk = new THREE.CylinderGeometry(0.26, 0.5, 4.4, 8).translate(0, 2.2, 0);
  colorize(trunk, C('#7a4a2a'), C('#b07a48'));
  // broadleaf: a big crown of overlapping clumps, dark underneath, sunlit on top
  const round = merge([
    lump(2.4, 0, 5.4, 0, 0.82, 1), lump(1.9, 1.5, 4.8, 0.7, 0.85, 2), lump(1.8, -1.4, 4.9, -0.6, 0.85, 3), lump(1.7, 0.3, 6.7, -0.2, 0.85, 4),
    lump(1.6, -0.5, 4.6, 1.5, 0.85, 5), lump(1.4, 0.8, 4.4, -1.5, 0.85, 6), lump(1.2, -1.2, 6.2, 0.8, 0.85, 7),
  ]);
  colorize(round, C('#246b2a'), C('#9fe05a'));
  // conifer: drooping tiers
  const tier = (r, h, y) => { const g = new THREE.ConeGeometry(r, h, 9, 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); if (yy < -h * 0.2) p.setY(i, yy - 0.35 * (Math.hypot(p.getX(i), p.getZ(i)) / r)); } g.computeVertexNormals(); return g.translate(0, y, 0); };
  const pineParts = () => [tier(2.6, 3.0, 3.2), tier(2.15, 2.8, 4.7), tier(1.7, 2.6, 6.1), tier(1.15, 2.3, 7.4), tier(0.6, 1.6, 8.5)];
  const pine = merge(pineParts());
  colorize(pine, C('#14532f'), C('#4fae52'));
  // snowy conifer: same tiers, white caps
  const snowPine = merge(pineParts());
  { const p = snowPine.attributes.position, nrm = snowPine.attributes.normal, col = new Float32Array(p.count * 3), c = new THREE.Color(), dk = C('#1d5a3a'), lt = C('#3f8f5a'), sn = C('#f4f8ff');
    for (let i = 0; i < p.count; i++) { c.copy(dk).lerp(lt, clamp(p.getY(i) / 9, 0, 1)); if (nrm.getY(i) > 0.55) c.lerp(sn, 0.9); col.set([c.r, c.g, c.b], i * 3); }
    snowPine.setAttribute('color', new THREE.BufferAttribute(col, 3)); }
  // palm: leaning segmented trunk + drooping fronds
  const palmParts = [];
  for (let i = 0; i < 6; i++) palmParts.push(paintGeo(new THREE.CylinderGeometry(0.24 - i * 0.015, 0.3 - i * 0.015, 1.25, 7).translate(i * i * 0.04, 0.62 + i * 1.18, 0), i % 2 ? '#a77a4d' : '#8c6239'));
  const top = [0.9, 7.6, 0];
  for (let f = 0; f < 7; f++) {
    const a = f / 7 * Math.PI * 2;
    const fr = new THREE.ConeGeometry(0.55, 4.2, 4, 3).rotateZ(-Math.PI / 2).scale(1, 0.18, 1).translate(2.1, 0, 0);
    const p = fr.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) - 0.11 * p.getX(i) * p.getX(i));
    fr.computeVertexNormals(); fr.rotateY(a).translate(...top);
    palmParts.push(colorize(nonIdx(fr), C('#2f8a2f'), C('#8ed24a')));
  }
  palmParts.push(paintGeo(lump(0.5, top[0], top[1] - 0.2, 0, 1, 3, 0.1), '#6b4a2a'));
  const palm = merge(palmParts);
  // saguaro-style cactus
  const cyl = (r, h, x, y, z, rz = 0) => new THREE.CapsuleGeometry(r, h, 4, 10).rotateZ(rz).translate(x, y, z);
  const cactus = merge([cyl(0.45, 4.2, 0, 2.5, 0), cyl(0.3, 1.0, 0.75, 2.2, 0, Math.PI / 2), cyl(0.3, 1.6, 1.25, 3.0, 0), cyl(0.28, 0.8, -0.65, 3.0, 0, Math.PI / 2), cyl(0.28, 1.3, -1.05, 3.7, 0)]);
  colorize(cactus, C('#2e7d3a'), C('#7fc35a'));
  // dead desert tree: bare forked branches
  const branch = (r0, len, x, y, z, rx, rz) => new THREE.CylinderGeometry(r0 * 0.5, r0, len, 6).translate(0, len / 2, 0).rotateX(rx).rotateZ(rz).translate(x, y, z);
  const dead = merge([branch(0.32, 3.4, 0, 0, 0, 0, 0.08), branch(0.18, 2.4, 0.2, 3.0, 0, 0.3, -0.7), branch(0.16, 2.2, 0.1, 2.6, 0, -0.4, 0.8), branch(0.12, 1.6, -0.1, 3.3, 0, 0.9, 0.3)]);
  colorize(dead, C('#6e5640'), C('#b49a7c'));
  const bush = merge([lump(1.0, 0, 0.6, 0, 0.8, 11), lump(0.8, 0.8, 0.5, 0.3, 0.8, 12), lump(0.75, -0.7, 0.5, -0.3, 0.8, 13), lump(0.6, 0.1, 0.9, -0.6, 0.8, 14)]);
  colorize(bush, C('#235f28'), C('#8fd84a'));
  return { trunk, round, pine, snowPine, palm, cactus, dead, bush };
}

function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1).toNonIndexed();
  const n = makeNoise(seed), p = g.attributes.position, v = new THREE.Vector3();
  const cache = new Map();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let s = cache.get(key);
    if (s === undefined) { s = 1 + 0.28 * n(v.x * 1.7, v.z * 1.7 + v.y); cache.set(key, s); }
    v.multiplyScalar(s); v.y *= 0.7;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return colorize(g, C('#b98b78'), C('#f4d2bf'));
}

function flowerGeo() {
  const parts = [];
  const r = rng(99);
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 1.6, z = (r() - 0.5) * 1.6, h = 0.25 + r() * 0.35;
    parts.push(new THREE.CylinderGeometry(0.02, 0.02, h, 3, 1, true).translate(x, h / 2, z));
    parts.push(new THREE.IcosahedronGeometry(0.11, 0).scale(1, 0.6, 1).translate(x, h, z));
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  return colorize(g, C('#3a8a2a'), C('#ffffff'));
}

// ---------- grass (chunks streamed around the camera) ----------
const GRASS_CHUNK = 20, GRASS_RADIUS = 2, GRASS_PER_CHUNK = 1800;
function bladeGeo() {
  const g = new THREE.BufferGeometry();
  const w = 0.05, h = 0.6;
  const pos = [-w, 0, 0, w, 0, 0, -w * 0.7, h * 0.45, 0.04, w * 0.7, h * 0.45, 0.04, 0, h, 0.14];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  const col = [0.72, 0.82, 0.42, 0.72, 0.82, 0.42, 0.95, 1.0, 0.6, 0.95, 1.0, 0.6, 1.15, 1.12, 0.8];
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
  return g;
}

export function createTerrain(scene) {
  // heights + colors
  const col = new THREE.Color();
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) heights[iz * N + ix] = heightAt(ix * STEP - HALF, iz * STEP - HALF);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) {
    const x = ix * STEP - HALF, z = iz * STEP - HALF, i = iz * N + ix;
    computeColor(x, z, heights[i], getNormalY(x, z), col);
    colors.set([col.r, col.g, col.b], i * 3);
  }

  // mesh
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, N - 1, N - 1).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, heights[i]);
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  paintGround();
  const ground = new THREE.Mesh(geo, groundMaterial());
  ground.receiveShadow = true;
  scene.add(ground);

  // physics heightfield (column-major, x outer)
  const hf = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) hf[ix * N + iz] = heights[iz * N + ix];
  addStatic(R.ColliderDesc.heightfield(N - 1, N - 1, hf, { x: SIZE, y: 1, z: SIZE }), { kind: 'terrain' });

  const water = createWater(scene);

  // ---- vegetation and rocks, by biome ----
  const r = rng(WORLD.seed + 3);
  const g = treeGeos();
  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const inst = (geo, n, mat = vegMat) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.castShadow = true; m.receiveShadow = true; return m; };
  const trunks = inst(g.trunk, 1100), rounds = inst(g.round, 800), pines = inst(g.pine, 600), snowPines = inst(g.snowPine, 260);
  const palms = inst(g.palm, 160), cacti = inst(g.cactus, 160), deads = inst(g.dead, 60), bushes = inst(g.bush, 1600);
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const rocks = inst(rockGeo(5), 560, rockMat);
  const flowers = inst(flowerGeo(), 3500);
  flowers.castShadow = false;

  // town building footprints (+ margin) and landmark spots keep vegetation clear
  const towns = getTowns();
  const foot = towns.flatMap((T) => T.buildings.map((b) => ({ x0: b.i0 * GRID.cell, z0: b.k0 * GRID.cell, x1: (b.i0 + b.w) * GRID.cell, z1: (b.k0 + b.d) * GRID.cell })));
  const spots = towns.flatMap((T) => T.props.map((p) => ({ x: p.x, z: p.z, r: (p.len ?? 10) / 2 + 4 })).concat(T.cars.map((c) => ({ x: c.x, z: c.z, r: 4 }))));
  const inFoot = (x, z, m) => foot.some((f) => x > f.x0 - m && x < f.x1 + m && z > f.z0 - m && z < f.z1 + m);
  const clear = (x, z, m = 3) => paintedAt(x, z) < 0.1 && !inFoot(x, z, m) && !spots.some((s) => Math.hypot(x - s.x, z - s.z) < s.r);
  const townAt = (x, z) => towns.find((T) => Math.hypot(x - T.poi.x, z - T.poi.z) < T.poi.r + 6);
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
  const place = (mesh, x, y, z, scale, rotY, tint, tilt = 0) => {
    const i = mesh.count++;
    const mat = new THREE.Matrix4().compose(v.set(x, y, z), q.setFromEuler(e.set(tilt, rotY, 0, 'YXZ')), s.setScalar(scale));
    mesh.setMatrixAt(i, mat);
    if (tint) mesh.setColorAt(i, tint);
    return [mesh, i, mat];
  };
  const tree = (x, h, z, sc, list, hp, rad = 0.5, tall = 2.2) => addProp('tree', x, h, z, hp, list, R.ColliderDesc.cylinder(tall * sc, rad * sc).setTranslation(x, h + tall * sc, z), rad * sc);

  for (let tries = 0; tries < 30000 && trunks.count + palms.count + cacti.count < 1250; tries++) {
    const x = (r() - 0.5) * SIZE * 0.9, z = (r() - 0.5) * SIZE * 0.9;
    const h = getHeight(x, z);
    if (h < 1.6 || getNormalY(x, z) < 0.84 || !clear(x, z)) continue;
    const town = townAt(x, z), des = desertAt(x, z), snow = snowAt(x, z, h);
    const dens = 0.1 + forestAt(x, z) * 0.75 + Math.max(0, fbm(noise2, x * 0.006 + 9, z * 0.006, 3)) * 0.5;
    const rot = r() * 6.28;
    if (des > 0.5) { // desert: cacti, a few dead trees
      if (r() > 0.11) continue;
      if (r() < 0.8) { const sc = 0.8 + r() * 0.5; tree(x, h, z, sc, [place(cacti, x, h - 0.1, z, sc, rot, C('#ffffff').multiplyScalar(0.9 + r() * 0.2))], 120, 0.5, 2.4); }
      else { const sc = 0.9 + r() * 0.4; tree(x, h, z, sc, [place(deads, x, h - 0.1, z, sc, rot)], 100, 0.35, 1.8); }
      continue;
    }
    if (h < 3.4 && r() < 0.5) { // beach palms
      if (r() > 0.25) continue;
      const sc = 0.85 + r() * 0.35;
      tree(x, h, z, sc, [place(palms, x, h - 0.15, z, sc, rot, null, (r() - 0.5) * 0.25)], 140, 0.35, 3.5);
      continue;
    }
    if (h < 3) continue;
    if (r() > dens * (town ? (town.poi.type === 'camp' || town.poi.type === 'snow' ? 1 : 0.25) : 1)) continue;
    const sc = 0.8 + r() * 0.6;
    const conifer = snow > 0.2 || h > 24 || (forestAt(x, z) > 0.4 && r() < 0.45) || town?.poi.type === 'camp';
    const tint = new THREE.Color().setHSL(0.27 + (r() - 0.5) * 0.07, 0.5 + r() * 0.2, 0.42 + r() * 0.1).multiplyScalar(2.1);
    const crown = snow > 0.2 ? place(snowPines, x, h - 0.2, z, sc, rot) : place(conifer ? pines : rounds, x, h - 0.2, z, sc, rot, tint);
    tree(x, h, z, sc, [place(trunks, x, h - 0.2, z, sc * (conifer ? 0.8 : 1), rot), crown], 150 + sc * 60);
  }
  for (let tries = 0; tries < 8000 && rocks.count < 560; tries++) {
    const x = (r() - 0.5) * SIZE * 0.9, z = (r() - 0.5) * SIZE * 0.9;
    const h = getHeight(x, z);
    if (h < 0.5 || !clear(x, z, 4) || townAt(x, z) && r() < 0.8) continue;
    const des = desertAt(x, z), snow = snowAt(x, z, h);
    if (r() > (getNormalY(x, z) < 0.9 ? 0.5 : 0.1 + des * 0.1)) continue;
    const sc = 0.7 + r() * r() * 3.2;
    const tint = des > 0.5 ? new THREE.Color().setHSL(0.05, 0.55, 0.62 + r() * 0.1) : snow > 0.3 ? new THREE.Color().setHSL(0.6, 0.12, 0.72 + r() * 0.1) : new THREE.Color().setHSL(0.07 + r() * 0.04, 0.12, 0.6 + r() * 0.14);
    tint.multiplyScalar(1.25);
    addProp('rock', x, h, z, 120 + sc * 80, [place(rocks, x, h - sc * 0.2, z, sc, r() * 6.28, tint)], R.ColliderDesc.ball(sc * 0.85).setTranslation(x, h - sc * 0.2, z), sc * 0.85);
  }
  for (let tries = 0; tries < 12000 && bushes.count < 1600; tries++) {
    const x = (r() - 0.5) * SIZE * 0.9, z = (r() - 0.5) * SIZE * 0.9;
    const h = getHeight(x, z);
    if (h < 2.5 || getNormalY(x, z) < 0.85 || !clear(x, z, 1.5) || desertAt(x, z) > 0.5 || snowAt(x, z, h) > 0.5) continue;
    if (r() > 0.25 + forestAt(x, z) * 0.6) continue;
    place(bushes, x, h - 0.1, z, 0.7 + r() * 0.9, r() * 6.28, new THREE.Color().setHSL(0.27 + (r() - 0.5) * 0.06, 0.6, 0.48).multiplyScalar(2));
  }
  const flowerCols = ['#ff4f9a', '#c45cff', '#ffd23f', '#ffffff', '#ff8a3d', '#5fb8ff'].map(C);
  for (let tries = 0; tries < 40000 && flowers.count < 3500; tries++) {
    const x = (r() - 0.5) * SIZE * 0.9, z = (r() - 0.5) * SIZE * 0.9;
    const h = getHeight(x, z);
    if (h < 2.5 || getNormalY(x, z) < 0.88 || !clear(x, z, 1) || desertAt(x, z) > 0.3 || snowAt(x, z, h) > 0.2) continue;
    const patch = noise(x * 0.025 + 70, z * 0.025);
    if (patch < 0.35 || r() > 0.6) continue;
    const c = flowerCols[(Math.floor((noise2(x * 0.01, z * 0.01) + 1) * 3) + (r() < 0.2 ? 1 : 0)) % flowerCols.length];
    place(flowers, x, h - 0.05, z, 0.45 + r() * 0.35, r() * 6.28, c.clone().multiplyScalar(1.1));
  }
  for (const m of [trunks, rounds, pines, snowPines, palms, cacti, deads, bushes, rocks, flowers]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); scene.add(m); }
  // ---- grass ----
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const grassTime = { value: 0 };
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = grassTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec3 ip = instanceMatrix[3].xyz;
      float sway = sin(uTime * 1.7 + ip.x * 0.15 + ip.z * 0.11) * 0.18 + sin(uTime * 3.1 + ip.x * 0.7) * 0.05;
      transformed.x += sway * position.y * position.y;
      transformed.z += sway * 0.6 * position.y * position.y;`);
  };
  const blade = bladeGeo();
  const chunks = new Map();
  const blocks = new Set(); // build piece boxes that hide blades under them
  const blocked = (x, z, h) => { for (const b of blocks) if (x > b.min[0] && x < b.max[0] && z > b.min[2] && z < b.max[2] && b.min[1] < h + 0.7 && b.max[1] > h - 0.3) return true; return false; };
  const grassCol = new THREE.Color();
  function buildChunk(cx, cz) {
    const m = new THREE.InstancedMesh(blade, grassMat, GRASS_PER_CHUNK);
    const cr = rng((cx * 73856093) ^ (cz * 19349663));
    let n = 0;
    for (let k = 0; k < GRASS_PER_CHUNK * 2 && n < GRASS_PER_CHUNK; k++) {
      const x = (cx + cr()) * GRASS_CHUNK, z = (cz + cr()) * GRASS_CHUNK;
      const h = getHeight(x, z);
      if (h < 2.6 || getNormalY(x, z) < 0.86 || paintedAt(x, z) > 0.2 || inFoot(x, z, 0.4) || blocked(x, z, h) || desertAt(x, z) > 0.4 || snowAt(x, z, h) > 0.3) continue; // towns: no blades through house floors
      const dense = noise(x * 0.04, z * 0.04);
      if (dense < -0.25) continue;
      const sc = 0.35 + cr() * 0.4 + Math.max(0, dense) * 0.3;
      m.setMatrixAt(n, _m.compose(v.set(x, h - 0.05, z), q.setFromEuler(e.set(0, cr() * 6.28, 0)), s.set(1 + sc * 0.5, sc, 1 + sc * 0.5)));
      const ii = (Math.round((z + HALF) / STEP) * N + Math.round((x + HALF) / STEP)) * 3;
      grassCol.setRGB(colors[ii], colors[ii + 1], colors[ii + 2]).multiplyScalar(0.95 + cr() * 0.25);
      m.setColorAt(n, grassCol);
      n++;
    }
    m.userData.n = n;
    m.count = grassLevel === 'Low' ? n >> 1 : n;
    m.receiveShadow = true;
    m.computeBoundingSphere();
    m.frustumCulled = true;
    return m;
  }
  let grassLevel = 'High';
  function updateGrass(cam, t) {
    grassTime.value = t;
    if (grassLevel === 'Off') return;
    const ccx = Math.floor(cam.x / GRASS_CHUNK), ccz = Math.floor(cam.z / GRASS_CHUNK);
    const want = new Set();
    for (let dz = -GRASS_RADIUS; dz <= GRASS_RADIUS; dz++) for (let dx = -GRASS_RADIUS; dx <= GRASS_RADIUS; dx++) {
      const key = `${ccx + dx},${ccz + dz}`;
      want.add(key);
      if (!chunks.has(key)) { const c = buildChunk(ccx + dx, ccz + dz); chunks.set(key, c); scene.add(c); }
    }
    for (const [key, c] of chunks) if (!want.has(key)) { scene.remove(c); c.dispose(); chunks.delete(key); }
  }

  function rebuildUnder(b) {
    for (const [key, c] of chunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (b.max[0] < cx * GRASS_CHUNK || b.min[0] > (cx + 1) * GRASS_CHUNK || b.max[2] < cz * GRASS_CHUNK || b.min[2] > (cz + 1) * GRASS_CHUNK) continue;
      scene.remove(c); c.dispose();
      const n = buildChunk(cx, cz); chunks.set(key, n); scene.add(n);
    }
  }

  return {
    ground, water,
    grassBlock(box, on) {
      const cx = (box.min[0] + box.max[0]) / 2, cz = (box.min[2] + box.max[2]) / 2;
      if (on && (box.min[1] > getHeight(cx, cz) + 1.5 || inFoot(cx, cz, 0))) return; // only pieces sitting on open ground (town footprints never grow grass)
      if (on) blocks.add(box); else if (!blocks.delete(box)) return; rebuildUnder(box); },
    grassClear() { const old = [...blocks]; blocks.clear(); old.forEach(rebuildUnder); },
    update(dt, t, camPos) { shakeProps(dt); updateGrass(camPos, t); water.material.uniforms.uTime.value = t; },
    setGrass(level) {
      grassLevel = level;
      for (const [key, c] of chunks) {
        if (level === 'Off') { scene.remove(c); c.dispose(); chunks.delete(key); } else c.count = level === 'Low' ? c.userData.n >> 1 : c.userData.n;
      }
    },
  };
}

function createWater(scene) {
  // depth texture: water depth below sea level, 0..20 m -> 0..255
  const data = new Uint8Array(N * N);
  for (let i = 0; i < N * N; i++) data[i] = clamp(Math.round((WORLD.waterLevel - heights[i]) / 20 * 255), 0, 255);
  const tex = new THREE.DataTexture(data, N, N, THREE.RedFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const mat = new THREE.ShaderMaterial({
    transparent: true, fog: true, depthWrite: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uDepth: { value: null }, uSize: { value: SIZE },
      uShallow: { value: new THREE.Color('#5ff0e0') }, uDeep: { value: new THREE.Color('#1677d6') },
      uSky: { value: new THREE.Color('#bfe8ff') },
    }]),
    vertexShader: `
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main(){ vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform float uTime, uSize; uniform sampler2D uDepth; uniform vec3 uShallow, uDeep, uSky; varying vec3 vW;
      #include <fog_pars_fragment>
      void main(){
        vec2 uv = vW.xz / uSize + 0.5;
        float inside = step(0., uv.x) * step(uv.x, 1.) * step(0., uv.y) * step(uv.y, 1.);
        float depth = mix(1., texture2D(uDepth, uv).r, inside) * 20.;
        float w1 = sin(vW.x*0.35 + uTime*1.3) * sin(vW.z*0.3 - uTime*1.1);
        float w2 = sin(vW.x*1.3 - uTime*2.1 + vW.z*0.9);
        vec3 n = normalize(vec3(w1*0.08 + w2*0.03, 1., w2*0.05));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1. - max(dot(n, V), 0.), 4.);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.3, 9., depth));
        col = mix(col, uSky, fres * 0.6);
        float foam = smoothstep(0.9, 0.0, depth + w2*0.25) * inside;
        col = mix(col, vec3(1.), foam*0.85);
        vec3 L = normalize(vec3(0.5, 0.8, 0.3));
        col += pow(max(dot(reflect(-L, n), V), 0.), 120.) * 0.9;
        float a = mix(0.55, 0.93, smoothstep(0.2, 5., depth));
        gl_FragColor = vec4(col, max(a, foam));
        #include <fog_fragment>
      }`,
  });
  mat.uniforms.uDepth.value = tex;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), mat);
  m.position.y = WORLD.waterLevel;
  m.renderOrder = 1;
  scene.add(m);
  return m;
}

export { STEP as TERRAIN_STEP, N as TERRAIN_N, HALF as TERRAIN_HALF };
