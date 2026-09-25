// Three permanent shop fixtures which trade a fixed resource for progress
// toward a machine-exclusive build item. The catalogue and the payment live
// outside this file: a machine is furniture. It draws the state it is handed,
// exposes the same present/dismiss/update/usable/addTargets contract as the
// other shop installations, and never decides what a player owns.

import * as THREE from 'three';
import { BOUND } from './arena.js';
import { buildPixelIcon } from './pixelicons.js';
import { DONATION_ITEMS, donationItemKey } from './items/donation/index.js';
import {
  DIM_TEXT, HIT_MAT, SIGN_COLOR, SUNK_Y, RISE_SECONDS,
  hex, makePanel, pxText, roundRect,
} from './totems.js';

export const DONATION_USE_RADIUS = 2.6;
export const DONATION_BANK_Z = BOUND - 1.25;

export const DONATION_MACHINE_CONFIG = Object.freeze({
  ammo: Object.freeze({
    title: 'AMMO DONATION', color: 0xffd600, cost: 30,
    costLabel: '30 RESERVE ROUNDS', shortCost: '30 AMMO',
  }),
  health: Object.freeze({
    title: 'HEALTH DONATION', color: 0xff2d6f, cost: 10,
    costLabel: '10 HEALTH', shortCost: '10 HP',
  }),
  credits: Object.freeze({
    title: 'CREDITS DONATION', color: 0x00e676, cost: 1000,
    costLabel: '$1,000 CREDITS', shortCost: '$1,000',
  }),
});

export function donationRequirement(player, kind) {
  return 5 + (player.donationTiers[kind] || 0);
}

export function donationSoldOut(player, kind) {
  const pool = DONATION_ITEMS[kind];
  for (const id in pool) {
    if (!player.donationItems[donationItemKey(kind, id)]) return false;
  }
  return true;
}

// Uniform selection without constructing a filtered array on the interaction
// path. The first pass counts the open entries; the second walks to the chosen
// index. Catalogue iteration order has no effect on the odds.
export function randomUnownedDonationItem(player, kind, random = Math.random) {
  const pool = DONATION_ITEMS[kind];
  let count = 0;
  for (const id in pool) {
    if (!player.donationItems[donationItemKey(kind, id)]) count++;
  }
  if (!count) return null;
  let chosen = Math.floor(random() * count);
  for (const id in pool) {
    if (player.donationItems[donationItemKey(kind, id)]) continue;
    if (chosen-- === 0) return id;
  }
  return null;
}

const BODY_GEOM = new THREE.BoxGeometry(1.3, 2.1, 0.82);
const FACE_GEOM = new THREE.BoxGeometry(0.92, 1.52, 0.08);
const TRIM_GEOM = new THREE.BoxGeometry(1.05, 0.08, 0.1);
const HIT_GEOM = new THREE.BoxGeometry(1.5, 2.6, 1.05);
const METER_GEOM = new THREE.PlaneGeometry(0.52, 0.94);
const BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x111722, roughness: 0.55, metalness: 0.65,
});
const FACE_MAT = new THREE.MeshStandardMaterial({
  color: 0x05080e, roughness: 0.4, metalness: 0.7,
});

function meterMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uFilled: { value: 0 },
      uSections: { value: 5 },
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
      uniform float uFilled;
      uniform float uSections;
      uniform float uFlash;
      varying vec2 vUv;
      void main() {
        float section = floor(vUv.y * uSections);
        float inside = step(section + 0.5, uFilled);
        float localY = fract(vUv.y * uSections);
        float gap = min(0.18, 0.8 / uSections);
        float bar = step(gap, localY) * step(localY, 1.0 - gap);
        vec3 dark = mix(vec3(0.012, 0.018, 0.028), uColor, 0.10);
        vec3 lit = uColor * (1.0 + uFlash * 0.9);
        vec3 col = mix(dark, lit, inside) * bar;
        col += uColor * 0.025 * (1.0 - bar);
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
    machine.soldOut ? 'SOLD OUT' : `${machine.progress} / ${machine.required}`,
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
  constructor(kind, x, z, scene) {
    this.kind = kind;
    this.config = DONATION_MACHINE_CONFIG[kind];
    this.pos = new THREE.Vector3(x, 0, z);
    this.state = 'hidden';
    this.rise = 0;
    this.progress = 0;
    this.required = 5;
    this.soldOut = false;
    this.pendingId = null;
    this.completedThisShop = false;
    this.flash = 0;

    this.group = new THREE.Group();
    this.group.position.set(x, SUNK_Y, z);
    // Local +Z is the front. The bank stands at the +Z wall, so a half turn
    // makes every face point back into the arena and toward the Mystery Box.
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

    this.meterMaterial = meterMaterial(this.config.color);
    this.meter = new THREE.Mesh(METER_GEOM, this.meterMaterial);
    this.meter.position.set(0, 1.13, 0.485);
    this.group.add(this.meter);

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

    // This pool's exclusive reward plates are built once with the cabinet. A
    // reveal only toggles visibility; completing a tier never allocates scene
    // data, regardless of how many definition files the pool contains.
    this.icons = {};
    this.iconAnchor = new THREE.Group();
    this.iconAnchor.position.set(0, 2.16, 0.66);
    this.iconAnchor.scale.setScalar(1.15);
    for (const [id, def] of Object.entries(DONATION_ITEMS[kind])) {
      const icon = buildPixelIcon(donationItemKey(kind, id), def.theme);
      icon.visible = false;
      this.icons[id] = icon;
      this.iconAnchor.add(icon);
    }
    this.displayGroup.add(this.iconAnchor);

    drawNormal(this);
    scene.add(this.group);
    scene.add(this.displayGroup);
  }

  present() {
    this.clearPending();
    this.completedThisShop = false;
    if (this.state !== 'up') this.state = 'rising';
    this.group.visible = true;
    this.displayGroup.visible = true;
  }

  dismiss() {
    this.clearPending();
    if (this.state !== 'hidden') this.state = 'sinking';
    else this.displayGroup.visible = false;
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

  setProgress(progress, required, soldOut = false) {
    this.progress = progress;
    this.required = required;
    this.soldOut = soldOut;
    if (this.pendingId) return;
    this.meterMaterial.uniforms.uFilled.value = progress;
    this.meterMaterial.uniforms.uSections.value = required;
    drawNormal(this);
  }

  reveal(itemId, completedRequirement) {
    const def = DONATION_ITEMS[this.kind][itemId];
    if (!def) return;
    this.pendingId = itemId;
    this.completedThisShop = true;
    this.required = completedRequirement;
    this.progress = completedRequirement;
    this.flash = 1;
    this.meterMaterial.uniforms.uFilled.value = completedRequirement;
    this.meterMaterial.uniforms.uSections.value = completedRequirement;
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
    this.meterMaterial.uniforms.uFlash.value = pulse;
    this.trimMaterial.color.setHex(this.config.color).multiplyScalar(1 + pulse * 0.45);
    this.group.scale.setScalar(1 + pulse * 0.025);
    this.iconAnchor.position.y = 2.16 + Math.sin(time * 2.8 + this.pos.z) * 0.07;
  }
}

export class DonationMachineArea {
  constructor(scene) {
    // From the arena centre the bank sits behind the Mystery Box at z=9.5,
    // directly before its nearest wall. The centre cabinet and the midpoint
    // of the outer pair share the box's x=0 centreline exactly.
    const z = DONATION_BANK_Z;
    const spacing = 3.0;
    this.machines = [
      new DonationMachine('ammo', -spacing, z, scene),
      new DonationMachine('health', 0, z, scene),
      new DonationMachine('credits', spacing, z, scene),
    ];
    this.byKind = Object.fromEntries(this.machines.map((m) => [m.kind, m]));
  }

  get active() {
    return this.machines.some((m) => m.state !== 'hidden' || m.pendingId);
  }

  present(player) {
    for (const machine of this.machines) {
      machine.present();
      machine.setProgress(
        player.donationProgress[machine.kind] || 0,
        donationRequirement(player, machine.kind),
        donationSoldOut(player, machine.kind)
      );
    }
  }

  dismiss() {
    for (const machine of this.machines) machine.dismiss();
  }

  update(dt, time, playerPos, player) {
    for (const machine of this.machines) machine.update(dt, time, playerPos);
  }

  usable(playerPos) {
    let best = null;
    let bestD = Infinity;
    for (const machine of this.machines) {
      if (!machine.pendingId && !machine.isUp()) continue;
      if (!machine.pendingId && machine.completedThisShop) continue;
      const d2 = machine.useDistance(playerPos);
      if (d2 < 0 || d2 >= bestD) continue;
      best = machine;
      bestD = d2;
    }
    return best ? { target: best, d2: bestD } : null;
  }

  addTargets(out) {
    for (const machine of this.machines) {
      if (machine.state !== 'hidden') out.push(machine.hit);
    }
  }

  setProgress(kind, progress, required, soldOut = false) {
    const machine = this.byKind[kind];
    if (machine) machine.setProgress(progress, required, soldOut);
  }

  reveal(kind, itemId, completedRequirement) {
    const machine = this.byKind[kind];
    if (machine) machine.reveal(itemId, completedRequirement);
  }

  snapshot(player) {
    return this.machines.map((machine) => ({
      kind: machine.kind,
      color: machine.config.color,
      cost: machine.config.cost,
      progress: player.donationProgress[machine.kind] || 0,
      completedTiers: player.donationTiers[machine.kind] || 0,
      required: donationRequirement(player, machine.kind),
      filledSections: machine.meterMaterial.uniforms.uFilled.value,
      visibleSections: machine.meterMaterial.uniforms.uSections.value,
      pendingId: machine.pendingId,
      completedThisShop: machine.completedThisShop,
      soldOut: donationSoldOut(player, machine.kind),
      state: machine.state,
    }));
  }
}
