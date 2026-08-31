// Wave-end upgrade totems and the two stations beside them.
//
// Three shafts of light drop out of the truss when a wave is cleared, each
// standing over one upgrade's icon. The player takes one by shooting it
// ANYWHERE - the column and the icon turning inside it are one target - or by
// pressing E beside it. An unclaimed set simply stays lit until the wave after
// it is cleared, when a fresh set replaces it.
//
// BOTH WAYS IN ARE DELIBERATE
//   Walking into a totem used to claim it, and no longer does. The row stands
//   in the middle of the arena and the player crosses it at 10 m/s; a pick
//   that cannot be undone was being made by a footstep. Now it takes a shot
//   the player aimed or a key they pressed.
//
// A TOTEM CANNOT BE SHOT THE INSTANT IT ARRIVES
//   Totems come up into whatever is already in the air, so ARM_TIME holds off
//   claims by SHOT for a beat after the rise - otherwise clearing a wave next
//   to the row picks your build for you. E is exempt: a key press was never
//   the burst that was already flying.
//
// THE WHOLE TOTEM IS THE TARGET
//   An earlier revision made only a small floating core claim the upgrade, so
//   that a shot which missed an enemy standing behind a totem could not pick a
//   build for you. It cost more than it saved: hitting a wobbling 27cm orb
//   mid-fight is a marksmanship test nobody asked for, and the totem reads as
//   one object, so half of it being inert reads as a bug. Claiming is now a
//   single invisible box around the foot of the column and its icon (`hit`
//   below). The floating card above is deliberately NOT part of it - it hangs
//   wide and high over the arena, and a stray shot up there should stay a miss.
//
// EACH OFFER HAS ITS OWN COLOUR AND ICON
//   `theme` tints the shaft, the pool, the card and the icon; the icon itself
//   is a 24x24 pixel-art plate from pixelicons.js, looked up by the offer's own
//   id, that says what the upgrade does before the text is legible - a flame
//   for Incendiary, a snowflake for Cryo. Both come straight off the offer, so
//   this file still knows nothing about upgrades.
//
//   ONE ICON PER OFFER, GUARANTEED BY THE KEY. The catalogue is keyed by
//   upgrade id, so two upgrades cannot end up wearing one shape however the
//   pool is edited - the failure the old 3D catalogue needed a test to catch
//   is now unrepresentable. test/icons.mjs checks the other direction, that
//   every id has a drawing.
//
//   The icon ORBITS the axis of its column to whatever side the player is on
//   and turns to face them. It is flat art, so facing the player is the only
//   angle that means anything; the orbit is what keeps it legible from
//   anywhere in the arena rather than only from the front of its column.
//
// PERFORMANCE RULES, same as arena.js and powerups.js:
//   1. No PointLights, ever. three.js keys its shader programs on the scene's
//      light count, so adding one recompiles every material in the scene.
//      Totems glow with emissive materials and additive sprites only.
//   2. There are exactly three totems and two stations, built once at startup
//      and reused for the whole session. A new set REDRAWS the existing
//      canvases rather than allocating new ones - spawning fresh meshes and
//      textures every wave is a leak that shows up as a slow framerate decay
//      thirty waves in. Nothing here is ever disposed because nothing here is
//      ever discarded.
//   3. Icons are built on first sight and KEPT, one per offer id per totem,
//      hidden rather than thrown away. That bounds them by the size of the
//      upgrade pool instead of by the number of waves survived, and the
//      geometry behind them is cached per (offer, colour) inside pixelicons.js,
//      so three totems showing the same offer across three waves share one
//      buffer rather than building three.

import * as THREE from 'three';
import { buildPixelIcon } from './pixelicons.js';
import { makeGlowTexture } from './effects.js';
// A totem draws whatever it is handed. It knows nothing about upgrades or
// weapons - main.js normalises both into the same `offer` shape, which is why
// putting a weapon on a totem needed no changes here.

// Press E this close to a totem and it is yours.
//
// WALKING INTO A TOTEM USED TO CLAIM IT, AND NO LONGER DOES. The row stands in
// the middle of the arena, the player is moving at 10 m/s, and a pick they
// cannot undo was being made by a footstep - "I ran into it by accident" is
// not a thing a build-defining choice should ever be able to hear. Both ways
// in are now deliberate: a shot the player aimed, or a key they pressed.
//
// Narrower than a station's radius because the three totems are only 3.6m
// apart. Ranges still overlap in the middle, so main.js picks the NEAREST
// thing in range rather than the first it finds.
export const USE_RADIUS = 2.0;
// Seconds after a totem finishes rising before it will accept a claim. Totems
// come up wherever the player happens to be standing, and often into the line
// of a burst that was already in the air when the wave ended - without this,
// clearing a wave next to the row picks your build for you. Long enough to
// cover a trigger already held down, short enough that a player walking in
// deliberately never notices it.
//
// It runs only once the totem has LANDED, so the real wait after a wave ends
// is this plus the 0.7s rise. At 1.2 that was nearly two seconds in front of
// an offer that would not take a shot, which reads as the game being
// unresponsive far more often than it saves a build - the burst that killed
// the last enemy is spent well inside the rise on its own.
export const ARM_TIME = 0.45;
// The arm delay used INSTEAD when a Devil is standing at the same wave break.
// Taking a totem is what starts the next wave, so with a Devil up a stray
// pellet does not merely pick a build - it ends the shopping trip. Long enough
// that the player has to mean it - but held to the same proportion of the old
// pair, not left at a figure that now feels like a lockout beside it.
export const ARM_TIME_DEVIL = 1.0;
// Press E this close to a station.
export const STATION_RADIUS = 2.6;

// Fixed positions near the arena centre, in a row the player is already facing
// when they spawn. Checked against the platforms, crates and pillars in
// arena.js - keep them clear if you move anything.
// Exported so devil.js can place its own row relative to this one rather than
// hardcoding a second magic number that has to be kept in step.
export const ROW_Z = -5;
const TOTEM_X = [-3.6, 0, 3.6];
const STATION_X = [-6.9, 6.9];

const RISE_TIME = 0.7;
export const SUNK_Y = -3.4;
export const RISE_SECONDS = RISE_TIME;

// Effect-line colours, keyed by the sign in an upgrade's `effects` entry.
//
// SATURATED, NOT TASTEFUL. These three colours are the fastest thing on the
// card: the player reads GREEN and RED before they read a single word, and
// what the card is FOR is saying which lines are the upside and which are the
// price. The muted pair they replace (a soft mint and a coral) were chosen to
// sit nicely on a dark panel, and once the panel went away they were two
// pastels floating in a black room - close enough in value that a drawback
// could be mistaken for a benefit at a glance, which is the one mistake this
// card exists to prevent.
//
// The neutral is deliberately still quiet. It is for lines that are neither,
// and a third loud colour would cost the other two their meaning.
const SIGN_COLOR = { '1': '#00ff85', '-1': '#ff2f24', '0': '#93a0be' };
// The price line on a Devil Deal. Not one of the SIGN_COLOR entries: a cost is
// neither a benefit nor a drawback, it is the thing you are agreeing to.
const COST_COLOR = '#ff1744';

// ---------------------------------------------------------------------------
// PIXEL TEXT ON A CANVAS TEXTURE
//
// The cards are drawn in the same face the HUD is set in, so a floating offer
// and the plate it will become on the TAB sheet are visibly the same machine.
// Two things follow from the face being a bitmap one:
//
//   · SIZES ARE MULTIPLES OF 8. Press Start 2P was drawn on an 8x8 grid, and
//     any other size lands its stems between texels once the card is mapped
//     onto a quad in the arena.
//   · IT IS ROUGHLY TWICE AS WIDE AS THE SANS IT REPLACED, so a line that fit
//     before does not. `pxText` steps the size DOWN a 4px ladder until the
//     line fits the width it was given, rather than letting a long name -
//     ETERNAL AFFLICTION is eighteen characters - run off the card. Four
//     rather than eight because the difference between a name at 24 and the
//     effect lines at 16 is what makes the card have a hierarchy, and a
//     coarser ladder throws long names straight down to body size.
const PX_FONT = '"Press Start 2P", monospace';

function pxText(c, text, x, y, size, maxWidth) {
  let s = size;
  c.font = s + 'px ' + PX_FONT;
  while (s > 12 && c.measureText(text).width > maxWidth) {
    s -= 4;
    c.font = s + 'px ' + PX_FONT;
  }
  // Below the ladder's floor the glyphs would stop being readable at arena
  // distance, so the last resort is a horizontal squeeze rather than a size
  // nobody can see.
  const w = c.measureText(text).width;
  if (w > maxWidth) {
    c.save();
    c.translate(x, y);
    c.scale(maxWidth / w, 1);
    c.fillText(text, 0, 0);
    c.restore();
    return;
  }
  c.fillText(text, x, y);
}


// ---- THE OFFER IS A SHAFT OF LIGHT, NOT A PILLAR -------------------------
//
// An offer used to be a solid emissive box with the icon hovering in front of
// it, and the box was the problem: a tinted rectangle standing on the floor of
// a room whose entire language is beams, haze and lasers reads as a signpost
// borrowed from another game. What stands there now is the light itself - a
// shaft dropped out of the truss in the offer's colour, a pool where it lands,
// and the icon turning inside it. Nothing solid is left, so nothing has to be
// lit, and the wave break looks like the rig picking three things out of a
// dark room rather than like three props being wheeled on.
//
// It costs nothing the pillar did not: same rules as the rest of this file, so
// NO PointLight. The column is additive geometry and reads by itself.
//
// THE SHAFT CARRIES ITS GRADIENT IN ITS VERTICES, NOT IN A TEXTURE. The rig's
// beams use a canvas for exactly this, and the same trick a second time would
// have cost a texture the game does not have: the smoke test holds it to
// twelve, and eight columns sharing one image still leaves that image
// competing with the panels, the icons and the glow dot. So the fade along the
// shaft and the streaks around it are baked into the colour attribute of one
// shared geometry, which every column then tints through its own material.
// A vertex colour costs nothing to sample and nothing to store.
//
// The pool on the floor is the glow dot every particle and pickup in the game
// already uses (effects.js hands out exactly one), so the two things a column
// is made of add no textures at all.
const SHAFT_TOP = 12.6;
// Narrow where it leaves the truss, wide where it lands: a shaft converging
// upward is what says the source is far away and above.
const SHAFT_R_TOP = 0.42;
const SHAFT_R_BOT = 1.25;
// Rings up the shaft. One would leave the fade a straight line between the two
// ends; the falloff below is a curve, and six segments is where it stops
// reading as a taper and starts reading as light thinning out.
const SHAFT_RINGS = 6;
// Faces around it. Also how many streaks it can carry, since the streaks are
// one value per column of vertices.
const SHAFT_SIDES = 16;
// How fast the shaft turns on its own axis, in radians per second. This is the
// haze moving through a fixed beam - the same thing the rig gets by scrolling
// its beam texture - so it is deliberately slow enough that nobody catches it
// as rotation.
const SHAFT_DRIFT = 0.16;
// The pool on the floor, in metres of radius. Wider than the shaft it belongs
// to, because light landing on a floor spreads across it - and because in a
// blacked-out room the pool is the only thing telling the player where the
// ground under an offer actually is.
const POOL_R = 2.9;
let SHAFT_GEOM = null;
let POOL_GEOM = null;
let POOL_TEX = null;

// Built on the first column rather than at import: the pool's texture needs a
// canvas, and a canvas at module scope breaks every tool that imports this
// file without a DOM.
function shaftAssets() {
  if (SHAFT_GEOM) return;
  SHAFT_GEOM = new THREE.CylinderGeometry(
    SHAFT_R_TOP, SHAFT_R_BOT, SHAFT_TOP, SHAFT_SIDES, SHAFT_RINGS, true
  );
  // Cylinders are centred on their middle; this puts the open foot at y = 0 so
  // a column's origin is where it meets the floor.
  SHAFT_GEOM.translate(0, SHAFT_TOP / 2, 0);
  const uv = SHAFT_GEOM.attributes.uv;
  const col = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    // CylinderGeometry runs v from 0 at the TOP down to 1 at the bottom, so
    // this flips it: `up` is 0 at the foot and 1 at the truss.
    const up = 1 - uv.getY(i);
    // The profile is the whole argument about whether this reads as light or
    // as a plastic cone, and it is not a straight fade either way.
    //
    //   - It DISSOLVES at the very top. A shaft that is at its brightest where
    //     the geometry stops ends in a hard rim twelve metres up, which is the
    //     single most artificial thing a beam can do. The last eighth of it
    //     goes out, so the column arrives out of a dark ceiling.
    //   - It is brightest through the UPPER BODY, where nothing has to be read
    //     through it.
    //   - It EASES OFF at the foot, which is the opposite of what a real beam
    //     does and is deliberate: the foot is where the icon turns and the
    //     card hangs, and an additive surface at full strength in front of
    //     them washes out the two things the player is there to look at. The
    //     pool on the floor is what says the light landed.
    const fall = 0.22 + 0.78 * Math.pow(up, 0.9) * (1 - Math.pow(up, 8));
    // Streaks around it. Integer frequencies of the way round, so the pattern
    // closes seamlessly where the last column of vertices meets the first.
    const a = uv.getX(i) * Math.PI * 2;
    const streak = 0.88 + 0.08 * Math.sin(a * 3 + 0.4) + 0.04 * Math.sin(a * 7 + 2.6);
    const v = Math.max(0, Math.min(1, fall * streak));
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = v;
  }
  SHAFT_GEOM.setAttribute('color', new THREE.BufferAttribute(col, 3));
  POOL_GEOM = new THREE.PlaneGeometry(1, 1);
  POOL_GEOM.rotateX(-Math.PI / 2);
  POOL_TEX = makeGlowTexture();
}

// One shaft and the pool under it, tinted per offer. `parent` keeps them, but
// they are pinned to the FLOOR every frame rather than riding the group's
// rise: light from the ceiling does not come up out of the ground, so a
// column fades in where it already is while the icon and the card rise into
// it.
function makeColumn(parent, rBot = SHAFT_R_BOT, poolR = POOL_R) {
  shaftAssets();
  const shaftMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, vertexColors: true, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
    side: THREE.DoubleSide, fog: false,
  });
  const shaft = new THREE.Mesh(SHAFT_GEOM, shaftMat);
  shaft.scale.set(rBot / SHAFT_R_BOT, 1, rBot / SHAFT_R_BOT);
  parent.add(shaft);
  const poolMat = new THREE.MeshBasicMaterial({
    map: POOL_TEX, color: 0xffffff, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const pool = new THREE.Mesh(POOL_GEOM, poolMat);
  pool.scale.set(poolR * 2, 1, poolR * 2);
  parent.add(pool);
  return { shaft, shaftMat, pool, poolMat };
}

// Drives one column. `lit` is 0..1 - the rise, dimmed for an offer that cannot
// be afforded - and `floorY` is where the world floor sits in the parent's own
// space, which is the negative of however far the group has sunk.
function driveColumn(col, lit, floorY, time, phase) {
  // A slow breath, not a flicker. Fast movement here would read as a fault in
  // the light; this is haze crossing a fixed beam.
  const b = 0.86 + 0.14 * Math.sin(time * 1.7 + phase);
  // The streaks turn with the shaft. See SHAFT_DRIFT: this is haze crossing a
  // fixed light, and it is the only reason the column is not a static prop
  // once it has faded in.
  col.shaft.rotation.y = time * SHAFT_DRIFT + phase;
  col.shaft.position.y = floorY;
  col.pool.position.y = floorY + 0.03;
  col.shaftMat.opacity = 0.4 * lit * b;
  col.poolMat.opacity = 0.85 * lit * (0.82 + 0.18 * Math.sin(time * 1.7 + phase));
  // An invisible mesh is culled before rasterising; a transparent one is still
  // drawn, and these are tall double-sided additive surfaces. Same reason the
  // rig hides its beams between hits.
  col.shaft.visible = col.shaftMat.opacity > 0.01;
  col.pool.visible = col.poolMat.opacity > 0.01;
}

// The claim volume: the foot of the shaft and the space the icon turns in,
// with enough margin that a shot grazing either edge still counts. Taller and
// wider than the pillar it replaces - there is no longer a solid object to aim
// at, so the target has to cover the part of the column a player would
// naturally shoot. Not the whole 12m shaft: a claim wants to be a shot AT the
// offer, not any pellet that crossed the light on its way to the ceiling.
const HIT_GEOM = new THREE.BoxGeometry(1.7, 3.2, 1.7);
// The station's claim volume, covering its column and the icon orbiting in
// front of it. Invisible, exactly like a totem's: see the note in the Station
// constructor for why the console lost its body.
const STATION_HIT_GEOM = new THREE.BoxGeometry(1.4, 2.6, 1.4);
// Invisible, but still a raycast target - the same trick the enemy hitboxes
// use. three.js raycasts geometry, not visibility.
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
// The icon ORBITS to stay on the player's side of its column and turns to face
// them, so it is legible from any angle.
//
// CIRCULAR NOW, AND TIGHT. The ellipse was the pillar's shape: 1.15 wide and
// 0.5 deep, so a circular orbit big enough to clear the sides left the icon
// floating absurdly far off the front. With the pillar gone there is nothing
// to clear, so the icon rides close to the axis of its own light and simply
// turns to face the player - which is what the orbit was ever for.
const ICON_Y = 1.5;
const ICON_RX = 0.5;
const ICON_RZ = 0.5;
// pixelicons.js builds every plate at roughly 0.6m across, which is legible in
// the hand and too small inside a 2.5m-wide column seen from across the arena.
const ICON_SCALE = 1.35;
// The same orbit on the smaller station body: 1.0 wide and 0.5 deep, and only
// 1.4 tall, so the icon rides lower and closer in and is scaled down to match.
const ST_ICON_Y = 1.0;
const ST_ICON_RX = 0.9;
const ST_ICON_RZ = 0.55;
const ST_ICON_SCALE = 1.0;

// HOW FAR THE CARD STANDS OUT OF ITS OWN LIGHT.
//
// The card used to hang on the column's axis, which put a sheet of additive
// light between the player and every word on it. Additive is the problem: it
// only ever ADDS, so a lit shaft crossing dark text raises the text towards
// the shaft's own colour and there is no amount of contrast in the canvas that
// can win that fight - the darker a glyph is drawn, the more of the light
// behind it shows through.
//
// So the card orbits out to the player's side of the column, the same way the
// icon does, and stops clear of the shaft's outside edge. Nothing renders
// between the words and the eye any more. It is a metre and a bit of movement
// and it is the whole fix; every other approach (a glow under the text, a
// darker panel, a brighter fill) was an attempt to be legible THROUGH the
// light instead of stepping out of it.
//
// The card keeps its height, so the row still reads as three columns with
// three labels at one level rather than as three signs at different depths.
const PANEL_R = 2.0;
const ST_PANEL_R = 1.4;

export function hex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

// Rounded-rect helper - the label panels are drawn, not styled, so this is the
// only way to get a soft edge on them.
export function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

// One canvas-backed billboard. Created once per totem/station and redrawn in
// place; the texture object itself never changes.
export function makePanel(w, h, scaleX, scaleY) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  // The canvas is authored in sRGB - #ffffff means #ffffff - so it has to be
  // DECODED as sRGB when sampled. Left at the default, three.js treats the
  // texel as linear and re-encodes it on output, which lightens every mid tone
  // on the card and is why the effect lines never looked like the colours they
  // were written as.
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    // FOG OFF. Everything else in this file already opts out of the haze, and
    // the card is the reason the rule exists: a sprite lit by fog is mixed
    // towards the fog colour by distance, so white text read from across the
    // arena was arriving as grey - and grey is what it looked like, because
    // the fog colour is nearly black now that the room goes dark at the break.
    // The canvas says #ffffff and the pixels have to say it too.
    new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false, fog: false,
      // AND NO TONE MAPPING. This is the other half of "the card says what the
      // canvas says", and it is the bigger half: the renderer runs ACES
      // filmic tone mapping over the whole scene, which is right for light and
      // wrong for text - ACES rolls the top of the range off, so pure white
      // arrives on screen at about 91% and every saturated colour is pulled
      // towards the middle. A card is not a surface being lit, it is a thing
      // being READ, and it is the one thing in the room that should come out
      // of the pipe exactly as it was drawn.
      //
      // Paired with the sRGB decode above, the round trip is now exact: white
      // is 255, and the green and the red are the values in SIGN_COLOR.
      toneMapped: false,
    })
  );
  sprite.scale.set(scaleX, scaleY, 1);
  return { canvas, tex, sprite };
}

export class Totem {
  constructor(x, scene, z = ROW_Z) {
    this.upgradeId = null;
    this.offer = null;
    this.pos = new THREE.Vector3(x, 0, z);
    // -1 sunk, 0..1 rising, 1 fully up. Drives both the Y offset and whether
    // the totem can be claimed at all.
    this.rise = 0;
    this.state = 'hidden'; // hidden | rising | up | sinking
    this.claimed = false;
    // Seconds left on the arm delay; see ARM_TIME. It gates SHOTS only - E is
    // a deliberate press and never needs protecting from itself.
    this.armT = ARM_TIME;

    // False only for a Devil Deal the player cannot afford. An unaffordable
    // offer stays standing and stays readable - it is greyed out and inert
    // rather than hidden, because "you cannot pay for this" is information and
    // a pillar that simply never rose is not.
    this.enabled = true;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, z);
    this.group.visible = false;

    // Per-instance because each column wears its own upgrade's theme.
    this.col = makeColumn(this.group);

    // The claim volume, covering the pillar and the icon in front of it. It is
    // the only raycast target a totem contributes, so a pellet that lands
    // anywhere on the totem takes the upgrade and stops there.
    this.hit = new THREE.Mesh(HIT_GEOM, HIT_MAT);
    this.hit.position.set(0, 1.6, 0);
    // How main.js tells a totem hit from an ordinary wall hit.
    this.hit.userData.totem = this;
    this.group.add(this.hit);

    // Icons hang off this so the bob and spin are written once, whichever icon
    // is showing. Built lazily and kept - see rule 3 at the top of the file.
    this.iconAnchor = new THREE.Group();
    this.iconAnchor.position.set(0, ICON_Y, ICON_RZ);
    this.iconAnchor.scale.setScalar(ICON_SCALE);
    this.group.add(this.iconAnchor);
    this._icons = new Map();
    this.icon = null;

    this.panel = makePanel(512, 320, 3.5, 2.2);
    this.panel.sprite.position.set(0, 3.35, 0);
    this.group.add(this.panel.sprite);

    scene.add(this.group);
  }

  // Assigns an upgrade and starts the rise. `owned` is the player's current
  // stack count for it, shown so a repeat offer is not mistaken for a new one.
  /**
   * Assigns an offer and starts the rise.
   *
   * @param {object} offer  { id, name, theme, effects, note } for a free
   *   totem, plus { cost, enabled } for a Devil Deal - see _buildOffers() and
   *   _buildDeals() in main.js. `id` doubles as the icon key.
   */
  present(offer, armTime = ARM_TIME) {
    this.offer = offer;
    this.upgradeId = offer.id;
    this.claimed = false;
    this.enabled = offer.enabled !== false;
    this.col.shaftMat.color.setHex(offer.theme);
    this.col.poolMat.color.setHex(offer.theme);
    this._showIcon(offer);
    this._draw(offer);
    this.state = 'rising';
    this.rise = 0;
    this.armT = armTime;
    this.group.visible = true;
  }

  // Swaps in this offer's icon, building it the first time this totem is asked
  // for it. The offer's id is both the cache key and the icon key - the
  // catalogue is keyed by upgrade id, so there is no second name to keep in
  // step and no way for two offers to collide on one drawing.
  _showIcon(offer) {
    let icon = this._icons.get(offer.id);
    if (!icon) {
      icon = buildPixelIcon(offer.id, offer.theme);
      this._icons.set(offer.id, icon);
      this.iconAnchor.add(icon);
    }
    if (this.icon && this.icon !== icon) this.icon.visible = false;
    icon.visible = true;
    this.icon = icon;
  }

  // Renders the whole readout in one pass: rarity, name, then one line per
  // effect coloured by its sign. Called once when a set rises, never per frame.
  _draw(offer) {
    const c = this.panel.canvas.getContext('2d');
    const theme = hex(offer.theme);
    c.clearRect(0, 0, 512, 320);

    // An unaffordable Devil Deal is drawn at the same reduced alpha a station
    // uses for a purchase the wallet cannot cover (see Station.setLabel), so
    // "you cannot have this" looks the same wherever the player meets it.
    const dim = offer.enabled === false;
    c.globalAlpha = dim ? 0.45 : 1;

    // NO CARD BEHIND THE TEXT. The dark rounded rectangle with a coloured
    // border was the same complaint as the pillar in a smaller shape: a piece
    // of interface pinned into the world, and the one thing in the wave break
    // that could not have been made of light. What holds the words together now
    // is the dark room they are read in - see the note on the text below.
    //
    // The bar across the top stays, floating clear of the words: it is what
    // carries the theme colour at the distance where the text is not yet
    // legible, and dropping it would have cost the only thing the panel says
    // from across the arena.
    c.fillStyle = theme;
    c.shadowColor = theme;
    c.shadowBlur = 26;
    roundRect(c, 96, 16, 320, 7, 4);
    c.fill();
    // Cleared immediately: a shadow left set on the context would be inherited
    // by every line of text below, which is exactly what this card is not.
    c.shadowBlur = 0;

    // NO RARITY LINE. It used to sit above the name, and it was the one thing
    // on the card that changed nothing about the decision in front of the
    // player: a common that fits the build beats a rare that does not, and
    // printing COMMON over it only ever argued the other way. The theme bar
    // above and the effect lines below are what the pick is actually made on.
    c.textAlign = 'center';
    // NO GLOW ON THE WORDS. The first pass at this card drew every line twice,
    // a wide soft halo under solid glyphs, on the theory that light-coloured
    // text needs its own light to sit in once the panel behind it is gone. It
    // does not: a halo in the SAME colour as the glyphs it surrounds thickens
    // every stroke and fills every counter - the hole in an `e`, the gap in an
    // `a` - and the result is text that looks lit and reads worse than plain
    // text would. The letters are drawn once, at full opacity, and the card is
    // legible because the room behind it is dark.
    //
    // The bar above keeps its glow. It is a shape, not a word, and nothing has
    // to be read through it.
    //
    // Long weapon names need to shrink to stay on one line.
    c.fillStyle = '#ffffff';
    pxText(c, offer.name, 256, 92, 32, 488);

    let y = 156;
    for (const [text, sign] of offer.effects) {
      c.fillStyle = SIGN_COLOR[String(sign)];
      pxText(c, text, 256, y, 16, 460);
      y += 38;
    }

    // The price, on a Devil Deal only. It sits where a free totem's OWNED note
    // sits, because the two never appear together: a deal is max: 1, so a
    // player who owns one is never offered it again.
    //
    // Written as a SUBTRACTION rather than as "costs N max HP". The player is
    // reading three of these at a glance with a wave about to start; a minus
    // sign and a number is the shortest form the price can take, and it reads
    // the same way the red drawback lines above it do.
    if (offer.cost) {
      c.fillStyle = dim ? '#8792ad' : COST_COLOR;
      pxText(
        c, dim ? 'CANNOT AFFORD' : '-' + offer.cost + ' MAX HP', 256, 292, 24, 460
      );
    } else if (offer.note) {
      // Lifted off the near-black it used to be. With no panel under it, a
      // note at #5b6785 is a line nobody can find in a dark room.
      c.fillStyle = '#9fb0d0';
      pxText(c, offer.note, 256, 292, 16, 460);
    }
    c.globalAlpha = 1;
    c.shadowBlur = 0;
    this.panel.tex.needsUpdate = true;
  }

  // Turns a standing offer's affordability on or off and redraws the panel.
  // Only a Devil Deal ever uses it: what a deal costs does not change, but
  // what the player can pay does, every time they buy one.
  setEnabled(ok) {
    if (!this.offer || this.enabled === ok) return;
    this.enabled = ok;
    this.offer.enabled = ok;
    this._draw(this.offer);
  }

  sink() {
    if (this.state === 'hidden') return;
    this.state = 'sinking';
  }

  // Whether this offer can be taken at all: risen, unclaimed, and affordable.
  // Both ways in end up here, so an offer cannot be taken twice or taken
  // before it has finished coming out of the floor.
  canUse() {
    return this.state === 'up' && !this.claimed
      && this.enabled && this.upgradeId !== null;
  }

  // A SHOT additionally has to wait out the arm delay, because a burst fired
  // at the enemy that ended the wave is already in the air when the row comes
  // up and the player never chose it. A key press has no such problem.
  canClaim() {
    return this.canUse() && this.armT <= 0;
  }

  // Squared distance from the player, or -1 when they are out of E range.
  // Squared and unrooted because the only thing main.js does with it is
  // compare it against the other things in reach.
  useDistance(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    return d2 < USE_RADIUS * USE_RADIUS ? d2 : -1;
  }

  update(dt, time, playerPos) {
    if (this.state === 'hidden') return;

    if (this.state === 'rising') {
      this.rise = Math.min(1, this.rise + dt / RISE_TIME);
      if (this.rise >= 1) this.state = 'up';
    } else if (this.state === 'sinking') {
      this.rise -= dt / RISE_TIME;
      if (this.rise <= 0) {
        this.rise = 0;
        this.state = 'hidden';
        this.group.visible = false;
        this.upgradeId = null;
        this.offer = null;
        return;
      }
    }

    // The arm delay runs only once the pillar has landed, so a slow rise never
    // eats into it.
    if (this.state === 'up' && this.armT > 0) this.armT -= dt;

    // Ease-out on the way up so the icon and its card decelerate as they land.
    const e = 1 - Math.pow(1 - this.rise, 3);
    this.group.position.y = SUNK_Y + (0 - SUNK_Y) * e;

    // The column stays where the floor is and comes UP IN BRIGHTNESS instead,
    // which is the one thing that separates a light from a prop. An offer that
    // cannot be afforded burns low, the same way its card is drawn faded: it
    // is still there to be read, and it is visibly not on.
    driveColumn(this.col, e * (this.enabled ? 1 : 0.4),
      -this.group.position.y, time, this.pos.x);

    // The icon rides around to the player's side of the pillar and turns to
    // face them. Two problems, one fix: an icon parked on the front face is
    // invisible from behind, and a 3D shape left to spin hides itself edge-on
    // for a third of every turn - half the catalogue is a flat silhouette a few
    // centimetres deep. Orbiting solves both without the pillar having to be
    // see-through. Local +Z is the icon's front, so a yaw of `a` aims it at the
    // player and the same angle places it.
    if (playerPos) {
      const a = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.iconAnchor.position.x = Math.sin(a) * ICON_RX;
      this.iconAnchor.position.z = Math.cos(a) * ICON_RZ;
      this.iconAnchor.rotation.y = a;
      // The card rides the same angle, further out - see PANEL_R. A sprite is
      // already camera-facing, so all it needs is to be on the near side of
      // the light rather than inside it.
      this.panel.sprite.position.x = Math.sin(a) * PANEL_R;
      this.panel.sprite.position.z = Math.cos(a) * PANEL_R;
    }
    this.iconAnchor.position.y = ICON_Y + Math.sin(time * 2.4 + this.pos.x) * 0.07;
    if (this.icon) {
      this.icon.userData.glow.emissiveIntensity = 1.35 + Math.sin(time * 5) * 0.35;
    }
  }
}

// The look of each kind of console: what colour it burns and what shape sits
// in front of it. Keyed by `kind`, which is also what main.js branches on to
// decide what a purchase actually does - so adding a console is a row here and
// a case there, and nothing in this file has to learn what it sells.
//
// The two Devil-row consoles are in the same table as the two totem-row ones
// because they ARE the same object: same body, same column, same two ways in.
// Only the prices differ, and prices do not live here.
const STATION_LOOK = {
  ammo: { color: 0xffd600, icon: 'ammoBox' },
  reroll: { color: 0x4ef3ff, icon: 'gear' },
  // The Devil's pair. Red, both of them - his row wears one colour the way the
  // offers each wear their own, so a console standing in it reads as HIS
  // before it reads as a shop.
  maxhp: { color: 0xff1744, icon: 'heart' },
  dealReroll: { color: 0xff1744, icon: 'gear' },
};

// A small console beside a row of offers. Four exist: ammo and reroll beside
// the totems, max health and reroll beside the Devil's deals. All are bought
// by shooting them or by pressing E in range, and none disturbs the row it
// stands in.
export class Station {
  constructor(x, kind, scene, z = ROW_Z) {
    this.kind = kind; // 'ammo' | 'reroll' | 'maxhp' | 'dealReroll'
    this.pos = new THREE.Vector3(x, 0, z);
    const look = STATION_LOOK[kind];
    this.color = look.color;
    this.state = 'hidden';
    this.rise = 0;
    // A station is bought by shooting it, and the guns here fire far faster
    // than anyone means to buy. Without this a single burst would drain the
    // wallet on a chain of rerolls before the first one had even risen.
    this.shootCd = 0;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, z);
    this.group.visible = false;

    // A narrower column of the station's own colour, and NOTHING ELSE SOLID.
    //
    // The consoles used to keep a physical body - a small dark box that the
    // icon and the price hung in front of - on the argument that a shop is a
    // thing you walk up to and a totem is not. It read as a RECTANGLE DRAWN
    // AROUND THE ICON: the three offers in the same row are made of light and
    // have no container at all, so the consoles at the ends of the row were
    // the only things at the wave break wearing a frame, and a frame reads as
    // a different KIND of thing rather than as a different price. The column,
    // the icon and the label say everything the box was there to say, in the
    // language the rest of the row is already written in.
    this.col = makeColumn(this.group, 0.8, 1.9);
    this.col.shaftMat.color.setHex(this.color);
    this.col.poolMat.color.setHex(this.color);

    // With the body gone the console still has to be shootable, so it takes
    // the same invisible claim volume a totem has, sized around the column and
    // the icon orbiting in front of it. A station purchase is repeatable and
    // rate-limited, so a stray hit costs a shot, not a build.
    this.hit = new THREE.Mesh(STATION_HIT_GEOM, HIT_MAT);
    this.hit.position.y = 1.3;
    // How main.js tells a station hit from an ordinary wall hit.
    this.hit.userData.station = this;
    this.group.add(this.hit);

    // An icon in front of the console, orbiting to the player's side and
    // turning to face them, exactly as a totem's does. The stations were the
    // only things at the wave break identified by TEXT alone, which meant they
    // were the only things that could not be told apart until the player was
    // close enough to read them - a drum for ammo and a spiral for the reroll
    // say which is which from the far side of the arena.
    this.iconAnchor = new THREE.Group();
    this.iconAnchor.position.set(0, ST_ICON_Y, ST_ICON_RZ);
    this.iconAnchor.scale.setScalar(ST_ICON_SCALE);
    // A crate of rounds, a pair of chasing arrows, a heart. Stations are the
    // only things here that name their icon explicitly - an offer's icon is
    // its own id - because a console is not an upgrade and has no id to use.
    //
    // The two rerolls SHARE the arrows deliberately. One shape means one thing
    // is the rule the icon catalogue is built on, and these two do the same
    // thing in two different rows; giving the Devil's a shape of its own would
    // be teaching a second symbol for something the player already knows.
    this.icon = buildPixelIcon(look.icon, this.color);
    this.iconAnchor.add(this.icon);
    this.group.add(this.iconAnchor);

    this.panel = makePanel(256, 160, 1.9, 1.2);
    this.panel.sprite.position.set(0, 1.9, 0);
    this.group.add(this.panel.sprite);

    scene.add(this.group);
  }

  /**
   * The console's label. No card behind it, for the same reason an offer no
   * longer has one - see the note in Totem._draw(). A dark rounded rectangle
   * beside three columns of light is the one thing in the row that could not
   * be made of light.
   *
   * `detail` is optional and names WHAT THE PURCHASE GIVES - '+5 MAX HP'. A
   * price with nothing to weigh it against is not a decision, and MAX HEALTH
   * is the one console whose title does not already answer the question: AMMO
   * and REROLL say what they do, and 'MAX HEALTH' for $5,000 could as easily
   * be a full heal or a doubling. It is drawn in the same green an offer card
   * writes its upsides in, so the gain reads the way every other gain in the
   * game does.
   *
   * With no detail the two lines sit where they always have, so the consoles
   * that have nothing more to say are untouched.
   */
  setLabel(title, cost, enabled, detail = '') {
    const c = this.panel.canvas.getContext('2d');
    const col = hex(this.color);
    c.clearRect(0, 0, 256, 160);

    c.textAlign = 'center';
    c.globalAlpha = enabled ? 1 : 0.45;
    // The colour bar, floating clear of the words: it is what says which
    // console this is from further away than the text can be read.
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 18;
    roundRect(c, 68, detail ? 14 : 20, 120, 5, 3);
    c.fill();

    // Drawn once and clean, for the reason in Totem._draw(): a glow the colour
    // of the letters it sits under is a thicker, muddier version of the same
    // letters.
    c.shadowBlur = 0;
    pxText(c, title, 128, detail ? 58 : 74, 24, 232);

    if (detail) {
      c.fillStyle = enabled ? SIGN_COLOR['1'] : '#8792ad';
      pxText(c, detail, 128, 98, 16, 232);
    }

    c.fillStyle = enabled ? '#ffffff' : '#8792ad';
    pxText(c, cost, 128, detail ? 138 : 120, 24, 232);
    c.globalAlpha = 1;
    this.panel.tex.needsUpdate = true;
  }

  // Raises the console, or catches one that is already on its way back down.
  // A station that is UP stays up rather than dropping and re-rising, which
  // would be a visual reset of something that never went anywhere.
  show() {
    if (this.state === 'up') return;
    this.state = 'rising';
    this.group.visible = true;
  }
  // Only a fully-risen station off cooldown can be bought by shooting.
  canShoot() {
    return this.state === 'up' && this.shootCd <= 0;
  }
  sink() {
    if (this.state !== 'hidden') this.state = 'sinking';
  }
  // Squared distance from the player, or -1 when out of E range - the same
  // contract Totem.useDistance() has, so main.js can rank the two together.
  useDistance(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    return d2 < STATION_RADIUS * STATION_RADIUS ? d2 : -1;
  }
  isUp() {
    return this.state === 'up';
  }

  update(dt, time, playerPos) {
    if (this.shootCd > 0) this.shootCd -= dt;
    if (this.state === 'hidden') return;
    if (this.state === 'rising') {
      this.rise = Math.min(1, this.rise + dt / RISE_TIME);
      if (this.rise >= 1) this.state = 'up';
    } else if (this.state === 'sinking') {
      this.rise -= dt / RISE_TIME;
      if (this.rise <= 0) {
        this.rise = 0;
        this.state = 'hidden';
        this.group.visible = false;
        return;
      }
    }
    const e = 1 - Math.pow(1 - this.rise, 3);
    this.group.position.y = SUNK_Y + (0 - SUNK_Y) * e;
    // Dimmer than an offer's: the two stations frame the row and must not
    // compete with the three things in it that are actually a choice.
    driveColumn(this.col, e * 0.65, -this.group.position.y, time, this.pos.x);

    // See the note on the totem's orbit: local +Z is the icon's front, so one
    // angle both places it and aims it.
    if (playerPos) {
      const a = Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.iconAnchor.position.x = Math.sin(a) * ST_ICON_RX;
      this.iconAnchor.position.z = Math.cos(a) * ST_ICON_RZ;
      this.iconAnchor.rotation.y = a;
      this.panel.sprite.position.x = Math.sin(a) * ST_PANEL_R;
      this.panel.sprite.position.z = Math.cos(a) * ST_PANEL_R;
    }
    this.iconAnchor.position.y = ST_ICON_Y + Math.sin(time * 2.4 + this.pos.x) * 0.06;
    this.icon.userData.glow.emissiveIntensity = 1.2 + Math.sin(time * 5) * 0.3;
  }
}

// Owns the whole wave-end installation. main.js holds exactly one of these,
// built at startup and reused for every set.
export class TotemArea {
  constructor(scene) {
    this.totems = TOTEM_X.map((x) => new Totem(x, scene));
    this.ammoStation = new Station(STATION_X[0], 'ammo', scene);
    this.rerollStation = new Station(STATION_X[1], 'reroll', scene);
    this.stations = [this.ammoStation, this.rerollStation];
    // Rerolls bought against the CURRENT set; reset every time one rises.
    this.rerolls = 0;
  }

  // True while any totem is still standing, claimed or not.
  get active() {
    return this.totems.some((t) => t.state !== 'hidden');
  }

  // True once a totem from the current set has been taken.
  get claimed() {
    return this.totems.some((t) => t.claimed);
  }

  /**
   * Raises a fresh set. Any set still standing is replaced outright, which is
   * what happens when the player never claimed the last one.
   *
   * @param {object[]} offers  up to three offers from _buildOffers()
   * @param {boolean} resetRerolls  false when this is itself a reroll, so the
   *   escalating price is not reset by the set it just paid for.
   */
  present(offers, resetRerolls = true, armTime = undefined) {
    if (resetRerolls) this.rerolls = 0;
    this.totems.forEach((t, i) => {
      if (i < offers.length) t.present(offers[i], armTime);
      else t.sink();
    });
    if (!offers.length) {
      this.dismiss();
      return;
    }
    // Unconditional: show() itself knows to leave a standing console alone,
    // and the old `if hidden` test missed one caught mid-sink, which then
    // finished sinking and left the row with no shop beside it.
    for (const s of this.stations) s.show();
  }

  // Sinks everything - the claimed totem, its two siblings and both stations.
  dismiss() {
    for (const t of this.totems) t.sink();
    for (const s of this.stations) s.sink();
  }

  // The NEAREST totem the player could press E on, with its squared distance,
  // or null. Nearest rather than first: at 3.6m apart with a 2m radius the
  // middle totem's range overlaps both its neighbours', and "whichever came
  // first in the array" would take a different one than the player is looking
  // at.
  usable(playerPos) {
    let best = null;
    let bestD = Infinity;
    for (const t of this.totems) {
      if (!t.canUse()) continue;
      const d = t.useDistance(playerPos);
      if (d < 0 || d >= bestD) continue;
      bestD = d;
      best = t;
    }
    return best ? { target: best, d2: bestD } : null;
  }

  stationInRange(playerPos) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.stations) {
      if (!s.isUp()) continue;
      const d = s.useDistance(playerPos);
      if (d < 0 || d >= bestD) continue;
      bestD = d;
      best = s;
    }
    return best ? { target: best, d2: bestD } : null;
  }

  // Appends this set's shootable parts to a raycast target list. One invisible
  // box per standing totem or station, sized around the pillar and its icon:
  // hitting it anywhere claims the offer, or buys from the console, and stops
  // the pellet. The two carry different userData keys, which is how main.js
  // tells a claim from a purchase.
  addTargets(out) {
    for (const t of this.totems) {
      if (t.state === 'hidden') continue;
      out.push(t.hit);
    }
    for (const s of this.stations) {
      if (s.state !== 'hidden') out.push(s.hit);
    }
  }

  update(dt, time, playerPos) {
    for (const t of this.totems) t.update(dt, time, playerPos);
    for (const s of this.stations) s.update(dt, time, playerPos);
  }
}
