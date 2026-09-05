// Wave-end upgrade totems and the two stations beside them.
//
// Three marks of light appear on the floor when a wave is cleared, each with
// one upgrade's icon turning over it. The player takes one by shooting it
// ANYWHERE - the mark and the icon above it are one target - or by
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
//   single invisible box around the mark on the floor and its icon (`hit`
//   below). The floating card above is deliberately NOT part of it - it hangs
//   wide and high over the arena, and a stray shot up there should stay a miss.
//
// EACH OFFER HAS ITS OWN COLOUR AND ICON
//   `theme` tints the floor mark, the card and the icon; the icon itself
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
//   The icon ORBITS the axis of its mark to whatever side the player is on
//   and turns to face them. It is flat art, so facing the player is the only
//   angle that means anything; the orbit is what keeps it legible from
//   anywhere in the arena rather than only from one side of the row.
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
// The arm delay used INSTEAD when the active item row is standing at the same
// wave break. Taking a totem is what starts the next wave, so with a second row
// up a stray
// pellet does not merely pick a build - it ends the shopping trip. Long enough
// that the player has to mean it - but held to the same proportion of the old
// pair, not left at a figure that now feels like a lockout beside it.
export const ARM_TIME_ITEM = 1.0;
// Press E this close to a station.
export const STATION_RADIUS = 2.6;

// Fixed positions near the arena centre, in a row the player is already facing
// when they spawn. They no longer have to be checked against arena furniture:
// generated terrain has sunk back under the floor before a set rises, so the
// row always stands on a bare floor. The one case where the two can meet is a
// set left UNCLAIMED into the next wave, and terrain.js reserves a circle
// around the row for exactly that - see the `reserved` argument to
// generateLayout.
// Exported so items.js can place its own row relative to this one rather than
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
export const SIGN_COLOR = { '1': '#00ff85', '-1': '#ff2f24', '0': '#93a0be' };

// WHAT A PRICE YOU CANNOT PAY IS WRITTEN IN. Grey, and deliberately not the
// red of SIGN_COLOR['-1']: red in this game means a stat going the wrong way -
// a cost, a penalty, damage taken - and a price is none of those things. It is
// the same number it always was and the player simply does not have it yet.
// Grey says "not yet" where red says "this is bad for you", and the box's card
// and the two consoles all say it the same way.
export const DIM_TEXT = '#8792ad';

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

export function pxText(c, text, x, y, size, maxWidth) {
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


// ---- AN OFFER IS A MARK ON THE FLOOR, NOT A SHAFT OF LIGHT ---------------
//
// This has been a solid emissive pillar, then a 12.6m shaft dropped out of the
// truss, and is now a pool of light on the ground with a ring around it. Each
// change was made for the same reason and the shaft failed it the same way the
// pillar did: SOMETHING WAS STANDING BETWEEN THE PLAYER AND THE OFFER.
//
// The shaft was an additive DoubleSide cylinder about 1.15m wide at icon
// height, and the icon turns at 0.5m off the axis - inside it. So the near
// wall of the light was drawn OVER the icon every frame, and additive only
// ever adds, so no amount of contrast in the icon could win: the brighter the
// column, the more washed out the thing it was supposed to be advertising.
// The card had already fled the same problem by orbiting out to PANEL_R; the
// icon never could, because the icon is what the light is pointing at.
//
// So the light now lies on the ground. Nothing renders between the eye and
// the offer at any angle, and the two things the player is there to read -
// the icon and the card - stand in clear air.
//
// WHAT REPLACES THE VERTICAL READ. A 12m column was visible across a blacked
// out arena and a floor decal is not, so the mark cannot just be the old pool
// left behind on its own - a soft-edged disc with nothing else to it reads as
// a smudge on the floor rather than as an offer. Four parts do the job the
// shaft did:
//
//   1. THE POOL. The soft tinted glow, as before. It is the light itself and
//      it says where the ground under an offer is.
//   2. THE RIM. A dashed ring turning slowly at the pool's edge. This is the
//      part that makes the mark read as PUT THERE rather than spilled: a soft
//      gradient has no outline, and an outline is what the eye finds first in
//      a dark room. Dashed and turning rather than solid and still, because a
//      solid circle is a decal and a moving one is a thing that is ON.
//   3. THE RIPPLE. A second ring born at the middle every couple of seconds
//      and expanding out through the rim, fading as it goes. This is the
//      "come here" the column used to shout by being tall.
//   4. THE HAZE. An ankle-high flare of light standing off the pool,
//      brightest where it meets the floor and gone a foot up. It gives the
//      mark volume so it is not a sticker, and it is deliberately far below
//      ICON_Y - it stops long before it reaches anything anyone has to read.
//
//      IT HAS TO STAY ALMOST INVISIBLE. The first cut of this was 0.45m tall
//      at half opacity and it read as a brass TUB with the icon sitting down
//      inside it - which is the pillar all over again, a solid prop wearing
//      the offer's colour. Additive light on a black floor goes solid far
//      sooner than it looks like it will on paper. Short, faint and flared
//      wide is the difference between spill and a container.
//
// THEY ARE TIGHTER THAN THE OLD POOL, AND THAT IS THE POINT. The pool was
// 2.9m of radius on totems standing 3.6m apart, so neighbouring pools already
// overlapped by more than half. That was survivable while the shafts were the
// thing being read - three columns are obviously three - but with the floor
// carrying the whole read, three overlapping discs merge into one lit strip
// and the row stops looking like three separate choices. Everything here fits
// inside the spacing with dark ground left between, because the gap is what
// makes them count as three.
//
// NO TEXTURES, AT ALL. The texture budget in test/smoke.mjs is fully spent at
// thirteen, so every part of this is either the shared glow dot effects.js
// already hands out or geometry carrying its own gradient in a vertex colour
// attribute - the same trick the shaft used for its falloff, which is the one
// thing about the shaft worth keeping. A vertex colour costs nothing to
// sample and nothing to store.
//
// Same rules as the rest of this file: NO PointLight, and the meshes are
// built once per totem and reused for the whole session.

// The soft glow disc, in metres of radius. See the note above about the row
// spacing: this is the outermost thing a totem puts on the floor and two of
// them 3.6m apart have to leave dark ground between.
const POOL_R = 1.7;
// Where the dashed rim sits, inside the pool's falloff so the ring reads as
// the edge of the light rather than as a hoop lying outside it.
const RIM_R = 1.28;
// How fast the rim turns, in radians per second. Slow: this is a light that
// is on, not a loading spinner. It is the same argument SHAFT_DRIFT made.
const RIM_SPIN = 0.5;
// Seconds between ripples. Long enough that it reads as a pulse rather than
// as an animation running.
const RIPPLE_PERIOD = 2.2;
// How high the ground haze stands. ICON_Y is 1.5 and the card is higher
// still; this has to stop well short of both, and does.
const HAZE_H = 0.3;

// Rim ring geometry. Three rows of vertices across the band - inner, middle,
// outer - coloured 0/1/0 so the band fades out on both edges without a
// texture, and stepped along its length into dashes the same way.
const RIM_SEGS = 128;
const RIM_DASHES = 9;
// Fraction of each dash slot that is lit. Under a half reads as a dotted
// line; this is a ring with breaks in it.
const RIM_DUTY = 0.62;
// How much of a slot the dash takes to fade in and out, as a fraction. Zero
// would alias into a flickering picket fence as the ring turns; this softens
// the ends over about three segments.
const RIM_SOFT = 0.09;
// Radial half-width of the rim band, as a fraction of RIM_R.
const RIM_W = 0.085;

let POOL_GEOM = null;
let POOL_TEX = null;
let RIM_GEOM = null;
let RIPPLE_GEOM = null;
let HAZE_GEOM = null;

// A flat annulus of unit radius lying in the XZ plane, with a soft-edged
// radial profile baked into its vertex colours. `dashes` of 0 gives a solid
// ring; anything else breaks it up. Shared by the rim and the ripple, which
// differ only in whether they are broken and how wide they are.
function makeRingGeom(halfWidth, dashes) {
  const rows = [1 - halfWidth, 1, 1 + halfWidth];
  const pos = [];
  const col = [];
  const idx = [];
  for (let s = 0; s <= RIM_SEGS; s++) {
    const f = s / RIM_SEGS;
    const a = f * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    // The dash profile. `edge` is the distance to the nearer end of the lit
    // part of this slot, so it goes negative in the gaps and the clamp turns
    // that into darkness.
    let dash = 1;
    if (dashes > 0) {
      const slot = (f * dashes) % 1;
      const edge = Math.min(slot, RIM_DUTY - slot);
      dash = Math.max(0, Math.min(1, edge / RIM_SOFT));
    }
    for (let r = 0; r < 3; r++) {
      pos.push(ca * rows[r], 0, sa * rows[r]);
      // 0 at both edges of the band, full in the middle.
      const v = (r === 1 ? 1 : 0) * dash;
      col.push(v, v, v);
    }
    if (s < RIM_SEGS) {
      const b = s * 3;
      idx.push(b, b + 1, b + 4, b, b + 4, b + 3);
      idx.push(b + 1, b + 2, b + 5, b + 1, b + 5, b + 4);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

// Built on the first column rather than at import: the pool's texture needs a
// canvas, and a canvas at module scope breaks every tool that imports this
// file without a DOM.
function markAssets() {
  if (POOL_GEOM) return;
  POOL_GEOM = new THREE.PlaneGeometry(1, 1);
  POOL_GEOM.rotateX(-Math.PI / 2);
  POOL_TEX = makeGlowTexture();
  RIM_GEOM = makeRingGeom(RIM_W, RIM_DASHES);
  // The ripple is solid - a dashed ring travelling outwards reads as debris -
  // and wider, because a ring that is moving wants a softer edge than one
  // that is parked.
  RIPPLE_GEOM = makeRingGeom(0.16, 0);
  // The knee-high haze: an open cylinder of unit radius and unit height,
  // flaring very slightly outward, at full strength where it meets the floor
  // and gone by the top. That is the opposite of the shaft's profile and it
  // is the whole difference between light lying on the ground and light
  // falling onto it.
  HAZE_GEOM = new THREE.CylinderGeometry(1.32, 1, 1, 24, 3, true);
  HAZE_GEOM.translate(0, 0.5, 0);
  const uv = HAZE_GEOM.attributes.uv;
  const hcol = new Float32Array(uv.count * 3);
  for (let i = 0; i < uv.count; i++) {
    // v runs 0 at the top to 1 at the bottom, so this is 1 at the floor.
    const up = 1 - uv.getY(i);
    const fall = Math.pow(1 - up, 2.6);
    // The same integer-frequency streaks the shaft carried, so the haze has
    // something to be when it turns. Seamless where the last column of
    // vertices meets the first.
    const a = uv.getX(i) * Math.PI * 2;
    const streak = 0.82 + 0.12 * Math.sin(a * 3 + 0.4) + 0.06 * Math.sin(a * 5 + 2.6);
    const v = Math.max(0, Math.min(1, fall * streak));
    hcol[i * 3] = hcol[i * 3 + 1] = hcol[i * 3 + 2] = v;
  }
  HAZE_GEOM.setAttribute('color', new THREE.BufferAttribute(hcol, 3));
}

// One floor mark, tinted per offer. `parent` keeps the meshes, but they are
// pinned to the FLOOR every frame rather than riding the group's rise: this
// is light ON the ground, so it fades up where it already is while the icon
// and the card rise out of it.
//
// The two radii are the caller's whole say in how big the mark is - a station
// takes a smaller one - and everything inside scales off them together, so
// the rim never drifts out of its pool.
export function makeMark(parent, rimR = RIM_R, poolR = POOL_R) {
  markAssets();
  // One material per part per totem because each wears its own offer's
  // theme; the geometry behind them is shared by every mark in the game.
  const mat = (geom, extra) => {
    const m = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
      ...extra,
    });
    const mesh = new THREE.Mesh(geom, m);
    parent.add(mesh);
    return { mesh, m };
  };
  const poolPart = mat(POOL_GEOM, { map: POOL_TEX });
  poolPart.mesh.scale.set(poolR * 2, 1, poolR * 2);
  const rimPart = mat(RIM_GEOM, { vertexColors: true, side: THREE.DoubleSide });
  rimPart.mesh.scale.setScalar(rimR);
  const ripplePart = mat(RIPPLE_GEOM, { vertexColors: true, side: THREE.DoubleSide });
  const hazePart = mat(HAZE_GEOM, { vertexColors: true, side: THREE.DoubleSide });
  hazePart.mesh.scale.set(rimR, HAZE_H, rimR);
  return {
    pool: poolPart.mesh, poolMat: poolPart.m,
    rim: rimPart.mesh, rimMat: rimPart.m,
    ripple: ripplePart.mesh, rippleMat: ripplePart.m,
    haze: hazePart.mesh, hazeMat: hazePart.m,
    rimR,
  };
}

// Sets the colour of every part of a mark at once. Callers used to tint the
// shaft and the pool by hand, which is two lines that have to be kept in step
// and were about to become five.
export function tintMark(mark, hexColor) {
  mark.poolMat.color.setHex(hexColor);
  mark.rimMat.color.setHex(hexColor);
  mark.rippleMat.color.setHex(hexColor);
  mark.hazeMat.color.setHex(hexColor);
}

// Drives one mark. `lit` is 0..1 - the rise, dimmed for an offer that cannot
// be afforded - and `floorY` is where the world floor sits in the parent's own
// space, which is the negative of however far the group has sunk.
export function driveMark(mark, lit, floorY, time, phase) {
  // A slow breath, not a flicker. Fast movement here would read as a fault in
  // the light.
  const b = 0.86 + 0.14 * Math.sin(time * 1.7 + phase);
  // Everything lies within a few centimetres of the floor, and all of it is
  // additive with depth writing off, so the small offsets are only there to
  // keep the flat pieces off the floor plane itself and out of each other.
  mark.pool.position.y = floorY + 0.03;
  mark.rim.position.y = floorY + 0.05;
  mark.ripple.position.y = floorY + 0.04;
  mark.haze.position.y = floorY;

  mark.poolMat.opacity = 0.7 * lit * (0.82 + 0.18 * Math.sin(time * 1.7 + phase));
  // The rim turns. This is the one part of the mark that is unambiguously
  // moving, and it is what stops a floor decal reading as paint.
  mark.rim.rotation.y = time * RIM_SPIN + phase;
  mark.rimMat.opacity = 0.95 * lit * b;
  // The haze turns the other way and slower, so the two never lock into
  // looking like one rotating object.
  mark.haze.rotation.y = -time * RIM_SPIN * 0.45 + phase;
  mark.hazeMat.opacity = 0.16 * lit * b;

  // The ripple. `t` is 0..1 across one period, offset by phase so the three
  // totems in a row do not pulse in lockstep - a row breathing as one reads
  // as one object, and these are three choices.
  const t = ((time / RIPPLE_PERIOD) + phase * 0.37) % 1;
  // It starts inside the rim and travels out past it, so it reads as leaving
  // rather than as landing on the ring and stopping.
  const rr = mark.rimR * (0.28 + 1.05 * t);
  mark.ripple.scale.setScalar(rr);
  // Bright as it is born, gone before it gets far. Squared so it spends most
  // of the period faint and the pulse is an event rather than a throb.
  mark.rippleMat.opacity = 0.7 * lit * Math.pow(1 - t, 2.2);

  // An invisible mesh is culled before rasterising; a transparent one is
  // still drawn. Same reason the rig hides its beams between hits.
  mark.pool.visible = mark.poolMat.opacity > 0.01;
  mark.rim.visible = mark.rimMat.opacity > 0.01;
  mark.ripple.visible = mark.rippleMat.opacity > 0.01;
  mark.haze.visible = mark.hazeMat.opacity > 0.01;
}

// The claim volume: the mark on the floor and the space the icon turns in,
// with enough margin that a shot grazing either edge still counts. Taller and
// wider than the pillar this all started as - there is no longer a solid
// object to aim at, so the target has to cover the space a player would
// naturally shoot at. It stays a box around the offer rather than growing to
// cover the whole mark: a claim wants to be a shot AT the icon, not any
// pellet that clipped the far edge of the light on the ground.
export const HIT_GEOM = new THREE.BoxGeometry(1.7, 3.2, 1.7);
// The station's claim volume, covering its mark and the icon orbiting over
// it. Invisible, exactly like a totem's: see the note in the Station
// constructor for why the console lost its body.
const STATION_HIT_GEOM = new THREE.BoxGeometry(1.4, 2.6, 1.4);
// Invisible, but still a raycast target - the same trick the enemy hitboxes
// use. three.js raycasts geometry, not visibility.
export const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
// The icon ORBITS to stay on the player's side of its mark and turns to face
// them, so it is legible from any angle.
//
// CIRCULAR NOW, AND TIGHT. The ellipse was the pillar's shape: 1.15 wide and
// 0.5 deep, so a circular orbit big enough to clear the sides left the icon
// floating absurdly far off the front. With the pillar gone there is nothing
// to clear, so the icon rides close to the axis of its own light and simply
// turns to face the player - which is what the orbit was ever for.
export const ICON_Y = 1.5;
export const ICON_RX = 0.5;
export const ICON_RZ = 0.5;
// pixelicons.js builds every plate at roughly 0.6m across, which is legible in
// the hand and too small over a 3.4m-wide mark seen from across the arena.
export const ICON_SCALE = 1.35;
// The same orbit on the smaller station body: 1.0 wide and 0.5 deep, and only
// 1.4 tall, so the icon rides lower and closer in and is scaled down to match.
const ST_ICON_Y = 1.0;
const ST_ICON_RX = 0.9;
const ST_ICON_RZ = 0.55;
const ST_ICON_SCALE = 1.0;

// HOW FAR THE CARD RIDES OFF THE AXIS OF ITS MARK.
//
// This used to be 2.0 and 1.4, which is a long way out, and none of it was
// about the card: a shaft of light stood on this spot and the card had to
// clear its outside edge or be read THROUGH an additive surface, which is a
// fight no amount of contrast in the canvas can win. With the light lying on
// the floor there is nothing left to step out of, so the card comes back in
// and rides the same small orbit the icon does.
//
// It is directly over the icon again, which is what it always wanted to be:
// the shape and the words describing it are one stacked object that swings
// together as the player moves, instead of a label hanging a couple of metres
// off to the side of the thing it names.
//
// The card keeps its height, so the row still reads as three marks with three
// labels at one level rather than as three signs at different depths.
export const PANEL_R = 0.5;
const ST_PANEL_R = 0.7;

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

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, z);
    this.group.visible = false;

    // Per-instance because each mark wears its own upgrade's theme.
    this.mark = makeMark(this.group);
    // NO SECOND RING. A totem used to be able to stand an ACTIVE ITEM as well
    // as a passive item, and wore a doubled rim when it did. Active items come
    // out of the mystery box now (js/mysterybox.js) and nothing ever asks a
    // totem for one, so the extra mark - four more meshes on every totem in
    // the row, permanently invisible - went with the offer kind it was drawn
    // for.

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
    // HOW HIGH THE CARD HANGS. It was 3.35, which left a clear half metre of
    // empty air between the last line of an offer's description and the icon
    // the description belongs to - and on a two-effect card with no note the
    // canvas runs out well before its bottom edge, so the real gap read wider
    // still. The two are one thing being described and they now sit as one
    // thing. Not lower than this: the row keeps its labels at a single height
    // and the card must clear the icon's bob and the mark's haze under it.
    this.panel.sprite.position.set(0, 3.02, 0);
    this.group.add(this.panel.sprite);

    scene.add(this.group);
  }

  // Assigns an upgrade and starts the rise. `owned` is the player's current
  // stack count for it, shown so a repeat offer is not mistaken for a new one.
  /**
   * Assigns an offer and starts the rise.
   *
   * @param {object} offer  { id, name, theme, effects, note } - see
   *   _buildOffers() in main.js. `id` doubles as the icon key.
   */
  present(offer, armTime = ARM_TIME) {
    this.offer = offer;
    this.upgradeId = offer.id;
    this.claimed = false;
    tintMark(this.mark, offer.theme);
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

    // The bottom line: the OWNED count, so a repeat offer is not mistaken for
    // a new one.
    if (offer.note) {
      // Lifted off the near-black it used to be. With no panel under it, a
      // note at #5b6785 is a line nobody can find in a dark room.
      c.fillStyle = '#9fb0d0';
      pxText(c, offer.note, 256, 292, 16, 460);
    }
    c.shadowBlur = 0;
    this.panel.tex.needsUpdate = true;
  }

  sink() {
    if (this.state === 'hidden') return;
    this.state = 'sinking';
  }

  // Whether this offer can be taken at all: risen and unclaimed. Both ways in
  // end up here, so an offer cannot be taken twice or taken before it has
  // finished coming out of the floor.
  canUse() {
    return this.state === 'up' && !this.claimed && this.upgradeId !== null;
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

    // The mark stays on the floor and comes UP IN BRIGHTNESS instead, which
    // is the one thing that separates a light from a prop.
    driveMark(this.mark, e, -this.group.position.y, time, this.pos.x);
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
// The two item-row consoles are in the same table as the two totem-row ones
// because they ARE the same object: same mark, same icon, same two ways in.
// Only the prices differ, and prices do not live here.
const STATION_LOOK = {
  ammo: { color: 0xffd600, icon: 'ammoBox' },
  reroll: { color: 0x4ef3ff, icon: 'gear' },
};

// A small console beside a row of offers. Two exist, both beside the passive
// item totems: ammo and reroll. Both are bought by shooting them or by
// pressing E in range, and neither disturbs the row it stands in.
//
// THE FAR SIDE OF THE ARENA HAS NO CONSOLES ANY MORE. It used to carry two - a
// MAX HEALTH counter and a second REROLL - flanking the active item pedestal.
// The mystery box that stands there now is bought FROM ITSELF: it is the offer
// and the till at once, which is the whole reason it needs no furniture around
// it. See js/mysterybox.js.
export class Station {
  constructor(x, kind, scene, z = ROW_Z) {
    this.kind = kind; // 'ammo' | 'reroll'
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

    // A smaller mark in the station's own colour, and NOTHING ELSE SOLID.
    //
    // The consoles used to keep a physical body - a small dark box that the
    // icon and the price hung in front of - on the argument that a shop is a
    // thing you walk up to and a totem is not. It read as a RECTANGLE DRAWN
    // AROUND THE ICON: the three offers in the same row are made of light and
    // have no container at all, so the consoles at the ends of the row were
    // the only things at the wave break wearing a frame, and a frame reads as
    // a different KIND of thing rather than as a different price. The mark,
    // the icon and the label say everything the box was there to say, in the
    // language the rest of the row is already written in.
    // Smaller than an offer's mark in both radii: the stations frame the row
    // and must not read as a fourth and fifth choice in it.
    this.mark = makeMark(this.group, 0.85, 1.15);
    tintMark(this.mark, this.color);

    // With the body gone the console still has to be shootable, so it takes
    // the same invisible claim volume a totem has, sized around the mark and
    // the icon orbiting over it. A station purchase is repeatable and
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
    // thing in two different rows; giving the far row's a shape of its own would
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
   * beside three marks of light is the one thing in the row that could not
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
      c.fillStyle = enabled ? SIGN_COLOR['1'] : DIM_TEXT;
      pxText(c, detail, 128, 98, 16, 232);
    }

    // THE PRICE IS ALWAYS LEGIBLE, and it is the one line that never fades:
    // a price the player cannot read is a price they cannot plan against, and
    // the most expensive purchase in the game is the one they most need to
    // read. So it is drawn at FULL ALPHA in both states while the bar and the
    // title dim around it.
    //
    // IT DOES CHANGE COLOUR THOUGH. White when the console can be used, grey
    // when it cannot - because full-alpha white read as "available" next to a
    // dimmed title, and the two halves of the plate were saying opposite
    // things. See DIM_TEXT for why grey and not red.
    c.globalAlpha = 1;
    c.fillStyle = enabled ? '#ffffff' : DIM_TEXT;
    pxText(c, cost, 128, detail ? 138 : 120, 24, 232);
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
    driveMark(this.mark, e * 0.65, -this.group.position.y, time, this.pos.x);

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
    // Box rolls bought at the CURRENT shop, on the same terms and reset at the
    // same moment. Its OWN counter rather than a share of `rerolls`: a reroll
    // and a box roll are different purchases, and alternating between them
    // should not price either out - see boxCost in upgrades.js.
    this.boxRolls = 0;
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
   *   escalating price is not reset by the set it just paid for. The box's
   *   counter rides along with it: a reroll does not make the box cheap again
   *   any more than it makes itself cheap again.
   */
  present(offers, resetRerolls = true, armTime = undefined) {
    if (resetRerolls) {
      this.rerolls = 0;
      this.boxRolls = 0;
    }
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
