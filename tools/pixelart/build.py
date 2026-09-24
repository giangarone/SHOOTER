"""Generate the sixteen non-item drawings in js/pixelicons.js.

Item drawings are maintained beside their definitions in js/items/.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from canvas import Canvas
import icons as A

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TARGET = os.path.join(ROOT, 'js', 'pixelicons.js')

NOTE = {
    'ammoBox': 'AMMO STATION.',
    'gear': 'REROLL STATIONS.',
    'gun': 'WEAPON OFFER.',
    'pickAmmo': 'AMMO PICKUP - one magazine off a body.',
    'pickHealth': 'HEALTH PICKUP - a cross.',
    'pickDamage': 'RAGE PICKUP - damage and speed. A fist.',
    'pickRate': 'FIRE RATE PICKUP - a bolt.',
    'pickShield': 'SHIELD PICKUP.',
    'pickMagnet': 'MAGNET PICKUP - every orb on the floor comes to you.',
    'pickBattery': "BATTERY PICKUP - the active item's meter, filled. A cell with the charge still in it, and the bolt is what the plate promises.",
    'statusFire': 'BURNING - a status on the PLAYER. Damage over time.',
    'statusPoison': 'POISONED - a status on the player. Damage over time.',
    'statusFear': 'AFRAID - a status on the player. The trigger does nothing.',
    'statusWeakness': 'WEAKENED - a status on the player. Your shots hit softer.',
    'statusCurse': 'CURSED - a status on the player. Everything hurts 25% more.',
    'statusSlowness': 'SLOWED - a status on the player. You move at a fraction.',
}


def draw(name):
    c = Canvas()
    A.ICONS[name](c)
    if name not in A.RAW:
        A.finish(c)
    return c.rows()


def build():
    out = []
    for name in A.ICONS:
        rows = draw(name)
        note = NOTE.get(name)
        if note:
            out.append('  // ' + note)
        out.append('  %s: [' % name)
        out.extend("    '%s'," % r for r in rows)
        out.append('  ],')
    return '\n'.join(out)


if __name__ == '__main__':
    src = open(TARGET).read()
    head = 'const PIXEL_ICONS = {\n'
    a = src.index(head) + len(head)
    b = src.index('\n};', a)
    # Built in full BEFORE the file is opened for writing: `open(w)` truncates,
    # and a draw() that raises after that point leaves nothing behind.
    out = src[:a] + build() + src[b:]
    open(TARGET, 'w').write(out)
    print('%d icons written' % len(A.ICONS))
