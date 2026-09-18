// Weapon definitions and their first-person models.
//
// Pure data plus model builders: no game state. Like ENEMY_TYPES and PASSIVE_ITEMS,
// everything a weapon is lives in one table entry, so a second gun is a stat
// block plus a build() rather than changes spread across the codebase.
//
// ONE GUN
//   The run carries the Pulse Rifle and nothing else. The table shape is kept
//   because the rest of the code reads stats through it, and because the whole
//   point of the mod system is that passive items multiply BASE values here - a
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

import * as THREE from './vendor/three.module.js';

const DARK = { color: 0x1c212c, roughness: 0.35, metalness: 0.7 };
// The magazine reads a step lighter than the receiver it sits in - see the
// note where it is built.
const MAG = { color: 0x39445f, roughness: 0.5, metalness: 0.55 };
// Grip, handguard and stock are FURNITURE, not machine: near-black, barely
// metal, rough. The hand knows a polymer part from a steel one at a glance,
// and the model reads as assembled rather than extruded because of it.
const POLY = { color: 0x14171f, roughness: 0.8, metalness: 0.15 };
// Barrel, brake, pins, sights: the machined bits. Brighter and smoother than
// the receiver so they catch a rim light where the flats do not.
const STEEL = { color: 0x8b95a6, roughness: 0.3, metalness: 0.85 };
// The pulse cells. One lit part, in the weapon's theme colour - the same hex
// the HUD swatches read - so the gun says what it is called without being a
// lamp. 1.1 is enough for the bloom pass to notice, not enough to read as
// the versus tag (which is brighter, 1.6, and sits on the receiver).
const PULSE_CYAN = 0x4ef3ff;
const CELLS = {
  color: 0x0b0e14, emissive: PULSE_CYAN, emissiveIntensity: 1.1,
  roughness: 0.4, metalness: 0.2,
};

function mat(spec) {
  return new THREE.MeshStandardMaterial(spec);
}

// Every tube in the model points down the barrel, which runs along z.
function tube(r, len, material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), material);
  m.rotation.x = Math.PI / 2;
  return m;
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

// THE RIFLE, PART BY PART.
//
// Still boxes and short cylinders, like everything else in the game - what
// makes it read as a rifle instead of a brick is the part COUNT. A real one
// has a receiver with a rail and sights over it, a handguard ahead of it, a
// grip, trigger and stock behind and below it, and a thin barrel past the
// handguard with something machined on the end. The eye reads the silhouette
// of that list before it reads any one part, so all of them are here at
// roughly true proportion rather than one big one doing all the work.
//
// Local space: the muzzle is -z, the shooter's shoulder is +z, and the -x
// flank is the one the camera sees (the gun rides at x +0.3). The guardrails
// the rest of the code hangs off the model:
//
//   - 'muzzle' marks the shot's origin - main.js puts the flash and the
//     tracers at its world position.
//   - 'mag' is pulled down out of the well and back by _animateReload, which
//     only ever writes its position.y and rotation.x.
//   - 'ptag' is the versus turn strip on the inboard flank - see
//     buildPlayerTag below. The receiver face it mounts on is kept flat and
//     clear of detail for it.
//   - Nothing may pass z +0.36 toward the shoulder. The binding path is the
//     recoil kick - 0.09 straight back with no yaw - against the camera's
//     0.05 near plane from the gun's base 0.55: 0.55 - 0.05 - 0.09 = 0.36.
//     The sprint and melee poses pull further still but yaw the stock
//     inward as they do, so the pad rides no closer than the kick brings it.
function buildPulseRifle() {
  const g = new THREE.Group();
  g.position.set(0.3, -0.26, -0.55);
  const dark = mat(DARK);
  const poly = mat(POLY);
  const steel = mat(STEEL);
  const parts = [];
  const part = (geo, material, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    if (rx) m.rotation.x = rx;
    parts.push(m);
    return m;
  };

  // RECEIVER. Every other line keys off it, so it sits at the origin and its
  // flank stays 0.045 from the axis - the versus tag's seat is written against
  // that number.
  part(new THREE.BoxGeometry(0.09, 0.11, 0.42), dark, 0, -0.005, -0.02);
  // THE RAIL, one run from the rear sight to the handguard's end...
  part(new THREE.BoxGeometry(0.046, 0.016, 0.72), dark, 0, 0.058, -0.17);
  // ...on risers where it crosses the handguard, which leaves a dust gap
  // either side of the strip.
  part(new THREE.BoxGeometry(0.028, 0.012, 0.3), dark, 0, 0.045, -0.385);
  // REAR SIGHT, a notch: two ears with a slot between them. The front post
  // tops out level with the slot floor, so the sightline is level rather
  // than decorative.
  part(new THREE.BoxGeometry(0.012, 0.024, 0.018), steel, -0.017, 0.077, 0.145);
  part(new THREE.BoxGeometry(0.012, 0.024, 0.018), steel, 0.017, 0.077, 0.145);
  // CHARGING HANDLE, the small winged tab across the rear of the receiver.
  part(new THREE.BoxGeometry(0.11, 0.014, 0.024), steel, 0, 0.041, 0.186);
  // EJECTION PORT, a flush steel plate on the visible flank. It ends before
  // the tag's seat begins so the versus strip never has to fight it.
  part(new THREE.BoxGeometry(0.006, 0.032, 0.12), steel, -0.047, 0, -0.1);
  // SELECTOR, a short lever just under the tag.
  part(new THREE.BoxGeometry(0.01, 0.014, 0.04), steel, -0.048, -0.043, 0.07, -0.45);

  // TRIGGER, in its guard, ahead of the grip.
  part(new THREE.BoxGeometry(0.011, 0.036, 0.012), steel, 0, -0.084, 0.05, 0.22);
  part(new THREE.BoxGeometry(0.013, 0.012, 0.125), dark, 0, -0.106, 0.028);
  part(new THREE.BoxGeometry(0.013, 0.052, 0.012), dark, 0, -0.082, -0.028);
  // GRIP, polymer, raked back the way a hand actually takes one.
  part(new THREE.BoxGeometry(0.055, 0.16, 0.082), poly, 0, -0.14, 0.13, 0.3);
  // MAGAZINE WELL, the slight flare the mag slides home into.
  part(new THREE.BoxGeometry(0.064, 0.052, 0.1), dark, 0, -0.06, -0.06);

  // THE MAGAZINE, and it is a named part because the reload ANIMATES it - it
  // drops out of the gun, falls away, and a fresh one rises and seats. See
  // _animateReload in player.js. A reload with nothing to remove and replace
  // is a gun swaying, which is what this one was before the part existed.
  //
  // Lighter than the receiver, and built as a GROUP so it can carry the
  // curve: a straight feed that reaches up into the well and a lower half
  // kicked forward, the banana-mag read that says RIFLE at a glance. The
  // group origin is the point the animation turns and drops, and nothing in
  // it may cost the part's one degree of freedom.
  const magazine = new THREE.Group();
  magazine.name = 'mag';
  magazine.position.set(0, -0.11, -0.06);
  const magBody = mat(MAG);
  const feed = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.1, 0.06), magBody);
  feed.position.set(0, 0.05, 0);
  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.095, 0.055), magBody);
  belly.position.set(0, -0.042, 0.004);
  belly.rotation.x = -0.16;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.016, 0.066), dark);
  plate.position.set(0, -0.096, 0.014);
  plate.rotation.x = -0.16;
  magazine.add(feed, belly, plate);

  // HANDGUARD, polymer, with the pulse cells - thin slits on both flanks.
  // In versus they glow with the player's colour; in solo they stay cyan as
  // the weapon's identity. Grouped so setGunTag can recolour both at once.
  part(new THREE.BoxGeometry(0.078, 0.078, 0.31), poly, 0, 0, -0.385);
  // The front collar - a steel band where guard meets barrel, the joint a
  // real build never hides.
  part(new THREE.BoxGeometry(0.083, 0.083, 0.02), dark, 0, 0, -0.532);
  const cells = new THREE.Group();
  cells.name = 'cells';
  const cellMat = mat(CELLS);
  const cellL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.22), cellMat);
  cellL.position.set(-0.0395, -0.005, -0.385);
  const cellR = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.014, 0.22), cellMat);
  cellR.position.set(0.0395, -0.005, -0.385);
  cells.add(cellL, cellR);
  cells.userData.material = cellMat;
  parts.push(cells);

  // BARREL, the first thing in the build that is round rather than square -
  // which is exactly why the eye finds it instantly.
  const barrel = tube(0.0135, 0.26, steel);
  barrel.position.set(0, 0.008, -0.63);
  parts.push(barrel);
  // GAS BLOCK over the barrel, with the FRONT POST rising from it to meet
  // the rear notch's line.
  part(new THREE.BoxGeometry(0.034, 0.046, 0.034), dark, 0, 0.024, -0.555);
  part(new THREE.BoxGeometry(0.01, 0.032, 0.014), steel, 0, 0.058, -0.555);
  // MUZZLE BRAKE, one fat tube with two proud rings turned into it.
  const brake = tube(0.024, 0.085, dark);
  brake.position.set(0, 0.008, -0.7175);
  parts.push(brake);
  for (const z of [-0.69, -0.745]) {
    const ring = tube(0.0275, 0.012, steel);
    ring.position.set(0, 0.008, z);
    parts.push(ring);
  }

  // STOCK. Compact - a buffer tube, a body and the pad. The pad is the gun's
  // rearmost point (z 0.319) and carries the near-plane guarantee in the
  // header comment.
  const buffer = tube(0.016, 0.13, steel);
  buffer.position.set(0, -0.005, 0.245);
  parts.push(buffer);
  part(new THREE.BoxGeometry(0.052, 0.1, 0.125), poly, 0, -0.008, 0.2525);
  // Cheek riser riding the tube, kept a breath under the rail so the two top
  // lines never z-fight.
  part(new THREE.BoxGeometry(0.046, 0.02, 0.09), poly, 0, 0.048, 0.25);
  part(new THREE.BoxGeometry(0.058, 0.108, 0.024), dark, 0, -0.01, 0.307);

  g.add(...parts, magazine, buildPlayerTag(), muzzleAt(0, 0.008, -0.77));
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
// P1..P8 readout is what names it - see UI.setVersus - and the two read the
// same seat's colour, so the band is a colour the player has already been
// taught.
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

/** Lights the flank strip and pulse cells in `color`, or restores solo state when null. */
export function setGunTag(model, color) {
  const tag = model.getObjectByName('ptag');
  if (!tag) return;
  tag.visible = color != null;
  const cells = model.getObjectByName('cells');
  const cellMat = cells?.userData.material;
  if (color == null) {
    if (cellMat) cellMat.emissive.setHex(PULSE_CYAN);
    return;
  }
  for (const m of tag.children[0].userData.faces) m.emissive.setHex(color);
  if (cellMat) cellMat.emissive.setHex(color);
}

export const WEAPONS = {
  pulseRifle: {
    name: 'PULSE RIFLE',
    // The same hex the handguard's cells glow with, so the HUD's swatch and
    // the gun in hand tell the same colour story.
    theme: PULSE_CYAN,
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
