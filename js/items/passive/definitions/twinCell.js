import { definePassiveItem } from '../shared.js';

export const id = 'twinCell';

export default definePassiveItem(({ THEME, GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'TWIN CELL',
    max: 1,
    theme: THEME.cell,
    // A SECOND CHARGE, NOT A SECOND SLOT. The slot is still one deep and the
    // item in it is still the run's answer to one problem - what changes is
    // that the answer can be given twice in a row, which is a different thing
    // entirely from carrying two answers. Everything the file's opening note
    // says about the slot survives this word for word.
    //
    // The second charge begins filling the instant the first is full, out of
    // the same kills, so what the player is really buying is the right to bank
    // charge they would otherwise have thrown away - see the clamp in
    // Player.addItemCharge, which used to drop the overflow on the floor.
    effects: [['STORE 2 ITEM CHARGES', GOOD], ['THE 2nd FILLS ONCE', NOTE], ['THE 1st IS FULL', NOTE]],
    apply: (mods, n) => { mods.activeItemChargeCap = 1 + n; },
}));

export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '......221.......221.....',
  '...222222221.222222221..',
  '...222222221.222222221..',
  '...233333321.220000001..',
  '...233333321.220000001..',
  '...233333321.220000001..',
  '...233333321.220000001..',
  '...233333321.220000001..',
  '...233333324.220000001..',
  '...233333321.220000001..',
  '...233333321.223333331..',
  '...233333321.223333331..',
  '...233333321.223333331..',
  '...233333321.223333331..',
  '...233333321.223333331..',
  '...233333321.223333331..',
  '...111111111.111111111..',
  '........................',
  '........................',
  '........................',
];
