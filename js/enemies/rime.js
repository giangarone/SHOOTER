// RIME's six enemies and its boss.
//
// One file per theme, and it imports NOTHING from any other theme - see
// shared.js for why. What is here is this theme's stat blocks, its models, its
// behaviour and the constants only it uses; anything a second theme wanted is
// in shared.js by construction.
//
// The entries are registered into ENEMY_TYPES at the bottom rather than
// exported for someone else to assemble, so importing this file is what puts
// the theme in the game and index.js is a list of imports rather than a table
// that has to be kept in step with ten others.

import * as THREE from 'three';
import {
  ARENA_HALF, BOSS_REACH_Y, BOSS_TOUCH_CAP, BOSS_TOUCH_CD, ENEMY_TYPES,
  SHARED_MATS, _blinkAt, aiMelee, bossTouch, capturedShot, eyes, faceSnap,
  geo, lump, orbit, partsFor, prism, releaseMarks, segBlocked, shard, slab,
  snapAim, spike,
} from './shared.js';

// What a glacier's ice takes off a hit while the crust is still on. Up here
// beside the bulwark's for the same reason: both are read inside the
// ENEMY_TYPES literal below, and a const declared after it is still in the
// temporal dead zone when the table is built.
//
// Under a half, so the top of a glacier's bar is a real grind - and nowhere
// near the bulwark's eighty per cent, because a buckler is a small target you
// can shoot AROUND and this covers the whole enemy.
export const GLACIER_SHELL_ARMOR = 0.45;

// RIME'S TRAIL. Dropped less often and lasting longer than a magma's, and both
// halves of that are deliberate: frost does no damage, so a thin line of it is
// nothing at all - the patch has to be big enough and last long enough to be
// worth walking around. The interval is also what keeps the two trails inside
// the thirty shared creep slots when a magma and a rime are on the floor
// together.
// RIME's five. Where EMBER's numbers are all about how much FLOOR a type
// takes, these are all about how long the player spends slowed, weakened, or
// unable to leave - the theme spends a different currency and its constants
// say so.
//
// Where the crust gives way. The shell is the top sixty per cent of the bar.
export const GLACIER_SHELL_AT = 0.4;

export const GLACIER_NOVA_R = 5.5;

export const GLACIER_NOVA_N = 9;

// The shard's burst, and the whole point of the type: one lance at a target
// who is fine, three at one the rest of the theme has already slowed down.
export const SHARD_CD = 2.6;

export const SHARD_BURST = 3;

export const SHARD_BURST_GAP = 0.16;

export const SHARD_RANGE = 30;

export const SHARD_SPREAD = 0.05;

// The hailer's ring. Wide enough to be a wall the player is INSIDE rather than
// a patch they are next to, and gapped, because a closed ring around a player
// who cannot outrun it is a tax rather than a decision.
export const HAIL_CD = 4.2;

export const HAIL_RANGE = 24;

export const HAIL_RING_R = 4.6;

export const HAIL_RING_N = 10;

export const HAIL_RING_GAP = 2;

export const HAIL_PATCH_RADIUS = 1.6;

export const HAIL_PATCH_LIFE = 3.6;

// The hoarfrost's field. Refreshed every frame the player is inside it and
// given a short tail, so it lapses on its own the moment they leave or it
// dies - the same shape the conduit's buff and the bellows' light both use.
export const HOAR_RANGE = 7.5;

export const HOAR_HOLD = 0.6;

// The sleet's column. Slow to arrive over you and slow to drip, because the
// answer is simply to walk - a column that kept pace with a sprint would be
// unavoidable, and one that dripped faster would be a damage check rather
// than a movement one.
export const SLEET_HIGH = 5.0;

export const SLEET_DRIP = 0.5;

export const SLEET_PATCH_RADIUS = 1.9;

export const SLEET_PATCH_LIFE = 3.0;

export const _rimeAt = new THREE.Vector3();

export const RIME_DROP_INTERVAL = 0.55;

export const RIME_PATCH_RADIUS = 1.7;

export const RIME_PATCH_LIFE = 4.0;

// Hunched, heavy in the shoulders, dragging a back full of ice. It leans
// forward like every rusher but its mass is up and BEHIND it, which is what
// says it is slower than the others before it has taken a step.
export function buildRime(e, g, s) {
  const P = partsFor(e, g, s);
  P('rimeTorso', prism(0.38, 0.26, 0.6, 5), { y: 0.86, z: 0.02, rx: -0.18 });
  P('rimeShoulder', prism(0.34, 0.3, 0.2, 5), { y: 1.18, z: 0.08 });
  P('rimeHead', shard(0.17), { y: 1.3, z: -0.28, sz: 1.15 });
  // THE FLOE. Four slabs of ice growing up and back off the shoulders, at
  // different lengths and angles - a fan, not a row, so it reads as growth
  // rather than as armour plating.
  const shardGeo = shard(0.2);
  P('rimeShard', shardGeo, { x: -0.3, y: 1.34, z: 0.22, rz: 0.5, sy: 1.9, s: 0.9, mat: SHARED_MATS.rimeIce });
  P('rimeShard', shardGeo, { x: 0.05, y: 1.5, z: 0.28, rz: -0.15, sy: 2.3, mat: SHARED_MATS.rimeIce });
  P('rimeShard', shardGeo, { x: 0.32, y: 1.28, z: 0.18, rz: -0.6, sy: 1.7, s: 0.85, mat: SHARED_MATS.rimeIce });
  P('rimeShard', shardGeo, { x: -0.1, y: 1.16, z: 0.34, rx: 0.5, sy: 1.4, s: 0.7, mat: SHARED_MATS.rimeIce });
  // Forelimbs hanging long and forward, knuckling. Nothing else in the rusher
  // family has arms in its outline.
  P('rimeArm', slab(0.13, 0.5, 0.14), { x: -0.36, y: 0.82, z: -0.12, rx: 0.3 });
  P('rimeArm', slab(0.13, 0.5, 0.14), { x: 0.36, y: 0.82, z: -0.12, rx: 0.3 });
  P('rimeFist', lump(0.14), { x: -0.38, y: 0.5, z: -0.24 });
  P('rimeFist', lump(0.14), { x: 0.38, y: 0.5, z: -0.24 });
  P('rimeLeg', slab(0.13, 0.4, 0.15), { x: -0.17, y: 0.4, z: 0.06 });
  P('rimeLeg', slab(0.13, 0.4, 0.15), { x: 0.17, y: 0.4, z: 0.06 });
  P('rimeFoot', slab(0.15, 0.14, 0.24), { x: -0.17, y: 0.12, z: -0.02 });
  P('rimeFoot', slab(0.15, 0.14, 0.24), { x: 0.17, y: 0.12, z: -0.02 });
  eyes(P, { y: 1.32, x: 0.09, z: -0.4, r: 0.9, mat: e.eyeMat });
}

// A brute silhouette gone soft. Wide, planted and top-heavy like the tank and
// the bulwark, but where those are plated this one is SWOLLEN - the mass is
// three sacs it is carrying rather than armour it is wearing, and the whole
// read is that there is something inside it that wants out.
// ---- RIME ------------------------------------------------------------------
// The theme's language, set by the rime above: a dark narrow core under a
// CRUST of pale angular plate, built from octahedra and flat slabs rather than
// EMBER's rounded rock. Every one of them is wider at the shoulders than at
// the feet, so the family reads as top-heavy and brittle - something that
// would shatter rather than topple.

// Upright, thin, and the lance is the silhouette - the gunner read, in ice.
export function buildShard(e, g, s) {
  const P = partsFor(e, g, s);
  // A narrow blade of a body: almost no depth, so from the front it is a
  // sliver and from the side it is a plate. The one type in the roster whose
  // outline changes completely with bearing, which is what a thing made of
  // flat ice should do.
  P('shardTorso', prism(0.26, 0.14, 0.76, 4), { y: 1.02, ry: Math.PI / 4, sz: 0.4 });
  P('shardHead', shard(0.16), { y: 1.5, sz: 0.55 });
  // THE LANCE. Long, thin and carried level at the shoulder, projecting well
  // past the body - so the outline is a cross rather than a stick, and the
  // direction it is pointing is readable from across the arena.
  P('shardLance', spike(0.07, 1.05, 4), {
    x: 0.26, y: 1.2, z: -0.5, rx: -Math.PI / 2, mat: SHARED_MATS.rimeIce,
  });
  P('shardGrip', slab(0.14, 0.12, 0.16), { x: 0.26, y: 1.2, z: 0.02 });
  // Crust plates off the shoulders, canted. They are what makes the thin body
  // read as ARMOURED rather than as fragile - it is not, but the family is.
  P('shardPlate', shard(0.2), { x: -0.24, y: 1.28, rz: 0.5, sz: 0.4, mat: SHARED_MATS.rimeIce });
  P('shardPlate', shard(0.2), { x: 0.24, y: 1.34, rz: -0.5, sz: 0.4, mat: SHARED_MATS.rimeIce });
  P('shardLeg', slab(0.09, 0.56, 0.09), { x: -0.12, y: 0.3 });
  P('shardLeg', slab(0.09, 0.56, 0.09), { x: 0.12, y: 0.3 });
  eyes(P, { y: 1.52, x: 0.08, z: -0.13, r: 0.75, mat: e.eyeMat });
}

// Wide, planted and encased. The crust is a separate layer over the whole
// body, held on the enemy so aiGlacier can drop it - the model has to be able
// to LOSE its shell, because that event is the fight.
export function buildGlacier(e, g, s) {
  const P = partsFor(e, g, s);
  // The core, under everything: dark, narrow, and much smaller than the
  // silhouette suggests. What is left when the ice comes off.
  P('glacierCore', prism(0.32, 0.4, 0.9, 5), { y: 0.62 });
  P('glacierHead', shard(0.2), { y: 1.24, z: -0.1 });
  P('glacierLeg', slab(0.16, 0.44, 0.16), { x: -0.24, y: 0.22 });
  P('glacierLeg', slab(0.16, 0.44, 0.16), { x: 0.24, y: 0.22 });
  P('glacierArm', slab(0.18, 0.62, 0.18), { x: -0.52, y: 0.78, rz: 0.3 });
  P('glacierArm', slab(0.18, 0.62, 0.18), { x: 0.52, y: 0.78, rz: -0.3 });

  // THE CRUST. Big angular plates stood off the body on every bearing, so it
  // is the crust and not the core that makes the silhouette - and so the
  // moment it goes, the enemy visibly becomes a smaller thing. Collected on
  // the enemy because aiGlacier hides the lot in one frame.
  e.shellParts = [];
  const plate = (key, geo, o) => e.shellParts.push(P(key, geo, { ...o, mat: SHARED_MATS.rimeIce }));
  plate('glacierPlateBig', shard(0.46), { y: 0.86, z: -0.16, sz: 0.7 });
  plate('glacierPlateBig', shard(0.46), { y: 0.7, z: 0.24, sz: 0.7, ry: 0.9 });
  plate('glacierPlateS', shard(0.3), { x: -0.5, y: 1.02, rz: 0.6 });
  plate('glacierPlateS', shard(0.3), { x: 0.5, y: 1.0, rz: -0.6 });
  plate('glacierSpur', spike(0.14, 0.6, 4), { x: -0.3, y: 1.36, rz: 0.5, rx: -0.2 });
  plate('glacierSpur', spike(0.14, 0.6, 4), { x: 0.3, y: 1.42, rz: -0.5, rx: -0.2 });
  plate('glacierSpur', spike(0.12, 0.5, 4), { y: 1.5, z: 0.2, rx: 0.5 });
  eyes(P, { y: 1.26, x: 0.11, z: -0.26, r: 0.9, mat: e.eyeMat });
}

// Bloated and bottom-heavy, with the load carried high - the ground-denier
// read (blight, bomber, kiln) in ice. The cluster it lobs is visibly sitting
// on its back before it throws it.
export function buildHailer(e, g, s) {
  const P = partsFor(e, g, s);
  P('hailerBody', prism(0.46, 0.34, 0.7, 5), { y: 0.5 });
  P('hailerHead', shard(0.17), { y: 1.02, z: -0.14 });
  // THE CLUSTER, and the whole tell: a bundle of loose shards riding high on
  // its back, which is the only part of the outline above the shoulders.
  const clusterGeo = shard(0.15);
  P('hailerCluster', clusterGeo, { x: -0.16, y: 1.06, z: 0.26, mat: SHARED_MATS.rimeIce });
  P('hailerCluster', clusterGeo, { x: 0.18, y: 1.14, z: 0.22, mat: SHARED_MATS.rimeIce, s: 0.86 });
  P('hailerCluster', clusterGeo, { x: 0.02, y: 1.3, z: 0.3, mat: SHARED_MATS.rimeIce, s: 0.72 });
  // A throwing arm cocked back over the cluster.
  P('hailerArm', slab(0.11, 0.52, 0.11), { x: 0.34, y: 0.82, rz: -0.5, rx: 0.4 });
  P('hailerArm', slab(0.1, 0.44, 0.1), { x: -0.34, y: 0.76, rz: 0.4 });
  P('hailerFoot', slab(0.16, 0.3, 0.2), { x: -0.2, y: 0.15 });
  P('hailerFoot', slab(0.16, 0.3, 0.2), { x: 0.2, y: 0.15 });
  eyes(P, { y: 1.04, x: 0.1, z: -0.28, r: 0.8, mat: e.eyeMat });
}

// Floating, legless, symmetrical: the support read, and deliberately the same
// posture as EMBER's bellows because they are the same ROLE doing opposite
// jobs. Where a bellows is two lobes breathing, this is a closed ring of
// plates around a cold centre - it gives nothing out, it takes something away.
export function buildHoarfrost(e, g, s) {
  const P = partsFor(e, g, s);
  // A ring of blades standing on edge around an empty middle. Legless and
  // open-centred, so it reads as support from the flat black test, and so the
  // negative space is the identity the way the bellows' gap is.
  const bladeGeo = shard(0.24);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P('hoarBlade', bladeGeo, {
      x: Math.cos(a) * 0.42, y: 1.06 + Math.sin(i * 1.7) * 0.1, z: Math.sin(a) * 0.42,
      ry: -a, sz: 0.35, mat: SHARED_MATS.rimeIce,
    });
  }
  // The cold centre, small and dark, hanging in the middle of the ring.
  P('hoarCore', shard(0.17), { y: 1.06 });
  // A spine above and below, so the ring reads as mounted rather than as six
  // loose objects that happen to be arranged.
  P('hoarSpike', spike(0.13, 0.44, 4), { y: 1.48 });
  P('hoarSpike', spike(0.11, 0.36, 4), { y: 0.68, rx: Math.PI });

  // THE FIELD, DRAWN AT EXACTLY THE RADIUS IT WORKS AT. This is not
  // decoration and it is the reason the enemy is allowed to exist: a debuff
  // whose edge the player cannot see is a gun that has quietly stopped
  // working, and they would never learn why. Built the way the warden's ring
  // is - at world size on the group, so it does not inherit the model scale
  // that P() has already baked into every other part.
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xa9d8ef, transparent: true, opacity: 0.7,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  e._extraMats.push(ringMat);
  const ring = new THREE.Mesh(
    geo('hoarRing', () => new THREE.RingGeometry(HOAR_RANGE - 0.28, HOAR_RANGE, 56)),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  // Fifteen metres across; a ring that size cartwheeling off a corpse does not
  // read as a death. Same exemption the warden's takes.
  ring.userData.noCorpse = true;
  g.add(ring);
  e.ringMesh = ring;
  eyes(P, { y: 1.12, x: 0.09, z: -0.2, r: 0.8, mat: e.eyeMat });
}

// A flat plate seen from below, like the ashwing - but where that is a swept
// delta built to read as MOVING, this is a broad symmetrical disc built to
// read as HANGING. The two air roles have to be told apart at a glance from
// directly underneath, which is the only angle either is ever seen from.
export function buildSleet(e, g, s) {
  const P = partsFor(e, g, s);
  P('sleetDisc', prism(0.62, 0.5, 0.16, 6), { y: 0.06 });
  P('sleetRim', prism(0.68, 0.68, 0.07, 6), { y: -0.02, mat: SHARED_MATS.rimeIce });
  // THE ICICLES. A skirt of them hanging under the disc, which is the part the
  // player actually sees - and the part that says what it is about to do.
  const spikeGeo = spike(0.1, 0.44, 4);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P('sleetIcicle', spikeGeo, {
      x: Math.cos(a) * 0.34, y: -0.3, z: Math.sin(a) * 0.34,
      rx: Math.PI, mat: SHARED_MATS.rimeIce,
    });
  }
  P('sleetSpine', spike(0.15, 0.5, 5), { y: -0.42, rx: Math.PI, mat: SHARED_MATS.rimeIce });
  // A low crown on top, so it is not a featureless plate from above either.
  P('sleetCrown', shard(0.22), { y: 0.24, sy: 0.6 });
  eyes(P, { y: 0.08, x: 0.11, z: -0.44, r: 0.85, mat: e.eyeMat });
}

// RIME's boss: the theme's crust language at boss scale. The plates that once
// made its invulnerability are now its BODY LANGUAGE - they say a nova is
// being charged, never that the boss cannot be hurt, because nothing about
// this fight gates damage any more.
export function buildPaleCrown(e, g, s) {
  const P = partsFor(e, g, s);
  // A tall narrow core: it should look like something that has been ENCASED
  // rather than something that is naturally this big, so the body under the
  // shell is visibly slighter than the silhouette the shell gives it.
  P('crownBody', prism(0.4, 0.52, 1.2, 5), { y: 0.72 });
  P('crownChest', shard(0.34), { y: 1.24, z: -0.16 });
  P('crownHead', spike(0.24, 0.5, 5), { y: 1.72 });
  // The arms are kept so the ai can raise them: arms up means something is
  // coming DOWN - its rain or its ring - the one posture that reads from
  // anywhere in the arena without looking at the floor.
  e.crownArms = [
    P('crownArm', slab(0.2, 0.86, 0.2), { x: -0.62, y: 1.0, rz: 0.26 }),
    P('crownArm', slab(0.2, 0.86, 0.2), { x: 0.62, y: 1.0, rz: -0.26 }),
  ];
  P('crownLeg', slab(0.2, 0.5, 0.2), { x: -0.26, y: 0.24 });
  P('crownLeg', slab(0.2, 0.5, 0.2), { x: 0.26, y: 0.24 });

  // THE CROWN it is named for: a ring of blades standing off the shoulders,
  // which is what breaks the skyline and makes it findable in a white room.
  const bladeGeo = spike(0.11, 0.72, 4);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    P('crownBlade', bladeGeo, {
      x: Math.cos(a) * 0.44, y: 1.9, z: Math.sin(a) * 0.44,
      rz: Math.cos(a) * -0.42, rx: Math.sin(a) * 0.42, mat: SHARED_MATS.rimeIce,
    });
  }

  // THE PLATES. Big pale plates closing over the body, hidden except for the
  // half-second the nova is charging - the Crown visibly OPENING them is the
  // tell. Kept on the enemy so the ai can raise and drop the whole set in a
  // frame, and the resting height of each is remembered here because the ai
  // lifts them by an offset, never to an absolute.
  e.shellParts = [];
  const plate = (key, geo, o) => {
    const m = P(key, geo, { ...o, mat: SHARED_MATS.rimeIce });
    m.userData.oy = m.position.y;
    e.shellParts.push(m);
  };
  plate('crownShellA', shard(0.78), { y: 1.06, sz: 0.8 });
  plate('crownShellB', shard(0.6), { y: 1.62, sz: 0.8, ry: 0.7 });
  plate('crownShellC', shard(0.56), { y: 0.5, sz: 0.85, ry: 1.3 });
  plate('crownShellD', shard(0.4), { x: -0.66, y: 1.0, rz: 0.5 });
  plate('crownShellD', shard(0.4), { x: 0.66, y: 1.0, rz: -0.5 });
  for (const m of e.shellParts) m.visible = false;
  eyes(P, { y: 1.74, x: 0.13, z: -0.34, r: 1.4, mat: e.eyeMat });
}

export function aiRime(e, a) {
  aiMelee(e, a);
  e.rimeCd = (e.rimeCd || 0) - a.dt;
  if (e.rimeCd > 0) return;
  e.rimeCd = RIME_DROP_INTERVAL;
  a.ctx.addHazard(
    e.pos.x, e.pos.z, RIME_PATCH_RADIUS, RIME_PATCH_LIFE, 0, 'frost'
  );
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 0.25, e.pos.z);
    a.ctx.effects.burst(_blinkAt, 0x9fd8ff, 5, 1.6, 2, 0.5);
  }
}

// The blight's lob with a cloud on the end of it. Everything about the throw
// is the blight's - the same cooldown, the same lead baked into the glob's
// aim, the same nozzle it leaves from - because the two are meant to be read
// as the same threat until the moment it lands, and then to be answered
// differently: you can wait a blight's pool out at the edge, and you cannot
// wait out something that is still on you after you leave.
// ---- RIME ------------------------------------------------------------------

// One lance normally, three at a target the rest of the theme has already
// slowed. It reads the player's own status rather than tracking anything
// itself, so a shard fighting alone genuinely is the weakest gunner in the
// game and a shard behind a hailer is the reason not to walk through the ring.
export function aiShard(e, a) {
  orbit(e, a, ENEMY_TYPES.shard.orbit);
  if (e.burstLeft > 0) {
    e.burstGap -= a.dt;
    if (e.burstGap <= 0) {
      e.burstGap = SHARD_BURST_GAP;
      e.burstLeft--;
      // A FAN, not a stack. Three rounds from one muzzle all aimed at the
      // player converge and either all hit or all miss; spread, they diverge
      // with range and reward moving across rather than straight back.
      const i = SHARD_BURST - e.burstLeft - 1;
      a.ctx.addProjectile(
        e.pos.x, 1.2, e.pos.z, 'shard', e._projScale(),
        (i - (SHARD_BURST - 1) / 2) * SHARD_SPREAD
      );
    }
    return;
  }
  if (e.attackCd > 0 || a.dist > SHARD_RANGE) return;
  e.attackCd = SHARD_CD + Math.random() * 0.5;
  e.flash = 0.12;
  // THE WHOLE ENEMY IS THIS TEST.
  const chilled = a.ctx.player && a.ctx.player.hasStatus && a.ctx.player.hasStatus('slowness');
  if (chilled) {
    e.burstLeft = SHARD_BURST;
    e.burstGap = 0;
    e._setEyeAlert(true);
  } else {
    e._setEyeAlert(false);
    a.ctx.addProjectile(e.pos.x, 1.2, e.pos.z, 'shard', e._projScale());
  }
}

// A brute with a shell on the top sixty per cent of its bar. Everything here
// is the ONE EVENT: noticing the crust has gone, and being somewhere else for
// it. The plates are hidden in a single frame rather than faded, because the
// shatter is meant to be a moment and not a transition.
export function aiGlacier(e, a) {
  aiMelee(e, a);
  if (e.shellBroken) return;
  if (e.hp > e.maxHp * GLACIER_SHELL_AT) {
    // Cracks as it goes. The crust is the health bar, drawn on the enemy - a
    // player who can see how close it is gets to choose where to be, which is
    // the entire reason this is a shell and not just more health.
    const k = 1 - (e.hp / e.maxHp - GLACIER_SHELL_AT) / (1 - GLACIER_SHELL_AT);
    if (e.shellParts && k > 0.35) {
      for (let i = 0; i < e.shellParts.length; i++) {
        // Plates jitter loose in order, so the crust visibly comes apart from
        // the extremities in rather than all at once.
        const loose = k > 0.35 + (i / e.shellParts.length) * 0.6;
        e.shellParts[i].rotation.z = loose ? Math.sin(a.ctx.time * 9 + i) * 0.14 : 0;
      }
    }
    return;
  }

  e.shellBroken = true;
  if (e.shellParts) {
    for (const m of e.shellParts) m.visible = false;
  }
  // THE NOVA. A ring of frost at the enemy's feet - it costs no health, it
  // costs the ground the player chose to finish it on, which is the same
  // bargain the husk offers and paid in the other currency.
  for (let i = 0; i < GLACIER_NOVA_N; i++) {
    const ang = (i / GLACIER_NOVA_N) * Math.PI * 2;
    a.ctx.addHazard(
      e.pos.x + Math.cos(ang) * GLACIER_NOVA_R * 0.6,
      e.pos.z + Math.sin(ang) * GLACIER_NOVA_R * 0.6,
      RIME_PATCH_RADIUS, RIME_PATCH_LIFE, 0, 'frost'
    );
  }
  if (a.ctx.effects) {
    _rimeAt.set(e.pos.x, 0.8, e.pos.z);
    a.ctx.effects.shockwave(_rimeAt, 0x63b3ff, GLACIER_NOVA_R, 0.4);
    a.ctx.effects.burst(_rimeAt, 0xd8f0ff, 26, 5, 2, 0.7);
  }
  if (a.ctx.sfx) a.ctx.sfx.impact();
}

// Lobs a cluster that lands as a gapped RING around the player rather than as
// a patch on them. Thrown as a Spit like every other lob in the game, so the
// arc, the lead and the tell are the ones the player has already learned.
export function aiHailer(e, a) {
  orbit(e, a, ENEMY_TYPES.hailer.orbit);
  if (e.attackCd > 0 || a.dist > HAIL_RANGE) return;
  e.attackCd = HAIL_CD + Math.random() * 0.9;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.3, e.pos.z + a.nz * 0.8, 'hail');
  if (a.ctx.effects) {
    _rimeAt.set(e.pos.x, 1.5, e.pos.z);
    a.ctx.effects.burst(_rimeAt, 0x63b3ff, 10, 3, 2, 0.5);
  }
}

// No attack. It stands off and WEAKENS: inside its field everything the player
// fires hits for forty per cent less.
//
// The ring on the floor is not decoration and must never be removed. A debuff
// the player cannot see the edge of is a gun that has quietly stopped working,
// which is the single worst thing an enemy in this game can do.
export function aiHoarfrost(e, a) {
  orbit(e, a, ENEMY_TYPES.hoarfrost.orbit);
  if (e.ringMesh) e.ringMesh.rotation.z += a.dt * 0.5;
  if (a.dist > HOAR_RANGE) {
    e._setEyeAlert(false);
    return;
  }
  e._setEyeAlert(true);
  // Refreshed every frame with a short tail, so it lapses on its own the
  // moment the player leaves the field or the caster dies.
  if (a.ctx.applyPlayerStatus) a.ctx.applyPlayerStatus('weakness', HOAR_HOLD);
  // WHO DID IT. The chip in the HUD says what is on you; the beam says which
  // of the things in the room to shoot for it.
  if (a.ctx.effects && a.ctx.player) {
    a.ctx.effects.beam(e.pos, a.ctx.player.pos, 0xa9d8ef);
  }
}

// Parks over the player's head and drips cold onto the floor beneath itself.
// It steers and does nothing else, which is the deliberate opposite of the
// ashwing's committed straight line.
export function aiSleet(e, a) {
  e.hoverY = SLEET_HIGH;
  // Homes onto the spot the player is on rather than orbiting - slowly, so
  // walking away from it works and sprinting away from it is not required.
  const sp = e._effSpeed();
  a.vx = a.nx * sp;
  a.vz = a.nz * sp;
  // Only pours once it is actually overhead. Dripping on the way in would
  // draw a trail across the arena, which is the ashwing's job.
  if (a.dist > 3.2) {
    e._setEyeAlert(false);
    return;
  }
  e._setEyeAlert(true);
  e.dripCd = (e.dripCd || 0) - a.dt;
  if (e.dripCd > 0) return;
  e.dripCd = SLEET_DRIP;
  a.ctx.addHazard(e.pos.x, e.pos.z, SLEET_PATCH_RADIUS, SLEET_PATCH_LIFE, 0, 'hail');
  if (a.ctx.effects) {
    _rimeAt.set(e.pos.x, e.pos.y - 0.6, e.pos.z);
    a.ctx.effects.burst(_rimeAt, 0xbfe6ff, 6, 1.5, -2, 0.6);
  }
}

// ---- the Pale Crown ---------------------------------------------------------
// RIME's boss is the whole theme condensed to one body, and it is SHARP. The
// theme spends the player rather than the floor - its ground chills you, and
// a chilled player is a marked one - so everything the Crown does either lays
// cold ground or punishes you for standing on it. There is no shell and no
// pause: it is always the player's turn to dodge, never the boss's turn to be
// a wall. Nothing here gates damage.
//
// Five attacks off a shuffled bag, never the same one twice in a row, on a
// rest of about a second between them - the fastest clock of any boss in the
// game, because pressure is what the Crown has INSTEAD of a health gate:
//
//   fan     the shard's thesis at boss scale: an aimed volley on a short
//           tell, fired TWICE with a re-aim between - and wider and denser
//           whenever the player is chilled, because letting the theme land
//           its cold on you is how the Crown loads its own gun
//   rush    a lane is drawn to the far wall, the Crown squats into it, and
//           the glacier COMES DOWN IT - twenty metres across the arena with a
//           frozen wake behind it, and past the crest of the fight it stops
//           only to re-aim and come again
//   nova    the hug answer. The plates open, a disc fills at its feet for
//           most of a second, and then the room where you were standing is
//           no longer yours - a chilling blast, and frozen ground at the rim
//   prison  the hailer's sentence at boss scale: a GAPPED ring of icicle
//           strikes around where you stand, landing all at once - read the
//           gap and be in it when it snaps
//   rain    a walking barrage: strikes placed on you, then a second wave
//           placed where you WENT, so standing still anywhere is being eaten
//
// Contact pays at all times through bossTouch, as on every reworked boss -
// the rush is the one code exception, and only so the pass itself is the hit
// instead of stacking on a touch in the same frame.

export const CROWN_ICE = 0x8fd4ff;

export const _crownAt = new THREE.Vector3();

// The gait between attacks: it circles the middle distance and keeps sliding
// - the room never gets to shoot a statue.
export const CROWN_PROWL = { dist: 10, band: 3, out: 1.1, in: -0.7, strafe: 0.7, flip: 1.4, flipVar: 1.0 };

// THE FAN. Three lances, five at a chilled target; the second volley re-aims,
// so the dodge is to keep moving THROUGH the attack, not to step once.
export const CROWN_FAN_TELL = 0.5;

export const CROWN_FAN_GAP = 0.32;

export const CROWN_FAN_N = 3;

export const CROWN_FAN_CHILL_N = 5;

export const CROWN_FAN_SPREAD = 0.15;

export const CROWN_FAN_CHILL_SPREAD = 0.11;

// THE RUSH. A lane as wide as the Crown's shoulders and as long as the room.
// The wake interval is what keeps the trail inside the shared frost cap when
// a rime add is trailing its own line at the same time.
export const CROWN_RUSH_TELL = 0.85;

export const CROWN_RUSH_RETELL = 0.55;

export const CROWN_RUSH_W = 1.6;

export const CROWN_RUSH_LEN = 20;

export const CROWN_RUSH_MUL = 4.6;

export const CROWN_RUSH_CAP = 12.5;

export const CROWN_RUSH_WAKE = 0.14;

// Below this bar the rush calves twice: stop, re-aim, come again.
export const CROWN_CREST_AT = 0.55;

// THE NOVA. Six and a half metres the player has most of a second to be out
// of - wide enough that hugging is never safe, slow enough that it is always
// a decision rather than a tax.
export const CROWN_NOVA_TELL = 0.8;

export const CROWN_NOVA_R = 6.4;

export const CROWN_NOVA_DMG = 32;

// The blast chills what it catches - the escape from it loads the next volley.
export const CROWN_NOVA_CHILL = 2.4;

export const CROWN_NOVA_RING = 9;

// THE PRISON. Ten slots around the player, two gone to the gap, all landing
// together after one long fill. The gap is what separates a cage from a
// coincidence of damage circles.
export const CROWN_PRISON_R = 4.4;

export const CROWN_PRISON_N = 10;

export const CROWN_PRISON_GAP = 2;

export const CROWN_PRISON_HIT_R = 2.1;

export const CROWN_PRISON_DELAY = 1.25;

// THE RAIN. Three strikes on and beside you, then a second wave re-placed on
// the player half a second later - a walk, not a wall: it herds rather than
// surrounds.
export const CROWN_RAIN_T = 1.05;

export const CROWN_RAIN_WAVE2 = 0.55;

export const CROWN_RAIN_R = 2.2;

export const CROWN_RAIN_DELAY = 0.85;

// THE WARNINGS. Both kinds of telegraph the Crown owns route through the two
// slots releaseMarks knows how to drain: one held mark in bs.mark - the lane
// or the disc, never both at once - on the -1 convention, and every icicle
// strike currently falling in bs.rings. A strike's own circle IS its
// countdown, filled as it falls.
const crownMarkGet = (bs) => { if (!(bs.mark >= 0)) bs.mark = bs.fx.markAcquire(); return bs.mark; };
const crownMarkDrop = (bs) => { if (bs.mark >= 0) bs.fx.markRelease(bs.mark); bs.mark = -1; };

// One salvo, all-or-nothing: every circle drawn is a circle that lands, so if
// the pool cannot warn for ALL of them the attack simply does not happen this
// cycle rather than landing one nobody saw.
function crownScatter(e, ctx, points) {
  const bs = e.bs;
  const made = [];
  for (const p of points) {
    const mark = ctx.effects.markAcquire();
    if (mark < 0) {
      for (const m of made) ctx.effects.markRelease(m);
      return false;
    }
    made.push(mark);
    bs.rings.push({ ...p, t: 0, mark });
  }
  return true;
}

function crownTickSalvos(e, a) {
  const bs = e.bs, ctx = a.ctx;
  for (let i = bs.rings.length - 1; i >= 0; i--) {
    const s = bs.rings[i];
    s.t += a.dt;
    if (s.t < s.delay) {
      bs.fx.markSet(s.mark, s.x, s.z, s.r, CROWN_ICE, s.t / s.delay);
      continue;
    }
    bs.fx.markRelease(s.mark);
    bs.rings.splice(i, 1);
    _crownAt.set(s.x, 0, s.z);
    ctx.effects.shockwave(_crownAt, CROWN_ICE, s.r, 0.4);
    ctx.effects.burst(_crownAt, 0xd8f0ff, 14, s.r * 1.9, 2, 0.5);
    ctx.effects.addShake(0.1);
    if (ctx.sfx) ctx.sfx.impact();
    // An eruption you were SHOWN: the answer is to be out of the circle, or
    // above it - and the circle, not the boss, is what blocks are measured
    // against.
    const p = ctx.player.pos;
    const d = Math.hypot(p.x - s.x, p.z - s.z);
    if (d < s.r && p.y < 2.4 &&
        !segBlocked(s.x, 0.5, s.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
      ctx.onHitPlayer(s.dmg * (1 - 0.4 * d / s.r), _crownAt, e);
    }
    // Where it struck stays cold: every strike feeds the theme the ground it
    // spends.
    ctx.addHazard(s.x, s.z, s.leaveR, s.leaveLife, 0, 'hail');
  }
}

// THE BAG. A shuffle with range gates: every attack comes off it, the same
// one never lands twice in a row, and one the range forbids is skipped down
// the bag until something legal turns up - so the clock stays fast without
// the Crown ever spending its best attack on a player it cannot reach.
export const CROWN_ATTACKS = ['fan', 'rush', 'nova', 'prison', 'rain'];

function crownDraw(e, a) {
  const bs = e.bs;
  if (!bs.bag.length) {
    bs.bag = CROWN_ATTACKS.slice();
    for (let i = bs.bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bs.bag[i], bs.bag[j]] = [bs.bag[j], bs.bag[i]];
    }
    // A fresh bag must not open with whatever the last bag closed with.
    if (bs.bag.length > 1 && bs.bag[bs.bag.length - 1] === bs.last) {
      const last = bs.bag.length - 1;
      [bs.bag[0], bs.bag[last]] = [bs.bag[last], bs.bag[0]];
    }
  }
  const gated = {
    nova: a.dist < 10.5,    // the hug answer, not a long-range hope
    rush: a.dist > 5.5,     // at arm's length a lane is a free hit
    fan: a.dist < 26,       // past that the lances are skywriting
    prison: true,           // drawn around the PLAYER, so any range is right
    rain: true,
  };
  let i = bs.bag.length - 1;
  while (i > 0 && !gated[bs.bag[i]]) i--;
  bs.last = bs.bag[i];
  return bs.bag.splice(i, 1)[0];
}

// The breath between attacks, and the escalation: the deeper into the bar the
// fight gets, the shorter the breath - first to three quarters of it, then
// under half. No shell, so the pressure curve is the whole difficulty curve.
function crownRest(e, extra = 1) {
  const bs = e.bs;
  bs.state = 'roam';
  const haste = e.hp < e.maxHp * 0.25 ? 0.55 : bs.enraged ? 0.72 : 1;
  bs.t = bs.tMax = (0.55 + Math.random() * 0.45) * e.rate * haste * extra;
  e._setEyeAlert(false);
}

// One volley on the bearing the tell locked. THE CHILL RULE, and the theme's
// whole thesis at boss scale: three lances at a player on warm ground, five
// at one the fight has already slowed - the Crown reads the player's own
// status for exactly the reason the shard does.
function crownFanFire(e, a) {
  const ctx = a.ctx;
  const chilled = ctx.player && ctx.player.hasStatus && ctx.player.hasStatus('slowness');
  const n = chilled ? CROWN_FAN_CHILL_N : CROWN_FAN_N;
  const spread = chilled ? CROWN_FAN_CHILL_SPREAD : CROWN_FAN_SPREAD;
  for (let i = 0; i < n; i++) capturedShot(e, a, e.aim, (i - (n - 1) / 2) * spread, 1.7);
  e.flash = Math.max(e.flash, 0.12);
  if (ctx.sfx) ctx.sfx.meleeSwing();
}

// One rain wave: a strike ON the player and one on either shoulder, so every
// wave forbids holding the lane and both ways out of it for the length of a
// fill. The second wave is re-placed on the player half a second later and
// turned a third of a circle - the barrage WALKS, and standing still is what
// it punishes.
function crownRainWave(e, a, seed) {
  const ctx = a.ctx, p = ctx.player.pos;
  const pts = [{
    x: p.x, z: p.z, r: CROWN_RAIN_R, delay: CROWN_RAIN_DELAY,
    dmg: Math.min(20, e.damage * 0.8), leaveR: 1.5, leaveLife: 3.4,
  }];
  for (let k = 1; k <= 2; k++) {
    const ang = seed + k * 2.1;
    pts.push({
      x: Math.max(-20.8, Math.min(20.8, p.x + Math.cos(ang) * 2.6)),
      z: Math.max(-20.8, Math.min(20.8, p.z + Math.sin(ang) * 2.6)),
      r: CROWN_RAIN_R, delay: CROWN_RAIN_DELAY + k * 0.22,
      dmg: Math.min(20, e.damage * 0.8), leaveR: 1.5, leaveLife: 3.4,
    });
  }
  crownScatter(e, ctx, pts);
}

function crownPick(e, a) {
  const bs = e.bs, ctx = a.ctx;
  bs.fx = ctx.effects;
  const attack = crownDraw(e, a);
  e._setEyeAlert(true);
  if (attack === 'fan') {
    snapAim(e, a, true);
    bs.state = 'fanTell'; bs.t = bs.tMax = CROWN_FAN_TELL;
    if (ctx.sfx) ctx.sfx.tone({ f: 340, f2: 170, t: 0.35, type: 'triangle', v: 0.3 });
  } else if (attack === 'rush') {
    snapAim(e, a, true);
    bs.state = 'rushTell'; bs.t = bs.tMax = CROWN_RUSH_TELL;
    bs.rushes = 0; bs.rushHit = false; bs.wakeT = 0;
    // No fanfare: the lane on the floor and the squat are the announcement.
    ctx.bossEvent('charge', e);
  } else if (attack === 'nova') {
    bs.state = 'novaTell'; bs.t = bs.tMax = CROWN_NOVA_TELL;
    if (ctx.sfx) ctx.sfx.tone({ f: 150, f2: 320, t: 0.5, type: 'triangle', v: 0.35 });
  } else if (attack === 'prison') {
    bs.state = 'prisonCast'; bs.t = bs.tMax = 0.55;
    // Ten slots around WHERE THE PLAYER STANDS, two of them gone to the gap,
    // all landing together. Placed once and never again: a cage that tracked
    // would be an unavoidable hit with art on it.
    const p = ctx.player.pos;
    const gap = Math.floor(Math.random() * CROWN_PRISON_N);
    const pts = [];
    for (let i = 0; i < CROWN_PRISON_N; i++) {
      if (((i - gap + CROWN_PRISON_N) % CROWN_PRISON_N) < CROWN_PRISON_GAP) continue;
      const ang = (i / CROWN_PRISON_N) * Math.PI * 2;
      pts.push({
        x: Math.max(-20.8, Math.min(20.8, p.x + Math.cos(ang) * CROWN_PRISON_R)),
        z: Math.max(-20.8, Math.min(20.8, p.z + Math.sin(ang) * CROWN_PRISON_R)),
        r: CROWN_PRISON_HIT_R, delay: CROWN_PRISON_DELAY,
        dmg: Math.min(24, e.damage * 0.95), leaveR: 1.6, leaveLife: 4.2,
      });
    }
    crownScatter(e, ctx, pts);
    if (ctx.sfx) ctx.sfx.tone({ f: 520, f2: 760, t: 0.5, type: 'triangle', v: 0.3 });
  } else {
    bs.state = 'rainCast'; bs.t = bs.tMax = CROWN_RAIN_T;
    bs.wave2 = CROWN_RAIN_WAVE2;
    bs.rainSeed = Math.random() * Math.PI * 2;
    crownRainWave(e, a, bs.rainSeed);
    if (ctx.sfx) ctx.sfx.tone({ f: 620, f2: 280, t: 0.4, type: 'triangle', v: 0.3 });
  }
}

export function aiPaleCrown(e, a) {
  e.stepMul = 1.4;
  const bs = e.bs, ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'roam'; bs.t = bs.tMax = 0.9;
    bs.bag = []; bs.last = '';
    bs.fx = ctx.effects; bs.mark = -1; bs.rings = [];
    bs.enraged = false; bs.armK = 0; bs.rushHit = false; bs.rushes = 0; bs.wakeT = 0;
  }
  bs.t -= a.dt;
  // The weather outlives the state that cast it: an icicle already falling
  // does not care what the Crown does next.
  crownTickSalvos(e, a);

  // THE TOUCH, in every state but the one whose own contact is already the
  // attack. Nothing about this boss is safe to stand against.
  if (bs.state !== 'rush') bossTouch(e, a);

  if (e.status.fear > 0) {
    // A staggered Crown holds position and drops every tell it was holding -
    // an attack that is not happening must take its warning with it, or the
    // player is hit by circles that are not drawn any more.
    releaseMarks(e);
    e._setEyeAlert(false);
    bs.state = 'roam'; bs.t = bs.tMax = 0.8;
    return;
  }

  // THE SECOND HALF OF THE BAR, once and loudly: no new attacks, no thicker
  // ice - the room turns to alarm and the clock simply tightens.
  if (!bs.enraged && e.hp < e.maxHp * 0.5) {
    bs.enraged = true;
    ctx.bossEvent('enrage', e);
    _crownAt.set(e.pos.x, 1.4, e.pos.z);
    ctx.effects.shockwave(_crownAt, CROWN_ICE, 8, 0.6);
    ctx.effects.burst(_crownAt, 0xe8f7ff, 30, 8, 3, 0.9);
    ctx.effects.addShake(0.3);
  }

  if (bs.state === 'roam') {
    orbit(e, a, CROWN_PROWL);
    if (bs.t <= 0) crownPick(e, a);

  } else if (bs.state === 'fanTell') {
    faceSnap(e);
    if (bs.t <= 0) {
      // State flips BEFORE the volley leaves: the tell is over the moment
      // anything is in the air, or the warning and the hit overlap.
      bs.state = 'fan2'; bs.t = bs.tMax = CROWN_FAN_GAP;
      crownFanFire(e, a);
    }
  } else if (bs.state === 'fan2') {
    faceSnap(e);
    if (bs.t <= 0) {
      // The second volley re-reads where the player went. Standing still
      // through the gap between them is the mistake this attack is for.
      snapAim(e, a);
      faceSnap(e);
      crownRest(e);
      crownFanFire(e, a);
    }

  } else if (bs.state === 'rushTell') {
    faceSnap(e);
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    // The lane runs from the Crown through where the player was when it
    // squared up, on to the far wall: the warning covers the whole corridor,
    // not just the part near the boss.
    const B = ARENA_HALF - (e.radius - 0.5);
    const tx = e.nx > 1e-4 ? (B - e.pos.x) / e.nx : e.nx < -1e-4 ? (-B - e.pos.x) / e.nx : 1e9;
    const tz = e.nz > 1e-4 ? (B - e.pos.z) / e.nz : e.nz < -1e-4 ? (-B - e.pos.z) / e.nz : 1e9;
    bs.rushLen = Math.max(7, Math.min(CROWN_RUSH_LEN, Math.min(tx, tz)));
    crownMarkGet(bs);
    ctx.effects.markSet(bs.mark, e.pos.x + e.nx * bs.rushLen / 2, e.pos.z + e.nz * bs.rushLen / 2,
      CROWN_RUSH_W, CROWN_ICE, fill, bs.rushLen / (CROWN_RUSH_W * 2),
      Math.atan2(-e.nx, -e.nz));
    if (bs.t <= 0) {
      // A rush that never drew is a rush that never happens.
      if (bs.mark < 0) { crownRest(e); return; }
      crownMarkDrop(bs);
      bs.rushV = Math.min(CROWN_RUSH_CAP, e.speed * CROWN_RUSH_MUL);
      bs.state = 'rush'; bs.t = bs.tMax = Math.min(2.1, bs.rushLen / bs.rushV);
      if (ctx.sfx) ctx.sfx.meleeSwing();
    }
  } else if (bs.state === 'rush') {
    faceSnap(e);
    e.stepMul = 5;
    // The stride is capped BEFORE slows, and the slow pierces the cap: a
    // chilled glacier crosses its own lane slower, which is exactly what the
    // theme would say back.
    const slow = Math.min(1, a.sp / Math.max(0.001, e.speed));
    a.vx = e.nx * bs.rushV * slow;
    a.vz = e.nz * bs.rushV * slow;
    // The wake: whatever the rush did not hit, it still took the floor from.
    bs.wakeT -= a.dt;
    if (bs.wakeT <= 0) {
      bs.wakeT = CROWN_RUSH_WAKE;
      ctx.addHazard(e.pos.x, e.pos.z, 1.5, 3.8, 0, 'frost');
    }
    // The pass itself is the hit - the boss's whole body, in a straight line,
    // at three times anything else's pace.
    if (!bs.rushHit && a.dist < 2.9 && a.nx * e.nx + a.nz * e.nz > 0 &&
        ctx.player.pos.y < BOSS_REACH_Y &&
        !segBlocked(e.pos.x, 1.4, e.pos.z,
          ctx.player.pos.x, ctx.player.pos.y + 0.8, ctx.player.pos.z, ctx.obstacles)) {
      ctx.onHitPlayer(Math.min(BOSS_TOUCH_CAP, e.damage), e.pos, e);
      bs.rushHit = true;
      // One pass costs one hit, never a hit AND a touch in the same frame.
      bs.touchCd = BOSS_TOUCH_CD * e.rate;
    }
    if (!bs.rushHit) bossTouch(e, a);
    if (bs.t <= 0 || e.blockedBy > 0.05) {
      // Calving: the stop is an event, and past the crest of the fight it is
      // not a stop at all - the Crown re-aims and comes down the lane again.
      _crownAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.shockwave(_crownAt, CROWN_ICE, 4.6, 0.4);
      ctx.effects.burst(_crownAt, 0xd8f0ff, 22, 6, 2, 0.6);
      ctx.effects.addShake(0.18);
      if (ctx.sfx) ctx.sfx.impact();
      bs.rushes++;
      bs.rushHit = false;
      if (bs.rushes < 2 && e.hp < e.maxHp * CROWN_CREST_AT) {
        snapAim(e, a, true);
        bs.state = 'rushTell'; bs.t = bs.tMax = CROWN_RUSH_RETELL;
        ctx.bossEvent('charge', e);
      } else crownRest(e);
    }

  } else if (bs.state === 'novaTell') {
    // Rooted: where the disc is drawn is where it lands, and a Crown creeping
    // after the player would make the warning a lie.
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    crownMarkGet(bs);
    ctx.effects.markSet(bs.mark, e.pos.x, e.pos.z, CROWN_NOVA_R, CROWN_ICE, fill);
    if (bs.t <= 0) {
      if (bs.mark < 0) { crownRest(e); return; }
      crownMarkDrop(bs);
      _crownAt.set(e.pos.x, 0.5, e.pos.z);
      ctx.effects.shockwave(_crownAt, 0xe8f7ff, CROWN_NOVA_R, 0.5);
      ctx.effects.burst(_crownAt, 0xe8f7ff, 30, CROWN_NOVA_R * 0.9, 2, 0.8);
      ctx.effects.addShake(0.3);
      if (ctx.sfx) ctx.sfx.impact();
      const p = ctx.player.pos;
      if (a.dist < CROWN_NOVA_R && p.y < 2.4 &&
          !segBlocked(e.pos.x, e.pos.y + 0.6, e.pos.z,
            p.x, p.y + 0.8, p.z, ctx.obstacles)) {
        ctx.onHitPlayer(Math.min(CROWN_NOVA_DMG, e.damage * 1.25) * (1 - 0.45 * a.dist / CROWN_NOVA_R), e.pos, e);
        // The blast CHILLS what it catches: the escape from it is already
        // loading the next volley.
        if (ctx.applyPlayerStatus) ctx.applyPlayerStatus('slowness', CROWN_NOVA_CHILL);
      }
      // The rim it opened stays frozen - the nova takes the ground too.
      for (let i = 0; i < CROWN_NOVA_RING; i++) {
        const ang = (i / CROWN_NOVA_RING) * Math.PI * 2;
        ctx.addHazard(
          Math.max(-20.8, Math.min(20.8, e.pos.x + Math.cos(ang) * CROWN_NOVA_R * 0.62)),
          Math.max(-20.8, Math.min(20.8, e.pos.z + Math.sin(ang) * CROWN_NOVA_R * 0.62)),
          RIME_PATCH_RADIUS, RIME_PATCH_LIFE + 0.6, 0, 'hail'
        );
      }
      crownRest(e, 0.8);
    }

  } else if (bs.state === 'prisonCast') {
    // The cage was placed whole and does not chase; the cast itself is raised
    // arms and a slow drift.
    a.vx = a.nx * a.sp * 0.3;
    a.vz = a.nz * a.sp * 0.3;
    if (bs.t <= 0) crownRest(e);
  } else if (bs.state === 'rainCast') {
    // It walks its own storm forward.
    a.vx = a.nx * a.sp * 0.55;
    a.vz = a.nz * a.sp * 0.55;
    if (bs.wave2 > 0) {
      bs.wave2 -= a.dt;
      if (bs.wave2 <= 0) crownRainWave(e, a, bs.rainSeed + 2.1);
    }
    if (bs.t <= 0) crownRest(e);
  }

  // BODY LANGUAGE, so every state reads before the floor does: the squat is
  // the rush, raised arms are something coming DOWN, and the plates - the
  // old shell - now open over the body for the nova and for nothing else.
  e.group.scale.y = bs.state === 'rushTell' ? 1 - 0.24 * (1 - Math.max(0, bs.t) / bs.tMax) : 1;
  const casting = bs.state === 'prisonCast' || bs.state === 'rainCast';
  bs.armK += ((casting ? 1 : 0) - bs.armK) * Math.min(1, a.dt * 7);
  e.crownArms[0].rotation.z = 0.26 + bs.armK * 0.95;
  e.crownArms[1].rotation.z = -0.26 - bs.armK * 0.95;
  if (e.shellParts) {
    const f = bs.state === 'novaTell' ? 1 - Math.max(0, bs.t) / bs.tMax : 0;
    for (let i = 0; i < e.shellParts.length; i++) {
      const m = e.shellParts[i];
      m.visible = f > 0;
      if (f > 0) {
        m.position.y = m.userData.oy + f * 0.22 * e.scale;
        m.rotation.y += a.dt * (1 + i * 0.3);
      }
    }
  }
}

const TYPES = {
  // The magma's mirror. It walks you down and freezes the floor behind it, and
  // the frost does no damage at all - it takes your legs, and hands whatever
  // else is in the wave a player who cannot leave.
  //
  // Slower and tougher than a magma because its trail is not a threat on its
  // own: a player can stand in frost all day. What it costs is the ability to
  // answer everything else, so the enemy laying it has to be the thing you are
  // trying to walk away from.
  rime: {
    head: { r: 0.3, y: 1.32 },
    hp: 58, speed: 2.5, damage: 8, value: 220, color: 0x63b3ff, eye: 0xd8f0ff,
    scale: 1.05, radius: 0.52, mass: 1,
    melee: { windup: 0.55, start: 1.5, hit: 2.2, cd: 1.4 },
    build: buildRime, ai: aiRime,
  },

  // ---- the rest of RIME ---------------------------------------------------
  //
  // Five types around one idea, and it is the opposite of EMBER's. Fire takes
  // the FLOOR; cold takes the PLAYER. Almost nothing here hurts much - a
  // hailer and a hoarfrost and a sleet deal no direct damage at all - and what
  // they do instead is make you slower, weaker and easier for the rest of the
  // wave to answer.
  //
  // WHICH IS WHY THE THEME NEEDS SOMETHING THAT PUNISHES BEING SLOW, or the
  // chill is just an annoying tint on the screen. That is the shard, and it is
  // the piece that makes the other four mean anything: everything else in RIME
  // freezes you, and the shard is what the freeze is FOR.
  //
  // THE SHARED SILHOUETTE IS THE SHELL. Every one of them is a dark core under
  // a crust of pale angular plate, and on two of them the crust is literally
  // the mechanic - a glacier's cracks off, a shard's is what it hides behind.
  // Read as flat black: hard straight edges and flat facets, where EMBER is
  // lumpen rock and RUST is bolted slab.

  // The reason to care about being chilled. It fires one lance at a target
  // that is fine and a THREE-ROUND BURST at one that is already slowed, so the
  // theme's own ground is what loads its gun.
  //
  // It carries no chill of its own, deliberately. A gunner that both froze you
  // and punished you for being frozen would be a closed loop with nothing for
  // the rest of the wave to do; this way a shard on its own is the weakest
  // gunner in the game and a shard standing behind a hailer is the reason you
  // do not walk through the ring.
  shard: {
    head: { r: 0.3, y: 1.52 },
    hp: 26, speed: 2.3, damage: 8, value: 230, color: 0x8fd4ff, eye: 0xe8f7ff,
    scale: 0.95, radius: 0.46, mass: 1,
    orbit: { dist: 14, band: 2, out: 0.8, in: -0.6, strafe: 0.45, flip: 2, flipVar: 2.5 },
    proj: {
      core: 0xe8f7ff, glow: 0x63b3ff, scale: 0.55,
      speed: [20, 0.35, 30], dmg: [7, 0.4, 16],
    },
    build: buildShard, ai: aiShard,
  },

  // THE SHELL IS THE FIGHT. The top sixty per cent of its bar is ice, and ice
  // takes less than half of what you put into it - so it is a long grind that
  // ends in an event: the crust SHATTERS at forty per cent and throws a nova
  // of frost out around wherever it happens to be standing.
  //
  // So it is a brute that punishes finishing the job at close range, the way
  // the husk does - and unlike the husk, it tells you exactly when. The crust
  // visibly cracks as it goes, which is the whole reason to build the enemy
  // this way rather than as a flat health bar: the player can see the event
  // coming and choose where to be for it.
  glacier: {
    head: { r: 0.32, y: 1.26 },
    hp: 165, speed: 1.5, damage: 15, value: 330, color: 0x5aa8e8, eye: 0xd8f0ff,
    scale: 1.4, radius: 0.6, mass: 2,
    melee: { windup: 0.8, start: 2.9, hit: 3.5, cd: 2.5 },
    // Only the crust is armoured, and it comes off for good. NOT DIRECTIONAL -
    // the ice covers the whole enemy, so a hit from behind is a hit on ice
    // exactly like a hit from the front - which means armorDefault has to be
    // the same function rather than a number: as a constant it kept halving
    // damage over time for the rest of the enemy's life, long after the crust
    // it was standing for had shattered.
    armor: (e) => (e.shellBroken ? 1 : GLACIER_SHELL_ARMOR),
    armorDefault: (e) => (e.shellBroken ? 1 : GLACIER_SHELL_ARMOR),
    build: buildGlacier, ai: aiGlacier,
  },

  // Ground denial that arrives as a RING rather than as a patch, which makes
  // it a different question from every other artillery in the game: a blight's
  // pool is somewhere not to stand and a hailer's ring is somewhere not to
  // CROSS. It lands around you rather than on you, so the mistake it punishes
  // is being in the open when it lands, and the answer is to pick your gap
  // before it does.
  //
  // No direct damage, exactly like the blight and the vitriol it stands beside
  // in the role. The frost does none either - what it costs is your legs.
  hailer: {
    head: { r: 0.3, y: 1.04 },
    hp: 44, speed: 1.9, damage: 0, value: 270, color: 0x7ec8f0, eye: 0xd8f0ff,
    scale: 1.1, radius: 0.54, mass: 1,
    orbit: { dist: 13, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    proj: { core: 0xd8f0ff, glow: 0x63b3ff, scale: 1.25 },
    build: buildHailer, ai: aiHailer,
  },

  // The bellows pointed the other way. A bellows makes the CROWD better; this
  // makes YOU worse - stand inside its field and everything you fire hits for
  // forty per cent less, for as long as you are in it and a moment after.
  //
  // It is the answer to "why is this taking so long", and that is the whole
  // design: a player who cannot find it experiences the wave as their gun
  // quietly not working, so the field is drawn on the floor at exactly the
  // radius it covers and the beam to the caster is drawn from inside it.
  //
  // WEAKNESS was in status.js from the day the status system shipped and
  // nothing in the game had ever applied it. This is what it was for.
  hoarfrost: {
    head: { r: 0.3, y: 1.12 },
    hp: 66, speed: 2.0, damage: 0, value: 350, color: 0xa9d8ef, eye: 0xe8f7ff,
    scale: 1.2, radius: 0.52, mass: 1,
    orbit: { dist: 11, band: 2, out: 0.7, in: -0.6, strafe: 0.3, flip: 2.2, flipVar: 2 },
    build: buildHoarfrost, ai: aiHoarfrost,
  },

  // Parks directly over your head and pours cold down onto the spot you are
  // standing on. No attack, no damage: it is a column that FOLLOWS, so the
  // only thing it costs is standing still, and the only thing it asks is that
  // you keep moving while you deal with the wave underneath it.
  //
  // The deliberate opposite of EMBER's ashwing, which commits to a straight
  // line it cannot steer. This one steers and nothing else - between them the
  // two air roles ask the two opposite questions, "be somewhere else by the
  // time it arrives" and "do not stop".
  sleet: {
    head: { r: 0.28, y: 0.08 },
    hp: 50, speed: 3.4, damage: 0, value: 300, color: 0xbfe6ff, eye: 0xe8f7ff,
    scale: 0.95, radius: 0.48, mass: 1,
    fly: { height: 5.0 },
    hitbox: { r: 0.6, y: 0.55 },
    build: buildSleet, ai: aiSleet,
  },

  // RIME's boss: the whole theme at boss scale, and the rotation's fastest
  // fight. Five telegraphed attacks on a shuffled bag that never repeats
  // itself, resting about a second between them - a fan of lances that swells
  // against a chilled player, a glacier rush down a drawn lane that freezes
  // the corridor behind it, a nova that answers hugging, a gapped ring of
  // icicles snapped shut around wherever you stand, and a rain of strikes
  // that re-leads you as you run. Touching it always costs.
  //
  // What it has instead of defence is all of that. There is no shell, no
  // armour and no extra bar: the difficulty curve of the fight is the clock
  // tightening - the rests shorten at half the bar and again at a quarter -
  // and the floor slowly becoming the theme's ground.
  palecrown: {
    head: { r: 0.42, y: 1.74 },
    hp: 3300, speed: 3.0, damage: 24, value: 6000, color: 0x8fd4ff, eye: 0xe8f7ff,
    scale: 2.8, radius: 1.7, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.82 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // Its lances are its own - a shard's made heavier. Speed has to stay
    // inside what a moving player can cross under.
    proj: { core: 0xe8f7ff, glow: 0x63b3ff, scale: 0.85, speed: [19, 0.35, 30], dmg: [8, 0.5, 18] },
    // NO melee block: the body IS the melee, through bossTouch in every state
    // - contact costs immediately rather than on a swing.
    build: buildPaleCrown, ai: aiPaleCrown,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
