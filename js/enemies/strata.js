// STRATA's six enemies and its boss.
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
  ARENA_HALF, BOSS_REACH_Y, ENEMY_TYPES, SHARED_MATS, _armorA, _armorB,
  _bossAt, _reachY, aiMelee, bossTouch, eyes, geo, landHit, orbit, partsFor,
  prism, releaseMarks, shard, slab, spike,
} from './shared.js';

// Base stats before per-wave scaling (waves.js supplies the multipliers).
//
// A TYPE IS A STAT BLOCK PLUS TWO FUNCTIONS. `build(e, group, s)` adds the
// parts that make it look like itself; `ai(e, a)` decides what it does with a
// frame. Both live on the entry rather than in a `type === ...` chain, the
// same shape WEAPONS.build() and PASSIVE_ITEMS.apply() already use: with fifteen
// types a chain is scanned top to bottom every frame and, worse, splits one
// enemy's definition across three distant parts of the file.
//
// A type with no `ai` is INERT - it stands still and never attacks. That is
// deliberate and load-bearing: `conduit` is a support unit with no attack of
// its own.
//
// FIELDS
//   scale       sizes the whole model and its hitbox. Baked into the cached
//               body geometry, so every instance of a type shares one value -
//               per-instance size has to come from group.scale (see main.js's
//               _splitInto).
//   radius      collision circle on the XZ plane. Independent of `scale`,
//               because the model may be much wider than the space it should
//               actually occupy.
//   mass        >= 4 means knockback, gravity and shockwaves cannot move it.
//   melee/orbit parameters for the two shared AI shapes below.
//
// Optional fields, all defaulting to the behaviour the original six types had
// before bosses existed - see the status block further down for what they do:
//   statusMul, freezeSlow, slowFactor, freezeVuln, entropyExempt, fearMode,
//   armor, armorDefault, boss, hitbox.
//
//   fly         { height } makes the type AIRBORNE. See the flight block in
//               Enemy.update(): a flier keeps a real pos.y, so it clears low
//               cover for free (resolveCircle already skips a box it is above),
//               it is out of reach of a ground melee swing, and its model and
//               hitbox ride up with it. `height` is the altitude it settles at;
//               an ai() moves e.hoverY to climb or dive.
// What the Bulwark's buckler leaves through: a fifth of the hit. Named because
// the number is the whole design of the enemy - 80% off a small plate and 0%
// off everything else - and it is quoted in the wave-brief copy as well.
export const BULWARK_SHIELD_ARMOR = 0.2;

// What a perched gargoyle takes off a hit. HIGH - higher than anything short
// of the Pale Crown's shell - because the answer to a gargoyle is not to shoot
// it, it is to not walk under it. Making the perch merely tough would turn an
// optional enemy into an expensive one.
export const GARGOYLE_PERCH_ARMOR = 0.12;

// Warden's dome: how far the invincibility reaches, and the colour anything
// inside it turns. The radius is a compromise - wide enough that it obviously
// covers a group, narrow enough that walking round the edge of it is a real
// option and the warden is never safely parked out of reach behind its own
// protection.
export const WARD_RANGE = 6.5;

export const WARD_STONE = 0x8d9199;

// The scree's roll. Long, because a boulder that stopped after one wall would
// be a charge with extra steps - the whole point is that it is still crossing
// the room a second after the player stopped thinking about it.
export const SCREE_TELL = 0.5;

export const SCREE_ROLL = 3.2;

export const SCREE_ROLL_MUL = 3.1;

export const SCREE_CD = 3.4;

export const SCREE_RANGE = 20;

export const SCREE_MIN = 5;

export const SCREE_BOUNCES = 3;

// It shoves rather than hurts. Position is what a STRATA wave is about, so
// position is what its rusher takes.
export const SCREE_KNOCK = 9;

export const SLING_CD = 2.4;

export const SLING_RANGE = 26;

// How far back the floor remembers. Three spikes over about a second and a
// half of the player's own path - enough to describe an arc, short enough that
// a player who breaks their circle has already left it behind.
export const GEODE_CD = 4.6;

export const GEODE_RANGE = 26;

export const GEODE_TRAIL = 3;

export const GEODE_TRAIL_GAP = 0.5;

export const GEODE_SPIKE_R = 2.3;

export const GEODE_SPIKE_DELAY = 1.1;

export const GEODE_SPIKE_DMG = 18;

// The gargoyle. It holds its perch until the player walks under it, and the
// trigger is HORIZONTAL distance only - it is directly overhead that matters,
// not how close they are in three dimensions.
export const GARG_PERCH_Y = 6.2;

export const GARG_TRIGGER = 4.5;

export const GARG_DROP_RATE = 14;

export const GARG_RISE_RATE = 1.1;

// How long it stays down. Long, and the reason the trade is worth taking: the
// player chose to bring it into reach, and this is the reach.
export const GARG_GROUNDED = 4.0;

export const GARG_SLAM_R = 4.5;

// How hard it throws whatever it landed on. A block of stone dropping from
// six metres does not tap somebody.
export const GARG_SLAM_KNOCK = 4.0;

export const GARG_SLAM_DMG = 16;

export const _strataAt = new THREE.Vector3();

export function buildBulwark(e, g, s) {
  const P = partsFor(e, g, s);
  P('bulwarkTorso', prism(0.4, 0.46, 0.58, 6), { y: 0.7 });
  // The head sits proud of the torso now instead of hiding behind the plate -
  // it is the most obvious full-damage target on the body and it should look
  // like one.
  P('bulwarkHead', slab(0.24, 0.18, 0.22), { y: 1.1, z: -0.12 });
  // Shoulder pauldrons: mass either side of the buckler, so the plate reads as
  // narrow by comparison and the flanks read as open.
  P('bulwarkPauldron', prism(0.1, 0.19, 0.18, 6), { x: -0.4, y: 0.94, rz: 0.5 });
  P('bulwarkPauldron', prism(0.1, 0.19, 0.18, 6), { x: 0.4, y: 0.94, rz: -0.5 });
  // Thick and short. A bulwark that looked like it could run would be lying.
  P('bulwarkLeg', slab(0.22, 0.34, 0.24), { x: -0.26, y: 0.17 });
  P('bulwarkLeg', slab(0.22, 0.34, 0.24), { x: 0.26, y: 0.17 });
  // The arm, held out in front. Without it the buckler floats, and a plate
  // that floats reads as part of the body rather than as something carried.
  P('bulwarkArm', slab(0.12, 0.12, 0.34), { y: 0.72, z: -0.34 });
  // THE BUCKLER. A third of the old plate's span and stood off the chest, so
  // the silhouette around it is all exposed body. Kept as `e.shieldMesh`: the
  // armour test above reads its world position every hit, which means the
  // model and the hitbox can never disagree about where the shield is - move
  // it here and the protected patch moves with it.
  e.shieldMesh = P('bulwarkShield', prism(0.26, 0.26, 0.07, 6), {
    y: 0.72, z: -0.5, rx: Math.PI / 2, mat: SHARED_MATS.bulwarkShield,
  });
  // The boss, in the warden's gold. The one bright point on the enemy, and it
  // is sitting on the one place that is not worth shooting - which is the
  // whole joke, and the whole tell.
  P('bulwarkBoss', shard(0.1), { y: 0.72, z: -0.56, mat: SHARED_MATS.wardenCrown });
  eyes(P, { y: 1.12, x: 0.08, z: -0.24, r: 0.75, mat: e.eyeMat });
}

// A floating spindle with nothing that could hold a weapon, and no eyes at
// all. Read: it is a machine, it is not attacking, and it is the reason the
// crowd stopped dying.
// ---- STRATA ----------------------------------------------------------------
// The theme's language: flat slabs and blocks at hard angles, bottom-heavy,
// with nothing glowing but a seam of mineral in the cracks. Where EMBER is
// lumpen and VERDANT is ragged, this is CUT - every part is a box or a
// low-sided prism, and nothing on any of them is round.

// A boulder that has not curled up yet: a hunched slab of a body over a low
// plate, so the shape it becomes is legible before it becomes it.
// WHERE THE BOULDER ROLLS ABOUT, and how far it has to ride up to do it.
//
// Both measured off the model rather than guessed. The parts occupy y 0 to 1.01
// in unit space, and the smallest sphere that contains all of them is centred at
// 0.489 with a radius of 0.634 - so a roll about that centre sweeps its farthest
// vertex 0.634 out, and the centre has to sit 0.634 up for that vertex to just
// graze the floor instead of going through it. The difference is the lift, plus
// a centimetre of margin measured off the real model through a full turn.
//
// The bug this replaces: the roll turned e.group.rotation.x, and the group's
// origin is the enemy's FEET (see enemy.js, which positions it at pos.y). So
// the rock was pivoting about its own contact point, which swings everything
// above that point through an arc that dips below the floor once per turn -
// visibly, every revolution, which is exactly what was reported.
const SCREE_PIVOT_Y = 0.489;
const SCREE_ROLL_LIFT = 0.158;
// How fast the lift eases in and out, so the rock rises onto its curve rather
// than popping up 15cm on the frame the roll starts.
const SCREE_LIFT_K = 9;

export function buildScree(e, g, s) {
  // A PIVOT AT THE BALL'S CENTRE. `pivot` is what the roll turns; `inner`
  // cancels the pivot's offset so every part below can keep the coordinates it
  // was authored in, measured from the feet like every other model in the game.
  const pivot = new THREE.Group();
  pivot.position.y = SCREE_PIVOT_Y * s;
  const inner = new THREE.Group();
  inner.position.y = -SCREE_PIVOT_Y * s;
  pivot.add(inner);
  g.add(pivot);
  e.rollPivot = pivot;
  e.rollPivotY = SCREE_PIVOT_Y * s;
  e.rollLift = SCREE_ROLL_LIFT * s;
  e.rollUp = 0;
  const P = partsFor(e, inner, s);
  // The shell it rolls on: a wide low six-sided plate, the widest part of the
  // silhouette and the part that reads as "this is going to roll".
  P('screeShell', prism(0.5, 0.44, 0.44, 6), { y: 0.36, rx: 0.12 });
  // Slabs stacked on its back at opposing angles - the loose rock it sheds
  // when it uncurls, and what stops the shell reading as a wheel.
  P('screeSlab', slab(0.42, 0.14, 0.34), { y: 0.66, z: 0.06, rz: 0.22, rx: -0.14 });
  P('screeSlab', slab(0.34, 0.12, 0.28), { x: 0.1, y: 0.8, z: -0.06, rz: -0.34 });
  // A blunt head sunk between the shoulders, barely clearing the shell.
  P('screeHead', prism(0.16, 0.2, 0.24, 5), { y: 0.84, z: -0.3, rx: -0.3 });
  // Short thick legs tucked well under. It should look like it would rather be
  // a ball than a walker.
  P('screeLeg', slab(0.14, 0.26, 0.14), { x: -0.24, y: 0.13, z: -0.06 });
  P('screeLeg', slab(0.14, 0.26, 0.14), { x: 0.24, y: 0.13, z: -0.06 });
  P('screeLeg', slab(0.13, 0.24, 0.13), { x: -0.2, y: 0.12, z: 0.24 });
  P('screeLeg', slab(0.13, 0.24, 0.13), { x: 0.2, y: 0.12, z: 0.24 });
  // The mineral seam, in the crack between shell and slab - the only bright
  // thing, and it is a LINE rather than a pair of dots.
  P('screeSeam', slab(0.4, 0.05, 0.05), { y: 0.58, z: -0.24, mat: e.eyeMat, shadow: false });
  eyes(P, { y: 0.86, x: 0.08, z: -0.4, r: 0.7, mat: e.eyeMat });
}

// Upright and wound up, with the throwing arm cocked back and out - the gunner
// read, cut from rock.
export function buildSlinger(e, g, s) {
  const P = partsFor(e, g, s);
  P('slingerTorso', slab(0.36, 0.62, 0.24), { y: 1.0, rz: 0.08 });
  P('slingerHead', prism(0.14, 0.18, 0.24, 5), { y: 1.44, z: -0.06 });
  // THE ARM IS THE SILHOUETTE, cocked back over the shoulder with the stone
  // still in it - so the outline says both what it is about to do and which
  // side it is going to do it from.
  P('slingerArm', slab(0.13, 0.5, 0.13), { x: 0.3, y: 1.24, z: 0.16, rz: -0.7, rx: 0.6 });
  P('slingerStone', prism(0.15, 0.15, 0.16, 5), { x: 0.46, y: 1.5, z: 0.3 });
  // A counterweight slab on the other hip, so the wound-up side reads as
  // having something to swing against.
  P('slingerWeight', slab(0.24, 0.28, 0.2), { x: -0.3, y: 0.86, rz: 0.3 });
  P('slingerArmL', slab(0.1, 0.4, 0.1), { x: -0.26, y: 1.16, rz: 0.3 });
  P('slingerLeg', slab(0.12, 0.52, 0.13), { x: -0.13, y: 0.28 });
  P('slingerLeg', slab(0.12, 0.52, 0.13), { x: 0.13, y: 0.28 });
  P('slingerSeam', slab(0.26, 0.05, 0.05), { y: 1.1, z: -0.13, mat: e.eyeMat, shadow: false });
  eyes(P, { y: 1.46, x: 0.08, z: -0.15, r: 0.75, mat: e.eyeMat });
}

// A cracked shell with light in the split - bottom-heavy and hunched, the
// ground-denier read. It never touches the player, so everything about it has
// to say "the trouble is under your feet".
export function buildGeode(e, g, s) {
  const P = partsFor(e, g, s);
  // A squat faceted rock, split down the middle. The split is the identity.
  P('geodeShellL', prism(0.34, 0.46, 0.66, 5), { x: -0.16, y: 0.42, rz: 0.16 });
  P('geodeShellR', prism(0.34, 0.46, 0.66, 5), { x: 0.16, y: 0.42, rz: -0.16 });
  // THE CRYSTAL in the gap, and the only bright thing on the model - it is
  // what is coming up through the floor somewhere else.
  P('geodeCrystal', spike(0.16, 0.62, 4), { y: 0.72, mat: e.eyeMat, shadow: false });
  P('geodeCrystal', spike(0.1, 0.4, 4), { x: -0.1, y: 0.62, z: -0.1, rz: 0.4, mat: e.eyeMat, shadow: false });
  // A heavy base plate, so it reads as sitting ON the floor rather than
  // standing on it - it is the thing the spikes belong to.
  P('geodeBase', prism(0.54, 0.62, 0.18, 6), { y: 0.09 });
  // Stubby legs barely clearing the base.
  P('geodeFoot', slab(0.16, 0.18, 0.18), { x: -0.34, y: 0.09, z: -0.08 });
  P('geodeFoot', slab(0.16, 0.18, 0.18), { x: 0.34, y: 0.09, z: -0.08 });
  P('geodeFoot', slab(0.16, 0.18, 0.18), { y: 0.09, z: 0.3 });
  eyes(P, { y: 0.5, x: 0.1, z: -0.4, r: 0.75, mat: e.eyeMat });
}

// A block with its wings folded over it. Perched it should read as ARCHITECTURE
// - something bolted to the truss - and the moment it drops it has to read as
// an enemy, which is what the wings are for: closed they are the silhouette,
// open they are unmistakably alive.
export function buildGargoyle(e, g, s) {
  const P = partsFor(e, g, s);
  // A blocky crouched body. Compact, because it spends its life seen from
  // directly below against a bright truss.
  P('gargBody', slab(0.44, 0.42, 0.4), { y: 0.0 });
  P('gargHead', prism(0.16, 0.22, 0.26, 5), { y: 0.28, z: -0.16, rx: -0.4 });
  P('gargHaunch', slab(0.18, 0.24, 0.22), { x: -0.26, y: -0.16, rz: 0.3 });
  P('gargHaunch', slab(0.18, 0.24, 0.22), { x: 0.26, y: -0.16, rz: -0.3 });
  // THE WINGS. Held on the enemy so aiGargoyle can fold and spread them: the
  // one state change this enemy has is the whole enemy.
  e.wingL = P('gargWing', slab(0.5, 0.5, 0.08), { x: -0.34, y: 0.06, rz: 0.5, ry: 0.35 });
  e.wingR = P('gargWing', slab(0.5, 0.5, 0.08), { x: 0.34, y: 0.06, rz: -0.5, ry: -0.35 });
  // Claws under it - what it is gripping the truss with, and the part that
  // reads first when it is directly overhead.
  const clawGeo = spike(0.07, 0.26, 4);
  P('gargClaw', clawGeo, { x: -0.2, y: -0.32, z: -0.12, rx: Math.PI });
  P('gargClaw', clawGeo, { x: 0.2, y: -0.32, z: -0.12, rx: Math.PI });
  P('gargClaw', clawGeo, { x: -0.2, y: -0.32, z: 0.14, rx: Math.PI });
  P('gargClaw', clawGeo, { x: 0.2, y: -0.32, z: 0.14, rx: Math.PI });
  eyes(P, { y: 0.3, x: 0.09, z: -0.3, r: 0.8, mat: e.eyeMat });
}

export function buildWarden(e, g, s) {
  const P = partsFor(e, g, s);
  P('wardenShaft', prism(0.24, 0.36, 1.24, 4), { y: 0.72, ry: Math.PI / 4 });
  P('wardenTip', spike(0.24, 0.4, 4), { y: 1.54, ry: Math.PI / 4 });
  P('wardenBase', prism(0.4, 0.34, 0.16, 4), { y: 0.08, ry: Math.PI / 4 });
  // One horizontal slit rather than a pair of dots. Nothing else in the roster
  // reads this way, and it is what makes a warden findable in a crowd.
  P('wardenSlit', slab(0.34, 0.055, 0.05), { y: 1.1, z: -0.26, mat: e.eyeMat, shadow: false });

  // The DOME is the enemy. It is built at exactly WARD_RANGE so what the
  // player sees and what the aura protects are the same number, and it is
  // open-topped so it never fills the screen when the player is standing
  // inside it - the ring on the floor is what they read from in there.
  const domeMat = new THREE.MeshBasicMaterial({
    color: 0xbfc7d2, transparent: true, opacity: 0.06,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xdfe6ef, transparent: true, opacity: 0.85,
    side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  e._extraMats.push(domeMat, ringMat);
  const dome = new THREE.Mesh(
    geo('wardenDome', () => new THREE.SphereGeometry(WARD_RANGE, 26, 10, 0, Math.PI * 2, 0, Math.PI * 0.42)),
    domeMat
  );
  const ring = new THREE.Mesh(
    geo('wardenRing', () => new THREE.RingGeometry(WARD_RANGE - 0.32, WARD_RANGE, 64)),
    ringMat
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  // The dome and ring sit at the enemy's FEET and must not inherit the model's
  // scale, so they are added to the group directly at world size - `s` is
  // already baked into every other part.
  e.wardDome = domeMat;
  e.wardRing = ringMat;
  // NOT thrown by the come-apart death. These two are built at WARD_RANGE -
  // thirteen metres across - and a dome that size cartwheeling off a body does
  // not read as a death. See Effects.corpse.
  dome.userData.noCorpse = true;
  ring.userData.noCorpse = true;
  g.add(dome, ring);

  const crown = new THREE.Mesh(
    geo('wardenCrown', () => new THREE.TorusGeometry(0.34, 0.05, 6, 12)),
    SHARED_MATS.wardenCrown
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 1.36 * s;
  crown.scale.setScalar(s);
  e.crown = crown;
  g.add(crown);
}

// ---- the afflictors ------------------------------------------------------
// Six models, held to the same test as the rest of the roster: as a flat black
// shape, you can tell which one is coming. They also have to pass a second one
// the older types never faced - the body is TINTED by whatever status is on it
// (see _applyBodyLook), and these are the types the player is most likely to
// meet frozen, burning or poisoned, so not one of them may rely on its colour.
// What each is carrying is built into the silhouette instead: shards off a
// rime's back, sacs on a husk's, a jaw that opens on a howler.

export function buildSiege(e, g, s) {
  const P = partsFor(e, g, s);
  P('siegeBase', prism(0.6, 0.78, 0.32, 6), { y: 0.18 });
  P('siegeHull', prism(0.44, 0.58, 0.5, 6), { y: 0.62 });
  // Outriggers braced on the floor, so the whole thing reads as planted.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('siegeFoot', slab(0.26, 0.16, 0.26), {
      x: Math.cos(a) * 0.78, y: 0.09, z: Math.sin(a) * 0.78, ry: a,
      mat: SHARED_MATS.tankPlate,
    });
  }
  P('siegeMantlet', slab(0.5, 0.34, 0.3), { y: 0.98, z: -0.14 });
  // Angled up: it lobs rather than shoots, and the silhouette should say so
  // from across the arena. Kept on the enemy so aiSiege can ELEVATE it through
  // a salvo's channel - the barrel coming up is the volley's own tell.
  e.siegeBarrel = P('siegeBarrel', prism(0.13, 0.19, 1.2, 8), {
    y: 1.18, z: -0.42, rx: -Math.PI / 3, mat: SHARED_MATS.sniperBarrel,
  });
  e.siegeBarrelRx = -Math.PI / 3;
  // THE FRACTURE SEAM. The geode's split at boss scale: a crack across the
  // mantlet and one around the hull's waist, sharing one material, lit only
  // once the fight has hurt the boss - it is the phase meter, and it lives on
  // the body rather than in a bar note.
  e.seamMat = new THREE.MeshBasicMaterial({
    color: 0xff6a40, transparent: true, opacity: 0,
  });
  e._extraMats.push(e.seamMat);
  P('siegeSeam', slab(0.055, 0.3, 0.03), { y: 0.98, z: -0.3, mat: e.seamMat, shadow: false });
  P('siegeSeam', slab(0.52, 0.05, 0.03), { y: 0.6, z: -0.42, rz: 0.18, mat: e.seamMat, shadow: false });
  eyes(P, { y: 1.0, x: 0.16, z: -0.3, r: 1.1, mat: e.eyeMat });
}

// Winds up, curls, and rolls - and where it goes after the first wall is not
// aimed at anybody. Three bounces, so a scree let loose in an open room is
// crossing it for a good while afterwards.
// Turns the pivot and eases the lift. Called with `rolling` false on the frame
// the roll ends so the rock settles back down instead of dropping.
function _screeRoll(e, dt, rolling) {
  const pivot = e.rollPivot;
  if (!pivot) return;
  const k = Math.min(1, dt * SCREE_LIFT_K);
  e.rollUp += ((rolling ? 1 : 0) - e.rollUp) * k;
  pivot.position.y = e.rollPivotY + e.rollLift * e.rollUp;
  if (rolling) {
    pivot.rotation.x -= dt * 7;
    return;
  }
  // UNWOUND TO THE NEAREST WHOLE TURN, not snapped to zero. A rock that
  // levelled itself on the frame the roll ended read as a puppet being set
  // down; taking the short way to upright over the same easing the lift uses
  // makes it look like it came to a stop. The legs do have to end up under it,
  // which is why it does not simply stay where it stopped.
  const turn = Math.PI * 2;
  let r = pivot.rotation.x % turn;
  if (r > Math.PI) r -= turn;
  if (r < -Math.PI) r += turn;
  pivot.rotation.x = Math.abs(r) < 0.01 ? 0 : r * (1 - k);
}

export function aiScree(e, a) {
  if (!e.sc) e.sc = { state: 'walk', t: 0, hx: 0, hz: 1, left: 0 };
  const sc = e.sc;
  sc.t -= a.dt;
  // The pivot is eased EVERY frame, in every state, so the rock settles back
  // down out of the roll instead of staying up on its curve for the rest of the
  // fight. See _screeRoll.
  _screeRoll(e, a.dt, sc.state === 'roll');

  if (sc.state === 'roll') {
  // RAISING THE VELOCITY IS NOT ENOUGH. Enemy.update clamps how far a body may
  // move in a frame to `speed * stepMul`, and stepMul defaults to 1.4 - so an
  // ai() that multiplies its own velocity by three and does not touch it moves
  // at 1.4x and looks like a slightly hurried walk. Every committed charge in
  // the game raises it (the shrike's dive, Colossus's and Siege's) and all
  // three of the ones added with the themes had silently not been.
    e.stepMul = SCREE_ROLL_MUL;
    const sp = e._effSpeed() * SCREE_ROLL_MUL;
    a.vx = sc.hx * sp;
    a.vz = sc.hz * sp;

    // THE WALLS TURN IT. Reflected off the arena's own half-width rather than
    // off obstacles: a wall is axis-aligned and has a normal to hand, and an
    // obstacle does not - a boulder that caromed off the corner of a crate at
    // an angle nobody could predict would be noise rather than a mechanic.
    let hit = false;
    if (Math.abs(e.pos.x) > ARENA_HALF - 1.2 && sc.hx * Math.sign(e.pos.x) > 0) {
      sc.hx = -sc.hx;
      hit = true;
    }
    if (Math.abs(e.pos.z) > ARENA_HALF - 1.2 && sc.hz * Math.sign(e.pos.z) > 0) {
      sc.hz = -sc.hz;
      hit = true;
    }
    if (hit) {
      sc.left--;
      if (a.ctx.effects) {
        _strataAt.set(e.pos.x, 0.7, e.pos.z);
        a.ctx.effects.burst(_strataAt, 0xdfe6ef, 12, 4, 2, 0.4);
      }
      if (a.ctx.sfx) a.ctx.sfx.impact();
    }

    // Contact SHOVES. It is a rolling rock, so what it does to the player is
    // what a rolling rock does - the damage is almost incidental.
    if (a.dist < 2.1 && !e.rollHit) {
      e.rollHit = true;
      landHit(e, a.ctx);
      // ALONG THE ROLL, not away from the world origin. pullPlayer takes a
      // DIRECTION and normalises it - passing the scree's world position made
      // the shove point outward from the middle of the arena, which is
      // nowhere near where a boulder that just hit you was going. The heading
      // is what a rolling rock knocks you along.
      if (a.ctx.pullPlayer) a.ctx.pullPlayer(sc.hx, sc.hz, SCREE_KNOCK);
    }
    // THE WALLS TURN IT AND COVER STOPS IT, and the difference is the whole
    // reason the bounce is walls-only. A wall is flat, axis-aligned and known,
    // so a carom off one is a thing the player can read; a crate is a corner
    // at an arbitrary angle, so a boulder that bounced off one would be noise.
    // Ending the roll there instead makes cover a genuine answer to a scree -
    // and it stops the roll being spent grinding against a pillar, which is
    // what it did before this line existed.
    if (sc.t <= 0 || sc.left <= 0 || e.blockedBy > 0.05) {
      sc.state = 'walk';
      sc.t = SCREE_CD * e.rate;
      e.rollHit = false;
      // The spin stops where it stopped rather than snapping upright: the rock
      // has come to rest at whatever angle it came to rest at, and a boulder
      // that levelled itself on the last frame of a roll read as a puppet.
      // Only the LIFT comes back down, and _screeRoll eases that from here on.
      e._setEyeAlert(false);
    }
    return;
  }

  e.stepMul = 1.4;
  if (sc.state === 'tell') {
    a.vx = 0;
    a.vz = 0;
    if (sc.t <= 0) {
      sc.hx = a.nx;
      sc.hz = a.nz;
      sc.state = 'roll';
      sc.t = SCREE_ROLL;
      sc.left = SCREE_BOUNCES;
      e.rollHit = false;
    }
    return;
  }

  aiMelee(e, a);
  if (sc.t <= 0 && a.dist < SCREE_RANGE && a.dist > SCREE_MIN) {
    sc.state = 'tell';
    sc.t = SCREE_TELL;
    e._setEyeAlert(true);
    e.flash = 0.12;
  }
}

// Orbits and throws. Everything that makes it interesting is in the ROUND -
// see Projectile's bounce - so there is nothing clever here, which is correct:
// the enemy is a delivery system for a stone that uses the room.
export function aiSlinger(e, a) {
  orbit(e, a, ENEMY_TYPES.slinger.orbit);
  if (e.attackCd > 0 || a.dist > SLING_RANGE) return;
  e.attackCd = SLING_CD + Math.random() * 0.7;
  e.flash = 0.12;
  a.ctx.addProjectile(e.pos.x, 1.15, e.pos.z, 'slinger', e._projScale());
}

// Remembers where the player has been and comes up under all of it at once.
//
// The trail is sampled on a fixed interval rather than every frame, because
// what it has to describe is a PATH - three points a half-second apart draw
// the arc of a circle, and three points three frames apart draw a dot.
export function aiGeode(e, a) {
  orbit(e, a, ENEMY_TYPES.geode.orbit);
  const p = a.ctx.player;
  if (!p) return;

  if (!e.trail) {
    e.trail = [];
    e.trailCd = 0;
  }
  e.trailCd -= a.dt;
  if (e.trailCd <= 0) {
    e.trailCd = GEODE_TRAIL_GAP;
    e.trail.push({ x: p.pos.x, z: p.pos.z });
    if (e.trail.length > GEODE_TRAIL) e.trail.shift();
  }

  if (e.attackCd > 0 || a.dist > GEODE_RANGE) return;
  if (e.trail.length < GEODE_TRAIL) return;
  e.attackCd = GEODE_CD + Math.random() * 0.8;
  e.flash = 0.18;
  // All at once, and all telegraphed. Three circles appearing together along
  // the line the player has just walked is the whole read: it is not asking
  // where they are, it is asking where they were going.
  for (const t of e.trail) {
    a.ctx.addMortar(t.x, t.z, GEODE_SPIKE_R, GEODE_SPIKE_DELAY, GEODE_SPIKE_DMG);
  }
  if (a.ctx.effects) {
    _strataAt.set(e.pos.x, 0.7, e.pos.z);
    a.ctx.effects.burst(_strataAt, 0xffd166, 12, 3.5, 2, 0.5);
  }
}

// Holds its perch until the player walks underneath, then drops.
export function aiGargoyle(e, a) {
  if (e.perched === undefined) {
    e.perched = true;
    e.gargT = 0;
  }
  // HORIZONTAL distance. It is about being UNDER it, not near it - a player
  // standing ten metres away at the same height as the truss is not under
  // anything, and would have no idea why it came down.
  const dx = e.pos.x - (a.ctx.player ? a.ctx.player.pos.x : 0);
  const dz = e.pos.z - (a.ctx.player ? a.ctx.player.pos.z : 0);
  const flat = Math.hypot(dx, dz);

  if (e.perched) {
    // Wings folded, motionless, and it does not drift. A perch that wandered
    // would make walking under one an accident rather than a choice.
    e.hoverY = GARG_PERCH_Y;
    e.flyRate = GARG_RISE_RATE;
    a.vx = 0;
    a.vz = 0;
    if (e.wingL) {
      e.wingL.rotation.z = 0.5;
      e.wingR.rotation.z = -0.5;
    }
    e._setEyeAlert(false);
    if (flat < GARG_TRIGGER && e.pos.y > 1.2) {
      e.perched = false;
      e.gargT = GARG_GROUNDED;
      e.flyRate = GARG_DROP_RATE;
      e._setEyeAlert(true);
      e.slammed = false;
    }
    return;
  }

  // Coming down, or down. Wings spread - the one frame-by-frame tell that it
  // is an enemy now rather than a fixture.
  if (e.wingL) {
    e.wingL.rotation.z = 1.35;
    e.wingR.rotation.z = -1.35;
  }
  e.hoverY = 0;
  if (!e.slammed && e.pos.y < 0.5) {
    e.slammed = true;
    // It lands ON the floor, and everything nearby is shoved and hurt. This
    // is the price of having walked under it.
    // NOT ctx.onBlast - THERE IS NO onBlast ON THE ENEMY CONTEXT. It is on the
    // projectile and deployable contexts only (see _projCtx and _deployCtx in
    // main.js), and the projectile one hardcodes hitPlayer to false anyway, so
    // this whole slam was particles and no damage: the price of walking under
    // a gargoyle was nothing at all. An enemy hurts the player through
    // onHitPlayer, which is the only hook it has and the one landHit uses.
    const gp = a.ctx.player;
    if (gp && Math.hypot(gp.pos.x - e.pos.x, gp.pos.z - e.pos.z) < GARG_SLAM_R) {
      landHit(e, a.ctx, GARG_SLAM_DMG);
      // Thrown clear, the way the dynamo's discharge throws: the slam ends
      // with the player outside the radius rather than standing in it.
      if (a.ctx.pullPlayer) {
        a.ctx.pullPlayer(gp.pos.x - e.pos.x, gp.pos.z - e.pos.z, GARG_SLAM_KNOCK);
      }
    }
    if (a.ctx.effects) {
      _strataAt.set(e.pos.x, 0.4, e.pos.z);
      a.ctx.effects.shockwave(_strataAt, 0x9aa5b1, GARG_SLAM_R, 0.4);
      a.ctx.effects.burst(_strataAt, 0xdfe6ef, 22, 6, 2, 0.6);
    }
    if (a.ctx.sfx) a.ctx.sfx.impact();
  }

  // On the floor it is an ordinary melee enemy, and unarmoured.
  if (e.slammed) {
    aiMelee(e, a);
    e.gargT -= a.dt;
    if (e.gargT <= 0 && flat > GARG_TRIGGER) {
      // Back up, slowly. The climb is the window, the way the shrike's is.
      e.perched = true;
      e.slammed = false;
    }
  }
}

// ---- PLAGUE ----------------------------------------------------------------

// No attack of its own. It keeps a middle distance and makes everything under
// its dome unkillable, so it converts a crowd the player was already shooting
// into a wall - and the fix is to walk in and delete the warden.
//
// It never wards ITSELF and never wards another warden: a pair that covered
// each other would be a stalemate with no way in, and a warden inside its own
// dome would simply be an enemy that cannot be killed.
export function aiWarden(e, a) {
  orbit(e, a, ENEMY_TYPES.warden.orbit);
  e.crown.rotation.z += a.dt * 1.4;
  // The dome breathes so it never reads as a static piece of scenery, and
  // brightens with how much it is currently doing.
  let held = 0;
  for (const o of a.ctx.enemies) {
    if (o === e || o.dead || o.boss || o.type === 'warden') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > WARD_RANGE * WARD_RANGE) continue;
    // Refreshed, never accumulated, exactly like a conduit's buff: it lapses
    // a fraction of a second after the warden dies, so killing one makes the
    // whole group take damage again immediately.
    o.wardT = 0.2;
    held++;
  }
  const pulse = 0.8 + Math.sin(a.ctx.time * 3.4 + e.id) * 0.2;
  // Kept low even when it is doing its job: at the edge of the dome it fills
  // the screen, and an aura that washes out the enemies inside it would hide
  // the stone grey that is the other half of the tell.
  e.wardDome.opacity = (held > 0 ? 0.10 : 0.05) * pulse;
  e.wardRing.opacity = (held > 0 ? 1.0 : 0.55) * pulse;
}

// SIEGE. The whole theme at boss scale: the room fights you. The six each
// teach one surface - the floor remembers, the walls turn what rolls, the
// ceiling drops - and the boss presses all three in one fight, every couple
// of seconds, while it prowls toward you. Standing still and out-pouring it
// is over: it is never not asking a question.
//
// THE FIVE ATTACKS, ONE PER SURFACE, ALL TELEGRAPHED BEFORE THEY HURT:
//   SLAB STOMP    the floor, close. Plants and rears with a circle filling
//                 at its feet, then the slab comes down - radial damage and
//                 a shove. Under a third of the bar the shove is the SETUP:
//                 the ring outside telegraphs as it lands, and the first slam
//                 was selling the retreat it just shoved you into.
//   FAULT LINE    the floor, at range. Plants, and a crack runs from its
//                 feet toward where the player STOOD, one ring of spikes
//                 filling after the next - the geode's lesson at boss pace.
//                 Under two thirds it re-reads the player and cracks again.
//   LANDSLIDE     the walls. A lane fills for a second, then it comes down
//                 it at full pelt, tearing the lane up behind it - and the
//                 WALL answers the slam with a fan of spikes along the face.
//                 Into a pillar instead it staggers, the bargain it keeps.
//   QUARRY SALVO  the sky. Three volleys in rotation: a bracket rung AROUND
//                 where you stand, a row led along where you are RUNNING, and
//                 a cross planted on you. Every circle is a mortar mark.
//   OVERBURDEN    the ceiling. Filling circles, and where they burst the
//                 floor is rubble that keeps cutting - the room the player
//                 has been kiting on goes away a cast at a time.
//
// Between all of them it CHASES, weaving rather than beelining, and touching
// the body at any time costs immediately. Nothing is armoured and nothing is
// healed: the fight is won by shooting, in the windows the attacks leave.

// The charge's lane: drawn at full length from the first frame so the AREA
// reads instantly, filling as it goes so the TIMING reads too. The heading
// locks at the telegraph, not during it - what the rectangle showed is where
// it goes, which is the whole counter-play.
export const SIEGE_TELE_TIME = 1.0;

export const SIEGE_LANE_LEN = 22;

export const SIEGE_SLIDE_SPEED = 19;

export const SIEGE_SLIDE_TIME = 2.2;

export const SIEGE_SLIDE_CD = 6;

export const SIEGE_SLIDE_CAP = 46;

export const SIEGE_SLIDE_MUL = 1.5;

// The lane the slide just tore up: a small circle every third of a second
// along where it passed, so the route stays hot for a moment after the rush.
export const SIEGE_TRAIL_GAP = 0.3;

export const SIEGE_TRAIL_R = 2.3;

export const SIEGE_TRAIL_DELAY = 0.55;

export const SIEGE_TRAIL_CAP = 26;

export const SIEGE_TRAIL_MUL = 0.85;

// The wall's answer: a fan of spikes parallel to the face it slammed,
// straddling the impact point - a dodge along the wall is not escape.
export const SIEGE_CAROM_N = 4;

export const SIEGE_CAROM_R = 2.7;

export const SIEGE_CAROM_DELAY = 0.7;

export const SIEGE_CAROM_CAP = 30;

// The stomp: radius of the slam, the fill that announces it, and how hard it
// throws whoever the shove catches. The knock is INTO the outer ring's
// ground under phase two, which is the whole point of having both.
export const SIEGE_STOMP_R = 6.5;

export const SIEGE_STOMP_TELL = 0.85;

export const SIEGE_STOMP_CAP = 40;

export const SIEGE_STOMP_MUL = 1.3;

export const SIEGE_STOMP_KNOCK = 8;

export const SIEGE_STOMP_CD = 4.5;

export const SIEGE_STOMP_GATE = 7.5;

// The outer ring, phase three's answer to "just walk out": the slam's ring
// doubled, with the middle safe - the boss you started the fight hugging is
// where you retreat to.
export const SIEGE_STOMP2_R = 10;

export const SIEGE_STOMP2_SAFE = 4.6;

export const SIEGE_STOMP2_TELL = 0.6;

export const SIEGE_STOMP2_CAP = 34;

export const SIEGE_STOMP2_MUL = 1.1;

// The fault: five circles marching from the boss's feet down the bearing the
// player held, a fifth of a second apart, so the crack is seen RACING rather
// than arriving. Under two thirds a second, shorter channel re-aims four
// more at wherever the dodge went.
export const SIEGE_FAULT_CD = 4.2;

export const SIEGE_FAULT_CHANNEL = 0.55;

export const SIEGE_FAULT2_CHANNEL = 0.34;

export const SIEGE_FAULT_N = 5;

export const SIEGE_FAULT2_N = 4;

export const SIEGE_FAULT_LEAD = 4.5;

export const SIEGE_FAULT_STEP = 3.6;

export const SIEGE_FAULT_R = 2.6;

export const SIEGE_FAULT_DELAY = 0.5;

export const SIEGE_FAULT_STRIDE = 0.22;

export const SIEGE_FAULT_CAP = 38;

export const SIEGE_FAULT_MUL = 1.2;

// The salvo: three patterns in rotation, all captured positions, all on the
// mortar clock - a ring round the player, a row along their running, a cross
// on their feet. Each is a different question about MOVEMENT, not position.
export const SIEGE_SALVO_CD = 2.6;

export const SIEGE_SALVO_CHANNEL = 0.5;

export const SIEGE_SALVO_CAP = 30;

export const SIEGE_SALVO_MUL = 1.15;

// The overburden: what drops becomes rubble, and rubble keeps biting for
// twelve seconds - a patch of floor the fight has spent and the player does
// not get back.
export const SIEGE_RUBBLE_CD = 8;

export const SIEGE_RUBBLE_CHANNEL = 0.7;

export const SIEGE_RUBBLE_R = 3.4;

export const SIEGE_RUBBLE_GROUND_R = 3.1;

export const SIEGE_RUBBLE_DELAY = 1.0;

export const SIEGE_RUBBLE_LIFE = 12;

export const SIEGE_RUBBLE_DPS = 14;

export const SIEGE_RUBBLE_CAP = 34;

export const SIEGE_RUBBLE_MUL = 1.15;

// The conductor's podium: how close one attack may follow another. Short
// enough that the fight never idles, wide enough that no two telegraphs ever
// start on the same frame - five attacks at once would be noise, and noise
// is the one thing a telegraph may never be.
export const SIEGE_CHAIN = 0.55;

// The two fractures. As its own bar falls the kit does not get bigger
// numbers - it gets LESS TIME between questions: a third faster under two
// thirds, and under one third the stomp rings and the overburden triples
// join the forked fault it has been running since halfway.
export const SIEGE_PACE_HURT = 0.8;

export const SIEGE_PACE_FINAL = 0.62;

// One shell, clamped so the circle it draws can never lie half off the
// floor. `ground` is only ever the overburden's rubble payload - everything
// else is a pure delayed hit, the mortar system's own bargain.
function _siegeShell(ctx, x, z, r, delay, dmg, ground) {
  ctx.addMortar(
    Math.max(-ARENA_HALF + r, Math.min(ARENA_HALF - r, x)),
    Math.max(-ARENA_HALF + r, Math.min(ARENA_HALF - r, z)),
    r, delay, dmg, ground
  );
}

// Free telegraph handles. Every pattern here acquires one mark per circle UP
// FRONT, and a circle that could not draw would be an invisible hit - so a
// pattern that cannot afford its warnings does not fire at all, and waits a
// few frames instead.
function _marksFree(ctx) {
  let n = 0;
  for (const mk of ctx.effects.marks) if (!mk.used) n++;
  return n;
}

export function aiSiege(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.t = 0;
    // Seeded so the fight opens with a salvo and never idles in 'walk'.
    bs.stompCd = 1.2;
    bs.faultCd = 2.4;
    bs.slideCd = 5.0;
    bs.salvoCd = 0.8;
    bs.rubbleCd = 6.5;
    bs.chain = 0;
    bs.mark = -1;
    bs.dirX = 0;
    bs.dirZ = 1;
    bs.hit = false;
    bs.trailT = 0;
    bs.wasStagger = false;
    bs.phase = 0;
    bs.pace = 1;
    bs.salvoPat = 0;
    bs.rear = 0;
    bs.rearT = 0;
    bs.lift = 0;
    bs.sway = 1;
    bs.swayT = 2;
  }
  // Held so cleanup() can release a telegraph the boss died on top of.
  bs.fx = ctx.effects;

  // THE FRACTURES. The bar falling does not add armour or health - it takes
  // TIME away from the player's answers, and at the last third it arms the
  // two attacks that were being held back. The seam on the hull is the meter,
  // and it burns before anything else about the fight changes.
  const frac = e.hp / e.maxHp;
  const wantPhase = frac < 0.33 ? 2 : frac < 0.66 ? 1 : 0;
  if (wantPhase > bs.phase) {
    bs.phase = wantPhase;
    bs.pace = wantPhase === 1 ? SIEGE_PACE_HURT : SIEGE_PACE_FINAL;
    e.flash = 0.2;
    _bossAt.set(e.pos.x, 1.4, e.pos.z);
    ctx.effects.burst(_bossAt, 0xff6a40, 26, 7, 3, 0.7);
    ctx.effects.shockwave(_bossAt, 0xff5533, 5, 0.4);
    ctx.effects.addShake(0.25);
    if (ctx.sfx) ctx.sfx.impact();
  }
  if (e.seamMat) {
    e.seamMat.opacity = bs.phase === 0
      ? 0
      : 0.25 + bs.phase * 0.3 + Math.sin(ctx.time * 7) * 0.07 * bs.phase;
  }

  // THE BODY SELLS THE STATE. A rear before the slab drops, a lean into the
  // fault and the slide, the barrel climbing for the salvo - the model's own
  // tells, on the one rotation axis update() leaves alone (it owns .z, the
  // dance's lean, and .y, the facing).
  bs.rear += (bs.rearT - bs.rear) * Math.min(1, a.dt * 10);
  e.group.rotation.x = bs.rear * 0.2;
  bs.lift += ((bs.state === 'salvo' ? 1 : 0) - bs.lift) * Math.min(1, a.dt * 8);
  if (e.siegeBarrel) e.siegeBarrel.rotation.x = e.siegeBarrelRx - bs.lift * 0.5;

  // Touching it costs AT ANY TIME - a swing is the answer to blowing a dodge
  // next to it, and the dodge is the answer to everything else. Only the
  // slide is exempt: it carries its own, heavier, hit for the same contact.
  if (bs.state !== 'slide') bossTouch(e, a);

  // ---- slab stomp: plants, rear up, the circle fills, the slab lands ------
  if (bs.state === 'stomp') {
    a.vx = 0;
    a.vz = 0;
    e.stepMul = 1.45;
    bs.t -= a.dt;
    bs.rearT = 1;
    e._setEyeAlert(true);
    ctx.effects.markSet(bs.mark, e.pos.x, e.pos.z, SIEGE_STOMP_R, 0xff5533,
      Math.min(1, 1 - bs.t / SIEGE_STOMP_TELL), 1, 0, 0.8);
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      e._setEyeAlert(false);
      // The slab comes DOWN: the rear snaps negative for a beat.
      bs.rear = -0.9;
      bs.rearT = 0;
      _bossAt.set(e.pos.x, 0, e.pos.z);
      ctx.effects.shockwave(_bossAt, 0xff5533, SIEGE_STOMP_R, 0.45);
      ctx.effects.burst(_bossAt, 0xdfe6ef, 30, 8, 3.5, 0.7);
      ctx.effects.addShake(0.35);
      if (ctx.sfx) ctx.sfx.impact();
      const p = ctx.player;
      if (a.dist < SIEGE_STOMP_R + 0.4 && _reachY(a) < BOSS_REACH_Y) {
        ctx.onHitPlayer(Math.min(SIEGE_STOMP_CAP, e.damage * SIEGE_STOMP_MUL), e.pos, e);
        // OUTWARD - which under the outer ring is exactly wrong, and the
        // player learns the pair as one lesson: toward, not away.
        if (ctx.pullPlayer) {
          ctx.pullPlayer(p.pos.x - e.pos.x, p.pos.z - e.pos.z, SIEGE_STOMP_KNOCK);
        }
      }
      bs.stompCd = SIEGE_STOMP_CD * bs.pace * e.rate;
      if (bs.phase >= 2 && _marksFree(ctx) >= 1) {
        bs.state = 'stomp-ring';
        bs.t = SIEGE_STOMP2_TELL;
        bs.mark = ctx.effects.markAcquire();
      } else {
        bs.state = 'walk';
        bs.chain = SIEGE_CHAIN;
      }
    }
    return;
  }

  // ---- the outer ring: the slam's shove was aiming the player AT this -----
  if (bs.state === 'stomp-ring') {
    a.vx = 0;
    a.vz = 0;
    bs.t -= a.dt;
    bs.rearT = 0.9;
    e._setEyeAlert(true);
    ctx.effects.markSet(bs.mark, e.pos.x, e.pos.z, SIEGE_STOMP2_R, 0xff5533,
      Math.min(1, 1 - bs.t / SIEGE_STOMP2_TELL), 1, 0, 0.45);
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      e._setEyeAlert(false);
      bs.rear = -0.9;
      bs.rearT = 0;
      _bossAt.set(e.pos.x, 0, e.pos.z);
      ctx.effects.shockwave(_bossAt, 0xff5533, SIEGE_STOMP2_R, 0.5);
      ctx.effects.burst(_bossAt, 0xdfe6ef, 36, 9, 4, 0.8);
      ctx.effects.addShake(0.4);
      if (ctx.sfx) ctx.sfx.impact();
      // A RING, not a disc: the floor the first slam cleared is safe, the
      // floor it shoved the player onto is not.
      if (a.dist > SIEGE_STOMP2_SAFE && a.dist < SIEGE_STOMP2_R && _reachY(a) < BOSS_REACH_Y) {
        ctx.onHitPlayer(Math.min(SIEGE_STOMP2_CAP, e.damage * SIEGE_STOMP2_MUL), e.pos, e);
      }
      bs.state = 'walk';
      bs.chain = SIEGE_CHAIN;
    }
    return;
  }

  // ---- fault line: a crack racing from its feet to where the player stood -
  if (bs.state === 'fault' || bs.state === 'fault2') {
    a.vx = 0;
    a.vz = 0;
    e.stepMul = 1.45;
    bs.t -= a.dt;
    bs.rearT = 0.55;
    if (bs.t <= 0) {
      e._setEyeAlert(false);
      const p = ctx.player;
      const second = bs.state === 'fault2';
      // Aimed at where the player stands THE MOMENT it fires - the second
      // crack ahead of the first is exactly long enough to re-read a dodge.
      let dx = p.pos.x - e.pos.x;
      let dz = p.pos.z - e.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      dx /= dl;
      dz /= dl;
      const n = second ? SIEGE_FAULT2_N : SIEGE_FAULT_N;
      const dmg = Math.min(SIEGE_FAULT_CAP, e.damage * SIEGE_FAULT_MUL);
      for (let i = 0; i < n; i++) {
        const d = SIEGE_FAULT_LEAD + i * SIEGE_FAULT_STEP;
        _siegeShell(ctx, e.pos.x + dx * d, e.pos.z + dz * d,
          SIEGE_FAULT_R, SIEGE_FAULT_DELAY + i * SIEGE_FAULT_STRIDE, dmg);
      }
      _bossAt.set(e.pos.x, 0.4, e.pos.z);
      ctx.effects.burst(_bossAt, 0xdfe6ef, 14, 5, 2.5, 0.5);
      if (ctx.sfx) ctx.sfx.impact();
      if (!second && bs.phase >= 1 && _marksFree(ctx) >= SIEGE_FAULT2_N) {
        bs.state = 'fault2';
        bs.t = SIEGE_FAULT2_CHANNEL;
      } else {
        bs.state = 'walk';
        bs.chain = SIEGE_CHAIN;
        bs.faultCd = SIEGE_FAULT_CD * bs.pace * e.rate;
      }
    }
    return;
  }

  // ---- landslide: the lane fills, then it is IN the lane ------------------
  if (bs.state === 'lane') {
    a.vx = 0;
    a.vz = 0;
    e.stepMul = 1.45;
    bs.t -= a.dt;
    bs.rearT = -0.25;
    e._setEyeAlert(true);
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-bs.dirX, -bs.dirZ);
    ctx.effects.markSet(
      bs.mark,
      e.pos.x + bs.dirX * SIEGE_LANE_LEN * 0.5, e.pos.z + bs.dirZ * SIEGE_LANE_LEN * 0.5,
      2.2, 0xff5533, 1 - bs.t / SIEGE_TELE_TIME,
      SIEGE_LANE_LEN / 4.4, Math.atan2(-bs.dirX, -bs.dirZ)
    );
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      e._setEyeAlert(false);
      bs.state = 'slide';
      bs.t = SIEGE_SLIDE_TIME;
      bs.hit = false;
      bs.trailT = 0.12;
      ctx.bossEvent('charge', e);
    }
    return;
  }

  if (bs.state === 'slide') {
    bs.t -= a.dt;
    bs.rearT = 0.25;
    // See the same line in aiScree: without this the slide is clamped to
    // walking pace by update()'s step cap and never actually arrives.
    e.stepMul = SIEGE_SLIDE_SPEED / Math.max(0.5, a.sp);
    a.vx = bs.dirX * SIEGE_SLIDE_SPEED;
    a.vz = bs.dirZ * SIEGE_SLIDE_SPEED;
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-bs.dirX, -bs.dirZ);
    // The lane stays hot behind it: standing your ground ON the telegraph
    // was the question, and the trail is the answer arriving late.
    bs.trailT -= a.dt;
    if (bs.trailT <= 0) {
      bs.trailT = SIEGE_TRAIL_GAP;
      if (_marksFree(ctx) >= 2) {
        ctx.addMortar(e.pos.x, e.pos.z, SIEGE_TRAIL_R, SIEGE_TRAIL_DELAY,
          Math.min(SIEGE_TRAIL_CAP, e.damage * SIEGE_TRAIL_MUL));
      }
    }
    const p = ctx.player;
    if (!bs.hit && a.dist < e.radius + 1.7 && _reachY(a) < BOSS_REACH_Y) {
      bs.hit = true;
      ctx.onHitPlayer(Math.min(SIEGE_SLIDE_CAP, e.damage * SIEGE_SLIDE_MUL), e.pos, e);
      if (ctx.pullPlayer) ctx.pullPlayer(p.pos.x - e.pos.x, p.pos.z - e.pos.z, 7);
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.burst(_bossAt, 0xff7043, 24, 7, 2, 0.6);
      ctx.effects.addShake(0.3);
      bs.state = 'recover';
      bs.t = 0.9;
      bs.wasStagger = false;
      bs.slideCd = SIEGE_SLIDE_CD * bs.pace * e.rate;
      return;
    }
    // blockedBy includes the arena wall (see update(): the clamp scores it) -
    // and the two slams are NOT the same answer. A pillar crumples it, the
    // old window; the WALL pays the charge back, a fan of spikes along the
    // face it hit, so hugging the boundary is a trade, not a dodge.
    if (e.blockedBy > 0.05 || bs.t <= 0) {
      const wall = Math.abs(e.pos.x) > ARENA_HALF - 2.4 || Math.abs(e.pos.z) > ARENA_HALF - 2.4;
      _bossAt.set(e.pos.x, 0, e.pos.z);
      ctx.effects.addShake(0.35);
      if (ctx.sfx) ctx.sfx.impact();
      if (e.blockedBy > 0.05 && !wall) {
        bs.state = 'recover';
        bs.t = 2.4;
        bs.wasStagger = true;
        ctx.effects.shockwave(_bossAt, 0xff5533, 7, 0.5);
        ctx.effects.burst(_bossAt, 0xff7043, 34, 8, 3, 0.8);
        ctx.bossEvent('stagger', e);
      } else if (wall) {
        const tx = Math.abs(e.pos.x) > Math.abs(e.pos.z) ? 0 : 1;
        const tz = 1 - tx;
        for (let i = 0; i < SIEGE_CAROM_N; i++) {
          const off = (i - (SIEGE_CAROM_N - 1) / 2) * 3.4;
          _siegeShell(ctx, e.pos.x + tx * off, e.pos.z + tz * off,
            SIEGE_CAROM_R, SIEGE_CAROM_DELAY, Math.min(SIEGE_CAROM_CAP, e.damage));
        }
        ctx.effects.shockwave(_bossAt, 0xff5533, 8, 0.5);
        ctx.effects.burst(_bossAt, 0xdfe6ef, 34, 8, 3, 0.8);
        bs.state = 'recover';
        bs.t = 1.2;
        bs.wasStagger = false;
      } else {
        // Open floor ended it - the dodge was clean, and the bill is small.
        bs.state = 'recover';
        bs.t = 0.7;
        bs.wasStagger = false;
      }
      bs.slideCd = SIEGE_SLIDE_CD * bs.pace * e.rate;
      e._setEyeAlert(false);
      return;
    }
    return;
  }

  // ---- quarry salvo: three captured patterns, rotated so nothing rhymes ---
  if (bs.state === 'salvo') {
    a.vx = 0;
    a.vz = 0;
    e.stepMul = 1.45;
    bs.t -= a.dt;
    bs.rearT = 0.35;
    if (bs.t <= 0) {
      e._setEyeAlert(false);
      const p = ctx.player;
      const dmg = Math.min(SIEGE_SALVO_CAP, e.damage * SIEGE_SALVO_MUL);
      // Never the same pattern twice running: +1 always, +2 sometimes.
      bs.salvoPat = (bs.salvoPat + 1 + (Math.random() < 0.4 ? 1 : 0)) % 3;
      if (bs.salvoPat === 0) {
        // BRACKET: a ring around where the player STOOD, plus the middle.
        // Walking out through a gap is the only answer it allows.
        const base = Math.random() * Math.PI * 2;
        for (let i = 0; i < 5; i++) {
          const ang = base + (i / 5) * Math.PI * 2;
          _siegeShell(ctx, p.pos.x + Math.cos(ang) * 5.2, p.pos.z + Math.sin(ang) * 5.2,
            2.2, 1.15, dmg);
        }
        _siegeShell(ctx, p.pos.x, p.pos.z, 2.5, 1.15, dmg);
      } else if (bs.salvoPat === 1) {
        // LEAD: a row along where the player is RUNNING - the answer is to
        // stop or turn, never to keep the line. A still player gets the row
        // on the boss's own bearing instead, so standing in it reads the same.
        let lx = p.vel ? p.vel.x : 0;
        let lz = p.vel ? p.vel.z : 0;
        if (Math.hypot(lx, lz) < 1.5) {
          lx = p.pos.x - e.pos.x;
          lz = p.pos.z - e.pos.z;
        }
        const ll = Math.hypot(lx, lz) || 1;
        lx /= ll;
        lz /= ll;
        for (let i = 0; i < 4; i++) {
          const d = 2.5 + i * 3;
          _siegeShell(ctx, p.pos.x + lx * d, p.pos.z + lz * d, 2.4, 1.05, dmg);
        }
      } else {
        // CROSS: the four cardinals covered and the diagonals open - it asks
        // for a specific step, not just any step.
        _siegeShell(ctx, p.pos.x, p.pos.z, 2.3, 1.0, dmg);
        for (const [ox, oz] of [[3.4, 0], [-3.4, 0], [0, 3.4], [0, -3.4]]) {
          _siegeShell(ctx, p.pos.x + ox, p.pos.z + oz, 2.3, 1.0, dmg);
        }
      }
      e.flash = 0.15;
      bs.state = 'walk';
      bs.chain = SIEGE_CHAIN;
      bs.salvoCd = SIEGE_SALVO_CD * bs.pace * e.rate;
    }
    return;
  }

  // ---- overburden: the ceiling drops, and the floor it hits is SPENT ------
  if (bs.state === 'rubble') {
    a.vx = 0;
    a.vz = 0;
    e.stepMul = 1.45;
    bs.t -= a.dt;
    bs.rearT = -0.5;
    if (bs.t <= 0) {
      e._setEyeAlert(false);
      const p = ctx.player;
      const dmg = Math.min(SIEGE_RUBBLE_CAP, e.damage * SIEGE_RUBBLE_MUL);
      // One ground object shared by every shell of the cast: _addMortar only
      // reads it, and one payload IS the cast.
      const ground = {
        radius: SIEGE_RUBBLE_GROUND_R, life: SIEGE_RUBBLE_LIFE,
        dps: SIEGE_RUBBLE_DPS, kind: 'rubble',
      };
      _siegeShell(ctx, p.pos.x, p.pos.z, SIEGE_RUBBLE_R, SIEGE_RUBBLE_DELAY, dmg, ground);
      const extra = bs.phase >= 2 ? 2 : 1;
      for (let i = 0; i < extra; i++) {
        const ang = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 2;
        _siegeShell(ctx, p.pos.x + Math.cos(ang) * r, p.pos.z + Math.sin(ang) * r,
          SIEGE_RUBBLE_R - 0.4, SIEGE_RUBBLE_DELAY + 0.15, dmg, ground);
      }
      bs.state = 'walk';
      bs.chain = SIEGE_CHAIN;
      bs.rubbleCd = SIEGE_RUBBLE_CD * bs.pace * e.rate;
    }
    return;
  }

  // ---- recover: the slide's bill, long only when a pillar collected it ----
  if (bs.state === 'recover') {
    a.vx = 0;
    a.vz = 0;
    e.stepMul = 1.45;
    bs.t -= a.dt;
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.chain = SIEGE_CHAIN;
      // Only a real stagger owns the room's announcement - a routine recovery
      // after a miss must not slam the lights every few seconds.
      if (bs.wasStagger) {
        bs.wasStagger = false;
        ctx.bossEvent('recover', e);
      }
    }
    return;
  }

  // Terror does not send a boss running - the stagger contract the other
  // bosses keep. Tested only here: a slide already out of the gate is not
  // called back by it.
  if (e.status.fear > 0) {
    e._setEyeAlert(false);
    return;
  }

  // ---- walk: it CHASES, weaving rather than beelining, and it swings ------
  e.stepMul = 1.45;
  const m = ENEMY_TYPES.siege.melee;
  const free = e._meleeCycle(a.dt, a.dist, ctx, m.windup, m.start, m.hit, m.cd);
  if (free) {
    bs.swayT -= a.dt;
    if (bs.swayT <= 0) {
      bs.sway = -bs.sway;
      bs.swayT = 1.6 + Math.random() * 1.3;
    }
    // A rolling bias off the pursuit line, dropped when close: what it is
    // winding up at that range is a swing, and the approach has to be honest.
    const sway = a.dist > 5 ? bs.sway * 0.42 : 0;
    a.vx = a.px * a.sp + -a.pz * sway * a.sp;
    a.vz = a.pz * a.sp + a.px * sway * a.sp;
  }
  // Nothing below may interrupt a swing that is already wound up or live -
  // `free` is exactly that test, and it is what keeps the boss from stepping
  // out of its own swing into a charge.
  if (!free) return;

  bs.chain -= a.dt;
  bs.stompCd -= a.dt;
  bs.faultCd -= a.dt;
  bs.slideCd -= a.dt;
  bs.salvoCd -= a.dt;
  bs.rubbleCd -= a.dt;
  if (bs.chain > 0) return;

  // Priority is the range ladder: the space-maker first, the lane next, then
  // the floor, then the ceiling, then the sky - so a moment where everything
  // is ready spends the one that COSTS the player their position. A pattern
  // that cannot afford its telegraph marks skips its turn and waits - an
  // undrawn warning is the one thing a telegraphed attack may never be.
  if (bs.stompCd <= 0 && a.dist < SIEGE_STOMP_GATE) {
    bs.state = 'stomp';
    bs.t = SIEGE_STOMP_TELL;
    bs.mark = ctx.effects.markAcquire();
    e._setEyeAlert(true);
    e.flash = 0.12;
    return;
  }
  if (bs.slideCd <= 0 && a.dist > 6.5 && a.dist < 32) {
    bs.state = 'lane';
    bs.t = SIEGE_TELE_TIME;
    bs.mark = ctx.effects.markAcquire();
    // Locked at the telegraph, not tracked through it. That is the whole
    // counter-play: what the rectangle showed is where it goes.
    bs.dirX = a.nx;
    bs.dirZ = a.nz;
    return;
  }
  if (bs.faultCd <= 0 && a.dist > 4.5 && a.dist < 27 &&
    _marksFree(ctx) >= (bs.phase >= 1 ? SIEGE_FAULT_N + SIEGE_FAULT2_N : SIEGE_FAULT_N)) {
    bs.state = 'fault';
    bs.t = SIEGE_FAULT_CHANNEL;
    e._setEyeAlert(true);
    e.flash = 0.12;
    return;
  }
  if (bs.rubbleCd <= 0 && a.dist > 8 && a.dist < 30 &&
    _marksFree(ctx) >= (bs.phase >= 2 ? 3 : 2)) {
    bs.state = 'rubble';
    bs.t = SIEGE_RUBBLE_CHANNEL;
    e._setEyeAlert(true);
    e.flash = 0.12;
    return;
  }
  if (bs.salvoCd <= 0 && a.dist > 5.5 && _marksFree(ctx) >= 6) {
    bs.state = 'salvo';
    bs.t = SIEGE_SALVO_CHANNEL;
    e._setEyeAlert(true);
    e.flash = 0.12;
  }
}

const TYPES = {
  // Punishes lazy aim. It carries a SMALL buckler rather than a wall: the plate
  // is a patch over its chest that eats 80% of anything that lands on it, and
  // every other part of the thing - head, shoulders, legs, flanks - takes full
  // damage. The old version armoured the entire front arc, which made the
  // right answer "walk around it" and the wrong answer "keep shooting", and
  // neither of those is aiming. Now the answer is to shoot somewhere else on a
  // target you are already looking at, which is a question the player answers
  // with the crosshair instead of with their feet.
  //
  // armorDefault stays 1, so damage over time and blasts - which have no point
  // of impact to test - ignore the buckler entirely. That is deliberate and
  // unchanged: Venom and Incendiary should still have an enemy they are
  // obviously right for.
  bulwark: {
    head: { r: 0.32, y: 1.12 },
    hp: 110, speed: 1.6, damage: 18, value: 280, color: 0x8d9db6, eye: 0xffd54f,
    scale: 1.35, radius: 0.62, mass: 2,
    melee: { windup: 0.7, start: 2.6, hit: 3.2, cd: 2.2 },
    // A SOLID-ANGLE TEST, not a box test, and the reason is what the raycast
    // actually reports: shots land on the enemy's hitbox SPHERE, not on the
    // visible plate, so the impact point is always out on that sphere and a
    // test against the plate's own volume would never fire. Both the impact
    // and the buckler are taken as directions FROM THE HITBOX CENTRE, and the
    // hit counts as blocked when they point the same way - which is exactly
    // the patch of the sphere the buckler covers as seen from inside.
    //
    // cos 0.9 is a ~26 degree cap, tuned against the model rather than picked:
    // it is the widest cone that still lets a shot aimed a head's width above
    // the plate through. A looser one blocked rounds the player could SEE land
    // on bare chest, which is the one thing a placed shield must never do -
    // the whole mechanic is only fair if the plate's edge is where it looks.
    armor: (e, dx, dz, point) => {
      // No impact point (melee, blasts, a chained bolt) means no way to tell
      // where it landed, and the buckler is too small to assume it was hit.
      if (!point || !e.shieldMesh) return 1;
      const c = e.hitbox.getWorldPosition(_armorA);
      const sh = e.shieldMesh.getWorldPosition(_armorB).sub(c);
      const hx = point.x - c.x, hy = point.y - c.y, hz = point.z - c.z;
      const hl = Math.hypot(hx, hy, hz) || 1;
      const sl = sh.length() || 1;
      const dot = (hx * sh.x + hy * sh.y + hz * sh.z) / (hl * sl);
      return dot > 0.9 ? BULWARK_SHIELD_ARMOR : 1;
    },
    armorDefault: 1,
    build: buildBulwark, ai: aiMelee,
  },

  // ---- the rest of STRATA -------------------------------------------------
  //
  // The theme that fights with the ROOM. Every other theme could be fought in
  // an empty box: EMBER burns the floor, RIME chills the player, VERDANT puts
  // things on a timer. This one is about the walls, the ceiling and the ground
  // itself - a stone bounces off a corner, a boulder caroms across the arena,
  // something drops out of the truss, something comes up through the floor.
  //
  // WHICH MAKES IT THE ONE THEME WHERE WHERE YOU STAND IS THE WHOLE ANSWER.
  // A corner is the worst place in the game to fight a STRATA wave and the
  // open middle is the best - the exact reverse of every other theme, where
  // the middle is exposed and cover is safety.
  //
  // THE SHARED SILHOUETTE IS THE SLAB. Flat plates and blocks at hard angles,
  // heavier at the bottom than the top, with nothing glowing but a seam of
  // mineral in the cracks - the roster's most inert-looking family, which is
  // what makes the two that MOVE surprising.

  // Curls up and rolls, and CAROMS OFF THE WALLS rather than stopping at them.
  // So it is not a charge aimed at the player - it is a hazard let loose in the
  // room, and where it goes after the first bounce is a property of the arena
  // rather than of the enemy.
  //
  // It cannot steer once rolling, and it knocks the player back rather than
  // hitting hard: what a scree costs is position, at the moment position is
  // the only thing that matters.
  scree: {
    head: { r: 0.3, y: 0.86 },
    hp: 46, speed: 2.6, damage: 9, value: 220, color: 0x9aa5b1, eye: 0xdfe6ef,
    scale: 1.05, radius: 0.52, mass: 2,
    melee: { windup: 0.5, start: 1.6, hit: 2.2, cd: 1.4 },
    build: buildScree, ai: aiScree,
  },

  // Throws flat, and the stone BOUNCES ONCE off a wall. A slinger in the open
  // is the least dangerous gunner in the game; a slinger while the player is
  // backed into a corner is throwing two stones with one arm.
  //
  // One bounce, never two. A round that kept caroming would be unreadable -
  // the player has to be able to look at the line, look at the wall behind
  // them, and know where it comes out.
  slinger: {
    head: { r: 0.3, y: 1.46 },
    hp: 30, speed: 2.4, damage: 9, value: 240, color: 0x8b96a3, eye: 0xdfe6ef,
    scale: 1.0, radius: 0.48, mass: 1,
    orbit: { dist: 13, band: 2, out: 0.8, in: -0.6, strafe: 0.4, flip: 2.2, flipVar: 2 },
    proj: {
      core: 0xdfe6ef, glow: 0x9aa5b1, scale: 0.7,
      speed: [17, 0.3, 26], dmg: [8, 0.5, 18],
      // See Projectile: it reflects off the arena WALLS this many times before
      // it breaks. The walls only - an obstacle has no face normal to hand.
      bounce: 1,
    },
    build: buildSlinger, ai: aiSlinger,
  },

  // Comes up through the FLOOR, and not where the player is - where they have
  // BEEN. It remembers the last few places they stood and erupts under all of
  // them at once.
  //
  // So it is the one enemy in the game that punishes a MOVEMENT PATTERN rather
  // than a position. Circling is the strongest thing a player can do against
  // almost everything else in the roster, and the geode is what charges for
  // it: a wide steady orbit puts three spikes exactly on the arc you are about
  // to come round to. Break the circle and it hits nothing at all.
  //
  // No direct damage of its own, like every other artillery in the game.
  geode: {
    head: { r: 0.3, y: 0.5 },
    hp: 48, speed: 1.8, damage: 0, value: 280, color: 0x7d8894, eye: 0xffd166,
    scale: 1.15, radius: 0.56, mass: 2,
    orbit: { dist: 15, band: 2.5, out: 0.6, in: -0.5, strafe: 0.25, flip: 2.6, flipVar: 2 },
    build: buildGeode, ai: aiGeode,
  },

  // Sits in the truss and does nothing. It is armoured up there, it does not
  // attack, and it will hold that perch for the whole wave if the player never
  // walks underneath it - which makes it the only enemy in the game that is
  // genuinely OPTIONAL, and the only one that is a decision about ammunition
  // rather than about danger.
  //
  // Walk under it and it comes down like a dropped block: a shockwave where it
  // lands, and then it is on the floor, unarmoured, and has to climb all the
  // way back up. The whole enemy is that one trade - the ceiling is safe for
  // it and the floor is not, and the player decides which one it is on.
  gargoyle: {
    head: { r: 0.28, y: 0.3 },
    hp: 58, speed: 3.0, damage: 18, value: 320, color: 0x6f7a86, eye: 0xffd166,
    scale: 1.1, radius: 0.52, mass: 2,
    fly: { height: 6.2 },
    hitbox: { r: 0.62, y: 0.6 },
    // It fights on the FLOOR once it has come down, so it needs the block
    // aiMelee reads - the only flier in the roster that does. Without it the
    // melee cycle dereferences an undefined `melee` the first time one lands,
    // which is a crash the moment a player walks under one.
    melee: { windup: 0.55, start: 2.0, hit: 2.6, cd: 1.6 },
    // Armoured ONLY while it is up there. Not directional - it is a block of
    // stone with its wings folded over it - so armorDefault is the same
    // function, which is the lesson the Pale Crown's shell taught.
    armor: (e) => (e.perched ? GARGOYLE_PERCH_ARMOR : 1),
    armorDefault: (e) => (e.perched ? GARGOYLE_PERCH_ARMOR : 1),
    build: buildGargoyle, ai: aiGargoyle,
  },

  // Punishes shooting into a crowd. It has no attack at all: it projects a
  // dome that makes every enemy standing in it UNKILLABLE, and the answer is
  // always the same - stop firing at the stone-grey ones and go through the
  // warden.
  //
  // Everything about it is built to be unmissable rather than clever. The
  // dome is drawn at exactly the radius it works at, the ring on the floor
  // says where the edge is from inside it, and anything it is protecting turns
  // to stone. A player who cannot tell why their shots stopped landing is the
  // one failure this enemy can have.
  warden: {
    hp: 70, speed: 2.0, damage: 0, value: 360, color: 0x9aa5b1, eye: 0xfff2b0,
    scale: 1.2, radius: 0.52, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.7, in: -0.6, strafe: 0.3, flip: 2.2, flipVar: 2 },
    build: buildWarden, ai: aiWarden,
  },

  // The whole theme at boss scale: the FLOOR fights you. Five attacks, one
  // per surface the roster teaches - a stomp for the space it stands on, a
  // fault line racing toward where you stood, a lane it comes down fast
  // enough to tear up behind it, shells that answer how you are moving, and
  // a ceiling that spends your floor as rubble. Between them it prowls and
  // weaves rather than parking in a corner, and it CHASES the whole fight.
  //
  // It used to sit off at twenty metres and shell: the one fight in the
  // rotation with no pressure in it, where the barrage was the whole boss and
  // the barrage is a thing you walk out of. Now nothing about it is remote -
  // and nothing about it is armoured. The kit buys space and takes ground;
  // health and plating are not what it spends.
  siege: {
    head: { r: 0.42, y: 1 },
    hp: 3200, speed: 3.6, damage: 22, value: 5000, color: 0x455a64, eye: 0xff5533,
    scale: 2.6, radius: 1.6, mass: 6, boss: true,
    hitbox: { r: 0.72, y: 0.85 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // Reach and windup scaled off a 1.6m body: it is more than three times the
    // width of a chaser, so the same numbers would have it swinging at air.
    // Quicker than it was, because the stomp next door is the real threat and
    // the swing only needs to keep it honest.
    melee: { windup: 0.45, start: 3.4, hit: 4.4, cd: 1.9 },
    build: buildSiege, ai: aiSiege,
    cleanup: releaseMarks,
  },
};

Object.assign(ENEMY_TYPES, TYPES);
