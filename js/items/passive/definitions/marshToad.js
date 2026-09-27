import { definePassiveItem } from '../shared.js';

export const id = 'marshToad';

export default definePassiveItem(({ GOOD, BAD, NOTE, step, pctUp, pctDown, secs }) => ({
    name: 'MARSH TOAD',
    max: 1,
    theme: 0x76c75a,
    // THE CLEANSE THAT WALKS - WHITE CELL's payload on a pet's terms. It
    // clears EVERYTHING at once: a lick that left the chill on would be a pet
    // whose homework the player has to check. The cooldown and the hop over
    // are what make it a toad rather than the item.
    effects: [['A PET TOAD LICKS', GOOD], ['BAD EFFECTS OFF YOU', GOOD], ['EVERY 5s', NOTE]],
    apply: (mods, n) => { mods.marshToad = n; },
}));

// A squat toad seen front-on, tongue out to the left licking a status-wisp
// off the air: eye bumps on top, the mouth seam across the whole face, the
// pale throat sac under it, warts on the back and splayed feet at the base.
export const icon = [
  '........................',
  '........................',
  '........................',
  '........................',
  '..4.....................',
  '.434....................',
  '..3.....................',
  '...33....44....44.......',
  '....333.40422240421.....',
  '.....333222222222221....',
  '......22000000000021....',
  '......22224444422221....',
  '......22224444222221....',
  '.....2222232232222221...',
  '.....2223222222222221...',
  '....22222222222222221...',
  '....2222222222222221....',
  '....21222222222222211...',
  '...22222..11111122222...',
  '..4224224......4224224..',
  '....111.......111.......',
  '........................',
  '........................',
  '........................',
];