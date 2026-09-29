import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, geo, lump, slab, prism, spike, eyes, orbit, landHit, segBlocked, addWarnedMortar, capturedShot, contactReach, snapAim, faceSnap, markGet, markDrop, bossTouch } from './shared.js';

const COLOR = 0xffd16b;
const body = { color: 0x557a62, eye: COLOR, scale: 1, radius: 0.5, mass: 1 };
const shot = { core: COLOR, glow: 0x557a62, scale: 0.5, speed: [16, 0.2, 22], dmg: [7, 0.25, 13] };
const TYPES = {
  sicklemantis: { ...body, hp: 36, speed: 3.3, damage: 8, value: 130,
    head: { r: 0.3, y: 1.15 },
    build: buildRusher, ai: aiRusher, cleanup: markDrop },
  needletail: { ...body, hp: 26, speed: 2.4, damage: 9, value: 260,
    head: { r: 0.3, y: 0.6 },
    proj: shot,
    build: buildGunner, ai: aiGunner, cleanup: markDrop },
  stagguard: { ...body, hp: 145, speed: 1.6, damage: 18, value: 320,
    head: { r: 0.3, y: 0.85 },
    scale: 1.4, radius: 0.7, mass: 2,
    armor: (e) => e.state === 'tell' ? 0.6 : 1,
    armorDefault: (e) => e.state === 'tell' ? 0.6 : 1,
    build: buildBrute, ai: aiBrute, cleanup: markDrop },
  antlion: { ...body, hp: 44, speed: 1.9, damage: 10, value: 270,
    head: { r: 0.3, y: 0.8 },
    build: buildArtillery, ai: aiArtillery, cleanup: markDrop },
  lanternmoth: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350,
    head: { r: 0.3, y: 1.5 },
    build: buildSupport, ai: aiSupport, cleanup: markDrop },
  lancewasp: { ...body, hp: 52, speed: 3.8, damage: 9, value: 300,
    head: { r: 0.3, y: 0.5 },
    proj: shot,
    fly: { height: 3.5 }, hitbox: { r: 0.6, y: 0.4 },
    build: buildFlier, ai: aiFlier, cleanup: markDrop },
  vesperqueen: { ...body, hp: 3200, speed: 2.35, damage: 24, value: 6500,
    head: { r: 0.3, y: 1.65 },
    proj: shot,
    name: 'THE VESPER QUEEN', boss: true, scale: 2.6, radius: 1.7, mass: 9,
    hitbox: { r: 0.9, y: 0.9 }, statusMul: 0.3, freezeSlow: true,
    slowFactor: 0.75, freezeVuln: 1, entropyExempt: true, fearMode: 'stagger',
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildBoss, ai: aiBoss, cleanup: markDrop },
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
// Aim, marks, touch and the wind-up shot are shared.js's (snapAim, faceSnap,
// markGet, markDrop, contactReach, capturedShot); what is left here is the
// lane, which drives a shared rectangle rather than the shared disc.
function lane(e, a, length, width, progress) {
  const mark = markGet(e, a.ctx.effects);
  e.fx.markSet(mark, e.pos.x + e.nx * length / 2, e.pos.z + e.nz * length / 2,
    width, COLOR, progress, length / (width * 2), Math.atan2(-e.nx, -e.nz));
}
function flutter(e, a, hz = 25) {
  e.wings.forEach((m, i) => { m.rotation.z = (i < 2 ? -1 : 1) * (0.15 + Math.sin(a.ctx.time * hz) * 0.22); });
}
function rest(e, a, seconds = 1.6) {
  if (e.type === 'stagguard' && e.state === 'rush') {
    // The horns plough two clods out to the sides. Backing out of the lane
    // avoids the charge; staying off its flanks avoids the delayed debris.
    for (const side of [-1, 1]) addWarnedMortar(a.ctx, e.pos.x - e.nz * side * 2.7,
      e.pos.z + e.nx * side * 2.7, 1.4, 1.0, e.damage * 0.5);
  }
  markDrop(e); e.state = 'rest'; e.timer = seconds; e.stepMul = 1.4; e._setEyeAlert(false);
  if (e.boss) { e.bs.weakOpen = true; e.bs.ventNote = 'THORAX EXPOSED'; a.ctx.bossEvent('vent', e); }
}
function rush(e, a, speed, radius) {
  faceSnap(e); e.stepMul = 5;
  // A late-wave speed multiplier cannot outrun the painted lane. Slows still
  // reduce travel, and a long frame only integrates the time left in the rush.
  const v = Math.min(e.speed * 4, speed) * Math.min(1, a.sp / Math.max(0.001, e.speed)) *
    Math.min(1, Math.max(0, e.timer + a.dt) / a.dt);
  a.vx = e.nx * v; a.vz = e.nz * v;
  if (!e.hit && contactReach(e, a, radius, 1.4, 3.5)) { landHit(e, a.ctx, e.boss ? Math.min(30, e.damage) : e.damage); e.hit = true; }
  if (e.timer <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 21 || Math.abs(e.pos.z) > 21) rest(e, a, e.boss ? 1.8 : 1.6);
}
function charger(e, a, brute) {
  e.timer = (e.timer || 0) - a.dt;
  if (e.blades) e.blades.forEach((m) => { m.rotation.x = e.state === 'tell' ? -1.2 : -0.65; });
  if (e.plates) e.plates.forEach((m, i) => { m.rotation.z = e.state === 'rest' ? (i ? -0.4 : 0.4) : 0; });
  if (e.state === 'rush') { rush(e, a, brute ? 6 : 9, brute ? 2 : 1.5); return; }
  if (e.state === 'tell') {
    faceSnap(e); lane(e, a, brute ? 9 : 8, brute ? 2 : 1.5, 1 - e.timer / (brute ? 1 : 0.65));
    if (e.timer <= 0) {
      const visible = e.mark >= 0; markDrop(e);
      if (!visible) { rest(e, a); return; }
      e.state = 'rush'; e.timer = brute ? 1.1 : 0.65; e.hit = false;
    }
    return;
  }
  if (e.timer > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < (brute ? 10 : 8)) { snapAim(e, a); e.state = 'tell'; e.timer = brute ? 1 : 0.65; e._setEyeAlert(true); }
}
function aiRusher(e, a) { charger(e, a, false); }
function aiBrute(e, a) { charger(e, a, true); }
function aiGunner(e, a) {
  if (e.timer > 0) {
    faceSnap(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      capturedShot(e, a, e.aim, (e.round - 1) * 0.1, 1.35); e.round++;
      if (e.round < 3) e.timer = 0.18;
      else e._setEyeAlert(false);
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 22) { snapAim(e, a); e.timer = 0.7; e.round = 0; e.attackCd = 3.3; e._setEyeAlert(true); }
}
function aiArtillery(e, a) {
  if (e.timer > 0) {
    faceSnap(e);
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
  if (e.attackCd <= 0 && a.dist < 24) { snapAim(e, a); e.timer = 0.8; e.attackCd = 4.8; e._setEyeAlert(true); }
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
    faceSnap(e);
    e.timer -= a.dt; e.hoverY = 1.1; e.flyRate = 4;
    if (e.timer <= 0) {
      capturedShot(e, a, e.aim, 0, 0.35); e.hoverY = 3.5; e.escape = 1.5; e._setEyeAlert(false);
    }
    return;
  }
  if (e.escape > 0) { e.escape -= a.dt; a.vx = -a.nx * a.sp; a.vz = -a.nz * a.sp; return; }
  orbit(e, a, { ...ORBIT, dist: 8 });
  if (e.attackCd <= 0 && a.dist < 18) { snapAim(e, a); e.timer = 0.9; e.attackCd = 3.8; e._setEyeAlert(true); }
}
// ---- THE VESPER QUEEN ------------------------------------------------------
// A hunt, not a sentry post. She prowls a wide orbit and scuttles sideways
// between engagements, and every engagement is one of five insect behaviours,
// each telegraphed in its own way:
//
//   blitz    a mantis strike: a long painted lane, a rush down it, then a live
//            pivot and another (three when enraged). Sidestep, twice.
//   pits     an antlion trap: she cages your old position in a ring of
//            eruptions with one gap left open AWAY from her, centre last.
//   bloom    her abdomen blooms: planted rotating fans of needles that sweep
//            a hundred degrees. A body tell only, like every needleflyer.
//   clutch   she lays egg sacs around herself; each ruptures into an ichor
//            pool and spits a three-needle fan when it pops.
//   hunt     she marks you with pheromones - a scent disc that tracks you,
//            locks, and snaps into a chain of short committed darts.
//
// Every attack vents her thorax afterwards (the punish window is the fight's
// reward, kept), touching her HURTS at all times (a queen is never safe to
// hug), and at half health the whole hunt quickens with a room-wide alarm.
// Every floor attack routes through the warned-mark pool: a starved pool
// aborts the strike rather than landing a hit the player never saw.
const Q_ORBIT = { dist: 10.5, band: 2.4, out: 1.05, in: -1, strafe: 0.85, flip: 1.3, flipVar: 0.8 };
const Q_ROTATION = ['blitz', 'pits', 'bloom', 'hunt', 'clutch'];
const Q_MIN_DIST = { blitz: 6, bloom: 4.5, hunt: 4 };
const Q_TELLS = { blitz: 1.0, pits: 0.8, bloom: 0.85, hunt: 0.7, clutch: 0.8 };
// Shared shape for the two CHAINED attacks: an aim phase paints a short lane
// on a live snap, then the dash commits to it. Blitz is two heavy strides,
// the hunt three snappy darts - the loop is one, the read is two.
// Dash times are travel promises, not speeds: at the 13 m/s cap a stride
// must land inside the lane it painted - 15 for the blitz wind-up, 11 for a
// pivot, 8 for a dart - so each timer is its lane divided by the cap.
const Q_COMBOS = {
  blitz: { aims: 0.42, laneLen: 11, laneW: 2.2, dashT: 0.8, dashT1: 1.1, speed: 13, radius: 2.5, count: 2, enrCount: 3, rest: 1.5 },
  hunt: { aims: 0.26, laneLen: 8, laneW: 2.0, dashT: 0.6, dashT1: 0.6, speed: 13, radius: 2.3, count: 3, enrCount: 4, rest: 1.25 },
};
// The dash law is rush()'s: a late-wave speed multiplier cannot outrun the
// painted lane, slows still bite, and a long frame only integrates the time
// left in the dash. Returns true once the stride is spent.
function queenDash(e, a, speed, radius) {
  faceSnap(e); e.stepMul = 5;
  const v = Math.min(e.speed * 4, speed) * Math.min(1, a.sp / Math.max(0.001, e.speed)) *
    Math.min(1, Math.max(0, e.timer + a.dt) / a.dt);
  a.vx = e.nx * v; a.vz = e.nz * v;
  if (!e.bs.hitDone && contactReach(e, a, radius, 1.4, 3.5)) {
    landHit(e, a.ctx, Math.min(30, e.damage)); e.bs.hitDone = true;
  }
  return e.timer <= 0 || e.blockedBy > 0.05 || Math.abs(e.pos.x) > 21 || Math.abs(e.pos.z) > 21;
}
function queenCombo(e, a) {
  const bs = e.bs, c = bs.combo;
  if (bs.sub === 'aim') {
    faceSnap(e);
    lane(e, a, c.laneLen, c.laneW, 1 - e.timer / c.aims);
    if (e.timer > 0) return;
    const visible = e.mark >= 0; markDrop(e);
    if (!visible) { bs.combo = null; rest(e, a, 1.3); return; }
    bs.sub = 'dash'; e.timer = bs.stage === 1 ? c.dashT1 : c.dashT; bs.hitDone = false;
    return;
  }
  if (!queenDash(e, a, c.speed, c.radius)) return;
  bs.stage++; bs.left--;
  if (bs.left > 0) {
    snapAim(e, a); bs.sub = 'aim';
    e.timer = c.aims * (bs.enraged ? 0.75 : 1);
  } else {
    bs.combo = null; rest(e, a, c.rest);
  }
}
function queenPits(e, a) {
  // One gap in the ring, centered on the far side of the cage from her: the
  // escape is moving AWAY. Enraged tightens the ring and adds two pits, so
  // the gap stays the answer and only gets narrower.
  const bs = e.bs;
  const base = Math.atan2(e.tz - e.pos.z, e.tx - e.pos.x);
  // MAX_MORTARS is 10: 6+1 leaves room for the adds' own warnings, and the
  // enraged ring grows DENSER (8 smaller arcs, later) rather than wider.
  const n = bs.enraged ? 8 : 6, R = bs.enraged ? 3.7 : 3.2, delay = bs.enraged ? 1.15 : 0.9;
  for (let i = 0; i < n; i++) {
    const theta = base + Math.PI / n + i * Math.PI * 2 / n;
    addWarnedMortar(a.ctx, e.tx + Math.cos(theta) * R, e.tz + Math.sin(theta) * R,
      1.6, delay + i * 0.05, Math.min(22, e.damage * 0.7));
  }
  addWarnedMortar(a.ctx, e.tx, e.tz, 1.9, delay + n * 0.05 + 0.15, Math.min(24, e.damage * 0.8));
  rest(e, a, 1.45);
}
function queenClutch(e, a) {
  const bs = e.bs;
  const n = bs.enraged ? 4 : 3;
  const base = Math.atan2(a.nz, a.nx) + (Math.PI / n);
  bs.eggs = bs.eggs || [];
  for (let i = 0; i < n; i++) {
    const x = e.pos.x + Math.cos(base + i * Math.PI * 2 / n) * 2.7;
    const z = e.pos.z + Math.sin(base + i * Math.PI * 2 / n) * 2.7;
    // addWarnedMortar's reserve-check, plus the ground payload the shared
    // helper does not carry: an egg that cannot draw its warning is not laid.
    const h = a.ctx.effects.markAcquire();
    if (h < 0) continue;
    a.ctx.effects.markRelease(h);
    a.ctx.addMortar(x, z, 1.5, 1.5, Math.min(18, e.damage * 0.5),
      { radius: 2.0, life: 4.5, dps: Math.min(10, e.damage * 0.33), kind: 'pool' });
    bs.eggs.push({ x, z, at: a.ctx.time + 1.5 });
  }
  rest(e, a, 1.5);
}
// Egg pops ride on their own clock, not on her state: a sac laid at the end
// of the clutch ruptures while she is already venting, which is exactly when
// a player steps in.
function queenEggs(e, a) {
  const bs = e.bs;
  if (!bs.eggs) return;
  for (let i = bs.eggs.length - 1; i >= 0; i--) {
    if (a.ctx.time < bs.eggs[i].at) continue;
    const egg = bs.eggs[i];
    for (const s of [-0.42, 0, 0.42]) {
      a.ctx.addProjectile(egg.x, 0.75, egg.z, e.type, e._projScale(), s);
    }
    bs.eggs.splice(i, 1);
  }
}
function queenBloom(e, a) {
  const bs = e.bs;
  if (bs.bloomLeft === undefined) {
    bs.bloomLeft = bs.enraged ? 7 : 5;
    bs.bloomDir = bs.turn % 2 ? -1 : 1;
  }
  a.vx = a.vz = 0; faceSnap(e);
  if (e.timer > 0) return;
  const i = (bs.enraged ? 7 : 5) - bs.bloomLeft;
  const heading = bs.bloomAim + bs.bloomDir * i * 0.55;
  for (let j = 0; j < 5; j++) capturedShot(e, a, heading, (j - 2) * 0.22, 2.3);
  at.set(e.pos.x, 2, e.pos.z); a.ctx.effects.burst(at, COLOR, 8, 4, 2, 0.3);
  e.timer = 0.34;
  if (--bs.bloomLeft <= 0) { bs.bloomLeft = undefined; rest(e, a, 1.45); }
}
function queenPose(e, a) {
  const bs = e.bs;
  e.plates.forEach((m, i) => { m.position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.48 : 0.16) * e.scale; });
  let rx = -0.55, rz = bs.weakOpen ? 0.95 : 0.55;
  if (e.state === 'tell') {
    if (bs.attack === 'blitz' || bs.attack === 'hunt') rx = -1.25;
    else if (bs.attack === 'bloom') { rx = -0.15; rz = 1.15; }
    else rx = -0.95;
  } else if (e.state === 'combo') {
    if (bs.sub === 'dash') { rx = -0.05; rz = 0.8; } else rx = -1.25;
  }
  e.blades.forEach((m, i) => { m.rotation.x = rx; m.rotation.z = (i ? 1 : -1) * rz; });
  // Her heart swells through every tell - the body warn on attacks that paint
  // no lane, and a second read on the ones that do.
  e.heart.scale.setScalar(e.scale * (e.state === 'tell' ? 1 + 0.16 * Math.sin(a.ctx.time * 16) : 1));
}
function aiBoss(e, a) {
  const bs = e.bs;
  if (!e.state) {
    e.state = 'stalk'; e.timer = 1.3;
    bs.turn = 0; bs.attack = ''; bs.eggs = []; bs.scuttle = 0; bs.scuttleT = 1.2;
  }
  const wasEnraged = bs.enraged;
  bs.enraged = e.hp < e.maxHp * 0.5;
  if (bs.enraged && !wasEnraged) a.ctx.bossEvent('enrage', e);
  flutter(e, a, e.state === 'combo' && bs.sub === 'dash' ? 40 : 25);
  queenPose(e, a);
  queenEggs(e, a);
  // The touch rule: a queen is never safe to hug, whatever she is doing.
  bossTouch(e, a, 0.85);
  if (e.status.fear > 0) return;
  e.timer -= a.dt;
  if (e.state === 'combo') { queenCombo(e, a); return; }
  if (e.state === 'bloom') { queenBloom(e, a); return; }
  if (e.state === 'tell') {
    faceSnap(e);
    const T = Q_TELLS[bs.attack] * (bs.enraged ? 0.85 : 1);
    if (bs.attack === 'blitz') lane(e, a, 15, 2.4, 1 - e.timer / T);
    if (bs.attack === 'hunt' || bs.attack === 'pits') {
      // The scent disc and the cage marker TRACK the player until they lock -
      // the attack then commits to where the lock landed, so the dodge is a
      // change of direction, not a footrace.
      const m = markGet(e, a.ctx.effects);
      e.fx.markSet(m, a.ctx.player.pos.x, a.ctx.player.pos.z,
        bs.attack === 'hunt' ? 2.3 : 3.2, COLOR, 1 - e.timer / T);
    }
    if (e.timer > 0) return;
    const visible = e.mark === undefined ? true : e.mark >= 0; markDrop(e);
    if (!visible) { rest(e, a, 1.3); return; }
    // Blitz keeps the heading its lane has shown for the whole wind-up; the
    // others commit to where the player is the moment the tell snaps shut.
    if (bs.attack !== 'blitz') snapAim(e, a);
    if (bs.attack === 'blitz' || bs.attack === 'hunt') {
      const c = Q_COMBOS[bs.attack];
      e.state = 'combo'; bs.combo = c; bs.sub = bs.attack === 'blitz' ? 'dash' : 'aim';
      bs.left = bs.enraged ? c.enrCount : c.count; bs.stage = 1;
      e.timer = bs.attack === 'blitz' ? c.dashT1
        : c.aims * (bs.enraged ? 0.75 : 1);
      bs.hitDone = false;
    } else if (bs.attack === 'pits') queenPits(e, a);
    else if (bs.attack === 'clutch') queenClutch(e, a);
    else { bs.bloomAim = e.aim; bs.bloomLeft = undefined; e.state = 'bloom'; e.timer = 0.15; }
    return;
  }
  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e); e.state = 'stalk';
    e.timer = (bs.enraged ? 0.45 : 0.7) * e.rate;
  }
  // Prowl: hold a mid-ring on a walking orbit, and break it up with quick
  // lateral scuttles so she never drifts down one readable line.
  if (bs.scuttle > 0) {
    bs.scuttle -= a.dt; e.stepMul = 2.6;
    a.vx = -a.pz * bs.scuttleSide * a.sp * 2.3;
    a.vz = a.px * bs.scuttleSide * a.sp * 2.3;
  } else {
    e.stepMul = 1.15;
    orbit(e, a, Q_ORBIT);
    bs.scuttleT -= a.dt;
    if (bs.scuttleT <= 0) {
      bs.scuttle = 0.26;
      bs.scuttleSide = Math.random() < 0.5 ? -1 : 1;
      bs.scuttleT = 1.0 + Math.random() * 0.9;
    }
  }
  if (e.timer > 0 || a.dist > 30) return;
  // Next behaviour off the rotation; a pick that makes no sense at this range
  // (a charge at arm's length) yields to the next one rather than firing lame.
  for (let k = 0; k < Q_ROTATION.length; k++) {
    const name = Q_ROTATION[(bs.turn + k) % Q_ROTATION.length];
    if (a.dist < (Q_MIN_DIST[name] || 0)) continue;
    bs.attack = name; bs.turn += k + 1; break;
  }
  snapAim(e, a);
  e.state = 'tell'; e.timer = Q_TELLS[bs.attack] * (bs.enraged ? 0.85 : 1);
  e._setEyeAlert(true);
  at.set(e.pos.x, 1, e.pos.z); a.ctx.effects.shockwave(at, COLOR, 3, 0.5);
}
