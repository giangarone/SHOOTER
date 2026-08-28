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

## Features

- First-person camera with pointer-lock mouse aiming
- Neon arena with walls, platforms, crates, and pillars (jumpable cover)
- Two enemy types: **Chasers** (fast melee) and **Shooters** (ranged, strafe and fire darts)
- Escalating waves with per-wave HP / speed / damage scaling
- Weapon with magazine, reload, recoil, tracers, and muzzle flash
- Particle bursts for hits and kills, hit markers, damage vignette, screen shake
- WebAudio synth SFX (no audio assets)
- HUD: health, ammo, score, wave + enemies remaining
- Start, pause, and game-over screens with restart

## Test

```bash
npm test
```

Runs a headless-Chrome smoke test that plays the game automatically (requires a system Chrome; override with `CHROME=/path/to/chrome`).

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
js/utils.js         collision + misc helpers
test/smoke.mjs      headless smoke test
```
