// Build pieces in 3D: meshes + colliders generated from tiles, build-up HP, damage, collapse, preview, edit overlay.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GRID, MATERIALS } from '../config.js';
import { BuildGrid, placement, keyOf, pieceBox, TILES, tileCount, CONE_H, buriedIn, ROT_DIRS } from './grid.js';
import { R, addStatic, removeCollider, raycast } from '../physics.js';
import { getHeight } from '../world/terrain.js';
import { styleTexture } from '../textures.js';

const C = GRID.cell, H = GRID.height, T = GRID.thick;
const SLOPE = Math.atan2(H, C), RAMP_LEN = Math.hypot(C, H);
const STYLE_MAT = { wood: 'wood', brick: 'brick', metal: 'metal' };
const DEBRIS = { wood: '#d9913e', brick: '#d98a6f', metal: '#9db3c8' };

// tile boxes in piece-local space: [cx, cy, cz, sx, sy, sz, rotX]
function tileBoxes(type) {
  const out = [];
  if (type === 'wall') for (let b = 0; b < 3; b++) for (let a = 0; a < 3; a++) out.push([-C / 2 + C / 6 + a * C / 3, H / 6 + b * H / 3, 0, C / 3, H / 3, T, 0]);
  if (type === 'floor') for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) out.push([-C / 2 + C / 4 + a * C / 2, 0, -C / 2 + C / 4 + b * C / 2, C / 2, T, C / 2, 0]);
  if (type === 'ramp') for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) out.push([-C / 2 + C / 4 + a * C / 2, H / 4 + b * H / 2, -C / 2 + C / 4 + b * C / 2, C / 2, T, RAMP_LEN / 2, -SLOPE]);
  return out;
}
const TILE_BOXES = { wall: tileBoxes('wall'), floor: tileBoxes('floor'), ramp: tileBoxes('ramp') };

function planarUV(geo) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (az >= ax && az >= ay) uv.setXY(i, p.getX(i) / C + 0.5, p.getY(i) / H);
    else if (ax >= ay) uv.setXY(i, p.getZ(i) / C + 0.5, p.getY(i) / H);
    else uv.setXY(i, p.getX(i) / C + 0.5, p.getZ(i) / C + 0.5);
  }
  return geo;
}

const _mat = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _e = new THREE.Euler();
function pieceGeometry(type, tiles) {
  if (type === 'cone') {
    const g = new THREE.ConeGeometry(C / Math.SQRT2, CONE_H, 4, 1, false, Math.PI / 4).translate(0, CONE_H / 2, 0);
    return g.index ? g.toNonIndexed() : g;
  }
  const parts = [];
  TILE_BOXES[type].forEach(([x, y, z, sx, sy, sz, rx], i) => {
    if (!tiles[i]) return;
    const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed();
    g.applyMatrix4(_mat.makeRotationX(rx).setPosition(x, y, z));
    parts.push(planarUV(g));
  });
  return mergeGeometries(parts);
}
// one shared geometry per tile pattern; ponytail: never evicted (at most 512 wall patterns, a few KB each)
const geoCache = {};
const geoFor = (type, tiles) => (geoCache[type + tiles.join('')] ??= pieceGeometry(type, tiles));

function placeTransform(p, obj) {
  if (p.type === 'wall') {
    if (p.dir === 'x') { obj.position.set(p.i * C + C / 2, p.l * H, p.k * C); obj.rotation.set(0, 0, 0); }
    else { obj.position.set(p.i * C, p.l * H, p.k * C + C / 2); obj.rotation.set(0, Math.PI / 2, 0); }
  } else {
    obj.position.set(p.i * C + C / 2, p.l * H, p.k * C + C / 2);
    const [dx, dz] = ROT_DIRS[p.rot ?? 2];
    obj.rotation.set(0, p.type === 'ramp' ? Math.atan2(dx, dz) : 0, 0);
  }
  obj.updateMatrixWorld(true);
}

export function createBuilding(scene, fx, terrain) {
  const grid = new BuildGrid(getHeight);
  const mats = {}, ghostMats = {};
  const matFor = (style) => (mats[style] ??= new THREE.MeshStandardMaterial({ map: styleTexture(style), roughness: 0.85 }));
  const constructMat = (style) => (ghostMats[style] ??= new THREE.MeshStandardMaterial({
    map: styleTexture(style), color: '#9fe3ff', emissive: '#2a7fff', emissiveIntensity: 0.55, transparent: true, opacity: 0.55, depthWrite: false, roughness: 0.6,
  }));
  const building = new Set();
  const collapseQueue = [];

  function buildColliders(p) {
    for (const c of p.colliders) removeCollider(c);
    p.colliders = [];
    const tag = { kind: 'piece', ref: p };
    const q = p.mesh.quaternion;
    const add = (desc) => p.colliders.push(addStatic(desc, tag));
    if (p.type === 'cone') {
      const pts = [];
      for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { _v.set(x * C / 2, 0, z * C / 2).applyMatrix4(p.mesh.matrixWorld); pts.push(_v.x, _v.y, _v.z); }
      _v.set(0, CONE_H, 0).applyMatrix4(p.mesh.matrixWorld); pts.push(_v.x, _v.y, _v.z);
      const d = R.ColliderDesc.convexHull(new Float32Array(pts));
      if (d) add(d);
      return;
    }
    const full = p.tiles.every(Boolean);
    const boxes = full ? [fullBox(p.type)] : TILE_BOXES[p.type].filter((_, i) => p.tiles[i]);
    for (const [x, y, z, sx, sy, sz, rx] of boxes) {
      _v.set(x, y, z).applyMatrix4(p.mesh.matrixWorld);
      _q.setFromEuler(_e.set(rx, 0, 0)).premultiply(q);
      add(R.ColliderDesc.cuboid(sx / 2, sy / 2, sz / 2).setTranslation(_v.x, _v.y, _v.z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }));
    }
  }
  function fullBox(type) {
    if (type === 'wall') return [0, H / 2, 0, C, H, T, 0];
    if (type === 'floor') return [0, 0, 0, C, T, C, 0];
    return [0, H / 2, 0, C, T, RAMP_LEN, -SLOPE];
  }

  function place(spec, mat = 'wood', { owner = null, style = null, instant = false, tiles = null } = {}) {
    const p = { ...spec, mat, style: style ?? STYLE_MAT[mat], owner, colliders: [], buildT: 0 };
    p.tiles = tiles ?? Array(tileCount(p.type)).fill(1);
    const M = MATERIALS[mat];
    p.maxHp = M.max;
    p.hp = instant ? M.max : M.max * M.start;
    p.built = instant;
    grid.add(p);
    p.mesh = new THREE.Mesh(geoFor(p.type, p.tiles), p.built ? matFor(p.style) : constructMat(p.style));
    p.mesh.castShadow = true; p.mesh.receiveShadow = true;
    placeTransform(p, p.mesh);
    p.mesh.matrixAutoUpdate = false;
    scene.add(p.mesh);
    buildColliders(p);
    terrain?.grassBlock(p.box, true);
    if (!instant) { building.add(p); p.mesh.scale.setScalar(0.7); p.mesh.matrixAutoUpdate = true; }
    return p;
  }

  function destroy(p, cascade = true) {
    if (!grid.has(p.key) || grid.pieces.get(p.key) !== p) return;
    const neighbors = cascade ? grid.neighbors(p) : null;
    grid.remove(p);
    building.delete(p);
    for (const c of p.colliders) removeCollider(c);
    p.colliders = [];
    terrain?.grassBlock(p.box, false);
    unbatch(p);
    scene.remove(p.mesh);
    p.dead = true;
    fx.shatter(p.box, DEBRIS[p.mat]);
    if (cascade) grid.unsupported(neighbors).forEach((q, i) => collapseQueue.push({ p: q, t: 0.06 + i * 0.035 }));
  }

  function damage(p, dmg) {
    if (p.dead) return false;
    p.hp -= dmg;
    p.hitT = 0.12;
    if (p.hp <= 0) { destroy(p); return true; }
    return false;
  }

  function setTiles(p, tiles) {
    unbatch(p);
    p.tiles = tiles;
    p.mesh.geometry = geoFor(p.type, tiles);
    buildColliders(p);
  }

  // ---- preview ghost ----
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#38b6ff', transparent: true, opacity: 0.35, depthWrite: false });
  const ghostEdge = new THREE.LineBasicMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.9 });
  const ghosts = {};
  for (const type of ['wall', 'floor', 'ramp', 'cone']) {
    const g = geoFor(type, Array(tileCount(type)).fill(1));
    const m = new THREE.Mesh(g, ghostMat);
    m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g, 30), ghostEdge));
    m.visible = false; m.renderOrder = 3;
    scene.add(m);
    ghosts[type] = m;
  }
  function showGhost(spec, valid) {
    for (const t in ghosts) ghosts[t].visible = false;
    if (!spec) return;
    const g = ghosts[spec.type];
    placeTransform(spec, g);
    g.visible = true;
    ghostMat.color.set(valid ? '#38b6ff' : '#ff4d4d');
    ghostEdge.color.set(valid ? '#bfe9ff' : '#ffc0c0');
  }

  // ---- placement for a character ----
  function slopeUnder(ch) {
    const hit = raycast({ x: ch.pos.x, y: ch.pos.y + 0.3, z: ch.pos.z }, { x: 0, y: -1, z: 0 }, 0.8, ch.collider);
    const p = hit?.tag?.kind === 'piece' ? hit.tag.ref : null;
    if (!p || p.type !== 'ramp') return 0;
    const facing = cardinalOf(ch.yaw);
    if (p.rot === facing) return H / C;
    if ((p.rot + 2) % 4 === facing) return -H / C;
    return 0;
  }
  const cardinalOf = (yaw) => { const fx = -Math.sin(yaw), fz = -Math.cos(yaw); return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 1 : 3) : (fz > 0 ? 2 : 0); };

  function target(ch, type, rotOffset = 0) {
    const spec = placement(type, ch.pos, ch.yaw, ch.pitch, { rotOffset, slope: slopeUnder(ch) });
    const valid = !grid.has(keyOf(spec)) && !buriedIn(pieceBox(spec), getHeight) && Math.abs(spec.i * C) < 590 && Math.abs(spec.k * C) < 590;
    return { spec, valid };
  }

  // ---- edit ----
  const editGroup = new THREE.Group(); scene.add(editGroup);
  const editKeep = new THREE.MeshBasicMaterial({ color: '#4fc3ff', transparent: true, opacity: 0.5, depthWrite: false });
  const editDrop = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false });
  const editEdge = new THREE.LineBasicMaterial({ color: '#e6f8ff' });
  function showEdit(p, sel) {
    editGroup.clear();
    if (!p) return;
    unbatch(p);
    placeTransform(p, editGroup);
    TILE_BOXES[p.type].forEach(([x, y, z, sx, sy, sz, rx], i) => {
      const g = new THREE.BoxGeometry(sx * 0.96, sy * 0.96 + (p.type === 'wall' ? 0 : 0.04), sz + 0.08);
      const m = new THREE.Mesh(g, sel[i] ? editKeep : editDrop);
      m.position.set(x, y, z); m.rotation.x = rx; m.renderOrder = 4;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(g), editEdge));
      editGroup.add(m);
    });
    p.mesh.visible = false;
  }
  function hideEdit(p) { editGroup.clear(); if (p?.mesh) p.mesh.visible = true; }
  // which tile of piece p does a world ray hit (plane math, works for removed tiles too)
  const _ray = new THREE.Ray(), _inv = new THREE.Matrix4(), _plane = new THREE.Plane(), _hit = new THREE.Vector3();
  function tileUnderRay(p, origin, dir) {
    placeTransform(p, editGroup);
    _inv.copy(editGroup.matrixWorld).invert();
    _ray.set(origin, dir).applyMatrix4(_inv);
    if (p.type === 'wall') _plane.set(_v.set(0, 0, 1), 0);
    else if (p.type === 'floor') _plane.set(_v.set(0, 1, 0), 0);
    else _plane.setFromNormalAndCoplanarPoint(_v.set(0, C, -H).normalize(), new THREE.Vector3(0, H / 2, 0));
    if (!_ray.intersectPlane(_plane, _hit)) return -1;
    const [cols, rows] = TILES[p.type];
    const a = Math.floor((_hit.x + C / 2) / (C / cols));
    const b = p.type === 'wall' ? Math.floor(_hit.y / (H / rows)) : Math.floor((_hit.z + C / 2) / (C / rows));
    if (a < 0 || a >= cols || b < 0 || b >= rows) return -1;
    return b * cols + a;
  }

  function update(dt) {
    for (const p of building) {
      const M = MATERIALS[p.mat];
      p.buildT += dt;
      p.hp = Math.min(p.maxHp, p.hp + (M.max * (1 - M.start) / M.buildTime) * dt);
      const s = Math.min(1, 0.7 + p.buildT * 4);
      p.mesh.scale.setScalar(s);
      if (p.buildT >= M.buildTime) {
        p.built = true; p.mesh.material = matFor(p.style); p.mesh.scale.setScalar(1);
        p.mesh.updateMatrix(); p.mesh.matrixAutoUpdate = false; building.delete(p);
      }
    }
    for (let i = collapseQueue.length - 1; i >= 0; i--) {
      const c = collapseQueue[i];
      c.t -= dt;
      if (c.t <= 0) { collapseQueue.splice(i, 1); destroy(c.p, false); }
    }
  }

  function reset() {
    for (const p of [...grid.pieces.values()]) {
      for (const c of p.colliders) removeCollider(c);
      scene.remove(p.mesh);
      p.dead = true;
    }
    for (const b of batches) { scene.remove(b.im); b.im.dispose(); }
    batches = [];
    terrain?.grassClear();
    grid.clear(); building.clear(); collapseQueue.length = 0;
    showGhost(null); hideEdit(null);
  }

  // ---- static batching: idle town pieces share one InstancedMesh per style + tile pattern (one draw call each).
  // A piece leaves its batch for its own mesh when edited or destroyed. ponytail: pieces never rejoin; bake() runs once per match.
  let batches = [];
  function bake() {
    const groups = new Map();
    for (const p of grid.pieces.values()) {
      if (!p.built || p.batch) continue;
      const key = `${p.style}|${p.type}|${p.tiles.join('')}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const list of groups.values()) {
      const im = new THREE.InstancedMesh(geoFor(list[0].type, list[0].tiles), matFor(list[0].style), list.length);
      im.castShadow = true; im.receiveShadow = true;
      const b = { im, owners: list };
      list.forEach((p, i) => { im.setMatrixAt(i, p.mesh.matrixWorld); p.batch = b; p.bi = i; scene.remove(p.mesh); });
      im.computeBoundingSphere();
      scene.add(im); batches.push(b);
    }
  }
  function unbatch(p) {
    const b = p.batch;
    if (!b) return;
    const last = b.owners.pop();
    if (last !== p) { b.owners[p.bi] = last; last.bi = p.bi; b.im.setMatrixAt(p.bi, last.mesh.matrixWorld); }
    b.im.count = b.owners.length; b.im.instanceMatrix.needsUpdate = true;
    p.batch = null;
    scene.add(p.mesh);
  }

  // push characters standing inside a fresh piece up onto it
  function unstick(chars, p) {
    for (const ch of chars) {
      if (!ch.alive || ch.mode !== 'ground') continue;
      const b = p.box;
      if (ch.pos.x < b.min[0] - 0.3 || ch.pos.x > b.max[0] + 0.3 || ch.pos.z < b.min[2] - 0.3 || ch.pos.z > b.max[2] + 0.3) continue;
      if (ch.pos.y > b.max[1] || ch.pos.y + ch.height < b.min[1]) continue;
      const hit = raycast({ x: ch.pos.x, y: b.max[1] + 0.5, z: ch.pos.z }, { x: 0, y: -1, z: 0 }, b.max[1] - ch.pos.y + 0.6, ch.collider);
      if (hit && hit.tag?.ref === p && hit.point.y > ch.pos.y) ch.teleport(ch.pos.x, hit.point.y + 0.05, ch.pos.z);
    }
  }

  return { grid, place, destroy, damage, setTiles, bake, target, showGhost, showEdit, hideEdit, tileUnderRay, update, reset, unstick };
}
