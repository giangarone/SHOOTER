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
  ENEMY_TYPES, SHARED_MATS, _bossAt, _blinkAt, aiMelee, bossTouch, eyes, geo,
  landHit, lump, orbit, partsFor, prism, slab, shard, spike,
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
//   penitent  crosses itself and is UNTOUCHABLE for as long as it kneels -
//             but it cannot move, and it rises to strike. A rusher you are
//             free to ignore until it is ready, and punished for shooting at
//             while it is down. Kill it on the rise or leave it: those are
//             the two answers, and everything else is wasted ammunition.
//   curate    fires SLOW rounds that pass straight through cover - the only
//             gunner in the game that does. The answer is not to break line
//             of sight, because there is none to break; it is to be somewhere
//             the round arrives anyway or to kill the curate first. Its
//             lantern dims as it charges, so the lane it is about to take
//             from you is on the model.
//   pallbearer  carries its own grave. Everything that lands on it while it
//             walks is banked, and on death it goes down in one piece with
//             the whole debt paid out at once - the first brute that is
//             LEAST dangerous at full health and most dangerous at a
//             sliver, which reverses the usual shape of finishing one.
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
// watching rises. A pallbearer you whittle down is becoming a corpse with your
// own shots in it. A sacristan you leave alive is charging you by the kill. The
// question it asks is the plague's question inverted: not what order to kill in,
// but WHICH OF THEM IS STILL COUNTING.

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
// Untouchable for as long as it kneels, via the armour rows on the stat block
// - a hard zero, the pale crown's contract, because a kneel that leaked a
// little would make shooting the kneeling body the correct play and the whole
// enemy is the decision to wait.
export const PEN_KNEEL = 1.1;

export const PEN_RISE = 0.42;

export const PEN_STROKE_R = 2.6;

export const PEN_STROKE_CD = 1.4;

export const PEN_TOUCH = 12;

export function aiPenitent(e, a) {
  // pState: 'walk' | 'kneel' | 'rise'
  if (e.pState === undefined) {
    e.pState = 'walk';
    e.pT = 0.8 + Math.random() * 0.8;
    e.pKneel = false;
  }

  // THE KNEEL, and it outranks the melee: the penitent kneels whether or not
  // the player is in reach, because the kneel is a promise about the next
  // stroke rather than a swing of its own.
  if (e.pState === 'kneel') {
    e.pT -= a.dt;
    // Frozen in place, in every sense: no movement, and any half-wound swing
    // is abandoned. The melee cycle's own windup test cannot fire here because
    // the branch never reaches it.
    a.vx = 0;
    a.vz = 0;
    e.windup = 0;
    e.swing = 0;
    if (e.pKneel) e._setEyeAlert(true);
    if (e.pT > 0) return;
    e.pState = 'rise';
    e.pT = PEN_RISE;
    e.pKneel = false;
    if (e.penHood) e.penHood.visible = false;
    return;
  }

  if (e.pState === 'rise') {
    e.pT -= a.dt;
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
  e.pT -= a.dt;
  if (e.pT <= 0) {
    if (a.dist < 9) {
      e.pState = 'kneel';
      e.pT = PEN_KNEEL;
      e.pKneel = true;
      if (e.penHood) e.penHood.visible = true;
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
// THE OPEN GRAVE, in hits rather than health. The engine's armour callback
// sees the DIRECTION of a blow rather than its size (see takeDamage), so a
// bank denominated in damage would have to be maintained somewhere outside
// the one place damage is ever dealt. The pallbearer banks per ROUND instead
// - the aegis's economy, arrived at from the other end: every round that
// lands on the walking body is swallowed by the grave (a flat 0.85 of the
// blow, so the bar barely moves) and COUNTED, and when the body finally goes
// down the grave opens and pays the whole count out at once, scaled by the
// wave's own damage.
//
// So it is the brute that is LEAST dangerous at full health and most
// dangerous at a sliver, which reverses the usual shape of finishing one -
// and the lids on the coffin part as the count grows, so the player can see
// the debt accumulating on the model before they finish the job.

// How much of what lands on the walking body the grave swallows. Most of it:
// a pallbearer on a full bar is nearly free to shoot, which is the bait.
export const PALL_BANK = 0.85;

// How much each swallowed round adds to the debt, as a fraction of the
// pallbearer's own hit. A late-wave pallbearer's grave is worse than an
// early one's for the same number of rounds, which keeps the debt on the
// difficulty curve the wave already owns.
export const PALL_DEBT_PER_ROUND = 0.35;

// The grave's reach when it opens, and the ring it leaves. The ground the
// corpse was carried to is consecrated for a few seconds - the theme's own
// answer to the husk, paid in the theme's own coin.
export const PALL_GRAVE_R = 3.0;

export const PALL_GRAVE_LIFE = 5.5;

export const PALL_GRAVE_DPS = 14;

// THE GRAVE'S BITE, dealt in one piece on death: the count of rounds it
// swallowed, priced at the debt rate, capped so that a whole magazine into
// a walking body is a hard hit rather than a one-shot.
export const PALL_GRAVE_CAP = 60;

export const _pallFrom = new THREE.Vector3();

export const _pallTo = new THREE.Vector3();

export function aiPallbearer(e, a) {
  aiMelee(e, a);
  // THE LIDS COME OFF as the debt grows - the bank made visible, so the
  // player can see the grave opening before they finish the job and choose
  // where to finish it.
  const debt = e.palDebt || 0;
  const k = Math.min(1, debt / 12);
  if (e.palLidL) e.palLidL.rotation.z = 0.5 + k * 0.5;
  if (e.palLidR) e.palLidR.rotation.z = -0.5 - k * 0.5;
  // The lantern it carries is the whole silhouette at a distance: bright,
  // pale brass, and steady.
  if (e.palLamp) {
    e.palLamp.rotation.y += a.dt * 0.8;
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

// A kneeling figure under a hooded lantern. Narrow, deeply cowled, the lantern
// held at the chest where the hood's shadow falls across it - the read is a
// penitent at prayer, and the hood is the kneel's visible half: it comes
// forward on the approach and drops for the rise.
export function buildPenitent(e, g, s) {
  const P = partsFor(e, g, s);
  // THE HOOD. Deep, forward-tilted, and the whole head - the face never
  // shows, which is the point of a penitent.
  e.penHood = P('penHood', spike(0.3, 0.62, 6), { y: 1.18, z: 0.04, rx: -0.34 });
  // A narrow upright body under it, hands drawn in at the chest.
  P('penTorso', prism(0.17, 0.24, 0.66, 5), { y: 0.82, rx: -0.08 });
  // THE LANTERN, held low at the chest where the hood shades it. Pale brass,
  // and the one lit thing on the body.
  P('penLamp', lump(0.11), {
    y: 0.86, z: -0.3, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  // THE ARCH of the silhouette: two thin uprights and a spanner over the
  // head, so even the smallest CATHEDRAL body reads as a doorway walking.
  // In cathStone rather than the body material, so a status tint cannot
  // make the doorway stop reading as stone.
  P('penArchL', slab(0.05, 0.92, 0.05), { x: -0.24, y: 0.74, rz: 0.08, mat: SHARED_MATS.cathStone });
  P('penArchR', slab(0.05, 0.92, 0.05), { x: 0.24, y: 0.74, rz: -0.08, mat: SHARED_MATS.cathStone });
  P('penArchTop', slab(0.56, 0.06, 0.07), { y: 1.24, mat: SHARED_MATS.cathStone });
  // Legs that fold: short, and angled as though halfway down already.
  P('penLeg', slab(0.1, 0.5, 0.11), { x: -0.14, y: 0.24, rx: 0.28 });
  P('penLeg', slab(0.1, 0.5, 0.11), { x: 0.14, y: 0.24, rx: 0.28 });
  eyes(P, { y: 1.02, x: 0.09, z: -0.3, r: 0.7, mat: e.eyeMat });
}

// The tallest thin thing in the theme: a curate is a lantern on a pole that
// walks. The lantern rides high and forward of the body, so the aim and the
// light are one line, and the body under the pole is an afterthought.
export function buildCurate(e, g, s) {
  const P = partsFor(e, g, s);
  // THE POLE, and it is most of the height: a thin column with the lamp
  // bracket at the top.
  P('cuPole', prism(0.06, 0.09, 1.3, 5), { y: 0.85 });
  P('cuArm', slab(0.06, 0.06, 0.42), { y: 1.5, z: -0.18 });
  // THE LANTERN, hung off the arm's end. Its dim is the charge's tell - see
  // aiCurate.
  e.cuLamp = P('cuLamp', lump(0.16), {
    y: 1.38, z: -0.38, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  // A small bowed body under the pole, mostly hidden by it.
  P('cuBody', prism(0.13, 0.19, 0.56, 5), { y: 0.56, z: 0.12, rx: -0.3 });
  P('cuSkirt', prism(0.2, 0.13, 0.3, 5), { y: 0.24, z: 0.1 });
  // Two long thin legs, splayed for the height - the read of a stilt walker
  // is wrong by exactly nothing.
  P('cuLeg', slab(0.05, 0.52, 0.05), { x: -0.13, y: 0.24, rz: 0.14 });
  P('cuLeg', slab(0.05, 0.52, 0.05), { x: 0.13, y: 0.24, rz: -0.14 });
  eyes(P, { y: 0.72, x: 0.08, z: -0.1, r: 0.65, mat: e.eyeMat });
}

// A doorway walking: the widest arch in the theme, carried flat across the
// shoulders like a yoke, with the coffin slung under the middle of it. The
// lantern rides the yoke's crown. Read: it is carrying a threshold, and there
// is a grave under it.
export function buildPallbearer(e, g, s) {
  const P = partsFor(e, g, s);
  // THE YOKE. Two uprights at the shoulders and a spanner over the head -
  // the arch at its plainest, and the outline's whole width, in the stone
  // that keeps its colour under a tint.
  P('palUpL', slab(0.09, 1.0, 0.1), { x: -0.42, y: 0.9, rz: 0.1, mat: SHARED_MATS.cathStone });
  P('palUpR', slab(0.09, 1.0, 0.1), { x: 0.42, y: 0.9, rz: -0.1, mat: SHARED_MATS.cathStone });
  P('palSpan', slab(1.0, 0.09, 0.12), { y: 1.44, mat: SHARED_MATS.cathStone });
  // THE LANTERN at the crown of the yoke.
  e.palLamp = P('palLamp', lump(0.14), {
    y: 1.6, z: 0.0, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  // THE COFFIN, slung under the yoke between the uprights. Two lids that
  // part as the bar falls - the bank made visible, so the player can see the
  // grave opening before they finish the job.
  e.palLidL = P('palLidL', slab(0.3, 0.1, 0.9), { x: -0.17, y: 0.92, rz: 0.5 });
  e.palLidR = P('palLidR', slab(0.3, 0.1, 0.9), { x: 0.17, y: 0.92, rz: -0.5 });
  P('palBody', slab(0.34, 0.5, 0.8), { y: 0.9, rx: 0.06 });
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
// body itself is a hooded column - barely a body at all, because the censer
// is the silhouette and the smoke is the enemy.
export function buildThurible(e, g, s) {
  const P = partsFor(e, g, s);
  // THE CENSER. Hung well forward and low, on two chains from the arm - the
  // one part of the outline that moves every frame, and the author of
  // everything on the floor.
  e.thurArm = P('thurArm', slab(0.07, 0.07, 0.62), { y: 1.0, z: -0.28, rx: 0.2 });
  P('thurChain', slab(0.02, 0.3, 0.02), { y: 0.98, z: -0.56 });
  P('thurChain', slab(0.02, 0.3, 0.02), { y: 0.98, z: -0.56, rz: 0.1 });
  e.thurCenser = P('thurCenser', prism(0.14, 0.2, 0.24, 6), {
    y: 0.72, z: -0.58, mat: SHARED_MATS.cathGilt,
  });
  // A plume of lit smoke above the censer's mouth - small, and the only
  // other lit thing on the model.
  P('thurPlume', spike(0.09, 0.3, 5), {
    y: 0.94, z: -0.58, rx: Math.PI, mat: SHARED_MATS.cathGilt, shadow: false,
  });
  // THE HOODED COLUMN: a narrow body under a deep cowl, arms hidden.
  P('thurRobe', prism(0.2, 0.32, 0.72, 5), { y: 0.5, rx: -0.1 });
  P('thurHood', spike(0.2, 0.44, 6), { y: 1.1, z: 0.02, rx: -0.3 });
  // A long thin arm behind, for balance - the read of a thing that carries
  // weight in front of it.
  P('thurArmB', slab(0.05, 0.05, 0.4), { y: 0.9, z: 0.3, rx: -0.3 });
  // The arch, small and worn high: the chains and the hood's point.
  P('thurArch', slab(0.4, 0.05, 0.06), { y: 1.38 });
  eyes(P, { y: 0.98, x: 0.08, z: -0.2, r: 0.65, mat: e.eyeMat });
}

// THE BELL RINGER. A bell hung in a small frame above the head, and a wide
// shallow ring drawn on the floor at exactly the radius the toll is heard at
// - the hoarfrost's contract: a mechanic the player cannot see the edge of
// is a tax they cannot answer.
export function buildSacristan(e, g, s) {
  const P = partsFor(e, g, s);
  // THE BELL, hung from a two-post frame. It is the whole upper silhouette,
  // and it turns - slowly, the way a heavy thing does.
  P('sacPost', slab(0.05, 0.7, 0.05), { x: -0.2, y: 1.3, rz: 0.06 });
  P('sacPost', slab(0.05, 0.7, 0.05), { x: 0.2, y: 1.3, rz: -0.06 });
  P('sacLintel', slab(0.5, 0.06, 0.07), { y: 1.66 });
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
  P('sacClap', spike(0.05, 0.16, 4), { y: 1.36, mat: e.eyeMat, shadow: false });
  // A narrow hooded body under the frame, hands raised to the rope.
  P('sacRobe', prism(0.18, 0.26, 0.6, 5), { y: 0.64, rx: -0.06 });
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

// THE LIGHT IN THE TOWER. A tall louvered lamp hanging under a small body
// with two ragged vanes: read from below, it is a lantern with wings, and
// the beam it draws on the floor is the whole enemy.
export function buildVigil(e, g, s) {
  const P = partsFor(e, g, s);
  // THE TOWER LAMP. Tall, louvered, and lit from within - the widest part of
  // the silhouette from anywhere, because it is the thing the player has to
  // find to answer the beam.
  P('vgLampBody', prism(0.14, 0.2, 0.5, 5), {
    y: 0.5, mat: SHARED_MATS.cathGilt,
  });
  P('vgLampCap', spike(0.14, 0.22, 4), { y: 0.86, mat: SHARED_MATS.cathGilt });
  P('vgLampFoot', prism(0.06, 0.12, 0.12, 5), { y: 0.22, mat: SHARED_MATS.cathGilt });
  // The small body above it: a hooded seed, no bigger than the lamp itself.
  P('vgBody', lump(0.16), { y: 1.12 });
  P('vgHood', spike(0.12, 0.3, 5), { y: 1.3, z: 0.02, rx: -0.4 });
  // Two ragged vanes, high and swept - the theme's one airborne body keeps
  // the arch in the vanes: two uprights and nothing between them.
  P('vgVane', slab(0.5, 0.04, 0.2), { x: -0.34, y: 1.3, z: 0.1, ry: 0.5, rz: 0.2 });
  P('vgVane', slab(0.5, 0.04, 0.2), { x: 0.34, y: 1.3, z: 0.1, ry: -0.5, rz: -0.2 });
  eyes(P, { y: 1.16, x: 0.07, z: -0.16, r: 0.6, mat: e.eyeMat });
}

// THE RELIQUARY. A shrine that walks: a reliquary box carried under a great
// arch on four claw-legs, with a crown of candles along the spanner, a bell
// hung at the yoke's crown, and the theme's lantern flaring at the centre.
// The box is the health bar's argument - shut and armoured until the last
// third, then the lids go wide and the glow pours out.
export function buildReliquary(e, g, s) {
  const P = partsFor(e, g, s);
  // THE ARCH, at boss scale: two great uprights and a spanner, carrying the
  // whole silhouette. The boss is a doorway, and it is walking through
  // itself.
  P('relUpL', slab(0.16, 1.9, 0.18), { x: -0.66, y: 1.7, rz: 0.06, mat: SHARED_MATS.cathStone });
  P('relUpR', slab(0.16, 1.9, 0.18), { x: 0.66, y: 1.7, rz: -0.06, mat: SHARED_MATS.cathStone });
  P('relSpan', slab(1.6, 0.14, 0.2), { y: 2.7, mat: SHARED_MATS.cathStone });
  // A CROWN OF CANDLES along the spanner, the sacristan's lit brass at boss
  // scale - the skyline that says CATHEDRAL from anywhere in the room.
  for (let i = 0; i < 5; i++) {
    P('relCandle', spike(0.05, 0.26 + (i % 2) * 0.1, 4), {
      x: -0.56 + i * 0.28, y: 2.9, mat: SHARED_MATS.cathGilt, shadow: false,
    });
  }
  // THE BELL, hung from the spanner's centre. It swings with each toll and
  // eases back upright between them - the fight's clock is on the model.
  e.relBell = new THREE.Mesh(
    geo('relBell', () => new THREE.CylinderGeometry(0.2, 0.34, 0.44, 6, 1, true)),
    SHARED_MATS.cathGilt
  );
  e.relBell.position.set(0, 2.34 * s, 0);
  e.relBell.scale.setScalar(s);
  g.add(e.relBell);
  // THE RELIQUARY BOX, slung under the arch between the uprights: two lids
  // that part as the fight goes on and come off for good at the opening.
  // Shut, it is the armoured read - a reliquary is a box you cannot open.
  e.relLidL = P('relLidL', slab(0.5, 0.14, 1.1), { x: -0.3, y: 1.44, rz: 0.5 });
  e.relLidR = P('relLidR', slab(0.5, 0.14, 1.1), { x: 0.3, y: 1.44, rz: -0.5 });
  // THE LANTERN at the box's centre, inside the arch - the theme's own
  // lamp, at the scale of the thing carrying it. It flares for the volley.
  e.relLamp = P('relLamp', lump(0.24), {
    y: 1.44, mat: SHARED_MATS.cathGilt, shadow: false,
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
      mat: SHARED_MATS.cathStone,
    });
    P('relClaw', spike(0.11, 0.44, 4), {
      x: side * 0.98, y: 0.04, z: fore * 0.78, rx: Math.PI, rz: side * 0.34,
      mat: SHARED_MATS.cathStone,
    });
  }
  eyes(P, { y: 1.86, x: 0.16, z: -0.3, r: 1.0, mat: e.eyeMat });
}

// ---- the boss ----------------------------------------------------------------
//
// THE RELIQUARY, and the fight is the FLOOR. A shrine that walks, claiming
// the ground around itself in gapped rings of consecration that stay where
// it stood - over a fight the room fills with pockets of hallow exactly
// where the boss has been, and the floor the player was kiting on goes away
// a piece at a time.
//
//   the CLAIM    it stops, the floor around it pulses for a beat, and a
//   (the ring)   gapped ring of consecration is laid where it stands. It
//                walks on and the ring stays behind.
//   the VOLLEY   a slow processional fan of three off the lantern, telegraphed
//                by the lantern flaring - the curate's own attack at boss
//                scale, which the player already knows how to read.
//   the TOLL     under two thirds of the bar the bell tolls on its own: a
//                chill that reaches wherever the player is, the sacristan's
//                price collected by the sanctuary itself.
//   the OPENING  under a third of the bar the reliquary opens for good - the
//                lids go wide, the armour comes off, and the last third of
//                the fight is the fastest.

// The ring: how long it stands still to call one, how wide, how many patches,
// and what each one costs to cross.
export const REL_RING_TELL = 0.85;

export const REL_RING_R = 6.2;

export const REL_RING_N = 10;

export const REL_RING_PATCH_R = 2.1;

export const REL_RING_LIFE = 7.5;

export const REL_RING_DPS = 13;

export const REL_RING_CD = 8;

// The volley: cooldown, tell, and the fan between the arms.
export const REL_VOLLEY_CD = 3.2;

export const REL_VOLLEY_TELL = 0.55;

export const REL_VOLLEY_FAN = 0.18;

// The toll: when it starts on the bar, how often, and how long the chill.
export const REL_TOLL_AT = 0.62;

export const REL_TOLL_CD = 3.4;

export const REL_TOLL_CHILL = 2.0;

// The opening, and what it is worth.
export const REL_OPEN_AT = 0.3;

export const REL_OPEN_ARMOR = 0.3;

// How much the lantern flares on the volley tell.
export const REL_LANTERN_FLARE = 1.9;

// Scratch, module-level and reused: the ring-laying and every burst run more
// than once a second across a whole fight.
export const _cathAt = new THREE.Vector3();

export function aiReliquary(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.ringCd = 4;
    bs.ringTell = 0;
    bs.volleyCd = 2.6;
    bs.volleyTell = 0;
    bs.tollCd = 0;
    bs.opened = false;
    // Read by main.js's 'vent' bossEvent for the HUD note. The reliquary's
    // own word for its open state, rather than the colossus's.
    bs.ventNote = 'RELIQUARY OPEN';
  }

  // Standing on it costs, in every state - the broodmother's contract for a
  // slow boss: hugging the shrine is not a plan.
  bossTouch(e, a);

  // THE LANTERN, driven every frame: it flares through a volley's tell and
  // burns steady otherwise, so the fight's ranged state is on the boss's own
  // yoke rather than in anybody's imagination.
  if (e.relLamp) {
    const flare = bs.volleyTell > 0 ? REL_LANTERN_FLARE : 1;
    e.relLamp.scale.setScalar(flare * e.scale);
    e.relLamp.rotation.y += a.dt * 0.9;
  }

  // THE OPENING, once and for keeps. Under a third of the bar the reliquary
  // opens: the lids go wide, the armour comes off, and the last third of the
  // fight is the fastest. Crossing the threshold interrupts nothing - it is
  // read before the states, exactly as the pale crown's shells are.
  if (!bs.opened && e.hp <= e.maxHp * REL_OPEN_AT) {
    bs.opened = true;
    // Rotation only, on parts P() already sized: the lids were built hinged
    // at half a radian and the opening takes them the rest of the way.
    if (e.relLidL) e.relLidL.rotation.z = 1.25;
    if (e.relLidR) e.relLidR.rotation.z = -1.25;
    bs.weakOpen = true;
    ctx.bossEvent('vent', e);
    if (ctx.effects) {
      _cathAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.shockwave(_cathAt, 0xe8d9a8, 8, 0.5);
      ctx.effects.burst(_cathAt, 0xe8d9a8, 34, 7, 2.5, 0.8);
    }
    if (ctx.sfx) ctx.sfx.wave();
  }

  // ---- the ring -----------------------------------------------------------
  // A claim on the floor where it is standing: a beat of warning, a pulse at
  // the radius, then a gapped ring of consecration laid in one frame. It
  // walks on and the ring stays behind, so the room fills with pockets of
  // consecrated ground exactly where it has been.
  if (bs.ringTell > 0) {
    bs.ringTell -= a.dt;
    a.vx = 0;
    a.vz = 0;
    e._setEyeAlert(true);
    if (ctx.effects) {
      _cathAt.set(e.pos.x, 0.12, e.pos.z);
      ctx.effects.shockwave(_cathAt, 0xc0a860, REL_RING_R, 0.16);
    }
    if (bs.ringTell <= 0) {
      e._setEyeAlert(false);
      bs.ringCd = REL_RING_CD * e.rate;
      const off = Math.random() * Math.PI * 2;
      // A GAP IN THE RING, rotated at random: a closed ring with the boss
      // inside it would wall the player's own kite lane off, and the gap is
      // what makes the ring a question rather than a jail.
      const gapAt = (Math.random() * REL_RING_N) | 0;
      for (let i = 0; i < REL_RING_N; i++) {
        if (i === gapAt || i === (gapAt + 1) % REL_RING_N) continue;
        const ang = off + (i / REL_RING_N) * Math.PI * 2;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * REL_RING_R,
          e.pos.z + Math.sin(ang) * REL_RING_R,
          REL_RING_PATCH_R, REL_RING_LIFE, REL_RING_DPS, 'hallow'
        );
      }
      _cathAt.set(e.pos.x, 0.1, e.pos.z);
      ctx.effects.shockwave(_cathAt, 0xc0a860, REL_RING_R + 2, 0.4);
      ctx.effects.addShake(0.2);
      if (ctx.sfx) ctx.sfx.impact();
    }
    return;
  }

  // ---- the volley ---------------------------------------------------------
  // The processional fan, off the lantern. Slow rounds, few of them, and the
  // tell is the lantern flaring - the curate's own attack at boss scale.
  if (bs.volleyTell > 0) {
    bs.volleyTell -= a.dt;
    if (bs.volleyTell <= 0) {
      const y = 1.4 * (e.group.scale.y || 1);
      for (let i = -1; i <= 1; i++) {
        ctx.addProjectile(e.pos.x, y, e.pos.z, 'reliquary', 1, i * REL_VOLLEY_FAN);
      }
      _cathAt.set(e.pos.x, y, e.pos.z);
      ctx.effects.burst(_cathAt, 0xe8d9a8, 14, 5, 2, 0.4);
    }
  } else {
    bs.volleyCd -= a.dt;
    if (bs.volleyCd <= 0 && a.dist < 26) {
      bs.volleyCd = REL_VOLLEY_CD * e.rate;
      bs.volleyTell = REL_VOLLEY_TELL;
      e.flash = 0.15;
    }
  }

  // ---- the toll -----------------------------------------------------------
  // Under two thirds of the bar the bell begins to toll on its own: a chill
  // that reaches the player wherever they are, the price of the sanctuary
  // collected by the sanctuary itself. It does not stack - slowness refreshes
  // rather than adding, the rule every status in the game keeps.
  if (e.hp <= e.maxHp * REL_TOLL_AT) {
    bs.tollCd -= a.dt;
    if (bs.tollCd <= 0) {
      bs.tollCd = REL_TOLL_CD * e.rate;
      if (ctx.applyPlayerStatus) ctx.applyPlayerStatus('slowness', REL_TOLL_CHILL);
      if (e.relBell) {
        // The boss's own bell swings once, visibly, with each toll.
        e.relBell.rotation.x = 0.5;
      }
      _cathAt.set(e.pos.x, 2.2, e.pos.z);
      if (ctx.effects) {
        ctx.effects.shockwave(_cathAt, 0xc0a860, REL_RING_R * 0.8, 0.5);
        ctx.effects.burst(_cathAt, 0xe8d9a8, 12, 4, 2, 0.4);
      }
      if (ctx.sfx) ctx.sfx.impact();
    }
  }
  // The bell eases back upright between tolls.
  if (e.relBell) {
    e.relBell.rotation.x += (0 - e.relBell.rotation.x) * Math.min(1, a.dt * 4);
  }

  // ---- walking, and the ring's call ---------------------------------------
  aiMelee(e, a);
  bs.ringCd -= a.dt;
  if (bs.ringCd <= 0 && a.dist > 5) {
    bs.ringTell = REL_RING_TELL;
    e.flash = 0.18;
  }
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
  // stop watching rises. A pallbearer you whittle down is becoming a corpse
  // with your own shots banked in it. A sacristan you leave alive is
  // charging you by the kill.

  // THE KNEEL AND THE RISE. Untouchable while it kneels, and the kneel is
  // the tell: it crosses itself, drops its hood, and the next thing that
  // happens is a hard hit at wherever it was kneeling. Free to ignore while
  // it walks, dangerous to shoot at while it is down - the whole enemy is
  // the decision about which of those two you are doing.
  penitent: {
    head: { r: 0.3, y: 1.18 },
    hp: 38, speed: 3.2, damage: 10, value: 210, color: 0x7a6f4d, eye: 0xe8d9a8,
    scale: 1.0, radius: 0.48, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    // NOTHING GETS THROUGH THE KNEEL. The hood comes down and the body is
    // not there - a hard zero, the pale crown's contract, and for the same
    // reason: a kneel that leaked would make shooting the penance the
    // correct play and the rise a decoration.
    armor: (e) => (e.pState === 'kneel' ? 0 : 1),
    armorDefault: (e) => (e.pState === 'kneel' ? 0 : 1),
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

  // THE OPEN GRAVE. A brute that swallows most of every round that lands on
  // it while it walks, COUNTS them, and pays the whole count out at once when
  // it dies - in one hard hit on the spot and a ring of consecrated ground
  // over the corpse. Least dangerous at full health and most dangerous at a
  // sliver, which reverses the usual shape of finishing a brute: the bait is
  // a body that barely seems to take damage, and the bill is wherever the
  // player chose to stand while shooting it.
  pallbearer: {
    head: { r: 0.32, y: 1.2 },
    hp: 150, speed: 1.5, damage: 16, value: 310, color: 0x6d6444, eye: 0xe8d9a8,
    scale: 1.4, radius: 0.62, mass: 2,
    melee: { windup: 0.8, start: 2.9, hit: 3.5, cd: 2.4 },
    // THE BANK. The grave swallows most of every round that lands and keeps
    // the count; the walking body takes a sliver. Directionless sources -
    // a burn, a poison tick, a blast - fall to armorDefault and are NOT
    // counted, the plate's rule: what seeps into a body is not a round the
    // grave was ever given, and it keeps the patient builds the patient
    // answer to a walking coffin.
    armor: (e) => {
      e.palDebt = (e.palDebt || 0) + 1;
      return 1 - PALL_BANK;
    },
    armorDefault: 1,
    onDeath: (e, ctx) => {
      // THE GRAVE OPENS where the pallbearer stood: the debt paid out in one
      // piece, and the ground consecrated for a few seconds after. A
      // pallbearer finished at arm's length is the most expensive thing in
      // the theme.
      const rounds = e.palDebt || 0;
      const bite = Math.min(PALL_GRAVE_CAP, rounds * PALL_DEBT_PER_ROUND * e.damage);
      const p = ctx.player;
      if (p && bite > 0) {
        const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
        if (d < PALL_GRAVE_R) {
          // Falloff by how close they were to the grave, the mortar's shape:
          // standing on the corpse pays the whole bill, the edge of the ring
          // pays most of it, and two steps out pays nothing at all.
          ctx.onHitPlayer(bite * (1 - d / PALL_GRAVE_R), e.pos, e);
        }
      }
      ctx.addHazard(e.pos.x, e.pos.z, PALL_GRAVE_R, PALL_GRAVE_LIFE, PALL_GRAVE_DPS, 'hallow');
      if (ctx.effects) {
        _cathAt.set(e.pos.x, 0.9, e.pos.z);
        ctx.effects.shockwave(_cathAt, 0xc0a860, PALL_GRAVE_R, 0.45);
        ctx.effects.burst(_cathAt, 0xe8d9a8, 26, 5, 2.2, 0.8);
      }
      if (ctx.sfx) ctx.sfx.impact();
    },
    build: buildPallbearer, ai: aiPallbearer,
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

  // THE RELIQUARY. Slow, armoured, and the fight is the FLOOR: it claims the
  // ground around itself in gapped rings of consecration that stay where it
  // stood, throws a slow processional fan off its own lantern, and under two
  // thirds of the bar its bell tolls on its own - a chill that reaches
  // wherever the player is. Under a third the reliquary opens for good and
  // the last stretch is the fastest. The room is the boss's health bar, and
  // it is shrinking.
  reliquary: {
    head: { r: 0.44, y: 1.5 },
    hp: 3300, speed: 2.1, damage: 26, value: 6000, color: 0x8a7c52, eye: 0xe8d9a8,
    scale: 2.8, radius: 1.7, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.7, start: 3.4, hit: 4.2, cd: 2.2 },
    // ARMOUR AS A STATE, and the state is the reliquary's own doors. Shut,
    // it takes less than a third of what lands; opened, the doors go wide
    // for the rest of the fight. Both rows read the same flag - the pale
    // crown's lesson, learned once: a constant here made the boss immune to
    // every directionless source in the game for the whole fight.
    armor: (e) => ((e.bs && e.bs.opened) ? 1 : REL_OPEN_ARMOR),
    armorDefault: (e) => ((e.bs && e.bs.opened) ? 1 : REL_OPEN_ARMOR),
    proj: {
      core: 0xe8d9a8, glow: 0xc0a860, scale: 0.85,
      speed: [12, 0.22, 18], dmg: [9, 0.4, 18],
    },
    build: buildReliquary, ai: aiReliquary,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
