// CORAL: rose limestone, turquoise polyps and ivory reef fans.
import { ENEMY_TYPES, SHARED_MATS, partsFor, lump, slab, prism, spike, eyes,
  orbit, segBlocked, releasePattern, beginPattern, tickPattern, capturedShot, snapAim,
  bossTouch, contactReach, landHit, markGet, markDrop } from './shared.js';

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
  reefempress: { ...body, name: 'REEF EMPRESS', hp: 3300, speed: 2.6, damage: 24, value: 6500,
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
  // The leg meshes come back because the Empress pedals hers while she is
  // covering ground - the scuttle read is part of her telegraph.
  const out = [];
  for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
    out.push(P('crLeg', slab(0.45, 0.09, 0.09), { x: side * width, y: 0.28, z: (i - (n - 1) / 2) * 0.3, rz: side * 0.45, mat: ivory }));
    P('crToe', spike(0.07, 0.3, 4), { x: side * (width + 0.18), y: 0.13, z: (i - (n - 1) / 2) * 0.3, rx: Math.PI });
  }
  return out;
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
  e.legs = legs(P, 1.0, 4);
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

function coralCleanup(e) { releasePattern(e); markDrop(e); }

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
    snapAim(e, a, true); e.state = 'cut';
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
    snapAim(e, a, true); e.state = 'tell'; e.timer = 0.75; e.volley = 0; e.attackCd = 3.6;
  }
}
function aiClamguard(e, a) {
  e.shell.position.y = (e.state === 'rest' ? 1.05 : 0.75) * e.scale;
  if (e.state === 'tell') { if (tickPattern(e, a)) rest(e, 2); return; }
  if (e.state === 'rest' && (e.timer -= a.dt) > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 4.2) {
    snapAim(e, a, true); e.state = 'tell';
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
    snapAim(e, a, true); e.state = 'bloom'; e.attackCd = 4.8;
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
    snapAim(e, a, true); e.state = 'trail'; e.attackCd = 4.8;
    beginPattern(e, a, [-1, 0, 1].map((i) => point(e.tx - a.nz * i * 2.8,
      e.tz + a.nx * i * 2.8, 1.4, 1 + (i + 1) * 0.4, e.damage)), COLOR);
  }
}
// ---- THE REEF EMPRESS ------------------------------------------------------
//
// Nine attacks drawn from a SHUFFLED DECK rather than walked as a cycle: a
// fixed order is memorised in one fight and then dodged on memory for the
// rest of the run, and this boss is built to be read, not recited. Four she
// has always had - the pincer slam, the advancing reef, the pearl fans, the
// open crown. The five the rework added:
//
//   orbit   she rings the captured spot the way a crab circles prey,
//           tightening the ring as she goes, then cuts straight through the
//           middle. The marked circle at the centre is where the cut ends
//           up; the dodge is out of the ring entirely, or off the cut line.
//   snap    a quick pincer lunge that commits to the spot under the player.
//           The short tell is the point: up close the answer is sideways,
//           immediately. Below half health it chains a second, freshly
//           captured - the answer to the first dodge has to be another one.
//   bloom   a nautilus arm of polyps winds out of the captured spot, one
//           ring opening after the last, so the eruption chases around and
//           out. The dodge is across the arm near its start, or off the
//           disc entirely; the arm's direction of travel is drawn by the
//           fill order.
//   pulse   she roots and fires a needle star on the music's half-beats,
//           each spoke a fifth of a turn from the last. The track is the
//           telegraph, the star repeats its bearings every five pulses, and
//           the heart on her chest beats along with it.
//   tide    a front of reef wash rolls out from the captured spot along the
//           bearing she caught the player on, rank by rank, with honest gaps
//           between the files. Line a gap up and let it wash past, or be
//           somewhere else on the floor.
//
// Everything between attacks is movement - the stalk is a weaving circle,
// not a beeline - and touching her costs whatever she is doing.

const EMPRESS_ATTACKS = ['scissors', 'reef', 'pearls', 'crown', 'orbit', 'snap', 'bloom', 'pulse', 'tide'];

// Pacing. These two pairs are the attack-frequency dial for the whole fight:
// short enough that it reads as a rotation of attacks with pearl windows
// between them, long enough that a window is still worth shooting in.
const EMPRESS_STALK = 0.9;
const EMPRESS_STALK_RAGE = 0.55;
const EMPRESS_REST = 1.35;
const EMPRESS_REST_RAGE = 1.05;
const EMPRESS_ENGAGE = 28;

// Every dash below is measured against the player's 10 m/s sprint: faster
// than the player, and every escape is sideways rather than a footrace.
const ORBIT_TIME = 1.5;        // seconds she rings before the cut
const ORBIT_RATE = 2.1;        // radians a second the ring point sweeps
const ORBIT_RING = 6.5;        // the radius the ring settles to
const ORBIT_R_MIN = 4.5;
const ORBIT_R_MAX = 9;
const ORBIT_CUT_TIME = 0.95;   // long enough to cross the ring at any radius
const ORBIT_MUL = 4.4;
const ORBIT_CAP = 11;          // m/s ceiling a late wave cannot buy past
const ORBIT_MARK_R = 2.6;      // the threatened middle, matched to her touch reach

const SNAP_TELL = 0.5;         // half a second from circle to claw
const SNAP_REACH = 6.5;        // how far ahead the claw commits
const SNAP_R = 2.4;
const SNAP_MUL = 4.6;
const SNAP_CAP = 13;

const BLOOM_TURN = 0.78;       // radians the arm winds per polyp - a nautilus
const BLOOM_STEP = 0.15;       // seconds between one polyp and the next
const BLOOM_DELAY = 0.55;
const BLOOM_R = 1.35;

const PULSE_WARM = 0.55;       // the heart's flare before the first needle
const PULSE_COUNT = 8;
const PULSE_COUNT_RAGE = 10;
const PULSE_STEP = Math.PI * 2 / 5;   // five pulses and the star is back to its first bearing
const PULSE_STEP_RAGE = Math.PI / 3;

const TIDE_DELAY = 0.75;       // the first rank's windup
const TIDE_RANK_TIME = 0.55;   // how long the front takes to roll one rank
const TIDE_RANK_STEP = 4.2;    // metres between ranks
const TIDE_FILE_GAP = 5.4;     // metres between files; the edges leave a 1.6m gap
const TIDE_R = 1.9;

// Cap the unmodified stride, then put the slows back on top: a late wave must
// not buy a faster rip than the one the tell promised, and Cryo has to still
// work on a charging crab. The same contract bone.js spells out for its own
// lunges.
function empressDash(e, a, mul, cap) {
  return Math.min(cap, e.speed * mul) * Math.min(1, a.sp / Math.max(0.001, e.speed));
}

// capturedShot fires at a bearing RELATIVE to the player's live one. The star
// wants ABSOLUTE bearings - its spokes are a pattern about the Empress, not
// an aim at anybody - so the live bearing goes in as the reference and is
// subtracted back out inside.
function empressStar(e, a, angle) {
  const live = Math.atan2(a.ctx.player.pos.z - e.pos.z, a.ctx.player.pos.x - e.pos.x);
  capturedShot(e, a, angle + live, 0, 1.4 * e.scale);
}

function empressDraw(e, a) {
  const bs = e.bs;
  // The suite forces a specific attack through here; a shuffled deck would
  // make every assertion a dice roll.
  if (bs.force) { const forced = bs.force; bs.force = null; bs.attack = forced; return forced; }
  if (!bs.deck || !bs.deck.length) {
    bs.deck = [...EMPRESS_ATTACKS];
    for (let i = bs.deck.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [bs.deck[i], bs.deck[j]] = [bs.deck[j], bs.deck[i]];
    }
  }
  let name = bs.deck.pop();
  // The snap is the close-range punisher; at twenty metres it is a lunge at
  // nobody. Put it back for a later draw rather than spend the beat on air.
  if (name === 'snap' && a.dist > 12 && bs.deck.length) {
    bs.deck.unshift(name);
    name = bs.deck.pop();
  }
  bs.attack = name;
  return name;
}

function empressCast(name, e, a, chain = false) {
  const bs = e.bs, damage = Math.min(22, e.damage * 0.75), points = [];
  bs.attack = name;
  if (name === 'pearls') { e.state = 'salvo'; e.timer = 0.95; e.volley = 0; return; }
  if (name === 'pulse') {
    e.state = 'pulse'; e.timer = PULSE_WARM; bs.pulseN = 0;
    bs.pulseAngle = e.aim; bs.pulseDir = Math.random() < 0.5 ? -1 : 1;
    bs.lastPulse = a.ctx.pulse;
    return;
  }
  if (name === 'orbit') {
    e.state = 'orbit'; e.timer = bs.enraged ? ORBIT_TIME + 0.4 : ORBIT_TIME;
    bs.orbElapsed = 0;
    bs.orbAngle = Math.atan2(e.pos.z - e.tz, e.pos.x - e.tx);
    bs.orbDir = Math.random() < 0.5 ? -1 : 1;
    bs.orbR = Math.min(ORBIT_R_MAX, Math.max(ORBIT_R_MIN, a.dist));
    e.stepMul = ORBIT_MUL;
    return;
  }
  if (name === 'snap') {
    e.state = 'snap'; e.hit = false; if (!chain) bs.snapped = false;
    e.stepMul = SNAP_MUL;
    // The claw commits to the SPOT, not to the player: the circle is where it
    // lands, and the lunge is what reaches whoever left it too late.
    const reach = Math.min(a.dist, SNAP_REACH);
    beginPattern(e, a, [point(e.pos.x + e.nx * reach, e.pos.z + e.nz * reach,
      SNAP_R, SNAP_TELL, Math.min(24, e.damage * 0.85))], COLOR);
    return;
  }
  e.state = 'pattern';
  if (name === 'scissors') {
    for (const side of [-1, 1]) points.push(point(e.tx - e.nz * side * 3,
      e.tz + e.nx * side * 3, 2.4, 1.1, damage));
    points.push(point(e.tx, e.tz, 2.2, 1.95, damage));
  } else if (name === 'reef') {
    // Two rows grow away from the old position, leaving both flanks open.
    for (let row = 0; row < 2; row++) for (const side of [-1, 0, 1]) {
      points.push(point(e.tx + e.nx * row * 3.2 - e.nz * side * 3,
        e.tz + e.nz * row * 3.2 + e.nx * side * 3, 1.6, 1.15 + row * 0.65, damage));
    }
  } else if (name === 'crown') {
    const n = bs.enraged ? 7 : 5;
    // A 120-degree open wedge faces away from the queen. It stays open in
    // enrage: more polyps fill the same arc rather than sealing the exit.
    for (let i = 0; i < n; i++) {
      const angle = e.aim + Math.PI / 3 + i * Math.PI * 4 / 3 / (n - 1);
      points.push(point(e.tx + Math.cos(angle) * 4.5, e.tz + Math.sin(angle) * 4.5, 1.65, 1.2 + i * 0.12, damage));
    }
    points.push(point(e.tx, e.tz, 2, 2.25, damage));
  } else if (name === 'bloom') {
    // The arm winds out of the captured spot, one polyp opening after the
    // last, so the eruption chases around and out rather than landing at
    // once. In enrage a second arm grows from the far side of the same spot.
    const dir = Math.random() < 0.5 ? -1 : 1;
    const arm = (base, n) => {
      for (let i = 0; i < n; i++) {
        const r = 1.1 + i * 0.62, ang = base + dir * i * BLOOM_TURN;
        points.push(point(e.tx + Math.cos(ang) * r, e.tz + Math.sin(ang) * r,
          BLOOM_R, BLOOM_DELAY + i * BLOOM_STEP, damage));
      }
    };
    if (bs.enraged) { arm(e.aim, 6); arm(e.aim + Math.PI, 6); } else arm(e.aim, 9);
  } else {
    // THE TIDE. Rank by rank the front rolls out along the bearing she caught
    // the player on; the files leave honest gaps, so the front is escaped by
    // lining one up rather than by outrunning the whole sea. In enrage the
    // front widens to a fourth file and closes the flank route.
    const files = bs.enraged ? 4 : 3;
    for (let rank = 0; rank < 3; rank++) for (let i = 0; i < files; i++) {
      const across = (i - (files - 1) / 2) * TIDE_FILE_GAP;
      points.push(point(e.tx + e.nx * rank * TIDE_RANK_STEP - e.nz * across,
        e.tz + e.nz * rank * TIDE_RANK_STEP + e.nx * across,
        TIDE_R, TIDE_DELAY + rank * TIDE_RANK_TIME, damage));
    }
  }
  beginPattern(e, a, points, COLOR);
}

function empressRest(e, a) {
  const bs = e.bs;
  releasePattern(e); markDrop(e);
  rest(e, bs.enraged ? EMPRESS_REST_RAGE : EMPRESS_REST);
  e.stepMul = 1.4;
  bs.weakOpen = true;
  bs.ventNote = 'PEARL EXPOSED'; a.ctx.bossEvent('vent', e);
}

function aiReefEmpress(e, a) {
  const bs = e.bs;
  if (!e.state) { e.state = 'stalk'; e.timer = 1.2; }
  bs.enraged = e.hp < e.maxHp * 0.5;
  for (let i = 0; i < e.shutters.length; i++) e.shutters[i].position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.55 : 0.18) * e.scale;
  // The heart is the pulse attack's clock: it beats while the star is firing
  // and reads 1.35x while exposed. It throbs during 'pulse' only - a resting
  // heart must not beat over the window it is the reward for.
  e.core.scale.setScalar(e.scale * (bs.weakOpen ? 1.35
    : e.state === 'pulse' ? 1.15 + 0.25 * Math.sin(a.ctx.time * 13) : 1));
  const hot = e.state !== 'stalk' && e.state !== 'rest';
  for (let i = 0; i < e.claws.length; i++) e.claws[i].position.y =
    (0.85 + (hot ? 0.18 * Math.sin(a.ctx.time * 9 + i * Math.PI) : 0)) * e.scale;
  // Legs pedal only while she is actually covering ground: the scuttle read
  // belongs to the orbit and the cut, not to a rooted cast.
  const scuttling = e.state === 'orbit' || e.state === 'cut';
  for (let i = 0; i < e.legs.length; i++) e.legs[i].rotation.x =
    scuttling ? 0.4 * Math.sin(a.ctx.time * 15 + i * 1.9) : 0;
  // Touching her costs, whatever she is doing - she is a reef, and reefs cut.
  // The cooldown keeps it a price rather than a blender.
  bossTouch(e, a);
  // Terror on a staggering boss holds her ground rather than sending her to
  // the far wall; the pearl state and any half-filled warnings simply wait.
  if (e.status.fear > 0) return;
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
  if (e.state === 'pulse') {
    a.vx = a.vz = 0;
    if (e.timer > 0) { bs.lastPulse = a.ctx.pulse; return; }   // the flare fires nothing
    // The edge test is inequality, not order - the same contract the kiln's
    // bar keeps against a seek moving the grid backwards.
    if (a.ctx.pulse !== bs.lastPulse) {
      bs.lastPulse = a.ctx.pulse;
      const n = bs.enraged ? 3 : 2;
      for (let i = 0; i < n; i++) empressStar(e, a, bs.pulseAngle + i * Math.PI * 2 / n);
      bs.pulseAngle += (bs.enraged ? PULSE_STEP_RAGE : PULSE_STEP) * bs.pulseDir;
      if (++bs.pulseN >= (bs.enraged ? PULSE_COUNT_RAGE : PULSE_COUNT)) empressRest(e, a);
    }
    return;
  }
  if (e.state === 'snap') {
    e.stepMul = SNAP_MUL;
    const speed = empressDash(e, a, SNAP_MUL, SNAP_CAP);
    a.vx = e.nx * speed; a.vz = e.nz * speed;
    if (!e.hit && contactReach(e, a, e.radius + 1)) { landHit(e, a.ctx, Math.min(30, e.damage)); e.hit = true; }
    if (tickPattern(e, a)) {
      if (bs.enraged && !bs.snapped && a.dist < 12) {
        bs.snapped = true;
        snapAim(e, a, true);
        empressCast('snap', e, a, true);
      } else empressRest(e, a);
    }
    return;
  }
  if (e.state === 'orbit' || e.state === 'cut') {
    e.stepMul = ORBIT_MUL;
    bs.orbElapsed += a.dt;
    // The centre circle fills for the whole hunt: the middle is where she
    // ends up, and the mark is what teaches it.
    markGet(e, a.ctx.effects);
    a.ctx.effects.markSet(e.mark, e.tx, e.tz, ORBIT_MARK_R, COLOR,
      Math.min(1, bs.orbElapsed / (ORBIT_TIME + ORBIT_CUT_TIME)));
    const speed = empressDash(e, a, ORBIT_MUL, ORBIT_CAP);
    if (e.state === 'orbit') {
      bs.orbAngle += ORBIT_RATE * (bs.enraged ? 1.25 : 1) * bs.orbDir * a.dt;
      bs.orbR += (ORBIT_RING - bs.orbR) * Math.min(1, a.dt * 1.1);
      const gx = e.tx + Math.cos(bs.orbAngle) * bs.orbR;
      const gz = e.tz + Math.sin(bs.orbAngle) * bs.orbR;
      const dx = gx - e.pos.x, dz = gz - e.pos.z, d = Math.hypot(dx, dz) || 1;
      a.vx = dx / d * speed; a.vz = dz / d * speed;
      if (e.timer <= 0) { bs.cutX = e.tx - e.pos.x; bs.cutZ = e.tz - e.pos.z; e.state = 'cut'; e.timer = ORBIT_CUT_TIME; }
      return;
    }
    const d = Math.hypot(bs.cutX, bs.cutZ) || 1;
    a.vx = bs.cutX / d * speed; a.vz = bs.cutZ / d * speed;
    // Out the other side, out of time, or into the wall: any of the three
    // ends the hunt, and only the first of them was aimed.
    const past = (e.pos.x - e.tx) * bs.cutX + (e.pos.z - e.tz) * bs.cutZ > 0;
    if (e.timer <= 0 || past || e.blockedBy > 0.05) empressRest(e, a);
    return;
  }
  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e);
    e.state = 'stalk'; e.timer = bs.enraged ? EMPRESS_STALK_RAGE : EMPRESS_STALK;
  }
  // THE WEAVE. She closes on the player with a heavy sideways set, the way a
  // crab circles what it intends to pinch, and keeps circling once she is in
  // range: a beeline boss parks in a corner, and this fight is not allowed
  // to have one.
  e.strafeT -= a.dt;
  if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = 1.4 + Math.random(); }
  const along = a.dist > 8 ? 0.62 : 0;
  a.vx = a.px * a.sp * along + -a.nz * e.strafe * a.sp * 0.8;
  a.vz = a.pz * a.sp * along + a.nx * e.strafe * a.sp * 0.8;
  if (e.timer > 0 || a.dist > EMPRESS_ENGAGE) return;
  snapAim(e, a, true); a.vx = a.vz = 0;
  empressCast(empressDraw(e, a), e, a);
}
