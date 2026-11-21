# Storm Royale

An original build-and-shoot battle royale that runs in the browser. Drop from the sky barge onto the island, loot weapons, harvest materials, build walls, floors, ramps and cones, and be the last one standing as the storm closes in. You play solo against AI bots, offline.

**Play:** https://dyzerds.github.io/fortniteclone/

Built with [Three.js](https://threejs.org/) for rendering and [Rapier](https://rapier.rs/) for physics. Plain JavaScript modules, bundled with Vite. Every model, texture, icon and sound is generated in code; the repo ships no art or audio files.

## Controls

Defaults. Every key can be rebound in **Settings → Keybinds**.

| Action | Key |
| --- | --- |
| Move | W A S D |
| Jump / deploy glider | Space |
| Sprint | Shift |
| Crouch / slide | Ctrl |
| Fire / place piece | Left mouse |
| Aim / switch material (build mode) | Right mouse |
| Harvesting tool | 1 |
| Weapon slots | 2 – 6, or mouse wheel |
| Wall / floor / ramp / cone | Q / X / C / V |
| Edit a piece | F (select tiles, release or press F to confirm) |
| Switch material | T |
| Reload / rotate piece | R |
| Interact (pick up, open chests) | E |
| Map (mouse is freed: left click places a marker, right click removes it) | M |
| Inventory (drag to reorder, drag off the panel or use Drop to drop) | Tab |
| Place marker where you aim | Middle mouse |
| Emote | B (press again for the next one) |
| Pause | Esc |

## Run locally

Needs Node 22 or newer.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for building, storm and combat rules
npm run build    # production build in dist/
```

Every push to `main` runs the tests, builds, and deploys to GitHub Pages.

### Dev URL parameters

| Parameter | Effect |
| --- | --- |
| `?play=1` | Skip the lobby and start a match on the barge |
| `?p=x,z` | Start on the ground at world position x, z |
| `&bots=n` | Number of bots |
| `&kit=1` | Start with materials, three weapons, heals and ammo |
| `&yaw=`, `&pitch=` | Starting camera angles (radians) |
| `?screen=locker` or `?screen=settings` | Open a menu screen directly |

`tools/shot.mjs` takes Playwright screenshots of the running dev server: `node tools/shot.mjs "?p=0,0&kit=1" shots/test.png 3000`.

## Project layout

```
src/
  main.js              boot, render loop, wiring between systems
  config.js            tunables: movement, building, weapons, storm, bots
  cosmetics.js         cosmetic catalog and saved loadout
  settings-store.js    settings schema, keybinds, quality presets, saved settings
  match.js             one match: barge, storm, loot, bots, eliminations, results
  bots.js              bot AI
  loot.js              floor loot, chests, ammo boxes, drops
  storm.js             storm phase math and the storm wall
  models.js            weapon, pickaxe, glider, item and barge models
  textures.js          canvas textures (materials, wraps, glows)
  audio.js             synthesized sound effects
  build/               grid math and building pieces (place, edit, collapse)
  combat/rules.js      inventory, healing and damage rules
  player/              character controller and camera, avatar and animations, held items
  world/               terrain, water, foliage, sky and towns
  hud/                 in-match HUD and item icons
  ui/                  lobby, locker, settings and pause screens
test/                  node:test unit tests
tools/shot.mjs         screenshot helper
```

## Adding content

Cosmetics are data-driven. To add one:

- **Outfit**: add an entry to `OUTFITS` in `src/cosmetics.js`. An outfit is a set of colors plus hair and headwear styles that `src/player/avatar.js` already knows how to build.
- **Back bling, pickaxe or glider**: add a catalog entry in `src/cosmetics.js` and a matching branch in its model builder (`avatar.js` for back blings, `models.js` for pickaxes and gliders).
- **Wrap**: add an entry with `colors` to `WRAPS` and a pattern branch in `wrapTexture` in `src/textures.js`.
- **Emote**: add an entry to `EMOTES` and an `emote_<id>` animation clip in `makeClips` in `avatar.js`.
- **Weapon**: add a class to `WEAPONS` in `src/config.js` and a shape branch in `weaponModel` in `models.js`.

The locker, icons, loot tables and bots pick up new entries automatically.
