// THINGS THE PLAYER PUTS IN THE ARENA AND THEN STOPS OWNING.
//
// Seven of the active items do not do something to the world, they LEAVE
// something in it: a turret that picks its own targets, a mine that waits, a
// wall that burns, a singularity that pulls, five bees, a bomb on a fuse, and
// a sky full of rocks. What they have in common is that the player has already
// walked away by the time they matter.
//
// THE CONTRACT IS THE PROJECTILE'S, because the game already had one and a
// second one would be a second thing to keep in step. Every class here is:
//
//     constructor(game, ...)          adds its meshes to the scene
//     update(dt, ctx) -> 'alive'|'dead'
//     destroy()                       takes them out again, and disposes
//
// which is exactly what Projectile, Spit, Shard and Grenade in enemy.js do -
// so main.js drives this list with the same eight lines it drives that one
// with, and _clearHazards sweeps it the same way it sweeps the pools.
//
// GEOMETRY IS PER INSTANCE AND DISPOSED. That is NOT the contract rig.js works
// under: the "never allocate after startup" rule there is about LIGHTS, whose
// count is baked into every shader program in the scene. A mesh is not a
// light. Grenade and Shard already build and drop their own, and at most a
// dozen of these exist at once.
//
// DAMAGE GOES THROUGH ctx.onBlast AND ctx.hurtEnemy, NEVER INLINE. Radial
// falloff, the enemy list and the death sweep all live in main.js, and a
// second copy of any of them here would be one more place for the two to
// disagree. The one thing a deployable decides for itself is WHO it is willing
// to hurt - a mine's blast catches the player and a meteor's does not, and
// that is the difference between the two items, not an oversight in one.

import * as THREE from 'three';
import { pointInObstacle, segmentClear, groundSurface } from './utils.js';
import { BOUND } from './arena.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// One additive sprite. Every one of these wants a soft blob of light
// somewhere, and every one of them wants it built the same way.
function glow(tex, color, size, opacity = 1) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.setScalar(size);
  return sp;
}

function emissive(color, intensity = 1.4) {
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity,
    roughness: 0.4, metalness: 0.3,
  });
}

/**
 * The nearest living enemy to a point, optionally requiring a clear line to
 * it. Used by everything here that picks its own target.
 *
 * LINE OF SIGHT IS THE TURRET'S RULE AND NOT THE BEE'S, deliberately. A turret
 * fires a straight line and would otherwise shoot through a pillar; a bee
 * flies, and a bee that refused to go round a crate would sit still next to
 * one for twelve seconds.
 */
function nearest(enemies, x, z, maxD, obstacles = null, standY = -Infinity) {
  let best = null;
  let bestD = maxD * maxD;
  for (const e of enemies) {
    if (e.dead) continue;
    const dx = e.pos.x - x;
    const dz = e.pos.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= bestD) continue;
    // `standY` is what stops a gun placed ON the arena's geometry from being
    // blind: see the note on segmentClear.
    if (obstacles && !segmentClear(x, z, e.pos.x, e.pos.z, 0.2, obstacles, standY)) continue;
    bestD = d2;
    best = e;
  }
  return best;
}

// WHAT A DEPLOYED THING IS STANDING ON.
//
// Everything in this file used to be placed at world y ZERO, on the assumption
// that the arena has one floor. It does not: it has platforms, ramps and stairs
// that the player fights on all the time. A turret thrown onto a platform was
// built three metres underneath it - buried, usually invisible, and unable to
// shoot, because target acquisition is an XZ line test (see `nearest`) and a
// gun inside a stair reads every line out of it as blocked by that stair.
//
// `fromY` is where the thing that placed it was: the lob at the top of its
// fall, or the player's own feet. Asked from a little above that, with a
// generous step, so a throw that lands on a tread settles onto the tread.
function standOn(game, x, z, fromY = 0) {
  const obstacles = game.arena && game.arena.obstacles;
  if (!obstacles) return 0;
  return groundSurface({ x, y: fromY + 0.4, z }, 0.4, obstacles, 1.2);
}

// ---------------------------------------------------------------------------
// LITTLE BROTHER - the turret
// ---------------------------------------------------------------------------
//
// It is a SECOND GUN, not a second player: it has no legs, no target priority
// worth the name and no opinion about being shot at. What it buys is the one
// thing the player cannot buy any other way - fire coming from somewhere they
// are not - and the whole item is the decision of where to put it.
//
// IT DOES NOT LEAD ITS TARGET. A turret that predicted movement would out-aim
// the player, and the player is the one holding the interesting gun.
export class Turret {
  constructor(game, x, z, damage, fromY = 0) {
    this.pos = new THREE.Vector3(x, standOn(game, x, z, fromY), z);
    // ONE OF THE PLAYER'S OWN SHOTS PER ROUND, snapshotted when the turret is
    // set down rather than read live: the thing was built out of the gun the
    // player was holding at the time, and a turret that quietly got stronger
    // because a totem was claimed while it was standing would be a second
    // weapon nobody is aiming.
    this.damage = damage;
    // FIFTEEN, NOT TWENTY. Not a balance number: an item's readout must never
    // state its charge time (see the note at the top of js/items.js), and a
    // turret that lived exactly as long as its cooldown would print "FOR 20s"
    // on the box's card for a twenty-second item - which is the one number the
    // player is meant to learn by carrying the thing. Fifteen also means the
    // slot is genuinely empty for a few seconds between turrets, so a second
    // one is a decision rather than an upkeep.
    this.life = 15;
    // WHERE THE PULSE STOOD WHEN THIS WAS SET DOWN. It fires on the edge, so a
    // turret placed mid-beat waits for the next one rather than firing
    // instantly and then again a fraction of a second later - see Music.pulse.
    this._lastPulse = -1;
    // Seconds since the last shot, for the barrel heat alone.
    this.since = 9;
    this.yaw = 0;
    this.dead = false;

    const g = new THREE.Group();
    // LIGHTER THAN THE GUN. The viewmodel can be near-black because it is a
    // metre from the camera under its own light; a turret is a knee-high box
    // twenty metres away in a room lit by fixtures that mostly point somewhere
    // else, and at the receiver's own 0x1c212c it was a hole in the floor. The
    // player has to be able to find the thing they placed.
    const dark = new THREE.MeshStandardMaterial({
      color: 0x5a657f, roughness: 0.45, metalness: 0.55,
    });
    // Three legs and a drum, so it reads as DEPLOYED - something that was
    // carried here and put down - rather than as a prop that was always here.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), dark);
      leg.position.set(Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22);
      leg.rotation.z = Math.cos(a) * 0.3;
      leg.rotation.x = -Math.sin(a) * 0.3;
      g.add(leg);
    }
    this.head = new THREE.Group();
    this.head.position.y = 0.62;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.26, 8), dark);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.5), dark);
    barrel.position.z = -0.3;
    this.eye = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), emissive(0xffab40, 2.6));
    this.eye.position.set(0, 0.07, -0.18);
    // The halo is what actually finds it across the arena - an emissive sphere
    // eleven centimetres across is two pixels at range, and two pixels is not
    // a thing the player can see they own.
    this.halo = glow(game.effects.glowTex, 0xffab40, 1.1, 0.7);
    this.halo.position.copy(this.eye.position);
    this.head.add(body, barrel, this.eye, this.halo);
    this.muzzle = new THREE.Vector3();
    g.add(this.head);
    g.position.copy(this.pos);
    this.group = g;
    this.geos = [];
    g.traverse((o) => { if (o.geometry) this.geos.push(o.geometry); });
    this.mats = [dark, this.eye.material, this.halo.material];
    game.scene.add(g);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'dead';
    const target = nearest(ctx.enemies, this.pos.x, this.pos.z, 26, ctx.obstacles, this.pos.y);
    if (target) {
      // Snaps rather than eases onto a new target. The eye is the only tell
      // the player has that it has seen something, and a turret that swung
      // slowly onto a rusher would still be turning when the rusher arrived.
      this.yaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
      this.head.rotation.y = this.yaw + Math.PI;
    }
    // The barrel glows off the beat it fires on, so a turret with nothing to
    // shoot at is visibly idle rather than visibly broken - and one that IS
    // shooting pulses in time with the music the player is hearing.
    this.since += dt;
    const heat = target ? 1.6 * Math.max(0, 1 - this.since / 0.3) : 0;
    this.eye.material.emissiveIntensity = 1.4 + heat;
    this.halo.material.opacity = 0.45 + heat * 0.35;
    // TWICE A BEAT, ON THE DOWNBEAT AND THE UPBEAT. It used to run on a private
    // 0.33s timer, which meant a room full of turrets was a wash of unrelated
    // clicks over the top of the soundtrack. On the pulse they land together,
    // with the music and with each other, and the arena sounds like one machine.
    const first = this._lastPulse < 0;
    if (ctx.pulse === this._lastPulse) return 'alive';
    this._lastPulse = ctx.pulse;
    if (!target || first) return 'alive';
    this.since = 0;
    this.muzzle.set(
      this.pos.x - Math.sin(this.yaw) * 0.5, this.pos.y + 0.68,
      this.pos.z - Math.cos(this.yaw) * 0.5
    );
    _v.copy(target.pos).setY(target.pos.y + 0.9);
    ctx.effects.tracer(this.muzzle, _v);
    ctx.effects.flash(this.muzzle);
    ctx.hurtEnemy(target, this.damage);
    ctx.sfx.turret();
    // A shallow blink DOWN on the shot rather than a flare up: the flash at
    // the muzzle is already the bright thing, and two bright things on the
    // same frame is one too many.
    this.eye.material.emissiveIntensity = 0.8;
    return 'alive';
  }

  destroy() {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------------------
// WELCOME MAT - the mine
// ---------------------------------------------------------------------------
//
// THE PLAYER CANNOT SET IT OFF BY STANDING ON IT, AND CAN STILL BE KILLED BY
// IT. That is not a contradiction, it is the whole item: the trigger belongs
// to the enemy and the blast belongs to the room. A mine you could safely
// stand next to is a free 120 damage on a 6m circle; a mine that went off
// under your own feet would make the item unplaceable in the half of the arena
// worth placing it in.
//
// IT ARMS AFTER HALF A SECOND. It is thrown now rather than dropped - see Lob -
// so it usually lands clear of whatever is chasing the player, but it can still
// be lobbed into a body at contact range, and a mine armed on frame one would
// make that a suicide button.
export class Mine {
  constructor(game, x, z, damage, fromY = 0) {
    this.pos = new THREE.Vector3(x, standOn(game, x, z, fromY) + 0.06, z);
    // FIVE OF THE PLAYER'S OWN SHOTS, snapshotted when it is thrown for the
    // same reason the turret's is: it was built out of the gun in hand.
    this.damage = damage;
    this.arm = 0.5;
    this.life = 45;
    this.blink = 0;
    this.dead = false;

    const g = new THREE.Group();
    const shell = new THREE.MeshStandardMaterial({
      color: 0x6b5a4a, roughness: 0.65, metalness: 0.4,
    });
    this.lampMat = emissive(0xff7043, 2.0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.12, 10), shell);
    this.lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), this.lampMat);
    this.lamp.position.y = 0.11;
    g.add(body, this.lamp);
    // Three prongs, because a disc on the floor at this size is a manhole
    // cover. The prongs are what say the thing is waiting for a foot.
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const pin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.05), shell);
      pin.position.set(Math.cos(a) * 0.22, 0.13, Math.sin(a) * 0.22);
      g.add(pin);
    }
    this.halo = glow(game.effects.glowTex, 0xff7043, 1.0, 0.5);
    this.halo.position.y = 0.12;
    g.add(this.halo);

    // THE RING IS THE MINE'S OWN MESH, NOT A POOLED TELEGRAPH. It is the only
    // part of this readable from across the arena and the part that matters -
    // it is exactly the blast radius, so the player can see what they are
    // standing inside - and it has to be up for the mine's whole life. The
    // telegraph pool is ten deep and shared with every boss warning in the
    // game; a mine sitting on one of those slots for forty-five seconds would
    // eventually leave a boss unable to announce a charge.
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xff7043, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(5.75, 6, 48), this.ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = -0.04;
    g.add(this.ring);

    g.position.copy(this.pos);
    this.group = g;
    this.geos = [];
    g.traverse((o) => { if (o.geometry) this.geos.push(o.geometry); });
    this.mats = [shell, this.lampMat, this.halo.material, this.ringMat];
    this.effects = game.effects;
    game.scene.add(g);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'dead';
    if (this.arm > 0) this.arm -= dt;
    // The blink accelerates as it arms and then holds steady, so "live" and
    // "not live yet" are two different rhythms rather than two colours nobody
    // is looking at.
    this.blink += dt * (this.arm > 0 ? 4 : 9);
    const pulse = 0.5 + 0.5 * Math.sin(this.blink);
    this.lampMat.emissiveIntensity = 0.6 + pulse * 2.4;
    this.halo.material.opacity = 0.18 + pulse * 0.3;
    this.ringMat.opacity = (this.arm > 0 ? 0.1 : 0.16) + pulse * 0.16;
    if (this.arm > 0) return 'alive';
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.pos.x;
      const dz = e.pos.z - this.pos.z;
      if (dx * dx + dz * dz > (1.6 + e.radius) * (1.6 + e.radius)) continue;
      this.detonate(ctx);
      return 'dead';
    }
    return 'alive';
  }

  detonate(ctx) {
    _v.set(this.pos.x, 0, this.pos.z);
    // hitPlayer true: see the note at the top of the class.
    ctx.onBlast(_v, this.damage, 6, null, true);
    ctx.effects.burst(this.pos, 0xffd166, 26, 9, 4, 0.5);
    ctx.effects.burst(this.pos, 0xff7043, 34, 6, 6, 0.7);
    ctx.effects.shockwave(this.pos, 0xff7043, 6, 0.5);
    ctx.effects.addShake(0.35);
    ctx.sfx.itemBlast();
  }

  destroy() {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------------------
// SHORT FUSE - the bomb
// ---------------------------------------------------------------------------
//
// Thrown on the Bomber's own arc, and it hurts the player for the same reason
// the Bomber's does: three seconds is a long time to be told to move, and an
// item that could be dropped at your own feet for free would never be thrown
// anywhere else.
export class Bomb {
  /**
   * @param {number} damage  at the centre of the blast
   * @param {number} radius  metres it reaches
   * @param {boolean} hurtsPlayer  whether the player is inside their own
   *   blast. TRUE for SHORT FUSE, which is a thing the player aimed and threw:
   *   a grenade you can outrun is not a grenade. FALSE for PRIMED MAG, which
   *   goes out on a RELOAD - a button pressed for an entirely different reason
   *   - and a passive item that killed the player for reloading in a corridor
   *   would be one nobody could take.
   * @param {number} fuse  seconds before it goes off
   */
  constructor(game, x, y, z, dirX, dirZ,
    damage = 180, radius = 8, hurtsPlayer = true, fuse = 3) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(dirX, 0, dirZ).normalize().multiplyScalar(11);
    this.vel.y = 6.5;
    this.damage = damage;
    this.radius = radius;
    this.hurtsPlayer = hurtsPlayer;
    this.fuse = fuse;
    this.dead = false;
    this.spin = new THREE.Vector3(Math.random(), Math.random(), Math.random());

    this.mat = emissive(0x1c1f26, 0.2);
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), this.mat);
    this.spark = glow(game.effects.glowTex, 0xffd166, 0.9);
    this.spark.position.set(0, 0.3, 0);
    this.mesh.add(this.spark);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.effects = game.effects;
  }

  update(dt, ctx) {
    this.fuse -= dt;
    // The fuse spark tightens and brightens as the clock runs out. This is the
    // only warning anything gets, so it has to be legible from the far side of
    // the room - and it has to be a RATE, not a colour, because the last
    // second is what the player is timing their exit against.
    const t = Math.max(0, this.fuse);
    const beat = Math.sin(t * (8 + (3 - t) * 9));
    this.spark.material.opacity = 0.5 + 0.5 * Math.max(0, beat);
    this.spark.scale.setScalar(0.7 + 0.5 * Math.max(0, beat) * (3 - t) * 0.5);
    if (this.fuse <= 0) {
      this.explode(ctx);
      return 'dead';
    }
    if (this.pos.y > 0.28 || this.vel.y > 0) {
      this.vel.y -= 22 * dt;
      this.pos.addScaledVector(this.vel, dt);
      this.mesh.rotation.x += this.spin.x * dt * 6;
      this.mesh.rotation.z += this.spin.z * dt * 6;
      if (this.pos.y <= 0.28) {
        this.pos.y = 0.28;
        // One bounce, damped hard, and then it settles. A bomb that rolled
        // would end up somewhere the player did not choose.
        this.vel.multiplyScalar(0.28);
        this.vel.y = Math.abs(this.vel.y) * 0.35;
        if (this.vel.y < 1.2) this.vel.set(0, 0, 0);
      }
      if (pointInObstacle(this.pos, ctx.obstacles)) {
        this.pos.addScaledVector(this.vel, -dt);
        this.vel.set(0, 0, 0);
      }
      this.mesh.position.copy(this.pos);
    }
    return 'alive';
  }

  explode(ctx) {
    _v.set(this.pos.x, 0, this.pos.z);
    ctx.onBlast(_v, this.damage, this.radius, null, this.hurtsPlayer);
    // The spectacle is scaled off the RADIUS, so a thrown magazine reads as
    // the small bang it is and SHORT FUSE keeps the one it always had. A blast
    // that looked the same size whatever it reached would be the game lying
    // about where it is safe to stand.
    const k = this.radius / 8;
    ctx.effects.burst(this.pos, 0xffe9a8, 30, 12 * k, 5 * k, 0.55);
    ctx.effects.burst(this.pos, 0xff6f00, 42, 8 * k, 7 * k, 0.8);
    ctx.effects.shockwave(this.pos, 0xff6f00, this.radius, 0.6);
    ctx.effects.addShake(0.5 * Math.min(1, k));
    ctx.sfx.itemBlast();
  }

  destroy() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.spark.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// ORGAN GRINDER - the monkey
// ---------------------------------------------------------------------------
//
// THE ONLY THING IN THE GAME THAT TAKES THE PLAYER OUT OF THE FIGHT WITHOUT
// MOVING THEM. Every other answer to being surrounded is about where the
// PLAYER is - the dash, the shove, the wall, the invulnerability window. This
// one is about where the enemies are looking, and for five seconds the answer
// is: not at you. A player standing perfectly still in the middle of a crowd
// while the crowd walks past them is a thing this game could not previously
// show, and it is worth a whole item on its own.
//
// IT CANNOT BE DAMAGED, AND THAT IS NOT AN OVERSIGHT. A decoy with health is a
// decoy whose duration is decided by the wave rather than by the item: on wave
// three it would outlive its fuse and on wave thirty it would be gone in half a
// second, and the player would have no way to tell which run they were in. Five
// seconds is five seconds. It is also not an enemy, not on the enemy list, and
// not shootable by the player - there is nothing here to raycast against.
//
// THE FUSE IS THE FEATURE, exactly as it is for SHORT FUSE. The difference is
// which way round the decision goes: a bomb is thrown where the fight is GOING
// to be, and a monkey is thrown where the player WANTS it to be, because the
// fight comes to it. Five seconds is long enough to walk somewhere else and
// short enough that the crowd it gathered is still gathered when it goes off.
//
// WHO IT PULLS is not decided here. main.js swaps one field on the enemy
// context while a monkey is on the floor - see the LURE block in
// _updateEnemies - so no enemy type, ai() or boss needs to know this exists.
export class Monkey {
  /**
   * @param {object} game
   * @param {THREE.Vector3} from   the muzzle, so it leaves the gun
   * @param {THREE.Vector3} dir    flattened facing
   * @param {number} damage        the blast, snapshotted at the throw
   */
  constructor(game, from, dir, damage) {
    this.pos = new THREE.Vector3(from.x, from.y, from.z);
    this.vel = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(11);
    this.vel.y = 6.5;
    this.damage = damage;
    this.dead = false;
    // THE FUSE DOES NOT START UNTIL IT LANDS. A monkey thrown across the room
    // spends most of a second in the air, and a five-second item that spent a
    // fifth of itself in flight would be a four-second item that reads as
    // broken at long range. `armed` is also what main.js tests for the lure -
    // a monkey still tumbling is not yet something to walk toward.
    this.armed = false;
    this.fuse = MONKEY_FUSE;
    this.spin = Math.random() * 6;
    // ---- WHAT THE ENEMIES ARE HANDED INSTEAD OF THE PLAYER ----------------
    //
    // A DUCK, AND IT HAS TO BE A COMPLETE ONE. main.js swaps this in for
    // `ctx.player` on the enemy context (see the LURE block in
    // _updateEnemies), which is how forty behaviours, four bosses and every
    // projectile in the game come to be aimed at a toy without one of them
    // being told the item exists. The price of that trick is that EVERY member
    // enemy.js reads off the player has to be here.
    //
    // THE FIRST VERSION CARRIED TWO - `pos` and `eyeInto` - because a grep for
    // `ctx.player.` found only those, and a wraith blinking behind the player
    // reads it through a local alias (`const p = ctx.player; p.forwardInto(…)`)
    // that the grep never saw. It threw inside the enemy sweep, which is inside
    // rAF, which never reschedules: the game stopped dead. So the list below is
    // deliberately the player's whole movement-facing surface rather than the
    // members something happens to use today, and anything added to it should
    // stay that way.
    //
    //   pos          where it is. The one thing everything reads.
    //   vel          zero, always. A monkey does not move, so a siege leading
    //                its mortars onto the decoy leads them nowhere - which is
    //                the correct answer and not a stub.
    //   yaw          which way it landed facing, from land().
    //   forwardInto  the same expression Player's is, off that yaw, so a wraith
    //                blinks BEHIND the monkey.
    //   eyeInto      what a shooter aims at. MONKEY_EYE rather than the
    //                monkey's own centre: a shooter aiming at a knee-high
    //                object fires into the floor in front of it, and rounds
    //                skipping off the ground read as the enemies missing rather
    //                than as them being fooled.
    //   eyeH         for anything that reconstructs an eye from feet + height.
    const self = this;
    this.decoy = {
      pos: this.pos,
      vel: new THREE.Vector3(),
      get yaw() { return self._yaw; },
      eyeH: MONKEY_EYE,
      eyeInto: (v) => v.copy(self.pos).setY(MONKEY_EYE),
      forwardInto: (v) => v.set(-Math.sin(self._yaw), 0, -Math.cos(self._yaw)),
    };
    this.lure = true;

    this.group = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    const fur = own(new THREE.MeshStandardMaterial({
      color: 0x4a3b52, roughness: 0.85, metalness: 0.05,
    }));
    const skin = own(new THREE.MeshStandardMaterial({
      color: 0xc9a3b4, roughness: 0.7, metalness: 0.05,
    }));
    // BRASS, AND IT IS THE ONLY BRIGHT THING ON THE MODEL. The cymbals are what
    // the item IS - the clash is the noise the crowd is walking toward - so
    // they are emissive and everything else is matte. A monkey lit all over
    // would read as another glowing deployable; this one reads as an object
    // holding two lights.
    this.brass = own(new THREE.MeshStandardMaterial({
      color: 0xffc65c, emissive: 0xffa000, emissiveIntensity: 1.6,
      roughness: 0.32, metalness: 0.85,
    }));
    this.eyeMat = own(new THREE.MeshStandardMaterial({
      color: 0xff3b30, emissive: 0xff2d2d, emissiveIntensity: 2.2,
      roughness: 0.4, metalness: 0.1,
    }));
    const mesh = (geo, mat) => {
      this.geos.push(geo);
      return new THREE.Mesh(geo, mat);
    };

    // THE BODY. A seated toy: a squat torso, a head most of its own size, and
    // limbs short enough that the whole thing reads as a WIND-UP rather than as
    // an animal. Proportions matter more than detail at the distance this is
    // thrown - it is 0.6m tall in a room 44 across.
    const torso = mesh(new THREE.CapsuleGeometry(0.15, 0.14, 3, 8), fur);
    torso.position.y = 0.26;
    const belly = mesh(new THREE.SphereGeometry(0.115, 8, 6), skin);
    belly.position.set(0, 0.24, 0.075);
    belly.scale.set(1, 1.05, 0.6);
    const head = mesh(new THREE.SphereGeometry(0.165, 10, 8), fur);
    head.position.y = 0.5;
    const face = mesh(new THREE.SphereGeometry(0.105, 8, 6), skin);
    face.position.set(0, 0.475, 0.105);
    face.scale.set(1, 0.85, 0.62);
    const muzzle = mesh(new THREE.SphereGeometry(0.052, 6, 5), skin);
    muzzle.position.set(0, 0.45, 0.155);
    muzzle.scale.set(1.15, 0.7, 0.8);
    this.group.add(torso, belly, head, face, muzzle);

    // Ears, eyes, legs and feet - mirrored, so one loop draws each pair and the
    // two halves cannot drift apart the way two hand-placed meshes would.
    const earGeo = new THREE.SphereGeometry(0.062, 6, 5);
    const eyeGeo = new THREE.SphereGeometry(0.031, 6, 5);
    const legGeo = new THREE.CapsuleGeometry(0.048, 0.09, 2, 6);
    const footGeo = new THREE.SphereGeometry(0.055, 6, 5);
    this.geos.push(earGeo, eyeGeo, legGeo, footGeo);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, skin);
      ear.position.set(sx * 0.16, 0.505, -0.005);
      ear.scale.set(0.55, 1, 0.95);
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(sx * 0.052, 0.515, 0.185);
      this.eyes.push(eye);
      const leg = new THREE.Mesh(legGeo, fur);
      leg.position.set(sx * 0.085, 0.115, 0.055);
      leg.rotation.x = -0.55;
      const foot = new THREE.Mesh(footGeo, skin);
      foot.position.set(sx * 0.085, 0.05, 0.15);
      foot.scale.set(0.9, 0.6, 1.25);
      this.group.add(ear, eye, leg, foot);
    }

    // THE ARMS AND THE CYMBALS. Each arm is its own pivot at the shoulder so
    // the clash is a ROTATION of the whole limb rather than two discs sliding
    // toward each other - a toy monkey swings from the shoulder, and the
    // difference is the entire read.
    this.arms = [];
    const armGeo = new THREE.CapsuleGeometry(0.045, 0.16, 2, 6);
    const cymGeo = new THREE.CylinderGeometry(0.135, 0.135, 0.016, 14);
    const bossGeo = new THREE.SphereGeometry(0.036, 6, 5);
    this.geos.push(armGeo, cymGeo, bossGeo);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.155, 0.33, 0.02);
      const arm = new THREE.Mesh(armGeo, fur);
      arm.position.set(0, -0.055, 0.075);
      arm.rotation.x = -1.1;
      const cym = new THREE.Mesh(cymGeo, this.brass);
      cym.position.set(0, -0.085, 0.185);
      // Face-on to each other across the monkey's centre line, which is what
      // makes the gap between them read as a gap that is about to close.
      cym.rotation.set(Math.PI / 2, 0, sx * 0.12);
      // The dome at the middle of a cymbal. Two pixels at range and the reason
      // the disc reads as a cymbal rather than as a coin.
      const bossPin = new THREE.Mesh(bossGeo, this.brass);
      bossPin.position.set(-sx * 0.012, -0.085, 0.185);
      pivot.add(arm, cym, bossPin);
      this.group.add(pivot);
      this.arms.push({ pivot, sx, cym });
    }

    // The wind-up key, on the back. It does nothing and it is the single most
    // important 2cm on the model: it is what says the thing is a TOY, which is
    // what makes an enemy walking toward it funny rather than confusing.
    const keyStem = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.07, 6), this.brass);
    keyStem.position.set(0, 0.31, -0.155);
    keyStem.rotation.x = Math.PI / 2;
    const keyRing = mesh(new THREE.TorusGeometry(0.055, 0.016, 5, 10), this.brass);
    keyRing.position.set(0, 0.31, -0.2);
    keyRing.rotation.y = Math.PI / 2;
    this.key = new THREE.Group();
    this.key.add(keyStem, keyRing);
    this.group.add(this.key);

    // The halo, so it is findable across the arena the way a turret is - and in
    // the cymbals' own brass rather than in the item's purple, because what the
    // player is looking for on the floor is the noise.
    this.halo = glow(game.effects.glowTex, 0xffb347, 1.05, 0.5);
    this.halo.position.y = 0.34;
    this.group.add(this.halo);
    this.mats.push(this.halo.material);

    this.group.position.copy(this.pos);
    game.scene.add(this.group);
    this.effects = game.effects;
    // The ring under it, taken only once it has landed - a telegraph on a
    // tumbling object is a mark that will not be where the object stops.
    this.mark = -1;
    this._lastPulse = -1;
    this._clash = 0;
    this._yaw = 0;
  }

  update(dt, ctx) {
    if (!this.armed) return this._fly(dt, ctx);

    this.fuse -= dt;
    const t = Math.max(0, this.fuse) / MONKEY_FUSE;
    // THE RING IS THE COUNTDOWN, and it is the same one a meteor's telegraph
    // uses so a player who has learnt one has learnt the other: it fills as the
    // clock runs out. Sized to the blast, so what it draws is the ground that
    // is about to be dangerous rather than "something is here".
    if (this.mark >= 0) {
      this.effects.markSet(
        this.mark, this.pos.x, this.pos.z, MONKEY_RADIUS,
        0xb388ff, 1 - t, 1, 0, 0.5
      );
    }
    if (this.fuse <= 0) {
      this.explode(ctx);
      return 'dead';
    }

    // ---- the clash -------------------------------------------------------
    //
    // ON THE BEAT, like the turret and the sentry, because everything rhythmic
    // in this game hangs off Music.pulse - and here it earns more than
    // consistency: the monkey is a musical instrument, so a clash landing on
    // the track is the one animation in the game that is literally in time with
    // what the player is hearing.
    //
    // IT SPEEDS UP AS THE FUSE RUNS DOWN by adding a clash between the beats
    // over the last two seconds. The pulse is already the half-beat edge, so
    // the extra one lands on the quarter, and the crowd hears the toy winding
    // itself into a panic without the tempo ever leaving the music.
    if (ctx.pulse !== this._lastPulse) {
      this._lastPulse = ctx.pulse;
      this._clash = 1;
      ctx.sfx.monkey(1 - t);
      // A puff of brass off the rims, so the clash is visible from behind and
      // from across the room - the arms themselves are 4cm wide at range.
      _v.set(this.pos.x, 0.42, this.pos.z);
      this.effects.impact(_v, 0xffc65c, 4, 2.6, 1.4, 0.22);
    }
    this._clash = Math.max(0, this._clash - dt * (7 + (1 - t) * 7));

    // The swing: arms wide open between clashes, shut on one. Squared, so the
    // limb is at rest for most of the cycle and snaps closed - a linear ease
    // reads as waving.
    const open = this._clash * this._clash;
    for (const a of this.arms) {
      a.pivot.rotation.z = a.sx * (MONKEY_ARM_SHUT + MONKEY_ARM_OPEN * open);
      a.pivot.rotation.y = a.sx * -0.35 * open;
    }
    // The whole body recoils a hair into each clash and the head nods out of
    // it, which is what stops the arms reading as detached from the toy.
    this.group.position.y = this.pos.y + open * 0.035;
    this.group.rotation.y = this._yaw + Math.sin(ctx.time * 2.4) * 0.16;
    this.key.rotation.z += dt * (2.2 + (1 - t) * 9);
    // The eyes and the halo come UP as the fuse runs down - the one signal that
    // is a level rather than a rhythm, so the player can read how long is left
    // from a glance without counting clashes.
    const heat = (1 - t) * (1 - t);
    this.eyeMat.emissiveIntensity = 2.2 + heat * 7 + open * 2;
    this.brass.emissiveIntensity = 1.6 + open * 2.4 + heat * 1.2;
    this.halo.material.opacity = 0.4 + open * 0.3 + heat * 0.4;
    this.halo.scale.setScalar(1.05 + open * 0.5 + heat * 0.9);
    return 'alive';
  }

  // The throw. The Bomb's arc and the Bomb's bounce, for the reason given at
  // the top of Lob: a fourth trajectory in this game would read as different
  // physics rather than as a different payload.
  _fly(dt, ctx) {
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.spin += dt * 14;
    this.group.rotation.set(this.spin, this.spin * 0.6, 0);
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this.pos.addScaledVector(this.vel, -dt);
      this.land();
    } else if (this.pos.y <= 0) {
      this.pos.y = 0;
      this.land();
    }
    this.group.position.copy(this.pos);
    return 'alive';
  }

  land() {
    this.pos.x = Math.max(-BOUND + 1, Math.min(BOUND - 1, this.pos.x));
    this.pos.z = Math.max(-BOUND + 1, Math.min(BOUND - 1, this.pos.z));
    this.pos.y = Math.max(0, this.pos.y);
    this.armed = true;
    // FACING THE WAY IT CAME FROM, so a monkey thrown across the room is
    // looking back at the player who threw it. Nothing reads this but the eye,
    // and the eye is the whole joke.
    this._yaw = Math.atan2(-this.vel.x, -this.vel.z);
    this.group.rotation.set(0, this._yaw, 0);
    this.group.position.copy(this.pos);
    this.mark = this.effects.markAcquire();
    this.effects.impact(this.pos, 0xffc65c, 10, 3.5, 1.6, 0.35);
  }

  explode(ctx) {
    _v.set(this.pos.x, 0, this.pos.z);
    // hitPlayer FALSE. The monkey is the one deployable in the pool that is
    // pure crowd control, and the whole reason it is worth pressing is that the
    // player is standing somewhere the crowd is not - which is often exactly
    // where the monkey is, because they were standing there when they threw it.
    // A blast that punished the player for having been surrounded would undo
    // the item's entire purpose. SHORT FUSE and WELCOME MAT are the two that
    // do not know you; this one does.
    ctx.onBlast(_v, this.damage, MONKEY_RADIUS, null, false);
    this.effects.burst(this.pos, 0xffe9a8, 34, 13, 6, 0.6);
    this.effects.burst(this.pos, 0xb388ff, 44, 9, 7, 0.85);
    this.effects.shockwave(this.pos, 0xb388ff, MONKEY_RADIUS, 0.65);
    this.effects.addShake(0.55);
    ctx.sfx.itemBlast();
  }

  destroy() {
    if (this.mark >= 0) this.effects.markRelease(this.mark);
    this.mark = -1;
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// Seconds on the floor before it goes off, the blast it leaves and where an
// enemy aims at it. Exported so items.js can print the fuse on the box's card
// without the two ever disagreeing.
export const MONKEY_FUSE = 5;
export const MONKEY_RADIUS = 9;
const MONKEY_EYE = 0.55;
// The arms at rest and how far the clash opens them, in radians.
const MONKEY_ARM_SHUT = 0.16;
const MONKEY_ARM_OPEN = 0.85;

// ---------------------------------------------------------------------------
// FIREBREAK - the wall
// ---------------------------------------------------------------------------
//
// A LINE, NOT A CIRCLE. Every other area effect in the game is radial, which
// means the answer to all of them is the same - back off - and the item that
// is actually asking a question is the one that says "not through here". It is
// laid ACROSS the player's facing so it goes up between them and whatever they
// are looking at, which is the only orientation anybody would ever want.
//
// IT STOPS ENEMY ROUNDS, and that is what separates it from a lava trail. The
// segment goes onto ctx.blockers and the projectile step tests it on the same
// frame it tests the obstacle list.
export class FireWall {
  constructor(game, x, z, dirX, dirZ, burn) {
    this.life = 8;
    // What one burn tick off this wall is worth. Snapshotted at the cast, like
    // every other fire in the game - see Player.dotHit.
    this.burn = burn;
    this.dead = false;
    // Perpendicular to the look direction, so the wall faces the player.
    const px = -dirZ;
    const pz = dirX;
    const half = 4;
    this.ax = x + px * half;
    this.az = z + pz * half;
    this.bx = x - px * half;
    this.bz = z - pz * half;

    this.group = new THREE.Group();
    this.mats = [];
    this.geos = [];
    this.flames = [];
    // Eleven sprites along the line rather than one long quad: a quad reads as
    // a pane of orange glass, and the whole point of fire is that its top edge
    // is never the same shape twice.
    //
    // SMALL AND DIM, INDIVIDUALLY. Eleven additive sprites overlapping across
    // eight metres is eleven layers of light on the same pixels, so a size and
    // an opacity that look right for ONE of them blow the whole lower half of
    // the screen to white - which is what the first pass did. The wall reads
    // by being a LINE of separate tongues, not by being bright.
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const f = glow(game.effects.glowTex, i % 2 ? 0xff9d2e : 0xdd2c00, 1.5, 0.38);
      f.position.set(this.ax + (this.bx - this.ax) * t, 0.75, this.az + (this.bz - this.az) * t);
      f.userData.phase = Math.random() * Math.PI * 2;
      this.group.add(f);
      this.flames.push(f);
      this.mats.push(f.material);
    }
    game.scene.add(this.group);
    this.effects = game.effects;
    // The scorch under it, so the footprint is unambiguous even through the
    // haze the sprites make of the air above it.
    this.creep = game.effects.creepAcquire(true);
  }

  update(dt, ctx) {
    this.life -= dt;
    const fade = Math.min(1, this.life / 1.2);
    if (this.life <= 0) return 'dead';
    for (const f of this.flames) {
      f.userData.phase += dt * 9;
      const w = 0.75 + 0.35 * Math.sin(f.userData.phase);
      f.scale.setScalar(1.5 * w * fade);
      f.material.opacity = 0.38 * fade * (0.7 + 0.3 * w);
      f.position.y = 0.7 + 0.14 * Math.sin(f.userData.phase * 0.7);
    }
    this.effects.creepSet(
      this.creep, (this.ax + this.bx) / 2, (this.az + this.bz) / 2, 4.4, 0xdd2c00, fade * 0.6
    );
    // IT SETS FIRE AND NOTHING ELSE. It used to do both - 7.5 direct every
    // quarter second AND a burn on top - which was two damage systems on one
    // wall, only one of which the player could see. The burn is the whole of it
    // now: refreshed for as long as they are standing in the flame, running
    // down once they are through, ticking on the beat like every other fire.
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      if (this._distance(e.pos.x, e.pos.z) > 0.9 + e.radius) continue;
      e.applyStatus('burn', 2, this.burn);
    }
    return 'alive';
  }

  // Squared-free point-to-segment distance. The wall is a capsule, not a box:
  // an enemy walking round the END of it must not be burnt by the corner.
  _distance(x, z) {
    const dx = this.bx - this.ax;
    const dz = this.bz - this.az;
    const L2 = dx * dx + dz * dz || 1e-6;
    const s = Math.max(0, Math.min(1, ((x - this.ax) * dx + (z - this.az) * dz) / L2));
    return Math.hypot(x - (this.ax + s * dx), z - (this.az + s * dz));
  }

  // What the projectile step asks. A round is eaten when its position lands
  // inside the same capsule the burn uses, so what stops a shot and what
  // stops a body are the same wall.
  blocks(x, z) {
    return this._distance(x, z) < 0.9;
  }

  destroy() {
    this.effects.creepRelease(this.creep);
    this.group.parent?.remove(this.group);
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
  }
}

// ---------------------------------------------------------------------------
// MOLOTOV - the ground the bottle leaves
// ---------------------------------------------------------------------------
//
// FIREBREAK'S OPPOSITE NUMBER, and the two are deliberately the same machinery
// wearing different geometry: a wall is a capsule the player stands behind for
// eight seconds, this is a disc thrown across the room that is still there
// twenty seconds later. Both set fire and neither deals damage of its own - one
// fire system, one number, one rhythm (see the note in FireWall.update).
//
// IT DOES NOT BLOCK SHOTS. The wall does, because a wall is cover; a puddle is
// not, and a `blocks` here would make the item a portable barricade the player
// throws at their own feet - which is FIREBREAK, twenty points cheaper.
//
// THE FLAMES ARE A RING, NOT A FILL. Sprites over the whole disc at a density
// that reads from across the arena is forty additive quads on one patch of
// floor, which is the white-out the wall's own note describes; the edge is also
// the only part an enemy has to see, because the edge is what they walk over.
const PIT_R = 4;
const PIT_FLAMES = 12;

export class Firepit {
  constructor(game, x, z, burn, standY = 0) {
    this.x = x;
    this.z = z;
    this.y = standOn(game, x, z, standY);
    this.life = 20;
    // Snapshotted at the throw, like every other fire in the game - see
    // Player.dotHit and the note on Turret's damage.
    this.burn = burn;
    this.dead = false;

    this.group = new THREE.Group();
    this.mats = [];
    this.flames = [];
    for (let i = 0; i < PIT_FLAMES; i++) {
      const a = (i / PIT_FLAMES) * Math.PI * 2;
      // Scattered off the rim rather than exactly on it: a perfect circle of
      // sprites reads as a drawn ring, and fire has no radius.
      const r = PIT_R * (0.72 + Math.random() * 0.3);
      const f = glow(game.effects.glowTex, i % 2 ? 0xff9d2e : 0xdd2c00, 1.5, 0.34);
      f.position.set(x + Math.cos(a) * r, this.y + 0.7, z + Math.sin(a) * r);
      f.userData.phase = Math.random() * Math.PI * 2;
      this.group.add(f);
      this.flames.push(f);
      this.mats.push(f.material);
    }
    game.scene.add(this.group);
    this.effects = game.effects;
    this.creep = game.effects.creepAcquire(true);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'dead';
    // The last second is the warning, exactly as a hazard patch's is: the floor
    // going clean is the only notice anybody gets that the ground is safe.
    const fade = Math.min(1, this.life);
    for (const f of this.flames) {
      f.userData.phase += dt * 9;
      const w = 0.75 + 0.35 * Math.sin(f.userData.phase);
      f.scale.setScalar(1.5 * w * fade);
      f.material.opacity = 0.34 * fade * (0.7 + 0.3 * w);
      f.position.y = this.y + 0.65 + 0.14 * Math.sin(f.userData.phase * 0.7);
    }
    this.effects.creepSet(this.creep, this.x, this.z, PIT_R, 0xdd2c00, fade * 0.7);
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - this.x;
      const dz = e.pos.z - this.z;
      const reach = PIT_R + e.radius;
      if (dx * dx + dz * dz > reach * reach) continue;
      // Refreshed every frame they are inside and left to run down once they
      // are out, which is what makes crossing the edge cost less than standing
      // in the middle. FireWall's rule, for FireWall's reason.
      e.applyStatus('burn', 2, this.burn);
    }
    return 'alive';
  }

  destroy() {
    this.effects.creepRelease(this.creep);
    this.group.parent?.remove(this.group);
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------------------
// EVENT HORIZON - the thrown orb and the singularity it becomes
// ---------------------------------------------------------------------------
//
// THE HOLE IS AN ABSENCE, NOT A DARK OBJECT, and that is the whole trick of
// drawing one. Four layers, in this order, and none of them is optional:
//
//   1. the hole    a matte black sphere with lighting off. It has to be the
//                  only thing in the room the rig cannot touch.
//   2. the disc    an additive torus, tilted, spinning, brightest at the
//                  inner edge - the one part that says which way it turns.
//   3. the infall  sparks born on a ring at four metres and dragged in on a
//                  spiral, going violet -> white as they close.
//   4. the lens    a wide, faint additive shell just outside the disc, scaled
//                  on a slow sine so the space AROUND the hole moves too.
//
// Take away any one and it stops reading: without 1 it is a firework, without
// 2 it is a ball, without 3 nothing appears to be falling, and without 4 the
// hole has no effect on the room it is standing in.
//
// IT NEVER PULLS THE PLAYER. Asked for explicitly, and correct: a pull the
// player cannot fight is the one thing in the game that takes the movement
// away, and this is an item they chose to spend a slot on.
// How far the hole reaches, in metres. The pull and the bite are the same
// circle deliberately - a hole that dragged from further than it ate would be
// a hole with an invisible second radius the player could only learn by dying
// just outside it.
const PULL_R = 14;

export class Singularity {
  constructor(game, x, z, damage) {
    this.pos = new THREE.Vector3(x, 1.6, z);
    this.life = 5;
    this.age = 0;
    // TWICE ONE OF THE PLAYER'S OWN SHOTS, snapshotted when the item was
    // thrown - see EVENT HORIZON in js/items.js and the note on Turret.damage,
    // which this follows for the same reason.
    this.damage = damage;
    // Where the pulse stood when the hole opened, so it eats on the next beat
    // edge rather than instantly and again a fraction of a second later.
    this._lastPulse = -1;
    this.dead = false;

    this.group = new THREE.Group();
    this.group.position.copy(this.pos);
    this.mats = [];
    this.geos = [];

    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
    this.hole = new THREE.Mesh(new THREE.SphereGeometry(0.85, 20, 16), holeMat);
    // Renders LAST among the layers and writes depth, so the accretion disc
    // behind it is genuinely occluded rather than added on top of it - which
    // is what would happen if the black sphere were additive like everything
    // else here.
    this.hole.renderOrder = 2;

    const discMat = new THREE.MeshBasicMaterial({
      color: 0x9b6bff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.disc = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.34, 8, 40), discMat);
    this.disc.rotation.x = Math.PI * 0.42;
    this.disc.renderOrder = 1;

    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xe8dcff, transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.inner = new THREE.Mesh(new THREE.TorusGeometry(1.06, 0.1, 6, 32), innerMat);
    this.inner.rotation.x = Math.PI * 0.42;
    this.inner.renderOrder = 1;

    const lensMat = new THREE.MeshBasicMaterial({
      color: 0x3d1f7a, transparent: true, opacity: 0.28,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide, fog: false,
    });
    // Scaled with PULL_R rather than fixed: the lens is the only thing on
    // screen that says how far the hole reaches, and a drawing that stayed the
    // size it was when the circle grew is the item lying about its own area.
    this.lens = new THREE.Mesh(new THREE.SphereGeometry(2.6 * (PULL_R / 9), 18, 14), lensMat);
    this.lens.renderOrder = 0;

    this.group.add(this.lens, this.disc, this.inner, this.hole);
    this.mats.push(holeMat, discMat, innerMat, lensMat);
    this.group.traverse((o) => { if (o.geometry) this.geos.push(o.geometry); });
    game.scene.add(this.group);
    this.effects = game.effects;
    this.effects.addShake(0.25);
    this.effects.shockwave(this.pos, 0x9b6bff, PULL_R, 0.7);
  }

  update(dt, ctx) {
    this.life -= dt;
    this.age += dt;
    if (this.life <= 0) return 'dead';
    // Opens fast and collapses fast; it is only ever fully open in the middle.
    // A hole that faded in linearly would spend its first second looking like
    // a bug in the alpha sort.
    const open = Math.min(1, this.age / 0.35) * Math.min(1, this.life / 0.5);
    this.group.scale.setScalar(0.4 + 0.6 * open);
    this.disc.rotation.z += dt * 2.6;
    this.inner.rotation.z -= dt * 4.4;
    this.disc.material.opacity = 0.9 * open;
    this.inner.material.opacity = 0.8 * open;
    // The lens breathes on its own clock, slower than the disc spins, so the
    // two never lock into one rhythm and read as a single spinning object.
    this.lens.scale.setScalar(1 + 0.14 * Math.sin(this.age * 3.1));
    this.lens.material.opacity = 0.28 * open;

    // The infall. Born on a ring, aimed at the centre with a large sideways
    // component - a spark aimed straight in falls straight in, and what makes
    // this read as orbit rather than as suction is that it does not.
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = (3.4 + Math.random() * 1.2) * (PULL_R / 9);
      _v.set(this.pos.x + Math.cos(a) * r, 0.5 + Math.random() * 2.4, this.pos.z + Math.sin(a) * r);
      _v2.set(this.pos.x - _v.x, this.pos.y - _v.y, this.pos.z - _v.z).normalize();
      this.effects.impact(
        _v, i === 0 ? 0xe8dcff : 0x9b6bff, 2,
        // Speed carries the tangent as well as the inward run, which is what
        // bends the streak.
        5 + Math.random() * 3, 1.2, 0.45
      );
    }

    // THE PULL. _pull moves each enemy a DISTANCE per call, so the figure here
    // is metres per second and has to carry the dt itself - eighteen at the
    // centre, falling to nothing at the edge. That is about six times a
    // chaser's own speed: fast enough that the hole visibly takes the crowd
    // away from the player, slow enough that an enemy is seen travelling
    // rather than teleporting, which is the whole reason to draw one of these.
    //
    // FOURTEEN METRES, NOT NINE. Nine was a circle the crowd walked around:
    // most of a wave was outside it on the frame it opened, so the item drew
    // beautifully and gathered whoever happened to be standing there. Fourteen
    // is most of the half of the arena it is thrown into, which is what makes
    // the throw a decision about a CROWD rather than about three enemies.
    ctx.pull(this.pos, PULL_R, 18 * dt);
    // ON THE BEAT, like the sentry gun and like fire and poison - see
    // Music.pulse. It used to eat on a private 0.2s timer, which made the one
    // thing in the arena that is visibly rotating the one thing in the arena
    // with no relationship to the music it is rotating over.
    if (ctx.pulse === this._lastPulse) return 'alive';
    const first = this._lastPulse < 0;
    this._lastPulse = ctx.pulse;
    if (first || !ctx.pulseWhole) return 'alive';
    for (const e of ctx.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d > PULL_R) continue;
      ctx.hurtEnemy(e, this.damage);
    }
    return 'alive';
  }

  destroy() {
    // The collapse is louder than the opening. It has to be: everything the
    // hole was holding is released on this frame, and a singularity that
    // simply faded out would look like it had been switched off.
    this.effects.shockwave(this.pos, 0xe8dcff, PULL_R + 3, 0.5);
    this.effects.burst(this.pos, 0x9b6bff, 34, PULL_R, 4, 0.6);
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// The orb that carries it. Flat and fast rather than lobbed: the player is
// aiming this one, and a three-second charge on a parabola is a different item.
export class HoleOrb {
  constructor(game, x, y, z, dirX, dirY, dirZ, damage) {
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3(dirX, dirY, dirZ).normalize().multiplyScalar(24);
    this.life = 2.2;
    this.dead = false;
    this.mat = new THREE.MeshBasicMaterial({ color: 0x120a24, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), this.mat);
    this.halo = glow(game.effects.glowTex, 0x9b6bff, 1.5, 0.9);
    this.mesh.add(this.halo);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.game = game;
    this.damage = damage;
  }

  update(dt, ctx) {
    this.life -= dt;
    // Almost no gravity: it is a ball of nothing, and the player threw it at
    // something they could see.
    this.vel.y -= 4 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.position.copy(this.pos);
    this.halo.material.opacity = 0.6 + 0.35 * Math.sin(this.life * 22);
    ctx.effects.impact(this.pos, 0x9b6bff, 1, 1.5, 0.6, 0.3);

    let hit = this.life <= 0 || this.pos.y <= 0.2
      || Math.abs(this.pos.x) > BOUND || Math.abs(this.pos.z) > BOUND
      || pointInObstacle(this.pos, ctx.obstacles);
    if (!hit) {
      for (const e of ctx.enemies) {
        if (e.dead) continue;
        const dx = this.pos.x - e.pos.x;
        const dz = this.pos.z - e.pos.z;
        if (dx * dx + dz * dz < (e.radius + 0.4) * (e.radius + 0.4)) { hit = true; break; }
      }
    }
    if (!hit) return 'alive';
    // Clamped inside the arena so a hole opened against a wall still has all
    // of its pull inside the room.
    const x = Math.max(-BOUND + 3, Math.min(BOUND - 3, this.pos.x));
    const z = Math.max(-BOUND + 3, Math.min(BOUND - 3, this.pos.z));
    // The clamp is deliberately NOT widened to PULL_R: a hole thrown at a wall
    // should open at the wall. What the clamp is for is keeping the thing
    // inside the room at all, and its reach falls off to nothing anyway.
    ctx.deploy(new Singularity(this.game, x, z, this.damage));
    ctx.sfx.itemSuck();
    return 'dead';
  }

  destroy() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.halo.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// THE THROW - what carries a mine or a turret out in front of the player
// ---------------------------------------------------------------------------
//
// Both of these used to be PLACED: the item wrote them into the arena at
// `player.pos + facing * 1.4` and that was the whole deployment. Which made two
// items whose entire decision is WHERE into items with no decision at all - the
// answer was always "here", because here is the only place you could reach.
//
// Thrown, the placement is aimed. A mine goes over the crowd and lands behind
// it; a turret is set down across the room rather than at the player's heel,
// where it was only ever shooting at whatever had already caught them.
//
// The arc is the Bomber's, and the Bomb's, and the enemy Grenade's - 11 forward,
// 6.5 up, 22 down - because a fourth throw in the game that flew differently
// would read as a different physics rather than as a different payload. What it
// LANDS as is the only thing that varies, and that is one string.
// WHAT EACH THROW STANDS UP, AND WHAT COLOUR IT WEARS ON THE WAY.
//
// Two tables rather than a chain of ternaries, because there are three kinds
// now and the ternary version had the colour written out twice - once for the
// halo in flight and once for the impact - which is exactly the pair that
// drifts apart. Every class here takes the same (game, x, z, damage, fromY),
// so the throw does not have to know which one it is carrying.
const LOB_LANDS = { mine: Mine, turret: Turret, molotov: Firepit };
const LOB_TINT = { mine: 0xff7043, turret: 0xffab40, molotov: 0xdd2c00 };

export class Lob {
  /**
   * @param {object} game
   * @param {THREE.Vector3} from   the muzzle, so it leaves the gun
   * @param {THREE.Vector3} dir    flattened facing
   * @param {'mine'|'turret'|'molotov'} kind what to stand up where it lands
   * @param {number} damage        snapshotted at the throw - see Mine, Turret
   */
  constructor(game, from, dir, kind, damage) {
    this.pos = new THREE.Vector3(from.x, from.y, from.z);
    this.vel = new THREE.Vector3(dir.x, 0, dir.z).normalize().multiplyScalar(11);
    this.vel.y = 6.5;
    this.kind = kind;
    this.damage = damage;
    this.game = game;
    this.dead = false;
    // A CEILING ON THE FLIGHT, not a fuse: it lands when it lands, and this is
    // only here so a throw that somehow never touches down cannot become a
    // permanent resident of the deployed list.
    this.life = 4;
    this.spin = new THREE.Vector3(Math.random(), Math.random(), Math.random());

    const tint = LOB_TINT[kind] || LOB_TINT.turret;
    this.mat = emissive(0x2a2f3a, 0.2);
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), this.mat);
    // The same halo the thing it becomes will wear, so the throw and the object
    // read as one event - the player watches the colour they are about to own.
    this.halo = glow(game.effects.glowTex, tint, 0.8, 0.75);
    this.mesh.add(this.halo);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    this.vel.y -= 22 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.mesh.rotation.x += this.spin.x * dt * 9;
    this.mesh.rotation.z += this.spin.z * dt * 9;
    this.mesh.position.copy(this.pos);
    // BACKS OUT OF WHAT IT HIT rather than passing through it: a throw into a
    // pillar drops at the pillar's face, which is where the player can see it
    // land. Same test the Bomb uses, for the same reason.
    if (pointInObstacle(this.pos, ctx.obstacles)) {
      this.pos.addScaledVector(this.vel, -dt);
      this.land(ctx);
      return 'dead';
    }
    if (this.pos.y <= 0.1 || this.life <= 0) {
      this.land(ctx);
      return 'dead';
    }
    return 'alive';
  }

  land(ctx) {
    // Clamped inside the arena, so a throw at a wall still stands its mine or
    // its turret up somewhere the fight can reach.
    const x = Math.max(-BOUND + 1, Math.min(BOUND - 1, this.pos.x));
    const z = Math.max(-BOUND + 1, Math.min(BOUND - 1, this.pos.z));
    // The throw already tracked a real height through its arc and used to drop
    // it here, which is how a turret landing on a platform ended up under one.
    ctx.deploy(new LOB_LANDS[this.kind](this.game, x, z, this.damage, this.pos.y));
    _v.set(x, this.pos.y + 0.1, z);
    ctx.effects.impact(_v, LOB_TINT[this.kind], 8, 3, 1, 0.3);
    // A BOTTLE BREAKS, and the other two do not: a mine and a turret are set
    // down, and the whole read of a molotov is that the thing that was thrown
    // is gone. It is also what makes the twenty seconds legible as one event
    // starting rather than as ground that was quietly always there.
    if (this.kind === 'molotov') {
      ctx.effects.shockwave(_v, 0xdd2c00, PIT_R, 0.6);
      ctx.effects.burst(_v, 0xff9d2e, 26, 6, 3, 0.7);
    }
  }

  destroy() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.halo.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// APIARY - the bees
// ---------------------------------------------------------------------------
//
// FIVE SMALL THINGS, NOT ONE BIG ONE. A single strong ally would be a second
// turret; five weak ones are a CLOUD, and a cloud is legible from anywhere in
// the room and does something a turret cannot - it spreads itself over the
// crowd without being told to.
//
// A bee steers, it does not path. It flies at whatever is nearest and bumps
// into things on the way, which is exactly what a bee does.
export class Bee {
  constructor(game, x, z, i) {
    this.pos = new THREE.Vector3(x + Math.cos(i) * 0.8, 1.6, z + Math.sin(i) * 0.8);
    this.vel = new THREE.Vector3();
    // TWENTY-FOUR SECONDS. A bee does a tenth of what the player's gun does and
    // spends most of its life travelling, so at twelve the swarm was gone
    // before it had crossed the arena once - the item read as a burst rather
    // than as the cloud it is meant to be.
    this.life = 24;
    this.cd = 0.3 + i * 0.12;
    this.phase = Math.random() * Math.PI * 2;
    this.dead = false;

    this.mat = emissive(0xc6ff00, 2.4);
    this.mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), this.mat);
    this.halo = glow(game.effects.glowTex, 0xc6ff00, 0.7, 0.75);
    this.mesh.add(this.halo);
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
  }

  update(dt, ctx) {
    this.life -= dt;
    if (this.life <= 0) return 'dead';
    this.cd -= dt;
    this.phase += dt * 22;
    const target = nearest(ctx.enemies, this.pos.x, this.pos.z, 40);
    if (target) {
      _v.set(target.pos.x - this.pos.x, target.pos.y + 0.9 - this.pos.y, target.pos.z - this.pos.z);
      const d = _v.length() || 1;
      _v.multiplyScalar(1 / d);
      // Steering, not seeking: the velocity is nudged toward the target and
      // damped, so a bee overshoots and comes back round. A bee that snapped
      // onto its heading every frame would be a dart.
      this.vel.addScaledVector(_v, 60 * dt);
      if (d < 0.9 + target.radius && this.cd <= 0) {
        this.cd = 1.2;
        ctx.hurtEnemy(target, 10);
        ctx.effects.impact(this.mesh.position, 0xc6ff00, 5, 4, 2, 0.25);
        // Bounces off what it stung, which is what turns a hit into a visible
        // cycle rather than a bee vibrating inside a body.
        this.vel.addScaledVector(_v, -26);
      }
    } else {
      // Nothing to sting: it loiters around where it was let out rather than
      // flying to the corner it happened to be pointing at.
      this.vel.multiplyScalar(0.94);
    }
    const sp = this.vel.length();
    if (sp > 11) this.vel.multiplyScalar(11 / sp);
    this.vel.y += (1.5 - this.pos.y) * dt * 6;
    this.pos.addScaledVector(this.vel, dt);
    // The wingbeat wobble, laid on the drawn position and not on this.pos, so
    // it cannot accumulate into drift.
    this.mesh.position.set(
      this.pos.x + Math.sin(this.phase) * 0.09,
      Math.max(0.5, this.pos.y) + Math.cos(this.phase * 1.4) * 0.07,
      this.pos.z + Math.cos(this.phase) * 0.09
    );
    this.mesh.rotation.y += dt * 9;
    this.mesh.rotation.x = Math.sin(this.phase * 0.5) * 0.4;
    // Fades out rather than popping, so five of them leaving is one event.
    const fade = Math.min(1, this.life / 0.8);
    this.mat.emissiveIntensity = 2.4 * fade;
    this.halo.material.opacity = 0.75 * fade;
    return 'alive';
  }

  destroy() {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.halo.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// FALLING SKY - the meteors
// ---------------------------------------------------------------------------
//
// TELEGRAPHED, AND HARMLESS TO THE PLAYER. Those two are one decision. Every
// other telegraph in the game is a question the player answers by moving, and
// they can answer it because they know who threw it. A dozen rocks the PLAYER
// called down at random would be a question with no answer - so the ring is
// there for the reading (it says the item is working, and where) and the blast
// is the enemy's problem alone.
export class Meteor {
  constructor(game, x, z, delay, damage) {
    this.x = x;
    this.z = z;
    this.wait = delay;
    // THREE OF THE PLAYER'S OWN SHOTS, snapshotted at the press - see FALLING
    // SKY in js/items.js. The flat 70 it used to carry was most of a chaser on
    // wave three and a rounding error on wave thirty.
    this.damage = damage;
    this.fall = -1;
    this.dead = false;
    this.effects = game.effects;
    // ACQUIRED WHEN IT STARTS TO FALL, NOT HERE. Twelve meteors are queued at
    // once and the telegraph pool is ten deep; taking a slot each at spawn
    // would exhaust it before the first rock left the ceiling and leave the
    // rest falling silently. Staggered by `delay`, at most a couple are ever
    // in the air together.
    this.mark = -1;
    this.mat = emissive(0xff6f00, 3.0);
    this.mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), this.mat);
    this.halo = glow(game.effects.glowTex, 0xff8c1a, 3.2, 0.9);
    this.mesh.add(this.halo);
    this.mesh.visible = false;
    this.mesh.position.set(x, 24, z);
    game.scene.add(this.mesh);
  }

  update(dt, ctx) {
    if (this.wait > 0) {
      this.wait -= dt;
      return 'alive';
    }
    if (this.fall < 0) {
      this.fall = 0.6;
      this.mesh.visible = true;
      this.mark = this.effects.markAcquire();
    }
    this.fall -= dt;
    const t = Math.max(0, this.fall) / 0.6;
    if (this.mark >= 0) {
      // The ring TIGHTENS and FILLS as the rock closes. A ring of constant
      // size is a location; a ring that is closing is a countdown.
      this.effects.markSet(
        this.mark, this.x, this.z, 3.5 * (0.55 + t * 0.45), 0xff6f00, 1 - t, 1, 0, 0.55
      );
    }
    this.mesh.position.y = 0.6 + t * t * 26;
    this.mesh.rotation.x += dt * 10;
    this.mesh.rotation.z += dt * 7;
    if (this.fall > 0) {
      this.effects.impact(this.mesh.position, 0xff8c1a, 2, 3, 1, 0.4);
      return 'alive';
    }
    _v.set(this.x, 0, this.z);
    // hitPlayer false - see the note at the top of the class.
    ctx.onBlast(_v, this.damage, 3.5, null, false);
    this.effects.burst(_v, 0xffd166, 18, 8, 4, 0.45);
    this.effects.burst(_v, 0xff6f00, 22, 5, 5, 0.6);
    this.effects.shockwave(_v, 0xff6f00, 3.5, 0.4);
    this.effects.addShake(0.18);
    return 'dead';
  }

  destroy() {
    if (this.mark >= 0) this.effects.markRelease(this.mark);
    this.mark = -1;
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.halo.material.dispose();
  }
}
