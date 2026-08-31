// Money orbs: the credits an enemy was worth, lying on the floor.
//
// Kills no longer pay straight into the balance. They drop orbs, the orbs sit
// where the enemy died for ORB_LIFETIME seconds, and the player has to walk
// over them - which is what turns "kill things" into "kill things and then go
// and take the ground you killed them on".
//
// ONE DRAW CALL, ALWAYS.
//   Two hundred orbs cannot be two hundred Object3Ds. The pickups in
//   powerups.js are a Mesh plus a glow Sprite each, which is fine for the
//   dozen of them the arena holds and would be four hundred draw calls here.
//   So this is a single THREE.Points over preallocated typed arrays, exactly
//   the shape effects.js uses for its particles: one geometry, one material,
//   one draw, whatever the count.
//
// THE CPU DOES AS LITTLE AS IT CAN.
//   An orb that has come to rest is not simulated. Its bob, its spin, its
//   colour cycle and its despawn blink are all computed in the shader from
//   uTime and a handful of per-orb attributes that never change after spawn,
//   so a floor covered in settled orbs costs one distance check each per frame
//   and nothing else. Only orbs that are actually MOVING - still falling, or
//   being pulled in - have their positions written and uploaded.
//
// WHAT AN ORB IS WORTH.
//   The `value` is exact and lives on the CPU side; the visual tier is derived
//   from it. Merging (see spawn(), at the cap) adds value into an existing orb
//   rather than dropping the money, so the cap can never cost the player a
//   credit - it only ever makes the orbs bigger.

import * as THREE from 'three';

// Hard ceiling on orbs in the arena at once. Past this, a new drop merges into
// the nearest existing orb instead of taking a slot.
export const MAX_ORBS = 250;

// Seconds an orb lies on the floor, and how many of those final seconds it
// spends blinking. Shorter than PICKUP_LIFETIME because money is dropped into
// the fight in quantity and is meant to be swept up as part of it - and the
// wave-clear vacuum collects whatever is left anyway.
export const ORB_LIFETIME = 20;
const ORB_BLINK_TIME = 4;

// Credits one orb would like to be worth. A kill's payout is divided by this
// to decide how many orbs it becomes, so a chaser off a cold start drops one
// and a tank mid-chain drops a handful.
const ORB_TARGET_VALUE = 15;
// Orbs a single payout may split into. The boss bonus passes its own.
const MAX_ORBS_PER_DROP = 5;

// Collected outright inside this. Deliberately tighter than the powerup radius
// (1.2) because the magnet below is what actually does the collecting - this
// is just the last step of it.
const COLLECT_RADIUS = 0.7;
// Pulled in from inside this, before any mutation widens it. Generous on
// purpose: at half this the player had to walk over each orb almost exactly,
// which turned collecting a wave's money into tidying up rather than into
// moving through the room.
export const BASE_MAGNET_RADIUS = 5;
// How hard the magnet pulls, in metres per second per second, and the speed it
// gives up trying to add to. An orb accelerates the whole way in, so it snaps
// into the player rather than drifting after them.
const PULL_ACCEL = 46;
const PULL_MAX_SPEED = 26;
// Gravity on an orb that is still in the air, and what a floor bounce keeps.
const GRAVITY = 22;
const BOUNCE = 0.34;
// Where a settled orb floats.
const REST_Y = 0.42;

// Per-orb state. FLY is the spawn arc, SETTLED is lying on the floor doing
// nothing at all, HOME is being pulled toward the player.
const FLY = 0;
const SETTLED = 1;
const HOME = 2;

// RAINBOW, ALL THE WAY THROUGH.
//
// The whole orb wears the room's colour - hue from one uHue uniform that
// main.js feeds from the rig's current house colour, plus a fixed per-orb
// offset, so a pile of them is a spread of neighbouring hues that all swing
// together when the ceiling does. Two uniform writes a frame; no colour buffer
// and no per-orb work on the CPU at all.
//
// What keeps them readable against a floor that is ALREADY washed in that same
// cycling colour is not hue, it is VALUE: the centre burns out to white and
// the edge is fully saturated, so an orb is a hard bright point on a dim wash
// whatever colour the room is currently wearing. That contrast is the thing to
// protect if these are ever retuned - a flatter, softer orb disappears into
// the floor exactly when there are most of them.
const VERT = `
  uniform float uTime;
  uniform float uScale;
  attribute float aHue;
  attribute float aSize;
  attribute float aPhase;
  attribute float aSpawn;
  varying float vHue;
  varying float vFade;
  void main() {
    vHue = aHue;
    float age = uTime - aSpawn;
    // Pops in over the first fifth of a second, blinks out over the last few.
    float in_ = clamp(age * 5.0, 0.0, 1.0);
    float left = ${ORB_LIFETIME.toFixed(1)} - age;
    float blink = left > ${ORB_BLINK_TIME.toFixed(1)}
      ? 1.0
      : step(0.45, fract(left * 4.0)) * clamp(left, 0.0, 1.0);
    vFade = in_ * blink;
    vec3 p = position;
    p.y += sin(uTime * 2.2 + aPhase) * 0.09;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = aSize * (0.9 + 0.1 * sin(uTime * 5.0 + aPhase)) * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = `
  uniform float uHue;
  varying float vHue;
  varying float vFade;
  vec3 hue2rgb(float h) {
    vec3 k = fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0));
    return clamp(abs(k * 6.0 - 3.0) - 1.0, 0.0, 1.0);
  }
  void main() {
    // Radial distance across the point sprite, 0 at the centre, 1 at the edge.
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    vec3 hue = hue2rgb(fract(uHue + vHue));
    // The edge is shifted a little further round the wheel than the body, so
    // the orb has an iridescent lip rather than one flat colour - it is what
    // makes a sphere out of a disc without a single lighting term.
    vec3 lip = hue2rgb(fract(uHue + vHue + 0.11));
    // Three parts, and the proportions matter: a SOLID disc so the orb reads
    // as an object rather than as a lens flare, a narrow ring around it, and a
    // wide soft halo underneath both so a floor of them still glows. A fat,
    // fuzzy core is the failure mode here - it turns two hundred orbs into fog.
    float core = smoothstep(0.46, 0.06, d);
    float ring = smoothstep(0.42, 0.60, d) * smoothstep(0.88, 0.62, d);
    float halo = smoothstep(1.0, 0.42, d) * 0.3;
    // The white-hot centre. This is what separates an orb from the floor wash
    // it is lying on, so it is a term of its own and not a lightened hue.
    float hot = smoothstep(0.24, 0.0, d);
    vec3 c = hue * (core * 1.8 + halo) + lip * ring * 2.3 + vec3(1.0) * hot * 1.5;
    float a = (core + ring * 0.95 + halo * 0.55 + hot * 0.6) * vFade;
    if (a <= 0.003) discard;
    gl_FragColor = vec4(c, a);
  }
`;

/**
 * The whole floor's worth of money, as one object.
 *
 * main.js owns exactly one of these: spawn() on a kill, update() per frame,
 * vacuum() at a wave clear, clear() on a reset.
 */
export class MoneyOrbs {
  constructor(scene) {
    this.scene = scene;
    // Orbs live packed in [0, count). Removal swaps the last one down, which
    // is why every array here is parallel and why the attributes are marked
    // dirty whenever the count changes.
    this.count = 0;

    this.pos = new Float32Array(MAX_ORBS * 3);
    this.hue = new Float32Array(MAX_ORBS);
    this.size = new Float32Array(MAX_ORBS);
    this.phase = new Float32Array(MAX_ORBS);
    // Named `born` and not `spawn` because an instance field would shadow the
    // spawn() method below - a shadowing that fails at the first kill.
    this.born = new Float32Array(MAX_ORBS);
    // CPU-side only: never uploaded.
    this.vel = new Float32Array(MAX_ORBS * 3);
    this.value = new Float32Array(MAX_ORBS);
    this.state = new Uint8Array(MAX_ORBS);
    // Seconds a vacuumed orb waits before it starts moving, so a wave's worth
    // of money arrives as a stream rather than a lump.
    this.delay = new Float32Array(MAX_ORBS);

    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aHue = new THREE.BufferAttribute(this.hue, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aPhase = new THREE.BufferAttribute(this.phase, 1).setUsage(THREE.DynamicDrawUsage);
    this.aSpawn = new THREE.BufferAttribute(this.born, 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aHue', this.aHue);
    g.setAttribute('aSize', this.aSize);
    g.setAttribute('aPhase', this.aPhase);
    g.setAttribute('aSpawn', this.aSpawn);
    g.setDrawRange(0, 0);

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uHue: { value: 0.12 },
        uScale: { value: 400 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(g, this.mat);
    // The bounding sphere of a buffer that is written every frame is a lie, and
    // the orbs are spread over the whole arena anyway.
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    scene.add(this.points);

    this.time = 0;
    // Set to true by anything that writes a position; the upload is skipped
    // entirely on a frame where every orb is asleep.
    this._dirty = false;
  }

  /**
   * Orb sizes are given in METRES (see sizeFor) and gl_PointSize is in pixels,
   * so the conversion needs the projection: a one-metre sprite one metre from
   * the camera covers h / (2 tan(fov/2)) pixels. `h` is the DRAWING BUFFER
   * height, not innerHeight - gl_PointSize is in real device pixels, so a
   * retina display would otherwise draw every orb at half size. Has to be
   * redone on a resize and whenever the field of view changes.
   */
  setViewport(h, fovDeg) {
    const f = Math.max(1, h) / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.mat.uniforms.uScale.value = f;
  }

  /** The rainbow rim's phase. `c` is the rig's current house colour. */
  setHouseColour(c) {
    c.getHSL(HSL);
    this.mat.uniforms.uHue.value = HSL.h;
  }

  /**
   * Drops `amount` credits' worth of orbs at `p`.
   *
   * The amount is split into orbs of roughly ORB_TARGET_VALUE, and the split is
   * EXACT - the remainder rides on the first orb - so what lands on the floor
   * always adds back up to what the kill was worth.
   *
   * @param {THREE.Vector3} p     where they come from
   * @param {number} amount       credits, total
   * @param {number} maxOrbs      cap on the split (the boss shower passes its own)
   * @param {number} spread       horizontal launch speed
   */
  spawn(p, amount, maxOrbs = MAX_ORBS_PER_DROP, spread = 3.2) {
    if (!(amount > 0)) return;
    const n = Math.max(1, Math.min(maxOrbs, Math.round(amount / ORB_TARGET_VALUE)));
    const each = amount / n;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = spread * (0.35 + Math.random() * 0.65);
      this._add(
        p.x, p.y + 0.7 + Math.random() * 0.3, p.z,
        Math.cos(a) * s, 2.2 + Math.random() * 2.6, Math.sin(a) * s,
        each
      );
    }
  }

  // One orb, or - if the arena is already at MAX_ORBS - its value folded into
  // the nearest orb already down there. Money is never lost to the cap.
  _add(x, y, z, vx, vy, vz, value) {
    let i = this.count;
    if (i >= MAX_ORBS) {
      const j = this._nearest(x, z);
      this.value[j] += value;
      this.size[j] = sizeFor(this.value[j]);
      this.aSize.needsUpdate = true;
      return;
    }
    this.count++;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.value[i] = value;
    this.size[i] = sizeFor(value);
    // Each orb sits at a fixed offset around the wheel from the room's colour,
    // so a pile of them is a spread of neighbouring hues rather than one flat
    // sheet - and the whole pile still swings when the room does.
    this.hue[i] = Math.random() * 0.16 - 0.08;
    this.phase[i] = Math.random() * Math.PI * 2;
    this.born[i] = this.time;
    this.state[i] = FLY;
    this.delay[i] = 0;
    this._dirty = true;
    this.aHue.needsUpdate = true;
    this.aSize.needsUpdate = true;
    this.aPhase.needsUpdate = true;
    this.aSpawn.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.count);
  }

  _nearest(x, z) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.count; i++) {
      const dx = this.pos[i * 3] - x;
      const dz = this.pos[i * 3 + 2] - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  /**
   * Pulls every orb on the floor toward the player, whatever the distance.
   * Called at a wave clear so nothing is left behind to time out during the
   * shopping trip. The per-orb delay is what makes it arrive as a stream.
   */
  vacuum() {
    for (let i = 0; i < this.count; i++) {
      if (this.state[i] === HOME) continue;
      this.state[i] = HOME;
      this.delay[i] = Math.random() * 0.7;
    }
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} playerPos  feet position
   * @param {number} magnetR           collection radius, mutations included
   * @param {function(number):void} onCollect  called with the orb's value
   * @returns {number} orbs collected this frame
   */
  update(dt, playerPos, magnetR, onCollect) {
    this.time += dt;
    this.mat.uniforms.uTime.value = this.time;
    if (this.count === 0) return 0;

    const px = playerPos.x;
    const py = playerPos.y + 0.9;
    const pz = playerPos.z;
    const magnet2 = magnetR * magnetR;
    const collect2 = COLLECT_RADIUS * COLLECT_RADIUS;
    let collected = 0;

    for (let i = 0; i < this.count; i++) {
      const i3 = i * 3;
      const st = this.state[i];

      if (st === SETTLED) {
        // The whole point of the settled state: no integration, no writes.
        // Just the two tests that can get it out of that state again.
        if (this.time - this.born[i] >= ORB_LIFETIME) { this._remove(i--); continue; }
        const dx = this.pos[i3] - px;
        const dz = this.pos[i3 + 2] - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 < collect2) {
          onCollect(this.value[i]);
          collected++;
          this._remove(i--);
        } else if (d2 < magnet2) {
          this.state[i] = HOME;
        }
        continue;
      }

      if (st === HOME) {
        if (this.delay[i] > 0) { this.delay[i] -= dt; continue; }
        const dx = px - this.pos[i3];
        const dy = py - this.pos[i3 + 1];
        const dz = pz - this.pos[i3 + 2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        // STEERED, NOT ACCELERATED. Adding a force toward the player and
        // letting momentum carry the rest is the obvious version and it does
        // not work: an orb builds up speed, shoots past, and then orbits the
        // player forever without ever being close enough on any one frame to
        // collect. So the velocity is rebuilt from the direction every frame -
        // only the SPEED accumulates. It arrives, always, from anywhere.
        let sp = Math.min(PULL_MAX_SPEED,
          Math.sqrt(this.vel[i3] * this.vel[i3] + this.vel[i3 + 1] * this.vel[i3 + 1]
            + this.vel[i3 + 2] * this.vel[i3 + 2]) + PULL_ACCEL * dt);
        // Swept: if this step would carry it past the player, it arrived. A
        // machine running at thirty frames moves an orb the better part of a
        // metre per step, and a position-only test lets that tunnel straight
        // through the collection radius.
        if (dist <= COLLECT_RADIUS || sp * dt >= dist) {
          onCollect(this.value[i]);
          collected++;
          this._remove(i--);
          continue;
        }
        const k = sp / dist;
        this.vel[i3] = dx * k;
        this.vel[i3 + 1] = dy * k;
        this.vel[i3 + 2] = dz * k;
        this.pos[i3] += dx * k * dt;
        this.pos[i3 + 1] += dy * k * dt;
        this.pos[i3 + 2] += dz * k * dt;
        this._dirty = true;
        continue;
      }

      // FLY: the spawn arc. Ends the first time it is slow enough on landing,
      // at which point the orb goes to sleep for good.
      this.vel[i3 + 1] -= GRAVITY * dt;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      this._dirty = true;
      if (this.pos[i3 + 1] <= REST_Y) {
        this.pos[i3 + 1] = REST_Y;
        if (this.vel[i3 + 1] > -2.2) {
          this.state[i] = SETTLED;
          this.vel[i3] = 0; this.vel[i3 + 1] = 0; this.vel[i3 + 2] = 0;
        } else {
          this.vel[i3 + 1] = -this.vel[i3 + 1] * BOUNCE;
          this.vel[i3] *= 0.6;
          this.vel[i3 + 2] *= 0.6;
        }
      }
      const dx = this.pos[i3] - px;
      const dz = this.pos[i3 + 2] - pz;
      if (dx * dx + dz * dz < collect2) {
        onCollect(this.value[i]);
        collected++;
        this._remove(i--);
      }
    }

    if (this._dirty) {
      this.aPos.needsUpdate = true;
      this._dirty = false;
    }
    return collected;
  }

  // Swap-remove. The last live orb is copied down into the hole, so the array
  // stays packed and drawRange stays a single span.
  _remove(i) {
    const last = --this.count;
    if (i !== last) {
      const a = i * 3;
      const b = last * 3;
      this.pos[a] = this.pos[b];
      this.pos[a + 1] = this.pos[b + 1];
      this.pos[a + 2] = this.pos[b + 2];
      this.vel[a] = this.vel[b];
      this.vel[a + 1] = this.vel[b + 1];
      this.vel[a + 2] = this.vel[b + 2];
      this.hue[i] = this.hue[last];
      this.size[i] = this.size[last];
      this.phase[i] = this.phase[last];
      this.born[i] = this.born[last];
      this.value[i] = this.value[last];
      this.state[i] = this.state[last];
      this.delay[i] = this.delay[last];
      this.aHue.needsUpdate = true;
      this.aSize.needsUpdate = true;
      this.aPhase.needsUpdate = true;
      this.aSpawn.needsUpdate = true;
    }
    this._dirty = true;
    this.points.geometry.setDrawRange(0, this.count);
  }

  /** Drops everything on the floor, uncollected. Run resets only. */
  clear() {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }
}

// Three visual weights, off the value. The tier is a SIZE, never a colour:
// colour is what says "money", and splitting it by denomination as well would
// cost the orbs the thing that makes them one readable class of object.
function sizeFor(v) {
  // Point sizes, so the visible disc is a little under half of each - see the
  // core term in the fragment shader.
  if (v >= 100) return 0.66;
  if (v >= 25) return 0.50;
  return 0.38;
}

const HSL = { h: 0, s: 0, l: 0 };
