// Item icons rendered once from the same 3D models the game uses, cached as data URLs.
import * as THREE from 'three';
import { weaponModel, pickaxeModel, consumableModel, ammoModel, materialModel, gliderModel } from '../models.js';
import { styleTexture, wrapTexture } from '../textures.js';
import { Avatar } from '../player/avatar.js';

let renderer = null;
const cache = new Map();
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight('#ffffff', '#8899aa', 2.2));
const sun = new THREE.DirectionalLight('#ffffff', 2.2); sun.position.set(2, 3, 4); scene.add(sun);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);

// frame: [cx, cy, cz, radius] for objects whose bounds Box3 can't see (skinned avatars)
function shoot(obj, w, h, view = [0, 0, 5], frame = null) {
  renderer ??= new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  if (frame) c.set(frame[0], frame[1], frame[2]);
  cam.position.set(c.x + view[0], c.y + view[1], c.z + view[2]); cam.lookAt(c);
  const r = frame ? frame[3] : Math.max(size.x, size.y, size.z) * 0.58, a = w / h;
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

// Avatar shots: o = outfit portrait, bb = back bling seen from behind, e = white emote silhouette.
function avatarShot(kind, id, outfit) {
  const av = new Avatar(kind === 'o' ? id : outfit, kind === 'bb' ? id : 'none');
  if (kind === 'e') {
    av.mesh.material = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    av.actions.idle.stop(); av.actions[`emote_${id}`].play(); av.mixer.update(EMOTE_POSE_T[id] ?? 0.3);
  } else av.mixer.update(0.5);
  av.update(0);
  const url = kind === 'o' ? shoot(av.root, 128, 128, [0, 0.05, 5], [0, 1.5, 0, 0.42])
    : kind === 'bb' ? shoot(av.root, 128, 128, [0, 0.4, -5], [0, 1.3, 0, 0.5])
    : shoot(av.root, 128, 128, [0, 0, 5], [0, 0.95, 0, 1.05]);
  av.mesh.geometry.dispose();
  if (kind === 'e') av.mesh.material.dispose();
  return url;
}
const EMOTE_POSE_T = { bounce: 0.25, wave: 0.4, pump: 0.3, spin: 0.2, clap: 0.2, kick: 0.25 };

function wrapSwatch(id) {
  const tex = wrapTexture(id);
  const m = new THREE.MeshStandardMaterial(tex ? { map: tex, roughness: 0.4 } : { color: '#3a4150', roughness: 0.45 });
  const g = new THREE.Group();
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 0.04), m); sheet.rotation.set(-0.5, 0.5, 0.15); g.add(sheet);
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.05, 16), m); roll.position.set(-0.72, 0.1, 0.15); roll.rotation.set(-0.5, 0.5, 0.15); g.add(roll);
  const url = shoot(g, 96, 96);
  g.traverse((o) => o.geometry?.dispose()); m.dispose();
  return url;
}

// key examples: w:ar:2:galaxy, pick:cleaver, h:medkit, a:light, m:wood, p:ramp, o:nova, bb:rocket:comet, e:spin, g:kite, wr:lava
export function icon(key) {
  if (cache.has(key)) return cache.get(key);
  const [kind, a, b, c] = key.split(':');
  let url;
  if (kind === 'o' || kind === 'bb' || kind === 'e') url = avatarShot(kind, a, b || 'comet');
  else if (kind === 'g') { const o = gliderModel(a); o.rotation.set(0.9, 0.5, 0); url = shoot(o, 96, 96); }
  else if (kind === 'wr') url = wrapSwatch(a);
  else if (kind === 'w') { const o = new THREE.Group(), w = weaponModel(a, Number(b), c || 'none'); w.rotation.y = -Math.PI / 2; o.add(w); o.rotation.z = 0.55; url = shoot(o, 96, 96); }
  else if (kind === 'pick') { const o = pickaxeModel(a); o.rotation.set(0, Math.PI / 2, Math.PI - 0.7, 'ZYX'); url = shoot(o, 96, 96); }
  else if (kind === 'h') { const o = consumableModel(a); o.rotation.set(0.3, -0.5, 0); url = shoot(o, 96, 96); }
  else if (kind === 'a') { const o = ammoModel(a); o.rotation.set(0.4, -0.6, 0); url = shoot(o, 64, 64); }
  else if (kind === 'm') { const o = materialModel(a); o.rotation.set(0.5, -0.5, 0); url = shoot(o, 64, 64); }
  else { const o = pieceMesh(a); o.rotation.set(0.45, -0.6, 0); url = shoot(o, 64, 64); }
  cache.set(key, url);
  return url;
}
