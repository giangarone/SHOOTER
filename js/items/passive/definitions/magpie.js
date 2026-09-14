import { definePassiveItem } from '../shared.js';

// ---- THE TWO COMPANIONS --------------------------------------------------
//
// Nothing else the player owns is ALIVE. A turret is furniture with a
// cooldown and the bees are a cloud on a timer; these two are around for the
// whole run, they move on their own account, and the player will watch them.
// That is the whole reason they are worth the geometry: a passive item you
// can see doing its job is a different kind of ownership from a number in a
// stat block, and the pool had none of it.
//
// Both live in js/companions.js, and NEITHER is a deployable - a deployable
// is swept at every wave end (see _clearHazards), and a pet that had to be
// re-summoned every wave would be a pet the player buries once a minute.
export const id = 'magpie';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MAGPIE',
    max: 1,
    theme: THEME.magpie,
    // IT DOES NOT EARN MONEY, IT SAVES IT. Every orb it walks onto is one the
    // player was going to collect anyway or was going to lose to ORB_LIFETIME,
    // and it is only ever worth something in the second case - so the pick is
    // "the corner of the room you did not have time to go back for", which is
    // a real thing that happens in every wave and which nothing else answers.
    //
    // Deliberately NOT a magnet passive item. Lodestone already widens the radius
    // around the player; the bird is somewhere else, which is the only thing
    // it can offer that a bigger circle cannot.
    effects: [['A PET BIRD GATHERS', GOOD], ['CREDITS FOR YOU', NOTE]],
    apply: (mods, n) => { mods.magpie = n; },
}));
