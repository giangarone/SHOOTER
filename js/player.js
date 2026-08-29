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
};

// The only ground speed there is. Sprint used to sit on top of a 6.5 walk;
// holding a key to move at the speed the game is balanced around was a tax
// rather than a decision, so the walk is gone and this is what everyone gets.
const BASE_SPEED = 10;
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
    this.maxReserve = 300;
    this.reserveAmmo = 90;
    this.fireCd = 0;
    // Breach Round: set by a finished reload, spent by the next shot.
    this.breachReady = false;
    // Evasion's speed boost, set by main.js when a hit is dodged.
    this.dodgeEnd = 0;
    // EXTERNAL DRAG, metres per second, written by whatever is pulling the
    // player around - Maw's gravity well. It cannot be an addition to `vel`:
    // update() ASSIGNS vel.x/z outright whenever a movement key is held, so a
    // velocity written from outside would be thrown away on the same frame the
    // player pressed W. It is applied straight to `pos` instead, and consumed
    // every frame, so a puller has to keep asking for it.
    this.extX = 0;
    this.extZ = 0;
    this.reloading = 0;
    this.onGround = false;
    this.lastHurt = -99;
    this.kick = 0;
    this.meleeCd = 0;
    this.meleeActive = 0;
    this.damageMult = 1;
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
  get maxHealth() {
    return Math.max(10, Math.round((this.baseMaxHealth + this.mods.maxHpBonus) * this.mods.maxHpMult));
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

  // Rebuilds the whole stat block from the owned upgrade list. Always a full
  // replay from DEFAULT_MODS rather than an incremental apply - see the note
  // at the top of upgrades.js for why that matters.
  rebuildMods() {
    this.mods = { ...DEFAULT_MODS };
    for (const [id, n] of Object.entries(this.upgrades)) {
      const def = UPGRADES[id];
      if (def && n > 0) def.apply(this.mods, n);
    }
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
    this.extX = 0;
    this.extZ = 0;
    this.pos.set(0, 0, 8);
    this.vel.set(0, 0, 0);
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
    this.fireCd -= dt;
    if (this.meleeCd > 0) this.meleeCd -= dt;
    if (this.meleeActive > 0) this.meleeActive -= dt;

    if (this.damageBoostEnd > 0 && time >= this.damageBoostEnd) {
      this.damageMult = 1;
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
    const f = (input.forward ? 1 : 0) - (input.back ? 1 : 0);
    const s = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (f || s) {
      const len = Math.hypot(f, s);
      const fn = f / len;
      const sn = s / len;
      // Evasion's reward for a dodge: a burst of speed to leave with.
      const speed = BASE_SPEED * this.mods.moveMult * (time < this.dodgeEnd ? DODGE_SPEED : 1);
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      this.vel.x = (-sinY * fn + cosY * sn) * speed;
      this.vel.z = (-cosY * fn - sinY * sn) * speed;
    } else {
      const damp = Math.pow(0.0001, dt);
      this.vel.x *= damp;
      this.vel.z *= damp;
    }

    this.vel.y -= 22 * dt;
    if (input.jump && this.onGround) {
      this.vel.y = 9;
      this.onGround = false;
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
    resolveCircle(this.pos, 0.4, obstacles);
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
    if (this.mods.berserk > 0) {
      d *= 1 + this.mods.berserk * (1 - this.health / this.maxHealth);
    }
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