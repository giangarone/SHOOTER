// Small 3D icons for the wave-end totems: one recognisable object per offer,
// hovering in front of the pillar and tinted by that offer's theme colour.
// A totem is read from across the arena, at a glance, mid-fight - the icon is
// what carries when the text is still too small to make out, so it has to be
// a silhouette rather than a model. Six or seven parts is the budget.
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
  // dark slab against a pillar already wearing that same colour.
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
  // colour alone disappears into the pillar behind it, which wears the same.
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
  // Fallback.
  shard(add, glow) {
    add(OCTA(), glow, [0, 0, 0], [0.55, 0.55, 0.55]);
  },
};

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
