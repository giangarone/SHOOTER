// RUST's six enemies and its boss.
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
  BOSS_REACH_Y, ENEMY_TYPES, SHARED_MATS, _blinkAt, _bossAt, _reachY,
  aiMelee, bossTouch, eyes, geo, lump, orbit, partsFor, prism, releaseMarks,
  shard, slab, spike,
} from './shared.js';

// Conduit's aura, read in takeDamage and _effSpeed. Kept modest: the point of
// a support unit is that it makes a crowd worth re-prioritising, not that it
// makes one unkillable.
export const CONDUIT_RESIST = 0.7;

export const CONDUIT_SPEED = 1.15;

// How far the aura reaches, and how many links it draws. The beam pool is
// eight deep and shared, so a conduit in a packed crowd shows a sample of what
// it is buffing rather than every last one.
export const CONDUIT_RANGE = 7;

export const CONDUIT_LINKS = 4;

// Leaning forward from the ankles up, and the only thing in the roster with a
// snout. Read: it is already coming at you.
export function buildChaser(e, g, s) {
  const P = partsFor(e, g, s);
  // FLATTENED FRONT TO BACK and only four sided. A six sided prism at this
  // size is a circle from the player's eye, which is what made the old roster
  // read as blobs; the wedge is what gives it a front.
  P('chaserTorso', prism(0.34, 0.16, 0.62, 4), {
    y: 0.92, z: -0.04, rx: -0.3, ry: Math.PI / 4, sz: 0.62,
  });
  // Neck, so the head is a separate mass instead of the top of the torso.
  P('chaserNeck', prism(0.08, 0.1, 0.16, 4), { y: 1.2, z: -0.18, rx: -0.5 });
  // The snout has to PROJECT PAST the torso outline or it is not in the
  // silhouette at all. It runs well forward of the body and sits low.
  P('chaserSkull', spike(0.15, 0.52, 4), { y: 1.24, z: -0.42, rx: -Math.PI / 2, ry: Math.PI / 4 });
  P('chaserJaw', spike(0.1, 0.34, 4), { y: 1.11, z: -0.4, rx: -Math.PI / 2, ry: Math.PI / 4 });
  // Two spines swept back off the shoulders. They break the top of the outline,
  // which is the part of a silhouette the player sees first.
  P('chaserSpine', spike(0.05, 0.42, 4), { x: -0.17, y: 1.28, z: 0.16, rx: 0.9 });
  P('chaserSpine', spike(0.05, 0.42, 4), { x: 0.17, y: 1.28, z: 0.16, rx: 0.9 });
  // Long enough to leave real air under the body. Short stubs read as no legs.
  P('chaserThigh', slab(0.11, 0.44, 0.13), { x: -0.16, y: 0.55, z: 0.08, rx: 0.35 });
  P('chaserThigh', slab(0.11, 0.44, 0.13), { x: 0.16, y: 0.55, z: 0.08, rx: 0.35 });
  P('chaserShin', slab(0.09, 0.42, 0.1), { x: -0.16, y: 0.21, z: -0.02, rx: -0.2 });
  P('chaserShin', slab(0.09, 0.42, 0.1), { x: 0.16, y: 0.21, z: -0.02, rx: -0.2 });
  eyes(P, { y: 1.3, x: 0.1, z: -0.32, r: 0.85, mat: e.eyeMat });
}

// Upright and still, with all of its mass on one side: the arm cannon is the
// silhouette. Read: it is standing off and shooting.
export function buildShooter(e, g, s) {
  const P = partsFor(e, g, s);
  // Narrow, upright and flat: a thin plate of a body, so the cannon is what
  // has width. Standing straight is the read - it is not closing on you.
  P('shooterTorso', prism(0.3, 0.18, 0.7, 4), { y: 1.0, ry: Math.PI / 4, sz: 0.5 });
  // Head on a visible neck and much smaller than the torso, so the two do not
  // merge into one lump at distance.
  P('shooterNeck', prism(0.07, 0.07, 0.14, 4), { y: 1.4 });
  P('shooterHead', shard(0.15), { y: 1.56, sz: 0.7 });
  // THE CANNON IS THE SILHOUETTE. It hangs well outboard and reaches forward
  // past the body, so the outline is lopsided from every angle.
  P('shooterMount', slab(0.2, 0.2, 0.22), { x: 0.36, y: 1.12 });
  P('shooterBarrel', prism(0.1, 0.14, 0.8, 6), {
    x: 0.36, y: 1.12, z: -0.42, rx: -Math.PI / 2, mat: SHARED_MATS.gunmetal,
  });
  P('shooterVent', slab(0.26, 0.1, 0.16), { x: 0.36, y: 1.28, z: -0.1, mat: SHARED_MATS.gunmetal });
  // The other arm is a thin rod, which is what makes the cannon side read as
  // heavy rather than just as detail.
  P('shooterArm', slab(0.07, 0.5, 0.07), { x: -0.3, y: 1.02 });
  P('shooterLeg', slab(0.1, 0.62, 0.1), { x: -0.14, y: 0.32 });
  P('shooterLeg', slab(0.1, 0.62, 0.1), { x: 0.14, y: 0.32 });
  eyes(P, { y: 1.58, x: 0.08, z: -0.13, r: 0.75, mat: e.eyeMat });
}

// An inverted trapezoid: everything is up top. Read: hitting it will not move
// it, and getting hit by it will.
export function buildTank(e, g, s) {
  const P = partsFor(e, g, s);
  // THE HEAVY, REBUILT. The first pass was four boxes and a pair of 0.07 eye
  // shards buried in the shadow between the pauldrons - at the range this
  // enemy is actually fought at it read as a crate with legs, and players
  // reported it as having no face at all, which for the type the whole brute
  // role is named after is the worst failure a model in this roster can have.
  //
  // So it is rebuilt around three reads, in the order the eye picks them up:
  // a HUNCHED, top-heavy mass on stubby splayed legs (it soaks, it does not
  // chase), a burning FURNACE in the chest that says which way it is facing
  // from across the arena, and a wide lit VISOR with real eyes in it, carried
  // FORWARD of the shoulder cowls instead of sunk behind them.
  P('tankFoot', slab(0.32, 0.12, 0.42), { x: -0.27, y: 0.06 });
  P('tankFoot', slab(0.32, 0.12, 0.42), { x: 0.27, y: 0.06 });
  // Short and splayed. A brute with legs it could run on would be lying, the
  // same rule bulwark is built to.
  P('tankLeg', prism(0.17, 0.23, 0.42, 5), { x: -0.27, y: 0.33, rz: 0.1 });
  P('tankLeg', prism(0.17, 0.23, 0.42, 5), { x: 0.27, y: 0.33, rz: -0.1 });
  // Narrow waist under a wide chest: the taper is what makes it read as
  // top-heavy rather than as a box.
  P('tankWaist', prism(0.3, 0.21, 0.22, 6), { y: 0.63 });
  // Flattened front to back for the same reason the chaser's torso is - a
  // six-sided prism at full depth is a cylinder from the player's eye.
  P('tankTorso', prism(0.54, 0.33, 0.58, 6), { y: 0.94, sz: 0.72 });
  // The furnace, recessed into the chest with a plate hooding it.
  P('tankFurnace', prism(0.16, 0.16, 0.1, 6), {
    y: 0.85, z: -0.31, rx: Math.PI / 2, mat: SHARED_MATS.tankFurnace, shadow: false,
  });
  // Brow bar over the furnace, and kept LOW: it used to sit at head height,
  // where it hid the visor behind it - which is the exact bug this whole model
  // exists to fix.
  P('tankPlate', slab(0.72, 0.12, 0.14), { y: 1.02, z: -0.24, mat: SHARED_MATS.tankPlate });
  // Shoulder cowls, angled outward and sitting ABOVE the head so the
  // silhouette peaks at the shoulders and dips in the middle - the hunch.
  P('tankPauldron', prism(0.2, 0.34, 0.36, 5), { x: -0.5, y: 1.14, rz: 0.32 });
  P('tankPauldron', prism(0.2, 0.34, 0.36, 5), { x: 0.5, y: 1.14, rz: -0.32 });
  P('tankSpike', spike(0.09, 0.24, 4), { x: -0.55, y: 1.4, rz: 0.32, mat: SHARED_MATS.tankPlate });
  P('tankSpike', spike(0.09, 0.24, 4), { x: 0.55, y: 1.4, rz: -0.32, mat: SHARED_MATS.tankPlate });
  // Exhaust stacks on its back, so the model has a BACK - the one angle the
  // old tank was completely mute from.
  P('tankStack', prism(0.06, 0.09, 0.3, 5), { x: -0.19, y: 1.28, z: 0.2, mat: SHARED_MATS.gunmetal });
  P('tankStack', prism(0.06, 0.09, 0.3, 5), { x: 0.19, y: 1.28, z: 0.2, mat: SHARED_MATS.gunmetal });
  // Head, jutting FORWARD out of the cowls rather than hiding between them.
  P('tankHead', prism(0.19, 0.26, 0.26, 5), { y: 1.2, z: -0.16 });
  // The visor. One wide lit bar on e.eyeMat, so it blinks and goes alert with
  // the eyes and is legible as a face at any range the fight happens at.
  P('tankVisor', slab(0.36, 0.09, 0.07), {
    y: 1.21, z: -0.36, mat: e.eyeMat, shadow: false,
  });
  // And the eyes themselves, set into the visor and 25% over roster size -
  // this is the biggest head in the early roster and they should look it.
  eyes(P, { y: 1.21, x: 0.12, z: -0.41, r: 1.25, mat: e.eyeMat });
}

// A pear: all of the mass low, a small head on top, stubby legs under a belly
// full of ordnance. Read: slow, and carrying something.
export function buildBomber(e, g, s) {
  const P = partsFor(e, g, s);
  // Bomber, blight and magma are the three heavy-set types, and the first pass
  // had all three reading as the same round lump. What separates them is where
  // the mass SITS: the bomber's belly is carried HIGH on long thin legs, the
  // blight's is dumped flat on the floor, and the magma's is stacked upward.
  P('bomberBelly', lump(0.44), { y: 0.82, sy: 0.92, sz: 0.86 });
  // A pinched neck, so the head is not just the top of the belly.
  P('bomberNeck', prism(0.08, 0.1, 0.14, 4), { y: 1.22 });
  P('bomberHead', shard(0.15), { y: 1.36, sy: 0.8 });
  // Long, thin and splayed. The air under the belly is half the silhouette.
  P('bomberLeg', slab(0.08, 0.68, 0.09), { x: -0.24, y: 0.34, rz: 0.16 });
  P('bomberLeg', slab(0.08, 0.68, 0.09), { x: 0.24, y: 0.34, rz: -0.16 });
  P('bomberFoot', slab(0.16, 0.08, 0.2), { x: -0.29, y: 0.04 });
  P('bomberFoot', slab(0.16, 0.08, 0.2), { x: 0.29, y: 0.04 });
  // The rack stands proud of the back so the load is in the outline, not
  // buried in it - a bomber seen from behind should still read as carrying.
  for (let i = 0; i < 3; i++) {
    const up = i === 1 ? 0.14 : 0;
    P('bomberShell', lump(0.14), {
      x: (i - 1) * 0.22, y: 1.02 + up, z: 0.42, mat: SHARED_MATS.bomberShell,
    });
    P('bomberPin', prism(0.02, 0.02, 0.16, 4), {
      x: (i - 1) * 0.22, y: 1.18 + up, z: 0.42, mat: SHARED_MATS.bomberPin, shadow: false,
    });
  }
  eyes(P, { y: 1.38, x: 0.08, z: -0.15, r: 0.8, mat: e.eyeMat });
}

export function buildConduit(e, g, s) {
  const P = partsFor(e, g, s);
  P('conduitCore', shard(0.32), { y: 1.0 });
  P('conduitCap', spike(0.22, 0.32, 6), { y: 1.42 });
  P('conduitKeel', spike(0.26, 0.46, 6), { y: 0.48, rx: Math.PI });
  // Two rings on different axes, spun in update. A support unit has to look
  // like a machine doing something rather than another soldier.
  const ringGeo = geo('conduitRing', () => new THREE.TorusGeometry(0.36, 0.035, 6, 14));
  const r1 = new THREE.Mesh(ringGeo, SHARED_MATS.conduitRing);
  r1.position.y = 1.0 * s;
  r1.scale.setScalar(s);
  const r2 = new THREE.Mesh(ringGeo, SHARED_MATS.conduitRing);
  r2.position.y = 1.0 * s;
  r2.scale.setScalar(s);
  r2.rotation.y = Math.PI / 2;
  e.ringA = r1;
  e.ringB = r2;
  g.add(r1, r2);
}

// A gun platform that happens to hover. Flat, four-way symmetrical, and built
// around the pod slung underneath it - the part it has to come down to use.
export function buildHarrier(e, g, s) {
  const P = partsFor(e, g, s);
  // Hull: a squashed hex disc. Wide and thin, so from below - which is where
  // the player sees it from - it is a broad plate rather than a dot.
  P('harrierHull', prism(0.36, 0.24, 0.26, 6), { y: 1.0, sz: 0.82 });
  P('harrierSpine', spike(0.1, 0.28, 4), { y: 1.26 });
  // Wings droop. A dihedral DOWN reads as settled weight hanging off a hover,
  // the opposite of the shrike's raised sweep.
  P('harrierWing', slab(0.66, 0.05, 0.22), { x: -0.46, y: 1.02, rz: 0.3, ry: 0.22 });
  P('harrierWing', slab(0.66, 0.05, 0.22), { x: 0.46, y: 1.02, rz: -0.3, ry: -0.22 });
  P('harrierTip', shard(0.06), { x: -0.76, y: 0.9, mat: e.eyeMat, shadow: false });
  P('harrierTip', shard(0.06), { x: 0.76, y: 0.9, mat: e.eyeMat, shadow: false });
  // The gun pod, hung under the hull and pointing forward. The player learns
  // this shape as "the bit that is about to be pointed at me".
  P('harrierPod', prism(0.09, 0.11, 0.4, 5), {
    y: 0.84, z: -0.08, rx: -Math.PI / 2, mat: SHARED_MATS.gunmetal,
  });
  // Thruster plate on the belly - the hover read, and the only part still lit
  // while the enemy is at station with its eyes shut.
  P('harrierThruster', prism(0.16, 0.11, 0.07, 6), {
    y: 0.84, z: 0.12, mat: SHARED_MATS.harrierGlow, shadow: false,
  });
  // One big forward lens over the standard pair: a sensor head, not a face.
  P('harrierLens', shard(0.11), { y: 1.0, z: -0.3, mat: e.eyeMat, shadow: false });
  eyes(P, { y: 1.08, x: 0.12, z: -0.22, r: 0.85, mat: e.eyeMat });
}

// HARRIER. Two altitudes and a timer between them.
//
// HIGH is where it lives: at station it orbits at fifteen metres, does nothing
// at all, and takes HARRIER_HIGH_ARMOR of what it is shot with (see the type's
// armor()). LOW is the only place it can shoot from, and the only place it can
// properly be shot. Nothing else about it needs explaining, which is the point
// - a flier the player cannot reason about is just an annoyance in the sky.
//
// It commits: once the burst starts it finishes, so a player who begins
// punishing the descent is not left firing at something that changed its mind.
export const HARRIER_HIGH = 5.0;

export const HARRIER_LOW = 2.1;

export const HARRIER_HIGH_ARMOR = 0.2;

export const HARRIER_BURST = 3;

export const HARRIER_SHOT_GAP = 0.26;

export const HARRIER_CD = 3.4;

// Dropping is faster than climbing back. The descent should look like a
// decision and the climb like a retreat, and the extra half second at the
// bottom is the window the whole enemy is built around.
export const HARRIER_DROP_RATE = 6;

export const HARRIER_RISE_RATE = 2.6;

export function aiHarrier(e, a) {
  orbit(e, a, ENEMY_TYPES.harrier.orbit);
  if (e.hCd === undefined) {
    // Staggered at birth, so a pair that arrived together does not dive on the
    // same frame for the rest of the wave.
    e.hCd = 1.2 + Math.random() * 2.2;
    e.hLeft = 0;
    e.hGap = 0;
  }

  if (e.hLeft > 0) {
    e.hoverY = HARRIER_LOW;
    e.flyRate = HARRIER_DROP_RATE;
    e._setEyeAlert(true);
    // Only once it has actually ARRIVED. Firing on the way down would make the
    // descent a threat rather than an opening, which is the opposite of what
    // it is for.
    if (e.pos.y < HARRIER_LOW + 0.7) {
      e.hGap -= a.dt;
      if (e.hGap <= 0) {
        e.hGap = HARRIER_SHOT_GAP;
        e.hLeft--;
        a.ctx.addProjectile(e.pos.x, e.pos.y + 0.9, e.pos.z, 'harrier', 1, 0);
        _blinkAt.set(e.pos.x, e.pos.y + 0.85, e.pos.z);
        a.ctx.effects.burst(_blinkAt, 0x27c4ff, 7, 3, 1, 0.3);
        if (e.hLeft <= 0) {
          e.hCd = HARRIER_CD * e.rate;
          e._setEyeAlert(false);
        }
      }
    }
    return;
  }

  e.hoverY = HARRIER_HIGH;
  e.flyRate = HARRIER_RISE_RATE;
  e.hCd -= a.dt;
  // Range-gated on the way in, like the colossus vent: one at the far wall
  // plinking at a player who has already disengaged is noise.
  if (e.hCd <= 0 && a.dist < 24) {
    e.hLeft = HARRIER_BURST;
    e.hGap = 0.3;
  }
}

// How long the chest core stays shut and how long it stays open, in seconds.
// The old travelling plate gave a player who kept repositioning roughly half
// the fight at full damage, and this is tuned to land in the same place: the
// boss's health bar falls at the pace it always did, but the player is reading
// a rhythm instead of chasing a panel around a body they cannot see behind.
export const COLOSSUS_VENT_SHUT = 3.4;

export const COLOSSUS_VENT_OPEN = 2.6;

// Shutter travel, in UNIT model space: where each leaf sits closed, and how
// far out it slides. Closed at 0.26 the two leaves overlap over the core's
// centre line and cover its full 0.85 width with no seam.
export const COLOSSUS_SHUT_X = 0.26;

export const COLOSSUS_SHUT_TRAVEL = 0.46;

// Core brightness, shut and open. The shut value is deliberately not zero - a
// dark core would read as damage or as a hole rather than as something waiting
// to open. The open value is deliberately NOT higher: the renderer tone maps
// with ACES, which desaturates anything it has to clip, and at 2.2 the core
// came out a pale salmon against the boss's own amber room. Held at 1.2 it
// stays unmistakably RED, which is the entire point of the colour.
export const COLOSSUS_CORE_SHUT = 0.22;

export const COLOSSUS_CORE_OPEN = 1.2;

// VENT FIRE. The open core used to be free damage: the player learned the
// rhythm, walked in on the beat and unloaded, and the fight had nothing to say
// about it. It now fires while it is open, so the window that lets you hurt it
// is the window it can hurt you and standing still in front of the chest stops
// being the answer. Three rounds in a narrow fan, on a cadence slower than the
// window is long, so an opening is two or three volleys and never a stream.
export const COLOSSUS_VENT_SHOT_CD = 0.65;

export const COLOSSUS_VENT_FAN = 0.13;

export function buildTurret(e, g, s) {
  const P = partsFor(e, g, s);
  P('turretBase', prism(0.46, 0.58, 0.22, 6), { y: 0.11 });
  P('turretBody', prism(0.34, 0.42, 0.42, 6), { y: 0.44 });
  // The barrel is the tell. It is held on the enemy so aiTurret can pitch it
  // and kick it back on every shot - a turret that fires without moving reads
  // as scenery that happens to be shooting.
  e.barrel = P('turretBarrel', prism(0.09, 0.11, 0.72, 6), { y: 0.62, z: -0.34, rx: Math.PI / 2 });
  // Where the barrel sits at rest. Kept because partsFor() has already
  // multiplied the offset by the model scale, and the recoil in aiTurret has
  // to return it to that number rather than to the one written above.
  e.barrelRest = e.barrel.position.z;
  e.barrelKick = 0.2 * s;
  // One eye, dead centre, so which way it is pointing is never in doubt.
  P('turretEye', shard(0.11), { y: 0.66, z: -0.2, mat: e.eyeMat, shadow: false });
}

export function buildColossus(e, g, s) {
  const P = partsFor(e, g, s);
  P('colossusTorso', prism(0.6, 0.4, 0.86, 6), { y: 0.88 });
  P('colossusPauldron', slab(0.46, 0.5, 0.46), { x: -0.52, y: 1.08 });
  P('colossusPauldron', slab(0.46, 0.5, 0.46), { x: 0.52, y: 1.08 });
  P('colossusHead', slab(0.3, 0.24, 0.28), { y: 1.16, z: -0.16 });
  P('colossusLeg', slab(0.28, 0.5, 0.3), { x: -0.26, y: 0.25 });
  P('colossusLeg', slab(0.28, 0.5, 0.3), { x: 0.26, y: 0.25 });
  // Moved to the BACK. The chest is where the weak point lives now, and two
  // plates fighting for the same face read as one confusing lump of armour.
  P('colossusPlate', slab(0.8, 0.18, 0.14), { y: 0.96, z: 0.36, mat: SHARED_MATS.tankPlate });
  eyes(P, { y: 1.18, x: 0.1, z: -0.31, r: 1.1, mat: e.eyeMat });

  // THE WEAK POINT. Sunk into the chest, on the -z face every model in the
  // roster fronts with, so it is square-on to the player for the whole fight.
  // Its material is per-instance because it burns brighter as the shutters
  // open, so it is registered for disposal.
  const mat = new THREE.MeshStandardMaterial({
    // Nearly black BASE colour: the room's light is the boss's own amber and a
    // red-lit red surface would drift orange. All of the colour here is
    // emissive, which no light in the room can tint.
    color: 0x1e0402, emissive: 0xff1408, emissiveIntensity: COLOSSUS_CORE_SHUT,
    roughness: 0.35, metalness: 0.2,
  });
  e._extraMats.push(mat);
  // Big, and standing proud of the body. This is the single thing the player
  // has to find on a boss three metres wide, from across an arena, while being
  // charged at - a subtle glowing panel is the same as no mechanic at all. Red
  // because nothing else on this model is: the eyes and the charge lane are
  // amber, so red on the chest can only mean one thing.
  const core = new THREE.Mesh(
    geo('colossusCore', () => new THREE.BoxGeometry(0.85, 0.8, 0.22)),
    mat
  );
  // Set into the LOWER chest. Any higher and the shutters, which stand further
  // forward than the head does, cover the eyes - and the eyes going alert are
  // the telegraph for the charge, the one tell on this boss that must never be
  // hidden by another.
  core.position.set(0, 0.72 * s, -0.56 * s);
  core.scale.setScalar(s);
  g.add(core);

  // The shutters. Two armoured leaves that meet over the core and slide apart
  // to expose it; they are the TELL, and they are big and mechanical so the
  // player reads the window opening from across the room rather than having to
  // notice a glow change. Their closed positions overlap the core's edges, so
  // shut really does mean covered from every angle the fight is played at.
  const leafGeo = geo('colossusShutter', () => new THREE.BoxGeometry(0.54, 0.86, 0.16));
  const shutters = [];
  for (const sign of [-1, 1]) {
    const leaf = new THREE.Mesh(leafGeo, SHARED_MATS.tankPlate);
    leaf.position.set(sign * COLOSSUS_SHUT_X * s, 0.72 * s, -0.63 * s);
    leaf.scale.setScalar(s);
    leaf.castShadow = true;
    g.add(leaf);
    shutters.push({ mesh: leaf, sign });
  }

  e.bs.coreMat = mat;
  e.bs.coreMesh = core;
  e.bs.shutters = shutters;
  // The model scale, kept here because the shutters are positioned per frame
  // and Enemy itself does not carry its type's `scale`.
  e.bs.mScale = s;
  // Starts shut, so the fight opens with the player learning what closed looks
  // like before the first window arrives.
  e.bs.weakOpen = false;
  e.bs.ventT = COLOSSUS_VENT_SHUT;
  e.bs.vent = 0;
}

export function aiShooter(e, a) {
  orbit(e, a, ENEMY_TYPES.shooter.orbit);
  if (e.attackCd <= 0 && a.dist < 18) {
    e.attackCd = 1.6 + Math.random() * 0.6;
    e.flash = 0.12;
    a.ctx.addProjectile(e.pos.x, 0.95, e.pos.z, 'shooter', e._projScale());
  }
}

export function aiBomber(e, a) {
  orbit(e, a, ENEMY_TYPES.bomber.orbit);
  if (e.attackCd <= 0 && a.dist < 16) {
    e.attackCd = 2.5 + Math.random() * 0.8;
    e.flash = 0.15;
    a.ctx.addGrenade(e.pos.x, 1.2, e.pos.z, e.damage);
  }
}

export function aiConduit(e, a) {
  orbit(e, a, ENEMY_TYPES.conduit.orbit);
  e.ringA.rotation.z += a.dt * 1.6;
  e.ringB.rotation.x += a.dt * 1.2;

  let drawn = 0;
  for (const o of a.ctx.enemies) {
    // Bosses are excluded deliberately. A conduit parked next to one would add
    // 43% to that fight's length for free, and the player would have no way to
    // read where the extra health was coming from.
    if (o === e || o.dead || o.boss || o.type === 'conduit') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > CONDUIT_RANGE * CONDUIT_RANGE) continue;
    // Refreshed, never accumulated: it lapses on its own a fraction of a
    // second after this conduit stops running, which is what makes killing one
    // feel immediate.
    o.buffT = 0.2;
    if (drawn++ < CONDUIT_LINKS && a.ctx.effects) a.ctx.effects.beam(e.pos, o.pos, 0x00e5b0);
  }
}

// BODY CONTACT, AND EVERY BOSS HAS IT.
//
// A boss the size of a truck that a player can stand inside is not a boss, it
// is scenery with a health bar - and standing inside one is the safest place
// in the arena for exactly the fights that have no melee of their own. Siege
// and Schism already charge for it through the shared melee cycle; Maw has its
// own hug tax. This is the same rule for the two that had nothing - Colossus,
// which only ever hit through its charge and its slam, and Herald, which could
// be walked into all fight for free.
//
// It is deliberately NOT a swing: no windup, no telegraph, no animation. The
// boss is not attacking, the player is standing on it, and the only thing that
// bounds it is the cooldown. That is also why the cap is well under what any
// real attack does - it is a reason not to stand there, not a way to die.
// ---- Colossus's turrets --------------------------------------------------
//
// Three states and no more: it flies, it bolts itself down, it shoots.
//
// THE ARC IS PARAMETRIC, not integrated. The position is rebuilt from the two
// endpoints and one clock every frame, so the obstacle resolution at the end
// of update() - which will happily shove a body sideways off a crate it is
// currently ten feet above - cannot bend the flight path: whatever it does is
// overwritten on the next frame. It also means the thing lands exactly where
// the ring on the floor said it would, which is the whole promise of the ring.
export const TURRET_ARC_TIME = 1.0;

export const TURRET_ARC_HEIGHT = 8;

// The pause between landing and the first shot. This is the window the player
// is given to kill it before it costs them anything.
export const TURRET_DEPLOY = 0.9;

export const TURRET_FIRE_CD = 1.6;

export const TURRET_RANGE = 30;

export function aiTurret(e, a) {
  const ctx = a.ctx;
  // A turret that was somehow spawned without a flight (nothing does this
  // today) is simply a live one standing where it was put.
  if (e.tState === undefined) {
    e.tState = 'live';
    e.tT = 0;
    e.tFireCd = TURRET_FIRE_CD;
    e.tMark = -1;
  }
  // The barrel easing home after a shot. At the top, so it keeps running
  // through the deploy pause and through terror.
  if (e.barrel && e.barrel.position.z > e.barrelRest) {
    e.barrel.position.z = Math.max(e.barrelRest, e.barrel.position.z - a.dt * 0.9);
  }

  if (e.tState === 'arc') {
    e.tT += a.dt;
    const u = Math.min(1, e.tT / TURRET_ARC_TIME);
    e.pos.x = e.tFromX + (e.tToX - e.tFromX) * u;
    e.pos.z = e.tFromZ + (e.tToZ - e.tFromZ) * u;
    // One parabola from the boss's shoulder to the floor: the linear term
    // carries the launch height away as the arc term brings it back down.
    e.pos.y = e.tFromY * (1 - u) + TURRET_ARC_HEIGHT * 4 * u * (1 - u);
    // The landing circle fills as it falls, exactly like a mortar's - the
    // player has already been taught to read that shape.
    e.tFx = ctx.effects;
    ctx.effects.markSet(e.tMark, e.tToX, e.tToZ, 1.3, 0xff5a00, u);
    if (u < 1) return;
    e.pos.y = 0;
    ctx.effects.markRelease(e.tMark);
    e.tMark = -1;
    e.tState = 'deploy';
    e.tT = TURRET_DEPLOY;
    _bossAt.set(e.pos.x, 0.2, e.pos.z);
    ctx.effects.burst(_bossAt, 0xff7043, 20, 5, 2, 0.5);
    _bossAt.set(e.pos.x, 0.05, e.pos.z);
    ctx.effects.shockwave(_bossAt, 0xff5a00, 3, 0.4);
    ctx.effects.addShake(0.12);
    return;
  }

  if (e.tState === 'deploy') {
    e.tT -= a.dt;
    e._setEyeAlert(true);
    if (e.tT <= 0) {
      e.tState = 'live';
      e.tFireCd = 0;
      e._setEyeAlert(false);
    }
    return;
  }

  // Bolted down: it never moves, so a.vx and a.vz are left at zero. Terror
  // stops it firing rather than sending it anywhere - it has no legs, which is
  // why the type declares fearMode 'stagger'.
  if (e.status.fear > 0 || e.status.freeze > 0) return;
  e.tFireCd -= a.dt;
  if (e.tFireCd > 0 || a.dist > TURRET_RANGE) return;
  e.tFireCd = TURRET_FIRE_CD * e.rate;
  e.flash = 0.12;
  // Kicks the barrel back and lets it ease home, so a shot is visible on the
  // model and not only in the round that left it.
  if (e.barrel) e.barrel.position.z = e.barrelRest + e.barrelKick;
  _bossAt.set(e.pos.x, 0.66, e.pos.z);
  ctx.effects.burst(_bossAt, 0xff7043, 6, 4, 1, 0.2);
  ctx.addProjectile(e.pos.x, 0.66, e.pos.z, 'turret', e._projScale(), (Math.random() - 0.5) * 0.09);
}

// Releases the landing ring of a turret shot out of the air mid-flight.
export function releaseTurret(e) {
  if (e.tMark >= 0 && e.tFx) e.tFx.markRelease(e.tMark);
  e.tMark = -1;
}

export const COLOSSUS_CHARGE_CAP = 52;

export const COLOSSUS_SLAM_CAP = 44;

export const COLOSSUS_CHARGE_SPEED = 14;

// How far the charge lane reaches. Used twice - by the telegraph that draws
// the rectangle and by the creep that burns it - so the warning and the
// consequence cannot drift apart.
export const COLOSSUS_LANE_LEN = 22;

// The charge burns THE RECTANGLE, not the boss's footprints. Laid down as one
// row of patches over the whole telegraphed lane the instant the charge
// launches, which is the only version that means anything: the rectangle was
// already the clearest warning in the fight and, until the boss physically
// arrived, the safest place in it - the player stepped aside, the boss went
// past, and the lane meant nothing a second later. Burning what was ADVERTISED
// makes the telegraph a claim on ground rather than a dodge prompt, and it
// covers the whole 22 metres even when the charge is cut short a third of the
// way down it by a pillar.
//
// Patches are placed by the LANE, so they land wherever the rectangle was -
// including the part of it the boss never reached.
export const COLOSSUS_CREEP_RADIUS = 2.4;

// Spaced under a radius apart, so the row overlaps into a continuous strip
// instead of reading as stepping stones down the middle of the attack. Nine
// patches covers the lane; the count is kept low on purpose, because creep
// runs on a thirty-slot pool shared with blight pools and ash and a finer
// strip would let one charge take every slot in it.
export const COLOSSUS_CREEP_STEP = 2.6;

export const COLOSSUS_CREEP_LIFE = 5;

export const COLOSSUS_CREEP_DPS = 14;

// Nothing is laid outside the arena. A lane aimed at a near wall runs most of
// its length through solid geometry, and a patch out there would burn a pool
// slot on ground no one can stand on.
export const COLOSSUS_CREEP_BOUND = 21.6;

// THE TURRETS COLOSSUS THROWS. See the `turret` type for what one does once it
// lands; these are the numbers for putting it there.
//
// THREE AT ONCE, AND NO MORE. The cap is what keeps this an addition to the
// fight rather than a replacement for it: at three the player can always clear
// the floor inside one vent window if they decide to, and the boss can always
// put one back afterwards. Counted live off the arena rather than tracked on
// the boss, so a turret the player destroys frees its slot the same frame.
export const COLOSSUS_MAX_TURRETS = 3;

export const COLOSSUS_LOB_CD = 9;

export const COLOSSUS_LOB_WINDUP = 0.7;

// How far from the player one is allowed to land, near end and far. It is
// thrown at where they ARE - it is not a mortar and it does not lead - but it
// must never come down on top of them, and the further away they are the
// looser the throw gets: the offset grows with range, so a turret lobbed
// across the arena lands in the player's neighbourhood rather than at their
// feet.
export const TURRET_DROP_MIN = 4;

export const TURRET_DROP_MAX = 10;

export function _turretCount(ctx) {
  let n = 0;
  for (const o of ctx.enemies) if (!o.dead && o.type === 'turret') n++;
  return n;
}

// Where the next turret comes down, into _turretSpot. Returns false when ten
// tries found nothing on open floor, in which case the boss simply does not
// throw this time.
export const _turretSpot = { x: 0, z: 0 };

export function _pickTurretSpot(e, a) {
  const p = a.ctx.player;
  const off = Math.max(TURRET_DROP_MIN, Math.min(TURRET_DROP_MAX, 3 + a.dist * 0.25));
  const B = COLOSSUS_CREEP_BOUND - 1;
  for (let i = 0; i < 10; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r = off * (0.85 + Math.random() * 0.45);
    const x = p.pos.x + Math.cos(ang) * r;
    const z = p.pos.z + Math.sin(ang) * r;
    if (Math.abs(x) > B || Math.abs(z) > B) continue;
    // Not under the boss's own feet either - it would be shoved out by crowd
    // separation the moment it landed, and a turret that slides is a bug the
    // player cannot read.
    if (Math.hypot(x - e.pos.x, z - e.pos.z) < e.radius + 2.5) continue;
    _bossAt.set(x, 0.5, z);
    if (pointInObstacle(_bossAt, a.ctx.obstacles)) continue;
    _turretSpot.x = x;
    _turretSpot.z = z;
    return true;
  }
  return false;
}

// Burns the whole telegraphed rectangle, once, at the moment the charge is
// released. `dirX/dirZ` is the lane's direction and the boss's position is its
// near end - the same two numbers markSet drew the rectangle from.
export function _colossusBurnLane(e, ctx) {
  const bs = e.bs;
  for (let d = COLOSSUS_CREEP_STEP * 0.5; d < COLOSSUS_LANE_LEN; d += COLOSSUS_CREEP_STEP) {
    const x = e.pos.x + bs.dirX * d;
    const z = e.pos.z + bs.dirZ * d;
    if (Math.abs(x) > COLOSSUS_CREEP_BOUND || Math.abs(z) > COLOSSUS_CREEP_BOUND) continue;
    ctx.addHazard(x, z, COLOSSUS_CREEP_RADIUS, COLOSSUS_CREEP_LIFE, COLOSSUS_CREEP_DPS, 'lava');
  }
  // One splash at the boss's feet rather than one per patch: nine shockwaves
  // on the same frame is a strobe, and the lane igniting reads as a single
  // event because it is one.
  _bossAt.set(e.pos.x, 0.1, e.pos.z);
  ctx.effects.burst(_bossAt, 0xff5533, 20, 6, 1.6, 0.6);
}

// Drives the shutters and the core glow toward `open`. Eased rather than
// snapped: the leaves visibly travelling is what turns the window into
// something the player sees coming instead of something that has already
// happened. `bs.vent` is the 0..1 position of that travel.
export function _colossusVent(bs, dt, open) {
  bs.vent += ((open ? 1 : 0) - bs.vent) * Math.min(1, dt * 6);
  const x = (COLOSSUS_SHUT_X + COLOSSUS_SHUT_TRAVEL * bs.vent) * bs.mScale;
  for (const sh of bs.shutters) sh.mesh.position.x = sh.sign * x;
  // A slow throb while it is open, so the exposed core is the only thing on
  // the model that is moving in place.
  const pulse = open ? 1 + 0.25 * Math.sin(bs.ventT * 9) : 1;
  bs.coreMat.emissiveIntensity =
    (COLOSSUS_CORE_SHUT + (COLOSSUS_CORE_OPEN - COLOSSUS_CORE_SHUT) * bs.vent) * pulse;
}

export function aiColossus(e, a) {
  const bs = e.bs;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.t = 0;
    bs.cd = 4;
    bs.slamCd = 2;
    bs.slamT = 0;
    bs.dirX = 0;
    bs.dirZ = 1;
    bs.mark = -1;
    bs.shotCd = COLOSSUS_VENT_SHOT_CD;
    // Not zero: the fight opens on the charge and the slam, and the first
    // turret arrives once the player has had a chance to learn those.
    bs.lobCd = COLOSSUS_LOB_CD * 0.7;
  }
  const ctx = a.ctx;
  bs.fx = ctx.effects;
  const feared = e.status.fear > 0;

  // Standing on it costs, in every state but the charge - which lands its own,
  // much larger, hit and must not also bill for the body it arrived in.
  if (bs.state !== 'dash') bossTouch(e, a);

  // THE CORE'S RHYTHM. It runs on its own clock, unbroken by whatever the
  // fight is doing, because the whole point of moving the weak point off the
  // body's surface and onto a timer was to make it something the player can
  // learn and count on. A knockdown opens it early and holds it open, which is
  // still the biggest window in the fight.
  if (bs.state === 'stagger') {
    _colossusVent(bs, a.dt, true);
  } else {
    bs.ventT -= a.dt;
    if (bs.ventT <= 0) {
      bs.weakOpen = !bs.weakOpen;
      bs.ventT = bs.weakOpen ? COLOSSUS_VENT_OPEN : COLOSSUS_VENT_SHUT;
      if (bs.weakOpen) {
        _bossAt.set(e.pos.x, 0.9 * bs.mScale, e.pos.z);
        ctx.effects.burst(_bossAt, 0xff2418, 12, 4, 1.5, 0.45);
      }
      // Re-armed on every flip, so the first volley of an opening costs the
      // same wind-up as the rest and a player who is already in position gets
      // a moment to commit or back out.
      bs.shotCd = COLOSSUS_VENT_SHOT_CD;
      ctx.bossEvent('vent', e);
    }
    _colossusVent(bs, a.dt, bs.weakOpen);
  }

  if (bs.state === 'stagger') {
    // Handed straight back after a charge, so the crowd shove that is added
    // after ai() is clamped at walking pace again the moment the rush is over.
    e.stepMul = 1.4;
    bs.t -= a.dt;
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.cd = 6 * e.rate;
      // Handed back to the vent clock mid-cycle rather than reset, so the
      // rhythm the player has been counting survives the knockdown.
      ctx.bossEvent('recover', e);
    }
    return;
  }

  if (bs.state === 'tele') {
    bs.t -= a.dt;
    e._setEyeAlert(true);
    // The lane is drawn at full length from the first frame so the AREA reads
    // instantly, and fills so the TIMING reads as it goes.
    const len = COLOSSUS_LANE_LEN;
    ctx.effects.markSet(
      bs.mark,
      e.pos.x + bs.dirX * len * 0.5, e.pos.z + bs.dirZ * len * 0.5,
      1.9, 0xff5533, 1 - bs.t / 1.1,
      len / 3.8, Math.atan2(-bs.dirX, -bs.dirZ)
    );
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      // The rectangle the player was just shown catches fire as the boss
      // leaves the blocks, so the warning and the burnt ground are one shape.
      _colossusBurnLane(e, ctx);
      bs.state = 'dash';
      bs.t = 2.2;
      e._setEyeAlert(false);
      ctx.bossEvent('charge', e);
    }
    return;
  }

  // Winding up to throw. It stands still for it - a turret is a commitment,
  // and a boss that could walk while throwing would be doing two things at
  // once for the first time in the fight.
  if (bs.state === 'lob') {
    bs.t -= a.dt;
    e._setEyeAlert(true);
    if (bs.t <= 0) {
      e._setEyeAlert(false);
      bs.state = 'walk';
      // Off the shoulder, not out of the floor: the arc has to start where the
      // boss's arms are or the throw does not read as a throw.
      ctx.addTurret(e.pos.x, 2.6 * bs.mScale, e.pos.z, bs.lobX, bs.lobZ);
      _bossAt.set(e.pos.x, 2.2 * bs.mScale, e.pos.z);
      ctx.effects.burst(_bossAt, 0xff7043, 16, 5, 2, 0.4);
      ctx.effects.addShake(0.14);
    }
    return;
  }

  if (bs.state === 'dash') {
    bs.t -= a.dt;
    // THE STEP CLAMP HAS TO BE LIFTED FOR THE CHARGE. update() caps the frame's
    // movement at `sp * stepMul`, and a boss walks at 2 m/s - so a 14 m/s charge
    // written into a.vx alone came out at 2.8 and the rush read as the boss
    // continuing to walk after a telegraph promising otherwise. Set here rather
    // than once at the state change so a charge is still fast after a freeze or
    // a slow has moved `sp` underneath it; put back in `walk` below.
    e.stepMul = COLOSSUS_CHARGE_SPEED / Math.max(0.5, a.sp);
    a.vx = bs.dirX * COLOSSUS_CHARGE_SPEED;
    a.vz = bs.dirZ * COLOSSUS_CHARGE_SPEED;
    if (a.dist < e.radius + 0.9 && _reachY(a) < BOSS_REACH_Y) {
      ctx.onHitPlayer(Math.min(COLOSSUS_CHARGE_CAP, e.damage), e.pos, e);
      ctx.effects.addShake(0.3);
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.burst(_bossAt, 0xffb300, 24, 7, 2, 0.6);
      bs.state = 'stagger';
      bs.t = 1.2;
      return;
    }
    // Ran into a wall, a pillar or a crate. This is the reward for baiting the
    // charge: a long open window on a body that is otherwise 78% armoured.
    if (e.blockedBy > 0.05 || bs.t <= 0) {
      const slammed = e.blockedBy > 0.05;
      bs.state = 'stagger';
      bs.t = slammed ? 2.5 : 0.8;
      if (slammed) {
        _bossAt.set(e.pos.x, 0, e.pos.z);
        ctx.effects.shockwave(_bossAt, 0xffb300, 7, 0.5);
        ctx.effects.burst(_bossAt, 0xffb300, 34, 8, 3, 0.8);
        ctx.effects.addShake(0.35);
        ctx.bossEvent('stagger', e);
      }
    }
    return;
  }

  // walk
  e.stepMul = 1.4;
  bs.cd -= a.dt;
  bs.slamCd -= a.dt;
  // Terror does not send a boss running - it just stops it doing anything,
  // which is what fearMode 'stagger' declares on the type.
  if (feared) {
    e._setEyeAlert(false);
    return;
  }

  // VENT FIRE. Only while the core is actually open, and only from `walk` -
  // NOT from `stagger`, which also holds the core open. The stagger is the
  // reward for baiting the charge into a pillar, and it is the one piece of
  // counter-play the fight has; shooting through it would take that back.
  // Gated on range too, so a boss at the far wall is not plinking at someone
  // who has already disengaged.
  if (bs.weakOpen && a.dist < 26) {
    bs.shotCd -= a.dt;
    if (bs.shotCd <= 0) {
      bs.shotCd = COLOSSUS_VENT_SHOT_CD * e.rate;
      const gy = 0.9 * bs.mScale;
      for (let i = -1; i <= 1; i++) {
        ctx.addProjectile(e.pos.x, gy, e.pos.z, 'colossus', 1, i * COLOSSUS_VENT_FAN);
      }
      _bossAt.set(e.pos.x, gy, e.pos.z);
      ctx.effects.burst(_bossAt, 0xff5a00, 10, 4, 1.5, 0.35);
    }
  }

  // Close enough to flatten: a slow, loud, radial slam that punishes standing
  // underneath it rather than circling. Written out rather than run through
  // _meleeCycle because the slam and the charge carry DIFFERENT damage caps,
  // and _meleeCycle can only ever deal e.damage.
  if (bs.slamT > 0) {
    bs.slamT -= a.dt;
    e._setEyeAlert(true);
    if (bs.slamT <= 0) {
      e._setEyeAlert(false);
      bs.slamCd = 3.2 * e.rate;
      if (a.dist < 5.5 && _reachY(a) < BOSS_REACH_Y) {
        ctx.onHitPlayer(Math.min(COLOSSUS_SLAM_CAP, e.damage * 0.82), e.pos, e);
      }
      _bossAt.set(e.pos.x, 0, e.pos.z);
      ctx.effects.shockwave(_bossAt, 0xff7043, 5.5, 0.4);
      ctx.effects.burst(_bossAt, 0xff7043, 26, 7, 2.5, 0.6);
      ctx.effects.addShake(0.22);
    }
    return;
  }
  if (a.dist < 5 && bs.slamCd <= 0) {
    bs.slamT = 0.9;
    return;
  }

  if (bs.cd <= 0 && a.dist > 8 && a.dist < 26) {
    bs.mark = ctx.effects.markAcquire();
    bs.state = 'tele';
    bs.t = 1.1;
    bs.dirX = a.nx;
    bs.dirZ = a.nz;
    return;
  }

  // THE TURRET THROW. Last of the walk-state options, so it never takes a
  // moment the charge or the slam wanted - those two are the fight, and this
  // is what fills the space between them. Only from range: a turret lobbed
  // from arm's length would land in the player's lap, which is the one thing
  // it must never do.
  bs.lobCd -= a.dt;
  if (bs.lobCd <= 0 && a.dist > 9 && _turretCount(ctx) < COLOSSUS_MAX_TURRETS
    && _pickTurretSpot(e, a)) {
    bs.state = 'lob';
    bs.t = COLOSSUS_LOB_WINDUP;
    bs.lobX = _turretSpot.x;
    bs.lobZ = _turretSpot.z;
    // Charged on the THROW and not on the attempt: a boss that failed to find
    // a spot should try again shortly, not stand down for nine seconds.
    bs.lobCd = COLOSSUS_LOB_CD * e.rate;
    return;
  }

  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
}

const TYPES = {
  // `head` IS WHERE THE FACE IS, and it is taken from where the model's eyes
  // are rather than from the top of the silhouette - a Stormcaller's antenna
  // and a Pylon's mast are the tallest things on them and neither is a head.
  // Unit space times `scale`, exactly like `hitbox`, and optional: a type that
  // names none gets a sphere on top of its body sphere (see defaultHead in
  // enemy.js), which is the right answer for everything in the roster that has
  // no head to speak of.
  chaser: {
    head: { r: 0.3, y: 1.3 },
    hp: 42, speed: 3.4, damage: 12, value: 100, color: 0xff3b30, eye: 0xffe08a,
    scale: 1, radius: 0.5, mass: 1,
    melee: { windup: 0.45, start: 1.5, hit: 2.2, cd: 1.1 },
    build: buildChaser, ai: aiMelee,
  },

  shooter: {
    head: { r: 0.28, y: 1.58 },
    hp: 28, speed: 2.7, damage: 8, value: 150, color: 0xb14aed, eye: 0x4ef3ff,
    scale: 1.08, radius: 0.5, mass: 1,
    orbit: { dist: 7.5, band: 1.5, out: 1, in: -0.7, strafe: 0.5, flip: 1, flipVar: 2 },
    // The baseline round, and the fallback every type with no `proj` of its
    // own inherits. `speed` and `dmg` are [base, perWave, cap] - the same
    // min(cap, base + wave * perWave) curve every enemy round has always
    // used, written once instead of as a branch per type.
    proj: {
      core: 0xd08bff, glow: 0xb14aed, scale: 0.75,
      speed: [13, 0.3, 20], dmg: [8, 0.8, 20],
    },
    build: buildShooter, ai: aiShooter,
  },

  tank: {
    head: { r: 0.32, y: 1.21 },
    hp: 180, speed: 1.8, damage: 25, value: 300, color: 0xff6b00, eye: 0xffaa00,
    scale: 1.5, radius: 0.5, mass: 1,
    melee: { windup: 0.8, start: 3.5, hit: 4.0, cd: 3.0 },
    build: buildTank, ai: aiMelee,
  },

  bomber: {
    head: { r: 0.3, y: 1.38 },
    hp: 35, speed: 2.0, damage: 18, value: 180, color: 0xff4400, eye: 0xff8844,
    scale: 1.1, radius: 0.5, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.6, in: -0.3, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildBomber, ai: aiBomber,
  },

  // Punishes shooting whatever is closest. It has no attack at all - it makes
  // everything around it tougher and faster, and draws a line to each one so
  // the player can see exactly what killing it would undo.
  conduit: {
    hp: 55, speed: 2.2, damage: 0, value: 320, color: 0x00e5b0, eye: 0xa7ffe8,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildConduit, ai: aiConduit,
  },

  // ---- the air roster ----------------------------------------------------
  // Unlocked after the fourth boss. Everything before this point is solved on
  // the floor: the player picks a lane, backs into a corner and holds an angle
  // that only has to cover 180 degrees of ground. These two put a threat ABOVE
  // that angle, which is the one axis twenty waves of ground enemies never
  // asked anyone to check.
  //
  // They are a matched pair on purpose, and the pair is the design: one that
  // will not come to you and one that does nothing but. Answering either one
  // the way you answer the other is how you lose to it.
  //
  // Both are FRAGILE - a harrier has a third of a tank's health and a shrike
  // less - because a target in the air is genuinely harder to hit, and paying
  // for that twice with a health bar as well would only make them tedious.

  // Stands off, high, and shoots. It cannot be reached, cannot be walked away
  // from, and while it is at station it is armoured against a fifth of what
  // the player can do about it - so ignoring it is a slow bleed and chasing it
  // is a waste of a magazine.
  //
  // The answer is its own attack. It has to COME DOWN to fire: it drops to
  // barely over head height for a three-round burst, and for those two seconds
  // it is unarmoured, close, lit up and holding still. The whole enemy is one
  // sentence - shoot it while it is shooting you - and it is the first thing
  // in the roster whose window belongs to the PLAYER's patience rather than
  // its own timer.
  harrier: {
    head: { r: 0.3, y: 1.08 },
    hp: 62, speed: 3.2, damage: 0, value: 340, color: 0x27c4ff, eye: 0xd7f4ff,
    // Oversized against its collision circle, and deliberately: it is fought
    // at five metres up and fifteen out, where a body sized like a chaser's is
    // a dot. The hitbox scales with the model, so what the player shoots at is
    // what they can see.
    scale: 1.25, radius: 0.45, mass: 1,
    hitbox: { r: 0.58, y: 1.0 },
    fly: { height: 5.0 },
    orbit: { dist: 15, band: 2.5, out: 0.9, in: -0.8, strafe: 0.45, flip: 2, flipVar: 2 },
    // Armoured only while it is at station. Direction is not consulted, for
    // the same reason the colossus core does not consult it: the mechanic is
    // WHEN, and adding a WHERE on top would only find ways to refuse hits the
    // player can see landing. armorDefault is 1, Bulwark's choice rather than
    // Colossus's - burn and venom are supposed to be the patient answer to a
    // thing that hides behind a window.
    armor: (e) => (e.pos.y < HARRIER_LOW + 1.0 ? 1 : HARRIER_HIGH_ARMOR),
    armorDefault: 1,
    // Small and cold: it arrives from above, so it is read against the floor
    // rather than against the skyline, and the pale core is what makes it
    // visible down there. Fast and light, because a harrier fires THREE per
    // descent - each has to cost well under a third of a shooter's single
    // round or the burst would be the hardest hit in the wave.
    proj: {
      core: 0xd7f4ff, glow: 0x27c4ff, scale: 0.65,
      speed: [18, 0.25, 26], dmg: [6, 0.25, 11],
    },
    build: buildHarrier, ai: aiHarrier,
  },

  // ---- bosses ------------------------------------------------------------
  // Every fifth wave, in the rotation waves.js owns. All of them share the
  // same resistance block: a boss that can be frozen solid, feared into the
  // far corner or shoved out of its own attack is not a fight, and Entropy
  // would otherwise pin a status on one for the entire back third of the bar.
  //
  // `hp` here is the BASE. waves.js multiplies it by a curve that reaches
  // roughly 5.9x by wave 55.

  // The teaching boss. Armoured everywhere except a red core in its chest,
  // behind shutters that draw back on a fixed rhythm - so damage is a question
  // of WHEN the player is firing rather than how long they hold the trigger.
  // The core used to travel around the body instead, and half of every cycle
  // it sat behind three metres of armour with no way to reach it: a mechanic
  // the player could only wait out reads as the fight being broken. On the
  // chest it is always in front of them, and the only question is the timing.
  // Its charge is telegraphed a full second ahead and, if the player puts a
  // pillar or a wall behind themselves, it knocks itself down and hands over a
  // free window.
  // COLOSSUS'S TURRETS. Not a wave spawn - nothing rolls one, and pickAddType
  // will never return it. The boss throws them (see aiColossus), they arc in,
  // they bolt themselves to the floor where they land and then they shoot.
  //
  // WHAT IT IS FOR. Colossus is a fight about one lane and one rhythm: dodge
  // the charge, shoot the vent while it is open. Both of those are answered by
  // standing still in a good spot, and a good spot stayed good for the whole
  // fight. A turret takes a piece of the floor away for as long as the player
  // lets it stand, so the question stops being "where is the safe place" and
  // becomes "which of these do I spend the vent window on".
  //
  // It is DELIBERATELY soft. It is a thing to be shot down, not a second boss:
  // a few rounds kill one, and killing it is meant to feel like the obvious
  // right answer that costs the player the damage they would rather have put
  // into the vent.
  turret: {
    hp: 130, speed: 0, damage: 0, value: 120, color: 0x6d4c2f, eye: 0xff5a00,
    scale: 1.15, radius: 0.5, mass: 6,
    hitbox: { r: 0.55, y: 0.6 },
    // It is a machine bolted to the floor: nothing lands on it, nothing scares
    // it, and freezing or slowing something that never moves means nothing.
    statusMul: 0.5, fearMode: 'stagger', entropyExempt: true,
    // Colossus's colour, a size down: a turret's round has to read as coming
    // from the boss's own machinery and not as a shooter that wandered in.
    // Slow and clearly readable in the air, because three turrets firing at
    // once is a lot of rounds on the floor - the cost of leaving one standing
    // is the pressure, not the burst.
    proj: {
      core: 0xffc27a, glow: 0xff5a00, scale: 0.8,
      speed: [11, 0.15, 16], dmg: [7, 0.3, 15],
    },
    build: buildTurret, ai: aiTurret, cleanup: releaseTurret,
  },

  colossus: {
    head: { r: 0.42, y: 1.18 },
    hp: 3600, speed: 2.0, damage: 34, value: 4000, color: 0x8c5a2b, eye: 0xffb300,
    scale: 3.2, radius: 2.0, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // Only full damage while the core is open. Direction is deliberately NOT
    // consulted any more: the core sits on the face the boss already turns
    // toward the player, so a shot that reaches it came from the front by
    // construction, and a directional test would only find ways to refuse hits
    // the player can see landing. armorDefault matches the shut value, the
    // opposite of Bulwark's choice: a damage source that arrives without a
    // direction must not be able to bypass the mechanic by accident.
    armor: (e) => (e.bs.state === 'stagger' || e.bs.weakOpen ? 1 : 0.22),
    armorDefault: 0.22,
    // Fired only through the open vent, so the round wears the core's own heat
    // rather than the generic shooter purple - and it is slower and heavier
    // than an ordinary one, because the vent is the window the player closes
    // in to use: what comes out of it has to be dodgeable at short range and
    // cost real health if it is not.
    proj: {
      core: 0xffd08a, glow: 0xff5a00, scale: 1.1,
      speed: [12, 0.2, 17], dmg: [11, 0.5, 24],
    },
    build: buildColossus, ai: aiColossus,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
