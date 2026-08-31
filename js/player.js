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
  regenRate: 1,         // health per second once regenerating
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
  devilAlways: 0,       // Demonic Presence: the Devil appears after every wave
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
// Mean of the shape is 0.5 by construction (both halves are smoothstep), so
// the distance covered is DASH_SPEED * DASH_TIME * 0.5 = ~9.5m: twice the 4.7m
// of the flat version, which is the other half of the ask.
const DASH_TIME = 0.45;
const DASH_SPEED = 42;
// Fraction of the window spent ramping UP. Short: the dash still has to answer
// a slam the frame it is pressed, so most of the curve is the exit.
const DASH_IN = 0.22;
const DASH_RECHARGE = 2.5;

// The dash's speed envelope at `u` (0..1 through the window), 0..1.
// smoothstep on both halves - a cubic with zero slope at each end, which is
// the same curve a cubic-bezier ease-in-out draws. Zero slope at u=1 is the
// part that matters: it is what makes the dash END smoothly instead of being
// switched off.
function dashShape(u) {
  const t = u < DASH_IN ? u / DASH_IN : 1 - (u - DASH_IN) / (1 - DASH_IN);
  return t * t * (3 - 2 * t);
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
const PLAYER_HEIGHT = 1.8;
// Evasion's window after a successful dodge, and what it multiplies speed by.
// Short on purpose: it is an escape from the hit you just avoided, not a
// standing movement upgrade.
const DODGE_TIME = 1.5;
const DODGE_SPEED = 1.4;
// Horizontal speed at which Steady Aim's bonus has fully decayed. Well under
// BASE_SPEED: the upgrade pays for standing your ground, not for strolling.
const STILL_SPEED = 3;

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
    this.onGround = false;
    this.lastHurt = -99;
    this.kick = 0;
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

  // Double Dash. `code` is the raw key that was double-tapped; the direction is
  // whatever that key means RIGHT NOW, rotated by yaw exactly the way update()
  // rotates held movement, so a dash always goes where the same key would have
  // walked. Returns whether a charge was actually spent.
  tryDash(code, time) {
    if (this.mods.dashCharges <= 0 || this.dashLeft <= 0) return false;
    const f = code === 'KeyW' ? 1 : code === 'KeyS' ? -1 : 0;
    const sd = code === 'KeyD' ? 1 : code === 'KeyA' ? -1 : 0;
    if (!f && !sd) return false;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // Stored as a unit DIRECTION, not a velocity: the speed along it is
    // whatever dashShape says this frame.
    this.dashDX = -sinY * f + cosY * sd;
    this.dashDZ = -cosY * f - sinY * sd;
    const len = Math.hypot(this.dashDX, this.dashDZ) || 1;
    this.dashDX /= len;
    this.dashDZ /= len;
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
  update(dt, input, obstacles, time) {
    // Published for getEffectiveDamage(), which has no clock of its own and is
    // called from several places that have none to give it.
    this.now = time;
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

    if (this.mods.ammoRegen > 0 && this.reserveAmmo < this.maxReserve) {
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
    const frozen = time < this.frozenUntil;
    const f = frozen ? 0 : (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = frozen ? 0 : (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // Kept SEPARATE from this.vel, and that separation is what makes the dash
    // blend below honest. The damp branch feeds on the previous frame's value,
    // so if the dash wrote into this.vel the decaying half of its own envelope
    // would be fed back in as "the player's movement" on the next frame and
    // integrate into a coast three times as long as the dash. moveVX/moveVZ
    // are only ever what the KEYS asked for.
    if (f || s) {
      const len = Math.hypot(f, s);
      const fn = f / len;
      const sn = s / len;
      // Evasion's reward for a dodge: a burst of speed to leave with. Rage
      // stacks multiplicatively with it, because both are short windows the
      // player earned and neither should quietly swallow the other.
      const speed = BASE_SPEED * this.mods.moveMult * this.rageSpeedMult
        * (time < this.dodgeEnd ? DODGE_SPEED : 1);
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

    // Regen after 4s without damage. The second branch bleeds off overheal
    // (health above max, from a health pickup) back down to max.
    if (time - this.lastHurt > this.mods.regenDelay && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.mods.regenRate * dt);
    } else if (this.health > this.maxHealth) {
      this.health = Math.max(this.maxHealth, this.health - 5 * dt);
    }

    this.kick *= Math.pow(0.0001, dt);
    this.gun.position.z = this.gunBaseZ + this.kick;
    this._animateReload();
    this.applyCamera();
    return reloadFinished;
  }

  // Reload animation. The gun drops out of frame, rolls over as if a magazine
  // were being pulled, and comes back up - a full arc over the reload, driven
  // off the same timer the reload itself uses so it always matches the real
  // duration however much Speed Loader has cut it. Written every frame while
  // idle too, so the transforms are cleared the instant a reload is cancelled
  // by a weapon swap.
  _animateReload() {
    const g = this.gun;
    const total = this.reloadTime;
    if (this.reloading <= 0 || total <= 0) {
      g.position.y = this.gunBaseY;
      g.rotation.x = 0;
      g.rotation.z = 0;
      return;
    }
    const t = 1 - this.reloading / total;
    // One hump: nothing at the ends, everything in the middle, so the gun is
    // back in the firing pose exactly as the last round seats.
    const arc = Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
    g.position.y = this.gunBaseY - 0.16 * arc;
    g.rotation.x = 0.55 * arc;
    g.rotation.z = -0.35 * arc;
  }

  // 0 while idle, otherwise how far through the current reload we are. Drives
  // the ring around the crosshair.
  get reloadProgress() {
    const total = this.reloadTime;
    if (this.reloading <= 0 || total <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - this.reloading / total));
  }

  applyCamera() {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
    this.camera.position.set(this.pos.x, this.pos.y + 1.7, this.pos.z);
  }

  // Returns false when a reload is pointless (already reloading, mag full, or
  // no reserve), so callers can skip the sound.
  startReload() {
    if (this.reloading > 0 || this.mag === this.magSize || this.reserveAmmo <= 0) return false;
    this.reloading = this.reloadTime;
    return true;
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
    if (!w.auto && !triggerFresh) return null;
    if (this.mag <= 0) {
      this.startReload();
      return 'empty';
    }
    // Belt Feed takes the round straight off the reserve now and then, which
    // is worth more than the round itself: it is a reload you never have to
    // stand through. Triple Tap's cost comes out of whichever pool pays.
    if (this.mods.beltFeed > 0 && this.reserveAmmo >= this.mods.ammoPerShot
      && Math.random() < this.mods.beltFeed) {
      this.reserveAmmo -= this.mods.ammoPerShot;
    } else {
      // A shot that cannot afford its full cost still fires and empties the
      // magazine; refusing it would jam the gun on one leftover round.
      this.mag = Math.max(0, this.mag - this.mods.ammoPerShot);
    }
    const effectiveFireRate =
      w.fireRate * this.fireRateMult * this.mods.fireRate * this.bloodlustMult();
    this.fireCd = 1 / effectiveFireRate;
    this.kick = w.kick;
    this.pitch = Math.min(1.5, this.pitch + w.recoil + Math.random() * w.recoil * 0.6);
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
    let d = base * this.damageMult * this.mods.damage;
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
    if (this.carnageStacks > 0) d *= 1 + this.mods.carnageStep * this.carnageStacks;
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