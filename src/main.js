import * as THREE from 'three';
import { initPhysics } from './physics.js';
import { createTerrain } from './world/terrain.js';
import { createSky, createComposer } from './world/sky.js';
import { createPois } from './world/pois.js';
import { createBuilding } from './build/building.js';
import { createFx } from './fx.js';
import { CameraRig } from './player/controller.js';
import { createMatch } from './match.js';
import { createHud } from './hud/hud.js';
import { createUi, recordMatch } from './ui/lobby.js';
import { loadLoadout } from './cosmetics.js';
import { input } from './input.js';
import { settings, onSettings } from './settings-store.js';

await initPhysics();
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(80, innerWidth / innerHeight, 0.1, 5000);
const sky = createSky(scene);
const terrain = createTerrain(scene);
const { composer, bloom } = createComposer(renderer, scene, camera);
const fx = createFx(scene);
const building = createBuilding(scene, fx);
const pois = createPois(scene);
const rig = new CameraRig(camera);
const loadout = loadLoadout();

const hud = createHud(document.body, { onExit: () => toLobby() });
const match = createMatch({
  scene, rig, fx, building, pois, loadout,
  events: {
    damage: (pt, n, info) => hud.damage(pt, n, info, camera),
    hurt: (att) => hud.hurt(att, match.player, match.player.yaw),
    eliminated: (t, by, cls, left) => hud.eliminated(t, by, cls, left, match.player),
    over: (r) => { recordMatch(r); hud.over(r); },
    jumped: () => hud.jumped(),
    map: () => hud.toggleMap(),
  },
});
const look = { yaw: 0, pitch: -0.15, emote: null };

const ui = createUi({
  renderer, scene, camera, sky, terrain, composer, loadout,
  onPlay: () => play(),
  onResume: () => input.lock(canvas),
  onLeave: () => toLobby(),
  onLoadout: (l) => match.setLoadout(l),
});

function play(dev = false) {
  hud.reset(); hud.show(true); input.reset();
  match.start({ dev, bots: Number(settings.bots) });
  look.yaw = 0; look.pitch = -0.15;
  ui.show('match');
  input.lock(canvas);
}
function toLobby() {
  match.end(); hud.reset(); hud.show(false);
  if (document.pointerLockElement) document.exitPointerLock();
  ui.show('lobby');
}

// Esc (lost pointer lock) mid-match pauses; getting the lock back resumes
document.addEventListener('pointerlockchange', () => {
  const live = match.state === 'bus' || match.state === 'play';
  if (!document.pointerLockElement && ui.screen === 'match' && live) ui.show('pause');
  else if (document.pointerLockElement && ui.screen === 'pause') { input.reset(); ui.show('match'); }
});
canvas.addEventListener('click', () => { if (ui.screen === 'match') input.lock(canvas); });
// Ctrl is crouch, so Ctrl+W is one slip away: ask before closing mid-match
addEventListener('beforeunload', (e) => { if (match.state === 'bus' || match.state === 'play') e.preventDefault(); });

// ---- video settings ----
const fpsEl = Object.assign(document.createElement('div'), { style: 'position:fixed;left:8px;bottom:6px;z-index:30;font:700 12px Nunito,sans-serif;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none' });
document.body.appendChild(fpsEl);
function applyVideo(s) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, s.quality === 'Epic' ? 2 : 1.5) * s.renderScale);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  renderer.toneMappingExposure = s.brightness;
  sky.sun.castShadow = s.shadows === 'On';
  bloom.enabled = s.bloom === 'On';
  terrain.setGrass(s.grass);
  rig.baseFov = s.fov;
  fpsEl.hidden = s.showFps !== 'On';
}
applyVideo(settings);
onSettings(applyVideo);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// dev harness: ?p=x,z (start on the ground) &bots=n &yaw= &pitch= &emote= &kit=1 ; ?play=1 full match ; ?screen=locker|settings
const qs = new URLSearchParams(location.search);
input.enabled = true;
toLobby();
if (qs.has('p') || qs.has('play')) {
  if (qs.has('bots')) settings.bots = qs.get('bots');
  play(qs.has('p'));
  if (qs.has('p')) { const [px, pz] = qs.get('p').split(',').map(Number); match.spawnPlayer(px, pz); }
  look.yaw = Number(qs.get('yaw') || 0); look.pitch = Number(qs.get('pitch') || -0.15); look.emote = qs.get('emote');
  if (qs.get('kit')) {
    const inv = match.hands.inv;
    for (const m of ['wood', 'brick', 'metal']) inv.addMat(m, 500);
    inv.add({ kind: 'weapon', cls: 'ar', rarity: 2, mag: 30 });
    inv.add({ kind: 'weapon', cls: 'shotgun', rarity: 3, mag: 5 });
    inv.add({ kind: 'weapon', cls: 'sniper', rarity: 4, mag: 1 });
    inv.add({ kind: 'heal', id: 'shieldcell', count: 6 });
    for (const a of ['light', 'medium', 'heavy', 'shells']) inv.addAmmo(a, 120);
  }
} else if (qs.get('screen')) ui.show(qs.get('screen'));

const timer = new THREE.Timer();
let acc = 0, fpsT = 0, fpsN = 0;
const STEP = 1 / 60;
renderer.setAnimationLoop((now) => {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.1), t = timer.getElapsed();
  fpsT += dt; fpsN++;
  if (fpsT >= 0.5) { fpsEl.textContent = `${Math.round(fpsN / fpsT)} FPS`; fpsT = fpsN = 0; }
  const scr = ui.screen;
  if (scr === 'settings') return; // opaque screen, nothing behind it to draw
  if (scr !== 'match' && scr !== 'pause') { ui.frame(dt, t); return; }
  if (scr === 'match') {
    const [mx, my] = input.takeMouse();
    const cur = match.hands.inv.current;
    const s = 0.0022 * settings.sens * (match.hands.ads ? (cur?.cls === 'sniper' ? settings.scopeSens : settings.adsSens) : 1);
    look.yaw -= mx * s;
    look.pitch = Math.max(-1.45, Math.min(1.45, look.pitch - my * s * (settings.invertY === 'On' ? -1 : 1)));
    if (mx || my) look.emote = null;
    acc += dt;
    while (acc >= STEP) { match.tick(STEP); input.endTick(); acc -= STEP; }
    match.frame(dt, look);
    hud.update(dt, match, camera, rig);
  }
  sky.update(dt, match.player.pos, camera.position);
  terrain.update(dt, t, camera.position);
  composer.render();
});
window.__ready = true;
window.__dbg = { match, building, look, rig, input, hud, ui };
