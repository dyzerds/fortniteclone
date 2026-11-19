// Cosmetic catalog + loadout persistence. Adding an item = one entry here (+ its builder in avatar.js/models.js).
// Rarity index: 0 common .. 4 legendary (see RARITIES in config.js).

export const OUTFITS = [
  { id: 'comet', name: 'Comet Kid', rarity: 0, desc: 'Fast feet, faster fuse.',
    skin: '#f1c09a', top: '#ff8a1f', bottom: '#2f3c8f', accent: '#19c3d6', boots: '#232b4a', gloves: '#232b4a',
    hair: 'spiky', hairColor: '#ffd23f', head: 'goggles', headColor: '#19c3d6', eyes: '#23324d' },
  { id: 'moss', name: 'Moss Ranger', rarity: 1, desc: 'Knows every trail on the island.',
    skin: '#8d5a3b', top: '#4c9a3c', bottom: '#7a5a3a', accent: '#f2e3b3', boots: '#3b2a1c', gloves: '#3b2a1c',
    hair: 'bun', hairColor: '#2b1a12', head: 'cap', headColor: '#e8b44a', eyes: '#1b120c' },
  { id: 'nova', name: 'Nova Knight', rarity: 3, desc: 'Armor forged from a fallen star.',
    skin: '#f7d2b8', top: '#6a3df0', bottom: '#ece8ff', accent: '#4ff0ff', boots: '#4a2bb8', gloves: '#ece8ff',
    hair: 'none', hairColor: '#000000', head: 'helmet', headColor: '#ece8ff', eyes: '#1a1440', visor: '#4ff0ff' },
  { id: 'ember', name: 'Blaze Runner', rarity: 4, desc: 'Leaves a trail of sparks.',
    skin: '#e9b08a', top: '#d8242b', bottom: '#2a1f2e', accent: '#ffb21e', boots: '#2a1f2e', gloves: '#ffb21e',
    hair: 'mohawk', hairColor: '#ff7a1a', head: 'none', headColor: '#000000', eyes: '#2a1208' },
];

export const BACKBLINGS = [
  { id: 'none', name: 'None', rarity: 0 },
  { id: 'rocket', name: 'Pocket Rocket', rarity: 2, desc: 'Purely decorative. Probably.' },
  { id: 'leaf', name: 'Leaf Pack', rarity: 1, desc: 'Holds snacks. Mostly leaves.' },
];

export const PICKAXES = [
  { id: 'pick', name: 'Trusty Pick', rarity: 0, desc: 'It just works.' },
  { id: 'cleaver', name: 'Crystal Cleaver', rarity: 3, desc: 'Cuts through walls and expectations.' },
  { id: 'wrench', name: 'Bolt Wrench', rarity: 2, desc: 'Tightens bolts. Loosens walls.' },
];

export const GLIDERS = [
  { id: 'sail', name: 'Sky Sail', rarity: 0, desc: 'Standard issue.' },
  { id: 'kite', name: 'Bloom Kite', rarity: 2, desc: 'Petals catch the wind.' },
  { id: 'jet', name: 'Jet Wing', rarity: 4, desc: 'Arrive in style.' },
];

export const EMOTES = [
  { id: 'bounce', name: 'Bounce Back', rarity: 0, desc: 'Keep it bouncy.' },
  { id: 'wave', name: 'Arm Wave', rarity: 1, desc: 'Ride the wave.' },
  { id: 'pump', name: 'Victory Pump', rarity: 2, desc: 'Pump it up!' },
  { id: 'spin', name: 'Spin Out', rarity: 3, desc: 'Round and round.' },
  { id: 'clap', name: 'Clap Party', rarity: 1, desc: 'Everybody clap!' },
  { id: 'kick', name: 'Shuffle Kick', rarity: 4, desc: 'Fancy footwork.' },
];

export const WRAPS = [
  { id: 'none', name: 'Factory Finish', rarity: 0, desc: 'Default weapon finish.' },
  { id: 'sunset', name: 'Sunset Fade', rarity: 1, desc: 'Warm gradient.', colors: ['#ff4f8b', '#ffb21e'] },
  { id: 'stripes', name: 'Candy Stripes', rarity: 1, desc: 'Sweet and sharp.', colors: ['#ffffff', '#ff3b5c'] },
  { id: 'camo', name: 'Jungle Camo', rarity: 2, desc: 'Blend in. Stand out.', colors: ['#3f6b2a', '#7a9a3a', '#2b3a1c', '#a8b86a'] },
  { id: 'galaxy', name: 'Deep Galaxy', rarity: 3, desc: 'A pocket full of stars.', colors: ['#120a3a', '#5a2bd8', '#ff5fd2'] },
  { id: 'lava', name: 'Molten Core', rarity: 4, desc: 'Hot to the touch.', colors: ['#2a0a06', '#ff4a12', '#ffd21e'] },
  { id: 'ice', name: 'Glacier', rarity: 2, desc: 'Cool under pressure.', colors: ['#e6fbff', '#7fdcff', '#2a8fd8'] },
];

export const CATALOG = { outfit: OUTFITS, backbling: BACKBLINGS, pickaxe: PICKAXES, glider: GLIDERS, emote: EMOTES, wrap: WRAPS };
export const byId = (type, id) => CATALOG[type].find((i) => i.id === id) ?? CATALOG[type][0];

// Wrap slots: one for all weapons plus one per weapon class (class slot overrides "all" when set).
export const WRAP_SLOTS = ['all', 'ar', 'shotgun', 'smg', 'pistol', 'sniper'];

const KEY = 'storm-royale.loadout.v1';
export const DEFAULT_LOADOUT = {
  outfit: 'comet', backbling: 'rocket', pickaxe: 'pick', glider: 'sail',
  emotes: ['bounce', 'wave', 'pump', 'spin', 'clap', 'kick'],
  wraps: { all: 'none', ar: '', shotgun: '', smg: '', pistol: '', sniper: '' },
};

export function loadLoadout() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) return { ...DEFAULT_LOADOUT, ...saved, wraps: { ...DEFAULT_LOADOUT.wraps, ...saved.wraps } };
  } catch { /* storage blocked or corrupt: fall back to default */ }
  return structuredClone(DEFAULT_LOADOUT);
}

export function saveLoadout(l) {
  try { localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ }
}

export const wrapFor = (loadout, cls) => loadout.wraps?.[cls] || loadout.wraps?.all || 'none';
