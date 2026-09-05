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
import { resolveCircle, stepSurface, STEP_HEIGHT } from './utils.js';
import { UPGRADES } from './upgrades.js';
import { WEAPONS, STARTING_WEAPON, setGunMarks, setGunTag } from './weapons.js';
import { PLAYER_STATUS, PLAYER_STATUS_KEYS } from './status.js';
import { ACTIVE_ITEMS } from './items.js';

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
  // passive item raises it.
  regenRate: 0,         // health per second regenerating (passive items only)
  killHealChance: 0,    // Vampiric Rounds: chance a kill heals 1 HP
  ammoRegen: 0,         // reserve rounds per second
  ammoRefund: 0,        // Brass Echo: chance a shot that HIT is paid back
  recoilMult: 1,        // Hair Trigger: multiplier on the weapon's pitch kick
  // THE TWO ACCURACY MODS, both read by Game._shotSpread and by nothing else.
  // `bloomMult` scales the cone sustained fire opens up (see BLOOM_SPREAD);
  // `spreadAdd` is a flat NDC penalty on every cone the gun ever fires
  // through, so a build carrying it is visibly less accurate before the first
  // round rather than only after the eighth.
  bloomMult: 1,         // Hair Trigger: multiplier on the sustained-fire cone
  spreadAdd: 0,         // Hair Trigger: flat NDC added to every shot cone
  staminaDrain: 1,      // Second Wind: multiplier on sprint and slide drain
  staminaRegen: 1,      // Second Wind: multiplier on the refill rate
  // The two per-wave max-HP passive items. Both bank into `hpBanked` on the
  // player rather than into a mod, for the same reason noHitStacks does: mods
  // are replayed from scratch on every draft pick, so anything an EVENT writes
  // there is refunded by the next totem the player walks into.
  hpPerWave: 0,         // Scar Tissue: max HP banked at every wave clear
  hpPerCleanWave: 0,    // Untouched: max HP banked at a wave cleared unhurt
  hpBankCap: 0,         // and the ceiling the bank stops at
  plantRegen: 0,        // Dig In: health per second once planted
  plantDelay: 0,        // after this long still and untouched
  salvoTime: 0,         // Opening Salvo: free-ammo seconds at each wave start
  fogMult: 1,           // Blackout: multiplier on the fog density rig.js drives
  creditMult: 1,        // multiplier on credits earned
  ammoOnKill: 0,        // reserve rounds granted per kill
  magnetMult: 1,        // Lodestone: multiplier on the money-orb collection
                        // radius (and, at a reduced rate, on the pickup one)
  shockwave: 0,         // damage dealt to nearby enemies when hit
  shockwaveRadius: 0,
  steady: 0,            // extra damage fraction while standing still

  // PASSIVE ITEM FIELDS. These are the single-tier picks - each is set by
  // exactly one upgrade with max: 1, so they are flags and rates rather than
  // multipliers that stack. Zero means the passive item is not owned, which is
  // what every hook in main.js tests.
  poisonPower: 0,       // Venom: poison damage PER TICK as a multiple of one of
                        // the player's own shots - see Player.dotHit
  poisonTime: 0,
  burnPower: 0,         // Incendiary: burn damage per tick, same multiple, for
  burnTime: 0,          // burnTime seconds
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
  ashPower: 0,          // Ashen: lingering cloud where a burning enemy died;
                        // it SETS FIRE rather than dealing its own damage
  ashRadius: 0,
  ashTime: 0,
  poisonSpread: 0,      // Neurotoxin: radius poison jumps to a clean enemy
  entropyBelow: 0,      // Entropy: HP fraction under which statuses never end
  // CRITICAL HITS. Every player starts with a 5% chance of one, so the system
  // is felt from the first magazine of the first run rather than being a thing
  // that switches on when an item is found - and so an item that raises it is
  // raising a number the player has already seen.
  //
  // IT LIVES IN DEFAULT_MODS, not on the Player, precisely BECAUSE it has a
  // non-zero default: rebuildMods() replaces the whole mods object from this
  // template on every draft pick, so a base written anywhere else would be
  // wiped by the next totem. See the contract at the top of upgrades.js.
  critChance: 0.05,
  critMult: 1.5,
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
  noHitBonus: 0,        // No-Hit Bonus: damage and fire rate gained per wave
                        // cleared without taking damage. Unlike everything
                        // else here it accumulates across the run - see
                        // noHitStacks, NO_HIT_CAP and rebuildMods().

  // THE ELEVEN CONVERTED PICKS. These were sold for max health at a second
  // row that no longer exists; they are ordinary passive items now (see the
  // note above their block in upgrades.js) and always were ordinary mods - set
  // by an apply() and replayed by rebuildMods() like everything above. Only
  // Executioner still charges health, through maxHpFlat below.
  carnageStep: 0,       // Carnage: damage gained per kill, lost on any hit
  carnageMax: 0,        // and the ceiling it climbs to
  killHeal: 0,          // Blood Pact: HP healed per kill
  damageTakenMult: 1,   // Blood Pact: multiplier on all damage the player takes
  hellfirePower: 0,     // Hellfire: burning trail dropped behind a reload;
                        // sets fire, like every other fire in the game
  hellfireTime: 0,
  hellfireRadius: 0,
  statusEternal: 0,     // Eternal Affliction: enemy statuses never expire
  hazardMult: 1,        // and pools and lava hurt this much more
  worldSlow: 1,         // Absolute Zero: multiplier on enemy and projectile speed
  hitFreeze: 0,         // and seconds the player is frozen by a hit
  overloadFrac: 0,      // Overload: fraction of max HP lightning removes when
                        // the magazine runs dry
  bossHpMult: 1,        // Executioner: multiplier on boss health at spawn
  maxHpFlat: 0,         // and the max health it takes off the top for it. Flat,
                        // and a MOD rather than a payment: rebuildMods() replays
                        // the owned list from fresh defaults after every pick,
                        // so a price paid once could not survive that.
  poisonImmune: 0,      // Antidote: poison pools do nothing
  poisonLeech: 0,       // and each poisoned enemy heals this much per second
  gamble: 0,            // Devil's Gamble: 51% double damage, 49% half, per shot
  thorns: 0,            // Thorns: fraction of a hit reflected onto the attacker
};

// The only ground speed there is. Sprint used to sit on top of a 6.5 walk;
// holding a key to move at the speed the game is balanced around was a tax
// rather than a decision, so the walk is gone and this is what everyone gets.
const BASE_SPEED = 10;
// Reserve ammo capacity before Ammo Hoarder. Read through the maxReserve
// getter, never stored, so the passive item cannot be lost by a reset().
const BASE_RESERVE = 300;
// Jump impulse against the 22 m/s^2 gravity in update(). The AIR jump is
// deliberately the stronger of the two: a second hop that only matched the
// first would clear nothing the first had not already cleared. 9 tops out at
// 1.84m; 11 taken at that apex reaches roughly 4.6m, which is over every enemy
// in the pool.
const JUMP_V = 9;
const AIR_JUMP_V = 11;
// BLINK DRIVE: how long a dash lasts and its PEAK speed. What it costs to
// fire again is the item's charge, not the dash's - see js/items.js.
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
// The ceiling on No-Hit Bonus, as a fraction. The passive item pays 8% a wave,
// so this is reached after five clean waves and never moves again. Exported
// because main.js says the current total on the clear banner and has to agree
// with rebuildMods about where it stops.
export const NO_HIT_CAP = 0.4;
// THE FLAWLESS STREAK. The credit multiplier carried by consecutive waves
// cleared without taking a single point of damage - the game's only credit
// multiplier now that the kill chain does not pay (see Game._dropMoney).
//
// It is DELIBERATELY NOT the No-Hit Bonus above, and the two must not be
// merged however similar they look: No-Hit is a permanent ramp that a hit
// never takes away, and this drops to nothing the instant the player is
// touched. One is a build that grows, the other is a run you are currently
// getting away with. They read the SAME flawless flag, so they can never
// disagree about what an untouched wave is - they only disagree about what
// losing one costs.
//
// A quarter per wave, capped at three, so the ceiling is eight clean waves.
const FLAWLESS_STEP = 0.25;
const FLAWLESS_MAX_MULT = 3;
// Clean waves past which the streak stops climbing. Derived from the two above
// rather than written down, so the cap and the step can never disagree.
export const FLAWLESS_STREAK_CAP =
  Math.round((FLAWLESS_MAX_MULT - 1) / FLAWLESS_STEP);

/**
 * The credit multiplier a streak of `n` clean waves is worth.
 *
 * A free function and not a method because versus.js has to compute it for a
 * player whose Player object is not the live one - a benched build is a plain
 * snapshot, and the boss bounty mirrored into it still has to be scaled by
 * THEIR streak and not the active player's. See captureRun.
 */
export function flawlessStreakMult(n) {
  return Math.min(FLAWLESS_MAX_MULT, 1 + FLAWLESS_STEP * Math.max(0, n));
}
// The floor no max-health cost may take the player below, enforced inside the
// maxHealth getter itself rather than at any one charging site - which is the
// whole guarantee that a build can never reduce itself to nothing. Twenty is a
// fifth of the starting pool: low enough that Executioner's fifty is a real
// price out of a full bar, high enough that a run carrying it is still standing.
export // THE HANDOFF SWING. Far enough down that the muzzle clears the bottom of the
// frame at every field of view the game offers, with the roll and the push
// outboard doing the rest - a weapon that only translated straight down read
// as a lift going out of shot.
const HOLSTER_DROP = 0.62;
const HOLSTER_BACK = 0.18;
const HOLSTER_OUT = 0.1;
const HOLSTER_PITCH = -0.55;
const HOLSTER_ROLL = 0.7;

const MIN_MAX_HEALTH = 20;
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

// ---- the sustained-fire cone ("bloom") -------------------------------------
//
// RECOIL AND BLOOM ARE TWO DIFFERENT COSTS AND THEY ARE KEPT APART. Recoil is
// the muzzle climbing: it moves where the gun is pointed, the player can see
// exactly where it went, and pulling back down answers it. Bloom is the gun
// getting SLOPPY: the point of aim does not move at all, the cone around it
// widens, and nothing the player does with the stick answers it - the only
// answer is to stop firing. A weapon that only climbed could be mastered into
// a laser; one that only bloomed would feel broken rather than hot. Together
// they are what makes a held trigger a decision.
//
// `bloom` is a 0..1 CHARGE, not an angle. Every round adds to it and it
// saturates at 1, which is the "limit" the whole mechanic needs: a magazine
// held down reaches its worst cone about eight rounds in and stays there,
// rather than opening until the crosshair leaves the screen. main.js turns the
// charge into NDC (see BLOOM_SPREAD there), which is what lets Hair Trigger
// widen the cone without touching the ramp or the cap.
const BLOOM_PER_SHOT = 0.135;
// How fast the charge bleeds off, in units a second. Deliberately several
// times the fill rate: letting go of the trigger has to READ as the gun
// settling, and at 3.2 a fully bloomed weapon is back to its resting cone in
// under a third of a second.
const BLOOM_RECOVER = 3.2;
// And the wait before that starts. The floor exists for slow weapons; what
// actually sets it is the gun's own cadence - see tryShoot, which holds for one
// and a half shot intervals. Recovery is meant to begin when the player has
// STOPPED firing, and "stopped" for a ten-rounds-a-second rifle means having
// missed a cycle, not having been between two rounds.
const BLOOM_HOLD_MIN = 0.12;

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

// ---- crouching and sliding -------------------------------------------------
//
// ONE BUTTON, TWO MOVES, AND THE RUN IS WHAT DECIDES WHICH. Standing still or
// walking, the button is a TOGGLE - crouch is a state the player leaves by
// pressing it again, not a key held through a firefight. At a sprint it is a
// SLIDE, because the only thing the player can be asking for at that speed is
// to keep it.
//
// The slide does NOT end when the button is released. It is a committed move
// with a fixed length, the way a dash is: a slide that could be cancelled on
// the frame after it started would be a crouch with extra steps, and the point
// of it is that it costs the player the second they spend in it. It ends
// STANDING rather than crouched - the run flows back out of it - so the player
// never has to press the button again to get their height back.
// How long the eye takes to catch up with a step the body has already taken.
// Short: this is smoothing, not an animation, and anything longer reads as the
// camera being dragged up rather than as the player climbing.
const _STEP_EASE = 0.11;
// How much room the camera keeps under anything it passes beneath.
//
// A near plane is a rectangle: at this game's 75 degree field of view its far
// corner sits about 2.2x the near distance from the eye, which at near = 0.05
// is 0.11m. Anything nearer than that is clipped away, and since every surface
// here is front-faced the hole shows the inside of the room rather than the
// wall. 0.25 covers that corner at any aspect ratio a monitor is likely to
// have, with room to spare for the frame the collision is resolved on.
const CAM_CLEARANCE = 0.25;
const STAND_EYE = 1.7;
const CROUCH_EYE = 1.05;
// Lower than the crouch, and deliberately: the slide is the one moment the
// camera is near the floor, and that is most of what sells it.
const SLIDE_EYE = 0.78;
// What crouching costs. Half speed is the conventional number and it is the
// right one here - the game is fast enough that anything gentler would make
// crouch-walking a free way to be a smaller target.
const CROUCH_SPEED_MULT = 0.5;
// How long the height and the gun pose take to follow. Short: this is a
// posture change, not a transition, and a crouch the player has to wait for is
// one they stop using.
const CROUCH_POSE_TIME = 0.16;
// The slide's length, its opening speed, and how fast the heading can be
// steered while it runs.
//
// THE SPEED DECAYS TO A WALK RATHER THAN TO A STOP. At the last frame the
// slide is moving at exactly BASE_SPEED, which is what the movement block
// below would have produced on its own - so handing control back is not an
// event. Nothing snaps, and there is no frame where the player is slower than
// they would have been had they never slid.
const SLIDE_TIME = 0.75;
const SLIDE_SPEED_MULT = SPRINT_SPEED_MULT * 1.15;
// Radians a second the slide can be turned. Slight, on purpose: a slide that
// steers like walking is just a faster walk, and the whole shape of the move
// is that the player commits to a line.
const SLIDE_STEER = 1.6;
// Slides are paid for out of the sprint bar, and faster than running is - it
// is a burst, not a pace.
const SLIDE_DRAIN = 45;
// HOW LONG A SLIDE PRESSED IN THE AIR STAYS QUEUED.
//
// THE MOVE THIS EXISTS FOR: sprint, jump, and hit the crouch button on the way
// down so the landing IS the slide. It is the standard shooter dive and it is
// the one thing the button could not do - in the air there is no ground to
// slide along, so the press fell through to the crouch toggle and the player
// landed in a squat having asked for the opposite.
//
// Buffered rather than held, and that distinction is the whole feel of it: the
// player presses on the way down and the game owes them a slide when they
// arrive, whether or not the button is still down at the moment of contact.
// Timing a button against a landing frame is not a skill worth testing.
//
// A jump is 2 * JUMP_V / 22 = 0.82 seconds in the air, so a second covers one
// pressed at the very moment of takeoff and still expires inside a long fall -
// a player who taps crouch at the top of a drop off the high catwalk lands on
// their feet, which by then is what they expect.
//
// It matters less than it looks, because a HELD button refreshes it every
// frame (see _updateCrouch): this window is what a tap buys, and the move as
// people actually perform it - hold crouch on the way down - is not on a
// clock at all.
const SLIDE_BUFFER = 1;
// And the floor to start one on, so a slide cannot be entered on the last drop
// of the bar and end a tenth of a second later.
const SLIDE_MIN_STAMINA = 15;
// Momentum out of a slide, and what happens to it.
//
// JUMPING OUT OF A SLIDE KEEPS THE SLIDE'S SPEED. That is the whole reason the
// two moves are worth having together: the slide is fast and low, the jump is
// the way to spend it, and a jump that quietly dropped the player back to
// walking speed at the apex would make the combination pointless.
//
// It is held as a velocity with a WEIGHT over the player's own movement -
// exactly the arrangement the dash uses - so the hand-back is a blend rather
// than a switch. Airborne the weight stays at 1 and the speed is kept whole;
// on the ground it decays, and the player walks out of it.
const MOM_GROUND_DECAY = 0.0005;
// How fast the carried momentum can be turned in the air. Less than the
// slide's own steering: this is air control, and air control that can turn a
// launch around is what makes a movement system read as weightless.
const MOM_AIR_STEER = 1.1;

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

// THE CROUCH CARRY. Small - the camera has already dropped two thirds of a
// metre, and a weapon that moved as far as the eye did would read as the
// player ducking behind their own gun. It comes in and settles, which is the
// posture, and nothing more.
const CROUCH_GUN_X = 0.02;
const CROUCH_GUN_Y = 0.045;
const CROUCH_GUN_Z = 0.03;
const CROUCH_GUN_RX = -0.06;
// And the slide, which is the loud one: the gun is tucked in hard and rolled
// over as the player goes down, on top of the crouch pose it already carries.
const SLIDE_GUN_X = 0.06;
const SLIDE_GUN_Y = -0.05;
const SLIDE_GUN_Z = 0.1;
const SLIDE_GUN_RX = 0.28;
const SLIDE_GUN_RY = 0.35;
const SLIDE_GUN_RZ = -0.6;

// ---- the melee swing -------------------------------------------------------
//
// A BUTT-STROKE WITH THE WEAPON, in three parts: the gun is pulled back and
// turned over, driven across and forward through the target, and then walked
// back to wherever the rest of the animation stack had it. It is written as an
// OFFSET on the finished pose for the same reason the bob is - a swing thrown
// mid-reload, mid-sprint or mid-raise is the swing PLUS whatever else the gun
// was doing, rather than a second animation fighting the first over one model.
//
// The two fractions are where the wind-up ends and where the strike lands.
// main.js fires the damage on the second one (see MELEE_SWING in main.js): the
// hit is dealt at the moment the gun is seen to arrive, not at the moment the
// button went down.
const MELEE_ANIM = 0.42;
const MELEE_WIND = 0.28;
const MELEE_STRIKE = 0.5;
// The wound-up pose: back, right, muzzle lifted away from the target.
const MELEE_WIND_X = 0.11;
const MELEE_WIND_Y = -0.02;
const MELEE_WIND_Z = 0.14;
const MELEE_WIND_RX = -0.4;
const MELEE_WIND_RY = -0.55;
const MELEE_WIND_RZ = 0.55;
// And the pose at the end of the strike: through the target, across the body.
const MELEE_HIT_X = -0.16;
const MELEE_HIT_Y = 0.06;
const MELEE_HIT_Z = -0.34;
const MELEE_HIT_RX = 0.3;
const MELEE_HIT_RY = 0.95;
const MELEE_HIT_RZ = -0.95;

// Eases a 0..1 ramp into a 0..1 curve that leaves and arrives at rest. Used by
// every pose blend in this file that is not already an exponential damp.
function smooth(t) {
  return t * t * (3 - 2 * t);
}

// Turns the flat vector (x, z) toward (tx, tz) by at most `maxRad` radians,
// keeping its LENGTH. Written into `out` - this runs every frame of a slide
// and a launch, and neither is a place to be allocating.
function steerFlat(x, z, tx, tz, maxRad, out) {
  const m = Math.hypot(x, z);
  if (m < 1e-6) {
    out.x = x;
    out.z = z;
    return out;
  }
  const cur = Math.atan2(z, x);
  let d = Math.atan2(tz, tx) - cur;
  // Shortest way round, or a slide steered a few degrees left would take the
  // long way there.
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const a = cur + Math.max(-maxRad, Math.min(maxRad, d));
  out.x = Math.cos(a) * m;
  out.z = Math.sin(a) * m;
  return out;
}

// Scratch for steerFlat. Module-level and reused; nothing holds onto it past
// the line that reads it.
const _steer = { x: 0, z: 0 };

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
    // WHAT THE LAST TRIGGER PULL ACTUALLY COST, in rounds. Brass Echo pays
    // this back rather than shotCost, so a shot that spent nothing - one
    // inside Opening Salvo's window - can never refund something it never
    // used. Written by every path through tryShoot().
    this.lastShotCost = 0;
    // Evasion's speed boost, set by main.js when a hit is dodged.
    this.dodgeEnd = 0;
    // Carnage's kill chain, and the invulnerability window AEGIS opens. Both
    // on the player rather than in mods, for the reason above.
    this.carnageStacks = 0;
    this.invulnEnd = 0;

    // THE ACTIVE ITEM SLOT. One at a time, by id into ACTIVE_ITEMS
    // (js/items.js), or null - a run starts carrying nothing. `itemCharge` is
    // points banked toward the item's cost; it is filled to the top the moment
    // an item is taken, so a pedestal never hands over something the player has
    // to wait to use. It is NOT cleared between waves - a cost above WAVE_CHARGE
    // is meant to carry, which is the only way an item can cost more than one
    // wave is worth.
    this.item = null;
    this.itemCharge = 0;
    // One-shot, read and cleared by main.js on the frame the bar fills - the
    // same split jumpFx and dashFx use, and for the same reason: player.js has
    // no audio to reach for.
    this.itemReadyFx = false;
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
    // THE SUSTAINED-FIRE CHARGE, 0..1. See BLOOM_PER_SHOT. `_bloomHold` is the
    // game time recovery is allowed to start at, pushed forward by every round.
    this.bloom = 0;
    this._bloomHold = -99;
    // The walk/sprint bob. `_bobPhase` is in radians and advances with metres
    // travelled; `_bobAmp` is the eased 0..1 weight the whole animation is
    // scaled by; `_sprintPose` is the eased 0..1 blend into the run carry.
    this._bobPhase = 0;
    this._bobAmp = 0;
    this._sprintPose = 0;
    // CROUCHING AND SLIDING. `crouching` is a latched posture and `sliding` is
    // a timed move; they are never both true. `eyeH` is the height the camera
    // and every hit test read - see eyeInto - eased between the three poses so
    // going down is a movement rather than a cut.
    this.crouching = false;
    this.sliding = false;
    this.slideT = 0;
    this.slideDX = 0;
    this.slideDZ = 0;
    this.eyeH = STAND_EYE;
    // How far the eye is currently BEHIND the feet, because the body just took
    // a step up. Eased back to zero every frame - see the step block in
    // update() - and subtracted by both eyeInto and applyCamera so the view and
    // every hit test read the same height.
    this._stepLag = 0;
    // The two pose blends the gun rides on, and the crouch button's edge
    // detector - the button is HELD by the time this sees it, and a toggle
    // driven by a held button would flip once a frame.
    this._crouchPose = 0;
    this._slidePose = 0;
    this._prevCrouch = false;
    // Seconds left on a slide asked for in mid-air. See SLIDE_BUFFER. A
    // COUNTDOWN rather than a deadline, so nothing has to rebase it.
    this._slideBuf = 0;
    // Whether the player was RUNNING the last time they had ground under
    // them. Read only by the air branch of _updateCrouch, and remembered
    // rather than measured because horizontal speed in the air is not the
    // question: letting go of the sprint key at the apex drops it to the walk
    // instantly, and the player who did that has still just jumped out of a
    // sprint. It is a fact about the takeoff, so it is recorded at the takeoff.
    this._groundRun = false;
    // The sprint button's own edge. Sprint is otherwise a HELD input and
    // nothing needed its rising edge until the crouch had to be cancelled by
    // it - see _updateCrouch.
    this._prevSprint = false;
    // Momentum carried out of a slide by a jump. See MOM_GROUND_DECAY.
    this._momX = 0;
    this._momZ = 0;
    this._momW = 0;
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
    // The swing's own clock, separate from meleeActive: the animation outlives
    // the hit by a wide margin, and folding the two into one number would tie
    // how long the arm takes to come back to how long the strike lands for.
    this.meleeAnim = 0;
    this.damageMult = 1;
    // RAGE. The red pickup's other half: it moves the player as well as their
    // damage, and it rides the SAME clock so the two can never disagree about
    // how long the buff has left. Set by POWERUP_TYPES.damageBoost, cleared
    // beside damageMult below.
    this.rageSpeedMult = 1;
    this.damageBoostEnd = 0;
    this.fireRateMult = 1;
    this.fireRateBoostEnd = 0;
    // HOW LONG THE WINDOW CURRENTLY RUNNING WAS GRANTED FOR, in seconds. The
    // HUD chip's fraction is (remaining / this), and it exists because the two
    // boosts now have more than one source: the RAGE pickup opens ten seconds
    // and OVERDRIVE five, the FIRE RATE pickup eight and RED LINE six. Measured
    // against a constant, every chip but the pickup's own opened part-drained -
    // the bar disagreeing with the effect it was drawn for.
    //
    // Written by whatever wrote the DEADLINE, and only when that write actually
    // won: a five-second item landing under a ten-second pickup leaves both the
    // deadline and the length alone.
    this.damageBoostFull = 1;
    this.fireRateBoostFull = 1;
    this.shield = 0;
    this.shieldEnd = 0;
    // ---- ACTIVE-ITEM RUNTIME ------------------------------------------
    //
    // Written by the running-item list in items.js and read by the shot
    // pipeline, the damage sinks and the pickup hooks. DELIBERATELY NOT IN
    // `mods`: rebuildMods() replays the owned upgrade list from fresh defaults
    // after every totem pick, so anything an item wrote there would be handed
    // back by the next passive item the player walked into.
    //
    // They are also separate from damageMult / fireRateMult rather than folded
    // into them. Those two are the RAGE pickup's fields and carry its expiry;
    // an item that borrowed them would either be cancelled by a pickup landing
    // on top of it or would cancel one, and neither is the honest reading of
    // two effects granted independently. Multiplying instead means an item and
    // a pickup stack, which is what a player holding both expects.
    this.itemDamageMult = 1;   // RED MIST, BLOOD TAX, BODY COUNT
    this.itemTakenMult = 1;    // RED MIST's other half
    this.itemRateMult = 1;     // RED LINE
    this.itemHoming = 0;       // BIRD DOG: Seeker's cone, on a clock
    this.leechShots = 0;       // HAEMOPHAGE: landed shots still owed a heal
    this.elementCycle = -1;    // FOUR HUMOURS: -1 off, else the next element
    this.orbHealEnd = 0;       // BLOOD FROM STONE: orbs heal until this time
    this.statusLockEnd = 0;    // WHITE CELL: applyStatus refuses until this
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
    // The flawless streak: consecutive waves cleared without being hit.
    //
    // ON THE PLAYER, NOT ON THE GAME, and that is the whole of what makes it
    // work in versus: captureRun copies every Player field that is not on the
    // skip list, so a streak follows its owner onto the bench and comes back
    // with them. The same counter on Game would have to be named in
    // GAME_FIELDS, and the failure mode of forgetting is one player inheriting
    // the other's streak - silent, and worth real money.
    this.flawlessStreak = 0;
    this._ammoRegenAcc = 0;
    // Holy Mantle's charge, re-armed at every wave start, and Dead Cat's
    // revive counter, which is spent once per run and not refilled.
    this.wardReady = false;
    this.livesUsed = 0;
    // No-Hit Bonus: waves cleared without taking a point of damage since the
    // passive item was picked up. It lives on the PLAYER rather than in mods
    // because mods are rebuilt from the upgrade list on every draft pick, and
    // anything written into them by an event would be wiped by the next one.
    this.noHitStacks = 0;
    // UNTOUCHED and SCAR TISSUE. Max HP earned at wave ends and kept for the
    // rest of the run, on the player for the reason noHitStacks is - see the
    // note in DEFAULT_MODS. Read by the maxHealth getter.
    this.hpBanked = 0;
    // OPENING SALVO. Game time the free-ammo window at the top of the wave
    // closes at. A deadline, so it is rebased across a versus handoff - see
    // PLAYER_CLOCKS in versus.js.
    //
    // A NEGATIVE SENTINEL, not 0, and the window is tested against the passive
    // item as well as the clock. Game time is a float that starts at 0 and a
    // frame served a backwards timestamp can push it below that, at which
    // point a closed window written as 0 compares as OPEN and every shot in
    // the run is free. "Not armed" must not be a number the clock can walk
    // past.
    this.salvoEnd = -99;
    // DIG IN. Seconds spent planted and untouched, counted in update().
    this._planted = 0;
    // Hot Streak's live bonus, a signed damage FRACTION clamped between
    // -streakFloor and +streakCap. On the player for the same reason
    // noHitStacks is: a rebuildMods() would wipe it mid-magazine.
    this.streak = 0;
    // Double Jump state; `jumpsLeft` refills on landing. The DASH kept its
    // motion but lost its bookkeeping: it is an active item now (BLINK DRIVE,
    // js/items.js) and the item's charge bar IS the gate on firing it again,
    // so nothing here counts charges any more. That bar is filled by kills.
    this.jumpsLeft = 0;
    this.dashStart = 0;
    this.dashEnd = 0;
    this.dashDX = 0;
    this.dashDZ = 0;
    this._prevJump = false;
    this.jumpFx = false;
    this.dashFx = false;
    // One-shot, read and cleared by main.js on the frame a slide opens - the
    // same split jumpFx and dashFx use, and for the same reason: player.js has
    // no effects or audio to reach for.
    this.slideFx = false;
    // VERSUS HANDOFF. 0 is the gun in hand, 1 is the gun swung fully out of
    // frame. Driven by main.js across a turn change and zero at every other
    // moment in the game's life - see setHolster.
    this.holster = 0;

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

  /**
   * THE TURN CHANGE, as the gun sees it. `t` runs 0 (in hand) to 1 (gone).
   *
   * A DROP AND A ROLL, not a fade: the weapon leaves the frame the way a real
   * one would be handed over, swung down and away past the bottom edge, and
   * comes back up the same path in the other player's hands. It writes the
   * pose outright rather than setting a flag for update(), because update()
   * does not run during a handoff - nothing about the player is simulated
   * while the controller is between two people.
   */
  setHolster(t) {
    this.holster = t;
    this.gun.position.set(
      this.gunBaseX + HOLSTER_OUT * t,
      this.gunBaseY - HOLSTER_DROP * t,
      this.gunBaseZ + HOLSTER_BACK * t
    );
    this.gun.rotation.set(HOLSTER_PITCH * t, 0, HOLSTER_ROLL * t);
  }

  /** Lights the flank strip in this player's colour, or clears it in solo. */
  setPlayerTag(color) {
    setGunTag(this.gun, color);
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

  // Lights one plate on the receiver per owned passive item that changes what
  // a bullet does, in that upgrade's totem colour (the `mark` flag in
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
  // Executioner's fifty and the console's purchases both come off AFTER the
  // build's own bonuses, so the price is the same fifty points whether or not
  // the player later picks up Overhealth - a flat subtraction, not a share of
  // the pool. Glass Cannon, which IS a share, multiplies inside `built`.
  get maxHealth() {
    const built = Math.round((this.baseMaxHealth + this.mods.maxHpBonus) * this.mods.maxHpMult);
    // The bank is added AFTER the multipliers rather than into maxHpBonus,
    // because it is health the player earned wave by wave and not part of the
    // build: Glass Cannon halving the frame it was earned on would quietly
    // take half of every clean wave back with it.
    return Math.max(
      MIN_MAX_HEALTH, built + this.hpBanked - this.mods.maxHpFlat
    );
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
  }

  // Hot Streak. Called once per SHOT with whether that shot connected - the
  // same boolean the hitmarker is drawn from, so the bonus can never disagree
  // with what the player just saw. A no-op for a run that has not picked the
  // passive item up, which is why the caller does not have to test for it.
  bumpStreak(hit) {
    const m = this.mods;
    if (m.streakStep <= 0) return;
    const next = this.streak + (hit ? m.streakStep : -m.streakStep);
    this.streak = Math.max(-m.streakFloor, Math.min(m.streakCap, next));
  }

  // BLINK DRIVE's motion. Fired by the item (js/items.js) rather than by a
  // passive item, so there is no charge to check here any more - the caller
  // has already spent the item's charge by the time this runs.
  //
  // FORWARD ONLY. It used to dash whichever way the tapped key walked, which
  // made a back-tap the safest button in the game: the dash's whole cost is
  // that it commits you to a direction, and committing to AWAY costs nothing.
  // It goes straight down the camera's bearing now whatever the feet are
  // doing, so the dash is a way into a fight rather than a free disengage.
  dash(time) {
    this.dashDX = -Math.sin(this.yaw);
    this.dashDZ = -Math.cos(this.yaw);
    this.dashStart = time;
    this.dashEnd = time + DASH_TIME;
    this.dashFx = true;
    return true;
  }

  // One more flawless wave. Returns the new stack count so the caller can say
  // so on screen; a run that has not picked the passive item up never calls
  // this. Stops counting once the stacks on the board already reach
  // NO_HIT_CAP, so the number on the HUD never climbs past what it is actually
  // paying.
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

  // Hands the player an active item, replacing whatever they were carrying.
  // It arrives FULLY CHARGED: the pedestal is at a wave break, and an item
  // that had to be earned again after being taken would be a pickup the player
  // could not use in the fight it was handed to them for.
  //
  // It used to return the id it displaced, so the claim banner could name the
  // swap. Nothing names the swap any more - there is one slot, so what became
  // of the old item was never in question - and a return value with no reader
  // is a contract waiting to be got wrong.
  giveItem(id) {
    this.item = id;
    this.itemCharge = ACTIVE_ITEMS[id].charge;
    this.itemReadyFx = false;
  }

  // Whether the carried item can be fired right now. Nothing carried is not
  // ready, so every caller can ask this one question.
  get itemReady() {
    return !!this.item && this.itemCharge >= ACTIVE_ITEMS[this.item].charge;
  }

  // Spends the charge. The EFFECT is not here - it lives on the item's own
  // entry in items.js, which needs the game and not the player.
  spendItem() {
    this.itemCharge = 0;
    this.itemReadyFx = false;
  }

  // Banks charge points toward the carried item. THE ONLY WAY THE METER MOVES,
  // and main.js calls it from one place - the orb pickup - so what fills the
  // bar is always something the player went and got.
  //
  // Carrying nothing is not an error and is not saved for later: charge belongs
  // to an item, and a player holding no item is simply not earning any. The
  // clamp is at the top only, so an item already full silently drops the rest -
  // the alternative is a hidden overflow that makes the next charge instant.
  addItemCharge(points) {
    if (!this.item || !(points > 0)) return;
    const was = this.itemReady;
    this.itemCharge = Math.min(
      ACTIVE_ITEMS[this.item].charge, this.itemCharge + points
    );
    if (!was && this.itemReady) this.itemReadyFx = true;
  }


  // Absolute Zero's drawback. The world moves 30% slower and you stop dead for
  // half a second every time something lands.
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
    // WHITE CELL's lock. The cleanse alone would be undone on the next frame
    // by the same lava the player is still standing in, and an item whose
    // whole payload can expire before the button has finished being pressed is
    // one the player will read as broken. Refused HERE rather than in
    // _afflictPlayer so the lock also covers a status the PLAYER's own
    // machinery would put on them.
    if (this.now < this.statusLockEnd) return false;
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

  // Called by main.js on every kill. Vampiric Rounds, Blood Pact and Carnage
  // are all that hang off it - nothing else in the game is paid per kill any
  // more, the credit multiplier included.
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

  // Holy Mantle. Called at the start of every wave: the ward is a per-wave
  // charge, so a wave survived without spending it does not bank a second one.
  armWard() {
    this.wardReady = this.mods.wardPerWave > 0;
  }

  // OPENING SALVO. Opened at every wave start, beside the ward, so the two
  // things a wave hands the player are armed in one place.
  armSalvo(time) {
    this.salvoEnd = this.mods.salvoTime > 0 ? time + this.mods.salvoTime : -99;
    // The planted clock does not survive a wave boundary either: the player
    // standing in the shop has not been holding a position under fire.
    this._planted = 0;
  }

  /**
   * Rolls a critical hit.
   *
   * ONCE PER TRIGGER PULL, never per pellet - the same house rule Devil's
   * Gamble follows, and for the same reason: nine pellets each tossing their
   * own coin averages out to almost exactly nothing, where one roll for the
   * whole shot is an event. Melee rolls once a swing and the lance once a beam.
   *
   * PROCS DO NOT CRIT. Chain lightning, thorns, blasts, overload, mines,
   * sentries and damage over time all pass flat numbers and stay flat: a crit
   * is a thing the player's own shot did, and a critical burn tick landing on
   * the beat would be a gold number nobody aimed.
   */
  rollCrit() {
    return Math.random() < this.mods.critChance;
  }

  // ONE TICK OF DAMAGE OVER TIME: one of the player's own shots, before the
  // per-status multiplier the caller applies on top.
  //
  // getEffectiveDamage, not the raw weapon number. Fire and poison used to be
  // flat rates, which made them real numbers on wave 3 and rounding errors on
  // wave 30 - the two statuses in the pool that got weaker the longer a run
  // went on. Charged as one of the player's SHOTS, they are worth exactly what
  // the gun is worth at the moment they are applied, and every damage passive
  // item in the build feeds them. Malady still multiplies on top, which is
  // what keeps that trade honest on both statuses.
  //
  // Snapshotted by the caller into the enemy's own _dot, so a burn already
  // running is not retroactively rescaled by a totem claimed after it started.
  get dotHit() {
    return this.getEffectiveDamage(this.weapon.damage);
  }

  // BRASS ECHO. Called once per shot that connected; a shot that hit nothing
  // is never offered the roll. Returns whether the round came back, so the
  // caller can say so on screen.
  tryAmmoRefund() {
    if (this.mods.ammoRefund <= 0) return false;
    // What the shot SPENT, not what a shot costs. A round fired inside Opening
    // Salvo's free window cost nothing, and refunding it would be making
    // ammunition rather than getting it back.
    if (this.lastShotCost <= 0) return false;
    if (this.reserveAmmo >= this.maxReserve) return false;
    if (Math.random() >= this.mods.ammoRefund) return false;
    this.reserveAmmo = Math.min(this.maxReserve, this.reserveAmmo + this.lastShotCost);
    return true;
  }

  // UNTOUCHED and SCAR TISSUE, paid at a wave clear. `clean` is the same
  // flawless flag the clear bonus and No-Hit Bonus read, so the three can
  // never disagree about what an untouched wave is. Returns the HP actually
  // banked - 0 when neither passive item is owned or the bank is full - and
  // grants the CURRENT health with it, or the bar grows behind a number that
  // did not move and the reward reads as nothing having happened.
  bankWaveHealth(clean) {
    const m = this.mods;
    let gain = m.hpPerWave + (clean ? m.hpPerCleanWave : 0);
    if (gain <= 0) return 0;
    gain = Math.min(gain, m.hpBankCap - this.hpBanked);
    if (gain <= 0) return 0;
    this.hpBanked += gain;
    this.health = Math.min(this.maxHealth, this.health + gain);
    return gain;
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
    // Before rebuildMods for the same reason: maxHealth reads the bank, and a
    // new run must be born at the base cap and not the last one's.
    this.hpBanked = 0;
    this.salvoEnd = -99;
    this._planted = 0;
    this.streak = 0;
    this.jumpsLeft = 0;
    this.dashStart = 0;
    this.dashEnd = 0;
    this._prevJump = false;
    this.jumpFx = false;
    this.dashFx = false;
    this.slideFx = false;
    this.rebuildMods();
    this.weaponKey = STARTING_WEAPON;
    this.mag = WEAPONS[STARTING_WEAPON].magSize;
    this._equipModel();
    this.refreshGunMarks();
    this.flawlessStreak = 0;
    this._ammoRegenAcc = 0;
    this.wardReady = false;
    this.livesUsed = 0;
    this.breachReady = false;
    this.lastShotCost = 0;
    this.dodgeEnd = 0;
    this.carnageStacks = 0;
    this.invulnEnd = 0;
    this.frozenUntil = 0;
    this.item = null;
    this.itemCharge = 0;
    this.itemReadyFx = false;
    // The active-item runtime, back to neutral. main.js clears the RUNNING
    // list separately; these are the marks it leaves on the player, and a new
    // run inheriting a triple-damage window would be born mid-buff.
    this.itemDamageMult = 1;
    this.itemTakenMult = 1;
    this.itemRateMult = 1;
    this.itemHoming = 0;
    this.leechShots = 0;
    this.elementCycle = -1;
    this.orbHealEnd = 0;
    this.statusLockEnd = 0;
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
    this.bloom = 0;
    this._bloomHold = -99;
    this._bobPhase = 0;
    this._bobAmp = 0;
    this._sprintPose = 0;
    this.crouching = false;
    this.sliding = false;
    this.slideT = 0;
    this.slideDX = 0;
    this.slideDZ = 0;
    this.eyeH = STAND_EYE;
    // How far the eye is currently BEHIND the feet, because the body just took
    // a step up. Eased back to zero every frame - see the step block in
    // update() - and subtracted by both eyeInto and applyCamera so the view and
    // every hit test read the same height.
    this._stepLag = 0;
    this._crouchPose = 0;
    this._slidePose = 0;
    this._prevCrouch = false;
    this._slideBuf = 0;
    this._groundRun = false;
    this._prevSprint = false;
    this._momX = 0;
    this._momZ = 0;
    this._momW = 0;
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
    this.meleeAnim = 0;
    this.damageMult = 1;
    this.rageSpeedMult = 1;
    this.damageBoostEnd = 0;
    this.damageBoostFull = 1;
    this.fireRateMult = 1;
    this.fireRateBoostEnd = 0;
    this.fireRateBoostFull = 1;
    this.shield = 0;
    this.shieldEnd = 0;
    this.clearStatuses();
  }

  // Eye position (feet + `eyeH`) written into `v`. Takes an out-param so the
  // hot path can reuse a scratch vector instead of allocating.
  //
  // NOT A CONSTANT ANY MORE: crouching and sliding drop it, and every shot,
  // pickup test and aim-assist ray in the game comes off this - so a crouched
  // player really is shooting from where their head is.
  eyeInto(v) {
    v.set(this.pos.x, this.pos.y + this.eyeH - this._stepLag, this.pos.z);
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
  // a vending machine. The active item's charge needs no such gate: it is paid
  // for in kills, and a shop has none - see addItemCharge above.
  update(dt, input, obstacles, time, combat = true) {
    // Published for getEffectiveDamage(), which has no clock of its own and is
    // called from several places that have none to give it.
    this.now = time;
    this._tickStatus(dt);
    this.fireCd -= dt;
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (this.meleeActive > 0) this.meleeActive -= dt;
    if (this.meleeAnim > 0) this.meleeAnim = Math.max(0, this.meleeAnim - dt);

    if (this.damageBoostEnd > 0 && time >= this.damageBoostEnd) {
      this.damageMult = 1;
      this.rageSpeedMult = 1;
      this.damageBoostEnd = 0;
      this.damageBoostFull = 1;
    }
    if (this.fireRateBoostEnd > 0 && time >= this.fireRateBoostEnd) {
      this.fireRateMult = 1;
      this.fireRateBoostEnd = 0;
      this.fireRateBoostFull = 1;
    }
    if (this.shieldEnd > 0 && time >= this.shieldEnd) {
      this.shield = 0;
      this.shieldEnd = 0;
    }

    // THE ACTIVE ITEM DOES NOT CHARGE HERE ANY MORE, and there is no longer any
    // per-frame work to do for it at all. It used to fill at one point per
    // second of `combat` time, which paid the player for taking longer over a
    // wave - stand off the last enemy and a sixty-point item came back free.
    // Charge is bought with dead enemies now - a flat rate on each one's own
    // value, banked by main.js as they die and paid into the meter as their
    // orbs are collected: see CHARGE_PER_VALUE in items.js and addItemCharge
    // above.

    // Ammo Fabricator. Accumulated as a float and spent in whole rounds, so a
    // sub-1-round-per-second rate still pays out instead of truncating to
    // nothing every frame.
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
    // BEFORE the sprint, and it reads `sprinting` from the frame that just
    // ended - which is what a player pressing the button mid-run is actually
    // doing. _updateSprint then refuses the run outright while a slide is
    // running, so the two can never both own the velocity.
    this._updateCrouch(dt, input, f, s);
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
        * (this.sprinting ? SPRINT_SPEED_MULT : 1)
        // And the gear below the walk. Never both: _updateSprint refuses the
        // run while the player is crouched.
        * (this.crouching ? CROUCH_SPEED_MULT : 1);
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      this.moveVX = (-sinY * fn + cosY * sn) * speed;
      this.moveVZ = (-cosY * fn - sinY * sn) * speed;
    } else {
      const damp = Math.pow(0.0001, dt);
      this.moveVX *= damp;
      this.moveVZ *= damp;
    }
    // THE SLIDE OWNS THE VELOCITY OUTRIGHT while it runs, which is why it is
    // written over the block above rather than into it: the direction is the
    // one the slide was entered on (steered a little, in _updateCrouch), and
    // the speed comes off the envelope rather than off the keys. Letting go of
    // the stick mid-slide does not stop it - see the note on SLIDE_TIME.
    if (this.sliding) {
      // 0 at the start, 1 at the end. Squared, so the slide holds its opening
      // speed for most of its length and then gives it up quickly, instead of
      // bleeding away evenly from the first frame.
      const u = 1 - Math.max(0, this.slideT) / SLIDE_TIME;
      const mult = SLIDE_SPEED_MULT + (1 - SLIDE_SPEED_MULT) * smooth(u);
      const sp = BASE_SPEED * mult * this.mods.moveMult * this.rageSpeedMult
        * this.statusSpeedMult();
      this.moveVX = this.slideDX * sp;
      this.moveVZ = this.slideDZ * sp;
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

    // SLIDE MOMENTUM, laid over the result the same way the dash is. Set by
    // the jump below on the frame a slide is launched out of, and from then on
    // it is the velocity - the player keeps every metre a second the slide had
    // built until they land.
    //
    // `onGround` here is last frame's, since this one is not resolved until
    // after the integration below. That single frame of lag is invisible and
    // it is the only ordering that lets the jump read the slide's velocity.
    if (this._momW > 0) {
      if (this.onGround) {
        this._momW *= Math.pow(MOM_GROUND_DECAY, dt);
        if (this._momW < 0.02) this._momW = 0;
      } else if (f || s) {
        // Air control, as a turn rather than a push: the launch keeps its
        // speed and the player is allowed to point it somewhere.
        const len = Math.hypot(f, s);
        const sinY = Math.sin(this.yaw);
        const cosY = Math.cos(this.yaw);
        const wx = (-sinY * (f / len) + cosY * (s / len));
        const wz = (-cosY * (f / len) - sinY * (s / len));
        steerFlat(this._momX, this._momZ, wx, wz, MOM_AIR_STEER * dt, _steer);
        this._momX = _steer.x;
        this._momZ = _steer.z;
      }
      const w = this._momW;
      this.vel.x = this.vel.x * (1 - w) + this._momX * w;
      this.vel.z = this.vel.z * (1 - w) + this._momZ * w;
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
      // A JUMP IS ALWAYS AVAILABLE OUT OF A SLIDE, and it takes the slide's
      // speed with it. `vel` is the slide's velocity by this point in the
      // frame, so there is nothing to reconstruct - the launch is simply what
      // the player was already doing, kept.
      if (this.sliding) {
        this._momX = this.vel.x;
        this._momZ = this.vel.z;
        this._momW = 1;
        this._endSlide();
      }
      // Standing up to jump. A player who jumps out of a crouch and lands
      // still crouched would have pressed a button and got half of it.
      this.crouching = false;
    } else if (jumpEdge && this.jumpsLeft > 0) {
      this.jumpsLeft--;
      this.vel.y = AIR_JUMP_V;
      this.jumpFx = true;
    }

    // Vertical resolution. Landing on a box only counts when falling onto its
    // top face from above (prevY at or above the top, new Y at or below it),
    // which is what makes a platform something you jump onto rather than
    // something you walk up the side of. The STEP below is the deliberate
    // exception.
    //
    // THE TOLERANCE HERE MUST BE LOOSER THAN THE ONE IN resolveCircle, which
    // stops pushing a mover out of a box once they are within 0.06 of its top.
    // Those two numbers were 0.02 and 0.06, which left a four-centimetre band
    // where the push-out had already let go but the landing had not yet caught
    // on: a player crossing an edge at exactly that height slid over the lip
    // without being set down on it, and in a cluster of overlapping boxes
    // could end up wedged inside one. 0.07 closes the band from this side.
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;
    this.onGround = false;

    // ---- THE CEILING --------------------------------------------------------
    //
    // A jump that meets the underside of something STOPS THERE. Without this
    // the only vertical test in the game was the landing one below, which only
    // ever looks downward - so a player jumping up through a deck passed
    // straight through the slab and arrived standing on top of it. Every raised
    // walkway in a generated arena was a one-way door.
    //
    // Tested as a CROSSING of the underside rather than as an overlap: the head
    // was below it last frame and is above it now. An overlap test would fire
    // for a player already standing inside a doorway's opening and pin them to
    // the floor, and it is the crossing that is the actual event.
    //
    // The same +-0.2 window the landing test uses, deliberately, so the two
    // agree about what counts as being under a box. Wider - the full collision
    // radius - and jumping alongside a platform would clip your head on air.
    //
    // WHAT STOPS IS THE CAMERA, NOT THE SKULL. The body is 1.8 tall and the eye
    // sits at 1.7, so stopping a jump the instant the head touched a deck left
    // the camera ten centimetres under it - and a near plane reaches further
    // than that, so the walkway the player had just jumped under disappeared
    // and they saw through it. The stop is taken at whichever is lower: the
    // top of the head, or the eye plus enough room for the whole frustum.
    // Crouching and sliding drop the eye, so they get the headroom back.
    const stopH = Math.max(PLAYER_HEIGHT, this.eyeH + CAM_CLEARANCE);
    if (this.vel.y > 0) {
      const headPrev = prevY + stopH;
      const headNow = this.pos.y + stopH;
      for (const b of obstacles) {
        if (this.pos.x <= b.min.x - 0.2 || this.pos.x >= b.max.x + 0.2) continue;
        if (this.pos.z <= b.min.z - 0.2 || this.pos.z >= b.max.z + 0.2) continue;
        if (headPrev <= b.min.y + 0.01 && headNow > b.min.y) {
          this.pos.y = b.min.y - stopH;
          this.vel.y = 0;
          break;
        }
      }
    }

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
          prevY >= top - 0.07 && this.pos.y <= top
        ) {
          this.pos.y = top;
          this.vel.y = 0;
          this.onGround = true;
          this.jumpsLeft = this.mods.extraJumps;
          break;
        }
      }
    }
    // ---- THE STEP -----------------------------------------------------------
    //
    // Walk into something low enough and you go up it instead of stopping.
    // Without this the generated arena is unplayable: a staircase is four
    // separate jumps, a tiered platform is three, and every kerb in the room
    // is a wall you bounce off in the middle of a fight.
    //
    // It runs AFTER the vertical resolution and BEFORE resolveCircle, and that
    // order is the whole trick. Raising the feet first means the box the
    // player just climbed is one they are now standing ON, so the push-out
    // below skips it (see the first test in resolveCircle) and never shoves
    // them back off the step they just took.
    //
    // ONLY OFF THE GROUND, never in the air. A player rising through a
    // platform's side on the way up a jump must not be caught by its lip and
    // set down on it - the arc is theirs, and a jump that silently turns into
    // a step is a jump the player did not get.
    if (this.onGround || this.vel.y <= 0) {
      const top = stepSurface(this.pos, 0.4, obstacles, STEP_HEIGHT);
      if (top > this.pos.y + 1e-4) {
        // THE CAMERA DOES NOT TELEPORT. The body goes up on this frame - it
        // has to, or collision and the step disagree - and the eye is left
        // behind by exactly as much, then catches up over _STEP_EASE. Four
        // steps up a staircase read as a climb rather than as four cuts.
        this._stepLag = Math.min(STEP_HEIGHT, this._stepLag + (top - this.pos.y));
        this.pos.y = top;
        this.vel.y = 0;
        this.onGround = true;
        this.jumpsLeft = this.mods.extraJumps;
      }
    }
    // The eye catching up. Exponential rather than linear so it arrives softly
    // instead of stopping dead, and fast enough that it is never a lag the
    // player could aim with - see eyeInto, which subtracts the same offset so
    // that what the camera sees and what the hit tests use can never disagree.
    if (this._stepLag > 0) {
      this._stepLag = Math.max(0, this._stepLag - this._stepLag * Math.min(1, dt / _STEP_EASE) - dt * 0.2);
    }

    // THE TAKEOFF, REMEMBERED. Rewritten on every grounded frame and left
    // alone on every airborne one, so in the air it holds what the player was
    // doing on the last frame they had a floor. That is what the mid-air
    // crouch press asks about - see the air branch of _updateCrouch.
    if (this.onGround) this._groundRun = this.sprinting || this.sliding;
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

    // DIG IN. The planted clock: it only runs while the player is genuinely
    // stopped and has not been hit since it started, and any of movement, a
    // hit or the end of the wave puts it back to zero. `stillness` is the same
    // ramp Steady Aim reads, so the two passive items agree about what
    // standing still is - and the near-1 test means a player being shoved by a
    // Maw's well is not standing still, whatever the keys say.
    if (this.mods.plantRegen > 0) {
      const planted = combat && this.stillness > 0.98 && time - this.lastHurt > 0.2;
      this._planted = planted ? this._planted + dt : 0;
      if (this._planted > this.mods.plantDelay && this.health < this.maxHealth) {
        this.health = Math.min(this.maxHealth, this.health + this.mods.plantRegen * dt);
      }
    }

    // Regeneration, once a passive item has granted any (regenRate is 0 by
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
    // THE CONE SETTLING. Linear rather than exponential, and deliberately: an
    // exponential tail leaves the crosshair creeping shut for half a second
    // after it has visibly stopped mattering, and this is the one animation in
    // the game the player is reading as a promise about the next shot. Linear
    // arrives, and it arrives when it looks like it is going to.
    if (this.now >= this._bloomHold && this.bloom > 0) {
      this.bloom = Math.max(0, this.bloom - BLOOM_RECOVER * dt);
    }
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
    // The holster drop is folded in HERE as well as in setHolster, so a frame
    // of ordinary play that lands mid-handoff cannot snap the gun back up.
    const restY = this.gunBaseY + (ADS_GUN_Y - this.gunBaseY) * a + this._gunOffY
      - HOLSTER_DROP * this.holster;
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
    // LAST, and as an add on the finished pose - see the note on MELEE_ANIM.
    // Everything above has already had its say about where the gun is; the
    // swing takes it from there and puts it back.
    this._animateMelee();
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

    // The crouch and the slide carry, on the same terms as the run's: scaled
    // by the raise, so the sights are still the sights. A slide is crouched by
    // definition, so its pose is laid OVER the crouch's rather than instead of
    // it - the gun tucks in as the player goes down and then rolls over as
    // they hit the floor, which is one movement in two stages.
    const duck = this._crouchPose * (1 - this.aimT);
    const slide = this._slidePose * (1 - this.aimT);

    this._gunOffX = sw * BOB_X * amp + SPRINT_GUN_X * carry
      + CROUCH_GUN_X * duck + SLIDE_GUN_X * slide;
    this._gunOffY = dip * BOB_Y * amp + SPRINT_GUN_Y * carry
      + CROUCH_GUN_Y * duck + SLIDE_GUN_Y * slide;
    this._gunOffZ = SPRINT_GUN_Z * carry + CROUCH_GUN_Z * duck + SLIDE_GUN_Z * slide;
    this._gunOffRX = dip * BOB_PITCH * amp + SPRINT_GUN_RX * carry
      + CROUCH_GUN_RX * duck + SLIDE_GUN_RX * slide;
    this._gunOffRY = SPRINT_GUN_RY * carry + SLIDE_GUN_RY * slide;
    // Rolls INTO the sway - the weapon leans the way it is travelling, which
    // is what turns two straight-line offsets into an arc.
    this._gunOffRZ = -sw * BOB_ROLL * amp + SPRINT_GUN_RZ * carry
      + SLIDE_GUN_RZ * slide;
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
  /**
   * CROUCH, SLIDE, AND THE ONE BUTTON THAT IS BOTH.
   *
   * ON THE GROUND the press is read as an EDGE, and what it does depends
   * entirely on what the player was already doing: at a sprint it opens a
   * slide, anywhere else it flips the crouch. A slide, once open, ignores the
   * button entirely - see the note on SLIDE_TIME for why it runs to its own
   * clock and why it ends standing.
   *
   * IN THE AIR it is read as a HOLD, and it buys a slide on the landing rather
   * than a crouch on the spot - see SLIDE_BUFFER. That is the one place in
   * here the button means something the player cannot see happen immediately,
   * and it is why the branch order below is what it is: a landing spends what
   * the air press bought before the button gets another say.
   *
   * `f` and `s` are the movement axes update() already resolved, so the stick
   * and the keys steer a slide identically.
   */
  _updateCrouch(dt, input, f, s) {
    const moving = (f !== 0 || s !== 0);
    const want = !!input.crouch;
    const edge = want && !this._prevCrouch;
    this._prevCrouch = want;

    // SPRINT CANCELS THE CROUCH. A crouch is a latch, and the only way out of
    // it used to be the same button that got in - so a player who dropped into
    // cover and then wanted to leave had to remember to un-press something
    // before the run would start. Reaching for the sprint button IS that
    // decision, so it stands the player up on the spot and _updateSprint,
    // which runs immediately after this and refuses a run while `crouching` is
    // set, lets the run start on this very frame rather than the next one.
    //
    // ON THE EDGE, not on the hold, and for the same reason the crouch itself
    // is: a player already holding sprint could otherwise never crouch at all.
    // A slide is left alone - it owns its own velocity and ends standing.
    const sprintWant = !!input.sprint;
    const sprintEdge = sprintWant && !this._prevSprint;
    this._prevSprint = sprintWant;
    if (sprintEdge && this.crouching) this.crouching = false;

    // The air buffer ages wherever the player is. See SLIDE_BUFFER.
    if (this._slideBuf > 0) this._slideBuf = Math.max(0, this._slideBuf - dt);

    if (this.sliding) {
      this.slideT -= dt;
      // Paid for out of the sprint bar, and it can empty it - a slide run onto
      // an empty bar ends where the stamina does, with the same lockout a
      // sprint run dry gets. The hold is refreshed every frame for the same
      // reason the sprint refreshes it: the bar must not start climbing back
      // during the move it is paying for.
      this.stamina -= SLIDE_DRAIN * this.mods.staminaDrain * dt;
      this._staminaHold = STAMINA_DELAY;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.staminaLocked = true;
        this.slideT = 0;
      }
      // A LITTLE steering, applied to the heading rather than to the velocity,
      // so the slide keeps its speed through the turn.
      if (moving) {
        const len = Math.hypot(f, s);
        const sinY = Math.sin(this.yaw);
        const cosY = Math.cos(this.yaw);
        const wx = (-sinY * (f / len) + cosY * (s / len));
        const wz = (-cosY * (f / len) - sinY * (s / len));
        steerFlat(this.slideDX, this.slideDZ, wx, wz, SLIDE_STEER * dt, _steer);
        this.slideDX = _steer.x;
        this.slideDZ = _steer.z;
      }
      // Off a ledge is off a slide. The jump out of one is handled in update()
      // and has already ended it by the time this sees the frame, so this is
      // only about falling.
      if (this.slideT <= 0 || !this.onGround) this._endSlide();
    } else if (this.onGround && this._slideBuf > 0) {
      // TOUCHDOWN ON A BUFFERED PRESS. This is the sprint-jump-crouch dive
      // arriving, and it is checked BEFORE the button because the press that
      // bought it happened in the air and may have been let go of since.
      //
      // Spent unconditionally, whether or not the slide can actually open: a
      // buffer left standing after a landing that failed the stamina test
      // would fire on the next one, and a slide the player did not just ask
      // for is worse than a slide they did not get.
      this._slideBuf = 0;
      if (this._canSlide(moving, false)) this._startSlide(f, s);
      // A landing with nothing left to slide on is a landing in cover. The
      // player pressed crouch and they get a crouch, which is what the button
      // did before this branch existed.
      else this.crouching = true;
    } else if (!this.onGround && want && this._groundRun) {
      // IN THE AIR, HAVING JUMPED OUT OF A RUN. Nothing to slide along yet,
      // so the press is kept rather than spent - see SLIDE_BUFFER.
      //
      // Gated on `_groundRun` and not on anything measured right now, for a
      // reason worth stating: neither live speed nor `sprinting` survives
      // the jump. A player who lets go of the sprint key at the apex is at
      // walking pace by the time they press crouch, and they have obviously
      // still just jumped out of a sprint. What earns the slide is the
      // takeoff, so the takeoff is what is remembered.
      //
      // The posture is deliberately NOT changed here. A crouch in mid-air
      // would take the crouch speed multiplier with it and cut the very
      // launch the player is trying to convert; the tuck they are asking for
      // is the slide, and it happens on the floor.
      //
      // Read off the HELD button rather than off its edge, which is the
      // other half of making this feel like a move rather than a trick: the
      // window is refreshed for as long as the button is down, so a player
      // who holds crouch through the descent lands in a slide whenever they
      // land, however long the fall was. The buffer is what a TAP buys.
      this._slideBuf = SLIDE_BUFFER;
    } else if (edge) {
      // THE RUN IS WHAT MAKES IT A SLIDE. Everything else is a toggle.
      if (this._canSlide(moving, true)) this._startSlide(f, s);
      else this.crouching = !this.crouching;
    }

    // The camera and the two gun blends, all on one ease. `crouching` and
    // `sliding` are exclusive, so the target is a straight three-way pick.
    const wantEye = this.sliding ? SLIDE_EYE : (this.crouching ? CROUCH_EYE : STAND_EYE);
    const k = Math.min(1, dt / CROUCH_POSE_TIME);
    this.eyeH += (wantEye - this.eyeH) * k;
    this._crouchPose += (((this.crouching || this.sliding) ? 1 : 0) - this._crouchPose) * k;
    this._slidePose += ((this.sliding ? 1 : 0) - this._slidePose) * k;
  }

  /**
   * Whether a slide can OPEN this frame. Ground under the player, a direction
   * to go in, and stamina to spend, always.
   *
   * `run` is whether the sprint that pays for it has to be happening right
   * now. True for a press made on the ground - there, the run IS the input
   * that distinguishes a slide from a crouch. False for one buffered in the
   * air, where the run was the one the player jumped out of and demanding it
   * still be held would fail exactly the players who did the move properly.
   */
  _canSlide(moving, run) {
    return this.onGround && moving
      && !this.staminaLocked && this.stamina >= SLIDE_MIN_STAMINA
      && (!run || this.sprinting);
  }

  // Opens a slide along the direction the player is currently moving. The
  // crouch latch is cleared rather than set: a slide is not a crouch that
  // happens to be fast, and it has to be able to end standing.
  _startSlide(f, s) {
    const len = Math.hypot(f, s) || 1;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    this.slideDX = (-sinY * (f / len) + cosY * (s / len));
    this.slideDZ = (-cosY * (f / len) - sinY * (s / len));
    this.sliding = true;
    this.crouching = false;
    this.slideT = SLIDE_TIME;
    this.slideFx = true;
    this._slideBuf = 0;
  }

  // ENDS STANDING. The envelope has already brought the speed down to the
  // walk by the time this runs, so there is nothing to damp - the player is
  // simply back on their own feet, upright, at the pace they would have had.
  _endSlide() {
    this.sliding = false;
    this.slideT = 0;
  }

  _updateSprint(dt, input, f, s) {
    const moving = (f !== 0 || s !== 0);
    const wants = !!input.sprint && moving;
    this.sprinting = wants
      && !this.staminaLocked
      && this.stamina > 0
      && !input.shoot
      && !input.aim
      // SEVEN THINGS NOW. A slide is not a run - it owns the velocity itself
      // and pays its own stamina - and a crouch is the gear below a walk, so
      // neither may report as sprinting or the bar would be billed twice.
      && !this.sliding
      && !this.crouching
      && this.now >= this.noSprintUntil;

    // The accuracy penalty, and its tail. It ramps up over the run's first
    // fifth of a second and bleeds off over a third of one afterwards, so the
    // cone the gun fires through arrives with the run and then remembers it
    // for a moment - see the notes on SPRINT_SPREAD_RISE and _FADE.
    this.sprintFade = this.sprinting
      ? Math.min(1, this.sprintFade + dt / SPRINT_SPREAD_RISE)
      : Math.max(0, this.sprintFade - dt / SPRINT_SPREAD_FADE);

    if (this.sprinting) {
      this.stamina -= STAMINA_DRAIN * this.mods.staminaDrain * dt;
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
    this.stamina = Math.min(
      STAMINA_MAX, this.stamina + STAMINA_REGEN * this.mods.staminaRegen * dt
    );
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
  /**
   * THE GUN, SWUNG AS A CLUB.
   *
   * Three legs on one clock: back and over (the wind-up), across and through
   * (the strike), then home. The poses are constants at the top of the file
   * and every leg is smoothed at both ends, so there is no frame where the
   * weapon changes direction abruptly - the arm has weight, and a linear ramp
   * is exactly what says it does not.
   *
   * Written as OFFSETS, added to whatever the aim blend, the bob and the
   * reload left behind. That is what lets a swing be thrown mid-reload or
   * mid-sprint without either animation having to know the other exists.
   */
  _animateMelee() {
    if (this.meleeAnim <= 0) return;
    const u = 1 - this.meleeAnim / MELEE_ANIM;
    let k;
    let ax;
    let ay;
    let az;
    let arx;
    let ary;
    let arz;
    if (u < MELEE_WIND) {
      // Rest -> wound up. Fast, and the shortest of the three: the wind-up is
      // the tell, not the move.
      k = smooth(u / MELEE_WIND);
      ax = MELEE_WIND_X * k;
      ay = MELEE_WIND_Y * k;
      az = MELEE_WIND_Z * k;
      arx = MELEE_WIND_RX * k;
      ary = MELEE_WIND_RY * k;
      arz = MELEE_WIND_RZ * k;
    } else if (u < MELEE_STRIKE) {
      // Wound up -> through the target. This is the leg the damage lands on.
      k = smooth((u - MELEE_WIND) / (MELEE_STRIKE - MELEE_WIND));
      ax = MELEE_WIND_X + (MELEE_HIT_X - MELEE_WIND_X) * k;
      ay = MELEE_WIND_Y + (MELEE_HIT_Y - MELEE_WIND_Y) * k;
      az = MELEE_WIND_Z + (MELEE_HIT_Z - MELEE_WIND_Z) * k;
      arx = MELEE_WIND_RX + (MELEE_HIT_RX - MELEE_WIND_RX) * k;
      ary = MELEE_WIND_RY + (MELEE_HIT_RY - MELEE_WIND_RY) * k;
      arz = MELEE_WIND_RZ + (MELEE_HIT_RZ - MELEE_WIND_RZ) * k;
    } else {
      // And back. The longest leg, because recovery is what the swing COSTS -
      // the gun being out of position is the price of having thrown it.
      k = 1 - smooth((u - MELEE_STRIKE) / (1 - MELEE_STRIKE));
      ax = MELEE_HIT_X * k;
      ay = MELEE_HIT_Y * k;
      az = MELEE_HIT_Z * k;
      arx = MELEE_HIT_RX * k;
      ary = MELEE_HIT_RY * k;
      arz = MELEE_HIT_RZ * k;
    }
    const g = this.gun;
    g.position.x += ax;
    g.position.y += ay;
    g.position.z += az;
    g.rotation.x += arx;
    g.rotation.y += ary;
    g.rotation.z += arz;
  }

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


  applyCamera() {
    // Clamped on the SUM, not on pitch alone: the mouse handler already holds
    // pitch inside +-1.5, and letting the recoil offset push past that would
    // roll the view over the top at the exact moment the player is looking up.
    const aim = Math.max(-1.5, Math.min(1.5, this.pitch + this.recoilPitch));
    this.camera.rotation.set(aim, this.yaw, 0);
    this.camera.position.set(this.pos.x, this.pos.y + this.eyeH - this._stepLag, this.pos.z);
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
  // for two volleys, which made it the only damage passive item in the pool
  // that was free - +20% damage AND double the rounds on target for nothing.
  // The drawback on the card was never meant to be "none": a shot that fires
  // twice pays twice, and a build that wants both pays six.
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
    // OPENING SALVO. Inside the window at the top of a wave the trigger simply
    // does not bill: the magazine is never touched, so nothing empties and no
    // reload interrupts the ten seconds. Tested before the empty-magazine
    // branch as well as before Belt Feed: a wave that starts on an empty gun
    // must not spend its window standing through a reload, and a free shot
    // must not quietly take its round off the reserve instead.
    if (this.mods.salvoTime > 0 && this.salvoEnd > this.now) {
      this.lastShotCost = 0;
      const effRate =
        w.fireRate * this.fireRateMult * this.itemRateMult * this.mods.fireRate;
      this.fireCd = 1 / effRate;
      this.kick = w.kick;
      this.noSprintUntil = this.now + SPRINT_FIRE_LOCK;
      this.recoilPitch +=
        (w.recoil + Math.random() * w.recoil * 0.6) * this.mods.recoilMult * this.shakeScale;
      this._bloomShot();
      return 'shot';
    }
    if (this.mag <= 0) {
      this.startReload();
      return 'empty';
    }
    // Belt Feed takes the round straight off the reserve now and then, which
    // is worth more than the round itself: it is a reload you never have to
    // stand through. The trigger's full cost comes out of whichever pool pays.
    const cost = this.shotCost;
    this.lastShotCost = cost;
    if (this.mods.beltFeed > 0 && this.reserveAmmo >= cost
      && Math.random() < this.mods.beltFeed) {
      this.reserveAmmo -= cost;
    } else {
      // A shot that cannot afford its full cost still fires and empties the
      // magazine; refusing it would jam the gun on one leftover round.
      this.mag = Math.max(0, this.mag - cost);
    }
    const effectiveFireRate =
      w.fireRate * this.fireRateMult * this.itemRateMult * this.mods.fireRate;
    this.fireCd = 1 / effectiveFireRate;
    this.kick = w.kick;
    // A round fired is a commitment to being somewhere: it walks the player
    // out of a sprint and keeps them out of it long enough that tapping a
    // semi-automatic trigger cannot be done at a run.
    this.noSprintUntil = this.now + SPRINT_FIRE_LOCK;
    this.recoilPitch +=
      (w.recoil + Math.random() * w.recoil * 0.6) * this.mods.recoilMult * this.shakeScale;
    this._bloomShot();
    if (this.mag === 0) this.startReload();
    return 'shot';
  }

  // ONE ROUND'S WORTH OF SLOP, and the hold that keeps it there. Called from
  // both branches of tryShoot - the free Opening Salvo round blooms exactly
  // like a paid one, because the cone is about the gun being fired and not
  // about who is paying for the ammunition.
  //
  // The hold is read off `fireCd`, which the caller has already set to this
  // shot's interval: a weapon holding its trigger down refills the hold every
  // cycle and never recovers, and one that stops recovers half a cycle later.
  // That is the whole "continuous fire" test, and it costs no extra state.
  _bloomShot() {
    this.bloom = Math.min(1, this.bloom + BLOOM_PER_SHOT);
    this._bloomHold = this.now + Math.max(BLOOM_HOLD_MIN, this.fireCd * 1.5);
  }

  // Arms a swing. The COOLDOWN is here and the hit is main.js's - see
  // tryMelee there - so the animation and the damage cannot disagree about
  // whether a swing happened.
  //
  // No `kick`: the recoil offset used to stand in for an animation that did
  // not exist, and _animateMelee moves the whole weapon now. Leaving both in
  // would punch the gun backwards through its own wind-up.
  tryMelee() {
    if (this.meleeCd > 0) return false;
    this.meleeCd = 0.6;
    this.meleeActive = 0.15;
    this.meleeAnim = MELEE_ANIM;
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
    let d = base * this.damageMult * this.mods.damage * this.statusDamageMult()
      * this.itemDamageMult;
    if (this.mods.steady > 0) {
      d *= 1 + this.mods.steady * this.stillness;
    }
    // Berserker pays on health MISSING, so it is worth nothing at full health
    // and everything at one. Read live rather than cached: it has to move with
    // the health bar, including upward as Vampiric heals you back out of it.
    // Hot Streak's live bonus. Signed: a player who has been missing is dealing
    // LESS than base here, which is the whole trade the passive item offers.
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