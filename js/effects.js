// Visual effects: particles, bullet tracers, muzzle flash, screen shake.
//
// Everything here is pre-allocated and recycled. No effect ever creates a
// scene object at runtime, because effects fire dozens of times per second.
//   - particles: two THREE.Points pools - big sparks and small bullet
//     impacts - each written through a ring buffer. An overflowing burst
//     overwrites the oldest particles in its own pool.
//   - tracers: a small fixed pool of lines, reusing the first free one.
//   - shockwave rings: the same pool trick with flat discs, scaled and faded.
//   - flash: a single PointLight, moved and re-lit per shot. It counts toward
//     the scene's fixed light budget (see arena.js).
//
// update() must be called once per frame, including while paused, so effects
// keep settling.

import * as THREE from 'three';
import { addOutline, rasterize, shadeGrid, erodeDepth, gridPlate, gridMaterial, gridTint, PALETTE_RAMP_GLSL } from './pixelicons.js';
import { BOUND } from './arena.js';

// Particle slots, split across the two pools below. Bursts beyond a pool's
// share recycle its oldest particles rather than growing the buffer.
//
// TWO POOLS, AND THE ONLY THING THAT DIFFERS IS THE SPRITE SIZE.
//   THREE.PointsMaterial carries ONE size for the whole draw - there is no
//   per-particle size without writing a shader - so a fleck that has to be
//   smaller than the rest has to be its own Points. Which is cheap: it is one
//   extra draw call, and both pools run the same simulation.
//
//   `sparks` is the showpiece: kills, explosions, passive item
//   flourishes. It is unchanged, and it is what burst() still writes to.
//
//   `impacts` is every bullet landing - on an enemy, a wall, the floor or a
//   prop - which is by far the most FREQUENT particle in the game and the one
//   that least wants to be seen as particles. It is a third the size, because
//   at 0.15m a rifle firing into a crate two metres away buries the crate in
//   confetti. Small enough to read as grit thrown off the surface, still there
//   because a miss has no other feedback at all: the hitmarker and the enemy
//   flash cover a hit, and nothing covers a shot that went wide.
const SPARK_MAX = 768;
const IMPACT_MAX = 256;
// Sprite size in metres, per pool. Both attenuate with distance.
const SPARK_SIZE = 0.15;
const IMPACT_SIZE = 0.05;


// CORPSES - the come-apart death.
//
// An enemy is never one mesh. partsFor() in enemies/shared.js builds every type out of
// separate rigid pieces hung on one group - torso, neck, skull, jaw, spines,
// thighs, shins - so a death does not need a new effect invented for it. It
// needs the body the enemy already has, taken apart.
//
// That is the whole idea, and it is why this is cheap: no new geometry, no new
// material, no new texture. A corpse is the enemy's OWN group, kept in the
// scene for another three quarters of a second after it has left the roster,
// with an impulse and a spin on each piece.
//
// WHY THE PIECES SHRINK RATHER THAN FADE. Most of them wear a SHARED material
// - forty-eight parts across the roster are built on SHARED_MATS - so opacity
// is not one corpse's to touch: fading a dying tank would fade every tank on
// the floor with it. Scale is per-mesh and owned by nobody else, so the pieces
// close down to nothing where they land instead. The pickups' absorption is
// held to the same rule, for the same reason.
//
// BOUNDED, HARD. A wave clear is forty deaths inside a second and each body is
// up to two dozen meshes. Slots are a fixed ring: when they are all busy the
// OLDEST corpse is retired early to make room, so the number of extra objects
// in the scene has a ceiling that does not depend on how the wave ended.
const CORPSE_SLOTS = 12;
// Pieces one body may throw. The largest model in the roster (the tank) is
// sixteen parts plus eyes, so this clears it with room to spare; anything
// past it is left on the group and simply goes when the corpse does.
const CORPSE_PIECES = 28;
// Seconds a corpse lasts, and the last fraction of that spent shrinking away.
// Short: this is the punctuation on a kill, not a body on the floor, and in a
// crowd it has to be gone before the player stops reading it as feedback.
const CORPSE_LIFE = 0.75;
const CORPSE_SHRINK = 0.38;
// Gravity on a piece. Heavier than the world's, deliberately - the parts
// should hit the floor inside the corpse's life rather than hang in the air
// looking like a slow-motion replay.
const CORPSE_GRAVITY = 26;
// Peak spin, radians a second, and what a piece keeps when it lands. The
// bounce is low because a body coming apart should scatter and settle, not
// skitter around the floor like dropped cutlery.
const CORPSE_SPIN = 11;
const CORPSE_BOUNCE = 0.22;
// THE HIT FLASH, CARRIED ONTO THE BODY AS IT COMES APART. Every other point of
// damage in the game turns the enemy white for a tenth of a second - except the
// one that kills it, because Enemy.update() returns early once `dead` is set
// and the flash is applied from there. So the LAST hit, the only one the player
// is really waiting for, was the one hit that showed nothing.
//
// That went unnoticed for as long as the gun was the only thing killing
// anything: a rifle lands thirty flashes on a body and misses the thirty-first.
// MELEE one-shots most of what it touches, so for melee it was every swing.
//
// Matching BODY_FLASH_HEX and BODY_FLASH_INTENSITY in enemies/shared.js, and the same
// tenth of a second, because it is the same flash - it just happens to be
// playing on a body that is already in pieces.
const CORPSE_FLASH = 0.12;
const CORPSE_FLASH_HEX = 0xffffff;
const CORPSE_FLASH_INTENSITY = 0.9;
// Sideways and upward speed of the throw, before the caller's own force
// multiplier. Up beats out: a body that bursts outward reads as an explosion,
// and one that comes apart upward and falls reads as a body coming apart.
const CORPSE_OUT = 2.6;
const CORPSE_UP = 3.4;

// Points along a homing tracer. Enough that the bend reads as a curve rather
// than as two straight lines meeting at an angle.
const ARC_SEGMENTS = 12;
// How long a homing arc stays up. Longer than a straight tracer's 0.07s: the
// curve is the whole message and it has to survive long enough to be seen.
const ARC_LIFE = 0.14;

// LIGHTNING. Joints in one bolt, how high it starts, and how long it hangs
// there. Longer-lived than a tracer by an order of magnitude: a tracer says a
// bullet went somewhere, a bolt is a whole event and has to be seen even by a
// player who was looking at the other side of the arena when it landed.
const BOLT_SEGMENTS = 14;
const BOLT_HEIGHT = 18;
const BOLT_LIFE = 0.22;
// Lines drawn per strike. A GL line is one pixel wide however thick it is
// asked to be, so a single polyline eighteen metres long reads as a hair on
// the screen. Three of them, each jittered separately, is what makes a strike
// look like a strike - the thickness is the spread between them.
const BOLT_FORKS = 3;

// CLOUDS. The first thing in this game that hangs in the AIR and stays there.
//
// Everything hostile the arena leaves behind until now has been flat on the
// floor - pools, trails, telegraph rings - because the floor is where a player
// in a shooter is already looking. A gas cloud cannot be a decal: the whole
// point of it is that it fills the space you have to walk through, and a green
// stain on the ground reads as one more pool to strafe past.
//
// So a cloud is a CLUSTER OF BILLBOARDS, not a mesh. Twelve of the same soft
// dot the particles use, scattered through a squashed sphere, each bobbing on
// its own phase - which is what makes the thing look like it is churning
// rather than like a sprite someone parked. Additive, like every other
// transparent surface in the game, so it glows in a dark arena instead of
// turning to mud, and it needs no depth sorting against itself.
//
// SIX AT A TIME, which is more than the design ever puts on the floor at once:
// a vitriol lobs one every few seconds and a husk leaves one where it died.
// RAISED FROM SIX FOR BRINE, and it is the beam pool's argument again one
// theme later: for the gas cloud that has always used this, the cluster is
// DECORATION over a stain that works without it, and cloudAcquire returning -1
// is survivable by design. For a drifter's ink it is the entire mechanic - the
// hazard does no damage and applies no status, and all it is for is that you
// cannot see through it - so an ink zone that failed to get a slot would be a
// completely invisible enemy doing completely nothing. Four gas plus three ink
// is seven, so the pool has to clear seven, with one spare.
const CLOUD_SLOTS = 8;
// Puffs per cloud. Eight looked like eight circles; sixteen was a solid ball
// with no structure left in it. Twelve is where the overlaps stop reading as
// individual dots and start reading as volume.
const CLOUD_PUFFS = 12;
// A cloud is WIDER THAN IT IS TALL - roughly chest high on a 3m radius - so it
// reads as something you walk into rather than as a sphere floating in a room.
const CLOUD_SQUASH = 0.52;

// Soft radial white dot, tinted per-use by material colour. Shared by the
// projectile glows, the pickup halos, the gas puffs and the pools the wave-end
// light columns cast on the floor.
//
// SOFT, AND DELIBERATELY SO, on a game whose every other surface is on a grid.
// This was quantised into hard steps once, on the theory that a pixel-art game
// should not contain a gradient, and it was wrong twice over.
//
// It was wrong about the LOOK: quantising alpha snaps the faint outer skirt of
// the falloff - which used to fade to nothing and end - UP onto the nearest
// step, so a halo stops being a halo and becomes a flat sticker with a hard
// edge, noticeably wider than the one it replaced. A pickup ended up sitting
// inside a disc rather than glowing.
//
// And it was wrong about the PRINCIPLE, which this codebase had already
// settled: money.js quantises the orb's BODY into an 11x11 grid and then
// measures its halo off the raw coordinate specifically so the glow does not
// get a square edge. Pixel art quantises FORM. Light is not form. And the
// light in this game is already quantised, globally, by the 16-level posterise
// and ordered dither in crt.js - which is what pixel art has always actually
// done with a glow. Banding it here as well applies that treatment twice.
//
// The sparks are the exception and they are a separate texture: see
// makeSparkTexture. A spark is a piece of matter, not a light.
//
// ONE OF THESE EXISTS. It is memoised rather than built per caller because the
// smoke test holds the whole game to thirteen textures, and a second identical
// 64x64 gradient is a whole texture spent on a copy: nothing here reads the
// image differently, every user tints it through its own material colour.
let GLOW_TEX = null;
export function makeGlowTexture() {
  if (GLOW_TEX) return GLOW_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  GLOW_TEX = new THREE.CanvasTexture(cv);
  return GLOW_TEX;
}

// The dot the PARTICLES are made of, and the one place the hard version was
// right. A spark is a fleck of the thing that just got hit - matter, thrown
// off and cooling - so it has a shape, and a shape on a pixel grid has steps.
// A halo is light and has none. That is the whole line between this texture
// and the one above, and it is the same line money.js draws down the middle of
// a single orb.
//
// The falloff is computed once per CELL of a 16x16 grid and the alpha is
// quantised to four steps, which is few enough that the steps read as steps.
// The silhouette is measured off the RAW radius rather than the cell centre,
// again as money.js does it: rounding the distance first would give the sprite
// a square outline, and a square is not what a spark looks like at any size.
const SPARK_CELLS = 16;
const SPARK_STEPS = 4;
let SPARK_TEX = null;
export function makeSparkTexture() {
  if (SPARK_TEX) return SPARK_TEX;
  const px = 4; // device pixels per cell; the texture is 64 either way
  const size = SPARK_CELLS * px;
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const mid = (SPARK_CELLS - 1) / 2;
  for (let y = 0; y < SPARK_CELLS; y++) {
    for (let x = 0; x < SPARK_CELLS; x++) {
      const d = Math.hypot(x - mid, y - mid) / (SPARK_CELLS / 2);
      if (d > 1) continue;
      const a = d < 0.4 ? 1 - d * 0.45 : (1 - d) * 0.92;
      const q = Math.round(a * SPARK_STEPS) / SPARK_STEPS;
      if (q <= 0) continue;
      ctx.fillStyle = 'rgba(255,255,255,' + q + ')';
      ctx.fillRect(x * px, y * px, px, px);
    }
  }
  SPARK_TEX = new THREE.CanvasTexture(cv);
  // Nearest on both filters and no mipmaps: a linear magnify would put the
  // blur straight back, and mipmaps would dissolve a distant spark into the
  // average of its own steps.
  SPARK_TEX.magFilter = THREE.NearestFilter;
  SPARK_TEX.minFilter = THREE.NearestFilter;
  SPARK_TEX.generateMipmaps = false;
  return SPARK_TEX;
}

// CREEP - the persistent patch of wrong ground under a lingering zone.
//
// ONE FIELD, NOT A PILE OF PATCHES. Every zone in the game used to own its own
// blob mesh, which meant a magma trail or a Colossus walk was a row of
// separate stamps, each with its own black border cutting a seam across the
// middle of what is supposed to be one burning path. Zones now stamp into a
// SHARED occupancy grid over the whole arena floor, and the border is derived
// from the union at the end - so two overlapping zones are one shape with one
// outline round the outside of both, and a trail comes out as a single
// continuous path however many stamps laid it.
//
// The grid is the same idea as the icons' 24x24, moved from per-object to
// per-arena: one cell is one art-pixel, everywhere, at a fixed size in METRES,
// so a patch by your feet and a patch across the room are drawn at the same
// scale in the world.
//
// NOT A CIRCLE. A disc with a rim around it reads as a UI marker - a selection
// ring, a spell indicator - and the one thing this has to say is that a piece
// of the FLOOR is different. So each stamp is an irregular blob whose radius
// wanders, rasterised into the grid.
//
// The average radius of a stamp is exactly 1, so a caller's radius in metres
// still lands where the damage circle does.
//
// TWO FAMILIES, and the difference is the whole point of them. A SMOOTH patch
// is the player's - ash, the ground they made dangerous for the enemy. A
// JAGGED one hurts THEM. That distinction is carried by the silhouette first,
// by the PULSE second and by colour third, so it survives colourblindness, a
// busy screen and a player who has never read a tooltip.
//
// The families never merge, even where they overlap. A cell whose neighbour
// belongs to the other family is drawn as border, so a hostile pool that laps
// over the player's own ash still ends in a hard black line - which it has to,
// because that line is where the damage starts.
const CREEP_POINTS = 64;

// Metres per art-pixel on the floor. 0.25 is what the old per-patch grid
// worked out to - a 3m-radius blob over 24 cells - so the creep is the size it
// has always been, now measured once for the whole arena instead of once per
// object.
const CREEP_CELL = 0.25;
// Cells across the field. The floor is BOUND * 2 + 2 metres square (arena.js).
const CREEP_SPAN = BOUND * 2 + 2;
const CREEP_N = Math.ceil(CREEP_SPAN / CREEP_CELL);
const CREEP_MIN = -CREEP_SPAN / 2;
// How wide the HOT RIM is, in cells. Everything deeper than this is the dull
// structure tone; everything shallower is energy.
//
// THIS WAY ROUND, and it was tried the other way first. Filling the middle
// with energy and leaving a structural rim made a patch that was almost
// entirely the brightest tone in the ramp, which the tube's bloom then smeared
// into one flat glowing puddle - the pixels were there and could not be seen.
// A dull body with a hot edge is both the way a stain actually looks and the
// way this game's telegraphs already talk: the EDGE is the message, because
// the edge is where the danger stops.
const CREEP_RIM = 2;

// The radial wander that gives a stamp its outline. Unchanged from when this
// emitted a polygon - it is still the same eight shapes - but it is now a
// PREDICATE sampled per cell. The mean radius is still exactly 1, so a
// caller's radius in metres and the damage circle still agree at the edges.
function creepRadius(jagged, seed) {
  const a1 = seed * 1.7, a2 = seed * 3.1, a3 = seed * 5.3;
  const lobes = jagged ? 7 : 3;
  let sum = 0;
  const r = new Array(CREEP_POINTS);
  for (let i = 0; i < CREEP_POINTS; i++) {
    const t = (i / CREEP_POINTS) * Math.PI * 2;
    let v = 1
      + 0.20 * Math.sin(t * 2 + a1)
      + 0.13 * Math.sin(t * 3 + a2)
      + 0.08 * Math.sin(t * 5 + a3);
    if (jagged) {
      v += 0.17 * Math.sin(t * lobes + a2 * 2)
        + 0.10 * Math.sin(t * (lobes * 2 + 1) + a3);
    }
    r[i] = Math.max(0.35, v);
    sum += r[i];
  }
  // Normalise so the MEAN radius is 1. Without this a spiky variant would
  // cover noticeably more ground than a smooth one at the same scale, and the
  // patch would stop matching the radius the damage check uses.
  const k = CREEP_POINTS / sum;
  for (let i = 0; i < CREEP_POINTS; i++) r[i] *= k;
  return r;
}

// Four variants per family, built once and shared. Enough that two stamps side
// by side are never the same outline, few enough that they cost nothing.
const CREEP_VARIANTS = 4;
const CREEP_COL = new THREE.Color();
const CREEP_HSL = { h: 0, s: 0, l: 0 };
const CREEP_SHAPES = { smooth: [], jagged: [] };
for (let i = 0; i < CREEP_VARIANTS; i++) {
  CREEP_SHAPES.smooth.push(creepRadius(false, i * 2.3 + 0.7));
  CREEP_SHAPES.jagged.push(creepRadius(true, i * 3.7 + 1.9));
}

// The other things drawn on this floor, on the same grid and through the same
// three functions. A telegraph used to be a CircleGeometry inside a
// RingGeometry - two mathematically perfect curves lying next to a creep patch
// that had just been redrawn as pixels, which would have made the creep look
// like the odd one out instead of the new standard.
//
// EVERY FLOOR DRAWING IS 24 PIXELS ACROSS, whatever it is and however big it
// is in metres. It is the same rule the icons live by, and it means a seven
// metre boss telegraph has bigger art-pixels than a two metre mortar circle -
// which is right: the bigger the thing coming, the coarser and louder it reads.
const FLOOR_CELLS = 24;
const FLOOR_CELL = 2 / FLOOR_CELLS;

// The tone pass a filled floor shape gets, and the reason a telegraph circle
// and a creep patch look like they came from the same hand. The creep field
// does this per cell in _creepBuild, against the union of every stamp; here it
// runs over one small grid that is baked once at startup. Same three steps,
// same order, and the order is the part that matters.
//
// The light goes on FIRST, against the raw silhouette, exactly as it does for
// an icon - so the lower-right edge is shadow. Only then does what is left of
// the rim go hot. The other way round leaves the shading pass nothing to bite
// on, because it measures against the silhouette and an already-recoloured rim
// is no longer the tone it is looking for.
//
// No pale accent. shadeGrid's highlight is a few pixels on a 24x24 icon and a
// quarter of the perimeter on a shape this size, and at lightness 0.87 that is
// a lot of near-white lying on the floor under a bloom pass.
function paintFloorTones(cells, n) {
  const depth = erodeDepth(cells);
  shadeGrid(cells, '2', '1', null);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (cells[y][x] === '2' && depth[y][x] <= CREEP_RIM) cells[y][x] = '3';
    }
  }
  return cells;
}

// A filled circle, lit and cored exactly like a creep patch. The same recipe,
// applied to a shape with no wander in it.
function makeDiscGeometry() {
  const cells = rasterize((u, v) => Math.hypot(u, v) < 1, FLOOR_CELLS);
  paintFloorTones(cells, FLOOR_CELLS);
  return gridPlate(addOutline(cells, true), FLOOR_CELL);
}

// The warning line itself. All energy, no shading: this is the tone the icons
// spend on the active, lit part of a thing, and the edge of a telegraph is the
// most active line in the game. The generated outline gives it a black rim on
// BOTH sides, which is what keeps it legible over a floor the rig is washing
// in colour.
function makeAnnulusGeometry(inner = 0.84) {
  const cells = rasterize((u, v) => {
    const d = Math.hypot(u, v);
    return d < 1 && d > inner;
  }, FLOOR_CELLS, '3');
  return gridPlate(addOutline(cells, true), FLOOR_CELL);
}

// A corridor: two rails and open ground between them. Stretched hard along its
// length by the caller, so its pixels end up rectangular - which is fine, and
// arguably right, because the stretch runs the way the charge is coming.
function makeLaneGeometry(inner = 0.8) {
  const cells = rasterize((u, v) => Math.max(Math.abs(u), Math.abs(v)) > inner, FLOOR_CELLS, '3');
  return gridPlate(addOutline(cells, true), FLOOR_CELL);
}

// The field's fragment shader. ONE TEXTURE READ, because the tone is worked
// out on the CPU where the whole grid is in hand: sampling a neighbourhood in
// here to find the border would be sixteen reads on every floor pixel on
// screen, and the neighbourhood is only interesting when the grid changes -
// which is far less often than once per fragment.
//
//   R  the tone, 0..4, as a whole number
//   G  hue        B  saturation        A  how strongly the cell is painted
//
// The five tones come from the same paletteTone() the icons and the telegraph
// marks are drawn with, imported rather than copied.
const CREEP_FRAG = PALETTE_RAMP_GLSL + /* glsl */ `
  uniform sampler2D uField;
  uniform vec2 uMin;
  uniform float uInvSpan;
  varying vec3 vWorld;

  void main() {
    // World position into field UV, rather than the plane's own UVs: the plane
    // is turned flat by a -90 degree rotation about X and its v axis ends up
    // running toward -z, which is a fact about PlaneGeometry rather than about
    // this grid. Deriving the lookup from world space means the CPU and the
    // GPU agree about which cell is which by construction.
    vec2 uv = (vWorld.xz - uMin) * uInvSpan;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;
    vec4 c = texture2D(uField, uv);
    if (c.a <= 0.0) discard;
    float tone = floor(c.r * 255.0 + 0.5);
    gl_FragColor = vec4(paletteTone(tone, c.g, c.b), c.a);
    #include <tonemapping_fragment>
  }
`;

const CREEP_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---------------------------------------------------------------------------
// DAMAGE NUMBERS
// ---------------------------------------------------------------------------
//
// Every point of damage an enemy loses now floats off the body as a number.
// This is the whole feedback loop the game was missing: a body flashed white
// whether it took 3 or 3,000, damage over time was invisible, and there was no
// way to tell an armoured hit from a soft one except by how long the enemy
// took to die.
//
// HOW IT IS DRAWN, and why not the obvious way. The obvious way is a DOM node
// per number projected to screen space, or a Sprite per number with its own
// canvas texture. Both allocate per hit, and this fires dozens of times a
// second - see the note at the top of this file. So:
//
//   · ONE ATLAS, built once: the ten digits, in the game's own face, at a
//     power-of-two size with NEAREST filtering so a digit lands on texels.
//   · A FIXED POOL of meshes, each a preallocated strip of MAX_DIGITS quads.
//     Acquiring one rewrites its positions, its UVs and its vertex colours -
//     no geometry is created, no texture is uploaded, and the whole pool shares
//     one material.
//   · BILLBOARDED by copying the camera's quaternion in update(), which is why
//     update() now takes one.
const DMG_POOL = 64;
const DMG_DIGITS = 5;          // up to 99999; anything larger clamps
// THE THREE ACTS OF A DAMAGE NUMBER, in seconds. It leaves the body FAST and
// at full strength - a number that fades while it is still travelling reads as
// already leaving, and the moment it appears is the moment it is worth reading
// - then it STOPS dead at the top of its arc and simply sits there, which is
// the part that makes it legible in a firefight. Only then does it go, and it
// goes by collapsing to nothing rather than dissolving: a shrink is a definite
// end, where a fade alone leaves a smear the eye keeps returning to.
const DMG_RISE = 0.28;
const DMG_HOLD = 0.30;
const DMG_OUT = 0.24;
// How far it travels during the rise, in world units, before the jitter.
const DMG_CLIMB = 1.05;
// The atlas is one row of ten cells. 64px a cell is comfortably above the size
// a number is ever drawn at on screen, so the glyphs are downsampled rather
// than stretched.
const DMG_CELL = 64;
// HOW WIDE A DIGIT IS DRAWN, and HOW FAR THE NEXT ONE STARTS FROM IT. They are
// deliberately two numbers rather than one. The atlas cell carries air either
// side of its glyph, so laying the quads edge to edge sets every digit a cell's
// worth of margin apart and the number reads as l o o s e l y  s p a c e d. The
// advance is shorter than the quad, which slides the quads over one another
// into that air - the glyphs themselves are untouched and keep their size,
// only the gap between them closes.
const DMG_QUAD_W = 0.62;
const DMG_ADVANCE = 0.44;
// Size in world units at the low end and the high end - see damageNumber().
const DMG_MIN_H = 0.30;
const DMG_MAX_H = 0.85;
// What one of the player's opening shots is worth. The size curve is measured
// against this, so "a normal hit" is a normal-sized number on wave 1 and still
// a normal-sized number on wave 30 once the build has multiplied everything.
const DMG_REF = 34;
const DMG_WHITE = new THREE.Color(0xffffff);
// The interface's own gold, the colour it uses everywhere for the thing that
// is currently true.
const DMG_CRIT = new THREE.Color(0xffe95e);

// The ten digits in a strip, in the HUD's face, each with the hard black drop
// shadow every other piece of text in this interface wears - see `.overlay h1`
// in styles.css. Drawn once at boot.
function makeDigitAtlas() {
  const c = document.createElement('canvas');
  c.width = DMG_CELL * 10;
  c.height = DMG_CELL;
  const x = c.getContext('2d');
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = Math.round(DMG_CELL * 0.62) + 'px "Press Start 2P", monospace';
  // OFFSET, NOT BLURRED. The interface's shadow is a hard copy of the glyph a
  // few pixels down and right, which is the only kind of shadow that survives
  // being magnified by the tube pass.
  const off = Math.round(DMG_CELL * 0.08);
  // The glyph sits up and left of the cell's centre by half the offset, so the
  // pair is centred and the shadow has room inside the cell. A shadow that ran
  // past the edge would appear on the neighbouring digit.
  const cx = DMG_CELL / 2 - off / 2;
  const cy = DMG_CELL * 0.52 - off / 2;
  for (let i = 0; i < 10; i++) {
    const ox = i * DMG_CELL;
    // BLACK, and it STAYS black on a crit. The tint is applied as a vertex
    // colour, which multiplies - so a black texel comes out black whatever
    // colour is riding on it, and a white one comes out as the tint. That is
    // the whole reason the shadow can live in a shared atlas.
    x.fillStyle = '#05070b';
    x.fillText(String(i), ox + cx + off, cy + off);
    x.fillStyle = '#ffffff';
    x.fillText(String(i), ox + cx, cy);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.glowTex = makeGlowTexture();
    this.sparkTex = makeSparkTexture();
    this._initParticles();
    this._initDamageNumbers();

    // Tracer pool. Each is a two-vertex line whose endpoints are rewritten on
    // use; frustum culling is off because the endpoints move without the
    // bounding volume being recomputed.
    this.tracers = [];
    for (let i = 0; i < 10; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    // ARCS. Curved tracers for shots that homed onto a target. Same pooling as
    // the straight tracers, but each is a polyline rather than a segment,
    // because the curve IS the feedback: without seeing the bend, a player
    // whose crosshair was off would just see a miss register as a hit and have
    // no idea why. They also live twice as long as a straight tracer - four
    // frames is enough to read a line and not enough to read a shape.
    this.arcs = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array((ARC_SEGMENTS + 1) * 3), 3)
      );
      const m = new THREE.LineBasicMaterial({ color: 0xff5fd2, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.arcs.push({ line, life: 0 });
    }

    // Shockwave rings: a small fixed pool of flat pixel annuli, scaled outward
    // and faded on use. Same reasoning as the tracers - melee fires often enough
    // that building a ring per swing would churn geometry every second.
    // Unit-radius so a caller's range in metres is just the target scale.
    this.rings = [];
    const ringGeom = makeAnnulusGeometry(0.82);
    for (let i = 0; i < 4; i++) {
      const m = gridMaterial(0xff3b30, 0);
      const mesh = new THREE.Mesh(ringGeom, m);
      // Flat on the floor, lifted just clear of it so it does not z-fight.
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.rings.push({ mesh, life: 0, maxLife: 0.28, radius: 1 });
    }

    // CORPSE SLOTS. Every array is preallocated to the piece ceiling and
    // reused, so a wave clear does not allocate once per body per kill. The
    // group and the material list are the only per-corpse references, and both
    // are dropped the moment the corpse retires so nothing is held alive.
    this.corpses = [];
    for (let i = 0; i < CORPSE_SLOTS; i++) {
      this.corpses.push({
        group: null,
        mats: null,
        meshes: new Array(CORPSE_PIECES).fill(null),
        n: 0,
        vel: new Float32Array(CORPSE_PIECES * 3),
        spin: new Float32Array(CORPSE_PIECES * 3),
        base: new Float32Array(CORPSE_PIECES * 3),
        floorY: 0,
        life: 0,
        // The kill flash, and what to put back when it burns out. Reused
        // arrays rather than fresh ones per death - see CORPSE_FLASH.
        flashT: 0,
        em: [],
        emI: [],
      });
    }

    // TELEGRAPH MARKS. Ground markers for attacks that announce themselves
    // before they land - a mortar's impact circle, a boss's charge lane.
    //
    // A separate pool from the shockwave rings for two reasons. The ring pool
    // is four deep and shockwave() steals rings[0] when they are all busy, so
    // a telegraph drawn through it would be silently cut short by the next
    // melee swing - the one failure a telegraph must never have. And a ring is
    // fire-and-forget while a mark lives for as long as its owner says: these
    // are ACQUIRED and RELEASED, and update() leaves them alone in between.
    //
    // Every material in here is a gridMaterial, so all thirty-odd floor meshes
    // in the game - creep, rings, marks - share one shader program. They differ
    // only in their uniforms, which is not something three.js recompiles for.
    this.marks = [];
    const markDisc = makeDiscGeometry();
    const markRing = makeAnnulusGeometry(0.88);
    // Unit square rails, scaled to the corridor's width and length. Drawn in
    // the same energy tone as the ring so a lane is as bright as an impact
    // circle's outline - a faint corridor is not a warning.
    const markLane = makeLaneGeometry(0.8);
    for (let i = 0; i < 16; i++) {
      const mk = new THREE.Group();
      const dm = gridMaterial(0xff3b30, 0);
      const rm = gridMaterial(0xff3b30, 0);
      const discMesh = new THREE.Mesh(markDisc, dm);
      const ringMesh = new THREE.Mesh(markRing, rm);
      // A LANE needs its own mesh. Stretching the disc and ring along one axis
      // gives an ellipse, which reads as "something is happening over there"
      // rather than as the straight corridor a charge is about to come down -
      // the one thing the telegraph has to communicate. So a slot carries both
      // shapes and shows whichever the caller asked for.
      const lane = new THREE.Mesh(markLane, rm);
      lane.visible = false;
      mk.add(discMesh, ringMesh, lane);
      mk.rotation.x = -Math.PI / 2;
      mk.position.y = 0.06;
      mk.visible = false;
      mk.frustumCulled = false;
      scene.add(mk);
      // `disc` and `ring` are the MATERIALS - colour and opacity are written
      // through them. The meshes are kept separately because the lane SHARES
      // the ring material, so toggling visibility on the material would hide
      // the lane along with the ring.
      this.marks.push({
        group: mk, disc: dm, ring: rm,
        discMesh, ringMesh, lane, shape: '', used: false,
      });
    }

    // CREEP. See the header block above makeCreepField for what this is and
    // why it is one object rather than thirty.
    this._creepInit(scene);
    this._creepT = 0;

    // CLOUD POOL. One material per cloud - colour and opacity are written per
    // cloud, and the twelve puffs of one cloud share it - and one group per
    // cloud so the whole cluster is moved and scaled with a single write.
    this.clouds = [];
    for (let i = 0; i < CLOUD_SLOTS; i++) {
      const grp = new THREE.Group();
      const mat = new THREE.SpriteMaterial({
        map: makeGlowTexture(), color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const puffs = [];
      for (let j = 0; j < CLOUD_PUFFS; j++) {
        const sp = new THREE.Sprite(mat);
        // Scattered through a UNIT ball and then squashed, rather than placed
        // on a shell: a shell is a bubble with a hole in the middle, and the
        // middle is exactly where the player is standing when it matters.
        const u = Math.random();
        const r = 0.35 + 0.65 * Math.cbrt(u);
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        const sx = Math.sin(ph) * Math.cos(th) * r;
        const sy = Math.cos(ph) * r * CLOUD_SQUASH;
        const sz = Math.sin(ph) * Math.sin(th) * r;
        sp.userData = {
          x: sx, y: sy, z: sz,
          size: 0.85 + Math.random() * 0.75,
          phase: Math.random() * Math.PI * 2,
          rate: 0.7 + Math.random() * 0.9,
        };
        grp.add(sp);
        puffs.push(sp);
      }
      grp.visible = false;
      // A cloud is never culled: it is 3m across and the camera is often
      // INSIDE it, which is precisely the case a bounding-sphere test gets
      // wrong on a sprite cluster.
      grp.frustumCulled = false;
      scene.add(grp);
      this.clouds.push({
        group: grp, mat, puffs, used: false, radius: 1,
        spin: (Math.random() < 0.5 ? -1 : 1) * (0.15 + Math.random() * 0.2),
      });
    }
    this._cloudT = 0;

    // LIGHTNING BOLTS. Same pooled-polyline shape as the arcs, at a size that
    // spans the whole arena vertically. Two strikes' worth: they live a fifth
    // of a second, and Lightning Wizard fires on 5% of hits.
    this.bolts = [];
    for (let i = 0; i < BOLT_FORKS * 2; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute(
        'position',
        new THREE.BufferAttribute(new Float32Array((BOLT_SEGMENTS + 1) * 3), 3)
      );
      const m = new THREE.LineBasicMaterial({ color: 0xfff17a, transparent: true, opacity: 0 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.bolts.push({ line, life: 0 });
    }
    this._boltAt = new THREE.Vector3();

    // BEAMS. One-frame lines, redrawn every frame by whatever owns them -
    // a conduit's links to the enemies it is buffing. Same shape as the
    // tracer pool, and cleared at the top of every update().
    //
    // RAISED FROM EIGHT FOR TEMPEST, and it had to be: in every other theme a
    // beam is decoration on a mechanic that exists anyway, and in TEMPEST the
    // LINE IS THE MECHANIC. An arcling's wire, a coil's sightline and each of
    // the Conductor's six discharge arcs are all things the player is being
    // asked to stand off, and beam() drops silently when the pool is dry - so
    // at eight, a wave of arclings under a Conductor would have deleted the
    // warning on whichever lines happened to ask last while leaving them just
    // as lethal. Same argument as the per-kind hazard caps, one layer up.
    this.beams = [];
    for (let i = 0; i < 24; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const m = new THREE.LineBasicMaterial({ color: 0x00e5b0, transparent: true, opacity: 0.5 });
      const line = new THREE.Line(g, m);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.beams.push(line);
    }
    this._beamCount = 0;

    this.flashLight = new THREE.PointLight(0xffc36b, 0, 7);
    scene.add(this.flashLight);
    this.flashT = 0;
    this.shakeAmp = 0;
    // Player-set screen-shake intensity, 0 (off) upward. Applied where the
    // shake is CONSUMED rather than where it is added, so the cap in
    // addShake() keeps meaning what it says and a mid-run change to the
    // setting takes effect on the very next frame instead of on the next hit.
    this.shakeScale = 1;
  }

  // The two pools. See the note on SPARK_MAX at the top of the file for why
  // there are two of them and not one.
  _initParticles() {
    this.sparks = this._makePool(SPARK_MAX, SPARK_SIZE);
    this.impacts = this._makePool(IMPACT_MAX, IMPACT_SIZE);
  }

  // One pool: parallel typed arrays, one entry per particle slot. `pos` and
  // `col` are uploaded to the GPU each frame; the rest is CPU-side simulation
  // state. A slot is free when life[i] <= 0.
  _makePool(max, size) {
    const g = new THREE.BufferGeometry();
    const pool = {
      max,
      pos: new Float32Array(max * 3),
      col: new Float32Array(max * 3),
      vel: new Float32Array(max * 3),
      life: new Float32Array(max),
      maxLife: new Float32Array(max),
      c0: new Float32Array(max * 3),
      cursor: 0,
      alive: 0,
      points: null,
    };
    for (let i = 0; i < max; i++) pool.pos[i * 3 + 1] = -100;
    g.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(pool.col, 3).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.PointsMaterial({
      size,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      map: this.sparkTex,
    });
    pool.points = new THREE.Points(g, m);
    pool.points.frustumCulled = false;
    this.scene.add(pool.points);
    return pool;
  }

  // Spray `count` particles from point `p`. `up` biases them upward, `life` is
  // seconds (randomised per particle). Particles fade to black as they die.
  burst(p, color, count = 16, speed = 5, up = 2, life = 0.5) {
    this._emit(this.sparks, p, color, count, speed, up, life);
  }

  // The same spray, out of the small pool - for a bullet landing on anything.
  // Callers pass smaller counts as well as getting a smaller sprite: the size
  // is what made one impact loud, the count is what made a shotgun shell into
  // a firework.
  impact(p, color, count = 4, speed = 3, up = 1.2, life = 0.28) {
    this._emit(this.impacts, p, color, count, speed, up, life);
  }

  _emit(pool, p, color, count, speed, up, life) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const idx = pool.cursor;
      pool.cursor = (pool.cursor + 1) % pool.max;
      const i3 = idx * 3;
      if (pool.life[idx] <= 0) pool.alive++;
      pool.pos[i3] = p.x;
      pool.pos[i3 + 1] = p.y;
      pool.pos[i3 + 2] = p.z;
      let vx = Math.random() - 0.5;
      let vy = Math.random() - 0.5 + up * 0.4;
      let vz = Math.random() - 0.5;
      const len = Math.hypot(vx, vy, vz) || 1;
      const s = (speed * (0.4 + Math.random() * 0.9)) / len;
      pool.vel[i3] = vx * s;
      pool.vel[i3 + 1] = vy * s;
      pool.vel[i3 + 2] = vz * s;
      pool.life[idx] = pool.maxLife[idx] = life * (0.6 + Math.random() * 0.6);
      pool.c0[i3] = c.r;
      pool.c0[i3 + 1] = c.g;
      pool.c0[i3 + 2] = c.b;
    }
  }

  tracer(from, to) {
    let t = this.tracers[0];
    for (const cand of this.tracers) {
      if (cand.life <= 0) {
        t = cand;
        break;
      }
    }
    const a = t.line.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z);
    a.setXYZ(1, to.x, to.y, to.z);
    a.needsUpdate = true;
    t.line.visible = true;
    t.line.material.opacity = 0.85;
    t.life = 0.07;
  }

  /**
   * A curved tracer from `from` to `to`, leaving along `dir` before bending
   * onto the target. Quadratic bezier with the control point pushed out along
   * the barrel, so the line starts on the player's actual aim and curves from
   * there - which is what makes it read as the shot being corrected rather
   * than as the shot having been fired somewhere else all along.
   */
  arc(from, to, dir) {
    let a = this.arcs[0];
    for (const cand of this.arcs) {
      if (cand.life <= 0) {
        a = cand;
        break;
      }
    }
    const pos = a.line.geometry.attributes.position;
    const d = from.distanceTo(to);
    // Control point: half a shot-length down the original line of fire.
    const cx = from.x + dir.x * d * 0.55;
    const cy = from.y + dir.y * d * 0.55;
    const cz = from.z + dir.z * d * 0.55;
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      const u = 1 - t;
      const w0 = u * u;
      const w1 = 2 * u * t;
      const w2 = t * t;
      pos.setXYZ(
        i,
        w0 * from.x + w1 * cx + w2 * to.x,
        w0 * from.y + w1 * cy + w2 * to.y,
        w0 * from.z + w1 * cz + w2 * to.z
      );
    }
    pos.needsUpdate = true;
    a.line.visible = true;
    a.line.material.opacity = 0.95;
    a.life = ARC_LIFE;
  }

  // An expanding ring on the floor at `p`, growing to `radius` metres. Used to
  // show the area a melee swing covered; deliberately faint, since it fires on
  // every swing and a bright flash at the player's feet would read as damage
  // taken rather than damage dealt.
  shockwave(p, color = 0xff3b30, radius = 3, life = 0.28) {
    let r = this.rings[0];
    for (const cand of this.rings) {
      if (cand.life <= 0) {
        r = cand;
        break;
      }
    }
    r.mesh.position.set(p.x, p.y + 0.08, p.z);
    gridTint(r.mesh.material, color);
    r.mesh.scale.setScalar(0.001);
    r.mesh.visible = true;
    r.radius = radius;
    r.maxLife = life;
    r.life = life;
  }

  /**
   * Takes a dead enemy's body and throws it apart.
   *
   * The group is ALREADY in the scene and stays there - ownership passes to
   * this pool, which removes it and disposes `mats` when the corpse retires.
   * The caller must have released everything else the enemy held (see
   * Enemy.release) and must not touch the group again.
   *
   * A child marked `userData.noCorpse` is left where it is and goes with the
   * group at the end: the warden's dome is six and a half metres across and a
   * dome cartwheeling off a body is not a death, it is a bug.
   *
   * @param {THREE.Group} group   the body, in world position
   * @param {THREE.Material[]} mats per-instance materials to dispose at the end
   * @param {number} force        scales the throw; enemy scale is a good value
   */
  corpse(group, mats, force = 1) {
    let slot = null;
    for (const c of this.corpses) {
      if (c.life <= 0) { slot = c; break; }
    }
    if (!slot) {
      // All twelve busy. The oldest is the one with the least life left, and
      // it is retired NOW rather than this death being dropped: a kill that
      // silently leaves the body standing is worse than one that clears an
      // older corpse a fraction of a second early.
      slot = this.corpses[0];
      for (const c of this.corpses) if (c.life < slot.life) slot = c;
      this._retireCorpse(slot);
    }
    slot.group = group;
    slot.mats = mats;
    // WHITE FIRST, its own colours a tenth of a second later. Each material's
    // emissive is put aside so the cool-down has something to restore to -
    // these are the enemy's own per-instance materials and the corpse owns
    // them from here, so nothing else is going to write them back.
    slot.flashT = CORPSE_FLASH;
    slot.em.length = 0;
    slot.emI.length = 0;
    for (const m of mats) {
      slot.em.push(m.emissive ? m.emissive.getHex() : 0);
      slot.emI.push(m.emissiveIntensity);
      if (!m.emissive) continue;
      m.emissive.setHex(CORPSE_FLASH_HEX);
      m.emissiveIntensity = CORPSE_FLASH_INTENSITY;
    }
    // The floor, in the group's own space. A flier dies five metres up and its
    // group sits at that altitude, so its pieces have five metres to fall -
    // which is the best this effect ever looks and comes out for free.
    slot.floorY = -group.position.y + 0.06;
    slot.life = CORPSE_LIFE;

    let n = 0;
    for (const m of group.children) {
      if (n >= CORPSE_PIECES) break;
      if (m.userData && m.userData.noCorpse) continue;
      const i3 = n * 3;
      slot.meshes[n] = m;
      slot.base[i3] = m.scale.x;
      slot.base[i3 + 1] = m.scale.y;
      slot.base[i3 + 2] = m.scale.z;
      // Thrown outward from the body's own axis, so a piece leaves in the
      // direction it was already sitting: a shoulder spine goes over the
      // shoulder and a shin goes out from under. A part on the centre line has
      // no direction of its own and gets a random one rather than a zero.
      let ox = m.position.x;
      let oz = m.position.z;
      const len = Math.hypot(ox, oz);
      if (len < 0.05) {
        const a = Math.random() * Math.PI * 2;
        ox = Math.cos(a);
        oz = Math.sin(a);
      } else {
        ox /= len;
        oz /= len;
      }
      const out = CORPSE_OUT * force * (0.5 + Math.random() * 0.9);
      slot.vel[i3] = ox * out;
      slot.vel[i3 + 1] = CORPSE_UP * force * (0.45 + Math.random() * 0.9);
      slot.vel[i3 + 2] = oz * out;
      slot.spin[i3] = (Math.random() - 0.5) * CORPSE_SPIN;
      slot.spin[i3 + 1] = (Math.random() - 0.5) * CORPSE_SPIN;
      slot.spin[i3 + 2] = (Math.random() - 0.5) * CORPSE_SPIN;
      n++;
    }
    slot.n = n;
  }

  // One frame of every corpse in flight.
  _stepCorpses(dt) {
    for (const c of this.corpses) {
      if (c.life <= 0) continue;
      c.life -= dt;
      if (c.life <= 0) { this._retireCorpse(c); continue; }
      // The kill flash cooling off. One write when it expires rather than a
      // lerp every frame: the body flash it matches is a hard on and a hard
      // off, and a corpse fading out of white would read as a different event
      // from the thirty hits that led up to it.
      if (c.flashT > 0) {
        c.flashT -= dt;
        if (c.flashT <= 0) {
          for (let i = 0; i < c.mats.length; i++) {
            const m = c.mats[i];
            if (!m.emissive) continue;
            m.emissive.setHex(c.em[i]);
            m.emissiveIntensity = c.emI[i];
          }
        }
      }
      // The last third of the life closes the pieces down to nothing, on a
      // curve rather than a ramp so they are still full size for most of the
      // fall and then go quickly.
      const t = c.life / CORPSE_LIFE;
      const k = t >= CORPSE_SHRINK ? 1 : (t / CORPSE_SHRINK) ** 0.7;
      for (let i = 0; i < c.n; i++) {
        const m = c.meshes[i];
        const i3 = i * 3;
        c.vel[i3 + 1] -= CORPSE_GRAVITY * dt;
        m.position.x += c.vel[i3] * dt;
        m.position.y += c.vel[i3 + 1] * dt;
        m.position.z += c.vel[i3 + 2] * dt;
        if (m.position.y <= c.floorY && c.vel[i3 + 1] < 0) {
          m.position.y = c.floorY;
          c.vel[i3 + 1] = -c.vel[i3 + 1] * CORPSE_BOUNCE;
          // Ground drag, on the slide and on the tumble together: a piece that
          // landed should come to rest, not keep rolling for the whole life.
          c.vel[i3] *= 0.55;
          c.vel[i3 + 2] *= 0.55;
          c.spin[i3] *= 0.4;
          c.spin[i3 + 1] *= 0.4;
          c.spin[i3 + 2] *= 0.4;
        }
        m.rotation.x += c.spin[i3] * dt;
        m.rotation.y += c.spin[i3 + 1] * dt;
        m.rotation.z += c.spin[i3 + 2] * dt;
        m.scale.set(c.base[i3] * k, c.base[i3 + 1] * k, c.base[i3 + 2] * k);
      }
    }
  }

  // Ends one corpse: the body leaves the scene and its per-instance materials
  // are freed. This is the ONLY place either happens, so an early retirement
  // at the cap and an expiry at the end of the life cannot diverge.
  _retireCorpse(c) {
    // Nothing is restored here on purpose: the materials are disposed below,
    // so a corpse retired mid-flash has nothing left to put a colour back on.
    c.flashT = 0;
    if (c.group) this.scene.remove(c.group);
    if (c.mats) for (const m of c.mats) m.dispose();
    for (let i = 0; i < c.n; i++) c.meshes[i] = null;
    c.group = null;
    c.mats = null;
    c.n = 0;
    c.life = 0;
  }

  /**
   * Retires every corpse at once. A run reset tears down the enemies that own
   * these bodies, and a corpse left behind is a group in the scene that
   * nothing has a reference to any more.
   */
  clearCorpses() {
    for (const c of this.corpses) if (c.life > 0) this._retireCorpse(c);
  }

  // Claim a telegraph slot. Returns a handle to pass to markSet/markRelease,
  // or -1 when every slot is busy - a caller that gets -1 must still work,
  // just without its warning drawn.
  markAcquire() {
    for (let i = 0; i < this.marks.length; i++) {
      if (!this.marks[i].used) {
        this.marks[i].used = true;
        this.marks[i].group.visible = true;
        return i;
      }
    }
    return -1;
  }

  /**
   * Position and fill a telegraph. Call it every frame the warning is up.
   *
   * @param {number} fill 0..1 of the way to detonation. The outline is visible
   *   from the start so the AREA reads immediately; the disc fills behind it
   *   so the TIMING reads as it goes.
   * @param {number} weight scales the FILL alone, for telegraphs much larger
   *   than an impact circle. 1 for everything that detonates on a point.
   */
  markSet(h, x, z, radius, color, fill, aspect = 1, rot = 0, weight = 1) {
    if (h < 0) return;
    const mk = this.marks[h];
    mk.group.position.set(x, 0.06, z);
    // `aspect` of 1 is a circular impact marker; anything else is a LANE, which
    // swaps in the rectangular meshes. The group already lies flat via a -90
    // degree turn about X, which maps its local +y onto world -z; a spin about
    // local z after that therefore turns it within the floor plane, and
    // rot = atan2(-dx, -dz) points the long axis down (dx, dz).
    const shape = aspect === 1 ? 'disc' : 'lane';
    if (mk.shape !== shape) {
      mk.shape = shape;
      const isLane = shape === 'lane';
      mk.discMesh.visible = !isLane;
      mk.ringMesh.visible = !isLane;
      mk.lane.visible = isLane;
    }
    mk.group.scale.set(
      Math.max(0.001, radius * (shape === 'lane' ? 2 : 1)),
      Math.max(0.001, radius * aspect * (shape === 'lane' ? 2 : 1)),
      1
    );
    mk.group.rotation.z = rot;
    gridTint(mk.disc, color);
    gridTint(mk.ring, color);
    // `weight` scales the FILL only, never the outline. Every telegraph in the
    // game until the howler was an impact circle two or three metres across,
    // and a disc opacity tuned for that becomes a purple wash over half the
    // arena at seven. The edge is the message - where the danger stops - so it
    // stays at full strength however big the circle is, and only the shading
    // inside it is pulled back.
    // Higher than the additive numbers these replace, for the same reason the
    // creep's are: additive light adds to a floor that is already lit, painted
    // colour has to cover it.
    mk.disc.uniforms.uOpacity.value = (0.10 + fill * 0.48) * weight;
    mk.ring.uniforms.uOpacity.value = 0.55 + fill * 0.45;
  }

  markRelease(h) {
    if (h < 0) return;
    this.marks[h].used = false;
    this.marks[h].shape = '';
    this.marks[h].group.visible = false;
  }

  // ---- the creep field --------------------------------------------------

  _creepInit(scene) {
    const N = CREEP_N;
    // fam: 0 empty, 1 friendly, 2 hostile. The family is kept per cell rather
    // than per stamp because the border pass needs to know, at the cell, that
    // it is standing on a seam between the two.
    this._cFam = new Uint8Array(N * N);
    this._cHue = new Uint8Array(N * N);
    this._cSat = new Uint8Array(N * N);
    this._cAlpha = new Uint8Array(N * N);
    // Chebyshev distance from each filled cell to the nearest cell that is not
    // its own family. Scratch for the tone pass; kept as a field so it is
    // allocated once rather than every frame.
    this._cDepth = new Uint8Array(N * N);
    this._cData = new Uint8Array(N * N * 4);

    this._cTex = new THREE.DataTexture(this._cData, N, N, THREE.RGBAFormat);
    // Nearest and no mipmaps, for the reason everything else in this game is:
    // a cell is an art-pixel and an art-pixel has an edge.
    this._cTex.magFilter = THREE.NearestFilter;
    this._cTex.minFilter = THREE.NearestFilter;
    this._cTex.generateMipmaps = false;
    this._cTex.needsUpdate = true;

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uField: { value: this._cTex },
        uMin: { value: new THREE.Vector2(CREEP_MIN, CREEP_MIN) },
        uInvSpan: { value: 1 / CREEP_SPAN },
      },
      vertexShader: CREEP_VERT,
      fragmentShader: CREEP_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(CREEP_SPAN, CREEP_SPAN), mat);
    mesh.rotation.x = -Math.PI / 2;
    // The same height the patches used to sit at: above the arena grid at 0.02
    // and below the telegraph marks at 0.06.
    mesh.position.y = 0.035;
    // One plane covering the whole floor, so it is either wholly in view or
    // wholly out and the culling test is not worth the write it saves.
    mesh.frustumCulled = false;
    scene.add(mesh);
    this._cMesh = mesh;

    // The stamps. Thirty is the old pool depth and the caps upstream are built
    // around it - a magma walker alone can hold a dozen.
    this.creep = [];
    for (let i = 0; i < 30; i++) {
      this.creep.push({
        used: false, hostile: false, x: 0, z: 0, radius: 0,
        hue: 0, sat: 0, alpha: 0,
        variant: (Math.random() * CREEP_VARIANTS) | 0,
        // A fixed turn, chosen when the slot is claimed. This is ORIENTATION,
        // not motion: the stamps used to spin slowly and a stain that rotates
        // is a decal advertising itself as a decal. Ground does not turn.
        rot: 0,
        phase: Math.random() * Math.PI * 2,
      });
    }
    // The rectangle of cells touched last frame. Union it with this frame's
    // before rebuilding, or the cells a moving trail just left behind keep the
    // last thing that was written into them.
    this._cRect = null;
  }

  /**
   * Rebuild the field from whatever stamps are live. Called once per frame
   * from update(), after every zone has had its say through creepSet.
   */
  _creepBuild() {
    const N = CREEP_N;
    const fam = this._cFam, hue = this._cHue, sat = this._cSat, al = this._cAlpha;

    // The cells this frame wants, and the cells last frame had. Everything in
    // either has to be rewritten; everything outside is already correct and is
    // the whole reason this is not a full 184x184 sweep every frame.
    let x0 = N, x1 = -1, z0 = N, z1 = -1;
    for (const c of this.creep) {
      if (!c.used || c.alpha <= 0 || c.radius <= 0) continue;
      // 1.25 rather than 1: the wander can push a lobe out past the mean.
      const r = c.radius * 1.25;
      x0 = Math.min(x0, Math.floor((c.x - r - CREEP_MIN) / CREEP_CELL));
      x1 = Math.max(x1, Math.ceil((c.x + r - CREEP_MIN) / CREEP_CELL));
      z0 = Math.min(z0, Math.floor((c.z - r - CREEP_MIN) / CREEP_CELL));
      z1 = Math.max(z1, Math.ceil((c.z + r - CREEP_MIN) / CREEP_CELL));
    }
    const live = x1 >= x0;
    const prev = this._cRect;
    if (!live && !prev) return;
    let rx0 = live ? x0 : prev[0], rx1 = live ? x1 : prev[1];
    let rz0 = live ? z0 : prev[2], rz1 = live ? z1 : prev[3];
    if (live && prev) {
      rx0 = Math.min(rx0, prev[0]); rx1 = Math.max(rx1, prev[1]);
      rz0 = Math.min(rz0, prev[2]); rz1 = Math.max(rz1, prev[3]);
    }
    // One cell of margin, because the border lives OUTSIDE the shape.
    rx0 = Math.max(0, rx0 - 1); rz0 = Math.max(0, rz0 - 1);
    rx1 = Math.min(N - 1, rx1 + 1); rz1 = Math.min(N - 1, rz1 + 1);
    this._cRect = live ? [x0, x1, z0, z1] : null;

    for (let z = rz0; z <= rz1; z++) fam.fill(0, z * N + rx0, z * N + rx1 + 1);

    // ---- stamp ----
    for (const c of this.creep) {
      if (!c.used || c.alpha <= 0 || c.radius <= 0) continue;
      const shape = (c.hostile ? CREEP_SHAPES.jagged : CREEP_SHAPES.smooth)[c.variant];
      const f = c.hostile ? 2 : 1;
      const r = c.radius * 1.25;
      const cx0 = Math.max(0, Math.floor((c.x - r - CREEP_MIN) / CREEP_CELL));
      const cx1 = Math.min(N - 1, Math.ceil((c.x + r - CREEP_MIN) / CREEP_CELL));
      const cz0 = Math.max(0, Math.floor((c.z - r - CREEP_MIN) / CREEP_CELL));
      const cz1 = Math.min(N - 1, Math.ceil((c.z + r - CREEP_MIN) / CREEP_CELL));
      const inv = 1 / c.radius;
      for (let z = cz0; z <= cz1; z++) {
        const wz = CREEP_MIN + (z + 0.5) * CREEP_CELL - c.z;
        const row = z * N;
        for (let x = cx0; x <= cx1; x++) {
          const wx = CREEP_MIN + (x + 0.5) * CREEP_CELL - c.x;
          const d = Math.sqrt(wx * wx + wz * wz) * inv;
          if (d > 1.25) continue;
          let ang = Math.atan2(wz, wx) + c.rot;
          // The shape table is sampled, not interpolated: rounding to the
          // nearest of the 64 control angles is itself a quantisation, and it
          // keeps the jagged family's spikes from being averaged away before
          // they ever reach the grid.
          let i = Math.round((ang / (Math.PI * 2)) * CREEP_POINTS) % CREEP_POINTS;
          if (i < 0) i += CREEP_POINTS;
          if (d >= shape[i]) continue;
          const k = row + x;
          // Last writer wins where two zones overlap. The alternative is
          // blending two hues, which on a green pool lapping over an orange
          // one gives a third colour that belongs to neither of them.
          fam[k] = f; hue[k] = c.hue; sat[k] = c.sat; al[k] = c.alpha;
        }
      }
    }

    // ---- distance to the nearest cell that is not ours ----
    // Two chamfer sweeps, forward then backward, which is exact for the
    // 8-neighbour metric. Same algorithm as erodeDepth in pixelicons.js, run
    // over a window of the field rather than over a whole icon.
    const dep = this._cDepth;
    const MAXD = 255;
    const nb = (x, z, f) => (x < rx0 || x > rx1 || z < rz0 || z > rz1
      ? 0 : (fam[z * N + x] === f ? dep[z * N + x] : 0));
    for (let z = rz0; z <= rz1; z++) {
      for (let x = rx0; x <= rx1; x++) {
        const k = z * N + x;
        const f = fam[k];
        if (!f) { dep[k] = 0; continue; }
        dep[k] = Math.min(MAXD, 1 + Math.min(
          nb(x - 1, z - 1, f), nb(x, z - 1, f), nb(x + 1, z - 1, f), nb(x - 1, z, f)));
      }
    }
    for (let z = rz1; z >= rz0; z--) {
      for (let x = rx1; x >= rx0; x--) {
        const k = z * N + x;
        const f = fam[k];
        if (!f) continue;
        dep[k] = Math.min(dep[k], 1 + Math.min(
          nb(x + 1, z + 1, f), nb(x, z + 1, f), nb(x - 1, z + 1, f), nb(x + 1, z, f)));
      }
    }

    // ---- tone, and the border ----
    const out = this._cData;
    for (let z = rz0; z <= rz1; z++) {
      for (let x = rx0; x <= rx1; x++) {
        const k = z * N + x;
        const o = k * 4;
        const f = fam[k];
        if (!f) {
          // OUTSIDE. A cell touching the shape is its border - the same
          // eight-neighbour dilation addOutline() puts round an icon, done
          // against the union so a trail gets one line round the whole of it
          // instead of one round every stamp that laid it.
          let bh = 0, bs = 0, ba = 0;
          for (let dz = -1; dz <= 1 && !ba; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, nz = z + dz;
              if (nx < 0 || nx >= N || nz < 0 || nz >= N) continue;
              const j = nz * N + nx;
              if (!fam[j]) continue;
              bh = hue[j]; bs = sat[j]; ba = al[j];
              break;
            }
          }
          out[o] = 0; out[o + 1] = bh; out[o + 2] = bs; out[o + 3] = ba;
          continue;
        }
        // INSIDE. A seam against the OTHER family is border too, and that is
        // load-bearing: where a hostile pool laps over the player's own ash
        // the black line is where the damage starts, and merging the two into
        // one shape would delete the only thing saying so.
        let seam = false;
        for (let dz = -1; dz <= 1 && !seam; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nx >= N || nz < 0 || nz >= N) continue;
            const g = fam[nz * N + nx];
            if (g && g !== f) { seam = true; break; }
          }
        }
        let tone;
        if (seam) tone = 0;
        else {
          // The light, first and against the raw silhouette, exactly as an
          // icon gets it: the lower-right edge of the shape is shadow. Then
          // whatever is left of the rim goes hot.
          const empty = (nx, nz) => nx < 0 || nx >= N || nz < 0 || nz >= N || fam[nz * N + nx] !== f;
          if (empty(x + 1, z) || empty(x, z + 1) || empty(x + 1, z + 1)) tone = 1;
          else tone = dep[k] <= CREEP_RIM ? 3 : 2;
        }
        out[o] = tone; out[o + 1] = hue[k]; out[o + 2] = sat[k]; out[o + 3] = al[k];
      }
    }
    this._cTex.needsUpdate = true;
  }

  /**
   * Claim a creep slot for a zone, held until the zone expires. Returns -1
   * when the pool is full, which a caller must survive - the zone still deals
   * its damage, it just goes undecorated.
   *
   * @param {boolean} hostile true when this patch hurts the PLAYER. It picks
   *   the jagged shape family instead of the smooth one, which is the primary
   *   way the two are told apart - see creepRadius.
   */
  creepAcquire(hostile = false) {
    for (let i = 0; i < this.creep.length; i++) {
      const c = this.creep[i];
      if (c.used) continue;
      c.used = true;
      c.hostile = hostile;
      c.alpha = 0;
      c.variant = (Math.random() * CREEP_VARIANTS) | 0;
      // A fresh orientation every time a slot is reused, so a magma trail is a
      // line of different-looking scorches rather than one shape stamped
      // twelve times. Set ONCE, here, and never touched again: this is which
      // way the stamp faces, not a spin. Ground does not turn.
      c.rot = Math.random() * Math.PI * 2;
      return i;
    }
    return -1;
  }

  /**
   * Position and tint one zone's ground patch. Call every frame it is alive.
   *
   * @param {number} intensity 0..1. Zones fade theirs down as they expire, so
   *   the floor going clean is the warning that the danger has passed.
   */
  creepSet(h, x, z, radius, color, intensity) {
    if (h < 0) return;
    const c = this.creep[h];
    c.x = x;
    c.z = z;
    c.radius = Math.max(0.001, radius);
    // Hue and saturation rather than a colour, because the field carries one
    // byte of each per cell and the shader rebuilds the whole five-tone ramp
    // from them - exactly the way pixelPalette() does in JS for the icons.
    CREEP_COL.setHex(color).getHSL(CREEP_HSL);
    c.hue = Math.round(CREEP_HSL.h * 255);
    c.sat = Math.round(CREEP_HSL.s * 255);
    const k = Math.max(0, Math.min(1, intensity));
    // A HOSTILE patch breathes and a friendly one does not. Movement is what
    // the eye is drawn to in a crowded frame, so it is spent on the only
    // patches the player has to get out of; ground they made dangerous for the
    // enemy sits still and stays out of the way.
    if (c.hostile) {
      // The whole patch beats, not just the rim: a rim-only pulse on a 3m pool
      // is a thin line moving at the edge of vision, and the thing the player
      // has to notice is the AREA. One opacity now does it, border included -
      // the drawing breathes as a drawing.
      //
      // The numbers are higher than the additive pair they replace. Additive
      // light adds to whatever the floor already had; painted colour has to
      // cover it, and at the old 0.5 a patch was a suggestion.
      //
      // But not much higher, and the ceiling is set by the BLOOM rather than by
      // taste. The tube pass starts blooming at 0.62 luminance (GLOW_THRESHOLD
      // in crt.js), and a structure tone painted over that line comes back
      // blurred - which on a shape whose whole point is its hard edges is the
      // one thing that must not happen. So the body sits deliberately under it
      // and only the hot rim is allowed to glow. Cyan is what found this: at
      // the same HSL lightness it is far brighter than red, and a cyan patch
      // any denser than this washes into a single flat puddle.
      const beat = Math.sin(this._creepT * 4.6 + c.phase);
      c.alpha = Math.round(255 * 0.72 * k * (0.72 + beat * 0.28));
    } else {
      c.alpha = Math.round(255 * 0.55 * k);
    }
  }

  /**
   * Claim a cloud slot, held for the whole life of the zone it decorates.
   * Returns -1 when the pool is full, which the caller must survive the same
   * way it survives a full creep pool: the zone still works, undecorated.
   */
  cloudAcquire() {
    for (let i = 0; i < this.clouds.length; i++) {
      const c = this.clouds[i];
      if (c.used) continue;
      c.used = true;
      c.group.visible = true;
      return i;
    }
    return -1;
  }

  /**
   * Position, size and tint one cloud. Call every frame it is alive.
   *
   * @param {number} radius the zone's own radius, in metres. The cluster is
   *   built to fill exactly that, so what the player sees IS the area the
   *   thing affects - a cloud drawn smaller than its trigger is a lie, and a
   *   cloud drawn larger is worse.
   * @param {number} intensity 0..1, faded down as the zone expires.
   * @param {number} viewDist metres from the VIEWER to the cloud's centre. A
   *   cloud thins out as it is walked into - see the note below. Leave it out
   *   for anything the camera cannot be inside.
   */
  cloudSet(h, x, z, radius, color, intensity, viewDist = Infinity) {
    if (h < 0) return;
    const c = this.clouds[h];
    c.group.position.set(x, 0.1, z);
    c.radius = Math.max(0.001, radius);
    c.mat.color.setHex(color);
    // IT THINS OUT WHEN YOU WALK INTO IT, and this is not a nicety.
    //
    // Twelve additive sprites are convincing from outside and a blindfold from
    // within: standing in one filled the entire screen with flat green, hid
    // the arena, the crowd and half the HUD, and turned a poison cloud into a
    // punishment far worse than the four damage a second it actually deals. A
    // player who cannot see is not being poisoned, they are being removed from
    // the game.
    //
    // So the cloud is drawn for the person OUTSIDE it - who has to see it from
    // across the arena and decide not to walk in - and gets out of the way of
    // the person inside, who already knows: the chip is lit in the HUD, the
    // stain is under their feet, and their health is going down.
    const t = Math.max(0, Math.min(1, (viewDist - radius * 0.3) / (radius * 1.1)));
    const inside = 0.22 + 0.78 * t * t;
    // The base is held well under 1 for a second reason: twelve additive
    // sprites on top of each other reach white in the middle long before any
    // one of them does, and a white core would stop the colour saying which
    // gas it is.
    c.mat.opacity = 0.28 * inside * Math.max(0, Math.min(1, intensity));
  }

  cloudRelease(h) {
    if (h < 0) return;
    const c = this.clouds[h];
    c.used = false;
    c.group.visible = false;
    c.mat.opacity = 0;
  }

  creepRelease(h) {
    if (h < 0) return;
    this.creep[h].used = false;
    this.creep[h].alpha = 0;
  }

  /**
   * A bolt of lightning onto (x, z). Lightning Wizard's whole tell: the strike
   * has to be unmistakably a strike, and it has to say how far the splash
   * reached, because that is the part of the passive item a player cannot
   * infer from the damage numbers.
   *
   * The bolt is one polyline from well above the arena down to the floor,
   * jittered sideways at every joint. Straight would read as a laser.
   */
  lightning(x, z, radius) {
    // Every fork of one strike shares the point it lands on and nothing else,
    // so the three lines splay apart with height and meet at the floor.
    for (let f = 0; f < BOLT_FORKS; f++) {
      let slot = null;
      for (const b of this.bolts) {
        if (b.life <= 0) { slot = b; break; }
      }
      // Every bolt busy means two strikes landed within a fifth of a second,
      // which is exactly when overwriting the oldest is right - the newest
      // strike is the one the player is looking for.
      if (!slot) slot = this.bolts[f];
      const pos = slot.line.geometry.attributes.position;
      // Drifts as it descends, so the top of the bolt is not directly over the
      // point it hits. A perfectly vertical column reads as a spawn effect.
      const topX = x + (Math.random() - 0.5) * 4.5;
      const topZ = z + (Math.random() - 0.5) * 4.5;
      for (let i = 0; i <= BOLT_SEGMENTS; i++) {
        const t = i / BOLT_SEGMENTS;
        // The kink dies away to nothing at the ground so the bolt actually
        // touches the point it is meant to have struck.
        const wob = (1 - t) * 1.1 + 0.06;
        pos.setXYZ(
          i,
          topX + (x - topX) * t + (Math.random() - 0.5) * wob,
          BOLT_HEIGHT * (1 - t) + 0.05,
          topZ + (z - topZ) * t + (Math.random() - 0.5) * wob
        );
      }
      pos.needsUpdate = true;
      slot.line.visible = true;
      slot.life = BOLT_LIFE;
    }
    // The strike point gets a ring at exactly the splash radius and a column
    // of sparks: the ring is the only thing that says how far the extra damage
    // reached, which is the part of the passive item a player cannot infer
    // from watching one enemy die.
    this._boltAt.set(x, 0.05, z);
    this.shockwave(this._boltAt, 0xfff17a, radius, 0.45);
    this._boltAt.y = 0.5;
    this.burst(this._boltAt, 0xfff17a, 30, 7, 6, 0.55);
    this.burst(this._boltAt, 0x9fd8ff, 18, 4, 4, 0.45);
    this.flash(this._boltAt);
    this.addShake(0.16);
  }

  // A line from `a` to `b` for THIS frame only. Callers redraw every frame;
  // update() hides whatever was not claimed.
  beam(a, b, color) {
    if (this._beamCount >= this.beams.length) return;
    const line = this.beams[this._beamCount++];
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, a.x, a.y + 0.9, a.z);
    pos.setXYZ(1, b.x, b.y + 0.9, b.z);
    pos.needsUpdate = true;
    line.material.color.setHex(color);
    line.visible = true;
  }

  // Relight the muzzle flash at `p`. The light is never added or removed, only
  // moved and dimmed - see the light-count note in arena.js.
  flash(p) {
    this.flashLight.position.copy(p);
    this.flashLight.intensity = 26;
    this.flashT = 0.05;
  }

  // Shake is additive and capped, so many hits at once don't compound into an
  // unreadable screen. It decays exponentially in update().
  addShake(a) {
    this.shakeAmp = Math.min(0.32, this.shakeAmp + a);
  }

  // Random camera offset for this frame, written into `out`. main.js adds it
  // after the player has positioned the camera, so it must be applied every
  // frame or not at all - it is an offset, not a persistent state.
  shakeOffset(out) {
    const s = this.shakeAmp * this.shakeScale;
    out.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s * 0.8, (Math.random() - 0.5) * s * 0.4);
    return out;
  }

  // `camera` is only used to billboard the damage numbers at it. Optional, so
  // a headless harness that drives effects without a camera still settles
  // everything else.
  update(dt, camera = null) {
    this._stepDamageNumbers(dt, camera);
    // Beams are redrawn from scratch each frame, so anything not claimed since
    // the last update belongs to an owner that is gone.
    for (let i = this._beamCount; i < this.beams.length; i++) this.beams[i].visible = false;
    this._beamCount = 0;
    this._creepT += dt;
    // The field is rebuilt once, here, from whatever every zone wrote into its
    // stamp this frame - which is why the zones can be written independently
    // and still come out as one continuous shape.
    //
    // Nothing turns. The stains used to rotate slowly, each at its own rate,
    // on the theory that it made a zone look like it was spreading; what it
    // actually looked like was a decal advertising that it was a decal, since
    // scorched ground does not revolve.
    this._creepBuild();
    // Clouds churn. The whole cluster turns one way while every puff inside it
    // breathes on its own phase, which is what stops twelve dots reading as
    // twelve dots. Written per puff rather than per cloud because a uniform
    // pulse is a heartbeat, and a heartbeat reads as UI.
    this._cloudT += dt;
    for (const c of this.clouds) {
      if (!c.used) continue;
      c.group.rotation.y += c.spin * dt;
      const r = c.radius;
      for (const sp of c.puffs) {
        const u = sp.userData;
        const b = Math.sin(this._cloudT * u.rate + u.phase);
        sp.position.set(u.x * r, (u.y + b * 0.06) * r + r * 0.42, u.z * r);
        // The size beat runs against the position beat, so a puff is at its
        // biggest when it is not at its highest.
        sp.scale.setScalar(u.size * r * (0.92 - b * 0.1));
      }
    }
        // Bolts are held bright and then dropped, for the same reason the homing
    // arcs are: a GL line is one pixel wide whatever is asked for, so how long
    // it stays at full strength is the only lever on whether it is readable.
    for (const b of this.bolts) {
      if (b.life <= 0) continue;
      b.life -= dt;
      b.line.material.opacity = Math.max(0, Math.min(1, (b.life / BOLT_LIFE) * 2.6));
      if (b.life <= 0) b.line.visible = false;
    }
    this.shakeAmp *= Math.pow(0.01, dt);
    if (this.shakeAmp < 0.002) this.shakeAmp = 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      // Ease-out on the way out, so the wave reads as a snap rather than a
      // steady creep, and fade over the whole life.
      const t = 1 - r.life / r.maxLife;
      const e = 1 - Math.pow(1 - t, 3);
      r.mesh.scale.setScalar(Math.max(0.001, r.radius * e));
      r.mesh.material.uniforms.uOpacity.value = 0.85 * (1 - t);
    }
    for (const a of this.arcs) {
      if (a.life > 0) {
        a.life -= dt;
        // Held bright for most of its life and then dropped, rather than faded
        // linearly. A GL line is one pixel wide whatever we ask for, so the
        // only lever on how readable the curve is is how long it stays at full
        // strength - a linear fade spends most of the window half-visible.
        a.line.material.opacity = Math.max(0, Math.min(1, (a.life / ARC_LIFE) * 2.4)) * 0.95;
        if (a.life <= 0) a.line.visible = false;
      }
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        t.line.material.opacity = Math.max(0, (t.life / 0.07) * 0.85);
        if (t.life <= 0) t.line.visible = false;
      }
    }
    this._stepCorpses(dt);
    this._stepPool(this.sparks, dt);
    this._stepPool(this.impacts, dt);
  }

  // ---- damage numbers ------------------------------------------------------

  _initDamageNumbers() {
    this.dmgTex = makeDigitAtlas();
    // ONE MATERIAL FOR THE WHOLE POOL, blending NORMALLY, with a FOUR-component
    // vertex colour. Every part of that is one decision.
    //
    // It cannot be additive, because additive light only ever adds and the drop
    // shadow in the atlas is black - under additive blending a black texel is
    // simply nothing, and the shadow would not exist. Normal blending is also
    // what makes the numbers read as printed rather than as glowing, which is
    // what the rest of this interface's text does.
    //
    // And once it is normal, per-number fading cannot be a colour scaled toward
    // black any more - it has to be real alpha. A shared material has ONE
    // opacity, so the alpha rides in the vertex colour's fourth component,
    // which three.js multiplies into the fragment alpha. Sixty-four numbers,
    // each with its own colour and its own fade, one material, one shader.
    //
    // depthTest off so a number is never buried inside the body it came off,
    // and depthWrite off so it never occludes one.
    this.dmgMat = new THREE.MeshBasicMaterial({
      map: this.dmgTex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      vertexColors: true,
      fog: false,
    });
    this.dmgNums = [];
    // Newest-first recycling: when everything is busy the OLDEST number is
    // taken, because the hit that just landed is the one the player is looking
    // at and a dropped hit is worse than a truncated one.
    this._dmgSeq = 0;
    for (let i = 0; i < DMG_POOL; i++) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(DMG_DIGITS * 12), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(DMG_DIGITS * 8), 2));
      // FOUR components, not three: the fourth is this number's own alpha.
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(DMG_DIGITS * 16), 4));
      const idx = new Uint16Array(DMG_DIGITS * 6);
      for (let q = 0; q < DMG_DIGITS; q++) {
        const v = q * 4;
        idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
      }
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      const mesh = new THREE.Mesh(g, this.dmgMat);
      mesh.visible = false;
      // The vertices are rewritten every acquire without the bounding sphere
      // being recomputed, so the frustum test would cull numbers at random.
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      this.scene.add(mesh);
      this.dmgNums.push({
        mesh, live: false, t: 0, seq: 0, digits: 0,
        // Where it started and how far it climbs, rather than a velocity that
        // is integrated: the hold has to stop at an exact height, and a number
        // that arrived there by accumulating steps would drift by a little on
        // every frame rate.
        x0: 0, y0: 0, z0: 0, dx: 0, dz: 0, climb: 0,
        rise: 0, hold: 0, out: 0, scale: 1,
        // The colour this number is at full strength, and the last alpha
        // actually written - the buffer is only rewritten when it changes.
        r: 1, g: 1, b: 1, lastA: -1,
      });
    }
  }

  /**
   * Float a number off a body.
   *
   * SIZE IS LOGARITHMIC, not proportional. A build that hits for 4,000 is not
   * a hundred times more interesting than one that hits for 40, and a number
   * scaled that way would fill the screen. The log curve makes a big hit
   * visibly bigger and a huge hit only a little bigger than that, and the
   * clamp at DMG_MAX_H is the ceiling the whole thing needs to stay readable
   * in a crowd.
   *
   * EVERY NUMBER MOVES DIFFERENTLY. The climb, the drift, the three act
   * lengths and the starting scale are all jittered per number, because the
   * thing this system does most is fire repeatedly at the same body - and
   * forty identical animations stacked on one enemy read as a single
   * flickering number rather than as forty hits.
   *
   * @param {THREE.Vector3} pos  where it came off
   * @param {number} amount      damage dealt, before the body's remaining
   *                             health is taken into account
   * @param {boolean} crit
   */
  damageNumber(pos, amount, crit = false) {
    // Sub-1 damage rounds to 1 rather than to 0: a tick that did something has
    // to say so, and "0" floating off a body reads as a bug.
    const n = Math.max(1, Math.min(99999, Math.round(amount)));
    let slot = null;
    for (const d of this.dmgNums) {
      if (!d.live) { slot = d; break; }
    }
    if (!slot) {
      // Everything is busy, so the OLDEST goes: the hit that just landed is the
      // one the player is looking at, and a dropped hit is worse than a
      // truncated one.
      let oldest = this.dmgNums[0];
      for (const d of this.dmgNums) if (d.seq < oldest.seq) oldest = d;
      slot = oldest;
    }
    slot.seq = ++this._dmgSeq;

    const t = Math.log10(1 + n / DMG_REF) / Math.log10(1 + 40);
    const h = DMG_MIN_H + (DMG_MAX_H - DMG_MIN_H) * Math.min(1, t);
    slot.scale = h * (crit ? 1.25 : 1) * (0.92 + Math.random() * 0.16);

    const col = crit ? DMG_CRIT : DMG_WHITE;
    slot.r = col.r;
    slot.g = col.g;
    slot.b = col.b;
    slot.lastA = -1;
    slot.digits = Math.min(DMG_DIGITS, String(n).length);
    this._writeNumber(slot.mesh.geometry, n, 1, slot);

    // Started a little off the centre of the body in every direction, so two
    // hits on the same frame do not print on top of each other.
    slot.x0 = pos.x + (Math.random() - 0.5) * 0.5;
    slot.y0 = pos.y + 1.05 + (Math.random() - 0.5) * 0.3;
    slot.z0 = pos.z + (Math.random() - 0.5) * 0.5;
    const ang = Math.random() * Math.PI * 2;
    const drift = 0.18 + Math.random() * 0.28;
    slot.dx = Math.cos(ang) * drift;
    slot.dz = Math.sin(ang) * drift;
    slot.climb = DMG_CLIMB * (0.85 + Math.random() * 0.3) * (crit ? 1.15 : 1);
    slot.rise = DMG_RISE * (0.9 + Math.random() * 0.2);
    slot.hold = DMG_HOLD * (0.85 + Math.random() * 0.3);
    slot.out = DMG_OUT * (0.9 + Math.random() * 0.2);
    slot.t = 0;
    slot.live = true;
    slot.mesh.visible = true;
  }

  // Lays `n` out as centred quads and points each one at its digit in the
  // atlas. Unused quads collapse to zero area rather than being hidden, which
  // keeps the index buffer and the draw call the same size every time.
  _writeNumber(geo, n, alpha, slot) {
    const pos = geo.attributes.position.array;
    const uv = geo.attributes.uv.array;
    const s = String(n);
    const len = Math.min(DMG_DIGITS, s.length);
    const w = DMG_QUAD_W;
    // Centred on what the number actually COVERS - the last quad still runs its
    // full width past the last advance - so a two-digit and a five-digit number
    // are both centred on the body they came off.
    const x0 = -((len - 1) * DMG_ADVANCE + w) / 2;
    for (let i = 0; i < DMG_DIGITS; i++) {
      const p = i * 12;
      const u = i * 8;
      if (i >= len) {
        for (let k = 0; k < 12; k++) pos[p + k] = 0;
        continue;
      }
      const l = x0 + i * DMG_ADVANCE;
      const r = l + w;
      // Quad corners: bottom-left, bottom-right, top-right, top-left.
      pos[p] = l;      pos[p + 1] = -0.5; pos[p + 2] = 0;
      pos[p + 3] = r;  pos[p + 4] = -0.5; pos[p + 5] = 0;
      pos[p + 6] = r;  pos[p + 7] = 0.5;  pos[p + 8] = 0;
      pos[p + 9] = l;  pos[p + 10] = 0.5; pos[p + 11] = 0;
      const d = s.charCodeAt(i) - 48;
      const u0 = d / 10;
      const u1 = (d + 1) / 10;
      uv[u] = u0;     uv[u + 1] = 0;
      uv[u + 2] = u1; uv[u + 3] = 0;
      uv[u + 4] = u1; uv[u + 5] = 1;
      uv[u + 6] = u0; uv[u + 7] = 1;
    }
    this._tintNumber(geo, alpha, slot);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.uv.needsUpdate = true;
  }

  // The tint and the fade, in one write. RGB is the number's colour and stays
  // put; the fourth component is the alpha, which is the only part that moves.
  _tintNumber(geo, alpha, slot) {
    const c = geo.attributes.color;
    const arr = c.array;
    for (let i = 0; i < DMG_DIGITS * 4; i++) {
      const o = i * 4;
      arr[o] = slot.r;
      arr[o + 1] = slot.g;
      arr[o + 2] = slot.b;
      arr[o + 3] = alpha;
    }
    c.needsUpdate = true;
  }

  /**
   * Rise, hold, collapse.
   *
   * Driven off ELAPSED TIME rather than by integrating a velocity, because the
   * middle act has to stop at an exact height and stay there: a number that
   * climbed by accumulating steps would settle a little differently on every
   * frame rate, and forty of them at forty different heights is the noise this
   * animation exists to avoid.
   *
   * `camera` is only needed to face the numbers at it; when it is missing they
   * keep the orientation they had, which is what a headless test wants.
   */
  _stepDamageNumbers(dt, camera) {
    for (const d of this.dmgNums) {
      if (!d.live) continue;
      d.t += dt;
      const total = d.rise + d.hold + d.out;
      if (d.t >= total) {
        d.live = false;
        d.mesh.visible = false;
        continue;
      }

      // ACT ONE: up, fast, and easing off as it arrives. Nothing fades here -
      // the number is at full strength for the whole climb.
      // ACTS TWO AND THREE: it does not move again. The top of the arc is
      // where it is read, so that is where it waits.
      let k = 1;
      if (d.t < d.rise) {
        const p = d.t / d.rise;
        k = 1 - (1 - p) * (1 - p) * (1 - p);   // ease-out cubic
      }
      d.mesh.position.set(
        d.x0 + d.dx * k,
        d.y0 + d.climb * k,
        d.z0 + d.dz * k
      );
      if (camera) d.mesh.quaternion.copy(camera.quaternion);

      // A short pop on the way in - it arrives at 60% and reaches full size in
      // the first twelfth of a second, which is what makes a hit read as an
      // impact rather than as text appearing.
      let scale = d.scale * (0.6 + 0.4 * Math.min(1, d.t / 0.08));
      let alpha = 1;
      // ACT THREE: collapse to nothing and fade out together. The shrink is
      // eased IN, so it holds its size a moment longer and then goes quickly -
      // a linear collapse starts leaving the instant the hold ends and reads as
      // the number being cut short.
      if (d.t > d.rise + d.hold) {
        const p = Math.min(1, (d.t - d.rise - d.hold) / d.out);
        const e = p * p;
        scale = d.scale * (1 - e);
        alpha = 1 - e;
      }
      d.mesh.scale.setScalar(Math.max(0.0001, scale));
      // Quantised to 32 steps so a number whose alpha has not visibly moved
      // does not rewrite its colour buffer.
      const a = Math.round(alpha * 32) / 32;
      if (a !== d.lastA) {
        d.lastA = a;
        this._tintNumber(d.mesh.geometry, a, d);
      }
    }
  }

  // One pool's simulation. Nothing alive means nothing moved, so the sweep and
  // the two full-buffer uploads are skipped entirely - which is most frames
  // for the impact pool between shots.
  _stepPool(pool, dt) {
    if (pool.alive === 0) return;
    const { pos: p, vel: v, life: l, maxLife: ml, col: c, c0, max } = pool;
    for (let i = 0; i < max; i++) {
      if (l[i] <= 0) continue;
      l[i] -= dt;
      const i3 = i * 3;
      if (l[i] <= 0) {
        p[i3 + 1] = -100;
        c[i3] = c[i3 + 1] = c[i3 + 2] = 0;
        pool.alive--;
        continue;
      }
      v[i3 + 1] -= 9.8 * dt * 0.6;
      p[i3] += v[i3] * dt;
      p[i3 + 1] += v[i3 + 1] * dt;
      p[i3 + 2] += v[i3 + 2] * dt;
      const f = l[i] / ml[i];
      c[i3] = c0[i3] * f;
      c[i3 + 1] = c0[i3 + 1] * f;
      c[i3 + 2] = c0[i3 + 2] * f;
    }
    pool.points.geometry.attributes.position.needsUpdate = true;
    pool.points.geometry.attributes.color.needsUpdate = true;
  }

}