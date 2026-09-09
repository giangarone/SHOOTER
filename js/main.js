// VOID ARENA - game entry point. Owns the renderer, the scene, all entity
// lists, and the frame loop. Every other module is a leaf: they never call
// back into here except through the callbacks in the ctx objects below.
//
// STATE MACHINE: 'menu' -> 'playing' <-> 'paused' -> 'gameover' -> 'playing'
// Only 'playing' simulates. The loop still runs and renders in every state,
// which is what keeps the menu camera orbiting and the pause overlay live.
//
// NO MENU EVER OPENS. The wave-end upgrade choice is three totems that rise
// out of the arena floor - walk into one or shoot it anywhere - and credits
// are spent at two stations beside them. The player keeps their hands on the
// controls and the camera stays where it was; a modal at the wave boundary
// killed the momentum this game runs on, and that line still holds.
//
// The wave boundary IS held, though: the next wave does not start until a
// totem has been taken. That replaced a five-second timer that let a set sink
// unclaimed, which meant a forfeited pick was silent - the player learned they
// had lost one only by noticing they never got it. Everything else about the
// boundary is unchanged, including that enemies from the cleared wave are
// already gone, so the hold costs no tension.
//
// WAVE STATE (only meaningful while playing):
//   'active'       spawning from the queue and fighting
//   'intermission' wave cleared, totems up, waiting for the player to pick
//   'idle'         short beat, then the next wave starts
//
// TIME: `this.time` is GAME time - it only advances while playing, and dt is
// clamped at both ends: a stalled tab cannot teleport everything, and a
// backwards frame timestamp cannot run the clock down past zero and arm every
// deadline that uses 0 to mean "not armed". See _loop(). Every gameplay deadline
// (buff expiry, pickup despawn, regen delay) is measured against it. Use
// performance.now() only for things outside the simulation, like the menu
// camera. Mixing the two is a real bug that has happened here before.
//
// FRAME ORDER in _loop() is deliberate:
//   1. player.update      moves the player and the camera
//   2. _updateWave        spawns enemies and pickups
//   3. shoot / melee      raycasts against enemy hitboxes
//   4. _updateMoney       money orbs, the magnet, and the balance
//   4b. _updatePickups    proximity collection
//   5. _updateEnemies     AI, then remove the dead
//   6. _updateProjectiles movement and player hits
//   7. shake, HUD, render
// Step 3 raycasts against hitbox transforms from the PREVIOUS frame, because
// world matrices are only refreshed during render. That one-frame lag is
// normal for this kind of loop; don't "fix" it by forcing matrix updates
// mid-frame.
//
// ALLOCATION: the loop runs 60 times a second, so the hot path allocates
// nothing. Scratch vectors, raycasters and reusable arrays live on `this`
// (the `_`-prefixed fields in the constructor). Reach for one of those rather
// than writing `new THREE.Vector3()` inside a per-frame method.
//
// GPU RESOURCES: enemies, projectiles and pickups all draw from shared
// geometry and material caches in their own modules. When an entity leaves the
// scene it must be removed AND disposed (Enemy.dispose(), Powerup.destroy()).
// Skipping that leaks for the whole session and was the original cause of the
// framerate decaying over a few waves.

import * as THREE from 'three';
import { buildArena, BOUND as ARENA_BOUND } from './arena.js';
import {
  Player, NO_HIT_CAP, MAX_SPEED, flawlessStreakMult, FLAWLESS_STREAK_CAP,
} from './player.js';
import { PLAYER_STATUS } from './status.js';
import {
  Enemy, Projectile, Grenade, Shard, Spit, ENEMY_TYPES, setDamageSink, setPlateSink,
  setShareHook, projStats, projLook,
} from './enemy.js';
import { Effects } from './effects.js';
import { CrtPass, PIXEL_STEPS, PIXEL_LABELS } from './crt.js';
import { UI } from './ui.js';
import { SFX } from './sfx.js';
import { Music } from './music.js';
import { Magpie, Lamprey } from './companions.js';
import { Rig } from './rig.js';
import { waveConfig, bossScale, pickAddType } from './waves.js';
import { THEMES } from './themes.js';

// Which enemy types are actually BUILT. themes.js names every one of its sixty
// slots' final type, including the ones that do not exist yet, and falls back
// to RUST's for any it is handed a `false` for - so the whole ten-theme
// rotation is playable while the roster is still being made, and each theme
// stops borrowing the moment its own enemies land. Passed as a predicate
// rather than imported there, because themes.js and waves.js are both pure
// data modules that have to stay loadable with no renderer.
const HAVE_TYPE = (k) => Object.prototype.hasOwnProperty.call(ENEMY_TYPES, k);
import { rollDrop, spawnDropAt, spawnRelief } from './powerups.js';
import { MoneyOrbs, BASE_MAGNET_RADIUS } from './money.js';
import {
  UPGRADES, AMMO_PURCHASE, rollTotems, rerollCost, boxCost, effectLines, THEME,
} from './upgrades.js';

// THE SECOND POOL'S COLOURS, where a pick has an effect in the arena rather
// than only a number in the stat block. Read off the upgrade table rather than
// written out again, so a totem, its icon and the flash its effect makes in the
// world can never end up three different colours - which is the whole reason
// THEME exists.
const THEME_MARK = THEME.weakPoint;
const THEME_CANNON = THEME.cannonade;
const THEME_ECHO = THEME.echoChamber;
const THEME_CHAIN = THEME.chainFeed;
const THEME_FUSE = THEME.delayedFuse;
const THEME_OVERKILL = THEME.overkill;
const THEME_FEAR = THEME.fearAura;
const THEME_CONDUIT = THEME.statusConduit;
const THEME_STAKES = THEME.highStakes;
const THEME_VITAL = THEME.vitalTrigger;
const THEME_BRUISE = THEME.bruiseRounds;
const THEME_KILLSTREAK = THEME.killStreak;
const THEME_OATH = THEME.bloodOath;

// STATUS CONDUIT's translation table: a status on the PLAYER (status.js) and
// the one it becomes on an enemy (STATUS_TINT in enemies/shared.js). WEAKNESS
// and CURSE are deliberately absent - see _conduit.
const CONDUIT_MAP = [
  ['fire', 'burn'],
  ['poison', 'poison'],
  ['fear', 'fear'],
  ['slowness', 'slow'],
];
// How often the conduit and the fear aura sweep the roster. Four times a
// second: finer than either effect reads at, and a quarter of the work.
const CONDUIT_TICK = 0.25;
// DELAYED FUSE's blink, in blinks per second at the moment the round lands and
// at the moment it goes off. Three is slow enough to read as a marker and
// twelve is fast enough to read as urgent without becoming a flicker - past
// about fifteen the eye stops counting and starts seeing a solid dot.
const FUSE_BLINK_MIN = 3;
const FUSE_BLINK_MAX = 12;
// And the dot's size in world units, when the round lands and how much it grows
// by the time it goes off. Three quarters of a metre is a hair wider than a
// chaser's shoulders at arm's length and a handful of pixels across the arena,
// which is the range the number is actually tuned for: small enough to sit on a
// body the player is also trying to shoot, big enough to survive the posterise.
const PIP_SIZE = 0.75;
const PIP_GROW = 0.35;
import { TotemArea, ARM_TIME_ITEM, ROW_Z as TOTEM_ROW_Z } from './totems.js';
import {
  ACTIVE_ITEMS, shuffledPool, RunningItems, HUMOURS,
  CHARGE_PER_VALUE, BOSS_ADD_CHARGE_CAP,
} from './items.js';
// PRIMED MAG throws the Bomb; PANIC TURRET stands the Turret up. Both are
// deployables main.js makes itself, for the same reason: they are PASSIVE
// items, and js/deploy.js's other callers are all active items.
import { Bomb, Turret } from './deploy.js';
import { MysteryBox } from './mysterybox.js';
import { NavGrid } from './nav.js';
import { TerrainSet, generateLayout, BUILD_TIME as TERRAIN_BUILD_TIME } from './terrain.js';
import { Pad, BTN } from './pad.js';
import { MenuDriver, renderControls, cap } from './padmenu.js';
import { resolveCircle, BOSS_HEIGHT } from './utils.js';
import { VersusMatch, captureRun, restoreRun } from './versus.js';

// ?autotest makes the game play itself and exposes window.__game and
// window.__report() for test/smoke.mjs. It also skips pointer lock, which
// headless Chrome can't grant.
const autotest = new URLSearchParams(location.search).has('autotest');
// The controller harness. NOT the bot: it hands out the same `window.__game`
// handle and nothing else, because the whole point of test/pad.mjs is to drive
// the real input path with a synthetic DualSense and watch what the game does
// with it. A bot writing `input` underneath that would be measuring itself.
const padtest = new URLSearchParams(location.search).has('padtest');

// Pickup budget. Every pickup in the arena is a draw call and a collision
// check, and unbounded spawning was the cause of the arena filling with ammo.
const MAX_ACTIVE_PICKUPS = 12;
// How much loose ammo the arena may hold at once. The old timer needed this to
// stop it flooding the map; the budget bounds a wave's total now, but the cap
// stays because need-weighting alone would let an empty player's whole budget
// land as ammo and nothing else.
const MAX_ACTIVE_AMMO = 5;

// ---- drops ---------------------------------------------------------------
// Pickups come off the enemies that die, not from timers around the map.
//
// EVERY KILL ROLLS, and nothing is remembered between kills - see rollDrop in
// powerups.js for the chances and for what replaced the old fixed budget. A
// wave can be dry and the next generous; that is the point of rolling rather
// than scheduling. Health and ammo, and only those two, get likelier as the
// bars they refill empty.
//
// The boss still sheds a pickup as it crosses each health threshold. A boss
// fight is the longest stretch in the game with almost nothing dying in it,
// and a run of bad rolls across its few add kills would leave the player with
// nothing at all for forty seconds.
const BOSS_BLEED_THRESHOLDS = [0.75, 0.5, 0.25];

// The safety net. Kill drops alone would be a death spiral: out of ammo means
// no kills, and no kills means no ammo. If either bar is under its floor and
// nothing has dropped for a while, one is placed near the player regardless of
// how the fight is going.
const RELIEF_INTERVAL = 10;
const RELIEF_HEALTH_FRAC = 0.35;
const RELIEF_AMMO = 40;
// Retry delay used when a spawn is skipped because a cap is already reached,
// so a blocked spawn can never be retried every single frame.
const SPAWN_RETRY = 2;

// Enemy shots, grenades and Reload Burst's shards share one pool. Raised from
// 24 when Reload Burst arrived: eight shards live for well under a second, but
// a reload during a heavy wave would otherwise spend the whole budget and
// silently drop enemy fire, which reads as the wave going quiet.
//
// Raised again for bosses, and SPLIT. Herald throws five-shot volleys on top
// of whatever the adds are firing, and with one shared ceiling a boss wave
// could hold the pool full for seconds at a time - which would silently
// cancel Reload Burst, an upgrade the player paid for. Enemies stop at
// MAX_ENEMY_PROJECTILES, so eight slots are always there for the shards.
//
// Raised once more for Schism's radial volley: at its last tier there are
// eight parts throwing eight rounds each, and while their cooldowns are
// deliberately out of step, a ceiling of forty would have silently eaten
// whole volleys - and a volley that only half arrives is unreadable.
const MAX_PROJECTILES = 72;
const MAX_ENEMY_PROJECTILES = 64;
const EMPTY_CLICK_COOLDOWN = 0.35;

// Seconds a station ignores further hits after one is bought by shooting it.
// A held trigger lands several pellets per second on the same box, and every
// one of those would otherwise be a separate purchase.
const STATION_SHOOT_COOLDOWN = 0.25;

// What a console is called when the prompt has to say why it cannot be used.
// Two consoles stand at a wave break, both beside the totems, and a blocked
// line has to name the one being looked at. The mystery box on the far side is
// not a console and is not in here - it names itself, on its own card.
const STATION_TITLE = {
  ammo: 'AMMO', reroll: 'REROLL',
};

// NO-SPAWN BUBBLE. No enemy is ever placed closer than this to the player.
// The spawn grid sits near the arena edges, but the player is free to stand on
// one, and materialising a charger inside their hitbox is damage they had no
// chance to avoid. Ten metres was not enough on its own: a chaser covers that
// in under three seconds, and the jitter applied to a spawn point could take a
// metre back off it. This is a medium bubble - wide enough that anything that
// appears has to visibly travel to reach the player, well short of the arena's
// 21 metre half-width so the grid always has points outside it.
const MIN_SPAWN_DISTANCE = 16;

// Melee reach, in metres from the player's feet, and the half-angle of the
// arc it sweeps. It is a swing, not a poke: everything in front of the player
// inside the arc is hit, not just what the crosshair happens to be on.
// The accuracy cost of moving AT FULL SPRINT, added to whichever cone the gun
// is currently firing through and scaled down by however much slower than that
// the player actually is. Aiming does not remove it - a player running with
// the gun up is still running - but it cuts it hard, which is what makes
// standing still and aiming the most accurate thing in the game rather than
// merely one of two ways to be accurate.
//
// It used to be a flat penalty past a speed THRESHOLD, which read as a switch:
// walking cost exactly as much as running, and the walk was already over the
// line, so in practice the gun had two accuracies and one of them was
// unreachable while playing. Scaling it continuously off live speed is what
// makes the crosshair worth watching - the arms open as the player picks up
// speed, so the reticle is a readout of what they are doing rather than of
// what they are holding.
const MOVE_SPREAD = 0.085;
const MOVE_SPREAD_AIM = 0.25;
// AND THE SPRINT'S OWN PENALTY, on top of the speed it is already being
// charged for. A run is not simply fast movement as far as the gun is
// concerned - the weapon is not being carried in a firing grip at all - so it
// gets a cone of its own that takes the standing spread to roughly triple.
//
// It bleeds off rather than ending with the run (see sprintFade in player.js),
// which is what makes it a mechanic rather than a light show: firing cancels
// sprinting, so a penalty that stopped when the sprint did could never be the
// cone a bullet was actually fired through.
const SPRINT_SPREAD = 0.085;
// THE CONE A HELD TRIGGER OPENS, at a full charge. Player.bloom is the 0..1
// charge and this is what it is worth in NDC, so the ramp and the cap live
// with the gun (see BLOOM_PER_SHOT in player.js) and the SIZE lives here with
// the other two cone penalties it has to sit alongside.
//
// Sized against them on purpose: a magazine emptied on full auto costs about
// as much accuracy as walking does, and rather less than a sprint. That is the
// honest weight for it - a held trigger should be a worse way to shoot, not a
// broken one, and the player who taps instead should be able to feel that they
// chose something.
const BLOOM_SPREAD = 0.075;
// What is left of it down the sights. Not the same cut MOVE_SPREAD_AIM makes,
// and it should not be: aiming is a claim about how steadily the gun is being
// HELD, and it answers a run almost completely. It has much less to say about
// a barrel that has had thirty rounds through it, so bloom keeps most of its
// weight with the gun up - the crosshair is hidden there, but the cone is not.
const BLOOM_AIM = 0.55;
// The crosshair's arms never close all the way onto the dot: a reticle with no
// gap in it is a blob, and the aimed cone is small enough to be one.
const CROSS_MIN_GAP = 4;

// LONGSHOT and POINT BLANK, the two passive items that make damage care where
// the player is standing. See Game._hitMult.
//
// FORTY METRES IS THE ARENA'S LONG SHOT AND NOT ITS DIAGONAL. BOUND is 22, so
// corner to corner is over sixty - but a corner-to-corner shot is a shot at
// something that has not noticed you yet, and a bonus that only maxed out
// there would be a bonus nobody ever collected. Forty is about the longest
// distance a live fight actually happens over in this room, which makes the
// top of the ramp somewhere the player can reach by backing off rather than by
// leaving.
const LONGSHOT_RANGE = 40;
// And its opposite. Five metres is inside the arm's reach of half the roster,
// which is the whole deal: the bonus is only ever collected somewhere that is
// about to cost health.
const POINT_BLANK_RANGE = 5;

// WHAT AN ENEMY IS ALLOWED TO DO TO THE PLAYER WHILE A LURE IS OUT: nothing.
//
// Three no-ops rather than three `if (lure) return` guards inside the real
// hooks, because those hooks are shared: _hurtPlayer is also how a lava pool,
// a projectile already in the air and a mine the player set off themselves
// reach the health bar, and none of those are being fooled by a toy monkey.
// Swapping the ENEMY context's copies is the only edit that means exactly what
// ORGAN GRINDER's card says and nothing more. See the LURE block in
// _updateEnemies.
const NO_HIT = () => {};
const NO_STATUS = () => {};
const NO_PULL = () => {};

const MELEE_RANGE = 3.6;
// NARROWER THAN THE OLD SWEEP, because the swing hits exactly one thing now
// and a wide cone that picks one target out of a crowd is a cone that picks
// the wrong one. Forty degrees is about what the weapon covers on screen
// during the strike, which is the only honest number for it.
const MELEE_ARC = Math.PI / 4.5;
const MELEE_DAMAGE = 50;
// How long after the button the strike actually lands. Matched to the swing
// animation's second leg (MELEE_WIND * MELEE_ANIM in player.js): the damage is
// dealt on the frame the gun is seen to arrive, not on the frame the button
// went down. Anything else reads as enemies dying before they are hit.
const MELEE_SWING = 0.12;
// WHAT A KILL WITH THE GUN ITSELF IS WORTH. Melee is the shortest range in the
// game, it has a cooldown, it hits one body and it has to be walked into - so
// it pays double.
const MELEE_KILL_MULT = 2;

// innerWidth and innerHeight are both 0 in some real situations - a minimised
// window, a hidden tab, a canvas laid out at zero height. 0/0 is NaN, and a NaN
// aspect poisons the camera's projection matrix, which makes setFromCamera()
// produce a NaN ray and silently breaks EVERY raycast in the game: shooting
// and melee stop registering hits with no error anywhere. Clamp so the aspect
// is always a finite positive number.
function viewportAspect() {
  return Math.max(1, innerWidth) / Math.max(1, innerHeight);
}

// --- settings ---
// The screenshake scale, as the player sets it. One step per press of a key,
// eight cells on the readout, and a ceiling of double so someone who wants
// more kick than the game ships with can have it - the amplitude itself is
// still capped in effects.addShake, so the top of this scale is loud, not
// unreadable.
const SHAKE_PIPS = 8;
const SHAKE_MAX = 2;
const SHAKE_STEP = SHAKE_MAX / SHAKE_PIPS;

// How coarsely the arena is drawn - an index into PIXEL_STEPS in crt.js. The
// game's icons, HUD and money orbs have always been pixel art; this is what
// lets the 3D half of it join in, by rendering the scene into a smaller buffer
// and letting the tube pass magnify it with no filtering.
//
// SUBTLE by default. FULL is the strongest look and it is a real cost to a
// player trying to identify an enemy across a 23m arena, so the game ships at
// the step that reads as pixel art without arguing with the aiming.
const PIXEL_DEFAULT = 1;

// --- economy ---
// Seconds a kill chain survives without a new kill.
const COMBO_WINDOW = 3;
// Multiplier per kill beyond the first, and its ceiling. The cap exists so a
// late wave full of splitter children cannot run the multiplier to absurdity.
const COMBO_STEP = 0.15;
const COMBO_MAX = 3;
// Credits per enemy are derived from its `value` so the two curves cannot
// drift apart. Splitter children are worth 0 and so fall outside this rate
// entirely; they pay a small flat bounty instead - see SPLIT_CHILD_CREDITS -
// because paying them at this rate off a real value would make splitters the
// best credit source in the game.
//
// 0.25 rather than the 0.18 it was, because THE KILL CHAIN NO LONGER PAYS.
// The combo used to multiply every kill's bounty by up to three, which made
// the best way to earn money hoarding a wave and then clearing it in one
// chain - a strategy of NOT shooting things, in a shooter. That multiplier is
// gone (the chain still exists, but only to drive the room - see comboMult),
// and the flawless streak replaces it: money now comes from not being hit
// rather than from the shape of a kill order.
//
// The two do not trade evenly on purpose. A chain averaged somewhere near 1.6x
// over a busy wave, so a flat 0.25 leaves a player who takes hits earning
// slightly LESS than before, while a clean run reaches 0.25 x 3 and earns far
// more. That gap is the point of the change.
const CREDITS_PER_VALUE = 0.25;
// What one splitter child pays. Flat, and set here rather than by giving the
// child a `value`, because the two numbers answer different questions: the
// children are still worth NOTHING - killing them must not pay twice for work
// the parent was already paid for - but a splitter that bursts into
// three bodies you have to stop and deal with should not leave the floor
// empty. Small on purpose: three children come to 4.5 credits against the
// parent's ~21, so clearing the whole family is worth about a fifth more than
// the parent alone, and splitters still are not the way to fund a run.
const SPLIT_CHILD_CREDITS = 1.5;
// Totems offered per set.
const TOTEM_COUNT = 3;

// ---- the hot seat ---------------------------------------------------------
//
// How long the pass-the-controller screen holds before the next wave starts
// itself. Long enough to read a name, a stake and hand a pad across a sofa;
// short enough that it never becomes a lobby. It is not skippable, on purpose:
// a skip button is a button one player can press while the other is still
// reaching for the controller.
const HANDOFF_TIME = 3;
// How long the gun and the instruments take to leave, and to come back. The
// caption holds between the two, so the pass reads as out - read - in rather
// than as one continuous slide.
const HANDOFF_SWAP = 0.55;
// The players, in the world. See PLAYER_INK in ui.js for the DOM's copy - the
// two lists are read in step by index and must stay the same length.
//
// FOUR, AND IN THIS ORDER. The first two are the pair the mode shipped with,
// so a two-player match still looks exactly as it did; the green and the amber
// are picked to survive the CRT filter, which eats anything close to the
// arena's own blue-grey - see crt.js.
const PLAYER_COLOR = [0x4ef3ff, 0xff3b30, 0x00e676, 0xffb300];
// Double Dash: how close together two presses of the SAME movement key have to
// be to read as a double-tap. Long enough to hit reliably mid-fight, short
// enough that ordinary strafe-corrections never trip it by accident.
const DOUBLE_TAP_WINDOW = 0.28;

// ---- the controller -------------------------------------------------------
//
// Everything the pad needs that is about the GAME rather than about the
// hardware. The device itself - deadzones, edges, rumble - is pad.js.

// Turn rate at full stick deflection, radians per second, at the middle
// sensitivity setting. Roughly 150 degrees a second, which is a console
// shooter's default and about a fifth of what a mouse does across a desk.
const LOOK_RATE = 2.6;
// The response curve on stick deflection. Above 1, so the first half of the
// stick's travel is worth much less than the second: that is what buys fine
// aim near the centre without giving up the fast turn at the edge. A linear
// stick is the single biggest reason a pad feels imprecise.
const LOOK_EXP = 1.7;
// Sensitivity steps shown in SETTINGS, and the multiplier the ends map to.
// TWO settings share this scale - the hip and the aim - because a player who
// has found a number they like at the hip should be able to read the aimed one
// against it rather than against a second, differently-shaped dial.
const SENS_STEPS = 8;
const SENS_DEFAULT = 5;
// Lower by default: the zoom already magnifies every movement of the stick, so
// matching the hip rate down the sights would make the aim feel twitchier than
// the hip it was supposed to steady.
const AIM_SENS_DEFAULT = 3;
const SENS_MIN = 0.5;
const SENS_MAX = 2;
// The mouse has no sensitivity slider of its own, so aiming scales it by a
// fixed ratio - the standard zoom-relative number, which keeps hand travel
// across a target roughly constant through the zoom.
const MOUSE_AIM_SENS = 0.6;

// AIM ASSIST, in two halves that do different jobs.
//
// SLOWDOWN is the honest one: while the reticle is over something the stick
// turns more slowly, so the player's own correction is finer exactly where
// they need it to be. It never moves the view on its own.
//
// MAGNETISM is a gentle rotation toward the target, and it only runs while the
// player is ALREADY pushing a stick - it helps a turn that was happening
// anyway and never aims for a player who has let go. That gate is what keeps
// it from reading as the game playing itself.
const ASSIST_CONE = 0.15;      // radians of angular error it works inside
const ASSIST_RANGE = 45;       // metres; nothing further is a target
const ASSIST_SLOW = 0.45;      // stick rate at dead centre
const ASSIST_PULL = 0.35;      // radians per second of pull, at full effort

// How far the mouse must actually travel to hand control back to the
// keyboard. A resting mouse jitters by a pixel, and a mode that flipped on
// that would swap every prompt on screen while the player was using the pad.
const MOUSE_WAKE = 6;
// Ashen: how many clouds can be alive at once, and how often Neurotoxin's
// poison is allowed to make a jump.
const MAX_ASH_CLOUDS = 8;
// Hellfire's trail. Sized like the magma trail it mirrors (MAX_LAVA) rather
// than like an ash cloud: it is a LINE of small short-lived patches dropped as
// the player runs, not a handful of big ones, and the oldest is recycled so
// the tail burns out behind them instead of the head refusing to appear.
const MAX_FIRE_PATCHES = 20;
// How far the player has to move before the trail drops another patch. Small
// enough to leave an unbroken line at a walk, large enough that standing still
// after a reload lays one patch and not twenty.
const FIRE_STEP = 0.85;
const CREEP_FIRE = 0xff5a00;
// Lingering zones that damage the PLAYER. There are two kinds and they are
// capped separately, because they are completely different shapes of threat:
//
//   pool  a blight's lob, or Herald's spray - big, slow, one at a time, and
//         sitting exactly where the player is standing. Four overlapping ones
//         already means the ground is gone.
//   lava  a magma walker's trail - small, constant, and a dozen alive per
//         enemy by design. It is the LINE it draws that matters, so capping it
//         with the pools would either starve the pools or cut the trail into
//         disconnected dots.
//
// A single list holds both and eviction is per kind, so a magma running laps
// can never push a blight pool out from under the player's feet.
const MAX_POOLS = 4;
const MAX_LAVA = 24;
// Gas clouds. Capped against the cloud pool in effects.js (six slots) with a
// slot to spare: a cloud is the most expensive decoration in the game and the
// only one the camera can be inside.
const MAX_GAS = 4;
// Frost patches. A rime lays these the way a magma lays lava, but they last
// longer and are dropped less often, so the cap is well under MAX_LAVA - the
// two trails share the same thirty creep slots and a magma is entitled to its
// half of them.
const MAX_FROST = 12;
// EMBER's OTHER fire, and it is a separate kind from `lava` for exactly the
// reason the pools and the trails are separate from each other: eviction is
// per kind, and a kiln's rotating bar and an ashwing's bombing line are LINES.
// A line with holes evicted out of the middle of it does not read as a line -
// it reads as the mechanic being broken - and sharing a cap with the magma
// trail is precisely how those holes would appear, because EMBER is the first
// theme where four types lay fire into the same wave.
//
// Bigger than the frost cap and smaller than the lava one: two sources feed it
// rather than one, and each patch is short-lived on purpose so the swept wedge
// is a place you cannot be RIGHT NOW rather than a place that is gone forever.
const MAX_EMBER = 16;
// RIME's hail: a hailer's rings and a sleet's columns. Separated from `frost`
// for the same reason `ember` is separated from `lava` - a rime's TRAIL is a
// line and a hailer's RING is a ring, and two shapes sharing one eviction
// queue punch holes in each other. It is the wider of the two because two
// types feed it against the rime trail's one.
const MAX_HAIL = 14;
// VOID's wells. Few, because each one takes a piece of the floor away for two
// seconds in a way the player cannot simply step off - three at once would be
// a room with no ground in it.
const MAX_WELL = 4;
// TEMPEST's electrified ground. Its own kind for the reason `ember` and `hail`
// are their own kinds - eviction is per kind - and the SHORTEST-LIVED and most
// vicious ground in the game, which is what separates it from lava at a
// glance: lava is a floor you can cross if you have to, and this is a floor
// that is simply gone for three seconds. One source feeds it, so the cap is
// the smallest of the damaging kinds.
const MAX_SHOCK = 10;
// BRINE's ink. Few, and each one is big: the curtain is the mechanic, and six
// small clouds is a patchy fog rather than a wall you cannot see through.
// Capped against the cloud pool in effects.js the same way the gas is, and
// the two share it - an ink cloud and a vitriol cloud are the same object.
const MAX_INK = 3;
// BRINE's scalding columns. The only hazard in the game that is SOLID, so the
// cap is really a cap on how much of the arena may be walled off at once -
// four is two vents' worth in flight and is already a room with corners in it
// that were not there a moment ago.
const MAX_SCALD = 4;
// PLAGUE's bile - a lesion's rounds, wherever they stopped. Its own kind and
// not `pool` for the eviction argument that separates every other kind: a
// blight throws FOUR big pools and a lesion writes a dozen small ones across
// the arc the player strafed through, and sharing a queue would have each
// enemy deleting the other's whole mechanic. The cap is the largest of the
// poison kinds because the patches are the smallest.
const MAX_BILE = 14;
// SOLAR's lens line. The largest cap of any kind, and it has to be: the line
// is one patch every sixth of a second with a long tail, so a single lens is
// carrying most of this on its own and the number is really "how long a trail
// one lens may have behind it".
const MAX_GLARE = 20;
// Ground-patch colours. THE FIRST QUESTION a patch of floor has to answer is
// whose it is, and the shape family answers it first (see creepRadius in
// effects.js), the PULSE second - hostile patches breathe, the player's are
// still. Colour is the third signal and no longer the deciding one, which is
// what frees ash to be the colour it should always have been: it is the ash of
// a fire passive item, so it is warm. It used to be cyan, which read as ice or
// as a pickup and never as the thing Incendiary left behind.
//
// Ash is amber and lava is a deeper red so the two stay apart at distance
// while both staying in the fire family; the blight's toxic green is a
// different hue from either.
const CREEP_ASH = 0xff8a3d;
const CREEP_HAZARD = 0xaaff2a;
const CREEP_LAVA = 0xff4a10;
// The two new grounds. Both wear their STATUS's colour rather than a colour of
// their own (see status.js), because the patch on the floor and the chip in
// the HUD are one piece of information: this is why that icon lit up.
const CREEP_GAS = 0x4fe06a;
const CREEP_FROST = 0x63b3ff;
// Brighter and yellower than CREEP_LAVA, and that gap is doing real work in an
// EMBER wave: a magma's trail is ground that has been burning for a while and
// a kiln's bar is ground that is on fire THIS SECOND. Same family, so the
// theme still reads as one thing; different enough that the player can tell
// which of the two they are about to step in.
const CREEP_EMBER = 0xff8c1a;
// Paler and whiter than CREEP_FROST, and doing the same job the ember/lava gap
// does on the other side of the roster: a rime's trail is ground that has been
// frozen for a while, a hailer's ring is ground that has JUST landed. Same
// family, distinguishable at a glance.
const CREEP_HAIL = 0xbfe6ff;
// VOID's well. The theme's indigo, and the only ground in the game that does
// no damage of any kind - what it takes is the two seconds the player spent
// getting out of somewhere.
const CREEP_WELL = 0x7c4dff;
// TEMPEST's shock. The theme's cyan - it applies no status, so unlike the gas
// and the frost it has no HUD chip to agree with and wears the colour of the
// enemies that laid it instead.
const CREEP_SHOCK = 0x4ef3ff;
// BRINE's ink, and it is nearly black on purpose - the whole payload is that
// you cannot see through it, and a bright cloud would be a thing you can see
// perfectly well that happens to be in the way.
const CREEP_INK = 0x07211f;
// And its scald - the pale hot teal of the column, so the pillar in the room
// and the enemy that put it there are obviously one thing.
const CREEP_SCALD = 0x63e8d8;
// PLAGUE's bile. It applies poison, so it wears the POISON status's colour
// rather than the theme's magenta - the patch on the floor and the chip in the
// HUD are one piece of information, which is the rule the gas and the frost
// already keep.
const CREEP_BILE = 0x39d353;
// SOLAR's glare. It burns, so it is in the fire family with the lava and the
// ember - and paler and yellower than either, because it is light rather than
// heat and because the player has to be able to tell a lens's line from a
// magma's trail in the half-second they have to step off one of them.
const CREEP_GLARE = 0xffe08a;
// How long the player keeps burning after stepping OUT of lava. Short: the
// tail is meant to be the last thing that catches someone who cut a corner,
// not a second pool that follows them around the arena. It is refreshed every
// frame they stand in one, so the clock starts when they leave however long
// they were in there.
const LAVA_BURN_SECONDS = 2.5;
// How long the gas keeps working after you walk out of a cloud, and how long
// the cold does. Both are longer than lava's tail and for the same reason in
// reverse: fire is the one that hurts most while you are standing in it, so
// its tail can afford to be short, while the whole threat of gas and frost IS
// the tail - a cloud you can sprint through in half a second would be nothing
// at all if it stopped working the moment you were clear.
const GAS_POISON_SECONDS = 5;
// What each lobbed glob grows into. A blight's pool is wide, shallow and short
// - it is a position you are pushed off. A vitriol's cloud is tighter and
// lasts longer, because it is thrown at where the player is GOING and has to
// still be there when they arrive.
const SPIT_POOL = { radius: 3.2, life: 6, dps: 9 };
const SPIT_GAS = { radius: 3.0, life: 7, dps: 6 };
// The flare's shell. SMALLER than either of the others per patch and thrown in
// a fan of three - the ground it takes is a shape rather than a circle, which
// is what makes stepping ACROSS it the answer and backing away from it the
// mistake.
const SPIT_EMBER = { radius: 1.6, life: 4, dps: 12 };
// The hailer's cluster. No damage - see the `hail` row above - so the only
// numbers that matter are how big each patch of the ring is and how long the
// player has to find the gap before it closes behind them.
const SPIT_HAIL = { radius: 1.6, life: 3.6, dps: 0 };
// The sporegun's seed. Radius, life and dps are all UNUSED - a seed never
// becomes ground - and it is listed anyway so every kind has a row and the
// lookup below can stay a plain table rather than a chain of exceptions.
const SPIT_SEED = { radius: 0, life: 0, dps: 0 };
// The singularity's well. Wide and short-lived, and worth nothing per second -
// see the `well` row above.
const SPIT_WELL = { radius: 7.0, life: 2.2, dps: 0 };
const SPIT_CONFIG = {
  pool: SPIT_POOL, gas: SPIT_GAS, ember: SPIT_EMBER, hail: SPIT_HAIL, seed: SPIT_SEED,
  well: SPIT_WELL,
};
const FROST_CHILL_SECONDS = 3;

// WHAT EACH KIND OF BAD GROUND IS. One row per kind, read by _addHazard and
// _updateHazard, so a new hazard is a row here rather than a branch in both.
//
//   color      the stain, and the cloud when it has one. Always the colour of
//              the STATUS it applies, so the floor and the HUD chip agree.
//   cap        how many of this kind may exist. Separate per kind: a magma
//              trail must not be able to evict a blight's pool.
//   status     what standing in it puts on the player, from status.js.
//   secs       how long that status lasts from the last frame in the patch.
//   carve      subtract the status's own damage-over-time from the patch's
//              dps, so a patch that now burns you does not also cost double
//              while you stand in it. Only for statuses that deal damage.
//   cloud      hangs a cloud over the stain as well - see effects.js.
//   poisonous  Antidote turns it off entirely.
const HAZARD_KINDS = {
  pool: { color: CREEP_HAZARD, cap: MAX_POOLS, poisonous: true },
  lava: {
    color: CREEP_LAVA, cap: MAX_LAVA,
    status: 'fire', secs: LAVA_BURN_SECONDS, carve: true,
  },
  gas: {
    color: CREEP_GAS, cap: MAX_GAS, cloud: true, poisonous: true,
    status: 'poison', secs: GAS_POISON_SECONDS, carve: true,
  },
  // NO DAMAGE AT ALL. The cold is the whole payload: a frost patch that also
  // bled the player would be a worse pool, and the enemy that lays it is there
  // to hand the rest of the wave a target that cannot leave.
  frost: {
    color: CREEP_FROST, cap: MAX_FROST,
    status: 'slowness', secs: FROST_CHILL_SECONDS,
  },
  // Kiln sweeps, ashwing runs and flare bursts. Burns exactly like lava does -
  // same status, same tail, same carve - and differs only in its colour and in
  // having its own cap to be evicted out of.
  ember: {
    color: CREEP_EMBER, cap: MAX_EMBER,
    status: 'fire', secs: LAVA_BURN_SECONDS, carve: true,
  },
  // Hailer rings, sleet columns and a glacier's shatter nova. Chills exactly
  // as frost does and, like frost, deals NO DAMAGE AT ALL: the cold is the
  // whole payload, and a patch that also bled the player would be a worse
  // pool. What it costs is the ability to answer everything else.
  hail: {
    color: CREEP_HAIL, cap: MAX_HAIL,
    status: 'slowness', secs: FROST_CHILL_SECONDS,
  },
  // The singularity's well. NO damage and NO status - the first hazard in the
  // game that takes neither, and the only one that MOVES the player. `pull` is
  // the strength it drags them toward the centre with, per frame, and it is
  // deliberately weak enough to walk against: a well that simply moved them
  // would be a stun, and a stun with no telegraph is the worst thing this game
  // could do to somebody.
  well: {
    color: CREEP_WELL, cap: MAX_WELL, pull: 2.4,
  },
  // A stormcaller's strike, after it has landed. NO STATUS AT ALL, which is
  // the one thing that keeps it from being a worse lava: everything it does
  // it does while the player is standing in it, and the instant they are out
  // it stops. That is what makes giving up the position a complete answer,
  // and it is why the dps is the highest of any ground in the game - a patch
  // with no tail has to bite hard enough to move somebody in the second they
  // are deciding whether to bother.
  shock: {
    color: CREEP_SHOCK, cap: MAX_SHOCK,
  },
  // A drifter's curtain. NO damage and NO status - the second hazard in the
  // game that takes neither, and where the well moves the player this one
  // takes what they KNOW. The cloud is the whole point of it, so unlike every
  // other kind the stain on the floor is the decoration and the thing hanging
  // over it is the mechanic.
  ink: {
    color: CREEP_INK, cap: MAX_INK, cloud: true,
  },
  // A vent's column, and the only SOLID hazard in the game. `wall` is its
  // half-width and its height: _addHazard puts a box into the arena's own
  // obstacle and ground lists and _releaseHazard takes it out again, which is
  // the whole implementation - both are called from exactly one place each,
  // including the wave-end sweep, so a column cannot outlive the fight that
  // raised it.
  scald: {
    color: CREEP_SCALD, cap: MAX_SCALD,
    status: 'fire', secs: LAVA_BURN_SECONDS, carve: true,
    wall: { r: 1.0, h: 3.6 },
  },
  // A lens's line. Its own kind rather than `ember`'s for the reason every
  // other split in this table exists: eviction is per kind, and a lens lays a
  // patch every sixth of a second with a two-and-a-half-second tail, so ONE of
  // them keeps most of a cap busy on its own. Sharing EMBER's would have had
  // two lenses punching holes through the middle of each other's line - the
  // exact failure the kiln and the ashwing were separated to avoid, and the
  // one that makes a line stop reading as a line.
  glare: {
    color: CREEP_GLARE, cap: MAX_GLARE,
    status: 'fire', secs: LAVA_BURN_SECONDS, carve: true,
  },
  // Where a lesion's rounds stopped. Small, shallow and short - it is not
  // meant to be a pool the player is pushed off, it is meant to be a dozen of
  // them across the ground behind somebody who has been strafing.
  bile: {
    color: CREEP_BILE, cap: MAX_BILE, poisonous: true,
    status: 'poison', secs: GAS_POISON_SECONDS, carve: true,
  },
};
// THINGS THE PLAYER HAS LEFT IN THE ARENA, all kinds together. FALLING SKY
// queues twelve on its own and APIARY five, so this is not a limit anybody
// reaches in ordinary play - it is there so that a slot fired repeatedly
// through a wave break cannot grow the list without bound.
const MAX_DEPLOYED = 40;
// Telegraphed impact circles - Siege's barrage. Capped at the telegraph pool's
// depth minus the handles the bosses hold for their own warnings.
// Raised from six with the telegraph pool that backs it (see effects.js): a
// mortar was Siege's barrage and nothing else, and it is now also every
// sporegun's seed and every ring the Overgrowth lays. Still comfortably under
// the sixteen marks, so a boss's own charge lane always has a slot.
const MAX_MORTARS = 10;
// The boss kill's own payout - and, now that the flat clear bonus is gone, the
// only lump sum left in the game. It is paid in orbs like everything else.
const BOSS_BONUS_BASE = 400;
const BOSS_BONUS_PER_WAVE = 60;
// Orbs the boss payout splits into. Far above the cap on an ordinary kill's
// drop: the point of the boss shower is the FLOOR being covered, so the
// denomination stays small and the count does the work.
const BOSS_ORBS = 40;
// How long the boss shower is left on the floor before it is swept up. Long
// enough for the arc to land and read as a pile of money, short enough that
// nothing is anywhere near ORB_LIFETIME.
const BOSS_ORB_SWEEP_DELAY = 1.1;
// What a wave cleared without taking a single point of damage pays, and the
// orbs it arrives in. This is the flat clear bonus's only surviving half - it
// is paid ONLY for a flawless wave, which is what it is for.
const FLAWLESS_BONUS_BASE = 60;
const FLAWLESS_BONUS_PER_WAVE = 30;
const FLAWLESS_ORBS = 8;
// HOW LONG THE FLAWLESS SHOWER IS LEFT ALONE, and then how long before it is
// swept up. Both exist because this shower is thrown at the PLAYER'S OWN FEET
// and everything else in the game is not.
//
// Without the hold there was no shower to see: eight orbs spawned inside the
// magnet radius (they are thrown at `spread` 5.5 and BASE_MAGNET_RADIUS is
// 5.5) were claimed on their first frame and pulled straight back in, and the
// ones that spawned on top of the player were collected outright by the touch
// radius before they had moved at all. The bonus paid correctly and was
// completely invisible - which for a reward whose entire job is to SAY you
// were not hit is the same as not paying it.
//
// Held for the length of the arc, they fly out, land, and are money on the
// floor for a beat. The sweep then brings in whatever the player has not
// walked over, exactly as the boss shower does.
const FLAWLESS_ORB_HOLD = 0.5;
const FLAWLESS_ORB_SWEEP_DELAY = 1;
// Ammo and health are pulled from this fraction of the money radius, at this
// many metres a second at the very centre of it.
const MAGNET_PICKUP_FRACTION = 0.55;
const PICKUP_PULL_SPEED = 9;
// Display names, kept out of ENEMY_TYPES because nothing else in the game
// needs an enemy to have one.
const BOSS_NAMES = {
  choir: 'THE DROWNED CHOIR',
  conductor: 'THE CONDUCTOR',
  forge: 'FORGE-TYRANT',
  overgrowth: 'THE OVERGROWTH',
  palecrown: 'THE PALE CROWN',
  colossus: 'COLOSSUS',
  siege: 'SIEGE',
  schism: 'SCHISM',
  maw: 'MAW',
  herald: 'HERALD',
};
const POISON_SPREAD_INTERVAL = 0.5;

// HOW LONG A FIRE ZONE'S BURN LASTS once an enemy steps out of it. Short on
// purpose: the zone refreshes it every frame they are inside, so this is only
// the tail - long enough that the burn survives a beat and pays out at least
// one tick for a body that walked through the edge, short enough that a trail
// is a place on the floor rather than a permanent condition applied to whatever
// once brushed it.
const FIRE_ZONE_BURN = 0.8;

class Game {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    document.getElementById('game').appendChild(this.renderer.domElement);
    // The tube. Everything from here on renders THROUGH this - see crt.js for
    // why the scanlines are not in it.
    this.crt = new CrtPass(this.renderer);
    this.crt.setSize(innerWidth, innerHeight);

    this.scene = new THREE.Scene();
    // THE NEAR PLANE IS SMALL ON PURPOSE, and 0.05 rather than 0.1 is a fix
    // rather than a preference.
    //
    // A near plane is a RECTANGLE, not a point: at 75 degrees its far corner
    // sits `near * 2.23` from the camera, so at 0.1 the frustum reached 0.22m
    // ahead of the eye. Anything closer than that is clipped away and, because
    // every surface in the game is front-faced, what the player sees through
    // the hole is the inside of the room. The tightest gap the game can put a
    // camera in is the 0.1m between the eye at 1.7 and the head at 1.8 - so at
    // 0.1 the near plane comfortably reached through the underside of any deck
    // the player jumped under, and the walkway vanished.
    //
    // Halving it takes the corner to 0.11 and, together with the camera
    // clearance the jump now keeps (see the ceiling block in player.js), puts
    // the whole frustum inside the space collision guarantees. It costs
    // nothing but depth precision, and this scene is 200m deep with a
    // logarithmic-free default that has plenty to spare.
    this.camera = new THREE.PerspectiveCamera(75, viewportAspect(), 0.05, 200);

    this.arena = buildArena(this.scene);
    // The lighting show that plays over the arena. Built here, before anything
    // can cue it, and it creates every light it will ever use up front - see
    // the light-count note in arena.js.
    this.rig = new Rig(this.scene, this.arena);
    // One navigation grid, shared by every enemy alive. It is baked from the
    // arena's obstacles at startup and reflooded toward the player a few times
    // a second - see nav.js for why it is one field rather than a path each.
    this.nav = new NavGrid(this.arena.obstacles, ARENA_BOUND, 0.5);
    // A second grid baked for wide bodies. The first is cut for a 0.5m agent,
    // so a boss steered by it would be routed through gaps it cannot fit
    // through and grind against the corners. Flooded only while something big
    // is actually alive, which is never on a normal wave.
    // Also taller: a boss stands well clear of anything generated terrain
    // suspends overhead - a gate's lintel, an overpass - which ordinary
    // enemies walk under, so all of it is a wall to a boss.
    //
    // BOTH GRIDS ARE REBAKED ONCE PER WAVE, when a new layout finishes rising.
    // See _settleTerrain: it happens in the break, with nothing alive that
    // could be standing in a cell about to turn solid.
    //
    // AND IT DOES NOT CLIMB. The step height is zero, so any raised surface is
    // a wall to this grid - which is exactly the routing it had before the
    // arena knew about height, and what it should keep: a body 3m across
    // taking a 0.6m step onto a crate reads as a bug, not as a step.
    this.navBig = new NavGrid(this.arena.obstacles, ARENA_BOUND, 1.6, BOSS_HEIGHT, 0);
    // The totems and their stations are static furniture: three totems and two
    // stations, built once and reused for every set. They are deliberately NOT
    // in the obstacle list. That USED to be because walking into one claimed
    // it, so nobody could stand inside one anyway; now that a claim takes a
    // shot or an E press, the reason is simply that the row stands in the
    // middle of the arena mid-run and solid pillars there would be five new
    // things to get caught on while a wave is chasing you.
    this.totemArea = new TotemArea(this.scene);
    // The mystery box, on the far side of the arena. Built once and reused,
    // and unlike the row it replaced it stands in EVERY wave break - see the
    // header of mysterybox.js for why the schedule went away.
    this.mysteryBox = new MysteryBox(this.scene);
    this.player = new Player(this.camera, this.scene);
    this.effects = new Effects(this.scene);
    // Every credit in the game, lying on the floor. One Points object for the
    // lot of them - see the header of money.js.
    this.money = new MoneyOrbs(this.scene);
    this.money.setViewport(this.crt.sceneHeight, this.camera.fov);
    this.ui = new UI();
    this.sfx = new SFX();
    // THE ARENA'S INTERIOR, generated per wave. Built here rather than in
    // buildArena because it wants the effects pool and the sfx bank for the
    // dust and the thump as a piece lands, and both of those are younger than
    // the arena. Its mesh pool is allocated in this constructor and never
    // grows - see the budget note at the top of terrain.js.
    this.terrain = new TerrainSet(this.arena, this.effects, this.sfx);
    // The seed every layout in this run is drawn from. One number, so a run's
    // arenas are reproducible from it and a layout that turns out to be no fun
    // can be replayed in the test.
    this._terrainSeed = (Math.random() * 0xffffffff) >>> 0;
    // The seed the run's THEME ORDER is dealt from - which of the ten themes
    // fills each five-wave block, and so which boss ends it. One number,
    // exactly like the terrain seed above and for the same reason: a run that
    // opened on EMBER and fell apart at BRINE can be replayed from it.
    //
    // Unlike the terrain seed it is RE-ROLLED for every run (see beginGame),
    // because the order the themes arrive in is the thing a run is meant to
    // vary by. Re-dealt on demand rather than stored as a deck, so there is no
    // per-run state to get out of step with the wave counter.
    this._themeSeed = (Math.random() * 0xffffffff) >>> 0;
    // Debug: pins every block to one theme. Null in a real run. Set through
    // setTheme() below, which is on the game object the console and the test
    // harness already reach for.
    this._forcedTheme = null;
    this.music = new Music('assets/audio/soundtrack.m4a');
    // Read before the first gesture builds the graph, so a muted player never
    // hears the opening bar leak out before the setting is applied.
    try { this.music.muted = localStorage.getItem('va-music-muted') === '1'; } catch {}
    // Same treatment as the mute above, and read before the first frame: the
    // beat strobe is a photosensitivity setting, so someone who turned it off
    // must never see it fire once on the way back in.
    try { this.rig.beatFlash = localStorage.getItem('va-beat-flash') === '1'; } catch {}
    // Screenshake, read before the first frame for the same reason: it is a
    // motion-comfort setting, and someone who turned it off must not be
    // shaken once on the way back in. Anything stored that is not a finite
    // number in range falls back to the default rather than poisoning every
    // camera offset in the game with a NaN.
    try {
      // The null check is load-bearing: Number(null) is 0, and a finite zero
      // is a perfectly valid setting - so testing the NUMBER alone would read
      // "never set" as "turned off" and ship the game with no shake at all.
      const raw = localStorage.getItem('va-shake');
      const n = Number(raw);
      if (raw !== null && raw !== '' && Number.isFinite(n)) {
        this._setShakeScale(Math.max(0, Math.min(SHAKE_MAX, Math.round(n / SHAKE_STEP) * SHAKE_STEP)));
      }
    } catch {}
    // Pixel size, read before the first frame so the arena is never shown once
    // at the wrong coarseness on the way in. Same null-versus-zero care as the
    // shake above, and for the same reason: index 0 is OFF, which is a real
    // choice a player can have made.
    this._pixelStep = PIXEL_DEFAULT;
    try {
      const raw = localStorage.getItem('va-pixel');
      const n = Number(raw);
      if (raw !== null && raw !== '' && Number.isInteger(n) && n >= 0 && n < PIXEL_STEPS.length) {
        this._pixelStep = n;
      }
    } catch {}
    this.crt.setPixelScale(this._pixelStep);
    // The orbs were sized a few lines above against the full-size buffer, and
    // the setting just changed what that is. Same reason _stepPixel re-sizes.
    this.money.setViewport(this.crt.sceneHeight, this.camera.fov);
    // ---- the controller ---------------------------------------------------
    //
    // The pad is POLLED, not listened to (the Gamepad API has no events), so
    // it is ticked from the frame loop like anything else in the game - see
    // _padUpdate. Both objects exist whether or not a controller is plugged
    // in; a pad that is never connected costs one array read a frame.
    this.pad = new Pad();
    this.menu = new MenuDriver();
    // THE PAD'S SELECTION TICKS. Same voice the mouse gets for a hover in
    // _wireMenuSounds - moving onto a control is one event with two devices,
    // and the player must not be able to hear which one they are holding.
    this.menu.onMove = () => this.sfx.menuMove();
    // Which device the player has their hands on RIGHT NOW. Everything the
    // player can see follows it - the prompts, the control sheet, the menu
    // selection - and it flips on use rather than on connection, so a pad left
    // plugged in changes nothing until it is picked up.
    this.inputMode = 'kbm';
    // The overlay the menu driver was last pointed at, so the pad's default
    // selection is only chosen when the screen actually changes.
    this._padRoot = null;
    // The L3 latch, and whether the run it asked for has actually started.
    this._padSprint = false;
    this._sprintEngaged = false;
    this._padSens = SENS_DEFAULT;
    this._padAimSens = AIM_SENS_DEFAULT;
    this._aimAssist = true;
    this._invertLook = false;
    this._loadPadPrefs();

    this.state = 'menu';
    this.kills = 0;
    this.credits = 0;
    this.comboKills = 0;
    this.comboTimer = 0;
    // Reset at the start of every wave; drives the perfect-clear bonus.
    this.waveDamageTaken = 0;
    // Whether the last wave was cleared without taking damage. Drives the
    // flawless orb shower, the No-Hit stack and the banner.
    this.lastPerfect = false;
    // 'solo' | 'versus'. Everything the second mode changes is gated on this,
    // and nothing reads it while it is 'solo'.
    this.mode = 'solo';
    // The versus rules and the two saved runs, or null in solo. See versus.js.
    this.match = null;
    // Whether a controller pass is in progress, and whether it has already
    // handed the run over. NOT a state: the game keeps running right through
    // a pass - see _updatePass.
    this._pass = false;
    this._swapped = false;
    this.wave = 0;
    this.enemies = [];
    this.projectiles = [];
    this.powerups = [];
    // Pickups that have been swept up at a wave clear and are flying into the
    // player. Off the live list on purpose: their effect is already banked, so
    // nothing must be able to collect, blink or despawn them again - all they
    // have left is the animation. See _vacuumPickups.
    this._absorbing = [];
    // Timed buffs swept up at a wave clear, waiting for the next wave to start
    // their clocks - see _vacuumPickups.
    this._pendingBuffs = [];
    this.queue = [];
    this._cfg = waveConfig(1, this._themeSeed, HAVE_TYPE, this._forcedTheme);
    // The drop safety net's countdown.
    this._reliefT = RELIEF_INTERVAL;
    this.spawnTimer = 0;
    // The live boss fight, or null. `parts` is every entity that counts as the
    // boss - one for most of them, several once Schism has split.
    this.bossFight = null;
    this.waveState = 'idle';
    // True between the passive-item pick and the wave it opens: the caption
    // has been shown and the music has come out from behind the filter while
    // the arena is still rising. startWave() clears it.
    this._waveCued = false;
    this.interT = 1.2;
    this.time = 0;
    this.stats = { shotsFired: 0, hits: 0, spawned: 0, damaged: 0 };
    // `shootFresh` is the trigger EDGE - true only on the frame the button
    // went down. Semi-auto weapons need it; the loop clears it every frame.
    // `moveF`/`moveS` are the ANALOGUE pair, in [-1, 1], and they are null
    // whenever the keyboard is what is driving - see the movement block in
    // player.js, which falls back to the booleans when they are.
    this.input = { forward: false, back: false, left: false, right: false, jump: false, shoot: false, shootFresh: false, melee: false, aim: false, sprint: false, crouch: false, moveF: null, moveS: null };
    // Double Dash: the game time each movement key was last pressed FRESH, so
    // a second press inside DOUBLE_TAP_WINDOW reads as a dash. Keyed by
    // e.code; a key held down never writes here (see _bind).
    this._tapT = { KeyW: -99, KeyS: -99, KeyA: -99, KeyD: -99 };
    // Whether the held-TAB build sheet is up. Held, not toggled, so it has to
    // be released by keyup AND by blur - alt-tabbing away with it down would
    // otherwise leave it stuck over the fight on the way back.
    this._statsHeld = false;
    // Whether the debug panel is up. It parks the run in the PAUSED state -
    // see _openDebug - so this is also what stops the pause screen and the
    // pointer-lock handler from arguing with it about who owns that state.
    this._debugOpen = false;
    this.emptyClickCd = 0;

    // Refilled and handed to the rig every frame. One object for the life of
    // the game, per the no-allocation rule below.
    this._rigState = {
      mode: 'idle', beat: 0, level: 0, bar: 0, downbeat: false,
      healthFrac: 1, comboMult: 1, bossColor: 0xffffff, bossPos: null,
      themeColor: 0xffffff,
      // BLACKOUT's multiplier on the fog the rig drives. One writer for the
      // density: rig.js breathes it with the music and this scales its target.
      fogMult: 1,
      // The camera's world position, so the laser bank can billboard its
      // ribbons. A reference, not a copy: the camera object outlives the run.
      camPos: null,
      // Where the offers are standing and what colour each is - see
      // _fillOffers(). Emptied and refilled every frame; never reallocated.
      offers: [],
    };
    // The entries that array is filled with. Three, because a row is three,
    // and reused rather than rebuilt for the same reason everything else in
    // the frame loop is.
    this._offerSlots = [
      { x: 0, z: 0, color: 0xffffff },
      { x: 0, z: 0, color: 0xffffff },
      { x: 0, z: 0, color: 0xffffff },
    ];

    // Scratch objects reused every frame so the hot path allocates nothing.
    this._shakeV = new THREE.Vector3();
    this._killPos = new THREE.Vector3();
    // Where the last boss part died, so the kill's orb shower comes out of the
    // corpse rather than out of the player. Boss parts die during the enemy
    // sweep; the payout is made at the wave clear a frame or two later.
    this._bossDeathPos = new THREE.Vector3();
    // Bound once. money.update() calls it per orb collected, and allocating a
    // closure per frame for that is the kind of garbage this loop is careful
    // not to make.
    this._onOrb = (v) => this._collectOrb(v);
    // Set by _collectOrb, consumed once per frame by _updateMoney.
    this._creditsDirty = false;
    // Item charge owed but not yet handed over, and the orb value still down
    // there to carry it. Cleared by _startWaveCharge at the top of every wave;
    // the defaults here only have to survive the frames before the first one.
    this._pendingCharge = 0;
    this._pendingValue = 0;
    this._addCharge = 0;
    this._bossChargeFrac = 1;
    // The field of view the orbs were last sized for. Aiming moves it every
    // frame of a raise - see the sync in _loop.
    this._fov = this.camera.fov;
    this._aimTarget = new THREE.Vector3();
    // The eye, for the aim-assist sweep. Its own vector rather than a shared
    // one because the sweep runs before the shot does and _killPos is in use
    // by then.
    this._assistEye = new THREE.Vector3();
    // Where the candidate enemy's hit sphere actually is, in world space. The
    // assist used to reconstruct that from e.pos plus the hitbox's LOCAL y,
    // which quietly ignored the group transform the hitbox is parented to -
    // the crowd bob, the sway and a flier's altitude ease all live there.
    this._assistAt = new THREE.Vector3();
    // Where a swept-up pickup lands on the player - see _updateAbsorbing.
    this._absorbAt = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();
    this._rayEnd = new THREE.Vector3();
    this._screen = new THREE.Vector2();
    this._knockback = new THREE.Vector3();
    this._targets = [];
    this._hits = [];
    this._pendingSpawns = [];
    this._shotRay = new THREE.Raycaster();
    this._shotRay.far = 120;
    this._meleeDir = new THREE.Vector3();
    // Counts down to the frame the swing connects; see MELEE_SWING.
    this._meleeSwing = 0;
    // Enemies already touched by the shot in flight. A scattergun sends eight
    // pellets through _firePellet, and every passive item effect is per-shot,
    // not per-pellet: without this a point-blank shell would roll Petrify
    // eight times and shove its target twelve metres.
    this._shotHits = new Set();
    // WHETHER EACH ENEMY THIS SHOT TOUCHED CRITTED. Beside _shotHits and
    // cleared with it, for the same reason it exists: the crit is decided per
    // TRIGGER PULL per BODY, so nine pellets into one chest all crit or none
    // of them do, and a shotgun cannot tick Telltale's counter eight times off
    // one shell. See _resolveHit.
    this._shotCrit = new Map();
    // CRITICAL OVERFLOW's answer for the whole trigger pull. Raised by
    // _resolveHit and settled once at the end of shoot(), beside the two sets
    // above and cleared with them.
    this._shotWasCrit = false;
    // DELAYED FUSE's stuck rounds, and the point one of them goes off at.
    this._fuses = [];
    this._fuseAt = new THREE.Vector3();
    // Which fuse the countdown blip is currently counting, and which blink of
    // it was last sounded. See the foot of _updateFuses.
    this._fuseBeepAt = 0;
    this._fuseBeepN = -1;
    // FEAR AURA and STATUS CONDUIT both sweep the whole roster, so neither runs
    // per frame: they are on their own clocks, a few times a second, which is
    // finer than either effect can be seen at and a tenth of the work.
    this._auraT = 0;
    this._conduitT = 0;
    // SHARED PAIN's hook, and whether it is currently installed. Bound once
    // here so the install is an assignment rather than a fresh closure per
    // frame - see the note beside setShareHook in enemy.js.
    this._shareOn = false;
    this._onShare = (d, silent) => this._sharePain(d, silent);
    // GRAY MATTER's last state, so the uniform is written when it CHANGES
    // rather than every frame. It is a shader uniform upload.
    this._monoOn = false;
    // METRONOME's last seen half-beat index. See the gate in the frame loop.
    this._metroPulse = -1;
    this._blastAt = new THREE.Vector3();
    // Lightning Wizard's strike point. Its OWN scratch and not _blastAt: a
    // bolt is rolled inside _landShot, before Detonator has fired, and sharing
    // the vector moved Detonator's blast onto whatever the last bolt hit.
    this._boltAt = new THREE.Vector3();
    this._blastHit = false;
    // Where the last pellet stopped, for Breach Round's blast.
    this._lastImpact = new THREE.Vector3();
    this._pullTo = new THREE.Vector3();
    this._shardDir = new THREE.Vector3();
    // Seeker's scratch: the candidate's world position, the direction to it,
    // its own hit list, and the candidates already rejected for being behind
    // cover this shot.
    this._homeAt = new THREE.Vector3();
    this._homeDir = new THREE.Vector3();
    this._homeRay = new THREE.Raycaster();
    this._homeHits = [];
    this._homeSkip = [];
    this._chainFrom = new THREE.Vector3();
    this._chainTo = new THREE.Vector3();
    // Deaths that owe an after-effect, recorded during the enemy sweep and
    // played once it has finished. Doing it inline would let a corpse blast
    // read the enemy list while it is half-compacted - the same hazard the
    // sweep itself is written to avoid. Both arrays are grown once and reused.
    this._deathPos = [];
    this._deathBurn = [];
    this._deathFrozen = [];
    // Ashen's lingering clouds. Capped because each one drips particles every
    // frame it is alive and a wave clear can kill twenty burning enemies at
    // once; the oldest is recycled rather than the newest refused, so the
    // cloud you just made is always the one that exists.
    this._ash = [];
    // Hellfire: the trail itself, when it is burning, and where the last patch
    // was laid so the next one waits for FIRE_STEP of movement.
    this._fire = [];
    this._fireUntil = 0;
    this._fireLastX = 0;
    this._fireLastZ = 0;
    this._ashAt = new THREE.Vector3();
    // Player-damaging ground zones, and telegraphed impacts. Both are plain
    // data with no scene objects of their own, the same trick _ash uses: the
    // hazards are drawn by the particle pool and the mortars by the telegraph
    // pool, so creating one costs nothing and disposing one is a splice.
    //
    // Hazards are a SEPARATE list from _ash rather than a flag on it: the ash
    // loop walks every enemy while this one tests a single player, so folding
    // them together would put a branch in a hot loop that is wrong half the
    // time it runs.
    this._hazard = [];
    // ACTIVE ITEMS THAT ARE STILL RUNNING. Fifteen of the thirty-seven do not
    // finish on the frame they are pressed; this is the list that ticks them
    // and, more importantly, the list that ENDS them. See RunningItems.
    this.running = new RunningItems();
    // Reused every frame by the HUD - chips() fills it rather than allocating.
    this._itemChips = [];
    // WHAT THE PLAYER HAS LEFT IN THE ARENA - turrets, mines, bees, a bomb on
    // a fuse, a singularity. Same contract and same eight lines of driving as
    // this.projectiles; see js/deploy.js.
    this._deployed = [];
    this._mortars = [];
    this._spreadCd = 0;
    this._deathCount = 0;
    // Live enemies wide enough to need the big-agent nav grid. Counted during
    // the sweep so the grid is only flooded on the waves that have one.
    this._bigAlive = 0;
    // The three things an enemy is allowed to do TO the player, as stable
    // functions rather than as closures rebuilt at each use. ORGAN GRINDER
    // swaps them for no-ops and back; everything else in the game holds the
    // originals for the life of the session.
    this._onHitPlayer = (d, pos, source) => this._hurtPlayer(d, pos, source);
    this._onPlayerStatus = (kind, secs) => this._afflictPlayer(kind, secs);
    this._onPullPlayer = (dx, dz, strength) => this._pullPlayer(dx, dz, strength);
    this._enemyCtx = {
      player: this.player,
      enemies: this.enemies,
      obstacles: this.arena.obstacles,
      nav: this.nav,
      navBig: this.navBig,
      time: 0,
      // The music, for the crowd bob in Enemy.update. Refreshed every frame
      // alongside `time` - never captured, for the same reason `mods` is not.
      beat: 0,
      level: 0,
      // `source` is the enemy that landed the hit, where there is one. Only
      // Thorns reads it, and it falls back to whatever is standing closest to
      // the impact - a projectile has no owner to name.
      // HELD AS FIELDS AS WELL AS INSTALLED HERE, because ORGAN GRINDER swaps
      // all three out for no-ops while its monkey is on the floor and has to be
      // able to put the real ones back - see the LURE block in _updateEnemies.
      // A closure rebuilt every frame would allocate three functions per frame
      // for the whole run to serve five seconds of one item.
      onHitPlayer: this._onHitPlayer,
      addProjectile: (x, y, z, type, speedScale, spreadRad) =>
        this._spawnProjectile(x, y, z, type, speedScale, spreadRad),
      addGrenade: (x, y, z, damage) => this._spawnGrenade(x, y, z, damage),
      addSpit: (x, y, z, kind) => this._spawnSpit(x, y, z, kind),
      // What an enemy puts ON the player. Routed through the game rather than
      // called on the player directly for the same reason onHitPlayer is: the
      // enemy has no business knowing about Holy Mantle, Evasion or the
      // difficulty of the wave, and this is where any of that would go.
      applyPlayerStatus: this._onPlayerStatus,
      addHazard: (x, z, radius, life, dps, kind) =>
        this._addHazard(x, z, radius, life, dps, kind),
      addMortar: (x, z, radius, delay, damage) => this._addMortar(x, z, radius, delay, damage),
      // Colossus throwing one of its turrets. It is a real enemy, spawned
      // mid-air with its flight already set - see _spawnTurret.
      addTurret: (fx, fy, fz, tx, tz) => this._spawnTurret(fx, fy, fz, tx, tz),
      // The Pale Crown driving one of its anchors into the floor. Also a real
      // enemy, and unlike every other spawn hook this one RETURNS it: the boss
      // has to hold references to its three, because the shell comes down when
      // all three are dead and a count of live anchors in the arena would be
      // wrong the moment two shells overlapped.
      addAnchor: (x, z, type) => this._spawnAnchor(x, z, type),
      // PLAGUE's carrion putting a body back on its feet. A separate hook from
      // addAnchor because what it makes is a REAL ENEMY of a real type, scaled
      // by the wave the way the wave's own spawns are - an anchor is scaled by
      // health alone, since it never moves and never hits.
      reanimate: (x, z, type, frac) => this._spawnRevenant(x, z, type, frac),
      // SOLAR's zealot going off in the player's face, and its halo taking the
      // crosshair away. Both are narrow one-way doors into the presentation
      // layer, which is deliberate: these are the only two enemies in the game
      // that reach it, and they should have to say so.
      blind: (secs) => this.rig.cueBlind(secs),
      blindHud: () => { this._hudBlind = true; },
      pullPlayer: this._onPullPlayer,
      bossEvent: (kind, enemy) => this._bossEvent(kind, enemy),
      // `mods` is deliberately absent here: rebuildMods() swaps the object on
      // every draft pick, so anything captured at construction goes stale on
      // the first upgrade. _updateEnemies() sets it fresh each frame, before
      // any enemy reads it.
      effects: this.effects,
      sfx: this.sfx,
    };
    this._projCtx = {
      // GROUND obstacles, not all of them: a shot fired at a player up on a
      // catwalk must not stop against the deck they are standing on. The high
      // ground is meant to buy sightlines and cost you cover, so the decks are
      // deliberately not bulletproof. Do not "fix" this to arena.obstacles.
      obstacles: this.arena.ground,
      onHitPlayer: (d, pos) => this._hurtPlayer(d, pos),
      // Reload Burst's shards damage enemies and never the player, so they get
      // the enemy list and a blast that cannot reach back.
      enemies: this.enemies,
      onBlast: (pos, dmg, radius) => this._blast(pos, dmg, radius, null, false),
      // A blight's spit grows its pool where it lands, so the projectile ctx
      // needs the same hazard hook the enemy ctx has. Kind is left to default:
      // a spit is a pool, and it is capped against the other pools.
      addHazard: (x, z, radius, life, dps, kind) =>
        this._addHazard(x, z, radius, life, dps, kind),
      // ...and a sporegun's seed grows a MORTAR rather than a pool - a circle
      // that fills and then goes off - so the same argument puts the mortar
      // hook here too.
      addMortar: (x, z, radius, delay, damage) =>
        this._addMortar(x, z, radius, delay, damage),
      player: this.player,
      effects: this.effects,
      sfx: this.sfx,
    };
    // WHAT A DEPLOYABLE IS ALLOWED TO REACH FOR. Built once, beside the other
    // two, and deliberately narrow: a turret gets the enemy list and a way to
    // hurt one, and nothing that would let it reach into the run.
    //
    // onBlast takes hitPlayer as an argument here where the projectile ctx
    // hardcodes it to false, and that ONE argument is the whole difference
    // between a mine and a meteor - the mine's blast does not know who set it
    // and the meteor's cannot touch the player who called it. Neither of them
    // owns a copy of the falloff arithmetic.
    // ORGAN GRINDER'S MONKEY, while one is on the floor and armed. Recomputed
    // once a frame in _updateDeployed and read in exactly two places - the LURE
    // block in _updateEnemies, and nowhere else.
    this._lure = null;
    // The pets, one fixed slot per species: 0 is the MAGPIE, 1 the LAMPREY.
    // See _syncCompanions.
    this._companions = [null, null];
    this._deployCtx = {
      obstacles: this.arena.ground,
      enemies: this.enemies,
      effects: this.effects,
      sfx: this.sfx,
      player: this.player,
      onBlast: (pos, dmg, radius, skip, hitPlayer) =>
        this._blast(pos, dmg, radius, skip || null, !!hitPlayer),
      hurtEnemy: (e, dmg, dir) => this.hurtEnemy(e, dmg, dir),
      pull: (point, radius, dist) => this._pull(point, radius, dist, null),
      deploy: (d) => this.deploy(d),
      // THE BEAT, for anything that fires on it. Refreshed per frame in
      // _updateDeployed alongside the enemy context's copy - see Music.pulse.
      pulse: 0,
      pulseWhole: true,
      time: 0,
    };
    // WHAT A COMPANION IS ALLOWED TO REACH FOR. Narrower than the deployables'
    // context in one direction and wider in another, which is exactly the
    // difference between the two kinds of thing:
    //
    //   * arena.obstacles, not arena.ground. A turret is a fixed point and a
    //     projectile's ctx deliberately ignores the decks so a shot can reach a
    //     catwalk - but the magpie WALKS, and a bird that strolled through a
    //     crate would be the least convincing thing in the room.
    //   * onOrb, which nothing else in the game is given. It is the same
    //     callback the player's own magnet pays through, so the credits, the
    //     item charge slice and BLOOD FROM STONE all happen once, in
    //     _collectOrb, whoever picked the orb up.
    //   * no onBlast, no deploy, no addHazard. A pet cannot put anything in the
    //     arena and cannot hurt the player.
    this._compCtx = {
      obstacles: this.arena.obstacles,
      enemies: this.enemies,
      effects: this.effects,
      sfx: this.sfx,
      hurtEnemy: (e, dmg, dir) => this.hurtEnemy(e, dmg, dir),
      onOrb: this._onOrb,
      pulse: 0,
      // The leech bites once a beat, not twice - see Lamprey.update.
      pulseWhole: true,
      time: 0,
    };

    // EVERY NUMBER IN THE GAME COMES OUT OF HERE. Enemy.takeDamage is the one
    // place hp is ever reduced, so installing the sink once covers bullets,
    // melee, fire, poison, mines, sentries, thorns, blasts and every item at
    // the same time - see setDamageSink in enemy.js.
    setDamageSink((pos, dealt, crit) => {
      if (dealt > 0) this.effects.damageNumber(pos, dealt, crit);
    });
    // A capacitor's plate coming off. A ring rather than a number, because
    // nothing was dealt - the shot was spent, and what the player needs to
    // know is that it counted for something and that the next one will land.
    setPlateSink((pos) => {
      this.effects.shockwave(pos, 0x7ef0ff, 1.5, 0.22);
      this.effects.burst(pos, 0xd6feff, 10, 4, 2, 0.3);
    });

    this._bind();
    // Try to get the music going straight away. Blocked until the player
    // touches something, on every browser that matters - see _audioGesture().
    this._audioGesture();
    this.ui.showStart();
    this.last = performance.now();
    this.renderer.setAnimationLoop((now) => this._loop(now));

    if (autotest) {
      this.autoTest = true;
      this._botMove = { x: 0, z: 0 };
      this._wt = 0;
      this._dir = 0;
      this.beginGame();
      window.__game = this;
      // The upgrade table and the item pool, for tests that read either as
      // data. Autotest only, like everything else in this block.
      this.__upgradesForTest = UPGRADES;
      this.__itemsForTest = ACTIVE_ITEMS;
      // The box's reel pool, as a function rather than a snapshot: the whole
      // property worth testing is that it depends on what the player is
      // CARRYING at the moment it is asked, which a captured array cannot show.
      this.__poolForTest = shuffledPool;
      // The Enemy class, so a test can stand one up without a wave.
      this.__EnemyForTest = Enemy;
      /**
       * WAIT ON THE GAME CLOCK, not on the wall clock. For test/*.mjs.
       *
       * Every timed thing in this game - an orb's flight, a relief drop's
       * cooldown, a zone's life, a wave's spawn interval - is integrated per
       * frame against a dt the loop CLAMPS at 0.05. So a host rendering at
       * five frames a second advances a quarter-second of game per second of
       * wall time, and a test that slept for two real seconds got half a
       * second of game and asserted on a fight that had barely started. That
       * is not a flaky test, it is a test measuring the wrong clock: it fails
       * on a loaded machine and passes on an idle one with the same build.
       *
       * `until` is polled and short-circuits the wait the moment it is true,
       * so a healthy run is no slower than the sleep it replaces - the seconds
       * are the CEILING, exactly as the old wall deadlines were meant to be.
       *
       * @param {number} seconds  of game time, the most this will wait
       * @param {Function} [until]  polled; resolves early when it returns true
       * @returns {Promise<void>}
       */
      window.__simWait = (seconds, until) => new Promise((done) => {
        const deadline = this.time + seconds;
        const t = setInterval(() => {
          if ((until && until()) || this.time >= deadline) {
            clearInterval(t);
            done();
          }
        }, 30);
      });
      window.__report = () => ({
        state: this.state,
        // THE SIMULATION'S OWN CLOCK, so a test can wait on how much GAME has
        // happened rather than on how long it has been standing there. The two
        // are the same number on an idle machine and nothing like each other
        // on a loaded one - the loop clamps dt at 0.05, so a host rendering at
        // five frames a second advances a quarter of a second of game per
        // second of wall time, and every fixed-duration wait in the suite
        // silently became a quarter as long. See test/smoke.mjs.
        simTime: this.time,
        wave: this.wave,
        kills: this.kills,
        credits: this.credits,
        flawlessStreak: this.player.flawlessStreak,
        flawlessMult: this.flawlessMult(),
        upgrades: { ...this.player.upgrades },
        upgradeCount: Object.values(this.player.upgrades).reduce((a, b) => a + b, 0),
        weapon: this.player.weapon.name,
        // The receiver plates and the marked upgrades they stand for. Kept
        // side by side so the smoke test can assert they agree.
        gunMarks: this.player.gun.getObjectByName('marks').children
          .reduce((n, m) => n + (m.visible ? 1 : 0), 0),
        markedUpgrades: Object.keys(this.player.upgrades)
          .filter((id) => UPGRADES[id] && UPGRADES[id].mark).length,
        maxHealth: this.player.maxHealth,
        magSize: this.player.magSize,
        enemies: this.enemies.length,
        queue: this.queue.length,
        shots: this.stats.shotsFired,
        hits: this.stats.hits,
        spawned: this.stats.spawned,
        damaged: this.stats.damaged,
        health: Math.round(this.player.health),
        powerups: this.powerups.length,
        moneyOrbs: this.money.count,
        ammoPickups: this.powerups.reduce((n, p) => n + (p.typeKey === 'ammo' ? 1 : 0), 0),
        projectiles: this.projectiles.length,
        // Leak canaries. `geometries` is everything the renderer still holds
        // buffers for; `liveGeometries` is what the scene graph actually
        // references. A gap between them means something was removed from the
        // scene without being disposed.
        geometries: this.renderer.info.memory.geometries,
        liveGeometries: this._countLiveGeometries(),
        lights: this._countLights(),
        textures: this.renderer.info.memory.textures,
        programs: this.renderer.info.programs.length,
      });
    }
    if (padtest) window.__game = this;
  }

  // Test helper: unique geometries reachable from the scene graph.
  _countLiveGeometries() {
    const seen = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) seen.add(o.geometry.uuid);
    });
    return seen.size;
  }

  // Test helper. The light count must never move: three.js keys its shader
  // programs on it, so adding or removing one light recompiles every material
  // in the scene.
  _countLights() {
    let n = 0;
    this.scene.traverse((o) => {
      if (o.isLight) n++;
    });
    return n;
  }

  _bind() {
    const canvas = this.renderer.domElement;
    addEventListener('keydown', (e) => {
      // Guards any text input that ever ends up on screen: without this a
      // space would be swallowed by the jump binding's preventDefault, and R
      // and E would fire game actions mid-word.
      if (this._typing(e.target)) return;
      // Any key at all hands control back to the keyboard. The player's hands
      // are the only authority on which device is in use, and this is what
      // they say.
      this._setInputMode('kbm');
      switch (e.code) {
        case 'KeyW': this._tapMove(e.code, this.input.forward); this.input.forward = true; break;
        case 'KeyS': this._tapMove(e.code, this.input.back); this.input.back = true; break;
        case 'KeyA': this._tapMove(e.code, this.input.left); this.input.left = true; break;
        case 'KeyD': this._tapMove(e.code, this.input.right); this.input.right = true; break;
        case 'Space': this.input.jump = true; e.preventDefault(); break;
        // SPRINT, on either shift. Held; the player never has to let go of it -
        // see _updateSprint, which refuses the button rather than asking the
        // player to stop pressing it.
        case 'ShiftLeft': case 'ShiftRight': this.input.sprint = true; break;
        case 'KeyR': this.tryReload(); break;
        case 'KeyE': this.tryUse(); break;
        // THE ACTIVE ITEM. Under the movement hand and one key off W, which is
        // where a button pressed in the middle of a retreat has to be.
        case 'KeyQ': this.tryItem(); break;
        // MELEE. It used to be the right mouse button, which is now where the
        // gun is raised from - see the mousedown handler. V is the key that
        // button's owners reach for.
        case 'KeyV': this.input.melee = true; break;
        // CROUCH, and the slide out of a sprint. Held rather than latched
        // here - player.js reads the EDGE and owns what a press means, so the
        // keyboard and the pad cannot drift apart on the toggle. Both keys,
        // because both are the one players reach for.
        case 'KeyC': case 'ControlLeft': this.input.crouch = true; break;
        // Fullscreen is bound on the window rather than to a button alone so
        // it is reachable mid-run without giving up pointer lock to click.
        case 'KeyF': this._toggleFullscreen(); break;
        // Held, and preventDefault for the same reason Space gets it: these
        // listeners are on the window, and an un-prevented Tab walks browser
        // focus off the canvas and out of pointer lock.
        case 'Tab': this._openStats(); e.preventDefault(); break;
        // BACK, from the keyboard. The browser also uses Escape to leave
        // pointer lock and fullscreen, which is exactly why it is only ever
        // read here as "close the screen on top" - it can never reach into a
        // live run and change anything.
        case 'Escape':
          if (this._debugOpen) this._closeDebug();
          else if (this._subScreenOpen()) this._closeSubScreen();
          break;
        // ---- DEBUG ------------------------------------------------------
        // $1,000, for testing the shop and the box without playing a run up to
        // the money first. Digit0 and not Numpad0, so it is the key above the
        // letters and nothing on the pad can reach it.
        //
        // THIS IS A CHEAT AND IT IS IN THE SHIPPING BUILD. It is one line and
        // it is here on purpose - see _debugCredits - but it is the kind of
        // thing that gets forgotten, so it says so in two places.
        case 'Digit0': this._debugCredits(); break;
        // THE DEBUG PANEL. Next key along from the credits cheat, and it says
        // the same thing about itself - see _openDebug.
        case 'Digit9': this._toggleDebug(); break;
      }
    });
    addEventListener('keyup', (e) => {
      if (this._typing(e.target)) return;
      switch (e.code) {
        case 'KeyW': this.input.forward = false; break;
        case 'KeyS': this.input.back = false; break;
        case 'KeyA': this.input.left = false; break;
        case 'KeyD': this.input.right = false; break;
        case 'Space': this.input.jump = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.input.sprint = false; break;
        case 'KeyV': this.input.melee = false; break;
        case 'KeyC': case 'ControlLeft': this.input.crouch = false; break;
        case 'Tab': this._closeStats(); e.preventDefault(); break;
      }
    });
    // Losing focus mid-key would otherwise leave the player running forever,
    // or reading a stat panel it can no longer be told to close.
    addEventListener('blur', () => {
      this._clearInput();
      this._closeStats();
      // A pad keeps buzzing while the tab is in the background, which is the
      // one piece of this game that can follow the player out of it.
      this.pad.stopRumble();
    });
    canvas.addEventListener('mousedown', (e) => {
      this._setInputMode('kbm');
      if (e.button === 0) {
        this._audioGesture();
        if (this.state === 'playing') {
          if (!this.autoTest && document.pointerLockElement !== canvas) this._lock();
          this.input.shoot = true;
          this.input.shootFresh = true;
        } else if (this.state === 'menu') {
          this.beginGame();
        } else if (this.state === 'paused') {
          this.resume();
        }
      } else if (e.button === 2) {
        e.preventDefault();
        // AIM, held. The mouse's second button is where every shooter puts
        // this, which is why melee moved to V rather than the other way round.
        if (this.state === 'playing') this.input.aim = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.shoot = false;
      if (e.button === 2) this.input.aim = false;
    });
    document.addEventListener('mousemove', (e) => {
      // A real shove of the mouse, not the pixel of jitter a resting one
      // makes - see MOUSE_WAKE. Checked before the pointer-lock test below so
      // that moving the mouse during pad play still takes the game back to
      // keyboard prompts, which is the moment the player expects it.
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > MOUSE_WAKE) this._setInputMode('kbm');
      if (this.state !== 'playing' || this.autoTest) return;
      if (document.pointerLockElement !== canvas) return;
      // Zoom-relative sensitivity. The mouse has no slider of its own, so
      // aiming scales it by a fixed ratio rather than by a setting: at 0.6 the
      // hand travel that crossed a target at the hip still crosses it down the
      // sights, which is the whole point of a fixed ratio - muscle memory
      // survives the zoom.
      const k = 0.0021 * (1 - (1 - MOUSE_AIM_SENS) * this.player.aimT);
      this.player.yaw -= e.movementX * k;
      this.player.pitch -= e.movementY * k;
      this.player.pitch = Math.max(-1.5, Math.min(1.5, this.player.pitch));
    });
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== canvas) {
        // Losing the pointer is only a pause for a MOUSE player. Pad play does
        // not hold the pointer at all - _setInputMode releases it on the way
        // in - so without this test picking up the controller would pause the
        // game on the very frame it started reading it.
        if (this.state === 'playing' && !this.autoTest && this.inputMode !== 'pad') {
          this.pause();
        }
      } else if (this.state === 'paused' && !this._debugOpen) {
        this.state = 'playing';
        this.ui.hidePause();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    const onStart = () => {
      this._audioGesture();
      if (this.state === 'menu') this.beginGame();
    };
    document.getElementById('overlay-start').addEventListener('click', onStart);
    document.getElementById('btn-start').addEventListener('click', (e) => {
      e.stopPropagation();
      onStart();
    });
    // The second mode. It ASKS HOW MANY FIRST rather than starting: two,
    // three and four are different games and the count cannot be changed once
    // the first snapshot is taken.
    //
    // stopPropagation for the same reason every other button on this overlay
    // has it: #overlay-start is click-to-continue, and without it this would
    // start a solo run underneath the sub-screen.
    document.getElementById('btn-versus').addEventListener('click', (e) => {
      e.stopPropagation();
      this._audioGesture();
      if (this.state === 'menu') this.ui.showPlayerCount();
    });
    // One handler per count, off the button's own data-count, so adding a
    // fifth seat one day is markup and a colour and nothing here.
    for (const btn of document.querySelectorAll('#overlay-players [data-count]')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._audioGesture();
        if (this.state !== 'menu') return;
        this._closeSubScreen();
        this.beginGame('versus', Number(btn.dataset.count));
      });
    }
    document.getElementById('btn-players-back').addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeSubScreen();
    });
    document.getElementById('btn-restart').addEventListener('click', (e) => {
      e.stopPropagation();
      this._audioGesture();
      this._restartFromOver();
    });
    // ---- the settings screen ------------------------------------------------
    //
    // MUSIC and FLASHES used to be a pair of buttons duplicated across the
    // start and pause overlays, which meant two nodes and a sync loop for
    // every setting the game would ever grow. They live on one screen now, so
    // each control is a single button with a single label to keep in step.
    //
    // The screen itself is opened from either menu and returns to whichever
    // opened it - see _openSettings.
    this._musicBtn = document.getElementById('btn-music');
    this._musicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.music.toggleMute();
      this._saveMuted();
      this._syncMuteBtns();
    });
    this._syncMuteBtns();

    this._flashBtn = document.getElementById('btn-flash');
    this._flashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rig.beatFlash = !this.rig.beatFlash;
      // The strobe holds whatever opacity the last frame left on it, and a
      // paused game does not tick the rig - so clear it here or turning the
      // setting off mid-pause leaves the screen washed until the resume.
      if (!this.rig.beatFlash) {
        this.rig.flash = 0;
        this.ui.setStrobe(0);
      }
      this._saveBeatFlash();
      this._syncFlashBtns();
    });
    this._syncFlashBtns();

    // Screenshake. The pips are built once, here, and only their class is
    // rewritten afterwards - eight nodes torn down and rebuilt on every press
    // of a key the player is going to hold is pure waste.
    this._shakePips = [];
    const pipRow = document.getElementById('shake-pips');
    for (let i = 0; i < SHAKE_PIPS; i++) {
      const pip = document.createElement('i');
      pipRow.appendChild(pip);
      this._shakePips.push(pip);
    }
    this._shakeVal = document.getElementById('shake-val');
    this._shakeDown = document.getElementById('btn-shake-down');
    this._shakeUp = document.getElementById('btn-shake-up');
    this._shakeDown.addEventListener('click', (e) => {
      e.stopPropagation();
      this._stepShake(-1);
    });
    this._shakeUp.addEventListener('click', (e) => {
      e.stopPropagation();
      this._stepShake(1);
    });
    this._syncShake();

    // Pixel size. The same stepper as the screenshake above, down to the pips
    // being built once - see there for why.
    this._pixelPips = [];
    const pixRow = document.getElementById('pixel-pips');
    for (let i = 0; i < PIXEL_STEPS.length - 1; i++) {
      const pip = document.createElement('i');
      pixRow.appendChild(pip);
      this._pixelPips.push(pip);
    }
    this._pixelVal = document.getElementById('pixel-val');
    this._pixelDown = document.getElementById('btn-pixel-down');
    this._pixelUp = document.getElementById('btn-pixel-up');
    this._pixelDown.addEventListener('click', (e) => {
      e.stopPropagation();
      this._stepPixel(-1);
    });
    this._pixelUp.addEventListener('click', (e) => {
      e.stopPropagation();
      this._stepPixel(1);
    });
    this._syncPixel();

    // ---- the controller rows ------------------------------------------------
    //
    // Hidden until a DualSense has been seen (body.pad-seen, set in
    // _padUpdate), so a keyboard player never reads four rows about a device
    // that is not in the room.
    // TWO steppers on one scale - the rate with the gun down and the rate with
    // it up. Built by the same three lines each, because they are the same
    // control twice and the day a third sensitivity appears it should be one
    // more call rather than one more copy of this block.
    const buildSens = (idBase, get, set) => {
      const pips = [];
      const row = document.getElementById(idBase + '-pips');
      for (let i = 0; i < SENS_STEPS; i++) {
        const pip = document.createElement('i');
        row.appendChild(pip);
        pips.push(pip);
      }
      const dial = {
        pips,
        val: document.getElementById(idBase + '-val'),
        down: document.getElementById('btn-' + idBase + '-down'),
        up: document.getElementById('btn-' + idBase + '-up'),
        get,
        set,
      };
      dial.down.addEventListener('click', (e) => {
        e.stopPropagation();
        this._stepSens(dial, -1);
      });
      dial.up.addEventListener('click', (e) => {
        e.stopPropagation();
        this._stepSens(dial, 1);
      });
      return dial;
    };
    this._sensDial = buildSens('sens', () => this._padSens, (v) => { this._padSens = v; });
    this._aimSensDial = buildSens(
      'aimsens', () => this._padAimSens, (v) => { this._padAimSens = v; }
    );
    this._assistBtn = document.getElementById('btn-assist');
    this._assistBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._aimAssist = !this._aimAssist;
      this._savePadPrefs();
      this._syncPadBtns();
    });
    this._rumbleBtn = document.getElementById('btn-rumble');
    this._rumbleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pad.rumbleOn = !this.pad.rumbleOn;
      // A motor left spinning by the effect that was running when the setting
      // was turned off would outlive the setting itself.
      if (!this.pad.rumbleOn) this.pad.stopRumble();
      else this.pad.rumble(0.4, 0.3, 140, 2);
      this._savePadPrefs();
      this._syncPadBtns();
    });
    this._invertBtn = document.getElementById('btn-invert');
    this._invertBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._invertLook = !this._invertLook;
      this._savePadPrefs();
      this._syncPadBtns();
    });
    this._syncPadBtns();
    this._syncSens();

    // The on-screen keyboard, built once. It only ever appears in pad mode -
    // see the .pad-only rule - and it writes straight into the same field the
    // keyboard player types in, so there is one name and one save path.
    this._audioHint = document.getElementById('audio-hint');
    // ONE SOURCE OF TRUTH for the bindings on screen. The panel starts empty
    // in the markup and is filled here for the keyboard; _setInputMode swaps
    // it for the pad sheet and back.
    this._controlsEl = document.querySelector('.controls');
    renderControls(this._controlsEl, false);

    // Opening and closing the two sub-screens. The buttons that open them sit
    // on overlays that are themselves click-to-continue, so every one of these
    // has to stop the event or the click would also start or resume the run.
    document.getElementById('btn-settings-start').addEventListener('click', (e) => {
      e.stopPropagation();
      this._openSettings();
    });
    document.getElementById('btn-settings-pause').addEventListener('click', (e) => {
      e.stopPropagation();
      this._openSettings();
    });
    document.getElementById('btn-settings-back').addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeSubScreen();
    });
    // EXIT, in two presses. The first only opens the question; the second is
    // the one that ends the run. Both stop the event for the same reason every
    // other button on the pause overlay does - the overlay itself is
    // click-to-continue, and a stray bubble would resume the game underneath.
    document.getElementById('btn-exit-pause').addEventListener('click', (e) => {
      e.stopPropagation();
      this.ui.showConfirmExit();
    });
    document.getElementById('btn-exit-no').addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeSubScreen();
    });
    document.getElementById('btn-exit-yes').addEventListener('click', (e) => {
      e.stopPropagation();
      this._exitToMenu();
    });
    // The sub-screens cover the menu underneath, but a click that lands on the
    // padding around their panels would otherwise fall through to nothing and
    // read as a dead screen. Swallowed rather than treated as BACK: these are
    // the only overlays in the game that are NOT click-to-continue, and a
    // stray click must not throw away a setting change.
    // The pass caption is deliberately NOT in this list: it has
    // pointer-events: none, so a click during a handoff falls through to the
    // canvas, where every handler already refuses a state that is not
    // 'playing'. Swallowing it here would be a listener that can never fire.
    for (const ov of [this.ui.settingsOv, this.ui.confirmOv, this.ui.playersOv]) {
      ov.addEventListener('click', (e) => e.stopPropagation());
    }

    // Fullscreen toggles, one per overlay, plus the F binding above. Same
    // stopPropagation reasoning as the settings buttons: the overlays are
    // click-to-continue and this must not also start or resume the run.
    this._fsBtns = [document.getElementById('btn-fs-start'), document.getElementById('btn-fs-pause')];
    for (const b of this._fsBtns) {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this._toggleFullscreen();
      });
    }
    // The browser owns this state - Esc and the F11 key change it without
    // going through either path above - so the label is driven by the event
    // rather than written at the point of the toggle.
    document.addEventListener('fullscreenchange', () => this._syncFsBtns());
    document.addEventListener('webkitfullscreenchange', () => this._syncFsBtns());
    this._syncFsBtns();

    this._wireMenuSounds();

    document.getElementById('overlay-pause').addEventListener('click', () => this.resume());
    document.getElementById('btn-resume').addEventListener('click', (e) => {
      e.stopPropagation();
      this.resume();
    });

    addEventListener('resize', () => {
      // A zero-sized viewport is skipped entirely rather than clamped, so the
      // renderer is never resized to nothing; the next real resize restores it.
      if (innerWidth <= 0 || innerHeight <= 0) return;
      this.camera.aspect = viewportAspect();
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
      this.crt.setSize(innerWidth, innerHeight);
      // Orb point sizes are in pixels, so they scale off the height of the
      // buffer the scene lands in - which the pixel setting can shrink.
      this.money.setViewport(this.crt.sceneHeight, this.camera.fov);
    });
  }

  _clearInput() {
    const i = this.input;
    i.forward = i.back = i.left = i.right = false;
    i.jump = i.shoot = i.melee = false;
    i.aim = i.sprint = i.crouch = false;
    // The pad's sprint latch is input state like any other, and a cleared
    // input that left it set would have the player running again the moment
    // the game came back.
    this._padSprint = false;
    this._sprintEngaged = false;
    i.shootFresh = false;
    i.moveF = null;
    i.moveS = null;
    for (const k in this._tapT) this._tapT[k] = -99;
  }

  // The double-tap clock, kept for BLINK DRIVE. `held` is whether that
  // direction was ALREADY down when the key event arrived: a held key repeats
  // keydown at the OS repeat rate, which would otherwise read as a double-tap
  // the moment a player ran in a straight line. Only a fresh press is timed.
  //
  // A SECOND WAY TO FIRE ONE ITEM, not a second binding. Double-tapping W is
  // how the dash was reached for the whole time it was a passive item, and a
  // player who learned it should not have to unlearn it - so it routes through
  // tryItem() like Q does, and therefore does nothing at all unless BLINK
  // DRIVE is what is in the slot.
  _tapMove(code, held) {
    if (held) return;
    const last = this._tapT[code];
    if (this.time - last < DOUBLE_TAP_WINDOW) {
      if (code === 'KeyW' && this.player.item === 'itemDash') this.tryItem();
      // Cleared so a third tap has to start a new pair rather than firing
      // again off the same timestamp.
      this._tapT[code] = -99;
    } else {
      this._tapT[code] = this.time;
    }
  }

  _lock() {
    // Pad play does not hold the pointer - see _setInputMode. Asking for it
    // here would pull the cursor into the canvas behind a controller player's
    // back and hand Escape a second, unexplained meaning.
    if (this.inputMode === 'pad') return;
    const p = this.renderer.domElement.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  }

  // Tears down every live entity. Enemies and pickups must be disposed, not
  // just removed, or their per-instance materials leak.
  _clearEntities() {
    for (const e of this.enemies) {
      this.scene.remove(e.group);
      e.dispose();
    }
    this.enemies.length = 0;
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles.length = 0;
    for (const p of this.powerups) p.destroy();
    this.powerups.length = 0;
    for (const p of this._absorbing) p.destroy();
    this._absorbing.length = 0;
    this.money.clear();
    this._pendingSpawns.length = 0;
    // DELAYED FUSE's stuck rounds hold references to the very enemies being
    // disposed above, and one left behind would go off in the next wave on a
    // body that no longer exists. The dots go back to the pool with them, or
    // sixteen fuses across two runs would leave it permanently empty.
    for (const f of this._fuses) this.effects.pipRelease(f.pip);
    this._fuses.length = 0;
    this._bigAlive = 0;
    this._reliefT = RELIEF_INTERVAL;
    this.bossFight = null;
    this.ui.setBoss(null, 0, '', '');
    // Lingering zones have to go with the entities that made them. A hazard
    // pool left behind would start the next run already burning the player,
    // standing on a patch of floor nothing on screen explains.
    // Corpses outlive the enemies that own them, so the roster being torn down
    // is not enough to take them with it.
    this.effects.clearCorpses();
    // THE PETS GO WITH THE ENTITIES AND NOT WITH THE HAZARDS, which is the one
    // line that makes them companions rather than deployables: _clearHazards
    // runs at every wave end, and this runs at a run reset, a death and a
    // versus handover. So a magpie survives the shop and never survives a
    // change of owner. _syncCompanions stands the incoming player's back up on
    // the next frame, out of THEIR build.
    this._clearCompanions();
    this._clearHazards();
    for (const a of this._ash) this.effects.creepRelease(a.creep);
    this._ash.length = 0;
    for (const f of this._fire) this.effects.creepRelease(f.creep);
    this._fire.length = 0;
    this._fireUntil = 0;
    // THE ARENA IS DELIBERATELY NOT TOUCHED HERE. This clears ENTITIES, and it
    // is called from the turn handover as well as from a run reset - so it can
    // be called while a perfectly good layout is standing, and it is called
    // every frame by fixtures that hold the field empty.
    //
    // Tearing terrain down here is a loop: the wave break generates a layout
    // and holds the wave clock open for it, this wipes it, the next idle frame
    // generates another and re-arms the clock, and the countdown never reaches
    // zero. A run that actually restarts calls _resetTerrain instead - see
    // beginGame and _exitToMenu.
  }

  // The arena, torn down instantly rather than sunk. For a run that is
  // starting or a run being abandoned: there is nobody in the room to watch an
  // animation, and the next idle frame generates a fresh layout anyway.
  //
  // ONLY FROM A RUN BOUNDARY. It generates nothing itself and it is cheap, but
  // it does two full nav bakes, so it must never end up on a per-frame path.
  _resetTerrain() {
    this.terrain.reset();
    this.terrain.clearCollision();
    this.nav.rebake(this.arena.obstacles);
    this.navBig.rebake(this.arena.obstacles);
    this.rig.setTerrainColliders(this.terrain.colliders);
  }

  // Both buttons show one shared state, so muting on the pause screen is
  // still muted when the start screen comes back after a death.
  // Requests fullscreen on the whole document rather than on the canvas, so
  // the HUD, the overlays and the strobe overlay come with it - a fullscreen
  // canvas alone would leave the run with no health bar. The locked pointer
  // survives because the element it is locked to is inside the one going
  // fullscreen.
  _toggleFullscreen() {
    const d = document;
    const on = d.fullscreenElement || d.webkitFullscreenElement;
    // Both calls reject on a browser that refuses the gesture (or has
    // fullscreen disabled by policy). Nothing to recover, so it is swallowed
    // and the label re-syncs from the event that never arrives.
    const p = on
      ? (d.exitFullscreen || d.webkitExitFullscreen).call(d)
      : (d.documentElement.requestFullscreen || d.documentElement.webkitRequestFullscreen)
        .call(d.documentElement);
    if (p && p.catch) p.catch(() => {});
  }

  _syncFsBtns() {
    if (!this._fsBtns) return;
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    for (const b of this._fsBtns) {
      b.textContent = on ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
      b.classList.toggle('off', on);
    }
  }

  // The label is the STATE now, not the name of the setting: on the settings
  // screen the row already says MUSIC, and repeating it in the button would
  // print the word twice on one line.
  _syncMuteBtns() {
    const m = this.music.muted;
    this._musicBtn.textContent = m ? 'OFF' : 'ON';
    this._musicBtn.classList.toggle('off', m);
  }

  _syncFlashBtns() {
    const on = this.rig.beatFlash;
    this._flashBtn.textContent = on ? 'ON' : 'OFF';
    this._flashBtn.classList.toggle('off', !on);
  }

  // Screenshake, one step of SHAKE_STEP per press and clamped to the ends of
  // the scale. Applied immediately - the setting is reachable from the pause
  // screen mid-run, and the next hit has to shake by what the player just
  // chose, not by what was stored the last time they were in a menu.
  _stepShake(dir) {
    const next = Math.round((this.effects.shakeScale + dir * SHAKE_STEP) * 100) / 100;
    const clamped = Math.max(0, Math.min(SHAKE_MAX, next));
    if (clamped === this.effects.shakeScale) return;
    this._setShakeScale(clamped);
    this._saveShake();
    this._syncShake();
  }

  // THE ONE WRITER for the setting. Two things kick the camera and they are
  // felt as a single effect: the shake effects.js adds on every hit, blast and
  // shot, and the recoil the weapon puts into the player's pitch. Split
  // between two modules, so this is the seam that keeps them agreeing - a
  // setting that quietened one and not the other would read as broken.
  _setShakeScale(v) {
    this.effects.shakeScale = v;
    this.player.shakeScale = v;
  }

  _syncShake() {
    const v = this.effects.shakeScale;
    // Cells, not a percentage bar: the scale runs to double and the pips above
    // 1.0 are amber, so "more than the game ships with" reads without the
    // number being looked at.
    const lit = Math.round(v / SHAKE_STEP);
    for (let i = 0; i < this._shakePips.length; i++) {
      const on = i < lit;
      this._shakePips[i].className = on ? (i >= SHAKE_PIPS / 2 ? 'on hot' : 'on') : '';
    }
    // OFF rather than 0%: a zero on a dial reads as a value, and this one is a
    // state - the effect is not turned down, it is turned off.
    this._shakeVal.textContent = v === 0 ? 'OFF' : Math.round(v * 100) + '%';
    this._shakeVal.classList.toggle('off', v === 0);
    this._shakeDown.disabled = v <= 0;
    this._shakeUp.disabled = v >= SHAKE_MAX;
  }

  // Pixel size, applied immediately for the same reason the shake is: the
  // setting is reachable from the pause screen mid-run, and the whole way to
  // choose between four steps of this is to watch the arena change behind the
  // menu while pressing the key.
  _stepPixel(dir) {
    const next = Math.max(0, Math.min(PIXEL_STEPS.length - 1, this._pixelStep + dir));
    if (next === this._pixelStep) return;
    this._pixelStep = next;
    this.crt.setPixelScale(next);
    // Coarser buffer, fewer pixels to an orb. Anything measured in pixels has
    // to be told, or the orbs keep the size they had at the old resolution and
    // come out scaled by the ratio between the two.
    this.money.setViewport(this.crt.sceneHeight, this.camera.fov);
    try { localStorage.setItem('va-pixel', String(next)); } catch {}
    this._syncPixel();
  }

  _syncPixel() {
    const v = this._pixelStep;
    for (let i = 0; i < this._pixelPips.length; i++) {
      // Three pips for four steps, because OFF is no pips lit rather than one
      // - the same reading the screenshake's OFF gets.
      this._pixelPips[i].className = i < v ? (i >= this._pixelPips.length - 1 ? 'on hot' : 'on') : '';
    }
    this._pixelVal.textContent = PIXEL_LABELS[v];
    this._pixelVal.classList.toggle('off', v === 0);
    this._pixelDown.disabled = v <= 0;
    this._pixelUp.disabled = v >= PIXEL_STEPS.length - 1;
  }

  // The sub-screens are LAYERED over whichever menu opened them - the start
  // screen or the pause screen - and never hide it. That is what makes BACK a
  // single class change with nothing to remember: taking the top screen down
  // reveals exactly the screen the player came from.
  _openSettings() {
    this._audioGesture();
    this.ui.showSettings();
  }

  _closeSubScreen() {
    // The menu underneath was never hidden, so BACK is only ever this. Both
    // are taken down rather than the one that is up: it costs a class write
    // and it cannot get out of step with which screen was opened.
    this.ui.hideSubScreens();
  }

  // True while a sub-screen is up. The menus underneath are still there
  // and still listening, so anything that acts on a menu click has to ask.
  _subScreenOpen() {
    return !this.ui.settingsOv.classList.contains('hidden')
      || !this.ui.confirmOv.classList.contains('hidden')
      || !this.ui.playersOv.classList.contains('hidden');
  }


  // ===========================================================================
  // THE CONTROLLER
  // ===========================================================================
  //
  // pad.js reads the hardware. Everything here is what a button MEANS, and it
  // is written to one rule: the pad and the keyboard drive the same game
  // through the same `input` object and the same methods. There is no
  // controller code path through the simulation - tryUse() does not know what
  // pressed it - which is why the two can be swapped mid-run without anything
  // in the arena noticing.

  /**
   * Hands the game to a device. Called from every keyboard and mouse handler
   * with 'kbm', and from _padUpdate with 'pad' the moment the pad is touched.
   * Cheap to call with the mode it is already in, which it is, sixty times a
   * second.
   */
  _setInputMode(mode) {
    if (this.inputMode === mode) return;
    this.inputMode = mode;
    document.body.classList.toggle('pad-mode', mode === 'pad');
    // The control sheet on the start screen is the one piece of UI that is not
    // rebuilt from the prompt path every frame, so it is rewritten here.
    if (this._controlsEl) renderControls(this._controlsEl, mode === 'pad');
    if (mode === 'pad') {
      // POINTER LOCK IS A MOUSE IDEA. Holding it through pad play would trap
      // the cursor for no reason and, worse, hand the browser a way to pause
      // the game (Escape) that the player never asked for. Released here, and
      // the pointerlockchange handler above knows not to read the release as a
      // pause because the mode is already set.
      if (document.pointerLockElement) document.exitPointerLock();
      // Whatever the keyboard was holding when the player put it down.
      this._clearInput();
      this._padRoot = null;
    } else {
      // Whatever the pad was holding when it was put down - including the
      // trigger. A run that kept firing because the player reached for the
      // keyboard mid-burst would be this seam's one unforgivable bug.
      this._clearInput();
      this.pad.stopRumble();
      this.menu.clear();
      this._padRoot = null;
      // The sound notice is a pad problem - a keyboard player's first press
      // already unlocked the context.
      if (this._audioHint) this._audioHint.classList.add('hidden');
    }
  }

  /**
   * The pad's frame. Runs in EVERY state - the menus need it as much as the
   * arena does - and before anything reads `this.input`, so a press made this
   * frame is acted on this frame.
   *
   * @param {number} dt real seconds, not game time: menu repeat has to work on
   *   a paused game.
   */
  _padUpdate(dt) {
    // The bot drives `input` directly and must never have it written out from
    // under it by a pad someone left plugged into the test machine.
    if (this.autoTest) return;
    const pad = this.pad;
    pad.poll(dt);
    if (pad.justConnected) {
      // Never taken off again. The settings rows stay reachable for the rest
      // of the session even if the pad is unplugged, which is where a player
      // who has just unplugged one goes looking.
      document.body.classList.add('pad-seen');
    }
    if (pad.justDisconnected && this.inputMode === 'pad') {
      // A controller pulled mid-fight is not a reason to die. The pause is the
      // safe state, and it is also the screen that explains itself.
      this.pause();
      this._setInputMode('kbm');
    }
    if (pad.active) this._setInputMode('pad');
    if (this.inputMode !== 'pad' || !pad.connected) return;

    if (this.state === 'playing') this._padPlay(dt);
    else this._padMenu();
    this._syncAudioHint();
  }

  // The pad while the arena is live.
  _padPlay(dt) {
    const pad = this.pad;
    const i = this.input;

    // Movement. The analogue pair is what player.js actually walks on; the
    // booleans are kept in step underneath for the handful of places that ask
    // "is the player holding a direction" rather than "which way".
    i.moveF = pad.move.y;
    i.moveS = pad.move.x;
    i.forward = pad.move.y > 0.2;
    i.back = pad.move.y < -0.2;
    i.right = pad.move.x > 0.2;
    i.left = pad.move.x < -0.2;

    this._padLook(dt);

    i.jump = pad.down(BTN.CROSS);
    i.melee = pad.down(BTN.R3);
    // L2 raises the gun, the way the left trigger does on every console
    // shooter. Held, never toggled - see _updateAim in player.js.
    i.aim = pad.down(BTN.L2);
    // L3 RUNS, AND IT LATCHES. Clicking a stick is not something to be held
    // down for the length of a retreat, so the press flips a latch and the
    // player keeps running until something stops them - they stand still, they
    // fire, the bar empties, or they click it again.
    //
    // `_sprintEngaged` is what makes "until something stops them" work without
    // the latch cancelling itself on the frame it was set: it only counts as
    // ended once the run has actually STARTED. A click while standing still
    // therefore arms the run for the moment the player moves, rather than
    // being swallowed.
    if (pad.pressed(BTN.L3)) {
      this._padSprint = !this._padSprint;
      this._sprintEngaged = false;
    }
    if (this._padSprint) {
      if (this.player.sprinting) this._sprintEngaged = true;
      // A SLIDE IS NOT THE RUN ENDING. player.sprinting is false for the
      // length of one - the slide owns the velocity and pays its own stamina -
      // and without this the latch would read that as "something stopped
      // them" and drop the player out of the run they slid out of.
      else if (this.player.sliding) this._sprintEngaged = false;
      else if (this._sprintEngaged) this._padSprint = false;
    }
    i.sprint = this._padSprint;
    // R2 is the trigger and the trigger is the gun. `shootFresh` is the edge
    // the semi-automatic weapons read - the same one a mouse click raises.
    i.shoot = pad.down(BTN.R2);
    if (pad.pressed(BTN.R2)) i.shootFresh = true;

    if (pad.pressed(BTN.SQUARE)) this.tryReload();
    // CIRCLE IS CROUCH, and USE moved to R1 to make room for it. Crouching is
    // something the player does in the middle of a fight and USE is something
    // they do standing in front of a totem between waves, so the face button
    // under the thumb goes to the one that is pressed under fire.
    //
    // Passed through as a HELD boolean rather than as an edge: player.js turns
    // it into a toggle or a slide depending on what the player is doing, and
    // that decision has to live in one place for both input devices.
    i.crouch = pad.down(BTN.CIRCLE);
    // TAKE / BUY, on TRIANGLE. It was on R1 and the prompt said CIRCLE, which
    // was wrong on both counts: circle is the crouch inside a live arena, so
    // the one button the prompt named was the one button that did not do it.
    // Triangle is the free face button and it is where a "pick this up" prompt
    // is looked for; R1 went to the active item.
    if (pad.pressed(BTN.TRIANGLE)) this.tryUse();
    // THE ACTIVE ITEM, on R1 - the shoulder over the trigger finger, which is
    // where a button pressed in the middle of a firefight has to be. L2 and R2
    // are already aim and fire, so R1 is the nearest thing to them that is not
    // one of them.
    if (pad.pressed(BTN.R1)) this.tryItem();
    // THE TOUCH PAD is HELD, exactly as TAB is: the build sheet costs the
    // player the seconds they spend reading it and the arena keeps running
    // under it. It moved off Triangle when Triangle became TAKE - the summary
    // is the one thing on the pad that is never pressed in a hurry, so it is
    // the one that can afford the button furthest from the sticks.
    if (pad.down(BTN.TOUCHPAD)) this._openStats();
    else this._closeStats();
    // THE DEBUG PANEL, on CREATE - the pad's other flat button, and the only
    // one nothing in the game uses. Pressed rather than held, because unlike
    // the build sheet this screen is worked in rather than glanced at.
    //
    // BELOW the touch pad's else, and not between the two: that if/else is one
    // statement, and splitting it left the build sheet with no branch that
    // ever closed it.
    if (pad.pressed(BTN.CREATE)) {
      pad.consume(BTN.CREATE);
      this._toggleDebug();
    }
    if (pad.pressed(BTN.OPTIONS)) {
      pad.consume(BTN.OPTIONS);
      this.pause();
    }
  }

  /**
   * The right stick, and the aim assist that rides on it.
   *
   * Frame-rate independent by construction: the stick gives a POSITION and
   * this turns it into a rate, so the same push turns the same distance at 30
   * frames a second as at 144. (The mouse handler above is the opposite - a
   * mouse gives a delta, and multiplying that by dt would be the bug.)
   */
  _padLook(dt) {
    const pad = this.pad;
    const p = this.player;
    const mag = pad.look.mag;
    const assist = this._aimAssist ? this._assistTarget() : null;

    // The two sensitivities are BLENDED by the aim, not switched between: a
    // hard swap on the frame the trigger crosses its threshold is felt as the
    // view snagging, and the gun takes ADS_TIME to come up anyway.
    const aimT = p.aimT;
    const sens = this._sensMult(this._padSens)
      + (this._sensMult(this._padAimSens) - this._sensMult(this._padSens)) * aimT;
    let rate = LOOK_RATE * sens;
    // Slowdown assist: the closer the reticle already is, the finer the stick
    // gets. This moves nothing on its own - it only makes the player's own
    // correction smaller.
    if (assist) rate *= ASSIST_SLOW + (1 - ASSIST_SLOW) * assist.t;

    if (mag > 0) {
      // The curve is applied to the MAGNITUDE and the direction is left alone,
      // so a stick pushed diagonally still turns diagonally. Curving each axis
      // separately is the classic version of this bug: it bends every diagonal
      // toward the nearest cardinal.
      const shaped = Math.pow(mag, LOOK_EXP) / mag;
      const step = shaped * rate * dt;
      p.yaw -= pad.look.x * step;
      p.pitch += pad.look.y * (this._invertLook ? -1 : 1) * step;
    }

    // Magnetism, and the two things that hold it down.
    //
    // It is SCALED BY EFFORT - how hard the player is actually pushing either
    // stick - which makes it a help with a turn that is already happening
    // rather than a turn of its own. At zero effort it is zero: a player who
    // has let go is not aiming, and a view that crept toward an enemy on its
    // own would be the game taking the shot.
    //
    // And it FADES AT THE EDGE of the cone rather than at the centre, so it is
    // strongest where the player has nearly got there and weakest where they
    // might be aiming past this enemy at another one.
    const effort = Math.min(1, mag + pad.move.mag);
    if (assist && effort > 0) {
      const pull = ASSIST_PULL * (1 - assist.t) * effort * dt;
      // Clamped to what is left of the error, so it can close a gap but never
      // cross it and start pulling the other way.
      p.yaw += Math.max(-pull, Math.min(pull, assist.dYaw));
      p.pitch += Math.max(-pull, Math.min(pull, assist.dPitch));
    }
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
  }

  // A sensitivity step as a multiplier. Eight steps, a half rate at the bottom
  // and double at the top, which is the range a pad needs to cover everyone
  // from a first controller to someone who plays on the highest setting of
  // everything. Both settings - hip and aim - read the same scale.
  _sensMult(step = this._padSens) {
    return SENS_MIN + (step - 1) * ((SENS_MAX - SENS_MIN) / (SENS_STEPS - 1));
  }

  /**
   * The enemy the aim assist is currently working on, or null.
   *
   * The NEAREST TO THE CROSSHAIR wins, not the nearest in the world: assist is
   * about the thing the player is already pointing at. Everything is measured
   * in yaw/pitch error rather than in screen space because that is the space
   * the correction is applied in, and converting twice would only introduce a
   * disagreement between the test and the pull.
   *
   * MEASURED AGAINST THE AIM, NOT AGAINST `pitch`.
   *
   * The camera - and therefore the shot, which is a raycast through it - looks
   * along `pitch + recoilPitch` (see Player.applyCamera). The assist writes to
   * `pitch` alone. Comparing the error against the bare `pitch` therefore
   * lined the UNRECOILED aim up on the enemy and left the recoil sitting on
   * top of it, which is why assisted fire drifted over the target's head and
   * got worse the faster the gun fired. The error is taken against the real
   * aim instead, so the pull is a servo on where the bullets are actually
   * going: it closes the gap the recoil opens, every frame, on its own.
   *
   * @returns {?{t: number, dYaw: number, dPitch: number}} `t` is how far out
   *   the reticle is as a fraction of the cone - 0 dead on, 1 at the edge.
   */
  _assistTarget() {
    const p = this.player;
    const eye = p.eyeInto(this._assistEye);
    // The clamp applyCamera uses, so the error agrees with the view even when
    // the player is looking straight up or down.
    const aimPitch = Math.max(-1.5, Math.min(1.5, p.pitch + p.recoilPitch));
    let best = null;
    let bestErr = ASSIST_CONE;
    for (const e of this.enemies) {
      if (e.dead) continue;
      // The CENTRE of the hit sphere, in world space - the same transform the
      // shot raycasts against. e.pos is on the floor, and an assist that
      // pulled there would drag every shot into the ground.
      const at = e.hitbox.getWorldPosition(this._assistAt);
      const dx = at.x - eye.x;
      const dz = at.z - eye.z;
      const flat = Math.hypot(dx, dz);
      if (flat > ASSIST_RANGE || flat < 0.001) continue;
      const dy = at.y - eye.y;
      // Forward is (-sin yaw, -cos yaw) - see player.forwardInto - so this is
      // the yaw that would point straight at the target.
      let dYaw = Math.atan2(-dx, -dz) - p.yaw;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      const dPitch = Math.atan2(dy, flat) - aimPitch;
      const err = Math.hypot(dYaw, dPitch);
      if (err >= bestErr) continue;
      // Only the leader pays for a line-of-sight test. Assist through a wall
      // would drag the player's aim onto something they cannot shoot, which is
      // worse than no assist at all.
      if (!this._losClear(eye, at.x, at.y, at.z)) continue;
      bestErr = err;
      best = best || { t: 0, dYaw: 0, dPitch: 0 };
      best.t = err / ASSIST_CONE;
      best.dYaw = dYaw;
      best.dPitch = dPitch;
    }
    return best;
  }

  /**
   * Segment-versus-box sweep from the eye to a point, against the arena's
   * static cover. The standard slab test: clip the segment against each pair
   * of planes and see whether anything survives.
   *
   * Only the static obstacles are considered - enemies do not block assist,
   * because a target hidden behind another target is still a target.
   */
  _losClear(eye, tx, ty, tz) {
    const dx = tx - eye.x;
    const dy = ty - eye.y;
    const dz = tz - eye.z;
    for (const b of this.arena.obstacles) {
      let t0 = 0;
      let t1 = 1;
      let blocked = true;
      for (let axis = 0; axis < 3 && blocked; axis++) {
        const o = axis === 0 ? eye.x : axis === 1 ? eye.y : eye.z;
        const d = axis === 0 ? dx : axis === 1 ? dy : dz;
        const lo = axis === 0 ? b.min.x : axis === 1 ? b.min.y : b.min.z;
        const hi = axis === 0 ? b.max.x : axis === 1 ? b.max.y : b.max.z;
        if (Math.abs(d) < 1e-6) {
          // Parallel to this pair of planes: either it starts between them and
          // this axis says nothing, or it never enters the box at all.
          if (o < lo || o > hi) blocked = false;
          continue;
        }
        let a = (lo - o) / d;
        let c = (hi - o) / d;
        if (a > c) { const tmp = a; a = c; c = tmp; }
        if (a > t0) t0 = a;
        if (c < t1) t1 = c;
        if (t0 > t1) blocked = false;
      }
      if (blocked) return false;
    }
    return true;
  }

  /**
   * THE MOUSE'S HALF OF THE MENU VOICES. Two delegated listeners on the
   * document rather than a pair on each of the forty-odd controls, because the
   * name keyboard and the leaderboard build their buttons at runtime and a
   * per-button wiring would have to be re-run every time one of those redraws.
   *
   * DELEGATION MEANS THE SELECTOR IS THE RULE: anything that is a control on an
   * overlay makes a noise, and nothing else in the game does. `.overlay` is
   * what every menu screen in index.html already is.
   *
   * The click listener is on the CAPTURE phase. Half the buttons on the start
   * screen call stopPropagation - the overlay behind them is click-to-start and
   * they must not also start a run - so a bubbling listener on the document
   * would hear from some buttons and not others, which is the worst of the
   * three possible behaviours.
   *
   * ONE SOUND PER PRESS, whatever pressed it: the pad's CROSS activates the
   * focused control by clicking it (see MenuDriver.activate), so the press
   * comes through here for a controller too and there is no second, quieter
   * copy of this in _padMenu.
   */
  _wireMenuSounds() {
    const SEL = '.overlay button:not([disabled]), .overlay .stepper';
    const control = (t) => (t instanceof Element ? t.closest(SEL) : null);
    // What the cursor was last over, so crossing a label or a glyph INSIDE a
    // button is not a second hover of the button it is drawn on.
    let hover = null;
    document.addEventListener('pointerover', (e) => {
      const el = control(e.target);
      if (el === hover) return;
      hover = el;
      // offsetParent is null for a control on a screen that is not up - the
      // same test MenuDriver.items() uses, and for the same reason.
      if (el && el.offsetParent !== null) this.sfx.menuMove();
    });
    document.addEventListener('click', (e) => {
      if (!control(e.target)) return;
      // The press IS the gesture the browser wants before it will let a page
      // make a sound, so the context is opened on the same event that needs it.
      // The very first click of a session may still land silent - resume() is
      // a promise - and the second one never does.
      this._audioGesture();
      this.sfx.menuSelect();
    }, true);
  }

  // The pad on a menu. One driver walks whichever overlay is on top; see
  // padmenu.js for why the navigation is geometric rather than a list.
  _padMenu() {
    const pad = this.pad;
    const root = this._menuRoot();
    if (root !== this._padRoot) {
      this._padRoot = root;
      this.menu.setRoot(root);
    }
    if (!root) return;

    // The stick and the D-pad both steer. navY is +1 for up, and the driver
    // works in screen space where down is positive, so it is flipped here
    // rather than inside pad.js - the pad has no opinion about screens.
    //
    // The two axes are handled SEPARATELY because they no longer mean the same
    // kind of thing: up and down always move the selection, while left and
    // right are first offered to the focused control - a settings row spends
    // them on its own value and everything else lets them move - see
    // MenuDriver.adjust.
    if (pad.navY) this.menu.move(0, -pad.navY);
    if (pad.navX && !this.menu.adjust(pad.navX)) this.menu.move(pad.navX, 0);

    if (pad.pressed(BTN.CROSS)) {
      pad.consume(BTN.CROSS);
      // Every menu press is also the audio gesture, for the same reason the
      // mouse handlers are - though see _syncAudioHint for why a pad alone
      // cannot always finish the job.
      this._audioGesture();
      this.menu.activate();
    }
    if (pad.pressed(BTN.CIRCLE)) {
      pad.consume(BTN.CIRCLE);
      // BACK. The one menu press with no button under it - it closes the
      // screen rather than pressing anything on it - so it is also the one
      // that has to make its own noise. See _wireMenuSounds for why every
      // other press does not.
      if (this._debugOpen) { this._closeDebug(); this.sfx.menuBack(); }
      else if (this._subScreenOpen()) { this._closeSubScreen(); this.sfx.menuBack(); }
      else if (this.state === 'paused') { this.resume(); this.sfx.menuBack(); }
    }
    if (pad.pressed(BTN.CREATE)) {
      pad.consume(BTN.CREATE);
      // The key that opened it closes it, which is the rule 9 already follows.
      if (this._debugOpen) { this._closeDebug(); this.sfx.menuBack(); }
    }
    if (pad.pressed(BTN.OPTIONS)) {
      pad.consume(BTN.OPTIONS);
      // START, in the arcade sense: it starts and it un-pauses, and it does
      // nothing at all on a screen that is layered over one of those.
      this._audioGesture();
      if (this._debugOpen) { this._closeDebug(); this.sfx.menuBack(); }
      else if (this._subScreenOpen()) { this._closeSubScreen(); this.sfx.menuBack(); }
      else if (this.state === 'paused') { this.resume(); this.sfx.menuBack(); }
      else if (this.state === 'menu') { this.sfx.menuSelect(); this.beginGame(); }
      else if (this.state === 'gameover') { this.sfx.menuSelect(); this._restartFromOver(); }
    }
  }

  /**
   * RESTART, from the button or from OPTIONS. One implementation because the
   * two must not disagree about what a finished VERSUS match restarts into.
   *
   * A solo death goes straight back into a run - that is the arcade's own
   * rhythm. A finished match goes back to the MENU instead: the next one needs
   * two people ready with a controller between them, and dropping Player 1
   * into wave 1 the instant someone reaches for the obvious button is not
   * that.
   */
  _restartFromOver() {
    if (this.match) {
      this.mode = 'solo';
      this.match = null;
      this.ui.setVersus(null);
      this.ui.showStart();
      this.state = 'menu';
      return;
    }
    this.beginGame();
  }

  // The overlay the pad is currently pointed at, or null if the arena is what
  // is on screen. The sub-screens are checked first because they sit OVER the
  // menu that opened them and that menu is still in the document.
  _menuRoot() {
    // FIRST, because it is layered over the paused state rather than being it -
    // the pause screen is not up, and the branch below would otherwise point
    // the driver at a screen nobody can see.
    if (this._debugOpen) return this.ui.debugPanel;
    if (!this.ui.confirmOv.classList.contains('hidden')) return this.ui.confirmOv;
    if (!this.ui.settingsOv.classList.contains('hidden')) return this.ui.settingsOv;
    if (!this.ui.playersOv.classList.contains('hidden')) return this.ui.playersOv;
    if (this.state === 'menu') return this.ui.startOv;
    if (this.state === 'paused') return this.ui.pauseOv;
    if (this.state === 'gameover') return this.ui.overOv;
    return null;
  }

  // A gamepad press is NOT a user gesture as far as a browser is concerned, so
  // a player who never touches the mouse can leave the start screen with the
  // audio context still suspended and no way to tell why the game is silent.
  // One click anywhere fixes it, and this is the line that says so.
  _syncAudioHint() {
    if (!this._audioHint) return;
    const blocked = this.state === 'menu'
      && (!this.sfx.ctx || this.sfx.ctx.state !== 'running');
    this._audioHint.classList.toggle('hidden', !blocked);
  }

  // ---- controller settings --------------------------------------------------

  _stepSens(dial, dir) {
    const next = Math.max(1, Math.min(SENS_STEPS, dial.get() + dir));
    if (next === dial.get()) return;
    dial.set(next);
    this._savePadPrefs();
    this._syncSens();
    // Felt, not just read: the same nudge the pad gives when a setting lands.
    this.pad.rumble(0.25, 0.2, 70, 1);
  }

  _syncSens() {
    for (const dial of [this._sensDial, this._aimSensDial]) {
      const v = dial.get();
      for (let i = 0; i < dial.pips.length; i++) {
        dial.pips[i].className = i < v ? 'on' : '';
      }
      dial.val.textContent = String(v);
      dial.down.disabled = v <= 1;
      dial.up.disabled = v >= SENS_STEPS;
    }
  }

  _syncPadBtns() {
    const set = (btn, on) => {
      btn.textContent = on ? 'ON' : 'OFF';
      btn.classList.toggle('off', !on);
    };
    set(this._assistBtn, this._aimAssist);
    set(this._rumbleBtn, this.pad.rumbleOn);
    set(this._invertBtn, this._invertLook);
  }

  _loadPadPrefs() {
    try {
      const step = (key, fallback) => {
        const n = Number(localStorage.getItem(key));
        return Number.isFinite(n) && n >= 1 && n <= SENS_STEPS ? Math.round(n) : fallback;
      };
      this._padSens = step('va-pad-sens', SENS_DEFAULT);
      this._padAimSens = step('va-pad-aim-sens', AIM_SENS_DEFAULT);
      // Absent means default, which is why each of these tests for the string
      // that turns it off rather than for the one that turns it on.
      this._aimAssist = localStorage.getItem('va-pad-assist') !== '0';
      this._invertLook = localStorage.getItem('va-pad-invert') === '1';
      this.pad.rumbleOn = localStorage.getItem('va-pad-rumble') !== '0';
    } catch {}
  }

  _savePadPrefs() {
    try {
      localStorage.setItem('va-pad-sens', String(this._padSens));
      localStorage.setItem('va-pad-aim-sens', String(this._padAimSens));
      localStorage.setItem('va-pad-assist', this._aimAssist ? '1' : '0');
      localStorage.setItem('va-pad-invert', this._invertLook ? '1' : '0');
      localStorage.setItem('va-pad-rumble', this.pad.rumbleOn ? '1' : '0');
    } catch {}
  }

  // Storage throws in private-mode Safari and when cookies are blocked, and a
  // failed preference save is not worth taking the game down for.
  _saveMuted() {
    try { localStorage.setItem('va-music-muted', this.music.muted ? '1' : '0'); } catch {}
  }

  _saveBeatFlash() {
    try { localStorage.setItem('va-beat-flash', this.rig.beatFlash ? '1' : '0'); } catch {}
  }

  _saveShake() {
    try { localStorage.setItem('va-shake', String(this.effects.shakeScale)); } catch {}
  }

  // Fills the object the rig reads. Mutates in place and returns it, so the
  // loop allocates nothing.
  //
  // `mode` is derived from the SAME condition the music muffle uses, so the
  // room's blackout and the muffled track can never disagree about whether the
  // party is on: combat is the only state that is neither muffled nor played
  // in the dark.
  _fillRigState() {
    const r = this._rigState;
    const combat = this.state === 'playing' && this.waveState === 'active';
    // A pass is a wave BREAK, so the room is lit like one. Without the extra
    // test it fell to 'idle' - the between-runs mood - and the three seconds
    // of a handoff read as the game having stopped, which is the one thing the
    // pass is built not to do.
    const house = this.state === 'playing'
      && (this.waveState === 'intermission' || this._pass);
    r.mode = combat ? (this.bossFight ? 'boss' : 'combat') : house ? 'house' : 'idle';
    r.beat = this.music.beat;
    r.level = this.music.level;
    // Position in the bar and whether this beat is the ONE. music.js keeps
    // both running whether or not the beat map is driving, so the rig never
    // has to ask which source it is getting.
    r.bar = this.music.bar;
    r.downbeat = this.music.downbeat;
    r.camPos = this.camera.position;
    // What is standing at the wave break, for the two accent lights to park
    // over and take their colour from - see HOUSE_ACCENT in rig.js. The
    // TOTEMS when they are up, the active item pedestal when that row is the
    // only one left; an empty list in the fight, which is when the accents are
    // doing their own thing anyway.
    //
    // Refilled in place into a preallocated array of preallocated entries, so
    // the loop still allocates nothing.
    this._fillOffers(r);
    // Clamped: a health pickup can overheal past max, which would drive the
    // low-health maths backwards.
    r.healthFrac = Math.max(0, Math.min(1, this.player.health / this.player.maxHealth));
    r.comboMult = this.comboMult();
    r.fogMult = this.player.mods.fogMult;
    if (this.bossFight && this.bossFight.parts.length) {
      const boss = this.bossFight.parts[0];
      r.bossColor = ENEMY_TYPES[this.bossFight.key].color;
      r.bossPos = boss.pos;
    } else {
      r.bossPos = null;
    }
    // THE BLOCK'S OWN COLOUR. Five waves are one theme now, and the room says
    // which: the rig pulls its accents toward this and the fog tints with it,
    // the same way a boss wave already hands the room to the boss. It is a
    // BIAS rather than a takeover - the accents still cycle and the key light
    // stays white, because the enemies have to stay readable - so a block
    // reads as being lit in EMBER's orange without the fight becoming orange.
    r.themeColor = this._cfg ? this._cfg.themeColor : 0;
    return r;
  }

  // Fills `r.offers` with one {x, z, color} per standing offer, LEFT TO RIGHT.
  // The order is what lets the rig take the outer two and straddle the row
  // with them rather than lighting one end of it twice.
  _fillOffers(r) {
    const out = r.offers;
    out.length = 0;
    // THE MYSTERY BOX IS NOT IN HERE. It carries its own light - three halos
    // and a beam - and it is never the only thing standing, so the rig has the
    // totem row to straddle whenever there is a wave break at all.
    const row = this.totemArea.active ? this.totemArea.totems : null;
    if (!row) return;
    for (const t of row) {
      if (t.state === 'hidden' || t.claimed || !t.offer) continue;
      // Entries are reused; only three exist and the row is at most three.
      const slot = this._offerSlots[out.length];
      slot.x = t.pos.x;
      slot.z = t.pos.z;
      slot.color = t.offer.theme;
      out.push(slot);
    }
  }

  // True when a text field has focus, so the global key handlers stand down.
  _typing(el) {
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  // Primes the audio graph and gets the soundtrack going. Every user gesture
  // that reaches audio routes through here rather than calling sfx.ensure()
  // directly, because the music has to be (re)started on a gesture too and a
  // gesture that primed only one of the two was the original bug here.
  //
  // Also called once at launch, before any gesture exists. That call builds
  // the graph and picks the track's random start point, and the browser then
  // refuses to actually play - which is fine and expected. The first real
  // gesture calls this again and playback begins, already set up. The point is
  // that the soundtrack belongs to the GAME rather than to a run: it is under
  // the menu, and starting a run is not where it begins.
  _audioGesture() {
    this.sfx.ensure();
    this.music.start(this.sfx.ctx);
  }

  // True when the music should sound muffled: anything that is not live
  // combat. Combat is the ONLY clean state - intermission (walking the totems
  // to pick a passive item), the menu, pause and the death screen are all
  // behind the filter, which makes "the music opened up" mean "you are
  // fighting".
  // Opens the wave EARLY - on the pick rather than on the finished arena. The
  // caption and the music are the two things that tell the player the fight is
  // on, and both used to wait for the last pillar to land. Only the announce
  // moves: spawning, the wave counter and the rig's blackout hit still belong
  // to startWave().
  //
  // Solo only. In versus the pick hands the controller over, and a wave
  // caption over a "pass the controller" screen would be announcing a fight
  // the next player has not started.
  _cueWaveOpen() {
    if (this._waveCued || this.match) return;
    this._waveCued = true;
    this.ui.banner('WAVE ' + (this.wave + 1), this._themeCaption(this.wave + 1));
  }

  // The name of the five-wave block that opens on wave n, or '' if n is not
  // the first wave of one. Only on the first: the point is to mark the CHANGE,
  // and a name repeated over all four waves of a block stops being an
  // announcement and becomes furniture.
  _themeCaption(n) {
    if (((n - 1) % 5) !== 0) return '';
    return waveConfig(n, this._themeSeed, HAVE_TYPE, this._forcedTheme).themeName;
  }

  _musicMuffled() {
    return this.state !== 'playing' || (this.waveState !== 'active' && !this._waveCued);
  }

  // Starts a fresh run from the menu or the game-over screen. Anything that
  // changes during play must be reset here, including the spawn timers -
  // leftover state used to carry into the next run.
  beginGame(mode = 'solo', count = 2) {
    this._audioGesture();
    this.mode = mode;
    // VERSUS IS A MATCH, NOT A RUN. The wave counter below is still the one
    // the arena reads; the match owns whose wave it is and what is riding on
    // it, and both players' saved runs hang off it.
    this.match = mode === 'versus' ? new VersusMatch(count) : null;
    this.player.reset();
    this._clearEntities();
    // A NEW DEAL EVERY RUN. The terrain seed is deliberately kept for the
    // session - a player learning the arena should be able to - but the theme
    // order is the thing a run varies by, so it is re-rolled here.
    this._themeSeed = (Math.random() * 0xffffffff) >>> 0;
    // A previous run's arena, if there is one still standing.
    this._resetTerrain();
    this.kills = 0;
    this.credits = 0;
    this.comboKills = 0;
    this.comboTimer = 0;
    this.waveDamageTaken = 0;
    this.lastPerfect = false;
    this._pass = false;
    this._swapped = false;
    this.totemArea.dismiss();
    this.mysteryBox.dismiss();
    this.wave = 0;
    this.queue.length = 0;
    this._pendingBuffs.length = 0;
    this.waveState = 'idle';
    this._waveCued = false;
    this.interT = 1.2;
    this.spawnTimer = 0;
    this._reliefT = RELIEF_INTERVAL;
    this.emptyClickCd = 0;
    this.stats.shotsFired = 0;
    this.stats.hits = 0;
    this.stats.spawned = 0;
    this.stats.damaged = 0;
    this.state = 'playing';
    this._clearInput();
    this.ui.resetCache();
    this.ui.showHud();
    if (this.match) {
      // Both slots seeded off the same freshly reset player, so the first
      // handoff restores a snapshot exactly like every later one does rather
      // than being a special case that nothing else exercises.
      for (let i = 0; i < this.match.count; i++) {
        this.match.slots[i] = captureRun(this);
      }
      this.ui.setVersus(this.match.active + 1);
      this.player.setPlayerTag(PLAYER_COLOR[this.match.active]);
    } else {
      this.ui.setVersus(null);
      this.player.setPlayerTag(null);
    }
    this.player.setHolster(0);
    if (!this.autoTest) this._lock();
  }

  // THE ONE WAY IN to the pause state. Three things reach it - losing pointer
  // lock, OPTIONS on the pad, and a controller being unplugged - and all of
  // them owe the same tidying up, which is why none of them writes `state`
  // themselves any more.
  pause() {
    // The debug panel already holds the run in `paused`, and it is not the
    // pause SCREEN - anything that would ordinarily raise that screen is a
    // no-op while the panel is the thing on top.
    if (this.state !== 'playing' || this._debugOpen) return;
    this.state = 'paused';
    this._clearInput();
    this._closeStats();
    // A motor still running over a paused game is the pad saying the fight is
    // still happening.
    this.pad.stopRumble();
    this.ui.showPause();
  }

  resume() {
    if (this.state !== 'paused' || this._debugOpen) return;
    this.state = 'playing';
    this.ui.hidePause();
    if (!this.autoTest) this._lock();
  }

  /**
   * ABANDON THE RUN AND GO BACK TO THE MENU. Reached only from the pause
   * screen, and only through the confirmation - see #overlay-confirm.
   *
   * The confirmation says as much in as many words, which is most of why
   * there is a confirmation.
   *
   * The teardown is beginGame's, minus the part that starts a run. That is
   * deliberate: the menu is drawn over a LIVE arena, so a fight left standing
   * behind it would be visible through the wash, and the next START would
   * clear it anyway - doing it here means the player never sees the seam.
   */
  _exitToMenu() {
    if (this.state !== 'paused') return;
    this._closeSubScreen();
    this.state = 'menu';
    this._clearInput();
    this._closeStats();
    this.pad.stopRumble();
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    // A MATCH ENDS WITH THE RUN THAT WAS ABANDONED. There is no half a versus
    // match to come back to: both slots are the same run seen twice, and the
    // player who did not press EXIT is in the room to argue about it.
    this.mode = 'solo';
    this.match = null;
    this._pass = false;
    this._swapped = false;
    this.ui.setVersus(null);
    this.player.setPlayerTag(null);
    this.player.setHolster(0);
    this._clearEntities();
    this._resetTerrain();
    this.queue.length = 0;
    this._pendingBuffs.length = 0;
    this.waveState = 'idle';
    this._waveCued = false;
    this.totemArea.dismiss();
    this.mysteryBox.dismiss();
    this.ui.setPrompt(null, false);
    this.ui.showStart();
  }

  // ---- versus: the hot seat ------------------------------------------------
  //
  // A TURN IS ONE WAVE. It ends the moment the player claims their passive
  // item - the last thing they do with the controller - or the moment they
  // die, and either way the pad goes across the room. Everything that makes
  // the swap safe is in these four methods; the rules themselves are in
  // versus.js.

  /** The active player has died. Not an ending - see gameOver. */
  _playerFell() {
    if (this.state !== 'playing' || this._pass) return;
    const m = this.match;
    // The same weight the solo death carries. It is still a death; it is just
    // not the last one, so it takes the fx and the sound and not the screen.
    this.effects.burst(this.player.eyeInto(this._killPos), 0x4ef3ff, 40, 6, 3, 0.9);
    this.sfx.death(1.2);
    this.pad.rumble(1, 0.8, 700, 4);
    this.ui.banner(m.label() + ' FELL ON WAVE ' + m.wave);
    this.comboKills = 0;
    this.comboTimer = 0;
    this._endTurn(false);
  }

  /**
   * Books the turn and starts the pass.
   *
   * NOTHING STOPS HERE. The pass is not a state and not a screen: it is an
   * ordinary wave break, three seconds long instead of the usual four tenths,
   * with a caption over it. The arena stays live, the room keeps its house
   * lighting, and once the weapon has changed hands the incoming player can
   * walk, look and shoot for the rest of the countdown. The wave then starts
   * off the same `interT` every other wave in the game starts off.
   *
   * WHAT IS AND IS NOT COMMITTED. A cleared wave writes a fresh snapshot: the
   * build, the money and the shopping trip that just happened are all kept. A
   * FAILED one writes nothing at all, so the snapshot left in the slot is
   * still the state the player began the attempt with - which is the only
   * thing "another attempt at wave ten" can honestly mean. It also makes a
   * failed attempt free of side effects: nothing picked up during it survives.
   */
  _endTurn(cleared) {
    const m = this.match;
    // THE RUNNING ITEMS GO BEFORE THE SNAPSHOT IS TAKEN. An item can be fired
    // in the shop - see the note in tryItem - so a player can hand over with a
    // window still open, and everything a window writes (itemDamageMult and its
    // neighbours) is an ordinary player field that captureRun will copy. The
    // incoming player would then inherit a triple-damage multiplier with no
    // activation left anywhere to hand it back.
    //
    // A wave clear already clears these; this is the shop-fired case, which is
    // the only one that reaches here with anything still running.
    this.running.clear(this);
    this._clearDeployed();
    if (cleared) m.slots[m.active] = captureRun(this);
    m.advance(cleared);
    if (m.winner >= 0) { this._matchOver(); return; }
    this._clearEntities();
    this.totemArea.dismiss();
    this.mysteryBox.dismiss();
    // The room keeps the last fight's mood otherwise, and the incoming player
    // would walk into a boss's red on an ordinary wave.
    this.rig.setEnraged(false);
    this.ui.setPrompt(null, false);
    // NOTHING IS CLEARED, CONSUMED OR CLOSED HERE, and that is deliberate.
    // Every one of those is a control taken out of the player's hands for a
    // frame or for a keypress, and a wave break in solo takes none of them -
    // so neither does this one. A key still held keeps moving the player
    // straight through the pass, which is exactly what "no pause" means.
    //
    // It is safe because THERE IS ONLY ONE BODY. The transform is not part of
    // a snapshot (see PLAYER_SKIP in versus.js), so the thing still walking on
    // a held key is the same thing the incoming player is about to be, not the
    // outgoing player's corpse wandering off with their momentum.
    // ONE SHORT OF THE MATCH'S WAVE, because startWave() does the ++. Setting
    // the counter rather than starting the wave is what buys versus the whole
    // ordinary path for free: the banner, the rig cue, the boss spawn and the
    // pending-buff clocks all run exactly as they do in solo.
    this.wave = m.wave - 1;
    // WHO WENT OUT. Elimination is the most consequential thing that happens
    // in a match and nothing else on screen would say it had: the caption
    // names the incoming player, and the player who just left the field is
    // not in the room's line of sight any more. Ahead of the caption, so the
    // two read in the order they happened.
    if (m.eliminated.length) {
      this.ui.banner(
        m.eliminated.map((i) => m.label(i)).join('  ·  ')
        + (m.eliminated.length > 1 ? ' ARE OUT' : ' IS OUT')
      );
    }
    this.queue.length = 0;
    this._pass = true;
    this._swapped = false;
    // THE PASS IS THE INTERMISSION CLOCK. One timer, so the countdown on
    // screen and the wave it is counting down to can never disagree.
    this.waveState = 'idle';
    this.interT = HANDOFF_TIME;
    this.ui.showHandoff(m.active + 1, m.label(), m.stake(), Math.ceil(HANDOFF_TIME));
  }

  /**
   * One frame of the pass, on a game that is still running.
   *
   * THE SWING IS A TRIANGLE, not a plateau: the gun swings out over
   * HANDOFF_SWAP, the run changes hands at the top, and it swings straight
   * back in. That is about a second of the three, and it is deliberately front
   * loaded - the rest of the countdown is the incoming player standing in the
   * arena with their own weapon already in their hands, free to move, which is
   * the whole difference between a pass and a pause.
   */
  _updatePass(dt) {
    const e = HANDOFF_TIME - this.interT;          // seconds since it began
    // A triangle in one line: up to 1 at HANDOFF_SWAP, back to 0 at twice it.
    const swing = Math.max(0, 1 - Math.abs(e - HANDOFF_SWAP) / HANDOFF_SWAP);
    // The FIELD, not setHolster: player.update() runs every frame of a pass
    // and folds the drop into the pose itself, so the walk bob and the swing
    // compose instead of fighting over the gun's transform.
    this.player.holster = swing;
    // THE HANDOVER, at the top of the swing: the weapon is out of frame and
    // the instruments are off the edges, so every number on the HUD changes
    // behind the one moment in the pass when none of them is on screen.
    if (!this._swapped && e >= HANDOFF_SWAP) {
      this._swapped = true;
      this._swapRun();
    }
    // The instruments come back holding the INCOMING player's numbers, which
    // is why the handover has to lead the slide rather than follow it.
    if (this._swapped) this.ui.swapHudIn();
    this.ui.setHandoffCount(Math.max(0, Math.ceil(this.interT)));
  }

  /** The other player's run comes back, while nothing is looking at it. */
  _swapRun() {
    const m = this.match;
    restoreRun(this, m.slots[m.active]);
    this.player.setPlayerTag(PLAYER_COLOR[m.active]);
    // resetCache first: it wipes the per-field cache, and setVersus writes
    // straight into the DOM. The other order leaves the readout stale.
    this.ui.resetCache();
    this.ui.setVersus(m.active + 1);
    this._updateHud();
  }

  /** One player has cleared a wave the other could not. The only ending. */
  _matchOver() {
    const m = this.match;
    this.state = 'gameover';
    // A match can only end from _endTurn, which is before the pass starts -
    // but the flags are cleared anyway so the screen can never be reached with
    // a half-swung weapon or a slid-out HUD still owed an animation.
    this._pass = false;
    this._swapped = false;
    this.player.setHolster(0);
    this._clearInput();
    this._closeStats();
    this._clearEntities();
    this.totemArea.dismiss();
    this.mysteryBox.dismiss();
    this.rig.setEnraged(false);
    this.ui.setPrompt(null, false);
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    this.sfx.upgrade();
    this.ui.showMatchOver(m.label(m.winner), m.wave);
  }

  tryReload() {
    if (this.state !== 'playing') return;
    if (this.player.startReload()) this.sfx.reload();
  }

  // FIRES THE ACTIVE ITEM. Q and L1 both land here, and so does a double-tapped
  // W when BLINK DRIVE is what is carried - the same one-place-per-action shape
  // tryReload() and tryUse() have, so the two devices cannot drift apart on
  // what the button means.
  //
  // USABLE IN THE SHOP, where the charge that pays for it cannot be earned -
  // there is nothing to kill (see addItemCharge in player.js). Nothing is
  // gained by firing a heal at a wave break, but refusing the button there
  // would be a rule the player only ever meets as an unexplained silence.
  //
  // An empty slot is silent. A slot that is simply not full is not: a player
  // pressing the button in a fight has decided to spend it, and a press that
  // does nothing at all reads as a dropped input rather than as a cooldown.
  tryItem() {
    if (this.state !== 'playing') return;
    const id = this.player.item;
    if (!id) return;
    if (!this.player.itemReady) {
      this.sfx.denied();
      this.pad.rumble(0.15, 0.5, 60, 1);
      return;
    }
    const def = ACTIVE_ITEMS[id];
    // AN ITEM MAY REFUSE ITSELF, and only LANCE does: it costs thirty rounds,
    // and a press that spent the charge and fired nothing would be the worst
    // failure in the pool. The refusal wears the same voice an uncharged press
    // gets, because it is the same message - not now.
    if (def.ready && !def.ready(this)) {
      this.sfx.denied();
      this.pad.rumble(0.15, 0.5, 60, 1);
      return;
    }
    this.player.spendItem();
    // BAILIFF, and it is a REFUND rather than a discount: the meter empties
    // exactly as it always did and then a fifth of the cost lands back in it,
    // so what the player sees is the item fire and the bar jump. A free item -
    // PAY TO WIN's charge is zero - refunds a fifth of nothing, which needs no
    // special case.
    const back = this.player.mods.bailiff * def.charge;
    if (back > 0) this.player.addItemCharge(back);
    // Through the running list rather than straight to use(), so an item with
    // a window is ticked and, above all, ENDED. An item with no duration is
    // fired and forgotten by start() on the same frame.
    // VITAL TRIGGER. Beside the BAILIFF refund above, because it is the same
    // shape: something the player gets back for having pressed the button, paid
    // the moment the charge is spent and whatever the item then does.
    if (this.player.mods.itemHeal > 0) {
      this.player.heal(this.player.mods.itemHeal);
      this.effects.shockwave(this.player.pos, THEME_VITAL, 3.5, 0.35);
    }
    this.running.start(this, id, def);
    this.sfx.itemUse();
    this.pad.rumble(0.6, 0.5, 200, 2);
  }

  // ---- what an item is allowed to reach for ------------------------------

  /**
   * Damage from something that is not a bullet - an item, a turret, a bee, a
   * wall of fire. It does NOT collect the death: the enemy sweep in
   * _updateEnemies does that, once per frame, and every kill in the game is
   * booked there whatever killed it. Anything that tried to book its own kill
   * here would double-count the combo.
   *
   * @param {Enemy} en
   * @param {number} dmg
   * @param {THREE.Vector3} [dir]  travel direction, for armour facing
   */
  hurtEnemy(en, dmg, dir = null) {
    if (!en || en.dead) return false;
    return en.takeDamage(dmg, false, dir ? dir.x : 0, dir ? dir.z : 0);
  }

  // Adds something to the arena that acts on its own. Capped, because five
  // items can queue a dozen entities each and a player holding the button
  // through a shop should not be able to stand up a hundred meteors.
  deploy(entity) {
    if (this._deployed.length >= MAX_DEPLOYED) {
      // The OLDEST goes, not the newest refused: what the player just pressed
      // must always happen, and a turret from thirty seconds ago is the thing
      // they have already forgotten about.
      this._deployed[0].destroy();
      this._deployed.shift();
    }
    this._deployed.push(entity);
  }

  _updateDeployed(dt) {
    const ctx = this._deployCtx;
    // Sentry guns fire on this edge, twice a beat - see Turret.update.
    ctx.pulse = this.music.pulse;
    ctx.pulseWhole = this.music.pulseWhole;
    ctx.time = this.time;
    for (let i = this._deployed.length - 1; i >= 0; i--) {
      const d = this._deployed[i];
      if (d.update(dt, ctx) === 'alive') continue;
      d.destroy();
      this._deployed.splice(i, 1);
    }
  }

  /**
   * ORGAN GRINDER's monkey, if one is on the floor and armed.
   *
   * RECOMPUTED RATHER THAN REMEMBERED. The monkey sets `lure` on itself and
   * `armed` once it has landed; this is the whole of how main.js finds it, and
   * it costs one walk over a list that is never more than a few dozen long. A
   * field written at the throw would have to be cleared at the explosion, at
   * the wave end, at a death and at a handover - four places to forget, against
   * a scan that cannot go stale.
   *
   * ASKED FROM _updateEnemies AND NOT FROM _updateDeployed, which is where it
   * started: the deployed list is ticked AFTER the enemies (see the frame
   * loop), so a lure found there is a frame behind, and the frame it is behind
   * on is the one the monkey lands in - the exact frame the crowd should turn.
   *
   * THE NEWEST WINS. Two monkeys is a thing MAX_DEPLOYED permits and TWIN CELL
   * makes likely, and the crowd has to be walking toward ONE of them: splitting
   * a wave between two decoys would leave both halves alive when each went off.
   * The most recent throw is the one the player is thinking about.
   */
  _findLure() {
    for (let i = this._deployed.length - 1; i >= 0; i--) {
      const d = this._deployed[i];
      if (d.lure && d.armed) return d;
    }
    return null;
  }

  // ---- the two companions --------------------------------------------------
  //
  /**
   * Stands up whichever pets the build owns, and takes down whichever it does
   * not. Called every frame, and it does nothing at all on nearly all of them.
   *
   * DRIVEN OFF `mods` RATHER THAN OFF THE PICK, and that is what makes versus
   * work for free: a handover replays the incoming player's upgrade list into
   * mods (see restoreRun), so the frame after a swap this reads a different
   * build and swaps the pets with it. Player one's magpie is removed and player
   * two's is created without either turn knowing the other exists.
   *
   * They are NOT deployables. _clearHazards sweeps that list at every wave end;
   * a pet the player had to bury once a minute would be a different item.
   */
  _syncCompanions() {
    const m = this.player.mods;
    // A RUN THAT IS NOT BEING PLAYED HAS NO PETS STANDING IN THE ARENA. There
    // is no separate shop state - the wave break IS the playing state with the
    // totems up - so `state` covers the menu, the pause and the death screen in
    // one test.
    //
    // AND NOT DURING A VERSUS PASS. The state is still 'playing' through the
    // handover, and the body belongs to nobody for those few seconds - for the
    // first half it carries the outgoing player's zeroed run and for the second
    // the incoming player's, who has not been handed the pad yet. Standing a
    // magpie up off a build that is mid-swap would build and destroy one every
    // frame of the caption. It comes back with the wave, out of whoever's build
    // is loaded by then, which is the same rule _clearEntities already follows.
    const live = this.state === 'playing' && !this._pass;
    this._companion(0, live && m.magpie > 0, Magpie);
    this._companion(1, live && m.lamprey > 0, Lamprey);
  }

  // One slot of the companion list. A fixed index per species rather than a
  // push/splice, so "is the bird out" is a question with one answer and the
  // update loop below never has to ask what kind of thing it is holding.
  _companion(slot, want, Cls) {
    const have = this._companions[slot];
    if (want === !!have) return;
    if (want) this._companions[slot] = new Cls(this);
    else {
      have.destroy();
      this._companions[slot] = null;
    }
  }

  _updateCompanions(dt) {
    if (!this._companions[0] && !this._companions[1]) return;
    const ctx = this._compCtx;
    ctx.pulse = this.music.pulse;
    ctx.pulseWhole = this.music.pulseWhole;
    ctx.time = this.time;
    for (const c of this._companions) if (c) c.update(dt, ctx);
  }

  // Both pets down. Goes with _clearEntities rather than with _clearHazards -
  // see the note at the top of js/companions.js - so they survive a wave
  // boundary and never survive a run, a death or a versus handover.
  _clearCompanions() {
    for (let i = 0; i < this._companions.length; i++) {
      if (!this._companions[i]) continue;
      this._companions[i].destroy();
      this._companions[i] = null;
    }
  }

  // Everything the player left standing, taken down. Called from the same
  // place the hazards are cleared - a wave ending, a death, a restart - so a
  // turret cannot outlive the fight it was deployed into.
  _clearDeployed() {
    for (const d of this._deployed) d.destroy();
    this._deployed.length = 0;
  }

  /**
   * LANCE. One enormous round straight down the crosshair that stops for
   * nothing: it walks the whole sorted hit list and damages every enemy on it,
   * where an ordinary shot stops at the first thing that is not one.
   *
   * It goes through _landShot like any other hit, so Venom, Incendiary, the
   * hitmarker, Hot Streak and every other per-shot hook see it and none of
   * them had to be told this item exists.
   *
   * @param {number} mult  multiple of one bullet's damage
   */
  megaShot(mult) {
    const w = this.player.weapon;
    const targets = this._targets;
    targets.length = 0;
    for (const m of this.arena.meshList) targets.push(m);
    for (const e of this.enemies) targets.push(e.hitbox);

    const ray = this._shotRay;
    this._screen.set(0, 0);
    ray.setFromCamera(this._screen, this.camera);
    const hits = this._hits;
    hits.length = 0;
    ray.intersectObjects(targets, false, hits);

    const muzzle = this.player.muzzleInto(this._muzzle);
    // ONE ROLL PER BEAM. The lance is a single shot that happens to pass
    // through everything in the room, so it crits like one.
    const crit = this.player.rollCrit();
    const base = this.player.getEffectiveDamage(w.damage) * mult;
    this._shotHits.clear();
    this._shotCrit.clear();
    this._blastHit = false;
    let last = null;
    let hitAny = false;
    for (const h of hits) {
      const en = h.object.userData.enemy;
      // GEOMETRY DOES NOT STOP IT EITHER - the lance is the one shot in the
      // game that goes through the pillar as well as through the crowd, which
      // is what thirty rounds buys. `last` still tracks the furthest impact so
      // the beam is drawn to somewhere real.
      last = h.point;
      if (!en || en.dead) continue;
      // ONE ROLL, RESOLVED PER BODY. The lance is a single shot, so the die is
      // thrown once - but ASSASSIN, TELLTALE and the range passive items are
      // per-target, and a beam through six enemies asks each of them separately.
      //
      // NOT A TRIGGER PULL, so FATAL RESERVE stays out of it: the lance takes
      // its thirty rounds off the magazine in one go rather than firing them,
      // and `magAtShot` is still whatever the last actual shot saw.
      const hot = this._resolveHit(en, crit, false);
      this._landShot(
        en, h.point, ray.ray.direction, base * this._hitMult(en, hot), 8, hot
      );
      hitAny = true;
    }
    this._shotHits.clear();
    this._shotCrit.clear();
    this.player.bumpStreak(hitAny);
    if (hitAny) {
      this.stats.hits++;
      this.ui.hitMarker();
    }
    this.stats.shotsFired++;
    // Drawn to the end of the ray when it hit nothing at all, so a lance fired
    // at the sky is still a lance.
    if (!last) {
      last = this._rayEnd.copy(ray.ray.origin).addScaledVector(ray.ray.direction, 60);
    }
    // THE SHOT HAS TO LOOK LIKE THIRTY ROUNDS. One tracer would make the
    // biggest press in the pool indistinguishable from an ordinary shot, so
    // the beam is laid down four times with a bloom of sparks along it.
    for (let i = 0; i < 4; i++) this.effects.beam(muzzle, last, i % 2 ? 0xd6ffb0 : 0x76ff03);
    this.effects.flash(muzzle);
    this.effects.burst(last, 0x76ff03, 30, 8, 3, 0.5);
    this.effects.addShake(0.5);
    this.player.kick = -0.22;
    this.pad.rumble(1, 0.6, 240, 2);
    this.sfx.itemLance();
  }

  // Rolls the next wave's enemy queue and difficulty, and sets the pickup
  // budget for it. Enemies then trickle out of the queue on spawnTimer.
  startWave() {
    // The item row keeps wave-break hours. An unclaimed TOTEM set is
    // deliberately left standing into the next wave - that pick is still there
    // to be taken - but a pedestal standing through a fight would be a
    // shootable box that swaps your item by accident, in a room the player is
    // running around at speed. It goes whether or not anything was taken.
    this.mysteryBox.dismiss();
    // The pass ends where every wave break ends: with the wave. A pass cut
    // short before the handover still owes it - a match cannot start a wave
    // with the previous player's run loaded.
    if (this._pass) {
      if (!this._swapped) this._swapRun();
      this._pass = false;
      this._swapped = false;
      this.player.holster = 0;
      this.ui.hideHandoff();
    }
    this.wave++;
    // ADRENALINE. The stacks are what the LAST wave did to the player, and a
    // ramp that survived into a fresh fight would be a bonus the new wave never
    // charged for - see the note on its entry in upgrades.js for why the reset
    // is a wave boundary rather than a clock.
    this.player.adrenalineStacks = 0;
    this._cfg = waveConfig(this.wave, this._themeSeed, HAVE_TYPE, this._forcedTheme);
    this.queue = this._cfg.queue;
    this._startWaveCharge();
    this.spawnTimer = 0.8;
    this.waveState = 'active';
    this.bossFight = null;
    this.ui.setWave(this.wave);
    // WHOSE WAVE THIS IS, said at the top of it. The pass caption is three
    // seconds long and then gone; the wave after it can run for minutes, and a
    // player picking a controller back up needs the answer at the moment the
    // fight starts rather than only before it.
    // Already said at the pick in solo (see _cueWaveOpen); a second identical
    // caption on the same wave would just replay the animation for nothing.
    if (!this._waveCued) {
      this.ui.banner(
        this.match
          ? this.match.label() + '  \u00b7  WAVE ' + this.wave
          : 'WAVE ' + this.wave,
        this.match ? '' : this._themeCaption(this.wave));
    }
    this._waveCued = false;
    // Blackout, then the whole rig hits at once. The dark beat before it is
    // what makes the hit land - a bright room just getting brighter reads as
    // nothing at all.
    this.rig.cueWaveStart();

    // Buffs the wave-end sweep collected but deliberately did not start - see
    // _vacuumPickups. Their clocks begin HERE, with the wave, so a rage picked
    // up off the floor of an empty arena is still ten seconds of rage.
    if (this._pendingBuffs.length) {
      for (const t of this._pendingBuffs) t.apply(this.player, this.time);
      this._pendingBuffs.length = 0;
    }

    // ---- THE SECOND POOL'S WAVE BOUNDARY ----------------------------------
    //
    // BLOOD OATH. Five max HP a wave, permanently, and it stops the moment the
    // cap is at fifty or under - charged HERE against the live maxHealth rather
    // than counted in the getter, which is what makes the floor behave the way
    // the card says: something that later lifts the cap back over fifty starts
    // the meter again, because the test is on the max and not on a wave count.
    const oath = this.player.mods.oathPerWave;
    if (oath > 0 && this.player.maxHealth > this.player.mods.oathFloor) {
      // Never past the floor in one step: a build at 52 loses two, not five.
      const room = this.player.maxHealth - this.player.mods.oathFloor;
      this.player.oathLoss += Math.min(oath, room);
      this.player.health = Math.min(this.player.health, this.player.maxHealth);
      this.effects.shockwave(this.player.pos, THEME_OATH, 4, 0.4);
    }
    // EMERGENCY RATIONS. Exactly fifty, up OR down - it is a floor for a run
    // that is losing and a ceiling for one that is winning, and which of those
    // it is is the whole pick. Written directly rather than through heal(),
    // because it is not a heal in either direction.
    if (this.player.mods.rations > 0) {
      this.player.health = Math.min(this.player.mods.rations, this.player.maxHealth);
    }
    // LAST BREATH re-arms with the wave, like the ward and the salvo below.
    this.player.lastBreathUsed = false;
    this.player.cleanKills = 0;
    this.waveDamageTaken = 0;
    this.player.armWard();
    // OPENING SALVO opens here, on the same signal the ward is armed on.
    this.player.armSalvo(this.time);
    this._reliefT = RELIEF_INTERVAL;
    if (this._cfg.boss) this._spawnBoss(this._cfg.bossKey);
  }

  // ---- boss waves --------------------------------------------------------

  // Places the boss and opens the fight. Unlike a normal spawn this ignores
  // the drip: the boss is there from the first second, and the adds arrive
  // around it.
  _spawnBoss(key) {
    const sc = bossScale(this.wave);
    const def = ENEMY_TYPES[key];
    // The farthest spawn point, not the first clear one. A boss appearing at
    // the edge of vision is an entrance; one appearing at arm's length is an
    // ambush the player had no way to read.
    let best = this.arena.spawnPoints[0];
    let bestD = -1;
    for (const sp of this.arena.spawnPoints) {
      const d = sp.distanceTo(this.player.pos);
      if (d > bestD) {
        bestD = d;
        best = sp;
      }
    }
    const at = new THREE.Vector3(best.x, 0, best.z);
    resolveCircle(at, def.radius, this.arena.obstacles, BOSS_HEIGHT);
    // EXECUTIONER, folded into the wave's own scaling rather than applied to
    // the boss afterwards: hp here is a MULTIPLIER on the type's base block,
    // so halving it halves both the health bar and the max the bar is drawn
    // against. A boss already standing keeps the health it arrived with.
    const boss = new Enemy(key, at, sc.hp * this.player.mods.bossHpMult, sc.speed, sc.dmg);
    boss.rate = sc.rate;
    boss.cycle = Math.floor((this.wave - 1) / 25);
    this.scene.add(boss.group);
    this.enemies.push(boss);
    this._bigAlive++;

    this.bossFight = {
      key,
      name: BOSS_NAMES[key],
      parts: [boss],
      totalMaxHp: boss.maxHp,
      addTimer: 3,
      maxAdds: this._cfg.maxAdds,
      addInterval: this._cfg.addInterval,
      // How many health thresholds the boss has already bled a pickup at.
      bleedAt: 0,
      note: '',
      state: '',
    };
    this.effects.burst(at, def.color, 40, 8, 3, 1.0);
    this.effects.shockwave(at, def.color, 8, 0.7);
    this.effects.addShake(0.4);
    this.ui.banner(BOSS_NAMES[key]);
    this.sfx.wave();
    this.rig.setEnraged(false);
  }

  // The per-wave bookkeeping, reset before a single enemy has spawned.
  //
  // THERE IS NO WAVE TOTAL TO WORK OUT ANY MORE. Charge is a flat rate on each
  // enemy's own value (see CHARGE_PER_VALUE), so a wave is worth whatever its
  // cast happens to add up to and a bigger wave is simply worth more. All this
  // has to clear is what the LAST wave left behind.
  _startWaveCharge() {
    this._pendingCharge = 0;
    this._pendingValue = 0;
    this._addCharge = 0;
    this._bossChargeFrac = 1;
  }

  // The boss's own share, bled off its health bar rather than paid at the kill.
  // A boss is a minutes-long fight and the one enemy whose death is the end of
  // the wave: paying it all at the end would leave the meter dead for the whole
  // fight and then full with nothing left to use it on.
  //
  // Driven by the DROP in the bar, so a boss with several parts needs no
  // special case and healing - if one ever gets it - simply pays nothing back.
  _bossChargeDrain() {
    const bf = this.bossFight;
    if (!bf || !bf.parts.length) return;
    const frac = this._bossHpFrac();
    const fell = this._bossChargeFrac - frac;
    if (fell <= 0) return;
    this._bossChargeFrac = frac;
    // The boss is worth its own value at the same flat rate as anything else -
    // four to nine thousand, so forty to ninety points, which is what a late
    // ground wave pays too. It is simply handed over as the bar falls rather
    // than in one lump at the end: a boss is minutes long, and a meter that sat
    // dead for all of it and filled on the last shot would be no use in the
    // fight it was earned in.
    //
    // Driven by the DROP in the bar, so a boss with several parts needs no
    // special case and healing - if one ever gets it - pays nothing back.
    const def = ENEMY_TYPES[bf.key];
    if (!def) return;
    // Paid straight into the meter. There are no orbs to carry it - the boss
    // does not drop its money until it dies - so the pickup vehicle cannot.
    this.player.addItemCharge(def.value * CHARGE_PER_VALUE * fell);
  }

  // Live health across every part, for the bar.
  _bossHpFrac() {
    const bf = this.bossFight;
    if (!bf || !bf.totalMaxHp) return 0;
    let hp = 0;
    for (const p of bf.parts) hp += p.hp;
    return hp / bf.totalMaxHp;
  }

  // Boss-specific announcements. Kept in one place so a boss's ai() does not
  // need to know anything about the HUD.
  _bossEvent(kind, enemy) {
    const bf = this.bossFight;
    if (!bf) return;
    if (kind === 'stagger') {
      // NO TEXT, EITHER ON THE SCREEN OR IN THE BAR. A boss slamming into a
      // pillar already blacks the room out and flares it white, the bar turns
      // cyan for as long as the window is open, and the damage numbers coming
      // off it go from 22% to full - three signals, all of them showing rather
      // than telling. A banner reading STAGGERED over the top of that was the
      // game narrating something the player could already see.
      bf.state = 'vulnerable';
      this.sfx.impact();
      // Black out, then flare white as it comes back up.
      this.rig.cueStagger();
    } else if (kind === 'recover') {
      bf.state = '';
      // Back to whatever the core is doing, not to blank: a boss standing back
      // up with its shutters still open must not read as a window that closed.
      bf.note = enemy.bs && enemy.bs.weakOpen ? 'CORE EXPOSED' : '';
      this.rig.setEnraged(false);
    } else if (kind === 'vent') {
      // Colossus's chest core opening and closing. The quietest boss note
      // there is, and it yields to ENRAGED - that is a one-shot event the
      // player must not lose sight of behind a label that changes
      // every few seconds.
      if (!bf.state) {
        bf.note = enemy.bs.weakOpen ? (enemy.bs.ventNote || 'CORE EXPOSED') : '';
      }
    } else if (kind === 'charge') {
      // NO SOUND. The charge is already announced by the boss squaring up and
      // by the room; a fanfare on top of it fired every few seconds for the
      // length of the fight, which is how a telegraph turns into noise.
    } else if (kind === 'enrage') {
      bf.state = 'enraged';
      bf.note = 'ENRAGED';
      this.ui.banner('ENRAGED');
      this.sfx.wave();
      // Hands the room over to a red alarm until the boss recovers or dies.
      this.rig.setEnraged(true);
    } else if (kind === 'split') {
      this._splitBoss(enemy);
    } else if (kind === 'choir') {
      this._raiseChoir(enemy);
    } else if (kind === 'freed') {
      // Killing a SILENT body. The bar does not care - the pool is shared -
      // so the only way the player finds out they chose wrong is here.
      bf.note = 'FREED';
      this.ui.banner('THE CHOIR IS FREED');
      this.sfx.wave();
      this.effects.addShake(0.3);
    }
  }

  // Schism's split. Called from a boss's ai() through ctx.bossEvent, which
  // means it runs DURING _updateEnemies' update pass - the parent is still
  // alive and still in both lists at this point.
  //
  // The children go to _pendingSpawns like a splitter's minis, so they are not
  // visited by the loop that created them, and into `parts` immediately. That
  // second write is what keeps the wave from ending: the parent is removed
  // from `parts` later in the same frame, and if the children were not already
  // there the next _updateWave would see an empty parts list and call the
  // fight won.
  // THE DROWNED CHOIR standing up. Called once, from its own ai() on its first
  // frame, and it turns the one body main.js spawned into three.
  //
  // The pool is DIVIDED rather than duplicated, exactly as a Schism split
  // divides it: totalMaxHp was taken from the body that spawned, so three
  // bodies of a third each leaves the bar reading the same fight it was going
  // to be. Nothing else in the boss machinery needs to know - the bar already
  // sums every part, the payout already follows the bar's drop, and the fight
  // already ends when the last part dies.
  _raiseChoir(e) {
    const bf = this.bossFight;
    if (!bf || bf.parts.length > 1) return;
    const sc = bossScale(this.wave);
    const share = e.maxHp / 3;
    e.maxHp = share;
    e.hp = Math.min(e.hp, share);
    e.value = Math.round(e.value / 3);
    for (let i = 1; i < 3; i++) {
      const ang = (i === 1 ? 2.1 : -2.1) + Math.random() * 0.3;
      const at = new THREE.Vector3(
        e.pos.x + Math.cos(ang) * 4.2, 0, e.pos.z + Math.sin(ang) * 4.2
      );
      const body = new Enemy('choir', at, sc.hp * this.player.mods.bossHpMult, sc.speed, sc.dmg);
      body.rate = e.rate;
      body.cycle = e.cycle;
      body.maxHp = share;
      body.hp = share;
      body.value = e.value;
      body.bs.voice = i;
      body.bs.freed = 1;
      resolveCircle(body.pos, body.radius, this.arena.obstacles, body.collideH);
      this.scene.add(body.group);
      this._pendingSpawns.push(body);
      this._bigAlive++;
      bf.parts.push(body);
      this.effects.burst(at, ENEMY_TYPES.choir.color, 30, 7, 2.5, 0.7);
    }
    bf.note = '';
    this.effects.shockwave(e.pos, ENEMY_TYPES.choir.color, 7, 0.6);
    this.effects.addShake(0.3);
    this.ui.banner('THEY ARE THREE');
  }

  _splitBoss(e) {
    const bf = this.bossFight;
    if (!bf) return;
    const sc = bossScale(this.wave);
    const tier = e.bs.tier;
    // Each half carries half the parent's remaining pool, so the total health
    // left in the fight is unchanged by the split itself.
    const half = e.maxHp * 0.5;
    for (let i = 0; i < 2; i++) {
      const ang = (i === 0 ? 1 : -1) * 1.2 + Math.random() * 0.4;
      const at = new THREE.Vector3(
        e.pos.x + Math.cos(ang) * 2.2, 0, e.pos.z + Math.sin(ang) * 2.2
      );
      const child = new Enemy('schism', at, sc.hp, sc.speed, sc.dmg);
      child.rate = e.rate;
      child.cycle = e.cycle;
      child.maxHp = half;
      child.hp = half;
      child.bs.tier = tier;
      // The geometry cache bakes `scale` per TYPE, so a child cannot have its
      // own - visual size comes from the group, exactly as a splitter's minis
      // do. Collision and melee reach follow through `radius`.
      // Three tiers now, so three steps down. The last one is small and fast
      // and there are eight of them - the fight ends as a swarm of the thing
      // it started as.
      const shrink = tier === 1 ? 0.68 : tier === 2 ? 0.46 : 0.32;
      child.group.scale.setScalar(shrink);
      child.radius = ENEMY_TYPES.schism.radius * shrink;
      child.speed = e.speed * (tier === 1 ? 1.2 : tier === 2 ? 1.4 : 1.55);
      // The payout is divided rather than duplicated: splitting is the boss
      // surviving, not four more bosses to be paid for.
      child.value = Math.round(e.value * 0.5);
      resolveCircle(child.pos, child.radius, this.arena.obstacles, child.collideH);
      this.scene.add(child.group);
      this._pendingSpawns.push(child);
      bf.parts.push(child);
    }
    // The parent dies of the split itself.
    e.hp = 0;
    e.dead = true;
    e.value = 0;
    bf.note = 'PARTS ' + bf.parts.length;
    this.effects.shockwave(e.pos, ENEMY_TYPES.schism.color, 6, 0.5);
    this.effects.burst(
      this._killPos.set(e.pos.x, 1.2, e.pos.z), ENEMY_TYPES.schism.color, 30, 7, 2.5, 0.7
    );
    this.effects.addShake(0.25);
    this.ui.banner('IT SPLITS');
    this.sfx.wave();
  }

  // Adds keep arriving for as long as the boss lives. There is no budget: the
  // only bound is how many may be alive at once, so a player who kills them
  // faster simply gets more of them, and one who ignores them is surrounded.
  _updateBossAdds(dt) {
    const bf = this.bossFight;
    bf.addTimer -= dt;
    if (bf.addTimer > 0) return;
    bf.addTimer = bf.addInterval;
    // Turrets and anchors are the boss's own attack, not adds, and must not eat
    // the trickle budget: three of them standing would otherwise stop the wave
    // sending anything else at all. It matters more for the Pale Crown's
    // anchors than it ever did for Colossus's turrets - the anchors are up for
    // most of that fight, so counting them would mean the Crown's shell phases
    // were also its quiet phases, which is the opposite of the intent.
    let adds = this.enemies.length - bf.parts.length;
    for (const e of this.enemies) {
      if (e.type === 'turret' || e.type === 'anchor' || e.type === 'pylon') adds--;
    }
    if (adds >= bf.maxAdds) return;
    this.spawnEnemy(pickAddType(this.wave, this._themeSeed, HAVE_TYPE, this._forcedTheme));
  }

  // Ends a boss wave the moment the last part dies. Everything still on the
  // field is cleared out - the fight is over, and leaving a handful of adds to
  // mop up would end the wave on an anticlimax.
  //
  // Deliberately no payout and no combo for the purge: five free kills at the
  // wave boundary would inflate both the money and the best-chain stat with
  // something the player did not do.
  _finishBossWave() {
    for (const e of this.enemies) {
      this.effects.burst(this._killPos.set(e.pos.x, e.pos.y + 0.8, e.pos.z), e.colorHex, 14, 5, 2, 0.5);
      this.scene.remove(e.group);
      e.dispose();
    }
    this.enemies.length = 0;
    this._bigAlive = 0;
    this._clearHazards();
    this.bossFight = null;
    this.ui.setBoss(null, 0, '', '');
    // Hands the room back: the boss colour and the tightened fog both release
    // once nothing is driving them.
    this.rig.setEnraged(false);
  }

  // The boss kill's own payout, on top of the ordinary clear bonus.
  //
  // MONEY ONLY. It used to hand back a full health bar and a full reserve as
  // well, which quietly undid the fight: whatever the boss had cost was
  // refunded the instant it died, so there was no such thing as coming out of
  // one in trouble. The player is paid enough to buy what they need at the
  // stations, and choosing between health and ammo with a fixed sum is the
  // decision the free refill was taking away.
  _payBossBonus() {
    const bonus = BOSS_BONUS_BASE + BOSS_BONUS_PER_WAVE * this.wave;
    // The one payout in the game that is still a lump sum, and it arrives as a
    // shower: BOSS_ORBS orbs thrown wide from where the boss was standing, so
    // the reward for the fight is a floor covered in money rather than a
    // number that changed in the corner of the screen. The wave-clear vacuum
    // that follows sweeps up anything the player does not walk over.
    const at = this._bossDeathPos;
    // Through _dropMoney like every other payout, so Midas and the flawless
    // streak are applied in one place. Thrown from where the boss died, which
    // is why this one needs no hold: it lands well outside the magnet.
    //
    // NOT SPLIT. The boss is the one payout that already reaches every player
    // in the match - the mirror below hands a whole bounty to each of them -
    // so it is paid at face value here and the player multiplier would be
    // counting the same distribution twice.
    this._dropMoney(at, bonus, BOSS_ORBS, 7.5, undefined, false);
    // AND THEN THEY COME TO YOU. The wave-clear vacuum has already run by the
    // time this is called, so without a second sweep the boss's own payout was
    // the one drop in the game left lying on the floor - forty orbs thrown
    // wide across the arena, most of them outside the magnet, timing out at
    // ORB_LIFETIME while the player shops. Delayed by the length of the arc so
    // the shower is still SEEN to land before it streams back in.
    this.money.vacuum(BOSS_ORB_SWEEP_DELAY);
    // MIRRORED, AND SILENTLY. Only one of the two players is holding the
    // controller for a boss, and letting the bounty follow the controller
    // would make the run's largest single payout a matter of whose turn wave
    // ten happened to be. The other player's balance is simply larger when
    // they next look at it - announcing it would be telling them about a fight
    // they did not have. Scaled by THEIR Midas and THEIR flawless streak, not
    // this player's, which is why the snapshot caches both multipliers: a
    // benched build is plain data, and neither number can be recomputed from
    // it once the live Player belongs to somebody else.
    // EVERY benched survivor, not just "the other one". With four players the
    // boss is one turn in four, and a bounty that followed the controller
    // would make the run's largest single payout a matter of whose turn wave
    // ten happened to be - three times over. An eliminated slot is skipped
    // because it is never restored: paying it is paying nobody.
    if (this.match) {
      for (const i of this.match.alive) {
        if (i === this.match.active) continue;
        const s = this.match.slots[i];
        s.game.credits += bonus * s.creditMult * s.flawlessMult;
      }
    }
    this.effects.shockwave(this.player.pos, 0x00e676, 6, 0.6);
    this.ui.banner('BOSS DOWN  +$'
      + Math.round(bonus * this.player.mods.creditMult * this.flawlessMult()));
  }

  // A turret, in the air, on its way to (tx, tz). Everything that makes it a
  // turret rather than an ordinary spawn is the flight state written here; the
  // type's ai() takes over from the next frame.
  //
  // It is spawned as a NORMAL ENEMY on purpose. That is what makes it
  // shootable, killable, worth money and cleaned up by _finishBossWave for
  // free - a bespoke prop would have needed all four written again.
  _spawnTurret(fx, fy, fz, tx, tz) {
    const at = new THREE.Vector3(fx, fy, fz);
    const e = new Enemy('turret', at, this._cfg.hpScale, 1, this._cfg.dmgScale);
    e.tState = 'arc';
    e.tT = 0;
    e.tFromX = fx;
    e.tFromY = fy;
    e.tFromZ = fz;
    e.tToX = tx;
    e.tToZ = tz;
    e.tFireCd = 0;
    // -1 is a legal handle everywhere in effects.js: with every telegraph slot
    // busy the turret still flies and still lands, just without its ring.
    e.tMark = this.effects.markAcquire();
    this.scene.add(e.group);
    this.enemies.push(e);
  }

  // One of the Pale Crown's anchors, driven in where the boss asked rather than
  // at a spawn point - the whole mechanic is that they are spread around the
  // ARENA and have to be crossed to. Returns it so the boss can hold it.
  // TAKES THE TYPE, because two bosses now drive things into the floor and
  // they are not the same object: the Pale Crown's anchor is a lock on its
  // shell and the Conductor's pylon is one end of a wire. Both are inert, both
  // are spawned by their boss and both are excluded from the add budget, which
  // is the whole reason they share a hook - the type is what they differ by.
  _spawnAnchor(x, z, type = 'anchor') {
    const at = new THREE.Vector3(x, 0, z);
    // Scaled by health only. An anchor never moves and never hits, so speed
    // and damage scaling would be multiplying zero.
    const e = new Enemy(type, at, this._cfg.hpScale, 1, 1);
    this.scene.add(e.group);
    this.enemies.push(e);
    this.effects.burst(at, e.colorHex, 16, 4, 2, 0.5);
    return e;
  }

  // A carrion raising a body. It is an ordinary enemy of an ordinary type,
  // scaled by the wave exactly as a spawned one is - and then cut down to a
  // fraction of its bar and marked, so it cannot be raised a second time and
  // so it is worth a fraction of the money. Raising a dead enemy for full
  // value would make a carrion a payout the player farms rather than a support
  // they have to deal with.
  _spawnRevenant(x, z, type, frac = 0.4) {
    if (!ENEMY_TYPES[type]) return null;
    const at = new THREE.Vector3(x, 0, z);
    const c = this._cfg;
    const e = new Enemy(type, at, c.hpScale, c.speedScale, c.dmgScale);
    e.maxHp *= frac;
    e.hp = e.maxHp;
    e.value = Math.round(e.value * frac);
    e.revenant = true;
    resolveCircle(e.pos, e.radius, this.arena.obstacles, e.collideH);
    this.scene.add(e.group);
    this.enemies.push(e);
    this.effects.burst(at, 0xcc3d8a, 20, 5, 2, 0.6);
    return e;
  }

  spawnEnemy(type) {
    const j = this._pickSpawnPos();
    const e = new Enemy(type, j, this._cfg.hpScale, this._cfg.speedScale, this._cfg.dmgScale);
    this.scene.add(e.group);
    this.enemies.push(e);
    this.effects.burst(j, e.colorHex, 12, 3, 2, 0.4);
    this.stats.spawned++;
  }

  // A jittered spawn point outside the no-spawn bubble. Walks the grid from a
  // random start and takes the first point that clears the distance; if the
  // player has somehow crowded all of them, the farthest one is used rather
  // than giving up and spawning on top of them.
  //
  // The jitter is applied FIRST and then checked, because it is up to a metre
  // in each axis and can carry a point that only just cleared the bubble back
  // inside it - which is exactly the case the bubble exists for. A jittered
  // point that fails is pushed straight back out along the line from the
  // player, so the spread survives and the guarantee holds.
  _pickSpawnPos() {
    const points = this.arena.spawnPoints;
    const start = (Math.random() * points.length) | 0;
    let best = null;
    let bestD = -1;
    for (let i = 0; i < points.length; i++) {
      const sp = points[(start + i) % points.length];
      const d = Math.hypot(sp.x - this.player.pos.x, sp.z - this.player.pos.z);
      if (d >= MIN_SPAWN_DISTANCE) {
        best = sp;
        break;
      }
      if (d > bestD) {
        bestD = d;
        best = sp;
      }
    }
    const at = new THREE.Vector3(
      best.x + (Math.random() - 0.5) * 2, 0, best.z + (Math.random() - 0.5) * 2
    );
    const dx = at.x - this.player.pos.x;
    const dz = at.z - this.player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.001 && d < MIN_SPAWN_DISTANCE) {
      const k = MIN_SPAWN_DISTANCE / d;
      at.x = this.player.pos.x + dx * k;
      at.z = this.player.pos.z + dz * k;
      // Pushing outward can leave the arena; the walls are at 21.6.
      at.x = Math.max(-21, Math.min(21, at.x));
      at.z = Math.max(-21, Math.min(21, at.z));
    }
    return at;
  }

  gameOver() {
    if (this.state === 'gameover') return;
    // VERSUS HAS NO GAME OVER, only a lost wave. Branched here rather than at
    // the three places that reach it - the health test in the loop, the last
    // point of a hit, the last tick of a pool - so there is exactly one door
    // between "the player is dead" and "the run is over".
    if (this.match) { this._playerFell(); return; }
    this.state = 'gameover';
    this._clearInput();
    // A panel held open across the death would sit over the game-over screen
    // with no key left to release it.
    this._closeStats();
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    const eye = this.player.eyeInto(this._killPos);
    this.effects.burst(eye, 0x4ef3ff, 40, 6, 3, 0.9);
    this.comboKills = 0;
    this.comboTimer = 0;
    this.ui.setPrompt(null, false);
    this.ui.setBoss(null, 0, '', '');
    // The boss keeps its telegraphs until it is disposed, and on the game-over
    // screen it never is - release them with the fight.
    if (this.bossFight) {
      for (const p of this.bossFight.parts) {
        const def = ENEMY_TYPES[p.type];
        if (def.cleanup) def.cleanup(p);
      }
      this.bossFight = null;
    }
    this._clearHazards();
    const st = this.stats;
    const acc = st.shotsFired > 0 ? Math.round((st.hits / st.shotsFired) * 100) : 0;
    this.ui.showOver(this.wave, this.kills, acc + '%', Math.floor(this.credits));
    // The heaviest the sound goes. This is the run ending, not a body.
    this.sfx.death(1.2);
    // And the heaviest the pad goes, at a priority nothing else in the game
    // uses - there is nothing left that could need to interrupt it.
    this.pad.rumble(1, 0.8, 700, 4);
  }

  // How hard the kill chain is running, 1 upward.
  //
  // IT BUYS NOTHING. This used to multiply every kill's bounty, and the money
  // is why it is not on the HUD any more: paying for a chain made hoarding a
  // wave and killing it all at once the most profitable way to play, which is
  // a strategy of not shooting things. The chain survives because rig.js reads
  // this to drive how hard the room is being pushed - the lights and the music
  // still get more excited the better you are doing, and now that is ALL it
  // does. Nothing the player has to read, and nothing they can play toward.
  comboMult() {
    if (this.comboKills < 2) return 1;
    return Math.min(COMBO_MAX, 1 + COMBO_STEP * (this.comboKills - 1));
  }

  // The flawless streak's multiplier, live. See flawlessStreakMult.
  flawlessMult() {
    return flawlessStreakMult(this.player.flawlessStreak);
  }

  // A HIT LANDED, and the single place that fact is booked.
  //
  // Both of the game's damage paths - a body or a shot in _hurtPlayer, a
  // hazard tick in _hazardDamage - come through here, because the flawless
  // streak is worth real money and a second place that forgot to break it
  // would be a way to earn the multiplier while being hit. `lastDamageTaken`
  // is what LANDED after curse and mitigation, which is the same number
  // lastPerfect is decided on, so the streak and the FLAWLESS banner can never
  // disagree about whether the player was touched.
  _noteDamage() {
    const d = this.player.lastDamageTaken;
    if (d <= 0) return;
    this.stats.damaged += d;
    this.waveDamageTaken += d;
    // BLOOD MONEY and ADRENALINE, the two picks that make a hit taken pay. Both
    // are here rather than in _hurtPlayer for one reason: this is the only
    // place that sees what ACTUALLY LANDED. A dodge, the ward and Aegis never
    // reach it at all, and everything that does has already been through curse,
    // Blood Pact and RED MIST - so a cursed hit pays 25% more, which is the
    // honest reading of "scales with the damage taken". It also means the
    // hazard path (_hurtPlayerDot) is covered for free, because that calls this
    // too: a player standing in lava is being hurt, and being hurt is the
    // trigger.
    const m = this.player.mods;
    if (m.bloodMoney > 0) {
      // STRAIGHT INTO THE BALANCE, not onto the floor as orbs. It is
      // compensation and not loot: the player is being paid for something that
      // happened TO them, usually while they are in no position to walk
      // anywhere, and orbs they cannot collect would be an insult. It also
      // keeps it clear of _dropMoney's two multipliers - Midas and the flawless
      // streak - and the second of those is about to be zeroed by the very hit
      // that paid this out.
      const paid = d * m.bloodMoney;
      this.credits += paid;
      this._creditsDirty = true;
      this.effects.burst(
        this.player.eyeInto(this._killPos), 0xc79a3a, 8, 3.5, 2, 0.45
      );
    }
    if (m.adrenalineStep > 0) {
      // Capped at the stack that reaches adrenalineMax rather than left to run
      // and clamped at read time, so the number the HUD and the build sheet
      // report is the number that is actually being paid.
      const cap = Math.ceil(m.adrenalineMax / m.adrenalineStep);
      if (this.player.adrenalineStacks < cap) {
        this.player.adrenalineStacks++;
        this.effects.shockwave(this.player.pos, 0xe64a19, 2.4, 0.3);
      }
    }
    // IMMEDIATELY, not at the wave clear. The rest of this wave is paid at 1x,
    // and the player feels the multiplier go the instant they are hit rather
    // than finding out about it in a banner thirty seconds later.
    this.player.flawlessStreak = 0;
  }

  // MONEY DROPPED, not money earned. Everything a kill is worth goes onto the
  // floor as orbs and the balance only moves when they are collected.
  //
  // EVERY PAYOUT IN THE GAME GOES THROUGH HERE - a kill, the flawless shower,
  // the boss bounty - which is what guarantees the two multipliers below are
  // applied once each and to all of them. The showers pass their own orb count
  // and spread; a kill takes the defaults.
  //
  // Midas's creditMult and the flawless streak are applied HERE rather than at
  // collection, so the orbs that hit the floor are already worth what the
  // player's build and their run say they are worth - a Midas run visibly
  // drops more money, which is the whole point of taking it - and so a mid-run
  // pick, or a hit taken while the orbs are still lying there, can never
  // retroactively revalue money that has already been dropped.
  /**
   * HOW MANY WAYS THE WAVES ARE SPLIT. One in solo; in a match, the number of
   * players still in it.
   *
   * WHY MONEY SCALES WITH IT. The wave counter goes up on every clear, so a
   * player in a four-handed match plays roughly one wave in four - but the
   * shop's prices are keyed to the WAVE, not to how many of them they fought
   * (see blockPrice in upgrades.js). Left alone they would meet wave-twenty
   * prices on a quarter of a run's income, and the box would simply be out of
   * reach for the whole match. Paying each of them N times per kill puts a
   * full run's income against a full run's prices.
   *
   * IT FALLS AS PLAYERS GO OUT, and that is the same rule and not a second
   * one: two survivors take every other wave, so two is exactly what their
   * income needs multiplying by. `alive` is only spliced when a CONTEST CLOSES
   * (see versus.js), never mid-contest, so every contestant on a given wave
   * earns at the same rate - which is what makes a contest a fair test.
   */
  _playerMult() {
    return this.match ? this.match.alive.length : 1;
  }

  /**
   * @param {boolean} split whether the player multiplier applies. TRUE for
   *   everything a player earns for themselves; FALSE for a payout that is
   *   ALREADY shared out to every player by hand, which is the boss bounty and
   *   only the boss bounty - see _payBossBonus. Paying that one N times to the
   *   player holding the pad AND once to each of the others would be N + N - 1
   *   bounties for one boss.
   */
  _dropMoney(pos, amount, maxOrbs, spread, hold, split = true) {
    if (amount <= 0) return 0;
    const paid = amount * this.player.mods.creditMult * this.flawlessMult();
    // THE TWO FIGURES ARE DIFFERENT ON PURPOSE, and collapsing them back into
    // one is the mistake this comment exists to stop.
    //
    // What is SPAWNED takes the player split, because credits are banked
    // across turns and the split is restoring a run's worth of them.
    //
    // What is RETURNED does not, because it is the item charge (see
    // _collectOrb), and charge is earned and spent inside a single fight.
    // Multiplying it would not be compensating a four-handed player for the
    // waves they never played - it would hand them four times the active-item
    // uptime in the wave they are actually in, which is just being stronger.
    this.money.spawn(pos, split ? paid * this._playerMult() : paid,
      maxOrbs, spread, hold);
    // The figure paid comes back out for the item charge, which is handed over
    // as those orbs are collected and in proportion to what each one is worth -
    // see _collectOrb. Nothing about the MONEY itself needs it.
    return paid;
  }

  // WHAT A KILL IS WORTH, banked as the enemy dies and paid out as its orbs are
  // picked up. The two halves are deliberately separate: banking is where the
  // PRICE lives (a flat rate on the enemy's own value, with no multiplier able
  // to reach it) and paying out is where the FEEL lives (the meter climbs as
  // the lights stream in). Splitting them is what lets the charge be immune to
  // Midas and to the flawless streak while still arriving on the pickup.
  //
  // `worth` is the enemy's value and `paid` is the money its orbs actually
  // carry - two different numbers on purpose. The first sets how much charge is
  // owed; the second only sets how it is spread over the pickups.
  _bankKillCharge(worth, paid) {
    if (!(worth > 0) || !(paid > 0)) return;
    let points = worth * CHARGE_PER_VALUE;
    // THE ONE CEILING IN THE SYSTEM. A boss wave's adds never stop arriving, so
    // without this a player could leave the boss standing and farm the trickle
    // - which is the stall this whole change exists to remove, wearing a hat.
    // Every other wave has a fixed cast and so needs no limit at all.
    if (this.bossFight) {
      const room = BOSS_ADD_CHARGE_CAP - this._addCharge;
      if (room <= 0) return;
      points = Math.min(points, room);
      this._addCharge += points;
    }
    this._pendingCharge += points;
    this._pendingValue += paid;
  }

  // Everything still owed, handed over at once. Called when the wave ends, so
  // charge can never be stranded on an orb that was never picked up - or on one
  // the MAX_ORBS cap folded into its neighbour.
  _flushItemCharge() {
    if (this._pendingCharge > 0) this.player.addItemCharge(this._pendingCharge);
    this._pendingCharge = 0;
    this._pendingValue = 0;
  }

  // An orb reached the player. The single entry point for the balance going
  // up; the value is already final by the time it gets here.
  _collectOrb(value) {
    this.credits += value;
    this._creditsDirty = true;
    // THE ITEM METER MOVES HERE AND NOWHERE ELSE, in proportion to what this
    // orb is WORTH rather than to it being one orb. The split rule can put a
    // kill's money into anything from one orb to five (see Money.spawn), so
    // paying per orb would hand a fat orb and a thin one the same charge; per
    // value, a kill's charge arrives at the same rate whichever way it split.
    //
    // A bonus orb - a boss shower, a flawless payout - banked nothing when it
    // dropped, so it can only pull forward charge the player had already
    // earned. The total is fixed by the bank, and the wave-end flush pays out
    // whatever the proportions left behind.
    if (this._pendingValue > 0 && this._pendingCharge > 0) {
      const slice = Math.min(
        this._pendingCharge, this._pendingCharge * (value / this._pendingValue)
      );
      this.player.addItemCharge(slice);
      this._pendingCharge -= slice;
      this._pendingValue = Math.max(0, this._pendingValue - value);
    }
    // BLOOD FROM STONE. A point per ORB and not per credit: the denomination
    // of an orb is an implementation detail of how a payout is split up, and
    // healing by the value would make a boss shower a full heal several times
    // over. What the player can see on the floor is a number of lights, and
    // that is what this pays out on.
    // NO FULL-HEALTH GUARD. It used to skip the heal outright at a full bar,
    // which is the same shortcut every heal in the game used to take and the
    // same one OVERDRAW made wrong: a point that does not fit is now a point
    // of item charge rather than a point thrown away. heal() decides.
    if (this.time < this.player.orbHealEnd) this.player.heal(1);
  }

  // Extends the kill chain. Called once per enemy death. Nothing is paid for
  // it any more - it drives the room and only the room, see comboMult.
  _bumpCombo() {
    this.comboKills++;
    this.comboTimer = COMBO_WINDOW;
  }

  // ---- THE SECOND POOL'S ARENA EFFECTS ------------------------------------

  /**
   * DELAYED FUSE. Parks a round on a body instead of dealing it.
   *
   * THE BODY IS HELD, NOT THE POINT. A fuse that went off where the shot landed
   * would be a mine on the floor two seconds behind a moving enemy, which is a
   * different item and a much worse one - the whole pick is that the round
   * TRAVELS with what it stuck to. A body that dies in the meantime still owes
   * the blast: it goes off at the last place the enemy stood, which is where
   * the rest of the crowd is.
   *
   * The list is a plain array walked backwards. It never holds more than a
   * couple of seconds of trigger, which even at Overwound's rate is a few dozen
   * entries, and every one of them is removed by the same pass.
   */
  _stick(en, dmg, point) {
    // THE RADIUS IS SNAPSHOTTED WITH THE ROUND, not read when it goes off. A
    // fuse outlives the trigger pull by two seconds, and in versus that is long
    // enough for a handover to replace the whole build underneath it - at which
    // point `mods.fuseRadius` is the incoming player's, or zero, and a round
    // already in flight would go off over nothing.
    const delay = this.player.mods.fuseDelay;
    // HOW FAR UP THE BODY THE ROUND WENT IN, as a height above the enemy's
    // feet. `point` is where the pellet actually landed, so a shot to the head
    // marks the head - which is the whole reason the dot is worth drawing ON
    // the body rather than over it. Clamped off the floor and off the top, so a
    // graze at the very edge of a hitbox still leaves a dot on the model.
    const h = Math.min(
      Math.max(point ? point.y - en.pos.y : en.radius * 1.6, 0.3),
      Math.max(0.6, en.radius * 3.2)
    );
    this._fuses.push({
      en,
      dmg,
      radius: this.player.mods.fuseRadius,
      at: this.time + delay,
      delay,
      // WHERE ON THE BODY, kept as a HEIGHT off the enemy's feet rather than as
      // a world point: the dot has to ride the body, and a body walks. Only the
      // height is worth keeping - a horizontal offset would need the enemy's
      // facing to stay meaningful as it turns, and a dot that slid around the
      // model as it walked would read as a bug rather than as a round stuck in
      // it.
      h,
      x: en.pos.x, y: en.pos.y, z: en.pos.z,
      // A pip if one was free. -1 is a fuse the pool had no room for: it still
      // explodes on time, it is simply unmarked, and because pips are handed
      // out oldest-first the ones that go unmarked are the newest - which are
      // also the ones with the longest left to run. See Effects.pipAcquire.
      pip: this.effects.pipAcquire(),
    });
    // The tell, and it has to be a good one: this is the only shot in the game
    // that lands and does nothing, so without a mark on the body the player
    // reads two seconds of their own damage as the gun being broken.
    this.effects.impact(en.pos, THEME_FUSE, 6, 3, 1.6, 0.3);
  }

  // The fuses coming due. Everything a stuck round is worth goes off over
  // fuseRadius through the same blast every other explosion in the game uses -
  // so armour facing, the ward and the Conduit's resistance all apply exactly
  // as they would to a DETONATOR, and none of it needs saying twice.
  _updateFuses(dt) {
    // THE SOONEST FUSE, for the sound. Found on the way through rather than in
    // a second pass, and used below.
    let soon = null;
    for (let i = this._fuses.length - 1; i >= 0; i--) {
      const f = this._fuses[i];
      // THE ROUND DIES WITH THE BODY IT IS STUCK IN. A fuse is not a mine on
      // the floor and it is not a shot in the air - it is lodged in an enemy,
      // so when that enemy comes apart the round goes with it. Anything else
      // would leave the arena full of invisible delayed blasts going off at
      // corpses that are no longer there, which is a mechanic the player has no
      // way to see, predict or play around.
      //
      // It also closes the loop the pick would otherwise open: every round put
      // into a body that something else finishes first would still be owed a
      // blast, so a crowded wave would end in a minute of unattributable
      // explosions. What is fired into a dying enemy is spent, exactly as it is
      // for a shot that overkills one.
      //
      // TESTED HERE rather than hooked into the kill sweep, because `dead` is
      // set the instant the killing blow lands (Enemy.takeDamage) whatever
      // dealt it - a bullet, a blast, a poison tick, a turret, another fuse -
      // and this sweep runs before the roster is compacted, so no death can be
      // missed and none of them needs a line of its own.
      if (f.en && f.en.dead) {
        this._fuses.splice(i, 1);
        this.effects.pipRelease(f.pip);
        // A small puff where the dot was, so a round that is lost is SEEN to be
        // lost. Without it the dots on a body that just died simply blink out,
        // which reads as the marker being buggy rather than as the round being
        // spent.
        this.effects.impact(this._pipAt(f), THEME_FUSE, 5, 2.5, 1.4, 0.22);
        continue;
      }
      // The dot rides the body. Read every frame rather than at the impact: a
      // fuse in a chaser that walks ten metres has to go off on the chaser, and
      // the marker has to be on it the whole way there. The point stuck on the
      // fuse at `_stick` is only ever the fallback for the one frame a death is
      // being handled in, above.
      if (f.en) {
        f.x = f.en.pos.x;
        f.y = f.en.pos.y;
        f.z = f.en.pos.z;
      }
      if (this.time >= f.at) {
        this._fuses.splice(i, 1);
        this.effects.pipRelease(f.pip);
        this._fuseAt.set(f.x, f.y + f.h, f.z);
        this._blast(this._fuseAt, f.dmg, f.radius, null, false);
        this.effects.burst(this._fuseAt, THEME_FUSE, 14, 5, 2.4, 0.35);
        this.effects.addShake(0.04);
        this.sfx.fuseBlast();
        continue;
      }
      if (!soon || f.at < soon.at) soon = f;
      // ---- THE COUNTDOWN, DRAWN ------------------------------------------
      //
      // A round that sticks and does nothing for two seconds is the only shot
      // in the game that lands with no feedback at all, and without this it
      // reads as a broken gun rather than as a fuse. The dot says WHERE and the
      // blink rate says WHEN, and neither needs a number.
      //
      // The rate ACCELERATES - three blinks a second when the round lands,
      // twelve as it goes off - because that is the one cadence everybody
      // already reads as "about to happen", and it works out of the corner of
      // an eye in a way a shrinking bar or a fading colour does not.
      if (f.pip < 0) continue;
      const phase = (this._fuseSpan(f) * this._fuseRate(f)) % 1;
      const p = this._fuseProgress(f);
      // ON for the front of each period and OFF for the rest, rather than a
      // sine: a dot that fades is a dot that is dim half the time, and what is
      // being communicated is a COUNT. The lit fraction grows with the rate, so
      // the dot is nearly solid by the end - which is what stops the fastest
      // part of the countdown from reading as a flicker.
      const on = phase < 0.35 + 0.35 * p;
      // It GROWS as it counts down, as well as blinking faster. The dot is
      // small on purpose - it sits on a body the player is also trying to shoot
      // - and at range a half-metre sprite against a lit enemy is close to the
      // limit of what reads at all, so the last half second is given the size
      // as well as the rate. Additive, so the core saturates to white over any
      // body colour the theme happens to be wearing; the tint is only ever the
      // halo, which is what keeps it visible on the red themes.
      this._pipAt(f);
      this.effects.pipSet(
        f.pip, this._fuseAt.x, this._fuseAt.y, this._fuseAt.z,
        THEME_FUSE, on ? 1 : 0, PIP_SIZE + PIP_GROW * p
      );
    }
    // ---- AND HEARD --------------------------------------------------------
    //
    // ONE COUNTDOWN, however many rounds are stuck. A held trigger keeps a
    // dozen fuses running at once, each blinking on its own clock, and a blip
    // per blink is a swarm of wasps rather than a count - so the ear gets the
    // SOONEST fuse and nothing else. That is also the one the player needs:
    // it is the next thing that is going to happen.
    //
    // The fuse is identified by its deadline, so a new soonest fuse restarts
    // the count rather than inheriting the last one's blink index - which would
    // swallow the first tick of the round that just became urgent.
    if (!soon) {
      this._fuseBeepAt = 0;
      return;
    }
    const n = Math.floor(this._fuseSpan(soon) * this._fuseRate(soon));
    if (soon.at !== this._fuseBeepAt || n !== this._fuseBeepN) {
      this._fuseBeepAt = soon.at;
      this._fuseBeepN = n;
      this.sfx.fuseTick(this._fuseProgress(soon));
    }
  }

  /**
   * WHERE THE DOT IS DRAWN, into `_fuseAt`.
   *
   * The fuse itself lives at a point on the body's centre line, which is INSIDE
   * the model - and a sprite still depth-tests even with `depthWrite` off, so
   * drawn there it is simply behind the enemy and never seen. It is pulled
   * toward the camera by a body radius so it sits on the near surface, facing
   * whichever way the player happens to be standing.
   *
   * The depth test is deliberately KEPT: a fuse behind a pillar must not glow
   * through it, or the dot stops being a thing in the world and becomes a HUD
   * element that happens to be drawn in 3D - and a player would start reading
   * it as a wallhack the pick never promised.
   */
  _pipAt(f) {
    const v = this._fuseAt.set(f.x, f.y + f.h, f.z);
    const c = this.camera.position;
    const dx = c.x - v.x;
    const dy = c.y - v.y;
    const dz = c.z - v.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    // A body radius, plus a little. The enemy's own radius rather than a
    // constant, because a colossus is three times a chaser and a dot floating a
    // chaser's width off its chest would be nowhere near the surface.
    const out = ((f.en && !f.en.dead ? f.en.radius : 0.5) + 0.15) / d;
    v.set(v.x + dx * out, v.y + dy * out, v.z + dz * out);
    return v;
  }

  // A fuse's three derived numbers, in one place so the dot and the tick can
  // never disagree about where in its life a round is. `span` is time SINCE the
  // round stuck, counted back from the deadline rather than forward from the
  // impact, so every blink lands a fixed distance from the detonation and the
  // last one is always the last one.
  _fuseProgress(f) {
    return Math.min(1, Math.max(0, 1 - (f.at - this.time) / f.delay));
  }
  _fuseRate(f) {
    return FUSE_BLINK_MIN + (FUSE_BLINK_MAX - FUSE_BLINK_MIN) * this._fuseProgress(f);
  }
  _fuseSpan(f) {
    return f.delay - (f.at - this.time);
  }

  // OVERKILL. What a killing blow was worth beyond the body it killed, handed
  // to the nearest thing still standing inside overkillRange.
  //
  // ONE HOP, NEVER A CHAIN. The carried damage goes through hurtEnemy() rather
  // than back through the pellet path, so a body it also kills carries nothing
  // onward - otherwise a single rifle round into a packed wave would walk the
  // whole room, which is ARC ROUNDS' job and at a fraction of this strength.
  _carryOver(from, spill) {
    if (!(spill > 0)) return;
    const r2 = this.player.mods.overkillRange * this.player.mods.overkillRange;
    let best = null;
    let bestD = r2;
    for (const e of this.enemies) {
      if (e.dead || e === from) continue;
      const dx = e.pos.x - from.pos.x;
      const dz = e.pos.z - from.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD) { bestD = d2; best = e; }
    }
    if (!best) return;
    this.hurtEnemy(best, spill);
    this.effects.tracer(from.pos, best.pos);
    this.effects.impact(best.pos, THEME_OVERKILL, 8, 3.5, 2, 0.3);
  }

  /**
   * FEAR AURA. Five metres of personal space, enforced.
   *
   * THE LOCKOUT IS PER BODY AND IT IS THE WHOLE ITEM. Without it an enemy runs
   * for five seconds, walks back in, and is made to run again - forever - which
   * is not a passive item, it is a wall the player carries around with them.
   * Thirty seconds means each enemy in a wave is pushed off the player roughly
   * once, and the second time it arrives it stays.
   *
   * `fearAuraAt` is a field on the ENEMY and dies with it, so a fresh spawn is
   * never inside someone else's cooldown.
   */
  _fearAura() {
    const m = this.player.mods;
    const r2 = m.fearAura * m.fearAura;
    const p = this.player.pos;
    let any = false;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (this.time - e.fearAuraAt < m.fearAuraCd) continue;
      const dx = e.pos.x - p.x;
      const dz = e.pos.z - p.z;
      if (dx * dx + dz * dz > r2) continue;
      e.fearAuraAt = this.time;
      e.applyStatus('fear', m.fearAuraTime);
      this.effects.impact(e.pos, THEME_FEAR, 10, 4, 2, 0.35);
      any = true;
    }
    // The ring is drawn only when the aura actually CAUGHT something. On a
    // quarter-second clock an unconditional shockwave would be four rings a
    // second for the whole run, which is a permanent effect standing in for an
    // occasional one - and the pool it comes out of is four deep and shared.
    if (any) this.effects.shockwave(p, THEME_FEAR, m.fearAura, 0.35);
  }

  /**
   * STATUS CONDUIT. Whatever is on the player is on the room.
   *
   * FOUR OF THE SIX PLAYER STATUSES HAVE AN ENEMY OPPOSITE and two do not:
   * WEAKNESS and CURSE are both about what the PLAYER'S numbers do and there is
   * nothing on an enemy for them to be. They are simply not in the table, which
   * is the honest answer - the card says "such as burn, poison, freeze", and
   * inventing an enemy-side curse to make the sentence come out even would be a
   * second mechanic nobody asked for.
   *
   * The two damage-over-time effects are handed the player's OWN shot as their
   * per-tick strength, exactly as VENOM and INCENDIARY are (see Player.dotHit),
   * so a conduit build's burn is worth what the build's gun is worth.
   */
  _conduit() {
    const m = this.player.mods;
    const r2 = m.conduit * m.conduit;
    const p = this.player.pos;
    const hit = this.player.dotHit;
    let any = false;
    for (const [mine, theirs] of CONDUIT_MAP) {
      const t = this.player.status[mine];
      if (!(t > 0)) continue;
      any = true;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - p.x;
        const dz = e.pos.z - p.z;
        if (dx * dx + dz * dz > r2) continue;
        // The remaining time on the PLAYER, so an effect that is nearly over
        // spreads as an effect that is nearly over. Capped at the tick rate's
        // own second so a refresh cannot stack into a permanent status.
        e.applyStatus(theirs, Math.min(t, CONDUIT_TICK * 2), hit);
      }
    }
    if (any) this.effects.shockwave(p, THEME_CONDUIT, m.conduit, 0.3);
  }

  /**
   * PANIC TURRET. LITTLE BROTHER's gun, thrown by being hit.
   *
   * IT IS THE ITEM'S OWN TURRET, unchanged - same class, same one-of-the-
   * player's-shots per round, same beat. What differs is that it is PLACED
   * rather than thrown (the player is being shot at, and a lob that landed
   * across the room would be a turret they did not choose the position of) and
   * that it lives ten seconds instead of fifteen.
   *
   * ITS OWN CAP, counted over the deployed list rather than kept as a number:
   * a turret can be retired by MAX_DEPLOYED's eviction or by its own clock, and
   * a counter would have to be decremented in both places. Five at once.
   */
  _panicTurret() {
    const m = this.player.mods;
    let live = 0;
    for (const d of this._deployed) if (d.panic && !d.dead) live++;
    if (live >= m.panicMax) return;
    const p = this.player.pos;
    // Beside the player rather than under them, so the thing they can see
    // arriving is not inside their own feet. A metre and a half, in a random
    // direction, which is close enough to be cover and far enough to be a gun.
    const a = Math.random() * Math.PI * 2;
    const t = new Turret(
      this, p.x + Math.cos(a) * 1.5, p.z + Math.sin(a) * 1.5,
      this.player.getEffectiveDamage(this.player.weapon.damage)
    );
    t.panic = true;
    t.life = m.panicLife;
    this.deploy(t);
    this.sfx.itemDeploy();
  }

  /**
   * SHARED PAIN. One blow, split evenly over everything alive.
   *
   * Called from inside Enemy.takeDamage with the hook up (see setShareHook
   * there), which is why it does not need to know what dealt the damage: every
   * bullet, blast, poison tick, turret round and reflected hit in the game
   * already funnels through that one method.
   *
   * THE SLICE GOES THROUGH takeDamage LIKE ANY OTHER HIT, so each body's own
   * armour, ward, freeze vulnerability and mark still apply to its share. Ten
   * enemies taking five each is ten ordinary five-point hits, not one fifty
   * split by fiat - which is what makes the pick read correctly against every
   * defensive mechanic the roster has.
   */
  _sharePain(d, silent) {
    let n = 0;
    for (const e of this.enemies) if (!e.dead) n++;
    if (n <= 0) return;
    const slice = d / n;
    for (const e of this.enemies) {
      if (!e.dead) e.takeDamage(slice, silent);
    }
  }

  // Reactive Plating. Detonates around the player when they are hit; damage
  // and radius both come from the mods so extra stacks widen it.
  // THORNS. Half of what an attacker just dealt goes straight back into it.
  //
  // `source` is the enemy where the hit came from a body or a swing; a
  // projectile has no owner by the time it lands, so the nearest enemy to the
  // impact takes it instead. That is not a compromise - the thing that shot
  // you is usually the thing standing closest to where the round hit you, and
  // a passive item that silently did nothing against half the roster would
  // read as broken long before anyone worked out why.
  _thorns(d, pos, source) {
    const frac = this.player.mods.thorns;
    if (frac <= 0 || d <= 0) return;
    let target = source && !source.dead ? source : null;
    if (!target && pos) {
      let bestD = 36;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dd = e.pos.distanceToSquared(pos);
        if (dd < bestD) {
          bestD = dd;
          target = e;
        }
      }
    }
    if (!target) return;
    target.takeDamage(d * frac);
    this.effects.burst(target.pos, 0xd84315, 8, 3, 1.6, 0.35);
  }

  _shockwave() {
    const mods = this.player.mods;
    if (mods.shockwave <= 0) return;
    const r = mods.shockwaveRadius;
    for (const e of this.enemies) {
      if (e.pos.distanceTo(this.player.pos) > r) continue;
      e.takeDamage(mods.shockwave);
      // Heavy things take the damage but do not budge - see `immovable` in
      // enemy.js. A boss knocked out of its own charge would not be a fight.
      if (e.immovable) continue;
      e.pos.add(
        this._knockback.subVectors(e.pos, this.player.pos).setY(0).normalize().multiplyScalar(2.5)
      );
    }
    this.effects.burst(this.player.eyeInto(this._killPos), 0x4ef3ff, 26, 8, 2.5, 0.6);
    this.effects.addShake(0.12);
  }

  // Arc Rounds. Jumps a fraction of a hit to one more enemy, and exactly one:
  // a chain that could chain again would clear a whole wave from a single
  // pellet, and the tracer would stop reading as a discrete arc.
  _chain(from, dmg, range) {
    let best = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (e === from || e.dead) continue;
      const d = e.pos.distanceTo(from.pos);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (!best) return;
    best.takeDamage(
      dmg, false, best.pos.x - from.pos.x, best.pos.z - from.pos.z
    );
    this.effects.tracer(
      this._chainFrom.set(from.pos.x, 1.0, from.pos.z),
      this._chainTo.set(best.pos.x, 1.0, best.pos.z)
    );
    this.effects.burst(this._chainTo, 0x9ff3ff, 6, 3, 1.5, 0.3);
  }

  // Lightning Wizard. A bolt out of the sky onto the enemy that was hit: the
  // full damage to them, and a smaller share to everything standing around
  // them, so it is worth firing into the middle of a crowd rather than at its
  // edge.
  //
  // The splash goes through _blast with the struck enemy skipped, because
  // _blast already owns radial falloff and the enemy list, and a second copy
  // of that arithmetic here would be one more place for the two to disagree.
  // It cannot hurt the player: the bolt is the player's, and a passive item
  // that rolled itself 5% of the time and occasionally killed you would be a
  // curse.
  _lightning(en) {
    const m = this.player.mods;
    this._boltAt.set(en.pos.x, 0, en.pos.z);
    // The direct hit first. A warden's dome can eat it, exactly like a bullet.
    en.takeDamage(m.lightningDamage);
    this._blast(this._boltAt, m.lightningSplash, m.lightningRadius, en, false);
    this.effects.lightning(en.pos.x, en.pos.z, m.lightningRadius);
  }

  // OVERLOAD. Every enemy in the arena loses a fifth of its MAXIMUM health the
  // moment the magazine runs dry.
  //
  // A fraction rather than a flat number, and read off maxHp rather than off
  // what is left, so one bar's worth is one bar's worth whether the target is
  // a wave-4 chaser or a wave-40 boss - it is the only thing in the pool that
  // scales with the enemy instead of with the build. It cannot finish anything
  // on its own for the same reason it cannot be farmed: the damage is fixed
  // and the trigger costs a whole magazine.
  _overload() {
    const frac = this.player.mods.overloadFrac;
    let struck = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.takeDamage(e.maxHp * frac);
      struck++;
      // The visual is capped: a wave with thirty enemies in it would otherwise
      // spend the whole particle budget on one keypress.
      if (struck <= 10) this.effects.lightning(e.pos.x, e.pos.z, 2.5);
    }
    if (!struck) return;
    this.effects.addShake(0.3);
  }

  // Knockout Drops. Shoves an enemy along the shot.
  //
  // A MOVE, NOT A TELEPORT, and it is the melee swing's own knockback - see
  // Enemy.knock and the note at the swing in _melee. This used to add the
  // whole distance to the position on the frame of the hit, which read as the
  // body blinking to a new spot rather than as being hit by anything, and it
  // is the one thing every shove in the game shares: TECTONIC hurling a crowd
  // and BONESAW clipping a body now travel the same way a punch does.
  //
  // The obstacle resolve comes free with it: knock goes through the enemy's
  // own movement step, which already resolves out of cover, so a body thrown
  // into a pillar stops at the pillar instead of ending up inside it.
  //
  // THE TIME IS READ OFF THE DISTANCE so the SPEED is the constant. Melee's
  // three metres in 0.18s is 16.7 m/s, and everything here travels at about
  // that: a nine-metre hurl takes half a second and a two-metre nudge takes a
  // tenth, which is what makes a big shove read as big rather than as fast.
  _shove(en, dir, dist) {
    if (en.immovable) return;
    this._knockback.set(dir.x, 0, dir.z);
    en.knock(this._knockback.x, this._knockback.z, dist,
      Math.max(0.1, Math.min(0.55, dist / 18)));
  }

  // Gravity Rounds. Drags everything around the impact toward it, the pull
  // fading to nothing at the edge of the radius so an enemy at 5m twitches and
  // one at arm's length is yanked. `skip` is the enemy that took the shot: it
  // is already at the impact point, and pulling it into itself jitters it.
  //
  // `time` IS WHAT SEPARATES THE TWO CALLERS. The singularity pulls a little
  // every frame, so its motion is already continuous and it wants the distance
  // applied now (time 0); Gravity Rounds pulls a metre and a half ONCE per
  // hit, and applied on the frame of the shot that is a body teleporting
  // inward. Given a time it goes through Enemy.knock instead - the same travel
  // _shove and the melee swing use - so the crowd is visibly dragged together
  // rather than found already gathered.
  _pull(point, radius, dist, skip, time = 0) {
    for (const e of this.enemies) {
      if (e === skip || e.dead || e.immovable) continue;
      const d = e.pos.distanceTo(point);
      if (d > radius || d < 0.001) continue;
      this._pullTo.set(point.x - e.pos.x, 0, point.z - e.pos.z).normalize();
      // Never past the point itself: an enemy at arm's length is pulled to the
      // impact and no further, whichever path it travels.
      const step = Math.min(dist * (1 - d / radius), d);
      if (time > 0) {
        e.knock(this._pullTo.x, this._pullTo.z, step, time);
        continue;
      }
      e.pos.addScaledVector(this._pullTo, step);
      resolveCircle(e.pos, e.radius, this.arena.obstacles, e.collideH);
    }
    this.effects.burst(point, 0x536dfe, 10, 3, 1.5, 0.35);
  }

  // Radial damage with linear falloff, shared by Detonator and Blast Corpse.
  // `skip` is the enemy that is already taking the hit directly, and
  // `hitPlayer` is what separates the two: your own impact blasts cannot hurt
  // you, but a corpse going off in your face is the whole cost of the pick.
  _blast(point, dmg, radius, skip, hitPlayer) {
    for (const e of this.enemies) {
      if (e === skip || e.dead) continue;
      const d = e.pos.distanceTo(point);
      if (d > radius) continue;
      e.takeDamage(dmg * (1 - d / radius));
    }
    if (hitPlayer) {
      const d = this.player.eyeInto(this._killPos).distanceTo(point);
      if (d < radius) this._hurtPlayer(dmg * (1 - d / radius), point);
    }
    this.effects.shockwave(point, 0xff7a18, radius);
    this.effects.burst(point, 0xff7a18, 18, 6, 2, 0.5);
    this.effects.addShake(0.1);
  }

  // Seeker's rescue. Finds the enemy closest to the line of fire inside the
  // cone, confirms it is actually visible, and lands the shot on it with a
  // curved tracer.
  //
  // The curve is not decoration. Without it a player whose crosshair was off
  // would watch a miss register as a hit with nothing to explain it; the bend
  // is the game saying what it did, which is the whole reason this shape was
  // chosen over silently widening the hitbox.
  //
  // A homed shot hits exactly ONE enemy and stops. It never carries on through
  // a pierce chain: re-homing at every step would let a single round walk
  // itself through an entire wave.
  //
  // Candidates are tried nearest-to-aim first and skipped when something is in
  // the way, rather than giving up on the first blocked one - the enemy
  // closest to your crosshair being behind a pillar should not stop the round
  // finding the one standing beside it in the open.
  /**
   * THE HOMING CONE IN FORCE RIGHT NOW, in radians of half-angle. Seeker sets
   * it permanently; BIRD DOG sets it for five seconds.
   *
   * THE WIDER OF THE TWO WINS, they do not add. A player who owns Seeker gets
   * nothing from the item, which is the honest behaviour: two cones summed
   * would let one press turn a passive item the game balances at three tiers
   * into something that hits everything behind the player.
   *
   * BIRD DOG's own figure is Seeker at full rank (see upgrades.js: 0.105 per
   * tier, three tiers), so the item shows the passive item at its best rather
   * than at some fourth number nobody can compare it to.
   */
  _homingAngle() {
    return Math.max(this.player.mods.homingAngle, this.player.itemHoming ? 0.315 : 0);
  }

  _homingRange() {
    return Math.max(this.player.mods.homingRange, this.player.itemHoming ? 30 : 0);
  }

  _homeShot(ray, muzzle, w, dmgMult, burst, crit = false) {
    const m = this.player.mods;
    const origin = ray.ray.origin;
    const aim = ray.ray.direction;
    const skip = this._homeSkip;
    const minDot = Math.cos(this._homingAngle());
    let landed = false;

    for (let attempt = 0; attempt < 3 && !landed; attempt++) {
      let best = null;
      let bestDot = minDot;
      for (const e of this.enemies) {
        if (e.dead || skip.includes(e)) continue;
        // The hitbox rather than e.pos: aiming at an enemy's feet would push
        // every candidate below the line of fire and make the cone read as
        // being lower than it is.
        e.hitbox.getWorldPosition(this._homeAt);
        const v = this._homeDir.subVectors(this._homeAt, origin);
        const d = v.length();
        if (d > this._homingRange() || d < 0.001) continue;
        v.multiplyScalar(1 / d);
        const dot = v.dot(aim);
        if (dot <= bestDot) continue;
        bestDot = dot;
        best = e;
      }
      if (!best) break;

      // Line of sight, cast from the same origin the shot used so what the
      // round can reach is exactly what the player can see.
      best.hitbox.getWorldPosition(this._homeAt);
      this._homeDir.subVectors(this._homeAt, origin).normalize();
      this._homeRay.set(origin, this._homeDir);
      const hits = this._homeHits;
      hits.length = 0;
      this._homeRay.intersectObjects(this._targets, false, hits);
      if (hits.length && hits[0].object.userData.enemy === best) {
        const hot = this._resolveHit(best, crit);
        const dealt = this.player.getEffectiveDamage(w.damage * m.volleyDamage)
          * dmgMult * this._hitMult(best, hot);
        this._landShot(best, hits[0].point, this._homeDir, dealt, burst, hot);
        this._lastImpact.copy(hits[0].point);
        this.effects.arc(muzzle, hits[0].point, aim);
        // A second burst in Seeker's own colour on top of the ordinary hit
        // spray. The curve is a one-pixel line and can be missed in a crowd;
        // this makes a rescued shot read differently from one the player
        // actually landed, which is the whole point of showing the mechanic.
        this.effects.burst(hits[0].point, 0xff5fd2, 8, 3, 1.5, 0.35);
        landed = true;
      } else {
        skip.push(best);
      }
      hits.length = 0;
    }

    skip.length = 0;
    return landed;
  }

  /**
   * DOES THIS PARTICULAR PELLET, ON THIS PARTICULAR BODY, CRIT?
   *
   * THE ONE PLACE THE WHOLE CRIT FAMILY MEETS, and it exists because four of
   * the six passive items in that family ask a question the TRIGGER cannot
   * answer. rollCrit() is a die, rolled once per trigger pull beside Cursed
   * Ammo and Devil's Gamble, and it always was - but ASSASSIN wants to know
   * whether this body has ever been hit and TELLTALE wants to know how many
   * times, and at the moment the trigger is pulled there is no body yet. So the
   * roll comes in as `rolled` and the ANSWER is decided here, where there is
   * one.
   *
   * ONCE PER TRIGGER PULL PER ENEMY, NEVER PER PELLET. `_shotHits` is the
   * per-shot dedup set _landShot already keeps for exactly this class of
   * effect, and the cached answer is what a scattergun needs: nine pellets into
   * one chest is ONE hit as far as Telltale's count is concerned, and all nine
   * of them crit or none of them do. Without the cache a shotgun would tick the
   * tally eight times a shell and Telltale would read as a permanent crit.
   *
   * THE MULTIPLIER IS NOT APPLIED HERE. This returns a boolean; the caller
   * folds mods.critMult in beside the range multiplier, so DEAD CENTER's 3x and
   * SWEET SPOT's window compose with everything else rather than any of them
   * being a special case. See _hitMult.
   *
   * @param {Enemy} en
   * @param {boolean} rolled  what rollCrit() said for this trigger pull
   * @param {boolean} [fromShot]  whether this hit is a ROUND out of the
   *   magazine. False for the melee swing and for LANCE, which are the two
   *   ways to land a hit without pulling the trigger - and FATAL RESERVE is
   *   about the magazine, so a butt-stroke thrown while the gun happens to be
   *   nearly empty is not one of its five rounds. Everything else here is a
   *   question about the BODY and applies whatever landed on it.
   */
  _resolveHit(en, rolled, fromShot = true) {
    const cached = this._shotCrit.get(en);
    if (cached !== undefined) return cached;
    const m = this.player.mods;
    // SWEET SPOT, first, because it is unconditional: an item window is the
    // player having spent a charge, and nothing in a build should be able to
    // argue with it. It sits on top of a DEAD CENTER run's halved chance rather
    // than replacing it, which is why it is a deadline on the player and not a
    // write into `mods` - see itemCrit in js/items.js.
    let crit = rolled || this.time < this.player.itemCritEnd;
    // FATAL RESERVE. The bottom of the magazine, read off the count the
    // TRIGGER saw rather than off the live one: `mag` has already been billed
    // by the time a pellet lands, and by a cost that is three rounds under
    // TRIPLE TAP and none at all under OPENING SALVO, so the live number
    // cannot answer "was this one of the last five" for every build. See
    // Player.magAtShot.
    if (fromShot && m.fatalReserve > 0 && this.player.magAtShot <= m.fatalReserve) {
      crit = true;
    }
    // ASSASSIN. The first hit this body has ever taken, and there is no second
    // first: `everHit` is set below and dies with the enemy.
    if (m.assassin > 0 && !en.everHit) crit = true;
    // TELLTALE. Counted whether or not the hit was already going to crit, so
    // the rhythm stays a rhythm - a lucky roll on the second hit must not push
    // the guaranteed one out to the fourth.
    if (m.telltale > 0) {
      en.hitTally++;
      if (en.hitTally % m.telltale === 0) crit = true;
    }
    en.everHit = true;
    // WEAK POINT. Its own tally, not TELLTALE's - see the note beside
    // markTally in enemy.js - and once a body is marked it stays marked for
    // the rest of its life, so this stops counting the moment it lands.
    if (m.markHits > 0 && !en.marked) {
      en.markTally++;
      if (en.markTally >= m.markHits) {
        en.marked = true;
        this.effects.shockwave(en.pos, THEME_MARK, Math.max(1.2, en.radius * 2.4), 0.3);
        this.effects.burst(en.pos, THEME_MARK, 12, 4, 2, 0.35);
      }
    }
    // CRITICAL OVERFLOW asks one question about the whole trigger pull - did
    // this shot crit - and a crit is only ever resolved against a BODY, so the
    // answer is collected here and settled once in shoot().
    if (crit) this._shotWasCrit = true;
    this._shotCrit.set(en, crit);
    return crit;
  }

  /**
   * Everything that scales a landed hit by WHO and WHERE it landed on: the crit
   * multiplier, and the two range passive items.
   *
   * IT IS A MULTIPLIER AND NOT A DAMAGE FIGURE because the callers already hold
   * one. Three shot paths compute `dealt` their own way - the pellet with its
   * pierce falloff, Seeker's homed round without it, and LANCE with its own
   * multiple - and each of them folds this in at the end. What must not happen
   * is a fourth copy of the crit arithmetic.
   *
   * @param {Enemy} en
   * @param {boolean} crit  the answer _resolveHit already gave
   */
  _hitMult(en, crit) {
    const m = this.player.mods;
    let k = crit ? m.critMult : 1;
    if (m.longshot > 0 || m.pointBlank > 0) {
      const p = this.player.pos;
      // ON THE FLOOR, like every other distance in this game. A flier five
      // metres up is not "further away" for the purpose of a range bonus - the
      // player is being asked to stand somewhere, and where they stand is an
      // XZ position.
      const d = Math.hypot(en.pos.x - p.x, en.pos.z - p.z);
      // LONGSHOT ramps the whole way rather than switching on at a threshold.
      // A cliff the player cannot see would show up as the damage number
      // jumping as they backed over an invisible line; a ramp is continuous, so
      // a player who never read the card still learns that backing off pays.
      if (m.longshot > 0) k *= 1 + m.longshot * Math.min(1, d / LONGSHOT_RANGE);
      // POINT BLANK is the hard edge, on purpose - it is a LINE the player
      // either stepped over or did not, and five metres is the distance every
      // melee reach in the game has already taught them.
      if (m.pointBlank > 0 && d <= POINT_BLANK_RANGE) k *= 1 + m.pointBlank;
    }
    return k;
  }

  // Everything one pellet does to the enemy it landed on.
  //
  // Shared by the straight shot and by Seeker's homed shot, so the two cannot
  // drift: status, chaining, knockback and Detonator have to behave the same
  // whether the player's aim was on target or the round curved onto it.
  // `dir` is the direction the shot ARRIVED from, which is what armour reads.
  _landShot(en, point, dir, dealt, burst, crit = false) {
    const m = this.player.mods;
    // A warded enemy eats the shot whole (see Enemy.takeDamage). It gets the
    // stone-grey spark rather than the ordinary yellow one, so a player
    // emptying a magazine into a group under a warden's dome is told why
    // nothing is dying by the hits themselves, not just by the health bar.
    if (en.wardT > 0) {
      this.effects.impact(point, 0xc9d2dd, burst, 2.5, 1.2, 0.26);
      return;
    }
    // DELAYED FUSE. The round STICKS: no damage now, and in two seconds
    // whatever it was worth goes off over a small area at wherever the body has
    // got to. Everything below this line still happens on contact - the status,
    // the chain, the shove - because those are what the ROUND does, and the
    // pick only ever moved when the damage lands.
    if (m.fuseDelay > 0) {
      this._stick(en, dealt, point);
    } else {
      // `point` is handed on so a placed shield - the Bulwark's buckler - can
      // test where on the body the pellet actually landed, not just which way
      // it was travelling.
      //
      // OVERKILL reads the health the body had BEFORE the blow, because
      // takeDamage keeps no remainder: the pellet is worth what it is worth,
      // and what did not fit is what walks to the next body.
      const before = en.hp;
      en.takeDamage(dealt, false, dir.x, dir.z, point, crit);
      if (m.overkill > 0 && en.dead && dealt > before) {
        this._carryOver(en, dealt - before);
      }
    }
    // NO PARTICLES ON A HIT. A shot landing on an enemy is already the most
    // confirmed event in the game - the hitmarker, the body's flash and the
    // health bar all say so - and a spray on top of that was three signals for
    // one hit, firing per PELLET, which is what made a shotgun at close range
    // a wall of sparks. The floor and the walls keep theirs, because a miss
    // has no other feedback at all.
    // Damage is per-pellet; everything below is per-shot.
    if (this._shotHits.has(en)) return;
    this._shotHits.add(en);
    // Malady scales the two statuses that HAVE a strength. Cryo, Terror
    // and Petrify are left alone: shortening them buys nothing back.
    if (m.poisonTime) {
      en.applyStatus('poison', m.poisonTime * m.dotTime, this.player.dotHit * m.poisonPower * m.dotPower);
    }
    if (m.burnTime) {
      en.applyStatus('burn', m.burnTime * m.dotTime, this.player.dotHit * m.burnPower * m.dotPower);
    }
    if (m.slowTime) en.applyStatus('slow', m.slowTime);
    if (m.fearTime) en.applyStatus('fear', m.fearTime);
    if (m.petrifyChance && Math.random() < m.petrifyChance) {
      en.applyStatus('freeze', m.petrifyTime);
    }
    if (m.lightningChance && Math.random() < m.lightningChance) {
      this._lightning(en);
    }
    // FOUR HUMOURS. Sits with the passive item statuses because it IS one of
    // them, four at a time - and it advances here, in the per-SHOT half of
    // _landShot (below the _shotHits guard), so one trigger pull is one
    // element however many pellets were in it. The same rule Hot Streak and
    // Devil's Gamble follow.
    if (this.player.elementCycle >= 0) {
      const h = HUMOURS[this.player.elementCycle % HUMOURS.length];
      this.player.elementCycle++;
      if (h.status === 'arc') this._chain(en, dealt * 0.6, 7);
      else en.applyStatus(h.status, h.dur, h.power);
      // The colour is the whole readout: the player has to be able to tell
      // which of the four this round was, and there is nowhere on the HUD to
      // print it.
      this.effects.impact(point, h.color, 8, 4, 2, 0.3);
    }
    if (m.chainDamage) this._chain(en, dealt * m.chainDamage, m.chainRange);
    if (m.knockback) this._shove(en, dir, m.knockback);
    if (m.gravityPull) this._pull(point, m.gravityRadius, m.gravityPull, en, 0.18);
    // Detonator goes off once per trigger pull, at the first enemy the
    // shot touched. Per-pellet it would fire eight blasts from one shell
    // and exhaust the four-ring pool on its own.
    if (m.blastDamage && !this._blastHit) {
      this._blastHit = true;
      this._blastAt.copy(point);
    }
  }

  /**
   * THE CONE THE GUN IS FIRING THROUGH RIGHT NOW, in NDC.
   *
   * One function, read by the raycast and by the crosshair, which is what
   * makes the reticle a readout rather than a decoration: the gap between its
   * arms is the spread, so a player watching it open as they start running is
   * watching the actual number the next shot will be drawn from.
   *
   * Three things move it: which pose the gun is in (the whole point of
   * aiming), whether the player is moving, and nothing else. Moving costs
   * accuracy from either pose - a player running with the gun up is still
   * running - but it costs a quarter as much down the sights.
   */
  _shotSpread() {
    const w = this.player.weapon;
    const a = this.player.aimT;
    // Live speed as a fraction of a full sprint. Clamped, because a dash is
    // four times sprint speed and the cone should be pinned wide open through
    // one rather than scaled to something absurd.
    const speed = Math.min(1, this.player.speedXZ / MAX_SPEED);
    // A weapon with no aimed cone of its own is one that gains nothing from
    // being raised, rather than one that throws on the first shot.
    const aimed = w.aimSpread != null ? w.aimSpread : w.spread;
    const cone = w.spread + (aimed - w.spread) * a;
    // Both penalties are cut by the same factor when the gun is up, so a
    // player who raises it during the sprint's tail gets the steadier weapon
    // they asked for rather than one still carrying the run.
    const moving = MOVE_SPREAD * speed + SPRINT_SPREAD * this.player.sprintFade;
    // AND THE HELD TRIGGER, which is the one penalty here the player is
    // spending rather than wearing: it is bought a round at a time and it is
    // given back the moment they stop. Hair Trigger's bloomMult widens it -
    // the cost of a doubled rate is a gun that goes to pieces faster - and its
    // spreadAdd is outside the aim cut because a flat handling penalty is not
    // something raising the weapon can talk its way out of.
    const m = this.player.mods;
    const bloom = BLOOM_SPREAD * this.player.bloom * m.bloomMult;
    return cone
      + moving * (1 + (MOVE_SPREAD_AIM - 1) * a)
      + bloom * (1 + (BLOOM_AIM - 1) * a)
      + m.spreadAdd;
  }

  // One pellet of a shot. Walks the sorted hit list so a piercing weapon can
  // pass through several enemies, stopping at the first thing that is not one.
  // Returns true if it damaged anything, so the caller can play a single hit
  // sound per shot rather than one per pellet.
  _firePellet(muzzle, targets, spread, w, dmgMult = 1, crit = false) {
    const m = this.player.mods;
    const ray = this._shotRay;
    this._screen.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
    ray.setFromCamera(this._screen, this.camera);

    const hits = this._hits;
    hits.length = 0;
    ray.intersectObjects(targets, false, hits);

    // Multi-pellet weapons fire eight of these per shot, so their per-impact
    // particle bursts have to be much smaller or a single shell drains the
    // whole pool. Both numbers are half what they were: the flecks are grit
    // thrown off the thing that was hit, and the hitmarker and the enemy's own
    // flash are what actually confirm the hit.
    const burst = w.pellets > 1 ? 2 : 5;
    // Piercing Shot adds to whatever the weapon pierces on its own, and its
    // steeper falloff replaces the weapon's - a shot that keeps full damage
    // through four enemies is worth more than any other pick in the pool.
    const pierceCap = w.pierce + m.pierce;
    const falloff = m.pierce > 0 ? Math.min(w.falloff, m.pierceFalloff) : w.falloff;
    let end = null;
    let pierced = 0;
    let damaged = false;
    // A pellet that stopped on a totem or a station was aimed there on
    // purpose. Seeker must not treat that as a miss and steal it.
    let hitProp = false;

    for (const h of hits) {
      const totem = h.object.userData.totem;
      if (totem) {
        // Anywhere on the totem claims it. The pellet stops either way - a
        // totem already claimed is a wall, not a hole to shoot enemies past.
        this._claimTotem(totem);
        hitProp = true;
        end = h.point;
        this.effects.impact(end, totem.offer ? totem.offer.theme : 0x9fb4d8,
          w.pellets > 1 ? 2 : 4, 2.5, 1.2, 0.26);
        break;
      }
      const box = h.object.userData.box;
      if (box) {
        // Same contract as a totem: the pellet stops on the box whether it
        // bought a roll, took the item or did nothing at all.
        this._useBox(false);
        hitProp = true;
        end = h.point;
        this.effects.impact(end, box.offered ? ACTIVE_ITEMS[box.offered].theme : 0xb388ff,
          w.pellets > 1 ? 2 : 4, 2.5, 1.2, 0.26);
        break;
      }
      const station = h.object.userData.station;
      if (station) {
        // The pellet stops here whether or not the purchase went through -
        // a station on cooldown is a wall, not a hole to shoot enemies past.
        this._shootStation(station);
        hitProp = true;
        end = h.point;
        this.effects.impact(end, station.color, w.pellets > 1 ? 2 : 4, 2.5, 1.2, 0.26);
        break;
      }
      const mirror = h.object.userData.enemy;
      if (mirror && !mirror.dead) {
        const refl = ENEMY_TYPES[mirror.type].reflect;
        if (refl && refl(mirror, ray.ray.direction.x, ray.ray.direction.z, h.point)) {
          // THE PLATE EATS THE PELLET AND SENDS ONE BACK. It is worn down by
          // the COUNT of rounds that land on it, so the trade is the same at
          // wave four and wave forty.
          mirror.plateHp--;
          mirror.flash = 0.12;
          this.effects.impact(h.point, 0xfff3c4, w.pellets > 1 ? 2 : 5, 3, 1.4, 0.28);
          // ONE ROUND BACK PER TRIGGER PULL, however many pellets landed. A
          // shotgun shell is eight pellets and eight of its own rounds coming
          // back would be a one-shot the player could not read as anything but
          // the game killing them - the shell still breaks the whole plate,
          // which is the trade, and it pays for one round.
          if (!this._reflected) {
            this._reflected = true;
            this._spawnProjectile(h.point.x, h.point.y, h.point.z, 'aegis', 1);
            if (this.sfx) this.sfx.impact();
          }
          hitProp = true;
          end = h.point;
          break;
        }
      }
      const bubble = h.object.userData.bubble;
      if (bubble) {
        // Popped, and the pellet stops. It stops for the same reason it stops
        // on a totem: the round went into the thing the player aimed at, and
        // letting it carry on into the enemy behind would make shooting the
        // bubble free - and the whole enemy is that it is NOT free.
        bubble.life = 0;
        this.effects.burst(h.point, projLook(bubble.type).glow, 14, 4, 2, 0.35);
        if (this.sfx) this.sfx.impact();
        hitProp = true;
        end = h.point;
        break;
      }
      const en = h.object.userData.enemy;
      if (!en) {
        // Wall, floor or crate - the pellet stops here.
        end = h.point;
        this.effects.impact(end, 0x9fb4d8, w.pellets > 1 ? 2 : 4, 2.5, 1, 0.26);
        break;
      }
      // The crit and the two range passive items are resolved HERE and not at
      // the trigger, because all three of them are questions about the body the
      // pellet just found. See _resolveHit.
      const hot = this._resolveHit(en, crit);
      const dealt = this.player.getEffectiveDamage(w.damage * m.volleyDamage)
        * Math.pow(falloff, pierced) * dmgMult * this._hitMult(en, hot);
      this._landShot(en, h.point, ray.ray.direction, dealt, burst, hot);
      damaged = true;
      pierced++;
      if (pierced > pierceCap) {
        end = h.point;
        break;
      }
    }

    hits.length = 0;

    // SEEKER. Only ever runs on a pellet that touched no enemy, which is what
    // makes the passive item purely additive: a shot already on target is
    // never moved, so it cannot drag a round off a Colossus weak point or a
    // Bulwark's flank that the player deliberately lined up.
    if (!damaged && !hitProp && this._homingAngle() > 0
      && this._homeShot(ray, muzzle, w, dmgMult, burst, crit)) {
      return true;
    }

    if (!end) end = ray.ray.at(60, this._rayEnd);
    // Breach Round detonates wherever the shot stopped - an enemy, a wall or
    // the floor - so the last impact point is kept for the caller.
    this._lastImpact.copy(end);
    this.effects.tracer(muzzle, end);
    return damaged;
  }

  // A shot. Raycast targets are built once for the whole blast and shared by
  // every pellet: arena geometry, enemy hitboxes and the totems together, so
  // the nearest hit wins whatever it is and walls correctly block shots.
  shoot() {
    const res = this.player.tryShoot(this.input.shootFresh);
    // FEAR. The gun refuses, and it has to SAY so: the chip in the HUD
    // explains why but only to a player who looks away from the fight to read
    // it. Same click and the same throttle a dry magazine gets, for the same
    // reason - a held trigger would otherwise open a voice every frame.
    if (res === 'empty' || res === 'feared') {
      // Held trigger on an empty gun would otherwise fire a WebAudio voice
      // every single frame.
      if (this.emptyClickCd <= 0) {
        this.sfx.empty();
        this.emptyClickCd = EMPTY_CLICK_COOLDOWN;
      }
      return;
    }
    if (res !== 'shot') return;

    const mods = this.player.mods;
    // CASH CANNON. The round was fired on credit inside tryShoot, which has no
    // wallet to reach for; this is where the wallet is. The coin is deliberately
    // the ORB's sound - the player already knows it as the noise money makes -
    // and it plays on the shot rather than on the balance, so a magazine bought
    // with cash sounds like one.
    if (this.player.cashOwed > 0) {
      this.credits = Math.max(0, this.credits - this.player.cashOwed);
      this.player.cashOwed = 0;
      this._creditsDirty = true;
      this.sfx.credits();
      this.sfx.coin();
      this.effects.burst(
        this.player.muzzleInto(this._killPos), 0xffd600, 8, 3.5, 1.8, 0.3
      );
      this.ui.flashReserve();
    }
    // Breach Round. The reload arms it and this shot spends it, whether or not
    // it hits anything - a wasted breach round is the cost of firing one at
    // nothing, and it re-arms on the next reload either way.
    const charged = mods.chargeDamage > 0 && this.player.breachReady;
    this.player.breachReady = false;

    // Cursed Ammo, rolled once per trigger pull. The floor is what keeps it
    // playable: a held trigger must never be able to kill you on its own.
    let dmgMult = 1;
    // CANNONADE. The first round out of a fresh magazine, and only the first:
    // `magFresh` is raised where the rounds actually arrive (the reload's last
    // frame, and CHAIN FEED's instant one) and dropped by the trigger.
    const cannon = mods.firstShot > 0 && this.player.shotWasFresh;
    if (cannon) {
      dmgMult *= mods.firstShot;
      this.effects.burst(
        this.player.muzzleInto(this._killPos), THEME_CANNON, 18, 6, 3, 0.4
      );
      this.effects.addShake(0.18);
      this.pad.rumble(0.7, 0.4, 220, 2);
    }
    if (mods.cursedChance > 0 && this.player.health > 1
      && Math.random() < mods.cursedChance) {
      this.player.health = Math.max(1, this.player.health - 1);
      dmgMult += mods.cursedDamage;
      this.effects.burst(this.player.eyeInto(this._killPos), 0x6a1b9a, 10, 4, 2, 0.35);
    }

    // THE CRIT'S DICE, rolled once per trigger pull beside the other two rolls
    // that work the same way. Per SHOT and not per pellet for the reason
    // spelled out under Devil's Gamble below.
    //
    // IT IS NOT FOLDED INTO dmgMult ANY MORE, and that is what makes the whole
    // crit family possible. A multiplier applied here is applied to a shot with
    // no target: ASSASSIN and TELLTALE both ask about the BODY, so the roll is
    // carried down to the landing site and turned into an answer there. See
    // _resolveHit, which is the only reader of this boolean.
    const crit = this.player.rollCrit();

    // DEVIL'S GAMBLE, rolled once per trigger pull and applied to every pellet
    // in it. Per SHOT and not per pellet on purpose: nine pellets each tossing
    // their own coin would average out to almost exactly nothing, and the
    // whole deal is that a shot is either a windfall or a waste.
    if (mods.gamble > 0) {
      const won = Math.random() < 0.51;
      dmgMult *= won ? 2 : 0.5;
      this.effects.burst(
        this.player.muzzleInto(this._killPos), won ? 0xffd600 : 0x5b6785, 6, 3, 1.6, 0.25
      );
    }

    const w = this.player.weapon;
    this.stats.shotsFired++;
    this.sfx.shoot();
    // Recoil, in the hands. Scaled by the same number the camera kick is, so a
    // scattergun is felt as a scattergun without the two ever disagreeing, and
    // short enough that a held trigger reads as a stutter rather than a hum.
    this.pad.rumble(0.18 + w.shake * 1.4, 0.42, 55, 1);

    const muzzle = this.player.muzzleInto(this._muzzle);
    this.effects.flash(muzzle);
    this.effects.addShake(w.shake);

    const targets = this._targets;
    targets.length = 0;
    for (const m of this.arena.meshList) targets.push(m);
    for (const e of this.enemies) targets.push(e.hitbox);
    // BRINE's angler bubble, and nothing else in the game. Added to the same
    // list the enemies are on rather than raycast separately, so a bubble
    // drifting in front of an enemy is cover for it exactly the way a crate
    // would be - which is the honest reading of a slow object in the way.
    for (const pr of this.projectiles) {
      if (pr.shootable) targets.push(pr.mesh);
    }
    this.totemArea.addTargets(targets);
    this.mysteryBox.addTargets(targets);

    const spread = this._shotSpread();
    let hitAny = false;
    this._shotHits.clear();
    // One reflection per trigger pull - see the mirror branch in _firePellet.
    this._reflected = false;
    this._shotCrit.clear();
    this._blastHit = false;
    this._shotWasCrit = false;
    // Twenty/Twenty fires the whole pellet pattern twice off one round. The
    // dedup set is NOT cleared between volleys - both barrels are one trigger
    // pull, so an enemy caught by both still takes one dose of status.
    for (let v = 0; v < mods.volley; v++) {
      for (let i = 0; i < w.pellets; i++) {
        if (this._firePellet(muzzle, targets, spread, w, dmgMult, crit)) hitAny = true;
      }
    }
    // ECHO CHAMBER. Every fourth trigger pull fires the pattern a second time
    // at half strength, off no magazine at all.
    //
    // The dedup sets are NOT cleared between the shot and its echo, exactly as
    // they are not cleared between TWENTY/TWENTY's two volleys and for the same
    // reason: this is one trigger pull, so a body caught by both still takes
    // one dose of status and sets off one DETONATOR blast.
    if (mods.echoEvery > 0 && this.player.shotTally % mods.echoEvery === 0) {
      for (let v = 0; v < mods.volley; v++) {
        for (let i = 0; i < w.pellets; i++) {
          if (this._firePellet(muzzle, targets, spread, w, dmgMult * mods.echoDamage, crit)) {
            hitAny = true;
          }
        }
      }
      this.effects.burst(muzzle, THEME_ECHO, 8, 3.5, 1.8, 0.26);
    }
    if (this._blastHit) {
      this._blast(this._blastAt, mods.blastDamage, mods.blastRadius, null, false);
    }
    // Breach Round fires wherever the shot stopped, which is why it is here and
    // not in the enemy branch: a breach round buried in a wall still goes off.
    if (charged) {
      this._blast(this._lastImpact, mods.chargeDamage, mods.chargeRadius, null, false);
      this.effects.addShake(0.2);
    }
    // LUCKY STREAK's body, read BEFORE the dedup set is emptied. One trigger
    // pull is one entry in it however many pellets landed, which is exactly the
    // grain the streak counts in - and the first entry is the body the shot was
    // aimed at, because that is the one the raycast reached first.
    if (mods.luckyStep > 0) {
      let first = null;
      for (const en of this._shotHits) { first = en; break; }
      this.player.bumpLucky(first);
    }
    // CRITICAL OVERFLOW settles once, on the answer the BODIES gave. A shot
    // that touched nothing crit nothing and pays the non-crit price, which is
    // the honest reading: what it refunds is a crit, not a die roll.
    if (mods.critOverflow > 0) this.player.settleShot(this._shotWasCrit);
    // CHAIN FEED. The magazine is seated again with no reload at all - but only
    // if this shot both EMPTIED it and killed something. `magAtShot` is what
    // the trigger saw and `lastShotCost` what it billed, which is the one pair
    // that answers "was that the last round" for every build.
    if (mods.chainFeed > 0 && this.player.lastShotCost > 0
      && this.player.magAtShot <= this.player.lastShotCost) {
      let killed = false;
      for (const en of this._shotHits) if (en.dead) { killed = true; break; }
      if (killed && this.player.instantReload()) {
        this.sfx.reload();
        this.effects.burst(muzzle, THEME_CHAIN, 14, 4.5, 2.2, 0.32);
        this.pad.rumble(0.4, 0.35, 120, 1);
        this.ui.flashReserve();
      }
    }
    this._shotHits.clear();
    this._shotCrit.clear();

    // AIM OR BLEED. Per SHOT and off the same boolean the hitmarker is drawn
    // from, so what it charges is always what the player just saw. The floor of
    // 1 is CURSED AMMO's, for the same reason: a held trigger pointed at a wall
    // must not be able to kill you on its own.
    if (mods.aimHeal > 0 || mods.missCost > 0) {
      if (hitAny) {
        this.player.heal(mods.aimHeal);
      } else if (mods.missCost > 0 && this.player.health > 1) {
        this.player.health = Math.max(1, this.player.health - mods.missCost);
        this.ui.damage();
      }
    }

    // Hot Streak rides the SHOT, not the pellet: one trigger pull is one step
    // up or one step down however many pellets were in it, and it reads the
    // same boolean the hitmarker below does so the two can never disagree.
    this.player.bumpStreak(hitAny);

    // OVERLOAD. The magazine running dry calls lightning down on the whole
    // room. Fired here rather than in tryShoot() because it has to be the
    // shot that emptied the gun and not the click after it, and because a
    // fraction of MAX HP means the enemy list has to be walked anyway.
    if (mods.overloadFrac > 0 && this.player.mag <= 0) this._overload();

    // One hitmarker and one sound per shot, however many pellets connected.
    // HAEMOPHAGE. Spent on a shot that CONNECTED, off the same boolean the
    // hitmarker is drawn from - a magazine emptied into a wall must not be a
    // full heal, and requiring the hit is what makes the item something the
    // player has to shoot well to cash in.
    if (hitAny && this.player.leechShots > 0) {
      this.player.leechShots--;
      this.player.heal(1);
      this.effects.impact(this.player.eyeInto(this._killPos), 0xff2d6f, 6, 3, 2, 0.3);
    }
    if (hitAny) {
      this.stats.hits++;
      this.sfx.hit();
      this.ui.hitMarker();
      this.effects.addShake(0.03);
      // BRASS ECHO. Rolled per SHOT and only on one that connected, off the
      // same boolean the hitmarker is drawn from - the round the player gets
      // back is always one they can see having earned. A puff of brass at the
      // muzzle is the whole tell; the ammo counter climbing is the rest.
      if (this.player.tryAmmoRefund()) {
        this.effects.burst(
          this.player.muzzleInto(this._killPos), 0xffab00, 6, 3, 1.6, 0.3
        );
        // The puff at the muzzle is lost in a firefight; the number in the
        // corner is where the player actually reads their ammunition, so that
        // is what flares. Without it a 5% refund is a stat nobody can see.
        this.ui.flashReserve();
      }
    }
    targets.length = 0;
  }

  // Arms a swing. THE HIT IS NOT DEALT HERE: player.tryMelee() starts the
  // animation and this only notes when the strike lands, so the two are one
  // event. See _meleeStrike for the hit itself, and MELEE_SWING for the delay.
  tryMelee() {
    if (!this.player.tryMelee()) return;
    this.sfx.melee();
    this._meleeSwing = MELEE_SWING;
  }

  /**
   * THE SWING CONNECTING. One target, chosen the way a person swinging a rifle
   * would: the nearest thing in front of them.
   *
   * IT USED TO HIT EVERYTHING in a sixty-degree arc and draw a ring on the
   * floor to say where that arc was. Both are gone. The ring was a diagram of
   * a hitbox - it told the player about the game's geometry rather than about
   * the swing - and a melee that cleared a crowd made the gun the wrong answer
   * to being surrounded. What is left is a single, committed strike, and what
   * pays for it is the double it is worth (see MELEE_KILL_MULT).
   *
   * Like the old sweep it ignores geometry, so it still reaches through thin
   * cover.
   */
  _meleeStrike() {
    if (this.state !== 'playing') return;
    const forward = this.player.forwardInto(this._meleeDir);
    // ONE ROLL PER SWING, the same rule the trigger pull follows. The DAMAGE
    // waits for a target, because the crit family and the range passive items
    // all ask which body - see _resolveHit. POINT BLANK is always paid on a
    // melee, which is correct and not an accident: the swing's reach is well
    // inside its five metres, and a passive item that rewards being close ought
    // to reward the one attack that requires it.
    const crit = this.player.rollCrit();
    const cosArc = Math.cos(MELEE_ARC);
    let target = null;
    let bestD = Infinity;
    let bestDX = 0;
    let bestDZ = 0;

    for (const e of this.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.player.pos.x;
      const dz = e.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      // Reach grows with the target: a boss two metres wide would otherwise be
      // unmeleeable, since its surface is already past MELEE_RANGE while its
      // centre is far outside it.
      if (d > MELEE_RANGE + e.radius - 0.5) continue;
      // Anything the player is standing inside has no meaningful direction, so
      // it is always in the arc.
      if (d > 0.001 && (dx * forward.x + dz * forward.z) / d < cosArc) continue;
      // NEAREST WINS, measured surface-first for the same reason the reach is:
      // a boss whose centre is further away is still the thing the gun would
      // actually strike.
      const surface = d - e.radius;
      if (surface >= bestD) continue;
      bestD = surface;
      bestDX = dx;
      bestDZ = dz;
      target = e;
    }

    if (!target) {
      // A swing that caught nothing still moved the arm. Much lighter, so the
      // difference between a hit and a miss is felt without being read.
      this.effects.addShake(0.03);
      this.pad.rumble(0.2, 0.15, 70, 1);
      return;
    }

    const d = Math.hypot(bestDX, bestDZ) || 1;
    this._shotCrit.clear();
    const hot = this._resolveHit(target, crit, false);
    const dealt = this.player.getEffectiveDamage(MELEE_DAMAGE)
      * this._hitMult(target, hot);
    this._shotCrit.clear();
    // A swing travels from the player toward the enemy, which is what tells
    // a shield or a weak point whether it was struck.
    target.takeDamage(dealt, false, bestDX / d, bestDZ / d, null, hot);
    // TAGGED, NOT PAID. The reward is worked out in one place - the death
    // sweep in _updateEnemies - and this only records how the body died, so
    // the combo multiplier and the double still compose there.
    if (target.dead) target.meleeKill = true;
    // KNOCKBACK IS NOW A MOVE, NOT A TELEPORT. This used to add three metres to
    // the enemy's position on the frame of the hit, so the body was simply
    // somewhere else on the next frame - which read as the enemy blinking
    // rather than as the swing having any force behind it. Enemy.knock spreads
    // the same three metres over a fifth of a second, and it goes through the
    // enemy's own movement step, which also gets it the obstacle resolve this
    // never had: a body knocked into a pillar now stops at the pillar instead
    // of ending up inside it.
    this._knockback.subVectors(target.pos, this.player.pos).setY(0).normalize();
    target.knock(this._knockback.x, this._knockback.z, 3);
    // NO PARTICLES ON THE HIT. The swing already has a hitmarker, the body's
    // white flash, the damage number floating off it and a shove that visibly
    // moves it - a spray of gold sparks on top was a fifth signal for one
    // event, and the loudest of the five.
    this.ui.hitMarker();
    this.effects.addShake(0.08);
    this.pad.rumble(0.7, 0.4, 130, 2);
  }

  // Single entry point for all damage to the player, passed to enemies and
  // projectiles through their ctx. `pos` is only used to place the hit spray.
  _hurtPlayer(d, pos, source = null) {
    if (this.state !== 'playing') return;
    // NOBODY IS HURT DURING A HANDOFF, and this is a rule about who is holding
    // the controller rather than about damage.
    //
    // For the first half of a pass the body still carries the OUTGOING
    // player's zeroed health; for the second it carries the incoming player's
    // run, and they have not been handed the pad yet. A hit in either half
    // belongs to nobody. Both _playerFell and the loop's health test already
    // refuse to BOOK a death while `_pass` is set, so damage taken here could
    // not end a turn - it was simply banked against whoever the body became,
    // and the incoming player started their wave already dying. Refused at the
    // source instead, so the three tests agree.
    if (this._pass) return;
    // Demonic Dodge's invulnerability window, before anything else - it is a
    // second in which nothing lands at all, so there is nothing here for the
    // ward or Evasion to spend themselves on.
    if (this.time < this.player.invulnEnd) return;
    // Thorns pays out on the hit that was ATTEMPTED, which is why it sits
    // above the dodge and the ward: something reached the player either way,
    // and an attacker that got away with it because the ward happened to be up
    // is the one case where the passive item would read as broken.
    this._thorns(d, pos, source);
    // Evasion, rolled before the ward: a dodge is free and the ward is a
    // limited charge, so spending the charge on a hit that was going to miss
    // anyway would be strictly worse for the player. A dodge has to be LOUD -
    // a hit that silently fails to land reads as nothing happening at all.
    if (this.player.mods.dodgeChance > 0 && Math.random() < this.player.mods.dodgeChance) {
      this.player.startDodge(this.time);
      this.effects.shockwave(this.player.pos, 0x18ffff, 3, 0.35);
      this.effects.burst(pos, 0x18ffff, 14, 5, 2.5, 0.4);
      this.sfx.melee();
      this.ui.banner('DODGE');
      return;
    }
    // Holy Mantle. The ward eats the hit whole, however big it was, and is
    // spent doing it - it is a free mistake per wave, not damage reduction.
    if (this.player.wardReady) {
      this.player.wardReady = false;
      this.effects.shockwave(this.player.pos, 0x4ef3ff, 3.5, 0.4);
      this.effects.burst(pos, 0x4ef3ff, 16, 5, 2, 0.5);
      this.sfx.impact();
      this.ui.banner('WARD');
      return;
    }
    // Blood Pact, and RED MIST's half of its own bargain. Applied after the
    // ward and the dodge, because those are about whether a hit lands at all
    // and this is about how much it costs. The item's multiplier is separate
    // from the passive item's so the two stack instead of one overwriting the
    // other - which is what a player holding both would expect, and is also
    // the only reading under which the item's own text stays true.
    d *= this.player.incomingMult * this.player.itemTakenMult;
    // Carnage resets on any hit that actually lands, and Absolute Zero's
    // drawback plants the player for a second. Both are the price of the deal.
    this.player.clearCarnage();
    this.player.freeze(this.time);
    const h = this.player.takeDamage(d, this.time);
    // KILL STREAK's counter, broken by the same hit that breaks the flawless
    // streak below - "without taking damage" means the same thing to both.
    this.player.cleanKills = 0;
    // BRUISE ROUNDS. A full magazine for a hit, made rather than moved: the
    // reserve is never touched, which is what makes it worth having to a build
    // that is out of both at once.
    if (this.player.mods.bruise > 0 && this.player.mag < this.player.magSize) {
      this.player.mag = this.player.magSize;
      this.player.reloading = 0;
      // A fresh magazine is a fresh magazine, so CANNONADE's round is armed by
      // it - the rounds arrived, which is the only question that pick asks.
      this.player.magFresh = true;
      this.effects.burst(
        this.player.muzzleInto(this._killPos), THEME_BRUISE, 12, 4, 2, 0.3
      );
      this.ui.flashReserve();
    }
    // PANIC TURRET, placed by the hit that just landed.
    if (this.player.mods.panicTurret > 0) this._panicTurret();
    // What LANDED, not what was thrown: curse is applied inside takeDamage.
    // Books the damage and breaks the flawless streak - see _noteDamage.
    this._noteDamage();
    this._shockwave();
    this.effects.addShake(0.25);
    this.effects.burst(pos, 0xff3b30, 12, 4, 1.5, 0.4);
    this.sfx.hurt();
    // The loudest thing that happens on a normal frame, and it outranks the
    // trigger: a shot fired on the frame the player was hit must not be what
    // they feel. Scaled by the bite the hit actually took out of them.
    const bite = Math.min(1, this.player.lastDamageTaken / Math.max(1, this.player.maxHealth * 0.3));
    this.pad.rumble(0.55 + bite * 0.45, 0.5, 160 + bite * 140, 3);
    this.ui.damage();
    // A hard white blink over the red vignette. Shorter than the vignette on
    // purpose, so the two read as one hit rather than two events.
    this.rig.cueDamage();
    if (h > 0) return;
    // Dead Cat. One revive for the whole run, not one per wave: it is the
    // upside of a permanently smaller health pool, and refilling it every wave
    // would make the drawback free after the first clear.
    if (this.player.livesUsed < this.player.mods.extraLives) {
      this.player.livesUsed++;
      this.player.health = 1;
      this.player.shield = 40;
      this.player.shieldEnd = this.time + 3;
      this.effects.shockwave(this.player.pos, 0xff2d6f, 6, 0.5);
      this.effects.burst(this.player.eyeInto(this._killPos), 0xff2d6f, 40, 7, 3, 0.9);
      this.effects.addShake(0.3);
      this.ui.banner('NINE LIVES');
      return;
    }
    // THE DEATH IS NOT BOOKED HERE. Every caller of this method is inside one
    // of the frame's entity sweeps - a projectile's update, an enemy's, a
    // blast - and booking a death tears those very lists down underneath the
    // loop that is walking them. _clearEntities() empties `projectiles` while
    // _updateProjectiles is midway through its backwards walk, and the next
    // index it reads is undefined; the throw escapes rAF, which never
    // reschedules, and the game freezes exactly where it stood. In versus that
    // is on the handoff caption, because _playerFell starts the pass first.
    //
    // So the body is simply left at zero and the loop books it at the end of
    // the frame, after every sweep has finished with its list - which is what
    // the health test down there is for. Nothing is lost by the wait: no
    // second death can be booked off it (gameOver is idempotent, and the wave
    // that would deal it is over by the next frame).
  }

  // `speedScale` is Cryo Rounds slowing the shot a slowed enemy fires. It is
  // baked in at spawn rather than read per frame: the round is already in the
  // air by the time the shooter thaws, and a shot that sped up mid-flight
  // would be unreadable.
  //
  // `spreadRad` yaws the aim off the player by that many radians, which is how
  // a caller fires a FAN: three rounds from one muzzle at -a, 0 and +a diverge
  // with range, where three muzzles all aiming at the player would converge and
  // either all hit or all miss.
  _spawnProjectile(x, y, z, type = 'shooter', speedScale = 1, spreadRad = 0) {
    if (this.projectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const t = this.player.eyeInto(this._aimTarget);
    if (spreadRad) {
      const dx = t.x - x;
      const dz = t.z - z;
      const c = Math.cos(spreadRad);
      const sn = Math.sin(spreadRad);
      t.x = x + dx * c - dz * sn;
      t.z = z + dx * sn + dz * c;
    }
    // Speed and damage come off the type's own `proj` block (js/enemies/), so a
    // new ranged enemy is a row on its stat block rather than a branch here.
    const { speed, dmg } = projStats(type, this.wave);
    // Absolute Zero applied HERE and nowhere else, so every enemy round in the
    // game is covered by one line - including the boss volleys that pass a
    // speedScale of 1 and never touch Enemy._projScale(). Cryo's own slow is
    // already baked into `speedScale` by the caller, and the two multiply.
    const slow = this.player.mods.worldSlow;
    this.projectiles.push(
      new Projectile(
        this.scene, this.effects.glowTex, x, y, z, t, speed * speedScale * slow, dmg, type
      )
    );
  }

  _spawnGrenade(x, y, z, damage) {
    if (this.projectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const t = this.player.eyeInto(this._aimTarget);
    const speed = Math.min(18, 12 + this.wave * 0.2);
    const dmg = Math.min(28, damage + this.wave * 0.5);
    this.projectiles.push(new Grenade(this.scene, this.effects.glowTex, x, y, z, t, speed, dmg));
  }

  // A blight's lobbed glob. The arc is solved here rather than fired at a fixed
  // elevation like a grenade, because the pool has to land somewhere the player
  // could have been: horizontal speed is constant, the flight time falls out of
  // the range, and the vertical impulse is whatever puts the glob on the ground
  // at the end of it.
  //
  // AIM LEADS BY ALMOST THE WHOLE FLIGHT. Holding a straight line has to stay
  // punished - that was the point of the old instant pool, and a shot that
  // systematically fell short would have replaced an unfair enemy with a
  // harmless one. The dodge is a CHANGE OF DIRECTION, which is legible, not a
  // reaction the player has no time to make. The 0.9 leaves just enough slack
  // that a player already turning is out of the pool before it exists.
  //
  // Solved in two passes: the lead moves the aim point, which changes the range
  // and so the flight time the lead was derived from. One pass under-leads a
  // sprinting player by metres.
  _spawnSpit(x, y, z, kind = 'pool') {
    if (this.projectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const p = this.player;
    const SPEED = 14;
    const LEAD = 0.9;
    let tx = p.pos.x;
    let tz = p.pos.z;
    for (let i = 0; i < 2; i++) {
      const t = Math.min(2.2, Math.hypot(tx - x, tz - z) / SPEED);
      // Clamped inside the walls: a lead that ran off the arena would put the
      // pool inside the geometry, where it is neither visible nor avoidable.
      tx = Math.max(-ARENA_BOUND + 1, Math.min(ARENA_BOUND - 1, p.pos.x + p.vel.x * t * LEAD));
      tz = Math.max(-ARENA_BOUND + 1, Math.min(ARENA_BOUND - 1, p.pos.z + p.vel.z * t * LEAD));
    }
    const dx = tx - x;
    const dz = tz - z;
    const dist = Math.max(0.5, Math.hypot(dx, dz));
    const t = dist / SPEED;
    // y + vy*t - 0.5*g*t^2 = 0.12, solved for vy.
    const vy = (0.12 - y + 0.5 * 22 * t * t) / t;
    // A blight's pool and a vitriol's cloud are thrown identically and land
    // differently, so the arc above is shared and only what grows out of it
    // is not. See HAZARD_KINDS.
    // One row per kind. A fifth would be a row here and a row in HAZARD_KINDS.
    const g = SPIT_CONFIG[kind] || SPIT_POOL;
    this.projectiles.push(new Spit(
      this.scene, this.effects.glowTex, x, y, z,
      (dx / dist) * SPEED, vy, (dz / dist) * SPEED,
      g.radius, g.life, g.dps, kind
    ));
  }

  // Autotest bot: aims at the nearest enemy, holds the trigger, and wanders in
  // a random cardinal direction. Only good enough to exercise the game.
  _autoInput() {
    // Claiming a totem takes priority over fighting, so the bot exercises the
    // upgrade path every wave instead of ignoring it - and now that the next
    // wave will not start until something is claimed, a bot that failed to
    // claim would hang the run rather than merely skip an upgrade.
    //
    // It SHOOTS the totem it wants. Shooting picks exactly the one it aimed at
    // and needs no proximity, and it walks toward the target at the same time
    // so a blocked line of sight resolves itself. The E path is the human one
    // and is covered by test/active.mjs instead - a bot pressing a key at
    // whatever it happened to be standing next to would test nothing.
    let seekTotem = null;
    if (this.totemArea.active && !this.totemArea.claimed) {
      let td = 1e9;
      for (const t of this.totemArea.totems) {
        if (!t.canClaim()) continue;
        const d = t.pos.distanceTo(this.player.pos);
        if (d < td) {
          td = d;
          seekTotem = t;
        }
      }
    }

    let best = null;
    let bd = 1e9;
    for (const e of this.enemies) {
      const d = e.pos.distanceTo(this.player.pos);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }

    // Line up on the totem before firing at it. Until the bot is in position
    // it holds fire, because a shot from the wrong angle claims the wrong
    // upgrade just as effectively as a good one claims the right one.
    const lined = seekTotem ? this._botLineUp(seekTotem) : false;

    // The totem outranks the nearest enemy as an aim point: it is the thing
    // that has to be hit for the run to continue.
    const aimAt = seekTotem || best;
    if (aimAt) {
      const dx = aimAt.pos.x - this.player.pos.x;
      // Totems are aimed at icon height, enemies at the chest.
      const dy = (seekTotem ? 1.5 : 1.0) - (this.player.pos.y + this.player.eyeH);
      const dz = aimAt.pos.z - this.player.pos.z;
      const ty = Math.atan2(-dx, -dz);
      const tp = Math.atan2(dy, Math.hypot(dx, dz));
      // Sharper than it looks: at 0.18 the bot's aim lagged enough that it hit
      // one shot in five and died on wave 2, which left every assertion about
      // later waves passing vacuously.
      const k = 0.4;
      this.player.yaw += (ty - this.player.yaw) * k;
      this.player.pitch += (tp - this.player.pitch) * k;
      this.input.shoot = seekTotem ? lined : true;
      // The bot re-arms the edge every frame, so it fires semi-autos as fast
      // as their cooldown allows. Fine for a smoke test - it is exercising the
      // weapons, not simulating a human trigger finger.
      this.input.shootFresh = this.input.shoot;
    } else {
      this.input.shoot = false;
    }
    this._wt -= 1 / 60;
    if (this._wt <= 0) {
      this._wt = 1 + Math.random() * 2;
      this._dir = (Math.random() * 5) | 0;
    }
    // World-space direction to walk. Straight at a totem when one is up,
    // otherwise the random cardinal wander.
    let fx;
    let fz;
    if (seekTotem) {
      fx = this._botMove.x;
      fz = this._botMove.z;
    } else {
      const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0], [0, 0]];
      [fx, fz] = dirs[this._dir];
    }
    const sinY = Math.sin(this.player.yaw);
    const cosY = Math.cos(this.player.yaw);
    const lf = fx * -sinY + fz * -cosY;
    const lr = fx * cosY + fz * -sinY;
    this.input.forward = lf > 0.1;
    this.input.back = lf < -0.1;
    this.input.right = lr > 0.1;
    this.input.left = lr < -0.1;
    this.input.jump = Math.sin(this.time * 3) > 0.92;
  }

  // Autotest bot: manoeuvre into a position it can safely shoot `t` from,
  // writing the walk direction into this._botMove and returning whether it is
  // there yet. Three rules, in priority order:
  //
  //   1. Keep a few metres off every totem. Standing among the row means
  //      firing from inside it, where the pillar it wants is as likely to be
  //      behind a neighbour as in front of one.
  //   2. Close to firing range.
  //   3. Sidestep until no other totem sits on the line of fire - the totems
  //      are in a row, so a bot approaching from the flank shoots through two
  //      of them to reach the third and claims the first one it hits.
  _botLineUp(t) {
    const p = this.player.pos;
    const m = this._botMove;
    m.x = 0;
    m.z = 0;

    for (const o of this.totemArea.totems) {
      if (o.state === 'hidden') continue;
      const ox = p.x - o.pos.x;
      const oz = p.z - o.pos.z;
      const d = Math.hypot(ox, oz);
      // Comfortably clear of the pillar, with room for a frame of movement.
      if (d < 3 && d > 1e-3) {
        m.x = ox / d;
        m.z = oz / d;
        return false;
      }
    }

    const vx = t.pos.x - p.x;
    const vz = t.pos.z - p.z;
    const d = Math.hypot(vx, vz) || 1;
    if (d > 12) {
      m.x = vx / d;
      m.z = vz / d;
      return false;
    }

    for (const o of this.totemArea.totems) {
      if (o === t || o.state === 'hidden') continue;
      // Distance from the other totem to the segment player -> target.
      const l2 = vx * vx + vz * vz;
      const s = Math.max(0, Math.min(1, ((o.pos.x - p.x) * vx + (o.pos.z - p.z) * vz) / l2));
      const cx = p.x + vx * s - o.pos.x;
      const cz = p.z + vz * s - o.pos.z;
      if (cx * cx + cz * cz < 4) {
        // Strafe, always the same way round, so it sweeps clear instead of
        // oscillating on the boundary.
        m.x = -vz / d;
        m.z = vx / d;
        return false;
      }
    }
    return true;
  }

  // ---- the arena's interior, per wave --------------------------------------
  //
  // THE ORDER MATTERS, and it is the same three beats every wave:
  //
  //   wave clears  -> _sinkTerrain(). Collision is dropped IMMEDIATELY and the
  //                   meshes slide under the floor over the next second. The
  //                   field is empty at this point, so nothing can be caught
  //                   inside a box on its way down, and a player standing on a
  //                   platform rides it back to the floor. The shop then rises
  //                   onto a completely bare floor - which is why the
  //                   keep-clear rule that used to live in arena.js is gone.
  //
  //   break ends   -> _buildTerrain(). A layout is generated and starts
  //                   rising, and the wave countdown is held open for at least
  //                   as long as the build takes, so terrain is always settled
  //                   before the first enemy spawns.
  //
  //   rise settles -> _settleTerrain(). The AABBs are published into the
  //                   arena's lists, both nav grids are rebaked, and the
  //                   lasers are told what they can land on.
  //
  // Called from the idle branch rather than from startWave() so that every
  // route into a wave - a fresh run, a reset, a versus handoff, an ordinary
  // wave break - gets terrain without any of them having to remember to ask.
  _ensureTerrain() {
    if (this.terrain.state !== 'hidden') return;
    this._buildTerrain();
  }

  _buildTerrain() {
    // NOTHING RISES UNDER THE PLAYER. They are standing somewhere on the floor
    // with no say in where the next layout lands, and a wall that materialises
    // around them is the one thing procedural terrain can do that is simply
    // unfair. Reserved generously - a piece is placed by its centre, and the
    // generator grows this by the piece's own footprint.
    const reserved = [{ x: this.player.pos.x, z: this.player.pos.z, r: 4 }];
    // And nothing rises on an unclaimed totem row. A set the player walked
    // away from is deliberately left standing into the next wave (see the
    // intermission branch below), so for that one case the row is furniture
    // the layout has to work around.
    // The whole row, offers and stations, at the x positions totems.js builds
    // them at - if one is standing, all five are.
    if (this.totemArea.active && !this.totemArea.claimed) {
      for (const x of [-6.9, -3.6, 0, 3.6, 6.9]) {
        reserved.push({ x, z: TOTEM_ROW_Z, r: 4 });
      }
    }
    const layout = generateLayout(this.wave + 1, {
      seed: this._terrainSeed,
      bound: ARENA_BOUND,
      spawnPoints: this.arena.spawnPoints,
      reserved,
    });
    this.terrain.build(layout);
    // The countdown is held to the build, never shortened by it: a handoff
    // already runs on a longer clock and must keep it.
    this.interT = Math.max(this.interT, TERRAIN_BUILD_TIME);
  }

  _settleTerrain() {
    this.terrain.collect();
    this.nav.rebake(this.arena.obstacles);
    this.navBig.rebake(this.arena.obstacles);
    this.rig.setTerrainColliders(this.terrain.colliders);
    // The clearance circle above makes this very nearly impossible, but "very
    // nearly" is not a guarantee: the player is free to walk into a piece
    // while it is on its way up, when nothing is solid yet. One push-out on
    // the frame collision is published costs nothing and closes it.
    resolveCircle(this.player.pos, 0.4, this.arena.obstacles, 1.8);
  }

  _sinkTerrain() {
    this.terrain.beginSink();
    // Collision goes NOW, not when the animation finishes. A box that is
    // halfway into the floor is not something to walk into or shoot at, and
    // the shop is about to rise through where it stands.
    this.terrain.clearCollision();
    this.nav.rebake(this.arena.obstacles);
    this.navBig.rebake(this.arena.obstacles);
    this.rig.setTerrainColliders(this.terrain.colliders);
  }

  // Drives the wave state machine and the enemy trickle. A wave ends only when
  // the queue is empty AND no enemies are left alive.
  _updateWave(dt) {
    // A PASS OWNS THE CLOCK, whatever `waveState` says.
    //
    // The handoff runs on the ordinary intermission timer (see _endTurn), and
    // it used to reach that timer through the `idle` branch at the bottom -
    // which made finishing the pass conditional on a second variable agreeing
    // with `_pass`. If they ever disagreed the mode hung, and hung in the
    // worst possible way: with `intermission` set, the branch below re-books
    // the turn through _endTurn, which re-arms interT to HANDOFF_TIME. Every
    // frame. The countdown sits at three, the caption never comes down, and
    // the match is stuck on a "pass the controller" screen that will never
    // advance - no error, no crash, just a game that has stopped.
    //
    // So the pass is read FIRST and answers for itself. One flag decides
    // whether a handoff is running and the same flag runs it out, so there is
    // no second opinion left to disagree with.
    if (this._pass) {
      this._ensureTerrain();
      // The same guarantee the idle branch below makes. It matters more here:
      // the swap halfway through a handoff tears the arena down (see
      // _clearEntities), so a pass can find itself rebuilding with less of the
      // handoff clock left than a build needs.
      if (this.terrain.state === 'rising') this.interT = Math.max(this.interT, 0.05);
      this.interT -= dt;
      if (this.interT <= 0) this.startWave();
      return;
    }
    if (this.waveState === 'active') {
      this.spawnTimer -= dt;
      if (this.queue.length && this.spawnTimer <= 0) {
        this.spawnEnemy(this.queue.shift());
        this.spawnTimer = this._cfg.spawnInterval;
      }
      this._updateReliefDrop(dt);
      if (this.bossFight) {
        this._updateBossAdds(dt);
        this._bossBleed();
        this._bossChargeDrain();
      }

      // A boss wave ends when the BOSS is dead, not when the field is clear -
      // the adds never stop arriving, so waiting for an empty field would wait
      // forever.
      //
      // The invariant that makes reading parts.length here safe: _updateWave
      // runs BEFORE _updateEnemies in the frame, and a boss that splits has
      // its children pushed into `parts` inside the same sweep that removes
      // the parent. So this only ever sees the settled post-sweep value, never
      // the empty instant in the middle of a split.
      const done = this.bossFight
        ? this.bossFight.parts.length === 0
        : !this.queue.length && !this.enemies.length;
      if (done) {
        if (this.bossFight) this._finishBossWave();
        this._clearHazards();
        // The room empties before the shop fills it.
        this._sinkTerrain();
        this.waveState = 'intermission';
        this.lastPerfect = this.waveDamageTaken <= 0;
        // Everything still on the floor comes in, so a wave's money can never
        // be lost to the shopping trip that follows it - and neither can a
        // health crate the player never had a safe second to walk over.
        this.money.vacuum();
        this._vacuumPickups();
        // And with it everything the item is still owed, so a wave always pays
        // its full budget whether or not every orb was walked over.
        this._flushItemCharge();
        let msg = 'WAVE ' + this.wave + ' CLEARED';
        if (this.lastPerfect) {
          // ONE MORE CLEAN WAVE ON THE STREAK, and it is banked BEFORE the
          // shower is paid: the wave that was just cleared counts toward its
          // own bonus, so the number the banner announces is the number the
          // HUD is about to show and the shower is worth. Clamped at the cap
          // so the stored count never runs past what it can ever be paid for.
          this.player.flawlessStreak = Math.min(
            FLAWLESS_STREAK_CAP, this.player.flawlessStreak + 1
          );
          // WHAT FLAWLESS PAYS NOW. The clear bonus used to double for a wave
          // taken without damage, which was the game's loudest "you were not
          // hit" signal; with the flat bonus gone it is paid as a shower of
          // orbs at the player's feet instead. Same reward, and it arrives as
          // something that happens in the room rather than as a bigger number
          // in a banner.
          //
          // Through _dropMoney like every other payout, so it takes Midas and
          // the streak it just extended. Held and then swept - see
          // FLAWLESS_ORB_HOLD for why a shower thrown at the player's own feet
          // needs both, and why without them this was invisible.
          this._dropMoney(
            this.player.pos,
            FLAWLESS_BONUS_BASE + FLAWLESS_BONUS_PER_WAVE * this.wave,
            FLAWLESS_ORBS, 5.5, FLAWLESS_ORB_HOLD
          );
          // The wave-clear sweep above has already run, so these orbs would
          // otherwise be the one drop left lying on the floor.
          this.money.vacuum(FLAWLESS_ORB_SWEEP_DELAY);
          msg += '  FLAWLESS x' + this.flawlessMult();
        }
        // No-Hit Bonus. Read from the same flag the clear bonus just set, so
        // the two can never disagree about what flawless means, and banked on
        // the player rather than in mods - see Player.addNoHitStack. It is
        // folded into the clear banner rather than raised as its own, because
        // a banner replaces whatever is on screen: a second one here would
        // wipe the wave-clear line before it could be read.
        // UNTOUCHED and SCAR TISSUE, banked before the No-Hit line so the two
        // rewards for the same wave are appended in the order they are earned.
        // Folded into the clear banner for the same reason No-Hit is: a second
        // banner would wipe the first before it could be read.
        const banked = this.player.bankWaveHealth(this.lastPerfect);
        if (banked > 0) {
          this.effects.shockwave(this.player.pos, 0xb2ff59, 6, 0.6);
          msg += '  +' + banked + ' MAX HP';
        }
        if (this.lastPerfect && this.player.mods.noHitBonus > 0) {
          const n = this.player.addNoHitStack();
          const pct = Math.round(Math.min(NO_HIT_CAP, this.player.mods.noHitBonus * n) * 100);
          this.effects.shockwave(this.player.pos, 0xeaff6b, 7, 0.7);
          msg += '  NO-HIT x' + n + ' (+' + pct + '% DMG & RATE)';
        }
        this.ui.banner(msg);
        // After the flawless test above, so it still reads the damage actually
        // taken during the fight.
        if (this._cfg.boss) this._payBossBonus();
        // THE CHALLENGE CLEAR ENDS THE MATCH HERE, not after a passive item
        // pick.
        //
        // Clearing a wave the other player died on IS the win (see
        // VersusMatch.advance), so the shop that normally follows a clear is a
        // pick for a run that will never be played again - the totems rise,
        // the match is already decided, and the player has to spend a choice
        // to be told they won. The ordinary path below books the turn on the
        // PICK because the pick is the last thing a player does with the
        // controller; when there is no next turn there is nothing to hand
        // over, so the turn is booked on the wave instead.
        if (this.match && this.match.wouldWin()) {
          this._endTurn(true);
          return;
        }
        this._presentTotems();
        this._presentBox();
      }
    } else if (this.waveState === 'intermission') {
      // The next wave is GATED ON A PICK, not on a clock. Nothing else in the
      // game stops for the player, so this is the one held boundary in a run
      // and it exists because a forfeited pick was invisible: the set sank, a
      // wave started, and nothing ever said what was lost. `!active` covers a
      // set that never rose - an empty roll, or one dismissed on a reset - so
      // an exhausted pool can never wedge the run.
      if (!this.totemArea.active || this.totemArea.claimed) {
        // VERSUS ENDS THE TURN ON THE PICK, not on the wave that follows it.
        // The passive item is the last decision the player makes, so the
        // handoff lands on a choice rather than halfway through the walk back.
        if (this.match) { this._endTurn(true); return; }
        this.waveState = 'idle';
        this.interT = 0.4;
        // THE WAVE IS ANNOUNCED ON THE PICK, not on the build. Taking a
        // passive item is the last thing the player does in a break, so that
        // is the moment the fight starts as far as they are concerned - the
        // arena rising afterwards is scenery. Holding the caption and the
        // filter until the last pillar landed made the seconds after the pick
        // read as dead air.
        this._cueWaveOpen();
      }
    } else if (this.waveState === 'idle') {
      this._ensureTerrain();
      // A WAVE NEVER STARTS ON A HALF-BUILT ARENA. _buildTerrain holds the
      // countdown to the build's own length and the build has its own backstop
      // for overrunning it, but this is the one that cannot be got wrong by a
      // timing change in either of them: while pieces are still coming up, the
      // clock does not reach zero.
      if (this.terrain.state === 'rising') this.interT = Math.max(this.interT, 0.05);
      this.interT -= dt;
      if (this.interT <= 0) this.startWave();
    }
  }

  // Raises a fresh set of three totems. Called on every wave clear, so a set
  // the player never claimed is simply replaced - that pick is forfeited.
  _presentTotems(isReroll = false) {
    const area = this.totemArea;
    // A FRESH SHOP FORGETS. `shopSeen` is what a reroll is drawn AGAINST - see
    // TotemArea - so it is emptied here rather than inside present(), which
    // could only clear it after this set had already been rolled from it.
    if (!isReroll) area.shopSeen.clear();
    const offers = this._buildOffers(area.shopSeen);
    for (const o of offers) area.shopSeen.add(o.id);
    // A totem claim is what starts the next wave, and the mystery box now
    // stands in every one of them - so the LONGER arm delay is simply what a
    // totem always gets. Ending the shopping trip with a pellet that was
    // already in the air when the wave ended is a mistake the player cannot
    // undo, and there is always a second thing out there worth walking to.
    area.present(offers, !isReroll, ARM_TIME_ITEM);
    this._refreshStations();
  }

  /**
   * Raises the mystery box. EVERY shop, unconditionally.
   *
   * The row this replaced came up on a count of shops, so a run met four active
   * items out of thirty-seven and most of the catalogue was unreachable. The
   * box is always there and is limited by MONEY instead - which is a limit the
   * player can do something about, and the reason the schedule is gone rather
   * than merely shortened. See the header of mysterybox.js.
   */
  _presentBox() {
    if (!this.totemArea.active) return;
    this.mysteryBox.present();
    this._refreshBox();
    this.sfx.boxRise();
  }

  /**
   * Puts each rolled upgrade into the shape a totem can draw.
   *
   * @param {?Set<string>} seen  what this shop has already offered, excluded.
   *   Null - the default - is a roll against the whole pool, which is what the
   *   tests and any future caller with no shop behind it want.
   */
  _buildOffers(seen = null) {
    const ids = rollTotems(this.player.upgrades, TOTEM_COUNT, seen);
    return ids.map((id) => {
      const def = UPGRADES[id];
      const owned = this.player.upgrades[id] || 0;
      return {
        id,
        name: def.name,
        theme: def.theme,
        // Resolved against what the player already owns, so a stacking
        // upgrade shows the tier it moves them from and the one it moves
        // them to rather than the whole ladder.
        effects: effectLines(def, owned),
        note: owned > 0 ? 'OWNED ' + owned + ' / ' + def.max : '',
      };
    });
  }

  // Writes the price onto the box's own card. Called after anything that
  // changes whether the player can pay - a roll bought, a new wave break - and
  // when the box rises. Never per frame; the card redraws off it.
  _refreshBox() {
    const box = this.mysteryBox;
    if (!box.active) return;
    const cost = this._boxCost();
    // Affordable to a HIGH STAKES run whatever the balance is - the coin pays,
    // not the wallet. See _gambleTill.
    const stakes = this.player.mods.highStakes > 0;
    box.setPrice('$' + cost, stakes || this.credits >= cost);
  }

  // WHAT THE TWO CREDIT CONSOLES COST RIGHT NOW. Both prices step up every
  // five waves (see blockPrice in upgrades.js), so every place that shows or
  // charges one has to ask for the current wave rather than read a constant -
  // these two are that ask, and nothing else in main.js may price a station.
  //
  // The wave shopped at is the one just CLEARED: the stations rise during the
  // intermission after it, before startWave() has counted the next one.
  _ammoCost() {
    return AMMO_PURCHASE.cost(this.wave);
  }

  _rerollCost() {
    return rerollCost(this.totemArea.rerolls, this.wave);
  }

  // WHAT ONE ROLL OF THE BOX COSTS. Doubles with every roll already bought at
  // this shop, on the same terms a reroll does - see boxCost in upgrades.js.
  // Read off the wave just CLEARED, the same as the two consoles: the box
  // rises during the intermission, before startWave() has counted the next.
  _boxCost() {
    return boxCost(this.wave, this.totemArea.boxRolls);
  }

  // A console's price as the player reads it. FREE rather than $0, because a
  // price of zero is the one number on a console that is not a price.
  _priceLabel(cost) {
    return cost > 0 ? '$' + cost : 'FREE';
  }

  // Takes the payment for a reroll. The caller has already established the
  // player can afford it.
  _payReroll(cost) {
    if (this._gambleTill()) return;
    this.credits -= cost;
  }

  /**
   * HIGH STAKES, and it is ONE method because it has to be one rule.
   *
   * The reroll console and the mystery box are two different tills charging two
   * different ladders, and the card makes one promise about both - so the coin
   * is tossed here and both callers ask it the same question. A second copy of
   * this at the box would be the exact place the odds quietly drifted apart.
   *
   * NINE TIMES IN TEN THE PURCHASE IS SIMPLY FREE. The tenth takes the run down
   * to one health and one round - not a death, and deliberately not: what makes
   * this a gamble rather than a coin-flip-for-the-run is that the player walks
   * out of the shop alive and has to survive the next wave on nothing.
   *
   * @returns {boolean} whether the till was covered by the gamble. False means
   *   the caller charges its own price as it always did.
   */
  _gambleTill() {
    const m = this.player.mods;
    if (!(m.highStakes > 0)) return false;
    if (Math.random() < m.stakesOdds) {
      this.player.health = 1;
      this.player.shield = 0;
      this.player.shieldEnd = 0;
      this.player.mag = Math.min(1, this.player.magSize);
      this.player.reserveAmmo = 0;
      this.player.reloading = 0;
      this.effects.shockwave(this.player.pos, THEME_STAKES, 8, 0.6);
      this.effects.burst(
        this.player.eyeInto(this._killPos), THEME_STAKES, 34, 7, 3, 0.8
      );
      this.effects.addShake(0.4);
      this.sfx.hurt();
      this.pad.rumble(0.9, 0.5, 400, 3);
      this.ui.damage();
      this.rig.cueDamage();
      this.ui.banner('HIGH STAKES');
      // The hit is not billed against the flawless streak: nothing in the
      // arena touched the player, they pulled a lever. Same reading as an
      // item's own health cost - see `pay` in js/items.js.
    }
    return true;
  }

  /**
   * SECOND OPINION, pressed. A reroll that costs nothing and happens where the
   * player is standing, rather than a token they carry to a console.
   *
   * It does NOT advance `totemArea.rerolls`, which is the console's price
   * ladder: that number is how many rerolls have been BOUGHT at this shop, and
   * an item that made the next paid reroll cost double would be charging the
   * player for having carried it. The item is the reroll it gives, and nothing
   * else about the visit changes.
   *
   * The guard is the item's own `ready` - see ACTIVE_ITEMS.itemReroll - so a
   * press with the totems down is refused before the charge is spent, the same
   * way the console answers NOTHING TO REROLL.
   */
  _itemReroll() {
    if (!this.totemArea.active || this.totemArea.claimed) return;
    this._presentTotems(true);
    this._refreshStations();
    this._refreshBox();
  }

  // Redraws both station labels. Only called when something they display
  // actually changes - a purchase, a reroll, or a new set - never per frame.
  _refreshStations() {
    const area = this.totemArea;
    const ammo = this._ammoCost();
    area.ammoStation.setLabel(
      AMMO_PURCHASE.name,
      '$' + ammo,
      this.credits >= ammo && AMMO_PURCHASE.enabled(this.player)
    );
    const cost = this._rerollCost();
    // Lit for a HIGH STAKES run whatever the balance says, because for that run
    // the price is not what decides - the coin is.
    const stakes = this.player.mods.highStakes > 0;
    area.rerollStation.setLabel(
      'REROLL', this._priceLabel(cost), (stakes || this.credits >= cost) && area.active
    );
  }

  // Grants the upgrade a totem is offering and sinks the whole set. Every
  // claim path - touch and shoot - funnels through here, so the guard against
  // double-claiming lives in exactly one place. The pick is confirmed by the
  // burst and the gun itself, not by a card: the totem the player walked into
  // already said what it was.
  //
  // `byKey` is true for an E press, which skips the arm delay: that delay
  // exists to stop a burst already in the air from picking a build, and a key
  // press is never that burst. A shot still has to wait it out.
  _claimTotem(totem, byKey = false) {
    if (!(byKey ? totem.canUse() : totem.canClaim())) return;
    const offer = totem.offer;
    if (!this.player.takeUpgrade(offer.id)) return;
    totem.claimed = true;

    // SACRIFICE ate one of the others on the way in - see Player.takeUpgrade -
    // and it has to SAY WHICH. A pick that silently deleted part of the build
    // would read as a bug the next time the player opened the sheet, and by
    // then they would have no way to know what was gone.
    if (this.player.sacrificed) {
      this.ui.banner('SACRIFICED  ' + this.player.sacrificed);
      this.player.sacrificed = null;
    }
    this.effects.burst(
      this._killPos.set(totem.pos.x, 1.4, totem.pos.z), offer.theme, 30, 7, 2.5, 0.7
    );
    this.effects.addShake(0.1);
    this.sfx.upgrade();
    this.pad.rumble(0.5, 0.6, 220, 2);
    this.totemArea.dismiss();
    // The totem claim is the definitive one: it is what starts the next wave,
    // so the box packs up with it whether or not it was ever paid. A roll left
    // spinning is forfeited, which is the same rule an unclaimed totem set has
    // always followed - one boundary, one thing that closes it.
    this.mysteryBox.dismiss();
  }

  /**
   * THE ONE WAY IN TO THE BOX, for both the E press and the pellet.
   *
   * The box does two different things to the same press depending on what it is
   * doing - sell a roll, or hand over what it is holding - and putting that
   * branch here rather than at the two call sites is what guarantees the shot
   * and the key can never disagree about which one just happened.
   *
   * @param {boolean} byKey  true for an E press. A press skips the shot
   *   cooldown, which exists to stop a held trigger buying eight rolls; a
   *   deliberate press is never that.
   */
  _useBox(byKey = false) {
    if (this.state !== 'playing') return;
    const box = this.mysteryBox;
    if (box.riseState !== 'up') return;
    if (!byKey) {
      if (box.shootCd > 0) return;
      box.shootCd = STATION_SHOOT_COOLDOWN;
    }
    if (box.offered) this._grabBox();
    else this._buyBoxRoll();
  }

  // Pays for a spin. Every guard the purchase needs is here, so the prompt and
  // the two ways in cannot get out of step with what actually happens.
  _buyBoxRoll() {
    const box = this.mysteryBox;
    const cost = this._boxCost();
    // HIGH STAKES pays for the roll, so it also answers the question "can you
    // afford one" - a player carrying it can always pull the lever, which is
    // what makes the one time in ten a real risk rather than a discount they
    // were saving up for anyway. See _gambleTill.
    const stakes = this.player.mods.highStakes > 0;
    if (!box.canBuy || (!stakes && this.credits < cost)) {
      this.sfx.denied();
      // A refusal has to be felt, or a player who cannot afford something
      // presses again and again into silence.
      this.pad.rumble(0.15, 0.5, 60, 1);
      return;
    }
    // CREDITS ONLY, never _payReroll - see the note in _boxCost. The gamble is
    // asked first and, when it covers the roll, nothing is charged at all.
    if (!this._gambleTill()) this.credits -= cost;
    // Counted AFTER the charge, so the roll being paid for is priced at what
    // the player was shown and the next one is the one that costs double.
    this.totemArea.boxRolls++;
    // THE POOL IS TAKEN NOW AND KEPT FOR THE WHOLE SPIN. It excludes whatever
    // the player is carrying, so the carried item cannot even flash past on the
    // reel - not merely fail to win. In versus this is automatically the ACTIVE
    // player's item: there is one Player instance and each run's slot is
    // snapshotted across the handoff. See shuffledPool in items.js.
    box.roll(shuffledPool(this.player.item));
    this._refreshBox();
    this.sfx.boxOpen();
    this.pad.rumble(0.35, 0.5, 180, 2);
    this.effects.burst(box.pos, 0xb388ff, 18, 5, 2.5, 0.5);
  }

  /**
   * LOCKPICK, pressed. One spin of the mystery box that nobody paid for.
   *
   * It does NOT advance `totemArea.boxRolls`, which is the box's price ladder,
   * for exactly the reason _itemReroll leaves the reroll ladder alone: that
   * number is how many rolls have been BOUGHT at this shop, and an item that
   * made the next paid roll cost double would be charging the player for
   * having carried it. The item is the roll it gives, and nothing else about
   * the visit changes.
   *
   * The guard is the item's own `ready` - see ACTIVE_ITEMS.itemLockpick - so a
   * press with the box down, mid-spin, or with an item already hanging there is
   * refused before the charge is spent.
   */
  _freeBoxRoll() {
    const box = this.mysteryBox;
    if (!box.canBuy) return;
    // The carried item is excluded from the reel, which at this instant is the
    // LOCKPICK itself - so the one thing a free roll can never hand back is
    // the thing that paid for it. See shuffledPool in items.js.
    box.roll(shuffledPool(this.player.item));
    this._refreshBox();
    this.sfx.boxOpen();
    this.pad.rumble(0.35, 0.5, 180, 2);
    this.effects.burst(box.pos, 0xb388ff, 18, 5, 2.5, 0.5);
  }

  // Takes whatever the box is holding out. Every path in funnels through
  // _useBox, so the swap happens in exactly one place.
  //
  // IT IS ALREADY PAID FOR, and the SLOT is the only other thing it costs.
  // A player who lets it sink back has lost the roll and nothing else - the
  // box will sell them another one the moment the lid shuts.
  //
  // The TOTEMS are left standing: the wave is still waiting on them. So is the
  // BOX, unlike the pedestal it replaced - it is never spent, and a shut box
  // standing behind a taken item reads as exactly what it is, which is a box
  // that can be paid again.
  _grabBox() {
    const box = this.mysteryBox;
    const id = box.take();
    if (!id) return;
    const def = ACTIVE_ITEMS[id];
    this.player.giveItem(id);

    this._killPos.set(box.pos.x, 1.6, box.pos.z);
    this.effects.burst(this._killPos, def.theme, 34, 7, 2.5, 0.8);
    this.effects.shockwave(this._killPos, def.theme, 5, 0.5);
    this.effects.addShake(0.16);
    this.sfx.itemTake();
    this.pad.rumble(0.7, 0.4, 300, 3);
    // WHAT WAS TAKEN, AND NOTHING ABOUT WHAT IT COST. There is one slot, so
    // what happened to the old item was never in doubt, and a warning about a
    // choice the player has already made lands at the one moment they are
    // pleased with themselves.
    this.ui.banner(def.name + '  READY');
    this._refreshBox();
  }

  // Ticks both installations and writes the E prompt. Shooting is handled in
  // shoot(), which already has the raycast; NOTHING is claimed by walking into
  // it any more - see the note at the top of totems.js.
  _updateTotems(dt) {
    this.totemArea.update(dt, this.time, this.player.pos);
    this.mysteryBox.update(dt, this.time, this.player.pos);
    this._boxAudio();

    const use = this._useTarget();
    if (!use) {
      this.ui.setPrompt(null, false);
      return;
    }
    const [text, blocked] = this._usePrompt(use);
    this.ui.setPrompt(text, blocked);
  }

  /**
   * The box's noises, and the flash when the reel lands.
   *
   * THE BOX DOES NOT OWN THE MIXER. It raises a one-word event on the frame
   * something happened and main.js plays it, for the same reason nothing else
   * in the scene graph reaches for game.sfx: a class that did would need the
   * whole game passed into update() for the sake of six calls, and the box
   * would become the second place in the codebase that decides what a purchase
   * sounds like.
   */
  _boxAudio() {
    const box = this.mysteryBox;
    const e = box.event;
    if (!e) return;
    if (e === 'tick') {
      // Pitched off how far through the spin it is. A reel that only SLOWS
      // sounds like it is running down; one that also rises sounds like it is
      // arriving somewhere, which is the difference between a machine stopping
      // and a machine landing on an answer.
      this.sfx.boxTick(box.tickProgress);
      return;
    }
    if (e === 'reveal') {
      const def = ACTIVE_ITEMS[box.showing];
      this.sfx.boxReveal();
      this._killPos.set(box.pos.x, 2.2, box.pos.z);
      this.effects.burst(this._killPos, def.theme, 40, 8, 3, 0.9);
      this.effects.shockwave(this._killPos, def.theme, 6, 0.55);
      this.effects.addShake(0.14);
      this.pad.rumble(0.6, 0.5, 260, 2);
      return;
    }
    if (e === 'warn') {
      this.sfx.boxWarn();
      return;
    }
    if (e === 'shut') {
      // Nobody took it. The lid goes down and the box is buyable again, so the
      // sound is a door closing rather than a failure - the player lost a roll,
      // not the chance to roll.
      this.sfx.boxClose();
      this.effects.burst(box.pos, 0x93a0be, 12, 4, 1.5, 0.4);
      this._refreshBox();
    }
  }

  /**
   * What E would act on right now, or null.
   *
   * ONE RESOLVER FOR THE PROMPT AND THE KEY, so the line on screen can never
   * name something other than what the press does. Six things can be in reach -
   * three totems, two consoles and the mystery box - and several of their radii
   * overlap, so the NEAREST wins rather than whichever happened to be checked
   * first.
   *
   * @returns {?{kind: string, target: object}} kind is 'totem' | 'box' |
   *   'station'.
   */
  _useTarget() {
    let best = null;
    let bestD = Infinity;
    const consider = (hit, kind) => {
      if (!hit || hit.d2 >= bestD) return;
      bestD = hit.d2;
      best = { kind, target: hit.target };
    };
    consider(this.totemArea.usable(this.player.pos), 'totem');
    consider(this.totemArea.stationInRange(this.player.pos), 'station');
    // The box ranks with the rest: same contract, same resolver. It owns no
    // consoles, so it contributes exactly one candidate.
    consider(this.mysteryBox.usable(this.player.pos), 'box');
    return best;
  }

  /**
   * The keys a prompt names, in the language of whatever is in the player's
   * hands. ONE PLACE, for the same reason _useTarget is one place: a prompt
   * that named a key the player is not holding would be worse than no prompt.
   *
   * SHOOT stays a word in both. It is the action - shoot the thing - and the
   * button that does it is already named on the control sheet.
   */
  _useLead() {
    if (this.inputMode !== 'pad') return '<b>SHOOT</b> / <b>E</b> ';
    return cap('R2') + ' / ' + cap('triangle') + ' ';
  }

  // The prompt line for whatever USE is currently pointed at, as
  // [html, blocked].
  _usePrompt(use) {
    const t = use.target;
    const lead = this._useLead();
    if (use.kind === 'totem') {
      return [lead + 'TAKE &nbsp;·&nbsp; ' + t.offer.name, false];
    }
    if (use.kind === 'box') {
      // THE BOX SAYS WHAT THE PRESS WILL DO, and that is two different things.
      // Standing in front of an open box holding an item, the only thing worth
      // saying is the item's name; standing in front of a shut one it is the
      // price. Nothing is said at all mid-spin: the reel is the message, and a
      // prompt over it would be a line of text asking to be read at the one
      // moment the player is watching something else.
      const id = t.offered;
      if (id) return [lead + 'TAKE &nbsp;·&nbsp; ' + ACTIVE_ITEMS[id].name, false];
      if (!t.canBuy) return [null, false];
      const cost = this._boxCost();
      if (this.credits < cost) {
        return ['MYSTERY BOX &nbsp;·&nbsp; NEED $' + cost, true];
      }
      return [
        lead + 'MYSTERY BOX &nbsp;·&nbsp; ONE ACTIVE ITEM &nbsp;·&nbsp; '
        + '<span class="prompt-cost">$' + cost + '</span>',
        false,
      ];
    }
    const blocked = this._stationBlocked(t);
    if (blocked) return [STATION_TITLE[t.kind] + ' &nbsp;·&nbsp; ' + blocked, true];
    if (t.kind === 'ammo') {
      return [
        lead + AMMO_PURCHASE.name + ' &nbsp;·&nbsp; ' + AMMO_PURCHASE.detail
        + ' &nbsp;·&nbsp; <span class="prompt-cost">$' + this._ammoCost() + '</span>',
        false,
      ];
    }
    return [
      lead + 'REROLL &nbsp;·&nbsp; NEW UPGRADES &nbsp;·&nbsp; '
      + '<span class="prompt-cost">' + this._priceLabel(this._rerollCost()) + '</span>',
      false,
    ];
  }

  // True while the run is held at the wave boundary waiting for the player to
  // take one of the totems that are standing.
  _awaitingPick() {
    return this.waveState === 'intermission' && this.totemArea.active && !this.totemArea.claimed;
  }

  // Why a station can't be used, or null if it can. Shared by the prompt and
  // the purchase so the two can never disagree.
  _stationBlocked(st) {
    if (st.kind === 'ammo') {
      if (!AMMO_PURCHASE.enabled(this.player)) return 'AMMO FULL';
      if (this.credits < this._ammoCost()) return 'NEED $' + this._ammoCost();
      return null;
    }
    const cost = this._rerollCost();
    if (!this.totemArea.active || this.totemArea.claimed) return 'NOTHING TO REROLL';
    // HIGH STAKES pays the till, so the wallet is not what stands between the
    // player and a reroll - see _gambleTill. The same rule the box follows.
    if (this.player.mods.highStakes <= 0 && this.credits < cost) return 'NEED $' + cost;
    return null;
  }

  // E. Takes whatever _useTarget() says is nearest - a passive item, a roll of
  // the box, the item the box is holding, a reroll or an ammo refill - so the
  // key always does the thing the prompt on screen just said it would.
  tryUse() {
    if (this.state !== 'playing') return;
    const use = this._useTarget();
    if (!use) return;
    if (use.kind === 'totem') this._claimTotem(use.target, true);
    else if (use.kind === 'box') this._useBox(true);
    else this._useStation(use.target);
  }

  // A pellet hit a station. One purchase per STATION_SHOOT_COOLDOWN however
  // many pellets or shots land inside it, so holding the trigger on the
  // reroll console buys one reroll and not eight.
  _shootStation(st) {
    if (this.state !== 'playing' || !st.canShoot()) return;
    st.shootCd = STATION_SHOOT_COOLDOWN;
    this._useStation(st);
  }

  // Buying ammo leaves the totems standing; rerolling redraws all three,
  // because re-offering an upgrade the player just paid to replace makes the
  // reroll feel rigged.
  _useStation(st) {
    if (this._stationBlocked(st)) {
      this.sfx.denied();
      // A refusal has to be felt, or a player who cannot afford something
      // presses again and again into silence.
      this.pad.rumble(0.15, 0.5, 60, 1);
      return;
    }
    if (st.kind === 'ammo') {
      this.credits -= this._ammoCost();
      AMMO_PURCHASE.apply(this.player, this.time);
      this.sfx.buy();
    } else {
      this._payReroll(this._rerollCost());
      this.totemArea.rerolls++;
      this._presentTotems(true);
      this.sfx.reroll();
    }
    this.effects.burst(st.pos, st.color, 16, 5, 2, 0.45);
    this._refreshStations();
    // Spending at a console changes what the box says it costs relative to the
    // wallet, so its card is repriced with the labels.
    this._refreshBox();
  }

  /**
   * DEBUG: $1,000 on the 0 key.
   *
   * A TEST HOOK, not a feature. The shop, the ammo console and the mystery box
   * all cost thousands, and reaching that honestly means playing eight waves
   * before any of it can be looked at - which makes every change to any of them
   * an eight-wave round trip.
   *
   * It goes through the same door a collected orb does: `credits` up, and
   * `_creditsDirty` set so the console labels and the box's card repaint with
   * the new balance. Adding to `credits` alone would leave the shop insisting
   * the player could not afford something they now can.
   *
   * NOT gated on the autotest flag, deliberately - the whole point is to have
   * it in a normal run - but that does mean it ships. Delete this method and
   * the case that calls it to remove the cheat; nothing else refers to either.
   */
  _debugCredits() {
    if (this.state !== 'playing') return;
    this.credits += 1000;
    this._creditsDirty = true;
    this.sfx.coin();
    this.ui.banner('DEBUG  +$1,000');
  }

  /**
   * THE DEBUG PANEL, on 9. Give yourself anything; drop into any wave.
   *
   * A SECOND CHEAT THAT SHIPS, on the same terms as the credits key above and
   * for the same reason: the thing it exists to shorten is a round trip
   * through a real run. Tuning one active item used to mean playing until a
   * box happened to offer it; checking what a passive does at wave thirty
   * meant reaching wave thirty. Both are now two clicks, and the run being
   * tested is a real run rather than a test harness - which is the whole
   * point, because a harness cannot show you how the thing FEELS.
   *
   * Delete _toggleDebug, _openDebug, _closeDebug, the four handlers below,
   * the Digit9 case, the Escape branch and #debug-panel to remove it. Nothing
   * else in the game refers to any of them.
   *
   * IT PARKS THE RUN IN `paused` RATHER THAN RUNNING UNDERNEATH. The build
   * sheet deliberately does not stop the arena - reading it costs the player
   * the seconds it takes - and that argument is exactly backwards here: this
   * screen is read with a mouse, so it has to give the pointer back, and a
   * live arena the player cannot see or steer while they click through a
   * hundred tiles is a screen that kills them. `paused` is the state the game
   * already has for "frozen, still drawn", so this borrows it rather than
   * inventing a third one; `_debugOpen` is what keeps the pause SCREEN from
   * being raised over the top of it (see pause, resume and pointerlockchange).
   */
  _toggleDebug() {
    if (this._debugOpen) this._closeDebug();
    else this._openDebug();
  }

  _openDebug() {
    if (this.state !== 'playing') return;
    this._debugOpen = true;
    // Set BEFORE the pointer is released: the pointerlockchange handler reads
    // `state` to decide whether losing the pointer was a pause, and at
    // 'playing' it would raise the pause screen over this one.
    this.state = 'paused';
    this._clearInput();
    this._closeStats();
    this.pad.stopRumble();
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
    this.ui.buildDebug(this._debugPassiveDefs(), this._debugActiveDefs(), {
      passive: (id) => this._debugGivePassive(id),
      dropPassive: (id) => this._debugDropPassive(id),
      active: (id) => this._debugGiveActive(id),
      wave: (n) => this._debugJumpToWave(n),
    });
    this._debugRefresh();
    this.ui.showDebug();
  }

  _closeDebug() {
    if (!this._debugOpen) return;
    this._debugOpen = false;
    this.ui.hideDebug();
    // The driver is re-pointed by _padMenu on the next frame, but only if it
    // notices the root changed - and it cannot notice while the old root is
    // still what `_padRoot` says. Dropped here so the selection does not come
    // back on a screen the player has left.
    this._padRoot = null;
    this.menu.clear();
    // Back to 'playing' before the re-lock, for the mirror of the reason it
    // was set before the release: the handler's other branch would otherwise
    // take the panel's paused state as the pause screen's and hide that.
    this.state = 'playing';
    if (!this.autoTest) this._lock();
  }

  // The two catalogues, as the flat shape the panel draws. The id is also the
  // icon key in both pools - see the note at the head of ACTIVE_ITEMS - so
  // there is nothing to map.
  //
  // THE EFFECT LINES COME FROM THE POOL, not from a second table written for
  // this screen. A tiered passive's `effects` is a FUNCTION of the stack count
  // (see effectLines in upgrades.js), and it is resolved at ONE stack here -
  // what taking it once does, which is the question the card is answering. A
  // readout that tracked the tier owned would be a second thing the panel had
  // to rebuild on every click, to say something the tier badge already says.
  _debugPassiveDefs() {
    return Object.entries(UPGRADES).map(([id, def]) => ({
      id, name: def.name, theme: def.theme, effects: effectLines(def, 0),
    }));
  }

  _debugActiveDefs() {
    return Object.entries(ACTIVE_ITEMS).map(([id, def]) => ({
      id, name: def.name, theme: def.theme, effects: def.effects,
    }));
  }

  _debugRefresh() {
    this.ui.refreshDebug(this.player.upgrades, this.player.item, this.wave);
  }

  // A TIER AT A TIME, through the player's own takeUpgrade - so a stacking
  // passive stacks, a maxed one refuses, and every clamp that comes with an
  // upgrade (the health cap, the magazine, the gun marks) is applied exactly
  // as it is when a totem is walked into.
  _debugGivePassive(id) {
    if (!this.player.takeUpgrade(id)) return;
    // SACRIFICE ate something on the way in and left its name behind for the
    // totem's banner. There is no totem here, so the note is dropped rather
    // than left to fire on the next pick the player claims for real.
    this.player.sacrificed = null;
    this._debugRefresh();
    this.sfx.menuMove();
  }

  // ...and off again, which is the half a real run has no way to do. Dropping
  // to zero deletes the key rather than leaving a 0 behind: rebuildMods walks
  // this map, and an entry meaning "none" is a case every reader would have to
  // know about.
  _debugDropPassive(id) {
    const n = this.player.upgrades[id] || 0;
    if (n <= 0) return;
    if (n > 1) this.player.upgrades[id] = n - 1;
    else delete this.player.upgrades[id];
    this.player.rebuildMods();
    this.player.health = Math.min(this.player.health, this.player.maxHealth);
    this.player.mag = Math.min(this.player.mag, this.player.magSize);
    this.player.refreshGunMarks();
    this._debugRefresh();
    this.sfx.menuBack();
  }

  // ONE SLOT, so picking a second item throws the first away - which is the
  // rule the whole active-item system is built on, and giveItem is where it
  // lives. The panel does not get its own version of it.
  _debugGiveActive(id) {
    this.player.giveItem(id);
    this._debugRefresh();
    this.sfx.itemReady();
  }

  /**
   * DROP INTO WAVE N, NOW.
   *
   * It does not call startWave() directly. The wave the player lands in has to
   * open on a built arena, and the ONE place that is guaranteed is the idle
   * branch of _updateWave, which raises the terrain and holds the countdown
   * open until it has finished coming up. So this tears the current fight
   * down, sets the counter one short of where it is going - startWave() does
   * the ++ , the same trick the versus handover uses - and hands the run back
   * to the state machine with the clock already at zero.
   *
   * The panel closes itself on the way, because a wave starting behind a
   * screen the player is still clicking through is a wave they have already
   * lost.
   */
  _debugJumpToWave(n) {
    const wave = Math.max(1, Math.floor(n));
    this._closeDebug();
    this._clearEntities();
    this._clearDeployed();
    this.running.clear(this);
    this.queue.length = 0;
    this._pendingBuffs.length = 0;
    this.totemArea.dismiss();
    this.mysteryBox.dismiss();
    this.ui.setPrompt(null, false);
    this.player.health = this.player.maxHealth;
    // THE MATCH'S COUNTER MOVES WITH THE ARENA'S. `wave` is what the arena
    // reads and `match.wave` is what the rules read, and a jump that moved
    // only the first left the two disagreeing for the rest of the match - the
    // next handoff would set the arena straight back to where the match still
    // thought it was. Any open contest is dropped: it was fought on a wave
    // nobody is on any more.
    if (this.match) {
      this.match.wave = wave;
      this.match.contest = null;
      this.match.amnesty = false;
      this.match.eliminated = [];
    }
    this.wave = wave - 1;
    this.waveState = 'idle';
    this._waveCued = false;
    this.interT = 0;
    this.ui.banner('DEBUG  WAVE ' + wave,
      waveConfig(wave, this._themeSeed, HAVE_TYPE, this._forcedTheme).themeName);
  }

  /**
   * Debug: pin every block to one theme, or pass null to go back to the run's
   * dealt order. Takes effect on the NEXT wave, which is what makes it usable
   * with the wave jump above - set the theme, jump to the wave you want to see
   * it at, and the block that starts is the one you asked for.
   *
   * On the game object rather than in the debug panel because it is the hook
   * the browser tests drive: with ten themes being built one at a time, every
   * one of them needs to be reachable at wave 1 AND at wave 41 on demand.
   */
  setTheme(key) {
    this._forcedTheme = key && THEMES[key] ? key : null;
    return this._forcedTheme;
  }

  // The safety net, and the only pickup that is not dropped by something dying.
  //
  // Without it the drop system has a death spiral in it: low ammo means no
  // kills, and no kills means no ammo. A player who is genuinely stuck gets one
  // placed near them regardless of how the fight is going. It is deliberately
  // slow and conditional - it should feel like the game catching you, not like
  // a supply line.
  _updateReliefDrop(dt) {
    this._reliefT -= dt;
    if (this._reliefT > 0) return;
    if (this.powerups.length >= MAX_ACTIVE_PICKUPS) {
      this._reliefT = SPAWN_RETRY;
      return;
    }
    const hpFrac = this.player.health / this.player.maxHealth;
    const ammo = this.player.reserveAmmo + this.player.mag;
    const needHealth = hpFrac < RELIEF_HEALTH_FRAC;
    const needAmmo = ammo < RELIEF_AMMO;
    if (!needHealth && !needAmmo) {
      // Checked often, but the clock only starts once something is actually
      // wrong - so a comfortable player never banks relief they did not need.
      this._reliefT = 1;
      return;
    }
    // Ammo first when both are low: health with an empty gun only postpones it.
    //
    // But the ammo cap is a promise the whole drop system holds, and relief is
    // the one path that used to be able to break it - a starving player is
    // exactly the state that fires this every ten seconds, so left unchecked it
    // was the only way six ammo boxes could be on the floor at once. When the
    // cap is already reached the boxes ARE there and the player simply has not
    // walked to them, so relief falls back to health if that is also low and
    // otherwise waits.
    let kind = needAmmo ? 'ammo' : 'health';
    if (kind === 'ammo') {
      let ammoActive = 0;
      for (const p of this.powerups) if (p.typeKey === 'ammo') ammoActive++;
      if (ammoActive >= MAX_ACTIVE_AMMO) {
        if (!needHealth) {
          this._reliefT = SPAWN_RETRY;
          return;
        }
        kind = 'health';
      }
    }
    this.powerups.push(
      spawnRelief(kind, this.arena, this.player.pos, this.scene, this.effects.glowTex, this.time)
    );
    this._reliefT = RELIEF_INTERVAL;
  }

  // One kill's roll. Independent of every other kill's - there is no budget
  // and no memory; see the note above rollDrop in powerups.js.
  _rollDrop(pos) {
    if (this.powerups.length >= MAX_ACTIVE_PICKUPS) return;
    // RABBIT'S FOOT rides in as a multiplier on every category's chance, so it
    // lifts the need-adjusted odds in proportion rather than adding a flat
    // fifteen points - see the note on its entry in upgrades.js.
    const kind = rollDrop(
      this.player.health / this.player.maxHealth,
      (this.player.reserveAmmo + this.player.mag) / this.player.maxReserve,
      this._ammoActive() < MAX_ACTIVE_AMMO,
      this.player.mods.dropLuck
    );
    if (kind) this._placeDrop(kind, pos);
  }

  _ammoActive() {
    let n = 0;
    for (const p of this.powerups) if (p.typeKey === 'ammo') n++;
    return n;
  }

  // Places a drop of a KNOWN kind. The boss bleed and the relief net both know
  // what they want; only a kill has to roll for it.
  _placeDrop(kind, pos) {
    this.powerups.push(
      spawnDropAt(kind, pos, this.scene, this.effects.glowTex, this.time)
    );
    // The drop has to be findable in a fight it landed in the middle of.
    this.effects.burst(this._killPos.set(pos.x, 0.9, pos.z), 0xffe95e, 10, 3, 2, 0.5);
  }

  // A boss sheds a pickup as it crosses each health threshold. Without this a
  // forty-second boss fight would be the longest stretch in the game with no
  // resources in it at all: one kill, at the very end.
  _bossBleed() {
    const bf = this.bossFight;
    // No parts means the boss is already dead and _bossHpFrac reads 0, which
    // would trip every remaining threshold at once on a corpse.
    if (!bf || !bf.parts.length) return;
    const frac = this._bossHpFrac();
    while (bf.bleedAt < BOSS_BLEED_THRESHOLDS.length
      && frac <= BOSS_BLEED_THRESHOLDS[bf.bleedAt]) {
      bf.bleedAt++;
      const part = bf.parts[0];
      if (!part || this.powerups.length >= MAX_ACTIVE_PICKUPS) continue;
      // Need-first, like a kill's roll, but guaranteed: whichever bar is
      // emptier, and ammo when they are level - a boss fight is where the
      // reserve goes.
      const hpFrac = this.player.health / this.player.maxHealth;
      const ammoFrac = (this.player.reserveAmmo + this.player.mag) / this.player.maxReserve;
      const wantAmmo = (ammoFrac <= hpFrac || hpFrac >= 1)
        && this._ammoActive() < MAX_ACTIVE_AMMO;
      // A full bar takes no health plate - the same rule rollDrop() holds for
      // kills. With the ammo boxes already capped as well there is nothing the
      // player needs, so the threshold is spent on nothing rather than on a
      // pickup that cannot be used.
      if (!wantAmmo && hpFrac >= 1) continue;
      this._placeDrop(wantAmmo ? 'ammo' : 'health', part.pos);
    }
  }

  // The money-orb collection radius the player currently has, in metres.
  // Lodestone is the only thing that widens it.
  _magnetRadius() {
    return BASE_MAGNET_RADIUS * this.player.mods.magnetMult;
  }

  // Ticks the orbs on the floor and banks whatever the player swept up.
  //
  // The whole balance is only pushed to the HUD and the station labels when it
  // actually changed, and once for the frame however many orbs arrived: the
  // vacuum at a wave clear can deliver forty in a handful of frames, and
  // redrawing four station labels per orb is exactly the kind of thing that
  // turns a reward into a stutter.
  _updateMoney(dt) {
    // AUTO-LOOT. The wave-clear sweep, never switched off - so an orb is
    // claimed by the frame after it is thrown and the floor is never something
    // the player has to walk back over. vacuum() only ever moves an orb that is
    // not already coming, so calling it every frame costs one pass over a list
    // the update below is walking anyway.
    if (this.player.mods.autoLoot > 0) this.money.vacuum();
    const got = this.money.update(
      dt, this.player.pos, this._magnetRadius(), this._onOrb
    );
    if (got > 0) this.sfx.coin();
    if (this._creditsDirty) {
      this._creditsDirty = false;
      if (this.totemArea.active) this._refreshStations();
      // The box's card carries its own price and greys it out when the wallet
      // cannot cover it, so money landing while it is standing repaints it.
      if (this.mysteryBox.active) this._refreshBox();
    }
  }

  // AMMO AND HEALTH COME TO YOU TOO, at a fraction of the money radius. The
  // orbs are the reason the magnet exists, but a pickup lying a metre from
  // your feet while orbs fly past it into your chest reads as a bug, so the
  // same pull applies to them - shortened, because a crate is worth walking
  // for in a way that eight dollars is not.
  _magnetPickups(dt) {
    const r = this._magnetRadius() * MAGNET_PICKUP_FRACTION;
    const r2 = r * r;
    const p = this.player.pos;
    for (const q of this.powerups) {
      const dx = p.x - q.pos.x;
      const dz = p.z - q.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > r2 || d2 < 0.0004) continue;
      const d = Math.sqrt(d2);
      // Eases in with distance: barely a nudge at the edge of the radius,
      // decisive once it is close, so a pickup never looks like it is fleeing
      // toward the player from across the room.
      const pull = PICKUP_PULL_SPEED * (1 - d / r) * dt;
      const k = Math.min(1, pull / d);
      q.moveTo(q.pos.x + dx * k, q.pos.z + dz * k);
    }
  }

  // WAVE CLEAR SWEEP. Every pickup still lying in the arena is taken, the same
  // moment the money orbs come in.
  //
  // The reason is the same one the money vacuum has: a wave is over, the room
  // is empty, and making the player jog a lap of the arena to pick up the
  // crates they were too busy to reach is not a decision - it is a chore with
  // only one right answer. The drop was earned by killing the thing that
  // dropped it.
  //
  // THE PICKUPS ARE SEEN TO COME IN. The effect is banked immediately - the
  // shop reads the health and ammo the player now has, so it cannot wait on an
  // animation - but the plate itself flies into the player on the same
  // accelerating pull the money orbs use, staggered so a room full of drops
  // arrives as a stream. It used to be a one-frame particle streak standing in
  // for exactly this, which read as the pickups vanishing rather than as the
  // player taking them.
  //
  // TIMED BUFFS ARE COLLECTED BUT NOT STARTED. Rage, Fire Rate and Shield are
  // windows, and a window spent walking around a shop is a window thrown away
  // - handing them over here would have turned "you keep your drops" into "you
  // lose your best drops", which is worse than leaving them on the floor. They
  // are held in _pendingBuffs and applied by startWave(). Health and ammo have
  // no clock and are applied immediately, which is also what makes them useful
  // at the shop: the player can see what they are actually short of before
  // they spend.
  _vacuumPickups(immediate = false) {
    if (!this.powerups.length) return;
    let took = 0;
    for (const p of this.powerups) {
      if (p.dead) continue;
      // The magnet's payload is the orb sweep, which the wave clear has just
      // done anyway - so it costs nothing here and is simply consumed.
      // BANKED at a wave clear, APPLIED NOW when LODESTAR asked for it. The
      // clear banks them because the wave is over and a ten-second rage spent
      // in an empty shop is a rage the player never had; the item is pressed
      // mid-fight, where the opposite is true.
      if ((p.type.duration || p.typeKey === 'shield') && !immediate) {
        this._pendingBuffs.push(p.type);
      } else {
        p.type.apply(this.player, this.time);
      }
      // Held for the flight instead of destroyed - see the note above.
      p.absorb(Math.random() * 0.55);
      this._absorbing.push(p);
      took++;
    }
    this.powerups.length = 0;
    if (!took) return;
    // One sound for the whole sweep. Five pickup chimes on the same frame is
    // not five times the feedback, it is a click.
    this.sfx.pickupHealth();
    this.effects.shockwave(this.player.pos, 0x8affc1, 6, 0.45);
  }

  // Flies the swept-up pickups into the player and drops each one as it
  // lands. Runs whether or not a wave is in progress: the sweep fires at a
  // wave CLEAR, so every one of these frames is a shop frame.
  _updateAbsorbing(dt) {
    for (let i = this._absorbing.length - 1; i >= 0; i--) {
      const p = this._absorbing[i];
      if (!p.updateAbsorb(dt, this.player.pos)) continue;
      // A small flare where it went in - at chest height, where the pickup was
      // actually flying to, not at the feet. The old burst at the pickup's
      // former position said "something happened over there"; this one says
      // the player has it.
      this._absorbAt.set(this.player.pos.x, this.player.pos.y + 0.9, this.player.pos.z);
      this.effects.impact(this._absorbAt, p.type.color, 6, 3, 2, 0.3);
      this._absorbing.splice(i, 1);
    }
  }

  // Ticks pickups and collects any the player is standing on. Iterates
  // backwards so removals don't skip entries.
  _updatePickups(dt) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.update(dt, this.time, this.player.pos);
      if (p.dead) {
        this.powerups.splice(i, 1);
        continue;
      }
      if (p.tryPickup(this.player.pos)) {
        p.type.apply(this.player, this.time);
        // THE MAGNET. The only pickup whose effect is not on the player, so it
        // is the only one main.js has to know by name: everything on the floor
        // comes in at once, the same sweep a wave clear does.
        if (p.typeKey === 'magnet') {
          this.money.vacuum();
          this.effects.shockwave(this.player.pos, p.type.color, 9, 0.5);
        }
        this.sfx[p.type.sfx]();
        this.effects.burst(p.pos, p.type.color, 16, 4, 2, 0.5);
        p.destroy();
        this.powerups.splice(i, 1);
      }
    }
  }

  // ANTIDOTE's upside. Every poisoned enemy on the floor heals the player one
  // health a second, so the deal turns a Venom build's own damage over time
  // into a second health bar - and is worth almost nothing to a build that
  // cannot poison anything, which is the trade it is priced at.
  //
  // Accumulated as a float and spent in whole points, the same shape Ammo
  // Fabricator uses: at one enemy the rate is under a point a frame, and
  // truncating per frame would pay out nothing at all.
  _poisonLeech(dt) {
    const rate = this.player.mods.poisonLeech;
    // The full-health test that used to sit here is gone: see the note at
    // BLOOD FROM STONE above. What does not fit is OVERDRAW's, and heal() is
    // where that is decided.
    if (rate <= 0) return;
    let poisoned = 0;
    for (const e of this.enemies) {
      if (!e.dead && e.status.poison > 0) poisoned++;
    }
    if (!poisoned) return;
    this._leechAcc = (this._leechAcc || 0) + rate * poisoned * dt;
    if (this._leechAcc < 1) return;
    const whole = Math.floor(this._leechAcc);
    this._leechAcc -= whole;
    this.player.heal(whole);
  }

  // Splitter death: three weaker, faster, smaller chasers worth nothing, but
  // carrying a small flat bounty - see SPLIT_CHILD_CREDITS. They go to
  // _pendingSpawns, not straight into the enemy list - see _updateEnemies.
  _splitInto(e) {
    for (let i = 0; i < 3; i++) {
      const angle = ((Math.PI * 2) / 3) * i + Math.random() * 0.5;
      const spawnPos = new THREE.Vector3(
        e.pos.x + Math.cos(angle) * 1.5,
        0,
        e.pos.z + Math.sin(angle) * 1.5
      );
      const mini = new Enemy(
        'chaser', spawnPos,
        this._cfg.hpScale * 0.5, this._cfg.speedScale * 1.1, this._cfg.dmgScale * 0.7
      );
      mini.value = 0;
      mini.bounty = SPLIT_CHILD_CREDITS;
      mini.group.scale.setScalar(0.6);
      this.scene.add(mini.group);
      this._pendingSpawns.push(mini);
    }
  }

  _updateEnemies(dt) {
    const ctx = this._enemyCtx;
    ctx.time = this.time;
    ctx.beat = this.music.beat;
    ctx.level = this.music.level;
    // Fire ticks twice a beat and poison once, both off this edge - see
    // Enemy._tickStatus and Music.pulse.
    ctx.pulse = this.music.pulse;
    ctx.pulseWhole = this.music.pulseWhole;
    // Re-read every frame, never captured: rebuildMods() replaces the whole
    // mods object on each draft pick, so a reference taken once would be the
    // pre-upgrade block for the rest of the run.
    ctx.mods = this.player.mods;

    // ---- THE LURE ---------------------------------------------------------
    //
    // ORGAN GRINDER, and this block is the entire implementation of it as far
    // as the roster is concerned. Not one enemy type, ai(), boss or projectile
    // was told the item exists: enemy.js reads exactly two things off
    // `ctx.player` - a position and an eye to aim at - so handing it a monkey
    // that has both makes forty behaviours walk toward a toy, shoot at a toy
    // and swing at a toy, correctly, for free. See Monkey.decoy in js/deploy.js.
    //
    // THE THREE PLAYER HOOKS GO WITH IT. Swapping the position alone would have
    // the crowd gather round the monkey and then land its melee on the player
    // standing thirty metres away, because reach is measured against
    // `ctx.player` and damage is dealt through a callback that never asked.
    // "Completely ignoring the player" has to mean all four.
    //
    // ENEMY ROUNDS ALREADY IN THE AIR ARE NOT RECALLED, deliberately. They were
    // fired at the monkey and they fly to the monkey; a player who wanders
    // through one is hit by it, because a bullet does not know who it was for.
    // That is the one way the lure can still cost you, and it is a fair one.
    //
    // THE NAV GRID IS DROPPED FOR THE DURATION. It is flooded from the PLAYER's
    // position, so steering off it would route the crowd politely around every
    // pillar on their way to where the player is standing. Straight-line
    // heading instead - the Bee's rule, for the Bee's reason - and the obstacle
    // resolve still slides them along whatever they walk into.
    const lure = this._findLure();
    this._lure = lure;
    ctx.player = lure ? lure.decoy : this.player;
    ctx.onHitPlayer = lure ? NO_HIT : this._onHitPlayer;
    ctx.applyPlayerStatus = lure ? NO_STATUS : this._onPlayerStatus;
    ctx.pullPlayer = lure ? NO_PULL : this._onPullPlayer;
    ctx.nav = lure ? null : this.nav;
    ctx.navBig = lure ? null : this.navBig;

    // Refresh the route to the player once for the whole list, before anyone
    // reads it. The grid throttles itself; this call is cheap on most frames.
    if (!lure) {
      // Feet, not eyes - player.pos.y is the surface being stood on. The
      // flood is seeded from the player's cell and a cell picked at the wrong
      // height is a cell nothing can reach, which empties the whole field.
      this.nav.update(dt, this.player.pos.x, this.player.pos.z, this.player.pos.y);
      if (this._bigAlive > 0) {
        this.navBig.update(dt, this.player.pos.x, this.player.pos.z, this.player.pos.y);
      }
    }

    // Update everything first, then compact. Doing both in one pass would let
    // an enemy read half-compacted neighbours and feel the same one twice
    // while resolving crowding.
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) list[i].update(dt, ctx);
    this._poisonLeech(dt);

    let write = 0;
    let big = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.dead) {
        if (e.radius > 0.8) big++;
        list[write++] = e;
        continue;
      }
      this.kills++;
      // Splitter children are worth 0, so they extend the chain without
      // paying for it. They still drop a little money - see
      // SPLIT_CHILD_CREDITS - because they are three bodies you have to stop
      // and deal with.
      this._bumpCombo();
      // KILLED WITH THE GUN ITSELF, tagged by _meleeStrike. It rides on top of
      // the combo rather than replacing it: a melee kill inside a chain is
      // worth the chain AND the double, which is the whole reason to walk into
      // something rather than shoot it.
      const meleeMult = e.meleeKill ? MELEE_KILL_MULT : 1;
      // BLOODSPORT. Beside the credit double and off the same flag, so the two
      // rewards for the same act can never disagree about what a melee kill is.
      // Only ever a heal - a swing that took the body down at full health pays
      // nothing, which is correct: what it is buying back is the hit the player
      // took walking into reach.
      if (e.meleeKill && this.player.mods.meleeHeal > 0) {
        this.player.heal(this.player.mods.meleeHeal);
        this.effects.shockwave(this.player.pos, 0xc62828, 2.8, 0.35);
        this.effects.impact(e.pos, 0xff2d6f, 10, 4, 2.5, 0.4);
      }
      // MONEY IS NOT AWARDED HERE ANY MORE. The kill drops orbs where it died
      // and the balance moves when the player picks them up - see _collectOrb.
      // THE KILL CHAIN IS NOT IN THIS LINE. It used to multiply the bounty by
      // up to three and that is exactly what made stockpiling a wave the best
      // way to earn - see comboMult. What multiplies a kill now is the melee
      // double here and, inside _dropMoney, the flawless streak: both are
      // decided by how the player is playing rather than by how long they
      // waited to start.
      // A flat bounty wins over the value-derived figure where one is set -
      // see Enemy.bounty. The melee double rides on both.
      // PAYDAY. A flat hundred a body, dropped as orbs like every other credit
      // in the game rather than banked straight into the balance - the money
      // economy is a thing on the FLOOR, and a payout that skipped the floor
      // would be the one source the magnet, LODESTONE and AUTO-LOOT never see.
      //
      // It is added to the bounty rather than dropped separately so it goes
      // through the same creditMult and flawless streak everything else does,
      // which is what keeps the card's "+$100" a number the player can check
      // against the orbs that actually land.
      const payday = this.player.mods.killCredits;
      const bounty =
        (e.bounty !== null ? e.bounty : e.value * CREDITS_PER_VALUE) + payday;
      const paid = this._dropMoney(e.pos, bounty * meleeMult);
      // KILL STREAK. Twenty bodies since the last hit taken - the counter is
      // reset by _hurtPlayer, so this is a stretch of good play inside a wave
      // rather than a whole clean wave, which is what NO-HIT BONUS already pays.
      if (this.player.mods.killStreak > 0) {
        this.player.cleanKills++;
        if (this.player.cleanKills >= this.player.mods.killStreak) {
          this.player.cleanKills = 0;
          this.player.heal(this.player.mods.streakHeal);
          this.player.reserveAmmo = Math.min(
            this.player.maxReserve, this.player.reserveAmmo + this.player.mods.streakAmmo
          );
          this.sfx.pickupHealth();
          this.ui.flashReserve();
          this.ui.banner('KILL STREAK');
          this.effects.shockwave(this.player.pos, THEME_KILLSTREAK, 5, 0.45);
        }
      }
      // WHAT THE ITEM IS OWED FOR IT, held against the orbs just thrown.
      // Deliberately read off `value` and not off the bounty: the melee double
      // and the flawless streak are MONEY, and money is not what charges an
      // item. A split child has a value of zero and so is worth nothing here,
      // which is the right answer - it is a fragment of a kill already paid
      // for, and its orb is the cheapest one in the game.
      //
      // A BOSS PART PAYS NOTHING HERE. Its value was already handed over as its
      // health bar fell - see _bossChargeDrain - and paying again at the death
      // would be paying twice for the same fight.
      if (!e.boss) this._bankKillCharge(e.value, paid);
      this.player.onKill(this.time);
      // BODY COUNT's stack, and anything else that ever counts kills. Walked
      // rather than dispatched - see RunningItems.onKill.
      this.running.onKill(this);
      if (this.player.mods.ammoOnKill > 0) {
        this.player.reserveAmmo = Math.min(
          this.player.maxReserve,
          this.player.reserveAmmo + this.player.mods.ammoOnKill
        );
      }
      // THE BODY COMES APART. There is no particle burst on a kill any more.
      //
      // The old one was twenty-four generic sparks - the same burst() sixteen
      // other things in the game fire, at its loudest setting - so a death
      // read as "the generic effect happened" rather than as that enemy dying,
      // and it was doing all the work of covering a body that left the scene
      // on the very frame it died. The body is thrown apart instead: same
      // shape, same colour, same silhouette, and no new geometry at all.
      this._corpse(e);
      this.sfx.kill(e.radius);
      // A tick per body, sized by the body. Same priority as the shot that
      // caused it, so the two blend into one event rather than fighting.
      this.pad.rumble(0.2 + Math.min(0.5, e.radius * 0.4), 0.3, 70, 1);
      // Loot falls where the thing died. Boss parts are excluded: the boss
      // pays out by bleeding at health thresholds and by the kill bonus, and
      // letting the final part roll as well would double-pay the same kill.
      if (!e.boss) this._rollDrop(e.pos);
      else this._bossDeathPos.copy(e.pos);
      // Blast Corpse and Incendiary's spread both need the enemy list intact,
      // so they are only noted here and played after the sweep.
      const m = this.player.mods;
      const wasBurning = e.status.burn > 0;
      const wasFrozen = e.status.freeze > 0;
      if (m.corpseDamage > 0
        || (m.burnSpread > 0 && wasBurning)
        || (m.ashPower > 0 && wasBurning)
        || (m.shatterDamage > 0 && wasFrozen)) {
        this._recordDeath(e.pos, wasBurning, wasFrozen);
      }
      if (e.type === 'splitter') this._splitInto(e);
      // What a type leaves behind when it dies - a husk's cloud of gas. Called
      // with the enemy ctx, which is live and current: _updateEnemies refreshed
      // it at the top of this same frame.
      const def = ENEMY_TYPES[e.type];
      if (def && def.onDeath) def.onDeath(e, this._enemyCtx);
      // A dead boss part leaves `parts` here, inside the same sweep that would
      // push any children it split into. _updateWave reads parts.length on the
      // next frame, so it never catches the gap between the two.
      if (e.boss && this.bossFight) {
        const bi = this.bossFight.parts.indexOf(e);
        if (bi >= 0) this.bossFight.parts.splice(bi, 1);
        if (this.bossFight.parts.length > 1) {
          this.bossFight.note = 'PARTS ' + this.bossFight.parts.length;
        } else if (this.bossFight.key === 'schism') {
          this.bossFight.note = '';
        }
      }
    }
    list.length = write;
    this._bigAlive = big;
    // Children of a splitter join the roster only after the sweep, so they are
    // never visited by the loop that created them.
    for (const mini of this._pendingSpawns) {
      if (mini.radius > 0.8) this._bigAlive++;
      list.push(mini);
    }
    this._pendingSpawns.length = 0;
    if (this._deathCount > 0) this._playDeaths();
  }

  /**
   * Hands a dead enemy's body to the corpse pool.
   *
   * Ownership of the group and of the per-instance materials passes with it -
   * the pool removes the one from the scene and disposes the other when the
   * corpse retires - so nothing here may call e.dispose() afterwards. What
   * CANNOT wait is released now: pooled telegraph marks go back, and the hit
   * sphere stops pointing at an enemy that is no longer in the roster.
   *
   * The hit sphere is taken off the group as well. Nothing raycasts a corpse
   * (the shot builds its target list from the live roster), but a sphere
   * tumbling through the wreckage with a stale back-reference on it is a trap
   * laid for the next person to add a scene-wide raycast.
   *
   * `force` is the enemy's own scale, so a tank comes apart harder than a
   * chaser and a boss part harder still.
   */
  _corpse(e) {
    e.release();
    e.group.remove(e.hitbox);
    // Sized to the body doing it - the type's model scale, which is not kept
    // on the instance. SUB-LINEAR AND CAPPED, though: a colossus is 3.2 times
    // a chaser, and throwing its parts 3.2 times as hard would leave them
    // still airborne when the corpse's life ran out, shrinking away in mid-air
    // instead of landing. The root curve keeps a tank heavier than a chaser
    // while holding the biggest bodies to something that settles in time.
    const def = ENEMY_TYPES[e.type];
    const force = Math.min(1.8, Math.sqrt((def && def.scale) || 1));
    this.effects.corpse(e.group, e.corpseMats(), force);
  }

  // Notes a death that owes an after-effect. Vectors are reused across frames;
  // the arrays only ever grow to the largest number of deaths seen in one
  // frame, which a wave clear bounds naturally.
  _recordDeath(pos, burning, frozen) {
    const i = this._deathCount++;
    if (!this._deathPos[i]) this._deathPos[i] = new THREE.Vector3();
    this._deathPos[i].set(pos.x, 0.9, pos.z);
    this._deathBurn[i] = burning;
    this._deathFrozen[i] = frozen;
  }

  // Blast Corpse and Incendiary's spread, played once the enemy list is whole
  // again. The corpse blast damages the player too - that is the cost of the
  // pick, and it routes through _hurtPlayer so Holy Mantle and Dead Cat see it.
  _playDeaths() {
    const m = this.player.mods;
    for (let i = 0; i < this._deathCount; i++) {
      const at = this._deathPos[i];
      if (m.corpseDamage > 0) {
        this._blast(at, m.corpseDamage, m.corpseRadius, null, true);
      }
      // Crystallize. Only a body that was still frozen when it died shatters,
      // so it is Petrify's payoff rather than a second corpse blast.
      if (m.shatterDamage > 0 && this._deathFrozen[i]) {
        this._blast(at, m.shatterDamage, m.shatterRadius, null, false);
        this.effects.shockwave(at, 0x7fe3ff, m.shatterRadius, 0.5);
        this.effects.burst(at, 0xcfeaff, 22, 6, 3, 0.5);
      }
      // Ashen leaves a ZONE rather than another instant blast - the two
      // upgrades above already own that shape.
      // A CHANCE, not a rule: with Incendiary running every corpse in a wave
      // is a burning one, and a cloud per death paved the arena.
      if (m.ashPower > 0 && this._deathBurn[i] && Math.random() < m.ashChance) {
        this._addAsh(at);
      }
      // The fire jumps to exactly one neighbour, so a burning crowd cascades
      // one enemy at a time rather than igniting the whole arena at once.
      if (m.burnSpread > 0 && this._deathBurn[i]) {
        let best = null;
        let bestD = m.burnSpread;
        for (const e of this.enemies) {
          if (e.dead || e.status.burn > 0) continue;
          const d = e.pos.distanceTo(at);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
        if (best) {
          best.applyStatus('burn', m.burnTime, this.player.dotHit * m.burnPower * m.dotPower);
          this.effects.burst(at, 0xff7a18, 8, 4, 2, 0.4);
        }
      }
    }
    this._deathCount = 0;
  }

  // Ashen. A cloud is four numbers and a drip timer, not a scene object: it is
  // drawn by the same particle pool everything else uses, so a cloud costs
  // nothing to create and nothing to dispose.
  _addAsh(pos) {
    if (this._ash.length >= MAX_ASH_CLOUDS) {
      // Recycled, so its stain has to go back to the pool with it.
      this.effects.creepRelease(this._ash.shift().creep);
    }
    const m = this.player.mods;
    this._ash.push({
      x: pos.x, z: pos.z, life: m.ashTime, maxLife: m.ashTime,
      power: this.player.dotHit * m.ashPower * m.dotPower, radius: m.ashRadius, drip: 0,
      // Friendly: the smooth shape family, the one that never hurts the
      // player. Standing in your own ash has to be visibly safe.
      creep: this.effects.creepAcquire(false),
    });
    // A cloud that faded in was easy to miss in a busy wave, so it announces
    // itself: a ring the size of the damage area, plus an upward puff where
    // the enemy fell.
    this.effects.shockwave(this._ashAt.set(pos.x, 0, pos.z), CREEP_ASH, m.ashRadius, 0.5);
    this.effects.burst(this._ashAt.set(pos.x, 0.4, pos.z), CREEP_ASH, 22, 4, 2.4, 0.8);
  }

  // HELLFIRE. One patch of the burning trail: the same four-numbers-and-a-drip
  // shape an ash cloud is, on its own list with its own cap.
  //
  // Kept apart from _ash rather than folded into it because the two are
  // different SHAPES of zone - ash is a handful of wide clouds where enemies
  // died, this is a line of small patches where the player ran - and one cap
  // over both would mean a reload mid-fight quietly evicted the clouds an
  // Ashen build had just paid for. Friendly creep, exactly like ash: standing
  // in your own fire has to be visibly safe.
  _addFire(x, z) {
    if (this._fire.length >= MAX_FIRE_PATCHES) {
      this.effects.creepRelease(this._fire.shift().creep);
    }
    const m = this.player.mods;
    this._fire.push({
      x, z, life: 2.4, power: this.player.dotHit * m.hellfirePower * m.dotPower,
      radius: m.hellfireRadius, drip: 0,
      creep: this.effects.creepAcquire(false),
    });
    this.effects.burst(this._ashAt.set(x, 0.3, z), CREEP_FIRE, 5, 1.8, 1.6, 0.5);
  }

  // Lays the trail while it is burning and runs the patches down behind it.
  // Distance-gated rather than time-gated: a player standing still after a
  // reload leaves one patch under their feet, and a player running leaves a
  // continuous line however fast they are going.
  _updateFire(dt) {
    if (this.time < this._fireUntil) {
      const dx = this.player.pos.x - this._fireLastX;
      const dz = this.player.pos.z - this._fireLastZ;
      if (dx * dx + dz * dz > FIRE_STEP * FIRE_STEP) {
        this._fireLastX = this.player.pos.x;
        this._fireLastZ = this.player.pos.z;
        this._addFire(this.player.pos.x, this.player.pos.z);
      }
    }
    for (let i = this._fire.length - 1; i >= 0; i--) {
      const f = this._fire[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.effects.creepRelease(f.creep);
        this._fire.splice(i, 1);
        continue;
      }
      this.effects.creepSet(f.creep, f.x, f.z, f.radius, CREEP_FIRE, Math.min(1, f.life));
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - f.x;
        const dz = e.pos.z - f.z;
        if (dx * dx + dz * dz > f.radius * f.radius) continue;
        // IT SETS FIRE. It used to deal its own damage-per-second, which made
        // the trail a third fire system with its own rate, unrelated to the
        // burn the same passive item's bullets apply and unrelated to the
        // music. Now standing in it burns you, on the beat, like every other
        // fire in the game - one system, one number, one rhythm.
        //
        // Re-applied every frame an enemy is inside: applyStatus refreshes
        // rather than stacking, so this tops the timer up for as long as they
        // stand in it and lets it run down the moment they leave.
        e.applyStatus('burn', FIRE_ZONE_BURN, f.power);
      }
      // A third the rate a pool drips at: there can be twenty of these on the
      // floor at once, and at the pool's rate one reload would stand a couple
      // of hundred particles up in the shared buffer.
      f.drip -= dt;
      if (f.drip <= 0) {
        f.drip = 0.4;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * f.radius;
        this.effects.burst(
          this._ashAt.set(f.x + Math.cos(ang) * r, 0.25, f.z + Math.sin(ang) * r),
          CREEP_FIRE, 2, 1.2, 1.5, 0.7
        );
      }
    }
  }

  // Runs the clouds down and sets fire to whatever is standing in one. The
  // burn is refreshed for as long as they are inside and runs down once they
  // leave, so walking through the edge of a cloud still costs an enemy far
  // less than being pushed into the middle of it.
  _updateAsh(dt) {
    for (let i = this._ash.length - 1; i >= 0; i--) {
      const a = this._ash[i];
      a.life -= dt;
      if (a.life <= 0) {
        this.effects.creepRelease(a.creep);
        this._ash.splice(i, 1);
        continue;
      }
      // The stain IS the warning now. It fades over the last second so the
      // ground going clean is what says the cloud has burnt out.
      this.effects.creepSet(
        a.creep, a.x, a.z, a.radius, CREEP_ASH, Math.min(1, a.life)
      );
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - a.x;
        const dz = e.pos.z - a.z;
        if (dx * dx + dz * dz > a.radius * a.radius) continue;
        // Ash BURNS, on the same terms the trail does - see _updateFire.
        e.applyStatus('burn', FIRE_ZONE_BURN, a.power);
      }
      // The cloud has to READ as a zone you keep enemies out of: three dark
      // red specks every fifth of a second vanished against the floor. It now
      // drips brighter embers, twice as often, with real height on them, and
      // gets two emissions per drip: one anywhere inside the disc,
      // and one pinned near the RIM, which is what actually draws the edge of
      // the damage area. Rates are held where eight clouds at once still fit
      // inside the shared particle pool, and the edge is drawn with embers
      // rather than a pulsing shockwave because that ring pool is four deep
      // and shared with melee and blasts.
      // Embers on top of the stain, at half the old rate. They used to be the
      // only thing marking the cloud, which is why there were so many of them;
      // now they are texture over a mark the player can already see, and eight
      // clouds' worth at the old rate was a third of the particle buffer.
      a.drip -= dt;
      if (a.drip <= 0) {
        a.drip = 0.2;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * a.radius;
        this.effects.burst(
          this._ashAt.set(a.x + Math.cos(ang) * r, 0.35, a.z + Math.sin(ang) * r),
          CREEP_ASH, 3, 1.5, 1.8, 0.9
        );
      }
    }
  }

  // ---- player-facing hazards ---------------------------------------------

  /**
   * A lingering zone the PLAYER has to walk out of. Same data-only shape as an
   * ash cloud, and recycled the same way: the oldest of its OWN kind goes
   * rather than the newest being refused, so the patch an enemy just laid down
   * always exists.
   *
   * @param {string} kind 'pool' (a blight's lob) or 'lava' (a magma's trail).
   *   It picks the cap, the colour and how loudly the zone announces itself -
   *   a pool lands once and has to be noticed, a trail patch is one of twelve
   *   and a splash per drop would be a strobe.
   */
  _addHazard(x, z, radius, life, dps, kind = 'pool') {
    const k = HAZARD_KINDS[kind] || HAZARD_KINDS.pool;
    const cap = k.cap;
    let n = 0;
    for (const h of this._hazard) {
      if (h.kind === kind) n++;
    }
    if (n >= cap) {
      for (let i = 0; i < this._hazard.length; i++) {
        if (this._hazard[i].kind !== kind) continue;
        this._releaseHazard(this._hazard[i]);
        this._hazard.splice(i, 1);
        break;
      }
    }
    this._hazard.push({
      x, z, radius, life, maxLife: life, dps, kind, acc: 0, drip: 0, tick: 0,
      // Hostile, always: everything in this list is something the player has
      // to get out of, and the jagged shape family is what says so before any
      // colour is read.
      creep: this.effects.creepAcquire(true),
      // A GAS CLOUD IS BOTH. The stain on the floor says where the edge is -
      // the one question a player standing in it needs answered - and the
      // cloud above it is what makes the thing visible from across the arena
      // and impossible to mistake for one more pool. Neither half does the
      // whole job: a cloud with no footprint has no edge you can trust, and a
      // footprint with no cloud is invisible the moment you are inside it.
      cloud: k.cloud ? this.effects.cloudAcquire() : -1,
      // A SOLID hazard puts a real box in the arena. Pushed onto BOTH lists
      // deliberately: `obstacles` is what bodies are resolved out of and
      // `ground` is what shots stop against, and a pillar that stopped one and
      // not the other would be either a wall you can shoot through or cover
      // you can walk through. The nav grid is NOT rebuilt for it - a column
      // stands for three seconds and re-flooding the field for that would cost
      // more than the pathing it would fix; enemies bump into it and are
      // resolved out, which is what the resolver is for.
      box: k.wall ? this._raiseWall(x, z, k.wall) : null,
    });
    const color = k.color;
    this._ashAt.set(x, 0.1, z);
    if (kind === 'lava' || kind === 'frost') {
      // A few embers - or a few flakes - where it fell. No ring: a trail
      // walker drops one of these twice a second and a shockwave per drop
      // would spend the whole ring pool.
      this.effects.burst(this._ashAt, color, 6, 1.6, 1.4, 0.5);
      return;
    }
    // A pool lands as a splash, so the moment the ground turns is visible even
    // if the player is looking somewhere else when it is thrown.
    this.effects.shockwave(this._ashAt, color, radius, 0.45);
    this.effects.burst(this._ashAt, color, 16, 3, 1.2, 0.6);
  }

  // An enemy puts a status on the player. The one door for it, so anything
  // that should ever be able to refuse one - a passive item, a boss phase, a
  // difficulty setting - has exactly one place to go.
  //
  // NOT gated on the dodge or the ward. Those two are about a BLOW landing,
  // and every status in the game arrives with its own blow or its own visible
  // area: a cinder's touch already went through _hurtPlayer and was already
  // dodgeable there, and a howler's scream is answered by leaving the ring
  // rather than by a roll of Evasion. Making the ward eat a fear as well would
  // spend a once-per-wave charge on something the player could simply walk out
  // of, and they would never know it had.
  _afflictPlayer(kind, secs) {
    if (this.state !== 'playing') return;
    if (this.time < this.player.invulnEnd) return;
    this.player.applyStatus(kind, secs);
  }

  // Frees whatever decoration a hazard was holding. Both pools hand out
  // handles that must come back, and a hazard can hold one of each.
  _releaseHazard(h) {
    this.effects.creepRelease(h.creep);
    if (h.cloud >= 0) this.effects.cloudRelease(h.cloud);
    if (h.box) this._dropWall(h.box);
  }

  // The two halves of a solid hazard. Kept together and kept tiny, because the
  // only thing that can go wrong here is a box that goes in and never comes
  // out - a permanent invisible pillar in the middle of the arena that nobody
  // could explain and no test would look for.
  _raiseWall(x, z, w) {
    const box = new THREE.Box3(
      new THREE.Vector3(x - w.r, 0, z - w.r),
      new THREE.Vector3(x + w.r, w.h, z + w.r)
    );
    this.arena.obstacles.push(box);
    this.arena.ground.push(box);
    return box;
  }

  _dropWall(box) {
    let i = this.arena.obstacles.indexOf(box);
    if (i >= 0) this.arena.obstacles.splice(i, 1);
    i = this.arena.ground.indexOf(box);
    if (i >= 0) this.arena.ground.splice(i, 1);
  }

  // Runs the pools down and bleeds the player for standing in one.
  //
  // Damage goes through _hurtPlayerDot, NOT _hurtPlayer - see the note there.
  _updateHazard(dt) {
    for (let i = this._hazard.length - 1; i >= 0; i--) {
      const h = this._hazard[i];
      h.life -= dt;
      if (h.life <= 0) {
        this._releaseHazard(h);
        this._hazard.splice(i, 1);
        continue;
      }
      const k = HAZARD_KINDS[h.kind] || HAZARD_KINDS.pool;
      const fade = Math.min(1, h.life);
      const dx = this.player.pos.x - h.x;
      const dz = this.player.pos.z - h.z;
      this.effects.creepSet(h.creep, h.x, h.z, h.radius, k.color, fade);
      // The cloud rides the same fade as the stain under it, so the air
      // clearing and the floor clearing are one event. The player's distance
      // goes with it: a cloud thins out as it is walked into, or the inside of
      // one is a green screen with the arena behind it - see cloudSet.
      if (h.cloud >= 0) {
        this.effects.cloudSet(
          h.cloud, h.x, h.z, h.radius, k.color, fade, Math.hypot(dx, dz)
        );
      }
      // Only while the player is on the ground. A pool is something to jump
      // out of as much as to run out of.
      // ANTIDOTE. Anything POISONOUS does nothing at all - the player walks
      // through a blight's lob and a vitriol's cloud alike. Lava and frost are
      // not poison and still work, which is what keeps the deal a specialist
      // answer rather than blanket hazard immunity.
      // A WELL PULLS FROM ANYWHERE INSIDE IT, and it is checked before the
      // standing-in-it test below because it is not a damage source at all -
      // it has no dps, no status, and it works on a player in the air as well
      // as one on the floor. Being able to jump out of a gravity well would
      // make it the one hazard in the game that a single button answers.
      if (k.pull && dx * dx + dz * dz < h.radius * h.radius) {
        this._pullPlayer(-dx, -dz, k.pull * fade);
      }
      const immune = k.poisonous && this.player.mods.poisonImmune > 0;
      if (!immune && dx * dx + dz * dz < h.radius * h.radius && this.player.pos.y < 0.8) {
        // WHAT THE GROUND PUTS ON YOU. Lava sets you alight, gas poisons you,
        // frost chills you - and all three keep working after you leave, which
        // is the entire reason they are statuses and not just a damage tick.
        //
        // The rate INSIDE a patch is unchanged for the two that already had
        // one: a status that deals damage is CARVED OUT of the patch's own dps
        // rather than added on top, so standing in lava costs what it always
        // cost. What is new is the tail. That tail is what makes leaving early
        // worth something, and it is why walking straight through a pool is no
        // longer free.
        let dps = h.dps;
        if (k.status) {
          this.player.applyStatus(k.status, k.secs);
          if (k.carve) dps = Math.max(0, dps - PLAYER_STATUS[k.status].dps);
        }
        h.acc += dps * dt;
        h.tick -= dt;
        if (h.acc >= 1 && h.tick <= 0) {
          const whole = Math.floor(h.acc);
          h.acc -= whole;
          h.tick = 0.34;
          this._hurtPlayerDot(whole);
        }
      }
      // One emission per drip rather than the ash cloud's two: four pools
      // running at once is already 77 particles standing in the buffer, and
      // unlike ash these are always on screen, right where the player is
      // looking. A trail patch drips a third as often again, because there can
      // be two dozen of those and at the pool's rate one magma would stand a
      // couple of hundred particles up in the shared buffer on its own.
      h.drip -= dt;
      if (h.drip <= 0) {
        h.drip = h.kind === 'lava' ? 0.42 : 0.14;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * h.radius;
        this.effects.burst(
          this._ashAt.set(h.x + Math.cos(ang) * r, 0.3, h.z + Math.sin(ang) * r),
          h.kind === 'lava' ? 0xff8c1a : 0x7ac943, 3, 1.2, 1.4, 0.8
        );
      }
    }
  }

  // Damage over time on the PLAYER. Deliberately not _hurtPlayer.
  //
  // A pool deals its damage in one-point ticks several times a second, and
  // every one of those going through the normal path would roll Evasion sixty
  // times a minute and, worse, spend Holy Mantle's ward - a charge meant to
  // eat one real hit - on a single point of pool damage. So this is the one
  // place damage bypasses the ward, on purpose. It still counts toward the
  // flawless bonus and still ends the run.
  _hurtPlayerDot(d) {
    if (this.state !== 'playing') return;
    // Same rule as _hurtPlayer: a handoff belongs to neither player, and a
    // burn carried into one must not tick against the body while it is
    // changing hands. The statuses themselves are part of the snapshot, so the
    // incoming player still gets their own back.
    if (this._pass) return;
    // Eternal Affliction's drawback and Blood Pact's, in that order. Neither
    // touches the ward or Evasion, for the reason in the comment above.
    d *= this.player.mods.hazardMult * this.player.incomingMult
      * this.player.itemTakenMult;
    // A pool bleeds a point at a time several times a second, so it is a slow
    // and completely reliable way to lose a Carnage chain. That is correct:
    // standing in fire is being hit.
    this.player.clearCarnage();
    // KILL STREAK's counter goes with Carnage's, for the same reason: standing
    // in fire is being hit, and the card says "without taking damage".
    this.player.cleanKills = 0;
    const h = this.player.takeDamage(d, this.time);
    // Standing in fire is being hit, for the streak as much as for Carnage.
    this._noteDamage();
    // Throttled, and NO LONGER THE DAMAGE FLASH. The fire and poison layers are
    // up for as long as the player is burning or poisoned - driven every frame
    // in the HUD sync, see Ui.setStatusFx - so the screen is already saying
    // what this is. Cracking the frame on top of that would say "you were hit"
    // several times a second for something that is not a hit.
    //
    // The sound and the camera flinch still fire, still throttled, because
    // those are what say a tick LANDED: a layer that is continuously up cannot
    // mark a moment, and a flinch on every tick really would be a strobe.
    if (this.time - (this._lastDotFx || 0) > 0.5) {
      this._lastDotFx = this.time;
      this.sfx.hurt();
      this.rig.cueDamage();
    }
    if (h > 0) return;
    if (this.player.livesUsed < this.player.mods.extraLives) {
      this.player.livesUsed++;
      this.player.health = 1;
      this.player.shield = 40;
      this.player.shieldEnd = this.time + 3;
      this.effects.shockwave(this.player.pos, 0xff2d6f, 6, 0.5);
      this.effects.burst(this.player.eyeInto(this._killPos), 0xff2d6f, 40, 7, 3, 0.9);
      this.ui.banner('NINE LIVES');
      return;
    }
    // Left to the loop, for the reason spelled out at the end of _hurtPlayer:
    // this runs from inside _updateHazard's walk of the pool list, and the
    // teardown a death brings with it empties that list mid-walk.
  }

  // A telegraphed impact: a circle on the floor that fills, then detonates.
  // Not a projectile - it never touches the projectile pool - and it holds a
  // telegraph handle for its whole life, released when it goes off.
  _addMortar(x, z, radius, delay, damage) {
    if (this._mortars.length >= MAX_MORTARS) return;
    this._mortars.push({
      x, z, radius, delay, damage, t: 0, mark: this.effects.markAcquire(),
    });
  }

  _updateMortars(dt) {
    for (let i = this._mortars.length - 1; i >= 0; i--) {
      const m = this._mortars[i];
      m.t += dt;
      if (m.t < m.delay) {
        this.effects.markSet(m.mark, m.x, m.z, m.radius, 0xff5533, m.t / m.delay);
        continue;
      }
      this.effects.markRelease(m.mark);
      this._mortars.splice(i, 1);
      this._ashAt.set(m.x, 0, m.z);
      // A mortar IS a discrete hit that the player was shown and could have
      // walked out of, so unlike a pool it goes through the normal path and
      // the ward is allowed to eat it.
      const dx = this.player.pos.x - m.x;
      const dz = this.player.pos.z - m.z;
      const d = Math.hypot(dx, dz);
      if (d < m.radius) this._hurtPlayer(m.damage * (1 - d / m.radius), this._ashAt);
      this.effects.shockwave(this._ashAt, 0xff5533, m.radius, 0.35);
      this.effects.burst(this._ashAt, 0xff7043, 20, 6, 2.5, 0.6);
      this.effects.addShake(0.14);
    }
  }

  // Maw's drag. Capped well under the player's 10 m/s: running out of the well
  // has to stay possible, standing still in it does not.
  _pullPlayer(dx, dz, strength) {
    const d = Math.hypot(dx, dz) || 1;
    this.player.extX += (dx / d) * Math.min(5.5, strength);
    this.player.extZ += (dz / d) * Math.min(5.5, strength);
  }

  // Clears every hazard and telegraph. Called when a wave ends and on game
  // over, so a pool thrown a moment before the last enemy died does not keep
  // burning the player through the intermission.
  _clearHazards() {
    // The running items and the deployables go with the hazards, and for the
    // same reason: all three are things the last fight left lying around. A
    // BLOOD TAX still multiplying damage across a wave boundary would be a
    // buff nobody was granted, and a turret firing into the shop would be
    // furniture the player has to wait out.
    this.running.clear(this);
    this._clearDeployed();
    // Through _releaseHazard, not creepRelease: a gas cloud holds a handle on
    // the cloud pool as well, and a slot released here is a slot the next run
    // gets back. Releasing only the stain left the cluster of sprites parked
    // in the arena for the rest of the session, visible and unowned, and after
    // six of those the pool was empty and no cloud ever appeared again.
    for (const h of this._hazard) this._releaseHazard(h);
    this._hazard.length = 0;
    for (const m of this._mortars) this.effects.markRelease(m.mark);
    this._mortars.length = 0;
  }

  // Neurotoxin. Poison walks from an afflicted enemy to a clean one standing
  // near it, one jump per tick, so a packed crowd goes green in a couple of
  // seconds and a spread-out one never does. Rate-limited rather than run per
  // frame: at 60fps an untimed spread would infect a whole wave instantly.
  _updatePoisonSpread(dt) {
    const m = this.player.mods;
    if (m.poisonSpread <= 0) return;
    this._spreadCd -= dt;
    if (this._spreadCd > 0) return;
    this._spreadCd = POISON_SPREAD_INTERVAL;
    const list = this.enemies;
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      if (src.dead || src.status.poison <= 0) continue;
      for (let j = 0; j < list.length; j++) {
        const dst = list[j];
        if (dst === src || dst.dead || dst.status.poison > 0) continue;
        if (dst.pos.distanceTo(src.pos) > m.poisonSpread) continue;
        dst.applyStatus('poison', m.poisonTime * m.dotTime, this.player.dotHit * m.poisonPower * m.dotPower);
        this.effects.burst(
          this._ashAt.set(dst.pos.x, 1.0, dst.pos.z), 0x39d353, 6, 3, 1.5, 0.35
        );
        break;
      }
    }
  }

  // Reload Burst. Thrown in an even ring on the frame a reload completes, so
  // it reads as the gun venting rather than as a shot the player aimed. Each
  // shard is a projectile like any other and counts against the same cap: a
  // reload in the middle of a heavy wave throws what there is room for.
  _reloadBurst() {
    const m = this.player.mods;
    const n = m.reloadShards;
    if (n <= 0) return;
    const spin = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (this.projectiles.length >= MAX_PROJECTILES) break;
      const a = spin + (i / n) * Math.PI * 2;
      this.projectiles.push(new Shard(
        this.scene, this.effects.glowTex,
        this.player.pos.x, 1.0, this.player.pos.z,
        Math.cos(a), Math.sin(a), 16, m.reloadShardDamage, 2.2
      ));
    }
    this.effects.shockwave(this.player.pos, 0xff7043, 2.5, 0.35);
    this.effects.addShake(0.08);
  }

  /**
   * PRIMED MAG. The magazine the reload just discarded, thrown underarm.
   *
   * WHAT IT IS WORTH IS WHAT WAS LEFT IN IT - twenty damage a round, off the
   * count taken when the reload STARTED (see Player.startReload). A gun run dry
   * throws nothing at all, which is the pick: it pays for the tactical reload
   * every shooter teaches and none of them has ever rewarded.
   *
   * IT CANNOT HURT THE PLAYER. A reload is a button pressed for a different
   * reason - see the Bomb constructor.
   *
   * THE RADIUS IS FIXED AT FOUR, half SHORT FUSE's. Only the damage rides the
   * count, so a full magazine is a harder bang rather than a bigger one: a
   * blast whose REACH grew with the rounds left would make the safe distance a
   * thing the player had to compute off their own ammo counter.
   */
  _throwSpentMag() {
    const left = this.player.magOnReload;
    const per = this.player.mods.primedMag;
    if (per <= 0 || left <= 0) return;
    this.player.muzzleInto(this._killPos);
    const yaw = this.player.yaw;
    this.deploy(new Bomb(
      this, this._killPos.x, this._killPos.y, this._killPos.z,
      -Math.sin(yaw), -Math.cos(yaw), left * per, 4, false, 1.6
    ));
    this.sfx.itemMonkeyThrow();
  }

  // Moves projectiles and reacts to what they hit. Grenades handle their own
  // blast inside update(); this only spawns the impact effect and cleans up.
  _updateProjectiles(dt) {
    const ctx = this._projCtx;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      let res = pr.update(dt, ctx);
      // FIREBREAK. Tested on the same frame the projectile tests the obstacle
      // list, and after the move, so a round is stopped where the wall is
      // rather than where it was last frame. This is the ONE thing a
      // deployable reaches into another system to do, and it is what makes the
      // item a wall rather than a long thin lava patch - the player finds it
      // out by standing behind one during a shooter's volley.
      if (res === 'alive' && this._deployed.length) {
        for (const d of this._deployed) {
          if (!d.blocks || !d.blocks(pr.pos.x, pr.pos.z)) continue;
          this.effects.burst(pr.pos, 0xff9d2e, 10, 4, 2, 0.3);
          res = 'wall';
          break;
        }
      }
      if (res === 'alive') continue;
      if (res === 'hit') this.effects.burst(pr.pos, 0xff5555, 10, 4, 1, 0.3);
      // A spit paints its own landing splash inside update(), since only it
      // knows where the pool went. Everything else gets the generic impact
      // puff, tinted by what fired it rather than by a hardcoded purple - a
      // green glob that broke against a wall in violet read as a second,
      // unrelated effect.
      else if (res === 'wall') {
        this.effects.burst(pr.pos, projLook(pr.type).glow, 8, 3, 1, 0.3);
      }
      // WHAT THE ROUND LEAVES WHERE IT STOPPED. One row on the type's `proj`
      // block, read here - so PLAGUE's lesion is a stat block rather than a
      // branch, exactly as the bounce and the homing are.
      //
      // On 'hit' AND on 'wall', which is the entire enemy: a lesion's misses
      // are not free, and a round that only rotted the floor when it connected
      // would be an ordinary gunner with a rider.
      const leave = (res === 'hit' || res === 'wall') && projLook(pr.type).leave;
      if (leave) {
        this._addHazard(pr.pos.x, pr.pos.z, leave.radius, leave.life, leave.dps, leave.kind);
      }
      this.scene.remove(pr.mesh);
      this.projectiles.splice(i, 1);
    }
  }

  // Pushes state to the HUD every frame. UI caches internally, so these calls
  // are cheap when nothing changed.
  _updateHud() {
    // SOLAR's halo. Raised by any halo whose field the player is standing in,
    // consumed here and cleared, so it lapses on its own the moment they step
    // out or the enemy dies - the same refresh-and-lapse contract the
    // conduit's buff and the warden's dome keep, and for the same reason:
    // there is no state to get stuck on.
    this.ui.setHudBlind(!!this._hudBlind);
    this._hudBlind = false;
    this.ui.setWave(this.wave);
    // The boss has its own bar, so the counter reads as adds on the field
    // rather than sitting at "ENEMIES 1" for the length of a boss fight.
    const parts = this.bossFight ? this.bossFight.parts.length : 0;
    this.ui.setEnemies(this.enemies.length + this.queue.length - parts);
    if (this.bossFight) {
      const bf = this.bossFight;
      this.ui.setBoss(bf.name, this._bossHpFrac(), bf.note, bf.state);
    } else {
      this.ui.setBoss(null, 0, '', '');
    }
    // The balance is a float now - orb values are an exact split of a kill's
    // payout - so it is floored for display and for the run summary. Nothing
    // is lost: the fraction is still in the balance and still spends.
    this.ui.setCredits(Math.floor(this.credits));
    // WAR CHEST reads the balance and lives on the Player, which does not have
    // one - `credits` is Game state (see GAME_FIELDS in versus.js). Mirrored
    // across once a frame rather than reached for, because getEffectiveDamage
    // runs several times per trigger pull deep in the shot path and has no
    // business holding a reference to the game. One assignment, and the passive
    // item is worth what the corner of the screen says it is.
    this.player.balance = this.credits;
    // Beside the balance, because it is a fact about the balance: it is the
    // rate everything on the floor is being paid at. Hidden at 1x - a "x1"
    // sitting there permanently is not information.
    this.ui.setFlawless(this.flawlessMult());
    this.ui.setHealth(this.player.health, this.player.maxHealth);
    this.ui.setStamina(
      this.player.staminaFrac, this.player.staminaLow, this.player.staminaLocked
    );
    this.ui.setAmmo(
      this.player.mag, this.player.reserveAmmo, this.player.reloading > 0,
      this.player.magSize
    );
    // THE CROSSHAIR IS THE CONE. _shotSpread is an NDC half-extent, and NDC 1
    // is half the viewport, so half of it across half the height is the radius
    // in pixels the next pellet can land inside. The arms are pushed out to
    // exactly that, plus a floor so a perfectly accurate gun still has a
    // reticle rather than a dot.
    this.ui.setCrosshair(
      CROSS_MIN_GAP + this._shotSpread() * innerHeight * 0.25,
      this.player.aimT > 0.5
    );
    this.ui.setBuffs(
      // AGAINST THE WINDOW THAT WAS ACTUALLY GRANTED, not against the pickup's
      // duration. These used to divide by a hardcoded 10 and 8 - the RAGE and
      // FIRE RATE pickups' own lengths - which was right while a pickup was
      // the only thing that could set them. OVERDRIVE grants five seconds and
      // RED LINE six, so both chips opened part-drained and the bar disagreed
      // with the effect it was drawn for. `damageBoostFull` records whichever
      // window won the Math.max, so the fraction is exact for either source.
      this.player.damageBoostEnd > this.time
        ? (this.player.damageBoostEnd - this.time) / this.player.damageBoostFull : 0,
      this.player.fireRateBoostEnd > this.time
        ? (this.player.fireRateBoostEnd - this.time) / this.player.fireRateBoostFull : 0,
      this.player.shieldEnd > this.time ? this.player.shield / 50 : 0,
      this.player.shield,
      this.player.salvoEnd > this.time && this.player.mods.salvoTime > 0
        ? (this.player.salvoEnd - this.time) / this.player.mods.salvoTime : 0
    );
    this.ui.setItemBuffs(this.running.chips(this._itemChips));
    this.ui.setStatuses(this.player);
    // THE ACTIVE ITEM SLOT. Hidden entirely while nothing is carried - an empty
    // frame in the corner is a permanent question about a system the player has
    // not met yet.
    const item = this.player.item ? ACTIVE_ITEMS[this.player.item] : null;
    // TWO FRACTIONS, ONE METER. Both come off the same number - see
    // Player.itemChargeFrac - so a run without TWIN CELL simply passes a
    // second zero and the HUD has no idea the passive item exists.
    this.ui.setItem(
      this.player.item, item,
      this.player.itemChargeFrac(0), this.player.itemChargeFrac(1)
    );
    // AEGIS holds its frame for the length of its window. Both damage sinks
    // return in silence while invulnEnd is ahead, so without this the strongest
    // item in the pool is indistinguishable from a quiet few seconds.
    this.ui.setInvuln(
      this.player.invulnEnd > this.time ? (this.player.invulnEnd - this.time) : 0
    );
    // BURNING AND POISONED, on exactly the same terms: driven off the timers
    // themselves rather than flashed on a damage tick, so each is up for as
    // long as the condition is and the player can watch it end.
    this.ui.setStatusFx(this.player.status.fire > 0, this.player.status.poison > 0);
    if (this._statsHeld) this.ui.showStats(this._statActive(), this._statPassives());
  }

  // ---- held-TAB build sheet ------------------------------------------------
  //
  // Everything a run accumulates that the HUD has no room for. Held rather than
  // toggled, and the game is NOT paused underneath: a panel that stopped the
  // arena would be a timeout the player could call whenever they liked, so this
  // costs them the seconds they spend reading it.

  _openStats() {
    if (this._statsHeld || this.state !== 'playing') return;
    this._statsHeld = true;
    this.ui.showStats(this._statActive(), this._statPassives());
  }

  _closeStats() {
    if (!this._statsHeld) return;
    this._statsHeld = false;
    this.ui.hideStats();
  }

  // THE HELD ACTIVE ITEM, or null. Same shape as a passive so the sheet can
  // draw both with one function - the player thinks of them as two kinds of
  // thing they are carrying, and the panel should agree.
  _statActive() {
    const p = this.player;
    if (!p.item) return null;
    const def = ACTIVE_ITEMS[p.item];
    return {
      id: p.item,
      name: def.name,
      effects: def.effects,
      theme: def.theme,
    };
  }

  // The owned build, in the order it was picked up, carrying each upgrade's own
  // theme colour and its own effect lines so the list reads as the totems the
  // player has been walking into all run - and says what each of them did.
  _statPassives() {
    const out = [];
    for (const [id, n] of Object.entries(this.player.upgrades)) {
      const def = UPGRADES[id];
      if (!def || n <= 0) continue;
      out.push({
        id,
        name: def.name,
        // RESOLVED, because eighteen of these are FUNCTIONS of the stack count
        // rather than fixed arrays - a tiered readout, see effectLines(). The
        // sheet handed the raw property straight to the DOM builder and threw
        // the moment the player owned one of them.
        //
        // Resolved against n - 1 rather than n: step() prints "what you have
        // now -> what the next pick gives", and on a sheet of what is already
        // owned the interesting end is the one being stood on. At n - 1 a
        // single-stack passive item prints its value flat, and a stacked one
        // prints the rung below it and then the rung it is on.
        effects: effectLines(def, Math.max(0, n - 1)),
        theme: def.theme,
        tier: n,
      });
    }
    return out;
  }

  // The frame. See the FRAME ORDER note at the top before reordering anything.
  _loop(now) {
    // CLAMPED AT BOTH ENDS. The ceiling is the stalled-tab guard it always
    // was; the floor is the one that cost an afternoon. A frame served a
    // timestamp behind the last one - a tab coming back, a clock stepping, a
    // renderer handing rAF an older `now` - makes dt negative, and a negative
    // dt does not merely stall the game: it RUNS IT BACKWARDS. `this.time`
    // walks below zero, and every deadline in the run is a game-time number
    // compared with `> this.time`, initialised to 0 and meaning "not armed" -
    // invulnEnd, dodgeEnd, frozenUntil, Opening Salvo's window. Below
    // zero, all of them read as ARMED, so a run reads as invulnerable, raging,
    // and firing free ammunition, with nothing on screen to say why.
    //
    // Fixed here rather than at each of those deadlines, because the list only
    // grows and one of them will always be missed. Time not going backwards is
    // an invariant of the clock, not a thing every reader has to defend.
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;

    // THE PAD, FIRST AND IN EVERY STATE. It drives the menus as well as the
    // arena, so it cannot sit inside the `playing` branch, and anything it
    // writes into `input` has to be there before the player reads it below.
    // Real seconds, not game time: a menu still has to repeat on a paused game.
    this._padUpdate(dt);

    if (this.state === 'playing') {
      // Game time only advances while playing, otherwise a long pause would
      // silently burn through buff timers and pickup lifetimes.
      this.time += dt;
      if (this.emptyClickCd > 0) this.emptyClickCd -= dt;
      if (this.comboTimer > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) this.comboKills = 0;
      }
      // THE CONTROLLER PASS, on a live game. It only moves the weapon and the
      // instruments; the wave break it rides on is the ordinary one, and the
      // player below is updated exactly as on any other frame.
      if (this._pass) this._updatePass(dt);
      if (this.autoTest) this._autoInput();
      // The last argument is the combat gate: regeneration and Ammo Fabricator
      // only tick while a wave is actually running, so the wave break cannot be
      // farmed for free health or free rounds. Same test _fillRigState uses.
      const reloaded = this.player.update(
        dt, this.input, this.arena.obstacles, this.time, this.waveState === 'active'
      );
      if (reloaded) {
        this._reloadBurst();
        // The magazine seating. Two motors, briefly, low on the strong one -
        // it is a mechanism, not an impact.
        this.pad.rumble(0.25, 0.35, 90, 1);
        // HELLFIRE. The reload lights the player up for five seconds; the
        // trail itself is laid by _updateFire as they move. Armed by the same
        // one-frame signal Reload Burst rides, so a build holding both gets
        // both off one magazine.
        if (this.player.mods.hellfirePower > 0) {
          this._fireUntil = this.time + this.player.mods.hellfireTime;
          this._fireLastX = this.player.pos.x;
          this._fireLastZ = this.player.pos.z;
          this._addFire(this.player.pos.x, this.player.pos.z);
        }
        // PRIMED MAG, on the same one-frame signal, so a build holding all
        // three gets all three off one magazine.
        this._throwSpentMag();
      }
      // Double Jump and Double Dash raise one-shot flags rather than calling
      // effects themselves: player.js has no effects reference, and the same
      // split is already what reloadFinished uses.
      if (this.player.jumpFx) {
        this.player.jumpFx = false;
        this.effects.shockwave(this.player.pos, 0x82b1ff, 1.6, 0.22);
        this.sfx.melee();
        this.pad.rumble(0.3, 0.2, 80, 1);
      }
      // A slide opening. Dust at the player's feet and a short shove of the
      // pad - the one movement in the game that puts them on the floor should
      // be felt through it.
      if (this.player.slideFx) {
        this.player.slideFx = false;
        this.effects.burst(this.player.pos, 0xbfd4e6, 12, 3, 1.2, 0.45);
        this.sfx.melee();
        this.pad.rumble(0.45, 0.25, 200, 1);
      }
      if (this.player.dashFx) {
        this.player.dashFx = false;
        this.effects.shockwave(this.player.pos, 0x1de9b6, 2.2, 0.22);
        this.sfx.melee();
        // A dash is the biggest thing the player does that nothing hits them
        // for, so it is the one movement that gets a shove rather than a tick.
        this.pad.rumble(0.55, 0.3, 150, 2);
      }
      // THE ACTIVE ITEM CAME BACK. One shot on the frame the bar fills, never
      // per frame while it is full - the flag is set once inside Player.update
      // and cleared here, the same split dashFx and jumpFx use.
      //
      // It is a SOUND and not a banner because it lands mid-fight: the player
      // is looking at the crosshair, the bar is in the corner, and the only
      // channel that reaches them without taking their eyes off the room is
      // their ears. The HUD plate flashes with it for anyone who does look.
      if (this.player.itemReadyFx) {
        this.player.itemReadyFx = false;
        this.sfx.itemReady();
        this.pad.rumble(0.2, 0.45, 90, 1);
        this.ui.flashItemReady();
      }

      // THE ZOOM HAS TO REACH THE ORBS. Money is drawn as points whose pixel
      // size is computed from the field of view (see money.setViewport), so a
      // camera that narrowed without telling them would leave the orbs as the
      // only thing on screen that did not get closer when the gun came up.
      // Compared rather than written every frame: it is a uniform upload.
      if (this.camera.fov !== this._fov) {
        this._fov = this.camera.fov;
        this.money.setViewport(this.crt.sceneHeight, this._fov);
      }

      this._updateWave(dt);
      // METRONOME's gate. A whole beat - not the upbeat between two - raises
      // the flag, and letting go of the trigger drops it, which is what makes
      // the first shot of a burst wait for the NEXT beat rather than leaving on
      // one that went by while the player was reloading. See Music.pulseWhole
      // and Player.tryShoot; a run without the pick never reads either.
      if (this.player.mods.metronome > 0) {
        if (this.music.pulse !== this._metroPulse) {
          this._metroPulse = this.music.pulse;
          if (this.music.pulseWhole) this.player.beatShot = true;
        }
        if (!this.input.shoot) this.player.beatShot = false;
      }
      if (this.input.shoot) this.shoot();
      // One press is one frame of freshness: a semi-auto click made during the
      // fire cooldown is dropped, not queued.
      this.input.shootFresh = false;
      if (this.input.melee) this.tryMelee();
      // The swing in flight. Ticked AFTER the button so a press made this
      // frame lands on a later one - the strike is never simultaneous with the
      // input that asked for it.
      if (this._meleeSwing > 0) {
        this._meleeSwing -= dt;
        if (this._meleeSwing <= 0) this._meleeStrike();
      }
      // Money before the pickups: both read the player position this frame,
      // and the orbs are what the magnet radius is really about.
      this._updateMoney(dt);
      this._magnetPickups(dt);
      this._updatePickups(dt);
      // The wave-clear sweep's flight. Ticked alongside the live pickups
      // rather than inside them: these are already collected and only the
      // animation is left.
      this._updateAbsorbing(dt);
      this._updateTotems(dt);
      // Ash and the poison spread run BEFORE the enemy sweep so anything they
      // kill is collected by the sweep this frame rather than lingering a
      // frame as a dead enemy that is still being drawn.
      this._updateAsh(dt);
      this._updateFire(dt);
      this._updateHazard(dt);
      // FIRE and POISON on the PLAYER. player.update() ran the timers and put
      // the fractional damage on a tab; this is where it is paid, through the
      // same sink a hazard pool uses - throttled vignette, throttled sound,
      // Carnage broken, and the game-over path the player class cannot reach
      // on its own.
      const dot = this.player.drainStatusDamage();
      if (dot > 0) this._hurtPlayerDot(dot);
      this._updateMortars(dt);
      this._updatePoisonSpread(dt);
      // DELAYED FUSE, before the enemy sweep for the reason the ash and the
      // poison spread are: a body killed by a fuse this frame is collected by
      // the sweep this frame rather than drawn for one more.
      if (this._fuses.length) this._updateFuses(dt);
      // FEAR AURA and STATUS CONDUIT, on their own quarter-second clock.
      if (this.player.mods.fearAura > 0) {
        this._auraT -= dt;
        if (this._auraT <= 0) { this._auraT = CONDUIT_TICK; this._fearAura(); }
      }
      if (this.player.mods.conduit > 0) {
        this._conduitT -= dt;
        if (this._conduitT <= 0) { this._conduitT = CONDUIT_TICK; this._conduit(); }
      }
      // SHARED PAIN's hook, put up and taken down with the pick rather than
      // tested inside Enemy.takeDamage - which is on the hot path for every
      // point of damage in the game.
      const share = this.player.mods.sharedPain > 0;
      if (share !== this._shareOn) {
        this._shareOn = share;
        setShareHook(share ? this._onShare : null);
      }
      // GRAY MATTER. Written on the frame it changes and never again.
      const mono = this.player.mods.mono > 0;
      if (mono !== this._monoOn) {
        this._monoOn = mono;
        this.crt.setMono(mono);
      }
      // LAST BREATH's one-shot, the same split jumpFx and dashFx use: the
      // player class has no audio and no HUD to reach for.
      if (this.player.ammoFx) {
        this.player.ammoFx = false;
        this.sfx.pickupAmmo();
        this.ui.flashReserve();
        this.effects.shockwave(this.player.pos, THEME.lastBreath, 4, 0.4);
      }
      // The running items tick BEFORE the enemy sweep, so anything SUTURE
      // ENGINE heals or BODY COUNT is multiplying is already true for the
      // frame the enemies are updated in - and so an item that expires this
      // frame has handed its multiplier back before a shot can read it.
      this.running.update(this, dt);
      this._updateEnemies(dt);
      // AFTER the enemy sweep, for the same reason the ash and the poison
      // spread run before it: a turret's kill made here would be a dead enemy
      // left on the roster for a frame. It is collected next frame instead,
      // which is one frame later than a bullet's and invisible.
      this._updateDeployed(dt);
      // The pets, after the deployables and for the same reason: the LAMPREY's
      // bite can kill, and a kill made before the enemy sweep would be a body
      // the sweep collects on the frame it happened rather than a frame later.
      // One frame is invisible; walking a half-compacted roster is not.
      this._syncCompanions();
      this._updateCompanions(dt);
      this._updateProjectiles(dt);

      // The roll carries the same intensity setting as the offset - they are
      // one effect, and scaling only the translation would leave the camera
      // still rolling at full strength with the shake turned down. The player
      // rewrites rotation.z from scratch every frame, so a scale of zero here
      // simply never tilts it.
      if (this.effects.shakeAmp > 0) {
        this.camera.position.add(this.effects.shakeOffset(this._shakeV));
        this.camera.rotation.z =
          (Math.random() - 0.5) * this.effects.shakeAmp * this.effects.shakeScale * 0.04;
      }

      this._updateHud();
      // THE ONLY PLACE A DEATH IS BOOKED. The hits themselves just take the
      // health down - see the note at the end of _hurtPlayer - because the
      // teardown that follows a death (in solo the hazards, in versus the
      // whole field, through _endTurn) would be emptying the very lists the
      // sweeps above are still walking.
      //
      // NOT DURING A PASS. A versus turn that ended in a death leaves the
      // body at zero for the half second before the other run is written in,
      // and without this the same death would be booked on every frame of it.
      if (!this._pass && this.player.health <= 0) this.gameOver();
    } else if (this.state === 'menu') {
      const a = now * 0.00015;
      this.camera.position.set(Math.sin(a) * 13, 5.5, Math.cos(a) * 13);
      this.camera.lookAt(0, 1, 0);
    }

    // Outside the `playing` branch: the muffle and the rig both apply to the
    // menu, pause and death screens too, and none of those tick game time.
    // Driven by `dt` (real time, computed in every state) rather than
    // `this.time`, which stops when the simulation does.
    this.music.setMuffled(this._musicMuffled());
    // Sampled before the rig reads it, so a beat lights the room on the same
    // frame it happens rather than the next one.
    this.music.sample(dt);
    // The build runs on the beat, so it is stepped straight after the sample
    // that produced this frame's pulse and before the rig draws anything -
    // a piece landing and the light that lands with it are the same frame.
    // Outside the `playing` branch for the same reason the rig is: `dt` is
    // real time, and a build must not stall because the game is paused mid
    // wave break.
    if (this.terrain.update(dt, this.music.pulse) === 'settled') this._settleTerrain();
    this.rig.update(dt, this._fillRigState());
    this.ui.setStrobe(this.rig.flash);
    // The orbs' rim colour rides the ceiling. One uniform, read after the rig
    // has settled this frame's colour so the two are never a frame apart.
    this.money.setHouseColour(this.rig.houseColour);

    this.effects.update(dt, this.camera);
    this.crt.render(this.scene, this.camera);
  }
}

// The totem cards and station plates are drawn into canvas textures ONCE and
// then live for the rest of the run, so they cannot be drawn before the face
// they are set in has loaded - a card that rendered in the fallback would stay
// wrong until the next wave. The HUD is already using the font by this point
// in practice; this makes it a guarantee rather than a race, and boots anyway
// if the load fails so a missing font never costs the player a game.
document.fonts.load('32px "Press Start 2P"')
  .catch(() => {})
  .then(() => new Game());
