// Pooled 3D effects: debris chunks, bullet tracers, impact puffs, harvest weak-point marker.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const MAX_DEBRIS = 500, MAX_TRACERS = 64, MAX_PUFFS = 96;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

export function createFx(scene) {
  // debris
  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8 }), MAX_DEBRIS);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false; debris.castShadow = false;
  const parts = Array.from({ length: MAX_DEBRIS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3(), s: 0.2 }));
  for (let i = 0; i < MAX_DEBRIS; i++) { debris.setMatrixAt(i, _m.makeScale(0, 0, 0)); debris.setColorAt(i, _c.set('#fff')); }
  scene.add(debris);
  let dHead = 0;

  // tracers
  const tPos = new Float32Array(MAX_TRACERS * 6);
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3).setUsage(THREE.DynamicDrawUsage));
  const tracers = new THREE.LineSegments(tGeo, new THREE.LineBasicMaterial({ color: '#fff6c2', transparent: true, opacity: 0.9 }));
  tracers.frustumCulled = false;
  scene.add(tracers);
  const tLife = new Float32Array(MAX_TRACERS);
  let tHead = 0;

  // puffs (sprites)
  const puffMat = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false });
  const puffs = Array.from({ length: MAX_PUFFS }, () => {
    const s = new THREE.Sprite(puffMat.clone()); s.visible = false; scene.add(s);
    return { s, life: 0, max: 0.3, size: 1 };
  });
  let pHead = 0;

  // weak point
  const weak = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.2, 24), new THREE.MeshBasicMaterial({ color: '#4fe6ff', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthTest: false }));
  const weakCore = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: '#c8fbff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthTest: false }));
  weak.add(weakCore); weak.visible = false; weak.renderOrder = 5; weakCore.renderOrder = 5;
  scene.add(weak);

  return {
    weak,
    burst(pos, color, n = 10, size = 0.25, speed = 5) {
      for (let k = 0; k < n; k++) {
        const d = parts[dHead]; const i = dHead; dHead = (dHead + 1) % MAX_DEBRIS;
        d.life = 0.9 + Math.random() * 0.6; d.s = size * (0.5 + Math.random());
        d.p.set(pos.x + (Math.random() - 0.5) * 0.5, pos.y + (Math.random() - 0.5) * 0.5, pos.z + (Math.random() - 0.5) * 0.5);
        d.v.set((Math.random() - 0.5) * speed, Math.random() * speed * 0.8 + 1.5, (Math.random() - 0.5) * speed);
        d.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); d.w.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
        debris.setColorAt(i, _c.set(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.12));
      }
      debris.instanceColor.needsUpdate = true;
    },
    // fills a box-shaped region with debris (piece destroyed)
    shatter(box, color) {
      const n = 14;
      for (let k = 0; k < n; k++) {
        _p.set(box.min[0] + Math.random() * (box.max[0] - box.min[0]), box.min[1] + Math.random() * (box.max[1] - box.min[1]), box.min[2] + Math.random() * (box.max[2] - box.min[2]));
        this.burst(_p, color, 1, 0.45, 4);
      }
    },
    tracer(from, to) {
      const i = tHead; tHead = (tHead + 1) % MAX_TRACERS;
      // draw a short streak near the target end so it reads as a moving bullet
      const len = from.distanceTo(to), k = Math.max(0, 1 - Math.min(len, 18) / len);
      tPos.set([from.x + (to.x - from.x) * k * 0.4, from.y + (to.y - from.y) * k * 0.4, from.z + (to.z - from.z) * k * 0.4, to.x, to.y, to.z], i * 6);
      tLife[i] = 0.06;
      tGeo.attributes.position.needsUpdate = true;
    },
    puff(pos, color = '#ffffff', size = 0.6, life = 0.3) {
      const p = puffs[pHead]; pHead = (pHead + 1) % MAX_PUFFS;
      p.s.position.copy(pos); p.s.material.color.set(color); p.life = p.max = life; p.size = size; p.s.visible = true;
    },
    update(dt) {
      let any = false;
      for (let i = 0; i < MAX_DEBRIS; i++) {
        const d = parts[i];
        if (d.life <= 0) continue;
        any = true;
        d.life -= dt;
        d.v.y -= 18 * dt; d.p.addScaledVector(d.v, dt); d.r.addScaledVector(d.w, dt);
        const sc = d.life > 0 ? d.s * Math.min(1, d.life * 3) : 0;
        debris.setMatrixAt(i, _m.compose(d.p, _q.setFromEuler(_e.set(d.r.x, d.r.y, d.r.z)), _s.setScalar(sc)));
      }
      if (any) debris.instanceMatrix.needsUpdate = true;
      let tc = false;
      for (let i = 0; i < MAX_TRACERS; i++) if (tLife[i] > 0) { tLife[i] -= dt; if (tLife[i] <= 0) { tPos.fill(0, i * 6, i * 6 + 6); tc = true; } }
      if (tc) tGeo.attributes.position.needsUpdate = true;
      for (const p of puffs) {
        if (!p.s.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        const t = 1 - p.life / p.max;
        p.s.scale.setScalar(p.size * (0.5 + t));
        p.s.material.opacity = 1 - t;
      }
      if (weak.visible) { const s = 1 + Math.sin(performance.now() * 0.012) * 0.12; weak.scale.setScalar(s); }
    },
  };
}
