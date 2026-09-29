// CATHEDRAL's six enemies and its boss.
//
// One file per theme, and it imports NOTHING from any other theme - see
// shared.js for why. What is here is this theme's stat blocks, its models, its
// behaviour and the constants only it uses; anything a second theme wanted is
// in shared.js by construction.
//
// The entries are registered into ENEMY_TYPES at the bottom rather than
// exported for someone else to assemble, so importing this file is what puts
// the theme in the game and index.js is a list of imports rather than a table
// that has to be kept in step with twelve others.

import * as THREE from 'three';
import {
  ARENA_HALF, BOSS_REACH_Y, ENEMY_TYPES, SHARED_MATS, _blinkAt, _bossAt,
  _reachY, aiMelee, bossTouch, eyes, geo, landHit, lump, orbit, partsFor,
  prism, slab, shard, spike,
} from './shared.js';

// ---- the theme --------------------------------------------------------------
//
// THE SANCTUARY, AND THE TOLL FOR STANDING IN IT. Every theme in the game
// spends something - EMBER spends floor, SOLAR spends information, HIVE spends
// bodies. CATHEDRAL spends SANCTION: nearly everything here is harmless while
// you are being watched and worse the moment you look away, or it stands in a
// lit circle and is made weaker by leaving it. It is the theme of THRESHOLDS -
// the arch, the grave, the veil - and every mechanic below is one crossing:
//
//   penitent  crosses itself and takes 30% LESS damage while it kneels - but
//             it cannot move, and it rises to strike. The whole body folds
//             visibly into the prayer rather than hiding its hood, so the
//             quieter damage window and the coming stroke read as one pose.
//   curate    fires SLOW rounds that pass straight through cover - the only
//             gunner in the game that does. The answer is not to break line
//             of sight, because there is none to break; it is to be somewhere
//             the round arrives anyway or to kill the curate first. Its
//             lantern dims as it charges, so the lane it is about to take
//             from you is on the model.
//   pallbearer  turns the coffin into a battering ram. It plants, hoists the
//             coffin upright and paints the lane it has committed to before
//             charging down it and slamming the burden into the floor. Step
//             sideways, then punish the long recovery after the impact.
//   thurible   swings a smoking censer that drags a slow veil of incense
//             across the floor. The veil blinds like the drifter's ink but
//             is walked rather than thrown: it goes where the thurible
//             goes, so the answer is to notice which way it is walking and
//             not to stand on the far side of the room from it.
//   sacristan  THE BELL RINGER. No attack. While it lives, every enemy that
//             dies NEAR it tolls - and the toll CHILLS you, wherever you are,
//             which makes it the one support whose price is paid by the
//             killing you are already doing. A wave with a sacristan in it
//             is a wave where every kill takes your legs for a moment.
//   vigil      the light in the tower. It holds station, and anyone standing
//             in its beam is SEEN: the beam slows whatever it touches, and
//             the vigil fires a lance at where the beam is now rather than
//             at where the player is. Standing off the beam is free, which
//             makes it the weeper's question turned on its side.
//
// THE SHARED SILHOUETTE IS THE ARCH AND THE LANTERN. Every body carries lit
// brass - a lamp on a pole, a censer on chains, a crown of candles - and every
// body's outline is cut by an ARCH: two uprights and something spanning the
// top, so at a distance a CATHEDRAL enemy reads as a doorway walking about.
// Where HIVE is the sac, CATHEDRAL is the LAMP HELD HIGH.
//
// SO IT IS THE THEME WHERE LOOKING AWAY IS THE MISTAKE. A penitent you stop
// watching rises. A pallbearer you fail to sidestep brings the whole grave
// down on you. A sacristan you leave alive is charging you by the kill. The
// question it asks is the plague's question inverted: not what order to kill
// in, but WHICH OF THEM IS STILL COUNTING.

// ---- the materials ---------------------------------------------------------
// One body material and one lit accent, the tank's contract: the family reads
// as CATHEDRAL through the pale brass each carries, and the lamp keeps its own
// colour while the body under it is tinted by a status - so a frozen penitent
// is still recognisably carrying a light. shared.js holds them for the reason
// hiveSac lives there: the materials are built at module evaluation, before any
// theme has registered, so a colour read off a type block there would be
// reading an empty table.

// ---- the penitent ----------------------------------------------------------

// THE KNEEL. How long the penitent stays down, how long the rise takes, and
// the reach and cost of the stroke that ends it.
//
// The kneel reduces incoming damage by 30%. It is still a defensive posture,
// but never a period where hits and ammunition simply disappear.
export const PEN_KNEEL = 1.1;

export const PEN_RISE = 0.42;

export const PEN_STROKE_R = 2.6;

export const PEN_STROKE_CD = 1.4;

export const PEN_TOUCH = 12;

export const PEN_KNEEL_ARMOR = 0.7;

function posePenitent(e, dt, target) {
  if (!e.penUpper) return;
  e.penPose = (e.penPose || 0) + (target - (e.penPose || 0)) * Math.min(1, dt * 12);
  const k = e.penPose;
  // THE BODY KNEELS, not the hat. Lowering the whole upper silhouette and
  // folding both legs makes the state readable even when the small hood is
  // hidden by a crowd or clipped against the top of the screen.
  e.penUpper.position.set(0, -0.42 * e.scale * k, -0.1 * e.scale * k);
  e.penUpper.rotation.x = -0.18 * k;
  for (const leg of e.penLegs || []) {
    leg.position.y = (0.24 - 0.09 * k) * e.scale;
    leg.position.z = 0.15 * e.scale * k;
    leg.rotation.x = 0.28 + 1.0 * k;
  }
  // The ray targets follow the visible body. Without this, kneeling would
  // move the model while leaving an invisible standing target above it.
  if (e.hitbox) {
    if (e.penHitY === undefined) e.penHitY = e.hitbox.position.y;
    e.hitbox.position.y = e.penHitY - 0.3 * e.scale * k;
  }
  if (e.head) {
    if (e.penHeadY === undefined) e.penHeadY = e.head.position.y;
    e.head.position.y = e.penHeadY - 0.42 * e.scale * k;
  }
}

export function aiPenitent(e, a) {
  // pState: 'walk' | 'kneel' | 'rise'
  if (e.pState === undefined) {
    e.pState = 'walk';
    e.pT = 0.8 + Math.random() * 0.8;
  }

  // THE KNEEL, and it outranks the melee: the penitent kneels whether or not
  // the player is in reach, because the kneel is a promise about the next
  // stroke rather than a swing of its own.
  if (e.pState === 'kneel') {
    e.pT -= a.dt;
    posePenitent(e, a.dt, 1);
    // Frozen in place, in every sense: no movement, and any half-wound swing
    // is abandoned. The melee cycle's own windup test cannot fire here because
    // the branch never reaches it.
    a.vx = 0;
    a.vz = 0;
    e.windup = 0;
    e.swing = 0;
    e._setEyeAlert(true);
    if (e.pT > 0) return;
    e.pState = 'rise';
    e.pT = PEN_RISE;
    return;
  }

  if (e.pState === 'rise') {
    e.pT -= a.dt;
    posePenitent(e, a.dt, Math.max(0, e.pT / PEN_RISE));
    // It walks through the rise, slowly: the whole tell is a kneeling thing
    // standing up, and it should read as approaching rather than as frozen.
    a.vx = a.px * a.sp * 0.4;
    a.vz = a.pz * a.sp * 0.4;
    if (e.pT > 0) return;
    e.pState = 'walk';
    e.pT = PEN_STROKE_CD * 0.5;
    // THE STROKE. One hard hit on the rise, through the shared door so
    // whatever the type carries rides it - then the arm comes down and it
    // is an ordinary rusher until it kneels again.
    const dy = Math.abs(a.ctx.player.pos.y - e.pos.y);
    if (a.dist < PEN_STROKE_R && dy < 2.4) {
      landHit(e, a.ctx, PEN_TOUCH);
    }
    e.attackCd = PEN_STROKE_CD;
    _blinkAt.set(e.pos.x, 1.0, e.pos.z);
    if (a.ctx.effects) a.ctx.effects.burst(_blinkAt, 0xe8d9a8, 10, 4, 2, 0.35);
    return;
  }

  // walk. The shared melee cycle carries it, and the kneel is armed by
  // distance rather than by damage: a penitent closes, kneels AT the player,
  // and the rise is the attack.
  aiMelee(e, a);
  posePenitent(e, a.dt, 0);
  e.pT -= a.dt;
  if (e.pT <= 0) {
    if (a.dist < 9) {
      e.pState = 'kneel';
      e.pT = PEN_KNEEL;
      if (a.ctx.effects) {
        _blinkAt.set(e.pos.x, 0.2, e.pos.z);
        a.ctx.effects.shockwave(_blinkAt, 0xc0a860, 1.4, 0.3);
      }
    } else {
      e.pT = 0.5;
    }
  }
}

// ---- the curate -------------------------------------------------------------

// The round that walks through cover. Slow, and deliberately so: it is a
// processional pace, and the answer to it is movement rather than a pillar.
export const CURATE_SPEED = [9, 0.12, 12];

export const CURATE_DMG = [7, 0.3, 12];

export const CURATE_RANGE = 30;

export const CURATE_CD = 2.8;

// THE CHARGE, in seconds, and the lantern's dims are the tell. Long for a
// gunner, because the answer to this one is not reactive - it is noticing the
// dim lamp early and being elsewhere by the time the round is cast.
export const CURATE_TELL = 0.85;

// How much of the lantern's glow the charge eats, in fractions of one.
export const CURATE_DIM = 0.25;

export function aiCurate(e, a) {
  orbit(e, a, ENEMY_TYPES.curate.orbit);
  if (e.cuT > 0) {
    e.cuT -= a.dt;
    // THE LANTERN DIMS as the charge builds - the one readable sign of what
    // is coming, carried on the model so it survives a crowd.
    if (e.cuLamp) {
      const k = Math.max(CURATE_DIM, 1 - (1 - e.cuT / CURATE_TELL) * 0.75);
      e.cuLamp.scale.setScalar(k * e.scale);
    }
    if (e.cuT > 0) return;
    e.cuT = 0;
    if (e.cuLamp) e.cuLamp.scale.setScalar(1 * e.scale);
    e._setEyeAlert(false);
    // FIRED AT THE PLAYER'S EYE, as every round in the game is. The cover
    // does nothing - that is on the round's own `ghost` row, read by
    // Projectile.update, not on the aim.
    a.ctx.addProjectile(e.pos.x, 1.15, e.pos.z, 'curate', e._projScale());
    _blinkAt.set(e.pos.x, 1.15, e.pos.z);
    if (a.ctx.effects) a.ctx.effects.burst(_blinkAt, 0xe8d9a8, 8, 3, 2, 0.4);
    return;
  }
  if (e.attackCd > 0 || a.dist > CURATE_RANGE) return;
  e.attackCd = CURATE_CD + Math.random() * 0.9;
  e.cuT = CURATE_TELL;
  e.flash = 0.14;
  e._setEyeAlert(true);
}

// ---- the pallbearer ---------------------------------------------------------
//
// THE BURDEN. The pallbearer is fully vulnerable and turns its coffin into a
// committed attack instead: stop, hoist it upright, show the lane, charge,
// then slam it flat. The line is fixed when the tell begins, so the answer is
// a sidestep rather than pouring more ammunition into hidden armour.
export const PALL_TELL = 0.9;

export const PALL_CHARGE_TIME = 0.9;

export const PALL_CHARGE_MUL = 3.8;

export const PALL_CHARGE_CAP = 7;

export const PALL_LANE_LEN = 6.4;

export const PALL_SLAM_R = 2.8;

export const PALL_RECOVER = 1.15;

export const PALL_ATTACK_CD = 3.2;

function facePallbearer(e) {
  e.faceLocked = true;
  e.group.rotation.y = Math.atan2(-e.palDX, -e.palDZ);
}

function posePallbearer(e, state, fill = 0) {
  if (!e.palRig || !e.palCoffin) return;
  let crouch = 0;
  let lift = 0;
  let impact = 0;
  if (state === 'tell') { crouch = fill; lift = fill; }
  else if (state === 'charge') { crouch = 1; lift = 1; }
  else if (state === 'recover') { impact = fill; crouch = fill; }

  // THE WHOLE SILHOUETTE COMMITS. The carrier drops its shoulders while the
  // coffin rotates from a horizontal burden to a tall shield. At impact the
  // coffin is visibly on the floor, then both it and the carrier stand back up.
  e.palRig.position.y = -0.18 * e.scale * crouch;
  e.palRig.rotation.x = -0.13 * crouch;
  e.palCoffin.position.y = (0.9 + 0.34 * lift - 0.5 * impact) * e.scale;
  e.palCoffin.position.z = -0.1 * e.scale * (lift + impact);
  e.palCoffin.rotation.x = -1.22 * lift;
}

export function releasePallbearer(e) {
  if (e.palMark >= 0 && e.palFx) e.palFx.markRelease(e.palMark);
  e.palMark = -1;
}

function pallbearerSlam(e, a) {
  e.palState = 'recover';
  e.palT = PALL_RECOVER;
  e.stepMul = 1.4;
  a.vx = 0;
  a.vz = 0;
  const dy = Math.abs(a.ctx.player.pos.y - e.pos.y);
  if (a.dist < PALL_SLAM_R && dy < 2.4) landHit(e, a.ctx);
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 0.12, e.pos.z);
    a.ctx.effects.shockwave(_blinkAt, 0xc0a860, PALL_SLAM_R, 0.42);
    a.ctx.effects.burst(_blinkAt, 0xe8d9a8, 18, 4.5, 1.8, 0.55);
  }
  if (a.ctx.sfx) a.ctx.sfx.impact();
}

export function aiPallbearer(e, a) {
  e.stepMul = 1.4;
  if (e.palState === undefined) {
    e.palState = 'walk';
    e.palT = 0;
    e.palCd = 1.0 + Math.random() * 0.8;
    e.palMark = -1;
  }
  if (e.palLamp) e.palLamp.rotation.y += a.dt * 0.8;

  if (e.palState === 'tell') {
    e.palT -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e.windup = 0;
    e.swing = 0;
    facePallbearer(e);
    const fill = 1 - Math.max(0, e.palT) / PALL_TELL;
    posePallbearer(e, 'tell', fill);
    if (e.palMark >= 0 && e.palFx) {
      e.palFx.markSet(
        e.palMark,
        e.pos.x + e.palDX * PALL_LANE_LEN * 0.5,
        e.pos.z + e.palDZ * PALL_LANE_LEN * 0.5,
        0.9, 0xc0a860, fill, PALL_LANE_LEN / 1.8,
        Math.atan2(-e.palDX, -e.palDZ), 0.35
      );
    }
    if (e.palT > 0) return;
    releasePallbearer(e);
    e.palState = 'charge';
    e.palT = PALL_CHARGE_TIME;
    e._setEyeAlert(false);
    return;
  }

  if (e.palState === 'charge') {
    e.palT -= a.dt;
    e.stepMul = PALL_CHARGE_MUL;
    facePallbearer(e);
    posePallbearer(e, 'charge', 1);
    // Preserve status slows while capping the base rush. Otherwise a late-wave
    // speed multiplier would turn the announced six-metre lane into twelve.
    const slow = Math.min(1, a.sp / Math.max(0.001, e.speed));
    const sp = Math.min(PALL_CHARGE_CAP, e.speed * PALL_CHARGE_MUL) * slow;
    a.vx = e.palDX * sp;
    a.vz = e.palDZ * sp;
    const ahead = a.nx * e.palDX + a.nz * e.palDZ > 0;
    if ((ahead && a.dist < PALL_SLAM_R * 0.72) || e.palT <= 0 || e.blockedBy > 0.05) {
      pallbearerSlam(e, a);
    }
    return;
  }

  if (e.palState === 'recover') {
    e.palT -= a.dt;
    a.vx = 0;
    a.vz = 0;
    posePallbearer(e, 'recover', Math.max(0, e.palT) / PALL_RECOVER);
    if (e.palT > 0) return;
    e.palState = 'walk';
    e.palCd = PALL_ATTACK_CD;
    posePallbearer(e, 'walk');
    return;
  }

  posePallbearer(e, 'walk');
  aiMelee(e, a);
  e.palCd -= a.dt;
  if (e.palCd > 0 || a.dist < 4 || a.dist > 10 || e.windup > 0 || e.swing > 0) return;
  e.palState = 'tell';
  e.palT = PALL_TELL;
  e.palDX = a.nx;
  e.palDZ = a.nz;
  e._setEyeAlert(true);
  if (a.ctx.effects) {
    e.palFx = a.ctx.effects;
    e.palMark = a.ctx.effects.markAcquire();
  }
}

// ---- the thurible -----------------------------------------------------------

// THE VEIL: how wide each patch of incense is, how long it hangs, how often
// the censer drops one, and what it costs to stand in one. No damage at all -
// what the veil takes is sight, and it takes it only while you are in it.
export const THUR_VEIL_R = 2.6;

export const THUR_VEIL_LIFE = 6.5;

export const THUR_VEIL_DROP = 0.22;

// How much of the screen the veil takes, and for how long: the drifter's
// numbers, because it is the drifter's mechanic walked rather than thrown.
export const THUR_BLIND = 1.1;

// Which lane the censer walks: hold the same orbit the theme's other keepers
// hold, and pour down the middle of it.
export const THUR_RANGE = 24;

export function aiThurible(e, a) {
  // First-frame state. thurDrop is the veil's own clock and starts live, so
  // a thurible that spawns in reach of the player begins pouring at once -
  // `undefined -= dt` is NaN, and NaN <= 0 is false, which would leave a
  // thurible that never poured at all.
  if (e.thurDrop === undefined) e.thurDrop = 0;
  orbit(e, a, ENEMY_TYPES.thurible.orbit);
  // THE SWING. The censer pendulums on its chains, and the whole model is
  // read as a walking smoke source - the smoke is on the floor, the censer
  // is where it comes from, and the two have to agree every frame.
  const t = a.ctx.time * 2.2 + e.id;
  if (e.thurArm) e.thurArm.rotation.x = Math.sin(t) * 0.25;
  if (e.thurCenser) e.thurCenser.position.x = Math.sin(t * 1.6) * 0.18 * e.scale;
  // A slow haze, dropped along the walk. The pools do the work; the swing is
  // the author, which is the whole thurible.
  e.thurDrop -= a.dt;
  if (e.thurDrop <= 0 && a.dist < THUR_RANGE) {
    e.thurDrop = THUR_VEIL_DROP;
    a.ctx.addHazard(e.pos.x, e.pos.z, THUR_VEIL_R, THUR_VEIL_LIFE, 0, 'incense');
    if (a.ctx.effects) {
      _blinkAt.set(e.pos.x, 0.4, e.pos.z);
      a.ctx.effects.burst(_blinkAt, 0xcfc09a, 5, 1.2, 0.8, 0.9);
    }
  }
}

// ---- the sacristan ----------------------------------------------------------

// THE TOLL. How far a death has to be from the sacristan to ring its bell,
// how long the chill it puts on the player lasts, and how often one bell may
// sound. The chill is slowness - the theme's own answer to what a kill should
// cost, and the sacristan is the only support in the game that the player
// pays by the kill rather than by the minute.
export const SACR_TOLL_R = 14;

export const SACR_CHILL = 2.2;

// How long after one toll before the bell can sound again - so a crowd dying
// in a burst is a bill paid once, not eight times.
export const SACR_TOLL_CD = 1.8;

// The ring it draws on the floor: the radius the bell is heard at, made
// visible, the hoarfrost's contract. A player who cannot see which kills will
// cost and which will not is playing a game that lies to them.
export const SACR_RING_OPACITY = 0.4;

export function aiSacristan(e, a) {
  orbit(e, a, ENEMY_TYPES.sacristan.orbit);
  // The bell turns. Slow, and heavier than the conduit's rings - a bell is
  // read as a weight.
  if (e.sacBell) e.sacBell.rotation.y += a.dt * 0.6;
  if (e.sacRing) e.sacRing.rotation.z += a.dt * 0.15;
  // The ring's edge brightens as the bell comes ready again.
  const ready = (e.sacCd || 0) <= 0;
  if (e.sacRingMat) {
    e.sacRingMat.opacity = ready ? SACR_RING_OPACITY * 1.6 : SACR_RING_OPACITY;
  }
  e.sacCd = (e.sacCd || 0) - a.dt;
  e._setEyeAlert(ready);
  if (!ready) return;

  // WHAT DIED NEARBY THIS FRAME. Read off the enemy list rather than hooked
  // into the kill path, for the carrion's reason: `dead` is set before the
  // sweep runs and cleared by nothing, so one pass here sees every body on
  // the frame it falls and never sees it twice.
  for (const o of a.ctx.enemies) {
    if (!o.dead || o === e || o.boss || o.type === 'sacristan') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > SACR_TOLL_R * SACR_TOLL_R) continue;
    // THE TOLL, paid by the player wherever they are standing. The bell is
    // the point: it costs nothing to be near the sacristan, and everything
    // to kill near one.
    e.sacCd = SACR_TOLL_CD;
    if (a.ctx.applyPlayerStatus) a.ctx.applyPlayerStatus('slowness', SACR_CHILL);
    if (a.ctx.effects) {
      _blinkAt.set(e.pos.x, 1.4, e.pos.z);
      a.ctx.effects.shockwave(_blinkAt, 0xc0a860, SACR_TOLL_R * 0.5, 0.4);
      a.ctx.effects.burst(_blinkAt, 0xe8d9a8, 8, 3, 2, 0.4);
    }
    if (a.ctx.sfx) a.ctx.sfx.impact();
    break;
  }
}

// ---- the vigil --------------------------------------------------------------

// THE BEAM. Its range, what standing in it costs, and how the lance is read.
// The beam SLOWS: it is the watch made physical, and the slow is the reason
// the vigil's own lance is a threat rather than decoration.
export const VIGIL_RANGE = 26;

export const VIGIL_SLOW = 0.55;

export const VIGIL_LANCE_CD = 3.2;

export const VIGIL_TELL = 0.75;

// The station it keeps, and the height it keeps it at.
export const VIGIL_HIGH = 5.4;

export const _vigilTo = new THREE.Vector3();

export function aiVigil(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  if (e.vgState === undefined) {
    e.vgState = 'watch';
    e.vgT = 1 + Math.random() * 1.4;
    e.vgLanceCd = VIGIL_LANCE_CD;
  }

  if (e.vgState === 'tell') {
    e.vgT -= a.dt;
    e._setEyeAlert(true);
    e.hoverY = VIGIL_HIGH - 0.8;
    e.flyRate = 4;
    a.vx = 0;
    a.vz = 0;
    // The beam narrows and brightens through the tell, and the bearing is
    // LOCKED at the start of it: what the beam showed is where the lance
    // goes, which is the whole counter-play.
    if (ctx.effects) {
      _bossAt.set(e.pos.x, e.pos.y - 0.3, e.pos.z);
      _vigilTo.set(
        e.pos.x + Math.cos(e.vgAng) * 30,
        0.3,
        e.pos.z + Math.sin(e.vgAng) * 30
      );
      ctx.effects.beam(_bossAt, _vigilTo, 0xe8d9a8);
    }
    if (e.vgT > 0) return;
    e.vgState = 'climb';
    e.vgT = 1.2;
    e._setEyeAlert(false);
    // THE LANCE, fired along the locked bearing and nowhere else - the
    // weeper's contract, arrived at from the air.
    if (p) {
      const base = Math.atan2(p.pos.z - e.pos.z, p.pos.x - e.pos.x);
      ctx.addProjectile(e.pos.x, e.pos.y - 0.2, e.pos.z, 'vigil', 1, e.vgAng - base);
    }
    _blinkAt.set(e.pos.x, e.pos.y - 0.2, e.pos.z);
    if (ctx.effects) ctx.effects.burst(_blinkAt, 0xe8d9a8, 10, 4, 2, 0.35);
    return;
  }

  if (e.vgState === 'climb') {
    e.vgT -= a.dt;
    e.hoverY = VIGIL_HIGH;
    e.flyRate = 2.5;
    if (e.vgT <= 0) {
      e.vgState = 'watch';
      e.vgT = 1.4 + Math.random() * 1.2;
    }
    return;
  }

  // watch. Hold station, draw the beam, and slow whatever stands in it.
  orbit(e, a, ENEMY_TYPES.vigil.orbit);
  e.hoverY = VIGIL_HIGH;
  e.flyRate = 4;
  if (!p) return;
  // The beam is drawn along the straight line to the player, every frame -
  // the lamp in the tower, following whoever it is watching.
  if (ctx.effects) {
    _bossAt.set(e.pos.x, e.pos.y - 0.3, e.pos.z);
    _vigilTo.set(p.pos.x, 0.3, p.pos.z);
    ctx.effects.beam(_bossAt, _vigilTo, 0xbfa76a);
  }
  e.vgLanceCd -= a.dt;
  if (a.dist < VIGIL_RANGE) {
    // SEEN. The slow refreshes every frame with its own duration as the
    // tail, so it lapses on its own the moment the player leaves the beam -
    // the bellows' contract for a support the player cannot shoot.
    if (ctx.applyPlayerStatus) ctx.applyPlayerStatus('slowness', 1.2);
    if (e.vgLanceCd <= 0) {
      e.vgLanceCd = VIGIL_LANCE_CD + Math.random() * 0.8;
      e.vgState = 'tell';
      e.vgT = VIGIL_TELL;
      e.vgAng = Math.atan2(p.pos.z - e.pos.z, p.pos.x - e.pos.x);
      e.flash = 0.16;
    }
  } else {
    e._setEyeAlert(false);
  }
}

// ---- the models -------------------------------------------------------------

// The dressing rule for the whole theme: every bare slab the first pass used
// was a PIECE OF FURNITURE drawn one face short, so the models here are built
// as the furniture they always were - jambs get feet and capitals, lanterns
// get caps and cages, robes get layers. Nothing below moves a tell the AI
// reads: every handle the poses drive (penUpper, cuLamp, palCoffin...) keeps
// exactly the transform contract it had, and the dressing is all inert.

// A kneeling figure under a hooded lantern. Narrow, deeply cowled, the lantern
// held at the chest where the hood's shadow falls across it. The upper body is
// one articulated assembly and the legs are separate joints, so the kneel is
// a change in the whole outline rather than one triangle blinking out.
export function buildPenitent(e, g, s) {
  const P = partsFor(e, g, s);
  e.penUpper = new THREE.Group();
  g.add(e.penUpper);
  const U = partsFor(e, e.penUpper, s);
  // THE COWL. Deep, forward-tilted, and the whole head - the face never
  // shows, which is the point of a penitent. The wide collar under it makes
  // the hood read WRAPPED rather than worn.
  e.penHood = U('penHood', spike(0.3, 0.62, 6), { y: 1.18, z: 0.04, rx: -0.34 });
  U('penCowl', prism(0.26, 0.34, 0.16, 6), { y: 0.92 });
  U('penShoulder', slab(0.17, 0.09, 0.2), { x: -0.22, y: 0.94, rz: 0.14 });
  U('penShoulder', slab(0.17, 0.09, 0.2), { x: 0.22, y: 0.94, rz: -0.14 });
  // A narrow upright body under it, cinched with the rope belt of the habit -
  // the dress of a thing whose whole life is the kneel.
  U('penTorso', prism(0.17, 0.24, 0.66, 5), { y: 0.82, rx: -0.08 });
  U('penBelt', prism(0.245, 0.25, 0.06, 6), { y: 0.62 });
  // Both hands drawn in to the chest, clasped around the lamp.
  U('penArmL', slab(0.08, 0.3, 0.08), { x: -0.15, y: 0.82, z: -0.15, rx: 0.55, rz: -0.35 });
  U('penArmR', slab(0.08, 0.3, 0.08), { x: 0.15, y: 0.82, z: -0.15, rx: 0.55, rz: 0.35 });
  // THE LANTERN, held low at the chest where the hood shades it - a CASED
  // light now, capped and chained up into the hands. Pale brass, and the
  // one lit thing on the body.
  U('penLamp', lump(0.11), {
    y: 0.86, z: -0.3, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  U('penLampCap', prism(0.045, 0.09, 0.07, 5), {
    y: 0.965, z: -0.3, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  U('penLampChain', slab(0.02, 0.14, 0.02), {
    y: 1.06, z: -0.3, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  // THE ARCH, dressed as a doorway instead of a frame: jambs with feet and
  // capitals, a spanner with a gable peaked over it, and a candle flame on
  // each shoulder of the span. In cathStone rather than the body material,
  // so a status tint cannot make the doorway stop reading as stone; the
  // flames are the theme's pale brass.
  U('penArchL', slab(0.05, 0.92, 0.05), { x: -0.24, y: 0.74, rz: 0.08, mat: SHARED_MATS.cathStone });
  U('penArchR', slab(0.05, 0.92, 0.05), { x: 0.24, y: 0.74, rz: -0.08, mat: SHARED_MATS.cathStone });
  U('penJambL', slab(0.1, 0.08, 0.1), { x: -0.28, y: 0.3, mat: SHARED_MATS.cathStone });
  U('penJambR', slab(0.1, 0.08, 0.1), { x: 0.28, y: 0.3, mat: SHARED_MATS.cathStone });
  U('penCapL', slab(0.09, 0.07, 0.09), { x: -0.215, y: 1.17, mat: SHARED_MATS.cathStone });
  U('penCapR', slab(0.09, 0.07, 0.09), { x: 0.215, y: 1.17, mat: SHARED_MATS.cathStone });
  U('penArchTop', slab(0.56, 0.06, 0.07), { y: 1.24, mat: SHARED_MATS.cathStone });
  U('penGable', spike(0.09, 0.18, 4), { y: 1.36, mat: SHARED_MATS.cathStone });
  U('penFlame', spike(0.028, 0.09, 4), { x: -0.24, y: 1.31, mat: SHARED_MATS.cathGilt, shadow: false });
  U('penFlame', spike(0.028, 0.09, 4), { x: 0.24, y: 1.31, mat: SHARED_MATS.cathGilt, shadow: false });
  // The skirt of the habit hangs off the UPPER body, so the kneel pools the
  // cloth down over the folding legs instead of baring them under a floating
  // torso.
  U('penRobe', prism(0.22, 0.32, 0.36, 6), { y: 0.44 });
  // Legs that fold: short, and angled as though halfway down already, each
  // with a bare foot grafted on as a CHILD of the shin so the fold carries
  // the foot with it rather than leaving a shoe planted in mid-air.
  e.penLegs = [
    P('penLeg', slab(0.1, 0.5, 0.11), { x: -0.14, y: 0.24, rx: 0.28 }),
    P('penLeg', slab(0.1, 0.5, 0.11), { x: 0.14, y: 0.24, rx: 0.28 }),
  ];
  for (const leg of e.penLegs) {
    const foot = new THREE.Mesh(geo('penFoot', slab(0.11, 0.07, 0.22)), e.bodyMat);
    foot.position.set(0, -0.22, -0.05);
    foot.castShadow = true;
    leg.add(foot);
  }
  eyes(U, { y: 1.02, x: 0.09, z: -0.3, r: 0.7, mat: e.eyeMat });
}

// The tallest thin thing in the theme: a curate is a lantern on a pole that
// walks, in vestments. The lantern rides high and forward of the body, so the
// aim and the light are one line - and the lamp is a CASED one, so the charge
// reads as the core shrinking inside its own housing rather than the whole
// lamp blinking smaller.
export function buildCurate(e, g, s) {
  const P = partsFor(e, g, s);
  // THE POLE, and it is most of the height: a processional staff, finialed
  // at the top, with the lamp bracket off its head.
  P('cuPole', prism(0.06, 0.09, 1.3, 5), { y: 0.85 });
  P('cuFinial', spike(0.06, 0.16, 4), { y: 1.58, mat: SHARED_MATS.cathGilt, shadow: false });
  P('cuArm', slab(0.06, 0.06, 0.42), { y: 1.5, z: -0.18 });
  // THE LANTERN as an actual lantern: a hanging link off the arm, a cap over
  // it, a foot under it and cage bars at its flanks. The dim that announces
  // the round is the CORE's alone (see aiCurate) - the housing staying lit
  // sized is exactly what makes the core's shrink read as a wick going down.
  P('cuHanger', slab(0.02, 0.1, 0.02), { y: 1.46, z: -0.38, mat: SHARED_MATS.cathGilt, shadow: false });
  e.cuLamp = P('cuLamp', lump(0.16), {
    y: 1.38, z: -0.38, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  P('cuLampCap', spike(0.12, 0.12, 4), { y: 1.47, z: -0.38, mat: SHARED_MATS.cathGilt, shadow: false });
  P('cuLampBase', prism(0.06, 0.1, 0.08, 5), { y: 1.25, z: -0.38, mat: SHARED_MATS.cathGilt, shadow: false });
  P('cuCage', slab(0.02, 0.26, 0.02), { x: -0.15, y: 1.36, z: -0.38, mat: SHARED_MATS.cathStone, shadow: false });
  P('cuCage', slab(0.02, 0.26, 0.02), { x: 0.15, y: 1.36, z: -0.38, mat: SHARED_MATS.cathStone, shadow: false });
  // A small bowed body under the pole, mostly hidden by it, in vestments:
  // chest over skirt, and the two strips of a stole hanging down the front.
  P('cuBody', prism(0.13, 0.19, 0.56, 5), { y: 0.56, z: 0.12, rx: -0.3 });
  P('cuSkirt', prism(0.2, 0.13, 0.3, 5), { y: 0.24, z: 0.1 });
  P('cuStole', slab(0.05, 0.34, 0.02), { x: -0.09, y: 0.6, z: -0.11, rx: -0.24 });
  P('cuStole', slab(0.05, 0.34, 0.02), { x: 0.09, y: 0.6, z: -0.11, rx: -0.24 });
  // THE MITRE: two panels meeting at a peak over the bowed face, banded in
  // brass at the brow - the one rank badge in the theme, worn by the one
  // body that has rank.
  P('cuMitreL', slab(0.035, 0.22, 0.15), { x: -0.055, y: 1.0, rx: -0.06, rz: 0.3 });
  P('cuMitreR', slab(0.035, 0.22, 0.15), { x: 0.055, y: 1.0, rx: -0.06, rz: -0.3 });
  P('cuMitreBand', slab(0.17, 0.05, 0.16), { y: 0.9, mat: SHARED_MATS.cathGilt, shadow: false });
  // Two long thin legs, splayed for the height - the read of a stilt walker
  // is wrong by exactly nothing.
  P('cuLeg', slab(0.05, 0.52, 0.05), { x: -0.13, y: 0.24, rz: 0.14 });
  P('cuLeg', slab(0.05, 0.52, 0.05), { x: 0.13, y: 0.24, rz: -0.14 });
  eyes(P, { y: 0.72, x: 0.08, z: -0.1, r: 0.65, mat: e.eyeMat });
}

// A doorway walking, and a doorway with JOINERY on it now: the widest arch
// in the theme, footed at the jambs and crested at the spanner, carried flat
// across the shoulders like a yoke, with the coffin slung under the middle
// of it. The lantern rides the yoke's crown. Read: it is carrying a
// threshold, and there is a grave under it.
export function buildPallbearer(e, g, s) {
  e.palRig = new THREE.Group();
  g.add(e.palRig);
  const P = partsFor(e, e.palRig, s);
  // THE YOKE. Two uprights on block feet with capitals at their tops and a
  // spanner over the head, crested by a gable - the arch at its plainest and
  // its widest, in the stone that keeps its colour under a tint. A candle
  // flame at each end of the spanner marks it as the theme's.
  P('palUpL', slab(0.09, 1.0, 0.1), { x: -0.42, y: 0.9, rz: 0.1, mat: SHARED_MATS.cathStone });
  P('palUpR', slab(0.09, 1.0, 0.1), { x: 0.42, y: 0.9, rz: -0.1, mat: SHARED_MATS.cathStone });
  P('palFootL', slab(0.16, 0.1, 0.18), { x: -0.47, y: 0.42, mat: SHARED_MATS.cathStone });
  P('palFootR', slab(0.16, 0.1, 0.18), { x: 0.47, y: 0.42, mat: SHARED_MATS.cathStone });
  P('palCapL', slab(0.13, 0.08, 0.14), { x: -0.37, y: 1.36, mat: SHARED_MATS.cathStone });
  P('palCapR', slab(0.13, 0.08, 0.14), { x: 0.37, y: 1.36, mat: SHARED_MATS.cathStone });
  P('palSpan', slab(1.0, 0.09, 0.12), { y: 1.44, mat: SHARED_MATS.cathStone });
  P('palGable', spike(0.14, 0.24, 4), { y: 1.58, z: 0.14, mat: SHARED_MATS.cathStone });
  P('palFlame', spike(0.03, 0.1, 4), { x: -0.45, y: 1.54, mat: SHARED_MATS.cathGilt, shadow: false });
  P('palFlame', spike(0.03, 0.1, 4), { x: 0.45, y: 1.54, mat: SHARED_MATS.cathGilt, shadow: false });
  // THE LANTERN at the crown of the yoke, hung just forward of the gable.
  e.palLamp = P('palLamp', lump(0.14), {
    y: 1.6, z: -0.06, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  // The bearer between the uprights: a stooped trunk under a low cowl, both
  // arms thrown forward under the bier - the load is the point and the body
  // under it only labours.
  P('palTorso', prism(0.3, 0.38, 0.44, 5), { y: 0.68, rx: -0.08 });
  P('palArmL', slab(0.09, 0.46, 0.1), { x: -0.34, y: 0.9, z: -0.14, rx: 0.62, rz: 0.12 });
  P('palArmR', slab(0.09, 0.46, 0.1), { x: 0.34, y: 0.9, z: -0.14, rx: 0.62, rz: -0.12 });
  // THE COFFIN IS HINGED AS ONE OBJECT. It rises upright through the tell,
  // stays between the carrier and the player through the charge, and slams
  // flat at ground level on impact. Separate static lids could never make
  // those states legible at combat distance.
  e.palCoffin = new THREE.Group();
  e.palCoffin.position.y = 0.9 * s;
  e.palRig.add(e.palCoffin);
  const C = partsFor(e, e.palCoffin, s);
  C('palLidL', slab(0.3, 0.1, 0.9), { x: -0.17, rz: 0.5 });
  C('palLidR', slab(0.3, 0.1, 0.9), { x: 0.17, rz: -0.5 });
  C('palBody', slab(0.34, 0.5, 0.8), { rx: 0.06 });
  // A DRESSED CASKET: end plates at the head and foot, a brass boss over the
  // face and one candle at the head - it is not a box, it is somebody's
  // grave goods. No more than this: the corpse pool throws 28 pieces and
  // the bearer is at it, so every slab has to earn its flight.
  C('palEndH', slab(0.3, 0.42, 0.06), { z: -0.44 });
  C('palEndF', slab(0.24, 0.34, 0.06), { z: 0.44 });
  C('palBoss', lump(0.07), { y: 0.3, z: -0.3, mat: SHARED_MATS.cathGilt, shadow: false });
  C('palCandle', spike(0.035, 0.14, 4), { y: 0.34, z: -0.44, mat: SHARED_MATS.cathGilt, shadow: false });
  // A low hooded head under the yoke's front edge.
  P('palHead', spike(0.14, 0.34, 5), { y: 1.2, z: -0.3, rx: -0.4 });
  // Four thick legs, planted - the brute posture, carrying weight.
  P('palLeg', slab(0.13, 0.42, 0.15), { x: -0.3, y: 0.2, z: -0.26 });
  P('palLeg', slab(0.13, 0.42, 0.15), { x: 0.3, y: 0.2, z: -0.26 });
  P('palLeg', slab(0.13, 0.42, 0.15), { x: -0.3, y: 0.2, z: 0.3 });
  P('palLeg', slab(0.13, 0.42, 0.15), { x: 0.3, y: 0.2, z: 0.3 });
  eyes(P, { y: 1.14, x: 0.09, z: -0.44, r: 0.75, mat: e.eyeMat });
}

// A swinging censer on chains, carried before the body by a long arm. The
// body itself is a hooded habit in two layers - barely a body at all,
// because the censer is the silhouette and the smoke is the enemy. The
// chains hang off the CENSER rather than off the air beside it, so the sway
// the ai puts on the censer carries its own tackle with it.
export function buildThurible(e, g, s) {
  const P = partsFor(e, g, s);
  // THE CENSER. Hung well forward and low at the arm's reach - the one part
  // of the outline that moves every frame, and the author of everything on
  // the floor.
  e.thurArm = P('thurArm', slab(0.07, 0.07, 0.62), { y: 1.0, z: -0.28, rx: 0.2 });
  e.thurCenser = P('thurCenser', prism(0.14, 0.2, 0.24, 6), {
    y: 0.72, z: -0.58, mat: SHARED_MATS.cathGilt,
  });
  // The tackle, in the censer's own frame so the sway carries it: a banded
  // rim, a peaked lid, and three chains fanning up to where the arm reaches.
  const C = partsFor(e, e.thurCenser, s);
  C('thurRim', prism(0.205, 0.205, 0.045, 6), { y: 0.06, mat: SHARED_MATS.cathGilt });
  C('thurLid', spike(0.13, 0.12, 6), { y: 0.17, mat: SHARED_MATS.cathGilt });
  C('thurChain', slab(0.02, 0.3, 0.02), { y: 0.28, mat: SHARED_MATS.cathGilt });
  C('thurChain', slab(0.02, 0.3, 0.02), { x: -0.07, y: 0.26, rz: 0.26, mat: SHARED_MATS.cathGilt });
  C('thurChain', slab(0.02, 0.3, 0.02), { x: 0.07, y: 0.26, rz: -0.26, mat: SHARED_MATS.cathGilt });
  // A plume of lit smoke above the censer's mouth - the one sign of what it
  // pours, in the same frame of reference.
  P('thurPlume', spike(0.09, 0.3, 5), {
    y: 0.94, z: -0.58, rx: Math.PI, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  // THE HABIT: a skirt under a robe under a shoulder mantle, belted - the
  // layering is what makes it read as cloth rather than as a column.
  P('thurRobeLo', prism(0.3, 0.4, 0.4, 6), { y: 0.26 });
  P('thurRobe', prism(0.2, 0.32, 0.72, 5), { y: 0.56, rx: -0.1 });
  P('thurBelt', prism(0.24, 0.26, 0.05, 6), { y: 0.52 });
  P('thurMantle', prism(0.24, 0.3, 0.18, 5), { y: 0.88, rx: -0.1 });
  P('thurHood', spike(0.2, 0.44, 6), { y: 1.1, z: 0.02, rx: -0.3 });
  // A long thin arm behind, for balance - the read of a thing that carries
  // weight in front of it.
  P('thurArmB', slab(0.05, 0.05, 0.4), { y: 0.9, z: 0.3, rx: -0.3 });
  // The arch, small and worn high, with its own gable: the chains and the
  // hood's point.
  P('thurArch', slab(0.4, 0.05, 0.06), { y: 1.38, mat: SHARED_MATS.cathStone });
  P('thurGable', spike(0.06, 0.12, 4), { y: 1.46, mat: SHARED_MATS.cathStone });
  eyes(P, { y: 0.98, x: 0.08, z: -0.2, r: 0.65, mat: e.eyeMat });
}

// THE BELL RINGER, in a belfry it carries: two posts on block feet under a
// lintel and its gable, the bell hung from a yoke beam between them - and
// the ROPE fallen down from the beam into the ringer's raised hands. The
// ring on the floor is drawn at exactly the radius the toll is heard at -
// the hoarfrost's contract: a mechanic the player cannot see the edge of
// is a tax they cannot answer.
export function buildSacristan(e, g, s) {
  const P = partsFor(e, g, s);
  // THE BELFRY. Posts with feet and capitals, the lintel over them and a
  // gable cresting it - a doorway carrying its own roof, in the stone that
  // keeps its colour under a tint.
  P('sacPost', slab(0.05, 0.7, 0.05), { x: -0.2, y: 1.3, rz: 0.06, mat: SHARED_MATS.cathStone });
  P('sacPost', slab(0.05, 0.7, 0.05), { x: 0.2, y: 1.3, rz: -0.06, mat: SHARED_MATS.cathStone });
  P('sacFootL', slab(0.1, 0.08, 0.1), { x: -0.21, y: 0.96, mat: SHARED_MATS.cathStone });
  P('sacFootR', slab(0.1, 0.08, 0.1), { x: 0.21, y: 0.96, mat: SHARED_MATS.cathStone });
  P('sacCapL', slab(0.09, 0.06, 0.09), { x: -0.19, y: 1.62, mat: SHARED_MATS.cathStone });
  P('sacCapR', slab(0.09, 0.06, 0.09), { x: 0.19, y: 1.62, mat: SHARED_MATS.cathStone });
  P('sacLintel', slab(0.5, 0.06, 0.07), { y: 1.66, mat: SHARED_MATS.cathStone });
  P('sacGable', spike(0.09, 0.16, 4), { y: 1.77, mat: SHARED_MATS.cathStone });
  // The yoke beam the bell swings from, and the bell itself - it turns,
  // slowly, the way a heavy thing does, with a crown going round with it
  // (the crown is the bell's own child so the turn never canters it).
  P('sacBeam', slab(0.34, 0.05, 0.06), { y: 1.6 });
  e.sacBell = new THREE.Mesh(
    geo('sacBell', () => {
      // A bell is a flared cone: wide at the mouth, narrow at the crown.
      const gg = new THREE.CylinderGeometry(0.13, 0.22, 0.3, 6, 1, true);
      return gg;
    }),
    SHARED_MATS.cathGilt
  );
  e.sacBell.position.set(0, 1.5 * s, 0);
  e.sacBell.scale.setScalar(s);
  g.add(e.sacBell);
  const crown = new THREE.Mesh(
    geo('sacBellCrown', prism(0.05, 0.1, 0.09, 6)),
    SHARED_MATS.cathGilt
  );
  crown.position.y = 0.18;
  e.sacBell.add(crown);
  P('sacClap', spike(0.05, 0.16, 4), { y: 1.36, mat: e.eyeMat, shadow: false });
  // THE ROPE, fallen from the beam between the raised hands - the reason the
  // hands are up at all.
  P('sacRope', slab(0.03, 0.56, 0.03), { y: 1.28, z: -0.08 });
  // The habit under the frame: robe, shoulder mantle, deep hood, and the
  // arms still lifted to the rope.
  P('sacRobe', prism(0.18, 0.26, 0.6, 5), { y: 0.64, rx: -0.06 });
  P('sacMantle', prism(0.22, 0.26, 0.14, 6), { y: 0.94 });
  P('sacHood', spike(0.16, 0.4, 5), { y: 1.08, z: 0.0, rx: -0.3 });
  P('sacArm', slab(0.05, 0.05, 0.34), { x: -0.16, y: 1.0, z: -0.16, rx: 0.5 });
  P('sacArm', slab(0.05, 0.05, 0.34), { x: 0.16, y: 1.0, z: -0.16, rx: 0.5 });
  P('sacLeg', slab(0.08, 0.5, 0.09), { x: -0.11, y: 0.22 });
  P('sacLeg', slab(0.08, 0.5, 0.09), { x: 0.11, y: 0.22 });
  eyes(P, { y: 1.06, x: 0.08, z: -0.22, r: 0.65, mat: e.eyeMat });

  // THE RING, at exactly the radius it works at. Built the way the halo's is
  // - at world size on the group, so it does not inherit the model scale -
  // because this enemy charges the player for killing and a player who cannot
  // see where the charge ends is playing a broken game.
  e.sacRingMat = new THREE.MeshBasicMaterial({
    color: 0xc0a860, transparent: true, opacity: SACR_RING_OPACITY,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  e._extraMats.push(e.sacRingMat);
  e.sacRing = new THREE.Mesh(
    geo('sacRing', () => new THREE.RingGeometry(SACR_TOLL_R - 0.3, SACR_TOLL_R, 56)),
    e.sacRingMat
  );
  e.sacRing.rotation.x = -Math.PI / 2;
  e.sacRing.position.y = 0.05;
  // A bell's hearing is not the sacristan's silhouette; the ring cartwheels
  // off a corpse as badly as a halo would.
  e.sacRing.userData.noCorpse = true;
  g.add(e.sacRing);
}

// THE LIGHT IN THE TOWER, caged like a real one: a tall lamp banded with
// stone louvres between two posts, roofed and finialed above and tasselled
// below, hung under a small hooded body between two feathered vanes. Read
// from below - the only place it is seen from - it is a lantern with wings,
// and the beam it draws on the floor is the whole enemy.
export function buildVigil(e, g, s) {
  const P = partsFor(e, g, s);
  // THE TOWER LAMP. Tall, held between stone ribs and cage posts, and lit
  // from within - the widest part of the silhouette from anywhere, because
  // it is the thing the player has to find to answer the beam.
  P('vgLampBody', prism(0.14, 0.2, 0.5, 5), {
    y: 0.5, mat: SHARED_MATS.cathGilt,
  });
  P('vgLouver', prism(0.205, 0.215, 0.04, 5), { y: 0.34, mat: SHARED_MATS.cathStone });
  P('vgLouver', prism(0.205, 0.215, 0.04, 5), { y: 0.5, mat: SHARED_MATS.cathStone });
  P('vgLouver', prism(0.205, 0.215, 0.04, 5), { y: 0.66, mat: SHARED_MATS.cathStone });
  P('vgPostL', slab(0.03, 0.6, 0.03), { x: -0.2, y: 0.5, mat: SHARED_MATS.cathStone });
  P('vgPostR', slab(0.03, 0.6, 0.03), { x: 0.2, y: 0.5, mat: SHARED_MATS.cathStone });
  P('vgLampCap', spike(0.16, 0.22, 4), { y: 0.86, mat: SHARED_MATS.cathGilt });
  P('vgFinial', spike(0.035, 0.12, 4), { y: 1.02, mat: SHARED_MATS.cathGilt, shadow: false });
  P('vgLampFoot', prism(0.06, 0.12, 0.12, 5), { y: 0.2, mat: SHARED_MATS.cathGilt });
  // The tassel: three small flames off the lamp's foot, the light pointing
  // DOWN - this is the only body in the theme whose lamp hangs under it,
  // because the beam is what it is for.
  P('vgTassel', spike(0.03, 0.12, 4), { y: 0.1, rx: Math.PI, mat: SHARED_MATS.cathGilt, shadow: false });
  P('vgTassel', spike(0.03, 0.12, 4), { x: -0.07, y: 0.13, rx: Math.PI - 0.24, mat: SHARED_MATS.cathGilt, shadow: false });
  P('vgTassel', spike(0.03, 0.12, 4), { x: 0.07, y: 0.13, rx: Math.PI + 0.24, mat: SHARED_MATS.cathGilt, shadow: false });
  // The small body above it: a hooded seed, no bigger than the lamp itself.
  P('vgBody', lump(0.16), { y: 1.12 });
  P('vgHood', spike(0.12, 0.3, 5), { y: 1.3, z: 0.02, rx: -0.4 });
  // Two ragged vanes, doubled - a blade and a feather at its tip, swept
  // high and back: the theme's one airborne body keeps the arch in the
  // span between them.
  P('vgVane', slab(0.5, 0.04, 0.2), { x: -0.34, y: 1.3, z: 0.1, ry: 0.5, rz: 0.2 });
  P('vgVane', slab(0.5, 0.04, 0.2), { x: 0.34, y: 1.3, z: 0.1, ry: -0.5, rz: -0.2 });
  P('vgFeatherL', slab(0.26, 0.03, 0.12), { x: -0.56, y: 1.36, z: -0.02, ry: 0.62, rz: 0.34 });
  P('vgFeatherR', slab(0.26, 0.03, 0.12), { x: 0.56, y: 1.36, z: -0.02, ry: -0.62, rz: -0.34 });
  eyes(P, { y: 1.16, x: 0.07, z: -0.16, r: 0.6, mat: e.eyeMat });
}

// THE RELIQUARY. A shrine that walks: a reliquary box carried under a great
// buttressed arch on four claw-legs, with a crown of candles along the
// spanner and a gable cresting it, a bell hung at the yoke's crown, and the
// theme's lantern flaring at the centre. Under the last third of the bar
// the lids go wide for good and the glow pours out - the fight's ESCALATION,
// not its armour; there is none of that anywhere on this body.
//
// THE STONE AND THE BRASS ARE THIS INSTANCE'S OWN. The head region of this
// boss - the arch, the span, the crown of candles - is nearly all accent
// material, and a headshot that lit nothing read as a hit the game refused:
// the whole silhouette has to flash as ONE hittable body. So the two theme
// materials are cloned per instance, registered on `flashMats` (they join the
// hit flash and nothing else - statuses still cannot tint them, so a frozen
// shrine still carries its own lit brass), and freed through _extraMats like
// every per-instance material a build allocates. The theme's six other
// bodies keep the shared pair untouched.
export function buildReliquary(e, g, s) {
  const P = partsFor(e, g, s);
  const stone = SHARED_MATS.cathStone.clone();
  const gilt = SHARED_MATS.cathGilt.clone();
  e._extraMats.push(stone, gilt);
  e.flashMats = [stone, gilt].map((m) => ({
    mat: m, hex: m.emissive.getHex(), i: m.emissiveIntensity,
  }));
  // THE ARCH, at boss scale: two great uprights on capitals, a spanner and
  // its gable, carrying the whole silhouette. The boss is a doorway, and it
  // is walking through itself.
  P('relUpL', slab(0.16, 1.9, 0.18), { x: -0.66, y: 1.7, rz: 0.06, mat: stone });
  P('relUpR', slab(0.16, 1.9, 0.18), { x: 0.66, y: 1.7, rz: -0.06, mat: stone });
  P('relCapL', slab(0.26, 0.12, 0.28), { x: -0.69, y: 2.56, mat: stone });
  P('relCapR', slab(0.26, 0.12, 0.28), { x: 0.69, y: 2.56, mat: stone });
  P('relSpan', slab(1.6, 0.14, 0.2), { y: 2.7, mat: stone });
  P('relGable', spike(0.22, 0.4, 4), { y: 2.95, z: 0.22, mat: stone });
  // A CROWN OF CANDLES along the spanner, the sacristan's lit brass at boss
  // scale - the skyline that says CATHEDRAL from anywhere in the room. Kept
  // as a list on the enemy: the CANDLES rite lights them one at a time, and
  // a tell the player is meant to read has to be on the model, not in prose.
  e.relCandles = [];
  for (let i = 0; i < 5; i++) {
    e.relCandles.push(P('relCandle', spike(0.05, 0.26 + (i % 2) * 0.1, 4), {
      x: -0.56 + i * 0.28, y: 2.9, mat: gilt, shadow: false,
    }));
  }
  // THE BELL, hung from the spanner's centre. It swings with each toll and
  // eases back upright between them - the fight's clock is on the model.
  e.relBell = new THREE.Mesh(
    geo('relBell', () => new THREE.CylinderGeometry(0.2, 0.34, 0.44, 6, 1, true)),
    gilt
  );
  e.relBell.position.set(0, 2.34 * s, 0);
  e.relBell.scale.setScalar(s);
  g.add(e.relBell);
  // THE RELIQUARY BOX, slung under the arch between the uprights: two lids
  // that part as the fight goes on and come off for good at the opening -
  // the lid going wide is the light pouring out, and never armour coming off,
  // because none was ever on.
  e.relLidL = P('relLidL', slab(0.5, 0.14, 1.1), { x: -0.3, y: 1.44, rz: 0.5 });
  e.relLidR = P('relLidR', slab(0.5, 0.14, 1.1), { x: 0.3, y: 1.44, rz: -0.5 });
  // A gilt finial on each lid's outer edge, as a CHILD of its lid - the
  // opening rotates the lids, and a finial anywhere else would be left
  // hanging where the lid was.
  for (const [lid, sx] of [[e.relLidL, -1], [e.relLidR, 1]]) {
    const fin = new THREE.Mesh(geo('relFinial', spike(0.05, 0.16, 4)), gilt);
    fin.position.set(sx * 0.2, 0.14, 0);
    fin.castShadow = false;
    lid.add(fin);
  }
  // THE LANTERN at the box's centre, inside the arch - the theme's own
  // lamp, at the scale of the thing carrying it. It flares for the volley.
  e.relLamp = P('relLamp', lump(0.24), {
    y: 1.44, mat: gilt, shadow: false,
  });
  P('relChest', slab(0.6, 0.8, 1.0), { y: 1.1, rx: 0.04 });
  // THE CLAW-LEGS. Four, long and reaching, carrying the arch high over the
  // floor - the posture of a shrine being carried rather than of a thing
  // that walks.
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const fore = i < 2 ? -1 : 1;
    P('relLeg', slab(0.14, 1.5, 0.14), {
      x: side * 0.7, y: 0.78, z: fore * 0.5, rz: side * 0.42, rx: fore * 0.3,
      mat: stone,
    });
    P('relClaw', spike(0.11, 0.44, 4), {
      x: side * 0.98, y: 0.04, z: fore * 0.78, rx: Math.PI, rz: side * 0.34,
      mat: stone,
    });
  }
  eyes(P, { y: 1.86, x: 0.16, z: -0.3, r: 1.0, mat: e.eyeMat });
}

// ---- the boss ----------------------------------------------------------------
//
// THE RELIQUARY, and the fight is THE OFFICE: a liturgy the boss says over the
// room, six rites on their own clocks, every one telegraphed on the MODEL and
// on the floor, and every one the theme's single question - WHERE ARE YOU
// STANDING WHEN IT LOOKS AT YOU - asked a different way:
//
//   the VOLLEY    a fan of five off the lantern, flaring through the tell -
//   (the fan)     the curate's processional at boss scale, fired often enough
//                 to be the fight's metronome. Open, it throws twice.
//   the PEAL      the bell swings, and a full RING of rounds goes out with
//   (the ring)    ONE gap in it - and the lantern's beam has been showing the
//                 gap for the whole of the tell. Stand in the light, or read
//                 the ring. Open, the bell rings twice and the gap turns.
//   the CANDLES   the crown of candles lights one at a time, and each flame
//   (your trail)  FIXES the ground the player was standing on the moment it
//                 lit. They land in the order they were taken - the fight
//                 charging the player for their own footsteps.
//   the PROCESSION the arch dips, a lane is painted THROUGH the player and out
//   (the aisle)   the far side, and the shrine strides down it without
//                 stopping - through pillars, an aisle does not detour -
//                 consecrating the ground it walks and laying a claim ring
//                 where it arrives. The room is crossed often now, and the
//                 floor it has walked is the floor the player loses.
//   the RISE      it KNEELS - the penitent's contract at boss scale, the whole
//   (the nova)    shrine visibly folding in prayer while the floor around it
//                 swells - and the rise is the hit. The answer to a praying
//                 sanctuary is to not be in the circle when the prayer ends.
//   the WATCH      the vigil's own rite at boss scale: the lantern gathers
//   (the lance)    its light low, a beam is thrown down a bearing LOCKED at
//                 the start of the tell, and the light itself SLOWS whoever
//                 it is on - then one fast lance goes down the line. Step
//                 off the locked beam; the slow is what makes the lance
//                 land, and the lance goes where the light was, not where
//                 the player is.
//
// And the old ground rule still stands: hallow stays behind wherever the
// shrine has been, so the room still fills with consecrated ground - but it
// is filled by where the boss HAS CHOSEN TO GO rather than by where the
// player refused to fight it. Under two thirds of the bar the bell tolls on
// its own, the chill that reaches wherever the player is standing - the
// sacristan's price, collected by the sanctuary itself. Under a third the
// reliquary OPENS for good: the lids go wide, the light pours out, and every
// rite's clock shortens - the last third of the fight is the fastest, and
// nothing about it is armoured.
//
// Standing on the shrine costs AT ALL TIMES, in every state - a reliquary
// does not like being touched, and a fight this loud about its rites can
// afford to be simple about its body.

// The volley: cooldown, tell, and the fan across the middle - the middle
// round is true, the rest walk off one step a side.
export const REL_VOLLEY_CD = 2.4;

export const REL_VOLLEY_TELL = 0.5;

export const REL_VOLLEY_N = 5;

export const REL_VOLLEY_FAN = 0.17;

// The second throw, this long after the first, once the box is open.
export const REL_VOLLEY2 = 0.38;

// The peal: the bell's ring of rounds, one gap wide, the beam on the gap for
// the whole tell. REL_PEAL_GAP counts ROUNDS, not radians - two missing of
// fourteen is the aisle the player is being shown, and it is wide because
// the rounds are slow and the answer is meant to be walked, not squeezed.
export const REL_PEAL_CD = 4.6;

export const REL_PEAL_TELL = 0.85;

export const REL_PEAL_N = 14;

export const REL_PEAL_GAP = 2;

// The second ring, once open: this long after the first, with the gap turned
// this far - the light moves, and what was the safe answer is not any more.
export const REL_PEAL2 = 0.55;

export const REL_PEAL2_TURN = 2.0;

// The candles: one lights every pace, and each FIXES the floor under the
// player at that moment - the trail they walked, read back as the price of
// it. The raise is the grace before the first light: the candles go out one
// by one and the first mark is already filling, so a player paying attention
// is never asked to have started moving before they could have known.
export const REL_CANDLE_CD = 6.0;

export const REL_CANDLE_RAISE = 0.55;

export const REL_CANDLE_PACE = 0.38;

export const REL_CANDLE_N = 5;

export const REL_CANDLE_FILL = 1.1;

export const REL_CANDLE_R = 2.3;

export const REL_CANDLE_MUL = 0.7;

// Capped per candle rather than left to scale, for the colossus slam's
// reason: a late-wave multiplier on five tracked charges is a one-shot.
export const REL_CANDLE_CAP = 22;

// The procession: the lane it paints through the player and past them, the
// stride it takes down it, and what the wake it leaves costs to stand in.
// The stride is a STEP, not a sprint - an arch does not run, it advances.
export const REL_PROC_CD = 7.5;

export const REL_PROC_TELL = 0.9;

export const REL_PROC_LEN = 16;

export const REL_PROC_SPEED = 11;

// The lane's half-width on the floor, drawn a shade wider than the arch's
// shoulders - a warning is allowed to over-say, never to under-say.
export const REL_PROC_R = 1.5;

export const REL_PROC_SLAM_R = 3.6;

export const REL_PROC_CAP = 30;

export const REL_WAKE_EVERY = 0.26;

export const REL_WAKE_R = 2.0;

export const REL_WAKE_LIFE = 6.5;

export const REL_WAKE_DPS = 12;

// The claim at the waystation: the old stopped ring's terms, gapped the same
// way, laid where the procession ARRIVES rather than where it was standing.
export const REL_CLAIM_N = 6;

export const REL_CLAIM_R = 4.7;

export const REL_CLAIM_PATCH_R = 2.1;

export const REL_CLAIM_LIFE = 7.5;

export const REL_CLAIM_DPS = 13;

// The watch: the vigil's lance at boss scale. The bearing locks when the
// rite begins and the light is drawn down it for the whole tell - the
// player's answer is the line, not the shooter, and the slow on the line is
// what makes the single round a threat rather than a plink.
export const REL_WATCH_CD = 6.5;

export const REL_WATCH_TELL = 0.9;

// The beam's reach, and its half-width as a slow.
export const REL_WATCH_RANGE = 26;

export const REL_WATCH_R = 1.2;

// The slow refreshes every frame it is on somebody, with its own duration
// as the tail, so it lapses the moment they step off the line - the bellows'
// contract for a support the player cannot shoot.
export const REL_WATCH_SLOW = 1.2;

// The lance is the one FAST round the shrine throws - the lantern round's
// speed scaled up, a quarter again as fast as the processional fan.
export const REL_WATCH_SPEED = 1.5;

// The rise: how close the fight has to be for the kneel, the kneel's length,
// and what the circle costs when the prayer ends. The disc is drawn at
// exactly the radius the rise answers - the hoarfrost's contract, kept: a
// mechanic the player cannot see the edge of is a tax they cannot answer.
export const REL_RISE_CD = 5.2;

export const REL_RISE_RANGE = 8.5;

export const REL_KNEEL = 0.95;

export const REL_RISE_R = 5.6;

export const REL_RISE_CAP = 28;

// Both big poses straighten back up over this long.
export const REL_RISE_RECOVER = 0.55;

// The toll: when it starts on the bar, how often, and how long the chill.
export const REL_TOLL_AT = 0.62;

export const REL_TOLL_CD = 3.4;

export const REL_TOLL_CHILL = 2.0;

// THE OPENING, and what it is worth. Under a third of the bar the reliquary
// opens for keeps: the lids go wide and every rite's clock shortens by this
// much. It is an escalation, not an armour coming off - there is none on the
// box, and there never will be: the fight this boss replaced was a corner
// and a pool of ammunition, and the opening is faster, not tougher.
export const REL_OPEN_AT = 0.3;

export const REL_OPEN_RATE = 0.62;

// The shared beat between rites. Something is ALWAYS being said now - the
// liturgy's whole point is that the room is never quiet for eight seconds
// the way the old ring's cooldown made it.
export const REL_REST = 1.1;

// How much the lantern flares on the volley tell.
export const REL_LANTERN_FLARE = 1.9;

// The walk between rites: the band the shrine circles the nave at, rather
// than a corner to be parked in - near enough that the melee and the rise
// are real, far enough that the peal and the candles have a lane to work in.
export const REL_ORBIT = {
  dist: 9.5, band: 2.5, out: 0.85, in: -0.5, strafe: 0.55, flip: 2.0, flipVar: 2.2,
};

// Scratch, module-level and reused: the claims and every burst run more than
// once a second across a whole fight.
export const _cathAt = new THREE.Vector3();

// The end of a rite: back to the walk for one short beat, posture cleared.
// group.rotation.x is this type's own pose channel - the dance owns
// rotation.z (see Enemy.update) and nothing but these rites may write x.
function _relRest(e, bs, rate) {
  bs.state = 'walk';
  bs.rest = REL_REST * rate;
  e.group.rotation.x = 0;
  e._setEyeAlert(false);
}

// The one fan, off the LANTERN at its real height: the flare on it is the
// tell, and the rounds should leave from where the tell was. The middle
// round is true; the rest walk off one step a side.
function _reliquaryFan(e, a, ctx) {
  const y = 1.44 * e.scale;
  for (let i = 0; i < REL_VOLLEY_N; i++) {
    ctx.addProjectile(e.pos.x, y, e.pos.z, 'reliquary', e._projScale(),
      (i - (REL_VOLLEY_N - 1) / 2) * REL_VOLLEY_FAN);
  }
  _cathAt.set(e.pos.x, y, e.pos.z);
  ctx.effects.burst(_cathAt, 0xe8d9a8, 14, 5, 2, 0.4);
}

// One ring of the bell: REL_PEAL_N bearings with the REL_PEAL_GAP nearest
// the lit aisle skipped. The gap's bearing was marked by the beam through
// the whole tell - the answer was on the floor the entire time.
function _reliquaryPeal(e, a, ctx, gap) {
  const y = 1.44 * e.scale;
  const base = Math.atan2(ctx.player.pos.z - e.pos.z, ctx.player.pos.x - e.pos.x);
  const step = (Math.PI * 2) / REL_PEAL_N;
  for (let k = REL_PEAL_GAP / 2; k < REL_PEAL_N - REL_PEAL_GAP / 2; k++) {
    // A half-step off the rounds, so the aisle is CENTRED on the light and
    // the ring's near edge is exactly one round wide of it on either side.
    const th = gap + (k + 0.5) * step;
    ctx.addProjectile(e.pos.x, y, e.pos.z, 'reliquary', e._projScale(), th - base);
  }
  if (e.relBell) e.relBell.rotation.x = 0.55;
  _cathAt.set(e.pos.x, y, e.pos.z);
  ctx.effects.shockwave(_cathAt, 0xc0a860, 4.5, 0.4);
  ctx.effects.burst(_cathAt, 0xe8d9a8, 16, 5, 2, 0.4);
  if (ctx.sfx) ctx.sfx.impact();
}

// One candle lights: it fixes the ground the player is standing on in that
// moment - a mark is taken on the spot and the flame goes up on the crown -
// and the two ends of the tell say the same thing: THIS light is THAT circle.
function _reliquaryCandle(e, a, ctx, bs) {
  bs.candles.push({
    x: ctx.player.pos.x, z: ctx.player.pos.z,
    t: REL_CANDLE_FILL,
    mark: ctx.effects.markAcquire(),
  });
  const mesh = e.relCandles && e.relCandles[bs.lit];
  if (mesh) {
    mesh.getWorldPosition(_cathAt);
    ctx.effects.burst(_cathAt, 0xe8d9a8, 8, 2.5, 1.8, 0.45);
  }
  bs.lit++;
}

// Every lit candle fills on the floor where it was taken and lands in the
// order it was lit - walking your own backtrail is the price, because that
// is where they all are.
function _reliquaryCandlesTick(e, a, ctx, bs) {
  for (let i = bs.candles.length - 1; i >= 0; i--) {
    const c = bs.candles[i];
    c.t -= a.dt;
    if (c.t > 0) {
      ctx.effects.markSet(c.mark, c.x, c.z, REL_CANDLE_R, 0xc0a860,
        1 - c.t / REL_CANDLE_FILL);
      continue;
    }
    ctx.effects.markRelease(c.mark);
    bs.candles.splice(i, 1);
    // A candle leaves hallow whether or not the player was still on the mark
    // - the footsteps were taken, and the consecrated ground remembers them.
    ctx.addHazard(c.x, c.z, REL_CANDLE_R, REL_CLAIM_LIFE * 0.6, REL_WAKE_DPS, 'hallow');
    _cathAt.set(c.x, 0, c.z);
    ctx.effects.shockwave(_cathAt, 0xc0a860, REL_CANDLE_R, 0.4);
    ctx.effects.burst(_cathAt, 0xe8d9a8, 14, 4.5, 2.2, 0.5);
    const d = Math.hypot(ctx.player.pos.x - c.x, ctx.player.pos.z - c.z);
    if (d < REL_CANDLE_R && Math.abs(ctx.player.pos.y) < BOSS_REACH_Y) {
      ctx.onHitPlayer(
        Math.min(REL_CANDLE_CAP, e.damage * REL_CANDLE_MUL) * (1 - 0.35 * d / REL_CANDLE_R),
        _cathAt, e);
    }
  }
}

// The waystation. The stride ends in a slam; where the procession ARRIVES a
// claim ring is laid, gapped the old way - a closed ring with the boss
// inside it would wall the player's own kite lane off.
function _reliquarySlam(e, a, ctx, bs) {
  bs.state = 'recover';
  bs.t = REL_RISE_RECOVER;
  e.stepMul = 1.4;
  a.vx = 0;
  a.vz = 0;
  if (a.dist < REL_PROC_SLAM_R && _reachY(a) < BOSS_REACH_Y) {
    landHit(e, ctx, Math.min(REL_PROC_CAP, e.damage));
  }
  const off = Math.random() * Math.PI * 2;
  const gapAt = (Math.random() * REL_CLAIM_N) | 0;
  for (let i = 0; i < REL_CLAIM_N; i++) {
    if (i === gapAt || i === (gapAt + 1) % REL_CLAIM_N) continue;
    const ang = off + (i / REL_CLAIM_N) * Math.PI * 2;
    ctx.addHazard(
      e.pos.x + Math.cos(ang) * REL_CLAIM_R,
      e.pos.z + Math.sin(ang) * REL_CLAIM_R,
      REL_CLAIM_PATCH_R, REL_CLAIM_LIFE, REL_CLAIM_DPS, 'hallow'
    );
  }
  _cathAt.set(e.pos.x, 0.1, e.pos.z);
  ctx.effects.shockwave(_cathAt, 0xc0a860, REL_CLAIM_R + 1.5, 0.45);
  ctx.effects.burst(_cathAt, 0xe8d9a8, 22, 6, 2.4, 0.6);
  ctx.effects.addShake(0.3);
  if (ctx.sfx) ctx.sfx.impact();
}

// Death mid-rite is still holding shared marks - the lane, the swell, the
// candles left filling - and the pool they come from is sixteen deep, so a
// boss that never gives them back is every later fight losing warnings.
export function releaseReliquary(e) {
  const bs = e.bs;
  if (!bs || !bs.fx) return;
  if (bs.mark >= 0) bs.fx.markRelease(bs.mark);
  bs.mark = -1;
  if (bs.candles) {
    for (const c of bs.candles) bs.fx.markRelease(c.mark);
    bs.candles = null;
  }
}

export function aiReliquary(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.rest = 0.8;
    bs.volleyCd = 2.6;
    bs.pealCd = 5.0;
    bs.candlesCd = 7.0;
    bs.riseCd = 4.0;
    bs.procCd = 6.0;
    bs.watchCd = 8.0;
    bs.tollCd = 0;
    bs.t = 0;
    bs.throws = 0;
    bs.gap = 0;
    bs.aim = 0;
    bs.dirX = 0;
    bs.dirZ = 1;
    bs.len = 0;
    bs.gone = 0;
    bs.wakeT = 0;
    bs.opened = false;
    bs.mark = -1;
    bs.fx = ctx.effects;
    bs.candles = null;
    bs.lit = 0;
    // Read by main.js's 'vent' bossEvent for the HUD note - the reliquary's
    // own word for its open state, rather than the colossus's.
    bs.ventNote = 'RELIQUARY OPEN';
  }
  bs.fx = ctx.effects;
  const feared = e.status.fear > 0;
  const rate = e.rate * (bs.opened ? REL_OPEN_RATE : 1);

  // STANDING ON IT COSTS, AT ALL TIMES AND IN EVERY STATE, the moment it
  // happens - the rite in progress is the player's problem, not a pause in
  // the toll for touching the shrine.
  bossTouch(e, a);

  // THE OPENING, once and for keeps: the lids go wide and every rite's clock
  // shortens - the light pours out and the fight gets FASTER, never tankier.
  // It was an armoured box once, and what made that boss a corner fight is
  // exactly what this one is not.
  if (!bs.opened && e.hp <= e.maxHp * REL_OPEN_AT) {
    bs.opened = true;
    // The note's latch: bossEvent reads weakOpen, the colossus's word for an
    // exposed core, and here it only means "the lids went wide" - there is no
    // armour left in the fight for a note to disagree with.
    bs.weakOpen = true;
    if (e.relLidL) e.relLidL.rotation.z = 1.25;
    if (e.relLidR) e.relLidR.rotation.z = -1.25;
    ctx.bossEvent('vent', e);
    _cathAt.set(e.pos.x, 1.2, e.pos.z);
    if (ctx.effects) {
      ctx.effects.shockwave(_cathAt, 0xe8d9a8, 8, 0.5);
      ctx.effects.burst(_cathAt, 0xe8d9a8, 34, 7, 2.5, 0.8);
    }
    if (ctx.sfx) ctx.sfx.wave();
  }

  // THE MODEL IS THE TELEGRAPH, driven off the state every frame: the
  // lantern flares through the volley, GATHERS LOW through the watch - the
  // curate's dim, the one tell in the theme the player already knows - the
  // candles stay lit until their marks have landed, and the bell swings
  // with every toll and peal.
  if (e.relLamp) {
    const flare = bs.state === 'volley' ? REL_LANTERN_FLARE
      : bs.state === 'watch' ? 0.45 : 1;
    e.relLamp.scale.setScalar(flare * e.scale);
    e.relLamp.rotation.y += a.dt * 0.9;
  }
  if (e.relCandles) {
    for (let i = 0; i < e.relCandles.length; i++) {
      e.relCandles[i].scale.setScalar((bs.lit > i ? 1.65 : 1) * e.scale);
    }
  }
  if (e.relBell) {
    e.relBell.rotation.x += (0 - e.relBell.rotation.x) * Math.min(1, a.dt * 4);
  }

  // ---- the toll -----------------------------------------------------------
  // Under two thirds of the bar the bell tolls on its own: a chill that
  // reaches the player wherever they are, the price of the sanctuary
  // collected by the sanctuary itself. It does not stack - slowness refreshes
  // rather than adding, the rule every status in the game keeps.
  if (e.hp <= e.maxHp * REL_TOLL_AT) {
    bs.tollCd -= a.dt;
    if (bs.tollCd <= 0) {
      bs.tollCd = REL_TOLL_CD * rate;
      if (ctx.applyPlayerStatus) ctx.applyPlayerStatus('slowness', REL_TOLL_CHILL);
      if (e.relBell) e.relBell.rotation.x = 0.55;
      _cathAt.set(e.pos.x, 2.2, e.pos.z);
      if (ctx.effects) {
        ctx.effects.shockwave(_cathAt, 0xc0a860, 5.2, 0.5);
        ctx.effects.burst(_cathAt, 0xe8d9a8, 12, 4, 2, 0.4);
      }
      if (ctx.sfx) ctx.sfx.impact();
    }
  }

  // ---- the rites ----------------------------------------------------------

  if (bs.state === 'volley') {
    // THE TELL IS THE LANTERN FLARING, and the throw is planted for: a
    // processional does not walk and throw in the same breath.
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    bs.t -= a.dt;
    if (bs.t > 0) return;
    bs.throws--;
    _reliquaryFan(e, a, ctx);
    e.flash = 0.15;
    if (bs.throws > 0) {
      // Open, the fan is thrown twice, and the second is aimed at the moment
      // it leaves - the pair is two questions, not one wide answer.
      bs.t = REL_VOLLEY2;
      return;
    }
    bs.volleyCd = REL_VOLLEY_CD * rate;
    _relRest(e, bs, rate);
    return;
  }

  if (bs.state === 'peal') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    if (bs.t > 0) {
      bs.t -= a.dt;
      // THE LIT AISLE. The beam runs from the lantern down the gap's bearing
      // for the whole tell - the way out is drawn in light before the ring
      // exists, so the player has the whole of the warning to use it.
      if (ctx.effects) {
        _cathAt.set(e.pos.x, 2.0, e.pos.z);
        _vigilTo.set(
          e.pos.x + Math.cos(bs.gap) * 24, 0.3,
          e.pos.z + Math.sin(bs.gap) * 24
        );
        ctx.effects.beam(_cathAt, _vigilTo, 0xe8d9a8);
      }
      if (bs.t > 0) return;
    }
    _reliquaryPeal(e, a, ctx, bs.gap);
    bs.throws--;
    if (bs.throws > 0) {
      // The second ring's gap has TURNED - the light moves, and the safe
      // answer of a moment ago is the wrong one now.
      bs.gap += REL_PEAL2_TURN;
      bs.t = REL_PEAL2;
      return;
    }
    bs.pealCd = REL_PEAL_CD * rate;
    _relRest(e, bs, rate);
    return;
  }

  if (bs.state === 'watch') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    bs.t -= a.dt;
    // THE LOCKED BEAM, drawn for the whole tell along the bearing taken when
    // the rite began - what the light shows is where the lance goes, which is
    // the vigil's contract arrived at from the shrine itself.
    if (ctx.effects) {
      _cathAt.set(e.pos.x, 2.0, e.pos.z);
      _vigilTo.set(
        e.pos.x + Math.cos(bs.aim) * REL_WATCH_RANGE, 0.3,
        e.pos.z + Math.sin(bs.aim) * REL_WATCH_RANGE
      );
      ctx.effects.beam(_cathAt, _vigilTo, 0xbfa76a);
    }
    // SEEN. The light slows whoever it is on, refreshed with its own duration
    // as the tail so it lapses the moment they step off the line - standing
    // in the beam is what loads the lance.
    const wx = ctx.player.pos.x - e.pos.x;
    const wz = ctx.player.pos.z - e.pos.z;
    const along = wx * Math.cos(bs.aim) + wz * Math.sin(bs.aim);
    if (along > 0 && along < REL_WATCH_RANGE
        && Math.abs(wx * Math.sin(bs.aim) - wz * Math.cos(bs.aim)) < REL_WATCH_R) {
      if (ctx.applyPlayerStatus) ctx.applyPlayerStatus('slowness', REL_WATCH_SLOW);
    }
    if (bs.t > 0) return;
    // THE LANCE, down the locked bearing and nowhere else - a sidestep off
    // the light cannot drag it onto whoever took it. Slowed with the boss
    // like every round in the game, so a frozen shrine throws a slower one.
    const live = Math.atan2(ctx.player.pos.z - e.pos.z, ctx.player.pos.x - e.pos.x);
    ctx.addProjectile(e.pos.x, 1.44 * e.scale, e.pos.z, 'reliquary',
      REL_WATCH_SPEED * e._projScale(), bs.aim - live);
    _cathAt.set(e.pos.x, 1.44 * e.scale, e.pos.z);
    ctx.effects.burst(_cathAt, 0xe8d9a8, 12, 5, 2, 0.35);
    if (ctx.sfx) ctx.sfx.impact();
    bs.watchCd = REL_WATCH_CD * rate;
    _relRest(e, bs, rate);
    return;
  }

  if (bs.state === 'candles') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    bs.t -= a.dt;
    if (bs.t <= 0 && bs.lit < REL_CANDLE_N) {
      bs.t = REL_CANDLE_PACE;
      _reliquaryCandle(e, a, ctx, bs);
    }
    _reliquaryCandlesTick(e, a, ctx, bs);
    if (bs.lit >= REL_CANDLE_N && !bs.candles.length) {
      // The crown goes out with the last landing: the lights were the tell,
      // and a tell that stays lit after its rite is a promise with no
      // attack behind it.
      bs.candles = null;
      bs.lit = 0;
      bs.candlesCd = REL_CANDLE_CD * rate;
      _relRest(e, bs, rate);
    }
    return;
  }

  if (bs.state === 'procTell') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    // The shrine FACES the aisle and dips, and the lane fills down it - the
    // area from the first frame and the timing as it fills, the pallbearer's
    // contract at the scale of the thing carrying the grave.
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-bs.dirX, -bs.dirZ);
    e.group.rotation.x = 0.1;
    bs.t -= a.dt;
    if (bs.mark >= 0 && bs.fx) {
      bs.fx.markSet(bs.mark,
        e.pos.x + bs.dirX * bs.len * 0.5, e.pos.z + bs.dirZ * bs.len * 0.5,
        REL_PROC_R, 0xc0a860, 1 - Math.max(0, bs.t) / REL_PROC_TELL,
        bs.len / (REL_PROC_R * 2), Math.atan2(-bs.dirX, -bs.dirZ));
    }
    if (bs.t > 0) return;
    if (bs.mark >= 0 && bs.fx) { bs.fx.markRelease(bs.mark); bs.mark = -1; }
    bs.state = 'proc';
    bs.gone = 0;
    bs.wakeT = 0;
    // The stride's own clock, with half a second of slack. The waystation is
    // normally reached by DISTANCE - the stride phases, so no pillar can cut
    // it short - and this clock is the backstop for the rare stride that
    // somehow never arrives: the slam still lands wherever it is.
    bs.t = bs.len / REL_PROC_SPEED + 0.5;
    return;
  }

  if (bs.state === 'proc') {
    bs.t -= a.dt;
    // THE STEP CLAMP HAS TO BE LIFTED for the stride, the colossus's reason:
    // update() caps a frame's movement at sp * stepMul, and 11 m/s written
    // into a.vx alone would come out at a walk. Set every frame rather than
    // once, so a slow landing mid-stride cannot drop the speed underneath it.
    e.stepMul = REL_PROC_SPEED / Math.max(0.5, a.sp);
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-bs.dirX, -bs.dirZ);
    // THE AISLE DOES NOT DETOUR. Phasing for the length of the stride - the
    // monolith's flag, kept - so the procession walks the lane it painted
    // door to door instead of grinding itself short on the first pillar:
    // the curate is already the one gunner in the game cover cannot answer,
    // and its boss keeps the same promise. The wall clamp still holds, and
    // the lane was shown at full length for the whole tell.
    e.phase = true;
    a.vx = bs.dirX * REL_PROC_SPEED;
    a.vz = bs.dirZ * REL_PROC_SPEED;
    bs.gone += REL_PROC_SPEED * a.dt;
    // CONSECRATED WHERE IT HAS WALKED. The old ring claim said the room fills
    // where the boss has been; the wake is where that went - the procession
    // itself is what lays the floor away now.
    bs.wakeT -= a.dt;
    if (bs.wakeT <= 0) {
      bs.wakeT = REL_WAKE_EVERY;
      ctx.addHazard(e.pos.x, e.pos.z, REL_WAKE_R, REL_WAKE_LIFE, REL_WAKE_DPS, 'hallow');
    }
    if (bs.gone >= bs.len || bs.t <= 0 || e.blockedBy > 0.05) {
      _reliquarySlam(e, a, ctx, bs);
      bs.procCd = REL_PROC_CD * rate;
    }
    return;
  }

  if (bs.state === 'kneel') {
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    bs.t -= a.dt;
    // THE SHRINE KNEELS. The whole silhouette folds forward on the free axis
    // while the floor it is about to answer swells on the same clock - the
    // pose and the circle are the one tell read two ways.
    const k = 1 - Math.max(0, bs.t) / REL_KNEEL;
    e.group.rotation.x = -0.16 * k;
    if (bs.mark >= 0 && bs.fx) {
      bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, REL_RISE_R, 0xc0a860, k);
    }
    if (bs.t > 0) return;
    if (bs.mark >= 0 && bs.fx) { bs.fx.markRelease(bs.mark); bs.mark = -1; }
    // THE RISE. The prayer ends and the circle answers - whoever is still
    // standing in it was told for the whole of the kneel.
    e.group.rotation.x = 0.12;
    if (a.dist < REL_RISE_R && _reachY(a) < BOSS_REACH_Y) {
      landHit(e, ctx, Math.min(REL_RISE_CAP, e.damage));
    }
    _cathAt.set(e.pos.x, 0.5, e.pos.z);
    if (ctx.effects) {
      ctx.effects.shockwave(_cathAt, 0xc0a860, REL_RISE_R + 1.2, 0.5);
      ctx.effects.burst(_cathAt, 0xe8d9a8, 26, 7, 3, 0.6);
      ctx.effects.addShake(0.25);
    }
    if (ctx.sfx) ctx.sfx.impact();
    bs.state = 'recover';
    bs.t = REL_RISE_RECOVER;
    bs.riseCd = REL_RISE_CD * rate;
    return;
  }

  if (bs.state === 'recover') {
    a.vx = 0;
    a.vz = 0;
    bs.t -= a.dt;
    // Straightening back up: the pose eases off on the same clock the state
    // runs out on, so the model and the fight agree the beat is over.
    e.group.rotation.x *= Math.max(0, bs.t) / REL_RISE_RECOVER;
    if (bs.t > 0) return;
    _relRest(e, bs, rate);
    return;
  }

  // ---- walk, and the picking of the next rite ------------------------------
  // Terror does not send a boss running - it just stops it doing anything,
  // which is what fearMode 'stagger' declares on the type.
  if (feared) {
    e._setEyeAlert(false);
    return;
  }

  bs.rest -= a.dt;
  bs.volleyCd -= a.dt;
  bs.pealCd -= a.dt;
  bs.candlesCd -= a.dt;
  bs.riseCd -= a.dt;
  bs.procCd -= a.dt;
  bs.watchCd -= a.dt;

  if (bs.rest <= 0) {
    // The rise is armed by PROXIMITY rather than by damage - the penitent's
    // rule at boss scale: it kneels AT the player, and the rise is the hit.
    if (bs.riseCd <= 0 && a.dist < REL_RISE_RANGE) {
      bs.state = 'kneel';
      bs.t = REL_KNEEL;
      bs.mark = ctx.effects.markAcquire();
      e.flash = 0.18;
      return;
    }
    if (bs.procCd <= 0 && a.dist > 4.5 && a.dist < 26) {
      // THROUGH the player and out the far side: the lane is the bearing to
      // them at this moment, walked well past them - clamped to the room,
      // because an arch does not process through a wall.
      const B = ARENA_HALF - e.radius - 0.4;
      const want = Math.min(REL_PROC_LEN, a.dist + 10);
      const tx = Math.max(-B, Math.min(B, e.pos.x + a.nx * want));
      const tz = Math.max(-B, Math.min(B, e.pos.z + a.nz * want));
      const len = Math.hypot(tx - e.pos.x, tz - e.pos.z);
      if (len >= 6) {
        bs.state = 'procTell';
        bs.t = REL_PROC_TELL;
        bs.dirX = a.nx;
        bs.dirZ = a.nz;
        bs.len = len;
        bs.mark = ctx.effects.markAcquire();
        e.flash = 0.18;
        return;
      }
      bs.procCd = 0.6 * rate;   // backed up against the room - try again shortly
    }
    if (bs.watchCd <= 0 && a.dist > 8 && a.dist < REL_WATCH_RANGE) {
      bs.state = 'watch';
      bs.t = REL_WATCH_TELL;
      // Locked AT THE PICK, before any of the tell: the beam is drawn where
      // the lance is going rather than where the player is looking, which is
      // the whole counter-play.
      bs.aim = Math.atan2(a.nz, a.nx);
      e.flash = 0.18;
      return;
    }
    if (bs.pealCd <= 0 && a.dist > 4 && a.dist < 22) {
      bs.state = 'peal';
      bs.t = REL_PEAL_TELL;
      bs.throws = bs.opened ? 2 : 1;
      // The gap opens TOWARD the player: the sanctuary receives them where
      // they stand - and where they stood two rings ago is the second ring's
      // business, not the first's.
      bs.gap = Math.atan2(a.nz, a.nx);
      e.flash = 0.18;
      return;
    }
    if (bs.candlesCd <= 0 && a.dist < 26) {
      bs.state = 'candles';
      bs.t = REL_CANDLE_RAISE;
      bs.lit = 0;
      bs.candles = [];
      e.flash = 0.18;
      return;
    }
    if (bs.volleyCd <= 0 && a.dist < 26) {
      bs.state = 'volley';
      bs.t = REL_VOLLEY_TELL;
      bs.throws = bs.opened ? 2 : 1;
      e.flash = 0.15;
      return;
    }
  }

  // The walk between rites: the melee cycle first, for whoever came to arm's
  // length - and while it answers, it owns the step.
  aiMelee(e, a);
  if (e.windup > 0 || e.swing > 0) return;
  // ...and otherwise the shrine CIRCLES THE NAVE. The procession is half of
  // why the old corner fight is gone; the orbit's drift is the other half.
  orbit(e, a, REL_ORBIT);
}

const TYPES = {
  // ---- CATHEDRAL ----------------------------------------------------------
  //
  // The theme of THE SANCTUARY AND THE TOLL. Six enemies and a boss, every
  // one of them reading as one family through the pale brass lantern each
  // carries - and every one of them a threshold: a kneel, a veil, a bell,
  // an arch, a grave, a beam.
  //
  // SO IT IS THE THEME WHERE LOOKING AWAY IS THE MISTAKE. A penitent you
  // stop watching rises. A pallbearer you do not sidestep brings its coffin
  // down on you. A sacristan you leave alive is charging you by the kill.

  // THE KNEEL AND THE RISE. It visibly folds down and takes 30% less damage
  // while it kneels; the next thing that happens is a hard hit at wherever
  // it was praying. Shots still work throughout, while the posture makes the
  // defensive window and the coming rise unmistakable.
  penitent: {
    head: { r: 0.3, y: 1.18 },
    hp: 38, speed: 3.2, damage: 10, value: 210, color: 0x7a6f4d, eye: 0xe8d9a8,
    scale: 1.0, radius: 0.48, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    armor: (e) => (e.pState === 'kneel' ? PEN_KNEEL_ARMOR : 1),
    armorDefault: (e) => (e.pState === 'kneel' ? PEN_KNEEL_ARMOR : 1),
    build: buildPenitent, ai: aiPenitent,
  },

  // The gunner whose round IGNORES COVER. Slow, deliberate, telegraphed by
  // the lantern dimming - and the answer to it is movement, never geometry,
  // because there is no geometry that helps. The one gunner in the game that
  // the pillar-build cannot answer.
  curate: {
    head: { r: 0.28, y: 0.72 },
    hp: 24, speed: 2.2, damage: 9, value: 250, color: 0x8a7c52, eye: 0xe8d9a8,
    scale: 1.0, radius: 0.46, mass: 1,
    orbit: { dist: 13, band: 2.5, out: 0.8, in: -0.6, strafe: 0.4, flip: 2, flipVar: 2.5 },
    proj: {
      core: 0xe8d9a8, glow: 0xc0a860, scale: 0.7,
      speed: CURATE_SPEED, dmg: CURATE_DMG,
      // WHAT WALKS THROUGH COVER. Read by Projectile.update, and the whole
      // enemy is in this one row: a round that stops against a pillar would
      // be an ordinary gunner with a rider on it.
      ghost: true,
    },
    build: buildCurate, ai: aiCurate,
  },

  // THE BURDEN CHARGE. Fully vulnerable in every state. It plants its feet,
  // hoists the coffin into a shield-sized silhouette and paints the committed
  // lane before rushing down it. The coffin hits the floor at the end, then
  // stays there through a long recovery: sidestep, turn, punish.
  pallbearer: {
    head: { r: 0.32, y: 1.2 },
    hp: 150, speed: 1.5, damage: 16, value: 310, color: 0x6d6444, eye: 0xe8d9a8,
    scale: 1.4, radius: 0.62, mass: 2,
    melee: { windup: 0.8, start: 2.9, hit: 3.5, cd: 2.4 },
    build: buildPallbearer, ai: aiPallbearer, cleanup: releasePallbearer,
  },

  // THE WALKING VEIL. It pours incense onto the floor along its whole walk,
  // and the incense costs no health at all - it takes SIGHT, exactly as the
  // drifter's curtain does, but it is walked rather than thrown: the cloud is
  // where the thurible has been, so the answer is to notice which way it is
  // walking and not to be behind it.
  thurible: {
    head: { r: 0.3, y: 1.02 },
    hp: 44, speed: 1.85, damage: 0, value: 280, color: 0x86794f, eye: 0xe8d9a8,
    scale: 1.15, radius: 0.52, mass: 1,
    orbit: { dist: 14, band: 2.5, out: 0.7, in: -0.55, strafe: 0.3, flip: 2.4, flipVar: 2 },
    build: buildThurible, ai: aiThurible,
  },

  // THE BELL RINGER. No attack of any kind: while it lives, every enemy that
  // dies near it TOLLS, and the toll chills the player wherever they are
  // standing - which makes it the one support in the game paid by the kill
  // rather than by the minute. The ring on the floor is the radius the bell
  // is heard at, drawn at exactly that radius, because a mechanic the player
  // cannot see the edge of is a tax they cannot answer.
  sacristan: {
    head: { r: 0.3, y: 1.06 },
    hp: 64, speed: 2.05, damage: 0, value: 340, color: 0x94865a, eye: 0xe8d9a8,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.3, flip: 2, flipVar: 2 },
    build: buildSacristan, ai: aiSacristan,
  },

  // THE LIGHT IN THE TOWER. It holds station and draws a beam at whoever it
  // is watching; the beam SLOWS, and every few seconds it locks the bearing
  // and fires a lance along it. Standing off the beam is free, which is the
  // weeper's question turned on its side: the line is on the floor for
  // everyone to see, and the answer is to not be on it.
  vigil: {
    head: { r: 0.28, y: 1.14 },
    hp: 56, speed: 3.4, damage: 12, value: 300, color: 0x9c8c5e, eye: 0xe8d9a8,
    scale: 1.1, radius: 0.48, mass: 1,
    fly: { height: VIGIL_HIGH },
    hitbox: { r: 0.6, y: 0.6 },
    orbit: { dist: 16, band: 2.5, out: 0.8, in: -0.6, strafe: 0.3, flip: 2.4, flipVar: 2 },
    proj: {
      core: 0xfff3d0, glow: 0xc0a860, scale: 0.8,
      speed: [24, 0.4, 32], dmg: [11, 0.45, 18],
    },
    build: buildVigil, ai: aiVigil,
  },

  // THE RELIQUARY. The fight is THE OFFICE now - five rites on short clocks
  // (see the boss block above) and a shrine that CIRCLES the room between
  // them instead of a corner it sits in. Unarmoured from the first second
  // and never armoured again: what the bar used to buy with armour the fight
  // now buys with threat. The hit sphere is the shrine's box and the head
  // sphere is centred on its FACE - the old pair left the lamps and the eyes
  // hanging a metre over both, and a round placed squarely on the face went
  // through air where a boss's head plainly was.
  reliquary: {
    head: { r: 0.5, y: 1.86 },
    hp: 3300, speed: 2.8, damage: 26, value: 6000, color: 0x8a7c52, eye: 0xe8d9a8,
    scale: 2.8, radius: 1.7, mass: 8, boss: true,
    hitbox: { r: 0.8, y: 0.92 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.6, start: 3.4, hit: 4.2, cd: 1.8 },
    // NO ARMOUR - no `armor` row at all, so every source in the game lands
    // in full from the first second, and the armoured-box fight this boss
    // used to be cannot quietly come back by either of the two gates.
    proj: {
      core: 0xe8d9a8, glow: 0xc0a860, scale: 0.85,
      speed: [12, 0.22, 18], dmg: [9, 0.4, 18],
    },
    build: buildReliquary, ai: aiReliquary, cleanup: releaseReliquary,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
