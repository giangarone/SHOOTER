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
  SIGN_COLOR, ROW_Z,
} from './totems.js';
import { ACTIVE_ITEMS, ACTIVE_ITEM_KEYS } from './items.js';
import { buildPixelIcon } from './pixelicons.js';

// Where the pedestal stood. The walk is the point: the mutation totems are on
// the near side at ROW_Z, and going to the far side is a choice to spend the
// wave break on something other than the pick that ends it. The arena furniture
// was already moved out of the way here - see the platform list in arena.js.
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
const BOX_W = 1.35;
const BOX_H = 1.15;
const BOX_D = 1.2;
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

// BLACK. Not dark blue, not charcoal - black, and lit so faintly that the
// faces are barely above the floor they stand on. Everything that makes the
// crate legible is light ON it: the two strips, the four marks and the ring it
// stands in. That is the whole look, and a body with any colour of its own
// competes with all three.
const BODY_COLOR = 0x000000;
const LID_COLOR = 0x000000;

// THE LIGHT STRIPS. One around the top of the body, one around the lid.
//
// The body's is the important one. It rings the OUTSIDE of the top edge and
// stands a hair proud of the top face, so it draws the mouth of the box from
// above - which is the angle the box is actually looked into once the lid is
// open and the reel is running - as well as drawing a bright line across all
// four faces from ground level.
const STRIP_H = 0.055;   // how tall the band is
const STRIP_T = 0.045;   // how far it stands off the face
const STRIP_UP = 0.012;  // how far it pokes above the top face

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
// Twelve device pixels per cell, so the texture lands on exact cell boundaries
// and NearestFilter has nothing to round.
const QM_CELL = 12;
const QM_COLS = QM_BITS[0].length;
const QM_ROWS = QM_BITS.length;
// The plane carries the bitmap's own aspect, so the cells stay square in world
// space - a square plane would stretch a tall glyph and the steps would stop
// being steps.
const QM_SCALE = 0.058; // metres per cell
const QM_GEOM = new THREE.PlaneGeometry(QM_COLS * QM_SCALE, QM_ROWS * QM_SCALE);

// The crate's own shared geometry. Built once at module load, not per box -
// there is one box in the game, but the rule is the rule and a second one
// would cost nothing.
const BOX_GEOM = new THREE.BoxGeometry(BOX_W, BOX_H, BOX_D);
const LID_GEOM = new THREE.BoxGeometry(BOX_W, LID_T, BOX_D);
// The four bars of a strip frame. Boxes rather than planes so a strip reads
// from below, from the side and from directly above without a second copy
// facing the other way. The long pair overshoot by STRIP_T at each end so the
// corners close.
const STRIP_X_GEOM = new THREE.BoxGeometry(BOX_W + STRIP_T * 2, STRIP_H, STRIP_T);
const STRIP_Z_GEOM = new THREE.BoxGeometry(STRIP_T, STRIP_H, BOX_D + STRIP_T * 2);

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

    this._buildBody();
    this._buildMarks();
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
    this.mark = makeMark(this.group);
    this._hsl = new THREE.Color();
  }

  // ---- construction ------------------------------------------------------

  _buildBody() {
    // EMISSIVE, AND ALMOST NOTHING. An honestly lit material renders as a hole
    // in the shape of a crate in an arena this dark; this is the least light
    // that still separates a black box from a black floor, and no more, because
    // the crate is meant to be the dark thing the light is attached to.
    this.bodyMat = new THREE.MeshStandardMaterial({
      color: BODY_COLOR, roughness: 0.6, metalness: 0.3,
      emissive: 0x000000,
    });
    const body = new THREE.Mesh(BOX_GEOM, this.bodyMat);
    body.position.y = BOX_H / 2;
    this.group.add(body);

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
    this.lidMat = new THREE.MeshStandardMaterial({
      color: LID_COLOR, roughness: 0.55, metalness: 0.35, emissive: 0x000000,
    });
    const lid = new THREE.Mesh(LID_GEOM, this.lidMat);
    lid.position.set(0, LID_T / 2, -BOX_D / 2);
    this.hinge.add(lid);

    // ONE MATERIAL FOR BOTH STRIPS, so the two are the same light at every
    // instant. Additive and unlit, like everything else out here that is meant
    // to burn rather than to be painted.
    this.stripMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      toneMapped: false,
    });

    // The body's, riding the top edge. STRIP_UP is what lifts it clear of the
    // top face: level with it, the frame is invisible from directly above,
    // which is exactly the angle it exists for.
    this._strips(this.group, BOX_H - STRIP_H / 2 + STRIP_UP);
    // The lid's, around its rim at mid-thickness. When the lid is shut the two
    // frames stack into a double line at the top of the crate; when it is open
    // this one is what draws the raised panel.
    this._strips(this.hinge, LID_T / 2, -BOX_D / 2);
  }

  // One frame of four bars, at height `y` in `parent`'s space and centred on
  // `cz`. Used twice - once on the body, once on the lid - which is the whole
  // reason it is a method and not two blocks of four lines.
  _strips(parent, y, cz = 0) {
    const halfW = BOX_W / 2 + STRIP_T / 2;
    const halfD = BOX_D / 2 + STRIP_T / 2;
    for (const dz of [halfD, -halfD]) {
      const bar = new THREE.Mesh(STRIP_X_GEOM, this.stripMat);
      bar.position.set(0, y, cz + dz);
      parent.add(bar);
    }
    for (const dx of [halfW, -halfW]) {
      const bar = new THREE.Mesh(STRIP_Z_GEOM, this.stripMat);
      bar.position.set(dx, y, cz);
      parent.add(bar);
    }
  }

  _buildMarks() {
    // ONE CANVAS, drawn once. The glyph never changes - only its colour does,
    // and that is the material's, not the texture's.
    const cv = document.createElement('canvas');
    cv.width = QM_COLS * QM_CELL;
    cv.height = QM_ROWS * QM_CELL;
    const c = cv.getContext('2d');
    // White, so the material's colour multiplies cleanly to any hue.
    c.fillStyle = '#ffffff';
    for (let y = 0; y < QM_ROWS; y++) {
      for (let x = 0; x < QM_COLS; x++) {
        if (QM_BITS[y][x] === '#') c.fillRect(x * QM_CELL, y * QM_CELL, QM_CELL, QM_CELL);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    // The mark is a pixel grid and is meant to stay one: filtered up to half a
    // metre it turns into a grey smudge of a `?`.
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;

    // Additive and unlit, like the strips, so the mark burns rather than being
    // painted on. Its colour is driven every frame in _driveLook, in step with
    // the strips and the circle on the floor.
    this.markMat = new THREE.MeshBasicMaterial({
      map: tex, color: 0xffffff, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      toneMapped: false,
    });

    // Half a face, plus a whisker, so the mark sits ON the panel rather than
    // inside it - the crate is a solid mesh and a coplanar decal would z-fight
    // across the whole of it.
    const outX = BOX_W / 2 + 0.012;
    const outZ = BOX_D / 2 + 0.012;
    // [x, z, yaw]. A plane faces its own local +Z, so the yaw both places the
    // mark and turns it to face out of the side it is on.
    const faces = [
      [0, outZ, 0],
      [0, -outZ, Math.PI],
      [outX, 0, Math.PI / 2],
      [-outX, 0, -Math.PI / 2],
    ];
    for (const [x, z, yaw] of faces) {
      const m = new THREE.Mesh(QM_GEOM, this.markMat);
      // Sat low of the face's centre: the strip takes the top of the crate, and
      // a mark centred between floor and lid crowds it.
      m.position.set(x, BOX_H * 0.44, z);
      m.rotation.y = yaw;
      this.group.add(m);
    }
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
    this._driveLook(time, playerPos);
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
  _driveLook(time, playerPos) {
    const e = this._eased;
    const floorY = -this.group.position.y;

    // THE COLOUR, and there is exactly one of it. Cycling while the box is shut
    // or spinning, HELD at the item's own theme while one is revealed - so the
    // far side of the arena says what is being held from anywhere in it, and
    // the moment the reel lands is a colour change as well as a flash.
    //
    // Written into _hsl once and read from there by everything that wears it,
    // which is the whole of what keeps the four marks and the ring on the floor
    // in step: they are not two things being kept in sync, they are one value
    // being used twice.
    if (this.state === 'revealed' && this.showing) {
      this._hsl.setHex(ACTIVE_ITEMS[this.showing].theme);
    } else {
      this._hsl.setHSL((time * HUE_RATE) % 1, 0.85, 0.6);
    }

    // THE CRATE ITSELF IS BLACK AND STAYS BLACK. It wore the hue as a dim
    // emissive for a while and read as a lump of whatever colour the cycle was
    // passing through - three things in the frame all saying the colour and
    // nothing saying "crate". What it has instead is the least neutral light
    // that keeps a black box off a black floor, and every coloured thing on it
    // is a light fixed TO it: two strips and four marks.
    const dim = 0.028 * e;
    this.bodyMat.emissive.setRGB(dim, dim, dim * 1.25);
    this.lidMat.emissive.setRGB(dim, dim, dim * 1.25);

    // THE STRIPS, THE MARKS AND THE RING ARE ONE COLOUR. Same value, three
    // places, so they cannot drift apart.
    this.stripMat.color.copy(this._hsl);
    // A slow breath, and never off: the strips are what draws the crate, so
    // dimming them the way the marks dim would take the box's outline with it.
    this.stripMat.opacity = e * (0.88 + 0.12 * Math.sin(time * 1.9));

    this.markMat.color.copy(this._hsl);
    // The marks breathe with the strips and step back a little once the lid is
    // up: at that point the reel is what the player is looking at, and four
    // glowing signs around it compete with the thing they were advertising.
    this.markMat.opacity = e * (0.70 + 0.20 * Math.sin(time * 1.9)) * (1 - this.lid * 0.35);

    tintMark(this.mark, this._hsl.getHex());
    driveMark(this.mark, e, floorY, time, this.pos.x);

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
    // The theme bar every card in the game wears, in the box's own violet. It
    // is what carries at the distance where the words are not yet legible.
    const theme = hex(0xb388ff);
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
    c.fillStyle = this.affordable === false ? SIGN_COLOR['-1'] : '#ffffff';
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

    // MID-SPIN THE CARD SAYS ONLY THE NAME. Four lines of effect text swapping
    // twenty times a second is unreadable noise, and worse, it makes the whole
    // card flicker in a way that pulls the eye off the icon - which is the part
    // that is actually meant to be watched. The full readout arrives with the
    // reveal, at the moment there is something to read it for.
    if (!revealed) return;

    let y = 156;
    for (const [text, sign] of def.effects) {
      c.fillStyle = SIGN_COLOR[String(sign)];
      pxText(c, text, 256, y, 16, 460);
      y += 38;
    }

    // NO COUNTDOWN NUMERAL. The item is visibly sinking into the box for the
    // whole ten seconds and the last three tick audibly; a number counting the
    // same seconds down is the deadline stated a third time, in the one place
    // on the card that is hardest to look at while watching the thing it is
    // about. What the player has to know is that the item is going, and the
    // item going is what says so.
  }
}
