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

import * as THREE from 'three';
import {
  resolveCircle, pointInObstacle, groundSurface, AGENT_HEIGHT, BOSS_HEIGHT, STEP_HEIGHT,
} from './utils.js';

// Base stats before per-wave scaling (waves.js supplies the multipliers).
//
// A TYPE IS A STAT BLOCK PLUS TWO FUNCTIONS. `build(e, group, s)` adds the
// parts that make it look like itself; `ai(e, a)` decides what it does with a
// frame. Both live on the entry rather than in a `type === ...` chain, the
// same shape WEAPONS.build() and UPGRADES.apply() already use: with fifteen
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
const BULWARK_SHIELD_ARMOR = 0.2;
// What the Overgrowth's shut canopy takes off a hit. Up here with the other
// two for the same reason - it is read inside the ENEMY_TYPES literal below.
// Low, because unlike every other gate in the game this one is entirely the
// player's to open: they are not waiting for it, they are deciding whether the
// eight metres is worth it, and a shut canopy has to make that a real question
// rather than a formality.
const OVERGROWTH_ARMOR = 0.22;
// What a perched gargoyle takes off a hit. HIGH - higher than anything short
// of the Pale Crown's shell - because the answer to a gargoyle is not to shoot
// it, it is to not walk under it. Making the perch merely tough would turn an
// optional enemy into an expensive one.
const GARGOYLE_PERCH_ARMOR = 0.12;
// What a glacier's ice takes off a hit while the crust is still on. Up here
// beside the bulwark's for the same reason: both are read inside the
// ENEMY_TYPES literal below, and a const declared after it is still in the
// temporal dead zone when the table is built.
//
// Under a half, so the top of a glacier's bar is a real grind - and nowhere
// near the bulwark's eighty per cent, because a buckler is a small target you
// can shoot AROUND and this covers the whole enemy.
const GLACIER_SHELL_ARMOR = 0.45;
// Scratch vectors for that armour test. It runs once per pellet on a shotgun
// and allocating there would litter the heap through a whole magazine.
const _armorA = new THREE.Vector3();
const _armorB = new THREE.Vector3();

export const ENEMY_TYPES = {
  chaser: {
    hp: 42, speed: 3.4, damage: 12, value: 100, color: 0xff3b30, eye: 0xffe08a,
    scale: 1, radius: 0.5, mass: 1,
    melee: { windup: 0.45, start: 1.5, hit: 2.2, cd: 1.1 },
    build: buildChaser, ai: aiMelee,
  },
  shooter: {
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
    hp: 180, speed: 1.8, damage: 25, value: 300, color: 0xff6b00, eye: 0xffaa00,
    scale: 1.5, radius: 0.5, mass: 1,
    melee: { windup: 0.8, start: 3.5, hit: 4.0, cd: 3.0 },
    build: buildTank, ai: aiMelee,
  },
  sniper: {
    hp: 18, speed: 2.2, damage: 15, value: 200, color: 0xffd54f, eye: 0xfff3c4,
    scale: 0.9, radius: 0.5, mass: 1,
    orbit: { dist: 22, band: 2, out: 0.8, in: -0.5, strafe: 0.4, flip: 2, flipVar: 3 },
    proj: {
      core: 0xfff3c4, glow: 0xffd54f, scale: 0.5,
      speed: [22, 0.4, 32], dmg: [12, 0.5, 22],
    },
    build: buildSniper, ai: aiSniper,
  },
  splitter: {
    hp: 30, speed: 3.0, damage: 10, value: 120, color: 0xd6329a, eye: 0xffb0e8,
    scale: 1.0, radius: 0.5, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildSplitter, ai: aiSplitter,
  },
  bomber: {
    hp: 35, speed: 2.0, damage: 18, value: 180, color: 0xff4400, eye: 0xff8844,
    scale: 1.1, radius: 0.5, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.6, in: -0.3, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildBomber, ai: aiBomber,
  },

  // ---- the second roster -------------------------------------------------
  // Four types that ask for something the original six never did: watch your
  // back, get around it, shoot the right one first, and move.

  // Punishes tunnel vision. Fragile and fast, and it does not approach in a
  // straight line - it blinks past you and swings from behind, so a player
  // who has locked onto the crowd in front loses health to something they
  // never saw. Cheap in HP because it is meant to die the moment it is noticed.
  wraith: {
    hp: 26, speed: 4.2, damage: 11, value: 190, color: 0x6f5bff, eye: 0xd0c4ff,
    scale: 0.95, radius: 0.45, mass: 1,
    melee: { windup: 0.35, start: 1.4, hit: 2.0, cd: 0.9 },
    build: buildWraith, ai: aiWraith,
  },

  // ---- the rest of VOID ---------------------------------------------------
  //
  // The theme that takes SPACE away. Nothing here hurts you the ordinary way -
  // a warp round does modest damage, a singularity does none at all, and a
  // monolith is too slow to catch anybody. What they take instead is the three
  // things a player uses space for: the cover they are behind, the ground they
  // meant to stand on, and the distance they were keeping.
  //
  // SO IT IS THE ONLY THEME THAT CANNOT BE ANSWERED BY POSITIONING, which is
  // the answer to every other theme in the game. EMBER is answered by moving
  // off the fire, RIME by leaving the field, STRATA by getting out of the
  // corner. Against VOID the position you were about to take is the thing it
  // has already taken.
  //
  // THE SHARED SILHOUETTE IS THE UNFINISHED EDGE. Floating masses with no legs
  // under them, held apart with gaps that do not close, and every one of them
  // missing the part that would make it a body. Where STRATA is cut and RIME
  // is faceted, VOID is INCOMPLETE - shapes the eye keeps trying to finish.

  // Fires into a rift and the round comes out of a second one somewhere else.
  // COVER DOES NOT WORK: there is no line between a warp and the player for a
  // pillar to interrupt, because the round does not travel along it.
  //
  // What answers it instead is the EXIT, which opens a beat before the round
  // arrives and hangs in the air where it is going to come from. So the enemy
  // is not unfair, it is a different question - the player is reading a point
  // in space rather than a line, and stepping off the point.
  warp: {
    hp: 27, speed: 2.5, damage: 8, value: 250, color: 0x8b7bff, eye: 0xd0c4ff,
    scale: 1.0, radius: 0.46, mass: 1,
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.7, strafe: 0.5, flip: 1.8, flipVar: 2 },
    proj: {
      core: 0xd0c4ff, glow: 0x6f5bff, scale: 0.7,
      speed: [15, 0.3, 24], dmg: [8, 0.5, 18],
    },
    build: buildWarp, ai: aiWarp,
  },

  // A slab that walks THROUGH the arena. It does not path around cover and it
  // does not climb - it passes through pillars, crates and decks as though
  // they were not there, in a dead straight line, forever.
  //
  // Which makes it the one enemy in the game that cannot be broken line of
  // sight with. Everything else in the roster is answerable by putting
  // something solid between you and it; the monolith is answerable only by
  // distance and by killing it, and it is slow enough that both are genuinely
  // available. What it costs is the corner you were going to hide in.
  //
  // Immovable. A slab this size being shoved by a shockwave would be the
  // silliest thing in the game.
  monolith: {
    hp: 175, speed: 1.45, damage: 22, value: 350, color: 0x5a4fd0, eye: 0xd0c4ff,
    scale: 1.5, radius: 0.62, mass: 5,
    melee: { windup: 0.9, start: 3.0, hit: 3.6, cd: 2.6 },
    build: buildMonolith, ai: aiMonolith,
  },

  // Lobs a well that PULLS. It does no damage at all - it drags the player in
  // toward the point where it landed and holds them there for a couple of
  // seconds, and everything else in the room does the rest.
  //
  // The purest expression of the theme: a singularity on its own is completely
  // harmless, and a singularity next to a monolith is the reason the monolith
  // catches somebody. It is the enemy that makes the wave's other enemies
  // work, which is the artillery role's job done in the only currency VOID
  // spends.
  singularity: {
    hp: 42, speed: 1.85, damage: 0, value: 290, color: 0x7c4dff, eye: 0xd0c4ff,
    scale: 1.1, radius: 0.54, mass: 1,
    orbit: { dist: 14, band: 2.5, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    proj: { core: 0xd0c4ff, glow: 0x7c4dff, scale: 1.3 },
    build: buildSingularity, ai: aiSingularity,
  },

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

  // ---- TEMPEST ------------------------------------------------------------
  //
  // The theme of CHARGE, and the only one whose threats are LINES BETWEEN TWO
  // POINTS rather than areas around one. Every other theme in the game asks
  // the player about a place - the fire is here, the ice is there, the boulder
  // is coming down this lane. TEMPEST asks about a SEGMENT: two arclings and
  // the span between them, a coil and the sightline it is holding, a
  // Conductor and each pylon it has raised. There is nothing dangerous at
  // either end and everything dangerous in the middle.
  //
  // WHICH MAKES IT THE THEME ANSWERED BY GEOMETRY. Not by leaving an area, and
  // not by outrunning anything - by noticing which two things are joined and
  // standing off the line, or by cutting it at one end.
  //
  // THE SHARED SILHOUETTE IS THE GAP THAT SPARKS. Every one of these is built
  // as a pair of prongs or forks with a bright core suspended in the space
  // between them, on thin rods rather than mass. Where VOID is incomplete and
  // STRATA is cut, TEMPEST is HELD APART - the gap is not missing, it is the
  // working part, and the eye reads it as something under load.

  // Tethers itself to the nearest other arcling and drags a live wire between
  // them. Standing on that wire hurts; standing beside either arcling does
  // not.
  //
  // The only crowd-GEOMETRY enemy in the game. Everything else in the roster
  // is answered one body at a time, and this one cannot be - a single arcling
  // is a weak rusher and a pair of them is a fence across the room. The answer
  // is to kill ONE, which cuts the line, and the mistake is to fight the crowd
  // in the order it arrives.
  arcling: {
    hp: 30, speed: 4.0, damage: 7, value: 210, color: 0x4ef3ff, eye: 0xd6feff,
    scale: 0.9, radius: 0.44, mass: 1,
    melee: { windup: 0.32, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildArcling, ai: aiArcling,
  },

  // The one ranged enemy in the game that is not beaten by moving.
  //
  // It charges a bolt between its horns for a beat and then fires it INSTANTLY
  // - there is no projectile in the air to dodge, so a player who watches the
  // charge and steps sideways is hit anyway. What beats it is putting
  // something solid in the way before the charge finishes: the line of sight
  // is re-tested at the instant of the shot, and a blocked coil discharges
  // into the obstacle and loses the whole cycle.
  //
  // So it is the enemy that makes COVER the answer, in a game whose every
  // other threat is answered by leaving where you are - and it is deliberately
  // paired in the same theme with the arcling and the Conductor, both of which
  // punish standing still. TEMPEST asks the player to keep choosing between
  // them.
  coil: {
    hp: 24, speed: 2.2, damage: 14, value: 270, color: 0x2fd8e8, eye: 0xd6feff,
    scale: 1.0, radius: 0.48, mass: 1,
    orbit: { dist: 13, band: 2.5, out: 0.85, in: -0.7, strafe: 0.4, flip: 2, flipVar: 2 },
    // NO `proj` BLOCK, and that absence is the mechanic: a coil never puts
    // anything in the air. The bolt is a beam drawn for a tenth of a second
    // and damage applied on the same frame.
    build: buildCoil, ai: aiCoil,
  },

  // Punishes the reflex the whole rest of the game trains: shoot the big thing
  // until it stops.
  //
  // It STORES what it is hit with, and every time the meter fills it dumps the
  // charge back out as a shockwave. So emptying a magazine into it at close
  // range is the worst thing a player can do, and the same magazine fired from
  // eight metres out is free. It is not immune and it is not armoured - the
  // health comes off exactly as it looks like it does - the cost is paid in
  // WHERE the player was standing when the meter filled.
  //
  // The meter is a fraction of its own bar rather than a flat number, because
  // its bar scales with the wave and a flat hundred would discharge four times
  // a second at wave forty.
  dynamo: {
    hp: 165, speed: 1.5, damage: 20, value: 340, color: 0x1fb6c9, eye: 0xd6feff,
    scale: 1.4, radius: 0.62, mass: 3,
    melee: { windup: 0.7, start: 2.6, hit: 3.2, cd: 2.1 },
    build: buildDynamo, ai: aiDynamo,
  },

  // Marks the floor and strikes it - and unlike every other telegraphed strike
  // in the game the mark is only half of it. What lands is a bolt, and what it
  // LEAVES is an electrified patch that goes on being lethal for a few seconds
  // afterwards.
  //
  // So the circle is not "be elsewhere for a moment", it is "that ground is
  // gone now". Siege's barrage and the geode's spikes are both answered by
  // stepping out and stepping straight back in; this one is answered by
  // giving the position up.
  stormcaller: {
    hp: 44, speed: 1.9, damage: 0, value: 300, color: 0x38c6ff, eye: 0xd6feff,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 15, band: 2.5, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildStormcaller, ai: aiStormcaller,
  },

  // No attack. It plates everything around it with a single-hit shield, and
  // the shield has to be broken before any of that enemy's health comes off.
  //
  // DELIBERATELY NOT THE WARDEN. A warden's dome is total immunity that lapses
  // the moment it dies, so it converts a crowd into a wall and the answer is
  // simply to kill the warden. A plate is one hit, it stays on the body after
  // the capacitor is dead, and it is re-applied on a cooldown rather than
  // refreshed every frame - so ignoring a capacitor costs one extra shot per
  // enemy per cycle rather than costing everything, and the decision it asks
  // for is about DPS rather than about targeting.
  capacitor: {
    hp: 62, speed: 2.1, damage: 0, value: 340, color: 0x7ef0ff, eye: 0xd6feff,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 11, band: 2, out: 0.8, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildCapacitor, ai: aiCapacitor,
  },

  // No attack at all. It comes over the top and SHOVES - off the deck the
  // player climbed to, out of the doorway they were holding, into whatever
  // else the wave has on the floor.
  //
  // The only flier that deals no damage of any kind, and the only enemy in the
  // game whose whole payload is the player's own position being wrong. It is
  // the air half of what the singularity does on the ground, and the two are
  // in different themes on purpose: a well takes the ground the player was
  // leaving and a squall takes the ground they were standing on.
  squall: {
    hp: 52, speed: 4.2, damage: 0, value: 300, color: 0x8fe8ff, eye: 0xd6feff,
    scale: 1.05, radius: 0.5, mass: 1,
    fly: { height: 3.6 },
    hitbox: { r: 0.6, y: 0.5 },
    build: buildSquall, ai: aiSquall,
  },

  // THE CONDUCTOR'S PYLON. Structurally the Pale Crown's anchor - it stands
  // there, it does nothing, and the only thing it has to do is be found and
  // broken - and it is a separate type rather than a reskin because the two
  // are read completely differently: an anchor is a lock on a door, and a
  // pylon is one END OF A LINE the player can see aimed across the room.
  pylon: {
    hp: 120, speed: 0, damage: 0, value: 90, color: 0x4ef3ff, eye: 0xd6feff,
    scale: 1.2, radius: 0.5, mass: 6,
    hitbox: { r: 0.6, y: 0.9 },
    statusMul: 0.5, fearMode: 'stagger', entropyExempt: true,
    build: buildPylon, ai: aiPylon,
  },

  // ---- BRINE --------------------------------------------------------------
  //
  // The theme of things that WILL NOT LET GO. Every other theme in the game
  // asks the player to be somewhere else - off the fire, out of the field, off
  // the line - and BRINE is built so that being somewhere else is the thing it
  // takes away. A gulper is carried with you. A barnacle drags you back. A
  // vent leaves a wall where you were going. An ink cloud does not stop you
  // moving, it stops you knowing where you are.
  //
  // SO IT IS THE THEME OF THE ANSWER BEING TAKEN, where VOID is the theme of
  // the position being taken. VOID moves you; BRINE holds you.
  //
  // THE SHARED SILHOUETTE IS A SHELL THAT DOES NOT FIT. Smooth swollen masses
  // under hard crusted plate, always a size out - too small and the body
  // bulges past it, too big and it hangs off. And every one of them trails
  // something: a lure, a siphon, a frond, a curtain. Where TEMPEST is held
  // apart and STRATA is cut, BRINE is ENCRUSTED and it HANGS.

  // Latches on. On contact it stops being an enemy in the room and becomes
  // something the player is CARRYING, draining while it rides - and the only
  // ways off are a melee swing, a dash, or waiting it out.
  //
  // THE ONE ENEMY YOU WEAR. Everything else in the game is answered with the
  // gun, and this is the one that cannot be: it is at the player's own
  // position, which is the single place a first-person crosshair can never be
  // pointed. So it is the enemy that makes the melee button and the dash into
  // answers rather than into flourishes, and its whole design is a nudge
  // toward the two inputs the roster otherwise never requires.
  //
  // Weak in the bite for the afflictor's reason: what it does after the hit is
  // where its cost lives.
  gulper: {
    hp: 34, speed: 3.9, damage: 6, value: 220, color: 0x1f8a8a, eye: 0x8ff0e0,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.3, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildGulper, ai: aiGulper,
  },

  // Hangs at the back of the room behind a lure and throws slow homing
  // bubbles that CAN BE SHOT OUT OF THE AIR.
  //
  // The only enemy round in the game that is a target. Every other projectile
  // is a thing to dodge, and this one is a thing to decide about: it homes, so
  // it cannot simply be walked away from, and it is slow and soft, so a single
  // round kills it. What it costs is that round - which is why the angler is
  // the enemy that rewards trigger discipline and punishes a magazine already
  // dumped into the crowd.
  angler: {
    hp: 22, speed: 2.1, damage: 10, value: 280, color: 0x17706f, eye: 0xa8ffe8,
    scale: 1.05, radius: 0.48, mass: 1,
    // FURTHER OUT than any gunner but the sniper. The bubble is slow and the
    // player needs the seconds to decide about it, and an angler at eight
    // metres would be throwing a round that arrives before the decision does.
    orbit: { dist: 17, band: 3, out: 0.85, in: -0.75, strafe: 0.35, flip: 2, flipVar: 2 },
    proj: {
      core: 0xa8ffe8, glow: 0x17706f, scale: 1.1,
      // Slow, and it stays slow: the cap is barely over the base, because a
      // homing round that outruns the player at wave forty is not a decision,
      // it is a tax.
      speed: [8, 0.12, 12], dmg: [9, 0.4, 16],
      // How hard it turns, in radians a second, and that it is a target.
      home: 1.5, shootable: true,
    },
    build: buildAngler, ai: aiAngler,
  },

  // Plated, slow, and it ANCHORS: every few seconds it roots itself where it
  // stands and drags the player in with a current, so the plates are facing
  // them whether they wanted to be in front of it or not.
  //
  // The brute that cannot be kited. A tank is answered by walking backwards, a
  // dynamo by standing further off and a glacier by patience; this one closes
  // the distance for you while standing still, and the answer is to break the
  // pull by putting something solid between you - the only brute in the game
  // that cover is the counter to.
  barnacle: {
    hp: 178, speed: 1.45, damage: 22, value: 350, color: 0x14615f, eye: 0x8ff0e0,
    scale: 1.4, radius: 0.64, mass: 4,
    melee: { windup: 0.75, start: 2.8, hit: 3.4, cd: 2.2 },
    build: buildBarnacle, ai: aiBarnacle,
  },

  // Erupts a scalding column on a telegraph - and the column STAYS, as a solid
  // pillar, for two seconds after it has stopped burning.
  //
  // THE ONLY ARTILLERY THAT LEAVES COVER BEHIND IT. Everything else this role
  // does takes ground away; this one adds it, and it is not the player's. A
  // vent that walls off the lane you were about to run is doing exactly what
  // a stormcaller's patch does by the opposite means, and a vent that walls
  // off the angler you were about to shoot has just spent its cooldown
  // helping you. Which of the two it is depends entirely on where the player
  // was standing, and that is the enemy.
  vent: {
    hp: 46, speed: 1.8, damage: 0, value: 310, color: 0x2a9d8f, eye: 0xa8ffe8,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 16, band: 2.5, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildVent, ai: aiVent,
  },

  // Rains a curtain of ink that BLOCKS THE VIEW where it falls.
  //
  // The only enemy in the game that attacks information rather than health. It
  // does no damage at all and the ink does none either - what it costs is
  // knowing where the rest of the wave is, which in a room with a barnacle and
  // an angler in it is worth more than a health bar. And it is the flier,
  // deliberately: the curtain comes down from above and across, so it cannot
  // be shot off the floor and the answer is to move out from under it.
  drifter: {
    hp: 58, speed: 3.1, damage: 0, value: 300, color: 0x0f4c4c, eye: 0x8ff0e0,
    scale: 1.1, radius: 0.5, mass: 1,
    fly: { height: 4.2 },
    hitbox: { r: 0.62, y: 0.5 },
    build: buildDrifter, ai: aiDrifter,
  },

  // ---- PLAGUE -------------------------------------------------------------
  //
  // The theme of things that are NOT FINISHED WHEN THEY DIE. A splitter breaks
  // into three, a husk bursts, a vitriol's cloud outlives the throw - and the
  // three added here carry the same idea into the other roles: a round that
  // rots the floor whether or not it hit, a body that gets back up, and a sack
  // that is more dangerous as a corpse than as an enemy.
  //
  // SO IT IS THE THEME WHERE CLEARING THE ROOM IS THE MISTAKE. Every other
  // theme rewards killing things in front of you; this one charges for it, and
  // the question it asks is not what to kill but what order and where.
  //
  // THE SHARED SILHOUETTE IS THE SPLIT SEAM. Every body is a bloated mass with
  // a hard rind that has burst open somewhere - a crack down the middle, a lid
  // lifted off, a flank hanging loose - and something soft showing through.
  // Where BRINE is grown over, PLAGUE is SPLITTING.

  // Burst fire that rots the floor WHEREVER IT LANDS. A round that misses
  // leaves a puddle exactly like a round that hits, so the ground behind the
  // player fills up with the shots they dodged.
  //
  // The only gunner in the game whose misses cost the player anything, which
  // makes it the one that cannot be beaten by movement alone - strafing a
  // lesion writes a wall of poison across the arc you strafed through, and the
  // way out is to kill it or to break the angle rather than to keep moving.
  lesion: {
    hp: 26, speed: 2.3, damage: 8, value: 270, color: 0xb3327a, eye: 0xffb0e8,
    scale: 1.0, radius: 0.48, mass: 1,
    orbit: { dist: 12, band: 2.5, out: 0.8, in: -0.65, strafe: 0.45, flip: 1.8, flipVar: 2 },
    proj: {
      core: 0xffb0e8, glow: 0xcc3d8a, scale: 0.6,
      speed: [17, 0.3, 25], dmg: [7, 0.35, 13],
      // WHAT IT LEAVES. Read by _updateProjectiles when the round stops, on a
      // wall or on the player alike - the whole enemy is in this one row.
      leave: { kind: 'bile', radius: 1.5, life: 4.5, dps: 7 },
    },
    build: buildLesion, ai: aiLesion,
  },

  // No attack. It RAISES one enemy that dies near it, once each, at a fraction
  // of the health it had - so a wave cleared in front of a carrion is a wave
  // that gets back up behind the player.
  //
  // The support that makes killing things WRONG. A conduit makes the crowd
  // tougher, a warden makes it unkillable and a capacitor makes it cost more;
  // this one makes the act of clearing the room the thing that feeds it, and
  // the only answer is to find it first - which is the same answer as always,
  // arrived at from the opposite direction.
  carrion: {
    hp: 66, speed: 2.0, damage: 0, value: 350, color: 0x8f2f68, eye: 0xffb0e8,
    scale: 1.2, radius: 0.52, mass: 1,
    orbit: { dist: 13, band: 2.5, out: 0.8, in: -0.6, strafe: 0.3, flip: 2, flipVar: 2 },
    build: buildCarrion, ai: aiCarrion,
  },

  // A slow airborne sack. It does no damage at all in the air, dives onto the
  // ground the player is standing on, and BURSTS - a cloud of gas over
  // wherever it came down, whether that was where it was aimed or not.
  //
  // The husk's argument in the air, and the difference is who chooses the
  // ground: a husk bursts where the player decided to fight it, and a bloatfly
  // bursts where the player was standing two seconds ago. Between them the
  // theme charges for both standing still and for having stood still.
  bloatfly: {
    hp: 60, speed: 3.2, damage: 0, value: 300, color: 0x9c3a86, eye: 0xffb0e8,
    scale: 1.15, radius: 0.5, mass: 1,
    fly: { height: 3.4 },
    hitbox: { r: 0.64, y: 0.55 },
    // It bursts however it dies, which is the point: shooting it out of the
    // air over your own head is a decision, not a free kill.
    onDeath: (e, ctx) => {
      ctx.addHazard(e.pos.x, e.pos.z, BLOAT_CLOUD_R, BLOAT_CLOUD_LIFE, GAS_DPS, 'gas');
      if (ctx.effects) {
        _plagueAt.set(e.pos.x, Math.max(0.6, e.pos.y), e.pos.z);
        ctx.effects.burst(_plagueAt, 0xffb0e8, 28, 5, 2.4, 0.8);
      }
    },
    build: buildBloatfly, ai: aiBloatfly,
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
    hp: 64, speed: 2.2, damage: 0, value: 350, color: 0xffe9a8, eye: 0xfff3c4,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 10, band: 2, out: 0.8, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildHalo, ai: aiHalo,
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

  // Punishes holding one good spot. Lobs pools that make the floor where you
  // are standing cost health, so the answer is always to give up the position.
  // Does no direct damage: the ground it leaves behind is the whole threat.
  blight: {
    hp: 48, speed: 1.9, damage: 0, value: 240, color: 0x7ac943, eye: 0xd6ff8a,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    // The blight's spit and the pool it leaves wear the same toxic green, so
    // the glob in the air and the patch it becomes are obviously one thing.
    // A Spit carries its own flight, so there is no speed or damage curve
    // here - the payload is the ground it grows.
    proj: { core: 0xd6ff8a, glow: 0xaaff2a, scale: 1.3 },
    build: buildBlight, ai: aiBlight,
  },

  // ---- the rest of VERDANT ------------------------------------------------
  //
  // The theme of THINGS THAT ARRIVE LATE. EMBER puts fire where you are and
  // RIME takes your legs now; nothing in VERDANT happens at the moment it is
  // thrown. A seed lands and is harmless for two seconds. A charge commits and
  // then cannot be called back. A cloud outlives the thing that made it. A
  // wound closes back up behind you.
  //
  // WHICH MAKES IT THE THEME ABOUT MEMORY rather than reflexes: nothing here
  // is dodged, it is all anticipated, and the mistake it punishes is treating
  // a floor you have already looked at as a floor you still know.
  //
  // THE SHARED SILHOUETTE IS GROWTH. Bark-plated trunks with things sprouting
  // OUT of them at angles - fronds, thorns, spore caps - so the outline is
  // ragged where EMBER's is lumpen and RIME's is faceted. Nothing in this
  // theme has a clean edge.

  // Charges in straight lines and cannot turn while it does. It overshoots,
  // has to swing wide and come back, and the whole enemy is that loop: the
  // player is never running from it, they are stepping off its line.
  //
  // Cheap and fast, because a charger that also had to be shot down twice
  // would be a brute. What it costs is the ground you were standing on when
  // it committed - which is exactly the theme's bargain, one second early.
  thornling: {
    hp: 40, speed: 3.2, damage: 11, value: 210, color: 0x7ea63c, eye: 0xd6ff8a,
    scale: 1.0, radius: 0.5, mass: 1,
    melee: { windup: 0.4, start: 1.5, hit: 2.1, cd: 1.2 },
    build: buildThornling, ai: aiThornling,
  },

  // Lobs seeds that do NOTHING when they land, and sprout two seconds later
  // into a burst of thorns. The circle fills on the floor while they do, so it
  // is the most generous threat in the game and the easiest to forget about.
  //
  // A gunner whose rounds are harmless in the air is a strange thing, and it
  // is the point: a sporegun cannot punish you at all in the moment. What it
  // does is take the floor you will want in two seconds, which is only a
  // problem for a player who is being pushed onto it by something else - so it
  // is the type that makes the rest of the theme's crowd matter.
  sporegun: {
    hp: 28, speed: 2.2, damage: 7, value: 230, color: 0x9fbf4a, eye: 0xd6ff8a,
    scale: 1.05, radius: 0.48, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.4, flip: 2.3, flipVar: 2 },
    proj: { core: 0xd6ff8a, glow: 0x7ea63c, scale: 1.1 },
    build: buildSporegun, ai: aiSporegun,
  },

  // Covered in thorns. Standing next to it costs health whether or not it is
  // swinging, and MELEEING it costs more - so it is the one enemy in the game
  // that answers the melee button, and the one that punishes using a big body
  // as cover from the crowd behind it.
  //
  // Priced in the lower half of the brute band, because the aura is damage it
  // deals for free and the rule is that a type is charged for what it does
  // without being asked.
  bramblehide: {
    hp: 150, speed: 1.6, damage: 14, value: 320, color: 0x6b8f3a, eye: 0xd6ff8a,
    scale: 1.45, radius: 0.62, mass: 2,
    melee: { windup: 0.8, start: 2.9, hit: 3.5, cd: 2.4 },
    build: buildBramblehide, ai: aiBramblehide,
  },

  // Roots itself and closes the wave's wounds. No attack: what it costs is the
  // damage you already did, which is the one thing in the game a player cannot
  // see being taken away from them.
  //
  // SO IT IS LOUD ABOUT IT. A beam to everything it is mending, and it stops
  // dead the moment it dies - the conduit's shape, doing the one job no other
  // support does. It is the DPS check of the roster: a player who ignores it
  // is not losing, they are simply not winning, and working out why is the
  // whole puzzle.
  heartwood: {
    hp: 74, speed: 1.9, damage: 0, value: 380, color: 0x8fbf4a, eye: 0xd6ff8a,
    scale: 1.25, radius: 0.55, mass: 2,
    orbit: { dist: 12, band: 2.5, out: 0.6, in: -0.7, strafe: 0.25, flip: 2.6, flipVar: 2 },
    build: buildHeartwood, ai: aiHeartwood,
  },

  // The only LOW flier in the game. It drifts at head height trailing a cloud
  // of spores that outlives it, so it is not something to be shot down so much
  // as something to be shot down FROM SOMEWHERE ELSE - killing one overhead
  // leaves the cloud exactly where you are standing.
  //
  // Low on purpose. The other two fliers are read against the ceiling and
  // answered by looking up; this one is in the crowd, at the height everything
  // else is, and the mistake it punishes is treating the air as a separate
  // problem from the floor.
  mothcap: {
    hp: 44, speed: 3.1, damage: 0, value: 290, color: 0xa8c93a, eye: 0xd6ff8a,
    scale: 1.0, radius: 0.5, mass: 1,
    fly: { height: 2.4 },
    hitbox: { r: 0.62, y: 0.5 },
    build: buildMothcap, ai: aiMothcap,
  },

  // Punishes running the same line the enemy is running. It walks toward the
  // player like a chaser and burns the floor behind it, so the ground it has
  // crossed stays dangerous for five seconds. Slower and weaker in melee than
  // a chaser, because the trail is where its threat actually lives - and the
  // trail is the reason to break off and take an angle rather than backpedal
  // in a straight line.
  //
  // IT IS A BRUTE NOW, not a rusher. As EMBER's heavy it does the job the trail
  // was always better at than the chase: a brute is the thing you circle while
  // you deal with the wave around it, and this is the one that charges you for
  // circling, because the circle is on fire by the second lap. As a rusher it
  // was the reverse - it walked at you laying ground you were already leaving,
  // and the trail only ever caught a player who backed up in a straight line.
  //
  // Priced into the brute band accordingly: a tank's shape, a husk's mass, and
  // damage in the LOWER half of the band, because the fire it leaves is the
  // rest of the payment (see the afflictor rule further down).
  magma: {
    hp: 150, speed: 1.8, damage: 16, value: 300, color: 0xff5a1f, eye: 0xffd166,
    scale: 1.35, radius: 0.58, mass: 2,
    melee: { windup: 0.75, start: 2.8, hit: 3.5, cd: 2.3 },
    build: buildMagma, ai: aiMagma,
  },

  // ---- the rest of EMBER -------------------------------------------------
  //
  // Four types built around one idea the theme owns outright: HEAT THAT IS
  // STILL THERE AFTER THE THING THAT MADE IT HAS MOVED ON. Every one of them
  // puts fire on the FLOOR rather than on the player, and none of them does
  // much of anything on contact - a cinder's touch is five points, a kiln and
  // a bellows deal literally nothing, an ashwing has no attack at all.
  //
  // What that buys is a theme whose question is always the same one and never
  // has the same answer twice: WHERE IS THERE LEFT TO STAND. A magma takes the
  // ground you circle on, a flare takes the ground behind you, a kiln takes a
  // rotating wedge of it and an ashwing draws a line straight through the
  // middle. None of them is dangerous on its own. Together they are a room
  // that keeps getting smaller.
  //
  // THEY SHARE A SILHOUETTE LANGUAGE. Cracked rock masses with glowing vents
  // in the gaps between them, capped in dead black crust - established by the
  // magma above and carried by all four, so an EMBER wave reads as one family
  // of things even in the flat black test.

  // Punishes holding a lane. It lobs a bursting shell rather than shooting:
  // where it lands, three patches of fire open in a fan pointing AWAY from the
  // flare, so the ground it takes is the ground behind whatever it was aiming
  // at. A player who backpedals in a straight line walks into all three; a
  // player who steps sideways walks past the fan's edge.
  //
  // The shell is slow and lit and arcs high, so it is a thing to be read and
  // moved off rather than dodged on reflex - and the answer is always to move
  // ACROSS it, which is the habit this whole theme is trying to build.
  flare: {
    hp: 30, speed: 2.4, damage: 9, value: 220, color: 0xff7a18, eye: 0xffd166,
    scale: 1.05, radius: 0.48, mass: 1,
    orbit: { dist: 11, band: 2, out: 0.7, in: -0.5, strafe: 0.4, flip: 2.2, flipVar: 2 },
    proj: { core: 0xffd08a, glow: 0xff5a1f, scale: 1.2 },
    build: buildFlare, ai: aiFlare,
  },

  // The theme's clock. It plants itself and sweeps a bar of flame around the
  // floor like a lighthouse, one step per HALF BEAT - so the arena has a
  // rotating wedge of ground you cannot be on, and the rate it turns at is the
  // track. It is the one enemy in the game you can hear coming.
  //
  // On Music.pulse rather than a timer of its own, for the reason upgrades.js
  // states outright: nothing rhythmic in this game runs on a private clock. A
  // sweep on a 0.4s interval next to a soundtrack at 144bpm would beat against
  // it and read as broken rather than as fast.
  //
  // No damage of its own, exactly like the blight and the vitriol it stands
  // beside in the artillery role. What it throws IS the enemy.
  kiln: {
    hp: 46, speed: 1.8, damage: 0, value: 290, color: 0xd2691e, eye: 0xffb347,
    scale: 1.15, radius: 0.56, mass: 2,
    build: buildKiln, ai: aiKiln,
  },

  // Turns the wave into cinders. No attack at all: while it lives, every EMBER
  // enemy near it burns you on contact as well as hitting you.
  //
  // THIS IS THE ONE PLACE THE AFFLICTOR RULE IS DELIBERATELY BROKEN, and the
  // support role is where it is allowed to be. The rule says a type that
  // leaves a status hits for less, because the status is the payment - but a
  // bellows is not the thing hitting you. It is a high-value target standing
  // behind the crowd doing no damage whatsoever, and killing it is the
  // payment, exactly as it is for the conduit's free 30% resist. What it costs
  // is having to turn away from what is in front of you.
  //
  // Short burn on purpose. It has to be a reason to shoot the bellows, not a
  // reason to stop playing the wave.
  bellows: {
    hp: 62, speed: 2.1, damage: 0, value: 340, color: 0xe2683a, eye: 0xffd166,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 9, band: 2, out: 0.7, in: -0.6, strafe: 0.35, flip: 2.4, flipVar: 2 },
    build: buildBellows, ai: aiBellows,
  },

  // The bombing run. It has NO attack - it flies straight lines across the
  // arena through wherever the player was standing when it committed, and lays
  // fire the whole way, then banks out wide and comes back on a new bearing.
  //
  // Written as a RUN rather than as a hover for two reasons. It keeps it away
  // from RIME's sleet, which parks overhead and drops a column - two fliers
  // whose answer was "stop standing there" would be one flier twice. And a
  // line drawn corner to corner does something a patch cannot: it cuts the
  // floor in half, so what it costs is not the ground under it but every route
  // that crossed it.
  //
  // The commit is the tell. It rears, holds a beat, and only then runs - and
  // once it is running it cannot steer, so the whole enemy is answered by
  // being somewhere else by the time it arrives.
  ashwing: {
    hp: 52, speed: 3.6, damage: 0, value: 300, color: 0xff6a2a, eye: 0xffd166,
    scale: 1.0, radius: 0.5, mass: 1,
    fly: { height: 4.6 },
    hitbox: { r: 0.62, y: 0.5 },
    build: buildAshwing, ai: aiAshwing,
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

  // ---- the afflictors ----------------------------------------------------
  //
  // Six types built around one idea: an attack that is still working after it
  // has landed. Everything before this point resolves the moment it touches
  // you - a hit takes health, a pool takes health while you stand in it, and
  // the instant you are clear you are whole again. These leave something ON
  // the player (see status.js), and the whole design of each one is the gap
  // between when it lands and when it stops costing.
  //
  // THREE RULES HOLD ACROSS THE SIX, and they are what stop a status roster
  // from being a pile of unavoidable taxes:
  //
  //   1. THE STATUS IS THE DAMAGE, not a bonus on top of it. Every one of
  //      these hits for less than its role-mates - a cinder does five where a
  //      chaser does twelve - because what it puts on you is where the cost
  //      lives. A type that dealt full damage AND left a burn would simply be
  //      a better chaser.
  //   2. IT MUST BE REFUSABLE. Something the player can do - move, kill it
  //      first, take an angle - has to prevent it. A status that arrives
  //      whatever you do is a tax, and the correct play against a tax is to
  //      stop reading the screen.
  //   3. IT MUST BE OBVIOUS WHERE IT CAME FROM. Every one of these is loud at
  //      the moment it applies: a cloud you can see from across the arena, a
  //      ring on the floor, a beam drawn between the caster and you. The chip
  //      in the HUD says WHAT is on you; the enemy has to say WHO did it, or
  //      the player learns nothing from being hit.

  // The player's introduction to burning. Fast, brittle, and it barely hits -
  // five points, a third of a chaser's - because the fire it leaves is the
  // attack. It closes, touches you once, and what it did keeps happening for
  // four seconds while it comes back round for another.
  //
  // Refusable by not being touched, which is the most basic answer in the game
  // and the right one to teach a status with.
  cinder: {
    hp: 30, speed: 3.9, damage: 5, value: 200, color: 0xff7a18, eye: 0xffd166,
    scale: 0.95, radius: 0.46, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.2 },
    // Four seconds at the table's seven a second: 28 points spread thin, in
    // exchange for a hit that is worth almost nothing on its own.
    hitStatus: { kind: 'fire', dur: 4 },
    build: buildCinder, ai: aiMelee,
  },

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

  // Punishes killing it where you are standing. A slow, heavy sack that fights
  // like a bad tank and BURSTS when it dies, leaving a cloud of gas over its
  // own corpse - which, since it had to be killed at some point, is a cloud
  // over wherever the player chose to fight it.
  //
  // The whole enemy is one decision the player did not know they were making:
  // a brute invites you to stand and shoot, and this is the one that charges
  // you for it. Killing it at range, or moving after it dies, costs nothing.
  husk: {
    hp: 130, speed: 1.5, damage: 14, value: 300, color: 0xa03a72, eye: 0xffb0e8,
    scale: 1.4, radius: 0.6, mass: 2,
    melee: { windup: 0.8, start: 2.8, hit: 3.4, cd: 2.4 },
    onDeath: (e, ctx) => {
      ctx.addHazard(e.pos.x, e.pos.z, HUSK_CLOUD_RADIUS, HUSK_CLOUD_LIFE, GAS_DPS, 'gas');
      if (ctx.effects) {
        _blinkAt.set(e.pos.x, 0.9, e.pos.z);
        ctx.effects.burst(_blinkAt, ENEMY_TYPES.husk.eye, 26, 4, 2.2, 0.8);
      }
    },
    build: buildHusk, ai: aiMelee,
  },

  // The blight's other half. A blight makes the ground you are standing on
  // cost health while you stand on it; a vitriol throws a cloud that keeps
  // costing after you are out of it. Same lob, same lead, same tell - what is
  // different is that running through this one is not free.
  //
  // It does no direct damage at all, exactly like the blight: what it throws
  // is the entire enemy.
  vitriol: {
    hp: 46, speed: 1.9, damage: 0, value: 260, color: 0x9c3a86, eye: 0xffb0e8,
    scale: 1.12, radius: 0.55, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    // The canister, in the gas's own green rather than the blight's acid
    // yellow-green. The two lobs have to be told apart IN THE AIR - one is
    // ground to step off and the other is a cloud to not be in - and the
    // colour is the only thing available while it is still flying.
    proj: { core: 0xd6ffb0, glow: 0x4fe06a, scale: 1.4 },
    build: buildVitriol, ai: aiVitriol,
  },

  // Takes the trigger away. No attack of its own: it winds up a scream on a
  // fixed rhythm, draws the ring it will cover on the floor while it does, and
  // anything inside that ring when it lands cannot shoot for two and a half
  // seconds.
  //
  // THE RING IS THE WHOLE CONTRACT. A fear that arrived unannounced would be
  // the worst thing in the game - the player's gun stops working and nothing
  // on screen says why - so it is telegraphed longer than any other attack a
  // normal enemy has, and the answer is to walk out of a circle that is
  // already drawn for you. Standing in it and shooting the howler first is the
  // other answer, and it is the better one.
  howler: {
    // RE-THEMED FOR BRINE, palette only - the scream is unchanged. Teal
    // rather than the fear status's violet, because an enemy wears its
    // THEME and a status wears its own colour: the chip in the HUD and the
    // tint on an afflicted body are what carry fear, and the howler is a
    // thing in the water that the rest of BRINE has to look related to.
    hp: 60, speed: 2.1, damage: 0, value: 340, color: 0x2fb3a8, eye: 0xa8ffe8,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 6, band: 1.5, out: 0.8, in: -0.7, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildHowler, ai: aiHowler, cleanup: releaseHowl,
  },

  // Makes everything else hurt more. It stands further back than anything but
  // a sniper and channels, holding a beam on the player for two full seconds;
  // if it finishes, the player takes 25% more from every source for ten.
  //
  // The beam is not decoration - it is the target designation. This is the one
  // enemy in the roster whose correct answer is always "that one, now", and
  // the tether is what says so, drawn from it to you and impossible to lose in
  // a crowd. Kill it, or break the range, and the channel is wasted.
  hexer: {
    hp: 58, speed: 2.2, damage: 0, value: 380, color: 0xff2d6f, eye: 0xffd6e4,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 14, band: 2.5, out: 0.8, in: -0.6, strafe: 0.3, flip: 2.2, flipVar: 2 },
    build: buildHexer, ai: aiHexer,
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
    hp: 54, speed: 4.4, damage: 20, value: 300, color: 0xeef2ff, eye: 0xff5c7a,
    scale: 1.15, radius: 0.45, mass: 1,
    hitbox: { r: 0.55, y: 1.0 },
    fly: { height: 5.2 },
    orbit: { dist: 8, band: 2, out: 0.7, in: -0.7, strafe: 0.8, flip: 1.4, flipVar: 1.2 },
    build: buildShrike, ai: aiShrike,
  },

  // The third flier, and the only one that is not trying to kill you. It flies
  // a shrike's loop - circle, wind up, dive, climb - and its dive hits for six
  // points and takes your trigger for two and a half seconds.
  //
  // What makes it dangerous is what is in the sky WITH it. Feared under an
  // empty ceiling is two seconds of walking; feared with a shrike already
  // winding up is the shrike's hit. It is priced as the cheapest flier in the
  // roster because on its own it barely does anything, which is exactly the
  // enemy it is meant to be.
  shade: {
    hp: 46, speed: 4.6, damage: 6, value: 320, color: 0xb06bff, eye: 0xf0d6ff,
    scale: 1.1, radius: 0.45, mass: 1,
    hitbox: { r: 0.55, y: 1.0 },
    fly: { height: 5.0 },
    orbit: { dist: 8, band: 2, out: 0.7, in: -0.7, strafe: 0.8, flip: 1.4, flipVar: 1.2 },
    hitStatus: { kind: 'fear', dur: 2.5 },
    build: buildShade, ai: aiShrike,
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

  colossus: {
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

  // EMBER's boss, and the mirror of the Colossus.
  //
  // A Colossus is armoured except for a core on a fixed rhythm, so the fight
  // is a question of WHEN you are firing and the boss has no say in it. This
  // one HEATS UP as it fights - it gains attacks as the bar fills, and when it
  // fills completely it has to stop and VENT, which is when its plates come
  // apart and it takes full damage.
  //
  // So the damage window is the boss's own decision rather than a metronome,
  // and the player's job is to survive long enough to earn one. That inversion
  // is the whole fight, and it is why the vent is not simply a free five
  // seconds: while it is open it is radiating fire outward, so the window is
  // real and it is INSIDE something. Close enough to shoot, far enough not to
  // burn, and the ring is growing the whole time.
  //
  // WHAT THE HEAT BUYS IT. One attack per third of the bar, so the fight
  // visibly escalates toward the vent rather than arriving at it:
  //   below a third   it closes and swings, and that is all
  //   a third         the SWEEP - it plants and turns a bar of fire around
  //                   itself, on the beat, exactly as its kilns do
  //   two thirds      the RING - a wall of fire at a fixed radius with one gap
  //                   in it, so being at the wrong distance is now a mistake
  //   full            it must vent, and the fight resets to the top
  forge: {
    hp: 3400, speed: 2.3, damage: 30, value: 5500, color: 0xff5a1f, eye: 0xffd166,
    scale: 3.0, radius: 1.8, mass: 8, boss: true,
    hitbox: { r: 0.74, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // Reach scaled off a 1.8m body, like Siege's.
    melee: { windup: 0.7, start: 3.2, hit: 4.0, cd: 2.0 },
    // Full damage only while it is venting. armorDefault matches the shut
    // value for Colossus's reason: a damage source arriving with no direction
    // must not be able to bypass the mechanic by accident.
    armor: (e) => (e.bs.venting ? 1 : 0.34),
    armorDefault: 0.34,
    build: buildForge, ai: aiForge,
  },

  // Artillery THAT WALKS. It makes the floor the threat - circles fill on the
  // ground a second and a half before anything lands, so every shell that
  // hits is one the player was shown and stood in anyway - but it does not
  // stand off at the far wall to do it any more. It comes at you, it swings
  // when it arrives, and every few seconds it picks a lane and rushes down it.
  //
  // It used to ORBIT at twenty metres, which made it the one fight in the
  // rotation with no pressure in it: the barrage was the whole boss, and the
  // barrage is a thing you walk out of. Chasing turns the shells into what
  // they should always have been - the reason you cannot simply back away
  // from the thing walking at you.
  siege: {
    hp: 3200, speed: 2.9, damage: 22, value: 5000, color: 0x455a64, eye: 0xff5533,
    scale: 2.6, radius: 1.6, mass: 6, boss: true,
    hitbox: { r: 0.72, y: 0.85 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // Reach and windup scaled off a 1.6m body: it is more than three times the
    // width of a chaser, so the same numbers would have it swinging at air.
    melee: { windup: 0.5, start: 3.4, hit: 4.2, cd: 1.5 },
    build: buildSiege, ai: aiSiege,
    cleanup: releaseMarks,
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

  // VERDANT's boss, and the only thing in the game that never takes a step.
  //
  // IT IS ROOTED. That single decision is the fight: the player can always
  // walk away from it, so the pressure cannot come from the boss chasing and
  // has to come from the ARENA closing in instead. It grows creepers - lines
  // of thorns marching outward along the ground toward wherever the player is
  // standing - and rings itself with them when they come near.
  //
  // AND THE PLAYER CHOOSES THE WINDOW. Its canopy is shut and armoured at any
  // distance, and OPENS when they come inside eight metres. There is no clock
  // on it at all: unlike the Forge, which decides when it is vulnerable, and
  // the Pale Crown, whose anchors decide, this one is decided entirely by
  // where the player stands - and inside eight metres is exactly where the
  // rings land. The whole fight is that one trade, priced in seconds.
  overgrowth: {
    hp: 3500, speed: 0, damage: 26, value: 6500, color: 0x7ea63c, eye: 0xd6ff8a,
    scale: 3.1, radius: 2.0, mass: 10, boss: true,
    hitbox: { r: 0.76, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    // It cannot chase, so it swings at anything that comes to it - which is
    // the same eight metres the canopy opens at. Standing in the window is
    // meant to cost something even when the thorns are not up.
    melee: { windup: 0.7, start: 3.4, hit: 4.2, cd: 2.2 },
    // Open when the player is near. NOT a state it sets itself - `bs.open` is
    // recomputed from range every frame in aiOvergrowth, so the armour and the
    // model can never disagree about it.
    armor: (e) => (e.bs.open ? 1 : OVERGROWTH_ARMOR),
    armorDefault: (e) => (e.bs.open ? 1 : OVERGROWTH_ARMOR),
    build: buildOvergrowth, ai: aiOvergrowth,
    cleanup: releaseMarks,
  },

  // TEMPEST's boss, and the only fight in the game whose clock is the MUSIC.
  //
  // It counts bars on Music.pulse, exactly as the kiln's sweep and the Forge's
  // do - and unlike either of those the count is the whole fight rather than
  // one attack inside it. On each of the first three bars it drives a PYLON
  // into the floor and draws a live line to it. On the fourth it DISCHARGES
  // along every line it still has, and along every line between one pylon and
  // another, and the arena is cut into wedges by the lines the player failed
  // to remove.
  //
  // SO THE FIGHT IS PLAYED BETWEEN THE BARS, not against the boss. Three bars
  // to break as many pylons as the player can afford to turn away for, one bar
  // that charges them for the ones they left. Every pylon broken is a line
  // that does not fire, and a player who breaks all three takes a discharge
  // with nothing in it.
  //
  // Unarmoured throughout, and that is deliberate: the Forge, the Crown and
  // the Overgrowth all gate their damage, so the fourth new boss gates the
  // PLAYER'S POSITION instead and leaves the health bar alone.
  conductor: {
    hp: 3400, speed: 2.4, damage: 26, value: 6000, color: 0x4ef3ff, eye: 0xd6feff,
    scale: 2.9, radius: 1.75, mass: 8, boss: true,
    hitbox: { r: 0.72, y: 0.84 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.6, start: 3.2, hit: 4.0, cd: 2.0 },
    build: buildConductor, ai: aiConductor,
  },

  // BRINE's boss. THREE BODIES SHARING ONE HEALTH BAR, and only one of them is
  // worth killing at a time.
  //
  // One of the three is always SINGING - lit, loud, and marked - and the other
  // two are silent. Damage on any of them comes off the same pool, so the bar
  // falls whichever one is shot; what changes is what happens when one DIES.
  // Kill the singer and the choir simply carries on a body short. Kill a
  // silent one and the survivors are FREED: faster, and their attacks come
  // twice as often, for the rest of the fight.
  //
  // So it is the one boss where the wrong answer is not "too slow" but
  // "aimed at the nearest one" - and the singer rotates on its own clock, so
  // the correct target keeps moving and the player has to keep looking.
  //
  // Each body carries one of the theme's three mechanics - the drag, the ink
  // and the column - so the fight is BRINE's own roster with one bar over it.
  // It ends as a single body, enraged.
  choir: {
    hp: 3450, speed: 2.6, damage: 24, value: 6000, color: 0x1f8a8a, eye: 0xa8ffe8,
    scale: 2.5, radius: 1.5, mass: 7, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.6, start: 3.0, hit: 3.8, cd: 2.0 },
    build: buildChoir, ai: aiChoir,
    cleanup: releaseMarks,
  },

  // Splits at half health and again at a quarter, one into two into four. The
  // health here is HALF the fight's pool: the player deals 0.5H to force the
  // first split, 0.5H for the second and a full H to finish the four, so
  // clearing it costs 2x this number. See the sanity check in waves.js.
  schism: {
    hp: 1550, speed: 3.0, damage: 18, value: 6000, color: 0xd500f9, eye: 0xffb0ff,
    scale: 2.2, radius: 1.3, mass: 5, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.35, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.55, start: 2.6, hit: 3.2, cd: 1.6 },
    // The radial volley, in the boss's own violet. Eight are in the air at
    // once, so they are small and each is cheap: a fan of shooter-sized rounds
    // reads as a wall with no gap to move through, and the volley has to cost
    // real health when it catches you in the open while staying survivable
    // when one round clips you on the way past.
    proj: {
      core: 0xffb0ff, glow: 0xd500f9, scale: 0.6,
      speed: [13, 0.22, 19], dmg: [7, 0.3, 14],
    },
    build: buildSchism, ai: aiSchism,
  },

  // A gravity well that will not let the player leave. It drags them in
  // continuously and rolls rings outward along the floor that have to be
  // JUMPED - the one boss that asks for a control the game has barely used.
  maw: {
    hp: 3300, speed: 1.2, damage: 26, value: 7000, color: 0x311b92, eye: 0x7c4dff,
    scale: 3.0, radius: 1.8, mass: 10, boss: true,
    hitbox: { r: 0.75, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    build: buildMaw, ai: aiMaw,
    cleanup: releaseMarks,
  },

  // The capstone. Blinks, volleys and leaves pools - the three things the
  // earlier fights taught, arriving together - and drops its cooldowns when it
  // is nearly dead, so the last third is the hardest part of the fight rather
  // than the easiest.
  herald: {
    hp: 3400, speed: 2.8, damage: 20, value: 9000, color: 0xffd54f, eye: 0xfff8e1,
    scale: 2.6, radius: 1.5, mass: 6, boss: true,
    hitbox: { r: 0.72, y: 0.85 },
    statusMul: 0.25, freezeSlow: true, slowFactor: 0.8, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    orbit: { dist: 13, band: 2.5, out: 0.7, in: -0.8, strafe: 0.5, flip: 1.5, flipVar: 1.5 },
    build: buildHerald, ai: aiHerald,
  },
};

// Frees any telegraph handles a boss was holding when it died. Bosses keep
// theirs in bs.mark or bs.marks; both are covered here so a boss only has to
// name this as its `cleanup`.
function releaseMarks(e) {
  const bs = e.bs;
  if (!bs || !bs.fx) return;
  if (bs.mark >= 0) {
    bs.fx.markRelease(bs.mark);
    bs.mark = -1;
  }
  if (bs.rings) {
    for (const r of bs.rings) bs.fx.markRelease(r.mark);
    bs.rings.length = 0;
  }
}

// Geometries and non-animated materials are built once and shared by every
// enemy of that type. Only the two materials an enemy mutates at runtime (body
// flash, eye glow) are per-instance, and dispose() frees those on death.
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

const SHARED_MATS = {
  gunmetal: new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.4, metalness: 0.6 }),
  tankPlate: new THREE.MeshStandardMaterial({ color: 0x3a2515, roughness: 0.5, metalness: 0.6 }),
  // The furnace in a tank's chest. Emissive and NOT tinted by status, so the
  // one part of the model that says "this is the heavy" survives being frozen
  // or poisoned - see the note on the silhouette rules above.
  tankFurnace: new THREE.MeshStandardMaterial({
    color: 0xff6b00, emissive: 0xffaa00, emissiveIntensity: 1.3,
    roughness: 0.3, metalness: 0.5,
  }),
  sniperBarrel: new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.3, metalness: 0.8 }),
  sniperScope: new THREE.MeshStandardMaterial({ color: 0x0a0f1a, roughness: 0.2, metalness: 0.9 }),
  splitterCore: new THREE.MeshStandardMaterial({
    color: ENEMY_TYPES.splitter.color, emissive: ENEMY_TYPES.splitter.color, emissiveIntensity: 1.2,
    roughness: 0.2, metalness: 0.8, transparent: true, opacity: 0.8,
  }),
  splitterRing: new THREE.MeshStandardMaterial({
    color: ENEMY_TYPES.splitter.eye, emissive: ENEMY_TYPES.splitter.eye, emissiveIntensity: 0.8,
  }),
  bomberShell: new THREE.MeshStandardMaterial({ color: 0x2a2515, roughness: 0.5, metalness: 0.4 }),
  bomberPin: new THREE.MeshStandardMaterial({ color: 0xffd600, emissive: 0xffd600, emissiveIntensity: 1.5 }),
  bulwarkShield: new THREE.MeshStandardMaterial({
    color: 0x4a5568, roughness: 0.35, metalness: 0.75,
    emissive: 0xffd54f, emissiveIntensity: 0.25,
  }),
  conduitRing: new THREE.MeshStandardMaterial({
    color: 0x00e5b0, emissive: 0x00e5b0, emissiveIntensity: 1.4,
    roughness: 0.2, metalness: 0.7,
  }),
  blightSac: new THREE.MeshStandardMaterial({
    color: 0x7ac943, emissive: 0x7ac943, emissiveIntensity: 0.9,
    roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.8,
  }),
  wraithShroud: new THREE.MeshStandardMaterial({
    color: 0x6f5bff, emissive: 0x6f5bff, emissiveIntensity: 0.7,
    roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.45,
  }),
  // ---- the afflictors ------------------------------------------------------
  // One lit part each, and in every case it is the part that DOES the thing:
  // the ember in a cinder's chest, the ice on a rime's back, the sacs a husk
  // is full of. These keep their own colour when the body is tinted by a
  // status - the same rule the tank's furnace follows - so an enemy that has
  // been frozen still says what it is.
  cinderEmber: new THREE.MeshStandardMaterial({
    color: 0xff7a18, emissive: 0xff5a00, emissiveIntensity: 1.7,
    roughness: 0.4, metalness: 0.1,
  }),
  rimeIce: new THREE.MeshStandardMaterial({
    color: 0xbfe6ff, emissive: 0x63b3ff, emissiveIntensity: 0.9,
    roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.75,
  }),
  huskSac: new THREE.MeshStandardMaterial({
    color: 0x8fbf4a, emissive: 0x4fe06a, emissiveIntensity: 1.0,
    roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.8,
  }),
  vitriolSac: new THREE.MeshStandardMaterial({
    color: 0x4fe06a, emissive: 0x4fe06a, emissiveIntensity: 1.2,
    roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.82,
  }),
  // The inside of a howler's mouth. Near-black and NOT emissive: it is the one
  // hole in the roster, and a hole that glows is a lamp.
  howlerMaw: new THREE.MeshStandardMaterial({
    color: 0x120a1c, roughness: 0.9, metalness: 0.0,
  }),
  hexerRing: new THREE.MeshStandardMaterial({
    color: 0xff2d6f, emissive: 0xff2d6f, emissiveIntensity: 1.5,
    roughness: 0.2, metalness: 0.7,
  }),
  shadeVeil: new THREE.MeshStandardMaterial({
    color: 0xb06bff, emissive: 0xb06bff, emissiveIntensity: 0.8,
    roughness: 0.5, metalness: 0.2, transparent: true, opacity: 0.5,
  }),
  magmaVent: new THREE.MeshStandardMaterial({
    color: 0xff7a18, emissive: 0xff5a00, emissiveIntensity: 1.6,
    roughness: 0.4, metalness: 0.1,
  }),
  magmaCrust: new THREE.MeshStandardMaterial({ color: 0x2b1a12, roughness: 0.9, metalness: 0.1 }),
  wardenCrown: new THREE.MeshStandardMaterial({
    color: 0xdfe6ef, emissive: 0xfff2b0, emissiveIntensity: 1.1,
    roughness: 0.25, metalness: 0.7,
  }),
  // The two fliers share one design language and split it on colour: a lit
  // underside on both (nothing else in the roster glows downward, so "it is in
  // the air" reads before the shape does), cold blue for the one that holds
  // station and a bare blade for the one that arrives.
  harrierGlow: new THREE.MeshStandardMaterial({
    color: 0x27c4ff, emissive: 0x27c4ff, emissiveIntensity: 1.5,
    roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.85,
  }),
  shrikeEdge: new THREE.MeshStandardMaterial({
    color: 0x9aa8c4, roughness: 0.2, metalness: 0.9,
  }),
  hitbox: new THREE.MeshBasicMaterial({ visible: false }),
};

const BODY_FLASH_HEX = 0xffffff;
const BODY_FLASH_INTENSITY = 0.9;
const BODY_BASE_INTENSITY = 0.18;

// ---- status effects ------------------------------------------------------
// Applied by the single-tier passive items in upgrades.js. A hit REFRESHES a
// status, it never stacks one: passive items have no second level, so there
// is no stronger poison to express. Duration is seconds remaining, counted
// down in update().
//
// STATUS_ORDER is tint priority. An enemy can carry several statuses at once,
// but it can only wear one colour, so the first active entry wins and the body
// holds that colour steadily - a body that alternated between green and orange
// every frame would read as a rendering fault, not as information.
const STATUS_ORDER = ['freeze', 'burn', 'poison', 'slow', 'fear'];
const STATUS_TINT = {
  freeze: 0xcfeaff,
  burn: 0xff7a18,
  poison: 0x39d353,
  slow: 0x63b3ff,
  fear: 0xb06bff,
};
// Well above BODY_BASE_INTENSITY (0.18) so an afflicted enemy is obvious in a
// crowd, and well below BODY_FLASH_INTENSITY (0.9) so it never reads as a hit.
const STATUS_INTENSITY = 0.55;
// How each status behaves as particles. The body tint says WHICH status an
// enemy is carrying, but only one at a time - an enemy can hold several and
// can only wear one colour. The particles are what show the rest, and they
// carry the character of the effect as motion rather than as colour alone:
//
//   burn    fast, hot, straight up - the only one that looks violent
//   poison  slow bubbles drifting up off the body
//   freeze  heavy crystals falling off it
//   slow    a cold sink, thinner and slower than freeze
//   fear    light wisps streaming upward and gone
//
// Every active status drips, not just the dominant one, so a poisoned and
// burning enemy reads as both. Counts and intervals are deliberately small:
// this runs per enemy per status, and a wave of twenty afflicted enemies has
// to stay inside the 1024-slot particle buffer with room for combat on top.
//
// `up` is passed straight to Effects.burst(), where it biases the spray
// upward; negative values sink.
const STATUS_FX = {
  burn: { interval: 0.14, count: 3, speed: 1.7, up: 2.8, life: 0.45, y: 0.9 },
  poison: { interval: 0.22, count: 2, speed: 0.7, up: 1.7, life: 0.8, y: 0.8 },
  freeze: { interval: 0.24, count: 3, speed: 0.6, up: -0.8, life: 0.7, y: 1.25 },
  slow: { interval: 0.3, count: 2, speed: 0.5, up: -0.5, life: 0.65, y: 1.1 },
  fear: { interval: 0.2, count: 2, speed: 1.3, up: 2.4, life: 0.4, y: 1.45 },
};
const SLOW_FACTOR = 0.5;
// Conduit's aura, read in takeDamage and _effSpeed. Kept modest: the point of
// a support unit is that it makes a crowd worth re-prioritising, not that it
// makes one unkillable.
const CONDUIT_RESIST = 0.7;
const CONDUIT_SPEED = 1.15;
// How far the aura reaches, and how many links it draws. The beam pool is
// eight deep and shared, so a conduit in a packed crowd shows a sample of what
// it is buffing rather than every last one.
const CONDUIT_RANGE = 7;
const CONDUIT_LINKS = 4;
// Warden's dome: how far the invincibility reaches, and the colour anything
// inside it turns. The radius is a compromise - wide enough that it obviously
// covers a group, narrow enough that walking round the edge of it is a real
// option and the warden is never safely parked out of reach behind its own
// protection.
const WARD_RANGE = 6.5;
const WARD_STONE = 0x8d9199;
// TEMPEST's capacitor plate. Bright and cold rather than dulled like the
// warden's stone, and the difference is the mechanic: a warded enemy is not
// worth shooting at all and should stop looking like a target, while a plated
// one is worth shooting exactly once more than it looks.
const PLATE_HEX = 0x7ef0ff;
// Magma's trail: how often it drops a patch while it is moving, and how big,
// how long and how hard each one burns. Five seconds is the brief - long
// enough that a corridor it walked down stays closed behind it.
// ---- what the afflictors leave behind ------------------------------------
//
// All of these are read by the type table above and by the ai functions at the
// bottom, so the numbers a player has to learn are in one place rather than
// spread over two thousand lines.

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
const GLACIER_SHELL_AT = 0.4;
const GLACIER_NOVA_R = 5.5;
const GLACIER_NOVA_N = 9;

// The shard's burst, and the whole point of the type: one lance at a target
// who is fine, three at one the rest of the theme has already slowed down.
const SHARD_CD = 2.6;
const SHARD_BURST = 3;
const SHARD_BURST_GAP = 0.16;
const SHARD_RANGE = 30;
const SHARD_SPREAD = 0.05;

// The hailer's ring. Wide enough to be a wall the player is INSIDE rather than
// a patch they are next to, and gapped, because a closed ring around a player
// who cannot outrun it is a tax rather than a decision.
const HAIL_CD = 4.2;
const HAIL_RANGE = 24;
const HAIL_RING_R = 4.6;
const HAIL_RING_N = 10;
const HAIL_RING_GAP = 2;
const HAIL_PATCH_RADIUS = 1.6;
const HAIL_PATCH_LIFE = 3.6;

// The hoarfrost's field. Refreshed every frame the player is inside it and
// given a short tail, so it lapses on its own the moment they leave or it
// dies - the same shape the conduit's buff and the bellows' light both use.
const HOAR_RANGE = 7.5;
const HOAR_HOLD = 0.6;

// The sleet's column. Slow to arrive over you and slow to drip, because the
// answer is simply to walk - a column that kept pace with a sprint would be
// unavoidable, and one that dripped faster would be a damage check rather
// than a movement one.
const SLEET_HIGH = 5.0;
const SLEET_DRIP = 0.5;
const SLEET_PATCH_RADIUS = 1.9;
const SLEET_PATCH_LIFE = 3.0;
const _rimeAt = new THREE.Vector3();

// VERDANT's five. Every number here is a DELAY - the theme's whole idea is
// that nothing happens when it is thrown, so what these describe is how long
// the player has between being shown a thing and being charged for it.
//
// The thornling's charge. The wind-up is long because it is the entire
// counterplay: once it goes it cannot steer, so the player is stepping off a
// line rather than outrunning anything.
const THORN_TELL = 0.55;
const THORN_RUN = 1.15;
const THORN_RUN_MUL = 2.9;
const THORN_CD = 2.6;
const THORN_RANGE = 18;
// Below this it just swings - a charge at arm's length is unreadable and
// unfair, and the melee cycle is a better answer at that distance anyway.
const THORN_MIN = 5;

// The sporegun's seed. TWO SECONDS on the floor with the circle filling, which
// is by a distance the most generous telegraph in the game: it has to be, or a
// gunner whose rounds are harmless in the air would be a gunner that does
// nothing at all.
const SPORE_CD = 3.6;
const SPORE_RANGE = 22;
const SPORE_SPROUT = 2.0;
const SPORE_RADIUS = 2.6;
const SPORE_DAMAGE = 16;

// The bramblehide's thorns. A slow tick, and a reach that has to sit OUTSIDE
// its own swing - which is the whole reason this number is 4.6 and not the 3.0
// it started at.
//
// At 3.0 the aura was entirely inside the melee's own hit range of 3.5, so
// there was no distance at which a player could feel the thorns as a separate
// thing: every metre where they were being pricked was a metre where they were
// also being swung at, and the mechanic was just extra melee damage with a
// different colour of particle. The band between the swing and 4.6 is the
// enemy - close enough to be a decision, far enough to be its own.
//
// Still short. It must read as "next to it" rather than "near it", or the
// player is being taxed for fighting in the same room.
const BRAMBLE_REACH = 4.6;
const BRAMBLE_TICK = 0.9;
const BRAMBLE_DPS = 7;

// The heartwood's mending. As a FRACTION of the target's own maximum, so it is
// worth the same on a chaser as on a tank - a flat rate would either be
// nothing on a brute or absurd on a rusher.
const HEART_RANGE = 9;
const HEART_RATE = 0.05;
const HEART_LINKS = 4;

// The mothcap's cloud. It trails one continuously rather than dropping them,
// so the interval is short and the life is long - the cloud IS the enemy, and
// it has to still be there after the enemy is not.
const MOTH_HIGH = 2.4;
const MOTH_DROP = 0.7;
const MOTH_RADIUS = 2.6;
const MOTH_LIFE = 5.0;
const MOTH_STANDOFF = 7;
const _verdAt = new THREE.Vector3();

// STRATA's four. The numbers here are all about the ROOM - how far a thing
// travels before the wall turns it, how long a perch holds, how far back the
// floor remembers.
//
// The arena's own half-width, and the surface everything in this theme bounces
// off. Enemy.update already clamps bodies to it; the scree and the slinger's
// stone need the same number to reflect against, which is why it is named
// here rather than left as the literal it was in three places.
const ARENA_HALF = 21.6;

// The scree's roll. Long, because a boulder that stopped after one wall would
// be a charge with extra steps - the whole point is that it is still crossing
// the room a second after the player stopped thinking about it.
const SCREE_TELL = 0.5;
const SCREE_ROLL = 3.2;
const SCREE_ROLL_MUL = 3.1;
const SCREE_CD = 3.4;
const SCREE_RANGE = 20;
const SCREE_MIN = 5;
const SCREE_BOUNCES = 3;
// It shoves rather than hurts. Position is what a STRATA wave is about, so
// position is what its rusher takes.
const SCREE_KNOCK = 9;

const SLING_CD = 2.4;
const SLING_RANGE = 26;

// How far back the floor remembers. Three spikes over about a second and a
// half of the player's own path - enough to describe an arc, short enough that
// a player who breaks their circle has already left it behind.
const GEODE_CD = 4.6;
const GEODE_RANGE = 26;
const GEODE_TRAIL = 3;
const GEODE_TRAIL_GAP = 0.5;
const GEODE_SPIKE_R = 2.3;
const GEODE_SPIKE_DELAY = 1.1;
const GEODE_SPIKE_DMG = 18;

// The gargoyle. It holds its perch until the player walks under it, and the
// trigger is HORIZONTAL distance only - it is directly overhead that matters,
// not how close they are in three dimensions.
const GARG_PERCH_Y = 6.2;
const GARG_TRIGGER = 4.5;
const GARG_DROP_RATE = 14;
const GARG_RISE_RATE = 1.1;
// How long it stays down. Long, and the reason the trade is worth taking: the
// player chose to bring it into reach, and this is the reach.
const GARG_GROUNDED = 4.0;
const GARG_SLAM_R = 4.5;
// How hard it throws whatever it landed on. A block of stone dropping from
// six metres does not tap somebody.
const GARG_SLAM_KNOCK = 4.0;
const GARG_SLAM_DMG = 16;
const _strataAt = new THREE.Vector3();

// VOID's three. Every number here is about SPACE - how long a hole in the air
// hangs before something comes out of it, how long the player is held, and how
// little a slab that ignores the walls has to be slowed down to stay fair.
//
// The warp's rift. The EXIT is the whole contract: it opens this long before
// the round arrives, and it opens where the round will come from - so a player
// who is reading the arena has a point in space to step away from, in exactly
// the way they would step off a line.
const WARP_CD = 3.0;
const WARP_RANGE = 26;
const WARP_LEAD = 0.85;
// How far from the player the exit opens. Close enough to be a threat, far
// enough that the round is travelling when it reaches them rather than
// appearing on top of them - a rift that opened at zero range would be a
// hitscan with extra steps.
const WARP_EXIT_R = 5.5;

// The monolith walks through everything, so it is slowed and telegraphed by
// its own size instead. Nothing else in the roster ignores the nav grid.
const MONO_SWING_RANGE = 4.2;

// The singularity's well. It does NO damage - the whole payload is the two
// seconds the player spends being dragged back to a spot they were leaving.
const SING_CD = 5.0;
const SING_RANGE = 24;
const SING_WELL_LIFE = 2.2;
const SING_WELL_R = 7.0;
// Well under pullPlayer's own cap of 5.5. It has to be a drag the player can
// still walk against - a well that simply moved them would be a stun, and a
// stun with no telegraph is the worst thing this game could do.
const SING_PULL = 2.4;
const _voidAt = new THREE.Vector3();

const RIME_DROP_INTERVAL = 0.55;
const RIME_PATCH_RADIUS = 1.7;
const RIME_PATCH_LIFE = 4.0;

// THE GAS. One rate for both things that make a cloud, because they are the
// same gas: what a vitriol throws and what a husk is full of. The hazard table
// in main.js carves the poison status's own damage out of this, so the number
// here is what standing in a cloud costs per second IN TOTAL.
const GAS_DPS = 6;
// A husk's burst. Wider and shorter-lived than a thrown cloud: it is a body
// coming apart rather than a lobbed canister, and it has to cover the ground
// around the corpse - which is the ground the player was standing on when they
// killed it - rather than deny a position for a long time.
const HUSK_CLOUD_RADIUS = 3.4;
const HUSK_CLOUD_LIFE = 5.5;
// What a VITRIOL throws is sized in main.js beside the blight's lob (SPIT_GAS),
// because the two share one throw and differ only in what grows out of it.

// THE HOWL. Wind-up, radius, how long the player loses the trigger for, and
// how long before it can do it again.
//
// The wind-up is the longest telegraph any non-boss enemy has, and it is long
// on purpose: this is the only attack in the game that takes away the player's
// ability to answer it, so the window to walk out has to be generous enough
// that being caught is a mistake rather than a coin toss.
const HOWL_WINDUP = 1.3;
// Seven metres, and the howler orbits at six - so it has to be INSIDE its own
// circle's worth of the player to use it, which is what makes "shoot that one"
// a real option rather than advice about something standing across the arena.
// The first pass had both at nine and the ring covered half the floor: a
// telegraph nobody can be outside of is not a telegraph.
const HOWL_RADIUS = 7;
const HOWL_FEAR = 2.5;
const HOWL_CD = 7;

// THE HEX. Two seconds of channel for ten of curse, and a range the channel
// breaks at. Breaking it by RANGE rather than by damage is what keeps the
// enemy meaningful: a channel any stray pellet cancelled would never once
// finish, and the player would never learn what a hexer is for.
const HEX_CHANNEL = 2.0;
const HEX_RANGE = 24;
const HEX_BREAK = 28;
const HEX_CURSE = 10;
const HEX_CD = 9;

// EMBER's other four. Every number that decides how much FLOOR one of them
// takes lives here, because that is the only currency this theme spends.
//
// THE LAVA CAP IS THE REAL CONSTRAINT and it is worth saying why these are as
// low as they are. Every patch any of them lays goes in the same capped list
// (HAZARD_KINDS in main.js), and an EMBER wave is the first wave in the game
// where FOUR different types are all laying into it at once. If each were tuned
// as though it had the list to itself, the oldest patches would be evicted
// continuously and every one of these mechanics would read as broken - a
// kiln's sweep with holes in it, an ashwing's line stopping halfway.
//
// So they are budgeted against each other rather than individually, and the
// magma's own drip was slowed to pay for it.
const FLARE_CD = 3.4;
const FLARE_RANGE = 22;
// Three patches in a fan, thrown clear of the impact point along the shell's
// own heading - so the ground it takes is the ground BEHIND whatever it was
// aimed at, and a player backing off in a straight line meets all three.
const FLARE_BURST = 3;
const FLARE_BURST_SPREAD = 0.5;   // radians between the fan's arms
const FLARE_BURST_REACH = 2.0;    // metres from the impact point

// The kiln plants at this range and turns rather than closing further. Outside
// its own sweep, so walking up to one is always an option.
const KILN_PLANT_RANGE = 13;
const KILN_REACH = 7.5;
// A twentieth of a turn per half-beat: about eight seconds a revolution at
// 150bpm, slow enough to walk around and fast enough that standing still is
// never the answer.
const KILN_STEP = (Math.PI * 2) / 20;
const KILN_PATCH_RADIUS = 1.5;
const KILN_PATCH_LIFE = 2.6;
const KILN_PATCH_DPS = 12;

// How long a bellows keeps an enemy lit after it stops reaching it. Short, and
// refreshed every frame, so a bellows dying takes the fire off the wave
// immediately - which is the whole reason to shoot it.
const BELLOWS_HOLD = 0.25;
const BELLOWS_RANGE = 8;
const BELLOWS_LINKS = 4;
// What a lit enemy leaves on you. Well under the cinder's four seconds: a
// cinder PAYS for its burn by hitting for five, and these are hitting for
// whatever their own stat block says on top of it.
const BELLOWS_BURN = 2.5;

const ASHWING_HIGH = 4.6;
// The rear-up before a run. It cannot steer once committed, so this is the
// entire counterplay and it has to be long enough to read from underneath.
const ASHWING_TELL = 0.9;
const ASHWING_RUN_TIME = 2.2;
const ASHWING_RUN_MUL = 2.4;
const ASHWING_CD = 3.6;
// Where it turns in from: far enough out that the run crosses the whole arena
// rather than starting on top of the player.
const ASHWING_STANDOFF = 17;
const ASHWING_DROP_INTERVAL = 0.16;
const ASHWING_PATCH_RADIUS = 1.35;
const ASHWING_PATCH_LIFE = 3.4;
const ASHWING_PATCH_DPS = 12;

// SLOWED, because magma is a brute now. At 0.42s a walker at speed 2.7 laid a
// connected line; at speed 1.8 the same interval lays two patches on the same
// square metre and spends the shared cap doing it.
const MAGMA_DROP_INTERVAL = 0.75;
const MAGMA_PATCH_RADIUS = 1.5;
const MAGMA_PATCH_LIFE = 5;
const MAGMA_PATCH_DPS = 12;
// Scratch for the drip's spawn point. Module-level and reused: the drip runs
// for every afflicted enemy several times a second.
const _dripAt = new THREE.Vector3();
// The hex beam's two ends. Module-level and consumed immediately: the beam is
// redrawn every frame of a two-second channel and allocating there would
// litter the heap through the whole fight.
// EMBER's two: the far end of a kiln's bar and the point under an ashwing.
// Module level and reused - both run several times a second, per enemy.
const _kilnTip = new THREE.Vector3();
const _ashAt = new THREE.Vector3();
const _hexFrom = new THREE.Vector3();
const _hexTo = new THREE.Vector3();
// Scratch for the navigation heading. Module-level and consumed immediately:
// every enemy asks for one every frame.
const _steer = { x: 0, z: 0 };
const _latchFwd = new THREE.Vector3();
// Time constant of the walking-heading blend, in seconds. Short enough that a
// corner is still taken at full speed; long enough that a single disagreeing
// frame cannot turn a body around.
const NAV_TURN = 0.1;
// Petrify's reward: a frozen enemy cannot act, and takes half again as much.
const FREEZE_VULN = 1.5;

// ---- flight ---------------------------------------------------------------
// How fast a flier closes the gap between its current altitude and the one its
// ai() is asking for, as an exponential-approach rate. Per-enemy, because the
// difference between a shrike FALLING out of the sky and a harrier settling
// back to station is the whole distinction between the two types.
// How fast a ground enemy comes down off a step it has walked off. Not
// gravity: these have no vertical velocity, and a rusher stepping off a tread
// should read as taking the step down rather than as being dropped.
const GROUND_FALL = 9;
// How long the model takes to catch up with a step the body has already taken.
// Short enough to still read as a step rather than as floating, long enough
// that four treads read as a climb instead of four cuts. Matched to the
// player's own camera smoothing so both sides of the fight move alike.
const STEP_EASE = 0.11;
const FLY_RATE_DEFAULT = 4;
// Ceiling on altitude, so nothing can climb out of the arena's lighting or
// past the point where a shot from the floor stops being a fair ask.
const FLY_MAX_Y = 6.5;

let idSeq = 0;

// ---- model builders ------------------------------------------------------
// One per type, named on its ENEMY_TYPES entry, and responsible for the WHOLE
// model: torso, limbs, eyes and props. Nothing is placed before these run.
//
// THE SILHOUETTE IS THE DESIGN. Every type used to share one capsule and a
// pair of eyes, with a small prop bolted on, so at the distance the game is
// actually played at the only thing telling a chaser from a bomber was its
// colour - and colour is exactly what the status tints overwrite. A frozen
// enemy and a poisoned one are not their own colour any more, so the shape has
// to carry the identity on its own. The test each of these has to pass is that
// it is still identifiable as a flat black shape.
//
// The shape language maps to behaviour, so the model teaches the mechanic:
//
//   rushes you        leaning forward, narrow, legs under it   chaser wraith magma
//   soaks you         wide, planted, top-heavy, thick legs     tank bulwark colossus
//   shoots you        upright, thin, asymmetric weapon side    shooter sniper
//   supports          floating, legless, symmetrical           conduit warden
//   denies ground     bloated, bottom-heavy, hunched           blight bomber
//   comes apart       visibly segmented into halves            splitter schism
//
// Everything is built from few-segment primitives - 4 to 6 sided prisms, cones
// and octahedra - and bodyMat carries flatShading, so the whole roster reads as
// cut facets rather than smooth blobs.
//
// `P` is the part helper described on partsFor(): geometry is authored at UNIT
// size and P scales and positions it by the type's `s`, so one cached geometry
// can be shared by types of different sizes.

// Builds the `P(key, make, opts)` helper a build() uses for every mesh it adds.
//
// Anything that must FLASH white on a hit and carry the status tint goes
// through P with the default material - that is the enemy's own bodyMat, the
// single object _applyBodyLook writes to. Pass `mat` only for trim that should
// keep its own colour regardless of what the body is doing (gunmetal, glowing
// cores), and `mat: e.eyeMat` for anything that should blink with the eyes.
//
// opts: x,y,z position and sx,sy,sz or s scale, all in UNIT space and
// multiplied up by the type's scale; rx,ry,rz rotation in radians; mat; and
// shadow:false for parts too small or too transparent to be worth a shadow.
function partsFor(e, g, s) {
  return function P(key, make, o = {}) {
    const m = new THREE.Mesh(geo(key, make), o.mat || e.bodyMat);
    m.position.set((o.x || 0) * s, (o.y || 0) * s, (o.z || 0) * s);
    m.rotation.set(o.rx || 0, o.ry || 0, o.rz || 0);
    const k = (o.s ?? 1) * s;
    m.scale.set((o.sx ?? 1) * k, (o.sy ?? 1) * k, (o.sz ?? 1) * k);
    m.castShadow = o.shadow !== false;
    g.add(m);
    return m;
  };
}

// Shared faceted primitives. Segment counts are deliberately low - these are
// the facets, and raising them is what would take the roster back to blobs.
const prism = (rt, rb, h, seg) => () => new THREE.CylinderGeometry(rt, rb, h, seg);
const spike = (r, h, seg) => () => new THREE.ConeGeometry(r, h, seg);
const slab = (w, h, d) => () => new THREE.BoxGeometry(w, h, d);
const shard = (r) => () => new THREE.OctahedronGeometry(r, 0);
const lump = (r) => () => new THREE.IcosahedronGeometry(r, 0);
const rock = (r) => () => new THREE.DodecahedronGeometry(r, 0);

// The default pair of eyes, on the -z face. `y` and `spread` move them; most
// types take the default. Types whose identity is a machine or a monolith
// (conduit, warden, maw) call something else or nothing at all.
function eyes(P, { y = 1.05, x = 0.13, z = -0.27, r = 1, mat }) {
  const o = { mat: mat || undefined, s: r, shadow: false };
  P('eyeShard', shard(0.07), { ...o, x: -x, y, z });
  P('eyeShard', shard(0.07), { ...o, x, y, z });
}

// ---- the original six ----------------------------------------------------

// Leaning forward from the ankles up, and the only thing in the roster with a
// snout. Read: it is already coming at you.
function buildChaser(e, g, s) {
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
function buildShooter(e, g, s) {
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
function buildTank(e, g, s) {
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

// The only tripod in the game, and the tallest thin thing in it. Read: it is
// set up, a long way off, and pointed at you.
function buildSniper(e, g, s) {
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

// Two shards stacked with a lit seam between them. Read: this is already two
// things, and killing it will prove it.
function buildSplitter(e, g, s) {
  const P = partsFor(e, g, s);
  P('splitterLower', shard(0.36), { y: 0.58, sy: 0.9 });
  P('splitterUpper', shard(0.29), { y: 1.08, sy: 0.9 });
  // A tapered foot instead of legs: it should not look like it walks.
  P('splitterFoot', spike(0.24, 0.34, 5), { y: 0.17, rx: Math.PI });

  const core = P('splitterCore', shard(0.13), {
    y: 0.84, mat: SHARED_MATS.splitterCore, shadow: false,
  });
  e.coreMesh = core;
  const ring = new THREE.Mesh(
    geo('splitterRing', () => new THREE.TorusGeometry(0.27, 0.032, 6, 12)),
    SHARED_MATS.splitterRing
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.84 * s;
  ring.scale.setScalar(s);
  e.ringMesh = ring;
  g.add(ring);
  eyes(P, { y: 1.12, x: 0.1, z: -0.22, r: 0.8, mat: e.eyeMat });
}

// A pear: all of the mass low, a small head on top, stubby legs under a belly
// full of ordnance. Read: slow, and carrying something.
function buildBomber(e, g, s) {
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

// Legless and hovering, a narrow spike with a ragged hem. Read: it is not
// walking anywhere, and it will be behind you.
function buildWraith(e, g, s) {
  const P = partsFor(e, g, s);
  P('wraithCore', shard(0.21), { y: 0.98 });
  P('wraithSpike', spike(0.11, 0.6, 4), { y: 1.5 });
  // A loose open shroud rather than a hard body: it should read as something
  // only partly there, so a blink looks like the trick it was already doing.
  const shroud = new THREE.Mesh(
    geo('wraithShroud', () => new THREE.ConeGeometry(0.44, 1.15, 6, 1, true)),
    SHARED_MATS.wraithShroud
  );
  shroud.position.y = 0.72 * s;
  shroud.scale.setScalar(s);
  g.add(shroud);
  // The hem, torn into three points. This is what says it has no feet.
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    P('wraithTatter', spike(0.1, 0.42, 4), {
      x: Math.cos(a) * 0.26, y: 0.26, z: Math.sin(a) * 0.26, rx: Math.PI,
    });
  }
  P('wraithBlade', spike(0.07, 0.55, 4), { x: 0.24, y: 1.0, z: -0.4, rx: -Math.PI / 2 });
  eyes(P, { y: 1.05, x: 0.09, z: -0.19, r: 0.85, mat: e.eyeMat });
}

// Squat and wide, with a BUCKLER over the chest rather than a wall across the
// whole front. The read the model has to deliver is the opposite of the old
// one: not "the front is closed, go around", but "that plate is closed, shoot
// literally anywhere else". So the plate is small, bright and unmistakably a
// separate object - a different material, a raised boss, and a visible arm
// holding it off the body - while the head, the shoulders and the legs are all
// left standing clear of it in silhouette. Anything the buckler does not cover
// takes full damage, and the player has to be able to see that at a glance.
// ---- VOID ------------------------------------------------------------------
// The theme's language: floating masses with no legs under them, held apart
// with gaps that do not close, and every one of them missing the part that
// would make it a body. Where STRATA is cut and RIME is faceted, VOID is
// INCOMPLETE - shapes the eye keeps trying to finish and cannot.
//
// The rule that makes it work is negative space in the MIDDLE. Every one of
// these has a hole through it where a torso would be, which is what stops
// three floating rocks reading as three floating rocks.

// A ring with an arm through it. The rift it fires into hangs where a chest
// would be, so the silhouette has its hole exactly where the eye looks first.
function buildWarp(e, g, s) {
  const P = partsFor(e, g, s);
  // THE RING IS THE BODY. Six blades stood on edge around an empty middle,
  // tilted off vertical so it reads as a thing rather than as a hoop.
  const bladeGeo = shard(0.2);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P('warpBlade', bladeGeo, {
      x: Math.cos(a) * 0.36, y: 1.16 + Math.sin(a) * 0.1, z: Math.sin(a) * 0.14,
      rz: -a, sz: 0.4,
    });
  }
  // The rift itself: a small bright shard suspended in the ring's middle,
  // which is where the round goes in.
  P('warpRift', shard(0.13), { y: 1.16, mat: e.eyeMat, shadow: false });
  // A single long arm reaching through the ring - the only limb, and what
  // makes the outline asymmetric enough to read as a gunner.
  P('warpArm', slab(0.09, 0.62, 0.09), { x: 0.3, y: 1.1, rz: -0.9, rx: -0.3 });
  P('warpHand', shard(0.13), { x: 0.52, y: 1.32 });
  // A head on a stalk above the ring, and NOTHING below it - no hips, no legs.
  P('warpNeck', slab(0.07, 0.3, 0.07), { y: 1.56 });
  P('warpHead', shard(0.17), { y: 1.78, sz: 0.65 });
  // A short tapered tail hanging under the ring, so it is clearly floating
  // rather than cropped off at the knees.
  P('warpTail', spike(0.12, 0.5, 4), { y: 0.72, rx: Math.PI });
  eyes(P, { y: 1.8, x: 0.08, z: -0.15, r: 0.75, mat: e.eyeMat });
}

// One enormous flat slab standing on nothing, with a rift split through the
// middle of it. Read: it is a wall, it is coming, and there is no way round.
function buildMonolith(e, g, s) {
  const P = partsFor(e, g, s);
  // TWO HALVES WITH A GAP, not one slab. The gap is the whole silhouette -
  // a solid rectangle at this size reads as scenery, and the split reads as
  // something that has been broken open and did not close again.
  P('monoSlabL', slab(0.4, 1.9, 0.3), { x: -0.32, y: 1.1, rz: 0.05 });
  P('monoSlabR', slab(0.4, 1.9, 0.3), { x: 0.32, y: 1.1, rz: -0.05 });
  // The rift in the gap, tall and thin: the only bright thing, and it runs
  // most of the height so the split is unmissable from any distance.
  P('monoRift', slab(0.12, 1.3, 0.1), { y: 1.12, mat: e.eyeMat, shadow: false });
  // A heavy cap and a heavy foot bridging the halves, so they are one object.
  P('monoCap', slab(0.96, 0.24, 0.42), { y: 2.12, rz: 0.02 });
  P('monoBase', slab(0.86, 0.2, 0.38), { y: 0.2 });
  // NOTHING TOUCHES THE FLOOR. The base hangs a clear span above it, which is
  // what says this thing is not walking - it is being carried.
  P('monoDrift', shard(0.16), { x: -0.3, y: 0.02, sy: 0.5, shadow: false });
  P('monoDrift', shard(0.16), { x: 0.3, y: 0.02, sy: 0.5, shadow: false });
  // Two blades swept off the shoulders, angled forward - the only parts that
  // suggest a front, and what it swings.
  P('monoBlade', spike(0.12, 0.7, 4), { x: -0.56, y: 1.6, rz: 0.9, rx: -0.4 });
  P('monoBlade', spike(0.12, 0.7, 4), { x: 0.56, y: 1.6, rz: -0.9, rx: -0.4 });
  eyes(P, { y: 1.86, x: 0.16, z: -0.24, r: 1.1, mat: e.eyeMat });
}

// A cage around a hole. Bottom-heavy and hunched like the other ground-deniers
// (blight, kiln, geode), but with the mass arranged AROUND an empty centre
// rather than piled up - it is a thing that carries a well.
function buildSingularity(e, g, s) {
  const P = partsFor(e, g, s);
  // The cage: four curved ribs meeting top and bottom, with nothing between
  // them. Wide at the waist, so the hole is the widest part of the outline.
  const ribGeo = slab(0.1, 0.86, 0.1);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    P('singRib', ribGeo, {
      x: Math.cos(a) * 0.42, y: 0.74, z: Math.sin(a) * 0.42,
      rz: Math.cos(a) * -0.5, rx: Math.sin(a) * 0.5,
    });
  }
  P('singCap', prism(0.16, 0.3, 0.2, 5), { y: 1.2 });
  P('singFoot', prism(0.3, 0.2, 0.2, 5), { y: 0.24 });
  // THE WELL, suspended in the cage. Small, dark-cored and bright-edged: it is
  // what gets thrown, and it should look like an absence rather than an object.
  P('singWell', shard(0.2), { y: 0.74, mat: e.eyeMat, shadow: false });
  // A head leaning out over the cage, so it has a front.
  P('singNeck', slab(0.08, 0.26, 0.08), { y: 1.4, z: -0.1, rx: -0.4 });
  P('singHead', shard(0.15), { y: 1.58, z: -0.22, sz: 0.7 });
  // Legless, with a stub of a tail - it floats like the rest of the theme.
  P('singTail', spike(0.13, 0.44, 4), { y: 0.1, rx: Math.PI });
  eyes(P, { y: 1.6, x: 0.08, z: -0.32, r: 0.75, mat: e.eyeMat });
}

function buildBulwark(e, g, s) {
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
function buildScree(e, g, s) {
  const P = partsFor(e, g, s);
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
function buildSlinger(e, g, s) {
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
function buildGeode(e, g, s) {
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
function buildGargoyle(e, g, s) {
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

function buildConduit(e, g, s) {
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

// Bottom-heavy and hunched, tapering the opposite way to a tank, with a
// drooping nozzle. Read: everything it has is going onto the floor.
function buildBlight(e, g, s) {
  const P = partsFor(e, g, s);
  // WIDE AND FLAT ON THE FLOOR - the opposite of the bomber's stilts. Nothing
  // else in the roster is broader than it is tall, and that alone is enough to
  // tell the two heavy types apart at a glance.
  P('blightGut', lump(0.5), { y: 0.36, sx: 1.3, sy: 0.6, sz: 1.15 });
  // A hump on the back, so the outline has a peak that is not the head.
  P('blightHump', lump(0.3), { y: 0.62, z: 0.22, sy: 0.85 });
  // The head is low and slung FORWARD off the front of the gut, and the
  // nozzle carries on past it - together they are the long snout that reads
  // from the side.
  P('blightHead', prism(0.16, 0.24, 0.34, 5), { y: 0.5, z: -0.5, rx: -1.15 });
  P('blightNozzle', prism(0.05, 0.13, 0.62, 5), {
    y: 0.34, z: -0.82, rx: -Math.PI / 2.1, mat: SHARED_MATS.gunmetal,
  });
  // Four legs splayed out sideways, crab-like, and barely clearing the floor.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('blightLeg', slab(0.08, 0.34, 0.08), {
      x: Math.cos(a) * 0.44, y: 0.16, z: Math.sin(a) * 0.38,
      rz: -Math.cos(a) * 0.75, rx: Math.sin(a) * 0.5,
    });
  }
  P('blightSac', lump(0.24), { x: -0.4, y: 0.6, z: 0.06, mat: SHARED_MATS.blightSac });
  P('blightSac', lump(0.24), { x: 0.4, y: 0.6, z: 0.06, mat: SHARED_MATS.blightSac });
  eyes(P, { y: 0.62, x: 0.08, z: -0.58, r: 0.75, mat: e.eyeMat });
}

// A stack of cracked chunks with the heat showing between them. Read: it is
// made of the thing it is leaving on the ground.
// ---- VERDANT ---------------------------------------------------------------
// The theme's language: bark-plated trunks with things sprouting OUT of them
// at angles - fronds, thorns, spore caps. Nothing here has a clean edge, which
// is the whole family read: EMBER is lumpen rock, RIME is flat facets, and
// VERDANT is ragged. Built from the same primitives; what differs is that
// almost every part is rotated off axis, because a plant does not line up.

// Leaning hard forward from the ankles, all of it pointed one way. Read: it is
// going to go in a straight line and it is going to keep going.
function buildThornling(e, g, s) {
  const P = partsFor(e, g, s);
  // A long low body raked forward - much more horizontal than the chaser's,
  // because the chaser CLOSES and this one CHARGES, and the difference has to
  // be legible before it commits.
  P('thornBody', prism(0.3, 0.2, 0.8, 5), { y: 0.78, z: 0.06, rx: -0.72 });
  // The ram: a blunt wedge low and well forward, the leading edge of the whole
  // silhouette. Not a snout - a snout reads as a head, and this is a tool.
  P('thornRam', spike(0.24, 0.5, 5), { y: 0.62, z: -0.6, rx: -Math.PI / 2 });
  P('thornBrow', slab(0.36, 0.12, 0.26), { y: 0.86, z: -0.4, rx: -0.5 });
  // Thorns swept BACK along the body, so it reads as moving even standing
  // still, and so the outline breaks up along its length.
  const thornGeo = spike(0.06, 0.42, 4);
  P('thornSpine', thornGeo, { x: -0.18, y: 1.0, z: 0.16, rx: 1.1, rz: -0.3 });
  P('thornSpine', thornGeo, { x: 0.18, y: 1.02, z: 0.14, rx: 1.1, rz: 0.3 });
  P('thornSpine', thornGeo, { y: 1.12, z: 0.3, rx: 1.3, s: 0.8 });
  // Legs gathered under the chest rather than spread - a coiled stance.
  P('thornLeg', slab(0.11, 0.5, 0.12), { x: -0.17, y: 0.26, z: -0.06, rx: 0.3 });
  P('thornLeg', slab(0.11, 0.5, 0.12), { x: 0.17, y: 0.26, z: -0.06, rx: 0.3 });
  P('thornHaunch', slab(0.13, 0.42, 0.14), { x: -0.17, y: 0.5, z: 0.3, rx: -0.45 });
  P('thornHaunch', slab(0.13, 0.42, 0.14), { x: 0.17, y: 0.5, z: 0.3, rx: -0.45 });
  eyes(P, { y: 0.94, x: 0.1, z: -0.34, r: 0.8, mat: e.eyeMat });
}

// Upright and asymmetric, with a bulbous pod on one side - the gunner read,
// grown rather than built.
function buildSporegun(e, g, s) {
  const P = partsFor(e, g, s);
  P('sporeTrunk', prism(0.22, 0.32, 0.86, 5), { y: 0.86 });
  P('sporeHead', lump(0.18), { y: 1.42, sy: 0.8 });
  // THE POD IS THE SILHOUETTE, and it is what the seeds come out of: a heavy
  // sac carried outboard on a bent stalk, so the outline is lopsided.
  P('sporeStalk', slab(0.09, 0.4, 0.09), { x: 0.3, y: 1.14, rz: -0.6 });
  P('sporePod', lump(0.28), { x: 0.5, y: 1.36, sy: 1.25 });
  // Seeds visibly sitting in the pod's mouth - the tell for what it throws.
  P('sporeSeed', shard(0.09), { x: 0.5, y: 1.62, mat: SHARED_MATS.blightSac, shadow: false });
  // Fronds off the other shoulder, drooping. They balance the pod without
  // adding mass, which is what keeps the pod reading as the heavy side.
  const frondGeo = spike(0.05, 0.44, 4);
  P('sporeFrond', frondGeo, { x: -0.26, y: 1.2, rz: 1.3, rx: -0.3 });
  P('sporeFrond', frondGeo, { x: -0.3, y: 1.02, rz: 1.6, rx: 0.2, s: 0.85 });
  P('sporeLeg', slab(0.1, 0.5, 0.1), { x: -0.13, y: 0.26, rz: 0.08 });
  P('sporeLeg', slab(0.1, 0.5, 0.1), { x: 0.13, y: 0.26, rz: -0.08 });
  eyes(P, { y: 1.44, x: 0.09, z: -0.17, r: 0.8, mat: e.eyeMat });
}

// Wide, planted and COVERED - the brute read, and the silhouette has to say
// "do not stand next to this" before the aura ever proves it.
function buildBramblehide(e, g, s) {
  const P = partsFor(e, g, s);
  P('brambleBody', prism(0.52, 0.6, 0.86, 6), { y: 0.62 });
  P('brambleBack', lump(0.42), { y: 1.0, z: 0.16, sy: 0.72 });
  P('brambleHead', lump(0.22), { y: 1.16, z: -0.34, sy: 0.8 });
  // THORNS EVERYWHERE, and they have to project past the body on every bearing
  // or the enemy is just a lump: the reach of the aura is what the spines are
  // drawing, so they are long and they point OUT.
  const spineGeo = spike(0.07, 0.62, 4);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.3;
    P('brambleSpine', spineGeo, {
      x: Math.cos(a) * 0.5, y: 0.8 + Math.sin(i * 2.1) * 0.24, z: Math.sin(a) * 0.5,
      rz: Math.cos(a) * -1.25, rx: Math.sin(a) * 1.25,
    });
  }
  P('brambleLeg', slab(0.18, 0.36, 0.18), { x: -0.28, y: 0.18 });
  P('brambleLeg', slab(0.18, 0.36, 0.18), { x: 0.28, y: 0.18 });
  P('brambleArm', slab(0.17, 0.56, 0.17), { x: -0.56, y: 0.7, rz: 0.34 });
  P('brambleArm', slab(0.17, 0.56, 0.17), { x: 0.56, y: 0.7, rz: -0.34 });
  eyes(P, { y: 1.18, x: 0.11, z: -0.5, r: 0.9, mat: e.eyeMat });
}

// A tree. Legless, symmetrical, wider at the top than the bottom - the support
// read (conduit, warden, bellows, hoarfrost) grown instead of built, and the
// only thing in the roster that looks like it was always here.
function buildHeartwood(e, g, s) {
  const P = partsFor(e, g, s);
  // A tapering trunk on a root ball. It stands ON the floor rather than
  // floating, which is the one place this breaks the support silhouette - and
  // deliberately, because being ROOTED is what it does.
  P('heartRoots', lump(0.44), { y: 0.2, sy: 0.5 });
  P('heartTrunk', prism(0.2, 0.34, 1.0, 5), { y: 0.82 });
  // THE CANOPY, and the wide top that makes it read as a tree from a
  // silhouette: three overlapping caps at different heights and angles.
  P('heartCanopy', lump(0.46), { y: 1.42, sy: 0.62 });
  P('heartCanopy', lump(0.34), { x: -0.26, y: 1.62, sy: 0.6, ry: 0.8 });
  P('heartCanopy', lump(0.3), { x: 0.28, y: 1.58, sy: 0.6, ry: 1.6 });
  // The heart itself, glowing in a split in the trunk - where the beams come
  // from, and the only bright thing on it.
  P('heartCore', shard(0.18), { y: 1.0, z: -0.22, mat: e.eyeMat, shadow: false });
  // Roots thrown out at the base, so it is visibly gripping the floor.
  const rootGeo = spike(0.09, 0.46, 4);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    P('heartRoot', rootGeo, {
      x: Math.cos(a) * 0.34, y: 0.14, z: Math.sin(a) * 0.34,
      rz: Math.cos(a) * -1.5, rx: Math.sin(a) * 1.5,
    });
  }
  eyes(P, { y: 1.3, x: 0.1, z: -0.4, r: 0.85, mat: e.eyeMat });
}

// A cap on a body, flying LOW. Read against the crowd rather than the ceiling,
// so unlike the other two fliers it has to be a distinct shape at eye height -
// which is why it is a wide mushroom cap with a body hanging under it, and not
// another plate.
function buildMothcap(e, g, s) {
  const P = partsFor(e, g, s);
  // The cap: broad, domed and ragged-edged. The widest thing in the theme.
  P('mothCap', prism(0.16, 0.66, 0.34, 7), { y: 0.24 });
  P('mothCapRim', prism(0.68, 0.6, 0.09, 7), { y: 0.06 });
  // Gills under it - what the spores fall out of, and what makes the underside
  // read as something other than a flat disc when it is above you.
  const gillGeo = slab(0.05, 0.06, 0.5);
  for (let i = 0; i < 6; i++) {
    P('mothGill', gillGeo, {
      y: -0.02, ry: (i / 6) * Math.PI, mat: SHARED_MATS.blightSac, shadow: false,
    });
  }
  // A stubby body slung underneath. Short, so it does not turn the silhouette
  // into a hovering figure - the CAP has to be the thing.
  P('mothStem', prism(0.13, 0.17, 0.34, 5), { y: -0.24 });
  P('mothSac', lump(0.19), { y: -0.44, sy: 0.85 });
  // Two ragged wings, held low and swept - enough to say it flies, not enough
  // to compete with the cap.
  P('mothWing', prism(0.06, 0.3, 0.05, 3), { x: -0.44, y: -0.16, rz: 0.5, sz: 1.3 });
  P('mothWing', prism(0.06, 0.3, 0.05, 3), { x: 0.44, y: -0.16, rz: -0.5, sz: 1.3 });
  eyes(P, { y: -0.28, x: 0.09, z: -0.16, r: 0.8, mat: e.eyeMat });
}

function buildMagma(e, g, s) {
  const P = partsFor(e, g, s);
  // STACKED UPWARD and off-axis. The chunks step sideways as they rise so the
  // tower leans and the joins are visible as notches in the outline - a
  // straight stack just rebuilt the lump this pass exists to get rid of.
  P('magmaBase', rock(0.4), { y: 0.34, sy: 0.75, sx: 1.15 });
  P('magmaMid', rock(0.34), { x: 0.1, y: 0.76, ry: 0.7, sy: 0.85 });
  P('magmaTop', rock(0.26), { x: -0.08, y: 1.14, ry: 1.5 });
  P('magmaHead', rock(0.17), { x: 0.06, y: 1.44, ry: 2.2 });
  // Jagged shards off the shoulders, angled out. These are what make the
  // outline read as broken rock rather than as a boulder.
  // One cached shard, varied by SCALE. geo() keys by name alone, so three
  // calls under one key asking for three different sizes would all silently
  // get whichever was built first.
  const shardGeo = spike(0.09, 0.46, 4);
  P('magmaShard', shardGeo, { x: -0.36, y: 1.0, rz: 0.85, rx: -0.2 });
  P('magmaShard', shardGeo, { x: 0.38, y: 0.84, rz: -1.05, rx: 0.3, s: 0.88 });
  P('magmaShard', shardGeo, { x: -0.2, y: 1.36, z: 0.24, rx: 0.7, s: 0.74 });
  P('magmaFoot', rock(0.15), { x: -0.28, y: 0.11, z: -0.04 });
  P('magmaFoot', rock(0.15), { x: 0.26, y: 0.11, z: 0.06 });
  // Vents sit in the notches between chunks: the only part of the model that
  // has to communicate anything, so they go where the rock does not meet.
  const ventGeo = shard(0.12);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    P('magmaVent', ventGeo, {
      x: Math.cos(a) * 0.3, y: 0.56 + i * 0.3, z: Math.sin(a) * 0.3,
      mat: SHARED_MATS.magmaVent, shadow: false,
    });
  }
  P('magmaCrust', spike(0.24, 0.36, 5), { x: 0.06, y: 1.7, mat: SHARED_MATS.magmaCrust });
  eyes(P, { y: 1.46, x: 0.09, z: -0.16, r: 0.85, mat: e.eyeMat });
}

// A four-sided obelisk with no legs, no arms and one slit instead of eyes.
// Read: it is not a soldier, it does not move like one, and it is the reason
// your shots stopped landing.
// ---- EMBER -----------------------------------------------------------------
// The theme's shape language, set by the magma above and carried by all four:
// cracked rock MASSES rather than limbs, glowing vent shards in the gaps
// between them, and dead black crust wherever the outline meets the sky. Where
// a type needs a machine part it is a FURNACE part - a drum, a port, a stack -
// never gunmetal, because the one thing an EMBER enemy must never read as is a
// RUST enemy that happens to be orange.

// Upright and lopsided: everything is the brazier. Read: it is standing off
// and it is going to throw that at you.
function buildFlare(e, g, s) {
  const P = partsFor(e, g, s);
  // A narrow cracked column - two chunks with a notch between them, which is
  // where the vent goes. Flatter front to back than a magma so it reads as a
  // standing figure rather than as a pile.
  P('flareBody', rock(0.3), { y: 0.78, sy: 1.15, sz: 0.62 });
  P('flareChest', rock(0.24), { y: 1.24, ry: 0.8, sz: 0.66 });
  P('flareHead', spike(0.15, 0.34, 5), { y: 1.62, rx: 0.2 });
  // THE BRAZIER IS THE SILHOUETTE. An open bowl held well outboard and forward
  // on a cranked arm, so the outline is unbalanced from every bearing - the
  // same job the shooter's arm cannon does, in this theme's vocabulary.
  P('flareArm', slab(0.1, 0.1, 0.44), { x: 0.34, y: 1.12, z: -0.16, rx: 0.5 });
  P('flareBowl', prism(0.3, 0.13, 0.3, 6), { x: 0.4, y: 1.32, z: -0.34, rx: -0.35 });
  // The coal sitting in it, and the only part of the model that has to say
  // anything: this is where the shell comes from.
  P('flareCoal', shard(0.15), {
    x: 0.4, y: 1.38, z: -0.34, sy: 0.6, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  // The other arm is a bare rod - what makes the brazier side read as heavy.
  P('flareArmThin', slab(0.07, 0.42, 0.07), { x: -0.28, y: 1.06, rz: 0.2 });
  P('flareVent', shard(0.11), {
    y: 1.02, z: -0.14, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  P('flareLeg', slab(0.11, 0.52, 0.12), { x: -0.14, y: 0.27, rx: 0.1 });
  P('flareLeg', slab(0.11, 0.52, 0.12), { x: 0.14, y: 0.27, rx: -0.08 });
  P('flareCrust', spike(0.2, 0.26, 5), { y: 1.82, mat: SHARED_MATS.magmaCrust });
  eyes(P, { y: 1.62, x: 0.09, z: -0.14, r: 0.8, mat: e.eyeMat });
}

// A squat drum with a stack on it - wide at the floor, no legs worth the name.
// Read: it is going to plant itself here and the trouble is at ground level.
function buildKiln(e, g, s) {
  const P = partsFor(e, g, s);
  // THE DRUM. Wide, low and six sided, so it is unmistakably a furnace lying
  // on the floor rather than a body standing on it. The whole silhouette is
  // bottom-heavy, which is the ground-denier read (blight, bomber).
  P('kilnDrum', prism(0.46, 0.54, 0.6, 6), { y: 0.36 });
  P('kilnBand', prism(0.5, 0.5, 0.1, 6), { y: 0.52, mat: SHARED_MATS.magmaCrust });
  // THE PORT the bar of flame comes out of - a horizontal slot on the front,
  // at the height the sweep actually runs at. It has to be findable, because
  // the answer to a kiln is to get behind it.
  P('kilnPort', slab(0.5, 0.14, 0.16), {
    y: 0.42, z: -0.44, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  P('kilnLip', slab(0.58, 0.08, 0.1), { y: 0.56, z: -0.46, mat: SHARED_MATS.magmaCrust });
  // The stack. Tall and thin over a wide base - the one part that breaks the
  // top of the outline, and what stops it reading as a crate at distance.
  P('kilnStack', prism(0.13, 0.2, 0.72, 5), { x: 0.14, y: 1.02, rz: -0.12 });
  P('kilnCap', prism(0.19, 0.13, 0.14, 5), { x: 0.11, y: 1.42, mat: SHARED_MATS.magmaCrust });
  // Vents up the seam where the drum meets the stack.
  const ventGeo = shard(0.1);
  P('kilnVent', ventGeo, { x: -0.2, y: 0.78, mat: SHARED_MATS.magmaVent, shadow: false });
  P('kilnVent', ventGeo, { x: 0.3, y: 0.7, z: 0.16, mat: SHARED_MATS.magmaVent, shadow: false });
  // Stubby feet, splayed. It walks, but it should look like it would rather
  // not have to.
  P('kilnFoot', rock(0.16), { x: -0.34, y: 0.1, z: -0.1 });
  P('kilnFoot', rock(0.16), { x: 0.34, y: 0.1, z: -0.1 });
  P('kilnFoot', rock(0.16), { x: 0, y: 0.1, z: 0.32 });
  eyes(P, { y: 0.86, x: 0.11, z: -0.36, r: 0.75, mat: e.eyeMat });
}

// Floating, legless and symmetrical - the support read (conduit, warden) in
// EMBER's materials. Two lobes with a lit gap between them that opens and
// shuts, which is the entire animal: a pair of bellows breathing on the wave.
function buildBellows(e, g, s) {
  const P = partsFor(e, g, s);
  // The two lobes. Held apart with a real gap, because the GAP is the thing -
  // a solid body here would just be a floating rock, and this has to read as
  // support (legless, symmetrical, air under it) from the flat black test.
  //
  // WIDE AND FLAT rather than round: the first pass used two 0.3 lumps a
  // shoulder's width apart and the silhouette closed up into one blob at
  // arena range. A lobe has to be broader than the gap is tall or the eye
  // fills the hole in.
  e.lobeA = P('bellowsLobe', rock(0.36), { y: 1.44, sy: 0.5, sx: 1.15 });
  e.lobeB = P('bellowsLobe', rock(0.36), { y: 0.7, sy: 0.5, sx: 1.15, ry: 0.9 });
  // The fire between them, and the only bright thing on the model. It scales
  // with the breath in aiBellows, so the enemy visibly PUMPS. Small on
  // purpose: at rest it must not bridge the two lobes, because the gap
  // closing is the animation and there is nowhere for it to go if it starts
  // shut.
  e.bellowsCore = P('bellowsCore', shard(0.16), {
    y: 1.07, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  // TWO struts at the outer edges, not one bar down the middle. The first pass
  // ran a single spine through the centre at exactly the gap's height, which
  // filled in the one piece of negative space the whole design is built on -
  // the model was correct and the silhouette was a rock. Pushed out to the
  // flanks and back, they hinge the lobes together and leave the middle open.
  const strutGeo = slab(0.08, 0.78, 0.1);
  P('bellowsStrut', strutGeo, { x: -0.3, y: 1.07, z: 0.2, mat: SHARED_MATS.magmaCrust });
  P('bellowsStrut', strutGeo, { x: 0.3, y: 1.07, z: 0.2, mat: SHARED_MATS.magmaCrust });
  // Nozzles: short crusted pipes off the front and sides, which is where the
  // beams to the crowd are drawn from and what makes it read as feeding them.
  const nozGeo = prism(0.06, 0.1, 0.26, 5);
  P('bellowsNozzle', nozGeo, { x: -0.32, y: 1.05, z: -0.18, rz: 0.9, rx: -0.5 });
  P('bellowsNozzle', nozGeo, { x: 0.32, y: 1.05, z: -0.18, rz: -0.9, rx: -0.5 });
  P('bellowsNozzle', nozGeo, { y: 1.05, z: -0.38, rx: -1.3 });
  // No legs at all, and nothing below the lower lobe: the silhouette has to
  // have AIR under it or it stops reading as support.
  P('bellowsCrust', spike(0.22, 0.34, 5), { y: 1.78, mat: SHARED_MATS.magmaCrust });
  eyes(P, { y: 1.48, x: 0.11, z: -0.3, r: 0.85, mat: e.eyeMat });
}

// A flat swept delta, all width and no height. Read against the CEILING rather
// than the skyline, so unlike the ground roster its job is to be a distinct
// shape from below - which is why it is a wing with a lit trailing edge and
// nothing that could be mistaken for a body with legs.
function buildAshwing(e, g, s) {
  const P = partsFor(e, g, s);
  // The wing: one flat plate, swept, with the leading edge crusted. Wide and
  // very thin, so from directly underneath it is a hard-edged triangle.
  P('ashwingWing', prism(0.12, 0.86, 0.16, 3), { y: 0.05, ry: Math.PI, sz: 1.5 });
  P('ashwingEdge', prism(0.1, 0.7, 0.09, 3), {
    y: 0.13, z: -0.12, ry: Math.PI, sz: 1.3, mat: SHARED_MATS.magmaCrust,
  });
  // A short cracked spine along the centre - the only mass on it, so the wing
  // reads as carrying something rather than as a loose sheet.
  P('ashwingCore', rock(0.2), { y: 0.16, z: 0.1, sy: 0.72, sz: 1.1 });
  // THE TRAILING VENTS. Three of them across the back edge, which is where the
  // fire comes off - so the part of the model the player sees last as it
  // passes over is the part that explains the line burning behind it.
  const ventGeo = shard(0.1);
  P('ashwingVent', ventGeo, { x: -0.4, y: 0.06, z: 0.5, mat: SHARED_MATS.magmaVent, shadow: false });
  P('ashwingVent', ventGeo, { x: 0, y: 0.06, z: 0.58, mat: SHARED_MATS.magmaVent, shadow: false });
  P('ashwingVent', ventGeo, { x: 0.4, y: 0.06, z: 0.5, mat: SHARED_MATS.magmaVent, shadow: false });
  // Wingtip fins, canted down. They break the flat triangle into something
  // with a top and a bottom, which is what tells the player whether it is
  // level or already rearing into a run.
  P('ashwingFin', spike(0.09, 0.34, 4), { x: -0.74, y: -0.02, rz: 1.9 });
  P('ashwingFin', spike(0.09, 0.34, 4), { x: 0.74, y: -0.02, rz: -1.9 });
  eyes(P, { y: 0.14, x: 0.1, z: -0.5, r: 0.8, mat: e.eyeMat });
}

function buildWarden(e, g, s) {
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

// A chaser that has burnt through. Same forward lean and the same legs under
// it - it is a rusher and has to read as one - but stripped down to a cage of
// ribs with the fire showing between them. Read: there is not much left of it,
// and what is left is on fire.
function buildCinder(e, g, s) {
  const P = partsFor(e, g, s);
  // The ember first, so the ribs are drawn over it and it shows THROUGH the
  // gaps rather than sitting on top of the chest.
  P('cinderCore', lump(0.2), { y: 0.94, z: -0.04, mat: SHARED_MATS.cinderEmber, shadow: false });
  // A cage, not a torso: four thin bars round the core, leaning with the body.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('cinderRib', slab(0.06, 0.52, 0.06), {
      x: Math.cos(a) * 0.21, y: 0.94, z: Math.sin(a) * 0.17 - 0.04,
      rx: -0.3, rz: -Math.cos(a) * 0.24,
    });
  }
  P('cinderYoke', prism(0.22, 0.24, 0.12, 5), { y: 1.24, z: -0.12, rx: -0.3 });
  P('cinderPelvis', prism(0.18, 0.14, 0.14, 5), { y: 0.62, z: 0.04 });
  // Skull, small and thrust forward on a bare neck.
  P('cinderNeck', prism(0.06, 0.07, 0.14, 4), { y: 1.34, z: -0.2, rx: -0.6 });
  P('cinderSkull', shard(0.14), { y: 1.44, z: -0.32, sz: 1.3 });
  // THE CREST. Three tongues swept back off the skull, thin and rising - the
  // only part that is not straight, and what makes the outline read as flame
  // rather than as one more spined rusher.
  for (const [x, ln, tilt] of [[-0.12, 0.4, 1.0], [0, 0.54, 0.75], [0.12, 0.4, 1.0]]) {
    P('cinderTongue', spike(0.045, ln, 4), { x, y: 1.5, z: 0.06, rx: tilt });
  }
  P('cinderThigh', slab(0.09, 0.42, 0.11), { x: -0.14, y: 0.5, z: 0.08, rx: 0.35 });
  P('cinderThigh', slab(0.09, 0.42, 0.11), { x: 0.14, y: 0.5, z: 0.08, rx: 0.35 });
  P('cinderShin', slab(0.07, 0.4, 0.09), { x: -0.14, y: 0.19, z: -0.02, rx: -0.22 });
  P('cinderShin', slab(0.07, 0.4, 0.09), { x: 0.14, y: 0.19, z: -0.02, rx: -0.22 });
  eyes(P, { y: 1.46, x: 0.08, z: -0.42, r: 0.8, mat: e.eyeMat });
}

// Hunched, heavy in the shoulders, dragging a back full of ice. It leans
// forward like every rusher but its mass is up and BEHIND it, which is what
// says it is slower than the others before it has taken a step.
function buildRime(e, g, s) {
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
function buildShard(e, g, s) {
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
function buildGlacier(e, g, s) {
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
function buildHailer(e, g, s) {
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
function buildHoarfrost(e, g, s) {
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
function buildSleet(e, g, s) {
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

function buildHusk(e, g, s) {
  const P = partsFor(e, g, s);
  P('huskGut', lump(0.46), { y: 0.82, sx: 1.25, sy: 1.15, sz: 1.05 });
  P('huskChest', prism(0.42, 0.5, 0.34, 6), { y: 1.32 });
  // THE SACS. Two on the shoulders and one slung under the gut, all three in
  // the gas's own colour and all three out past the body's outline, so the
  // thing is lumpy from every angle.
  P('huskSac', lump(0.26), { x: -0.46, y: 1.34, z: 0.04, mat: SHARED_MATS.huskSac });
  P('huskSac', lump(0.26), { x: 0.46, y: 1.34, z: 0.04, mat: SHARED_MATS.huskSac });
  P('huskSac', lump(0.3), { y: 0.56, z: -0.34, sy: 0.8, mat: SHARED_MATS.huskSac });
  // Split down the front, and the split is what it comes apart along.
  P('huskSeam', slab(0.07, 0.62, 0.1), { y: 1.0, z: -0.42, mat: SHARED_MATS.huskSac, shadow: false });
  // Head sunk between the shoulders - no neck at all, which is the read for
  // something that does not turn quickly.
  P('huskHead', prism(0.15, 0.2, 0.24, 5), { y: 1.58, z: -0.1 });
  // Thick, short, splayed legs. A brute stands; it does not run.
  P('huskThigh', slab(0.22, 0.34, 0.24), { x: -0.26, y: 0.42, rz: 0.16 });
  P('huskThigh', slab(0.22, 0.34, 0.24), { x: 0.26, y: 0.42, rz: -0.16 });
  P('huskFoot', slab(0.28, 0.2, 0.34), { x: -0.28, y: 0.12 });
  P('huskFoot', slab(0.28, 0.2, 0.34), { x: 0.28, y: 0.12 });
  eyes(P, { y: 1.6, x: 0.09, z: -0.22, r: 0.85, mat: e.eyeMat });
}

// The blight's build with the nozzle pointed at the SKY. Bottom-heavy,
// hunched, four splayed legs - it belongs to the same family and is meant to,
// because until the glob lands the two are the same problem. The mortar is
// what tells them apart: a blight sprays forward, this one lobs.
function buildVitriol(e, g, s) {
  const P = partsFor(e, g, s);
  P('vitriolGut', lump(0.46), { y: 0.4, sx: 1.15, sy: 0.75, sz: 1.1 });
  // THE MORTAR. A wide-mouthed tube standing up out of the back, flared at the
  // top - the one part of the outline that breaks the skyline, and the reason
  // this reads as artillery rather than as another crawler.
  P('vitriolTube', prism(0.26, 0.14, 0.66, 6), {
    y: 0.96, z: 0.12, rx: -0.22, mat: SHARED_MATS.gunmetal,
  });
  P('vitriolMouth', prism(0.3, 0.22, 0.12, 6), {
    y: 1.3, z: 0.18, rx: -0.22, mat: SHARED_MATS.gunmetal,
  });
  // What it is loaded with, glowing in the throat of the tube.
  P('vitriolCharge', lump(0.16), { y: 1.24, z: 0.16, mat: SHARED_MATS.vitriolSac, shadow: false });
  P('vitriolSac', lump(0.22), { x: -0.42, y: 0.5, z: -0.1, mat: SHARED_MATS.vitriolSac });
  P('vitriolSac', lump(0.22), { x: 0.42, y: 0.5, z: -0.1, mat: SHARED_MATS.vitriolSac });
  // Head low and forward, under the tube, so the two never merge.
  P('vitriolHead', prism(0.14, 0.2, 0.3, 5), { y: 0.44, z: -0.5, rx: -1.2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('vitriolLeg', slab(0.09, 0.36, 0.09), {
      x: Math.cos(a) * 0.42, y: 0.18, z: Math.sin(a) * 0.36,
      rz: -Math.cos(a) * 0.7, rx: Math.sin(a) * 0.45,
    });
  }
  eyes(P, { y: 0.56, x: 0.08, z: -0.56, r: 0.75, mat: e.eyeMat });
}

// Support shape - floating, legless, symmetrical - built around a MOUTH that
// faces the player. The first pass hung the jaw underneath the body, which is
// exactly where a player standing at eye height cannot see it: the enemy read
// as an abstract purple crystal and the one thing it needed to say - that it
// is about to open - was pointed at the floor. The mouth is on the front now,
// and the horns are there so the outline is not another cone.
function buildHowler(e, g, s) {
  const P = partsFor(e, g, s);
  // Cranium: a wide, shallow dome over the mouth rather than a tall bell, so
  // the top half of the silhouette is a brow and not a spire.
  P('howlerSkull', prism(0.2, 0.42, 0.42, 6), { y: 1.5 });
  P('howlerBrow', slab(0.6, 0.1, 0.34), { y: 1.32, z: -0.16 });
  // THE HORNS. Two, long, swept back and out - the whole reason this is not a
  // warden at a glance, and the part that survives at any distance.
  for (const dir of [-1, 1]) {
    P('howlerHorn', spike(0.07, 0.72, 4), {
      x: dir * 0.26, y: 1.62, z: 0.12, rx: 0.85, rz: dir * -0.4,
    });
  }
  // THE THROAT, drawn before the jaw so an open mouth opens onto a hole and
  // not onto the sky behind it.
  P('howlerThroat', prism(0.26, 0.3, 0.34, 6), {
    y: 1.06, z: -0.06, mat: SHARED_MATS.howlerMaw, shadow: false,
  });
  // A keel under the throat, tapering to nothing well clear of the floor:
  // legless is the support read, and this is what fills the space where a
  // rusher would have had legs.
  P('howlerKeel', spike(0.22, 0.62, 6), { y: 0.72, rx: Math.PI });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P('howlerRib', slab(0.05, 0.44, 0.05), {
      x: Math.cos(a) * 0.26, y: 1.16, z: Math.sin(a) * 0.26,
    });
  }
  // The jaw hangs off a HINGE GROUP rather than being a part in its own right:
  // aiHowler rotates it open over the wind-up, and a mesh placed by P turns
  // about its own centre, which would swing the jaw through the throat instead
  // of dropping it. The hinge sits at the FRONT of the head, so the jaw falls
  // toward the player rather than straight down.
  const hinge = new THREE.Group();
  hinge.position.set(0, 1.16 * s, -0.24 * s);
  const jaw = new THREE.Mesh(geo('howlerJaw', prism(0.34, 0.16, 0.4, 5)), e.bodyMat);
  jaw.position.set(0, -0.2 * s, -0.04 * s);
  jaw.scale.setScalar(s);
  jaw.castShadow = true;
  hinge.add(jaw);
  // Two tusks on the jaw, so the mouth reads as a mouth even shut.
  for (const dir of [-1, 1]) {
    const tusk = new THREE.Mesh(geo('howlerTusk', spike(0.05, 0.26, 4)), e.bodyMat);
    tusk.position.set(dir * 0.15 * s, -0.06 * s, -0.14 * s);
    tusk.rotation.x = -0.2;
    tusk.scale.setScalar(s);
    hinge.add(tusk);
  }
  hinge.rotation.x = 0.2;
  g.add(hinge);
  e.jaw = hinge;
  // Eyes high on the brow, wide apart, over the mouth.
  eyes(P, { y: 1.44, x: 0.17, z: -0.32, r: 1.0, mat: e.eyeMat });
}

// The other support shape, and deliberately the thinnest thing in the roster:
// a floating spine holding a ring up in front of itself. Where the conduit is
// a machine and the warden a monolith, this is a FIGURE - it has shoulders and
// a head, and it is pointing at you.
function buildHexer(e, g, s) {
  const P = partsFor(e, g, s);
  P('hexerSpine', prism(0.1, 0.16, 0.9, 5), { y: 1.15 });
  P('hexerCowl', prism(0.26, 0.1, 0.3, 6), { y: 1.62, rx: 0.15 });
  P('hexerHead', shard(0.13), { y: 1.5, z: -0.06 });
  // The hem: a skirt of thin blades where legs would be, hanging clear of the
  // floor. Legless is the support read, and this is what fills the gap the
  // missing legs leave in the outline.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    P('hexerHem', spike(0.06, 0.44, 4), {
      x: Math.cos(a) * 0.2, y: 0.5, z: Math.sin(a) * 0.2, rx: Math.PI + Math.sin(a) * 0.2,
      rz: -Math.cos(a) * 0.2,
    });
  }
  // Two arms held out and forward, cradling the ring. They are what make the
  // thing read as aiming rather than as floating.
  P('hexerArm', slab(0.07, 0.34, 0.07), { x: -0.26, y: 1.24, z: -0.2, rx: -0.9, rz: -0.4 });
  P('hexerArm', slab(0.07, 0.34, 0.07), { x: 0.26, y: 1.24, z: -0.2, rx: -0.9, rz: 0.4 });
  // THE SIGIL. A ring standing upright in front of the chest, spun while it
  // channels - and the thing the beam appears to come out of.
  const ring = new THREE.Mesh(
    geo('hexerRing', () => new THREE.TorusGeometry(0.3, 0.045, 6, 12)),
    SHARED_MATS.hexerRing
  );
  ring.position.set(0, 1.2 * s, -0.42 * s);
  ring.scale.setScalar(s);
  e.ring = ring;
  g.add(ring);
  eyes(P, { y: 1.52, x: 0.07, z: -0.16, r: 0.85, mat: e.eyeMat });
}

// ---- the air roster ------------------------------------------------------
// One shape language, split down the middle. BOTH are legless with a lit
// underside, which is the shared read for "this is not on the floor" and is
// the only thing in the roster that glows downward. Everything else about them
// is opposed, because their behaviour is:
//
//   harrier  wide, flat, SYMMETRICAL, wings drooping - a platform. It holds
//            still and works at range, so it is built like something parked.
//   shrike   long, narrow, nose-forward, wings swept UP - a weapon. It is
//            longer than it is tall, which nothing else here is, and the
//            silhouette points at where it is going.
//
// The test is the same one the ground roster is held to: as a flat black
// shape, against the sky, you can tell which one is about to hit you.

// A gun platform that happens to hover. Flat, four-way symmetrical, and built
// around the pod slung underneath it - the part it has to come down to use.
function buildHarrier(e, g, s) {
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

// A thrown spear with wings. Longer than it is tall - the only model in the
// roster that is - and every line on it points forward.
function buildShrike(e, g, s) {
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
const HARRIER_HIGH = 5.0;
const HARRIER_LOW = 2.1;
const HARRIER_HIGH_ARMOR = 0.2;
const HARRIER_BURST = 3;
const HARRIER_SHOT_GAP = 0.26;
const HARRIER_CD = 3.4;
// Dropping is faster than climbing back. The descent should look like a
// decision and the climb like a retreat, and the extra half second at the
// bottom is the window the whole enemy is built around.
const HARRIER_DROP_RATE = 6;
const HARRIER_RISE_RATE = 2.6;

function aiHarrier(e, a) {
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

// SHRIKE. Four states in a fixed loop, and the loop IS the fight with it:
// circle out of reach, rear up (the tell), fall on a spot on the floor, then
// crawl back into the sky. Two of the four are the player's turn.
const SHRIKE_HIGH = 5.2;
const SHRIKE_DIVE_Y = 0.9;
// The tell. Long enough to see, react to and walk out of - it is the whole
// reason the dive is allowed to hurt as much as it does.
const SHRIKE_WINDUP = 0.85;
const SHRIKE_DIVE_TIME = 1.4;
const SHRIKE_CLIMB_TIME = 1.5;
// Multiples of this enemy's own speed. The dive is the one movement in the
// game that beats the player's sprint, which is why it has to commit to a spot
// rather than track - see stepMul on Enemy for how it gets past the clamp
// every other enemy's velocity is held to.
const SHRIKE_DIVE_MUL = 2.9;
const SHRIKE_HIT_RANGE = 1.9;

function aiShrike(e, a) {
  const ctx = a.ctx;
  if (e.sState === undefined) {
    e.sState = 'circle';
    e.sT = 1 + Math.random() * 1.6;
    e.stx = 0;
    e.stz = 0;
  }

  if (e.sState === 'circle') {
    orbit(e, a, ENEMY_TYPES[e.type].orbit);
    e.hoverY = SHRIKE_HIGH;
    e.flyRate = FLY_RATE_DEFAULT;
    e.stepMul = 1.4;
    e.sT -= a.dt;
    if (e.sT <= 0 && a.dist < 18) {
      e.sState = 'mark';
      e.sT = SHRIKE_WINDUP;
      e._setEyeAlert(true);
    }
    return;
  }

  if (e.sState === 'mark') {
    // Rears up and drifts in over the player. Rising while everything else in
    // the arena is coming DOWN the screen is the tell that carries at range,
    // and the eyes are the one that carries up close.
    e.hoverY = SHRIKE_HIGH + 1.0;
    e.flyRate = 5;
    a.vx = a.nx * a.sp * 0.5;
    a.vz = a.nz * a.sp * 0.5;
    e.sT -= a.dt;
    if (e.sT <= 0) {
      // Locked to the GROUND, not to the player. Everything telegraphed in
      // this game commits to a place; a dive that tracked would be an
      // unavoidable hit with a wind-up animation in front of it.
      e.stx = ctx.player.pos.x;
      e.stz = ctx.player.pos.z;
      e.sState = 'dive';
      e.sT = SHRIKE_DIVE_TIME;
      _blinkAt.set(e.stx, 0.06, e.stz);
      ctx.effects.shockwave(_blinkAt, ENEMY_TYPES[e.type].eye, 2.4, 0.5);
    }
    return;
  }

  if (e.sState === 'dive') {
    e.hoverY = SHRIKE_DIVE_Y;
    e.flyRate = 11;
    e.stepMul = SHRIKE_DIVE_MUL;
    const dx = e.stx - e.pos.x;
    const dz = e.stz - e.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    a.vx = (dx / d) * a.sp * SHRIKE_DIVE_MUL;
    a.vz = (dz / d) * a.sp * SHRIKE_DIVE_MUL;
    e.sT -= a.dt;
    // Hits whoever is in the way, not only whoever was standing on the mark:
    // it is a body travelling at thirteen metres a second and the mark is
    // where it is AIMED, not the extent of it.
    const dy = Math.abs(ctx.player.pos.y - e.pos.y);
    if (a.dist < SHRIKE_HIT_RANGE && dy < Enemy.MELEE_REACH_Y) {
      // Through landHit, so a shade's dive leaves its fear where a shrike's
      // leaves nothing. The two fly the same loop and differ only in the type
      // block - see `shade`.
      landHit(e, ctx);
      _blinkAt.set(e.pos.x, e.pos.y, e.pos.z);
      ctx.effects.burst(_blinkAt, ENEMY_TYPES[e.type].eye, 14, 5, 2, 0.4);
      ctx.effects.addShake(0.12);
      _shrikeClimb(e);
      return;
    }
    // Out of time, or it has arrived at the spot and there was nobody on it.
    if (e.sT <= 0 || (d < 0.9 && e.pos.y < SHRIKE_DIVE_Y + 0.5)) {
      _blinkAt.set(e.pos.x, 0.1, e.pos.z);
      ctx.effects.burst(_blinkAt, 0xbfd0ff, 8, 3, 1.4, 0.4);
      _shrikeClimb(e);
    }
    return;
  }

  // CLIMB. The bill for a dive, hit or missed: a second and a half at half
  // speed, going up in a straight line away from the player. This is the shot
  // the player is meant to take, and it is why the shrike is allowed to be
  // untouchable for the rest of its loop.
  e.hoverY = SHRIKE_HIGH;
  e.flyRate = 2;
  e.stepMul = 1.4;
  a.vx = -a.nx * a.sp * 0.5;
  a.vz = -a.nz * a.sp * 0.5;
  e.sT -= a.dt;
  if (e.sT <= 0) {
    e.sState = 'circle';
    e.sT = 0.7 + Math.random() * 0.9;
  }
}

function _shrikeClimb(e) {
  e.sState = 'climb';
  e.sT = SHRIKE_CLIMB_TIME;
  e.stepMul = 1.4;
  e._setEyeAlert(false);
}

// ---- TEMPEST ---------------------------------------------------------------
// The theme's language: PRONGS WITH A GAP, and something bright held in it.
// Every one of these is a pair of forks, rails, plates or vanes stood apart on
// thin rods, with the mass pushed out to the ends and nothing at all in the
// middle except the core.
//
// It is a different kind of hole from VOID's. VOID's gap is an absence - the
// part of the body that is missing - and TEMPEST's is the WORKING PART: the
// two ends are aimed at each other, and the eye reads the space between them
// as loaded rather than as empty. Every mechanic in the theme is a line
// between two points, and the bodies say so before anything fires.

// A tuning fork that runs. Small, light, and almost all of its outline is the
// two prongs - so a pair of arclings across a room read as two forks aimed at
// each other before the wire between them is even drawn.
function buildArcling(e, g, s) {
  const P = partsFor(e, g, s);
  // THE PRONGS ARE THE ENEMY. Tall, thin, and splayed - they clear the head
  // by half a body height, which is what makes the silhouette top-heavy and
  // unmistakable at a distance.
  P('arcProng', slab(0.07, 0.7, 0.07), { x: -0.19, y: 1.42, rz: 0.16 });
  P('arcProng', slab(0.07, 0.7, 0.07), { x: 0.19, y: 1.42, rz: -0.16 });
  // The core, suspended between their tips. The one bright thing on it.
  P('arcCore', shard(0.11), { y: 1.66, mat: e.eyeMat, shadow: false });
  // A narrow hunched body under them, deliberately small - a rusher this fast
  // should read as almost nothing but the fork it is carrying.
  P('arcTorso', prism(0.19, 0.11, 0.5, 4), { y: 0.92, rx: -0.24, ry: Math.PI / 4 });
  P('arcYoke', slab(0.42, 0.08, 0.09), { y: 1.14 });
  // Thin rods for legs. Nothing about this enemy is heavy.
  P('arcLeg', slab(0.06, 0.5, 0.06), { x: -0.13, y: 0.26, rz: 0.1 });
  P('arcLeg', slab(0.06, 0.5, 0.06), { x: 0.13, y: 0.26, rz: -0.1 });
  eyes(P, { y: 1.06, x: 0.09, z: -0.2, r: 0.7, mat: e.eyeMat });
}

// A wide V on a pole. The horns are held out in FRONT rather than up, so the
// gap between them faces the player - which is where the bolt charges, and so
// the tell is aimed at the person it is aimed at.
function buildCoil(e, g, s) {
  const P = partsFor(e, g, s);
  // The two horns, swept forward and apart. Long enough that the V is legible
  // side-on as well as head-on.
  P('coilHorn', spike(0.09, 0.66, 4), { x: -0.26, y: 1.3, z: -0.22, rx: -1.25, rz: 0.4 });
  P('coilHorn', spike(0.09, 0.66, 4), { x: 0.26, y: 1.3, z: -0.22, rx: -1.25, rz: -0.4 });
  // THE BOLT, in the mouth of the V. Driven by aiCoil - it swells while the
  // shot is charging, which is the entire warning the player gets.
  e.coilCore = P('coilCore', shard(0.13), {
    y: 1.32, z: -0.5, mat: e.eyeMat, shadow: false,
  });
  // A thin column, and a collar where the horns are rooted. No shoulders and
  // no arms: everything this enemy does happens in front of its face.
  P('coilCollar', prism(0.19, 0.15, 0.16, 6), { y: 1.16 });
  P('coilSpine', slab(0.13, 0.72, 0.13), { y: 0.76 });
  P('coilFoot', prism(0.26, 0.3, 0.18, 6), { y: 0.16 });
  // A low outrigger each side, so it stands rather than balances.
  P('coilStrut', slab(0.05, 0.44, 0.05), { x: -0.19, y: 0.3, rz: 0.5 });
  P('coilStrut', slab(0.05, 0.44, 0.05), { x: 0.19, y: 0.3, rz: -0.5 });
  eyes(P, { y: 1.16, x: 0.1, z: -0.18, r: 0.75, mat: e.eyeMat });
}

// A standing barbell. Two heavy drum plates held apart at chest height on a
// squat frame, with the charge building in the gap - so the meter the player
// is filling is a thing on the model rather than a number nobody can see.
function buildDynamo(e, g, s) {
  const P = partsFor(e, g, s);
  // THE DRUMS ARE HELD CLEAR OF EVERYTHING, and that is not a style choice.
  // The first draft had them at 0.36 either side of a torso 0.36 wide, so the
  // body filled the gap exactly and the silhouette came out as one solid
  // blob - the same failure the bellows had, where the central mass bridged
  // the space the whole design is built on. Pushed out past the body, and the
  // only thing crossing between them is the axle.
  const drum = prism(0.34, 0.34, 0.14, 6);
  P('dynDrum', drum, { x: -0.54, y: 0.98, rz: Math.PI / 2 });
  P('dynDrum', drum, { x: 0.54, y: 0.98, rz: Math.PI / 2 });
  // THE STORED CHARGE. Held on the enemy and grown by aiDynamo as the meter
  // fills, so a dynamo about to go off is visibly about to go off.
  e.dynCore = P('dynCore', shard(0.19), { y: 0.98, mat: e.eyeMat, shadow: false });
  P('dynAxle', slab(1.12, 0.07, 0.07), { y: 0.98 });
  // AND NO HEAD. The gap has to stay empty from the axle to the top of the
  // drums, and a head on a neck is exactly the wrong height to put anything
  // there - so this one is a device rather than an animal, which is what the
  // capacitor already is and what the theme reads as anyway.
  P('dynTorso', prism(0.24, 0.32, 0.56, 6), { y: 0.48 });
  P('dynCowl', slab(0.28, 0.2, 0.22), { y: 0.66, z: -0.16, rx: -0.3 });
  // Short thick legs, set wide. A brute that looked like it could run would
  // be lying, and this one has to look like it is BRACED.
  P('dynLeg', slab(0.2, 0.34, 0.22), { x: -0.26, y: 0.17 });
  P('dynLeg', slab(0.2, 0.34, 0.22), { x: 0.26, y: 0.17 });
  // Two stub arms, LOW and forward, for the swing it still has - below the
  // drums rather than beside them, or they would fill the gap from the side.
  P('dynArm', slab(0.11, 0.11, 0.36), { x: -0.36, y: 0.5, z: -0.2 });
  P('dynArm', slab(0.11, 0.11, 0.36), { x: 0.36, y: 0.5, z: -0.2 });
  eyes(P, { y: 0.68, x: 0.1, z: -0.28, r: 0.8, mat: e.eyeMat });
}

// Something carrying a mast. One long rod raised over the shoulder with a
// bright tip, and a body leaning back under the weight of it - so the outline
// says "this is pointed at the sky" from anywhere in the room.
function buildStormcaller(e, g, s) {
  const P = partsFor(e, g, s);
  // THE MAST. It has to break the top of the silhouette by a long way or the
  // enemy is a blight with different colours.
  P('stormMast', slab(0.07, 1.35, 0.07), { x: 0.22, y: 1.5, rz: -0.2 });
  e.stormTip = P('stormTip', shard(0.14), {
    x: 0.44, y: 2.12, mat: e.eyeMat, shadow: false,
  });
  // Two short catch-prongs at the mast's foot, so the top of it is a fork like
  // everything else in the theme rather than a plain stick.
  P('stormFork', slab(0.05, 0.3, 0.05), { x: 0.31, y: 1.9, rz: -0.5 });
  P('stormFork', slab(0.05, 0.3, 0.05), { x: 0.5, y: 1.9, rz: 0.3 });
  // Leaning back, and asymmetric - one shoulder is carrying everything.
  P('stormTorso', prism(0.24, 0.3, 0.6, 5), { y: 0.86, rx: 0.22 });
  P('stormPauldron', prism(0.16, 0.2, 0.16, 5), { x: 0.28, y: 1.16, rz: -0.4 });
  P('stormHead', slab(0.22, 0.2, 0.2), { y: 1.28, z: -0.1, rx: 0.2 });
  P('stormArm', slab(0.09, 0.09, 0.4), { x: 0.26, y: 1.02, z: -0.1, rx: 0.5 });
  P('stormLeg', slab(0.11, 0.5, 0.13), { x: -0.16, y: 0.26 });
  P('stormLeg', slab(0.11, 0.5, 0.13), { x: 0.16, y: 0.26 });
  eyes(P, { y: 1.3, x: 0.09, z: -0.22, r: 0.75, mat: e.eyeMat });
}

// A stack of plates on a stalk, with a core in every gap. No head and no
// limbs at all - it is obviously a device rather than an animal, which is what
// a support has to read as before the player can be asked to shoot it first.
function buildCapacitor(e, g, s) {
  const P = partsFor(e, g, s);
  const plate = prism(0.36, 0.36, 0.07, 6);
  // THREE PLATES, TWO GAPS. Three is the count that reads as a stack; two
  // would read as a drum and four as a column.
  P('capPlate', plate, { y: 0.66 });
  P('capPlate', plate, { y: 1.04 });
  P('capPlate', plate, { y: 1.42 });
  // The cores in the gaps, which is where the theme's language lives.
  e.capCoreA = P('capCore', shard(0.14), { y: 0.85, mat: e.eyeMat, shadow: false });
  e.capCoreB = P('capCore', shard(0.14), { y: 1.23, mat: e.eyeMat, shadow: false });
  // The stalk through them, and three thin legs. Nothing else.
  P('capStalk', slab(0.1, 1.3, 0.1), { y: 1.0 });
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2 + 0.5;
    P('capLeg', slab(0.05, 0.6, 0.05), {
      x: Math.cos(ang) * 0.2, y: 0.3, z: Math.sin(ang) * 0.2,
      rz: Math.cos(ang) * -0.45, rx: Math.sin(ang) * 0.45,
    });
  }
  // A single eye on the top plate, and only one: a device that watches rather
  // than a face that looks.
  P('capEye', shard(0.08), { y: 1.52, mat: e.eyeMat, shadow: false });
}

// A pair of swept vanes with the middle taken out. Read from below - which is
// the only place it is ever seen from - it is a wide forward-raked V with a
// bright bar across the gap, and nothing that looks like a body.
function buildSquall(e, g, s) {
  const P = partsFor(e, g, s);
  // THE VANES. Long, thin and swept back hard, and they carry the whole
  // outline: a squall has no attack, so it has to be recognisable in the two
  // seconds before it arrives or it is simply an unexplained shove.
  P('sqVane', slab(0.9, 0.06, 0.24), { x: -0.62, y: 0.6, z: 0.16, ry: 0.5, rz: 0.28 });
  P('sqVane', slab(0.9, 0.06, 0.24), { x: 0.62, y: 0.6, z: 0.16, ry: -0.5, rz: -0.28 });
  // Two short inner spars holding the vanes off a centre that is not there.
  P('sqSpar', slab(0.3, 0.07, 0.07), { x: -0.24, y: 0.6, rz: 0.2 });
  P('sqSpar', slab(0.3, 0.07, 0.07), { x: 0.24, y: 0.6, rz: -0.2 });
  // THE BAR ACROSS THE GAP, bright, and the only thing in the middle.
  P('sqCore', slab(0.26, 0.09, 0.09), { y: 0.6, mat: e.eyeMat, shadow: false });
  // A small forward prow so it has a direction, and a stub tail so it has a
  // back. Both deliberately tiny - the mass is all out on the vanes.
  P('sqProw', spike(0.11, 0.42, 4), { y: 0.6, z: -0.34, rx: -Math.PI / 2 });
  P('sqTail', spike(0.09, 0.3, 4), { y: 0.6, z: 0.3, rx: Math.PI / 2 });
  // A KEEL AND A FIN, and they are what make it an enemy rather than a smear.
  // Two swept vanes and nothing else is a horizontal line, and a horizontal
  // line seen from the floor at player eye height is a scratch on the screen -
  // it read as almost nothing in the viewer. The cross the fin and keel make
  // gives it height to be recognised by, and it is a different cross from the
  // mothcap's ragged disc and the sleet's hanging column.
  P('sqFin', slab(0.08, 0.44, 0.34), { y: 0.84, z: 0.1 });
  P('sqKeel', spike(0.15, 0.6, 4), { y: 0.32, z: -0.04, rx: Math.PI });
  eyes(P, { y: 0.62, x: 0.11, z: -0.22, r: 0.7, mat: e.eyeMat });
}

// A mast in the floor: two rails with bright rungs between them. Deliberately
// NOT an anchor - the Crown's anchor is a spike driven in, a lock on a door,
// and this is a thing with two ends and a line running out of the top of it.
function buildPylon(e, g, s) {
  const P = partsFor(e, g, s);
  P('pylRail', slab(0.09, 1.7, 0.09), { x: -0.2, y: 0.9, rz: 0.05 });
  P('pylRail', slab(0.09, 1.7, 0.09), { x: 0.2, y: 0.9, rz: -0.05 });
  // The rungs. Bright, so the pylon is findable across a room at a glance -
  // which is the only thing it has to be.
  for (let i = 0; i < 3; i++) {
    P('pylRung', slab(0.34, 0.06, 0.06), {
      y: 0.5 + i * 0.42, mat: e.eyeMat, shadow: false,
    });
  }
  // A splayed foot, and a fork at the top where the boss's line lands.
  P('pylFoot', prism(0.24, 0.44, 0.2, 6), { y: 0.1 });
  P('pylFork', slab(0.06, 0.36, 0.06), { x: -0.17, y: 1.92, rz: 0.4 });
  P('pylFork', slab(0.06, 0.36, 0.06), { x: 0.17, y: 1.92, rz: -0.4 });
  e.pylTip = P('pylTip', shard(0.13), { y: 2.14, mat: e.eyeMat, shadow: false });
}

// ---- BRINE -----------------------------------------------------------------
// The theme's language: A SHELL THAT DOES NOT FIT, and something hanging off
// it. Every body is a smooth swollen mass with hard crusted plate laid over it
// a size out - bulging past the plate or hanging below it - and every one of
// them trails an appendage the plate does not cover: a lure, a siphon, a
// frond, a curtain.
//
// Where TEMPEST is held apart and STRATA is cut, BRINE is ENCRUSTED. The rule
// that keeps it from reading as VERDANT's raggedness is that the plates are
// SMOOTH and the thing under them is smooth too - nothing here is torn, it is
// all grown over.

// Mostly mouth. A wide low jaw slung under a small crusted back, so the
// silhouette is a shape that is about to close on something.
function buildGulper(e, g, s) {
  const P = partsFor(e, g, s);
  // THE JAW IS THE ENEMY. It has to be wider than the body and it has to
  // project well forward, or a gulper reads as one more four-legged rusher.
  // OPEN, and the gape is a real gap in the outline. Shut, the two plates read
  // as one snout and the enemy came out as a beetle; hinged apart they make a
  // V that is visible from anywhere, and the V is the only thing that says
  // this is a mouth about to close on somebody.
  P('gulpJawLow', prism(0.36, 0.2, 0.62, 5), { y: 0.36, z: -0.46, rx: -1.9 });
  P('gulpJawTop', prism(0.3, 0.16, 0.56, 5), { y: 0.92, z: -0.44, rx: -1.05 });
  // Teeth - short spikes along both plates, pointing INTO the gap, which is
  // what keeps the V from reading as a hinge on a machine.
  for (let i = 0; i < 4; i++) {
    const x = -0.18 + i * 0.12;
    P('gulpTooth', spike(0.05, 0.2, 4), { x, y: 0.5, z: -0.66, rx: -2.0 });
    P('gulpToothU', spike(0.05, 0.2, 4), { x, y: 0.82, z: -0.64, rx: 1.1 });
  }
  // A small crusted plate over the back, deliberately too small for the body
  // under it - the theme's whole rule in one part.
  P('gulpShell', prism(0.3, 0.26, 0.2, 6), { y: 0.86, z: 0.1, rx: 0.3 });
  P('gulpBody', lump(0.3), { y: 0.62, z: 0.14 });
  // A siphon trailing off the back. It HANGS, which is the other half of the
  // theme's language, and it is what tells the player which way round it is.
  P('gulpSiphon', spike(0.09, 0.5, 4), { y: 0.5, z: 0.42, rx: 2.2 });
  // Four stubby legs, splayed. Low to the floor - it should look like it
  // arrives at your ankles.
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1;
    P('gulpLeg', slab(0.06, 0.34, 0.06), {
      x: 0.2 * sx, y: 0.18, z: (i % 2 ? 0.16 : -0.14), rz: 0.45 * sx,
    });
  }
  eyes(P, { y: 0.86, x: 0.13, z: -0.24, r: 0.7, mat: e.eyeMat });
}

// A hunched body with a LURE on a stalk out in front of it, and the lure is
// the whole read: at seventeen metres the body is a smudge and the light is
// what the player sees, hanging in the dark where the shot is going to come
// from.
function buildAngler(e, g, s) {
  const P = partsFor(e, g, s);
  // The stalk arcs forward and over, so the light hangs in FRONT of the face
  // rather than sitting on top of the head.
  P('angStalk', slab(0.06, 0.62, 0.06), { y: 1.42, z: -0.16, rx: -0.6 });
  P('angStalk2', slab(0.06, 0.34, 0.06), { y: 1.66, z: -0.46, rx: -1.15 });
  e.angLure = P('angLure', shard(0.14), {
    y: 1.7, z: -0.66, mat: e.eyeMat, shadow: false,
  });
  // A tall narrow body under it, plated down the front and bulging at the
  // sides where the plate stops.
  P('angBody', prism(0.22, 0.3, 0.8, 5), { y: 0.78 });
  P('angPlate', slab(0.3, 0.5, 0.1), { y: 0.9, z: -0.24, rx: -0.14 });
  P('angFlank', lump(0.18), { x: -0.26, y: 0.72 });
  P('angFlank', lump(0.18), { x: 0.26, y: 0.72 });
  P('angHead', prism(0.16, 0.2, 0.24, 5), { y: 1.24, z: -0.08 });
  // Two long thin fins hanging off the back, and short legs. It should look
  // like it is standing in water rather than on a floor.
  P('angFin', slab(0.05, 0.44, 0.22), { x: -0.2, y: 0.66, z: 0.24, rz: 0.3 });
  P('angFin', slab(0.05, 0.44, 0.22), { x: 0.2, y: 0.66, z: 0.24, rz: -0.3 });
  P('angLeg', slab(0.08, 0.4, 0.09), { x: -0.13, y: 0.2 });
  P('angLeg', slab(0.08, 0.4, 0.09), { x: 0.13, y: 0.2 });
  eyes(P, { y: 1.26, x: 0.08, z: -0.2, r: 0.7, mat: e.eyeMat });
}

// A boulder of shell with a body wedged into it. Wide, low and CRUSTED - the
// plates are stacked cones rather than slabs, which is what keeps it from
// reading as the bulwark with a different colour.
function buildBarnacle(e, g, s) {
  const P = partsFor(e, g, s);
  // The shell: three stacked cone rings, widest at the bottom. A barnacle.
  P('barnShellA', prism(0.42, 0.6, 0.34, 6), { y: 0.3 });
  P('barnShellB', prism(0.3, 0.46, 0.3, 6), { y: 0.62 });
  P('barnShellC', prism(0.2, 0.34, 0.26, 6), { y: 0.88 });
  // THE MOUTH OF IT, on top and open - a dark gap in the crust with the body
  // showing through, which is the one place worth shooting and the one part
  // that is not plate.
  e.barnMaw = P('barnMaw', shard(0.16), { y: 1.06, mat: e.eyeMat, shadow: false });
  // Two heavy arms out of the sides, and they are what it swings with. Long,
  // so the reach the melee block claims is a reach the model has.
  P('barnArm', slab(0.14, 0.14, 0.62), { x: -0.46, y: 0.66, z: -0.22, ry: 0.35 });
  P('barnArm', slab(0.14, 0.14, 0.62), { x: 0.46, y: 0.66, z: -0.22, ry: -0.35 });
  P('barnClaw', prism(0.06, 0.18, 0.26, 5), { x: -0.6, y: 0.66, z: -0.5, rx: -1.4 });
  P('barnClaw', prism(0.06, 0.18, 0.26, 5), { x: 0.6, y: 0.66, z: -0.5, rx: -1.4 });
  // A skirt of short fronds round the base. It HANGS, and it is what makes an
  // anchored barnacle look rooted rather than parked.
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    P('barnFrond', spike(0.07, 0.28, 4), {
      x: Math.cos(ang) * 0.5, y: 0.12, z: Math.sin(ang) * 0.5, rx: Math.PI,
      rz: Math.cos(ang) * 0.4,
    });
  }
  eyes(P, { y: 1.0, x: 0.12, z: -0.3, r: 0.85, mat: e.eyeMat });
}

// A squat pot on legs with a wide funnel mouth aimed up and forward. It has to
// read as something that BLOWS, and the funnel is the only part that says so.
function buildVent(e, g, s) {
  const P = partsFor(e, g, s);
  // THE FUNNEL HAS TO OVERHANG. The first draft had it at the same width as
  // the pot and barely tipped, so at eye height the two merged into one lump
  // and the enemy read as a bottle with legs - nothing about it said it blew
  // anything anywhere. It is wider than the body now and tipped most of the
  // way to horizontal, so it breaks the outline forward and the direction it
  // is aimed is legible from any bearing.
  P('ventFunnel', prism(0.52, 0.13, 0.66, 6), { y: 1.16, z: -0.34, rx: -0.95 });
  e.ventGlow = P('ventGlow', shard(0.17), {
    y: 1.24, z: -0.62, mat: e.eyeMat, shadow: false,
  });
  // A NARROWER pot under it, deliberately - the funnel only overhangs if there
  // is less body than funnel.
  P('ventPot', lump(0.33), { y: 0.6 });
  P('ventBand', prism(0.31, 0.35, 0.16, 6), { y: 0.54 });
  P('ventNeck', slab(0.14, 0.3, 0.14), { y: 0.94, z: -0.1, rx: -0.3 });
  // Three pipes hanging off the back, trailing. The theme's appendage.
  for (let i = 0; i < 3; i++) {
    P('ventPipe', slab(0.07, 0.42, 0.07), {
      x: -0.16 + i * 0.16, y: 0.4, z: 0.36, rx: 0.5,
    });
  }
  P('ventLeg', slab(0.09, 0.42, 0.11), { x: -0.22, y: 0.2, rz: 0.2 });
  P('ventLeg', slab(0.09, 0.42, 0.11), { x: 0.22, y: 0.2, rz: -0.2 });
  P('ventLeg', slab(0.09, 0.42, 0.11), { y: 0.2, z: 0.24 });
  eyes(P, { y: 0.86, x: 0.11, z: -0.36, r: 0.75, mat: e.eyeMat });
}

// A bell with a curtain under it. Read from below - the only place it is seen
// from - it is a dome with a long ragged fringe hanging down, and the fringe
// is what says the ink comes from THERE.
function buildDrifter(e, g, s) {
  const P = partsFor(e, g, s);
  // The bell. Wide and shallow, so it is a lid on the sky rather than a body.
  P('driBell', prism(0.16, 0.62, 0.34, 8), { y: 0.7 });
  P('driCrown', prism(0.3, 0.18, 0.16, 8), { y: 0.92 });
  // THE CURTAIN. Six long trailing fronds, and they carry the silhouette:
  // without them this is a floating dish and with them it is a thing pouring
  // something out of itself.
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2;
    P('driFrond', slab(0.05, 0.72, 0.12), {
      x: Math.cos(ang) * 0.42, y: 0.18, z: Math.sin(ang) * 0.42,
      rz: Math.cos(ang) * 0.22, rx: Math.sin(ang) * -0.22,
    });
  }
  // Two shorter, thicker siphons in the middle of the curtain - the actual
  // spouts, and the only bright thing on it.
  P('driSiphon', spike(0.1, 0.44, 5), { x: -0.12, y: 0.3, rx: Math.PI, mat: e.eyeMat, shadow: false });
  P('driSiphon', spike(0.1, 0.44, 5), { x: 0.12, y: 0.3, rx: Math.PI, mat: e.eyeMat, shadow: false });
  eyes(P, { y: 0.62, x: 0.14, z: -0.4, r: 0.8, mat: e.eyeMat });
}

// ---- PLAGUE ----------------------------------------------------------------
// The theme's language: A RIND THAT HAS SPLIT. Every body is a bloated mass
// inside a hard shell that has come apart somewhere - a lid lifted, a seam
// opened, a flank hanging - with something soft and bright showing through the
// gap. Where BRINE is grown OVER and TEMPEST is held APART, PLAGUE is
// SPLITTING: the shell was closed once and is not any more.

// A hunched body carrying a cracked drum on its shoulder. The drum is what it
// fires out of and the crack is where the light comes from, so the one bright
// thing on it is also the one part that matters.
function buildLesion(e, g, s) {
  const P = partsFor(e, g, s);
  // THE DRUM, split across the top. Two halves with a gap, held high on one
  // shoulder so the outline is lopsided from any bearing.
  // TILTED APART AND CLEAR OF THE BODY. The first draft had the two halves
  // barely above a torso the same width, so they merged into it and a lesion
  // came out as a featureless box on legs - the same failure the dynamo's
  // drums and the vent's funnel had. They are wider than the body now, held a
  // head above it, and hinged apart so the split is a real notch in the top of
  // the outline rather than a line on a surface.
  P('lesDrumL', prism(0.3, 0.32, 0.42, 6), { x: -0.16, y: 1.44, z: -0.04, rz: 0.42 });
  P('lesDrumR', prism(0.3, 0.32, 0.42, 6), { x: 0.42, y: 1.38, z: -0.04, rz: -0.42 });
  e.lesCore = P('lesCore', shard(0.15), {
    x: 0.13, y: 1.42, z: -0.04, mat: e.eyeMat, shadow: false,
  });
  P('lesMount', slab(0.14, 0.34, 0.14), { x: 0.14, y: 1.12, rz: -0.2 });
  // A NARROWER stooped body under it, leaning away from the weight - the drum
  // only overhangs if there is less body than drum.
  P('lesTorso', prism(0.2, 0.28, 0.6, 5), { y: 0.72, rz: -0.24 });
  // The seam down the front, open. Small, but it is what makes the body read
  // as the same object as the drum rather than as a base for it.
  P('lesSeam', slab(0.08, 0.4, 0.06), { y: 0.76, z: -0.24, mat: e.eyeMat, shadow: false });
  P('lesHead', prism(0.12, 0.16, 0.2, 5), { x: -0.18, y: 1.1, z: -0.1, rz: 0.3 });
  P('lesArm', slab(0.09, 0.09, 0.4), { x: -0.28, y: 0.86, z: -0.16, rx: 0.4 });
  P('lesLeg', slab(0.11, 0.44, 0.12), { x: -0.16, y: 0.22 });
  P('lesLeg', slab(0.11, 0.44, 0.12), { x: 0.13, y: 0.22 });
  eyes(P, { y: 1.12, x: 0.07, z: -0.22, r: 0.65, mat: e.eyeMat });
}

// A stooped thing with an empty ribcage and two long hooks. It has to read as
// something that COLLECTS: the hollow chest is where the body it is raising
// would go, and the hooks are what it reaches with.
function buildCarrion(e, g, s) {
  const P = partsFor(e, g, s);
  // THE CAGE, burst open at the front. Four ribs sweeping forward with nothing
  // between them - the hole in the middle is most of the silhouette.
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1;
    const t = i % 2;
    P('carRib', slab(0.06, 0.62, 0.09), {
      x: (0.16 + t * 0.14) * sx, y: 1.0, z: -0.1 - t * 0.06,
      rz: (0.3 + t * 0.25) * sx, rx: -0.2,
    });
  }
  P('carSpine', slab(0.14, 0.8, 0.14), { y: 1.0, z: 0.18, rx: 0.24 });
  P('carPelvis', prism(0.24, 0.18, 0.22, 5), { y: 0.56, z: 0.1 });
  // A long neck and a small down-turned head, so it is stooped over the hole
  // rather than standing over it.
  P('carNeck', slab(0.09, 0.34, 0.09), { y: 1.5, z: 0.06, rx: -0.5 });
  P('carSkull', spike(0.13, 0.36, 5), { y: 1.62, z: -0.2, rx: -2.0 });
  // THE HOOKS. Long, thin and hanging well below the body - the theme's soft
  // thing showing through is the light on their tips.
  P('carArm', slab(0.07, 0.66, 0.07), { x: -0.4, y: 0.92, rz: 0.16 });
  P('carArm', slab(0.07, 0.66, 0.07), { x: 0.4, y: 0.92, rz: -0.16 });
  P('carHook', spike(0.09, 0.34, 4), { x: -0.44, y: 0.46, rx: 2.6, mat: e.eyeMat, shadow: false });
  P('carHook', spike(0.09, 0.34, 4), { x: 0.44, y: 0.46, rx: 2.6, mat: e.eyeMat, shadow: false });
  P('carLeg', slab(0.09, 0.5, 0.1), { x: -0.15, y: 0.25, rz: 0.1 });
  P('carLeg', slab(0.09, 0.5, 0.1), { x: 0.15, y: 0.25, rz: -0.1 });
  eyes(P, { y: 1.6, x: 0.08, z: -0.3, r: 0.7, mat: e.eyeMat });
}

// A fat sack under two small ragged wings, split along its underside. Read
// from below - the only place it is seen from - it is a bag about to open.
function buildBloatfly(e, g, s) {
  const P = partsFor(e, g, s);
  // THE SACK. Most of the body, and deliberately far too heavy for the wings
  // above it: a flier that looked airworthy would not read as something that
  // is going to fall on somebody.
  P('bloatSack', lump(0.5), { y: 0.5, sy: 1.25 });
  // The split, along the bottom. Bright, and it is the whole tell.
  P('bloatSplit', slab(0.1, 0.06, 0.66), { y: 0.14, mat: e.eyeMat, shadow: false });
  P('bloatSplit2', slab(0.5, 0.06, 0.1), { y: 0.16, mat: e.eyeMat, shadow: false });
  // Two small wings, high and swept back. Short on purpose - the outline has
  // to be sack first and wings second.
  P('bloatWing', slab(0.44, 0.05, 0.2), { x: -0.42, y: 1.02, z: 0.1, rz: 0.35, ry: 0.4 });
  P('bloatWing', slab(0.44, 0.05, 0.2), { x: 0.42, y: 1.02, z: 0.1, rz: -0.35, ry: -0.4 });
  // A small head pushed out in front of the sack, and three stubby legs
  // trailing under it.
  P('bloatHead', prism(0.14, 0.18, 0.2, 5), { y: 0.86, z: -0.34, rx: -0.5 });
  for (let i = 0; i < 3; i++) {
    P('bloatLeg', slab(0.05, 0.32, 0.05), {
      x: -0.2 + i * 0.2, y: 0.02, z: 0.16, rx: 0.3,
    });
  }
  eyes(P, { y: 0.9, x: 0.1, z: -0.46, r: 0.7, mat: e.eyeMat });
}

// ---- SOLAR -----------------------------------------------------------------
// The theme's language: A NARROW CORE CARRYING ONE BIG FLAT PANEL. A mask, a
// shield, a lens, a ring - always a single broad plate held clear of a thin
// body, and always the widest thing in the outline. Where PLAGUE is splitting
// and BRINE hangs, SOLAR is a thing HOLDING A MIRROR UP.

// A thin runner behind a flat disc of a mask. Almost no body at all: it is a
// mask with legs, which is exactly what should be arriving at speed.
function buildZealot(e, g, s) {
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
function buildAegis(e, g, s) {
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
function buildLens(e, g, s) {
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
function buildHalo(e, g, s) {
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

// How long the chest core stays shut and how long it stays open, in seconds.
// The old travelling plate gave a player who kept repositioning roughly half
// the fight at full damage, and this is tuned to land in the same place: the
// boss's health bar falls at the pace it always did, but the player is reading
// a rhythm instead of chasing a panel around a body they cannot see behind.
const COLOSSUS_VENT_SHUT = 3.4;
const COLOSSUS_VENT_OPEN = 2.6;
// Shutter travel, in UNIT model space: where each leaf sits closed, and how
// far out it slides. Closed at 0.26 the two leaves overlap over the core's
// centre line and cover its full 0.85 width with no seam.
const COLOSSUS_SHUT_X = 0.26;
const COLOSSUS_SHUT_TRAVEL = 0.46;
// Core brightness, shut and open. The shut value is deliberately not zero - a
// dark core would read as damage or as a hole rather than as something waiting
// to open. The open value is deliberately NOT higher: the renderer tone maps
// with ACES, which desaturates anything it has to clip, and at 2.2 the core
// came out a pale salmon against the boss's own amber room. Held at 1.2 it
// stays unmistakably RED, which is the entire point of the colour.
const COLOSSUS_CORE_SHUT = 0.22;
const COLOSSUS_CORE_OPEN = 1.2;
// VENT FIRE. The open core used to be free damage: the player learned the
// rhythm, walked in on the beat and unloaded, and the fight had nothing to say
// about it. It now fires while it is open, so the window that lets you hurt it
// is the window it can hurt you and standing still in front of the chest stops
// being the answer. Three rounds in a narrow fan, on a cadence slower than the
// window is long, so an opening is two or three volleys and never a stream.
const COLOSSUS_VENT_SHOT_CD = 0.65;
const COLOSSUS_VENT_FAN = 0.13;

// The widest thing in the game, on two thick legs, with a shuttered core in
// its chest.
// The third airframe, and the odd one out. Harrier and shrike are both hard -
// a plate and a spear - so this one is CLOTH: a narrow body under a wide,
// ragged veil, with no straight edge anywhere on it. Against the sky the other
// two are machines and this is a rag, which is the whole tell.
function buildShade(e, g, s) {
  const P = partsFor(e, g, s);
  P('shadeBody', prism(0.1, 0.2, 0.56, 5), { y: 1.0, rx: -Math.PI / 2, sz: 0.8 });
  P('shadeHead', shard(0.15), { y: 1.02, z: -0.3, sz: 1.2 });
  // THE VEIL. Three panels a side, each a thin plate at its own angle, so the
  // outline is torn rather than swept. Transparent, and the only thing in the
  // air that is.
  for (const dir of [-1, 1]) {
    P('shadeVeil', slab(0.66, 0.03, 0.3), {
      x: dir * 0.4, y: 1.06, z: 0.02, rz: dir * 0.22, ry: dir * 0.3,
      mat: SHARED_MATS.shadeVeil, shadow: false,
    });
    P('shadeVeil', slab(0.44, 0.03, 0.22), {
      x: dir * 0.62, y: 0.96, z: 0.26, rz: dir * -0.35, ry: dir * 0.6,
      mat: SHARED_MATS.shadeVeil, shadow: false,
    });
    P('shadeTail', slab(0.1, 0.03, 0.5), {
      x: dir * 0.16, y: 0.9, z: 0.46, rx: dir * 0.12, ry: dir * 0.18,
      mat: SHARED_MATS.shadeVeil, shadow: false,
    });
  }
  // The lit underside every flier wears, so it is read as airborne from the
  // floor. A narrow strip, like the shrike's.
  P('shadeGlow', slab(0.1, 0.05, 0.44), {
    y: 0.86, mat: SHARED_MATS.harrierGlow, shadow: false,
  });
  eyes(P, { y: 1.04, x: 0.08, z: -0.36, r: 1.1, mat: e.eyeMat });
}

// A squat bolted-down box with one barrel. It must not read as anything else
// in the roster: nothing else in the game is a machine sitting on the floor,
// and the silhouette is low and wide on purpose so a live one is obvious from
// across the arena and a dead one leaves nothing to trip over.
// A spike of ice driven into the floor. It has to read as SCENERY THAT MATTERS
// from across the arena - the player is looking for three of these in a room
// that is actively freezing - so it is tall, bright, and shaped like nothing
// else in the game.
function buildAnchor(e, g, s) {
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

function buildTurret(e, g, s) {
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

function buildColossus(e, g, s) {
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

// Legless: a wide braced platform with a barrel angled at the sky. Read: it is
// not chasing you, it is ranging on you.
// EMBER's boss: a furnace that walks. The theme's own language at boss scale -
// stacked rock masses, crusted caps, vents in the gaps - with the one thing no
// ordinary EMBER enemy has, a chest that OPENS. Read: it is a building, and
// there is a fire inside it.
function buildForge(e, g, s) {
  const P = partsFor(e, g, s);
  // A wide planted base. Everything about the lower half says it will not be
  // moved; everything about the upper half says there is pressure in it.
  P('forgeBase', prism(0.62, 0.8, 0.5, 6), { y: 0.28 });
  P('forgeHaunch', rock(0.5), { x: -0.42, y: 0.5, sy: 0.8 });
  P('forgeHaunch2', rock(0.5), { x: 0.42, y: 0.5, sy: 0.8, ry: 1.1 });
  // The body: a drum, banded, with the chest cavity cut into the front of it.
  P('forgeDrum', prism(0.62, 0.66, 0.86, 6), { y: 1.12 });
  P('forgeBand', prism(0.7, 0.7, 0.1, 6), { y: 1.42, mat: SHARED_MATS.magmaCrust });

  // THE CHEST, and the whole fight. Two crusted doors that draw apart when it
  // vents, with the furnace behind them. Held on the enemy so aiForge can
  // slide them - the same trick Colossus's shutters use, and the same reason:
  // the player has to be able to SEE the window, not infer it from the
  // damage numbers.
  //
  // DEPTH MATTERS HERE MORE THAN ANYWHERE ELSE ON THE MODEL. The first pass
  // put a 0.42 core at z -0.3 behind doors at z -0.46, and an octahedron that
  // size reaches further forward than the doors did - so the furnace poked out
  // THROUGH its own shutters and the chest read as a dark dent whether it was
  // open or shut. The core is smaller and set back into the drum now, and the
  // doors sit proud of its front face, so the only way to see the fire is for
  // them to actually move.
  e.forgeCore = P('forgeCore', shard(0.3), {
    y: 1.16, z: -0.34, mat: SHARED_MATS.magmaVent, shadow: false,
  });
  const doorGeo = slab(0.36, 0.76, 0.14);
  e.doorL = P('forgeDoor', doorGeo, { x: -0.19, y: 1.16, z: -0.64, mat: SHARED_MATS.magmaCrust });
  e.doorR = P('forgeDoor', doorGeo, { x: 0.19, y: 1.16, z: -0.64, mat: SHARED_MATS.magmaCrust });

  // FOUR STACKS off the shoulders, swept back and uneven. They are what makes
  // the silhouette unmistakable at range and from behind - a boss the player
  // has to be able to find in a room its own adds are filling.
  const stackGeo = prism(0.12, 0.2, 0.9, 5);
  P('forgeStack', stackGeo, { x: -0.5, y: 1.95, z: 0.22, rx: 0.28, rz: 0.2 });
  P('forgeStack', stackGeo, { x: 0.5, y: 1.95, z: 0.22, rx: 0.28, rz: -0.2, s: 0.88 });
  P('forgeStack', stackGeo, { x: -0.22, y: 2.05, z: 0.36, rx: 0.4, s: 0.76 });
  P('forgeStack', stackGeo, { x: 0.26, y: 2.0, z: 0.36, rx: 0.4, s: 0.68 });
  // Vent shards in every seam. On the shared magma material, so a Forge and a
  // magma glow with the same fire.
  const ventGeo = shard(0.16);
  P('forgeVent', ventGeo, { x: -0.6, y: 1.2, mat: SHARED_MATS.magmaVent, shadow: false });
  P('forgeVent', ventGeo, { x: 0.6, y: 1.2, mat: SHARED_MATS.magmaVent, shadow: false });
  P('forgeVent', ventGeo, { y: 1.5, z: 0.5, mat: SHARED_MATS.magmaVent, shadow: false });

  // A low head sunk between the shoulders - it is a furnace first and a
  // creature second, so the head must not be the thing you read.
  P('forgeHead', rock(0.26), { y: 1.72, z: -0.24, sy: 0.8 });
  P('forgeBrow', spike(0.24, 0.3, 5), { y: 1.94, z: -0.2, rx: -0.5, mat: SHARED_MATS.magmaCrust });
  // Arms: heavy, long, and ending in blunt masses. It swings these.
  P('forgeArm', slab(0.24, 0.8, 0.24), { x: -0.74, y: 1.1, rz: 0.24 });
  P('forgeArm', slab(0.24, 0.8, 0.24), { x: 0.74, y: 1.1, rz: -0.24 });
  P('forgeFist', rock(0.3), { x: -0.86, y: 0.62 });
  P('forgeFist', rock(0.3), { x: 0.86, y: 0.62 });
  P('forgeFoot', rock(0.3), { x: -0.34, y: 0.14, z: -0.12 });
  P('forgeFoot', rock(0.3), { x: 0.34, y: 0.14, z: -0.12 });
  eyes(P, { y: 1.76, x: 0.14, z: -0.42, r: 1.5, mat: e.eyeMat });
}

// RIME's boss: the theme's crust language at boss scale, plus the one thing no
// ordinary RIME enemy has - a shell that closes over the WHOLE body. Held on
// the enemy so aiPaleCrown can raise and drop it, the same way the Forge's
// shutters are held.
function buildPaleCrown(e, g, s) {
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

// VERDANT's boss: a tree that has taken the room. The heartwood's language at
// boss scale - root ball, tapering trunk, layered canopy - with the one thing
// no ordinary VERDANT enemy has, a canopy that OPENS.
//
// It never moves, so unlike every other boss it is not read by its motion and
// has to be unmistakable standing still. That is what the canopy is for: it is
// most of the silhouette, and the fight's only state change is written on it.
function buildOvergrowth(e, g, s) {
  const P = partsFor(e, g, s);
  // A vast root ball spread across the floor. Wide and low, so it reads as
  // something that grew here rather than something that walked in.
  P('ogRoots', lump(0.9), { y: 0.26, sy: 0.42 });
  const rootGeo = spike(0.16, 0.9, 4);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    P('ogRoot', rootGeo, {
      x: Math.cos(a) * 0.72, y: 0.18, z: Math.sin(a) * 0.72,
      rz: Math.cos(a) * -1.45, rx: Math.sin(a) * 1.45,
    });
  }
  // The trunk: split, so the core sits in a visible cleft rather than behind
  // bark. The player has to be able to see what they are shooting at.
  P('ogTrunkL', prism(0.24, 0.42, 1.5, 5), { x: -0.2, y: 1.0, rz: 0.07 });
  P('ogTrunkR', prism(0.24, 0.42, 1.5, 5), { x: 0.2, y: 1.0, rz: -0.07 });

  // THE CORE, in the cleft. Held on the enemy: it swells when the canopy
  // opens, so the window is legible on the body and not only in the numbers.
  e.ogCore = P('ogCore', shard(0.34), {
    y: 1.2, z: -0.2, mat: SHARED_MATS.blightSac, shadow: false,
  });

  // THE CANOPY, and the fight. Four heavy caps that draw APART and lift when
  // the player comes inside the window - held on the enemy so aiOvergrowth can
  // slide them, the way the Forge's shutters are.
  e.canopy = [];
  const capGeo = lump(0.62);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    e.canopy.push(P('ogCanopy', capGeo, {
      x: Math.cos(a) * 0.42, y: 2.05, z: Math.sin(a) * 0.42, sy: 0.5, ry: a,
    }));
  }
  // Fronds hanging off the canopy's edge, long and drooping. They are what
  // makes the top read as foliage rather than as four boulders.
  const frondGeo = spike(0.09, 0.9, 4);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.2;
    P('ogFrond', frondGeo, {
      x: Math.cos(a) * 0.86, y: 1.72, z: Math.sin(a) * 0.86,
      rz: Math.cos(a) * -0.5, rx: Math.sin(a) * 0.5,
    });
  }
  // Two heavy boughs it swings with, low and reaching.
  P('ogBough', slab(0.26, 1.0, 0.26), { x: -0.78, y: 1.1, rz: 0.5 });
  P('ogBough', slab(0.26, 1.0, 0.26), { x: 0.78, y: 1.1, rz: -0.5 });
  eyes(P, { y: 1.5, x: 0.15, z: -0.4, r: 1.5, mat: e.eyeMat });
}

function buildSiege(e, g, s) {
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
  // from across the arena.
  P('siegeBarrel', prism(0.13, 0.19, 1.2, 8), {
    y: 1.18, z: -0.42, rx: -Math.PI / 3, mat: SHARED_MATS.sniperBarrel,
  });
  eyes(P, { y: 1.0, x: 0.16, z: -0.3, r: 1.1, mat: e.eyeMat });
}

// Two crystals side by side with a lit gap between them. The whole model is
// the mechanic: it is already two, and it is going to be four.
function buildSchism(e, g, s) {
  const P = partsFor(e, g, s);
  // Held far enough apart that the gap survives a three-quarter view - at
  // +/-0.24 the two halves overlapped into one diamond and the whole read of
  // the fight was lost.
  P('schismHalf', shard(0.42), { x: -0.38, y: 1.05, sy: 1.2, sz: 0.85 });
  P('schismHalf', shard(0.42), { x: 0.38, y: 1.05, sy: 1.2, sz: 0.85 });
  P('schismKeel', spike(0.36, 0.62, 6), { y: 0.36, rx: Math.PI });
  const a = P('schismCore', shard(0.3), { y: 1.02, mat: e.bodyMat, shadow: false });
  const b = P('schismGlow', shard(0.22), {
    y: 1.02, mat: SHARED_MATS.splitterCore, shadow: false,
  });
  e.coreMesh = a;
  e.ringMesh = b;
  eyes(P, { y: 1.3, x: 0.24, z: -0.24, r: 1.2, mat: e.eyeMat });
}

// A funnel: wide open at the top, narrowing to nothing at the floor. Nothing
// else in the game is wider at the top, and that is the whole read - it is a
// mouth, and it is pulling.
function buildMaw(e, g, s) {
  const P = partsFor(e, g, s);
  P('mawFunnel', prism(0.78, 0.18, 1.05, 8), { y: 0.62 });
  P('mawStem', prism(0.18, 0.3, 0.2, 6), { y: 0.1 });
  // Teeth around the rim, pointing inward and down into the throat.
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    P('mawTooth', spike(0.09, 0.34, 4), {
      x: Math.cos(ang) * 0.66, y: 1.0, z: Math.sin(ang) * 0.66,
      rx: Math.PI - Math.sin(ang) * 0.4, rz: Math.cos(ang) * 0.4,
    });
  }
  P('mawVoid', shard(0.44), { y: 0.95, mat: SHARED_MATS.sniperScope, shadow: false });
  const maw = new THREE.Mesh(
    geo('mawRing', () => new THREE.TorusGeometry(0.8, 0.13, 8, 16)),
    SHARED_MATS.conduitRing
  );
  maw.rotation.x = Math.PI / 2;
  maw.position.y = 1.14 * s;
  maw.scale.setScalar(s);
  e.ringA = maw;
  g.add(maw);
}

// Tall, robed and crowned - the only thing in the roster with a skirt, and the
// tallest silhouette in the game. Read: this is the last one.
function buildHerald(e, g, s) {
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

// THE CONDUCTOR. The theme's fork, grown to the size of a boss and held over
// its own head - two enormous prongs sweeping up and out with the core slung
// between them, and arms spread as though it were holding the room open.
//
// The crown is the tell for the whole fight: it BRIGHTENS on every bar, so
// the count the player has to keep is written on the boss rather than only in
// the music.
function buildConductor(e, g, s) {
  const P = partsFor(e, g, s);
  // The prongs. They carry most of the height, and they are the reason this
  // reads as a conductor rather than as another armoured torso.
  P('condProng', spike(0.16, 1.5, 4), { x: -0.5, y: 2.5, rz: 0.34 });
  P('condProng', spike(0.16, 1.5, 4), { x: 0.5, y: 2.5, rz: -0.34 });
  // THE CROWN CORE, between their roots. Held on the enemy: aiConductor grows
  // and brightens it once per bar, so a player watching the boss and a player
  // listening to the track are counting the same four.
  e.condCore = P('condCore', shard(0.32), { y: 2.32, mat: e.eyeMat, shadow: false });
  // A yoke joining the prongs, so the crown is one object.
  P('condYoke', slab(0.96, 0.16, 0.2), { y: 1.98 });
  // A tall narrow torso - it is a conductor, not a siege engine, and it should
  // look like it could be knocked over even though it cannot.
  P('condTorso', prism(0.36, 0.5, 1.1, 6), { y: 1.28 });
  P('condCollar', prism(0.4, 0.32, 0.2, 6), { y: 1.88 });
  P('condHead', slab(0.3, 0.28, 0.28), { y: 1.72, z: -0.2 });
  // ARMS OUT, and held there. The pose is the whole character: it is not
  // reaching for the player, it is holding the arena.
  P('condArm', slab(0.12, 0.12, 0.9), { x: -0.66, y: 1.62, rz: 0.3, ry: 1.2 });
  P('condArm', slab(0.12, 0.12, 0.9), { x: 0.66, y: 1.62, rz: -0.3, ry: -1.2 });
  P('condHand', shard(0.2), { x: -1.06, y: 1.44 });
  P('condHand', shard(0.2), { x: 1.06, y: 1.44 });
  // Three rings around the waist, spaced - the same stacked-plate motif the
  // capacitor is built from, at boss scale.
  const ring = prism(0.56, 0.56, 0.08, 6);
  P('condRing', ring, { y: 0.94 });
  P('condRing', ring, { y: 0.7 });
  P('condRing', ring, { y: 0.46 });
  // Heavy feet, set wide. It walks, and it must not look like it floats.
  P('condLeg', slab(0.26, 0.44, 0.3), { x: -0.34, y: 0.22 });
  P('condLeg', slab(0.26, 0.44, 0.3), { x: 0.34, y: 0.22 });
  eyes(P, { y: 1.76, x: 0.14, z: -0.34, r: 1.1, mat: e.eyeMat });
}

// THE DROWNED CHOIR. One body, built three times.
//
// A robed column with a wide open MAW in its chest where a voice would come
// out of, plated across the shoulders like a shell that does not fit, and a
// veil hanging to the floor so it never looks like it has feet. The maw is
// the singing tell: it opens and brightens on the body whose turn it is, and
// that is the whole targeting information the fight gives.
function buildChoir(e, g, s) {
  const P = partsFor(e, g, s);
  // The column. Narrow at the top and flaring to the floor - a robe.
  P('choirRobe', prism(0.42, 0.86, 1.7, 6), { y: 0.86 });
  // THE MAW, and it is a hole rather than a face: two heavy jaw plates with
  // the bright throat between them, set in the CHEST rather than in the head,
  // so the thing the player is aiming at is the widest part of the body.
  P('choirJaw', slab(0.5, 0.14, 0.2), { y: 1.34, z: -0.34, rz: 0.06 });
  P('choirJaw', slab(0.5, 0.14, 0.2), { y: 0.96, z: -0.34, rz: -0.06 });
  e.choirMaw = P('choirMaw', shard(0.26), {
    y: 1.15, z: -0.36, mat: e.eyeMat, shadow: false,
  });
  // Shoulder shell, oversized and crusted, and it does not meet in the middle
  // - the theme's rule at boss scale.
  P('choirShell', prism(0.24, 0.44, 0.34, 6), { x: -0.6, y: 1.72, rz: 0.5 });
  P('choirShell', prism(0.24, 0.44, 0.34, 6), { x: 0.6, y: 1.72, rz: -0.5 });
  // A small hooded head, deliberately dwarfed by the maw below it.
  P('choirHood', prism(0.18, 0.3, 0.42, 6), { y: 2.02 });
  P('choirCrest', spike(0.16, 0.5, 5), { y: 2.4 });
  // Long thin arms hanging straight down, and a veil of fronds round the hem.
  P('choirArm', slab(0.11, 0.9, 0.11), { x: -0.62, y: 1.1, rz: 0.12 });
  P('choirArm', slab(0.11, 0.9, 0.11), { x: 0.62, y: 1.1, rz: -0.12 });
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2;
    P('choirVeil', slab(0.1, 0.5, 0.1), {
      x: Math.cos(ang) * 0.72, y: 0.24, z: Math.sin(ang) * 0.72,
      rz: Math.cos(ang) * 0.2, rx: Math.sin(ang) * -0.2,
    });
  }
  eyes(P, { y: 2.02, x: 0.12, z: -0.26, r: 1.0, mat: e.eyeMat });
}

// ---- AI ------------------------------------------------------------------
// An `ai(e, a)` reads the frame off `a` and writes the enemy's desired
// velocity back into `a.vx / a.vz`. Everything after that - crowd separation,
// the speed clamp, obstacles - is common and stays in update().
//
// `a` is ONE object reused for every enemy every frame (see _a below). An ai
// must not hold on to it.
//
//   a.dt    seconds
//   a.ctx   the shared enemy context from main.js
//   a.dist  metres to the player on the XZ plane
//   a.nx/nz unit vector straight at the player - what to AIM and ATTACK along
//   a.px/pz unit walking heading from the nav grid - what to WALK along
//   a.sp    this enemy's speed after freeze and slow

// EVERY CONTACT HIT GOES THROUGH HERE. It deals the damage and then applies
// whatever the type leaves on the player - `hitStatus` on the type block, or
// nothing at all, which is what fourteen of the twenty-one types say.
//
// It exists so that "this enemy's touch burns you" is one line on the type
// rather than a branch inside _meleeCycle, and so a new afflictor cannot be
// written that forgets to apply its own status on one of the two paths a
// melee blow can take (contact and swing).
function landHit(e, ctx, dmg = e.damage) {
  ctx.onHitPlayer(dmg, e.pos, e);
  const st = ENEMY_TYPES[e.type].hitStatus;
  if (st && ctx.applyPlayerStatus) ctx.applyPlayerStatus(st.kind, st.dur);
  // LIT BY A BELLOWS. Not a property of the type - a property of the moment,
  // refreshed by whatever bellows is currently reaching this enemy and gone a
  // quarter of a second after it stops. A cinder that is ALSO lit does not
  // stack: applyStatus refreshes rather than adding, so the player burns for
  // the longer of the two clocks at one rate.
  if (e.igniteT > 0 && ctx.applyPlayerStatus) {
    ctx.applyPlayerStatus('fire', BELLOWS_BURN);
  }
}

// The two melee types differ only in their windup numbers, which live on the
// type as `melee`.
function aiMelee(e, a) {
  const m = ENEMY_TYPES[e.type].melee;
  if (e._meleeCycle(a.dt, a.dist, a.ctx, m.windup, m.start, m.hit, m.cd)) {
    a.vx = a.px * a.sp;
    a.vz = a.pz * a.sp;
  }
}

// Hold a preferred distance and circle. `out`/`in` are how hard to close or
// back off outside the band; `strafe` is how much sideways drift rides on top.
// The strafe direction flips on its own timer so a line of shooters does not
// orbit in lockstep.
function orbit(e, a, o) {
  e.strafeT -= a.dt;
  if (e.strafeT <= 0) {
    e.strafe *= -1;
    e.strafeT = o.flip + Math.random() * o.flipVar;
  }
  const along = a.dist > o.dist + o.band ? o.out : a.dist < o.dist - o.band ? o.in : 0;
  a.vx = a.px * a.sp * along + -a.pz * e.strafe * a.sp * o.strafe;
  a.vz = a.pz * a.sp * along + a.px * e.strafe * a.sp * o.strafe;
}

function aiSplitter(e, a) {
  aiMelee(e, a);
  e.coreMesh.rotation.y += a.dt * 3;
  e.ringMesh.rotation.z += a.dt * 2;
}

function aiShooter(e, a) {
  orbit(e, a, ENEMY_TYPES.shooter.orbit);
  if (e.attackCd <= 0 && a.dist < 18) {
    e.attackCd = 1.6 + Math.random() * 0.6;
    e.flash = 0.12;
    a.ctx.addProjectile(e.pos.x, 0.95, e.pos.z, 'shooter', e._projScale());
  }
}

function aiSniper(e, a) {
  orbit(e, a, ENEMY_TYPES.sniper.orbit);
  if (e.attackCd <= 0 && a.dist < 35) {
    e.attackCd = 2.0 + Math.random() * 0.5;
    e.flash = 0.1;
    a.ctx.addProjectile(e.pos.x, 1.1, e.pos.z, 'sniper', e._projScale());
  }
}

function aiBomber(e, a) {
  orbit(e, a, ENEMY_TYPES.bomber.orbit);
  if (e.attackCd <= 0 && a.dist < 16) {
    e.attackCd = 2.5 + Math.random() * 0.8;
    e.flash = 0.15;
    a.ctx.addGrenade(e.pos.x, 1.2, e.pos.z, e.damage);
  }
}

// Blink flanker. It closes the way anything else does, but every few seconds
// it jumps to the space BEHIND the player, which is the whole point of the
// type - a player watching the crowd in front never sees it arrive.
// THE BLINK IS AN ANIMATION NOW, not a cut.
//
// It used to be one frame: a burst where the wraith was, a burst where it
// landed, and the model already standing there. Both halves were over inside
// a sixth of a second and neither of them read - the enemy was simply
// somewhere else, and a player who lost track of it learned nothing about why.
// Three things fix that, and all three are needed:
//
//   IT LEAVES. A wind-up it can be seen to start (WRAITH_WARP): the body
//   squashes down into its own footprint, spinning up as it goes, over a ring
//   on the floor. That is the frame the player has to notice.
//   IT TRAVELS. A beam is drawn from where it left to where it lands for the
//   whole arrival, so the two ends are one move rather than two events.
//   IT ARRIVES. It unfolds back to full size (WRAITH_FORM) instead of popping
//   in - a body growing out of the floor behind you is visible in peripheral
//   vision in a way an instant appearance is not.
//
// It is HELPLESS for the whole of both: no swing, no contact damage, and the
// arrival is deliberately the longer half, because that is the moment the
// player is meant to get a shot off if they read it.
const WRAITH_WARP = 0.3;
const WRAITH_FORM = 0.34;
// How flat it is squashed at the end of the wind-up, and how small it starts
// on arrival. Not zero: a model scaled to nothing is a model that vanished,
// which is the thing being fixed.
const WRAITH_MIN_SCALE = 0.12;

// Squash and spin, shared by both halves. `k` runs 1 (whole) to 0 (gone).
function _wraithForm(e, k) {
  const base = e.blinkScale;
  const w = WRAITH_MIN_SCALE + (1 - WRAITH_MIN_SCALE) * k;
  // Widening as it flattens: a body collapsing into a disc, rather than one
  // shrinking evenly, which just reads as walking away from the camera.
  e.group.scale.set(base * (2 - w) * 0.85, base * w, base * (2 - w) * 0.85);
  // Tipped over as it collapses, so the squash has a direction to it. It goes
  // on rotation.x DELIBERATELY: update() overwrites rotation.y with the facing
  // yaw every frame and writes rotation.z for the dance, and x is the one axis
  // nothing else in this file touches - see the note on rotation.order.
  e.group.rotation.x = (1 - k) * 1.3 * e.blinkSpin;
}

function _wraithEnd(e) {
  e.blinkState = '';
  e.blinkT = 0;
  e.group.scale.setScalar(e.blinkScale);
  e.group.rotation.x = 0;
  e._setEyeAlert(false);
}

function aiWraith(e, a) {
  const ctx = a.ctx;
  // The base scale is read the first time it is needed rather than at
  // construction: a wraith is never resized today, but _splitInto is proof
  // that group.scale is not always 1 and this must not fight whoever set it.
  if (e.blinkScale === undefined) e.blinkScale = e.group.scale.x || 1;

  // ---- leaving. Rooted, and not attacking: the melee cycle is skipped
  // entirely, so a wraith cannot swing out of a blink it has committed to.
  if (e.blinkState === 'warp') {
    e.blinkT -= a.dt;
    e._setEyeAlert(true);
    _wraithForm(e, Math.max(0, e.blinkT / WRAITH_WARP));
    if (e.blinkT > 0) return;
    _blinkAt.set(e.pos.x, 0.9, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.wraith.eye, 18, 6, 2.5, 0.45);
    _blinkAt.set(e.pos.x, 0.05, e.pos.z);
    ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.wraith.color, 2.2, 0.35);
    // Where it left from, kept for the beam that draws the move.
    e.blinkFromX = e.pos.x;
    e.blinkFromZ = e.pos.z;
    e.pos.x = e.blinkToX;
    e.pos.z = e.blinkToZ;
    resolveCircle(e.pos, e.radius, ctx.obstacles, e.collideH);
    e.blinkState = 'form';
    e.blinkT = WRAITH_FORM;
    _blinkAt.set(e.pos.x, 0.9, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.wraith.eye, 22, 6, 2.5, 0.5);
    _blinkAt.set(e.pos.x, 0.05, e.pos.z);
    ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.wraith.color, 2.6, 0.4);
    return;
  }

  // ---- arriving. Unfolds, still helpless, with the line of the move drawn
  // behind it - redrawn every frame, because beams last exactly one.
  if (e.blinkState === 'form') {
    e.blinkT -= a.dt;
    const k = 1 - Math.max(0, e.blinkT / WRAITH_FORM);
    _wraithForm(e, k);
    _blinkFrom.set(e.blinkFromX, 0, e.blinkFromZ);
    _blinkAt.set(e.pos.x, 0, e.pos.z);
    ctx.effects.beam(_blinkFrom, _blinkAt, ENEMY_TYPES.wraith.eye);
    if (e.blinkT <= 0) _wraithEnd(e);
    return;
  }

  aiMelee(e, a);
  e.blinkCd -= a.dt;
  // Only from the middle distance. Blinking while already in melee would just
  // teleport it out of its own swing, and from across the arena it reads as
  // the enemy cheating rather than flanking.
  if (e.blinkCd > 0 || a.dist < 6 || a.dist > 20) return;
  // Nor out of a swing it has already started - the same rule the bosses hold.
  if (e.windup > 0 || e.swing > 0) return;
  e.blinkCd = 2.6 + Math.random() * 1.4;

  const p = ctx.player;
  const f = p.forwardInto(_blinkFwd);
  // Behind the player first; if that lands in a wall or a crate, in front of
  // them instead, which still puts it somewhere they were not looking at.
  let tx = p.pos.x - f.x * 2.5;
  let tz = p.pos.z - f.z * 2.5;
  _blinkAt.set(tx, 0.5, tz);
  const B = 21.6 - (e.radius - 0.5);
  if (Math.abs(tx) > B || Math.abs(tz) > B || pointInObstacle(_blinkAt, ctx.obstacles)) {
    tx = p.pos.x + f.x * 3;
    tz = p.pos.z + f.z * 3;
    _blinkAt.set(tx, 0.5, tz);
    if (Math.abs(tx) > B || Math.abs(tz) > B || pointInObstacle(_blinkAt, ctx.obstacles)) return;
  }

  // The destination is fixed HERE, at the start of the wind-up, and not
  // recomputed when the warp ends: the player gets the length of the wind-up
  // to move away from where it is going, which is the counter-play the instant
  // version never had.
  e.blinkToX = tx;
  e.blinkToZ = tz;
  e.blinkSpin = Math.random() < 0.5 ? -1 : 1;
  e.blinkState = 'warp';
  e.blinkT = WRAITH_WARP;
  e.windup = 0;
  e.swing = 0;
  _blinkAt.set(e.pos.x, 0.05, e.pos.z);
  ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.wraith.eye, 1.8, 0.3);
}

// No attack of its own - it keeps its distance and makes everything near it
// harder to kill. The links are not decoration: they are the only way the
// player can tell which enemies are being buffed and therefore why the crowd
// suddenly stopped dying.
// ---- STRATA ----------------------------------------------------------------

// Winds up, curls, and rolls - and where it goes after the first wall is not
// aimed at anybody. Three bounces, so a scree let loose in an open room is
// crossing it for a good while afterwards.
function aiScree(e, a) {
  if (!e.sc) e.sc = { state: 'walk', t: 0, hx: 0, hz: 1, left: 0 };
  const sc = e.sc;
  sc.t -= a.dt;

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
    // Rolls visibly, about the axis across its own heading.
    e.group.rotation.x -= a.dt * 7;

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
      e.group.rotation.x = 0;
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
function aiSlinger(e, a) {
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
function aiGeode(e, a) {
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
function aiGargoyle(e, a) {
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

const _plagueAt = new THREE.Vector3();

// The bloatfly's burst, and how long the gas over it lasts. Wider and shorter
// than a husk's: a husk bursts where the player chose to stand and this one
// bursts where they used to, so it has to cover more ground for less time.
const BLOAT_CLOUD_R = 3.6;
const BLOAT_CLOUD_LIFE = 5.5;

const LESION_RANGE = 18;
const LESION_CD = 2.6;
const LESION_BURST = 3;
const LESION_GAP = 0.13;
const LESION_SPREAD = 0.075;

// Fires a short burst and gets nothing else. Everything that makes it matter
// is in the ROUND - see the `leave` row on its proj block, and the branch in
// _updateProjectiles that reads it - which is correct twice over: the enemy is
// a delivery system for a puddle, and a lesion that also manoeuvred cleverly
// would be paying twice for one idea.
function aiLesion(e, a) {
  orbit(e, a, ENEMY_TYPES.lesion.orbit);
  if (e.lesN > 0) {
    e.lesT -= a.dt;
    if (e.lesT > 0) return;
    e.lesT = LESION_GAP;
    e.lesN--;
    // SPREAD, and it is the mechanic rather than a handicap: three rounds on
    // exactly the same line would leave one puddle, and what this enemy is
    // for is writing a WIDTH of bad floor across wherever the player went.
    a.ctx.addProjectile(
      e.pos.x, 1.1, e.pos.z, 'lesion', e._projScale(),
      (e.lesN - 1) * LESION_SPREAD
    );
    if (e.lesN <= 0) e._setEyeAlert(false);
    return;
  }
  if (e.attackCd > 0 || a.dist > LESION_RANGE) return;
  e.attackCd = LESION_CD + Math.random() * 0.7;
  e.lesN = LESION_BURST;
  e.lesT = 0;
  e.flash = 0.12;
  e._setEyeAlert(true);
  if (e.lesCore) e.lesCore.scale.setScalar(1.5 * e.scale);
}

// How far it reaches, how long between raisings, and what a raised body comes
// back with. The fraction is low and the cooldown is long: a carrion is meant
// to make clearing the room feel wrong, not to double the wave.
const CARRION_RANGE = 11;
const CARRION_CD = 6.0;
const CARRION_HP = 0.4;
// What it will raise. Bosses and the inert helper types are excluded for the
// conduit's reason - an extra boss nobody can see the source of - and so is
// anything already raised once, which is what `revenant` is for.
const CARRION_SKIP = new Set(['carrion', 'anchor', 'pylon', 'turret']);

function aiCarrion(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.carrion.orbit);
  e.carCd = (e.carCd || 0) - a.dt;
  // The hooks lift as it charges, so a carrion about to raise something is
  // visibly about to.
  const ready = e.carCd <= 0;
  e._setEyeAlert(ready);

  // WHAT DIED NEARBY THIS FRAME. Read off the enemy list rather than hooked
  // into the kill path, because the kill path is main.js's sweep and a support
  // enemy has no business being wired into it - `dead` is set before that
  // sweep runs and cleared by nothing, so one pass here sees every body on the
  // frame it falls and never sees it twice.
  if (!ready) return;
  for (const o of ctx.enemies) {
    if (!o.dead || o.boss || o.revenant || o.raised) continue;
    if (CARRION_SKIP.has(o.type)) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > CARRION_RANGE * CARRION_RANGE) continue;
    // Marked on the CORPSE, so two carrions cannot raise the same body twice
    // and so a body that has already been through this cannot come back again.
    o.raised = true;
    e.carCd = CARRION_CD;
    if (ctx.reanimate) ctx.reanimate(o.pos.x, o.pos.z, o.type, CARRION_HP);
    if (ctx.effects) {
      _plagueAt.set(o.pos.x, 0.9, o.pos.z);
      ctx.effects.beam(e.pos, _plagueAt, 0xcc3d8a);
      ctx.effects.shockwave(_plagueAt, 0xcc3d8a, 2.4, 0.4);
      ctx.effects.burst(_plagueAt, 0xffb0e8, 22, 5, 2, 0.6);
    }
    if (ctx.sfx) ctx.sfx.impact();
    break;
  }
}

// How close it has to be over them before it commits, and how long the drop
// takes. Slow and obvious: the whole enemy is a thing the player is given time
// to walk out from under.
const BLOAT_DROP_R = 2.6;
const BLOAT_FALL = 5.0;

function aiBloatfly(e, a) {
  const ctx = a.ctx;
  if (e.diving) {
    // COMMITTED, and it does not steer. Same contract the ashwing's run and
    // the thornling's charge are written to: what the player is being asked to
    // read is a piece of ground, and a dive that followed them would not be
    // one.
    a.vx = 0;
    a.vz = 0;
    e.hoverY = 0;
    e.flyRate = BLOAT_FALL;
    // It bursts on landing through the SAME onDeath the gun triggers, so the
    // cloud is identical however it came down and there is only one place the
    // burst is written.
    if (e.pos.y < 0.5) {
      e.dead = true;
      e.value = Math.round(e.value * 0.4);
    }
    return;
  }
  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
  // The sack swells as it comes over. It is the only animation it has, and it
  // is what makes the dive readable a moment before it starts.
  e.group.rotation.z = Math.sin(ctx.time * 2 + e.id) * 0.1;
  if (a.dist > BLOAT_DROP_R || e.pos.y < 1.5) return;
  e.diving = true;
  e.flash = 0.2;
  e._setEyeAlert(true);
  if (ctx.effects) {
    _plagueAt.set(e.pos.x, 0.3, e.pos.z);
    ctx.effects.shockwave(_plagueAt, 0xcc3d8a, BLOAT_CLOUD_R, 0.5);
  }
}

// ---- SOLAR -----------------------------------------------------------------

const _solarAt = new THREE.Vector3();
const _solarTo = new THREE.Vector3();

// How far a zealot's flash reaches and how long it holds at point blank.
// SHORT. A second of white is already at the limit of what can be done to
// somebody without it reading as the game breaking, and the whole enemy is the
// decision about range rather than the length of the punishment.
const ZEALOT_FLASH_R = 6.0;
const ZEALOT_BLIND = 0.9;

// The plate's half-angle, what it costs to break, and what it reflects with.
// A wide arc, because the plate is the front of the enemy and a narrow one
// would make the mechanic a thing the player triggers by accident.
const AEGIS_ARC = Math.cos(0.85);
// HITS, NOT HEALTH. The plate is worn down by the NUMBER of rounds that land
// on it rather than by their damage, which is what keeps the trade the same
// at every point in a run: a rifle magazine breaks it in eight shots at wave
// four and in eight shots at wave forty, and the player's answer is about
// ammunition and patience rather than about how big their numbers have got.
// It also means a shotgun shell breaks the whole plate in one trigger pull -
// and gets one round back for it, which is the trade that makes the shotgun
// the interesting choice against this enemy rather than the wrong one.
const AEGIS_PLATE_HITS = 8;
const _aegisTo = new THREE.Vector3();
const _aegisFrom = new THREE.Vector3();

// Does this hit land on the mirror? Taken as DIRECTIONS FROM THE HITBOX CENTRE
// the way the Bulwark's buckler is, and for the same reason: shots land on the
// hitbox sphere rather than on the visible plate, so a test against the
// plate's own volume would never fire.
function aegisReflect(e, dirX, dirZ, point) {
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

function aiAegis(e, a) {
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
const LENS_RANGE = 26;
const LENS_STEP = 3.4;
const LENS_PATCH_R = 1.5;
// A LONG TAIL, and it is what makes the line a line: each patch has to still
// be burning when the next fifteen have been laid, or what crosses the floor
// is a dot rather than a trail somebody is being walked ahead of.
const LENS_PATCH_LIFE = 2.6;
const LENS_PATCH_DPS = 16;
const LENS_DROP = 0.16;

function aiLens(e, a) {
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
const HALO_RANGE = 9;

function aiHalo(e, a) {
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

const _brineAt = new THREE.Vector3();
const _brineTo = new THREE.Vector3();

// How close it has to get to take hold, how long it rides, what the ride costs
// per second against its bite, and how long before it may try again.
//
// THE RIDE IS SHORT. Four seconds is already a long time to be unable to
// answer something with the gun, and the whole point of the enemy is to make
// the melee button and the dash worth reaching for - not to take the player's
// turn away from them.
const GULP_LATCH_R = 1.6;
const GULP_RIDE = 4.0;
const GULP_DRAIN = 1.6;
const GULP_TICK = 0.5;
const GULP_CD = 3.5;
// Where it sits while it is on: just in front of the player and low, so it is
// at the bottom of the screen rather than inside the camera. A body snapped to
// the player's own position would be invisible from the one place the player
// is looking from, and an enemy draining somebody out of sight is the exact
// thing this game's telegraphs exist to avoid.
const GULP_HANG = 0.62;
const _gulpFwd = new THREE.Vector3();

function aiGulper(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  if (!p) return;

  if (e.latched) {
    a.vx = 0;
    a.vz = 0;
    // Carried, so nothing about the floor or the furniture applies to it. The
    // snap itself is in Enemy.update, after the move and the resolver.
    e.phase = true;
    e.gulpT -= a.dt;
    e.gulpTick -= a.dt;
    if (e.gulpTick <= 0) {
      e.gulpTick = GULP_TICK;
      ctx.onHitPlayer(e.damage * GULP_DRAIN * GULP_TICK, e.pos, e);
      if (ctx.effects) ctx.effects.burst(e.pos, 0x8ff0e0, 8, 3, 2, 0.3);
    }
    // THE TWO INPUTS THAT SHAKE IT OFF, and the clock that does it anyway.
    // Melee and dash both, because either one alone would make an unlucky
    // build - one that had spent its dash, or one mid-reload - into a player
    // with no answer at all.
    const swung = p.meleeActive > 0;
    const dashed = ctx.time < p.dashEnd;
    if (swung || dashed || e.gulpT <= 0) {
      e.latched = false;
      e.attackCd = GULP_CD;
      // Thrown clear in front of the player rather than dropped where it was
      // riding, so the thing that was just on them is somewhere they can shoot.
      p.forwardInto(_gulpFwd);
      e.pos.x = p.pos.x + _gulpFwd.x * 2.4;
      e.pos.z = p.pos.z + _gulpFwd.z * 2.4;
      e.knockT = 0.18;
      e.knockX = _gulpFwd.x * 8;
      e.knockZ = _gulpFwd.z * 8;
      e._setEyeAlert(false);
      if (ctx.effects) {
        _brineAt.set(e.pos.x, 0.8, e.pos.z);
        ctx.effects.burst(_brineAt, 0x8ff0e0, 16, 5, 2, 0.4);
      }
      if (ctx.sfx) ctx.sfx.impact();
    }
    return;
  }

  aiMelee(e, a);
  e.attackCd -= a.dt;
  if (e.attackCd > 0 || a.dist > GULP_LATCH_R) return;
  e.latched = true;
  e.gulpT = GULP_RIDE;
  e.gulpTick = 0;
  e.flash = 0.16;
  e._setEyeAlert(true);
  if (ctx.effects) ctx.effects.shockwave(p.pos, 0x1f8a8a, 2.2, 0.3);
}

const ANGLER_RANGE = 26;
const ANGLER_CD = 2.8;

// Hangs back and throws something the player has to decide about. Everything
// interesting is in the ROUND - see Projectile's homing and the `bubble`
// branch in _firePellet - which is correct: the enemy is a delivery system for
// a target, and a clever angler on top of a clever bubble would be two enemies.
function aiAngler(e, a) {
  orbit(e, a, ENEMY_TYPES.angler.orbit);
  // The lure breathes whether or not it is firing. It is what the player sees
  // of this enemy at seventeen metres, so it must never go dark.
  if (e.angLure) {
    e.angLure.scale.setScalar((0.85 + Math.sin(a.ctx.time * 2.6 + e.id) * 0.2) * e.scale);
  }
  if (e.attackCd > 0 || a.dist > ANGLER_RANGE) return;
  e.attackCd = ANGLER_CD + Math.random() * 0.8;
  e.flash = 0.12;
  // From the LURE, not from the body. The light is where the player is looking.
  a.ctx.addProjectile(e.pos.x + a.nx * 0.7, 1.5, e.pos.z + a.nz * 0.7, 'angler', e._projScale());
}

// How long it holds, how often, how hard it drags, and how far the current
// reaches. The pull is weak per frame on purpose - it is a current, and a
// current is something you swim against rather than something that takes your
// legs away.
const BARN_ANCHOR = 2.4;
const BARN_CD = 5.0;
const BARN_PULL = 2.6;
const BARN_REACH = 16;
const BARN_EYE = 1.2;

function aiBarnacle(e, a) {
  const ctx = a.ctx;
  const p = ctx.player;
  e.barnT = (e.barnT || 0) - a.dt;

  if (e.anchored) {
    a.vx = 0;
    a.vz = 0;
    // Rooted. Nothing shoves it while it is holding, which is also what stops
    // a crowd of its own wave from walking it off the spot it chose.
    e.immovable = true;
    if (e.barnMaw) {
      e.barnMaw.scale.setScalar((0.9 + Math.sin(ctx.time * 9) * 0.25) * e.scale);
    }
    if (p && a.dist < BARN_REACH) {
      // COVER BREAKS THE CURRENT, and it is the only counter this enemy has.
      // A barnacle that pulled through a pillar would be a brute with no
      // answer at all, which is exactly what the rest of the role already is.
      const blocked = segBlocked(
        e.pos.x, BARN_EYE, e.pos.z, p.pos.x, BARN_EYE, p.pos.z, ctx.obstacles
      );
      if (!blocked) {
        if (ctx.pullPlayer) ctx.pullPlayer(e.pos.x - p.pos.x, e.pos.z - p.pos.z, BARN_PULL);
        if (ctx.effects) {
          _brineAt.set(e.pos.x, 1.1, e.pos.z);
          _brineTo.set(p.pos.x, 1.1, p.pos.z);
          ctx.effects.beam(_brineAt, _brineTo, 0x8ff0e0);
        }
      }
    }
    // It still swings at anything that gets dragged into reach.
    if (a.dist < ENEMY_TYPES.barnacle.melee.hit + 0.4) aiMelee(e, a);
    a.vx = 0;
    a.vz = 0;
    if (e.barnT <= 0) {
      e.anchored = false;
      e.immovable = false;
      e.barnT = BARN_CD;
      e._setEyeAlert(false);
    }
    return;
  }

  aiMelee(e, a);
  if (e.barnT > 0 || a.dist > BARN_REACH || a.dist < 3.5) return;
  e.anchored = true;
  e.barnT = BARN_ANCHOR;
  e.flash = 0.18;
  e._setEyeAlert(true);
  if (ctx.effects) {
    _brineAt.set(e.pos.x, 0.4, e.pos.z);
    ctx.effects.shockwave(_brineAt, 0x14615f, 3.2, 0.4);
  }
}

// The telegraph, and what stands where it lands. The column is solid for its
// whole life rather than solid only after it stops burning: two phases would
// mean a pillar that is safe to touch and one that is not, told apart by a
// clock the player cannot see.
const VENT_RANGE = 24;
const VENT_CD = 4.6;
const VENT_LEAD = 1.5;
const VENT_R = 1.7;
const VENT_LIFE = 3.4;
const VENT_DPS = 18;
const VENT_HIT = 14;

function aiVent(e, a) {
  orbit(e, a, ENEMY_TYPES.vent.orbit);
  const p = a.ctx.player;
  if (!p) return;

  if (e.ventT > 0) {
    e.ventT -= a.dt;
    if (e.ventGlow) {
      const k = 1 - Math.max(0, e.ventT) / VENT_LEAD;
      e.ventGlow.scale.setScalar((0.6 + k * 1.4) * e.scale);
    }
    if (e.ventT <= 0) {
      a.ctx.addHazard(e.ventX, e.ventZ, VENT_R, VENT_LIFE, VENT_DPS, 'scald');
      if (a.ctx.effects) {
        _brineAt.set(e.ventX, 0.4, e.ventZ);
        _brineTo.set(e.ventX, 4.0, e.ventZ);
        a.ctx.effects.beam(_brineAt, _brineTo, 0xa8ffe8);
        a.ctx.effects.burst(_brineTo, 0xa8ffe8, 22, 5, 4, 0.6);
      }
      if (a.ctx.sfx) a.ctx.sfx.impact();
      e._setEyeAlert(false);
    }
    return;
  }

  if (e.attackCd > 0 || a.dist > VENT_RANGE) return;
  e.attackCd = VENT_CD + Math.random() * 1.0;
  e.flash = 0.15;
  e._setEyeAlert(true);
  // Aimed AHEAD of the player rather than at them, because the column is cover
  // as much as it is damage: put where they were going, it walls off the lane;
  // put where they are, it would only ever be a slow hit they walk out of.
  e.ventX = p.pos.x + (p.vel ? p.vel.x * 0.8 : 0);
  e.ventZ = p.pos.z + (p.vel ? p.vel.z * 0.8 : 0);
  a.ctx.addMortar(e.ventX, e.ventZ, VENT_R + 0.6, VENT_LEAD, VENT_HIT);
  e.ventT = VENT_LEAD;
}

const DRIFT_CD = 1.5;
const DRIFT_R = 4.2;
const DRIFT_LIFE = 5.0;

// Crosses over the player and pours. It does not attack and it never stops -
// what it leaves is a moving wall of ink, and the answer is to get out from
// under the line it is flying rather than to fight it.
function aiDrifter(e, a) {
  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
  e.driftCd = (e.driftCd || 0) - a.dt;
  // The fronds sway. It is the only motion on it, and without it a drifter
  // parked overhead reads as a piece of the ceiling.
  e.group.rotation.z = Math.sin(a.ctx.time * 1.6 + e.id) * 0.14;
  if (e.driftCd > 0) return;
  e.driftCd = DRIFT_CD;
  // Dropped WHERE IT HAS BEEN, the same contract every trail in the game
  // keeps: ink the player can be steered into is denial, ink that appears
  // around their head is the screen going out for no reason they can see.
  a.ctx.addHazard(e.pos.x, e.pos.z, DRIFT_R, DRIFT_LIFE, 0, 'ink');
}

// How long one body holds the song, and what killing the WRONG one is worth.
const CHOIR_SING = 4.5;
const CHOIR_FREED = 1.45;
const CHOIR_CD = 3.4;
const CHOIR_PULL = 3.0;
const CHOIR_INK_R = 5.0;
const CHOIR_COL_R = 2.0;
// How far out the ring of columns lands. Wide enough to be a room closing
// rather than a pillar dropped on somebody's head.
const CHOIR_RING = 3.4;
const _choirAt = new THREE.Vector3();

function aiChoir(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.voice === undefined) {
    // The body main.js stood up. It asks to be made three; the handler gives
    // this one voice 0 and the other two 1 and 2, and splits the pool between
    // them so the bar is unchanged by the fight becoming a choir.
    bs.voice = 0;
    bs.freed = 1;
    bs.cd = CHOIR_CD;
    ctx.bossEvent('choir', e);
  }
  if (bs.freed === undefined) {
    bs.freed = 1;
    bs.cd = CHOIR_CD;
  }

  // ---- who is singing -------------------------------------------------
  // COMPUTED, NOT STORED. Every body derives the singer from the same two
  // inputs - the live bodies in id order, and the clock - so all three agree
  // without any of them owning the answer, and a body that spawns or dies
  // cannot leave the others holding a stale one.
  let n = 0;
  let sum = 0;
  for (const o of ctx.enemies) {
    if (o.type !== 'choir' || o.dead) continue;
    n++;
    sum += o.id;
  }
  // RANK, not a sort. A body's place in the choir is how many live bodies have
  // a smaller id than it, which every body can work out about every other one
  // without allocating anything - and with three of them the nested walk is
  // nine comparisons.
  const want = n > 0 ? Math.floor(ctx.time / CHOIR_SING) % n : 0;
  let singerId = -1;
  for (const o of ctx.enemies) {
    if (o.type !== 'choir' || o.dead) continue;
    let rank = 0;
    for (const q of ctx.enemies) {
      if (q.type === 'choir' && !q.dead && q.id < o.id) rank++;
    }
    if (rank === want) {
      singerId = o.id;
      break;
    }
  }
  bs.singing = e.id === singerId;

  // ---- and what it cost to kill the wrong one -------------------------
  if (bs.n === undefined) {
    bs.n = n;
    bs.sum = sum;
    bs.lastSinger = singerId;
  }
  // Only a one-at-a-time loss is detected, which is the only case that
  // happens: the difference of the id sums names the body that left.
  if (n === bs.n - 1) {
    const gone = bs.sum - sum;
    if (gone !== bs.lastSinger) {
      bs.freed *= CHOIR_FREED;
      ctx.bossEvent('freed', e);
    }
  }
  bs.n = n;
  bs.sum = sum;
  bs.lastSinger = singerId;
  // The last one standing is enraged whatever order they went in.
  if (n === 1 && !bs.alone) {
    bs.alone = true;
    ctx.bossEvent('enrage', e);
  }

  // The maw is the targeting information. It opens on the singer and shuts on
  // everybody else, and it is the only difference between the three bodies.
  const mawWant = bs.singing ? 1 : 0;
  bs.maw = (bs.maw || 0) + (mawWant - (bs.maw || 0)) * Math.min(1, a.dt * 5);
  if (e.choirMaw) e.choirMaw.scale.setScalar((0.6 + bs.maw * 1.1) * e.scale);
  e._setEyeAlert(bs.singing);

  // The columns it called for, arriving. Held in one slot on the boss rather
  // than in a list, so one round is in the air at a time and a choir cannot
  // bury the arena while the player is dealing with the other two voices.
  if (e.choirCols > 0) {
    e.choirCols -= a.dt;
    if (e.choirCols <= 0) {
      for (let i = 0; i < 3; i++) {
        const ang = e.choirA + (i / 3) * Math.PI * 2;
        const cx = e.choirX + Math.cos(ang) * CHOIR_RING;
        const cz = e.choirZ + Math.sin(ang) * CHOIR_RING;
        ctx.addHazard(cx, cz, CHOIR_COL_R, VENT_LIFE, VENT_DPS, 'scald');
        if (ctx.effects) {
          _choirAt.set(cx, 0.4, cz);
          _brineTo.set(cx, 4.2, cz);
          ctx.effects.beam(_choirAt, _brineTo, 0xa8ffe8);
        }
      }
      if (ctx.sfx) ctx.sfx.impact();
    }
  }

  aiMelee(e, a);
  bs.cd -= a.dt * bs.freed;
  if (bs.cd > 0 || a.dist > 26) return;
  bs.cd = CHOIR_CD * e.rate;
  const p = ctx.player;
  if (!p) return;

  // ONE MECHANIC EACH, and they are the theme's own three. A choir is BRINE's
  // roster with a single bar over it, which is what makes the boss wave read
  // as the end of the block rather than as an unrelated fight.
  if (bs.voice === 0) {
    // The barnacle's current.
    if (ctx.pullPlayer) ctx.pullPlayer(e.pos.x - p.pos.x, e.pos.z - p.pos.z, CHOIR_PULL);
    if (ctx.effects) {
      _choirAt.set(e.pos.x, 1.2, e.pos.z);
      _brineTo.set(p.pos.x, 1.2, p.pos.z);
      ctx.effects.beam(_choirAt, _brineTo, 0x8ff0e0);
      ctx.effects.shockwave(p.pos, 0x1f8a8a, 3.0, 0.3);
    }
  } else if (bs.voice === 1) {
    // The drifter's ink, over the player rather than under itself: a boss that
    // inked its own feet would be hiding from the fight.
    ctx.addHazard(p.pos.x, p.pos.z, CHOIR_INK_R, 4.5, 0, 'ink');
  } else {
    // The vent's column, three of them in a ring around the player, so it is
    // a room being closed rather than one pillar being dropped. The bearing is
    // rolled ONCE and kept, because the mortars and the columns they become
    // have to land in the same three places - rolling it twice would put the
    // pillars somewhere the circles never were.
    e.choirX = p.pos.x;
    e.choirZ = p.pos.z;
    e.choirA = Math.random() * Math.PI * 2;
    e.choirCols = VENT_LEAD;
    for (let i = 0; i < 3; i++) {
      const ang = e.choirA + (i / 3) * Math.PI * 2;
      ctx.addMortar(
        e.choirX + Math.cos(ang) * CHOIR_RING, e.choirZ + Math.sin(ang) * CHOIR_RING,
        CHOIR_COL_R + 0.5, VENT_LEAD, VENT_HIT
      );
    }
    ctx.bossEvent('charge', e);
  }
}

// ---- TEMPEST ---------------------------------------------------------------
//
// EVERY MECHANIC IN THIS THEME IS A SEGMENT, so the two pieces of arithmetic
// below are shared by all of them rather than written out five times: how far
// a point is from a LINE BETWEEN TWO THINGS, and whether that line is
// interrupted by anything solid. The arcling's wire, the Conductor's
// discharge and the coil's sightline are the same question asked three ways,
// and they must never disagree about the answer.

const _tempAt = new THREE.Vector3();
const _tempTo = new THREE.Vector3();

// Distance from (px,pz) to the SEGMENT ab, in the XZ plane. Clamped to the
// segment rather than the infinite line: an arcling's wire ends at the second
// arcling, and a player standing well past it is standing past it.
function segDistXZ(px, pz, ax, az, bx, bz) {
  const vx = bx - ax;
  const vz = bz - az;
  const len2 = vx * vx + vz * vz;
  if (len2 < 1e-6) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * vx + (pz - az) * vz) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

const _losRay = new THREE.Ray();
const _losDir = new THREE.Vector3();
const _losHit = new THREE.Vector3();

// Is there something solid on the line between these two points?
//
// Tested against the boxes rather than against the nav grid, because what this
// answers is "can it SEE the player" and the grid answers "can it walk there".
// A coil standing on a catwalk has a clear shot at somebody it could not reach
// on foot for ten seconds, and it should take it.
function segBlocked(ax, ay, az, bx, by, bz, boxes) {
  if (!boxes || !boxes.length) return false;
  _losDir.set(bx - ax, by - ay, bz - az);
  const len = _losDir.length();
  if (len < 1e-4) return false;
  _losDir.multiplyScalar(1 / len);
  _losRay.origin.set(ax, ay, az);
  _losRay.direction.copy(_losDir);
  for (const box of boxes) {
    // intersectBox returns the ENTRY POINT or null, and the point matters:
    // a ray that would hit a pillar forty metres behind the player is not a
    // blocked shot, and intersectsBox on its own cannot tell the difference.
    if (_losRay.intersectBox(box, _losHit)) {
      const d = _losHit.distanceTo(_losRay.origin);
      if (d < len - 0.15) return true;
    }
  }
  return false;
}

// How far a wire will stretch before the pair gives up on each other, and how
// close to it counts as standing on it. The width is generous on purpose: the
// wire is drawn as a line one pixel wide and the player is judging it by eye,
// so a hitbox narrower than the eye can measure would read as arbitrary.
const ARC_TETHER_MAX = 9;
const ARC_TETHER_W = 1.0;
// Between hits, and what a hit is worth against its melee damage. Well under
// full: the wire is a place the player should not be, not an execution, and
// crossing one on the way past has to be survivable or the pair is a wall.
const ARC_TICK = 0.5;
const ARC_TICK_MUL = 0.75;

// Runs at the player like any rusher, and drags a live wire to the nearest
// other arcling as it goes.
//
// THE PAIR IS OWNED BY THE LOWER ID, which is not an implementation detail -
// it is what makes the wire hit ONCE. Both ends running the same search would
// draw the same wire twice and charge the player twice for standing on it,
// and the second copy would also be spending a slot out of the beam pool for
// nothing.
function aiArcling(e, a) {
  aiMelee(e, a);
  e.arcCd = (e.arcCd || 0) - a.dt;

  let mate = null;
  let best = ARC_TETHER_MAX * ARC_TETHER_MAX;
  for (const o of a.ctx.enemies) {
    if (o === e || o.dead || o.type !== 'arcling') continue;
    // Only ever upward, so each pair has exactly one owner and a line of
    // three arclings is a chain rather than three overlapping wires.
    if (o.id < e.id) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < best) {
      best = d2;
      mate = o;
    }
  }
  if (!mate) return;

  if (a.ctx.effects) a.ctx.effects.beam(e.pos, mate.pos, 0x4ef3ff);
  const p = a.ctx.player;
  if (!p || e.arcCd > 0) return;
  const d = segDistXZ(p.pos.x, p.pos.z, e.pos.x, e.pos.z, mate.pos.x, mate.pos.z);
  if (d > ARC_TETHER_W) return;
  e.arcCd = ARC_TICK;
  a.ctx.onHitPlayer(e.damage * ARC_TICK_MUL, p.pos, e);
  if (a.ctx.effects) {
    _tempAt.set(p.pos.x, 1.0, p.pos.z);
    a.ctx.effects.burst(_tempAt, 0xd6feff, 10, 4, 2, 0.35);
  }
}

// How long the bolt charges, how often, and how far it reaches. The charge is
// long for a ranged attack, and it has to be: it is not a window to dodge in,
// it is a window to get BEHIND something in, and that takes real seconds.
const COIL_CHARGE = 0.75;
const COIL_CD = 2.6;
const COIL_RANGE = 22;
// Where the bolt leaves and lands. Both are chest height rather than ground
// level, so a knee-high crate does not block a shot the player can see over.
const COIL_EYE = 1.3;

function aiCoil(e, a) {
  const p = a.ctx.player;
  if (!p) return;

  if (e.coilT > 0) {
    // HOLDS STILL FOR THE WHOLE CHARGE. A coil that kept orbiting while it
    // wound up would drift back into a sightline the player had just broken,
    // which would make the one counter it has unreliable - and it also makes
    // the enemy an easy target for exactly as long as it is dangerous.
    a.vx = 0;
    a.vz = 0;
    e.coilT -= a.dt;
    const k = 1 - Math.max(0, e.coilT) / COIL_CHARGE;
    if (e.coilCore) e.coilCore.scale.setScalar((0.5 + k * 1.8) * e.scale);
    if (a.ctx.effects) {
      // A line to the target for the whole wind-up. The bolt itself is
      // instant, so this is the ONLY thing that tells the player which enemy
      // is about to hit them and from where.
      _tempTo.set(p.pos.x, COIL_EYE, p.pos.z);
      _tempAt.set(e.pos.x, COIL_EYE, e.pos.z);
      a.ctx.effects.beam(_tempAt, _tempTo, 0x2fd8e8);
    }
    if (e.coilT > 0) return;

    // THE SHOT. Line of sight is re-tested HERE, at the instant it fires, and
    // not when it started charging - that gap is the whole mechanic.
    _tempAt.set(e.pos.x, COIL_EYE, e.pos.z);
    _tempTo.set(p.pos.x, COIL_EYE, p.pos.z);
    const blocked = segBlocked(
      e.pos.x, COIL_EYE, e.pos.z, p.pos.x, COIL_EYE, p.pos.z, a.ctx.obstacles
    );
    if (e.coilCore) e.coilCore.scale.setScalar(0.5 * e.scale);
    e._setEyeAlert(false);
    if (blocked) {
      // It fires anyway and loses the cycle. A coil that silently held its
      // shot would leave the player unsure whether the cover had worked.
      if (a.ctx.effects) a.ctx.effects.burst(_tempAt, 0x2fd8e8, 12, 4, 2, 0.4);
      return;
    }
    if (a.ctx.effects) {
      a.ctx.effects.beam(_tempAt, _tempTo, 0xd6feff);
      a.ctx.effects.burst(_tempTo, 0xd6feff, 14, 5, 2, 0.4);
    }
    landHit(e, a.ctx);
    return;
  }

  orbit(e, a, ENEMY_TYPES.coil.orbit);
  if (e.attackCd > 0 || a.dist > COIL_RANGE) return;
  // The wind-up is only started when it can currently see the player, so a
  // coil does not stand behind a pillar charging at a wall - but it is NOT
  // re-checked until the shot, which is what leaves the player the window.
  if (segBlocked(e.pos.x, COIL_EYE, e.pos.z, p.pos.x, COIL_EYE, p.pos.z, a.ctx.obstacles)) return;
  e.attackCd = COIL_CD + Math.random() * 0.6;
  e.coilT = COIL_CHARGE;
  e.flash = 0.12;
  e._setEyeAlert(true);
}

// A FRACTION OF ITS OWN BAR, not a flat hundred. The bar scales with the wave
// and a flat number would have a wave-forty dynamo discharging several times a
// second - the enemy is meant to punish a magazine emptied into it, and that
// is the same magazine at wave four and at wave forty.
const DYN_CHARGE_FRAC = 0.26;
const DYN_BLAST_R = 5.4;
// Against its melee damage rather than a number of its own, so the discharge
// scales with the wave exactly as everything else it does.
const DYN_BLAST_MUL = 1.15;
const DYN_KNOCK = 4.2;

function aiDynamo(e, a) {
  aiMelee(e, a);
  if (e.dynStore === undefined) {
    e.dynStore = 0;
    e.dynHp = e.hp;
  }
  // WHAT CAME OFF THE BAR, whatever took it. Read as a delta rather than
  // hooked into takeDamage deliberately: a poison tick, a blast, a melee and a
  // rifle round all charge it, and none of them has to know this type exists.
  const took = e.dynHp - e.hp;
  e.dynHp = e.hp;
  if (took > 0) e.dynStore += took;

  const need = Math.max(1, e.maxHp * DYN_CHARGE_FRAC);
  const k = Math.min(1, e.dynStore / need);
  // The meter is ON THE MODEL. A stored charge nobody can see would make the
  // discharge read as random, and the whole enemy is the player choosing when
  // to keep shooting.
  if (e.dynCore) e.dynCore.scale.setScalar((0.5 + k * 1.5) * e.scale);
  e._setEyeAlert(k > 0.7);
  if (e.dynStore < need) return;

  e.dynStore = 0;
  const p = a.ctx.player;
  if (a.ctx.effects) {
    _tempAt.set(e.pos.x, 0.5, e.pos.z);
    a.ctx.effects.shockwave(_tempAt, 0x4ef3ff, DYN_BLAST_R, 0.4);
    a.ctx.effects.burst(_tempAt, 0xd6feff, 26, 7, 2, 0.6);
  }
  if (a.ctx.sfx) a.ctx.sfx.impact();
  if (!p) return;
  const dx = p.pos.x - e.pos.x;
  const dz = p.pos.z - e.pos.z;
  if (Math.hypot(dx, dz) > DYN_BLAST_R) return;
  a.ctx.onHitPlayer(e.damage * DYN_BLAST_MUL, e.pos, e);
  // Shoved OUT, which is the mercy in it: the discharge ends with the player
  // outside the radius rather than standing in it for the next one.
  if (a.ctx.pullPlayer) a.ctx.pullPlayer(dx, dz, DYN_KNOCK);
}

// The strike, and what it leaves. STORM_LEAD is the mortar's own telegraph,
// and the patch is laid at the same instant the mortar goes off - so the
// circle the player was shown is the circle that stays hostile.
const STORM_RANGE = 24;
const STORM_CD = 3.8;
const STORM_LEAD = 1.4;
const STORM_R = 3.0;
const STORM_DMG = 16;
// Short-lived and vicious, which is what separates `shock` from every other
// ground in the game: lava is a place you can cross and this is not.
const STORM_PATCH_LIFE = 3.2;
const STORM_PATCH_DPS = 24;
// How far ahead of the player it aims. Less than a full lead - the patch is
// the point, and a strike that landed dead on a running player every time
// would be an unavoidable hit rather than a piece of ground taken away.
const STORM_AIM = 0.55;

function aiStormcaller(e, a) {
  orbit(e, a, ENEMY_TYPES.stormcaller.orbit);
  const p = a.ctx.player;
  if (!p) return;

  // A pending strike. Held on the enemy rather than passed to the mortar,
  // because a mortar is a circle and a delay and has nowhere to carry an
  // aftermath - so the caller keeps its own clock and lays the patch when it
  // runs out, on the same frame the shell lands.
  if (e.stormT > 0) {
    e.stormT -= a.dt;
    if (e.stormTip) {
      const k = 1 - Math.max(0, e.stormT) / STORM_LEAD;
      e.stormTip.scale.setScalar((0.6 + k * 1.3) * e.scale);
    }
    if (e.stormT <= 0) {
      a.ctx.addHazard(
        e.stormX, e.stormZ, STORM_R * 0.9, STORM_PATCH_LIFE, STORM_PATCH_DPS, 'shock'
      );
      if (a.ctx.effects) {
        _tempAt.set(e.stormX, 0.4, e.stormZ);
        a.ctx.effects.shockwave(_tempAt, 0x38c6ff, STORM_R, 0.35);
        a.ctx.effects.burst(_tempAt, 0xd6feff, 20, 6, 3, 0.5);
        _tempTo.set(e.stormX, 6, e.stormZ);
        a.ctx.effects.beam(_tempTo, _tempAt, 0xd6feff);
      }
      e._setEyeAlert(false);
    }
    return;
  }

  if (e.attackCd > 0 || a.dist > STORM_RANGE) return;
  e.attackCd = STORM_CD + Math.random() * 0.8;
  e.flash = 0.16;
  e._setEyeAlert(true);
  e.stormX = p.pos.x + (p.vel ? p.vel.x * STORM_AIM : 0);
  e.stormZ = p.pos.z + (p.vel ? p.vel.z * STORM_AIM : 0);
  e.stormT = STORM_LEAD;
  a.ctx.addMortar(e.stormX, e.stormZ, STORM_R, STORM_LEAD, STORM_DMG);
}

// How far the plating reaches, how often it is re-applied, and how many go on
// at once. The cooldown is what makes this a DPS tax rather than a wall: a
// warden's dome is refreshed every frame, and a plate that was would simply be
// a warden with extra steps.
const CAP_RANGE = 9;
const CAP_CD = 4.2;
const CAP_LINKS = 5;

function aiCapacitor(e, a) {
  orbit(e, a, ENEMY_TYPES.capacitor.orbit);
  const spin = a.dt * 2.2;
  if (e.capCoreA) e.capCoreA.rotation.y += spin;
  if (e.capCoreB) e.capCoreB.rotation.y -= spin;

  e.capCd = (e.capCd || 0) - a.dt;
  if (e.capCd > 0) return;
  e.capCd = CAP_CD;

  let n = 0;
  for (const o of a.ctx.enemies) {
    // NEVER ITSELF, and never a boss. Not itself because the whole answer to a
    // capacitor is to shoot it first and a self-plating one would charge for
    // that twice; not a boss for the conduit's reason - an invisible extra
    // hit on a boss is length the player cannot see the source of.
    if (o === e || o.dead || o.boss || o.plated) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > CAP_RANGE * CAP_RANGE) continue;
    o.plated = true;
    o._applyBodyLook();
    if (a.ctx.effects) a.ctx.effects.beam(e.pos, o.pos, 0x7ef0ff);
    if (++n >= CAP_LINKS) break;
  }
  if (n && a.ctx.effects) {
    _tempAt.set(e.pos.x, 1.1, e.pos.z);
    a.ctx.effects.burst(_tempAt, 0x7ef0ff, 12, 3, 2, 0.45);
  }
}

// How close it has to get to gust, how hard, and how long it stays away
// afterwards. The withdrawal is the window - the same contract the shrike's
// climb is written to.
const SQUALL_REACH = 3.6;
const SQUALL_PUSH = 5.2;
const SQUALL_CD = 2.4;
const SQUALL_OFF = 1.1;

function aiSquall(e, a) {
  const p = a.ctx.player;
  if (!p) return;
  e.sqT = (e.sqT || 0) - a.dt;

  // Backing off after a gust. It travels in a straight line away from the
  // player and does nothing, which is the easiest shot it ever offers.
  if (e.sqT > 0) {
    a.vx = -a.nx * a.sp;
    a.vz = -a.nz * a.sp;
    e.group.rotation.z = 0;
    return;
  }

  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
  // Banks as it comes in. The only animation it has, and it is what makes a
  // squall about to gust distinguishable from one crossing the room.
  e.group.rotation.z = Math.min(0.6, Math.max(0, (SQUALL_REACH * 2 - a.dist) * 0.12));
  if (a.dist > SQUALL_REACH) return;

  e.sqT = SQUALL_CD + SQUALL_OFF;
  e.flash = 0.14;
  // NO DAMAGE AT ALL. What it costs the player is the position they had
  // chosen, and that has to be the whole of it - a shove that also hurt would
  // be a rusher that hits from range.
  if (a.ctx.pullPlayer) {
    a.ctx.pullPlayer(p.pos.x - e.pos.x, p.pos.z - e.pos.z, SQUALL_PUSH);
  }
  if (a.ctx.effects) {
    _tempAt.set(p.pos.x, 0.6, p.pos.z);
    a.ctx.effects.shockwave(_tempAt, 0x8fe8ff, 3.4, 0.3);
    a.ctx.effects.burst(_tempAt, 0xd6feff, 16, 5, 2, 0.45);
  }
  if (a.ctx.sfx) a.ctx.sfx.impact();
}

// A pylon does nothing at all, exactly as an anchor does - it stands there and
// it is shot. It pulses on the beat for the anchor's reason: a thing that has
// to be FOUND across a room is found by movement long before it is found by
// colour.
function aiPylon(e, a) {
  a.vx = 0;
  a.vz = 0;
  if (a.ctx.pulse !== e._lastPulse) {
    e._lastPulse = a.ctx.pulse;
    e.flash = Math.max(e.flash, 0.12);
  }
}

// ---- VOID ------------------------------------------------------------------

// Opens a rift near the player, waits, and fires the round out of IT rather
// than out of itself. There is never a line between the warp and the player,
// so there is nothing for cover to interrupt - what the player reads is the
// exit, and what they do about it is step off the point.
function aiWarp(e, a) {
  orbit(e, a, ENEMY_TYPES.warp.orbit);
  const p = a.ctx.player;
  if (!p) return;

  if (e.riftT > 0) {
    e.riftT -= a.dt;
    // The exit hangs in the air, marked, for the whole lead. It is the only
    // warning the round gets and it must never be skipped.
    if (a.ctx.effects) {
      _voidAt.set(e.riftX, 1.2, e.riftZ);
      a.ctx.effects.burst(_voidAt, 0x8b7bff, 2, 1.2, 0, 0.35);
      // A line from the caster to its own exit, so a player who has not yet
      // learned the enemy can see WHO opened the hole they are standing next
      // to. Every VOID mechanic is invisible without this.
      a.ctx.effects.beam(e.pos, _voidAt, 0x6f5bff);
    }
    if (e.riftT <= 0) {
      // Fired FROM the exit, aimed at the player from there.
      a.ctx.addProjectile(e.riftX, 1.2, e.riftZ, 'warp', e._projScale());
      if (a.ctx.effects) {
        _voidAt.set(e.riftX, 1.2, e.riftZ);
        a.ctx.effects.burst(_voidAt, 0xd0c4ff, 14, 4, 2, 0.45);
      }
      e._setEyeAlert(false);
    }
    return;
  }

  if (e.attackCd > 0 || a.dist > WARP_RANGE) return;
  e.attackCd = WARP_CD + Math.random() * 0.8;
  e.flash = 0.14;
  e._setEyeAlert(true);
  // The exit opens on a random bearing around the player rather than between
  // them and the warp - which is the point: it can come from behind, and no
  // amount of facing the enemy prevents it.
  const ang = Math.random() * Math.PI * 2;
  e.riftX = Math.max(-20, Math.min(20, p.pos.x + Math.cos(ang) * WARP_EXIT_R));
  e.riftZ = Math.max(-20, Math.min(20, p.pos.z + Math.sin(ang) * WARP_EXIT_R));
  e.riftT = WARP_LEAD;
}

// Walks THROUGH the arena in a dead straight line. The only enemy in the game
// that ignores the navigation grid entirely - and it has to be written as a
// deliberate override rather than as a missing call, because every other
// ground type steers by `px, pz` and a reader will assume this one does too.
function aiMonolith(e, a) {
  // THE STRAIGHT LINE, not the path. `nx, nz` is the bearing to the player;
  // `px, pz` is the route around cover, and this type never reads it.
  const sp = e._effSpeed();
  a.vx = a.nx * sp;
  a.vz = a.nz * sp;
  // Passing through obstacles is a property of the COLLISION resolver, not of
  // the steering - see Enemy.update, where a type with `phase` is not pushed
  // back out of what it is inside.
  e.phase = true;
  if (a.dist < MONO_SWING_RANGE) {
    // Close enough to swing. aiMelee writes its own velocity, so it runs
    // instead of the straight line rather than as well as it.
    aiMelee(e, a);
  }
}

// Lobs a well. It does no damage; what it does is take back the two seconds
// the player spent getting out of somewhere.
function aiSingularity(e, a) {
  orbit(e, a, ENEMY_TYPES.singularity.orbit);
  if (e.attackCd > 0 || a.dist > SING_RANGE) return;
  e.attackCd = SING_CD + Math.random() * 1.2;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.3, e.pos.z + a.nz * 0.8, 'well');
  if (a.ctx.effects) {
    _voidAt.set(e.pos.x, 1.4, e.pos.z);
    a.ctx.effects.burst(_voidAt, 0x7c4dff, 10, 3, 2, 0.5);
  }
}

function aiConduit(e, a) {
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

// SPITS a glob that arcs across the arena and leaves its pool where it lands.
//
// The pool used to be created directly at the player's feet with no projectile
// and no travel time - mechanically it was a lead shot, but with nothing in the
// air to read it played as the floor turning hostile at random, and there was
// no way to answer it. Now the same lead is baked into the glob's aim (see
// _spawnSpit in main.js, which leads by most of the real flight time), so a
// player who keeps running in a straight line still gets caught and one who
// breaks off does not. The threat is unchanged; it is now legible.
//
// Fired from the nozzle the model has always had, not from the body centre.
function aiBlight(e, a) {
  orbit(e, a, ENEMY_TYPES.blight.orbit);
  if (e.attackCd > 0 || a.dist > 20) return;
  e.attackCd = 3.2 + Math.random() * 0.8;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.0, e.pos.z + a.nz * 0.8);
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 1.1, e.pos.z);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.blight.color, 10, 3, 2, 0.5);
  }
}

// Walks the player down and burns the floor as it goes. The patch is dropped
// where it HAS been, never where it is going: a trail the player can be
// steered into is area denial, one that appears under their feet is an
// unavoidable hit.
function aiMagma(e, a) {
  aiMelee(e, a);
  e.magmaCd = (e.magmaCd || 0) - a.dt;
  if (e.magmaCd > 0) return;
  e.magmaCd = MAGMA_DROP_INTERVAL;
  a.ctx.addHazard(
    e.pos.x, e.pos.z,
    MAGMA_PATCH_RADIUS, MAGMA_PATCH_LIFE, MAGMA_PATCH_DPS, 'lava'
  );
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 0.25, e.pos.z);
    a.ctx.effects.burst(_blinkAt, 0xff7a18, 5, 1.6, 2, 0.5);
  }
}

// Walks the player down and freezes the floor as it goes. Structurally the
// magma's trail and deliberately so - same drop-behind-me rule, for the same
// reason: ground the player can be STEERED onto is area denial, ground that
// appears under their feet is an unavoidable hit.
//
// What is different is that this trail costs nothing to stand in. It is not
// trying to hurt the player; it is trying to keep them where the rest of the
// wave can.
// ---- EMBER -----------------------------------------------------------------

// Orbits and lobs. The shell is a Spit like the blight's and the vitriol's -
// same arc, same lead, same tell - and what is different is only what grows
// where it lands: a FAN of three rather than one patch, thrown along the
// shell's own heading.
function aiFlare(e, a) {
  orbit(e, a, ENEMY_TYPES.flare.orbit);
  if (e.attackCd > 0 || a.dist > FLARE_RANGE) return;
  e.attackCd = FLARE_CD + Math.random() * 0.8;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.2, e.pos.z + a.nz * 0.8, 'ember');
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x + a.nx * 0.5, 1.4, e.pos.z + a.nz * 0.5);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.flare.color, 12, 3.4, 2, 0.5);
  }
}

// Walks to its range, plants, and turns. THE SWEEP IS ON THE BEAT: the bearing
// steps once per Music.pulse, never on a clock of its own - see the note on
// the type. Everything else here is bookkeeping around that one edge test.
function aiKiln(e, a) {
  // Close to its planting range and then stop. It does not orbit and it does
  // not retreat: a kiln backing away from the player would be dragging its own
  // sweep around after them, and the point of the enemy is that the wedge of
  // burning floor stays where it was put and the player has to leave.
  if (a.dist > KILN_PLANT_RANGE) {
    a.vx = a.px * e._effSpeed();
    a.vz = a.pz * e._effSpeed();
    e._setEyeAlert(false);
    return;
  }
  e._setEyeAlert(true);

  if (e.kilnAngle === undefined) {
    // Started on its own bearing and its own direction of travel, so two kilns
    // in one wave carve different wedges instead of one thick one.
    e.kilnAngle = Math.random() * Math.PI * 2;
    e.kilnDir = Math.random() < 0.5 ? -1 : 1;
    e._lastKilnPulse = a.ctx.pulse;
  }

  // THE EDGE TEST IS INEQUALITY, not order. music.js's pulse is a counter that
  // only climbs, but a loop or a seek can move the grid position backwards
  // while the index does not - so comparing for difference is what cannot miss
  // a beat in a long frame or fire twice in a short one.
  if (a.ctx.pulse !== e._lastKilnPulse) {
    e._lastKilnPulse = a.ctx.pulse;
    e.kilnAngle += KILN_STEP * e.kilnDir;
    const bx = e.pos.x + Math.cos(e.kilnAngle) * KILN_REACH;
    const bz = e.pos.z + Math.sin(e.kilnAngle) * KILN_REACH;
    a.ctx.addHazard(bx, bz, KILN_PATCH_RADIUS, KILN_PATCH_LIFE, KILN_PATCH_DPS, 'ember');
    if (a.ctx.effects) {
      _kilnTip.set(bx, 0.3, bz);
      // The bar itself, drawn every step from the port to the tip. This is the
      // warning - the patch it lays is where the bar ALREADY was.
      a.ctx.effects.beam(e.pos, _kilnTip, 0xff6a1f);
      a.ctx.effects.burst(_kilnTip, 0xffb347, 4, 2, 2, 0.4);
    }
  }
  // Faces along the bar, so the port on the model is pointing at the fire.
  e.group.rotation.y = -e.kilnAngle + Math.PI / 2;
  e.faceLocked = true;
}

// No attack. It stands off and LIGHTS the wave: every EMBER enemy inside its
// range burns on contact for as long as this thing is alive.
//
// Written as a refreshed flag on the target rather than as a list held here,
// exactly like the conduit's buff - so it lapses a fraction of a second after
// the bellows stops reaching, and dies with it, with nothing to clean up.
function aiBellows(e, a) {
  orbit(e, a, ENEMY_TYPES.bellows.orbit);

  // The breath, and the whole animation budget of the enemy: the core between
  // the lobes swells and the lobes part with it. On its own clock rather than
  // the beat, because it is a body doing a body thing - the KILN is the one
  // that belongs to the track.
  const breath = 0.5 + 0.5 * Math.sin(a.ctx.time * 3.4 + e.id);
  if (e.bellowsCore) e.bellowsCore.scale.setScalar((0.7 + breath * 0.6) * e.scale);
  if (e.lobeA && e.lobeB) {
    e.lobeA.position.y = (1.44 + breath * 0.08) * e.scale;
    e.lobeB.position.y = (0.7 - breath * 0.08) * e.scale;
  }

  let drawn = 0;
  for (const o of a.ctx.enemies) {
    // Bosses excluded for the conduit's reason: an unreadable buff on the one
    // fight the player is already reading closely.
    if (o === e || o.dead || o.boss || o.type === 'bellows') continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > BELLOWS_RANGE * BELLOWS_RANGE) continue;
    o.igniteT = BELLOWS_HOLD;
    if (drawn++ < BELLOWS_LINKS && a.ctx.effects) {
      a.ctx.effects.beam(e.pos, o.pos, 0xff6a1f);
    }
  }
}

// Circles wide, rears, then flies a straight line across the arena laying
// fire, and cannot steer while it does. Four states on e.aw:
//
//   'circle'  hold ASHWING_STANDOFF from the player, waiting out the cooldown
//   'tell'    rear up on the spot, aimed at where the player is NOW
//   'run'     commit: fixed heading, no steering, dropping the whole way
//   'bank'    climb away and go back to circling
//
// The heading is frozen at the END of the tell, which is what makes the tell
// mean something: the line it draws is the line the player was standing on
// when it reared, not the one they are on when it arrives.
function aiAshwing(e, a) {
  if (!e.aw) e.aw = { state: 'circle', t: 0, hx: 0, hz: 1, drop: 0 };
  const aw = e.aw;
  aw.t -= a.dt;

  if (aw.state === 'run') {
    e.hoverY = ASHWING_HIGH * 0.72;
  // RAISING THE VELOCITY IS NOT ENOUGH. Enemy.update clamps how far a body may
  // move in a frame to `speed * stepMul`, and stepMul defaults to 1.4 - so an
  // ai() that multiplies its own velocity by three and does not touch it moves
  // at 1.4x and looks like a slightly hurried walk. Every committed charge in
  // the game raises it (the shrike's dive, Colossus's and Siege's) and all
  // three of the ones added with the themes had silently not been.
    e.stepMul = ASHWING_RUN_MUL;
    // NO STEERING. vx/vz come off the frozen heading, not off nx/nz.
    const sp = e._effSpeed() * ASHWING_RUN_MUL;
    a.vx = aw.hx * sp;
    a.vz = aw.hz * sp;
    e.group.rotation.y = Math.atan2(aw.hx, aw.hz) + Math.PI;
    e.faceLocked = true;

    aw.drop -= a.dt;
    if (aw.drop <= 0) {
      aw.drop = ASHWING_DROP_INTERVAL;
      a.ctx.addHazard(
        e.pos.x, e.pos.z,
        ASHWING_PATCH_RADIUS, ASHWING_PATCH_LIFE, ASHWING_PATCH_DPS, 'ember'
      );
      if (a.ctx.effects) {
        _ashAt.set(e.pos.x, e.pos.y - 0.3, e.pos.z);
        a.ctx.effects.burst(_ashAt, 0xff7a18, 4, 2.2, 2, 0.45);
      }
    }
    // Ends on the clock or on the far wall, whichever comes first - a run that
    // kept going would grind along the boundary laying a stripe down it.
    if (aw.t <= 0 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) {
      aw.state = 'bank';
      aw.t = ASHWING_CD * e.rate;
      e._setEyeAlert(false);
    }
    return;
  }

  e.stepMul = 1.4;
  if (aw.state === 'tell') {
    e.hoverY = ASHWING_HIGH + 0.9;
    // Rears: nose up and rolled, held on the spot. The one second of the whole
    // cycle where it is stationary and directly readable from below.
    e.group.rotation.x = -0.7;
    e.faceLocked = false;
    a.vx = 0;
    a.vz = 0;
    if (aw.t <= 0) {
      // FREEZE THE HEADING HERE, aimed through the player rather than at them,
      // so the line runs past and keeps going.
      aw.hx = a.nx;
      aw.hz = a.nz;
      aw.state = 'run';
      aw.t = ASHWING_RUN_TIME;
      aw.drop = 0;
      e.group.rotation.x = 0;
    }
    return;
  }

  if (aw.state === 'bank') {
    // Climb out wide. Deliberately slow and high - this is the window, the
    // same way the shrike's climb is.
    e.hoverY = ASHWING_HIGH + 1.4;
    a.vx = -a.nx * e._effSpeed() * 0.8;
    a.vz = -a.nz * e._effSpeed() * 0.8;
    if (aw.t <= 0) aw.state = 'circle';
    return;
  }

  // 'circle': hold the standoff and wait. It is out of reach and doing nothing
  // here, which is the rhythm - a bombing run is a thing that arrives, not a
  // thing that is always happening.
  e.hoverY = ASHWING_HIGH;
  const push = a.dist < ASHWING_STANDOFF ? -0.9 : 0.7;
  const sp = e._effSpeed();
  a.vx = (a.nx * push - a.nz * 0.55) * sp;
  a.vz = (a.nz * push + a.nx * 0.55) * sp;
  if (aw.t <= 0 && a.dist < ASHWING_STANDOFF + 6) {
    aw.state = 'tell';
    aw.t = ASHWING_TELL;
    e._setEyeAlert(true);
  }
}

// ---- VERDANT ---------------------------------------------------------------

// Closes, plants, commits, overshoots, comes back. The heading is frozen at
// the END of the tell, exactly as the ashwing's is - what the player is
// stepping off is the line they were standing on when it reared, not the one
// they are on when it arrives.
function aiThornling(e, a) {
  if (!e.tl) e.tl = { state: 'walk', t: 0, hx: 0, hz: 1 };
  const tl = e.tl;
  tl.t -= a.dt;

  if (tl.state === 'run') {
  // RAISING THE VELOCITY IS NOT ENOUGH. Enemy.update clamps how far a body may
  // move in a frame to `speed * stepMul`, and stepMul defaults to 1.4 - so an
  // ai() that multiplies its own velocity by three and does not touch it moves
  // at 1.4x and looks like a slightly hurried walk. Every committed charge in
  // the game raises it (the shrike's dive, Colossus's and Siege's) and all
  // three of the ones added with the themes had silently not been.
    e.stepMul = THORN_RUN_MUL;
    const sp = e._effSpeed() * THORN_RUN_MUL;
    // NO STEERING. Off the frozen heading, not off nx/nz.
    a.vx = tl.hx * sp;
    a.vz = tl.hz * sp;
    // Contact during a charge is a hit, from any state - the same rule the
    // melee cycle uses, because a body moving this fast passing through the
    // player without touching them is the bug players actually notice.
    if (a.dist < 2.0 && e.chargeHit !== true) {
      e.chargeHit = true;
      landHit(e, a.ctx);
    }
    // Ends on its clock, on a wall, or on the arena edge - anything else grinds
    // it along the boundary for the rest of the wave.
    if (tl.t <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 20 || Math.abs(e.pos.z) > 20) {
      tl.state = 'walk';
      tl.t = THORN_CD * e.rate;
      e.chargeHit = false;
      e._setEyeAlert(false);
    }
    return;
  }

  e.stepMul = 1.4;
  if (tl.state === 'tell') {
    // Planted, aimed, and visibly winding. The one moment it is stationary.
    a.vx = 0;
    a.vz = 0;
    if (tl.t <= 0) {
      tl.hx = a.nx;
      tl.hz = a.nz;
      tl.state = 'run';
      tl.t = THORN_RUN;
      e.chargeHit = false;
    }
    return;
  }

  // Walking. It still swings if the player comes to it - a charger with no
  // melee is answered by standing next to it.
  aiMelee(e, a);
  if (tl.t <= 0 && a.dist < THORN_RANGE && a.dist > THORN_MIN) {
    tl.state = 'tell';
    tl.t = THORN_TELL;
    e._setEyeAlert(true);
    e.flash = 0.12;
  }
}

// Lobs a seed. The seed does nothing; two seconds later the ground does.
function aiSporegun(e, a) {
  orbit(e, a, ENEMY_TYPES.sporegun.orbit);
  if (e.attackCd > 0 || a.dist > SPORE_RANGE) return;
  e.attackCd = SPORE_CD + Math.random() * 0.9;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.4, e.pos.z + a.nz * 0.8, 'seed');
  if (a.ctx.effects) {
    _verdAt.set(e.pos.x, 1.5, e.pos.z);
    a.ctx.effects.burst(_verdAt, ENEMY_TYPES.sporegun.color, 9, 3, 2, 0.5);
  }
}

// A brute that costs you for being next to it. The aura is checked against the
// PLAYER only - a thorn field that also hurt its own crowd would make the
// enemy a liability to the wave it is supposed to anchor.
function aiBramblehide(e, a) {
  aiMelee(e, a);
  e.thornCd = (e.thornCd || 0) - a.dt;
  if (a.dist > BRAMBLE_REACH) return;
  if (e.thornCd > 0) return;
  e.thornCd = BRAMBLE_TICK;
  // Through onHitPlayer rather than as a hazard: it is a hit from an enemy,
  // so the ward, the dodge and every other thing that reads a hit gets to
  // look at it.
  a.ctx.onHitPlayer(BRAMBLE_DPS * BRAMBLE_TICK, e.pos, e);
  if (a.ctx.effects) {
    _verdAt.set(e.pos.x, 0.9, e.pos.z);
    a.ctx.effects.burst(_verdAt, 0x6b8f3a, 6, 2.5, 1, 0.35);
  }
}

// Roots and mends. The one support whose effect the player cannot see on
// themselves at all, so every bit of the feedback is on the BEAM.
function aiHeartwood(e, a) {
  orbit(e, a, ENEMY_TYPES.heartwood.orbit);
  let drawn = 0;
  for (const o of a.ctx.enemies) {
    // Bosses excluded, for the conduit's reason: healing the one fight the
    // player is already reading closely, invisibly, is the worst version of
    // this mechanic.
    if (o === e || o.dead || o.boss || o.type === 'heartwood') continue;
    if (o.hp >= o.maxHp) continue;
    const dx = o.pos.x - e.pos.x;
    const dz = o.pos.z - e.pos.z;
    if (dx * dx + dz * dz > HEART_RANGE * HEART_RANGE) continue;
    o.hp = Math.min(o.maxHp, o.hp + o.maxHp * HEART_RATE * a.dt);
    if (drawn++ < HEART_LINKS && a.ctx.effects) {
      a.ctx.effects.beam(e.pos, o.pos, 0x8fbf4a);
    }
  }
  e._setEyeAlert(drawn > 0);
}

// Drifts at head height trailing spores. It holds a short standoff rather than
// closing, because the cloud is the attack and a mothcap sitting on the player
// would just be a slower husk.
function aiMothcap(e, a) {
  e.hoverY = MOTH_HIGH;
  const sp = e._effSpeed();
  const push = a.dist < MOTH_STANDOFF ? -0.7 : 0.8;
  // A wide lazy arc rather than a straight approach: it is the one flier that
  // is IN the crowd, and it has to read as drifting through it.
  a.vx = (a.nx * push - a.nz * 0.6) * sp;
  a.vz = (a.nz * push + a.nx * 0.6) * sp;

  e.dripCd = (e.dripCd || 0) - a.dt;
  if (e.dripCd > 0) return;
  e.dripCd = MOTH_DROP;
  // Under itself, and it OUTLIVES it - killing one overhead leaves the cloud
  // exactly where the player is standing, which is the whole bargain.
  a.ctx.addHazard(e.pos.x, e.pos.z, MOTH_RADIUS, MOTH_LIFE, GAS_DPS, 'gas');
  if (a.ctx.effects) {
    _verdAt.set(e.pos.x, e.pos.y - 0.4, e.pos.z);
    a.ctx.effects.burst(_verdAt, 0xa8c93a, 6, 1.6, -1, 0.6);
  }
}

function aiRime(e, a) {
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
function aiShard(e, a) {
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
function aiGlacier(e, a) {
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
function aiHailer(e, a) {
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
function aiHoarfrost(e, a) {
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
function aiSleet(e, a) {
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

function aiVitriol(e, a) {
  orbit(e, a, ENEMY_TYPES.vitriol.orbit);
  if (e.attackCd > 0 || a.dist > 20) return;
  e.attackCd = 3.4 + Math.random() * 0.8;
  e.flash = 0.15;
  a.ctx.addSpit(e.pos.x + a.nx * 0.8, 1.0, e.pos.z + a.nz * 0.8, 'gas');
  if (a.ctx.effects) {
    _blinkAt.set(e.pos.x, 1.1, e.pos.z);
    a.ctx.effects.burst(_blinkAt, ENEMY_TYPES.vitriol.color, 10, 3, 2, 0.5);
  }
}

// THE HOWL. Two states and one ring on the floor.
//
// While it is winding up it nearly stops - a telegraph the enemy can chase you
// with is not a telegraph, it is a countdown you cannot outrun - and the ring
// it draws is at the exact radius the scream will cover, filling as the clock
// runs down. That ring is the entire fairness of this enemy: the player is
// told where, told how big, and given the longest warning any ordinary enemy
// gives, because the thing about to happen is the one thing they cannot shoot
// their way out of afterwards.
function aiHowler(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.howler.orbit);
  e.hT = (e.hT || 0) - a.dt;

  if (e.hState !== 'wind') {
    if (e.hT > 0) return;
    // Nothing to scream at yet. It closes rather than howling into an empty
    // arena, which also stops a howler across the map from spending its
    // cooldown where the player will never see it.
    if (a.dist > HOWL_RADIUS + 6) {
      e.hT = 0.4;
      return;
    }
    e.hState = 'wind';
    e.hT = HOWL_WINDUP;
    e._setEyeAlert(true);
    if (ctx.effects) {
      e.hMark = ctx.effects.markAcquire();
      e.hFx = ctx.effects;
    }
    return;
  }

  // Winding up: barely moving, ring on the floor, jaw wide.
  a.vx *= 0.15;
  a.vz *= 0.15;
  const fill = 1 - Math.max(0, e.hT) / HOWL_WINDUP;
  if (e.hMark >= 0 && e.hFx) {
    // Weight 0.2: at seven metres the fill is a wash at a mortar's opacity,
    // and the RING is the part that has to be read anyway - it is the line the
    // player has to be outside of.
    e.hFx.markSet(
      e.hMark, e.pos.x, e.pos.z, HOWL_RADIUS, ENEMY_TYPES.howler.color, fill,
      1, 0, 0.2
    );
  }
  // The jaw opens over the wind-up, so the model says the same thing the ring
  // does for a player who is looking at the enemy rather than at the floor.
  if (e.jaw) e.jaw.rotation.x = 0.2 + fill * 0.75;
  if (e.hT > 0) return;

  releaseHowl(e);
  e.hState = 'idle';
  e.hT = HOWL_CD;
  e._setEyeAlert(false);
  if (e.jaw) e.jaw.rotation.x = 0.2;
  if (ctx.effects) {
    _blinkAt.set(e.pos.x, 0.06, e.pos.z);
    ctx.effects.shockwave(_blinkAt, ENEMY_TYPES.howler.color, HOWL_RADIUS, 0.45);
    _blinkAt.set(e.pos.x, 1.2, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.howler.eye, 22, 6, 1.5, 0.6);
  }
  // The radius is checked at the moment it LANDS, not when it started: the
  // whole point of the wind-up is that leaving works.
  if (a.dist < HOWL_RADIUS && ctx.applyPlayerStatus) {
    ctx.applyPlayerStatus('fear', HOWL_FEAR);
    if (ctx.effects) ctx.effects.addShake(0.2);
  }
}

// Releases the floor ring a howler is holding. Named as the type's `cleanup`
// as well, because a howler shot dead mid-scream is still holding a mark and
// that pool is ten deep - see releaseMarks for the boss version of the same
// hazard.
function releaseHowl(e) {
  if (e.hMark >= 0 && e.hFx) e.hFx.markRelease(e.hMark);
  e.hMark = -1;
}

// THE HEX. It stands off and spends two seconds pointing at you.
//
// The beam is redrawn every frame from its head to the player's eye, which
// makes it the only permanent line in a fight and therefore the easiest thing
// on screen to trace back to its owner. That is the design: the player is not
// supposed to work out what cursed them, they are supposed to see it happening
// and get a decision - kill it, or break the range, or accept ten seconds of
// taking a quarter more from everything.
function aiHexer(e, a) {
  const ctx = a.ctx;
  orbit(e, a, ENEMY_TYPES.hexer.orbit);
  e.xT = (e.xT || 0) - a.dt;

  if (e.xState !== 'channel') {
    if (e.xT > 0 || a.dist > HEX_RANGE) return;
    e.xState = 'channel';
    e.xT = HEX_CHANNEL;
    e._setEyeAlert(true);
    return;
  }

  // Channelling. It keeps its distance but stops strafing hard - a caster
  // sliding sideways at full speed makes the beam impossible to follow back.
  a.vx *= 0.35;
  a.vz *= 0.35;
  if (e.ring) e.ring.rotation.z += a.dt * 3.2;
  if (ctx.effects) {
    // BOTH ENDS ARE PASSED LOW ON PURPOSE. effects.beam adds 0.9 to whatever y
    // it is given - it was written for conduit-to-enemy links between two
    // things standing on the floor - so a beam handed the player's EYE is
    // drawn at 2.6m, which from a first-person camera is behind and above the
    // viewer and therefore invisible. The far end goes to the player's CHEST,
    // half a metre under the eye: the beam then arrives just below the
    // crosshair, where it can actually be seen coming.
    // DRAWN TWICE, a hand's width apart. A GL line is one pixel wide however
    // thick it is asked to be - the same problem the lightning bolts solve
    // with three jittered forks - and one hairline across a dark arena is not
    // a thing anyone notices while being shot at. Two is enough here because
    // this line is two seconds long rather than a fifth of one, and the beam
    // pool is only eight deep and shared with every conduit link on the floor.
    const t = ctx.time * 2.2 + e.id;
    for (const off of [-0.09, 0.09]) {
      _hexFrom.set(e.pos.x + off, 0.35 + Math.sin(t) * 0.03, e.pos.z);
      _hexTo.set(
        ctx.player.pos.x + off * 0.5, ctx.player.pos.y + 0.2, ctx.player.pos.z
      );
      ctx.effects.beam(_hexFrom, _hexTo, ENEMY_TYPES.hexer.color);
    }
  }

  // Broken by RANGE, and only by range. A channel any stray pellet cancelled
  // would never finish once in a run, and an enemy whose whole mechanic never
  // resolves teaches the player nothing except to ignore it.
  if (a.dist > HEX_BREAK) {
    e.xState = 'idle';
    e.xT = HEX_CD * 0.5;
    e._setEyeAlert(false);
    return;
  }
  if (e.xT > 0) return;

  e.xState = 'idle';
  e.xT = HEX_CD;
  e._setEyeAlert(false);
  if (ctx.applyPlayerStatus) ctx.applyPlayerStatus('curse', HEX_CURSE);
  if (ctx.effects) {
    ctx.effects.shockwave(ctx.player.pos, ENEMY_TYPES.hexer.color, 3.2, 0.4);
    _blinkAt.set(e.pos.x, 1.4, e.pos.z);
    ctx.effects.burst(_blinkAt, ENEMY_TYPES.hexer.eye, 18, 5, 2, 0.6);
  }
}

// No attack of its own. It keeps a middle distance and makes everything under
// its dome unkillable, so it converts a crowd the player was already shooting
// into a wall - and the fix is to walk in and delete the warden.
//
// It never wards ITSELF and never wards another warden: a pair that covered
// each other would be a stalemate with no way in, and a warden inside its own
// dome would simply be an enemy that cannot be killed.
function aiWarden(e, a) {
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

// COLOSSUS. Four states, and the whole fight is the player reading which one
// it is in: walking (keep to the glowing side), telegraphing (get something
// solid behind you), charging (be elsewhere), knocked down (everything you
// have). Damage is capped per attack rather than left to scale, because the
// wave-55 multiplier on a 34 point hit would be a one-shot.
// How far above itself a boss's ground attacks reach. Bosses stand 4-6m tall
// so this is far more generous than MELEE_REACH_Y, and it clears a player
// jumping from the tallest platform (1.6 + a 1.84 apex = 3.44). It stops short
// of the perimeter catwalk decks at 4.05: like every other melee in the game,
// a boss's swing pools below the walkways while its adds - gunners, artillery,
// mortars - are what punish standing up there. Without this the ground
// shockwave of a slam hit a player four metres overhead.
const BOSS_REACH_Y = 3.6;
// How far the player is above the arena floor. `a.dist` throughout the boss AI
// is XZ-only - the whole game collides in 2D - so this is the missing axis.
function _reachY(a) {
  return Math.abs(a.ctx.player.pos.y);
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
const TURRET_ARC_TIME = 1.0;
const TURRET_ARC_HEIGHT = 8;
// The pause between landing and the first shot. This is the window the player
// is given to kill it before it costs them anything.
const TURRET_DEPLOY = 0.9;
const TURRET_FIRE_CD = 1.6;
const TURRET_RANGE = 30;

function aiTurret(e, a) {
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
function releaseTurret(e) {
  if (e.tMark >= 0 && e.tFx) e.tFx.markRelease(e.tMark);
  e.tMark = -1;
}

const BOSS_TOUCH_CAP = 30;
const BOSS_TOUCH_CD = 1.2;
// How far past the body's own radius counts as touching. Matched to
// Enemy.CONTACT_PAD's intent on the ordinary roster: a shade wider, because a
// boss's collision radius is the barrel of its chest and its shoulders reach
// well past it.
const BOSS_TOUCH_PAD = 0.9;

/**
 * Charges the player for standing on a boss. Uses bs.touchCd, so a boss with
 * its own touch clock (Maw) must not also call this.
 *
 * @param {number} mul  damage as a fraction of the boss's own hit
 * @returns {boolean} true if it connected this frame
 */
function bossTouch(e, a, mul = 0.9) {
  const bs = e.bs;
  bs.touchCd = (bs.touchCd || 0) - a.dt;
  if (bs.touchCd > 0) return false;
  if (a.dist > e.radius + BOSS_TOUCH_PAD || _reachY(a) >= BOSS_REACH_Y) return false;
  bs.touchCd = BOSS_TOUCH_CD * e.rate;
  a.ctx.onHitPlayer(Math.min(BOSS_TOUCH_CAP, e.damage * mul), e.pos, e);
  _bossAt.set(e.pos.x, 1.2, e.pos.z);
  a.ctx.effects.burst(_bossAt, ENEMY_TYPES[e.type].eye, 12, 4, 1.6, 0.35);
  a.ctx.effects.addShake(0.12);
  return true;
}

const COLOSSUS_CHARGE_CAP = 52;
const COLOSSUS_SLAM_CAP = 44;
const COLOSSUS_CHARGE_SPEED = 14;
// How far the charge lane reaches. Used twice - by the telegraph that draws
// the rectangle and by the creep that burns it - so the warning and the
// consequence cannot drift apart.
const COLOSSUS_LANE_LEN = 22;
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
const COLOSSUS_CREEP_RADIUS = 2.4;
// Spaced under a radius apart, so the row overlaps into a continuous strip
// instead of reading as stepping stones down the middle of the attack. Nine
// patches covers the lane; the count is kept low on purpose, because creep
// runs on a thirty-slot pool shared with blight pools and ash and a finer
// strip would let one charge take every slot in it.
const COLOSSUS_CREEP_STEP = 2.6;
const COLOSSUS_CREEP_LIFE = 5;
const COLOSSUS_CREEP_DPS = 14;
// Nothing is laid outside the arena. A lane aimed at a near wall runs most of
// its length through solid geometry, and a patch out there would burn a pool
// slot on ground no one can stand on.
const COLOSSUS_CREEP_BOUND = 21.6;

// THE TURRETS COLOSSUS THROWS. See the `turret` type for what one does once it
// lands; these are the numbers for putting it there.
//
// THREE AT ONCE, AND NO MORE. The cap is what keeps this an addition to the
// fight rather than a replacement for it: at three the player can always clear
// the floor inside one vent window if they decide to, and the boss can always
// put one back afterwards. Counted live off the arena rather than tracked on
// the boss, so a turret the player destroys frees its slot the same frame.
const COLOSSUS_MAX_TURRETS = 3;
const COLOSSUS_LOB_CD = 9;
const COLOSSUS_LOB_WINDUP = 0.7;
// How far from the player one is allowed to land, near end and far. It is
// thrown at where they ARE - it is not a mortar and it does not lead - but it
// must never come down on top of them, and the further away they are the
// looser the throw gets: the offset grows with range, so a turret lobbed
// across the arena lands in the player's neighbourhood rather than at their
// feet.
const TURRET_DROP_MIN = 4;
const TURRET_DROP_MAX = 10;

function _turretCount(ctx) {
  let n = 0;
  for (const o of ctx.enemies) if (!o.dead && o.type === 'turret') n++;
  return n;
}

// Where the next turret comes down, into _turretSpot. Returns false when ten
// tries found nothing on open floor, in which case the boss simply does not
// throw this time.
const _turretSpot = { x: 0, z: 0 };
function _pickTurretSpot(e, a) {
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
function _colossusBurnLane(e, ctx) {
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
function _colossusVent(bs, dt, open) {
  bs.vent += ((open ? 1 : 0) - bs.vent) * Math.min(1, dt * 6);
  const x = (COLOSSUS_SHUT_X + COLOSSUS_SHUT_TRAVEL * bs.vent) * bs.mScale;
  for (const sh of bs.shutters) sh.mesh.position.x = sh.sign * x;
  // A slow throb while it is open, so the exposed core is the only thing on
  // the model that is moving in place.
  const pulse = open ? 1 + 0.25 * Math.sin(bs.ventT * 9) : 1;
  bs.coreMat.emissiveIntensity =
    (COLOSSUS_CORE_SHUT + (COLOSSUS_CORE_OPEN - COLOSSUS_CORE_SHUT) * bs.vent) * pulse;
}

function aiColossus(e, a) {
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

// SIEGE. Everything it does is announced: the barrage draws its circles a full
// 1.5s before it lands, and the charge draws its lane for a second before the
// boss leaves the blocks. It is a fight about never being where you were a
// second ago - and now about not being able to simply walk away, either.
//
// THREE ATTACKS, ONE PER RANGE, so there is never a spot on the floor where
// it has nothing to do and never two of them competing for the same moment:
//   contact   a swing, through the shared melee cycle - it chases you down
//   mid       the charge: a telegraphed lane, then a rush straight at you
//   far       the barrage, unchanged
// The charge is the one that can be BAITED: it commits to a heading at the
// telegraph and slamming it into a pillar buys a long open window, the same
// bargain Colossus offers.
const SIEGE_MORTAR_CAP = 34;
const SIEGE_CHARGE_CAP = 46;
const SIEGE_CHARGE_SPEED = 15;
// How far the charge reaches, and how long it is allowed to run. The timeout
// is what ends a charge that finds nothing at all - open floor, a player who
// stepped aside early - rather than letting it plough on to the wall.
const SIEGE_LANE_LEN = 20;
const SIEGE_DASH_TIME = 1.8;
const SIEGE_TELE_TIME = 1.0;

// ---- the Forge-Tyrant -------------------------------------------------------
// How fast the bar fills, and what each third of it buys. Tuned so a player
// doing reasonable damage sees three or four vents in a fight: fewer and the
// windows are too scarce to build a fight around, more and the escalation
// never gets far enough up the ladder to show the ring.
const FORGE_HEAT_RATE = 1 / 15;
const FORGE_SWEEP_AT = 0.34;
const FORGE_RING_AT = 0.67;
// The vent. LONG, because it is the whole reward, and it has to be worth
// having spent the fight earning.
const FORGE_VENT_TIME = 4.2;
const FORGE_VENT_R0 = 3.5;
const FORGE_VENT_R1 = 11;
const FORGE_VENT_DROP = 0.22;
// The sweep: the kiln's bar, at boss scale and twice the reach.
const FORGE_SWEEP_TIME = 3.4;
const FORGE_SWEEP_REACH = 13;
const FORGE_SWEEP_STEP = (Math.PI * 2) / 26;
// The ring: a wall of fire at a fixed radius with ONE gap in it. The gap is
// the entire counterplay, so it is wide enough to find under pressure and
// narrow enough that finding it is a decision.
const FORGE_RING_R = 9;
const FORGE_RING_N = 18;
const FORGE_RING_GAP = 3;      // consecutive slots left open
const FORGE_SPECIAL_CD = 6.5;
const FORGE_PATCH_RADIUS = 1.8;
const FORGE_PATCH_LIFE = 3.2;
const FORGE_PATCH_DPS = 14;
const _forgeAt = new THREE.Vector3();

// Slides the chest doors and brightens the furnace behind them. Everything the
// player needs to know about this fight is on this one part of the model, so
// it is driven every frame rather than on the state transitions - a window
// that snapped open would be a window they could miss the start of.
function _forgeDoors(e, open, dt) {
  const bs = e.bs;
  bs.doorT += ((open ? 1 : 0) - bs.doorT) * Math.min(1, dt * 6);
  if (e.doorL) {
    e.doorL.position.x = (-0.19 - bs.doorT * 0.38) * e.scale;
    e.doorR.position.x = (0.19 + bs.doorT * 0.38) * e.scale;
  }
  if (e.forgeCore) {
    // Swells with the heat even while shut, so the bar filling is legible on
    // the BODY and not only on the HUD.
    const k = 0.7 + bs.heat * 0.5 + bs.doorT * 0.9;
    e.forgeCore.scale.setScalar(k * e.scale);
  }
}

function aiForge(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.heat = 0;
    bs.t = 0;
    bs.cd = FORGE_SPECIAL_CD * 0.5;
    bs.doorT = 0;
    bs.angle = Math.random() * Math.PI * 2;
    bs.dir = Math.random() < 0.5 ? -1 : 1;
    bs.lastPulse = ctx.pulse;
    bs.venting = false;
    // Read by main.js's 'vent' bossEvent for the HUD note. Colossus says CORE
    // EXPOSED because a shutter opened on a clock; this one is the boss
    // choosing to stop, which is a different thing and should say so.
    bs.ventNote = 'VENTING';
  }
  bs.t -= a.dt;

  // ---- venting ------------------------------------------------------------
  // Stationary, plates open, full damage - and radiating. The player wants to
  // be inside the ring's growth for as long as they dare and out of it before
  // it reaches them, which is the one decision this fight is built to ask.
  if (bs.state === 'vent') {
    a.vx = 0;
    a.vz = 0;
    _forgeDoors(e, true, a.dt);
    const k = 1 - Math.max(0, bs.t) / FORGE_VENT_TIME;
    const r = FORGE_VENT_R0 + (FORGE_VENT_R1 - FORGE_VENT_R0) * k;
    bs.drop -= a.dt;
    if (bs.drop <= 0) {
      bs.drop = FORGE_VENT_DROP;
      // Laid as a RING at the current radius rather than as a disc, so the
      // ground it has already crossed cools and the player can follow it back
      // in. A disc would simply delete the arena for four seconds.
      const n = 10;
      const off = Math.random() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const ang = off + (i / n) * Math.PI * 2;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * r, e.pos.z + Math.sin(ang) * r,
          FORGE_PATCH_RADIUS, FORGE_PATCH_LIFE, FORGE_PATCH_DPS, 'ember'
        );
      }
      if (ctx.effects) {
        _forgeAt.set(e.pos.x, 1.4, e.pos.z);
        ctx.effects.burst(_forgeAt, 0xff8c1a, 16, 5, 2, 0.6);
      }
    }
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.venting = false;
      bs.heat = 0;
      bs.cd = FORGE_SPECIAL_CD;
      e.weakOpen = false;
      ctx.bossEvent('vent', e);
    }
    return;
  }

  // Heat only climbs while it is FIGHTING. A player who runs away is not
  // making progress toward a window, which is what stops the vent from being
  // something you can farm by kiting.
  bs.heat = Math.min(1, bs.heat + a.dt * FORGE_HEAT_RATE * (a.dist < 26 ? 1 : 0.25));
  _forgeDoors(e, false, a.dt);

  if (bs.heat >= 1) {
    bs.state = 'vent';
    bs.venting = true;
    bs.t = FORGE_VENT_TIME;
    bs.drop = 0;
    // `weakOpen` is the field main.js's 'vent' event reads, so reusing it
    // means the HUD note and the bar's colour come for free.
    e.weakOpen = true;
    bs.weakOpen = true;
    ctx.bossEvent('vent', e);
    return;
  }
  bs.weakOpen = false;

  // ---- the sweep ----------------------------------------------------------
  if (bs.state === 'sweep') {
    a.vx = 0;
    a.vz = 0;
    // ON THE BEAT, exactly as the kiln's is. The boss and its own artillery
    // turning at the same rate is most of what makes an EMBER boss wave read
    // as one fight rather than as a boss with unrelated adds.
    if (ctx.pulse !== bs.lastPulse) {
      bs.lastPulse = ctx.pulse;
      bs.angle += FORGE_SWEEP_STEP * bs.dir;
      const bx = e.pos.x + Math.cos(bs.angle) * FORGE_SWEEP_REACH;
      const bz = e.pos.z + Math.sin(bs.angle) * FORGE_SWEEP_REACH;
      // Two patches along the bar, not one at the tip: at thirteen metres a
      // single patch out at the end leaves a corridor of safe ground between
      // the boss and the fire, which is exactly where a player would stand.
      for (const f of [0.55, 1]) {
        ctx.addHazard(
          e.pos.x + Math.cos(bs.angle) * FORGE_SWEEP_REACH * f,
          e.pos.z + Math.sin(bs.angle) * FORGE_SWEEP_REACH * f,
          FORGE_PATCH_RADIUS, FORGE_PATCH_LIFE, FORGE_PATCH_DPS, 'ember'
        );
      }
      if (ctx.effects) {
        _forgeAt.set(bx, 0.4, bz);
        ctx.effects.beam(e.pos, _forgeAt, 0xff6a1f);
        ctx.effects.burst(_forgeAt, 0xffb347, 5, 2.5, 2, 0.4);
      }
    }
    e.group.rotation.y = -bs.angle + Math.PI / 2;
    e.faceLocked = true;
    if (bs.t <= 0) {
      bs.state = 'walk';
      bs.cd = FORGE_SPECIAL_CD * e.rate;
    }
    return;
  }

  // ---- the ring -----------------------------------------------------------
  // One slam, one wall of fire at a fixed radius, one gap in it. Unlike the
  // sweep there is nothing to outrun - the answer is to be looking for the gap
  // before it lands, which is why the whole thing is laid in a single frame
  // and telegraphed by the slam that precedes it.
  if (bs.state === 'ring') {
    a.vx = 0;
    a.vz = 0;
    if (bs.t <= 0) {
      const gapAt = (Math.random() * FORGE_RING_N) | 0;
      for (let i = 0; i < FORGE_RING_N; i++) {
        // The gap is CONSECUTIVE slots, so it is an arc the player can aim at
        // rather than a scatter of holes they have to be lucky to find.
        const inGap = ((i - gapAt + FORGE_RING_N) % FORGE_RING_N) < FORGE_RING_GAP;
        if (inGap) continue;
        const ang = (i / FORGE_RING_N) * Math.PI * 2;
        ctx.addHazard(
          e.pos.x + Math.cos(ang) * FORGE_RING_R, e.pos.z + Math.sin(ang) * FORGE_RING_R,
          FORGE_PATCH_RADIUS, FORGE_PATCH_LIFE * 1.4, FORGE_PATCH_DPS, 'ember'
        );
      }
      if (ctx.effects) {
        _forgeAt.set(e.pos.x, 0.6, e.pos.z);
        ctx.effects.shockwave(_forgeAt, 0xff5a1f, FORGE_RING_R, 0.45);
        ctx.effects.burst(_forgeAt, 0xff8c1a, 24, 6, 2, 0.7);
      }
      if (ctx.sfx) ctx.sfx.impact();
      bs.state = 'walk';
      bs.cd = FORGE_SPECIAL_CD * e.rate;
    }
    return;
  }

  // ---- walking, and picking the next special ------------------------------
  aiMelee(e, a);
  bs.cd -= a.dt;
  if (bs.cd > 0 || a.dist > 26) return;

  // Escalating: what it is allowed to reach for is a function of how hot it
  // is, so the fight visibly climbs toward the vent instead of arriving there.
  const canRing = bs.heat >= FORGE_RING_AT;
  const canSweep = bs.heat >= FORGE_SWEEP_AT;
  if (canRing && (Math.random() < 0.5 || !canSweep)) {
    bs.state = 'ring';
    // The wind-up IS the telegraph, and the only warning the ring gets.
    bs.t = 0.85;
    e.flash = 0.2;
    ctx.bossEvent('charge', e);
  } else if (canSweep) {
    bs.state = 'sweep';
    bs.t = FORGE_SWEEP_TIME;
    bs.dir = Math.random() < 0.5 ? -1 : 1;
  }
}

// ---- the Pale Crown ---------------------------------------------------------
// Three shells, at the top of the bar and at two thirds and a third. Each one
// puts three anchors in the floor and takes nothing at all until they are
// broken - so the shell has no clock on it, and a player who finds them fast
// is paid in a longer window rather than the same window later.
const CROWN_SHELLS = [1.0, 0.67, 0.34];
const CROWN_ANCHORS = 3;
// Where they go: a ring around the ARENA rather than around the boss, so
// breaking them means crossing the room it is freezing rather than standing
// still and turning on the spot.
const CROWN_ANCHOR_R = 14;
// The volley it throws while the shell is up. It is not helpless in there and
// it must not be - a shell the player can simply walk away from would make the
// anchors optional.
const CROWN_VOLLEY_CD = 3.2;
const CROWN_VOLLEY_N = 5;
const CROWN_VOLLEY_SPREAD = 0.17;
// How hard the room freezes while it is shelled, per shell. The floor filling
// up is the pressure that stops the anchor hunt from being a stroll.
const CROWN_FROST_CD = 1.5;
const CROWN_FROST_R = 12;
const _crownAt = new THREE.Vector3();

// An anchor does nothing at all. It stands there and it is shot, and the only
// thing it needs to do is BE FOUND - so it pulses on the beat, which makes it
// catch the eye across a room without needing a marker over it.
function aiAnchor(e, a) {
  a.vx = 0;
  a.vz = 0;
  if (a.ctx.pulse !== e._lastPulse) {
    e._lastPulse = a.ctx.pulse;
    e.flash = Math.max(e.flash, 0.12);
  }
}

function aiPaleCrown(e, a) {
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

// ---- the Overgrowth ---------------------------------------------------------
// Inside this, the canopy is open and the boss takes full damage. It is also
// exactly where its rings land, which is the entire fight.
const OG_WINDOW = 8;
// The ring it lays when the player is inside the window. Gapped, like every
// other ring in the game, because a closed one around a player who has chosen
// to be there is a tax rather than a decision.
const OG_RING_R = 6.5;
const OG_RING_N = 7;
const OG_RING_GAP = 2;
const OG_RING_CD = 4.5;
// The creeper: a LINE of thorns marching outward toward wherever the player is
// standing, each one sprouting a little later than the last. It is what
// answers standing at range and doing nothing, which a rooted boss would
// otherwise have no reply to at all.
const OG_CREEP_CD = 5.5;
const OG_CREEP_N = 5;
const OG_CREEP_STEP = 3.6;
const OG_CREEP_LEAD = 0.55;
const OG_THORN_R = 2.4;
const OG_THORN_DELAY = 1.3;
const OG_THORN_DMG = 20;
const _ogAt = new THREE.Vector3();

function aiOvergrowth(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.ringCd = OG_RING_CD * 0.6;
    bs.creepCd = OG_CREEP_CD * 0.5;
    bs.openT = 0;
    bs.state = 'rooted';
  }

  // IT NEVER MOVES. Not a state, not a condition - there is no branch in this
  // function that writes a velocity, and `speed` is zero on the type as well
  // so nothing else can either.
  a.vx = 0;
  a.vz = 0;

  // The window is a pure function of range, recomputed every frame, so the
  // armour and the model can never disagree about whether it is open.
  bs.open = a.dist < OG_WINDOW;
  bs.openT += ((bs.open ? 1 : 0) - bs.openT) * Math.min(1, a.dt * 5);
  if (e.canopy) {
    for (let i = 0; i < e.canopy.length; i++) {
      const c = e.canopy[i];
      const ang = (i / e.canopy.length) * Math.PI * 2 + 0.4;
      // Out and up: the caps part and lift, so the cleft and the core inside
      // it come into view from the front rather than only from above.
      const r = (0.42 + bs.openT * 0.5) * e.scale;
      c.position.set(Math.cos(ang) * r, (2.05 + bs.openT * 0.34) * e.scale, Math.sin(ang) * r);
      c.rotation.z = bs.openT * (Math.cos(ang) * 0.5);
      c.rotation.x = bs.openT * (Math.sin(ang) * 0.5);
    }
  }
  if (e.ogCore) e.ogCore.scale.setScalar((0.8 + bs.openT * 0.75) * e.scale);
  e._setEyeAlert(bs.open);

  // It still swings at anything that comes to it. The window has to cost
  // something even when the thorns are not up.
  if (a.dist < 6) aiMelee(e, a);

  // ---- the ring -----------------------------------------------------------
  // Only while the player is inside the window. This is the price of the
  // damage they are choosing to do.
  bs.ringCd -= a.dt;
  if (bs.open && bs.ringCd <= 0) {
    bs.ringCd = OG_RING_CD * e.rate;
    const gapAt = (Math.random() * OG_RING_N) | 0;
    const off = Math.random() * Math.PI * 2;
    for (let i = 0; i < OG_RING_N; i++) {
      if (((i - gapAt + OG_RING_N) % OG_RING_N) < OG_RING_GAP) continue;
      const ang = off + (i / OG_RING_N) * Math.PI * 2;
      ctx.addMortar(
        e.pos.x + Math.cos(ang) * OG_RING_R, e.pos.z + Math.sin(ang) * OG_RING_R,
        OG_THORN_R, OG_THORN_DELAY, OG_THORN_DMG
      );
    }
    e.flash = 0.18;
    if (ctx.effects) {
      _ogAt.set(e.pos.x, 0.8, e.pos.z);
      ctx.effects.shockwave(_ogAt, 0x7ea63c, OG_RING_R, 0.4);
    }
    ctx.bossEvent('charge', e);
  }

  // ---- the creeper --------------------------------------------------------
  // The answer to standing at range. A line of thorns walking outward along
  // the player's own bearing, each sprouting later than the last - so it
  // arrives as a thing coming TOWARD them rather than as a hit.
  bs.creepCd -= a.dt;
  if (!bs.open && bs.creepCd <= 0 && a.dist < 30) {
    bs.creepCd = OG_CREEP_CD * e.rate;
    for (let i = 1; i <= OG_CREEP_N; i++) {
      const d = i * OG_CREEP_STEP;
      ctx.addMortar(
        e.pos.x + a.nx * d, e.pos.z + a.nz * d,
        OG_THORN_R, OG_THORN_DELAY + i * OG_CREEP_LEAD, OG_THORN_DMG
      );
    }
    e.flash = 0.15;
    ctx.bossEvent('charge', e);
  }
}

// ---- the Conductor ----------------------------------------------------------
// The only fight in the game whose clock is the music. It counts BARS on
// Music.pulse - the same half-beat edge the kiln sweeps on and the Forge turns
// on - raises a pylon on each of the first three and discharges along every
// line it has on the fourth.
//
// So the fight is played BETWEEN the bars. Three bars to break as many pylons
// as the player can afford to turn away from the boss for, and one bar that
// charges them for the ones they left standing. A player who clears all three
// takes a discharge with nothing in it; a player who ignores them takes six
// live wires across the room at once.

// Eight half-beats to the bar - four beats, the ordinary way to count one.
const COND_HALVES = 8;
const COND_PYLONS = 3;
// A ring around the ARENA rather than around the boss, for the Pale Crown's
// reason: breaking them has to mean crossing the room the boss is standing in,
// not turning on the spot beside it.
const COND_PYLON_R = 13;
// How long the wires stay live, how wide they are, and how often one charges
// the player while they are standing on it. Wider than an arcling's wire
// because these are lethal and the player is reading them at boss speed.
const COND_ARC_TIME = 1.1;
const COND_ARC_W = 1.6;
const COND_ARC_TICK = 0.32;
// Against the boss's melee damage rather than a number of its own, so the
// discharge rides bossScale like everything else the fight does.
const COND_ARC_MUL = 0.85;
const _condAt = new THREE.Vector3();
const _condTo = new THREE.Vector3();

// Every wire it currently has: one from the boss to each pylon, and one
// between each pair of pylons. Walked by both halves of the fight - the dim
// draw during the bars and the live test during the discharge - so the lines
// the player was shown are provably the lines that fire.
function _condWires(e, fn) {
  const live = e.bs.pylons.filter((q) => q && !q.dead);
  for (const q of live) fn(e.pos.x, e.pos.z, q.pos.x, q.pos.z);
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      fn(live[i].pos.x, live[i].pos.z, live[j].pos.x, live[j].pos.z);
    }
  }
  return live.length;
}

function aiConductor(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'walk';
    bs.bar = 0;
    bs.half = 0;
    bs.pylons = [];
    bs.lastPulse = ctx.pulse;
    bs.tick = 0;
    bs.ventNote = 'DISCHARGE';
  }

  // The crown eases back down between bars, so every bar reads as a step up
  // rather than as a steady glow.
  bs.crown = Math.max(0, (bs.crown || 0) - a.dt * 1.6);
  if (e.condCore) e.condCore.scale.setScalar((0.8 + bs.crown * 0.9) * e.scale);

  // ---- discharging --------------------------------------------------------
  if (bs.state === 'discharge') {
    a.vx = 0;
    a.vz = 0;
    bs.t -= a.dt;
    bs.tick -= a.dt;
    const p = ctx.player;
    let onWire = false;
    _condWires(e, (ax, az, bx, bz) => {
      if (ctx.effects) {
        _condAt.set(ax, 1.1, az);
        _condTo.set(bx, 1.1, bz);
        ctx.effects.beam(_condAt, _condTo, 0xffffff);
      }
      if (p && segDistXZ(p.pos.x, p.pos.z, ax, az, bx, bz) < COND_ARC_W) onWire = true;
    });
    if (onWire && bs.tick <= 0) {
      bs.tick = COND_ARC_TICK;
      ctx.onHitPlayer(e.damage * COND_ARC_MUL, p.pos, e);
      if (ctx.effects) {
        _condAt.set(p.pos.x, 1.0, p.pos.z);
        ctx.effects.burst(_condAt, 0xd6feff, 16, 5, 2, 0.4);
      }
    }
    if (bs.t <= 0) {
      // THE PYLONS GO WITH IT. Every cycle starts from an empty room, so the
      // three bars are a fresh puzzle each time rather than a board that fills
      // up until it cannot be cleared.
      for (const q of bs.pylons) {
        if (q && !q.dead) {
          q.dead = true;
          if (ctx.effects) ctx.effects.burst(q.pos, 0x4ef3ff, 18, 5, 2, 0.5);
        }
      }
      bs.pylons.length = 0;
      bs.state = 'walk';
      bs.bar = 0;
      bs.weakOpen = false;
      // `weakOpen` is ONLY the HUD note's gate here. This type has no armor()
      // at all - the Conductor is unarmoured for the whole fight - so unlike
      // Colossus and the Forge the flag changes nothing about damage.
      ctx.bossEvent('vent', e);
    }
    return;
  }

  // ---- walking, and counting ----------------------------------------------
  aiMelee(e, a);

  // The dim draw. Every wire it currently has, every frame, from the moment
  // the pylon goes in - which is the entire warning the discharge gets, and
  // the reason the fight can be played rather than survived.
  _condWires(e, (ax, az, bx, bz) => {
    if (!ctx.effects) return;
    _condAt.set(ax, 1.1, az);
    _condTo.set(bx, 1.1, bz);
    ctx.effects.beam(_condAt, _condTo, 0x2fd8e8);
  });

  // INEQUALITY, NOT ORDER. `pulse` is a counter the music owns and this reads
  // an EDGE off it - the same contract every other beat-driven thing in the
  // game keeps, and the reason a tempo change or a restart cannot desync it.
  if (ctx.pulse === bs.lastPulse) return;
  bs.lastPulse = ctx.pulse;
  if (++bs.half < COND_HALVES) return;
  bs.half = 0;
  bs.bar++;
  bs.crown = 1;
  e.flash = 0.12;

  if (bs.bar <= COND_PYLONS) {
    // Spread around the ring rather than dropped at random, so three pylons
    // make a triangle across the room instead of a cluster in one corner.
    const ang = (bs.bar / COND_PYLONS) * Math.PI * 2 + (bs.spin || (bs.spin = Math.random() * 6.28));
    const px = Math.max(-19, Math.min(19, Math.cos(ang) * COND_PYLON_R));
    const pz = Math.max(-19, Math.min(19, Math.sin(ang) * COND_PYLON_R));
    if (ctx.addAnchor) {
      const q = ctx.addAnchor(px, pz, 'pylon');
      if (q) bs.pylons.push(q);
    }
    if (ctx.effects) {
      _condAt.set(e.pos.x, 2.4, e.pos.z);
      _condTo.set(px, 1.6, pz);
      ctx.effects.beam(_condAt, _condTo, 0xd6feff);
      ctx.effects.burst(_condTo, 0x4ef3ff, 18, 5, 2, 0.5);
    }
    if (ctx.sfx) ctx.sfx.impact();
    return;
  }

  bs.state = 'discharge';
  bs.t = COND_ARC_TIME;
  bs.tick = 0;
  bs.weakOpen = true;
  ctx.bossEvent('vent', e);
  ctx.bossEvent('charge', e);
  if (ctx.effects) {
    _condAt.set(e.pos.x, 0.6, e.pos.z);
    ctx.effects.shockwave(_condAt, 0x4ef3ff, 6, 0.4);
  }
}

function aiSiege(e, a) {
  const bs = e.bs;
  const ctx = a.ctx;
  if (bs.salvoCd === undefined) {
    bs.salvoCd = 2;
    bs.chargeCd = 4;
    bs.state = 'walk';
    bs.t = 0;
    bs.dirX = 0;
    bs.dirZ = 0;
    bs.mark = -1;
  }
  // Held so cleanup() can release a telegraph the boss died on top of.
  bs.fx = ctx.effects;

  // The lane, drawn at full length from the first frame so the AREA reads
  // instantly, filling as it goes so the TIMING reads too. Same shape and the
  // same clock as Colossus's, because it is the same promise to the player.
  if (bs.state === 'tele') {
    bs.t -= a.dt;
    e._setEyeAlert(true);
    ctx.effects.markSet(
      bs.mark,
      e.pos.x + bs.dirX * SIEGE_LANE_LEN * 0.5, e.pos.z + bs.dirZ * SIEGE_LANE_LEN * 0.5,
      1.9, 0xff5533, 1 - bs.t / SIEGE_TELE_TIME,
      SIEGE_LANE_LEN / 3.8, Math.atan2(-bs.dirX, -bs.dirZ)
    );
    if (bs.t <= 0) {
      ctx.effects.markRelease(bs.mark);
      bs.mark = -1;
      e._setEyeAlert(false);
      bs.state = 'dash';
      bs.t = SIEGE_DASH_TIME;
      ctx.bossEvent('charge', e);
    }
    return;
  }

  if (bs.state === 'dash') {
    bs.t -= a.dt;
    // See the same line in aiColossus: without this the charge is clamped to
    // walking pace by update()'s step cap and never actually arrives.
    e.stepMul = SIEGE_CHARGE_SPEED / Math.max(0.5, a.sp);
    a.vx = bs.dirX * SIEGE_CHARGE_SPEED;
    a.vz = bs.dirZ * SIEGE_CHARGE_SPEED;
    // Wider than the melee reach: this is a body the size of a truck arriving
    // at fifteen metres a second, and clipping past its shoulder should not be
    // a clean dodge.
    if (a.dist < e.radius + 1.6 && _reachY(a) < BOSS_REACH_Y) {
      ctx.onHitPlayer(Math.min(SIEGE_CHARGE_CAP, e.damage * 1.5), e.pos, e);
      _bossAt.set(e.pos.x, 1.2, e.pos.z);
      ctx.effects.burst(_bossAt, 0xff7043, 24, 7, 2, 0.6);
      ctx.effects.addShake(0.3);
      bs.state = 'recover';
      bs.t = 0.9;
      // Charged here as well as on the miss below, so a charge that CONNECTS
      // is not immediately followed by another one.
      bs.chargeCd = 7 * e.rate;
      return;
    }
    // Ran into a pillar, a crate or the wall. The reward for baiting it: a
    // long window on a boss that is otherwise walking at you the whole fight.
    if (e.blockedBy > 0.05 || bs.t <= 0) {
      const slammed = e.blockedBy > 0.05;
      bs.state = 'recover';
      bs.t = slammed ? 2.4 : 0.7;
      bs.chargeCd = 7 * e.rate;
      if (slammed) {
        _bossAt.set(e.pos.x, 0, e.pos.z);
        ctx.effects.shockwave(_bossAt, 0xff5533, 7, 0.5);
        ctx.effects.burst(_bossAt, 0xff7043, 34, 8, 3, 0.8);
        ctx.effects.addShake(0.35);
        ctx.bossEvent('stagger', e);
      }
    }
    return;
  }

  // Winded, or picking itself up off a pillar. It stands still and does
  // nothing at all - no swing, no shells - which is the whole point of it.
  if (bs.state === 'recover') {
    e.stepMul = 1.4;
    bs.t -= a.dt;
    if (bs.t <= 0) {
      bs.state = 'walk';
      ctx.bossEvent('recover', e);
    }
    return;
  }

  // Terror does not send a boss running - it just stops it doing anything,
  // which is what fearMode 'stagger' declares on the type. Tested AFTER the
  // committed states above: a charge already out of the gate is not called
  // back by it.
  if (e.status.fear > 0) {
    e._setEyeAlert(false);
    return;
  }

  // walk. It closes, and it swings at whatever it reaches - the melee cycle
  // returns true only when it is free to keep walking.
  e.stepMul = 1.4;
  const m = ENEMY_TYPES.siege.melee;
  const free = e._meleeCycle(a.dt, a.dist, ctx, m.windup, m.start, m.hit, m.cd);
  if (free) {
    a.vx = a.px * a.sp;
    a.vz = a.pz * a.sp;
  }

  // Nothing below may interrupt a swing that is already wound up or live -
  // `free` is exactly that test, and it is what keeps the boss from
  // teleporting out of its own attack into a charge.
  if (!free) return;

  bs.chargeCd -= a.dt;
  // Not from inside melee range, where it would simply be a second swing, and
  // not from across the arena, where the player would have all day to walk
  // out of the lane before it launched.
  if (bs.chargeCd <= 0 && a.dist > 7 && a.dist < 28) {
    bs.state = 'tele';
    bs.t = SIEGE_TELE_TIME;
    bs.mark = ctx.effects.markAcquire();
    // The heading is locked at the telegraph, not tracked through it. That is
    // the whole counter-play: what the rectangle showed is where it goes.
    bs.dirX = a.nx;
    bs.dirZ = a.nz;
    return;
  }

  bs.salvoCd -= a.dt;
  if (bs.salvoCd > 0 || a.dist > 34) return;
  bs.salvoCd = 2.4 * e.rate;
  e.flash = 0.15;
  // One more shell per repeat of the rotation. e.cycle is set at spawn.
  const shots = 2 + Math.min(2, e.cycle);
  const p = ctx.player;
  for (let i = 0; i < shots; i++) {
    // Led onto where the player is going, and scattered, so running in a
    // straight line is punished but the barrage is never a guaranteed hit.
    ctx.addMortar(
      p.pos.x + p.vel.x * 0.45 + (Math.random() - 0.5) * 5,
      p.pos.z + p.vel.z * 0.45 + (Math.random() - 0.5) * 5,
      3.5, 1.5, Math.min(SIEGE_MORTAR_CAP, e.damage * 1.55)
    );
  }
}

// SCHISM. Melee pressure, a radial volley, and the split.
//
// It used to be melee and the split alone, which made it the one boss you
// could fight from across the room: back off, shoot, and the whole fight was
// a walk backwards. The BURST is what closes that off - eight rounds at once,
// evenly around the circle, so distance stops being safety and the answer is
// to be behind cover or moving across it rather than away from it.
//
// EVERY PART FIRES. Four halves each throwing eight rounds is the point of
// splitting it: the boss gets more dangerous as it comes apart, not less.
// The cooldown is per part and randomised at spawn, so the halves fall out of
// step with each other instead of firing as one wall.
const SCHISM_BURST_CD = 4.2;
const SCHISM_BURST_SHOTS = 8;
// Seconds the core flares before the rounds leave. The volley covers every
// bearing, so it cannot be dodged by direction - only by reading it early and
// getting something between you and it.
const SCHISM_TELL = 0.45;
// Split thresholds, in fractions of the part's own health pool. THREE of them
// now: 2 parts, then 4, then 8. Each one only ever fires once because a
// child's health is reset on the way out of _splitBoss.
const SCHISM_SPLITS = [0.5, 0.25, 0.12];

function aiSchism(e, a) {
  const bs = e.bs;
  // TWO separate guards, and they must stay separate: _splitBoss hands a child
  // its parent's `tier` at birth, so a tier test would leave every child with
  // an undefined burst clock - which decrements to NaN and silently never
  // fires. The split halves are exactly the parts the volley matters most on.
  if (bs.tier === undefined) bs.tier = 0;
  if (bs.burstCd === undefined) {
    // Randomised so the parts of a split boss never fire together.
    bs.burstCd = 1.5 + Math.random() * SCHISM_BURST_CD;
    bs.tell = 0;
  }
  aiMelee(e, a);
  e.coreMesh.rotation.y += a.dt * 2.5;
  e.ringMesh.rotation.x += a.dt * 1.8;

  if (bs.tell > 0) {
    bs.tell -= a.dt;
    // The wind-up IS the core spinning up and swelling - no extra geometry and
    // nothing to clean up if the part dies mid-tell.
    e.coreMesh.rotation.y += a.dt * 9;
    const k = 1 + (1 - Math.max(0, bs.tell) / SCHISM_TELL) * 0.7;
    e.ringMesh.scale.setScalar(k);
    if (bs.tell <= 0) {
      e.ringMesh.scale.setScalar(1);
      const y = 1.0 * (e.group.scale.y || 1);
      for (let i = 0; i < SCHISM_BURST_SHOTS; i++) {
        a.ctx.addProjectile(
          e.pos.x, y, e.pos.z, 'schism', 1, (i / SCHISM_BURST_SHOTS) * Math.PI * 2
        );
      }
      _bossAt.set(e.pos.x, y, e.pos.z);
      a.ctx.effects.burst(_bossAt, ENEMY_TYPES.schism.color, 18, 6, 1.5, 0.4);
    }
  } else {
    bs.burstCd -= a.dt;
    if (bs.burstCd <= 0 && a.dist < 26) {
      bs.burstCd = SCHISM_BURST_CD * e.rate + Math.random() * 1.2;
      bs.tell = SCHISM_TELL;
    }
  }

  if (bs.tier < SCHISM_SPLITS.length && e.hp <= e.maxHp * SCHISM_SPLITS[bs.tier]) {
    bs.tier++;
    a.ctx.bossEvent('split', e);
  }
}

// MAW. Two pressures at once: a constant drag inward, and rings rolling out
// along the floor that have to be jumped. Neither is survivable by standing
// still, which is the whole design.
const MAW_RING_CAP = 40;
const MAW_TOUCH_CAP = 30;

function aiMaw(e, a) {
  const bs = e.bs;
  if (!bs.rings) {
    bs.rings = [];
    bs.ringCd = 2;
    bs.touchCd = 0;
    bs.mark = -1;
  }
  bs.fx = a.ctx.effects;

  e.ringA.rotation.z += a.dt * 2.2;

  // The drag, every frame, falling off with distance. Capped in main.js well
  // under the player's own speed: running out has to stay possible.
  if (a.dist < 22 && e.status.fear <= 0) {
    a.ctx.pullPlayer(-a.nx, -a.nz, 4.2 * (1 - a.dist / 22) * (e.damage / 26));
  }

  // Rings roll outward and damage anyone standing on the ground as they pass.
  for (let i = bs.rings.length - 1; i >= 0; i--) {
    const r = bs.rings[i];
    r.r += 9 * a.dt;
    r.life -= a.dt;
    // Low fill so it reads as a travelling RING rather than a filled disc -
    // the edge is the part that hurts.
    a.ctx.effects.markSet(r.mark, e.pos.x, e.pos.z, r.r, 0x7c4dff, 0.15);
    const pd = Math.hypot(a.ctx.player.pos.x - e.pos.x, a.ctx.player.pos.z - e.pos.z);
    // Only catches a player on the ground: the jump gives about 0.8s of air
    // against a ring moving 9 m/s, which clears it comfortably if it is timed.
    if (!r.hit && Math.abs(pd - r.r) < 0.7 && a.ctx.player.pos.y < 0.6) {
      r.hit = true;
      a.ctx.onHitPlayer(Math.min(MAW_RING_CAP, e.damage * 1.54), a.ctx.player.pos, e);
    }
    if (r.life <= 0 || r.r > 24) {
      a.ctx.effects.markRelease(r.mark);
      bs.rings.splice(i, 1);
    }
  }

  bs.ringCd -= a.dt;
  if (bs.ringCd <= 0 && bs.rings.length < 3 && e.status.fear <= 0) {
    bs.ringCd = 3.2 * e.rate;
    const mk = a.ctx.effects.markAcquire();
    if (mk >= 0) bs.rings.push({ r: 1.5, life: 2.6, hit: false, mark: mk });
    _bossAt.set(e.pos.x, 0, e.pos.z);
    a.ctx.effects.burst(_bossAt, 0x7c4dff, 18, 4, 1.5, 0.6);
  }

  // Slow, and it barely chases - the pull is what closes the distance. Touch
  // damage exists only so it cannot be hugged while the rings pass overhead.
  bs.touchCd -= a.dt;
  if (a.dist < 4 && _reachY(a) < BOSS_REACH_Y && bs.touchCd <= 0) {
    bs.touchCd = 1.4 * e.rate;
    a.ctx.onHitPlayer(Math.min(MAW_TOUCH_CAP, e.damage * 0.77), e.pos, e);
    a.ctx.effects.addShake(0.15);
  }
  if (e.status.fear > 0) return;
  a.vx = a.px * a.sp;
  a.vz = a.pz * a.sp;
}

// HERALD. Blink, volley, pools, and a one-way enrage under 30% that shortens
// every cooldown at once.
const HERALD_POOL_CAP = 20;

function aiHerald(e, a) {
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

// Scratch for boss effects, reused like every other vector in this file.
const _bossAt = new THREE.Vector3();

// Scratch for the blink and for the drips the new types spawn. Module-level
// and consumed immediately, like _dripAt and _steer above.
const _blinkFwd = new THREE.Vector3();
const _blinkAt = new THREE.Vector3();
// The far end of the beam a wraith draws behind an arrival. Held separately
// from _blinkAt because both ends of the line are needed at once.
const _blinkFrom = new THREE.Vector3();

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
    this.id = ++idSeq;
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
    // Riding the player - BRINE's gulper, and nothing else. See the snap in
    // update() and aiGulper for the two inputs that shake it off.
    this.latched = false;
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
    this.hitbox.userData.enemy = this;
    this.group.add(this.hitbox);
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

  // How far above an enemy the player can be and still be hit by a melee
  // swing. `dist` is measured on the XZ plane only - the whole game collides
  // in 2D - so without this a rusher on the floor would land hits on a player
  // standing on a catwalk four metres over its head. Generous enough to still
  // cover the raised platforms, which are well inside a swing's reach.
  static MELEE_REACH_Y = 2.4;

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

    if (this.status.freeze > 0) {
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
    if (!this.flying) {
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
    if (this.latched && ctx.player) {
      // LATCHED. Snapped AFTER the move, the wall clamp, the ground and the
      // obstacle resolve, because none of those have anything to say about a
      // body that is being carried - and doing it before any of them would
      // have the floor push a gulper off the player every time they walked up
      // a step. Held just in front of them and low: the player's own position
      // is the one place a first-person camera can never look.
      ctx.player.forwardInto(_latchFwd);
      this.pos.x = ctx.player.pos.x + _latchFwd.x * GULP_HANG;
      this.pos.z = ctx.player.pos.z + _latchFwd.z * GULP_HANG;
      this.pos.y = ctx.player.pos.y;
      this.phase = false;
      this.blockedBy = 0;
    } else if (this.phase) {
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
    if (this.flying && this.status.freeze <= 0) {
      const target = Math.min(FLY_MAX_Y, this.hoverY);
      this.pos.y += (target - this.pos.y) * Math.min(1, dt * this.flyRate);
    }
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
  takeDamage(d, silent = false, dirX = 0, dirZ = 0, point = null, crit = false) {
    if (this.dead) return false;
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
    this.hp -= d;
    // WHAT THE HIT WAS WORTH, NOT WHAT THE BODY HAD LEFT. `d` here is already
    // through ward, freeze vulnerability, armour facing and the Conduit's
    // resistance, so it is the true strength of the blow - and it is NOT
    // clamped to the remaining health. A rifle hitting a body with 5hp left
    // reads 40, because 40 is what the player's gun does; clamping it to 5
    // would make every killing blow in the game report a small number and turn
    // the one hit worth celebrating into the weakest-looking one on screen.
    if (damageSink) damageSink(this.pos, d, crit);
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
const PROJ_BOUND = ARENA_HALF - 0.4;
const _projSteer = new THREE.Vector3();

const SPIT_LOOK = {
  pool: 'blight', gas: 'vitriol', ember: 'flare', hail: 'hailer', seed: 'sporegun',
  well: 'singularity',
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
    // is ground behind you and a ring is ground AROUND you.
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
