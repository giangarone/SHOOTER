import * as THREE from 'three';

export const POWERUP_TYPES = {
  ammo: {
    color: 0xffd600,
    emissive: 0xffd600,
    amount: 30,
    apply: (player, time) => {
      player.reserveAmmo = Math.min(player.maxReserve, player.reserveAmmo + 30);
    },
    weight: 0.55,
    sfx: 'pickupAmmo',
  },
  health: {
    color: 0x00e676,
    emissive: 0x00e676,
    amount: 25,
    apply: (player, time) => {
      player.health = Math.min(player.maxHealth + 25, player.health + 25);
    },
    weight: 0.25,
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
    weight: 0.1,
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
    weight: 0.07,
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
    weight: 0.03,
    sfx: 'pickupShield',
  },
};

const TYPE_KEYS = Object.keys(POWERUP_TYPES);
const TYPE_WEIGHTS = TYPE_KEYS.map(k => POWERUP_TYPES[k].weight);
const WEIGHT_SUM = TYPE_WEIGHTS.reduce((a, b) => a + b, 0);
const NORMALIZED_WEIGHTS = TYPE_WEIGHTS.map(w => w / WEIGHT_SUM);

function pickRandomType(playerHealth = 0, playerMaxHealth = 100) {
  const r = Math.random();
  let acc = 0;
  for (let i = 0; i < NORMALIZED_WEIGHTS.length; i++) {
    const key = TYPE_KEYS[i];
    if (key === 'health' && playerHealth >= playerMaxHealth) continue;
    acc += NORMALIZED_WEIGHTS[i];
    if (r <= acc) return key;
  }
  for (let i = TYPE_KEYS.length - 1; i >= 0; i--) {
    if (TYPE_KEYS[i] !== 'health' || playerHealth < playerMaxHealth) {
      return TYPE_KEYS[i];
    }
  }
  return 'ammo';
}

function createHexDomeGeometry(radius = 1.2, height = 1.4) {
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
      const u = s / segments;
      const angle = u * Math.PI * 2;
      positions.push(
        Math.cos(angle) * ringRadius,
        y,
        Math.sin(angle) * ringRadius
      );
    }
  }

  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * segments + s;
      const b = r * segments + (s + 1) % segments;
      const c = (r + 1) * segments + s;
      const d = (r + 1) * segments + (s + 1) % segments;
      indices.push(a, b, d);
      indices.push(d, c, a);
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

  const settings = {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.03,
    bevelThickness: 0.03,
  };
  return new THREE.ExtrudeGeometry(shape, settings);
}

const DOME_GEOM = createHexDomeGeometry();
const PLUS_GEOM = createPlusGeometry();

const GEOMS = {
  ammo: new THREE.OctahedronGeometry(0.35, 0),
  health: PLUS_GEOM,
  damageBoost: new THREE.TetrahedronGeometry(0.38, 0),
  fireRateBoost: new THREE.DodecahedronGeometry(0.32, 0),
  shield: DOME_GEOM,
};

export class Powerup {
  constructor(typeKey, position, scene) {
    this.typeKey = typeKey;
    this.type = POWERUP_TYPES[typeKey];
    this.pos = position.clone();
    this.scene = scene;
    this.spawnTime = performance.now() / 1000;
    this.despawnTime = 60;
    this.dead = false;
    this.bobOffset = Math.random() * Math.PI * 2;
    this.rotSpeed = 0.5 + Math.random() * 0.5;

    const mat = new THREE.MeshStandardMaterial({
      color: this.type.color,
      emissive: this.type.emissive,
      emissiveIntensity: 1.2,
      roughness: 0.3,
      metalness: 0.7,
      transparent: true,
      opacity: 0.9,
    });
    this.core = new THREE.Mesh(GEOMS[typeKey] || GEOMS.ammo, mat);
    this.core.position.copy(this.pos);
    this.core.position.y = 0.5;
    this.scene.add(this.core);

    this.dome = null;
    if (typeKey === 'shield') {
      const domeMat = new THREE.MeshStandardMaterial({
        color: 0x4ef3ff,
        emissive: 0x4ef3ff,
        emissiveIntensity: 0.8,
        roughness: 0.2,
        metalness: 0.8,
        transparent: true,
        opacity: 0.25,
        side: THREE.DoubleSide,
      });
      this.dome = new THREE.Mesh(DOME_GEOM, domeMat);
      this.dome.position.copy(this.pos);
      this.dome.position.y = 0.7;
      this.scene.add(this.dome);
    }

    this.glow = new THREE.PointLight(this.type.color, 8, 6);
    this.glow.position.copy(this.pos);
    this.glow.position.y = 0.7;
    this.scene.add(this.glow);
  }

  update(dt, time) {
    if (this.dead) return;

    const age = time - this.spawnTime;
    if (age >= this.despawnTime) {
      this.destroy();
      return;
    }

    const bob = Math.sin(time * 2 + this.bobOffset) * 0.15;
    this.core.position.y = 0.5 + bob;
    this.core.rotation.y += this.rotSpeed * dt;

    if (this.dome) {
      this.dome.position.y = 0.7 + bob;
      this.dome.rotation.y += this.rotSpeed * dt * 0.7;
      const pulse = 0.15 + Math.sin(time * 4) * 0.05;
      this.dome.material.opacity = 0.25 + pulse;
      this.dome.material.emissiveIntensity = 0.8 + pulse;
    }

    const glowPulse = 0.8 + Math.sin(time * 5) * 0.2;
    this.glow.intensity = 8 * glowPulse;
  }

  tryPickup(playerPos) {
    return playerPos.distanceTo(this.pos) < 1.2;
  }

  destroy() {
    this.dead = true;
    this.scene.remove(this.core);
    this.core.geometry.dispose();
    this.core.material.dispose();
    if (this.dome) {
      this.scene.remove(this.dome);
      this.dome.material.dispose();
    }
    this.scene.remove(this.glow);
  }
}

export function calcPickupsForWave(wave) {
  const count = Math.min(5 + Math.floor(wave * 2.5), 36);
  const shotsNeeded = count * 3;
  const totalAvailable = 60;
  const deficit = Math.max(0, shotsNeeded - totalAvailable);
  const roundsPerPickup = 30;
  return Math.max(1, Math.ceil(deficit / roundsPerPickup));
}

export function spawnPowerup(arena, scene, playerHealth = 0, playerMaxHealth = 100) {
  const typeKey = pickRandomType(playerHealth, playerMaxHealth);
  const sp = arena.spawnPoints[(Math.random() * arena.spawnPoints.length) | 0];
  const jitter = 3;
  const pos = new THREE.Vector3(
    sp.x + (Math.random() - 0.5) * jitter,
    0,
    sp.z + (Math.random() - 0.5) * jitter
  );
  return new Powerup(typeKey, pos, scene);
}