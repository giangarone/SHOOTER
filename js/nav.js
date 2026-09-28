// Enemy navigation. Turns "walk at the player" into "walk to the player",
// which is the difference between an enemy that grinds against a pillar and
// one that comes round it.
//
// HOW IT WORKS
//   Each arena layout is baked into a coarse occupancy grid: a cell is
//   blocked if its centre falls inside any obstacle AABB grown by the enemy
//   radius, so an open cell is somewhere an enemy can stand. Short, clear
//   jumps between cells are baked beside the walking links. Every few frames
//   a reverse Dijkstra search from the player prices both kinds of travel,
//   and each enemy follows the cheapest route.
//
//   One field serves every enemy in a clearance size. The widest bosses use a
//   second field behind navBig, because a jump cleared for a 1.6m radius can
//   still clip a 2m body. This is cheaper than an A* for each of thirty
//   enemies chasing the same player.
//
// TWO SMOOTHING PASSES keep it from looking like grid movement:
//   1. If the straight line to the player is clear, the field is ignored
//      entirely. A small per-enemy side angle can spread the approach when
//      the next steps are clear; it fades near the player.
//   2. Otherwise the enemy follows the downhill chain a few cells ahead and
//      aims at the FARTHEST cell it still has a clear line to. That is string
//      pulling: it cuts the staircase off a grid path and rounds corners.
//
// BOTH OF THOSE HANG ON WHAT "CLEAR" MEANS, and it is not "no wall in the
// way". A line is clear when the agent could WALK it, which depends on how
// high the agent is standing: a 0.95m speaker cabinet is a wall to something
// on the floor and a kerb to something already on the deck beside it. Getting
// that wrong is not a rough route, it is no route at all - pass 1 declares the
// way clear, the field is never consulted, and the enemy spends the wave
// pushing into the side of a crate it knows perfectly well how to walk round.
// See _sight, and the height every caller has to hand in.
//
// THE GRID HAS A HEIGHT, NOT JUST A FLAG, and that is what makes a generated
// arena navigable rather than a set of walls with gaps in it. Every cell
// records the top of whatever a ground agent would be standing on there - 0 on
// bare floor, 0.42 on the first tread of a stair, 1.5 on a deck - and the
// flood is allowed to step between two cells only when the difference between
// their heights is something the agent could actually walk. Up is limited to
// STEP_HEIGHT, the same figure collision uses; down is allowed considerably
// further, because falling off a step is free.
//
// Without it, every raised thing in the room is an island: enemies gather at
// the foot of a staircase they can plainly walk up and mill about, while the
// player stands three treads above them. With it, a stair is a route and a
// deck with a stair on it is high ground both sides can contest.
//
// A cell whose surface is above MAX_STAND is a WALL rather than a floor - see
// the note there. That single number is the whole contract between this file
// and the piece library in terrain.js: decks stay under it, walls stay over.
//
// The arena is rebuilt between waves and never during one, so the bake runs
// again on each new layout - see rebake(). The per-cell search arrays are
// reused; jump links are rebuilt only when the obstacle layout changes.

import { segmentClear, AGENT_HEIGHT, STEP_HEIGHT } from './utils.js';
import {
  JUMP_RISE, BOSS_JUMP_RISE, JUMP_RANGE, BOSS_JUMP_RANGE, JUMP_COST,
  jumpClear, jumpLift,
} from './enemy-jump.js';

// Half a metre. Fine enough to find the gap between two crates, coarse enough
// that a full flood is ~8000 cells - well under a millisecond.
const CELL = 0.5;
// How far along the downhill chain string pulling looks. Beyond about six
// metres the extra waypoints are always rejected by the line-of-sight test
// anyway, since something is in the way - that is why we are here.
const LOOKAHEAD = 12;
// Seconds between floods. The field only has to be as fresh as the player is
// fast: at 8 m/s this is 1.6m of staleness on a route metres long, which is
// invisible, and it caps the cost at five floods a second however many
// enemies are asking.
const REBUILD_INTERVAL = 0.2;

// The tallest surface a ground agent is allowed to end up standing on.
// Terrain's walkable decks are all at or below this and its walls are all
// above it, which is what turns "how tall is this box" into "is this floor or
// is this a wall" without either file having to know anything else about the
// other.
const MAX_STAND = 2.6;
// How far the flood may step DOWN between two cells. Generous next to the
// step up, because dropping off a ledge costs an agent nothing but a moment -
// and capped anyway, so a route is never planned off the top of a tower.
const DROP_MAX = 1.9;

// Eight-way neighbourhood, orthogonals first so ties break toward straight
// movement rather than toward a diagonal.
const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NZ = [0, 0, 1, -1, 1, -1, 1, -1];
const NCOST = [1, 1, 1, 1, 1.4142, 1.4142, 1.4142, 1.4142];

// Below this many cells, a flood did not find the arena - it found a pocket.
// A genuine route to a player standing on the floor covers thousands of cells;
// the top of a crate is nine. Anything in between is a place enemies cannot
// reach either way, so the exact figure only has to sit clear of both.
const ISLAND = 64;

export class NavGrid {
  /**
   * @param {object[]} obstacles  AABBs from buildArena()
   * @param {number} bound        arena half-width
   * @param {number} agentRadius  radius of the thing being routed
   */
  /**
   * @param {object[]} obstacles
   * @param {number} bound
   * @param {number} agentRadius
   * @param {number} agentHeight
   * @param {number} stepHeight  how far up this agent walks without jumping.
   * @param {number} wideRadius  optional second field for larger bodies using
   *   this same shared grid; their jump clearance must match their true size.
   */
  constructor(obstacles, bound, agentRadius = 0.5, agentHeight = AGENT_HEIGHT,
              stepHeight = STEP_HEIGHT, wideRadius = 0) {
    // Ground agents path UNDER anything suspended above their heads, so the
    // catwalks are filtered out here rather than special-cased later. This one
    // list feeds the bake AND both line-of-sight tests below, so filtering
    // once is all it takes - without it a walkway overhead would carve a
    // pillar through the flow field down to the floor and enemies would walk
    // around thin air.
    //
    // THE ARENA CHANGES BETWEEN WAVES, NEVER DURING ONE. terrain.js generates
    // a new interior for every wave, so the filter and the bake are factored
    // into rebake() below and run again each time a layout settles - always in
    // the wave break, with nothing alive to be standing in a cell that is
    // about to become solid.
    this.agentHeight = agentHeight;
    this.stepHeight = stepHeight;
    this.bound = bound;
    this.allObstacles = obstacles;
    this.obstacles = obstacles.filter((o) => o.min.y <= agentHeight);
    this.radius = agentRadius;
    // Line-of-sight is tested a little tighter than the agent really is.
    // Testing at the full radius makes an enemy already brushing a crate
    // decide it has no straight line to anywhere and fall back to the grid.
    this.losRadius = agentRadius * 0.85;
    this.origin = -bound;
    this.dim = Math.floor((bound * 2) / CELL) + 1;

    const n = this.dim * this.dim;
    this.blocked = new Uint8Array(n);
    // The standing surface per cell, in metres. Read by the flood and by the
    // steering below; written only by _bake.
    this.height = new Float32Array(n);
    this.dist = new Float32Array(n);
    this.queue = new Int32Array(n); // fixed-size Dijkstra heap
    this.heapPos = new Int32Array(n);
    this.settled = new Uint8Array(n);
    this.next = new Int32Array(n);
    this.nextJump = new Int32Array(n);
    this.jumpHead = new Int32Array(n);
    this.jumpFrom = [];
    this.jumpNext = [];
    this.jumpCost = [];
    this.jumpLift = [];
    this.heapSize = 0;
    this.jumpRise = agentRadius > 0.8 ? BOSS_JUMP_RISE : JUMP_RISE;
    this.jumpRange = agentRadius > 0.8 ? BOSS_JUMP_RANGE : JUMP_RANGE;
    this.ready = false;
    this.targetCell = -1;
    this.timer = 0;
    this.tx = 0;
    this.tz = 0;
    // The surface the target is standing on. Sightlines are judged against the
    // LOWER of the two ends, so a chase from the floor onto a deck is tested
    // as the floor sees it.
    this.ty = 0;

    this._bake(bound);
    this.wide = wideRadius > agentRadius
      ? new NavGrid(obstacles, bound, wideRadius, agentHeight, stepHeight)
      : null;
  }

  /**
   * Re-derive the grid from a changed obstacle list. Called once per wave,
   * after terrain has finished rising and published its AABBs.
   *
   * The per-cell arrays are sized off the arena and reused. The obstacle
   * filter and jump links are rebuilt for the new layout, then the field is
   * invalidated until the next update() call sees the player's position.
   */
  rebake(obstacles) {
    this.allObstacles = obstacles;
    this.obstacles = obstacles.filter((o) => o.min.y <= this.agentHeight);
    this._bake(this.bound);
    this.ready = false;
    this.targetCell = -1;
    this.timer = 0;
    if (this.wide) this.wide.rebake(obstacles);
  }

  // Marks every cell an enemy cannot stand in. Obstacles are grown by a little
  // under the enemy radius: at exactly the radius the flood refuses to squeeze
  // through gaps the collision resolver would actually let an enemy walk.
  _bake(bound) {
    const grow = this.radius * 0.9;
    // Enemies clamp themselves to 21.6 in enemy.js (ARENA_HALF, enemies/shared.js); cells past that are
    // unreachable, and leaving them open lets a route hug a wall it will then
    // be shoved off.
    const edge = bound - 0.6;
    const maxStand = MAX_STAND;
    // WHAT BREAKS A SIGHTLINE, in two lists, because the answer depends on
    // how high the agent is standing.
    //
    //   losObstacles  above MAX_STAND: a wall. Blocks from anywhere, always.
    //   lowObstacles  between a step and MAX_STAND: a crate, a tread, the
    //                 upper tier of a pedestal. Whether it is in the way
    //                 depends on what the agent is standing on - see _sight.
    //
    // THIS IS THE BUG THAT MADE ENEMIES GRIND INTO CRATES. The list used to be
    // the walls alone, so a 0.95m speaker cabinet - too tall to step onto at
    // STEP_HEIGHT 0.62, too short to count as a wall at MAX_STAND 2.6 - was
    // invisible to both line-of-sight tests. Pass 1 declared the straight line
    // clear and returned it, the enemy walked into the side of the cabinet and
    // stayed there pushing, and the flow field that knew perfectly well how to
    // go round was never consulted. The grid was never wrong; it was being
    // skipped.
    this.losObstacles = this.obstacles.filter((o) => o.max.y > maxStand);
    // Is there anything at all between a step and a wall? When there is not -
    // an arena of nothing but pillars, or a boss grid, which treats every
    // raised thing as a wall already - _sight can stop after the box test.
    this.hasLow = this.obstacles.some(
      (o) => o.max.y > this.stepHeight && o.max.y <= maxStand
    );
    for (let iz = 0; iz < this.dim; iz++) {
      for (let ix = 0; ix < this.dim; ix++) {
        const x = this.origin + ix * CELL;
        const z = this.origin + iz * CELL;
        const i = iz * this.dim + ix;
        if (Math.abs(x) > edge || Math.abs(z) > edge) {
          this.blocked[i] = 1;
          this.height[i] = 0;
          continue;
        }
        // The highest thing under this cell. Obstacles are grown by a little
        // under the agent radius, for the same reason they always were: at
        // exactly the radius the flood refuses gaps collision would let an
        // agent walk through.
        let top = 0;
        for (const o of this.obstacles) {
          if (o.max.y <= top) continue;
          if (x > o.min.x - grow && x < o.max.x + grow &&
              z > o.min.z - grow && z < o.max.z + grow) {
            top = o.max.y;
          }
        }
        // Above what an agent may stand on, so it is a wall and not a floor.
        this.blocked[i] = top > maxStand ? 1 : 0;
        this.height[i] = top;
      }
    }
    this._bakeJumps();
  }

  // Directed shortcuts over low geometry. The grid still carries ordinary
  // walking edges, so a jump wins only when its distance plus takeoff cost is
  // shorter than going around. A landing on raised ground needs real support;
  // the grown occupancy cell alone can describe air beside a narrow crate.
  _bakeJumps() {
    const { dim, blocked, height, jumpHead } = this;
    jumpHead.fill(-1);
    this.jumpFrom.length = 0;
    this.jumpNext.length = 0;
    this.jumpCost.length = 0;
    this.jumpLift.length = 0;
    const maxCells = Math.floor(this.jumpRange / CELL);
    for (let a = 0; a < blocked.length; a++) {
      if (blocked[a]) continue;
      const cx = a % dim;
      const cz = (a / dim) | 0;
      const ay = height[a];
      const ax = this.cellX(a);
      const az = this.cellZ(a);
      for (let k = 0; k < 4; k++) {
        let firstLen = 1;
        let fx = cx + NX[k];
        let fz = cz + NZ[k];
        if (fx < 0 || fz < 0 || fx >= dim || fz >= dim) continue;
        let first = fz * dim + fx;
        // The grown grid can put a large boss's nearest floor cell slightly
        // inside its real collision radius. Start one cell farther back when
        // necessary; the actual arc check below rejects any unsafe launch.
        if (height[first] <= ay + this.stepHeight + 1e-4) {
          firstLen = 2;
          fx += NX[k];
          fz += NZ[k];
          if (fx < 0 || fz < 0 || fx >= dim || fz >= dim) continue;
          first = fz * dim + fx;
        }
        if (blocked[first] || height[first] <= ay + this.stepHeight + 1e-4 ||
            height[first] > ay + this.jumpRise) continue;
        let highest = height[first];
        let highLanding = false;
        for (let len = firstLen + 1; len <= maxCells; len++) {
          const ix = cx + NX[k] * len;
          const iz = cz + NZ[k] * len;
          if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) break;
          const b = iz * dim + ix;
          if (blocked[b] || height[b] > ay + this.jumpRise) break;
          highest = Math.max(highest, height[b]);
          const by = height[b];
          const elevated = by > ay + this.stepHeight + 1e-4;
          if (elevated && highLanding) continue;
          if (!elevated && by < ay - DROP_MAX) break;
          const bx = this.cellX(b);
          const bz = this.cellZ(b);
          if (elevated && !this._landingSupported(bx, bz, by)) continue;
          const lift = jumpLift(ay, by, highest);
          if (!jumpClear(ax, ay, az, bx, by, bz, this.radius,
                         this.agentHeight, lift, this.allObstacles)) continue;
          const edge = this.jumpFrom.length;
          this.jumpFrom.push(a);
          this.jumpNext.push(jumpHead[b]);
          this.jumpCost.push(len + JUMP_COST);
          this.jumpLift.push(lift);
          jumpHead[b] = edge;
          if (elevated) highLanding = true;
          else break; // first floor beyond the obstacle is the useful crossing
        }
      }
    }
  }

  _landingSupported(x, z, y) {
    for (const b of this.obstacles) {
      if (Math.abs(b.max.y - y) > 0.04 ||
          x <= b.min.x + 0.05 || x >= b.max.x - 0.05 ||
          z <= b.min.z + 0.05 || z >= b.max.z - 0.05) continue;
      // A boss standing on a speaker-sized box looks suspended in mid-air.
      if (this.radius > 0.8 &&
          (b.max.x - b.min.x < this.radius * 1.5 ||
           b.max.z - b.min.z < this.radius * 1.5)) continue;
      return true;
    }
    return false;
  }

  /**
   * Is the straight walk from (ax, az) to (bx, bz) actually walkable?
   *
   * Walls always block. Everything shorter blocks only when the agent could
   * not step onto it from the ground it is on: a crate is a wall to something
   * standing on the floor and nothing at all to something already up on the
   * deck beside it. The base height is the LOWER of the two ends, which is the
   * conservative reading - a line that starts on the floor and finishes on a
   * platform has to clear whatever the floor has to clear, and anything this
   * test refuses simply falls through to the flow field, which knows the
   * route. Refusing too often costs a little smoothing; accepting too often is
   * an enemy walking into a box, so the bias is deliberate.
   */
  _sight(ax, az, bx, bz, base) {
    // WALLS, against the boxes. There are few of them and the precise test is
    // what keeps a chase across open floor running dead straight.
    if (!segmentClear(ax, az, bx, bz, this.losRadius, this.losObstacles)) return false;
    if (!this.hasLow) return true;
    // EVERYTHING SHORTER, against the grid. Walking the height field beats
    // testing the boxes here for two reasons. It costs the LENGTH of the line
    // rather than the number of obstacles, and a busy arena has a couple of
    // hundred crates, treads and planters in it - the box loop was the single
    // most expensive thing an enemy did per frame. And it asks the same
    // question the flood asks, off the same numbers, so the line an enemy is
    // allowed to walk and the route it is planned is never a disagreement
    // between two different tests of the same geometry.
    //
    // Sampled down the centre line only: the height field is already baked
    // with obstacles grown by nearly the agent radius, so the width is in the
    // grid rather than in this walk.
    const lim = base + this.stepHeight + 1e-4;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / (CELL * 0.5));
    if (n <= 0) return true;
    const sx = dx / n;
    const sz = dz / n;
    const { height, blocked } = this;
    for (let i = 1; i < n; i++) {
      const c = this.index(ax + sx * i, az + sz * i);
      if (blocked[c] || height[c] > lim) return false;
    }
    return true;
  }

  // Can an agent walk from cell `a` to cell `b`? Both have to be open, and the
  // change in surface height has to be something it could actually do. This is
  // the only place the two directions are treated differently, and it is why
  // enemies walk UP a staircase one tread at a time but never plan a route
  // that starts by dropping off a tower.
  _passable(a, b) {
    if (this.blocked[b]) return false;
    const dh = this.height[b] - this.height[a];
    return dh <= this.stepHeight && dh >= -DROP_MAX;
  }

  /**
   * The cell an agent at (x, z) whose FEET are at `y` is actually standing in.
   *
   * index() alone is not enough, and the difference is a bug you can watch
   * happen: an enemy pressed against a crate sits about 1.25m from its centre,
   * which rounds to a cell the crate occupies. That cell's recorded surface is
   * the crate's top. The enemy is on the floor, but everything downstream then
   * treats it as standing on the crate - and since stepping DOWN off a crate is
   * allowed, the field there points helpfully off the near edge, which is
   * straight into the side the enemy is already pushing against. It shoves
   * there forever.
   *
   * So a cell only counts as this agent's if its surface is something the
   * agent could be standing on: no higher than one step above its feet.
   * Otherwise the nearest cell that is takes over, which is the floor beside
   * the crate - and the route round it that the field has had all along.
   */
  _standCell(x, z, y) {
    const c = this.index(x, z);
    const lim = y + this.stepHeight + 1e-4;
    if (this.height[c] <= lim) return c;
    const { dim, height, blocked } = this;
    const cx = c % dim;
    const cz = (c / dim) | 0;
    for (let r = 1; r <= 3; r++) {
      let best = -1;
      let bestD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = cx + dx;
          const iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
          const i = iz * dim + ix;
          if (blocked[i] || height[i] > lim) continue;
          // Nearest to the agent's real position, not to the cell centre it
          // rounded to - two cells in the same ring are not equally close.
          const ddx = this.cellX(i) - x;
          const ddz = this.cellZ(i) - z;
          const d = ddx * ddx + ddz * ddz;
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      if (best >= 0) return best;
    }
    return c;
  }

  index(x, z) {
    const ix = Math.min(this.dim - 1, Math.max(0, Math.round((x - this.origin) / CELL)));
    const iz = Math.min(this.dim - 1, Math.max(0, Math.round((z - this.origin) / CELL)));
    return iz * this.dim + ix;
  }

  cellX(i) {
    return this.origin + (i % this.dim) * CELL;
  }

  cellZ(i) {
    return this.origin + ((i / this.dim) | 0) * CELL;
  }

  // Called once per frame with the player's position. Refloods at most every
  // REBUILD_INTERVAL, and only when the player has actually changed cell -
  // standing still costs nothing.
  update(dt, x, z, y = 0) {
    if (this.wide) this.wide.update(dt, x, z, y);
    this.tx = x;
    this.tz = z;
    this.ty = y;
    this.timer -= dt;
    if (this.timer > 0) return;
    const c = this._standCell(x, z, y);
    if (this.ready && c === this.targetCell) return;
    this.targetCell = c;
    this.timer = REBUILD_INTERVAL;
    this._flood(c);
    this.ready = true;
  }

  // A reverse Dijkstra field makes each cell choose between walking and a
  // jump by actual travel cost. The old FIFO flood visited each cell only
  // once; it could not compare a short jump with a longer route around cover.
  _flood(target) {
    // THE PLAYER IS NOT ALWAYS SOMEWHERE A ROUTE CAN END. Inside a wall's
    // grown footprint, up on a crate it jumped onto, sealed in a pocket the
    // generator happened to leave - in each case a flood seeded at the player
    // fills a handful of cells and leaves the other eight thousand at
    // Infinity, which is every enemy in the arena falling back to walking
    // straight at them through whatever is in the way.
    //
    // It cannot be settled by looking at the target cell alone. A crate top is
    // not blocked, and its cells step freely between one another, so any local
    // test says it is fine; what makes it an island is that nothing OUTSIDE it
    // can get in, and the cheapest honest way to find that out is to run the
    // flood and see how far it got. A real route to a real player covers a
    // large part of the room, so the threshold does not have to be delicate.
    if (this._floodFrom(target, false) >= ISLAND) return;
    // Second pass: seed from the ground AROUND the island instead, so enemies
    // gather at the foot of whatever the player is standing on.
    this._floodFrom(target, true);
  }

  /**
   * One weighted search. `ring` seeds from the open cells bordering the
   * island the first pass found, rather than from the target itself; the
   * island is still marked by finite `dist` values from that pass, which is
   * why the two are not independent and this is private to _flood.
   *
   * @returns {number} how many cells the flood reached
   */
  _floodFrom(target, ring) {
    const { dim, dist, blocked, next, nextJump, settled, heapPos } = this;
    let seeds = null;

    if (ring) {
      // The island's own cells, borrowed before dist is wiped: everything the
      // first pass reached is at a finite distance and nothing else is.
      seeds = [];
      for (let i = 0; i < dist.length; i++) {
        if (dist[i] === Infinity) continue;
        const cx = i % dim;
        const cz = (i / dim) | 0;
        for (let k = 0; k < 8; k++) {
          const ix = cx + NX[k];
          const iz = cz + NZ[k];
          if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
          const j = iz * dim + ix;
          if (!blocked[j] && dist[j] === Infinity) seeds.push(j);
        }
      }
      // Nothing borders it - the player is sealed in. Widen until something
      // open turns up, so the field is never left empty.
      const tX = target % dim;
      const tZ = (target / dim) | 0;
      for (let r = 1; r <= 12 && seeds.length === 0; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            // Ring only: the interior was covered by a smaller r.
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const ix = tX + dx;
            const iz = tZ + dz;
            if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
            const i = iz * dim + ix;
            if (blocked[i] || dist[i] !== Infinity) continue;
            seeds.push(i);
          }
        }
      }
    }
    dist.fill(Infinity);
    next.fill(-1);
    nextJump.fill(-1);
    settled.fill(0);
    heapPos.fill(-1);
    this.heapSize = 0;
    if (ring) {
      for (const j of seeds) {
        if (dist[j] !== Infinity) continue;
        dist[j] = 0;
        this._heapPush(j);
      }
    } else if (!blocked[target]) {
      dist[target] = 0;
      this._heapPush(target);
    }

    let reached = 0;
    while (this.heapSize > 0) {
      const c = this._heapPop();
      settled[c] = 1;
      reached++;
      const d = dist[c];
      const cx = c % dim;
      const cz = (c / dim) | 0;
      for (let k = 0; k < 8; k++) {
        const ix = cx + NX[k];
        const iz = cz + NZ[k];
        if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
        const i = iz * dim + ix;
        if (blocked[i] || settled[i]) continue;
        // THE FLOOD RUNS OUTWARD FROM THE PLAYER, so a step from `c` to `i` in
        // the field is a step from `i` to `c` when an enemy walks it. The
        // arguments are reversed here for exactly that reason: what is being
        // asked is whether the agent could make the move it will actually
        // make, which is toward the player and therefore toward `c`.
        if (!this._passable(i, c)) continue;
        // No corner cutting: a diagonal squeezed between two cells the agent
        // could not walk into is a diagonal through the corner of a crate.
        // Tested with _passable rather than `blocked` because a crate is not
        // blocked - it is a surface too high to step onto - and the version
        // that only read the mask happily cut the corner off every one of
        // them. Reversed like the step above: the agent's move is toward `c`.
        if (NX[k] !== 0 && NZ[k] !== 0 &&
            (!this._passable(i, cz * dim + ix) || !this._passable(i, iz * dim + cx))) continue;
        const cost = d + NCOST[k];
        if (cost >= dist[i]) continue;
        dist[i] = cost;
        next[i] = c;
        nextJump[i] = -1;
        this._heapPush(i);
      }
      // Every jump is stored under its LANDING cell, so the reverse flood
      // reaches its takeoff just as it reaches walking predecessors above.
      for (let edge = this.jumpHead[c]; edge >= 0; edge = this.jumpNext[edge]) {
        const i = this.jumpFrom[edge];
        if (settled[i]) continue;
        const cost = d + this.jumpCost[edge];
        if (cost >= dist[i]) continue;
        dist[i] = cost;
        next[i] = c;
        nextJump[i] = edge;
        this._heapPush(i);
      }
    }
    return reached;
  }

  // The winning edge was saved during the weighted flood. Re-choosing merely
  // the lowest neighbouring distance could discard a useful jump here.
  _downhill(c) {
    return this.next[c];
  }

  _heapPush(i) {
    const { queue, heapPos, dist } = this;
    let p = heapPos[i];
    if (p < 0) p = this.heapSize++;
    while (p > 0) {
      const parent = (p - 1) >> 1;
      const j = queue[parent];
      if (dist[j] <= dist[i]) break;
      queue[p] = j;
      heapPos[j] = p;
      p = parent;
    }
    queue[p] = i;
    heapPos[i] = p;
  }

  _heapPop() {
    const { queue, heapPos, dist } = this;
    const root = queue[0];
    heapPos[root] = -1;
    const last = queue[--this.heapSize];
    if (this.heapSize > 0) {
      let p = 0;
      while (true) {
        const left = p * 2 + 1;
        if (left >= this.heapSize) break;
        const right = left + 1;
        const child = right < this.heapSize && dist[queue[right]] < dist[queue[left]] ? right : left;
        if (dist[last] <= dist[queue[child]]) break;
        queue[p] = queue[child];
        heapPos[queue[p]] = p;
        p = child;
      }
      queue[p] = last;
      heapPos[last] = p;
    }
    return root;
  }

  /**
   * The flooded cell nearest `c` that this agent could get back onto: the
   * recovery used when an enemy is standing somewhere the field has no answer
   * for - shoved inside an obstacle's grown footprint by crowding, most often.
   *
   * Two things it now insists on that it did not before:
   *
   *   IT HAS TO BE SOMEWHERE THE AGENT COULD STAND. Without the height test
   *   this happily returned the top of the crate the enemy was jammed against,
   *   because that cell is open and has a low distance - it is a metre nearer
   *   the player, being on the far side of the obstacle.
   *
   *   AND IT HAS TO BE VISIBLE FROM WHERE THE AGENT IS. The caller aims at
   *   this cell directly, so one chosen across a crate is an instruction to
   *   walk through it. Sight is a preference rather than a requirement: an
   *   agent wedged in a corner that can see nothing is better off aiming at
   *   the nearest floor it can reach than at nothing at all, so a second pass
   *   drops the requirement rather than giving up.
   */
  _nearestOpen(c, y, x, z) {
    const { dim, dist, blocked, height } = this;
    const cx = c % dim;
    const cz = (c / dim) | 0;
    const lim = y + this.stepHeight + 1e-4;
    let fallback = -1;
    for (let r = 1; r <= 4; r++) {
      let best = -1;
      let bestD = Infinity;
      let loose = -1;
      let looseD = Infinity;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = cx + dx;
          const iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
          const i = iz * dim + ix;
          if (blocked[i] || height[i] > lim || dist[i] === Infinity) continue;
          if (dist[i] < looseD) { looseD = dist[i]; loose = i; }
          if (dist[i] >= bestD) continue;
          if (!this._sight(x, z, this.cellX(i), this.cellZ(i), Math.min(y, height[i]))) continue;
          bestD = dist[i];
          best = i;
        }
      }
      if (best >= 0) return best;
      if (fallback < 0) fallback = loose;
    }
    return fallback;
  }

  /**
   * Unit heading from (x, z) toward the player, around whatever is in between.
   *
   * @param {number} x
   * @param {number} z
   * @param {{x:number, z:number}} out  written in place
   * @param {number} approachBias  signed per-enemy angle on clear approaches
   * @returns {boolean}  false when there is no usable route and the caller
   *   should fall back to heading straight at the player
   */
  steer(x, z, out, y = 0, radius = this.radius, approachBias = 0) {
    if (this.wide && radius > this.radius + 0.05) {
      return this.wide.steer(x, z, out, y, radius, approachBias);
    }
    out.jump = false;
    if (!this.ready) return false;

    // Pass 1: nothing in the way, so ignore the grid entirely.
    if (this._sight(x, z, this.tx, this.tz, Math.min(y, this.ty))) {
      if (!this._aim(x, z, this.tx, this.tz, out)) return false;
      // A small, per-body approach angle breaks up the single-file chase on
      // open floor. Fade it before melee range; test the angled next steps so
      // cover and arena edges still get the exact route they need.
      const distance = Math.hypot(this.tx - x, this.tz - z);
      const angle = approachBias * Math.min(1, Math.max(0, (distance - 2) / 4));
      if (angle !== 0) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const bx = out.x * cos - out.z * sin;
        const bz = out.x * sin + out.z * cos;
        const edge = this.bound - this.radius;
        const aheadX = x + bx * 2;
        const aheadZ = z + bz * 2;
        const base = Math.min(y, this.ty);
        const ahead = this.index(aheadX, aheadZ);
        if (Math.abs(aheadX) < edge && Math.abs(aheadZ) < edge &&
            !this.blocked[ahead] && this.height[ahead] <= base + this.stepHeight &&
            this._sight(x, z, aheadX, aheadZ, base)) {
          out.x = bx;
          out.z = bz;
        }
      }
      return true;
    }

    let c = this._standCell(x, z, y);
    // Standing in a cell the flood never reached. Recover onto the nearest
    // cell the agent could walk back onto and route from THERE - rather than
    // just aiming at it, which threw away the rest of the route every frame
    // an enemy spent brushing an obstacle.
    let recovered = false;
    if (this.blocked[c] || this.dist[c] === Infinity) {
      const r = this._nearestOpen(c, y, x, z);
      if (r < 0) return false;
      c = r;
      recovered = true;
    }

    // Pass 2: walk downhill, keeping the farthest waypoint still in sight.
    let wx = this.cellX(c);
    let wz = this.cellZ(c);
    let have = recovered;
    for (let step = 0; step < LOOKAHEAD; step++) {
      const from = c;
      const nxt = this._downhill(from);
      if (nxt < 0) break;
      const edge = this.nextJump[from];
      if (edge >= 0) {
        const takeX = this.cellX(from);
        const takeZ = this.cellZ(from);
        if (!recovered && Math.hypot(x - takeX, z - takeZ) <= 0.36 &&
            Math.abs(y - this.height[from]) < 0.3) {
          out.jump = true;
          out.jumpX = this.cellX(nxt);
          out.jumpZ = this.cellZ(nxt);
          out.jumpY = this.height[nxt];
          out.jumpLift = this.jumpLift[edge];
          return this._aim(x, z, out.jumpX, out.jumpZ, out);
        }
        if (this._sight(x, z, takeX, takeZ, Math.min(y, this.height[from]))) {
          return this._aim(x, z, takeX, takeZ, out);
        }
        return have ? this._aim(x, z, wx, wz, out) : false;
      }
      c = nxt;
      const px = this.cellX(c);
      const pz = this.cellZ(c);
      // The first cell is the fallback: it is one grid step away and always
      // walkable, even when the enemy is wedged tight enough that the sight
      // test below refuses everything. Not so after a recovery, though - there
      // the agent is off the route and the step from the cell it was PUT on is
      // not a step from where it actually stands, so that one is checked like
      // any other.
      if (step === 0 && !recovered) {
        wx = px;
        wz = pz;
        have = true;
      } else if (this._sight(x, z, px, pz, Math.min(y, this.height[c]))) {
        wx = px;
        wz = pz;
        have = true;
      } else {
        break;
      }
    }
    if (!have) return false;
    return this._aim(x, z, wx, wz, out);
  }

  _aim(x, z, tx, tz, out) {
    const dx = tx - x;
    const dz = tz - z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) return false;
    out.x = dx / d;
    out.z = dz / d;
    return true;
  }
}
