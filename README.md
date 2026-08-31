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
| WASD | Move. Double-tap one to dash, with the Double Dash mutation |
| Mouse | Aim (pointer lock) |
| Left click | Shoot (hold for auto) |
| R | Reload |
| Space | Jump. Press again in midair, with the Double Jump mutation |
| E | Buy ammo / reroll at a station |
| Tab | Hold for the run summary: mutations owned, and the numbers behind the score |
| F | Toggle fullscreen (also on the start and pause screens) |
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
- Fourteen enemy types: **Chasers** and **Splitters** (melee, splitters break into three on death), **Shooters** and **Snipers** (ranged darts), **Tanks** (slow, heavy melee), **Bombers** (lobbed grenades), **Wraiths** (blink behind you), **Bulwarks** (frontal shield - flank them, or burn them, since damage over time ignores it), **Conduits** (no attack; buff everything near them), **Blights** (lingering pools that make standing still cost health), **Magmas** (burn a trail of lava into the floor behind them that lasts five seconds - do not retreat down the line they walked) **Wardens** (no attack; project a dome that makes every enemy inside it invincible and stone-grey until you kill the warden itself) and, from wave 21, two FLYING types - **Harriers** (hold station five metres up and are armoured while they are there; they have to drop to head height to fire their burst, and that descent is the window to kill them in) and **Shrikes** (circle out of reach, then dive at the patch of floor you were standing on - miss or hit, they spend the next second and a half climbing slowly away from you, which is the shot)
- **Every enemy is its own silhouette.** Types used to share one capsule body
  and differ only by colour, which falls apart exactly when it matters - a
  frozen or poisoned enemy is wearing the status tint, not its own colour. Each
  type now has its own faceted geometry, and the shape maps to the behaviour:
  types that rush you lean forward on legs, types that soak damage are wide and
  planted, ranged types stand upright and carry the weight on one side,
  support types float with no legs at all, ground-deniers are bloated and
  low, and the two that come apart are visibly built in halves. The test each
  model has to pass is being identifiable as a flat black shape - `enemy-viewer.html`
  renders the whole roster that way, at the player's own eye height.
- **Nothing ever spawns on top of you.** There is a no-spawn bubble sixteen
  metres wide around the player, applied after the spawn point's jitter, so
  every enemy that appears has to visibly cross ground to reach you.
- **Ground you can read at a glance.** Every lingering zone is an irregular
  patch burnt into the floor rather than a circle with an effect inside it,
  and whose it is comes from the SHAPE first: smooth blobs in the player's own
  cyan are yours and cannot hurt you (Ashen's clouds), jagged patches that
  pulse are the ones that cost you health (blight pools in toxic green, magma
  trails in molten orange). Colour and the pulse back the silhouette up, so the
  distinction survives a busy screen.
- **A room full of smoke.** Exponential fog that thickens on the bass and closes
  in for a boss, and light shafts off the truss that dissipate into the haze
  rather than ending in a hard edge.
- **A boss every five waves**, in a fixed rotation of five that repeats: the
  **Colossus** (armoured but for a red core in its chest that opens on a rhythm,
  and a telegraphed charge that knocks it out cold against a wall), **Siege**
  (telegraphed mortar barrages), **Schism** (splits at half health, then again),
  **Maw** (drags you in and rolls rings you have to jump) and the **Herald**
  (blinks, volleys, and enrages under 30%). Regular enemies keep arriving
  throughout; killing the boss ends the wave and pays out. It does NOT refill
  your health or ammo - the payout is large and the stations are right there,
  so coming out of a boss in trouble is a real state to be in and what you
  spend the money on is a real decision.
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
  green, drawbacks red - with its own theme colour and a pixel-art icon
  that orbits round to whatever side you are standing on: a flame for
  Incendiary, an icicle for Cryo, a coin for Midas Touch. Walk into one or
  shoot it anywhere to take it. Upgrades are permanent for the run and stack,
  so no two runs build the same way.
- **The next wave waits for your pick.** No menu opens and the camera never
  leaves your hands, but the run holds at the boundary until a totem is taken.
- **Stations**: ammo and a totem reroll, bought with E beside the totems.
  Buying ammo leaves the totems standing; rerolling redraws all three.
- **Money is on the floor.** Kills do not pay into the balance - they drop
  MONEY ORBS where the enemy died - chunky pixel-art spheres drawn on an
  eleven-pixel grid in the shader, wearing the ceiling's own colour with a few
  degrees of hue between one orb and the next so a heap of them is not one flat
  sheet - and you have to go and take the ground you killed on. Orbs inside a small radius fly to you on their own
  (Lodestone widens it, and pulls ammo and health with it), everything still
  down there is swept up automatically when the wave ends, and anything you
  never went near times out after twenty seconds. However many are on the
  floor, all of them together are one draw call and one buffer - a settled orb
  is not simulated at all, it bobs and blinks in the shader. Orbs cap at 250:
  past that a new drop merges into the nearest one and makes it bigger, so the
  cap can never cost you a credit.
- **Credits and combos**: kills pay credits scaled by a kill-chain multiplier
  (up to x3). There is no flat wave-clear bonus - it paid out a third of a
  wave's money for the one moment in a wave that asks nothing of you - so
  every credit now has to be collected. What clearing a wave unhurt pays is a
  SHOWER of orbs at your feet, and a boss dies in a floor full of them.
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
- Looping soundtrack that ducks behind a lowpass filter whenever you are not
  fighting - picking a mutation at the totems, paused, dead, or on the menu.
  The cutoff sweeps over 0.7s rather than switching, so combat opening back up
  is something you hear. Mute toggle on the start and pause screens, remembered
  between sessions.
- The arena is an enclosed venue: a closed ceiling 16 units up, a truss rig
  hung under it, speaker stacks and truss towers where the crates and pillars used
  to be.
- **The lights run off the music.** An analyser reads the soundtrack's bass and
  the rig flashes on the actual kick - not on a timer. It is tapped upstream of
  both the mute and the muffle, so the room keeps dancing to the track even with
  the music turned off.
- **The crowd dances.** Enemies hop on the kick and shift their weight side to
  side between beats, staggered a few frames apart so a room full of them reads
  as a crowd rather than a chorus line. Bosses hop a third as high and barely
  lean at all, because something that size moving as far as a rusher looks
  weightless. It is written to the model, never to the position pathfinding
  reads, so it cannot affect how anything routes.
- The room reads the fight: flashes speed up as your kill chain climbs, a red
  heartbeat joins below 30% health and quickens as you drop, each wave starts
  with a blackout and a slam, and taking a hit blows the lights white.
- Boss waves hand the room to the boss - its own colour across the fixtures,
  fog and beams, two heads tracking it, the fog pulled in tight, and a red
  alarm strobe while it is enraged.
- Clearing a wave brings the house lights up: strobing stops, everything goes
  warm and slow while you pick a mutation, and combat starting again is the drop.
- Optional verticality: speaker stack to wall ledge to catwalk, each hop inside
  the jump arc. The decks are suspended above head height, so enemies walk
  underneath them and enemy fire passes straight through - the high ground buys
  sightlines and costs you cover.
- HUD: health, ammo, score, wave + enemies remaining
- Start, pause, and game-over screens with restart
- **Local leaderboard.** The ten best runs, ranked by score with the wave
  reached as the tiebreak, shown on the title screen and after a death. A run
  that places asks for a name, arcade style; restarting without pressing SAVE
  banks it anyway. Kept in localStorage, so the board is per-browser: the game
  is client-side javascript, and a shared board it could not verify would be
  forgeable from the console in seconds. The economy is built to make runs
  comparable - see the budget guarantees in `test/drops.mjs`.

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

The pool is 48 upgrades: 10 commons, 32 rares and 6 cursed. A specific rare
mutation turns up in roughly 5-6% of totem sets, so a run sees a slice of the
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

Each offer's icon is a 24x24 pixel-art plate from `js/pixelicons.js`, looked up
by the upgrade's own id - entries do not name an icon, so two mutations cannot
end up wearing one shape however the pool is edited. The art is flat and 2D; the
object is not, carrying three pixels of extrusion behind the face so it reads as
a thick cutout turning in the light rather than a sticker. Each plate is one
merged, vertex-coloured, unlit mesh with the interior faces omitted, so it is a
single draw call and takes no light - the shading is painted into the tones.
Four of the five tones are derived from the offer's `theme`, so one drawing
works for any colour. A totem builds an icon the first time it shows one and
keeps it hidden afterwards, which bounds the count by the size of the upgrade
pool rather than by how many waves have passed.

The drawings themselves live in `tools/pixelart/`, not in the JS: shapes in
`icons.py`, a shared lighting pass in `canvas.py`, and `build.py` to regenerate
the table. The lighting pass is the point - it puts the shadow on the lower
right and the highlight on the upper left of every form in the catalogue, so
sixty-five icons look like one set instead of sixty-five decisions about where
the light is. `pixel-icon-sheet.html` shows all of them at once, which is the
only way to tell whether two read alike; `pixel-icon-viewer.html` puts any one
of them in a mock column.

The icon **orbits** its pillar to whatever side the player is on and turns to
face them, so it is legible from every angle. This is also why the art can be
flat: the totem never free-spins an icon, so facing the player is the only
angle that ever means anything. The alternative considered was a translucent
pillar with a fully billboarded icon; translucency washes out the theme colour,
which is the thing carrying meaning at distance. Orbiting keeps the pillar
solid and the icon presenting its front. The radii are elliptical (1.0 x 0.62) because the pillar is - a
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
npm run test:money
```

Two targeted suites, because the smoke test's bot rarely survives past the
early waves and would pass every later assertion vacuously. `test:boss` drives
the game into each boss wave in turn and checks the fight resolves, the adds
stay capped, telegraph handles are returned to their pool, and — the one boss
bug that every functional test sails straight through — that the Colossus's
armour, its shutters and its core's glow all agree about whether the weak point
is open. `test:drops`
checks a wave can never yield more loot than its budget, that it yields close
to all of it, and that need actually decides the type. `test:money` checks the
two properties that keep the orb economy honest — that a kill's orbs add up to
exactly what the kill was worth, and that the 250-orb cap merges rather than
discards — along with the wave-clear sweep emptying the floor from anywhere in
the arena and Lodestone actually widening the radius.

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
js/pixelicons.js    24x24 pixel-art totem icons (generated - see tools/pixelart)
js/effects.js       particle pool, tracers, muzzle flash, shake
js/ui.js            HUD DOM bindings
js/sfx.js           WebAudio synth sounds
js/music.js         streaming soundtrack, lowpass, playback clock, beat
js/beatmap.js       the pre-analysed beat grid and its lookup
js/rig.js           the rave lighting rig: lights, beams, fixtures, looks, cues
js/lasers.js        the laser bank: four fan projectors raking across the room
js/leaderboard.js   local top-ten table, stored in localStorage
js/waves.js         wave difficulty config
js/upgrades.js      upgrade pool, totem roll, ammo purchase
js/money.js         money orbs: one Points pool, the magnet, the wave sweep
js/weapons.js       weapon stats + first-person models
js/totems.js        wave-end totems + ammo/reroll stations
js/utils.js         collision + misc helpers
test/smoke.mjs      headless smoke test
test/money.mjs      the orb economy conserves what a kill was worth
test/icons.mjs      every offer has a drawing and every drawing an offer
pixel-icon-sheet.html    all 66 icons at once, at full size and at arena range
pixel-icon-viewer.html   one icon at a time, in a mock column
enemy-viewer.html        the enemy roster as flat silhouettes
tools/pixelart/          the icon drawings + the shared lighting pass
tools/analyze_beats.py   offline beat analysis -> soundtrack.beats.json
tools/verify_beats.py    renders an excerpt with a click on every mapped beat
assets/audio/soundtrack.beats.json   the beat map (generated, committed)
```

## Beats

The lights and the crowd move to `assets/audio/soundtrack.beats.json`, which is
analysed offline rather than found live. Live detection can only ever fire
*after* a transient, it mistakes busy passages for beats, and its timing wanders
by tens of milliseconds - none of which is fixable from inside a frame loop.
The file is analysed once instead, with the whole three hours visible at a time.

The map is not a list of beat times. Inside one song the beats are very nearly
periodic, so each segment stores the *line* through them - an anchor and a
period - and the times are computed back out by arithmetic. Fitting over
hundreds of beats averages the detector's jitter away, and the whole soundtrack
comes to about 50 KB. Segments where a line did not fit keep their raw beat
times and are marked `quantized: false`; at the time of writing 91% of the
runtime is on a fitted grid, with a median jitter of 9 ms.

Live detection is still there, as the fallback for when the map is missing or
has nothing to say about the moment.

Regenerating it (needs `ffmpeg` on PATH):

```bash
python3 -m venv .venv-beat
.venv-beat/bin/pip install -r tools/requirements.txt
.venv-beat/bin/python tools/analyze_beats.py
```

The only test that means anything is listening to it. `verify_beats.py` renders
excerpts with a click on every mapped beat, a higher click on the downbeat:

```bash
.venv-beat/bin/python tools/verify_beats.py --spread 6 --dur 16 --out-dir /tmp
```
