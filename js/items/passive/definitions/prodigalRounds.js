import { definePassiveItem } from '../shared.js';

// BRASS ECHO'S MIRROR IMAGE. That pick pays back a round that HIT and this
// one pays back a round that did not, and the pair is deliberate: between
// them there is no shot in the game that is simply gone.
//
// TWENTY PER CENT RATHER THAN BRASS ECHO'S FIVE, because a miss is worth less
// than a hit by definition - the player got nothing else out of it - and
// because what this is really priced against is the SCATTERGUN, which misses
// more than anything else in the game and pays the most ammunition for it.
//
// IT REFUNDS WHAT THE SHOT SPENT, not what a shot costs: a round fired inside
// OPENING SALVO's free window cost nothing, and paying it back would be
// making ammunition rather than getting it back.
export const id = 'prodigalRounds';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'PRODIGAL ROUNDS',
    max: 1,
    theme: THEME.prodigalRounds,
    effects: [['20% OF MISSED SHOTS', GOOD], ['RETURN TO THE RESERVE', NOTE]],
    apply: (mods, n) => { mods.prodigal = 0.2 * n; },
}));

export const icon = [
  '........................',
  '..........2221.22221....',
  '..........22222111121...',
  '..........222211...121..',
  '..........22211.....21..',
  '..........1221..221.221.',
  '...........121..111.211.',
  '............121.....21..',
  '.............121...211..',
  '......44442...1222211...',
  '.....4222232...11111....',
  '....422...232...........',
  '....42.....22...........',
  '...422..................',
  '..442...................',
  '..432...................',
  '..432...................',
  '..432...................',
  '.44332..................',
  '.23322..................',
  '..232...................',
  '...22...................',
  '...2....................',
  '........................',
];
