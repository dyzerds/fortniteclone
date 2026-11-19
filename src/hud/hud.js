// In-match HUD (DOM + two canvases). Layout: compass top-center, minimap + stats top-right, kill feed left,
// shield/health bottom-left, materials / build pieces / item slots bottom-right.
import '@fontsource/lilita-one';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './hud.css';
import * as THREE from 'three';
import { WEAPONS, RARITIES, CONSUMABLES, POIS, WORLD, PLAYER, BUILD_COST } from '../config.js';
import { colors, heights } from '../world/terrain.js';
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
const _p = new THREE.Vector3();

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
  return c;
}

export function createHud(root, { onExit } = {}) {
  const el = document.createElement('div');
  el.className = 'hud';
  el.innerHTML = `
    <canvas class="compass" width="600" height="46"></canvas>
    <div class="mm"><canvas width="230" height="230"></canvas><div class="mm-name"></div></div>
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
    <div class="scope"></div>
    <div class="hitmark"></div>
    <div class="usebar"><span></span><div class="track"><i></i></div></div>
    <div class="prompt"></div>
    <div class="cmsg"></div>
    <div class="toast"></div>
    <div class="hurtdir"></div>
    <div class="lowhp"></div>
    <div class="dmg"></div>
    <div class="bigmap"><canvas width="760" height="760"></canvas><div class="bigmap-hint">M to close</div></div>
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
  let hitT = 0, toastT = 0, cmsgT = 0, hurtT = 0, mapOpen = false, lastPhase = -1, lastShrink = false;
  $('.res-btn').onclick = () => onExit?.();

  function keyLabels() {
    bps.forEach((b, i) => setText(b.querySelector('kbd'), keyLabel(settings.keys[PIECE_KEYS[i]])));
    slots.forEach((s, i) => setText(s.querySelector('kbd'), keyLabel(settings.keys[i ? `slot${i}` : 'pickaxe'])));
  }

  function centerMsg(text, t = 3) { setText($('.cmsg'), text); cmsgT = t; }
  function toast(html, t = 2.6) { $('.toast').innerHTML = html; toastT = t; }

  // ---- events from the match ----
  const api = {
    el,
    damage(point, n, info, camera) {
      if (!point || settings.damageNumbers === 'Off') return;
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
      document.exitPointerLock?.();
    },
    jumped() { centerMsg('', 0); },
    toggleMap() { mapOpen = !mapOpen; toggle(el, 'map-open', mapOpen); },
    reset() { el.classList.remove('show-results', 'won', 'map-open'); mapOpen = false; feed.innerHTML = ''; lastPhase = -1; keyLabels(); },
    show(on) { toggle(el, 'hidden', !on); },
  };

  // ---- per frame ----
  api.update = (dt, m, camera, rig) => {
    const p = m.player, h = p.hands, inv = h.inv, cur = inv.current;
    hitT -= dt; toastT -= dt; cmsgT -= dt; hurtT -= dt;
    toggle(hit, 'on', hitT > 0); toggle($('.toast'), 'on', toastT > 0); toggle($('.cmsg'), 'on', cmsgT > 0 || m.state === 'bus');
    setStyle($('.hurtdir'), 'opacity', String(Math.max(0, Math.min(1, hurtT))));
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
    if (m.state === 'bus') setText($('.cmsg'), m.bus.open ? `Press ${keyLabel(settings.keys.jump)} to jump` : 'Get ready to drop');

    // materials / builds / slots
    const building = h.mode !== 'combat';
    toggle(el, 'building', building);
    mats.forEach((d, i) => { const k = MAT_KEYS[i]; setText(d.querySelector('b'), inv.mats[k]); toggle(d, 'sel', building && h.mat === k); toggle(d, 'low', inv.mats[k] < BUILD_COST); });
    bps.forEach((d, i) => toggle(d, 'sel', building && h.piece === PIECE_KEYS[i]));
    slots.forEach((d, i) => {
      const it = i ? inv.slots[i - 1] : 'pick';
      const key = !it ? '' : it === 'pick' ? `pick:${p.cosmetics.pickaxe ?? 'pick'}` : it.kind === 'weapon' ? `w:${it.cls}:${it.rarity}:${wrapFor(p.cosmetics, it.cls)}` : `h:${it.id}`;
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
    const scoped = h.ads && cur?.cls === 'sniper';
    toggle(el, 'scoped', scoped);
    const gun = cur?.kind === 'weapon' && !building;
    const px = gun ? Math.max(4, Math.tan(h.spread) / Math.tan(camera.fov * Math.PI / 360) * innerHeight / 2) : 0;
    xh.dataset.mode = !p.alive || p.mode !== 'ground' ? 'none' : gun ? (cur.cls === 'shotgun' ? 'ring' : 'gun') : 'dot';
    setStyle(xh, '--s', `${px.toFixed(1)}px`);

    // interaction prompt
    const f = p.alive && p.mode === 'ground' ? m.loot.focus(p) : null;
    const pr = $('.prompt');
    toggle(pr, 'on', !!f);
    if (f) {
      const k = keyLabel(settings.keys.interact);
      const html = f.kind ? `<kbd>${k}</kbd> ${f.kind === 'chest' ? 'Open Chest' : 'Open Ammo Box'}` : `<kbd>${k}</kbd> Pick up <b style="color:${RARITIES[itemRarity(f.item)].color}">${itemName(f.item)}</b>${f.item.kind === 'heal' ? ` ×${f.item.count}` : ''}`;
      if (pr._h !== html) { pr._h = html; pr.innerHTML = html; }
    }

    drawCompass(p.yaw);
    drawMinimap(m);
    if (mapOpen) drawBigMap(m);
  };

  function drawCompass(yaw) {
    const g = compass, W = 600, H = 46, deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360;
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
    arrow(g, W / 2, W / 2, p.yaw, 8);
    const poi = POIS.find((q) => Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < q.r);
    setText($('.mm-name'), poi?.name ?? '');
  }

  function drawBigMap(m) {
    const g = big, W = 760, scale = W / WORLD.size, map = (x, z) => [(x + WORLD.size / 2) * scale, (z + WORLD.size / 2) * scale];
    g.drawImage(MAP, 0, 0, W, W);
    if (m.storm) stormOverlay(g, m.storm, -WORLD.size / 2, -WORLD.size / 2, scale, 0, 0, W, W);
    busLine(g, m, map);
    g.textAlign = 'center'; g.font = '20px "Lilita One"';
    for (const q of POIS) {
      const [x, y] = map(q.x, q.z);
      g.lineWidth = 4; g.strokeStyle = 'rgba(10,25,60,0.85)'; g.strokeText(q.name.toUpperCase(), x, y); g.fillStyle = '#fff'; g.fillText(q.name.toUpperCase(), x, y);
    }
    arrow(g, ...map(m.player.pos.x, m.player.pos.z), m.player.yaw, 10);
  }

  keyLabels();
  return api;
}
