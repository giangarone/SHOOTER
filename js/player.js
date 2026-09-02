// Player movement, weapon state and camera.
//
// Conventions used across the whole game:
//   - World units are roughly metres, Y is up, the arena floor is y = 0.
//   - `pos` is at the player's FEET. The camera/eye sits 1.7 above it, which
//     is why eyeInto() exists - use it for anything aim- or hit-related.
//   - yaw rotates around Y, pitch around X, applied in that order ('YXZ').
//     Both increase counter-clockwise, so the mouse handler in main.js
//     subtracts movement.
//   - The player is a circle of radius 0.4 for collision (see utils.js).
//
// This class owns no scene objects except the gun, which is parented to the
// camera so it renders as a first-person viewmodel.

import * as THREE from 'three';
import { resolveCircle } from './utils.js';
import { UPGRADES } from './upgrades.js';
import { WEAPONS, STARTING_WEAPON, setGunMarks } from './weapons.js';
import { PLAYER_STATUS, PLAYER_STATUS_KEYS } from './status.js';

// Every stat an upgrade is allowed to touch, at its un-upgraded value.
//
// rebuildMods() resets to a copy of this and replays the whole owned-upgrade
// list on top, so an upgrade's apply() always starts from a clean slate. Add a
// field here before referencing it from upgrades.js, and read it at the point
// of use rather than caching it - a draft pick can change any of these
// mid-run, between any two waves.
const DEFAULT_MODS = {
  fireRate: 1,          // multiplier on shots per second
  damage: 1,            // multiplier on all outgoing damage
  magMult: 1,           // multiplier on magazine size
  reloadMult: 1,        // multiplier on reload duration
  maxHpBonus: 0,        // flat max health added before maxHpMult
  maxHpMult: 1,
  moveMult: 1,          // multiplier on move speed
  regenDelay: 10,        // seconds without damage before regen starts
  // NO NATURAL REGENERATION. Health only ever comes back from something the
  // player picked: Nanoweave, Antidote's leech, Vampiric, a health crate. A
  // free trickle meant every wave break healed the run back to full on its
  // own, which is exactly the cost the health economy is supposed to charge.
  // Zero here, and the regen branch in update() is skipped entirely until a
  // mutation raises it.
  regenRate: 0,         // health per second once regenerating (mutations only)
  killHealChance: 0,    // Vampiric Rounds: chance a kill heals 1 HP
  ammoRegen: 0,         // reserve rounds per second
  creditMult: 1,        // multiplier on credits earned
  ammoOnKill: 0,        // reserve rounds granted per kill
  magnetMult: 1,        // Lodestone: multiplier on the money-orb collection
                        // radius (and, at a reduced rate, on the pickup one)
  bloodlust: 0,         // Bloodlust: fire rate gained per kill in the combo
  bloodlustMax: 0,      // Bloodlust: kills past which it stops climbing
  shockwave: 0,         // damage dealt to nearby enemies when hit
  shockwaveRadius: 0,
  steady: 0,            // extra damage fraction while standing still

  // MUTATION FIELDS. These are the single-tier picks - each is set by exactly
  // one upgrade with max: 1, so they are flags and rates rather than
  // multipliers that stack. Zero means the mutation is not owned, which is
  // what every hook in main.js tests.
  poisonDps: 0,         // Venom: damage per second, for poisonTime seconds
  poisonTime: 0,
  burnDps: 0,           // Incendiary: damage per second, for burnTime seconds
  burnTime: 0,
  burnSpread: 0,        // metres the burn jumps when a burning enemy dies
  slowTime: 0,          // Cryo: seconds of movement and projectile slow
  fearTime: 0,          // Terror: seconds an enemy flees instead of attacking
  petrifyChance: 0,     // Petrify: chance per enemy per shot to freeze
  petrifyTime: 0,
  chainDamage: 0,       // Arc Rounds: fraction of the hit that jumps onward
  chainRange: 0,
  knockback: 0,         // Knockout Drops: metres an enemy is shoved per shot
  midas: 0,             // Midas Touch: flag, gold spray on hit
  blastDamage: 0,       // Detonator: damage at the centre of the impact blast
  blastRadius: 0,
  corpseDamage: 0,      // Blast Corpse: damage when an enemy dies
  corpseRadius: 0,
  volley: 1,            // Twenty/Twenty: shots fired per trigger pull
  volleyDamage: 1,      // multiplier on each of them
  wardPerWave: 0,       // Holy Mantle: free hits granted at each wave start
  extraLives: 0,        // Dead Cat: revives per run
  pierce: 0,            // Piercing Shot: extra enemies a shot passes through
  pierceFalloff: 1,     // damage multiplier per enemy already pierced
  gravityPull: 0,       // Gravity Rounds: metres enemies are dragged inward
  gravityRadius: 0,
  berserk: 0,           // Berserker: bonus damage at zero health
  ammoPerShot: 1,       // Triple Tap: rounds a single shot costs
  cursedChance: 0,      // Cursed Ammo: chance a shot costs 1 HP and hits harder
  cursedDamage: 0,
  beltFeed: 0,          // Belt Feed: chance a shot comes from the reserve
  dodgeChance: 0,       // Evasion: chance an incoming hit is avoided outright
  reloadShards: 0,      // Reload Burst: shards thrown when a reload finishes
  reloadShardDamage: 0,
  shatterDamage: 0,     // Crystallize: blast when a frozen enemy dies
  shatterRadius: 0,
  ashDps: 0,            // Ashen: lingering cloud where a burning enemy died
  ashRadius: 0,
  ashTime: 0,
  poisonSpread: 0,      // Neurotoxin: radius poison jumps to a clean enemy
  entropyBelow: 0,      // Entropy: HP fraction under which statuses never end
  dotPower: 1,          // Malady: multiplier on poison and burn damage
  dotTime: 1,           // Malady: multiplier on poison and burn duration
  chargeDamage: 0,      // Breach Round: blast on the first shot after a reload
  chargeRadius: 0,
  homingAngle: 0,       // Seeker: half-angle a MISSED shot may curve through
  homingRange: 0,       // and how far out it will look for something to hit
  ashChance: 0,         // Ashen: chance a burning death actually leaves a cloud
  lightningChance: 0,   // Lightning Wizard: chance a hit calls a bolt down
  lightningDamage: 0,   // straight onto the enemy that was hit
  lightningSplash: 0,   // and to everything else inside lightningRadius
  lightningRadius: 0,
  reserveMult: 1,       // Ammo Hoarder: multiplier on reserve ammo CAPACITY
  streakStep: 0,        // Hot Streak: damage gained per hit, lost per miss
  streakCap: 0,         // and the ceiling and floor it is clamped between
  streakFloor: 0,
  extraJumps: 0,        // Double Jump: midair jumps granted per landing
  dashCharges: 0,       // Double Dash: dashes held at once, one back per
                        // DASH_RECHARGE seconds
  noHitBonus: 0,        // No-Hit Bonus: damage and fire rate gained per wave
                        // cleared without taking damage. Unlike everything
                        // else here it accumulates across the run - see
                        // noHitStacks, NO_HIT_CAP and rebuildMods().

  // DEVIL DEALS. Bought from the Devil with max HP rather than rolled for
  // free, but otherwise ordinary mods: they are set by an apply() in
  // upgrades.js and replayed by rebuildMods() like everything above. The PRICE
  // is not here - it is paid once into maxHpDebt and never revisited.
  carnageStep: 0,       // Carnage: damage gained per kill, lost on any hit
  carnageMax: 0,        // and the ceiling it climbs to
  killHeal: 0,          // Blood Pact: HP healed per kill
  damageTakenMult: 1,   // Blood Pact: multiplier on all damage the player takes
  dodgeInvuln: 0,       // Demonic Dodge: seconds of invulnerability after a dodge
  dodgeRage: 0,         // and the damage bonus it grants,
  dodgeRageTime: 0,     // for this many seconds
  hellfireDps: 0,       // Hellfire: burning trail dropped behind a reload
  hellfireTime: 0,
  hellfireRadius: 0,
  statusEternal: 0,     // Eternal Affliction: enemy statuses never expire
  hazardMult: 1,        // and pools and lava hurt this much more
  worldSlow: 1,         // Absolute Zero: multiplier on enemy and projectile speed
  hitFreeze: 0,         // and seconds the player is frozen by a hit
  overloadFrac: 0,      // Overload: fraction of max HP lightning removes when
                        // the magazine runs dry
  bossHpMult: 1,        // Executioner: multiplier on boss health at spawn
  poisonImmune: 0,      // Antidote: poison pools do nothing
  poisonLeech: 0,       // and each poisoned enemy heals this much per second
  gamble: 0,            // Devil's Gamble: 51% double damage, 49% half, per shot
  devilAlways: 0,       // Demonic Presence: the Devil appears after every boss
  thorns: 0,            // Thorns: fraction of a hit reflected onto the attacker
};

// The only ground speed there is. Sprint used to sit on top of a 6.5 walk;
// holding a key to move at the speed the game is balanced around was a tax
// rather than a decision, so the walk is gone and this is what everyone gets.
const BASE_SPEED = 10;
// Reserve ammo capacity before Ammo Hoarder. Read through the maxReserve
// getter, never stored, so the mutation cannot be lost by a reset().
const BASE_RESERVE = 300;
// Jump impulse against the 22 m/s^2 gravity in update(). The AIR jump is
// deliberately the stronger of the two: a second hop that only matched the
// first would clear nothing the first had not already cleared. 9 tops out at
// 1.84m; 11 taken at that apex reaches roughly 4.6m, which is over every enemy
// in the pool.
const JUMP_V = 9;
const AIR_JUMP_V = 11;
// Double Dash: how long a dash lasts, its PEAK speed, and how long one spent
// charge takes to come back.
//
// THE ENVELOPE IS THE WHOLE FEATURE. The first version held a flat 26 m/s for
// 0.18s and then dropped the player back to a walk on a single frame, which is
// where the old "it stops dead" read came from: the arrival was a step change
// in velocity, and a step change in velocity is exactly what the eye reads as
// hitting something. dashShape() below replaces the rectangle with a smooth
// curve - eased up over DASH_IN of the window, eased back down over the rest -
// so the player accelerates INTO the dash and coasts OUT of it into their own
// walking speed with no discontinuity anywhere.
//
// Mean of the shape is 0.5 by construction (both halves integrate to half
// their width), so the distance covered is DASH_SPEED * DASH_TIME * 0.5.
//
// LENGTHENED BY HALF, AND THE LENGTH IS WHERE THE SMOOTHNESS CAME FROM. The
// extra distance is bought with TIME rather than with peak speed: the peak is
// still 42 m/s, so the launch hits exactly as hard as it did, but the window
// is 0.675s instead of 0.45s and 14.2m instead of 9.5m. Every millisecond of
// that goes into the exit, which is the half the player was reading as abrupt
// - the ramp back down is now 0.57s where it used to be 0.35s, so the hand-off
// into a 10 m/s walk is spread over nearly twice as long a fall.
const DASH_TIME = 0.675;
const DASH_SPEED = 42;
// Fraction of the window spent ramping UP. Held at ~0.1s in absolute terms
// (0.15 of the longer window, where it was 0.22 of the shorter one): the dash
// still has to answer a slam the frame it is pressed, so almost all of the
// curve is the exit.
const DASH_IN = 0.15;
const DASH_RECHARGE = 2.5;

// The dash's speed envelope at `u` (0..1 through the window), 0..1.
//
// The ramp up is smoothstep - a cubic, zero slope at both ends. The fall is
// SMOOTHERSTEP, the quintic: zero first AND second derivative at each end, so
// the deceleration itself eases in and out instead of being applied in a step.
// That second derivative is the whole difference. A cubic fall still hands the
// player a sudden change in how hard they are slowing down at the moment the
// dash lets go, and a change in acceleration is what the eye reads as a bump
// even when the velocity curve through it is perfectly continuous. The quintic
// has nothing to read at either end.
function dashShape(u) {
  if (u < DASH_IN) {
    const t = u / DASH_IN;
    return t * t * (3 - 2 * t);
  }
  const t = 1 - (u - DASH_IN) / (1 - DASH_IN);
  return t * t * t * (t * (t * 6 - 15) + 10);
}
// The ceiling on No-Hit Bonus, as a fraction. The mutation pays 8% a wave, so
// this is reached after five clean waves and never moves again. Exported
// because main.js says the current total on the clear banner and has to agree
// with rebuildMods about where it stops.
export const NO_HIT_CAP = 0.4;
// The floor a Devil Deal may never take the player below. Every price the
// Devil charges is checked against this BEFORE it is taken (canPay), which is
// the whole guarantee that a deal can never kill you: an unaffordable one is
// simply inert. Twenty is a fifth of the starting pool - low enough that
// Executioner's fifty is reachable from full, high enough that a player who
// has sold everything they can is still standing.
export const MIN_MAX_HEALTH = 20;
// Collision height, a little over the 1.7 eye height. Only overhead geometry
// cares - see the resolveCircle call in update().
// How fast the recoil offset bleeds back to zero, as the fraction left after
// one second. RECOIL IS AN OFFSET, NOT A WRITE TO AIM - see applyCamera - and
// this is what makes it one: without a decay the kick simply accumulated into
// the player's pitch and stayed there, so a magazine held down walked the view
// 13.7 degrees up the wall and left it there.
//
// The value is a trade, and it is the one knob worth turning if the climb
// wants to be bigger or smaller. Sustained fire settles at roughly
//   (shots per second * recoil per shot) / ln(1 / RECOIL_DECAY)
// so at 0.33 the pulse rifle peaks around 3 degrees over a full magazine and
// is back on target about a second after the trigger comes up. Lower it for a
// snappier recovery and a smaller climb; raise it for the opposite.
const RECOIL_DECAY = 0.33;

// Two curve helpers the reload animation is built out of. `span` is where `t`
// sits inside a window as a 0..1 fraction, clamped at both ends; `ease` is the
// smoothstep every phase is shaped by.
function span(t, a, b) {
  return Math.min(1, Math.max(0, (t - a) / (b - a)));
}
function ease(x) {
  return x * x * (3 - 2 * x);
}

const PLAYER_HEIGHT = 1.8;
// Evasion's window after a successful dodge, and what it multiplies speed by.
// Short on purpose: it is an escape from the hit you just avoided, not a
// standing movement upgrade.
const DODGE_TIME = 1.5;
const DODGE_SPEED = 1.4;
// Horizontal speed at which Steady Aim's bonus has fully decayed. Well under
// BASE_SPEED: the upgrade pays for standing your ground, not for strolling.
const STILL_SPEED = 3;

// ---- aiming down the sights ------------------------------------------------
//
// ONE NUMBER DRIVES THE WHOLE MECHANIC: `aimT`, 0 at the hip and 1 with the
// gun up. The field of view, the viewmodel's pose, the shot cone in main.js,
// the turn rate on both devices and the crosshair on screen are all read off
// it, so there is no second piece of state to keep in step - a frame is either
// somewhere between the two poses or it is at one of them.
//
// Seconds from one pose to the other. Short enough that raising the gun is not
// a commitment the player has to plan, long enough to read as a movement
// rather than as a cut.
const ADS_TIME = 0.14;
// The zoom, as a fraction of the hip field of view: 0.733 takes the game's 75
// degrees to 55. A real magnification without the fishbowl reversal a deeper
// zoom gives a room this size.
const ADS_FOV_SCALE = 0.733;
// Where the gun goes: centred under the crosshair, pushed slightly FORWARD of
// the hip pose, and low enough that the receiver never climbs over the reticle
// it is there to help the player read.
//
// Forward rather than back, which is the opposite of what "bringing the weapon
// to the eye" sounds like it should mean. Pulling it in makes the model bigger
// on screen, and a featureless block that fills the lower third of a zoomed
// view is not a raised weapon - it is an obstruction. Pushing it out shrinks
// it to a strip under the crosshair, which is what the pose is supposed to
// read as.
// ---- sprinting -------------------------------------------------------------
//
// A second gear, paid for out of a bar that empties in four seconds and takes
// six to come back. The point of it is not the speed - the player already
// moves fast - it is that the speed COSTS something, so crossing an arena to
// break contact is a decision with a price rather than a held key.
//
// SPRINT AND THE GUN ARE EXCLUSIVE, and the GUN is the half that wins: asking
// for the sights ends the run on the same frame, and firing drops the player
// out of it for a moment afterwards. That is the whole design - the run is
// time spent not shooting, which is what makes it a retreat rather than a
// strictly better way to walk - and it costs the player nothing to leave.
// See _updateSprint for why aim takes priority rather than being refused.
const SPRINT_SPEED_MULT = 1.5;
export const MAX_SPEED = BASE_SPEED * SPRINT_SPEED_MULT;
const STAMINA_MAX = 100;
// Four seconds of running from full, six to refill, and a beat before the
// refill starts so that tapping the key does not top the bar up for free.
const STAMINA_DRAIN = 25;
const STAMINA_REGEN = 17;
const STAMINA_DELAY = 0.8;
// EXHAUSTION. Emptying the bar locks the sprint out until a third of it is
// back. Without the lock the optimal way to play is to stutter the key at zero
// and sprint on every frame the regen delivers - which is faster than pacing
// it, and is a habit rather than a decision. The lock is what makes running
// the bar to empty a thing the player chose to do and now has to live with.
const STAMINA_UNLOCK = 0.33;
// How long the sprint's accuracy penalty takes to bleed off after the run
// ends. THE SAME WINDOW a shot locks the sprint out for, and deliberately so:
// firing cancels sprinting, so a penalty that vanished with the run would
// never be the cone a bullet was actually fired through. Shooting out of a
// sprint is inaccurate for a moment, and the crosshair says so on the way
// back down.
const SPRINT_SPREAD_FADE = 0.35;
// And how long it takes to arrive. It used to be instant - the penalty was
// pinned to 1 on the frame the run began and only the way back down was a
// ramp - which made the crosshair the one thing on screen that jumped: every
// other term in the cone is continuous, so the reticle grew smoothly with
// speed right up until the sprint snapped it open.
//
// The crosshair IS the cone (see _shotSpread in main.js), so this cannot be
// fixed in the HUD without the reticle starting to lie about the number the
// next shot is drawn from. The penalty itself ramps instead, which is also the
// more honest version of it: a run costs accuracy as the player gets up to
// speed, not the instant they press the key.
//
// Matched to SPRINT_FOV_TIME on purpose - the lens widening and the cone
// opening are one event, and they should take the same moment to happen.
const SPRINT_SPREAD_RISE = 0.2;
// How long a shot keeps the player out of a sprint. A tap of the trigger has
// to cost more than the one frame it lasts, or a semi-automatic player sprints
// between clicks and the exclusion above means nothing.
const SPRINT_FIRE_LOCK = 0.35;
// The lens widens a little when the player runs. Small - six degrees - because
// it is doing the same job the bar does, from the other end: the bar is the
// number and this is the feeling.
const SPRINT_FOV = 6;
const SPRINT_FOV_TIME = 0.2;

const ADS_GUN_X = 0;
const ADS_GUN_Y = -0.215;
const ADS_GUN_Z = -0.55;

// ---- the gun in motion -----------------------------------------------------
//
// TWO ANIMATIONS, ONE LAYER. Walking bobs the weapon; sprinting swings it down
// across the body and bobs it harder and longer. Both are written as OFFSETS
// on top of whatever pose the aim blend and the reload animation have already
// produced, which is the only arrangement that composes: a reload played while
// walking is the reload plus the walk, and a gun raised mid-stride settles as
// it comes up rather than snapping to centre.
//
// THE PHASE IS DRIVEN BY DISTANCE, NOT BY TIME. `_bobPhase` advances by metres
// travelled, so the stride matches the speed the player is actually moving at
// - through a dash, a slow, a Rage boost or a sprint - instead of running at a
// fixed frequency the legs then disagree with. One STRIDE is one full cycle of
// the horizontal sway and TWO of the vertical dip, which is what makes it read
// as left-right-left rather than as a bounce: a body rises once per FOOT and
// swings once per PAIR of them.
//
// A LONG STRIDE, AND THAT IS THE TUNING KNOB FOR SPEED. The player moves at
// ten metres a second, which is not a human pace, so a stride measured off a
// human one gave a gun cycling nearly five times a second - a vibration, not a
// walk. Seven and a half metres puts a walk at about 1.3 cycles a second and a
// run at 2, which is a stride the eye can follow. If the animation ever wants
// to be faster or slower, this is the one number to move: it is the only thing
// setting the rate, and the amplitudes below do not depend on it.
const BOB_STRIDE = 7.5;
// Amplitudes at a full walk, in camera-space metres and radians. Big enough to
// be an animation rather than a shimmer - the weapon travels about five
// centimetres either side of centre and rolls four degrees into the swing,
// which is what makes the gun read as being CARRIED by someone who is walking.
const BOB_X = 0.05;
const BOB_Y = 0.042;
const BOB_ROLL = 0.07;
const BOB_PITCH = 0.04;
// What the run multiplies all four by. The sprint is a longer, heavier stride
// - the bob is most of what says so, since the speed itself is only half again
// as fast and that is hard to see in an arena this size.
const SPRINT_BOB_MUL = 2;
// How fast the bob's amplitude follows the player's speed, and how long the
// run pose takes to blend in and out. Both are eases rather than switches: the
// gun has to be seen travelling into the sprint carry and back out of it, and
// that travel is as much the animation as the pose at either end.
const BOB_EASE = 5;
const SPRINT_POSE_TIME = 0.28;
// THE SPRINT CARRY, as an offset from the hip pose. The weapon comes in toward
// the chest, drops, and swings across the body with the muzzle turned down and
// away - the pose that says "not ready to fire", which is exactly the state
// the sprint puts the player in. `ry` is positive, which turns the muzzle to
// the LEFT across the torso (camera space looks down -z), and the roll turns
// the receiver's deck outward so the model is not a flat slab edge-on.
const SPRINT_GUN_X = 0.055;
const SPRINT_GUN_Y = -0.075;
const SPRINT_GUN_Z = 0.09;
const SPRINT_GUN_RX = 0.2;
const SPRINT_GUN_RY = 0.6;
const SPRINT_GUN_RZ = -0.45;

export class Player {
  constructor(camera, scene) {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(0, 0, 8);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.baseMaxHealth = 100;
    // One gun for the whole run. The key is still held in a field rather than
    // read from the constant everywhere, so the day a second weapon returns
    // only this and _equipModel() have to change.
    this.weaponKey = STARTING_WEAPON;
    this.mag = WEAPONS[STARTING_WEAPON].magSize;
    // Owned upgrades as id -> stack count, and the stat block derived from
    // them. Both are cleared by reset(), so a run never inherits a build.
    this.upgrades = {};
    this.mods = { ...DEFAULT_MODS };
    this.health = 100;
    this.reserveAmmo = 90;
    this.fireCd = 0;
    // Breach Round: set by a finished reload, spent by the next shot.
    this.breachReady = false;
    // Evasion's speed boost, set by main.js when a hit is dodged.
    this.dodgeEnd = 0;
    // MAX HP SOLD TO THE DEVIL, for the rest of the run. Deliberately NOT a
    // mod: rebuildMods() replays the whole stat block from DEFAULT_MODS on
    // every draft pick, so a debt stored there would be refunded by the next
    // free totem the player walked into. Same reasoning as noHitStacks.
    this.maxHpDebt = 0;
    // Carnage's kill chain, and the two windows Demonic Dodge opens. All on
    // the player rather than in mods, for the reason above.
    this.carnageStacks = 0;
    this.invulnEnd = 0;
    this.rageEnd = 0;
    // Absolute Zero's drawback: the player cannot move until this time.
    this.frozenUntil = 0;
    // Game time, written once per frame by update(). getEffectiveDamage() has
    // no time argument and several callers of it have no clock to pass, so the
    // timed damage windows read it from here.
    this.now = 0;
    // EXTERNAL DRAG, metres per second, written by whatever is pulling the
    // player around - Maw's gravity well. It cannot be an addition to `vel`:
    // update() ASSIGNS vel.x/z outright whenever a movement key is held, so a
    // velocity written from outside would be thrown away on the same frame the
    // player pressed W. It is applied straight to `pos` instead, and consumed
    // every frame, so a puller has to keep asking for it.
    this.extX = 0;
    this.extZ = 0;
    // What the movement keys asked for this frame, before the dash is mixed
    // over it. See the note in update().
    this.moveVX = 0;
    this.moveVZ = 0;
    this.reloading = 0;
    // AIMING. `_aimRaw` is the linear 0..1 timer and `aimT` the eased curve
    // everything else reads - see the ADS block above. `aiming` is what the
    // player is ASKING for, which is not the same thing: the gun is still on
    // its way up on the frame the button goes down.
    this.aiming = false;
    this._aimRaw = 0;
    this.aimT = 0;
    // SPRINTING. `sprinting` is what the player is actually doing, which is
    // not what they asked for: the button is refused while the bar is locked,
    // while the trigger is down, and while they are standing still.
    this.sprinting = false;
    this.stamina = STAMINA_MAX;
    // True from the moment the bar hits zero until it is a third full again.
    this.staminaLocked = false;
    // Counts down before the bar starts refilling, and is reset on every frame
    // of a sprint.
    this._staminaHold = 0;
    // Game time up to which a shot keeps the player walking.
    this.noSprintUntil = -99;
    this._sprintFov = 0;
    // 1 while running and bleeding to 0 over SPRINT_SPREAD_FADE afterwards.
    // main.js multiplies the sprint's cone penalty by it.
    this.sprintFade = 0;
    // The walk/sprint bob. `_bobPhase` is in radians and advances with metres
    // travelled; `_bobAmp` is the eased 0..1 weight the whole animation is
    // scaled by; `_sprintPose` is the eased 0..1 blend into the run carry.
    this._bobPhase = 0;
    this._bobAmp = 0;
    this._sprintPose = 0;
    // What _updateGunMotion() hands the pose block: three positions and three
    // rotations, all offsets from the rest pose.
    this._gunOffX = 0;
    this._gunOffY = 0;
    this._gunOffZ = 0;
    this._gunOffRX = 0;
    this._gunOffRY = 0;
    this._gunOffRZ = 0;
    // The two ends of the zoom. Taken from the camera rather than written as a
    // constant here, so the game keeps ownership of its own field of view and
    // this owns only the fraction it is cut by.
    this.fovHip = camera.fov;
    this.fovAds = camera.fov * ADS_FOV_SCALE;
    this.onGround = false;
    this.lastHurt = -99;
    this.kick = 0;
    // Recoil, as a CAMERA OFFSET in radians, decaying to zero. It is added to
    // the aim in applyCamera rather than written into `pitch`, which is what
    // keeps a burst from permanently re-pointing the player: the shot ray
    // comes off the camera, so a climbing offset still walks sustained fire
    // off target - it just hands the gun back where it was found.
    this.recoilPitch = 0;
    // The player's copy of the screenshake setting, written by main.js. The
    // weapon's recoil kick is the other half of "the camera jolts when I
    // shoot" - the first half is the shake main.js adds through effects - and
    // both have to answer to one dial, or turning shake off still leaves the
    // view punching upward on every round. Held here rather than reached for
    // through effects because the player has no business knowing about the
    // particle system, and NOT cleared by reset(): it is a preference, not run
    // state.
    //
    // It scales AIM, not only the picture: at zero the gun stops climbing
    // altogether. That is what the player asked for when they turned the dial
    // down, and it is the same trade every game offering this setting makes.
    this.shakeScale = 1;
    this.meleeCd = 0;
    this.meleeActive = 0;
    this.damageMult = 1;
    // RAGE. The red pickup's other half: it moves the player as well as their
    // damage, and it rides the SAME clock so the two can never disagree about
    // how long the buff has left. Set by POWERUP_TYPES.damageBoost, cleared
    // beside damageMult below.
    this.rageSpeedMult = 1;
    this.damageBoostEnd = 0;
    this.fireRateMult = 1;
    this.fireRateBoostEnd = 0;
    this.shield = 0;
    this.shieldEnd = 0;
    // STATUS EFFECTS PUT ON THE PLAYER - see status.js for what each one does.
    // Seconds remaining per key, and the duration each was applied WITH, which
    // is the only thing the HUD's timer bar can measure its fraction against.
    // Both are built from the table so a new effect needs no field here.
    this.status = {};
    this.statusFull = {};
    for (const k of PLAYER_STATUS_KEYS) {
      this.status[k] = 0;
      this.statusFull[k] = 1;
    }
    // Damage over time is billed in WHOLE POINTS. Fire at 7/s over a 90Hz
    // frame is 0.078 of a point, and a hit that small rounds to nothing at
    // every sink it could go through - the health bar, the run summary, the
    // damage vignette. It accumulates here instead and main.js drains it (see
    // drainStatusDamage), which is also what puts it through the game-over
    // path: the player class cannot end a run on its own.
    this._statusDot = 0;
    // What the last takeDamage() call actually cost, after curse - see there.
    this.lastDamageTaken = 0;
    this.bloodlustStacks = 0;
    this._ammoRegenAcc = 0;
    // Holy Mantle's charge, re-armed at every wave start, and Dead Cat's
    // revive counter, which is spent once per run and not refilled.
    this.wardReady = false;
    this.livesUsed = 0;
    // No-Hit Bonus: waves cleared without taking a point of damage since the
    // mutation was picked up. It lives on the PLAYER rather than in mods
    // because mods are rebuilt from the upgrade list on every draft pick, and
    // anything written into them by an event would be wiped by the next one.
    this.noHitStacks = 0;
    // Hot Streak's live bonus, a signed damage FRACTION clamped between
    // -streakFloor and +streakCap. On the player for the same reason
    // noHitStacks is: a rebuildMods() would wipe it mid-magazine.
    this.streak = 0;
    // Double Jump / Double Dash state. `jumpsLeft` refills on landing;
    // `dashLeft` refills on a timer. Both are one-shot FX flags read and
    // cleared by main.js, which owns the effects system.
    this.jumpsLeft = 0;
    this.dashLeft = 0;
    this._dashAcc = 0;
    this.dashStart = 0;
    this.dashEnd = 0;
    this.dashDX = 0;
    this.dashDZ = 0;
    this._prevJump = false;
    this.jumpFx = false;
    this.dashFx = false;

    // The viewmodel is built once here and parented to the camera. Building
    // one per equip would allocate geometry for the rest of the session.
    this.gunModels = {};
    const model = WEAPONS[this.weaponKey].build();
    model.userData.baseZ = model.position.z;
    model.userData.baseY = model.position.y;
    // The hip pose's X too, now that there is a second pose to travel to.
    model.userData.baseX = model.position.x;
    camera.add(model);
    this.gunModels[this.weaponKey] = model;
    this._equipModel();
    scene.add(camera);
    this.applyCamera();
  }

  // The definition of the weapon in hand. Every stat read goes through this,
  // so nothing caches a weapon's numbers.
  get weapon() {
    return WEAPONS[this.weaponKey];
  }
  get gun() {
    return this.gunModels[this.weaponKey];
  }

  // Shows the weapon's model and re-caches its muzzle marker.
  _equipModel() {
    const model = this.gun;
    model.visible = true;
    this.muzzle = model.getObjectByName('muzzle');
    this.gunBaseZ = model.userData.baseZ;
    this.gunBaseY = model.userData.baseY;
    this.gunBaseX = model.userData.baseX;
    // The magazine, and where it rests. A weapon without one simply does not
    // animate that half of the reload - see _animateReload.
    this.magPart = model.getObjectByName('mag') || null;
    this.magBaseY = this.magPart ? this.magPart.position.y : 0;
  }

  // Lights one plate on the receiver per owned mutation that changes what a
  // bullet does, in that upgrade's totem colour (the `mark` flag in
  // upgrades.js). Called whenever the owned list changes, never per frame.
  refreshGunMarks() {
    const colors = [];
    for (const id of Object.keys(this.upgrades)) {
      const def = UPGRADES[id];
      if (def && def.mark) colors.push(def.theme);
    }
    setGunMarks(this.gun, colors);
  }

  // Derived stats. These are getters, not fields, because a draft pick can
  // change the underlying mods at any wave boundary - anything that cached
  // them would silently keep the pre-upgrade value for the rest of the run.
  // The Devil's debt comes off AFTER the build's own bonuses, so a deal costs
  // the same twenty points whether or not the player later picks up Overhealth
  // - the price is a flat subtraction, not a share of the pool.
  get maxHealth() {
    const built = Math.round((this.baseMaxHealth + this.mods.maxHpBonus) * this.mods.maxHpMult);
    return Math.max(MIN_MAX_HEALTH, built - this.maxHpDebt);
  }
  get magSize() {
    return Math.max(1, Math.round(this.weapon.magSize * this.mods.magMult));
  }
  get reloadTime() {
    return this.weapon.reloadTime * this.mods.reloadMult;
  }
  get fireRate() {
    return this.weapon.fireRate;
  }
  // Ammo Hoarder. A getter rather than a field so the cap can never go stale
  // against the build: everything else in the game only ever READS maxReserve.
  get maxReserve() {
    return Math.round(BASE_RESERVE * this.mods.reserveMult);
  }

  // Rebuilds the whole stat block from the owned upgrade list. Always a full
  // replay from DEFAULT_MODS rather than an incremental apply - see the note
  // at the top of upgrades.js for why that matters.
  rebuildMods() {
    this.mods = { ...DEFAULT_MODS };
    for (const [id, n] of Object.entries(this.upgrades)) {
      const def = UPGRADES[id];
      if (def && n > 0) def.apply(this.mods, n);
    }
    // No-Hit Bonus is applied AFTER the upgrade replay, because it multiplies
    // whatever the build ended up with rather than being part of it. Additive
    // and clamped at NO_HIT_CAP: it is a bonus the player can finish earning,
    // not an open-ended multiplier on a run that was already going well.
    if (this.mods.noHitBonus > 0 && this.noHitStacks > 0) {
      const k = 1 + Math.min(NO_HIT_CAP, this.mods.noHitBonus * this.noHitStacks);
      this.mods.damage *= k;
      this.mods.fireRate *= k;
    }
    // A fresh Double Dash arrives loaded. rebuildMods only runs on a draft
    // pick, so this cannot top the charges up mid-fight - but a mutation that
    // did nothing for the five seconds after it was taken would read as broken.
    if (this.dashLeft < this.mods.dashCharges) this.dashLeft = this.mods.dashCharges;
  }

  // Hot Streak. Called once per SHOT with whether that shot connected - the
  // same boolean the hitmarker is drawn from, so the bonus can never disagree
  // with what the player just saw. A no-op for a run that has not picked the
  // mutation up, which is why the caller does not have to test for it.
  bumpStreak(hit) {
    const m = this.mods;
    if (m.streakStep <= 0) return;
    const next = this.streak + (hit ? m.streakStep : -m.streakStep);
    this.streak = Math.max(-m.streakFloor, Math.min(m.streakCap, next));
  }

  // Double Dash. `code` is the raw key that was double-tapped.
  //
  // FORWARD ONLY. It used to dash whichever way the tapped key walked, which
  // made a back-tap the safest button in the game: the dash's whole cost is
  // that it commits you to a direction, and committing to AWAY costs nothing.
  // W is the only key that spends a charge now, so the dash is a way into a
  // fight rather than a free disengage. Returns whether a charge was spent.
  tryDash(code, time) {
    if (this.mods.dashCharges <= 0 || this.dashLeft <= 0) return false;
    if (code !== 'KeyW') return false;
    // Straight down the camera's own bearing, which is what W means at the
    // moment it is pressed.
    this.dashDX = -Math.sin(this.yaw);
    this.dashDZ = -Math.cos(this.yaw);
    this.dashStart = time;
    this.dashEnd = time + DASH_TIME;
    this.dashLeft--;
    this.dashFx = true;
    return true;
  }

  // One more flawless wave. Returns the new stack count so the caller can say
  // so on screen; a run that has not picked the mutation up never calls this.
  // Stops counting once the stacks on the board already reach NO_HIT_CAP, so
  // the number on the HUD never climbs past what it is actually paying.
  addNoHitStack() {
    if (this.mods.noHitBonus * this.noHitStacks >= NO_HIT_CAP) return this.noHitStacks;
    this.noHitStacks++;
    this.rebuildMods();
    return this.noHitStacks;
  }

  // Adds one stack of an upgrade. Returns false when it is already maxed, so
  // callers can refuse the pick rather than silently wasting it.
  takeUpgrade(id) {
    const def = UPGRADES[id];
    if (!def) return false;
    const n = (this.upgrades[id] || 0) + 1;
    if (n > def.max) return false;
    this.upgrades[id] = n;
    this.rebuildMods();
    // A max-health change must not leave the player over the new cap or at a
    // stale value; clamp immediately so the HUD never shows 120/100.
    this.health = Math.min(this.health, this.maxHealth);
    // A magazine-shrinking upgrade must not leave the gun holding more rounds
    // than it can now carry.
    this.mag = Math.min(this.mag, this.magSize);
    this.refreshGunMarks();
    return true;
  }

  // Whether a Devil Deal costing `cost` max HP can be bought at all.
  //
  // THIS IS THE ONLY GUARD THERE IS, and everything that spends max HP - a
  // deal, a Devil reroll - asks it first. A deal the player cannot afford is
  // not a deal that kills them: it is greyed out on its pillar and inert to
  // both touch and shot. There is deliberately no path that takes the payment
  // and then checks.
  canPay(cost) {
    return this.maxHealth - cost >= MIN_MAX_HEALTH;
  }

  // Sells `cost` max HP to the Devil, permanently. Returns false and changes
  // nothing when it cannot be afforded.
  payMaxHp(cost) {
    if (!this.canPay(cost)) return false;
    this.maxHpDebt += cost;
    // The same clamp takeUpgrade() does, and for the same reason: the HUD must
    // never show 78/60 after the pool shrinks under the player's current
    // health. Note that this can LOWER current health - selling health you are
    // standing on costs you that health now, not later.
    this.health = Math.min(this.health, this.maxHealth);
    return true;
  }

  // Demonic Dodge. Called by main.js on a successful dodge, alongside
  // startDodge(): a second of invulnerability so the follow-up shot misses
  // too, and three seconds of doubled damage to answer with.
  startDodgeReward(time) {
    if (this.mods.dodgeInvuln > 0) this.invulnEnd = time + this.mods.dodgeInvuln;
    if (this.mods.dodgeRage > 0) this.rageEnd = time + this.mods.dodgeRageTime;
  }

  // Absolute Zero's drawback. The world moves a fifth slower and you stop
  // dead for a second every time something lands.
  freeze(time) {
    if (this.mods.hitFreeze > 0) this.frozenUntil = time + this.mods.hitFreeze;
  }

  // ---- status effects ------------------------------------------------------
  //
  // Everything the arena can do TO the player that lasts. See status.js for
  // the table; the hooks are deliberately spread thin - one multiplier read in
  // the movement branch, one in getEffectiveDamage(), one at the top of
  // takeDamage() and one refusal in tryShoot() - because a status that has to
  // be special-cased at twenty call sites is a status that will be forgotten
  // at the twenty-first.

  /**
   * Puts a status on the player. REFRESHES rather than stacks: the longer of
   * the new duration and what is already running wins, and the effect's
   * strength never changes. Two burning hits leave you burning once.
   *
   * @param {string} kind  a key of PLAYER_STATUS
   * @param {number} [dur] seconds; the table's own duration when omitted
   * @returns {boolean} whether anything was applied
   */
  applyStatus(kind, dur) {
    const def = PLAYER_STATUS[kind];
    if (!def) return false;
    const d = dur > 0 ? dur : def.duration;
    // The full duration is what the HUD's timer bar measures against. While an
    // effect is running it only ever GROWS - a two-second top-up landing on a
    // five-second burn must not snap the bar to full and then drain it five
    // times as fast - but a fresh application starts the bar over from the
    // duration it was actually given, whatever the last one was.
    this.statusFull[kind] =
      this.status[kind] > 0 ? Math.max(this.statusFull[kind], d, this.status[kind]) : d;
    this.status[kind] = Math.max(this.status[kind], d);
    return true;
  }

  hasStatus(kind) {
    return this.status[kind] > 0;
  }

  // 0..1 of the effect's remaining time, for the HUD chip. 0 when it is off.
  statusFraction(kind) {
    const t = this.status[kind];
    return t > 0 ? Math.min(1, t / this.statusFull[kind]) : 0;
  }

  clearStatuses() {
    for (const k of PLAYER_STATUS_KEYS) {
      this.status[k] = 0;
      this.statusFull[k] = 1;
    }
    this._statusDot = 0;
  }

  // Whole points of damage-over-time owed since the last call, taken off the
  // books. main.js bills them through _hurtPlayerDot, which is the only path
  // that can end a run - see the note beside _statusDot.
  drainStatusDamage() {
    if (this._statusDot < 1) return 0;
    const whole = Math.floor(this._statusDot);
    this._statusDot -= whole;
    return whole;
  }

  // One status step: run the timers down and accrue what the two
  // damage-over-time effects owe. Called at the top of update().
  //
  // NOT GATED ON `combat`. A burn does not politely stop at the end of a wave,
  // and the timers are short enough that nothing can be banked in the shop -
  // walking into the break on fire means finishing the burn there.
  _tickStatus(dt) {
    for (const k of PLAYER_STATUS_KEYS) {
      if (this.status[k] <= 0) continue;
      const dps = PLAYER_STATUS[k].dps;
      // Charged for the part of the tick the effect was actually live, so the
      // last frame of a burn does not bill a whole one.
      if (dps) this._statusDot += dps * Math.min(dt, this.status[k]);
      this.status[k] -= dt;
      if (this.status[k] <= 0) {
        this.status[k] = 0;
        this.statusFull[k] = 1;
      }
    }
  }

  // Movement, outgoing damage and incoming damage, in that order. Each walks
  // the whole table rather than naming its effect, so an effect that gains a
  // second multiplier later needs no change here.
  statusSpeedMult() {
    let m = 1;
    for (const k of PLAYER_STATUS_KEYS) {
      const f = PLAYER_STATUS[k].speedMult;
      if (f && this.status[k] > 0) m *= f;
    }
    return m;
  }
  statusDamageMult() {
    let m = 1;
    for (const k of PLAYER_STATUS_KEYS) {
      const f = PLAYER_STATUS[k].damageMult;
      if (f && this.status[k] > 0) m *= f;
    }
    return m;
  }
  statusTakenMult() {
    let m = 1;
    for (const k of PLAYER_STATUS_KEYS) {
      const f = PLAYER_STATUS[k].takenMult;
      if (f && this.status[k] > 0) m *= f;
    }
    return m;
  }

  // Carnage. Every kill is +5% damage and any hit taken is all of it.
  bumpCarnage() {
    if (this.mods.carnageStep > 0) this.carnageStacks++;
  }
  clearCarnage() {
    this.carnageStacks = 0;
  }

  // Evasion. Called by main.js when an incoming hit is dodged; the speed
  // burst is read back in update().
  startDodge(time) {
    this.dodgeEnd = time + DODGE_TIME;
  }

  // Called by main.js on every kill. Only Vampiric Rounds uses it now:
  // Bloodlust rides the combo counter, which main.js owns, and is pushed in
  // through setBloodlustStacks() whenever that counter moves.
  onKill(time) {
    if (this.mods.killHealChance > 0 && Math.random() < this.mods.killHealChance) {
      this.health = Math.min(this.maxHealth, this.health + 1);
    }
    // Blood Pact. A certainty rather than a chance, and worth three times as
    // much as Vampiric's tick - it is paid for in max HP and in taking a
    // quarter more damage from everything, so it has to be felt.
    if (this.mods.killHeal > 0) {
      this.health = Math.min(this.maxHealth, this.health + this.mods.killHeal);
    }
    this.bumpCarnage();
  }

  // Bloodlust. `kills` is the length of the CURRENT combo; the cap is the mod
  // so the upgrade owns its own ceiling.
  setBloodlustStacks(kills) {
    this.bloodlustStacks = Math.min(this.mods.bloodlustMax, kills);
  }

  // Holy Mantle. Called at the start of every wave: the ward is a per-wave
  // charge, so a wave survived without spending it does not bank a second one.
  armWard() {
    this.wardReady = this.mods.wardPerWave > 0;
  }

  // Current fire-rate multiplier from Bloodlust's kill chain. It is paid ON
  // TOP of the flat penalty the upgrade applies to mods.fireRate, so a cold
  // gun with Bloodlust is worse than no Bloodlust at all - that is the deal.
  bloodlustMult() {
    if (this.bloodlustStacks <= 0) return 1;
    return 1 + this.mods.bloodlust * this.bloodlustStacks;
  }

  // Back to a fresh-run state. Called on every new game, so anything added to
  // the constructor that changes during play must be reset here too.
  reset() {
    // Upgrades are cleared first: maxHealth and magSize are derived from
    // mods, so reading them before the wipe would seed the new run with the
    // last one's stats.
    this.upgrades = {};
    // Before rebuildMods, or the wiped run would be rebuilt with the last
    // one's flawless stacks still multiplying it.
    this.noHitStacks = 0;
    this.streak = 0;
    this.jumpsLeft = 0;
    this.dashLeft = 0;
    this._dashAcc = 0;
    this.dashStart = 0;
    this.dashEnd = 0;
    this._prevJump = false;
    this.jumpFx = false;
    this.dashFx = false;
    this.rebuildMods();
    this.weaponKey = STARTING_WEAPON;
    this.mag = WEAPONS[STARTING_WEAPON].magSize;
    this._equipModel();
    this.refreshGunMarks();
    this.bloodlustStacks = 0;
    this._ammoRegenAcc = 0;
    this.wardReady = false;
    this.livesUsed = 0;
    this.breachReady = false;
    this.dodgeEnd = 0;
    // Everything the Devil left behind. maxHpDebt goes before the health
    // assignment further down, or the new run would be born at the old one's
    // sold-down cap.
    this.maxHpDebt = 0;
    this.carnageStacks = 0;
    this.invulnEnd = 0;
    this.rageEnd = 0;
    this.frozenUntil = 0;
    this.extX = 0;
    this.extZ = 0;
    this.pos.set(0, 0, 8);
    this.vel.set(0, 0, 0);
    this.moveVX = 0;
    this.moveVZ = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.recoilPitch = 0;
    // The gun comes down with the run. A new game inheriting a raised weapon
    // would inherit the zoom with it, and nothing would be holding the button.
    this.aiming = false;
    this._aimRaw = 0;
    this.aimT = 0;
    this.sprinting = false;
    this.stamina = STAMINA_MAX;
    this.staminaLocked = false;
    this._staminaHold = 0;
    this.noSprintUntil = -99;
    this._sprintFov = 0;
    this.sprintFade = 0;
    this._bobPhase = 0;
    this._bobAmp = 0;
    this._sprintPose = 0;
    this.camera.fov = this.fovHip;
    this.camera.updateProjectionMatrix();
    this.health = this.maxHealth;
    this.reserveAmmo = 90;
    this.fireCd = 0;
    this.reloading = 0;
    this.onGround = false;
    this.lastHurt = -99;
    this.kick = 0;
    this.meleeCd = 0;
    this.meleeActive = 0;
    this.damageMult = 1;
    this.rageSpeedMult = 1;
    this.damageBoostEnd = 0;
    this.fireRateMult = 1;
    this.fireRateBoostEnd = 0;
    this.shield = 0;
    this.shieldEnd = 0;
    this.clearStatuses();
  }

  // Eye position (feet + 1.7) written into `v`. Takes an out-param so the hot
  // path can reuse a scratch vector instead of allocating.
  eyeInto(v) {
    v.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
    return v;
  }

  // World position of the gun's muzzle, written into `v`.
  muzzleInto(v) {
    return this.muzzle.getWorldPosition(v);
  }

  // Flat facing direction, written into `v`. Y is dropped: melee and anything
  // else that sweeps the ground should reach just as far when the player is
  // looking at their feet as when they are looking straight ahead.
  forwardInto(v) {
    return v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  // `time` is game time (see main.js) - used for buff expiry and regen delay,
  // not for physics. All physics uses `dt`.
  //
  // `combat` is true only while a wave is actually running. EVERYTHING THAT
  // REFILLS ON A CLOCK IS GATED ON IT - health regeneration and Ammo
  // Fabricator both. The wave break has no timer on it, so anything that pays
  // per second paid infinitely there: standing in the shop until the bar came
  // back was strictly better than playing, and it was the most boring correct
  // move in the game. Regeneration is a reason to break contact mid-fight, not
  // a vending machine. Dash charges are deliberately NOT gated: they are a
  // resource for the wave ahead, and starting one dashless because the last
  // one ended mid-cooldown punishes nothing the player did.
  update(dt, input, obstacles, time, combat = true) {
    // Published for getEffectiveDamage(), which has no clock of its own and is
    // called from several places that have none to give it.
    this.now = time;
    this._tickStatus(dt);
    this.fireCd -= dt;
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (this.meleeActive > 0) this.meleeActive -= dt;

    if (this.damageBoostEnd > 0 && time >= this.damageBoostEnd) {
      this.damageMult = 1;
      this.rageSpeedMult = 1;
      this.damageBoostEnd = 0;
    }
    if (this.fireRateBoostEnd > 0 && time >= this.fireRateBoostEnd) {
      this.fireRateMult = 1;
      this.fireRateBoostEnd = 0;
    }
    if (this.shieldEnd > 0 && time >= this.shieldEnd) {
      this.shield = 0;
      this.shieldEnd = 0;
    }

    // Ammo Fabricator. Accumulated as a float and spent in whole rounds, so a
    // sub-1-round-per-second rate still pays out instead of truncating to
    // nothing every frame.
    // Double Dash recharges one charge per DASH_RECHARGE seconds, up to the
    // mutation's cap. The accumulator is not reset when full: a player sitting
    // on full charges should get the next one the instant they spend one.
    if (this.mods.dashCharges > 0) {
      if (this.dashLeft < this.mods.dashCharges) {
        this._dashAcc += dt;
        while (this._dashAcc >= DASH_RECHARGE && this.dashLeft < this.mods.dashCharges) {
          this._dashAcc -= DASH_RECHARGE;
          this.dashLeft++;
        }
      } else {
        this._dashAcc = 0;
      }
    }

    if (combat && this.mods.ammoRegen > 0 && this.reserveAmmo < this.maxReserve) {
      this._ammoRegenAcc += this.mods.ammoRegen * dt;
      if (this._ammoRegenAcc >= 1) {
        const whole = Math.floor(this._ammoRegenAcc);
        this._ammoRegenAcc -= whole;
        this.reserveAmmo = Math.min(this.maxReserve, this.reserveAmmo + whole);
      }
    }

    // Returned to the caller so main.js can fire Reload Burst on exactly the
    // frame the magazine seats, without polling `reloading` from outside.
    let reloadFinished = false;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const needed = this.magSize - this.mag;
        const take = Math.min(needed, this.reserveAmmo);
        this.mag += take;
        this.reserveAmmo -= take;
        reloadFinished = true;
        this.breachReady = true;
      }
    }

    // Movement: build a normalised local direction, rotate it by yaw, and set
    // horizontal velocity outright. There is no acceleration - releasing the
    // keys just damps the velocity toward zero.
    // Absolute Zero's drawback. The keys are read as if nothing were held, so
    // the existing damp branch below brings the player to a stop rather than
    // freezing them on the spot - a hard velocity zero on one frame is exactly
    // what the eye reads as hitting a wall, and this is meant to read as being
    // caught, not as a collision. Gravity, the dash already in flight and the
    // gun all keep working; only walking stops.
    //
    // ANALOGUE OR DIGITAL. A pad writes `moveF`/`moveS` as a deflection in
    // [-1, 1] and a keyboard leaves them null, in which case the keys stand in
    // as a hard +-1. Everything below is the same arithmetic for both: a stick
    // pushed to the corner produces exactly the numbers W+D does, so no walking
    // speed, no acceleration curve and no dash blend has to know which device
    // is driving it.
    const frozen = time < this.frozenUntil;
    const f = frozen ? 0
      : (input.moveF != null ? input.moveF : (input.forward ? 1 : 0) - (input.back ? 1 : 0));
    const s = frozen ? 0
      : (input.moveS != null ? input.moveS : (input.right ? 1 : 0) - (input.left ? 1 : 0));
    // Kept SEPARATE from this.vel, and that separation is what makes the dash
    // blend below honest. The damp branch feeds on the previous frame's value,
    // so if the dash wrote into this.vel the decaying half of its own envelope
    // would be fed back in as "the player's movement" on the next frame and
    // integrate into a coast three times as long as the dash. moveVX/moveVZ
    // are only ever what the KEYS asked for.
    this._updateSprint(dt, input, f, s);
    if (f || s) {
      const len = Math.hypot(f, s);
      // The direction is normalised and the SPEED is the stick's deflection,
      // capped at one. For the keyboard that cap is always what is hit - a
      // diagonal is 1.414 long before it is clamped, which is the same
      // no-faster-on-the-diagonal rule this line has always enforced - and for
      // a stick it is what makes a half-pushed one a walk.
      const mag = Math.min(1, len);
      const fn = (f / len) * mag;
      const sn = (s / len) * mag;
      // Evasion's reward for a dodge: a burst of speed to leave with. Rage
      // stacks multiplicatively with it, because both are short windows the
      // player earned and neither should quietly swallow the other.
      const speed = BASE_SPEED * this.mods.moveMult * this.rageSpeedMult
        * this.statusSpeedMult()
        * (time < this.dodgeEnd ? DODGE_SPEED : 1)
        // The second gear. A multiplier on the whole stack rather than an
        // addition to BASE_SPEED, so a slowed player who sprints is still
        // slowed and a Rage sprint is still faster than a Rage walk.
        * (this.sprinting ? SPRINT_SPEED_MULT : 1);
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      this.moveVX = (-sinY * fn + cosY * sn) * speed;
      this.moveVZ = (-cosY * fn - sinY * sn) * speed;
    } else {
      const damp = Math.pow(0.0001, dt);
      this.moveVX *= damp;
      this.moveVZ *= damp;
    }
    this.vel.x = this.moveVX;
    this.vel.z = this.moveVZ;

    // A dash BLENDS OVER the movement block rather than adding to it, and sits
    // after it for the same reason update() assigns vel.x/z in the first place:
    // anything written before the key test would be thrown away on any frame a
    // direction is held. Position is still integrated and resolved below, so a
    // dash cannot phase through a wall.
    //
    // The blend weight IS the envelope, which is what makes the hand-back
    // seamless: at the peak the dash owns the velocity outright, and as the
    // curve falls the player's own held direction fades back in underneath it
    // until, at the last frame, the two are the same number. Nothing is ever
    // switched off - there is no frame where the velocity jumps.
    if (time < this.dashEnd) {
      const k = dashShape((time - this.dashStart) / DASH_TIME);
      this.vel.x = this.moveVX * (1 - k) + this.dashDX * DASH_SPEED * k;
      this.vel.z = this.moveVZ * (1 - k) + this.dashDZ * DASH_SPEED * k;
    }

    this.vel.y -= 22 * dt;
    // Ground jump keeps its held-key behaviour - bunny-hopping down a corridor
    // is movement the game already had. The AIR jump is edge-triggered, or a
    // held space would spend every charge on the frame after takeoff.
    const jumpEdge = input.jump && !this._prevJump;
    this._prevJump = input.jump;
    if (input.jump && this.onGround) {
      this.vel.y = JUMP_V;
      this.onGround = false;
    } else if (jumpEdge && this.jumpsLeft > 0) {
      this.jumpsLeft--;
      this.vel.y = AIR_JUMP_V;
      this.jumpFx = true;
    }

    // Vertical resolution. Landing on a box only counts when falling onto its
    // top face from above (prevY above the top, new Y at or below it), which
    // is what makes platforms and crates jumpable but not climbable from the
    // side.
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.onGround = false;
    if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.vel.y = 0;
      this.onGround = true;
      this.jumpsLeft = this.mods.extraJumps;
    } else {
      for (const b of obstacles) {
        const top = b.max.y;
        if (
          this.pos.x > b.min.x - 0.2 && this.pos.x < b.max.x + 0.2 &&
          this.pos.z > b.min.z - 0.2 && this.pos.z < b.max.z + 0.2 &&
          prevY >= top - 0.02 && this.pos.y <= top
        ) {
          this.pos.y = top;
          this.vel.y = 0;
          this.onGround = true;
          this.jumpsLeft = this.mods.extraJumps;
          break;
        }
      }
    }
    // Applied here, before collision, so a pull cannot drag the player through
    // a wall or a crate.
    this.pos.x += this.extX * dt;
    this.pos.z += this.extZ * dt;
    this.extX = 0;
    this.extZ = 0;
    // The player's OWN height, not the default for a ground agent. This is
    // load-bearing: the default is 2.5, and the player is the only mover that
    // travels in Y, so an over-tall figure here made overhead geometry collide
    // at the top of an ordinary jump. Under a catwalk whose underside is 4.05,
    // 2.5 put the collision threshold at pos.y > 1.55 - below the 1.84 jump
    // apex - so jumping on the spot flung the player a metre sideways into the
    // wall with no input at all.
    resolveCircle(this.pos, 0.4, obstacles, PLAYER_HEIGHT);
    // Arena walls sit at +-22; clamp inside them by the player radius.
    const B = 21.6;
    this.pos.x = Math.max(-B, Math.min(B, this.pos.x));
    this.pos.z = Math.max(-B, Math.min(B, this.pos.z));

    // Regeneration, once a mutation has granted any (regenRate is 0 by
    // default - see the mods block). Combat only: see the note on update().
    // The second branch bleeds off overheal (health above max, from a health
    // pickup) back down to max, and is NOT gated - overheal draining away is a
    // cost, and a cost that pauses in the shop would let the player bank it.
    if (combat && this.mods.regenRate > 0
      && time - this.lastHurt > this.mods.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.mods.regenRate * dt);
    } else if (this.health > this.maxHealth) {
      this.health = Math.max(this.maxHealth, this.health - 5 * dt);
    }

    this.recoilPitch *= Math.pow(RECOIL_DECAY, dt);
    this.kick *= Math.pow(0.0001, dt);
    // THE GUN'S POSE, as a straight blend between the two. The recoil kick is
    // added on top of whichever pose the blend landed on rather than folded
    // into it, so a shot fired halfway through a raise still kicks by exactly
    // as much as one fired at either end.
    this._updateAim(dt, input);
    const a = this.aimT;
    // The walk and the run, as offsets on the rest pose. Computed BEFORE the
    // reload animation and folded into the positions it is handed, so the two
    // are one movement rather than two things fighting over the same model.
    this._updateGunMotion(dt);
    const restX = this.gunBaseX + (ADS_GUN_X - this.gunBaseX) * a + this._gunOffX;
    const restY = this.gunBaseY + (ADS_GUN_Y - this.gunBaseY) * a + this._gunOffY;
    this.gun.position.z =
      this.gunBaseZ + (ADS_GUN_Z - this.gunBaseZ) * a + this.kick + this._gunOffZ;
    this._animateReload(restX, restY);
    // Rotations go on AFTER, and as an add: _animateReload writes x and z
    // absolutely (it has to - it clears them on the idle frame), so the bob
    // has to be laid over the result. y is untouched by the reload and is the
    // one axis written outright here.
    this.gun.rotation.x += this._gunOffRX;
    this.gun.rotation.z += this._gunOffRZ;
    this.gun.rotation.y = this._gunOffRY;
    this.applyCamera();
    return reloadFinished;
  }

  /**
   * THE WALK BOB AND THE SPRINT CARRY. Writes six offsets - three positions,
   * three rotations - and nothing else; the caller decides where they land.
   *
   * WHY IT IS SPEED-DRIVEN AND NOT INPUT-DRIVEN: the amplitude comes off the
   * velocity the player actually has, so it covers every way the game moves
   * them. A dash, a slow, Rage's boost and a knockback all bob the gun; being
   * held still by a hex does not, however hard the keys are being held. There
   * is exactly one rule - the gun moves when the player moves - and no list of
   * states to keep in step with the movement code.
   *
   * IN THE AIR IT STOPS. Feet off the ground is the one case where speed is
   * not a stride, and a weapon that kept walking through a jump is the tell
   * that the whole thing was a sine wave all along.
   */
  _updateGunMotion(dt) {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    // 0..1 against the ordinary top walking speed, so a sprint sits above 1 -
    // deliberately, since a run should bob harder than a walk before the
    // multiplier below is even applied.
    const want = this.onGround ? Math.min(1.35, speed / BASE_SPEED) : 0;
    const k = Math.min(1, dt * BOB_EASE);
    this._bobAmp += (want - this._bobAmp) * k;
    // The sprint carry rides its own blend rather than `sprinting` directly,
    // so the gun is seen swinging down into it and back up out of it.
    const poseK = Math.min(1, dt / SPRINT_POSE_TIME);
    this._sprintPose += ((this.sprinting ? 1 : 0) - this._sprintPose) * poseK;
    const pose = this._sprintPose * this._sprintPose * (3 - 2 * this._sprintPose);
    // THE RAISE OVERRIDES THE CARRY. Both blends are running at once when the
    // player sights something mid-run, and they have different clocks: the gun
    // comes up in ADS_TIME and the run pose drains over the longer
    // SPRINT_POSE_TIME. Left alone, that meant the weapon reached the aim pose
    // while still carrying most of the sprint's offset and then crept in from
    // the side afterwards - the gun arriving in two separate movements when
    // the player asked for one.
    //
    // Scaling the carry by the raise makes the aim blend the only clock that
    // matters once the button is down: the offset is fully gone by the time
    // aimT reaches 1, so the walk-to-aim and run-to-aim transitions are the
    // same movement and land in the same place. Coming OUT of the sights the
    // carry is free to blend at its own pace again.
    const carry = pose * (1 - this.aimT);

    // Metres travelled, turned into stride phase. Only accumulated while the
    // player is on the ground and actually moving, so a jump does not silently
    // advance the cycle and the gun picks the stride back up where it left it.
    if (this.onGround) this._bobPhase += (speed / BOB_STRIDE) * Math.PI * 2 * dt;
    if (this._bobPhase > Math.PI * 2) this._bobPhase -= Math.PI * 2;
    const ph = this._bobPhase;

    // THE SIGHTS STOP IT DEAD, and the same number that raises the gun is what
    // takes the bob away - so the animation fades out over the raise rather
    // than being switched off at one end of it. Aiming is the one thing in the
    // game that asks for a still picture: the crosshair is a promise about
    // where the round goes, and a viewmodel swinging under it is exactly the
    // motion the player pressed the button to get rid of.
    const amp = this._bobAmp
      * (1 - this.aimT)
      * (1 + (SPRINT_BOB_MUL - 1) * carry);
    const sw = Math.sin(ph);
    // Twice the rate, because a body rises once per foot and sways once per
    // pair - and lifted so the dip only ever goes DOWN from the rest pose
    // rather than floating the gun above it.
    const dip = (Math.cos(ph * 2) - 1) * 0.5;

    this._gunOffX = sw * BOB_X * amp + SPRINT_GUN_X * carry;
    this._gunOffY = dip * BOB_Y * amp + SPRINT_GUN_Y * carry;
    this._gunOffZ = SPRINT_GUN_Z * carry;
    this._gunOffRX = dip * BOB_PITCH * amp + SPRINT_GUN_RX * carry;
    this._gunOffRY = SPRINT_GUN_RY * carry;
    // Rolls INTO the sway - the weapon leans the way it is travelling, which
    // is what turns two straight-line offsets into an arc.
    this._gunOffRZ = -sw * BOB_ROLL * amp + SPRINT_GUN_RZ * carry;
  }

  /**
   * Sprinting, and the bar that pays for it.
   *
   * FIVE THINGS REFUSE THE BUTTON, and they are all conditions on the player
   * rather than on the key: an empty or locked bar, a trigger that is down or
   * was down a moment ago, THE SIGHTS BEING ASKED FOR, no movement input at
   * all, and being frozen in place. Sprinting is therefore never something the
   * player has to stop doing - it stops itself the instant any of those
   * becomes true, which is what lets the button be held down through a whole
   * fight without ever being wrong.
   *
   * AIM BEATS SPRINT. It used to be the other way round: a player holding both
   * ran, and the gun stayed down. The reason that was wrong is what the two
   * buttons MEAN - sprint is a key held for seconds at a time while crossing a
   * room, aim is pressed at the moment something needs shooting. Making the
   * held key win meant the deliberate press did nothing, and the player had to
   * let go of a key they were not thinking about before the game would answer
   * the one they were. So the run yields, on the frame the button goes down.
   *
   * There is deliberately NO lockout on this one, unlike the trigger's: let go
   * of aim and, if the sprint key is still held, the run resumes immediately.
   * Sighting something and deciding against it should cost the player the time
   * they spent looking at it and nothing more.
   *
   * `f` and `s` are the movement axes already resolved by update(), so a
   * sprint follows the stick or the keys in whatever direction they point.
   * Forward-only would be the conventional rule and it is the wrong one here:
   * this is a game about backing away from a crowd, and a run that only works
   * toward it would be a run nobody uses.
   */
  _updateSprint(dt, input, f, s) {
    const moving = (f !== 0 || s !== 0);
    const wants = !!input.sprint && moving;
    this.sprinting = wants
      && !this.staminaLocked
      && this.stamina > 0
      && !input.shoot
      && !input.aim
      && this.now >= this.noSprintUntil;

    // The accuracy penalty, and its tail. It ramps up over the run's first
    // fifth of a second and bleeds off over a third of one afterwards, so the
    // cone the gun fires through arrives with the run and then remembers it
    // for a moment - see the notes on SPRINT_SPREAD_RISE and _FADE.
    this.sprintFade = this.sprinting
      ? Math.min(1, this.sprintFade + dt / SPRINT_SPREAD_RISE)
      : Math.max(0, this.sprintFade - dt / SPRINT_SPREAD_FADE);

    if (this.sprinting) {
      this.stamina -= STAMINA_DRAIN * dt;
      this._staminaHold = STAMINA_DELAY;
      if (this.stamina <= 0) {
        this.stamina = 0;
        // Run it dry and it is gone until a third of it is back - see the note
        // on STAMINA_UNLOCK. Set here rather than tested at the top, so the
        // lock survives the player letting go of the key.
        this.staminaLocked = true;
        this.sprinting = false;
      }
      return;
    }
    if (this._staminaHold > 0) {
      this._staminaHold -= dt;
      return;
    }
    this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * dt);
    if (this.staminaLocked && this.stamina >= STAMINA_MAX * STAMINA_UNLOCK) {
      this.staminaLocked = false;
    }
  }

  /** The bar, 0..1, for the HUD. */
  get staminaFrac() {
    return this.stamina / STAMINA_MAX;
  }

  /**
   * True below the amount that would let the player start running again.
   *
   * THE SAME LINE THE LOCKOUT USES, which is what makes the bar's red mean
   * something exact - "there is not enough here to run on" - rather than being
   * a rough warning at a round number. A locked bar is always below it, so the
   * lockout is always red as well as beating.
   */
  get staminaLow() {
    return this.stamina < STAMINA_MAX * STAMINA_UNLOCK;
  }

  /**
   * The aim blend, and the zoom that rides on it.
   *
   * RELOADING TAKES THE GUN OUT OF THE AIM. The reload animation drops the
   * weapon out of frame and rolls it over; a raise fighting that over the same
   * model reads as a stutter, and a magazine changed at eye level would look
   * like the gun was never lowered at all. The button is still being held, so
   * it comes straight back up as the last round seats - nothing has to be
   * re-pressed.
   */
  _updateAim(dt, input) {
    // `!this.sprinting` is belt and braces rather than the rule: _updateSprint
    // already refuses the run outright while aim is held, and it runs earlier
    // in the same frame - so a player who presses aim mid-sprint is out of the
    // sprint and raising the weapon on that frame, with nothing to wait for.
    // The test survives because the run can still end for its own reasons
    // (an empty bar) on a frame the button is not down.
    this.aiming = !!input.aim && this.reloading <= 0 && !this.sprinting;
    const dir = this.aiming ? 1 : -1;
    this._aimRaw = Math.max(0, Math.min(1, this._aimRaw + (dir * dt) / ADS_TIME));
    // Smoothstep. A linear raise arrives at full speed and stops dead, which
    // is the difference between a weapon being lifted and a value changing.
    const t = this._aimRaw;
    this.aimT = t * t * (3 - 2 * t);
    // The run widens the lens and the sights narrow it, on one number, from
    // the same pair of blends - they are exclusive, so the sprint's widening
    // is always on its way out by the time the gun is up.
    const rate = (SPRINT_FOV / SPRINT_FOV_TIME) * dt;
    const want = this.sprinting ? SPRINT_FOV : 0;
    this._sprintFov += Math.max(-rate, Math.min(rate, want - this._sprintFov));
    const hip = this.fovHip + this._sprintFov;
    const fov = hip + (this.fovAds - hip) * this.aimT;
    // Compared before writing: updateProjectionMatrix is not free, and this
    // runs on every frame of a game that spends most of them at one end of the
    // blend or the other.
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  // Reload animation. The gun drops out of frame, rolls over as if a magazine
  // were being pulled, and comes back up - a full arc over the reload, driven
  // off the same timer the reload itself uses so it always matches the real
  // duration however much Speed Loader has cut it. Written every frame while
  // idle too, so the transforms are cleared the instant a reload is cancelled
  // by a weapon swap.
  //
  // `restY` is the height the gun rests at this frame - the hip pose, the aim
  // pose, or anywhere between them. Passed in rather than read off gunBaseY,
  // because there are two poses to come back to now.
  //
  // FOUR PHASES ON ONE CLOCK. It used to be a single sine hump - the gun
  // dipped, rolled and came back - and the thing wrong with that was not its
  // size but its content: nothing was ever removed and nothing replaced it, so
  // it read as a weapon swaying rather than as a magazine being changed. The
  // phases are:
  //
  //   0.00-0.22  the gun comes UP and rolls the magazine well into view
  //   0.20-0.42  the spent magazine drops away out of frame
  //   0.50-0.75  a fresh one rises into the well
  //   0.75-1.00  it seats with a knock and the weapon settles back
  //
  // UP, not down, and that is the whole reason the old animation could never
  // have shown a magazine: the gun rides low and to the right, so a reload
  // that dipped it took the well straight off the bottom of the screen. The
  // part being swapped has to be ON SCREEN while it is swapped, which is also
  // what a person actually does with a rifle - it comes to you.
  //
  // All four phases are FRACTIONS OF THE REAL RELOAD, so a Speed Loader build
  // plays the same animation faster rather than a different one - the same
  // reason this reads `reloadTime` rather than a constant of its own.
  _animateReload(restX, restY) {
    const g = this.gun;
    const mag = this.magPart;
    const total = this.reloadTime;
    if (this.reloading <= 0 || total <= 0) {
      g.position.x = restX;
      g.position.y = restY;
      g.rotation.x = 0;
      g.rotation.z = 0;
      if (mag) {
        mag.position.y = this.magBaseY;
        mag.rotation.x = 0;
      }
      return;
    }
    const t = Math.min(1, Math.max(0, 1 - this.reloading / total));
    // The carriage: up over the first fifth, held through the swap, back over
    // the last quarter. Smoothstepped at both ends so the weapon is never seen
    // starting or stopping at speed.
    const carry = ease(span(t, 0, 0.22)) - ease(span(t, 0.72, 1));
    // The knock as the fresh magazine bottoms out. A short spike rather than a
    // curve - it is an impact, and the one moment in the reload the player can
    // feel through the screen.
    const seat = Math.max(0, 1 - Math.abs(t - 0.78) / 0.09);
    // Inward as well as up: the weapon is brought in front of the face to be
    // worked on, and the roll turns the magazine well toward the camera so the
    // part that is about to leave is the part being looked at.
    g.position.x = restX - 0.1 * carry;
    g.position.y = restY + 0.1 * carry - 0.035 * seat;
    g.rotation.x = 0.3 * carry + 0.06 * seat;
    g.rotation.z = -0.5 * carry;
    if (!mag) return;
    // The magazine's own travel, as ONE number: how far out of the well it is,
    // 0 seated and 1 gone. It falls away on the first half and the new one
    // rises on the second, which is why the same mesh can play both - there is
    // never a frame where two of them would have to be visible at once.
    const out = t < 0.5
      ? ease(span(t, 0.2, 0.42))
      : 1 - ease(span(t, 0.5, 0.75));
    mag.position.y = this.magBaseY - 0.34 * out;
    // The spent one tumbles as it goes; the fresh one comes up square, because
    // it is being pushed by a hand rather than dropped by gravity.
    mag.rotation.x = t < 0.5 ? 1.1 * out : 0;
  }

  // 0 while idle, otherwise how far through the current reload we are. Drives
  // the ring around the crosshair.
  get reloadProgress() {
    const total = this.reloadTime;
    if (this.reloading <= 0 || total <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - this.reloading / total));
  }

  applyCamera() {
    // Clamped on the SUM, not on pitch alone: the mouse handler already holds
    // pitch inside +-1.5, and letting the recoil offset push past that would
    // roll the view over the top at the exact moment the player is looking up.
    const aim = Math.max(-1.5, Math.min(1.5, this.pitch + this.recoilPitch));
    this.camera.rotation.set(aim, this.yaw, 0);
    this.camera.position.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
  }

  // Returns false when a reload is pointless (already reloading, mag full, or
  // no reserve), so callers can skip the sound.
  startReload() {
    if (this.reloading > 0 || this.mag === this.magSize || this.reserveAmmo <= 0) return false;
    this.reloading = this.reloadTime;
    return true;
  }

  // WHAT ONE TRIGGER PULL COSTS, in rounds.
  //
  // Both multipliers, because both are literally more bullets leaving the gun:
  // Triple Tap puts three rounds into one shot, and Twenty/Twenty fires the
  // whole pellet pattern a second time. Twenty/Twenty used to bill one round
  // for two volleys, which made it the only damage mutation in the pool that
  // was free - +20% damage AND double the rounds on target for nothing. The
  // drawback on the card was never meant to be "none": a shot that fires twice
  // pays twice, and a build that wants both pays six.
  get shotCost() {
    return this.mods.ammoPerShot * this.mods.volley;
  }

  // Returns 'shot' on a real shot, 'empty' when the trigger is pulled dry, or
  // null while on cooldown or reloading. Only 'shot' consumes a round.
  // Note 'empty' sets no cooldown, so main.js rate-limits the dry-fire sound.
  //
  // `triggerFresh` is true only on the frame the button went down. Semi-auto
  // weapons refuse without it, so holding the button on a scattergun fires
  // once rather than emptying the tube.
  tryShoot(triggerFresh) {
    const w = this.weapon;
    if (this.reloading > 0 || this.fireCd > 0) return null;
    // FEAR. The trigger, and only the trigger: reload, melee, dash and jump
    // all still work, so the window is one to move in rather than one to
    // watch. Reported rather than swallowed, so main.js can click at the
    // player - a trigger pull that does nothing at all and says nothing at all
    // reads as a broken gun.
    if (this.status.fear > 0) return 'feared';
    if (!w.auto && !triggerFresh) return null;
    if (this.mag <= 0) {
      this.startReload();
      return 'empty';
    }
    // Belt Feed takes the round straight off the reserve now and then, which
    // is worth more than the round itself: it is a reload you never have to
    // stand through. The trigger's full cost comes out of whichever pool pays.
    const cost = this.shotCost;
    if (this.mods.beltFeed > 0 && this.reserveAmmo >= cost
      && Math.random() < this.mods.beltFeed) {
      this.reserveAmmo -= cost;
    } else {
      // A shot that cannot afford its full cost still fires and empties the
      // magazine; refusing it would jam the gun on one leftover round.
      this.mag = Math.max(0, this.mag - cost);
    }
    const effectiveFireRate =
      w.fireRate * this.fireRateMult * this.mods.fireRate * this.bloodlustMult();
    this.fireCd = 1 / effectiveFireRate;
    this.kick = w.kick;
    // A round fired is a commitment to being somewhere: it walks the player
    // out of a sprint and keeps them out of it long enough that tapping a
    // semi-automatic trigger cannot be done at a run.
    this.noSprintUntil = this.now + SPRINT_FIRE_LOCK;
    this.recoilPitch += (w.recoil + Math.random() * w.recoil * 0.6) * this.shakeScale;
    if (this.mag === 0) this.startReload();
    return 'shot';
  }

  tryMelee() {
    if (this.meleeCd > 0) return false;
    this.meleeCd = 0.6;
    this.meleeActive = 0.15;
    this.kick = 0.12;
    return true;
  }

  // Shield soaks damage first and fully - a hit that breaks the shield does
  // not carry the remainder through to health. Returns remaining health.
  takeDamage(d, time) {
    // CURSE, applied before the shield rather than after it: the effect says
    // every source hurts 25% more, and a shield point is as much a thing the
    // player has to spend as a health point is.
    //
    // Published as `lastDamageTaken` because this is the LAST place the number
    // changes: main.js bills the run summary and the wave's damage total off
    // what actually landed, and reading its own pre-curse figure would leave
    // the summary quietly understating every cursed hit of the run.
    d *= this.statusTakenMult();
    this.lastDamageTaken = d;
    if (this.shield > 0) {
      this.shield = Math.max(0, this.shield - d);
      if (this.shield <= 0) {
        this.shieldEnd = 0;
      }
      this.lastHurt = time;
      return this.health;
    }
    this.health = Math.max(0, this.health - d);
    this.lastHurt = time;
    return this.health;
  }

  // All outgoing damage goes through here. Steady Aim reads live horizontal
  // speed, so the bonus fades in as the player settles and drops the moment
  // they move - it is not a key check, and there is no key to check.
  getEffectiveDamage(base) {
    let d = base * this.damageMult * this.mods.damage * this.statusDamageMult();
    if (this.mods.steady > 0) {
      d *= 1 + this.mods.steady * this.stillness;
    }
    // Berserker pays on health MISSING, so it is worth nothing at full health
    // and everything at one. Read live rather than cached: it has to move with
    // the health bar, including upward as Vampiric heals you back out of it.
    // Hot Streak's live bonus. Signed: a player who has been missing is dealing
    // LESS than base here, which is the whole trade the mutation offers.
    if (this.streak !== 0) d *= 1 + this.streak;
    if (this.mods.berserk > 0) {
      d *= 1 + this.mods.berserk * (1 - this.health / this.maxHealth);
    }
    // Carnage. Uncapped on purpose - it is the one number in the game that can
    // run away, and the thing that stops it is a single point of damage from
    // anywhere. A player holding thirty stacks is playing a different game to
    // the one they were playing at zero, and they know exactly what it costs.
    if (this.carnageStacks > 0) {
      d *= 1 + Math.min(this.mods.carnageMax, this.mods.carnageStep * this.carnageStacks);
    }
    // Demonic Dodge's window, read off the frame clock published in update().
    if (this.rageEnd > this.now) d *= 1 + this.mods.dodgeRage;
    return d;
  }

  // 1 while planted, falling to 0 by STILL_SPEED. Movement damps rather than
  // stopping dead, so a hard threshold would flicker the bonus on and off for
  // a fraction of a second after every stop; the ramp settles instead.
  get stillness() {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    return Math.max(0, 1 - speed / STILL_SPEED);
  }

  // Horizontal speed, for the shot-spread penalty in main.js.
  get speedXZ() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
}