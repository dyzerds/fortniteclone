// Item icons rendered once from the same 3D models the game uses, cached as data URLs.
import * as THREE from 'three';
import { weaponModel, pickaxeModel, consumableModel, ammoModel, materialModel } from '../models.js';
import { styleTexture } from '../textures.js';

let renderer = null;
const cache = new Map();
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffffff', '#8899aa', 2.2));
const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(2, 3, 4); scene.add(sun);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);

function shoot(obj, w, h, view = [0, 0, 5]) {
  renderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene.add(obj);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  cam.position.set(c.x + view[0], c.y + view[1], c.z + view[2]); cam.lookAt(c);
  const r = Math.max(size.x, size.y, size.z) * 0.58, a = w / h;
  cam.left = -r * a; cam.right = r * a; cam.top = r; cam.bottom = -r; cam.updateProjectionMatrix();
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL();
  scene.remove(obj);
  return url;
}

function pieceMesh(type) {
  const m = new THREE.MeshStandardMaterial({ map: styleTexture('wood'), color: '#bfe6ff' });
  const g = new THREE.Group();
  const add = (geo, rx = 0) => { const o = new THREE.Mesh(geo, m); o.rotation.x = rx; g.add(o); };
  if (type === 'wall') add(new THREE.BoxGeometry(1.6, 1.2, 0.1));
  else if (type === 'floor') add(new THREE.BoxGeometry(1.4, 0.1, 1.4));
  else if (type === 'ramp') add(new THREE.BoxGeometry(1.3, 0.1, 1.6), -0.65);
  else { const c = new THREE.Mesh(new THREE.ConeGeometry(1, 0.7, 4, 1), m); c.rotation.y = Math.PI / 4; g.add(c); }
  return g;
}

// key examples: w:ar:2:galaxy, pick:cleaver, h:medkit, a:light, m:wood, p:ramp
export function icon(key) {
  if (cache.has(key)) return cache.get(key);
  const [kind, a, b, c] = key.split(':');
  let url;
  if (kind === 'w') { const o = new THREE.Group(), w = weaponModel(a, Number(b), c || 'none'); w.rotation.y = -Math.PI / 2; o.add(w); o.rotation.z = 0.55; url = shoot(o, 96, 96); }
  else if (kind === 'pick') { const o = pickaxeModel(a); o.rotation.z = -0.7; url = shoot(o, 96, 96); }
  else if (kind === 'h') { const o = consumableModel(a); o.rotation.set(0.3, -0.5, 0); url = shoot(o, 96, 96); }
  else if (kind === 'a') { const o = ammoModel(a); o.rotation.set(0.4, -0.6, 0); url = shoot(o, 64, 64); }
  else if (kind === 'm') { const o = materialModel(a); o.rotation.set(0.5, -0.5, 0); url = shoot(o, 64, 64); }
  else { const o = pieceMesh(a); o.rotation.set(0.45, -0.6, 0); url = shoot(o, 64, 64); }
  cache.set(key, url);
  return url;
}
