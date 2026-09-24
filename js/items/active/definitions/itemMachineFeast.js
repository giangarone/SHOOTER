import { defineActiveItem } from '../shared.js';

export const id = 'itemMachineFeast';

export default defineActiveItem(({ THREE, Turret, Mine, Bomb, FireWall, HoleOrb, Bee, Meteor, Lob, Monkey, MONKEY_FUSE, Snowman, SNOWMAN_FUSE, BOUND, _v, _dir, nearestEnemies, facing, heal, pay, GOOD, NOTE, PAY_TO_WIN_COST, PARACHUTE_COST }) => ({
    name: 'MACHINE FEAST',
    charge: 0,
    theme: 0xb71c1c,
    // A TURRET BOUGHT WITH BLOOD, AND THE BLOOD IS THE CHARGE. Ten health,
    // gone the moment the button is pressed, whatever happens next - through
    // pay(), the same non-damage bypass BLOOD PRICE pays with, so it cannot
    // be dodged by Evasion, eaten by a shield or walked back by a totem, and
    // it can never kill you. The meter is never drawn because there is
    // nothing to earn: what the item costs is what the health bar says, and
    // that was already the readout.
    //
    // WHY IT IS NOT SPAM-PROOF AND WHY THAT IS FINE: every press buys a gun
    // that works for ten seconds and costs a tenth of the bar, so the player
    // rationing it is the item's entire decision. A player at full health
    // mashing it converts their whole health bar into turrets standing in
    // the same spot, which is exactly the bad trade the button exists to
    // make legible.
    //
    // REFUSED UNDER TEN. pay() floors at one, and a press at nine would be a
    // turret bought for what was left - a different price from the one on
    // the card, paid silently. The denial growl is the honest answer there:
    // the head is too thin to open.
    //
    // THE LIFE IS SPELLED OUT in the card text rather than worn as "10s",
    // because the item's charge is zero and the pool's readout check sweeps
    // every effect line for the charge cost printed with an s after it -
    // "10s" ends the same way. The number the player must never see is the
    // METER'S price, and this one has no meter.
    effects: [['TAKE 10 HP DAMAGE', NOTE], ['DEPLOY A TURRET', GOOD], ['FOR TEN SECONDS', NOTE]],
    ready: (game) => game.player.health > 10,
    use: (game) => {
      const p = game.player;
      pay(p, 10);
      facing(game);
      const dmg = p.getEffectiveDamage(p.weapon.damage);
      const x = Math.max(-BOUND + 1, Math.min(BOUND - 1, p.pos.x + _dir.x * 2.2));
      const z = Math.max(-BOUND + 1, Math.min(BOUND - 1, p.pos.z + _dir.z * 2.2));
      const t = new Turret(game, x, z, dmg, p.pos.y);
      t.life = 10;
      // Born facing the way the player was looking, like the rack post: the
      // turret snaps to its own target on its own update, and the player
      // reads what it is until then.
      t.yaw = Math.atan2(_dir.x, _dir.z);
      t.head.rotation.y = t.yaw + Math.PI;
      game.deploy(t);
      // THE PRICE IS PAINTED ON THE ROOM, not just on the bar: the wet thud
      // is the sound health leaving the player makes, and the red burst at
      // their feet is why.
      game.effects.burst(p.pos, 0xb71c1c, 14, 4, 2.5, 0.5);
      game.effects.addShake(0.12);
      game.ui.damage();
      game.sfx.itemPact();
    },
}));

export const icon = [
  // A cog whose longest tooth is a gun barrel: the machine, and what it eats.
  '........................',
  '..........02220.........',
  '..........02220.........',
  '....0......0.0......0...',
  '....020...02220...020...',
  '.....020.0222220.020....',
  '......0202222222020.....',
  '.......022222222220.....',
  '......02222222222220....',
  '.0...022222333322220....',
  '.020.022223333322203330.',
  '022200222233333222003333',
  '.020.022223333322203330.',
  '.0...022222333322220....',
  '......02222222222220....',
  '.......022222222220.....',
  '......0202222222020.....',
  '.....020.0222220.020....',
  '....020...0.0....020....',
  '....0....022220.....0...',
  '..........02220.........',
  '........................',
  '........................',
  '........................',
];
