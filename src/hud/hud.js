// In-match HUD (DOM + two canvases). Layout: compass top-center, minimap + stats top-right, kill feed left,
// shield/health bottom-left, materials / build pieces / item slots bottom-right.
import '@fontsource/lilita-one';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './hud.css';
import * as THREE from 'three';
import { MATERIALS, WEAPONS, RARITIES, CONSUMABLES, POIS, WORLD, PLAYER, BUILD_COST, AMMO, MAT_CAP, MOVE } from '../config.js';
import { colors, heights, getHeight, paint } from '../world/terrain.js';
import { icon } from './icons.js';
import { itemName, itemRarity } from '../loot.js';
import { settings, keyLabel } from '../settings-store.js';
import { wrapFor } from '../cosmetics.js';

const SVG = {
  storm: '<svg viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-3a6 6 0 1 1-6-6V3z" fill="currentColor"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/></svg>',
  alive: '<svg viewBox="0 0 24 24"><circle cx="12" cy="7.5" r="4" fill="currentColor"/><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8z" fill="currentColor"/></svg>',
  kills: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2.6"/><path d="M12 1v6M12 17v6M1 12h6M17 12h6" stroke="currentColor" stroke-width="2.6"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z" fill="currentColor"/></svg>',
  health: '<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" fill="currentColor"/></svg>',
};
const MAT_KEYS = ['wood', 'brick', 'metal'], PIECE_KEYS = ['wall', 'floor', 'ramp', 'cone'];
const CLS_SHORT = { ar: 'Assault Rifle', shotgun: 'Pump Shotgun', smg: 'Rapid SMG', pistol: 'Sidearm', sniper: 'Bolt Sniper', pickaxe: 'Harvesting Tool', fall: 'Fall', storm: 'Storm' };
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _o = new THREE.Vector3();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PIN = '<svg viewBox="0 0 24 32"><path d="M12 1C6 1 2 5.4 2 11c0 7.5 10 20 10 20s10-12.5 10-20C22 5.4 18 1 12 1z"/><circle cx="12" cy="11" r="4"/></svg>';
// icon key of an inventory entry ('pick' = the harvesting tool)
const itemIcon = (it, p) => !it ? '' : it === 'pick' ? `pick:${p.cosmetics.pickaxe ?? 'pick'}` : it.kind === 'weapon' ? `w:${it.cls}:${it.rarity}:${wrapFor(p.cosmetics, it.cls)}` : `h:${it.id}`;

// cache-aware DOM setters
const setText = (el, v) => { v = String(v); if (el._t !== v) { el._t = v; el.textContent = v; } };
const setStyle = (el, k, v) => { if (el.style[k] !== v) el.style[k] = v; };
const toggle = (el, c, on) => { if (el.classList.contains(c) !== !!on) el.classList.toggle(c, !!on); };

function mapImage(size) {
  const N = WORLD.res, c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  const lin = (v) => Math.round(255 * Math.min(1, Math.pow(Math.max(0, v), 1 / 2.2)));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ix = Math.min(N - 2, Math.floor(x / size * (N - 1))), iz = Math.min(N - 2, Math.floor(y / size * (N - 1)));
    const i = iz * N + ix, h = heights[i];
    const o = (y * size + x) * 4;
    if (h < WORLD.waterLevel) {
      const d = Math.min(1, -h / 12);
      img.data[o] = 70 - d * 40; img.data[o + 1] = 200 - d * 70; img.data[o + 2] = 235 - d * 25;
    } else {
      const shade = 1 + Math.max(-0.35, Math.min(0.35, (heights[i] - heights[i + N + 1]) * 0.12));
      img.data[o] = lin(colors[i * 3] * shade); img.data[o + 1] = lin(colors[i * 3 + 1] * shade); img.data[o + 2] = lin(colors[i * 3 + 2] * shade);
    }
    img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.drawImage(paint, 0, 0, size, size); // roads, streets, fields
  return c;
}

export function createHud(root, { onExit, onSound } = {}) {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <div class="scope"><div class="lens"><svg viewBox="-100 -100 200 200">
      <path d="M-100 0H100M0 -100V100" stroke-width="0.45"/>
      <path d="M-100 0H-42M42 0H100M0 -100V-42" stroke-width="3.2"/>
      <path d="M-42 -2.6L-36 0L-42 2.6zM42 -2.6L36 0L42 2.6zM-2.6 -42L0 -36L2.6 -42z" stroke="none" fill="#05070c"/>
      <path d="M-5 9H5M-3 18H3M-5 27H5M-3 36H3M-5 45H5" stroke-width="0.6"/>
    </svg></div></div>
    <canvas class="compass" width="600" height="46"></canvas>
    <div class="mm"><canvas width="230" height="230"></canvas></div>
    <div class="stats">
      <span class="st st-storm">${SVG.storm}<b></b></span>
      <span class="st">${SVG.alive}<b class="v-alive"></b></span>
      <span class="st">${SVG.kills}<b class="v-kills"></b></span>
    </div>
    <div class="feed"></div>
    <div class="vitals">
      <div class="bar b-shield"><span class="ic">${SVG.shield}</span><div class="track"><i></i></div><b></b></div>
      <div class="bar b-health"><span class="ic">${SVG.health}</span><div class="track"><i></i></div><b></b></div>
    </div>
    <div class="kit">
      <div class="mats">${MAT_KEYS.map((m) => `<div class="mat" data-m="${m}"><img src="${icon(`m:${m}`)}"><b>0</b></div>`).join('')}</div>
      <div class="builds">${PIECE_KEYS.map((p) => `<div class="bp" data-p="${p}"><kbd></kbd><img src="${icon(`p:${p}`)}"></div>`).join('')}</div>
      <div class="ammo-line"><div class="wname"></div><div class="ammo"><b class="mag"></b><span class="res"></span></div></div>
      <div class="slots">${Array.from({ length: PLAYER.slots + 1 }, (_, i) => `<div class="slot" data-i="${i}"><kbd></kbd><img><b></b></div>`).join('')}</div>
    </div>
    <div class="xhair"><i></i><i></i><i></i><i></i><span class="dot"></span><span class="ring"></span></div>
    <div class="hitmark"></div>
    <div class="usebar"><span></span><div class="track"><i></i></div></div>
    <div class="prompt"></div>
    <div class="cmsg"></div>
    <div class="toast"></div>
    <div class="hurtdir"></div>
    <div class="lowhp"></div>
    <div class="dmg"></div>
    <div class="tbar"><div class="tb-track"><i></i></div><b></b></div>
    <div class="gain"><img class="gi"><b></b></div>
    <div class="wmark">${PIN}<b></b><i class="wc"></i></div>
    <div class="bigmap"><canvas width="760" height="760"></canvas><div class="bigmap-hint"></div></div>
    <div class="inv"></div>
    <div class="results"><div class="res-card"><div class="res-place"></div><div class="res-title"></div><div class="res-sub"></div>
      <div class="res-stats"></div><button class="res-btn">Return to Lobby</button></div></div>`;
  root.appendChild(el);
  const $ = (s) => el.querySelector(s);
  const $$ = (s) => [...el.querySelectorAll(s)];
  const compass = $('.compass').getContext('2d');
  const mm = $('.mm canvas').getContext('2d'), big = $('.bigmap canvas').getContext('2d');
  const MAP = mapImage(1024);
  const half = WORLD.size / 2, toMap = (v) => (v + half) / WORLD.size * MAP.width;
  const bars = { shield: $('.b-shield'), health: $('.b-health') };
  const slots = $$('.slot'), mats = $$('.mat'), bps = $$('.bp');
  const xh = $('.xhair'), hit = $('.hitmark'), dmgLayer = $('.dmg'), feed = $('.feed');
  let hitT = 0, toastT = 0, cmsgT = 0, hurtT = 0, lastPhase = -1, lastShrink = false;
  let pulseT = 0, drag = null;
  const tbar = $('.tbar'), gainEl = $('.gain');
  let tgtHit = null, gainMat = '', gainTot = 0, gainT = 9; // target health bar; material gain counter
  const view = { z: 1, cx: 0, cz: 0 }, tgt = { z: 1, cx: 0, cz: 0 }; // big map view (zoom, centre in meters): shown / target
  let panel = null, marker = null, M = null; // panel: 'map' | 'inv' | null ; marker: { x, y, z } ; M: the match, for panel clicks
  $('.res-btn').onclick = () => onExit?.();

  function keyLabels() {
    bps.forEach((b, i) => setText(b.querySelector('kbd'), keyLabel(settings.keys[PIECE_KEYS[i]])));
    slots.forEach((s, i) => setText(s.querySelector('kbd'), keyLabel(settings.keys[i ? `slot${i}` : 'pickaxe'])));
    $('.bigmap-hint').innerHTML = `Click: place marker · Drag: pan · Wheel: zoom · Right click: remove · <kbd>${keyLabel(settings.keys.map)}</kbd> close`;
  }

  function centerMsg(text, t = 3) { setText($('.cmsg'), text); cmsgT = t; }
  function toast(html, t = 2.6) { $('.toast').innerHTML = html; toastT = t; }

  // ---- events from the match ----
  const api = {
    el,
    damage(point, n, info, camera) {
      if (info.ref && point) tgtHit = { ref: info.ref, point: point.clone(), t: 2.5 };
      if (!point || settings.damageNumbers === 'Off' || info.pick) return;
      _p.copy(point).project(camera);
      if (_p.z > 1) return;
      const d = document.createElement('div');
      d.className = `dn${info.shield ? ' sh' : ''}${info.head ? ' hd' : ''}${info.struct ? ' st' : ''}${info.crit ? ' cr' : ''}`;
      d.textContent = n;
      d.style.left = `${(_p.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 30}px`;
      d.style.top = `${(-_p.y * 0.5 + 0.5) * innerHeight}px`;
      dmgLayer.appendChild(d);
      setTimeout(() => d.remove(), 900);
      if (!info.struct) { hitT = 0.18; toggle(hit, 'head', info.head); }
    },
    gain(mat, n) {
      gainTot = mat === gainMat && gainT < 2 ? gainTot + n : n;
      gainMat = mat; gainT = 0;
      gainEl.querySelector('.gi').src = icon('m:' + mat);
      const b = gainEl.querySelector('b'); setText(b, `+${gainTot}`);
      b.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], 150);
      const f = document.createElement('b'); f.className = 'gfly'; f.textContent = `+${n}`;
      gainEl.appendChild(f); setTimeout(() => f.remove(), 350);
    },
    hurt(attacker, player, yaw) {
      if (!attacker) return;
      const a = Math.atan2(-(attacker.pos.x - player.pos.x), -(attacker.pos.z - player.pos.z)) - yaw;
      setStyle($('.hurtdir'), 'transform', `translate(-50%, -50%) rotate(${-a}rad)`);
      hurtT = 1.2;
    },
    eliminated(t, by, cls, left, player) {
      const row = document.createElement('div');
      const who = (c) => (c === player ? '<em>You</em>' : c?.name ?? '');
      row.innerHTML = by && by !== t ? `${who(by)} <span>eliminated</span> ${who(t)} <small>${CLS_SHORT[cls] ?? ''}</small>` : `${who(t)} <span>${cls === 'storm' ? 'was lost to the storm' : 'fell too far'}</span>`;
      feed.prepend(row);
      setTimeout(() => row.classList.add('out'), 6000); setTimeout(() => row.remove(), 6600);
      while (feed.children.length > 6) feed.lastChild.remove();
      if (by === player && t !== player) toast(`<small>ELIMINATED</small>${t.name}`);
    },
    over(r) {
      $('.res-place').textContent = `#${r.place}`;
      $('.res-title').textContent = r.victory ? 'VICTORY!' : 'ELIMINATED';
      $('.res-sub').textContent = r.victory ? 'Last one standing on the island' : `You placed ${r.place} of ${r.total}`;
      $('.res-stats').innerHTML = `<div><b>${r.kills}</b>Eliminations</div><div><b>${r.place}</b>Placement</div><div><b>+${r.xp}</b>XP</div>`;
      el.classList.add('show-results'); toggle(el, 'won', r.victory);
      api.setPanel(null);
      document.exitPointerLock?.();
    },
    jumped() { centerMsg('', 0); },
    get panel() { return panel; },
    setPanel(p) { panel = p; toggle(el, 'map-open', p === 'map'); toggle(el, 'inv-open', p === 'inv'); invSel = null; invSig = '';
      if (p === 'map') { pulseT = 0; Object.assign(view, { z: 1, cx: 0, cz: 0 }); Object.assign(tgt, view); } },
    // place a marker at a world point (null clears it)
    mark(pt) {
      marker = pt ? { x: clamp(pt.x, -half, half), y: pt.y, z: clamp(pt.z, -half, half) } : null;
      onSound?.('click');
    },
    get marker() { return marker; },
    reset() { api.setPanel(null); el.classList.remove('show-results', 'won'); marker = null; feed.innerHTML = ''; lastPhase = -1; tgtHit = null; gainT = 9; keyLabels(); },
    show(on) { toggle(el, 'hidden', !on); },
  };

  // ---- per frame ----
  api.update = (dt, m, camera, rig) => {
    const p = m.player, h = p.hands, inv = h.inv, cur = inv.current;
    M = m;
    hitT -= dt; toastT -= dt; cmsgT -= dt; hurtT -= dt;
    toggle(hit, 'on', hitT > 0); toggle($('.toast'), 'on', toastT > 0); toggle($('.cmsg'), 'on', cmsgT > 0 || p.mode === 'bus');
    setStyle($('.hurtdir'), 'opacity', String(Math.max(0, Math.min(1, hurtT))));
    gainT += dt;
    setStyle(gainEl, 'opacity', String(gainT < 1.5 ? 1 : Math.max(0, 1 - (gainT - 1.5) / 0.3)));
    let tv = false;
    if (tgtHit) {
      const r = tgtHit.ref, max = r.maxHp ?? MATERIALS[r.mat]?.max ?? 1;
      tgtHit.t -= dt;
      if (tgtHit.t <= 0 || r.alive === false || r.dead) tgtHit = null;
      else {
        _p.copy(tgtHit.point); _p.y += 0.9; _p.project(camera);
        if (_p.z < 1) {
          tv = true;
          const f = Math.max(0, Math.min(1, r.hp / max));
          setStyle(tbar, 'transform', `translate(${((_p.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px, ${((-_p.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px) translate(-50%, -100%)`);
          setStyle(tbar, 'opacity', String(Math.min(1, tgtHit.t / 0.3)));
          const fill = tbar.querySelector('i');
          setStyle(fill, 'width', `${(f * 100).toFixed(0)}%`);
          toggle(fill, 'y', f <= 0.5 && f > 0.25); toggle(fill, 'r', f <= 0.25);
          setText(tbar.querySelector('b'), `${Math.ceil(r.hp)} / ${Math.round(max)}`);
        }
      }
    }
    toggle(tbar, 'on', tv);
    setStyle($('.lowhp'), 'opacity', String(p.alive ? Math.max(0, (35 - p.health) / 35) * 0.8 : 0));

    // vitals
    for (const k of ['shield', 'health']) {
      const v = Math.ceil(p[k]);
      setStyle(bars[k].querySelector('i'), 'width', `${v}%`);
      setText(bars[k].querySelector('b'), v);
    }
    // stats
    const s = m.storm;
    if (s) {
      setText($('.st-storm b'), fmtT(s.left));
      toggle($('.st-storm'), 'shrinking', s.shrinking);
      if (m.state === 'play' && (s.phase !== lastPhase || s.shrinking !== lastShrink)) {
        if (lastPhase >= 0 || s.shrinking) centerMsg(s.shrinking ? 'The storm is closing in!' : `Storm eye shrinks in ${fmtT(s.left)}`, 4);
        lastPhase = s.phase; lastShrink = s.shrinking;
      }
    }
    setText($('.v-alive'), m.alive); setText($('.v-kills'), p.kills);
    if (p.mode === 'bus') setText($('.cmsg'), m.bus.open ? `Press ${keyLabel(settings.keys.jump)} to jump` : 'Get ready to drop');

    // materials / builds / slots
    const building = h.mode !== 'combat';
    toggle(el, 'building', building);
    mats.forEach((d, i) => { const k = MAT_KEYS[i]; setText(d.querySelector('b'), inv.mats[k]); toggle(d, 'sel', building && h.mat === k); toggle(d, 'low', inv.mats[k] < BUILD_COST); });
    bps.forEach((d, i) => toggle(d, 'sel', building && h.piece === PIECE_KEYS[i]));
    slots.forEach((d, i) => {
      const it = i ? inv.slots[i - 1] : 'pick';
      const key = itemIcon(it, p);
      if (d._key !== key) {
        d._key = key;
        const img = d.querySelector('img');
        if (key) img.src = icon(key); else img.removeAttribute('src');
        d.dataset.r = it && it !== 'pick' ? itemRarity(it) : '';
      }
      setText(d.querySelector('b'), it?.kind === 'heal' ? it.count : it?.kind === 'weapon' ? inv.ammo[WEAPONS[it.cls].ammo] : '');
      toggle(d, 'sel', !building && inv.sel === i);
      toggle(d, 'empty', !it);
    });
    if (cur?.kind === 'weapon') {
      setText($('.mag'), cur.mag); setText($('.res'), ` / ${inv.ammo[WEAPONS[cur.cls].ammo]}`);
      setText($('.wname'), itemName(cur)); setStyle($('.wname'), 'color', RARITIES[cur.rarity].color);
    } else { setText($('.mag'), ''); setText($('.res'), ''); setText($('.wname'), cur ? itemName(cur) : building ? `${h.mat} · ${h.piece}` : ''); setStyle($('.wname'), 'color', ''); }

    // reload / heal progress
    const using = h.useT > 0 ? { t: h.useT, max: CONSUMABLES[cur?.id]?.time ?? 1, label: `Using ${itemName(cur)}` } : h.reloadT > 0 && cur?.kind === 'weapon' ? { t: h.reloadT, max: WEAPONS[cur.cls].reload[cur.rarity], label: 'Reloading' } : null;
    toggle($('.usebar'), 'on', !!using);
    if (using) { setText($('.usebar span'), `${using.label} ${using.t.toFixed(1)}`); setStyle($('.usebar i'), 'width', `${(1 - using.t / using.max) * 100}%`); }

    // crosshair
    const scoped = rig.scoped;
    toggle(el, 'scoped', scoped);
    const gun = cur?.kind === 'weapon' && !building;
    const px = gun ? Math.max(4, Math.tan(h.spread) / Math.tan(camera.fov * Math.PI / 360) * innerHeight / 2) : 0;
    xh.dataset.mode = !p.alive || p.mode !== 'ground' ? 'none' : gun ? (cur.cls === 'shotgun' ? 'ring' : 'gun') : 'dot';
    setStyle(xh, '--s', `${px.toFixed(1)}px`);

    // interaction prompt
    const f = p.alive && p.mode === 'ground' ? m.loot.focus(p) : null;
    const pr = $('.prompt');
    // in the air: open / close the glider (also mid-fall off a build, when there is room)
    const jk = keyLabel(settings.keys.jump);
    const sky = !p.alive ? '' : p.mode === 'skydive' ? `<kbd>${jk}</kbd> Deploy Glider` : p.mode === 'glide' ? (p.canClose ? `<kbd>${jk}</kbd> Free Fall` : '')
      : p.mode === 'ground' && !p.grounded && !p.swimming && p.airT > 0.2 && p.deployRoom() > MOVE.minDeploy ? `<kbd>${jk}</kbd> Deploy Glider` : '';
    toggle(pr, 'on', !!(f || sky));
    if (f || sky) {
      const k = keyLabel(settings.keys.interact);
      const html = sky || (f.kind ? `<kbd>${k}</kbd> ${f.kind === 'chest' ? 'Open Chest' : 'Open Ammo Box'}` : `<kbd>${k}</kbd> Pick up <b style="color:${RARITIES[itemRarity(f.item)].color}">${itemName(f.item)}</b>${f.item.kind === 'heal' ? ` ×${f.item.count}` : ''}`);
      if (pr._h !== html) { pr._h = html; pr.innerHTML = html; }
    }

    // world marker: pin over the spot with the distance; pinned to the screen edge (with a chevron) when off screen or behind
    const wm = $('.wmark');
    let wmOn = false;
    if (marker && !scoped && panel !== 'map') {
      const W = innerWidth, H = innerHeight;
      _p.set(marker.x, marker.y + 1.2, marker.z);
      _o.copy(_p).applyMatrix4(camera.matrixWorldInverse); // camera space: x right, y up, -z forward
      let x = 0, y = 0, on = false;
      if (_o.z < 0) { _p.project(camera); x = (_p.x * 0.5 + 0.5) * W; y = (-_p.y * 0.5 + 0.5) * H; on = x >= 24 && x <= W - 24 && y >= 48 && y <= H - 24; }
      let ang = 0;
      if (!on) {
        let dx = _o.x, dy = -_o.y;
        if (_o.z < 0) { dx = x - W / 2; dy = y - H / 2; }
        if (Math.hypot(dx, dy) < 1e-4) dy = 1;
        const t = Math.min(dx ? ((dx > 0 ? W - 52 : 52) - W / 2) / dx : Infinity, dy ? ((dy > 0 ? H - 40 : 90) - H / 2) / dy : Infinity);
        x = W / 2 + dx * t; y = H / 2 + dy * t; ang = Math.atan2(dx, -dy);
      }
      setStyle(wm, 'transform', on ? `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -100%)` : `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px) translate(-50%, -50%)`);
      setStyle(wm.querySelector('.wc'), 'transform', `rotate(${ang.toFixed(3)}rad) translateY(-34px)`);
      toggle(wm, 'off', !on);
      setText(wm.querySelector('b'), `${Math.round(Math.hypot(marker.x - p.pos.x, marker.z - p.pos.z))} m`);
      wmOn = true;
    }
    toggle(wm, 'on', wmOn);

    drawCompass(p);
    drawMinimap(m);
    if (panel === 'map') drawBigMap(m, dt);
    if (panel === 'inv') renderInv(m);
  };

  function drawCompass(p) {
    const g = compass, W = 600, H = 46, deg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
    g.clearRect(0, 0, W, H);
    const pxPerDeg = 4.2, names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    g.textAlign = 'center'; g.lineWidth = 2;
    for (let d = Math.ceil((deg - 72) / 15) * 15; d <= deg + 72; d += 15) {
      const x = W / 2 + (d - deg) * pxPerDeg, a = ((d % 360) + 360) % 360;
      const fade = 1 - Math.abs(x - W / 2) / (W / 2);
      g.globalAlpha = Math.max(0, fade) * 0.95;
      g.fillStyle = names[a] ? '#ffffff' : '#d9ecff';
      g.font = names[a] ? '22px "Lilita One"' : '14px "Lilita One"';
      g.shadowColor = 'rgba(0,20,60,0.8)'; g.shadowBlur = 4;
      g.fillText(names[a] ?? a, x, names[a] ? 26 : 24);
    }
    g.globalAlpha = 1; g.shadowBlur = 0;
    g.fillStyle = '#ffd84a'; g.font = '18px "Lilita One"'; g.fillText(Math.round(deg) % 360, W / 2, 44);
    g.beginPath(); g.moveTo(W / 2 - 6, 0); g.lineTo(W / 2 + 6, 0); g.lineTo(W / 2, 7); g.fill();
    if (marker) { // bearing to the marker (0 = north = -z, 90 = east = +x), pinned to the edge when outside the strip
      const b = Math.atan2(marker.x - p.pos.x, -(marker.z - p.pos.z)) * 180 / Math.PI;
      const rel = ((b - deg + 540) % 360) - 180;
      const px = W / 2 + clamp(rel, -68, 68) * pxPerDeg;
      pin(g, px, 22, 6);
      if (Math.abs(px - W / 2) >= 40) {
        g.textAlign = 'left'; g.font = '13px "Lilita One"'; g.fillStyle = '#ffd84a'; g.shadowColor = 'rgba(0,20,60,0.8)'; g.shadowBlur = 4;
        g.fillText(`${Math.round(Math.hypot(marker.x - p.pos.x, marker.z - p.pos.z))}m`, px + 10, 16); g.shadowBlur = 0;
      }
    }
  }

  // map pin with its tip at (x, y)
  function pin(g, x, y, s) {
    g.save(); g.translate(x, y);
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(-s * 0.3, -s * 0.7, -s, -s * 1.1, -s, -s * 1.8); g.arc(0, -s * 1.8, s, Math.PI, 0); g.bezierCurveTo(s, -s * 1.1, s * 0.3, -s * 0.7, 0, 0);
    g.fillStyle = '#ffd84a'; g.strokeStyle = '#1b2a4a'; g.lineWidth = 2; g.fill(); g.stroke();
    g.beginPath(); g.arc(0, -s * 1.8, s * 0.38, 0, Math.PI * 2); g.fillStyle = '#1b2a4a'; g.fill();
    g.restore();
  }

  function stormOverlay(g, s, sx, sz, scale, ox, oy, W, H) {
    const cx = ox + (s.x - sx) * scale, cy = oy + (s.z - sz) * scale;
    g.save();
    g.beginPath(); g.rect(0, 0, W, H); g.arc(cx, cy, Math.max(0, s.r * scale), 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(150, 60, 230, 0.45)'; g.fill('evenodd');
    if (s.next) {
      g.beginPath(); g.arc(ox + (s.next.x - sx) * scale, oy + (s.next.z - sz) * scale, Math.max(0, s.next.r * scale), 0, Math.PI * 2);
      g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
    }
    g.restore();
  }

  function arrow(g, x, y, yaw, size) {
    g.save(); g.translate(x, y); g.rotate(-yaw);
    g.beginPath(); g.moveTo(0, -size); g.lineTo(size * 0.7, size * 0.8); g.lineTo(0, size * 0.4); g.lineTo(-size * 0.7, size * 0.8); g.closePath();
    g.fillStyle = '#ffd84a'; g.strokeStyle = '#1b2a4a'; g.lineWidth = 2; g.fill(); g.stroke();
    g.restore();
  }

  function busLine(g, m, map) {
    const b = m.bus;
    if (m.state !== 'bus') return;
    g.save(); g.setLineDash([8, 6]); g.strokeStyle = '#ffffff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(...map(b.from.x, b.from.z)); g.lineTo(...map(b.to.x, b.to.z)); g.stroke(); g.restore();
  }

  function drawMinimap(m) {
    const g = mm, W = 230, p = m.player, view = 320, scale = W / view;
    const mpp = MAP.width / WORLD.size; // map px per meter
    g.clearRect(0, 0, W, W);
    g.drawImage(MAP, toMap(p.pos.x) - view / 2 * mpp, toMap(p.pos.z) - view / 2 * mpp, view * mpp, view * mpp, 0, 0, W, W);
    if (m.storm) stormOverlay(g, m.storm, p.pos.x, p.pos.z, scale, W / 2, W / 2, W, W);
    busLine(g, m, (x, z) => [W / 2 + (x - p.pos.x) * scale, W / 2 + (z - p.pos.z) * scale]);
    // town names sit on the map itself, like the big map
    g.textAlign = 'center'; g.font = '13px "Lilita One"'; g.lineWidth = 3; g.strokeStyle = 'rgba(10,25,60,0.85)'; g.fillStyle = '#fff';
    for (const q of POIS) {
      const t = q.name.toUpperCase(), hw = g.measureText(t).width / 2 + 3;
      const cx = W / 2 + (q.x - p.pos.x) * scale, y = W / 2 + (q.z - p.pos.z) * scale;
      if (cx < 0 || cx > W || y < 8 || y > W - 4) continue;
      const x = clamp(cx, hw, W - hw); // keep the whole name on the minimap
      g.strokeText(t, x, y); g.fillText(t, x, y);
    }
    if (marker) pin(g, clamp(W / 2 + (marker.x - p.pos.x) * scale, 8, W - 8), clamp(W / 2 + (marker.z - p.pos.z) * scale, 20, W - 2), 7);
    arrow(g, W / 2, W / 2, p.yaw, 8);
  }

  const BW = 760;
  // keep the view covering the whole map
  const clampView = (v) => { const lim = half * (1 - 1 / v.z); v.cx = clamp(v.cx, -lim, lim); v.cz = clamp(v.cz, -lim, lim); };
  const mapPt = (v, x, z) => { const s = BW / WORLD.size * v.z; return [BW / 2 + (x - v.cx) * s, BW / 2 + (z - v.cz) * s]; };

  function drawBigMap(m, dt) {
    const g = big, scale = BW / WORLD.size * view.z, map = (x, z) => mapPt(view, x, z);
    const k = 1 - Math.exp(-14 * dt);
    for (const a of ['z', 'cx', 'cz']) view[a] += (tgt[a] - view[a]) * k;
    pulseT += dt;
    const sw = MAP.width / view.z;
    g.drawImage(MAP, toMap(view.cx) - sw / 2, toMap(view.cz) - sw / 2, sw, sw, 0, 0, BW, BW);
    if (m.storm) stormOverlay(g, m.storm, view.cx, view.cz, scale, BW / 2, BW / 2, BW, BW);
    busLine(g, m, map);
    g.textAlign = 'center'; g.font = '20px "Lilita One"';
    for (const q of POIS) {
      const [x, y] = map(q.x, q.z);
      if (x < -80 || x > BW + 80 || y < -20 || y > BW + 20) continue;
      g.lineWidth = 4; g.strokeStyle = 'rgba(10,25,60,0.85)'; g.strokeText(q.name.toUpperCase(), x, y); g.fillStyle = '#fff'; g.fillText(q.name.toUpperCase(), x, y);
    }
    if (marker) {
      const [x, y] = map(marker.x, marker.z);
      pin(g, x, y, 11);
      const t = `${Math.round(Math.hypot(marker.x - m.player.pos.x, marker.z - m.player.pos.z))} m`;
      g.font = '16px "Lilita One"'; g.lineWidth = 4; g.strokeStyle = 'rgba(10,25,60,0.85)'; g.strokeText(t, x, y + 18); g.fillStyle = '#ffd84a'; g.fillText(t, x, y + 18);
    }
    let [ax, ay] = map(m.player.pos.x, m.player.pos.z);
    const out = ax < 18 || ax > BW - 18 || ay < 18 || ay > BW - 18;
    if (out) { ax = clamp(ax, 18, BW - 18); ay = clamp(ay, 18, BW - 18); }
    else for (let i = 0; i < 2; i++) { // arrival pulse: two expanding rings
      const t = (pulseT - i * 0.4) / 1.2;
      if (t < 0 || t > 1) continue;
      g.globalAlpha = 1 - t; g.strokeStyle = '#fff'; g.lineWidth = 3;
      g.beginPath(); g.arc(ax, ay, 10 + 30 * t, 0, Math.PI * 2); g.stroke();
    }
    g.globalAlpha = 1;
    arrow(g, ax, ay, m.player.yaw, 10);
  }

  // big map: wheel zooms at the cursor, left drag pans, left click places the marker (or removes it when clicked on), right click removes it
  const bigC = $('.bigmap canvas');
  const canvasXY = (e) => { const r = bigC.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * BW, (e.clientY - r.top) / r.height * BW, r.width / BW]; };
  bigC.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [px, py] = canvasXY(e), s0 = BW / WORLD.size * tgt.z;
    const wx = tgt.cx + (px - BW / 2) / s0, wz = tgt.cz + (py - BW / 2) / s0;
    tgt.z = clamp(tgt.z * Math.pow(1.25, e.deltaY < 0 ? 1 : -1), 1, 4);
    const s1 = BW / WORLD.size * tgt.z;
    tgt.cx = wx - (px - BW / 2) / s1; tgt.cz = wz - (py - BW / 2) / s1;
    clampView(tgt);
  }, { passive: false });
  bigC.addEventListener('mousedown', (e) => {
    if (e.button === 2) { if (marker) api.mark(null); }
    else if (e.button === 0) drag = { x: e.clientX, y: e.clientY, cx: tgt.cx, cz: tgt.cz, moved: false };
  });
  addEventListener('mousemove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5) { drag.moved = true; bigC.classList.add('drag'); }
    if (!drag.moved) return;
    const k = BW / bigC.getBoundingClientRect().width / (BW / WORLD.size * tgt.z);
    const nx = drag.cx - (e.clientX - drag.x) * k, nz = drag.cz - (e.clientY - drag.y) * k;
    view.cx += nx - tgt.cx; view.cz += nz - tgt.cz; tgt.cx = nx; tgt.cz = nz; // view follows 1:1 while dragging
    clampView(tgt); clampView(view);
  });
  addEventListener('mouseup', (e) => {
    if (!drag) return;
    const d = drag; drag = null; bigC.classList.remove('drag');
    if (d.moved || e.button !== 0 || panel !== 'map') return;
    const [px, py, css] = canvasXY(e), s = BW / WORLD.size * view.z;
    const x = view.cx + (px - BW / 2) / s, z = view.cz + (py - BW / 2) / s;
    const [mx, my] = marker ? mapPt(view, marker.x, marker.z) : [1e9, 1e9];
    if (Math.hypot(mx - px, my - py) * css < 14) api.mark(null);
    else api.mark({ x, y: Math.max(getHeight(x, z), WORLD.waterLevel), z });
  });

  // ---- inventory panel ----
  // invSel: { t: 'slot', i } (0 = harvesting tool) | { t: 'mat' | 'ammo', k }
  const invEl = $('.inv');
  let invSel = null, invSig = '', dragFrom = -1;
  const tile = (attrs, img, n, r, cls) => `<div class="it ${cls}" ${attrs} data-r="${r}">${img ? `<img draggable="false" src="${img}">` : ''}<b>${n}</b></div>`;
  const row = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;

  function invInfo(p, inv) {
    const s = invSel;
    if (s.t === 'slot') {
      const it = s.i ? inv.slots[s.i - 1] : 'pick', eq = inv.sel === s.i;
      const btns = `<button data-act="equip"${eq ? ' disabled' : ''}>${eq ? 'Equipped' : 'Equip'}</button>${s.i ? '<button data-act="drop">Drop</button>' : ''}`;
      if (it === 'pick') return { name: 'Harvesting Tool', r: 0, tag: 'Tool', img: icon(itemIcon(it, p)), desc: 'Swing at trees, rocks and buildings to gather materials.', stats: '', btns };
      if (it.kind === 'weapon') {
        const w = WEAPONS[it.cls], dmg = w.pellets ? `${w.dmg[it.rarity]} × ${w.pellets}` : w.dmg[it.rarity];
        return { name: itemName(it), r: it.rarity, tag: w.name, img: icon(itemIcon(it, p)), desc: w.scope ? 'Scoped. Hold aim to look through the scope.' : '',
          stats: row('Damage', dmg) + row('Headshot', `×${w.head}`) + row('Fire rate', `${w.rate}/s`) + row('Magazine', `${it.mag} / ${w.mag}`)
            + row('Reload', `${w.reload[it.rarity]} s`) + row('Ammo', `${AMMO[w.ammo].name} (${inv.ammo[w.ammo]})`), btns };
      }
      const c = CONSUMABLES[it.id];
      return { name: c.name, r: c.rarity, tag: 'Consumable', img: icon(itemIcon(it, p)),
        desc: c.heal ? `Restores ${c.heal} health, up to ${c.cap}.` : `Adds ${c.shield} shield, up to ${c.cap}.`,
        stats: row('Use time', `${c.time} s`) + row('Stack', `${it.count} / ${c.stack}`), btns };
    }
    const mat = s.t === 'mat', n = (mat ? inv.mats : inv.ammo)[s.k], step = mat ? 30 : AMMO[s.k].pickup;
    const btns = `<button data-act="drop"${n ? '' : ' disabled'}>Drop ${Math.min(step, n)}</button><button data-act="dropall"${n ? '' : ' disabled'}>Drop All</button>`;
    if (mat) return { name: s.k[0].toUpperCase() + s.k.slice(1), r: 0, tag: 'Material', img: icon(`m:${s.k}`),
      desc: { wood: 'Builds fast, weakest pieces.', brick: 'Middle ground between speed and strength.', metal: 'Builds slow, toughest pieces.' }[s.k],
      stats: row('Owned', `${n} / ${MAT_CAP}`) + row('Per piece', BUILD_COST), btns };
    const users = Object.values(WEAPONS).filter((w) => w.ammo === s.k).map((w) => w.name).join(', ');
    return { name: AMMO[s.k].name, r: 0, tag: 'Ammo', img: icon(`a:${s.k}`), desc: `Used by: ${users}.`, stats: row('Owned', `${n} / ${AMMO[s.k].cap}`), btns };
  }

  function renderInv(m) {
    const p = m.player, inv = p.hands.inv;
    if (!invSel || (invSel.t === 'slot' && invSel.i && !inv.slots[invSel.i - 1])) invSel = { t: 'slot', i: inv.sel };
    const sig = JSON.stringify([inv.slots, inv.ammo, inv.mats, inv.sel, invSel, p.alive]);
    if (sig === invSig) return;
    invSig = sig;
    const items = Array.from({ length: PLAYER.slots + 1 }, (_, i) => {
      const it = i ? inv.slots[i - 1] : 'pick', sel = invSel.t === 'slot' && invSel.i === i;
      const cls = `${sel ? 'sel' : ''}${inv.sel === i ? ' eq' : ''}${it ? '' : ' empty'}`;
      const n = it?.kind === 'heal' ? it.count : it?.kind === 'weapon' ? it.mag : '';
      return tile(`data-slot="${i}"${i && it ? ' draggable="true"' : ''}`, it ? icon(itemIcon(it, p)) : '', n, it && it !== 'pick' ? itemRarity(it) : '', cls);
    }).join('');
    const mats = MAT_KEYS.map((k) => tile(`data-mat="${k}"`, icon(`m:${k}`), inv.mats[k], '', invSel.k === k ? 'sel' : '')).join('');
    const ammo = Object.keys(AMMO).map((k) => tile(`data-ammo="${k}"`, icon(`a:${k}`), inv.ammo[k], '', invSel.k === k ? 'sel' : '')).join('');
    const f = invInfo(p, inv);
    invEl.innerHTML = `<div class="inv-card">
      <div class="inv-main"><h2>Inventory</h2>
        <div class="inv-sec">Weapons &amp; Items</div><div class="inv-row">${items}</div>
        <div class="inv-sec">Materials</div><div class="inv-row">${mats}</div>
        <div class="inv-sec">Ammo</div><div class="inv-row">${ammo}</div>
        <div class="inv-hint">Drag items to reorder · drag off the panel to drop · <kbd>${keyLabel(settings.keys.inventory)}</kbd> or <kbd>ESC</kbd> close</div></div>
      <div class="inv-info" data-r="${f.r}"><div class="inv-tag">${RARITIES[f.r].name} · ${f.tag}</div><div class="inv-name">${f.name}</div>
        <img class="inv-big" draggable="false" src="${f.img}"><p>${f.desc}</p><dl>${f.stats}</dl><div class="inv-btns">${p.alive ? f.btns : ''}</div></div></div>`;
  }

  function invAct(act) {
    const p = M.player, h = p.hands, inv = h.inv, s = invSel;
    if (!p.alive || !s) return;
    const at = new THREE.Vector3(p.pos.x - Math.sin(p.yaw) * 1.3, p.pos.y + 0.6, p.pos.z - Math.cos(p.yaw) * 1.3);
    const drop = (e) => { M.loot.drop(e, at, 0.5).keep = p; onSound?.('click'); }; // keep: the dropper doesn't vacuum it straight back up
    if (s.t === 'slot') {
      if (act === 'equip') { h.cancel(); inv.select(s.i); h.setMode('combat'); onSound?.('click'); }
      else if (act === 'drop' && s.i && inv.slots[s.i - 1]) { if (inv.sel === s.i) h.cancel(); drop({ item: inv.removeSlot(s.i - 1) }); invSel = null; }
    } else {
      const pool = s.t === 'mat' ? inv.mats : inv.ammo;
      const n = act === 'dropall' ? pool[s.k] : Math.min(pool[s.k], s.t === 'mat' ? 30 : AMMO[s.k].pickup);
      if (n > 0) { pool[s.k] -= n; drop(s.t === 'mat' ? { mat: s.k, n } : { ammo: s.k, n }); }
    }
    invSig = '';
  }

  // swap two item slots (1..5); the selection follows the item it was on
  function invSwap(a, b) {
    const h = M.player.hands, inv = h.inv, sl = inv.slots;
    [sl[a - 1], sl[b - 1]] = [sl[b - 1], sl[a - 1]];
    if (inv.sel === a) inv.sel = b; else if (inv.sel === b) inv.sel = a;
    if (inv.sel && !inv.current) inv.sel = 0;
    invSel = { t: 'slot', i: b };
    invSig = ''; onSound?.('click');
  }

  invEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-slot],[data-mat],[data-ammo],[data-act]');
    if (!t || !M) return;
    if (t.dataset.act) { invAct(t.dataset.act); return; }
    const i = Number(t.dataset.slot);
    if (t.dataset.slot != null) { if (i && !M.player.hands.inv.slots[i - 1]) return; invSel = { t: 'slot', i }; }
    else if (t.dataset.mat) invSel = { t: 'mat', k: t.dataset.mat };
    else invSel = { t: 'ammo', k: t.dataset.ammo };
    invSig = ''; onSound?.('hover');
  });
  invEl.addEventListener('dblclick', (e) => { if (e.target.closest('[data-slot]') && invSel?.t === 'slot') invAct('equip'); });
  invEl.addEventListener('dragstart', (e) => {
    const t = e.target.closest('[data-slot]');
    dragFrom = t ? Number(t.dataset.slot) : -1;
    if (dragFrom > 0) { e.dataTransfer.setData('text/plain', String(dragFrom)); e.dataTransfer.effectAllowed = 'move'; }
    else e.preventDefault();
  });
  // allow dropping on another item slot (swap) or anywhere off the card (drop on the ground)
  invEl.addEventListener('dragover', (e) => {
    const t = e.target.closest('[data-slot]');
    if (dragFrom > 0 && (t ? Number(t.dataset.slot) > 0 : !e.target.closest('.inv-card'))) e.preventDefault();
  });
  invEl.addEventListener('drop', (e) => {
    e.preventDefault();
    const t = e.target.closest('[data-slot]'), to = t ? Number(t.dataset.slot) : -1;
    if (dragFrom > 0 && to > 0 && to !== dragFrom) invSwap(dragFrom, to);
    else if (dragFrom > 0 && !t && !e.target.closest('.inv-card')) { invSel = { t: 'slot', i: dragFrom }; invAct('drop'); }
    dragFrom = -1;
  });
  invEl.addEventListener('dragend', () => { dragFrom = -1; });

  keyLabels();
  return api;
}
