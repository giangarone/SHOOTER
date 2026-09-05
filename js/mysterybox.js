// THE MYSTERY BOX: the only way an active item is obtained.
//
// It stands on the far side of the arena in every wave break, where the active
// item pedestal used to. Pay it, and the lid opens and cycles through the items
// it could give - fast at first, slowing to a crawl - until one is left hanging
// over the open box. Take it, or watch it sink back in over the next ten
// seconds and pay again.
//
// WHY THIS REPLACED THE PEDESTAL. That row rose every third shop and handed
// over one item free, with a doubling reroll beside it. Two consequences, both
// bad: a run met four active items out of thirty-seven, so most of the
// catalogue was unreachable by anyone who was not lucky; and the one mechanism
// for chasing a particular item priced itself out after two tries. The box
// inverts both. It is there every shop, it can be rolled as many times as the
// wallet allows, and the thing that limits a run's items is how much it killed
// for rather than which shop number it is on.
//
// IT IS THE OFFER AND THE TILL AT ONCE. The pedestal needed two consoles beside
// it - one to reroll, one to sell max health - and neither exists any more. A
// box you pay by shooting is a single object with a single prompt, and there is
// nothing in the far row now that is not the box.
//
// THREE RULES INHERITED FROM totems.js, all of which this file is written
// around - see the header there for why they exist:
//
//   1. NO NEW PointLights. Every glow in here is an additive mesh or sprite.
//      One more light in the scene recompiles every material in the game.
//   2. NOTHING IS ALLOCATED AFTER STARTUP. The box, the lid, the two canvases
//      and ALL THIRTY-SEVEN item icons are built in the constructor and shown
//      or hidden thereafter. This matters more here than anywhere else in the
//      game: the reel swaps icons forty times in four seconds, and building
//      them on demand would allocate thirty-seven geometries during an
//      animation whose whole job is to feel smooth.
//   3. TEXTURES ARE COUNTED. Two are spent here - the card and the question
//      mark - against a hard cap the smoke test holds the whole game to. The
//      card replaces the old pedestal's, and the mark is the one addition; see
//      the list in test/smoke.mjs before spending another.

import * as THREE from 'three';
import {
  makeMark, tintMark, driveMark, makePanel, pxText, hex, roundRect,
  HIT_GEOM, HIT_MAT, SUNK_Y, RISE_SECONDS, USE_RADIUS, ICON_Y, PANEL_R,
  SIGN_COLOR, DIM_TEXT, ROW_Z,
} from './totems.js';
import { ACTIVE_ITEMS, ACTIVE_ITEM_KEYS } from './items.js';
import { makeGlowTexture } from './effects.js';
import { buildPixelIcon } from './pixelicons.js';

// Where the pedestal stood. The walk is the point: the passive item totems are
// on the near side at ROW_Z, and going to the far side is a choice to spend
// the wave break on something other than the pick that ends it. The arena
// furniture was already moved out of the way here - see the platform list in
// arena.js.
export const BOX_Z = -ROW_Z + 4.5; //  9.5

// ---------------------------------------------------------------------------
// TIMING
// ---------------------------------------------------------------------------

// How long the lid takes, each way.
const LID_TIME = 0.35;

// THE REEL. Four seconds, which is the whole of the feel and was arrived at by
// trying the others: under three the deceleration has nowhere to happen and the
// box reads as a slot machine with a stuck reel, and over five the player has
// finished being excited before it lands and starts wondering if it is broken.
const SPIN_TIME = 4.0;
// Seconds between item swaps, at the start and at the end. The first is about
// as fast as a 24x24 icon can be swapped and still be seen as a distinct thing
// rather than as a flicker; the last is slow enough that the final three ticks
// are each a separate little event with a gap the player can feel.
const TICK_MIN = 0.06;
const TICK_MAX = 0.55;

// HOW LONG THE ITEM HANGS THERE BEFORE IT IS GONE. Ten seconds, and it spends
// all ten descending - see _driveReveal. Long enough to cross the arena for if
// the player rolled from range, short enough that the decision is a decision.
const RETURN_TIME = 10;
// The last few seconds tick audibly, once each.
const WARN_FROM = 3;

// The revealed item's height above the box at full presentation, and the height
// it has sunk to when it is gone. The second is INSIDE the box, which is what
// makes the descent read as the box taking it back rather than as it falling.
const ITEM_HIGH = ICON_Y + 1.15;
const ITEM_LOW = 0.55;

// ---------------------------------------------------------------------------
// THE BOX ITSELF
// ---------------------------------------------------------------------------

// Dimensions, in metres.
//
// NEARLY A CUBE, AND IT SITS ON THE FLOOR. It used to stand on a low plinth,
// which put a grey step under a black crate and read as a plinth with a box on
// it rather than as one object. The ring of light on the ground is the base
// now, which is what it was always doing anyway.
//
// The height went up as the plinth came off, so the lid and the item that
// rises out of it stay at roughly the altitude the far row has always read at
// from across the arena.
// A SQUARE FOOTPRINT, and that is load-bearing rather than taste. The question
// marks are CUT OUT of the walls with an alpha mask sampled through each face's
// own UVs, so every face the mark appears on has to have the same aspect or the
// glyph shears on two of the four - and one mask for four walls is one texture
// instead of two, against a cap the whole game is held to.
const BOX_W = 1.25;
const BOX_D = 1.25;
const BOX_H = 1.15;
const LID_T = 0.16;

// How fast the colour travels, in turns per second.
//
// SLOW, AND NOT SATURATED ALL THE WAY. A fast cycle is a novelty item and a
// fully saturated one is a children's toy; at this rate the colour has visibly
// moved by the time the player has walked over, and never in a way that pulls
// the eye off a fight happening somewhere else.
//
// NOTHING GLOWS AROUND THE BOX ANY MORE. There were three additive halos here
// - a soft bloom in three hues at three scales - and they are gone in every
// state, not just the idle one. Two reasons, and the second is the real one.
// They washed the crate out, and the arena already has a language for "this is
// lit": the ring of light on the floor that every totem and console in the game
// stands in. The box says what it is with that ring and with the marks on its
// own sides, and a spinning reel is easier to watch without a coloured fog
// around it.
const HUE_RATE = 0.08;

// HOW FAR THE LID GOES OVER, in radians. Past vertical on purpose: a lid that
// stops at ninety degrees is a lid standing to attention, and it hides the
// inside of the box from anybody not directly in front of it. At this angle it
// has fallen back over its own hinge and the mouth is open to the room.
const LID_ANGLE = 2.6; // ~150 degrees

// THE SPEAKER CABINETS' OWN BLACK, to the number - see speakerMat in arena.js.
// Matching the value rather than picking a new one is the whole point: those
// cabinets are the darkest object in the room and they are lit by the same
// rig, so a crate built to their spec is black in exactly the way they are, at
// every light level, without anyone having to tune it twice.
//
// AND NO EMISSIVE AT ALL. There was one - a dim neutral lift - from back when
// the box had nothing else on it and rendered as a hole in the shape of a
// crate. It is what was keeping it grey. It is not needed any more: the two
// strips, the four marks and the ring on the floor draw the whole object, and
// the black between them is supposed to be black.
const BODY_COLOR = 0x191d26;
const BODY_ROUGH = 0.85;
const BODY_METAL = 0.1;

// How thick the walls are. The box is HOLLOW - four walls and a floor, no top -
// so that an open lid shows an inside rather than a slab, and so the item can
// descend INTO something at the end of its ten seconds.
const WALL_T = 0.07;

// THE LIGHT STRIPS. One around the INSIDE of the body's top edge, one around
// the lid's rim.
//
// FLUSH, NOT PROUD. They were raised bars standing off the surface, and that
// was wrong twice over: a light with a relief on it is a fitting bolted to a
// crate, where this is meant to be light coming OUT of one, and the raised
// version cast a visible lip that made the black box look grey along its whole
// top edge. Each strip is now a skin on the surface it belongs to, sitting a
// few thousandths clear only so it does not z-fight the wall behind it.
//
// The body's runs round the inside of the opening, which is why the box has to
// be hollow for it to exist at all: it is the mouth of the box that glows, seen
// from above and from anywhere the open lid is not in the way.
const STRIP_H = 0.075;      // how tall the band is
const STRIP_EPS = 0.004;    // clearance off the surface it is painted on

// THE QUESTION MARK, ON ALL FOUR SIDES.
//
// DRAWN, NOT TYPESET. This was Press Start 2P for a while, on the reasoning
// that a character should be set in the game's own face rather than
// approximated - and the face is the wrong tool for this one. Its `?` is a
// glyph sized to sit in a line of text at eight pixels; blown up to half a
// metre on the side of a crate it is thin, and its proportions belong to a
// sentence rather than to a sign. What the box wants is a MARK: chunky, square,
// legible across the arena, and built to be looked at on its own.
//
// So it is a bitmap, at the size it is actually drawn at. Eight by eleven, one
// cell per pixel, and the cells are square because the whole point is that the
// steps read as steps.
const QM_BITS = [
  '..####..',
  '.######.',
  '.##..##.',
  '.....##.',
  '....##..',
  '...##...',
  '...##...',
  '........',
  '...##...',
  '...##...',
];
const QM_COLS = QM_BITS[0].length;
const QM_ROWS = QM_BITS.length;
// How big one cell is on the wall, in metres, and how far up the wall the
// glyph's centre sits.
const QM_CELL_M = 0.055;
const QM_AT = 0.54;
// The mask is drawn at this resolution and stretched over a whole face. The
// cells are NOT square in the canvas: a face is 1.25 wide by 1.15 tall, so a
// cell that comes out square on the WALL has to be drawn slightly narrower than
// it is tall here. Pre-compensating in the drawing is what lets one square
// texture serve a non-square face without the glyph shearing.
const QM_MASK = 256;

// THE LIT PANEL BEHIND EACH CUT-OUT - the light inside the box.
//
// Bigger than the glyph on every side, so the hole is filled with light from
// any angle a player can see into it at, rather than showing its own edge as
// they walk past. These are also what lights the inside of the crate: with the
// lid up they are four glowing panels on the inner walls, which is exactly what
// a box with a lamp in it looks like.
const LAMP_W = QM_COLS * QM_CELL_M + 0.17;
const LAMP_H = QM_ROWS * QM_CELL_M + 0.17;
const LAMP_GEOM = new THREE.PlaneGeometry(LAMP_W, LAMP_H);

// THE REVEAL GLOW. Two sprites, both in the colour of whatever the reel landed
// on: a tight one sitting down in the crate, and a wide one that reaches past
// the walls so the light does not stop at the silhouette.
//
// SPRITES, NOT A LIGHT. Rule 1 at the top of this file - a second PointLight
// recompiles every material in the game and then costs every fragment in the
// scene forever, for one object that glows for ten seconds at a wave break.
// Camera-facing quads spill past the box's edges on their own, which is the
// whole of what a light would have been added for.
//
// Both reuse the memoised glow texture from effects.js, so neither is a texture
// the game did not already have.
// FIVE LAYERS, NOT TWO, and that is what makes the edge soft.
//
// The shared glow texture is a radial gradient that runs LINEARLY to zero at
// its rim. A linear ramp has a corner in it where it lands on zero, and however
// faint that corner is, the eye finds it - two sprites meant one bloom with two
// visible boundaries in it, which is what read as a hard edge.
//
// Stacking several at different radii fixes it without touching the texture,
// which is memoised and shared with every other glow in the game (see the note
// on it in effects.js - changing the curve there would change all of them). Each
// layer's boundary lands at a different distance and each is fainter than the
// one inside it, so the sum falls away smoothly and no single corner is strong
// enough to be seen. The scales run in a rough geometric progression and the
// opacities decay faster, which is what makes the composite read as one soft
// body rather than as five discs.
const GLOW_SPEC = [
  // Down in the box, small enough to read as coming from INSIDE it.
  { y: 0.45, scale: 1.2, opacity: 0.44 },
  { y: 0.55, scale: 2.0, opacity: 0.31 },
  { y: 0.70, scale: 3.1, opacity: 0.21 },
  // The spill. Wide, faint, and centred higher so it breaks over the rim
  // rather than out through the walls.
  { y: 0.92, scale: 4.6, opacity: 0.14 },
  { y: 1.15, scale: 6.6, opacity: 0.09 },
];

// ---------------------------------------------------------------------------
// THE LIGHT
// ---------------------------------------------------------------------------
//
// Every light on the box - both halves of the top edge, the four lamps behind
// the question marks, the crate's inner floor, the glow and the ring on the
// ground - is ONE COLOUR at any instant, and that colour is:
//
//   * WHITE while the box is shut. It is a black crate with a white edge and
//     four white marks, and that is the whole of its resting state.
//   * THE COLOUR OF THE ITEM UNDER THE REEL while it spins, snapping to each
//     new one as the reel ticks.
//   * THE COLOUR OF THE ITEM IT LANDED ON while that item is on offer.
//
// THERE WAS A MOVING RAINBOW HERE and it is gone. It was a real shader - the
// hue taken from the bearing around the box so the strips and the floor ring
// sampled one wheel together - and it went because the box only ever wore it
// when it was NOT holding an item, which is to say: as its resting state. A
// resting state should be quiet. Once the idle colour is white there is no
// moment left in the cycle where a rainbow would have been drawn, so what
// remains is a plain additive material and a colour written into it, and the
// four shader programs, the onBeforeCompile patch on the floor ring and the
// per-fragment hue all went with it.
//
// The colour SNAPS between items and EASES between white and an item - see
// _driveLook, where that split is the whole reason the mix is a separate
// number from the colour.

const WHITE = new THREE.Color(0xffffff);

/**
 * One of the box's lights.
 *
 * Additive and unlit, like everything else in the far row that is meant to
 * burn rather than to be painted, and every one of them is driven by colour
 * and opacity alone - which is why they are plain materials now.
 *
 * @param {?THREE.Texture} map  a mask, or null for a bare panel
 */
function lightMaterial(map) {
  return new THREE.MeshBasicMaterial({
    map, color: 0xffffff, transparent: true, opacity: 1,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    toneMapped: false,
  });
}

// The crate's own shared geometry. Built once at module load, not per box -
// there is one box in the game, but the rule is the rule and a second one
// would cost nothing.
const LID_GEOM = new THREE.BoxGeometry(BOX_W, LID_T, BOX_D);
// The four bars of a strip frame. Boxes rather than planes so a strip reads
// from below, from the side and from directly above without a second copy
// facing the other way. The long pair overshoot by STRIP_T at each end so the
// corners close.
// The strips, as flat skins. A plane's width runs along its local X, so the
// pair that live on the left and right walls are built at the DEPTH and then
// yawed a quarter turn into place.
const IN_W = BOX_W - WALL_T * 2;
const IN_D = BOX_D - WALL_T * 2;
// THE TOP EDGE, in two halves. The wall tops are a frame WALL_T wide and that
// frame is the lit part; the band is the same light carried a little way down
// the outside, so the edge still reads from standing height, where a surface
// that only faces the sky is invisible. The footprint is square, so one
// geometry serves all four sides of each.
const TOP_X_GEOM = new THREE.PlaneGeometry(BOX_W, WALL_T);
const TOP_Z_GEOM = new THREE.PlaneGeometry(WALL_T, BOX_D - WALL_T * 2);
const EDGE_GEOM = new THREE.PlaneGeometry(BOX_W, STRIP_H);
// The four walls and the floor of the hollow crate.
// THE SIDE WALLS RUN THE FULL DEPTH and overlap the front and back pair at the
// corners, rather than being inset between them. Two solids interpenetrating
// cost nothing and cannot z-fight, and it is what makes all four OUTER faces
// exactly BOX_W x BOX_H - which is the condition for one cut-out mask serving
// all of them.
const WALL_X_GEOM = new THREE.BoxGeometry(BOX_W, BOX_H, WALL_T);
const WALL_Z_GEOM = new THREE.BoxGeometry(WALL_T, BOX_H, BOX_D);
const FLOOR_GEOM = new THREE.BoxGeometry(BOX_W, WALL_T, BOX_D);
// The glow lying on the inside floor, so the crate is lit rather than merely
// having lit panels in it.
const INNER_FLOOR_GEOM = new THREE.PlaneGeometry(IN_W, IN_D);

// ---------------------------------------------------------------------------

/**
 * Owns the whole installation. main.js holds exactly one, built at startup and
 * reused for every wave break - the same contract TotemArea has, and the same
 * method names, so main.js drives the two the same way.
 *
 * The one method it does NOT have is stationInRange(): the box has no consoles.
 */
export class MysteryBox {
  constructor(scene) {
    this.pos = new THREE.Vector3(0, 0, BOX_Z);

    // idle | opening | spinning | revealed | closing. See the state table in
    // the plan comment at the top of update().
    this.state = 'idle';
    // -1 sunk, 0..1 rising, 1 fully up. Exactly the Totem's field, driving the
    // same ease-out - the far row has to come out of the floor the same way the
    // near one does or the two read as furniture from different games.
    this.rise = 0;
    this.riseState = 'hidden'; // hidden | rising | up | sinking

    // 0 shut, 1 fully open.
    this.lid = 0;
    // Seconds into the current spin, and seconds until the next item swap.
    this.spun = 0;
    this.tickT = 0;
    // The shuffled pool this spin is walking, and where in it we are.
    this.reel = [];
    this.reelAt = 0;
    // What is showing right now - during a spin this changes forty times; at
    // the end of one it is the winner.
    this.showing = null;
    // Seconds left before the revealed item is gone. Counts RETURN_TIME -> 0.
    this.returnT = 0;
    // The last whole second announced, so the warning ticks fire once each.
    this._warned = -1;
    // Set by main.js when a pellet buys a roll, so holding the trigger on the
    // box buys one and not eight. Same field and same job as Station.shootCd.
    this.shootCd = 0;
    // The pop on the current reel swap, and how far through the spin it was.
    // main.js pitches the click off the second one.
    this._popT = 0;
    this.tickProgress = 0;
    // WHAT THE CARD SAYS ABOUT MONEY, written by main.js through setPrice().
    // The box does not know the wave, the wallet or the price ladder, and a box
    // that reached into the game for them would be a second place that prices a
    // purchase - see the note above _ammoCost in main.js.
    this.priceLabel = '';
    this.affordable = true;
    // Raised by update() for main.js to consume: 'tick' | 'reveal' | 'warn' |
    // 'shut'. The box does not own the mixer, and a class that reached for
    // game.sfx would need the game passed into update() for one line.
    this.event = null;

    this.group = new THREE.Group();
    this.group.position.set(0, SUNK_Y, BOX_Z);
    this.group.visible = false;
    scene.add(this.group);

    // What every light on the box is showing this frame, and how far it has
    // eased from white toward it. See _driveLook.
    this._hsl = new THREE.Color(0xffffff);
    this._lit = new THREE.Color(0xffffff);
    this._mix = 0;

    // The cut-outs before the body, because the walls are built WITH the holes
    // in them - the mask is part of their material, not something added after.
    this._buildCutouts();
    this._buildBody();
    this._buildPanel();
    this._buildIcons();

    // The claim volume. One invisible box covering the crate and the space the
    // item hangs in, and the only raycast target this contributes - so a pellet
    // that lands anywhere on it does exactly one thing. main.js reads the tag
    // to tell a box hit from a totem hit or a wall.
    this.hit = new THREE.Mesh(HIT_GEOM, HIT_MAT);
    this.hit.position.set(0, 1.6, 0);
    this.hit.userData.box = this;
    this.group.add(this.hit);

    // The floor mark, doubled the way the pedestal's was. The box wears the
    // rainbow rather than an offer's theme, so this is tinted every frame
    // instead of once at present().
    // The ring on the floor, tinted with the box's own colour every frame -
    // stock machinery, driven exactly as every totem's mark is. It used to need
    // a shader patch to carry the rainbow; a single colour is what tintMark
    // was already for.
    this.mark = makeMark(this.group);
  }

  // ---- construction ------------------------------------------------------

  _buildBody() {
    // ONE MATERIAL FOR THE WHOLE CRATE, walls, floor and lid. It is a piece of
    // black furniture and it should light as one.
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: BODY_COLOR, roughness: BODY_ROUGH, metalness: BODY_METAL,
    });

    // FOUR WALLS AND A FLOOR, NO TOP.
    //
    // ONLY THE OUTWARD FACE IS CUT. A BoxGeometry takes a material per face in
    // the order +x, -x, +y, -y, +z, -z, so each wall is given the masked
    // material on the one face that faces the room and the plain black on the
    // other five. Masking the inner face as well would put a SECOND hole
    // behind the first - and BoxGeometry mirrors the UVs on opposing faces, so
    // that second `?` would be back to front and would not line up with the
    // one in front of it anyway.
    const cut = this.cutMat;
    const plain = this.bodyMat;
    for (const dz of [1, -1]) {
      const mats = [plain, plain, plain, plain, plain, plain];
      mats[dz > 0 ? 4 : 5] = cut;
      const w = new THREE.Mesh(WALL_X_GEOM, mats);
      w.position.set(0, BOX_H / 2, dz * (BOX_D - WALL_T) / 2);
      this.group.add(w);
    }
    for (const dx of [1, -1]) {
      const mats = [plain, plain, plain, plain, plain, plain];
      mats[dx > 0 ? 0 : 1] = cut;
      const w = new THREE.Mesh(WALL_Z_GEOM, mats);
      w.position.set(dx * (BOX_W - WALL_T) / 2, BOX_H / 2, 0);
      this.group.add(w);
    }
    const floor = new THREE.Mesh(FLOOR_GEOM, this.bodyMat);
    floor.position.y = WALL_T / 2;
    this.group.add(floor);

    // THE LID IS HINGED ON THE WALL SIDE AND FALLS AWAY FROM THE ROOM, so the
    // mouth of the box opens toward the CENTRE of the arena - which is the only
    // side anybody ever approaches it from. Hung the other way round it opened
    // toward the wall behind it: the lid came up between the player and the
    // box and the reel span on the far side of a slab of metal.
    //
    // The hinge is a Group rather than an offset origin on the mesh: a lid that
    // rotates about its own centre swings through the crate, which is visible
    // from every angle and looks like a bug rather than like a box opening.
    this.hinge = new THREE.Group();
    this.hinge.position.set(0, BOX_H, BOX_D / 2);
    this.group.add(this.hinge);
    const lid = new THREE.Mesh(LID_GEOM, this.bodyMat);
    lid.position.set(0, LID_T / 2, -BOX_D / 2);
    this.hinge.add(lid);

    // ---- the light ------------------------------------------------------
    //
    // THE TOP EDGE OF THE CRATE IS THE LIT PART, and nothing else on it is.
    //
    // It was inside the box for a while, painted round the mouth, and that put
    // the one continuous light on the object where it could only be seen by
    // someone already standing over an open lid. On the edge it is what draws
    // the box: a bright square line along the top of a black cube, from any
    // angle and whether the lid is up or down.
    //
    // NO STRIP ON THE LID. There was one round its rim; two glowing rectangles
    // a hand apart read as two objects, and the lid is the part that MOVES -
    // outlining it made the moving half the loud half, when what wants drawing
    // is the mouth the item comes out of.
    this.stripMat = lightMaterial(null);

    // The frame across the wall tops, facing the sky. The pairs are inset
    // against each other rather than overlapping: this material is additive,
    // and four bars crossing at the corners would put four bright knots on an
    // otherwise even line.
    const topY = BOX_H + STRIP_EPS;
    for (const dz of [1, -1]) {
      const m = new THREE.Mesh(TOP_X_GEOM, this.stripMat);
      m.position.set(0, topY, dz * (BOX_D - WALL_T) / 2);
      m.rotation.x = -Math.PI / 2;
      this.group.add(m);
    }
    for (const dx of [1, -1]) {
      const m = new THREE.Mesh(TOP_Z_GEOM, this.stripMat);
      m.position.set(dx * (BOX_W - WALL_T) / 2, topY, 0);
      m.rotation.x = -Math.PI / 2;
      this.group.add(m);
    }

    // ...and the same light turned down over the outside, so the edge is still
    // an edge from the floor. Flush on the face - a skin, not a moulding.
    const edgeY = BOX_H - STRIP_H / 2;
    for (const dz of [1, -1]) {
      const m = new THREE.Mesh(EDGE_GEOM, this.stripMat);
      m.position.set(0, edgeY, dz * (BOX_D / 2 + STRIP_EPS));
      m.rotation.y = dz > 0 ? 0 : Math.PI;
      this.group.add(m);
    }
    for (const dx of [1, -1]) {
      const m = new THREE.Mesh(EDGE_GEOM, this.stripMat);
      m.position.set(dx * (BOX_W / 2 + STRIP_EPS), edgeY, 0);
      m.rotation.y = dx > 0 ? Math.PI / 2 : -Math.PI / 2;
      this.group.add(m);
    }
  }

  /**
   * The question marks, and the light behind them.
   *
   * THEY ARE HOLES, NOT DECALS. Until now each mark was an additive quad stuck
   * on the outside of a wall - light painted onto a black surface, which is a
   * different thing from light getting out of a box and reads as one. The wall
   * is now genuinely absent where the glyph is: an alpha mask on the material
   * discards those fragments, so what the player sees through a `?` is the
   * inside of the crate.
   *
   * ALPHA TEST, NOT TRANSPARENCY. `alphaTest` discards the fragment outright
   * and leaves the wall an opaque object that depth-sorts like any other; a
   * transparent wall would have to be sorted against the lamps behind it, the
   * item hanging over it and the four other walls, and would blend its own
   * black over whatever it failed to sort in front of.
   */
  _buildCutouts() {
    // ---- the mask ---------------------------------------------------------
    // White where the wall stays, black where it is cut away.
    const cv = document.createElement('canvas');
    cv.width = QM_MASK;
    cv.height = QM_MASK;
    const c = cv.getContext('2d');
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, QM_MASK, QM_MASK);
    // A cell is square in metres; in MASK PIXELS it is not, because the face it
    // is stretched over is wider than it is tall. See QM_MASK.
    const cw = QM_CELL_M / BOX_W * QM_MASK;
    const ch = QM_CELL_M / BOX_H * QM_MASK;
    const x0 = (QM_MASK - QM_COLS * cw) / 2;
    // Texture v runs DOWN from the top of the face, so a height measured up
    // from the floor becomes a distance down from the top.
    const y0 = (1 - QM_AT) * QM_MASK - (QM_ROWS * ch) / 2;
    c.fillStyle = '#000000';
    for (let y = 0; y < QM_ROWS; y++) {
      for (let x = 0; x < QM_COLS; x++) {
        if (QM_BITS[y][x] !== '#') continue;
        // Rounded to whole pixels so neighbouring cells meet exactly and the
        // glyph has no seams inside it.
        const px = Math.round(x0 + x * cw);
        const py = Math.round(y0 + y * ch);
        c.fillRect(px, py, Math.round(x0 + (x + 1) * cw) - px, Math.round(y0 + (y + 1) * ch) - py);
      }
    }
    const mask = new THREE.CanvasTexture(cv);
    // A mask is read for its alpha and must not be colour-managed on the way
    // in: sRGB-decoding it would move the threshold the alphaTest compares to.
    mask.colorSpace = THREE.NoColorSpace;
    // The glyph is a pixel grid and is meant to stay one - the cut edge should
    // be a staircase, not a blur.
    mask.magFilter = THREE.NearestFilter;
    mask.minFilter = THREE.NearestFilter;
    mask.generateMipmaps = false;

    // Same black as the rest of the crate; the only difference is the hole.
    this.cutMat = new THREE.MeshStandardMaterial({
      color: BODY_COLOR, roughness: BODY_ROUGH, metalness: BODY_METAL,
      // NOT `transparent`. alphaTest discards on its own and the wall stays in
      // the opaque pass, which is the entire point - flagging it transparent as
      // well would put it back into the sorted pass it was meant to stay out of.
      alphaMap: mask, alphaTest: 0.5,
    });

    // ---- the lamps --------------------------------------------------------
    // The hue runs DOWN the panel rather than round the box: a lamp is a hand's
    // width across, so an angular hue would make each of the four one flat
    // colour. Down the panel it is a ribbon, and it is the ribbon that shows
    // through the glyph.
    this.lampMat = lightMaterial(null);
    this.lampMat.side = THREE.DoubleSide;

    const lampY = BOX_H * QM_AT;
    // Sat on the INNER surface of each wall, directly behind its hole.
    const inZ = BOX_D / 2 - WALL_T - 0.004;
    const inX = BOX_W / 2 - WALL_T - 0.004;
    for (const dz of [1, -1]) {
      const m = new THREE.Mesh(LAMP_GEOM, this.lampMat);
      m.position.set(0, lampY, dz * inZ);
      this.group.add(m);
    }
    for (const dx of [1, -1]) {
      const m = new THREE.Mesh(LAMP_GEOM, this.lampMat);
      m.position.set(dx * inX, lampY, 0);
      m.rotation.y = Math.PI / 2;
      this.group.add(m);
    }

    // The floor of the crate, lit. Without it the inside of an open box is a
    // black pit with four glowing rectangles floating in it; with it there is
    // a lamp in a box.
    this.innerFloorMat = lightMaterial(null);
    this.innerFloor = new THREE.Mesh(INNER_FLOOR_GEOM, this.innerFloorMat);
    this.innerFloor.rotation.x = -Math.PI / 2;
    this.innerFloor.position.y = WALL_T + 0.004;
    this.group.add(this.innerFloor);

    // ---- the reveal glow --------------------------------------------------
    const tex = makeGlowTexture();
    this.glows = GLOW_SPEC.map((spec) => {
      const mat = new THREE.SpriteMaterial({
        map: tex, color: 0xffffff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        toneMapped: false,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.position.y = spec.y;
      sprite.scale.setScalar(spec.scale);
      // Off until something is actually revealed. An invisible sprite is culled
      // before it rasterises; a transparent one is still drawn.
      sprite.visible = false;
      this.group.add(sprite);
      return { sprite, mat, spec };
    });
  }

  _buildPanel() {
    // The same 512x320 card every offer in the game hangs, at the same height,
    // riding the same orbit - see PANEL_R. The box is a different KIND of thing
    // from a totem and it should still be read the same way.
    this.panel = makePanel(512, 320, 3.5, 2.2);
    // HIGHER THAN A TOTEM HANGS ITS CARD. A totem's card sits just over its
    // icon; the box has a `?` bobbing over the lid and then an item that rises
    // to head height out of it, and at the totems' 3.02 the bottom line of the
    // card was written straight across both.
    this.panel.sprite.position.set(0, 3.45, 0);
    this.group.add(this.panel.sprite);
    this._drawn = null; // what the canvas currently says, so it is not redrawn
  }

  _buildIcons() {
    // Every item's icon, plus the question mark, built now and never again.
    // Thirty-eight merged geometries at startup, against the alternative of
    // building them during the one animation in the game that cannot afford a
    // hitch. buildPixelIcon caches geometry per (key, colour) globally, so the
    // cost here is paid once for the whole session.
    this.iconAnchor = new THREE.Group();
    this.iconAnchor.position.set(0, ITEM_HIGH, 0);
    this.group.add(this.iconAnchor);

    this.icons = new Map();
    for (const id of ACTIVE_ITEM_KEYS) {
      const icon = buildPixelIcon(id, ACTIVE_ITEMS[id].theme);
      icon.visible = false;
      this.iconAnchor.add(icon);
      this.icons.set(id, icon);
    }
    // NOTHING HANGS OVER A SHUT BOX. There used to be a pixel-art `?` bobbing
    // above the lid, from before the crate had marks of its own; four of them
    // on the sides say it better and say it from every angle, and a floating
    // glyph as well was the same word twice. The anchor is empty until a reel
    // starts.
    this.icon = null;
  }

  // ---- the contract main.js drives ---------------------------------------

  // True while any part of it is standing. Same name and same meaning as
  // TotemArea.active.
  get active() {
    return this.riseState !== 'hidden';
  }

  // Whether a roll can be paid for right now. False mid-spin and false while an
  // item is still hanging there unclaimed - the box sells one thing at a time.
  get canBuy() {
    return this.riseState === 'up' && this.state === 'idle';
  }

  // The item on offer this instant, or null. Non-null only while `revealed`, so
  // a caller cannot accidentally grant whatever the reel happens to be showing.
  get offered() {
    return this.state === 'revealed' ? this.showing : null;
  }

  // Present tense of "there is nothing more to take here". main.js asks the
  // same question of the totem row, where it means the pick has been made; here
  // it is only ever false, because the box is never spent - it can always be
  // paid again. Kept so the two rows answer the same questions.
  get claimed() {
    return false;
  }

  /**
   * What the card should say the next roll costs. main.js calls this whenever
   * the answer changes - a new wave break, a roll bought, money collected - and
   * never per frame; the card redraws itself off it.
   *
   * @param {string} label       '$2000', already formatted by the caller
   * @param {boolean} affordable whether the player can actually pay it
   */
  setPrice(label, affordable) {
    if (label === this.priceLabel && affordable === this.affordable) return;
    this.priceLabel = label;
    this.affordable = affordable;
    // Force the idle card to redraw; _redraw keys on state, not on the price.
    this._drawn = null;
  }

  /** Raises the box. Called at every wave break, with no argument. */
  present() {
    this.state = 'idle';
    this.lid = 0;
    this.showing = null;
    this.returnT = 0;
    this.shootCd = 0;
    this._swapIcon(null);
    this.riseState = 'rising';
    this.rise = 0;
    this.group.visible = true;
  }

  dismiss() {
    if (this.riseState === 'hidden') return;
    this.riseState = 'sinking';
    // A SPIN IN PROGRESS IS ABANDONED, not finished on the way down. The shop
    // is closing because the player took a totem and started the next wave, and
    // an item revealing itself over an empty arena while the enemies spawn is
    // worse than the roll being lost. It is also what guarantees the box is
    // never mid-animation when versus snapshots a run.
    this.state = 'idle';
    this.showing = null;
    this.returnT = 0;
  }

  /**
   * Starts a spin. The caller has already taken the money.
   *
   * @param {string[]} pool  from shuffledPool(player.item) in items.js. The box
   *   WALKS this and never rolls against it, so the player's carried item -
   *   which is not in it - cannot even flash past on the reel, let alone win.
   */
  roll(pool) {
    this.reel = pool;
    // A random start, so two rolls in one shop do not open with the same three
    // items even though the shuffle is fresh each time.
    this.reelAt = (Math.random() * pool.length) | 0;
    this.state = 'opening';
    this.lid = 0;
    this.spun = 0;
    this.tickT = 0;
    this.returnT = 0;
    this._warned = -1;
  }

  /**
   * Hands over whatever is hanging there and shuts the box.
   *
   * @returns {?string} the item id granted, or null if there was nothing.
   */
  take() {
    const id = this.offered;
    if (!id) return null;
    this.showing = null;
    this.returnT = 0;
    this.state = 'closing';
    // THE ITEM LEAVES THE MOMENT IT IS TAKEN. Without this the icon was left
    // showing, and the closing branch of _driveIcon parked it back up over the
    // crate at full size - so a player who grabbed an item watched a copy of it
    // pop up and hang there over a box that was shutting on nothing.
    this._swapIcon(null);
    return id;
  }

  // The box, if the player could press E on it. Same contract and same shape as
  // TotemArea.usable() so main.js can rank the two rows against each other in
  // one pass.
  usable(playerPos) {
    if (this.riseState !== 'up') return null;
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    // A wider circle than a totem's. The box is a bigger object and is
    // approached from any side, where a totem is walked up to.
    const r = USE_RADIUS * 1.35;
    return d2 < r * r ? { target: this, d2 } : null;
  }

  addTargets(out) {
    if (this.riseState !== 'hidden') out.push(this.hit);
  }

  // ---- the frame ---------------------------------------------------------

  update(dt, time, playerPos) {
    this.event = null;
    if (this.riseState === 'hidden') return;
    if (this.shootCd > 0) this.shootCd -= dt;

    this._driveRise(dt);
    if (this.riseState === 'hidden') return;

    this._driveState(dt);
    this._driveLid(dt);
    this._driveLook(dt, time, playerPos);
    this._redraw();
  }

  _driveRise(dt) {
    if (this.riseState === 'rising') {
      this.rise = Math.min(1, this.rise + dt / RISE_SECONDS);
      if (this.rise >= 1) this.riseState = 'up';
    } else if (this.riseState === 'sinking') {
      this.rise -= dt / RISE_SECONDS;
      if (this.rise <= 0) {
        this.rise = 0;
        this.riseState = 'hidden';
        this.group.visible = false;
        return;
      }
    }
    // The same ease-out the totems land on.
    const e = 1 - Math.pow(1 - this.rise, 3);
    this.group.position.y = SUNK_Y + (0 - SUNK_Y) * e;
    this._eased = e;
  }

  // The state machine. Every transition is here and nowhere else, so the box
  // cannot be in two states at once or leave one without entering another.
  _driveState(dt) {
    if (this.state === 'opening') {
      this.lid = Math.min(1, this.lid + dt / LID_TIME);
      if (this.lid >= 1) {
        this.state = 'spinning';
        // The first item lands the instant the lid is up, not a tick later - a
        // beat of empty open box reads as the machine having failed to start.
        this._advanceReel();
      }
      return;
    }

    if (this.state === 'spinning') {
      this.spun += dt;
      this.tickT -= dt;
      if (this.spun >= SPIN_TIME) {
        this._land();
        return;
      }
      if (this.tickT <= 0) this._advanceReel();
      return;
    }

    if (this.state === 'revealed') {
      this.returnT -= dt;
      // One tick per second over the last few, so the window is FELT rather
      // than only seen. Ceil, so the tick lands with the numeral changing.
      const left = Math.ceil(this.returnT);
      if (left <= WARN_FROM && left !== this._warned && left > 0) {
        this._warned = left;
        this.event = 'warn';
      }
      if (this.returnT <= 0) {
        // Gone. The box takes it back and can be paid again - and the icon goes
        // with it, for the reason spelled out in take(): the descent has just
        // carried it down INSIDE the crate, and leaving it showing would lift
        // it straight back out while the lid came down through it.
        this.showing = null;
        this.state = 'closing';
        this._swapIcon(null);
        this.event = 'shut';
      }
      return;
    }

    if (this.state === 'closing') {
      this.lid = Math.max(0, this.lid - dt / LID_TIME);
      if (this.lid <= 0) this.state = 'idle';
    }
  }

  // One item swap. The interval between swaps is the whole feel of the reel.
  _advanceReel() {
    const t = Math.min(1, this.spun / SPIN_TIME);
    // CUBIC, so the slowdown is nearly all in the last quarter. A linear ramp
    // spends the middle two seconds at a medium speed that is neither exciting
    // nor suspenseful; this one is a blur that becomes a decision.
    this.tickT = TICK_MIN + (TICK_MAX - TICK_MIN) * Math.pow(t, 3);
    this.reelAt = (this.reelAt + 1) % this.reel.length;
    this.showing = this.reel[this.reelAt];
    this._swapIcon(this.icons.get(this.showing));
    // A small pop on each swap, decaying as the reel slows so the last few
    // items sit still and are read rather than bounced.
    this._popT = 0.09 * (1 - t * 0.7);
    this.event = 'tick';
    // main.js pitches the click off this.
    this.tickProgress = t;
  }

  _land() {
    this.state = 'revealed';
    this.returnT = RETURN_TIME;
    this._warned = -1;
    this.event = 'reveal';
  }

  _swapIcon(icon) {
    if (this.icon === icon) return;
    if (this.icon) this.icon.visible = false;
    this.icon = icon;
    if (icon) icon.visible = true;
  }

  _driveLid(dt) {
    // Slams shut, swings open. Cubic ease-out on the way up so it decelerates
    // into being open; linear on the way down so it lands with a bang.
    const e = 1 - Math.pow(1 - this.lid, 3);
    this.hinge.rotation.x = e * LID_ANGLE;
    if (this._popT > 0) this._popT -= dt;
  }

  // Everything that is only a look: colour, glow, where the icon hangs.
  _driveLook(dt, time, playerPos) {
    const e = this._eased;
    const floorY = -this.group.position.y;

    // ---- the colour ------------------------------------------------------
    //
    // THE WHOLE INSTALLATION IS ONE COLOUR: both halves of the top edge, the
    // four lamps behind the question marks, the crate's inner floor, the glow
    // and the ring on the ground. They are not kept in step - they are handed
    // the same value.
    //
    // TWO NUMBERS, NOT ONE, and the split is the point. `_hsl` is the item's
    // colour and it SNAPS - at the top of a spin the reel ticks every sixty
    // milliseconds, and a colour that eased between items would smear the first
    // several into one wash instead of flicking through them. `_mix` is how far
    // the lights have travelled from white toward it, and it EASES - so
    // arriving at an item is a fast swing off white and losing it is a slow
    // fade back, and neither is a cut.
    const hold = (this.state === 'spinning' || this.state === 'revealed') && this.showing;
    if (hold) this._hsl.setHex(ACTIVE_ITEMS[this.showing].theme);
    const step = Math.min(1, dt * (hold ? 16 : 4));
    this._mix += ((hold ? 1 : 0) - this._mix) * step;
    this._lit.copy(WHITE).lerp(this._hsl, this._mix);

    // A slow breath, and never off: the top edge is what draws the crate, so
    // dimming it the way the lamps dim would take the box's outline with it.
    this.stripMat.color.copy(this._lit);
    this.stripMat.opacity = e * (0.88 + 0.12 * Math.sin(time * 1.9));

    // THE LAMPS INSIDE. They breathe with the edge and NEVER dim with the lid:
    // they are the light in the box, and the four question marks are only
    // holes - dimming these would put the marks out.
    this.lampMat.color.copy(this._lit);
    this.lampMat.opacity = e * (0.80 + 0.20 * Math.sin(time * 1.9));

    // The floor of the crate is a wash rather than a fixture, so it sits well
    // under the lamps and comes up as the lid opens - the inside of the box
    // brightening as it is opened is most of what sells a light being in there.
    this.innerFloorMat.color.copy(this._lit);
    this.innerFloorMat.opacity =
      e * (0.10 + 0.30 * this.lid) * (0.85 + 0.15 * Math.sin(time * 1.9));

    tintMark(this.mark, this._lit.getHex());
    driveMark(this.mark, e, floorY, time, this.pos.x);

    // THE GLOW, in the item's own colour, and lit for the SPIN as well as the
    // reveal. It rides the same ease, so the light coming out of the box and
    // the colour of everything else on it arrive together and leave together -
    // one event, not two things that happen to coincide.
    //
    // DOWN A LITTLE WHILE IT SPINS. Every light is the same colour either way;
    // this is the one thing that is not the same BRIGHTNESS, and it is what
    // leaves the reel landing somewhere to go. At full strength throughout, the
    // spin and the answer look identical and the moment it stops stops
    // registering as a moment.
    //
    // OFF ENTIRELY WHILE THE BOX IS SHUT: the glow is the ITEM's light, and a
    // white bloom around an idle crate is the halo that was taken off it.
    const glow = this._mix * (this.state === 'spinning' ? 0.55 : 1);
    for (const gl of this.glows) {
      gl.mat.opacity = gl.spec.opacity * e * glow * (0.86 + 0.14 * Math.sin(time * 2.6));
      gl.mat.color.copy(this._hsl);
      gl.sprite.visible = gl.mat.opacity > 0.004;
    }

    // The icon rides to the player's side and turns to face them, exactly as a
    // totem's does - the reasoning is identical and is written out at
    // Totem.update: an icon parked on one face is invisible from the other, and
    // a spinning one is edge-on for a third of every turn.
    if (playerPos) {
      const a = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.iconAnchor.rotation.y = a;
      this.panel.sprite.position.x = Math.sin(a) * PANEL_R;
      this.panel.sprite.position.z = Math.cos(a) * PANEL_R;
    }

    this._driveIcon(time);
  }

  // Where the icon hangs and how big it is. Only two states put anything up
  // there at all: a reel that is running, and an item waiting to be taken.
  _driveIcon(time) {
    const anchor = this.iconAnchor;
    let y;
    let scale;

    // NOTHING HANGS OVER A SHUT BOX, or over one in the act of shutting. Both
    // ways out of `revealed` clear the icon (see take() and the expiry branch
    // in _driveState), so there is nothing to place - and this returns rather
    // than parking an empty anchor, because the anchor is where the NEXT reel
    // will start and it should be left where the last one finished.
    if (!this.icon) return;

    if (this.state === 'spinning' || this.state === 'opening') {
      // Riding just above the open lid, snapping between items with a pop on
      // each swap.
      y = ITEM_HIGH - 0.1 + (this._popT > 0 ? this._popT * 1.4 : 0);
      scale = 1.0 + (this._popT > 0 ? this._popT * 1.2 : 0);
    } else {
      // REVEALED, and descending for the whole ten seconds. The descent IS the
      // timer: there is no separate bar, because a thing visibly being taken
      // away is a clearer deadline than any bar, and the player watching the
      // item is already looking at the only place the information needs to be.
      const t = Math.max(0, this.returnT / RETURN_TIME);
      // Eased so it hangs high for the first few seconds and then goes quickly.
      // A linear descent spends the first three seconds barely moving, which
      // reads as ten seconds of nothing followed by a disappearance.
      const k = 1 - Math.pow(1 - t, 2.2);
      y = ITEM_LOW + (ITEM_HIGH - ITEM_LOW) * k;
      scale = 0.45 + 0.9 * k;
    }

    anchor.position.y = y;
    anchor.scale.setScalar(scale);
    if (this.icon) {
      // The pulse every icon in the game does. Brighter as the reel slows.
      this.icon.userData.glow.emissiveIntensity = 1.35 + Math.sin(time * 5) * 0.35;
    }
  }

  // ---- the card ----------------------------------------------------------

  // The panel says one of three things, and it is redrawn ONLY when which of
  // them changes. During a spin that is once per item swap - forty canvas
  // redraws over four seconds, which is nothing - and the rest of the time it
  // does not change at all.
  //
  // A REVEAL IS ONE REDRAW NOW. The key used to carry the whole seconds left,
  // which repainted the card ten times over a reveal to move one numeral; with
  // the countdown gone there is nothing on it that changes while the item
  // hangs there, so the key does not track the clock any more.
  _redraw() {
    let key;
    if (this.state === 'revealed') key = 'r:' + this.showing;
    else if (this.state === 'spinning') key = 's:' + this.showing;
    else key = 'i';
    if (key === this._drawn) return;
    this._drawn = key;

    const c = this.panel.canvas.getContext('2d');
    c.clearRect(0, 0, 512, 320);
    c.textAlign = 'center';

    if (this.state === 'spinning' || this.state === 'revealed') {
      this._drawItemCard(c, this.state === 'revealed');
    } else {
      this._drawIdleCard(c);
    }
    this.panel.tex.needsUpdate = true;
  }

  _drawIdleCard(c) {
    // The theme bar every card in the game wears - the thing that carries at
    // the distance where the words are not yet legible.
    //
    // WHITE, like the rest of the idle box. It was the violet the far row wore
    // back when a pedestal and two consoles stood out here in one colour; there
    // is nothing left to be the odd one out from, and a violet bar over a white
    // crate was the last piece of that scheme still arguing with the object
    // under it. When the reel is running the card wears the ITEM's colour
    // instead - see _drawItemCard - which is the only colour this card ever
    // needs to carry.
    const theme = '#ffffff';
    c.fillStyle = theme;
    c.shadowColor = theme;
    c.shadowBlur = 26;
    roundRect(c, 96, 16, 320, 7, 4);
    c.fill();
    c.shadowBlur = 0;

    c.fillStyle = '#ffffff';
    pxText(c, 'MYSTERY BOX', 256, 100, 32, 488);
    c.fillStyle = SIGN_COLOR['0'];
    pxText(c, 'ONE ACTIVE ITEM', 256, 168, 16, 460);
    // THE PRICE IS WRITTEN ON THE BOX. Every other purchase in the game is made
    // at a console whose whole job is to carry a number; the box has no console,
    // so its card is where the number lives.
    // GREY, NOT RED, when it cannot be paid - the same grey the two consoles
    // beside the totems use for the same thing. See DIM_TEXT in totems.js: red
    // in this game means a stat going the wrong way, and a price the player has
    // not saved up for yet is not that.
    c.fillStyle = this.affordable === false ? DIM_TEXT : '#ffffff';
    pxText(c, this.priceLabel || '', 256, 226, 26, 460);
    // NO BOTTOM LINE. It spelled out that the box can be rolled again, which
    // is a rule the player learns the second time they pay and does not need
    // printed at them every wave break in the meantime. The price is the only
    // thing on this card that has to be read, and it reads better alone.
  }

  _drawItemCard(c, revealed) {
    const def = ACTIVE_ITEMS[this.showing];
    if (!def) return;
    const theme = hex(def.theme);
    c.fillStyle = theme;
    c.shadowColor = theme;
    c.shadowBlur = 26;
    roundRect(c, 96, 16, 320, 7, 4);
    c.fill();
    c.shadowBlur = 0;

    c.fillStyle = theme;
    pxText(c, 'ACTIVE ITEM', 256, 52, 16, 300);
    c.fillStyle = '#ffffff';
    pxText(c, def.name, 256, 92, 32, 488);

    // THE CARD SAYS WHAT THE ITEM DOES, SPINNING OR NOT. It used to print the
    // name alone until the reveal, on the theory that effect text swapping with
    // the reel was unreadable noise - but a player watching a name they have
    // never seen go past has been told nothing at all, and the reel slows to
    // half a second a face long before it stops. What it costs is a card that
    // is busy early; what it buys is a player who can see the pool.
    //
    // MID-SPIN IT IS DIMMED. Full-strength effect text competes with the icon,
    // which is the part meant to be watched while the reel is running, so the
    // lines are painted at reduced alpha until the reveal lands and then come
    // up to full - the card resolving is itself the cue that it has stopped.
    c.globalAlpha = revealed ? 1 : 0.55;
    let y = 156;
    for (const [text, sign] of def.effects) {
      c.fillStyle = SIGN_COLOR[String(sign)];
      pxText(c, text, 256, y, 16, 460);
      y += 38;
    }
    c.globalAlpha = 1;

    // NO COUNTDOWN NUMERAL. The item is visibly sinking into the box for the
    // whole ten seconds and the last three tick audibly; a number counting the
    // same seconds down is the deadline stated a third time, in the one place
    // on the card that is hardest to look at while watching the thing it is
    // about. What the player has to know is that the item is going, and the
    // item going is what says so.
  }
}
