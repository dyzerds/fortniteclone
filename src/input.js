// Keyboard + mouse state. Mouse buttons share the code space with keys ("Mouse0", "Mouse2") so they can be bound.
import { settings } from './settings-store.js';

const down = new Set();
const pressed = new Set();
const released = new Set();
let mdx = 0, mdy = 0, wheel = 0;

export const input = {
  enabled: false,
  get locked() { return document.pointerLockElement != null; },
  down: (action) => down.has(settings.keys[action]),
  pressed: (action) => pressed.has(settings.keys[action]),
  codeDown: (code) => down.has(code),
  codePressed: (code) => pressed.has(code),
  codeReleased: (code) => released.has(code),
  takeMouse() { const r = [mdx, mdy]; mdx = 0; mdy = 0; return r; },
  takeWheel() { const w = wheel; wheel = 0; return w; },
  endTick() { pressed.clear(); released.clear(); },
  reset() { down.clear(); pressed.clear(); released.clear(); mdx = mdy = wheel = 0; },
  lock(el) { if (!document.pointerLockElement) el.requestPointerLock?.({ unadjustedMovement: true })?.catch?.(() => el.requestPointerLock()?.catch?.(() => {})); }, // no gesture or too soon after Esc: ignore
};

const press = (code) => { if (!down.has(code)) pressed.add(code); down.add(code); };
const release = (code) => { down.delete(code); released.add(code); };

addEventListener('keydown', (e) => {
  if (!input.enabled) return;
  if (e.code === 'Tab' || e.code === 'Space' || (e.ctrlKey && e.code !== 'ControlLeft')) e.preventDefault();
  if (!e.repeat) press(e.code);
});
addEventListener('keyup', (e) => release(e.code));
addEventListener('mousedown', (e) => {
  if (e.button === 1) e.preventDefault(); // middle click: no autoscroll
  if (input.enabled && input.locked) press(`Mouse${e.button}`);
});
addEventListener('mouseup', (e) => release(`Mouse${e.button}`));
addEventListener('mousemove', (e) => { if (input.enabled && input.locked) { mdx += e.movementX; mdy += e.movementY; } });
addEventListener('wheel', (e) => { if (input.enabled && input.locked) wheel += Math.sign(e.deltaY); }, { passive: true });
addEventListener('blur', () => { for (const c of [...down]) release(c); });
addEventListener('contextmenu', (e) => e.preventDefault());
