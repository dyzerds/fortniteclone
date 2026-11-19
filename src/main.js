import * as THREE from 'three';
import { initPhysics } from './physics.js';
import { createTerrain } from './world/terrain.js';
import { createSky, createComposer } from './world/sky.js';
import { createPois } from './world/pois.js';
import { createBuilding } from './build/building.js';
import { createFx } from './fx.js';
import { CameraRig } from './player/controller.js';
import { createMatch } from './match.js';
import { loadLoadout } from './cosmetics.js';
import { input } from './input.js';
import { settings } from './settings-store.js';

await initPhysics();
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.1, 5000);
const sky = createSky(scene);
const terrain = createTerrain(scene);
const { composer } = createComposer(renderer, scene, camera);
const fx = createFx(scene);
const building = createBuilding(scene, fx);
const pois = createPois(scene);
const rig = new CameraRig(camera);

const match = createMatch({ scene, rig, fx, building, pois, loadout: loadLoadout() });

// dev harness: ?p=x,z (start on the ground) &bots=n &yaw= &pitch= &emote= &kit=1
const qs = new URLSearchParams(location.search);
const dev = qs.has('p');
match.start({ dev, bots: Number(qs.get('bots') ?? settings.bots) });
if (dev) { const [px, pz] = qs.get('p').split(',').map(Number); match.spawnPlayer(px, pz); }
const look = { yaw: Number(qs.get('yaw') || 0), pitch: Number(qs.get('pitch') || -0.15), emote: qs.get('emote') };
if (qs.get('kit')) {
  const inv = match.hands.inv;
  for (const m of ['wood', 'brick', 'metal']) inv.addMat(m, 500);
  inv.add({ kind: 'weapon', cls: 'ar', rarity: 2, mag: 30 });
  inv.add({ kind: 'weapon', cls: 'shotgun', rarity: 3, mag: 5 });
  inv.add({ kind: 'weapon', cls: 'sniper', rarity: 4, mag: 1 });
  inv.add({ kind: 'heal', id: 'shieldcell', count: 6 });
  for (const a of ['light', 'medium', 'heavy', 'shells']) inv.addAmmo(a, 120);
}

input.enabled = true;
renderer.domElement.addEventListener('click', () => input.lock(renderer.domElement));
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

const timer = new THREE.Timer();
let acc = 0;
const STEP = 1 / 60;
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.1), t = timer.getElapsed();
  const [mx, my] = input.takeMouse();
  const s = 0.0022 * settings.sens * (match.hands.ads ? settings.adsSens : 1);
  look.yaw -= mx * s;
  look.pitch = Math.max(-1.45, Math.min(1.45, look.pitch - my * s * (settings.invertY === 'On' ? -1 : 1)));
  if (mx || my) look.emote = null;
  acc += dt;
  while (acc >= STEP) { match.tick(STEP); input.endTick(); acc -= STEP; }
  match.frame(dt, look);
  sky.update(dt, match.player.pos, camera.position);
  terrain.update(dt, t, camera.position);
  composer.render();
});
window.__ready = true;
window.__dbg = { match, building, look, rig, input };
