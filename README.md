# VOID ARENA

A browser-based 3D arena wave shooter built with Three.js. No build step — just a static server.

## Run

```bash
npm install
npm start
```

Open http://localhost:8123

## Controls

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Aim (pointer lock) |
| Left click | Shoot (hold for auto) |
| R | Reload |
| Space | Jump |
| Shift | Sprint |
| Esc | Pause |
| 1 / 2 / 3 | Pick an upgrade on the wave-end screen |

## Features

- First-person camera with pointer-lock mouse aiming
- Neon arena with walls, platforms, crates, and pillars (jumpable cover)
- Six enemy types: **Chasers** and **Splitters** (melee, splitters break into three on death), **Shooters** and **Snipers** (ranged darts), **Tanks** (slow, heavy melee), **Bombers** (lobbed grenades)
- Pickups: ammo crates plus health, damage, fire-rate and shield powerups
- **Roguelike upgrade draft**: every wave ends on a choice of three random
  upgrades from a rarity-weighted pool. Picks are permanent for the run and
  stack, so no two runs build the same way.
- **Credits and combos**: kills pay credits scaled by a kill-chain multiplier
  (up to x3), and a wave cleared without taking damage pays double. Credits buy
  rerolls, ammo, repairs and shields on the wave-end screen.
- Escalating waves with per-wave HP / speed / damage scaling
- Weapon with magazine, reload, recoil, tracers, and muzzle flash
- Particle bursts for hits and kills, hit markers, damage vignette, screen shake
- WebAudio synth SFX (no audio assets)
- HUD: health, ammo, score, wave + enemies remaining
- Start, pause, and game-over screens with restart

## The upgrade draft

Upgrades live in `js/upgrades.js`. Each one is a pure function of its stack
count, and the whole owned list is replayed from scratch onto a fresh stat
block (`Player.rebuildMods`) after every pick, so `apply(mods, n)` must set
absolute values rather than accumulate. Every stat an upgrade may touch is
declared in `DEFAULT_MODS` in `js/player.js`.

Rarity gates when an upgrade can appear: rares from wave 2, cursed from wave 3,
with rares getting commoner as the run goes on. Rerolls cost 50 credits and
double each time within a single draft, and always redraw all three cards.

## Test

```bash
npm test
```

Runs a headless-Chrome smoke test that plays the game automatically for 30s
(requires a system Chrome; override with `CHROME=/path/to/chrome`). Besides
checking the game runs, it asserts the pickup, ammo and projectile caps hold
and that GPU resource counts stay bounded — lights, shader programs and
geometries must not grow as enemies spawn and die.

## Structure

```
index.html          page + HUD + overlays
server.js           zero-dependency static dev server
css/styles.css      HUD / overlay styling
js/main.js          game loop, state, waves, shooting
js/arena.js         arena geometry, lighting, spawn points
js/player.js        movement, weapon, camera
js/enemy.js         enemy AI (chaser / shooter) + projectiles
js/effects.js       particle pool, tracers, muzzle flash, shake
js/ui.js            HUD DOM bindings
js/sfx.js           WebAudio synth sounds
js/waves.js         wave difficulty config
js/upgrades.js      upgrade pool, draft roll, shop items
js/utils.js         collision + misc helpers
test/smoke.mjs      headless smoke test
```
