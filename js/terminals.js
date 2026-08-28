// In-arena vending terminals - the only place credits are ever spent.
//
// Three fixed stations bolted to the perimeter walls. The player runs up to
// one and presses E; there is no menu and no pause. Each terminal carries one
// item and holds a single charge per wave, so spending is a decision about
// crossing the arena under fire rather than a shopping trip.
//
// PERFORMANCE RULES, same as powerups.js:
//   1. No PointLights. three.js keys its shader programs on the scene's light
//      count, so adding one recompiles every material in the scene. Terminals
//      glow with emissive materials only.
//   2. Everything here is built once at startup and lives for the whole
//      session - terminals are never spawned or destroyed, so nothing is ever
//      disposed. Geometries and the wall-panel materials are shared; only the
//      per-terminal label texture and screen material are unique, and there
//      are exactly three of each for the entire run.

import * as THREE from 'three';
import { makeAabb } from './utils.js';
import { SHOP_ITEMS } from './upgrades.js';

// How close the player must be for the prompt to appear and E to work. Wider
// than it looks, so a terminal can be used while running past it.
export const USE_RADIUS = 3.2;

// Position and facing of each station. `yaw` turns the whole group so its
// local +Z (the screen face) points into the arena.
const PLACEMENTS = [
  { key: 'ammo', x: 0, z: -20.6, yaw: 0 },
  { key: 'repair', x: -20.6, z: 0, yaw: Math.PI / 2 },
  { key: 'shield', x: 20.6, z: 0, yaw: -Math.PI / 2 },
];

const BODY_GEOM = new THREE.BoxGeometry(1.8, 2.2, 0.7);
const SCREEN_GEOM = new THREE.BoxGeometry(1.4, 1.0, 0.06);
const BODY_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1f2b, roughness: 0.45, metalness: 0.7 });

// Colours match the pickup of the same type, so a terminal reads at a glance
// from across the arena without needing its label to be legible.
const ITEM_COLOR = {
  ammo: 0xffd600,
  repair: 0x00e676,
  shield: 0x4ef3ff,
};

// Label sprite. A canvas texture rather than 3D text: one 256x128 texture per
// terminal, redrawn only when the terminal is bought from or restocked.
function makeLabel(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const tex = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  sprite.scale.set(2.6, 1.3, 1);
  return { canvas, tex, sprite, color };
}

function drawLabel(label, title, sub, dim) {
  const c = label.canvas.getContext('2d');
  const hex = '#' + label.color.toString(16).padStart(6, '0');
  c.clearRect(0, 0, 256, 128);
  c.textAlign = 'center';
  c.globalAlpha = dim ? 0.35 : 1;
  c.fillStyle = hex;
  c.font = 'bold 40px system-ui, sans-serif';
  c.fillText(title, 128, 54);
  c.fillStyle = dim ? '#5b6785' : '#ffffff';
  c.font = '600 26px system-ui, sans-serif';
  c.fillText(sub, 128, 92);
  c.globalAlpha = 1;
  label.tex.needsUpdate = true;
}

export class Terminal {
  constructor(place, scene) {
    this.key = place.key;
    this.item = SHOP_ITEMS[place.key];
    this.color = ITEM_COLOR[place.key];
    // One charge, restocked at the start of every wave.
    this.available = true;
    this.pos = new THREE.Vector3(place.x, 0, place.z);

    this.group = new THREE.Group();
    this.group.position.set(place.x, 1.1, place.z);
    this.group.rotation.y = place.yaw;

    const body = new THREE.Mesh(BODY_GEOM, BODY_MAT);
    body.castShadow = true;
    this.group.add(body);

    // The screen is the only part that changes state, so it gets the one
    // per-instance material each terminal owns.
    this.screenMat = new THREE.MeshStandardMaterial({
      color: this.color,
      emissive: this.color,
      emissiveIntensity: 1.4,
      roughness: 0.3,
      metalness: 0.5,
    });
    this.screen = new THREE.Mesh(SCREEN_GEOM, this.screenMat);
    this.screen.position.set(0, 0.35, 0.38);
    this.group.add(this.screen);

    this.label = makeLabel(this.color);
    this.label.sprite.position.set(0, 1.35, 0.2);
    this.group.add(this.label.sprite);

    scene.add(this.group);
    this.restock();
  }

  // Collision box, pushed into the arena obstacle list by buildTerminals so
  // the player can't walk through a station.
  aabb() {
    const wide = Math.abs(Math.sin(this.group.rotation.y)) > 0.5;
    return makeAabb(
      this.pos.x, 1.1, this.pos.z,
      wide ? 0.7 : 1.8, 2.2, wide ? 1.8 : 0.7
    );
  }

  restock() {
    this.available = true;
    this.screenMat.emissiveIntensity = 1.4;
    drawLabel(this.label, this.item.name, this.item.cost + 'c', false);
  }

  _markUsed() {
    this.available = false;
    this.screenMat.emissiveIntensity = 0.12;
    drawLabel(this.label, this.item.name, 'RESTOCKING', true);
  }

  inRange(playerPos) {
    const dx = playerPos.x - this.pos.x;
    const dz = playerPos.z - this.pos.z;
    return dx * dx + dz * dz < USE_RADIUS * USE_RADIUS;
  }

  // Why this terminal can't be used right now, or null if it can. Drives both
  // the prompt text and the purchase itself, so the two can never disagree.
  blockedReason(player, credits) {
    if (!this.available) return 'RESTOCKING';
    if (credits < this.item.cost) return 'NEED ' + this.item.cost + 'c';
    if (!this.item.enabled(player)) return 'NOT NEEDED';
    return null;
  }

  // Spends the charge. Callers must check blockedReason() first; this only
  // guards `available` so a double keypress can't buy twice.
  purchase(player, time) {
    if (!this.available) return false;
    this.item.apply(player, time);
    this._markUsed();
    return true;
  }

  // Idle bob on the label so a live terminal reads as active from a distance.
  update(time) {
    if (!this.available) return;
    this.label.sprite.position.y = 1.35 + Math.sin(time * 2.2) * 0.08;
    this.screenMat.emissiveIntensity = 1.2 + Math.sin(time * 3) * 0.3;
  }
}

// Builds all three stations and appends their collision boxes to `obstacles`.
export function buildTerminals(scene, obstacles) {
  const list = PLACEMENTS.map((p) => new Terminal(p, scene));
  for (const t of list) obstacles.push(t.aabb());
  return list;
}
