// One reusable shop cabinet. Payment and player progression belong to Game;
// this owns the wheel, its frame-driven events and the floating reward. No
// timers survive a shop close or resolve against a different player's run.

import * as THREE from 'three';
import { BOX_Z } from './mysterybox.js';
import { buildPixelIcon } from './pixelicons.js';
import { DONATION_ITEMS, donationItemKey } from './items/donation/index.js';
import {
  DIM_TEXT, HIT_MAT, SIGN_COLOR, SUNK_Y, RISE_SECONDS, TOTEM_X,
  hex, makePanel, pxText, roundRect,
} from './totems.js';

export const DONATION_USE_RADIUS = 2.6;
export const DONATION_SPIN_SECONDS = 3;
export const DONATION_KINDS = Object.freeze(['ammo', 'health', 'credits']);
const TAU = Math.PI * 2;
const wrapAngle = (angle) => ((angle % TAU) + TAU) % TAU;

export function randomDonationKind(random = Math.random) {
  return DONATION_KINDS[Math.floor(random() * DONATION_KINDS.length)];
}

export const DONATION_MACHINE_CONFIG = Object.freeze({
  ammo: Object.freeze({
    title: 'AMMO DONATION', color: 0xffd600, cost: 90,
    costLabel: '90 RESERVE ROUNDS', shortCost: '90 AMMO',
  }),
  health: Object.freeze({
    title: 'HEALTH DONATION', color: 0xff3b30, cost: 25,
    costLabel: '25 HEALTH', shortCost: '25 HP',
  }),
  credits: Object.freeze({
    title: 'CREDITS DONATION', color: 0x00e676, cost: 1000,
    costLabel: '$1,000 CREDITS', shortCost: '$1,000',
  }),
});

export function donationSoldOut(player) {
  for (const id in DONATION_ITEMS) {
    if (!player.donationItems[donationItemKey(id)]) return false;
  }
  return true;
}

// Uniform selection without constructing a filtered array on the interaction
// path. The first pass counts the open entries; the second walks to the chosen
// index. Catalogue iteration order has no effect on the odds.
export function randomUnownedDonationItem(player, random = Math.random) {
  const pool = DONATION_ITEMS;
  let count = 0;
  for (const id in pool) {
    if (!player.donationItems[donationItemKey(id)]) count++;
  }
  if (!count) return null;
  let chosen = Math.floor(random() * count);
  for (const id in pool) {
    if (player.donationItems[donationItemKey(id)]) continue;
    if (chosen-- === 0) return id;
  }
  return null;
}

const BODY_GEOM = new THREE.BoxGeometry(1.3, 2.1, 0.82);
const FACE_GEOM = new THREE.BoxGeometry(0.92, 1.52, 0.08);
const TRIM_GEOM = new THREE.BoxGeometry(1.05, 0.08, 0.1);
const HIT_GEOM = new THREE.BoxGeometry(1.5, 2.6, 1.05);
const WHEEL_GEOM = new THREE.PlaneGeometry(0.82, 0.82);
const pointerShape = new THREE.Shape();
pointerShape.moveTo(-0.065, 0.07);
pointerShape.lineTo(0.065, 0.07);
pointerShape.lineTo(0, -0.045);
pointerShape.closePath();
const POINTER_GEOM = new THREE.ShapeGeometry(pointerShape);
const POINTER_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });
const BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x111722, roughness: 0.55, metalness: 0.65,
});
const FACE_MAT = new THREE.MeshStandardMaterial({
  color: 0x05080e, roughness: 0.4, metalness: 0.7,
});

function wheelMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uChance: { value: 0.1 },
      uAngle: { value: 0 },
      uFlash: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uChance;
      uniform float uAngle;
      uniform float uFlash;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5;
        float r = length(p);
        if (r > 0.49) discard;
        // Clockwise from the fixed pointer at twelve o'clock. The landing
        // phase uses this same convention so the visible wedge IS the odds.
        float angle = mod(atan(p.x, p.y) - uAngle + 6.28318530718, 6.28318530718);
        float win = 1.0 - step(6.28318530718 * uChance, angle);
        vec3 col = mix(vec3(0.055, 0.065, 0.085), uColor, win);
        float spoke = fract(angle / 6.28318530718 * 20.0);
        float gap = 1.0 - smoothstep(0.0, 0.022, min(spoke, 1.0 - spoke));
        col *= 1.0 - gap * 0.35;
        col *= 0.65 + 0.35 * smoothstep(0.08, 0.44, r);
        col += uColor * uFlash * win * 0.65;
        if (r > 0.455) col = uColor * (0.65 + uFlash * 0.5);
        if (r < 0.075) col = vec3(0.75, 0.8, 0.9);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    toneMapped: false,
    fog: false,
  });
}

function drawNormal(machine) {
  const { canvas, tex } = machine.panel;
  const c = canvas.getContext('2d');
  const cfg = machine.config;
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.textAlign = 'center';
  const col = hex(cfg.color);

  c.fillStyle = col;
  c.shadowColor = col;
  c.shadowBlur = 18;
  roundRect(c, 78, 22, canvas.width - 156, 6, 3);
  c.fill();
  c.shadowBlur = 0;
  pxText(c, cfg.title, canvas.width / 2, 70, 24, canvas.width - 40);
  c.fillStyle = '#ffffff';
  pxText(c, cfg.costLabel, canvas.width / 2, 116, 20, canvas.width - 40);
  c.fillStyle = machine.soldOut ? DIM_TEXT : col;
  pxText(
    c,
    machine.soldOut ? 'SOLD OUT' : machine.status,
    canvas.width / 2,
    178,
    28,
    canvas.width - 40
  );
  tex.needsUpdate = true;
}

function drawReward(machine, def) {
  const { canvas, tex } = machine.panel;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  c.textAlign = 'center';
  const col = hex(def.theme);

  c.fillStyle = col;
  c.shadowColor = col;
  c.shadowBlur = 22;
  roundRect(c, 62, 20, canvas.width - 124, 7, 4);
  c.fill();
  c.shadowBlur = 0;
  c.fillStyle = col;
  pxText(c, def.name, canvas.width / 2, 68, 28, canvas.width - 40);
  const lines = Array.isArray(def.effects) ? def.effects : def.effects(0);
  const start = lines.length > 2 ? 116 : 132;
  lines.slice(0, 3).forEach((line, i) => {
    const text = Array.isArray(line) ? line[0] : line;
    const sign = Array.isArray(line) ? String(line[1]) : '0';
    c.fillStyle = SIGN_COLOR[sign] || SIGN_COLOR['0'];
    pxText(c, text, canvas.width / 2, start + i * 38, 16, canvas.width - 42);
  });
  tex.needsUpdate = true;
}

export class DonationMachine {
  constructor(scene) {
    // Looking toward the box from the passive row reverses world X: the
    // positive-X offer's lane puts the cabinet on the player's left.
    const x = TOTEM_X[2];
    const z = BOX_Z;
    this.kind = 'ammo';
    this.config = DONATION_MACHINE_CONFIG[this.kind];
    this.pos = new THREE.Vector3(x, 0, z);
    this.state = 'hidden';
    this.rise = 0;
    this.chance = 10;
    this.shopOpen = false;
    this.spinning = false;
    this.spinElapsed = 0;
    this.spinChance = 10;
    this.landingAngle = 0;
    this.spinWon = false;
    this.spinStartAngle = 0;
    this.spinTravel = 0;
    this.tickIndex = 0;
    this.tickProgress = 0;
    this.event = null;
    this.status = '';
    this.soldOut = false;
    this.pendingId = null;
    this.completedThisShop = false;
    this.flash = 0;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, z);
    // Face the passive row, alongside the box.
    this.group.rotation.y = Math.PI;
    this.group.visible = false;

    const body = new THREE.Mesh(BODY_GEOM, BODY_MAT);
    body.position.y = 1.05;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    const face = new THREE.Mesh(FACE_GEOM, FACE_MAT);
    face.position.set(0, 1.13, 0.43);
    this.group.add(face);

    this.trimMaterial = new THREE.MeshBasicMaterial({ color: this.config.color });
    for (const y of [0.16, 2.03]) {
      const trim = new THREE.Mesh(TRIM_GEOM, this.trimMaterial);
      trim.position.set(0, y, 0.47);
      this.group.add(trim);
    }

    this.wheelMaterial = wheelMaterial(this.config.color);
    this.wheel = new THREE.Mesh(WHEEL_GEOM, this.wheelMaterial);
    this.wheel.position.set(0, 1.13, 0.485);
    this.group.add(this.wheel);
    const pointer = new THREE.Mesh(POINTER_GEOM, POINTER_MAT);
    pointer.position.set(0, 1.54, 0.50);
    this.group.add(pointer);

    this.hit = new THREE.Mesh(HIT_GEOM, HIT_MAT);
    this.hit.position.y = 1.3;
    this.hit.userData.donationMachine = this;
    this.group.add(this.hit);

    this.panel = makePanel(384, 256, 3.0, 2.0);
    this.panel.sprite.position.set(0, 3.12, 0.18);

    // The readable part of a completed machine cannot be a child of the
    // cabinet: the cabinet sinks immediately while the unclaimed item stays
    // exactly where it appeared. One permanent display group serves both the
    // ordinary label and that floating reward, so completion allocates no
    // scene data.
    this.displayGroup = new THREE.Group();
    this.displayGroup.position.set(x, SUNK_Y, z);
    this.displayGroup.rotation.y = Math.PI;
    this.displayGroup.visible = false;
    this.displayGroup.add(this.panel.sprite);

    // Build the shared reward plates once. Every reveal reuses the same scene
    // resources, even when a later shop chooses a different payment kind.
    this.icons = {};
    this.iconAnchor = new THREE.Group();
    this.iconAnchor.position.set(0, 2.16, 0.66);
    this.iconAnchor.scale.setScalar(1.15);
    for (const [id, def] of Object.entries(DONATION_ITEMS)) {
      const icon = buildPixelIcon(donationItemKey(id), def.theme);
      icon.visible = false;
      this.icons[id] = icon;
      this.iconAnchor.add(icon);
    }
    this.displayGroup.add(this.iconAnchor);

    drawNormal(this);
    scene.add(this.group);
    scene.add(this.displayGroup);
  }

  present(player, random = Math.random) {
    // A redraw or reroll during the same shop must not reset a spin or deal
    // another payment kind, including after this shop's win sank the body.
    if (this.shopOpen) return;
    this.shopOpen = true;
    this.kind = randomDonationKind(random);
    this.config = DONATION_MACHINE_CONFIG[this.kind];
    this.clearPending();
    this.completedThisShop = false;
    this.spinning = false;
    this.event = null;
    this.status = '';
    this.flash = 0;
    this.wheelMaterial.uniforms.uColor.value.setHex(this.config.color);
    this.wheelMaterial.uniforms.uAngle.value = 0;
    this.trimMaterial.color.setHex(this.config.color);
    this.setChance(player.donationChance, donationSoldOut(player));
    if (this.state !== 'up') this.state = 'rising';
    this.group.visible = true;
    this.displayGroup.visible = true;
  }

  // Return the unfinished payment to Game as a forfeiture, exactly once.
  // Game records it BEFORE a versus snapshot; the furniture never owns a run.
  dismiss() {
    const forfeited = this.spinning;
    this.spinning = false;
    this.event = null;
    this.shopOpen = false;
    this.clearPending();
    if (this.state !== 'hidden') this.state = 'sinking';
    else this.displayGroup.visible = false;
    return forfeited;
  }

  isUp() {
    return this.state === 'up';
  }

  useDistance(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    const d2 = dx * dx + dz * dz;
    return d2 < DONATION_USE_RADIUS * DONATION_USE_RADIUS ? d2 : -1;
  }

  setChance(chance, soldOut = false) {
    this.chance = chance;
    this.soldOut = soldOut;
    if (this.pendingId || this.spinning) return;
    this.wheelMaterial.uniforms.uChance.value = chance / 100;
    drawNormal(this);
  }

  startSpin(chance, random = Math.random) {
    if (!this.shopOpen || !this.isUp() || this.spinning
        || this.completedThisShop || this.soldOut) return false;
    this.spinning = true;
    this.spinElapsed = 0;
    this.spinChance = chance;
    this.landingAngle = random() * TAU;
    this.spinWon = this.landingAngle < TAU * chance / 100;
    this.spinStartAngle = wrapAngle(this.wheelMaterial.uniforms.uAngle.value);
    this.spinTravel = TAU * 6 + wrapAngle(-this.landingAngle - this.spinStartAngle);
    this.tickIndex = 0;
    this.tickProgress = 0;
    this.event = null;
    this.status = '';
    this.wheelMaterial.uniforms.uChance.value = chance / 100;
    drawNormal(this);
    return true;
  }

  reveal(itemId) {
    const def = DONATION_ITEMS[itemId];
    if (!def) return;
    this.pendingId = itemId;
    this.completedThisShop = true;
    this.flash = 1;
    for (const id in this.icons) this.icons[id].visible = id === itemId;
    drawReward(this, def);
    // Keep the reward display in world space while its cabinet disappears.
    this.displayGroup.position.y = 0;
    this.displayGroup.visible = true;
    this.state = 'sinking';
  }

  takeReward() {
    const itemId = this.pendingId;
    if (!itemId) return null;
    this.clearPending();
    this.displayGroup.visible = false;
    return itemId;
  }

  clearPending() {
    this.pendingId = null;
    for (const id in this.icons) this.icons[id].visible = false;
  }

  update(dt, time) {
    this.event = null;
    if (this.spinning) {
      this.spinElapsed = Math.min(DONATION_SPIN_SECONDS, this.spinElapsed + dt);
      const t = this.spinElapsed / DONATION_SPIN_SECONDS;
      const eased = 1 - Math.pow(1 - t, 3);
      const travel = this.spinTravel * eased;
      this.wheelMaterial.uniforms.uAngle.value = this.spinStartAngle + travel;
      const tick = Math.floor(travel / (TAU / 20));
      if (tick > this.tickIndex) {
        this.tickIndex = tick;
        this.tickProgress = t;
        this.event = 'tick';
      }
      if (t >= 1) {
        this.spinning = false;
        this.status = this.spinWon ? 'WIN' : 'TRY AGAIN';
        this.event = this.spinWon ? 'win' : 'loss';
      }
    }
    if (this.state === 'hidden' && !this.pendingId) return;
    if (this.state === 'rising') {
      this.rise = Math.min(1, this.rise + dt / RISE_SECONDS);
      if (this.rise >= 1) this.state = 'up';
    } else if (this.state === 'sinking') {
      this.rise -= dt / RISE_SECONDS;
      if (this.rise <= 0) {
        this.rise = 0;
        this.state = 'hidden';
        this.group.visible = false;
      }
    }
    const e = 1 - Math.pow(1 - this.rise, 3);
    this.group.position.y = SUNK_Y * (1 - e);
    if (!this.pendingId) this.displayGroup.position.y = this.group.position.y;
    if (this.state === 'hidden' && !this.pendingId) this.displayGroup.visible = false;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    const pulse = this.flash * (0.5 + 0.5 * Math.sin(time * 28));
    this.wheelMaterial.uniforms.uFlash.value = pulse;
    this.trimMaterial.color.setHex(this.config.color).multiplyScalar(1 + pulse * 0.45);
    this.group.scale.setScalar(1 + pulse * 0.025);
    this.iconAnchor.position.y = 2.16 + Math.sin(time * 2.8 + this.pos.z) * 0.07;
  }

  get active() {
    return this.state !== 'hidden' || !!this.pendingId;
  }

  usable(playerPos) {
    if (!this.shopOpen || (!this.pendingId && (!this.isUp() || this.completedThisShop))) return null;
    const d2 = this.useDistance(playerPos);
    return d2 < 0 ? null : { target: this, d2 };
  }

  addTargets(out) {
    if (this.state !== 'hidden') out.push(this.hit);
  }

  snapshot(player) {
    return {
      kind: this.kind,
      color: this.config.color,
      cost: this.config.cost,
      chance: player.donationChance,
      spinChance: this.spinChance,
      spinning: this.spinning,
      spinElapsed: this.spinElapsed,
      angle: this.wheelMaterial.uniforms.uAngle.value,
      landingAngle: this.landingAngle,
      pendingId: this.pendingId,
      completedThisShop: this.completedThisShop,
      soldOut: donationSoldOut(player),
      state: this.state,
    };
  }

}
