// SOLAR's six enemies and its boss.
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
  resolveCircle, pointInObstacle,
} from '../utils.js';
import {
  ENEMY_TYPES, SHARED_MATS, _bossAt, aiMelee, aiShrike, bossTouch, eyes, geo,
  orbit, partsFor, prism, shard, slab, spike,
} from './shared.js';

// The only tripod in the game, and the tallest thin thing in it. Read: it is
// set up, a long way off, and pointed at you.
export function buildSniper(e, g, s) {
  const P = partsFor(e, g, s);
  P('sniperTorso', prism(0.15, 0.21, 0.5, 5), { y: 1.12 });
  P('sniperHead', slab(0.22, 0.15, 0.28), { y: 1.46 });
  // Three legs splayed off a hub. Splaying by rotating each one outward along
  // its own bearing is what keeps this readable from any angle.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    P('sniperLeg', prism(0.03, 0.055, 1.0, 4), {
      x: Math.cos(a) * 0.19, y: 0.5, z: Math.sin(a) * 0.19,
      rz: -Math.cos(a) * 0.32, rx: Math.sin(a) * 0.32,
    });
  }
  P('sniperBarrel', prism(0.045, 0.055, 1.0, 6), {
    y: 1.46, z: -0.66, rx: Math.PI / 2, mat: SHARED_MATS.sniperBarrel,
  });
  P('sniperScope', slab(0.1, 0.11, 0.22), { y: 1.6, z: -0.16, mat: SHARED_MATS.sniperScope });
  eyes(P, { y: 1.47, x: 0.07, z: -0.15, r: 0.7, mat: e.eyeMat });
}

// A thrown spear with wings. Longer than it is tall - the only model in the
// roster that is - and every line on it points forward.
export function buildShrike(e, g, s) {
  const P = partsFor(e, g, s);
  // Fuselage laid along its own line of travel, narrow end forward. rx of
  // -PI/2 puts the prism's TOP radius at -z, which is why the small number is
  // first: the nose is the thin end.
  P('shrikeBody', prism(0.13, 0.28, 0.8, 5), { y: 1.0, z: 0.06, rx: -Math.PI / 2 });
  // The spear. This is the entire enemy in one part: it has no other attack,
  // and it kills by arriving.
  P('shrikeBeak', spike(0.1, 0.42, 4), {
    y: 1.0, z: -0.52, rx: -Math.PI / 2, mat: SHARED_MATS.shrikeEdge,
  });
  // Swept UP and FORWARD - a stoop, held. Against the harrier's droop this is
  // the one silhouette difference readable from directly underneath.
  P('shrikeWing', slab(0.72, 0.045, 0.28), { x: -0.44, y: 1.12, z: 0.12, rz: -0.28, ry: -0.36 });
  P('shrikeWing', slab(0.72, 0.045, 0.28), { x: 0.44, y: 1.12, z: 0.12, rz: 0.28, ry: 0.36 });
  P('shrikeFin', slab(0.05, 0.32, 0.28), { y: 1.18, z: 0.42 });
  P('shrikeBarb', spike(0.05, 0.24, 4), { x: -0.14, y: 0.94, z: 0.52, rx: Math.PI / 2 });
  P('shrikeBarb', spike(0.05, 0.24, 4), { x: 0.14, y: 0.94, z: 0.52, rx: Math.PI / 2 });
  // Lit belly, the shared airborne read - a thin strip here rather than the
  // harrier's plate, because this one is narrow everywhere.
  P('shrikeBelly', slab(0.1, 0.05, 0.5), {
    y: 0.86, z: -0.02, mat: SHARED_MATS.harrierGlow, shadow: false,
  });
  // Eyes set back along the head, big and close together. Red on a near-white
  // body: the one warm thing on it, and what the player tracks in a dive.
  eyes(P, { y: 1.08, x: 0.09, z: -0.28, r: 1.15, mat: e.eyeMat });
}

// ---- the air roster ------------------------------------------------------

// A thin runner behind a flat disc of a mask. Almost no body at all: it is a
// mask with legs, which is exactly what should be arriving at speed.
export function buildZealot(e, g, s) {
  const P = partsFor(e, g, s);
  // THE MASK. Wide, flat and tipped forward, and it is the whole head - so a
  // zealot at any distance is a disc coming at you.
  P('zealMask', prism(0.34, 0.34, 0.08, 8), { y: 1.24, z: -0.16, rx: 1.35 });
  e.zealCore = P('zealCore', shard(0.1), {
    y: 1.24, z: -0.24, mat: e.eyeMat, shadow: false,
  });
  // A thin body leaning hard forward, and arms swept BACK - the only pose in
  // the roster that reads as sprinting rather than as walking.
  P('zealTorso', prism(0.14, 0.2, 0.62, 5), { y: 0.86, z: 0.04, rx: -0.35 });
  P('zealArm', slab(0.06, 0.06, 0.46), { x: -0.22, y: 0.9, z: 0.22, rx: -0.5 });
  P('zealArm', slab(0.06, 0.06, 0.46), { x: 0.22, y: 0.9, z: 0.22, rx: -0.5 });
  P('zealLeg', slab(0.08, 0.52, 0.09), { x: -0.12, y: 0.26, rx: 0.3 });
  P('zealLeg', slab(0.08, 0.52, 0.09), { x: 0.12, y: 0.26, rx: -0.3 });
  // A short banner off the back, so it has a direction even head-on.
  P('zealBanner', slab(0.06, 0.5, 0.16), { y: 1.0, z: 0.26, rx: 0.3 });
}

// A wall with legs. The plate is enormous and stood well off the body, because
// the whole enemy is a decision about whether to shoot at it - and a plate the
// player has to look for is a decision they will not know they are making.
export function buildAegis(e, g, s) {
  const P = partsFor(e, g, s);
  // THE MIRROR. Held out in front on one arm, and wide enough to hide most of
  // the body behind it. Kept on the enemy: the reflect test reads its world
  // position every hit, so the model and the hitbox can never disagree about
  // where the plate is - the same contract the Bulwark's buckler keeps.
  e.plateMesh = P('aegisPlate', prism(0.52, 0.58, 0.09, 6), {
    y: 0.9, z: -0.62, rx: Math.PI / 2, mat: SHARED_MATS.bulwarkShield,
  });
  // A boss on the front of it, bright: the one thing that says MIRROR rather
  // than SHIELD, and the point the reflection visibly comes off.
  e.plateBoss = P('aegisBoss', shard(0.15), {
    y: 0.9, z: -0.72, mat: e.eyeMat, shadow: false,
  });
  P('aegisArm', slab(0.13, 0.13, 0.4), { y: 0.9, z: -0.36 });
  // A narrow body behind it, and a head that stands clear ABOVE the plate -
  // the obvious full-damage target, and it should look like one.
  P('aegisTorso', prism(0.24, 0.34, 0.62, 6), { y: 0.72, z: 0.1 });
  P('aegisHead', prism(0.14, 0.18, 0.24, 6), { y: 1.2, z: 0.02 });
  P('aegisCrest', spike(0.1, 0.3, 4), { y: 1.44, z: 0.04 });
  P('aegisLeg', slab(0.16, 0.34, 0.18), { x: -0.2, y: 0.17, z: 0.1 });
  P('aegisLeg', slab(0.16, 0.34, 0.18), { x: 0.2, y: 0.17, z: 0.1 });
  eyes(P, { y: 1.22, x: 0.08, z: -0.12, r: 0.75, mat: e.eyeMat });
}

// A tripod carrying a solid disc in a frame, angled down at the floor. It has
// to read as something AIMED at the ground rather than at the player.
export function buildLens(e, g, s) {
  const P = partsFor(e, g, s);
  // The disc, tipped forward and down. Solid - the halo's ring is the open
  // one, and the two must not be confused in a wave that has both.
  // BIGGER, AND TIPPED LESS. At 0.4 across and tipped most of the way to
  // horizontal it foreshortened into the column from any bearing but head-on
  // and the enemy read as a blob - which is fatal for the one type in the
  // theme the player has to identify at eighteen metres. It is half a metre
  // across now and tipped only part way, so it presents a broad face from the
  // side as well as from the front and still obviously points at the floor.
  e.lensDisc = P('lensDisc', prism(0.52, 0.52, 0.08, 8), { y: 1.22, z: -0.3, rx: 0.62 });
  e.lensCore = P('lensCore', shard(0.14), {
    y: 1.12, z: -0.42, mat: e.eyeMat, shadow: false,
  });
  // A frame around it, held WIDE, so the disc is carried rather than growing
  // out of the body - and so the outline is broad at the top whichever way it
  // is turned.
  P('lensFrameL', slab(0.06, 0.62, 0.06), { x: -0.46, y: 1.06, z: -0.24, rz: 0.34 });
  P('lensFrameR', slab(0.06, 0.62, 0.06), { x: 0.46, y: 1.06, z: -0.24, rz: -0.34 });
  P('lensYoke', slab(0.9, 0.06, 0.06), { y: 0.82, z: -0.18 });
  // A THIN column and three splayed legs. It stands still to work, and it
  // should look like a thing that was put down rather than one that walks -
  // and a narrow one is what lets the disc overhang.
  P('lensColumn', slab(0.11, 0.62, 0.11), { y: 0.6 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.5;
    P('lensLeg', slab(0.06, 0.6, 0.06), {
      x: Math.cos(ang) * 0.22, y: 0.3, z: Math.sin(ang) * 0.22,
      rz: Math.cos(ang) * -0.5, rx: Math.sin(ang) * 0.5,
    });
  }
  eyes(P, { y: 0.86, x: 0.09, z: -0.16, r: 0.7, mat: e.eyeMat });
}

// A thin pole with an open RING floating clear above it. The ring is not
// touching anything, which is the one thing that separates it at a glance from
// the lens's disc in a frame.
export function buildHalo(e, g, s) {
  const P = partsFor(e, g, s);
  // THE RING, built as eight bars around an empty middle rather than as a
  // torus - the hole has to survive the silhouette, and it is what names it.
  const bar = slab(0.19, 0.05, 0.07);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    e.haloRing = P('haloBar', bar, {
      x: Math.cos(ang) * 0.4, y: 1.74, z: Math.sin(ang) * 0.4,
      ry: -ang + Math.PI / 2, rx: 0.14,
    });
  }
  // NOTHING BETWEEN THE RING AND THE HEAD. The gap is the tell.
  P('haloHead', prism(0.13, 0.17, 0.24, 6), { y: 1.32 });
  P('haloBody', prism(0.2, 0.28, 0.72, 6), { y: 0.78 });
  // Two thin arms held out and open, palms up - it is not carrying a weapon
  // and it should be obvious that it is not.
  P('haloArm', slab(0.06, 0.06, 0.38), { x: -0.3, y: 0.96, rz: 0.4, ry: 0.5 });
  P('haloArm', slab(0.06, 0.06, 0.38), { x: 0.3, y: 0.96, rz: -0.4, ry: -0.5 });
  P('haloLeg', slab(0.09, 0.44, 0.1), { x: -0.13, y: 0.22 });
  P('haloLeg', slab(0.09, 0.44, 0.1), { x: 0.13, y: 0.22 });
  // One eye, dead centre, and no pair: a device that watches, like the
  // capacitor's - the two supports that take the player's information rather
  // than hurting them look at them the same way.
  P('haloEye', shard(0.09), { y: 1.34, z: -0.14, mat: e.eyeMat, shadow: false });

  // THE FIELD, at exactly the radius it works at. Built the way the
  // hoarfrost's and the warden's are - at world size on the group, so it does
  // not inherit the model scale P() has baked into every other part - because
  // this enemy takes the crosshair away and a player who cannot see where that
  // starts and stops is playing a game that has broken rather than one that is
  // doing something to them.
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xffe9a8, transparent: true, opacity: 0.35,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  e._extraMats.push(ringMat);
  const ring = new THREE.Mesh(
    geo('haloField', () => new THREE.RingGeometry(HALO_RANGE - 0.26, HALO_RANGE, 56)),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  // Eighteen metres across; a ring that size cartwheeling off a corpse does
  // not read as a death. Same exemption the warden's and the hoarfrost's take.
  ring.userData.noCorpse = true;
  g.add(ring);
  e.ringMat = ringMat;
}

// ---- bosses --------------------------------------------------------------
// Built from the same primitives as everything else, at a much larger `scale`,
// plus the one part that carries the fight's mechanic. A boss silhouette has
// to be legible at the distance the arena is fought across, so these lean on
// overall proportion rather than on detail that would vanish.

// Tall, robed and crowned - the only thing in the roster with a skirt, and the
// tallest silhouette in the game. Read: this is the last one.
export function buildHerald(e, g, s) {
  const P = partsFor(e, g, s);
  // The robe has to MEET the torso. As a plain cone it tapered to a point
  // well under the body and the two read as separate objects stacked in the
  // air; a truncated cone keeps the silhouette one continuous figure.
  P('heraldRobe', prism(0.3, 0.62, 0.92, 6), { y: 0.46 });
  P('heraldTorso', prism(0.24, 0.32, 0.56, 6), { y: 1.14 });
  P('heraldShoulder', slab(0.26, 0.14, 0.3), { x: -0.3, y: 1.34, rz: 0.4 });
  P('heraldShoulder', slab(0.26, 0.14, 0.3), { x: 0.3, y: 1.34, rz: -0.4 });
  P('heraldHead', shard(0.19), { y: 1.58 });
  const crownGeo = spike(0.09, 0.5, 4);
  for (let i = 0; i < 5; i++) {
    const ang = (i / 5) * Math.PI * 2;
    P('heraldSpire', crownGeo, {
      x: Math.cos(ang) * 0.3, y: 1.72, z: Math.sin(ang) * 0.3,
    });
  }
  const halo = new THREE.Mesh(
    geo('heraldHalo', () => new THREE.TorusGeometry(0.5, 0.045, 6, 16)),
    SHARED_MATS.conduitRing
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.98 * s;
  halo.scale.setScalar(s);
  e.ringA = halo;
  g.add(halo);
  eyes(P, { y: 1.52, x: 0.09, z: -0.16, r: 0.9, mat: e.eyeMat });
}

export function aiSniper(e, a) {
  orbit(e, a, ENEMY_TYPES.sniper.orbit);
  if (e.attackCd <= 0 && a.dist < 35) {
    e.attackCd = 2.0 + Math.random() * 0.5;
    e.flash = 0.1;
    a.ctx.addProjectile(e.pos.x, 1.1, e.pos.z, 'sniper', e._projScale());
  }
}

export const _solarAt = new THREE.Vector3();

export const _solarTo = new THREE.Vector3();

// How far a zealot's flash reaches and how long it holds at point blank.
// SHORT. A second of white is already at the limit of what can be done to
// somebody without it reading as the game breaking, and the whole enemy is the
// decision about range rather than the length of the punishment.
export const ZEALOT_FLASH_R = 6.0;

export const ZEALOT_BLIND = 0.9;

// The plate's half-angle, what it costs to break, and what it reflects with.
// A wide arc, because the plate is the front of the enemy and a narrow one
// would make the mechanic a thing the player triggers by accident.
export const AEGIS_ARC = Math.cos(0.85);

// HITS, NOT HEALTH. The plate is worn down by the NUMBER of rounds that land
// on it rather than by their damage, which is what keeps the trade the same
// at every point in a run: a rifle magazine breaks it in eight shots at wave
// four and in eight shots at wave forty, and the player's answer is about
// ammunition and patience rather than about how big their numbers have got.
// It also means a shotgun shell breaks the whole plate in one trigger pull -
// and gets one round back for it, which is the trade that makes the shotgun
// the interesting choice against this enemy rather than the wrong one.
export const AEGIS_PLATE_HITS = 8;

export const _aegisTo = new THREE.Vector3();

export const _aegisFrom = new THREE.Vector3();

// Does this hit land on the mirror? Taken as DIRECTIONS FROM THE HITBOX CENTRE
// the way the Bulwark's buckler is, and for the same reason: shots land on the
// hitbox sphere rather than on the visible plate, so a test against the
// plate's own volume would never fire.
export function aegisReflect(e, dirX, dirZ, point) {
  // Initialised HERE rather than in the ai, because a pellet can land on the
  // frame it spawns and before its first ai() has ever run - and an undefined
  // plate compares false against everything, which would silently make the
  // first shot at every aegis in the game go straight through the mirror.
  if (e.plateHp === undefined) e.plateHp = AEGIS_PLATE_HITS;
  if (e.plateHp <= 0) return false;
  if (!e.plateMesh) return false;
  // The plate's bearing, in world space, from the model - so moving the plate
  // in build() moves the protected arc with it and the two cannot disagree.
  e.plateMesh.getWorldPosition(_aegisTo);
  e.hitbox.getWorldPosition(_aegisFrom);
  let px = _aegisTo.x - _aegisFrom.x;
  let pz = _aegisTo.z - _aegisFrom.z;
  const pm = Math.hypot(px, pz) || 1;
  px /= pm;
  pz /= pm;
  // WHICH SIDE THE SHOT CAME FROM, taken from the round's TRAVEL DIRECTION and
  // deliberately not from the impact point.
  //
  // The Bulwark's buckler uses the point, and it has to: its plate is a small
  // patch on a body and the question is where on that body the pellet landed.
  // A mirror is not a patch, it is a SIDE, and using the point here was
  // actively wrong - the player shoots from eye height at a hitbox centred
  // below it, so a centred shot enters near the top of the sphere where the
  // horizontal offset from the centre is almost nothing, and normalising that
  // near-zero vector produced a bearing that was mostly noise. Two shots in
  // three were being read as arriving from a random direction and passing
  // straight through a mirror the player was aiming squarely at.
  //
  // `point` stays in the signature because it is the shared armour-callback
  // shape and the Bulwark's does read it.
  const hx = -dirX;
  const hz = -dirZ;
  const hm = Math.hypot(hx, hz) || 1;
  return (hx / hm) * px + (hz / hm) * pz >= AEGIS_ARC;
}

export function aiAegis(e, a) {
  if (e.plateHp === undefined) e.plateHp = AEGIS_PLATE_HITS;
  aiMelee(e, a);
  // The boss on the plate dims as the plate goes, so how much mirror is left
  // is on the model. A plate that broke with no warning would make the enemy
  // read as having randomly stopped working.
  if (e.plateBoss) {
    const k = Math.max(0, e.plateHp) / AEGIS_PLATE_HITS;
    e.plateBoss.scale.setScalar((0.35 + k * 1.1) * e.scale);
  }
  if (e.plateMesh) e.plateMesh.visible = e.plateHp > 0;
}

// How fast the burning line walks, how far ahead of it the enemy lays fire,
// and how often. SLOW - it is outrun, never dodged, and a line that could be
// sidestepped would be a worse geode.
export const LENS_RANGE = 26;

export const LENS_STEP = 3.4;

export const LENS_PATCH_R = 1.5;

// A LONG TAIL, and it is what makes the line a line: each patch has to still
// be burning when the next fifteen have been laid, or what crosses the floor
// is a dot rather than a trail somebody is being walked ahead of.
export const LENS_PATCH_LIFE = 2.6;

export const LENS_PATCH_DPS = 16;

export const LENS_DROP = 0.16;

export function aiLens(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  orbit(e, a, ENEMY_TYPES.lens.orbit);
  if (!p) return;

  // The burning point, walked toward the player at a fixed speed. It is a
  // POSITION rather than a timer, which is what makes it outrunnable: a player
  // who keeps moving keeps the gap, and a player who stops loses it whatever
  // the clock says.
  if (e.lensX === undefined || a.dist > LENS_RANGE) {
    e.lensX = e.pos.x;
    e.lensZ = e.pos.z;
    e.lensDrop = 0;
    return;
  }
  let dx = p.pos.x - e.lensX;
  let dz = p.pos.z - e.lensZ;
  const d = Math.hypot(dx, dz) || 1;
  const stepLen = Math.min(d, LENS_STEP * a.dt);
  e.lensX += (dx / d) * stepLen;
  e.lensZ += (dz / d) * stepLen;

  if (e.lensCore) {
    e.lensCore.scale.setScalar((0.9 + Math.sin(ctx.time * 5) * 0.25) * e.scale);
  }
  if (ctx.effects) {
    // The beam from the lens to the burning point, every frame. Without it the
    // fire crossing the floor has no author and reads as the arena catching
    // light on its own.
    _solarAt.set(e.pos.x, 1.0, e.pos.z);
    _solarTo.set(e.lensX, 0.3, e.lensZ);
    ctx.effects.beam(_solarAt, _solarTo, 0xffd54f);
  }
  e.lensDrop -= a.dt;
  if (e.lensDrop > 0) return;
  e.lensDrop = LENS_DROP;
  ctx.addHazard(e.lensX, e.lensZ, LENS_PATCH_R, LENS_PATCH_LIFE, LENS_PATCH_DPS, 'glare');
}

// How far the field reaches. Short - shorter than any other support's - and it
// has to be: what it takes away is the middle of the screen, and a player who
// cannot tell where the edge of it is would simply be playing a broken game.
export const HALO_RANGE = 9;

export function aiHalo(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.halo.orbit);
  // The ring turns, so it never reads as scenery.
  e.group.rotation.y += a.dt * 0.9;
  const p = ctx.player;
  if (!p) return;
  const dx = p.pos.x - e.pos.x;
  const dz = p.pos.z - e.pos.z;
  const inside = dx * dx + dz * dz < HALO_RANGE * HALO_RANGE;
  // THE RING IS DRAWN AT EXACTLY THE RADIUS IT WORKS AT - a mesh on the enemy,
  // the same way the hoarfrost's is and for the same reason. A HUD that
  // silently stopped working with no visible cause would read as a bug rather
  // than as an enemy, and the circle on the floor is the whole difference.
  if (e.ringMat) e.ringMat.opacity = inside ? 0.85 : 0.35;
  if (inside && ctx.blindHud) ctx.blindHud();
  e._setEyeAlert(inside);
}

// ---- BRINE -----------------------------------------------------------------

// HERALD. Blink, volley, pools, and a one-way enrage under 30% that shortens
// every cooldown at once.
export const HERALD_POOL_CAP = 20;

export function aiHerald(e, a) {
  const bs = e.bs;
  if (bs.volleyCd === undefined) {
    bs.volleyCd = 2;
    bs.blinkCd = 4;
    bs.poolCd = 3;
    bs.enraged = false;
  }
  orbit(e, a, ENEMY_TYPES.herald.orbit);
  e.ringA.rotation.z += a.dt * (bs.enraged ? 4 : 1.8);
  // It has no melee of its own - it keeps its distance and shoots - so this is
  // the whole answer to a player who simply walks into it and stands there.
  bossTouch(e, a);
  if (e.status.fear > 0) return;

  // One way, once. The fight should get harder as it ends, not easier.
  if (!bs.enraged && e.hp <= e.maxHp * 0.3) {
    bs.enraged = true;
    e.rate *= 0.6;
    e.speed *= 1.25;
    e.bodyMat.emissiveIntensity = 0.8;
    a.ctx.bossEvent('enrage', e);
    _bossAt.set(e.pos.x, 1.4, e.pos.z);
    a.ctx.effects.burst(_bossAt, 0xffd54f, 40, 8, 3, 0.9);
    a.ctx.effects.addShake(0.35);
  }

  bs.blinkCd -= a.dt;
  if (bs.blinkCd <= 0) {
    bs.blinkCd = 5 * e.rate;
    // Re-placed on a ring around the player rather than anywhere: it should
    // keep changing the angle of the fight without ever landing on top of them.
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const rad = 10 + Math.random() * 4;
      const tx = a.ctx.player.pos.x + Math.cos(ang) * rad;
      const tz = a.ctx.player.pos.z + Math.sin(ang) * rad;
      const B = 21.6 - (e.radius - 0.5);
      _bossAt.set(tx, 0.5, tz);
      if (Math.abs(tx) > B || Math.abs(tz) > B) continue;
      if (pointInObstacle(_bossAt, a.ctx.obstacles)) continue;
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      a.ctx.effects.burst(_bossAt, 0xffd54f, 24, 6, 2, 0.6);
      e.pos.x = tx;
      e.pos.z = tz;
      resolveCircle(e.pos, e.radius, a.ctx.obstacles, e.collideH);
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      a.ctx.effects.burst(_bossAt, 0xffd54f, 24, 6, 2, 0.6);
      break;
    }
  }

  bs.volleyCd -= a.dt;
  if (bs.volleyCd <= 0 && a.dist < 26) {
    bs.volleyCd = 3 * e.rate;
    e.flash = 0.15;
    // Five of the forty enemy projectile slots; the other eight in the pool are
    // reserved for the player's own shards and can never be taken here.
    const shots = bs.enraged ? 7 : 5;
    for (let i = 0; i < shots; i++) {
      a.ctx.addProjectile(e.pos.x, 1.6, e.pos.z, 'shooter', e._projScale());
    }
  }

  bs.poolCd -= a.dt;
  if (bs.poolCd <= 0 && a.dist < 24) {
    bs.poolCd = 4.5 * e.rate;
    const p = a.ctx.player;
    for (let i = 0; i < 2; i++) {
      a.ctx.addHazard(
        p.pos.x + (Math.random() - 0.5) * 4,
        p.pos.z + (Math.random() - 0.5) * 4,
        3.0, 5, Math.min(HERALD_POOL_CAP, e.damage * 0.6)
      );
    }
  }
}

const TYPES = {
  sniper: {
    head: { r: 0.3, y: 1.47 },
    hp: 18, speed: 2.2, damage: 15, value: 200, color: 0xffd54f, eye: 0xfff3c4,
    scale: 0.9, radius: 0.5, mass: 1,
    orbit: { dist: 22, band: 2, out: 0.8, in: -0.5, strafe: 0.4, flip: 2, flipVar: 3 },
    proj: {
      core: 0xfff3c4, glow: 0xffd54f, scale: 0.5,
      speed: [22, 0.4, 32], dmg: [12, 0.5, 22],
    },
    build: buildSniper, ai: aiSniper,
  },

  // ---- SOLAR --------------------------------------------------------------
  //
  // The theme of LIGHT USED AGAINST YOU. Everything else in the game takes
  // health, ground or position; SOLAR takes the two things the player aims
  // with - their sight and their shots - and gives one of them back pointed
  // the wrong way.
  //
  // WHICH MAKES IT THE THEME THAT ATTACKS THE INTERFACE. A zealot takes the
  // screen, a halo takes the crosshair and the hit markers, an aegis takes the
  // magazine and returns it. It is deliberately last: three of its four need
  // machinery no other enemy in the game has, and all three of them are only
  // fair because they are LOUD - a blind that arrived quietly, or a reflection
  // the player could not see leaving, would be the game lying to them.
  //
  // THE SHARED SILHOUETTE IS THE PLATE AND THE HALO. Every body is a narrow
  // upright core wearing one large flat panel - a shield, a lens, a ring, a
  // mask - held out away from it. Where PLAGUE is splitting and BRINE hangs,
  // SOLAR is a thing CARRYING A MIRROR.

  // Sprints, and DETONATES IN A BLINDING FLASH when it dies. Killing it at
  // arm's length costs a second of sight; killing it across the room costs
  // nothing at all.
  //
  // So it is the only enemy in the game whose threat is a function of where
  // the PLAYER killed it, and the only one that punishes the shotgun for being
  // a shotgun. Weak in the hit for the afflictor's reason: what it does after
  // it dies is where its cost lives.
  zealot: {
    head: { r: 0.3, y: 1.18 },
    hp: 30, speed: 4.1, damage: 8, value: 230, color: 0xffd54f, eye: 0xfff3c4,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.32, start: 1.4, hit: 2.0, cd: 1.0 },
    onDeath: (e, ctx) => {
      // ONLY IF THE PLAYER IS CLOSE. A flash that reached across the arena
      // would make every zealot in a wave an unavoidable blind, and the whole
      // enemy is the decision about range.
      const p = ctx.player;
      if (!p) return;
      const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
      if (ctx.effects) {
        _solarAt.set(e.pos.x, 1.0, e.pos.z);
        ctx.effects.shockwave(_solarAt, 0xfff3c4, ZEALOT_FLASH_R, 0.35);
        ctx.effects.burst(_solarAt, 0xffd54f, 30, 7, 2, 0.7);
      }
      if (d > ZEALOT_FLASH_R || !ctx.blind) return;
      // Scaled by how close they were, so the edge of the radius is a
      // half-second squint and point blank is the full second.
      ctx.blind(ZEALOT_BLIND * (1 - d / ZEALOT_FLASH_R));
    },
    build: buildZealot, ai: aiMelee,
  },

  // A mirrored plate that REFLECTS what is fired into it, back at the player,
  // until the plate breaks.
  //
  // The Bulwark's armour pointed the other way, and the difference is what it
  // asks for. A bulwark says "aim somewhere else on this body"; an aegis says
  // "stop shooting, or be shot" - and the plate is not permanent, so the third
  // thing it says is "or spend the magazine and take the change". Every hit on
  // the plate wears it down, so a player who commits does get through; they
  // simply pay the front of their own gun for it.
  aegis: {
    head: { r: 0.32, y: 1.22 },
    hp: 172, speed: 1.5, damage: 21, value: 360, color: 0xe0b93c, eye: 0xfff3c4,
    scale: 1.4, radius: 0.64, mass: 3,
    melee: { windup: 0.75, start: 2.8, hit: 3.4, cd: 2.2 },
    // The plate is a FACING, exactly as the Bulwark's is, so armorDefault is a
    // constant and damage with no direction ignores it - burn and venom are
    // the patient answer to a mirror, and they should be.
    reflect: (e, dirX, dirZ, point) => aegisReflect(e, dirX, dirZ, point),
    proj: {
      core: 0xfff3c4, glow: 0xffd54f, scale: 0.55,
      speed: [20, 0.3, 28], dmg: [8, 0.4, 16],
    },
    build: buildAegis, ai: aiAegis,
  },

  // Stands still and burns a line across the floor toward the player - slowly,
  // and it never stops tracking.
  //
  // YOU OUTRUN IT, YOU DO NOT DODGE IT. Every other telegraph in the game is a
  // place to not be at a moment; this one is a place that is coming, forever,
  // at a speed that is beatable only by moving continuously. It is the exact
  // inverse of the geode, which punishes the player for moving in a pattern -
  // in a SOLAR wave the lens is the reason to keep moving and the halo is the
  // reason that is hard.
  lens: {
    head: { r: 0.3, y: 0.86 },
    hp: 42, speed: 1.75, damage: 0, value: 300, color: 0xf0c94a, eye: 0xfff3c4,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 18, band: 3, out: 0.6, in: -0.5, strafe: 0.25, flip: 3, flipVar: 2 },
    build: buildLens, ai: aiLens,
  },

  // No attack. It projects a field in which the player's CROSSHAIR AND HIT
  // MARKERS ARE GONE - the gun is unchanged, the cone is unchanged, and the
  // only thing taken away is knowing where the middle of the screen is and
  // whether anything landed.
  //
  // The purest expression of the theme, and the one enemy in the game that
  // does nothing to the world at all. It is positional, so leaving the field
  // answers it completely - and the field is drawn on the floor at exactly the
  // radius it works at, the way the hoarfrost's is, because a HUD that
  // silently stopped working with no visible cause would read as a bug.
  halo: {
    head: { r: 0.3, y: 1.32 },
    hp: 64, speed: 2.2, damage: 0, value: 350, color: 0xffe9a8, eye: 0xfff3c4,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.8, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildHalo, ai: aiHalo,
  },

  // Circles out of reach and then falls on you. No ranged attack at all: it
  // spends its whole life either winding up a dive, in one, or climbing back
  // out of one, and the climb is the counter - for a second and a half after
  // every attempt it is slow, low and travelling in a straight line away from
  // the player, which is the easiest shot either flier ever offers.
  //
  // The dive commits to the ground the player was standing on when it started,
  // NOT to the player, so it is dodged rather than tanked - the same contract
  // every telegraph in the game is written to. That is also what stops two
  // shrikes at once being an unavoidable hit: they both aim at a spot, and
  // moving beats both of them.
  shrike: {
    head: { r: 0.28, y: 1.08 },
    hp: 54, speed: 4.4, damage: 20, value: 300, color: 0xeef2ff, eye: 0xff5c7a,
    scale: 1.15, radius: 0.45, mass: 1,
    hitbox: { r: 0.55, y: 1.0 },
    fly: { height: 5.2 },
    orbit: { dist: 8, band: 2, out: 0.7, in: -0.7, strafe: 0.8, flip: 1.4, flipVar: 1.2 },
    build: buildShrike, ai: aiShrike,
  },

  // The capstone. Blinks, volleys and leaves pools - the three things the
  // earlier fights taught, arriving together - and drops its cooldowns when it
  // is nearly dead, so the last third is the hardest part of the fight rather
  // than the easiest.
  herald: {
    head: { r: 0.42, y: 1.52 },
    hp: 3400, speed: 2.8, damage: 20, value: 9000, color: 0xffd54f, eye: 0xfff8e1,
    scale: 2.6, radius: 1.5, mass: 6, boss: true,
    hitbox: { r: 0.72, y: 0.85 },
    statusMul: 0.25, freezeSlow: true, slowFactor: 0.8, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    orbit: { dist: 13, band: 2.5, out: 0.7, in: -0.8, strafe: 0.5, flip: 1.5, flipVar: 1.5 },
    build: buildHerald, ai: aiHerald,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
