// LUNAR's six enemies and its boss.
//
// One file per theme, and it imports NOTHING from any other theme - see
// shared.js for why. What is here is this theme's stat blocks, its models, its
// behaviour and the constants only it uses; anything a second theme wanted is
// in shared.js by construction.
//
// THE THEME'S ARGUMENT: THE MOON IS DOWN HERE, AND THE FLOOR IS A SUGGESTION.
// The block carries the arena's own pull at three-fifths (THEMES.lunar.gravity),
// and every body in it is built for that sky - the hare and the boss CROSS it
// in bounds, the moth skips along it like a stone off water, the bell's answer
// falls OUT of it, the craterback's slam takes it from under the player, and
// the tidecaller's ring drags the whole wave through it. Where BRINE takes the
// ground away, LUNAR takes the WEIGHT away - and then charges for the landing.
//
// AND THE WHOLE ROSTER IS SILENT, ON PURPOSE. There is no air here, and the
// theme says so with the one thing a wave can be missing: not one of these
// enemies calls ctx.sfx for anything - not its attacks, not its landings, not
// its casts. The dust, the rings, the shake and the corona are the whole
// announcement, and the quiet is what makes the room's own music the loudest
// thing in the block. If a sound feels missing here, that is where it belongs.

import * as THREE from 'three';
import {
  ENEMY_TYPES, SHARED_MATS, _bossAt, _blinkAt, addWarnedMortar, aiMelee,
  bossTouch, capturedShot, contactReach, eyes, geo, landHit, lump, orbit,
  partsFor, prism, releaseMarks, rock, segBlocked, shard, slab, snapAim,
  faceSnap, spike,
} from './shared.js';

// The family's moonlight, as a hex the effects can take - SHARED_MATS.lunarGlow
// is the material, this is the colour a burst or a ring needs.
export const LUNAR_MOON = 0xdfe6ff;

// Scratch for this theme's own effect points. Module-level and consumed
// immediately, like every other scratch vector in shared.js.
export const _lunAt = new THREE.Vector3();

// ============================================================================
// MOONHARE - the rusher. It does not run at you; it BOUNDS, one long low arc
// at a time, and the bound commits to where you WERE at the crouch. The tell
// is the whole silhouette folding down, the landing is a thump, and the half
// second of stagger afterwards is the window the fight pays for.
// ============================================================================

export const HARE_MIN = 4.2;    // inside this it just fights - a point-blank hop is a tantrum
export const HARE_MAX = 12;     // past this it cannot reach in one bound
export const HARE_WINDUP = 0.42;
export const HARE_CD = 2.4;
export const HARE_LIFT = 1.6;
export const HARE_THUMP = 2.3;

// A crouched sprinter of a thing: haunches gathered under it, ears raked back.
// Read as a flat shape it is all hindquarters and ears - which is exactly what
// it is about to do.
export function buildMoonhare(e, g, s) {
  const P = partsFor(e, g, s);
  // The body, tipped nose-down over the front paws.
  P('hareBody', prism(0.19, 0.27, 0.58, 5), { y: 0.55, z: 0.04, rx: -1.15 });
  // THE HAUNCHES. Two big gathered thighs - most of the rear silhouette.
  P('hareHaunch', lump(0.24), { x: -0.2, y: 0.52, z: 0.2, sy: 1.25, sz: 1.1 });
  P('hareHaunch', lump(0.24), { x: 0.2, y: 0.52, z: 0.2, sy: 1.25, sz: 1.1 });
  // The springs: long folded hind legs, tipped as if already pushing off.
  P('hareSki', slab(0.09, 0.14, 0.5), { x: -0.23, y: 0.18, z: 0.2, rx: 0.35 });
  P('hareSki', slab(0.09, 0.14, 0.5), { x: 0.23, y: 0.18, z: 0.2, rx: 0.35 });
  // Forepaws, small and low - they land, they do not run.
  P('hareFore', spike(0.05, 0.3, 4), { x: -0.12, y: 0.2, z: -0.26, rx: 2.75 });
  P('hareFore', spike(0.05, 0.3, 4), { x: 0.12, y: 0.2, z: -0.26, rx: 2.75 });
  // Chest and head, one wedge.
  P('hareHead', prism(0.15, 0.2, 0.3, 5), { y: 0.74, z: -0.3, rx: -0.55 });
  // THE EARS - tall blades laid back over the shoulders. They are kept
  // because the windup folds them flat: the whole tell is in them.
  e.hareEarL = P('hareEar', slab(0.06, 0.52, 0.12), { x: -0.1, y: 1.1, z: -0.14, rx: -0.75, rz: 0.14 });
  e.hareEarR = P('hareEar', slab(0.06, 0.52, 0.12), { x: 0.1, y: 1.1, z: -0.14, rx: -0.75, rz: -0.14 });
  // Powder puff.
  P('hareTail', lump(0.11), { y: 0.62, z: 0.36 });
  eyes(P, { y: 0.8, x: 0.09, z: -0.44, r: 0.8, mat: e.eyeMat });
}

export function aiMoonhare(e, a) {
  // update() owns the arc while a bound is in flight and hands back on the
  // landing, so 'air' seen here means DOWN, this frame.
  if (e.hop === 'air') {
    e.hop = '';
    e.attackCd = 0.55;
    e._setEyeAlert(false);
    _lunAt.set(e.pos.x, 0.25, e.pos.z);
    a.ctx.effects.shockwave(_lunAt, ENEMY_TYPES.moonhare.eye, HARE_THUMP, 0.4);
    a.ctx.effects.burst(_lunAt, LUNAR_MOON, 12, 3.5, 2, 0.5);
    if (contactReach(e, a, HARE_THUMP)) landHit(e, a.ctx);
    return;
  }
  if (e.hop === 'wind') {
    // Crouching: the body folds, the ears lay flat, and nothing moves. The
    // bound is committed to where the player is at the END of this - the
    // crouch is all the warning a three-metre leap gets.
    a.vx = 0;
    a.vz = 0;
    e.hopT -= a.dt;
    const fill = 1 - Math.max(0, e.hopT) / HARE_WINDUP;
    e.group.scale.set(e.scale * (1 + fill * 0.14), e.scale * (1 - fill * 0.24), e.scale * (1 + fill * 0.12));
    e.hareEarL.rotation.x = -0.75 - fill * 0.85;
    e.hareEarR.rotation.x = -0.75 - fill * 0.85;
    if (e.hopT > 0) return;
    e.group.scale.setScalar(e.scale);
    snapAim(e, a);
    if (e._startJump(e.tx, 0, e.tz, HARE_LIFT + a.dist * 0.05, a.ctx)) {
      e.hop = 'air';
    } else {
      // No clear arc - the crouch refuses rather than leaps into cover, and
      // the retry is SHORT: the cooldown was already spent at the crouch, and
      // a hare that keeps finding its line blocked would otherwise sit out
      // three seconds of the fight at a time.
      e.hop = '';
      e._setEyeAlert(false);
      e.attackCd = 0.4;
      e.hopCd = 0.8;
    }
    e.hareEarL.rotation.x = -0.75;
    e.hareEarR.rotation.x = -0.75;
    return;
  }
  aiMelee(e, a);
  e.hopCd = (e.hopCd === undefined ? 1.2 : e.hopCd) - a.dt;
  if (e.hopCd <= 0 && a.dist > HARE_MIN && a.dist < HARE_MAX && e.jumpCd <= 0) {
    e.hop = 'wind';
    e.hopT = HARE_WINDUP;
    e.hopCd = HARE_CD + Math.random() * 0.8;
    e._setEyeAlert(true);
  }
}

// ============================================================================
// LANDER - the gunner. A lunar module gone feral: foil and four splayed legs,
// a dish it fires out of in PAIRS, and - the reason it cannot be cornered -
// thruster pods it lights to throw itself sideways the moment something closes
// on it. The dodge is not a teleport and it is not fast; it is a burn, and it
// is over before you have swung round on it.
// ============================================================================

export const LANDER_RANGE = 17;
export const LANDER_CD = 2.4;
export const LANDER_GAP = 0.14;
export const LANDER_BURN_R = 7.5;   // the player inside this lights the pods
export const LANDER_BURN_CD = 6.5;
export const LANDER_BURN_T = 0.5;
export const LANDER_BURN_MUL = 2.6; // stepMul and speed multiplier of the burn

export function buildLander(e, g, s) {
  const P = partsFor(e, g, s);
  // Four legs splayed wide with big round pads - the lander's whole stance.
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 ? 1 : -1;
    const sz = i < 2 ? 1 : -1;
    P('landerPad', prism(0.14, 0.17, 0.06, 6), { x: 0.36 * sx, y: 0.04, z: 0.32 * sz });
    P('landerLeg', slab(0.06, 0.56, 0.06), {
      x: 0.3 * sx, y: 0.32, z: 0.27 * sz, rx: sz * 0.5, rz: -sx * 0.5,
    });
  }
  // THE BUS - a foil box, and the ascent stage stacked on it a half-step
  // back. The foil is BODY-SIDE, not glow: too much lit material up here and
  // the whole enemy collapses into a lamp at arena range.
  P('landerBus', slab(0.54, 0.34, 0.48), { y: 0.74 });
  P('landerDeck', prism(0.36, 0.46, 0.18, 8), { y: 0.98 });
  P('landerStage', slab(0.34, 0.24, 0.3), { y: 1.14, mat: SHARED_MATS.lunarRock });
  // THE DISH, swivelled down at the player. Small, lit, and FORWARD of the
  // bus so it reads as the one working part - it is the gun and the head.
  P('landerStalk', slab(0.06, 0.2, 0.06), { y: 1.08, z: -0.28 });
  e.landerDish = P('landerDish', spike(0.17, 0.1, 8), {
    y: 1.18, z: -0.38, rx: -2.0, mat: SHARED_MATS.lunarGlow, shadow: false,
  });
  // The beacon - the one light on top, and it is what flashes with the eyes.
  P('landerBeacon', shard(0.08), { y: 1.34, mat: e.eyeMat, shadow: false });
  // Thruster pods under the rear corners. Dark until the burn.
  P('landerPod', prism(0.08, 0.11, 0.14, 5), { x: -0.3, y: 0.6, z: 0.3, mat: SHARED_MATS.lunarRock });
  P('landerPod', prism(0.08, 0.11, 0.14, 5), { x: 0.3, y: 0.6, z: 0.3, mat: SHARED_MATS.lunarRock });
  eyes(P, { y: 0.82, x: 0.15, z: -0.28, r: 0.7, mat: e.eyeMat });
}

export function aiLander(e, a) {
  // THE BURN outranks everything: a committed sideways dash with the pods lit
  // and the dish tucked, over in half a second - it exists to make "walk at
  // it in a straight line" fail every few seconds.
  if (e.burnT > 0) {
    e.burnT -= a.dt;
    e.stepMul = LANDER_BURN_MUL;
    a.vx = -a.pz * e.strafe * a.sp * LANDER_BURN_MUL;
    a.vz = a.px * e.strafe * a.sp * LANDER_BURN_MUL;
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-a.vx || -a.px, -a.vz || -a.pz);
    if (e.landerDish) e.landerDish.rotation.x = -1.1;
    e.burnFxT = (e.burnFxT || 0) - a.dt;
    if (e.burnFxT <= 0) {
      e.burnFxT = 0.07;
      _lunAt.set(
        e.pos.x + a.pz * e.strafe * 0.5,
        0.5,
        e.pos.z - a.px * e.strafe * 0.5
      );
      a.ctx.effects.burst(_lunAt, LUNAR_MOON, 5, 2, 2.2, 0.35);
    }
    if (e.burnT <= 0) {
      e.stepMul = 1.4;
      if (e.landerDish) e.landerDish.rotation.x = -2.0;
      // The burn spends the next volley's fuse - it is running, not shooting.
      e.attackCd = Math.max(e.attackCd, 0.5);
    }
    return;
  }
  orbit(e, a, ENEMY_TYPES.lander.orbit);
  e.stepMul = 1.4;
  e.burnCd = (e.burnCd === undefined ? 2.5 : e.burnCd) - a.dt;
  if (e.burnCd <= 0 && a.dist < LANDER_BURN_R) {
    e.burnCd = LANDER_BURN_CD;
    e.burnT = LANDER_BURN_T;
    e.strafe *= -1;   // burn out the way it is not already drifting
    return;
  }
  // THE PAIR. Two pulses a breath apart, angled a whisker apart - a lander's
  // round is never alone, which is what makes strafing THROUGH the volley a
  // different question from strafing past one.
  if (e.lunN > 0) {
    e.lunT -= a.dt;
    if (e.lunT > 0) return;
    e.lunT = LANDER_GAP;
    e.lunN--;
    a.ctx.addProjectile(
      e.pos.x, 1.1 * e.scale, e.pos.z, 'lander', e._projScale(),
      (e.lunN === 0 ? 1 : -1) * 0.05
    );
    if (e.lunN <= 0) e._setEyeAlert(false);
    return;
  }
  if (e.attackCd > 0 || a.dist > LANDER_RANGE) return;
  e.attackCd = LANDER_CD + Math.random() * 0.6;
  e.lunN = 2;
  e.lunT = 0;
  e.flash = 0.12;
  e._setEyeAlert(true);
}

// ============================================================================
// CRATERBACK - the brute. A basalt hulk wearing the crater it was dug out of:
// the flared bowl sits on its shoulders with moonlight pooled in it, and its
// answer to being crowded is THE MOONQUAKE - a slam that takes the floor from
// under the player rather than asking the fists to find them. Up, not back:
// in this block's thin air the launch is the attack.
// ============================================================================

export const CRATER_POP_R = 3.7;
export const CRATER_LAUNCH = 6.4;
export const CRATER_SHOVE = 2.6;

export function buildCraterback(e, g, s) {
  const P = partsFor(e, g, s);
  // Wide, planted, top-heavy - the soaker silhouette, with the mass high.
  P('craterGut', lump(0.5), { y: 0.78, sx: 1.35, sy: 1.1, sz: 1.2 });
  // THE BOWL. A shallow flared crater across the shoulders, with the dust in
  // it GLOWING - the one lit part of the body and the thing that survives a
  // status tint to say which theme this brute belongs to.
  P('craterBowl', prism(0.66, 0.42, 0.34, 7), { y: 1.32 });
  P('craterPool', lump(0.34), { y: 1.42, sy: 0.45, mat: SHARED_MATS.lunarGlow, shadow: false });
  // ...and the same light LEAKING down the chest - the bowl is hidden from a
  // player standing in front of it, and the theme's lit part has to read
  // from the direction it is fought from.
  P('craterSeam', slab(0.07, 0.55, 0.06), { y: 0.95, z: -0.52, mat: SHARED_MATS.lunarGlow, shadow: false });
  P('craterSeam2', slab(0.3, 0.07, 0.06), { y: 0.72, z: -0.56, mat: SHARED_MATS.lunarGlow, shadow: false });
  // Rubble heaped on the rim.
  P('craterRim', lump(0.14), { x: -0.5, y: 1.48, z: 0.1 });
  P('craterRim', lump(0.12), { x: 0.52, y: 1.46, z: -0.08 });
  P('craterRim', lump(0.11), { x: 0.1, y: 1.5, z: 0.5 });
  // Arms built to end in boulders.
  P('craterArm', slab(0.18, 0.6, 0.22), { x: -0.62, y: 0.82, rz: 0.1 });
  P('craterArm', slab(0.18, 0.6, 0.22), { x: 0.62, y: 0.82, rz: -0.1 });
  P('craterFist', lump(0.24), { x: -0.66, y: 0.34 });
  P('craterFist', lump(0.24), { x: 0.66, y: 0.34 });
  // Thick splayed legs under the weight.
  P('craterLeg', slab(0.24, 0.4, 0.28), { x: -0.3, y: 0.2, rz: 0.08 });
  P('craterLeg', slab(0.24, 0.4, 0.28), { x: 0.3, y: 0.2, rz: -0.08 });
  // Head sunk low and forward, the brute's read.
  P('craterHead', prism(0.15, 0.2, 0.24, 5), { y: 1.08, z: -0.48, rx: -0.4 });
  eyes(P, { y: 1.08, x: 0.09, z: -0.6, r: 0.8, mat: e.eyeMat });
}

export function aiCraterback(e, a) {
  const wasWinding = e.windup > 0;
  aiMelee(e, a);
  // The slam lands where the THROW of the swing lands, not the fists: the
  // edge is windup -> swing, so the floor answers on the same frame the blow
  // becomes live, and standing in the ring is what the windup warned about.
  if (wasWinding && e.windup <= 0 && e.swing > 0) {
    _lunAt.set(e.pos.x, 0.3, e.pos.z);
    a.ctx.effects.shockwave(_lunAt, ENEMY_TYPES.craterback.eye, CRATER_POP_R, 0.5);
    // Dust thrown outward and falling slow - in lunar air, it hangs.
    a.ctx.effects.burst(_lunAt, 0x9aa3c8, 16, 4, -0.5, 0.8);
    a.ctx.effects.addShake(0.18);
    const p = a.ctx.player;
    if (a.dist < CRATER_POP_R && Math.abs(p.pos.y - e.pos.y) < 1.8) {
      p.vel.y = Math.max(p.vel.y, CRATER_LAUNCH);
      // And a hand's worth of shove, so the arc carries somewhere.
      a.ctx.pullPlayer(p.pos.x - e.pos.x, p.pos.z - e.pos.z, CRATER_SHOVE);
    }
  }
}

// ============================================================================
// METEORBELL - the artillery. A standing stone and a hanging bell of dark
// iron; it tolls, and the sky answers three times on staggered fuses at the
// place the player just was. The bell itself never fires a round - what it
// calls down is the whole enemy.
// ============================================================================

export const BELL_RANGE = 21;
export const BELL_CD = 4.2;
export const BELL_TELL = 0.6;
export const BELL_ROCKS = 3;
export const BELL_STAGGER = 0.36;
export const BELL_RADIUS = 1.9;
export const BELL_DELAY = 1.0;
export const BELL_CAP = 24;
export const BELL_SPREAD = 1.7;
// The triad's shape, in the firing frame: one on the spot, one along the
// approach, one across it - so neither standing nor a straight retreat nor a
// flat sidestep clears all three.
const BELL_ALONG = [0, BELL_SPREAD, -BELL_SPREAD];
const BELL_ACROSS = [0, BELL_SPREAD * 0.5, -BELL_SPREAD * 0.6];

export function buildMeteorbell(e, g, s) {
  const P = partsFor(e, g, s);
  // A scatter of base stones it stands in.
  P('bellStone', lump(0.16), { x: -0.4, y: 0.1, z: 0.2 });
  P('bellStone', lump(0.12), { x: 0.42, y: 0.08, z: -0.14 });
  P('bellStone', lump(0.1), { x: 0.1, y: 0.06, z: 0.42 });
  // THE FRAME - two legs raked into a tall arch, and a back strut. Tall on
  // purpose: a bell must hang in the AIR, and at arena range the silhouette
  // has to clear a moonhare's.
  P('bellLeg', slab(0.15, 1.6, 0.17), { x: -0.42, y: 0.84, rz: 0.26 });
  P('bellLeg', slab(0.15, 1.6, 0.17), { x: 0.42, y: 0.84, rz: -0.26 });
  P('bellStrut', slab(0.11, 1.3, 0.13), { y: 0.7, z: 0.4, rx: 0.45 });
  P('bellBeam', slab(0.9, 0.11, 0.15), { y: 1.62 });
  // THE BELL itself, dark iron under the beam and wide as the arch allows,
  // and the clapper that GLOWS as the toll comes - the tell lives there,
  // not in any eye.
  e.bell = P('meteorBell', prism(0.2, 0.38, 0.5, 7), { y: 1.22, mat: SHARED_MATS.lunarRock });
  e.bellClapper = P('bellClapper', shard(0.12), {
    y: 0.96, mat: SHARED_MATS.lunarGlow, shadow: false,
  });
  // The signal star over the frame - small, and it is what flashes alert.
  P('bellStar', shard(0.11), { y: 1.58, mat: e.eyeMat, shadow: false });
  eyes(P, { y: 0.5, x: 0.12, z: -0.34, r: 0.65, mat: e.eyeMat });
}

export function aiMeteorbell(e, a) {
  orbit(e, a, ENEMY_TYPES.meteorbell.orbit);
  if (e.bellT > 0) {
    // Ringing up: rooted, swinging, clapper swelling with light.
    a.vx = 0;
    a.vz = 0;
    e.bellT -= a.dt;
    const fill = 1 - Math.max(0, e.bellT) / BELL_TELL;
    if (e.bell) e.bell.rotation.z = Math.sin(fill * 9) * 0.35;
    if (e.bellClapper) e.bellClapper.scale.setScalar(e.scale * (1 + fill * 1.2));
    if (e.bellT > 0) return;
    // THE ANSWER. Led ONCE at the toll and committed - the dodge is having
    // moved by the time the sky arrives, three strokes straddling the line
    // it would have happened on.
    snapAim(e, a);
    for (let i = 0; i < BELL_ROCKS; i++) {
      const x = e.tx + e.nx * BELL_ALONG[i] + -e.nz * BELL_ACROSS[i];
      const z = e.tz + e.nz * BELL_ALONG[i] + e.nx * BELL_ACROSS[i];
      addWarnedMortar(
        a.ctx, x, z, BELL_RADIUS, BELL_DELAY + i * BELL_STAGGER,
        Math.min(BELL_CAP, e.damage * 1.1)
      );
    }
    // The toll is SILENT - a bell with no air to ring through. The clapper's
    // flare and the three circles it draws are the whole voice it has.
    _lunAt.set(e.pos.x, 1.2 * e.scale, e.pos.z);
    a.ctx.effects.burst(_lunAt, LUNAR_MOON, 12, 3, 2.5, 0.5);
    if (e.bell) e.bell.rotation.z = 0;
    if (e.bellClapper) e.bellClapper.scale.setScalar(e.scale);
    e._setEyeAlert(false);
    return;
  }
  if (e.attackCd > 0 || a.dist > BELL_RANGE) return;
  e.attackCd = BELL_CD + Math.random() * 0.8;
  e.bellT = BELL_TELL;
  e.flash = 0.12;
  e._setEyeAlert(true);
}

// ============================================================================
// TIDECALLER - the support. A drifting obelisk with a crescent of moonlight
// hung in its top. It never attacks; it RINGS THE TIDE IN - every ally in the
// ring is carried toward the player on one lurch, the whole wave arriving
// early at a stroke. The answer is the answer to every support: find it and
// kill it first.
// ============================================================================

export const TIDE_INTERVAL = 6.0;
export const TIDE_RANGE = 9.5;
export const TIDE_SHOVE = 2.1;      // metres of lurch...
export const TIDE_SHOVE_T = 0.4;    // ...over this long, so it reads as dragged

export function buildTidecaller(e, g, s) {
  const P = partsFor(e, g, s);
  // A legless tapering obelisk, floated just off the floor - the support
  // silhouette, and the hover is its own kind of lunar.
  P('tideBody', prism(0.24, 0.38, 1.2, 5), { y: 1.0 });
  // The seam of light down the front.
  P('tideSeam', slab(0.05, 0.7, 0.05), { y: 1.0, z: -0.3, mat: SHARED_MATS.lunarGlow, shadow: false });
  // A ripple of darker stone girdling the drift line.
  P('tideGirdle', prism(0.48, 0.42, 0.12, 8), { y: 0.52, mat: SHARED_MATS.lunarRock });
  // THE CRESCENT, cradled horns-up in the top - the tide's own sign.
  e.tideCrescent = P('tideCrescent', () => new THREE.TorusGeometry(0.32, 0.055, 5, 12, 4.2), {
    y: 1.78, rz: Math.PI / 2 + (Math.PI - 4.2) / 2, mat: SHARED_MATS.lunarGlow, shadow: false,
  });
  // Loose shards hanging under the drift line.
  for (let i = 0; i < 3; i++) {
    const a2 = (i / 3) * Math.PI * 2 + 0.5;
    P('tideShard', shard(0.07), {
      x: Math.cos(a2) * 0.42, y: 0.34, z: Math.sin(a2) * 0.42, mat: SHARED_MATS.lunarRock,
    });
  }
  eyes(P, { y: 1.3, x: 0.1, z: -0.26, r: 0.7, mat: e.eyeMat });
}

export function aiTidecaller(e, a) {
  orbit(e, a, ENEMY_TYPES.tidecaller.orbit);
  if (e.tideCrescent) e.tideCrescent.rotation.y += a.dt * 0.8;
  e.tideCd = (e.tideCd === undefined ? 2.5 : e.tideCd) - a.dt;
  const ready = e.tideCd <= 0;
  // The crescent swells as the tide comes in - the cooldown, worn openly.
  if (e.tideCrescent) {
    e.tideCrescent.scale.setScalar(
      e.scale * (ready ? 1.35 : 0.95 + 0.4 * (1 - Math.max(0, e.tideCd) / TIDE_INTERVAL))
    );
  }
  e._setEyeAlert(ready);
  if (!ready) return;
  e.tideCd = TIDE_INTERVAL;
  _lunAt.set(e.pos.x, 0.4, e.pos.z);
  a.ctx.effects.shockwave(_lunAt, ENEMY_TYPES.tidecaller.eye, TIDE_RANGE, 0.6);
  // ONE LURCH for everybody in the ring, all of it toward the player - a
  // knock, refused by the genuinely heavy, so the room visibly slides and
  // the wave that was at the edge of the room is on the player's doorstep.
  const p = a.ctx.player.pos;
  let n = 0;
  for (const o of a.ctx.enemies) {
    if (o === e || o.dead || o.boss || o.type === 'tidecaller') continue;
    const ox = o.pos.x - e.pos.x;
    const oz = o.pos.z - e.pos.z;
    if (ox * ox + oz * oz > TIDE_RANGE * TIDE_RANGE) continue;
    o.knock(p.x - o.pos.x, p.z - o.pos.z, TIDE_SHOVE, TIDE_SHOVE_T);
    if (a.ctx.effects && n < 6) a.ctx.effects.beam(e.pos, o.pos, LUNAR_MOON);
    n++;
  }
}

// ============================================================================
// MOONMOTH - the flier. A fat pale powder-moth drawn down out of its orbit on
// a committed line, bouncing off the deck THREE times like a skipped stone -
// each touchdown is its own small strike and its own puff of moondust, and
// the slow climb back up afterwards is the shot the fight pays for.
// ============================================================================

export const MOTH_HIGH = 4.3;
export const MOTH_WINDUP = 0.65;
export const MOTH_SKIPS = 3;
export const MOTH_STRIDE = 4;     // the even spacing between touchdowns, metres
export const MOTH_MUL = 2.7;      // stepMul and speed multiple during the run
export const MOTH_TOUCH_R = 1.8;
export const MOTH_CD = 4.2;

export function buildMoonmoth(e, g, s) {
  const P = partsFor(e, g, s);
  // A plump grub of a body along the axis of travel.
  P('mothBody', lump(0.2), { sz: 1.5, sy: 0.85 });
  P('mothHead', lump(0.11), { y: 0.04, z: -0.3 });
  // Feathery antennae reaching forward.
  P('mothAnt', spike(0.03, 0.3, 4), { x: -0.08, y: 0.14, z: -0.32, rx: -1.2, rz: 0.4 });
  P('mothAnt', spike(0.03, 0.3, 4), { x: 0.08, y: 0.14, z: -0.32, rx: -1.2, rz: -0.4 });
  // THE WINGS - two broad clipped blades, most of the silhouette from below,
  // which is where this enemy is read from. They are kept for the flap.
  e.mothWingL = P('mothWing', slab(0.62, 0.045, 0.4), { x: -0.42, y: 0.03, z: 0.04, ry: 0.22, rz: 0.16 });
  e.mothWingR = P('mothWing', slab(0.62, 0.045, 0.4), { x: 0.42, y: 0.03, z: 0.04, ry: -0.22, rz: -0.16 });
  // Dust on the wingtips - the powder the skips shed.
  P('mothDust', shard(0.05), { x: -0.62, y: 0.06, z: 0.12, mat: SHARED_MATS.lunarGlow, shadow: false });
  P('mothDust', shard(0.05), { x: 0.62, y: 0.06, z: 0.12, mat: SHARED_MATS.lunarGlow, shadow: false });
  eyes(P, { y: 0.08, x: 0.07, z: -0.34, r: 0.8, mat: e.eyeMat });
}

export function aiMoonmoth(e, a) {
  if (e.mothState === undefined) {
    e.mothState = 'circle';
    e.mothT = 1 + Math.random() * 1.4;
    e.mothPhase = 0;
  }
  // The wings never fully stop - faint at the circle, a blur in the dive.
  const dive = e.mothState === 'skip';
  const flap = Math.sin(a.ctx.time * (dive ? 30 : 9)) * (dive ? 0.5 : 0.22);
  if (e.mothWingL) e.mothWingL.rotation.z = 0.16 + flap;
  if (e.mothWingR) e.mothWingR.rotation.z = -0.16 - flap;

  if (e.mothState === 'circle') {
    orbit(e, a, ENEMY_TYPES.moonmoth.orbit);
    e.hoverY = MOTH_HIGH;
    e.flyRate = 4;
    e.mothT -= a.dt;
    if (e.mothT <= 0 && a.dist < 15) {
      e.mothState = 'tell';
      e.mothT = MOTH_WINDUP;
      e._setEyeAlert(true);
    }
    return;
  }

  if (e.mothState === 'tell') {
    // Rises and drifts in, wings spread - the same "everything else comes
    // DOWN the screen, this is going UP" read the shrike's windup trades on.
    e.hoverY = MOTH_HIGH + 0.8;
    e.flyRate = 5;
    a.vx = a.nx * a.sp * 0.4;
    a.vz = a.nz * a.sp * 0.4;
    if (e.mothWingL) { e.mothWingL.rotation.z = 0.75; e.mothWingR.rotation.z = -0.75; }
    e.mothT -= a.dt;
    if (e.mothT > 0) return;
    snapAim(e, a, true);
    e.mothHx = Math.cos(e.aim);
    e.mothHz = Math.sin(e.aim);
    e.mothState = 'skip';
    // THE TOUCHDOWNS ARE PLACES, NOT A METRONOME. The middle skip lands on
    // the captured point and its sisters fall an even stride either side of
    // it, so the lane the player heard about at the tell is the lane the
    // strikes actually walk down.
    e.mothX0 = e.pos.x;
    e.mothZ0 = e.pos.z;
    e.mothTouch = [a.dist - MOTH_STRIDE, a.dist, a.dist + MOTH_STRIDE];
    // The clock is a safety net, not the scheduler: the run is over when its
    // last touchdown is behind it.
    e.mothT = (e.mothTouch[2] + 2) / (a.sp * MOTH_MUL) + 0.3;
    e.mothPhase = 0;
    _blinkAt.set(e.tx, 0.06, e.tz);
    a.ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.moonmoth.eye, 2.2, 0.5);
    return;
  }

  if (e.mothState === 'skip') {
    // COMMITTED. The heading was written at the end of the tell and it does
    // not steer - what the player is being asked to read is a lane, and the
    // three touchdowns are where it is being collected.
    e.stepMul = MOTH_MUL;
    a.vx = e.mothHx * a.sp * MOTH_MUL;
    a.vz = e.mothHz * a.sp * MOTH_MUL;
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-e.mothHx, -e.mothHz);
    e.flyRate = 9;
    const gone = (e.pos.x - e.mothX0) * e.mothHx + (e.pos.z - e.mothZ0) * e.mothHz;
    // A tent of altitude per stride: down to the deck at each touchdown, back
    // up between them - the floor coming up to meet it, three times.
    const k = Math.min(e.mothPhase, MOTH_SKIPS - 1);
    const segMid = e.mothTouch[k];
    e.hoverY = 0.3 + Math.min(1.6, Math.abs(gone - segMid) * 1.0);
    if (e.mothPhase < MOTH_SKIPS && gone >= e.mothTouch[e.mothPhase]) {
      e.mothPhase++;
      _lunAt.set(e.pos.x, 0.15, e.pos.z);
      a.ctx.effects.shockwave(_lunAt, ENEMY_TYPES.moonmoth.eye, MOTH_TOUCH_R, 0.35);
      a.ctx.effects.burst(_lunAt, LUNAR_MOON, 10, 2.5, 1.5, 0.55);
      a.ctx.effects.addShake(0.08);
      // MELEE_REACH_Y, not a tighter band: the trough is a target the
      // altitude chases, and on a loaded frame the body can still be a
      // metre up when the edge fires - a dive that visibly BRUSHED the
      // player and then did nothing is the game lying about contact. The
      // shrike's dive uses the same reach for the same reason.
      if (contactReach(e, a, MOTH_TOUCH_R, 2.4, 2.4)) landHit(e, a.ctx);
    }
    if (gone < e.mothTouch[MOTH_SKIPS - 1] + 1.5 && e.mothT > 0) {
      e.mothT -= a.dt;
      return;
    }
    e.mothState = 'climb';
    e.mothT = 1.3;
    return;
  }

  // CLIMB - slow, straight and away, and it has nothing to say for itself:
  // the shot the player was owed.
  e.stepMul = 1.4;
  e.hoverY = MOTH_HIGH;
  e.flyRate = 2.2;
  a.vx = -a.nx * a.sp * 0.5;
  a.vz = -a.nz * a.sp * 0.5;
  e.mothT -= a.dt;
  if (e.mothT <= 0) {
    e.mothState = 'circle';
    e.mothT = MOTH_CD * (0.8 + Math.random() * 0.4);
    e._setEyeAlert(false);
  }
}

// ============================================================================
// ECLIPSE - the boss. The moon itself, come down into the arena: a faceted
// rock sphere with its craters on, the dark shard of the umbra across its
// crown, a crescent grin of an eye, and the CORONA - a ring of pale feathers
// of light that never stops turning. Its whole fight is the theme's grammar
// at boss size: it leaps the way the hare leaps, calls the same sky down the
// way the bell does, and drags the room the way the tidecaller drags it -
// except where the tidecaller moves the crowd, the eclipse's tide moves YOU,
// and it ends in a ring you jump.
//
// THE FIVE THINGS IT DOES, and the answer each asks:
//
//   CORONA FAN   a flare of the corona, then two fans of seven crescent
//                rounds down a bearing captured at the wind-up, the second
//                volley offset a half-step so the two interleave. Be behind
//                something, or be moving.
//   METEOR SHOWER five rocks on warned circles, each led at the player's
//                CURRENT position at its own release - the bell's answer,
//                walked. Standing still is the one losing move.
//   MOONFALL     the leap: a mark lands where the player was standing and the
//                whole boss crosses the arena over two metres up, and the
//                landing throws the ring, the dust, and anyone caught in it
//                off the floor. Move across, early.
//   TIDE         it plants, and for two seconds the room slides toward it -
//                then the ring slams out to six metres and only pays if you
//                are ON the floor. In this block's air, jumping it is the
//                theme answering the theme.
//   TOUCH        the body charges for contact at all times, on its own clock.
//
// NO ARMOUR, NO WINDOW: the task says it takes full damage at all times, and
// the fight's texture is movement and timing rather than a shell to crack.
// ============================================================================

export const EC_FAN_CD = 3.6;
export const EC_FAN_TELL = 0.55;
export const EC_FAN_SHOTS = 7;
export const EC_FAN_HALF = 0.55;    // half the fan's wedge, radians
export const EC_FAN_GAP = 0.34;
export const EC_FAN_Y = 2.8;        // the height the crescents leave from

export const EC_RAIN_CD = 8;
export const EC_RAIN_MIN = 9;       // never cast at arm's length - the tide owns close
export const EC_RAIN_TELL = 0.6;
export const EC_RAIN_SHOTS = 5;
export const EC_RAIN_GAP = 0.24;
export const EC_RAIN_R = 1.9;
export const EC_RAIN_DELAY = 1.05;
export const EC_RAIN_CAP = 24;
export const EC_RAIN_SCATTER = 1.3;

export const EC_FALL_CD = 9.5;
export const EC_FALL_MIN = 6.5;     // never cast point-blank - the tide owns close
export const EC_FALL_TELL = 0.75;
export const EC_FALL_R = 4.2;
export const EC_FALL_CAP = 30;
export const EC_FALL_POP = 6.5;
export const EC_FALL_LIFT = 3.0;
// The fallback arc's ceiling - the fliers' own FLY_MAX_Y, because that is the
// game's existing answer to "how high does anything in this room go".
export const EC_FALL_LIFT_MAX = 6.5;

export const EC_TIDE_CD = 10;
export const EC_TIDE_MAX = 5.4;     // cast only once the player is inside reach
export const EC_TIDE_R = 6.0;
export const EC_TIDE_TIME = 1.9;
export const EC_TIDE_PULL = 2.4;
export const EC_TIDE_CAP = 26;

export function buildEclipse(e, g, s) {
  const P = partsFor(e, g, s);
  // THE MOON. One big faceted sphere; the facets ARE the cratering.
  e.coreMesh = P('eclipseMoon', rock(0.95), { y: 1.5 });
  // Craters in the family's dark basalt, pressed into the near side so a
  // player reading the body from the front sees the scars, not the far side.
  const craters = [
    [0.5, 0.55, -0.62, 0.16], [-0.62, 0.28, -0.45, 0.13], [0.05, 0.8, -0.5, 0.12],
    [-0.35, -0.55, -0.65, 0.15], [0.7, -0.3, -0.3, 0.12], [-0.15, -0.75, -0.3, 0.1],
  ];
  for (const [cx, cy, cz, cr] of craters) {
    P('eclipseCrater', lump(cr), {
      x: cx * 0.92, y: 1.5 + cy * 0.92, z: cz * 0.92, sy: 0.5,
      mat: SHARED_MATS.lunarRock,
    });
  }
  // THE UMBRA. The dark occluder slung across the crown - the one near-black
  // thing in the theme, and it reads as a bite out of the disc from anywhere.
  P('eclipseUmbra', shard(0.6), { y: 2.0, sy: 0.55, mat: SHARED_MATS.howlerMaw });
  // THE GRIN - the crescent of lit eye, squashed thin, set into the face.
  P('eclipseGrin', shard(0.36), {
    y: 1.32, z: -0.84, sx: 1.55, sy: 0.24, sz: 0.45, mat: e.eyeMat, shadow: false,
  });
  // THE CORONA. A ring of pale feathers of light, held clear of the sphere
  // and spinning forever - the boss's tell lives in how FAST it is turning.
  e.coronaG = new THREE.Group();
  e.coronaG.position.set(0, 1.5 * s, 0);
  for (let i = 0; i < 14; i++) {
    const an = (i / 14) * Math.PI * 2;
    const m = new THREE.Mesh(geo('eclipseCorona', spike(0.09, 0.55, 4)), SHARED_MATS.lunarGlow);
    m.position.set(Math.cos(an) * 1.38 * s, Math.sin(an) * 1.38 * s, 0);
    m.rotation.z = an - Math.PI / 2;
    m.scale.setScalar(s);
    m.castShadow = false;
    e.coronaG.add(m);
  }
  g.add(e.coronaG);
  // The debris skirt it is resting in - it landed, and the floor remembers.
  for (let i = 0; i < 8; i++) {
    const an = (i / 8) * Math.PI * 2 + 0.3;
    P('eclipseBase', shard(0.16 + (i % 3) * 0.04), {
      x: Math.cos(an) * 1.0, y: 0.4 + (i % 2) * 0.14, z: Math.sin(an) * 1.0,
      mat: SHARED_MATS.lunarRock,
    });
  }
}

function eclipsePose(e) {
  const bs = e.bs;
  const b = bs.baseScale || 1;
  e.group.scale.set(b, b, b);
  e.group.rotation.x = 0;
}

// Interrupted - feared, or re-flowed by a test. Every telegraph the boss can
// be holding lives in bs.mark with bs.fx, which is the shape releaseMarks()
// releases; the pose goes back with it. Death calls the same path, because
// Enemy.release() runs the type's own cleanup - see the entry below.
function cleanupEclipse(e) {
  releaseMarks(e);
}

function eclipseAbort(e) {
  releaseMarks(e);
  eclipsePose(e);
  e._setEyeAlert(false);
  e.stepMul = 1.4;
}

function eclipseCastFan(e, a) {
  const bs = e.bs;
  bs.state = 'fanTell';
  bs.t = bs.tMax = EC_FAN_TELL;
  snapAim(e, a, true);
  faceSnap(e);
  bs.spinFast = true;
}

function eclipseFireFan(e, a) {
  const bs = e.bs;
  // Two volleys whose teeth interleave: the second is offset half a tooth.
  const bias = (bs.fanVolley % 2) * (EC_FAN_HALF / EC_FAN_SHOTS);
  for (let i = 0; i < EC_FAN_SHOTS; i++) {
    const off = -EC_FAN_HALF + (i / (EC_FAN_SHOTS - 1)) * EC_FAN_HALF * 2 + bias;
    capturedShot(e, a, e.aim, off, EC_FAN_Y);
  }
  _bossAt.set(e.pos.x, EC_FAN_Y, e.pos.z);
  a.ctx.effects.burst(_bossAt, ENEMY_TYPES.eclipse.eye, 14, 5, 1.5, 0.4);
}

function eclipseCastRain(e, a) {
  const bs = e.bs;
  bs.state = 'rainTell';
  bs.t = bs.tMax = EC_RAIN_TELL;
  e._setEyeAlert(true);
}

function eclipseCastFall(e, a) {
  const bs = e.bs;
  bs.state = 'fallTell';
  bs.t = bs.tMax = EC_FALL_TELL;
  snapAim(e, a);
  faceSnap(e);
  // The landing is clamped inside the walls before it is ever marked - a
  // warning drawn outside the arena is a lie about where is safe.
  bs.landX = Math.max(-19, Math.min(19, e.tx));
  bs.landZ = Math.max(-19, Math.min(19, e.tz));
  bs.fx = a.ctx.effects;
  if (!(bs.mark >= 0)) bs.mark = a.ctx.effects.markAcquire();
  e._setEyeAlert(true);
}

function eclipseFallLand(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  releaseMarks(e);
  _bossAt.set(e.pos.x, 0.35, e.pos.z);
  ctx.effects.shockwave(_bossAt, ENEMY_TYPES.eclipse.color, EC_FALL_R, 0.6);
  // The moondust jumps first and falls slowly - in this air, it hangs.
  for (let i = 0; i < 6; i++) {
    const an = (i / 6) * Math.PI * 2;
    _bossAt.set(e.pos.x + Math.cos(an) * EC_FALL_R * 0.55, 0.3, e.pos.z + Math.sin(an) * EC_FALL_R * 0.55);
    ctx.effects.burst(_bossAt, 0x9aa3c8, 8, 3, 2.2, 0.9);
  }
  ctx.effects.addShake(0.3);
  // No impact bark here either - the leap is the theme's most repeated
  // gesture, and the room's shake plus the dust are what it sounds like.
  const p = ctx.player.pos;
  if (contactReach(e, a, EC_FALL_R + 0.4)) {
    ctx.onHitPlayer(
      Math.min(EC_FALL_CAP, e.damage * 1.35 * (1 - 0.35 * a.dist / EC_FALL_R)), e.pos, e
    );
    // And the landing THROWS you - the craterback's lesson at boss size.
    if (p.y < 0.7) {
      ctx.player.vel.y = Math.max(ctx.player.vel.y, EC_FALL_POP);
      ctx.pullPlayer(p.x - e.pos.x, p.z - e.pos.z, 2.6);
    }
  }
  bs.state = 'recover';
  bs.t = bs.tMax = 0.9 * e.rate;
  bs.cdFall = EC_FALL_CD * e.rate;
  e._setEyeAlert(false);
}

function eclipseCastTide(e, a) {
  const bs = e.bs;
  bs.state = 'tide';
  bs.t = bs.tMax = EC_TIDE_TIME;
  bs.fx = a.ctx.effects;
  if (!(bs.mark >= 0)) bs.mark = a.ctx.effects.markAcquire();
  e._setEyeAlert(true);
}

export function aiEclipse(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'prowl';
    bs.t = bs.tMax = 0.6;
    bs.mark = -1;
    bs.fx = null;
    bs.cdFan = 1.8;
    bs.cdRain = 4.5;
    bs.cdFall = 6.5;
    bs.cdTide = 8;
    bs.fanVolley = 0;
    bs.fanT = 0;
    bs.rainN = 0;
    bs.rainT = 0;
    bs.spinFast = false;
    bs.baseScale = e.group.scale.x;
  }

  const dt = a.dt;
  e.stepMul = 1.4;
  eclipsePose(e);
  // The corona never stops; how fast it is turning IS the fight's read.
  if (e.coronaG) {
    e.coronaG.rotation.z += dt * (bs.state === 'tide' ? 3.6 : bs.spinFast ? 2.4 : 0.5);
  }
  if (e.coreMesh) e.coreMesh.rotation.y += dt * 0.45;

  // Feared: the stagger rule - hold position, drop whatever was being told.
  if (e.status.fear > 0) {
    eclipseAbort(e);
    bs.state = 'recover';
    bs.t = bs.tMax = 0.4;
    a.vx = 0;
    a.vz = 0;
    bossTouch(e, a);
    return;
  }

  // The body itself, on its own clock, in every state.
  bossTouch(e, a);

  bs.cdFan -= dt;
  bs.cdRain -= dt;
  bs.cdFall -= dt;
  bs.cdTide -= dt;
  bs.t -= dt;

  if (bs.state === 'prowl') {
    // Holds a ring and weaves - the quiet state still closes.
    const want = 6.2;
    e.strafeT -= dt;
    if (e.strafeT <= 0) {
      e.strafe *= -1;
      e.strafeT = 1 + Math.random() * 1.6;
    }
    const along = a.dist > want + 1 ? 1 : a.dist < want - 1 ? -0.5 : 0.1;
    a.vx = a.px * a.sp * along + -a.pz * e.strafe * a.sp * 0.45;
    a.vz = a.pz * a.sp * along + a.px * e.strafe * a.sp * 0.45;
    if (bs.t > 0) return;
    // The picker, most-local question first.
    if (a.dist < EC_TIDE_MAX && bs.cdTide <= 0) { eclipseCastTide(e, a); return; }
    if (a.dist >= EC_FALL_MIN && bs.cdFall <= 0) { eclipseCastFall(e, a); return; }
    if (a.dist >= EC_RAIN_MIN && bs.cdRain <= 0) { eclipseCastRain(e, a); return; }
    if (bs.cdFan <= 0 && a.dist < 22) { eclipseCastFan(e, a); return; }
    bs.t = 0.3 * e.rate + Math.random() * 0.2;
    return;
  }

  if (bs.state === 'fanTell') {
    a.vx = 0;
    a.vz = 0;
    faceSnap(e);
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    const b = bs.baseScale || 1;
    e.group.scale.set(b * (1 + fill * 0.08), b * (1 + fill * 0.08), b * (1 + fill * 0.08));
    if (bs.t > 0) return;
    bs.state = 'fan';
    bs.fanVolley = 2;
    bs.fanT = 0;
    return;
  }

  if (bs.state === 'fan') {
    a.vx = 0;
    a.vz = 0;
    bs.fanT -= dt;
    if (bs.fanT > 0) return;
    eclipseFireFan(e, a);
    bs.fanVolley--;
    if (bs.fanVolley > 0) { bs.fanT = EC_FAN_GAP; return; }
    bs.spinFast = false;
    bs.state = 'recover';
    bs.t = bs.tMax = 0.55 * e.rate;
    bs.cdFan = EC_FAN_CD * e.rate + Math.random() * 0.8;
    e._setEyeAlert(false);
    return;
  }

  if (bs.state === 'rainTell') {
    // It keeps drifting in at a fifth speed - the shower is not a stop.
    a.vx = a.px * a.sp * 0.2;
    a.vz = a.pz * a.sp * 0.2;
    e.group.rotation.x = 0.2 * (1 - Math.max(0, bs.t) / bs.tMax);
    if (bs.t > 0) return;
    bs.state = 'rain';
    bs.rainN = EC_RAIN_SHOTS;
    bs.rainT = 0;
    return;
  }

  if (bs.state === 'rain') {
    a.vx = a.px * a.sp * 0.2;
    a.vz = a.pz * a.sp * 0.2;
    bs.rainT -= dt;
    if (bs.rainT > 0) return;
    if (bs.rainN <= 0) {
      bs.state = 'recover';
      bs.t = bs.tMax = 0.5 * e.rate;
      bs.cdRain = EC_RAIN_CD * e.rate;
      e._setEyeAlert(false);
      return;
    }
    bs.rainT = EC_RAIN_GAP;
    bs.rainN--;
    // Each rock is led at the player's CURRENT position at its own release:
    // the volley walks across where you were about to keep going.
    const p = ctx.player.pos;
    addWarnedMortar(
      ctx,
      p.x + (Math.random() - 0.5) * EC_RAIN_SCATTER * 2,
      p.z + (Math.random() - 0.5) * EC_RAIN_SCATTER * 2,
      EC_RAIN_R, EC_RAIN_DELAY, Math.min(EC_RAIN_CAP, e.damage * 1.2)
    );
    return;
  }

  if (bs.state === 'fallTell') {
    a.vx = 0;
    a.vz = 0;
    faceSnap(e);
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    const b = bs.baseScale || 1;
    e.group.scale.set(b * (1 + fill * 0.1), b * (1 - fill * 0.16), b * (1 + fill * 0.1));
    bs.fx.markSet(bs.mark, bs.landX, bs.landZ, EC_FALL_R, ENEMY_TYPES.eclipse.color, fill, 1, 0, 0.6);
    if (bs.t > 0) return;
    // THE LEAP, DEGRADING GRACEFULLY. The arena is generated, and a crossing
    // that happens to pass through cover or under a catwalk is refused by
    // the same jumpClear that guards every arc in the game - a refused
    // warning is the mechanic working. What the boss does about it: try the
    // whole crossing, then the same crossing on a HIGHER arc - the moon does
    // not go around the skyline, it goes over it - and only then settle for
    // half the trip. Whichever try clears, THE MARK MOVES TO IT: a warning
    // left where the boss is not going to land would be the one thing a
    // telegraph may never be.
    const tries = [
      [bs.landX, bs.landZ, EC_FALL_LIFT],
      [bs.landX, bs.landZ, EC_FALL_LIFT_MAX],
      [(bs.landX + e.pos.x) / 2, (bs.landZ + e.pos.z) / 2, EC_FALL_LIFT],
    ];
    let leapt = false;
    for (const [tx, tz, lift] of tries) {
      const cx = Math.max(-19, Math.min(19, tx));
      const cz = Math.max(-19, Math.min(19, tz));
      if (!e._startJump(cx, 0, cz, lift, ctx)) continue;
      bs.landX = cx;
      bs.landZ = cz;
      leapt = true;
      break;
    }
    if (leapt) {
      // Redrawn once, full, at the spot that was actually cleared - and it
      // stays down through the flight, because the warning that mattered is
      // the ground, and the ground is where it is left.
      bs.fx.markSet(bs.mark, bs.landX, bs.landZ, EC_FALL_R, ENEMY_TYPES.eclipse.color, 1, 1, 0, 0.6);
      bs.state = 'fallAir';
      bs.spinFast = true;
      eclipsePose(e);
      return;
    }
    // Nothing clears from here - the mark comes back and the fight goes on.
    // A short cooldown rather than none: without it the very next think
    // re-marks the same refused line, and the player watches the same
    // warning appear and vanish until the boss happens to drift clear of
    // whatever the leap could not cross.
    releaseMarks(e);
    bs.state = 'recover';
    bs.t = bs.tMax = 0.4 * e.rate;
    bs.cdFall = 2.5 * e.rate;
    e._setEyeAlert(false);
    return;
  }

  if (bs.state === 'fallAir') {
    // update() runs the arc itself while it is in the air and hands back on
    // the landing - so falling out of jumpTime here IS the touch-down.
    eclipseFallLand(e, a);
    bs.spinFast = false;
    return;
  }

  if (bs.state === 'tide') {
    a.vx = 0;
    a.vz = 0;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    const b = bs.baseScale || 1;
    e.group.scale.set(b * 1.05, b * (1 - fill * 0.1), b * 1.05);
    bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, EC_TIDE_R, ENEMY_TYPES.eclipse.color, fill, 1, 0, 0.32);
    // THE DRAG. Capped where the well hazard is capped: running out of the
    // tide stays possible, standing still in it does not.
    ctx.pullPlayer(e.pos.x - ctx.player.pos.x, e.pos.z - ctx.player.pos.z, EC_TIDE_PULL);
    if (bs.t > 0) return;
    // THE SLAM. The ring pays only if your feet are on it - the block's own
    // thin air is the way out, and that is on purpose.
    releaseMarks(e);
    _bossAt.set(e.pos.x, 0.4, e.pos.z);
    ctx.effects.shockwave(_bossAt, ENEMY_TYPES.eclipse.eye, EC_TIDE_R, 0.55);
    ctx.effects.burst(_bossAt, LUNAR_MOON, 22, 6, 2, 0.6);
    ctx.effects.addShake(0.25);
    const p = ctx.player.pos;
    if (a.dist < EC_TIDE_R && p.y < 0.6 &&
        !segBlocked(e.pos.x, 0.5, e.pos.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
      ctx.onHitPlayer(
        Math.min(EC_TIDE_CAP, e.damage * 1.25 * (1 - 0.3 * a.dist / EC_TIDE_R)), e.pos, e
      );
    }
    bs.state = 'recover';
    bs.t = bs.tMax = 0.7 * e.rate;
    bs.cdTide = EC_TIDE_CD * e.rate;
    e._setEyeAlert(false);
    return;
  }

  // RECOVER - the pant after a commitment, still touchable, never safe long.
  a.vx = a.px * a.sp * 0.35;
  a.vz = a.pz * a.sp * 0.35;
  if (bs.t <= 0) {
    bs.state = 'prowl';
    bs.t = 0.25 + Math.random() * 0.35;
  }
}

// ============================================================================

const TYPES = {
  // The bounding rusher. It crosses ground in committed leaps rather than in
  // pursuit, so what it charges you for is DIRECTION - the crouch reads "the
  // arc is chosen", and the arc ends where you were standing at the crouch.
  moonhare: {
    head: { r: 0.28, y: 0.8 },
    hp: 34, speed: 3.1, damage: 9, value: 130, color: 0x9aa3c8, eye: 0xe8ecff,
    scale: 1.0, radius: 0.5, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildMoonhare, ai: aiMoonhare,
  },

  // The lunar module gone feral. A gunner that cannot be cornered: press it
  // and the thrusters light, and its rounds always arrive as a pair - so the
  // arc you picked to dodge one has a second round written across it.
  lander: {
    head: { r: 0.3, y: 1.16 },
    hp: 26, speed: 2.3, damage: 11, value: 270, color: 0x8b93ac, eye: 0xe8ecff,
    scale: 1.0, radius: 0.5, mass: 1,
    orbit: { dist: 12.5, band: 2.5, out: 0.7, in: -0.8, strafe: 0.5, flip: 1.6, flipVar: 1.4 },
    proj: {
      core: 0xeef1ff, glow: 0x9db4ff, scale: 0.55,
      speed: [19, 0.35, 26], dmg: [8, 0.35, 14],
    },
    build: buildLander, ai: aiLander,
  },

  // The basalt hulk with its bowl of moonlight. Its slam answers the ground,
  // not the player inside it: a moonquake that takes the floor from under you
  // and lets the thin air do the rest.
  craterback: {
    head: { r: 0.3, y: 1.08 },
    hp: 150, speed: 1.7, damage: 16, value: 310, color: 0x4a5168, eye: 0xcfd8ff,
    scale: 1.4, radius: 0.62, mass: 2,
    melee: { windup: 0.85, start: 2.6, hit: 3.2, cd: 2.2 },
    build: buildCraterback, ai: aiCraterback,
  },

  // The standing stone that tolls. It throws NOTHING itself - it rings, and
  // three stones fall on staggered fuses at the place the ring decided. Whole
  // enemy is in the cast; the body is only the address.
  meteorbell: {
    head: { r: 0.3, y: 1.4 },
    hp: 46, speed: 1.9, damage: 14, value: 270, color: 0x79819c, eye: 0xe8ecff,
    scale: 1.1, radius: 0.5, mass: 1,
    orbit: { dist: 14.5, band: 2.5, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildMeteorbell, ai: aiMeteorbell,
  },

  // The drifting obelisk with the crescent hung in it. No attack at all: it
  // rings, and the tide COMES IN - every ally in the ring arriving at your
  // feet on one lurch. The wave's own clock, sped up, is what it sells.
  tidecaller: {
    head: { r: 0.3, y: 1.3 },
    hp: 60, speed: 2.0, damage: 0, value: 340, color: 0x7d86b8, eye: 0xe8ecff,
    scale: 1.1, radius: 0.5, mass: 1,
    orbit: { dist: 11, band: 2.5, out: 0.7, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildTidecaller, ai: aiTidecaller,
  },

  // The powder-moth that skips. It reads the deck like flat water: one
  // committed low line, three touchdowns, each its own small strike in a puff
  // of moondust - and then the long slow climb that is your turn.
  moonmoth: {
    head: { r: 0.3, y: 0.08 },
    hp: 50, speed: 3.7, damage: 10, value: 300, color: 0xcfd4e8, eye: 0xb9c4ff,
    scale: 1.15, radius: 0.45, mass: 1,
    fly: { height: 4.3 },
    hitbox: { r: 0.6, y: 0.1 },
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.5, strafe: 0.55, flip: 2, flipVar: 1.5 },
    build: buildMoonmoth, ai: aiMoonmoth,
  },

  // The moon down in the arena. Same bar as every boss and NO ARMOUR: the
  // menace is that it moves the fight - lands on the place you picked, drags
  // the floor toward itself, and makes the block's own thin air into the only
  // way out of its ring.
  eclipse: {
    head: { r: 0.44, y: 2.1 },
    hp: 1500, speed: 3.1, damage: 18, value: 6500, color: 0x565e78, eye: 0xf2f4ff,
    scale: 2.15, radius: 1.3, mass: 5, boss: true,
    hitbox: { r: 1.0, y: 1.5 },
    statusMul: 0.35, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    proj: {
      core: 0xf2f4ff, glow: 0xb9c4ff, scale: 0.75,
      speed: [12, 0.22, 18], dmg: [8, 0.3, 15],
    },
    build: buildEclipse, ai: aiEclipse, cleanup: cleanupEclipse,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
