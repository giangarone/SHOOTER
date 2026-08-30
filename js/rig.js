// The lighting rig: everything that makes the arena feel like a venue rather
// than a room. arena.js builds the box and the furniture; this animates the
// show that plays over it.
//
// THE ONE RULE THAT SHAPES THIS WHOLE FILE: the light count can never change
// after startup. three.js keys its shader programs on the number of lights, so
// creating one mid-run recompiles every material in the scene and stalls the
// frame (see the note at the top of arena.js, and the `light count constant`
// check in test/smoke.mjs). Every light, mesh and material here is built in
// the constructor and only ever has its colour, intensity, position and
// opacity written afterwards. Nothing is added, removed or disposed. This is
// the same contract effects.js works under.
//
// WHITE ON THE ENEMIES, COLOUR IN THE ROOM. The hemisphere and the key light
// stay white and only move in intensity. Enemy colours run the entire hue
// wheel - red, purple, orange, green, pink, indigo, teal, lime - and a
// saturated key light would collapse them into each other, which is a
// readability bug dressed up as atmosphere. The colour lives in the fixtures,
// the beams, the fog and the floor accents: things you look AT, not light you
// see BY.
//
// WHERE THE BEAT COMES FROM: music.js taps an analyser off the raw source and
// exposes `level` (bass energy) and `beat` (onset strength). It also owns the
// free-running fallback for when there is nothing to listen to, so the rig
// never has to check - and so the rig and the dancing crowd in enemy.js, which
// read the same two numbers, can never disagree about whether the party is on.
import * as THREE from 'three';

// Ceiling height, mirrored from arena.js. The truss hangs just below it.
const TRUSS_Y = 13.6;
// FIXTURES ARE NOT LIGHTS. This split is the most important performance
// decision in the file, and it was measured rather than guessed.
//
// A SpotLight is the most expensive light three.js has: every lit fragment in
// the scene loops over every one of them, whether or not it points anywhere
// near. Measured on the software rasteriser the smoke test runs on, four of
// them cost 14fps of a ~44fps budget - a third of the frame, to light a room
// that largely reads by its emissive surfaces anyway.
//
// For the record, so nobody re-tunes this on the wrong evidence: on real
// hardware (M4 Pro / Metal) the whole rig costs 0.073ms -> 0.135ms per frame
// against a 16.7ms budget, i.e. nothing. The software-rasteriser number is
// what matters here only because the smoke-test bot runs on it, and a slower
// bot clears fewer waves and starts failing progress checks that have nothing
// to do with lighting.
//
// So the rig LOOKS like a dozen moving heads and IS two. FIXTURES is how many
// housings hang from the truss: emissive boxes costing one uniform write each,
// and they carry the look. HEADS is how many of those are backed by a real
// SpotLight that throws a pool on the floor and can track a boss. Raising
// HEADS is the expensive knob; raising FIXTURES is nearly free.
const FIXTURES = 10;
const HEADS = 2;
// Visible light shafts: geometry, not lights. Additive double-sided cones are
// fill-rate heavy on a software rasteriser, which is why this is 4 and not the
// 6 it started at - those two extra cones measured about 2fps.
const BEAMS = 4;
const BEAM_LEN = 15;

// The palette the accents are drawn from. NO WHITE: the room's colour never
// drops back to white between picks, it steps from one hue to the next, which
// is what a rave rig actually does. Readability is still protected, because
// the hemisphere and the key light - the light enemies are actually READ by -
// stay white regardless (see the note at the top of this file). This is only
// the colour in the fixtures, beams, fog and accent points.
const ACCENTS = [
  0x4ef3ff, 0xff2fb0, 0xb14aed, 0xffb300, 0x39ff88, 0xff5a4d, 0x3d6bff, 0xff8a1f,
];
// House lights: warm, and nothing like the combat palette, so the intermission
// reads instantly as "the set has stopped".
const HOUSE = 0xffb060;

export class Rig {
  constructor(scene, arena) {
    this.scene = scene;
    this.lights = arena.lights;
    this.mats = arena.mats;
    this.group = new THREE.Group();
    scene.add(this.group);

    // Base values, captured so every effect below is expressed as a multiplier
    // of the arena's own lighting rather than as a magic number.
    this.baseHemi = this.lights.hemi.intensity;
    this.baseDir = this.lights.dir.intensity;
    this.baseFogNear = scene.fog.near;
    this.baseFogFar = scene.fog.far;
    this._fogBase = new THREE.Color(scene.fog.color.getHex());

    // ---- truss and fixtures ----------------------------------------------
    // One shared box geometry for the whole overhead structure, scaled per
    // mesh. See the geometry-budget note in arena.js.
    const BOX = arena.shared.BOX;
    // Basic, not Standard: the truss is a dark silhouette 13m up that no light
    // in the room meaningfully reaches, and running the full light loop over
    // twenty beams to render them almost-black is pure cost.
    const trussMat = new THREE.MeshBasicMaterial({ color: 0x0d1017 });
    for (let i = -2; i <= 2; i++) {
      const a = new THREE.Mesh(BOX, trussMat);
      a.position.set(i * 10, TRUSS_Y, 0);
      a.scale.set(0.35, 0.35, 46);
      this.group.add(a);
      const b = new THREE.Mesh(BOX, trussMat);
      b.position.set(0, TRUSS_Y, i * 10);
      b.scale.set(46, 0.35, 0.35);
      this.group.add(b);
    }

    // The fixture bodies hanging off the truss, and the emissive lenses in
    // them. The lens material is shared per fixture so writing one colour
    // lights that whole head; `fixtureMats` is what update() drives.
    this.fixtureMats = [];
    this.heads = [];
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x090b11, roughness: 0.6, metalness: 0.5 });
    for (let i = 0; i < FIXTURES; i++) {
      const ang = (i / FIXTURES) * Math.PI * 2 + Math.PI / 4;
      // Alternating radii, so the rig reads as a cluster rather than a ring.
      const rad = i % 2 ? 15.5 : 9.5;
      const x = Math.cos(ang) * rad;
      const z = Math.sin(ang) * rad;

      const body = new THREE.Mesh(BOX, bodyMat);
      body.position.set(x, TRUSS_Y - 0.5, z);
      body.scale.set(1.1, 0.9, 1.1);
      this.group.add(body);

      const lensMat = new THREE.MeshStandardMaterial({
        color: 0x05070c, emissive: 0xffffff, emissiveIntensity: 0,
      });
      this.fixtureMats.push(lensMat);
      const lens = new THREE.Mesh(BOX, lensMat);
      lens.position.set(x, TRUSS_Y - 1.0, z);
      lens.scale.set(0.8, 0.14, 0.8);
      this.group.add(lens);

      // Only the first HEADS housings get a real light behind them.
      if (i < HEADS) {
        const spot = new THREE.SpotLight(0xffffff, 0, 44, 0.36, 0.5, 1.1);
        spot.position.set(x, TRUSS_Y - 1.0, z);
        spot.target.position.set(0, 0, 0);
        this.group.add(spot);
        this.group.add(spot.target);
        this.heads.push({ spot, x, z, phase: (i / HEADS) * Math.PI * 2 });
      }
    }

    // ---- beams -------------------------------------------------------------
    // Additive cones, one shared geometry. The apex sits at the fixture and
    // the cone opens downward, which is the geometry's natural orientation, so
    // aiming is a rotation of the pivot the cone hangs under.
    const beamGeo = new THREE.ConeGeometry(1.5, BEAM_LEN, 12, 1, true);
    // Shift the cone so its apex is at the pivot origin rather than its centre.
    beamGeo.translate(0, -BEAM_LEN / 2, 0);
    this.beams = [];
    for (let i = 0; i < BEAMS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      });
      const pivot = new THREE.Group();
      const ang = (i / BEAMS) * Math.PI * 2;
      pivot.position.set(Math.cos(ang) * 14, TRUSS_Y - 1.2, Math.sin(ang) * 14);
      const mesh = new THREE.Mesh(beamGeo, mat);
      pivot.add(mesh);
      this.group.add(pivot);
      this.beams.push({ pivot, mat, phase: (i / BEAMS) * Math.PI * 2 });
    }

    // ---- animation state ---------------------------------------------------
    this.t = 0;
    // 0..1, written every frame and read by main.js for the DOM strobe.
    this.flash = 0;
    // One-shot cue timers. All count DOWN in seconds.
    this._waveT = 0;
    this._dmgT = 0;
    this._staggerT = 0;
    this._enraged = false;
    // Smoothed drivers, so a mode change eases rather than snaps. Seeded on a
    // real accent rather than white so the first frame of a run is already
    // wearing the show's colour.
    this._colour = new THREE.Color(ACCENTS[0]);
    this._target = new THREE.Color(ACCENTS[0]);
    this._energy = 0;
    this._house = 0;
    this._accent = 0;
    this._pickIdx = 0;
    // The wall chase: where the bright head currently is, as 0..1 around the
    // perimeter, and the lagging colour every other cell wears.
    this._chase = 0;
    this._trail = new THREE.Color(ACCENTS[1]);
    // Scratch, to honour the no-allocation-in-the-loop rule.
    this._c = new THREE.Color();
  }

  // ---- cues: one-shot events fired from main.js at existing transitions ----

  // A wave starts: cut the room to black for a beat, then let everything hit
  // at once. The blackout is what makes the hit land - without it a bright
  // room just gets slightly brighter.
  cueWaveStart() {
    this._waveT = 0.9;
  }

  // Took a hit. A hard white blink, deliberately shorter than the red damage
  // vignette it plays over, so the two read as one event rather than two.
  cueDamage() {
    this._dmgT = 0.18;
  }

  // A boss is staggered: black out, then flare white as it recovers.
  cueStagger() {
    this._staggerT = 0.7;
  }

  setEnraged(on) {
    this._enraged = on;
  }

  // `s` is a scratch object owned by main.js and refilled each frame, so this
  // allocates nothing. Fields: mode, beat, level, healthFrac, comboMult,
  // bossColor, bossPos.
  update(dt, s) {
    this.t += dt;

    // Beat source. music.js already substitutes a free-running tempo when
    // there is nothing to listen to, so these are always usable - and the
    // crowd in enemy.js is reading the very same numbers, which is what keeps
    // the room and the dancers in agreement.
    const beat = s.beat;
    const level = s.level;

    const combat = s.mode === 'combat' || s.mode === 'boss';
    const boss = s.mode === 'boss';

    // `_house` crossfades the whole rig between show and house lights, so the
    // intermission eases in rather than cutting. It mirrors the music's own
    // 0.7s lowpass sweep closely enough that the two feel like one change.
    const houseTarget = s.mode === 'house' ? 1 : 0;
    this._house += (houseTarget - this._house) * Math.min(1, dt * 3);

    // How hard the room is being driven. Combat sits at a base and climbs with
    // the kill chain: the room visibly gets more excited the better you play.
    const comboDrive = Math.min(1, (s.comboMult - 1) / 2);
    const energyTarget = combat ? 0.55 + comboDrive * 0.45 : 0.12;
    this._energy += (energyTarget - this._energy) * Math.min(1, dt * 2.5);

    // ---- cue timers --------------------------------------------------------
    if (this._waveT > 0) this._waveT = Math.max(0, this._waveT - dt);
    if (this._dmgT > 0) this._dmgT = Math.max(0, this._dmgT - dt);
    if (this._staggerT > 0) this._staggerT = Math.max(0, this._staggerT - dt);

    // The wave cue: the first 40% is the blackout, the rest is the hit
    // decaying back to normal.
    let waveDark = 0;
    let waveHit = 0;
    if (this._waveT > 0) {
      const p = this._waveT / 0.9;
      if (p > 0.6) waveDark = (p - 0.6) / 0.4;
      else waveHit = p / 0.6;
    }
    let stagDark = 0;
    let stagHit = 0;
    if (this._staggerT > 0) {
      const p = this._staggerT / 0.7;
      if (p > 0.55) stagDark = (p - 0.55) / 0.45;
      else stagHit = p / 0.55;
    }
    const dark = Math.max(waveDark, stagDark);

    // ---- low health --------------------------------------------------------
    // Below 30% - the same threshold the HP bar already turns red at - a
    // heartbeat joins the room and quickens as health drops. It rides ON TOP
    // of the white rather than replacing it, so enemies stay readable at the
    // exact moment reading them matters most.
    const lowH = s.healthFrac < 0.3 ? 1 - s.healthFrac / 0.3 : 0;
    let heart = 0;
    if (lowH > 0) {
      // 1.1Hz at the threshold up to ~2.2Hz at death's door: a pulse rate, not
      // a strobe rate.
      const hz = 1.1 + lowH * 1.1;
      const ph = (this.t * hz) % 1;
      // Two thumps per cycle, the second smaller - a heartbeat, not a sine.
      heart = Math.max(0, 1 - ph * 6) + Math.max(0, 0.55 - Math.abs(ph - 0.28) * 5);
      heart = Math.min(1, heart) * lowH;
    }

    // ---- colour ------------------------------------------------------------
    // Pick what the accents are wearing. Boss colour wins over everything
    // except the enrage red, because on a boss wave the room IS the boss.
    if (this._house > 0.5) {
      this._target.setHex(HOUSE);
    } else if (boss && this._enraged) {
      this._target.setHex(0xff2018);
    } else if (boss) {
      this._target.setHex(s.bossColor);
    } else {
      // Ordinary combat: always a colour, stepping to a different one every
      // couple of seconds. The step clock is what holds a pick instead of
      // reshuffling every frame; the offset walk is what guarantees the next
      // pick is never the one already showing, which would read as the colour
      // change having stalled.
      const step = Math.floor(this.t * 0.55);
      if (step !== this._accent) {
        this._accent = step;
        this._pickIdx = (this._pickIdx + 1 + ((Math.random() * (ACCENTS.length - 1)) | 0))
          % ACCENTS.length;
      }
      this._target.setHex(ACCENTS[this._pickIdx]);
    }
    this._colour.lerp(this._target, Math.min(1, dt * 4));

    // ---- the white key light ----------------------------------------------
    // Only intensity moves. Hue never does.
    const beatLift = combat ? beat * 0.5 * this._energy : 0;
    const houseLift = this._house * 0.9;
    const k = (1 - dark) * (1 + beatLift + houseLift + waveHit * 0.8 + stagHit * 1.4);
    this.lights.hemi.intensity = this.baseHemi * (0.5 + 0.5 * k) * (boss ? 0.72 : 1);
    this.lights.dir.intensity = this.baseDir * k * (boss ? 0.62 : 1);

    // ---- the colour accents ------------------------------------------------
    const accentGain = (1 - dark) * (0.45 + level * 0.9 + beat * 1.5 * this._energy);
    const p1 = this.lights.p1;
    const p2 = this.lights.p2;
    p1.color.copy(this._colour);
    p2.color.copy(this._colour);
    // The two accents breathe out of phase so the room has a direction to it.
    p1.intensity = 34 * accentGain * (0.7 + 0.3 * Math.sin(this.t * 1.7));
    p2.intensity = 34 * accentGain * (0.7 + 0.3 * Math.sin(this.t * 1.7 + Math.PI));
    // Red rides in on the heartbeat, mixed into the accents only.
    if (heart > 0) {
      this._c.setHex(0xff1a10);
      p1.color.lerp(this._c, heart * 0.85);
      p2.color.lerp(this._c, heart * 0.85);
      p1.intensity += 26 * heart;
      p2.intensity += 26 * heart;
    }
    // Orbit the accents around the room while the show is on.
    if (this._house < 0.9) {
      const a = this.t * 0.5;
      p1.position.set(Math.cos(a) * 13, 3.6, Math.sin(a) * 13);
      p2.position.set(Math.cos(a + Math.PI) * 13, 3.6, Math.sin(a + Math.PI) * 13);
    }

    // ---- moving heads (the two real lights) -------------------------------
    for (let i = 0; i < this.heads.length; i++) {
      const h = this.heads[i];
      const sp = h.spot;
      if (boss && s.bossPos) {
        // With only two real heads, one locks onto the boss and one keeps
        // sweeping: enough to read as "the rig has found it" while the room
        // still moves.
        if (i === 0) sp.target.position.copy(s.bossPos);
        else this._sweepTarget(sp.target.position, h, 0.35);
      } else {
        this._sweepTarget(sp.target.position, h, this._house > 0.5 ? 0.1 : 0.55);
      }
      sp.color.copy(this._house > 0.5 ? this._target : this._colour);
      const solo = 0.55 + 0.45 * Math.sin(this.t * 2.1 + h.phase);
      // They hang 13m up and a SpotLight falls off over `distance`, so most of
      // the intensity is spent just getting down to the floor.
      sp.intensity = (1 - dark) * (70 + level * 130 + beat * 240 * this._energy) * solo * (0.35 + this._energy);
      // House lights: wide, dim, warm, and no strobing.
      if (this._house > 0.01) sp.intensity = sp.intensity * (1 - this._house) + 95 * this._house;
    }

    // ---- fixture lenses ----------------------------------------------------
    // Every housing on the truss, including the eight with no light behind
    // them. A bright spot travels around the ring on the beat, which is what
    // makes the ceiling read as a rig rather than as two lamps and scenery.
    const lensBase = (0.25 + level * 0.8 + beat * 3.2 * this._energy) * (1 - dark);
    for (let i = 0; i < this.fixtureMats.length; i++) {
      const fm = this.fixtureMats[i];
      fm.emissive.copy(this._house > 0.5 ? this._target : this._colour);
      const chase = 0.45 + 0.55 * Math.sin(this.t * (2 + this._energy * 4) - i * 0.9);
      fm.emissiveIntensity = Math.min(5, lensBase * chase + heart * 1.6);
    }

    // ---- beams -------------------------------------------------------------
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      const sw = Math.sin(this.t * 0.6 + b.phase);
      b.pivot.rotation.z = sw * 0.42;
      b.pivot.rotation.x = Math.cos(this.t * 0.45 + b.phase * 1.3) * 0.42;
      b.mat.color.copy(this._colour);
      // Beams are the loudest thing in the room, so they are the first thing
      // the house lights take away. Gated on `_energy` as well as the beat:
      // shown at a flat base they read as static grey cones hanging in an idle
      // room rather than as light.
      const o = (0.012 + level * 0.05 + beat * 0.26 * this._energy)
        * this._energy * (1 - dark) * (1 - this._house);
      b.mat.opacity = Math.min(0.38, o);
      // An invisible mesh is culled before rasterisation; a fully transparent
      // one is still drawn. These are big double-sided additive cones, so that
      // difference is most of their cost.
      b.pivot.visible = b.mat.opacity > 0.008;
    }

    // ---- emissive furniture -----------------------------------------------
    // Shared materials, so one write lights every lamp head, deck edge and
    // platform lip in the venue.
    //
    // They wear the room's CURRENT colour now. They used to be a fixed cyan,
    // which meant that every time the rig stepped onto magenta or amber the
    // furniture stayed on the one colour that could not have come from the
    // rig - and static light in a room full of moving light reads as scenery
    // rather than as part of the show.
    const emCol = this._house > 0.5 ? this._target : this._colour;
    const trimGain = 1.2 + beat * 2.4 * this._energy + heart * 2;
    this.mats.trim.emissive.copy(emCol);
    this.mats.trim.emissiveIntensity = trimGain * (1 - dark);
    this.mats.deckEdge.emissive.copy(emCol);
    this.mats.deckEdge.emissiveIntensity = (0.8 + beat * 1.6 * this._energy) * (1 - dark);
    this.mats.platEdge.emissive.copy(emCol);
    this.mats.platEdge.emissiveIntensity = (0.9 + beat * 1.4 * this._energy) * (1 - dark);

    // ---- the wall chase ----------------------------------------------------
    // The head-height strips around the four walls are cut into cells with
    // their own materials (see arena.js), and this is what that buys: a bright
    // pulse running around the room on the beat, at the eye level the fight is
    // actually played at. The ceiling rig is above the player's sightline for
    // most of a run; this is the part of the show they cannot help but see.
    const cells = this.mats.wallStrip;
    const n = cells.length;
    // The head walks the perimeter, faster the harder the room is being
    // driven: a slow crawl around an idle venue, and a sprint on a big combo.
    // The house lights stop it dead - an intermission is not a show.
    this._chase += dt * (0.55 + this._energy * 2.6 + level * 1.8) * (1 - this._house);
    this._chase -= Math.floor(this._chase);
    const head = this._chase * n;
    // A colour that lags the room's by about half a second, worn by every other
    // cell. Through a colour step the wall is briefly two-tone, which is what
    // stops a ring of identical cells reading as one continuous line - and it
    // settles onto the room's colour between steps, so the walls and the
    // ceiling are wearing the same thing most of the time. Tuned by eye: a
    // slower lag than this and the wall never catches up, which reads as two
    // rigs disagreeing rather than as one colour arriving.
    this._trail.lerp(this._colour, Math.min(1, dt * 2.2));
    const base = (0.16 + level * 0.5) * (1 - this._house) + 1.1 * this._house;
    const cometGain = (0.7 + beat * 3.4 * this._energy) * (1 - this._house);
    for (let i = 0; i < n; i++) {
      const m = cells[i];
      if (this._house > 0.5) m.emissive.copy(this._target);
      else m.emissive.copy(i & 1 ? this._trail : this._colour);
      // Wrapped distance to the head, so the pulse crosses the seam between
      // the last cell and the first instead of vanishing at a corner.
      let d = Math.abs(i - head);
      if (d > n * 0.5) d = n - d;
      // Squared, so the head is a bright point with a short tail rather than a
      // broad wash - a wash is just the whole wall getting brighter.
      const comet = Math.max(0, 1 - d / 3.5);
      m.emissiveIntensity =
        Math.min(5, (base + comet * comet * cometGain + heart * 1.5) * (1 - dark));
    }

    // ---- fog ---------------------------------------------------------------
    // The room closes in for a boss and opens back up afterwards. Fog colour
    // takes a wash of the accent so the air itself is tinted, which is most of
    // what sells a smoke-filled venue.
    const fogNear = boss ? 14 : this.baseFogNear;
    const fogFar = boss ? 44 : this.baseFogFar;
    this.scene.fog.near += (fogNear - this.scene.fog.near) * Math.min(1, dt * 1.5);
    this.scene.fog.far += (fogFar - this.scene.fog.far) * Math.min(1, dt * 1.5);
    this._c.copy(this._fogBase).lerp(this._colour, 0.12 + level * 0.1);
    this.scene.fog.color.copy(this._c);
    this.scene.background.copy(this._c);

    // ---- the full-screen strobe -------------------------------------------
    // Written here, applied by main.js through ui.setStrobe. A DOM overlay is
    // free next to lighting the whole scene, and it is the only way to get a
    // true white-out.
    let f = 0;
    if (combat) f = beat * 0.42 * this._energy;
    f = Math.max(f, this._dmgT / 0.18 * 0.55);
    f = Math.max(f, waveHit * 0.5, stagHit * 0.7);
    if (boss && this._enraged) f = Math.max(f, beat * 0.55);
    this.flash = Math.min(0.8, f * (1 - this._house));
  }

  // Walks a spotlight's aim point around the floor. `out` is written in place.
  _sweepTarget(out, h, speed) {
    const a = this.t * speed + h.phase;
    out.set(Math.cos(a) * 13, 0, Math.sin(a * 1.3) * 13);
  }
}
