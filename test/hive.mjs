// HIVE, end to end - the eleventh theme built out.
//
// WHY THIS EXISTS
//   HIVE spends BODIES where every other theme spends ground, information,
//   health or position. The currency is the crowd, and every mechanic here
//   is one trade in it:
//
//     tick      dies onto burning honey where the player was standing. One
//               is nothing; the ground a crowd of them was cleared on is
//               the ground the next crowd fights on
//     spitter   a simultaneous FAN of three, not a stream. The dodge is a
//               step ACROSS the lane, and the tell is the sac swelling
//     borer     two halves - a plough in front that eats most of what lands
//               on it, a naked sac behind that swells as the bar falls.
//               Finished slow it is a wall; finished fast it bursts
//     oviger   the only artillery whose landing is a BODY: an egg arcs in
//               under a filling circle and hatches into a grub
//     nurse    carapace - a stacking, PERMANENT damage reduction that does
//               not die with the nurse. A conduit's buff lapses when the
//               conduit does; this one is bought with the same bullets that
//               were clearing the room
//     weeper    the high line: a long amber sightline swept slowly across
//               the floor, then one lance along it. Standing off the arc
//               has to cost nothing, or the sweep is not a telegraph
//
//   The headline assertions follow the same both-ways shape the other theme
//   suites use: the thing with the mechanic against the thing without it.
//   A borer is measured front-half against back-half; a carapace is measured
//   with a nurse alive against after she is dead; a weeper is measured on
//   the arc against off it.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8251;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const HIVE_TYPES = ['tick', 'spitter', 'borer', 'oviger', 'nurse', 'weeper'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (HIVE_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    // SECONDS OF GAME, not a count of frames. The loop clamps dt at 0.05, so
    // a frame is worth 1/60s of game on an idle machine and up to 0.05s on a
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
    let pinned = true;
    // GOD, NOT A BIG NUMBER. `p.health = 1e6` is overheal and bleeds off, and
    // `p.maxHealth = 1e6` is undone by rebuildMods() - so a harness that used
    // either lost about ten health a second in a completely empty arena.
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };

    const clean = () => {
      // PARKED, NOT IDLE. `waveState = 'idle'` stops the current wave and
      // then the machinery starts the NEXT one, spawning six fresh specialists
      // into the middle of a measurement.
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      g._mortars.forEach((m) => g.effects.markRelease(m.mark));
      g._mortars.length = 0;
      p.clearStatuses();
      g.input.forward = false;
      g.input.back = false;
      g.input.left = false;
      g.input.right = false;
      g.input.jump = false;
      g.input.sprint = false;
      g.input.crouch = false;
      g.input.moveF = 0;
      g.input.moveS = 0;
      pinned = true;
      god = true;
      p.health = p.maxHealth;
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
    // Runs `frames` with the player mortal, and reports what it cost.
    const measure = async (frames, fn) => {
      god = false;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      const h0 = p.health;
      for (let i = 0; i < frames; i++) {
        await step();
        if (fn) fn(i);
      }
      const lost = +(h0 - p.health).toFixed(2);
      god = true;
      p.health = p.maxHealth;
      return lost;
    };

    // ---- 0. the control -------------------------------------------------
    {
      clean();
      res.emptyCost = await measure(80);
      clean();
    }

    // ---- 1. all six survive being alive ---------------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of HIVE_TYPES) {
        const e = put(t, 14, 14);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      // Two seconds of GAME - a borer closed this distance in six seconds
      // of wall-clock on a loaded host and the suite reported it dying of
      // its own approach as a type that did not survive its AI.
      await simSteps(2);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. a tick dies onto burning honey ------------------------------
    // The player is standing next to it when it dies, and then ON the spot
    // afterwards. What is measured is the honey, not the corpse: standing
    // where it fell has to cost, and the same ground after the patch has
    // expired has to cost nothing.
    {
      clean();
      const e = put('tick', 3.2, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      await steps(4);
      e.takeDamage(e.hp + 1, true);
      await steps(6);
      res.tickHoney = g._hazard.some((h) => h.kind === 'hiveblood');
      if (res.tickHoney) {
        const h = g._hazard.find((x) => x.kind === 'hiveblood');
        px = h.x;
        pz = h.z;
        res.tickCost = await measure(36, () => {});
        // ...and once it has expired, the same ground is free again. Without
        // this the cost could be anything left behind by anything.
        await simSteps(h.life + 1);
        res.tickAfter = await measure(30, () => {});
      }
      clean();
    }

    // ---- 3. the borer is two halves --------------------------------------
    // THE PLATE. The same blow, fired from in front of the borer and from
    // behind it - what is measured is the health that came off, not whether
    // the blow killed, because a brute's bar is long and the point is the
    // DIFFERENCE between the two halves. The borer faces the player, so a
    // round travelling from the player's side lands on the plough and a
    // round arriving from beyond it lands on the sac.
    {
      clean();
      const e = put('borer', 8, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      await simSteps(0.4);
      e.speed = 0;
      const blow = (fromX) => {
        const dx = e.pos.x - fromX;
        const d = Math.hypot(dx, 0) || 1;
        const hp0 = e.hp;
        // `true` for silent would skip the carapace path but armour is not
        // silent-gated; `false` is the real round.
        e.takeDamage(20, false, dx / d, 0, null);
        return +(hp0 - e.hp).toFixed(2);
      };
      res.borFront = blow(0);
      res.borRear = blow(e.pos.x * 2);
      res.borYawSane = isFinite(e.group.rotation.y);
      clean();
      // Slow: a point every now and then, well above the burst line.
      {
        const slow = put('borer', 10, 0);
        slow.speed = 0;
        px = 20;
        pz = 20;
        for (let i = 0; i < 30; i++) {
          await step();
          slow.pos.set(10, slow.pos.y, 0);
          if (i % 8 === 0) slow.takeDamage(1, true);
        }
        slow.takeDamage(slow.hp + 1, true);
        await steps(6);
        res.borSlowBurst = g._hazard.some((h) => h.kind === 'hiveblood');
      }
      clean();
      // Fast: drained to under a fifth first, so the sac has swollen, then
      // finished. This is the rush the enemy charges for.
      {
        const fast = put('borer', 10, 0);
        fast.speed = 0;
        px = 20;
        pz = 20;
        await steps(4);
        fast.takeDamage(fast.maxHp * 0.9, true);
        await steps(10);
        fast.takeDamage(fast.hp + 1, true);
        await steps(6);
        res.borFastBurst = g._hazard.some((h) => h.kind === 'hiveblood');
      }
      clean();
    }

    // ---- 4. an oviger's egg lands and hatches ---------------------------
    {
      clean();
      const e = put('oviger', 14, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      let sawEgg = false;
      let sawLive = false;
      let sawMark = false;
      let eggEnemy = null;
      for (let i = 0; i < 1500; i++) {
        await step();
        e.pos.set(14, e.pos.y, 0);
        const grub = g.enemies.find((q) => q.type === 'grub' && !q.dead);
        if (grub && grub.eggT !== undefined) { sawEgg = true; eggEnemy = grub; }
        if (eggEnemy && eggEnemy.grubMark >= 0) sawMark = true;
        // Hatched: the flight clock is gone and the hatch timer has run
        // out - a grub walking its own AI like any rusher.
        if (grub && grub.eggT === undefined && !(grub.hatchT > 0)) sawLive = true;
        if (sawEgg && sawLive) break;
      }
      res.ovEgg = sawEgg;
      res.ovTelegraph = sawMark;
      res.ovLive = sawLive;
      clean();
    }

    // ---- 5. the nurse's carapace outlives her ---------------------------
    // A mate beside a nurse, over one stack; what a fixed blow costs before
    // the stack, after it, and after the nurse is dead. The last is the
    // whole enemy: a conduit's buff lapses with the conduit and a carapace
    // is bought with bullets, so it stays bought.
    {
      clean();
      const nur = put('nurse', 6, 0);
      nur.speed = 0;
      const mate = put('tick', 7.5, 0);
      mate.speed = 0;
      px = 0;
      pz = 0;
      // Room for the heal to show: the mate starts at half its bar, so a
      // stack's slice of maxHp is visible as hp going UP rather than
      // vanishing into a full bar.
      mate.hp = mate.maxHp * 0.5;
      const blow = 20;
      const hp0 = mate.hp;
      for (let i = 0; i < 700; i++) {
        await step();
        nur.pos.set(6, nur.pos.y, 0);
        mate.pos.set(7.5, mate.pos.y, 0);
        if (mate.carapace > 0) break;
      }
      res.nurStacked = +((mate.carapace || 0)).toFixed(2);
      // The heal is part of the stack - a slice of maxHp in the same
      // breath - and both have to show for the enemy to be what it says.
      res.nurHealed = +((mate.hp - hp0) / mate.maxHp).toFixed(3);
      // The blow, through the carapace...
      const m0 = mate.hp;
      mate.takeDamage(blow);
      res.nurBlowThrough = +(m0 - mate.hp).toFixed(2);
      // ...and against a clean body of the same type. The difference
      // between the two is the carapace and nothing else.
      const clean0 = put('tick', -7.5, 0);
      clean0.speed = 0;
      const c0 = clean0.hp;
      clean0.takeDamage(blow);
      res.nurBlowClean = +(c0 - clean0.hp).toFixed(2);
      // AND THE HALF THAT IS THE POINT. The nurse dies; the carapace does
      // not.
      nur.dead = true;
      await steps(30);
      res.nurStillStacked = +(mate.carapace || 0).toFixed(2);
      res.nurDead = nur.dead;
      clean();
    }

    // ---- 6. the weeper's sweep is a line ---------------------------------
    // THE BOTH-WAYS TEST. The weeper is pinned high and level with the
    // player, its sweep is watched until it fires, and the player is moved
    // with the arc (off the line) or left standing where the arc crosses
    // (on it). A sweep that aimed at the player rather than along its arc
    // would pass the second and fail the first.
    {
      const runWeep = async (standWithArc) => {
        clean();
        const e = put('weeper', 12, 0);
        e.speed = 0;
        e.weepCd = 0.01;
        px = 0;
        pz = 0;
        let sawTell = false;
        let dodgeAt = -1;
        const lost = await measure(420, () => {
          e.pos.set(12, e.pos.y, 0);
          if (e.weepState === 'tell') {
            sawTell = true;
            // The arc's current bearing, read off the enemy exactly as it
            // will be read at the moment of the shot.
            const ang = e.weepAng;
            // Where the line crosses the player's distance from the weeper.
            const d = Math.hypot(e.pos.x - px, e.pos.z - pz);
            const lx = e.pos.x + Math.cos(ang) * d;
            const lz = e.pos.z + Math.sin(ang) * d;
            if (standWithArc) {
              // WITH the arc: standing on the line itself.
              if (dodgeAt < 0) dodgeAt = 0;
              px = lx;
              pz = lz;
            } else {
              // OFF it, and further from the weeper than the line is: if
              // this costs nothing it cannot be because the lance is short.
              if (dodgeAt < 0) dodgeAt = 0;
              const away = Math.atan2(-(lz - e.pos.z), -(lx - e.pos.x));
              px = e.pos.x + Math.cos(away) * (d + 4);
              pz = e.pos.z + Math.sin(away) * (d + 4);
            }
          }
        });
        return { lost, sawTell };
      };
      const onLine = await runWeep(true);
      const offLine = await runWeep(false);
      res.weepTell = onLine.sawTell;
      res.weepOn = onLine.lost;
      res.weepOff = offLine.lost;
      clean();
    }

    // ---- 7. the Broodmother ----------------------------------------------
    // The fight now MOVES: she stalks a band, crosses the room on a rush,
    // and runs five committed attacks. Measured the suite's own way - the
    // thing with the mechanic against the thing without it: the nova on a
    // grounded target against one outside it, the rush's travel against the
    // tell that committed it, the burst's three eggs against the trickle's
    // one.
    {
      clean();
      // The lane has to be honest ground for the rush assertions below.
      g._enemyCtx.obstacles = [];
      const { BROOD_TOTAL_MAX } = await import('./js/enemies/hive.js');
      const e = put('broodmother', 12, 0);
      e.rate = 1;
      px = 0;
      pz = 0;
      // Phase A: free-roam watch. Nothing forced - whatever she does is the
      // fight doing it. The assertions are on VOLUME OF BEHAVIOUR: the walk
      // band keeps her circling, the book opens more than once, the fan and
      // the rings still ride underneath, and the brood spends but is capped.
      let maxGrubs = 0;
      let sawRing = false;
      let sawVolley = false;
      const states = new Set();
      let lastX = e.pos.x;
      let lastZ = e.pos.z;
      let travel = 0;
      for (let i = 0; i < 900; i++) {
        await step();
        states.add(e.bs.state);
        travel += Math.hypot(e.pos.x - lastX, e.pos.z - lastZ);
        lastX = e.pos.x;
        lastZ = e.pos.z;
        maxGrubs = Math.max(maxGrubs, g.enemies.filter((q) => q.type === 'grub' && !q.dead).length);
        // ringTell is the ring's own clock; slick honey from a rush must not
        // stand in for the ring she PLANTS.
        if (e.bs.ringTell > 0) sawRing = true;
        if (g.projectiles.some((q) => q.type === 'broodmother')) sawVolley = true;
        if (sawRing && sawVolley && maxGrubs >= 3) break;
      }
      res.bmStates = [...states];
      res.bmTravel = +travel.toFixed(1);
      res.bmGrubs = maxGrubs;
      res.bmRing = sawRing;
      res.bmVolley = sawVolley;
      res.bmGrubCap = maxGrubs <= BROOD_TOTAL_MAX;

      // Phase B: the rush, armed by hand. dist > 8 gates it onto the book.
      clean();
      g._enemyCtx.obstacles = [];
      const r = put('broodmother', 12, 0);
      r.rate = 1;
      px = 0;
      pz = 0;
      await steps(3);
      r.bs.state = 'walk';
      r.bs.t = 0;
      r.bs.attack = r.bs.attacks.indexOf('rush');
      let sawTell = false;
      let warned = false;
      let rushFrom = null;
      let rushTravel = 0;
      let slickBefore = 0;
      let slickAfter = 0;
      for (let i = 0; i < 600; i++) {
        await step();
        if (r.bs.state === 'rushTell') {
          sawTell = true;
          if (r.bs.mark >= 0) warned = true;
        }
        if (r.bs.state === 'rush') {
          if (rushFrom === null) {
            rushFrom = r.pos.x;
            slickBefore = g._hazard.length;
          }
          rushTravel = Math.max(rushTravel, Math.abs(r.pos.x - rushFrom));
        }
        if (sawRushTravelDone()) break;
      }
      function sawRushTravelDone() { return sawTell && (r.bs.state === 'walk' || r.bs.state === 'recover'); }
      slickAfter = g._hazard.length;
      res.bmRushTell = sawTell && warned;
      res.bmRushTravel = +rushTravel.toFixed(1);
      res.bmRushSlick = slickAfter > slickBefore;

      // Phase C: the burst. Brood emptied first so the book opens on it.
      clean();
      g._enemyCtx.obstacles = [];
      const b = put('broodmother', 12, 0);
      b.rate = 1;
      px = 0;
      pz = 0;
      await steps(3);
      b.bs.state = 'walk';
      b.bs.t = 0;
      b.bs.attack = b.bs.attacks.indexOf('burst');
      let peakFlight = 0;
      for (let i = 0; i < 400; i++) {
        await step();
        peakFlight = Math.max(peakFlight,
          g.enemies.filter((q) => q.type === 'grub' && !q.dead && q.eggT !== undefined).length);
        if (peakFlight >= 3) break;
      }
      res.bmBurst = peakFlight;

      // Phase D: the nova, both ways. Pinned near enough that the disc fills
      // with the player inside it vs. outside it. Measured on the boss's own
      // frames only: the loop ends the frame the slam lands, before the walk
      // band can put anything else in the air.
      const novaRun = async (playerX) => {
        clean();
        g._enemyCtx.obstacles = [];
        const n = put('broodmother', 2, 0);
        n.rate = 1;
        px = playerX;
        pz = 0;
        n.pos.set(2, n.pos.y, 0);
        await steps(3);
        n.bs.state = 'walk';
        n.bs.t = 0;
        n.bs.attack = n.bs.attacks.indexOf('nova');
        let sawN = false;
        let lost = 0;
        {
          god = false;
          p.health = p.maxHealth;
          p.invulnEnd = -1;
          const h0 = p.health;
          for (let i = 0; i < 240; i++) {
            await step();
            n.pos.set(2, n.pos.y, 0);
            if (n.bs.state === 'novaTell') sawN = true;
            else if (sawN) break;
          }
          lost = +(h0 - p.health).toFixed(2);
          god = true;
          p.health = p.maxHealth;
        }
        return { lost, sawN };
      };
      const onNova = await novaRun(6);
      const offNova = await novaRun(9.5);
      res.bmNovaTell = onNova.sawN && offNova.sawN;
      res.bmNovaOn = onNova.lost;
      res.bmNovaOff = offNova.lost;

      // Phase E: the panic, as before - walked to the threshold by hand,
      // brood left alive until the moment the bar crosses.
      clean();
      g._enemyCtx.obstacles = [];
      const q0 = put('broodmother', 12, 0);
      q0.rate = 1;
      px = 0;
      pz = 0;
      q0.pos.set(12, q0.pos.y, 0);
      let panicked = false;
      let hadGrubs = 0;
      for (let i = 0; i < 1200; i++) {
        await step();
        q0.pos.set(12, q0.pos.y, 0);
        hadGrubs = Math.max(hadGrubs, q0.bs.brood.length);
        if (!panicked) {
          q0.hp = q0.maxHp * 0.2;
          if (q0.bs.panicAt && q0.bs.brood.length === 0 && hadGrubs > 0) panicked = true;
        }
        if (panicked) break;
      }
      res.bmPanic = panicked;
      res.bmGrubValue = g.enemies.filter((q) => q.type === 'grub')
        .reduce((m, q) => Math.max(m, q.value), 0);
      clean();
    }

    await steps(30);
    return res;
  }, HIVE_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every HIVE type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a tick dies onto honey', out.tickHoney);
  ok('and the honey burns whoever stands on it', out.tickCost > 0, `lost=${out.tickCost}`);
  ok('and the ground is free again once it has expired',
    out.tickAfter === 0, `lost=${out.tickAfter}`);

  ok('a borer is plated from the front',
    out.borFront < out.borRear, `front=${out.borFront} rear=${out.borRear}`);
  ok('and the plating never reaches its own back half',
    out.borRear >= 19.5, `rear=${out.borRear} of 20`);
  ok('a borer killed slow does not burst', !out.borSlowBurst);
  ok('a borer killed fast bursts where it dies', out.borFastBurst);

  ok('an oviger throws a real egg', out.ovEgg);
  ok('the egg lands under a telegraph', out.ovTelegraph);
  ok('and hatches into a live grub', out.ovLive);

  ok('a nurse stacks carapace on its neighbour',
    out.nurStacked > 0, `stack=${out.nurStacked}`);
  ok('and the stack comes with the heal in the same breath',
    out.nurHealed > 0, `healed=${out.nurHealed}`);
  ok('a blow through the carapace costs less than the same blow clean',
    out.nurBlowThrough < out.nurBlowClean,
    `through=${out.nurBlowThrough} clean=${out.nurBlowClean} of 20`);
  ok('and the carapace OUTLIVES the nurse that stacked it',
    out.nurDead && out.nurStillStacked > 0, `still=${out.nurStillStacked}`);

  ok('a weeper sweeps a line before it fires', out.weepTell);
  ok('standing on the arc when the lance leaves costs',
    out.weepOn > 0, `lost=${out.weepOn}`);
  ok('and standing off the arc costs nothing',
    out.weepOff === 0, `lost=${out.weepOff}`);

  ok('the Broodmother still keeps and caps her brood', out.bmGrubs > 0 && out.bmGrubCap, `peak=${out.bmGrubs}`);
  ok('she stalks instead of standing in a corner', out.bmTravel > 20, `travel=${out.bmTravel}m states=${out.bmStates.join(',')}`);
  ok('and runs more than one kind of attack', out.bmStates.length >= 3, out.bmStates.join(','));
  ok('and she still throws the fan and calls rings', out.bmVolley && out.bmRing);
  ok('the rush warns with a lane before it goes', out.bmRushTell);
  ok('and the rush crosses the lane it drew', out.bmRushTravel > 6, `travel=${out.bmRushTravel}m`);
  ok('and the lane it crossed is left burning', out.bmRushSlick);
  ok('the burst throws a ring of grubs in one breath', out.bmBurst >= 3, `eggs=${out.bmBurst}`);
  ok('the nova visits the grounded', out.bmNovaOn > 0, `lost=${out.bmNovaOn}`);
  ok('and spares whoever is outside it', out.bmNovaTell && out.bmNovaOff === 0, `lost=${out.bmNovaOff}`);
  ok('and under a quarter bar she eats the brood and panics', out.bmPanic);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `HIVE TEST FAIL (${fails})` : 'HIVE TEST PASS');
process.exitCode = fails ? 1 : 0;
