import { definePassiveItem } from '../shared.js';

export const id = 'overdraw';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'OVERDRAW',
    max: 1,
    theme: 0x69f0ae,
    // THE HEALTH ECONOMY'S ONLY LEAK, PLUGGED. A health crate walked over at
    // 98/100 used to be two points and a shrug, and every heal in the game -
    // Nanoweave's trickle, Vampiric's drip, the leech's two - quietly stopped
    // paying the moment the bar was full. Nothing is wasted now: the overflow
    // goes into the one meter that is never full for long.
    //
    // FIVE HP TO ONE POINT is deliberately a poor rate. One point of charge is
    // one dead chaser (see CHARGE_PER_VALUE in items.js), and five health is
    // worth a great deal more than one chaser to a player who is hurt - which
    // is exactly the trade: this is worth something only when the player is
    // ALREADY topped up, so it can never be a reason to stand in a fire.
    //
    // THE EXPLOIT, NAMED. Paired with a REGENERATING source - NANOWEAVE's 2
    // HP/s, or DIG IN's plant tick - this is the one thing in the game that
    // fills the item meter without killing anything, which is the rule
    // CHARGE_PER_VALUE exists to hold. The optimal play is to keep one slow
    // enemy alive at the far end of the arena and stand at full health, and it
    // pays 0.4 points a second for it - about a chaser every two and a half
    // seconds, for doing nothing.
    //
    // WHAT ALREADY BOUNDS IT: regen is gated on `combat` (see Player.update),
    // so none of it ticks at a wave break or in the shop - the wave has to be
    // running, which means something has to be alive and coming for you. The
    // rate is also the floor of what a wave pays anyway. It is left as it is
    // because the pairing costs TWO of the run's picks to assemble and one of
    // them is a heal the player then cannot spend, and because a player who
    // has worked that out has earned it. If it ever needs cutting, cut the
    // RATE here rather than adding a condition: a passive item that pays for
    // some heals and not others is the thing this was built to avoid.
    effects: [['OVERFLOW HEALING', NOTE], ['BECOMES ITEM CHARGE,', GOOD], ['1 CHARGE PER 5 HP', NOTE]],
    apply: (mods, n) => { mods.overdraw = 5 / n; },
}));

export const icon = [
  '........................',
  '......222221............',
  '......244421............',
  '......244421............',
  '......222221............',
  '..22222222222221........',
  '..22222222222221........',
  '..22222222222221........',
  '..22222222222221........',
  '..11112222211111........',
  '......222221............',
  '......222221............',
  '......222221.....221....',
  '......112211.....221....',
  '........432...222222221.',
  '........4322..220000021.',
  '........232...220000021.',
  '.........2342.220000021.',
  '..........422.220000021.',
  '..........22..223333321.',
  '............22223333321.',
  '..............223333321.',
  '..............222222221.',
  '..............111111111.',
];
