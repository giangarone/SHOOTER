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

// MUTATION MARKS. Small faceted gems set into the TOP of the receiver, one lit
// per mutation the gun is carrying, in that mutation's totem colour. It is the
// only readout of a build that does not require opening anything: the gun
// visibly accumulates as the run goes on.
//
// They sit on the top deck rather than the flank because the top is the face
// that stays visible through the whole idle sway and the reload dip, and
// because two rows down the barrel read as a rail of sockets - a natural place
// for something to be set into - where a block on the side read as decal.
//
// around the stone that sells the depth. Flat shading keeps the facets legible
// Each mark is a BLOCK standing on the deck, on a thin plinth. Height is the
// whole point: a flat face, however bright, reads as a sticker, and the thing
// that makes a small object look solid is seeing its top and its sides at once
// with different light on them.
//
// An emissive material defeats that on its own - every face glows equally, so
// a cube lights up as a flat silhouette. So a gem carries TWO materials: the
// top face at full emissive, the four sides at a fraction of it. The sides
// falling into shadow against a bright cap is what gives the block its height.
//
// The plinth is hidden with its gem rather than always shown. Twenty empty
// sockets on a gun that has earned nothing yet reads as damage, not as space
// waiting to be filled.
//
// The gems are built once and toggled, not created per pick, for the same
// reason the models are: a rebuild runs on every draft and would leak a
// material each time. MARK_MAX is the ceiling on markable upgrades in the
// pool; extras beyond it are not shown rather than overflowing the receiver.
const MARK_MAX = 20;
// Half the deck width apart, and far enough down the barrel to clear the grip.
const MARK_X = 0.021;
const MARK_Z0 = 0.15;
const MARK_DZ = 0.031;
// Footprint and height of one block. The walls still have to be a thick enough
// band to catch light - that is what carries the height - so this is about as
// low as a block can go before it reads flat again.
const MARK_W = 0.019;
const MARK_H = 0.0085;

function buildMarks() {
  const g = new THREE.Group();
  g.name = 'marks';
  const gemGeom = new THREE.BoxGeometry(MARK_W, MARK_H, MARK_W);
  const plinthGeom = new THREE.BoxGeometry(MARK_W + 0.007, 0.006, MARK_W + 0.007);
  const plinthMat = mat({ color: 0x11161f, roughness: 0.5, metalness: 0.8 });
  for (let i = 0; i < MARK_MAX; i++) {
    const socket = new THREE.Group();
    // Two columns running down the barrel, near column first so the row the
    // player sees best is the one that fills up first. Sits ON the deck, not
    // in it: the block is meant to stand off the gun.
    socket.position.set(
      i % 2 === 0 ? -MARK_X : MARK_X,
      0.07,
      MARK_Z0 - Math.floor(i / 2) * MARK_DZ
    );
    const plinth = new THREE.Mesh(plinthGeom, plinthMat);
    plinth.position.y = 0.001;
    const side = new THREE.MeshStandardMaterial({
      color: 0x0b0e14, emissive: 0xffffff, emissiveIntensity: 0.28,
      roughness: 0.35, metalness: 0.6,
    });
    const top = new THREE.MeshStandardMaterial({
      color: 0x0b0e14, emissive: 0xffffff, emissiveIntensity: 1.5,
      roughness: 0.2, metalness: 0.5,
    });
    // BoxGeometry groups its faces +x, -x, +y, -y, +z, -z, so index 2 is the
    // cap. Everything else is a wall and stays dim.
    const gem = new THREE.Mesh(gemGeom, [side, side, top, side, side, side]);
    gem.position.y = 0.004 + MARK_H / 2;
    socket.add(plinth, gem);
    socket.userData.faces = [side, top];
    socket.visible = false;
    g.add(socket);
  }
  return g;
}

// Fills the first `colors.length` sockets on a model and empties the rest.
// Called by Player whenever the owned-upgrade list changes.
export function setGunMarks(model, colors) {
  const marks = model.getObjectByName('marks');
  if (!marks) return;
  for (let i = 0; i < marks.children.length; i++) {
    const socket = marks.children[i];
    socket.visible = i < colors.length;
    if (socket.visible) {
      for (const face of socket.userData.faces) face.emissive.setHex(colors[i]);
    }
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
