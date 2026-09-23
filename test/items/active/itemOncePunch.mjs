// ONCE-PUNCH POLICY: the next melee swing that CONNECTS kills, whoever it
// connects with. The property that matters is the route - hp zeroed, `dead`
// raised, the sweep books it - because a Colossus's plating is the correct
// answer to the ordinary damage path and no answer at all to this one. The
// other half of the card: a swing at air costs nothing.
export async function run({ page, check, id }) {
  const r = await page.evaluate((id) => {
    const g = window.__game;
    const P = g.player;
    const out = {};
    g.state = 'playing';
    g.waveState = 'active';
    P.passiveItems = {};
    P.rebuildMods();
    g.runningActiveItems.clear(g);
    g.enemies.length = 0;
    P.yaw = 0;

    P.giveActiveItem(id);
    g.tryActiveItem();
    out.armed = P.meleeExecute === 1;

    // A swing at fresh air: the policy is still standing afterwards - it is
    // the next melee HIT it is promised on, and a whiff is not one.
    g._meleeStrike();
    out.missKeepsIt = P.meleeExecute === 1;

    // A body put squarely in the swing's reach, too fat to be felled by any
    // number the melee could plausibly roll. yaw zero aims down -z.
    const V = P.pos.constructor;
    const e = new g.__EnemyForTest('colossus', new V(P.pos.x, 0, P.pos.z - 1.6), 1, 1, 1);
    g.scene.add(e.group);
    g.enemies.push(e);
    out.tough = e.hp > 100;
    g._meleeStrike();
    out.wiped = e.dead === true && e.hp === 0;
    out.spent = P.meleeExecute === 0;
    out.tagged = e.meleeKill === true;

    g.enemies.length = 0;
    g.scene.remove(e.group);
    P.meleeExecute = 0;
    return out;
  }, id);
  check('ONCE-PUNCH POLICY keeps until a swing lands, then instakills through the _throatCut route',
    r.armed && r.missKeepsIt && r.tough && r.wiped && r.spent && r.tagged,
    JSON.stringify(r));
}
