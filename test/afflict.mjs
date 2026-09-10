// The seven enemies that put a STATUS on the player, end to end.
//
// WHY THIS EXISTS
//   Every one of these types is a stat block plus a hook somewhere else: a
//   `hitStatus` read by landHit, an `onDeath` read by the kill sweep, a
//   HAZARD_KINDS row read by _updateHazard, a ctx callback that has to be
//   present on the enemy context. Each of those is a separate place the wiring
//   can be cut without a single error being thrown - the enemy still walks, it
//   still hits, and the status simply never arrives. Nothing else in the suite
//   would notice.
//
// WHAT IS ASSERTED
//   1. Every afflictor actually applies its own status to the player.
//   2. The ground they leave applies its own, and keeps applying it for a
//      moment after the player steps off.
//   3. Magma's lava - which predates all of this - now burns.
//   4. Every new type builds a model and survives a frame of AI without
//      throwing, which is the one failure a wave-30 run would find first.
import puppeteer from 'puppeteer-core';
import { CHROME, startServer } from './harness.mjs';

const PORT = 8215;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = startServer(PORT, { stdio: 'inherit' });
await sleep(800);

let browser;
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) fails++;
};

const NEW_TYPES = ['cinder', 'rime', 'husk', 'vitriol', 'howler', 'hexer', 'shade'];

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

  const out = await page.evaluate(async (NEW_TYPES) => {
    const g = window.__game;
    const p = g.player;
    const step = () => new Promise((r) => requestAnimationFrame(r));
    const steps = async (n) => { for (let i = 0; i < n; i++) await step(); };
    const res = {};

    // The bot fights, which would kill every subject before it acted. The
    // player is pinned instead - moved from inside player.update(), the one
    // place that is guaranteed to run before the enemies read the position in
    // the same frame - exactly as test/melee.mjs does it.
    g.autoTest = false;
    g.input.shoot = false;
    g.input.shootFresh = false;
    let px = 0;
    let pz = 0;
    const origUpdate = p.update.bind(p);
    p.update = (...args) => { origUpdate(...args); p.pos.set(px, 0, pz); };

    const clean = () => {
      // THE WAVE IS PARKED, and it has to be. Clearing a wave wipes every
      // lingering zone in the arena - correct in the game, and fatal here: the
      // husk below is the only enemy alive, so killing it completes the wave
      // and the cloud it just left is swept up in the same frame. Every
      // subject in this file is spawned by hand, so no wave has any business
      // running while it is measured.
      g.waveState = 'idle';
      g._clearEntities();
      p.clearStatuses();
      p.health = 1e6;
      p.invulnEnd = -1;
      p.wardReady = false;
      p.mods.dodgeChance = 0;
      p.mods.poisonImmune = 0;
    };

    // Puts one enemy of `type` in the arena and hands it back.
    const put = (type, x, z) => {
      g.spawnEnemy(type);
      const e = g.enemies[g.enemies.length - 1];
      e.pos.set(x, e.pos.y, z);
      e.status.freeze = 0;
      e.status.fear = 0;
      return e;
    };

    // ---- 1. every type builds and runs ------------------------------------
    // A model that throws in build() takes the whole frame with it, and an ai
    // that throws stops every enemy after it in the list.
    res.built = {};
    for (const t of NEW_TYPES) {
      clean();
      px = 0; pz = 0;
      const before = g.enemies.length;
      const e = put(t, 6, 6);
      await steps(12);
      res.built[t] = {
        spawned: g.enemies.length > before,
        parts: e.group.children.length,
        moved: !e.dead,
      };
    }

    // ---- 2. contact afflictors -------------------------------------------
    // Held in contact until the melee cycle lands one blow.
    const contact = async (type, secs = 4) => {
      clean();
      px = 0; pz = 0;
      const e = put(type, 0, 0);
      e.attackCd = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < secs * 1000) {
        e.pos.set(px + 0.6, e.pos.y, pz);
        await step();
      }
      return { ...p.status };
    };
    res.cinder = await contact('cinder');

    // ---- 3. the ground ----------------------------------------------------
    // A rime lays frost as it walks. The player is parked on top of it and
    // then walked off, which is the half that matters: the chill has to
    // survive leaving the patch.
    clean();
    px = 0; pz = 0;
    const rime = put('rime', 3, 0);
    for (let i = 0; i < 90; i++) {
      rime.pos.set(px + 1.2, rime.pos.y, pz);
      await step();
    }
    res.frostPatches = g._hazard.filter((h) => h.kind === 'frost').length;
    res.chilledOnIce = p.status.slowness;
    g._clearEntities();
    // Walk clear of every patch and let a moment pass. Still chilled.
    px = 18; pz = 18;
    await steps(20);
    res.chilledOffIce = p.status.slowness;

    // Magma's lava, which predates the status system.
    clean();
    px = 0; pz = 0;
    const magma = put('magma', 3, 0);
    for (let i = 0; i < 90; i++) {
      magma.pos.set(px + 1.0, magma.pos.y, pz);
      await step();
    }
    res.lavaPatches = g._hazard.filter((h) => h.kind === 'lava').length;
    res.burningOnLava = p.status.fire;

    // ---- 4. a husk bursts where it dies -----------------------------------
    clean();
    px = 0; pz = 0;
    const husk = put('husk', 4, 0);
    husk.hp = 0;
    husk.dead = true;
    await steps(4);
    res.huskCloud = g._hazard.filter((h) => h.kind === 'gas').length;
    res.huskCloudHasCloud = g._hazard.some((h) => h.kind === 'gas' && h.cloud >= 0);
    // Stand in it.
    const cloud = g._hazard.find((h) => h.kind === 'gas');
    if (cloud) { px = cloud.x; pz = cloud.z; }
    await steps(10);
    res.poisonedInCloud = p.status.poison;

    // ---- 5. a vitriol throws one ------------------------------------------
    clean();
    px = 0; pz = 0;
    const vit = put('vitriol', 10, 0);
    vit.attackCd = 0;
    let sawSpit = false;
    for (let i = 0; i < 240; i++) {
      vit.attackCd = Math.min(vit.attackCd, 0.1);
      if (g.projectiles.some((q) => q.kind === 'gas')) sawSpit = true;
      if (g._hazard.some((h) => h.kind === 'gas')) break;
      await step();
    }
    res.vitriolSpit = sawSpit;
    res.vitriolCloud = g._hazard.filter((h) => h.kind === 'gas').length;

    // ---- 6. the two casters ------------------------------------------------
    clean();
    px = 0; pz = 0;
    const howler = put('howler', 4, 0);
    howler.hT = 0;
    for (let i = 0; i < 400; i++) {
      howler.pos.set(4, howler.pos.y, 0);
      if (p.status.fear > 0) break;
      await step();
    }
    res.feared = p.status.fear;

    clean();
    px = 0; pz = 0;
    const hexer = put('hexer', 12, 0);
    hexer.xT = 0;
    for (let i = 0; i < 400; i++) {
      hexer.pos.set(12, hexer.pos.y, 0);
      if (p.status.curse > 0) break;
      await step();
    }
    res.cursed = p.status.curse;

    // ---- 7. the shade's dive ----------------------------------------------
    clean();
    px = 0; pz = 0;
    const shade = put('shade', 3, 0);
    for (let i = 0; i < 900; i++) {
      if (p.status.fear > 0) break;
      await step();
    }
    res.shadeFeared = p.status.fear;

    clean();
    return res;
  }, NEW_TYPES);

  for (const t of NEW_TYPES) {
    const b = out.built[t];
    ok(`${t} spawns with a model`, b.spawned && b.parts > 3, `${b.parts} parts`);
    ok(`${t} survives its own AI`, b.moved === true);
  }

  ok('a cinder sets the player alight', out.cinder.fire > 0, JSON.stringify(out.cinder));
  ok('a rime freezes the floor', out.frostPatches > 0, String(out.frostPatches));
  ok('and standing on it chills you', out.chilledOnIce > 0, String(out.chilledOnIce));
  ok('and the chill survives leaving it', out.chilledOffIce > 0, String(out.chilledOffIce));
  ok('a magma lays lava', out.lavaPatches > 0, String(out.lavaPatches));
  ok('and standing in it burns you', out.burningOnLava > 0, String(out.burningOnLava));
  ok('a husk bursts into gas', out.huskCloud > 0, String(out.huskCloud));
  ok('the gas is drawn as a cloud', out.huskCloudHasCloud === true);
  ok('and standing in it poisons you', out.poisonedInCloud > 0, String(out.poisonedInCloud));
  ok('a vitriol throws a canister', out.vitriolSpit === true);
  ok('which lands as a cloud', out.vitriolCloud > 0, String(out.vitriolCloud));
  ok('a howler takes the trigger', out.feared > 0, String(out.feared));
  ok('a hexer lands its curse', out.cursed > 0, String(out.cursed));
  ok('a shade fears on its dive', out.shadeFeared > 0, String(out.shadeFeared));

  ok('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? 'AFFLICT TEST FAIL' : 'AFFLICT TEST PASS');
process.exit(fails ? 1 : 0);
