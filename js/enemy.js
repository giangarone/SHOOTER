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
import { resolveCircle, pointInObstacle, AGENT_HEIGHT, BOSS_HEIGHT } from './utils.js';

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
// Scratch vectors for that armour test. It runs once per pellet on a shotgun
// and allocating there would litter the heap through a whole magazine.
const _armorA = new THREE.Vector3();
const _armorB = new THREE.Vector3();

export const ENEMY_TYPES = {
  chaser: {
    hp: 42, speed: 3.4, damage: 12, score: 100, color: 0xff3b30, eye: 0xffe08a,
    scale: 1, radius: 0.5, mass: 1,
    melee: { windup: 0.45, start: 1.5, hit: 2.2, cd: 1.1 },
    build: buildChaser, ai: aiMelee,
  },
  shooter: {
    hp: 28, speed: 2.7, damage: 8, score: 150, color: 0xb14aed, eye: 0x4ef3ff,
    scale: 1.08, radius: 0.5, mass: 1,
    orbit: { dist: 7.5, band: 1.5, out: 1, in: -0.7, strafe: 0.5, flip: 1, flipVar: 2 },
    build: buildShooter, ai: aiShooter,
  },
  tank: {
    hp: 180, speed: 1.8, damage: 25, score: 300, color: 0xff6b00, eye: 0xffaa00,
    scale: 1.5, radius: 0.5, mass: 1,
    melee: { windup: 0.8, start: 3.5, hit: 4.0, cd: 3.0 },
    build: buildTank, ai: aiMelee,
  },
  sniper: {
    hp: 18, speed: 2.2, damage: 15, score: 200, color: 0x00ff88, eye: 0x88ffcc,
    scale: 0.9, radius: 0.5, mass: 1,
    orbit: { dist: 22, band: 2, out: 0.8, in: -0.5, strafe: 0.4, flip: 2, flipVar: 3 },
    build: buildSniper, ai: aiSniper,
  },
  splitter: {
    hp: 30, speed: 3.0, damage: 10, score: 120, color: 0xff00aa, eye: 0xff88dd,
    scale: 1.0, radius: 0.5, mass: 1,
    melee: { windup: 0.4, start: 1.4, hit: 2.0, cd: 1.0 },
    build: buildSplitter, ai: aiSplitter,
  },
  bomber: {
    hp: 35, speed: 2.0, damage: 18, score: 180, color: 0xff4400, eye: 0xff8844,
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
    hp: 26, speed: 4.2, damage: 11, score: 190, color: 0x6f5bff, eye: 0xd0c4ff,
    scale: 0.95, radius: 0.45, mass: 1,
    melee: { windup: 0.35, start: 1.4, hit: 2.0, cd: 0.9 },
    build: buildWraith, ai: aiWraith,
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
    hp: 110, speed: 1.6, damage: 18, score: 280, color: 0x8d9db6, eye: 0xffd54f,
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

  // Punishes shooting whatever is closest. It has no attack at all - it makes
  // everything around it tougher and faster, and draws a line to each one so
  // the player can see exactly what killing it would undo.
  conduit: {
    hp: 55, speed: 2.2, damage: 0, score: 320, color: 0x00e5b0, eye: 0xa7ffe8,
    scale: 1.15, radius: 0.5, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.8, in: -0.6, strafe: 0.35, flip: 2, flipVar: 2 },
    build: buildConduit, ai: aiConduit,
  },

  // Punishes holding one good spot. Lobs pools that make the floor where you
  // are standing cost health, so the answer is always to give up the position.
  // Does no direct damage: the ground it leaves behind is the whole threat.
  blight: {
    hp: 48, speed: 1.9, damage: 0, score: 240, color: 0x7ac943, eye: 0xd6ff8a,
    scale: 1.15, radius: 0.55, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
    build: buildBlight, ai: aiBlight,
  },

  // Punishes running the same line the enemy is running. It walks toward the
  // player like a chaser and burns the floor behind it, so the ground it has
  // crossed stays dangerous for five seconds. Slower and weaker in melee than
  // a chaser, because the trail is where its threat actually lives - and the
  // trail is the reason to break off and take an angle rather than backpedal
  // in a straight line.
  magma: {
    hp: 52, speed: 2.7, damage: 9, score: 210, color: 0xff5a1f, eye: 0xffd166,
    scale: 1.05, radius: 0.52, mass: 1,
    melee: { windup: 0.5, start: 1.5, hit: 2.2, cd: 1.3 },
    build: buildMagma, ai: aiMagma,
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
    hp: 70, speed: 2.0, damage: 0, score: 360, color: 0x9aa5b1, eye: 0xfff2b0,
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
    hp: 30, speed: 3.9, damage: 5, score: 200, color: 0xff7a18, eye: 0xffd166,
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
    hp: 58, speed: 2.5, damage: 8, score: 220, color: 0x63b3ff, eye: 0xd8f0ff,
    scale: 1.05, radius: 0.52, mass: 1,
    melee: { windup: 0.55, start: 1.5, hit: 2.2, cd: 1.4 },
    build: buildRime, ai: aiRime,
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
    hp: 130, speed: 1.5, damage: 14, score: 300, color: 0x8fbf4a, eye: 0xd6ff8a,
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
    hp: 46, speed: 1.9, damage: 0, score: 260, color: 0x4fe06a, eye: 0xd6ffb0,
    scale: 1.12, radius: 0.55, mass: 1,
    orbit: { dist: 12, band: 2, out: 0.7, in: -0.5, strafe: 0.3, flip: 2.5, flipVar: 2 },
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
    hp: 60, speed: 2.1, damage: 0, score: 340, color: 0xb06bff, eye: 0xffd6ff,
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
    hp: 58, speed: 2.2, damage: 0, score: 380, color: 0xff2d6f, eye: 0xffd6e4,
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
    hp: 62, speed: 3.2, damage: 0, score: 340, color: 0x27c4ff, eye: 0xd7f4ff,
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
    hp: 54, speed: 4.4, damage: 20, score: 300, color: 0xeef2ff, eye: 0xff5c7a,
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
    hp: 46, speed: 4.6, damage: 6, score: 320, color: 0xb06bff, eye: 0xf0d6ff,
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
    hp: 130, speed: 0, damage: 0, score: 120, color: 0x6d4c2f, eye: 0xff5a00,
    scale: 1.15, radius: 0.5, mass: 6,
    hitbox: { r: 0.55, y: 0.6 },
    // It is a machine bolted to the floor: nothing lands on it, nothing scares
    // it, and freezing or slowing something that never moves means nothing.
    statusMul: 0.5, fearMode: 'stagger', entropyExempt: true,
    build: buildTurret, ai: aiTurret, cleanup: releaseTurret,
  },

  colossus: {
    hp: 3600, speed: 2.0, damage: 34, score: 4000, color: 0x8c5a2b, eye: 0xffb300,
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
    build: buildColossus, ai: aiColossus,
    cleanup: releaseMarks,
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
    hp: 3200, speed: 2.9, damage: 22, score: 5000, color: 0x455a64, eye: 0xff5533,
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

  // Splits at half health and again at a quarter, one into two into four. The
  // health here is HALF the fight's pool: the player deals 0.5H to force the
  // first split, 0.5H for the second and a full H to finish the four, so
  // clearing it costs 2x this number. See the sanity check in waves.js.
  schism: {
    hp: 1550, speed: 3.0, damage: 18, score: 6000, color: 0xd500f9, eye: 0xffb0ff,
    scale: 2.2, radius: 1.3, mass: 5, boss: true,
    hitbox: { r: 0.7, y: 0.8 },
    statusMul: 0.35, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1.0,
    entropyExempt: true, fearMode: 'stagger',
    melee: { windup: 0.55, start: 2.6, hit: 3.2, cd: 1.6 },
    build: buildSchism, ai: aiSchism,
  },

  // A gravity well that will not let the player leave. It drags them in
  // continuously and rolls rings outward along the floor that have to be
  // JUMPED - the one boss that asks for a control the game has barely used.
  maw: {
    hp: 3300, speed: 1.2, damage: 26, score: 7000, color: 0x311b92, eye: 0x7c4dff,
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
    hp: 3400, speed: 2.8, damage: 20, score: 9000, color: 0xffd54f, eye: 0xfff8e1,
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
// Applied by the single-tier mutations in upgrades.js. A hit REFRESHES a
// status, it never stacks one: mutations have no second level, so there is no
// stronger poison to express. Duration is seconds remaining, counted down in
// update().
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

const MAGMA_DROP_INTERVAL = 0.42;
const MAGMA_PATCH_RADIUS = 1.5;
const MAGMA_PATCH_LIFE = 5;
const MAGMA_PATCH_DPS = 12;
// Scratch for the drip's spawn point. Module-level and reused: the drip runs
// for every afflicted enemy several times a second.
const _dripAt = new THREE.Vector3();
// The hex beam's two ends. Module-level and consumed immediately: the beam is
// redrawn every frame of a two-second channel and allocating there would
// litter the heap through the whole fight.
const _hexFrom = new THREE.Vector3();
const _hexTo = new THREE.Vector3();
// Scratch for the navigation heading. Module-level and consumed immediately:
// every enemy asks for one every frame.
const _steer = { x: 0, z: 0 };
// Petrify's reward: a frozen enemy cannot act, and takes half again as much.
const FREEZE_VULN = 1.5;

// ---- flight ---------------------------------------------------------------
// How fast a flier closes the gap between its current altitude and the one its
// ai() is asking for, as an exponential-approach rate. Per-enemy, because the
// difference between a shrike FALLING out of the sky and a harrier settling
// back to station is the whole distinction between the two types.
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
    this.score = def.score;
    // What this body is WORTH IN CREDITS, when that cannot be derived from its
    // score. Null for everything the waves spawn - main.js reads the score and
    // one rate, so the two curves cannot drift apart. It exists for the things
    // that score nothing and are still meant to pay: a splitter's children.
    this.bounty = null;
    // Set by the player's melee when a swing is what killed this body, and
    // read once by the death sweep in main.js - see MELEE_KILL_MULT. It lives
    // here rather than in a set on the game so that it dies with the enemy.
    this.meleeKill = false;
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
    // Damage-over-time rates, kept per source so a player carrying both Venom
    // and Incendiary gets both, rather than the larger of the two.
    this._dps = { poison: 0, burn: 0 };
    this._dotAcc = 0;
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
  //   status  poison, fire, ice - the tint the mutations put on it
  //   base    its own colour
  //
  // `_look` is what is currently on the material, so a frame that changes
  // nothing writes nothing.
  _applyBodyLook() {
    const want = this._flashOn ? 'flash' : this.wardT > 0 ? 'ward' : this._dominantTint();
    if (want === this._look) return;
    this._look = want;
    if (want === 'flash') {
      this.bodyMat.color.setHex(this.colorHex);
      this.bodyMat.emissive.setHex(BODY_FLASH_HEX);
      this.bodyMat.emissiveIntensity = BODY_FLASH_INTENSITY;
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
   * @param {number} power damage per second, for 'poison' and 'burn' only
   */
  applyStatus(kind, dur, power = 0) {
    if (this.dead || !(kind in this.status)) return;
    // RESISTANCE. Only types that ask for it are affected; at statusMul 1 with
    // no freezeSlow this whole block is skipped and the method behaves exactly
    // as it always has.
    if (this.statusMul < 1) {
      // A boss that can be stopped outright is not a fight - a three second
      // Petrify would be a free damage window on every magazine. Freeze
      // becomes a heavy slow instead, so the mutation still does something.
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
    if (power > 0 && kind in this._dps) this._dps[kind] = Math.max(this._dps[kind], power);
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
    // enemy is the whole point of the mutation and on a boss would mean a
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
        if (k in this._dps) this._dps[k] = 0;
      } else {
        any = true;
      }
    }

    // Damage accrues as a float and is dealt in whole points, so a 12 dps
    // poison is twelve separate ticks a second rather than a fractional nibble
    // every frame. `silent` keeps it from firing the white hit flash, which
    // would strobe over the status tint for as long as the status lasts.
    const dps = (this.status.poison > 0 ? this._dps.poison : 0)
      + (this.status.burn > 0 ? this._dps.burn : 0);
    if (dps > 0) {
      this._dotAcc += dps * dt;
      if (this._dotAcc >= 1) {
        const whole = Math.floor(this._dotAcc);
        this._dotAcc -= whole;
        this.takeDamage(whole, true);
        if (this.dead) return;
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
    if (nav && nav.steer(this.pos.x, this.pos.z, _steer)) {
      px = _steer.x;
      pz = _steer.z;
    }

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
    resolveCircle(this.pos, this.radius, ctx.obstacles, this.collideH);
    // Distance collision had to move it back this frame, walls included. A
    // charging boss reads it to know it slammed into something, which is
    // cheaper and more reliable than any extra geometry: the obstacle test has
    // already done the work.
    this.blockedBy = Math.hypot(this.pos.x - ix, this.pos.z - iz) + (hitWall ? 1 : 0);

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
    if (this.flying && this.status.freeze <= 0) {
      const target = Math.min(FLY_MAX_Y, this.hoverY);
      this.pos.y += (target - this.pos.y) * Math.min(1, dt * this.flyRate);
    }
    const bob = this.status.freeze > 0 ? 0 : this._dance * amp + sway;
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.group.rotation.y = Math.atan2(-dx, -dz);

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
  takeDamage(d, silent = false, dirX = 0, dirZ = 0, point = null) {
    if (this.dead) return false;
    // A warded enemy takes NOTHING - not bullets, not blasts, not the damage
    // over time already ticking on it. A partial reduction here would leave
    // the player unsure whether their shots were working, which is the one
    // thing the warden must never be ambiguous about.
    if (this.wardT > 0) return false;
    if (this.status.freeze > 0) d *= this.freezeVuln;
    // ARMOUR. `dirX, dirZ` is the direction the hit TRAVELLED, which is what
    // decides whether it landed on a shield or a weak point. Callers that have
    // no direction to give - damage over time, blasts, ash - pass nothing and
    // get armorDefault, and each type chooses what that means: a Bulwark's
    // shield does not stop poison (armorDefault 1) while a Colossus's plating
    // does (armorDefault 0.22).
    const def = ENEMY_TYPES[this.type];
    if (def.armor) {
      d *= (dirX || dirZ || point) ? def.armor(this, dirX, dirZ, point) : def.armorDefault;
    }
    if (this.buffT > 0) d *= CONDUIT_RESIST;
    this.hp -= d;
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
  dispose() {
    // A boss killed mid-telegraph is still holding a mark from the effects
    // pool, and that pool is only ten deep - leaking one every fight would
    // eventually leave later bosses unable to warn the player at all.
    const def = ENEMY_TYPES[this.type];
    if (def.cleanup) def.cleanup(this);
    this.bodyMat.dispose();
    this.eyeMat.dispose();
    for (const m of this._extraMats) m.dispose();
    this._extraMats.length = 0;
    this.hitbox.userData.enemy = null;
  }
}

// ---- projectiles ---------------------------------------------------------
// Same story as enemies: one geometry and one material set per projectile
// type, reused for every shot fired.
const PROJ_COLORS = {
  shooter: { core: 0xd08bff, glow: 0xb14aed, scale: 0.75 },
  sniper: { core: 0x88ffcc, glow: 0x00ff88, scale: 0.5 },
  // The blight's spit and the pool it leaves wear the same toxic green, so the
  // glob in the air and the patch it becomes are obviously one thing.
  blight: { core: 0xd6ff8a, glow: 0xaaff2a, scale: 1.3 },
  // The vitriol's canister, in the gas's own green rather than the blight's
  // acid yellow-green. The two lobs have to be told apart IN THE AIR - one is
  // ground to step off and the other is a cloud to not be in - and the colour
  // is the only thing available while it is still flying.
  vitriol: { core: 0xd6ffb0, glow: 0x4fe06a, scale: 1.4 },
  // Colossus fires only through its open vent, so the round wears the core's
  // own heat rather than the generic shooter purple.
  colossus: { core: 0xffd08a, glow: 0xff5a00, scale: 1.1 },
  // Colossus's colour, a size down: a turret's round has to read as coming
  // from the boss's own machinery and not as a shooter that wandered in.
  turret: { core: 0xffc27a, glow: 0xff5a00, scale: 0.8 },
  // The harrier's burst. Small and cold - it arrives from above, so it is read
  // against the floor rather than against the skyline, and the pale core is
  // what makes it visible down there.
  harrier: { core: 0xd7f4ff, glow: 0x27c4ff, scale: 0.65 },
  // Schism's radial volley, in the boss's own violet. Eight of these are in
  // the air at once, so they are small: a fan of shooter-sized rounds reads as
  // a wall and there would be no gap to move through.
  schism: { core: 0xffb0ff, glow: 0xd500f9, scale: 0.6 },
};
const projMats = new Map();

function projectileMats(type, glowTex) {
  let m = projMats.get(type);
  if (!m) {
    const c = PROJ_COLORS[type] || PROJ_COLORS.shooter;
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

    const mats = projectileMats(type, glowTex);
    this.mesh = new THREE.Mesh(geo('projectile', () => new THREE.SphereGeometry(0.1, 8, 8)), mats.core);
    const sp = new THREE.Sprite(mats.glow);
    sp.scale.setScalar(mats.scale);
    this.mesh.add(sp);
    this.mesh.position.copy(this.pos);
    scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'expired';
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    if (this.pos.distanceTo(ctx.player.eyeInto(_tmpTarget)) < 0.7) {
      ctx.onHitPlayer(this.damage, this.pos);
      return 'hit';
    }
    if (this.pos.y <= 0.03) return 'wall';
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
    this.type = kind === 'gas' ? 'vitriol' : 'blight';

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
    if (ctx.addHazard) {
      ctx.addHazard(this.pos.x, this.pos.z, this.radius, this.poolLife, this.dps, this.kind);
    }
    // The splash wears the glob's own colour, so the moment it lands says
    // which of the two it was.
    if (ctx.effects) {
      ctx.effects.burst(this.pos, this.kind === 'gas' ? 0x4fe06a : 0xaaff2a, 14, 4, 2, 0.45);
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
