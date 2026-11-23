// Towns built from the same build pieces the player uses (so they can be harvested and destroyed),
// plus cars, static landmarks and loot spawn points. Layouts come from towns.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { GRID } from '../config.js';
import { rng, pick } from '../util.js';
import { R } from '../physics.js';
import { addProp, getHeight } from './terrain.js';
import { getTowns } from './towns.js';
import { createLandmarks } from './landmarks.js';

const C = GRID.cell, H = GRID.height;
const DOOR = [1, 4], WINDOW = [4], WIDE = [3, 4, 5], GARAGE = [0, 1, 2, 3, 4, 5];
const WINDOW_CHANCE = { house: 0.65, shop: 0.5, cabin: 0.5, lodge: 0.6, mansion: 0.8, barn: 0.25, shed: 0.3, warehouse: 0.25, garage: 0.3, trailer: 0.6, keep: 0.35, container: 0, walls: 0 };

function carGeo() {
  const parts = [
    [new RoundedBoxGeometry(2, 0.72, 4.4, 3, 0.3), 0, 0.72, 0, '#ffffff'],              // body
    [new RoundedBoxGeometry(1.76, 0.66, 2.2, 3, 0.28), 0, 1.36, -0.25, '#ffffff'],       // cabin
    [new THREE.BoxGeometry(1.8, 0.42, 1.98), 0, 1.4, -0.25, '#33465a'],                 // glass band
    [new RoundedBoxGeometry(2.06, 0.3, 0.32, 2, 0.12), 0, 0.5, 2.14, '#3a3f48'],         // front bumper
    [new RoundedBoxGeometry(2.06, 0.3, 0.32, 2, 0.12), 0, 0.5, -2.14, '#3a3f48'],        // rear bumper
    [new THREE.BoxGeometry(0.42, 0.16, 0.06), -0.66, 0.84, 2.2, '#fff6d0'],             // headlights
    [new THREE.BoxGeometry(0.42, 0.16, 0.06), 0.66, 0.84, 2.2, '#fff6d0'],
    [new THREE.BoxGeometry(0.42, 0.14, 0.06), -0.66, 0.84, -2.2, '#ff3b30'],            // taillights
    [new THREE.BoxGeometry(0.42, 0.14, 0.06), 0.66, 0.84, -2.2, '#ff3b30'],
  ];
  for (const [x, z] of [[-0.92, 1.35], [0.92, 1.35], [-0.92, -1.35], [0.92, -1.35]]) {
    parts.push([new THREE.CylinderGeometry(0.42, 0.42, 0.34, 16).rotateZ(Math.PI / 2), x, 0.42, z, '#23262d']);
    parts.push([new THREE.CylinderGeometry(0.22, 0.22, 0.36, 10).rotateZ(Math.PI / 2), x, 0.42, z, '#b9c0c8']);
  }
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
  const towns = getTowns();
  createLandmarks(scene, towns);

  const carList = towns.flatMap((T) => T.cars);
  const cars = new THREE.InstancedMesh(carGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.2 }), carList.length);
  cars.castShadow = true; cars.receiveShadow = true;
  const carCols = ['#ff4f5e', '#3fa3ff', '#ffd21f', '#5fd14a', '#ff8a1f', '#c45cff', '#f2f2f2', '#2fc4b2'];
  const r0 = rng(777), up = new THREE.Vector3(0, 1, 0), s1 = new THREE.Vector3(1, 1, 1);
  carList.forEach(({ x, z, rot }, i) => {
    const y = getHeight(x, z), q = new THREE.Quaternion().setFromAxisAngle(up, rot);
    const mat = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, s1);
    cars.setMatrixAt(i, mat);
    cars.setColorAt(i, new THREE.Color(pick(r0, carCols)));
    addProp('car', x, y, z, 400, [[cars, i, mat]], R.ColliderDesc.cuboid(1, 0.9, 2.2).setTranslation(x, y + 0.9, z).setRotation(q), 2);
  });
  cars.instanceMatrix.needsUpdate = true; cars.instanceColor.needsUpdate = true; cars.computeBoundingSphere();
  scene.add(cars);

  const spots = [], houses = []; // houses: ground-floor box + door points for bot pathing

  // houses are (re)built every match because they can be destroyed
  function build(building) {
    spots.length = 0; houses.length = 0;
    for (const T of towns) {
      const r = rng((Math.round(T.poi.x * 31 + T.poi.z * 17) >>> 0) + 5);
      const l0 = Math.round(T.poi.h / H);
      for (const b of T.buildings) buildOne(building, b, l0, r);
      // open-air loot around town, off the building footprints and out of the water
      for (let n = 0, t = 0; n < 6 && t < 30; t++) {
        const a = r() * 6.28, d = T.poi.r * (0.2 + r() * 0.75), x = T.poi.x + Math.cos(a) * d, z = T.poi.z + Math.sin(a) * d;
        if (getHeight(x, z) < 0.5 || T.buildings.some((b) => !b.noFloor && x > b.i0 * C - 1 && x < (b.i0 + b.w) * C + 1 && z > b.k0 * C - 1 && z < (b.k0 + b.d) * C + 1)) continue;
        spots.push({ x, y: getHeight(x, z), z, kind: n < 2 ? 'chest' : n < 4 ? 'floor' : 'ammo' });
        n++;
      }
    }
    building.bake();
    return spots;
  }

  function buildOne(building, b, l0, r) {
    const { i0, k0, w, d, stories, mat } = b;
    const opt = (style, tiles) => ({ style, instant: true, tiles });
    const winP = WINDOW_CHANCE[b.kind] ?? 0.5;
    const broken = () => b.broken && r() < b.broken;

    // ramp: corner cell farthest from the door, rising toward the inside
    const doorCell = [[b.doorAt, 0], [b.doorAt, d - 1], [0, b.doorAt], [w - 1, b.doorAt]][b.door];
    let ramp = null;
    if (stories > 1 && !b.hollow && !b.noFloor && w * d > 1) {
      const [a, c] = [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]
        .reduce((best, p) => (Math.hypot(p[0] - doorCell[0], p[1] - doorCell[1]) > Math.hypot(best[0] - doorCell[0], best[1] - doorCell[1]) ? p : best));
      const alongZ = d >= 2 && (d >= w || w < 2);
      ramp = { a, c, rot: alongZ ? (c === 0 ? 2 : 0) : (a === 0 ? 1 : 3) };
    }

    // one wall cell: side 0 -z, 1 +z, 2 -x, 3 +x; idx = cell along that side
    const wall = (s, side, idx) => {
      const isDoor = s === 0 && side === b.door && idx === b.doorAt;
      if (!isDoor && broken()) return;
      const front = s === 0 && side === b.door && b.front;
      let base = front || b.wall, list = [], tag = '';
      if (isDoor) { list = b.hollow ? GARAGE : DOOR; tag = b.hollow ? '' : '+d'; }
      else if (front) list = WIDE;
      else if (r() < winP) { list = WINDOW; tag = '+w'; }
      const style = base + tag;
      const l = l0 + s;
      const spec = side < 2 ? { type: 'wall', dir: 'x', i: i0 + idx, k: k0 + (side ? d : 0), l } : { type: 'wall', dir: 'z', i: i0 + (side === 3 ? w : 0), k: k0 + idx, l };
      building.place(spec, mat, opt(style, holes(list)));
    };

    for (let s = 0; s < stories; s++) {
      const l = l0 + s;
      const hasFloor = s === 0 ? !b.noFloor : !b.hollow && !b.noFloor;
      if (hasFloor) for (let a = 0; a < w; a++) for (let c = 0; c < d; c++) {
        if (s > 0 && ramp && a === ramp.a && c === ramp.c) continue; // stairwell
        if (s > 0 && broken()) continue;
        building.place({ type: 'floor', i: i0 + a, k: k0 + c, l }, mat, opt(b.floor));
      }
      for (let a = 0; a < w; a++) { wall(s, 0, a); wall(s, 1, a); }
      for (let c = 0; c < d; c++) { wall(s, 2, c); wall(s, 3, c); }
      if (s === 0 && ramp) building.place({ type: 'ramp', i: i0 + ramp.a, k: k0 + ramp.c, l, rot: ramp.rot }, 'wood', opt('floorWood'));
      // loot: a chest on most floors, floor loot or ammo elsewhere
      if (hasFloor) {
        const cells = [];
        for (let a = 0; a < w; a++) for (let c = 0; c < d; c++) if (!(ramp && a === ramp.a && c === ramp.c)) cells.push([a, c]);
        const n = b.kind === 'container' ? (r() < 0.5 ? 1 : 0) : 1 + (r() < 0.5);
        for (let m = 0; m < n && cells.length; m++) {
          const [a, c] = cells.splice(Math.floor(r() * cells.length), 1)[0];
          spots.push({ x: (i0 + a + 0.5) * C + (r() - 0.5) * 1.5, y: l * H + GRID.thick / 2, z: (k0 + c + 0.5) * C + (r() - 0.5) * 1.5, kind: m === 0 && r() < 0.65 ? 'chest' : r() < 0.5 ? 'ammo' : 'floor' });
        }
      } else if (b.noFloor && s === 0) {
        const x = (i0 + w / 2) * C + 3, z = (k0 + d / 2) * C + 6;
        spots.push({ x, y: getHeight(x, z), z, kind: 'chest' });
      }
    }

    const top = l0 + stories;
    if (b.roofKind === 'gable') {
      const axis = w >= d ? 'x' : 'z', rows = axis === 'x' ? d : w;
      for (let a = 0; a < w; a++) for (let c = 0; c < d; c++)
        building.place({ type: 'cone', i: i0 + a, k: k0 + c, l: top, gable: { axis, row: axis === 'x' ? c : a, rows, end: b.wall } }, mat, opt(b.roof));
    } else if (b.roofKind === 'flat') {
      for (let a = 0; a < w; a++) for (let c = 0; c < d; c++) if (!broken()) building.place({ type: 'floor', i: i0 + a, k: k0 + c, l: top }, mat, opt(b.roof));
    }

    const door = [
      [(i0 + b.doorAt + 0.5) * C, k0 * C, 0, -1], [(i0 + b.doorAt + 0.5) * C, (k0 + d) * C, 0, 1],
      [i0 * C, (k0 + b.doorAt + 0.5) * C, -1, 0], [(i0 + w) * C, (k0 + b.doorAt + 0.5) * C, 1, 0],
    ][b.door];
    houses.push({ x0: i0 * C, z0: k0 * C, x1: (i0 + w) * C, z1: (k0 + d) * C, y: l0 * H,
      out: [door[0] + door[2] * 1.6, door[1] + door[3] * 1.6], in: [door[0] - door[2] * 1.6, door[1] - door[3] * 1.6] });
  }

  return { build, spots, houses };
}

function holes(list) { const t = Array(9).fill(1); for (const i of list) t[i] = 0; return t; }
