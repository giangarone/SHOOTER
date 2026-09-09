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
//     palecrown  a shell that takes NOTHING until three anchors are broken
//
// WHAT IS ASSERTED
//   1. All six build and survive their AI.
//   2. The shard's burst is conditional on the player being chilled.
//   3. The glacier's crust reduces damage, comes off at the threshold, and
//      leaves frost behind exactly once.
//   4. The hailer's cluster lands as a RING with a gap, not a fan or a blob.
//   5. A hoarfrost weakens the player in its field, and stops when it dies.
//   6. A sleet parks overhead and drips where the player is standing.
//   7. The Pale Crown shells, is untouchable while shelled, puts three anchors
//      in the floor, and drops the shell when they are broken.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8219;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ['server.js', String(PORT)], { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const RIME_TYPES = ['rime', 'shard', 'glacier', 'hailer', 'hoarfrost', 'sleet'];

try {
  browser = await puppeteer.launch({
    headless: true, executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(`http://127.0.0.1:${PORT}/?autotest`, { waitUntil: 'load', timeout: 30000 });
  await page.waitForFunction('window.__game && window.__game.player', { timeout: 30000 });

  const out = await page.evaluate(async (RIME_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const TYPES = (await import('./js/enemy.js')).ENEMY_TYPES;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
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
      await steps(120);
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
        let sinceFirst = -1;
        let prev = g.projectiles.length;
        for (let i = 0; i < 1400; i++) {
          if (chilled) p.applyStatus('slowness', 5);
          await step();
          const now = g.projectiles.length;
          if (now > prev) {
            seen += now - prev;
            if (sinceFirst < 0) sinceFirst = 0;
          }
          prev = now;
          // Once the first round is away, watch a window wide enough to
          // contain a three-round burst and narrow enough to exclude the next
          // volley's cooldown.
          if (sinceFirst >= 0) {
            sinceFirst++;
            if (sinceFirst > 70) break;
          }
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
      await steps(60);
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
      await steps(90);
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
    {
      clean();
      g.setTheme('rime');
      const e = put('palecrown', 12, 0);
      await steps(30);
      const bs = e.bs;
      res.crownShelled = bs.shelled;
      res.crownAnchors = g.enemies.filter((x) => x.type === 'anchor' && !x.dead).length;
      res.crownPlatesUp = e.shellParts.filter((m) => m.visible).length;

      // NOTHING gets through the shell. Read through the type's own armor(),
      // which is what takeDamage calls.
      const armorNow = () => TYPES.palecrown.armor(e);
      res.crownArmorShelled = armorNow();
      const hpA = e.hp;
      e.takeDamage(500, false, 0, 0);
      res.crownTookNothing = e.hp === hpA;

      // Break the anchors and the shell comes down.
      for (const x of g.enemies) {
        if (x.type === 'anchor') x.dead = true;
      }
      for (let i = 0; i < 200 && bs.shelled; i++) await step();
      res.crownUnshelled = !bs.shelled;
      res.crownPlatesGone = e.shellParts.every((m) => !m.visible);
      res.crownArmorOpen = armorNow();
      const hpB = e.hp;
      e.takeDamage(100, false, 0, 0);
      res.crownTakesDamage = e.hp < hpB;
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

  ok('the Pale Crown opens shelled', out.crownShelled && out.crownPlatesUp > 0);
  ok('and puts three anchors in the floor', out.crownAnchors === 3, `n=${out.crownAnchors}`);
  ok('the shell takes nothing at all',
    out.crownArmorShelled === 0 && out.crownTookNothing, `armor=${out.crownArmorShelled}`);
  ok('breaking the anchors drops the shell',
    out.crownUnshelled && out.crownPlatesGone);
  ok('and then it can be hurt',
    out.crownArmorOpen === 1 && out.crownTakesDamage, `armor=${out.crownArmorOpen}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `RIME TEST FAIL (${fails})` : 'RIME TEST PASS');
process.exitCode = fails ? 1 : 0;
