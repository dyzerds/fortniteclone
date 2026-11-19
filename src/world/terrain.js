import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, POIS } from '../config.js';
import { makeNoise, fbm, rng, smoothstep, clamp, lerp } from '../util.js';
import { R, addStatic, removeCollider } from '../physics.js';

const N = WORLD.res, SIZE = WORLD.size, STEP = SIZE / (N - 1), HALF = SIZE / 2;
const noise = makeNoise(WORLD.seed);
const noise2 = makeNoise(WORLD.seed + 7);

export const heights = new Float32Array(N * N);
export const colors = new Float32Array(N * N * 3); // linear rgb per grid point, also used by the map

function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  const coast = WORLD.islandRadius * (1 + 0.16 * noise(Math.cos(ang) * 1.3 + 5, Math.sin(ang) * 1.3 + 5) + 0.07 * noise(x * 0.01, z * 0.01));
  const land = smoothstep(coast + 30, coast - 70, d);
  let h = 4 + (fbm(noise, x * 0.0045, z * 0.0045, 5) * 0.5 + 0.5) * 26;
  // mountains: ridged noise boosted away from the coast
  const ridge = 1 - Math.abs(fbm(noise2, x * 0.004 + 3, z * 0.004 - 2, 4));
  h += Math.pow(ridge, 3) * 38 * smoothstep(0.35, 0.9, land) * smoothstep(-0.2, 0.4, noise2(x * 0.002, z * 0.002));
  // gentle beaches near the coast
  h = lerp(1.2, h, smoothstep(0.15, 0.6, land));
  for (const p of POIS) {
    const t = smoothstep(p.r + 45, p.r * 0.75, Math.hypot(x - p.x, z - p.z));
    h = lerp(h, p.h, t);
  }
  return lerp(-16, h, land);
}

const C = (hex) => new THREE.Color(hex);
const PAL = {
  sand: C('#f3d79b'), wetSand: C('#d8c592'), seabed: C('#7fd6c4'),
  grassA: C('#8fd13a'), grassB: C('#c2df4a'), grassC: C('#57b53a'), grassD: C('#3f9f45'),
  rockA: C('#e8b9a3'), rockB: C('#c99782'), dirt: C('#d9b27a'), plaza: C('#cbb79c'),
};

function computeColor(x, z, h, ny, out) {
  const n = fbm(noise2, x * 0.02, z * 0.02, 3);
  const n2 = noise(x * 0.06 + 40, z * 0.06);
  if (h < 0.4) out.copy(PAL.seabed).lerp(PAL.wetSand, smoothstep(-4, 0.4, h));
  else if (h < 2.2) out.copy(PAL.sand);
  else {
    out.copy(PAL.grassA).lerp(PAL.grassB, smoothstep(-0.2, 0.6, n));
    out.lerp(PAL.grassC, smoothstep(0.1, 0.7, -n) * 0.8);
    out.lerp(PAL.grassD, smoothstep(0.55, 0.9, n2) * 0.5);
    out.lerp(PAL.sand, smoothstep(3.2, 2.2, h));
    const rock = smoothstep(0.86, 0.72, ny);
    if (rock > 0) out.lerp(PAL.rockA, rock).lerp(PAL.rockB, rock * smoothstep(0, 0.8, n2) * 0.6);
    for (const p of POIS) {
      const dp = Math.hypot(x - p.x, z - p.z);
      if (dp < p.r) out.lerp(n2 > 0.2 ? PAL.plaza : PAL.dirt, smoothstep(p.r, p.r * 0.6, dp) * 0.55);
    }
  }
  return out;
}

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

// ---------- props (harvestable trees / rocks) ----------
export const props = [];
const _m = new THREE.Matrix4(), _zero = new THREE.Matrix4().makeScale(0, 0, 0);

export function addProp(kind, x, y, z, hp, inst, colliderDesc, r) {
  const p = { kind, x, y, z, r, hp, maxHp: hp, inst, desc: colliderDesc, collider: null, alive: true, shake: 0 };
  p.collider = addStatic(colliderDesc, { kind: 'prop', ref: p });
  props.push(p);
  return p;
}

export function damageProp(p, dmg) {
  if (!p.alive) return false;
  p.hp -= dmg;
  p.shake = 0.35;
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
    const k = Math.sin(p.shake * 60) * p.shake * 0.12;
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

function treeGeos() {
  const trunk = new THREE.CylinderGeometry(0.28, 0.45, 4.2, 7).translate(0, 2.1, 0);
  colorize(trunk, C('#9a6238'), C('#c98a4e'));
  const round = mergeGeometries([
    blob(2.3, 0, 5.2, 0), blob(1.8, 1.4, 4.6, 0.6), blob(1.7, -1.2, 4.7, -0.7), blob(1.6, 0.2, 6.4, -0.3), blob(1.5, -0.4, 4.5, 1.4),
  ]);
  colorize(round, C('#3fa040'), C('#b8ec62'));
  const pine = mergeGeometries([
    new THREE.ConeGeometry(2.4, 3.2, 8).translate(0, 3.6, 0),
    new THREE.ConeGeometry(1.9, 2.8, 8).translate(0, 5.2, 0),
    new THREE.ConeGeometry(1.3, 2.4, 8).translate(0, 6.7, 0),
  ]);
  colorize(pine, C('#1f6e3c'), C('#5cc25a'));
  const bush = mergeGeometries([blob(1.0, 0, 0.6, 0, 0.8, 1), blob(0.8, 0.8, 0.5, 0.3, 0.8, 1), blob(0.75, -0.7, 0.5, -0.3, 0.8, 1)]);
  colorize(bush, C('#2f8a35'), C('#8fd84a'));
  return { trunk, round, pine, bush };
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
    parts.push(new THREE.CylinderGeometry(0.02, 0.02, h, 3).translate(x, h / 2, z));
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
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) heights[iz * N + ix] = rawHeight(ix * STEP - HALF, iz * STEP - HALF);
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
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // physics heightfield (column-major, x outer)
  const hf = new Float32Array(N * N);
  for (let iz = 0; iz < N; iz++) for (let ix = 0; ix < N; ix++) hf[ix * N + iz] = heights[iz * N + ix];
  addStatic(R.ColliderDesc.heightfield(N - 1, N - 1, hf, { x: SIZE, y: 1, z: SIZE }), { kind: 'terrain' });

  const water = createWater(scene);

  // ---- vegetation and rocks ----
  const r = rng(WORLD.seed + 3);
  const g = treeGeos();
  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const MAXT = 900;
  const trunks = new THREE.InstancedMesh(g.trunk, vegMat, MAXT);
  const rounds = new THREE.InstancedMesh(g.round, vegMat, MAXT);
  const pines = new THREE.InstancedMesh(g.pine, vegMat, MAXT);
  const bushes = new THREE.InstancedMesh(g.bush, vegMat, 1400);
  const rockGeoA = rockGeo(5), rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeoA, rockMat, 500);
  const flowers = new THREE.InstancedMesh(flowerGeo(), vegMat, 3500);
  for (const m of [trunks, rounds, pines, rocks]) { m.castShadow = true; m.receiveShadow = true; m.count = 0; }
  bushes.count = 0; flowers.count = 0; bushes.castShadow = true;

  const nearPoi = (x, z, pad) => POIS.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + pad);
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), e = new THREE.Euler();
  const place = (mesh, x, y, z, scale, rotY, tint) => {
    const i = mesh.count++;
    const mat = new THREE.Matrix4().compose(v.set(x, y, z), q.setFromEuler(e.set(0, rotY, 0)), s.setScalar(scale));
    mesh.setMatrixAt(i, mat);
    if (tint) mesh.setColorAt(i, tint);
    return [mesh, i, mat];
  };

  for (let tries = 0; tries < 20000 && trunks.count < MAXT; tries++) {
    const x = (r() - 0.5) * SIZE * 0.85, z = (r() - 0.5) * SIZE * 0.85;
    const h = getHeight(x, z);
    if (h < 3 || getNormalY(x, z) < 0.86 || nearPoi(x, z, 4)) continue;
    const forest = fbm(noise2, x * 0.006 + 9, z * 0.006, 3);
    if (r() > 0.18 + forest * 0.9) continue;
    const sc = 0.8 + r() * 0.55, rot = r() * 6.28;
    const tint = new THREE.Color().setHSL(0.27 + (r() - 0.5) * 0.08, 0.55 + r() * 0.2, 0.42 + r() * 0.12).multiplyScalar(2.1);
    const isPine = h > 22 && r() < 0.6;
    const inst = [place(trunks, x, h - 0.2, z, sc, rot), place(isPine ? pines : rounds, x, h - 0.2, z, sc, rot, tint)];
    addProp('tree', x, h, z, 150 + sc * 60, inst,
      R.ColliderDesc.cylinder(2.2 * sc, 0.5 * sc).setTranslation(x, h + 2.2 * sc, z), 0.5 * sc);
  }
  for (let tries = 0; tries < 6000 && rocks.count < 500; tries++) {
    const x = (r() - 0.5) * SIZE * 0.85, z = (r() - 0.5) * SIZE * 0.85;
    const h = getHeight(x, z);
    if (h < 0.5 || nearPoi(x, z, 2)) continue;
    if (r() > (getNormalY(x, z) < 0.9 ? 0.5 : 0.1)) continue;
    const sc = 0.7 + r() * r() * 3.2;
    const tint = new THREE.Color().setHSL(0.04 + r() * 0.04, 0.35, 0.82 + r() * 0.1).multiplyScalar(1.15);
    const inst = [place(rocks, x, h - sc * 0.2, z, sc, r() * 6.28, tint)];
    addProp('rock', x, h, z, 120 + sc * 80, inst, R.ColliderDesc.ball(sc * 0.85).setTranslation(x, h - sc * 0.2, z), sc * 0.85);
  }
  for (let tries = 0; tries < 9000 && bushes.count < 1400; tries++) {
    const x = (r() - 0.5) * SIZE * 0.85, z = (r() - 0.5) * SIZE * 0.85;
    const h = getHeight(x, z);
    if (h < 2.5 || getNormalY(x, z) < 0.85 || nearPoi(x, z, -10)) continue;
    place(bushes, x, h - 0.1, z, 0.8 + r() * 0.8, r() * 6.28, new THREE.Color().setHSL(0.28, 0.6, 0.5).multiplyScalar(2));
  }
  const flowerCols = ['#ff3fb4', '#d24cff', '#ff6fd0', '#ffe14a', '#ffffff', '#b04dff'].map(C);
  for (let tries = 0; tries < 40000 && flowers.count < 3500; tries++) {
    const x = (r() - 0.5) * SIZE * 0.85, z = (r() - 0.5) * SIZE * 0.85;
    const h = getHeight(x, z);
    if (h < 2.5 || getNormalY(x, z) < 0.88) continue;
    const patch = noise(x * 0.025 + 70, z * 0.025);
    if (patch < 0.35 || r() > 0.6) continue;
    const c = flowerCols[(Math.floor((noise2(x * 0.01, z * 0.01) + 1) * 3) + (r() < 0.2 ? 1 : 0)) % flowerCols.length];
    place(flowers, x, h - 0.05, z, 0.8 + r() * 0.7, r() * 6.28, c.clone().multiplyScalar(1.2));
  }
  for (const m of [trunks, rounds, pines, bushes, rocks, flowers]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; m.computeBoundingSphere(); scene.add(m); }

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
  const grassCol = new THREE.Color();
  function buildChunk(cx, cz) {
    const m = new THREE.InstancedMesh(blade, grassMat, GRASS_PER_CHUNK);
    const cr = rng((cx * 73856093) ^ (cz * 19349663));
    let n = 0;
    for (let k = 0; k < GRASS_PER_CHUNK * 2 && n < GRASS_PER_CHUNK; k++) {
      const x = (cx + cr()) * GRASS_CHUNK, z = (cz + cr()) * GRASS_CHUNK;
      const h = getHeight(x, z);
      if (h < 2.6 || getNormalY(x, z) < 0.86 || nearPoi(x, z, -12)) continue;
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

  return {
    ground, water,
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
