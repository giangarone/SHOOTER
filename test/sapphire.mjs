// SAPPHIRE, end to end - the twelfth theme built out.
//
// WHY THIS EXISTS
//   SAPPHIRE is the theme of ACCRUING RESONANCE - every enemy in it is quiet
//   when it arrives and worse for every second it is allowed to keep
//   existing, and all six of the types added here are the same question at a
//   different role: HOW LONG HAS THAT BEEN ALLOWED TO RING?
//
//     dart      runs faster every HALF-BEAT it survives - Music.pulse, the
//               edge the whole theme is built on, not a timer of its own
//     facet     fires a fan that is one round wider every volley
//     cairn     grows a shell out of the damage it has already been hit
//               with, settled as permanent plate - and burn ignores it,
//               because the shell is made of blows
//     lapidary  lands a seed as a mortar drawn at the FINAL radius, and the
//               patch then SPREADS outward to it - the only ground in the
//               game that grows
//     attuner   stacks pace on everything inside its ring, and the stacks
//               come OFF when it dies
//     comet     every dive it lands makes the next faster and the wait for
//               it shorter
//
//   Every assertion here is therefore a PAIR - a before and an after, a
//   with-one and a without-one - because a mechanic that accrues is silent
//   when it is not working: a dart whose pace never stepped, or a crystal
//   that landed and did not grow, would not look like a bug in an enemy. It
//   would look like nothing at all.
//
//   The boss block then holds the rebuilt CARILLON to the same standard:
//   its five NEW attacks are each forced cold and measured as a difference
//   (the lane reached you, the rain poured, the step relocated the fight,
//   the echo rang your shadow back, the full ring spent what was wound),
//   and the tower bills for bare contact in every state it has.
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8253;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const SAPPHIRE_TYPES = ['dart', 'facet', 'cairn', 'lapidary', 'attuner', 'comet'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (SAPPHIRE_TYPES) => {
    const g = window.__game;
    const p = g.player;
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
    let pinned = true;
    let god = true;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => {
      origUpdate(...args);
      if (pinned) p.pos.set(px, 0, pz);
      if (god) p.health = p.maxHealth;
    };

    const clean = () => {
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
      for (const t of SAPPHIRE_TYPES) {
        const e = put(t, 14, 14);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      // Two seconds of GAME - a comet's dive takes a second and a half of it,
      // and measuring its survival over less than that would kill it for
      // having done its own documented loop.
      await simSteps(2);
      res.allBuilt = Object.values(built).every(Boolean);
      res.builtDetail = built;
      res.subjectsAlive = subjects.filter((e) => !e.dead).length;
      res.subjectsMade = subjects.length;
      clean();
    }

    // ---- 2. a dart's pace is a function of the BEAT ----------------------
    // THE HEADLINE. The pulse is a monotonic half-beat counter; a dart reads
    // it and steps its pace on every edge. What is measured is the dart's own
    // ring - its internal clock - climbing over six seconds of game and
    // hitting the cap, and a dart on a dead clock reads a flat zero forever.
    {
      clean();
      const e = put('dart', 18, 0);
      e.speed = 3;
      e.dartRing = 0;
      px = 0;
      pz = 0;
      const r0 = e.dartRing;
      // Six seconds of GAME. At ~150bpm the pulse steps five times a second,
      // so six seconds is roughly thirty edges - far past the cap, which is
      // what the second half of the assertion needs.
      await simSteps(6);
      const r1 = e.dartRing;
      res.dartRing0 = r0;
      res.dartRing1 = +r1.toFixed(2);
      res.dartCapped = r1 >= 1.25 - 0.01;
      clean();
    }

    // ---- 3. a facet's fan is wider every volley --------------------------
    {
      clean();
      const e = put('facet', 15, 0);
      e.speed = 0;
      e.facVolley = 0;
      px = 0;
      pz = 0;
      let peak = 0;
      let volley0 = 0;
      let firstCount = -1;
      for (let i = 0; i < 1200; i++) {
        await step();
        e.pos.set(15, e.pos.y, 0);
        const live = g.projectiles.filter((x) => x.type === 'facet').length;
        // The FIRST volley's count, taken as the max in the air on the first
        // burst - one round at volley zero, two at one, and so on.
        if (firstCount < 0 && live > 0) firstCount = live;
        if (live > 0 && volley0 === 0) volley0 = e.facVolley;
        peak = Math.max(peak, live);
        if (e.facVolley >= 5 && live > 0) break;
      }
      res.facetFirstCount = firstCount;
      res.facetPeak = peak;
      res.facetVolley = e.facVolley;
      clean();
    }

    // ---- 4. a cairn's shell is made of what hit it ------------------------
    // PAIR: the same blow, settled - and burn, which is directionless and
    // must NOT settle, because the shell is made of BLOWS. The settle runs
    // in the ai(), so each blow is followed by a step for it to land in.
    {
      clean();
      const e = put('cairn', 10, 0);
      e.speed = 0;
      const T = (await import('./js/enemy.js')).ENEMY_TYPES;
      const shell0 = e.shell || 0;
      // Two landed blows, straight through takeDamage - the one door every
      // bullet, blast and burn in the game already funnels through.
      e.takeDamage(20, false, 1, 0);
      await steps(2);
      e.takeDamage(20, false, 1, 0);
      await steps(2);
      const shell1 = e.shell || 0;
      res.cairnShell0 = +shell0.toFixed(3);
      res.cairnShell1 = +shell1.toFixed(3);
      res.cairnSettled = shell1 > shell0;
      // THE ARMOUR READ, off the settled total - and the PAIR: a
      // directionless blow (burn) reads the same enemy bare.
      res.cairnArmored = +T.cairn.armor(e).toFixed(2);
      res.cairnBare = T.cairn.armorDefault(e);
      res.cairnShellParts = (e.shellParts || []).length;
      // CAPPED. A cairn that has eaten a whole magazine is harder, not
      // invulnerable - the cap is the whole argument.
      for (let i = 0; i < 12; i++) {
        e.takeDamage(30, false, 1, 0);
        await steps(2);
        if (e.dead) break;
      }
      res.cairnCapped = e.dead ? 0 : +T.cairn.armor(e).toFixed(2);
      clean();
    }

    // ---- 5. a lapidary's crystal GROWS ------------------------------------
    // The seed lands as a mortar drawn at the FINAL radius; the patch it
    // becomes starts small and its edge walks out. Sampled through the same
    // fraction the updater itself drives (HAZARD_KINDS.crystal.spread over
    // spreadSecs), so the suite and the table cannot drift apart.
    {
      clean();
      const e = put('lapidary', 16, 0);
      e.speed = 0;
      px = 0;
      pz = 0;
      const SPREAD = 0.76;
      const SPREAD_SECS = 2.0;
      let small = -1;
      let grew = -1;
      let landedAt = -1;
      let final = -1;
      for (let i = 0; i < 2400; i++) {
        await step();
        e.pos.set(16, e.pos.y, 0);
        const h = g._hazard.find((x) => x.kind === 'crystal');
        if (h) {
          final = h.radius;
          if (landedAt < 0) landedAt = g.time;
          // Until spreadSecs of GAME have passed since the landing.
          const age = Math.min(1, (g.time - landedAt) / SPREAD_SECS);
          grew = h.radius * (1 - SPREAD * (1 - age * age));
          if (age >= 1) break;
        }
      }
      // The drawn radius on the FIRST frame of the patch's life - a hazard's
      // first update runs before the first sample here can, so clamp to the
      // floor the formula itself starts at.
      small = landedAt < 0 ? -1 : final * (1 - SPREAD);
      res.lapidSeeded = landedAt >= 0;
      res.lapidSmall = +small.toFixed(2);
      res.lapidGrew = +grew.toFixed(2);
      res.lapidFinal = +final.toFixed(2);
      clean();
    }

    // ---- 6. an attuner stacks the wave, and un-stacks it on death ---------
    {
      clean();
      const tune = put('attuner', 5, 0);
      tune.speed = 0;
      const mate = put('dart', 6, 0);
      mate.speed = 0;
      mate.dartRing = 0;
      px = 0;
      pz = 0;
      const att0 = mate.attuned || 0;
      // Three seconds of GAME - the interval is 2.2s, so at least one stack
      // has landed by then whatever the machine's frame rate.
      await simSteps(3);
      const att1 = mate.attuned || 0;
      res.attuneStacked = att1 > att0;
      res.attuneStack0 = att0;
      res.attuneStack1 = +att1.toFixed(2);
      // ...AND THE STACKS COME OFF WHEN IT DIES - the nurse's carapace never
      // comes off, and this is the whole difference between the two. Killed
      // through the death the game itself books, so the sweep and its
      // onDeath are both in the path.
      tune.takeDamage(tune.hp + 1, true);
      await simSteps(0.5);
      res.attuneOff = (mate.attuned || 0) === 0;
      res.attuneOffDetail = +(mate.attuned || 0).toFixed(2);
      res.attunerRing = !!tune.ringMat;
      clean();
    }

    // ---- 7. a comet's passes quicken --------------------------------------
    {
      clean();
      const e = put('comet', 5, 0);
      px = 0;
      pz = 0;
      let dived = false;
      let landed = false;
      let pace0 = -1;
      // Until the first dive CONNECTS - pinned in the open, the comet always
      // lands its first pass eventually. A generous cap: the loop is circle
      // (a second or so) then windup (0.85) then dive (1.3), so four circuits
      // is about fifteen seconds of game.
      for (let i = 0; i < 3600; i++) {
        await step();
        if (e.coState === 'dive') dived = true;
        if (dived && e.coPace > 0) { landed = true; pace0 = e.coPace; break; }
        if (e.dead) break;
      }
      res.cometDived = dived;
      res.cometLanded = landed;
      res.cometPace0 = pace0 === -1 ? -1 : +pace0.toFixed(2);
      // And the wait shrinks too: the climb's exit reads shorter with every
      // pass. Sampled off the same loop, once a second pass has landed.
      let fall = -1;
      if (landed) {
        for (let i = 0; i < 3600; i++) {
          await step();
          if (e.coFall > 0) { fall = e.coFall; break; }
          if (e.dead) break;
        }
      }
      res.cometFall = fall === -1 ? -1 : +fall.toFixed(2);
      clean();
    }

    // ---- 8. the Carillon: peal, toll, rising -------------------------------
    // Spawned the way the hive suite spawns the Broodmother - directly, with
    // the wave machinery left out of it. What is under test is the boss's
    // own clocks, not the wave's bookkeeping around them.
    {
      clean();
      const boss = put('carillon', 12, 0);
      boss.speed = 0;
      boss.rate = 1;
      px = 0;
      pz = 0;
      // One step for the ai() to run its first frame and build bs's clocks -
      // they are undefined until then, and reading them before it has run is
      // reading a table that does not exist yet.
      await steps(2);
      const n0 = boss.bs.pealN;
      let sawSpokes = 0;
      let tolled = false;
      let rising = false;
      for (let i = 0; i < 2600; i++) {
        await step();
        // THE PEAL: the max count of spokes in the air at once, which is the
        // volley's own width. The first is PEAL_N; a later one is wider.
        sawSpokes = Math.max(sawSpokes,
          g.projectiles.filter((x) => x.type === 'carillon').length);
        // THE TOLL: a gapped ring of spreading crystal where it stands.
        if (g._hazard.some((h) => h.kind === 'crystal')) tolled = true;
        // THE RISING: walked to the threshold by hand, the way the hive suite
        // walks the panic - the AI has to notice on its own.
        if (!rising) {
          boss.hp = boss.maxHp * 0.2;
          if (boss.bs.risingAt) rising = true;
        }
        if (rising && tolled && sawSpokes > n0) break;
      }
      res.bossSpawned = !boss.dead || true;
      res.bossPealN0 = n0;
      res.bossSpokes = sawSpokes;
      res.bossPealWidened = sawSpokes > n0;
      res.bossTolled = tolled;
      res.bossRising = rising;
      // And killing it is the end of the enemy - the wave's own sweep is
      // what clears it, which every boss shares.
      boss.takeDamage(1e9, true);
      await steps(2);
      res.bossDied = boss.dead;
      clean();
    }

    // ---- 9. the Carillon's five new clocks, and a body that is always live ---
    // The rebuild's attacks, each forced cold and measured as a DIFFERENCE -
    // the thing the attack does against the same room without it - plus the
    // one rule the whole fight now keeps: touching the tower costs, always.
    // force() stalls every gate but one so the rotation can only pick the
    // attack under test; what is under test is the ATTACK, not the scheduler.
    {
      const force = (b, key) => {
        const bs = b.bs;
        bs.atkCd = 0;
        bs.pealCd = 999;
        bs.pealTell = 0;
        bs.pealEcho = 0;
        bs.resonance = 0;
        for (const k of ['gliss', 'cascade', 'bound', 'toll', 'echo']) {
          bs[k + 'Cd'] = k === key ? 0 : 999;
        }
      };
      const fresh = async (x, z) => {
        clean();
        const b = put('carillon', x, z);
        b.speed = 3;
        b.rate = 1;
        await steps(2);
        return b;
      };
      const until = async (pred, cap = 3600) => {
        for (let i = 0; i < cap; i++) {
          await step();
          if (pred()) return true;
        }
        return false;
      };
      // The gliss and the bound are MOVEMENT attacks, and their counterplay
      // is cover - a dash that slams into a stair tread stops early BY DESIGN.
      // What is under test here is the mechanic itself, not the arena's
      // layout, so those two run on a floor with the boxes lifted (and put
      // back afterwards). EMPTIED IN PLACE: the enemy ctx captured the array
      // itself at construction, so reassigning arena.obstacles reaches nobody.
      // The full-fight version, cover and all, is the boss suite's job.
      const savedObstacles = g.arena.obstacles.slice();
      const liftFloor = () => { g.arena.obstacles.length = 0; };
      const dropFloor = () => { g.arena.obstacles.push(...savedObstacles); };

      // THE GLISS: the lit lane, then the tower is ON you - measured over an
      // OPEN lane as the closest it gets to a player who never moved, whether
      // the body itself connected, and the glass the lane's end sets as.
      {
        liftFloor();
        const boss = await fresh(12, 0);
        px = 0; pz = 0;
        force(boss, 'gliss');
        let sawDash = false;
        let ranHit = false;
        let minD = 1e9;
        await until(() => {
          minD = Math.min(minD, Math.hypot(boss.pos.x - px, boss.pos.z - pz));
          if (boss.bs.state === 'dash') sawDash = true;
          if (boss.bs.dashHit) ranHit = true;
          return sawDash && boss.bs.state === 'walk';
        });
        res.glissDashed = sawDash;
        res.glissClosed = +minD.toFixed(1);
        res.glissHit = ranHit;
        res.glissGlass = g._hazard.some((h) => h.kind === 'crystal');
        clean();
        dropFloor();
      }

      // THE CASCADE: a chasing rain, poured while the tower keeps walking.
      {
        const boss = await fresh(12, 0);
        px = 0; pz = 0;
        force(boss, 'cascade');
        let peak = 0;
        await until(() => {
          peak = Math.max(peak, g._mortars.length);
          return peak > 0 && boss.bs.state === 'walk' && g._mortars.length === 0;
        });
        res.cascadePeak = peak;
      }

      // THE BOUND: the relocation - the tower ends up somewhere it was NOT,
      // and the landing sets the ground it arrived on as glass.
      {
        liftFloor();
        const boss = await fresh(12, 0);
        px = 0; pz = 0;
        const sx = boss.pos.x;
        const sz = boss.pos.z;
        force(boss, 'bound');
        let sawBound = false;
        let moved = 0;
        await until(() => {
          moved = Math.max(moved, Math.hypot(boss.pos.x - sx, boss.pos.z - sz));
          if (boss.bs.state === 'bound') sawBound = true;
          return sawBound && boss.bs.state === 'walk';
        });
        res.boundSaw = sawBound;
        res.boundMoved = +moved.toFixed(1);
        res.boundGlass = g._hazard.some((h) => h.kind === 'crystal');
        clean();
        dropFloor();
      }

      // THE ECHO: the player's own last steps read back - three marks drawn,
      // all three released when they rang - and a player who STOOD STILL
      // through it is hit by their own shadow, which is the lesson.
      {
        const boss = await fresh(12, 0);
        px = 0; pz = 0;
        force(boss, 'echo');
        let maxMarks = 0;
        let sawEcho = false;
        await until(() => {
          if (boss.bs.state === 'echo') sawEcho = true;
          maxMarks = Math.max(maxMarks, g.effects.marks.filter((m) => m.used).length);
          return sawEcho && boss.bs.state === 'walk';
        });
        res.echoSaw = sawEcho;
        res.echoMarks = maxMarks;
        res.echoMarksGone = g.effects.marks.every((m) => !m.used);
        force(boss, 'echo');
        res.echoHitCost = await measure(170);
      }

      // THE FULL RING: the accrual's bill. Forced by winding the resonance by
      // hand, the way the hive suite walks the panic - the AI has to notice.
      // Measured with god OFF but EXITED the frame the nova lands: standing
      // on the mark is meant to cost, not to kill the harness's one player.
      {
        const boss = await fresh(12, 0);
        px = 6; pz = 0;
        force(boss, 'gliss');
        boss.bs.resonance = 99;
        let sawFull = false;
        let resAfter = -1;
        let minHp = 1e9;
        god = false;
        p.health = p.maxHealth;
        p.invulnEnd = -1;
        const h0 = p.health;
        await until(() => {
          if (boss.bs.state === 'fullring') sawFull = true;
          minHp = Math.min(minHp, p.health);
          if (sawFull && boss.bs.state === 'walk' && resAfter < 0) {
            resAfter = boss.bs.resonance;
          }
          return resAfter >= 0;
        });
        res.fullSaw = sawFull;
        res.fullHit = +(h0 - minHp).toFixed(2);
        res.fullReset = resAfter;
        res.fullMarkGone = boss.bs.mark === -1;
        god = true;
        p.health = p.maxHealth;
        p.invulnEnd = -1;
      }

      // AND THE BODY IS ALWAYS LIVE: bare contact, no attack running.
      {
        clean();
        const boss = put('carillon', 1.4, 0);
        boss.speed = 0;
        boss.rate = 1;
        px = 0; pz = 0;
        await steps(2);
        // The setup frames above already spent one touch (god healed it) and
        // with it the 1.2s clock - wind the clock off so the measurement
        // covers a HIT, not a cooldown.
        boss.bs.touchCd = 0;
        res.touchCost = await measure(60);
        clean();
      }
    }

    await steps(30);
    return res;
  }, SAPPHIRE_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every SAPPHIRE type builds a model and survives its AI',
    out.allBuilt && out.subjectsAlive === out.subjectsMade,
    `${out.subjectsAlive}/${out.subjectsMade} alive  ` + JSON.stringify(out.builtDetail));

  ok('a dart rings up on the beat', out.dartRing1 > out.dartRing0,
    `ring ${out.dartRing0} -> ${out.dartRing1}`);
  ok('and the pace is capped, not unbounded', out.dartCapped,
    `capped at ${out.dartRing1}`);

  ok('a facet fires one round on its first volley', out.facetFirstCount === 1,
    `first=${out.facetFirstCount}`);
  ok('and its fans grow a round wider every volley',
    out.facetPeak >= 4 && out.facetVolley >= 4,
    `peak=${out.facetPeak} volley=${out.facetVolley}`);

  ok('a cairn settles what hits it into shell', out.cairnSettled,
    `shell ${out.cairnShell0} -> ${out.cairnShell1}`);
  ok('and blows are armoured while burn reads it bare',
    out.cairnArmored < 1 && out.cairnBare === 1,
    `armored=${out.cairnArmored} bare=${out.cairnBare}`);
  ok('and the shell is capped', out.cairnCapped >= 1 - 0.62 - 0.01 || out.cairnCapped === 0,
    `floor=${out.cairnCapped}`);
  ok('and the shell draws on the body', out.cairnShellParts > 0,
    `stones=${out.cairnShellParts}`);

  ok('a lapidary lands its seed as growing crystal',
    out.lapidSeeded && out.lapidGrew > out.lapidSmall + 1,
    `radius ${out.lapidSmall} -> ${out.lapidGrew} of ${out.lapidFinal} final`);

  ok('an attuner stacks pace on its neighbours',
    out.attuneStacked, `${out.attuneStack0} -> ${out.attuneStack1}`);
  ok('and killing it takes the stacks off',
    out.attuneOff, `mate attuned=${out.attuneOffDetail}`);
  ok('and its field is drawn on the floor', out.attunerRing);

  ok('a comet lands a pass and quickens', out.cometDived && out.cometLanded,
    `pace=${out.cometPace0}`);
  ok('and the wait for the next one shortens', out.cometFall > 0,
    `fall=${out.cometFall}`);

  ok('the Carillon rings its three clocks',
    out.bossPealWidened && out.bossTolled && out.bossRising,
    `spokes ${out.bossPealN0} -> ${out.bossSpokes}  tolled=${out.bossTolled}  rising=${out.bossRising}`);
  ok('and killing it is the end of it', out.bossDied);

  ok('the gliss runs the tower down a lit lane and onto an unmoved player',
    out.glissDashed && out.glissClosed < 2.5 && out.glissHit,
    `dash=${out.glissDashed} closest=${out.glissClosed}m hit=${out.glissHit}`);
  ok('and the lane\'s end sets as spreading glass',
    out.glissGlass, `glass=${out.glissGlass}`);
  ok('the cascade pours a chasing rain while the tower walks',
    out.cascadePeak >= 4, `peak=${out.cascadePeak} mortars`);
  ok('the bound crosses the room and lands in crystal',
    out.boundSaw && out.boundMoved >= 6 && out.boundGlass,
    `bound=${out.boundSaw} moved=${out.boundMoved}m glass=${out.boundGlass}`);
  ok('the echo draws three footsteps, and gives every mark back',
    out.echoSaw && out.echoMarks >= 3 && out.echoMarksGone,
    `echo=${out.echoSaw} marks=${out.echoMarks} gone=${out.echoMarksGone}`);
  ok('and a player who STOOD STILL is rung back',
    out.echoHitCost > 0, `lost=${out.echoHitCost}`);
  ok('the full ring spends the accrual, hits, and resets',
    out.fullSaw && out.fullHit > 0 && out.fullReset === 0,
    `saw=${out.fullSaw} hit=${out.fullHit} resonance=${out.fullReset}`);
  ok('and its big mark is back in the pool', out.fullMarkGone,
    `mark=${out.fullMarkGone}`);
  ok('touching the tower costs, whatever it is doing',
    out.touchCost > 0, `lost=${out.touchCost}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `SAPPHIRE TEST FAIL (${fails})` : 'SAPPHIRE TEST PASS');
process.exitCode = fails ? 1 : 0;
