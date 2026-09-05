// Procedural per-wave terrain: the arena's interior, generated fresh for every
// wave, built out of the floor on the beat, and sunk away again when the wave
// clears so the shop phase happens on a bare floor.
//
// arena.js is now only the ROOM - floor, four walls, ceiling, lights. Every
// platform, crate, tower, wall and walkway inside it comes from here.
//
// TWO HALVES, and the split is the same one waves.js makes. The top of this
// file is a PURE generator: integers, a seeded RNG, no three.js, no DOM. That
// is what lets test/terrain.mjs generate five hundred layouts in a node
// process and assert every one of them is playable. The bottom half is
// TerrainSet, which owns a fixed pool of meshes and animates them.
//
// NOTHING IS ALLOCATED PER WAVE. The smoke test caps unique geometries under
// 120 and shader programs at 31, and asserts the light count never changes; a
// generator that made a mesh per prop would blow through all three inside a
// minute. So the pool is built once from the shared BOX and CYL in arena.js
// and the materials arena.js already compiled, and a new layout only moves
// slots around. Colour comes from emissive materials rig.js pulses. No light
// is ever created here.
//
// WHY PREFAB PIECES AND NOT RANDOM BOXES. Scattering boxes at random produces
// one of two failures and never anything else: soup, where nothing is cover
// because nothing is bigger than the player; or a maze, where the fight stops
// being a fight and becomes navigation. A piece is a hand-authored arrangement
// with a footprint and a declared cost - a chicane, a stair up to a deck, a
// gate you walk under - so the RANDOMNESS IS IN THE ARRANGEMENT, not in the
// geometry. Every piece is known to be fair on its own; the generator's job is
// only to choose which ones and where.
//
// AND THEN IT IS CHECKED. See validate(): a layout that does not leave every
// spawn point connected to the middle of the room, at a blocked fraction under
// the wave's budget, is thrown away and rerolled. That test is the actual
// guarantee that the arena never becomes a maze - a number, not a hope.

import * as THREE from 'three';
import { makeAabb, AGENT_HEIGHT, STEP_HEIGHT } from './utils.js';
import { isBossWave } from './waves.js';

// ---- the placement grid ---------------------------------------------------
//
// Four metres: two player-widths plus room to walk between two pieces that
// happen to land side by side. Finer than this and pieces start touching to
// form accidental walls nobody authored; coarser and there are too few cells
// to make a layout out of.
const GRID_CELL = 4;
const GRID_N = 10;
// Cell (0,0) is centred at -18 and cell (9,9) at +18, so a two-cell piece
// reaches +-20 and leaves a two-metre lane against the wall at 22.
//
// IT USED TO STOP AT +-16, and that was most of why a furnished layout still
// read as an empty room: the grid covered the middle 1024 square metres of a
// floor that is 1936, so a third of the arena was a bare ring round the
// outside whatever the generator did. The perimeter is where the fight spills
// when it goes wrong, and it was the one part of the room that never changed.
const GRID_ORIGIN = -18;

export function cellCentre(i) {
  return GRID_ORIGIN + i * GRID_CELL;
}

// ---- the plaza ------------------------------------------------------------
//
// ONE CLEARLY OPEN AREA PER LAYOUT.
//
// Density used to have no spatial term at all. attempt() shuffles all hundred
// cells into a single list and fills them until the cost budget runs out, and
// validate() only ever checked GLOBAL numbers - blocked fraction, floor
// covered, connectivity - so nothing in this file could ask for one part of
// the room to be emptier than another. Every wave came out evenly furnished
// everywhere, and a room that is the same amount of crowded in all directions
// is a room with nowhere to move to.
//
// The plaza is that ask: a disc of floor no piece may put COVER inside. It is
// not a lower budget - the budget is unchanged and the cost the plaza does not
// spend is spent on the rest of the grid instead, so the dense parts of the
// room come out denser than they were rather than the whole room thinner.
//
// AND IT MOVES. A permanently open middle would give every layout the same
// silhouette, which is the monotony this is meant to fix arriving one level
// up. The centre is drawn per wave, biased toward the middle of the room but
// free to sit off it.
// Fourteen metres of clear floor across, which is a third of the room's width:
// enough to cross at a run, to read where a wave is coming from, and to fight
// a group in without backing into something.
//
// IT IS THE REAL RADIUS. An earlier cut measured the plaza against the grid
// CELLS a piece owns rather than against the piece, and a cell is four metres
// across - so pieces were turned away while their block merely touched the
// disc, up to 2.8m of half-diagonal further out, and asking for 7.5 produced a
// twenty-metre clearing that took floor coverage from 18.8% to 14.8%. Measuring
// the piece itself (see pieceExtent) is what makes this number mean what it
// says.
const PLAZA_R = 7;
// How far the centre may wander from the middle of the room. Two uniform
// draws summed, so the distribution is triangular: usually within four or
// five metres of centre, occasionally out at nine, and the disc's far edge
// still lands inside the grid rather than out in the wall lane.
const PLAZA_OFFSET = 9;
// WHAT IS ALLOWED TO STAND IN IT, and this list is the whole design rather
// than a tuning value.
//
// The plaza is open, not safe: it is where the player has room to move and
// read the room, and the price of that room is that nothing in it stops a
// bullet from more than one direction. Towers and pillars are landmarks - you
// round them, and they give the eye something to judge distance against -
// which is why they may stand here and a crate cluster, a wall or a bunker
// may not.
//
// The piece that must never be in this set is `colonnade`: three towers on a
// four-metre pitch is a pillar-dance camp, where you break every line of fire
// by circling one column while the wave queues up behind it. Open floor has
// to cost something or it is just the best place to stand.
export const PLAZA_PIECES = new Set(['tower', 'big_pillar']);
// And how many of them. Three across a fifteen-metre disc is sparse enough to
// cross at a run and still leaves the plaza something to look at.
export const PLAZA_MAX = 3;

// Where this layout's open floor is. Called once per attempt, off the same
// seeded rng as everything else, so a layout is still reproducible from
// (seed, wave).
function pickPlaza(rng) {
  const off = () => (rng() + rng() - 1) * PLAZA_OFFSET;
  return { x: off(), z: off(), r: PLAZA_R };
}

// Does a footprint of half-extents (hx, hz) centred at (px, pz) reach into the
// plaza? The standard rounded-rectangle-vs-circle test: clamp the circle's
// centre to the rectangle and measure what is left.
function touchesPlaza(plaza, px, pz, hx, hz) {
  const dx = Math.max(0, Math.abs(px - plaza.x) - hx);
  const dz = Math.max(0, Math.abs(pz - plaza.z) - hz);
  return dx * dx + dz * dz < plaza.r * plaza.r;
}

// ---- how big a piece really is -------------------------------------------
//
// A piece declares its footprint in GRID CELLS, and that is what placement
// packs with, but the cells are not what it occupies: several pieces overhang
// the block they are packed into. A gateway's outer wall reaches 4.7m from
// centre inside a 4m half-block, and a high_deck's slab overhangs on one side
// - so a plaza test written against the cell block let a wall stand 0.7m
// inside the disc while believing it had rejected it. That was not a rounding
// error; test/terrain.mjs caught gateways and decks sitting in the plaza.
//
// So the real extents are measured, once per piece, off the primitives the
// piece actually emits. SOLID ONES ONLY: a decorative lip that overhangs is
// something the plaza can happily have across it, since nothing collides with
// it.
//
// Symmetric about the centre by construction - the max of |x| + half-width
// over the prims, applied both ways - which errs toward calling a piece bigger
// than it is on its narrow side. That is the safe direction for the one thing
// this feeds.
const EXTENTS = new Map();
function pieceExtent(piece) {
  let e = EXTENTS.get(piece.key);
  if (e) return e;
  let hx = 0;
  let hz = 0;
  // Three fixed draws rather than one, because a piece may vary with its rng
  // (crate_cluster picks how many cabinets and where) and the widest of its
  // variants is the one that has to fit.
  for (const v of [0.13, 0.5, 0.87]) {
    piece.build((p) => {
      if (!p.solid) return;
      hx = Math.max(hx, Math.abs(p.x) + (p.w + (p.pad || 0)) / 2);
      hz = Math.max(hz, Math.abs(p.z) + (p.d + (p.pad || 0)) / 2);
    }, () => v);
  }
  e = { hx, hz };
  EXTENTS.set(piece.key, e);
  return e;
}

// ---- the piece library ----------------------------------------------------
//
// Each piece declares:
//   cells   footprint in grid cells, before rotation
//   cost    its share of the wave's openness budget (see costBudget)
//   minWave the wave it unlocks on - enclosed and vertical pieces arrive later
//   tall    true if the piece breaks a sightline, used to keep a layout from
//           being made entirely of things you can see over, or entirely not
//   build   emits primitives in LOCAL metres, centred on the piece
//
// A primitive is the same shape the pool consumes and the same shape the
// validator reads, so what is drawn, what is collided with and what is checked
// can never disagree:
//
//   { kind, mat, x, y, z, w, h, d, solid, shoot, pad }
//
//   kind   'box' (the shared unit cube) or 'cyl' (the shared unit cylinder)
//   mat    a key into TerrainSet's material table
//   solid  emit an AABB into arena.obstacles
//   shoot  push the mesh onto arena.meshList so bullets raycast against it
//   pad    extra AABB width, for round or rotated meshes a box cannot model
//
// Decorative emissive lips carry solid:false, shoot:false. They are the
// coloured elements the arena has always had, and they are drawn with the
// SAME shared materials rig.js already pulses - so generated terrain lights up
// with the room for free.

// ---- the shape contract ---------------------------------------------------
//
// Three numbers govern everything the library builds, and every piece below
// obeys them. They are not style: each one is a promise made to a different
// system, and breaking one produces terrain that looks fine and plays wrong.
//
//   RISER <= 0.6   Every height change a mover is meant to walk. It is under
//                  STEP_HEIGHT (0.62), so the player walks it without jumping
//                  and the nav grid plans routes over it. A 0.7 riser would
//                  look identical and silently become a wall.
//
//   DECK <= 2.6    The top of anything walkable. It is at or under nav.js's
//                  MAX_STAND, so enemies can be routed onto it - which is what
//                  makes high ground contested rather than a place to farm
//                  from. Anything a stair leads to is a deck.
//
//   WALL >= 2.8    The bottom of anything meant to STOP you. Above MAX_STAND,
//                  so no route is ever planned over it and it reads as a wall
//                  from both sides. This is why walls in here are tall: at 2.2
//                  they were shorter than the tallest deck and the grid could
//                  not tell the two apart.
//
// And one more, for the things you go UNDER: a suspended span's underside must
// clear AGENT_HEIGHT (2.5), or it stops being something to duck through and
// becomes a ceiling that carves a pillar down to the floor.
const RISER = 0.6;
const DECK_MAX = 2.6;
const WALL_H = 3.0;

// A flight of steps climbing along +x, from the floor up to `top`. Returns
// nothing; emits treads. Used by every piece that has to get a mover up onto
// something, which is most of them - a deck with no way onto it is scenery.
function flight(emit, x0, z, top, width, dir = 1) {
  const n = Math.max(1, Math.ceil(top / RISER));
  const rise = top / n;
  const tread = 1.25;
  let lastX = x0;
  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1);
    lastX = x0 + dir * (i * tread + tread / 2);
    emit({
      kind: 'box', mat: 'plat',
      x: lastX, y: h / 2, z,
      w: tread, h, d: width, solid: true, shoot: true,
    });
  }
  // THE LIT NOSING BELONGS TO THE FLIGHT, not to the caller. It used to be
  // emitted by hand at a coordinate the caller guessed, and the guess was
  // wrong: the number of treads depends on how tall the flight is, so a strip
  // placed at a fixed offset ended up hanging in mid-air over the floor beyond
  // the last step. Emitting it here means it is always on the top tread,
  // whatever height the flight was asked for.
  emit({
    kind: 'box', mat: 'platEdge',
    x: lastX, y: top + 0.02, z, w: tread + 0.04, h: 0.05, d: width + 0.04,
  });
  return n * tread;
}

// A raised deck WITH ITS LEGS. Nothing in this arena floats: a slab hanging in
// the air with nothing under it is the single fastest way to make generated
// terrain look generated, so every deck that stands clear of the floor gets
// corner posts down to it. They are solid too, which is what makes the space
// underneath read as a colonnade rather than as a shadow.
function deckOnLegs(emit, x, z, w, d, top, thick = 0.35) {
  emit({ kind: 'box', mat: 'deck', x, y: top - thick / 2, z, w, h: thick, d,
         solid: true, shoot: true });
  emit({ kind: 'box', mat: 'deckEdge', x, y: top + 0.02, z, w: w + 0.04, h: 0.05, d: d + 0.04 });
  const legH = top - thick;
  if (legH <= 0.05) return;
  const ox = w / 2 - 0.45;
  const oz = d / 2 - 0.45;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      emit({ kind: 'box', mat: 'tower', x: x + sx * ox, y: legH / 2, z: z + sz * oz,
             w: 0.5, h: legH, d: 0.5, solid: true, shoot: true });
    }
  }
}

const PIECES = [
  // ---- low cover -------------------------------------------------------
  {
    key: 'crate_cluster', cells: [1, 1], cost: 1, minWave: 1, tall: false,
    // The speaker cabinets the arena has always used. The AABB is padded
    // because the mesh gets a random yaw an axis-aligned box cannot follow:
    // a 0.95 cube turned by up to 0.3rad reaches 0.594 from its centre, so
    // the pad has to be at least 0.24 or the corners of the cabinet you can
    // see stand outside the box you collide with.
    build(emit, rng) {
      const n = 2 + (rng() < 0.5 ? 1 : 0);
      const spots = [[-0.9, -0.7], [0.9, 0.6], [0, 1.2], [-1.1, 1.0]];
      shuffle(spots, rng);
      for (let i = 0; i < n; i++) {
        const [x, z] = spots[i];
        emit({ kind: 'box', mat: 'speaker', x, y: 0.475, z, w: 0.95, h: 0.95, d: 0.95,
               solid: true, shoot: true, pad: 0.26, yaw: rng() * 0.6 - 0.3 });
        emit({ kind: 'box', mat: 'cone', x, y: 0.6, z: z + 0.5, w: 0.62, h: 0.62, d: 0.04 });
      }
    },
  },
  {
    key: 'low_barrier', cells: [2, 1], cost: 1, minWave: 1, tall: false,
    // Knee height, and now a STEP rather than a wall: both sides walk over it
    // without breaking stride. What it still does is break a line along the
    // ground and give a shape to the space either side of it.
    build(emit) {
      emit({ kind: 'box', mat: 'deck', x: 0, y: RISER / 2, z: 0, w: 7, h: RISER, d: 0.8,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'deckEdge', x: 0, y: RISER + 0.03, z: 0, w: 6.8, h: 0.06, d: 0.2 });
    },
  },
  {
    key: 'planter', cells: [1, 1], cost: 1, minWave: 1, tall: false,
    // A two-step block: waist high, walkable in two strides, and something to
    // fight from the top of. The cheapest way in the library to put a change
    // of level under the player's feet.
    build(emit) {
      emit({ kind: 'box', mat: 'plat', x: 0, y: RISER / 2, z: 0, w: 3.2, h: RISER, d: 3.2,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'plat', x: 0, y: RISER, z: 0, w: 2.2, h: RISER * 2, d: 2.2,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'platEdge', x: 0, y: RISER * 2 + 0.02, z: 0,
             w: 2.24, h: 0.05, d: 2.24 });
    },
  },

  // ---- towers and pillars ----------------------------------------------
  {
    key: 'tower', cells: [1, 1], cost: 1, minWave: 1, tall: true,
    build(emit) {
      emit({ kind: 'cyl', mat: 'tower', x: 0, y: 1.5, z: 0, w: 1, h: 3.0, d: 1,
             solid: true, shoot: true, pad: 0.2 });
      emit({ kind: 'box', mat: 'trim', x: 0, y: 3.12, z: 0, w: 0.5, h: 0.14, d: 0.5 });
    },
  },
  {
    key: 'big_pillar', cells: [1, 1], cost: 1.5, minWave: 1, tall: true,
    // A full-height column, twice a tower's girth and running most of the way
    // to the truss. There is one thing in the room it does that nothing else
    // does: it gives the eye something to measure the CEILING against, so the
    // arena reads as a hall rather than as a floor with props on it.
    build(emit) {
      emit({ kind: 'box', mat: 'wall', x: 0, y: 3.4, z: 0, w: 2.0, h: 6.8, d: 2.0,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'wallGlow', x: 0, y: 2.6, z: 0, w: 2.08, h: 0.1, d: 2.08 });
      emit({ kind: 'box', mat: 'trim', x: 0, y: 6.86, z: 0, w: 1.4, h: 0.18, d: 1.4 });
    },
  },
  {
    key: 'colonnade', cells: [3, 1], cost: 2, minWave: 1, tall: true,
    // Three towers in a row: a boundary you can shoot through and cannot run
    // through, which is a different thing from a wall and worth having both.
    build(emit) {
      for (const x of [-4, 0, 4]) {
        emit({ kind: 'cyl', mat: 'tower', x, y: 1.5, z: 0, w: 1, h: 3.0, d: 1,
               solid: true, shoot: true, pad: 0.2 });
        emit({ kind: 'box', mat: 'trim', x, y: 3.12, z: 0, w: 0.5, h: 0.14, d: 0.5 });
      }
    },
  },
  {
    key: 'watchtower', cells: [2, 2], cost: 3.5, minWave: 1, tall: true,
    // THE TALL ONE. A stair to a mid landing, a second stair turning back on
    // itself, and a deck at 2.4 on four legs. It is the piece that puts the
    // player above the fight, and because both flights are ordinary treads it
    // is a place enemies come after them rather than a roost.
    build(emit) {
      const mid = 1.2;
      const top = 2.4;
      deckOnLegs(emit, 1.8, 1.4, 5.2, 4.4, top);
      // Landing at half height, tucked under the deck's near corner.
      emit({ kind: 'box', mat: 'plat', x: -3.4, y: mid / 2, z: 1.4, w: 2.4, h: mid, d: 4.4,
             solid: true, shoot: true });
      // Ground -> landing, then landing -> deck, the two flights facing
      // opposite ways so the climb doubles back inside the piece's footprint.
      flight(emit, -4.6, -2.2, mid, 3.2, 1);
      flight(emit, -2.2, 3.0, top - mid, 2.4, 1);
    },
  },

  // ---- decks and stairs -------------------------------------------------
  {
    key: 'stairs', cells: [2, 1], cost: 1.5, minWave: 1, tall: false,
    build(emit, rng) {
      const top = 1.2 + Math.round(rng()) * 0.6;
      flight(emit, -3.6, 0, top, 3.2, 1);
    },
  },
  {
    key: 'ramp_deck', cells: [2, 2], cost: 3, minWave: 1, tall: false,
    // Stairs and the deck they lead to, as one piece - so a layout that rolls
    // this always has high ground that is definitely reachable, rather than
    // hoping a loose stair landed beside a loose platform.
    build(emit, rng) {
      const top = 1.2 + rng() * 0.6;
      emit({ kind: 'box', mat: 'plat', x: 1.9, y: top / 2, z: 0, w: 4.2, h: top, d: 6.5,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'platEdge', x: 1.9, y: top + 0.02, z: 0,
             w: 4.24, h: 0.05, d: 6.54 });
      flight(emit, -4, 0, top, 3.4, 1);
    },
  },
  {
    key: 'tiered_deck', cells: [2, 2], cost: 3, minWave: 1, tall: false,
    // Three concentric steps. Every edge is a riser, so it is walked up from
    // any side at all - the one piece in the library with no wrong approach,
    // and the reason a dense layout never feels like it is herding you.
    build(emit) {
      for (let i = 0; i < 3; i++) {
        const h = RISER * (i + 1);
        const s = 7.2 - i * 1.9;
        emit({ kind: 'box', mat: 'plat', x: 0, y: h / 2, z: 0, w: s, h, d: s,
               solid: true, shoot: true });
      }
      emit({ kind: 'box', mat: 'platEdge', x: 0, y: RISER * 3 + 0.02, z: 0,
             w: 3.44, h: 0.05, d: 3.44 });
    },
  },
  {
    key: 'high_deck', cells: [2, 2], cost: 3.5, minWave: 1, tall: false,
    // A deck at 1.8 on legs, with a flight up one side. Under it is a covered
    // square you can fight from and shoot out of, which is the other half of
    // what a raised deck is worth.
    build(emit) {
      const top = 1.8;
      deckOnLegs(emit, 1.6, 0, 5.6, 6.4, top);
      flight(emit, -4.4, 0, top, 3.4, 1);
    },
  },

  // ---- walls and passages ----------------------------------------------
  {
    key: 'long_wall', cells: [2, 1], cost: 2, minWave: 1, tall: true,
    build(emit) {
      emit({ kind: 'box', mat: 'wall', x: 0, y: WALL_H / 2, z: 0, w: 7.6, h: WALL_H, d: 0.8,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'wallGlow', x: 0, y: WALL_H + 0.04, z: 0,
             w: 7.4, h: 0.08, d: 0.2 });
    },
  },
  {
    key: 'wall_chicane', cells: [2, 2], cost: 2.5, minWave: 1, tall: true,
    // Two overlapping segments offset across the piece: no straight line
    // through it, no way to be stuck in it. You serpentine, which is the
    // movement this piece exists to make.
    build(emit) {
      for (const s of [-1, 1]) {
        emit({ kind: 'box', mat: 'wall', x: s * 1.6, y: WALL_H / 2, z: s * 2.2,
               w: 6.4, h: WALL_H, d: 0.8, solid: true, shoot: true });
        emit({ kind: 'box', mat: 'wallGlow', x: s * 1.6, y: WALL_H + 0.04, z: s * 2.2,
               w: 6.2, h: 0.08, d: 0.2 });
      }
    },
  },
  {
    key: 'gateway', cells: [2, 1], cost: 2, minWave: 1, tall: true,
    // A wall with a door in it. The door is what makes it different from
    // long_wall: it is a wall that says where to cross, and a place worth
    // watching because everyone who crosses there comes through one gap.
    build(emit) {
      for (const s of [-1, 1]) {
        emit({ kind: 'box', mat: 'wall', x: s * 3.0, y: WALL_H / 2, z: 0,
               w: 3.4, h: WALL_H, d: 0.8, solid: true, shoot: true });
      }
      // The lintel over the gap, well clear of head height.
      emit({ kind: 'box', mat: 'wall', x: 0, y: 3.4, z: 0, w: 2.8, h: 0.8, d: 0.8,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'wallGlow', x: 0, y: 2.95, z: 0, w: 2.6, h: 0.1, d: 0.22 });
      // THE LIT LINE STEPS OVER THE DOOR: a nosing on each wall top at 3.0
      // and one on the lintel at 3.8, rather than one strip run across the
      // whole piece.
      //
      // It used to be a single 8.2m bar at 3.84 - the lintel's height - and
      // the walls either side of the door are only 3.0 tall, so two thirds of
      // its length hung in mid air with nothing beneath it. It survived the
      // trim check in test/terrain.mjs because that check asked whether
      // ANYTHING held the strip up, and the lintel in the middle did; the
      // check now walks the strip's whole length, which is what a floating
      // bar is: supported somewhere and not everywhere.
      for (const s of [-1, 1]) {
        emit({ kind: 'box', mat: 'wallGlow', x: s * 3.0, y: WALL_H + 0.04, z: 0,
               w: 3.2, h: 0.08, d: 0.2 });
      }
      emit({ kind: 'box', mat: 'wallGlow', x: 0, y: 3.84, z: 0,
             w: 2.6, h: 0.08, d: 0.2 });
    },
  },
  {
    key: 'bunker', cells: [2, 2], cost: 2.5, minWave: 1, tall: true,
    // Three walls and an opening. Worth standing in because only one side of
    // you is exposed, and worth leaving because everything else can see the
    // door. The walls are full height: a bunker you can be shot over is a rug.
    build(emit) {
      emit({ kind: 'box', mat: 'wall', x: 0, y: WALL_H / 2, z: -2.8, w: 6.4, h: WALL_H, d: 0.7,
             solid: true, shoot: true });
      for (const s of [-1, 1]) {
        emit({ kind: 'box', mat: 'wall', x: s * 2.85, y: WALL_H / 2, z: 0,
               w: 0.7, h: WALL_H, d: 6.3, solid: true, shoot: true });
      }
      emit({ kind: 'box', mat: 'wallGlow', x: 0, y: WALL_H + 0.04, z: -2.8,
             w: 6.2, h: 0.08, d: 0.2 });
    },
  },
  {
    key: 'pillar_gate', cells: [2, 1], cost: 1.5, minWave: 1, tall: true,
    // Two pillars carrying a lintel whose underside is at 2.85 - above
    // AGENT_HEIGHT, so ordinary enemies and their fire pass under it while a
    // boss, which collides at BOSS_HEIGHT, does not. That is the obstacles vs
    // ground split in arena.js still earning its keep.
    build(emit) {
      for (const s of [-1, 1]) {
        emit({ kind: 'box', mat: 'wall', x: s * 3.0, y: 1.55, z: 0, w: 0.9, h: 3.1, d: 1.6,
               solid: true, shoot: true });
      }
      emit({ kind: 'box', mat: 'deck', x: 0, y: 3.35, z: 0, w: 7, h: 0.5, d: 1.8,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'deckEdge', x: 0, y: 3.08, z: 0, w: 6.8, h: 0.06, d: 0.2 });
    },
  },
  {
    key: 'overpass', cells: [3, 1], cost: 3, minWave: 1, tall: false,
    // A walkway on legs with a stair at each end. Underneath is a passage at
    // floor level; on top is a bridge at 2.4. One piece, two routes through
    // the same square of floor, and neither of them is a detour.
    build(emit) {
      const top = 2.4;
      deckOnLegs(emit, 0, 0, 5.0, 2.6, top);
      flight(emit, -5.6, 0, top, 2.6, 1);
      flight(emit, 5.6, 0, top, 2.6, -1);
    },
  },
  {
    key: 'alcove', cells: [2, 2], cost: 2.5, minWave: 1, tall: true,
    // A wall with a raised platform tucked against its face. The wall makes
    // the corner enclosed; the platform makes it worth the walk. Together they
    // are the piece that produces the arena's most-used shape: a place you
    // stand that only has one approach.
    build(emit) {
      emit({ kind: 'box', mat: 'wall', x: 0, y: WALL_H / 2, z: -3.0, w: 7.4, h: WALL_H, d: 0.8,
             solid: true, shoot: true });
      emit({ kind: 'box', mat: 'wallGlow', x: 0, y: WALL_H + 0.04, z: -3.0,
             w: 7.2, h: 0.08, d: 0.2 });
      for (let i = 0; i < 2; i++) {
        const h = RISER * (i + 1);
        emit({ kind: 'box', mat: 'plat', x: 0, y: h / 2, z: -1.9 + i * 0.9,
               w: 5.4 - i * 1.2, h, d: 2.4 - i * 0.9, solid: true, shoot: true });
      }
      emit({ kind: 'box', mat: 'platEdge', x: 0, y: RISER * 2 + 0.02, z: -1.0,
             w: 4.24, h: 0.05, d: 1.54 });
    },
  },
];

// ---- how much of the floor a wave is allowed to fill ----------------------
//
// The budget is in piece cost, not in square metres, because cost is what the
// author of a piece knows and area is not: a chicane and a big platform cover
// about the same ground and do very different things to the fight.
//
// For scale: the old hand-built arena - four platforms, five crates, five
// towers - came to about 18. So a late wave is roughly as furnished as the
// game has always been, and wave 1 is about a third of that.
export function costBudget(wave) {
  // A BOSS WAVE IS DELIBERATELY LOOSER, not bare. Bosses steer by navBig,
  // which is baked for a 1.6m agent AND cannot climb, so every raised thing is
  // a wall to them and a room laid out for a normal wave is a room a boss
  // wedges in. It still gets real terrain - it is a fight in the same arena -
  // just enough of it that a body that size has lanes.
  if (isBossWave(wave)) return 28;
  // EVERY WAVE IS FURNISHED. The curve used to start at 6, which is four
  // pieces in a 44-metre room - a flat floor with a few things on it, which is
  // exactly what it looked like. It starts at 18 now, which is denser than the
  // old hand-built arena ever was, and climbs to 30.
  //
  // What changes with the wave is no longer WHETHER there is terrain but how
  // much: the whole library is available from wave 1, so the first wave is as
  // varied as the thirtieth and simply has a little more room to move in.
  //
  // THE PLAZA DID NOT CHANGE THIS CURVE, and it was worth finding out why
  // before reaching for it. Holding a disc of the room clear costs coverage,
  // and the obvious repair is more budget - but past about forty the layout is
  // GRID-bound, not cost-bound: a hundred cells hold something like twenty-
  // eight pieces and the shuffled walk already fills them, so raising the
  // budget to 48 moved floor coverage by a tenth of a point. The plaza is paid
  // for out of coverage, which is what it is meant to cost.
  return Math.min(52, 40 + (wave - 1) * 0.5);
}

// The most floor a layout may take away, as a fraction of the empty room.
// This is the maze guard and it is deliberately the LAST word: a layout inside
// its cost budget that still manages to block more than this is thrown away.
//
// IT COUNTS WALLS, NOT FURNITURE. A cell with a stair tread or a deck on it is
// floor at a different height, not floor that is gone - the player walks it
// and so does the flow field - so only surfaces above MAX_STAND count against
// this. That distinction is what lets the arena be twice as furnished as it
// was without being any harder to move around in.
const MAX_BLOCKED = 0.3;
// How much room a spawn point is given. Enough for a wave to form up and pick
// a direction before it meets anything.
const SPAWN_CLEAR = 3.4;
// The most primitives one layout may emit. Sized under the mesh pool at the
// bottom of this file, and the reason a cap exists at all is that every prim
// is a draw call: a room made of six hundred boxes would pass every gameplay
// check here and cost more to draw than the rest of the game put together.
const MAX_PRIMS = 300;
// And how much of the floor has to be one connected piece. A layout that walls
// off a corner nobody can reach is not a maze, but it is a smaller arena than
// the one the fight was tuned for.
const MIN_CONNECTED = 0.9;

// ---- the RNG --------------------------------------------------------------
// mulberry32. Seeded, so a layout is reproducible from (run seed, wave) and a
// bad one can be replayed from the test.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

// Rotates a primitive by k quarter-turns about the piece's own centre. Both
// the offset and the footprint turn; rotating one without the other is how a
// piece ends up inside out.
//
// THE QUARTER-TURN GOES INTO w/d AND NOWHERE ELSE. `yaw` carries only the
// primitive's OWN rotation - the random tilt a crate is emitted with - and is
// deliberately not advanced by k here, because for a box the two are the same
// operation: R(90) applied to a box of (w, d) is a box of (d, w), so doing
// both rotates the mesh twice while collision, which reads w/d and ignores
// yaw, rotates once. That is how a long_wall or an alcove ended up with a
// visible slab running one way and its AABB running the other - the player
// walked through the wall they could see and stopped against nothing.
//
// Keeping the turn in w/d is the side that has to win: the AABB in collect()
// is axis-aligned and has no way to represent a yawed box, whereas the mesh
// renders the swapped extents identically. A prim with its own yaw still
// composes correctly for the same reason - R(theta) on the swapped box equals
// R(theta + 90) on the original.
function rotatePrim(p, k) {
  let { x, z, w, d } = p;
  for (let i = 0; i < k; i++) {
    const nx = z, nz = -x;
    x = nx; z = nz;
    const nw = d; d = w; w = nw;
  }
  return { ...p, x, z, w, d, yaw: p.yaw || 0 };
}

// ---- placement ------------------------------------------------------------

/**
 * One placement attempt. Returns the primitive list, or null if too few pieces
 * fit to be worth validating.
 *
 * @param {number} wave
 * @param {function} rng
 * @param {{x:number,z:number,r:number}[]} reserved  circles nothing may touch:
 *   where the player is standing, and an unclaimed totem row still on the floor
 */
function attempt(wave, rng, reserved, spawnPoints, budgetScale = 1) {
  const budget = costBudget(wave) * budgetScale;
  const pool = PIECES.filter((p) => wave >= p.minWave);
  // PICKED BY FOOTPRINT, NOT UNIFORMLY. Half the library is one cell across
  // and half is two or three, so a uniform pick spends the budget on crates
  // and pillars and leaves the room technically furnished and visibly empty -
  // eleven per cent of the floor covered, most of it in dots. Weighting by the
  // area a piece actually occupies puts the decks, walls and towers in at the
  // rate their size deserves, and it is the single change that turned a
  // scattering of props into a built room.
  const weights = pool.map((p) => p.cells[0] * p.cells[1]);
  let weightTotal = 0;
  for (const w of weights) weightTotal += w;
  // Area-weighted pick from whatever subset is passed in. Weighting by
  // footprint is what stops the budget going on crates and pillars while the
  // decks, walls and towers - the pieces that actually build a room - turn up
  // once each.
  const pickFrom = (list) => {
    let tot = 0;
    for (const p of list) tot += p.cells[0] * p.cells[1];
    let r = rng() * tot;
    for (const p of list) {
      r -= p.cells[0] * p.cells[1];
      if (r <= 0) return p;
    }
    return list[list.length - 1];
  };
  // Occupancy over the placement grid, so two pieces never share a cell.
  const used = new Uint8Array(GRID_N * GRID_N);
  const prims = [];
  const placed = [];
  let spent = 0;
  let tallCount = 0;
  // This layout's open floor, and how much has been allowed to stand in it.
  const plaza = pickPlaza(rng);
  let plazaCount = 0;

  // Every (cell, piece, rotation) the generator will consider, in a random
  // order. Walking one shuffled list rather than picking a piece and then
  // hunting for a home is what keeps the layout from clumping into whichever
  // corner got tried first.
  const slots = [];
  for (let iz = 0; iz < GRID_N; iz++) {
    for (let ix = 0; ix < GRID_N; ix++) slots.push(iz * GRID_N + ix);
  }
  shuffle(slots, rng);

  for (const slot of slots) {
    if (spent >= budget) break;
    const ix = slot % GRID_N;
    const iz = (slot / GRID_N) | 0;
    if (used[slot]) continue;

    // THE CELL IS MEASURED FIRST, then a piece is chosen to fit it. A single
    // blind pick per slot is what held the arena at thirteen pieces however
    // large the budget was: most picks fail - the piece is three cells wide
    // and there are two left, or it lands on a spawn - and a cell that failed
    // once was never revisited, so two thirds of the grid stayed empty.
    //
    // Measuring the free run to the right and below turns that around: the
    // candidate list is only ever pieces that CAN go here, so a corner with
    // one cell of room reliably gets a planter instead of six failed attempts
    // at a watchtower.
    let runW = 0;
    while (ix + runW < GRID_N && !used[iz * GRID_N + ix + runW]) runW++;
    let runD = 0;
    while (iz + runD < GRID_N && !used[(iz + runD) * GRID_N + ix]) runD++;
    // IS THIS SLOT IN THE PLAZA. Filtering the candidate list here rather
    // than only rejecting after the rotation is what makes the plaza get its
    // towers: each slot gets five attempts, and if a plaza cell is offered
    // the whole library then all five land on pieces the plaza check throws
    // away and the cell comes out bare. The list has the final say either
    // way - see the footprint test below.
    const slotInPlaza = touchesPlaza(plaza, cellCentre(ix), cellCentre(iz),
                                     GRID_CELL / 2, GRID_CELL / 2);
    if (slotInPlaza && plazaCount >= PLAZA_MAX) continue;
    // Can this piece stand at this slot in EITHER orientation without
    // reaching into the plaza? Cheap enough to run over the pool per slot,
    // and it is what keeps the rejection below from wasting the slot.
    const clearsPlaza = (p) => {
      if (PLAZA_PIECES.has(p.key)) return true;
      const e = pieceExtent(p);
      for (let t = 0; t < 2; t++) {
        const w = t ? p.cells[1] : p.cells[0];
        const d = t ? p.cells[0] : p.cells[1];
        if (ix + w > GRID_N || iz + d > GRID_N) continue;
        const px = cellCentre(ix) + ((w - 1) * GRID_CELL) / 2;
        const pz = cellCentre(iz) + ((d - 1) * GRID_CELL) / 2;
        if (!touchesPlaza(plaza, px, pz, t ? e.hz : e.hx, t ? e.hx : e.hz)) return true;
      }
      return false;
    };
    let fits = pool.filter((p) => {
      const a = Math.min(p.cells[0], p.cells[1]);
      const b = Math.max(p.cells[0], p.cells[1]);
      // Either orientation may work; the rotation below picks one and the
      // overlap test still has the final say.
      return (a <= runW && b <= runD) || (b <= runW && a <= runD);
    });
    if (slotInPlaza) {
      fits = fits.filter((p) => PLAZA_PIECES.has(p.key));
    } else {
      // AND THE CELLS AROUND THE PLAZA ARE FILTERED TOO, for the same reason
      // and it matters more. A three-cell piece anchored beside the disc
      // measures a free run of three - the run is over `used`, which knows
      // nothing about the plaza - gets picked, and is then thrown out by the
      // footprint test below. Five attempts of that and a cell that had room
      // for a deck comes out bare, so the open area bled outward into the
      // whole quadrant: floor covered fell from 18.8% to 15.0% and the room
      // outside the plaza was no denser than before, which is the opposite of
      // the trade this is supposed to make.
      //
      // Offering the slot only pieces that have SOME orientation clear of the
      // disc means the rim of the plaza is a hard edge - dense right up to
      // it - instead of a gradient of failed placements.
      fits = fits.filter(clearsPlaza);
    }
    if (!fits.length) continue;

    let piece = null;
    let k = 0;
    let cw = 0;
    let cd = 0;
    let cx = 0;
    let cz = 0;
    for (let attemptN = 0; attemptN < 5; attemptN++) {
      const cand = pickFrom(fits);
      if (spent + cand.cost > budget) continue;
      // AT MOST HALF THE PIECES BREAK A SIGHTLINE. Cost alone does not stop a
      // layout being nothing but walls - which is inside budget, and is
      // exactly the room the player asked not to have.
      if (cand.tall && tallCount * 2 >= placed.length + 1 && placed.length >= 2) continue;

      // BOTH FOOTPRINTS ARE TRIED, in a random order. A quarter-turn swaps
      // w and d, so a piece that does not fit the free run one way round
      // often fits the other, and burning the attempt on the first draw threw
      // away half the placements that were available - most visibly next to
      // the plaza, where one orientation reaches into the disc and the other
      // runs alongside it.
      const rot0 = (rng() * 4) | 0;
      for (let flip = 0; flip < 2; flip++) {
      const rot = rot0 ^ flip;
      // A quarter-turn swaps the footprint.
      const w = (rot % 2) ? cand.cells[1] : cand.cells[0];
      const d = (rot % 2) ? cand.cells[0] : cand.cells[1];
      if (ix + w > GRID_N || iz + d > GRID_N) continue;

      let free = true;
      for (let dz = 0; dz < d && free; dz++) {
        for (let dx = 0; dx < w; dx++) {
          if (used[(iz + dz) * GRID_N + ix + dx]) { free = false; break; }
        }
      }
      if (!free) continue;

      // Centre of the block of cells this piece would fill.
      const px = cellCentre(ix) + ((w - 1) * GRID_CELL) / 2;
      const pz = cellCentre(iz) + ((d - 1) * GRID_CELL) / 2;

      // Nothing may rise on top of the player, or on top of a totem row that
      // is still standing from a pick they declined.
      let clear = true;
      for (const r of reserved) {
        const rr = r.r + Math.max(w, d) * GRID_CELL * 0.5;
        if ((px - r.x) ** 2 + (pz - r.z) ** 2 < rr * rr) { clear = false; break; }
      }
      // AND NOTHING MAY BURY A SPAWN POINT. The grid reaches the spawn ring
      // now that it covers the whole floor, so this is a real constraint
      // rather than a formality: a wave that arrives inside a bunker is a wave
      // that spends its first seconds walking out of one.
      if (clear) {
        for (const sp of spawnPoints) {
          const rr = SPAWN_CLEAR + Math.max(w, d) * GRID_CELL * 0.5;
          if ((px - sp.x) ** 2 + (pz - sp.z) ** 2 < rr * rr) { clear = false; break; }
        }
      }
      if (!clear) continue;

      // AND THE PLAZA IS CHECKED AGAINST THE FOOTPRINT THE PIECE ACTUALLY
      // TAKES, not against the slot it was anchored from. A three-cell
      // watchtower can start well outside the disc and still reach into it,
      // and a plaza with the end of a watchtower in it is not an open plaza.
      const ce = pieceExtent(cand);
      const chx = (rot % 2) ? ce.hz : ce.hx;
      const chz = (rot % 2) ? ce.hx : ce.hz;
      if (touchesPlaza(plaza, px, pz, chx, chz) &&
          (!PLAZA_PIECES.has(cand.key) || plazaCount >= PLAZA_MAX)) continue;

      piece = cand; k = rot; cw = w; cd = d; cx = px; cz = pz;
      break;
      }
      if (piece) break;
    }
    if (!piece) continue;

    const local = [];
    piece.build((p) => local.push(p), rng);
    for (const p of local) {
      const r = rotatePrim(p, k);
      prims.push({
        kind: r.kind, mat: r.mat,
        x: cx + r.x, y: r.y, z: cz + r.z,
        w: r.w, h: r.h, d: r.d,
        solid: !!r.solid, shoot: !!r.shoot, pad: r.pad || 0, yaw: r.yaw || 0,
        order: placed.length,
        // WHICH PIECE THIS CAME FROM. Nothing at runtime reads it - the pool
        // and the validator only ever want the geometry - but it is what lets
        // test/terrain.mjs assert that the only things standing in the plaza
        // are the things the plaza allows, rather than inferring it from a
        // box's size and getting it wrong for a crate.
        key: piece.key,
      });
    }

    for (let dz = 0; dz < cd; dz++) {
      for (let dx = 0; dx < cw; dx++) used[(iz + dz) * GRID_N + ix + dx] = 1;
    }
    placed.push(piece.key);
    spent += piece.cost;
    if (piece.tall) tallCount++;
    const pe = pieceExtent(piece);
    if (touchesPlaza(plaza, cx, cz, (k % 2) ? pe.hz : pe.hx, (k % 2) ? pe.hx : pe.hz)) {
      plazaCount++;
    }
  }

  if (placed.length < 3) return null;
  // The pool is a fixed size and silently drops anything past it, so the
  // generator refuses to hand over a layout it knows would not fit. Reaching
  // this means the budget or the library grew without the pool - test/
  // terrain.mjs asserts against it from the other side.
  if (prims.length > MAX_PRIMS) return null;
  return { prims, pieces: placed, cost: spent, plaza };
}

// ---- validation -----------------------------------------------------------
//
// The same occupancy bake nav.js does, run here on a throwaway grid so a
// layout can be rejected before anything is built out of it. Kept in this file
// rather than imported from NavGrid because NavGrid is a live object with
// typed arrays sized for the game, and the validator wants to run five hundred
// times in a test process with no arena in sight.

const VCELL = 0.5;
// Mirrored from nav.js, and they have to stay mirrored: this validator's whole
// job is to answer "will the real grid be able to route across this?", and it
// can only answer that by modelling the same rules.
const V_MAX_STAND = 2.6;
const V_STEP = STEP_HEIGHT;
const V_DROP = 1.9;

// The same height bake nav.js does, on a throwaway grid. Kept here rather than
// imported from NavGrid because NavGrid is a live object holding typed arrays
// sized for the running game, and this wants to run five hundred times in a
// node process with no arena in sight.
function bake(aabbs, bound, radius, height, canClimb = true) {
  const dim = Math.floor((bound * 2) / VCELL) + 1;
  const origin = -bound;
  const blocked = new Uint8Array(dim * dim);
  const surf = new Float32Array(dim * dim);
  const grow = radius * 0.9;
  const edge = bound - 0.6;
  const maxStand = canClimb ? V_MAX_STAND : 0.02;
  const list = aabbs.filter((o) => o.min.y <= height);
  for (let iz = 0; iz < dim; iz++) {
    for (let ix = 0; ix < dim; ix++) {
      const x = origin + ix * VCELL;
      const z = origin + iz * VCELL;
      const i = iz * dim + ix;
      if (Math.abs(x) > edge || Math.abs(z) > edge) { blocked[i] = 1; continue; }
      let top = 0;
      for (const o of list) {
        if (o.max.y <= top) continue;
        if (x > o.min.x - grow && x < o.max.x + grow &&
            z > o.min.z - grow && z < o.max.z + grow) { top = o.max.y; }
      }
      blocked[i] = top > maxStand ? 1 : 0;
      surf[i] = top;
    }
  }
  return { blocked, surf, dim, origin, step: canClimb ? V_STEP : 0.02 };
}

function floodFrom(g, x, z) {
  const { blocked, surf, dim, origin, step } = g;
  const seen = new Uint8Array(dim * dim);
  const queue = new Int32Array(dim * dim);
  let head = 0, tail = 0;
  const ix = Math.min(dim - 1, Math.max(0, Math.round((x - origin) / VCELL)));
  const iz = Math.min(dim - 1, Math.max(0, Math.round((z - origin) / VCELL)));
  let start = iz * dim + ix;
  // THE SEED CELL MAY BE SOLID, and that is not a reason to call the layout
  // broken. A piece standing on the exact point this floods from - or, for the
  // boss grid, any raised thing at all, since a boss cannot climb - would
  // otherwise report the whole floor unreachable and throw away a perfectly
  // good arena. NavGrid does the same thing for the same reason when the
  // player is standing on a platform: spiral out to the nearest open cell and
  // start there.
  if (blocked[start]) {
    let found = -1;
    for (let r = 1; r <= 20 && found < 0; r++) {
      for (let dz = -r; dz <= r && found < 0; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const nx = ix + dx;
          const nz = iz + dz;
          if (nx < 0 || nz < 0 || nx >= dim || nz >= dim) continue;
          const i = nz * dim + nx;
          if (blocked[i]) continue;
          found = i;
          break;
        }
      }
    }
    if (found < 0) return { seen, count: 0 };
    start = found;
  }
  seen[start] = 1;
  queue[tail++] = start;
  let count = 1;
  while (head < tail) {
    const c = queue[head++];
    const cx = c % dim, cz = (c / dim) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const nz = cz + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || nz < 0 || nx >= dim || nz >= dim) continue;
      const i = nz * dim + nx;
      if (blocked[i] || seen[i]) continue;
      // The step rule, exactly as nav.js applies it: a tread is walkable, a
      // wall is not, and the difference is a number rather than a guess.
      const dh = surf[i] - surf[c];
      if (dh > step || dh < -V_DROP) continue;
      seen[i] = 1;
      queue[tail++] = i;
      count++;
    }
  }
  return { seen, count };
}

function reachable(g, flood, x, z) {
  const { dim, origin } = g;
  const ix = Math.min(dim - 1, Math.max(0, Math.round((x - origin) / VCELL)));
  const iz = Math.min(dim - 1, Math.max(0, Math.round((z - origin) / VCELL)));
  return flood.seen[iz * dim + ix] === 1;
}

/**
 * Is this layout playable? Every test here is a way a layout can be no fun,
 * expressed as a number.
 *
 * @returns {{ok:boolean, why?:string, blocked?:number}}
 */
export function validate(prims, bound, spawnPoints, wave) {
  const aabbs = primsToAabbs(prims);
  const g = bake(aabbs, bound, 0.5, AGENT_HEIGHT);

  let open = 0;
  // How much of the floor has ANYTHING on it - a tread, a deck, a wall. Not a
  // safety test: it is the score generateLayout ranks candidates by, and it is
  // computed here because the bake that answers it has already been done.
  let covered = 0;
  for (let i = 0; i < g.blocked.length; i++) {
    if (!g.blocked[i]) open++;
    if (g.surf[i] > 0.02 || g.blocked[i]) covered++;
  }
  // The open-cell count an EMPTY room would have, as the baseline for "how
  // much of the floor did this layout take away".
  const emptyOpen = ((bound - 0.6) * 2 / VCELL) ** 2;
  const blockedFrac = 1 - open / emptyOpen;
  if (blockedFrac > MAX_BLOCKED) return { ok: false, why: 'too dense', blocked: blockedFrac, covered };

  // Flood from the middle of the room, which is where the fight happens and
  // where the player stands at the start of a wave.
  const flood = floodFrom(g, 0, 0);
  if (flood.count === 0) return { ok: false, why: 'centre blocked' };
  if (flood.count / open < MIN_CONNECTED) {
    return { ok: false, why: 'floor split', blocked: blockedFrac, covered };
  }
  // Every spawn point has to be able to walk to the middle, or a wave arrives
  // in a pocket and stands there.
  for (const s of spawnPoints) {
    if (!reachable(g, flood, s.x, s.z)) return { ok: false, why: 'spawn cut off' };
  }

  // Bosses are 1.6m wide and much taller, so they get their own bake: gaps an
  // ordinary enemy walks through are gaps a boss grinds against, and a boss
  // that cannot reach the player is a wave that cannot end.
  if (isBossWave(wave)) {
    // A boss is wide AND cannot climb, so it gets the no-step bake: every
    // raised surface in the room is a wall to it. If a layout does not leave
    // that body a route from each spawn to the middle, the wave cannot end.
    const gb = bake(aabbs, bound, 1.6, 5, false);
    const fb = floodFrom(gb, 0, 0);
    if (fb.count === 0) return { ok: false, why: 'boss centre blocked' };
    for (const s of spawnPoints) {
      if (!reachable(gb, fb, s.x, s.z)) return { ok: false, why: 'boss spawn cut off' };
    }
  }

  return { ok: true, blocked: blockedFrac, covered };
}

// The AABB a primitive collides as. `pad` widens the footprint for meshes an
// axis-aligned box cannot follow - a cylinder, or a crate with a random yaw.
export function primsToAabbs(prims) {
  const out = [];
  for (const p of prims) {
    if (!p.solid) continue;
    out.push(makeAabb(p.x, p.y, p.z, p.w + p.pad, p.h, p.d + p.pad));
  }
  return out;
}

// A hand-built layout, used when every generated attempt fails validation.
//
// IT IS A REAL ARENA, not a placeholder. The previous one was four platforms
// and four crates on an otherwise bare floor, which meant the rare wave that
// hit it was visibly, jarringly emptier than every wave around it - the exact
// thing the whole library exists to avoid, showing up at random. This is laid
// out by hand to the same density and with the same vocabulary as a generated
// one: eight raised decks with stairs onto them, four full-height walls, a
// ring of towers, and cover between them.
//
// It is symmetrical, which no generated layout is. That is deliberate: if a
// player ever sees this twice they should be able to tell it apart from the
// procedural ones rather than wonder why two waves felt the same.
function fallback() {
  const prims = [];
  let order = 0;
  const push = (mat, x, y, z, w, h, d, solid, shoot, pad = 0) =>
    prims.push({ kind: 'box', mat, x, y, z, w, h, d, solid, shoot, pad, yaw: 0, order,
                 key: 'fallback' });

  // Four corner decks at 1.8, each on legs with a flight up the inner side.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = sx * 12;
    const cz = sz * 12;
    push('deck', cx, 1.625, cz, 5, 0.35, 5, true, true);
    push('deckEdge', cx, 1.82, cz, 5.04, 0.05, 5.04, false, false);
    for (const lx of [-1, 1]) {
      for (const lz of [-1, 1]) {
        push('tower', cx + lx * 2.05, 0.725, cz + lz * 2.05, 0.5, 1.45, 0.5, true, true);
      }
    }
    // The flight up, laid from the deck's inner edge OUTWARD: the tread
    // nearest the deck is the tallest, so the climb is floor -> 0.6 -> 1.2 ->
    // deck at 1.8, three 0.6 risers with nothing over the step.
    for (let i = 0; i < 2; i++) {
      const h = 1.2 - i * 0.6;
      push('plat', cx - sx * (3.125 + i * 1.25), h / 2, cz, 1.25, h, 3.0, true, true);
    }
    order++;
  }
  // Two walls flanking the middle, and NOT ONE IN FRONT OF A SPAWN. That is
  // the one measurement in the fallback that is not free: a boss is 1.6m wide
  // and cannot climb, so it needs a clear run from every spawn point to the
  // centre. Walls on the side lines - which is where they were first put -
  // stand directly between the four edge spawns and the room, and the lane
  // left between a wall's end and the nearest corner deck was under a metre.
  // On the centre line they block sightlines across the middle instead, which
  // is what they were for, and every spawn keeps an open approach. The terrain
  // test checks exactly this, against this layout, at a boss wave.
  for (const [x, z, w, d] of [[-7, 0, 0.8, 6], [7, 0, 0.8, 6]]) {
    push('wall', x, 1.5, z, w, 3.0, d, true, true);
    push('wallGlow', x, 3.04, z, w - 0.2, 0.08, d - 0.2, false, false);
    order++;
  }
  // A ring of towers, set wide enough that a boss walks between any two of
  // them: they sit on a circle of radius 9, which leaves nine metres between
  // adjacent centres and a clear four-metre gap once each is grown by the
  // boss's own width.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    prims.push({ kind: 'cyl', mat: 'tower', x: Math.cos(a) * 9, y: 1.5,
                 z: Math.sin(a) * 9, w: 1, h: 3.0, d: 1,
                 solid: true, shoot: true, pad: 0.2, yaw: 0, order, key: 'tower' });
    push('trim', Math.cos(a) * 9, 3.12, Math.sin(a) * 9, 0.5, 0.14, 0.5, false, false);
    order++;
  }
  // THE MIDDLE STAYS OPEN. A tiered block stood here for a while and it is
  // where the fallback went wrong twice over: it is the cell the validator
  // floods from, and to a boss - which cannot climb - it is a solid pillar
  // sitting on the one square metre every route has to pass through.
  order++;
  // Speaker cabinets filling the gaps between the towers.
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) / 6) * Math.PI * 2;
    push('speaker', Math.cos(a) * 11, 0.475, Math.sin(a) * 11,
         0.95, 0.95, 0.95, true, true, 0.2);
    order++;
  }
  // The middle of the fallback has always been open - see the note above the
  // tower ring - so it declares a plaza too rather than being the one layout
  // in the game with no open floor to its name. The radius is measured, not
  // chosen: the nearest solid thing to the centre is a centre-line wall at
  // x = +-7 whose face is at 6.6.
  return {
    prims, pieces: ['fallback'], cost: 0, covered: 0, fallback: true,
    plaza: { x: 0, z: 0, r: 6.6 },
  };
}

/**
 * Generate a validated layout for one wave.
 *
 * @param {number} wave
 * @param {object} opts
 * @param {number} opts.seed
 * @param {number} opts.bound        arena half-width
 * @param {{x:number,z:number}[]} opts.spawnPoints
 * @param {{x:number,z:number,r:number}[]} [opts.reserved]
 * @param {number} [opts.tries]
 */
export function generateLayout(wave, opts) {
  const rng = makeRng((opts.seed | 0) ^ (wave * 0x9e3779b1));
  const reserved = opts.reserved || [];
  const tries = opts.tries || 24;
  // THE BEST VALID ATTEMPT, NOT THE FIRST, and the difference is not a
  // refinement - taking the first inverted the whole density curve.
  //
  // A denser attempt is likelier to fail validation, so at a high budget the
  // first attempt that PASSED was reliably one that had happened to place
  // unusually little. Wave 35 came out emptier than wave 1, which is the exact
  // opposite of what the budget says and precisely the "flat floor with a few
  // things on it" this was meant to fix. Keeping the fullest of several
  // candidates removes the selection: a sparse layout only wins when nothing
  // denser passed.
  //
  // It stops as soon as it has KEEP good ones rather than running the whole
  // budget of tries, so the common case costs a handful of floods.
  const KEEP = 6;
  let best = null;
  let found = 0;
  for (let i = 0; i < tries; i++) {
    // THE BUDGET GIVES WAY BEFORE THE LAYOUT DOES. A wave whose full budget
    // cannot produce anything playable used to drop straight to the fallback -
    // eight props on a bare floor, in the middle of a run, with no way to tell
    // it apart from a bug. It bit boss waves hardest, because a boss is 1.6m
    // wide AND cannot climb, so every raised thing in the room is a wall to it
    // and a dense layout genuinely can cut one off.
    //
    // Backing the budget off over the last third of the tries produces a
    // thinner arena instead of no arena, which is a far better answer to "this
    // one is hard to lay out" than giving up on the whole idea.
    const scale = i < tries * 0.6 ? 1 : (i < tries * 0.85 ? 0.72 : 0.5);
    const a = attempt(wave, rng, reserved, opts.spawnPoints, scale);
    if (!a) continue;
    const v = validate(a.prims, opts.bound, opts.spawnPoints, wave);
    if (!v.ok) continue;
    a.blocked = v.blocked;
    a.covered = v.covered;
    // Ranked by FLOOR COVERED, not by piece or primitive count. A crate
    // cluster emits six primitives and occupies three square metres; a
    // watchtower emits twelve and occupies fifty. Counting either of those
    // would pick the layout with the most clutter rather than the one that
    // builds the most room.
    if (!best || a.covered > best.covered) best = a;
    if (++found >= KEEP) break;
  }
  return best || fallback();
}

// ===========================================================================
// TerrainSet - the pool, and the build/sink animation.
// ===========================================================================

// How far below its final position a piece waits. Deep enough that the tallest
// thing in the library is entirely under the floor, which is opaque, so a
// waiting piece is invisible rather than a box poking through the dancefloor.
const SUNK_DROP = 5;
// One piece's own rise, once its turn comes. Short and hard: this is a thing
// slamming into place, not a lift arriving.
const RISE_TIME = 0.26;
// And the sink, which is uniform and a little slower - the room emptying out
// rather than being struck.
const SINK_TIME = 0.8;
// How long the whole build is given. The wave-start countdown is held to at
// least this, so terrain is always fully settled before an enemy spawns.
export const BUILD_TIME = 2.4;
// How many musical steps the build is spread over. FIXED, not one per piece:
// a wave 1 layout of four pieces and a wave 30 layout of twelve both have to
// finish inside BUILD_TIME, so what varies with the size of the layout is how
// many pieces land on each step, not how long the build runs. Getting this
// backwards - one piece per step - made a big layout take three seconds and
// the wave start on a half-built arena.
const BUILD_STEPS = 8;
// If the music is not playing there are no pulses to release pieces on, so
// they fall back to a fixed cadence: eight of these plus one piece's own rise
// comes to just under BUILD_TIME. Music.pulse free-runs at ~144 BPM (see the
// fallback in music.js), whose half-beat is 0.208 - the same figure, which is
// the point: the build takes the same time whether or not a track is playing.
const FALLBACK_STEP = 0.21;

// The pool. Sized off the worst layout the budget can produce - eighteen cost
// of the emit-heaviest pieces - with headroom, and asserted against in
// test/terrain.mjs so the generator can never quietly outgrow it.
const BOX_SLOTS = 320;
const CYL_SLOTS = 64;

// easeOutBack: overshoots its target and settles. A piece that stops dead at
// its final height reads as being placed; one that punches past and comes back
// reads as landing, which is what a room assembling itself on a downbeat has
// to do.
function easeOutBack(p) {
  const c1 = 1.2;
  const c3 = c1 + 1;
  const q = p - 1;
  return 1 + c3 * q * q * q + c1 * q * q;
}

export class TerrainSet {
  /**
   * @param {object} arena  the return of buildArena()
   * @param {object} [effects]  for the dust burst as a piece lands
   * @param {object} [sfx]
   */
  constructor(arena, effects = null, sfx = null) {
    this.arena = arena;
    this.effects = effects;
    this.sfx = sfx;

    // WHERE THE STATIC ROOM ENDS. Everything the arena built - floor, walls,
    // ceiling - sits at the front of these three lists and never moves.
    // Terrain is appended after it and truncated back to here on a sink, which
    // is why the arrays can be mutated in place: every consumer in main.js
    // holds the same reference and none of them ever sees it swapped.
    this._baseObstacles = arena.obstacles.length;
    this._baseGround = arena.ground.length;
    this._baseMeshes = arena.meshList.length;

    const m = arena.mats;
    // The material table the piece library's `mat` keys index into. Every one
    // of these already exists and is already compiled: no new material, no new
    // shader program, and the emissive ones are the SAME instances rig.js
    // pulses, so generated terrain lights with the room.
    this.mats = {
      plat: m.plat, wall: m.wall, speaker: m.speaker, cone: m.cone,
      tower: m.tower, deck: m.deck,
      platEdge: m.platEdge, deckEdge: m.deckEdge, trim: m.trim,
      wallGlow: m.wallGlow,
    };

    const BOX = arena.shared.BOX;
    const CYL = arena.shared.CYL;
    this._boxes = [];
    this._cyls = [];
    for (let i = 0; i < BOX_SLOTS; i++) this._boxes.push(this._slot(BOX, m.plat));
    for (let i = 0; i < CYL_SLOTS; i++) this._cyls.push(this._slot(CYL, m.tower));

    // Live slots for the current layout, in rise order.
    this._live = [];
    this._colliders = [];
    this.state = 'hidden';
    this.layout = null;
    this._released = 0;
    this._groups = 0;
    this._lastPulse = -1;
    this._stepT = 0;
    this._sinkT = 0;
    // Scratch for the dust burst, so the build allocates nothing per frame.
    this._at = new THREE.Vector3();
  }

  _slot(geo, mat) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.arena.group.add(mesh);
    return { mesh, y: 0, t: 0, live: false, order: 0, released: false, x: 0, z: 0 };
  }

  /** The subset of terrain a rig laser should stop on - see lasers.js. */
  get colliders() {
    return this._colliders;
  }

  /**
   * Assign a generated layout to pool slots and start the rise.
   * Collision is NOT published here: see settle().
   */
  build(layout) {
    this.layout = layout;
    this._live.length = 0;
    let bi = 0, ci = 0;
    for (const p of layout.prims) {
      const pool = p.kind === 'cyl' ? this._cyls : this._boxes;
      const idx = p.kind === 'cyl' ? ci++ : bi++;
      // Silently dropping a primitive is better than throwing mid-wave, and
      // test/terrain.mjs asserts this never happens for any layout the
      // generator can produce.
      if (idx >= pool.length) continue;
      const s = pool[idx];
      const mat = this.mats[p.mat] || this.mats.plat;
      s.mesh.material = mat;
      s.mesh.scale.set(p.w, p.h, p.d);
      s.mesh.rotation.y = p.yaw || 0;
      s.mesh.position.set(p.x, p.y - SUNK_DROP, p.z);
      s.mesh.visible = true;
      // Only solid pieces cast: an emissive lip casting a shadow of itself on
      // the deck it is lying on is a stripe of dirt, not a light.
      s.mesh.castShadow = !!p.solid;
      s.mesh.receiveShadow = !!p.solid;
      s.y = p.y;
      s.x = p.x;
      s.z = p.z;
      s.t = 0;
      s.live = true;
      s.released = false;
      s.order = p.order;
      s.prim = p;
      this._live.push(s);
    }
    for (let i = bi; i < this._boxes.length; i++) this._boxes[i].mesh.visible = false;
    for (let i = ci; i < this._cyls.length; i++) this._cyls[i].mesh.visible = false;

    this._groups = 0;
    for (const s of this._live) this._groups = Math.max(this._groups, s.order + 1);
    // Pieces per step, so any layout lands in the same eight steps.
    this._perStep = Math.max(1, Math.ceil(this._groups / BUILD_STEPS));
    this._released = 0;
    this._lastPulse = -1;
    this._stepT = 0;
    this._riseT = 0;
    this.state = 'rising';
  }

  /** Drop everything back under the floor. Collision is cleared by the caller. */
  beginSink() {
    if (this.state === 'hidden') return;
    this.state = 'sinking';
    this._sinkT = 0;
    this._colliders = [];
  }

  /** Instantly hide everything - run reset, death, a versus swap. */
  reset() {
    for (const s of this._live) { s.mesh.visible = false; s.live = false; }
    this._live.length = 0;
    this._colliders = [];
    this.layout = null;
    this.state = 'hidden';
  }

  /**
   * @param {number} dt
   * @param {number} pulse  music.pulse, read as an EDGE - see music.js
   * @returns {string} 'settled' on the one frame the rise completes, else ''
   */
  update(dt, pulse) {
    if (this.state === 'rising') return this._rise(dt, pulse);
    if (this.state === 'sinking') return this._sink(dt);
    return '';
  }

  _rise(dt, pulse) {
    // A GROUP PER HALF-BEAT. The pieces do not rise together and they do not
    // rise on a timer of their own: each one waits for the next pulse, so the
    // room assembles in time with the track that is already playing over it.
    let step = false;
    if (pulse !== undefined && pulse !== this._lastPulse) {
      if (this._lastPulse >= 0) step = true;
      this._lastPulse = pulse;
    }
    this._stepT += dt;
    this._riseT += dt;
    // Never wait longer than the fallback cadence: a stalled or muted track
    // must not be able to hold the build open past BUILD_TIME.
    if (this._stepT >= FALLBACK_STEP) step = true;
    if (step && this._released < this._groups) {
      this._released = Math.min(this._groups, this._released + this._perStep);
      this._stepT = 0;
    }
    // THE BACKSTOP. Whatever the music does - a tab that was hidden and comes
    // back, a track that stalls, a frame that ate half a second - the build
    // must not outlast the countdown that is holding the wave for it. Past
    // BUILD_TIME everything still waiting goes up at once.
    if (this._riseT >= BUILD_TIME - RISE_TIME) this._released = this._groups;

    let allDone = this._released >= this._groups;
    // THE DUST AND THE THUD ARE PER PIECE, NOT PER BOX. A piece emits up to
    // eight primitives; firing a burst and a sample for each turns one thing
    // landing into a handful of overlapping ones, which is both the wrong
    // sound and eight times the particles it needs.
    let announced = -1;
    for (const s of this._live) {
      if (!s.released) {
        if (s.order >= this._released) { allDone = false; continue; }
        s.released = true;
        s.t = 0;
        if (s.order !== announced) {
          announced = s.order;
          if (this.effects) {
            this.effects.burst(this._at.set(s.x, 0.12, s.z), 0x8fa2c4, 7, 3.2, 1.4, 0.4);
          }
          if (this.sfx) this.sfx.terrainRise();
        }
      }
      if (s.t < 1) {
        s.t = Math.min(1, s.t + dt / RISE_TIME);
        const e = easeOutBack(s.t);
        s.mesh.position.y = s.y - SUNK_DROP + SUNK_DROP * e;
        if (s.t >= 1) s.mesh.position.y = s.y;
        else allDone = false;
      }
    }

    if (allDone) {
      this.state = 'up';
      return 'settled';
    }
    return '';
  }

  _sink(dt) {
    this._sinkT += dt;
    const p = Math.min(1, this._sinkT / SINK_TIME);
    // Cubic in, so it hangs for a moment and then goes - the reverse read of
    // the punch on the way up.
    const e = p * p * p;
    for (const s of this._live) s.mesh.position.y = s.y - SUNK_DROP * e;
    if (p >= 1) {
      this.reset();
      return 'sunk';
    }
    return '';
  }

  /**
   * Publish the settled layout into the arena's collision and raycast lists.
   * The arrays are MUTATED IN PLACE - main.js hands the same references to the
   * enemy context, the projectile context, aim assist and the player, and none
   * of them would ever see a replacement.
   */
  collect() {
    const { obstacles, ground, meshList } = this.arena;
    obstacles.length = this._baseObstacles;
    ground.length = this._baseGround;
    meshList.length = this._baseMeshes;
    this._colliders = [];
    for (const s of this._live) {
      const p = s.prim;
      if (p.shoot) meshList.push(s.mesh);
      if (!p.solid) continue;
      const b = makeAabb(p.x, p.y, p.z, p.w + p.pad, p.h, p.d + p.pad);
      obstacles.push(b);
      // The same split arena.js has always made: a thing whose underside is
      // above head height is something ground fire passes UNDER, so it stays
      // out of the list projectiles collide against.
      if (b.min.y <= AGENT_HEIGHT) ground.push(b);
      // WHAT A LASER STOPS ON, and it is deliberately not everything. A beam
      // that clips on every knee-high crate turns the fan into static; only
      // things big enough to read as a surface get to cut one.
      if (p.h >= 1.5 && (p.w >= 2 || p.d >= 2)) this._colliders.push(b);
    }
  }

  /** Truncate the arena lists back to the static room. */
  clearCollision() {
    this.arena.obstacles.length = this._baseObstacles;
    this.arena.ground.length = this._baseGround;
    this.arena.meshList.length = this._baseMeshes;
    this._colliders = [];
  }
}
