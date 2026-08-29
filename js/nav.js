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
// The grid is static because the arena is. Nothing here allocates after the
// constructor - the distance field, the queue and the blocked mask are typed
// arrays sized once and rewritten in place.

import { segmentClear } from './utils.js';

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
  constructor(obstacles, bound, agentRadius = 0.5) {
    this.obstacles = obstacles;
    this.radius = agentRadius;
    // Line-of-sight is tested a little tighter than the agent really is.
    // Testing at the full radius makes an enemy already brushing a crate
    // decide it has no straight line to anywhere and fall back to the grid.
    this.losRadius = agentRadius * 0.85;
    this.origin = -bound;
    this.dim = Math.floor((bound * 2) / CELL) + 1;

    const n = this.dim * this.dim;
    this.blocked = new Uint8Array(n);
    this.dist = new Float32Array(n);
    this.queue = new Int32Array(n);
    this.ready = false;
    this.targetCell = -1;
    this.timer = 0;
    this.tx = 0;
    this.tz = 0;

    this._bake(bound);
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
    for (let iz = 0; iz < this.dim; iz++) {
      for (let ix = 0; ix < this.dim; ix++) {
        const x = this.origin + ix * CELL;
        const z = this.origin + iz * CELL;
        let solid = Math.abs(x) > edge || Math.abs(z) > edge;
        if (!solid) {
          for (const o of this.obstacles) {
            if (x > o.min.x - grow && x < o.max.x + grow &&
                z > o.min.z - grow && z < o.max.z + grow) {
              solid = true;
              break;
            }
          }
        }
        this.blocked[iz * this.dim + ix] = solid ? 1 : 0;
      }
    }
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
    if (segmentClear(x, z, this.tx, this.tz, this.losRadius, this.obstacles)) {
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
      } else if (segmentClear(x, z, px, pz, this.losRadius, this.obstacles)) {
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
