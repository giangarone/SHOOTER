// Wave-end upgrade totems and the two stations beside them.
//
// Three pillars rise out of the arena floor when a wave is cleared, each
// showing one upgrade. The player takes one by walking into it or by shooting
// its core. Nothing pauses: the next wave starts on a timer whether or not a
// choice was made, and an unclaimed set simply stays standing until the wave
// after it is cleared, when a fresh set replaces it.
//
// WHY THE CORE IS A SEPARATE, SMALL TARGET
//   Totems stay live through the following wave, so the player is fighting
//   around them. Only the little core claims an upgrade; the pillar body is a
//   normal raycast target that stops a bullet harmlessly. Without that split, a
//   shot that missed an enemy standing behind a totem would pick a build for
//   you.
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

import * as THREE from 'three';
import { UPGRADES, RARITY, AMMO_PURCHASE } from './upgrades.js';

// Walk this close to a totem and it is yours. Generous enough to catch a
// player running past at sprint speed.
export const TOUCH_RADIUS = 1.7;
// Press E this close to a station.
export const STATION_RADIUS = 2.6;

// Fixed positions near the arena centre, in a row the player is already facing
// when they spawn. Checked against the platforms, crates and pillars in
// arena.js - keep them clear if you move anything.
const ROW_Z = -5;
const TOTEM_X = [-3.6, 0, 3.6];
const STATION_X = [-6.9, 6.9];

const RISE_TIME = 0.7;
const SUNK_Y = -3.4;

// Effect-line colours, keyed by the sign in an upgrade's `effects` entry.
const SIGN_COLOR = { '1': '#37e08b', '-1': '#ff5a4d', '0': '#8a95b3' };

const PILLAR_GEOM = new THREE.BoxGeometry(1.15, 2.4, 0.5);
const CORE_GEOM = new THREE.IcosahedronGeometry(0.27, 0);
const STATION_GEOM = new THREE.BoxGeometry(1.0, 1.4, 0.5);
const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x161b26, roughness: 0.45, metalness: 0.7 });

function hex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

// Rounded-rect helper - the label panels are drawn, not styled, so this is the
// only way to get a soft edge on them.
function roundRect(c, x, y, w, h, r) {
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
function makePanel(w, h, scaleX, scaleY) {
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
  constructor(x, scene) {
    this.upgradeId = null;
    this.pos = new THREE.Vector3(x, 0, ROW_Z);
    // -1 sunk, 0..1 rising, 1 fully up. Drives both the Y offset and whether
    // the totem can be claimed at all.
    this.rise = 0;
    this.state = 'hidden'; // hidden | rising | up | sinking
    this.claimed = false;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, ROW_Z);
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

    this.coreMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.2,
      roughness: 0.2, metalness: 0.5,
    });
    this.core = new THREE.Mesh(CORE_GEOM, this.coreMat);
    this.core.position.set(0, 1.45, 0.42);
    // How main.js tells a core hit from an ordinary wall hit.
    this.core.userData.totem = this;
    this.group.add(this.core);

    this.panel = makePanel(512, 320, 3.5, 2.2);
    this.panel.sprite.position.set(0, 3.35, 0);
    this.group.add(this.panel.sprite);

    scene.add(this.group);
  }

  // Assigns an upgrade and starts the rise. `owned` is the player's current
  // stack count for it, shown so a repeat offer is not mistaken for a new one.
  present(upgradeId, owned) {
    this.upgradeId = upgradeId;
    this.claimed = false;
    const def = UPGRADES[upgradeId];
    this.pillarMat.emissive.setHex(def.theme);
    this.coreMat.color.setHex(def.theme);
    this.coreMat.emissive.setHex(def.theme);
    this._draw(def, owned);
    this.state = 'rising';
    this.rise = 0;
    this.group.visible = true;
  }

  // Renders the whole readout in one pass: rarity, name, then one line per
  // effect coloured by its sign. Called once when a set rises, never per frame.
  _draw(def, owned) {
    const c = this.panel.canvas.getContext('2d');
    const theme = hex(def.theme);
    c.clearRect(0, 0, 512, 320);

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
    c.fillStyle = RARITY[def.rarity].color;
    c.font = 'bold 22px system-ui, sans-serif';
    c.fillText(RARITY[def.rarity].label, 256, 60);

    c.fillStyle = '#ffffff';
    c.font = 'bold 42px system-ui, sans-serif';
    c.fillText(def.name, 256, 112);

    c.font = 'bold 30px system-ui, sans-serif';
    let y = 172;
    for (const [text, sign] of def.effects) {
      c.fillStyle = SIGN_COLOR[String(sign)];
      c.fillText(text, 256, y);
      y += 42;
    }

    if (owned > 0) {
      c.fillStyle = '#5b6785';
      c.font = '600 22px system-ui, sans-serif';
      c.fillText('OWNED ' + owned + ' / ' + def.max, 256, 292);
    }
    this.panel.tex.needsUpdate = true;
  }

  sink() {
    if (this.state === 'hidden') return;
    this.state = 'sinking';
  }

  // Only a fully-risen, unclaimed totem can be taken. Everything that grants
  // an upgrade goes through this, so a totem cannot be claimed twice or
  // claimed while it is still coming out of the floor.
  canClaim() {
    return this.state === 'up' && !this.claimed && this.upgradeId !== null;
  }

  inTouchRange(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    return dx * dx + dz * dz < TOUCH_RADIUS * TOUCH_RADIUS;
  }

  update(dt, time) {
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
        return;
      }
    }

    // Ease-out on the way up so the pillar decelerates as it lands.
    const e = 1 - Math.pow(1 - this.rise, 3);
    this.group.position.y = SUNK_Y + (0 - SUNK_Y) * e;

    this.core.rotation.y += dt * 1.6;
    this.core.rotation.x += dt * 0.9;
    this.core.position.y = 1.45 + Math.sin(time * 2.4) * 0.07;
    this.coreMat.emissiveIntensity = 2.0 + Math.sin(time * 5) * 0.5;
  }
}

// A small console beside the totems. Two exist: one sells ammo, one rerolls
// the set. Both are bought with E and neither disturbs the totems.
export class Station {
  constructor(x, kind, scene) {
    this.kind = kind; // 'ammo' | 'reroll'
    this.pos = new THREE.Vector3(x, 0, ROW_Z);
    this.color = kind === 'ammo' ? 0xffd600 : 0x4ef3ff;
    this.state = 'hidden';
    this.rise = 0;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, ROW_Z);
    this.group.visible = false;

    this.mat = new THREE.MeshStandardMaterial({
      color: 0x161b26, emissive: this.color, emissiveIntensity: 0.5,
      roughness: 0.4, metalness: 0.7,
    });
    const body = new THREE.Mesh(STATION_GEOM, this.mat);
    body.position.y = 0.7;
    body.castShadow = true;
    this.group.add(body);

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
   * @param {string[]} ids  up to three upgrade ids from rollTotems()
   * @param {Object<string, number>} owned  player's stack counts
   * @param {boolean} resetRerolls  false when this is itself a reroll, so the
   *   escalating price is not reset by the set it just paid for.
   */
  present(ids, owned, resetRerolls = true) {
    if (resetRerolls) this.rerolls = 0;
    this.totems.forEach((t, i) => {
      if (i < ids.length) t.present(ids[i], owned[ids[i]] || 0);
      else t.sink();
    });
    if (!ids.length) {
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

  // Appends this set's shootable parts to a raycast target list. The pillars
  // go in so bullets stop on them; only the cores carry userData.totem, so
  // only a core hit can claim.
  addTargets(out) {
    for (const t of this.totems) {
      if (t.state === 'hidden') continue;
      out.push(t.pillar, t.core);
    }
  }

  update(dt, time) {
    for (const t of this.totems) t.update(dt, time);
    for (const s of this.stations) s.update(dt, time);
  }
}
