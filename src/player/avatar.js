// Code-built original characters: one SkinnedMesh per character (rigid skin weights, vertex colors),
// standard humanoid bone names, keyframed clips played by AnimationMixer.
// A future GLB skin with the same bone + clip names can replace buildBody() without touching callers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { byId } from '../cosmetics.js';

const D = Math.PI / 180;

// name, parent, offset from parent (rest pose: arms hanging, facing +Z, feet at y=0; right side is -X)
const BONES = [
  ['Hips', null, [0, 0.98, 0]],
  ['Spine', 'Hips', [0, 0.12, 0]],
  ['Chest', 'Spine', [0, 0.2, 0]],
  ['Neck', 'Chest', [0, 0.22, 0]],
  ['Head', 'Neck', [0, 0.08, 0]],
  ['LeftUpperArm', 'Chest', [0.21, 0.17, 0]],
  ['LeftLowerArm', 'LeftUpperArm', [0, -0.28, 0]],
  ['LeftHand', 'LeftLowerArm', [0, -0.25, 0]],
  ['RightUpperArm', 'Chest', [-0.21, 0.17, 0]],
  ['RightLowerArm', 'RightUpperArm', [0, -0.28, 0]],
  ['RightHand', 'RightLowerArm', [0, -0.25, 0]],
  ['LeftUpperLeg', 'Hips', [0.1, -0.04, 0]],
  ['LeftLowerLeg', 'LeftUpperLeg', [0, -0.44, 0]],
  ['LeftFoot', 'LeftLowerLeg', [0, -0.42, 0]],
  ['RightUpperLeg', 'Hips', [-0.1, -0.04, 0]],
  ['RightLowerLeg', 'RightUpperLeg', [0, -0.44, 0]],
  ['RightFoot', 'RightLowerLeg', [0, -0.42, 0]],
];
const BONE_INDEX = Object.fromEntries(BONES.map((b, i) => [b[0], i]));
const REST = Object.fromEntries(BONES.map((b) => [b[0], b[2]]));
const restWorld = {};
for (const [name, parent, off] of BONES) {
  const p = parent ? restWorld[parent] : [0, 0, 0];
  restWorld[name] = [p[0] + off[0], p[1] + off[1], p[2] + off[2]];
}

const capsule = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const box = (w, h, d, r = 0.04) => new RoundedBoxGeometry(w, h, d, 2, r);
const sphere = (r) => new THREE.SphereGeometry(r, 16, 12);

// ---------- body build ----------
function buildBody(o, backblingId) {
  const parts = [];
  const add = (bone, geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => parts.push({ bone, geo, color, x, y, z, rx, ry, rz });
  const skin = o.skin, top = o.top, bottom = o.bottom, acc = o.accent;

  add('Hips', box(0.36, 0.2, 0.24, 0.07), bottom, 0, 0.0, 0);
  add('Hips', box(0.38, 0.06, 0.26, 0.02), acc, 0, 0.09, 0); // belt
  add('Spine', box(0.32, 0.2, 0.22, 0.08), top, 0, 0.1, 0);
  add('Chest', box(0.44, 0.3, 0.26, 0.1), top, 0, 0.1, 0);
  add('Chest', box(0.12, 0.2, 0.03, 0.01), acc, 0.09, 0.1, 0.13);
  add('Neck', capsule(0.055, 0.06), skin, 0, 0.03, 0);
  // head
  add('Head', sphere(0.165).scale(1, 1.08, 1), skin, 0, 0.13, 0.01);
  for (const s of [1, -1]) {
    add('Head', sphere(0.032).scale(0.8, 1.15, 0.5), o.eyes, 0.06 * s, 0.15, 0.158);
    add('Head', sphere(0.011), '#ffffff', 0.066 * s, 0.165, 0.172);
    add('Head', box(0.055, 0.014, 0.02, 0.006), o.hairColor === '#000000' ? '#3a2a20' : o.hairColor, 0.062 * s, 0.205, 0.15, 0, 0, -0.15 * s);
    add('Head', sphere(0.035).scale(0.6, 1, 0.6), skin, 0.165 * s, 0.13, 0); // ears
  }
  add('Head', box(0.06, 0.016, 0.02, 0.008), '#8a3a3a', 0, 0.075, 0.155);
  // hair / headgear
  const hc = o.hairColor;
  if (o.hair === 'spiky') {
    add('Head', sphere(0.172).scale(1.02, 0.75, 1.02), hc, 0, 0.2, -0.015);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      add('Head', new THREE.ConeGeometry(0.05, 0.16, 6), hc, Math.cos(a) * 0.1, 0.3, Math.sin(a) * 0.1 - 0.03, Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
    }
  } else if (o.hair === 'bun') {
    add('Head', sphere(0.172).scale(1.02, 0.8, 1.04), hc, 0, 0.19, -0.02);
    add('Head', sphere(0.08), hc, 0, 0.27, -0.14);
  } else if (o.hair === 'mohawk') {
    add('Head', sphere(0.168).scale(1, 0.7, 1), hc, 0, 0.18, -0.02);
    for (let i = 0; i < 5; i++) add('Head', box(0.05, 0.14, 0.07, 0.02), hc, 0, 0.32, 0.1 - i * 0.065, -0.3 + i * 0.15, 0, 0);
  }
  if (o.head === 'goggles') {
    add('Head', new THREE.TorusGeometry(0.17, 0.022, 6, 24).rotateX(Math.PI / 2), '#2a2f3a', 0, 0.24, 0);
    for (const s of [1, -1]) add('Head', new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateX(Math.PI / 2), o.headColor, 0.065 * s, 0.26, 0.15, -0.6, 0, 0);
  } else if (o.head === 'cap') {
    add('Head', sphere(0.178).scale(1, 0.62, 1), o.headColor, 0, 0.22, 0);
    add('Head', box(0.24, 0.025, 0.16, 0.01), o.headColor, 0, 0.2, 0.17);
  } else if (o.head === 'helmet') {
    add('Head', sphere(0.205).scale(1, 1.05, 1.02), o.headColor, 0, 0.14, 0);
    add('Head', sphere(0.17).scale(1.05, 0.62, 0.7), o.visor, 0, 0.13, 0.085);
    add('Head', new THREE.ConeGeometry(0.035, 0.18, 6), o.accent, 0, 0.38, -0.02, -0.3, 0, 0);
  }
  // arms
  for (const [side, s] of [['Left', 1], ['Right', -1]]) {
    add(`${side}UpperArm`, sphere(0.085), top, 0, -0.02, 0); // shoulder
    add(`${side}UpperArm`, capsule(0.06, 0.18), top, 0, -0.14, 0);
    add(`${side}LowerArm`, capsule(0.052, 0.17), skin, 0, -0.12, 0);
    add(`${side}LowerArm`, new THREE.CylinderGeometry(0.06, 0.06, 0.07, 10), o.gloves, 0, -0.2, 0);
    add(`${side}Hand`, box(0.08, 0.1, 0.06, 0.025), o.gloves, 0, -0.04, 0.005);
    add(`${side}UpperLeg`, capsule(0.09, 0.28), bottom, 0, -0.22, 0);
    add(`${side}LowerLeg`, capsule(0.075, 0.26), bottom, 0, -0.2, 0);
    add(`${side}LowerLeg`, new THREE.CylinderGeometry(0.085, 0.09, 0.2, 10), o.boots, 0, -0.3, 0);
    add(`${side}Foot`, box(0.12, 0.1, 0.25, 0.04), o.boots, 0, -0.03, 0.05);
    void s;
  }
  // back bling
  if (backblingId === 'rocket') {
    for (const s of [1, -1]) {
      add('Chest', new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12), '#e8edf5', 0.08 * s, 0.08, -0.2);
      add('Chest', new THREE.ConeGeometry(0.07, 0.12, 12), '#ff3b5c', 0.08 * s, 0.31, -0.2);
      add('Chest', new THREE.ConeGeometry(0.06, 0.1, 10).rotateX(Math.PI), '#ffb21e', 0.08 * s, -0.13, -0.2);
    }
    add('Chest', box(0.2, 0.16, 0.06, 0.02), '#2a2f3a', 0, 0.1, -0.15);
  } else if (backblingId === 'leaf') {
    add('Chest', sphere(0.2).scale(1, 1.25, 0.35), '#3fae3a', 0, 0.05, -0.2);
    add('Chest', box(0.02, 0.4, 0.02, 0.005), '#2a6a24', 0, 0.05, -0.27);
  }

  const color = new THREE.Color();
  const geos = parts.map((p) => {
    let g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    g.deleteAttribute('uv');
    const w = restWorld[p.bone];
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(w[0] + p.x, w[1] + p.y, w[2] + p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rx, p.ry, p.rz)), new THREE.Vector3(1, 1, 1)));
    const n = g.attributes.position.count;
    color.set(p.color);
    const c = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const bi = BONE_INDEX[p.bone];
    for (let i = 0; i < n; i++) { c[i * 3] = color.r; c[i * 3 + 1] = color.g; c[i * 3 + 2] = color.b; si[i * 4] = bi; sw[i * 4] = 1; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    return g;
  });
  const geo = mergeGeometries(geos);
  geo.computeBoundingSphere();
  geo.boundingSphere.radius = 1.6;
  return geo;
}

// ---------- clips ----------
// tracks: { Bone: [[t, rx, ry, rz], ...] } in degrees; 'pos': [[t, dx, dy, dz]] hips offset.
function clip(name, dur, tracks) {
  const out = [];
  for (const [bone] of BONES) {
    const keys = tracks[bone] ?? [[0, 0, 0, 0]];
    const times = [], vals = [], q = new THREE.Quaternion(), e = new THREE.Euler();
    for (const [t, x, y, z] of keys) { times.push(t); q.setFromEuler(e.set(x * D, y * D, z * D)); vals.push(q.x, q.y, q.z, q.w); }
    out.push(new THREE.QuaternionKeyframeTrack(`${bone}.quaternion`, times, vals));
  }
  const pos = tracks.pos ?? [[0, 0, 0, 0]];
  out.push(new THREE.VectorKeyframeTrack('Hips.position', pos.map((k) => k[0]), pos.flatMap((k) => [REST.Hips[0] + k[1], REST.Hips[1] + k[2], REST.Hips[2] + k[3]])));
  return new THREE.AnimationClip(name, dur, out);
}

// cyclic helper: builds keys at fractions of the period from a function f(phase 0..1) -> [x,y,z]
const cyc = (dur, n, f) => Array.from({ length: n + 1 }, (_, i) => [dur * i / n, ...f(i / n)]);
const S = (p, a, off = 0) => Math.sin((p + off) * Math.PI * 2) * a;
const C = (p, a, off = 0) => Math.cos((p + off) * Math.PI * 2) * a;

function makeClips() {
  const L = [];
  // idle
  L.push(clip('idle', 2.4, {
    Spine: cyc(2.4, 4, (p) => [S(p, 1.5), 0, 0]),
    Chest: cyc(2.4, 4, (p) => [S(p, 2), 0, 0]),
    Head: cyc(2.4, 4, (p) => [S(p, 2, 0.2), S(p, 3), 0]),
    LeftUpperArm: cyc(2.4, 4, (p) => [S(p, 3), 0, 9]), RightUpperArm: cyc(2.4, 4, (p) => [S(p, 3), 0, -9]),
    LeftLowerArm: [[0, -12, 0, 0]], RightLowerArm: [[0, -12, 0, 0]],
    pos: cyc(2.4, 4, (p) => [0, S(p, 0.008), 0]),
  }));
  const run = (name, dur, amp, lean, bob) => clip(name, dur, {
    Spine: [[0, lean, 0, 0]], Chest: cyc(dur, 8, (p) => [4, S(p, 7), 0]),
    LeftUpperLeg: cyc(dur, 8, (p) => [-S(p, amp), 0, 0]), RightUpperLeg: cyc(dur, 8, (p) => [S(p, amp), 0, 0]),
    LeftLowerLeg: cyc(dur, 8, (p) => [25 + Math.max(0, C(p, amp * 1.6, 0.1)), 0, 0]), RightLowerLeg: cyc(dur, 8, (p) => [25 + Math.max(0, -C(p, amp * 1.6, 0.1)), 0, 0]),
    LeftFoot: cyc(dur, 8, (p) => [S(p, 15), 0, 0]), RightFoot: cyc(dur, 8, (p) => [-S(p, 15), 0, 0]),
    LeftUpperArm: cyc(dur, 8, (p) => [S(p, amp * 0.9), 0, 10]), RightUpperArm: cyc(dur, 8, (p) => [-S(p, amp * 0.9), 0, -10]),
    LeftLowerArm: [[0, -70, 0, 0]], RightLowerArm: [[0, -70, 0, 0]],
    pos: cyc(dur, 8, (p) => [0, Math.abs(S(p, bob)) - bob * 0.6, 0]),
  });
  L.push(run('jog', 0.72, 38, 8, 0.06));
  L.push(run('sprint', 0.56, 52, 18, 0.08));
  L.push(clip('crouch', 2, {
    Spine: [[0, 22, 0, 0]], Head: [[0, -12, 0, 0]],
    LeftUpperLeg: [[0, -75, 0, 6]], RightUpperLeg: [[0, -50, 0, -6]], LeftLowerLeg: [[0, 110, 0, 0]], RightLowerLeg: [[0, 100, 0, 0]],
    LeftFoot: [[0, -30, 0, 0]], RightFoot: [[0, -40, 0, 0]],
    LeftUpperArm: [[0, -20, 0, 12]], RightUpperArm: [[0, -20, 0, -12]], LeftLowerArm: [[0, -50, 0, 0]], RightLowerArm: [[0, -50, 0, 0]],
    pos: [[0, 0, -0.36, 0]],
  }));
  L.push(clip('crouchWalk', 0.9, {
    Spine: [[0, 24, 0, 0]], Head: [[0, -12, 0, 0]],
    LeftUpperLeg: cyc(0.9, 8, (p) => [-62 - S(p, 25), 0, 6]), RightUpperLeg: cyc(0.9, 8, (p) => [-62 + S(p, 25), 0, -6]),
    LeftLowerLeg: cyc(0.9, 8, (p) => [100 + C(p, 20), 0, 0]), RightLowerLeg: cyc(0.9, 8, (p) => [100 - C(p, 20), 0, 0]),
    LeftFoot: [[0, -30, 0, 0]], RightFoot: [[0, -30, 0, 0]],
    LeftUpperArm: cyc(0.9, 8, (p) => [-20 + S(p, 15), 0, 12]), RightUpperArm: cyc(0.9, 8, (p) => [-20 - S(p, 15), 0, -12]),
    LeftLowerArm: [[0, -50, 0, 0]], RightLowerArm: [[0, -50, 0, 0]],
    pos: cyc(0.9, 8, (p) => [0, -0.34 + Math.abs(S(p, 0.03)), 0]),
  }));
  // jump: push off, then tuck both knees (one higher). Played once and held at the tuck.
  L.push(clip('jump', 0.32, {
    Spine: [[0, -4, 0, 0], [0.32, 8, 0, 0]], Chest: [[0, 0, 0, 0], [0.32, 4, 0, 0]],
    LeftUpperLeg: [[0, -15, 0, 2], [0.18, -62, 0, 4], [0.32, -72, 0, 4]], LeftLowerLeg: [[0, 15, 0, 0], [0.18, 85, 0, 0], [0.32, 100, 0, 0]],
    RightUpperLeg: [[0, 10, 0, -2], [0.18, -25, 0, -4], [0.32, -38, 0, -4]], RightLowerLeg: [[0, 10, 0, 0], [0.18, 55, 0, 0], [0.32, 75, 0, 0]],
    LeftFoot: [[0, 20, 0, 0], [0.32, -15, 0, 0]], RightFoot: [[0, 25, 0, 0], [0.32, -10, 0, 0]],
    LeftUpperArm: [[0, 25, 0, 14], [0.32, -30, 0, 28]], RightUpperArm: [[0, 25, 0, -14], [0.32, 12, 0, -30]],
    LeftLowerArm: [[0, -30, 0, 0], [0.32, -55, 0, 0]], RightLowerArm: [[0, -30, 0, 0], [0.32, -45, 0, 0]],
  }));
  // fall: legs reach down for the ground, arms out a little for balance
  L.push(clip('fall', 1.2, {
    Spine: [[0, 3, 0, 0]],
    LeftUpperLeg: cyc(1.2, 4, (p) => [-34 + S(p, 4), 0, 4]), LeftLowerLeg: cyc(1.2, 4, (p) => [48 + S(p, 5), 0, 0]),
    RightUpperLeg: cyc(1.2, 4, (p) => [-12 - S(p, 4), 0, -4]), RightLowerLeg: cyc(1.2, 4, (p) => [28 - S(p, 5), 0, 0]),
    LeftFoot: [[0, -8, 0, 0]], RightFoot: [[0, 4, 0, 0]],
    LeftUpperArm: cyc(1.2, 4, (p) => [-12, 0, 38 + S(p, 5)]), RightUpperArm: cyc(1.2, 4, (p) => [-4, 0, -38 - S(p, 5)]),
    LeftLowerArm: [[0, -35, 0, 0]], RightLowerArm: [[0, -35, 0, 0]],
  }));
  L.push(clip('slide', 1, {
    Spine: [[0, -28, 0, 0]], Head: [[0, 25, 0, 0]],
    LeftUpperLeg: [[0, -85, 0, 0]], LeftLowerLeg: [[0, 8, 0, 0]], RightUpperLeg: [[0, -35, 0, -10]], RightLowerLeg: [[0, 115, 0, 0]],
    LeftUpperArm: [[0, 30, 0, 30]], RightUpperArm: [[0, 40, 0, -20]], LeftLowerArm: [[0, -30, 0, 0]], RightLowerArm: [[0, -30, 0, 0]],
    pos: [[0, 0, -0.5, 0]],
  }));
  L.push(clip('skydive', 1.2, {
    Hips: cyc(1.2, 4, (p) => [78, 0, S(p, 3)]), Head: [[0, -55, 0, 0]],
    LeftUpperArm: cyc(1.2, 4, (p) => [-20, 0, 95 + S(p, 6)]), RightUpperArm: cyc(1.2, 4, (p) => [-20, 0, -95 - S(p, 6)]),
    LeftLowerArm: [[0, -35, 0, 0]], RightLowerArm: [[0, -35, 0, 0]],
    LeftUpperLeg: cyc(1.2, 4, (p) => [15, 0, 12 + S(p, 4)]), RightUpperLeg: cyc(1.2, 4, (p) => [15, 0, -12 - S(p, 4)]),
    LeftLowerLeg: [[0, 45, 0, 0]], RightLowerLeg: [[0, 45, 0, 0]],
  }));
  L.push(clip('glide', 1.6, {
    Spine: [[0, 6, 0, 0]],
    LeftUpperArm: [[0, 0, 0, 165]], RightUpperArm: [[0, 0, 0, -165]], LeftLowerArm: [[0, 0, 0, 0]], RightLowerArm: [[0, 0, 0, 0]],
    LeftUpperLeg: cyc(1.6, 4, (p) => [10 + S(p, 10), 0, 4]), RightUpperLeg: cyc(1.6, 4, (p) => [10 - S(p, 10), 0, -4]),
    LeftLowerLeg: [[0, 30, 0, 0]], RightLowerLeg: [[0, 30, 0, 0]],
  }));
  L.push(clip('swim', 1.2, {
    Hips: [[0, 55, 0, 0]], Head: [[0, -45, 0, 0]],
    LeftUpperArm: cyc(1.2, 8, (p) => [-90 - S(p, 70), 0, 20]), RightUpperArm: cyc(1.2, 8, (p) => [-90 + S(p, 70), 0, -20]),
    LeftUpperLeg: cyc(1.2, 8, (p) => [S(p, 20, 0.25), 0, 0]), RightUpperLeg: cyc(1.2, 8, (p) => [-S(p, 20, 0.25), 0, 0]),
    pos: [[0, 0, 0, 0]], // head just above the surface at the float depth (feet = waterLevel - 1.25)
  }));
  L.push(clip('dead', 1, {
    Hips: [[0, -88, 0, 0]], pos: [[0, 0, -0.8, -0.2]],
    LeftUpperArm: [[0, 0, 0, 70]], RightUpperArm: [[0, 0, 0, -70]], LeftUpperLeg: [[0, 0, 0, 10]], RightUpperLeg: [[0, 0, 0, -10]],
  }));

  // ---- dances (original choreography) ----
  L.push(clip('emote_bounce', 1, {
    pos: cyc(1, 8, (p) => [0, -Math.abs(S(p * 2, 0.09)), 0]),
    LeftUpperLeg: cyc(1, 8, (p) => [-Math.abs(S(p * 2, 20)), 0, 4]), RightUpperLeg: cyc(1, 8, (p) => [-Math.abs(S(p * 2, 20)), 0, -4]),
    LeftLowerLeg: cyc(1, 8, (p) => [Math.abs(S(p * 2, 40)), 0, 0]), RightLowerLeg: cyc(1, 8, (p) => [Math.abs(S(p * 2, 40)), 0, 0]),
    LeftUpperArm: cyc(1, 8, (p) => [-60 + S(p, 60), 0, 20]), RightUpperArm: cyc(1, 8, (p) => [-60 - S(p, 60), 0, -20]),
    LeftLowerArm: [[0, -90, 0, 0]], RightLowerArm: [[0, -90, 0, 0]],
    Head: cyc(1, 8, (p) => [S(p * 2, 10), 0, 0]),
  }));
  L.push(clip('emote_wave', 1.6, {
    Hips: cyc(1.6, 8, (p) => [0, 0, S(p, 6)]), Chest: cyc(1.6, 8, (p) => [0, 0, -S(p, 10)]),
    LeftUpperArm: cyc(1.6, 8, (p) => [0, 0, 90 + S(p, 25)]), RightUpperArm: cyc(1.6, 8, (p) => [0, 0, -90 + S(p, 25, 0.15)]),
    LeftLowerArm: cyc(1.6, 8, (p) => [0, 0, S(p, 35, 0.1)]), RightLowerArm: cyc(1.6, 8, (p) => [0, 0, S(p, 35, 0.25)]),
    LeftUpperLeg: cyc(1.6, 8, (p) => [-Math.max(0, S(p, 20)), 0, 0]), RightUpperLeg: cyc(1.6, 8, (p) => [-Math.max(0, -S(p, 20)), 0, 0]),
    LeftLowerLeg: cyc(1.6, 8, (p) => [Math.max(0, S(p, 35)), 0, 0]), RightLowerLeg: cyc(1.6, 8, (p) => [Math.max(0, -S(p, 35)), 0, 0]),
  }));
  L.push(clip('emote_pump', 1.2, {
    RightUpperArm: cyc(1.2, 8, (p) => [0, 0, -150 - S(p * 2, 20)]), RightLowerArm: cyc(1.2, 8, (p) => [-40 - Math.abs(S(p * 2, 60)), 0, 0]),
    LeftUpperArm: [[0, -10, 0, 25]], LeftLowerArm: [[0, -100, 0, 0]], LeftHand: [[0, 0, 0, 0]],
    Spine: cyc(1.2, 8, (p) => [-6 + S(p * 2, 4), 0, 0]), Head: cyc(1.2, 8, (p) => [-15 + S(p * 2, 8), 0, 0]),
    LeftUpperLeg: cyc(1.2, 8, (p) => [-Math.abs(S(p * 2, 15)), 0, 8]), RightUpperLeg: cyc(1.2, 8, (p) => [-Math.abs(S(p * 2, 15)), 0, -8]),
    LeftLowerLeg: cyc(1.2, 8, (p) => [Math.abs(S(p * 2, 30)), 0, 0]), RightLowerLeg: cyc(1.2, 8, (p) => [Math.abs(S(p * 2, 30)), 0, 0]),
    pos: cyc(1.2, 8, (p) => [0, -Math.abs(S(p * 2, 0.06)), 0]),
  }));
  L.push(clip('emote_spin', 1.6, {
    Hips: [[0, 0, 0, 0], [0.4, 0, 90, 0], [0.8, 0, 180, 0], [1.2, 0, 270, 0], [1.6, 0, 360, 0]],
    LeftUpperArm: cyc(1.6, 8, (p) => [0, 0, 85 + S(p * 2, 10)]), RightUpperArm: cyc(1.6, 8, (p) => [0, 0, -85 - S(p * 2, 10)]),
    LeftUpperLeg: cyc(1.6, 8, (p) => [-Math.max(0, S(p * 2, 30)), 0, 0]), LeftLowerLeg: cyc(1.6, 8, (p) => [Math.max(0, S(p * 2, 60)), 0, 0]),
    Head: [[0, 10, 0, 0]],
  }));
  L.push(clip('emote_clap', 0.8, {
    LeftUpperArm: cyc(0.8, 8, (p) => [-70, 0, 30 - Math.abs(S(p, 28))]), RightUpperArm: cyc(0.8, 8, (p) => [-70, 0, -30 + Math.abs(S(p, 28))]),
    LeftLowerArm: cyc(0.8, 8, (p) => [-30, -40 + Math.abs(S(p, 35)), 0]), RightLowerArm: cyc(0.8, 8, (p) => [-30, 40 - Math.abs(S(p, 35)), 0]),
    pos: cyc(0.8, 8, (p) => [S(p, 0.08), -Math.abs(S(p * 2, 0.04)), 0]),
    Hips: cyc(0.8, 8, (p) => [0, 0, S(p, 6)]), Head: cyc(0.8, 8, (p) => [0, 0, -S(p, 8)]),
    LeftUpperLeg: cyc(0.8, 8, (p) => [-Math.max(0, S(p, 25)), 0, 6]), RightUpperLeg: cyc(0.8, 8, (p) => [-Math.max(0, -S(p, 25)), 0, -6]),
    LeftLowerLeg: cyc(0.8, 8, (p) => [Math.max(0, S(p, 45)), 0, 0]), RightLowerLeg: cyc(0.8, 8, (p) => [Math.max(0, -S(p, 45)), 0, 0]),
  }));
  L.push(clip('emote_kick', 1, {
    LeftUpperLeg: cyc(1, 8, (p) => [-Math.max(0, S(p, 70)), 0, 10]), RightUpperLeg: cyc(1, 8, (p) => [-Math.max(0, -S(p, 70)), 0, -10]),
    LeftLowerLeg: cyc(1, 8, (p) => [Math.max(0, S(p, 30, 0.25)), 0, 0]), RightLowerLeg: cyc(1, 8, (p) => [Math.max(0, -S(p, 30, 0.25)), 0, 0]),
    LeftUpperArm: cyc(1, 8, (p) => [S(p, 50), 0, 35]), RightUpperArm: cyc(1, 8, (p) => [-S(p, 50), 0, -35]),
    LeftLowerArm: [[0, -80, 0, 0]], RightLowerArm: [[0, -80, 0, 0]],
    Spine: cyc(1, 8, (p) => [-8, S(p, 12), 0]),
    pos: cyc(1, 8, (p) => [0, Math.abs(S(p * 2, 0.07)) - 0.05, 0]),
  }));
  return Object.fromEntries(L.map((c) => [c.name, c]));
}
let CLIPS = null;

// ---------- upper-body poses (applied after the mixer) ----------
const pose = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y, z]]) => [k, new THREE.Quaternion().setFromEuler(new THREE.Euler(x * D, y * D, z * D))]));
const POSES = {
  rifle: pose({ RightUpperArm: [-75, 0, -25], RightLowerArm: [-35, 0, 0], RightHand: [0, 0, 0], LeftUpperArm: [-80, -20, 30], LeftLowerArm: [-20, 0, 0], LeftHand: [0, 0, 0] }),
  pistol: pose({ RightUpperArm: [-88, 0, -8], RightLowerArm: [0, 0, 0], RightHand: [0, 0, 0], LeftUpperArm: [-85, 0, 28], LeftLowerArm: [-10, 0, 0], LeftHand: [0, 0, 0] }),
  pickaxe: pose({ RightUpperArm: [-20, 0, -12], RightLowerArm: [-60, 0, 0] }),
  consume: pose({ RightUpperArm: [-60, 0, -5], RightLowerArm: [-90, 0, 0], LeftUpperArm: [-50, 0, 10], LeftLowerArm: [-80, 0, 0] }),
  build: pose({ RightUpperArm: [-70, 0, -10], RightLowerArm: [-40, 0, 0] }),
};
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class Avatar {
  constructor(outfitId, backblingId) {
    CLIPS ??= makeClips();
    this.root = new THREE.Group();
    this.bones = {};
    const list = [];
    for (const [name, parent, off] of BONES) {
      const b = new THREE.Bone(); b.name = name; b.position.set(...off);
      (parent ? this.bones[parent] : this.root).add(b);
      this.bones[name] = b; list.push(b);
    }
    this.mesh = new THREE.SkinnedMesh(buildBody(byId('outfit', outfitId), backblingId), Avatar.material);
    this.mesh.castShadow = true;
    this.mesh.add(this.bones.Hips);
    this.mesh.bind(new THREE.Skeleton(list));
    this.root.add(this.mesh);
    this.mixer = new THREE.AnimationMixer(this.mesh);
    this.actions = {};
    for (const [k, c] of Object.entries(CLIPS)) this.actions[k] = this.mixer.clipAction(c);
    this.actions.jump.setLoop(THREE.LoopOnce); this.actions.jump.clampWhenFinished = true;
    // The mixer skips writing a bone whose clip value did not change since last frame, so procedural
    // offsets (twist, aim, swing) would pile up frame after frame. Keep the mixer's pose and restore it first.
    this.list = list; this.saved = list.map((b) => b.quaternion.clone()); this.savedHips = this.bones.Hips.position.clone();
    this.land = 0;
    this.state = ''; this.w = new Map(); this.fade = 0.15;
    this.play('idle');
    this.upper = null; this.upperW = 0;
    this.swingT = -1;
    this.aimPitch = 0;
    this.twist = 0;
  }

  setOutfit(outfitId, backblingId) {
    this.mesh.geometry.dispose();
    this.mesh.geometry = buildBody(byId('outfit', outfitId), backblingId);
  }

  // Weights are blended by hand so they always sum to 1: switching again mid-fade never pops.
  play(name, fade = 0.15, timeScale = 1) {
    const a = this.actions[name];
    a.timeScale = timeScale;
    if (this.state === name) return;
    if (!this.w.has(name)) { a.reset().play(); this.w.set(name, 0); }
    else if (a.loop === THREE.LoopOnce) a.reset().play(); // one-shots restart
    this.state = name; this.fade = Math.max(0.01, fade);
  }

  blend(dt) {
    const w = this.w;
    let rest = 0;
    for (const [k, v] of w) if (k !== this.state) rest += v;
    const t = rest > 0 ? Math.min(1, w.get(this.state) + dt / this.fade) : 1, scale = rest > 0 ? (1 - t) / rest : 0;
    for (const [k, v] of w) {
      const nv = k === this.state ? t : v * scale;
      if (k !== this.state && nv < 0.002) { this.actions[k].stop(); w.delete(k); continue; }
      w.set(k, nv); this.actions[k].setEffectiveWeight(nv);
    }
  }

  swing() { this.swingT = 0; }

  update(dt) {
    const list = this.list, saved = this.saved;
    for (let i = 0; i < list.length; i++) list[i].quaternion.copy(saved[i]);
    this.bones.Hips.position.copy(this.savedHips);
    this.blend(dt);
    this.mixer.update(dt);
    for (let i = 0; i < list.length; i++) saved[i].copy(list[i].quaternion);
    this.savedHips.copy(this.bones.Hips.position);
    const b = this.bones;
    // landing: knees give for a moment
    if (this.land > 0) {
      const k = this.land;
      b.Hips.position.y -= 0.1 * k;
      for (const s of ['Left', 'Right']) {
        b[`${s}UpperLeg`].quaternion.multiply(_q.setFromEuler(_e.set(-30 * k * D, 0, 0)));
        b[`${s}LowerLeg`].quaternion.multiply(_q.setFromEuler(_e.set(55 * k * D, 0, 0)));
        b[`${s}Foot`].quaternion.multiply(_q.setFromEuler(_e.set(-25 * k * D, 0, 0)));
      }
      b.Spine.quaternion.multiply(_q.setFromEuler(_e.set(10 * k * D, 0, 0)));
    }
    // lower/upper body twist for strafing: hips turn toward movement, chest stays on aim
    if (this.twist) {
      b.Hips.quaternion.premultiply(_q.setFromEuler(_e.set(0, this.twist, 0)));
      b.Spine.quaternion.multiply(_q.setFromEuler(_e.set(0, -this.twist, 0)));
    }
    const target = this.upper ? POSES[this.upper] : null;
    this.upperW = Math.min(1, Math.max(0, this.upperW + (target ? dt : -dt) * 8));
    if (target && this.upperW > 0) for (const k in target) b[k].quaternion.slerp(target[k], this.upperW);
    const gun = this.upper === 'rifle' || this.upper === 'pistol';
    if (this.upper) {
      b.Chest.quaternion.multiply(_q.setFromEuler(_e.set(-this.aimPitch * (gun ? 0.75 : 0.3), 0, 0)));
      b.Head.quaternion.multiply(_q.setFromEuler(_e.set(-this.aimPitch * (gun ? 0.25 : 0.35), 0, 0)));
    }
    if (this.swingT >= 0) {
      this.swingT += dt;
      const t = this.swingT / 0.45;
      if (t >= 1) this.swingT = -1;
      else {
        const raise = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        b.RightUpperArm.quaternion.setFromEuler(_e.set((-30 - raise * 130) * D, 0, (-20 + raise * 10) * D));
        b.RightLowerArm.quaternion.setFromEuler(_e.set((-20 - raise * 40) * D, 0, 0));
        b.Chest.quaternion.multiply(_q.setFromEuler(_e.set((t < 0.35 ? -10 * raise : 25 * (1 - raise)) * D, (raise * 25) * D, 0)));
      }
    }
  }

  handWorld(side, out) { return this.bones[`${side}Hand`].getWorldPosition(out); }
}
Avatar.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
