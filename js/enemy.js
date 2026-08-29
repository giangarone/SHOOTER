// Enemies and enemy projectiles.
//
// An Enemy owns a THREE.Group (its model) and a `pos` vector that is the
// source of truth for its location; the group follows pos each update. Like
// the player, pos is at floor level. Enemies never leave the ground plane -
// they slide around obstacles rather than climbing them.
//
// Behaviour by type:
//   chaser/splitter/tank  close to melee range, wind up, then hit
//   shooter/sniper        hold a preferred distance, strafe, fire projectiles
//   bomber                holds distance and lobs arcing grenades
// Splitters are ordinary enemies here; main.js is what spawns their children
// when one dies.
//
// MOVEMENT IS PATH-AWARE. `nx, nz` inside update() is the straight line to the
// player, and is what an enemy AIMS and ATTACKS along; `px, pz` is the heading
// it WALKS along, which comes from the shared navigation grid (nav.js) and
// bends around pillars and crates. Retreats - a feared enemy, a shooter
// backing off - reverse the straight line instead: running away has no
// destination to route to.
//
// LIFECYCLE: a killed enemy sets `dead` and main.js removes it from the scene
// and calls dispose(). Anything added to an enemy that allocates a GPU
// resource per instance must be freed there, or it leaks for the whole session.
//
// ctx passed to update() is built once per frame in main.js and carries the
// player, the live enemy list, obstacles, game time, and callbacks for
// damaging the player and spawning projectiles.

import * as THREE from 'three';
import { resolveCircle, pointInObstacle } from './utils.js';

// Base stats before per-wave scaling (waves.js supplies the multipliers).
// `scale` sizes the whole model, including its hitbox.
export const ENEMY_TYPES = {
  chaser: { hp: 42, speed: 3.4, damage: 12, score: 100, color: 0xff3b30, eye: 0xffe08a, scale: 1 },
  shooter: { hp: 28, speed: 2.7, damage: 8, score: 150, color: 0xb14aed, eye: 0x4ef3ff, scale: 1.08 },
  tank: { hp: 180, speed: 1.8, damage: 25, score: 300, color: 0xff6b00, eye: 0xffaa00, scale: 1.5 },
  sniper: { hp: 18, speed: 2.2, damage: 15, score: 200, color: 0x00ff88, eye: 0x88ffcc, scale: 0.9 },
  splitter: { hp: 30, speed: 3.0, damage: 10, score: 120, color: 0xff00aa, eye: 0xff88dd, scale: 1.0 },
  bomber: { hp: 35, speed: 2.0, damage: 18, score: 180, color: 0xff4400, eye: 0xff8844, scale: 1.1 },
};

// Geometries and non-animated materials are built once and shared by every
// enemy of that type. Only the two materials an enemy mutates at runtime (body
// flash, eye glow) are per-instance, and dispose() frees those on death.
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const SHARED_MATS = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.4, metalness: 0.6 }),
  tankPlate: new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.5, metalness: 0.6 }),
  sniperBarrel: new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.3, metalness: 0.8 }),
  sniperScope: new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.2, metalness: 0.9 }),
  splitterCore: new THREE.MeshStandardMaterial({
    color: ENEMY_TYPES.splitter.color, emissive: ENEMY_TYPES.splitter.color, emissiveIntensity: 1.2,
    roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.8,
  }),
  splitterRing: new THREE.MeshStandardMaterial({
    color: ENEMY_TYPES.splitter.eye, emissive: ENEMY_TYPES.splitter.eye, emissiveIntensity: 0.8,
  }),
  bomberShell: new THREE.MeshStandardMaterial({ color: 0x2a2515, roughness: 0.5, metalness: 0.4 }),
  bomberPin: new THREE.MeshStandardMaterial({ color: 0xffd600, emissive: 0xffd600, emissiveIntensity: 1.5 }),
  hitbox: new THREE.MeshBasicMaterial({ visible: false }),
};

const BODY_FLASH_HEX = 0xffffff;
const BODY_FLASH_INTENSITY = 0.9;
const BODY_BASE_INTENSITY = 0.18;

// ---- status effects ------------------------------------------------------
// Applied by the single-tier mutations in upgrades.js. A hit REFRESHES a
// status, it never stacks one: mutations have no second level, so there is no
// stronger poison to express. Duration is seconds remaining, counted down in
// update().
//
// STATUS_ORDER is tint priority. An enemy can carry several statuses at once,
// but it can only wear one colour, so the first active entry wins and the body
// holds that colour steadily - a body that alternated between green and orange
// every frame would read as a rendering fault, not as information.
const STATUS_ORDER = ['freeze', 'burn', 'poison', 'slow', 'fear'];
const STATUS_TINT = {
  freeze: 0xcfeaff,
  burn: 0xff7a18,
  poison: 0x39d353,
  slow: 0x63b3ff,
  fear: 0xb06bff,
};
// Well above BODY_BASE_INTENSITY (0.18) so an afflicted enemy is obvious in a
// crowd, and well below BODY_FLASH_INTENSITY (0.9) so it never reads as a hit.
const STATUS_INTENSITY = 0.55;
// Seconds between the two-particle drip that marks an afflicted enemy. The
// tint alone is easy to miss on a distant enemy; the drip is what catches the
// eye. Two particles per enemy per 0.3s stays far inside the 1024-slot buffer.
const DRIP_INTERVAL = 0.3;
const SLOW_FACTOR = 0.5;
// Scratch for the drip's spawn point. Module-level and reused: the drip runs
// for every afflicted enemy several times a second.
const _dripAt = new THREE.Vector3();
// Scratch for the navigation heading. Module-level and consumed immediately:
// every enemy asks for one every frame.
const _steer = { x: 0, z: 0 };
// Petrify's reward: a frozen enemy cannot act, and takes half again as much.
const FREEZE_VULN = 1.5;

let idSeq = 0;

export class Enemy {
  constructor(type, pos, hpScale, speedScale, dmgScale) {
    const def = ENEMY_TYPES[type];
    const s = def.scale;
    this.id = ++idSeq;
    this.type = type;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * speedScale;
    this.damage = def.damage * dmgScale;
    this.score = def.score;
    this.radius = 0.5;
    this.colorHex = def.color;
    this.eyeBase = def.eye;
    this.pos = pos.clone();
    this.attackCd = 0.8 + Math.random();
    this.windup = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    this.flash = 0;
    this.dead = false;
    this._flashOn = false;
    this._eyeAlert = false;
    // Status timers, seconds remaining. Every key in STATUS_ORDER is present
    // from birth so the tick never has to test for existence.
    this.status = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    // Damage-over-time rates, kept per source so a player carrying both Venom
    // and Incendiary gets both, rather than the larger of the two.
    this._dps = { poison: 0, burn: 0 };
    this._dotAcc = 0;
    this._dripAcc = 0;
    // Last emissive colour written to bodyMat, so the tick can skip the
    // setHex() when nothing changed.
    this._tintHex = def.color;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: def.color, roughness: 0.4, metalness: 0.3,
      emissive: def.color, emissiveIntensity: BODY_BASE_INTENSITY,
    });
    const body = new THREE.Mesh(
      geo('body:' + type, () => new THREE.CapsuleGeometry(0.34 * s, 0.55 * s, 4, 10)),
      this.bodyMat
    );
    body.position.y = 0.75 * s;
    body.castShadow = true;
    this.group.add(body);

    this.eyeMat = new THREE.MeshBasicMaterial({ color: def.eye });
    const eyeGeo = geo('eye', () => new THREE.SphereGeometry(0.07, 8, 8));
    const e1 = new THREE.Mesh(eyeGeo, this.eyeMat);
    e1.position.set(-0.13 * s, 1.05 * s, -0.27 * s);
    const e2 = new THREE.Mesh(eyeGeo, this.eyeMat);
    e2.position.set(0.13 * s, 1.05 * s, -0.27 * s);
    this.group.add(e1, e2);

    if (type === 'shooter') {
      const barrel = new THREE.Mesh(
        geo('shooterBarrel', () => new THREE.BoxGeometry(0.12, 0.12, 0.55)),
        SHARED_MATS.gunmetal
      );
      barrel.position.set(0.22, 0.8, -0.32);
      this.group.add(barrel);
    } else if (type === 'tank') {
      // Shoulders reuse the body material so they flash with the rest of the body.
      const shoulderGeo = geo('tankShoulder', () => new THREE.BoxGeometry(0.25, 0.35, 0.25));
      const shoulderL = new THREE.Mesh(shoulderGeo, this.bodyMat);
      shoulderL.position.set(-0.35 * s, 0.95 * s, 0);
      const shoulderR = new THREE.Mesh(shoulderGeo, this.bodyMat);
      shoulderR.position.set(0.35 * s, 0.95 * s, 0);
      this.group.add(shoulderL, shoulderR);
      const plate = new THREE.Mesh(
        geo('tankPlate', () => new THREE.BoxGeometry(0.7 * s, 0.12, 0.4 * s)),
        SHARED_MATS.tankPlate
      );
      plate.position.set(0, 0.6 * s, -0.25 * s);
      this.group.add(plate);
    } else if (type === 'sniper') {
      const longBarrel = new THREE.Mesh(
        geo('sniperBarrel', () => new THREE.CylinderGeometry(0.05, 0.06, 0.9, 8)),
        SHARED_MATS.sniperBarrel
      );
      longBarrel.rotation.x = Math.PI / 2;
      longBarrel.position.set(0, 0.85 * s, -0.6 * s);
      this.group.add(longBarrel);
      const scope = new THREE.Mesh(
        geo('sniperScope', () => new THREE.BoxGeometry(0.1, 0.1, 0.2)),
        SHARED_MATS.sniperScope
      );
      scope.position.set(0, 0.98 * s, -0.2 * s);
      this.group.add(scope);
      const smallEyeGeo = geo('eyeSmall', () => new THREE.SphereGeometry(0.05, 6, 6));
      const e1s = new THREE.Mesh(smallEyeGeo, this.eyeMat);
      e1s.position.set(-0.1 * s, 1.1 * s, -0.3 * s);
      const e2s = new THREE.Mesh(smallEyeGeo, this.eyeMat);
      e2s.position.set(0.1 * s, 1.1 * s, -0.3 * s);
      this.group.add(e1s, e2s);
    } else if (type === 'splitter') {
      const core = new THREE.Mesh(
        geo('splitterCore', () => new THREE.OctahedronGeometry(0.12 * s, 0)),
        SHARED_MATS.splitterCore
      );
      core.position.set(0, 0.85 * s, 0);
      this.coreMesh = core;
      const ring = new THREE.Mesh(
        geo('splitterRing', () => new THREE.TorusGeometry(0.25 * s, 0.03, 8, 16)),
        SHARED_MATS.splitterRing
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.6 * s;
      this.ringMesh = ring;
      this.group.add(core, ring);
    } else if (type === 'bomber') {
      const grenade = new THREE.Mesh(
        geo('bomberShell', () => new THREE.SphereGeometry(0.18, 8, 8)),
        SHARED_MATS.bomberShell
      );
      grenade.position.set(0.25 * s, 0.75 * s, -0.25 * s);
      const pin = new THREE.Mesh(
        geo('bomberPin', () => new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6)),
        SHARED_MATS.bomberPin
      );
      pin.position.set(0.25 * s, 0.9 * s, -0.25 * s);
      this.group.add(grenade, pin);
    } else {
      const jaw = new THREE.Mesh(
        geo('chaserJaw', () => new THREE.ConeGeometry(0.16, 0.3, 6)),
        this.bodyMat
      );
      jaw.rotation.x = -Math.PI / 2;
      jaw.position.set(0, 0.68, -0.34);
      this.group.add(jaw);
    }

    this.hitbox = new THREE.Mesh(
      geo('hitbox', () => new THREE.SphereGeometry(0.6, 8, 8)),
      SHARED_MATS.hitbox
    );
    this.hitbox.position.y = 0.8 * s;
    // Scale the hitbox with the model so big enemies are as easy to hit as they look.
    this.hitbox.scale.setScalar(s);
    this.hitbox.userData.enemy = this;
    this.group.add(this.hitbox);
    this.group.updateMatrixWorld(true);
  }

  // The hit flash and the status tint are the same two material properties, so
  // they must not both write them. The flash wins while it lasts; when it ends
  // it hands the body back to whatever status is active rather than assuming
  // the enemy's own colour.
  _setFlash(on) {
    if (this._flashOn === on) return;
    this._flashOn = on;
    if (on) {
      this.bodyMat.emissive.setHex(BODY_FLASH_HEX);
      this.bodyMat.emissiveIntensity = BODY_FLASH_INTENSITY;
    } else {
      this._tintHex = this._dominantTint();
      this.bodyMat.emissive.setHex(this._tintHex);
      this.bodyMat.emissiveIntensity =
        this._tintHex === this.colorHex ? BODY_BASE_INTENSITY : STATUS_INTENSITY;
    }
  }

  // The colour this enemy should be wearing right now: the highest-priority
  // active status, or its own colour when it is clean.
  _dominantTint() {
    for (const k of STATUS_ORDER) {
      if (this.status[k] > 0) return STATUS_TINT[k];
    }
    return this.colorHex;
  }

  /**
   * Applies a status effect. REFRESHES rather than stacks - see STATUS_ORDER.
   *
   * @param {string} kind  a key of STATUS_TINT
   * @param {number} dur   seconds; the longer of this and what is already on
   * @param {number} power damage per second, for 'poison' and 'burn' only
   */
  applyStatus(kind, dur, power = 0) {
    if (this.dead || !(kind in this.status)) return;
    this.status[kind] = Math.max(this.status[kind], dur);
    if (power > 0 && kind in this._dps) this._dps[kind] = Math.max(this._dps[kind], power);
  }

  // Movement speed after Cryo and Petrify. Every speed read inside update()
  // goes through this - a branch that used this.speed directly would keep
  // moving at full pace while visibly frozen.
  _effSpeed() {
    if (this.status.freeze > 0) return 0;
    return this.status.slow > 0 ? this.speed * SLOW_FACTOR : this.speed;
  }

  // Cryo slows the shots a slowed enemy fires as well as the enemy: a sniper
  // that still snapped a full-speed round out would read as unaffected.
  _projScale() {
    return this.status.slow > 0 ? 0.6 : 1;
  }

  // One status step: run the timers down, tick damage over time, keep the tint
  // current and drip a couple of particles. Called at the top of update().
  _tickStatus(dt, ctx) {
    let any = false;
    // Entropy. Under the threshold the timers simply stop running: what is
    // already on an enemy stays on it until it dies. It is deliberately a
    // hold rather than a refresh, so it can never apply a status the player
    // did not put there.
    const held = ctx.mods && ctx.mods.entropyBelow > 0
      && this.hp <= this.maxHp * ctx.mods.entropyBelow;
    for (const k of STATUS_ORDER) {
      if (this.status[k] <= 0) continue;
      if (held) {
        any = true;
        continue;
      }
      this.status[k] -= dt;
      if (this.status[k] <= 0) {
        this.status[k] = 0;
        if (k in this._dps) this._dps[k] = 0;
      } else {
        any = true;
      }
    }

    // Damage accrues as a float and is dealt in whole points, so a 12 dps
    // poison is twelve separate ticks a second rather than a fractional nibble
    // every frame. `silent` keeps it from firing the white hit flash, which
    // would strobe over the status tint for as long as the status lasts.
    const dps = (this.status.poison > 0 ? this._dps.poison : 0)
      + (this.status.burn > 0 ? this._dps.burn : 0);
    if (dps > 0) {
      this._dotAcc += dps * dt;
      if (this._dotAcc >= 1) {
        const whole = Math.floor(this._dotAcc);
        this._dotAcc -= whole;
        this.takeDamage(whole, true);
        if (this.dead) return;
      }
    }

    const tint = this._dominantTint();
    if (tint !== this._tintHex && !this._flashOn) {
      this._tintHex = tint;
      this.bodyMat.emissive.setHex(tint);
      this.bodyMat.emissiveIntensity = tint === this.colorHex ? BODY_BASE_INTENSITY : STATUS_INTENSITY;
    }

    if (!any) {
      this._dripAcc = 0;
      return;
    }
    this._dripAcc += dt;
    if (this._dripAcc >= DRIP_INTERVAL && ctx.effects) {
      this._dripAcc = 0;
      // At chest height, not at the feet: a drip on the floor is hidden by the
      // enemy itself from anywhere but point blank.
      _dripAt.set(this.pos.x, 1.0, this.pos.z);
      ctx.effects.burst(_dripAt, tint, 2, 0.8, 1.2, 0.45);
    }
  }

  _setEyeAlert(on) {
    if (this._eyeAlert === on) return;
    this._eyeAlert = on;
    this.eyeMat.color.setHex(on ? 0xffffff : this.eyeBase);
  }

  // Wind up a melee swing, then land it if the player is still in range.
  _meleeCycle(dt, dist, ctx, windupTime, startRange, hitRange, cooldown) {
    if (this.windup > 0) {
      this.windup -= dt;
      this._setEyeAlert(true);
      if (this.windup <= 0) {
        this._setEyeAlert(false);
        if (dist < hitRange) ctx.onHitPlayer(this.damage, this.pos);
        this.attackCd = cooldown;
      }
      return false;
    }
    this._setEyeAlert(false);
    if (dist < startRange && this.attackCd <= 0) {
      this.windup = windupTime;
      return false;
    }
    return true;
  }

  // One AI + movement step. Computes a desired velocity for this frame, adds
  // crowd separation, clamps it, moves, then resolves against obstacles.
  update(dt, ctx) {
    if (this.dead) return;
    this._tickStatus(dt, ctx);
    if (this.dead) return;   // a damage-over-time tick can finish it off
    const sp = this._effSpeed();
    const p = ctx.player.pos;
    const dx = p.x - this.pos.x;
    const dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const inv = 1 / Math.max(dist, 0.001);
    const nx = dx * inv;
    const nz = dz * inv;
    this.attackCd -= dt;

    // Walking heading: around the level rather than into it. Falls back to the
    // straight line when there is no grid, or no route through it.
    let px = nx;
    let pz = nz;
    if (ctx.nav && ctx.nav.steer(this.pos.x, this.pos.z, _steer)) {
      px = _steer.x;
      pz = _steer.z;
    }

    let vx = 0;
    let vz = 0;

    if (this.status.freeze > 0) {
      // Petrified: no movement, no attack, and any half-wound swing is lost.
      this.windup = 0;
      this._setEyeAlert(false);
    } else if (this.status.fear > 0) {
      // Terror: run from the player and do not attack. sp is unchanged, so a
      // feared enemy retreats as fast as it would have advanced.
      this.windup = 0;
      this._setEyeAlert(false);
      vx = -nx * sp;
      vz = -nz * sp;
    } else if (this.type === 'chaser') {
      if (this._meleeCycle(dt, dist, ctx, 0.45, 1.5, 2.2, 1.1)) {
        vx = px * sp;
        vz = pz * sp;
      }
    } else if (this.type === 'tank') {
      if (this._meleeCycle(dt, dist, ctx, 0.8, 3.5, 4.0, 3.0)) {
        vx = px * sp;
        vz = pz * sp;
      }
    } else if (this.type === 'splitter') {
      if (this._meleeCycle(dt, dist, ctx, 0.4, 1.4, 2.0, 1.0)) {
        vx = px * sp;
        vz = pz * sp;
      }
      this.coreMesh.rotation.y += dt * 3;
      this.ringMesh.rotation.z += dt * 2;
    } else if (this.type === 'shooter') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafe *= -1;
        this.strafeT = 1 + Math.random() * 2;
      }
      const desired = 7.5;
      const along = dist > desired + 1.5 ? 1 : dist < desired - 1.5 ? -0.7 : 0;
      vx = px * sp * along + -pz * this.strafe * sp * 0.5;
      vz = pz * sp * along + px * this.strafe * sp * 0.5;
      if (this.attackCd <= 0 && dist < 18) {
        this.attackCd = 1.6 + Math.random() * 0.6;
        this.flash = 0.12;
        ctx.addProjectile(this.pos.x, 0.95, this.pos.z, 'shooter', this._projScale());
      }
    } else if (this.type === 'sniper') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafe *= -1;
        this.strafeT = 2 + Math.random() * 3;
      }
      const desired = 22;
      const along = dist > desired + 2 ? 0.8 : dist < desired - 2 ? -0.5 : 0;
      vx = px * sp * along + -pz * this.strafe * sp * 0.4;
      vz = pz * sp * along + px * this.strafe * sp * 0.4;
      if (this.attackCd <= 0 && dist < 35) {
        this.attackCd = 2.0 + Math.random() * 0.5;
        this.flash = 0.1;
        ctx.addProjectile(this.pos.x, 1.1, this.pos.z, 'sniper', this._projScale());
      }
    } else if (this.type === 'bomber') {
      this.strafeT -= dt;
      if (this.strafeT <= 0) {
        this.strafe *= -1;
        this.strafeT = 2.5 + Math.random() * 2;
      }
      const desired = 10;
      const along = dist > desired + 2 ? 0.6 : dist < desired - 2 ? -0.3 : 0;
      vx = px * sp * along + -pz * this.strafe * sp * 0.3;
      vz = pz * sp * along + px * this.strafe * sp * 0.3;
      if (this.attackCd <= 0 && dist < 16) {
        this.attackCd = 2.5 + Math.random() * 0.8;
        this.flash = 0.15;
        ctx.addGrenade(this.pos.x, 1.2, this.pos.z, this.damage);
      }
    }

    // Push apart from crowding neighbours (squared test first to skip the sqrt).
    for (const o of ctx.enemies) {
      if (o === this) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      if (d2 < 1.0 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        vx += (ox / d) * 2.2;
        vz += (oz / d) * 2.2;
      }
    }

    const step = Math.hypot(vx, vz);
    const maxStep = sp * 1.4;
    if (step > maxStep) {
      const k = maxStep / step;
      vx *= k;
      vz *= k;
    }
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    const B = 21.6;
    this.pos.x = Math.max(-B, Math.min(B, this.pos.x));
    this.pos.z = Math.max(-B, Math.min(B, this.pos.z));
    resolveCircle(this.pos, this.radius, ctx.obstacles);

    const bob = this.status.freeze > 0 ? 0 : Math.sin(ctx.time * 6 + this.id) * 0.05;
    this.group.position.set(this.pos.x, bob, this.pos.z);
    this.group.rotation.y = Math.atan2(-dx, -dz);

    if (this.flash > 0) this.flash -= dt;
    this._setFlash(this.flash > 0);
  }

  // Returns true if this hit killed the enemy. Only sets `dead`; main.js does
  // the actual removal on its next sweep.
  //
  // `silent` skips the white hit flash. Damage over time calls this many times
  // a second, and a flash on every tick would bury the status tint that is the
  // whole visual tell for poison and fire.
  takeDamage(d, silent = false) {
    if (this.dead) return false;
    if (this.status.freeze > 0) d *= FREEZE_VULN;
    this.hp -= d;
    if (!silent) this.flash = 0.12;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  // Frees the two per-instance materials. Geometries and the remaining
  // materials are shared and intentionally kept for the next enemy.
  dispose() {
    this.bodyMat.dispose();
    this.eyeMat.dispose();
    this.hitbox.userData.enemy = null;
  }
}

// ---- projectiles ---------------------------------------------------------
// Same story as enemies: one geometry and one material set per projectile
// type, reused for every shot fired.
const PROJ_COLORS = {
  shooter: { core: 0xd08bff, glow: 0xb14aed, scale: 0.75 },
  sniper: { core: 0x88ffcc, glow: 0x00ff88, scale: 0.5 },
};
const projMats = new Map();

function projectileMats(type, glowTex) {
  let m = projMats.get(type);
  if (!m) {
    const c = PROJ_COLORS[type] || PROJ_COLORS.shooter;
    m = {
      core: new THREE.MeshBasicMaterial({ color: c.core }),
      glow: new THREE.SpriteMaterial({
        map: glowTex, color: c.glow, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
      scale: c.scale,
    };
    projMats.set(type, m);
  }
  return m;
}

let grenadeMats = null;
function grenadeMaterials(glowTex) {
  if (!grenadeMats) {
    grenadeMats = {
      core: new THREE.MeshStandardMaterial({
        color: 0xff4400, emissive: 0xff4400, emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.5,
      }),
      glow: new THREE.SpriteMaterial({
        map: glowTex, color: 0xff6600, transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }),
    };
  }
  return grenadeMats;
}

const _tmpTarget = new THREE.Vector3();

// Straight-line enemy shot. update() returns 'alive', 'hit' (reached the
// player), 'wall' (hit geometry or the floor) or 'expired'; main.js removes it
// from the scene on anything but 'alive'.
export class Projectile {
  constructor(scene, glowTex, x, y, z, target, speed, damage, type = 'shooter') {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(target.x - x, target.y - y, target.z - z).normalize().multiplyScalar(speed);
    this.speed = speed;
    this.damage = damage;
    this.life = 4;
    this.type = type;

    const mats = projectileMats(type, glowTex);
    this.mesh = new THREE.Mesh(geo('projectile', () => new THREE.SphereGeometry(0.1, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(mats.scale);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.pos.distanceTo(ctx.player.eyeInto(_tmpTarget)) < 0.7) {
      ctx.onHitPlayer(this.damage, this.pos);
      return 'hit';
    }
    if (this.pos.y <= 0.03) return 'wall';
    if (pointInObstacle(this.pos, ctx.obstacles)) return 'wall';
    return 'alive';
  }
}

// Reload Burst's shard. The one projectile the PLAYER owns: it flies flat and
// outward, explodes on an enemy, an obstacle or a short fuse, and cannot hurt
// the player - that is the whole promise of the upgrade, so there is no
// player-damage branch here to get wrong later.
//
// Damage is dealt through ctx.onBlast rather than inline: radial falloff and
// the enemy list both live in main.js, and a second copy of that arithmetic
// here would be one more place for the two to disagree.
export class Shard {
  constructor(scene, glowTex, x, y, z, dirX, dirZ, speed, damage, radius) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(dirX, 0, dirZ).normalize().multiplyScalar(speed);
    this.damage = damage;
    this.radius = radius;
    this.life = 0.7;
    this.exploded = false;

    const mats = grenadeMaterials(glowTex);
    this.mesh = new THREE.Mesh(geo('shard', () => new THREE.OctahedronGeometry(0.12, 0)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(0.8);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) {
      this.explode(ctx);
      return 'expired';
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 12;
    this.mesh.rotation.y += dt * 9;

    for (const e of ctx.enemies) {
      if (e.dead) continue;
      if (this.pos.distanceTo(e.pos) < e.radius + 0.4) {
        this.explode(ctx);
        return 'exploded';
      }
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this.explode(ctx);
      return 'exploded';
    }
    return 'alive';
  }

  explode(ctx) {
    if (this.exploded) return;
    this.exploded = true;
    ctx.onBlast(this.pos, this.damage, this.radius);
    this.mesh.visible = false;
  }
}

// Bomber's arcing shot: gravity-driven, explodes on contact or when its fuse
// runs out, and damages the player with falloff over its blast radius.
// Same return contract as Projectile, plus 'exploded'.
export class Grenade {
  constructor(scene, glowTex, x, y, z, target, speed, damage) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(target.x - x, 0, target.z - z).normalize().multiplyScalar(speed * 0.6);
    this.vel.y = 8.5;
    this.speed = speed;
    this.damage = damage;
    this.life = 3.5;
    this.exploded = false;

    const mats = grenadeMaterials(glowTex);
    this.mesh = new THREE.Mesh(geo('grenade', () => new THREE.SphereGeometry(0.15, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(1.0);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0 || this.exploded) {
      if (!this.exploded) this.explode(ctx);
      return 'expired';
    }
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.x += dt * 8;
    this.mesh.rotation.z += dt * 5;

    if (this.pos.y <= 0.2) {
      this.pos.y = 0.2;
      this.explode(ctx);
      return 'exploded';
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this.explode(ctx);
      return 'exploded';
    }
    return 'alive';
  }

  explode(ctx) {
    if (this.exploded) return;
    this.exploded = true;
    const radius = 4.0;
    const d = this.pos.distanceTo(ctx.player.eyeInto(_tmpTarget));
    if (d < radius + 0.5) {
      ctx.onHitPlayer(this.damage * (1 - Math.min(1, d / radius)), this.pos);
    }
    if (ctx.effects) {
      ctx.effects.burst(this.pos, 0xff4400, 28, 8, 3, 0.6);
      ctx.effects.burst(this.pos, 0xffaa00, 16, 5, 2, 0.4);
    }
    if (ctx.sfx) ctx.sfx.kill();
    this.mesh.visible = false;
  }
}
