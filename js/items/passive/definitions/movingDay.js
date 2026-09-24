import { definePassiveItem } from '../shared.js';

// WHAT IS STILL ON THE FLOOR WHEN THE WAVE ENDS, IN ROUNDS. The sweep pays
// the credits as it always did; this is paid on top of them, per orb, which
// makes the pick a reason to STAY IN THE FIGHT rather than to break off and
// tidy up after every kill.
//
// THE EXPLOIT IT IS PRICED AGAINST: hoard the floor, collect nothing, cash
// in at the clear. It does not work, and the reason is ORB_LIFETIME - an orb
// left for more than twenty seconds is gone, money and all, so a player
// hoarding deliberately is burning credits for rounds at a rate nobody would
// take. What is left at a clear is the orbs from the last twenty seconds of
// the fight, which is what the pick is actually paying for.
//
// The reserve's own ceiling is the cap; there is no second one.
export const id = 'movingDay';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MOVING DAY',
    max: 1,
    theme: THEME.movingDay,
    effects: [['AT WAVE END:', NOTE], ['FLOOR ORBS BECOME', NOTE], ['5 AMMO EACH', GOOD]],
    apply: (mods, n) => { mods.movingDay = 5 * n; },
}));

export const icon = [
  '........................',
  '........................',
  '...22221.......44442....',
  '..2222221......43332....',
  '..22200221.....43332....',
  '..22000221.....43332....',
  '..22000211.....43332....',
  '..1222221......43322....',
  '...112111......2322.....',
  '.....11.........22......',
  '........................',
  '...0000000000000000000..',
  '...0000000000000000000..',
  '...0000000000000000000..',
  '...2000222222222200021..',
  '...2222000222200022221..',
  '...2222220000002222221..',
  '...2222222000022222221..',
  '...2222000222200022221..',
  '...2200022222222000221..',
  '...0002222222222220001..',
  '...1111111111111111111..',
  '........................',
  '........................',
];
