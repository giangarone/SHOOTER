// THE LASER PLACEMENT LAW, IN EXECUTABLE FORM.
//
// The laser bank used to hang on the truss and rake the floor. It reads
// brilliantly and it costs the game its most expensive real estate: the
// centre of the arena is where the fight is played, and nine moving rays
// through it every bar is the one thing the player cannot afford to have
// in the way. The projectors now stand low on the perimeter walls and fire
// upward, so the fan's light goes to the ceiling and the upper walls and
// never descends to where the war is. The assertions below are that
// promise, executed:
//
//   - the mounts themselves are where the comment in lasers.js says they
//     are: low, inside the wall lane the terrain grid cannot reach;
//   - the mirrored pair is an exact mirror through x = 0, the way the
//     bank's construction intends;
//   - over every roll and spread a fan can take, every ray the bank writes
//     climbs - the law that keeps the floor unobstructed for good rather
//     than at the one frame anyone screenshot;
//   - and by the time a ray crosses the room's middle it is above a boss's
//     head, so the fan sweeping overhead is set dressing, not cover.
//
// Pure data, no browser, no server: the shape of themes.mjs, run the same
// way. The fan's own _write() is driven directly so what is asserted is the
// geometry the game renders, not a re-derivation of it - if the spread or
// the mount changes, this suite fails on the numbers the game would have
// drawn.
import * as THREE from 'three';
import { Lasers } from '../js/lasers.js';
import { BOUND, CEIL_Y } from '../js/arena.js';
import { AGENT_HEIGHT, BOSS_HEIGHT } from '../js/utils.js';

let fails = 0;
function ok(label, cond, detail = '') {
  if (!cond) fails++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${label}${detail ? '   ' + detail : ''}`);
}

const lasers = new Lasers(new THREE.Object3D(), new THREE.BoxGeometry(1, 1, 1));
const banks = lasers.banks;

// Force every pair lit the way the choreography would: playing every bar of
// the phrase, sustained, master's hand off the dimmer. bar() is the same
// gate the music drives through.
for (const b of banks) { b.playing = true; b.mask = 0xF; }
lasers.bar(0);

const camPos = new THREE.Vector3(0, 1, 0);
const colour = new THREE.Color(1, 1, 1);

// ---- 1. the mounts ----------------------------------------------------------
//
// A housing below head height reads as a fixture on the wall rather than as
// something in the room; the lane check is what guarantees no generated
// piece can ever stand in front of one - the terrain grid stops at +-20
// while the wall sits at BOUND = 22.
ok('every pair is an exact mirror through x = 0', banks.every((b) => {
  const l = b.emitters[0], r = b.emitters[1];
  return r.pos.x === -l.pos.x && r.pos.y === l.pos.y && r.pos.z === l.pos.z &&
    r.u.x === -l.u.x && r.u.y === l.u.y && r.u.z === l.u.z;
}));
let mountMinX = Infinity, mountMaxX = 0, mountMinY = Infinity, mountMaxY = 0;
for (const b of banks) {
  for (const e of b.emitters) {
    mountMinX = Math.min(mountMinX, Math.abs(e.pos.x));
    mountMaxX = Math.max(mountMaxX, Math.abs(e.pos.x));
    mountMinY = Math.min(mountMinY, e.pos.y);
    mountMaxY = Math.max(mountMaxY, e.pos.y);
  }
}
ok('every mount is below head height',
  mountMaxY < AGENT_HEIGHT, `highest mount y=${mountMaxY.toFixed(2)}`);
ok('every mount is clear of the floor', mountMinY > 0.4, `lowest mount y=${mountMinY.toFixed(2)}`);
ok('every mount is inside the wall lane, inside the room',
  mountMinX > 20 && mountMaxX < BOUND,
  `lane x in [${mountMinX.toFixed(2)}, ${mountMaxX.toFixed(2)}], grid stops at 20, wall at ${BOUND}`);

// ---- 2. no ray ever descends ------------------------------------------------
//
// The fan's plane rolls around the aim the whole time a pair is lit, so a
// single frame at one orientation proves nothing about the next bar. The
// sweep below walks roll through a full circle and spread across the range
// the constructor stands up with, and reads the ray endpoints that
// Lasers._write actually wrote - the same buffer the renderer draws.
//
// ROLL_STEPS finely enough that the fan's worst orientation is sampled
// within the pole's own tolerance; the pitch law then says the shallowest
// ray the bank can produce at any moment still climbs by a real margin.
// The number is the whole game: a fan that ever dips a ray below horizontal
// has painted a line back down the room at the fight's height, and that is
// the look this bank used to have and was moved to the walls to end.
const ROLLS = 32;
// The widest fan the constructor can ever hold - read off the banks before
// any phrase() narrows them, so this suite tracks SPREAD_MAX rather than
// re-stating it.
const FAN_MAX = Math.max(...banks.map((b) => b.spread));
const SPREADS = [FAN_MAX * 0.35, FAN_MAX * 0.7, FAN_MAX];

let minPitch = Infinity;
let minEndY = Infinity;
let outOfRoom = 0;
let rays = 0;
for (let s = 0; s < SPREADS.length; s++) {
  for (let k = 0; k < ROLLS; k++) {
    for (const b of banks) {
      b.roll = (k / ROLLS) * Math.PI * 2;
      b.spread = SPREADS[s];
      b.spreadTo = SPREADS[s];
    }
    // A tiny dt: choreography advances a hair, which the assertions do not
    // care about, and the buffers are written.
    lasers.update(0.001, camPos, colour, 1, 1);
    for (const b of banks) {
      const pos = b._rayPos;
      for (let q = 0; q < pos.length / 12; q++) {
        const o = q * 12;
        // Each quad is [lens + s, lens - s, far - s, far + s]; the midpoint
        // cancels the side vector, giving back the exact endpoints.
        const ax = (pos[o] + pos[o + 3]) / 2;
        const ay = (pos[o + 1] + pos[o + 4]) / 2;
        const az = (pos[o + 2] + pos[o + 5]) / 2;
        const bx = (pos[o + 6] + pos[o + 9]) / 2;
        const by = (pos[o + 7] + pos[o + 10]) / 2;
        const bz = (pos[o + 8] + pos[o + 11]) / 2;
        rays++;
        const dx = bx - ax, dz = bz - az;
        const pitch = Math.asin((by - ay) / Math.hypot(dx, by - ay, dz));
        if (pitch < minPitch) minPitch = pitch;
        if (by < minEndY) minEndY = by;
        if (Math.abs(bx) > BOUND + 1e-6 || Math.abs(bz) > BOUND + 1e-6
          || by > CEIL_Y + 1e-6 || by < -1e-6) outOfRoom++;
      }
    }
  }
}
ok('every ray climbs at least 15 degrees', minPitch > 0.26,
  `shallowest ray ${(minPitch * 57.2958).toFixed(1)}deg over ${rays} rays`);
ok('every ray lands in the room, on wall or ceiling', outOfRoom === 0,
  `${outOfRoom} of ${rays} escaped`);
ok('no ray ends below where it began', minEndY >= mountMinY - 1e-6,
  `lowest landing y=${minEndY.toFixed(2)}`);

// ---- 3. the middle of the room is clear --------------------------------------
//
// The fight is played in the open middle. Where the ray's ground-track
// crosses the centre disc - radius 9, a third of the way out from the
// middle to any wall lane edge - its height there must be over the head of
// the tallest thing in the fight. Below that it is part of the
// obstruction; above it, it is the sky.
const CENTRE_R = 9;
let worstCentreY = Infinity;
for (let s = 0; s < SPREADS.length; s++) {
  for (let k = 0; k < ROLLS; k++) {
    for (const b of banks) {
      b.roll = (k / ROLLS) * Math.PI * 2;
      b.spread = SPREADS[s];
      b.spreadTo = SPREADS[s];
    }
    lasers.update(0.001, camPos, colour, 1, 1);
    for (const b of banks) {
      const pos = b._rayPos;
      for (let q = 0; q < pos.length / 12; q++) {
        const o = q * 12;
        const ax = (pos[o] + pos[o + 3]) / 2;
        const ay = (pos[o + 1] + pos[o + 4]) / 2;
        const az = (pos[o + 2] + pos[o + 5]) / 2;
        const bx = (pos[o + 6] + pos[o + 9]) / 2;
        const by = (pos[o + 7] + pos[o + 10]) / 2;
        const bz = (pos[o + 8] + pos[o + 11]) / 2;
        const dx = bx - ax, dz = bz - az;
        // Solve |A + t D| = CENTRE_R for the ground track's entry into the
        // centre disc; a ray that never enters it has no say in this law.
        const a = dx * dx + dz * dz;
        const bb = 2 * (ax * dx + az * dz);
        const c = ax * ax + az * az - CENTRE_R * CENTRE_R;
        const disc = bb * bb - 4 * a * c;
        if (disc <= 0) continue;
        const t = (-bb - Math.sqrt(disc)) / (2 * a);
        if (t < 0 || t > 1) continue;
        const y = ay + t * (by - ay);
        if (y < worstCentreY) worstCentreY = y;
      }
    }
  }
}
ok('every ray crosses the centre above boss height', worstCentreY > BOSS_HEIGHT,
  `lowest crossing at y=${worstCentreY.toFixed(2)} over r=${CENTRE_R}, bosses ${BOSS_HEIGHT}`);

// ---- 4. every move obeys the placement law while it runs -------------------
//
// Sections 2 and 3 prove the law across the whole (roll, spread) space under
// the bank's default SWEEP. The moves a phrase can cast produce their own
// motion through that space - a blooming fan snaps to it, a rushing one
// crosses it fast, and COUNTER and WEAVE roll each half of a pair somewhere
// the other half never goes. No move may touch the aim or open past
// SPREAD_MAX (the clamp in update() is what guarantees the second),
// and this section is the executable proof: every move is driven through
// sixteen simulated bars-by-beats-on-frames and every frame's rays are held
// to the law. Violations are COUNTED, not minimised: a NaN slips through a
// Math.min and fails a comparison.
const ALL_MOVES = [0, 1, 2, 3, 4, 5, 6, 7];
let moveViol = 0;
let moveRays = 0;
for (const mv of ALL_MOVES) {
  // Cast the way phrase() casts: the pattern lives on the bank-of-banks and
  // _castMove hands each playing pair its share of it. Half the rehearsals
  // ripple, so the per-ray shimmer path is written too.
  lasers._move = mv;
  lasers._pulsing = false;
  lasers._ripple = (mv & 1) === 1;
  lasers._pendAmp = 0.8;
  lasers._pendRate = 1.7;
  for (let i = 0; i < banks.length; i++) {
    const b = banks[i];
    b.playing = true;
    b.mask = 0xF;
    b.barsOn = 0;
    b.t = 0;
    b.on = false;
    lasers._castMove(b, i);
  }
  for (let barI = 0; barI < 4; barI++) {
    lasers.bar(barI);
    for (let beatI = 0; beatI < 4; beatI++) {
      lasers.beat();
      // 24 frames of 1/60s: about a beat's worth at the track's 145 BPM.
      for (let f = 0; f < 24; f++) {
        lasers.update(1 / 60, camPos, colour, 1, 1);
        for (const b of banks) {
          const pos = b._rayPos;
          for (let q = 0; q < pos.length / 12; q++) {
            const o = q * 12;
            const ax = (pos[o] + pos[o + 3]) / 2;
            const ay = (pos[o + 1] + pos[o + 4]) / 2;
            const az = (pos[o + 2] + pos[o + 5]) / 2;
            const bx = (pos[o + 6] + pos[o + 9]) / 2;
            const by = (pos[o + 7] + pos[o + 10]) / 2;
            const bz = (pos[o + 8] + pos[o + 11]) / 2;
            moveRays++;
            const dx = bx - ax, dz = bz - az;
            const pitch = Math.asin((by - ay) / Math.hypot(dx, by - ay, dz));
            if (!(pitch > 0.26)) moveViol++;
            if (!(by >= mountMinY - 1e-6)) moveViol++;
            if (Math.abs(bx) > BOUND + 1e-6 || Math.abs(bz) > BOUND + 1e-6
              || by > CEIL_Y + 1e-6 || by < -1e-6) moveViol++;
          }
        }
      }
    }
  }
}
ok('every move keeps every ray climbing and in the room, every frame',
  moveViol === 0 && moveRays > 10000,
  `${moveViol} violations over ${moveRays} rays across ${ALL_MOVES.length} moves x 16 bars`);

// ---- 5. the formations' promises -------------------------------------------
//
// Run the phrase and bar gates the way the rig drives them, over hundreds of
// cast phrases, and hold the promises the bank makes regardless of what
// formation or moves were drawn:
//
//   - the CLOSE of a phrase is always lit while any pair still has light to
//     give (every formation's masks cover bar 3, and a pair that entered
//     late is a legitimate gap earlier in the phrase - those bars may be
//     dark by design). A fully dark phrase is allowed exactly when every
//     pair entered it spent: that is the bank catching its breath, and is
//     what a unison is meant to be followed by;
//   - no pair burns indefinitely: the sit-out rule bounds a run to one full
//     phrase, and being dragged back in by the never-dark fallback can add
//     one more - two phrases is the ceiling;
//   - and the sit-out rule is actually firing: over this many phrases at
//     least one pair must be spent at some boundary, or the cap is dead
//     code wearing a comment.
let barThreeDark = 0;
let maxStreak = 0;
let spentSeen = 0;
let mixedPhrases = 0;
const streak = banks.map(() => 0);
for (let trial = 0; trial < 400; trial++) {
  lasers.phrase();
  const allSpent = banks.every((b) => b.spent);
  if (banks.some((b) => b.spent)) spentSeen++;
  // One pattern per phrase: every playing pair shares the move and the
  // brightness behaviour. The formations vary WHEN pairs light; what they
  // DO when lit is the phrase's single cast.
  const playing = banks.filter((b) => b.playing);
  if (playing.some((b) => b.move !== playing[0].move || b.pulsing !== playing[0].pulsing)) {
    mixedPhrases++;
  }
  for (let barI = 0; barI < 4; barI++) {
    lasers.bar(barI);
    let any = false;
    for (let i = 0; i < banks.length; i++) {
      if (banks[i].on) {
        any = true;
        streak[i]++;
        if (streak[i] > maxStreak) maxStreak = streak[i];
      } else {
        streak[i] = 0;
      }
    }
    if (barI === 3 && !any && !allSpent) barThreeDark++;
  }
}
ok('the close of a phrase is lit while any pair has light to give',
  barThreeDark === 0, `${barThreeDark} dark closes over 400 phrases`);
ok('no pair burns longer than two phrases', maxStreak <= 8,
  `longest continuous run ${maxStreak} bars`);
ok('the sit-out rule fires', spentSeen > 0,
  `phrases containing a spent pair: ${spentSeen}`);
ok('every phrase plays a single pattern', mixedPhrases === 0,
  `${mixedPhrases} phrases had pairs on different casts`);

// Rehearse four lit beats, then the first frame of the other side's bar.
// Check the rendered buffers, so a shutter that only fixes its state fails.
const shutters = new Lasers(new THREE.Object3D(), new THREE.BoxGeometry(1, 1, 1));
for (const b of shutters.banks) {
  b.playing = true;
  b.mask = 0xF;
  b.move = 6; // ALTERNATE, as in ALL_MOVES above.
  b.pulsing = false;
}
shutters.bar(0);
for (let beat = 0; beat < 4; beat++) {
  shutters.beat();
  shutters.update(1 / 60, camPos, colour, 1, 1);
}
for (const bar of [1, 2]) {
  shutters.bar(bar);
  shutters.beat();
  shutters.update(1 / 240, camPos, colour, 1, 1);
  const darkSide = bar & 1 ? 0 : 1;
  ok(`alternating bar ${bar}: outgoing rays and fill cut on the first frame`,
    shutters.banks.every((b) => {
      const colours = b.rayGeo.attributes.color.array;
      const half = colours.length / 2;
      const dark = colours.slice(darkSide * half, (darkSide + 1) * half);
      const live = colours.slice((1 - darkSide) * half, (2 - darkSide) * half);
      const fill = b.fillGeo.attributes.position.array;
      const split = fill.length / 2;
      return !b.emitters[darkSide].lens.visible && b.emitters[1 - darkSide].lens.visible
        && dark.every((v, i) => i % 4 !== 3 || v === 0)
        && live.some((v, i) => i % 4 === 3 && v > 0)
        && fill.slice(darkSide * split, (darkSide + 1) * split).every((v) => v === 0);
    }));
}
for (const b of shutters.banks) b.mask = 1;
shutters.bar(0);
shutters.update(1 / 60, camPos, colour, 1, 1);
const wasLit = shutters.banks.every((b) => b.rayMesh.visible) && shutters._impactCount > 0;
shutters.bar(1);
shutters.update(1 / 240, camPos, colour, 1, 1);
ok('scheduled off bar is fully dark on its first frame', wasLit
  && shutters.banks.every((b) => !b.rayMesh.visible && !b.fillMesh.visible
    && b.emitters.every((em) => !em.lens.visible))
  && shutters._impactCount === 0
  && shutters._impactCol.every((v, i) => i % 4 !== 3 || v === 0));
shutters.bar(0);
shutters.update(1 / 60, camPos, colour, 1, 1);
// A fully closed bank must also clear last frame's wall/ceiling spots.
shutters.update(1 / 240, camPos, colour, 1, 0);
ok('master closes rays, fill, lenses and impact spots in the same frame',
  shutters.banks.every((b) => !b.rayMesh.visible && !b.fillMesh.visible && b.aperture.opacity === 0)
    && shutters._impactCount === 0
    && shutters._impactCol.every((v, i) => i % 4 !== 3 || v === 0));

console.log(fails ? '\nLASERS TEST FAIL' : '\nLASERS TEST PASS');
process.exit(fails ? 1 : 0);
