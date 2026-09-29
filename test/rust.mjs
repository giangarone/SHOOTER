// RUST, end to end - and its boss, COLOSSUS, rebuilt as the walking scrapyard.
//
// WHY THIS SUITE EXISTS
//   The old Colossus was a lane and a metronome: dodge the charge, shoot the
//   vent, repeat. The rework keeps the chest core's rhythm as the damage gate
//   and rebuilds everything around it - five new lines of attack, a scheduler
//   that fires one every couple of seconds, and a boss that circles instead
//   of camping. Every assertion here is on the NEW fight:
//
//     contact        touching the boss costs, whatever it is doing
//     movement       it roams and circles between its bands, measurably
//     cadence        the scheduler lands an attack every couple of seconds
//     rivet fan      ducts glow, then bursts sweep projectiles across the aim
//     shell barrage  cast on the move: a cross of telegraphed mortars, and the
//                    boss never stops walking for it
//     wrecking arm   tracks slowly, disc telegraph, swings the front sector
//     slag nova      phase-2 crowd answer: rooted, ring of molten slag
//     grinder rush   bends mid-charge, burns the ground it covered, and still
//                    knocks itself out on a wall
//     overdrive      the last third of the bar enrages it
//     pool hygiene   a boss killed mid-telegraph hands every mark back
//
// All of it is driven on FIXED TICKS through g._updateEnemies(dt), like
// boss.mjs's schism block - game time is the only clock the AI reads, so the
// assertions below cannot flake with the speed of the machine that runs them.
// Each forced attack is pinned by its own cooldown (`bs.cd = 0` with every
// other attack's cd held at 999 makes the scheduler's pick deterministic).
import { bootPage, launchBrowser, sleep, startServer } from './harness.mjs';

const PORT = 8255;
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const RUST_TYPES = ['chaser', 'shooter', 'tank', 'bomber', 'conduit', 'harrier'];

try {
  browser = await launchBrowser();
  const { page, errors } = await bootPage(browser, PORT);

  const out = await page.evaluate(async (RUST_TYPES) => {
    const THREE = await import('three');
    const { Enemy, ENEMY_TYPES } = await import('./js/enemy.js');
    const g = window.__game;
    const p = g.player;
    const DT = 1 / 60;
    // Fixed game-time ticks. Synchronous, so no real frame can interleave with
    // a measurement.
    const run = (seconds, fn) => {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        g.time += DT;
        if (fn) fn(i);
        g._updateEnemies(DT);
      }
    };
    const marksUsed = () => g.effects.marks.filter((m) => m.used).length;
    const res = {};

    g.autoTest = false;
    g.input.forward = g.input.back = g.input.left = g.input.right = false;
    g.input.shoot = g.input.shootFresh = g.input.jump = false;
    g.input.sprint = g.input.crouch = false;
    g.input.moveF = g.input.moveS = 0;

    const clean = () => {
      g.waveState = 'active';
      g.queue.length = 0;
      g.queue.push('chaser');
      g.spawnTimer = 1e6;
      g._clearEntities();
      g._clearHazards();
      g._mortars.forEach((m) => g.effects.markRelease(m.mark));
      g._mortars.length = 0;
      g.projectiles.length = 0;
      p.clearStatuses();
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      p.wardReady = false;
      p.mods.dodgeChance = 0;
    };

    const spawnBoss = () => {
      g._cfg = { boss: true, bossKey: 'colossus', maxAdds: 0, addInterval: 999 };
      g.wave = 5;
      g._spawnBoss('colossus');
      return g.bossFight.parts[0];
    };
    // Every attack's own cooldown held off but one, plus the shared scheduler's
    // clock at zero: the scheduler's next pick is deterministic.
    const forceOnly = (b, keep) => {
      const bs = b.bs;
      bs.cd = 0;
      for (const k of ['rushCd', 'fanCd', 'arcCd', 'novaCd', 'lobCd', 'shellCd', 'slamCd']) {
        bs[k] = 999;
      }
      if (keep) bs[keep] = 0;
      bs.ventT = 999;    // the core stays shut: no vent fire in the counts below
      bs.weakOpen = false;
    };

    // ---- 0. an empty arena costs nothing ---------------------------------
    {
      clean();
      p.pos.set(0, 0, 0);
      const h0 = p.health;
      run(1.5);
      res.emptyCost = +(h0 - p.health).toFixed(2);
      clean();
    }

    // ---- 1. the roster builds and survives its AI -------------------------
    {
      clean();
      const built = {};
      const subjects = [];
      for (const t of [...RUST_TYPES, 'turret']) {
        g.spawnEnemy(t);
        const e = g.enemies[g.enemies.length - 1];
        e.pos.set(14, e.pos.y, 14);
        subjects.push(e);
        built[t] = !!(e.group && e.group.children.length > 2);
      }
      run(2);
      res.rosterBuilt = Object.values(built).every(Boolean);
      res.rosterAlive = subjects.filter((e) => !e.dead).length === subjects.length;
      clean();
    }

    // ---- 2. the boss: it moves, it presses, it attacks often ---------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 12);
      // No turrets in this window: movement and cadence are what is measured.
      const startX = b.pos.x;
      const startZ = b.pos.z;
      let path = 0;
      let lastX = startX;
      let lastZ = startZ;
      let prev = 'walk';
      const entered = {};
      run(20, () => {
        path += Math.hypot(b.pos.x - lastX, b.pos.z - lastZ);
        lastX = b.pos.x;
        lastZ = b.pos.z;
        if (b.bs.state !== prev) {
          entered[b.bs.state] = (entered[b.bs.state] || 0) + 1;
          prev = b.bs.state;
        }
      });
      res.pathTravelled = +path.toFixed(1);
      res.attacksEntered = ['tele', 'fan', 'arc', 'nova']
        .reduce((s, k) => s + (entered[k] || 0), 0);
      res.distinctAttacks = ['tele', 'fan', 'arc', 'nova']
        .filter((k) => entered[k]).length;
      res.bossAlive = !b.dead;
      clean();
      g.bossFight = null;
    }

    // ---- 3. touching it costs, whatever it is doing -----------------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 30);
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      // Walk the boss's world forward a tick so its ai has initialised, then
      // park the player ON the hull and hold them there. No slam, no
      // scheduler: the TOUCH is the only thing being measured.
      run(0.1);
      forceOnly(b, null);
      b.bs.cd = 999;
      const h0 = p.health;
      run(2.5, () => p.pos.set(b.pos.x + b.radius + 0.3, 0, b.pos.z));
      res.touchLost = +(h0 - p.health).toFixed(1);
      // Four touches in 2.5s would be a machine gun: the cooldown is the cap.
      res.touchCapped = res.touchLost <= 100;
      clean();
      g.bossFight = null;
    }

    // ---- 4. the grinder rush bends, burns and can still be wall-baited -----
    {
      clean();
      const b = spawnBoss();
      b.pos.set(-12, 0, 0);
      p.pos.set(12, 0, 0);
      p.health = p.maxHealth;
      run(0.1);
      forceOnly(b, 'rushCd');
      let sawTele = false;
      let sawMark = false;
      let sawDash = false;
      let dashFrom = null;
      let dashTravel = 0;
      let corrections = 0;
      run(2.2, () => {
        p.pos.set(12, 0, 0);
        if (b.bs.state === 'tele') {
          sawTele = true;
          if (marksUsed() > 0) sawMark = true;
        }
        if (b.bs.state === 'dash') {
          if (!sawDash) dashFrom = { x: b.pos.x, z: b.pos.z };
          sawDash = true;
          corrections = Math.max(corrections, b.bs.correctIdx);
          if (dashFrom) dashTravel = Math.hypot(b.pos.x - dashFrom.x, b.pos.z - dashFrom.z);
        }
      });
      const treadPatches = g._hazard.filter((h) => h.kind === 'lava').length;
      res.rush = {
        sawTele, sawMark, sawDash,
        travel: +dashTravel.toFixed(1),
        corrections,
        treadPatches,
        endedIn: b.bs.state,
        markFreed: b.bs.mark < 0,
      };
      // Let whatever it ended in settle, then prove the core opened for the
      // knockdown if it slammed.
      if (b.bs.state === 'stagger') {
        res.rush.staggerArmor = ENEMY_TYPES.colossus.armor(b);
      }
      clean();
      g.bossFight = null;
    }

    // ---- 5. the rush run-over IS its own hit -------------------------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(30, 0, 0);
      run(0.1);
      // Drive it straight: dash state by hand, player parked just ahead, so
      // the run-over check fires on the first dash frame regardless of cover.
      b.bs.state = 'dash';
      b.bs.t = 2;
      b.bs.correctIdx = 99;
      b.bs.trailD = 0;
      b.bs.fxT = 0;
      b.bs.dirX = 1;
      b.bs.dirZ = 0;
      b.bs.mark = -1;
      p.health = p.maxHealth;
      p.invulnEnd = -1;
      const h0 = p.health;
      let staggered = false;
      let coreOpenInStagger = false;
      run(1.5, () => {
        p.pos.set(b.pos.x + b.radius + 0.5, 0, b.pos.z);
        if (b.bs.state === 'stagger') {
          staggered = true;
          if (ENEMY_TYPES.colossus.armor(b) === 1) coreOpenInStagger = true;
        }
      });
      res.rushHit = +(h0 - p.health).toFixed(1);
      res.rushStaggered = staggered;
      res.rushCoreOpen = coreOpenInStagger;
      clean();
      g.bossFight = null;
    }

    // ---- 6. the rivet fan winds up glowing and sweeps a burst --------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 10);
      p.health = p.maxHealth;
      run(0.1);
      forceOnly(b, 'fanCd');
      let glowSeen = 0;
      let bearings = [];
      run(3.2, () => {
        p.pos.set(0, 0, 10);
        if (b.bs.state === 'fan') {
          glowSeen = Math.max(glowSeen, b.bs.ductGlow);
          for (const pr of g.projectiles) {
            if (pr.type === 'colossus') {
              bearings.push(Math.atan2(pr.vel.z, pr.vel.x));
            }
          }
        }
      });
      const fanShots = bearings.length;
      let spread = 0;
      if (bearings.length > 1) {
        spread = Math.max(...bearings) - Math.min(...bearings);
      }
      res.fan = {
        fired: fanShots,
        sweep: +spread.toFixed(2),
        glowed: +glowSeen.toFixed(2),
        done: b.bs.state === 'walk',
      };
      clean();
      g.bossFight = null;
    }

    // ---- 7. the wrecking arm takes its whole front away --------------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 7);
      p.health = p.maxHealth;
      run(0.1);
      forceOnly(b, 'arcCd');
      let armWound = 0;
      let sawArc = false;
      const h0 = p.health;
      run(1.4, () => {
        p.pos.set(b.pos.x, 0, b.pos.z + 5.5);
        if (b.bs.state === 'arc') {
          sawArc = true;
          armWound = Math.max(armWound, b.bs.arm.rotation.y);
        }
      });
      // The sparks ride the sweep line out at the end - counted as they fly.
      res.arc = {
        sawArc,
        armWound: +armWound.toFixed(2),
        hit: +(h0 - p.health).toFixed(1),
        sparks: g.projectiles.filter((x) => x.type === 'colossus').length,
        backIn: b.bs.state,
      };
      // Same windup, player parked out of the disc: no swing connects.
      clean();
      const b2 = spawnBoss();
      b2.pos.set(0, 0, 0);
      p.pos.set(0, 0, 30);
      p.health = p.maxHealth;
      run(0.1);
      forceOnly(b2, 'arcCd');
      b2.bs.arcCd = 0;
      b2.bs.cd = 0;
      run(1.0, () => p.pos.set(b2.pos.x + 11, 0, b2.pos.z));
      const hSaf = p.health;
      run(0.8, () => p.pos.set(b2.pos.x + 11, 0, b2.pos.z));
      res.arcOutsideCost = +(hSaf - p.health).toFixed(1);
      clean();
      g.bossFight = null;
    }

    // ---- 8. phase two unlocks the slag nova --------------------------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 8);
      p.health = p.maxHealth;
      run(0.1);
      b.hp = b.maxHp * 0.5;
      forceOnly(b, 'novaCd');
      let sawNova = false;
      let novaMark = false;
      let movedDuringNova = 0;
      let novaFrom = null;
      run(2.4, () => {
        p.pos.set(0, 0, 8);
        if (b.bs.state === 'nova') {
          if (!sawNova) novaFrom = { x: b.pos.x, z: b.pos.z };
          sawNova = true;
          if (marksUsed() > 0) novaMark = true;
          if (novaFrom) {
            movedDuringNova += Math.hypot(b.pos.x - novaFrom.x, b.pos.z - novaFrom.z);
            novaFrom = { x: b.pos.x, z: b.pos.z };
          }
        }
      });
      res.nova = {
        sawNova,
        novaMark,
        rooted: +movedDuringNova.toFixed(2),
        patches: g._hazard.filter((h) => h.kind === 'lava').length,
        done: b.bs.state === 'walk',
      };
      clean();
      g.bossFight = null;
    }

    // ---- 9. the shell barrage is cast ON THE MOVE --------------------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 14);
      p.health = p.maxHealth;
      run(0.1);
      forceOnly(b, null);
      b.bs.cd = 999;               // the scheduler stays out of this window
      b.bs.shellCd = 0;
      const mortars0 = g._mortars.length;
      let movedAfterCast = 0;
      let castAt = null;
      run(0.8, () => {
        p.pos.set(0, 0, 14);
        if (g._mortars.length > mortars0 && !castAt) castAt = { x: b.pos.x, z: b.pos.z };
        if (castAt) movedAfterCast += Math.hypot(b.pos.x - castAt.x, b.pos.z - castAt.z);
      });
      res.shells = {
        cast: g._mortars.length >= mortars0 + 5,
        peak: g._mortars.length - mortars0,
        keptWalking: +movedAfterCast.toFixed(1),
      };
      // And the cross goes off: the player stayed in its centre for science.
      // _updateMortars is the main loop's job, not _updateEnemies', so the
      // driver ticks it here or the shells would hang in the air forever.
      p.invulnEnd = -1;
      const h0 = p.health;
      run(2.8, () => {
        p.pos.set(0, 0, 14);
        g._updateMortars(DT);
      });
      res.shellBlast = +(h0 - p.health).toFixed(1);
      res.shellMarksFreed = marksUsed() === 0;
      clean();
      g.bossFight = null;
    }

    // ---- 10. the last third of the bar enrages it ---------------------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 10);
      p.pos.set(0, 0, 30);
      run(0.1);
      b.hp = b.maxHp * 0.3;
      run(0.3);
      res.enrage = {
        phase: b.bs.phase,
        flagged: !!b.bs.enraged,
        room: g.bossFight ? g.bossFight.state : 'gone',
      };
      clean();
      g.bossFight = null;
    }

    // ---- 11. a turret throw still happens, and never a fourth ---------------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 18);
      p.health = p.maxHealth;
      run(0.1);
      forceOnly(b, null);
      b.bs.cd = 999;
      b.bs.shellCd = 999;
      b.bs.lobCd = 0;
      run(1.2, () => p.pos.set(0, 0, 18));
      res.turretThrown = g.enemies.filter((x) => x.type === 'turret' && !x.dead).length;
      // Two more appear by other means; the boss must not loft a fourth.
      g.spawnEnemy('turret');
      g.spawnEnemy('turret');
      b.bs.lobCd = 0;
      b.bs.state = 'walk';
      run(1.2, () => p.pos.set(0, 0, 18));
      res.turretCount = g.enemies.filter((x) => x.type === 'turret' && !x.dead).length;
      clean();
      g.bossFight = null;
    }

    // ---- 12. killed mid-telegraph: every mark goes back to the pool ---------
    {
      clean();
      const b = spawnBoss();
      b.pos.set(0, 0, 0);
      p.pos.set(0, 0, 15);
      run(0.1);
      forceOnly(b, 'rushCd');
      run(0.5, () => p.pos.set(0, 0, 15));
      res.midTeleMark = marksUsed();
      b.dead = true;
      run(0.2);
      g._clearHazards();
      res.marksAfterDeath = marksUsed();
      clean();
      g.bossFight = null;
    }

    return res;
  }, RUST_TYPES);

  ok('an empty arena costs nothing', out.emptyCost === 0, `lost=${out.emptyCost}`);
  ok('every RUST type builds a model and survives its AI',
    out.rosterBuilt && out.rosterAlive);

  ok('the boss ROAMS: it covers ground between its bands', out.pathTravelled > 15,
    `path=${out.pathTravelled}m in 20s`);
  ok('the scheduler lands attacks constantly', out.attacksEntered >= 3,
    `attacks=${out.attacksEntered} in 20s`);
  ok('...and says different sentences, not one on repeat', out.distinctAttacks >= 2,
    `distinct=${out.distinctAttacks}`);
  ok('the fight survives all of it', out.bossAlive);

  ok('standing on the boss costs, every time', out.touchLost > 0,
    `lost=${out.touchLost}`);
  ok('...and the touch is rate-limited, not a machine gun', out.touchCapped);

  ok('the rush telegraphs its lane first', out.rush.sawTele && out.rush.sawMark);
  ok('the rush then RUNS, fast', out.rush.sawDash && out.rush.travel > 12,
    `travelled=${out.rush.travel}m`);
  ok('...bends toward the player mid-charge', out.rush.corrections >= 1,
    `corrections=${out.rush.corrections}`);
  ok('...and grinds burning treads into the floor it covered', out.rush.treadPatches >= 3,
    `patches=${out.rush.treadPatches}`);
  ok('...and releases its lane when it commits', out.rush.markFreed);
  ok('the run-over is a hit and a knockdown, never both taxes at once',
    out.rushHit > 25 && out.rushStaggered,
    `hit=${out.rushHit} staggered=${out.rushStaggered}`);
  ok('the knockdown opens the core', out.rushCoreOpen);

  ok('the rivet fan telegraphs with its ducts, then fires',
    out.fan.glowed > 0.5 && out.fan.fired >= 9,
    `ductGlow=${out.fan.glowed} shots=${out.fan.fired}`);
  ok('...and sweeps them across the aim rather than in a line', out.fan.sweep > 0.15,
    `spread=${out.fan.sweep}rad`);
  ok('...and stands down when it has said its piece', out.fan.done);

  ok('the wrecking arm draws back where you can see it', out.arc.sawArc && out.arc.armWound > 0.5,
    `arm=${out.arc.armWound}rad`);
  ok('...and takes the front sector away', out.arc.hit > 10 && out.arc.hit <= 40.5,
    `hit=${out.arc.hit}`);
  ok('...throws sparks downrange at the end of it', out.arc.sparks >= 3,
    `sparks=${out.arc.sparks}`);
  ok('...and is honestly dodged by leaving the disc', out.arcOutsideCost === 0,
    `cost=${out.arcOutsideCost}`);

  ok('phase two plants the boss and shows a ring', out.nova.sawNova && out.nova.novaMark,
    `rooted-move=${out.nova.rooted}m`);
  ok('...and the ring it blows is molten slag', out.nova.patches >= 6,
    `patches=${out.nova.patches}`);
  ok('...having stayed planted for the whole climb', out.nova.rooted < 0.5);

  ok('the barrage casts without the boss breaking stride', out.shells.cast && out.shells.keptWalking > 0.5,
    `walked=${out.shells.keptWalking}m after the toss`);
  ok('...and the telegraphed cross detonates on whoever stayed in it', out.shellBlast > 0,
    `blast=${out.shellBlast}`);
  ok('...with every mortar ring handed back afterwards', out.shellMarksFreed);

  ok('the last third of the bar enrages it',
    out.enrage.phase === 3 && out.enrage.flagged && out.enrage.room === 'enraged',
    `phase=${out.enrage.phase} room=${out.enrage.room}`);

  ok('it still throws turrets', out.turretThrown >= 1, `thrown=${out.turretThrown}`);
  ok('...and never a fourth', out.turretCount <= 3, `live=${out.turretCount}`);

  ok('a boss killed mid-telegraph returns every mark',
    out.midTeleMark > 0 && out.marksAfterDeath === 0,
    `held=${out.midTeleMark} after=${out.marksAfterDeath}`);

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? `RUST TEST FAIL (${fails})` : 'RUST TEST PASS');
process.exitCode = fails ? 1 : 0;
