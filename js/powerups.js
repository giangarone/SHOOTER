// Pickups: ammo crates and the four powerups.
//
// A pickup is a floating mesh plus an additive glow sprite. It is collected by
// proximity (no raycast) and despawns after PICKUP_LIFETIME.
//
// Adding a type means: an entry in POWERUP_TYPES with a `weight` and an `sfx`
// name that matches a method on SFX, and a geometry in GEOMS under the same
// key. `apply(player, time)` mutates the player directly; timed buffs set an
// end time that Player.update() watches for.
//
// TWO RULES THAT COST A LOT WHEN BROKEN:
//   1. Never give a pickup a real light. three.js keys shader programs on the
//      scene's light count, so spawning one recompiles every material in the
//      scene. That is what the glow sprite is for.
//   2. Geometries and materials here are shared by every instance and are
//      never disposed. destroy() only removes objects from the scene. Calling
//      dispose() on them would break every other pickup of that type.

import * as THREE from 'three';
import { waveEnemyCount } from './waves.js';
import { BOUND } from './arena.js';

export const POWERUP_TYPES = {
  health: {
    color: 0x00e676,
    emissive: 0x00e676,
    amount: 25,
    apply: (player) => {
      player.health = Math.min(player.maxHealth + 25, player.health + 25);
    },
    weight: 0.45,
    sfx: 'pickupHealth',
  },
  damageBoost: {
    color: 0xff3d00,
    emissive: 0xff3d00,
    duration: 10,
    apply: (player, time) => {
      player.damageMult = 1.5;
      player.damageBoostEnd = time + 10;
    },
    weight: 0.25,
    sfx: 'pickupBuff',
  },
  fireRateBoost: {
    color: 0x2979ff,
    emissive: 0x2979ff,
    duration: 8,
    apply: (player, time) => {
      player.fireRateMult = 1.7;
      player.fireRateBoostEnd = time + 8;
    },
    weight: 0.2,
    sfx: 'pickupBuff',
  },
  shield: {
    color: 0x4ef3ff,
    emissive: 0x4ef3ff,
    amount: 50,
    apply: (player, time) => {
      player.shield = 50;
      player.shieldEnd = time + 15;
    },
    weight: 0.1,
    sfx: 'pickupShield',
  },
};

// Ammo is deliberately not in POWERUP_TYPES: it is spawned on its own timer
// and its own cap in main.js, not from the weighted powerup roll.
export const AMMO_PICKUP = {
  color: 0xffd600,
  emissive: 0xffd600,
  amount: 45,
  apply: (player) => {
    player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 45);
  },
  sfx: 'pickupAmmo',
};

// How long a pickup sits in the arena before it fades out, in game seconds,
// and how many of those final seconds it spends blinking. The blink is the
// only warning the player gets, so it starts well before the pickup goes.
export const PICKUP_LIFETIME = 60;
export const PICKUP_BLINK_TIME = 5;
// Blinks per second during that window. Fast enough to read as urgent from
// across the arena without strobing.
const BLINK_RATE = 5;

const TYPE_KEYS = Object.keys(POWERUP_TYPES);

// Draws from the eligible types only, renormalising their weights so skipping
// health does not skew every remaining roll toward the last entry.
function pickRandomType(playerHealth, playerMaxHealth) {
  let total = 0;
  for (const key of TYPE_KEYS) {
    if (key === 'health' && playerHealth >= playerMaxHealth) continue;
    total += POWERUP_TYPES[key].weight;
  }
  let r = Math.random() * total;
  let last = null;
  for (const key of TYPE_KEYS) {
    if (key === 'health' && playerHealth >= playerMaxHealth) continue;
    last = key;
    r -= POWERUP_TYPES[key].weight;
    if (r <= 0) return key;
  }
  return last;
}

// The shield dome is deliberately small: at its original size it swallowed
// the floor around it and read as arena geometry rather than as a pickup.
function createHexDomeGeometry(radius = 0.5, height = 0.62) {
  const geom = new THREE.BufferGeometry();
  const positions = [];
  const indices = [];
  const segments = 6;
  const rings = 4;

  for (let r = 0; r <= rings; r++) {
    const v = r / rings;
    const y = v * height;
    const ringRadius = radius * (1 - v * 0.3);
    for (let s = 0; s < segments; s++) {
      const angle = (s / segments) * Math.PI * 2;
      positions.push(Math.cos(angle) * ringRadius, y, Math.sin(angle) * ringRadius);
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + ((s + 1) % segments);
      const c = (r + 1) * segments + s;
      const d = (r + 1) * segments + ((s + 1) % segments);
      indices.push(a, b, d, d, c, a);
    }
  }

  geom.setIndex(indices);
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

function createPlusGeometry(size = 0.4, thickness = 0.12) {
  const shape = new THREE.Shape();
  const w = size;
  const t = size * 0.4;

  shape.moveTo(-t, -w);
  shape.lineTo(t, -w);
  shape.lineTo(t, -t);
  shape.lineTo(w, -t);
  shape.lineTo(w, t);
  shape.lineTo(t, t);
  shape.lineTo(t, w);
  shape.lineTo(-t, w);
  shape.lineTo(-t, t);
  shape.lineTo(-w, t);
  shape.lineTo(-w, -t);
  shape.lineTo(-t, -t);
  shape.lineTo(-t, -w);

  return new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  });
}

const DOME_GEOM = createHexDomeGeometry();

// Geometries and materials are shared across every pickup instance and live
// for the lifetime of the page, so nothing here is ever disposed.
const GEOMS = {
  ammo: new THREE.OctahedronGeometry(0.35, 0),
  health: createPlusGeometry(),
  damageBoost: new THREE.TetrahedronGeometry(0.38, 0),
  fireRateBoost: new THREE.DodecahedronGeometry(0.32, 0),
  shield: DOME_GEOM,
};

const coreMats = new Map();
function coreMaterial(typeKey, def) {
  let m = coreMats.get(typeKey);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: def.color,
      emissive: def.emissive,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.7,
      transparent: true,
      opacity: 0.9,
    });
    coreMats.set(typeKey, m);
  }
  return m;
}

const glowMats = new Map();
function glowMaterial(typeKey, def, glowTex) {
  let m = glowMats.get(typeKey);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: glowTex,
      color: def.color,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glowMats.set(typeKey, m);
  }
  return m;
}

let SHIELD_DOME_MAT = null;
function shieldDomeMaterial() {
  if (!SHIELD_DOME_MAT) {
    SHIELD_DOME_MAT = new THREE.MeshStandardMaterial({
      color: 0x4ef3ff,
      emissive: 0x4ef3ff,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
    });
  }
  return SHIELD_DOME_MAT;
}

// One pickup in the arena. main.js owns the list, calls update() each frame,
// and destroys it on pickup or despawn.
export class Powerup {
  /**
   * @param {number} time game time (the same clock passed to update), used for
   *   the despawn countdown. Mixing this with wall time makes pickups either
   *   despawn instantly or never at all.
   */
  constructor(typeKey, position, scene, glowTex, time, typeDef = null) {
    this.typeKey = typeKey;
    this.type = typeDef || POWERUP_TYPES[typeKey];
    this.pos = position.clone();
    this.scene = scene;
    this.spawnTime = time;
    this.despawnTime = PICKUP_LIFETIME;
    this.dead = false;
    this.bobOffset = Math.random() * Math.PI * 2;
    this.rotSpeed = 0.5 + Math.random() * 0.5;

    this.core = new THREE.Mesh(GEOMS[typeKey] || GEOMS.ammo, coreMaterial(typeKey, this.type));
    this.core.position.set(this.pos.x, 0.5, this.pos.z);
    scene.add(this.core);

    this.dome = null;
    if (typeKey === 'shield') {
      this.dome = new THREE.Mesh(DOME_GEOM, shieldDomeMaterial());
      this.dome.position.set(this.pos.x, 0.7, this.pos.z);
      scene.add(this.dome);
    }

    // An additive sprite instead of a PointLight: a real light would change the
    // scene's light count on every spawn/despawn, which forces three.js to
    // recompile every material in the scene and stalls the frame.
    this.glow = new THREE.Sprite(glowMaterial(typeKey, this.type, glowTex));
    this.glow.scale.setScalar(1.8);
    this.glow.position.set(this.pos.x, 0.7, this.pos.z);
    scene.add(this.glow);
  }

  // Bob, spin and pulse. Sets `dead` when its lifetime runs out; main.js
  // removes dead pickups from its list on the same pass.
  update(dt, time) {
    if (this.dead) return;

    const age = time - this.spawnTime;
    if (age >= this.despawnTime) {
      this.destroy();
      return;
    }

    // The last few seconds blink. Visibility is toggled rather than faded
    // because the core and glow materials are shared by every pickup of this
    // type - dimming one would dim all of them (see rule 2 at the top).
    const remaining = this.despawnTime - age;
    const on = remaining > PICKUP_BLINK_TIME || (remaining * BLINK_RATE) % 1 > 0.45;
    if (this.core.visible !== on) {
      this.core.visible = on;
      this.glow.visible = on;
      if (this.dome) this.dome.visible = on;
    }

    const bob = Math.sin(time * 2 + this.bobOffset) * 0.15;
    this.core.position.y = 0.5 + bob;
    this.core.rotation.y += this.rotSpeed * dt;
    this.glow.position.y = 0.7 + bob;
    this.glow.scale.setScalar(1.8 + Math.sin(time * 5 + this.bobOffset) * 0.25);

    if (this.dome) {
      this.dome.position.y = 0.7 + bob;
      this.dome.rotation.y += this.rotSpeed * dt * 0.7;
    }
  }

  // Proximity collection. Compares against the player's FEET position, so the
  // radius is generous enough to catch a player running over it.
  tryPickup(playerPos) {
    return playerPos.distanceTo(this.pos) < 1.2;
  }

  // Removes from the scene only - see rule 2 at the top of this file.
  // Idempotent: pickup and despawn can both reach it.
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.core);
    if (this.dome) this.scene.remove(this.dome);
    this.scene.remove(this.glow);
  }
}

// Powerups granted per wave, scaled off the wave's enemy count. This is a
// budget main.js spends over the wave, not an instant spawn.
export function calcPickupsForWave(wave) {
  return Math.max(1, Math.floor(waveEnemyCount(wave) * 0.15));
}

// Pickups land anywhere on the floor rather than on the enemy spawn grid,
// which put them in the same nine clumps every wave. Two rules shape the roll:
//
//   1. Nothing inside CENTER_KEEPOUT of the origin. That disc is where the
//      totems and stations rise between waves, and a pickup sitting in it
//      either hides behind a pillar or gets collected by accident while the
//      player is reading a draft.
//   2. Nothing inside an obstacle. Boxes are grown by PICKUP_CLEARANCE so a
//      crate-hugging pickup is still reachable from outside the crate.
//
// Rejection sampling: the free area is most of the arena, so this lands on the
// first or second try in practice. The fallback ring exists only so the
// function can never return nothing.
const CENTER_KEEPOUT = 10;
const SPAWN_BOUND = BOUND - 2.5;
const PICKUP_CLEARANCE = 0.8;

function blocked(x, z, obstacles) {
  for (const b of obstacles) {
    if (
      x > b.min.x - PICKUP_CLEARANCE && x < b.max.x + PICKUP_CLEARANCE &&
      z > b.min.z - PICKUP_CLEARANCE && z < b.max.z + PICKUP_CLEARANCE
    ) return true;
  }
  return false;
}

function randomSpawnPos(arena) {
  const obstacles = arena.obstacles;
  for (let i = 0; i < 40; i++) {
    const x = (Math.random() * 2 - 1) * SPAWN_BOUND;
    const z = (Math.random() * 2 - 1) * SPAWN_BOUND;
    if (x * x + z * z < CENTER_KEEPOUT * CENTER_KEEPOUT) continue;
    if (blocked(x, z, obstacles)) continue;
    return new THREE.Vector3(x, 0, z);
  }
  // Every sample was rejected - drop it on the keep-out ring instead, which is
  // open floor by construction.
  const a = Math.random() * Math.PI * 2;
  const r = CENTER_KEEPOUT + 1.5;
  return new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
}

export function spawnPowerup(arena, scene, glowTex, time, playerHealth = 0, playerMaxHealth = 100) {
  const typeKey = pickRandomType(playerHealth, playerMaxHealth);
  return new Powerup(typeKey, randomSpawnPos(arena), scene, glowTex, time);
}

export function spawnAmmo(arena, scene, glowTex, time) {
  return new Powerup('ammo', randomSpawnPos(arena), scene, glowTex, time, AMMO_PICKUP);
}
