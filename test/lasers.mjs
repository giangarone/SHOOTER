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

// Force every pair lit the way the choreography would: playing from bar 0,
// sustained, master's hand off the dimmer. bar() is the same gate the music
// drives through.
for (const b of banks) { b.playing = true; b.entry = 0; }
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

console.log(fails ? '\nLASERS TEST FAIL' : '\nLASERS TEST PASS');
process.exit(fails ? 1 : 0);
