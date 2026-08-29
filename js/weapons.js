// Weapon definitions and their first-person models.
//
// Pure data plus model builders: no game state. Like ENEMY_TYPES and UPGRADES,
// everything a weapon is lives in one table entry, so a second gun is a stat
// block plus a build() rather than changes spread across the codebase.
//
// ONE GUN
//   The run carries the Pulse Rifle and nothing else. The table shape is kept
//   because the rest of the code reads stats through it, and because the whole
//   point of the mod system is that upgrades multiply BASE values here - a
//   second entry would need no changes outside this file and player.slots.
//
// MODELS ARE BUILT ONCE
//   Player builds the model at construction and parents it to the camera.
//   Building one per equip would allocate geometry for the whole session - the
//   same leak the enemy and pickup caches exist to avoid.
//
// FIELDS
//   damage      per bullet, or per pellet on a multi-pellet weapon
//   fireRate    shots per second
//   spread      NDC cone half-width; pellets are scattered inside it
//   pellets     raycasts per shot
//   pierce      extra enemies a shot passes through after the first
//   falloff     damage multiplier applied per enemy already pierced
//   auto        true holds to fire, false needs a fresh click per shot
//   recoil      radians of upward pitch kick per shot

import * as THREE from 'three';

const DARK = { color: 0x1c212c, roughness: 0.35, metalness: 0.7 };

function mat(spec) {
  return new THREE.MeshStandardMaterial(spec);
}

// Every model puts an empty named 'muzzle' where the barrel ends. main.js
// reads its world position for the muzzle flash and the tracer origin, so a
// model without one will throw on the first shot.
function muzzleAt(x, y, z) {
  const m = new THREE.Object3D();
  m.name = 'muzzle';
  m.position.set(x, y, z);
  return m;
}

function buildPulseRifle() {
  const g = new THREE.Group();
  g.position.set(0.3, -0.26, -0.55);
  const dark = mat(DARK);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.5), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), dark);
  barrel.position.set(0, 0.02, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.14, 0.12);
  grip.rotation.x = 0.3;
  g.add(body, barrel, grip, buildMarks(), muzzleAt(0, 0.02, -0.65));
  return g;
}

// MUTATION MARKS. A grid of small emissive plates on the left flank of the
// receiver - the face the camera actually sees - one lit per mutation the gun
// is carrying, in that mutation's totem colour. It is the only readout of a
// build that does not require opening anything: the gun visibly accumulates.
//
// The plates are built once and toggled, not created per pick, for the same
// reason the models are: a rebuild runs on every draft and would leak a
// material each time. MARK_MAX is the number of markable upgrades in the pool;
// extras beyond it are simply not shown rather than overflowing the receiver.
const MARK_MAX = 12;
const MARK_COLS = 4;

function buildMarks() {
  const g = new THREE.Group();
  g.name = 'marks';
  const geom = new THREE.BoxGeometry(0.008, 0.03, 0.03);
  for (let i = 0; i < MARK_MAX; i++) {
    const m = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
      color: 0x0b0e14, emissive: 0xffffff, emissiveIntensity: 1.6,
      roughness: 0.3, metalness: 0.4,
    }));
    // Filled left to right along the barrel, then down a row.
    m.position.set(-0.05, 0.04 - Math.floor(i / MARK_COLS) * 0.04, 0.06 - (i % MARK_COLS) * 0.045);
    m.visible = false;
    g.add(m);
  }
  return g;
}

// Lights the first `colors.length` plates on a model and hides the rest.
// Called by Player whenever the owned-upgrade list changes.
export function setGunMarks(model, colors) {
  const marks = model.getObjectByName('marks');
  if (!marks) return;
  for (let i = 0; i < marks.children.length; i++) {
    const m = marks.children[i];
    m.visible = i < colors.length;
    if (m.visible) m.material.emissive.setHex(colors[i]);
  }
}

export const WEAPONS = {
  pulseRifle: {
    name: 'PULSE RIFLE',
    theme: 0x4ef3ff,
    icon: 'gun',
    damage: 34,
    fireRate: 8,
    magSize: 30,
    reloadTime: 1.4,
    spread: 0.024,
    pellets: 1,
    pierce: 0,
    falloff: 1,
    auto: true,
    recoil: 0.006,
    kick: 0.09,
    shake: 0.05,
    build: buildPulseRifle,
    effects: [['BALANCED, FULL AUTO', 0], ['30 ROUNDS', 0]],
  },
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

// The gun every run starts with.
export const STARTING_WEAPON = 'pulseRifle';
