import { defineActiveItem } from '../shared.js';

export const id = 'itemMonkey';

export default defineActiveItem(({ THREE, THEME, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'ORGAN GRINDER',
    charge: 50,
    theme: THEME.hex,
    // THE ONLY ITEM IN THE GAME THAT TAKES THE PLAYER OUT OF THE FIGHT WITHOUT
    // MOVING THEM. Every other answer to being surrounded is about where the
    // PLAYER ends up - the dash, TECTONIC's shove, FIREBREAK's line, AEGIS's
    // window. This one changes where the enemies are LOOKING, and for five
    // seconds the answer is: not at you.
    //
    // IT CANNOT BE KILLED, and that is the whole reason the number on the card
    // is a number of seconds. A decoy with health would last as long as the
    // wave decided - forever on wave three, half a second on wave thirty - and
    // the player would have no way to know which run they were in.
    //
    // EIGHT OF THE PLAYER'S OWN SHOTS, snapshotted at the throw the way the
    // turret's and the mine's are: the monkey was wound up out of the gun that
    // was being held, and one that quietly got stronger because a totem was
    // claimed while it sat there would be a bomb nobody aimed. It is the
    // biggest single blast in the pool and it should be - it takes five
    // seconds, it has to be thrown somewhere useful, and the thing that makes
    // it worth eight shots is that the crowd walks INTO it.
    //
    // THE BLAST DOES NOT KNOW THE PLAYER, unlike SHORT FUSE's and WELCOME MAT's.
    // Those two are aimed at ground; this one is aimed at a crowd that is by
    // construction somewhere the player is not, and punishing them for having
    // been surrounded when they threw it would undo the item outright.
    effects: [
      ['THROW A CYMBAL MONKEY', GOOD],
      ['ENEMIES CHASE IT,', GOOD],
      ['NOT YOU. EXPLODES IN ' + MONKEY_FUSE + 's', NOTE],
    ],
    use: (game) => {
      const p = game.player;
      p.muzzleInto(_v);
      facing(game);
      game.deploy(new Monkey(game, _v, _dir, p.getEffectiveDamage(p.weapon.damage) * 8));
      game.sfx.itemMonkeyThrow();
    },
}));

export const icon = [
  '........................',
  '..................222...',
  '.................22..2..',
  '.................2...2..',
  '.........222221..2...2..',
  '........2222222244222...',
  '.....22222222223321.....',
  '....2222233003332221....',
  '....2222233003322221....',
  '....1222200000022211....',
  '.....22220000002221.....',
  '.....42120000001132.....',
  '....442.10000001.432....',
  '....432..120021..432....',
  '....43321.2222222432....',
  '....44211.2222112244....',
  '....4211..22221.1224....',
  '....444...22221..444....',
  '....432...22221..432....',
  '....432...22221..432....',
  '....232...11111..422....',
  '.....22..........22.....',
  '........................',
  '........................',
];
