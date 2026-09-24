"""Procedural source for non-item pixel icons.

Item drawings live beside their definitions in js/items/.
"""


import math
from canvas import STRUCT as S, SHADOW as D, ENERGY as E, PALE as P


DEEP = '0'  # holes, sockets and cracks darker than the lit face
ICONS = {}
RAW = {'pickBattery'}


def icon(name):
    def wrap(fn):
        ICONS[name] = fn
        return fn
    return wrap


def finish(c):
    # Structure first, then energy, so an energy edge steps down to STRUCT and
    # is not darkened twice into the shadow tone.
    c.shade(S, D)
    c.shade(E, S, P)


def ellipse(c, cx, cy, rx, ry, t):
    c._scan(lambda px, py: ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, t)


def bullet(c, x0, y0, w, h, tone_case, tone_tip, tip=0.38):
    """A cartridge standing on end, nose down. Used by the ammo family."""
    nose = y0 + h * (1 - tip)
    c.rect(x0, y0, x0 + w, nose, tone_case)
    for y in range(int(nose) + 1, int(y0 + h) + 1):
        t = (y - nose) / max(1e-6, (y0 + h - nose))
        half = (w / 2) * max(0.0, 1 - t * t)
        c.rect(x0 + w / 2 - half, y, x0 + w / 2 + half, y, tone_tip)


def flame(c, cx, base, w, h, t):
    """One tongue of fire.

    Explicit control points, not a smooth taper: a taper is a cone, and a cone
    is what the first pass at INCENDIARY looked like on the contact sheet. The
    pinch on the right edge and the bulge above it are the whole silhouette.
    """
    L = [(0.00, -1.00), (0.20, -1.03), (0.40, -0.88), (0.56, -0.60),
         (0.70, -0.50), (0.84, -0.33), (0.94, -0.15), (1.00, 0.00)]
    R = [(1.00, 0.00), (0.90, 0.20), (0.78, 0.46), (0.64, 0.66), (0.52, 0.50),
         (0.42, 0.30), (0.30, 0.80), (0.16, 1.03), (0.00, 1.00)]
    pts = [(cx + dx * w, base - s * h) for s, dx in L + R]
    c.poly(pts, t)
    c.disc(cx, base - w * 0.34, w * 0.78, t)   # a fire sits in a pool, not on a point


def arrow(c, x0, y0, x1, y1, t, shaft=2.0, head=4.0):
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy) or 1
    ux, uy = dx / L, dy / L
    c.line(x0, y0, x1 - ux * head * 0.8, y1 - uy * head * 0.8, t, shaft)
    c.poly([(x1, y1),
            (x1 - ux * head + uy * head * 0.62, y1 - uy * head - ux * head * 0.62),
            (x1 - ux * head - uy * head * 0.62, y1 - uy * head + ux * head * 0.62)], t)


@icon('ammoBox')            # the AMMO station
def _(c):
    c.rect(3, 8, 20, 20, S)
    c.rect(2, 6, 21, 9, S)
    c.rect(3, 12, 20, 14, E)
    bullet(c, 8, 1, 3.4, 5.4, E, E)
    bullet(c, 13, 1, 3.4, 5.4, E, E)


@icon('gear')               # the REROLL stations
def _(c):
    # The two-arrow "again", with each head laid on its own tangent - a head
    # placed by eye ends up looking like a pennant hanging off a ring.
    for a0, a1, head in ((25, 155, 25), (205, 335, 205)):
        c.arc(12, 12, 8.6, 3.0, a0, a1, S)
        t = math.radians(head)
        px, py = 12 + math.cos(t) * 8.6 - 1.5, 12 - math.sin(t) * 8.6 + 1.5
        tx, ty = math.sin(t), math.cos(t)          # clockwise tangent
        c.poly([(px + tx * 5.2, py + ty * 5.2),
                (px - ty * 4.4, py + tx * 4.4),
                (px + ty * 4.4, py - tx * 4.4)], E)


@icon('gun')                # a weapon offer
def _(c):
    c.poly([(0.5, 10.5), (6, 9), (6, 16.5), (0.5, 15.5)], S)   # stock
    c.rect(6, 9, 15, 15, S)                                     # receiver
    c.rect(15, 10.5, 21, 12.5, S)                               # barrel
    c.rect(20.5, 9.5, 22.5, 13.5, E)                            # muzzle
    c.rect(11, 6.5, 13, 9, S)                                   # sight
    c.poly([(8.5, 15), (12.5, 15), (11.5, 21.5), (7.5, 21.5)], S)
    c.arc(13.5, 16.5, 3.4, 1.4, 200, 340, S)                    # trigger guard
    c.rect(6.8, 10.5, 9.8, 12.8, E)                             # cell


@icon('pickAmmo')           # the ammo drop
def _(c):
    # A magazine, seen flat. The station's icon is a BOX of them; this is the
    # single mag that comes off a body, which is the difference between the two.
    c.rect(9.5, 1.5, 14.5, 6, S)               # feed lips, narrower than the body
    c.rect(7, 6, 17, 21, S)                    # the body
    c.rect(7, 18.5, 17, 21, E)                 # floor plate
    for y in (8, 12):                          # rounds showing through
        c.rect(9, y, 15, y + 2.6, E)


@icon('pickHealth')         # the health drop
def _(c):
    # A cross, not a heart. The two active items that RAISE the bar - GRAFT
    # and WATERLINE - are the hearts, and a pickup that only tops you up must
    # not wear the icon of a thing that moves the ceiling.
    c.rect(9, 2.5, 15, 21.5, S)
    c.rect(2.5, 9, 21.5, 15, S)
    c.rect(10.5, 4.5, 13.5, 19.5, E)
    c.rect(4.5, 10.5, 19.5, 13.5, E)


@icon('pickDamage')         # RAGE - damage and move speed
def _(c):
    # A fist. The buff is the one that makes you push INTO the crowd, and a
    # blade or a chevron would say "weapon" rather than "you, harder". The
    # knuckles are bumps on the SILHOUETTE and not grooves inside it: grooves
    # vanish at the size this is read at.
    for x in (5, 8.4, 11.8):
        c.disc(x + 1.7, 8.6, 2.7, S)           # three knuckles along the top
    c.rect(5, 8, 15.5, 17.5, S)                # the hand
    c.rect(15, 10.5, 19, 15, S)                # thumb, folded across
    c.rect(6.5, 17, 15, 21.5, S)               # wrist
    c.rect(6.5, 19, 15, 21.5, E)               # and its cuff
    c.rect(6, 11.5, 15, 13.5, E)               # the line the fingers close on


@icon('pickRate')           # fire rate
def _(c):
    # A bolt. Rate of fire is the one pickup whose meaning is SPEED rather than
    # force, and the bolt is the only shape in the set that says that outright.
    c.poly([(13.5, 1.5), (5, 13), (10.5, 13), (8.5, 22.5), (18.5, 10),
            (12.5, 10), (15.5, 1.5)], S)
    c.poly([(12.8, 4.5), (8.2, 11.5), (12.2, 11.5), (10.6, 18),
            (15.6, 11.2), (11.8, 11.2), (13.6, 4.5)], E)


@icon('pickShield')         # the shield
def _(c):
    c.poly([(12, 1.5), (21.5, 5.5), (21.5, 13), (12, 22.5), (2.5, 13),
            (2.5, 5.5)], S)
    c.poly([(12, 5.5), (18.5, 8.2), (18.5, 12.5), (12, 18.5), (5.5, 12.5),
            (5.5, 8.2)], E)
    c.poly([(12, 9), (15.5, 10.5), (15.5, 12.5), (12, 15.5), (8.5, 12.5),
            (8.5, 10.5)], S)


@icon('pickMagnet')         # sweeps every money orb on the floor to you
def _(c):
    # A horseshoe magnet, and the ONE place in the set where that shape is
    # allowed: SCAVENGER draws a magnet too, but it is a passive item icon on a
    # totem and this is an object on the floor, so the two are never read side
    # by side. The poles are the lit part - the pull is what it does.
    c.arc(12, 13.5, 8.4, 3.6, 180, 360, S)
    c.rect(3.6, 13.5, 7.2, 20.5, S)
    c.rect(16.8, 13.5, 20.4, 20.5, S)
    c.rect(3.6, 17.5, 7.2, 20.5, E)
    c.rect(16.8, 17.5, 20.4, 20.5, E)
    c.disc(12, 4.6, 3.0, E)                    # the orb, on its way in


@icon('pickBattery')        # BATTERY PICKUP - the item meter, filled
def _(c):
    c.blit([
        '........................',
        '........................',
        '.........22222..........',
        '.........22222..........',
        '......2222222222........',
        '......2222222222.1......',
        '......22222222221.......',
        '......223333322221......',
        '......2233333322221.....',
        '......2223333322221.....',
        '......2222333222221.....',
        '......2222333322221.....',
        '......2222233332221.....',
        '......2222233333221.....',
        '......2222223333221.....',
        '......2222233322221.....',
        '......2222333222221.....',
        '......2223332222221.....',
        '......2233322222221.....',
        '......2233222222221.....',
        '......2222222222221.....',
        '......1111111111111.....',
        '........................',
        '........................',
    ], 0, 0)


@icon('statusFire')         # burning: damage over time
def _(c):
    # One tongue, bigger than INCENDIARY's and with no second flame off the
    # pinch: on a chip the size of a thumbnail a two-flame silhouette reads as
    # a blur, and this one has to be legible at a glance rather than admired.
    flame(c, 12, 22.0, 9.4, 21.0, S)
    flame(c, 11.4, 20.6, 4.4, 12.5, E)


@icon('statusPoison')       # damage over time
def _(c):
    # A droplet with the bubbles coming off it. VENOM ROUNDS is a poisoned
    # CARTRIDGE - what your bullets carry; this is the stuff itself, in you.
    # The droplet is drawn here rather than with drop(): that helper's tail is
    # a spike two pixels wide at the top, which survives on a totem two metres
    # tall and disappears on a 28px chip.
    c.disc(12, 15.6, 6.6, S)
    c.poly([(12, 4.0), (18.0, 16.0), (6.0, 16.0)], S)
    c.disc(12, 15.8, 3.4, E)
    c.disc(6.0, 6.4, 2.6, E)                   # bubbles, off to either side
    c.disc(18.4, 4.6, 2.0, E)


@icon('statusFear')         # the trigger does nothing
def _(c):
    # A face mid-scream. No jaw and no teeth, which is what keeps it clear of
    # TERROR's skull, and the mouth is a hole rather than a shape: the eye
    # finds a black oval in a lit face faster than it finds any drawn feature.
    # Nothing floats off the head - detached marks at this size read as dirt.
    ellipse(c, 12, 12.4, 8.0, 9.6, S)
    c.disc(8.7, 9.6, 2.6, E)                   # eyes, wide
    c.disc(15.3, 9.6, 2.6, E)
    ellipse(c, 12, 17.2, 2.8, 3.8, DEEP)       # the mouth


@icon('statusWeakness')     # your weapon hits softer
def _(c):
    # A cracked round and, beside it, the direction the number went. The round
    # is the STRUCTURE and the arrow is the ENERGY, so the lit part of the icon
    # is the part that names the effect - the rule the whole set runs on.
    # SNAPPED IN TWO, not cracked. A crack is a one-pixel scratch and a
    # one-pixel scratch is invisible on a chip; a round in two pieces with a
    # gap between them and the halves out of line says the same thing with the
    # SILHOUETTE, which survives at any size.
    bullet(c, 3.0, 1.8, 6.2, 9.4, S, S, 0.0)   # the case, square-cut
    bullet(c, 4.8, 13.0, 6.2, 9.4, S, S, 0.5)  # the nose, dropped and offset
    arrow(c, 17.4, 3.5, 17.4, 21.0, E, 3.4, 6.8)


@icon('statusCurse')        # everything hurts you 25% more
def _(c):
    # A horned sigil, not a skull: TERROR wears the skull and the two would
    # collapse into one another on a HUD chip. The mark is a ring because a
    # curse is a thing PUT ON you, and the horns are what say whose it is.
    c.ring(12, 14.6, 7.8, 3.0, S)
    c.poly([(6.8, 11.4), (17.2, 11.4), (12, 19.4)], E)   # the point-down mark
    for s in (-1, 1):                          # horns, grown off the ring
        c.poly([(12 + 4.6 * s, 8.4), (12 + 8.2 * s, 8.6),
                (12 + 10.4 * s, 1.5), (12 + 6.6 * s, 6.2)], S)


@icon('statusSlowness')     # you move at a fraction of your pace
def _(c):
    # AN ICICLE HANGING OFF A LEDGE. The chip used to be a boot frozen into a
    # block of ice, which named the effect and its cause in one picture and was
    # the right idea - but at 24 pixels the boot inside the block was a dark
    # smudge, and the block read as a rock about as often as as ice.
    #
    # ONE BIG SPIKE, not three even ones. Three read as a comb, and a comb is
    # what every attempt at this shape turns into once the taper eats the width:
    # a 24-pixel icon has room for exactly one thing with a point on it. The two
    # stubs either side are there so the ledge is not carrying a single spike -
    # they are texture, and they are deliberately different lengths.
    #
    # NOTHING ELSE IN THE CATALOGUE OWNS A SPIKE POINTING DOWN. CRYO PULSE is a
    # flake inside a shockwave and ABSOLUTE ZERO is the hexagon, so this cannot
    # be mistaken for either - and DOWN is the whole reading: everything in the
    # icon points at the floor, which is where a slow puts you.
    c.rect(1.5, 2.0, 22.5, 5.6, S)
    # The underside of the ledge, so the ice grows out of shadow rather than out
    # of a lit edge - which is what stops the bar reading as a shelf.
    c.rect(1.5, 4.8, 22.5, 5.6, D)
    c.poly([(6.0, 5.0), (18.0, 5.0), (12.2, 22.4)], S)
    # The lit front face, offset to the light and stopping short of the point:
    # this is the ENERGY, so the eye lands on the ice and not on what holds it.
    c.poly([(8.0, 5.4), (12.2, 5.4), (12.2, 20.0)], E)
    c.poly([(2.2, 5.0), (5.6, 5.0), (4.0, 10.6)], S)
    c.poly([(18.4, 5.0), (21.8, 5.0), (20.0, 9.4)], S)
    c.poly([(2.9, 5.4), (4.0, 5.4), (4.0, 9.2)], E)
    c.poly([(19.1, 5.4), (20.0, 5.4), (20.0, 8.2)], E)
