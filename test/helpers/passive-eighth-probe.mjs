// Focused browser probes for the eighth pool - the music picks. Four of the
// eight own machinery rather than numbers (the gun's pellet walk, the reload
// edge, the wave clear, the item slot), and every one of those is only
// honestly testable through the real path: a round really fired, a reload
// really seated, a clear really rerolled. The shared fixture here pins the
// one thing a fixture must never leave to chance - WHAT IS IN FRONT OF THE
// GUN - by cutting the shot's raycast list down to the bare room (floor,
// walls, ceiling) and the shop furniture out of it, so a generated crate or
// a standing totem can never eat the round the assertion is measuring.
//
// Each item keeps its own discovered fragment; this file is the shared setup
// that keeps those fragments small.
export async function probeEighth(page, id) {
  return page.evaluate(async (itemId) => {
    const g = window.__game;
    const p = g.player;
    const ACTIVE = g.__activeItemsForTest;
    const V = p.pos.constructor;

    // ---- everything the fixture may touch, saved -------------------------
    const owned = { ...p.passiveItems };
    const saved = {};
      for (const k of [
        'now', 'fireCd', 'mag', 'magOnReload', 'reloading', 'reserveAmmo',
        'shotTally', 'health', 'bloom', 'activeItem', 'activeItemCharge',
        'synthItem', 'wavetable', 'moveVX', 'moveVZ', 'sprintFade',
      ]) saved[k] = p[k];
    const pos = p.pos.clone();
    const vel = p.vel.clone();
    const state = g.state;
    const enemies = g.enemies.slice();
    const meshList = g.arena.meshList.slice();
    const weaponSpread = p.weapon.spread;
    const weaponAim = p.weapon.aimSpread;
    const addTotem = g.totemArea.addTargets;
    const addBox = g.mysteryBox.addTargets;
    const addCabinets = g.donationMachine.addTargets;

    // The fixture's toolkit. `bare`/`give` are the same helpers the other
    // fragments use; `spawn` stands a body up ON the roster so the real shot
    // path finds it exactly as it finds a wave's own.
    const bare = () => {
      for (const k of Object.keys(p.passiveItems)) delete p.passiveItems[k];
      p.rebuildMods();
      // Every rebuild restores the base 5% crit; several cases here measure
      // exact damage, so the die comes off after each one.
      p.mods.critChance = 0;
    };
    const give = (iid, n = 1) => {
      p.passiveItems[iid] = n;
      p.rebuildMods();
      p.mods.critChance = 0;
    };
    const spawn = (x, z) => {
      const e = new g.__EnemyForTest('chaser', new V(x, 0, z), 1e9, 1, 1);
      e.maxHp = e.hp = 1e9;
      e.head.userData.head = false;
      e.group.position.copy(e.pos);
      e.group.updateMatrixWorld(true);
      g.scene.add(e.group);
      g.enemies.push(e);
      return e;
    };
    const despawn = (e) => {
      const i = g.enemies.indexOf(e);
      if (i >= 0) g.enemies.splice(i, 1);
      g.scene.remove(e.group);
      e.dispose();
    };
    const aimFrom = (cx, cy, cz, tx, ty, tz) => {
      g.camera.position.set(cx, cy, cz);
      g.camera.lookAt(tx, ty, tz);
      g.camera.updateMatrixWorld(true);
    };
    const clearStatus = (e) => {
      e.status = { freeze: 0, burn: 0, poison: 0, slow: 0, fear: 0 };
    };
    const fire = () => {
      // The sustained-fire cone is zeroed per shot: BLOOM_SPREAD is 0.075,
      // which is a real cone in play and a coin toss over a 0.6m sphere at
      // six metres in a fixture. Several cases here count legs or measure
      // exact damage, so every round leaves the barrel along the aim line.
      p.bloom = 0;
      p.fireCd = 0;
      p.reloading = 0;
      p.mag = 30;
      g.input.shootFresh = true;
      g.shoot();
      g.input.shootFresh = false;
    };
    const dealtBy = (e) => e.maxHp - e.hp;
    const resetBody = (e) => { e.hp = e.maxHp; e.dead = false; clearStatus(e); };

    let result = { ok: false, detail: 'probe did not run' };
    try {
      g.state = 'playing';
      // THE BARE ROOM. Generated cover and shop furniture are what a raw
      // g.shoot() is worst at (see fourthpool's fixture note); both are
      // removed from the raycast list rather than from the world, so nothing
      // else about the arena changes under the test.
      g.enemies.length = 0;
      g.arena.meshList.length = g.terrain._baseMeshes;
      g.totemArea.addTargets = () => {};
      g.mysteryBox.addTargets = () => {};
      g.donationMachine.addTargets = () => {};
      p.pos.set(0, 0, 0);
      // The cone is pinned to zero for every case here: several of them
      // count legs or measure exact damage, and a jittered round is a round
      // the assertion cannot own. That means the whole of _shotSpread, not
      // just the weapon's own fields - the velocity and sprint carry the bot
      // had a frame ago are the rest of the cone, so they are zeroed too.
      p.vel.set(0, 0, 0);
      p.moveVX = 0;
      p.moveVZ = 0;
      p.sprintFade = 0;
      p.weapon.spread = 0;
      p.weapon.aimSpread = 0;
      p.bloom = 0;
      bare();
      const base = () => p.getEffectiveDamage(p.weapon.damage);
      const detail = {};

      switch (itemId) {
        // ---- SQUARE WAVE: the alternation, on the real trigger ------------
        case 'squareWave': {
          const body = spawn(0, -6);
          aimFrom(0, 0.8, 0, 0, 0.8, -6);
          const pullAt = (tally) => {
            resetBody(body);
            p.shotTally = tally;
            fire();
            return dealtBy(body);
          };
          const b = base();
          detail.plainOdd = pullAt(0);   // tally 0 -> shot 1, odd, doubled
          detail.plainEven = pullAt(1);  // shot 2, even, plain
          give(itemId);
          detail.hot1 = pullAt(0);
          detail.cold = pullAt(1);
          detail.hot2 = pullAt(2);
          detail.base = b;
          result.ok = Math.abs(detail.hot1 - b * 2) < 1e-6
            && Math.abs(detail.hot2 - b * 2) < 1e-6
            && Math.abs(detail.cold - b) < 1e-6
            && Math.abs(detail.plainOdd - b) < 1e-6
            && Math.abs(detail.plainEven - b) < 1e-6;
          despawn(body);
          break;
        }

        // ---- WAVETABLE: four elements, one per magazine -------------------
        case 'wavetable': {
          const body = spawn(0, -6);
          const aim = () => aimFrom(0, 0.8, 0, 0, 0.8, -6);
          aim();
          give(itemId);
          const seat = () => {
            // The real seating edge: a reload with rounds behind it, run one
            // frame through Player.update exactly as the loop runs it. The
            // frame ends in applyCamera, which re-points the camera off the
            // player's own yaw and pitch - so the fixture takes the camera
            // back afterwards, exactly as the loop's next frame would if the
            // player were still holding the fixture's aim.
            p.reloading = 0.01;
            p.magOnReload = 0;
            p.reserveAmmo = 300;
            const done = p.update(0.02, {}, g.arena.obstacles, g.time, false);
            aim();
            return done;
          };
          const shootElement = () => {
            resetBody(body);
            fire();
            return {
              burn: body.status.burn, slow: body.status.slow,
              poison: body.status.poison, fear: body.status.fear,
            };
          };
          detail.index0 = p.wavetable;
          detail.fire = shootElement();
          detail.seated1 = seat();
          detail.index1 = p.wavetable;
          detail.ice = shootElement();
          detail.seated2 = seat();
          detail.poison = shootElement();
          detail.seated3 = seat();
          detail.fear = shootElement();
          detail.seated4 = seat();
          detail.index4 = p.wavetable;
          detail.fireAgain = shootElement();
          result.ok = detail.index0 === 0
            && detail.fire.burn === 2.5 && detail.fire.slow === 0
            && detail.seated1 === true && detail.index1 === 1
            && detail.ice.slow === 2 && detail.ice.burn === 0
            && detail.seated2 === true
            && detail.poison.poison === 3 && detail.poison.slow === 0
            && detail.seated3 === true
            && detail.fear.fear === 1.5 && detail.fear.poison === 0
            && detail.seated4 === true && detail.index4 === 0
            && detail.fireAgain.burn === 2.5;
          despawn(body);
          break;
        }

        // ---- MIDI CABLE: the slot, rerolled and charged --------------------
        case 'midiCable': {
          const carried = Object.keys(ACTIVE)[0];
          give(itemId);
          // Nothing carried: the cable waits, it does not conjure.
          p.activeItem = null;
          p.activeItemCharge = 0;
          g._rerollWaveItems();
          detail.emptyStayed = p.activeItem === null;
          // Something carried: a different item, fully charged.
          p.giveActiveItem(carried);
          p.activeItemCharge = 1;
          const rolls = [];
          let legal = true, changed = true, charged = true;
          for (let i = 0; i < 5; i++) {
            g._rerollWaveItems();
            if (p.activeItem === carried) changed = false;
            if (!ACTIVE[p.activeItem]) legal = false;
            if (p.activeItemCharge < ACTIVE[p.activeItem].charge) charged = false;
            rolls.push(p.activeItem);
          }
          Object.assign(detail, {
            emptyStayed: detail.emptyStayed, rolls: rolls.length, legal, changed, charged,
          });
          // The pick gone: the clear leaves the slot alone.
          bare();
          p.giveActiveItem(carried);
          g._rerollWaveItems();
          detail.untouchedWithoutPick = p.activeItem === carried;
          result.ok = detail.emptyStayed && legal && changed && charged
            && detail.untouchedWithoutPick;
          break;
        }

        // ---- SIDECHAIN: one pulse per press, one point per body ------------
        case 'sidechain': {
          const target = spawn(0, -6);
          const flankA = spawn(4, -3);
          const flankB = spawn(-4, -3);
          aimFrom(0, 0.8, 0, 0, 0.8, -6);
          give(itemId);
          const b = base();
          resetBody(target); resetBody(flankA); resetBody(flankB);
          fire();
          detail.target = dealtBy(target);
          detail.flankA = dealtBy(flankA);
          detail.flankB = dealtBy(flankB);
          // ONE PULSE PER PRESS: TWENTY/TWENTY's doubled volley is two
          // patterns that both land on the same chest, and the room must
          // still take exactly one point - the latch is the pick.
          give('twentyTwenty');
          resetBody(target); resetBody(flankA); resetBody(flankB);
          fire();
          detail.volleyTarget = dealtBy(target);
          detail.volleyFlankA = dealtBy(flankA);
          detail.volleyFlankB = dealtBy(flankB);
          // A MISS PULSES NOTHING: the card says shooting an enemy.
          bare();
          give(itemId);
          resetBody(flankA); resetBody(flankB);
          aimFrom(0, 1.7, 0, 0, 0, 22);
          fire();
          detail.missFlankA = dealtBy(flankA);
          detail.missFlankB = dealtBy(flankB);
          detail.base = b;
          result.ok = Math.abs(detail.target - b) < 1e-6
            && detail.flankA === 1 && detail.flankB === 1
            && Math.abs(detail.volleyTarget - b * 1.2) < 1e-6
            && detail.volleyFlankA === 1 && detail.volleyFlankB === 1
            && detail.missFlankA === 0 && detail.missFlankB === 0;
          despawn(target); despawn(flankA); despawn(flankB);
          break;
        }

        // ---- ECHO: the room, twice -----------------------------------------
        case 'echo': {
          // The bounce is instrumented through the tracer: every leg of a
          // pellet's flight is one tracer call, so a round that stopped
          // draws one, and each bounce adds exactly one more. The from/to
          // pairs are kept, not just counted, because the COUNT can never
          // catch a leg drawn from the wrong origin - a second bounce once
          // drew its streak from the muzzle again, reading on screen as a
          // phantom second shot - and the continuity test below is what
          // makes that a FAIL rather than a pile of screenshots nobody saw.
          const legs = [];
          const origTracer = g.effects.tracer;
          g.effects.tracer = (from, to, anchor) => {
            legs.push([from.clone(), to.clone()]);
            origTracer.call(g.effects, from, to, anchor);
          };
          // Each leg must begin where the previous one ended - allowing the
          // 0.05m surface lift the bounce gives the next cast, and no more.
          const chained = () => {
            for (let i = 1; i < legs.length; i++) {
              if (legs[i][0].distanceTo(legs[i - 1][1]) > 0.08) return false;
            }
            return true;
          };
          // THE FLOOR SHOT. Aimed at the floor at z=15 from the eye at
          // z=20, the reflected ray passes through (0, 0.8, 12.8) - the
          // exact centre of a body's hit sphere - while the DIRECT ray
          // buries itself in the floor first, so the body is unreachable
          // without a bounce.
          const body = spawn(0, 12.8);
          aimFrom(0, 1.7, 20, 0, 0, 15);
          fire();
          detail.bareFloorLegs = legs.length;
          detail.bareFloorDealt = dealtBy(body);
          legs.length = 0;
          give(itemId);
          resetBody(body);
          fire();
          detail.echoFloorLegs = legs.length;
          detail.echoFloorChained = chained();
          detail.echoFloorDealt = dealtBy(body);
          despawn(body);
          // SKIPSTONE, the same shot: the floor bounce is its mechanic too,
          // so it reaches the body as well - once.
          const body2 = spawn(0, 12.8);
          bare();
          give('skipstone');
          legs.length = 0;
          fire();
          detail.skipFloorLegs = legs.length;
          detail.skipFloorChained = chained();
          detail.skipFloorDealt = dealtBy(body2);
          despawn(body2);
          // THE WALL SHOT. Aimed low at the far wall, the first touch is a
          // WALL: ECHO comes off it, falls to the floor, comes off THAT, and
          // stops on the third surface - three legs, two bounces, and all of
          // them chained toe to heel. SKIPSTONE has no floor to read and
          // stops dead - one leg, no bounce.
          aimFrom(0, 1.7, 20, 0, 0.5, -22);
          bare();
          legs.length = 0;
          fire();
          detail.bareWallLegs = legs.length;
          give('skipstone');
          legs.length = 0;
          fire();
          detail.skipWallLegs = legs.length;
          detail.skipWallChained = chained();
          bare();
          give(itemId);
          legs.length = 0;
          fire();
          detail.echoWallLegs = legs.length;
          detail.echoWallChained = chained();
          result.ok = detail.bareFloorLegs === 1 && detail.bareFloorDealt === 0
            && detail.echoFloorLegs === 2 && detail.echoFloorChained === true
            && Math.abs(detail.echoFloorDealt - base()) < 1e-6
            && detail.skipFloorLegs === 2 && detail.skipFloorChained === true
            && Math.abs(detail.skipFloorDealt - base()) < 1e-6
            && detail.bareWallLegs === 1
            && detail.skipWallLegs === 1 && detail.skipWallChained === true
            && detail.echoWallLegs === 3 && detail.echoWallChained === true;
          delete g.effects.tracer;
          break;
        }

        // ---- CHORUS: two extra voices per shot -----------------------------
        case 'chorus': {
          const body = spawn(0, -6);
          aimFrom(0, 0.8, 0, 0, 0.8, -6);
          const b = base();
          give(itemId);
          detail.count = p.mods.chorus;
          detail.each = p.mods.chorusDamage;
          detail.spread = p.mods.spreadAdd;
          const magBefore = p.mag;
          resetBody(body);
          fire();
          detail.dealt = dealtBy(body);
          detail.magSpent = magBefore - p.mag;
          detail.base = b;
          result.ok = detail.count === 2 && Math.abs(detail.each - 0.6) < 1e-9
            && Math.abs(detail.spread - 0.012) < 1e-9
            && Math.abs(detail.dealt - b * 2.2) < 1e-6
            && detail.magSpent === 1;
          despawn(body);
          break;
        }
      }
      result.detail = JSON.stringify(detail);
    } finally {
      // ---- restore, in the reverse order of the save -----------------------
      delete g.effects.tracer;
      g.totemArea.addTargets = addTotem;
      g.mysteryBox.addTargets = addBox;
      g.donationMachine.addTargets = addCabinets;
      g.arena.meshList.length = 0;
      g.arena.meshList.push(...meshList);
      g.enemies.length = 0;
      g.enemies.push(...enemies);
      for (const k of Object.keys(p.passiveItems)) delete p.passiveItems[k];
      Object.assign(p.passiveItems, owned);
      p.rebuildMods();
      Object.assign(p, saved);
      p.pos.copy(pos);
      p.vel.copy(vel);
      p.weapon.spread = weaponSpread;
      p.weapon.aimSpread = weaponAim;
      g.state = state;
    }
    return result;
  }, id);
}
