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
  // ---- town walls. A wall texture spans one 5 x 3.75 m wall piece: canvas x = along the wall, y = top to bottom.
  sidingWhite: (g, s, r) => siding(g, s, r, '#f4f1ea', '#d9d3c6'),
  sidingBlue: (g, s, r) => siding(g, s, r, '#8fc3ec', '#6a9fd0'),
  sidingYellow: (g, s, r) => siding(g, s, r, '#ffdc7a', '#e8b84c'),
  sidingMint: (g, s, r) => siding(g, s, r, '#a6e3c4', '#78c3a0'),
  sidingPink: (g, s, r) => siding(g, s, r, '#f7b2c4', '#dd8aa2'),
  sidingSage: (g, s, r) => siding(g, s, r, '#b9c98f', '#94a86a'),
  sidingDrift: (g, s, r) => siding(g, s, r, '#9fb0b8', '#7c8c95', true),
  brickRed: (g, s, r) => bricks(g, s, r, 12, '#c9b8a6', [8, 14], [48, 58], [44, 54]),
  brickTan: (g, s, r) => bricks(g, s, r, 12, '#dad0bf', [28, 36], [40, 52], [62, 72]),
  stuccoWhite: (g, s, r) => stucco(g, s, r, '#f6f1e6', '#d8cdb8'),
  stuccoPeach: (g, s, r) => stucco(g, s, r, '#f6c49a', '#d99a6c'),
  shopfront: (g, s, r) => {
    bricks(g, s, r, 12, '#c9b8a6', [8, 14], [48, 58], [44, 54]);
    const hue = Math.floor(r() * 6);
    const band = ['#2f7fe0', '#e0453a', '#2fae6e', '#f2a516', '#8a52d9', '#1fa3a3'][hue];
    g.fillStyle = band; g.fillRect(0, 0, s, s * 0.3);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(0, s * 0.3 - 8, s, 8);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, 0, s, 6);
    g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) g.fillRect(s * 0.2 + i * s * 0.22, s * 0.1, s * 0.14, s * 0.08);
  },
  logWall: (g, s, r) => {
    const rows = 9, h = s / rows;
    for (let y = 0; y < rows; y++) {
      const gr = g.createLinearGradient(0, y * h, 0, y * h + h);
      const l = 34 + r() * 8;
      gr.addColorStop(0, `hsl(26,45%,${l - 12}%)`); gr.addColorStop(0.35, `hsl(28,48%,${l + 6}%)`); gr.addColorStop(1, `hsl(24,45%,${l - 16}%)`);
      g.fillStyle = gr; g.fillRect(0, y * h, s, h);
      g.fillStyle = 'rgba(40,20,8,0.35)'; for (let k = 0; k < 5; k++) g.fillRect(r() * s, y * h + h * (0.3 + r() * 0.4), 20 + r() * 50, 1.5);
    }
  },
  barnRed: (g, s, r) => {
    const n = 10, w = s / n;
    for (let i = 0; i < n; i++) { g.fillStyle = `hsl(${2 + r() * 5},${58 + r() * 8}%,${38 + r() * 6}%)`; g.fillRect(i * w, 0, w, s); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(i * w, 0, 2, s); }
    g.fillStyle = '#f3efe6'; g.fillRect(0, 0, s, 10); g.fillRect(0, s - 14, s, 14);
  },
  stone: (g, s, r) => {
    g.fillStyle = '#7d7a74'; g.fillRect(0, 0, s, s);
    const rows = 6, h = s / rows;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 5;) {
      const w = h * (1.1 + r() * 0.9), off = (y % 2) * h * 0.6;
      g.fillStyle = `hsl(${30 + r() * 20},${6 + r() * 6}%,${54 + r() * 14}%)`;
      g.beginPath(); g.roundRect(x * h * 1.5 + off + 3, y * h + 3, w - 6, h - 6, 8); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x * h * 1.5 + off + 6, y * h + 5, w - 14, 4);
      x += w / (h * 1.5);
    }
  },
  metalShed: (g, s, r) => ribs(g, s, r, '#8da3b5', '#6f8597', 16, true),
  containerRed: (g, s, r) => container(g, s, r, '#d9472f'),
  containerBlue: (g, s, r) => container(g, s, r, '#2f6fd0'),
  containerGreen: (g, s, r) => container(g, s, r, '#3a9a4a'),
  containerYellow: (g, s, r) => container(g, s, r, '#e8b21e'),
  trailer: (g, s, r) => {
    ribs(g, s, r, '#f1ede3', '#d6d0c2', 18, false);
    g.fillStyle = '#2f9ad0'; g.fillRect(0, s * 0.42, s, s * 0.08); g.fillStyle = '#e0453a'; g.fillRect(0, s * 0.52, s, s * 0.04);
  },
  // ---- roofs: shingle rows run along the ridge; the bottom eighth is the gable-end trim
  roofRed: (g, s, r) => shingles(g, s, r, '#d9473c', '#9e2e27'),
  roofBlue: (g, s, r) => shingles(g, s, r, '#3a72d6', '#25499c'),
  roofTeal: (g, s, r) => shingles(g, s, r, '#22a796', '#137566'),
  roofBrown: (g, s, r) => shingles(g, s, r, '#8a5a3a', '#5e3a22'),
  roofGreen: (g, s, r) => shingles(g, s, r, '#4f9a45', '#2f6a2c'),
  roofGrey: (g, s, r) => shingles(g, s, r, '#6f7784', '#474e5a'),
  roofSnow: (g, s, r) => {
    shingles(g, s, r, '#7a5238', '#4e3322');
    const gr = g.createLinearGradient(0, 0, 0, s * 0.875); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#dfeaf8');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(s, 0);
    for (let x = s; x >= 0; x -= 16) g.lineTo(x, s * 0.7 + Math.sin(x * 0.09) * 10 + r() * 8);
    g.fill();
  },
  roofTin: (g, s, r) => { ribs(g, s, r, '#a9b4bd', '#7f8b96', 20, false); trim(g, s, '#e9e4d8'); },
  roofTar: (g, s, r) => { g.fillStyle = '#5b5f66'; g.fillRect(0, 0, s, s); speck(g, s, r, 900, ['#6b7078', '#4c5057', '#7a7e85']); },
  // ---- floors (top-down)
  floorWood: (g, s, r) => {
    const n = 8, w = s / n;
    for (let i = 0; i < n; i++) { g.fillStyle = `hsl(${28 + r() * 6},${45 + r() * 10}%,${50 + r() * 8}%)`; g.fillRect(0, i * w, s, w); g.fillStyle = 'rgba(70,35,10,0.45)'; g.fillRect(0, i * w, s, 2); g.fillRect(r() * s, i * w, 2, w); }
  },
  floorTile: (g, s) => {
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? '#ece3d2' : '#c9b998'; g.fillRect(x * s / 4, y * s / 4, s / 4, s / 4); }
  },
  floorConcrete: (g, s, r) => { g.fillStyle = '#b5b1a8'; g.fillRect(0, 0, s, s); speck(g, s, r, 500, ['#a39f96', '#c4c0b7']); g.strokeStyle = 'rgba(60,60,60,0.3)'; g.lineWidth = 3; g.strokeRect(1, 1, s - 2, s - 2); },
  stoneFloor: (g, s, r) => { g.fillStyle = '#6f6b64'; g.fillRect(0, 0, s, s); for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { g.fillStyle = `hsl(35,${6 + r() * 6}%,${52 + r() * 12}%)`; g.beginPath(); g.roundRect(x * s / 3 + 4, y * s / 3 + 4, s / 3 - 8, s / 3 - 8, 10); g.fill(); } },
};

const shade = (hex, f) => `rgb(${[1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))).join(',')})`;
function speck(g, s, r, n, cols) { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3); } }
// clapboard siding: overlapping boards lit from above, skirting band at the bottom
function siding(g, s, r, a, b, weathered = false) {
  g.fillStyle = a; g.fillRect(0, 0, s, s);
  const rows = 12, h = (s - 22) / rows;
  for (let y = 0; y < rows; y++) {
    const gr = g.createLinearGradient(0, y * h, 0, y * h + h);
    gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.7, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)');
    g.fillStyle = gr; g.fillRect(0, y * h, s, h);
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y * h + h - 2, s, 2);
    if (weathered) for (let k = 0; k < 4; k++) { g.fillStyle = `rgba(60,70,80,${0.15 + r() * 0.2})`; g.fillRect(r() * s, y * h + 2, 10 + r() * 60, h - 5); }
  }
  for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.08})`; g.fillRect(r() * s, r() * s, 6, 2); }
  g.fillStyle = b; g.fillRect(0, s - 22, s, 22);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, s - 22, s, 3);
}
function bricks(g, s, r, rows, mortar, hue, sat, lit) {
  g.fillStyle = mortar; g.fillRect(0, 0, s, s);
  const h = s / rows, w = h * 2.2;
  for (let y = 0; y < rows; y++) for (let x = -1; x < s / w + 1; x++) {
    g.fillStyle = `hsl(${hue[0] + r() * (hue[1] - hue[0])},${sat[0] + r() * (sat[1] - sat[0])}%,${lit[0] + r() * (lit[1] - lit[0])}%)`;
    g.fillRect(x * w + (y % 2) * w / 2 + 2, y * h + 2, w - 4, h - 4);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x * w + (y % 2) * w / 2 + 2, y * h + 2, w - 4, 2);
  }
}
function stucco(g, s, r, a, b) {
  g.fillStyle = a; g.fillRect(0, 0, s, s);
  speck(g, s, r, 700, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.1)']);
  g.fillStyle = b; g.fillRect(0, s - 20, s, 20); g.fillRect(0, 0, s, 8);
}
function ribs(g, s, r, a, b, n, vertical) {
  const gr = vertical ? g.createLinearGradient(0, 0, s, 0) : g.createLinearGradient(0, 0, 0, s);
  for (let i = 0; i <= n * 2; i++) gr.addColorStop(i / (n * 2), i % 2 ? a : b);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  speck(g, s, r, 150, ['rgba(120,70,40,0.12)', 'rgba(255,255,255,0.1)']);
}
function container(g, s, r, col) {
  g.fillStyle = col; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(i * s / 14, 0, s / 28, s); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(i * s / 14 + s / 28, 0, 3, s); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, s, 12); g.fillRect(0, s - 12, s, 12);
  speck(g, s, r, 120, ['rgba(110,60,30,0.25)']);
}
function trim(g, s, col) { g.fillStyle = col; g.fillRect(0, s * 0.875, s, s * 0.125); }
function shingles(g, s, r, a, b) {
  g.fillStyle = b; g.fillRect(0, 0, s, s);
  const rows = 9, h = s * 0.875 / rows, w = h * 1.1;
  for (let y = 0; y < rows; y++) for (let x = -1; x < s / w + 1; x++) {
    g.fillStyle = shade(a, 0.9 + r() * 0.2);
    g.beginPath(); g.roundRect(x * w + (y % 2) * w / 2 + 1.5, y * h + 1, w - 3, h - 2, [0, 0, 9, 9]); g.fill();
  }
  trim(g, s, '#f2ece0');
}

// trims drawn around the holes of window / door wall variants ('style+w', 'style+d')
const TRIM = { logWall: '#5a3a22', barnRed: '#f3efe6', stone: '#5c5852', metalShed: '#5d6b78', trailer: '#9aa3ab', sidingWhite: '#5b6f86', brickRed: '#efe6d6', brickTan: '#7a5a3a' };
const SHUTTER = ['#2f5d8a', '#3a7a4a', '#8a3a3a', '#5b4a7a', '#2f6f6f'];
function windowTrim(g, s, base, r) {
  const t = TRIM[base] ?? '#fbf7ee', a = s / 3, pad = 9;
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(a - pad + 3, a - pad + 3, a + pad * 2, a + pad * 2);
  g.fillStyle = t; g.fillRect(a - pad, a - pad, a + pad * 2, a + pad * 2);
  g.fillRect(a - pad - 6, 2 * a + pad - 2, a + pad * 2 + 12, 10); // sill
  if (base.startsWith('siding') || base.startsWith('stucco')) {
    g.fillStyle = SHUTTER[Math.floor(r() * SHUTTER.length)];
    for (const x of [a - pad - 30, 2 * a + pad + 4]) { g.fillRect(x, a - pad + 2, 26, a + pad * 2 - 4); g.fillStyle = 'rgba(0,0,0,0.2)'; for (let k = 0; k < 6; k++) g.fillRect(x + 3, a - pad + 8 + k * 13, 20, 3); g.fillStyle = SHUTTER[Math.floor(r() * SHUTTER.length)]; }
  }
}
function doorTrim(g, s, base) {
  const t = TRIM[base] ?? '#fbf7ee', a = s / 3, pad = 10;
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(a - pad + 3, a - pad + 3, a + pad * 2, 2 * a + pad);
  g.fillStyle = t; g.fillRect(a - pad, a - pad, a + pad * 2, 2 * a + pad);
  g.fillStyle = '#ffd77a'; g.beginPath(); g.arc(2 * a + pad + 14, a + 6, 7, 0, 7); g.fill(); // porch light
}

export const styleTexture = (style) => {
  const [base, v] = style.split('+');
  return canvasTex(`style:${style}`, 256, (g, s, r) => {
    STYLES[base](g, s, r);
    if (v === 'w') windowTrim(g, s, base, r);
    if (v === 'd') doorTrim(g, s, base);
  });
};

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
