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
  ENEMY_TYPES, SHARED_MATS, _blinkAt, aiMelee, eyes, geo, lump, orbit,
  partsFor, prism, releaseMarks, shard, slab, spike,
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

// A squat bolted-down box with one barrel. It must not read as anything else
// in the roster: nothing else in the game is a machine sitting on the floor,
// and the silhouette is low and wide on purpose so a live one is obvious from
// across the arena and a dead one leaves nothing to trip over.
// A spike of ice driven into the floor. It has to read as SCENERY THAT MATTERS
// from across the arena - the player is looking for three of these in a room
// that is actively freezing - so it is tall, bright, and shaped like nothing
// else in the game.
export function buildAnchor(e, g, s) {
  const P = partsFor(e, g, s);
  // Tall and narrow, driven in at a slight cant so it does not read as a
  // pillar the terrain generator put there.
  P('anchorSpire', spike(0.3, 1.9, 5), { y: 0.95, rz: 0.09, mat: SHARED_MATS.rimeIce });
  P('anchorBase', prism(0.44, 0.56, 0.22, 6), { y: 0.11 });
  // Smaller spurs around the foot, angled out - the splash where it went in.
  const spurGeo = spike(0.13, 0.6, 4);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    P('anchorSpur', spurGeo, {
      x: Math.cos(a) * 0.34, y: 0.3, z: Math.sin(a) * 0.34,
      rz: Math.cos(a) * -0.6, rx: Math.sin(a) * 0.6, mat: SHARED_MATS.rimeIce,
    });
  }
  // THE LIGHT INSIDE IT, and the only part that is not ice: it is what tells
  // the player this is a target and not a rock, and it dies with the anchor.
  P('anchorHeart', shard(0.2), { y: 0.86, mat: e.eyeMat, shadow: false });
}

// RIME's boss: the theme's crust language at boss scale, plus the one thing no
// ordinary RIME enemy has - a shell that closes over the WHOLE body. Held on
// the enemy so aiPaleCrown can raise and drop it, the same way the Forge's
// shutters are held.
export function buildPaleCrown(e, g, s) {
  const P = partsFor(e, g, s);
  // A tall narrow core: it should look like something that has been ENCASED
  // rather than something that is naturally this big, so the body under the
  // shell is visibly slighter than the silhouette the shell gives it.
  P('crownBody', prism(0.4, 0.52, 1.2, 5), { y: 0.72 });
  P('crownChest', shard(0.34), { y: 1.24, z: -0.16 });
  P('crownHead', spike(0.24, 0.5, 5), { y: 1.72 });
  P('crownArm', slab(0.2, 0.86, 0.2), { x: -0.62, y: 1.0, rz: 0.26 });
  P('crownArm', slab(0.2, 0.86, 0.2), { x: 0.62, y: 1.0, rz: -0.26 });
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

  // THE SHELL. Big plates closing over everything, hidden until it raises one.
  // Collected so the ai can show and hide the whole set in a frame - like the
  // glacier's crust, and for the same reason: the moment it goes is an event
  // and must not be a fade.
  e.shellParts = [];
  const plate = (key, geo, o) => e.shellParts.push(P(key, geo, { ...o, mat: SHARED_MATS.rimeIce }));
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
// Three shells, at the top of the bar and at two thirds and a third. Each one
// puts three anchors in the floor and takes nothing at all until they are
// broken - so the shell has no clock on it, and a player who finds them fast
// is paid in a longer window rather than the same window later.
export const CROWN_SHELLS = [1.0, 0.67, 0.34];

export const CROWN_ANCHORS = 3;

// Where they go: a ring around the ARENA rather than around the boss, so
// breaking them means crossing the room it is freezing rather than standing
// still and turning on the spot.
export const CROWN_ANCHOR_R = 14;

// The volley it throws while the shell is up. It is not helpless in there and
// it must not be - a shell the player can simply walk away from would make the
// anchors optional.
export const CROWN_VOLLEY_CD = 3.2;

export const CROWN_VOLLEY_N = 5;

export const CROWN_VOLLEY_SPREAD = 0.17;

// How hard the room freezes while it is shelled, per shell. The floor filling
// up is the pressure that stops the anchor hunt from being a stroll.
export const CROWN_FROST_CD = 1.5;

export const CROWN_FROST_R = 12;

export const _crownAt = new THREE.Vector3();

// An anchor does nothing at all. It stands there and it is shot, and the only
// thing it needs to do is BE FOUND - so it pulses on the beat, which makes it
// catch the eye across a room without needing a marker over it.
export function aiAnchor(e, a) {
  a.vx = 0;
  a.vz = 0;
  if (a.ctx.pulse !== e._lastPulse) {
    e._lastPulse = a.ctx.pulse;
    e.flash = Math.max(e.flash, 0.12);
  }
}

export function aiPaleCrown(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'open';
    bs.tier = 0;
    bs.shelled = false;
    bs.anchors = [];
    bs.volleyCd = CROWN_VOLLEY_CD;
    bs.frostCd = CROWN_FROST_CD;
    bs.ventNote = 'SHELLED';
  }

  // ---- raising a shell ----------------------------------------------------
  // Checked before anything else: crossing a threshold interrupts whatever it
  // was doing, which is what makes the fight alternate rather than blend.
  if (!bs.shelled && bs.tier < CROWN_SHELLS.length
      && e.hp <= e.maxHp * CROWN_SHELLS[bs.tier]) {
    bs.tier++;
    bs.shelled = true;
    bs.anchors.length = 0;
    if (e.shellParts) {
      for (const m of e.shellParts) m.visible = true;
    }
    // The anchors go in around the ARENA, spun off a random bearing so the
    // same three corners are not the answer every time.
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < CROWN_ANCHORS; i++) {
      const ang = off + (i / CROWN_ANCHORS) * Math.PI * 2;
      const ax = Math.max(-19, Math.min(19, Math.cos(ang) * CROWN_ANCHOR_R));
      const az = Math.max(-19, Math.min(19, Math.sin(ang) * CROWN_ANCHOR_R));
      const spawned = ctx.addAnchor && ctx.addAnchor(ax, az);
      if (spawned) bs.anchors.push(spawned);
    }
    // A shell with no anchors under it would be a wall with no door. Should
    // the spawn ever fail - the enemy cap, most likely - it comes straight
    // back down rather than locking the fight.
    if (!bs.anchors.length) bs.shelled = false;
    e.weakOpen = false;
    bs.weakOpen = bs.shelled;
    if (ctx.effects) {
      _crownAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.shockwave(_crownAt, 0x8fd4ff, 6, 0.4);
    }
    if (ctx.sfx) ctx.sfx.impact();
    ctx.bossEvent('vent', e);
  }

  // ---- shelled ------------------------------------------------------------
  if (bs.shelled) {
    // Down the moment the last anchor goes. Checked every frame rather than on
    // a kill hook, so it cannot be missed if two die in the same frame.
    let alive = 0;
    for (const an of bs.anchors) {
      if (an && !an.dead) alive++;
    }
    if (alive === 0) {
      bs.shelled = false;
      bs.weakOpen = false;
      if (e.shellParts) {
        for (const m of e.shellParts) m.visible = false;
      }
      // The shell coming off is the reward and it is loud about it.
      if (ctx.effects) {
        _crownAt.set(e.pos.x, 1.2, e.pos.z);
        ctx.effects.shockwave(_crownAt, 0xe8f7ff, 9, 0.5);
        ctx.effects.burst(_crownAt, 0xe8f7ff, 34, 7, 2, 0.8);
      }
      if (ctx.sfx) ctx.sfx.impact();
      ctx.bossEvent('vent', e);
    } else {
      // It keeps walking and keeps swinging. A shell is not a cutscene.
      aiMelee(e, a);
      bs.volleyCd -= a.dt;
      if (bs.volleyCd <= 0 && a.dist < 30) {
        bs.volleyCd = CROWN_VOLLEY_CD * e.rate;
        for (let i = 0; i < CROWN_VOLLEY_N; i++) {
          ctx.addProjectile(
            e.pos.x, 1.7, e.pos.z, 'shard', 1,
            (i - (CROWN_VOLLEY_N - 1) / 2) * CROWN_VOLLEY_SPREAD
          );
        }
      }
      // And the room ices over underneath it, harder with each shell - so the
      // anchor hunt gets more expensive the deeper into the fight it happens.
      bs.frostCd -= a.dt;
      if (bs.frostCd <= 0) {
        bs.frostCd = CROWN_FROST_CD / bs.tier;
        const ang = Math.random() * Math.PI * 2;
        const rr = Math.sqrt(Math.random()) * CROWN_FROST_R;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * rr, e.pos.z + Math.sin(ang) * rr,
          SLEET_PATCH_RADIUS, SLEET_PATCH_LIFE * 1.6, 0, 'hail'
        );
      }
      return;
    }
  }

  // ---- open ---------------------------------------------------------------
  // Ordinary boss behaviour, and the only time it can be hurt. It closes and
  // swings and throws the same volley, so the window is a fight rather than a
  // free damage phase.
  aiMelee(e, a);
  bs.volleyCd -= a.dt;
  if (bs.volleyCd <= 0 && a.dist < 30) {
    bs.volleyCd = CROWN_VOLLEY_CD * 1.3 * e.rate;
    for (let i = 0; i < CROWN_VOLLEY_N; i++) {
      ctx.addProjectile(
        e.pos.x, 1.7, e.pos.z, 'shard', 1,
        (i - (CROWN_VOLLEY_N - 1) / 2) * CROWN_VOLLEY_SPREAD
      );
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
    hp: 50, speed: 3.4, damage: 0, value: 300, color: 0xbfe6ff, eye: 0xe8f7ff,
    scale: 0.95, radius: 0.48, mass: 1,
    fly: { height: 5.0 },
    hitbox: { r: 0.6, y: 0.55 },
    build: buildSleet, ai: aiSleet,
  },

  // THE PALE CROWN'S ANCHORS. Not a wave spawn - nothing rolls one and
  // pickAddType will never return it, exactly like Colossus's turret.
  //
  // WHAT IT IS FOR. The Crown spends most of its fight inside a shell that
  // nothing can touch, and these are the way in: three of them go into the
  // floor when the shell goes up, and breaking all three is what brings it
  // down. So the boss is never a damage sponge with a timer on it - the shell
  // lasts exactly as long as it takes the player to find and break three
  // things, which is a fight about the ROOM rather than about the boss.
  //
  // Deliberately soft, like the turret, and for the opposite reason: a turret
  // is a thing you may choose to ignore, and an anchor is the only thing worth
  // shooting while it stands. Neither should be a second boss.
  anchor: {
    hp: 150, speed: 0, damage: 0, value: 90, color: 0x8fd4ff, eye: 0xe8f7ff,
    scale: 1.2, radius: 0.5, mass: 6,
    hitbox: { r: 0.6, y: 0.8 },
    // It is a spike of ice driven into the floor: nothing knocks it over,
    // nothing frightens it, and slowing or freezing something that never moves
    // means nothing.
    statusMul: 0.5, fearMode: 'stagger', entropyExempt: true,
    build: buildAnchor, ai: aiAnchor,
  },

  // RIME's boss, and the one fight in the rotation that is not about the boss.
  //
  // It spends most of itself inside a SHELL that takes nothing at all, and the
  // way in is never the boss: three anchors go into the floor with the shell,
  // and breaking all three is what brings it down. So the fight alternates
  // between two completely different jobs - clear the room, then burn the
  // window - and the shell has no timer on it, which means a player who finds
  // the anchors fast is rewarded with a longer window rather than the same one
  // later.
  //
  // Three shells, at the top of the bar and at two thirds and a third of it,
  // each with the arena a little more frozen than the last. While shelled it
  // still walks and still swings, so hiding from it is not a plan.
  palecrown: {
    hp: 3300, speed: 2.5, damage: 24, value: 6000, color: 0x8fd4ff, eye: 0xe8f7ff,
    scale: 2.8, radius: 1.7, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.82 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.65, start: 3.0, hit: 3.8, cd: 1.9 },
    // NOTHING gets through the shell. Unlike every other armour in the game
    // this is a hard zero rather than a fraction, and it has to be: the whole
    // fight is built on the player looking somewhere else while it is up, and
    // a shell that leaked even a little would make chipping the boss the
    // correct play and the anchors optional scenery.
    armor: (e) => (e.bs.shelled ? 0 : 1),
    // THE SAME FUNCTION, not the shelled constant. As a plain 0 this made the
    // Crown immune to fire, poison and every blast in the game for the entire
    // fight - shell up or down - because damage with no direction never
    // consults armor() at all. The shell is a state, so both have to read it.
    armorDefault: (e) => (e.bs.shelled ? 0 : 1),
    build: buildPaleCrown, ai: aiPaleCrown,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
