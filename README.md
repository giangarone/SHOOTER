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
| WASD | Move. Double-tap W dashes, while BLINK DRIVE is the carried item |
| Shift | Sprint (hold). Costs stamina; you cannot aim or fire while running |
| C / Left Ctrl | Crouch (toggle). At a sprint it SLIDES instead |
| Mouse | Look (pointer lock) |
| Left click | Shoot (hold for auto) |
| Right click | Aim down the sights (hold) |
| V | Melee — one swing of the gun, one enemy, double the reward |
| R | Reload |
| Space | Jump. Press again in midair, with the Double Jump passive item |
| Q | Use the active item |
| E | Buy ammo / reroll at a station |
| Tab | Hold for the run summary: passive items owned, and the numbers behind the score |
| F | Toggle fullscreen (also on the start and pause screens) |
| Esc | Pause |

### Sprinting

Holding sprint puts the player in a second gear at 1.5x speed and empties a
stamina bar in about four seconds. It refills in six, after a beat's delay so
that tapping the key cannot top it up for free, and **running it to zero locks
the sprint out until a third of it is back** — without that, stuttering the key
at zero is faster than pacing it, which is a habit rather than a decision. The
bar goes red and beats while it is locked.

**Sprinting and the gun are exclusive.** Running drops the weapon out of the
sights, and firing drops the player out of the run — a fired round keeps them
walking for a third of a second, so a semi-automatic trigger cannot be tapped
at a sprint. That is the whole design: a run is time spent not shooting, which
makes it a retreat rather than a strictly better way to walk.

Four things refuse the button — an empty or locked bar, a held trigger, a shot
just fired, and standing still — and all four are conditions on the player
rather than on the key, so it can be held down through a whole fight without
ever being wrong. Sprinting follows the movement input in whatever direction it
points; forward-only is the conventional rule and the wrong one here, in a game
about backing away from a crowd.

On the pad, L3 **toggles**: one click starts the run and the player keeps
running until something stops them — they stand still, they fire, the bar
empties, or they click again. Clicking a stick is not something to hold down
for the length of a retreat. The keyboard's Shift stays a hold, because holding
a key is.

Sprinting also costs accuracy beyond the speed it is already charged for — the
weapon is not being carried in a firing grip at all — taking the cone to
roughly triple the standing spread. That penalty **bleeds off over 0.35s rather
than ending with the run**, which is what makes it a mechanic instead of a
light show: firing cancels sprinting, so a penalty that stopped when the sprint
did could never be the cone a bullet was actually fired through. Shooting out
of a run is inaccurate for a moment, and the crosshair says so on the way down.

The bar lives under the health bar in the VITALS box: the same segmented cell
mask at half the height and twice the cell count. **Its colour is the level and
nothing else** — cyan, and red below the amount that would let a run start,
which is the same line the lockout uses. It does not change with what the
player is doing; the same amount of stamina in two colours is a bar that needs
a second glance to read, which is the one thing a bar is for. The lockout is an
animation instead: it beats until the third that unlocks it is back.

### Crouching and sliding

One button, and what it does depends on whether you are already running.

Standing or walking it is a **toggle**: the camera drops to just over a metre,
you move at half speed, and you stay there until you press it again. It is a
posture, not a key to be held down through a firefight — and every shot, every
pickup test and every melee swing is taken from where your head actually is, so
a crouched player really is shooting from a crouch.

At a sprint it is a **slide**. You go down at about fifteen per cent above
sprint speed, the camera drops lower than a crouch, and the whole thing runs on
its own clock for three quarters of a second. Letting go of the button does
nothing: a slide is a committed move, the way a dash is, and it ends at exactly
the speed an ordinary walk would have been travelling at — so there is no frame
where handing control back is felt. It ends **standing**, not crouched. It is
paid for out of the sprint bar, faster than running is.

**Sprint, jump, and press crouch in the air, and you land in a slide.** In the
air there is no floor to slide along, so the press is buffered rather than
spent — hold it through the descent and the landing turns into a slide whenever
it comes, or tap it and the buffer carries it for a second, which is longer
than the jump. What earns the dive is the *takeoff*: letting go of sprint on
the way up drops you to walking pace instantly, so the game remembers whether
you were running the last time you had a floor rather than measuring how fast
you happen to be going. A jump with no run behind it is still the plain crouch
toggle it always was.

**You can jump at any point in a slide, and the jump keeps the slide's speed.**
That is the reason the two moves are worth having together: the slide is the
fast, low thing and the jump is how you spend it. The momentum is held as a
velocity with a weight over your own movement — the same arrangement the dash
uses — so it is kept whole while you are airborne, steers a little in the air,
and blends back into ordinary walking once you land.

### Melee

A swing of the gun itself: wound back, driven across and forward through the
target, then walked home. **One enemy per swing**, the nearest thing inside a
forty-degree cone in front of you, and the damage lands on the frame the weapon
is seen to arrive rather than on the frame the button went down.

**A melee kill pays double** — twice the score and twice the credits, on top of
whatever the combo chain is already worth. It is the shortest range in the game,
it has a cooldown, it hits one body, and you have to walk into something to use
it; the double is what pays for all four.

It used to sweep a sixty-degree arc, hit everything inside it, and draw a ring
on the floor to say where that arc had been. Both are gone. The ring was a
diagram of a hitbox rather than a picture of a swing, and a melee that cleared a
crowd made the gun the wrong answer to being surrounded.

### Aiming

Holding the aim button raises the gun: the field of view eases from 75 to 55
over 0.14s, the weapon slides to the centre of the screen and up onto the sight
line, and the shot cone collapses from 0.085 standing to 0.004 — from a spray that
scatters visibly past room range to effectively pinpoint. Letting go puts all
three back. Reloading takes the gun out of the aim, because the reload
animation drops it out of frame and two poses fighting over one model reads as
a stutter; it comes straight back up as the last round seats, with nothing to
re-press.

One number drives all of it — `player.aimT`, 0 at the hip and 1 with the gun
up. The camera, the viewmodel, the cone, the turn rate on both devices and the
crosshair are all read off it, so there is no second piece of state to keep in
step.

**The crosshair is the cone.** The gap between its arms is the spread the next
shot will actually be drawn from, in pixels, computed once in `_shotSpread()`
and used by both the raycast and the reticle. It opens when the player starts
running and shuts when the gun comes up, and it goes gold while aiming — at
that gap the arms are furniture and the bead in the middle is what is being
aimed. Movement costs accuracy from either pose, but a quarter as much down the
sights, so standing still and aiming is the most accurate thing in the game.

**A held trigger blooms the cone.** Every round adds to a 0..1 charge that
saturates about eight shots in, so a magazine emptied on full auto costs about
as much accuracy as walking does and then stops getting worse — there is a
worst case and you reach it. Letting go settles it back to the resting cone in
under a third of a second, linearly, because this is the one animation the
player reads as a promise about the next shot and an exponential tail leaves it
creeping shut long after it has stopped mattering.

Bloom is deliberately **not** recoil, and the two are kept apart. Recoil is the
muzzle climbing: it moves where the gun is pointed, you can see where it went,
and pulling back down answers it. Bloom leaves the point of aim exactly where
it was and widens the cone around it, and the only answer to it is to stop
firing. A weapon that only climbed could be mastered into a laser; one that
only bloomed would feel broken rather than hot.

The movement penalty scales continuously off live speed rather than switching
on past a threshold: standing, walking and sprinting are three different guns,
and a full sprint roughly doubles the standing cone. It used to be a flat
penalty past 6 m/s, which read as a switch — the walk was already over the
line, so the gun had two accuracies and one of them was unreachable while
playing.

### Reloading

The gun comes **up** and inward, rolls the magazine well toward the camera, the
spent magazine drops away and tumbles out of frame, a fresh one rises and seats
with a knock, and the weapon settles back as the last round lands. Four phases
on one clock, all of them fractions of the real reload — so a Speed Loader
build plays the same animation faster rather than a different one.

Up rather than down, and that is the whole reason the animation this replaced
could never have shown a magazine: the gun rides low and to the right, so a
reload that dipped it took the well straight off the bottom of the screen.
There was a dip-and-roll before, but nothing was ever removed and nothing
replaced it, so it read as a weapon swaying rather than as a magazine being
changed.

### DualSense

A PlayStation 5 controller is supported end to end — the arena, the shop, the
menus and the name entry. It is a hard gate: the pad is identified by its
vendor and product id, and anything else is ignored so that every glyph on
screen is one the player is actually holding.

| Button | Action |
| --- | --- |
| Left stick | Move. Analogue — a half push is a walk |
| L3 | Sprint (toggle) — press once, keep running until something stops you |
| Right stick | Look |
| R2 | Shoot |
| L2 | Aim down the sights (hold) |
| R1 | Use the active item |
| R3 | Melee — one swing of the gun, one enemy, double the reward |
| Cross | Jump. Press again in midair, with the Double Jump passive item |
| Square | Reload |
| Circle | Crouch (toggle). At a sprint it SLIDES instead |
| Triangle | Take a passive item or an item, buy, reroll |
| Touch pad | Hold for the run summary |
| Options | Pause, resume, and start a run from the menu |
| D-pad | Walk the menus; Cross confirms |

Circle is still BACK on every menu. It only means crouch inside a live arena,
where there is nothing to go back from — and TAKE is its own button rather than
being made contextual, because a crouch that silently failed to happen while
standing near a totem would be worse than a button one row further out.

**TAKE is on Triangle**, and for a while the prompt said Circle while the
binding was R1 — wrong on both counts, and the button the prompt named was the
one button that would not do it. Triangle is now the whole answer: it is the
free face button, it is where a "pick this up" prompt is looked for, and the
prompt and the binding are read from the same place (`_useLead`). R1 went to the
active item, because a button pressed in the middle of a firefight belongs on
the shoulder over the trigger finger. The run summary took the touch pad, which
is the one thing on the pad that is never pressed in a hurry.

On menus, up and down move the selection and Cross confirms. **Inside a
settings row, left and right change the value** rather than moving the
selection — a stepper is one stop with a value between its two keys, not two
separate buttons. Scoped to settings rows on purpose: everywhere else a
horizontal press means "move to the control beside this one", and a rule that
swallowed left and right globally would strand the selection on the first of
three buttons in a row.

Picking the pad up switches the interface with it: the prompts name buttons
instead of keys, the control sheet on the start screen becomes the one above,
and the menus grow a selection the D-pad walks. Touching the keyboard or moving
the mouse switches it straight back. Nothing has to be enabled and nothing is
remembered — the game follows the player's hands.

SETTINGS grows a CONTROLLER block once a pad has been seen: two sensitivities
on one eight-step scale — LOOK for the hip and AIM for the gun up, blended by
`aimT` rather than switched between — plus aim assist, vibration and inverted
look, all stored in localStorage. The mouse has no slider; it keeps its own
feel and is scaled by a fixed 0.6 while aiming, the standard zoom-relative
ratio that carries muscle memory through the zoom.

Aim assist is two things. **Slowdown** drops the stick's turn rate while the
reticle is already over a target, so the player's own correction is finest
exactly where it needs to be. **Magnetism** adds a gentle rotation toward the
target — scaled by how hard the player is pushing, so it helps a turn that is
already happening and does nothing at all for a player who has let go. Both
work inside an 8.6-degree cone, only on targets in line of sight, and both can
be turned off.

One thing a browser will not let the game do: a gamepad press is not a "user
gesture", so a player who never touches the mouse cannot start the audio
context. The start screen says so, and one click anywhere fixes it.

## Features

- First-person camera with pointer-lock mouse aiming
- One move speed, always on. There is no sprint key: holding a button to travel
  at the pace the game is tuned around was a tax rather than a decision, so the
  slower walk is gone and everyone moves at what used to be sprint speed.
  Accuracy still falls off while moving fast.
- Neon arena with walls, platforms, crates, and pillars (jumpable cover)
- Enemies navigate around cover with a shared flow field (`js/nav.js`) instead
  of grinding into the nearest pillar
- **Sixty enemy types, in ten themes of six** - one per role per theme, and every one of them built:
  one per role per theme. What exists now, by the theme it belongs to:
  **RUST** the machine theme, and the whole original roster kept together as
  one family - **Chasers** (close and swing), **Shooters** (ranged darts),
  **Tanks** (slow, heavy melee), **Bombers** (lobbed grenades), **Conduits**
  (no attack; buff everything near them) and **Harriers** (hold station five
  metres up and are armoured while they are there; they have to drop to head
  height to fire their burst, and that descent is the window to kill them in).
  **VOID**, the only theme that cannot
  be answered by POSITIONING - which is the answer to every other theme in the
  game. It takes the position instead: **Wraiths** (blink behind you),
  **Warps** (fire out of a RIFT rather than out of themselves, so there is
  never a line between them and you for cover to interrupt - the exit opens a
  beat early and beside you, and stepping off that point is the answer),
  **Monoliths** (a floating slab that walks THROUGH pillars, crates and decks
  in a dead straight line - the one enemy in the game you cannot break line of
  sight with, answerable only by distance and by killing it),
  **Singularities** (lob a well that does no damage at all and drags you back
  toward the spot you were leaving - harmless alone, and the reason the
  monolith catches somebody), **Hexers** (curse) and **Shades** (fear from the
  air). **PLAGUE**, the theme where CLEARING THE ROOM IS THE MISTAKE - everything in
  it is unfinished when it dies: **Splitters** (break into three), **Lesions**
  (burst fire whose rounds rot the floor wherever they LAND, hit or miss, so
  the shots you dodged are still on the ground behind you), **Husks** (burst
  into gas over wherever you chose to fight them), **Vitriols** (lingering
  poison clouds), **Carrions** (no attack; raise one body that dies near them,
  once each, at a fraction of its bar - killing the crowd in front of one is
  what feeds it) and **Bloatflies** (slow airborne sacks that burst into gas
  however they die, so shooting one out of the air over your own head is a
  decision rather than a free kill). **SOLAR**, the theme that attacks the
  INTERFACE - it takes the two things you aim with and gives one of them back
  pointed the wrong way: **Zealots** (detonate in a blinding white-out when
  they die, and only if you were close - the whole enemy is a decision about
  range), **Snipers** (long beam, paper-thin), **Aegises** (a mirror that
  REFLECTS what you fire into it, worn down by the COUNT of rounds that land
  rather than by their damage, so a shotgun shell breaks the whole plate in one
  pull and gets one round back for it), **Lenses** (burn a line across the
  floor toward you, slowly and forever - you outrun it, you do not dodge it),
  **Halos** (no attack; inside their field your crosshair and hit markers are
  simply gone) and **Shrikes** (circle, tell, dive). **BRINE**, the theme of things that WILL NOT LET GO - every other theme asks you to be
  somewhere else, and this one takes being somewhere else away: **Gulpers**
  (latch on and RIDE you, draining until you shake them off with a melee swing
  or a dash - the one enemy in the game that cannot be answered with the gun,
  because it is at the one position a first-person crosshair can never point
  at), **Anglers** (hang at the back of the room behind a lure and throw slow
  homing bubbles that CAN BE SHOT OUT OF THE AIR - the only enemy round in the
  game that is itself a target, and what it costs you is the bullet),
  **Barnacles** (root themselves and drag you in on a current, so the plates
  are facing you whether you wanted to be in front of them or not - the only
  brute in the game that cover is the counter to), **Vents** (erupt a scalding
  column that is REAL GEOMETRY for as long as it stands - the only artillery
  that leaves cover behind it, and whether that cover is yours or theirs
  depends entirely on where you were going), **Howlers** (the fear scream,
  re-themed as sonar) and **Drifters** (rain a curtain of ink that costs no
  health at all and takes your SIGHT - the only enemy in the game that attacks
  information). **TEMPEST**, the only theme whose threats are LINES between two things rather than areas around one -
  dangerous in the middle and harmless at both ends: **Arclings** (each holds a
  live wire to the nearest other arcling, so a pair of them is a fence across
  the room and the answer is to kill ONE and cut it), **Coils** (charge a bolt
  for three quarters of a second and then fire it INSTANTLY - there is nothing
  in the air to dodge, and the only counter is to put something solid between
  you and it before the charge ends, which makes it the one ranged enemy that
  cover beats and movement does not), **Dynamos** (store what you shoot them
  with and dump it back out as a shockwave every time the meter fills, so
  emptying a magazine into one at close range is the worst thing you can do and
  the same magazine from eight metres out is free), **Stormcallers** (mark the
  floor and strike it, and what LANDS is only half of it - the patch left
  behind goes on being lethal for three seconds, so the answer is to give the
  position up rather than to step out and step back), **Capacitors** (no
  attack; plate everything near them with a single-hit shield that outlives the
  capacitor itself - a DPS tax rather than the warden's wall) and **Squalls**
  (no attack and no damage of any kind; they come over the top and SHOVE you
  off the deck you climbed to and into whatever else the wave has on the
  floor). **EMBER**, and the only currency it spends is FLOOR - not one of its six does
  much of anything on contact: **Cinders** (their touch sets you burning),
  **Flares** (lob a shell that bursts into a fan of three fires pointing AWAY
  from them, so backing off down the line it was thrown along walks you through
  all of it), **Magmas** (a brute that burns a trail of lava behind it - do not
  circle it twice), **Kilns** (plant themselves and turn a bar of flame around
  the arena like a lighthouse, one step per half-beat, so it is the one enemy
  you can hear coming), **Bellows** (no attack at all; while one lives every
  EMBER enemy near it burns you on contact as well as hitting you) and
  **Ashwings** (fly straight runs across the arena laying a line of fire the
  whole way, and cannot steer once committed - the rear-up before the run is
  the whole counterplay).
  **RIME**, the mirror of
  EMBER: fire spends the FLOOR and cold spends the PLAYER - **Rimes** (frost
  trail; it takes your legs, not your health), **Shards** (fire one lance at a
  target who is fine and a three-round burst at one who is already chilled, so
  the rest of the theme is what loads their gun), **Glaciers** (the top sixty
  per cent of the bar is ice and ice takes less than half of what you put into
  it - and the crust SHATTERS into a nova of frost around wherever you chose to
  finish the job), **Hailers** (lob a cluster that lands as a gapped RING
  around you rather than a patch on you - somewhere not to CROSS rather than
  somewhere not to stand), **Hoarfrosts** (no attack; stand inside the ring
  they draw on the floor and everything you fire hits for forty per cent less)
  and **Sleets** (park directly over your head and pour cold onto the spot you
  are standing on - the only thing they cost is standing still). **VERDANT**, the theme of
  things that ARRIVE LATE - nothing in it happens at the moment it is thrown:
  **Thornlings** (charge in a straight line they cannot steer out of, overshoot
  and have to come back round - you are never running from one, you are
  stepping off its line), **Sporeguns** (lob seeds that do nothing at all when
  they land and sprout into a burst of thorns two seconds later, with the
  circle filling on the floor the whole time), **Bramblehides** (standing next
  to one costs health whether or not it is swinging - the thorns reach further
  than the swing does, so there is a band where they are the only thing
  happening), **Blights** (lingering pools that make standing still cost
  health), **Heartwoods** (no attack; they mend the wave behind you, which is
  the one thing in the game a player cannot see being taken away from them) and
  **Mothcaps** (the only LOW flier, drifting through the crowd at head height
  trailing a cloud of spores that outlives it - kill one overhead and the cloud
  is left exactly where you are standing). **STRATA**, the only theme
  that fights with the ROOM - a corner is the worst place in the game to be in
  a STRATA wave and the open middle is the best, which is the reverse of every
  other theme: **Screes** (curl up and roll, and CAROM OFF THE WALLS rather
  than stopping at them - not a charge aimed at you so much as a hazard let
  loose in the room, and it shoves rather than hurts), **Slingers** (throw flat
  stones that bounce ONCE off a wall - harmless in the open, throwing two
  stones with one arm while you are backed into a corner), **Bulwarks** (carry
  a small buckler that blocks 80% of anything landing on it - shoot the head,
  the legs or the flanks, all of which take full damage, or burn them, since
  damage over time ignores the plate entirely), **Geodes** (come up through the
  floor, and not where you are - where you have BEEN: they remember the last
  three places you stood and erupt under all of them at once, so a wide steady
  orbit puts three spikes on the arc you are about to come round to),
  **Wardens** (no attack; project a dome that makes every enemy inside it
  invincible and stone-grey until you kill the warden itself) and **Gargoyles**
  (sit in the truss doing nothing, armoured, and will hold that perch for the
  whole wave if you never walk underneath - the only genuinely OPTIONAL enemy
  in the game, and a decision about ammunition rather than about danger. Walk
  under one and it comes down like a dropped block, and then it is on the floor
  and unarmoured). **BRINE** the deep - **Howlers** (a scream that takes your
  trigger). **PLAGUE** rot - **Splitters** (break into three on death),
  **Husks** (burst into gas over their own corpse) and **Vitriols** (a cloud
  that keeps costing after you are out of it). **SOLAR** radiance - **Snipers**
  (long beam, paper-thin) and **Shrikes** (circle out of reach, then dive at
  the patch of floor you were standing on - miss or hit, they spend the next
  second and a half climbing slowly away from you, which is the shot).
  **TEMPEST** has none of its own yet. A slot whose enemy is not built borrows
  RUST's for that role, so the whole rotation is playable while the roster is
  being made - `npm run test:themes` prints what is still borrowed.
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
- **A boss every five waves, and which one is dealt rather than fixed.** Each
  of the ten themes owns a boss, and the block a theme lands in is where its
  boss is fought - so wave 5 is Colossus in one run and the Herald in the next.
  All ten exist. **THE DROWNED CHOIR**, BRINE's, is three bodies sharing one
  health bar: damage on any of them comes off the same pool, so the bar falls
  whichever one is shot - what changes is what happens when one DIES. One of
  the three is always SINGING, lit and loud, and the other two are silent. Kill
  the singer and the choir carries on a body short; kill a silent one and the
  survivors are FREED - faster, and attacking twice as often - for the rest of
  the fight. The singer rotates on its own clock, so the correct target keeps
  moving. **THE CONDUCTOR**, TEMPEST's, is the only fight in the game whose
  clock is the music: it counts bars on the beat, drives a pylon into the floor
  on each of the first three and DISCHARGES along every line it has on the
  fourth - boss to pylon and pylon to pylon, so three pylons is six live wires
  cutting the room into wedges. The fight is played between the bars, and a
  player who clears all three takes a discharge with nothing in it.
  **THE OVERGROWTH**, VERDANT's, is the only
  thing in the game that never takes a step: rooted where it grew, so the
  player can always walk away and the pressure has to come from the arena
  closing in instead - creepers of thorns marching outward along the ground
  toward wherever they are standing. And the player chooses its damage window,
  which no other boss allows: its canopy is shut and armoured at any range and
  OPENS when they come inside eight metres, which is exactly where it rings
  itself with thorns. There is no clock on it at all - the whole fight is that
  one trade, priced in seconds. **THE PALE CROWN**, RIME's, is the one fight in
  the rotation that is not about the boss: it spends most of itself inside a
  shell that takes NOTHING at all, and the way in is never the boss - three
  anchors go into the floor with the shell, and breaking all three is what
  brings it down. So the fight alternates between two completely different
  jobs, and the shell has no clock on it: a player who finds the anchors fast
  is paid in a longer window rather than the same window later. Three shells,
  each with the arena a little more frozen than the last. The **FORGE-TYRANT**,
  EMBER's, is the mirror of
  the Colossus: it HEATS UP as it fights, gaining an attack at each third of
  the bar - a sweeping bar of flame on the beat, then a wall of fire at a fixed
  radius with one gap in it - and when the bar fills it has to stop and VENT,
  which is when its chest opens and it takes full damage. The window is the
  boss's own decision rather than a metronome, and it is not free: while it is
  open it radiates fire outward in a growing ring, so the player has to be
  close enough to shoot and far enough not to burn, and the ring is growing the
  whole time. Then the **Colossus** (armoured but for a red core in
  its chest that opens on a rhythm, a telegraphed charge that knocks it out
  cold against a wall, and turrets it throws at the ground near you - they arc
  in under a landing ring, bolt themselves down and start shooting, three on
  the floor at most, and each one is a few rounds to destroy), **Siege**
  (telegraphed mortar barrages and a charge of its own), **Schism** (fires eight
  rounds at once in every direction after a wind-up, and splits three times
  over - two halves, then four, then eight, so it gets more dangerous as it
  comes apart), **Maw** (drags you in and rolls rings you have to jump) and the
  **Herald** (blinks, volleys, and enrages under 30%). Regular enemies keep
  arriving throughout; killing the boss ends the wave and pays out. It does NOT
  refill your health or ammo - the payout is large and the stations are right
  there, so coming out of a boss in trouble is a real state to be in and what
  you spend the money on is a real decision.
- **Wave composition is fixed; which theme fills it is dealt.** Every wave has
  the same number of enemies and the same mix of ROLES in every run - that is
  what keeps two runs comparable - but the run is TEN BLOCKS OF FIVE WAVES and
  each block is one THEME. A theme is six enemies, one per role, and a boss;
  the ten are shuffled into a deck at the start of a run, so waves 1-50 meet
  each of them exactly once and one run opens on EMBER where the next opens on
  BRINE. Past fifty the deck is re-dealt rather than repeated.
- **A theme has no wave, so difficulty cannot come from it.** It comes from the
  per-wave health, speed and damage multipliers alone, which are pure functions
  of the wave number - a theme dealt into waves 26-30 arrives with the same
  enemies as one dealt into 1-5 and five times the health. The price is that
  every theme's stat blocks have to be normalised against every other theme's,
  role by role: ten rushers that are interchangeable, ten brutes that are
  interchangeable. `test/themes.mjs` holds the envelope each role has to sit
  in, because nobody can hold sixty stat blocks in their head.
- **Each block teaches itself.** The per-type unlock table is gone - a wave gate
  on EMBER's rusher means nothing when EMBER may be wave 1 or wave 41 - and
  what it did is done by the block instead: a block opens on its theme's line
  troops and widens to all six roles by its fourth wave, then the boss. The
  first four waves of a RUN keep the old hand-authored tutorial shape on top of
  that, whatever theme was dealt into them.
- **Pickups drop off the enemies you kill**, not from timers around the map,
  and every kill rolls for them independently. There is no per-wave budget:
  a wave used to carry a fixed number of pickups spread evenly across its
  kills, which made the loot a constant and the drops a schedule you learned
  to wait out. Now roughly one kill in seven drops something, most of it ammo,
  and the buffs are genuinely rare - a damage or fire-rate boost is about one
  kill in seventy, a magnet one in eighty, a shield one in a hundred and
  twenty. Only health and ammo scale with need: their chances climb as those
  bars empty, steeply near empty, so a player in trouble gets more of what
  keeps them alive and never more damage. Bosses still shed a pickup at each
  quarter of their health, and if you are starving with no kills coming, one
  is placed near you so the fight cannot dead-end.
- **Six pickups, each a pixel-art plate** wearing the same 24x24 drawing its
  HUD chip does - one authored icon, rendered as extruded voxels in the world
  and flat to a canvas in the HUD, so the thing you picked up and the thing
  telling you it is active are visibly the same object. They turn to face you
  rather than spinning: a flat plate on a spin is edge-on twice a revolution.
  The newest of them is the **MAGNET**, which sweeps every money orb on the
  floor to you at once, wherever they are.
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
- Particle bursts for hits and kills, hit markers, damage vignette, screen shake
- Reloading shows twice over: the gun drops out of frame and rolls through the
  reload, and a ring sweeps round the crosshair as it completes
- WebAudio synth SFX (no audio assets)
- Looping soundtrack that ducks behind a lowpass filter whenever you are not
  fighting - picking a passive item at the totems, paused, dead, or on the menu.
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
  warm and slow while you pick a passive item, and combat starting again is the
  drop.
- Optional verticality: speaker stack to wall ledge to catwalk, each hop inside
  the jump arc. The decks are suspended above head height, so enemies walk
  underneath them and enemy fire passes straight through - the high ground buys
  sightlines and costs you cover.
- HUD: health, ammo, score, wave + enemies remaining
- Start, pause, and game-over screens with restart. The pause screen also has
  **EXIT**, which asks first: the confirmation is the one screen in the cabinet
  where the big lit button is the safe answer and the outlined one ends the
  run, so a player mashing the obvious button keeps playing. Nothing is banked
  by leaving — a score reaches the board by dying with it.
- **Local leaderboard.** The ten best runs, ranked by score with the wave
  reached as the tiebreak, shown on the title screen and after a death. A run
  that places asks for a name, arcade style; restarting without pressing SAVE
  banks it anyway. Kept in localStorage, so the board is per-browser: the game
  is client-side javascript, and a shared board it could not verify would be
  forgeable from the console in seconds. Runs are no longer guaranteed the
  same loot - drops are rolled per kill now - but the RATES are pinned down,
  in `test/drops.mjs`. 

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

The pool is 132 upgrades and **the draw is flat** - every one of them has exactly
the same chance of appearing. It used to be weighted three ways, with rares
locked out before wave 2 and cursed before wave 3, and two things were wrong
with that: the player could not see it (the totem stopped printing a rarity line
long ago), and the labels had stopped describing the pool anyway, because nearly
every passive item added since the pool doubled got filed `rare` or `cursed` on
feel. A specific upgrade turns up in roughly 2% of totem sets, so a run sees a
slice of the pool rather than all of it - that is the point, but it means a new
upgrade only matters if it is worth taking on sight, without a partner card.

**A reroll never shows you the same upgrade twice.** `TotemArea.shopSeen` holds
everything the current shop has offered across all of its sets, and `rollTotems`
draws around it; it is emptied when a fresh shop opens, not when a set is
rerolled. Paying an escalating price for the answer the console already gave is
the moment a reroll stops feeling like a purchase.

### The critical hit, as a build

Every run has had a crit since its first magazine - 5% for 1.5x, in
`DEFAULT_MODS`, non-zero on purpose so the yellow damage number is something the
player has already seen by the time anything offers to change it. Six entries
now take it somewhere, and no two of them are the same pick:

| Upgrade | Effect |
| --- | --- |
| DEADEYE | +15% crit chance |
| MARKSMAN | +25% crit chance |
| DEAD CENTER | Crits deal 3x, crit chance halved |
| ASSASSIN | The first hit on any enemy always crits |
| TELLTALE | Every 3rd hit on one enemy crits |
| FATAL RESERVE | The last 5 rounds of every magazine always crit |
| SWEET SPOT | *(active item)* every shot crits for 8s, 60 charge |

FATAL RESERVE is the only one of them that is not a probability: the other five
change the odds, and this names five rounds and guarantees them. It reads
`Player.magAtShot` - the count the TRIGGER saw, snapshotted before the pull was
billed - rather than the live magazine, because by the time a pellet lands the
count has already moved, by three under TRIPLE TAP and by nothing at all when
BELT FEED took the round off the reserve instead.

DEADEYE and MARKSMAN raise the dice. DEAD CENTER trades the dice for the payout,
which is the same expected damage on paper and a completely different feel in
the hand. ASSASSIN and TELLTALE do not touch the dice at all - they make a crit
something the player can PLAN, off the target's own history.

**They are resolved at the hit, not at the trigger.** `Player.rollCrit()` still
throws one die per trigger pull beside Cursed Ammo and Devil's Gamble, exactly
as it always did - but ASSASSIN and TELLTALE ask about the BODY, and at the
moment the trigger is pulled there is no body yet. The roll is carried down to
the landing site and `Game._resolveHit` turns it into a per-enemy answer;
`Game._hitMult` then folds the multiplier in beside the two range passive items.
The per-enemy history (`everHit`, `hitTally`) lives on the Enemy and dies with
it, so nothing has to be cleaned up.

The one thing that is easy to get wrong and hard to see is a **shotgun**. Nine
pellets into one chest is ONE hit as far as the tally and the freshness are
concerned, so `_resolveHit` caches its answer per trigger pull in `_shotCrit`
beside the `_shotHits` set `_landShot` already keeps. Without it a scattergun
ticks the counter eight times a shell and TELLTALE reads as a permanent crit -
which looks like good luck, not like a bug, for a long time.

### Range, and what a hit taken is worth

LONGSHOT ramps damage to +30% at 40m (a ramp, not a threshold: a cliff the
player cannot see would show up as the damage number jumping as they backed over
an invisible line) and POINT BLANK pays a flat +30% inside 5m, which is a hard
edge because it is a LINE the player either stepped over or did not - and five
metres is the distance every melee reach in the game has already taught them.

BLOOD MONEY pays credits per point of damage TAKEN and ADRENALINE gives +4%
damage a hit up to +40%, reset at every wave boundary. Both hook `_noteDamage`,
which is the only place that sees what actually LANDED - after the dodge, the
ward, curse and every multiplier - so they cover the hazard path for free and
neither is farmable: the rate is a fraction of what the same seconds spent
killing would pay, and the ramp is bounded by a wave the player does not choose.

### The two companions

Nothing else the player owns is alive. A turret is furniture with a cooldown and
the bees are a cloud on a timer; MAGPIE and LAMPREY are around for the whole run,
they decide where to go by themselves, and the player will watch them. They live
in `js/companions.js` and they are **not deployables** - `_clearHazards` sweeps
that list at every wave end, and a pet the player had to bury once a minute
would be a different item. They are created and destroyed off `mods` rather than
off a pick (`Game._syncCompanions`), which is what makes them work in versus for
nothing: a handover replays the incoming player's build, so the frame after a
swap the pets swap with it.

MAGPIE walks the floor picking up credit orbs, through the same `onCollect` the
player's own magnet pays through - so the credits, the item-charge slice and
BLOOD FROM STONE all still happen once, in `_collectOrb`. It is deliberately not
a wider magnet: LODESTONE already grows the circle around the player, and being
somewhere else is the only thing a bird can offer that a bigger circle cannot.

LAMPREY holds station about 2.5m from the player and goes for whatever comes
close, biting for 10 **on the downbeat** and healing 2 HP when it lands the last
hit. `Music.pulse` is a half-beat edge - it is what the sentry guns and every
fire tick ride - so the leech gates on `pulseWhole` as well, the same way
poison's one-tick-a-beat does: it chews on the kick drum, at a rate you can
count without reading a damage number. It **parks** rather than orbiting: the station is a point in the world
and it is only re-picked once the player has walked out of the band it is
comfortable in, because something circling continuously in the near periphery is
exactly what the eye keeps looking at, and the player has a fight to watch.

### The rest

| Upgrade | Effect |
| --- | --- |
| BLOOD MONEY | $2 per point of damage taken, per stack |
| RABBIT'S FOOT | +15% on every drop chance, per stack |
| CROUCHFIRE | +20% fire rate while crouched, per stack |
| LONGSHOT | Up to +30% damage, ramped to 40m |
| POINT BLANK | +30% damage within 5m |
| ADRENALINE | +4% damage per hit taken, to +40%, per wave |
| BLOODSPORT | Melee kills heal 3 HP, per stack |
| WAR CHEST | +1 damage per $1,000 on the balance |
| TWIN CELL | Hold 2 active-item charges |
| MAGPIE | A bird that collects credits |
| LAMPREY | A leech that guards you |

### Posture, and the bottom of the magazine

Nine entries that are never simply true. Every one asks the player to be doing
something particular at that instant - holding a nearly empty magazine,
reloading a nearly full one, aiming, crouched, unhurt - and pays only then. A
pool made entirely of flat multipliers is one where the build is decided at the
totem and the fight is arithmetic.

| Upgrade | Effect |
| --- | --- |
| FATAL RESERVE | The last 5 rounds of every magazine always crit |
| PRIMED MAG | Reloading throws the spent magazine as a grenade: 20 damage per round left in it, and those rounds are spent |
| BAILIFF | Using an active item refunds 20% of its charge cost |
| PACE CAR | At full health, +10% fire rate and +10% move speed |
| CERAMIC INSERT | No single hit can take more than 25% of your max HP |
| OVERDRAW | Healing past max HP becomes item charge, 1 per 5 HP spilled |
| LEAD BALLOON | +25% damage, and you cannot jump |
| CHEEKWELD | Take 20% less damage while aiming |
| GROUNDHOG | While crouched, take 20% less damage and reload 20% faster |

PRIMED MAG reads the count taken when the reload STARTED
(`Player.magOnReload`), not when it lands - by then the magazine has been topped
up and the passive item would throw a full one every time. A gun run dry throws
nothing, which is the whole decision: it pays for the tactical reload every
shooter teaches and none of them has ever rewarded. The bomb cannot hurt the
player, unlike SHORT FUSE's, because a reload is a button pressed for a
different reason.

**It is the one build whose reload wastes ammunition, and that is the price.**
An ordinary reload TOPS the magazine up - the rounds in it are kept and only the
difference comes off the reserve, so 20/30 costs ten. A thrown magazine is not
there to be topped up, so the fresh one fills from empty and the same reload
costs thirty. Without that the pick was free damage: fire one round, reload, and
twenty-nine rounds went downrange for 580 damage at a cost of ONE round off the
reserve, three hundred times a run. Paying the full magazine makes the bomb a
trade, and it puts PRIMED MAG in direct tension with FATAL RESERVE - one wants
you to reload early and fat, the other to fire down to the last five.

CERAMIC INSERT is a ceiling, not a reduction, and the difference is the pick:
damage reduction is worth the same against a chaser's scratch as against a
boss's slam, and a cap is worth nothing against the scratch and everything
against the slam. It sits at the end of `Player.takeDamage`, after curse and
before the shield, so everything that multiplies incoming damage has already had
its say and none of it can push a hit past the cap.

OVERDRAW is why `Player.heal()` exists at all. There were fourteen copies of
`health = Math.min(maxHealth, health + x)` across five files and every one of
them silently threw the remainder away; that was fine until something wanted the
remainder. Healing is one sink now, and the crate is the one caller that passes
a different ceiling (`maxHealth + 25`) because a pickup walked to across a live
arena has always been allowed to overfill the bar.

PACE CAR is BERSERKER's exact opposite - one pays on health missing and is worth
nothing until the run is going badly, the other is gone the instant anything at
all lands. Both halves come off one getter (`Player.paceMult`), so the gun and
the legs can never disagree about whether the bar is full.

TWIN CELL is a second charge, not a second slot - the slot is still one deep and
the item in it is still the run's answer to one problem. It is one number with a
doubled ceiling rather than a second field: `itemReady` is unchanged because one
charge is still one charge, spending SUBTRACTS a charge instead of zeroing, and
the HUD's second bar is a second reading of the same number
(`Player.itemChargeFrac(0)` and `(1)`) drawn as a pale overlay in the same cells.

Eleven other entries came in from a feature that no longer exists. A second row used
to stand on the far side of the arena selling passive items for MAX HEALTH - a
price that could never be earned back - and it is now the active item row. Its
stock was folded into this pool, and the ones that did not already carry a real
cost were given one, because a free pick has to weigh itself. Only EXECUTIONER
still charges health, and it charges it as
`mods.maxHpFlat` rather than as a payment, because `rebuildMods()` replays the
owned list from fresh defaults after every pick and a price paid once could not
survive that.

### The second pool

Forty-one more max-1 picks, and what holds them together is that almost every
one of them names a **moment** rather than a number: the first round out of a
magazine, the second before you fired, the fourth shot, the beat, the frame you
were hit on, the wave boundary. The pool above is mostly "how much"; this is
mostly "when", which is the axis a player can actually play around once they
have learnt it.

Every one of them weighs itself. A free upgrade in a flat draw is a totem the
player never has to think at, so the ones that are simply strong - HEAVY HAND,
BLOOD OATH, BONE MARROW, GRAY MATTER - are sold for something the build actually
wanted, and the ones that are conditional are allowed to be unconditionally good
inside their condition.

**Rate of fire**

| Upgrade | Effect |
| --- | --- |
| MACHINE SPIRIT | +5% fire rate per second of held trigger, to +50%. Let go and it is gone |
| OVERWOUND | +40% fire rate, -30% reload speed |
| HIPSHOT | 2x fire rate from the hip, 0.5x down the sights |
| METRONOME | The trigger fires on the beat and nowhere else, at 4x damage. The fire rate stat does nothing |
| ECHO CHAMBER | Every 4th shot fires a duplicate at half damage, off no ammunition |

METRONOME is the player joining the machinery fire, poison and every sentry gun
already ride. `Music.pulse` is a half-beat edge and `pulseWhole` separates the
downbeat from the upbeat; the gun gates on the whole beat, so `fireCd` stops
being what the trigger asks and `Player.beatShot` - raised on the pulse edge in
the frame loop, dropped the moment the trigger is released - takes its place.
Releasing the trigger is what makes the first shot of a burst wait for the NEXT
beat rather than leaving on one that went by during a reload.

**Damage**

| Upgrade | Effect |
| --- | --- |
| CANNONADE | The first shot of every magazine deals 10x |
| HEAVY HAND | +60% damage, -40% fire rate |
| WEAK POINT | 3 hits mark an enemy; marked enemies take +50% from every source |
| OVERKILL | Damage past a kill carries to the nearest enemy within 5m |
| BLOOD OATH | +100% damage, -5 max HP at every wave start, stopping at 50 max |
| SHARED PAIN | All damage dealt is split evenly over every living enemy |
| GRAY MATTER | +10 max HP and +10% damage, fire rate and move speed. The world goes grey |
| SACRIFICE | +10% damage and fire rate, and one random passive item is destroyed |
| BOTTOM FEEDER | Reloading from empty: +20% damage for 5s |

SHARED PAIN cannot be a multiplier on a hit, because it is a decision that the
hit is not landing where it was aimed. `Enemy.takeDamage` is the one place hp
ever moves, so it takes a module-level hook (`setShareHook`) that main.js puts up
and takes down with the pick - a run without it pays one null test - and the
hook deals an even slice to every living body through that same method, with a
recursion guard up. Each share still goes through its own armour, ward, freeze
vulnerability and mark, which is what makes the pick read correctly against
every defensive mechanic the roster has.

WEAK POINT keeps its own tally (`Enemy.markTally`) rather than sharing
TELLTALE's: that one counts whether or not the hit was already a crit, so a
build holding both would mark bodies on the wrong hit. The mark is permanent,
dies with the body, and is worth a flat 1.5x applied last in `takeDamage` -
after armour, after the Conduit's resistance - because the card says "from all
sources".

SACRIFICE is the only entry in either pool that changes the LIST rather than the
stats built from it, so the removal happens once in `Player.takeUpgrade` and not
in an `apply()`. An `apply()` that dropped an upgrade would drop another one
every time the player took anything at all, because `rebuildMods()` replays the
whole owned list from fresh defaults after every pick.

**Ammunition and money**

| Upgrade | Effect |
| --- | --- |
| PAYDAY | +$100 per kill, -10% damage |
| AMMO SURPLUS | Ammo pickups grant 30% more rounds |
| HIGH STAKES | Rerolls and box rolls cost nothing 90% of the time; 10% they drop you to 1 HP and 1 ammo |
| BRUISE ROUNDS | Taking damage fills the magazine with free rounds |
| CHAIN FEED | Killing with the last round of a magazine reloads it instantly |
| BELT FED DREAM | No magazine and no reload. Every shot takes 2 rounds off the reserve |
| CASH CANNON | Out of ammunition, the gun keeps firing at $10 a shot |
| LAST BREATH | Dropping below 20 HP refills the ammo reserve, once per wave |
| AUTO-LOOT | The wave-clear sweep never switches off, and every credit is worth half |
| CRITICAL OVERFLOW | Crits deal +50% and refund a round; non-crits cost one more |

HIGH STAKES is one method (`Game._gambleTill`) asked by both tills, because the
card makes one promise about two different price ladders and a second copy is
exactly where the odds would quietly drift apart. The affordability check goes
with the price: a player carrying it can always pull the lever, which is what
makes the tenth pull a risk rather than a discount they were saving up for.

PAYDAY's hundred is dropped as orbs like every other credit in the game rather
than banked straight into the balance - the money economy is a thing on the
FLOOR, and a payout that skipped the floor would be the one source the magnet,
LODESTONE and AUTO-LOOT never see.

**Staying alive**

| Upgrade | Effect |
| --- | --- |
| IRON LUNG | Immune to every status effect, -30% healing |
| LIFELINE | At 25 HP or below, regenerate 5 HP/s |
| BONE MARROW | +100 max health, -50% healing |
| HEALTHY CORE | Regenerate 1 HP/s always, and nothing else may heal you at all |
| EMERGENCY RATIONS | Every wave starts at exactly 50 HP. +50% healing |
| FINAL DOSE | Reloading with exactly 1 round left heals 5 HP |
| AIM OR BLEED | Hits heal 1 HP, misses cost 1 HP, never below 1 |
| KILL STREAK | 20 kills without taking damage: heal 5 HP and +10 reserve |
| VITAL TRIGGER | Using the active item also heals 5 HP |
| TIRELESS | Unlimited stamina |

Five of these move healing, which is why `mods.healMult` and `mods.healBlock`
are read inside `Player.heal` - the one place health has gone up since OVERDRAW
made fourteen scattered `Math.min` calls wrong. A heal added anywhere later is
covered by all five without anyone having to remember it. HEALTHY CORE's own
trickle writes `health` directly, because `heal()` is exactly what that pick
switches off.

**What happens around you**

| Upgrade | Effect |
| --- | --- |
| PANIC TURRET | Taking damage drops a turret for 10s, up to 5 at once |
| DELAYED FUSE | Shots stick and explode 2 seconds later for their own damage over a small area. A round in a body that dies first is lost with it |
| FEAR AURA | Enemies within 5m flee for 5s, once every 30s each |
| STATUS CONDUIT | Status effects on you are applied to enemies within 5m |

FEAR AURA's per-enemy lockout is the whole item. Without it an enemy runs for
five seconds, walks back in and is made to run again, forever - which is not a
passive item, it is a wall the player carries around. `Enemy.fearAuraAt` dies
with the body, so a fresh spawn is never inside someone else's cooldown.

DELAYED FUSE holds the BODY, not the point: a fuse that went off where the shot
landed would be a mine on the floor two seconds behind a moving enemy. The
radius is snapshotted with the round, because a fuse outlives its trigger pull
by long enough for a versus handover to replace the build underneath it.

**The round dies with the body it is stuck in.** It is not a mine and it is not
a shot in the air - it is lodged in an enemy, so when that enemy comes apart the
round goes with it and the blast is never owed. Anything else leaves the arena
full of invisible delayed explosions going off at corpses that are no longer
there, which is a mechanic the player cannot see, predict or play around; and
because a crowded wave kills most bodies before their fuses are due, it would
end in a minute of unattributable blasts. What is fired into a dying enemy is
spent, exactly as it is for a shot that overkills one. The test is a single
`f.en.dead` in the fuse sweep rather than a hook in the kill sweep, because
`dead` is set the instant the killing blow lands whatever dealt it - a bullet, a
blast, a poison tick, a turret, another fuse.

**It is also the only shot in the game that lands and produces no feedback**,
which without a marker reads as a broken gun rather than as a fuse. Every stuck
round wears a **pip** - a small additive sprite from a pool in `js/effects.js`,
acquired and released like a telegraph mark - pinned at the height the pellet
actually landed at and pulled a body radius toward the camera so it sits on the
near surface rather than inside the model. It still depth-tests: a fuse behind a
pillar must not glow through it, or the dot stops being a thing in the world and
starts being a wallhack the pick never promised.

The dot **blinks faster and grows** as the round comes due - three blinks a
second when it lands, twelve as it goes off - because that is the one cadence
everybody already reads as "about to happen", and it works out of the corner of
an eye in a way a shrinking bar cannot. The blip that goes with it counts the
**soonest fuse and nothing else**: a held trigger keeps a dozen fuses running on
a dozen clocks, and one voice per blink is a swarm of wasps rather than a count -
the soonest one is also the one the player needs, because it is the next thing
that is going to happen.

STATUS CONDUIT translates four of the six player statuses. WEAKNESS and CURSE
are both about what the PLAYER'S numbers do and there is nothing on an enemy for
them to be, so they are simply absent - inventing an enemy-side curse to make
the sentence come out even would be a second mechanic nobody asked for.

**The crit family, three more**

| Upgrade | Effect |
| --- | --- |
| TRUE STRIKE | +10% crit damage; 2 seconds off the trigger loads 4 guaranteed crits |
| DOMINO | A crit gives the next shot +30% crit chance |
| LUCKY STREAK | +5% crit chance per consecutive hit on the same enemy; a miss or a switch resets it |

All three are read in `Player.rollCrit`, which is still rolled once per trigger
pull and never per pellet. LUCKY STREAK's counter is fed from `Game.shoot` off
the first entry in `_shotHits` - one trigger pull is one entry however many
pellets landed, which is exactly the grain the streak counts in.

### Active items

**One slot, one button, no menu.** Everything else a run collects is a number
folded into the stat block that then applies itself forever without being asked.
An active item does nothing until it is fired, and firing it is a decision made
at a particular second of a particular fight. `Q` on the keyboard, `L1` on the
pad.

Forty of them, in five groups by what they actually reach for.

**Instant, on the room:**

| Item | Effect | Charge |
| --- | --- | --- |
| TRAUMA KIT | Heal 25 HP, no overheal | 50 |
| CRYO PULSE | Freeze every enemy for 5s | 40 |
| WHITE CELL | Clear every negative effect, then 2s immune | 20 |
| BRIMSTONE | Burn all enemies for 3s | 40 |
| JACOB'S LADDER | Lightning arcs through the 5 nearest, 2x bullet damage each | 40 |
| LAST RITES | Execute everything under 30% health, bosses included | 40 |
| TECTONIC | Hurl everything within 9m back, for bullet damage | 20 |
| MARTYR | 20x bullet damage over 16m. Leaves you at 10 HP | 60 |
| FALLING SKY | 12 telegraphed meteors over 3s, 3x bullet damage each | 60 |

**Windows on the player:**

| Item | Effect | Charge |
| --- | --- | --- |
| OVERDRIVE | 2x damage for 10s | 60 |
| AEGIS | Invincible for 8s | 60 |
| RED LINE | Double fire rate for 6s | 30 |
| RED MIST | 3x damage, but you take 2x, for 10s | 40 |
| BODY COUNT | +10% damage per kill for 8s, capped at 20 | 32 |
| BLOOD TAX | 25 HP for 3x damage for 10s | 30 |
| FOUR HUMOURS | Shots cycle fire, ice, venom, arc for 8s | 40 |
| BIRD DOG | Seeker's homing for 10s | 40 |
| HAEMOPHAGE | The next 20 hits heal 1 HP each, no time limit | 60 |
| BLOOD FROM STONE | Credit orbs also heal 1 HP for 8s | 30 |
| SWEET SPOT | Every shot crits for 8s | 60 |

**The health bar:**

| Item | Effect | Charge |
| --- | --- | --- |
| WATERLINE | Heal up to half health, and no further | 40 |
| SUTURE ENGINE | 2 HP/s for 10s | 30 |
| OPEN VEIN | 50 HP for a full ammo reserve | 50 |
| SIX CHAMBERS | 50/50: full health, or one | 36 |
| GRAFT | +3 max health, permanently | 60 |
| BANDOLIER | +30 reserve rounds | 40 |

**Getting out of somewhere:**

| Item | Effect | Charge |
| --- | --- | --- |
| BLINK DRIVE | The dash, wherever you are looking - pitch included | 3 |
| BONESAW | A longer dash, invulnerable, 3x bullet damage per body | 15 |
| BOOTSTRAP | Launch yourself skyward, scorching the ground | 30 |
| COLD SPOT | Teleport to open ground, 1.5s invincible | 40 |
| LANCE | One shot, 30x damage, pierces all. Costs 30 ammo | 20 |

**Left in the arena** (see `js/deploy.js`)**, and the shop:**

| Item | Effect | Charge |
| --- | --- | --- |
| WELCOME MAT | A proximity mine. 5x bullet damage over 6m | 30 |
| SHORT FUSE | A thrown bomb on a 3s fuse. 180 over 8m | 30 |
| FIREBREAK | A wall of fire that burns and stops shots | 12 |
| LITTLE BROTHER | An auto-turret, for 15s | 40 |
| APIARY | Five hunting bees, for 24s | 45 |
| EVENT HORIZON | A thrown singularity. 14m reach, 2x bullet damage a beat, 5s | 60 |
| LODESTAR | Pull in every orb and pickup on the floor | 60 |
| ORGAN GRINDER | A cymbal monkey. Every enemy walks to it and ignores you; after 5s it goes off for 8x bullet damage over 9m | 50 |
| SECOND OPINION | Rerolls the shop on use, free | 50 |
| LOCKPICK | A free Mystery Box roll, started on use | 120 |
| PAY TO WIN | $1,000 for 2x your damage to every enemy in the arena | 0 |

LOCKPICK is the most expensive item in the pool and has to be: what it buys is
the thing every other item here is bought with. It throws itself away - there is
one slot, and taking what the box hands over is what replaces it - so it is a
single free roll rather than a machine to operate twice at one shop. Like SECOND
OPINION it leaves the console's price ladder alone (`TotemArea.boxRolls`),
because that number is how many rolls have been BOUGHT.

PAY TO WIN is the only item not paid for in dead enemies, so its meter is not
drawn at all: `UI.setItem` hides the bar for any item whose charge is zero, and
the credits readout in the top corner is the charge bar. A player standing on a
pile of credits can press it until the pile is gone - that is the joke, and it
is safe because the pile is finite and there is no way to earn money without
killing, so every press is a wave's takings not spent on a reroll, a refill or a
box roll.

ORGAN GRINDER is the only item in the game that takes the player out of the
fight without moving them. Every other answer to being surrounded is about where
the PLAYER ends up - the dash, TECTONIC's shove, FIREBREAK's line, AEGIS's
window. This one changes where the enemies are *looking*.

It cannot be damaged, and that is why the number on the card is a number of
seconds: a decoy with health would last as long as the wave decided - forever on
wave three, half a second on wave thirty - and the player would have no way to
know which run they were in.

Not one enemy type, `ai()`, boss or projectile was told the item exists. The
monkey carries a `decoy` object with the player's whole movement-facing surface
(`pos`, `vel`, `yaw`, `eyeInto`, `forwardInto`, `eyeH`) and `_updateEnemies`
swaps it in for `ctx.player` while one is armed, along with the three hooks an
enemy uses to reach the player and the nav grid, which is flooded from the
player's position and would otherwise route the crowd politely around every
pillar on their way to where the player is standing.

That surface has to be COMPLETE. The first version carried `pos` and `eyeInto`,
because a grep for `ctx.player.` found only those - and a wraith reads the
player through a local alias (`const p = ctx.player; p.forwardInto(...)`) that
the grep never saw. It threw inside the enemy sweep, which is inside `rAF`,
which never reschedules: the game stopped dead on the frame the item was
pressed. `test/newpool.mjs` asserts the whole surface.

**Three of them hurt you, and that is deliberate.** WELCOME MAT's blast does not
know who laid it, SHORT FUSE's does not know who threw it, and MARTYR's is the
whole point. A mine you could safely stand next to would be free damage on a
six-metre circle every eight seconds, and a bomb that could be dropped underfoot
for nothing would never be thrown anywhere else. FALLING SKY is the exception
that proves the shape: it cannot touch the player, because every telegraph in
this game is a question answered by moving, and a dozen rocks landing at random
where the player did not aim them would be a question with no answer.

**Fifteen of them run for a window** rather than finishing on the frame they are
pressed, which needed the one piece of machinery this system did not have. An
item may declare a `duration`, a `tick` and an `end` alongside its `use`, and
`RunningItems` in `js/items.js` is the whole of it: a list of activations, each
holding the item that made it, a scratch object and a clock. Re-firing refreshes
rather than stacks - the same rule `Player.applyStatus` follows, and for the
same reason, since two BLOOD TAXes at once would be nine times damage through a
multiplier neither of them could correctly hand back.

What a running item writes on the player lives in its OWN fields -
`itemDamageMult`, `itemTakenMult`, `itemRateMult` and their neighbours - and not
in `mods`, because `rebuildMods()` replays the owned upgrade list from fresh
defaults after every totem pick and would hand back anything an item had
written there. They are also separate from `damageMult` and `fireRateMult`,
which belong to the RAGE and FIRE RATE pickups and carry their expiry: an item
borrowing those would either cancel a pickup or be cancelled by one, where
multiplying means a player holding both gets both.

**Seven of them leave something in the arena.** `js/deploy.js` holds a turret, a
mine, a bomb, a wall, a singularity, a bee and a meteor, all under the contract
`Projectile` and `Grenade` in `js/enemy.js` already established - a constructor
that adds meshes, an `update(dt, ctx)` returning `'alive'` or `'dead'`, and a
`destroy()`. `main.js` drives that list with the same eight lines it drives the
projectiles with, and `_clearHazards()` sweeps it alongside the pools, so
nothing the player left standing outlives the fight it was deployed into.
Damage still goes through `_blast` and `hurtEnemy`; the one argument a
deployable chooses for itself is whether its blast can reach the player.

**The slot is one deep, and that is the feature.** Taking a second item throws
the first away, so a run carries an answer to ONE problem - the health bar, the
crowd, the boss, the corner you got caught in - and swapping is a real loss
rather than an inventory chore. There is no drop, no swap-back and no stash, for
the same reason there is no upgrade menu: nothing in this game opens. **Nothing
names the swap**, on either surface. The pedestal used to carry a "REPLACES
<name>" line and the claim banner used to repeat it; with one slot in the game,
replacing what you are carrying is the only thing taking an item can mean, so
both were restating a rule the player already knows - the pedestal on every
offer, and the banner at the one moment they are pleased with themselves. The
claim reads `<NAME> READY` and nothing else.

**The buff strip reports the effect, not the clock it is filed under.** A
running item's chip measures against the window it was actually granted -
`damageBoostFull` and `fireRateBoostFull` exist because OVERDRIVE opens five
seconds where the RAGE pickup opens ten, and a chip measured against a constant
opened part-drained. An item whose real payload is a COUNT rather than a clock
can also end its own window early by setting `s.done` in its `tick`:
HAEMOPHAGE is ten hits inside twenty seconds, and once the tenth lands the
effect is gone whatever the clock says.

**The charge is bought with dead enemies.** An item's `charge` is a cost in
enemies, not in seconds: each kill is worth `value * CHARGE_PER_VALUE` points,
banked as it dies and paid into the meter as its orbs are collected, so one
basic chaser is worth exactly one point and a 20-point item costs twenty of
them. Standing still pays nothing anywhere - there is no clock to wait out, and
kiting the last enemy of a wave, which used to be the cheapest way to refill the
dearest item in the pool, now refills nothing at all. The rate is flat rather
than a share of the wave, so the same chaser is worth the same on wave 1 and
wave 26, and it is read off `value` rather than off the money actually
collected, which is what keeps Midas and the flawless streak from turning into
cooldown reduction. A boss wave's adds are the one thing with a ceiling on them,
because they are the one cast that never stops arriving.

**The charge cost is printed nowhere.** Not on the pedestal, not in the prompt,
not on the build sheet. The meter already says it, in the only unit it is ever
thought about in: at twelve points or under, one segment is one point - one
basic enemy - so a glance at the slot says "three wide blocks" or "ten narrow
ones" and the answer arrives from having carried the thing rather than from
having read it. Past twelve the bar caps at twelve segments worth `charge / 12`
each - the one rule in `itemCells()` covers both, and it needs no cost to divide
evenly into anything, which is why 13, 25 or 40 all work. **A segment is always
whole or empty**: the fill is floored onto a cell boundary, and floored rather
than rounded, because a cell is a unit of charge and rounding would light the
last one before the item could actually be fired.

**The dash used to be a passive item.** DOUBLE DASH held two charges on a 2.5s
timer and was reached by double-tapping W, a binding that existed because the
game had no spare finger - and an active item slot IS a spare finger. So it
moved here whole: the envelope, the distance and the forward-only commitment
are untouched (see `DASH_TIME` in `player.js`). What changed is that it now
competes with a heal and a panic button for the same slot. Double-tapping W still works, and
does nothing unless BLINK DRIVE is what is carried.

**None of the five is a new system.** The heal is the health pickup's sum, the
freeze is the status every cryo round applies (so bosses downgrade it to a slow
through the resistance they already carry), the damage window rides
`damageBoostEnd`, and the invulnerability is `invulnEnd`, which both damage sinks
already read as their first line. That last one needed the only new drawing in
the set: both sinks return in silence, so without `#invuln-frame` five seconds of
AEGIS look exactly like five seconds of not being shot at.

**The pedestal comes up every third shop**, on the far side of the arena where
the old row stood, with MAX HEALTH on its left and REROLL on its right. It is a
COUNT and not a roll: the feature it replaced appeared on odds bought by clean
waves, and the trouble with that is the run which most needs an answer is the one
least likely to be offered one. An item is a tool, not a prize - the schedule is
fixed, the player can see it coming, and planning a swap two shops ahead is a
thing they are allowed to do. A reroll is not a new shop, so paying three times
at one break does not walk the counter forward three places.

**One offer, not three.** With a single slot to put it in, a row of three would
ask the player to compare three things they can only have one of, at a wave
break, having already picked a passive item - and the second and third would
exist only to be walked past. The pedestal is a `Totem` with `kind: 'item'`,
which changes exactly two things: an ACTIVE ITEM line above the name, and a
second counter-spinning ring on the floor mark. Everything else about picking
it up - the rise, the arm delay, the orbiting icon, the single invisible claim
box - is the totem's, because the two are picked up identically and the pillar
should not have to be relearned.

Where a new upgrade's hook goes, by what it reacts to:

| Reacts to | Hook |
| --- | --- |
| the bullet, per pellet | `_firePellet()` in `main.js` |
| the shot, once per trigger pull | `shoot()`, and the `_shotHits` guard inside `_firePellet()` |
| an enemy dying | the sweep in `_updateEnemies()`, recorded via `_recordDeath()` and played in `_playDeaths()` |
| damage to the player | `_hurtPlayer()` |
| the gun's own state | `Player.tryShoot()` / `Player.update()` |
| an enemy's own timers | `Enemy._tickStatus()`, reading `ctx.mods` |
| a wave starting | `startWave()` - `Player.armWard()` and `armSalvo()` |
| a wave being cleared | the `done` branch in `_updateWave()` - `Player.bankWaveHealth()`, No-Hit Bonus |
| the room itself | `_fillRigState()`, read by `Rig.update()` - Blackout's fog |

Deaths are recorded and played AFTER the sweep, never inline: a corpse effect
that ran mid-sweep would read the enemy list while it is half-compacted.

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
by the upgrade's own id - entries do not name an icon, so two passive items
cannot end up wearing one shape however the pool is edited. The art is flat and
2D; the object is not, carrying three pixels of extrusion behind the face so it
reads as a thick cutout turning in the light rather than a sticker. Each plate
is one merged, vertex-coloured, unlit mesh with the interior faces omitted, so
it is a single draw call and takes no light - the shading is painted into the
tones. Four of the five tones are derived from the offer's `theme`, so one
drawing works for any colour. A totem builds an icon the first time it shows
one and keeps it hidden afterwards, which bounds the count by the size of the
upgrade pool rather than by how many waves have passed.

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

When balancing, check damage per second *after* reloads, not per shot.

## Test

```bash
npm run test:all
```

Every suite, one after another, in about fifteen minutes. This is the gate, and
CI runs it on every push and pull request. It reads the suite list from the
directory rather than a list kept by hand, so a new suite is picked up the
moment it lands; each gets a 300s cap (`TIMEOUT=600` to lengthen it), and the
run ends with a pass/fail summary and a non-zero exit if anything failed. Pass
a filter to narrow it: `node test/all.mjs tempest`.

The suites need a Chrome on the machine, because `puppeteer-core` ships without
one. `test/harness.mjs` finds it — `CHROME`, `CHROME_PATH` or
`PUPPETEER_EXECUTABLE_PATH` if you set one, otherwise the usual macOS, Linux
and Windows locations, and if none of them exist an error naming every path it
tried. It also resolves the repo from its own location rather than the working
directory, so `node test/boss.mjs` runs from anywhere.

```bash
npm test
```

A headless-Chrome smoke test that plays the game automatically for 60s. Besides
checking the game runs, it asserts the pickup, ammo and projectile caps hold
and that GPU resource counts stay bounded — lights, shader programs and
geometries must not grow as enemies spawn and die.

```bash
npm run test:boss
npm run test:drops
npm run test:money
npm run test:pad
npm run test:aim
npm run test:sprint
npm run test:crouch
npm run test:active
npm run test:newpool
```

The targeted suites, because the smoke test's bot rarely survives past the
early waves and would pass every later assertion vacuously. `test:boss` drives
the game into each boss wave in turn and checks the fight resolves, the adds
stay capped, telegraph handles are returned to their pool, and — the one boss
bug that every functional test sails straight through — that the Colossus's
armour, its shutters and its core's glow all agree about whether the weak point
is open. `test:drops` checks a wave can never yield more loot than its budget,
that it yields close to all of it, and that need actually decides the type.
`test:money` checks the two properties that keep the orb economy honest — that
a kill's orbs add up to exactly what the kill was worth, and that the 250-orb
cap merges rather than discards — along with the wave-clear sweep emptying the
floor from anywhere in the arena and Lodestone actually widening the radius.
`test:pad` stands a synthetic DualSense behind `navigator.getGamepads` and
plays the game with it: it asserts the pad is recognised and a non-Sony one is
not, that CROSS on the start screen starts the run without the same held press
also reading as a jump, that the left stick is analogue, that L2 slows the
view, that aim assist works inside its cone and not outside it, and that a
controller unplugged mid-run pauses instead of leaving the player standing.
`test:aim` covers the sights: that the right button raises the gun over several
frames rather than in one, that the zoom, the centred viewmodel and the
tightened cone all land and all go back, that the crosshair's gap is exactly
the cone in pixels on both sides of the blend, that movement opens it from
either pose and costs less down the sights — and, as a regression test, that
the hit marker clears itself. It used to be an `opacity: 1` class that nothing
ever removed, so the first bullet that connected pinned it over the crosshair
for the rest of the run. `test:sprint` covers the second gear: that it is
faster, that the bar drains and holds and refills, that emptying it locks the
sprint until a third is back and a held key cannot sprint on fumes, that a
trigger and a standstill both refuse it, that running takes the gun out of the
sights and hands it back afterwards, and that the sprint's accuracy penalty
outlives the run and then settles. `test:pad` covers the L3 latch and the
settings rows: that one click starts a run and a standstill ends it, that it
does not resume on its own, and that left and right on a sensitivity row move
the value while the selection stays on the row. `test:accuracy` covers the cone
the gun fires through: that a held trigger opens it round by round and opens
the crosshair with it, that it saturates rather than climbing forever, that it
settles all the way back the moment the trigger comes up, that the same fire
also kicks the pitch without either penalty moving where the player is aiming,
and that Hair Trigger charges for its rate in both currencies. `test:active`
covers the whole active item system and the pool merge that came with it: that
the row rises on the third shop and no other, that a reroll is not a new shop,
that an item arrives fully charged and that a second one replaces the first,
that the pedestal never offers what is already carried, that kills fill the bar
and neither wave time nor the shop fills anything while the button still works
in both, that each of the five effects actually lands, that both consoles
charge what they say, and that all eleven converted passive items are reachable
on a free totem - a pick that is in the map, has a drawing, passes every other
check and can still never be offered is the one failure nothing else would
see. `test:crouch` covers the third movement gear
and the swing: that the button latches a crouch and a second press releases it,
that the same button at a sprint slides instead and that letting go does NOT
end the slide, that a slide is faster than the run it came out of and ends
standing rather than crouched, that a jump out of one keeps its speed to the
frame, that the button pressed in mid-air does not crouch there but lands as a
slide — held or tapped, and with the sprint key already released — and, for the
melee, that the swing lands on a delay rather than on the button, hits exactly
one of three bodies standing in front of the player, draws no ring on the
floor, and scores double what the same body is worth shot.

## Structure

```
index.html          page + HUD + overlays
AGENTS.md           how to change this repo without breaking it
server.js           zero-dependency static dev server
css/styles.css      HUD / overlay styling
js/main.js          game loop, state, waves, shooting
js/arena.js         arena geometry, lighting, spawn points
js/player.js        movement, weapon, camera
js/enemy.js         the Enemy class, the four projectile kinds, the damage sinks
js/enemies/         the sixty types, one file per theme
  shared.js         what more than one theme (or the class) needs: the geometry
                    and material caches, the faceted primitives, the status
                    tables, aiMelee / orbit / landHit, and ENEMY_TYPES itself
  index.js          imports the ten themes, which is what registers them
  rust.js  void.js  ember.js  rime.js  verdant.js
  strata.js  tempest.js  brine.js  plague.js  solar.js
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
js/waves.js         wave difficulty config + the role schedule
js/themes.js        the ten themes, their six enemies each, and the run's deck
js/upgrades.js      upgrade pool, totem roll, ammo purchase
js/items.js         the active items, and the mystery box that offers them
js/deploy.js        what an item LEAVES in the arena: turret, mine, monkey, bees
js/companions.js    the two things that are alive: the magpie and the lamprey
js/money.js         money orbs: one Points pool, the magnet, the wave sweep
js/weapons.js       weapon stats + first-person models
js/totems.js        wave-end totems + ammo/reroll stations
js/pad.js           the DualSense: polling, deadzones, button edges, rumble
js/padmenu.js       button glyphs, the menu focus driver, the name keyboard
js/utils.js         collision + misc helpers
test/all.mjs        runs every suite in test/, serially, with a summary
test/harness.mjs    the repo root, the Chrome, and the server spawn - the three
                    things a suite cannot assume about the machine it is on
test/smoke.mjs      headless smoke test
test/money.mjs      the orb economy conserves what a kill was worth
test/icons.mjs      every offer has a drawing and every drawing an offer
test/pad.mjs        controller support, driven by a synthetic DualSense
test/active.mjs     the active item slot, its row, and the eleven that came in
                    with it
test/themes.mjs     the theme table and the balance law: every role filled, no
                    type in two themes, and every stat block inside the
                    envelope its role has to share across all ten
test/ember.mjs      EMBER end to end - the fan, the sweep on the beat, the
                    bellows lighting the crowd, the ashwing's line, and the
                    Forge-Tyrant heating up and venting
test/rime.mjs       RIME end to end - the shard's conditional burst, the
                    glacier's crust and its one nova, the hailer's gapped ring,
                    the hoarfrost's field, and the Pale Crown's anchors
test/verdant.mjs    VERDANT end to end - the thornling's committed charge, the
                    seed that is safe until it is not, the thorn band outside
                    the swing, the heartwood's mending, and the Overgrowth's
                    player-chosen window
test/strata.mjs     STRATA end to end - the scree's carom, the slinger's single
                    bounce, the geode firing at where you have been, and the
                    gargoyle's perch
test/void.mjs       VOID end to end - the warp's rift, the monolith phasing
                    through a box its role-mate is stopped by, and the well
                    that moves the player and costs nothing
test/tempest.mjs    TEMPEST end to end - and every assertion in it is a pair,
                    because a line that is not tested from BOTH sides is
                    indistinguishable from an aura: on the arcling's wire
                    against off it at the same range, a coil in the open
                    against a coil behind cover, a dynamo that was shot
                    against one that was not, the plate's first hit against
                    its second
test/brine.mjs      BRINE end to end, and every assertion in it is a pair for
                    the same reason TEMPEST's are - four of its six are
                    invisible when broken rather than obviously wrong: the
                    gulper held AND let go, the vent walled AND the wall came
                    down, the current pulled AND cover stopped it, the choir
                    stood up as three AND on one bar
test/plague.mjs     PLAGUE end to end - and its headline assertion is a
                    deliberate MISS, because a lesion round that only rotted
                    the floor where it CONNECTED would be an ordinary gunner
                    with a rider and nothing would look wrong. Plus the
                    carrion raising a body once and never twice, and the
                    bloatfly bursting however it died
test/solar.mjs      SOLAR end to end - three of its four reach into the
                    presentation layer, so each is asserted from both sides:
                    the flash fired close AND not far, the crosshair went
                    inside the field AND came back outside it, the plate
                    turned the shot AND stopped once it was spent
test/newpool.mjs    per-hit crit resolution, the range and hit-taken passive
                    items, the two companions, the lure - and all of it in 2P
test/aim.mjs        the sights, the crosshair that reads the cone, the marker
test/accuracy.mjs   the held trigger blooms, caps, recovers - and is not recoil
test/crouch.mjs     the crouch, the slide, the dive out of a jump, the swing
test/sprint.mjs     the second gear and the stamina that pays for it
pixel-icon-sheet.html    every icon at once, at full size and at arena range
pixel-icon-viewer.html   one icon at a time, in a mock column
enemy-viewer.html        the enemy roster as flat silhouettes
tools/pixelart/          the icon drawings + the shared lighting pass
tools/analyze_beats.py   offline beat analysis -> soundtrack.beats.json
tools/verify_beats.py    renders an excerpt with a click on every mapped beat
assets/audio/soundtrack.beats.json   the beat map (generated, committed)
```
**Why `js/enemies/` is split the way it is.** The rule is mechanical rather than
editorial: a symbol lives in `shared.js` if MORE THAN ONE theme uses it, or if
the `Enemy` class uses it as well as a theme. Everything else lives in the one
theme file that uses it. The consequence is the point - **no theme file imports
another**, so there is no cycle to reason about and any one of the ten can be
read on its own. Where a theme genuinely borrows from another (VOID's shade
flies the shrike's dive, BRINE's barnacle uses TEMPEST's line-of-sight test),
what it borrows is in `shared.js` and both read it from there.

A theme registers its own entries into `ENEMY_TYPES` at the bottom of its own
file, so `index.js` is a list of imports rather than a table that has to be kept
in step with ten others - and adding a theme is one line. `js/enemy.js` still
exports `ENEMY_TYPES` alongside the class, so `main.js`, the tests and
`enemy-viewer.html` import exactly what they always did.


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
