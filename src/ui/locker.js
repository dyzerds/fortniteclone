// Locker: Character / Emotes / Wraps. Everything is driven by the catalog in cosmetics.js.
import * as THREE from 'three';
import { CATALOG, WRAP_SLOTS, saveLoadout, wrapFor } from '../cosmetics.js';
import { RARITIES, WEAPONS } from '../config.js';
import { pickaxeModel, gliderModel, weaponModel } from '../models.js';
import { icon } from '../hud/icons.js';

const CAT_ICON = {
  character: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 12c5 0 8 2.5 8 5v3H4v-3c0-2.5 3-5 8-5Z"/></svg>',
  emotes: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M14 2a2.2 2.2 0 1 1 0 4.4A2.2 2.2 0 0 1 14 2Zm-3.5 5.5 4.3.6 3.4 3.3-1.4 1.4-2.6-2.4-1.3 3.4 2.6 2.7v5.5h-2v-4.6l-2.6-2.4-1.7 3.4-4.4 1.4-.6-1.9 3.6-1.2 2.2-5.6-1.8.6-1.6 2.9-1.8-1Z"/></svg>',
  wraps: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M5 4a3 3 0 0 0-3 3v11a2 2 0 0 0 4 0V8h16l-2 5 2 5H8V8H6V7a1 1 0 0 1 2 0v1h0V7a3 3 0 0 0-3-3Z"/></svg>',
};
const CATS = [['character', 'Character'], ['emotes', 'Emotes'], ['wraps', 'Wraps']];
const SLOT_NAME = { outfit: 'Outfit', backbling: 'Back Bling', pickaxe: 'Pickaxe', glider: 'Glider' };
const WRAP_NAME = (s) => (s === 'all' ? 'All Weapons' : WEAPONS[s].name);
const USE_ALL = { id: '', name: 'Same as All Weapons', rarity: 0, desc: 'Uses the wrap picked for all weapons.' };
const D = Math.PI / 180;

export function createLocker(root, { renderer, avatar, loadout, onChange, onClose }) {
  const el = document.createElement('section');
  el.className = 'scr scr-locker'; el.hidden = true;
  el.innerHTML = `<div class="lk-side">${CATS.map(([id, n]) => `<button class="lk-cat" data-cat="${id}" title="${n}">${CAT_ICON[id]}</button>`).join('')}</div>
    <div class="lk-main"><div class="lk-kicker">Your Loadout</div><div class="lk-title"></div><div class="lk-rule"></div>
      <div class="lk-slots"></div><svg class="wheel" viewBox="-200 -200 400 400"></svg>
      <div class="lk-pick"><div class="lk-pick-head"></div><div class="lk-grid"></div></div></div>
    <div class="lk-info"><div class="lk-type"></div><div class="lk-name"></div><div class="lk-desc"></div></div>
    <div class="lk-foot"><button class="pill" data-act="back"><kbd>ESC</kbd>BACK</button></div>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  let cat = 'character', slot = 'outfit', hover = null;

  // ---- loadout access for the active slot ----
  const type = () => (cat === 'character' ? slot : cat === 'emotes' ? 'emote' : 'wrap');
  const equipped = () => (cat === 'character' ? loadout[slot] : cat === 'emotes' ? loadout.emotes[slot] : loadout.wraps[slot]);
  const items = () => (cat === 'wraps' && slot !== 'all' ? [USE_ALL, ...CATALOG.wrap] : CATALOG[type()]);
  const find = (t, id) => (t === 'wrap' && id === '' ? USE_ALL : CATALOG[t].find((i) => i.id === id) ?? CATALOG[t][0]);
  function iconFor(t, id) {
    if (t === 'outfit') return icon(`o:${id}`);
    if (t === 'backbling') return id === 'none' ? null : icon(`bb:${id}:${loadout.outfit}`);
    if (t === 'pickaxe') return icon(`pick:${id}`);
    if (t === 'glider') return icon(`g:${id}`);
    if (t === 'emote') return icon(`e:${id}`);
    return id ? icon(`wr:${id}`) : null;
  }
  const tile = (rar, img, attrs, cls = '', cap = '', none = 'NONE') => `<button class="tile r${rar}${cls}" ${attrs}>${img ? `<img src="${img}" alt="">` : `<span class="tile-none">${none}</span>`}${cap ? `<span class="tile-cap">${cap}</span>` : ''}</button>`;

  function equip(id) {
    if (cat === 'character') loadout[slot] = id;
    else if (cat === 'emotes') { const e = loadout.emotes, j = e.indexOf(id); if (j >= 0) e[j] = e[slot]; e[slot] = id; }
    else loadout.wraps[slot] = id;
    saveLoadout(loadout); onChange(loadout); render();
  }

  // ---- markup ----
  function wheel() {
    const R = 195, r = 98, h = 28 * D, p = (rad, a) => `${(rad * Math.cos(a)).toFixed(1)} ${(rad * Math.sin(a)).toFixed(1)}`;
    return loadout.emotes.map((id, i) => {
      const c = (-90 + i * 60) * D;
      return `<path class="seg${i === slot ? ' on' : ''}" data-slot="${i}" d="M${p(R, c - h)} A${R} ${R} 0 0 1 ${p(R, c + h)} L${p(r, c + h)} A${r} ${r} 0 0 0 ${p(r, c - h)}Z"/>
        <image href="${icon(`e:${id}`)}" x="${(146 * Math.cos(c) - 42).toFixed(1)}" y="${(146 * Math.sin(c) - 42).toFixed(1)}" width="84" height="84"/>`;
    }).join('') + `<circle class="hub" r="78"/><text class="hub-n">${slot + 1}</text>`;
  }

  function render() {
    el.querySelectorAll('.lk-cat').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
    $('.lk-title').textContent = CATS.find(([c]) => c === cat)[1];
    $('.lk-main').className = `lk-main ${cat}`;
    const slots = $('.lk-slots'), wh = $('.wheel');
    slots.hidden = cat === 'emotes'; wh.style.display = cat === 'emotes' ? '' : 'none';
    if (cat === 'character') slots.innerHTML = Object.keys(SLOT_NAME).map((s) => { const it = find(s, loadout[s]); return tile(it.rarity, iconFor(s, it.id), `data-slot="${s}" title="${SLOT_NAME[s]}"`, s === slot ? ' on' : '', SLOT_NAME[s].toUpperCase()); }).join('');
    else if (cat === 'wraps') slots.innerHTML = WRAP_SLOTS.map((s) => { const it = find('wrap', loadout.wraps[s] ?? ''); return tile(it.rarity, icon(`w:${s === 'all' ? 'ar' : s}:2:${wrapFor(loadout, s)}`), `data-slot="${s}" title="${WRAP_NAME(s)}"`, s === slot ? ' on' : '', WRAP_NAME(s).toUpperCase()); }).join('');
    else wh.innerHTML = wheel();
    const t = type(), eq = equipped();
    $('.lk-pick-head').textContent = `Choose ${cat === 'character' ? SLOT_NAME[slot] : cat === 'emotes' ? `emote for slot ${slot + 1}` : `wrap: ${WRAP_NAME(slot)}`}`;
    $('.lk-grid').innerHTML = items().map((it) => tile(it.rarity, iconFor(t, it.id), `data-item="${it.id}" title="${it.name}"`, it.id === eq ? ' eq on' : '', '', it.id === '' ? 'ALL' : 'NONE')).join('');
    info();
  }

  function info() {
    const t = type(), it = find(t, hover ?? equipped());
    const label = cat === 'character' ? SLOT_NAME[slot] : cat === 'emotes' ? 'Emote' : `Wrap · ${WRAP_NAME(slot)}`;
    $('.lk-type').innerHTML = `<span class="rar r${it.rarity}">${RARITIES[it.rarity].name}</span><span>${label}</span>`;
    $('.lk-name').textContent = it.name;
    $('.lk-desc').textContent = it.desc ?? '';
  }

  // ---- input ----
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat],[data-slot],[data-item],[data-act]');
    if (!b) return;
    if (b.dataset.cat) { cat = b.dataset.cat; slot = { character: 'outfit', emotes: 0, wraps: 'all' }[cat]; hover = null; render(); }
    else if (b.dataset.slot !== undefined) { slot = cat === 'emotes' ? Number(b.dataset.slot) : b.dataset.slot; hover = null; render(); }
    else if (b.dataset.item !== undefined) { hover = null; equip(b.dataset.item); }
    else close();
  });
  const grid = $('.lk-grid');
  grid.addEventListener('mouseover', (e) => { const b = e.target.closest('[data-item]'); if (b && b.dataset.item !== hover) { hover = b.dataset.item; info(); } });
  grid.addEventListener('mouseleave', () => { hover = null; info(); });
  addEventListener('keydown', (e) => { if (!el.hidden && e.code === 'Escape') close(); });
  function close() { el.hidden = true; avatar.play('idle'); onClose(); }

  // ---- 3D preview (own scene, drawn straight to the screen) ----
  const scene = new THREE.Scene();
  const bg = document.createElement('canvas'); bg.width = bg.height = 512;
  const g = bg.getContext('2d'), grd = g.createRadialGradient(360, 230, 20, 300, 260, 420);
  grd.addColorStop(0, '#3fb0ff'); grd.addColorStop(0.45, '#1c6fe6'); grd.addColorStop(1, '#0a2f9c');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  scene.background = new THREE.CanvasTexture(bg); scene.background.colorSpace = THREE.SRGBColorSpace;
  scene.add(new THREE.HemisphereLight('#e6f3ff', '#2a4a9a', 1.7));
  const key = new THREE.DirectionalLight('#ffffff', 2.4); key.position.set(2, 3, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#7fe0ff', 2.2); rim.position.set(-3, 2, -3); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 1.0, 6.3); cam.lookAt(0, 0.98, 0);
  const stand = new THREE.Group(); scene.add(stand);
  const models = new Map();
  let shown = null, shownKey = '';

  function fit(obj, size) {
    const g = new THREE.Group(); g.add(obj);
    const box = new THREE.Box3().setFromObject(obj), s = box.getSize(new THREE.Vector3());
    obj.position.sub(box.getCenter(new THREE.Vector3()));
    g.scale.setScalar(size / Math.max(s.x, s.y, s.z)); g.position.y = 1.0;
    return g;
  }
  function target() {
    const t = type(), id = hover ?? equipped();
    if (t === 'pickaxe') return [`pick:${id}`, () => fit(pickaxeModel(id), 1.5)];
    if (t === 'glider') return [`g:${id}`, () => { const m = fit(gliderModel(id), 2.4); m.rotation.x = 0.5; return m; }];
    if (t === 'wrap') { const cls = slot === 'all' ? 'ar' : slot, w = id === '' ? loadout.wraps.all : id; return [`w:${cls}:${w}`, () => fit(weaponModel(cls, 2, w), 1.4)]; }
    return ['avatar', () => avatar.root];
  }
  let outfitShown = '';
  function frame(dt) {
    const [k, make] = target();
    if (k !== shownKey) {
      if (shown) stand.remove(shown);
      if (!models.has(k)) models.set(k, make());
      shown = models.get(k); shownKey = k; stand.add(shown);
      stand.rotation.y = 0;
    }
    if (k === 'avatar') {
      const t = type(), id = hover ?? equipped();
      const o = t === 'outfit' ? id : loadout.outfit, bb = t === 'backbling' ? id : loadout.backbling;
      if (`${o}:${bb}` !== outfitShown) { avatar.setOutfit(o, bb); outfitShown = `${o}:${bb}`; }
      avatar.play(cat === 'emotes' ? `emote_${id}` : 'idle', 0.25);
      avatar.root.position.set(0, 0, 0);
      avatar.root.rotation.y = THREE.MathUtils.damp(avatar.root.rotation.y, t === 'backbling' ? Math.PI * 0.8 : -0.25, 6, dt);
      avatar.update(dt);
    } else stand.rotation.y += dt * 0.7;
    const w = innerWidth, h = innerHeight;
    if (cam.aspect !== w / h) { cam.aspect = w / h; cam.setViewOffset(w, h, -w * 0.24, 0, w, h); }
    renderer.render(scene, cam);
  }

  return {
    el, frame,
    open() { el.hidden = false; hover = null; outfitShown = ''; shownKey = ''; stand.clear(); shown = null; render(); },
  };
}
