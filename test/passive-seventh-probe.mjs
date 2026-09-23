// Focused browser probes for the seventh passive pool. Each item keeps its own
// discovered fragment; the shared setup here keeps those fragments small while
// every assertion still drives the real Player, Enemy, pickup or Game path.
export async function probeSeventh(page, id) {
  return page.evaluate(async (itemId) => {
    const g = window.__game;
    const p = g.player;
    const scalars = [
      'health', 'shield', 'ghostShield', 'ghostPlateBrokenAt', 'reserveAmmo',
      'mag', 'magOnReload', 'reloading', 'bottomFeedMagActive', 'invulnEnd',
      'wardCharges', 'waveShots', 'sprayMisses', 'nearbyEnemies', 'balance',
      'cashOwed', 'brassTaxPaid', 'deadSwitchEnd', 'deadSwitchFx', 'wadingEnd',
      'damageMult', 'itemDamageMult', 'compoundMult', 'streak', 'carnageStacks',
      'adrenalineStacks', 'vendingKills', 'lastHurt', 'lastDamageTaken',
    ];
    const saved = Object.fromEntries(scalars.map((k) => [k, p[k]]));
    const owned = { ...p.passiveItems };
    const status = { ...p.status };
    const pos = p.pos.clone();
    const state = g.state;
    const credits = g.credits;
    const waveDamageTaken = g.waveDamageTaken;
    const lastPerfect = g.lastPerfect;
    const pendingCharge = g._pendingCharge;
    const pendingValue = g._pendingValue;
    const lavaT = g._lavaT;
    const enemies = g.enemies.slice();
    const projectiles = g.projectiles.slice();
    const powerups = g.powerups.slice();
    const hazards = g._hazard.slice();
    let result = { ok: false, detail: 'probe did not run' };

    const equip = () => {
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      p.rebuildMods();
      p.health = p.maxHealth;
      p.shield = 0;
      p.ghostShield = 0;
      p.wardCharges = 0;
      p.damageMult = 1;
      p.itemDamageMult = 1;
      p.compoundMult = 1;
      p.streak = 0;
      p.carnageStacks = 0;
      p.adrenalineStacks = 0;
      p.waveShots = 0;
      p.sprayMisses = 0;
      p.nearbyEnemies = 0;
      p.bottomFeedMagActive = false;
      p.clearStatuses();
      return p.takePassiveItem(itemId);
    };

    try {
      const baseMax = p.maxHealth;
      const baseReserve = p.maxReserve;
      equip();
      const detail = {};

      switch (itemId) {
        case 'thunderclap': {
          const a = { dead: false, hp: 20, takeDamage(d) { this.hp -= d; return false; } };
          const b = { dead: false, hp: 20, takeDamage(d) { this.hp -= d; return false; } };
          g.enemies.length = 0; g.enemies.push(a, b);
          g._thunderclap();
          Object.assign(detail, { a: a.hp, b: b.hp });
          result.ok = a.hp === 15 && b.hp === 15;
          break;
        }
        case 'packLight':
          Object.assign(detail, { maxReserve: p.maxReserve, maxHealth: p.maxHealth, damage: p.mods.damage });
          result.ok = p.maxReserve === baseReserve - 100
            && p.maxHealth === Math.round(baseMax * 1.2)
            && Math.abs(p.mods.damage - 1.25) < 1e-9;
          break;
        case 'luckyCorpse': {
          const before = g.powerups.length;
          g._luckyCorpseDrop(p.pos);
          const drops = g.powerups.slice(before);
          detail.health = drops.filter((q) => q.typeKey === 'health').length;
          detail.ammo = drops.filter((q) => q.typeKey === 'ammo').length;
          result.ok = detail.health === 3 && detail.ammo === 3;
          break;
        }
        case 'deathwish':
          Object.assign(detail, { health: p.health, damage: p.mods.damage });
          result.ok = p.health === 5 && Math.abs(p.mods.damage - 1.4) < 1e-9;
          break;
        case 'gracePeriod':
          g.state = 'playing'; p.health = 100; p.invulnEnd = -1;
          g._hurtPlayer(1, p.pos);
          Object.assign(detail, { health: p.health, invuln: p.invulnEnd - g.time });
          result.ok = p.health === 99 && detail.invuln >= 0.99;
          break;
        case 'killchain':
          p.invulnEnd = g.time;
          for (let i = 0; i < 5; i++) p.onKill(g.time);
          detail.window = p.invulnEnd - g.time;
          result.ok = Math.abs(detail.window - 5) < 1e-9;
          break;
        case 'zeroWaste':
          p.reserveAmmo = 0;
          g._placeDrop('ammo', p.pos);
          g.powerups[g.powerups.length - 1].moveTo(p.pos.x, p.pos.z, p.pos.y);
          g._updatePickups(0);
          detail.ammo = p.reserveAmmo;
          result.ok = p.reserveAmmo === 68;
          break;
        case 'bloodTax':
          Object.assign(detail, { maxHealth: p.maxHealth, damage: p.mods.damage });
          result.ok = p.maxHealth === baseMax - 5 && Math.abs(p.mods.damage - 1.2) < 1e-9;
          break;
        case 'pressureCooker':
          p.nearbyEnemies = 3;
          detail.damage = p.getEffectiveDamage(100);
          result.ok = Math.abs(detail.damage - 160) < 1e-8;
          break;
        case 'corneredAnimal':
          p.pos.set(0, 0, 0); detail.centre = p.getEffectiveDamage(100);
          p.pos.set(20, 0, 0); detail.edge = p.getEffectiveDamage(100);
          result.ok = Math.abs(detail.centre - 100) < 1e-8
            && Math.abs(detail.edge - 140) < 1e-8;
          break;
        case 'preservative': {
          g._placeDrop('ammo', p.pos);
          const q = g.powerups[g.powerups.length - 1];
          detail.life = q.despawnTime;
          result.ok = q.despawnTime === 120;
          break;
        }
        case 'wadingBoots':
          g.enemies.length = 0;
          g.state = 'playing'; p.health = 100; p.pos.set(0, 0, 0);
          g._addHazard(0, 0, 2, 2, 20, 'pool');
          g._updateHazard(0.5);
          detail.poolSafe = p.health === 100 && p.wadingEnd > g.time;
          p.clearStatuses(); p.wadingEnd = -1; g._lavaT = 1;
          g._lavaFloorTick(0.1);
          detail.lavaSafe = p.status.fire === 0 && p.wadingEnd > g.time;
          Object.assign(detail, { health: p.health });
          result.ok = p.health === 100 && detail.poolSafe && detail.lavaSafe;
          break;
        case 'ghostPlate':
          p.health = 100; p.takeDamage(12, g.time);
          detail.afterHit = p.ghostShield;
          p.update(0.01, {}, [], g.time + 8.01, false);
          detail.reformed = p.ghostShield;
          result.ok = detail.afterHit === 0 && detail.reformed === 10 && p.health === 100;
          break;
        case 'luckyCasings': {
          p.health = 50;
          const random = Math.random;
          Math.random = () => 0;
          try { g._luckyCasing(1); } finally { Math.random = random; }
          detail.health = p.health;
          result.ok = p.health === 55;
          break;
        }
        case 'dialysis': {
          const e = new g.__EnemyForTest('chaser', p.pos.clone(), 1, 1, 1);
          e.maxHp = e.hp = 100;
          e.applyStatus('poison', 10, 4);
          const ctx = { mods: p.mods, pulse: 0, pulseWhole: true, effects: null };
          e._tickStatus(0, ctx);
          ctx.pulse = 1; e._tickStatus(0, ctx);
          ctx.pulse = 2; e._tickStatus(0, ctx);
          detail.damage = 100 - e.hp;
          e.dispose();
          result.ok = detail.damage === 12;
          break;
        }
        case 'extendedWarranty': {
          const enemyModule = await import('./js/enemy.js');
          enemyModule.setStatusDurationBonus(p.mods.statusDurationBonus);
          const e = new g.__EnemyForTest('chaser', p.pos.clone(), 1, 1, 1);
          e.applyStatus('slow', 2);
          detail.duration = e.status.slow;
          e.dispose();
          enemyModule.setStatusDurationBonus(0);
          result.ok = detail.duration === 5;
          break;
        }
        case 'coinLaundry':
          p.health = p.maxHealth; g.credits = 0;
          g._pendingCharge = 0; g._pendingValue = 0;
          g._collectOrb(10);
          detail.credits = g.credits;
          result.ok = g.credits === 20;
          break;
        case 'vendingMachine': {
          const before = g.powerups.length;
          g._vendingDrop();
          detail.added = g.powerups.length - before;
          detail.every = p.mods.vendingEvery;
          result.ok = detail.added === 1 && detail.every === 15;
          break;
        }
        case 'sponsorship':
          detail.fireRate = p.mods.fireRate;
          result.ok = Math.abs(detail.fireRate - 1.02) < 1e-9;
          break;
        case 'completionist':
          Object.assign(detail, { fireRate: p.mods.fireRate, damage: p.mods.damage });
          result.ok = Math.abs(detail.fireRate - 1.01) < 1e-9
            && Math.abs(detail.damage - 1.01) < 1e-9;
          break;
        case 'deadMansSwitch': {
          const e = { dead: false, got: 0, takeDamage(d) { this.got += d; return false; } };
          g.enemies.length = 0; g.enemies.push(e);
          p.health = 11; p.deadSwitchEnd = -1; p.takeDamage(2, g.time);
          detail.armed = p.deadSwitchFx;
          g._deadMansSwitch();
          detail.damage = e.got;
          result.ok = detail.armed && detail.damage === 100 && !p.deadSwitchFx;
          break;
        }
        case 'mitosis': {
          const bodies = [1, 2, 3, 4, 5].map((x) => {
            const e = new g.__EnemyForTest(
              'chaser', p.pos.clone().add({ x, y: 0, z: 0 }), 1, 1, 1
            );
            e.maxHp = e.hp = 1;
            return e;
          });
          const [victim] = bodies;
          g.enemies.length = 0; g.enemies.push(...bodies);
          const before = g.projectiles.length;
          g._beginShot();
          g._landShot(victim, victim.pos, { x: 1, z: 0 }, 10, 1);
          const first = g.projectiles.slice(before);
          g._mitosisHit(first[0]);
          const second = g.projectiles.slice(before + first.length);
          Object.assign(detail, {
            first: first.map((f) => f.damage),
            second: second.map((f) => f.damage),
          });
          result.ok = victim.dead
            && first.length === 2 && first.every((f) => f.damage === 5)
            && second.length === 2 && second.every((f) => f.damage === 2.5);
          for (const e of bodies) e.dispose();
          break;
        }
        case 'fullHouse':
          p.mag = 10; detail.damage = p.getEffectiveDamage(100);
          result.ok = Math.abs(detail.damage - 104) < 1e-8;
          break;
        case 'bottomFeed':
          p.mag = 0; p.magOnReload = 0; p.reserveAmmo = 300; p.reloading = 0.01;
          p.update(0.02, {}, [], g.time + 0.02, false);
          Object.assign(detail, { armed: p.bottomFeedMagActive, damage: p.getEffectiveDamage(100) });
          result.ok = detail.armed && Math.abs(detail.damage - 130) < 1e-8;
          break;
        case 'spendthrift':
          p.waveShots = 10; detail.damage = p.getEffectiveDamage(100);
          result.ok = Math.abs(detail.damage - 101) < 1e-8;
          break;
        case 'brassTax':
          p.balance = 1; p.cashOwed = 0; p._noteShot();
          Object.assign(detail, { paid: p.brassTaxPaid, owed: p.cashOwed, bonus: p.mods.brassTaxDamage });
          result.ok = detail.paid && detail.owed === 1 && detail.bonus === 0.3;
          break;
        case 'sprayEconomy':
          p.sprayMisses = 2; detail.missed = p.getEffectiveDamage(100);
          p.noteAccuracy(true); detail.reset = p.getEffectiveDamage(100);
          result.ok = Math.abs(detail.missed - 110) < 1e-8
            && Math.abs(detail.reset - 100) < 1e-8;
          break;
      }
      result.detail = JSON.stringify(detail);
    } finally {
      for (const pr of g.projectiles) {
        if (!projectiles.includes(pr) && pr.mesh) g.scene.remove(pr.mesh);
      }
      for (const q of g.powerups) {
        if (!powerups.includes(q) && q.destroy) q.destroy();
      }
      for (const h of g._hazard) {
        if (!hazards.includes(h)) g._releaseHazard(h);
      }
      g.enemies.length = 0; g.enemies.push(...enemies);
      g.projectiles.length = 0; g.projectiles.push(...projectiles);
      g.powerups.length = 0; g.powerups.push(...powerups);
      g._hazard.length = 0; g._hazard.push(...hazards);
      for (const key of Object.keys(p.passiveItems)) delete p.passiveItems[key];
      Object.assign(p.passiveItems, owned);
      p.rebuildMods();
      Object.assign(p, saved);
      p.pos.copy(pos);
      for (const key of Object.keys(p.status)) delete p.status[key];
      Object.assign(p.status, status);
      g.state = state;
      g.credits = credits;
      g.waveDamageTaken = waveDamageTaken;
      g.lastPerfect = lastPerfect;
      g._pendingCharge = pendingCharge;
      g._pendingValue = pendingValue;
      g._lavaT = lavaT;
    }
    return result;
  }, id);
}
