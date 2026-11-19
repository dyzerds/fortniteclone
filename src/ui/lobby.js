// Menu shell: top bar, lobby, pause, plus routing to the locker and settings screens.
// Screens: lobby | locker | settings | match | pause. The lobby draws the live island behind the UI.
import * as THREE from 'three';
import './ui.css'; // fonts come in with the HUD
import { Avatar } from '../player/avatar.js';
import { getHeight, props } from '../world/terrain.js';
import { SUN_DIR } from '../world/sky.js';
import { WORLD, POIS } from '../config.js';
import { settings, applySettings } from '../settings-store.js';
import { icon } from '../hud/icons.js';
import { createSettings, optRow, stepValue, schemaById } from './settings.js';
import { createLocker } from './locker.js';

// ---- profile (level / XP / career stats) ----
const PKEY = 'storm-royale.profile.v1', LEVEL_XP = 1000;
const profile = (() => { try { return { xp: 0, wins: 0, kills: 0, matches: 0, ...JSON.parse(localStorage.getItem(PKEY) || '{}') }; } catch { return { xp: 0, wins: 0, kills: 0, matches: 0 }; } })();
export function recordMatch(r) {
  profile.xp += r.xp; profile.kills += r.kills; profile.matches++; if (r.victory) profile.wins++;
  try { localStorage.setItem(PKEY, JSON.stringify(profile)); } catch { /* ignore */ }
}

const BRAND = '<svg class="brand-mark" viewBox="0 0 32 32"><path d="M16 2 4 8v8c0 7 5 12 12 14 7-2 12-7 12-14V8z" fill="#ffd21f" stroke="#0b2470" stroke-width="2.5"/><path d="M18 7l-7 10h5l-2 8 7-11h-5z" fill="#0b2470"/></svg>';
const STAR = '<svg class="lvl-star" viewBox="0 0 24 24"><path fill="currentColor" d="m12 2 3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8l-6.3 3.6 1.5-7.1L1.8 9.4 9 8.6Z"/></svg>';
const GEAR = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 5-.1-3 2-1.6-2-3.4-2.4.8a8 8 0 0 0-2.6-1.5L14.8 2h-4l-.6 2.6a8 8 0 0 0-2.6 1.5L5.2 5.3l-2 3.4 2 1.7-.1 1.6.1 1.6-2 1.7 2 3.4 2.4-.8a8 8 0 0 0 2.6 1.5l.5 2.6h4l.6-2.6a8 8 0 0 0 2.6-1.5l2.4.8 2-3.4Z"/></svg>';

// lobby stage: camera sits sunward of the avatar (front-lit) and looks back across the island.
// Pick the spot with flat ground between camera and avatar, no wall right behind, clear of trees and towns.
function findStage() {
  const u = new THREE.Vector3(SUN_DIR.x, 0, SUN_DIR.z).normalize(), Y = new THREE.Vector3(0, 1, 0);
  const H = (v) => getHeight(v.x, v.z);
  let best = null;
  for (let a = -0.8; a <= 0.8; a += 0.05) {
    const dir = u.clone().applyAxisAngle(Y, a);
    for (let k = 120; k < WORLD.islandRadius; k += 3) {
      const at = dir.clone().multiplyScalar(k), cam = at.clone().addScaledVector(u, 4.8), back = at.clone().addScaledVector(u, -14);
      const ha = H(at);
      if (ha < 2 || H(cam) < 1.5) continue;
      if (POIS.some((p) => Math.hypot(at.x - p.x, at.z - p.z) < p.r + 15)) continue;
      if (props.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 7 || Math.hypot(p.x - cam.x, p.z - cam.z) < 4)) continue;
      const score = Math.abs(H(cam) - ha) * 2 + Math.max(0, H(back) - ha - 1) - ha * 0.03;
      if (!best || score < best.score) best = { score, at, cam };
    }
  }
  const { at, cam } = best;
  at.y = H(at); cam.y = at.y + 1.25;
  return { at, cam, look: at.clone().add(new THREE.Vector3(0, 1.0, 0)) };
}

function pedestal() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.05, 0.22, 40), new THREE.MeshStandardMaterial({ color: '#dfe7f2', roughness: 0.35, metalness: 0.2 }));
  base.position.y = 0.11; base.receiveShadow = true; g.add(base);
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.85, 40), new THREE.MeshBasicMaterial({ color: '#9ff3ff' }));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.225; g.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.035, 8, 48), new THREE.MeshBasicMaterial({ color: '#4fd8ff' }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.2; g.add(ring);
  return g;
}

export function createUi({ renderer, scene, camera, sky, terrain, composer, loadout, audio, onPlay, onResume, onLeave, onLoadout }) {
  const root = document.createElement('div');
  root.className = 'ui';
  root.innerHTML = `<nav class="topbar"><div class="brand">${BRAND}<span>STORM ROYALE</span></div>
      <div class="tabs"><button class="tab" data-go="lobby">PLAY</button><button class="tab" data-go="locker">LOCKER</button></div>
      <div class="top-right"><div class="lvl-chip">${STAR}<b class="lvl-n">1</b></div><button class="icon-btn" data-go="settings" title="Settings">${GEAR}</button></div></nav>
    <section class="scr scr-lobby">
      <div class="season"><div class="kicker">STORM ROYALE</div><div class="headline"></div>
        <div class="xp"><div class="xp-row"><span class="xp-l"></span><span class="xp-r"></span></div><div class="xp-bar"><i></i></div></div>
        <div class="lobby-stats"></div></div>
      <div class="nametag"><b>YOU</b><span>Ready</span></div>
      <div class="play-col">
        <div class="mode-card"><img class="mode-art" alt=""><div class="mode-name">SOLO</div><div class="mode-sub"></div></div>
        <button class="mode-change">CHANGE</button>
        <div class="mode-pop" hidden></div>
        <button class="play-btn">PLAY!</button>
      </div>
      <div class="bottombar"><span class="hint"><kbd>B</kbd>EMOTE</span><span class="hint"><kbd>ENTER</kbd>PLAY</span></div>
    </section>
    <section class="scr scr-pause" hidden><div class="pause-card"><div class="pause-title">PAUSED</div>
      <button class="menu-btn primary" data-act="resume">RESUME</button>
      <button class="menu-btn" data-act="settings">SETTINGS</button>
      <button class="menu-btn danger" data-act="leave">LEAVE MATCH</button></div></section>`;
  document.body.appendChild(root);
  const $ = (q) => root.querySelector(q);
  const lobbyEl = $('.scr-lobby'), pauseEl = $('.scr-pause'), topbar = $('.topbar');

  // shared menu avatar: stands on the lobby pedestal, borrowed by the locker preview
  const avatar = new Avatar(loadout.outfit, loadout.backbling);
  const stage = findStage(), ped = pedestal();
  ped.position.copy(stage.at); ped.visible = false; scene.add(ped);
  const faceCam = Math.atan2(stage.cam.x - stage.at.x, stage.cam.z - stage.at.z);

  const locker = createLocker(root, { renderer, avatar, loadout, onChange: (l) => { onLoadout(l); refresh(); }, onClose: () => show('lobby') });
  let settingsBack = 'lobby';
  const settingsUi = createSettings(root, { onClose: () => show(settingsBack) });

  let screen = '', emote = -1;
  function show(s) {
    if (s === 'settings') { settingsBack = screen === 'pause' ? 'pause' : 'lobby'; settingsUi.open(); }
    screen = s;
    const menu = s === 'lobby' || s === 'locker';
    topbar.hidden = !menu;
    lobbyEl.hidden = s !== 'lobby'; pauseEl.hidden = s !== 'pause';
    settingsUi.el.hidden = s !== 'settings'; if (s !== 'locker') locker.el.hidden = true;
    root.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.go === s));
    ped.visible = s === 'lobby';
    terrain.setGrass(s === 'lobby' ? 'Off' : settings.grass); // blades would poke through the pedestal
    if (s === 'locker') locker.open();
    if (s === 'lobby') {
      scene.add(avatar.root);
      avatar.root.position.copy(stage.at).y += 0.22; avatar.root.rotation.y = faceCam;
      avatar.setOutfit(loadout.outfit, loadout.backbling); avatar.play('idle'); emote = -1;
      $('.mode-pop').hidden = true;
      refresh();
    } else if (s !== 'locker') avatar.root.removeFromParent();
  }

  function refresh() {
    const lv = 1 + Math.floor(profile.xp / LEVEL_XP), into = profile.xp % LEVEL_XP;
    $('.lvl-n').textContent = lv;
    $('.headline').textContent = `LEVEL ${lv}`;
    $('.xp-l').textContent = `LVL ${lv}`;
    $('.xp-r').innerHTML = `<b>${(LEVEL_XP - into).toLocaleString()}</b> XP to LVL ${lv + 1}`;
    $('.xp-bar i').style.width = `${into / LEVEL_XP * 100}%`;
    $('.lobby-stats').innerHTML = [['Wins', profile.wins], ['Eliminations', profile.kills], ['Matches', profile.matches]].map(([k, v]) => `<div class="ls"><span>${k.toUpperCase()}</span><b>${v}</b></div>`).join('');
    $('.mode-art').src = icon(`o:${loadout.outfit}`);
    $('.mode-sub').textContent = `${settings.bots} BOTS · ${settings.difficulty.toUpperCase()}`;
    $('.mode-pop').innerHTML = ['bots', 'difficulty'].map((id) => optRow(schemaById[id], settings[id])).join('');
  }

  // ---- input ----
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button, .tile, .seg');
    if (b) audio.play('click');
    if (!b || b.tagName !== 'BUTTON') return;
    if (b.dataset.go) show(b.dataset.go);
    else if (b.classList.contains('play-btn')) onPlay();
    else if (b.classList.contains('mode-change')) $('.mode-pop').hidden = !$('.mode-pop').hidden;
    else if (b.classList.contains('arr')) {
      const id = b.closest('.opt').dataset.id;
      applySettings({ ...settings, [id]: stepValue(schemaById[id], settings[id], Number(b.dataset.d)) });
      refresh();
    } else if (b.dataset.act === 'resume') onResume();
    else if (b.dataset.act === 'settings') show('settings');
    else if (b.dataset.act === 'leave') onLeave();
  });
  pauseEl.addEventListener('click', (e) => { if (e.target === pauseEl) onResume(); });
  addEventListener('keydown', (e) => {
    if (screen !== 'lobby' || e.repeat) return;
    if (e.code === 'Enter') onPlay();
    else if (e.code === settings.keys.emote) { emote = (emote + 1) % (loadout.emotes.length + 1); avatar.play(emote < loadout.emotes.length ? `emote_${loadout.emotes[emote]}` : 'idle', 0.25); }
  });

  // ---- per-frame drawing for menu screens (match screens are drawn by main) ----
  function frame(dt, t) {
    if (screen === 'locker') { locker.frame(dt); return; }
    if (screen !== 'lobby') return;
    avatar.update(dt);
    camera.position.copy(stage.cam); camera.lookAt(stage.look);
    if (camera.fov !== 40) { camera.fov = 40; camera.updateProjectionMatrix(); }
    sky.update(dt, stage.at, camera.position);
    terrain.update(dt, t, camera.position);
    composer.render();
  }

  return { show, frame, get screen() { return screen; }, refresh };
}
