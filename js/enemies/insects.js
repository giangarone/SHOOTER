import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, geo, lump, slab, prism, spike, eyes, orbit, landHit, segBlocked, addWarnedMortar } from './shared.js';

const COLOR = 0xffd16b;
const body = { color: 0x557a62, eye: COLOR, scale: 1, radius: 0.5, mass: 1 };
const shot = { core: COLOR, glow: 0x557a62, scale: 0.5, speed: [16, 0.2, 22], dmg: [7, 0.25, 13] };
const TYPES = {
  sicklemantis: { ...body, hp: 36, speed: 3.3, damage: 8, value: 130,
    head: { r: 0.3, y: 1.15 },
    build: buildRusher, ai: aiRusher, cleanup },
  needletail: { ...body, hp: 26, speed: 2.4, damage: 9, value: 260,
    head: { r: 0.3, y: 0.6 },
    proj: shot,
    build: buildGunner, ai: aiGunner, cleanup },
  stagguard: { ...body, hp: 145, speed: 1.6, damage: 18, value: 320,
    head: { r: 0.3, y: 0.85 },
    scale: 1.4, radius: 0.7, mass: 2,
    armor: (e) => e.state === 'tell' ? 0.6 : 1,
    armorDefault: (e) => e.state === 'tell' ? 0.6 : 1,
    build: buildBrute, ai: aiBrute, cleanup },
  antlion: { ...body, hp: 44, speed: 1.9, damage: 10, value: 270,
    head: { r: 0.3, y: 0.8 },
    build: buildArtillery, ai: aiArtillery, cleanup },
  lanternmoth: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350,
    head: { r: 0.3, y: 1.5 },
    build: buildSupport, ai: aiSupport, cleanup },
  lancewasp: { ...body, hp: 52, speed: 3.8, damage: 9, value: 300,
    head: { r: 0.3, y: 0.5 },
    proj: shot,
    fly: { height: 3.5 }, hitbox: { r: 0.6, y: 0.4 },
    build: buildFlier, ai: aiFlier, cleanup },
  vesperqueen: { ...body, hp: 3200, speed: 1.8, damage: 24, value: 6500,
    head: { r: 0.3, y: 1.65 },
    proj: shot,
    name: 'THE VESPER QUEEN', boss: true, scale: 2.6, radius: 1.7, mass: 9,
    hitbox: { r: 0.9, y: 0.9 }, statusMul: 0.3, freezeSlow: true,
    slowFactor: 0.75, freezeVuln: 1, entropyExempt: true, fearMode: 'stagger',
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildBoss, ai: aiBoss, cleanup },
};
Object.assign(ENEMY_TYPES, TYPES);

// Six-legged silhouettes and segmented shell plates distinguish this family
// from HIVE's brood economy. Amber seams stay readable through status tints.
const ORBIT = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.5, flip: 2, flipVar: 1 };
const at = new THREE.Vector3();
function legs(P, width, length = 0.5) {
  const out = [];
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    out.push(P('inLeg', slab(0.07, 0.6, 0.07), { x: side * width, y: 0.28,
      z: (i - 1) * length, rz: side * 0.85, rx: (i - 1) * 0.4, mat: SHARED_MATS.insectShell }));
    P('inFoot', spike(0.065, 0.36, 4), { x: side * (width + 0.2), y: 0.1,
      z: (i - 1) * length, rx: Math.PI, mat: SHARED_MATS.insectAmber });
  }
  return out;
}
function antennae(P, y, z) {
  for (const side of [-1, 1]) {
    P('inAntenna', slab(0.035, 0.5, 0.035), { x: side * 0.17, y: y + 0.2, z, rz: -side * 0.45 });
    P('inAntennaTip', lump(0.055), { x: side * 0.28, y: y + 0.42, z, mat: SHARED_MATS.insectAmber });
  }
}
function abdomen(P, y, z, size = 1) {
  for (let i = 0; i < 3; i++) {
    P('inAbdomen', lump(0.3), { y, z: z + i * 0.24 * size, sx: size * (1 - i * 0.15),
      sy: size * 0.85, sz: size * 0.8, mat: SHARED_MATS.insectShell });
    P('inAbdomenBand', slab(0.4, 0.045, 0.065), { y: y + size * 0.22,
      z: z + i * 0.24 * size, sx: size * (1 - i * 0.15), mat: SHARED_MATS.insectAmber });
  }
}
function wings(P, y, size) {
  const out = [];
  for (const side of [-1, 1]) for (const z of [-0.05, 0.35]) {
    const wing = P('inWing', lump(0.5), { x: side * 0.55 * size, y, z,
      sx: size * 1.2, sy: 0.035, sz: size * 0.45, ry: side * 0.35,
      mat: SHARED_MATS.insectWing, shadow: false });
    // Veins are children of the membrane, so the entire wing beats together.
    for (let i = -1; i <= 1; i++) {
      const vein = new THREE.Mesh(geo('inWingVein', slab(0.65, 0.25, 0.025)), SHARED_MATS.insectShell);
      vein.position.set(0, 0.35, i * 0.12); vein.rotation.y = i * 0.3;
      wing.add(vein);
    }
    out.push(wing);
  }
  return out;
}
function buildRusher(e, g, s) {
  const P = partsFor(e, g, s);
  P('inMantisThorax', prism(0.13, 0.23, 0.8, 5), { y: 0.65, rx: -0.25 });
  P('inMantisHead', lump(0.25), { y: 1.15, z: -0.27, sy: 0.7, sx: 1.35 });
  e.blades = [-1, 1].map((side) => P('inSickle', spike(0.12, 0.85, 4),
    { x: side * 0.4, y: 0.75, z: -0.55, rx: -0.65, rz: side * 0.45, mat: SHARED_MATS.insectAmber }));
  abdomen(P, 0.45, 0.3, 0.7); legs(P, 0.3, 0.3); antennae(P, 1.2, -0.25);
  eyes(P, { y: 1.15, z: -0.45, x: 0.18, mat: e.eyeMat });
}
function buildGunner(e, g, s) {
  const P = partsFor(e, g, s);
  P('inNeedleThorax', lump(0.28), { y: 0.45, sz: 1.3 });
  for (let i = 0; i < 4; i++) P('inTailJoint', lump(0.16), { y: 0.65 + i * 0.23,
    z: 0.45 - i * i * 0.05, mat: SHARED_MATS.insectShell });
  e.stinger = P('inNeedle', spike(0.12, 0.5, 5), { y: 1.35, z: -0.25,
    rx: -Math.PI / 2, mat: e.eyeMat });
  legs(P, 0.32, 0.3); antennae(P, 0.6, -0.2);
  eyes(P, { y: 0.6, z: -0.28, mat: e.eyeMat });
}
function buildBrute(e, g, s) {
  const P = partsFor(e, g, s);
  P('inStagBody', lump(0.55), { y: 0.55, sz: 1.25 });
  e.plates = [-1, 1].map((side) => P('inStagElytron', lump(0.4), { x: side * 0.24,
    y: 0.7, z: 0.1, sx: 0.7, sz: 1.4, mat: SHARED_MATS.insectShell }));
  for (const side of [-1, 1]) {
    P('inStagHorn', spike(0.12, 0.8, 5), { x: side * 0.32, y: 0.7, z: -0.63, rx: -1.2, rz: side * 0.25 });
    P('inStagTine', spike(0.075, 0.35, 4), { x: side * 0.22, y: 0.75, z: -0.9, rz: side * 1.1, mat: SHARED_MATS.insectAmber });
  }
  legs(P, 0.55); eyes(P, { y: 0.85, z: -0.43, x: 0.25, r: 1.3, mat: e.eyeMat });
}
function buildArtillery(e, g, s) {
  const P = partsFor(e, g, s);
  abdomen(P, 0.38, 0.2, 1.4);
  P('inAntlionHead', lump(0.4), { y: 0.55, z: -0.4, sy: 0.65 });
  for (const side of [-1, 1]) P('inAntlionJaw', spike(0.15, 0.8, 5),
    { x: side * 0.35, y: 0.4, z: -0.8, rx: -Math.PI / 2, rz: side * 0.4, mat: SHARED_MATS.insectAmber });
  legs(P, 0.45, 0.3); eyes(P, { y: 0.8, z: -0.52, mat: e.eyeMat });
}
function buildSupport(e, g, s) {
  const P = partsFor(e, g, s);
  P('inMothBody', lump(0.25), { y: 1.1, sy: 1.8 });
  e.lantern = P('inMothLantern', lump(0.26), { y: 0.65, sy: 1.4, mat: e.eyeMat });
  e.wings = wings(P, 1.15, 1.2);
  legs(P, 0.2, 0.15); antennae(P, 1.5, -0.1);
  eyes(P, { y: 1.5, z: -0.2, mat: e.eyeMat });
}
function buildFlier(e, g, s) {
  const P = partsFor(e, g, s);
  P('inWaspThorax', lump(0.3), { y: 0.4, sz: 1.15 });
  abdomen(P, 0.35, 0.35, 0.9);
  P('inWaspLance', spike(0.08, 0.8, 5), { y: 0.28, z: -0.65, rx: -Math.PI / 2, mat: e.eyeMat });
  e.wings = wings(P, 0.6, 0.85); legs(P, 0.2, 0.2); antennae(P, 0.55, -0.2);
  eyes(P, { y: 0.5, z: -0.28, mat: e.eyeMat });
}
function buildBoss(e, g, s) {
  const P = partsFor(e, g, s);
  P('inQueenThorax', prism(0.3, 0.5, 1.0, 6), { y: 0.95, rx: -0.2 });
  P('inQueenHead', lump(0.36), { y: 1.65, z: -0.45, sx: 1.25, sy: 0.65 });
  abdomen(P, 0.7, 0.45, 1.7); legs(P, 0.8, 0.65);
  e.wings = wings(P, 1.4, 1.8);
  e.blades = [-1, 1].map((side) => P('inQueenScythe', spike(0.18, 1.4, 5),
    { x: side * 0.95, y: 1.05, z: -0.65, rx: -0.55, rz: side * 0.55, mat: SHARED_MATS.insectAmber }));
  for (let i = -2; i <= 2; i++) P('inQueenCrown', spike(0.07, 0.5 - Math.abs(i) * 0.08, 4),
    { x: i * 0.13, y: 1.98, z: -0.4, rz: -i * 0.18, mat: SHARED_MATS.insectAmber });
  e.heart = P('inQueenHeart', lump(0.25), { y: 1.0, z: -0.45, mat: e.eyeMat });
  e.plates = [-1, 1].map((side) => P('inQueenPlate', slab(0.3, 0.6, 0.16),
    { x: side * 0.16, y: 1, z: -0.65, mat: SHARED_MATS.insectShell }));
  antennae(P, 1.8, -0.45); eyes(P, { y: 1.65, z: -0.72, x: 0.26, r: 1.6, mat: e.eyeMat });
}
function cleanup(e) {
  if (e.mark >= 0) e.fx.markRelease(e.mark);
  e.mark = undefined;
}
function capture(e, a) {
  e.nx = a.nx; e.nz = a.nz; e.aim = Math.atan2(a.nz, a.nx);
  e.tx = a.ctx.player.pos.x; e.tz = a.ctx.player.pos.z;
}
function lane(e, a, length, width, progress) {
  if (e.mark === undefined) { e.fx = a.ctx.effects; e.mark = e.fx.markAcquire(); }
  e.fx.markSet(e.mark, e.pos.x + e.nx * length / 2, e.pos.z + e.nz * length / 2,
    width, COLOR, progress, length / (width * 2), Math.atan2(-e.nx, -e.nz));
}
function face(e) { e.faceLocked = true; e.group.rotation.y = Math.atan2(-e.nx, -e.nz); }
function touch(e, a, radius) {
  return a.dist < radius && Math.abs(a.ctx.player.pos.y - e.pos.y) < (e.boss ? 3.5 : 1.4) &&
    !segBlocked(e.pos.x, e.pos.y + 0.5, e.pos.z, a.ctx.player.pos.x,
      a.ctx.player.pos.y + 0.8, a.ctx.player.pos.z, a.ctx.obstacles);
}
function fire(e, a, offset, height = 1.2) {
  const live = Math.atan2(a.ctx.player.pos.z - e.pos.z, a.ctx.player.pos.x - e.pos.x);
  a.ctx.addProjectile(e.pos.x, e.pos.y + height, e.pos.z, e.type, e._projScale(), e.aim - live + offset);
}
function flutter(e, a) {
  e.wings.forEach((m, i) => { m.rotation.z = (i < 2 ? -1 : 1) * (0.15 + Math.sin(a.ctx.time * 25) * 0.22); });
}
function rest(e, a, seconds = 1.6) {
  if (e.type === 'stagguard' && e.state === 'rush') {
    // The horns plough two clods out to the sides. Backing out of the lane
    // avoids the charge; staying off its flanks avoids the delayed debris.
    for (const side of [-1, 1]) addWarnedMortar(a.ctx, e.pos.x - e.nz * side * 2.7,
      e.pos.z + e.nx * side * 2.7, 1.4, 1.0, e.damage * 0.5);
  }
  cleanup(e); e.state = 'rest'; e.timer = seconds; e.stepMul = 1.4; e._setEyeAlert(false);
  if (e.boss) { e.bs.weakOpen = true; e.bs.ventNote = 'THORAX EXPOSED'; a.ctx.bossEvent('vent', e); }
}
function rush(e, a, speed, radius) {
  face(e); e.stepMul = 5;
  // A late-wave speed multiplier cannot outrun the painted lane. Slows still
  // reduce travel, and a long frame only integrates the time left in the rush.
  const v = Math.min(e.speed * 4, speed) * Math.min(1, a.sp / Math.max(0.001, e.speed)) *
    Math.min(1, Math.max(0, e.timer + a.dt) / a.dt);
  a.vx = e.nx * v; a.vz = e.nz * v;
  if (!e.hit && touch(e, a, radius)) { landHit(e, a.ctx, e.boss ? Math.min(30, e.damage) : e.damage); e.hit = true; }
  if (e.timer <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 21 || Math.abs(e.pos.z) > 21) rest(e, a, e.boss ? 1.8 : 1.6);
}
function charger(e, a, brute) {
  e.timer = (e.timer || 0) - a.dt;
  if (e.blades) e.blades.forEach((m) => { m.rotation.x = e.state === 'tell' ? -1.2 : -0.65; });
  if (e.plates) e.plates.forEach((m, i) => { m.rotation.z = e.state === 'rest' ? (i ? -0.4 : 0.4) : 0; });
  if (e.state === 'rush') { rush(e, a, brute ? 6 : 9, brute ? 2 : 1.5); return; }
  if (e.state === 'tell') {
    face(e); lane(e, a, brute ? 9 : 8, brute ? 2 : 1.5, 1 - e.timer / (brute ? 1 : 0.65));
    if (e.timer <= 0) {
      const visible = e.mark >= 0; cleanup(e);
      if (!visible) { rest(e, a); return; }
      e.state = 'rush'; e.timer = brute ? 1.1 : 0.65; e.hit = false;
    }
    return;
  }
  if (e.timer > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < (brute ? 10 : 8)) { capture(e, a); e.state = 'tell'; e.timer = brute ? 1 : 0.65; e._setEyeAlert(true); }
}
function aiRusher(e, a) { charger(e, a, false); }
function aiBrute(e, a) { charger(e, a, true); }
function aiGunner(e, a) {
  if (e.timer > 0) {
    face(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      fire(e, a, (e.round - 1) * 0.1, 1.35); e.round++;
      if (e.round < 3) e.timer = 0.18;
      else e._setEyeAlert(false);
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 22) { capture(e, a); e.timer = 0.7; e.round = 0; e.attackCd = 3.3; e._setEyeAlert(true); }
}
function aiArtillery(e, a) {
  if (e.timer > 0) {
    face(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      for (const side of [-1, 1]) addWarnedMortar(a.ctx, e.tx - e.nz * side * 2.7,
        e.tz + e.nx * side * 2.7, 1.7, 0.9, e.damage);
      addWarnedMortar(a.ctx, e.tx, e.tz, 1.8, 1.65, e.damage);
      e._setEyeAlert(false);
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 24) { capture(e, a); e.timer = 0.8; e.attackCd = 4.8; e._setEyeAlert(true); }
}
function aiSupport(e, a) {
  flutter(e, a); orbit(e, a, ORBIT);
  // Pheromones advance only an idle attack cooldown, never an active warning.
  // A per-recipient refractory period prevents several moths stacking it.
  const valid = (o) => o && o !== e && !o.dead && !o.boss && o.type !== e.type &&
    ['needletail', 'antlion', 'lancewasp'].includes(o.type) && o.attackCd > 1 && (o.pheromoneUntil || 0) <= a.ctx.time && o.pos.distanceToSquared(e.pos) < 81 &&
    !segBlocked(e.pos.x, 1, e.pos.z, o.pos.x, 1, o.pos.z, a.ctx.obstacles);
  if (e.timer > 0) {
    a.vx = a.vz = 0; e.timer -= a.dt;
    if (!valid(e.patient)) { e.timer = 0; e._setEyeAlert(false); return; }
    a.ctx.effects.beam(e.pos, e.patient.pos, COLOR);
    if (e.timer <= 0) {
      e.patient.attackCd = Math.max(0.8, e.patient.attackCd - 1.2);
      e.patient.pheromoneUntil = a.ctx.time + 5; e._setEyeAlert(false);
    }
    return;
  }
  if (e.attackCd <= 0) {
    e.patient = a.ctx.enemies.find(valid);
    if (e.patient) { e.timer = 0.7; e.attackCd = 4.5; e._setEyeAlert(true); }
  }
}
function aiFlier(e, a) {
  flutter(e, a);
  if (e.timer > 0) {
    face(e);
    e.timer -= a.dt; e.hoverY = 1.1; e.flyRate = 4;
    if (e.timer <= 0) {
      fire(e, a, 0, 0.35); e.hoverY = 3.5; e.escape = 1.5; e._setEyeAlert(false);
    }
    return;
  }
  if (e.escape > 0) { e.escape -= a.dt; a.vx = -a.nx * a.sp; a.vz = -a.nz * a.sp; return; }
  orbit(e, a, { ...ORBIT, dist: 8 });
  if (e.attackCd <= 0 && a.dist < 18) { capture(e, a); e.timer = 0.9; e.attackCd = 3.8; e._setEyeAlert(true); }
}
function aiBoss(e, a) {
  const bs = e.bs;
  if (!e.state) { e.state = 'stalk'; e.timer = 1.4; bs.turn = 0; }
  bs.enraged = e.hp < e.maxHp * 0.5;
  flutter(e, a);
  e.plates.forEach((m, i) => { m.position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.48 : 0.16) * e.scale; });
  e.blades.forEach((m, i) => { m.rotation.x = e.state === 'tell' ? -1.15 : -0.55;
    m.rotation.z = (i ? 1 : -1) * (bs.weakOpen ? 0.9 : 0.55); });
  if (e.status.fear > 0) return;
  e.timer -= a.dt;
  if (e.state === 'rush') { rush(e, a, 8, 2.6); return; }
  if (e.state === 'volley') {
    face(e);
    if (e.timer <= 0) {
      for (let i = 0; i < 5; i++) fire(e, a, (i - 2) * 0.25 + (e.round % 2 ? 0.125 : 0), 2.4);
      e.round++; e.timer = 0.45;
      if (e.round >= (bs.enraged ? 4 : 3)) rest(e, a, 1.8);
    }
    return;
  }
  if (e.state === 'tell') {
    face(e);
    if (bs.attack === 'lance') lane(e, a, 12, 2.6, 1 - e.timer / 1.1);
    if (e.timer > 0) return;
    const visible = e.mark >= 0; cleanup(e);
    if (bs.attack === 'lance') {
      if (!visible) { rest(e, a, 1.8); return; }
      e.state = 'rush'; e.timer = 1.1; e.hit = false;
    } else if (bs.attack === 'scissors') {
      const n = bs.enraged ? 3 : 2;
      for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
        addWarnedMortar(a.ctx, e.tx + e.nx * i * 2.7 - e.nz * side * 2.8,
          e.tz + e.nz * i * 2.7 + e.nx * side * 2.8, 1.6, 0.8 + i * 0.2, Math.min(22, e.damage * 0.7));
      }
      addWarnedMortar(a.ctx, e.tx, e.tz, 1.9, 1.7, Math.min(22, e.damage * 0.7));
      rest(e, a, 1.8);
    } else { e.state = 'volley'; e.timer = 0; e.round = 0; }
    return;
  }
  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e); e.state = 'stalk';
    e.timer = (bs.enraged ? 0.8 : 1.4) * e.rate;
  }
  // Alternating lateral approach makes the queen stalk like a mantis rather
  // than marching down the same line between every attack.
  a.vx = (a.px * 0.7 - a.pz * (bs.turn % 2 ? 0.35 : -0.35)) * a.sp;
  a.vz = (a.pz * 0.7 + a.px * (bs.turn % 2 ? 0.35 : -0.35)) * a.sp;
  if (e.timer > 0 || a.dist > 28) return;
  capture(e, a); bs.attack = ['lance', 'scissors', 'volley'][bs.turn++ % 3];
  e.state = 'tell'; e.timer = 1.1; e._setEyeAlert(true);
  at.set(e.pos.x, 1, e.pos.z); a.ctx.effects.shockwave(at, COLOR, 3, 0.5);
}
