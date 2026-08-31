// PROTOTYPE - pixel-art mutation icons.
//
// A test of a new visual direction for the totem icons, standing alongside the
// 3D catalogue in icons.js rather than replacing it yet. One icon is drawn so
// far: `venomRound` (VENOM ROUNDS). Preview it with pixel-icon-viewer.html.
//
// WHAT THIS IS
//   Every icon is 24x24 pixels of FLAT art - no volume, no perspective, no
//   sculpting - given a thin slab of thickness behind it, like a thick sticker
//   floating in the light column. The art is 2D. Only the object is 3D.
//
// WHY A GRID
//   The 3D icons are hand-placed floats, so stroke weight, size and density
//   drift from icon to icon and consistency has to be re-eyeballed 61 times.
//   A fixed grid makes it structural: every icon gets the same 24x24 of room,
//   the same one-pixel stroke, the same auto-generated outline. Two icons
//   cannot disagree about how thick a line is.
//
// WHY 24
//   16 is the classic, but this pool has 61 entries and whole families of near
//   neighbours - venom, neurotoxin, malady, antidote - that collapse into the
//   same blob at 16. 32 has room for detail nobody can see from across the
//   arena. 24 is the size where a vial still reads as a different object from
//   a flask and every art-pixel still lands on 2-3 screen pixels at range.
//
// THE OUTLINE IS GENERATED, NOT DRAWN
//   icons.js warns that an icon's identity cannot be its negative space: the
//   totem's additive light fills in any gap you were meant to see through. A
//   near-black outline answers that directly - it is opaque geometry, not a
//   hole - and generating it from the silhouette means it is exactly one pixel
//   everywhere, on all 61 icons, for free.

import * as THREE from 'three';

export const GRID = 24;
// One art-pixel in metres. 24 of them come to ~0.62m, matching the "roughly
// half a metre" the 3D catalogue is built at (see totems.js ICON_SCALE).
const PX = 0.026;
// Thickness: three art-pixels. Enough to read as a solid object turning in the
// light, not so much that the side walls compete with the face for attention.
const DEPTH = 3 * PX;

// TONES. Authored art only ever names these; '0' (outline) is generated.
//   .  empty      1  dark        3  bright
//   0  outline    2  mid         4  pale accent
//
// Every tone but the pale accent is derived from the offer's THEME colour, so
// one drawing works for any mutation and the game's "colour tells you what it
// does" language stays load-bearing. The pale accent is a near-neutral
// highlight - it is the only tone that does not carry the theme.
export function pixelPalette(color) {
  const base = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  const tone = (s, l) => new THREE.Color().setHSL(hsl.h, s, l);
  return {
    '0': tone(hsl.s * 0.5, 0.045),  // outline: near-black, faintly tinted
    '1': tone(hsl.s * 0.95, 0.18),   // dark: shadowed faces
    '2': tone(hsl.s * 1.0, 0.34),   // mid: the workhorse fill
    '3': tone(Math.min(1, hsl.s * 1.15), 0.62), // bright: the lit, active part
    '4': tone(hsl.s * 0.32, 0.87),   // pale: specular, 2-4 pixels per icon
    side: tone(hsl.s * 0.8, 0.11),  // the extrusion walls
  };
}

// ---- the catalogue -------------------------------------------------------
//
// 24 strings of 24 characters, top row first. Draw the SILHOUETTE only - the
// outline is added for you, so never spend a pixel on it.

const PIXEL_ICONS = {
  // VENOM ROUNDS - a poisoned cartridge, venom beading off the point.
  //
  // Deliberately not the flask the 3D icon uses. A flask says "poison"; it
  // does not say what this mutation actually is, which is that the AMMUNITION
  // is poisoned - and the flask reads as a sibling of every other bottle in
  // the poison family. A round with venom gathering on its nose says both
  // halves of the name at once, and nothing else in the pool is a cartridge.
  //
  // The case is the dark end of the ramp and the ogive is the bright end, so
  // at range the shape resolves as a dark round with a lit, dripping tip -
  // legible before any of the detail is.
  venomRound: [
    '........................',
    '........................',
    '.......2222222211.......',   // the rim
    '.......2222222211.......',
    '.......2222222211.......',
    '........11111111........',   // the extractor groove - what says "cartridge" fastest
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........11111111........',   // the case mouth: dark case above, venom-loaded projectile below
    '........43333322........',
    '........43333322........',
    '.........433332.........',
    '.........433322.........',
    '..........3332..........',
    '...........32...........',
    '...........33...........',   // and the venom beads off the point
    '..........4332..........',
    '..........4332..........',
    '...........33...........',
    '........................',
  ],
};

export const PIXEL_ICON_KEYS = Object.keys(PIXEL_ICONS);

/**
 * Reads an authored map and adds the generated outline.
 * @returns {string[][]} GRID rows of GRID tone characters, '.' for empty
 */
export function resolveIcon(key) {
  const src = PIXEL_ICONS[key];
  if (!src) throw new Error('no pixel icon: ' + key);
  const cells = src.map(row => row.padEnd(GRID, '.').slice(0, GRID).split(''));
  // Eight-neighbour, so diagonal steps get a corner pixel and the outline
  // never breaks. A four-neighbour ring leaves gaps on every 45deg edge.
  const out = cells.map(r => r.slice());
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      if (cells[y][x] !== '.') continue;
      let touches = false;
      for (let dy = -1; dy <= 1 && !touches; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny < 0 || ny >= GRID || nx < 0 || nx >= GRID) continue;
          if (cells[ny][nx] !== '.') { touches = true; break; }
        }
      }
      if (touches) out[y][x] = '0';
    }
  }
  return out;
}

// ---- geometry ------------------------------------------------------------
//
// One merged, non-indexed, vertex-coloured BufferGeometry per icon, so the
// whole thing is a single draw call however many pixels it has. Interior faces
// between neighbouring pixels are never emitted - only the front, the back and
// whatever side walls are actually exposed - which is why a 200-pixel icon
// costs a few hundred triangles rather than 200 boxes.
//
// UNLIT ON PURPOSE. MeshBasicMaterial, no lights, no shading: the moment a
// light rakes across the face it stops being flat art. The only thing that
// gives the object away as solid is the darker colour on the side walls.

function quad(pos, col, a, b, c, d, color) {
  for (const v of [a, b, c, a, c, d]) pos.push(v[0], v[1], v[2]);
  for (let i = 0; i < 6; i++) col.push(color.r, color.g, color.b);
}

/**
 * Builds one pixel icon.
 * @param {string} key    an entry in PIXEL_ICONS
 * @param {number} color  the offer's theme colour
 * @returns {THREE.Group}
 */
export function buildPixelIcon(key, color) {
  const cells = resolveIcon(key);
  const pal = pixelPalette(color);
  const pos = [];
  const col = [];
  const half = GRID / 2;
  const zf = DEPTH / 2;
  const zb = -DEPTH / 2;
  const filled = (x, y) => x >= 0 && x < GRID && y >= 0 && y < GRID && cells[y][x] !== '.';

  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) {
      const t = cells[y][x];
      if (t === '.') continue;
      const x0 = (x - half) * PX;
      const x1 = x0 + PX;
      // Row 0 is the TOP row, so y runs down the screen and up the grid.
      const y1 = (half - y) * PX;
      const y0 = y1 - PX;
      const face = pal[t];
      const side = pal.side;
      // The face. This is the art; everything else is the slab it sits on.
      quad(pos, col, [x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], face);
      // The back, seen only as the icon swings past - kept dark so it never
      // competes with the front.
      quad(pos, col, [x1, y0, zb], [x0, y0, zb], [x0, y1, zb], [x1, y1, zb], side);
      if (!filled(x - 1, y)) quad(pos, col, [x0, y0, zb], [x0, y0, zf], [x0, y1, zf], [x0, y1, zb], side);
      if (!filled(x + 1, y)) quad(pos, col, [x1, y0, zf], [x1, y0, zb], [x1, y1, zb], [x1, y1, zf], side);
      if (!filled(x, y - 1)) quad(pos, col, [x0, y1, zf], [x1, y1, zf], [x1, y1, zb], [x0, y1, zb], side);
      if (!filled(x, y + 1)) quad(pos, col, [x0, y0, zb], [x1, y0, zb], [x1, y0, zf], [x0, y0, zf], side);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(g, mat));

  // totems.js pulses `icon.userData.glow.emissiveIntensity` every frame. There
  // is no emissive here - the material is unlit - so the same write is taken
  // as a brightness multiplier on the whole plate instead. Standing in for the
  // old interface rather than changing the caller keeps this prototype a
  // drop-in: nothing outside this file has to know which catalogue built it.
  group.userData.glow = {
    set emissiveIntensity(v) {
      const k = Math.min(1.6, 0.55 + v * 0.33);
      mat.color.setScalar(k);
    },
    get emissiveIntensity() { return 1; },
  };
  return group;
}
