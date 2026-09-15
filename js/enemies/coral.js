// CORAL: rose limestone, turquoise polyps and ivory reef fans.
import { ENEMY_TYPES, SHARED_MATS, partsFor, lump, slab, prism, spike, eyes,
  orbit, segBlocked, releasePattern, beginPattern, tickPattern, capturedShot } from './shared.js';

const COLOR = 0x79eee0;
const ORBIT = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.5, flip: 2, flipVar: 1 };
const shot = (speed, damage) => ({ core: 0x79eee0, glow: 0xf07891, scale: 0.55,
  speed: [speed, 0.2, speed + 5], dmg: [damage, 0.2, damage + 5] });
const body = { color: 0xf07891, eye: 0x79eee0, scale: 1, radius: 0.5, mass: 1 };
const TYPES = {
  razorfin: { ...body, hp: 36, speed: 3.5, damage: 10, value: 130, head: { r: 0.28, y: 0.7 },
    build: buildRazorfin, ai: aiRazorfin, cleanup: coralCleanup },
  needlepolyp: { ...body, hp: 26, speed: 2.3, damage: 10, value: 260, head: { r: 0.28, y: 1.25 }, proj: shot(18, 7),
    build: buildNeedlepolyp, ai: aiNeedlepolyp, cleanup: coralCleanup },
  clamguard: { ...body, hp: 150, speed: 1.6, damage: 19, value: 320, scale: 1.4, radius: 0.75, mass: 2,
    head: { r: 0.32, y: 1.0 }, armor: (e) => e.state === 'tell' ? 0.55 : 1,
    armorDefault: (e) => e.state === 'tell' ? 0.55 : 1,
    build: buildClamguard, ai: aiClamguard, cleanup: coralCleanup },
  bloomcoral: { ...body, hp: 44, speed: 1.9, damage: 12, value: 270, head: { r: 0.3, y: 1.1 },
    build: buildBloomcoral, ai: aiBloomcoral, cleanup: coralCleanup },
  pearlnurse: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350, head: { r: 0.3, y: 1.45 },
    build: buildPearlnurse, ai: aiPearlnurse, cleanup: coralCleanup },
  reefray: { ...body, hp: 50, speed: 3.8, damage: 9, value: 300, fly: { height: 3.5 },
    hitbox: { r: 0.55, y: 0.4 }, head: { r: 0.28, y: 0.5 }, proj: shot(16, 6),
    build: buildReefray, ai: aiReefray, cleanup: coralCleanup },
  reefempress: { ...body, name: 'REEF EMPRESS', hp: 3300, speed: 1.8, damage: 24, value: 6500,
    scale: 2.7, radius: 1.8, mass: 9, boss: true, head: { r: 0.4, y: 1.4 },
    hitbox: { r: 0.9, y: 1.0 }, statusMul: 0.3, freezeSlow: true, slowFactor: 0.75,
    freezeVuln: 1, entropyExempt: true, fearMode: 'stagger', proj: shot(13, 7),
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildReefEmpress, ai: aiReefEmpress, cleanup: coralCleanup },
};
Object.assign(ENEMY_TYPES, TYPES);

const ivory = SHARED_MATS.coralIvory, polyp = SHARED_MATS.coralPolyp;
function branches(P, y, radius, n = 5, cx = 0, cz = 0) {
  for (let i = 0; i < n; i++) {
    const a = i * Math.PI * 2 / n, x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
    P('crStem', prism(0.045, 0.09, 0.55, 5), { x, y, z, rz: -x * 0.35, mat: ivory });
    for (const side of [-1, 1]) {
      P('crFork', prism(0.02, 0.045, 0.3, 4), { x: x + side * 0.1, y: y + 0.2, z, rz: side * 0.7, mat: ivory });
      P('crTip', lump(0.07), { x: x + side * 0.2, y: y + 0.32, z, mat: polyp });
    }
  }
}
function legs(P, width, n = 3) {
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    P('crLeg', slab(0.45, 0.09, 0.09), { x: side * width, y: 0.28, z: (i - (n - 1) / 2) * 0.3, rz: side * 0.45, mat: ivory });
    P('crToe', spike(0.07, 0.3, 4), { x: side * (width + 0.18), y: 0.13, z: (i - (n - 1) / 2) * 0.3, rx: Math.PI });
  }
}
function buildRazorfin(e, g, s) {
  const P = partsFor(e, g, s);
  P('crSkate', lump(0.35), { y: 0.42, sz: 1.7, sy: 0.7 });
  e.fins = [-1, 1].map((side) => P('crRazor', spike(0.28, 0.9, 3),
    { x: side * 0.4, y: 0.48, z: -0.2, rz: side * 1.05, rx: -0.4, mat: ivory }));
  P('crKeel', spike(0.18, 0.65, 3), { y: 0.8, z: 0.15, mat: polyp });
  legs(P, 0.35, 2); branches(P, 0.62, 0.15, 2);
  eyes(P, { y: 0.7, z: -0.38, mat: e.eyeMat });
}
function buildNeedlepolyp(e, g, s) {
  const P = partsFor(e, g, s);
  P('crPolypStalk', prism(0.36, 0.22, 0.65, 7), { y: 0.4 });
  e.petals = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    e.petals.push(P('crPetal', spike(0.1, 0.85, 4), { x: Math.cos(a) * 0.38,
      y: 0.9, z: Math.sin(a) * 0.38, rz: -Math.cos(a) * 1.1, rx: Math.sin(a) * 1.1, mat: ivory }));
  }
  e.core = P('crMouth', lump(0.24), { y: 1.25, mat: polyp });
  legs(P, 0.3, 2); eyes(P, { y: 1.25, z: -0.25, mat: e.eyeMat });
}
function buildClamguard(e, g, s) {
  const P = partsFor(e, g, s);
  P('crClamBase', lump(0.6), { y: 0.3, sy: 0.4 });
  e.shell = P('crClamLid', lump(0.65), { y: 0.75, sy: 0.55, mat: ivory });
  e.core = P('crPearl', lump(0.25), { y: 0.7, z: -0.3, mat: polyp });
  for (let i = -3; i <= 3; i++) P('crClamRidge', slab(0.055, 0.12, 0.7),
    { x: i * 0.13, y: 1.0 - Math.abs(i) * 0.035, ry: i * 0.15, mat: polyp });
  legs(P, 0.62); branches(P, 0.9, 0.5, 3);
  eyes(P, { y: 1, z: -0.5, x: 0.2, mat: e.eyeMat });
}
function buildBloomcoral(e, g, s) {
  const P = partsFor(e, g, s);
  P('crBloomRoot', lump(0.4), { y: 0.3, sy: 0.6 });
  e.tubes = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.3, y = i === 1 ? 1 : 0.8;
    P('crBloomTube', prism(0.2, 0.12, 0.8, 6), { x, y, rz: -x * 0.6, mat: ivory });
    e.tubes.push(P('crBloomEgg', lump(0.15), { x, y: y + 0.4, mat: polyp }));
  }
  branches(P, 0.5, 0.4, 4); legs(P, 0.36, 2);
  eyes(P, { y: 1.1, z: -0.22, mat: e.eyeMat });
}
function buildPearlnurse(e, g, s) {
  const P = partsFor(e, g, s);
  P('crNurseStem', prism(0.12, 0.3, 1.1, 6), { y: 0.6 });
  e.core = P('crNursePearl', lump(0.3), { y: 1.45, mat: polyp });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    P('crNurseCup', spike(0.17, 0.7, 4), { x: Math.cos(a) * 0.35,
      y: 1.25, z: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5, mat: ivory });
  }
  branches(P, 0.7, 0.45, 4); legs(P, 0.3, 2);
  eyes(P, { y: 1.45, z: -0.29, mat: e.eyeMat });
}
function buildReefray(e, g, s) {
  const P = partsFor(e, g, s);
  P('crRayBody', lump(0.35), { y: 0.4, sz: 1.5, sy: 0.5 });
  e.fins = [-1, 1].map((side) => P('crRayWing', spike(0.48, 1.1, 3),
    { x: side * 0.6, y: 0.4, rz: side * Math.PI / 2, rx: Math.PI / 2 }));
  P('crRayTail', spike(0.13, 1.2, 5), { y: 0.4, z: 0.9, rx: Math.PI / 2, mat: ivory });
  branches(P, 0.55, 0.3, 4);
  eyes(P, { y: 0.5, z: -0.4, x: 0.2, mat: e.eyeMat });
}
function buildReefEmpress(e, g, s) {
  const P = partsFor(e, g, s);
  P('crQueenBody', lump(0.85), { y: 0.8, sx: 1.15, sy: 0.65 });
  P('crQueenCarapace', lump(0.8), { y: 1.2, z: 0.2, sy: 0.65, mat: ivory });
  legs(P, 1.0, 4);
  e.claws = [];
  for (const side of [-1, 1]) {
    P('crQueenArm', prism(0.18, 0.22, 0.9, 5), { x: side * 0.95, y: 0.7, z: -0.45, rz: side * 0.9 });
    e.claws.push(P('crQueenClaw', lump(0.43), { x: side * 1.35, y: 0.85, z: -0.85, sz: 1.4, mat: ivory }));
    P('crQueenPincer', spike(0.18, 0.8, 4), { x: side * 1.15, y: 0.82, z: -1.18, rx: -Math.PI / 2, mat: polyp });
  }
  e.core = P('crQueenHeart', lump(0.32), { y: 1.4, z: -0.7, mat: e.eyeMat });
  e.shutters = [-1, 1].map((side) => P('crQueenValve', slab(0.32, 0.6, 0.12),
    { x: side * 0.18, y: 1.4, z: -0.87, rz: side * 0.2, mat: ivory }));
  // A fan-shaped reef, rather than a solid crown, leaves the glowing heart
  // legible through the negative space between its branching antlers.
  for (let i = -3; i <= 3; i++) {
    const x = i * 0.22, y = 1.9 - Math.abs(i) * 0.08;
    P('crQueenAntler', prism(0.045, 0.12, 1.2, 5), { x, y, z: 0.2, rz: -i * 0.18, mat: ivory });
    branches(P, y + 0.4, 0.18, 3, x, 0.2);
  }
  branches(P, 1.3, 0.85, 7);
  eyes(P, { y: 1.4, z: -0.9, x: 0.43, r: 1.5, mat: e.eyeMat });
}

function coralCleanup(e) { releasePattern(e); }
function capture(e, a) {
  e.aim = Math.atan2(a.nz, a.nx); e.tx = a.ctx.player.pos.x; e.tz = a.ctx.player.pos.z;
  e._setEyeAlert(true);
}
function rest(e, seconds) { e.state = 'rest'; e.timer = seconds; e._setEyeAlert(false); }
function point(x, z, radius, delay, damage) { return { x, z, radius, delay, damage }; }
function aiRazorfin(e, a) {
  e.timer = (e.timer || 0) - a.dt;
  for (let i = 0; i < e.fins.length; i++) e.fins[i].rotation.z = (i ? 1 : -1) * (e.state === 'cut' ? 1.5 : 1.05);
  if (e.state === 'cut') { if (tickPattern(e, a)) rest(e, 1.25); return; }
  if (e.state === 'rest' && e.timer > 0) return;
  // Two cuts advance along a fixed bearing. Backpedalling through the second
  // circle is worse than stepping across the blades.
  if (a.dist < 4) {
    capture(e, a); e.state = 'cut';
    beginPattern(e, a, [1.6, 3.4].map((d, i) => point(e.pos.x + a.nx * d,
      e.pos.z + a.nz * d, 1.35, 0.6 + i * 0.45, e.damage * 0.7)), COLOR);
    return;
  }
  a.vx = a.px * a.sp - a.pz * a.sp * e.strafe * 0.25;
  a.vz = a.pz * a.sp + a.px * a.sp * e.strafe * 0.25;
}
function aiNeedlepolyp(e, a) {
  for (let i = 0; i < e.petals.length; i++) {
    const angle = i * Math.PI / 4, spread = e.state === 'tell' ? 0.8 : 1.1;
    e.petals[i].rotation.z = -Math.cos(angle) * spread; e.petals[i].rotation.x = Math.sin(angle) * spread;
  }
  if (e.state === 'tell') {
    e.faceLocked = true; e.group.rotation.y = Math.atan2(-Math.cos(e.aim), -Math.sin(e.aim));
    e.timer -= a.dt;
    e.core.scale.setScalar(e.scale * (1 + 0.25 * Math.sin(e.timer * 12)));
    if (e.timer <= 0) {
      // The fan closes inward in three beats; every dart remembers the same
      // bearing, and the final centre shot rewards having left it.
      const spread = [0.3, 0.15, 0][e.volley++];
      capturedShot(e, a, e.aim, -spread, 1.25);
      if (spread) capturedShot(e, a, e.aim, spread, 1.25);
      e.timer = 0.32;
      if (e.volley === 3) { rest(e, 1.8); e.core.scale.setScalar(e.scale); }
    }
    return;
  }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  orbit(e, a, ORBIT);
  if (a.dist < 22 && e.attackCd <= 0) {
    capture(e, a); e.state = 'tell'; e.timer = 0.75; e.volley = 0; e.attackCd = 3.6;
  }
}
function aiClamguard(e, a) {
  e.shell.position.y = (e.state === 'rest' ? 1.05 : 0.75) * e.scale;
  if (e.state === 'tell') { if (tickPattern(e, a)) rest(e, 2); return; }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 4.2) {
    capture(e, a); e.state = 'tell';
    const points = [point(e.pos.x, e.pos.z, 2.7, 0.85, e.damage)];
    // The snap throws a second, OUTER crown. After the first impact the
    // empty centre is safe, making this more than one large circular hit.
    for (let i = 0; i < 5; i++) {
      const angle = e.aim + i * Math.PI * 2 / 5;
      points.push(point(e.pos.x + Math.cos(angle) * 4, e.pos.z + Math.sin(angle) * 4, 1.35, 1.6, e.damage * 0.6));
    }
    beginPattern(e, a, points, COLOR);
  }
}
function aiBloomcoral(e, a) {
  if (e.state === 'bloom') { if (tickPattern(e, a)) rest(e, 2.2); return; }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  orbit(e, a, ORBIT);
  if (a.dist < 24 && e.attackCd <= 0) {
    capture(e, a); e.state = 'bloom'; e.attackCd = 4.8;
    const points = [point(e.tx, e.tz, 1.7, 1.15, e.damage)];
    for (let i = 0; i < 3; i++) {
      const angle = e.aim + i * Math.PI * 2 / 3;
      points.push(point(e.tx + Math.cos(angle) * 3, e.tz + Math.sin(angle) * 3, 1.5, 1.65 + i * 0.3, e.damage));
    }
    beginPattern(e, a, points, COLOR);
  }
}
function aiPearlnurse(e, a) {
  const valid = (o) => o && !o.dead && !o.boss && o !== e && o.type !== e.type &&
    o.hp < o.maxHp && o.pos.distanceToSquared(e.pos) < 64 &&
    !segBlocked(e.pos.x, e.pos.y + 1, e.pos.z, o.pos.x, o.pos.y + 1, o.pos.z, a.ctx.obstacles);
  if (e.patient) {
    if (!valid(e.patient)) { e.patient = null; e.core.scale.setScalar(e.scale); rest(e, 1); e.attackCd = 2; return; }
    e.timer -= a.dt;
    e.core.scale.setScalar(e.scale * (1 + 0.3 * (1 - e.timer)));
    if (e.timer <= 0) {
      const o = e.patient;
      o.hp = Math.min(o.maxHp, o.hp + Math.min(18, o.maxHp * 0.12));
      a.ctx.effects.beam(e.pos, o.pos, COLOR);
      e.patient = null; e.core.scale.setScalar(e.scale); e.attackCd = 5; e._setEyeAlert(false);
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd > 0) return;
  e.patient = a.ctx.enemies.filter(valid).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
  if (e.patient) { e.timer = 1; e._setEyeAlert(true); }
}
function aiReefray(e, a) {
  for (let i = 0; i < e.fins.length; i++) e.fins[i].rotation.z = (i ? 1 : -1) * (1.4 + Math.sin(a.ctx.time * 5) * 0.25);
  if (e.state === 'trail') {
    // A fixed trail below a moving ray; the bird can move, its warnings cannot.
    a.vx = -Math.sin(e.aim) * a.sp; a.vz = Math.cos(e.aim) * a.sp;
    if (tickPattern(e, a)) rest(e, 1.6);
    return;
  }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  orbit(e, a, ORBIT);
  if (a.dist < 18 && e.attackCd <= 0) {
    capture(e, a); e.state = 'trail'; e.attackCd = 4.8;
    beginPattern(e, a, [-1, 0, 1].map((i) => point(e.tx - a.nz * i * 2.8,
      e.tz + a.nx * i * 2.8, 1.4, 1 + (i + 1) * 0.4, e.damage)), COLOR);
  }
}
function empressRest(e, a) {
  releasePattern(e); rest(e, 1.8); e.bs.weakOpen = true;
  e.bs.ventNote = 'PEARL EXPOSED'; a.ctx.bossEvent('vent', e);
}
function aiReefEmpress(e, a) {
  const bs = e.bs;
  if (!e.state) { e.state = 'stalk'; e.timer = 1.2; bs.turn = 0; }
  bs.enraged = e.hp < e.maxHp * 0.5;
  for (let i = 0; i < e.shutters.length; i++) e.shutters[i].position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.55 : 0.18) * e.scale;
  e.core.scale.setScalar(e.scale * (bs.weakOpen ? 1.35 : 1));
  for (let i = 0; i < e.claws.length; i++) e.claws[i].position.y = (0.85 + (e.state === 'pattern' ? 0.18 * Math.sin(e.patternTime * 5 + i) : 0)) * e.scale;
  if (e.state === 'pattern') { if (tickPattern(e, a)) empressRest(e, a); return; }
  e.timer -= a.dt;
  if (e.state === 'salvo') {
    e.faceLocked = true; e.group.rotation.y = Math.atan2(-Math.cos(e.aim), -Math.sin(e.aim));
    if (e.timer > 0) return;
    const n = bs.enraged ? 7 : 5;
    for (let i = 0; i < n; i++) capturedShot(e, a, e.aim, (i - (n - 1) / 2) * 0.23 + (e.volley - 1) * 0.11, 1.4 * e.scale);
    e.volley++; e.timer = 0.55;
    if (e.volley === 3) empressRest(e, a);
    return;
  }
  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e); e.state = 'stalk'; e.timer = bs.enraged ? 0.8 : 1.4;
  }
  a.vx = a.px * a.sp * 0.7; a.vz = a.pz * a.sp * 0.7;
  if (e.timer > 0 || a.dist > 28) return;
  capture(e, a); a.vx = a.vz = 0;
  bs.attack = ['scissors', 'reef', 'pearls', 'crown'][bs.turn++ % 4];
  const damage = Math.min(22, e.damage * 0.75), points = [];
  if (bs.attack === 'pearls') { e.state = 'salvo'; e.timer = 1.1; e.volley = 0; return; }
  e.state = 'pattern';
  if (bs.attack === 'scissors') {
    for (const side of [-1, 1]) points.push(point(e.tx - a.nz * side * 3,
      e.tz + a.nx * side * 3, 2.4, 1.1, damage));
    points.push(point(e.tx, e.tz, 2.2, 1.95, damage));
  } else if (bs.attack === 'reef') {
    // Two rows grow away from the old position, leaving both flanks open.
    for (let row = 0; row < 2; row++) for (const side of [-1, 0, 1]) {
      points.push(point(e.tx + a.nx * row * 3.2 - a.nz * side * 3,
        e.tz + a.nz * row * 3.2 + a.nx * side * 3, 1.6, 1.15 + row * 0.65, damage));
    }
  } else {
    const n = bs.enraged ? 7 : 5;
    // A 120-degree open wedge faces away from the queen. It stays open in
    // enrage: more polyps fill the same arc rather than sealing the exit.
    for (let i = 0; i < n; i++) {
      const angle = e.aim + Math.PI / 3 + i * Math.PI * 4 / 3 / (n - 1);
      points.push(point(e.tx + Math.cos(angle) * 4.5, e.tz + Math.sin(angle) * 4.5, 1.65, 1.2 + i * 0.12, damage));
    }
    points.push(point(e.tx, e.tz, 2, 2.25, damage));
  }
  beginPattern(e, a, points, COLOR);
}
