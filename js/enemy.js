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

// ---------------------------------------------------------------------------
// THE SIXTY TYPES THEMSELVES ARE NOT IN THIS FILE ANY MORE. They are in
// js/enemies/, one file per theme plus a shared.js, and js/enemies/index.js
// assembles them - see the note at the top of shared.js for the rule that
// decides which of the two a symbol lives in.
//
// WHAT IS LEFT HERE IS THE MACHINERY THE TYPES ARE DRIVEN BY: the Enemy class,
// the four projectile kinds, and the two damage sinks. The split is along that
// line and not an arbitrary one - nothing below knows what a `kiln` is, and
// nothing in js/enemies/ knows what an Enemy is.
//
// This file's exports are UNCHANGED, deliberately: ENEMY_TYPES is re-exported
// from here, so main.js, the tests and enemy-viewer.html import exactly what
// they always did and none of them had to move.


import * as THREE from 'three';
import {
  resolveCircle, pointInObstacle, groundSurface, AGENT_HEIGHT, BOSS_HEIGHT, STEP_HEIGHT,
} from './utils.js';
import {
  ARENA_HALF, BALLOON_RISE, BODY_BASE_INTENSITY, BODY_FLASH_HEX,
  BODY_FLASH_INTENSITY, CONDUIT_RESIST, CONDUIT_SPEED, EGG_CLUSTER,
  EGG_CLUSTER_SPREAD, ENEMY_TYPES, FLARE_BURST,
  FLARE_BURST_REACH, FLARE_BURST_SPREAD, FLY_MAX_Y, FLY_RATE_DEFAULT,
  FREEZE_VULN, GROUND_FALL, HAIL_RING_GAP, HAIL_RING_N, HAIL_RING_R,
  MELEE_REACH_Y,
  NAV_TURN, PLATE_HEX, SHARED_MATS, SLOW_FACTOR, SPORE_DAMAGE, SPORE_RADIUS,
  SPORE_SPROUT, STATUS_FX, STATUS_INTENSITY, STATUS_ORDER, STATUS_TINT,
  STEP_EASE, WARD_STONE, _dripAt, _steer, _wraithEnd, buildChaser,
  geo, landHit, nextEnemyId,
} from './enemies/index.js';
export { ENEMY_TYPES } from './enemies/index.js';

// WHERE DAMAGE NUMBERS COME OUT. takeDamage is the single point in the game at
// which an enemy's hp is ever reduced - every bullet, blast, burn, mine, sentry
// and item in the codebase funnels through it - so it is the one place a
// number has to be spawned from to cover all of them.
//
// A MODULE-LEVEL SINK rather than a reference on the Enemy, because an Enemy is
// constructed from a type and a position and holds nothing belonging to the
// game: threading effects through every construction site, every split, every
// boss part and every test that stands one up would be a far larger change than
// the feature is. main.js installs this once at boot.
//
// It is also the reason the number is read off the HP DELTA rather than off the
// damage that was asked for: by the time hp has moved, ward, freeze
// vulnerability, armour facing and the Conduit's resistance have all been
// applied, and those are exactly the mechanics a number is worth showing for.
// A staggered Colossus taking full damage instead of 22% is now visible.
let damageSink = null;

export function setDamageSink(fn) {
  damageSink = fn;
}

// THE SAME ARGUMENT, for a capacitor's plate breaking. A shield that absorbed
// a shot and said nothing would be indistinguishable from a shot that missed,
// which is the one thing the warden's comment above says a protection effect
// must never be - and unlike the warden's grey there is nothing left on the
// body afterwards to explain what happened, because the plate is gone.
let plateSink = null;

export function setPlateSink(fn) {
  plateSink = fn;
}

// SHARED PAIN. Installed by main.js while the passive item is owned and torn
// down the moment it is not, so a run without it pays one null test per hit -
// which is the only cost a pick nobody took is allowed to have.
//
// A HOOK RATHER THAN A `mods` READ, because takeDamage() is on the ENEMY and
// there is no player in reach of it. Every blow in the game already funnels
// through here - bullets, blasts, poison ticks, turrets, thorns, friendly fire
// - which is exactly why the split has to live here and nowhere else.
let shareHook = null;
// Raised while the hook is redistributing, so the slices it deals do not each
// call the hook again. A module-level flag and not a field: the recursion is
// across the whole roster, not on one body.
let _sharing = false;

export function setShareHook(fn) {
  shareHook = fn;
}

// WEAK POINT's multiplier. A module constant rather than a mod read, for the
// same reason the hook above is a hook: the enemy cannot see the player. The
// FLAG is what the build sets (main.js only ever marks a body while the pick is
// owned), and this is what the flag is worth.
const MARK_MULT = 1.5;

// THE DEFAULT HEAD, for every type that does not name one.
//
// A small sphere straddling the TOP of the body sphere. For a humanoid that
// lands on the neck and jaw, and for the third of the roster that has no head
// at all - a Conduit, a Monolith, a rolling Scree, the Choir's three bodies -
// it is "the top of the thing," which is the only honest answer and is also
// what the player will aim at anyway. No type is required to opt in, so a new
// enemy is never silently headshot-proof.
//
// 0.78 rather than 1.0 so the sphere OVERLAPS the body instead of balancing on
// it: a head with a seam under it would let a round slip between the two.
function defaultHead(hb) {
  const r = hb ? hb.r : 0.6;
  const y = hb ? hb.y : 0.8;
  return { r: r * 0.5, y: y + r * 0.78 };
}

// The highest a head may sit and still touch the body sphere. Their radii less
// a little, so they genuinely intersect rather than meeting at a single point -
// two spheres tangent to each other still have a seam.
function headSeam(hb, hd) {
  const r = hb ? hb.r : 0.6;
  const y = hb ? hb.y : 0.8;
  return y + (r + hd.r) * 0.9;
}

// The one AI frame object, filled and handed to an ai() per enemy per frame.
// Reused rather than allocated: thirty enemies at 60fps is 1800 objects a
// second, which is exactly the kind of churn the geometry and material caches
// in this file exist to avoid.
const _a = {
  dt: 0, ctx: null, dist: 0, nx: 0, nz: 0, px: 0, pz: 0, sp: 0, vx: 0, vz: 0,
};

export class Enemy {
  constructor(type, pos, hpScale, speedScale, dmgScale) {
    const def = ENEMY_TYPES[type];
    const s = def.scale;
    // Kept on the instance, not just used to build with. A build() authors its
    // parts in UNIT space and P() multiplies them up by this - so any ai()
    // that MOVES a part it built has to multiply by the same number, or it is
    // positioning a 3x boss's chest doors in a 1x enemy's coordinates. Three
    // types animate their own parts (the Forge's shutters, the bellows' lobes)
    // and every one of them was silently writing NaN before this existed.
    this.scale = s;
    this.id = nextEnemyId();
    // Crowd bob state - see the dance block in update(). `danceLag` staggers
    // this enemy's response to the beat so a room full of them reads as a
    // crowd rather than a chorus line; it is derived from the id so it is
    // stable for the enemy's whole life and costs no storage to randomise.
    this._dance = 0;
    this.danceLag = (this.id % 7) / 7;
    // Weight-shift state. `_leanSign` flips on every beat so the lean
    // alternates sides; `_lean` chases it so the change is a shift rather
    // than a snap, and `_beatHigh` is the edge detector that does the flip.
    this._lean = 0;
    this._leanSign = this.id % 2 ? 1 : -1;
    this._beatHigh = false;
    this.type = type;
    this.maxHp = def.hp * hpScale;
    this.hp = this.maxHp;
    this.speed = def.speed * speedScale;
    this.damage = def.damage * dmgScale;
    this.value = def.value;
    // What this body is WORTH IN CREDITS, when that cannot be derived from its
    // `value`. Null for everything the waves spawn - main.js reads `value` and
    // one rate, so the two curves cannot drift apart. It exists for the things
    // worth nothing and still meant to pay: a splitter's children.
    this.bounty = null;
    // Set by the player's melee when a swing is what killed this body, and
    // read once by the death sweep in main.js - see MELEE_KILL_MULT. It lives
    // here rather than in a set on the game so that it dies with the enemy.
    this.meleeKill = false;
    // THE CRIT FAMILY'S PER-BODY HISTORY. ASSASSIN pays on the first hit this
    // body has ever taken and TELLTALE on every third; both are questions about
    // THIS enemy, so both are answered here rather than on the player - and
    // both die with the body, which is exactly right. An enemy is never fresh
    // twice, and a tally cannot be inherited by whatever spawns next.
    //
    // Written by Game._resolveHit, once per TRIGGER PULL rather than per
    // pellet - see the _shotHits guard there.
    this.everHit = false;
    this.hitTally = 0;
    // WEAK POINT's tally, and the mark it ends in. Deliberately NOT hitTally:
    // that one is TELLTALE's and is counted whether or not the hit was already
    // a crit, so sharing it would make a build holding both mark bodies on the
    // wrong hit. Both die with the body, like everHit above.
    this.markTally = 0;
    this.marked = false;
    // FEAR AURA's per-enemy lockout: the game time this body was last made to
    // run. -99 rather than 0 so an enemy spawned on the first frame of a run is
    // not already inside its own cooldown.
    this.fearAuraAt = -99;
    // Collision size, independent of the model's `scale`. Everything that
    // treats an enemy as a circle reads this: obstacle resolution, crowd
    // separation, the arena clamp, melee reach and the player's shards.
    this.radius = def.radius ?? 0.5;
    // Heavy things are not pushed around. Knockback, Gravity Rounds and the
    // player's shockwave all write e.pos directly, and a boss that could be
    // shoved out of its own charge would not be a fight.
    this.immovable = (def.mass ?? 1) >= 4;
    this.boss = !!def.boss;
    // How tall this thing is for the purpose of overhead geometry. A boss does
    // not fit under a catwalk; everything else does. See AGENT_HEIGHT.
    this.collideH = def.boss ? BOSS_HEIGHT : AGENT_HEIGHT;
    // Status resistance. The defaults are exactly what every enemy did before
    // bosses existed, so the original six are unchanged by all of this.
    this.statusMul = def.statusMul ?? 1;
    this.slowFactor = def.slowFactor ?? SLOW_FACTOR;
    // Absolute Zero's world slow, refreshed from ctx.mods once per update.
    // Cached on the enemy rather than read where it is used because _effSpeed
    // and _projScale have no ctx, and mods is a fresh object on every draft
    // pick - a value captured at construction would go stale on the first one.
    this._worldSlow = 1;
    this.freezeVuln = def.freezeVuln ?? FREEZE_VULN;
    // Conduit's aura, in seconds remaining. Refreshed by a live conduit every
    // frame and counted down in _tickStatus, so it lapses on its own the frame
    // after the conduit dies - no reference to clean up.
    this.buffT = 0;
    // Warden's dome, in seconds remaining. Same refresh-and-lapse contract as
    // buffT above; while it is positive this enemy cannot be damaged at all.
    this.wardT = 0;
    // A capacitor's single-hit shield. NOT a timer like wardT - it is spent by
    // the next hit that lands and then gone, and it OUTLIVES the capacitor
    // that put it on, which is the whole difference between the two supports.
    this.plated = false;
    this.colorHex = def.color;
    this.eyeBase = def.eye;
    this.pos = pos.clone();
    // FLIGHT. `pos.y` is a real coordinate for these and zero for everything
    // else, which is what makes the rest of the game handle them correctly for
    // free: resolveCircle already ignores a box the mover is above, the melee
    // reach test already compares the two y values, and the model and its
    // hitbox are parented to a group whose height is written from pos.y below.
    // Nothing else in the file needed a special case.
    this.flying = !!def.fly;
    this.hoverY = this.flying ? def.fly.height : 0;
    // PARTY BALLOONS. Seconds left off the floor, and it is NOT a status: the
    // status table is a set of timers that tint the body and are resisted,
    // refreshed and held by half a dozen passive items, and being carried into
    // the air is none of those things. One number, checked in three places -
    // the behaviour branch below, the ground snap and the altitude step - and
    // it means "this body is not in the fight".
    this.balloonT = 0;
    this.flyRate = FLY_RATE_DEFAULT;
    if (this.flying) this.pos.y = this.hoverY;
    // Ceiling on this frame's step, as a multiple of the enemy's own speed.
    // 1.4 is the headroom crowd separation needs and is what every enemy used
    // when the clamp was a constant; a shrike raises it for the length of a
    // dive, which is the one attack in the game meant to outrun the player.
    this.stepMul = 1.4;
    // How far the drawn model is currently BELOW the body, because it just
    // took a step up. Eased to zero every frame - see the ground block in
    // update().
    this._stepLag = 0;
    // LAST FRAME'S WALKING HEADING, and zero until there has been one. The
    // grid answers per frame with no memory of what it said last frame, and
    // at the edge of a stair tread - where the surface underfoot flickers
    // between two treads as a body straddles them - two frames in a row can
    // get opposite answers. Unsmoothed that is a body vibrating on the spot
    // instead of climbing. See the blend in update().
    this._navX = 0;
    this._navZ = 0;
    this.attackCd = 0.8 + Math.random();
    this.windup = 0;
    // Seconds left on a swing that has already been thrown - see _meleeCycle.
    this.swing = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    // Wraith's teleport timer. Staggered at birth so a group that spawned
    // together does not blink in unison.
    this.blinkCd = 1.5 + Math.random() * 2.5;
    // '', 'warp' (leaving) or 'form' (arriving) - see aiWraith. Declared here
    // rather than sprung on the type so a frozen or feared wraith caught
    // mid-blink still has a state the rest of update() can read.
    this.blinkState = '';
    this.blinkT = 0;
    // Attack-cooldown multiplier. 1 for everything except a boss, where
    // waves.js turns it down with the wave number so late fights come at the
    // player faster rather than merely lasting longer.
    this.rate = 1;
    // Raised by an ai() on the frames it wants to ignore obstacles - see the
    // phase block in update(). Only VOID's monolith uses it.
    this.phase = false;
    // Set by a bellows every frame it is in range, and counted down in
    // update(). Zero for everything in every other theme.
    this.igniteT = 0;
    // Raised by an ai() on the frames it is steering its own yaw - see the
    // note where it is read, at the bottom of update().
    this.faceLocked = false;
    // Which pass through the boss rotation this is - 0 the first time a boss
    // is met, 1 from wave 26 on. Bosses scale by stats, but a couple of them
    // read this to add a shell or a volley rather than only bigger numbers.
    this.cycle = 0;
    this.blockedBy = 0;
    // Scratch for a boss's own phase state, allocated only for bosses so an
    // ordinary wave does not pay for an object per enemy.
    this.bs = def.boss ? {} : null;
    this.flash = 0;
    this.dead = false;
    this._flashOn = false;
    this._eyeAlert = false;
    // Status timers, seconds remaining. Every key in STATUS_ORDER is present
    // from birth so the tick never has to test for existence.
    this.status = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    // DAMAGE PER TICK, kept per source so a player carrying both Venom and
    // Incendiary gets both rather than the larger of the two.
    //
    // PER TICK, NOT PER SECOND. Both of these used to be rates, accrued as a
    // float and paid out in whole points whenever the accumulator crossed one -
    // so a 12 dps poison was twelve unrelated pinpricks a second, and fire and
    // poison were the two systems in the game with no relationship to the music
    // everything else in it moves to. Now a tick is a discrete event on the
    // beat: burn twice a bar-beat, poison once. See _tickStatus.
    this._dot = { poison: 0, burn: 0 };
    // Where the pulse stood at the last tick. -1 until the first one is seen,
    // so an enemy set alight mid-beat waits for the next edge rather than
    // taking a tick on the frame it caught fire.
    this._dotPulse = -1;
    // KNOCKBACK IN FLIGHT. A speed and the time left to run it for, applied in
    // the movement step - see knock() and update(). Melee used to displace the
    // body outright on the frame of the hit, which read as the enemy blinking
    // to a new spot rather than as being hit by anything.
    this.knockX = 0;
    this.knockZ = 0;
    this.knockT = 0;
    // One drip timer per status, so each effect keeps its own rhythm instead
    // of every status on an enemy puffing on the same frame.
    this._dripAcc = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    // Last emissive colour written to bodyMat, so the tick can skip the
    // setHex() when nothing changed.
    this._tintHex = def.color;
    // What the body is currently WEARING - 'flash', 'ward' or a tint hex - so
    // _applyBodyLook can skip the material writes when nothing has changed.
    this._look = def.color;
    // Per-status re-application lockout, used only by status-resistant types
    // so a continuous stream of hits cannot hold one permanently afflicted.
    this._statusCd = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    // Any material a build() allocates per instance goes here and is freed in
    // dispose(). The body and eye materials are handled separately because
    // every enemy has exactly one of each.
    this._extraMats = [];

    this.group = new THREE.Group();
    // YXZ so the dance's roll (rotation.z, in update) composes INSIDE the
    // facing yaw: the enemy leans about its own spine rather than tipping
    // toward a fixed world axis as it turns. Nothing writes rotation.x, and
    // the places that read rotation.y for a facing direction are unaffected -
    // the order only changes how y and z combine.
    this.group.rotation.order = 'YXZ';
    this.group.position.copy(this.pos);
    // flatShading is what makes the whole roster read as cut facets. Every
    // part of every silhouette shares this one material, so a hit flash and a
    // status tint land on the entire body at once - see partsFor().
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: def.color, roughness: 0.4, metalness: 0.3, flatShading: true,
      emissive: def.color, emissiveIntensity: BODY_BASE_INTENSITY,
    });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: def.eye });

    // The type builds its OWN model, silhouette included. There is deliberately
    // no shared body here: one capsule for every type was what made the roster
    // read as the same blob in different colours.
    (def.build || buildChaser)(this, this.group, s);

    // A type may override the hit sphere when its silhouette is nothing like
    // the usual upright body - the bosses all do. The geometry is still cached
    // per type, never per instance.
    const hb = def.hitbox;
    this.hitbox = new THREE.Mesh(
      hb
        ? geo('hitbox:' + type, () => new THREE.SphereGeometry(hb.r, 10, 10))
        : geo('hitbox', () => new THREE.SphereGeometry(0.6, 8, 8)),
      SHARED_MATS.hitbox
    );
    this.hitbox.position.y = (hb ? hb.y : 0.8) * s;
    // Scale the hitbox with the model so big enemies are as easy to hit as they look.
    this.hitbox.scale.setScalar(s);
    /**
     * THE HIT SPHERE AS TWO PLAIN NUMBERS, in world units, for anything that
     * needs the enemy's BODY rather than the point its feet are on.
     *
     * `pos` is the point a body stands on, and for most of the roster that is
     * close enough to the middle of it that treating the enemy as a point costs
     * nothing. For a boss it is not: a Colossus is a six-metre body whose `pos`
     * is on the floor under it, so a blast that goes off in its chest is two
     * and a half metres from `pos` and a radial test against `pos` finds
     * nothing there at all - which is exactly the bug DELAYED FUSE hit (see
     * Game._blast). Reading them off the mesh would mean a getWorldPosition per
     * enemy per blast; these are constants of the type, so they are taken once.
     */
    this.hitR = (hb ? hb.r : 0.6) * s;
    this.hitY = (hb ? hb.y : 0.8) * s;
    this.hitbox.userData.enemy = this;
    this.group.add(this.hitbox);

    // THE HEAD, and it is a SECOND SPHERE rather than a band across the top of
    // the first one. Two reasons, and the second is the important one:
    //
    //   1. A band is a fraction of a sphere that was never drawn to fit a head.
    //   2. Half the roster's heads sit ABOVE the body sphere entirely - the
    //      Shooter's is at 1.56 and its sphere stops at 1.4 - so before this
    //      existed, a round placed squarely on a visible face MISSED. The head
    //      is not just worth double now; it is somewhere you can hit at all.
    //
    // Same contract as the body sphere: unit space times `s`, geometry cached
    // per type, invisible, and it carries `userData.enemy` so every raycast
    // that already understood a hitbox understands this too. `userData.head` is
    // the only new thing the shot path reads.
    const hd = def.head || defaultHead(hb);
    this.head = new THREE.Mesh(
      geo('head:' + type, () => new THREE.SphereGeometry(hd.r, 8, 8)),
      SHARED_MATS.hitbox
    );
    // PULLED DOWN UNTIL THE TWO SPHERES MEET, if the authored height leaves a
    // seam between them. A head is taken from where the model's EYES are, and a
    // handful of types wear their face well above a hit sphere that only covers
    // their base - a Monolith, a Warp, and the Choir's three bodies sharing one
    // sphere. A floating head is a band of air between the chin and the chest
    // that a round can pass through without touching either, which the player
    // would read as the game refusing a hit that visibly landed.
    this.head.position.y = Math.min(hd.y, headSeam(hb, hd)) * s;
    this.head.scale.setScalar(s);
    this.head.userData.enemy = this;
    this.head.userData.head = true;
    this.group.add(this.head);
    this.group.updateMatrixWorld(true);
  }

  _setFlash(on) {
    if (this._flashOn === on) return;
    this._flashOn = on;
    this._applyBodyLook();
  }

  // THE BODY HAS ONE WRITER. The hit flash, the warden's stone and the status
  // tint all want the same two material properties, and three separate setters
  // is how a flash used to erase a status tint until the next status change
  // put it back. They are a strict priority instead:
  //
  //   flash   the hit landed - always wins, and lasts a tenth of a second
  //   ward    a warden is protecting this enemy: it cannot be damaged, and it
  //           goes stone grey in the COLOUR channel as well as the emissive,
  //           so it stops looking like a thing worth shooting at all
  //   status  poison, fire, ice - the tint the passive items put on it
  //   base    its own colour
  //
  // `_look` is what is currently on the material, so a frame that changes
  // nothing writes nothing.
  _applyBodyLook() {
    const want = this._flashOn ? 'flash'
      : this.wardT > 0 ? 'ward'
      : this.plated ? 'plate'
      : this._dominantTint();
    if (want === this._look) return;
    this._look = want;
    if (want === 'flash') {
      this.bodyMat.color.setHex(this.colorHex);
      this.bodyMat.emissive.setHex(BODY_FLASH_HEX);
      this.bodyMat.emissiveIntensity = BODY_FLASH_INTENSITY;
      return;
    }
    if (want === 'plate') {
      // The BODY keeps its own colour and only the glow changes, which is the
      // opposite of the ward: a plated enemy is still the enemy it was and
      // still worth shooting, it simply has one shot of skin on it.
      this.bodyMat.color.setHex(this.colorHex);
      this.bodyMat.emissive.setHex(PLATE_HEX);
      this.bodyMat.emissiveIntensity = 1.1;
      return;
    }
    if (want === 'ward') {
      // The base colour goes too, not just the glow. An enemy that was still
      // its own bright red under a grey sheen read as "tinted", and the whole
      // job of this state is to read as "made of rock".
      this.bodyMat.color.setHex(WARD_STONE);
      this.bodyMat.emissive.setHex(WARD_STONE);
      this.bodyMat.emissiveIntensity = 0.45;
      return;
    }
    this._tintHex = want;
    this.bodyMat.color.setHex(this.colorHex);
    this.bodyMat.emissive.setHex(want);
    this.bodyMat.emissiveIntensity =
      want === this.colorHex ? BODY_BASE_INTENSITY : STATUS_INTENSITY;
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
   * @param {number} power damage PER TICK, for 'poison' and 'burn' only
   */
  applyStatus(kind, dur, power = 0) {
    if (this.dead || !(kind in this.status)) return;
    // RESISTANCE. Only types that ask for it are affected; at statusMul 1 with
    // no freezeSlow this whole block is skipped and the method behaves exactly
    // as it always has.
    if (this.statusMul < 1) {
      // A boss that can be stopped outright is not a fight - a three second
      // Petrify would be a free damage window on every magazine. Freeze
      // becomes a heavy slow instead, so the passive item still does
      // something.
      if (kind === 'freeze' && ENEMY_TYPES[this.type].freezeSlow) {
        kind = 'slow';
        dur *= 0.6;
      }
      dur *= this.statusMul;
      // At eight shots a second, refreshing on every hit would hold a boss
      // slowed for the entire fight. The lockout makes the status roughly a
      // 50% uptime effect rather than a permanent one.
      if (this._statusCd[kind] > 0) return;
      this._statusCd[kind] = dur * 2;
    }
    this.status[kind] = Math.max(this.status[kind], dur);
    if (power > 0 && kind in this._dot) this._dot[kind] = Math.max(this._dot[kind], power);
  }

  /**
   * PARTY BALLOONS: take this body out of the fight and off the floor.
   *
   * REFRESHES RATHER THAN STACKING, the rule every status and every running
   * item in this game follows - two presses is one longer window, not two
   * bodies' worth of drift on one body.
   *
   * THE REFUSALS ARE THE ITEM'S, not a resistance. A boss is exempt outright
   * (see the note on the item) and a corpse cannot be lifted; there is no
   * statusMul here and no cooldown, because this is not in the status table -
   * an enemy that shrugged half of it off would be half in the air, which is
   * not a state the ground snap can express.
   *
   * @param {number} secs
   * @returns {boolean} whether this body actually left the floor, so the item
   *   can tell a press that lifted nothing from one that lifted five.
   */
  balloon(secs) {
    if (this.dead || this.boss || this.immovable) return false;
    this.balloonT = Math.max(this.balloonT, secs);
    return true;
  }

  /**
   * Shove this body, visibly, over `time` rather than instantly.
   *
   * THE DISTANCE IS EXACT. The speed is chosen so the whole of `dist` is
   * covered in `time` and the applied displacement is then constant, which is
   * what lets this replace a straight position add without changing where
   * anything ends up - only how it got there.
   *
   * Written into pos through the ordinary movement step, NOT into
   * group.position like the crowd dance: a body that has been knocked back
   * really is somewhere else, and pathing, crowding and collision all have to
   * agree with what the player just watched happen.
   *
   * REFRESHES RATHER THAN ACCUMULATING, so two hits in quick succession are
   * one shove at the newer angle instead of a body launched across the arena.
   *
   * @param {number} dirX  need not be normalised
   * @param {number} dirZ
   * @param {number} dist  metres
   * @param {number} time  seconds to cover them in
   */
  knock(dirX, dirZ, dist, time = 0.18) {
    // A heavy body is not shoved, the same rule every other push in the game
    // respects - see immovable.
    if (this.immovable || this.dead) return;
    const len = Math.hypot(dirX, dirZ);
    if (len < 1e-6 || time <= 0) return;
    const speed = dist / time;
    this.knockX = (dirX / len) * speed;
    this.knockZ = (dirZ / len) * speed;
    this.knockT = time;
  }

  // Movement speed after Cryo and Petrify. Every speed read inside update()
  // goes through this - a branch that used this.speed directly would keep
  // moving at full pace while visibly frozen.
  _effSpeed() {
    if (this.status.freeze > 0) return 0;
    const buff = this.buffT > 0 ? CONDUIT_SPEED : 1;
    // Absolute Zero, refreshed from ctx.mods at the top of update() because
    // this method has no ctx and every speed read in the class goes through
    // it. 1 for any run that has not bought the deal.
    return (this.status.slow > 0 ? this.speed * this.slowFactor : this.speed)
      * buff * this._worldSlow;
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
    // Entropy stops the timers below a health threshold, which on a normal
    // enemy is the whole point of the passive item and on a boss would mean a
    // permanent lock for the back third of the fight. Resistant types opt out.
    // ETERNAL AFFLICTION rides the same branch. It is Entropy with the health
    // threshold removed - everything, from full - so it reuses the hold rather
    // than adding a second way for a timer to stop. Both respect entropyExempt
    // for the same reason: a permanent lock on a boss is not a fight.
    const held = !ENEMY_TYPES[this.type].entropyExempt && !!ctx.mods
      && (ctx.mods.statusEternal > 0
        || (ctx.mods.entropyBelow > 0 && this.hp <= this.maxHp * ctx.mods.entropyBelow));
    if (this.buffT > 0) this.buffT -= dt;
    if (this.wardT > 0) this.wardT -= dt;
    if (this.statusMul < 1) {
      for (const k of STATUS_ORDER) {
        if (this._statusCd[k] > 0) this._statusCd[k] -= dt;
      }
    }
    for (const k of STATUS_ORDER) {
      if (this.status[k] <= 0) continue;
      if (held) {
        any = true;
        continue;
      }
      this.status[k] -= dt;
      if (this.status[k] <= 0) {
        this.status[k] = 0;
        if (k in this._dot) this._dot[k] = 0;
      } else {
        any = true;
      }
    }

    // DAMAGE OVER TIME IS ON THE BEAT.
    //
    // BURN ticks on every pulse - twice a beat, the downbeat and the upbeat.
    // POISON ticks on whole beats only, so it is half fire's rate: fire is the
    // fierce one and poison is the patient one, and that difference is now
    // audible rather than buried in two dps constants.
    //
    // Both are ONE takeDamage per tick rather than an accumulator drained per
    // frame, which is also what makes them legible: a tick is a number the
    // player sees float off the body in time with the music (see the damage
    // sink below), where a fractional nibble every frame was nothing at all.
    //
    // `silent` keeps it from firing the white hit flash, which would strobe
    // over the status tint for as long as the status lasts.
    const pulsed = ctx.pulse !== undefined && ctx.pulse !== this._dotPulse;
    if (pulsed) {
      const first = this._dotPulse < 0;
      this._dotPulse = ctx.pulse;
      if (!first) {
        const dmg = (this.status.burn > 0 ? this._dot.burn : 0)
          + (this.status.poison > 0 && ctx.pulseWhole ? this._dot.poison : 0);
        if (dmg > 0) {
          this.takeDamage(dmg, true);
          if (this.dead) return;
        }
      }
    }

    this._applyBodyLook();

    if (!any || !ctx.effects) return;
    // One drip per ACTIVE status, each on its own timer and in its own colour.
    // Spawn heights come from STATUS_FX so a rising effect starts low on the
    // body and a falling one starts high - a drip that began at the feet would
    // be hidden by the enemy itself from anywhere but point blank.
    for (const k of STATUS_ORDER) {
      if (this.status[k] <= 0) continue;
      const fx = STATUS_FX[k];
      this._dripAcc[k] += dt;
      if (this._dripAcc[k] < fx.interval) continue;
      this._dripAcc[k] = 0;
      // Spread across the body rather than all from one point, or the drip
      // reads as a single jet coming out of the enemy's chest.
      _dripAt.set(
        this.pos.x + (Math.random() - 0.5) * 0.5,
        fx.y + (Math.random() - 0.5) * 0.3,
        this.pos.z + (Math.random() - 0.5) * 0.5
      );
      ctx.effects.burst(_dripAt, STATUS_TINT[k], fx.count, fx.speed, fx.up, fx.life);
    }
  }

  _setEyeAlert(on) {
    if (this._eyeAlert === on) return;
    this._eyeAlert = on;
    this.eyeMat.color.setHex(on ? 0xffffff : this.eyeBase);
  }

  // Kept as a static because that is what everything outside this file reads,
  // and taken from the module constant so there is one number rather than two.
  static MELEE_REACH_Y = MELEE_REACH_Y;

  // How long a swing stays LIVE once the windup ends. The hit used to be
  // tested on the single frame the windup crossed zero, which made a landed
  // blow a coin flip on frame timing: at 10 m/s the player crosses 17cm per
  // frame, so a swing sampled one frame early or late reads a different world.
  // A window this long is ~11 frames at 60fps and is tested on every one of
  // them, so the swing connects if the player is inside its arc AT ANY POINT
  // while the arm is coming down - which is what a swing is.
  static SWING_ACTIVE = 0.18;

  // How far past its own body an enemy counts as TOUCHING the player. The
  // player collides as a 0.4m circle (see player.js), so this is the two
  // bodies meeting plus a hand's reach.
  static CONTACT_PAD = 0.55;

  /**
   * One step of a melee attacker's attack. Returns true when the enemy is free
   * to keep walking, false while it is committed to a swing.
   *
   * THREE WAYS THIS RESOLVES, IN PRIORITY ORDER
   *
   *   1. CONTACT. If the player is inside the enemy's body, it hits, now,
   *      whatever the animation was doing.
   *   2. The swing's ACTIVE WINDOW - the arc is live for SWING_ACTIVE seconds
   *      and lands the first frame the player is inside `hitRange`.
   *   3. WINDUP - the telegraph, unchanged.
   *
   * RULE 1 IS THE FIX FOR THE BUG THIS WHOLE METHOD EXISTED WITH.
   * A hit was previously reachable ONLY through the animation: get within
   * `startRange`, wind up for `windupTime`, and test `hitRange` when the
   * windup expired. Run the numbers on a chaser - windup 0.45s, hit reach
   * 2.2m - against a player moving at BASE_SPEED 10 m/s, and the attack is
   * unlandable by construction: the player covers 4.5m during the windup, so
   * by the time the swing resolves they are twice the reach away. A player who
   * simply ran through a pack of chasers took nothing at all, from any of
   * them, ever. The same arithmetic broke all seven melee types - only the
   * exact distance at which they became free varied.
   *
   * So the attack no longer depends on an animation completing. Touching the
   * enemy is the attack; the wind-up swing is how it reaches a player who is
   * NOT touching it. Both are the same blow, and both are gated by the SAME
   * `attackCd`, so no enemy can deal more damage per second than it could
   * before - a chaser still hits at most once every 1.1s. What changed is that
   * running past one is no longer a way of making it hit zero times.
   */
  _meleeCycle(dt, dist, ctx, windupTime, startRange, hitRange, cooldown) {
    const dy = Math.abs(ctx.player.pos.y - this.pos.y);
    const inReach = dy < Enemy.MELEE_REACH_Y;

    // 1. CONTACT. Checked first and from any state, including mid-windup: a
    //    player who runs into a wound-up enemy is hit BY that swing rather
    //    than by a second one, which is why this consumes the windup instead
    //    of queueing behind it.
    if (inReach && this.attackCd <= 0 && dist < this.radius + Enemy.CONTACT_PAD) {
      landHit(this, ctx);
      this.attackCd = cooldown;
      this.windup = 0;
      this.swing = 0;
      this._setEyeAlert(false);
      // Free to walk. It has already spent its blow and is on cooldown, so
      // rooting it here would only make it easier to leave behind.
      return true;
    }

    // 2. The live swing.
    if (this.swing > 0) {
      this.swing -= dt;
      if (inReach && dist < hitRange) {
        landHit(this, ctx);
        this.swing = 0;
      }
      if (this.swing <= 0) this._setEyeAlert(false);
      return false;
    }

    // 3. The telegraph.
    if (this.windup > 0) {
      this.windup -= dt;
      this._setEyeAlert(true);
      if (this.windup <= 0) {
        // The cooldown is charged HERE, not on the hit, so a swing that finds
        // nothing still costs the enemy its attack - the same trade a whiff
        // has always been.
        this.attackCd = cooldown;
        this.swing = Enemy.SWING_ACTIVE;
      }
      return false;
    }

    this._setEyeAlert(false);
    if (dist < startRange && inReach && this.attackCd <= 0) {
      this.windup = windupTime;
      return false;
    }
    return true;
  }

  // One AI + movement step. Computes a desired velocity for this frame, adds
  // crowd separation, clamps it, moves, then resolves against obstacles.
  update(dt, ctx) {
    if (this.dead) return;
    this._worldSlow = ctx.mods ? ctx.mods.worldSlow : 1;
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
    // Wide bodies steer on the grid cut for them, so they are not routed
    // through gaps they cannot fit through.
    // A flier is not on the grid. It goes over the pillars the grid exists to
    // route around, so a heading borrowed from it would send something at five
    // metres on a detour around a crate.
    const nav = this.flying ? null : this.radius > 0.8 ? (ctx.navBig || ctx.nav) : ctx.nav;
    // `pos.y` is the surface underfoot (see the ground block in update), and
    // the grid needs it: without it an enemy pressed against a crate is read as
    // standing ON the crate, and the route it gets back is the one a thing on
    // top of the crate would want.
    if (nav && nav.steer(this.pos.x, this.pos.z, _steer, this.pos.y)) {
      px = _steer.x;
      pz = _steer.z;
    }
    // TURN, RATHER THAN SNAP. The heading above is recomputed from scratch
    // every frame, and around the corner of a stair or a crate two consecutive
    // frames can disagree by most of a half-turn; taken literally that is an
    // enemy shaking in place. A short blend - about a tenth of a second, and
    // frame-rate independent - is enough to damp the flicker while still
    // turning fast enough that nothing overshoots a corner. Fliers and the
    // straight-line fallback go through it too, so a body's heading changes at
    // one rate whatever produced it.
    if (this._navX !== 0 || this._navZ !== 0) {
      const k = 1 - Math.exp(-dt / NAV_TURN);
      px = this._navX + (px - this._navX) * k;
      pz = this._navZ + (pz - this._navZ) * k;
      const m = Math.hypot(px, pz);
      // A blend between two near-opposite headings can cancel out. There is no
      // meaningful direction left in that, so the fresh one wins outright
      // rather than leaving the body pointing nowhere.
      if (m < 1e-3) { px = _steer.x || nx; pz = _steer.z || nz; }
      else { px /= m; pz /= m; }
    }
    this._navX = px;
    this._navZ = pz;

    let vx = 0;
    let vz = 0;

    // A half-finished blink is state on the MODEL - a squashed scale and a
    // tipped body - and neither branch below calls the type's ai() again, so a
    // wraith petrified or panicked mid-teleport would be left as a disc on the
    // floor for the rest of its life. Put back whole before either takes over.
    if (this.blinkState && (this.status.freeze > 0 || this.status.fear > 0)) {
      _wraithEnd(this);
    }

    if (this.balloonT > 0) {
      // FLOATING, AND THAT IS THE WHOLE OF IT. Above the freeze branch because
      // it outranks every other reason a body might be doing nothing: an enemy
      // ten metres up is not petrified, not afraid and not steering, and any
      // ai() that ran here would be a shooter still shooting from a balloon.
      // Same three lines the freeze uses to abandon a half-wound swing.
      this.balloonT -= dt;
      this.windup = 0;
      this.swing = 0;
      this._setEyeAlert(false);
      // A wraith caught mid-teleport, for the reason the block above this one
      // exists: neither this branch nor the ones below call ai() again, so a
      // body left as a disc on the floor would stay one for the rest of its
      // life.
      if (this.blinkState) _wraithEnd(this);
    } else if (this.status.freeze > 0) {
      // Petrified: no movement, no attack, and any half-wound swing is lost -
      // including one already in the air.
      this.windup = 0;
      this.swing = 0;
      this._setEyeAlert(false);
    } else if (this.status.fear > 0 && ENEMY_TYPES[this.type].fearMode !== 'stagger') {
      // Terror: run from the player and do not attack. sp is unchanged, so a
      // feared enemy retreats as fast as it would have advanced.
      //
      // A boss opts out with fearMode 'stagger'. Sending one running for the
      // far wall does not read as terror, it reads as the fight pausing - so
      // it falls through to its own ai(), which checks status.fear itself and
      // holds position without attacking.
      this.windup = 0;
      this.swing = 0;
      this._setEyeAlert(false);
      vx = -nx * sp;
      vz = -nz * sp;
    } else {
      // The type's own behaviour. A type with no ai() is inert on purpose -
      // `conduit` has no attack - which is also what the original chain did
      // with a type it had no branch for.
      _a.dt = dt;
      _a.ctx = ctx;
      _a.dist = dist;
      _a.nx = nx;
      _a.nz = nz;
      _a.px = px;
      _a.pz = pz;
      _a.sp = sp;
      _a.vx = 0;
      _a.vz = 0;
      const def = ENEMY_TYPES[this.type];
      if (def.ai) def.ai(this, _a);
      vx = _a.vx;
      vz = _a.vz;
    }

    // Push apart from crowding neighbours (squared test first to skip the sqrt).
    // Sized off both radii, so a big enemy keeps a big berth. For two
    // ordinary enemies rr is 1.0 and the push is 2.2 - the same numbers this
    // used when every enemy was the same size.
    for (const o of ctx.enemies) {
      if (o === this) continue;
      // Crowd separation is an XZ test, so without this a flier five metres up
      // would shoulder the ground crowd out of the way from above - and be
      // shoved off its own station by a chaser walking underneath it.
      if (o.flying !== this.flying) continue;
      const ox = this.pos.x - o.pos.x;
      const oz = this.pos.z - o.pos.z;
      const d2 = ox * ox + oz * oz;
      const rr = this.radius + o.radius;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        // A heavy enemy is not shoved aside by the crowd it is wading through.
        const push = o.immovable && !this.immovable ? 4.4 : this.immovable ? 0 : 2.2;
        vx += (ox / d) * push * rr;
        vz += (oz / d) * push * rr;
      }
    }

    const step = Math.hypot(vx, vz);
    const maxStep = sp * this.stepMul;
    if (step > maxStep) {
      const k = maxStep / step;
      vx *= k;
      vz *= k;
    }
    this.pos.x += vx * dt;
    this.pos.z += vz * dt;
    // KNOCKBACK, ON TOP OF WHATEVER THE AI WANTED. Added after the step cap so
    // being shoved is not something the enemy's own speed limit can argue with
    // - a knocked body moves at the speed it was hit with - and BEFORE the wall
    // clamp and the obstacle resolve below, which is the whole reason this
    // lives here rather than where the hit lands.
    if (this.knockT > 0) {
      const k = Math.min(this.knockT, dt);
      this.knockT -= dt;
      this.pos.x += this.knockX * k;
      this.pos.z += this.knockZ * k;
    }
    // Pulled in by however much wider than standard this enemy is, so a big
    // body stops at the wall rather than half inside it.
    const B = 21.6 - (this.radius - 0.5);
    // Kept from before the clamp: a charging boss needs to know the WALL
    // stopped it, and after the clamp there is nothing left to compare.
    const preX = this.pos.x;
    const preZ = this.pos.z;
    this.pos.x = Math.max(-B, Math.min(B, this.pos.x));
    this.pos.z = Math.max(-B, Math.min(B, this.pos.z));
    const hitWall = preX !== this.pos.x || preZ !== this.pos.z;
    const ix = this.pos.x;
    const iz = this.pos.z;
    // ---- THE GROUND UNDERFOOT ------------------------------------------
    //
    // `pos.y` used to be zero for everything that was not a flier, because
    // the arena had a flat floor and four things standing on it. It does not
    // any more: the interior is generated, and it is made of stairs, tiers and
    // decks that an enemy is expected to walk up in the same way the player
    // does.
    //
    // So a ground enemy now stands on whatever is under it. UP IS INSTANT -
    // that is what a step is, and it matches both the player's step and the
    // rule the flow field plans routes with, which is the important part: a
    // grid that promised a route collision then refused would have enemies
    // grinding into the side of a tread forever. DOWN IS A FALL, at a fixed
    // rate rather than under gravity, because these have no vertical velocity
    // of their own and a walk off a kerb should not become a plunge.
    //
    // BEFORE the push-out below, deliberately. Raising the feet first means
    // the box just climbed is one this enemy is standing ON, and resolveCircle
    // skips those - without the ordering it would be shoved straight back off
    // every step it took.
    // A BALLOON IS NOT STANDING ON ANYTHING. Skipping the snap is what lets the
    // altitude step below actually lift the body: the ground query would put it
    // back on the floor on the very next frame.
    if (!this.flying && this.balloonT <= 0) {
      const target = groundSurface(this.pos, this.radius, ctx.obstacles, STEP_HEIGHT);
      if (target > this.pos.y) {
        // THE BODY GOES UP NOW, THE MODEL CATCHES UP. `pos.y` has to move on
        // this frame - collision, the melee reach test and the flow field all
        // read it, and a body that lags them would be shot at where it is not.
        // But a rusher that teleports up 0.6m the instant its centre crosses a
        // tread reads as a glitch rather than as a step, so the DRAWN height
        // keeps an offset that eases away over STEP_EASE. Same trick the
        // player's camera uses, for the same reason.
        this._stepLag = Math.min(STEP_HEIGHT, this._stepLag + (target - this.pos.y));
        this.pos.y = target;
      } else if (target < this.pos.y) {
        this.pos.y = Math.max(target, this.pos.y - GROUND_FALL * dt);
      }
      if (this._stepLag > 0) {
        this._stepLag = Math.max(0, this._stepLag - this._stepLag * Math.min(1, dt / STEP_EASE) - dt * 0.15);
      }
    }
    // PHASING. A type that has raised `phase` this frame is not pushed back
    // out of what it is standing inside - which is how VOID's monolith walks
    // through pillars and decks in a dead straight line, and the only way in
    // the game to be un-hidable from.
    //
    // The arena clamp above still applies, so it cannot leave the room; only
    // the OBSTACLE resolve is skipped. And blockedBy is forced to zero for it,
    // because everything that reads that field is asking "did I slam into
    // something", and the answer for a phasing body is always no.
    if (this.phase) {
      this.phase = false;
      this.blockedBy = 0;
    } else {
      resolveCircle(this.pos, this.radius, ctx.obstacles, this.collideH);
    // Distance collision had to move it back this frame, walls included. A
    // charging boss reads it to know it slammed into something, which is
    // cheaper and more reliable than any extra geometry: the obstacle test has
    // already done the work.
      this.blockedBy = Math.hypot(this.pos.x - ix, this.pos.z - iz) + (hitWall ? 1 : 0);
    }

    // THE CROWD DANCES. This is written to group.position, never to this.pos,
    // so it is invisible to pathfinding, collision and the nav grid - all of
    // which read this.pos. The hitbox IS parented to the group and so bobs
    // with the model, which is what keeps shots landing where the enemy looks
    // like it is; that also means the amplitudes below are a real (small)
    // change to how hard a target is to hit, which is why they are small.
    //
    // Each beat is a hop that decays before the next one lands, rather than a
    // sine at some guessed tempo: the hop follows the music's own onsets, so
    // it stays in time through a tempo change or a breakdown. `danceLag`
    // spreads the responses out over a few frames so they do not all pop on
    // the same one - in unison it reads as a stutter, not a dance.
    //
    // A boss hops a third as high. Something that size travelling as far as a
    // rusher reads as weightless rather than heavy.
    //
    // The lag holds `_dance` below 1, so the measured hop is about 0.12 for a
    // rusher and 0.04 for a boss - visible across the arena, and small against
    // a hitbox radius of 0.5 to 0.72.
    const amp = this.boss ? 0.06 : 0.18;
    const lag = 15 - this.danceLag * 7;
    this._dance += (ctx.beat - this._dance) * Math.min(1, dt * lag);
    // A slow sway underneath, so an enemy is never perfectly still between
    // beats and a silent passage still leaves the crowd swaying.
    const sway = Math.sin(ctx.time * 1.8 + this.id) * 0.022 * (0.4 + ctx.level);
    // ALTITUDE, before the model is placed. An exponential approach rather
    // than a ramp, so a flier eases onto its station instead of arriving at
    // it: `flyRate` is what the ai() turns up to make a descent read as a
    // stoop and down to make a climb read as effort. A frozen flier holds the
    // altitude it had - dropping it out of the sky would be a free kill on the
    // one status that is already the strongest thing in the pool.
    if (this.igniteT > 0) this.igniteT -= dt;
    if (this.flying && this.status.freeze <= 0 && this.balloonT <= 0) {
      const target = Math.min(FLY_MAX_Y, this.hoverY);
      this.pos.y += (target - this.pos.y) * Math.min(1, dt * this.flyRate);
    }
    // AND THE BALLOON'S OWN CLIMB. A fixed rate rather than the exponential
    // approach a flier uses, because a flier is ARRIVING at a station it knows
    // and this is something drifting: it should still be visibly rising when
    // the five seconds are up, so the drop back is a fall from wherever it got
    // to rather than from a ceiling everything shares. The ground snap above
    // is skipped for the whole window, so what brings it down is that same
    // snap resuming - at GROUND_FALL, the rate everything in this game falls
    // off a ledge at.
    if (this.balloonT > 0) this.pos.y += BALLOON_RISE * dt;
    const bob = this.status.freeze > 0 ? 0 : this._dance * amp + sway;
    // `_stepLag` is the step-up smoothing above: the body is already at the new
    // height and the model is still on its way there.
    this.group.position.set(this.pos.x, this.pos.y - this._stepLag + bob, this.pos.z);
    // FACING IS THE PLAYER, unless the type has taken it. Everything in the
    // roster turns to look at you, which is right for everything that is
    // coming at you or shooting at you - and wrong for the two EMBER types
    // whose whole mechanic is a direction they have committed to. A kiln's
    // port has to point along the bar it is sweeping and an ashwing has to be
    // nose-first down a run it can no longer steer; both write their own yaw
    // in ai() and raise this, and it is cleared here every frame so a type
    // only holds the facing on the frames it actually asks for it.
    if (!this.faceLocked) this.group.rotation.y = Math.atan2(-dx, -dz);
    this.faceLocked = false;

    // THE WEIGHT SHIFT. Bouncing straight up and down reads as bobbing; what
    // makes it read as DANCING is the weight going side to side, so the lean
    // alternates on every beat.
    //
    // The side is flipped by an edge detector on the beat envelope rather than
    // by an oscillator at some assumed tempo, so it stays locked to the music
    // for free and needs no idea of what the BPM is.
    //
    // The group's Euler order is YXZ (set in the constructor), which puts this
    // roll INSIDE the yaw: the enemy leans about its own spine whichever way
    // it happens to be facing, instead of tipping toward a fixed world axis.
    const high = ctx.beat > 0.6;
    if (high && !this._beatHigh) this._leanSign = -this._leanSign;
    this._beatHigh = high;
    this._lean += (this._leanSign - this._lean) * Math.min(1, dt * 7);
    // Sized against the hitbox, not by eye. The hitbox is parented to the
    // group but sits at local y ~0.8, NOT at the origin, so a roll of theta
    // slides it sideways by sin(theta)*0.8. At the peak here that is about
    // 0.09 - under a fifth of the smallest hitbox radius - which keeps the
    // lean honest against a sphere the player is trying to hit.
    // Barely perceptible on a boss, for the same reason its hop is small.
    const leanAmp = this.boss ? 0.07 : 0.26;
    this.group.rotation.z = this.status.freeze > 0
      ? 0
      : this._lean * leanAmp * (0.45 + this._dance * 0.55);

    if (this.flash > 0) this.flash -= dt;
    this._setFlash(this.flash > 0);
  }

  // Returns true if this hit killed the enemy. Only sets `dead`; main.js does
  // the actual removal on its next sweep.
  //
  // `silent` skips the white hit flash. Damage over time calls this many times
  // a second, and a flash on every tick would bury the status tint that is the
  // whole visual tell for poison and fire.
  // `point` is the world-space position the hit landed at, when the caller has
  // one. Only a type whose armour is a PLACE on the body rather than a facing
  // needs it - see the Bulwark, whose small shield is tested against the spot
  // that was actually struck.
  // `head` is carried for the damage number alone - the doubling is already in
  // `d` by the time it gets here (see _hitMult in main.js), because a headshot
  // has to be read by armour like any other multiplier on the round.
  takeDamage(d, silent = false, dirX = 0, dirZ = 0, point = null, crit = false, head = false) {
    if (this.dead) return false;
    // SHARED PAIN, and it is the FIRST thing that happens to a blow because it
    // is not a modifier on this hit - it is a decision that this hit is not
    // landing here at all. The hook walks the whole living roster and deals an
    // even slice to each of them (this body included), through this same
    // method, with `_sharing` up so the split cannot split itself.
    //
    // It returns false - "this did not kill" - which is the honest answer: the
    // caller's target is not what was hit. Kills are collected by main.js's own
    // sweep whatever killed them, so nothing is lost by saying so.
    if (shareHook && !_sharing && !this.dead) {
      _sharing = true;
      shareHook(d, silent);
      _sharing = false;
      return false;
    }
    // A warded enemy takes NOTHING - not bullets, not blasts, not the damage
    // over time already ticking on it. A partial reduction here would leave
    // the player unsure whether their shots were working, which is the one
    // thing the warden must never be ambiguous about.
    if (this.wardT > 0) return false;
    // THE PLATE EATS ONE HIT, whatever it was worth. Deliberately not a
    // damage threshold and not a fraction: a plate that scaled with the blow
    // would be armour, and armour is a thing this game already has three of.
    // It is one shot, and the player pays it in ammunition and in time rather
    // than in aim - which is what makes a capacitor a DPS tax instead of a
    // wall. A silent tick of poison must not spend it, or the plate would be
    // gone before the player ever saw it.
    if (this.plated && !silent) {
      this.plated = false;
      this.flash = 0.12;
      this._applyBodyLook();
      if (plateSink) plateSink(this.pos);
      return false;
    }
    if (this.status.freeze > 0) d *= this.freezeVuln;
    // ARMOUR. `dirX, dirZ` is the direction the hit TRAVELLED, which is what
    // decides whether it landed on a shield or a weak point. Callers that have
    // no direction to give - damage over time, blasts, ash - pass nothing and
    // get armorDefault, and each type chooses what that means: a Bulwark's
    // shield does not stop poison (armorDefault 1) while a Colossus's plating
    // does (armorDefault 0.22).
    const def = ENEMY_TYPES[this.type];
    if (def.armor) {
      // armorDefault MAY BE A FUNCTION, and for anything whose armour is a
      // STATE rather than a facing it has to be. A constant is right for the
      // Bulwark, whose plate is a direction - there is no sensible facing for
      // a poison tick, so the type picks a number and lives with it. It is
      // wrong for armour that turns on and off: the Pale Crown's shell reads
      // zero, and as a constant that made the boss immune to fire, poison and
      // every blast in the game for the whole fight, shell up or not. The
      // glacier had the mirror of it - its crust went on halving damage over
      // time long after the crust had shattered.
      d *= (dirX || dirZ || point)
        ? def.armor(this, dirX, dirZ, point)
        : (typeof def.armorDefault === 'function' ? def.armorDefault(this) : def.armorDefault);
    }
    if (this.buffT > 0) d *= CONDUIT_RESIST;
    // WEAK POINT. Last of the multipliers and above nothing, because the card
    // says "from all sources": armour, the freeze bonus and the Conduit's
    // resistance have all had their say, and this lifts whatever survived them.
    if (this.marked) d *= MARK_MULT;
    this.hp -= d;
    // WHAT THE HIT WAS WORTH, NOT WHAT THE BODY HAD LEFT. `d` here is already
    // through ward, freeze vulnerability, armour facing and the Conduit's
    // resistance, so it is the true strength of the blow - and it is NOT
    // clamped to the remaining health. A rifle hitting a body with 5hp left
    // reads 40, because 40 is what the player's gun does; clamping it to 5
    // would make every killing blow in the game report a small number and turn
    // the one hit worth celebrating into the weakest-looking one on screen.
    if (damageSink) damageSink(this.pos, d, crit, head);
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
  /**
   * THE HALF THAT CANNOT WAIT. Everything the enemy is holding that something
   * else needs back, or that must stop being live the instant it dies.
   *
   * Split out of dispose() because the BODY now outlives the enemy by three
   * quarters of a second - it is handed to the corpse pool and thrown apart
   * (see Effects.corpse) - and none of this may be delayed with it.
   */
  release() {
    // A boss killed mid-telegraph is still holding a mark from the effects
    // pool, and that pool is only ten deep - leaking one every fight would
    // eventually leave later bosses unable to warn the player at all.
    const def = ENEMY_TYPES[this.type];
    if (def.cleanup) def.cleanup(this);
    this.hitbox.userData.enemy = null;
    this.head.userData.enemy = null;
  }

  /**
   * The per-instance materials, for whoever ends up freeing them. Everything
   * else on the body is cached and shared by every enemy of the type, and
   * disposing any of THAT would take the rest of the roster with it.
   */
  corpseMats() {
    const mats = [this.bodyMat, this.eyeMat, ...this._extraMats];
    // Emptied so a later dispose() cannot free them a second time - the corpse
    // pool owns them from here.
    this._extraMats.length = 0;
    return mats;
  }

  /**
   * Frees the body outright. Still the whole teardown for anything that is NOT
   * becoming a corpse - a run reset, a wave wiped between frames - where there
   * is no body left to look at.
   */
  dispose() {
    this.release();
    this.bodyMat.dispose();
    this.eyeMat.dispose();
    for (const m of this._extraMats) m.dispose();
    this._extraMats.length = 0;
  }
}

// ---- projectiles ---------------------------------------------------------
// Same story as enemies: one geometry and one material set per projectile
// type, reused for every shot fired.
// THE LOOK AND THE CURVE BOTH LIVE ON THE TYPE. They used to live here and in
// a per-type if/else chain in main.js's _spawnProjectile, plus a third table
// (PROJ_IMPACT) for the puff a round left when it broke on a wall - so adding
// one ranged enemy meant editing three places in two files and, in practice,
// forgetting the third. A `proj` block on the ENEMY_TYPES entry is now the
// whole definition, and a type without one fires the shooter's round.
const PROJ_DEFAULT = ENEMY_TYPES.shooter.proj;

// The look a round of `type` wears: core colour, additive glow, and the size
// multiplier on both. Also the colour of its impact puff - a round that broke
// against geometry splashes in its own glow, which is what the separate
// PROJ_IMPACT table was trying to say and got wrong for half the roster.
export function projLook(type) {
  const def = ENEMY_TYPES[type];
  return (def && def.proj) || PROJ_DEFAULT;
}

// [base, perWave, cap] -> the value at wave n. One curve shape for every enemy
// round in the game.
function projCurve(c, n) {
  return Math.min(c[2], c[0] + n * c[1]);
}

// Speed and damage for a round of `type` fired on wave n. A `proj` block that
// names no curve - a Spit, which carries its own flight and pays in the ground
// it grows - falls back to the shooter's numbers rather than to nothing.
export function projStats(type, n) {
  const p = projLook(type);
  return {
    speed: projCurve(p.speed || PROJ_DEFAULT.speed, n),
    dmg: projCurve(p.dmg || PROJ_DEFAULT.dmg, n),
  };
}

const projMats = new Map();

function projectileMats(type, glowTex) {
  let m = projMats.get(type);
  if (!m) {
    const c = projLook(type);
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
    // How many times it may reflect off the arena walls before it breaks. Off
    // the type's own `proj` block, so a bouncing round is a field on a stat
    // block rather than a subclass. Zero for everything but STRATA's slinger.
    this.bounces = projLook(type).bounce || 0;
    // How hard it turns toward the player, in radians a second. Zero for
    // everything but BRINE's angler - a round that steers is a round the
    // player cannot answer by walking, which is the whole reason the only one
    // in the game is also the only one that can be shot down.
    this.home = projLook(type).home || 0;

    const mats = projectileMats(type, glowTex);
    this.mesh = new THREE.Mesh(geo('projectile', () => new THREE.SphereGeometry(0.1, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(mats.scale);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    // A ROUND THAT IS A TARGET. The mesh is a tenth of a metre across, which
    // is nothing to aim at, so a shootable round is grown to something the
    // player can plausibly hit and tagged for _firePellet the same way a totem
    // or the mystery box is - one more `userData` branch rather than a second
    // raycast pass.
    if (projLook(type).shootable) {
      this.mesh.scale.setScalar(2.6);
      this.mesh.userData.bubble = this;
      this.shootable = true;
    }
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    // STEERED, NOT AIMED. The velocity is turned toward the player by a fixed
    // number of radians a second and its SPEED is never changed, so a homing
    // round arrives late and from the side rather than accelerating into
    // somebody - and a hard enough turn away from it still beats it.
    if (this.home > 0 && ctx.player) {
      const t = ctx.player.eyeInto(_tmpTarget);
      _projSteer.set(t.x - this.pos.x, t.y - this.pos.y, t.z - this.pos.z);
      if (_projSteer.lengthSq() > 1e-6) {
        _projSteer.normalize().multiplyScalar(this.speed);
        // Blended rather than rotated: the two are indistinguishable at this
        // turn rate, and a lerp cannot produce the sign errors a hand-rolled
        // rotation toward a moving target can.
        const k = Math.min(1, this.home * dt);
        this.vel.lerp(_projSteer, k);
        this.vel.normalize().multiplyScalar(this.speed);
      }
    }
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.pos.distanceTo(ctx.player.eyeInto(_tmpTarget)) < 0.7) {
      ctx.onHitPlayer(this.damage, this.pos);
      return 'hit';
    }
    if (this.pos.y <= 0.03) return 'wall';

    // THE WALLS TURN IT, if it has a bounce left.
    //
    // The arena's own half-width, and NOT the obstacles. A wall is axis
    // aligned and has a normal to hand; a crate does not, and a stone caroming
    // off the corner of one at an angle nobody could predict would be noise
    // rather than a mechanic. The contract the player is being asked to read
    // is "look at the line, look at the wall behind you, know where it comes
    // out", and only the walls can keep it.
    if (this.bounces > 0) {
      let turned = false;
      if (Math.abs(this.pos.x) > PROJ_BOUND && this.vel.x * Math.sign(this.pos.x) > 0) {
        this.vel.x = -this.vel.x;
        turned = true;
      }
      if (Math.abs(this.pos.z) > PROJ_BOUND && this.vel.z * Math.sign(this.pos.z) > 0) {
        this.vel.z = -this.vel.z;
        turned = true;
      }
      if (turned) {
        this.bounces--;
        // Given its life back, so a stone thrown across the room still has
        // time to come all the way back after it turns.
        this.life = Math.max(this.life, 2);
        if (ctx.effects) ctx.effects.burst(this.pos, projLook(this.type).glow, 8, 3, 1, 0.3);
      }
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) return 'wall';
    return 'alive';
  }
}

// The blight's spit. A lobbed glob that leaves a creep pool WHERE IT LANDS,
// which is the whole point of it existing: the pool used to appear under the
// player with nothing in the air to warn them.
//
// Ballistic rather than straight, and the arc is solved at spawn (see
// _spawnSpit) rather than fired at a fixed elevation like Grenade: a glob that
// visibly climbs, hangs and falls is readable from anywhere in the arena,
// including from directly underneath, where a flat shot is a dot that does not
// move. Horizontal speed is constant, so flight time scales with range and a
// far-off blight telegraphs itself for over a second.
//
// It deals NO impact damage. The blight's own `damage` is 0 and always has
// been - it is a zoner, the pool is the entire threat, and giving the glob a
// hit would quietly rewrite that enemy's role.
// Which type's `proj` block a spit of each kind wears. Adding a fourth kind is
// a row here and a row in HAZARD_KINDS, and nothing else.
// Where a bouncing round turns. Just inside the arena's own half-width, so the
// stone visibly meets the wall rather than passing through it and reappearing.
// Where a bouncing round turns. Just inside the arena's own half-width, so the
// stone visibly meets the wall rather than passing through it and reappearing.
const PROJ_BOUND = ARENA_HALF - 0.4;

const _projSteer = new THREE.Vector3();

// Which type's `proj` block a spit of each kind wears. Adding a kind is
// a row here, a row in HAZARD_KINDS and a row in SPIT_CONFIG, and nothing
// else.
const SPIT_LOOK = {
  pool: 'blight', gas: 'vitriol', ember: 'flare', hail: 'hailer', seed: 'sporegun',
  well: 'singularity', egg: 'brooder',
};

export class Spit {
  /**
   * @param {string} kind which HAZARD_KINDS row the pool it grows belongs to.
   *   'pool' is the blight's - ground that costs health while you stand on it.
   *   'gas' is the vitriol's - a cloud that keeps working after you leave. The
   *   glob in the air wears the same colour as what it becomes, so the two are
   *   read as one thing from the moment it is thrown.
   */
  constructor(scene, glowTex, x, y, z, vx, vy, vz, radius, life, dps, kind = 'pool') {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(vx, vy, vz);
    this.radius = radius;
    this.poolLife = life;
    this.dps = dps;
    this.kind = kind;
    this.life = 5;
    // Which enemy's colours the glob in the air wears. A third kind arrived
    // with EMBER, so this is a lookup rather than the ternary it used to be -
    // the point is unchanged: what is flying and what it becomes are one
    // thing, read as one thing from the moment it is thrown.
    this.type = SPIT_LOOK[kind] || 'blight';
    // How many patches it opens where it lands, and in what shape. One for the
    // blight and the vitriol; the flare's shell bursts into a FAN along its
    // own heading, and the hailer's cluster into a gapped RING around where it
    // came down - see _land. The two shapes are two different questions: a fan
    // is ground behind you and a ring is ground AROUND you. The brooder's egg
    // is a single glob too - its cluster is of MORTARS, in _land, not of
    // patches here.
    this.burst = kind === 'ember' ? FLARE_BURST : kind === 'hail' ? HAIL_RING_N : 1;
    this.burstShape = kind === 'hail' ? 'ring' : 'fan';

    const mats = projectileMats(this.type, glowTex);
    this.mesh = new THREE.Mesh(geo('spit', () => new THREE.SphereGeometry(0.22, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(mats.scale);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    // Wobbles as it flies. A perfect sphere on a perfect parabola reads as a
    // UI marker; a tumbling lump reads as something an animal spat.
    this.mesh.rotation.x += dt * 6;
    this.mesh.rotation.y += dt * 4;

    // Only the FLOOR and obstacle tops grow creep. A glob that clipped a wall
    // mid-flight has nothing to pool on, so it just splashes.
    if (this.pos.y <= 0.12) {
      this.pos.y = 0.12;
      this._land(ctx);
      return 'landed';
    }
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this._land(ctx);
      return 'landed';
    }
    return 'alive';
  }

  _land(ctx) {
    // A SEED GROWS NOTHING WHEN IT LANDS. It is the only spit kind that does
    // not become ground at all - it becomes a MORTAR, which is to say a circle
    // that fills for two seconds and then goes off. That is VERDANT's whole
    // idea expressed in one branch: the thing you were shown and the thing you
    // are charged for are two seconds apart, and the floor in between is
    // completely safe.
    if (this.kind === 'seed') {
      if (ctx.addMortar) {
        ctx.addMortar(this.pos.x, this.pos.z, SPORE_RADIUS, SPORE_SPROUT, SPORE_DAMAGE);
      }
      if (ctx.effects) {
        ctx.effects.burst(this.pos, projLook(this.type).glow, 10, 2.5, 1, 0.4);
      }
      return;
    }
    // A brooder's egg, and the same bargain the seed makes one of: the glob
    // grows NOTHING when it lands, and what it becomes is a NEST of mortars
    // rather than a single one - three filling circles close enough to read
    // as a cluster, so the question is "be off that nest" rather than "be off
    // that spot". Same delay, same completely safe floor in between.
    if (this.kind === 'egg') {
      if (ctx.addMortar) {
        const off = Math.random() * Math.PI * 2;
        for (let i = 0; i < EGG_CLUSTER; i++) {
          const ang = off + (i / EGG_CLUSTER) * Math.PI * 2;
          ctx.addMortar(
            this.pos.x + Math.cos(ang) * EGG_CLUSTER_SPREAD,
            this.pos.z + Math.sin(ang) * EGG_CLUSTER_SPREAD,
            this.radius, this.poolLife, this.dps
          );
        }
      }
      if (ctx.effects) {
        ctx.effects.burst(this.pos, projLook(this.type).glow, 10, 2.5, 1, 0.4);
      }
      return;
    }
    if (ctx.addHazard) {
      if (this.burstShape === 'ring') {
        // A RING around the impact point, with a gap in it. Gapped because a
        // closed ring around a player who has just been slowed by the theme's
        // own ground is a tax rather than a decision - the gap is what makes
        // it a question of picking your side before it lands.
        const off = Math.random() * Math.PI * 2;
        const gapAt = (Math.random() * this.burst) | 0;
        for (let i = 0; i < this.burst; i++) {
          if (((i - gapAt + this.burst) % this.burst) < HAIL_RING_GAP) continue;
          const ang = off + (i / this.burst) * Math.PI * 2;
          ctx.addHazard(
            this.pos.x + Math.cos(ang) * HAIL_RING_R,
            this.pos.z + Math.sin(ang) * HAIL_RING_R,
            this.radius, this.poolLife, this.dps, this.kind
          );
        }
      } else if (this.burst > 1) {
        // A FAN, opening along the direction of travel. Centred on the impact
        // point and thrown FORWARD of it, so the fire lands past whatever the
        // shell was aimed at - a player who backs off down the shell's own
        // line meets every arm of it, and a player who steps across meets the
        // edge at worst.
        const a0 = Math.atan2(this.vel.z, this.vel.x);
        for (let i = 0; i < this.burst; i++) {
          const a = a0 + (i - (this.burst - 1) / 2) * FLARE_BURST_SPREAD;
          ctx.addHazard(
            this.pos.x + Math.cos(a) * FLARE_BURST_REACH,
            this.pos.z + Math.sin(a) * FLARE_BURST_REACH,
            this.radius, this.poolLife, this.dps, this.kind
          );
        }
      } else {
        ctx.addHazard(this.pos.x, this.pos.z, this.radius, this.poolLife, this.dps, this.kind);
      }
    }
    // The splash wears the glob's own colour, so the moment it lands says
    // which of the two it was.
    if (ctx.effects) {
      ctx.effects.burst(this.pos, projLook(this.type).glow, 14, 4, 2, 0.45);
    }
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

    // Horizontal test only. A shard flies at chest height and an enemy's `pos`
    // is at its FEET, so a 3D distance here was never smaller than the metre
    // between them and the shards sailed straight through everything - they
    // only ever went off on their fuse. Every enemy is taller than it is wide
    // and stands on the floor, so the XZ distance is the right comparison.
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dx = this.pos.x - e.pos.x;
      const dz = this.pos.z - e.pos.z;
      const reach = e.radius + 0.4;
      if (dx * dx + dz * dz < reach * reach) {
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
    // The blast is measured from the floor under the shard, not from the shard
    // itself: enemy positions are at floor level, and blasting from chest
    // height would spend a metre of the radius on the vertical gap.
    _tmpTarget.set(this.pos.x, 0, this.pos.z);
    ctx.onBlast(_tmpTarget, this.damage, this.radius);
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
    this.mesh.visible = false;
  }
}
