// Towns built from the same build pieces the player uses (so they can be harvested and destroyed),
// plus metal props (cars) and loot spawn points.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GRID, POIS } from '../config.js';
import { rng, pick } from '../util.js';
import { R } from '../physics.js';
import { addProp, getHeight } from './terrain.js';

const C = GRID.cell, H = GRID.height;
const WALLS = ['plasterPink', 'plasterYellow', 'plasterBlue', 'plasterMint'];
const ROOFS = ['roofRed', 'roofBlue', 'roofTeal'];
const DOOR = [1, 4], WINDOW = [4];

function carGeo() {
  const parts = [
    [new RoundedBoxGeometry(2, 0.8, 4.2, 2, 0.25), 0, 0.75, 0, '#ffffff'],
    [new RoundedBoxGeometry(1.8, 0.7, 2.2, 2, 0.25), 0, 1.45, -0.2, '#ffffff'],
    [new THREE.BoxGeometry(1.84, 0.5, 2.0), 0, 1.5, -0.2, '#9fe3ff'],
  ];
  for (const [x, z] of [[-0.95, 1.3], [0.95, 1.3], [-0.95, -1.3], [0.95, -1.3]]) parts.push([new THREE.CylinderGeometry(0.4, 0.4, 0.3, 14).rotateZ(Math.PI / 2), x, 0.4, z, '#2a2f3a']);
  const c = new THREE.Color();
  return mergeGeometries(parts.map(([g, x, y, z, col]) => {
    g = (g.index ? g.toNonIndexed() : g).translate(x, y, z); g.deleteAttribute('uv');
    c.set(col);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) arr.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  }));
}

export function createPois(scene) {
  const cars = new THREE.InstancedMesh(carGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 }), 60);
  cars.count = 0; cars.castShadow = true; cars.receiveShadow = true;
  const carCols = ['#ff4f5e', '#3fa3ff', '#ffd21f', '#5fd14a', '#ff8a1f', '#c45cff', '#f2f2f2'];
  const r0 = rng(777);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const spots = [];

  for (const poi of POIS) {
    const r = rng(Math.round(poi.x * 13 + poi.z * 7));
    for (let n = 0; n < 4; n++) {
      const a = r() * Math.PI * 2, d = poi.r * (0.3 + r() * 0.6);
      const x = poi.x + Math.cos(a) * d, z = poi.z + Math.sin(a) * d, y = getHeight(x, z), rot = r() * 6.28;
      const i = cars.count++;
      const mat = new THREE.Matrix4().compose(v.set(x, y, z), q.setFromAxisAngle(v.set(0, 1, 0).clone(), rot), s);
      cars.setMatrixAt(i, mat);
      cars.setColorAt(i, new THREE.Color(pick(r0, carCols)));
      const cq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
      addProp('metal', x, y, z, 300, [[cars, i, mat]], R.ColliderDesc.cuboid(1, 0.9, 2.1).setTranslation(x, y + 0.9, z).setRotation(cq), 2);
    }
  }
  cars.instanceMatrix.needsUpdate = true; cars.instanceColor.needsUpdate = true; cars.computeBoundingSphere();
  scene.add(cars);

  // houses are (re)built every match because they can be destroyed
  function build(building) {
    spots.length = 0;
    for (const poi of POIS) {
      const r = rng(Math.round(poi.x * 31 + poi.z * 17));
      const l0 = Math.round(poi.h / H);
      const used = new Set();
      const ci = Math.floor(poi.x / C), ck = Math.floor(poi.z / C);
      const R2 = Math.floor(poi.r / C) - 2;
      const industrial = poi.name.startsWith('Rustbolt');
      for (let tries = 0, houses = 0; tries < 60 && houses < 7; tries++) {
        const w = industrial ? 1 + (r() < 0.5) : 2 + (r() < 0.4), d = industrial ? 2 + (r() < 0.5) : 2 + (r() < 0.5);
        const i0 = ci + Math.round((r() - 0.5) * 2 * R2), k0 = ck + Math.round((r() - 0.5) * 2 * R2);
        let free = true;
        for (let a = -1; a <= w && free; a++) for (let b = -1; b <= d && free; b++) if (used.has(`${i0 + a},${k0 + b}`)) free = false;
        if (!free || Math.hypot((i0 + w / 2) * C - poi.x, (k0 + d / 2) * C - poi.z) > poi.r - 8) continue;
        for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) used.add(`${i0 + a},${k0 + b}`);
        houses++;
        const stories = industrial ? 1 : 1 + (r() < 0.55 && d >= 2 ? 1 : 0);
        const wallStyle = industrial ? 'container' : pick(r, WALLS), roofStyle = pick(r, ROOFS);
        const mat = industrial ? 'metal' : r() < 0.5 ? 'brick' : 'wood';
        const opt = (style, tiles) => ({ style, instant: true, tiles });
        const doorSide = Math.floor(r() * 4);
        const rampCell = stories > 1 ? [i0, k0 + d - 1] : null;
        for (let s2 = 0; s2 < stories; s2++) {
          const l = l0 + s2;
          for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) {
            const isRampHole = s2 > 0 && rampCell && a === 0 && b === d - 1;
            if (!isRampHole) building.place({ type: 'floor', i: i0 + a, k: k0 + b, l }, mat, opt(industrial ? 'metal' : 'floorTile'));
          }
          for (let a = 0; a < w; a++) {
            const southDoor = s2 === 0 && doorSide === 0 && a === 0, northDoor = s2 === 0 && doorSide === 1 && a === w - 1;
            building.place({ type: 'wall', dir: 'x', i: i0 + a, k: k0, l }, mat, opt(wallStyle, holes(southDoor ? DOOR : r() < 0.4 ? WINDOW : [])));
            building.place({ type: 'wall', dir: 'x', i: i0 + a, k: k0 + d, l }, mat, opt(wallStyle, holes(northDoor ? DOOR : r() < 0.4 ? WINDOW : [])));
          }
          for (let b = 0; b < d; b++) {
            const westDoor = s2 === 0 && doorSide === 2 && b === 0, eastDoor = s2 === 0 && doorSide === 3 && b === d - 1;
            building.place({ type: 'wall', dir: 'z', i: i0, k: k0 + b, l }, mat, opt(wallStyle, holes(westDoor ? DOOR : r() < 0.4 ? WINDOW : [])));
            building.place({ type: 'wall', dir: 'z', i: i0 + w, k: k0 + b, l }, mat, opt(wallStyle, holes(eastDoor ? DOOR : r() < 0.4 ? WINDOW : [])));
          }
          if (s2 === 0 && rampCell) building.place({ type: 'ramp', i: rampCell[0], k: rampCell[1], l, rot: 0 }, 'wood', opt('wood'));
          // loot: a chest on most floors, floor loot elsewhere
          const lx = (i0 + (w > 1 ? 1 : 0) + 0.5) * C, lz = (k0 + 0.5) * C;
          spots.push({ x: lx, y: l * H + GRID.thick / 2, z: lz, kind: r() < 0.65 ? 'chest' : 'floor' });
          if (r() < 0.5) spots.push({ x: (i0 + w - 0.5) * C - 1, y: l * H + GRID.thick / 2, z: (k0 + d - 0.5) * C, kind: r() < 0.5 ? 'ammo' : 'floor' });
        }
        const top = l0 + stories;
        for (let a = 0; a < w; a++) for (let b = 0; b < d; b++) {
          if (industrial) building.place({ type: 'floor', i: i0 + a, k: k0 + b, l: top }, mat, opt('metal'));
          else building.place({ type: 'cone', i: i0 + a, k: k0 + b, l: top }, mat, opt(roofStyle));
        }
      }
      // open-air loot around town
      for (let n = 0; n < 6; n++) {
        const a = r() * 6.28, d2 = poi.r * (0.2 + r() * 0.8), x = poi.x + Math.cos(a) * d2, z = poi.z + Math.sin(a) * d2;
        if (used.has(`${Math.floor(x / C)},${Math.floor(z / C)}`)) continue;
        spots.push({ x, y: getHeight(x, z), z, kind: n < 2 ? 'chest' : n < 4 ? 'floor' : 'ammo' });
      }
    }
    return spots;
  }
  return { build, spots };
}

function holes(list) { const t = Array(9).fill(1); for (const i of list) t[i] = 0; return t; }
