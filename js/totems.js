// Wave-end upgrade totems and the two stations beside them.
//
// Three pillars rise out of the arena floor when a wave is cleared, each
// showing one upgrade. The player takes one by walking into it or by shooting
// it ANYWHERE - the pillar and the icon hovering in front of it are one target.
// Nothing pauses: the next wave starts on a timer whether or not a choice was
// made, and an unclaimed set simply stays standing until the wave after it is
// cleared, when a fresh set replaces it.
//
// A TOTEM CANNOT BE TAKEN THE INSTANT IT ARRIVES
//   Totems come up wherever the player happens to be standing, into whatever
//   is already in the air. Two guards, because they cover different mistakes:
//   an arm delay after the rise (ARM_TIME) catches a burst that was fired
//   before the set existed, and touch additionally requires having been seen
//   OUTSIDE the radius since the rise (`touchArmed`) - a timer alone does
//   nothing for a player who never moved off the spot the pillar came up in.
//
// THE WHOLE TOTEM IS THE TARGET
//   An earlier revision made only a small floating core claim the upgrade, so
//   that a shot which missed an enemy standing behind a totem could not pick a
//   build for you. It cost more than it saved: hitting a wobbling 27cm orb
//   mid-fight is a marksmanship test nobody asked for, and the totem reads as
//   one object, so half of it being inert reads as a bug. Claiming is now a
//   single invisible box around the pillar and its icon (`hit` below). The
//   floating label panel above is deliberately NOT part of it - it hangs wide
//   and high over the arena, and a stray shot up there should stay a miss.
//
// EACH OFFER HAS ITS OWN COLOUR AND ICON
//   `theme` tints the pillar, the panel and the icon; `icon` names a small 3D
//   object from icons.js that says what the upgrade does before the text is
//   legible - a flame for Incendiary, an icicle for Cryo. Both come straight
//   off the offer, so this file still knows nothing about upgrades.
//
//   The icon ORBITS its pillar to whatever side the player is on and turns to
//   face them. The alternative considered was a translucent pillar with a
//   billboarded icon: translucency washes out the theme colour, which is the
//   thing carrying meaning at distance, and billboarding a 3D shape flattens
//   it. Orbiting keeps the pillar solid and the icon presenting its front.
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
//      geometry behind them is shared across every icon in the game.

import * as THREE from 'three';
import { buildIcon } from './icons.js';
// A totem draws whatever it is handed. It knows nothing about upgrades or
// weapons - main.js normalises both into the same `offer` shape, which is why
// putting a weapon on a totem needed no changes here.

// Walk this close to a totem and it is yours. Generous enough to catch a
// player running past at full speed.
export const TOUCH_RADIUS = 1.7;
// Seconds after a totem finishes rising before it will accept a claim. Totems
// come up wherever the player happens to be standing, and often into the line
// of a burst that was already in the air when the wave ended - without this,
// clearing a wave next to the row picks your build for you. Long enough to
// cover a trigger already held down, short enough that a player walking in
// deliberately never notices it.
export const ARM_TIME = 1.2;
// The arm delay used INSTEAD when a Devil is standing at the same wave break.
// Taking a totem is what starts the next wave, so with a Devil up a stray
// pellet does not merely pick a build - it ends the shopping trip. Long enough
// that the player has to mean it.
export const ARM_TIME_DEVIL = 2.5;
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
const SIGN_COLOR = { '1': '#37e08b', '-1': '#ff5a4d', '0': '#8a95b3' };
// The price line on a Devil Deal. Not one of the SIGN_COLOR entries: a cost is
// neither a benefit nor a drawback, it is the thing you are agreeing to.
const COST_COLOR = '#ff1744';

const PILLAR_GEOM = new THREE.BoxGeometry(1.15, 2.4, 0.5);
// The claim volume: the pillar plus the space the icon floats in, with enough
// margin that a shot grazing either edge still counts.
const HIT_GEOM = new THREE.BoxGeometry(1.45, 2.6, 1.3);
const STATION_GEOM = new THREE.BoxGeometry(1.0, 1.4, 0.5);
// Invisible, but still a raycast target - the same trick the enemy hitboxes
// use. three.js raycasts geometry, not visibility.
const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
// The icon ORBITS the pillar to stay on the player's side of it and turns to
// face them, so it is legible from any angle without the pillar having to go
// translucent. The radii are elliptical because the pillar is: 1.15 wide and
// 0.5 deep, so a circular orbit at any radius that cleared the sides would
// leave the icon floating absurdly far off the front.
const ICON_Y = 1.5;
const ICON_RX = 1.0;
const ICON_RZ = 0.62;
// icons.js builds every shape at roughly half a metre, which is legible in the
// hand and too small against a 1.15m-wide pillar seen from across the arena.
const ICON_SCALE = 1.35;

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
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
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
    // Seconds left on the arm delay; see ARM_TIME.
    this.armT = ARM_TIME;
    // False until the player has been seen OUTSIDE the touch radius since this
    // totem rose. The arm delay alone does not cover a player who is simply
    // standing on the spot a totem comes up in - they would still be inside it
    // when the timer expired. Touch has to be entered, not merely occupied.
    this.touchArmed = false;

    // False only for a Devil Deal the player cannot afford. An unaffordable
    // offer stays standing and stays readable - it is greyed out and inert
    // rather than hidden, because "you cannot pay for this" is information and
    // a pillar that simply never rose is not.
    this.enabled = true;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, z);
    this.group.visible = false;

    // Per-instance because each totem is tinted by its upgrade's theme.
    this.pillarMat = new THREE.MeshStandardMaterial({
      color: 0x161b26, emissive: 0xffffff, emissiveIntensity: 0.25,
      roughness: 0.4, metalness: 0.7,
    });
    this.pillar = new THREE.Mesh(PILLAR_GEOM, this.pillarMat);
    this.pillar.position.y = 1.2;
    this.pillar.castShadow = true;
    this.group.add(this.pillar);

    // The claim volume, covering the pillar and the icon in front of it. It is
    // the only raycast target a totem contributes, so a pellet that lands
    // anywhere on the totem takes the upgrade and stops there.
    this.hit = new THREE.Mesh(HIT_GEOM, HIT_MAT);
    this.hit.position.set(0, 1.25, 0.2);
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
   * @param {object} offer  { id, name, theme, icon, rarityLabel, rarityColor,
   *   effects, note } - see _buildOffers() in main.js.
   */
  present(offer, armTime = ARM_TIME) {
    this.offer = offer;
    this.upgradeId = offer.id;
    this.claimed = false;
    this.enabled = offer.enabled !== false;
    this.pillarMat.emissive.setHex(offer.theme);
    this._showIcon(offer);
    this._draw(offer);
    this.state = 'rising';
    this.rise = 0;
    this.armT = armTime;
    this.touchArmed = false;
    this.group.visible = true;
  }

  // Swaps in this offer's icon, building it the first time this totem is asked
  // for it. Keyed by offer id rather than by icon name: two upgrades can share
  // a shape (Overclock and Arc Rounds are both lightning) but never a colour,
  // and the colour is baked into the icon's material when it is built.
  _showIcon(offer) {
    let icon = this._icons.get(offer.id);
    if (!icon) {
      icon = buildIcon(offer.icon || 'shard', offer.theme);
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

    c.fillStyle = 'rgba(8, 10, 16, 0.82)';
    roundRect(c, 6, 6, 500, 308, 14);
    c.fill();
    c.strokeStyle = theme;
    c.lineWidth = 3;
    c.stroke();
    // A thicker bar across the top so the theme colour reads even when the
    // text is too far away to make out.
    c.fillStyle = theme;
    roundRect(c, 6, 6, 500, 12, 6);
    c.fill();

    c.textAlign = 'center';
    c.fillStyle = offer.rarityColor;
    c.font = 'bold 22px system-ui, sans-serif';
    c.fillText(offer.rarityLabel, 256, 60);

    c.fillStyle = '#ffffff';
    // Long weapon names need to shrink to stay on one line.
    c.font = 'bold ' + (offer.name.length > 15 ? 34 : 42) + 'px system-ui, sans-serif';
    c.fillText(offer.name, 256, 112);

    c.font = 'bold 28px system-ui, sans-serif';
    let y = 168;
    for (const [text, sign] of offer.effects) {
      c.fillStyle = SIGN_COLOR[String(sign)];
      c.fillText(text, 256, y);
      y += 38;
    }

    // The price, on a Devil Deal only. It sits where a free totem's OWNED note
    // sits, because the two never appear together: a deal is max: 1, so a
    // player who owns one is never offered it again.
    if (offer.cost) {
      c.fillStyle = dim ? '#5b6785' : COST_COLOR;
      c.font = 'bold 26px system-ui, sans-serif';
      c.fillText(
        dim ? 'CANNOT AFFORD' : 'COSTS ' + offer.cost + ' MAX HP',
        256, 292
      );
    } else if (offer.note) {
      c.fillStyle = '#5b6785';
      c.font = '600 22px system-ui, sans-serif';
      c.fillText(offer.note, 256, 292);
    }
    c.globalAlpha = 1;
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

  // Only a fully-risen, armed, unclaimed totem can be taken. Everything that
  // grants an upgrade goes through this, so a totem cannot be claimed twice,
  // claimed while it is still coming out of the floor, or claimed by a shot
  // that was already in the air when it arrived.
  canClaim() {
    return this.state === 'up' && this.armT <= 0 && !this.claimed
      && this.enabled && this.upgradeId !== null;
  }

  // Touch additionally requires the player to have left the radius at least
  // once since the rise - see `touchArmed`.
  inTouchRange(playerPos) {
    return this.touchArmed && this._within(playerPos);
  }

  _within(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    return dx * dx + dz * dz < TOUCH_RADIUS * TOUCH_RADIUS;
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
    if (!this.touchArmed && playerPos && !this._within(playerPos)) this.touchArmed = true;

    // Ease-out on the way up so the pillar decelerates as it lands.
    const e = 1 - Math.pow(1 - this.rise, 3);
    this.group.position.y = SUNK_Y + (0 - SUNK_Y) * e;

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
    }
    this.iconAnchor.position.y = ICON_Y + Math.sin(time * 2.4 + this.pos.x) * 0.07;
    if (this.icon) {
      this.icon.userData.glow.emissiveIntensity = 1.35 + Math.sin(time * 5) * 0.35;
    }
  }
}

// A small console beside the totems. Two exist: one sells ammo, one rerolls
// the set. Both are bought by shooting them or by pressing E in range, and
// neither disturbs the totems.
export class Station {
  constructor(x, kind, scene) {
    this.kind = kind; // 'ammo' | 'reroll'
    this.pos = new THREE.Vector3(x, 0, ROW_Z);
    this.color = kind === 'ammo' ? 0xffd600 : 0x4ef3ff;
    this.state = 'hidden';
    this.rise = 0;
    // A station is bought by shooting it, and the guns here fire far faster
    // than anyone means to buy. Without this a single burst would drain the
    // wallet on a chain of rerolls before the first one had even risen.
    this.shootCd = 0;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, ROW_Z);
    this.group.visible = false;

    this.mat = new THREE.MeshStandardMaterial({
      color: 0x161b26, emissive: this.color, emissiveIntensity: 0.5,
      roughness: 0.4, metalness: 0.7,
    });
    this.body = new THREE.Mesh(STATION_GEOM, this.mat);
    this.body.position.y = 0.7;
    this.body.castShadow = true;
    // How main.js tells a station hit from an ordinary wall hit. The whole
    // body is the target, the same as a totem - a station purchase is
    // repeatable and rate-limited, so a stray hit costs a shot, not a build.
    this.body.userData.station = this;
    this.group.add(this.body);

    this.panel = makePanel(256, 160, 1.9, 1.2);
    this.panel.sprite.position.set(0, 1.9, 0);
    this.group.add(this.panel.sprite);

    scene.add(this.group);
  }

  setLabel(title, cost, enabled) {
    const c = this.panel.canvas.getContext('2d');
    c.clearRect(0, 0, 256, 160);
    c.fillStyle = 'rgba(8, 10, 16, 0.82)';
    roundRect(c, 4, 4, 248, 152, 10);
    c.fill();
    c.strokeStyle = hex(this.color);
    c.lineWidth = 2;
    c.stroke();

    c.textAlign = 'center';
    c.globalAlpha = enabled ? 1 : 0.4;
    c.fillStyle = hex(this.color);
    c.font = 'bold 34px system-ui, sans-serif';
    c.fillText(title, 128, 62);
    c.fillStyle = enabled ? '#ffffff' : '#5b6785';
    c.font = 'bold 30px system-ui, sans-serif';
    c.fillText(cost, 128, 112);
    c.globalAlpha = 1;
    this.panel.tex.needsUpdate = true;
  }

  show() {
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
  inRange(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    return dx * dx + dz * dz < STATION_RADIUS * STATION_RADIUS;
  }
  isUp() {
    return this.state === 'up';
  }

  update(dt, time) {
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
    this.mat.emissiveIntensity = 0.45 + Math.sin(time * 3) * 0.15;
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
    for (const s of this.stations) if (s.state === 'hidden') s.show();
  }

  // Sinks everything - the claimed totem, its two siblings and both stations.
  dismiss() {
    for (const t of this.totems) t.sink();
    for (const s of this.stations) s.sink();
  }

  // The claimable totem the player is standing in, or null.
  touched(playerPos) {
    for (const t of this.totems) {
      if (t.canClaim() && t.inTouchRange(playerPos)) return t;
    }
    return null;
  }

  stationInRange(playerPos) {
    for (const s of this.stations) {
      if (s.isUp() && s.inRange(playerPos)) return s;
    }
    return null;
  }

  // Appends this set's shootable parts to a raycast target list. One invisible
  // box per standing totem, sized around the pillar and its icon: hitting it
  // anywhere claims the offer and stops the pellet. Station bodies go in too -
  // they carry userData.station and are bought by shooting them.
  addTargets(out) {
    for (const t of this.totems) {
      if (t.state === 'hidden') continue;
      out.push(t.hit);
    }
    for (const s of this.stations) {
      if (s.state !== 'hidden') out.push(s.body);
    }
  }

  update(dt, time, playerPos) {
    for (const t of this.totems) t.update(dt, time, playerPos);
    for (const s of this.stations) s.update(dt, time);
  }
}
