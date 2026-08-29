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
| E | Buy ammo / reroll at a station |
| Esc | Pause |

## Features

- First-person camera with pointer-lock mouse aiming
- One move speed, always on. There is no sprint key: holding a button to travel
  at the pace the game is tuned around was a tax rather than a decision, so the
  slower walk is gone and everyone moves at what used to be sprint speed.
  Accuracy still falls off while moving fast.
- Neon arena with walls, platforms, crates, and pillars (jumpable cover)
- Enemies navigate around cover with a shared flow field (`js/nav.js`) instead
  of grinding into the nearest pillar
- Ten enemy types: **Chasers** and **Splitters** (melee, splitters break into three on death), **Shooters** and **Snipers** (ranged darts), **Tanks** (slow, heavy melee), **Bombers** (lobbed grenades), **Wraiths** (blink behind you), **Bulwarks** (frontal shield - flank them, or burn them, since damage over time ignores it), **Conduits** (no attack; buff everything near them) and **Blights** (lingering pools that make standing still cost health)
- **A boss every five waves**, in a fixed rotation of five that repeats: the
  **Colossus** (armoured but for a weak point travelling around its body, and a
  telegraphed charge that knocks it out cold against a wall), **Siege**
  (telegraphed mortar barrages), **Schism** (splits at half health, then again),
  **Maw** (drags you in and rolls rings you have to jump) and the **Herald**
  (blinks, volleys, and enrages under 30%). Regular enemies keep arriving
  throughout; killing the boss ends the wave, pays out, and rearms you.
- **Wave composition is fixed, its cast is not.** Every wave has the same
  number of enemies and the same mix of ROLES in every run, but which type
  fills each slot is rolled from that role's members, who are balanced to be
  near-equivalent. Two runs face the same difficulty and a different fight,
  which is what keeps scores comparable.
- **Pickups drop off the enemies you kill**, not from timers around the map.
  Each wave carries a fixed loot budget spread evenly across its kills, so a
  wave always contains the same amount however it is played; what each drop
  turns out to BE is weighted by what you are short of, so a player on full
  health and full ammo gets buffs instead. Bosses shed a pickup at each
  quarter of their health, and if you are starving with no kills coming, one
  is placed near you so the fight cannot dead-end.
- **Upgrade totems**: clearing a wave raises three pillars near the arena
  centre, each showing one upgrade as short colour-coded lines - benefits
  green, drawbacks red - with its own theme colour and a small 3D icon
  that orbits round to whatever side you are standing on: a flame for
  Incendiary, an icicle for Cryo, a coin for Midas Touch. Walk into one or
  shoot it anywhere to take it. Upgrades are permanent for the run and stack,
  so no two runs build the same way.
- **The next wave waits for your pick.** No menu opens and the camera never
  leaves your hands, but the run holds at the boundary until a totem is taken.
- **Stations**: ammo and a totem reroll, bought with E beside the totems.
  Buying ammo leaves the totems standing; rerolling redraws all three.
- **Credits and combos**: kills pay credits scaled by a kill-chain multiplier
  (up to x3), and a wave cleared without taking damage pays double.
- Escalating waves with per-wave HP / speed / damage scaling
- **One gun**, the full-auto **Pulse Rifle**. Every upgrade in the pool applies
  to it, so a run's identity comes from the build rather than from the weapon.
- **The gun shows its build.** Each mutation that changes what a bullet does -
  Venom, Incendiary, Piercing Shot, Breach Round and fifteen others - sets a
  small block into the top of the receiver in that mutation's totem colour, in
  two rows down the barrel. Stat upgrades like Extended Mag do not, so the row
  of gems reads as exactly what your shots now do to what they hit. Twenty
  sockets, filled front to back; an empty socket is never drawn.
- Particle bursts for hits and kills, hit markers, damage vignette, screen shake
- Reloading shows twice over: the gun drops out of frame and rolls through the
  reload, and a ring sweeps round the crosshair as it completes
- WebAudio synth SFX (no audio assets)
- HUD: health, ammo, score, wave + enemies remaining
- Start, pause, and game-over screens with restart

## Upgrades

**No menu ever opens.** The choice is three totems standing in the arena, and
credits are spent at stations beside them with a keypress. A modal at the wave
boundary killed the momentum the game runs on; keep new systems on that side of
the line.

The wave boundary itself IS held: the next wave does not start until a totem
has been taken. That replaced a five-second timer which let an unclaimed set
sink, so a forfeited pick was silent - the player found out only by noticing
they never got one. The hold costs no tension, because the cleared wave's
enemies are already dead when it starts, and the player keeps their hands on
the controls throughout.

Upgrades live in `js/upgrades.js`. Each one is a pure function of its stack
count, and the whole owned list is replayed from scratch onto a fresh stat
block (`Player.rebuildMods`) after every pick, so `apply(mods, n)` must set
absolute values rather than accumulate. Every stat an upgrade may touch is
declared in `DEFAULT_MODS` in `js/player.js`.

Each upgrade carries a `theme` colour describing what it DOES (gold ammo,
orange fire rate, cyan armour, blue mobility...) and an `effects` list of short
signed lines - `1` benefit drawn green, `-1` drawback drawn red, `0` a dim
qualifier. The sign is about good versus bad, not arithmetic: `-30% RELOAD
TIME` is a benefit. Keep each line under about 24 characters; it is read at a
glance, mid-run, from across the arena.

An upgrade that stacks writes `effects` as a function of the stacks already
owned, and its lines read `current → next` (`CHANCE 50% → 75%`, `FIRE RATE
+20% → +40%`) so a pick always says what it moves you from and to. The first
pick has no "from" and shows the result alone. `effectLines(def, owned)`
resolves either form; the numbers live next to the `apply()` they mirror so the
two cannot drift.

The pool is 41 upgrades: 10 commons, 25 rares and 6 cursed. A specific rare
mutation turns up in roughly 6-7% of totem sets, so a run sees a slice of the
pool rather than all of it - that is the point, but it means a new upgrade only
matters if it is worth taking on sight, without a partner card.

Where a new upgrade's hook goes, by what it reacts to:

| Reacts to | Hook |
| --- | --- |
| the bullet, per pellet | `_firePellet()` in `main.js` |
| the shot, once per trigger pull | `shoot()`, and the `_shotHits` guard inside `_firePellet()` |
| an enemy dying | the sweep in `_updateEnemies()`, recorded via `_recordDeath()` and played in `_playDeaths()` |
| damage to the player | `_hurtPlayer()` |
| the gun's own state | `Player.tryShoot()` / `Player.update()` |
| an enemy's own timers | `Enemy._tickStatus()`, reading `ctx.mods` |

Deaths are recorded and played AFTER the sweep, never inline: a corpse effect
that ran mid-sweep would read the enemy list while it is half-compacted.

Rarity gates when an upgrade can appear: rares from wave 2, cursed from wave 3,
with rares getting commoner as the run goes on.

**A totem cannot be taken the instant it arrives.** Totems come up wherever the
player happens to be standing, into whatever is already in the air, so there are
two guards and they cover different mistakes. `ARM_TIME` refuses any claim for
1.2s after the pillar lands, which catches a burst fired before the set existed.
Touch additionally refuses until the player has been seen *outside* the radius
since the rise - a timer alone does nothing for someone who never stepped off
the spot the pillar came up in, which was the whole problem.

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

The icon **orbits** its pillar to whatever side the player is on and turns to
face them, so it is legible from every angle. The alternative considered was a
translucent pillar with a fully billboarded icon; translucency washes out the
theme colour, which is the thing carrying meaning at distance, and billboarding
a 3D shape flattens it. Orbiting keeps the pillar solid and the icon presenting
its front. The radii are elliptical (1.0 x 0.62) because the pillar is - a
circular orbit wide enough to clear the sides leaves the icon absurdly far off
the front.

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
`UPGRADES`: a second gun would be a stat block plus a `build()`. The run
carries only the Pulse Rifle. The stats there are BASE values that
`player.mods` multiplies, so every upgrade in the pool already applies to it -
that is the point of the table.

The viewmodel is built once at startup and parented to the camera. Building one
per equip would allocate geometry for the whole session.

The receiver carries twenty sockets, each a block standing on a plinth, built
hidden with the model. `setGunMarks(model, colors)` fills one per owned
mutation flagged `mark: true` in `UPGRADES`, in that upgrade's theme colour;
`Player.refreshGunMarks()` calls it on every draft pick and on reset. Sockets
are toggled, never created per pick - a rebuild per draft would leak a material
each time.

Each block carries TWO materials, and that is what makes it look solid: a
single emissive material lights every face equally, so a cube reads as a flat
silhouette however bright it is. The cap face is at full emissive and the four
walls at a fraction of it, so the sides fall into shadow against the top and
the block has visible height. Anything added here needs the same treatment -
brightness alone will always read as a sticker.

When balancing, check damage per second *after* reloads, not per shot.

## Test

```bash
npm test
```

Runs a headless-Chrome smoke test that plays the game automatically for 60s
(requires a system Chrome; override with `CHROME=/path/to/chrome`). Besides
checking the game runs, it asserts the pickup, ammo and projectile caps hold
and that GPU resource counts stay bounded — lights, shader programs and
geometries must not grow as enemies spawn and die.

```bash
npm run test:boss
npm run test:drops
```

Two targeted suites, because the smoke test's bot rarely survives past the
early waves and would pass every later assertion vacuously. `test:boss` drives
the game into each boss wave in turn and checks the fight resolves, the adds
stay capped, telegraph handles are returned to their pool, and — the one boss
bug that every functional test sails straight through — that the Colossus's
weak point is on the same side as the plate the player can see. `test:drops`
checks a wave can never yield more loot than its budget, that it yields close
to all of it, and that need actually decides the type.

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
