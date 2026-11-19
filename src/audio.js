import { settings } from './settings-store.js';

const MAX_VOICES = 24;
const MIN_GAP = 0.025;

// Pan in -0.8..0.8: source bearing relative to the view direction of yaw
export function panFor(l, yaw, s) {
  const dx = s.x - l.x, dz = s.z - l.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return 0;
  const p = ((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / len) * 0.8;
  return Math.max(-0.8, Math.min(0.8, p));
}

// Sound table: each entry builds one voice. v.tone/v.noise schedule sources at offset `at` seconds.
const SOUNDS = {
  shot_ar: (v) => { v.noise('bandpass', 1400, 0.8, 0.9, 0.12); v.tone('sine', 140, 60, 0.08, 0.6, 0.12); },
  shot_smg: (v) => { v.noise('bandpass', 2000, 0.8, 0.6, 0.07); v.tone('sine', 180, 80, 0.08, 0.6, 0.07); },
  shot_pistol: (v) => { v.noise('bandpass', 1800, 0.8, 0.8, 0.1); v.tone('square', 300, 120, 0.05, 0.15, 0.1); },
  shot_shotgun: (v) => { v.noise('lowpass', 2500, 0.7, 1.0, 0.3); v.tone('sine', 90, 40, 0.18, 0.9, 0.3); },
  shot_sniper: (v) => {
    v.noise('highpass', 900, 0.7, 1.0, 0.06);
    v.noise('lowpass', 900, 0.7, 0.5, 0.6);
    v.tone('sine', 70, 35, 0.3, 0.9, 0.6);
  },
  empty: (v) => { v.tone('square', 1800, 1800, 0, 0.2, 0.012); v.tone('square', 1800, 1800, 0, 0.2, 0.012, 0.06); },
  reload: (v) => {
    for (const t of [0, 0.18, 0.42]) v.noise('bandpass', 3000, 4, 0.35, 0.025, t);
    v.tone('square', 600, 600, 0, 0.1, 0.03, 0.42);
  },
  build: (v) => { v.tone('triangle', 220, 110, 0.09, 0.5, 0.12); v.noise('lowpass', 1200, 0.7, 0.4, 0.08); },
  edit: (v) => v.tone('sine', 900, 1200, 0.05, 0.2, 0.07),
  harvest: (v) => { v.tone('triangle', 320, 160, 0.06, 0.45, 0.1); v.noise('bandpass', 1600, 1.5, 0.35, 0.06); },
  crit: (v) => { SOUNDS.harvest(v); v.tone('sine', 1320, 1320, 0, 0.25, 0.25); },
  hit: (v) => v.tone('square', 2400, 2400, 0, 0.12, 0.03),
  headshot: (v) => { v.tone('sine', 1760, 1760, 0, 0.25, 0.18); v.tone('sine', 2640, 2640, 0, 0.12, 0.12); },
  hurt: (v) => { v.noise('lowpass', 600, 0.7, 0.5, 0.15); v.tone('sine', 110, 70, 0.15, 0.4, 0.15); },
  chest: (v) => [880, 1108, 1318, 1760, 2217].forEach((f, i) => v.tone('sine', f, f, 0, 0.18, 0.25, i * 0.12)),
  pickup: (v) => { v.tone('sine', 660, 660, 0, 0.25, 0.1); v.tone('sine', 990, 990, 0, 0.25, 0.1, 0.06); },
  heal: (v) => v.tone('sine', 440, 880, 0.4, 0.2, 0.45),
  use: (v) => v.noise('bandpass', 1200, 0.7, 0.18, 0.25, 0, 0.05),
  jump: (v) => v.tone('sine', 260, 420, 0.08, 0.12, 0.1),
  land: (v) => v.noise('lowpass', 400, 0.7, 0.35, 0.1),
  eliminated: (v) => {
    v.lowpass(2000);
    [523, 392, 262].forEach((f, i) => v.tone('square', f, f, 0, 0.12, 0.12, i * 0.1));
  },
  victory: (v) => [523, 659, 784, 1047].forEach((f, i) => v.tone('sine', f, f, 0, 0.22, i === 3 ? 0.6 : 0.12, i * 0.1)),
  click: (v) => v.tone('sine', 1200, 1200, 0, 0.2, 0.05),
  hover: (v) => v.tone('sine', 1800, 1800, 0, 0.06, 0.03),
};
const UI = new Set(['click', 'hover']);

export function createAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const resume = () => { ctx.resume(); };
  window.addEventListener('pointerdown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const buses = { sfx: ctx.createGain(), ui: ctx.createGain() };
  buses.sfx.connect(master);
  buses.ui.connect(master);

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

  let voices = 0;
  let listener = { x: 0, y: 0, z: 0 }, yaw = 0;
  const last = {};

  // Gain envelope: attack to peak, exponential decay (never to 0) over `decay` s from start
  function env(t, peak, decay, attack) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(decay, attack + 0.001));
    return g;
  }

  function play(name, pos = null) {
    const make = SOUNDS[name];
    if (!make || ctx.state !== 'running' || voices >= MAX_VOICES) return;
    const now = ctx.currentTime;
    if (now - (last[name] ?? -1) < MIN_GAP) return;

    let gain = 1, pan = 0;
    if (pos) {
      const d = Math.hypot(pos.x - listener.x, pos.y - listener.y, pos.z - listener.z);
      gain = (1 - Math.min(1, d / (name.startsWith('shot_') ? 180 : 60))) ** 2;
      if (gain < 0.01) return;
      pan = panFor(listener, yaw, pos);
    }
    last[name] = now;
    buses.sfx.gain.value = settings.sfx;
    buses.ui.gain.value = settings.ui;
    master.gain.value = settings.master;

    const nodes = [];
    const out = ctx.createGain();
    out.gain.value = gain;
    let tail = out;
    if (pos) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(UI.has(name) ? buses.ui : buses.sfx);
    nodes.push(out);

    let dest = out, longest = null, longestEnd = 0;
    const start = (src, g, t, end) => {
      src.connect(g);
      g.connect(dest);
      src.start(t);
      src.stop(end + 0.02);
      nodes.push(src, g);
      if (end >= longestEnd) { longestEnd = end; longest = src; }
    };

    const v = {
      lowpass(freq) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = freq;
        f.connect(out);
        nodes.push(f);
        dest = f;
      },
      tone(type, f0, f1, glideT, peak, decay, at = 0, attack = 0.002) {
        const t = now + at, o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glideT);
        start(o, env(t, peak, decay, attack), t, t + decay);
      },
      noise(filterType, freq, q, peak, decay, at = 0, attack = 0.002) {
        const t = now + at, s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
        s.buffer = noiseBuf;
        f.type = filterType;
        f.frequency.value = freq;
        f.Q.value = q;
        s.connect(f);
        nodes.push(f);
        // random offset <= 0.3 s so offset + duration (<= 0.65 s) stays inside the 1 s buffer
        const g = env(t, peak, decay, attack);
        f.connect(g);
        g.connect(dest);
        s.start(t, Math.random() * 0.3);
        s.stop(t + decay + 0.02);
        nodes.push(s, g);
        if (t + decay >= longestEnd) { longestEnd = t + decay; longest = s; }
      },
    };
    make(v);

    voices++;
    longest.onended = () => {
      voices--;
      for (const n of nodes) n.disconnect();
    };
  }

  return {
    play,
    listen(pos, y) { listener = pos; yaw = y; },
  };
}

if (typeof window === 'undefined') {
  import('node:assert').then(({ default: assert }) => {
    const o = { x: 0, y: 0, z: 0 };
    assert.ok(Math.abs(panFor(o, 0, { x: 0, y: 0, z: -10 })) < 1e-9);
    assert.ok(Math.abs(panFor(o, 0, { x: 10, y: 0, z: 0 }) - 0.8) < 1e-9);
    assert.ok(Math.abs(panFor(o, 0, { x: -10, y: 0, z: 0 }) + 0.8) < 1e-9);
    console.log('audio pan ok');
  });
}
