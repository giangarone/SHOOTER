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
//   spread      HIP-FIRE cone, in NDC; pellets are scattered inside it
//   aimSpread   the same cone with the gun raised - see the ADS block in
//               player.js. The gap between the two is what aiming BUYS, and it
//               is meant to be wide enough to feel: a gun that shot the same
//               either way would make the whole mechanic decoration
//   pellets     raycasts per shot
//   pierce      extra enemies a shot passes through after the first
//   falloff     damage multiplier applied per enemy already pierced
//   auto        true holds to fire, false needs a fresh click per shot
//   recoil      radians of upward pitch kick per shot

import * as THREE from 'three';

const DARK = { color: 0x1c212c, roughness: 0.35, metalness: 0.7 };
// The magazine reads a step lighter than the receiver it sits in - see the
// note where it is built.
const MAG = { color: 0x39445f, roughness: 0.5, metalness: 0.55 };

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
  // THE MAGAZINE, and it is a named part because the reload ANIMATES it - it
  // drops out of the gun, falls away, and a fresh one rises and seats. See
  // _animateReload in player.js. A reload with nothing to remove and replace
  // is a gun swaying, which is what this one was before the part existed.
  //
  // Lighter than the receiver and cut across its front face, so the thing
  // leaving the weapon is legible as a separate object in the half-second it
  // is on screen rather than as a corner of the gun coming loose.
  const magazine = new THREE.Mesh(
    new THREE.BoxGeometry(0.055, 0.18, 0.08), mat(MAG)
  );
  magazine.name = 'mag';
  magazine.position.set(0, -0.11, -0.04);
  g.add(body, barrel, grip, magazine, buildPlayerTag(), muzzleAt(0, 0.02, -0.65));
  return g;
}

// THE PLAYER TAG. A lit strip down the INBOARD flank of the receiver, in the
// colour of whoever is holding the gun. Versus only; hidden in solo, where the
// question it answers cannot come up.
//
// WHY THE GUN AND NOT ONLY THE HUD. Whose turn it is has to be answerable
// without looking away from the crosshair, and it has to stay answerable for a
// whole wave rather than for the three seconds a title card is up. The gun is
// the one object that is on screen every frame of every fight, so a band of
// colour on it is a fact the player stops having to check.
//
// THE INBOARD FACE, at -x: the model sits at x = +0.3, so the flank turned
// towards the centre of the screen is the one the camera actually sees. A
// strip on the outboard side would be lit for nobody.
//
// Deliberately a BAR and not a "P1" glyph. At this size, in a first-person
// view, two characters are a smear; a solid band of one colour is legible in
// peripheral vision, which is where it will actually be read. The HUD's own
// P1/P2 readout is what names it - see UI.setVersus - and the two are the same
// two colours, so the band is a colour the player has already been taught.
const TAG_W = 0.006;
const TAG_H = 0.05;
const TAG_L = 0.17;

function buildPlayerTag() {
  const g = new THREE.Group();
  g.name = 'ptag';
  // Two materials for the same reason a passive item mark carries two: the
  // narrow edges falling darker than the face is what stops a lit rectangle
  // reading as a decal printed on the side of the gun.
  const face = new THREE.MeshStandardMaterial({
    color: 0x0b0e14, emissive: 0xffffff, emissiveIntensity: 1.6,
    roughness: 0.25, metalness: 0.5,
  });
  const edge = new THREE.MeshStandardMaterial({
    color: 0x0b0e14, emissive: 0xffffff, emissiveIntensity: 0.3,
    roughness: 0.4, metalness: 0.6,
  });
  // BoxGeometry face order is +x, -x, +y, -y, +z, -z: -x is the one turned to
  // the camera, so it carries the bright material and the rest are walls.
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(TAG_W, TAG_H, TAG_L),
    [edge, face, edge, edge, edge, edge]
  );
  bar.userData.faces = [face, edge];
  g.add(bar);
  g.position.set(-0.046, 0.005, 0.06);
  g.visible = false;
  return g;
}

/** Lights the flank strip in `color`, or hides it entirely when null. */
export function setGunTag(model, color) {
  const tag = model.getObjectByName('ptag');
  if (!tag) return;
  tag.visible = color != null;
  if (color == null) return;
  for (const m of tag.children[0].userData.faces) m.emissive.setHex(color);
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
    // Loose from the hip and near-perfect down the sights. This is the cone
    // STANDING STILL - moving opens it further and a sprint roughly doubles
    // it, see _shotSpread in main.js - and it is wide enough that hip-firing
    // past room range is a spray rather than a shot. That is the point: the
    // gun is not meant to be good until it is raised.
    spread: 0.085,
    aimSpread: 0.004,
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
