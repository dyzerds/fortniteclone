// All gameplay tunables. Pure data: safe to import from node tests.

// World size and named towns live with the rest of the island layout.
export { WORLD, POIS } from './world/island.js';

export const GRID = {
  cell: 5,             // build cell width (m)
  height: 3.75,        // build level height (m) -> ramp slope 0.75
  thick: 0.22,
};

export const MOVE = {
  jog: 5.5, sprint: 7.8, crouch: 3.4, swim: 3.2, swimDepth: 1.38, swimJump: 11,
  strafeMul: 0.65, backMul: 0.55, // speed share when moving sideways / backwards
  accelRun: 14, accelStop: 70, accelAir: 6, // air: ~6 m/s2 toward the keys (jog-jump + S slows ~5.5 to ~2 by landing); no keys keeps speed
  gravity: 30, jumpSpeed: 6.5, jumpHold: 0.25, // apex ~2.3 m, ~0.87 s in the air
  fallFlail: 1.5,      // seconds in the air before the long-fall pose
  slideBoost: 8.3, slideFriction: 1.55, slideSlopeAccel: 14, slideMin: 5.2, // flat slide ~2 s, 1.06x down to 0.67x sprint
  slideTurn: 2.5,      // rad/s the slide turns toward the keys or the camera
  mantleMax: 2.4, mantleTime: 0.35,
  // fall damage by drop height (m): build floors are 3.75 m; 3 floors 0, 4 floors 21, 5 floors 52, 6 floors kills
  fallDmg: [[11.25, 0], [15, 21], [18.75, 52], [22.5, 105]],
  radius: 0.35, height: 1.85, crouchHeight: 1.25, headY: 1.5,
  // sink rates measured against a build tower (floors/s): free fall 3.1 (11.7 m/s), glider 1.3 (4.9 m/s).
  // from the barge (~580 m up): ~41 s floating with no input, ~10 s diving (W + look down) to the auto-open height
  skydiveFall: 11.7, skydiveDive: 49, skydiveSteer: 22,
  // glider: opens itself ~100 m up, then ~20 s down with no input, ~14 s holding W (x1.43)
  glideFall: 4.9, glideFwdMul: 1.43, glideSpeed: 14, autoGlideHeight: 100,
  minDeploy: 12,       // air below needed to open the glider by hand (also mid-fall off builds)
};

export const CAMERA = {
  fov: 80, adsFov: 58, scopeFov: 38, // horizontal degrees
  dist: 3.5, adsDist: 1.7, shoulder: 0.52, pivotY: 1.5, // framed to match the reference: body centre ~0.39 W, head top ~0.40 H, feet at the bottom edge
  skydiveDist: 1.7, glideDist: 1.3, // added to dist in the air
};

// Build materials: hp grows from start to max over buildTime.
export const MATERIALS = {
  wood:  { max: 150, start: 0.25, buildTime: 1.6, color: '#d9913e' },
  brick: { max: 300, start: 0.2,  buildTime: 5.0, color: '#d98a6f' },
  metal: { max: 500, start: 0.15, buildTime: 9.0, color: '#9db3c8' },
};
export const BUILD_COST = 10;
export const MAT_CAP = 999;
export const BUILD_REACH = 1;   // cells

export const HARVEST = {
  swing: 0.6, hitAt: 0.15, reach: 2.6,
  charDmg: 20, structDmg: 50, critMult: 2,
  yield: { tree: 6, rock: 4, car: 15, metal: 5, wood: 5, brick: 5 }, // props by kind, built pieces by material
};

export const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#9aa4ad', dark: '#5d6670' },
  { id: 'uncommon',  name: 'Uncommon',  color: '#5fd14a', dark: '#2e7d22' },
  { id: 'rare',      name: 'Rare',      color: '#3fa3ff', dark: '#1859b5' },
  { id: 'epic',      name: 'Epic',      color: '#c45cff', dark: '#6d23a8' },
  { id: 'legendary', name: 'Legendary', color: '#ffb21e', dark: '#b8620a' },
];

// dmg arrays index by rarity (0..4). spread in radians.
export const WEAPONS = {
  ar: { name: 'Assault Rifle', cls: 'ar', ammo: 'medium', auto: true, rate: 5.5, mag: 30,
    reload: [2.7, 2.6, 2.5, 2.4, 2.2], dmg: [30, 31, 33, 35, 36], head: 1.5, range: 200,
    spreadMin: 0.012, spreadMax: 0.07, spreadShot: 0.012, spreadMove: 0.03, adsMul: 0.45, recoil: 0.012 },
  shotgun: { name: 'Pump Shotgun', cls: 'shotgun', ammo: 'shells', auto: false, rate: 0.75, mag: 5,
    reload: [5, 4.8, 4.6, 4.4, 4.2], dmg: [8, 8.6, 9.3, 10, 10.6], pellets: 10, head: 2, range: 45,
    falloffStart: 8, falloffEnd: 30, falloffMin: 0.35,
    spreadMin: 0.07, spreadMax: 0.08, spreadShot: 0, spreadMove: 0.01, adsMul: 0.8, recoil: 0.06 },
  smg: { name: 'Rapid SMG', cls: 'smg', ammo: 'light', auto: true, rate: 12, mag: 30,
    reload: [2.4, 2.3, 2.2, 2.1, 2.0], dmg: [16, 17, 18, 19, 20], head: 1.75, range: 90,
    spreadMin: 0.025, spreadMax: 0.08, spreadShot: 0.006, spreadMove: 0.025, adsMul: 0.6, recoil: 0.008 },
  pistol: { name: 'Sidearm', cls: 'pistol', ammo: 'light', auto: false, rate: 6.5, mag: 16,
    reload: [1.6, 1.5, 1.45, 1.4, 1.3], dmg: [24, 25, 26, 27, 28], head: 2, range: 100,
    spreadMin: 0.01, spreadMax: 0.06, spreadShot: 0.015, spreadMove: 0.02, adsMul: 0.5, recoil: 0.015 },
  sniper: { name: 'Bolt Sniper', cls: 'sniper', ammo: 'heavy', auto: false, rate: 0.35, mag: 1,
    reload: [3.2, 3.1, 3.0, 2.9, 2.8], dmg: [100, 105, 110, 116, 121], head: 2.5, range: 600,
    projectile: 320, drop: 9, minRarity: 2,
    spreadMin: 0.0, spreadMax: 0.06, spreadShot: 0.06, spreadMove: 0.05, adsMul: 0.02, recoil: 0.05, scope: true },
};

export const AMMO = {
  light:  { name: 'Light Ammo',  pickup: 30, cap: 999 },
  medium: { name: 'Medium Ammo', pickup: 30, cap: 999 },
  heavy:  { name: 'Heavy Ammo',  pickup: 6,  cap: 999 },
  shells: { name: 'Shells',      pickup: 8,  cap: 999 },
};

export const CONSUMABLES = {
  bandage:    { name: 'Bandage',     stack: 15, time: 3.5, heal: 15, cap: 75,  rarity: 0 },
  medkit:     { name: 'Medkit',      stack: 3,  time: 10,  heal: 100, cap: 100, rarity: 1 },
  shieldcell: { name: 'Shield Cell', stack: 6,  time: 2,   shield: 25, cap: 50, rarity: 2 },
  shieldcore: { name: 'Shield Core', stack: 3,  time: 5,   shield: 50, cap: 100, rarity: 2 },
};

export const PLAYER = { maxHealth: 100, maxShield: 100, slots: 5 };

// Storm phases: wait (s), shrink (s), radius fraction of the first circle, damage per second.
export const STORM = {
  startRadius: 640,
  phases: [
    { wait: 95, shrink: 60, frac: 0.55, dps: 1 }, // first wait covers the ~25 s drop from the barge
    { wait: 50, shrink: 45, frac: 0.32, dps: 2 },
    { wait: 40, shrink: 40, frac: 0.18, dps: 5 },
    { wait: 30, shrink: 30, frac: 0.09, dps: 8 },
    { wait: 25, shrink: 25, frac: 0.04, dps: 10 },
    { wait: 20, shrink: 30, frac: 0.0,  dps: 10 },
  ],
};

export const MATCH = {
  bots: 29,
  busHeight: 590, busSpeed: 34,
  xpPerKill: 120, xpPerPlace: 900, xpBase: 150,
};

export const BOT = {
  thinkHz: 8, farThinkHz: 2, farDist: 220,
  sight: 110, reaction: [0.25, 0.6],
  aimError: 0.05, aimTrack: 2.2,
};
