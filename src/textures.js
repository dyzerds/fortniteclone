// Canvas-generated textures (build materials, POI styles, weapon wraps). Cached by key.
import * as THREE from 'three';
import { rng } from './util.js';
import { WRAPS } from './cosmetics.js';

const cache = new Map();
function canvasTex(key, size, draw, repeat = true) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, rng(key.length * 7919 + key.charCodeAt(0)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

const STYLES = {
  // player build materials
  wood: (g, s, r) => {
    const n = 6, h = s / n;
    for (let i = 0; i < n; i++) {
      const l = 52 + r() * 10;
      g.fillStyle = `hsl(${28 + r() * 6}, 70%, ${l}%)`; g.fillRect(0, i * h, s, h);
      g.fillStyle = 'rgba(120,60,20,0.25)';
      for (let k = 0; k < 6; k++) g.fillRect(r() * s, i * h + r() * h, 30 + r() * 80, 2);
      g.fillStyle = 'rgba(80,40,10,0.7)'; g.fillRect(0, i * h + h - 4, s, 4);
      g.fillStyle = 'rgba(255,220,160,0.35)'; g.fillRect(0, i * h, s, 3);
    }
    g.strokeStyle = 'rgba(60,30,8,0.85)'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
  },
  brick: (g, s, r) => {
    g.fillStyle = '#c9b9a8'; g.fillRect(0, 0, s, s);
    const rows = 8, h = s / rows;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * h;
      for (let x = -1; x < 4; x++) {
        g.fillStyle = `hsl(${12 + r() * 14}, ${40 + r() * 15}%, ${58 + r() * 10}%)`;
        g.fillRect(x * h * 2 + off + 3, y * h + 3, h * 2 - 6, h - 6);
      }
    }
    g.strokeStyle = 'rgba(70,40,30,0.7)'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
  },
  metal: (g, s) => {
    const grd = g.createLinearGradient(0, 0, s, 0);
    for (let i = 0; i <= 16; i++) grd.addColorStop(i / 16, i % 2 ? '#a9bdd2' : '#7f95ad');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(40,55,75,0.8)';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(24 + i * (s - 48) / 3, 24 + j * (s - 48) / 3, 7, 0, 7); g.fill(); }
    g.strokeStyle = 'rgba(30,40,60,0.9)'; g.lineWidth = 12; g.strokeRect(6, 6, s - 12, s - 12);
  },
  // POI house styles
  plasterPink: (g, s, r) => plaster(g, s, r, '#ffb3c7', '#f08aa8'),
  plasterYellow: (g, s, r) => plaster(g, s, r, '#ffe28a', '#f2c14e'),
  plasterBlue: (g, s, r) => plaster(g, s, r, '#9fdcff', '#6fb8ec'),
  plasterMint: (g, s, r) => plaster(g, s, r, '#aef0cf', '#73d6a6'),
  roofRed: (g, s) => shingles(g, s, '#e8483f', '#b8302a'),
  roofBlue: (g, s) => shingles(g, s, '#3f7fe8', '#2a56b8'),
  roofTeal: (g, s) => shingles(g, s, '#21b8a6', '#14877a'),
  floorTile: (g, s) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#e9dcc4' : '#cdb894'; g.fillRect(x * s / 4, y * s / 4, s / 4, s / 4); }
  },
  container: (g, s) => {
    g.fillStyle = '#e8562f'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 12; i++) g.fillRect(i * s / 12, 0, s / 24, s);
  },
};
function plaster(g, s, r, a, b) {
  g.fillStyle = a; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.12})`; g.fillRect(r() * s, r() * s, 6, 6); }
  g.fillStyle = b; g.fillRect(0, s - 26, s, 26);
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.fillRect(0, 0, s, 8);
}
function shingles(g, s, a, b) {
  g.fillStyle = b; g.fillRect(0, 0, s, s);
  const rows = 8, h = s / rows;
  for (let y = 0; y < rows; y++) for (let x = -1; x < 9; x++) {
    g.fillStyle = a; g.beginPath(); g.roundRect(x * h + (y % 2) * h / 2 + 2, y * h + 2, h - 4, h - 4, [0, 0, 12, 12]); g.fill();
  }
}

export const styleTexture = (style) => canvasTex(`style:${style}`, 256, STYLES[style]);

// weapon wraps
export function wrapTexture(id) {
  const w = WRAPS.find((x) => x.id === id);
  if (!w || id === 'none') return null;
  return canvasTex(`wrap:${id}`, 256, (g, s, r) => {
    const c = w.colors;
    if (id === 'sunset' || id === 'ice') {
      const grd = g.createLinearGradient(0, 0, s, s); c.forEach((col, i) => grd.addColorStop(i / (c.length - 1), col));
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
      if (id === 'ice') { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(r() * s, r() * s); g.lineTo(r() * s, r() * s); g.stroke(); } }
    } else if (id === 'stripes') {
      g.fillStyle = c[0]; g.fillRect(0, 0, s, s); g.fillStyle = c[1];
      for (let i = -s; i < s * 2; i += 48) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 24, 0); g.lineTo(i + 24 - s, s); g.lineTo(i - s, s); g.fill(); }
    } else if (id === 'camo') {
      g.fillStyle = c[0]; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 70; i++) { g.fillStyle = c[1 + (i % 3)]; g.beginPath(); g.ellipse(r() * s, r() * s, 10 + r() * 30, 6 + r() * 18, r() * 3, 0, 7); g.fill(); }
    } else if (id === 'galaxy') {
      const grd = g.createRadialGradient(s * 0.4, s * 0.5, 10, s / 2, s / 2, s * 0.8);
      grd.addColorStop(0, c[2]); grd.addColorStop(0.4, c[1]); grd.addColorStop(1, c[0]);
      g.fillStyle = grd; g.fillRect(0, 0, s, s);
      for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; g.fillRect(r() * s, r() * s, 1 + r() * 2.5, 1 + r() * 2.5); }
    } else if (id === 'lava') {
      g.fillStyle = c[0]; g.fillRect(0, 0, s, s);
      g.strokeStyle = c[1]; g.lineWidth = 6; g.shadowColor = c[2]; g.shadowBlur = 14;
      for (let i = 0; i < 16; i++) { g.beginPath(); let x = r() * s, y = r() * s; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 80; y += (r() - 0.5) * 80; g.lineTo(x, y); } g.stroke(); }
    }
  });
}

// soft round sprite for particles / glows
export const glowTexture = () => canvasTex('glow', 64, (g, s) => {
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.5)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
}, false);
