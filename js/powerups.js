// Pickups: ammo crates and the four powerups.
//
// A pickup is a floating mesh plus an additive glow sprite. It is collected by
// proximity (no raycast) and despawns after PICKUP_LIFETIME.
//
// Adding a type means: an entry in POWERUP_TYPES with a per-kill `chance` and
// an `sfx` name that matches a method on SFX, and an `icon` naming a drawing in
// tools/pixelart/icons.py. `apply(player, time)` mutates the player directly;
// timed buffs set an end time that Player.update() watches for.
//
// PICKUPS ARE PIXEL ART. Each one is the same extruded 24x24 plate the totems
// wear, built once per type and cloned per instance so the geometry cache is
// hit exactly six times in a run. They face the player rather than spinning:
// a flat plate on a spin turns edge-on twice a revolution and disappears, and
// a pickup that vanishes for a third of every second in a firefight is worse
// than one with no animation at all.
//
// TWO RULES THAT COST A LOT WHEN BROKEN:
//   1. Never give a pickup a real light. three.js keys shader programs on the
//      scene's light count, so spawning one recompiles every material in the
//      scene. That is what the glow sprite is for.
//   2. Geometries and materials here are shared by every instance and are
//      never disposed. destroy() only removes objects from the scene. Calling
//      dispose() on them would break every other pickup of that type.

import * as THREE from 'three';
import { buildPixelIcon } from './pixelicons.js';
import { BOUND } from './arena.js';

export const POWERUP_TYPES = {
  health: {
    color: 0x00e676,
    emissive: 0x00e676,
    amount: 25,
    apply: (player) => {
      player.health = Math.min(player.maxHealth + 25, player.health + 25);
    },
    chance: 0.04,
    needy: 0.10,
    icon: 'pickHealth',
    sfx: 'pickupHealth',
  },
  // RAGE. Damage AND movement, on one clock. The red pickup used to be the
  // only buff that changed nothing about how the player moved, which made it
  // the one you could take without changing how you played; +30% speed turns
  // it into a window to push into the crowd with rather than a number.
  damageBoost: {
    color: 0xff3d00,
    emissive: 0xff3d00,
    duration: 10,
    apply: (player, time) => {
      player.damageMult = 1.5;
      player.rageSpeedMult = 1.3;
      player.damageBoostEnd = time + 10;
    },
    chance: 0.015,
    icon: 'pickDamage',
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
    chance: 0.015,
    icon: 'pickRate',
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
    chance: 0.008,
    icon: 'pickShield',
    sfx: 'pickupShield',
  },
  // MAGNET. Every money orb on the floor, at once, wherever it is - the same
  // sweep the end of a wave does, bought early. It has no duration and no
  // stat: it is a button that pays out, which is why it can afford to be
  // rarer than the buffs without ever feeling like a wasted drop.
  //
  // main.js handles the sweep itself (see _updatePickups): the orbs are not
  // the player's and apply() only ever gets the player.
  magnet: {
    color: 0xb14aed,
    emissive: 0xb14aed,
    chance: 0.012,
    icon: 'pickMagnet',
    apply: () => {},
    sfx: 'pickupMagnet',
  },
};

// Ammo is deliberately not in POWERUP_TYPES: it is not one of the buffs, and
// rollDrop gives it a need term and a cap of its own.
export const AMMO_PICKUP = {
  color: 0xffd600,
  emissive: 0xffd600,
  amount: 45,
  chance: 0.06,
  needy: 0.12,
  icon: 'pickAmmo',
  apply: (player) => {
    player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 45);
  },
  sfx: 'pickupAmmo',
};

// How long a pickup sits in the arena before it fades out, in game seconds,
// and how many of those final seconds it spends blinking. The blink is the
// only warning the player gets, so it starts well before the pickup goes.
//
// Short, because pickups are DROPPED where enemies die rather than placed
// around the map: one lands next to the fight and is meant to be taken as part
// of it, not banked and walked back to three waves later.
export const PICKUP_LIFETIME = 30;
export const PICKUP_BLINK_TIME = 5;
// Blinks per second during that window. Fast enough to read as urgent from
// across the arena without strobing.
const BLINK_RATE = 5;

// WHAT A KILL DROPS.
//
// There is no budget any more. A wave used to carry a fixed number of pickups
// (0.3 per enemy) spread across its kills, which made the loot per wave a
// constant and every kill's chance a function of how many enemies were left.
// That guaranteed two runs of the same wave the same amount of loot - a real
// property, and the reason it was built that way - but it also meant the drops
// arrived on a schedule, and a schedule is something a player learns to wait
// out rather than to be surprised by.
//
// So: every kill rolls each drop INDEPENDENTLY, at a flat chance, and nothing
// is remembered between kills. A wave can be dry and the next can be generous,
// which is the point.
//
// Health and ammo, and only those two, get a need term on top: `chance` is
// what they roll at on a full bar and `chance + needy` is what they roll at on
// an empty one, squared between the two so the pull is gentle at three
// quarters full and steep near empty. The buffs never scale - a player who is
// doing badly gets more of what keeps them alive, not more damage.
//
// ONE DROP PER KILL AT MOST. The categories are rolled in need order and the
// first hit wins, so a kill can never carpet the floor, and the rarer buffs
// are never crowded out by a needy player's ammo roll being tested first -
// they are simply less likely than it, which is what the numbers say.

// The order categories are offered in. Need first: a starving player's ammo
// matters more than a shield they will not live to use.
const ROLL_ORDER = ['ammo', 'health', 'damageBoost', 'fireRateBoost', 'magnet', 'shield'];

// The need curve. `frac` is how full the bar is; the result is 0 at full and 1
// at empty, squared so it stays out of the way until things are actually bad.
function needScale(frac) {
  const lack = Math.max(0, 1 - frac);
  return lack * lack;
}

/**
 * Rolls one kill's drop.
 *
 * @param {number} hpFrac    health / maxHealth
 * @param {number} ammoFrac  (reserve + mag) / maxReserve
 * @param {boolean} allowAmmo false when the arena already holds as much loose
 *   ammo as it should. An empty player killing a whole wave would otherwise
 *   carpet the floor in crates, all of one shape, most of them redundant by
 *   the time the second is collected.
 * @returns {string|null} a spawnable type key, or null for nothing at all -
 *   which is what most kills return.
 */
export function rollDrop(hpFrac, ammoFrac, allowAmmo = true) {
  for (const key of ROLL_ORDER) {
    if (key === 'ammo' && !allowAmmo) continue;
    const def = key === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[key];
    let p = def.chance;
    if (def.needy) {
      p += def.needy * needScale(key === 'ammo' ? ammoFrac : hpFrac);
    }
    if (Math.random() < p) return key;
  }
  return null;
}

/**
 * The chance a single kill drops anything at all, for tests and for tuning.
 * Exact rather than a sum: the categories are independent rolls, so this is
 * one minus the chance every one of them misses.
 */
export function dropChance(hpFrac, ammoFrac, allowAmmo = true) {
  let miss = 1;
  for (const key of ROLL_ORDER) {
    if (key === 'ammo' && !allowAmmo) continue;
    const def = key === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[key];
    let p = def.chance;
    if (def.needy) {
      p += def.needy * needScale(key === 'ammo' ? ammoFrac : hpFrac);
    }
    miss *= 1 - p;
  }
  return 1 - miss;
}

// PIXEL PLATES. One extruded 24x24 icon per type, built once and cloned per
// pickup: pixelicons.js caches the geometry by key+colour, so six calls in a
// run cover every pickup the arena will ever hold, and a clone shares both the
// geometry and the material with its template. Nothing here is ever disposed -
// see rule 2 at the top of this file.
// The plate comes out of pixelicons.js at ~0.62m across (24 pixels at PX), so
// this is a fraction of a metre and not a pixel size - a pickup a little
// smaller than a totem's icon, which is what it should read as.
const ICON_SCALE = 0.85;
const iconTemplates = new Map();
function pickupIcon(typeKey, def) {
  let t = iconTemplates.get(typeKey);
  if (!t) {
    t = buildPixelIcon(def.icon, def.color);
    t.scale.setScalar(ICON_SCALE);
    iconTemplates.set(typeKey, t);
  }
  return t.clone();
}

const glowMats = new Map();
function glowMaterial(typeKey, def, glowTex) {
  let m = glowMats.get(typeKey);
  if (!m) {
    m = new THREE.SpriteMaterial({
      map: glowTex,
      color: def.color,
      transparent: true,
      // Softer than it used to be. The plate IS the pickup now, and a halo
      // bright enough to be the thing you see from across the room was also
      // bright enough to wash the drawing out from two metres away.
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    glowMats.set(typeKey, m);
  }
  return m;
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

    this.core = pickupIcon(typeKey, this.type);
    this.core.position.set(this.pos.x, 0.62, this.pos.z);
    scene.add(this.core);

    // An additive sprite instead of a PointLight: a real light would change the
    // scene's light count on every spawn/despawn, which forces three.js to
    // recompile every material in the scene and stalls the frame.
    this.glow = new THREE.Sprite(glowMaterial(typeKey, this.type, glowTex));
    this.glow.scale.setScalar(1.15);
    this.glow.position.set(this.pos.x, 0.7, this.pos.z);
    scene.add(this.glow);
  }

  // Bob, face, and pulse. Sets `dead` when its lifetime runs out; main.js
  // removes dead pickups from its list on the same pass.
  //
  // `facing` is where the player is standing, so the plate can turn to them.
  update(dt, time, facing = null) {
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
    }

    const bob = Math.sin(time * 2 + this.bobOffset) * 0.15;
    this.core.position.y = 0.62 + bob;
    // Turned to the player, not spun. A flat plate on a spin is edge-on twice
    // a revolution, and a pickup that disappears for a third of every second
    // in a firefight is worse than one that never moves at all. The tilt is
    // what stops it reading as a decal painted on the air.
    if (facing) {
      this.core.rotation.y = Math.atan2(facing.x - this.pos.x, facing.z - this.pos.z);
    }
    this.core.rotation.z = Math.sin(time * 1.6 + this.bobOffset) * 0.09;
    this.glow.position.y = 0.7 + bob;
    this.glow.scale.setScalar(1.15 + Math.sin(time * 5 + this.bobOffset) * 0.18);
  }

  // Proximity collection. Compares against the player's FEET position, so the
  // radius is generous enough to catch a player running over it.
  tryPickup(playerPos) {
    return playerPos.distanceTo(this.pos) < 1.2;
  }

  // Dragged toward the player by the same magnet that collects money orbs -
  // see _magnetPickups in main.js. Every mesh has to be moved, not just `pos`:
  // the x and z of the plate and its glow are written once at construction
  // and only their y is touched per frame.
  moveTo(x, z) {
    this.pos.x = x;
    this.pos.z = z;
    this.core.position.x = x;
    this.core.position.z = z;
    this.glow.position.x = x;
    this.glow.position.z = z;
  }

  // Removes from the scene only - see rule 2 at the top of this file.
  // Idempotent: pickup and despawn can both reach it.
  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.scene.remove(this.core);
    this.scene.remove(this.glow);
  }
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

// A pickup left exactly where something died. The position comes from an enemy
// whose own collision has already pushed it clear of obstacles, so there is
// nothing to resolve here - it only needs clamping inside the arena bound in
// case the kill happened against a wall.
export function spawnDropAt(typeKey, pos, scene, glowTex, time) {
  const B = SPAWN_BOUND;
  const at = new THREE.Vector3(
    Math.max(-B, Math.min(B, pos.x)), 0, Math.max(-B, Math.min(B, pos.z))
  );
  return new Powerup(typeKey, at, scene, glowTex, time, defFor(typeKey));
}

// The safety-net spawn. Placed in a ring around the player rather than
// anywhere on the map: it exists because the player is in trouble with no
// kills coming, and a health pack twenty metres away is no help at all. Close
// enough to reach under pressure, far enough that it still has to be walked to.
export function spawnRelief(typeKey, arena, near, scene, glowTex, time) {
  for (let i = 0; i < 30; i++) {
    const ang = Math.random() * Math.PI * 2;
    const rad = 6 + Math.random() * 5;
    const x = near.x + Math.cos(ang) * rad;
    const z = near.z + Math.sin(ang) * rad;
    if (Math.abs(x) > SPAWN_BOUND || Math.abs(z) > SPAWN_BOUND) continue;
    if (blocked(x, z, arena.obstacles)) continue;
    return new Powerup(typeKey, new THREE.Vector3(x, 0, z), scene, glowTex, time, defFor(typeKey));
  }
  // Nowhere clear nearby - fall back to open floor anywhere rather than
  // withholding the one pickup meant to stop a death spiral.
  return new Powerup(typeKey, randomSpawnPos(arena), scene, glowTex, time, defFor(typeKey));
}

// Ammo lives outside POWERUP_TYPES (see the note on AMMO_PICKUP), so every
// spawner that takes a type key has to resolve it through here.
function defFor(typeKey) {
  return typeKey === 'ammo' ? AMMO_PICKUP : POWERUP_TYPES[typeKey];
}
