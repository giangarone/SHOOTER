// Enemy navigation. Turns "walk at the player" into "walk to the player",
// which is the difference between an enemy that grinds against a pillar and
// one that comes round it.
//
// HOW IT WORKS
//   The arena floor is baked once into a coarse occupancy grid: a cell is
//   blocked if its centre falls inside any obstacle AABB grown by the enemy
//   radius, so a path through open cells is a path a 0.5m-wide enemy can
//   actually walk. Every few frames a breadth-first flood from the player's
//   cell fills a distance field over that grid, and an enemy steers by walking
//   downhill through it.
//
//   One field serves every enemy. That is the whole reason for doing it this
//   way rather than an A* per enemy: thirty enemies all want a route to the
//   same place, so the route is computed once and read thirty times.
//
// TWO SMOOTHING PASSES keep it from looking like grid movement:
//   1. If the straight line to the player is clear, the field is ignored
//      entirely and the enemy walks straight - which is most of the time, in
//      an arena this open, and costs one slab test.
//   2. Otherwise the enemy follows the downhill chain a few cells ahead and
//      aims at the FARTHEST cell it still has a clear line to. That is string
//      pulling: it cuts the staircase off a grid path and rounds corners.
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
// again on each new layout - see rebake(). Nothing here allocates after the
// constructor: the height field, the distance field, the queue and the blocked
// mask are typed arrays sized once and rewritten in place.

import { segmentClear, AGENT_HEIGHT, STEP_HEIGHT } from './utils.js';

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
   * @param {number} stepHeight  how far up this agent walks. Pass 0 for one
   *   that cannot climb at all - bosses are routed that way, since a body that
   *   size stepping onto a crate looks like a bug rather than a step.
   */
  constructor(obstacles, bound, agentRadius = 0.5, agentHeight = AGENT_HEIGHT,
              stepHeight = STEP_HEIGHT) {
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
    this.queue = new Int32Array(n);
    this.ready = false;
    this.targetCell = -1;
    this.timer = 0;
    this.tx = 0;
    this.tz = 0;

    this._bake(bound);
  }

  /**
   * Re-derive the grid from a changed obstacle list. Called once per wave,
   * after terrain has finished rising and published its AABBs.
   *
   * Allocates nothing but the filtered array: `blocked`, `dist` and `queue`
   * are sized off the arena, which does not change, so they are rewritten in
   * place. The field is invalidated rather than reflooded here - the next
   * update() call does that, against the player's position at the time.
   */
  rebake(obstacles) {
    this.obstacles = obstacles.filter((o) => o.min.y <= this.agentHeight);
    this._bake(this.bound);
    this.ready = false;
    this.targetCell = -1;
    this.timer = 0;
  }

  // Marks every cell an enemy cannot stand in. Obstacles are grown by a little
  // under the enemy radius: at exactly the radius the flood refuses to squeeze
  // through gaps the collision resolver would actually let an enemy walk.
  _bake(bound) {
    const grow = this.radius * 0.9;
    // Enemies clamp themselves to 21.6 in enemy.js; cells past that are
    // unreachable, and leaving them open lets a route hug a wall it will then
    // be shoved off.
    const edge = bound - 0.6;
    // An agent that cannot step treats ANY raised surface as a wall, which is
    // exactly the behaviour this grid had before it knew about height - so a
    // boss grid is bit-for-bit what it always was.
    const maxStand = this.stepHeight > 0 ? MAX_STAND : 0.02;
    // The walls, for line of sight. A deck the agent can walk onto must not
    // break its own sightline, or an enemy standing on a platform decides it
    // cannot see anything and falls back to the grid for a route it is
    // already standing on.
    this.losObstacles = this.obstacles.filter((o) => o.max.y > maxStand);
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
  update(dt, x, z) {
    this.tx = x;
    this.tz = z;
    this.timer -= dt;
    if (this.timer > 0) return;
    const c = this.index(x, z);
    if (this.ready && c === this.targetCell) return;
    this.targetCell = c;
    this.timer = REBUILD_INTERVAL;
    this._flood(c);
    this.ready = true;
  }

  // Breadth-first flood outward from the player. Costs differ between straight
  // and diagonal steps, so this is not a shortest-path field in the strict
  // sense - but every cell is written from a neighbour with a strictly smaller
  // value, which is the only property downhill steering needs: there are no
  // local minima to trap an enemy short of the player.
  _flood(target) {
    const { dim, dist, blocked, queue } = this;
    dist.fill(Infinity);
    let head = 0;
    let tail = 0;

    // The player standing on a platform puts the target in a blocked cell.
    // Seed from the open cells around it instead, so enemies gather at the
    // foot of the platform rather than losing the route entirely.
    if (!blocked[target]) {
      dist[target] = 0;
      queue[tail++] = target;
    } else {
      const tX = target % dim;
      const tZ = (target / dim) | 0;
      for (let r = 1; r <= 8 && tail === 0; r++) {
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            // Ring only: the interior was covered by a smaller r.
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            const ix = tX + dx;
            const iz = tZ + dz;
            if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
            const i = iz * dim + ix;
            if (blocked[i]) continue;
            dist[i] = 0;
            queue[tail++] = i;
          }
        }
      }
    }

    while (head < tail) {
      const c = queue[head++];
      const d = dist[c];
      const cx = c % dim;
      const cz = (c / dim) | 0;
      for (let k = 0; k < 8; k++) {
        const ix = cx + NX[k];
        const iz = cz + NZ[k];
        if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
        const i = iz * dim + ix;
        if (blocked[i] || dist[i] !== Infinity) continue;
        // THE FLOOD RUNS OUTWARD FROM THE PLAYER, so a step from `c` to `i` in
        // the field is a step from `i` to `c` when an enemy walks it. The
        // arguments are reversed here for exactly that reason: what is being
        // asked is whether the agent could make the move it will actually
        // make, which is toward the player and therefore toward `c`.
        if (!this._passable(i, c)) continue;
        // No corner cutting: a diagonal between two blocked cells is a
        // diagonal through the corner of a crate.
        if (NX[k] !== 0 && NZ[k] !== 0 && (blocked[cz * dim + ix] || blocked[iz * dim + cx])) continue;
        dist[i] = d + NCOST[k];
        queue[tail++] = i;
      }
    }
  }

  // The open neighbour with the smallest distance, or -1 if this cell has no
  // downhill (which only happens on a seed cell or outside the flood).
  _downhill(c) {
    const { dim, dist, blocked } = this;
    const cx = c % dim;
    const cz = (c / dim) | 0;
    let best = -1;
    let bestD = dist[c];
    for (let k = 0; k < 8; k++) {
      const ix = cx + NX[k];
      const iz = cz + NZ[k];
      if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
      const i = iz * dim + ix;
      if (blocked[i] || dist[i] >= bestD) continue;
      if (!this._passable(c, i)) continue;
      if (NX[k] !== 0 && NZ[k] !== 0 && (blocked[cz * dim + ix] || blocked[iz * dim + cx])) continue;
      bestD = dist[i];
      best = i;
    }
    return best;
  }

  // The open, flooded cell closest to `c` with the smallest distance to the
  // player. Used only to recover an enemy that is standing somewhere the flood
  // says it cannot be.
  _nearestOpen(c) {
    const { dim, dist, blocked } = this;
    const cx = c % dim;
    const cz = (c / dim) | 0;
    let best = -1;
    let bestD = Infinity;
    for (let r = 1; r <= 4 && best < 0; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = cx + dx;
          const iz = cz + dz;
          if (ix < 0 || iz < 0 || ix >= dim || iz >= dim) continue;
          const i = iz * dim + ix;
          if (blocked[i] || dist[i] >= bestD) continue;
          bestD = dist[i];
          best = i;
        }
      }
    }
    return best;
  }

  /**
   * Unit heading from (x, z) toward the player, around whatever is in between.
   *
   * @param {number} x
   * @param {number} z
   * @param {{x:number, z:number}} out  written in place
   * @returns {boolean}  false when there is no usable route and the caller
   *   should fall back to heading straight at the player
   */
  steer(x, z, out) {
    if (!this.ready) return false;

    // Pass 1: nothing in the way, so ignore the grid entirely.
    if (segmentClear(x, z, this.tx, this.tz, this.losRadius, this.losObstacles)) {
      return this._aim(x, z, this.tx, this.tz, out);
    }

    let c = this.index(x, z);
    if (this.blocked[c] || this.dist[c] === Infinity) {
      // Standing in a cell the flood never reached - shoved inside an
      // obstacle's grown footprint by crowding, most often. Head for the best
      // open cell nearby, which walks back out of it and rejoins the route.
      c = this._nearestOpen(c);
      if (c < 0) return false;
      return this._aim(x, z, this.cellX(c), this.cellZ(c), out);
    }

    // Pass 2: walk downhill, keeping the farthest waypoint still in sight.
    let wx = 0;
    let wz = 0;
    let have = false;
    for (let step = 0; step < LOOKAHEAD; step++) {
      const nxt = this._downhill(c);
      if (nxt < 0) break;
      c = nxt;
      const px = this.cellX(c);
      const pz = this.cellZ(c);
      if (step === 0) {
        // The first cell is the fallback: it is one grid step away and always
        // walkable, even when the enemy is wedged tight enough that the
        // line-of-sight test below refuses everything.
        wx = px;
        wz = pz;
        have = true;
      } else if (segmentClear(x, z, px, pz, this.losRadius, this.losObstacles)) {
        wx = px;
        wz = pz;
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
