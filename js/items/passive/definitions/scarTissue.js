import { definePassiveItem } from '../shared.js';

// The unconditional twin of UNTOUCHED, and the trade is the whole point: it
// asks nothing of how you play and charges a quarter more damage from every
// source for the rest of the run. It grows fastest exactly when it is worst
// to own - a long run - which is what keeps it a cursed pick rather than a
// slow common.
export const id = 'scarTissue';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'SCAR TISSUE',
    max: 1,
    theme: THEME.scar,
    // FIVE A WAVE, NOT TWO. Two was under the noise floor of a health bar that
    // scales with the wave: a player who took this on wave five and looked at
    // their bar on wave fifteen had earned twenty points, which is less than
    // one late hit, while the +25% taken had been charged on every hit in
    // between. The drawback was the only half of the trade anyone could feel.
    // THE CAP IS UNCHANGED at +80, so what changes is how fast it arrives - it
    // is paid off in sixteen waves instead of forty, and a long run still ends
    // holding the same ceiling with the same permanent 25% on top of it.
    effects: [['+5 MAX HP PER WAVE', GOOD], ['UP TO +80', NOTE], ['TAKE 25% MORE DAMAGE', BAD]],
    apply: (mods, n) => {
      mods.hpPerWave = 5 * n;
      mods.hpBankCap = Math.max(mods.hpBankCap, 80 * n);
      mods.damageTakenMult *= 1 + 0.25 * n;
    },
}));
