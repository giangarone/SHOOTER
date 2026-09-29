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
  pointInObstacle,
} from '../utils.js';
import {
  ENEMY_TYPES, SHARED_MATS, _bossAt, addWarnedMortar, aiMelee, aiShrike,
  bossTouch, capturedShot, eyes, faceSnap, geo, markDrop, markGet, orbit,
  partsFor, prism, releaseMarks, segBlocked, shard, slab, snapAim, spike,
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
  // Kept on the enemy: the head swells during every ceremony, which is the
  // close-range tell that pairs with the floor telegraphs at distance.
  e.headMesh = P('heraldHead', shard(0.19), { y: 1.58 });
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

// ---- HERALD ----------------------------------------------------------------
// THE SUN, COME DOWN TO WITNESS. The old fight was a glowing pillar that
// blinked around you and threw health at you; the rework is the theme's own
// argument rehearsed at boss scale as six ceremonies, none of which let the
// player stand still:
//
//   spears   the crown throws fanned volleys WHILE THE BOSS KEEPS WALKING -
//            the fight's metronome, there is no lull in it
//   lance    a telegraphed lane, then a sunbeam that sweeps a hundred and
//            thirty degrees of the room. Beat it by circling, or by putting
//            a pillar between yourself and the light - it is light; cover works
//   corona   the halo is let go: gold rings rolling outward off the body,
//            jumped the way the ring's own edge says
//   flare    it rises and takes SIGHT - a white-out scaled by how close you
//            were standing. The zealot's lesson, given a wind-up
//   brands   an impact-marked ring of searing circles with ONE GAP in it,
//            each landing as burning ground - the lens's line, taught as a
//            place rather than a path
//   leap     the sun descends: a marked circle on the player, an arc through
//            the rig, a slam that scorches a cross into the floor where it
//            lands - and the boss has RELOCATED, which is what the fight is
//            mostly about
//
// Between ceremonies it does not pause, it PROCESSIONS: a fast walk in, or a
// wide fast circuit - and touching the body at any moment burns, because
// hugging the sun was never going to be free.

const HERALD_GOLD = 0xffd54f;
const HERALD_PALE = 0xfff3c4;

// The order it rehearses them in, so a player can LEARN the fight - the same
// loop every time - while the targets stay live, so learning the order is
// worth nothing without moving. Spears recur between every two ceremonies:
// that recurrence is the pressure.
const HERALD_ROUTINE = ['leap', 'spears', 'corona', 'lance', 'spears', 'brands', 'leap', 'flare'];

// The walk between ceremonies. Kept deliberately thin - the ceremonies are
// loud, so the silence between them is where the fight would go slack.
const HERALD_BREATH = 0.45;

// The procession: closer than the old orbit, tighter on the band, and far
// more sideways so the boss is never crossing the player's screen head-on.
const HERALD_ORBIT = { dist: 10, band: 2.2, out: 0.95, in: -0.9, strafe: 0.85, flip: 1.1, flipVar: 0.9 };

// SPEARS. Three pulses of three, fanned off a bearing snapped when the crown
// lit, the aim WALKING a little between pulses - a player who picked one
// direction and kept it has already dodged it; a player who froze inside the
// fan has not.
const SPEAR_TELL = 0.55;
const SPEAR_PULSES = 3;
const SPEAR_GAP = 0.26;
const SPEAR_FAN = 3;
const SPEAR_SPREAD = 0.14;
const SPEAR_STEP = 0.15;

// DAWN LANCE. Long enough to cross the room, wide enough to be a corridor
// rather than a thread, slow enough to read. The damage is a fast tick while
// you stand in the light, so brushing through the beam is cheap and walking
// along inside it is not.
const LANCE_LEN = 30;
const LANCE_TELL = 1.1;
const LANCE_TIME = 2.6;
const LANCE_SPAN = 2.3;
const LANCE_HALF = 1.15;
const LANCE_TICK = 0.22;

// CORONA. Ring speed, pad and jump height all rhyme with Maw's, on purpose:
// the player has already been taught what a rolling ring asks for, and the
// boss of the light theme should pay debts in the coin they know.
const CORONA_TELL = 0.75;
const CORONA_RINGS = 2;
const CORONA_GAP = 0.6;
const CORONA_SPEED = 9.6;
const CORONA_PAD = 0.85;
const CORONA_JUMP_Y = 0.6;

// ZENITH FLARE. The radius is generous and the white is short even at arm's
// length - it takes the ROOM away for a moment, never the player's hp, which
// is what keeps it a SOLAR effect rather than a health one.
const FLARE_TELL = 1.25;
const FLARE_R = 15;
const FLARE_BLIND = 0.85;

// BRANDS. Six marks around the player, one slot always left dark. The delay
// is the whole telegraph: walk out through the gap, or be standing in burning
// ground with the boss already walking at you.
const BRAND_TELL = 0.85;
const BRAND_N = 6;
const BRAND_R = 4.6;
const BRAND_HIT_R = 1.75;
const BRAND_DELAY = 1.05;

// ZENITH LEAP. The slam is small - it is a relocation that happens to land
// like a hammer, not a bomb. The burn cross it leaves is the real cost of
// standing where it came down.
const LEAP_TELL = 0.5;
const LEAP_SLAM_R = 3.6;
const LEAP_LIFT = 5.4;

// Scratch for the lance corridor and the leap.
const _lanceTo = new THREE.Vector3();

// What the halo is doing, per state - and, in a wind-up, per ceremony being
// wound. The halo is the fight's own instrument panel: it lowers to charge
// the lance, keeps low to loose the corona, swells and rises for the flare,
// gathers for the leap - the player reads WHICH ceremony is coming off the
// crown before the floor marks answer WHERE.
const HERALD_HALO = {
  stalk: { y: 1.98, s: 1.0, spin: 2.0 },
  recover: { y: 1.98, s: 1.0, spin: 2.0 },
  spears: { y: 2.06, s: 1.18, spin: 7.0 },
  lance: { y: 1.86, s: 0.72, spin: 10.0 },
  corona: { y: 1.3, s: 1.28, spin: 9.0 },
  flare: { y: 2.35, s: 1.6, spin: 3.0 },
  brands: { y: 2.2, s: 1.1, spin: 5.0 },
  leap: { y: 1.6, s: 0.75, spin: 5.0 },
  leapAir: { y: 1.98, s: 0.95, spin: 6.0 },
};

export function aiHerald(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  const p = ctx.player;
  if (bs.state === undefined) {
    bs.state = 'stalk';
    bs.t = 0.9;
    bs.turn = 0;
    bs.rings = [];
    bs.enraged = false;
    // A hand the suites can deal: set bs.next to force the next ceremony.
    // Nothing in the game writes it.
    bs.next = null;
    bs.haloY = 1.98 * e.scale;
    bs.haloS = e.scale;
  }
  bs.fx = ctx.effects;

  // THE HALO, eased toward whatever the current beat says, never snapped. In
  // a wind-up it is already dressed for the ceremony it is about to perform.
  {
    const look = HERALD_HALO[bs.state === 'windup' ? bs.attack : bs.state] || HERALD_HALO.stalk;
    const k = Math.min(1, a.dt * 8);
    bs.haloY += (look.y * e.scale - bs.haloY) * k;
    bs.haloS += (look.s * e.scale - bs.haloS) * k;
    e.ringA.position.y = bs.haloY;
    e.ringA.scale.setScalar(bs.haloS);
    e.ringA.rotation.z += a.dt * look.spin * (bs.enraged ? 1.6 : 1);
    // The head swells while a ceremony is being wound up - the close-range
    // tell, matched by the floor marks at distance.
    const swell = bs.state === 'windup' ? 1 + 0.22 * Math.sin(ctx.time * 12) : 1;
    e.headMesh.scale.setScalar(e.scale * swell);
  }

  // CORONA rings stay physical in every state, fear and wind-ups included -
  // they were let go, and what was let go obeys the room, not the boss.
  for (let i = bs.rings.length - 1; i >= 0; i--) {
    const r = bs.rings[i];
    r.r += CORONA_SPEED * a.dt;
    r.life -= a.dt;
    if (r.mark >= 0) ctx.effects.markSet(r.mark, r.x, r.z, r.r, HERALD_GOLD, 0.15);
    const pd = Math.hypot(p.pos.x - r.x, p.pos.z - r.z);
    if (!r.hit && Math.abs(pd - r.r) < CORONA_PAD && p.pos.y < CORONA_JUMP_Y) {
      r.hit = true;
      ctx.onHitPlayer(Math.min(24, e.damage * 1.05), p.pos, e);
    }
    if (r.life <= 0 || r.r > 25) {
      ctx.effects.markRelease(r.mark);
      bs.rings.splice(i, 1);
    }
  }

  // Hugging the sun burns, in ANY state, mid-ceremony or not: the one answer
  // to standing inside the body is paid at once, every time.
  bossTouch(e, a);

  if (e.status.fear > 0) return;

  // One way, once: under a third, every pause shortens and the sun walks
  // faster. The ceremonies are unchanged - the player learned them all fight;
  // they arrive closer together now, that is the whole difference.
  if (!bs.enraged && e.hp <= e.maxHp * 0.3) {
    bs.enraged = true;
    e.rate *= 0.6;
    e.speed *= 1.22;
    ctx.bossEvent('enrage', e);
    _bossAt.set(e.pos.x, 2.4, e.pos.z);
    ctx.effects.burst(_bossAt, HERALD_GOLD, 40, 8, 3, 0.9);
    ctx.effects.addShake(0.35);
  }
  const T = (s) => s * e.rate;

  // The wind-up is shared: a countdown, a facing, and each ceremony's own
  // telegraph drawn every frame it holds. What happens when it ENDS is per
  // ceremony and lives with that ceremony's exec below.
  if (bs.state === 'windup') {
    bs.t -= a.dt;
    const fill = 1 - Math.max(0, bs.t) / bs.windup;
    if (bs.attack === 'spears') {
      // The volley's tell is taken on the WALK, like the volley itself.
      faceSnap(e);
      orbit(e, a, HERALD_ORBIT);
    } else if (bs.attack === 'lance') {
      faceSnap(e);
      // The lane is drawn at FULL LENGTH from the first frame - the fill
      // says when, the corridor says where, and the sweep direction is the
      // crown's rotation once it fires.
      _heraldLanceMark(e, bs, fill, ctx.effects);
    } else if (bs.attack === 'flare') {
      // A circle around the BOSS at exactly the radius the white will reach:
      // the question the flare asks is "how close were you standing", so the
      // floor itself draws the tape measure.
      const mark = markGet(e, ctx.effects);
      e.fx.markSet(mark, e.pos.x, e.pos.z, FLARE_R, HERALD_PALE, fill * 0.85);
    } else if (bs.attack === 'leap') {
      const mark = markGet(e, ctx.effects);
      e.fx.markSet(mark, bs.tx, bs.tz, LEAP_SLAM_R, HERALD_GOLD, fill * 0.9);
    }
    if (bs.t <= 0) {
      if (bs.attack === 'spears') {
        bs.state = 'spears';
        bs.spears = (bs.enraged ? 4 : SPEAR_PULSES);
        bs.spearT = 0;
      } else if (bs.attack === 'lance') {
        bs.state = 'lance';
        bs.t = LANCE_TIME * (bs.enraged ? 0.8 : 1);
        bs.lanceTick = 0;
        markDrop(e);
      } else if (bs.attack === 'corona') {
        bs.state = 'corona';
        bs.coronaLeft = (bs.enraged ? 3 : CORONA_RINGS) - 1;
        bs.coronaT = CORONA_GAP;
        _heraldCoronaRing(e, a);
        ctx.sfx.impact();
      } else if (bs.attack === 'flare') {
        _heraldFlare(e, a);
        markDrop(e);
        _heraldRest(e, bs, T(0.35));
      } else if (bs.attack === 'brands') {
        _heraldBrands(e, a);
        _heraldRest(e, bs, T(0.7));
      } else if (bs.attack === 'leap') {
        // A long arc over dense geometry may have no clearance; shorten the
        // approach along the same bearing before giving the beat to the
        // metronome. The sun comes down SOMEWHERE near them, or it keeps
        // throwing light instead.
        let threwInstead = true;
        for (const f of [1, 0.6, 0.35]) {
          const jx = e.pos.x + (bs.tx - e.pos.x) * f;
          const jz = e.pos.z + (bs.tz - e.pos.z) * f;
          if (!e._startJump(jx, 0, jz, LEAP_LIFT, ctx)) continue;
          threwInstead = false;
          // The mark must land where the boss lands: redraw it on the accepted
          // spot, full, the instant the arc is committed.
          bs.tx = jx;
          bs.tz = jz;
          const mark = markGet(e, ctx.effects);
          e.fx.markSet(mark, bs.tx, bs.tz, LEAP_SLAM_R, HERALD_GOLD, 1);
          bs.state = 'leapAir';
          _bossAt.set(e.pos.x, 1.4, e.pos.z);
          ctx.effects.burst(_bossAt, HERALD_PALE, 26, 6, 3, 0.6);
          ctx.effects.shockwave(_bossAt, HERALD_GOLD, 2.2, 0.4);
          break;
        }
        if (threwInstead) {
          markDrop(e);
          snapAim(e, a, true);
          bs.state = 'spears';
          bs.spears = SPEAR_PULSES;
          bs.spearT = 0;
        }
      }
    }
    return;
  }

  // SPEARS: the moving volley. The only ceremony performed on the WALK -
  // the boss keeps its circuit and the crown throws, so there is no frame of
  // the fight in which relocating is safe and free.
  if (bs.state === 'spears') {
    faceSnap(e);
    orbit(e, a, HERALD_ORBIT);
    bs.spearT -= a.dt;
    if (bs.spearT <= 0) {
      bs.spearT = SPEAR_GAP;
      const k = SPEAR_PULSES - bs.spears;
      // The aim WALKED between pulses: the fan swings a touch across the
      // snapped bearing, so standing stock still in the dodge line is caught
      // by the next pulse - keep strafing, the way the fan was thrown to say.
      const heading = e.aim + (k - 1) * SPEAR_STEP * e.strafe;
      for (let f = 0; f < SPEAR_FAN; f++) {
        capturedShot(e, a, heading, (f - (SPEAR_FAN - 1) / 2) * SPEAR_SPREAD, 2.6);
      }
      _bossAt.set(e.pos.x, 2.6, e.pos.z);
      ctx.effects.burst(_bossAt, HERALD_PALE, 6, 3, 1.5, 0.3);
      if (--bs.spears <= 0) {
        e._setEyeAlert(false);
        _heraldRest(e, bs, T(0.9));
      }
    }
    return;
  }

  // DAWN LANCE: rooted, face locked to the live bearing, the beam redrawn
  // every frame and the floor mark travelling with it - the warning never
  // lags the light.
  if (bs.state === 'lance') {
    bs.t -= a.dt;
    const prog = 1 - Math.max(0, bs.t) / (LANCE_TIME * (bs.enraged ? 0.8 : 1));
    bs.bearing = bs.from + bs.dir * LANCE_SPAN * prog;
    e.nx = Math.cos(bs.bearing);
    e.nz = Math.sin(bs.bearing);
    faceSnap(e);
    _heraldLanceMark(e, bs, 0.9, ctx.effects);
    const bx = e.nx;
    const bz = e.nz;
    _bossAt.set(e.pos.x, 3.4, e.pos.z);
    _lanceTo.set(e.pos.x + bx * LANCE_LEN, 1.0, e.pos.z + bz * LANCE_LEN);
    ctx.effects.beam(_bossAt, _lanceTo, HERALD_PALE);
    bs.sparkT = (bs.sparkT || 0) - a.dt;
    if (bs.sparkT <= 0) {
      bs.sparkT = 0.2;
      ctx.effects.burst(_lanceTo, HERALD_GOLD, 4, 2, 1.5, 0.3);
    }
    // The corridor test, in plan view. Cover answers it: a pillar between the
    // crown and the player is a pillar between them and the SUN, and a beam
    // that ignored it would not be light.
    bs.lanceTick -= a.dt;
    if (bs.lanceTick <= 0) {
      const rx = p.pos.x - e.pos.x;
      const rz = p.pos.z - e.pos.z;
      const along = rx * bx + rz * bz;
      const perp = Math.abs(rx * -bz + rz * bx);
      if (along > 0.5 && along < LANCE_LEN && perp < LANCE_HALF + 0.4 &&
          Math.abs(p.pos.y) < 2.2 &&
          !segBlocked(e.pos.x, 3.4, e.pos.z, p.pos.x, p.pos.y + 0.8, p.pos.z, ctx.obstacles)) {
        bs.lanceTick = LANCE_TICK;
        ctx.onHitPlayer(Math.min(12, e.damage * 0.55), e.pos, e);
      }
    }
    if (bs.t <= 0) {
      markDrop(e);
      e._setEyeAlert(false);
      _heraldRest(e, bs, T(0.8));
    }
    return;
  }

  // CORONA: after the first ring, the boss is already walking - the rings it
  // let go belong to the room now. Getting distance from the place it stood
  // is part of the read.
  if (bs.state === 'corona') {
    orbit(e, a, HERALD_ORBIT);
    if (bs.coronaLeft > 0) {
      bs.coronaT -= a.dt;
      if (bs.coronaT <= 0) {
        bs.coronaT = CORONA_GAP;
        bs.coronaLeft--;
        _heraldCoronaRing(e, a);
      }
    } else {
      e._setEyeAlert(false);
      _heraldRest(e, bs, T(0.5));
    }
    return;
  }

  // The walk between ceremonies: IN if the player has run, around them if
  // they have not. Faster than the old drift, and never backward.
  if (bs.state === 'stalk') {
    if (a.dist > 13) {
      a.vx = a.px * a.sp;
      a.vz = a.pz * a.sp;
    } else {
      orbit(e, a, HERALD_ORBIT);
    }
    bs.t -= a.dt;
    if (bs.t > 0) return;
    const name = bs.next || HERALD_ROUTINE[bs.turn++ % HERALD_ROUTINE.length];
    bs.next = null;
    bs.attack = name;
    bs.state = 'windup';
    e._setEyeAlert(true);
    if (name === 'spears') {
      snapAim(e, a, true);
      // The spears' tell is the crown and the eyes alone - the volley is quick
      // and constant, so its warning rides on the body rather than the floor.
      bs.windup = T(SPEAR_TELL);
      bs.t = bs.windup;
      return;
    }
    if (name === 'lance') {
      snapAim(e, a);
      // The sweep begins just BESIDE the player's bearing and swings through
      // them: marginal at the edges, hottest across the middle, and always
      // the same about cover.
      bs.dir = Math.random() < 0.5 ? 1 : -1;
      bs.from = e.aim - bs.dir * LANCE_SPAN * 0.45;
      bs.bearing = bs.from;
      bs.windup = T(LANCE_TELL);
      bs.t = bs.windup;
      e.nx = Math.cos(bs.from);
      e.nz = Math.sin(bs.from);
      return;
    }
    if (name === 'leap') {
      // The sun does not descend on its own feet: under seven metres the
      // relocation the leap exists FOR is already delivered, and the arc
      // would be an in-place hop clipped by whatever hangs overhead. The
      // metronome answers instead.
      if (a.dist < 7) {
        snapAim(e, a, true);
        bs.attack = 'spears';
        bs.windup = T(SPEAR_TELL);
        bs.t = bs.windup;
        return;
      }
      // Committed at the TELL, not at the landing: the player's position plus
      // a single stride of lead, so the mark is where they were going and
      // a change of direction is the whole dodge.
      const B = 21.6 - (e.radius - 0.5) - 0.4;
      // Probed as a disc the SHAPE OF THE BOSS, not as a point: a landing
      // whose centre is clear but whose shoulders clip a crate aborts the arc
      // a body-length short of its own telegraph, which is the one thing a
      // telegraph is not allowed to do.
      const clearSpot = (x, z) => {
        for (const [ox, oz] of [[0, 0], [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8]]) {
          _lanceTo.set(x + ox, 0.5, z + oz);
          if (pointInObstacle(_lanceTo, ctx.obstacles)) return false;
        }
        return true;
      };
      let okSpot = false;
      for (let tries = 0; tries < 8 && !okSpot; tries++) {
        const lead = tries === 0 ? 1 : 0.4;
        bs.tx = Math.max(-B, Math.min(B,
          p.pos.x + p.vel.x * 0.35 * lead + (tries ? (Math.random() - 0.5) * 3 : 0)));
        bs.tz = Math.max(-B, Math.min(B,
          p.pos.z + p.vel.z * 0.35 * lead + (tries ? (Math.random() - 0.5) * 3 : 0)));
        okSpot = clearSpot(bs.tx, bs.tz);
      }
      if (!okSpot) {
        // Nowhere clean to come down - spend the beat on the metronome.
        snapAim(e, a, true);
        bs.attack = 'spears';
        bs.windup = T(SPEAR_TELL);
        bs.t = bs.windup;
        return;
      }
      e.nx = (bs.tx - e.pos.x) / Math.max(0.01, a.dist);
      e.nz = (bs.tz - e.pos.z) / Math.max(0.01, a.dist);
      bs.windup = T(LEAP_TELL);
      bs.t = bs.windup;
      return;
    }
    // corona, flare and brands share the bare ceremony: root, glow, count.
    bs.windup = T(name === 'corona' ? CORONA_TELL : name === 'flare' ? FLARE_TELL : BRAND_TELL);
    bs.t = bs.windup;
    return;
  }

  // ZENITH LEAP's landing. ai() is not called while the arc is in the air -
  // the jump machinery owns those frames - so this state only ever runs on
  // the frame the sun has actually come down.
  if (bs.state === 'leapAir') {
    markDrop(e);
    _bossAt.set(e.pos.x, 0.1, e.pos.z);
    ctx.effects.shockwave(_bossAt, HERALD_PALE, LEAP_SLAM_R, 0.45);
    ctx.effects.burst(_bossAt, HERALD_GOLD, 34, 8, 3, 0.7);
    ctx.effects.addShake(0.3);
    ctx.sfx.impact();
    if (a.dist < LEAP_SLAM_R && p.pos.y < 2.4) {
      ctx.onHitPlayer(
        Math.min(28, e.damage * 1.25) * (1 - 0.4 * a.dist / LEAP_SLAM_R), e.pos, e);
    }
    // The cross it burns into the floor as it lands. Ground the player was
    // going to stand on, taken - the brands' lesson, paid by the landing
    // rather than thrown.
    for (let k = 0; k < 4; k++) {
      const ang = k * Math.PI / 2 + Math.PI / 4;
      ctx.addHazard(
        e.pos.x + Math.cos(ang) * 3.1, e.pos.z + Math.sin(ang) * 3.1,
        1.5, 2.6, 12, 'glare');
    }
    _heraldRest(e, bs, T(0.75));
    return;
  }

  if (bs.state === 'recover') {
    orbit(e, a, HERALD_ORBIT);
    bs.t -= a.dt;
    if (bs.t <= 0) {
      bs.state = 'stalk';
      bs.t = T(HERALD_BREATH) * (bs.enraged ? 0.6 : 1);
    }
  }
}

function _heraldRest(e, bs, secs) {
  bs.state = 'recover';
  bs.t = secs;
  e._setEyeAlert(false);
}

// The lance's floor corridor, from the crown out. Lane-shaped rather than a
// disc: markSet's own long shape, used for exactly what it was drawn for.
// Takes the effects pool as an argument because e.fx is only ever populated
// BY markGet - the first ceremony of a fight may well be the lance.
function _heraldLanceMark(e, bs, fill, fx) {
  const mark = markGet(e, fx);
  const bx = Math.cos(bs.bearing);
  const bz = Math.sin(bs.bearing);
  fx.markSet(
    mark,
    e.pos.x + bx * (LANCE_LEN / 2), e.pos.z + bz * (LANCE_LEN / 2),
    LANCE_HALF, HERALD_GOLD, fill,
    (LANCE_LEN / 2) / LANCE_HALF,
    Math.atan2(-bx, -bz)
  );
}

// One ring let go from wherever the boss was standing at that INSTANT. Marks
// drawn by the ring belong to bs.rings, so releaseMarks takes them all back
// whenever the fight ends early.
function _heraldCoronaRing(e, a) {
  const mark = a.ctx.effects.markAcquire();
  _bossAt.set(e.pos.x, 0.2, e.pos.z);
  a.ctx.effects.burst(_bossAt, HERALD_GOLD, 22, 5, 1.8, 0.55);
  a.ctx.effects.shockwave(_bossAt, HERALD_PALE, 2.6, 0.4);
  a.ctx.effects.addShake(0.12);
  if (mark < 0) return;
  e.bs.rings.push({
    x: e.pos.x, z: e.pos.z, r: 1.8, life: 26 / CORONA_SPEED, hit: false, mark,
  });
}

// The white. Scaled by closeness and refused by cover - it is light, and
// light does not bend around a pillar.
function _heraldFlare(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  _bossAt.set(e.pos.x, 2.6, e.pos.z);
  ctx.effects.shockwave(_bossAt, HERALD_PALE, FLARE_R, 0.5);
  ctx.effects.burst(_bossAt, 0xffffff, 46, 10, 4, 0.8);
  ctx.effects.addShake(0.3);
  ctx.sfx.impact();
  const d = Math.hypot(p.pos.x - e.pos.x, p.pos.z - e.pos.z);
  if (d >= FLARE_R) return;
  if (segBlocked(e.pos.x, 4.2, e.pos.z, p.pos.x, p.pos.y + 0.8, p.pos.z, ctx.obstacles)) return;
  const s = FLARE_BLIND * (1 - d / FLARE_R) * (e.bs.enraged ? 1.15 : 1);
  if (s > 0.12 && ctx.blind) ctx.blind(s);
}

// The ring of judgement: BRAND_N marks around the player, one dark - the gap
// is the exit, and it is drawn into the pattern rather than found. Delays
// ripple around the circle so the detonation reads as a closing fan, not a
// single snapshot.
function _heraldBrands(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  const dmg = Math.min(20, e.damage * 0.9);
  const gap = (Math.random() * BRAND_N) | 0;
  // Searing ground where each lands: the lens's own glare, so the colour of
  // the patch is one the player has already been taught to step out of.
  const ground = { kind: 'glare', radius: BRAND_HIT_R, life: 3.2, dps: 13 };
  let laid = 0;
  for (let i = 0; i < BRAND_N; i++) {
    if (i === gap) continue;
    const ang = (i / BRAND_N) * Math.PI * 2;
    if (addWarnedMortar(
      ctx, p.pos.x + Math.cos(ang) * BRAND_R, p.pos.z + Math.sin(ang) * BRAND_R,
      BRAND_HIT_R, BRAND_DELAY + laid * 0.09, dmg, ground)) laid++;
  }
  // Enraged, the middle burns too - the gap in the RING stays, always: more
  // heat, never a closed trap.
  if (e.bs.enraged) {
    addWarnedMortar(ctx, p.pos.x, p.pos.z, BRAND_HIT_R, BRAND_DELAY * 1.35, dmg, ground);
  }
  _bossAt.set(e.pos.x, 2.6, e.pos.z);
  ctx.effects.burst(_bossAt, HERALD_GOLD, 20, 5, 2.5, 0.5);
}

export function heraldCleanup(e) {
  markDrop(e);
  releaseMarks(e);
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

  // The capstone: the sun come down to witness. Six ceremonies in a fixed
  // order - a leap that relocates it onto the player, volleys thrown on the
  // walk, a jumpable corona, a sweeping sunbeam that only cover answers, a
  // sight-taking flare, and a ring of burning brands - with the walk between
  // them kept deliberately short, and the last third of the bar arriving
  // closer together rather than harder to read.
  //
  // The `proj` block is the spears'. It is on the type for the same reason
  // every gunner's is: the projectile system reads the look and the curve
  // from here, and a ceremony is no place for a special case.
  herald: {
    head: { r: 0.42, y: 1.52 },
    hp: 3400, speed: 3.6, damage: 20, value: 9000, color: 0xffd54f, eye: 0xfff8e1,
    scale: 2.6, radius: 1.5, mass: 6, boss: true,
    hitbox: { r: 0.72, y: 0.85 },
    statusMul: 0.25, freezeSlow: true, slowFactor: 0.8, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    proj: {
      core: 0xfff3c4, glow: 0xffd54f, scale: 0.62,
      speed: [25, 0.35, 32], dmg: [10, 0.45, 18],
    },
    build: buildHerald, ai: aiHerald, cleanup: heraldCleanup,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
