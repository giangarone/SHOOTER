"""What each mutation DOES, drawn at 24x24.

Nothing here looks at the 3D catalogue. Every shape was chosen from the
upgrade's own effect text, which is why several of them are nothing like the
object that used to stand for them - VENOM ROUNDS is a poisoned cartridge and
not a flask, because a flask says "poison" without saying that the AMMUNITION
is what carries it.

Two rules hold across the whole set:
  * the light is always upper-left, applied by Canvas.shade() and never by hand
  * STRUCTURE is the object, ENERGY is what the mutation does to it - so the
    lit part of an icon is always the part that names the upgrade
"""
import math
from canvas import Canvas, G, STRUCT as S, SHADOW as D, ENERGY as E, PALE as P

DEEP = '0'          # holes, sockets, cracks: darker than any lit face

ICONS = {}


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


def ering(c, cx, cy, rx, ry, k, t):
    c._scan(lambda px, py: k <= ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1, t)


def star(c, cx, cy, rout, rin, n, t, phase=90):
    pts = []
    for i in range(n * 2):
        a = math.radians(phase + i * 180.0 / n)
        r = rout if i % 2 == 0 else rin
        pts.append((cx + math.cos(a) * r, cy - math.sin(a) * r))
    c.poly(pts, t)


def spikes(c, cx, cy, r0, r1, n, w, t, phase=0):
    for i in range(n):
        a = math.radians(phase + i * 360.0 / n)
        c.line(cx + math.cos(a) * r0, cy - math.sin(a) * r0,
               cx + math.cos(a) * r1, cy - math.sin(a) * r1, t, w)


def bullet(c, x0, y0, w, h, tone_case, tone_tip, tip=0.38):
    """A cartridge standing on end, nose down. Used by the ammo family."""
    nose = y0 + h * (1 - tip)
    c.rect(x0, y0, x0 + w, nose, tone_case)
    for y in range(int(nose) + 1, int(y0 + h) + 1):
        t = (y - nose) / max(1e-6, (y0 + h - nose))
        half = (w / 2) * max(0.0, 1 - t * t)
        c.rect(x0 + w / 2 - half, y, x0 + w / 2 + half, y, tone_tip)


def drop(c, cx, cy, r, t):
    c.disc(cx, cy, r, t)
    c.poly([(cx, cy - r * 2.1), (cx + r * 0.85, cy + r * 0.3), (cx - r * 0.85, cy + r * 0.3)], t)


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


def chevron(c, cx, cy, size, t, dirx=1, diry=0, w=2.4):
    """A single > or ^ stroke. The movement family is built from these."""
    if diry:
        c.line(cx - size, cy + size * diry, cx, cy, t, w)
        c.line(cx + size, cy + size * diry, cx, cy, t, w)
    else:
        c.line(cx - size * dirx, cy - size, cx, cy, t, w)
        c.line(cx - size * dirx, cy + size, cx, cy, t, w)


def skullface(c, cx, cy, r, t, eye=DEEP):
    c.disc(cx, cy, r, t)
    c.rect(cx - r * 0.55, cy + r * 0.5, cx + r * 0.55, cy + r * 1.35, t)
    c.disc(cx - r * 0.45, cy - r * 0.1, r * 0.3, eye)
    c.disc(cx + r * 0.45, cy - r * 0.1, r * 0.3, eye)
    c.put(int(cx), int(cy + r * 0.62), eye)


# ---- rate of fire, magazine, ammunition ----------------------------------


@icon('overclock')          # FIRE RATE +20% per stack
def _(c):
    # A gauge with the needle swung THROUGH the dial and out the other side.
    # The needle has to cross the arc, or the two read as one solid shape.
    c.arc(12, 17, 9.2, 3.0, 18, 162, S)
    c.disc(12, 17, 2.8, S)
    c.line(12, 17, 20.5, 8.5, E, 2.6)
    c.disc(12, 17, 1.4, DEEP)


@icon('extendedMag')        # MAGAZINE +50% per stack
def _(c):
    c.rect(7, 3, 16, 5, S)                       # feed lips
    c.rect(8, 5, 15, 21, S)
    for y in (7, 11, 15, 19):                    # the rounds you can see through it
        c.rect(9, y, 14, y + 1, E)


@icon('speedLoader')        # RELOAD -30% per stack
def _(c):
    # A speedloader: the whole cylinder charged at once. Distinct from the
    # magazine above because reload speed and magazine SIZE must never rhyme.
    c.disc(12, 14, 8, S)
    c.rect(10.5, 2, 13.5, 7, S)
    c.disc(12, 14, 2.4, E)
    for i in range(6):
        a = math.radians(90 + i * 60)
        c.disc(12 + math.cos(a) * 5.0, 14 - math.sin(a) * 5.0, 1.9, DEEP)


@icon('beltFeed')           # some shots fire straight from the reserve
def _(c):
    # A linked belt: rounds arriving without a magazine in between.
    c.line(1, 8, 22, 13, S, 4.0)
    for i, x in enumerate((3.5, 9.0, 14.5, 20.0)):
        y = 8 + (x - 1) * 5 / 21
        c.rect(x - 1.6, y + 1.6, x + 1.6, y + 6.2, E)


@icon('ammoHoarder')        # 2x max reserve
def _(c):
    # A heap of loose rounds. Every container in this file is already spoken
    # for - box, drum, belt, crate - and the upgrade is not a container anyway,
    # it is a quantity. Spaced two pixels apart, or the generated outline has
    # nothing to run between them and the heap fuses into one blob.
    for x in (8.9, 15.1):
        bullet(c, x - 2.3, 1.5, 4.6, 9.5, S, E)
    for x in (5.6, 12.0, 18.4):
        bullet(c, x - 2.3, 13.0, 4.6, 9.5, S, E)


@icon('ammoFab')            # +2.5 ammo per second, out of nothing
def _(c):
    c.poly([(2, 2), (22, 2), (15, 10), (9, 10)], S)      # hopper
    c.rect(10, 10, 14, 12, S)
    bullet(c, 8.5, 14, 7, 10, E, E)                      # and rounds fall out of it


@icon('scavenger')          # ammo per kill, kills refill the reserve
def _(c):
    # A magnet: the ammunition comes to you off the bodies. Carried in solid
    # strokes, never as a masked ring - see the note in js/icons.js.
    c.arc(12, 16, 8.6, 3.8, 180, 360, S)
    c.rect(3.4, 9, 7.2, 16, S)
    c.rect(16.8, 9, 20.6, 16, S)
    c.rect(3.4, 9, 7.2, 12, E)
    c.rect(16.8, 9, 20.6, 12, E)
    bullet(c, 9.5, 1, 5, 7, E, E)


@icon('lodestone')          # money and pickups come to you, three tiers
def _(c):
    # NOT a magnet - SCAVENGER above is already the magnet, and two horseshoes
    # in one set would make the pair unreadable at totem distance. This is the
    # money itself: one coin, with three smaller ones falling into its orbit.
    # As a flat black shape it is a big disc with three dots around it, which
    # nothing else in the set is.
    c.disc(12, 12, 5.2, S)
    c.disc(12, 12, 2.8, E)
    for a in (90, 210, 330):
        r = math.radians(a)
        cx, cy = 12 + math.cos(r) * 9.0, 12 - math.sin(r) * 9.0
        # The tail points back the way the coin came from, so the three of them
        # read as moving inward rather than as decoration on a ring.
        c.line(cx + math.cos(r) * 2.8, cy - math.sin(r) * 2.8, cx, cy, S, 1.4)
        c.disc(cx, cy, 1.6, E)


@icon('ammoBox')            # the AMMO station
def _(c):
    c.rect(3, 8, 20, 20, S)
    c.rect(2, 6, 21, 9, S)
    c.rect(3, 12, 20, 14, E)
    bullet(c, 8, 1, 3.4, 5.4, E, E)
    bullet(c, 13, 1, 3.4, 5.4, E, E)


# ---- damage ---------------------------------------------------------------


@icon('hollowPoint')        # +30% damage, -25% magazine
def _(c):
    # The round nose-on, opened out. The cavity is what the upgrade is named
    # for, so the cavity is the shape - not a ring with a cross in it, which
    # is a first-aid symbol wearing the wrong colour.
    c.disc(12, 12, 9.2, S)
    for i in range(6):
        a = math.radians(90 + i * 60)
        c.poly([(12 + math.cos(a) * 9.4, 12 - math.sin(a) * 9.4),
                (12 + math.cos(a + 0.34) * 2.2, 12 - math.sin(a + 0.34) * 2.2),
                (12 + math.cos(a - 0.34) * 2.2, 12 - math.sin(a - 0.34) * 2.2)], DEEP)
    c.disc(12, 12, 2.6, DEEP)
    c.ring(12, 12, 9.2, 1.4, E)


@icon('steadyAim')          # +40% damage WHILE STANDING STILL
def _(c):
    c.ring(12, 9, 6.4, 1.8, S)
    c.line(12, 2.4, 12, 15.6, E, 1.5)
    c.line(5.4, 9, 18.6, 9, E, 1.5)
    c.line(12, 15, 12, 20, S, 2.0)              # planted on a tripod
    c.line(12, 20, 5, 22, S, 1.8)
    c.line(12, 20, 19, 22, S, 1.8)


@icon('glassCannon')        # +70% damage, -50% max health
def _(c):
    c.poly([(12, 1), (20, 12), (12, 23), (4, 12)], S)
    c.poly([(12, 1), (12, 23), (4, 12)], E)     # the lit facet
    for a, b in (((12, 1), (9, 9)), ((9, 9), (14, 13)), ((14, 13), (11, 23))):
        c.line(a[0], a[1], b[0], b[1], DEEP, 1.3)


@icon('tripleTap')          # +70% damage, 3 ammo per shot
def _(c):
    for y in (3.5, 10.0, 16.5):
        c.rect(3, y, 15, y + 4, S)
        c.rect(3, y, 5, y + 4, E)
        c.poly([(15, y), (15, y + 4), (21, y + 2)], E)


@icon('darkPower')          # +20% damage, and nothing else
def _(c):
    # Three gouges. The deal is raw damage with nothing attached, so the icon
    # is the mark left behind rather than the thing that made it.
    for i, (x0, x1) in enumerate(((2.5, 9.5), (8.0, 15.0), (13.5, 20.5))):
        c.poly([(x0, 1.5 + i * 0.8), (x0 + 3.4, 2.5 + i * 0.8),
                (x1 + 1.6, 21.0 - i * 0.6), (x1 - 1.4, 22.0 - i * 0.6)], S)
    for i, (x0, x1) in enumerate(((2.5, 9.5), (8.0, 15.0), (13.5, 20.5))):
        c.poly([(x0 + 0.4, 3.0 + i * 0.8), (x0 + 2.0, 3.4 + i * 0.8),
                (x1 - 0.2, 19.5 - i * 0.6), (x1 - 1.2, 19.8 - i * 0.6)], E)


@icon('berserker')          # the less health you have, the more damage
def _(c):
    # A heart with a piece of it gone, and the damage coming out of the gap.
    # The break is in the SILHOUETTE, not drawn on top of it, so it survives
    # at range.
    c.disc(8.5, 9, 4.8, S)
    c.disc(15.5, 9, 4.8, S)
    c.poly([(3.7, 10), (20.3, 10), (12, 21.5)], S)
    c.erase(lambda px, py: px > 11.5 + (py - 4) * 0.10 and py > 3
            and px < 12.6 + (py - 4) * 0.10)
    c.poly([(13.4, 3), (18.5, 9.5), (15.2, 10.5), (19, 16), (13.2, 21), (15.4, 12)], E)


@icon('hotStreak')          # +1% damage per hit, -1% per miss
def _(c):
    for i, x in enumerate((3, 9, 15)):
        c.rect(x, 18 - i * 5, x + 5, 21, S)
    arrow(c, 3.5, 16, 20.5, 4, E, 2.2, 5.0)


@icon('noHitBonus')         # clear a wave unhurt
def _(c):
    c.rect(8, 1, 10.5, 8, S)
    c.rect(13.5, 1, 16, 8, S)
    c.disc(12, 14, 8.2, S)
    c.ring(12, 14, 8.2, 1.6, D)
    star(c, 12, 14, 6.2, 2.6, 5, E)


@icon('bloodlust')          # fire rate ramps with every kill in a combo
def _(c):
    # A maw opening wider. It is the only icon in the pool that is a mouth.
    c.arc(12, 12, 10.4, 3.2, 15, 165, S)
    c.arc(12, 12, 10.4, 3.2, 195, 345, S)
    for i in range(4):
        x = 5.5 + i * 4.4
        c.poly([(x - 1.6, 5.4), (x + 1.6, 5.4), (x, 9.4)], E)
        c.poly([(x - 1.6, 18.6), (x + 1.6, 18.6), (x, 14.6)], E)


@icon('cursedAmmo')         # 20% of shots hit twice as hard and cost 1 HP
def _(c):
    # The same cartridge as VENOM ROUNDS on purpose - the ammo family should
    # rhyme - down to the rim and the extractor groove, which are what stop a
    # standing cylinder from reading as a bottle. What it carries is the
    # difference, and a skull is not a drip.
    c.rect(6.5, 1, 17.5, 4, S)
    c.rect(7.5, 4, 16.5, 5.6, D)
    c.rect(7.5, 5.6, 16.5, 14, S)
    c.rect(7.5, 14, 16.5, 15.6, D)
    for y in range(16, 24):
        t = (y - 15.6) / 8.4
        half = 4.5 * max(0.0, 1 - t * t)
        c.rect(12 - half, y, 12 + half, y, E)
    skullface(c, 12, 9, 3.4, E, DEEP)


@icon('devilsGamble')       # 51% of shots double, 49% halve
def _(c):
    c.rect(3, 3, 20, 20, S)
    c.erase(lambda px, py: (px < 5 or px > 18) and (py < 5 or py > 18)
            and math.hypot(px - (5 if px < 12 else 18), py - (5 if py < 12 else 18)) > 2.2)
    for x, y in ((7, 7), (16, 7), (11.5, 11.5), (7, 16), (16, 16)):
        c.disc(x, y, 1.9, E)


@icon('midas')              # 2x credits, and the dead turn gold
def _(c):
    c.disc(11, 13, 8.2, S)
    c.ring(11, 13, 6.0, 1.3, E)
    c.disc(11, 13, 2.2, E)
    star(c, 19.5, 4.5, 3.6, 1.0, 4, E)
    star(c, 3.5, 5.5, 2.4, 0.7, 4, E)


@icon('executioner')        # bosses have 50% less health
def _(c):
    # Double-bit: a symmetrical head reads as an axe, and a single blade on a
    # shaft reads as a flag. The head is narrow where it meets the haft and
    # wide at the edges, which is the whole silhouette of the thing.
    c.rect(11, 1, 13.4, 23, S)
    c.poly([(13, 7), (22, 2.5), (22, 16), (13, 12)], S)
    c.poly([(11.4, 7), (2, 2.5), (2, 16), (11.4, 12)], S)
    c.rect(20.4, 3.5, 22, 15.5, E)
    c.rect(2, 3.5, 3.6, 15.5, E)
    c.rect(9, 20, 15.4, 22.5, S)


@icon('holyMantle')         # the first hit of every wave does nothing
def _(c):
    # A halo, and deliberately nothing else. Rays above it turned into candles
    # and anything below it turned into a cup; the ring alone is unambiguous.
    ering(c, 12, 13.5, 9.8, 4.8, 0.40, E)
    for x, y, r in ((4.5, 4.5, 3.2), (12.0, 3.5, 4.0), (19.5, 5.0, 2.8)):
        star(c, x, y, r, r * 0.20, 4, S)


@icon('deadCat')            # revive once at 1 HP, -40% max health
def _(c):
    c.poly([(4.5, 9), (7.5, 1.5), (11, 6)], S)
    c.poly([(19.5, 9), (16.5, 1.5), (13, 6)], S)
    c.disc(12, 11, 6.6, S)
    c.rect(9, 15, 15, 20, S)
    c.disc(8.9, 10, 2.2, DEEP)
    c.disc(15.1, 10, 2.2, DEEP)
    c.poly([(10.4, 15), (13.6, 15), (12, 18)], DEEP)
    c.rect(10, 20, 11, 22, E)
    c.rect(13, 20, 14, 22, E)


# ---- staying alive --------------------------------------------------------


@icon('bulwark')            # +50 max health, -12% move speed
def _(c):
    c.poly([(3, 2), (21, 2), (21, 13), (12, 22), (3, 13)], S)
    c.disc(12, 10, 3.4, E)
    c.rect(11, 4, 13, 18, D)


@icon('nanoweave')          # health regenerates, and sooner
def _(c):
    c.rect(9, 3, 15, 21, S)
    c.rect(3, 9, 21, 15, S)
    c.rect(10.5, 4.5, 13.5, 19.5, E)
    c.rect(4.5, 10.5, 19.5, 13.5, E)
    for x, y in ((5, 5), (18, 5), (5, 18), (18, 18)):
        c.disc(x, y, 1.6, E)


@icon('reactivePlating')    # a shockwave every time you are hit
def _(c):
    star(c, 12, 12, 6.6, 5.4, 6, S, phase=90)
    c.disc(12, 12, 2.4, E)
    for r in (9.2, 12.0):
        c.arc(12, 12, r, 1.4, 25, 65, E)
        c.arc(12, 12, r, 1.4, 115, 155, E)
        c.arc(12, 12, r, 1.4, 205, 245, E)
        c.arc(12, 12, r, 1.4, 295, 335, E)


@icon('vampiric')           # kills heal you
def _(c):
    # One fang. A matched pair settles into a symmetrical T at this size, and
    # a gum line above them makes the T worse.
    c.poly([(7.0, 1.5), (17.0, 1.5), (15.2, 8), (13.2, 14), (12, 20),
            (10.6, 13), (8.8, 7)], S)
    c.poly([(7.0, 1.5), (10.4, 1.5), (12, 20), (10.6, 13), (8.8, 7)], E)
    drop(c, 12, 22.0, 1.9, E)


@icon('bloodPact')          # kills heal 3 HP, you take 25% more damage
def _(c):
    drop(c, 12, 4.5, 2.4, E)
    c.poly([(4, 8), (20, 8), (16, 16), (8, 16)], S)
    c.rect(4, 8, 20, 10.6, E)
    c.rect(11, 16, 13, 20, S)
    c.rect(7, 20, 17, 22, S)


@icon('combatStims')        # +15% move speed
def _(c):
    c.rect(8.5, 1, 15.5, 3, S)
    c.rect(11, 3, 13, 6, S)
    c.rect(7.5, 6, 16.5, 17, S)
    c.rect(9, 9, 15, 16, E)
    c.poly([(9.5, 17), (14.5, 17), (12, 19.5)], S)
    c.line(12, 19, 12, 23, S, 1.4)


@icon('thorns')             # attackers take half their damage back
def _(c):
    c.ring(12, 12, 6.6, 2.6, S)
    for i in range(8):
        a = math.radians(22.5 + i * 45)
        c.poly([(12 + math.cos(a) * 10.6, 12 - math.sin(a) * 10.6),
                (12 + math.cos(a + 0.30) * 6.0, 12 - math.sin(a + 0.30) * 6.0),
                (12 + math.cos(a - 0.30) * 6.0, 12 - math.sin(a - 0.30) * 6.0)], E)


@icon('heart')              # the MAX HEALTH station
def _(c):
    c.disc(8.2, 8.5, 5.0, S)
    c.disc(15.8, 8.5, 5.0, S)
    c.poly([(3.2, 9.5), (20.8, 9.5), (12, 22)], S)
    c.rect(10.5, 8, 13.5, 16, E)
    c.rect(7, 11.5, 17, 14.5, E)


# ---- movement -------------------------------------------------------------


@icon('evasion')            # a share of hits simply miss you
def _(c):
    # Three of you, and only one is really there.
    for cx, r, t in ((5.5, 4.0, D), (11.5, 5.2, S), (18.0, 6.2, E)):
        c.poly([(cx, 12 - r * 1.5), (cx + r, 12), (cx, 12 + r * 1.5), (cx - r, 12)], t)


@icon('doubleJump')         # jump again in midair
def _(c):
    c.rect(3, 21, 20, 23, S)
    arrow(c, 12, 20, 12, 14, S, 3.0, 5.4)
    arrow(c, 12, 11, 12, 2, E, 3.0, 5.8)


@icon('doubleDash')         # two dash charges, one back every 2.5s
def _(c):
    for y in (3, 8, 13):
        c.rect(1, y, 7, y + 1.6, D)
    chevron(c, 11.5, 12, 6.5, S, dirx=1, w=2.8)
    chevron(c, 19.5, 12, 6.5, E, dirx=1, w=2.8)


@icon('demonicDodge')       # dodge, then a second of invulnerability
def _(c):
    # The same after-image language as EVASION, wearing horns.
    for cx, r, t in ((6.5, 4.2, D), (15.5, 6.0, E)):
        c.poly([(cx, 12 - r * 1.4), (cx + r, 12), (cx, 12 + r * 1.5), (cx - r, 12)], t)
        c.poly([(cx - r * 0.8, 12 - r * 0.8), (cx - r * 1.9, 12 - r * 2.6),
                (cx - r * 0.1, 12 - r * 1.7)], t)
        c.poly([(cx + r * 0.8, 12 - r * 0.8), (cx + r * 1.9, 12 - r * 2.6),
                (cx + r * 0.1, 12 - r * 1.7)], t)


@icon('incendiary')         # hits set fire, and it spreads on death
def _(c):
    flame(c, 12, 21.5, 8.6, 20.5, S)
    flame(c, 10.6, 20.0, 3.6, 11.0, E)      # the hot core, off to one side
    flame(c, 16.2, 19.0, 2.0, 6.0, E)       # and a second tongue off the pinch


@icon('cryo')               # hits halve their speed, and their shots too
def _(c):
    for i in range(3):
        a = math.radians(30 + i * 60)
        c.line(12 - math.cos(a) * 10, 12 + math.sin(a) * 10,
               12 + math.cos(a) * 10, 12 - math.sin(a) * 10, E, 2.0)
        for s in (-1, 1):
            bx, by = 12 + math.cos(a) * 6.2 * s, 12 - math.sin(a) * 6.2 * s
            c.line(bx, by, bx + math.cos(a + 1.05) * 3.4 * s,
                   by - math.sin(a + 1.05) * 3.4 * s, E, 1.6)
            c.line(bx, by, bx + math.cos(a - 1.05) * 3.4 * s,
                   by - math.sin(a - 1.05) * 3.4 * s, E, 1.6)
    c.disc(12, 12, 2.2, E)


@icon('petrify')            # a chance to freeze solid, and frozen take more
def _(c):
    c.poly([(3, 11), (7, 4), (15, 2.5), (21, 8), (21, 17), (16, 21.5), (7, 21), (2, 16)], S)
    for a, b in (((7, 4), (10, 11)), ((10, 11), (6, 16)), ((10, 11), (16, 13)),
                 ((16, 13), (17, 21)), ((16, 13), (21, 9))):
        c.line(a[0], a[1], b[0], b[1], DEEP, 1.4)


@icon('terror')             # hit enemies flee and cannot attack
def _(c):
    c.disc(12, 9, 6.4, S)
    c.poly([(5.6, 9), (18.4, 9), (18.4, 21), (15.6, 17.5), (12, 21.5),
            (8.4, 17.5), (5.6, 21)], S)
    c.disc(9.4, 8.6, 2.1, E)
    c.disc(14.6, 8.6, 2.1, E)
    c.poly([(10.4, 13), (13.6, 13), (12, 16.5)], DEEP)


@icon('knockout')           # hits shove enemies 1.5m back
def _(c):
    # What it does to THEM, not what it looks like from behind the gun: a body
    # going backwards under three impacts.
    c.rect(15, 3, 21, 21, S)
    c.rect(15, 3, 17, 21, E)
    for y in (6.5, 12, 17.5):
        arrow(c, 1.5, y, 13, y, E, 2.4, 4.6)


@icon('arcRounds')          # hits chain to one more enemy
def _(c):
    c.disc(5, 18, 3.4, S)
    c.disc(19, 6, 3.4, S)
    c.disc(5, 18, 1.5, E)
    c.disc(19, 6, 1.5, E)
    for a, b in (((6.5, 15.5), (12, 14)), ((12, 14), (10, 9.5)), ((10, 9.5), (17, 8))):
        c.line(a[0], a[1], b[0], b[1], E, 2.0)


@icon('piercingShot')       # one shot passes through several enemies
def _(c):
    for i, x in enumerate((3.5, 9.5, 15.5)):
        c.rect(x, 2 + i * 1.5, x + 3, 22 - i * 1.5, S)
    arrow(c, 0.5, 12, 21.5, 12, E, 2.4, 7.0)


@icon('gravityRounds')      # hits drag everything nearby inward
def _(c):
    c.disc(12, 12, 4.4, S)
    c.disc(12, 12, 2.2, DEEP)
    for i in range(4):
        a = math.radians(45 + i * 90)
        arrow(c, 12 + math.cos(a) * 11, 12 - math.sin(a) * 11,
              12 + math.cos(a) * 6.4, 12 - math.sin(a) * 6.4, E, 2.0, 3.8)


@icon('twentyTwenty')       # every shot fires twice, for 60% each
def _(c):
    # One trigger pull going out as two rounds. TRIPLE TAP is three rounds in a
    # stack; this one has to be a fork or the two would read as each other.
    c.line(6, 12, 14, 5.5, S, 1.6)
    c.line(6, 12, 14, 18.5, S, 1.6)
    for x0, y0 in ((13, 3.5), (13, 16.5)):
        c.rect(x0, y0, x0 + 5, y0 + 4, E)
        c.poly([(x0 + 5, y0), (x0 + 5, y0 + 4), (x0 + 9.5, y0 + 2)], E)
    c.rect(1, 10, 7, 14, S)
    c.rect(1, 10, 2.6, 14, D)


@icon('seeker')             # missed shots curve onto a target
def _(c):
    c.ring(16.5, 7, 6.4, 1.6, S)
    for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        c.line(16.5 + dx * 4.0, 7 + dy * 4.0, 16.5 + dx * 9.4, 7 + dy * 9.4, S, 1.6)
    c.disc(16.5, 7, 1.3, E)
    for a, b in (((1.5, 22.5), (3.5, 17)), ((3.5, 17), (7.5, 14)), ((7.5, 14), (12, 12.5))):
        c.line(a[0], a[1], b[0], b[1], E, 2.6)
    c.poly([(14.8, 10.4), (10.2, 11.8), (12.4, 15.4)], E)


@icon('detonator')          # hits explode
def _(c):
    c.rect(3, 13, 21, 22, S)
    c.rect(6, 4, 18, 6, S)
    c.rect(10.5, 6, 13.5, 13, S)
    c.rect(4.5, 16, 11, 20, E)
    for i in range(3):
        c.line(16 + i * 1.6, 16 + i * 0, 16 + i * 1.6, 20, E, 1.2)
    c.poly([(19, 2), (16, 8), (18.6, 8), (16.4, 12.5), (22, 6), (19.4, 6)], E)


@icon('breachRound')        # the first shot after every reload explodes
def _(c):
    spikes(c, 12, 6.5, 3.6, 10.5, 8, 2.0, E, phase=22)
    c.disc(12, 6.5, 3.0, E)
    c.rect(7.5, 11, 16.5, 13, D)
    c.rect(7.5, 13, 16.5, 22, S)
    c.rect(7.5, 20.5, 16.5, 22, D)


@icon('reloadBurst')        # the reload itself throws eight shards
def _(c):
    c.rect(3, 14, 9, 22, S)
    c.rect(2, 12, 10, 15, S)
    for i, a in enumerate((18, 40, 62, 84, 106)):
        r = math.radians(a)
        c.poly([(8 + math.cos(r) * 17, 17 - math.sin(r) * 17),
                (8 + math.cos(r + 0.16) * 8, 17 - math.sin(r + 0.16) * 8),
                (8 + math.cos(r - 0.16) * 8, 17 - math.sin(r - 0.16) * 8)], E)


# ---- poison, fire, ice and the things that prolong them -------------------

# The approved test icon, kept exactly as it was drawn rather than rebuilt from
# primitives: it is the reference the rest of the set was matched to.
VENOM_ROUND = [
    '.......2222222211.......',
    '.......2222222211.......',
    '.......2222222211.......',
    '........11111111........',   # extractor groove - what says "cartridge" fastest
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........22222211........',
    '........11111111........',   # the case mouth
    '........43333322........',
    '........43333322........',
    '.........433332.........',
    '.........433322.........',
    '..........3332..........',
    '...........32...........',
    '...........33...........',
    '..........4332..........',   # and the venom beads off the point
    '..........4332..........',
    '...........33...........',
]


@icon('venom')              # hits poison
def _(c):
    c.blit(VENOM_ROUND, 0, 2)


@icon('neurotoxin')         # the poison jumps from one enemy to the next
def _(c):
    nodes = ((5.5, 6.5), (18.5, 8.0), (11.0, 19.0))
    for a, b in ((0, 1), (1, 2), (2, 0)):
        c.line(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], S, 1.8)
    for i, (x, y) in enumerate(nodes):
        c.disc(x, y, 3.6, S)
        c.disc(x, y, 1.8, E)


@icon('malady')             # poison and burn hurt more, for less time
def _(c):
    # A drop with fire inside it. The two have to stay separate shapes or they
    # merge into one blob, so the shell is hollowed out before the flame goes in.
    drop(c, 12, 15.0, 7.4, S)
    drop(c, 12, 15.6, 5.4, DEEP)
    flame(c, 12, 19.5, 3.6, 11.5, E)


@icon('entropy')            # status never wears off below 30% health
def _(c):
    c.rect(4, 2, 20, 4, S)
    c.rect(4, 20, 20, 22, S)
    c.poly([(5, 4), (19, 4), (12.8, 12)], S)
    c.poly([(5, 20), (19, 20), (11.2, 12)], S)
    c.poly([(13.8, 10), (16.6, 6.2), (11.6, 9.2), (13.2, 5.4),
            (9.4, 10.4), (12.4, 12.4)], DEEP)      # the neck, broken
    c.poly([(7, 20), (17, 20), (12, 14.5)], E)     # what is left never runs out


@icon('crystallize')        # the frozen dead shatter
def _(c):
    c.poly([(12, 6), (16, 12), (12, 18), (8, 12)], S)
    c.poly([(12, 6), (12, 18), (8, 12)], E)
    for a, r0, r1, w in ((58, 8, 12.5, 2.6), (128, 8, 11.5, 2.2),
                         (238, 8, 12.0, 2.4), (312, 8, 11.0, 2.0)):
        t = math.radians(a)
        c.poly([(12 + math.cos(t) * r1, 12 - math.sin(t) * r1),
                (12 + math.cos(t + 0.22) * r0, 12 - math.sin(t + 0.22) * r0),
                (12 + math.cos(t - 0.22) * r0, 12 - math.sin(t - 0.22) * r0)], E)


@icon('ashen')              # the burning dead leave a cloud that keeps burning
def _(c):
    for x, y, r in ((6.5, 16.5, 4.6), (12, 15, 5.6), (17.5, 16.5, 4.4)):
        c.disc(x, y, r, S)
    c.rect(2, 16, 22, 21, S)
    for x, y, r in ((5, 8, 1.7), (10, 5, 2.1), (15.5, 7, 1.8), (19.5, 4, 1.5), (12.5, 10, 1.4)):
        c.disc(x, y, r, E)


@icon('blastCorpse')        # the dead explode, and it can hit you
def _(c):
    spikes(c, 12, 12, 7.0, 11.8, 8, 2.2, E, phase=22)
    for a in (38, 142):
        t = math.radians(a)
        dx, dy = math.cos(t) * 6.4, -math.sin(t) * 6.4
        c.line(12 - dx, 12 - dy, 12 + dx, 12 + dy, S, 2.6)
        for s in (-1, 1):
            c.disc(12 + dx * s + dy * 0.22 * s, 12 + dy * s - dx * 0.22 * s, 1.9, S)
            c.disc(12 + dx * s - dy * 0.22 * s, 12 + dy * s + dx * 0.22 * s, 1.9, S)


@icon('eternalAffliction')  # enemy status never expires at all
def _(c):
    # A snake taking its own tail. Two joined rings read as spectacles; a ring
    # with a head on it reads as something that will not stop.
    c.ring(12, 13, 8.4, 3.0, S)
    c.erase(lambda px, py: py < 9 and 10 < px < 14)
    c.poly([(9.6, 9.5), (9.6, 3.0), (15.2, 5.6), (13.4, 10.5)], S)
    c.disc(11.4, 6.4, 1.5, E)
    c.poly([(14.4, 9.4), (17.2, 6.6), (14.6, 11.4)], E)


@icon('absoluteZero')       # everything moves slower, and hits freeze you
def _(c):
    c.poly([(6, 3), (18, 3), (21, 8), (18, 17), (6, 17), (3, 8)], S)
    star(c, 12, 10, 6.2, 2.0, 6, E, phase=90)
    for x, h in ((6.5, 21.5), (12, 23), (17.5, 20.5)):
        c.poly([(x - 1.5, 17), (x + 1.5, 17), (x, h)], E)


@icon('antidote')           # immune to poison, and poisoned enemies heal you
def _(c):
    c.rect(8.5, 1, 15.5, 3.5, S)
    c.rect(10, 3.5, 14, 6, S)
    c.rect(6, 6, 18, 21, S)
    c.disc(12, 20, 6, S)
    c.rect(7, 11, 17, 21, E)
    c.disc(12, 20, 5, E)
    c.rect(10.6, 13, 13.4, 19.5, S)
    c.rect(8.4, 15.2, 15.6, 17.4, S)


@icon('hellfire')           # the reload lays a fire trail behind you
def _(c):
    c.rect(0, 19.5, 23, 22, S)
    flame(c, 4.5, 19.5, 3.4, 9.0, E)
    flame(c, 12.0, 19.5, 4.4, 15.0, E)
    flame(c, 19.0, 19.5, 3.0, 7.5, E)


@icon('overload')           # empty the magazine and lightning takes everyone
def _(c):
    c.disc(12, 12, 3.6, S)
    c.disc(12, 12, 1.7, E)
    for i in range(4):
        a = math.radians(45 + i * 90)
        p0 = (12 + math.cos(a) * 3.4, 12 - math.sin(a) * 3.4)
        p1 = (12 + math.cos(a + 0.42) * 7.4, 12 - math.sin(a + 0.42) * 7.4)
        p2 = (12 + math.cos(a - 0.30) * 11.6, 12 - math.sin(a - 0.30) * 11.6)
        c.line(p0[0], p0[1], p1[0], p1[1], E, 2.2)
        c.line(p1[0], p1[1], p2[0], p2[1], E, 2.2)


@icon('lightningWizard')    # a share of hits calls lightning down
def _(c):
    for x, y, r in ((7, 7, 4.4), (12.5, 5.5, 5.2), (17.5, 7.5, 4.0)):
        c.disc(x, y, r, S)
    c.rect(3, 7, 21, 11, S)
    c.poly([(13.5, 10), (8.5, 17), (11.6, 17), (9.5, 23),
            (16, 15), (12.6, 15)], E)


@icon('carnage')            # every kill stacks damage until you are hurt
def _(c):
    # Point down, so the blood has somewhere to go. Point up and the drops sit
    # beside the guard, where they read as two little bottles.
    c.rect(8.5, 0.5, 15.5, 2.5, S)
    c.rect(10, 2.5, 14, 7, S)
    c.rect(4, 7, 20, 9.5, S)
    c.poly([(8, 9.5), (16, 9.5), (16, 14), (12, 19.5), (8, 14)], S)
    c.poly([(8, 9.5), (12, 19.5), (8, 14)], E)
    drop(c, 10.4, 22.2, 1.4, E)
    drop(c, 14.2, 21.4, 1.1, E)


@icon('demonicPresence')    # the Devil turns up after every wave
def _(c):
    # He is the mutation, so he is the icon. The horns are polygons rather than
    # arc segments - an arc this thick breaks into loose chunks at 24 pixels.
    c.poly([(6.5, 8), (17.5, 8), (16, 16), (12, 22), (8, 16)], S)
    c.poly([(7.4, 8.6), (1.5, 1.5), (6.2, 3.0), (10.4, 8.6)], S)
    c.poly([(16.6, 8.6), (22.5, 1.5), (17.8, 3.0), (13.6, 8.6)], S)
    c.poly([(8.0, 11.0), (11.4, 12.4), (8.0, 13.8)], E)
    c.poly([(16.0, 11.0), (12.6, 12.4), (16.0, 13.8)], E)


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


# Icons whose tones are authored outright and must not go through the shared
# lighting pass again. Only the reference icon is in here.
RAW = {'venom'}
