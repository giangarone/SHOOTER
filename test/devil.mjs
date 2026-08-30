// Focused check of the Devil Deals flow, driven through window.__game.
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const PORT = 8203;
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
  await sleep(2500);

  const r = await page.evaluate(() => {
    const g = window.__game;
    const out = {};
    const P = g.player;
    const UP = g.__upgradesForTest;

    // --- clean wave: the Devil is certain ---
    g.waveDamageTaken = 0;
    g.totemArea.dismiss();
    g.devilArea.dismiss();
    g._presentTotems();
    g._presentDevil();
    out.devilAfterClean = g.devilArea.active;
    out.dealCount = g.devilArea.deals.filter((d) => d.state !== 'hidden').length;
    out.allPriced = g.devilArea.deals.every((d) => d.state === 'hidden' || d.offer.cost > 0);
    out.totemArm = Math.max(...g.totemArea.totems.map((t) => t.armT));

    // --- buying one costs exactly its price ---
    const deal = g.devilArea.deals.find((d) => d.state !== 'hidden' && d.enabled);
    const before = P.maxHealth;
    const cost = deal.offer.cost;
    deal.armT = 0;
    deal.state = 'up';
    g._claimDeal(deal);
    out.paid = before - P.maxHealth === cost;
    out.owned = (P.upgrades[deal.offer.id] || 0) === 1;
    out.healthClamped = P.health <= P.maxHealth;
    // A deal does NOT end the wave break.
    out.totemsStillUp = g.totemArea.active && !g.totemArea.claimed;
    out.otherDealsSank = g.devilArea.deals.filter((d) => d.state === 'sinking' || d.state === 'hidden').length >= 2;

    // --- reroll price doubles and is charged in max HP ---
    g.devilArea.dismiss();
    g.devilArea.present(g._buildDeals());
    const costs = [];
    for (let i = 0; i < 3; i++) {
      const hp = P.maxHealth;
      g._rerollDeals();
      costs.push(hp - P.maxHealth);
    }
    out.rerollCosts = costs;

    // --- THE SAFETY RULE: sell down and nothing may take the last of it ---
    P.maxHpDebt = 0;
    P.upgrades = {};
    P.rebuildMods();
    P.maxHpDebt = P.maxHealth - 21;   // 21 max HP left; floor is 20
    out.atFloor = P.maxHealth;
    out.cannotAfford5 = !P.canPay(5);
    out.canAfford1 = P.canPay(1);
    g.devilArea.dismiss();
    g.devilArea.present(g._buildDeals());
    g._refreshDevil();
    out.allGreyed = g.devilArea.deals.every((d) => d.state === 'hidden' || !d.enabled);
    // Force every claim path against a deal that cannot be paid for.
    for (const d of g.devilArea.deals) {
      d.armT = 0;
      d.state = 'up';
      g._claimDeal(d);
    }
    for (let i = 0; i < 20; i++) g._rerollDeals();
    out.survivedFloor = P.maxHealth;
    out.stillAlive = g.state === 'playing' && P.health > 0;

    // --- a hurt wave summons him rarely ---
    // dismiss() starts a SINK, and nothing here runs frames for it to finish
    // in, so the area has to be forced hidden between rolls or every iteration
    // would read the previous one's pillars as still standing.
    const hide = () => {
      g.devilArea.dismiss();
      for (const d of g.devilArea.deals) { d.state = 'hidden'; d.claimed = false; }
      g.devilArea.devil.state = 'hidden';
    };
    let seen = 0;
    for (let i = 0; i < 400; i++) {
      hide();
      g.waveDamageTaken = 10;
      g._presentTotems();
      g._presentDevil();
      if (g.devilArea.active) seen++;
    }
    out.hurtRate = seen / 400;

    // --- Demonic Presence makes it certain again ---
    P.mods.devilAlways = 1;
    let always = 0;
    for (let i = 0; i < 30; i++) {
      hide();
      g.waveDamageTaken = 10;
      g._presentTotems();
      g._presentDevil();
      if (g.devilArea.active) always++;
    }
    out.presenceRate = always / 30;
    P.mods.devilAlways = 0;

    // --- the SHOOT paths, which is where the two installations could be
    // confused: a deal pillar and a totem are the same class, told apart only
    // by which userData tag their claim box carries. ---
    const aimAt = (o) => {
      const t = new g.player.pos.constructor();
      o.getWorldPosition(t);
      const e = g.player.eyeInto(new g.player.pos.constructor());
      const dx = t.x - e.x, dy = t.y - e.y, dz = t.z - e.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(dy, Math.hypot(dx, dz));
      g.player.update(0.016, g.input, g.arena.obstacles, g.time);
      // shoot() raycasts against the PREVIOUS frame's world matrices (see the
      // frame-order note in main.js), and nothing renders in this harness, so
      // they have to be flushed by hand or every shot misses.
      g.scene.updateMatrixWorld(true);
      g.camera.updateMatrixWorld(true);
    };
    const stage = () => {
      hide();
      g.totemArea.dismiss();
      for (const t of g.totemArea.totems) { t.state = 'hidden'; t.claimed = false; }
      g.waveDamageTaken = 0;
      g._presentTotems();
      g._presentDevil();
      // Long enough to cover the rise plus the longest arm delay (2.5s with a
      // Devil standing), or nothing is claimable yet.
      for (let i = 0; i < 260; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, g.player.pos);
        g.devilArea.update(0.016, g.time, g.player.pos);
      }
    };

    // Give the wallet room and stand well clear of both rows, so nothing is
    // claimed by touch and the shot is the only thing under test.
    P.maxHpDebt = 0;
    P.upgrades = {};
    P.rebuildMods();
    P.health = P.maxHealth;
    // Spread is not what these tests are about - a pellet that wanders off a
    // 1.45m box at four metres would look exactly like a mis-tagged claim box.
    // Zeroed so the shot goes where it is aimed and the routing is the only
    // thing under test.
    g.player.weapon.spread = 0;

    // Each shot is fired from directly in front of its target down a line with
    // nothing else on it - the arena is full of crates and the two rows shadow
    // each other, and a blocked pellet would look exactly like a broken tag.
    const standAt = (x, z) => {
      g.player.pos.set(x, 0, z);
      g.player.vel.set(0, 0, 0);
      for (let i = 0; i < 4; i++) {
        g.time += 0.016;
        g.totemArea.update(0.016, g.time, g.player.pos);
        g.devilArea.update(0.016, g.time, g.player.pos);
      }
    };
    stage();
    const dealTarget = g.devilArea.deals.find((d) => d.state === 'up' && d.enabled);
    standAt(dealTarget.pos.x, dealTarget.pos.z - 4);
    const hpBefore = P.maxHealth;
    aimAt(dealTarget.hit);
    g.player.mag = 30;
    g.player.fireCd = 0;
    g.shoot();
    out.shotBoughtDeal = dealTarget.claimed && P.maxHealth === hpBefore - dealTarget.offer.cost;
    out.shotDidNotStartWave = g.totemArea.active && !g.totemArea.claimed;

    // The heart, through the same raycast.
    stage();
    standAt(2.0, g.devilArea.devil.pos.z);
    const hp2 = P.maxHealth;
    aimAt(g.devilArea.devil.hit);
    g.player.mag = 30;
    g.player.fireCd = 0;
    g.shoot();
    out.shotRerolled = hp2 - P.maxHealth === 2;

    // And a free totem is still free.
    stage();
    const totem = g.totemArea.totems.find((t) => t.state === 'up');
    standAt(totem.pos.x, totem.pos.z + 4);
    const hp3 = P.maxHealth;
    aimAt(totem.hit);
    g.player.mag = 30;
    g.player.fireCd = 0;
    g.shoot();
    out.shotTookTotem = totem.claimed && P.maxHealth === hp3;
    out.totemStartedWave = !g.totemArea.claimed || g.devilArea.deals.every((d) => d.state !== 'up');

    // --- E claims, and WALKING INTO ONE DOES NOT ---
    // The accident this replaced: crossing the row at 10 m/s used to pick a
    // build. Standing inside a totem for a full second must now do nothing at
    // all, and E must take the nearest thing in reach.
    stage();
    const walkTotem = g.totemArea.totems.find((t) => t.state === 'up');
    standAt(walkTotem.pos.x, walkTotem.pos.z);
    for (let i = 0; i < 60; i++) {
      g.time += 0.016;
      g.player.pos.set(walkTotem.pos.x, 0, walkTotem.pos.z);
      g._updateTotems(0.016);
    }
    out.walkingClaimsNothing = !walkTotem.claimed && !g.totemArea.claimed;
    // ...and the prompt is offering it while they stand there.
    out.promptNamesTotem = g._useTarget() && g._useTarget().kind === 'totem';
    g.tryUse();
    out.keyClaimedTotem = walkTotem.claimed;

    // E on a deal charges max HP.
    stage();
    const keyDeal = g.devilArea.deals.find((d) => d.state === 'up' && d.enabled);
    standAt(keyDeal.pos.x, keyDeal.pos.z - 1.2);
    const hpKey = P.maxHealth;
    out.promptNamesDeal = g._useTarget() && g._useTarget().kind === 'deal';
    g.tryUse();
    out.keyBoughtDeal = keyDeal.claimed && P.maxHealth === hpKey - keyDeal.offer.cost;

    // E beside the Devil rerolls rather than taking the pillar behind him.
    stage();
    standAt(2.0, g.devilArea.devil.pos.z);
    const hpKey2 = P.maxHealth;
    out.promptNamesDevil = g._useTarget() && g._useTarget().kind === 'devil';
    g.tryUse();
    out.keyRerolled = hpKey2 - P.maxHealth === 2;

    // E at a station buys ammo, even standing where a totem's range reaches.
    stage();
    P.reserveAmmo = 0;
    g.credits = 5000;
    standAt(g.totemArea.ammoStation.pos.x, g.totemArea.ammoStation.pos.z - 1);
    out.promptNamesStation = g._useTarget() && g._useTarget().kind === 'station';
    g.tryUse();
    out.keyBoughtAmmo = P.reserveAmmo === 90;

    // --- a normal totem never offers a deal ---
    let leaked = 0;
    for (let i = 0; i < 200; i++) {
      for (const o of g._buildOffers()) if (UP[o.id].devil) leaked++;
    }
    out.leaked = leaked;
    return out;
  });

  // ---- the deals themselves --------------------------------------------
  // Thirteen new hooks spread across main.js, player.js and enemy.js. Each one
  // is exercised against a live enemy or a live hit, because a mod field that
  // is set correctly and read nowhere looks identical from the outside.
  const m = await page.evaluate(() => {
    const g = window.__game;
    const P = g.player;
    const out = {};
    const take = (id) => {
      P.upgrades = {};
      P.maxHpDebt = 0;
      P.rebuildMods();
      P.upgrades[id] = 1;
      P.rebuildMods();
      P.health = P.maxHealth;
    };
    const clearField = () => {
      for (const e of g.enemies) e.dispose ? (e.dead = true) : null;
      g.enemies.length = 0;
    };
    const spawn = (type = 'chaser', x = 2, z = 2) => {
      const e = new g.__EnemyForTest(type, new g.player.pos.constructor(x, 0, z), 40, 1, 1);
      g.scene.add(e.group);
      g.enemies.push(e);
      return e;
    };
    const tick = (n, dt = 0.05) => {
      for (let i = 0; i < n; i++) {
        g.time += dt;
        g._updateFire(dt);
        g._updateEnemies(dt);
      }
    };

    g.state = 'playing';
    g.waveState = 'active';

    // DARK POWER
    take('darkPower');
    out.darkPower = +(P.getEffectiveDamage(100)).toFixed(1);

    // CARNAGE: five kills, then a hit
    take('carnage');
    P.carnageStacks = 5;
    out.carnage5 = +(P.getEffectiveDamage(100)).toFixed(1);
    g._hurtPlayer(1, P.pos, null);
    out.carnageAfterHit = +(P.getEffectiveDamage(100)).toFixed(1);

    // BLOOD PACT: a kill heals, and hits cost 25% more
    take('bloodPact');
    P.health = P.maxHealth - 10;
    P.onKill(g.time);
    out.pactHealed = P.health === P.maxHealth - 7;
    P.health = 100;
    const hBefore = P.health;
    g._hurtPlayer(20, P.pos, null);
    out.pactExtraDamage = +(hBefore - P.health).toFixed(1);

    // THORNS: the attacker takes half back
    take('thorns');
    clearField();
    const victim = spawn('chaser', 3, 0);
    const hpWas = victim.hp;
    g._hurtPlayer(40, victim.pos, victim);
    out.thorns = +(hpWas - victim.hp).toFixed(1);

    // ABSOLUTE ZERO: the world slows, and a hit plants you
    take('absoluteZero');
    clearField();
    const slowed = spawn('chaser', 5, 0);
    slowed._worldSlow = P.mods.worldSlow;
    out.worldSlow = +P.mods.worldSlow.toFixed(2);
    g._hurtPlayer(5, P.pos, null);
    out.frozen = P.frozenUntil > g.time;

    // DEMONIC DODGE: forced through by pushing the chance to certainty
    take('demonicDodge');
    out.dodgeChance = +P.mods.dodgeChance.toFixed(2);
    P.mods.dodgeChance = 1;
    P.health = 100;
    g._hurtPlayer(30, P.pos, null);
    out.dodgedFree = P.health === 100;
    out.rageOn = P.rageEnd > P.now;
    P.now = g.time;
    P.rageEnd = g.time + 3;
    out.rageDamage = +(P.getEffectiveDamage(100)).toFixed(1);
    // and the invulnerable second really is invulnerable
    P.mods.dodgeChance = 0;
    P.invulnEnd = g.time + 1;
    g._hurtPlayer(30, P.pos, null);
    out.invuln = P.health === 100;
    P.invulnEnd = 0;

    // OVERLOAD: 20% of max HP off everything when the magazine empties
    take('overload');
    clearField();
    const a = spawn('chaser', 3, 0);
    const b = spawn('chaser', -3, 0);
    const maxA = a.maxHp;
    g._overload();
    out.overload = Math.abs((maxA - a.hp) - maxA * 0.2) < 0.01 && b.hp < b.maxHp;

    // HELLFIRE: the reload lays a trail that burns
    take('hellfire');
    clearField();
    const burnt = spawn('chaser', 0.5, 0.5);
    P.pos.set(0, 0, 0);
    g._fireUntil = g.time + 5;
    g._fireLastX = -99;
    g._addFire(0.5, 0.5);
    const burntHp = burnt.hp;
    tick(20);
    out.hellfire = burnt.hp < burntHp;

    // ANTIDOTE: immune to pools, and poisoned enemies heal you
    take('antidote');
    clearField();
    P.health = 50;
    g._hazard.length = 0;
    g._addHazard(P.pos.x, P.pos.z, 3, 5, 100, 'pool');
    const hpPool = P.health;
    for (let i = 0; i < 20; i++) { g.time += 0.05; g._updateHazard(0.05); }
    out.poolImmune = P.health >= hpPool;
    const sick = spawn('chaser', 3, 0);
    sick.applyStatus('poison', 10, 1);
    P.health = 50;
    tick(30);
    out.poisonLeech = P.health > 50;

    // ETERNAL AFFLICTION: a status put on an enemy never runs out
    take('eternalAffliction');
    clearField();
    const cursed = spawn('chaser', 4, 0);
    cursed.applyStatus('poison', 1, 1);
    tick(60);
    out.eternal = cursed.status.poison > 0;
    // and pools hurt twice as much
    P.health = 200;
    P.baseMaxHealth = 200;
    const hpHaz = P.health;
    g._hurtPlayerDot(10);
    out.hazardDouble = +(hpHaz - P.health).toFixed(1);
    P.baseMaxHealth = 100;

    // EXECUTIONER: the next boss arrives at half health
    take('executioner');
    out.bossHpMult = P.mods.bossHpMult;
    clearField();
    g.wave = 5;
    g._cfg = { boss: true, bossKey: 'colossus', maxAdds: 2, addInterval: 3 };
    g._spawnBoss('colossus');
    const withDeal = g.bossFight.parts[0].maxHp;
    clearField();
    g.bossFight = null;
    P.upgrades = {};
    P.rebuildMods();
    g._spawnBoss('colossus');
    const without = g.bossFight.parts[0].maxHp;
    out.executioner = Math.abs(withDeal * 2 - without) < 1;
    clearField();
    g.bossFight = null;

    // DEVIL'S GAMBLE: the multiplier is only ever 2x or 0.5x
    take('devilsGamble');
    out.gambleSet = P.mods.gamble === 1;

    // DEMONIC PRESENCE
    take('demonicPresence');
    out.presenceSet = P.mods.devilAlways === 1;
    return out;
  });
  console.log(JSON.stringify({ ...r, mechanics: m }, null, 2));
  ok('dark power: +20% damage', m.darkPower === 120);
  ok('carnage: five kills is +25%', m.carnage5 === 125);
  ok('carnage: a hit wipes the chain', m.carnageAfterHit === 100);
  ok('blood pact: a kill heals 3', m.pactHealed);
  ok('blood pact: hits cost 25% more', m.pactExtraDamage === 25);
  ok('thorns: the attacker takes half back', m.thorns === 20, String(m.thorns));
  ok('absolute zero: the world runs at 80%', m.worldSlow === 0.8);
  ok('absolute zero: a hit freezes you', m.frozen);
  ok('demonic dodge: +10% dodge', m.dodgeChance === 0.1);
  ok('demonic dodge: the dodge is free', m.dodgedFree && m.rageOn);
  ok('demonic dodge: rage doubles damage', m.rageDamage === 200);
  ok('demonic dodge: the second is invulnerable', m.invuln);
  ok('overload: 20% of max HP off everything', m.overload);
  ok('hellfire: the trail burns', m.hellfire);
  ok('antidote: pools do nothing', m.poolImmune);
  ok('antidote: poisoned enemies heal you', m.poisonLeech);
  ok('eternal affliction: statuses never end', m.eternal);
  ok('eternal affliction: pools hurt double', m.hazardDouble === 20, String(m.hazardDouble));
  ok('executioner: bosses arrive at half', m.executioner);
  ok("devil's gamble is wired", m.gambleSet);
  ok('demonic presence is wired', m.presenceSet);

  ok('devil certain after a clean wave', r.devilAfterClean);
  ok('three deals offered', r.dealCount === 3);
  ok('every deal is priced', r.allPriced);
  ok('totems re-armed longer', r.totemArm >= 2.4, String(r.totemArm));
  ok('a deal costs exactly its price', r.paid);
  ok('the deal is owned', r.owned);
  ok('health clamped to the new max', r.healthClamped);
  ok('a deal does not start the wave', r.totemsStillUp);
  ok('the rest of the set sinks', r.otherDealsSank);
  ok('rerolls cost 2, 4, 8 max HP', JSON.stringify(r.rerollCosts) === '[2,4,8]', JSON.stringify(r.rerollCosts));
  ok('floor holds at 20', r.atFloor === 21 && r.cannotAfford5 && r.canAfford1);
  ok('unaffordable deals are greyed', r.allGreyed);
  ok('nothing could spend past the floor', r.survivedFloor >= 20, String(r.survivedFloor));
  ok('the player is still alive', r.stillAlive);
  ok('hurt wave summons rarely', r.hurtRate > 0.05 && r.hurtRate < 0.28, String(r.hurtRate));
  ok('demonic presence is certain', r.presenceRate === 1);
  ok('shooting a pillar buys the deal', r.shotBoughtDeal);
  ok('a bought deal leaves the totems up', r.shotDidNotStartWave);
  ok('shooting the heart rerolls for 2 max HP', r.shotRerolled);
  ok('shooting a totem is still free', r.shotTookTotem);
  ok('a totem claim closes the devil', r.totemStartedWave);
  ok('standing in a totem claims nothing', r.walkingClaimsNothing);
  ok('E takes the totem you are standing at', r.promptNamesTotem && r.keyClaimedTotem);
  ok('E takes a deal and charges max HP', r.promptNamesDeal && r.keyBoughtDeal);
  ok('E at the devil rerolls', r.promptNamesDevil && r.keyRerolled);
  ok('E at a station buys ammo', r.promptNamesStation && r.keyBoughtAmmo);
  ok('no deal leaks onto a free totem', r.leaked === 0);
  ok('no console errors', errors.length === 0, errors.join(' | '));
} finally {
  if (browser) await browser.close();
  server.kill();
}
console.log(fails ? 'DEVIL TEST FAIL' : 'DEVIL TEST PASS');
process.exit(fails ? 1 : 0);
