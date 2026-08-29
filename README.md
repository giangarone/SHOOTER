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
| Q | Swap weapon |
| Space | Jump |
| Shift | Sprint |
| E | Buy ammo / reroll at a station |
| Esc | Pause |

## Features

- First-person camera with pointer-lock mouse aiming
- Neon arena with walls, platforms, crates, and pillars (jumpable cover)
- Enemies navigate around cover with a shared flow field (`js/nav.js`) instead
  of grinding into the nearest pillar
- Six enemy types: **Chasers** and **Splitters** (melee, splitters break into three on death), **Shooters** and **Snipers** (ranged darts), **Tanks** (slow, heavy melee), **Bombers** (lobbed grenades)
- Pickups: ammo crates plus health, damage, fire-rate and shield powerups
- **Upgrade totems**: clearing a wave raises three pillars near the arena
  centre, each showing one upgrade as short colour-coded lines - benefits
  green, drawbacks red - with its own theme colour and a small 3D icon
  hovering in front of it: a flame for Incendiary, an icicle for Cryo, a coin
  for Midas Touch. Walk into one or shoot it anywhere to take it. Upgrades are
  permanent for the run and stack, so no two runs build the same way.
- **No pauses**: the next wave starts 5s after the clear whether or not you
  chose. An unclaimed set stays standing and is only replaced when the
  following wave is cleared - so a pick you ignore is a pick you lose.
- **Stations**: ammo and a totem reroll, bought with E beside the totems.
  Buying ammo leaves the totems standing; rerolling redraws all three.
- **Credits and combos**: kills pay credits scaled by a kill-chain multiplier
  (up to x3), and a wave cleared without taking damage pays double.
- Escalating waves with per-wave HP / speed / damage scaling
- **Three weapons**, two carried at once and swapped with Q: the full-auto
  **Pulse Rifle**, a semi-auto **Scattergun** (8 pellets, murderous inside 2m,
  useless past 10m) and a piercing **Railgun** that one-shots everything but a
  tank and keeps going through the rank behind it. Magazines are per slot;
  the reserve pool is shared.
- Weapons appear on totems - claiming one fills your empty slot, or replaces
  the gun in hand (the totem says which before you take it)
- Particle bursts for hits and kills, hit markers, damage vignette, screen shake
- WebAudio synth SFX (no audio assets)
- HUD: health, ammo, score, wave + enemies remaining
- Start, pause, and game-over screens with restart

## Upgrades

**Nothing in a run ever pauses the game.** The choice is three totems standing
in the arena, and credits are spent at stations beside them with a keypress. A
menu at the wave boundary killed the momentum the game runs on; keep new
systems on that side of the line.

Upgrades live in `js/upgrades.js`. Each one is a pure function of its stack
count, and the whole owned list is replayed from scratch onto a fresh stat
block (`Player.rebuildMods`) after every pick, so `apply(mods, n)` must set
absolute values rather than accumulate. Every stat an upgrade may touch is
declared in `DEFAULT_MODS` in `js/player.js`.

Each upgrade carries a `theme` colour describing what it DOES (gold ammo,
orange fire rate, cyan armour, blue mobility...) and an `effects` list of short
signed lines - `1` benefit drawn green, `-1` drawback drawn red, `0` a dim
qualifier. The sign is about good versus bad, not arithmetic: `-30% RELOAD
TIME` is a benefit. Keep each line under about 22 characters; it is read at a
glance, mid-run, from across the arena.

Rarity gates when an upgrade can appear: rares from wave 2, cursed from wave 3,
with rares getting commoner as the run goes on.

**The whole totem claims it.** One invisible box wraps the pillar and its icon,
so a hit anywhere on the thing takes the upgrade. An earlier revision made only
a small floating core claim, so a shot that missed an enemy standing behind a
totem could not pick a build for you - but hitting a 27cm orb mid-fight is a
marksmanship test nobody asked for, and a totem that is half inert reads as a
bug. The floating label panel above is deliberately outside the box: it hangs
wide and high over the arena, and a stray shot up there stays a miss.

Each upgrade carries an `icon` naming a shape in `js/icons.js` alongside its
`theme`. Icons are assembled from one shared set of eight unit primitives -
box, sphere, cone, cylinder, torus, and three polyhedra - scaled and rotated
per part, so a new icon costs no GPU memory. Never add a bespoke geometry
there. A totem builds an icon the first time it shows one and keeps it hidden
afterwards, which bounds the count by the size of the upgrade pool rather than
by how many waves have passed.

## Enemy movement

Enemies route with a flow field, not a straight line. `js/nav.js` bakes the
arena's obstacle AABBs into a half-metre occupancy grid once at startup, grown
by the enemy radius so an open cell is a cell an enemy actually fits in. A
breadth-first flood from the player's cell fills a distance field over that
grid five times a second, and every enemy alive steers by walking downhill
through the one field - which is the reason for a field rather than an A* per
enemy: thirty enemies want a route to the same place, so it is computed once.

Two passes keep it from looking like grid movement. If the straight line to the
player is clear the field is ignored entirely, which is most of the time in an
arena this open and costs one segment/box test. Otherwise the enemy follows the
downhill chain a few cells ahead and aims at the farthest cell it still has a
clear line to, which cuts the staircase off the path and rounds corners.

Retreats - a feared enemy, a shooter backing off its preferred range - reverse
the straight line instead of the path. Running away has no destination to route
to, and the collision resolver already slides them along whatever they back
into.

The player is often standing on a platform, which is a blocked cell. The flood
seeds from the ring of open cells around it in that case, so enemies gather at
the foot of the platform rather than losing the route entirely.

## Weapons

`js/weapons.js` is a data table in the same shape as `ENEMY_TYPES` and
`UPGRADES`: a fourth gun is a stat block plus a `build()`. The stats there are
BASE values that `player.mods` multiplies, so every upgrade in the pool already
applies to whatever you are holding - that is the point of the table.

Every weapon's viewmodel is built once at startup and parented to the camera;
a swap only toggles `visible`. Building a model per swap would allocate
geometry for the whole session.

When balancing, check damage per second *after* reloads, not per shot. The
scattergun first shipped at 8 pellets x 13 in a 6-shell magazine, which reads
as a huge 104-damage shell but works out strictly worse than the starting rifle
at every range once the short magazine and long reload are counted.

## Test

```bash
npm test
```

Runs a headless-Chrome smoke test that plays the game automatically for 60s
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
js/nav.js           navigation grid + flow field enemies steer by
js/icons.js         3D totem icons, built from shared primitives
js/effects.js       particle pool, tracers, muzzle flash, shake
js/ui.js            HUD DOM bindings
js/sfx.js           WebAudio synth sounds
js/waves.js         wave difficulty config
js/upgrades.js      upgrade pool, totem roll, ammo purchase
js/weapons.js       weapon stats + first-person models
js/totems.js        wave-end totems + ammo/reroll stations
js/utils.js         collision + misc helpers
test/smoke.mjs      headless smoke test
```
