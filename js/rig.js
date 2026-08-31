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
// WHERE THE BEAT COMES FROM: music.js reads a beat map analysed offline from
// the soundtrack and exposes `level` (bass energy), `beat` (an envelope that
// peaks on the hit), `bar` (0..3 through the bar) and `downbeat`. It also owns
// the fallback for when there is nothing to listen to, so the rig never has to
// check - and so the rig and the dancing crowd in enemy.js, which read the
// same numbers, can never disagree about whether the party is on.
//
// `bar` IS THE BEAT EDGE. It steps exactly once per beat, so comparing it with
// last frame's value is an exact beat trigger - no threshold on the envelope,
// no risk of a long frame firing twice or a short one missing. Everything in
// here that moves in time with the music hangs off that comparison.
import * as THREE from 'three';
import { FOG_DENSITY, FOG_DENSITY_BOSS } from './arena.js';
import { Lasers } from './lasers.js';

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

// BEAM AIMING. Each beam picks its own angle, on the beat, at random.
//
// They were choreographed for a while: all four moving into one shape - in,
// out, crossed - on a cycle that repeated every bar. On paper that is what a
// rig does, and in the room it was worse. Four lights slamming into the same
// pose on the same frame stop reading as four lights and start reading as one
// object being rotated, and a shape the eye can predict removes the only
// reason to keep watching. Being ON the beat was right; being IN UNISON on it
// was not, and those are separate things.
//
// So: random direction per beam, all cued on the beat and moving together. The
// scatter that briefly sat here - a few tens of milliseconds of jitter on when
// each beam left - is gone: it broke the unison, and it also broke the thing
// worth having, which is that every move lands exactly on the hit. Randomness
// belongs in WHERE they go, not in WHEN.
//
// How far the beams tilt off vertical at full energy, in radians. This is the
// range the original continuous sway used - the change through all of this has
// been WHEN they move, not how far.
const BEAM_TILT = 0.42;
// Smallest turn a beam will make, as a fraction of half a turn. Purely random
// angles land near the last one often enough to look like a stall, and a light
// that does not visibly move on the beat reads as one that missed it.
const BEAM_MIN_TURN = 0.35;
// How fast a beam closes on its new aim. High: the point of moving on the beat
// is that the movement is over by the time the next one lands, so it reads as
// a head slamming into position rather than as a drift that happens to start
// in the right place.
const BEAM_SNAP = 26;

// BEAM BRIGHTNESS IS A SHUTTER, NOT A DIMMER. Between hits the beams are at
// exactly zero and are not drawn at all. They swelled from a level-fed base at
// first, which left them lit most of the time - a continuously lit shaft that
// swings to a new angle reads as a prop being rotated rather than as a light
// being fired - and then sat at a small floor, which was the same argument
// half-made. A real rig's heads have a mechanical shutter and it is binary.
//
// The level of the music no longer adds a floor; it scales the PEAK. That is
// what makes zero actually reachable: a term that is added survives however
// far the envelope falls, so a floor anywhere in the sum is a floor in the
// result.
//
// BEAM_SHARP is what does the work. `beat` is an envelope that falls linearly
// to zero over about a sixth of a second, and raising it to a power leaves the
// peak at 1 while collapsing the tail: at 100ms after the hit it is down to a
// tenth instead of four tenths. It also quiets the anticipation lift that
// music.js puts in front of every beat, from 0.3 to well under a tenth, so the
// beams stay dark right up until the hit while everything else in the room
// still leans into it.
//
// The room does not lose its shape when they go: the wall strips, the fixture
// lenses, the fog and every emissive edge in the venue are all still lit, and
// they are what the space reads by. The beams were never the furniture.
//
// It is also the cheapest the beams have ever been. Four big double-sided
// additive cones are skipped entirely on the two thirds of frames where they
// are dark, because a mesh with `visible` false is culled before rasterising
// while a fully transparent one is still drawn.
const BEAM_GLOW = 0.10;
const BEAM_PUNCH = 1.5;
const BEAM_SHARP = 2.2;
// The ONE is a bigger stab, for the same reason the furniture accents it.
const BEAM_DOWNBEAT = 1.35;

// LOOKS. A show is a sequence of states, each held for a phrase, not one
// setting left on. Everything firing at once for three hours has no peak in it
// - restraint is the only thing that makes a big moment big, and the way a
// real rig gets restraint is by having most of itself off most of the time.
//
// Each look says how much of each instrument is lit. They are all available at
// any point in a run; only how hard they are driven follows the room's energy.
const LOOKS = [
  //  name       beams  lasers  sweeping  white
  { beams: 1.0, lasers: 0.0, sweep: false, white: false },  // cones alone
  { beams: 0.0, lasers: 1.0, sweep: false, white: false },  // lasers alone
  { beams: 1.0, lasers: 0.9, sweep: false, white: false },  // everything
  { beams: 0.0, lasers: 0.8, sweep: true, white: false },   // a slow turning fan
  { beams: 0.3, lasers: 1.0, sweep: false, white: true },   // white strobe
];
// Bars a look is held for. Four is the phrase this music is built out of, so a
// change lands where the track tends to change too. Eight was the first guess
// and it was wrong for a game rather than for a club: at 145 BPM it holds a
// look for thirteen seconds, so a whole wave would show three of them and the
// one with the lasers off would feel like something had broken.
const LOOK_BARS = 4;
// How far round the wheel the lasers sit from the room's colour, in hue.
// Not 0.5: an exact complement of a saturated colour reads as a clash, and
// slightly off it reads as two colours chosen together.
const LASER_HUE = 0.42;

// How much harder the emissive furniture hits on the ONE than on the other
// three beats. Every beat used to be identical, which is why a room full of
// pulsing edges read as flicker rather than as a bar you could feel.
const DOWNBEAT_ACCENT = 1.7;

// Beats the wall comet takes to get once around the room, at rest and when the
// room is being driven hardest. Both are multiples of four, so the comet
// crosses the same corner on the same beat of the bar every lap.
const LAP_BEATS_IDLE = 32;
const LAP_BEATS_HOT = 8;


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


// The beam's look, baked once into one shared texture.
//
// TWO THINGS IN ONE IMAGE, on the two axes, so a single texture fetch buys
// both and the beams stay free:
//
//   v (along the shaft)  a gradient, bright at the fixture and fading to
//                        nothing at the open end. This is what turns a cone
//                        into a shaft of light DISSIPATING in haze - the flat
//                        opacity it had before ended in a hard circular rim,
//                        which is the single most artificial thing a volumetric
//                        beam can do.
//   u (around it)        seamless vertical streaks of varying density, so
//                        rotating the map reads as smoke drifting through the
//                        beam rather than as the beam itself moving.
//
// ConeGeometry puts v=1 at the apex, and the apex is the end at the fixture -
// so canvas TOP is the bright end (three.js flips Y on upload by default).
function makeBeamTexture() {
  const W = 64;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  // The streaks. Summed sines with integer frequencies, which is what makes
  // the pattern seamless where u wraps: any other frequency leaves a visible
  // vertical seam running the length of every beam in the room.
  const streak = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const t = (x / W) * Math.PI * 2;
    // Centred high, and modulated shallowly. The streaks are texture on a beam,
    // not the beam itself: at a low baseline they were eating most of the
    // shaft's brightness to draw detail nobody can resolve on a moving cone.
    streak[x] = 0.86
      + 0.09 * Math.sin(t * 3 + 0.7)
      + 0.06 * Math.sin(t * 7 + 2.1)
      + 0.03 * Math.sin(t * 13 + 4.3);
  }
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    // 1 at the top of the canvas (the fixture), 0 at the bottom.
    //
    // The exponent is the whole argument about how visible a beam is. Squared -
    // where this started - averages a THIRD of full brightness down the shaft,
    // so simply adding the texture dimmed the beams to about a fifth of what
    // they had been and they all but vanished. At 1.25 the average is closer to
    // 0.45, the shaft still fades out rather than ending in a rim, and the
    // opacity below is what carries the rest.
    const v = 1 - y / (H - 1);
    const fall = Math.pow(v, 1.25);
    for (let x = 0; x < W; x++) {
      const a = Math.max(0, Math.min(1, streak[x] * fall));
      const i = (y * W + x) * 4;
      const c = (a * 255) | 0;
      // Written into RGB *and* alpha: additive blending multiplies the
      // material's colour by the map's RGB and its opacity by the map's alpha,
      // so carrying the shape in both is what keeps this looking the same if
      // the blend mode is ever changed.
      img.data[i] = img.data[i + 1] = img.data[i + 2] = c;
      img.data[i + 3] = c;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  // u wraps so the map can be rotated around the shaft forever; v is clamped
  // because the gradient along the beam is fixed to the geometry and must
  // never repeat.
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

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
    // ONE texture for all four, deliberately. Per-beam copies would let each
    // shaft drift at its own rate, but textures are a capped resource here (the
    // smoke test holds the whole game to twelve) and the beams hang metres
    // apart at different angles - nobody can see them share a phase.
    this._beamTex = makeBeamTexture();
    for (let i = 0; i < BEAMS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        map: this._beamTex,
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
      this.beams.push({
        pivot,
        mat,
        // Where it is aiming now, where the last beat told it to aim, the
        // compass direction that target came from, kept so the next turn can
        // be made big enough to see.
        aimZ: 0, aimX: 0, tgtZ: 0, tgtX: 0, dir: ang,
      });
    }

    // ---- the laser bank ----------------------------------------------------
    // Owns its own geometry and material; adds no lights, so the contract at
    // the top of this file is untouched.
    this.lasers = new Lasers(this.group);
    // The lasers' colour, held away from the room's on the hue wheel and
    // recomputed whenever the room's moves.
    this._laserColour = new THREE.Color(0xffffff);
    this._hsl = { h: 0, s: 0, l: 0 };

    // ---- animation state ---------------------------------------------------
    this.t = 0;
    // Last frame's position in the bar. A change in it is a beat; -1 means
    // nothing has been seen yet, so the first frame counts as one.
    this._lastBar = -1;
    this._look = 0;
    this._barsHeld = 0;
    // The comet's target position on the wall, in cells. It is advanced in a
    // step on each beat and chased smoothly, rather than being driven by dt.
    this._chaseTarget = 0;
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

  // Throws each beam at a fresh random angle. Called once per beat from
  // update(); the easing towards what it sets happens per frame.
  //
  // A cone hangs pointing down: rotating it about Z swings its tip towards +X
  // and about X towards -Z, which is where the signs below come from.
  _cueBeams() {
    // An idle room aims narrower. Same behaviour, smaller - it should look
    // like the rig is holding back, not like a different rig.
    const reach = BEAM_TILT * (0.35 + this._energy * 0.65);
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      // Turn by at least BEAM_MIN_TURN of a half-circle, either way round,
      // rather than picking an absolute angle: two independent random draws
      // land close together often enough that some beats would show a light
      // barely moving, and the beat it did not answer is the one you notice.
      const turn = (BEAM_MIN_TURN + Math.random() * (1 - BEAM_MIN_TURN)) * Math.PI;
      b.dir += Math.random() < 0.5 ? -turn : turn;
      // Tilt varies too. All four at full reach every time is its own kind of
      // uniform, just a less obvious one than moving together.
      const tilt = reach * (0.55 + Math.random() * 0.45);
      b.tgtZ = Math.cos(b.dir) * tilt;
      b.tgtX = -Math.sin(b.dir) * tilt;
    }
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

    // ---- the beat itself ---------------------------------------------------
    // `bar` steps once per beat, so this fires exactly once per beat however
    // long or short the frame was. Everything that CUES rather than drifts is
    // decided here; the frame-by-frame code below only eases towards it.
    if (s.bar !== this._lastBar) {
      const first = this._lastBar < 0;
      this._lastBar = s.bar;
      if (s.downbeat || first) {
        // Looks change on the ONE and only there. A show that changed state
        // mid-bar would read as a fault; on the downbeat it reads as a cue.
        if (first || ++this._barsHeld >= LOOK_BARS) {
          this._barsHeld = 0;
          this._look = (this._look + 1 + ((Math.random() * (LOOKS.length - 1)) | 0))
            % LOOKS.length;
        }
      }
      this._cueBeams();
      this.lasers.cue(LOOKS[this._look].sweep);
      // The comet steps a fixed share of the wall on every beat. A lap takes a
      // whole number of BARS, so it passes the same corner on the same beat
      // every time round - which is what makes it read as counting the music
      // rather than as sliding past it. The house lights stop it dead.
      const lapBeats = LAP_BEATS_IDLE + (LAP_BEATS_HOT - LAP_BEATS_IDLE) * this._energy;
      this._chaseTarget += (1 / lapBeats) * (1 - this._house);
    }

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
    // Density crawling around the shafts. One write, outside the loop: all
    // four beams share the texture. Slow on purpose - this is smoke drifting
    // through a fixed beam, and anything fast enough to notice reads as the
    // texture sliding rather than as air moving.
    this._beamTex.offset.x = this.t * 0.035;
    // Aim eases towards whatever the last beat cued, fast enough to be over
    // before the next one. This used to be a pair of sines on wall-clock time,
    // which meant the loudest thing in the room was the one thing in it moving
    // to nothing in particular.
    const snap = Math.min(1, dt * BEAM_SNAP);
    // One stab shape for all four - they fire together, which is what makes
    // the figure they are holding legible as a single shape.
    const punch = Math.pow(beat, BEAM_SHARP) * (s.downbeat ? BEAM_DOWNBEAT : 1);
    const look = LOOKS[this._look];
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      b.aimZ += (b.tgtZ - b.aimZ) * snap;
      b.aimX += (b.tgtX - b.aimX) * snap;
      b.pivot.rotation.z = b.aimZ;
      b.pivot.rotation.x = b.aimX;
      b.mat.color.copy(this._colour);
      // Beams are the loudest thing in the room, so they are the first thing
      // the house lights take away. Still gated on `_energy` as well as the
      // beat, and that gate is deliberate: shown at a flat base they read as
      // static grey cones hanging in an idle room rather than as light.
      //
      // The peak is roughly seven times what it was before the rig was
      // rebuilt, which sounds reckless and is not - the map above multiplies
      // every fragment down by its position along the shaft, so the old values
      // were being spent twice and the beams came out barely there. Brightness
      // is also the one thing here that is genuinely free: it changes the
      // VALUE written to pixels already being blended, not how many of them
      // there are. Widening the cones would have been the expensive way to
      // solve the same complaint.
      // Everything multiplies `punch`, nothing is added to it, so when the
      // envelope reaches zero so does the beam - which is the whole point.
      const o = punch * (BEAM_PUNCH * this._energy + level * BEAM_GLOW)
        * this._energy * (1 - dark) * (1 - this._house) * look.beams;
      b.mat.opacity = Math.min(0.9, o);
      // An invisible mesh is culled before rasterisation; a fully transparent
      // one is still drawn. These are big double-sided additive cones, so that
      // difference is most of their cost.
      b.pivot.visible = b.mat.opacity > 0.008;
    }

    // ---- lasers ------------------------------------------------------------
    // A second colour in the room, held away from the room's own on the hue
    // wheel. One colour is a mood and two is a show: it is the cheapest thing
    // in this file that makes the venue look twice as full, because every
    // crossing of the two is a place the eye has something to resolve.
    if (look.white) {
      this._laserColour.setRGB(1, 1, 1);
    } else {
      this._colour.getHSL(this._hsl);
      // Forced back up to full saturation. The room's colour is lerping
      // between accents and spends time desaturated in the middle of a step;
      // a laser is a single wavelength and is never washed out.
      // Lightness at a half, not above it: over a half is white mixed into the
      // hue, and additive blending will do all the brightening that is wanted
      // without also washing the colour out of it.
      this._laserColour.setHSL((this._hsl.h + LASER_HUE) % 1, 1, 0.5);
    }
    // Gated by the same stab the beams use, so the two instruments hit
    // together even when only one of them is in the look. The house lights
    // take the lasers away entirely - an intermission is not a show.
    const laserGain = punch * (0.85 + level * 0.5) * (0.35 + this._energy * 0.65)
      * (1 - dark) * (1 - this._house) * look.lasers;
    this.lasers.update(dt, s.camPos, this._laserColour, laserGain, look.sweep);

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
    // The ONE hits harder than the other three. Four identical pulses per bar
    // is a flicker; one big one and three small ones is a bar, and the room
    // suddenly has a downbeat you can feel without being told about it.
    const hit = beat * this._energy * (s.downbeat ? DOWNBEAT_ACCENT : 1);
    const trimGain = 1.2 + hit * 2.4 + heart * 2;
    this.mats.trim.emissive.copy(emCol);
    this.mats.trim.emissiveIntensity = trimGain * (1 - dark);
    this.mats.deckEdge.emissive.copy(emCol);
    this.mats.deckEdge.emissiveIntensity = (0.8 + hit * 1.6) * (1 - dark);
    this.mats.platEdge.emissive.copy(emCol);
    this.mats.platEdge.emissiveIntensity = (0.9 + hit * 1.4) * (1 - dark);

    // ---- the wall chase ----------------------------------------------------
    // The head-height strips around the four walls are cut into cells with
    // their own materials (see arena.js), and this is what that buys: a bright
    // pulse running around the room on the beat, at the eye level the fight is
    // actually played at. The ceiling rig is above the player's sightline for
    // most of a run; this is the part of the show they cannot help but see.
    const cells = this.mats.wallStrip;
    const n = cells.length;
    // The head no longer walks the perimeter on wall-clock time. It is given a
    // step on each beat (see update() above) and chases it, so it SURGES on the
    // hit and settles between - which is the same distance travelled, arriving
    // in time with the music instead of merely near it. Fast enough to be
    // mostly there by the next beat; not instant, because a comet that
    // teleports is four separate bright cells, not a comet.
    this._chase += (this._chaseTarget - this._chase) * Math.min(1, dt * 9);
    // Both wrap together, so the difference above never sees the seam. Keyed
    // on the CHASER, which trails the target: wrapping when the target passes
    // 1 instead would leave the chaser just below zero and put the head off
    // the end of the cell ring.
    if (this._chase >= 1) { this._chase -= 1; this._chaseTarget -= 1; }
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
    // The room closes in for a boss and opens back up afterwards, and the haze
    // BREATHES with the bass the rest of the time, so the air is part of the
    // show rather than a fixed setting. Fog colour takes a wash of the accent
    // too, which is most of what sells a smoke-filled venue.
    //
    // The bass term is held to a third: enemy colour is the game's primary
    // read and fog is the one control in this file that can quietly wash every
    // one of them out. The house lights thin it instead of thickening it - an
    // intermission is the room's lights coming up, and clearing the air is
    // half of what that looks like.
    const fogTarget = (boss ? FOG_DENSITY_BOSS : FOG_DENSITY)
      * (1 + level * 0.3) * (1 - this._house * 0.35);
    this.scene.fog.density += (fogTarget - this.scene.fog.density) * Math.min(1, dt * 1.5);
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
