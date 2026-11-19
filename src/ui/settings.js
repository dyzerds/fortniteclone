// Settings screen, rendered from SCHEMA (settings-store.js) plus a Keybinds tab. Edits go to a draft until Apply.
import { SCHEMA, KEY_ACTIONS, DEFAULTS, PRESETS, settings, applySettings, keyLabel } from '../settings-store.js';

const ICON = {
  game: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 5-.1-3 2-1.6-2-3.4-2.4.8a8 8 0 0 0-2.6-1.5L14.8 2h-4l-.6 2.6a8 8 0 0 0-2.6 1.5L5.2 5.3l-2 3.4 2 1.7-.1 1.6.1 1.6-2 1.7 2 3.4 2.4-.8a8 8 0 0 0 2.6 1.5l.5 2.6h4l.6-2.6a8 8 0 0 0 2.6-1.5l2.4.8 2-3.4Z"/></svg>',
  video: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm1 2v9h16V6Z"/></svg>',
  audio: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M4 9h4l5-4v14l-5-4H4Zm12.5-1.5a6 6 0 0 1 0 9l-1.4-1.4a4 4 0 0 0 0-6.2Zm2.8-2.8a10 10 0 0 1 0 14.6l-1.4-1.4a8 8 0 0 0 0-11.8Z"/></svg>',
  keys: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 6h20v12H2Zm2 2v2h2V8Zm4 0v2h2V8Zm4 0v2h2V8Zm4 0v2h4V8ZM4 12v2h2v-2Zm4 0v2h2v-2Zm4 0v2h2v-2Zm4 0v2h4v-2ZM7 15v1h10v-1Z"/></svg>',
};
const TABS = [['game', 'Game'], ['video', 'Video'], ['audio', 'Audio'], ['keys', 'Keybinds']];
const byId = Object.fromEntries(SCHEMA.map((s) => [s.id, s]));

// ---- shared row helpers (also used by the lobby mode popover) ----
export function stepValue(s, v, d) {
  if (s.type === 'choice') { const n = s.options.length; return s.options[(s.options.indexOf(String(v)) + d + n) % n]; }
  const x = Math.min(s.max, Math.max(s.min, v + d * s.step));
  return Math.round(x / s.step) * s.step;
}
export function fmtValue(s, v) {
  if (s.type === 'choice') return v;
  if (s.step >= 1) return String(Math.round(v));
  if (s.max <= 1) return `${Math.round(v * 100)}%`;
  return v.toFixed(2);
}
function segs(s, v) {
  if (s.type === 'choice') return s.options.map((o) => `<i${o === String(v) ? ' class="on"' : ''}></i>`).join('');
  const lit = Math.round((v - s.min) / (s.max - s.min) * 10);
  return Array.from({ length: 10 }, (_, i) => `<i${i < lit ? ' class="on"' : ''}></i>`).join('');
}
export const optRow = (s, v, sel = false) => `<div class="opt${sel ? ' sel' : ''}" data-id="${s.id}"><span class="opt-label">${s.label}</span>
  <div class="opt-ctl"><button class="arr" data-d="-1"></button><div class="opt-val"><span>${fmtValue(s, v)}</span><div class="seg">${segs(s, v)}</div></div><button class="arr" data-d="1"></button></div></div>`;
export { byId as schemaById };

export function createSettings(root, { onClose }) {
  const el = document.createElement('section');
  el.className = 'scr scr-settings'; el.hidden = true;
  el.innerHTML = `<header class="set-top"><div class="set-title">SETTINGS</div>
      <div class="set-tabs">${TABS.map(([id, name]) => `<button class="set-tab" data-tab="${id}">${ICON[id]}<span>${name.toUpperCase()}</span></button>`).join('')}</div></header>
    <div class="set-body"><div class="set-list"></div><aside class="set-desc"><h2></h2><p></p><ul class="set-choices"></ul></aside></div>
    <footer class="set-foot"><span class="set-dirty" hidden>Unsaved changes</span>
      <button class="foot-btn" data-act="apply"><kbd>ENTER</kbd>APPLY</button>
      <button class="foot-btn" data-act="reset"><kbd>DEL</kbd>RESET</button>
      <button class="foot-btn" data-act="back"><kbd>ESC</kbd>BACK</button></footer>`;
  root.appendChild(el);
  const $ = (q) => el.querySelector(q);
  const list = $('.set-list');
  let draft = null, tab = 'game', sel = null, capture = null;

  const keyRow = (id, label) => `<div class="opt key${id === sel ? ' sel' : ''}" data-id="${id}"><span class="opt-label">${label}</span>
    <div class="opt-ctl"><button class="keybtn${capture === id ? ' wait' : ''}">${capture === id ? 'PRESS A KEY' : keyLabel(draft.keys[id])}</button></div></div>`;

  function render() {
    sel ??= tab === 'keys' ? KEY_ACTIONS[0][0] : SCHEMA.find((s) => s.tab === tab).id;
    el.querySelectorAll('.set-tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'keys') list.innerHTML = '<h3 class="set-sec">Keybinds</h3>' + KEY_ACTIONS.map(([id, label]) => keyRow(id, label)).join('');
    else {
      let sec = '';
      list.innerHTML = SCHEMA.filter((s) => s.tab === tab).map((s) => (s.section !== sec ? `<h3 class="set-sec">${(sec = s.section)}</h3>` : '') + optRow(s, draft[s.id], s.id === sel)).join('');
    }
    $('.set-dirty').hidden = JSON.stringify(draft) === JSON.stringify(settings);
    describe();
  }

  function describe() {
    const s = byId[sel], k = KEY_ACTIONS.find(([id]) => id === sel);
    $('.set-desc h2').textContent = s ? s.label : k ? k[1] : '';
    $('.set-desc p').textContent = s ? s.desc : k ? 'Click the key box, then press a key or mouse button. Esc cancels. A key already in use swaps places.' : '';
    $('.set-choices').innerHTML = s?.type === 'choice' ? s.options.map((o) => `<li${o === String(draft[s.id]) ? ' class="on"' : ''}>${o.toUpperCase()}</li>`).join('') : '';
  }

  function change(id, d) {
    const s = byId[id];
    draft[id] = stepValue(s, draft[id], d);
    if (id === 'quality') Object.assign(draft, PRESETS[draft.quality]);
    render();
  }

  function bind(code) {
    const old = draft.keys[capture];
    for (const k in draft.keys) if (draft.keys[k] === code) draft.keys[k] = old;
    draft.keys[capture] = code; capture = null; render();
  }

  el.addEventListener('mouseover', (e) => {
    const row = e.target.closest('.opt');
    if (!row || row.dataset.id === sel) return;
    sel = row.dataset.id;
    list.querySelectorAll('.opt').forEach((r) => r.classList.toggle('sel', r === row));
    describe();
  });
  el.addEventListener('click', (e) => {
    const t = e.target.closest('button, .opt-val');
    if (!t) return;
    const row = t.closest('.opt');
    if (t.dataset.tab) { tab = t.dataset.tab; sel = null; capture = null; render(); list.scrollTop = 0; }
    else if (t.classList.contains('arr')) change(row.dataset.id, Number(t.dataset.d));
    else if (t.classList.contains('opt-val')) change(row.dataset.id, 1);
    else if (t.classList.contains('keybtn')) { capture = row.dataset.id; render(); }
    else if (t.dataset.act) act(t.dataset.act);
  });

  function act(a) {
    if (a === 'apply') { applySettings(draft); draft = structuredClone(settings); render(); }
    else if (a === 'reset') {
      if (tab === 'keys') draft.keys = structuredClone(DEFAULTS.keys);
      else for (const s of SCHEMA) if (s.tab === tab) draft[s.id] = DEFAULTS[s.id];
      render();
    } else { el.hidden = true; onClose(); }
  }

  // capture phase: runs before the game's own key handling, and swallows keys while binding
  addEventListener('keydown', (e) => {
    if (el.hidden) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (capture) { if (e.code === 'Escape') { capture = null; render(); } else bind(e.code); return; }
    if (e.code === 'Enter') act('apply');
    else if (e.code === 'Escape') act('back');
    else if (e.code === 'Delete') act('reset');
  }, true);
  addEventListener('mousedown', (e) => {
    if (el.hidden || !capture || e.target.closest('.keybtn')) return;
    e.stopImmediatePropagation();
    if (e.button === 0 || e.button === 2) { capture = null; render(); } // fire/aim stay on LMB/RMB
    else { e.preventDefault(); bind(`Mouse${e.button}`); }
  }, true);

  return {
    el,
    open(t = 'game') { draft = structuredClone(settings); tab = t; sel = null; capture = null; el.hidden = false; render(); },
  };
}
