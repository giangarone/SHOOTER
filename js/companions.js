// THE THINGS THAT ARE ALIVE.
//
// Everything else the player owns is a number, a window or a piece of
// furniture. A turret is a gun with a cooldown, the bees are a cloud on a
// timer, and every passive item in items/passive/index.js is a multiplier that applies
// itself without being watched. These are neither: they are around for the
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
import { groundSurface, resolveCircle, STEP_HEIGHT } from './utils.js';
import { BOUND } from './arena.js';
import { ACTIVE_ITEMS } from './items/active/index.js';
import { PLAYER_STATUS_KEYS } from './status.js';

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
// TEN DAMAGE ON THE DOWNBEAT - once a beat, where everything else rhythmic in
// the game fires on the half-beat pulse. That is a Bee's damage at half a Bee's
// rate, and it is what it was written against - except a bee expires and this
// never does. What pays for
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
    // ON THE DOWNBEAT, and on the downbeat ONLY. `pulse` is the half-beat edge
    // the sentry guns and every fire tick ride; `pulseWhole` says the pulse now
    // standing is a WHOLE beat, which is the same gate poison's one-tick-a-beat
    // already uses. Nothing rhythmic here runs on a private timer - see
    // Music.pulse - and a leech chewing on the kick drum is one more voice in
    // the machine the arena already sounds like, as well as being the one rate
    // a player can count without reading a damage number.
    //
    // IT HAS TO BE ON THE BODY. A bite delivered from wherever it happens to be
    // would make the reach the enemy list rather than the animation, and the
    // player would watch it eat something a metre away.
    if (this.target && ctx.pulse !== this._lastPulse && ctx.pulseWhole) {
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
    // Unconditional now, where it used to be guarded on being hurt: OVERDRAW
    // turns the part that does not fit into item charge, so a leech biting for
    // a player at full health is no longer doing nothing. See Player.heal.
    p.heal(LAMPREY_HEAL);
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
// what a kill it finished heals. The bite is a Bee's, once a beat; the range
// is deliberately short, because a bodyguard that ranged out to twenty metres
// would be a turret that follows you.
const LAMPREY_RANGE = 11;
// Ten a DOWNBEAT - see the bite block above for why it is a whole beat and not
// the half-beat pulse everything else rhythmic in the game fires on.
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

// ---------------------------------------------------------------------------
// THE FIVE FAMILIARS
// ---------------------------------------------------------------------------
//
// Five more living things, all on the contract at the top of this file. What
// separates them from the two above is what they fetch: the magpie and the
// lamprey answer questions about the ROOM (money left on the floor, something
// too close), and these five answer questions about the PLAYER - a status they
// are wearing, a hit they just took, a press they just made, a crate they
// cannot spare the walk for.

// The findable-across-the-room glow every pet wears. A sprite rather than a
// real light, because a real light changes the scene's light count and forces
// three.js to recompile every material in it - the rule pickups live by, and a
// pet is no exception.
function haloSprite(game, color, scale, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: game.effects.glowTex, color, transparent: true,
    opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  s.scale.setScalar(scale);
  return s;
}

// ---------------------------------------------------------------------------
// Walker - the four paws-and-floor half of being a pet
// ---------------------------------------------------------------------------
//
// The magpie's walk, factored out: four of the familiars are ground animals
// that stop at heel, hurry for an errand, hop as they go and never moonwalk.
// Each keeps its own build and its own update; what they share is the MOVING,
// so the movement is the base class and everything that makes one a toad
// rather than a rat sits above it.
class Walker {
  constructor(game, radius, sideA = 2.3) {
    const p = game.player.pos;
    this.player = game.player;
    this.pos = new THREE.Vector3(p.x + 1.1, p.y, p.z + 1.1);
    this.yaw = 0;
    this.radius = radius;
    // WHERE THIS ONE WAITS, as an angle off the player's facing. Every
    // familiar takes its own side of the player's back, so two pets never
    // walk the same line home or stand in each other.
    this.slotA = sideA;
    // The walk-cycle phase and this frame's speed, for the pose code. The one
    // is driven by the other - a pet that stops moving stops hopping, at
    // whatever phase it was on, exactly like the magpie.
    this._hop = 0;
    this.speed = 0;
    this.station = null;
    // Vertical velocity, owned by the hop in step() - zero means grounded.
    this._vy = 0;
  }

  /**
   * Following at heel WITHOUT orbiting. The station is a point in the WORLD,
   * re-picked only when the player has actually walked out of the band the
   * pet is comfortable in - the lamprey's rule, for the lamprey's reason: a
   * pet welded to the player's BACK reads as an ornament you can never look
   * at, because the moment you turn toward it, it moves behind you again.
   * Relaxing inside a band is what lets a player walk up and LOOK at their
   * toad; it holds still until the player leaves.
   *
   * @returns {number} the speed it actually moved at, for the walk cycle.
   */
  follow(dt, walk, sprint, ctx) {
    const p = this.player;
    const gap = this.station
      ? Math.hypot(this.station.x - p.pos.x, this.station.z - p.pos.z)
      : Infinity;
    if (!this.station || gap > WALKER_HOLD_FAR || gap < WALKER_HOLD_NEAR) {
      const a = p.yaw + this.slotA;
      this.station = this.station || new THREE.Vector3();
      this.station.set(
        p.pos.x - Math.sin(a) * WALKER_HOLD, 0, p.pos.z - Math.cos(a) * WALKER_HOLD
      );
    }
    return this.step(dt, this.station.x, this.station.z, walk, sprint, 0.55, ctx);
  }

  /**
   * Moves toward (tx,tz), stopping `stop` metres short. Stays in the room, out
   * of the crates and on the floor it is standing on - the same three calls in
   * the same order every ground mover in the game makes.
   *
   * @returns {number} the speed it actually moved at, for the walk cycle.
   */
  step(dt, tx, tz, walk, sprint, stop, ctx) {
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const px = this.pos.x;
    const pz = this.pos.z;
    let speed = 0;
    if (dist > stop) {
      // Sprints when a long way behind - a pet that cannot catch up is a pet
      // that is always somewhere else.
      speed = Math.min(sprint, walk * (1 + Math.max(0, dist - 6) * 0.35));
      const k = (speed * dt) / dist;
      this.pos.x += dx * k;
      this.pos.z += dz * k;
      // Turns toward where it is going rather than snapping - a snap swings
      // the tail through the floor.
      const aim = Math.atan2(dx, dz);
      let turn = aim - this.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this.yaw += turn * Math.min(1, dt * 9);
    }
    this.pos.x = Math.max(-BOUND + 0.6, Math.min(BOUND - 0.6, this.pos.x));
    this.pos.z = Math.max(-BOUND + 0.6, Math.min(BOUND - 0.6, this.pos.z));
    resolveCircle(this.pos, this.radius, ctx.obstacles, 1.0);

    // THE HOP. Stairs are handled by the step below, for every ground mover's
    // reason - but a pet on a straight line to its player does not route
    // around furniture the way the nav grid routes enemies, so a crate between
    // them used to be a stall forever. The test is the one a charging boss
    // uses to feel a wall (see Enemy): the resolve had to cancel real
    // progress. When it did, the pet hops - one fixed arc, tall enough for
    // cover, not for the tier decks: a 3m shelf is a WALL, and a rat arriving
    // over one would read as a bug, not as agility.
    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    if (speed > 0 && this._vy <= 0 && moved < speed * dt * 0.4) {
      this._vy = WALKER_HOP_V;
    }
    // While the arc is up, the floor query is allowed to see the box being
    // jumped ONTO, which is what lands the pet on top of cover rather than
    // beside it. Grounded, the usual ease.
    const floor = groundSurface(this.pos, this.radius, ctx.obstacles,
      this._vy !== 0 ? WALKER_HOP_STEP : STEP_HEIGHT);
    if (this._vy > 0 || this.pos.y > floor + 0.01) {
      this._vy -= 22 * dt;
      this.pos.y += this._vy * dt;
      if (this._vy <= 0 && this.pos.y <= floor) {
        this.pos.y = floor;
        this._vy = 0;
      }
    } else {
      this.pos.y += (floor - this.pos.y) * Math.min(1, dt * 12);
    }
    this._hop += speed * dt * 4.2;
    this.speed = speed;
    return speed;
  }

  destroy() {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// WHERE THE WALKERS WAIT, and the band they tolerate before moving: two and a
// half metres is outside arm's reach and inside peripheral vision, and the band
// is deliberately WIDE - a player shuffling a step in a firefight must not set
// four pets scurrying, and a player turning round must not move them at all.
const WALKER_HOLD = 2.4;
const WALKER_HOLD_NEAR = 1.5;
const WALKER_HOLD_FAR = 4.2;
// The hop's launch speed and what it may land on: an arc peaking around 1.25m
// clears the arena's cover pieces (0.95) and stops short of its tier decks,
// which are walls, not furniture. Gravity 22, like everything thrown.
const WALKER_HOP_V = 7.4;
const WALKER_HOP_STEP = 1.3;

// ---------------------------------------------------------------------------
// MARSH TOAD - licks negative statuses off you
// ---------------------------------------------------------------------------
//
// THE TOAD IS THE CLEANSE THAT WALKS. WHITE CELL is a button: press and the
// burn is gone, NOW, with two seconds of immunity behind it. The toad is the
// same answer on the pet's terms - it notices what you are wearing and licks
// it off, all of it, but only once every five seconds and only once it has
// hopped close enough to reach you. A burn that lands between licks runs; a
// burn the toad is already winding up on is gone. That gap is the whole
// difference between a pet and the item, and it is why this can ride on a
// passive pick.
//
// IT CLEARS EVERYTHING AT ONCE. Licking off one effect and leaving the chill
// would be a pet the player has to check its homework; a lick is a lick.
export class MarshToad extends Walker {
  constructor(game) {
    super(game, 0.3, 2.15);
    this.nextLickAt = 0;
    this._lick = 0;

    const g = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    const mesh = (geo, mat) => { this.geos.push(geo); return new THREE.Mesh(geo, mat); };
    // SWAMP GREEN, lifted well off the ground it squats on for the turret
    // shell's reason: an unlit dark toad is a hole in the floor. The belly and
    // the throat sac are the pale of wet underbrush, and the one WARM thing on
    // the model is the tongue - a lick has to read at twenty metres or the
    // item is invisible.
    const skin = own(new THREE.MeshStandardMaterial({
      color: 0x4e7a3a, roughness: 0.55, metalness: 0.05,
    }));
    const belly = own(new THREE.MeshStandardMaterial({
      color: 0xb7c98e, roughness: 0.7, metalness: 0.02,
    }));
    const wart = own(new THREE.MeshStandardMaterial({
      color: 0x33501f, roughness: 0.5, metalness: 0.05,
    }));
    this.sacMat = own(new THREE.MeshStandardMaterial({
      color: 0xd8eab0, emissive: 0x9ede5f, emissiveIntensity: 0.35,
      roughness: 0.35, metalness: 0.02,
    }));
    this.tongueMat = own(new THREE.MeshStandardMaterial({
      color: 0xff5c7a, emissive: 0xff2d55, emissiveIntensity: 1.2,
      roughness: 0.35, metalness: 0.05,
    }));
    this.eyeMat = own(new THREE.MeshStandardMaterial({
      color: 0xd8ff9e, emissive: 0xaeea3c, emissiveIntensity: 2.0,
      roughness: 0.4, metalness: 0.1,
    }));
    const mouthMat = own(new THREE.MeshStandardMaterial({
      color: 0x1c2b12, roughness: 0.6, metalness: 0.05,
    }));

    // THE BODY IS A WIDE SQUAT MOUND - a toad is a body with a head on it, not
    // a head on a body, and the proportions are the read.
    const body = mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
    body.position.y = 0.15;
    body.scale.set(1.32, 0.62, 1.02);
    const bib = mesh(new THREE.SphereGeometry(0.15, 8, 6), belly);
    bib.position.set(0, 0.105, 0.1);
    bib.scale.set(1.15, 0.6, 0.8);
    g.add(body, bib);
    // THE THROAT SAC. Inflates as the wind-up and glows while there is
    // something to lick - the one tell a player needs from behind their own
    // shoulder.
    this.sac = mesh(new THREE.SphereGeometry(0.1, 8, 6), this.sacMat);
    this.sac.position.set(0, 0.115, 0.185);
    this.sac.scale.set(0.9, 0.65, 0.65);
    g.add(this.sac);
    // Eyes on bumps, ON TOP of the mound, which is what keeps this a toad and
    // not a frog. Two per side is two meshes too many.
    const bumpGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const eyeGeo = new THREE.SphereGeometry(0.033, 7, 6);
    this.geos.push(bumpGeo, eyeGeo);
    for (const sx of [-1, 1]) {
      const bump = new THREE.Mesh(bumpGeo, skin);
      bump.position.set(sx * 0.1, 0.285, 0.08);
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(sx * 0.1, 0.315, 0.115);
      // Folded hind legs - the two fat commas at the sides that make the
      // silhouette a squat rather than a mound.
      const leg = new THREE.Mesh(bumpGeo, skin);
      leg.position.set(sx * 0.21, 0.09, -0.03);
      leg.scale.set(1.6, 1.25, 1.9);
      g.add(bump, eye, leg);
    }
    // The mouth: one dark seam across the whole face, mouth-wide, which is the
    // thing a toad's face IS.
    const mouth = mesh(new THREE.BoxGeometry(0.24, 0.012, 0.02), mouthMat);
    mouth.position.set(0, 0.175, 0.2);
    g.add(mouth);
    // Warts, five of them, darker than the skin. Detail nobody needs and the
    // back would be a balloon without.
    const wartGeo = new THREE.SphereGeometry(0.02, 5, 4);
    this.geos.push(wartGeo);
    for (const [wx, wy, wz] of [[-0.09, 0.255, -0.06], [0, 0.265, -0.02],
      [0.09, 0.255, -0.06], [-0.14, 0.205, 0.05], [0.14, 0.205, 0.05]]) {
      const w = new THREE.Mesh(wartGeo, wart);
      w.position.set(wx, wy, wz);
      g.add(w);
    }

    // THE TONGUE, hidden until the lick. A unit-long ribbon rooted at the
    // mouth so scaling z stretches it to the player's chest; the tip is a bulb
    // one size up, because a tongue that ends in a point reads as a wire.
    this.tongue = new THREE.Group();
    const lash = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.018, 1), this.tongueMat);
    this.geos.push(lash.geometry);
    lash.position.z = 0.5;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045, 7, 6), this.tongueMat);
    this.geos.push(tip.geometry);
    tip.position.z = 1;
    this.tongue.add(lash, tip);
    this.tongue.position.set(0, 0.18, 0.21);
    this.tongue.visible = false;
    g.add(this.tongue);

    this.halo = haloSprite(game, 0x9ede5f, 0.85, 0.24);
    this.halo.position.y = 0.3;
    g.add(this.halo);
    this.mats.push(this.halo.material);

    g.position.copy(this.pos);
    this.group = g;
    game.scene.add(g);
  }

  // Anything from the one table that is currently on the player. Read off the
  // table rather than naming an effect, so a seventh status is covered without
  // a line here - the HUD's rule, for the HUD's reason (see status.js).
  _afflicted() {
    const s = this.player.status;
    for (const k of PLAYER_STATUS_KEYS) if (s[k] > 0) return true;
    return false;
  }

  update(dt, ctx) {
    const p = this.player;
    const afflicted = this._afflicted();
    const dxp = p.pos.x - this.pos.x;
    const dzp = p.pos.z - this.pos.z;
    const nearPlayer = Math.hypot(dxp, dzp) <= TOAD_REACH;

    // THE LICK. Cooldown-gated and CLOSE-gated: a toad that licked a status
    // off from across the room would be the cleanse with extra steps, and the
    // hop over is the price the pet pays that WHITE CELL's button does not.
    // The cooldown alone paces it - the tongue animation never gates the bite.
    if (afflicted && ctx.time >= this.nextLickAt && nearPlayer) {
      this.nextLickAt = ctx.time + TOAD_COOLDOWN;
      this._lick = 1;
      p.clearStatuses();
      _v.set(p.pos.x, p.pos.y + 0.6, p.pos.z);
      ctx.effects.shockwave(_v, 0x9ede5f, 2.4, 0.3);
      ctx.effects.impact(_v, 0xd8ff9e, 8, 3, 2, 0.3);
      ctx.sfx.toad();
    }
    this._lick = Math.max(0, this._lick - dt / TOAD_LICK_TIME);

    // Mid-lick the toad is planted and facing its dinner; the rest of the time
    // it waits nearby and holds still until the player actually leaves.
    let speed;
    if (this._lick > 0) {
      const aim = Math.atan2(dxp, dzp);
      let turn = aim - this.yaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this.yaw += turn * Math.min(1, dt * 14);
      speed = this.step(dt, this.pos.x, this.pos.z, TOAD_WALK, TOAD_SPRINT, 0, ctx);
    } else {
      speed = this.follow(dt, TOAD_WALK, TOAD_SPRINT, ctx);
    }

    // The tongue's arc: out fast, back slower - one sine over the window, so
    // the strike accelerates and the return lingers a touch.
    const lash = this._lick > 0 ? Math.sin(Math.PI * (1 - this._lick)) : 0;
    this.tongue.visible = lash > 0.02;
    if (this.tongue.visible) {
      const dist = Math.max(0.3, Math.hypot(dxp, dzp));
      const wy = this.pos.y + 0.18;
      this.tongue.rotation.y = Math.atan2(dxp, dzp) - this.yaw;
      this.tongue.rotation.x = -Math.atan2(p.pos.y + 0.85 - wy, dist);
      this.tongue.scale.z = Math.min(TOAD_REACH, dist) * lash;
    }

    // The hop - heavier than the bird's, because a toad PLODS: bigger arc,
    // longer on the floor between bounds.
    const hop = Math.abs(Math.sin(this._hop));
    this.group.position.set(
      this.pos.x, this.pos.y + hop * 0.11 * Math.min(1, speed), this.pos.z
    );
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = hop * 0.1 * Math.min(1, speed);
    // The sac keeps the score: flared at the strike, faintly lit whenever
    // there is something on the player it cannot yet reach for.
    const wind = this._lick * this._lick;
    this.sac.scale.set(0.9 + wind * 0.55, 0.65 + wind * 0.6, 0.65 + wind * 0.55);
    this.sacMat.emissiveIntensity = 0.35 + wind * 1.6 + (afflicted ? 0.5 : 0);
    this.halo.material.opacity = 0.22 + wind * 0.35;
  }
}

// What the card says: a five-second cooldown on the lick. The reach is long
// enough that a toad doing its job - staying close - is always inside it, and
// short enough that one left across the arena has to hop before it helps.
const TOAD_COOLDOWN = 5;
const TOAD_REACH = 6;
const TOAD_WALK = 5;
const TOAD_SPRINT = 13;
// Seconds, tongue fully out to gone. Long enough to see, short enough that the
// animal is not standing there with its mouth open.
const TOAD_LICK_TIME = 0.5;

// ---------------------------------------------------------------------------
// RUBBER CHICKEN - takes a hit's attention for you
// ---------------------------------------------------------------------------
//
// A DECOY THAT IS ALREADY THERE. The monkey is thrown: you pick the ground,
// you spend the charge, you wait out the arc. The chicken is the same bet
// placed BEFORE the fight - it trots at your heel being nobody, and the frame
// a hit lands it plants where it stands and becomes the loudest thing in the
// room. Three seconds of the crowd aiming at IT, which is the three seconds a
// hit just cost you being handed back.
//
// IT IS A LURE ON THE MONKEY'S OWN TERMS, literally: `lure`, `armed` and a
// complete decoy stand-in, the three things _findLure reads, so not one enemy
// type, ai() or boss has to know the chicken exists. What it is NOT is a
// deployable - it answers to the companion list for the reason on the contract
// at the top of this file: a pet you bury once a minute is a different item.
//
// NO COOLDOWN. The window does not make hits impossible - rounds already in
// the air still fly, exactly as the monkey's do - so the item can never strand
// the player in an infinite squeak; it can only ever hand back what a hit just
// took.
export class RubberChicken extends Walker {
  constructor(game) {
    super(game, 0.22, -2.15);
    // These three are the lure contract main.js reads, byte for byte the
    // monkey's. `armed` is the pair that matters: true only inside the window,
    // so _findLure walks past the bird the rest of the time for free.
    this.lure = true;
    this.armed = false;
    const self = this;
    this.decoy = {
      pos: this.pos,
      vel: new THREE.Vector3(),
      get yaw() { return self.yaw; },
      eyeH: CHICKEN_EYE,
      eyeInto: (v) => v.copy(self.pos).setY(self.pos.y + CHICKEN_EYE),
      forwardInto: (v) => v.set(-Math.sin(self.yaw), 0, -Math.cos(self.yaw)),
    };
    this._decoyUntil = -1;
    this._nextSqueak = 0;
    this._now = -1;

    const g = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    const mesh = (geo, mat) => { this.geos.push(geo); return new THREE.Mesh(geo, mat); };
    // YELLOW VINYL - a rubber chicken is one cast piece and it has to read as
    // one, so the body, neck and wings share a material with a sheen, and the
    // colour story is told by the trim: red comb and wattle, orange beak and
    // legs, and two bulging googly eyes. Vinyl at this size means low
    // roughness - the room's lights have to slide down the back.
    const vinyl = own(new THREE.MeshStandardMaterial({
      color: 0xf2c23e, roughness: 0.32, metalness: 0.08,
    }));
    const trim = own(new THREE.MeshStandardMaterial({
      color: 0xe53935, roughness: 0.45, metalness: 0.05,
      emissive: 0x8e0000, emissiveIntensity: 0.25,
    }));
    const orange = own(new THREE.MeshStandardMaterial({
      color: 0xff8f2e, roughness: 0.5, metalness: 0.05,
    }));
    const white = own(new THREE.MeshStandardMaterial({
      color: 0xf8f4e8, roughness: 0.35, metalness: 0.02,
    }));
    const pupil = own(new THREE.MeshStandardMaterial({
      color: 0x141210, roughness: 0.4, metalness: 0.1,
    }));

    // THE BODY IS A PEAR. Wide base, narrow shoulder, a neck out of the top -
    // the one silhouette everybody has squeezed at some point.
    const body = mesh(new THREE.SphereGeometry(0.13, 10, 8), vinyl);
    body.position.y = 0.23;
    body.scale.set(0.88, 1.2, 0.82);
    const neck = mesh(new THREE.CylinderGeometry(0.04, 0.052, 0.2, 8), vinyl);
    neck.position.set(0, 0.41, 0.03);
    neck.rotation.x = -0.14;
    const head = mesh(new THREE.SphereGeometry(0.082, 9, 7), vinyl);
    head.position.set(0, 0.5, 0.075);
    g.add(body, neck, head);

    // The OPEN beak, which is the whole joke: the thing permanently
    // mid-shriek. Two cones, top static and bottom dropped, and the gap
    // between them is what the squeeze answers to.
    this.beakTop = mesh(new THREE.ConeGeometry(0.032, 0.11, 6), orange);
    this.beakTop.position.set(0, 0.5, 0.185);
    this.beakTop.rotation.x = Math.PI / 2 + 0.12;
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, 0.475, 0.125);
    const jawMesh = mesh(new THREE.ConeGeometry(0.025, 0.08, 6), orange);
    jawMesh.position.set(0, -0.012, 0.045);
    jawMesh.rotation.x = Math.PI / 2 + 0.1;
    this.jaw.add(jawMesh);
    g.add(this.beakTop, this.jaw);
    // Comb and wattle: the red that says this particular cast is a chicken.
    const combGeo = new THREE.SphereGeometry(0.03, 7, 5);
    this.geos.push(combGeo);
    for (const [cz, cs] of [[0.035, 1.1], [0.075, 1.35], [0.115, 1.0]]) {
      const c = new THREE.Mesh(combGeo, trim);
      c.position.set(0, 0.575, cz);
      c.scale.set(0.45, cs, 0.9);
      g.add(c);
    }
    const wattle = mesh(new THREE.SphereGeometry(0.026, 6, 5), trim);
    wattle.position.set(0, 0.445, 0.15);
    wattle.scale.set(0.7, 1.25, 0.7);
    g.add(wattle);
    // GOOGLY EYES, on stalks of nothing: big white domes and pupils a wobble
    // off centre. The squeeze pops them - see update().
    const eyeGeo = new THREE.SphereGeometry(0.031, 8, 6);
    const pupilGeo = new THREE.SphereGeometry(0.013, 6, 5);
    this.geos.push(eyeGeo, pupilGeo);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, white);
      eye.position.set(sx * 0.052, 0.545, 0.13);
      const dot = new THREE.Mesh(pupilGeo, pupil);
      dot.position.set(sx * 0.06, 0.548, 0.156);
      g.add(eye, dot);
      this.eyes.push(dot);
    }
    // Wings, legs and feet - the wings pivot so the squeeze can throw them
    // out; the feet are flat slabs so the thing stands when it plants.
    const wingGeo = new THREE.SphereGeometry(0.09, 7, 5);
    const legGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.14, 5);
    const footGeo = new THREE.BoxGeometry(0.05, 0.014, 0.08);
    this.geos.push(wingGeo, legGeo, footGeo);
    this.wings = [];
    this.legs = [];
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.105, 0.3, 0.01);
      const wing = new THREE.Mesh(wingGeo, vinyl);
      wing.position.set(0, -0.06, -0.01);
      wing.scale.set(0.3, 0.95, 1.2);
      pivot.add(wing);
      const leg = new THREE.Mesh(legGeo, orange);
      leg.position.set(sx * 0.05, 0.075, 0.015);
      const foot = new THREE.Mesh(footGeo, orange);
      foot.position.set(sx * 0.05, 0.008, 0.05);
      g.add(pivot, leg, foot);
      this.wings.push({ pivot, sx });
      this.legs.push(leg);
    }
    // The tail: two flat feathers ajar, the cheapest read on the rear.
    const tailGeo = new THREE.ConeGeometry(0.028, 0.16, 4);
    this.geos.push(tailGeo);
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(tailGeo, vinyl);
      t.position.set(sx * 0.035, 0.36, -0.12);
      t.rotation.set(-Math.PI / 2 - 0.55, 0, sx * 0.28);
      g.add(t);
    }

    this.halo = haloSprite(game, 0xffdf3e, 0.9, 0.24);
    this.halo.position.y = 0.34;
    g.add(this.halo);
    this.mats.push(this.halo.material);

    g.position.copy(this.pos);
    this.group = g;
    game.scene.add(g);
  }

  // THE HIT FINDS OUT HERE. Called by main.js _hurtPlayer on the frame one
  // lands, beside PANIC TURRET - a hit that was dodged, warded or grazed never
  // reaches this line, which is exactly the population "after you take a hit"
  // means. The clock is HANDED in because a pet armed mid-frame has not been
  // told the time yet this frame.
  onPlayerHurt(time) {
    this._decoyUntil = time + CHICKEN_WINDOW;
    this._nextSqueak = time;
  }

  update(dt, ctx) {
    this._now = ctx.time;
    const wasArmed = this.armed;
    this.armed = ctx.time < this._decoyUntil;

    let speed = 0;
    if (this.armed) {
      // PLANTED. The whole point of the window is that the crowd converges on
      // where the chicken IS, so it holds its ground and squeezes - a decoy
      // that followed the player would keep the crowd on the player.
      this.step(dt, this.pos.x, this.pos.z, CHICKEN_WALK, CHICKEN_SPRINT, 0, ctx);
      if (ctx.time >= this._nextSqueak) {
        this._nextSqueak += CHICKEN_WINDOW / 3;
        ctx.sfx.chicken();
        _v.set(this.pos.x, this.pos.y + 0.5, this.pos.z);
        ctx.effects.impact(_v, 0xffdf3e, 4, 2.6, 1.4, 0.2);
      }
    } else {
      // Back to being nobody. The release squeak is the window CLOSING, so the
      // player with their back turned hears the crowd come off the bird - but
      // only if the window actually elapsed, not on the frame it was spent
      // down to zero by construction.
      if (wasArmed) ctx.sfx.chicken(0.4);
      speed = this.follow(dt, CHICKEN_WALK, CHICKEN_SPRINT, ctx);
    }

    // The walk cycle is the magpie's - bouncing feet, a lean at pace - except
    // the SQUEEZE, which squashes the whole bird on the squeak and pops the
    // eyes and wings with it. A rubber chicken reads by deforming.
    const hop = Math.abs(Math.sin(this._hop));
    this.group.position.set(
      this.pos.x, this.pos.y + hop * 0.07 * Math.min(1, speed), this.pos.z
    );
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = -Math.min(0.18, speed * 0.03) + hop * 0.04;
    let squash = 1;
    if (this.armed) {
      const q = 0.5 + 0.5 * Math.sin(ctx.time * 22);
      squash = q * q;
      this.group.scale.set(1 + squash * 0.24, 1 - squash * 0.18, 1 + squash * 0.24);
      this.group.rotation.y = this.yaw + Math.sin(ctx.time * 3.1) * 0.25;
    } else {
      this.group.scale.setScalar(1);
    }
    for (const w of this.wings) {
      w.pivot.rotation.z = w.sx * (0.12 + squash * 1.0 + hop * 0.12);
    }
    this.jaw.rotation.x = squash * 0.55;
    const stride = Math.sin(this._hop) * 0.09 * Math.min(1, speed);
    this.legs[0].rotation.x = stride * 6;
    this.legs[1].rotation.x = -stride * 6;
    for (const dot of this.eyes) dot.scale.setScalar(1 + squash * 0.9);
    this.halo.material.opacity = this.armed ? 0.5 + squash * 0.3 : 0.22;
    this.halo.scale.setScalar(this.armed ? 1.3 + squash * 0.4 : 0.9);
  }
}

// How long the crowd is fooled, what an enemy aims at, and how fast it waddles.
// THREE SECONDS IS THE ITEM: long enough to break contact off a hit that just
// landed, short enough that the crowd it gathered is still gathered.
const CHICKEN_WINDOW = 3;
const CHICKEN_EYE = 0.5;
const CHICKEN_WALK = 5;
const CHICKEN_SPRINT = 13;

// ---------------------------------------------------------------------------
// PARROT - repeats your active item, five seconds later
// ---------------------------------------------------------------------------
//
// AN ECHO WITH WINGS. The bird watches the ONE funnel every press goes through
// (Game.tryActiveItem hands each use to the pets - see onItemUsed) and, at
// most once every thirty seconds, memorises the press; five seconds later it
// plays it back through the same running list a real press fires into. Five is
// long enough that the repeat lands in a different moment - the grenade's
// second fall comes after the first has scattered the crowd, not on top of it.
//
// THE BIRD COPIES THE PRESS, NOT THE BILL. An item whose use charges a price
// of its own - credits, rounds, health - is never repeated, because a press
// the player never made must not take anything off them. And a repeat still
// asks the item's own ready() first, exactly as a press does, minus the
// charge: a boss that is already dead cannot be executed twice.
export class Parrot {
  constructor(game) {
    this.game = game;
    this.player = game.player;
    const p = this.player.pos;
    this.pos = new THREE.Vector3(p.x - 1.2, p.y + 1.45, p.z - 1.2);
    this.vel = new THREE.Vector3();
    this.station = null;
    this.phase = Math.random() * Math.PI * 2;
    this.echoId = null;
    this.echoAt = 0;
    this.readyAt = 0;
    this._squawk = 0;
    this._pyaw = 0;
    this._bank = 0;

    const g = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    const mesh = (geo, mat) => { this.geos.push(geo); return new THREE.Mesh(geo, mat); };
    // A BLUE-AND-GOLD MACAW, because scarlet red is what half the enemies in
    // the room already wear and a pet has to read as YOURS through the smoke.
    // Blue body, gold underwing and belly, white cheek patch, near-black beak.
    const blue = own(new THREE.MeshStandardMaterial({
      color: 0x2f5fd0, roughness: 0.55, metalness: 0.1,
      emissive: 0x0a1f4d, emissiveIntensity: 0.35,
    }));
    const gold = own(new THREE.MeshStandardMaterial({
      color: 0xffc94d, roughness: 0.5, metalness: 0.15,
    }));
    const cheek = own(new THREE.MeshStandardMaterial({
      color: 0xf2ede0, roughness: 0.65, metalness: 0.02,
    }));
    const beakMat = own(new THREE.MeshStandardMaterial({
      color: 0x2b2f36, roughness: 0.35, metalness: 0.4,
    }));
    this.eyeMat = own(new THREE.MeshStandardMaterial({
      color: 0xffe08a, emissive: 0xffc94d, emissiveIntensity: 2.2,
      roughness: 0.4, metalness: 0.1,
    }));
    const pupilMat = own(new THREE.MeshStandardMaterial({
      color: 0x101216, roughness: 0.4, metalness: 0.1,
    }));

    const body = mesh(new THREE.SphereGeometry(0.125, 10, 8), blue);
    body.scale.set(0.82, 0.95, 1.25);
    const breast = mesh(new THREE.SphereGeometry(0.095, 8, 6), gold);
    breast.position.set(0, -0.035, 0.075);
    breast.scale.set(0.82, 0.9, 0.9);
    const head = mesh(new THREE.SphereGeometry(0.088, 9, 7), blue);
    head.position.set(0, 0.145, 0.09);
    const face = mesh(new THREE.SphereGeometry(0.048, 7, 5), cheek);
    face.position.set(0, 0.15, 0.16);
    face.scale.set(0.95, 0.9, 0.6);
    g.add(body, breast, head, face);

    // The beak - the macaw's whole face. Hooked down, near-black, and the
    // LOWER half is on a pivot so the squawk has somewhere to come out of.
    const hook = mesh(new THREE.ConeGeometry(0.032, 0.1, 6), beakMat);
    hook.position.set(0, 0.13, 0.205);
    hook.rotation.x = Math.PI / 2 + 0.55;
    g.add(hook);
    this.jaw = new THREE.Group();
    this.jaw.position.set(0, 0.105, 0.15);
    const jawMesh = mesh(new THREE.ConeGeometry(0.02, 0.05, 5), beakMat);
    jawMesh.position.set(0, -0.012, 0.035);
    jawMesh.rotation.x = Math.PI / 2 + 0.35;
    this.jaw.add(jawMesh);
    g.add(this.jaw);
    const eyeGeo = new THREE.SphereGeometry(0.024, 7, 5);
    const pupilGeo = new THREE.SphereGeometry(0.011, 6, 5);
    this.geos.push(eyeGeo, pupilGeo);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, this.eyeMat);
      eye.position.set(sx * 0.05, 0.165, 0.15);
      const dot = new THREE.Mesh(pupilGeo, pupilMat);
      dot.position.set(sx * 0.055, 0.165, 0.17);
      g.add(eye, dot);
    }

    // THE WINGS, on shoulder pivots so the flap is a rotation of the whole
    // limb. Blue on top, and each carries two gold tip feathers - the flash of
    // a second colour on the downstroke is what sells a macaw at range.
    this.wings = [];
    const wingGeo = new THREE.SphereGeometry(0.105, 8, 6);
    const tipGeo = new THREE.BoxGeometry(0.018, 0.008, 0.11);
    this.geos.push(wingGeo, tipGeo);
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * 0.085, 0.06, 0);
      const wing = new THREE.Mesh(wingGeo, sx < 0 ? blue : blue);
      wing.position.set(sx * 0.05, 0, -0.05);
      wing.scale.set(1.0, 0.32, 1.55);
      pivot.add(wing);
      for (let i = 0; i < 3; i++) {
        const tip = new THREE.Mesh(tipGeo, gold);
        tip.position.set(sx * (0.09 + i * 0.028), 0, -0.18 - i * 0.025);
        tip.rotation.y = -sx * 0.12 * i;
        pivot.add(tip);
      }
      g.add(pivot);
      this.wings.push({ pivot, sx });
    }
    // The long tail - half the bird from behind, like the magpie's, except a
    // macaw's is a fan of blue with a gold centre.
    const tailGeo = new THREE.ConeGeometry(0.045, 0.32, 4);
    const tailMidGeo = new THREE.ConeGeometry(0.028, 0.34, 4);
    this.geos.push(tailGeo, tailMidGeo);
    for (const sx of [-1, 1]) {
      const t = new THREE.Mesh(tailGeo, blue);
      t.position.set(sx * 0.032, -0.06, -0.28);
      t.rotation.set(-Math.PI / 2 - 0.3, 0, sx * 0.12 + Math.PI / 4);
      g.add(t);
    }
    const tailMid = new THREE.Mesh(tailMidGeo, gold);
    tailMid.position.set(0, -0.06, -0.29);
    tailMid.rotation.set(-Math.PI / 2 - 0.3, Math.PI / 4, 0);
    g.add(tailMid);

    this.halo = haloSprite(game, 0xff6e6e, 0.85, 0.26);
    g.add(this.halo);
    this.mats.push(this.halo.material);

    this.group = g;
    game.scene.add(g);
  }

  // The one funnel every press goes through calls this - see tryActiveItem.
  // MEMORISES rather than repeats: the repeat is owed in five seconds, and an
  // echo of an echo is impossible because this is never called for the repeat.
  onItemUsed(id, time) {
    if (PARROT_NO_ECHO.has(id)) return;
    if (time < this.readyAt) return;
    this.echoId = id;
    this.echoAt = time + PARROT_DELAY;
    this.readyAt = time + PARROT_COOLDOWN;
    // The head comes up as it learns the trick, so the player with their back
    // turned can see a press got banked before it lands.
    this._squawk = Math.max(this._squawk, 0.45);
  }

  update(dt, ctx) {
    const p = this.player;
    this.phase += dt * 3.2;

    // THE REPEAT. Through the running list a real press fires into, so an item
    // with a window is ticked and ended exactly as the press was - and through
    // the item's own ready() first, for the reason at the top of the class.
    if (this.echoId && ctx.time >= this.echoAt) {
      const id = this.echoId;
      this.echoId = null;
      const def = ACTIVE_ITEMS[id];
      if (def && (!def.ready || def.ready(this.game))) {
        this.game.runningActiveItems.start(this.game, id, def);
        this._squawk = 1;
        ctx.sfx.parrot();
        _v.set(this.pos.x, this.pos.y, this.pos.z);
        ctx.effects.shockwave(_v, 0xff6e6e, 2.2, 0.35);
        ctx.effects.impact(_v, 0xffc94d, 8, 3.5, 2, 0.3);
      }
    }
    this._squawk = Math.max(0, this._squawk - dt * 2.2);

    // HOLDING STATION, the lamprey's way and for the lamprey's reason: a point
    // in the WORLD, re-picked only when the player has walked out of the band,
    // because something circling continuously in the near periphery is exactly
    // what the eye keeps looking at, and the player has a fight to watch. The
    // difference is the station is at SHOULDER height - the parrot flies, so
    // it cannot read as a rat or be underfoot.
    const dx0 = this.pos.x - p.pos.x;
    const dz0 = this.pos.z - p.pos.z;
    const flat = Math.hypot(dx0, dz0);
    const gap = this.station
      ? Math.hypot(this.station.x - p.pos.x, this.station.z - p.pos.z)
      : Infinity;
    if (!this.station || gap > PARROT_HOLD_FAR || gap < PARROT_HOLD_NEAR) {
      let ux;
      let uz;
      if (flat > 0.4) {
        ux = dx0 / flat;
        uz = dz0 / flat;
      } else {
        ux = Math.sin(p.yaw + 2.3);
        uz = Math.cos(p.yaw + 2.3);
      }
      this.station = this.station || new THREE.Vector3();
      this.station.set(
        p.pos.x + ux * PARROT_HOLD, p.pos.y + PARROT_HOLD_Y, p.pos.z + uz * PARROT_HOLD
      );
    }
    this.station.y = p.pos.y + PARROT_HOLD_Y;
    _v.set(
      this.station.x,
      this.station.y + Math.sin(this.phase * 0.6) * 0.09,
      this.station.z
    );

    // Steering, not seeking - a velocity nudged toward the mark and damped,
    // because the overshoot-and-return curve is what the eye reads as flight.
    _v.sub(this.pos);
    const d = _v.length() || 1;
    _v.multiplyScalar(1 / d);
    this.vel.addScaledVector(_v, Math.min(d, 3) * 46 * dt);
    this.vel.multiplyScalar(1 - Math.min(1, dt * 3.4));
    const sp = this.vel.length();
    if (sp > PARROT_SPEED) this.vel.multiplyScalar(PARROT_SPEED / sp);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.y = Math.max(0.55, this.pos.y);

    // A BIRD LEVELS ITS WINGS. The lamprey rolls its whole body to face the
    // way it swims because an eel knows no up; a parrot shown upside down
    // reads as dead. Face the travel direction on the YAW only, pitch a little
    // into the climb, bank a little into the turn, and no more.
    this.group.position.copy(this.pos);
    const flatV = Math.hypot(this.vel.x, this.vel.z);
    if (flatV > 0.2) {
      const aim = Math.atan2(this.vel.x, this.vel.z);
      let turn = aim - this._pyaw;
      while (turn > Math.PI) turn -= Math.PI * 2;
      while (turn < -Math.PI) turn += Math.PI * 2;
      this._pyaw += turn * Math.min(1, dt * 7);
      this._bank += (Math.max(-0.4, Math.min(0.4, -turn)) - this._bank)
        * Math.min(1, dt * 5);
    } else {
      this._bank *= 1 - Math.min(1, dt * 5);
    }
    this.group.rotation.set(
      Math.max(-0.3, Math.min(0.3, -Math.atan2(this.vel.y, flatV || 1) * 0.4)),
      this._pyaw,
      this._bank,
      'YXZ'
    );
    // The flap rises with speed and with the squawk; a parked parrot glides.
    const flapAmt = 0.25 + Math.min(1, sp * 0.09) * 0.75 + this._squawk * 0.4;
    const flap = Math.sin(this.phase * 6) * flapAmt;
    for (const w of this.wings) {
      w.pivot.rotation.z = w.sx * (0.25 + flap * 0.9);
      w.pivot.rotation.x = -Math.abs(flap) * 0.2;
    }
    this.jaw.rotation.x = this._squawk * 0.5;
    this.eyeMat.emissiveIntensity = 2.2 + this._squawk * 3;
    this.halo.material.opacity = 0.24 + this._squawk * 0.5;
    // The tell for a memorised press it has not repeated yet: the wings carry
    // a little more gold, so a glance at the bird says the echo is loaded.
    this.halo.scale.setScalar(0.85 + this._squawk * 0.8 + (this.echoId ? 0.15 : 0));
  }

  destroy() {
    this.group.parent?.remove(this.group);
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// What the card says: five seconds after the press, at most once per thirty.
// THE EXCLUSIONS ARE THE BILL, NOT THE ITEM: every entry is an active item
// whose use() charges a price of its own in credits, rounds or health - a
// press the player never made must never take anything off them, so the bird
// does not mimic those at all.
const PARROT_DELAY = 5;
const PARROT_COOLDOWN = 30;
const PARROT_NO_ECHO = new Set([
  'itemPayToWin', 'itemSlots', 'itemMoneyShot', 'itemParachute',
  'itemLance', 'itemBulletFever', 'itemEmptyPromise', 'itemMagDump',
  'itemTopOff', 'itemPainfulPeace', 'itemMachineFeast', 'itemPact', 'itemDonate',
]);
// Fast enough to keep station on a dashing player, parked at shoulder height
// two metres out - the lamprey's band, lifted into the air.
const PARROT_SPEED = 16;
const PARROT_HOLD = 2.1;
const PARROT_HOLD_Y = 1.45;
const PARROT_HOLD_NEAR = 1.5;
const PARROT_HOLD_FAR = 3.4;

// ---------------------------------------------------------------------------
// Porter - the fetch errand, shared by the rat and the ferryman
// ---------------------------------------------------------------------------
//
// ONE PLATE AT A TIME, TO YOUR FEET. The whole behaviour is four rules:
//
//   1. See a plate of its own kind within the MAGPIE's leash of the player -
//      the pet works the ground the fight is actually on, never the far
//      corner of a room you have already left.
//   2. Walk to it and duck under it. From that frame the PLATE rides the pet
//      - not a copy, not a stub: the pickup itself, still blinking on its own
//      clock, moved each frame by the same moveTo() the magnet sweep uses.
//   3. Carry it to the player's feet and let go. The pet never collects
//      anything - the plate is collected by the PLAYER, walking over it, on
//      the same proximity rule that has always collected it. That is what the
//      card means by "interact with it normally": a plate on the pet's back is
//      a plate on the floor, at rat speed.
//   4. A plate that expires mid-haul, gets transmuted, gets swept at the wave
//      end or simply grabbed off the pet's back by the player is GONE - the
//      pet notices on the frame and goes back to rule 1.
class Porter extends Walker {
  constructor(game, typeKey, sideA) {
    super(game, 0.26, sideA);
    this.typeKey = typeKey;
    this.target = null;
    this.carrying = null;
    this.think = 0;
    this.repickAt = 0;
    this._grab = 0;
    this.fetched = 0;
  }

  // Still fetchable / still being carried? A plate splices itself out of the
  // live list on every one of its deaths - expiry, collection, transfusing,
  // the wave-clear sweep - so the only honest answer is to look there.
  _alive(p, ctx) {
    return p && !p.dead && !p.absorbing && ctx.pickups.includes(p);
  }

  // The nearest plate of this porter's kind that nobody else is hauling,
  // measured off the PLAYER's ground - the leash is around the fight, not
  // around the pet, or both halves of fetch stop being worth anything.
  _pick(ctx) {
    const p = this.player.pos;
    let best = null;
    let bestD = PORTER_LEASH * PORTER_LEASH;
    for (const q of ctx.pickups) {
      if (q.typeKey !== this.typeKey || !this._alive(q, ctx) || q.carriedBy) continue;
      const dx = q.pos.x - p.x;
      const dz = q.pos.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= bestD) continue;
      bestD = d2;
      best = q;
    }
    return best;
  }

  update(dt, ctx) {
    const p = this.player;
    // Dropped by the world mid-errand, on any of the deaths listed above.
    if (this.carrying && !this._alive(this.carrying, ctx)) {
      this.carrying = null;
      this.think = 0;
    }
    if (this.target && (!this._alive(this.target, ctx) || this.target.carriedBy)) {
      this.target = null;
      this.think = 0;
    }
    this.think -= dt;
    if (!this.carrying && !this.target && this.think <= 0 && ctx.time >= this.repickAt) {
      this.think = PORTER_THINK;
      this.target = this._pick(ctx);
    }

    let tx;
    let tz;
    let stop;
    let want = PORTER_WALK;
    if (this.carrying) {
      // The plate rides the back. The magnet's own mover, so a hauled plate
      // and a magnetised one slide down off a platform the same way.
      this.carrying.moveTo(this.pos.x, this.pos.z, this.pos.y);
      tx = p.pos.x;
      tz = p.pos.z;
      stop = PORTER_DROP;
      want = PORTER_RUN;
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      if (d <= stop) {
        // DELIVERED - and let go, NOT handed over: the plate drops at the
        // player's feet and the ordinary pickup test takes it from there,
        // usually on the very next frame.
        this.carrying.carriedBy = null;
        this.carrying = null;
        this.fetched++;
        this._grab = 1;
        // A breath before re-picking, so a plate the player dodged is not
        // snatched back off the floor in the same second.
        this.repickAt = ctx.time + PORTER_REPICK;
        ctx.sfx.fetchGrab();
      }
    } else if (this.target) {
      tx = this.target.pos.x;
      tz = this.target.pos.z;
      stop = PORTER_GRAB;
      want = PORTER_RUN;
      const d = Math.hypot(tx - this.pos.x, tz - this.pos.z);
      if (d <= stop) {
        this.carrying = this.target;
        this.target = null;
        this.carrying.carriedBy = this;
        this._grab = 1;
        ctx.sfx.fetchGrab();
      }
    } else {
      this.follow(dt, PORTER_WALK, PORTER_SPRINT, ctx);
      this._grab = Math.max(0, this._grab - dt * 2.5);
      this._pose(dt, ctx);
      return;
    }
    this.step(dt, tx, tz, want, PORTER_SPRINT, stop, ctx);
    this._grab = Math.max(0, this._grab - dt * 2.5);
    this._pose(dt, ctx);
  }

  // The walk cycle, per species. `pose` is the whole personality - the rat
  // scurries low with its tail up on a find, and the ferryman GLIDES.
  _pose(_dt, _ctx) {}
}

// The leash is the balance, for the magpie's reason: without it the pet works
// a corner of the room the player has already left.
const PORTER_LEASH = 22;
const PORTER_THINK = 0.3;
const PORTER_WALK = 5.5;
const PORTER_RUN = 8.5;
const PORTER_SPRINT = 13;
const PORTER_GRAB = 0.6;
const PORTER_DROP = 1.0;
const PORTER_REPICK = 1.4;

// ---------------------------------------------------------------------------
// PACK RAT - fetches ammunition
// ---------------------------------------------------------------------------
//
// It answers the specific walk: the ammo crate ten metres the wrong side of
// the fight, dropped by a kill you made while retreating, that costs you
// contact to go and get. The rat makes that walk so you do not, and it makes
// it ONE PLATE AT A TIME - a floor-vacuum would be the wave-clear sweep as a
// pet, and the deliver-everything version of this is exactly what the game
// already does when the wave ends.
export class PackRat extends Porter {
  constructor(game) {
    // Back-left of the player - the chicken holds the right, the toad the
    // nearer left, so no two pets ever walk the same line home.
    super(game, 'ammo', 2.8);

    const g = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    const mesh = (geo, mat) => { this.geos.push(geo); return new THREE.Mesh(geo, mat); };
    // GREY-BROWN FUR - a rat is deliberately the dingiest thing the player
    // owns, so it has to be read by SHAPE: low slung, pointed snout, big round
    // ears, long bare tail. The pink is the nose, the ear linings and the
    // tail, which is where the eye is meant to land.
    const fur = own(new THREE.MeshStandardMaterial({
      color: 0x7d6a5d, roughness: 0.85, metalness: 0.02,
    }));
    const pale = own(new THREE.MeshStandardMaterial({
      color: 0xcbb8ab, roughness: 0.8, metalness: 0.02,
    }));
    const pink = own(new THREE.MeshStandardMaterial({
      color: 0xe8a193, roughness: 0.55, metalness: 0.02,
      emissive: 0x5e2a22, emissiveIntensity: 0.3,
    }));
    const bead = own(new THREE.MeshStandardMaterial({
      color: 0x14100e, roughness: 0.25, metalness: 0.3,
    }));

    const body = mesh(new THREE.SphereGeometry(0.17, 10, 8), fur);
    body.position.y = 0.15;
    body.scale.set(0.85, 0.72, 1.45);
    const belly = mesh(new THREE.SphereGeometry(0.12, 8, 6), pale);
    belly.position.set(0, 0.1, 0.05);
    belly.scale.set(0.7, 0.5, 1.1);
    const head = mesh(new THREE.SphereGeometry(0.105, 9, 7), fur);
    head.position.set(0, 0.185, 0.2);
    head.scale.set(0.72, 0.75, 1.25);
    // The snout tapers to the nose: one sphere stretched, one pink bead.
    const nose = mesh(new THREE.SphereGeometry(0.024, 6, 5), pink);
    nose.position.set(0, 0.165, 0.31);
    g.add(body, belly, head, nose);

    // BIG ROUND EARS - the single pixel of the silhouette that says rat and
    // not mouse-shaped-nothing. Lined, so they read against the fur.
    const earGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const innerGeo = new THREE.SphereGeometry(0.03, 6, 5);
    const eyeGeo = new THREE.SphereGeometry(0.021, 6, 5);
    const footGeo = new THREE.BoxGeometry(0.055, 0.03, 0.1);
    this.geos.push(earGeo, innerGeo, eyeGeo, footGeo);
    this.ears = [];
    this.feet = [];
    for (const sx of [-1, 1]) {
      const ear = new THREE.Mesh(earGeo, fur);
      ear.position.set(sx * 0.075, 0.295, 0.115);
      ear.scale.set(1, 1.15, 0.35);
      const inner = new THREE.Mesh(innerGeo, pink);
      inner.position.set(sx * 0.075, 0.295, 0.133);
      inner.scale.set(1, 1.1, 0.3);
      const eye = new THREE.Mesh(eyeGeo, bead);
      eye.position.set(sx * 0.05, 0.215, 0.255);
      const foot = new THREE.Mesh(footGeo, pink);
      foot.position.set(sx * 0.085, 0.02, -0.03);
      foot.scale.set(1, 1, 1.25);
      g.add(ear, inner, eye, foot);
      this.ears.push({ ear, inner, sx });
      this.feet.push(foot);
    }
    // THE BARE TAIL, a chain of shrinking joints trailing the body - the same
    // trick the lamprey swims with, at rat scale and only four deep, which is
    // all a tail needs to lash a little on a find.
    this.tail = [];
    let tr = 0.03;
    for (let i = 0; i < 4; i++) {
      const geo = new THREE.SphereGeometry(tr, 6, 5);
      this.geos.push(geo);
      const seg = new THREE.Mesh(geo, pink);
      seg.scale.set(1, 0.8, 1.6);
      g.add(seg);
      this.tail.push(seg);
      tr *= 0.82;
    }

    this.halo = haloSprite(game, 0xbaaaa4, 0.8, 0.2);
    this.halo.position.y = 0.28;
    g.add(this.halo);
    this.mats.push(this.halo.material);

    g.position.copy(this.pos);
    this.group = g;
    game.scene.add(g);
  }

  _pose(dt, ctx) {
    // Low and scurrying: a quick small hop and a flat-out lean, and the tail
    // lashed off the ground when it is HOLDING something - the pride is the
    // tell, readable over the shoulder.
    const hop = Math.abs(Math.sin(this._hop)) * 0.05 * Math.min(1, this.speed);
    this.group.position.set(this.pos.x, this.pos.y + hop, this.pos.z);
    this.group.rotation.y = this.yaw;
    this.group.rotation.x = -Math.min(0.12, this.speed * 0.016);
    const pride = this.carrying ? 1 : this._grab;
    const sway = Math.sin(this._hop * 0.5) * 0.04 * Math.min(1, this.speed);
    for (let i = 0; i < this.tail.length; i++) {
      const seg = this.tail[i];
      seg.position.set(
        sway * (i + 1) * 0.5,
        0.1 + pride * 0.16 + i * (0.015 + pride * 0.05),
        -0.23 - i * 0.085
      );
    }
    for (const e of this.ears) {
      e.ear.rotation.x = -pride * 0.3;
      e.inner.rotation.x = -pride * 0.3;
    }
    const stride = Math.sin(this._hop) * 0.05 * Math.min(1, this.speed);
    this.feet[0].position.z = -0.03 + stride;
    this.feet[1].position.z = -0.03 - stride;
    this.halo.material.opacity = 0.18 + pride * 0.2;
  }
}

// ---------------------------------------------------------------------------
// FERRYMAN - ferries health
// ---------------------------------------------------------------------------
//
// The rat's mirror, pointed at the bar that keeps you alive. Health plates
// are WITHHELD at a full bar by the drop roll itself (see rollDrop), so what
// is lying on the floor is almost always a crate the player could not stop
// fighting to collect - the fetch is worth more here and the pet dresses for
// it: no scurry, no scurrying feet, a hooded figure that GLIDES the plate
// across the room like a fare.
export class Ferryman extends Porter {
  constructor(game) {
    super(game, 'health', -2.8);

    const g = new THREE.Group();
    this.geos = [];
    this.mats = [];
    const own = (m) => { this.mats.push(m); return m; };
    const mesh = (geo, mat) => { this.geos.push(geo); return new THREE.Mesh(geo, mat); };
    // MIST AND LAMPLIGHT: the robe is a near-black indigo lifted just off a
    // hole in the floor, the face is a VOID with two motes in it, and the one
    // warm thing on the model is the lantern - which is also where the carried
    // plate rides, so the light and the errand come from the same place.
    const robe = own(new THREE.MeshStandardMaterial({
      color: 0x2b3050, roughness: 0.8, metalness: 0.05,
      emissive: 0x0d1024, emissiveIntensity: 0.5,
    }));
    const voidMat = own(new THREE.MeshStandardMaterial({
      color: 0x07080f, roughness: 0.9, metalness: 0.0,
    }));
    this.lampMat = own(new THREE.MeshStandardMaterial({
      color: 0xffd889, emissive: 0xffb547, emissiveIntensity: 2.4,
      roughness: 0.35, metalness: 0.1,
    }));
    const boneMat = own(new THREE.MeshStandardMaterial({
      color: 0xded6c4, roughness: 0.7, metalness: 0.02,
    }));
    const poleMat = own(new THREE.MeshStandardMaterial({
      color: 0x4a4238, roughness: 0.7, metalness: 0.1,
    }));

    // THE ROBE IS A CONE - a figure with no legs inside it, which is what lets
    // it glide without ever cycling feet.
    const skirt = mesh(new THREE.CylinderGeometry(0.05, 0.17, 0.36, 8), robe);
    skirt.position.y = 0.18;
    const shoulders = mesh(new THREE.SphereGeometry(0.09, 8, 6), robe);
    shoulders.position.y = 0.345;
    shoulders.scale.set(1.15, 0.55, 0.95);
    const hood = mesh(new THREE.SphereGeometry(0.085, 9, 7), robe);
    hood.position.set(0, 0.44, 0);
    hood.scale.set(0.95, 1.05, 1.0);
    // The hood's peak, bent forward over the face: the one fold of cloth that
    // makes it a hood rather than a head.
    const peak = mesh(new THREE.ConeGeometry(0.045, 0.11, 6), robe);
    peak.position.set(0, 0.5, 0.045);
    peak.rotation.x = 0.5;
    const face = mesh(new THREE.SphereGeometry(0.05, 7, 6), voidMat);
    face.position.set(0, 0.425, 0.045);
    g.add(skirt, shoulders, hood, peak, face);

    // The two motes in the void. Not eyes - there is no face for them to sit
    // in - and that is the whole design.
    const moteGeo = new THREE.SphereGeometry(0.012, 5, 4);
    this.geos.push(moteGeo);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(moteGeo, this.lampMat);
      m.position.set(sx * 0.02, 0.43, 0.088);
      g.add(m);
    }

    // THE POLE AND THE LANTERN. Punted along rather than walked with; the
    // lantern hangs off its top on a hook and SWINGS with the drift, which is
    // the only pendulum in the model.
    const pole = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.62, 6), poleMat);
    pole.position.set(0.15, 0.33, 0.03);
    pole.rotation.z = -0.2;
    pole.rotation.x = 0.12;
    g.add(pole);
    const hand = mesh(new THREE.SphereGeometry(0.024, 6, 5), boneMat);
    hand.position.set(0.121, 0.28, 0.05);
    g.add(hand);
    this.lantern = new THREE.Group();
    this.lantern.position.set(0.212, 0.61, 0.062);
    const frameGeo = new THREE.BoxGeometry(0.05, 0.062, 0.05);
    const coreGeo = new THREE.SphereGeometry(0.026, 7, 6);
    this.geos.push(frameGeo, coreGeo);
    const frame = new THREE.Mesh(frameGeo, voidMat);
    const core = new THREE.Mesh(coreGeo, this.lampMat);
    const capGeo = new THREE.ConeGeometry(0.032, 0.03, 4);
    this.geos.push(capGeo);
    const cap = new THREE.Mesh(capGeo, voidMat);
    cap.position.y = 0.045;
    this.lantern.add(frame, core, cap);
    g.add(this.lantern);
    const lampGlow = haloSprite(game, 0xffca7a, 0.28, 0.5);
    this.lantern.add(lampGlow);
    this.mats.push(lampGlow.material);

    this.halo = haloSprite(game, 0x8d9bb5, 0.85, 0.22);
    this.halo.position.y = 0.34;
    g.add(this.halo);
    this.mats.push(this.halo.material);

    g.position.copy(this.pos);
    this.group = g;
    game.scene.add(g);
    this._sway = 0;
  }

  _pose(dt, ctx) {
    // NO HOP. The ferryman hovers a finger off the ground and sways with the
    // drift of the pole - the calm in a room that also contains the rat.
    this._sway += dt * (1.2 + this.speed * 0.4);
    const bob = Math.sin(this._sway) * 0.035 + 0.05;
    this.group.position.set(this.pos.x, this.pos.y + bob, this.pos.z);
    this.group.rotation.y = this.yaw;
    // Leans INTO the glide rather than against it, hood first.
    this.group.rotation.x = Math.min(0.12, this.speed * 0.014);
    this.group.rotation.z = Math.sin(this._sway * 0.7) * 0.04;
    // The lantern swings against the motion, like a hung thing does, and the
    // lamp burns a little brighter with a fare aboard.
    const load = this.carrying ? 1 : 0;
    this.lantern.rotation.z = Math.sin(this._sway * 1.7) * (0.18 + this.speed * 0.02);
    this.lantern.rotation.x = Math.cos(this._sway * 1.3) * 0.1;
    this.lampMat.emissiveIntensity = 2.4 + load * 1.4 + Math.sin(this._sway * 3) * 0.2;
    this.halo.material.opacity = 0.2 + load * 0.2;
  }
}
