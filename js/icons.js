// Small 3D icons for the wave-end totems: one recognisable object per offer,
// turning inside that offer's column of light and tinted to match it.
// A totem is read from across the arena, at a glance, mid-fight - the icon is
// what carries when the text is still too small to make out, so it has to be
// a silhouette rather than a model. Six or seven parts is the budget.
//
// ONE SHAPE PER OFFER. NEVER TWO OFFERS ON ONE SHAPE.
//   The pool used to run three or four mutations onto the same icon - a bolt
//   meant Overclock, Arc Rounds, Lightning Wizard AND Overload - which is
//   worse than having no icon at all: the player learns the shape means one
//   thing and is then handed a different one. test/icons.mjs enforces this and
//   also catches the silent version of the failure, an `icon:` naming a shape
//   that does not exist, which buildIcon() quietly answers with `shard`.
//
// AN ICON'S IDENTITY CANNOT BE ITS NEGATIVE SPACE.
//   It turns inside a shaft of light wearing the SAME theme colour, so any gap
//   you are meant to see through is filled in by the lit haze behind it. A
//   horseshoe magnet drawn as a ring with its lower arc masked is a perfect
//   horseshoe on a contact sheet and a filled blob on a totem. Carry the shape
//   in solid strokes; see `magnet`.
//
// PERFORMANCE, same rules as totems.js and arena.js:
//   * Every icon is assembled from ONE shared set of unit primitives - box,
//     sphere, cone, cylinder, torus, and three polyhedra - scaled and rotated
//     per part. Eight geometries cover the whole catalogue, so adding an icon
//     costs nothing on the GPU. Never build a bespoke geometry here.
//   * The dark and pale materials are shared. Only the glow material, which
//     carries the theme colour, is per icon - that is one material per
//     (totem, offer) pair, and totems.js caches those, so the count is bounded
//     by the size of the upgrade pool rather than by how long the run lasts.
//   * Nothing is ever disposed because nothing is ever discarded: a totem
//     keeps the icons it has built and toggles their visibility.

import * as THREE from 'three';

const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

// Unit primitives, all roughly 1 across so a part's scale reads as its size.
const BOX = () => geo('box', () => new THREE.BoxGeometry(1, 1, 1));
const SPHERE = () => geo('sphere', () => new THREE.SphereGeometry(0.5, 12, 10));
const CONE = () => geo('cone', () => new THREE.ConeGeometry(0.5, 1, 10));
const CYL = () => geo('cyl', () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12));
const TORUS = () => geo('torus', () => new THREE.TorusGeometry(0.4, 0.1, 8, 16));
const OCTA = () => geo('octa', () => new THREE.OctahedronGeometry(0.5, 0));
const TETRA = () => geo('tetra', () => new THREE.TetrahedronGeometry(0.5, 0));
const ICOSA = () => geo('icosa', () => new THREE.IcosahedronGeometry(0.5, 0));

const DARK = new THREE.MeshStandardMaterial({ color: 0x1b2130, roughness: 0.45, metalness: 0.75 });
const PALE = new THREE.MeshStandardMaterial({
  color: 0xdfe8ff, emissive: 0x9fb4d8, emissiveIntensity: 0.35, roughness: 0.3, metalness: 0.4,
});

// Builders receive `add`, which places one part, and the three materials.
// add(geometry, material, position, scale, rotation) - scale and rotation are
// optional and default to unit / none.
function makeAdder(group) {
  return function add(g, mat, p, s, r) {
    const m = new THREE.Mesh(g, mat);
    m.position.set(p[0], p[1], p[2]);
    if (s) m.scale.set(s[0], s[1], s[2]);
    if (r) m.rotation.set(r[0], r[1], r[2]);
    group.add(m);
    return m;
  };
}

// One entry per icon. Keys are referenced by `icon:` in upgrades.js and
// weapons.js; an unknown key falls back to `shard`.
const ICONS = {
  // Fire rate, arc damage: a lightning bolt.
  bolt(add, glow) {
    add(BOX(), glow, [0.07, 0.17, 0], [0.13, 0.3, 0.09], [0, 0, 0.35]);
    add(BOX(), glow, [0, 0, 0], [0.32, 0.1, 0.09], [0, 0, 0.7]);
    add(BOX(), glow, [-0.07, -0.17, 0], [0.13, 0.3, 0.09], [0, 0, 0.35]);
  },
  // Magazine capacity: a box magazine with a round showing.
  magazine(add, glow) {
    add(BOX(), DARK, [0, -0.04, 0], [0.24, 0.44, 0.16]);
    add(BOX(), glow, [0, 0.24, 0], [0.13, 0.14, 0.13]);
    add(BOX(), glow, [0, -0.06, 0.09], [0.05, 0.3, 0.02]);
  },
  // Reload speed: a loose cartridge.
  shell(add, glow) {
    add(CYL(), glow, [0, -0.07, 0], [0.19, 0.32, 0.19]);
    add(CONE(), PALE, [0, 0.19, 0], [0.19, 0.22, 0.19]);
    add(TORUS(), DARK, [0, -0.21, 0], [0.42, 0.42, 0.42], [Math.PI / 2, 0, 0]);
  },
  // Raw damage: a bullet with the tip opened up.
  bullet(add, glow) {
    add(CYL(), DARK, [0, -0.08, 0], [0.18, 0.3, 0.18]);
    add(CONE(), glow, [0, 0.17, 0], [0.18, 0.26, 0.18]);
    add(CONE(), DARK, [0, 0.3, 0], [0.09, 0.12, 0.09]);
  },
  // Healing: a medical cross.
  cross(add, glow) {
    add(BOX(), glow, [0, 0, 0], [0.14, 0.42, 0.12]);
    add(BOX(), glow, [0, 0, 0], [0.42, 0.14, 0.12]);
    add(BOX(), PALE, [0, 0, 0.07], [0.08, 0.08, 0.04]);
  },
  // Max health, mitigation: a kite shield.
  shield(add, glow) {
    add(BOX(), glow, [0, 0.08, 0], [0.36, 0.32, 0.08]);
    add(CONE(), glow, [0, -0.2, 0], [0.36, 0.24, 0.08], [Math.PI, 0, 0]);
    add(BOX(), DARK, [0, 0.02, 0.05], [0.1, 0.36, 0.03]);
  },
  // Retaliation: the same shield, throwing spikes.
  spikeShield(add, glow) {
    add(BOX(), DARK, [0, 0.08, 0], [0.3, 0.28, 0.07]);
    add(CONE(), DARK, [0, -0.18, 0], [0.3, 0.2, 0.07], [Math.PI, 0, 0]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      add(CONE(), glow, [Math.cos(a) * 0.26, Math.sin(a) * 0.26, 0], [0.11, 0.2, 0.11], [0, 0, -a + Math.PI / 2]);
    }
  },
  // Ammo economy: an open crate with the rounds standing up in it. The crate
  // takes the theme colour and the rounds are pale - the reverse reads as a
  // dark slab against a column already wearing that same colour.
  ammoBox(add, glow) {
    add(BOX(), glow, [0, -0.1, 0], [0.44, 0.28, 0.3]);
    add(BOX(), DARK, [0, -0.1, 0.16], [0.3, 0.14, 0.02]);
    for (let i = -1; i <= 1; i++) {
      add(CYL(), PALE, [i * 0.13, 0.12, 0], [0.1, 0.28, 0.1]);
      add(CONE(), DARK, [i * 0.13, 0.29, 0], [0.1, 0.1, 0.1]);
    }
  },
  // Move speed: a syringe.
  syringe(add, glow) {
    add(CYL(), PALE, [0, 0, 0], [0.14, 0.36, 0.14], [0, 0, 0.5]);
    add(CYL(), glow, [-0.05, -0.1, 0], [0.11, 0.2, 0.11], [0, 0, 0.5]);
    add(CONE(), PALE, [0.12, 0.25, 0], [0.04, 0.18, 0.04], [0, 0, -0.5]);
    add(BOX(), DARK, [-0.13, -0.26, 0], [0.2, 0.05, 0.05], [0, 0, 0.5]);
  },
  // Lifesteal: a falling drop.
  drop(add, glow) {
    add(SPHERE(), glow, [0, -0.08, 0], [0.36, 0.36, 0.36]);
    add(CONE(), glow, [0, 0.16, 0], [0.26, 0.34, 0.26]);
    add(SPHERE(), PALE, [-0.07, -0.1, 0.13], [0.08, 0.08, 0.08]);
  },
  // Fire rate on kill: three claw marks.
  claw(add, glow) {
    for (let i = -1; i <= 1; i++) {
      add(CONE(), glow, [i * 0.14, i * 0.03, 0], [0.08, 0.44, 0.08], [0, 0, -0.25 + i * 0.18]);
    }
  },
  // Ammo regeneration: a gear.
  gear(add, glow) {
    add(TORUS(), glow, [0, 0, 0], [0.66, 0.66, 0.66]);
    add(CYL(), DARK, [0, 0, 0], [0.18, 0.12, 0.18], [Math.PI / 2, 0, 0]);
    // The teeth sit outside the ring's outer edge (0.33 at this scale), not
    // inside it, or the whole thing reads as a plain washer.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(BOX(), PALE, [Math.cos(a) * 0.35, Math.sin(a) * 0.35, 0], [0.13, 0.13, 0.11], [0, 0, a]);
    }
  },
  // Damage from movement: a stack of chevrons.
  chevron(add, glow) {
    for (let i = 0; i < 2; i++) {
      const y = -0.12 + i * 0.22;
      add(BOX(), i ? glow : PALE, [-0.1, y, 0], [0.26, 0.09, 0.09], [0, 0, 0.7]);
      add(BOX(), i ? glow : PALE, [0.1, y, 0], [0.26, 0.09, 0.09], [0, 0, -0.7]);
    }
  },
  // Poison: a stoppered flask, bubbling.
  flask(add, glow) {
    add(SPHERE(), glow, [0, -0.1, 0], [0.38, 0.38, 0.38]);
    add(CYL(), PALE, [0, 0.16, 0], [0.13, 0.24, 0.13]);
    add(CYL(), DARK, [0, 0.3, 0], [0.16, 0.08, 0.16]);
    add(SPHERE(), PALE, [0.08, -0.04, 0.12], [0.07, 0.07, 0.07]);
    add(SPHERE(), PALE, [-0.06, -0.16, 0.14], [0.05, 0.05, 0.05]);
  },
  // Fire: a flame, pale at the heart.
  flame(add, glow) {
    add(CONE(), glow, [0, 0.02, 0], [0.34, 0.52, 0.34]);
    add(SPHERE(), glow, [0, -0.16, 0], [0.3, 0.26, 0.3]);
    add(CONE(), PALE, [0, -0.06, 0.03], [0.15, 0.26, 0.12]);
  },
  // Cold: an icicle with two shards behind it.
  icicle(add, glow) {
    add(CONE(), glow, [0, -0.04, 0], [0.24, 0.58, 0.24], [Math.PI, 0, 0]);
    add(CONE(), PALE, [-0.16, 0.06, -0.05], [0.13, 0.3, 0.13], [Math.PI, 0, -0.2]);
    add(CONE(), PALE, [0.16, 0.1, -0.05], [0.11, 0.24, 0.11], [Math.PI, 0, 0.2]);
  },
  // Fear: a skull.
  skull(add, glow) {
    add(SPHERE(), glow, [0, 0.06, 0], [0.4, 0.38, 0.36]);
    add(BOX(), glow, [0, -0.19, 0.02], [0.24, 0.14, 0.26]);
    add(SPHERE(), DARK, [-0.1, 0.08, 0.15], [0.12, 0.13, 0.1]);
    add(SPHERE(), DARK, [0.1, 0.08, 0.15], [0.12, 0.13, 0.1]);
    add(BOX(), DARK, [0, -0.16, 0.15], [0.16, 0.05, 0.04]);
  },
  // Freeze: a lump of rough stone.
  stone(add, glow) {
    add(ICOSA(), glow, [0, 0, 0], [0.52, 0.46, 0.5]);
    add(TETRA(), DARK, [0.2, -0.15, 0.1], [0.24, 0.24, 0.24], [0.5, 0.8, 0]);
    add(TETRA(), DARK, [-0.2, 0.14, 0.05], [0.18, 0.18, 0.18], [1.1, 0.3, 0]);
  },
  // Credits: a coin on edge.
  coin(add, glow) {
    add(CYL(), glow, [0, 0, 0], [0.5, 0.09, 0.5], [Math.PI / 2, 0, 0]);
    add(TORUS(), PALE, [0, 0, 0], [0.6, 0.6, 0.3]);
    add(BOX(), DARK, [0, 0, 0.06], [0.08, 0.22, 0.03]);
  },
  // Explosive hits: a bomb with a lit fuse.
  bomb(add, glow) {
    add(SPHERE(), DARK, [0, -0.06, 0], [0.42, 0.42, 0.42]);
    add(CYL(), DARK, [0, 0.19, 0], [0.11, 0.1, 0.11]);
    add(CYL(), glow, [0.06, 0.29, 0], [0.04, 0.16, 0.04], [0, 0, -0.4]);
    add(SPHERE(), glow, [0.12, 0.37, 0], [0.13, 0.13, 0.13]);
  },
  // Corpses that explode: a core throwing shrapnel.
  burst(add, glow) {
    add(SPHERE(), glow, [0, 0, 0], [0.28, 0.28, 0.28]);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(CONE(), glow, [Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0], [0.1, 0.24, 0.1], [0, 0, -a + Math.PI / 2]);
    }
  },
  // Two shots per trigger pull: a crosshair.
  crosshair(add, glow) {
    add(TORUS(), glow, [0, 0, 0], [0.72, 0.72, 0.5]);
    add(BOX(), PALE, [0, 0, 0], [0.5, 0.05, 0.05]);
    add(BOX(), PALE, [0, 0, 0], [0.05, 0.5, 0.05]);
    add(SPHERE(), glow, [0, 0, 0.04], [0.09, 0.09, 0.09]);
  },
  // A free hit each wave: a halo over nothing.
  halo(add, glow) {
    add(TORUS(), glow, [0, 0.2, 0], [0.72, 0.72, 0.72], [Math.PI / 2.3, 0, 0]);
    add(SPHERE(), PALE, [0, -0.1, 0], [0.26, 0.26, 0.26]);
    add(CONE(), PALE, [0, -0.26, 0], [0.3, 0.22, 0.2], [Math.PI, 0, 0]);
  },
  // The extra life: a cat's head.
  cat(add, glow) {
    add(SPHERE(), glow, [0, -0.02, 0], [0.42, 0.38, 0.36]);
    add(CONE(), glow, [-0.16, 0.22, 0], [0.16, 0.22, 0.1]);
    add(CONE(), glow, [0.16, 0.22, 0], [0.16, 0.22, 0.1]);
    add(SPHERE(), DARK, [-0.1, 0.02, 0.15], [0.07, 0.11, 0.06]);
    add(SPHERE(), DARK, [0.1, 0.02, 0.15], [0.07, 0.11, 0.06]);
    add(BOX(), DARK, [0, -0.14, 0.16], [0.14, 0.04, 0.03]);
  },
  // Damage bought with health: a cracked crystal.
  crystal(add, glow) {
    add(OCTA(), glow, [0, 0, 0], [0.4, 0.78, 0.4]);
    add(OCTA(), PALE, [0.18, -0.14, 0.06], [0.18, 0.32, 0.18], [0, 0, 0.4]);
    add(OCTA(), PALE, [-0.17, 0.1, -0.04], [0.14, 0.26, 0.14], [0, 0, -0.3]);
  },
  // Knockback: a hammer, pale head and a glowing collar. A head in the theme
  // colour alone disappears into the column behind it, which wears the same.
  hammer(add, glow) {
    add(BOX(), PALE, [0, 0.17, 0], [0.44, 0.22, 0.22]);
    add(BOX(), glow, [0, 0.17, 0], [0.16, 0.26, 0.26]);
    add(CYL(), DARK, [0, -0.14, 0], [0.1, 0.46, 0.1]);
    add(CYL(), glow, [0, -0.34, 0], [0.13, 0.08, 0.13]);
  },
  // Damage for holding still: a barrel braced on a tripod.
  tripod(add, glow) {
    add(CYL(), PALE, [0, 0.2, 0], [0.09, 0.5, 0.09], [0, 0, Math.PI / 2]);
    add(SPHERE(), glow, [0, 0.08, 0], [0.16, 0.16, 0.16]);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      add(CYL(), glow, [Math.cos(a) * 0.16, -0.16, Math.sin(a) * 0.12], [0.06, 0.42, 0.06],
        [Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45]);
    }
  },

  // A weapon offer: a stubby gun.
  gun(add, glow) {
    add(BOX(), DARK, [0, 0.02, 0], [0.44, 0.16, 0.14]);
    add(CYL(), glow, [0.3, 0.02, 0], [0.07, 0.28, 0.07], [0, 0, Math.PI / 2]);
    add(BOX(), DARK, [-0.14, -0.16, 0], [0.12, 0.24, 0.12], [0, 0, 0.3]);
    add(BOX(), glow, [-0.02, 0.13, 0], [0.16, 0.06, 0.1]);
  },
  // Gravity Rounds: three rings drawing in on one core.
  vortex(add, glow) {
    add(SPHERE(), glow, [0, 0, 0], [0.3, 0.3, 0.3]);
    add(TORUS(), DARK, [0, 0.18, 0], [0.9, 0.9, 0.9], [Math.PI / 2, 0, 0]);
    add(TORUS(), glow, [0, 0, 0], [1.3, 1.3, 1.3], [Math.PI / 2, 0, 0]);
    add(TORUS(), DARK, [0, -0.18, 0], [0.9, 0.9, 0.9], [Math.PI / 2, 0, 0]);
  },
  // Evasion: a swept wing.
  wing(add, glow) {
    add(BOX(), DARK, [0, 0, 0], [0.16, 0.5, 0.16]);
    add(TETRA(), glow, [0.28, 0.1, 0], [0.7, 0.5, 0.3], [0, 0, -0.5]);
    add(TETRA(), glow, [-0.28, 0.1, 0], [0.7, 0.5, 0.3], [0, 0, 0.5]);
  },
  // Ashen: a low cloud of lumps.
  cloud(add, glow) {
    add(SPHERE(), glow, [0, 0, 0], [0.62, 0.5, 0.5]);
    add(SPHERE(), glow, [-0.26, -0.1, 0], [0.42, 0.36, 0.4]);
    add(SPHERE(), glow, [0.26, -0.08, 0], [0.46, 0.38, 0.4]);
    add(SPHERE(), DARK, [0.06, 0.22, 0], [0.36, 0.32, 0.34]);
  },
  // Entropy: an hourglass whose sand has stopped.
  hourglass(add, glow) {
    add(CONE(), glow, [0, 0.2, 0], [0.62, 0.42, 0.62], [Math.PI, 0, 0]);
    add(CONE(), DARK, [0, -0.2, 0], [0.62, 0.42, 0.62]);
    add(BOX(), DARK, [0, 0.44, 0], [0.7, 0.1, 0.7]);
    add(BOX(), DARK, [0, -0.44, 0], [0.7, 0.1, 0.7]);
  },
  // Ammo Hoarder: a drum magazine, seen face on - a fat disc with the feed
  // tower standing off it. The disc takes the theme colour and the tower is
  // dark, so the silhouette is a circle with a notch rather than a plain coin.
  drum(add, glow) {
    add(CYL(), glow, [0, -0.06, 0], [0.66, 0.2, 0.66], [Math.PI / 2, 0, 0]);
    add(TORUS(), DARK, [0, -0.06, 0.02], [1.5, 1.5, 1.5]);
    add(CYL(), DARK, [0, -0.06, 0], [0.2, 0.24, 0.2], [Math.PI / 2, 0, 0]);
    add(BOX(), DARK, [0, 0.34, 0], [0.18, 0.36, 0.18]);
    add(CONE(), PALE, [0, 0.56, 0], [0.16, 0.16, 0.16]);
  },
  // Hot Streak: three bars climbing, the tallest lit. A staircase reads as a
  // running total at a distance in a way an arrow does not.
  stack(add, glow) {
    add(BOX(), DARK, [-0.26, -0.24, 0], [0.2, 0.24, 0.2]);
    add(BOX(), PALE, [0, -0.12, 0], [0.2, 0.48, 0.2]);
    add(BOX(), glow, [0.26, 0.06, 0], [0.2, 0.84, 0.2]);
    add(OCTA(), glow, [0.26, 0.58, 0], [0.24, 0.24, 0.24]);
  },
  // Double Jump: a coiled spring under a plate. Two rings and the plate lifting
  // off them says "again, upward" without needing an arrow.
  spring(add, glow) {
    add(BOX(), DARK, [0, -0.36, 0], [0.62, 0.1, 0.62]);
    add(TORUS(), glow, [0, -0.2, 0], [0.9, 0.9, 0.9], [Math.PI / 2, 0, 0]);
    add(TORUS(), glow, [0, -0.02, 0], [0.9, 0.9, 0.9], [Math.PI / 2, 0, 0]);
    add(BOX(), PALE, [0, 0.16, 0], [0.5, 0.1, 0.5]);
    add(CONE(), glow, [0, 0.4, 0], [0.34, 0.34, 0.34]);
  },
  // Double Dash: two chevrons thrown forward, the leading one lit. Reads as
  // motion in one direction, which is exactly what the mutation does.
  boost(add, glow) {
    add(CONE(), DARK, [-0.26, 0, 0], [0.44, 0.44, 0.44], [0, 0, -Math.PI / 2]);
    add(CONE(), PALE, [0.02, 0, 0], [0.46, 0.44, 0.46], [0, 0, -Math.PI / 2]);
    add(CONE(), glow, [0.3, 0, 0], [0.48, 0.44, 0.48], [0, 0, -Math.PI / 2]);
    add(BOX(), glow, [-0.1, 0, 0], [0.5, 0.08, 0.08]);
  },

  // ---- one icon per upgrade ----------------------------------------------
  // Everything below exists because a shape was being worn by two or three
  // different mutations at once. An icon that appears on two totems is worse
  // than no icon: the player learns it means one thing and is then handed the
  // other. The rule is now one shape per entry in UPGRADES, and test/icons.mjs
  // fails the build if that ever stops being true.
  //
  // Families still rhyme on purpose - a bolt, an arc and a coil all read as
  // electricity - but no two are the same object.

  // Overclock: a dial with the needle swung round to the stop.
  throttle(add, glow) {
    add(TORUS(), DARK, [0, 0, 0], [1.3, 1.3, 0.6]);
    add(CYL(), DARK, [0, 0, -0.04], [0.52, 0.06, 0.52], [Math.PI / 2, 0, 0]);
    add(BOX(), glow, [0.17, 0.12, 0.06], [0.42, 0.07, 0.07], [0, 0, 0.6]);
    add(SPHERE(), PALE, [0, 0, 0.08], [0.13, 0.13, 0.13]);
    add(BOX(), glow, [0.31, 0.31, 0.02], [0.11, 0.06, 0.05], [0, 0, 0.8]);
  },
  // Arc Rounds: two nodes and the jag that jumps between them.
  arc(add, glow) {
    add(SPHERE(), glow, [-0.32, -0.2, 0], [0.24, 0.24, 0.24]);
    add(SPHERE(), glow, [0.32, 0.22, 0], [0.24, 0.24, 0.24]);
    add(BOX(), PALE, [-0.15, -0.06, 0], [0.26, 0.07, 0.07], [0, 0, 1.0]);
    add(BOX(), PALE, [0.0, 0.0, 0], [0.24, 0.07, 0.07], [0, 0, -0.45]);
    add(BOX(), PALE, [0.16, 0.13, 0], [0.24, 0.07, 0.07], [0, 0, 1.0]);
  },
  // Overload: lightning thrown out in every direction at once.
  //
  // A coil on a base first, which read as a table lamp. The mutation is not a
  // device, it is what the device DOES - "hits all of them" - so the icon is
  // the discharge itself: four jagged spokes off one core. The jag is what
  // keeps it away from `burst`, whose spokes are smooth cones.
  discharge(add, glow) {
    add(SPHERE(), PALE, [0, 0, 0], [0.24, 0.24, 0.24]);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i / 4) * Math.PI * 2;
      add(BOX(), glow, [Math.cos(a) * 0.21, Math.sin(a) * 0.21, 0],
        [0.26, 0.09, 0.09], [0, 0, a + 0.38]);
      add(BOX(), glow, [Math.cos(a) * 0.44, Math.sin(a) * 0.44, 0],
        [0.26, 0.09, 0.09], [0, 0, a - 0.38]);
    }
  },
  // Neurotoxin: a core throwing motes onto stalks - poison looking for the
  // next body rather than sitting in a bottle.
  spore(add, glow) {
    add(SPHERE(), glow, [0, 0, 0], [0.32, 0.32, 0.32]);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      add(CYL(), DARK, [cx * 0.24, cy * 0.24, 0], [0.05, 0.3, 0.05], [0, 0, -a + Math.PI / 2]);
      add(SPHERE(), PALE, [cx * 0.44, cy * 0.44, 0], [0.17, 0.17, 0.17]);
    }
  },
  // Malady: the biohazard trefoil - three rings round a hub.
  trefoil(add, glow) {
    add(SPHERE(), PALE, [0, 0, 0.04], [0.2, 0.2, 0.2]);
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i / 3) * Math.PI * 2;
      add(TORUS(), glow, [Math.cos(a) * 0.27, Math.sin(a) * 0.27, 0], [0.64, 0.64, 0.5]);
    }
  },
  // Antidote: a capsule, half lit.
  capsule(add, glow) {
    add(CYL(), glow, [0.09, 0.11, 0], [0.26, 0.3, 0.26], [0, 0, -0.7]);
    add(SPHERE(), glow, [0.18, 0.21, 0], [0.26, 0.26, 0.26]);
    add(CYL(), PALE, [-0.09, -0.11, 0], [0.26, 0.3, 0.26], [0, 0, -0.7]);
    add(SPHERE(), PALE, [-0.18, -0.21, 0], [0.26, 0.26, 0.26]);
  },
  // Piercing Shot: one spike driven through two plates.
  pierce(add, glow) {
    add(BOX(), DARK, [-0.14, 0, 0], [0.09, 0.44, 0.3]);
    add(BOX(), DARK, [0.14, 0, 0], [0.09, 0.44, 0.3]);
    add(CYL(), glow, [-0.08, 0, 0], [0.08, 0.62, 0.08], [0, 0, -Math.PI / 2]);
    add(CONE(), glow, [0.34, 0, 0], [0.14, 0.22, 0.14], [0, 0, -Math.PI / 2]);
  },
  // Triple Tap: the three rounds one pull costs.
  trio(add, glow) {
    for (let i = -1; i <= 1; i++) {
      add(CYL(), glow, [i * 0.21, -0.1, 0], [0.15, 0.34, 0.15]);
      add(CONE(), PALE, [i * 0.21, 0.15, 0], [0.15, 0.2, 0.15]);
    }
  },
  // Bloodlust: a tally of the chain, struck through at five.
  tally(add, glow) {
    for (let i = 0; i < 4; i++) {
      add(BOX(), PALE, [-0.24 + i * 0.16, 0, 0], [0.07, 0.52, 0.07]);
    }
    add(BOX(), glow, [0, 0, 0.07], [0.68, 0.08, 0.07], [0, 0, 0.38]);
  },
  // Berserker: a heartbeat, spiking as the line runs out.
  pulse(add, glow) {
    add(BOX(), DARK, [-0.34, -0.14, 0], [0.26, 0.07, 0.07]);
    add(BOX(), glow, [-0.12, 0.07, 0], [0.46, 0.07, 0.07], [0, 0, 1.15]);
    add(BOX(), glow, [0.08, 0.02, 0], [0.56, 0.07, 0.07], [0, 0, -1.22]);
    add(BOX(), DARK, [0.32, -0.24, 0], [0.26, 0.07, 0.07]);
  },
  // Crystallize: a frozen body coming apart.
  shatter(add, glow) {
    add(OCTA(), PALE, [0.01, -0.01, 0], [0.17, 0.17, 0.13]);
    add(TETRA(), glow, [-0.22, 0.18, 0], [0.34, 0.34, 0.2], [0, 0, 0.4]);
    add(TETRA(), glow, [0.24, 0.12, 0], [0.3, 0.3, 0.2], [0, 0, -1.1]);
    add(TETRA(), PALE, [-0.12, -0.24, 0], [0.28, 0.28, 0.18], [0, 0, 2.2]);
    add(TETRA(), glow, [0.18, -0.27, 0], [0.24, 0.24, 0.16], [0, 0, 1.4]);
  },
  // Absolute Zero: a snowflake. Three crossed spokes rather than six drawn
  // arms - at totem distance the star is the whole read.
  snowflake(add, glow) {
    for (let i = 0; i < 3; i++) {
      add(BOX(), glow, [0, 0, 0], [0.88, 0.08, 0.08], [0, 0, (i / 3) * Math.PI]);
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(SPHERE(), PALE, [Math.cos(a) * 0.41, Math.sin(a) * 0.41, 0], [0.13, 0.13, 0.13]);
    }
  },
  // Cursed Ammo: a rune inside a ring.
  sigil(add, glow) {
    add(TORUS(), glow, [0, 0, 0], [1.16, 1.16, 0.6]);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
      add(BOX(), PALE, [Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0.03],
        [0.38, 0.05, 0.05], [0, 0, a + Math.PI / 2]);
    }
  },
  // Executioner: the axe. A haft with the weight all on one side, which is
  // what separates it from the sword at a glance.
  //
  // The first pass hung a plain rectangle off one side of the pole and read as
  // a FLAG. What fixes it is the wedge: the head has to widen as it leaves the
  // haft and end in an edge taller than the shaft is thick, plus a stub on the
  // back so the pole passes through the head rather than holding it up.
  axe(add, glow) {
    add(CYL(), DARK, [0, -0.12, 0], [0.09, 0.9, 0.09]);
    add(BOX(), DARK, [0, 0.3, 0], [0.17, 0.36, 0.14]);
    add(CONE(), glow, [0.28, 0.3, 0], [0.6, 0.42, 0.1], [0, 0, -Math.PI / 2]);
    add(BOX(), glow, [0.44, 0.3, 0], [0.11, 0.52, 0.1]);
    add(CONE(), PALE, [-0.17, 0.3, 0], [0.26, 0.18, 0.1], [0, 0, Math.PI / 2]);
    add(SPHERE(), PALE, [0, -0.54, 0], [0.12, 0.12, 0.12]);
  },
  // Scavenger: a magnet, pulling the field in.
  //
  // BUILT AS A SOLID U, and that is not a stylistic choice. The first pass was
  // a ring with a dark block over its lower arc - which is a horseshoe on a
  // contact sheet and a filled circle on a TOTEM, because the light standing
  // behind the icon wears the same theme colour and simply fills the gap back
  // in. Any icon whose identity lives in negative space fails here. Three
  // thick bars carry the shape in the strokes instead, and the two pole tips
  // are deliberately different materials so the ends read as poles.
  magnet(add, glow) {
    add(BOX(), glow, [-0.26, 0.02, 0], [0.2, 0.68, 0.24]);
    add(BOX(), glow, [0.26, 0.02, 0], [0.2, 0.68, 0.24]);
    add(BOX(), glow, [0, 0.3, 0], [0.72, 0.2, 0.24]);
    add(BOX(), PALE, [-0.26, -0.4, 0], [0.2, 0.16, 0.26]);
    add(BOX(), DARK, [0.26, -0.4, 0], [0.2, 0.16, 0.26]);
  },
  // Belt Feed: rounds on a link belt, running up out of frame.
  belt(add, glow) {
    for (let i = 0; i < 4; i++) {
      const x = -0.33 + i * 0.22;
      const y = -0.28 + i * 0.13;
      add(BOX(), DARK, [x, y, 0], [0.21, 0.13, 0.19], [0, 0, 0.53]);
      add(CYL(), glow, [x - 0.08, y + 0.18, 0], [0.09, 0.26, 0.09], [0, 0, 0.53]);
    }
  },
  // Ammo Fabricator: a hopper dropping a finished round.
  //
  // This was an anvil first, and an anvil is a wide face with a horn off one
  // side - which from the front is an ARROW, pointing left, saying nothing
  // about ammunition at all. A funnel with a round falling out of it says
  // "rounds arriving on their own" in one shape, which is the mutation.
  // Scavenger keeps the magnet: found rather than made.
  // STEPPED, not conical. A smooth funnel on a stem is the same silhouette as
  // the chalice two entries up - both are a wide top narrowing onto a stalk -
  // and two icons that differ only in colour are the thing this whole pass
  // exists to remove. Square steps read as machinery instead of tableware.
  hopper(add, glow) {
    add(BOX(), glow, [0, 0.32, 0], [0.78, 0.15, 0.4]);
    add(BOX(), glow, [0, 0.14, 0], [0.52, 0.21, 0.35]);
    add(BOX(), glow, [0, -0.04, 0], [0.27, 0.17, 0.27]);
    add(CYL(), PALE, [0, -0.3, 0], [0.15, 0.28, 0.15]);
    add(CONE(), DARK, [0, -0.49, 0], [0.15, 0.12, 0.15]);
  },
  // Blood Pact: a full chalice. The bargain, not the wound - Vampiric keeps
  // the falling drop.
  chalice(add, glow) {
    add(CONE(), PALE, [0, 0.12, 0], [0.5, 0.4, 0.5], [Math.PI, 0, 0]);
    add(CYL(), glow, [0, 0.29, 0], [0.42, 0.08, 0.42]);
    add(CYL(), PALE, [0, -0.16, 0], [0.09, 0.3, 0.09]);
    add(CYL(), PALE, [0, -0.34, 0], [0.4, 0.08, 0.4]);
    add(SPHERE(), glow, [0.18, 0.42, 0], [0.1, 0.1, 0.1]);
  },
  // Reactive Plating: the wave going out from the hit.
  shockRing(add, glow) {
    add(SPHERE(), PALE, [0, 0, 0], [0.2, 0.2, 0.2]);
    add(TORUS(), glow, [0, 0, 0], [0.72, 0.72, 0.35]);
    add(TORUS(), glow, [0, 0, 0], [1.16, 1.16, 0.35]);
    add(TORUS(), DARK, [0, 0, 0], [1.56, 1.56, 0.35]);
  },
  // Hellfire: fire laid along the ground behind you, dying off as it goes.
  firetrail(add, glow) {
    add(BOX(), DARK, [0, -0.32, 0], [0.88, 0.08, 0.22]);
    add(CONE(), glow, [-0.3, 0.02, 0], [0.32, 0.48, 0.32]);
    add(CONE(), glow, [0.02, -0.08, 0], [0.25, 0.36, 0.25]);
    add(CONE(), PALE, [0.29, -0.16, 0], [0.18, 0.26, 0.18]);
  },
  // Devil's Gamble: dice. The pips are on the front face only, so the cube is
  // left square to the camera rather than tumbled - a rotated die would carry
  // its pips off the face they belong on.
  dice(add, glow) {
    add(BOX(), glow, [0, 0, 0], [0.56, 0.56, 0.5]);
    for (const p of [[-0.16, 0.16], [0.16, 0.16], [0, 0], [-0.16, -0.16], [0.16, -0.16]]) {
      add(SPHERE(), DARK, [p[0], p[1], 0.26], [0.12, 0.12, 0.12]);
    }
    add(BOX(), PALE, [0.32, -0.3, -0.14], [0.3, 0.3, 0.28]);
  },
  // Breach Round: the detonator handle. Something ARMED and then pushed,
  // which is the mutation - the reload arms it, the next shot spends it.
  plunger(add, glow) {
    add(BOX(), DARK, [0, -0.26, 0], [0.56, 0.3, 0.36]);
    add(CYL(), PALE, [0, 0.02, 0], [0.09, 0.38, 0.09]);
    add(BOX(), glow, [0, 0.26, 0], [0.46, 0.1, 0.13]);
    add(CYL(), glow, [0.32, -0.26, 0], [0.1, 0.07, 0.1], [0, 0, Math.PI / 2]);
    add(SPHERE(), glow, [-0.22, -0.12, 0.2], [0.09, 0.09, 0.09]);
  },
  // Reload Burst: darts leaving the magazine that threw them. The magazine at
  // the base is what stops this reading as another set of claw marks.
  flechette(add, glow) {
    add(BOX(), DARK, [0, -0.34, 0], [0.32, 0.24, 0.2]);
    for (let i = -1; i <= 1; i++) {
      const a = i * 0.5;
      const dx = -Math.sin(a);
      const dy = Math.cos(a);
      add(CYL(), PALE, [dx * 0.1, dy * 0.1 - 0.1, 0], [0.05, 0.36, 0.05], [0, 0, a]);
      add(CONE(), glow, [dx * 0.35, dy * 0.35 - 0.1, 0], [0.15, 0.2, 0.15], [0, 0, a]);
    }
  },
  // Twenty/Twenty: two barrels going off at once. The flashes are CONES
  // flaring off the muzzles - as spheres they read as two lollipops.
  twinShot(add, glow) {
    add(BOX(), DARK, [0, -0.32, 0], [0.58, 0.18, 0.22]);
    for (const x of [-0.15, 0.15]) {
      add(CYL(), DARK, [x, -0.04, 0], [0.13, 0.44, 0.13]);
      add(CONE(), glow, [x, 0.32, 0], [0.3, 0.3, 0.3]);
    }
  },
  // Dark Power: a blade, point down. No drawback and nothing clever - the
  // plainest weapon shape in the set for the plainest deal in the pool.
  sword(add, glow) {
    add(BOX(), glow, [0, 0.1, 0], [0.16, 0.66, 0.07]);
    add(CONE(), glow, [0, -0.34, 0], [0.16, 0.24, 0.07], [Math.PI, 0, 0]);
    add(BOX(), PALE, [0, 0.45, 0], [0.5, 0.09, 0.12]);
    add(CYL(), DARK, [0, 0.59, 0], [0.09, 0.22, 0.09]);
    add(SPHERE(), glow, [0, 0.73, 0], [0.14, 0.14, 0.14]);
  },
  // Demonic Presence: horns. He is the mutation, so he is the icon.
  horns(add, glow) {
    for (const t of [-1, 1]) {
      add(CONE(), glow, [t * 0.24, -0.02, 0], [0.22, 0.46, 0.22], [0, 0, t * -0.5]);
      add(CONE(), glow, [t * 0.4, 0.3, 0], [0.14, 0.3, 0.14], [0, 0, t * -0.95]);
    }
    add(SPHERE(), DARK, [0, -0.22, 0], [0.38, 0.26, 0.3]);
  },
  // Demonic Dodge: one membraned wing sweeping off to the side. Evasion keeps
  // the symmetric pair; a devil gets the half that looks like it came off
  // something living.
  batWing(add, glow) {
    add(CYL(), DARK, [-0.3, 0.18, 0], [0.08, 0.44, 0.08], [0, 0, -0.9]);
    for (let i = 0; i < 3; i++) {
      add(TETRA(), glow, [0.02 + i * 0.19, 0.16 - i * 0.21, 0],
        [0.44 - i * 0.07, 0.5 - i * 0.09, 0.14], [0, 0, -0.2 - i * 0.5]);
    }
    add(CONE(), PALE, [0.44, -0.32, 0], [0.12, 0.2, 0.1], [0, 0, -2.4]);
  },
  // Eternal Affliction: two rings that never close. Entropy keeps the
  // hourglass, which is a clock that HAS stopped; this one never started.
  infinity(add, glow) {
    add(TORUS(), glow, [-0.24, 0, 0], [0.94, 0.94, 0.45], [0, 0.5, 0]);
    add(TORUS(), glow, [0.24, 0, 0], [0.94, 0.94, 0.45], [0, -0.5, 0]);
    add(SPHERE(), PALE, [0, 0, 0.06], [0.15, 0.15, 0.15]);
  },
  // The Devil's max-health console: a heart, built the way HIS is - two lobes
  // over a point. It is deliberately the same shape as the thing in his chest,
  // because the console took that job over from it: the heart used to be what
  // you shot, and now it is what you buy from.
  //
  // Solid strokes, no negative space - see the rule at the top of this file.
  // A heart drawn as an outline is a filled blob at fifteen metres.
  heart(add, glow) {
    add(SPHERE(), glow, [-0.13, 0.1, 0], [0.28, 0.28, 0.2]);
    add(SPHERE(), glow, [0.13, 0.1, 0], [0.28, 0.28, 0.2]);
    add(CONE(), glow, [0, -0.14, 0], [0.4, 0.4, 0.2], [Math.PI, 0, 0]);
    // One pale highlight off-centre, so the two lobes read as a form with a
    // light on it rather than as a flat cutout.
    add(SPHERE(), PALE, [-0.11, 0.16, 0.09], [0.09, 0.09, 0.06]);
  },
  // Fallback.
  shard(add, glow) {
    add(OCTA(), glow, [0, 0, 0], [0.55, 0.55, 0.55]);
  },
};

// Every shape this file defines. Exported so test/icons.mjs can check the
// catalogue against the upgrade pool WITHOUT a browser: a typo in an `icon:`
// field is not an error at runtime, it silently falls back to `shard`, which
// puts two upgrades back on one icon in the one way nobody would ever notice.
export const ICON_KEYS = Object.keys(ICONS);

/**
 * Builds one icon. The caller owns the returned group and should keep it -
 * building the same icon twice allocates a second glow material.
 *
 * @param {string} key    an entry in ICONS; unknown keys fall back to 'shard'
 * @param {number} color  theme colour, applied to every glowing part
 * @returns {THREE.Group}
 */
export function buildIcon(key, color) {
  const group = new THREE.Group();
  const glow = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 1.5, roughness: 0.25, metalness: 0.45,
  });
  group.userData.glow = glow;
  (ICONS[key] || ICONS.shard)(makeAdder(group), glow);
  return group;
}
