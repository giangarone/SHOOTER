import { defineActiveItem } from '../shared.js';

export const id = 'itemMedicalDebt';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'MEDICAL DEBT',
    charge: 20,
    theme: THEME.pact,
    // FORTY NOW, THIRTY AT THE END OF THE WAVE, AND IT STACKS. BLOOD PRICE pays
    // its twenty-five up front and can never kill you; this one is the same
    // bargain with the terms reversed and the safety off - the bill arrives
    // when the wave does, it is thirty per press, and it goes through the
    // ordinary damage path, so a player who pressed it three times owes ninety
    // and may not have ninety.
    //
    // TWENTY POINTS, WHICH IS CHEAP ON PURPOSE. What makes this a decision is
    // not the charge, it is the arithmetic the player has to do about a wave
    // they have not finished yet - and an item that could only be afforded
    // once a wave would never get to make the second press interesting.
    //
    // THE BILL IS COLLECTED IN main.js, at the wave clear, and NOT by an
    // end() here: a running item's window is torn down when the wave ends,
    // which is the exact moment this is supposed to fire.
    effects: [['HEAL 40 HP NOW', GOOD], ['OWE 30 HP PER PRESS,', NOTE], ['PAID AT WAVE END', NOTE]],
    use: (game) => {
      const p = game.player;
      p.heal(40);
      p.medicalDebt += 30;
      game.effects.shockwave(p.pos, THEME.pact, 7, 0.6);
      game.effects.burst(p.eyeInto(_v), 0x8affc1, 26, 5, 3, 0.7);
      game.ui.banner('ON ACCOUNT');
      game.sfx.itemHeal2();
    },
}));
