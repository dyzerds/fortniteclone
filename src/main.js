import * as THREE from 'three';
import { initPhysics, world } from './physics.js';
import { createTerrain, getHeight } from './world/terrain.js';
import { createSky, createComposer } from './world/sky.js';
import { Character, CameraRig, emptyInput } from './player/controller.js';
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

const qs = new URLSearchParams(location.search);
const player = new Character(scene, { outfit: qs.get('outfit') || 'comet', backbling: 'rocket' });
const [px, pz] = (qs.get('p') || '-60,140').split(',').map(Number);
player.teleport(px, getHeight(px, pz) + 1, pz);
const rig = new CameraRig(camera);
const inp = emptyInput();
inp.yaw = Number(qs.get('yaw') || 0); inp.pitch = Number(qs.get('pitch') || -0.15);
const demoEmote = qs.get('emote');
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
  inp.yaw -= mx * 0.0022 * settings.sens; inp.pitch = Math.max(-1.45, Math.min(1.45, inp.pitch - my * 0.0022 * settings.sens));
  acc += dt;
  while (acc >= STEP) {
    inp.mz = (input.down('forward') ? 1 : 0) - (input.down('back') ? 1 : 0);
    inp.mx = (input.down('right') ? 1 : 0) - (input.down('left') ? 1 : 0);
    inp.jump = input.pressed('jump'); inp.jumpHeld = input.down('jump');
    inp.sprint = input.down('sprint'); inp.crouchPressed = input.pressed('crouch');
    if (inp.crouchPressed) inp.crouch = !inp.crouch;
    inp.ads = input.codeDown('Mouse2');
    player.move(inp, STEP);
    world.step();
    input.endTick();
    acc -= STEP;
  }
  player.animate(dt, demoEmote);
  rig.update(player, dt, { ads: inp.ads });
  sky.update(dt, player.pos, camera.position);
  terrain.update(dt, t, camera.position);
  composer.render();
});
window.__ready = true;
window.__dbg = { player, inp, rig };
