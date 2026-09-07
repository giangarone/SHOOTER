// THE TWO THINGS THAT ARE ALIVE.
//
// Everything else the player owns is a number, a window or a piece of
// furniture. A turret is a gun with a cooldown, the bees are a cloud on a
// timer, and every passive item in upgrades.js is a multiplier that applies
// itself without being watched. These two are neither: they are around for the
// whole run, they decide where to go by themselves, and the player will look at
// them.
//
// THEY ARE NOT DEPLOYABLES, and the difference is one line in main.js:
// _clearHazards sweeps the deployed list at every wave end, because a turret
// firing into the shop is furniture the player has to wait out. A companion
// that had to be re-summoned every wave would be a pet the player buries once a
// minute. So they live in their own list on the Game, created the frame the
// passive item is owned and destroyed only when the RUN ends - which in versus
// means at every handoff, so the incoming player gets the pets THEIR build
// paid for and never the other player's. See Game._syncCompanions.
//
// THE CONTRACT IS THE DEPLOYABLE'S, because the game already had one:
//
//     constructor(game)         adds its meshes to the scene
//     update(dt, ctx)           ctx is the deploy context, refreshed per frame
//     destroy()                 takes them out again, and disposes
//
// with no return value, because nothing here ever retires on its own.
//
// BOTH OF THEM ARE BUILT OUT OF PRIMITIVES AND SHADED FLAT, like every enemy
// in the game - no textures, no imported geometry, one silhouette that has to
// read at twenty metres in a room full of light. What tells them apart from the
// roster is COLOUR: nothing hostile in this game is slate grey or teal.

import * as THREE from 'three';
import { groundSurface, resolveCircle } from './utils.js';
import { BOUND } from './arena.js';

const _v = new THREE.Vector3();

// ---------------------------------------------------------------------------
// MAGPIE - the bird that picks up money
// ---------------------------------------------------------------------------
//
// WHAT IT IS ACTUALLY WORTH. Every orb it walks onto is one the player was
// going to collect anyway, or one they were going to lose to ORB_LIFETIME - and
// it is only ever worth a credit in the second case. So the pick is "the corner
// of the room you never went back for", which happens in every single wave and
// which nothing else in the pool answers. It is deliberately NOT a wider
// magnet: Lodestone already grows the circle around the player, and being
// SOMEWHERE ELSE is the only thing a bird can offer that a bigger circle cannot.
//
// IT WALKS. A flying bird would be a second Bee - and, worse, it would fly over
// the pillars and the tiers, which is exactly the ground the player cannot be
// bothered to walk back to. Hopping across the floor is what makes it read as
// running an errand.
export class Magpie {
  constructor(game) {
    const p = game.player.pos;
    this.pos = new THREE.Vector3(p.x - 1.2, 0, p.z - 1.2);
    // Where it is going: an orb's index and position, or null for "follow the
    // player". Re-decided on a cadence rather than every frame - see update().
    this.target = null;
    this.think = 0;
    // The hop. A bird's walk is not a glide, and a bird that slid across the
    // floor would read as an object being dragged. `_hop` is the phase and
    // `_step` the current stride rate, which climbs with speed.
    this._hop = 0;
    this._flap = 0;
    this.yaw = 0;
    // Credits it has brought in this run, purely so the build sheet can say so.
    // A pet that never reports what it did is a pet the player has to take on
    // faith.
    this.collected = 0;

    const g = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    const mesh = (geo, mat) => { this.geos.push(geo); return new THREE.Mesh(geo, mat); };
    // PIED, because a magpie is - and because two flat tones with a hard edge
    // between them is the cheapest silhouette in the world to read at range.
    // The blue-black is lifted well off true black for the reason the turret's
    // shell is: an unlit dark object twenty metres away in this room is a hole
    // in the floor.
    const dark = own(new THREE.MeshStandardMaterial({
      color: 0x39424f, roughness: 0.55, metalness: 0.25,
    }));
    const pale = own(new THREE.MeshStandardMaterial({
      color: 0xdfe6ee, roughness: 0.7, metalness: 0.05,
    }));
    const beakMat = own(new THREE.MeshStandardMaterial({
      color: 0xffc04d, emissive: 0xff9d00, emissiveIntensity: 0.9,
      roughness: 0.4, metalness: 0.4,
    }));
    this.eyeMat = own(new THREE.MeshStandardMaterial({
      color: 0xffe27a, emissive: 0xffd54f, emissiveIntensity: 2.4,
      roughness: 0.4, metalness: 0.1,
    }));

    const body = mesh(new THREE.SphereGeometry(0.19, 10, 8), dark);
    body.position.y = 0.28;
    body.scale.set(0.85, 0.9, 1.25);
    // The white shoulder patch and the white belly, which is the entire reason
    // this is a magpie and not a crow.
    const bib = mesh(new THREE.SphereGeometry(0.135, 8, 6), pale);
    bib.position.set(0, 0.26, 0.075);
    bib.scale.set(0.9, 0.95, 0.9);
    const head = mesh(new THREE.SphereGeometry(0.115, 9, 7), dark);
    head.position.set(0, 0.45, 0.09);
    const beak = mesh(new THREE.ConeGeometry(0.042, 0.15, 6), beakMat);
    beak.position.set(0, 0.44, 0.215);
    beak.rotation.x = Math.PI / 2;
    // THE TAIL IS HALF THE BIRD. A magpie's tail is longer than its body, and
    // it is what makes the silhouette unmistakable from behind - which is the
    // angle the player sees most, because the bird is usually walking away.
    this.tail = mesh(new THREE.ConeGeometry(0.075, 0.42, 4), dark);
    this.tail.position.set(0, 0.29, -0.32);
    this.tail.rotation.set(-Math.PI / 2 - 0.28, 0, Math.PI / 4);
    g.add(body, bib, head, beak, this.tail);

    // Wings, eyes and legs, mirrored - see the same loop on the Monkey.
    const wingGeo = new THREE.SphereGeometry(0.12, 7, 5);
    const eyeGeo = new THREE.SphereGeometry(0.026, 6, 5);
    const legGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.17, 5);
    this.geos.push(wingGeo, eyeGeo, legGeo);
    this.wings = [];
    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.135, 0.31, 0.02);
      const wing = new THREE.Mesh(wingGeo, sx < 0 ? pale : pale);
      wing.position.set(0, 0, -0.03);
      wing.scale.set(0.42, 0.72, 1.5);
      pivot.add(wing);
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(sx * 0.062, 0.485, 0.155);
      const leg = new THREE.Mesh(legGeo, beakMat);
      leg.position.set(sx * 0.055, 0.085, 0.03);
      g.add(pivot, eye, leg);
      this.wings.push({ pivot, sx });
      this.legs.push(leg);
    }

    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: game.effects.glowTex, color: 0xbcd3e8, transparent: true,
      opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.halo.scale.setScalar(1.1);
    this.halo.position.y = 0.33;
    g.add(this.halo);
    this.mats.push(this.halo.material);

    g.position.copy(this.pos);
    this.group = g;
    game.scene.add(g);
    this.money = game.money;
    this.player = game.player;
  }

  update(dt, ctx) {
    // ---- deciding where to go -------------------------------------------
    //
    // ONCE A THIRD OF A SECOND, NOT EVERY FRAME, and not because the scan is
    // expensive - it is one pass over at most 250 orbs. It is because a bird
    // that re-picked the nearest orb every frame would dither between two
    // equidistant ones forever, and because a decision the player can WATCH
    // being made is worth more than one that is always already correct.
    this.think -= dt;
    if (this.think <= 0) {
      this.think = MAGPIE_THINK;
      this.target = this.money.nearestOrb(
        this.pos.x, this.pos.z, MAGPIE_RANGE, MAGPIE_LEASH, this.player.pos
      );
    }

    // WHERE IT IS HEADED. An orb if it has one, and otherwise the player -
    // offset behind and to the side rather than onto them, so a bird with
    // nothing to do trots along at heel instead of standing inside the camera.
    let tx, tz, want;
    if (this.target) {
      tx = this.target.x;
      tz = this.target.z;
      want = MAGPIE_RUN;
    } else {
      const p = this.player.pos;
      tx = p.x - Math.sin(this.player.yaw + 2.3) * 1.5;
      tz = p.z - Math.cos(this.player.yaw + 2.3) * 1.5;
      want = MAGPIE_WALK;
    }
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);

    // A DEAD ZONE AROUND THE HEEL POSITION and none around an orb. Following
    // the player has to stop when it arrives or the bird jitters against a
    // moving target forever; collecting must not, or it stalls a hand's width
    // short of the money.
    const stop = this.target ? 0 : 0.55;
    let speed = 0;
    if (dist > stop) {
      // Sprints when it is a long way behind, which is what keeps it from being
      // left across the arena every time the player dashes - and what makes a
      // bird that has spotted money read as EAGER.
      speed = Math.min(MAGPIE_SPRINT, want * (1 + Math.max(0, dist - 6) * 0.35));
      const k = (speed * dt) / dist;
      this.pos.x += dx * k;
      this.pos.z += dz * k;
      // Turns toward where it is going rather than snapping: the tail is the
      // longest thing on the model and a snap swings it through the floor.
      const aim = Math.atan2(dx, dz);
      let turn = aim - this.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this.yaw += turn * Math.min(1, dt * 9);
    }

    // Stays in the room, on the floor it is standing on, and out of the crates
    // - the same three calls in the same order every ground enemy makes.
    this.pos.x = Math.max(-BOUND + 0.6, Math.min(BOUND - 0.6, this.pos.x));
    this.pos.z = Math.max(-BOUND + 0.6, Math.min(BOUND - 0.6, this.pos.z));
    resolveCircle(this.pos, 0.28, ctx.obstacles, 1.0);
    const floor = groundSurface(this.pos, 0.28, ctx.obstacles);
    this.pos.y += (floor - this.pos.y) * Math.min(1, dt * 12);

    // ---- collecting ------------------------------------------------------
    //
    // THE BIRD COLLECTS BY STANDING ON IT, at the same radius the player does.
    // It does NOT get a magnet: a bird that pulled orbs toward itself would be
    // a second Lodestone and, far worse, would take the money the player was
    // already walking to. Everything it picks up is money that was under its
    // own feet.
    const got = this.money.collectAt(this.pos.x, this.pos.z, MAGPIE_REACH, ctx.onOrb);
    if (got > 0) {
      this.collected += got;
      this.target = null;
      this.think = MAGPIE_THINK;
      _v.set(this.pos.x, this.pos.y + 0.45, this.pos.z);
      ctx.effects.impact(_v, 0xffd54f, 6, 3, 2, 0.3);
      // The head comes up on a find, which is the whole tell that the bird did
      // something rather than happened to be standing there.
      this._flap = 1;
    }

    // ---- the walk --------------------------------------------------------
    //
    // TWO HOPS PER STRIDE and a bob on each, driven off distance covered rather
    // than off the clock, so the bird cannot moonwalk: stop moving and the hop
    // stops with it, at whatever phase it was on.
    this._hop += speed * dt * 4.2;
    this._flap = Math.max(0, this._flap - dt * 2.6);
    const hop = Math.abs(Math.sin(this._hop));
    this.group.position.set(
      this.pos.x, this.pos.y + hop * 0.075 * Math.min(1, speed), this.pos.z
    );
    this.group.rotation.y = this.yaw;
    // Leans into the run and rocks with each hop. Small - it is a 0.5m object.
    this.group.rotation.x = -Math.min(0.22, speed * 0.03) + hop * 0.05;
    // The legs alternate, which is the difference between hopping and bouncing.
    const stride = Math.sin(this._hop) * 0.06 * Math.min(1, speed);
    this.legs[0].position.z = 0.03 + stride;
    this.legs[1].position.z = 0.03 - stride;
    // The wings only open on a find or a hard turn. A bird flapping constantly
    // reads as a bird trying and failing to take off.
    const open = Math.max(this._flap, hop * Math.min(1, speed * 0.12));
    for (const w of this.wings) {
      w.pivot.rotation.z = w.sx * (0.15 + open * 0.9);
      w.pivot.rotation.x = -open * 0.25;
    }
    this.tail.rotation.x = -Math.PI / 2 - 0.28 + open * 0.3;
    this.eyeMat.emissiveIntensity = 2.4 + this._flap * 3;
    this.halo.material.opacity = 0.22 + this._flap * 0.3;
  }

  destroy() {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// How far the bird will go for money, how far it is willing to be from the
// player while doing it, and how close it has to be to pick something up.
//
// THE LEASH IS THE BALANCE. Without it the bird spends every wave in the far
// corner and the player never sees the thing they own; with it, it works the
// ground the fight is actually on and only ranges out when the floor near the
// player is already clean. Twenty-two is half the arena.
const MAGPIE_RANGE = 34;
const MAGPIE_LEASH = 22;
const MAGPIE_REACH = 0.8;
const MAGPIE_THINK = 0.3;
const MAGPIE_WALK = 5.5;
const MAGPIE_RUN = 9;
// Faster than the player's 10, and only ever reached when it is a long way
// behind. A pet that cannot catch up is a pet that is always somewhere else.
const MAGPIE_SPRINT = 15;

// ---------------------------------------------------------------------------
// LAMPREY - the leech that guards the player
// ---------------------------------------------------------------------------
//
// A BODYGUARD, NOT A PET AND NOT A TURRET. It has one rule and the rule is the
// whole design: it stays on the player until something comes close, and then it
// goes for that instead. So it is worth nothing at all to a player who is
// keeping their distance and a great deal to one who has been cornered - which
// makes it the only offensive passive item in the pool that is worth MORE the
// worse the fight is going.
//
// TEN DAMAGE A BEAT is a Bee's rate and a Bee's damage, and that is what it was
// written against - except a bee expires and this never does. What pays for
// that is reach: a bee will cross forty metres at anything it likes, and the
// lamprey will not leave the player by more than LAMPREY_RANGE.
//
// THE HEAL IS ON THE KILL AND ONLY ON THE KILL. Two health for finishing
// something is small, and it has to be: a leech that healed per BITE would be
// a regeneration item with a decoration on it, and the player would be paid for
// standing in a crowd. It has to land the last hit, which is a thing it mostly
// does not do - the player's own gun usually gets there first.
export class Lamprey {
  constructor(game) {
    const p = game.player.pos;
    this.pos = new THREE.Vector3(p.x + 0.9, 1.2, p.z + 0.9);
    this.vel = new THREE.Vector3();
    this.target = null;
    // WHERE IT IS HOLDING STATION when there is nothing to bite. A point in the
    // WORLD, not an offset from the player, and that distinction is the whole
    // of how it behaves at rest - see the note in update().
    this.station = null;
    this.phase = Math.random() * Math.PI * 2;
    this._lastPulse = -1;
    this._bite = 0;
    this.kills = 0;

    const g = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    // TEAL, WHICH NOTHING HOSTILE IN THIS GAME WEARS. The player has to be able
    // to tell at a glance that the thing swimming past their shoulder is theirs.
    // WET AND DARK. Low roughness and a real metalness make the segments catch
    // the room's own lights as a moving highlight down the back, which is what
    // reads as a slick body - a flat matte tone at this size is a grey worm.
    // The emissive is a floor, not a glow: it stops the animal going black in
    // the unlit half of the arena without making it a lamp.
    const skin = own(new THREE.MeshStandardMaterial({
      color: 0x13564f, emissive: 0x07302c, emissiveIntensity: 0.5,
      roughness: 0.22, metalness: 0.45,
    }));
    this.mouthMat = own(new THREE.MeshStandardMaterial({
      color: 0xff4d6d, emissive: 0xff2d55, emissiveIntensity: 2.2,
      roughness: 0.4, metalness: 0.1,
    }));
    this.eyeMat = own(new THREE.MeshStandardMaterial({
      color: 0xa7ffeb, emissive: 0x64ffda, emissiveIntensity: 2.6,
      roughness: 0.4, metalness: 0.1,
    }));

    // THE BODY IS A CHAIN, not a mesh. Seven segments tapering to a point,
    // each one lagging the one in front of it by a frame's worth of easing -
    // which is the cheapest possible way to get an eel that actually SWIMS,
    // and it costs seven positions a frame. Nothing here is skinned, deformed
    // or animated by a curve; the segments simply follow each other, and the
    // undulation falls out of the lag for free.
    this.segs = [];
    for (let i = 0; i < LAMPREY_SEGS; i++) {
      const t = i / (LAMPREY_SEGS - 1);
      const r = 0.115 * (1 - t * 0.78);
      const geo = new THREE.SphereGeometry(r, 7, 6);
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, skin);
      m.scale.set(1, 0.82, 1.35);
      g.add(m);
      this.segs.push({ mesh: m, pos: this.pos.clone() });
    }

    // THE HEAD IS A MOUTH. A lamprey has no jaw - it is a ring of teeth - so
    // the head is an open funnel with a lit throat, which reads as "this thing
    // attaches to you" from any angle and is unmistakable against the roster.
    this.head = new THREE.Group();
    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.145, 0.085, 0.16, 10, 1, true), skin
    );
    funnel.rotation.x = Math.PI / 2;
    funnel.position.z = 0.09;
    funnel.material.side = THREE.DoubleSide;
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), this.mouthMat);
    throat.position.z = 0.055;
    const teeth = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.022, 5, 12), this.mouthMat);
    teeth.position.z = 0.165;
    this.geos.push(funnel.geometry, throat.geometry, teeth.geometry);
    this.head.add(funnel, throat, teeth);
    const eyeGeo = new THREE.SphereGeometry(0.03, 6, 5);
    this.geos.push(eyeGeo);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(sx * 0.1, 0.055, -0.02);
      this.head.add(eye);
    }
    // The gill row - seven pits down the side, which is the one detail that
    // makes it a lamprey rather than a worm.
    const gillGeo = new THREE.SphereGeometry(0.022, 5, 4);
    this.geos.push(gillGeo);
    for (let i = 0; i < 5; i++) {
      for (const sx of [-1, 1]) {
        const gill = new THREE.Mesh(gillGeo, this.mouthMat);
        gill.position.set(sx * 0.1, 0, -0.06 - i * 0.045);
        this.head.add(gill);
      }
    }
    g.add(this.head);

    // SMALL, AND IT SITS ON THE MOUTH. The first version was a 1.2m additive
    // sprite centred on the head at half opacity, which is wider than the whole
    // animal - the body disappeared inside a white blob and the only thing left
    // to read was the glow. A halo is here to make the thing FINDABLE at
    // twenty metres, not to light it: at 0.5 it is a spark at the mouth and the
    // segments behind it are still a silhouette.
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: game.effects.glowTex, color: 0xff5c7a, transparent: true,
      opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.halo.scale.setScalar(0.5);
    g.add(this.halo);
    this.mats.push(this.halo.material);

    this.group = g;
    game.scene.add(g);
    this.player = game.player;
  }

  update(dt, ctx) {
    const p = this.player;
    this.phase += dt * 3.4;

    // ---- who it is on ----------------------------------------------------
    //
    // RE-TARGETED EVERY FRAME, not on a cooldown, and that is deliberate: the
    // rule the player is meant to read is "it goes for whatever is closest to
    // me", and a leech that took a third of a second to notice something had
    // died would spend that third of a second chewing a corpse. The scan is one
    // pass over the enemy list measured from the PLAYER - not from the leech -
    // which is what makes it a bodyguard: the threat it picks is the one
    // threatening the person it is guarding.
    if (this.target && (this.target.dead || this._far(this.target))) this.target = null;
    if (!this.target) this.target = this._pick(ctx.enemies);
    // A leech that has been off biting comes back to a FRESH station rather
    // than to the one it left. The old one is wherever the player happened to
    // be standing when the fight started, which by now is usually a room away.
    if (this.target) this.station = null;

    let hold;
    if (this.target) {
      // Onto the body, at chest height, with a slow orbit so two frames never
      // ask for exactly the same point - a leech parked dead still on a chest
      // reads as a decal.
      const a = this.phase * 0.9;
      hold = _v.set(
        this.target.pos.x + Math.cos(a) * (this.target.radius + 0.35),
        this.target.pos.y + 0.9,
        this.target.pos.z + Math.sin(a) * (this.target.radius + 0.35)
      );
    } else {
      // ---- HOLDING STATION -------------------------------------------------
      //
      // IT PARKS. It does not orbit.
      //
      // The first version circled the player at a fixed radius on a phase
      // clock, on the reasoning that a companion welded to the camera would
      // read as an ornament. That was the wrong problem: an ornament is
      // ignorable and a thing swimming laps of your head is not. Something
      // moving continuously in the near periphery is exactly what the eye is
      // built to keep looking at, and the player has a fight to watch.
      //
      // So the station is a point in the WORLD, and it is only ever re-picked
      // when the player has actually walked out of the band it is comfortable
      // in. Standing still, the leech is still. Walking, it hangs back and then
      // swims after you in one movement rather than in a continuous circle.
      //
      // THE NEW STATION IS ALWAYS ON THE SIDE IT IS ALREADY ON. Taken from the
      // leech's own bearing off the player rather than from the player's
      // facing, which is what stops it crossing the view: re-stationing is a
      // step outward along the line it is already on, never a swing round to
      // some other quadrant. A leech directly overhead has no bearing worth
      // reading, so that one case falls back to behind the player's shoulder.
      const dx0 = this.pos.x - p.pos.x;
      const dz0 = this.pos.z - p.pos.z;
      const flat = Math.hypot(dx0, dz0);
      const gap = this.station
        ? Math.hypot(this.station.x - p.pos.x, this.station.z - p.pos.z)
        : Infinity;
      if (!this.station || gap > LAMPREY_HOLD_FAR || gap < LAMPREY_HOLD_NEAR) {
        let ux;
        let uz;
        if (flat > 0.4) {
          ux = dx0 / flat;
          uz = dz0 / flat;
        } else {
          ux = Math.sin(p.yaw);
          uz = Math.cos(p.yaw);
        }
        this.station = this.station || new THREE.Vector3();
        this.station.set(
          p.pos.x + ux * LAMPREY_HOLD,
          p.pos.y + LAMPREY_HOLD_Y,
          p.pos.z + uz * LAMPREY_HOLD
        );
      }
      // The station's height follows the player - they can be on a catwalk -
      // while the two horizontal coordinates stay exactly where they were put.
      this.station.y = p.pos.y + LAMPREY_HOLD_Y;
      // A slow rise and fall on top, and nothing else. It is the only motion a
      // parked leech has: enough that the thing reads as alive rather than as a
      // prop hanging in the air, small enough not to be worth a glance.
      hold = _v.set(
        this.station.x,
        this.station.y + Math.sin(this.phase * 0.55) * 0.11,
        this.station.z
      );
    }

    // STEERING, NOT SEEKING - the Bee's rule, for the Bee's reason: a velocity
    // nudged toward the mark and damped overshoots and comes back, and that
    // curve is what the eye reads as swimming. Snapping the heading every frame
    // would be a dart on a string.
    _v.sub(this.pos);
    const d = _v.length() || 1;
    _v.multiplyScalar(1 / d);
    this.vel.addScaledVector(_v, Math.min(d, 3) * 46 * dt);
    this.vel.multiplyScalar(1 - Math.min(1, dt * 3.4));
    const sp = this.vel.length();
    if (sp > LAMPREY_SPEED) this.vel.multiplyScalar(LAMPREY_SPEED / sp);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.max(0.35, this.pos.y);

    // ---- the bite --------------------------------------------------------
    //
    // ON THE BEAT, like the turret, the sentry and every fire tick in the game.
    // Nothing rhythmic here runs on a private timer - see Music.pulse - and a
    // leech chewing in time with the track is one more voice in the machine the
    // arena already sounds like.
    //
    // IT HAS TO BE ON THE BODY. A bite delivered from wherever it happens to be
    // would make the reach the enemy list rather than the animation, and the
    // player would watch it eat something a metre away.
    if (this.target && ctx.pulse !== this._lastPulse) {
      this._lastPulse = ctx.pulse;
      const t = this.target;
      const near = Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z)
        <= t.radius + 0.9;
      if (near) {
        this._bite = 1;
        // THE LAST HIT IS WHAT THE HEAL IS FOR, and `dead` after the call is
        // the only honest way to know it landed it: hurtEnemy goes through
        // Enemy.takeDamage, which is where wards, armour and resistances all
        // live, and a leech that healed off the damage it INTENDED would pay
        // out on a hit a warden ate.
        const wasAlive = !t.dead;
        ctx.hurtEnemy(t, LAMPREY_BITE);
        _v.set(t.pos.x, t.pos.y + 0.9, t.pos.z);
        ctx.effects.impact(_v, 0xff2d55, 6, 3.5, 2, 0.28);
        if (wasAlive && t.dead) this._finish(ctx);
      }
    } else if (!this.target) {
      this._lastPulse = ctx.pulse;
    }
    this._bite = Math.max(0, this._bite - dt * 5);

    // ---- the body follows the head ---------------------------------------
    this.group.position.set(0, 0, 0);
    this.head.position.copy(this.pos);
    // Faces where it is going, and rolls with the turn.
    if (sp > 0.05) {
      _v.copy(this.pos).add(this.vel);
      this.head.lookAt(_v);
    }
    // The clench: the mouth ring shuts on a bite and the throat flares.
    const bite = this._bite * this._bite;
    this.head.scale.set(1 - bite * 0.25, 1 - bite * 0.25, 1 + bite * 0.4);
    this.mouthMat.emissiveIntensity = 2.2 + bite * 5;
    this.halo.material.opacity = 0.24 + bite * 0.5;
    // On the MOUTH rather than on the body's centre, so the spark is where the
    // lit part of the model already is.
    this.halo.position.copy(this.pos);
    this.halo.scale.setScalar(0.5 + bite * 0.9);

    // Each segment eases toward the one in front, and the lag IS the swim. The
    // rate falls off down the chain so the tail trails further than the neck,
    // which is what makes the wave travel backwards along the body instead of
    // the whole thing bending at once.
    let lead = this.pos;
    for (let i = 0; i < this.segs.length; i++) {
      const s = this.segs[i];
      const k = Math.min(1, dt * (26 - i * 2.4));
      s.pos.lerp(lead, k);
      // A sideways sway laid on the DRAWN position and never on the followed
      // one, so it cannot accumulate into drift - the same trick the Bee's
      // wingbeat uses.
      const w = Math.sin(this.phase * 2.2 - i * 0.8) * 0.05 * (i / this.segs.length);
      s.mesh.position.set(s.pos.x + w, s.pos.y, s.pos.z + w);
      s.mesh.lookAt(lead);
      lead = s.pos;
    }
  }

  // The nearest living enemy inside the leash, measured from the PLAYER.
  _pick(enemies) {
    const p = this.player.pos;
    let best = null;
    let bestD = LAMPREY_RANGE * LAMPREY_RANGE;
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - p.x;
      const dz = e.pos.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= bestD) continue;
      bestD = d2;
      best = e;
    }
    return best;
  }

  // Dropped the moment the thing it is on walks out of the leash, which is what
  // stops it being towed across the arena by a fleeing enemy.
  _far(e) {
    const p = this.player.pos;
    return Math.hypot(e.pos.x - p.x, e.pos.z - p.z) > LAMPREY_RANGE + 3;
  }

  // It landed the last hit. The heal, the tell, and the immediate re-target -
  // "if another enemy is nearby, go to it; otherwise come back" is not a
  // separate rule, it is what _pick already returns on the very next frame, so
  // there is nothing here but clearing the corpse.
  _finish(ctx) {
    this.kills++;
    this.target = null;
    const p = this.player;
    if (p.health < p.maxHealth) {
      p.health = Math.min(p.maxHealth, p.health + LAMPREY_HEAL);
    }
    // The heal has to be legible or a leech that killed something looks exactly
    // like a leech that did not: a green pulse at the player, in the vitality
    // colour every other heal in the game uses.
    ctx.effects.shockwave(p.pos, 0x00e676, 2.6, 0.35);
    ctx.effects.impact(this.pos, 0x00e676, 12, 5, 3, 0.45);
    ctx.sfx.lamprey();
    this._bite = 1;
  }

  destroy() {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

const LAMPREY_SEGS = 7;
// How far from the PLAYER it will go for a target, what one bite is worth, and
// what a kill it finished heals. The bite is a Bee's, twice a beat; the range
// is deliberately short, because a bodyguard that ranged out to twenty metres
// would be a turret that follows you.
const LAMPREY_RANGE = 11;
const LAMPREY_BITE = 10;
const LAMPREY_HEAL = 2;
// Fast enough to keep station on a dashing player and slow enough to visibly
// lag one, which is the whole reason it reads as swimming after them.
const LAMPREY_SPEED = 17;
// WHERE IT PARKS, and the band it will tolerate before moving. Two and a half
// metres is outside arm's reach and inside peripheral vision: close enough to
// read as escorting the player, far enough that it is never between them and
// what they are shooting at. The band is deliberately WIDE - a player shuffling
// a step in a firefight must not set the thing swimming.
const LAMPREY_HOLD = 2.5;
const LAMPREY_HOLD_Y = 1.5;
const LAMPREY_HOLD_NEAR = 1.6;
const LAMPREY_HOLD_FAR = 3.6;
