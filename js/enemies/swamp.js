// SWAMP: wet peat, reed crowns and amber marsh lights.
import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, lump, slab, prism, spike, eyes,
  addWarnedMortar, aiMelee, bossTouch, capturedShot, faceSnap, landHit, orbit,
  releaseMarks, segBlocked, snapAim } from './shared.js';

const ORBIT = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.45, flip: 2, flipVar: 1 };
const shot = (speed, damage) => ({ core: 0xffe6a0, glow: 0xc6a444, scale: 0.55,
  speed: [speed, 0.2, speed + 6], dmg: [damage, 0.25, damage + 6] });
const body = { color: 0x526340, eye: 0xffdc83, scale: 1, radius: 0.5, mass: 1 };
const TYPES = {
  mudskipper: { ...body, hp: 38, speed: 3.2, damage: 8, value: 130,
    head: { r: 0.3, y: 0.8 }, hitStatus: { kind: 'slowness', dur: 0.65 },
    melee: { windup: 0.5, start: 1.4, hit: 1.9, cd: 1.6 },
    build: buildMudskipper, ai: aiMudskipper, cleanup: swampCleanup },
  reedstalker: { ...body, hp: 25, speed: 2.4, damage: 9, value: 260,
    head: { r: 0.28, y: 1.5 }, proj: shot(19, 7),
    build: buildReedstalker, ai: aiReedstalker },
  peatback: { ...body, hp: 145, speed: 1.6, damage: 17, value: 320,
    scale: 1.4, radius: 0.7, mass: 2, head: { r: 0.3, y: 0.85 },
    armor: (e) => e.swampState === 'tell' ? 0.55 : 1,
    armorDefault: (e) => e.swampState === 'tell' ? 0.55 : 1,
    build: buildPeatback, ai: aiPeatback, cleanup: swampCleanup },
  bubbletoad: { ...body, hp: 44, speed: 1.9, damage: 10, value: 270,
    head: { r: 0.3, y: 0.65 }, build: buildBubbletoad, ai: aiBubbletoad },
  fenlantern: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350,
    scale: 1.15, head: { r: 0.3, y: 1.45 }, build: buildFenlantern, ai: aiFenlantern },
  marshwing: { ...body, hp: 50, speed: 3.8, damage: 8, value: 300,
    fly: { height: 3.5 }, hitbox: { r: 0.55, y: 0.4 }, head: { r: 0.28, y: 0.55 },
    proj: shot(15, 6), build: buildMarshwing, ai: aiMarshwing },
  // THE BOSS OF THE DROWNED GROVE. Same bar as it always had and NO shield:
  // the rework's menace is frequency and ground - it wades faster than it
  // used to, the floor it crosses stays bog, and five casts answer wherever
  // the player is standing. There is no `melee` row: the wind-up swing is
  // gone, and contact is the always-on boss touch clock (bossTouch). The
  // throat window after every cast is unchanged: 65% scales shut, flat open.
  miresovereign: { ...body, name: 'MIRE SOVEREIGN', hp: 3200, speed: 2.6,
    damage: 24, value: 6500, scale: 2.7, radius: 1.8, mass: 9, boss: true,
    head: { r: 0.42, y: 1.0 }, hitbox: { r: 0.9, y: 0.8 },
    statusMul: 0.3, freezeSlow: true, slowFactor: 0.75, freezeVuln: 1,
    entropyExempt: true, fearMode: 'stagger', proj: shot(13, 7),
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildMireSovereign, ai: aiMireSovereign, cleanup: mireCleanup },
};
Object.assign(ENEMY_TYPES, TYPES);

const AMBER = 0xffdc83;
const at = new THREE.Vector3();
function reeds(P, y, count = 5, radius = 0.4) {
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    P('swReed', spike(0.035, 0.65, 4), { x, y, z, rz: -x * 0.4, mat: SHARED_MATS.swampPeat });
    P('swSeed', lump(0.07), { x, y: y + 0.25, z, sy: 1.8, mat: SHARED_MATS.swampAmber });
  }
}
function feet(P, width, y = 0.22) {
  for (const x of [-width, width]) for (const z of [-0.3, 0.3]) {
    P('swLeg', slab(0.16, 0.3, 0.2), { x, y, z, rz: -x * 0.4 });
    P('swWeb', slab(0.3, 0.08, 0.35), { x, y: 0.07, z: z - 0.06, mat: SHARED_MATS.swampPeat });
  }
}
function buildMudskipper(e, g, s) {
  const P = partsFor(e, g, s);
  P('swFrog', lump(0.4), { y: 0.5, sz: 1.3 });
  for (const x of [-0.36, 0.36]) P('swHaunch', lump(0.25), { x, y: 0.3, z: 0.3, sz: 1.5 });
  e.swThroat = P('swFrogThroat', lump(0.23), { y: 0.4, z: -0.4, mat: SHARED_MATS.swampAmber });
  feet(P, 0.4); reeds(P, 0.95, 3, 0.23);
  eyes(P, { x: 0.22, y: 0.8, z: -0.3, r: 1.4, mat: e.eyeMat });
}
function buildReedstalker(e, g, s) {
  const P = partsFor(e, g, s);
  P('swStalkBody', prism(0.15, 0.25, 0.8, 5), { y: 0.95 });
  for (const x of [-0.18, 0.18]) P('swStilt', slab(0.07, 0.7, 0.07), { x, y: 0.35 });
  for (const x of [-0.25, 0.25]) P('swBlowpipe', prism(0.065, 0.1, 0.95, 5),
    { x, y: 1.15, z: -0.35, rx: Math.PI / 2, mat: SHARED_MATS.swampPeat });
  P('swMask', lump(0.2), { y: 1.5, sz: 0.6 });
  reeds(P, 1.65, 7, 0.32);
  eyes(P, { y: 1.5, z: -0.17, mat: e.eyeMat });
}
function buildPeatback(e, g, s) {
  const P = partsFor(e, g, s);
  e.swShell = P('swTurtleShell', lump(0.65), { y: 0.65, sy: 0.65, sz: 1.2, mat: SHARED_MATS.swampPeat });
  P('swTurtleBelly', lump(0.5), { y: 0.4, sy: 0.6 });
  e.swJaw = P('swTurtleJaw', slab(0.45, 0.18, 0.45), { y: 0.6, z: -0.65 });
  feet(P, 0.53); reeds(P, 1.0, 8, 0.5);
  eyes(P, { y: 0.85, z: -0.69, x: 0.19, r: 1.1, mat: e.eyeMat });
}
function buildBubbletoad(e, g, s) {
  const P = partsFor(e, g, s);
  P('swToad', lump(0.45), { y: 0.4, sx: 1.3, sy: 0.8 });
  e.swThroat = P('swBubble', lump(0.35), { y: 1.05, z: 0.12, sy: 1.3, mat: SHARED_MATS.swampAmber });
  for (const x of [-0.34, 0.34]) P('swBubbleSmall', lump(0.19), { x, y: 0.7, z: 0.15, mat: SHARED_MATS.swampPeat });
  feet(P, 0.45); reeds(P, 0.85, 3, 0.5);
  eyes(P, { y: 0.65, z: -0.4, x: 0.22, r: 1.2, mat: e.eyeMat });
}
function buildFenlantern(e, g, s) {
  const P = partsFor(e, g, s);
  P('swLanternStem', prism(0.1, 0.32, 1.2, 5), { y: 0.65 });
  e.swThroat = P('swLantern', lump(0.25), { y: 1.4, mat: SHARED_MATS.swampAmber });
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    P('swLanternRib', slab(0.055, 0.8, 0.055), { x: Math.cos(a) * 0.32, y: 1.4,
      z: Math.sin(a) * 0.32, mat: SHARED_MATS.swampPeat });
  }
  P('swLanternLid', prism(0.08, 0.46, 0.25, 6), { y: 1.85 });
  feet(P, 0.3); reeds(P, 2.0, 4, 0.25);
  eyes(P, { y: 1.45, z: -0.3, mat: e.eyeMat });
}
function buildMarshwing(e, g, s) {
  const P = partsFor(e, g, s);
  P('swDragonBody', lump(0.25), { y: 0.4, sz: 1.8 });
  P('swDragonTail', spike(0.16, 1.1, 5), { y: 0.4, z: 0.7, rx: Math.PI / 2, mat: SHARED_MATS.swampPeat });
  e.swWings = [];
  for (const x of [-1, 1]) for (const z of [-0.15, 0.3]) {
    e.swWings.push(P('swDragonWing', slab(0.8, 0.035, 0.2), { x: x * 0.48, y: 0.6, z,
      ry: x * 0.25, mat: SHARED_MATS.swampAmber, shadow: false }));
  }
  reeds(P, 0.65, 3, 0.16);
  eyes(P, { y: 0.55, z: -0.4, x: 0.18, r: 1.3, mat: e.eyeMat });
}
function buildMireSovereign(e, g, s) {
  const P = partsFor(e, g, s);
  P('swKingBody', lump(0.85), { y: 0.7, sx: 1.05, sy: 0.75, sz: 1.35 });
  P('swKingBack', lump(0.8), { y: 1.0, z: 0.35, sy: 0.6, mat: SHARED_MATS.swampPeat });
  P('swKingSnout', slab(0.75, 0.25, 1.0), { y: 1.0, z: -0.8 });
  e.swJaw = P('swKingJaw', slab(0.8, 0.18, 0.95), { y: 0.68, z: -0.85 });
  e.swThroat = P('swKingThroat', lump(0.3), { y: 0.86, z: -0.63, mat: SHARED_MATS.swampAmber });
  for (const x of [-0.32, 0.32]) for (let i = 0; i < 5; i++) {
    P('swKingTooth', spike(0.06, 0.22, 4), { x, y: 0.8, z: -0.5 - i * 0.16, mat: SHARED_MATS.swampAmber });
  }
  P('swKingTail', spike(0.38, 1.8, 5), { y: 0.45, z: 1.35, rx: Math.PI / 2 });
  feet(P, 0.78, 0.32);
  // THE CLAWS, on the front feet. Amber like the teeth, and the crush's tell
  // is them fanning out - `rx0` is the resting angle the pose reset returns
  // them to.
  e.swClaws = [];
  for (const x of [-0.78, 0.78]) for (const z of [-0.5, -0.24]) {
    const c = P('swKingClaw', spike(0.07, 0.34, 4), { x, y: 0.14, z, rx: 2.6, mat: SHARED_MATS.swampAmber });
    c.userData.rx0 = c.rotation.x;
    e.swClaws.push(c);
  }
  // A drowned grove breaks the skyline; the jaws remain clear below it.
  for (const x of [-0.48, 0, 0.48]) {
    const y = x === 0 ? 1.9 : 1.6;
    P('swCypress', prism(0.08, 0.18, 1.4, 5), { x, y, z: 0.35, rz: -x * 0.35, mat: SHARED_MATS.swampPeat });
    for (const side of [-1, 1]) P('swCypressBough', spike(0.09, 0.7, 4),
      { x: x + side * 0.16, y: y + 0.3, z: 0.35, rz: side * 0.9 });
  }
  // THE REED BED, named apart from the scatter of reeds() below: the burst's
  // tell is the whole bed standing on end at once, which needs a handle on
  // every stem. Built plain (no sx/sy/sz) so the pose reset is one setScalar.
  e.swReeds = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const bx = Math.cos(a) * 0.55, bz = 0.3 + Math.sin(a) * 0.42;
    e.swReeds.push(P('swKingReed', spike(0.05, 0.55, 4),
      { x: bx, y: 1.35, z: bz, rz: -bx * 0.5, mat: SHARED_MATS.swampPeat }));
    P('swKingSeed', lump(0.06), { x: bx, y: 1.64, z: bz, mat: SHARED_MATS.swampAmber });
  }
  reeds(P, 1.4, 10, 0.75);
  // THE THROAT PODS. Three marsh lights down the front of the chest - the
  // fenlantern's lamp made into a reservoir. The gulp and the undertow both
  // swell them, which is the read: whatever it is about to spit or swallow
  // passes through these first. The amber is SHARED_MATS, so they stay lit
  // through any status tint the body picks up.
  e.swPods = [];
  for (let i = 0; i < 3; i++) {
    e.swPods.push(P('swKingPod', lump(0.14),
      { x: (i - 1) * 0.26, y: 0.6 - i * 0.08, z: -0.74, mat: SHARED_MATS.swampAmber, shadow: false }));
  }
  eyes(P, { y: 1.0, z: -1.1, x: 0.3, r: 1.7, mat: e.eyeMat });
}

// One owned warning per attacker. Releasing also on death/reset makes an
// interrupted wind-up harmless to the next wave's finite telegraph pool.
function swampCleanup(e) {
  if (e.swMark >= 0) e.swFx.markRelease(e.swMark);
  e.swMark = undefined;
}
function warn(e, a, x, z, radius, progress) {
  if (e.swMark === undefined) { e.swFx = a.ctx.effects; e.swMark = e.swFx.markAcquire(); }
  e.swFx.markSet(e.swMark, x, z, radius, AMBER, progress);
}
function lane(e, a, length, width, progress) {
  warn(e, a, e.pos.x, e.pos.z, width, progress);
  e.swFx.markSet(e.swMark, e.pos.x + e.swNX * length / 2,
    e.pos.z + e.swNZ * length / 2, width, AMBER, progress,
    length / (2 * width), Math.atan2(-e.swNX, -e.swNZ));
}
function canTouch(e, a, reach) {
  return a.dist < reach && Math.abs(a.ctx.player.pos.y - e.pos.y) < (e.boss ? 3.6 : 1.4) &&
    !segBlocked(e.pos.x, e.pos.y + 0.5, e.pos.z,
      a.ctx.player.pos.x, a.ctx.player.pos.y + 0.8, a.ctx.player.pos.z, a.ctx.obstacles);
}
function flash(e, a, radius) {
  at.set(e.pos.x, e.pos.y + 0.3, e.pos.z);
  a.ctx.effects.shockwave(at, AMBER, radius, 0.35);
}
function aimed(e, a, spread = 0, heading = null) {
  const live = Math.atan2(a.ctx.player.pos.z - e.pos.z, a.ctx.player.pos.x - e.pos.x);
  const muzzleY = e.boss ? 0.9 * e.scale : e.type === 'reedstalker' ? 1.15 : 0.55;
  a.ctx.addProjectile(e.pos.x, e.pos.y + muzzleY, e.pos.z, e.type, e._projScale(),
    spread + (heading === null ? 0 : heading - live));
}
function faceHeading(e, x, z) {
  e.faceLocked = true;
  e.group.rotation.y = Math.atan2(-x, -z);
}
function aiMudskipper(e, a) {
  e.swT = (e.swT || 0) - a.dt;
  if (e.swampState === 'tell') {
    faceHeading(e, e.swNX, e.swNZ);
    lane(e, a, 7, 1.7, 1 - e.swT / 0.6);
    e.swThroat.scale.setScalar(e.scale * (1 + 0.3 * Math.sin((1 - e.swT / 0.6) * Math.PI)));
    if (e.swT <= 0) { e.swampState = e.swMark >= 0 ? 'hop' : 'rest'; swampCleanup(e); e.swT = 0.65; e.swHit = false; }
    return;
  }
  if (e.swampState === 'hop') {
    faceHeading(e, e.swNX, e.swNZ);
    e.stepMul = 3; const speed = Math.min(e.speed * 3, 8) * Math.min(1, a.sp / Math.max(0.001, e.speed)) * Math.min(1, Math.max(0, e.swT + a.dt) / a.dt);
    a.vx = e.swNX * speed; a.vz = e.swNZ * speed;
    if (!e.swHit && canTouch(e, a, 1.7)) {
      landHit(e, a.ctx); e.swHit = true;
    }
    if (e.swT <= 0 || e.blockedBy > 0.05) {
      e.swampState = 'rest'; e.swT = 1.5; e.stepMul = 1.4; e._setEyeAlert(false);
    }
    return;
  }
  if (e.swampState === 'rest' && e.swT > 0) return;
  aiMelee(e, a);
  if (e.swT <= 0 && a.dist > 3 && a.dist < 10) {
    e.swampState = 'tell'; e.swT = 0.6; e.swNX = a.nx; e.swNZ = a.nz;
    e._setEyeAlert(true);
  }
}
function aiReedstalker(e, a) {
  if (e.swT > 0) {
    faceHeading(e, Math.cos(e.swAim), Math.sin(e.swAim));
    e.swT -= a.dt;
    if (e.swT <= 0) {
      // The first pair brackets the captured bearing; the last dart punishes
      // standing in that gap. All three keep the original aim.
      if (e.swampState === 'tell') {
        aimed(e, a, -0.16, e.swAim); aimed(e, a, 0.16, e.swAim);
        e.swampState = 'dart'; e.swT = 0.35;
      } else { aimed(e, a, 0, e.swAim); e._setEyeAlert(false); }
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 22) {
    e.attackCd = 3.2; e.swT = 0.6; e.swampState = 'tell';
    e.swAim = Math.atan2(a.nz, a.nx); e._setEyeAlert(true);
  }
}
function aiPeatback(e, a) {
  e.swT = (e.swT || 0) - a.dt;
  e.swJaw.position.z = (e.swampState === 'tell' ? -0.45 : -0.65) * e.scale;
  if (e.swampState === 'tell') {
    warn(e, a, e.pos.x, e.pos.z, 3.6, 1 - e.swT / 0.9);
    if (e.swT <= 0) {
      const warned = e.swMark >= 0; swampCleanup(e); flash(e, a, 3.6);
      if (warned && canTouch(e, a, 3.6)) landHit(e, a.ctx);
      e.swampState = 'rest'; e.swT = 1.8; e._setEyeAlert(false);
    }
    return;
  }
  if (e.swT > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 4.5) { e.swampState = 'tell'; e.swT = 0.9; e._setEyeAlert(true); }
}
function aiBubbletoad(e, a) {
  orbit(e, a, ORBIT);
  if (e.swT > 0) {
    a.vx = a.vz = 0; e.swT -= a.dt;
    e.swThroat.scale.setScalar(e.scale * (1 + 0.4 * (1 - e.swT / 0.7)));
    if (e.swT <= 0) {
      for (let i = -1; i <= 1; i++) a.ctx.addMortar(e.swX - e.swNZ * i * 2.8,
        e.swZ + e.swNX * i * 2.8, 1.8, 1.1 + (i + 1) * 0.22, e.damage);
      e.swThroat.scale.setScalar(e.scale); e._setEyeAlert(false);
    }
    return;
  }
  if (e.attackCd <= 0 && a.dist < 24) {
    e.attackCd = 4.5; e.swT = 0.7; e.swX = a.ctx.player.pos.x; e.swZ = a.ctx.player.pos.z;
    e.swNX = a.nx; e.swNZ = a.nz; e._setEyeAlert(true);
  }
}
function aiFenlantern(e, a) {
  orbit(e, a, ORBIT);
  if (e.attackCd > 0) return;
  // Cleansing spends a cooldown only when there is something to wash off.
  // No healing or permanent immunity: freshly applied statuses still work.
  const target = a.ctx.enemies.find((o) => o !== e && !o.dead && !o.boss && o.type !== e.type &&
    o.pos.distanceToSquared(e.pos) < 64 && ['burn', 'poison', 'slow'].some((s) => o.status[s] > 0));
  if (!target) return;
  for (const s of ['burn', 'poison', 'slow']) {
    target.status[s] = 0;
    if (s in target._dot) target._dot[s] = 0;
  }
  target.poisonStacks = 1;
  e.attackCd = 4.5;
  a.ctx.effects.beam(e.pos, target.pos, AMBER); flash(e, a, 2);
}
function aiMarshwing(e, a) {
  for (let i = 0; i < e.swWings.length; i++) e.swWings[i].rotation.z =
    (i < 2 ? -1 : 1) * (0.15 + Math.sin(a.ctx.time * 24) * 0.2);
  if (e.swT > 0) {
    e.swT -= a.dt; e.hoverY = 1.4; e.flyRate = 4;
    if (e.swT <= 0) {
      aimed(e, a, -0.1); aimed(e, a, 0.1);
      e.hoverY = 3.5; e._setEyeAlert(false); e.swEscape = 1.2;
    }
    return;
  }
  if (e.swEscape > 0) {
    e.swEscape -= a.dt; a.vx = -a.nx * a.sp; a.vz = -a.nz * a.sp; return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 18) { e.attackCd = 3.8; e.swT = 1; e._setEyeAlert(true); }
}
// ---- the boss kit ---------------------------------------------------------
// THE MIRE SOVEREIGN, reworked as what it always claimed to be: the apex
// ambush predator of a drowned grove. The old fight stalked a corner and
// cycled three greetings with a pause after each; this one MOVES - it wades,
// it dives - and the arena it crosses stays bog behind it.
//
// THE FIVE CASTS, and what each one asks of the player:
//
//   MUD CRUSH    it rears onto its hindquarters - claws splayed, a ring of
//                amber on the floor - and slams a shock ring you HOP over,
//                then spits a fan of bog light down the bearing you fled on.
//                Sideways over the rim, then across the fan, never straight
//                back.
//   REED BURST   a ring of amber buds rises around WHERE YOU WERE and fires
//                as staggered nails raining down along it, closing from the
//                far side of the one gap. Slip through the gap before the
//                ring closes behind it. Enraged, there is no gap.
//   BOG DIVE     it sinks - the water closes over its back - and the mire
//                itself starts sliding toward you: a wake of amber, committed
//                to a heading per LEG and re-read between them. Then it
//                erupts. Cross the wake's line; don't run along it, and don't
//                stand where the fill is closing.
//   UNDERTOW     it plants and BREATHES IN: two rings of dragged water pull
//                you toward the jaw - the pull ramps, a hop slips it - and
//                then it snaps at whatever the inner ring still holds. Sprint
//                OUT, early.
//   GULP OF LIGHT
//                the throat pods fill and it swallows the marsh lights back
//                out as a fan of darts on the captured bearing - then gulps
//                AGAIN, aimed at where you actually went. The filler between
//                the big casts: there is never nothing coming.
//
// And TOUCHING it hurts at all times, on the shared boss touch clock - the
// wind-up swing is gone; the body is the melee attack now. No shield and no
// bigger bar anywhere in here: every cast still ends throat-up in the vent,
// and the pressure is frequency, ground and movement, not soak.

// UNDERTOW. The pull is capped under a sprint but over a mire-slowed walk:
// standing in the shallows it laid while it pulls you is the trap they make
// together. Its vent is SHORTER than the other casts' - the tow is the price.
const TIDE_CD = 10, TIDE_TIME = 1.4;
const TIDE_R = 11, TIDE_BITE = 3.8, TIDE_PULL = 5.2, TIDE_CAP = 26, TIDE_VENT = 0.85;

// BOG DIVE. Three legs per dive; each is committed, and the wake re-reads the
// player between them, so the slide bends but never tracks within a leg.
const DIVE_CD = 12, DIVE_MIN = 11;
const DIVE_SINK = 0.5, DIVE_TIME = 2.4, DIVE_LEGS = 3;
const DIVE_MUL = 2.7, DIVE_MAX = 9;
const DIVE_ARRIVE = 3.4, DIVE_R = 3.8, DIVE_CAP = 30;
// The pool the eruption leaves where it came up: wide enough that rising
// through it costs a beat of footing, short-lived enough that the crater is
// ground you cannot stand in NOW rather than floor the fight has lost.
const DIVE_POOL_R = 4.2, DIVE_POOL_LIFE = 5;

// REED BURST. Nine slots around where the player WAS, each a mortar nail on
// its own fuse, plus one in the middle: a ring alone would let a still target
// stand in the centre of it for free, and the whole cast is about WHERE YOU
// WERE. The calm ring leaves one slot unfired - the gap - and the fuses
// stagger from the far side so the opening is the last ground to go. Enraged
// CLOSES the gap rather than adding nails: MAX_MORTARS is ten, and a ring
// wider than the pool quietly pokes holes in its own warning.
const REEDS_SLOTS = 9;
const REEDS_CD = 8, REEDS_TELL = 0.9, REEDS_R = 7;
const REEDS_DELAY = 0.55, REEDS_STAG = 0.14, REEDS_NAIL_R = 1.5;

// MUD CRUSH. The ring is jumpable like every ground shock in this house; the
// fan is the bite on the retreat corridor and is capped by the proj table.
const CRUSH_CD = 6.5, CRUSH_TELL = 0.75;
const CRUSH_RING_R = 4.0, CRUSH_RING_CAP = 26, CRUSH_RANGE = 14;
const CRUSH_FAN_N = 7, CRUSH_FAN_RAGE = 9, CRUSH_FAN_ARC = 0.3;

// GULP OF LIGHT - the swallow. Two fans, the second one re-aimed live.
const GULP_CD = 4.2, GULP_TELL = 0.6;
const GULP_N = 3, GULP_N_RAGE = 4, GULP_ARC = 0.26, GULP_GAP = 0.38;

// The vent - the throat hangs open after every cast (shorter after the tow):
// the window the fight has always paid with, kept exactly as it was priced.
const VENT_BASE = 1.5, VENT_RAGE = 1.05;

// Prowl holds this ring around the player between casts.
const PROWL_WANT = 6.5;

// THE MIRE IT LEAVES. Wherever the body crosses, the floor stays bog for a
// moment - the theme's own ground, slowing and never bleeding, so everything
// else the boss does gets harder to answer from inside it.
const MIRE_R = 2.9, MIRE_LIFE = 2.6, MIRE_EVERY = 0.3;

// The pose is rewritten from scratch every frame - a state only has to say
// what it wants THIS frame, and leaving one puts the body back on its own.
function mirePose(e) {
  const s = e.scale, bs = e.bs;
  e.group.scale.set(1, 1, 1);
  e.group.rotation.x = 0;
  e.swThroat.scale.setScalar(s * (bs.weakOpen ? 1.5 : 1));
  for (const p of e.swPods) p.scale.setScalar(s);
  for (const r of e.swReeds) r.scale.setScalar(s);
  for (const c of e.swClaws) { c.scale.setScalar(s); c.rotation.x = c.userData.rx0; }
}

// Death and reset call this (it is the type's `cleanup`): every telegraph the
// boss can be holding lives in bs.mark / bs.rings under bs.fx, which is
// exactly the shape releaseMarks() releases.
function mireCleanup(e) {
  releaseMarks(e);
}

// A cooldown, scaled: the wave's rate tightens everything, and a cornered
// sovereign - under half its bar - presses harder. Nothing here ever goes
// quiet because the GULP has the shortest clock and fires from any range.
function mireCd(e, base) {
  return base * e.rate * (e.bs.enraged ? 0.72 : 1);
}

// Every cast ends here: marks back to the pool, pose back to neutral, jaw
// dropped and throat up - the flat-armour window the fight is built around.
function sovereignVent(e, a, secs) {
  const bs = e.bs;
  releaseMarks(e);
  bs.mark = -1;
  mirePose(e);
  bs.weakOpen = true; bs.ventNote = 'THROAT EXPOSED';
  bs.state = 'recover'; bs.t = bs.tMax = secs * e.rate;
  bs.lastCast = bs.castNow;
  e._setEyeAlert(false);
  a.ctx.bossEvent('vent', e);
}

// THE TRAIL. Only when the body is actually crossing the floor: a lake keeps
// its own surface, so the plant-states and the dive lay nothing.
function mireTrailTick(e, a) {
  const bs = e.bs;
  bs.trailT -= a.dt;
  if (bs.trailT > 0 || Math.hypot(a.vx, a.vz) < 0.5 || e.pos.y > 0.25) return;
  bs.trailT = MIRE_EVERY;
  a.ctx.addHazard(e.pos.x, e.pos.z, MIRE_R, MIRE_LIFE, 0, 'mire');
}
function castCrush(e, a) {
  const bs = e.bs;
  snapAim(e, a, true);
  bs.castNow = 'crush';
  bs.state = 'crushTell'; bs.t = bs.tMax = CRUSH_TELL;
  bs.fx = a.ctx.effects;
  if (!(bs.mark >= 0)) bs.mark = a.ctx.effects.markAcquire();
  // The cd is spent on the ATTEMPT, not the landing: a cast the pool could
  // not warn aborts below, and a starved boss that retried it every think
  // would turn one missing warning into a machine gun of blind ones.
  bs.cdCrush = mireCd(e, CRUSH_CD);
}
function castReeds(e, a) {
  const bs = e.bs;
  snapAim(e, a, true);
  bs.castNow = 'reeds';
  bs.state = 'reedsTell'; bs.t = bs.tMax = REEDS_TELL;
  bs.fx = a.ctx.effects;
  bs.rings = [];
  const gap = bs.enraged ? -1 : (Math.random() * REEDS_SLOTS) | 0;
  for (let i = 0; i < REEDS_SLOTS; i++) {
    if (i === gap) continue;
    const h = a.ctx.effects.markAcquire();
    if (h < 0) continue;
    const ang = (i / REEDS_SLOTS) * Math.PI * 2;
    bs.rings.push({
      mark: h,
      x: e.tx + Math.cos(ang) * REEDS_R,
      z: e.tz + Math.sin(ang) * REEDS_R,
      // The ring CLOSES from the far side: each nail's fuse is its distance
      // around from the opening, so the opening is the last ground to go.
      delay: REEDS_DELAY + ((i - gap + REEDS_SLOTS) % REEDS_SLOTS) * REEDS_STAG,
    });
  }
  // And the middle: the one place a ring never reaches.
  const hc = a.ctx.effects.markAcquire();
  if (hc >= 0) bs.rings.push({ mark: hc, x: e.tx, z: e.tz, delay: REEDS_DELAY });
  if (!bs.rings.length) sovereignVent(e, a, 0.5);
  // Spent on the attempt, like every cast: see castCrush.
  bs.cdReeds = mireCd(e, REEDS_CD);
}
// One committed leg of the dive. Re-reads the player BETWEEN legs, never
// within one: the wake bends, it does not steer.
function mireLeg(e, a) {
  const bs = e.bs, p = a.ctx.player.pos;
  const d = Math.max(0.001, a.dist);
  bs.dx = (p.x - e.pos.x) / d;
  bs.dz = (p.z - e.pos.z) / d;
  bs.legT = DIVE_TIME / DIVE_LEGS;
}
// The eruption. Everything the wake was promising, paid at once - and where
// it came up stays lake.
function sovereignErupt(e, a) {
  const bs = e.bs, ctx = a.ctx;
  const warned = bs.mark >= 0;
  releaseMarks(e);
  bs.mark = -1;
  at.set(e.pos.x, 0.5, e.pos.z);
  ctx.effects.shockwave(at, AMBER, DIVE_R, 0.5);
  ctx.effects.burst(at, 0x8b9b45, 22, 5.5, 3, 0.6);
  ctx.effects.burst(at, e.eyeBase, 12, 3, 2, 0.5);
  ctx.effects.addShake(0.22);
  if (ctx.sfx) ctx.sfx.impact();
  ctx.addHazard(e.pos.x, e.pos.z, DIVE_POOL_R, DIVE_POOL_LIFE, 0, 'mire');
  if (warned && canTouch(e, a, DIVE_R)) {
    const p = ctx.player.pos;
    const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
    ctx.onHitPlayer(Math.min(DIVE_CAP, e.damage * 1.25 * (1 - 0.4 * d / DIVE_R)), e.pos, e);
  }
  sovereignVent(e, a, bs.enraged ? 1.3 : 1.95);
}
function castDive(e, a) {
  const bs = e.bs;
  snapAim(e, a, true);
  bs.castNow = 'dive';
  bs.state = 'sink'; bs.t = bs.tMax = DIVE_SINK;
  bs.fx = a.ctx.effects;
  if (!(bs.mark >= 0)) bs.mark = a.ctx.effects.markAcquire();
  bs.cdDive = mireCd(e, DIVE_CD);
  if (a.ctx.sfx) a.ctx.sfx.tone({ f: 240, f2: 90, t: DIVE_SINK, type: 'sine', v: 0.35 });
}
function castTide(e, a) {
  const bs = e.bs;
  bs.fx = a.ctx.effects;
  bs.rings = [];
  // BOTH rings up front: the tow must never pull without its bite warned, so
  // a pool that could not promise both cancels the cast rather than tow blind.
  for (const r of [TIDE_BITE, TIDE_R]) {
    const h = a.ctx.effects.markAcquire();
    if (h >= 0) bs.rings.push({ mark: h, r });
  }
  if (bs.rings.length < 2) { sovereignVent(e, a, 0.5); bs.cdTide = mireCd(e, TIDE_CD); return; }
  snapAim(e, a, true);
  bs.castNow = 'tide';
  bs.state = 'tide'; bs.t = bs.tMax = TIDE_TIME;
  bs.cdTide = mireCd(e, TIDE_CD);
  if (a.ctx.sfx) a.ctx.sfx.tone({ f: 160, f2: 60, t: TIDE_TIME, type: 'sine', v: 0.4 });
}
function castGulp(e, a) {
  const bs = e.bs;
  snapAim(e, a, true);
  bs.castNow = 'gulp';
  bs.state = 'gulpTell'; bs.t = bs.tMax = GULP_TELL;
  bs.cdGulp = mireCd(e, GULP_CD);
}
function aiMireSovereign(e, a) {
  const bs = e.bs, ctx = a.ctx;
  if (bs.state === undefined) {
    bs.state = 'prowl'; bs.t = bs.tMax = 1.0;
    bs.mark = -1; bs.rings = []; bs.fx = null;
    bs.weakOpen = false; bs.ventNote = 'THROAT EXPOSED';
    bs.enraged = false;
    // The dive opens the fight: it is the only cast gated on having ground to
    // cross (dist > 11), so it has to be ready before the first prowl closes
    // the gap or it can never fire at all.
    bs.cdCrush = 1.2; bs.cdGulp = 0.8; bs.cdReeds = 3.4; bs.cdTide = 5; bs.cdDive = 1.0;
    bs.trailT = 0; bs.wakeT = 0;
    bs.castNow = ''; bs.lastCast = '';
  }
  const enraged = e.hp <= e.maxHp * 0.5;
  if (enraged && !bs.enraged) ctx.bossEvent('enrage', e);
  bs.enraged = enraged;
  // Feared: fearMode 'stagger' means update() still calls us, so the fight
  // cancels whatever it was telling and holds - and keeps its cooldowns,
  // because a fear punish is not a refund of the next cast.
  if (e.status.fear > 0) {
    if (bs.state !== 'recover') sovereignVent(e, a, 0.4);
    a.vx = 0; a.vz = 0;
    bossTouch(e, a);
    bs.t -= a.dt;
    if (bs.t > 0) return;
    bs.weakOpen = false; ctx.bossEvent('vent', e);
    bs.state = 'prowl'; bs.t = 0.3 * e.rate;
    return;
  }
  e.stepMul = 1.4;
  mirePose(e);
  // The jaw is the vent's own readout, so it lives outside the pose reset.
  e.swJaw.position.y = (bs.weakOpen ? 0.46 : 0.68) * e.scale;
  bs.t -= a.dt;
  bs.cdCrush -= a.dt; bs.cdGulp -= a.dt; bs.cdReeds -= a.dt;
  bs.cdTide -= a.dt; bs.cdDive -= a.dt;
  // TOUCHING IT HURTS, in every state, on its own clock. This is the whole
  // melee layer now: the body is the bite, and running through the boss is
  // never the shortcut - including through a submerged wake.
  bossTouch(e, a);
  if (bs.state === 'crushTell') {
    a.vx = 0; a.vz = 0;
    faceSnap(e);
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    e.group.scale.set(1 + 0.06 * fill, 1 + 0.3 * fill, 1 + 0.06 * fill);
    e.group.rotation.x = -0.3 * fill;
    for (const c of e.swClaws) {
      c.rotation.x = c.userData.rx0 - 0.45 * fill;
      c.scale.setScalar(e.scale * (1 + 0.4 * fill));
    }
    bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, CRUSH_RING_R, AMBER, fill);
    if (bs.t > 0) return;
    // No warning drawn, no slam sold: the guard is BEFORE the release.
    if (!(bs.mark >= 0)) { sovereignVent(e, a, 0.5); return; }
    releaseMarks(e);
    bs.mark = -1;
    // THE SLAM - a jumpable ring of bog shock; the splayed feet were the tell.
    flash(e, a, CRUSH_RING_R);
    ctx.effects.addShake(0.26);
    const p = ctx.player.pos;
    const d = Math.hypot(p.x - e.pos.x, p.z - e.pos.z);
    if (d < CRUSH_RING_R && Math.abs(p.y) < 1.5 &&
        !segBlocked(e.pos.x, e.pos.y + 1, e.pos.z, p.x, p.y + 0.8, p.z, ctx.obstacles)) {
      ctx.onHitPlayer(
        Math.min(CRUSH_RING_CAP, e.damage * 1.1 * (1 - 0.4 * d / CRUSH_RING_R)), e.pos, e);
    }
    // THE PORTAL - a fan of bog light down the bearing splayed at the tell.
    const n = bs.enraged ? CRUSH_FAN_RAGE : CRUSH_FAN_N;
    for (let i = 0; i < n; i++) {
      capturedShot(e, a, e.aim, (i - (n - 1) / 2) * CRUSH_FAN_ARC, 0.9 * e.scale);
    }
    if (ctx.sfx) ctx.sfx.impact();
    sovereignVent(e, a, bs.enraged ? VENT_RAGE : VENT_BASE);
    return;
  }
  if (bs.state === 'reedsTell') {
    a.vx = 0; a.vz = 0;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    for (const ring of bs.rings) {
      bs.fx.markSet(ring.mark, ring.x, ring.z, REEDS_NAIL_R, AMBER, fill);
    }
    // The bed stands on end: the family's own reeds, as the tell.
    for (const s of e.swReeds) s.scale.setScalar(e.scale * (1 + fill * 0.9));
    if (bs.t > 0) return;
    for (const ring of bs.rings) {
      bs.fx.markRelease(ring.mark);
      // The mortar owns its own red warning from here: the amber buds above,
      // the filling circles below - a two-stage tell of the same ground.
      addWarnedMortar(ctx, ring.x, ring.z, REEDS_NAIL_R, ring.delay,
        Math.min(20, e.damage * 0.6));
    }
    bs.rings.length = 0;
    if (ctx.sfx) ctx.sfx.impact();
    sovereignVent(e, a, bs.enraged ? VENT_RAGE : VENT_BASE);
    return;
  }
  if (bs.state === 'sink') {
    a.vx = 0; a.vz = 0;
    faceSnap(e);
    const f = 1 - Math.max(0, bs.t) / bs.tMax;
    e.group.scale.set(1 + f * 0.18, 1 - f * 0.75, 1 + f * 0.18);
    bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, DIVE_R, AMBER, f * 0.3, 1, 0, 0.5);
    if (bs.t > 0) return;
    // No wake to show, no dive: the mark is the only promise an ambush has.
    if (!(bs.mark >= 0)) { sovereignVent(e, a, 0.5); return; }
    bs.state = 'dive'; bs.t = bs.tMax = DIVE_TIME;
    mireLeg(e, a);
    flash(e, a, DIVE_R);
    if (ctx.sfx) ctx.sfx.impact();
    return;
  }
  if (bs.state === 'dive') {
    // UNDER THE MIRE: the floor's furniture does not stop it, and its body
    // reads as the wake - squat, wide and shooting-lit. Touch still bites;
    // the wake is the body now.
    e.phase = true;
    e.stepMul = DIVE_MUL;
    const v = Math.min(a.sp * DIVE_MUL, DIVE_MAX);
    a.vx = bs.dx * v; a.vz = bs.dz * v;
    e.faceLocked = true;
    e.group.rotation.y = Math.atan2(-bs.dx, -bs.dz);
    e.group.scale.set(1.18, 0.25, 1.18);
    bs.fx.markSet(bs.mark, e.pos.x, e.pos.z, DIVE_R, AMBER,
      Math.min(1, 0.4 + 0.6 * Math.max(0, 1 - (a.dist - DIVE_ARRIVE) / 8)), 1, 0, 0.6);
    bs.wakeT -= a.dt;
    if (bs.wakeT <= 0) {
      bs.wakeT = 0.12;
      at.set(e.pos.x, 0.2, e.pos.z);
      ctx.effects.burst(at, 0x8b9b45, 3, 1.6, 1.2, 0.4);
    }
    bs.legT -= a.dt;
    if (bs.legT <= 0 && a.dist > DIVE_ARRIVE) mireLeg(e, a);
    if (a.dist < DIVE_ARRIVE || bs.t <= 0) { sovereignErupt(e, a); return; }
    return;
  }
  if (bs.state === 'tide') {
    a.vx = 0; a.vz = 0;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    e.swThroat.scale.setScalar(e.scale * (1 + fill * 0.8));
    for (const pod of e.swPods) pod.scale.setScalar(e.scale * (1 + fill * 1.1));
    for (const ring of bs.rings) {
      bs.fx.markSet(ring.mark, e.pos.x, e.pos.z, ring.r, AMBER, fill, 1, 0, 0.35);
    }
    // The pull ramps in, and a player OFF the floor slips it: hopping from
    // hummock to hummock is the swamp's own answer to its water.
    const p = ctx.player.pos;
    const ramp = Math.min(1, fill * 1.6);
    if (a.dist < TIDE_R && ramp > 0 && p.y < 1.2) {
      ctx.pullPlayer(e.pos.x - p.x, e.pos.z - p.z, TIDE_PULL * ramp);
    }
    if (bs.t > 0) return;
    // THE BITE: everything the inner ring still holds. The hold was the
    // warning - the tow was the cost of ignoring it.
    flash(e, a, TIDE_BITE);
    if (ctx.sfx) ctx.sfx.impact();
    if (canTouch(e, a, TIDE_BITE)) {
      ctx.onHitPlayer(Math.min(TIDE_CAP, e.damage * 1.1), e.pos, e);
    }
    sovereignVent(e, a, bs.enraged ? 0.6 : TIDE_VENT);
    return;
  }
  if (bs.state === 'gulpTell') {
    a.vx = 0; a.vz = 0;
    const fill = 1 - Math.max(0, bs.t) / bs.tMax;
    for (const pod of e.swPods) pod.scale.setScalar(e.scale * (1 + fill * 0.9));
    e.swThroat.scale.setScalar(e.scale * (1 + fill * 0.6));
    e.group.rotation.x = -0.16 * fill;
    if (bs.t > 0) return;
    bs.state = 'gulp'; bs.t = bs.tMax = GULP_GAP;
    bs.gulpN = bs.enraged ? GULP_N_RAGE : GULP_N;
    for (let i = 0; i < bs.gulpN; i++) {
      capturedShot(e, a, e.aim, (i - (bs.gulpN - 1) / 2) * GULP_ARC, 0.9 * e.scale);
    }
    if (ctx.sfx) ctx.sfx.tone({ f: 680, f2: 240, t: 0.14, type: 'sine', v: 0.3 });
    return;
  }
  if (bs.state === 'gulp') {
    a.vx = 0; a.vz = 0;
    e.swThroat.scale.setScalar(e.scale * 1.3);
    if (bs.t > 0) return;
    // The second swallow is aimed LIVE: the first fan answered where you
    // were, this one answers where you actually went.
    const p = ctx.player.pos;
    const live = Math.atan2(p.z - e.pos.z, p.x - e.pos.x);
    for (let i = 0; i < bs.gulpN; i++) {
      capturedShot(e, a, live, (i - (bs.gulpN - 1) / 2) * GULP_ARC, 0.9 * e.scale);
    }
    if (ctx.sfx) ctx.sfx.tone({ f: 520, f2: 200, t: 0.14, type: 'sine', v: 0.3 });
    sovereignVent(e, a, bs.enraged ? VENT_RAGE : VENT_BASE);
    return;
  }
  if (bs.state === 'recover') {
    // THE VENT: jaw dropped, throat up, a drift at a third speed. This is the
    // shot the whole fight is priced around, and it is never long enough to
    // be safe in - the trail is still being laid.
    a.vx = a.px * a.sp * 0.3;
    a.vz = a.pz * a.sp * 0.3;
    mireTrailTick(e, a);
    if (bs.t <= 0) {
      bs.weakOpen = false;
      ctx.bossEvent('vent', e);
      bs.state = 'prowl';
      bs.t = (0.3 + Math.random() * 0.25) * e.rate;
    }
    return;
  }
  // PROWL - the wade. It holds its striking distance over the bog it is
  // laying, weaving on its own flip so it never reads as a train on rails.
  e.strafeT -= a.dt;
  if (e.strafeT <= 0) { e.strafe *= -1; e.strafeT = 1 + Math.random() * 1.6; }
  const along = a.dist > PROWL_WANT + 0.8 ? 1 : a.dist < PROWL_WANT - 0.8 ? -0.5 : 0.15;
  a.vx = a.px * a.sp * along + -a.pz * e.strafe * a.sp * 0.5;
  a.vz = a.pz * a.sp * along + a.px * e.strafe * a.sp * 0.5;
  mireTrailTick(e, a);
  if (bs.t > 0) return;
  // The picker asks the most local question first; anything unanswered gets a
  // fresh think in well under half a second, and the GULP has no range gate.
  if (a.dist < TIDE_R && bs.cdTide <= 0) { castTide(e, a); return; }
  if (a.dist > DIVE_MIN && bs.cdDive <= 0) { castDive(e, a); return; }
  if (bs.cdReeds <= 0) { castReeds(e, a); return; }
  if (a.dist < CRUSH_RANGE && bs.cdCrush <= 0) { castCrush(e, a); return; }
  if (bs.cdGulp <= 0) { castGulp(e, a); return; }
  bs.t = (0.22 + Math.random() * 0.2) * e.rate;
}
