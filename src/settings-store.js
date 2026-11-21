// Settings schema (drives the settings menu UI) + persistence + keybinds.

export const KEY_ACTIONS = [
  ['forward', 'Move Forward', 'KeyW'], ['back', 'Move Back', 'KeyS'], ['left', 'Move Left', 'KeyA'], ['right', 'Move Right', 'KeyD'],
  ['jump', 'Jump', 'Space'], ['sprint', 'Sprint', 'ShiftLeft'], ['crouch', 'Crouch / Slide', 'ControlLeft'],
  ['reload', 'Reload / Rotate', 'KeyR'], ['interact', 'Interact', 'KeyE'],
  ['wall', 'Build Wall', 'KeyQ'], ['floor', 'Build Floor', 'KeyX'], ['ramp', 'Build Ramp', 'KeyC'], ['cone', 'Build Cone', 'KeyV'],
  ['edit', 'Edit', 'KeyF'], ['material', 'Switch Material', 'KeyT'],
  ['pickaxe', 'Harvesting Tool', 'Digit1'], ['slot1', 'Slot 1', 'Digit2'], ['slot2', 'Slot 2', 'Digit3'], ['slot3', 'Slot 3', 'Digit4'],
  ['slot4', 'Slot 4', 'Digit5'], ['slot5', 'Slot 5', 'Digit6'], ['map', 'Map', 'KeyM'], ['inventory', 'Inventory', 'Tab'], ['marker', 'Place Marker', 'Mouse1'], ['emote', 'Emote', 'KeyB'],
];

// type: 'choice' (options) | 'range' (min,max,step) ; tab: game | video | audio
export const SCHEMA = [
  { tab: 'game', section: 'Mouse', id: 'sens', label: 'Mouse Sensitivity', type: 'range', min: 0.1, max: 3, step: 0.05, def: 1, desc: 'How fast the camera turns when you move the mouse.' },
  { tab: 'game', section: 'Mouse', id: 'adsSens', label: 'Targeting Sensitivity', type: 'range', min: 0.2, max: 1.5, step: 0.05, def: 0.7, desc: 'Multiplier applied while aiming down sights.' },
  { tab: 'game', section: 'Mouse', id: 'scopeSens', label: 'Scope Sensitivity', type: 'range', min: 0.2, max: 1.5, step: 0.05, def: 0.6, desc: 'Multiplier applied while looking through a scope.' },
  { tab: 'game', section: 'Mouse', id: 'invertY', label: 'Invert View', type: 'choice', options: ['Off', 'On'], def: 'Off', desc: 'Flip vertical mouse look.' },
  { tab: 'game', section: 'Movement', id: 'toggleSprint', label: 'Toggle Sprint', type: 'choice', options: ['Off', 'On'], def: 'Off', desc: 'Off: hold Sprint to sprint. On: press once to toggle sprinting.' },
  { tab: 'game', section: 'Movement', id: 'toggleCrouch', label: 'Toggle Crouch', type: 'choice', options: ['Off', 'On'], def: 'On', desc: 'Off: hold Crouch. On: press once to crouch, again to stand.' },
  { tab: 'game', section: 'Combat', id: 'autoPickup', label: 'Auto Pick Up Weapons', type: 'choice', options: ['Off', 'On'], def: 'Off', desc: 'Pick up weapons by walking over them when you have a free slot.' },
  { tab: 'game', section: 'Combat', id: 'damageNumbers', label: 'Damage Numbers', type: 'choice', options: ['Off', 'On'], def: 'On', desc: 'Show floating damage numbers when you hit something.' },
  { tab: 'game', section: 'Building', id: 'turboBuild', label: 'Turbo Building', type: 'choice', options: ['Off', 'On'], def: 'On', desc: 'Hold fire to keep placing pieces as you aim.' },
  { tab: 'game', section: 'Building', id: 'editRelease', label: 'Confirm Edit on Release', type: 'choice', options: ['Off', 'On'], def: 'On', desc: 'Apply edits when you release the select button.' },
  { tab: 'game', section: 'Match', id: 'bots', label: 'Opponents', type: 'choice', options: ['9', '19', '29', '39'], def: '29', desc: 'Number of bots in a match. Fewer bots run faster on slow computers.' },
  { tab: 'game', section: 'Match', id: 'difficulty', label: 'Bot Difficulty', type: 'choice', options: ['Easy', 'Normal', 'Hard'], def: 'Normal', desc: 'How well bots aim, build and react.' },

  { tab: 'video', section: 'Display', id: 'quality', label: 'Quality Preset', type: 'choice', options: ['Low', 'Medium', 'High', 'Epic'], def: 'High', desc: 'Sets shadows, grass and effects in one go.' },
  { tab: 'video', section: 'Display', id: 'renderScale', label: '3D Resolution', type: 'range', min: 0.5, max: 1, step: 0.05, def: 1, desc: 'Lower values render fewer pixels for more FPS.' },
  { tab: 'video', section: 'Display', id: 'fov', label: 'Field of View', type: 'range', min: 70, max: 100, step: 1, def: 80, desc: 'How much of the world you see at once.' },
  { tab: 'video', section: 'Display', id: 'brightness', label: 'Brightness', type: 'range', min: 0.7, max: 1.4, step: 0.05, def: 1.05, desc: 'Overall image exposure.' },
  { tab: 'video', section: 'Effects', id: 'shadows', label: 'Shadows', type: 'choice', options: ['Off', 'On'], def: 'On', desc: 'Sun shadows near the camera.' },
  { tab: 'video', section: 'Effects', id: 'grass', label: 'Grass', type: 'choice', options: ['Off', 'Low', 'High'], def: 'High', desc: 'Swaying grass around you.' },
  { tab: 'video', section: 'Effects', id: 'bloom', label: 'Bloom', type: 'choice', options: ['Off', 'On'], def: 'On', desc: 'Soft glow on bright things.' },
  { tab: 'video', section: 'Effects', id: 'showFps', label: 'Show FPS', type: 'choice', options: ['Off', 'On'], def: 'Off', desc: 'Frame rate counter in the corner.' },

  { tab: 'audio', section: 'Volume', id: 'master', label: 'Master Volume', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, desc: 'Overall game volume.' },
  { tab: 'audio', section: 'Volume', id: 'sfx', label: 'Sound Effects', type: 'range', min: 0, max: 1, step: 0.05, def: 1, desc: 'Weapons, building and footsteps.' },
  { tab: 'audio', section: 'Volume', id: 'ui', label: 'Menu Sounds', type: 'range', min: 0, max: 1, step: 0.05, def: 0.8, desc: 'Clicks and menu feedback.' },
];

// Quality preset: picking one in the menu also sets these.
export const PRESETS = {
  Low: { shadows: 'Off', grass: 'Off', bloom: 'Off', renderScale: 0.75 },
  Medium: { shadows: 'On', grass: 'Low', bloom: 'On', renderScale: 0.85 },
  High: { shadows: 'On', grass: 'High', bloom: 'On', renderScale: 1 },
  Epic: { shadows: 'On', grass: 'High', bloom: 'On', renderScale: 1 }, // Epic also lifts the pixel-ratio cap
};

const KEY = 'storm-royale.settings.v1';
export const DEFAULTS = {
  ...Object.fromEntries(SCHEMA.map((s) => [s.id, s.def])),
  keys: Object.fromEntries(KEY_ACTIONS.map(([id, , code]) => [id, code])),
};

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) return { ...DEFAULTS, ...s, keys: { ...DEFAULTS.keys, ...s.keys } };
  } catch { /* blocked or corrupt */ }
  return structuredClone(DEFAULTS);
}

export const settings = load();
const listeners = new Set();
export const onSettings = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function applySettings(next) {
  Object.assign(settings, structuredClone(next));
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ }
  for (const fn of listeners) fn(settings);
}

export const on = (id) => settings[id] === 'On';

export function keyLabel(code) {
  if (!code) return '';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return { Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', Tab: 'TAB',
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'M4', Mouse4: 'M5', CapsLock: 'CAPS' }[code] ?? code.replace(/^(Arrow|Numpad)/, '');
}
