// RIME, end to end - the second theme built out.
//
// WHY THIS EXISTS
//   EMBER spends FLOOR; RIME spends the PLAYER. Almost nothing in it deals
//   direct damage - a hailer, a hoarfrost and a sleet deal none at all - and
//   what they do instead is make you slower, weaker and easier for everything
//   else to answer. That makes it the theme where a broken mechanic is least
//   likely to look broken: an enemy that is silently not applying its debuff
//   still walks, still animates, and simply makes the wave a bit easier.
//
//     shard      reads the PLAYER's status and changes what it fires. The one
//                enemy whose behaviour depends on another enemy having worked
//     glacier    an armour fraction that turns off partway down its own health
//                bar, and fires a nova exactly once when it does
//     hailer     a Spit of a fourth kind, whose _land opens a gapped RING
//                rather than the flare's fan - a second shape through the same
//                branch, which is where a copy-paste would show
//     hoarfrost  applies `weakness`, which had sat in status.js since the
//                status system shipped with nothing in the game applying it
//     sleet      a flier that homes rather than commits - the deliberate
//                opposite of the ashwing, and the pair are easy to collapse
//                into each other by accident
//     palecrown  no shell, no gate: five telegraphed attacks on a shuffled
//                bag, a fast clock, and a body that always costs to touch
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. The shard's burst is conditional on the player being chilled.
//   3. The glacier's crust reduces damage, comes off at the threshold, and
//      leaves frost behind exactly once.
//   4. The hailer's cluster lands as a RING with a gap, not a fan or a blob.
//   5. A hoarfrost weakens the player in its field, and stops when it dies.
//   6. A sleet parks overhead and drips where the player is standing.
//   7. The Pale Crown: contact pays on a cadence in every state; each attack
//      warns before it lands; the rush crosses the arena and freezes the
//      corridor; the fan swells against a chilled player; the prison is a
//      gapped ring around the player; the rain walks; the clock is fast; and
//      a boss that dies mid-tell returns every telegraph handle.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8222;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const RIME_TYPES = ['rime', 'shard', 'glacier', 'hailer', 'hoarfrost', 'sleet'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (RIME_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const TYPES = (await import('./js/enemy.js')).ENEMY_TYPES;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames. The loop clamps dt at 0.05, so a
    // frame is worth 1/60s of game on an idle machine and up to 0.05s on a
    // loaded one - the same steps(n) simulates THREE TIMES more game on a slow
    // host. Anything whose meaning is a duration has to be waited for in this
    // unit or it silently changes what it is testing.
    const simSteps = async (seconds) => {
      const until = g.time + seconds;
      while (g.time < until) await step();
    };
    const res = {};

    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => { origUpdate(...args); p.pos.set(px, 0, pz); };

    const clean = () => {
      // The wave is parked and emptied. Every subject here is placed by hand,
      // and a themed wave running underneath would be six more of the same
      // specialist laying the very zones being measured.
      // THE WAVE IS PARKED, AND PARKING IT TAKES BOTH HALVES.
      //
      // 'idle' stops the current wave, and then the machinery starts the NEXT
      // one a moment later - which in a themed game means six fresh
      // specialists of whatever theme was dealt, spawning into the middle of a
      // measurement. That is not hypothetical: it is what made a bramblehide
      // sixteen metres away appear to deal damage, when what had actually
      // happened was a sporegun wandering in and sprouting a seed underfoot.
      //
      // 'active' with one enemy in the queue that never arrives is what
      // actually holds it: the wave cannot complete (an empty queue and no
      // enemies would complete it, and completing clears every zone in the
      // arena), and it cannot spawn either.
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      p.clearStatuses();
      p.health = 1e6;
      p.invulnEnd = -1;
      p.wardReady = false;
      p.mods.dodgeChance = 0;
      px = 0;
      pz = 0;
    };
    const put = (type, x, z) => {
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.pos.set(x, e.pos.y, z);
      return e;
    };
    const kinds = (k) => g._hazard.filter((h) => h.kind === k);

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of RIME_TYPES) {
        const e = put(t, 7, 7);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      await simSteps(2);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. the shard's burst is conditional ----------------------------
    // The whole type is one test on the player's status, so the check has to
    // be the DIFFERENCE between the two cases and not just "it fired".
    {
      // COUNTED AS SPAWNS, NOT AS ROUNDS IN THE AIR. The first version of this
      // waited for a projectile to appear and then counted what was still
      // flying a moment later - and at twelve metres a lance reaches the
      // player and despawns long before that, so both cases measured zero. A
      // burst is three SPAWN events inside a short window, which is what is
      // watched for here.
      const volley = async (chilled) => {
        clean();
        const e = put('shard', 12, 0);
        e.speed = 0;   // parked, so it cannot orbit out of its own range
        e.attackCd = 0;
        let seen = 0;
        let firstAt = -1;
        let prev = g.projectiles.length;
        for (let i = 0; i < 1400; i++) {
          if (chilled) p.applyStatus('slowness', 5);
          await step();
          const now = g.projectiles.length;
          if (now > prev) {
            seen += now - prev;
            if (firstAt < 0) firstAt = g.time;
          }
          prev = now;
          // Once the first round is away, watch a window wide enough to
          // contain a three-round burst and narrow enough to exclude the next
          // volley's cooldown. IN GAME SECONDS: this was 70 frames, which is
          // that window at 60fps and three times it on a host rendering at
          // twenty, where it stretched far enough to swallow the next volley
          // and count a calm shard's single lance as two.
          if (firstAt >= 0 && g.time - firstAt > 1.2) break;
        }
        return seen;
      };
      res.shardCalm = await volley(false);
      res.shardChilled = await volley(true);
      clean();
    }

    // ---- 3. the glacier's crust ------------------------------------------
    {
      clean();
      const e = put('glacier', 6, 0);
      e.speed = 0;
      await steps(10);
      // The crust is on: a hit lands for a fraction of what it is worth.
      const hpA = e.hp;
      e.takeDamage(100, false, 0, 0);
      const shelledLoss = hpA - e.hp;
      res.glacierShellArmor = +(shelledLoss / 100).toFixed(2);
      res.glacierPlatesUp = e.shellParts.filter((m) => m.visible).length;

      // Drive it down through the threshold and watch for the one event.
      e.hp = e.maxHp * 0.42;
      await steps(6);
      res.glacierIntactAbove = !e.shellBroken;
      e.hp = e.maxHp * 0.3;
      await steps(20);
      res.glacierShattered = !!e.shellBroken;
      res.glacierPlatesGone = e.shellParts.every((m) => !m.visible);
      res.glacierNova = kinds('frost').length;

      // ...and bare afterwards, so the grind actually ends.
      //
      // HEALTH RESTORED FIRST. Below the threshold a glacier has less than a
      // hundred points left, so a hundred-point hit is clamped by what the
      // body had rather than reduced by what it is wearing - the first version
      // of this measured the clamp and read it as armour. `shellBroken` is a
      // one-way flag and aiGlacier returns early on it, so putting the health
      // back cannot re-arm the crust.
      e.hp = e.maxHp;
      const hpB = e.hp;
      e.takeDamage(100, false, 0, 0);
      res.glacierBareArmor = +((hpB - e.hp) / 100).toFixed(2);
      // Exactly once: a nova that re-fired every frame under the threshold
      // would carpet the arena and would still pass a "did it nova" check.
      const after = kinds('frost').length;
      await simSteps(1);
      res.glacierNovaOnce = kinds('frost').length <= after;
      clean();
    }

    // ---- 4. the hailer's ring --------------------------------------------
    {
      clean();
      const e = put('hailer', 11, 0);
      e.attackCd = 0;
      for (let i = 0; i < 900 && kinds('hail').length === 0; i++) await step();
      const pat = kinds('hail');
      res.hailPatches = pat.length;
      // A RING has a hole in the middle. Measured as the spread of distances
      // from the patches' own centroid: a fan or a blob has patches near it,
      // a ring has none.
      let cx = 0;
      let cz = 0;
      for (const h of pat) { cx += h.x; cz += h.z; }
      cx /= Math.max(1, pat.length);
      cz /= Math.max(1, pat.length);
      const rs = pat.map((h) => Math.hypot(h.x - cx, h.z - cz));
      res.hailMinR = pat.length ? +Math.min(...rs).toFixed(1) : -1;
      res.hailMaxR = pat.length ? +Math.max(...rs).toFixed(1) : -1;
      // And it is GAPPED - fewer patches than the ring has slots.
      res.hailGapped = pat.length > 0 && pat.length < 10;
      clean();
    }

    // ---- 5. the hoarfrost's field ----------------------------------------
    {
      clean();
      // Parked, for the reason a bellows has to be: it ORBITS, and left alone
      // it holds eleven metres off a player its field only reaches seven and a
      // half - so the check would measure the orbit, not the field.
      const e = put('hoarfrost', 3, 0);
      e.speed = 0;
      res.hoarHasRing = !!e.ringMesh;
      await steps(40);
      res.hoarWeakens = p.hasStatus('weakness');
      res.hoarDamageMult = +p.statusDamageMult().toFixed(2);
      // ...and it lapses when the caster dies. This is the reason to shoot it,
      // so it is the half worth asserting hardest.
      e.dead = true;
      await simSteps(1.5);
      res.hoarLapsed = res.hoarWeakens && !p.hasStatus('weakness');
      clean();
    }

    // ---- 6. the sleet's column -------------------------------------------
    {
      clean();
      const e = put('sleet', 12, 0);
      let overhead = false;
      for (let i = 0; i < 1200; i++) {
        await step();
        if (Math.hypot(e.pos.x - px, e.pos.z - pz) < 3.2) overhead = true;
        if (overhead && kinds('hail').length > 0) break;
      }
      res.sleetOverhead = overhead;
      res.sleetFlying = e.pos.y > 3;
      const pat = kinds('hail');
      res.sleetDrips = pat.length;
      // On the player, not trailed across the arena - that is the ashwing.
      res.sleetOnTarget = pat.length
        ? +Math.min(...pat.map((h) => Math.hypot(h.x - px, h.z - pz))).toFixed(1)
        : -1;
      clean();
    }

    // ---- 7. the Pale Crown ------------------------------------------------
    // The reworked fight, probed by hand the way boss.mjs's schism block was
    // built: an unkillable PLAYER PINNED TO A SPOT, every attack driven by
    // fixed-dt steps rather than the wall clock (a headless runner's frame
    // loop is not a clock), and hits counted BY SOURCE - the boss's body
    // charges the probes directly; its lances and falling icicles carry no
    // source and never pollute a contact count.
    //
    // Per probe the bag is loaded with the attack under test, so the pick is
    // deterministic and the assertion measures the attack, not the shuffle.
    {
      clean();
      g.setTheme('rime');
      const e = put('palecrown', 10, 0);
      const bs = e.bs;
      // SECONDS OF GAME, driven on fixed ticks. sections 1-6 waited on the
      // live rAF loop; the boss's own mechanics are written in game time, so
      // game time is what drives them here.
      const DT = 1 / 60;
      const runUntil = (cond, max) => {
        for (let i = 0; i < Math.round(max / DT); i++) {
          g.time += DT;
          g._updateEnemies(DT);
          g._updateProjectiles(DT);
          if (cond()) return true;
        }
        return false;
      };
      const run = (seconds) => runUntil(() => false, seconds);
      run(0.3);   // one tick on INITIALISED state - the ai owns bs's shape

      const origHurt = g._hurtPlayer.bind(g);
      const hits = [];
      g._hurtPlayer = (d, pos, src) => { hits.push({ src, at: g.time }); origHurt(d, pos, src); };
      const hitsOn = () => hits.filter((h) => h.src === e);
      const marksUsed = () => g.effects.marks.filter((m) => m.used).length;
      const pin = (x, z) => { px = x; pz = z; g.player.pos.set(x, 0, z); };
      // On the line from the boss to the middle of the room, d metres from it.
      const pinAt = (d) => {
        const m = Math.hypot(e.pos.x, e.pos.z) || 1;
        pin(e.pos.x * (1 - d / m), e.pos.z * (1 - d / m));
      };
      // One clean slate per probe: no leftover ground, no telegraph held, and
      // the bag parked so only the armed attack can fire.
      const silence = () => {
        for (const x of g.enemies) if (x !== e && !x.dead) x.dead = true;
        bs.state = 'roam'; bs.t = bs.tMax = 999; bs.bag = [];
        TYPES.palecrown.cleanup(e);
        g._clearHazards();
        p.clearStatuses();
        run(DT * 2);
      };
      const arm = (attack) => { bs.bag = [attack]; bs.t = 0; };
      res.crownArmorGone = TYPES.palecrown.armor === undefined;
      res.crownSpeed = TYPES.palecrown.speed;

      // ---- TOUCH. Next to it pays, on the clock, in the plain roam -------
      {
        silence();
        hits.length = 0;
        for (let i = 0; i < 16; i++) {
          pinAt(2.1);   // it prowls away from a hug; the question is contact
          run(0.25);
        }
        const mine = hitsOn();
        res.crownTouchHits = mine.length;
        let gap = Infinity;
        for (let i = 1; i < mine.length; i++) gap = Math.min(gap, mine[i].at - mine[i - 1].at);
        res.crownTouchGap = gap === Infinity ? -1 : +gap.toFixed(2);
      }

      // ---- THE FAN. A tell, then a volley - and MORE for a chilled player -
      {
        const origSpawn = g._spawnProjectile.bind(g);
        const volley = (chilled) => {
          silence();
          pinAt(12);
          if (chilled) p.applyStatus('slowness', 8);
          let fired = 0;
          let duringTell = 0;
          g._spawnProjectile = (x, y, z, type, ss, sr) => {
            if (type === 'palecrown') { fired++; if (bs.state === 'fanTell') duringTell++; }
            return origSpawn(x, y, z, type, ss, sr);
          };
          arm('fan');
          const told = runUntil(() => bs.state === 'fanTell', 2);
          runUntil(() => bs.state === 'roam', 5);
          g._spawnProjectile = origSpawn;
          return { told, fired, duringTell };
        };
        const calm = volley(false);
        const chill = volley(true);
        res.crownFanTells = calm.told;
        res.crownFanCalm = calm.fired;
        res.crownFanTellShots = calm.duringTell;
        res.crownFanChill = chill.fired;
      }

      // ---- THE RUSH. A lane, then the crossing, then the cold corridor ----
      {
        silence();
        // The arena is generated and the boss's shoulders are 1.7m wide: hand-
        // placing the lane across a pillar would measure the calve, not the
        // crossing. Find a corridor first - three parallel rays, because the
        // lane the game draws is as wide as the Crown is.
        const { segBlocked } = await import('./js/enemies/shared.js');
        e.pos.set(6, 0, 6);
        const laneClear = (ux, uz, len) => {
          for (const off of [-1.2, 0, 1.2]) {
            const ox = -uz * off;
            const oz = ux * off;
            if (segBlocked(e.pos.x + ox, 1.2, e.pos.z + oz,
              e.pos.x + ox + ux * len, 1.2, e.pos.z + oz + uz * len, g.arena.obstacles)) return false;
          }
          return true;
        };
        let lane = null;
        for (let k = 0; k < 16 && !lane; k++) {
          const ang = (k / 16) * Math.PI * 2;
          const ux = Math.cos(ang);
          const uz = Math.sin(ang);
          if (laneClear(ux, uz, 14)) lane = { ux, uz };
        }
        pin(e.pos.x + (lane ? lane.ux : -1) * 13, e.pos.z + (lane ? lane.uz : 0) * 13);
        const x0 = e.pos.x;
        const z0 = e.pos.z;
        arm('rush');
        res.crownRushTells = runUntil(() => bs.state === 'rushTell', 2);
        run(0.35);
        res.crownRushMarked = marksUsed() > 0;
        runUntil(() => bs.state === 'roam', 5);
        res.crownRushMoved = +Math.hypot(e.pos.x - x0, e.pos.z - z0).toFixed(1);
        res.crownRushWake = kinds('frost').length;
        res.crownRushMarkGone = marksUsed() === 0;
      }

      // ---- THE NOVA. The disc, the blast, the chill, the frozen rim --------
      {
        silence();
        pinAt(3);
        hits.length = 0;
        arm('nova');
        res.crownNovaTells = runUntil(() => bs.state === 'novaTell', 2);
        run(0.3);
        res.crownNovaMarked = marksUsed() > 0;
        // The plates ARE the tell - the old shell opening means the blast.
        res.crownNovaPlates = e.shellParts.some((m) => m.visible);
        runUntil(() => bs.state === 'roam', 4);
        res.crownNovaHit = hitsOn().length > 0;
        res.crownNovaChilled = p.hasStatus('slowness');
        res.crownNovaRing = kinds('hail').length;
      }

      // ---- THE PRISON. A gapped ring around the player, landing at once ---
      {
        silence();
        pin(0, 0);
        hits.length = 0;
        arm('prison');
        res.crownPrisonCasts = runUntil(() => bs.state === 'prisonCast', 2);
        run(0.4);
        const ring = bs.rings.slice();
        res.crownPrisonN = ring.length;
        const rs = ring.map((s) => Math.hypot(s.x - px, s.z - pz));
        res.crownPrisonRMin = rs.length ? +Math.min(...rs).toFixed(1) : -1;
        res.crownPrisonRMax = rs.length ? +Math.max(...rs).toFixed(1) : -1;
        // The gap: the widest hole between neighbours is the one the strike
        // pattern left open - about three slot-widths, the rest one.
        const angs = ring.map((s) => Math.atan2(s.z - pz, s.x - px)).sort((a, b) => a - b);
        let maxGap = 0;
        for (let i = 0; i < angs.length; i++) {
          const next = i + 1 < angs.length ? angs[i + 1] : angs[0] + Math.PI * 2;
          maxGap = Math.max(maxGap, next - angs[i]);
        }
        res.crownPrisonGap = +maxGap.toFixed(2);
        // Standing on a live circle when it snaps is the mistake it punishes.
        if (ring.length) pin(ring[0].x, ring[0].z);
        runUntil(() => bs.rings.length === 0, 3);
        res.crownPrisonHit = hitsOn().length > 0;
        res.crownPrisonHail = kinds('hail').length;
      }

      // ---- THE RAIN. Two waves, the second placed where you went ----------
      {
        silence();
        pin(0, 0);
        arm('rain');
        res.crownRainCasts = runUntil(() => bs.state === 'rainCast', 2);
        // Peak concurrent strikes: the second wave has to be FALLING while the
        // first is still on the floor, or the barrage does not walk.
        let peak = 0;
        for (let i = 0; i < 45 && !(i > 10 && bs.rings.length === 0 && bs.state === 'roam'); i++) {
          run(0.1);
          peak = Math.max(peak, bs.rings.length);
        }
        res.crownRainPeak = peak;
        res.crownRainHail = kinds('hail').length;
      }

      // ---- THE CLOCK. Free fight, natural bag: attacks keep coming --------
      {
        silence();
        bs.t = 0;   // silence parks the clock; the free fight needs it running
        pinAt(12);
        let attacks = 0;
        let prev = 'roam';
        const TELLS = new Set(['fanTell', 'rushTell', 'novaTell', 'prisonCast', 'rainCast']);
        for (let i = 0; i < 100; i++) {
          pinAt(12);
          run(0.12);
          if (TELLS.has(bs.state) && !TELLS.has(prev)) attacks++;
          prev = bs.state;
        }
        res.crownAttacks12 = attacks;
      }

      // ---- THE END OF THE BAR tightens the clock, once and loudly ---------
      {
        silence();
        pinAt(12);
        e.hp = e.maxHp * 0.4;
        run(0.3);
        res.crownEnraged = !!bs.enraged;
      }

      // ---- A CROWN THAT DIES MID-TELL RETURNS EVERY WARNING --------------
      {
        silence();
        pinAt(14);
        arm('rush');
        runUntil(() => bs.state === 'rushTell', 2);
        run(0.3);
        res.crownMarkHeld = marksUsed() > 0;
        e.dead = true;
        run(0.4);
        res.crownMarksFreed = marksUsed() === 0;
      }

      g._hurtPlayer = origHurt;
      clean();
      g.setTheme(null);
    }

    await steps(30);
    return res;
  }, RIME_TYPES);

  ok('every RIME type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a shard fires one lance at a healthy target', out.shardCalm === 1, `n=${out.shardCalm}`);
  ok('and a burst at a chilled one', out.shardChilled >= 3,
    `n=${out.shardChilled} vs calm ${out.shardCalm}`);

  ok('the glacier’s crust takes most of a hit',
    out.glacierShellArmor > 0.2 && out.glacierShellArmor < 0.7, `x${out.glacierShellArmor}`);
  ok('the crust is on the model while it holds', out.glacierPlatesUp > 0,
    `plates=${out.glacierPlatesUp}`);
  ok('it holds above the threshold', out.glacierIntactAbove);
  ok('and shatters below it', out.glacierShattered && out.glacierPlatesGone);
  ok('the shatter leaves frost behind', out.glacierNova > 0, `patches=${out.glacierNova}`);
  ok('and does it exactly once', out.glacierNovaOnce);
  ok('the bare core takes full damage', out.glacierBareArmor > 0.9, `x${out.glacierBareArmor}`);

  ok('the hailer lands a ring, not a blob',
    out.hailPatches >= 5 && out.hailMinR > 2.5,
    `n=${out.hailPatches} r=${out.hailMinR}-${out.hailMaxR}m`);
  ok('and the ring has a gap in it', out.hailGapped, `n=${out.hailPatches}/10`);

  ok('the hoarfrost draws the field it works at', out.hoarHasRing);
  ok('it weakens the player inside it', out.hoarWeakens, `dmg x${out.hoarDamageMult}`);
  ok('and the weakness lapses when it dies', out.hoarLapsed);

  ok('the sleet parks overhead and stays airborne', out.sleetOverhead && out.sleetFlying);
  ok('and drips onto the player, not across the arena',
    out.sleetDrips > 0 && out.sleetOnTarget >= 0 && out.sleetOnTarget < 4,
    `n=${out.sleetDrips} nearest=${out.sleetOnTarget}m`);

  ok('the Pale Crown carries no shell and no armour gate at all',
    out.crownArmorGone, `armor=${out.crownArmorGone}`);
  ok('and it is faster on its feet than it was', out.crownSpeed > 2.5, `speed=${out.crownSpeed}`);
  ok('touching it pays, in every state, on a real cooldown',
    out.crownTouchHits >= 2 && out.crownTouchGap >= 0.85,
    `hits=${out.crownTouchHits} minGap=${out.crownTouchGap}s`);
  ok('the fan telegraphs and fires nothing during the tell',
    out.crownFanTells && out.crownFanTellShots === 0, `early=${out.crownFanTellShots}`);
  ok('the fan is two volleys of three at a healthy player',
    out.crownFanCalm === 6, `n=${out.crownFanCalm}`);
  ok('and two of five at a chilled one', out.crownFanChill === 10, `n=${out.crownFanChill}`);
  ok('the rush draws its lane before it comes',
    out.crownRushTells && out.crownRushMarked);
  ok('and it CROSSES the arena, leaving the corridor frozen',
    out.crownRushMoved >= 6.5 && out.crownRushWake >= 3,
    `moved=${out.crownRushMoved}m wake=${out.crownRushWake}`);
  ok('the nova opens the plates over a drawn disc before it lands',
    out.crownNovaTells && out.crownNovaMarked && out.crownNovaPlates);
  ok('and it chills what it catches and freezes the rim',
    out.crownNovaHit && out.crownNovaChilled && out.crownNovaRing >= 7,
    `hit=${out.crownNovaHit} chill=${out.crownNovaChilled} ring=${out.crownNovaRing}`);
  ok('the prison is eight strikes in a ring around the player, with a gap',
    out.crownPrisonCasts && out.crownPrisonN === 8 && out.crownPrisonGap > 1.2,
    `n=${out.crownPrisonN} r=${out.crownPrisonRMin}-${out.crownPrisonRMax} gap=${out.crownPrisonGap}`);
  ok('and its snap hurts to stand in, then stays frozen',
    out.crownPrisonHit && out.crownPrisonHail >= 7,
    `hit=${out.crownPrisonHit} hail=${out.crownPrisonHail}`);
  ok('the rain holds two waves in the air at once and leaves ice',
    out.crownRainCasts && out.crownRainPeak >= 5 && out.crownRainHail >= 4,
    `peak=${out.crownRainPeak} hail=${out.crownRainHail}`);
  ok('the clock is FAST - attacks keep coming',
    out.crownAttacks12 >= 5, `attacks in 12s=${out.crownAttacks12}`);
  ok('below half the bar the fight tightens, loudly', out.crownEnraged);
  ok('a Crown that dies mid-tell returns every warning',
    out.crownMarkHeld && out.crownMarksFreed);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `RIME TEST FAIL (${fails})` : 'RIME TEST PASS');
process.exitCode = fails ? 1 : 0;
