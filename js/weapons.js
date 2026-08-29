// Weapon definitions and their first-person models.
//
// Pure data plus model builders: no game state. Like ENEMY_TYPES and UPGRADES,
// everything a weapon is lives in one table entry, so adding a fourth gun is
// a stat block plus a build() rather than changes spread across the codebase.
//
// HOW A WEAPON IS USED
//   Player owns two slots and swaps between them. The stats here are BASE
//   values - player.mods multiplies them, so every upgrade in the pool applies
//   to whatever you happen to be holding. That is the whole point of the
//   table: Extended Mag on a 6-shell scattergun is a different decision than
//   on a 30-round rifle, without a single new upgrade.
//
// MODELS ARE BUILT ONCE
//   Player builds every weapon's model at construction, parents them all to
//   the camera, and toggles `visible` on swap. Building a model per swap would
//   allocate geometry for the whole session - the same leak the enemy and
//   pickup caches exist to avoid.
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
const BLACK = { color: 0x0b0e14, roughness: 0.3, metalness: 0.8 };

function mat(spec) {
  return new THREE.MeshStandardMaterial(spec);
}
function accent(hex) {
  return new THREE.MeshStandardMaterial({
    color: 0x0b0e14, emissive: hex, emissiveIntensity: 1.4, roughness: 0.3, metalness: 0.4,
  });
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
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.02, 0.2), accent(0x4ef3ff));
  strip.position.set(0, 0.06, -0.08);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.09), dark);
  grip.position.set(0, -0.14, 0.12);
  grip.rotation.x = 0.3;
  g.add(body, barrel, strip, grip, muzzleAt(0, 0.02, -0.65));
  return g;
}

function buildScattergun() {
  const g = new THREE.Group();
  g.position.set(0.32, -0.28, -0.5);
  const dark = mat(DARK);
  const wood = mat({ color: 0x3a2a1a, roughness: 0.7, metalness: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.15, 0.42), dark);
  // Twin barrels are the silhouette cue - you can tell what you are holding
  // from the viewmodel alone, without reading the HUD.
  const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.46, 8), dark);
  bl.rotation.x = Math.PI / 2;
  bl.position.set(-0.035, 0.03, -0.42);
  const br = bl.clone();
  br.position.x = 0.035;
  const pump = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.06, 0.16), wood);
  pump.position.set(0, -0.04, -0.3);
  const strip = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.02, 0.14), accent(0xffb300));
  strip.position.set(0, 0.07, -0.02);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.1), wood);
  stock.position.set(0, -0.13, 0.14);
  stock.rotation.x = 0.25;
  g.add(body, bl, br, pump, strip, stock, muzzleAt(0, 0.03, -0.66));
  return g;
}

function buildRailgun() {
  const g = new THREE.Group();
  g.position.set(0.3, -0.24, -0.6);
  const dark = mat(DARK);
  const black = mat(BLACK);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.13, 0.44), dark);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.8), black);
  rail.position.set(0, 0.03, -0.6);
  // Three coils along the rail, brightening toward the muzzle.
  const coilGeom = new THREE.TorusGeometry(0.055, 0.014, 6, 10);
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(coilGeom, accent(0xb14aed));
    coil.position.set(0, 0.03, -0.35 - i * 0.22);
    g.add(coil);
  }
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.2, 8), black);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.11, -0.1);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.09), dark);
  grip.position.set(0, -0.15, 0.1);
  grip.rotation.x = 0.28;
  g.add(body, rail, scope, grip, muzzleAt(0, 0.03, -1.02));
  return g;
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
  scattergun: {
    name: 'SCATTERGUN',
    theme: 0xffb300,
    icon: 'shell',
    // 8 x 20 is 160 in one shell with every pellet landing, which only happens
    // point blank - the cone throws most of them away at any real distance.
    // Measured against a chaser (42hp) and a tank (180hp): full damage inside
    // 2m, roughly half at 5m, negligible past 10m.
    //
    // The numbers are set so close-range damage per second beats the rifle's
    // by about a sixth once reloads are counted. An earlier pass had 13 per
    // pellet in a 6-shell magazine, which made the scattergun strictly worse
    // than the starting weapon at every range - the short magazine and long
    // reload eat more sustained damage than the raw per-shell figure suggests.
    damage: 20,
    fireRate: 2,
    magSize: 8,
    reloadTime: 2,
    spread: 0.28,
    pellets: 8,
    pierce: 0,
    falloff: 1,
    auto: false,
    recoil: 0.03,
    kick: 0.24,
    shake: 0.16,
    build: buildScattergun,
    effects: [['8 PELLETS', 0], ['DEVASTATING UP CLOSE', 1], ['WEAK AT RANGE', -1]],
  },
  railgun: {
    name: 'RAILGUN',
    theme: 0xb14aed,
    icon: 'rail',
    // 150 one-shots every enemy in the game except a tank, and keeps doing it
    // down the line behind them. Sustained damage is deliberately poor - the
    // railgun is for burst on a priority target and for line clears, not for
    // holding a trigger.
    damage: 150,
    fireRate: 1,
    magSize: 4,
    reloadTime: 2.4,
    spread: 0.002,
    pellets: 1,
    // Passes through five enemies, losing a quarter of its damage each time.
    pierce: 5,
    falloff: 0.75,
    auto: false,
    recoil: 0.02,
    kick: 0.2,
    shake: 0.18,
    build: buildRailgun,
    effects: [['PIERCES A WHOLE LINE', 1], ['HUGE DAMAGE', 1], ['ONLY 4 ROUNDS', -1]],
  },
};

export const WEAPON_KEYS = Object.keys(WEAPONS);

// The gun every run starts with.
export const STARTING_WEAPON = 'pulseRifle';
