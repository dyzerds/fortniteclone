// Original item models built from primitives: weapons, pickaxes, gliders, consumables, ammo, materials, chest.
// Weapons point down -Z; userData.muzzle is the local muzzle point.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RARITIES } from './config.js';
import { wrapTexture } from './textures.js';

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, ...o });
const box = (w, h, d, r = 0.015) => new RoundedBoxGeometry(w, h, d, 2, r);
const cyl = (r1, r2, h, s = 12) => new THREE.CylinderGeometry(r1, r2, h, s);
function part(group, geo, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true;
  group.add(m);
  return m;
}

const bodyMatCache = new Map();
function bodyMat(rarity, wrap) {
  const key = `${rarity}:${wrap}`;
  if (!bodyMatCache.has(key)) {
    const tex = wrapTexture(wrap);
    bodyMatCache.set(key, tex ? mat('#ffffff', { map: tex, roughness: 0.4 }) : mat('#3a4150', { roughness: 0.45 }));
  }
  return bodyMatCache.get(key);
}
const accentMat = (rarity) => mat(RARITIES[rarity].color, { emissive: RARITIES[rarity].color, emissiveIntensity: 0.35 });
const dark = mat('#1f232b'), grey = mat('#6b7484'), woodM = mat('#a8683a', { roughness: 0.8 });

export function weaponModel(cls, rarity = 0, wrap = 'none') {
  const g = new THREE.Group();
  const B = bodyMat(rarity, wrap), A = accentMat(rarity);
  const muzzle = new THREE.Vector3();
  if (cls === 'ar') {
    part(g, box(0.09, 0.13, 0.55), B, 0, 0, -0.05);
    part(g, cyl(0.025, 0.025, 0.4), dark, 0, 0.02, -0.5, Math.PI / 2);
    part(g, box(0.07, 0.1, 0.25), B, 0, -0.01, 0.32);
    part(g, box(0.06, 0.18, 0.08), dark, 0, -0.14, -0.08, 0.25);
    part(g, box(0.05, 0.14, 0.06), dark, 0, -0.12, 0.1, -0.3);
    part(g, box(0.095, 0.03, 0.3), A, 0, 0.075, -0.05);
    part(g, box(0.04, 0.05, 0.12), dark, 0, 0.1, 0.02);
    muzzle.set(0, 0.02, -0.72);
  } else if (cls === 'shotgun') {
    part(g, box(0.1, 0.12, 0.45), B, 0, 0, 0);
    part(g, cyl(0.035, 0.035, 0.55), dark, 0, 0.03, -0.45, Math.PI / 2);
    part(g, cyl(0.04, 0.04, 0.22), woodM, 0, -0.04, -0.38, Math.PI / 2);
    part(g, box(0.08, 0.12, 0.3), woodM, 0, -0.04, 0.33, -0.15);
    part(g, box(0.05, 0.13, 0.06), dark, 0, -0.11, 0.12, -0.3);
    part(g, box(0.105, 0.03, 0.2), A, 0, 0.07, 0.02);
    muzzle.set(0, 0.03, -0.74);
  } else if (cls === 'smg') {
    part(g, box(0.09, 0.14, 0.38), B, 0, 0, 0);
    part(g, cyl(0.022, 0.022, 0.2), dark, 0, 0.02, -0.27, Math.PI / 2);
    part(g, box(0.05, 0.22, 0.06), dark, 0, -0.17, -0.05);
    part(g, box(0.05, 0.13, 0.06), dark, 0, -0.11, 0.12, -0.3);
    part(g, box(0.095, 0.03, 0.22), A, 0, 0.08, 0);
    part(g, box(0.03, 0.06, 0.2), grey, 0, 0.02, 0.27);
    muzzle.set(0, 0.02, -0.38);
  } else if (cls === 'pistol') {
    part(g, box(0.06, 0.08, 0.26), B, 0, 0.02, -0.04);
    part(g, box(0.055, 0.15, 0.07), dark, 0, -0.07, 0.06, -0.2);
    part(g, box(0.065, 0.02, 0.18), A, 0, 0.065, -0.04);
    muzzle.set(0, 0.03, -0.18);
  } else if (cls === 'sniper') {
    part(g, box(0.09, 0.12, 0.6), B, 0, 0, 0);
    part(g, cyl(0.025, 0.025, 0.7), dark, 0, 0.02, -0.62, Math.PI / 2);
    part(g, box(0.08, 0.14, 0.32), B, 0, -0.03, 0.42);
    part(g, cyl(0.045, 0.045, 0.32), dark, 0, 0.13, -0.05, Math.PI / 2);
    part(g, cyl(0.055, 0.045, 0.05), A, 0, 0.13, -0.23, Math.PI / 2);
    part(g, box(0.05, 0.13, 0.06), dark, 0, -0.12, 0.12, -0.3);
    part(g, box(0.095, 0.03, 0.3), A, 0, 0.065, 0.1);
    muzzle.set(0, 0.02, -0.98);
  }
  g.userData.muzzle = muzzle;
  return g;
}

// Pickaxes: handle along -Y from the grip (hand) point, head at the end.
export function pickaxeModel(id) {
  const g = new THREE.Group();
  if (id === 'cleaver') {
    const crystal = mat('#b06dff', { emissive: '#7a2bff', emissiveIntensity: 0.5, roughness: 0.2, metalness: 0.3, flatShading: true });
    part(g, cyl(0.025, 0.03, 0.75, 8), mat('#2a2140'), 0, -0.25, 0);
    part(g, new THREE.OctahedronGeometry(0.22, 0), crystal, 0, -0.62, 0.12).scale.set(0.35, 1, 1.4);
    part(g, new THREE.OctahedronGeometry(0.12, 0), mat('#5ff0ff', { emissive: '#3fd8ff', emissiveIntensity: 0.6, flatShading: true }), 0, -0.6, -0.1).scale.set(0.4, 0.7, 1.4);
  } else if (id === 'wrench') {
    part(g, box(0.05, 0.75, 0.07), mat('#c9d3df', { metalness: 0.6, roughness: 0.3 }), 0, -0.3, 0);
    const head = part(g, new THREE.TorusGeometry(0.11, 0.045, 8, 16, Math.PI * 1.4), mat('#ffb21e', { metalness: 0.5, roughness: 0.3 }), 0, -0.72, 0, 0, Math.PI / 2, Math.PI * 0.8);
    head.scale.setScalar(1.1);
    part(g, box(0.07, 0.18, 0.09), mat('#ff3b5c'), 0, -0.05, 0);
  } else {
    part(g, cyl(0.028, 0.032, 0.8, 8), woodM, 0, -0.28, 0);
    const head = new THREE.Group(); head.position.set(0, -0.66, 0); g.add(head);
    part(head, new THREE.ConeGeometry(0.05, 0.32, 8), grey, 0, 0, 0.18, Math.PI / 2);
    part(head, new THREE.ConeGeometry(0.05, 0.26, 8), grey, 0, 0, -0.16, -Math.PI / 2);
    part(head, box(0.08, 0.1, 0.12), mat('#ffb21e'), 0, 0, 0);
  }
  return g;
}

export function gliderModel(id) {
  const g = new THREE.Group();
  const cloth = (c) => mat(c, { side: THREE.DoubleSide, roughness: 0.7 });
  if (id === 'kite') {
    const cols = ['#ff5fb4', '#ffd21f', '#ff8adf', '#ffb3e0', '#ff4f8b'];
    for (let i = 0; i < 5; i++) {
      const petal = part(g, new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), cloth(cols[i]), 0, 0, 0);
      petal.scale.set(0.6, 0.25, 1.3);
      petal.position.set(Math.cos(i / 5 * Math.PI * 2) * 0.8, 0.05, Math.sin(i / 5 * Math.PI * 2) * 0.8);
      petal.rotation.y = -i / 5 * Math.PI * 2 + Math.PI / 2;
    }
    part(g, new THREE.SphereGeometry(0.35, 12, 10), mat('#ffd21f'), 0, 0.1, 0).scale.y = 0.5;
  } else if (id === 'jet') {
    const wing = new THREE.Shape(); wing.moveTo(0, 0.6); wing.lineTo(1.8, -0.5); wing.lineTo(1.6, -0.75); wing.lineTo(0, -0.3); wing.lineTo(-1.6, -0.75); wing.lineTo(-1.8, -0.5); wing.closePath();
    part(g, new THREE.ExtrudeGeometry(wing, { depth: 0.08, bevelEnabled: false }), mat('#1f232b', { metalness: 0.5 }), 0, 0, 0, -Math.PI / 2);
    for (const s of [1, -1]) {
      part(g, cyl(0.12, 0.1, 0.6), mat('#ffb21e', { metalness: 0.5 }), 0.8 * s, -0.05, 0.1, Math.PI / 2);
      part(g, new THREE.ConeGeometry(0.1, 0.3, 10), mat('#ff6a1e', { emissive: '#ff4a12', emissiveIntensity: 1.5 }), 0.8 * s, -0.05, 0.5, Math.PI / 2);
    }
  } else {
    const sail = new THREE.Shape(); sail.moveTo(0, 0.9); sail.lineTo(1.7, -0.6); sail.quadraticCurveTo(0, -0.2, -1.7, -0.6); sail.closePath();
    const m = part(g, new THREE.ShapeGeometry(sail), cloth('#2fb8ff'), 0, 0.02, 0, -Math.PI / 2);
    m.add(new THREE.Mesh(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0, 0.9); s.lineTo(0.5, 0.45); s.lineTo(-0.5, 0.45); s.closePath(); return s; })()), cloth('#ffd21f')));
    m.children[0].position.z = 0.01;
    part(g, cyl(0.025, 0.025, 3.2), dark, 0, 0, 0.45, 0, 0, Math.PI / 2);
  }
  // struts down to the hands
  for (const s of [1, -1]) part(g, cyl(0.012, 0.012, 1.0, 5), dark, 0.25 * s, -0.5, 0, 0, 0, s * 0.3);
  return g;
}

export function consumableModel(id) {
  const g = new THREE.Group();
  if (id === 'bandage') {
    part(g, cyl(0.1, 0.1, 0.12, 16), mat('#f4f1e8'), 0, 0, 0, 0, 0, Math.PI / 2);
    part(g, box(0.25, 0.01, 0.1), mat('#f4f1e8'), 0.12, -0.09, 0);
  } else if (id === 'medkit') {
    part(g, box(0.36, 0.22, 0.14, 0.04), mat('#f4f6f8'), 0, 0, 0);
    part(g, box(0.06, 0.16, 0.15), mat('#2fcf6a'), 0, 0, 0);
    part(g, box(0.16, 0.06, 0.15), mat('#2fcf6a'), 0, 0, 0);
  } else if (id === 'shieldcell') {
    part(g, cyl(0.06, 0.06, 0.2, 14), mat('#5ad8ff', { emissive: '#2a9fff', emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }), 0, 0, 0);
    part(g, cyl(0.065, 0.065, 0.04, 14), mat('#e8edf5', { metalness: 0.6 }), 0, 0.11, 0);
  } else {
    part(g, new THREE.SphereGeometry(0.16, 16, 12), mat('#3fb0ff', { emissive: '#1f7fff', emissiveIntensity: 0.7, transparent: true, opacity: 0.9 }), 0, 0, 0);
    part(g, cyl(0.05, 0.07, 0.1, 12), mat('#e8edf5', { metalness: 0.6 }), 0, 0.18, 0);
  }
  return g;
}

const AMMO_COL = { light: '#7fd3ff', medium: '#5fd14a', heavy: '#ff5f5f', shells: '#ffb21e' };
export function ammoModel(type) {
  const g = new THREE.Group();
  part(g, box(0.3, 0.16, 0.22, 0.03), mat(AMMO_COL[type]), 0, 0, 0);
  part(g, box(0.31, 0.04, 0.23), mat('#1f232b'), 0, 0.03, 0);
  return g;
}

export function materialModel(type) {
  const g = new THREE.Group();
  if (type === 'wood') for (let i = 0; i < 3; i++) part(g, box(0.5, 0.07, 0.12), mat('#d9913e'), 0, i * 0.075, (i - 1) * 0.04, 0, i * 0.3, 0);
  else if (type === 'brick') for (let i = 0; i < 3; i++) part(g, box(0.24, 0.1, 0.12), mat('#d98a6f'), (i - 1) * 0.12, (i % 2) * 0.1, 0);
  else part(g, box(0.4, 0.04, 0.3), mat('#9db3c8', { metalness: 0.6, roughness: 0.3 }), 0, 0, 0);
  return g;
}

export function ammoBoxModel() {
  const g = new THREE.Group();
  part(g, box(0.7, 0.35, 0.45, 0.05), mat('#3f7f3a'), 0, 0.18, 0);
  part(g, box(0.72, 0.06, 0.47), mat('#ffd21f'), 0, 0.3, 0);
  return g;
}

export function chestModel() {
  const g = new THREE.Group();
  const gold = mat('#ffcf3a', { metalness: 0.7, roughness: 0.25, emissive: '#ffae00', emissiveIntensity: 0.25 });
  const woodC = mat('#8a4e2a', { roughness: 0.7 });
  part(g, box(1.0, 0.5, 0.6, 0.04), woodC, 0, 0.25, 0);
  const lid = new THREE.Group(); lid.name = 'lid'; lid.position.set(0, 0.5, -0.3); g.add(lid);
  part(lid, new THREE.CylinderGeometry(0.3, 0.3, 1.0, 16, 1, false, 0, Math.PI), woodC, 0, 0, 0.3, 0, 0, Math.PI / 2);
  for (const x of [-0.45, 0, 0.45]) {
    part(g, box(0.06, 0.52, 0.62), gold, x, 0.25, 0);
    part(lid, new THREE.TorusGeometry(0.3, 0.03, 6, 16, Math.PI), gold, x, 0, 0.3, 0, Math.PI / 2, 0);
  }
  part(g, box(0.16, 0.18, 0.06), gold, 0, 0.42, 0.31);
  return g;
}

// Sky barge: striped balloon over a wooden deck with side propellers (original design).
export function bargeModel() {
  const g = new THREE.Group();
  const env = new THREE.Group(); env.position.y = 9; g.add(env);
  const cols = ['#ff5a5a', '#fff3e0'];
  for (let i = 0; i < 8; i++) {
    const seg = part(env, new THREE.SphereGeometry(5, 24, 16, (i / 8) * Math.PI * 2, Math.PI / 4), mat(cols[i % 2], { roughness: 0.6 }), 0, 0, 0, Math.PI / 2, 0, 0);
    seg.scale.set(1, 2.4, 1);
  }
  for (const [ry, rz] of [[0, 0], [0, Math.PI / 2]]) part(env, box(0.2, 4, 3, 0.05), mat('#ffb21e'), 0, 0, 11.5, 0, ry, rz);
  part(g, box(4.2, 1.6, 12, 0.5), mat('#a8683a', { roughness: 0.8 }), 0, 0, 0);
  part(g, box(4.4, 0.3, 12.2, 0.1), mat('#ffd21f'), 0, 0.85, 0);
  for (const x of [-1.6, 1.6]) for (const z of [-4, 4]) part(g, cyl(0.08, 0.08, 6.5, 6), dark, x, 4, z);
  for (const s of [1, -1]) {
    part(g, cyl(0.35, 0.35, 1.6), grey, 3.2 * s, 0.6, 3.5, Math.PI / 2);
    const prop = new THREE.Group(); prop.name = `prop${s}`; prop.position.set(3.2 * s, 0.6, 4.4); g.add(prop);
    for (let b = 0; b < 3; b++) part(prop, box(0.25, 2.2, 0.06), mat('#2fb8ff'), 0, 0, 0, 0, 0, (b / 3) * Math.PI * 2).geometry.translate(0, 1.1, 0);
  }
  return g;
}
