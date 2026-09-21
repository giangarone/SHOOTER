import * as THREE from 'three';
import { ENEMY_TYPES, SHARED_MATS, partsFor, lump, slab, prism, spike, eyes, orbit, landHit, segBlocked, addWarnedMortar, capturedShot, contactReach, snapAim, faceSnap, markGet, markDrop } from './shared.js';

const COLOR = 0xbaffdc;
const body = { color: 0x985d91, eye: COLOR, scale: 1, radius: 0.5, mass: 1 };
const shot = { core: COLOR, glow: 0x985d91, scale: 0.5, speed: [16, 0.2, 22], dmg: [7, 0.25, 13] };
const TYPES = {
  buttonling: { ...body, hp: 36, speed: 3.3, damage: 8, value: 130,
    head: { r: 0.3, y: 0.9 },
    build: buildRusher, ai: aiRusher, cleanup: markDrop },
  gillspitter: { ...body, hp: 26, speed: 2.4, damage: 9, value: 260,
    head: { r: 0.3, y: 1.3 },
    proj: shot,
    build: buildGunner, ai: aiGunner, cleanup: markDrop },
  bracketback: { ...body, hp: 145, speed: 1.6, damage: 18, value: 320,
    head: { r: 0.3, y: 0.85 },
    scale: 1.4, radius: 0.7, mass: 2,
    armor: (e) => e.state === 'tell' ? 0.6 : 1,
    armorDefault: (e) => e.state === 'tell' ? 0.6 : 1,
    build: buildBrute, ai: aiBrute, cleanup: markDrop },
  puffmortar: { ...body, hp: 44, speed: 1.9, damage: 10, value: 270,
    head: { r: 0.3, y: 0.8 },
    build: buildArtillery, ai: aiArtillery, cleanup: markDrop },
  mycelarch: { ...body, hp: 62, speed: 2.1, damage: 0, value: 350,
    head: { r: 0.3, y: 1.5 },
    build: buildSupport, ai: aiSupport, cleanup: markDrop },
  veilray: { ...body, hp: 52, speed: 3.8, damage: 9, value: 300,
    head: { r: 0.3, y: 0.5 },
    proj: shot,
    fly: { height: 3.5 }, hitbox: { r: 0.6, y: 0.4 },
    build: buildFlier, ai: aiFlier, cleanup: markDrop },
  sporeregent: { ...body, hp: 3200, speed: 1.8, damage: 24, value: 6500,
    head: { r: 0.3, y: 1.55 },
    proj: shot,
    name: 'THE SPORE REGENT', boss: true, scale: 2.6, radius: 1.7, mass: 9,
    hitbox: { r: 0.9, y: 0.9 }, statusMul: 0.3, freezeSlow: true,
    slowFactor: 0.75, freezeVuln: 1, entropyExempt: true, fearMode: 'stagger',
    armor: (e) => e.bs.weakOpen ? 1 : 0.65,
    armorDefault: (e) => e.bs.weakOpen ? 1 : 0.65,
    build: buildBoss, ai: aiBoss, cleanup: markDrop },
};
Object.assign(ENEMY_TYPES, TYPES);

// Broad wine-coloured caps, pale radial gills and dark woody feet. The caps
// use one cached geometry at different scales, keeping a dense grove cheap.
const ORBIT = { dist: 11, band: 2, out: 0.8, in: -0.7, strafe: 0.4, flip: 2, flipVar: 1 };
const at = new THREE.Vector3();
function cap(P, x, y, z, r) {
  const top = P('fgCap', prism(0.12, 0.6, 0.28, 9), { x, y, z, s: r });
  P('fgLip', prism(0.6, 0.52, 0.08, 9), { x, y: y - 0.16 * r, z, s: r, mat: SHARED_MATS.fungalRind });
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    P('fgGill', slab(0.035, 0.035, 0.36), { x: x + Math.sin(a) * r * 0.3,
      y: y - 0.21 * r, z: z + Math.cos(a) * r * 0.3, ry: a, s: r,
      mat: SHARED_MATS.fungalGills, shadow: false });
  }
  for (const side of [-1, 1]) P('fgSpot', lump(0.075),
    { x: x + side * r * 0.25, y: y + 0.07 * r, z, s: r, sy: 0.3, mat: SHARED_MATS.fungalGills });
  return top;
}
function roots(P, radius, count = 4) {
  for (let i = 0; i < count; i++) {
    const a = i * Math.PI * 2 / count;
    P('fgRoot', spike(0.1, 0.8, 5), { x: Math.sin(a) * radius, y: 0.22,
      z: Math.cos(a) * radius, rz: Math.cos(a) * 0.9, rx: Math.sin(a) * 0.9, mat: SHARED_MATS.fungalRind });
  }
}
function buildRusher(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgButtonStem', prism(0.22, 0.3, 0.65, 6), { y: 0.45 });
  e.cap = cap(P, 0, 1.0, 0, 1.05); roots(P, 0.3);
  eyes(P, { y: 0.9, z: -0.32, mat: e.eyeMat });
}
function buildGunner(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgSpitterStem', prism(0.13, 0.28, 1.5, 5), { y: 0.85 });
  cap(P, 0, 1.7, 0.08, 0.8);
  for (const x of [-0.28, 0.28]) {
    P('fgTrumpet', prism(0.19, 0.07, 0.55, 7), { x, y: 1.2, z: -0.28, rx: -Math.PI / 2 });
    P('fgMuzzle', prism(0.14, 0.14, 0.03, 7), { x, y: 1.2, z: -0.57, rx: Math.PI / 2, mat: e.eyeMat });
  }
  roots(P, 0.25); eyes(P, { y: 1.3, z: -0.2, mat: e.eyeMat });
}
function buildBrute(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgLog', prism(0.35, 0.5, 1.0, 7), { y: 0.6, mat: SHARED_MATS.fungalRind });
  for (let i = 0; i < 3; i++) cap(P, (i % 2 ? -1 : 1) * 0.15, 0.7 + i * 0.32, 0.1, 1.4 - i * 0.2);
  roots(P, 0.55, 6); eyes(P, { y: 0.85, z: -0.48, x: 0.23, r: 1.3, mat: e.eyeMat });
}
function buildArtillery(e, g, s) {
  const P = partsFor(e, g, s);
  e.sack = P('fgPuff', lump(0.52), { y: 0.65, sy: 1.25 });
  P('fgPuffMouth', prism(0.21, 0.12, 0.2, 7), { y: 1.25, mat: e.eyeMat });
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    cap(P, Math.cos(a) * 0.43, 0.4, Math.sin(a) * 0.43, 0.4);
  }
  roots(P, 0.4); eyes(P, { y: 0.8, z: -0.49, mat: e.eyeMat });
}
function buildSupport(e, g, s) {
  const P = partsFor(e, g, s);
  for (const x of [-0.3, 0.3]) {
    P('fgArch', prism(0.09, 0.18, 1.4, 5), { x, y: 0.7, rz: x * 0.5, mat: SHARED_MATS.fungalRind });
    cap(P, x, 1.65, 0, 0.8);
  }
  e.heart = P('fgHeart', lump(0.23), { y: 1.2, sy: 1.7, mat: SHARED_MATS.fungalGills });
  roots(P, 0.5, 6); eyes(P, { y: 1.5, z: -0.15, mat: e.eyeMat });
}
function buildFlier(e, g, s) {
  const P = partsFor(e, g, s);
  e.cap = cap(P, 0, 0.7, 0, 1.4);
  P('fgRayBody', lump(0.3), { y: 0.35, sz: 1.6 });
  e.tendrils = [];
  for (let i = 0; i < 5; i++) e.tendrils.push(P('fgVeil', spike(0.055, 0.85, 4),
    { x: (i - 2) * 0.2, y: -0.05, z: 0.15, rx: Math.PI, mat: SHARED_MATS.fungalGills }));
  eyes(P, { y: 0.5, z: -0.37, r: 1.2, mat: e.eyeMat });
}
function buildBoss(e, g, s) {
  const P = partsFor(e, g, s);
  P('fgRegentTrunk', prism(0.45, 0.7, 1.5, 8), { y: 0.8, mat: SHARED_MATS.fungalRind });
  e.crown = cap(P, 0, 2.0, 0, 2.2);
  for (const x of [-0.72, 0.72]) {
    P('fgRegentArm', prism(0.17, 0.24, 1.25, 6), { x, y: 0.85, rz: -x * 0.6 });
    cap(P, x, 1.25, 0.1, 1.1);
    P('fgCrownStem', prism(0.08, 0.12, 0.55, 5), { x: x * 0.8, y: 2.1, z: 0.15, mat: SHARED_MATS.fungalRind });
    cap(P, x * 0.8, 2.35, 0.15, 0.75);
  }
  P('fgCrownStem', prism(0.08, 0.12, 0.55, 5), { y: 2.4, z: 0.15, mat: SHARED_MATS.fungalRind });
  cap(P, 0, 2.65, 0.15, 0.85);
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    P('fgRootSeam', slab(0.035, 0.65, 0.035), { x: Math.cos(angle) * 0.57,
      y: 0.55, z: Math.sin(angle) * 0.57, rz: Math.cos(angle) * 0.22,
      mat: SHARED_MATS.fungalGills, shadow: false });
  }
  e.heart = P('fgRegentHeart', lump(0.28), { y: 1.15, z: -0.57, sy: 1.4, mat: e.eyeMat });
  e.shutters = [-1, 1].map((side) => P('fgRegentShutter', slab(0.25, 0.7, 0.16),
    { x: side * 0.14, y: 1.15, z: -0.75, mat: SHARED_MATS.fungalRind }));
  roots(P, 0.85, 8);
  eyes(P, { y: 1.55, z: -0.5, x: 0.25, r: 1.6, mat: e.eyeMat });
}
// The aim/warn/touch/fire machinery is shared.js's: snapAim, faceSnap, markGet,
// markDrop, capturedShot, contactReach. Brought there so the SIXTEEN themes
// that ask for a wind-up cannot each grow their own half-copy of it - the
// release-on-every-path line in particular.
function warning(e, a, radius, progress) {
  const mark = markGet(e, a.ctx.effects);
  e.fx.markSet(mark, e.pos.x, e.pos.z, radius, COLOR, progress);
}
function pulse(e, a, radius) {
  at.set(e.pos.x, e.pos.y + 0.3, e.pos.z);
  a.ctx.effects.shockwave(at, COLOR, radius, 0.4);
}
function aiRusher(e, a) {
  e.timer = (e.timer || 0) - a.dt;
  e.cap.position.y = (1 + (e.state === 'tell' ? 0.18 * Math.sin(e.timer * 12) : 0)) * e.scale;
  if (e.state === 'tell') {
    warning(e, a, 2.3, 1 - e.timer / 0.65);
    if (e.timer <= 0) {
      const visible = e.mark >= 0; markDrop(e); pulse(e, a, 2.3);
      if (visible && contactReach(e, a, 2.3, 1.5, 1.5)) landHit(e, a.ctx);
      e.state = 'rest'; e.timer = 1.2; e._setEyeAlert(false);
    }
    return;
  }
  if (e.timer > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 2.8) { e.state = 'tell'; e.timer = 0.65; e._setEyeAlert(true); }
}
function aiGunner(e, a) {
  if (e.timer > 0) {
    faceSnap(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      const n = e.alternate ? 3 : 2;
      for (let i = 0; i < n; i++) capturedShot(e, a, e.aim, (i - (n - 1) / 2) * 0.22, e.boss ? 2.5 : 1.2);
      e.alternate = !e.alternate; e._setEyeAlert(false);
    }
    return;
  }
  orbit(e, a, ORBIT);
  if (e.attackCd <= 0 && a.dist < 22) {
    snapAim(e, a); e.timer = 0.65; e.attackCd = 2.8; e._setEyeAlert(true);
  }
}
function aiBrute(e, a) {
  e.timer = (e.timer || 0) - a.dt;
  if (e.state === 'tell') {
    warning(e, a, 3.5, 1 - e.timer / 0.9);
    if (e.timer <= 0) {
      const visible = e.mark >= 0; markDrop(e); pulse(e, a, 3.5);
      if (visible) {
        if (contactReach(e, a, 3.5, 1.5, 1.5)) landHit(e, a.ctx);
        // Two fruiting bodies follow the stomp, leaving both flanks open.
        for (const side of [-1, 1]) addWarnedMortar(a.ctx, e.pos.x + Math.cos(e.aim) * side * 4,
          e.pos.z + Math.sin(e.aim) * side * 4, 1.5, 1.0, e.damage * 0.6);
      }
      e.state = 'rest'; e.timer = 2; e._setEyeAlert(false);
    }
    return;
  }
  if (e.timer > 0) return;
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (a.dist < 4.2) { snapAim(e, a); e.state = 'tell'; e.timer = 0.9; e._setEyeAlert(true); }
}
function aiArtillery(e, a) {
  orbit(e, a, ORBIT);
  if (e.timer > 0) {
    faceSnap(e);
    a.vx = a.vz = 0; e.timer -= a.dt;
    e.sack.scale.set(e.scale * (1 + 0.3 * (1 - e.timer / 0.8)), e.scale * 1.25, e.scale);
    if (e.timer <= 0) {
      addWarnedMortar(a.ctx, e.tx, e.tz, 1.7, 0.9, e.damage);
      for (const side of [-1, 1]) addWarnedMortar(a.ctx, e.tx + Math.cos(e.aim + side * 0.65) * 3.3,
        e.tz + Math.sin(e.aim + side * 0.65) * 3.3, 1.6, 1.6, e.damage);
      e.sack.scale.set(e.scale, e.scale * 1.25, e.scale); e._setEyeAlert(false);
    }
    return;
  }
  if (e.attackCd <= 0 && a.dist < 24) { snapAim(e, a); e.timer = 0.8; e.attackCd = 4.8; e._setEyeAlert(true); }
}
function aiSupport(e, a) {
  orbit(e, a, ORBIT);
  const valid = (o) => o && o !== e && !o.dead && !o.boss && o.type !== e.type &&
    o.hp < o.maxHp && (o.fungalMended || 0) < o.maxHp * 0.24 && o.pos.distanceToSquared(e.pos) < 64 &&
    !segBlocked(e.pos.x, 1, e.pos.z, o.pos.x, 1, o.pos.z, a.ctx.obstacles);
  if (e.timer > 0) {
    a.vx = a.vz = 0; e.timer -= a.dt;
    if (!valid(e.patient)) { e.timer = 0; e.patient = null; e._setEyeAlert(false); return; }
    a.ctx.effects.beam(e.pos, e.patient.pos, COLOR);
    if (e.timer <= 0) {
      const o = e.patient, heal = Math.min(o.maxHp * 0.08, 12, o.maxHp - o.hp, o.maxHp * 0.24 - (o.fungalMended || 0));
      o.hp += heal; o.fungalMended = (o.fungalMended || 0) + heal;
      pulse(e, a, 2); e.patient = null; e._setEyeAlert(false);
    }
    return;
  }
  if (e.attackCd <= 0) {
    e.patient = a.ctx.enemies.find(valid);
    if (e.patient) { e.timer = 1.2; e.attackCd = 5; e._setEyeAlert(true); }
  }
}
function aiFlier(e, a) {
  e.tendrils.forEach((m, i) => { m.rotation.z = Math.sin(a.ctx.time * 4 + i) * 0.22; });
  if (e.timer > 0) {
    faceSnap(e);
    e.timer -= a.dt;
    if (e.timer <= 0) {
      for (let i = 0; i < 3; i++) addWarnedMortar(a.ctx, e.tx + Math.cos(e.aim) * i * 2.4,
        e.tz + Math.sin(e.aim) * i * 2.4, 1.4, 0.9 + i * 0.35, e.damage);
      e.escape = 1.4; e._setEyeAlert(false);
    }
    return;
  }
  if (e.escape > 0) { e.escape -= a.dt; a.vx = -a.nx * a.sp; a.vz = -a.nz * a.sp; return; }
  orbit(e, a, { ...ORBIT, dist: 6 });
  if (e.attackCd <= 0 && a.dist < 12) { snapAim(e, a); e.timer = 0.9; e.attackCd = 4.8; e._setEyeAlert(true); }
}
function rest(e, a) {
  markDrop(e); e.state = 'rest'; e.timer = 1.8; e.bs.weakOpen = true;
  e.bs.ventNote = 'MYCELIUM HEART EXPOSED'; e._setEyeAlert(false); a.ctx.bossEvent('vent', e);
}
function aiBoss(e, a) {
  const bs = e.bs;
  if (!e.state) { e.state = 'stalk'; e.timer = 1.4; bs.turn = 0; }
  bs.enraged = e.hp < e.maxHp * 0.5;
  e.shutters.forEach((m, i) => { m.position.x = (i ? 1 : -1) * (bs.weakOpen ? 0.45 : 0.14) * e.scale; });
  e.crown.position.y = (2 + (e.state === 'tell' ? 0.08 * Math.sin(a.ctx.time * 10) : 0)) * e.scale;
  if (e.status.fear > 0) return;
  e.timer -= a.dt;
  if (e.state === 'spiral') {
    faceSnap(e);
    if (e.timer <= 0) {
      for (let i = 0; i < 5; i++) capturedShot(e, a, e.aim, (i - 2) * 0.34 + (e.round - 1) * 0.13, e.boss ? 2.5 : 1.2);
      e.round++; e.timer = 0.38;
      if (e.round >= (bs.enraged ? 4 : 3)) rest(e, a);
    }
    return;
  }
  if (e.state === 'tell') {
    faceSnap(e);
    if (e.timer > 0) return;
    const damage = Math.min(22, e.damage * 0.7);
    if (bs.attack === 'spiral') { e.state = 'spiral'; e.timer = 0; e.round = 0; return; }
    if (bs.attack === 'roots') {
      // A fork growing OUT from the regent. The middle remains a corridor.
      for (const side of [-1, 1]) for (let i = 1; i <= (bs.enraged ? 4 : 3); i++) {
        const angle = e.aim + side * 0.36;
        addWarnedMortar(a.ctx, e.pos.x + Math.cos(angle) * i * 3, e.pos.z + Math.sin(angle) * i * 3,
          1.35, 0.8 + i * 0.26, damage);
      }
    } else {
      // A fairy ring with a wide missing sector towards the boss. Never
      // close it on enrage: more petals must not remove the escape route.
      addWarnedMortar(a.ctx, e.tx, e.tz, 1.8, 0.9, damage);
      const n = bs.enraged ? 7 : 5;
      for (let i = 0; i < n; i++) {
        const angle = e.aim - Math.PI * 0.65 + i * Math.PI * 1.3 / (n - 1);
        addWarnedMortar(a.ctx, e.tx + Math.cos(angle) * 4.5, e.tz + Math.sin(angle) * 4.5,
          1.6, 1.5 + i * 0.08, damage);
      }
    }
    pulse(e, a, 4); rest(e, a); return;
  }
  if (e.state === 'rest') {
    if (e.timer > 0) return;
    bs.weakOpen = false; a.ctx.bossEvent('vent', e);
    e.state = 'stalk'; e.timer = (bs.enraged ? 0.8 : 1.4) * e.rate;
  }
  a.vx = a.px * a.sp; a.vz = a.pz * a.sp;
  if (e.timer > 0 || a.dist > 28) return;
  snapAim(e, a); bs.attack = ['roots', 'spiral', 'bloom'][bs.turn++ % 3];
  e.state = 'tell'; e.timer = 1.1; e._setEyeAlert(true); pulse(e, a, 3);
}
