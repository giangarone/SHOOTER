// VOID ARENA - game entry point. Owns the renderer, the scene, all entity
// lists, and the frame loop. Every other module is a leaf: they never call
// back into here except through the callbacks in the ctx objects below.
//
// STATE MACHINE: 'menu' -> 'playing' <-> 'paused' -> 'gameover' -> 'playing'
// Only 'playing' simulates. The loop still runs and renders in every state,
// which is what keeps the menu camera orbiting and the pause overlay live.
//
// NO MENU EVER OPENS. The wave-end passive item choice is three totems that rise
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
import { buildArena, BOUND as ARENA_BOUND, CEIL_Y } from './arena.js';
import {
  Player, NO_HIT_CAP, MAX_SPEED, flawlessStreakMult, FLAWLESS_STREAK_CAP,
} from './player.js';
import { PLAYER_STATUS } from './status.js';
import {
  Enemy, Projectile, Grenade, Shard, MitosisFragment, Spit, ENEMY_TYPES,
  setDamageSink, setPlateSink, setShareHook, setPoisonStackCap,
  setStatusDurationBonus, projStats, projLook,
} from './enemy.js';
import { Effects } from './effects.js';
import { CrtPass } from './crt.js';
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
import {
  forcedDrop, rollDrop, spawnAnywhere, spawnDropAt, spawnRelief,
  POWERUP_TYPES, AMMO_PICKUP,
} from './powerups.js';
import { MoneyOrbs, BASE_MAGNET_RADIUS, ORB_LIFETIME } from './money.js';
import {
  PASSIVE_ITEMS, AMMO_PURCHASE, rollTotems, rerollCost, boxCost, effectLines,
  WAVETABLE,
} from './items/passive/index.js';
import { DONATION_ITEMS, donationItemKey } from './items/donation/index.js';
import { DONATION_START_CHANCE, donationChanceAfterLoss } from './donation-rules.js';
// AMMO ALCHEMIST's element bank, which lives with the donation catalogue the
// way WAVETABLE lives with the passive one - see shared.js for why.
import { ALCHEMY_ELEMENTS } from './items/donation/shared.js';

// THE SECOND POOL'S COLOURS, where a pick has an effect in the arena rather
// than only a number in the stat block. Read each item's own theme so its
// totem, icon and effect flash stay the same colour when that item is edited.
const THEME_MARK = PASSIVE_ITEMS.weakPoint.theme;
const THEME_CANNON = PASSIVE_ITEMS.cannonade.theme;
const THEME_ECHO = PASSIVE_ITEMS.echoChamber.theme;
const THEME_CHAIN = PASSIVE_ITEMS.chainFeed.theme;
const THEME_FUSE = PASSIVE_ITEMS.delayedFuse.theme;
const THEME_OVERKILL = PASSIVE_ITEMS.overkill.theme;
const THEME_FEAR = PASSIVE_ITEMS.fearAura.theme;
const THEME_CONDUIT = PASSIVE_ITEMS.statusConduit.theme;
const THEME_STAKES = PASSIVE_ITEMS.highStakes.theme;
const THEME_VITAL = PASSIVE_ITEMS.vitalTrigger.theme;
const THEME_BRUISE = PASSIVE_ITEMS.bruiseRounds.theme;
const THEME_KILLSTREAK = PASSIVE_ITEMS.killStreak.theme;
const THEME_OATH = PASSIVE_ITEMS.bloodOath.theme;
const THEME_THUNDERCLAP = PASSIVE_ITEMS.thunderclap.theme;
const THEME_LUCKY_CORPSE = PASSIVE_ITEMS.luckyCorpse.theme;
const THEME_GHOST_PLATE = PASSIVE_ITEMS.ghostPlate.theme;
const THEME_DEAD_SWITCH = PASSIVE_ITEMS.deadMansSwitch.theme;
const THEME_MITOSIS = PASSIVE_ITEMS.mitosis.theme;
// LIFE INSURANCE's payout. The item shares AEGIS's pale gold, and the claim
// wears it too: the flash says which protection saved the player.
const THEME_INSURED = ACTIVE_ITEMS.itemInsurance.theme;
// The third pool's colours, for the flashes each of them throws.
const THEME_REDHARVEST = PASSIVE_ITEMS.redHarvest.theme;
const THEME_CURTAIN = PASSIVE_ITEMS.curtainCall.theme;
const THEME_INTEREST = PASSIVE_ITEMS.highInterest.theme;
const THEME_MOVINGDAY = PASSIVE_ITEMS.movingDay.theme;
const THEME_QUORUM = PASSIVE_ITEMS.quorum.theme;
const THEME_JACKPOT = PASSIVE_ITEMS.jackpot.theme;
const THEME_MERCY = PASSIVE_ITEMS.strayMercy.theme;
const THEME_BANDAGE = PASSIVE_ITEMS.freshBandages.theme;
const THEME_GRISTLE = PASSIVE_ITEMS.gristle.theme;
const THEME_UPDRAFT = PASSIVE_ITEMS.updraft.theme;
// The donation machine's own arena colours, read off each reward's theme on
// the same terms every THEME_ above follows.
const THEME_OMEN = DONATION_ITEMS.badOmen.theme;
const THEME_GOLD_STAR = DONATION_ITEMS.goldStar.theme;
const THEME_MITE = DONATION_ITEMS.widowsMite.theme;
const THEME_KARMA = DONATION_ITEMS.karma.theme;
const THEME_SCRAP = DONATION_ITEMS.scrapMetal.theme;
const THEME_LUCKY = DONATION_ITEMS.luckyNumber.theme;
// The fourth pool's, for the flashes each of them throws.
const THEME_SYNCOPATION = PASSIVE_ITEMS.syncopation.theme;
const THEME_HEARTBEAT = PASSIVE_ITEMS.heartbeat.theme;
const THEME_POCKET = PASSIVE_ITEMS.pocketGrenade.theme;
const THEME_PRODIGAL = PASSIVE_ITEMS.prodigalRounds.theme;
const THEME_FULLLOAD = PASSIVE_ITEMS.fullLoad.theme;
const THEME_SCYTHE = PASSIVE_ITEMS.scythe.theme;
const THEME_THROATCUT = PASSIVE_ITEMS.throatCut.theme;
const THEME_BALLAST = PASSIVE_ITEMS.ballastTanks.theme;
const THEME_FLOW = PASSIVE_ITEMS.flowReload.theme;
const THEME_BEDBUGS = PASSIVE_ITEMS.bedbugs.theme;
const THEME_SPLASHBACK = PASSIVE_ITEMS.splashback.theme;
const THEME_FRUITS = PASSIVE_ITEMS.firstFruits.theme;
const THEME_JUMPER = PASSIVE_ITEMS.jumperCables.theme;
const THEME_DIME = PASSIVE_ITEMS.dimeNovel.theme;
// The fifth pool's, for the flashes each of them throws.
const THEME_POSSUM = PASSIVE_ITEMS.possum.theme;
const THEME_STARE = PASSIVE_ITEMS.deathStare.theme;
// The sixth pool's, for the flashes each of them throws.
const THEME_MAGNA = PASSIVE_ITEMS.magnaCarta.theme;
const THEME_SLIDERULE = PASSIVE_ITEMS.slideRule.theme;
const THEME_REARVIEW = PASSIVE_ITEMS.rearview.theme;
const THEME_MONSOON = PASSIVE_ITEMS.monsoon.theme;
const THEME_STIGMATA = PASSIVE_ITEMS.stigmata.theme;
const THEME_PLATED = PASSIVE_ITEMS.platedDessert.theme;
const THEME_SHUFFLE = PASSIVE_ITEMS.shuffle.theme;
const THEME_SOUL = PASSIVE_ITEMS.soulHarvest.theme;
const THEME_CLAUSE = PASSIVE_ITEMS.deathClause.theme;
const THEME_FLESH = PASSIVE_ITEMS.fleshBank.theme;
// The eighth pool's, for the flashes each of them throws. SIDECHAIN keeps
// THUNDERCLAP's blue because the two are the same verb - a flat hit on every
// body in the room - and ECHO keeps SKIPSTONE's because it IS that bounce,
// twice. LFO throws none (the sweep IS the tell) and WAVETABLE draws its
// flashes in the current element's own colour, so neither needs an entry.
const THEME_SQUARE = PASSIVE_ITEMS.squareWave.theme;
const THEME_MIDI = PASSIVE_ITEMS.midiCable.theme;
const THEME_SIDECHAIN = PASSIVE_ITEMS.sidechain.theme;
const THEME_ECHO_BOUNCE = PASSIVE_ITEMS.echo.theme;
const THEME_CHORUS = PASSIVE_ITEMS.chorus.theme;
// COLD FOOT's creep. The pale blue enemies already wear for `slow` and the
// player's own CHILLED chip is drawn in - one colour for one effect, wherever
// it is coming from, which is the rule STATUS_TINT exists to hold.
const CREEP_ICE = 0x63b3ff;
// How many patches of it may be on the floor at once, and how far the player
// has to travel to lay the next. Both are the fire trail's own numbers (see
// MAX_FIRE_PATCHES and FIRE_STEP): a sprint and a slide leave lines of the
// same grain, so a run holding COLD FOOT and SCORCHED EARTH draws two trails
// that look like one system rather than two.
const MAX_ICE_PATCHES = 20;
const ICE_STEP = 0.85;
// Seconds a patch of ice lies there. Longer than fire's 2.4 on purpose: fire
// is an event the player is meant to run through and ice is TERRAIN they are
// meant to fight around, and a wall that melted as fast as a fire burned out
// would never be there when the thing chasing them arrived.
const ICE_LIFE = 5;

// ---- MAG DUMP and FLOOR IS LAVA ------------------------------------------

// How wide the dump throws the magazine, in the same normalised screen units
// _shotSpread returns. About six times a moving player's own cone: far enough
// off the reticle that the outer rounds are a spray rather than a burst, and
// short of a full hemisphere, which would put half the magazine behind the
// player's shoulders and into the floor.
const MAG_DUMP_SPREAD = 0.5;

// FLOOR IS LAVA, in one place.
//
// The floor's whole payload is the shared fire status - ONE ledger, billed
// exactly as a cinder's touch is, because a second ground-rate account would
// be nothing but a carve of that same status: a copy to keep in step at best,
// and a bill a status immunity cannot refuse at worst.
const LAVA_FLOOR_TIME = 4;
// The nine stamps: a 3x3 grid at this spacing, each this wide. Sized so the
// ragged edges overlap well inside the arena bound rather than meeting exactly
// at it, because two creep blobs that just touch leave a seam, and a seam in
// this looks like somewhere it is safe to stand.
const LAVA_FLOOR_STEP = 13;
const LAVA_FLOOR_R = 13;
// How far off the floor is out of it. The same figure _updateHazard uses for a
// player standing in a pool, so "in it" means one thing everywhere - and it is
// what makes a jump a moment of relief here exactly as it is there.
const LAVA_FLOOR_CLEAR = 0.8;

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
  DonationMachine, DONATION_MACHINE_CONFIG,
  donationSoldOut, randomUnownedDonationItem,
} from './donation-machines.js';
import {
  ACTIVE_ITEMS, shuffledPool, rollItem, RunningActiveItems, HUMOURS,
  CHARGE_PER_VALUE, BOSS_ADD_CHARGE_CAP,
} from './items/active/index.js';
// PRIMED MAG throws the Bomb; PANIC TURRET stands the Turret up. Both are
// deployables main.js makes itself, for the same reason: they are PASSIVE
// items, and js/deploy.js's other callers are all active items.
import { Bomb, Turret } from './deploy.js';
import { MysteryBox } from './mysterybox.js';
import { NavGrid } from './nav.js';
import { TerrainSet, generateLayout, BUILD_TIME as TERRAIN_BUILD_TIME } from './terrain.js';
import { Pad, BTN, BTN_NAMES } from './pad.js';
import { MenuDriver, renderControls, cap } from './padmenu.js';
import { Keybinds, KEY_ACTIONS, PAD_ACTIONS, isPadFixed } from './keybind.js';
import { resolveCircle, groundSurface, BOSS_HEIGHT } from './utils.js';
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
// Need-weighted kills and boss milestones share this cap so a fight cannot
// fill the floor with redundant ammunition.
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
// The boss sheds ammunition as it crosses each health threshold. A boss
// fight is the longest stretch in the game with almost nothing dying in it,
// and a run of bad rolls across its few add kills would leave the player with
// nothing at all for forty seconds.
const BOSS_BLEED_THRESHOLDS = [0.75, 0.5, 0.25];

// Boss-only ammunition relief keeps an empty gun from ending a long fight.
// Existing ammo must be collected first; normal waves have no emergency
// supplies, and lost health never triggers a handout.
const RELIEF_INTERVAL = 10;
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
// cancel Reload Burst, a passive item the player paid for. Enemies stop at
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

// WHAT A HEAD IS WORTH. Double, and it is a flat double on purpose: the payoff
// for aiming somewhere smaller has to be a number the player can do in their
// head from the damage popup, or the mechanic is invisible on a roster where
// no two enemies have the same health.
//
// It is a MULTIPLIER on the round rather than a separate hit, so it composes
// with the crit family and is then read by armour like anything else - see
// _hitMult. Only the two RAYCAST paths can earn it: the pellet and the lance.
// The melee swing is an XZ cone with no impact point at all, blasts have no
// point either, and damage over time has no aim to reward - a headshot on any
// of those would be a free double the player did not do anything for.
const HEADSHOT_MULT = 2;

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
// EIGHT, AND IN THIS ORDER. The first two are the pair the mode shipped with,
// so a two-player match still looks exactly as it did; the rest are picked to
// survive the CRT filter, which eats anything close to the arena's own
// blue-grey - see crt.js. Every seat has its own hue: with eight around one
// screen the whole point of the band on the gun and the colour on the readout
// is that no two people in the room share one, and a list shorter than the
// menu would hand seats 5-8 the same colours as 1-4 while `label()` keeps
// promising they are different people.
const PLAYER_COLOR = [
  0x4ef3ff, 0xff3b30, 0x00e676, 0xffb300,
  0xff2fb0, 0xb14aed, 0x3d6bff, 0xff8a1f,
];
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
// HIVE's honey. Ticks die onto it a whole rusher wave's worth at a time, so
// the cap sits with the frost's: high enough that clearing a crowd leaves
// the ground beneath it marked, low enough that one theme's corpses cannot
// evict another theme's pools out of the shared thirty creep slots.
const MAX_HIVEBLOOD = 12;
// CATHEDRAL's hallow - consecrated ground, laid in rings by the Reliquary.
// Its own kind and not `hiveblood` for the eviction argument that separates
// every other kind: boss rings are CIRCLES of patches, and sharing a queue
// with the ticks' corpses would let another theme delete the boss's floor
// mechanic. Each patch is short-lived, so the consecration is ground that is
// sanctified THIS MINUTE rather than a permanent condition on the room.
const MAX_HALLOW = 14;
// CATHEDRAL's incense - a thurible's veil. Fewer and bigger than the bile:
// each one is a curtain of sight rather than a splatter, and a floor full of
// little patches of smoke would be a haze rather than the wall the mechanic
// is. Capped against the cloud pool the gas and the ink already share.
const MAX_INCENSE = 8;
// OBSIDIAN's edges - a knapper's blades and the Smoking Mirror's walls. Same
// cap logic as the scald's: these are SOLID, so the number is really "how
// much of the arena may be walled off at once". Three is a knapper's two in
// flight plus one standing, and the boss's pair is laid on a cooldown slow
// enough that it can never have two pairs up together.
const MAX_EDGE = 6;
// SAPPHIRE's crystal. The lapidary's seeds and the Carillon's tolls, and the
// one ground in the game that GROWS after it lands - the spread is the theme,
// so the cap has to leave room for a lapidary's seeds and a boss's rings to
// share the queue without one evicting the other's whole mechanic. Ten is two
// seeds' worth in flight plus a ring, the scald's argument at a slower pace.
const MAX_CRYSTAL = 10;
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
// HIVE's honey. No status, so it wears the theme's own amber rather than a
// status colour - the shock's rule, for the shock's reason: the patch and any
// HUD chip have nothing to agree about, so the colour says WHOSE ground it is
// instead. Deep amber rather than the glare's pale yellow, because the player
// has to tell burning honey from a lens's line in the half-second they have
// to step off one of them.
const CREEP_HIVEBLOOD = 0xffb300;
// CATHEDRAL's hallow. No status, so it wears the theme's own pale brass
// rather than a status colour - the shock's rule, for the shock's reason: the
// patch and any HUD chip have nothing to agree about, so the colour says WHOSE
// ground it is instead. It burns only while the player stands in it, which
// keeps it the honey's bargain - ground that is sanctified now, not a tail
// that follows them off it.
const CREEP_HALLOW = 0xc0a860;
// CATHEDRAL's incense. Dim and desaturated on purpose, and nearer the ink's
// economy than the gas's: what the veil takes is SIGHT, and a bright cloud
// would be a thing the player can see perfectly well through. It hangs low
// rather than standing tall - the stain on the floor is the veil's edge, the
// cloud above it is what the player cannot look through.
const CREEP_INCENSE = 0xa89a6a;
// OBSIDIAN's edge. It deals no damage and applies no status - the wall IS
// the whole payload, exactly as the scald's heat is only half of its - so it
// wears the theme's own red rather than a status colour: the patch on the
// floor says WHOSE wall this is, and the shape family says it will cost you
// to walk through it.
const CREEP_EDGE = 0xff3b30;
// SAPPHIRE's crystal. No status, so it wears the theme's own blue rather than
// a status colour - the shock's rule, for the shock's reason: the patch and
// any HUD chip have nothing to agree about, so the colour says WHOSE ground it
// is instead. Paler than the well's indigo and bluer than the frost's ice, so
// the player can tell spreading glass from either in the half-second they have
// to step off one of them.
const CREEP_CRYSTAL = 0x5bd0ff;
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
  // HIVE's honey. No status and no tail - it burns while the player stands
  // in it and stops the instant they are out, which is the entire difference
  // between it and lava: lava is ground that has been burning for a while
  // (the magma's trail) and honey is ground that is burning NOW, left where
  // something died (the tick's corpse, the borer's rush penalty, the
  // Broodmother's rings). A patch with no tail has to bite hard enough to
  // move somebody in the second they are deciding whether to bother.
  hiveblood: {
    color: CREEP_HIVEBLOOD, cap: MAX_HIVEBLOOD,
  },
  // CATHEDRAL's hallow - consecrated ground. The honey's bargain in the
  // church's coin: no status, no tail, and it stops the instant the player
  // steps off it. What separates it from honey is WHOSE it is and where it
  // comes from - a grave that opens, a ring that is laid - and the eviction
  // queue is the reason it is a row of its own.
  hallow: {
    color: CREEP_HALLOW, cap: MAX_HALLOW,
  },
  // CATHEDRAL's incense - a thurible's veil. NO damage and NO status, the
  // ink's economy walked rather than thrown: what the cloud takes is sight,
  // and only while the player is inside it. The stain on the floor is where
  // the veil ends - the one question a player standing in one needs answered
  // - and the cloud above it is the whole payload.
  incense: {
    color: CREEP_INCENSE, cap: MAX_INCENSE, cloud: true,
  },
  // OBSIDIAN's blade - a knapper's strike and the Smoking Mirror's walls.
  // The second SOLID hazard in the game, and unlike the scald it has no dps
  // at all: the wall is the entire payload, and whether it is cover or a
  // problem depends entirely on where the player was going when it went up.
  edge: {
    color: CREEP_EDGE, cap: MAX_EDGE,
    wall: { r: 1.0, h: 3.6 },
  },
  // SAPPHIRE's crystal, and the only ground in the game that GROWS. `spread`
  // is how much past its LANDING size the patch reaches, as a fraction of its
  // final radius, over `spreadSecs`: 0.76 means it lands at a little over half
  // its final size and its edge walks out to the rest. Driven by
  // _updateHazard, and the mortar or ring that placed it always drew the
  // FINAL circle - so the ground being asked about was always the ground the
  // patch is becoming, and the growth is the warning the player was already
  // given, arriving. A FRACTION rather than metres deliberately: the
  // lapidary's seeds and the Carillon's tolls share this kind at very
  // different sizes, and an absolute spread would take a toll's small patch
  // past zero.
  crystal: {
    color: CREEP_CRYSTAL, cap: MAX_CRYSTAL,
    spread: 0.76, spreadSecs: 2.0,
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
  broodmother: 'THE BROODMOTHER',
  reliquary: 'THE RELIQUARY',
  mirrorboss: 'THE SMOKING MIRROR',
  carillon: 'THE CARILLON',
};
const POISON_SPREAD_INTERVAL = 0.5;

// HOW LONG A FIRE ZONE'S BURN LASTS once an enemy steps out of it. Short on
// purpose: the zone refreshes it every frame they are inside, so this is only
// the tail - long enough that the burn survives a beat and pays out at least
// one tick for a body that walked through the edge, short enough that a trail
// is a place on the floor rather than a permanent condition applied to whatever
// once brushed it.
const FIRE_ZONE_BURN = 0.8;

// The two player-laid trails' differences, as data, so `_applyTrail` can run
// both - see it for what is shared. `duration` and `power` are functions
// because one trail's numbers are fixed while the other's are read off the
// player's mods at the moment of standing in it.
const FIRE_TRAIL = {
  creep: CREEP_FIRE,
  // IT SETS FIRE. The trail used to deal its own damage-per-second, which
  // made it a third fire system with its own rate, unrelated to the burn the
  // passive item's bullets apply and unrelated to the music. Now standing in
  // it burns you, on the beat, like every other fire in the game - one
  // system, one number, one rhythm.
  status: 'burn',
  duration: () => FIRE_ZONE_BURN,
  power: (f) => f.power,
  dripEvery: 0.4,
  burstY: 0.25,
  burst: [2, 1.2, 1.5, 0.7],
};
const ICE_TRAIL = {
  creep: CREEP_ICE,
  // IT SLOWS AND IT DOES NOT HURT. There is already one thing the player lays
  // behind them that deals damage, and a second would only be a worse version
  // of it.
  status: 'slow',
  duration: (g) => g.player.mods.coldFoot,
  power: () => undefined,
  dripEvery: 0.5,
  burstY: 0.2,
  burst: [2, 1.0, 1.4, 0.8],
};

// THE ONE-SHOT PLAYER FLAGS. player.js has no effects, no HUD and no sound,
// so a thing worth feeling raises its flag there and the loop pays it out
// here, once, and clears it - one convention, written once, instead of a
// dozen hand-spelled blocks the loop used to interleave. ROW ORDER IS THE
// FRAME'S ORDER of sound and banner, and two deliberate exceptions stay out
// of the table: UPDRAFT's wisp is true on every frame the float holds (it is
// throttled, not one-shot), and STILT LEGS' landing deals damage rather than
// announcing it. LIFE INSURANCE's claim is paid in _updateItemDeliveries, out
// of this list, because it must be drawn after the running list ends its
// window on the same frame.
//
// A flag raised mid-frame - LAST BREATH's, by a shot - is still paid on the
// frame it happened: the loop drains this table twice, see _payPlayerFx.
const PLAYER_FX = [
  ['gristleFx', (g) => {
    // A crate that also made the bar bigger - a reward with NO tell is the
    // one kind a player reports as broken: the bar grew and nothing said so.
    g.ui.banner('+1 MAX HP');
    g.effects.shockwave(g.player.pos, THEME_GRISTLE, 4, 0.5);
    g.sfx.passiveItem();
  }],
  ['shuffleFx', (g) => {
    // LOUD, because the whole build just changed: the only banner that names
    // a verb rather than a reward. Silence about it would be a bug.
    g.ui.banner('SHUFFLE');
    g.effects.shockwave(g.player.pos, THEME_SHUFFLE, 6, 0.5);
    g.effects.burst(g.player.pos, THEME_SHUFFLE, 26, 6, 2.5, 0.7);
    g.sfx.passiveItem();
    g.pad.rumble(0.5, 0.4, 180, 2);
  }],
  ['magnaFx', (g) => {
    // No banner: a bank of four is a machine the player heard every dry
    // reload for, not an event. The mag counter in the corner flashes
    // instead - the number the player is already watching is the tell.
    g.ui.flashReserve();
    g.sfx.reload();
  }],
  ['reloadFx', (g) => {
    // A reload BEGINNING down any path - the R key, a dry trigger pull, or
    // the last round going downrange. The real length, so the seating knock
    // lands on seating even under Speed Loader. Raised only by startReload();
    // the seating-edge callers above and below keep their own direct sound.
    g.sfx.reload(g.player.reloadTime);
  }],
  ['jackpotFx', (g) => {
    // BEFORE the jump flash so the two land on one frame as one event rather
    // than as a jump and then a surprise. The SOUND is the whole tell - it
    // is a 1-in-100 the player will mostly be looking away from when it fires.
    g.sfx.jackpot();
    g.ui.banner('JACKPOT');
    g.ui.flashReserve();
    g.effects.shockwave(g.player.pos, THEME_JACKPOT, 9, 0.8);
    g.effects.burst(g.player.eyeInto(g._killPos), THEME_JACKPOT, 40, 7, 3, 0.9);
    g.pad.rumble(0.8, 0.6, 200, 3);
  }],
  ['flowFx', (g) => {
    // NO BANNER, deliberately: the window is a second long and opens several
    // times a wave, and a caption each time would wipe the wave line, the
    // flawless line and the no-hit line all day. A ring at the feet and the
    // invulnerability frame the HUD already draws are the tell.
    g.effects.shockwave(g.player.pos, THEME_FLOW, 5, 0.5);
    g.sfx.pickupShield();
  }],
  ['possumFx', (g) => {
    // A banner, unlike FLOW RELOAD's quiet ring, because this one opens once
    // per health bar rather than once per magazine - and the window opens at
    // the worst moment a run has, so ten seconds of enemies walking past has
    // to read as a reprieve rather than the crowd losing interest.
    g.ui.banner('PLAYING DEAD');
    g.effects.shockwave(g.player.pos, THEME_POSSUM, 7, 0.6);
    g.sfx.death(0.35);
    g.pad.rumble(0.5, 0.5, 190, 3);
  }],
  ['jumpFx', (g) => {
    g.effects.shockwave(g.player.pos, 0x82b1ff, 1.6, 0.22);
    g.sfx.airJump();
    g.pad.rumble(0.3, 0.2, 80, 1);
  }],
  ['groundJumpFx', (g) => {
    // Smaller than the air jump in every channel: a push-off, not a burst.
    // Dust at the feet rather than a ring, and no rumble - a held key
    // bunny-hopping down a corridor must never buzz the pad.
    g.effects.burst(g.player.pos, 0xbfd4e6, 6, 2, 0.8, 0.3);
    g.sfx.jump();
  }],
  ['landFx', (g) => {
    // The dust and the rumble are gated heavier than the sound: a hop taps,
    // and only a real landing gets the floor and the pad involved.
    const s = g.player.landStrength || 0;
    g.sfx.land(s);
    if (s > 0.3) g.effects.burst(g.player.pos, 0xbfd4e6, Math.round(4 + 10 * s), 3, 1.2, 0.4);
    if (s > 0.55) g.pad.rumble(0.25 + 0.3 * s, 0.2, 110, 1);
  }],
  ['stepFx', (g) => {
    // No banner, no effect, no rumble - the quietest flag in the table. The
    // kind rides beside it on the player, set on the same frame.
    g.sfx.step(g.player.stepKind);
  }],
  ['slideFx', (g) => {
    // Dust at the player's feet and a short shove of the pad - the one
    // movement in the game that puts them on the floor should be felt through
    // it.
    g.effects.burst(g.player.pos, 0xbfd4e6, 12, 3, 1.2, 0.45);
    g.sfx.slide();
    g.pad.rumble(0.45, 0.25, 200, 1);
  }],
  ['dashFx', (g) => {
    g.effects.shockwave(g.player.pos, 0x1de9b6, 2.2, 0.22);
    g.sfx.meleeSwing();
    // A dash is the biggest thing the player does that nothing hits them
    // for, so it is the one movement that gets a shove rather than a tick.
    g.pad.rumble(0.55, 0.3, 150, 2);
  }],
  ['soulFx', (g) => {
    // A single shield point is the quietest event in the pool: a small flash
    // under the player and the HUD's shield count moving is the whole tell.
    g.effects.shockwave(g.player.pos, THEME_SOUL, 1.6, 0.22);
    g.sfx.passiveItem();
  }],
  ['ghostFx', (g) => {
    g.effects.shockwave(g.player.pos, THEME_GHOST_PLATE, 3.6, 0.45);
    g.effects.burst(
      g.player.eyeInto(g._killPos), THEME_GHOST_PLATE, 12, 4, 2, 0.4
    );
    g.sfx.pickupShield();
  }],
  ['activeItemReadyFx', (g) => {
    // A SOUND and not a banner because it lands mid-fight: the player is
    // looking at the crosshair, the bar is in the corner, and the only
    // channel that reaches them without taking their eyes off the room is
    // their ears. The HUD plate flashes with it for anyone who does look.
    g.sfx.activeItemReady();
    g.pad.rumble(0.2, 0.45, 90, 1);
    g.ui.flashItemReady();
  }],
  ['ammoFx', (g) => {
    // LAST BREATH's one-shot, paid on the same split jumpFx and dashFx use:
    // player.js has no audio and no HUD to reach for.
    g.sfx.pickupAmmo();
    g.ui.flashReserve();
    g.effects.shockwave(g.player.pos, PASSIVE_ITEMS.lastBreath.theme, 4, 0.4);
  }],
  ['scrapFx', (g) => {
    // SCRAP METAL's conversion, on soulFx's terms: the HUD's shield count
    // moving is the real tell, and this ring is what says the reload just
    // paid for something rather than merely happened.
    g.effects.shockwave(g.player.pos, THEME_SCRAP, 4.5, 0.4);
    g.sfx.pickupShield();
  }],
  ['luckyHealFx', (g) => {
    // LUCKY NUMBER's two points. No banner: the seventh shot's crit is
    // already the loudest thing that happened to that body, and the green
    // impact beside it is the second half of the same event.
    g.effects.impact(
      g.player.eyeInto(g._killPos), THEME_LUCKY, 6, 2.5, 2, 0.28
    );
    g.sfx.pickupHealth();
  }],
  ['goldFx', (g) => {
    // GOLD STAR's tenth clean kill. A banner, like KILL STREAK's: a permanent
    // step on the build is earned roughly once a wave at best, so it is never
    // often enough to wipe anything worth reading.
    g.ui.banner('GOLD STAR \u00b7 +4% DAMAGE');
    g.effects.shockwave(g.player.pos, THEME_GOLD_STAR, 6, 0.55);
    g.effects.burst(g.player.eyeInto(g._killPos), THEME_GOLD_STAR, 18, 5, 2.6, 0.6);
    g.sfx.passiveItem();
    g.pad.rumble(0.4, 0.4, 150, 2);
  }],
];

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
    // A separate bank behind the box at its nearest wall. Like the row and
    // the box, all three cabinets are constructed once and only raised during
    // a shop.
    this.donationMachine = new DonationMachine(this.scene);
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
    // ARMATURE'S bank, carried from the pick's own bookkeeping to the first
    // pellet of the next trigger pull. Set and cleared inside shoot(); zero
    // everywhere else, so no other path can spend what a kill banked.
    this._shotArmature = 0;
    this.interT = 1.2;
    this.time = 0;
    this.stats = { shotsFired: 0, hits: 0, spawned: 0, damaged: 0 };
    // `shootFresh` is the trigger EDGE - true only on the frame the button
    // went down. Semi-auto weapons need it; the loop clears it every frame.
    // `moveF`/`moveS` are the ANALOGUE pair, in [-1, 1], and they are null
    // whenever the keyboard is what is driving - see the movement block in
    // player.js, which falls back to the booleans when they are.
    this.input = { forward: false, back: false, left: false, right: false, jump: false, shoot: false, shootFresh: false, melee: false, aim: false, sprint: false, crouch: false, moveF: null, moveS: null };
    // Double Dash: the game time each movement DIRECTION was last pressed
    // FRESH, so a second press inside DOUBLE_TAP_WINDOW reads as a dash. Keyed
    // by action id - forward/back/left/right, matching _tapMove - so the clock
    // follows whatever the movement keys currently are; a key held down never
    // writes here (see _bind).
    this._tapT = { forward: -99, back: -99, left: -99, right: -99 };
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
      mode: 'idle', beat: 0, beatHit: 0, level: 0, bar: 0, downbeat: false,
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
    // CURTAIN CALL's address: where the last body of the wave fell. NOT a
    // scratch vector - it has to survive from the death sweep to the clear a
    // frame or two later, and the sweep hands it a clone for that reason. Null
    // until something has died, which is what _curtainCall tests.
    this._lastKillPos = null;
    // UPDRAFT's wisp throttle. Game time of the last one - see the float branch
    // in the frame loop.
    this._floatFxAt = -99;
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
    // LUCKY CORPSE chooses one of the wave's scheduled bodies before the first
    // spawn. Boss waves mark the boss itself instead; adds are an unbounded
    // stream and cannot be sampled uniformly.
    this._luckyCorpseSpawn = -1;
    this._waveSpawned = 0;
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
    // And the same enemy's head sphere, for the one thing the assist uses it
    // for: knowing when to stop pulling down. See _assistTarget.
    this._assistHead = new THREE.Vector3();
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
    // WHICH BODIES THIS ONE PELLET HAS ALREADY PAID FOR. Not the same set as
    // _shotHits above, which is per TRIGGER PULL and exists so a shotgun's
    // nine pellets only tick a once-per-shot effect once. This one is per
    // PELLET, and it exists because every enemy is two overlapping spheres - a
    // body and a head - so a single round can intersect the same enemy twice.
    // A shotgun still deals damage nine times to one chest, which is the whole
    // point of a shotgun; what it must not do is deal it eighteen.
    this._hitOnce = new Set();
    // And which of them this round went through the HEAD of. A separate set
    // because it is answered in a pass BEFORE the damage loop: the two spheres
    // overlap, so the head is often not the first thing the round met. See
    // _firePellet.
    this._hitHead = new Set();
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
    // SKULL RECEIPT's answer for the whole trigger pull. One pellet through a
    // head makes the ammunition behind that pull free; reset beside the crit
    // ledger because both answers are known only after the raycasts land.
    this._shotWasHead = false;
    // STIGMATA's near-misses this trigger pull. The same peer rule as the
    // three sets above: paid once per body per shot, so a shotgun fan that
    // passes within the band of one mob in a close room still chips it once.
    this._chipHits = new Set();
    // SKIPSTONE's tracer origin. Reset per pellet to the muzzle; on a bounced
    // pellet it is the bounce point, so the streak never draws through the
    // floor it came off of. See _firePellet.
    this._legStart = new THREE.Vector3();
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
    // SIDECHAIN COMPRESSION's once-per-press latch, on DETONATOR's terms:
    // cleared with the rest of the press's scratch in _beginShot so a
    // scattergun's eight pellets are one pulse, exactly as they are one
    // blast.
    this._sidechainHit = false;
    // ECHO's bounce normal, in WORLD space. The floor bounce SKIPSTONE takes
    // can simply invert y; a wall or a platform can only be answered by the
    // surface's own normal, transformed out of the hit's local frame.
    this._bounceN = new THREE.Vector3();
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
    // Whether a trail was being laid LAST frame - see _updateFire. The edge is
    // what makes the first patch of a slide land at the slide's start rather
    // than a metre into it.
    this._fireLaying = false;
    this._fireLastX = 0;
    this._fireLastZ = 0;
    // COLD FOOT's trail, on the fire trail's exact shape and with a list, a cap
    // and a laying edge of its own. KEPT APART from _fire rather than folded
    // into it with a flag, for the reason the fire trail is kept apart from
    // _ash: one cap over both would mean a sprint out of a reload quietly
    // evicting the fire a HELLFIRE build had just paid for, and the two zones
    // do completely different things to whatever stands in them.
    this._ice = [];
    this._iceLaying = false;
    this._iceLastX = 0;
    this._iceLastZ = 0;
    // BEDBUGS' second bites: {en, dmg, at}. A list rather than a field on the
    // enemy because one body can be owed several at once - a scattergun is
    // eight pellets and eight bites - and because the sweep that pays them has
    // to be able to drop the ones owed to a body that has already died.
    this._bites = [];
    // Where the pulse stood when SYNCOPATION and HEARTBEAT last fired. -1 is
    // "never", which is what makes the FIRST beat after a pick is claimed wait
    // for the next one rather than landing instantly - see Turret's _lastPulse
    // for the same guard and the same reason.
    this._beatPulse = -1;
    // Scratch list for the random draw, reused rather than allocated every
    // beat. One array for a thing that runs twice a second all run.
    this._beatTargets = [];
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
    // FLOOR IS LAVA's decal handles. The ITEM is in the running list like
    // every other window; what is here is the state that window writes on the
    // world, held on Game for the same reason every other zone's is - the
    // creep pool is Game's to hand back, and an item's scratch object dies
    // with the activation.
    this._lavaCreep = [];
    this._lavaT = 0;
    // ACTIVE ITEMS THAT ARE STILL RUNNING. Fifteen of the sixty-six do not
    // finish on the frame they are pressed; this is the list that ticks them
    // and, more importantly, the list that ENDS them. See RunningActiveItems.
    this.runningActiveItems = new RunningActiveItems();
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
      // The `ground` payload is SAPPHIRE's lapidary seed: a delayed impact
      // that leaves a patch behind, so the mortar telegraph doubles as the
      // patch's own warning circle. Forwarded rather than re-implemented for
      // the same reason every hook here is one line.
      addMortar: (x, z, radius, delay, damage, ground) =>
        this._addMortar(x, z, radius, delay, damage, ground),
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
      // the first passive item. _updateEnemies() sets it fresh each frame, before
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
      // STRAY MERCY rides HERE and nowhere else, because this ctx is exactly
      // what the card means by "a projectile": every shot, spit, stone, mortar
      // and grenade in the game reaches the player through this lambda, and a
      // rusher's fist reaches them through the ENEMY ctx instead. Rolled before
      // _hurtPlayer rather than inside it, so a transfused round never touches
      // the damage sinks at all - it does not break CARNAGE, it does not spend
      // a ward, it does not reset the flawless streak, because nothing hit the
      // player. See the note on the pick.
      onHitPlayer: (d, pos) => {
        const m = this.player.mods;
        if (m.strayMercy > 0 && Math.random() < m.strayMercy) {
          this._strayMercy(pos);
          return;
        }
        this._hurtPlayer(d, pos);
      },
      // Reload Burst's shards damage enemies and never the player, so they get
      // the enemy list and a blast that cannot reach back.
      enemies: this.enemies,
      onBlast: (pos, dmg, radius) => this._blast(pos, dmg, radius, null, false),
      // MITOSIS fragments own their flight; Game owns target selection, damage
      // and child creation because those touch the live roster and projectile
      // cap. Both callbacks are stable for the whole session.
      mitosisTarget: (pos, used) => this._mitosisTarget(pos, used),
      onMitosisHit: (fragment) => this._mitosisHit(fragment),
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
    // POSE'S CORPSE, while the window runs. Same lifecycle as the lure's
    // decoy - rebuilt at each opening, dropped when the window closes - but
    // it is built by _updateEnemies itself, because the moment it opens is a
    // frame the enemy sweep is already in.
    this._possumDecoy = null;
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
      // SHARED MAG's tell. The QUIET half of the ammunition readout - just the
      // flash, no sound and no shockwave - because a turret drinking the
      // reserve is a steady drain rather than an event, and the player.ammoFx
      // one-shot the frame loop handles carries both of those with it.
      flashAmmo: () => this.ui.flashReserve(),
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
    setDamageSink((pos, dealt, crit, head) => {
      if (dealt > 0) this.effects.damageNumber(pos, dealt, crit, head);
      // TITHING BLADE. The sink is the one place every point of damage in the
      // game passes through - bullets, blasts, ticks, turrets - so the tithe
      // cannot miss a source or be paid twice for one. Collected as it lands
      // and straight into the balance, because the card says instantly: this
      // is a conversion, not loot, and it never touches the floor the magnet
      // and LODESTONE feed on.
      if (dealt > 0 && this.player.mods.donationTithe > 0) {
        this.addCredits(dealt * this.player.mods.donationTithe);
      }
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
      // The passive item table and the item pool, for tests that read either as
      // data. Autotest only, like everything else in this block.
      this.__passiveItemsForTest = PASSIVE_ITEMS;
      this.__activeItemsForTest = ACTIVE_ITEMS;
      this.__donationItemsForTest = DONATION_ITEMS;
      this.__donationConfigForTest = DONATION_MACHINE_CONFIG;
      // The box's reel pool, as a function rather than a snapshot: the whole
      // property worth testing is that it depends on what the player is
      // CARRYING at the moment it is asked, which a captured array cannot show.
      this.__poolForTest = shuffledPool;
      // The Enemy class, so a test can stand one up without a wave.
      this.__EnemyForTest = Enemy;
      // The pickup tables, as data. A crate's whole payload is its apply() -
      // FIRE SALE, SLOW RELEASE and GRISTLE all live in there - and a test
      // that re-implemented it to poke at the player would be asserting on its
      // own copy of the thing it is meant to be checking.
      this.__powerupsForTest = POWERUP_TYPES;
      this.__ammoPickupForTest = AMMO_PICKUP;
      // SECONDARY INFECTION's cap. The frame loop pushes this onto enemy.js
      // every frame (see the setShareHook block); a test that drives the enemy
      // step directly never runs that line, so it needs the same door.
      this.__setPoisonCap = setPoisonStackCap;
      // The lid's height, for the UPDRAFT ceiling assertion - a test must not
      // hard-code a number the arena owns.
      this.__ceilForTest = CEIL_Y;
      // The seat palette. Read through setPlayerTag rather than as data: the
      // whole property worth testing is that every seat the menu offers has
      // its own colour ON THE GUN, which a captured array alone cannot show -
      // and main.js and ui.js each hold a copy, so the test needs this one to
      // compare against the DOM's.
      this.__playerColorsForTest = PLAYER_COLOR;
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
        passiveItems: { ...this.player.passiveItems },
        donationChance: this.player.donationChance,
        donationWins: this.player.donationWins,
        lastDonationKind: this.player.lastDonationKind,
        donationItems: { ...this.player.donationItems },
        donationMachine: this.donationMachine.snapshot(this.player),
        passiveItemCount: Object.values(this.player.passiveItems).reduce((a, b) => a + b, 0),
        weapon: this.player.weapon.name,
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
    // The rebindable keyboard. Built before the listeners below so they can
    // read it, and before the first prompt or control sheet is drawn.
    this.keys = new Keybinds();

    // ONE PATH IN, dispatched through the binding table rather than named in
    // the case labels: the same press reads the same action everywhere, and a
    // rebind changes what the keys do by changing one table. Held keys (move,
    // sprint, crouch, melee) write booleans; tap keys call the same methods the
    // pad calls, which is what keeps the two devices from drifting apart on
    // what a button means.
    const K = () => this.keys;
    const PRESSED = {
      forward: () => { this._tapMove('forward'); this.input.forward = true; },
      back: () => { this._tapMove('back'); this.input.back = true; },
      left: () => { this._tapMove('left'); this.input.left = true; },
      right: () => { this._tapMove('right'); this.input.right = true; },
      jump: () => { this.input.jump = true; },
      sprint: () => { this.input.sprint = true; },
      crouch: () => { this.input.crouch = true; },
      melee: () => { this.input.melee = true; },
      reload: () => this.tryReload(),
      activeItem: () => this.tryActiveItem(),
      use: () => this.tryUse(),
      stats: () => { this._openStats(); },
      fullscreen: () => this._toggleFullscreen(),
    };
    const RELEASED = {
      forward: () => { this.input.forward = false; },
      back: () => { this.input.back = false; },
      left: () => { this.input.left = false; },
      right: () => { this.input.right = false; },
      jump: () => { this.input.jump = false; },
      sprint: () => { this.input.sprint = false; },
      crouch: () => { this.input.crouch = false; },
      melee: () => { this.input.melee = false; },
      stats: () => this._closeStats(),
    };
    // preventDefault is per-ACTION rather than per-key for the same reason it
    // was per-case before: these listeners are on the window, and an un-
    // prevented Space scrolls the page and an un-prevented Tab walks browser
    // focus off the canvas and out of pointer lock.
    const SWALLOW = new Set(['jump', 'stats']);

    const onKeyDown = (e) => {
      // Guards any text input that ever ends up on screen: without this a
      // space would be swallowed by the jump binding's preventDefault, and R
      // and E would fire game actions mid-word.
      if (this._typing(e.target)) return;
      // Any key at all hands control back to the keyboard. The player's hands
      // are the only authority on which device is in use, and this is what
      // they say.
      this._setInputMode('kbm');
      // CAPTURING A REBIND, if that is what this press is. Checked before the
      // dispatch so the new key cannot also act, and before preventDefault so
      // the press still cannot scroll the page on its way into the row.
      if (this._rebindCapture(e)) return;
      for (const id in PRESSED) {
        if (K().is(id, e.code)) {
          // Use is one interaction per physical press. Browser key-repeat
          // must not turn holding E beside a Donation Machine into five paid
          // donations (or buy a station repeatedly) before the key comes up.
          if (id === 'use' && e.repeat) return;
          PRESSED[id]();
          if (SWALLOW.has(id)) e.preventDefault();
          return;
        }
      }
      // The one non-rebindable binding, and the only one that never reaches
      // the player mid-run: Escape closes the screen on top. The browser also
      // uses it to leave pointer lock and fullscreen, which is exactly why it
      // is only ever read here - it can never reach into a live run and change
      // anything.
      switch (e.code) {
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
    };
    const onKeyUp = (e) => {
      if (this._typing(e.target)) return;
      for (const id in RELEASED) {
        if (K().is(id, e.code)) {
          RELEASED[id]();
          if (SWALLOW.has(id)) e.preventDefault();
          return;
        }
      }
    };
    addEventListener('keydown', onKeyDown);
    addEventListener('keyup', onKeyUp);
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
    // The second mode. It ASKS HOW MANY FIRST rather than starting: two
    // through eight are different games and the count cannot be changed once
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
    // One handler per count, off the button's own data-count, so the seat
    // cap is markup: the buttons below are the whole list of counts the game
    // offers, and the only other thing that has to agree with them is the
    // colour palette - PLAYER_COLOR / PLAYER_INK.
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

    // ---- the keyboard bindings ---------------------------------------------
    //
    // The rows are BUILT rather than authored, on the same one-source-of-
    // truth rule as the control sheet: the table is the only list of what the
    // keys do, so it is also the only list of what the settings screen shows.
    // Built once here; only the cap VALUE is rewritten after that.
    //
    // TWO BLOCKS in the markup - a KEYBOARD row per action and a CONTROLLER
    // row per action - and the input mode picks which one the eye gets, on
    // the same rule the start screen's control sheet has always followed:
    // the settings screen follows the hands. The mode's CSS hides the other
    // block, and MenuDriver already refuses anything hidden, so the other
    // device's rows cannot even be landed on - no skip flags to keep in step.
    this._bindRows = {};
    for (const act of KEY_ACTIONS) {
      const row = document.getElementById('bind-' + act.id);
      if (!row) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt-btn bind-btn';
      btn.dataset.action = act.id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._rebindStart(btn, act.id);
      });
      row.appendChild(btn);
      this._bindRows[act.id] = btn;
    }
    // The pad rows, on the same build out of the pad half of the table. One
    // button per action rather than a pair, and the cap is drawn by the cap()
    // from padmenu - a face button is its glyph, not its word.
    this._padBindRows = {};
    for (const act of PAD_ACTIONS) {
      const row = document.getElementById('pbind-' + act.id);
      if (!row) continue;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opt-btn bind-btn';
      btn.dataset.action = act.id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._rebindStart(btn, act.id);
      });
      row.appendChild(btn);
      this._padBindRows[act.id] = btn;
    }
    this._syncBindBtns();

    this._resetKeysBtn = document.getElementById('btn-reset-keys');
    this._resetKeysBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Back to the shipped table, felt rather than just read - the same
      // nudge the pad's steppers give, because it is the same "a setting just
      // landed" the player is holding the device for. Both halves: a reset
      // that left one device's stray binding behind would be a reset that
      // half-worked.
      this.keys.reset();
      this.keys.padReset();
      this.pad.rumble(0.25, 0.2, 70, 1);
      this._syncBindBtns();
      this._syncKeyUi();
    });

    // The on-screen keyboard, built once. It only ever appears in pad mode -
    // see the .pad-only rule - and it writes straight into the same field the
    // keyboard player types in, so there is one name and one save path.
    this._audioHint = document.getElementById('audio-hint');
    // ONE SOURCE OF TRUTH for the bindings on screen. The panel starts empty
    // in the markup and is filled here for whichever device the player is on
    // at build time; _setInputMode swaps the sheet with the hands and
    // _syncKeyUi rewrites whichever is current after a rebind. Both sheets
    // come out of the binding table, so a rebind is in the caps the next time
    // the player sees them.
    this._controlsEl = document.querySelector('.controls');
    renderControls(
      this._controlsEl, this.inputMode === 'pad',
      this.inputMode === 'pad' ? this.keys.padSheet() : this.keys.sheet()
    );

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
      // buffer the scene lands in - the low-resolution one the tube pass
      // magnifies, which a resize re-derives from the panel.
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
  // A SECOND WAY TO FIRE ONE ITEM, not a second binding. Double-tapping
  // forward is how the dash was reached for the whole time it was a passive
  // item, and a player who learned it should not have to unlearn it - so it
  // routes through tryActiveItem() like the item key does, and therefore does
  // nothing at all unless BLINK DRIVE is what is in the slot.
  //
  // Keyed by ACTION rather than by code: the forward key is whatever the
  // player has bound to forward, and a rebind must not take the double-tap
  // with it. `_clearInput` sweeps the same object, whatever the keys are.
  _tapMove(id) {
    if (this.input[id]) return;
    const last = this._tapT[id];
    if (this.time - last < DOUBLE_TAP_WINDOW) {
      if (id === 'forward' && this.player.activeItem === 'itemDash') this.tryActiveItem();
      // Cleared so a third tap has to start a new pair rather than firing
      // again off the same timestamp.
      this._tapT[id] = -99;
    } else {
      this._tapT[id] = this.time;
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
    this.effects.clearCasings();
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
    this._fireLaying = false;
    for (const p of this._ice) this.effects.creepRelease(p.creep);
    this._ice.length = 0;
    this._iceLaying = false;
    // BEDBUGS' bites go with the bodies they were owed to. They hold enemy
    // references, and a bite surviving a reset would be a reference to a
    // corpse from the last run - see the note on the fuse sweep.
    this._bites.length = 0;
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
    // A binding row left listening behind the closed screen is a press trap.
    this._rebindCancel();
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
    // The control sheet on the start screen and the binding rows on the
    // settings screen are the two pieces of UI that name INPUTS, and both are
    // rewritten here rather than per frame. The sheets are rebuilt rather
    // than cached because a rebind through SETTINGS can change either one
    // while the start screen sits underneath.
    if (this._controlsEl) {
      renderControls(
        this._controlsEl, mode === 'pad',
        mode === 'pad' ? this.keys.padSheet() : this.keys.sheet()
      );
    }
    // A capture open on the row the player just switched away from is a
    // listening row that can no longer be finished on that device - cancel it
    // and re-point every row's value at the new device's table. Safe to reach
    // for the rows here: every path that can call this - keyboard, mouse, the
    // pad's poll - is a listener or a frame, and both start after _bind built
    // them.
    this._rebindCancel();
    this._syncBindBtns();
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

    // THE TABLE IS THE ONE PATH ON THE PAD TOO. Every button below is read
    // through the binding table rather than off BTN's constants, so a pad
    // rebind in SETTINGS changes what the buttons do by changing one table -
    // the same rule the keyboard half has lived by since the case labels
    // went. B(id) resolves the action's bound button to its index once a
    // frame; -1 (a binding the pad cannot report, which only a hand-edited
    // store can produce) reads as never pressed.
    const PB = (id) => BTN_NAMES.indexOf(this.keys.padBtn(id));

    i.jump = pad.down(PB('jump'));
    i.melee = pad.down(PB('melee'));
    // AIM, held, the way the left trigger does on every console shooter.
    // Held, never toggled - see _updateAim in player.js.
    i.aim = pad.down(PB('aim'));
    // SPRINT LATCHES. Clicking a stick is not something to be held down
    // for the length of a retreat, so the press flips a latch and the
    // player keeps running until something stops them - they stand still, they
    // fire, the bar empties, or they click it again.
    //
    // `_sprintEngaged` is what makes "until something stops them" work without
    // the latch cancelling itself on the frame it was set: it only counts as
    // ended once the run has actually STARTED. A click while standing still
    // therefore arms the run for the moment the player moves, rather than
    // being swallowed.
    if (pad.pressed(PB('sprint'))) {
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
    // SHOOT is the trigger and the trigger is the gun. `shootFresh` is the edge
    // the semi-automatic weapons read - the same one a mouse click raises.
    i.shoot = pad.down(PB('shoot'));
    if (pad.pressed(PB('shoot'))) i.shootFresh = true;

    if (pad.pressed(PB('reload'))) this.tryReload();
    // CROUCH is passed through as a HELD boolean rather than as an edge:
    // player.js turns it into a toggle or a slide depending on what the player
    // is doing, and that decision has to live in one place for both input
    // devices.
    i.crouch = pad.down(PB('crouch'));
    // TAKE defaults to TRIANGLE - the free face button, and where a "pick
    // this up" prompt is looked for. It was on R1 once and the prompt said
    // CIRCLE: the one button the prompt named was the one button that did not
    // do it, which is the regression _useLead exists to prevent.
    if (pad.pressed(PB('use'))) this.tryUse();
    // THE ACTIVE ITEM defaults to R1 - the shoulder over the trigger finger,
    // where a button pressed in the middle of a firefight has to be. The
    // triggers are aim and fire, so R1 is the nearest thing to them that is
    // not one of them.
    if (pad.pressed(PB('activeItem'))) this.tryActiveItem();
    // THE BUILD SHEET is HELD, exactly as TAB is: the sheet costs the player
    // the seconds they spend reading it and the arena keeps running under it.
    // It moved off Triangle when Triangle became TAKE - the summary is the one
    // thing on the pad that is never pressed in a hurry, so it is the one
    // that can afford the button furthest from the sticks.
    if (pad.down(PB('stats'))) this._openStats();
    else this._closeStats();
    // THE DEBUG PANEL, on CREATE - the pad's other flat button, and the only
    // one nothing in the game uses. Pressed rather than held, because unlike
    // the build sheet this screen is worked in rather than glanced at.
    //
    // BELOW the stats button's else, and not between the two: that if/else is
    // one statement, and splitting it left the build sheet with no branch that
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
      // The head sphere, as an angle from the eye and an angular RADIUS.
      // Collected here, used at the bottom: the assist keeps aiming at the
      // body, and this is only how it knows when to stop pulling down.
      const headDy = e.head.getWorldPosition(this._assistHead).y - eye.y;
      const headR = e.head.geometry.parameters.radius * e.head.scale.x;
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
      // THE ASSIST MUST NOT PULL A PLAYER OFF A HEAD THEY ARE ALREADY ON.
      //
      // The pull is toward the CENTRE of the body, which is right - a magnet
      // that sought heads would be the game taking the harder shot for the
      // player, and controller headshots would stop being something anyone
      // aimed at. But a player holding the reticle on a face is above that
      // centre by construction, so the vertical half of the pull was dragging
      // them down off it, every frame, harder the closer they got.
      //
      // So the pitch pull is dropped once the aim is at or above the head, and
      // the yaw pull is kept: sideways help never moves a shot off a head, and
      // tracking a strafing enemy is most of what assist is for.
      // Suppressed once the aim is INSIDE the head's own angular radius, not
      // only once it is above the head: a player lining up a face is somewhere
      // on it, not exactly on its centre, and a pull that only let go at the
      // very top would still be fighting them for most of the target.
      const headPitch = Math.atan2(headDy, flat) - aimPitch;
      const headAng = headR / flat;
      best.dPitch = (dPitch < 0 && headPitch <= headAng) ? 0 : dPitch;
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

    // A CAPTURE ROW ON THE PAD, if one is listening: the next button press is
    // the binding, and everything below - CROSS included, whose press opened
    // the row and was spent there - is not heard until the capture closes.
    // Checked before the menu reads CROSS so the poll's press cannot be both
    // the binding and the click.
    if (this._padRebindPoll()) return;

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
    * rhythm. A finished match goes back to the MENU instead: the next one
    * needs the room to agree on how many are playing, and dropping Player 1
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

  // ---- the keyboard bindings --------------------------------------------------

  // Rewrites every binding cap on the settings screen. Called on build, on
  // every rebind, on reset and on every MODE CHANGE - the rows swap with the
  // player's hands, exactly as the start screen's sheet does, because a
  // settings screen is where a player goes looking for what the buttons do
  // on the device they are holding.
  //
  // The keyboard caps are the key's NAME; the pad caps are drawn by the same
  // cap() the prompts use - a face button is its shape, and a shape is what
  // the player holding a pad reads first.
  _syncBindBtns() {
    for (const id in this._bindRows) {
      const btn = this._bindRows[id];
      btn.textContent = this.keys.label(id);
      btn.classList.toggle('listening', false);
    }
    for (const id in this._padBindRows) {
      const btn = this._padBindRows[id];
      btn.innerHTML = cap(this.keys.padLabel(id));
      btn.classList.toggle('listening', false);
    }
  }

  // Everything on screen that names a key: the settings rows above, the
  // control sheet on the start screen (which SETTINGS sits over, so a rebind
  // made inside it has to reach the sheet underneath) and the sheets the
  // prompt path builds from _useLead. The prompt itself is rebuilt every frame
  // it is up, so it needs no push.
  //
  // BOTH SHEETS, whichever is current: the sheet swap on a mode change is
  // this same call with the mode already moved, so there is one path for a
  // rebind and one for a device swap and neither can drift from the other.
  _syncKeyUi() {
    if (!this._controlsEl) return;
    renderControls(
      this._controlsEl, this.inputMode === 'pad',
      this.inputMode === 'pad' ? this.keys.padSheet() : this.keys.sheet()
    );
  }

  /**
   * Puts a binding row into its capture state: the next key press becomes the
   * binding, Escape cancels, and the row itself says so. There is no timeout
   * by design - a player reaching to look at their keyboard is not a player
   * who wants the row to have changed its mind when they get back.
   *
   * WHICH DEVICE the capture listens for is decided by the ROW, not the mode:
   * the row knows which half of the table it is a cap for, and a keyboard
   * player reaching for the controller (or the reverse) must not have the
   * press vanish into the other device's capture.
   */
  _rebindStart(btn, id) {
    this._audioGesture();
    if (this._rebindId != null) this._rebindCancel();
    this._rebindId = id;
    this._rebindBtn = btn;
    // WHICH HALF OF THE TABLE the row is a cap for, by the button rather than
    // the id: 'jump' lives in both tables, and the row that was clicked is
    // the only thing that knows which device the press is for.
    this._rebindPad = this._padBindRows[id] === btn;
    btn.classList.add('listening');
    btn.textContent = this._rebindPad ? 'PRESS A BUTTON' : 'PRESS A KEY';
    // The click that opened the capture left the button FOCUSED, and a focused
    // button is live to Space and Enter - the keyup after binding jump onto
    // Space would click the row again and put it straight back into capture.
    // Nothing else is lost: a mouse player does not need the focus ring to
    // find the row again, and the pad selection draws its own mark.
    btn.blur();
  }

  // OUT of the capture state without a binding. Called by the next rebind
  // press, by Escape, by taking the settings screen down - a row left
  // listening behind a closed screen is a booby trap for the next run - and
  // by a device switch, which strands the capture on a device the player has
  // just put down.
  _rebindCancel() {
    if (this._rebindId == null) return;
    this._rebindId = null;
    if (this._rebindBtn) this._rebindBtn.classList.remove('listening');
    this._rebindBtn = null;
    this._rebindPad = false;
    this._syncBindBtns();
  }

  /**
   * THE REBIND ITSELF, on the keydown path. Returns true when the press was
   * consumed here, so the game must not also act on it.
   *
   * Escape is cancel rather than a bindable key: the browser already owns it
   * for leaving pointer lock and fullscreen, and a settings screen the player
   * cannot get out of with the one universal "close" key would be a trap.
   * The modifier FAMILY codes bind normally - pressing either shift binds
   * "SHIFT", either ctrl "CTRL" - via normCode inside Keybinds.
   *
   * A TAKEN KEY is refused with a shake rather than reassigned by force:
   * the row that lost its key is where the eye has to go, so the refusal
   * names it. Crouch's second key can be spared automatically - see the
   * comment on Keybinds.bind - which is the case the message exists for.
   */
  _rebindCapture(e) {
    if (this._rebindId == null || this._rebindPad) return false;
    // Swallowed whichever way it lands: the press is spoken for, and an
    // un-prevented F5 or / would hand it to the browser as well.
    e.preventDefault();
    if (e.code === 'Escape') { this._rebindCancel(); return true; }
    // The OS's own chord keys are not bindings. Meta is the browser's, and a
    // modifier held on its way to a real key press is not a press of the
    // modifier - it is the start of one, and binding it would leave the row
    // listening forever with nothing the player can press. Numpad keys are
    // excluded too: headless test machines may have none and the movement
    // hand does not live there.
    if (e.code === 'MetaLeft' || e.code === 'MetaRight' || e.key === 'Meta'
      || e.code.startsWith('Numpad')) return true;
    const id = this._rebindId;
    this._rebindCancel();
    const stolen = this.keys.bind(id, e.code);
    if (stolen) {
      // The row that owns the key the player wanted is where the answer is.
      const btn = this._bindRows[stolen];
      btn.classList.add('taken');
      setTimeout(() => {
        btn.classList.remove('taken');
        // The label may have changed again in the meantime; rebuild from the
        // table rather than remembering what it was.
        this._syncBindBtns();
      }, 700);
      this.sfx.denied();
      this.pad.rumble(0.4, 0.3, 140, 2);
      return true;
    }
    this._syncBindBtns();
    this._syncKeyUi();
    this.pad.rumble(0.25, 0.2, 70, 1);
    return true;
  }

  /**
   * THE PAD'S REBIND, on the poll. _padMenu calls it once a frame while a
   * pad capture is open, BEFORE the menu reads CROSS.
   *
   * THE MENU'S OWN THREE are the pad's Escape: CIRCLE and OPTIONS cancel the
   * capture (which is what a player reaching for "back" means when the row
   * is blinking at them), and CROSS cancels it too rather than binding -
   * CROSS is the click that opened the row, and a pad that rebound jump
   * with the click that asked for the rebind would be a pad where the
   * confirmation button was also a binding candidate. The press is consumed
   * either way, so it cannot fall through to the menu and close the screen
   * the row lives on.
   *
   * A FIXED button - CREATE, PS, the D-pad - closes the row without a bind:
   * the pad's one-word "no", the same answer _rebindCapture gives Meta and
   * the numpad.
   *
   * Everything else binds, and a pad bind is a SWAP (see Keybinds.padBind):
   * no refusal, no shake, and the row that gave up its button wears the new
   * one in its cap already.
   *
   * @returns {boolean} true if a press was consumed - the menu must not also
   *   act on it.
   */
  _padRebindPoll() {
    if (this._rebindId == null || !this._rebindPad) return false;
    const i = this.pad.pressedIndex();
    if (i === -1) return false;
    const name = BTN_NAMES[i];
    this.pad.consume(i);
    const id = this._rebindId;
    if (i === BTN.CROSS || i === BTN.CIRCLE || i === BTN.OPTIONS || isPadFixed(name)) {
      this._rebindCancel();
      this.sfx.menuBack();
      return true;
    }
    this._rebindCancel();
    this.keys.padBind(id, name);
    this._syncBindBtns();
    this._syncKeyUi();
    this.pad.rumble(0.25, 0.2, 70, 1);
    return true;
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
    r.beatHit = this.music.beatHit;
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
    const c = this._themeCaption(this.wave + 1);
    this.ui.banner('WAVE ' + (this.wave + 1), c ? c.text : '', c && c.color);
  }

  // The five-wave block that opens on wave n, as the banner's second line:
  // its name and its colour, or null if n is not the first wave of one. Only
  // on the first: the point is to mark the CHANGE, and a name repeated over
  // all four waves of a block stops being an announcement and becomes
  // furniture. The colour is the same one the rig tints the room with, so the
  // caption reads as the block's and not as the room's.
  _themeCaption(n) {
    if (((n - 1) % 5) !== 0) return null;
    const cfg = waveConfig(n, this._themeSeed, HAVE_TYPE, this._forcedTheme);
    return { text: cfg.themeName, color: '#' + cfg.themeColor.toString(16).padStart(6, '0') };
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
    // it, and every player's saved run hangs off it.
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
    this._lastKillPos = null;
    this._pass = false;
    this._swapped = false;
    this.totemArea.dismiss();
    this.mysteryBox.dismiss();
    this.donationMachine.dismiss();
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
      // Every slot seeded off the same freshly reset player, so the first
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
   * The housekeeping EVERY way out of a run shares: hands off the controls,
   * panels closed, pointer handed back, the pick row and the box put away,
   * no pass still half-swung. The three exits used to spell this out a page
   * apart with subtly different subsets; the subsets were not the point.
   *
   * `dismissRow` is the one knob: gameOver leaves the totems standing because
   * the death screen is drawn over the room as it fell, and sweeping the row
   * from under it would rearrange the scene between the hit and the screen.
   */
  _leaveRun({ dismissRow = true } = {}) {
    this._clearInput();
    this._closeStats();
    if (dismissRow) {
      this.totemArea.dismiss();
      this.mysteryBox.dismiss();
      this._dismissDonationMachine();
    }
    this.ui.setPrompt(null, false);
    this._pass = false;
    this._swapped = false;
    this.player.setHolster(0);
    if (!this.autoTest && document.pointerLockElement) document.exitPointerLock();
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
    this.pad.stopRumble();
    // A MATCH ENDS WITH THE RUN THAT WAS ABANDONED. There is no half a versus
    // match to come back to: the slots are one run seen N times, and the
    // players who did not press EXIT are in the room to argue about it.
    this.mode = 'solo';
    this.match = null;
    this.ui.setVersus(null);
    this.player.setPlayerTag(null);
    this._leaveRun();
    this._clearEntities();
    this._resetTerrain();
    this.queue.length = 0;
    this._pendingBuffs.length = 0;
    this.waveState = 'idle';
    this._waveCued = false;
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
    // in the shop - see the note in tryActiveItem - so a player can hand over with a
    // window still open, and everything a window writes (itemDamageMult and its
    // neighbours) is an ordinary player field that captureRun will copy. The
    // incoming player would then inherit a triple-damage multiplier with no
    // activation left anywhere to hand it back.
    //
    // A wave clear already clears these; this is the shop-fired case, which is
    // the only one that reaches here with anything still running.
    this.runningActiveItems.clear(this);
    this._clearDeployed();
    // A paid roulette forfeiture belongs to the outgoing run. Resolve it
    // before the snapshot and before match.advance changes the active seat.
    this._dismissDonationMachine();
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

  /** The incoming player's run comes back, while nothing is looking at it. */
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
    // but _leaveRun clears the flags anyway so the screen can never be
    // reached with a half-swung weapon or a slid-out HUD still owed an
    // animation.
    this._leaveRun();
    this._clearEntities();
    this.rig.setEnraged(false);
    this.sfx.passiveItem();
    this.ui.showMatchOver(m.label(m.winner), m.wave);
  }

  tryReload() {
    if (this.state !== 'playing') return;
    // The sound rides the reloadFx flag startReload() raises, paid through
    // PLAYER_FX - the same flag the dry trigger and the last round raise, so
    // every reload sounds alike whatever started it.
    this.player.startReload();
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
  tryActiveItem() {
    if (this.state !== 'playing') return;
    const id = this.player.activeItem;
    if (!id) return;
    if (!this.player.activeItemReady) {
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
    this.player.spendActiveItem();
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
    // DIME NOVEL, third in the row of things a PRESS pays for, beside BAILIFF's
    // refund and VITAL TRIGGER's heal - all three land the moment the charge is
    // spent and whatever the item then does, so all three are worth exactly as
    // much to PAY TO WIN's free press as to LANCE's.
    //
    // OPENED FROM NOW rather than extended: twenty seconds is twenty seconds
    // from the last press, which is the reading a player pressing the button
    // twice in a fight would expect and the only one that needs no arithmetic.
    if (this.player.mods.dimeCrit > 0) {
      this.player.dimeEnd = this.time + this.player.mods.dimeTime;
      this.effects.shockwave(this.player.pos, THEME_DIME, 4, 0.4);
    }
    this.runningActiveItems.start(this, id, def);
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
   * work for free: a handover replays the incoming player's passive item list into
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
   * Everything a shot can land on, built once per press into the scratch
   * list. What VARIES between the three callers is which extras ride along:
   *
   * - SHOP FURNITURE (totems, stations, box and Donation Machine) is the
   *   trigger's alone. LANCE and MAG DUMP are item volleys, and neither has
   *   ever bought anything - if a
   *   dump pellet is ever meant to shop for the player, that is one flag at
   *   the call site, here.
   * - BRINE's angler bubble joins the trigger's and the dump's lists rather
   *   than being raycast separately, so a bubble drifting in front of an
   *   enemy is cover for it exactly the way a crate would be. The lance is
   *   the one shot geometry does not apply to, bubbles included - "through
   *   everything in the room" is the whole card.
   */
  _buildShotTargets({ props = false, bubbles = true } = {}) {
    const targets = this._targets;
    targets.length = 0;
    for (const m of this.arena.meshList) targets.push(m);
    for (const e of this.enemies) { targets.push(e.hitbox); targets.push(e.head); }
    if (bubbles) {
      for (const pr of this.projectiles) {
        if (pr.shootable) targets.push(pr.mesh);
      }
    }
    if (props) {
      this.totemArea.addTargets(targets);
      this.mysteryBox.addTargets(targets);
      this.donationMachine.addTargets(targets);
    }
    return targets;
  }

  /**
   * The per-press scratch, zeroed as one block. `_shotHits`/`_shotCrit` are
   * the press's dedup and crit ledgers, `_blastHit` the DETONATOR flag,
   * `_shotWasCrit` what settlePity and RED HARVEST read, `_reflected` the
   * mirror's one-round-back latch, `_chipHits` the chip ledger.
   */
  _beginShot() {
    this._shotHits.clear();
    this._shotCrit.clear();
    this._blastHit = false;
    this._sidechainHit = false;
    this._shotWasCrit = false;
    this._shotWasHead = false;
    this._reflected = false;
    this._chipHits.clear();
    // HALF TRUTH's answer for this trigger pull, decided in _resolveHit when
    // the first critical body of the shot is met and read by _hitMult for
    // every body the same shot lands on.
    this._shotCritDouble = false;
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
    const targets = this._buildShotTargets();

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
    // Zeroed like every press. Without this the beam settles PITY PARTY and
    // RED HARVEST against whatever the last TRIGGER pull said, which is a
    // crit the beam did not land and a drought it did not break.
    this._beginShot();
    // The lance is ONE round through everything, so a body it passes through
    // pays once however many of its spheres the beam clipped - and it earns the
    // head on the same terms a pellet does. See _hitOnce.
    const seen = this._hitOnce;
    seen.clear();
    const headed = this._hitHead;
    headed.clear();
    for (const h of hits) {
      if (h.object.userData.head !== true) continue;
      const en = h.object.userData.enemy;
      if (en && !en.dead) headed.add(en);
    }
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
      if (seen.has(en)) continue;
      seen.add(en);
      const hot = this._resolveHit(en, crit, false);
      const head = headed.has(en);
      this._landShot(
        en, h.point, ray.ray.direction, base * this._hitMult(en, hot, head), 8, hot, head
      );
      hitAny = true;
    }
    this._shotHits.clear();
    this._shotCrit.clear();
    // LANCE IS A TRIGGER PULL for everything counted once per one. It rolled
    // its own die at the top, which means it can SPEND a PITY PARTY crit - and
    // a path that spends one without settling it would leave `pityShot`
    // standing, so every hit in the game after it would land at a flat 5x
    // until something else cleared the flag. Settled here for that reason as
    // much as for the drought.
    this.player.settlePity(hitAny, this._shotWasCrit);
    this._critHeal(this._shotWasCrit);
    this.player.bumpStreak(hitAny);
    // CHAIN LETTER, on the same shot-grain line the trigger pull's streak
    // settles on - the lance is one press wherever its beam ended up.
    this.player.bumpChain(hitAny);
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

  // ---- MAG DUMP ----------------------------------------------------------

  /**
   * The whole magazine, fired as one wide cone, on the frame of the press.
   *
   * IT IS THE PELLET PATH, NOT A NEW ONE. Every round goes through
   * _firePellet exactly as a trigger pull's would, so the build's passive
   * items, the ammunition's statuses, the pierce cap, SEEKER's bend and the
   * hit-once-per-body rule all apply without being told this exists. What is
   * different is only how many go out at once and how wide.
   *
   * ONE ROLL FOR ALL OF THEM. The crit die is thrown once, the way it is for a
   * shotgun's nine pellets and for LANCE's beam: this is one press, and thirty
   * separate coins would average out to exactly nothing.
   *
   * THE DEDUP SETS ARE NOT CLEARED BETWEEN ROUNDS, for the same reason
   * TWENTY/TWENTY's two volleys share them - one press is one dose of status
   * on a body and one DETONATOR blast, however many rounds found it.
   *
   * NOT A TRIGGER PULL. tryShoot() is never called, so nothing that counts
   * shots counts these: no recoil bloom, no CANNONADE, no FATAL RESERVE, no
   * bumpStreak per round. The rounds leave the magazine the way LANCE's thirty
   * do - spent, not fired.
   */
  magDump() {
    const p = this.player;
    const n = p.mag;
    if (n <= 0) return;
    p.mag = 0;
    const w = p.weapon;
    const targets = this._buildShotTargets();
    const muzzle = p.muzzleInto(this._muzzle);
    const crit = p.rollCrit();
    this._beginShot();
    // ARMATURE belongs to the TRIGGER, and the dump is an item's - the bank
    // waits for the player's own next pull. Held aside and put back: the
    // pellets below all run through _firePellet, which is where the field is
    // spent, and a dump that quietly consumed it would be an item eating a
    // passive item's whole payload.
    const heldArmature = this._shotArmature;
    this._shotArmature = 0;
    let hitAny = false;
    // THE CONE IS THE ITEM. Six times the widest a moving player's own spread
    // ever opens to, which puts the far rounds well off the reticle - what the
    // player is buying is AREA, and a dump that landed in the same place a
    // burst would have is just a burst.
    for (let i = 0; i < n; i++) {
      if (this._firePellet(muzzle, targets, MAG_DUMP_SPREAD, w, 1, crit)) hitAny = true;
    }
    if (this._blastHit) {
      const m = p.mods;
      this._blast(this._blastAt, m.blastDamage, m.blastRadius, null, false);
    }
    if (p.mods.critOverflow > 0) p.settleShot(this._shotWasCrit);
    // ONE PRESS, ONE SETTLEMENT. A dump is booked as a single entry in the
    // accuracy figures (see below) and it is one trigger pull as far as the
    // crit is concerned - it rolled once - so the drought and the coin are
    // settled once as well.
    p.settlePity(hitAny, this._shotWasCrit);
    this._critHeal(this._shotWasCrit);
    this._shotHits.clear();
    this._shotCrit.clear();
    // CHAIN LETTER, beside the streak settlement: a dump is one press, so it
    // is one step of the chain however many rounds were in the magazine.
    p.bumpChain(hitAny);
    // ARMATURE, handed back - see the heldArmature note above.
    this._shotArmature = heldArmature;
    targets.length = 0;
    // One press, one entry in the accuracy figures - the same grain LANCE is
    // booked at, and the reason the stat is still readable after one.
    this.stats.shotsFired++;
    if (hitAny) {
      this.stats.hits++;
      this.ui.hitMarker();
      this.sfx.hit();
    }
    p.bumpStreak(hitAny);
    // Everything that says "that was the whole magazine": a blast half as
    // big again as a single round's, a kick three times a normal shot's,
    // and the reserve counter flaring.
    this.camera.getWorldDirection(this._killPos);
    this.effects.blast(muzzle, this._killPos, 1.6);
    this.effects.burst(muzzle, 0xffab00, 34, 9, 3, 0.5);
    this.effects.addShake(0.55);
    p.kick = -0.26;
    this.pad.rumble(1, 0.7, 300, 2);
    this.ui.flashReserve();
    this.sfx.itemBlast();
  }

  // ---- BLOOD TRANSFUSION, HEALTH & SEEK ----------------------------------

  /**
   * Every plate on the floor, turned into a health plate where it lies.
   *
   * REPLACED RATHER THAN MUTATED. A Powerup builds its mesh and its halo from
   * the type it was constructed with (see pickupIcon and glowMaterial, both
   * keyed by type), so rewriting `type` on a live one would leave an ammo crate
   * on screen that heals - the one outcome worse than the item not working.
   *
   * IT KEEPS THE TIME THE OLD PLATE HAD LEFT. `spawnTime` is copied over, so a
   * crate that was already blinking becomes a health plate that is already
   * blinking. Handing back a fresh thirty seconds would make this a way to
   * REFRESH the floor as well as convert it, which is a second effect the card
   * does not mention.
   *
   * @returns {number} how many were converted, so the item can refuse an empty
   *   floor out loud rather than silently doing nothing.
   */
  _transfuse() {
    let n = 0;
    for (let i = 0; i < this.powerups.length; i++) {
      const old = this.powerups[i];
      // Already health, or already on its way to the player: an absorbing
      // plate has left the live list's jurisdiction (see _updateAbsorbing) and
      // converting one mid-flight would be a pickup changing in the air.
      if (old.typeKey === 'health' || old.absorbing || old.dead) continue;
      const made = spawnDropAt(
        'health', old.pos, this.scene, this.effects.glowTex, this.time,
        this.arena.obstacles
      );
      made.spawnTime = old.spawnTime;
      this.effects.burst(this._killPos.set(old.pos.x, old.pos.y + 0.9, old.pos.z),
        0xff2d6f, 12, 3, 2, 0.5);
      old.destroy();
      this.powerups[i] = made;
      n++;
    }
    return n;
  }

  /**
   * HEALTH & SEEK: `n` health plates on open floor, anywhere in the arena.
   *
   * CAPPED WITH EVERY OTHER SPAWNER. MAX_ACTIVE_PICKUPS is a promise about how
   * much loot can be on the floor at once and it is not the item's to break -
   * a player who presses this onto an already-carpeted arena gets fewer plates,
   * which is the same answer the relief net gets in the same situation.
   */
  _scatterHealth(n) {
    for (let i = 0; i < n; i++) {
      if (this.powerups.length >= MAX_ACTIVE_PICKUPS) return;
      this._addPickup(
        spawnAnywhere('health', this.arena, this.scene, this.effects.glowTex, this.time)
      );
    }
  }

  // ---- GOLDEN PARACHUTE, EXECUTIVE DECISION ------------------------------

  /**
   * The wave, bought out: the queue emptied and the floor cleared, paying
   * nothing for either.
   *
   * NOTHING HERE GOES THROUGH THE KILL SWEEP, and that is the whole design.
   * Marking the bodies dead would run every reward in the game - the bounty,
   * the orbs, the item charge, the drop roll, the combo - and a late wave's
   * cast is worth more than the five thousand dollars the press cost, so the
   * item would refund itself and then some. They are DISPOSED instead, exactly
   * the way _clearEntities disposes a roster at a run boundary.
   *
   * THE WAVE THEN ENDS ON ITS OWN. _updateWave asks for an empty queue and an
   * empty roster and finds both on the next frame, so the flawless test, the
   * resupply, the banked health and the shop all run in their ordinary order.
   * Nothing here knows what a wave clear involves.
   *
   * @returns {number} bodies and queued spawns removed, for the banner.
   */
  _clearWaveNow() {
    let n = this.queue.length;
    this.queue.length = 0;
    for (const e of this.enemies) {
      if (!e.dead) n++;
      // A puff where each body was. There is no corpse - the bodies did not
      // die, they were bought off - and a room that simply blinked empty would
      // read as the game having lost track of the wave.
      this.effects.burst(this._killPos.set(e.pos.x, e.pos.y + 0.9, e.pos.z),
        0xffc400, 14, 5, 2.5, 0.5);
      this.scene.remove(e.group);
      e.dispose();
    }
    this.enemies.length = 0;
    this._bigAlive = 0;
    // Children a splitter queued this frame go with their parents: they are
    // pushed onto the roster after the sweep, and one left here would be the
    // single body standing in an arena the player has already paid to empty.
    this._pendingSpawns.length = 0;
    return n;
  }

  /**
   * EXECUTIVE DECISION: every part of the current boss, dead, now.
   *
   * SET DEAD RATHER THAN DAMAGED, and this is the one place in the game that
   * does it. Enemy.takeDamage is a stack of things that can refuse a blow -
   * a warden's ward, a capacitor's plate, a Colossus's plating, a shell that
   * is currently closed - and every one of them is a correct answer to a
   * BULLET. An item whose entire card is "instantly kill a boss" cannot be
   * eaten by a phase; a hundred and twenty points is not a price anybody pays
   * for a maybe.
   *
   * THE SWEEP STILL BOOKS THEM. `dead` is exactly what the sweep in
   * _updateEnemies looks for, so the bounty, the corpse, the combo and
   * _finishBossWave all happen the way they would have if the player had shot
   * the last part off - which is right, because they did fight the wave, they
   * just did not fight the last of it.
   */
  _executeBoss() {
    if (!this.bossFight) return;
    for (const e of this.bossFight.parts.slice()) {
      if (e.dead) continue;
      e.hp = 0;
      e.dead = true;
      this.effects.burst(this._killPos.set(e.pos.x, e.pos.y + 1.6, e.pos.z),
        0x880e4f, 40, 8, 4, 0.9);
      this.effects.shockwave(e.pos, 0x880e4f, 12, 0.9);
    }
  }

  // ---- FLOOR IS LAVA -----------------------------------------------------

  /**
   * Ten seconds in which the arena floor is a hazard and the furniture is not.
   *
   * IT IS NOT A HAZARD PATCH, and it deliberately does not go through
   * _addHazard. A patch is a circle with a cap on how many of its kind can
   * exist, and this is not a circle - it is "the floor", which is a HEIGHT
   * TEST rather than a distance one. Feeding nine overlapping patches into the
   * pool would also evict every magma trail and gas cloud a wave had laid,
   * which is a boss's own attacks being cancelled by the player's item.
   *
   * NINE STAMPS, AND ONLY FOR THE LOOK. The creep field is a shared pool of
   * thirty (see Effects._creepInit); nine of them in a grid cover a 44 metre
   * arena with the ragged edges lava should have. If the pool is already busy
   * - a Colossus alone can hold a dozen - creepAcquire hands back -1 and
   * creepSet ignores it, so the floor is patchier and NOTHING ELSE CHANGES:
   * what burns is the height test below, never the decal. A player cannot be
   * hurt by ground they cannot see, and cannot be saved by a gap in it either.
   */
  _lavaFloorStart() {
    this._lavaFloorEnd();
    this._lavaT = LAVA_FLOOR_TIME;
    for (let i = 0; i < 9; i++) {
      this._lavaCreep.push(this.effects.creepAcquire(true));
    }
  }

  _lavaFloorTick(dt) {
    this._lavaT -= dt;
    // The last second fades, exactly as a hazard patch's does: the floor going
    // clean is the only notice anybody gets that it is safe to stand on again.
    const fade = Math.max(0, Math.min(1, this._lavaT));
    for (let i = 0; i < this._lavaCreep.length; i++) {
      const gx = (i % 3) - 1;
      const gz = ((i / 3) | 0) - 1;
      this.effects.creepSet(
        this._lavaCreep[i], gx * LAVA_FLOOR_STEP, gz * LAVA_FLOOR_STEP,
        LAVA_FLOOR_R, CREEP_LAVA, fade * 0.8
      );
    }
    // WHAT IS STANDING ON THE FLOOR, AND WHAT IS NOT. `pos.y` is the surface a
    // body is standing on for a ground enemy and a real altitude for a flier,
    // so one test answers both: anything up on the terrain is out of it, and
    // anything in the air is over it. The 0.8 is the same figure _updateHazard
    // uses for the player, so "in it" means one thing everywhere in the game.
    for (const e of this.enemies) {
      if (e.dead || e.pos.y >= LAVA_FLOOR_CLEAR) continue;
      // Refreshed while they stand in it and left to run down when they climb
      // out, the rule every fire in this game follows.
      e.applyStatus('burn', 2, this.player.fireTickDamage);
    }
    if (this.player.pos.y >= LAVA_FLOOR_CLEAR) return;
    // WADING BOOTS names lava, not just the circular hazard implementation.
    // The active item's arena-wide floor takes this separate height-test path,
    // so it has to pay the same slowdown here or the same surface would obey
    // two different rules depending on who poured it.
    if (this.player.mods.wadingSlow > 0) {
      this.player.wadingEnd = Math.max(this.player.wadingEnd, this.time + 0.12);
      return;
    }
    // THE PLAYER BURNS ON THE SHARED FIRE'S TERMS, and nothing else: one
    // status, refreshed while they stand here, billed through the same drain
    // every fire in the game uses. The floor used to keep a second ledger on
    // top - a ground rate carved out of the burn's own - and the carve was
    // the entire bug: a status refused is a floor that cannot bill, which is
    // exactly what a status immunity pays for. Holding the total at a magma
    // patch's 12 was never worth two accounts to keep in step; the floor
    // burns a touch kinder than the magma's trail and the burn's own tail
    // still makes leaving early worth something.
    //
    // Through _afflictPlayer rather than straight onto the player, because
    // that is where `invulnEnd` is checked: an item that set the player
    // alight mid-AEGIS would break the one item AEGIS exists to be.
    this._afflictPlayer('fire', LAVA_BURN_SECONDS);
  }

  // Hands the stamps back. Called by the item's end(), by _clearHazards - so a
  // wave ending takes the floor with it - and by _lavaFloorStart, so a second
  // press cannot leak the first press's handles into a pool only thirty deep.
  _lavaFloorEnd() {
    for (const h of this._lavaCreep) this.effects.creepRelease(h);
    this._lavaCreep.length = 0;
    this._lavaT = 0;
  }

  /**
   * SYNTHESIZER and MIDI CABLE, the two picks that reroll a slot at the wave
   * clear. One method for both because they answer the same question - what
   * is the build carrying into the shop? - and are paid on the same edge,
   * after the wave's payouts and before the totems rise, so the player shops
   * against what the rerolls left them.
   *
   * RETURNS the names of what changed, for the clear banner: the banner is
   * the pick's only readout, because a rental or a rerolled item that went
   * unannounced would read as the stats moving on their own.
   *
   * @returns {{synth: ?string, midi: ?string}}
   */
  _rerollWaveItems() {
    const p = this.player;
    const out = { synth: null, midi: null };
    // SYNTHESIZER. The tenancy is the player's own method so the pick's
    // onTake and this clear can never disagree about the pool - see
    // Player.rollSynthPick.
    const synth = p.rollSynthPick();
    if (synth) {
      out.synth = PASSIVE_ITEMS[synth].name;
      this.effects.shockwave(p.pos, PASSIVE_ITEMS.synthesizer.theme, 7, 0.55);
    }
    // MIDI CABLE. Only ever something the player is already carrying - the
    // card reroutes the slot, and an empty slot has nothing to reroute. The
    // swap goes through giveActiveItem so the newcomer arrives FULLY
    // CHARGED, which is half of what the pick sells.
    if (p.mods.midiCable > 0 && p.activeItem) {
      const next = rollItem(p.activeItem);
      p.giveActiveItem(next);
      out.midi = ACTIVE_ITEMS[next].name;
      this.effects.burst(p.eyeInto(this._killPos), THEME_MIDI, 16, 4.5, 2.2, 0.5);
      this.sfx.itemTake();
    }
    return out;
  }

  // ---- BACKORDER, and LIFE INSURANCE's receipt ---------------------------

  /**
   * The parcel landing, and the policy paying out. One method because both are
   * the same shape: a thing that happened to the player somewhere the player
   * could not be told about it.
   *
   * BACKORDER IS DELIVERED HERE AND NOT BY THE RUNNING LIST because the
   * running list is torn down at every wave clear - see the note on the item.
   * So it is a deadline on the player, checked once a frame, and it arrives
   * through the shop and across a wave boundary exactly as promised.
   *
   * LIFE INSURANCE'S CLAIM IS PAID INSIDE Player.takeDamage, which is the only
   * place that can see every source of damage in the game - and which has no
   * effects, no HUD and no sound. It raises a flag; this is where the flag
   * becomes something the player can see.
   */
  _updateItemDeliveries() {
    const p = this.player;
    if (p.insuranceFx) {
      p.insuranceFx = false;
      this.effects.shockwave(p.pos, THEME_INSURED, 12, 0.9);
      this.effects.burst(p.eyeInto(this._killPos), 0xfff2b0, 44, 7, 4, 1.0);
      this.effects.addShake(0.4);
      this.ui.banner('CLAIM PAID');
      this.pad.rumble(0.9, 0.6, 260, 3);
      this.sfx.itemHeal2();
    }
    if (!p.backordered || this.time < p.backorderAt) return;
    p.backordered = false;
    p.backorderAt = 0;
    p.heal(25);
    this.effects.shockwave(p.pos, THEME_VITAL, 8, 0.7);
    this.effects.burst(p.eyeInto(this._killPos), 0x8affc1, 30, 6, 3, 0.8);
    this.ui.banner('DELIVERED  +25 HP');
    this.sfx.itemHeal2();
  }

  // Rolls the next wave's enemy queue and difficulty, and sets the pickup
  // budget for it. Enemies then trickle out of the queue on spawnTimer.
  startWave() {
    // The item row keeps wave-break hours. An unclaimed TOTEM set is
    // deliberately left standing into the next wave - that pick is still there
    // to be taken - but the box and Donation Machine standing through a fight
    // would be solid shot targets in a room the player is running around at
    // speed. They go whether or not anything was taken.
    this.mysteryBox.dismiss();
    this._dismissDonationMachine();
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
    // charged for - see the note on its entry in items/passive/index.js for why the reset
    // is a wave boundary rather than a clock.
    this.player.adrenalineStacks = 0;
    this._cfg = waveConfig(this.wave, this._themeSeed, HAVE_TYPE, this._forcedTheme);
    this.queue = this._cfg.queue;
    this.player.waveShots = 0;
    this._waveSpawned = 0;
    this._luckyCorpseSpawn = this.player.mods.luckyCorpse > 0
      && !this._cfg.boss && this.queue.length
      ? (Math.random() * this.queue.length) | 0 : -1;
    // CURTAIN CALL's address is a WAVE's, not a run's. Cleared here so the
    // crates can never land where the LAST wave's last body fell - a pick
    // claimed at a shop would otherwise pay out across the room on the first
    // clear that followed it, which reads as the item being broken rather than
    // as the address being stale.
    this._lastKillPos = null;
    this._startWaveCharge();
    this.spawnTimer = 0.8;
    this.waveState = 'active';
    // LATE FEE's clock. Absolute, and set beside the counter above so the two
    // can never disagree about when the wave began - boss and ground waves
    // alike, because both are "the current wave" to the card.
    this._waveStartedAt = this.time;
    this.bossFight = null;
    this.ui.setWave(this.wave);
    // WHOSE WAVE THIS IS, said at the top of it. The pass caption is three
    // seconds long and then gone; the wave after it can run for minutes, and a
    // player picking a controller back up needs the answer at the moment the
    // fight starts rather than only before it.
    // Already said at the pick in solo (see _cueWaveOpen); a second identical
    // caption on the same wave would just replay the animation for nothing.
    //
    // THE THEME LINE IS NOT SOLO-ONLY. Solo hears it at the pick; a match
    // cannot cue there (the pick ends the turn, and the caption would
    // announce a fight the next player has not started), so this banner is
    // the only one a versus player ever sees a block open with.
    if (!this._waveCued) {
      const c = this._themeCaption(this.wave);
      this.ui.banner(
        this.match
          ? this.match.label() + '  \u00b7  WAVE ' + this.wave
          : 'WAVE ' + this.wave,
        c ? c.text : '',
        c && c.color);
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
    // BALLAST TANKS and FIRST FRUITS, on the same signal again - a wave's four
    // grants are armed in one place so none of them can be forgotten by a
    // change to the wave boundary. See Player.armWaveGrants.
    const shieldBefore = this.player.shield;
    this.player.armWaveGrants();
    if (this.player.shield > shieldBefore) {
      this.effects.shockwave(this.player.pos, THEME_BALLAST, 6, 0.5);
      this.effects.burst(this.player.eyeInto(this._killPos), THEME_BALLAST, 22, 5, 2.6, 0.6);
      this.sfx.pickupShield();
    }
    this._reliefT = RELIEF_INTERVAL;
    if (this._cfg.boss) {
      this._spawnBoss(this._cfg.bossKey);
      if (this.player.mods.luckyCorpse > 0 && this.bossFight && this.bossFight.parts[0]) {
        this.bossFight.parts[0].luckyCorpse = true;
      }
    }
  }

  // ---- boss waves --------------------------------------------------------

  // Places the boss and opens the fight. Unlike a normal spawn this ignores
  // the drip: the boss is there from the first second, and the adds arrive
  // around it.
  _spawnBoss(key) {
    const sc = bossScale(this.wave);
    const def = ENEMY_TYPES[key];
    // New themes carry their boss's display name with their own stat block.
    const name = def.name || BOSS_NAMES[key] || key.toUpperCase();
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
      name,
      parts: [boss],
      totalMaxHp: boss.maxHp,
      addTimer: 3,
      maxAdds: this._cfg.maxAdds,
      addInterval: this._cfg.addInterval,
      // Keep crossings when a full floor delays the earned ammunition.
      bleedAt: 0,
      ammoOwed: 0,
      // LONG HAUL's clock. Absolute game time, and a boss fight never crosses
      // a versus handoff (a turn ends on the PICK after the wave), so there is
      // nothing here to rebase - see PLAYER_CLOCKS in versus.js.
      startedAt: this.time,
      note: '',
      state: '',
    };
    this.effects.burst(at, def.color, 40, 8, 3, 1.0);
    this.effects.shockwave(at, def.color, 8, 0.7);
    this.effects.addShake(0.4);
    this.ui.banner(name);
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
    const luckyChild = e.luckyCorpse ? ((Math.random() * 2) | 0) : -1;
    // Splitting is survival, not a kill. Carry LUCKY CORPSE's mark into one
    // random child so the six drops belong to a body the player actually kills.
    e.luckyCorpse = false;
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
      child.luckyCorpse = i === luckyChild;
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
    // Turrets, anchors, pylons and grubs are the boss's own attack, not
    // adds, and must not eat the trickle budget: three of them standing
    // would otherwise stop the wave sending anything else at all. It matters
    // more for the Pale Crown's anchors than it ever did for Colossus's
    // turrets - the anchors are up for most of that fight, so counting them
    // would mean the Crown's shell phases were also its quiet phases, which
    // is the opposite of the intent. A grub is here for the same reason: a
    // Broodmother refilling her brood should never silence the wave's own
    // trickle, and neither should an oviger's eggs.
    let adds = this.enemies.length - bf.parts.length;
    for (const e of this.enemies) {
      if (e.type === 'turret' || e.type === 'anchor' || e.type === 'pylon'
        || e.type === 'grub') adds--;
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
    // MIRRORED, AND SILENTLY. Only one of the players is holding the
    // controller for a boss, and letting the bounty follow the controller
    // would make the run's largest single payout a matter of whose turn wave
    // ten happened to be. The other players' balances are simply larger when
    // they next look at them - announcing it would be telling them about a
    // fight they did not have. Scaled by THEIR Midas and THEIR flawless
    // streak, not this player's, which is why the snapshot caches both
    // multipliers: a benched build is plain data, and neither number can be
    // recomputed from it once the live Player belongs to somebody else.
    // EVERY benched survivor, not just "the other one". With eight players
    // the boss is one turn in eight, and a bounty that followed the
    // controller would make the run's largest single payout a matter of whose
    // turn wave ten happened to be - seven times over. An eliminated slot is
    // skipped because it is never restored: paying it is paying nobody.
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
    // UNDERFED, at the SPAWN and not on `_cfg`. The wave config is built once
    // when the wave starts, so folding it in there would mean a pick taken at
    // the shop did nothing at all until the wave after next - and would leave
    // the arena holding two generations of enemy on two different health
    // curves. Bosses are spawned by _spawnBoss and are deliberately not touched
    // (see the note on the pick).
    const e = new Enemy(
      type, j, this._cfg.hpScale * this.player.mods.enemyHpMult,
      this._cfg.speedScale, this._cfg.dmgScale
    );
    if (this._waveSpawned === this._luckyCorpseSpawn) e.luckyCorpse = true;
    this._waveSpawned++;
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
    // The room stays standing - the screen is drawn OVER the arena as it fell,
    // row and all, so the row is not dismissed here (see _leaveRun).
    this._leaveRun({ dismissRow: false });
    const eye = this.player.eyeInto(this._killPos);
    this.effects.burst(eye, 0x4ef3ff, 40, 6, 3, 0.9);
    this.comboKills = 0;
    this.comboTimer = 0;
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
   * player in an eight-handed match plays roughly one wave in eight - but the
   * shop's prices are keyed to the WAVE, not to how many of them they fought
   * (see blockPrice in items/passive/index.js). Left alone they would meet wave-twenty
   * prices on an eighth of a run's income, and the box would simply be out of
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
   * HOUSE MONEY's rate, read at the drop rather than cached anywhere: the
   * window is a fact about the WAVE's clock, and _waveStartedAt is nulled at
   * the intermission precisely so nothing can pay double-time for money that
   * was earned in a fight. Returns a multiplier rather than a boolean so the
   * drop line stays arithmetic.
   *
   * UNDEFINED-SAFE on purpose: _waveStartedAt is deliberately undefined until
   * the first wave books it (see the intermission branch), and a helper that
   * threw on a fresh boot would be a helper that only ever failed in tests.
   */
  _houseMult() {
    const m = this.player.mods;
    if (m.donationHouse <= 0) return 1;
    if (this.waveState !== 'active' || this._waveStartedAt === undefined) return 1;
    return this.time - this._waveStartedAt < m.donationHouse ? 2 : 1;
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
    // FIRE SALE rides in beside MIDAS TOUCH's multiplier and the flawless
    // streak, so what the pick doubles is the money that actually LANDS - the
    // orbs are visibly bigger, and the item charge that comes back out of this
    // is deliberately NOT doubled, because charge is priced on the enemy's own
    // value and nothing that touches money may reach it (see _bankKillCharge).
    //
    // HOUSE MONEY rides on the same line for the same reason: EARNED here
    // means dropped, which is the one moment the payout exists - and doubling
    // it at the drop makes the orbs themselves visibly worth double for the
    // window, exactly the read a MIDAS run gets. Gated on the wave being
    // LIVE, so the clear's own vacuum and INTEREST are paid at face value.
    const paid = amount * this.player.mods.creditMult * this.flawlessMult()
      * this.player.mods.lootMult * this._houseMult();
    // THE TWO FIGURES ARE DIFFERENT ON PURPOSE, and collapsing them back into
    // one is the mistake this comment exists to stop.
    //
    // What is SPAWNED takes the player split, because credits are banked
    // across turns and the split is restoring a run's worth of them.
    //
    // What is RETURNED does not, because it is the item charge (see
    // _collectOrb), and charge is earned and spent inside a single fight.
    // Multiplying it would not be compensating a many-handed player for the
    // waves they never played - it would hand them N times the active-item
    // uptime in the wave they are actually in, which is just being stronger.
    const payout = split ? paid * this._playerMult() : paid;
    // REMOTE DEPOSIT. The split happens BEFORE anything reaches MoneyOrbs:
    // half of the payout goes directly into the balance and the untouched
    // half is still represented by ordinary floor orbs with ordinary magnet,
    // lifetime and pickup behavior. Splitting each existing orb after spawn
    // would either need a second visual pool or make a full-looking orb worth
    // half of what its size says.
    const siphon = Math.max(0, Math.min(1, this.player.mods.donationCreditSiphon));
    const banked = payout * siphon;
    if (banked > 0) this.addCredits(banked);
    this.money.spawn(pos, payout - banked, maxOrbs, spread, hold);
    // The figure paid comes back out for the item charge, which is handed over
    // as those orbs are collected and in proportion to what each one is worth -
    // see _collectOrb. Nothing about the MONEY itself needs it.
    // Item charge is distributed over what remains collectable on the floor.
    // Its total still comes from the enemy's value in _bankKillCharge; this is
    // only the denominator that decides how quickly that total arrives.
    return paid * (1 - siphon);
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
    const full = this.player.health >= this.player.maxHealth;
    const paid = full && this.player.mods.coinLaundry > 0
      ? value * (1 + this.player.mods.coinLaundry) : value;
    this.credits += paid;
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

  // A narrow pickup hook for machine rewards that grant credits immediately.
  // Player owns the item catalogue but Game owns the wallet, so passing Game
  // as this context keeps the reward definition in its own directory without
  // putting an item id into either core class.
  addCredits(value) {
    if (!(value > 0)) return 0;
    this.credits += value;
    this._creditsDirty = true;
    return value;
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
   * The two damage-over-time effects use their fixed status bases, exactly as
   * VENOM and INCENDIARY do. Generic weapon damage never changes either one.
   */
  _conduit() {
    const m = this.player.mods;
    const r2 = m.conduit * m.conduit;
    const p = this.player.pos;
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
        const power = theirs === 'burn' ? this.player.fireTickDamage
          : theirs === 'poison' ? this.player.poisonTickDamage : 0;
        e.applyStatus(theirs, Math.min(t, CONDUIT_TICK * 2), power);
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
   *
   * QUORUM runs the same placement off ten kills instead of a blow taken -
   * THE SAME CLASS, THE SAME ROUND, THE SAME BEAT, and deliberately so: this
   * is the pick that answers a run that is WINNING where PANIC TURRET answers
   * one that is losing, and two guns that behaved differently would be two
   * things to learn rather than one thing bought two ways. Its own FLAG
   * (`quorum`, not `panic`), so a run holding both picks gets both caps rather
   * than one of them eating the other's.
   */
  _panicTurret() {
    const m = this.player.mods;
    if (this._placeTurret('panic', m.panicMax, m.panicLife)) this.sfx.itemDeploy();
  }

  _quorumTurret() {
    const m = this.player.mods;
    if (this._placeTurret('quorum', m.quorumMax, m.quorumLife)) {
      this.effects.shockwave(this.player.pos, THEME_QUORUM, 4, 0.4);
      this.sfx.turret();
    }
  }

  /**
   * BAD OMEN. Every thirteenth booked kill, everything left standing catches
   * fire - booked, not killed-by-the-player, on VENDING MACHINE's terms: the
   * counter asks when a body died, not what killed it, and a poison tick
   * finishing somebody across the room is as much a kill as the shot was.
   *
   * THE BURN IS LIGHTER'S, at the shared fire tick for the table's own four
   * seconds, rather than a damage figure of its own: BAD OMEN pays for AREA,
   * and the whole room's worth of burning bodies is what the card bought.
   * Every one of them wears the tint and drips the embers the status owns,
   * so the effect announces itself without a single particle spent here.
   */
  _badOmen() {
    const m = this.player.mods;
    this.player.omenKills++;
    if (this.player.omenKills < m.donationOmenEvery) return;
    this.player.omenKills = 0;
    let burned = 0;
    for (const e of this.enemies) {
      // The body whose death paid for this is dead and off the list's future;
      // everything still standing takes it, exactly as "all enemies" reads.
      if (e.dead) continue;
      e.applyStatus('burn', m.donationOmenTime, this.player.fireTickDamage);
      burned++;
    }
    if (!burned) return;
    this.ui.banner('BAD OMEN');
    this.effects.shockwave(this.player.pos, THEME_OMEN, 18, 0.6);
    this.effects.addShake(0.2);
    this.sfx.impact();
    this.pad.rumble(0.6, 0.5, 220, 3);
  }

  /**
   * GOLD STAR. Ten clean kills buy a permanent damage step, and the streak
   * only has to survive KILLS - it is broken by a hit (see the cleanKills
   * reset in _hurtPlayer, which this counter resets beside) and by nothing
   * else, so a wave boundary or a shop cannot rob a player mid-ladder.
   *
   * COUNTED ON THE PLAYER, paid through rebuildMods, on NO-HIT BONUS's exact
   * terms: the stacks are events the run earned and the build cannot replay
   * them away. Counting STOPS at the cap rather than running past it, for the
   * reason addNoHitStack stops - a number that keeps climbing after it stops
   * paying is a lie the HUD would be telling all run.
   */
  _goldStarKill() {
    const m = this.player.mods;
    const maxStars = Math.round(m.donationGoldCap / m.donationGoldStep);
    this.player.goldKills++;
    if (this.player.goldKills < m.donationGoldEvery) return;
    if (this.player.goldStars >= maxStars) {
      this.player.goldKills = 0;
      return;
    }
    this.player.goldKills = 0;
    this.player.goldStars++;
    this.player.rebuildMods();
    this.player.goldFx = true;
  }

  /**
   * The placement the two picks above share: count the caller's flag against
   * its cap, and if there is room, drop the item's own turret beside the
   * player.
   * @returns {boolean} whether one was placed, so the caller plays its sound.
   */
  _placeTurret(flag, max, life) {
    let live = 0;
    for (const d of this._deployed) if (d[flag] && !d.dead) live++;
    if (live >= max) return false;
    const p = this.player.pos;
    // Beside the player rather than under them, so the thing they can see
    // arriving is not inside their own feet. A metre and a half, in a random
    // direction, which is close enough to be cover and far enough to be a gun.
    const a = Math.random() * Math.PI * 2;
    const t = new Turret(
      this, p.x + Math.cos(a) * 1.5, p.z + Math.sin(a) * 1.5,
      this.player.getEffectiveDamage(this.player.weapon.damage),
      // The player's own feet, so a turret dropped on a platform stands on
      // the platform beside them rather than on the floor below it.
      p.y
    );
    t[flag] = true;
    t.life = life;
    this.deploy(t);
    return true;
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

  // Radial damage with linear falloff, shared by every explosion in the game -
  // Detonator, Blast Corpse, Crystallize, Delayed Fuse, Arc Rounds' splash.
  // `skip` is the enemy that is already taking the hit directly, and
  // `hitPlayer` is what separates the two: your own impact blasts cannot hurt
  // you, but a corpse going off in your face is the whole cost of the pick.
  //
  // THE DISTANCE IS TO THE BODY, NOT TO THE POINT THE BODY STANDS ON, and that
  // distinction is the whole of a bug DELAYED FUSE lived with: a fuse sticks
  // where the round actually landed, so a shot into a Colossus's chest parked
  // its blast two and a half metres above `pos` - and against a 2.5m fuse
  // radius measured from `pos`, a point on the floor under a six-metre boss,
  // the explosion found nothing and the item read as dealing no damage to
  // Colossus at all. It was never about the fuse: EVERY blast in the game was
  // measuring to the wrong place, and it only showed on the enemies big enough
  // for the wrong place to be metres away from the right one.
  //
  // So the enemy is treated as the SPHERE it is actually shot at (Enemy.hitR /
  // hitY - the same hit sphere the player's own rounds test against), and the
  // falloff runs from its SURFACE: a blast touching a body deals full damage
  // and one `radius` clear of it deals none. For the ordinary roster - hit
  // spheres around half a metre, centred near chest height - this moves almost
  // nothing. For a boss it is the difference between working and not.
  _blast(point, dmg, radius, skip, hitPlayer) {
    for (const e of this.enemies) {
      if (e === skip || e.dead) continue;
      const dx = e.pos.x - point.x;
      const dy = e.pos.y + e.hitY - point.y;
      const dz = e.pos.z - point.z;
      const d = Math.max(0, Math.sqrt(dx * dx + dy * dy + dz * dz) - e.hitR);
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
   * BIRD DOG's own figure is Seeker at full rank (see items/passive/index.js: 0.105 per
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
        // NO HEADSHOT ON A HOMED ROUND, even when the curve happens to land on
        // the head sphere. Seeker rescues a shot that MISSED; the aim it is
        // standing in for was at the body centre, and paying a headshot for it
        // would make the passive item that fires itself the best way to get one.
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
    // write into `mods` - see itemCrit in js/items/active/index.js.
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
    //
    // HALF TRUTH, decided on the same first-crit-of-the-shot edge: the tally
    // is the run's count of critical HITS (one per trigger pull, on the house
    // rule every other crit effect follows), and the odd ones are the doubled
    // ones - SQUARE WAVE's parity, so the first crit a fresh pick lands reads
    // as the ordinary one and the second as the windfall. `_shotCritDouble`
    // carries the answer to _hitMult, which every body this shot lands on
    // reads; the decision is made here because this is the one place that
    // knows the shot's crit has actually met a body.
    if (crit && m.donationHalfTruth > 0 && !this._shotWasCrit) {
      this._shotCritDouble = (this.player.critTally++ & 1) === 1;
    }
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
   * @param {boolean} [head]  whether the round landed on the head sphere
   */
  _hitMult(en, crit, head = false) {
    const m = this.player.mods;
    let k = crit ? m.critMult : 1;
    // THE HEADSHOT, and it belongs here rather than anywhere nearer the body
    // for one reason: it is a question about WHERE the round landed, which is
    // the only kind of question this function answers. It multiplies with the
    // crit instead of replacing it - a crit is about the shot and a headshot is
    // about the aim, and a player who lines up a Dead Center round on a face
    // has earned both.
    //
    // It is applied BEFORE takeDamage, so armour, WEAK POINT and the freeze
    // bonus all still have their say: a Colossus's plating resists a headshot
    // exactly as hard as it resists everything else, which is what keeps the
    // one enemy built around a weak point from being trivially answered by
    // aiming slightly higher.
    if (head) k *= HEADSHOT_MULT;
    // PITY PARTY's five, and it REPLACES the crit multiplier rather than
    // stacking on it - the card says a 5x crit and 5x is what it has to be,
    // whatever else the crit family has done to critMult. Tested after the
    // crit branch above so the ordinary multiplier is simply overwritten; the
    // headshot and the range picks still compose, because those are questions
    // about WHERE, and this is a question about the shot.
    if (this.player.pityShot && crit && m.pityMult > 0) {
      k = (k / (m.critMult || 1)) * m.pityMult;
    }
    // HALF TRUTH. Doubles the crit's own damage, ON TOP of whatever the crit
    // family has done to critMult rather than replacing it: the card says the
    // critical hit deals double, and a Dead Center build that doubled one of
    // these has earned both numbers. Headshot and the range picks still
    // compose, because - like the pity branch above - this is a question
    // about the SHOT and those are questions about WHERE it landed.
    if (crit && m.donationHalfTruth > 0 && this._shotCritDouble) k *= 2;
    // LONG HAUL. Uncapped, and the only uncapped number in either pool that is
    // measured in seconds - the ceiling is that the fight ENDS. It belongs here
    // because it is a question about what the hit landed ON, which is the only
    // kind this function answers.
    // `startedAt` is tested for PRESENCE, not for sign. Game time only ever
    // grows from zero in a real run, so `>= 0` looked equivalent - and is not:
    // it is the one form of this test that a fixture setting the clock back to
    // stage a long fight silently fails, which is exactly how a suite finds
    // out that the ramp never ran.
    if (m.longHaulStep > 0 && en.boss && this.bossFight
      && this.bossFight.startedAt !== undefined) {
      const lasted = this.time - this.bossFight.startedAt;
      if (lasted > 0) k *= 1 + m.longHaulStep * Math.floor(lasted / m.longHaulEvery);
    }
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
    // SOFT POINTS. A question about the BODY, which is why it is here and not
    // in the trigger: the body is either slowed or it is not when the round
    // arrives, and every source of slow in the game - CRYO, the ice a sprint
    // lays, whatever a theme freezes with - is covered by one test.
    if (m.softPoints > 0 && en.status.slow > 0) k *= 1 + m.softPoints;
    // TENDERIZER. Full health is read BEFORE the blow, on OVERKILL's terms:
    // the body either arrived at this hit untouched or it did not, and a
    // first pellet that peeled one point off would rob the eight behind it of
    // the bonus - so it is measured per SHOT, not per pellet, off `hp` before
    // anything lands. Per-pellet would make a scattergun the pick's worst
    // friend, which is backwards.
    if (m.tenderizer > 0 && en.hp >= en.maxHp) k *= 1 + m.tenderizer;
    // LATE FEE. The wave's own clock, uncapped like LONG HAUL's - the ceiling
    // is that the wave ENDS. `_waveStartedAt` is set beside the counter in
    // startWave, so boss waves and ground waves read the same figure, and the
    // reset is the boundary itself rather than a timer anything could miss.
    if (m.lateFee > 0 && this._waveStartedAt !== undefined) {
      const run = this.time - this._waveStartedAt;
      if (run > 0) k *= 1 + m.lateFee * Math.floor(run / m.lateFeeEvery);
    }
    return k;
  }

  // Everything one pellet does to the enemy it landed on.
  //
  // Shared by the straight shot and by Seeker's homed shot, so the two cannot
  // drift: status, chaining, knockback and Detonator have to behave the same
  // whether the player's aim was on target or the round curved onto it.
  // `dir` is the direction the shot ARRIVED from, which is what armour reads.
  // `head` is carried only so the damage number can say so - the doubling is
  // already inside `dealt` (see _hitMult).
  _landShot(en, point, dir, dealt, burst, crit = false, head = false) {
    const m = this.player.mods;
    if (head) this._shotWasHead = true;
    // A warded enemy eats the shot whole (see Enemy.takeDamage). It gets the
    // stone-grey spark rather than the ordinary yellow one, so a player
    // emptying a magazine into a group under a warden's dome is told why
    // nothing is dying by the hits themselves, not just by the health bar.
    if (en.wardT > 0) {
      this.effects.impact(point, 0xc9d2dd, burst, 2.5, 1.2, 0.26);
      return;
    }
    // CHARITY CASE, before everything inline below: for its window the round
    // LANDS but does no damage, so it must not eat a capacitor's plate, stick
    // a DELAYED FUSE, or tick a status - the card says the gun deals NO
    // damage, and all of those are the gun's. The pellet just collects: one
    // health per trigger pull that connects, banked in shoot() off `hitAny`,
    // beside HAEMOPHAGE's spend. The spark is the heal's own green, so a
    // magazine emptied into the crowd reads as alms rather than as misses.
    if (this.player.charityEnd > this.time) {
      this.effects.impact(point, THEME_VITAL, 4, 2.5, 1.4, 0.25);
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
      en.takeDamage(dealt, false, dir.x, dir.z, point, crit, head);
      if (m.mitosis > 0 && en.dead && before > 0) {
        this._spawnMitosis(en.pos, dealt * m.mitosis, 0, new Set([en.id]));
      }
      if (m.overkill > 0 && en.dead && dealt > before) {
        this._carryOver(en, dealt - before);
      }
      // ARMATURE. The same spill OVERKILL walks to a neighbour, banked onto
      // the NEXT SHOT instead - and capped at one kill's spill so a chain of
      // small kills cannot compound into infinity. The two picks are
      // deliberately compatible: a run holding both spills the same number
      // twice over, to two different places.
      //
      // NOT ARMED ON A CORPSE THAT ATE NOTHING: `dealt > before` is the same
      // test OVERKILL makes, and an armature that banked a round which was
      // fully absorbed by armour would be making damage out of nothing.
      if (m.armature > 0 && en.dead && dealt > before) {
        this.player.armatureBank = Math.max(
          this.player.armatureBank, dealt - before
        );
      }
      // BEDBUGS. A quarter of what the round was worth, owed to the same body
      // two seconds from now.
      //
      // PER PELLET, and deliberately above the _shotHits guard rather than
      // below it: the card says a fraction of every HIT'S damage, and a
      // scattergun shell that put eight pellets into one chest hit it eight
      // times. This is the one place in the per-pellet half of this method that
      // is supposed to be here.
      //
      // BOOKED OFF `dealt`, which is what the SHOT was worth and not what
      // landed - armour and the ward have not had their say yet at this point,
      // and they have their say again when the bite arrives through hurtEnemy.
      // Charging the reduction twice would make the pick worth a quarter of a
      // quarter against exactly the armoured types it is meant to wear down.
      //
      // AND THE BITE CANNOT BITE. It is paid through hurtEnemy in
      // _updateBites, which does not come back through here, so a hit can
      // never schedule a hit that schedules a hit.
      if (m.bedbugs > 0 && !en.dead) {
        this._bites.push({
          en, dmg: dealt * m.bedbugs, at: this.time + m.bedbugsDelay,
        });
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
      en.applyStatus(
        'poison', m.poisonTime * m.dotTime,
        this.player.poisonTickDamage * m.poisonPower * m.dotPower
      );
    }
    if (m.burnTime) {
      en.applyStatus(
        'burn', m.burnTime * m.dotTime,
        this.player.fireTickDamage * m.burnPower * m.dotPower
      );
    }
    if (m.slowTime) en.applyStatus('slow', m.slowTime);
    if (m.fearTime) en.applyStatus('fear', m.fearTime);
    // LIGHTER and SNAKE, on the same terms the four above follow: per SHOT per
    // body, never per pellet - a scattergun that crits puts one burn on a
    // chest however many pellets carried it. The strengths are the dedicated
    // picks' own (Incendiary's fire, Venom's poison), because what the machine
    // reward buys is the TRIGGER - a crit instead of every hit - not a weaker
    // version of the element.
    if (crit) {
      if (m.donationCritBurn > 0) {
        en.applyStatus('burn', m.donationCritBurn, this.player.fireTickDamage);
      }
      if (m.donationCritVenom > 0) {
        en.applyStatus('poison', m.donationCritVenom, this.player.poisonTickDamage);
      }
    }
    // WAVETABLE. One more status, paid for by the magazine the round left
    // rather than by a pick: whatever element the current magazine carries
    // lands with the hit, on the same per-SHOT terms the four above follow -
    // a scattergun puts one element on a chest however many pellets it did
    // it with. The impact flash carries the element's own colour, which is
    // the only readout of which slot the bank is on: there is nowhere on the
    // HUD to print it, exactly as FOUR HUMOURS has none.
    if (m.wavetable > 0) {
      const el = WAVETABLE[this.player.wavetable % WAVETABLE.length];
      if (el.status === 'burn') {
        en.applyStatus('burn', el.dur, this.player.fireTickDamage * el.power);
      } else if (el.status === 'poison') {
        en.applyStatus('poison', el.dur, this.player.poisonTickDamage * el.power);
      } else {
        en.applyStatus(el.status, el.dur);
      }
      this.effects.impact(point, el.color, 8, 4, 2, 0.3);
    }
    // AMMO ALCHEMIST, WAVETABLE's temporary cousin: one element, rolled by
    // the ammo pickup that armed it, carried by every shot for the window the
    // crate paid for. Per SHOT on the same terms the block above follows, and
    // the impact flash is the element's own colour for the same reason - the
    // colour is the only readout of which of the five this round carried.
    if (this.player.alchemistEl && this.player.alchemistEnd > this.time) {
      const el = this.player.alchemistEl;
      if (el.status === 'arc') this._chain(en, dealt * 0.6, 7);
      else if (el.status === 'burn') {
        en.applyStatus('burn', el.dur, this.player.fireTickDamage * el.power);
      } else if (el.status === 'poison') {
        en.applyStatus('poison', el.dur, this.player.poisonTickDamage * el.power);
      } else {
        en.applyStatus(el.status, el.dur);
      }
      this.effects.impact(point, el.color, 8, 4, 2, 0.3);
    }
    // SPLASHBACK. Whatever is on the PLAYER right now, on the body they just
    // hit. Below the passive item statuses because it is one more of them, and
    // in the per-SHOT half of this method (under the _shotHits guard) because
    // it is a question about the trigger pull rather than about the pellet -
    // the same rule the four above it follow.
    if (m.splashback > 0) this._splashback(en);
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
    // SIDECHAIN COMPRESSION. The press has found its first body, so the
    // whole room takes the pulse: one flat point at everything else alive,
    // through hurtEnemy so the kill, the bounty and the combo are booked
    // exactly as THUNDERCLAP's are. Latched once per press on DETONATOR's
    // pattern - a scattergun or a piercing round is one kick, not one per
    // body it found - and the ring is only thrown when there was something
    // to pump, so a clean 1v1 pays nothing but its own damage.
    if (m.sidechain > 0 && !this._sidechainHit) {
      this._sidechainHit = true;
      let pulsed = 0;
      for (const other of this.enemies) {
        if (other === en || other.dead) continue;
        if (this.hurtEnemy(other, m.sidechain)) pulsed++;
      }
      if (pulsed > 0) {
        this.effects.shockwave(this.player.pos, THEME_SIDECHAIN, 22, 0.5);
      }
    }
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
    // ONE BODY, ONE HIT, wherever on it the round landed - and if the round
    // passed through the HEAD at all, that is what it landed on.
    //
    // Both of those need saying because the two spheres OVERLAP, and on the
    // heavier types the head sits inside the body sphere entirely: a tank's
    // body sphere reaches 2.1m and its head is a small sphere at 1.8m, well
    // within it. So a round placed squarely on the face enters the body's front
    // surface FIRST and the nearest-hit-wins rule would have called every
    // headshot in the game a body shot - which is exactly what it did.
    //
    // The pass below therefore asks a different question: did this round go
    // through the head sphere anywhere along its length. A straight line that
    // crosses a head has crossed the head, whichever surface it met first, and
    // a line that misses it never touches it however close it came to the chin.
    const seen = this._hitOnce;
    seen.clear();
    const headed = this._hitHead;
    headed.clear();
    for (const h of hits) {
      if (h.object.userData.head !== true) continue;
      const en = h.object.userData.enemy;
      if (en && !en.dead) headed.add(en);
    }

    // THE BOUNCES THIS PELLET HAS LEFT. SKIPSTONE starts with one, off the
    // floor only; ECHO starts with two, off any surface the room owns. When
    // a build holds both the better card answers - ECHO's two supersets
    // SKIPSTONE's one, and a bounce budget that added them would be a pick
    // nobody printed. Per PELLET, like everything in this walk: the count is
    // this round's own flight.
    let bouncesLeft = m.echo > 0 ? m.echo : (m.skipstone > 0 ? 1 : 0);
    const bouncesOffWalls = m.echo > 0;
    // And the muzzle-equivalent the final tracer is drawn FROM - usually the
    // gun itself, but after a bounce it is the floor's bounce point, so the
    // tracer never draws a straight line through solid ground to reach it.
    const legStart = this._legStart;
    legStart.copy(muzzle);
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
    // A pellet that stopped on shop furniture was aimed there on purpose.
    // Seeker must not treat that as a miss and steal it.
    let hitProp = false;

    // An INDEX loop rather than a for-of: SKIPSTONE re-casts the ray at the
    // floor and needs to walk the fresh hit list from its top, which a
    // for-of over the same array cannot do without allocating a second one.
    for (let hi = 0; hi < hits.length; hi++) {
      const h = hits[hi];
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
      const donationMachine = h.object.userData.donationMachine;
      if (donationMachine) {
        // Cabinets are cover and give impact feedback, but a donation is a
        // deliberate Use action only. This branch intentionally never calls
        // the payment path.
        hitProp = true;
        end = h.point;
        this.effects.impact(
          end, donationMachine.config.color,
          w.pellets > 1 ? 2 : 4, 2.5, 1.2, 0.26
        );
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
            // Aimed at the REAL player, through _spawnProjectile's aim
            // override: this is the player's own round coming back, not an
            // enemy's, and it does not care what the crowd believes it sees.
            this._spawnProjectile(h.point.x, h.point.y, h.point.z, 'aegis', 1, 0, this.player);
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
        // SKIPSTONE and ECHO. A round that stops on the ROOM has not
        // necessarily stopped: it comes off the surface and carries on, at
        // full damage, along the reflected ray. Only the room's own meshes
        // reach this branch - every branch above is shop furniture or a
        // body, and all of them stop the round dead - so the question left
        // is WHICH surfaces pay, and that is the two cards' whole
        // difference: SKIPSTONE bounces off the FLOOR alone (the plane at
        // y=0, identified by height exactly as it always was), ECHO off
        // anything with a face to reflect off.
        //
        // THE LAST TOUCH IS THE LAST. `bouncesLeft` is per PELLET, so a
        // round that falls to the floor again - or meets a third wall -
        // simply stops, one bounce fewer than the card promised never being
        // a thing the walk allows. A hit with no FACE to reflect off is a
        // degenerate the normal branch has no answer for, and stops too.
        const floor = h.point.y <= 0.06;
        if (bouncesLeft > 0 && (bouncesOffWalls ? !!h.face : floor)) {
          bouncesLeft--;
          // Lift the origin off the surface by a hair so the reflected ray
          // does not immediately re-intersect the surface it just left, and
          // RE-CAST into the same list - the walk restarts from the top of
          // the fresh hits, so everything downstream (the pierce count, the
          // head pass, the dedup sets) is shared with the forward flight
          // exactly as though the bounce were one longer ray.
          //
          // THE BOUNCE'S OWN LEG is drawn now, from where the pellet was
          // FLYING at the touch - `legStart`, which is the muzzle on the
          // first bounce and the last touch point on the second. SKIPSTONE's
          // original made this call with `muzzle`, which was safe only
          // because it bounces once: on ECHO's second bounce that drew a
          // straight streak out of the barrel to a point the shot never
          // flew from - a phantom second shot. The bent streak is the whole
          // tell that the bounce happened; the final leg is closed by the
          // tracer at the bottom of this function.
          this.effects.tracer(legStart, h.point, this.player.muzzle);
          if (bouncesOffWalls) {
            // THE SURFACE'S OWN NORMAL, in world space, reflected properly.
            // The floor is a rotated plane and the walls scaled boxes, so
            // the local face normal has to be walked through the object's
            // transform before it can answer a world-space ray - and for
            // the floor the reflection this produces is exactly the
            // y-inversion SKIPSTONE's branch performs by hand.
            this._bounceN.copy(h.face.normal).transformDirection(h.object.matrixWorld);
            const d = ray.ray.direction;
            d.addScaledVector(this._bounceN, -2 * d.dot(this._bounceN)).normalize();
            legStart.copy(h.point).addScaledVector(this._bounceN, 0.05);
            this.effects.impact(h.point, THEME_ECHO_BOUNCE, 3, 2.5, 1.2, 0.22);
          } else {
            legStart.copy(h.point);
            legStart.y += 0.05;
            ray.ray.direction.y = -ray.ray.direction.y;
            ray.ray.direction.normalize();
            this.effects.impact(h.point, PASSIVE_ITEMS.skipstone.theme, 3, 2.5, 1.2, 0.22);
          }
          ray.ray.origin.copy(legStart);
          hits.length = 0;
          ray.intersectObjects(targets, false, hits);
          hi = -1;
          continue;
        }
        // Wall, floor or crate - the pellet stops here.
        end = h.point;
        this.effects.impact(end, 0x9fb4d8, w.pellets > 1 ? 2 : 4, 2.5, 1, 0.26);
        break;
      }
      // The other sphere of a body this pellet already paid for. Skipped
      // rather than stopping the round, and it does NOT spend a pierce: the
      // pellet did not find anything new.
      if (seen.has(en)) continue;
      seen.add(en);
      // The crit and the two range passive items are resolved HERE and not at
      // the trigger, because all three of them are questions about the body the
      // pellet just found. See _resolveHit.
      const hot = this._resolveHit(en, crit);
      const head = headed.has(en);
      // ARMATURE'S BANK rides the FIRST body this trigger pull reaches and
      // no other: the add is spent on the first pellet that lands (or the
      // first body the ray touches, which is the same thing for a straight
      // shot), and the field is zeroed in the same breath so the volley's
      // other pellets and the echo cannot double-dip. A shotgun spreads one
      // bank over one chest, which is the honest reading of "your next shot".
      let arm = 0;
      if (this._shotArmature > 0) {
        arm = this._shotArmature;
        this._shotArmature = 0;
      }
      const dealt = (this.player.getEffectiveDamage(w.damage * m.volleyDamage)
        + arm)
        * Math.pow(falloff, pierced) * dmgMult * this._hitMult(en, hot, head);
      this._landShot(en, h.point, ray.ray.direction, dealt, burst, hot, head);
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
    // STIGMATA. A miss that passed within half a metre of a body at all still
    // pays a tenth of the shot's damage. The distance is from the ray's own
    // path to the body's EDGE, not its centre - a half-metre band drawn around
    // a crawler reads as the shot nearly clipping it, which is the card's
    // whole point. The geometry is a point-to-segment test between the gun's
    // eye position and the pellet's stopping point.
    //
    // ONCE PER SHOT PER BODY. `_chipHits` is the set the next trigger pull
    // clears, exactly as `_shotHits` is - which is also what says a body the
    // pull ALREADY hit never chips: a hit and a near miss cannot both be
    // owed for the same round.
    if (m.stigmata > 0) {
      for (const en of this.enemies) {
        if (en.dead) continue;
        if (seen.has(en) || this._chipHits.has(en)) continue;
        // Point-to-segment distance from the body's capsule centre to the
        // pellet's flight. The centre sits at half height above the feet,
        // exactly where the hitbox lives. A boss's wide silhouette still
        // counts (its own radius is subtracted), because the card never said
        // its name.
        const cx = en.pos.x, cy = en.pos.y + 0.8, cz = en.pos.z;
        const ax = muzzle.x, ay = muzzle.y, az = muzzle.z;
        const bx = end.x - ax, by = end.y - ay, bz = end.z - az;
        const ab2 = bx * bx + by * by + bz * bz;
        let t = 0;
        if (ab2 > 1e-9) {
          t = ((cx - ax) * bx + (cy - ay) * by + (cz - az) * bz) / ab2;
          t = Math.max(0, Math.min(1, t));
        }
        const dx = cx - (ax + bx * t);
        const dy = cy - (ay + by * t);
        const dz = cz - (az + bz * t);
        const gap = Math.hypot(dx, dy, dz) - en.radius;
        if (gap > 0.5) continue;
        this._chipHits.add(en);
        // THROUGH hurtEnemy AND NOT THROUGH _landShot: no hit, so nothing that
        // only makes sense after one - no status, no crit roll, no chain,
        // no knockback - the chip is the whole of the event, and the body
        // either takes it or it is not this pull's near miss at all.
        //
        // Read off the SAME base the round that missed was worth: the weapon
        // figured through every multiplier, so the chip stays ten percent of
        // the shot the player actually fired.
        this.hurtEnemy(en, this.player.getEffectiveDamage(w.damage * m.volleyDamage) * 0.1);
      }
    }
    // Breach Round detonates wherever the shot stopped - an enemy, a wall or
    // the floor - so the last impact point is kept for the caller.
    this._lastImpact.copy(end);
    // The streak's tail is glued to the live muzzle marker (Effects.tracer) -
    // or, after a SKIPSTONE bounce, to the bounce point: the tracer must
    // never draw itself through the floor, which is what a straight line from
    // the muzzle to a bounced end would do.
    this.effects.tracer(legStart, end, this.player.muzzle);
    return damaged;
  }

  /**
   * One full pattern of the weapon - all its pellets, TWENTY/TWENTY's volleys
   * included - returning whether anything landed.
   *
   * THE DEDUP SETS ARE NOT CLEARED BETWEEN PATTERNS: two volleys of one
   * trigger pull, ECHO CHAMBER's fourth pull and ENCORE's second pattern are
   * all THE SAME PRESS, so a body caught by two of them takes one dose of
   * status and sets off one DETONATOR blast. The press's bookkeeping lives at
   * shoot() - see _beginShot.
   */
  _volley(muzzle, targets, spread, w, dmgMult, crit) {
    let hit = false;
    for (let v = 0; v < this.player.mods.volley; v++) {
      for (let i = 0; i < w.pellets; i++) {
        if (this._firePellet(muzzle, targets, spread, w, dmgMult, crit)) hit = true;
      }
    }
    return hit;
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
      // Through _spend, so PAPER TRAIL counts a round bought with money as
      // money spent - which it is. Clamped to what is actually in the wallet
      // first: the debt can outrun a thin balance, and a trail that counted
      // credits the player never had would be counting an overdraft.
      this._spend(Math.min(this.credits, this.player.cashOwed));
      this.credits = Math.max(0, this.credits);
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
    if (this.player.brassTaxPaid) dmgMult *= 1 + mods.brassTaxDamage;
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
    // ODD COUPLE and EVEN BETTER, on `magAtShot` - what the TRIGGER saw, never
    // the live count, for the reason FATAL RESERVE and HARM WANDS read it: by
    // the time anything downstream looks the magazine has already been billed,
    // by one round or by three under TRIPLE TAP or by none at all under BELT
    // FEED, and this is the only number that answers the card's question the
    // same way for every build.
    //
    // GATED ON A MAGAZINE EXISTING. `magAtShot` is zero for a round billed
    // straight off the reserve (BELT FED DREAM) and for one bought with money
    // (CASH CANNON) - and zero is an even number, so without this test EVEN
    // BETTER would quietly be an unconditional +20% to exactly the two builds
    // that have no magazine to read.
    //
    // HERE RATHER THAN IN _hitMult, because it is a question about the SHOT and
    // not about the body it lands on - which is the only kind of question that
    // function answers. It also means a melee swing, which has no magazine
    // behind it, is untouched by either pick.
    if (this.player.magAtShot > 0 && (mods.oddCouple > 0 || mods.evenBetter > 0)) {
      const odd = (this.player.magAtShot & 1) === 1;
      if (odd && mods.oddCouple > 0) dmgMult *= 1 + mods.oddCouple;
      if (!odd && mods.evenBetter > 0) dmgMult *= 1 + mods.evenBetter;
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

    // SQUARE WAVE. Odd trigger pulls are the doubled ones, one shot each,
    // forever - the tally is the phase, exactly as it is for ECHO CHAMBER's
    // every-fourth, so the alternation costs no state of its own and can
    // never fall out of step with the shots that earned it. Per SHOT and not
    // per pellet, like every multiplier in this half of the trigger: a
    // scattergun is one step of the wave.
    const squareHot = mods.squareWave > 0 && (this.player.shotTally & 1) === 1;
    if (squareHot) dmgMult *= 2;

    // ARMATURE. The bank rides the FIRST round of the trigger pull as a flat
    // add, spent whether or not that round connects - it is part of the shot
    // the way the round is, and a bank that survived a miss would be a bank
    // the player never had to risk. Read and cleared HERE, in one breath, so
    // no pellet downstream can spend it twice.
    //
    // THE ADD IS RAW, before every multiplier: it is a number that was ALREADY
    // through the build's multipliers on the shot that earned it, and sending
    // it through again would compound the build into itself.
    let armatureAdd = 0;
    if (this.player.armatureBank > 0) {
      armatureAdd = this.player.armatureBank;
      this.player.armatureBank = 0;
      this.effects.burst(
        this.player.muzzleInto(this._killPos), THEME_OVERKILL, 8, 3.5, 1.8, 0.3
      );
    }
    // Carried to the pellet through a frame field rather than a seventh
    // argument on _firePellet - the call sites (volleys, echoes, the off
    // hand) all pass their own dmgMult, and a parameter that most of them
    // would have to remember to forward is a parameter that will be
    // forgotten by the next one. One shot, one field, read once.
    this._shotArmature = armatureAdd;

    const w = this.player.weapon;
    this.stats.shotsFired++;
    this._luckyCasing(this.player.offHand ? 1 : this.player.shotCost);
    this.sfx.shoot();
    // Recoil, in the hands. Scaled by the same number the camera kick is, so a
    // scattergun is felt as a scattergun without the two ever disagreeing, and
    // short enough that a held trigger reads as a stutter rather than a hum.
    this.pad.rumble(0.18 + w.shake * 1.4, 0.42, 55, 1);

    const muzzle = this.player.muzzleInto(this._muzzle);
    this.effects.ejectCasing(
      this.player.ejectPort,
      groundSurface(this.player.pos, 0.4, this.arena.obstacles)
    );
    // The blast rides the camera's forward, not any one pellet's ray - the
    // blast is the gun's, the streaks draw the spread.
    this.camera.getWorldDirection(this._killPos);
    this.effects.blast(muzzle, this._killPos, 1);
    this.effects.addShake(w.shake);
    // SQUARE WAVE'S TELL. The doubled pulls answer with a second, harder
    // flash - the alternation has to be readable from the trigger hand alone,
    // because nothing on the HUD prints it.
    if (squareHot) {
      this.effects.burst(muzzle, THEME_SQUARE, 8, 4, 2, 0.24);
    }

    // The trigger's list is the one WITH the row on it - a shot aimed at a
    // totem is a claim, not a stray. See _buildShotTargets for the split.
    const targets = this._buildShotTargets({ props: true });

    const spread = this._shotSpread();
    let hitAny = false;
    this._beginShot();
    // SOUTHPAW'S OFF HAND. A trigger pull answered mid-reload fires ONE pellet
    // and none of the duplicate patterns - the card says single rounds, and a
    // TWENTY/TWENTY volley or an ECHO of one off-hand round is a question about
    // a magazine the gun is busy not having. Read and cleared in the same
    // breath, like the magazine it stands in for.
    const offHand = this.player.offHand;
    this.player.offHand = false;
    if (offHand) {
      if (this._firePellet(muzzle, targets, spread, w, dmgMult, crit)) hitAny = true;
    } else {
      // Twenty/Twenty fires the whole pellet pattern twice off one round -
      // mods.volley rides inside _volley.
      if (this._volley(muzzle, targets, spread, w, dmgMult, crit)) hitAny = true;
      // ECHO CHAMBER. Every fourth trigger pull fires the pattern a second time
      // at half strength, off no magazine at all.
      if (mods.echoEvery > 0 && this.player.shotTally % mods.echoEvery === 0) {
        if (this._volley(muzzle, targets, spread, w, dmgMult * mods.echoDamage, crit)) {
          hitAny = true;
        }
        this.effects.burst(muzzle, THEME_ECHO, 8, 3.5, 1.8, 0.26);
      }
      // ENCORE. The whole pattern again, at full strength, off no magazine -
      // ECHO CHAMBER's ghost with the every-fourth and the half-damage taken off
      // it, which is exactly what the item is and why it rides the same lines.
      if (this.player.encore > 0) {
        if (this._volley(muzzle, targets, spread, w, dmgMult, crit)) hitAny = true;
        this.effects.burst(muzzle, THEME_ECHO, 10, 4, 2, 0.3);
      }
      // CHORUS. Two more pellets on every trigger pull, each at sixty percent,
      // off no magazine of their own. They share the press's crit roll,
      // dmgMult and dedup sets with the forward volley - same rules
      // TWENTY/TWENTY's second pattern follows - and they are drawn from the
      // same cone, which the pick has already widened a shade (spreadAdd in
      // its apply). NOT off the off-hand round above: that is a single
      // round squeezed out of a gun with no magazine in it, and there is no
      // shot there for two more pellets to be extra TO.
      if (mods.chorus > 0) {
        for (let c = 0; c < mods.chorus; c++) {
          if (this._firePellet(muzzle, targets, spread, w, dmgMult * mods.chorusDamage, crit)) {
            hitAny = true;
          }
        }
        this.effects.burst(muzzle, THEME_CHORUS, 8, 3.5, 1.8, 0.26);
      }
    }
    // REARVIEW. One pellet straight behind the player on every trigger pull,
    // at full damage, off no magazine - the card says "as well", not
    // "instead". It shares the trigger pull's crit roll, its dmgMult and the
    // dedup sets (NOT cleared before it, for the reason the echo above does
    // not clear them: a body caught by the forward volley and the back one
    // takes one dose of status), and the tracer is drawn so the shot behind
    // is as visible as the one ahead.
    //
    // FIRED FROM THE EYE, not from a backward-offset muzzle: the round leaves
    // the player's own position along their bearing reversed, pitched level -
    // a self-defense round, at chest height.
    if (mods.rearview > 0) {
      const eye = this.player.eyeInto(this._killPos);
      // The camera's forward, mirrored around the vertical axis: x and z
      // negated, y KEPT. A full negate would flip the pitch as well, and a
      // player aiming down at a crawler in front would be shooting the ray
      // UP behind them - which is not "backward". What the card promises is
      // the same shot in the other lane, and the lane is changed by the draw
      // of the feet, not the height of the eye.
      const f = this._rayEnd;
      this.camera.getWorldDirection(f);
      f.x = -f.x;
      f.z = -f.z;
      // The cone. The same NDC readout the forward shots share - a backward
      // round deserves the same cushion of luck rather than a laser line.
      const spreadB = this._shotSpread();
      const jx = (Math.random() - 0.5) * spreadB;
      const jy = (Math.random() - 0.5) * spreadB;
      // Rotate the mirrored vector by the two small angular offsets on the
      // side that shares the player's yaw, so the cone opens the same way it
      // would forward. Jittering in XZ keeps the pitch the player paid for.
      const ca = Math.cos(jx), sa = Math.sin(jx);
      const back = this._shotRay;
      back.ray.origin.copy(eye);
      back.ray.direction.set(f.x * ca - f.z * sa, f.y + jy, f.x * sa + f.z * ca);
      back.ray.direction.normalize();
      const bhits = this._hits;
      bhits.length = 0;
      back.intersectObjects(targets, false, bhits);
      let bend = null;
      for (const h of bhits) {
        const en = h.object.userData.enemy;
        if (en && !en.dead) {
          const hot = this._resolveHit(en, crit);
          const head = h.object.userData.head === true;
          const dealt = this.player.getEffectiveDamage(w.damage * mods.volleyDamage)
            * dmgMult * this._hitMult(en, hot, head);
          this._landShot(en, h.point, back.ray.direction, dealt, 2, hot, head);
          hitAny = true;
        }
        // Wall, floor, totem, or the body it just paid - the backward round
        // stops here either way, exactly as a forward one does.
        bend = h.point;
        break;
      }
      bhits.length = 0;
      this.effects.tracer(eye, bend || back.ray.at(40, this._rayEnd), this.player.muzzle);
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
    // SKULL RECEIPT settles after every pellet has answered where it landed
    // and before any last-round mechanic asks whether the magazine emptied.
    // A refunded headshot did not empty it, so Pocket Grenade, Chain Feed and
    // Death Clause must all see the zero cost written by refundLastShotAmmo.
    if (mods.donationHeadshotFree > 0 && this._shotWasHead) {
      if (this.player.refundLastShotAmmo()) this.ui.flashReserve();
    }
    // POCKET GRENADE. The round that emptied the magazine, as a blast.
    //
    // `magAtShot <= lastShotCost` is the one pair that answers "was that the
    // last round" for every build - CHAIN FEED asks it the same way and for the
    // same reason. A shot billed to the reserve or to the wallet has
    // `magAtShot` at zero and is correctly not the last round of anything.
    //
    // BESIDE BREACH ROUND rather than in the enemy branch, because a grenade
    // buried in a wall still goes off: the round was spent either way, and a
    // version that paid only on a hit would punish the miss twice.
    //
    // THREE TIMES THE SHOT, which is the shot the player just fired and not the
    // weapon's base - dmgMult carries CANNONADE, the gamble, the cursed round
    // and the two parity picks, so the grenade is worth what the round that
    // became it was worth.
    if (mods.pocketGrenade > 0 && this.player.magAtShot > 0
      && this.player.magAtShot <= this.player.lastShotCost) {
      const worth = this.player.getEffectiveDamage(w.damage) * dmgMult * mods.pocketGrenade;
      this._blast(this._lastImpact, worth, mods.pocketRadius, null, false);
      this.effects.shockwave(this._lastImpact, THEME_POCKET, mods.pocketRadius, 0.6);
      this.effects.burst(this._lastImpact, THEME_POCKET, 20, 6, 3, 0.5);
      this.effects.addShake(0.24);
      this.pad.rumble(0.6, 0.4, 180, 2);
      this.sfx.impact();
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
    // PITY PARTY and RED HARVEST settle on exactly the same pair - did this
    // trigger pull touch a body, and did the BODIES say it crit - because both
    // of them are once-per-trigger-pull questions and neither is a die roll.
    // See Player.settlePity and _critHeal.
    this.player.settlePity(hitAny, this._shotWasCrit);
    this._critHeal(this._shotWasCrit);
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
    // DEATH CLAUSE. Only the FINAL ROUND of the magazine is covered - the
    // clause's own terms - and only when that shot missed, which the
    // hitmarker already told the player about. `magAtShot <= lastShotCost`
    // is the pair that answers "the last round" for every build, on POCKET
    // GRENADE's terms exactly, and the two reads cannot disagree: what the
    // trigger saw is what runs dry.
    //
    // THE FLOOR OF ONE, on AIM OR BLEED's terms and for its reason: a guilt
    // clause that could kill you out of the magazine it billed would be a
    // card that reads as a broken gun, not as a contract.
    if (mods.deathClause > 0 && !hitAny
      && this.player.magAtShot > 0
      && this.player.magAtShot <= this.player.lastShotCost
      && this.player.health > 1) {
      this.player.health = Math.max(1, this.player.health - mods.deathClause);
      this.ui.damage();
      this.effects.burst(this.player.eyeInto(this._killPos), THEME_CLAUSE, 8, 3.5, 1.8, 0.3);
      this.sfx.hurt();
    }

    // Hot Streak rides the SHOT, not the pellet: one trigger pull is one step
    // up or one step down however many pellets were in it, and it reads the
    // same boolean the hitmarker below does so the two can never disagree.
    this.player.bumpStreak(hitAny);
    this.player.noteAccuracy(hitAny);
    // CHAIN LETTER, off the same boolean on the same line for its reason: the
    // streak must never disagree with what the hitmarker just said.
    this.player.bumpChain(hitAny);

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
    // CHARITY CASE. One health for the trigger pull that LANDED, on the same
    // boolean the hitmarker and HAEMOPHAGE read, so the three can never
    // disagree about what counts as a hit: the pellet's damage is zeroed in
    // _landShot rather than here, which is what makes a ward eating the round
    // also eat its collection.
    if (hitAny && this.player.charityEnd > this.time) {
      this.player.heal(1);
    }
    // PRODIGAL ROUNDS. BRASS ECHO's mirror image, written beside the hitmarker
    // branch below and off the same boolean, so the two can never disagree
    // about what a miss is - between them there is no shot in the game that is
    // simply gone.
    //
    // WHAT THE SHOT SPENT, not what a shot costs: a round fired inside OPENING
    // SALVO's free window cost nothing, and paying it back would be making
    // ammunition rather than getting it back. Same test tryAmmoRefund makes.
    if (!hitAny && mods.prodigal > 0 && this.player.lastShotCost > 0
      && this.player.reserveAmmo < this.player.maxReserve
      && Math.random() < mods.prodigal) {
      this.player.reserveAmmo = Math.min(
        this.player.maxReserve, this.player.reserveAmmo + this.player.lastShotCost
      );
      this.effects.burst(
        this.player.muzzleInto(this._killPos), THEME_PRODIGAL, 6, 3, 1.6, 0.3
      );
      // The number in the corner is where the player actually reads their
      // ammunition; a puff at the muzzle in a firefight is not a readout.
      this.ui.flashReserve();
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

  // LUCKY CASINGS. One coin per fired round, never per pellet: a scattergun
  // shell leaves one casing just as an accurate rifle round does.
  _luckyCasing(rounds = 1) {
    const chance = this.player.mods.luckyCasings;
    if (chance <= 0) return;
    const at = this.player.muzzleInto(this._killPos);
    for (let i = 0; i < Math.max(1, rounds); i++) {
      if (Math.random() >= chance) continue;
      if (Math.random() < 0.5) {
        this.player.heal(5);
        this.effects.burst(at, 0x42f59b, 10, 4, 2, 0.35);
        this.sfx.pickupHealth();
      } else {
        this.player.reserveAmmo = Math.min(
          this.player.maxReserve, this.player.reserveAmmo + 15
        );
        this.effects.burst(at, 0xffd54f, 10, 4, 2, 0.35);
        this.sfx.pickupAmmo();
        this.ui.flashReserve();
      }
    }
  }

  // MITOSIS. Targets are claimed as soon as a fragment is created, so two
  // siblings always seek fresh bodies. A child that loses its target in flight
  // asks again from the same claimed set rather than collapsing onto its twin.
  _mitosisTarget(pos, used) {
    let best = null;
    let bestD = Infinity;
    for (const e of this.enemies) {
      if (e.dead || used.has(e.id)) continue;
      const d = pos.distanceToSquared(e.pos);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) used.add(best.id);
    return best;
  }

  _spawnMitosis(from, damage, generation, used) {
    for (let i = 0; i < 2; i++) {
      if (this.projectiles.length >= MAX_PROJECTILES) break;
      const target = this._mitosisTarget(from, used);
      if (!target) break;
      this.projectiles.push(new MitosisFragment(
        this.scene, this.effects.glowTex, from, target, damage, generation, used
      ));
    }
    this.effects.burst(
      this._killPos.set(from.x, (from.y || 0) + 0.9, from.z),
      THEME_MITOSIS, 16, 5, 2.2, 0.45
    );
  }

  _mitosisHit(fragment) {
    const en = fragment.target;
    if (!en || en.dead) return;
    const killed = this.hurtEnemy(en, fragment.damage);
    this.effects.impact(fragment.pos, THEME_MITOSIS, 10, 4, 2, 0.35);
    if (killed && en.dead && fragment.generation < 1) {
      this._spawnMitosis(
        en.pos, fragment.damage * 0.5, fragment.generation + 1, fragment.used
      );
    }
  }

  /**
   * THROAT CUT. One body, finished outright, or nothing at all.
   *
   * WRITTEN RATHER THAN DEALT, and that is the whole reason it is a method.
   * The obvious implementation is `hurtEnemy(e, e.hp + 1)` - which is what LAST
   * RITES does - and it is wrong for an EXECUTION: takeDamage multiplies a blow
   * by the type's armour before subtracting it, so `hp + 1` against a
   * Colossus's 0.22 plating leaves the thing standing on four fifths of what it
   * had. An item that finishes the nearly dead can live with that; a card that
   * says "instantly kills" cannot.
   *
   * So it takes _executeBoss's route: hp to zero, `dead` raised, and the death
   * sweep in _updateEnemies books the bounty, the drop, the combo and the
   * corpse exactly as it does for anything else that died this frame. Nothing
   * downstream can tell the difference, which is the point.
   *
   * NOT BOSSES, and the refusal is absolute. See the note on the entry.
   *
   * @returns {boolean} whether the body was taken - false means the caller
   *   should deal its ordinary damage instead.
   */
  _throatCut(e) {
    const at = this.player.mods.throatCut;
    if (at <= 0 || e.dead || e.boss) return false;
    if (e.hp > e.maxHp * at) return false;
    // A HARD LINE NEEDS A LOUD TELL. The body simply vanishing with no number
    // off it is the one outcome a player reads as the game dropping their
    // swing rather than as the swing having worked, so what it had left is
    // reported as the blow that took it - which it was.
    this.effects.damageNumber(e.pos, e.hp, true, false);
    e.hp = 0;
    e.dead = true;
    this.effects.impact(e.pos, THEME_THROATCUT, 14, 6, 3, 0.45);
    this.effects.burst(e.pos, THEME_THROATCUT, 18, 5, 2.6, 0.5);
    return true;
  }

  // Arms a swing. THE HIT IS NOT DEALT HERE: player.tryMelee() starts the
  // animation and this only notes when the strike lands, so the two are one
  // event. See _meleeStrike for the hit itself, and MELEE_SWING for the delay.
  tryMelee() {
    if (!this.player.tryMelee()) return;
    // The whoosh only: the crunch waits for the strike, 0.12s later, and only
    // if it found something - see _meleeStrike.
    this.sfx.meleeSwing();
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
    // LONG ARM. A FRACTION of the base reach rather than a flat number of
    // metres, so the "+ e.radius" below still does its job: the reach grows
    // with the target either way, and a boss stays meleeable from outside its
    // own surface at double the range exactly as it was at single.
    const reach = MELEE_RANGE * (1 + this.player.mods.meleeReach);
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
      if (d > reach + e.radius - 0.5) continue;
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
    // A swing runs the shot pipeline's crit machinery without _beginShot, so
    // the per-shot ledgers have to be zeroed by hand: HALF TRUTH's parity is
    // decided against `_shotWasCrit`, and a swing that inherited the last
    // trigger pull's `true` would never re-decide it.
    this._shotWasCrit = false;
    const hot = this._resolveHit(target, crit, false);
    // EVERYONE FELT THAT's five, folded in with the crit and the range picks
    // rather than applied afterwards, so the number that lands on the body and
    // the number every other body takes below are the same number - and so the
    // damage figure floating off the target is the one the player was shown.
    // CROWBAR's four, folded in beside EVERYONE FELT THAT's five for the same
    // reason that one is folded in here rather than applied afterwards: the
    // number that lands on the body, the number every other body takes below
    // and the number that floats off the target all have to be one number.
    const crowbar = this.player.mods.crowbar > 0 ? this.player.mods.crowbar : 1;
    const dealt = this.player.getEffectiveDamage(MELEE_DAMAGE)
      * this._hitMult(target, hot) * this.player.meleeMult * crowbar;
    this._shotCrit.clear();
    // A swing travels from the player toward the enemy, which is what tells
    // a shield or a weak point whether it was struck.
    //
    // THROAT CUT ABOVE THE BLOW, not after it. The question the card asks is
    // whether the body the swing ARRIVED AT was under half, and asking it
    // afterwards would ask about a body the swing had already taken from 60%
    // to 45% - a version of the pick that finishes anything it can bring under
    // the line in one hit, which is a different and much larger promise.
    if (!this._throatCut(target)) {
      // ONCE-PUNCH POLICY, on _throatCut's route and for its reason: a card
      // that says "instantly kills" cannot go through takeDamage, where a
      // Colossus's plating or a warden's ward is the CORRECT answer to a
      // blow. hp to zero, `dead` raised, and the sweep below books it like
      // every other melee kill. A MISS never spends it - the swing that lands
      // is the next melee HIT, exactly as the card says. Bosses go through
      // _executeBoss, whose note is this one's: all of the parts, or the
      // promise is a lie on exactly the body it was bought for.
      if (this.player.meleeExecute > 0) {
        this.player.meleeExecute = 0;
        if (target.boss && this.bossFight) this._executeBoss();
        else {
          this.effects.damageNumber(target.pos, target.hp, true, false);
          target.hp = 0;
          target.dead = true;
        }
        target.meleeKill = true;
        this.effects.impact(target.pos, 0xffffff, 22, 8, 4, 0.5);
        this.effects.burst(target.pos, THEME_THROATCUT, 26, 7, 4, 0.6);
        this.effects.shockwave(target.pos, THEME_THROATCUT, 6, 0.5);
      } else {
        target.takeDamage(dealt, false, bestDX / d, bestDZ / d, null, hot);
      }
    }
    // TAGGED, NOT PAID. The reward is worked out in one place - the death
    // sweep in _updateEnemies - and this only records how the body died, so
    // the combo multiplier and the double still compose there.
    if (target.dead) target.meleeKill = true;
    // SCYTHE. Everything else in the arc takes the same number the target took
    // - not a share of it, which is what separates this from SHARED PAIN - and
    // it is the same number for the reason EVERYONE FELT THAT's sweep uses one:
    // the figure floating off the target has to be the figure every other body
    // is taking, or the player is reading a lie.
    //
    // THE ARC AND THE REACH, both the ones the primary target was found
    // through, so LONG ARM widens the sweep exactly as far as it lengthens the
    // strike. EVERYONE FELT THAT is the item that takes the whole ROOM; this
    // takes a direction, which is the difference between the two.
    //
    // A copy of the roster, for PAY TO WIN's reason: a splitter's children are
    // pushed onto `enemies` the moment the parent dies, and something that was
    // not standing there when the swing landed must not be hit by it.
    if (this.player.mods.scythe > 0) {
      const fwd = this._meleeDir;
      for (const e of this.enemies.slice()) {
        if (e.dead || e === target) continue;
        const ex = e.pos.x - this.player.pos.x;
        const ez = e.pos.z - this.player.pos.z;
        const ed = Math.hypot(ex, ez);
        if (ed > reach + e.radius - 0.5) continue;
        if (ed > 0.001 && (ex * fwd.x + ez * fwd.z) / ed < cosArc) continue;
        this.effects.impact(e.pos, THEME_SCYTHE, 8, 4, 2.5, 0.35);
        // THROAT CUT reaches every body the swing touched, this one included.
        // The pick is about what a SWING does to something under half, and a
        // sweep is a swing - a version that spared the bodies at the edge of
        // the arc would be a rule with no reading the player could guess.
        //
        // Through hurtEnemy for the direction the sweep has none of: the blow
        // arrives from the player, not along the line to any one target.
        if (!this._throatCut(e)) this.hurtEnemy(e, dealt);
        // TAGGED AS MELEE KILLS. The double bounty and BLOODSPORT's heal are
        // both worked out from that flag in the death sweep, and a body taken
        // down by the butt of the gun is a melee kill wherever in the arc it
        // was standing.
        if (e.dead) e.meleeKill = true;
      }
      this.effects.shockwave(this.player.pos, THEME_SCYTHE, reach, 0.5);
      this.effects.addShake(0.16);
    }
    // CROWBAR's ten rounds. ON THE HIT AND NOT ON THE KILL: the swing that
    // connected is the one that cost the player the walk, and paying on the
    // kill would pay a build that was already winning. Off the TARGET, so
    // EVERYONE FELT THAT's sweep below cannot turn one swing into ten payouts.
    if (this.player.mods.crowbarAmmo > 0) {
      this.player.reserveAmmo = Math.min(
        this.player.maxReserve, this.player.reserveAmmo + this.player.mods.crowbarAmmo
      );
      this.ui.flashReserve();
    }
    // ...AND EVERYONE ELSE. The swing still had to CONNECT - this hangs off
    // the body that was actually struck, so eight seconds of swinging at air
    // is eight seconds of nothing, which is what keeps the item a melee item
    // rather than a room-clear with an animation in front of it.
    //
    // A copy of the roster, for PAY TO WIN's reason: a splitter's children are
    // pushed onto `enemies` the moment the parent dies, and something that was
    // not standing there when the swing landed must not be hit by it.
    //
    // TAGGED AS MELEE KILLS, all of them. The double bounty and BLOODSPORT's
    // heal are both worked out from that flag in the death sweep, and a body
    // taken down by the butt of the gun is a melee kill wherever it was
    // standing - the item's whole promise is that they all felt the same blow.
    if (this.player.meleeShare > 0) {
      for (const e of this.enemies.slice()) {
        if (e.dead || e === target) continue;
        this.effects.impact(e.pos, 0x00e5c0, 8, 4, 2.5, 0.35);
        this.hurtEnemy(e, dealt);
        if (e.dead) e.meleeKill = true;
      }
      this.effects.shockwave(this.player.pos, ACTIVE_ITEMS.itemFeltThat.theme, 26, 0.8);
      this.effects.addShake(0.3);
    }
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
    // The crunch, on the connect the whoosh promised. Beside the hitmarker,
    // which is the frame's other tell that the swing found something.
    this.sfx.meleeHit();
    this.effects.addShake(0.08);
    this.pad.rumble(0.7, 0.4, 130, 2);
    // A SWING IS A TRIGGER PULL for everything that counts them - it rolls its
    // own crit at the top of this method - so the drought and the coin are
    // settled here too. `hot` is what the BODY said, which is the answer both
    // picks are asking about.
    this.player.settlePity(true, hot);
    this._critHeal(hot);
  }

  /**
   * STRAY MERCY. A projectile that helped.
   *
   * NOT `_transfuse`, which is BLOOD TRANSFUSION's method three thousand lines
   * up. Two methods of one name in one class body is not an error anywhere -
   * the second simply replaces the first - so the item silently stopped
   * working and the failure surfaced as a null dereference in an unrelated
   * suite. The pick was renamed for the player's sake and the method for this.
   *
   * IT IS NOT A HEAL ON TOP OF A HIT - the round never lands. Rolled in the
   * projectile ctx's own lambda (see _projCtx), above _hurtPlayer entirely, so
   * nothing downstream is told anything happened: CARNAGE keeps its stacks,
   * the flawless streak survives, no ward is spent and THORNS has nobody to
   * reflect at. That is the honest reading of "instead of hurting".
   *
   * It goes through Player.heal like every other heal in the game, so HEALTHY
   * CORE still blocks it and OVERDRAW still catches the spill.
   */
  _strayMercy(pos) {
    const got = this.player.heal(this.player.mods.strayMercyHeal);
    // LOUD, for EVASION's reason: something visibly came at the player and
    // visibly did not hurt them, and a hit that silently fails to land reads
    // as nothing happening at all. Announced even at a full bar, where the
    // heal is worth nothing - the round still missed.
    this.effects.burst(pos, THEME_MERCY, 16, 5, 2.5, 0.45);
    this.effects.shockwave(this.player.pos, THEME_MERCY, 4, 0.4);
    this.ui.banner(got > 0 ? 'STRAY MERCY +' + Math.round(got) + ' HP' : 'STRAY MERCY');
    this.sfx.pickupHealth();
  }

  /**
   * RED HARVEST's coin, tossed once per trigger pull.
   *
   * ONE PLACE, THREE CALLERS - the trigger, the mag dump and the melee swing -
   * because a crit is once per trigger pull everywhere else in this game and a
   * scattergun landing nine pellets on one chest must pay one point, not nine.
   * See rollCrit's note on the same rule.
   *
   * It goes through Player.heal like every other heal in the game, so HEALTHY
   * CORE still blocks it and OVERDRAW still catches what does not fit.
   */
  _critHeal(crit) {
    const m = this.player.mods;
    // LUCKY NUMBER settles here, on the same four callers, for the same
    // reason PITY PARTY settles where they can all reach it: the flag was
    // armed by rollCrit and must be spent by the end of the press that spent
    // the guaranteed crit. A crit answer of true means the round met a BODY
    // (see _resolveHit), which is the whole of the card's "if you hit an
    // enemy"; a miss consumes the flag and pays nothing, exactly as a
    // TRUE STRIKE round spent into the void is spent.
    if (this.player.luckyShot) {
      this.player.luckyShot = false;
      if (crit && this.player.heal(m.donationLuckyHeal) > 0) {
        this.player.luckyHealFx = true;
      }
    }
    if (!crit || !(m.critHealChance > 0) || Math.random() >= m.critHealChance) return;
    if (this.player.heal(m.critHeal) <= 0) return;
    this.effects.impact(
      this.player.eyeInto(this._killPos), THEME_REDHARVEST, 6, 2.5, 2, 0.25
    );
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
      this.sfx.meleeSwing();
      this.ui.banner('DODGE');
      return;
    }
    // GLANCING BLOW, above the ward and the throttle of bests either way: a
    // graze never lands at all, so every counter that breaks on contact -
    // Carnage, the flawless streak, KILL STREAK's clean count, the ward the
    // player spent - must not fire, and the ward must not be spent on a hit
    // the pick swallowed. "Ignored entirely" is the card, and ignored it is.
    // The number is the blow after every multiplier but before curse (the one
    // thing the ward checks too): small enough here, means small enough there.
    if (this.player.mods.glancingBlow > 0
      && d * this.player.incomingMult * this.player.itemTakenMult
        <= this.player.mods.glancingBlow) {
      // A blocked hit uses the armour family's cyan, independent of either
      // item's offer colour.
      this.effects.burst(pos, 0x80deea, 4, 3, 1.6, 0.2);
      return;
    }
    // Holy Mantle. A ward eats the hit whole, however big it was, and is spent
    // doing it - it is three free mistakes per wave, not damage reduction.
    //
    // SPENT, NOT CLEARED. `wardReady = false` would take all three, which is
    // exactly the bug the counter was introduced to make impossible.
    if (this.player.wardReady) {
      this.player.spendWard();
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
    if (this.player.lastDamageTaken > 0 && this.player.mods.gracePeriod > 0) {
      this.player.invulnEnd = Math.max(
        this.player.invulnEnd, this.time + this.player.mods.gracePeriod
      );
      this.effects.shockwave(this.player.pos, 0xe8f5ff, 3.2, 0.35);
    }
    if (this.player.deadSwitchFx) this._deadMansSwitch();
    // THIN BLOOD's bill, settled the same frame the hit landed - the player
    // class set `hpDebt` from the build's own arithmetic and the wallet is
    // here. Like CASH CANNON, `balance` is not written twice; the minus is
    // taken straight off `credits`, and the HUD is told next frame.
    if (this.player.hpDebt > 0) {
      const pay = Math.min(this.credits, this.player.hpDebt);
      if (pay > 0) {
        this.credits -= pay;
        this._creditsDirty = true;
        this.effects.burst(pos, 0xffd600, 6, 2.5, 1.6, 0.25);
      }
    }
    // KILL STREAK's counter, broken by the same hit that breaks the flawless
    // streak below - "without taking damage" means the same thing to both.
    this.player.cleanKills = 0;
    // GOLD STAR's ladder, broken by the same hit for the same reason: the
    // streak it asks about is KILLS WITHOUT TAKING DAMAGE, and a graze the
    // mantle ate never reached the player (see the ward and dodge branches
    // above), so only a hit that landed clears it.
    this.player.goldKills = 0;
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
    // JUMPER CABLES. Beside PANIC TURRET and BRUISE ROUNDS because it is the
    // third of the same shape: something the player gets back for having been
    // hit, paid on the blow and not on the damage.
    //
    // HERE AND NOT IN _hurtPlayerDot, which is the whole of what makes it a
    // pick rather than an exploit. Fire, poison and the lava floor bill through
    // that door several times a second, and paying them would make standing in
    // a hazard the fastest way to charge an item in the game - a mechanic whose
    // optimal play is to stop playing. A blow that arrived from something in
    // the room is what this counts, once per blow.
    if (this.player.mods.hitCharge > 0) {
      this.player.addItemCharge(this.player.mods.hitCharge);
      this.effects.burst(
        this.player.eyeInto(this._killPos), THEME_JUMPER, 10, 4, 2, 0.3
      );
    }
    // What LANDED, not what was thrown: curse is applied inside takeDamage.
    // Books the damage and breaks the flawless streak - see _noteDamage.
    this._noteDamage();
    // DEATH STARE. The body that landed this blow, stoned where it stands.
    //
    // AFTER the dodge and the ward, so an attacker that got away with it is
    // the one case the pick does not pay - a hit the mantle ate never reached
    // the player, and petrifying on a whiff would make the pick a shield
    // rather than a retaliation.
    //
    // A SOURCE is the whole test for "melee attacker". Projectiles reach the
    // player through the _projCtx lambda with no owner named, so a gunner's
    // round across the room does nothing - only a body that came close enough
    // to touch you pays for it. A boss pays through applyStatus's own
    // resistance block, which downgrades a freeze to a heavy slow rather than
    // letting three seconds of stone land on the one enemy that cannot afford
    // it - the same answer CRYO PULSE already gets.
    if (this.player.mods.deathStare > 0 && source && !source.dead) {
      source.applyStatus('freeze', this.player.mods.deathStare);
      this.effects.shockwave(source.pos, THEME_STARE, 3.2, 0.4);
      this.effects.burst(source.pos, THEME_STARE, 10, 4, 1.8, 0.4);
      this.sfx.impact();
    }
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
  //
  // THE TARGET IS THE ENEMY CONTEXT'S PLAYER, not the real one. Under ORGAN
  // GRINDER and POSSUM the ctx holds a decoy, and a shooter has to fire at
  // what it is looking at - the monkey, or the corpse it believes it has -
  // rather than at whoever is really standing in the room; the monkey's own
  // doc says its rounds "fly to the monkey", and this is the line that keeps
  // that true. The one exception is the MIRROR's reflected round, which is
  // not an enemy's shot at all: the player fired it, so it aims back at the
  // player through the `aim` argument.
  _spawnProjectile(x, y, z, type = 'shooter', speedScale = 1, spreadRad = 0, aim = null) {
    if (this.projectiles.length >= MAX_ENEMY_PROJECTILES) return;
    const t = (aim || this._enemyCtx.player).eyeInto(this._aimTarget);
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
    // The ctx's player, for the reason _spawnProjectile gives: a grenade
    // throws at what the thrower believes is the target.
    const t = this._enemyCtx.player.eyeInto(this._aimTarget);
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
    // The ctx's player, for the reason _spawnProjectile gives: the spit leads
    // what the SPITTER believes it is aiming at, decoy included - a corpse
    // does not move, so the lead falls out to zero on its own.
    const p = this._enemyCtx.player;
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
    // passive item path every wave instead of ignoring it - and now that the next
    // wave will not start until something is claimed, a bot that failed to
    // claim would hang the run rather than merely skip a passive item.
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
    // passive item just as effectively as a good one claims the right one.
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
      if (this.bossFight) {
        this._updateBossAdds(dt);
        this._bossBleed();
        this._updateReliefDrop(dt);
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
        // CURTAIN CALL, before the sweep: the crates are dropped on the last
        // body and the sweep that follows collects them, so the pick pays the
        // same whether or not the player walks back to where the wave ended.
        this._curtainCall();
        // MOVING DAY, counted before the sweep for the only reason it CAN be
        // counted: a frame later there is nothing on the floor. The credits
        // are still paid by the vacuum below, exactly as they always were -
        // this is paid on top of them. What it granted is HELD rather than
        // announced: the clear banner has not been built yet, and a banner
        // raised here would be wiped by it a few lines down - which is the
        // same trap No-Hit, the banked health and the medical bill are all
        // folded into that one line to avoid.
        const moved = this._movingDay();
        // Everything still on the floor comes in, so a wave's money can never
        // be lost to the shopping trip that follows it - and neither can a
        // health crate the player never had a safe second to walk over.
        this.money.vacuum();
        this._vacuumPickups();
        // And with it everything the item is still owed, so a wave always pays
        // its full budget whether or not every orb was walked over.
        this._flushItemCharge();
        let msg = 'WAVE ' + this.wave + ' CLEARED';
        if (moved > 0) msg += '  MOVING DAY +' + moved + ' ROUNDS';
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
          // THE RESUPPLY. Health bar and reserve both to the top - see
          // Player.resupply, which carries the argument for it and names the
          // play it rewards.
          //
          // AFTER the shower and BEFORE the banked-HP line, so the banner reads
          // in the order the rewards land, and reported only when it actually
          // gave something: a player who cleared a wave untouched and full does
          // not need to be told they are still full.
          const kit = this.player.resupply();
          if (kit.hp > 0 || kit.ammo > 0) {
            this.effects.shockwave(this.player.pos, 0x8affc1, 7, 0.55);
            this.sfx.pickupHealth();
            msg += '  RESUPPLIED';
          }
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
        // MEDICAL DEBT FALLS DUE, and where it falls due is the whole of
        // whether the item has a price at all.
        //
        // AFTER THE FLAWLESS TEST, so a self-inflicted bill does not break a
        // streak the player earned by not being hit - `lastPerfect` was
        // settled at the top of this block, off the damage the FIGHT did.
        //
        // AND AFTER THE RESUPPLY, which is the line that matters. A flawless
        // clear refills the health bar (see Player.resupply); billed before
        // it, thirty health would be handed straight back, and MEDICAL DEBT on
        // a clean wave would be forty free health with no cost whatsoever -
        // pressed on the opening frame of every wave the player expected to
        // clear untouched. Charged after, the bill is real however well the
        // wave went.
        //
        // FOLDED INTO THE CLEAR BANNER rather than raised as its own, for the
        // reason No-Hit and the banked health are: a second banner would wipe
        // the first before it could be read.
        const bill = this._payMedicalDebt();
        if (bill > 0) msg += '  MEDICAL DEBT -' + bill + ' HP';
        // HIGH INTEREST, last of the wave's payouts and AFTER every bill, so
        // what earns is what the player actually walks into the shop holding.
        // Folded into the clear banner like everything else here: a second
        // banner would wipe the first before it could be read.
        const earned = this._payInterest();
        if (earned > 0) msg += '  INTEREST +$' + earned;
        // WIDOW'S MITE, after INTEREST for the reason that method gives, and
        // folded into the clear banner for the reason INTEREST is: a second
        // banner here would wipe this one before it could be read.
        const mite = this._widowsMite();
        if (mite > 0) msg += '  MITE +$' + Math.round(mite);
        // FULL LOAD, last of all.
        //
        // AT THE CLEAR AND NOT AT THE OPEN, which is the whole of what makes it
        // worth a draft pick rather than a convenience: the SHOP happens
        // between the two, so a reserve filled here is money the player still
        // has while the stations are standing. Filled at the open it would
        // arrive after the only moment it could have changed a purchase.
        //
        // AFTER THE FLAWLESS RESUPPLY above, so a run holding both is not told
        // twice about the same rounds - resupply reports what it actually gave,
        // and by the time this runs there is nothing left for it to report.
        const loaded = this._fullLoad();
        if (loaded > 0) msg += '  FULL LOAD +' + loaded + ' ROUNDS';
        // SYNTHESIZER and MIDI CABLE, last of the clear's rerolls and before
        // the banner, so the shop opens on what they left the build holding
        // and the player is told the names at the only moment they matter.
        // Folded into the clear banner like everything above it: a second
        // banner would wipe the first before it could be read.
        const rerolled = this._rerollWaveItems();
        if (rerolled.synth) msg += '  SYNTH: ' + rerolled.synth;
        if (rerolled.midi) msg += '  MIDI: ' + rerolled.midi;
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
        this._presentDonationMachine();
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
    // LATE FEE's clock, undefined until the first wave books it - the same
    // presence-not-sign test LONG HAUL's `startedAt` uses, for the same
    // reason: a fixture setting the clock back must not silently arm the ramp.
    this._waveStartedAt = undefined;
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

  /**
   * CURTAIN CALL. Three health crates on the last body of a wave.
   *
   * IT IS NOT A DROP ROLL, and that is the point. rollDrop withholds health at
   * a full bar for a good reason - a plate that cannot be used is a plate that
   * should not have been rolled - and this ignores it: a crate heals 25 OVER
   * the cap by its own rule (see POWERUP_TYPES.health), OVERDRAW turns the
   * spill into item charge, GRISTLE may bank a point of max HP off it and SLOW
   * RELEASE turns it into twenty seconds of regeneration. There is no build in
   * which three crates are worth nothing.
   *
   * `_lastKillPos` is written by the death sweep on every body, so this is
   * literally the last enemy killed - including a boss part, and including a
   * body killed by a poison tick with the player nowhere near it.
   */
  _curtainCall() {
    const n = this.player.mods.curtainCall;
    if (n <= 0 || !this._lastKillPos) return;
    for (let i = 0; i < n; i++) {
      // The cap is still respected. A floor already holding as much loot as
      // MAX_ACTIVE_PICKUPS allows is a floor the sweep is about to empty
      // anyway, and forcing a fourth plate onto it would only evict something.
      if (this.powerups.length >= MAX_ACTIVE_PICKUPS) break;
      this._placeDrop('health', this._lastKillPos);
    }
    this.effects.shockwave(this._lastKillPos, THEME_CURTAIN, 5, 0.5);
  }

  /**
   * FULL LOAD. The reserve and the magazine, both to the top, at every clear.
   *
   * THE MAGAZINE TOO, which nothing else in the game does for free - a FLAWLESS
   * resupply deliberately leaves it alone (see Player.resupply), because that
   * one is a reward for a wave taken perfectly and the reload is a second and a
   * half the player can spend in the shop. This is the whole of what the pick
   * is, and a player who read "refilled" and then had to stand through a reload
   * at the top of the next wave would be right to call it broken.
   *
   * THE MAGAZINE IS FILLED FROM THE FULL RESERVE, in that order, so a run that
   * walked in empty gets both rather than a magazine's worth of the reserve it
   * was just given. A reload already in flight is cancelled: the rounds are in.
   *
   * @returns {number} rounds actually granted, so the banner can stay quiet for
   *   a player who was already full - a line announcing nothing is noise.
   */
  _fullLoad() {
    const p = this.player;
    if (p.mods.fullLoad <= 0) return 0;
    const before = p.reserveAmmo + p.mag;
    // THE MAGAZINE IS FILLED FIRST AND THE RESERVE TOPPED UP AFTER IT, and the
    // order is the difference between "refilled" and "nearly refilled": done
    // the other way round the magazine is fed out of a reserve that is already
    // at its ceiling, so the run walks into the next wave thirty rounds short
    // of the maximum the card promised - and calling this again would hand
    // those thirty back, which is a refill that pays twice.
    //
    // BELT FED DREAM has no magazine to fill - `mag` is a mirror of the
    // reserve, rewritten every frame (see Player.update), so a round written
    // into it would be gone by the next one.
    if (p.mods.beltFedDream <= 0 && p.mag < p.magSize) {
      p.mag = p.magSize;
      p.reloading = 0;
      // A full magazine is a fresh magazine, so CANNONADE's round is armed by
      // it: the rounds arrived, which is the only question that pick asks.
      p.magFresh = true;
    }
    p.reserveAmmo = p.maxReserve;
    const got = Math.round(p.reserveAmmo + p.mag - before);
    if (got <= 0) return 0;
    this.ui.flashReserve();
    this.effects.shockwave(p.pos, THEME_FULLLOAD, 7, 0.5);
    this.sfx.pickupAmmo();
    return got;
  }

  /**
   * MOVING DAY. What is still on the floor at the clear, in rounds.
   *
   * COUNTED AND NOT CONSUMED. The orbs go on to be swept up and paid as
   * credits exactly as they always were; this is a second payout on the same
   * objects, which is what makes the pick a reason to stay in a fight rather
   * than to break off and tidy after every kill.
   *
   * THE EXPLOIT IT IS PRICED AGAINST is hoarding: leave everything, cash in at
   * the clear. It does not pay, and the reason is ORB_LIFETIME - an orb left
   * more than twenty seconds is gone, credits and all - so a player hoarding
   * on purpose is burning money to buy rounds at a rate nobody would take. What
   * this actually pays for is the last twenty seconds of a fight.
   *
   * The reserve's own ceiling is the cap, and there is deliberately no second
   * one: a player already full gets nothing, which is the honest answer.
   */
  _movingDay() {
    const per = this.player.mods.movingDay;
    if (per <= 0 || !this.money.count) return 0;
    const p = this.player;
    const before = p.reserveAmmo;
    p.reserveAmmo = Math.min(p.maxReserve, p.reserveAmmo + this.money.count * per);
    const got = p.reserveAmmo - before;
    if (got <= 0) return 0;
    this.ui.flashReserve();
    this.effects.shockwave(p.pos, THEME_MOVINGDAY, 7, 0.5);
    this.sfx.pickupAmmo();
    return got;
  }

  /**
   * HIGH INTEREST. A fifth of the balance, at every wave end.
   *
   * PAID AT THE BOUNDARY AND NOT PER SECOND, which is the whole of why this is
   * not a way of farming the shop: a rate would make standing still the best
   * move in the game (the wave break has no clock on it - see the note above
   * Player.update), and a wave end arrives when the room is empty and not one
   * second before.
   *
   * IT COMPOUNDS, as the word means: the interest lands in the balance that
   * next wave's interest is measured against. Whole credits only - the wallet
   * is an integer everywhere the player can see it.
   *
   * @returns {number} what was paid, for the banner
   */
  _payInterest() {
    const rate = this.player.mods.interest;
    if (rate <= 0 || this.credits <= 0) return 0;
    const earned = Math.floor(this.credits * rate);
    if (earned <= 0) return 0;
    this.credits += earned;
    this._creditsDirty = true;
    this.effects.shockwave(this.player.pos, THEME_INTEREST, 6, 0.5);
    this.sfx.credits();
    return earned;
  }

  /**
   * WIDOW'S MITE. Entering a shop under the line tops the balance up TO it,
   * exactly - not by a fixed grant, so a player three dollars short gets
   * three dollars and one three thousand short gets the same ending number.
   *
   * THE LINE IS ABSOLUTE rather than a percentage, which is what makes it a
   * promise about what the player can AFFORD at the stations rather than a
   * reward for arriving poor: at five thousand every price in the first block
   * is reachable, and that is the whole design of the number.
   *
   * Called at the same boundary INTEREST is and AFTER it, so the line is
   * measured against the balance the wave's own payouts actually left.
   * Returns the grant for the banner - and zero for a balance already over
   * the line, so the caller stays quiet rather than announcing nothing.
   */
  _widowsMite() {
    const line = this.player.mods.donationMite;
    if (line <= 0 || this.credits >= line) return 0;
    const grant = line - this.credits;
    this.credits = line;
    this._creditsDirty = true;
    this.effects.shockwave(this.player.pos, THEME_MITE, 6, 0.5);
    this.sfx.credits();
    return grant;
  }

  /**
   * MEDICAL DEBT's bill, at the end of the wave that ran it up.
   *
   * IT CAN KILL, and that is the item. It goes through _hurtPlayer like any
   * other blow - so Holy Mantle's ward can eat it, Evasion can dodge it,
   * Thorns has nobody to reflect it at and LIFE INSURANCE will pay it out -
   * because a player who assembled an answer to being hit has assembled an
   * answer to this, and quietly routing round all of it would make the one
   * item with a delayed cost the one item nothing in the build can talk to.
   *
   * NOT Player.pay(). That helper is for an item's OWN price, floored at 1 so
   * a button can never end a run - the correct rule for BLOOD PRICE, which is
   * paid the instant it is pressed and read. This is a bill the player took on
   * knowing the terms, and the card says so.
   *
   * THE DEATH IS LEFT TO THE LOOP, exactly as every other caller of
   * _hurtPlayer leaves it: this runs inside _updateWave, and booking a death
   * here would tear the frame's own lists down underneath it. See the note at
   * the end of _hurtPlayer.
   *
   * @returns {number} what was owed, so the caller can put it on the clear
   *   banner rather than raising a second one over it.
   */
  _payMedicalDebt() {
    const owed = this.player.medicalDebt;
    if (owed <= 0) return 0;
    this.player.medicalDebt = 0;
    this.effects.shockwave(this.player.pos, ACTIVE_ITEMS.itemMedicalDebt.theme, 8, 0.7);
    this._hurtPlayer(owed, this.player.eyeInto(this._killPos));
    return owed;
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
   * items out of sixty-six and most of the catalogue was unreachable. The
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

  // Each new shop deals one payment kind against the active player's shared
  // chance and reward ownership. Rerolling the totems leaves this deal intact.
  _presentDonationMachine() {
    if (!this.totemArea.active) return;
    this.donationMachine.present(this.player);
  }

  /**
   * Puts each rolled passive item into the shape a totem can draw.
   *
   * @param {?Set<string>} seen  what this shop has already offered, excluded.
   *   Null - the default - is a roll against the whole pool, which is what the
   *   tests and any future caller with no shop behind it want.
   */
  _buildOffers(seen = null) {
    const ids = rollTotems(this.player.passiveItems, TOTEM_COUNT, seen);
    return ids.map((id) => {
      const def = PASSIVE_ITEMS[id];
      const owned = this.player.passiveItems[id] || 0;
      return {
        id,
        name: def.name,
        theme: def.theme,
        // Resolved against what the player already owns, so a stacking
        // passive item shows the tier it moves them from and the one it moves
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
    // Through _priceLabel like every other price in the room. It used to build
    // its own '$' + cost here, which is why the box was the one console that
    // could never say FREE at all - not even at a cost of zero.
    box.setPrice(this._priceLabel(cost), stakes || this._canAfford(cost));
  }

  // WHAT THE TWO CREDIT CONSOLES COST RIGHT NOW. Both prices step up every
  // five waves (see blockPrice in items/passive/index.js), so every place that shows or
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
  // this shop, on the same terms a reroll does - see boxCost in items/passive/index.js.
  // Read off the wave just CLEARED, the same as the two consoles: the box
  // rises during the intermission, before startWave() has counted the next.
  _boxCost() {
    return boxCost(this.wave, this.totemArea.boxRolls);
  }

  // A console's price as the player reads it. FREE rather than $0, because a
  // price of zero is the one number on a console that is not a price.
  //
  // AND FREE UNDER HIGH STAKES, because for that run the price is not what
  // decides - the coin is (see _gambleTill: the till waives the charge nine
  // times in ten and takes a bite out of the player the tenth). The card used
  // to keep printing $2000 while the wallet was never touched, which read as
  // the run being about to be charged and made the one passive item whose whole text
  // is "REROLLS & BOXES ARE FREE" look like it was not working.
  //
  // The COST is still what it was and still doubles underneath - nothing about
  // the ladder changes, and a player who loses the pick mid-run finds the real
  // number waiting for them.
  _priceLabel(cost) {
    if (this.player.mods.highStakes > 0) return 'FREE';
    return cost > 0 ? '$' + cost : 'FREE';
  }

  /**
   * EVERY CREDIT THAT LEAVES THE WALLET, through one door.
   *
   * PAPER TRAIL counts what a run has spent, and before this there were three
   * places that wrote `credits -=` and one that wrote it for a debt - so the
   * pick would have been correct about rerolls and quietly blind to the ammo
   * console, which is the exact shape of bug nobody reports because the number
   * is only ever slightly too small.
   *
   * The running total lives on the PLAYER, not on Game, for the reason
   * `balance` does: in versus the wallet belongs to a run, and a total kept
   * here would be one player paying for the other's shopping.
   */
  _spend(amount) {
    if (!(amount > 0)) return;
    this.credits -= amount;
    this.player.spentTotal += amount;
  }

  /**
   * THE TAB. One affordability rule for every priced thing in the shop, so
   * the refusal a player hears can never disagree with the label they read.
   *
   * WITH THE TAB CLOSED (the default) this answers exactly what
   * `credits >= cost` always answered, which is what keeps the two stations,
   * the box and the credit machine honest for every run that has not earned
   * the reward: a refactor of the comparison is the one place the shop could
   * quietly start selling to broke players.
   *
   * WITH IT OPEN the wallet may go negative, down to the floor the card names
   * and not a cent further - the tenth-thousand dollar of debt buys exactly
   * like the first, and the eleventh is refused at the same door every price
   * is. `_spend` needs no change: the balance is a float and the HUD floors
   * it, so a negative number displays as readily as a positive one.
   */
  _canAfford(cost) {
    if (this.credits >= cost) return true;
    const floor = this.player.mods.donationTab;
    return floor < 0 && this.credits - cost >= floor;
  }

  // Takes the payment for a reroll. The caller has already established the
  // player can afford it.
  _payReroll(cost) {
    if (this._gambleTill()) return;
    this._spend(cost);
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
      // item's own health cost - see `pay` in js/items/active/index.js.
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
      !area.ammoPurchased && this._canAfford(ammo) && AMMO_PURCHASE.enabled(this.player)
    );
    const cost = this._rerollCost();
    // Lit for a HIGH STAKES run whatever the balance says, because for that run
    // the price is not what decides - the coin is.
    const stakes = this.player.mods.highStakes > 0;
    area.rerollStation.setLabel(
      'REROLL', this._priceLabel(cost), (stakes || this._canAfford(cost)) && area.active
    );
  }

  // Grants the passive item a totem is offering and sinks the whole set. Every
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
    if (!this.player.takePassiveItem(offer.id)) return;
    totem.claimed = true;

    // SACRIFICE ate one of the others on the way in - see Player.takePassiveItem -
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
    this.sfx.passiveItem();
    this.pad.rumble(0.5, 0.6, 220, 2);
    this.totemArea.dismiss();
    // The totem claim is the definitive one: it is what starts the next wave,
    // so the box packs up with it whether or not it was ever paid. A roll left
    // spinning is forfeited, which is the same rule an unclaimed totem set has
    // always followed - one boundary, one thing that closes it.
    this.mysteryBox.dismiss();
    this._dismissDonationMachine();
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
    if (!box.canBuy || (!stakes && !this._canAfford(cost))) {
      this.sfx.denied();
      // A refusal has to be felt, or a player who cannot afford something
      // presses again and again into silence.
      this.pad.rumble(0.15, 0.5, 60, 1);
      return;
    }
    // CREDITS ONLY, never _payReroll - see the note in _boxCost. The gamble is
    // asked first and, when it covers the roll, nothing is charged at all.
    if (!this._gambleTill()) this._spend(cost);
    // Counted AFTER the charge, so the roll being paid for is priced at what
    // the player was shown and the next one is the one that costs double.
    this.totemArea.boxRolls++;
    // RAFFLE TICKET's ledger, and it is the RUN's rather than the shop's:
    // `boxRolls` resets at every wave break because it is what the price
    // ladder doubles off, and what this pick pays for is every roll ever
    // bought. On the player, so a versus handoff carries it with the build.
    //
    // Counted whether or not HIGH STAKES waived the charge, deliberately: what
    // the card promises is a box BOUGHT, and a run that took the gamble still
    // pulled the lever - and paid for it the one time in ten that till bites.
    this.player.boxesBought++;
    // THE POOL IS TAKEN NOW AND KEPT FOR THE WHOLE SPIN. It excludes whatever
    // the player is carrying, so the carried item cannot even flash past on the
    // reel - not merely fail to win. In versus this is automatically the ACTIVE
    // player's item: there is one Player instance and each run's slot is
    // snapshotted across the handoff. See shuffledPool in items.js.
    box.roll(shuffledPool(this.player.activeItem));
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
    box.roll(shuffledPool(this.player.activeItem));
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
    this.player.giveActiveItem(id);

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

  // Ticks the shop installations and writes the E prompt. Shooting is handled in
  // shoot(), which already has the raycast; NOTHING is claimed by walking into
  // it any more - see the note at the top of totems.js.
  _updateTotems(dt) {
    this.totemArea.update(dt, this.time, this.player.pos);
    this.mysteryBox.update(dt, this.time, this.player.pos);
    this.donationMachine.update(dt, this.time);
    this._donationEvents();
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
   * name something other than what the press does. Seven things can be in reach
   * across the totems, consoles, box and machine, and several of their
   * radii overlap, so the NEAREST wins rather than whichever happened to be
   * checked first.
   *
   * @returns {?{kind: string, target: object}} kind is 'totem' | 'box' |
   *   'station' | 'donation'.
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
    consider(this.donationMachine.usable(this.player.pos), 'donation');
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
    if (this.inputMode !== 'pad') return '<b>SHOOT</b> / <b>' + this.keys.label('use') + '</b> ';
    return cap(this.keys.padBtn('shoot')) + ' / ' + cap(this.keys.padBtn('use')) + ' ';
  }

  // Donation cabinets are intentionally not shootable purchases. Their
  // prompt therefore names only the rebindable Use action: E on the default
  // keyboard map and Triangle on the default pad map.
  _useOnlyLead() {
    if (this.inputMode !== 'pad') return '<b>' + this.keys.label('use') + '</b> ';
    return cap(this.keys.padBtn('use')) + ' ';
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
      if (!this._canAfford(cost)) {
        return ['MYSTERY BOX &nbsp;·&nbsp; NEED $' + cost, true];
      }
      return [
        lead + 'MYSTERY BOX &nbsp;·&nbsp; ONE ACTIVE ITEM &nbsp;·&nbsp; '
        + '<span class="prompt-cost">$' + cost + '</span>',
        false,
      ];
    }
    if (use.kind === 'donation') {
      if (t.pendingId) {
        return [
          this._useOnlyLead() + 'TAKE &nbsp;·&nbsp; '
          + DONATION_ITEMS[t.pendingId].name,
          false,
        ];
      }
      const blocked = this._donationBlocked(t);
      if (blocked) return [t.config.title + ' &nbsp;·&nbsp; ' + blocked, true];
      return [
        this._useOnlyLead() + t.config.title + ' &nbsp;·&nbsp; DONATE '
        + '<span class="prompt-cost">' + t.config.shortCost + '</span>',
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
      lead + 'REROLL &nbsp;·&nbsp; NEW PASSIVE ITEMS &nbsp;·&nbsp; '
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
      if (this.totemArea.ammoPurchased) return 'SOLD OUT';
      if (!AMMO_PURCHASE.enabled(this.player)) return 'AMMO FULL';
      if (!this._canAfford(this._ammoCost())) return 'NEED $' + this._ammoCost();
      return null;
    }
    const cost = this._rerollCost();
    if (!this.totemArea.active || this.totemArea.claimed) return 'NOTHING TO REROLL';
    // HIGH STAKES pays the till, so the wallet is not what stands between the
    // player and a reroll - see _gambleTill. The same rule the box follows.
    if (this.player.mods.highStakes <= 0 && !this._canAfford(cost)) {
      return 'NEED $' + cost;
    }
    return null;
  }

  // The prompt and payment path share refusals, so a held/repeated Use can
  // never charge again while the wheel is spinning or the shop has closed.
  _donationBlocked(machine) {
    if (!machine.shopOpen) return 'SHOP CLOSED';
    if (machine.completedThisShop) return 'COMPLETE THIS SHOP';
    if (machine.spinning) return 'SPINNING';
    if (donationSoldOut(this.player)) return 'SOLD OUT';
    const cost = machine.config.cost;
    if (machine.kind === 'ammo' && this.player.reserveAmmo < cost) {
      return 'NEED ' + cost + ' RESERVE';
    }
    if (machine.kind === 'health' && this.player.health <= cost) {
      return 'NEED ' + (cost + 1) + ' HP';
    }
    if (machine.kind === 'credits' && !this._canAfford(cost)) {
      return 'NEED ' + machine.config.shortCost;
    }
    return null;
  }

  // E. Takes whatever _useTarget() says is nearest - a passive item, a roll of
  // the box, the item the box is holding, a donation or its reward, a reroll
  // or an ammo refill - so the key always does the thing the prompt just said.
  tryUse() {
    if (this.state !== 'playing') return;
    const use = this._useTarget();
    if (!use) return;
    if (use.kind === 'totem') this._claimTotem(use.target, true);
    else if (use.kind === 'box') this._useBox(true);
    else if (use.kind === 'donation') {
      if (use.target.pendingId) this._takeDonationReward(use.target);
      else this._useDonationMachine(use.target);
    } else this._useStation(use.target);
  }

  _useDonationMachine(machine, random = Math.random) {
    if (!machine.isUp() || this._donationBlocked(machine)) {
      this.sfx.denied();
      this.pad.rumble(0.15, 0.5, 60, 1);
      return false;
    }

    if (!machine.startSpin(this.player.donationChance, random)) return false;
    const kind = machine.kind;
    const cost = machine.config.cost;
    if (kind === 'ammo') {
      this.player.reserveAmmo -= cost;
      this.ui.flashReserve();
    } else if (kind === 'health') {
      // A price, not damage: shields, invulnerability, damage reactions and
      // the flawless ledger are deliberately bypassed.
      this.player.health -= cost;
    } else {
      // Unlike rerolls and the box, HIGH STAKES never waives a donation.
      // _spend still records it for PAPER TRAIL.
      this._spend(cost);
      this._creditsDirty = true;
    }
    // KARMA rewards the payment, including a later forfeiture. heal() keeps
    // HEALTHY CORE's refusal and OVERDRAW's banking on their ordinary paths.
    if (this.player.mods.donationKarma > 0
      && this.player.heal(this.player.mods.donationKarma) > 0) {
      this.effects.burst(machine.pos, THEME_KARMA, 10, 3.5, 1.8, 0.4);
      this.sfx.pickupHealth();
    }

    this.sfx.donationStart();
    this.effects.burst(machine.pos, machine.config.color, 12, 4, 1.8, 0.38);
    this.pad.rumble(0.22, 0.35, 80, 1);
    return true;
  }

  _dismissDonationMachine() {
    if (this.donationMachine.dismiss()) {
      this.player.donationChance = donationChanceAfterLoss(this.player);
    }
  }

  // Furniture emits events from the game clock, never delayed callbacks.
  // Cancelling it clears those events before another player can be restored.
  _donationEvents() {
    const machine = this.donationMachine;
    const event = machine.event;
    machine.event = null;
    if (!event) return;
    if (event === 'tick') {
      this.sfx.donationTick(machine.tickProgress);
      return;
    }
    if (event === 'loss') {
      this.player.donationChance = donationChanceAfterLoss(this.player);
      machine.setChance(this.player.donationChance, donationSoldOut(this.player));
      this.sfx.donationLoss();
      this.pad.rumble(0.12, 0.25, 100, 1);
      return;
    }
    const itemId = randomUnownedDonationItem(this.player);
    this.player.donationChance = DONATION_START_CHANCE;
    if (!itemId) {
      // The debug panel may exhaust the pool while a paused spin is pending.
      machine.setChance(DONATION_START_CHANCE, true);
      return;
    }
    this.player.donationWins++;
    machine.reveal(itemId);
    this._killPos.set(machine.pos.x, 1.65, machine.pos.z);
    this.effects.burst(this._killPos, machine.config.color, 42, 8, 3.2, 0.9);
    this.effects.shockwave(this._killPos, machine.config.color, 6, 0.6);
    this.effects.addShake(0.18);
    this.sfx.donationComplete();
    this.pad.rumble(0.75, 0.55, 320, 3);
  }

  _takeDonationReward(machine) {
    const itemId = machine.pendingId;
    if (!itemId || !this.player.takeDonationItem(itemId, this)) return false;
    const def = DONATION_ITEMS[itemId];
    machine.takeReward();
    this._killPos.set(machine.pos.x, 2.05, machine.pos.z);
    this.effects.burst(this._killPos, def.theme, 30, 7, 2.5, 0.7);
    this.effects.addShake(0.1);
    this.sfx.passiveItem();
    this.pad.rumble(0.5, 0.6, 220, 2);
    this.ui.banner(def.name + '  ACQUIRED');
    return true;
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
  // because re-offering a passive item the player just paid to replace makes the
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
      this._spend(this._ammoCost());
      AMMO_PURCHASE.apply(this.player, this.time);
      this.totemArea.ammoPurchased = true;
      st.sink();
      this.ui.flashReserve();
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
   * DEBUG: $1,000,000 on the 0 key.
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
    this.credits += 1000000;
    this._creditsDirty = true;
    this.sfx.coin();
    this.ui.banner('DEBUG  +$1,000,000');
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
    // THE THEME ROW IS DEALT OFF THE TABLE ITSELF rather than off a list kept
    // for this screen: themes are landing one a time, and a panel that carried
    // its own list would be one more thing to edit per theme - the exact chore
    // this row exists to remove. setTheme is the same hook the tests drive, so
    // a pin made here and a pin made by a suite cannot drift apart.
    this.ui.buildDebug(this._debugPassiveDefs(), this._debugActiveDefs(), this._debugDonationDefs(),
      Object.entries(THEMES).map(([key, t]) => ({ key, name: t.name, color: t.color })), {
      passive: (id) => this._debugGivePassive(id),
      dropPassive: (id) => this._debugDropPassive(id),
      active: (id) => this._debugGiveActive(id),
      donation: (key) => this._debugGiveDonation(key),
      dropDonation: (key) => this._debugDropDonation(key),
      wave: (n) => this._debugJumpToWave(n),
      theme: (key) => this._debugSetTheme(key),
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

  // The ordinary catalogues, as the flat shape the panel draws. The id is also
  // the icon key in both pools - see the note at the head of ACTIVE_ITEMS -
  // so there is nothing to map.
  //
  // THE EFFECT LINES COME FROM THE POOL, not from a second table written for
  // this screen. A tiered passive's `effects` is a FUNCTION of the stack count
  // (see effectLines in items/passive/index.js), and it is resolved at ONE stack here -
  // what taking it once does, which is the question the card is answering. A
  // readout that tracked the tier owned would be a second thing the panel had
  // to rebuild on every click, to say something the tier badge already says.
  _debugPassiveDefs() {
    return Object.entries(PASSIVE_ITEMS).map(([id, def]) => ({
      id, name: def.name, theme: def.theme, effects: effectLines(def, 0),
    }));
  }

  _debugActiveDefs() {
    return Object.entries(ACTIVE_ITEMS).map(([id, def]) => ({
      id, name: def.name, theme: def.theme, effects: def.effects,
    }));
  }

  _debugDonationDefs() {
    return Object.entries(DONATION_ITEMS).map(([id, def]) => ({
      id: donationItemKey(id),
      name: def.name,
      theme: def.theme,
      effects: def.effects,
    }));
  }

  _debugRefresh() {
    this.ui.refreshDebug(this.player.passiveItems, this.player.activeItem,
      this.player.donationItems, this.wave, this._forcedTheme);
    if (this.donationMachine.shopOpen && !this.donationMachine.completedThisShop) {
      this.donationMachine.setChance(this.player.donationChance, donationSoldOut(this.player));
    }
  }

  // A TIER AT A TIME, through the player's own takePassiveItem - so a stacking
  // passive stacks, a maxed one refuses, and every clamp that comes with an
  // passive item (the health cap, the magazine) is applied exactly
  // as it is when a totem is walked into.
  _debugGivePassive(id) {
    if (!this.player.takePassiveItem(id)) return;
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
    const n = this.player.passiveItems[id] || 0;
    if (n <= 0) return;
    if (n > 1) this.player.passiveItems[id] = n - 1;
    else delete this.player.passiveItems[id];
    this.player.rebuildMods();
    this.player.health = Math.min(this.player.health, this.player.maxHealth);
    this.player.mag = Math.min(this.player.mag, this.player.magSize);
    this._debugRefresh();
    this.sfx.menuBack();
  }

  // ONE SLOT, so picking a second item throws the first away - which is the
  // rule the whole active-item system is built on, and giveActiveItem is where it
  // lives. The panel does not get its own version of it.
  _debugGiveActive(id) {
    this.player.giveActiveItem(id);
    this._debugRefresh();
    this.sfx.activeItemReady();
  }

  _debugGiveDonation(key) {
    const [, id] = key.split('/');
    if (!this.player.takeDonationItem(id, this)) return;
    this._debugRefresh();
    this.sfx.menuMove();
  }

  _debugDropDonation(key) {
    if (!this.player.donationItems[key]) return;
    delete this.player.donationItems[key];
    this.player.rebuildMods();
    this.player.health = Math.min(this.player.health, this.player.maxHealth);
    this.player.mag = Math.min(this.player.mag, this.player.magSize);
    this._debugRefresh();
    this.sfx.menuBack();
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
    this.runningActiveItems.clear(this);
    this.queue.length = 0;
    this._pendingBuffs.length = 0;
    this.totemArea.dismiss();
    this.mysteryBox.dismiss();
    this._dismissDonationMachine();
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
    // Always names its block, mid-block or not: naming it is the point of the
    // jump, the same reason the wave number is in the line. In its colour,
    // like the real announce's.
    const dbgCfg = waveConfig(wave, this._themeSeed, HAVE_TYPE, this._forcedTheme);
    this.ui.banner('DEBUG  WAVE ' + wave, dbgCfg.themeName,
      '#' + dbgCfg.themeColor.toString(16).padStart(6, '0'));
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

  // The panel's click on a theme button. REFRESH RATHER THAN JUMP: the pin is
  // a setting, not a command - it says which theme the NEXT block is, not
  // that one should start now - so it takes effect on whatever wave opens next
  // (this one, if you jump). Refreshing is what lights the button, and the
  // sound is the menu's own move tick rather than a fanfare for a click that
  // changed nothing you can see yet.
  _debugSetTheme(key) {
    this.setTheme(key);
    this._debugRefresh();
    this.sfx.menuMove();
  }

  // A boss may outlast the reserve even when the player keeps landing hits.
  // Relief cannot replace an earned drop the player has chosen not to fetch.
  _updateReliefDrop(dt) {
    if (this.waveState !== 'active' || !this.bossFight?.parts.length
        || this._bossHpFrac() <= 0) return;
    this._reliefT -= dt;
    if (this._reliefT > 0) return;
    if (this.powerups.length >= MAX_ACTIVE_PICKUPS) {
      this._reliefT = SPAWN_RETRY;
      return;
    }
    const ammo = this.player.reserveAmmo + this.player.mag;
    if (ammo >= RELIEF_AMMO) {
      // Checked often, but the clock only starts once something is actually
      // wrong - so a comfortable player never banks relief they did not need.
      this._reliefT = 1;
      return;
    }
    if (this._ammoActive() > 0) {
      this._reliefT = SPAWN_RETRY;
      return;
    }
    this._addPickup(
      spawnRelief('ammo', this.arena, this.player.pos, this.scene, this.effects.glowTex, this.time)
    );
    this._reliefT = RELIEF_INTERVAL;
  }

  // The gate fractions every drop roll reads, assembled ONCE so the two
  // rollers - rollDrop for an ordinary kill, forcedDrop for PINATA's
  // guaranteed one - cannot drift apart. They already did (PLATED DESSERT
  // lifted the full-bar gate here and not there), which is why this exists.
  _dropArgs() {
    return [
      this.player.health / this.player.maxHealth,
      (this.player.reserveAmmo + this.player.mag) / this.player.maxReserve,
      this._ammoActive() < MAX_ACTIVE_AMMO,
      // RABBIT'S FOOT rides in as a multiplier on every category's chance, so
      // it lifts the need-adjusted odds in proportion rather than adding a
      // flat fifteen points - see the note on its entry in items/passive/index.js.
      this.player.mods.dropLuck,
      // A BATTERY IS ONLY ROLLED WHEN THERE IS A METER TO POUR IT INTO. No
      // item, or a meter already at its ceiling, and the category is skipped
      // outright rather than left to land as a plate the player walks over for
      // nothing - the same rule health holds at a full bar.
      !!this.player.activeItem && this.player.activeItemCharge < this.player.activeItemChargeMax,
      // PLASMA BAG lifts the full-bar gate on the health plate. The gate is
      // not a rule about health - it is the rule that a drop which cannot be
      // SPENT should not be rolled - and a crate carrying ten points of shield
      // can be spent on a full bar. PLATED DESSERT lifts the same gate for the
      // same reason: the five-point bank is spendable there too.
      this.player.mods.crateShield > 0 || this.player.mods.platedDessert > 0,
      // SECOND HELPINGS. The odds side of the pick - the heal side lives with
      // the pickup, in powerups.js, for the reason the chance's own note
      // gives: one crate, two books, no two stepped on.
      this.player.mods.crateLuck,
    ];
  }

  // One kill's roll. Independent of every other kill's - there is no budget
  // and no memory; see the note above rollDrop in powerups.js.
  _rollDrop(pos) {
    if (this.powerups.length >= MAX_ACTIVE_PICKUPS) return;
    const kind = rollDrop(...this._dropArgs());
    if (kind) this._placeDrop(kind, pos);
  }

  /**
   * PINATA's next drop, or null if the promise cannot be kept right now.
   *
   * NULL DOES NOT SPEND THE COUNTER. Two things can refuse: a floor already
   * holding as much loot as MAX_ACTIVE_PICKUPS allows, and a player who is
   * full of everything the table can offer. Neither is the player's fault and
   * neither should cost them one of their five, so the kill simply drops
   * nothing and the next one tries again - which is also the only reading
   * under which "the next 5 enemies you kill" stays true.
   */
  _pinataKind() {
    if (this.powerups.length >= MAX_ACTIVE_PICKUPS) return null;
    return forcedDrop(...this._dropArgs());
  }

  _ammoActive() {
    let n = 0;
    for (const p of this.powerups) if (p.typeKey === 'ammo') n++;
    return n;
  }

  /**
   * ONE DOOR ONTO THE FLOOR, for every pickup the game ever places.
   *
   * FIRE SALE shortens the fuse on all of them, and before this there were
   * three places that pushed onto `powerups` - the relief net, the scatter and
   * the ordinary drop - so the pick would have been correct about kills and
   * quietly wrong about the two spawners that exist precisely because the
   * player is in trouble.
   *
   * PURE OF HEART is gated HERE rather than at the three callers, for exactly
   * that reason: the relief net, the boss bleed, PINATA, FIRST FRUITS,
   * CURTAIN CALL and the ordinary roll are six doors and a seventh is one
   * totem away from being added. Money orbs are NOT pickups and never pass
   * through here - the pick takes the recovery off the floor and leaves the
   * economy standing.
   *
   * The blink rides the clock it always did (see Powerup.update), so a plate
   * on a shortened fuse spends its last five seconds blinking exactly like any
   * other - which is the only warning the player gets and is worth more, not
   * less, when there is less time.
   */
  _addPickup(p) {
    if (!p) return p;
    if (this.player.mods.noPickups > 0) return p;
    const k = this.player.mods.lootDespawn;
    if (k !== 1) p.despawnTime *= k;
    this.powerups.push(p);
    return p;
  }

  // Places a drop of a known kind at its source. Random arena supplies use
  // spawnAnywhere so a living boss cannot trap them underneath its body.
  _placeDrop(kind, pos) {
    this._addPickup(
      spawnDropAt(kind, pos, this.scene, this.effects.glowTex, this.time, this.arena.obstacles)
    );
    // The drop has to be findable in a fight it landed in the middle of.
    this.effects.burst(this._killPos.set(pos.x, (pos.y || 0) + 0.9, pos.z), 0xffe95e, 10, 3, 2, 0.5);
  }

  // LUCKY CORPSE's six guaranteed supplies. Spread in a small ring so their
  // plates remain individually readable instead of occupying one flickering
  // point. Guaranteed means no need gate and no ordinary active-pickup cap.
  _luckyCorpseDrop(pos) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const at = new THREE.Vector3(
        pos.x + Math.cos(a) * 1.15, pos.y || 0, pos.z + Math.sin(a) * 1.15
      );
      this._placeDrop(i < 3 ? 'health' : 'ammo', at);
    }
    this.effects.shockwave(pos, THEME_LUCKY_CORPSE, 5, 0.55);
    this.effects.burst(
      this._killPos.set(pos.x, (pos.y || 0) + 1, pos.z),
      THEME_LUCKY_CORPSE, 28, 7, 3, 0.75
    );
    this.sfx.jackpot();
  }

  _vendingDrop() {
    const kinds = Object.keys(POWERUP_TYPES);
    // POWERUP_TYPES intentionally excludes ammo, but the player's language is
    // "powerup" rather than "buff": include the ammo plate alongside every
    // table entry so the machine can dispense any pickup the floor supports.
    kinds.push('ammo');
    const kind = kinds[(Math.random() * kinds.length) | 0];
    this._placeDrop(kind, this.player.pos);
    this.ui.banner('VENDING MACHINE');
    this.sfx.pickupBuff();
  }

  // A boss sheds ammo as it crosses each health threshold. Without this a
  // forty-second boss fight would be the longest stretch in the game with no
  // resources in it at all: one kill, at the very end.
  _bossBleed() {
    const bf = this.bossFight;
    // No parts means the boss is already dead and _bossHpFrac reads 0, which
    // would trip every remaining threshold at once on a corpse.
    if (!bf || !bf.parts.length) return;
    const frac = this._bossHpFrac();
    bf.ammoOwed ??= 0;
    while (bf.bleedAt < BOSS_BLEED_THRESHOLDS.length
      && frac <= BOSS_BLEED_THRESHOLDS[bf.bleedAt]) {
      bf.bleedAt++;
      bf.ammoOwed++;
    }
    // A full floor must delay a guaranteed reward rather than erase it.
    // Record crossings separately so a healing boss cannot cancel or repeat
    // supplies the player already earned.
    while (bf.ammoOwed > 0 && this.powerups.length < MAX_ACTIVE_PICKUPS
      && this._ammoActive() < MAX_ACTIVE_AMMO) {
      const pickup = spawnAnywhere(
        'ammo', this.arena, this.scene, this.effects.glowTex, this.time, bf.parts
      );
      if (!pickup) break;
      this._addPickup(pickup);
      this.effects.burst(
        this._killPos.set(pickup.pos.x, pickup.pos.y + 0.9, pickup.pos.z),
        0xffe95e, 10, 3, 2, 0.5
      );
      bf.ammoOwed--;
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
      q.moveTo(q.pos.x + dx * k, q.pos.z + dz * k, p.y);
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

  /**
   * AMMO ALCHEMIST, armed by walking over an ammo crate. One element out of
   * the five, rolled NOW and held for the whole window - the card grants "a
   * random 8s shot buff", one thing, not a new die on every trigger pull.
   *
   * THE BANNER NAMES IT because the colour of the impact flash is otherwise
   * the only readout of which element landed, and a player who has to infer
   * FIRE from the second body they shot learns the pickup's answer one fight
   * too late.
   */
  _armAlchemy() {
    const el = ALCHEMY_ELEMENTS[(Math.random() * ALCHEMY_ELEMENTS.length) | 0];
    this.player.alchemistEl = el;
    this.player.alchemistEnd = this.time + this.player.mods.donationAlchemist;
    this.ui.banner('AMMO ALCHEMIST \u00b7 ' + el.label);
    this.effects.burst(this.player.eyeInto(this._killPos), el.color, 14, 4, 2, 0.4);
    this.effects.shockwave(this.player.pos, el.color, 3.5, 0.35);
    this.sfx.pickupBuff();
  }

  // Ticks pickups and collects any the player is standing on. Iterates
  // backwards so removals don't skip entries.
  _updatePickups(dt) {
    // ZERO WASTE's rescues this frame, counted so the chime at the bottom can
    // be one per frame rather than one per crate.
    let rescued = 0;
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const p = this.powerups[i];
      p.update(dt, this.time, this.player.pos);
      if (p.dead) {
        // ZERO WASTE. The last frame of a plate is the one payout in the game
        // the player never chose to take, so it comes to them wherever they
        // are - at half, the price of never having to reach it. `repeat` keeps
        // one-per-crate riders (GRISTLE's coin) from rolling on a crate that
        // was never picked up; every amount on the plate scales by the
        // fraction like any other payout.
        if (p.expired && this.player.mods.zeroWaste > 0
          && (p.typeKey === 'health' || p.typeKey === 'ammo')) {
          p.type.apply(this.player, this.time, this.player.mods.zeroWaste, true);
          // The tell has to close the loop from across the arena: a pop where
          // the plate was, so the vanish reads as a delivery, and a ring on
          // the player, so the grant is felt with no HUD readout to name it.
          this.effects.burst(p.pos, p.type.color, 10, 3, 1.5, 0.35);
          this.effects.shockwave(this.player.pos, p.type.color, 2.5, 0.25);
          rescued++;
        }
        this.powerups.splice(i, 1);
        continue;
      }
      if (p.tryPickup(this.player.pos)) {
        p.type.apply(this.player, this.time);
        // AMMO ALCHEMIST. Armed at the PICKUP and nowhere else - not the
        // wave-clear sweep, which is a bank rather than a pickup, and which
        // deliberately does not start timed buffs either (see _vacuumPickups)
        // because a shot element spent walking around a shop is an element
        // the player never had.
        if (p.typeKey === 'ammo' && this.player.mods.donationAlchemist > 0) {
          this._armAlchemy();
        }
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
    // One chime for the frame's rescues together - the same call the wave-clear
    // sweep makes, for its reason: five pickup chimes on one frame are not
    // five times the feedback, they are a click.
    if (rescued) this.sfx.pickupHealth();
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
    // pre-item block for the rest of the run.
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
    // ---- POSE -------------------------------------------------------------
    //
    // The other thing that can hold the crowd's attention, and it is the
    // monkey's trick pointed at the player's own body: while the window runs,
    // the room believes it is AIMING AT A CORPSE. The stand-in is frozen where
    // the player stood when the window opened - so the crowd converges on the
    // body, exactly as the monkey's does on the toy - and the player is free
    // to walk out from under it. The three player hooks are swapped to no-ops
    // on the monkey's terms: "ignoring you" has to mean the whole surface,
    // or a rusher that reached the spot would swing at whoever is standing in
    // it.
    //
    // THE DECOY IS A COMPLETE STAND-IN, on the monkey's terms and for the
    // monkey's reason: the wraith that reads `ctx.player.forwardInto` through
    // a local alias is one grep away from being missed again.
    //
    // ROUNDS IN THE AIR ARE NOT RECALLED - see the possum entry in
    // js/items/passive/index.js. A bullet does not know who it was for.
    const possum = this.player.possumEnd > this.time;
    if (possum && !this._possumDecoy) {
      const P = this.player;
      const at = new THREE.Vector3(P.pos.x, P.pos.y, P.pos.z);
      const yaw = P.yaw;
      this._possumDecoy = {
        pos: at,
        vel: new THREE.Vector3(),
        yaw,
        eyeH: 0,
        eyeInto: (v) => v.copy(at).setY(0.4),
        forwardInto: (v) => v.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
      };
    } else if (!possum && this._possumDecoy) {
      this._possumDecoy = null;
    }
    ctx.player = lure ? lure.decoy : (possum ? this._possumDecoy : this.player);
    // THE SNOWMAN IS THE ONE LURE THAT ANSWERS A HIT. Everything else that can
    // hold the crowd - the monkey, the possum corpse - treats a landed blow as
    // nothing happening; the snowman's burst IS the item, so a lure may carry
    // its own handler and the rest keep the no-op. The handler is handed the
    // same arguments the player would have been, which is what lets a bramble
    // tick and a boss's crescent both register as hits on the decoy.
    ctx.onHitPlayer = (lure || possum)
      ? ((lure && lure.onHit) || NO_HIT)
      : this._onHitPlayer;
    ctx.applyPlayerStatus = (lure || possum) ? NO_STATUS : this._onPlayerStatus;
    ctx.pullPlayer = (lure || possum) ? NO_PULL : this._onPullPlayer;
    ctx.nav = (lure || possum) ? null : this.nav;
    ctx.navBig = (lure || possum) ? null : this.navBig;

    // Refresh the route to the player once for the whole list, before anyone
    // reads it. The grid throttles itself; this call is cheap on most frames.
    // Skipped under POSE as well, for the same reason the lure skips it: the
    // grid is handed to nobody, and flooding it is work for a crowd that is
    // walking toward a corpse.
    if (!lure && !possum) {
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
      // CURTAIN CALL's address. Rewritten on every body and read once, at the
      // clear - so what it holds by then is literally the last enemy killed in
      // the wave, whether that was a boss part, a splitter child or something
      // a poison tick finished off across the room. A clone rather than the
      // enemy's own vector: `e` is about to be disposed.
      if (this.player.mods.curtainCall > 0) {
        this._lastKillPos = e.pos.clone();
      }
      // QUORUM. Ten bodies, one gun - see _quorumTurret.
      if (this.player.mods.quorumEvery > 0) {
        this.player.quorumKills++;
        if (this.player.quorumKills >= this.player.mods.quorumEvery) {
          this.player.quorumKills = 0;
          this._quorumTurret();
        }
      }
      // BAD OMEN and GOLD STAR, counted on the same booking the turret is:
      // whatever killed the body, the sweep is the one place a kill becomes
      // a fact the build can be paid on.
      if (this.player.mods.donationOmenTime > 0) this._badOmen();
      if (this.player.mods.donationGoldStep > 0) this._goldStarKill();
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
      // VENDING MACHINE counts every booked body, whatever killed it. The
      // fifteenth pays at the player's feet, where it can be collected on the
      // next pickup pass rather than stranded at a distant corpse.
      if (this.player.mods.vendingEvery > 0) {
        this.player.vendingKills++;
        if (this.player.vendingKills >= this.player.mods.vendingEvery) {
          this.player.vendingKills = 0;
          this._vendingDrop();
        }
      }
      // MONSOON. The kill's own clock, ticked on the frame the kill is booked
      // so the window is the time between BODIES rather than between shots.
      this.player.bumpMonsoon(this.time);
      // BODY COUNT's stack, and anything else that ever counts kills. Walked
      // rather than dispatched - see RunningActiveItems.onKill.
      this.runningActiveItems.onKill(this);
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
      // PINATA. Spent BEFORE the ordinary roll and instead of it: what the
      // item guarantees is that something drops, and rolling on top of a
      // guaranteed drop would be two plates off one body - which the arena's
      // own one-drop-per-kill rule says never happens.
      //
      // NOT ON A BOSS PART, on the same terms the roll below is not: a boss
      // pays out by bleeding at health thresholds and by its own bounty, and a
      // counter spent on the one body that is already a payout would be a drop
      // the player never sees.
      //
      // FIRST FRUITS SHARES THE COUNTER'S RULES AND NOT ITS COUNTER. It is the
      // same guarantee off the same table - a plate the player can actually use
      // - so it asks _pinataKind the same question and spends nothing when the
      // answer is no. What separates the two is WHEN: PINATA is five kills
      // bought with an item press, and this is the first three of every wave,
      // armed by armWaveGrants and never banked.
      //
      // PINATA IS TESTED FIRST because it was PAID FOR. A player holding both
      // on the opening kills of a wave spends the press's counter before the
      // wave's free one, which is the reading that never wastes the thing that
      // cost something.
      let forced = null;
      if (!e.boss && this.player.pinataLeft > 0) {
        forced = this._pinataKind();
        if (forced) this.player.pinataLeft--;
      }
      if (!forced && !e.boss && this.player.fruitsLeft > 0) {
        forced = this._pinataKind();
        if (forced) {
          this.player.fruitsLeft--;
          this.effects.shockwave(e.pos, THEME_FRUITS, 4, 0.4);
        }
      }
      if (forced) {
        this._placeDrop(forced, e.pos);
      } else if (!e.boss) this._rollDrop(e.pos);
      if (e.luckyCorpse && this.player.mods.luckyCorpse > 0) {
        this._luckyCorpseDrop(e.pos);
      }
      if (e.boss) this._bossDeathPos.copy(e.pos);
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
    e.group.remove(e.head);
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
      // passive items above already own that shape.
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
          best.applyStatus(
            'burn', m.burnTime,
            this.player.fireTickDamage * m.burnPower * m.dotPower
          );
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
      power: this.player.fireTickDamage * m.ashPower * m.dotPower,
      radius: m.ashRadius, drip: 0,
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

  // What one tick of HELLFIRE's trail is worth, snapshotted at the moment the
  // patch is laid like every other fire in the game. One
  // expression rather than two, because the arming branch and the laying
  // branch both need it and a copy is a place for them to drift.
  _hellfirePower() {
    const m = this.player.mods;
    return this.player.fireTickDamage * m.hellfirePower * m.dotPower;
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
  //
  // THE POWER AND THE RADIUS ARE ARGUMENTS NOW, because two picks lay this same
  // patch: HELLFIRE behind a reload and SCORCHED EARTH behind a slide. ONE list
  // and ONE cap over both, deliberately - they are the same object, and a
  // player sliding through their own reload trail should not evict it.
  _addFire(x, z, power, radius) {
    if (this._fire.length >= MAX_FIRE_PATCHES) {
      this.effects.creepRelease(this._fire.shift().creep);
    }
    this._fire.push({
      x, z, life: 2.4, power, radius, drip: 0,
      creep: this.effects.creepAcquire(false),
    });
    this.effects.burst(this._ashAt.set(x, 0.3, z), CREEP_FIRE, 5, 1.8, 1.6, 0.5);
  }

  // Lays the trail while it is burning and runs the patches down behind it.
  // Distance-gated rather than time-gated: a player standing still after a
  // reload leaves one patch under their feet, and a player running leaves a
  // continuous line however fast they are going.
  _updateFire(dt) {
    const m = this.player.mods;
    // SCORCHED EARTH. The same distance gate the reload trail uses, off the
    // same pair of last-laid coordinates - which is what lets a build holding
    // both picks lay ONE line while sliding out of a reload rather than two
    // interleaved ones at half spacing each.
    //
    // WHILE THE SLIDE IS ACTUALLY RUNNING, and not for a window afterwards: a
    // slide has a direction and an end (see SLIDE_TIME), so what it leaves is
    // a wall drawn across a room. That is the difference from HELLFIRE, which
    // follows the player around for five seconds however they move.
    const laying = this.time < this._fireUntil
      || (m.slideFire > 0 && this.player.sliding);
    // THE FIRST PATCH OF A RUN IS LAID IMMEDIATELY, not once the player has
    // travelled FIRE_STEP from wherever the last one happened to be. Without
    // this a slide begun near the end of a reload trail would drop nothing for
    // its first metre, and one begun anywhere else would drop its first patch
    // at a random point along its length - the gate measures a distance from a
    // stale coordinate. `_fireLaying` is the edge, and it is the same edge the
    // reload arms by hand at the arming site.
    const began = laying && !this._fireLaying;
    this._fireLaying = laying;
    if (laying) {
      const dx = this.player.pos.x - this._fireLastX;
      const dz = this.player.pos.z - this._fireLastZ;
      if (began || dx * dx + dz * dz > FIRE_STEP * FIRE_STEP) {
        this._fireLastX = this.player.pos.x;
        this._fireLastZ = this.player.pos.z;
        // The RELOAD's numbers win where both are running, because that window
        // is the one the player paid a magazine for and it is the shorter of
        // the two - a slide through it must not quietly weaken it.
        const hot = this.time < this._fireUntil;
        this._addFire(
          this.player.pos.x, this.player.pos.z,
          hot ? this._hellfirePower()
            : this.player.fireTickDamage * m.slideFire * m.dotPower,
          hot ? m.hellfireRadius : m.slideFireRadius
        );
      }
    }
    this._applyTrail(this._fire, dt, FIRE_TRAIL);
  }

  // ---- the two picks that hang off the music -------------------------------

  /**
   * SYNCOPATION and HEARTBEAT, on the downbeat.
   *
   * ON THE PULSE EDGE AND ON THE WHOLE BEAT. The sentries fire twice a beat
   * (see Turret.update) and the burn ticks on the upbeat; a third thing landing
   * on every pulse would make the beat a wash of numbers rather than a rhythm.
   * Once a beat is a thing the player can HEAR arriving, which is the only
   * reason to hang either of these on the music at all.
   *
   * `_beatPulse` is the edge, held the way every other reader of Music.pulse
   * holds one - see the worked example in music.js. Sampling the pulse VALUE
   * rather than a timer of our own is what stops a long frame swallowing a beat
   * or a short one firing two.
   *
   * NEITHER OF THEM BOOKS A KILL. Everything here goes through hurtEnemy, and
   * the death sweep in _updateEnemies collects whatever died this frame
   * whatever killed it - the combo, the bounty and the drop all compose there
   * and nothing needs a second path.
   */
  _updateBeatPicks() {
    const m = this.player.mods;
    if (m.syncopation <= 0 && m.heartbeat <= 0) return;
    if (this.music.pulse === this._beatPulse) return;
    const first = this._beatPulse < 0;
    this._beatPulse = this.music.pulse;
    if (first || !this.music.pulseWhole) return;
    if (!this.enemies.length) return;

    // SYNCOPATION. One body, chosen at random out of the living, for a flat
    // hit carried on the mods - the same shape HEARTBEAT pays in. It does not
    // read the weapon anymore: a pick that paid a shot's worth per beat was
    // bought twice by a damage build, once per pull and once per beat survived.
    //
    // THE ROLL IS OVER THE LIVING ONLY. Taking a random index out of `enemies`
    // and skipping it if it was dead would quietly make the pick fire less
    // often the more bodies were waiting to be swept, which is a rate nobody
    // could have predicted from the card.
    if (m.syncopation > 0) {
      const live = this._beatTargets;
      live.length = 0;
      for (const e of this.enemies) if (!e.dead) live.push(e);
      if (live.length) {
        const pick = live[(Math.random() * live.length) | 0];
        this.effects.impact(pick.pos, THEME_SYNCOPATION, 8, 4, 2.2, 0.3);
        this.hurtEnemy(pick, m.syncopationHit);
      }
      live.length = 0;
    }
    // HEARTBEAT. A coin per body per downbeat, and a flat point when it wins.
    //
    // A FLAT POINT AND NOT A FRACTION, one of the two numbers on this clock
    // that do not scale with the build - see the note on the entry. What that
    // buys is a pick whose value is about the SIZE OF THE WAVE, so it is worth
    // taking on a run that has drafted no damage at all.
    //
    // NO PARTICLE PER BODY. Thirty enemies each tossing a coin is up to six
    // impact bursts a beat, and the pool that draws them is shared with every
    // hit the player is landing at the same time.
    if (m.heartbeat > 0) {
      for (const e of this.enemies.slice()) {
        if (e.dead) continue;
        if (Math.random() >= m.heartbeat) continue;
        this.hurtEnemy(e, m.heartbeatHit);
      }
    }
  }

  // ---- COLD FOOT: the ice a sprint lays ------------------------------------

  // One patch of it: the fire trail's four-numbers-and-a-drip shape, on its own
  // list with its own cap, for the reason the fire trail is kept off the ash
  // list - see the note on _addFire. Friendly creep, exactly like ash and fire:
  // the player standing in their own ice has to be visibly safe, or nobody will
  // ever sprint.
  _addIce(x, z) {
    if (this._ice.length >= MAX_ICE_PATCHES) {
      this.effects.creepRelease(this._ice.shift().creep);
    }
    this._ice.push({
      x, z, life: ICE_LIFE, radius: this.player.mods.coldFootRadius, drip: 0,
      creep: this.effects.creepAcquire(false),
    });
    this.effects.burst(this._ashAt.set(x, 0.25, z), CREEP_ICE, 4, 1.4, 1.4, 0.5);
  }

  /**
   * Lays the trail while the player is running and runs the patches down
   * behind them.
   *
   * DISTANCE-GATED, exactly as the fire trail is, and with the same first-patch
   * edge: a sprint that began near an old patch would otherwise drop nothing
   * for its first metre, because the gate measures against a stale coordinate.
   *
   * OFF THE SPRINT AND NOT THE SLIDE, which is the whole difference between
   * this and SCORCHED EARTH. A slide is a second and a direction, so what it
   * leaves is a wall; a sprint is however long the stamina bar lasts and
   * wherever the player chooses to go, so what this leaves is a floor they can
   * draw on - and the thing chasing them has to cross whatever they drew.
   */
  _updateIce(dt) {
    const m = this.player.mods;
    const laying = m.coldFoot > 0 && this.player.sprinting;
    const began = laying && !this._iceLaying;
    this._iceLaying = laying;
    if (laying) {
      const dx = this.player.pos.x - this._iceLastX;
      const dz = this.player.pos.z - this._iceLastZ;
      if (began || dx * dx + dz * dz > ICE_STEP * ICE_STEP) {
        this._iceLastX = this.player.pos.x;
        this._iceLastZ = this.player.pos.z;
        this._addIce(this.player.pos.x, this.player.pos.z);
      }
    }
    this._applyTrail(this._ice, dt, ICE_TRAIL);
  }

  /**
   * The decay all three player-laid trails share: run each patch's clock
   * down, hold its creep slot at the patch's own radius, stand whatever is in
   * it into the status the trail exists to apply, and shed a drip now and
   * then. Written once so the fire and the ice cannot drift - they used to be
   * two copies of the same forty lines, kept in step by hand.
   *
   * The per-patch values that differ (the status, its duration, the drip's
   * timing and look) are the config's; see FIRE_TRAIL/ICE_TRAIL above.
   */
  _applyTrail(list, dt, cfg) {
    for (let i = list.length - 1; i >= 0; i--) {
      const f = list[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.effects.creepRelease(f.creep);
        list.splice(i, 1);
        continue;
      }
      this.effects.creepSet(f.creep, f.x, f.z, f.radius, cfg.creep, Math.min(1, f.life));
      for (const e of this.enemies) {
        if (e.dead) continue;
        const dx = e.pos.x - f.x;
        const dz = e.pos.z - f.z;
        if (dx * dx + dz * dz > f.radius * f.radius) continue;
        // Re-applied every frame an enemy is inside: applyStatus refreshes
        // rather than stacking, so the timer is topped up for as long as they
        // stand in the patch and runs down the moment they leave. The trail
        // is felt as a PLACE, not as a hit.
        e.applyStatus(cfg.status, cfg.duration(this, f), cfg.power(f));
      }
      // A third the rate a pool or a hazard drips at: there can be twenty of
      // these on the floor at once, and at the pool's rate one reload would
      // stand a couple of hundred particles up in the shared buffer.
      f.drip -= dt;
      if (f.drip <= 0) {
        f.drip = cfg.dripEvery;
        const ang = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * f.radius;
        this.effects.burst(
          this._ashAt.set(f.x + Math.cos(ang) * r, cfg.burstY, f.z + Math.sin(ang) * r),
          cfg.creep, ...cfg.burst
        );
      }
    }
  }

  // Pays every outstanding one-shot player fx flag, in PLAYER_FX's order.
  // Called TWICE a frame: once beside the HUD reads, and once after the
  // trigger and the melee, so a flag RAISED by the shot that just happened -
  // LAST BREATH's is - is still paid on the frame that raised it rather than
  // one frame after the player stopped wondering why nothing chimed.
  _payPlayerFx() {
    for (const [flag, pay] of PLAYER_FX) {
      if (!this.player[flag]) continue;
      this.player[flag] = false;
      pay(this);
    }
  }

  // ---- BEDBUGS: the second bite --------------------------------------------

  /**
   * The bites coming due. A quarter of what a round was worth, landing on the
   * body it was fired into two seconds after the fact.
   *
   * IT DIES WITH THE BODY, on DELAYED FUSE's terms and for its reason: what is
   * owed to a corpse would arrive as an unattributable number over an empty
   * floor, and a wave killed quickly would end in a minute of them. Tested here
   * rather than hooked into the kill sweep because `dead` is raised the instant
   * the killing blow lands whatever dealt it, and this sweep runs before the
   * roster is compacted - so no death can be missed and none of them needs a
   * line of its own.
   *
   * THROUGH hurtEnemy AND NOT BACK THROUGH _landShot. That is what bounds the
   * whole mechanic: a bite deals damage and books nothing, so it cannot arm a
   * bite of its own and a hit can never become an infinite series.
   *
   * NO DIRECTION IS PASSED. A bite arrives from inside the body rather than
   * along the line the round travelled, so armour reads its default - which is
   * the same answer poison, fire and every blast in the game get, and is the
   * honest one for damage that was already inside.
   */
  _updateBites() {
    for (let i = this._bites.length - 1; i >= 0; i--) {
      const b = this._bites[i];
      if (!b.en || b.en.dead) {
        this._bites.splice(i, 1);
        continue;
      }
      if (this.time < b.at) continue;
      this._bites.splice(i, 1);
      this.effects.impact(b.en.pos, THEME_BEDBUGS, 5, 2.5, 1.4, 0.24);
      this.hurtEnemy(b.en, b.dmg);
    }
  }

  /**
   * SPLASHBACK. Every affliction the player is carrying, put on the body they
   * just hit.
   *
   * ONLY WHAT AN ENEMY CAN CARRY, and the mapping is the whole method. Burning,
   * poison, the chill and fear exist on both sides of this fight and are passed
   * straight through - `slowness` on the player is `slow` on an enemy, which is
   * the one name that differs. WEAKNESS and CURSE exist only on the player (see
   * status.js): there is nothing on an enemy for them to become, and inventing
   * a meaning for them here would be a second definition of a word the player
   * already knows from their own HUD.
   *
   * THE POWER IS THE STATUS'S FIXED BASE, exactly as VENOM and INCENDIARY use.
   * It does not inherit the rate of whatever afflicted the player and generic
   * weapon damage cannot move it. MALADY still scales both statuses.
   *
   * THE DURATION IS THE PLAYER'S REMAINING TIME, not the table's full one. What
   * the card promises is that the shots carry what the player has, and eight
   * fresh seconds of poison off a burn with half a second left would be the
   * pick manufacturing an affliction rather than passing one on.
   */
  _splashback(en) {
    const m = this.player.mods;
    const P = this.player.status;
    if (P.fire > 0) {
      en.applyStatus('burn', P.fire * m.dotTime, this.player.fireTickDamage * m.dotPower);
    }
    if (P.poison > 0) {
      en.applyStatus(
        'poison', P.poison * m.dotTime, this.player.poisonTickDamage * m.dotPower
      );
    }
    if (P.slowness > 0) en.applyStatus('slow', P.slowness);
    if (P.fear > 0) en.applyStatus('fear', P.fear);
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
      x, z, radius, life, maxLife: life, dps, kind, acc: 0, tick: 0,
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
  //
  // The return is whether anything landed, so a caller billing on the
  // status's behalf - a hazard's carve - can ask before charging for one that
  // was refused.
  _afflictPlayer(kind, secs) {
    if (this.state !== 'playing') return false;
    if (this.time < this.player.invulnEnd) return false;
    return this.player.applyStatus(kind, secs);
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
      // THE ONE GROUND THAT GROWS. A spreading patch starts at a fraction of
      // its final size and its radius walks out to the rest - the circle the
      // mortar or ring drew - over the first spreadSecs of its life, eased so
      // the edge reads as creeping rather than popping. The DAMAGE test below
      // reads this same number, not h.radius: a patch that hurt at full
      // extent while drawing small would be the game lying about where is
      // safe, which is the one thing ground in this game may never do.
      let radius = h.radius;
      if (k.spread) {
        const age = Math.min(1, Math.max(0, (h.maxLife - h.life) / k.spreadSecs));
        radius = h.radius * (1 - k.spread * (1 - age * age));
      }
      this.effects.creepSet(h.creep, h.x, h.z, radius, k.color, fade);
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
      // `radius`, not h.radius: for the one kind that grows, the danger is
      // where the drawing has reached - see the spread block above.
      if (!immune && dx * dx + dz * dz < radius * radius && this.player.pos.y < 0.8) {
        // WADING BOOTS answer the two literal liquid hazards. The patch keeps
        // its drawing and expiry, but refreshes a short movement penalty in
        // place of both its direct damage and its lingering status.
        if (this.player.mods.wadingSlow > 0
          && (h.kind === 'pool' || h.kind === 'lava')) {
          this.player.wadingEnd = Math.max(this.player.wadingEnd, this.time + 0.12);
          continue;
        }
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
          // THROUGH THE FRONT DOOR, not straight onto the player. _afflictPlayer
          // is where `invulnEnd` is checked, and applying the status directly
          // here meant a player could be set alight mid-AEGIS by standing in
          // lava - the one thing the item exists to prevent.
          //
          // THE CARVE IS THE STATUS'S TO PAY. A carved patch splits its rate
          // between the status and the ground, and the ground's half exists
          // only because the status does: a status that was refused - IRON
          // LUNG, WHITE CELL's lock - leaves the ground with nothing to bill.
          // Billing anyway had a fully status-immune player bleeding from a
          // patch whose whole payload had just failed to stick. ANTIDOTE is
          // untouched either way: lava is not poison.
          if (this._afflictPlayer(k.status, k.secs)) {
            if (k.carve) dps = Math.max(0, dps - PLAYER_STATUS[k.status].dps);
          } else if (k.carve) {
            dps = 0;
          }
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
      // NO DRIP. Ground creep used to throw flecks up out of itself every
      // seventh of a second, and it was wrong twice over: the colour was a
      // hardcoded green for every kind but lava, so a patch of ICE spat green
      // sparks - and even with the colour fixed, the patch does not need them.
      // The stain, the cloud on the kinds that have one, and the burst when it
      // lands already say a hazard is there, and a dozen patches all breathing
      // particles at once was noise standing directly between the player and
      // the floor they are reading. Anything that must be seen from across the
      // room is a decal or a cloud, not a fleck.
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
    // BUT INVINCIBILITY IS NOT THE WARD. The paragraph above is about Holy
    // Mantle's charge - a once-a-wave ward that must not be spent on a single
    // point of pool damage - and it never meant that AEGIS should be ignored
    // too. `invulnEnd` is not a resource being spent; it is a window in which
    // nothing is supposed to be able to hurt the player, and an item whose card
    // reads INVINCIBLE while a burn keeps eating health is simply broken.
    //
    // The status TIMERS keep running underneath, which is the honest behaviour:
    // Aegis does not put the fire out, it means the fire cannot reach you while
    // it is up. Walk out of the window still burning and the burn resumes.
    if (this.time < this.player.invulnEnd) return;
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
    if (this.player.lastDamageTaken > 0 && this.player.mods.gracePeriod > 0) {
      this.player.invulnEnd = Math.max(
        this.player.invulnEnd, this.time + this.player.mods.gracePeriod
      );
      this.effects.shockwave(this.player.pos, 0xe8f5ff, 3.2, 0.35);
    }
    if (this.player.deadSwitchFx) this._deadMansSwitch();
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
  _addMortar(x, z, radius, delay, damage, ground = null) {
    if (this._mortars.length >= MAX_MORTARS) return;
    this._mortars.push({
      x, z, radius, delay, damage, t: 0, mark: this.effects.markAcquire(),
      // What the impact LEAVES, when the thrower named any - a SAPPHIRE seed
      // is a delayed hit that lands as ground, so the ring it fills is the
      // ground it is about to become. Null for every other mortar in the
      // game, which stay pure delayed hits.
      ground,
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
      // AND WHAT IT LEAVES. A mortar that names ground lays it as it goes off,
      // inside the ring it has been filling - so a SAPPHIRE seed's warning
      // circle is the patch it becomes, drawn at the patch's FINAL size: the
      // ground the player is being asked about is the ground it will reach,
      // and the spread does the rest. The shockwave above stays red for every
      // mortar; the ground's own splash is drawn in its own colour by
      // _addHazard, which is the honest readout of whose floor it became.
      if (m.ground) {
        this._addHazard(m.x, m.z, m.ground.radius, m.ground.life,
          m.ground.dps, m.ground.kind);
      }
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
    // BLOOD PRICE still multiplying damage across a wave boundary would be a
    // buff nobody was granted, and a turret firing into the shop would be
    // furniture the player has to wait out.
    this.runningActiveItems.clear(this);
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
        dst.applyStatus(
          'poison', m.poisonTime * m.dotTime,
          this.player.poisonTickDamage * m.poisonPower * m.dotPower
        );
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
  //
  // WHAT A SHARD IS WORTH IS WHAT A SHOT IS WORTH, four times over - read off
  // the player's current effective round, so every damage passive item in the
  // build feeds the ring. Unlike poison and fire this is a real hit, not a
  // status tick. Snapshotted here, at the throw, rather than carried on the shard:
  // a totem claimed while eight shards are in the air must not rescale them.
  _reloadBurst() {
    const m = this.player.mods;
    const n = m.reloadShards;
    if (n <= 0) return;
    const dmg = this.player.getEffectiveDamage(this.player.weapon.damage) * m.reloadShardMult;
    const spin = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      if (this.projectiles.length >= MAX_PROJECTILES) break;
      const a = spin + (i / n) * Math.PI * 2;
      this.projectiles.push(new Shard(
        this.scene, this.effects.glowTex,
        this.player.pos.x, 1.0, this.player.pos.z,
        Math.cos(a), Math.sin(a), 16, dmg, 2.2
      ));
    }
    this.effects.shockwave(this.player.pos, 0xff7043, 2.5, 0.35);
    this.effects.addShake(0.08);
  }

  // THUNDERCLAP. Flat damage, deliberately: five remains five whether the
  // rifle is fresh or carrying a full damage build, exactly as the card says.
  // Every living body is struck once on the frame the magazine seats.
  _thunderclap() {
    const damage = this.player.mods.thunderclap;
    if (damage <= 0) return;
    for (const e of this.enemies) if (!e.dead) this.hurtEnemy(e, damage);
    this.effects.shockwave(this.player.pos, THEME_THUNDERCLAP, 24, 0.65);
    this.effects.burst(
      this.player.eyeInto(this._killPos), THEME_THUNDERCLAP, 24, 7, 3, 0.65
    );
    this.sfx.impact();
  }

  // DEAD MAN'S SWITCH. The player raises the edge-trigger flag at the exact
  // health crossing; the game owns the roster, so it pays the room hit here.
  _deadMansSwitch() {
    this.player.deadSwitchFx = false;
    for (const e of this.enemies) {
      if (!e.dead) this.hurtEnemy(e, this.player.mods.deadSwitch);
    }
    this.effects.shockwave(this.player.pos, THEME_DEAD_SWITCH, 24, 0.8);
    this.effects.burst(
      this.player.eyeInto(this._killPos), THEME_DEAD_SWITCH, 48, 10, 4, 0.9
    );
    this.effects.addShake(0.5);
    this.sfx.itemBlast();
    this.ui.banner("DEAD MAN'S SWITCH");
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
    // WOLF PACK reads the LIVE COUNT on the same mirror as the balance: the
    // roster is Game state, and effectiveFireRate must not walk it several
    // times a trigger pull. `enemies` is compacted by _updateEnemies every
    // frame, so its length IS the field's count - no dead entries, nothing
    // held over.
    this.player.aliveCount = this.enemies.length;
    // FIRE SALE's fuse, pushed with the balance and for the same reason: both
    // are things the BUILD decides and the systems that read them have no way
    // to ask. Idempotent - setLifetime returns immediately when nothing moved.
    this.money.setLifetime(ORB_LIFETIME * this.player.mods.lootDespawn);
    // VINTAGE ORBS' rate, published on the same line and for the same reason:
    // money.js is a leaf with no player to read, and both numbers can change
    // between any two waves. Note the ORDER - the fuse is set first, so the
    // ceiling the age bonus is clamped against is this frame's fuse and not
    // last frame's. A run holding FIRE SALE as well therefore ripens its orbs
    // over ten seconds rather than twenty, which is the honest reading: the
    // bonus is paid for time on the floor, and that pick halves the time there
    // is.
    this.money.setVintage(this.player.mods.vintage);
    // Beside the balance, because it is a fact about the balance: it is the
    // rate everything on the floor is being paid at. Hidden at 1x - a "x1"
    // sitting there permanently is not information.
    this.ui.setFlawless(this.flawlessMult());
    this.ui.setHealth(this.player.health, this.player.maxHealth, this.player.totalShield);
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
        ? (this.player.salvoEnd - this.time) / this.player.mods.salvoTime : 0,
      // BOTTOM FEEDER. Exactly Opening Salvo's shape - a deadline on the player
      // and a duration on the mods - and until now the only timed damage window
      // in the game with nothing on screen: the player reloaded from empty,
      // deliberately, and then had to guess how much of their five seconds was
      // left.
      this.player.bottomEnd > this.time && this.player.mods.bottomTime > 0
        ? (this.player.bottomEnd - this.time) / this.player.mods.bottomTime : 0
    );
    this.ui.setItemBuffs(this.runningActiveItems.chips(this._itemChips));
    this.ui.setStatuses(this.player);
    // THE ACTIVE ITEM SLOT. Hidden entirely while nothing is carried - an empty
    // frame in the corner is a permanent question about a system the player has
    // not met yet.
    const item = this.player.activeItem ? ACTIVE_ITEMS[this.player.activeItem] : null;
    // TWO FRACTIONS, ONE METER. Both come off the same number - see
    // Player.activeItemChargeFrac - so a run without TWIN CELL simply passes a
    // second zero and the HUD has no idea the passive item exists.
    this.ui.setItem(
      this.player.activeItem, item,
      this.player.activeItemChargeFrac(0), this.player.activeItemChargeFrac(1)
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
    if (!p.activeItem) return null;
    const def = ACTIVE_ITEMS[p.activeItem];
    return {
      id: p.activeItem,
      name: def.name,
      effects: def.effects,
      theme: def.theme,
    };
  }

  // The owned build, in the order it was picked up, carrying each passive item's own
  // theme colour and its own effect lines so the list reads as the totems the
  // player has been walking into all run - and says what each of them did.
  _statPassives() {
    const out = [];
    for (const [id, n] of Object.entries(this.player.passiveItems)) {
      const def = PASSIVE_ITEMS[id];
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
    for (const [id, def] of Object.entries(DONATION_ITEMS)) {
      const key = donationItemKey(id);
      if (!this.player.donationItems[key]) continue;
      out.push({
        id: key,
        name: def.name,
        effects: Array.isArray(def.effects) ? def.effects : def.effects(0),
        theme: def.theme,
        tier: 1,
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
        if (this.player.mods.thunderclap > 0) this._thunderclap();
        // WAVETABLE. The index has already stepped inside Player.update -
        // this edge is the same one that seated the magazine - so all that
        // is left is to tell the player which element they are holding: a
        // flash at the muzzle in the new element's own colour, on the same
        // one-frame signal THUNDERCLAP rides.
        if (this.player.mods.wavetable > 0) {
          const el = WAVETABLE[this.player.wavetable % WAVETABLE.length];
          this.effects.burst(
            this.player.muzzleInto(this._killPos), el.color, 12, 4, 2, 0.4
          );
        }
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
          this._addFire(
            this.player.pos.x, this.player.pos.z, this._hellfirePower(),
            this.player.mods.hellfireRadius
          );
        }
        // FRESH BANDAGES, on the same one-frame signal for the same reason:
        // the magazine SEATING is the event, so a reload cancelled halfway by
        // a weapon swap or a death pays nothing. Gated at half the bar, so a
        // run that is winning gets nothing from it at all.
        const bandage = this.player.mods.bandage;
        if (bandage > 0 && this.player.health <= this.player.maxHealth * 0.5
          && this.player.heal(bandage) > 0) {
          this.effects.shockwave(this.player.pos, THEME_BANDAGE, 3, 0.35);
          this.sfx.pickupHealth();
        }
        // PRIMED MAG, on the same one-frame signal, so a build holding all
        // three gets all three off one magazine.
        this._throwSpentMag();
      }
      // Double Jump and Double Dash raise one-shot flags rather than calling
      // effects themselves: player.js has no effects reference, and the same
      // split is already what reloadFinished uses.
      // THE ONE-SHOT PLAYER FLAGS, paid in table order - see PLAYER_FX.
      this._payPlayerFx();
      // UPDRAFT's wisp is NOT one-shot: true on every frame the float is
      // holding, so it is throttled off the frame clock rather than paid - at
      // 60fps an unthrottled burst here is 60 particle allocations a second
      // for one held button.
      if (this.player.floatFx && this.time - this._floatFxAt > 0.09) {
        this._floatFxAt = this.time;
        this.effects.burst(this.player.pos, THEME_UPDRAFT, 3, 1.6, 1.4, 0.35);
      }
      // STILT LEGS' LANDING. Not an announcement either - a fall asked for is
      // a hit dealt, and paying it through hurtEnemy is what keeps the kill
      // booked, streaked and bountied like every other hit. The shove is read
      // off `knock`, the same verb KNOCKOUT DROPS and SCORCHED EARTH use for
      // interruption - bosses and the immovable are exempt there, exactly as
      // they are for every shove in the game.
      if (this.player.stiltLanding) {
        this.player.stiltLanding = false;
        const damage = this.player.weapon.damage * 3;
        // Enemies inside the ring are shoved off it and handed three times
        // the base damage the card names. The shove is fresh-momentum for
        // every body caught - a landing beside something that already got one
        // knock is not a refund.
        for (const en of this.enemies) {
          if (en.dead) continue;
          const dx = en.pos.x - this.player.pos.x;
          const dz = en.pos.z - this.player.pos.z;
          const dist = Math.hypot(dx, dz);
          if (dist > 3) continue;
          en.knock(dx, dz, 0.35, 0.4);
          this.hurtEnemy(en, damage, this._knockback.set(dx, 0, dz));
        }
        this.effects.shockwave(this.player.pos, PASSIVE_ITEMS.stiltLegs.theme, 3.6, 0.32);
        this.effects.burst(this.player.pos, PASSIVE_ITEMS.stiltLegs.theme, 18, 5, 2.2, 0.4);
        this.effects.addShake(0.22);
        this.sfx.impact();
        this.pad.rumble(0.5, 0.3, 120, 1);
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
      // PRESSURE COOKER. Published immediately before the trigger is read, so
      // the shot uses this frame's player position and live roster rather than
      // a count left over from the previous HUD pass.
      let close = 0;
      const pressureR = this.player.mods.pressureRadius;
      if (pressureR > 0) {
        const r2 = pressureR * pressureR;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dx = e.pos.x - this.player.pos.x;
          const dz = e.pos.z - this.player.pos.z;
          if (dx * dx + dz * dz <= r2) close++;
        }
      }
      this.player.nearbyEnemies = close;
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
      // COLD FOOT's ice, beside the fire trail it is modelled on and before the
      // enemy sweep for the reason the ash and the poison spread are there: a
      // body killed by one of these this frame is collected by the sweep this
      // frame rather than drawn for one more.
      this._updateIce(dt);
      // BEDBUGS' second bites and the two picks that ride the beat, on the same
      // side of the sweep and for the same reason.
      if (this._bites.length) this._updateBites();
      this._updateBeatPicks();
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
      // SECONDARY INFECTION's depth, pushed on the same terms and for the same
      // reason: applyStatus is on the enemy and cannot see a build. Written
      // every frame rather than on an edge, because setPoisonStackCap is a
      // single clamped assignment - there is nothing here worth an edge test.
      setPoisonStackCap(this.player.mods.poisonStacks);
      setStatusDurationBonus(this.player.mods.statusDurationBonus);
      // GRAY MATTER. Written on the frame it changes and never again.
      const mono = this.player.mods.mono > 0;
      if (mono !== this._monoOn) {
        this._monoOn = mono;
        this.crt.setMono(mono);
      }
      // THE ONE-SHOT FLAGS AGAIN, now that the trigger and the melee have had
      // their say this frame - LAST BREATH's is raised by the shot itself (see
      // reloadFinished), and a chime a frame late is a chime the player does
      // not connect to the thing they did. Idempotent; usually a no-op walk.
      this._payPlayerFx();
      // The running items tick BEFORE the enemy sweep, so anything SUTURE
      // ENGINE heals or BODY COUNT is multiplying is already true for the
      // frame the enemies are updated in - and so an item that expires this
      // frame has handed its multiplier back before a shot can read it.
      this.runningActiveItems.update(this, dt);
      // BACKORDER's parcel and LIFE INSURANCE's receipt. After the running
      // list, because the running list is where LIFE INSURANCE's window is
      // ended - so a claim and the window closing on the same frame are drawn
      // in the order they happened. Neither is gated on the wave: the parcel
      // is deliberately allowed to arrive in the shop.
      this._updateItemDeliveries();
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
