"""What each passive item DOES, drawn at 24x24.

Nothing here looks at the 3D catalogue. Every shape was chosen from the
upgrade's own effect text, which is why several of them are nothing like the
object that used to stand for them - VENOM ROUNDS is a poisoned cartridge and
not a flask, because a flask says "poison" without saying that the AMMUNITION
is what carries it.

Two rules hold across the whole set:
  * the light is always upper-left, applied by Canvas.shade() and never by hand
  * STRUCTURE is the object, ENERGY is what the passive item does to it - so
  * the
    lit part of an icon is always the part that names the upgrade
"""
import math
from canvas import Canvas, G, EMPTY, STRUCT as S, SHADOW as D, ENERGY as E, PALE as P

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


@icon('hairTrigger')        # +25% fire rate per stack, and the kick with it
def _(c):
    # THE TRIGGER ITSELF, inside its guard, with the kick coming off it.
    # OVERCLOCK owns the dial - a second gauge would say "rate of fire" twice
    # and never say "recoil" - so this is the part of the gun the upgrade
    # actually touches, and the two arrows are what it costs.
    c.rect(1.0, 2.0, 15.0, 4.8, S)                   # the receiver above it
    c.arc(8.0, 12.0, 7.2, 2.6, 190, 350, S)          # the guard, hung off it
    c.rect(0.8, 4.8, 3.4, 12.4, S)
    c.rect(12.6, 4.8, 15.2, 12.4, S)
    c.poly([(6.4, 4.8), (10.0, 4.8), (9.4, 10.6), (5.8, 13.4)], E)   # the blade
    arrow(c, 19.6, 22.0, 19.6, 4.0, E, 2.6, 5.4)     # and what it kicks back


@icon('brassEcho')          # a share of the shots that HIT are paid back
def _(c):
    # One round, and the arc it comes back along. The cartridge is the
    # structure and the return is the energy, so the lit half of the icon is
    # the half that names the upgrade - the round coming BACK, not the round.
    bullet(c, 13.6, 5.0, 6.4, 17.0, S, S, 0.42)
    c.arc(11.0, 14.0, 8.6, 2.6, 70, 250, E)          # up the left and over
    c.poly([(9.2, 3.6), (16.4, 5.2), (10.2, 9.6)], E)  # arriving at the case


@icon('openingSalvo')       # the first ten seconds of a wave cost no ammo
def _(c):
    # THREE ROUNDS ALREADY IN THE AIR, fanned and trailing. Not a clock: the
    # window is measured on the HUD chip this same drawing sits in, and a dial
    # would put a second timer inside a timer. The set has no other icon whose
    # silhouette is a diagonal fan.
    # Abreast rather than in file: three rounds strung along one flight line
    # fuse into a single streak, and the fan is the whole silhouette.
    ang = math.radians(42)
    ux, uy = math.cos(ang), -math.sin(ang)
    px, py = -uy, ux
    for t in (-7.4, 0.0, 7.4):
        x, y = 12 + px * t, 12 + py * t
        L, W = 7.6, 2.2
        nose = 3.0
        # The case: a quad along the flight line, with a nose cone on the end.
        c.poly([(x - ux * L / 2 + px * W, y - uy * L / 2 + py * W),
                (x + ux * (L / 2 - nose) + px * W, y + uy * (L / 2 - nose) + py * W),
                (x + ux * (L / 2 - nose) - px * W, y + uy * (L / 2 - nose) - py * W),
                (x - ux * L / 2 - px * W, y - uy * L / 2 - py * W)], S)
        c.poly([(x + ux * L / 2, y + uy * L / 2),
                (x + ux * (L / 2 - nose) + px * W, y + uy * (L / 2 - nose) + py * W),
                (x + ux * (L / 2 - nose) - px * W, y + uy * (L / 2 - nose) - py * W)], E)
        # The trail, behind the case and thinner than it.
        c.line(x - ux * (L / 2 + 3.4), y - uy * (L / 2 + 3.4),
               x - ux * L / 2, y - uy * L / 2, E, 1.6)


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


@icon('untouched')          # +3 max HP for every wave cleared unhurt, kept
def _(c):
    # A STAIR that keeps climbing, with the health it banks lit on top of it.
    # Nothing else in the set is a staircase, and the shape says the two things
    # the passive item is: it goes up, and every step it took is still there.
    for i, h in enumerate((9.0, 13.5, 18.0)):
        x0 = 2.0 + i * 6.8
        c.rect(x0, 23.0 - h, x0 + 6.2, 22.5, S)
    c.rect(14.8, 1.6, 22.2, 4.4, E)                  # the plus, on the top step
    c.rect(17.1, 0.0, 19.9, 6.0, E)


@icon('scarTissue')         # +2 max HP every wave, and everything hurts more
def _(c):
    # A SEAM, stitched shut. The wound is the structure and the stitches are
    # what closed it, so the lit part is the healing - which is exactly the
    # deal: you are made of the damage you took.
    c.rect(8.6, 0.0, 15.4, 23.0, S)
    c.rect(11.2, 0.0, 12.8, 23.0, DEEP)              # the wound itself, still open
    for y in (3.0, 8.6, 14.2, 19.8):
        c.line(5.6, y - 1.8, 18.4, y + 1.8, E, 2.2)


@icon('blackout')           # the haze closes in, and you are tougher for it
def _(c):
    # AN EYE, most of it swallowed. The bands are the room and the eye is what
    # is left of the room you can read; drawn in that order so the haze passes
    # in FRONT, which is the whole point of the passive item.
    ellipse(c, 12, 12, 10.6, 7.0, E)
    c.disc(12, 12, 3.6, DEEP)
    for y in (2.5, 9.0, 15.5):
        c.rect(0.0, y, 23.0, y + 2.4, S)


@icon('digIn')              # stand still and the health comes back
def _(c):
    # AN ANCHOR. Planted is the whole passive item, and the crossbar through
    # the shank gives it the cross the health family is read by without
    # borrowing NANOWEAVE's weave or WATERLINE's heart.
    c.rect(10.6, 3.0, 13.4, 20.0, E)                 # shank
    c.rect(4.0, 7.0, 20.0, 9.6, E)                   # crossbar
    c.ring(12, 3.4, 3.2, 1.6, S)                     # the ring at the head
    c.arc(12, 13.0, 9.0, 2.6, 200, 340, S)           # the flukes, swept round
    c.poly([(1.6, 12.6), (6.4, 15.4), (1.0, 18.0)], S)
    c.poly([(22.4, 12.6), (17.6, 15.4), (23.0, 18.0)], S)


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


@icon('secondWind')         # sprint twice as long, and get it back twice as fast
def _(c):
    # THREE GUSTS, each curling back on itself. The movement family is built
    # from chevrons and after-images, and both are spoken for - this is the AIR
    # instead, which is the one thing stamina actually is.
    for y, x1, r in ((5.5, 15.0, 3.2), (12.0, 18.0, 3.6), (18.5, 13.0, 2.8)):
        c.line(1.5, y, x1, y, S, 2.6)
        c.arc(x1, y + r, r, 2.6, 270, 150, E)


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


# ---- the pickups ----------------------------------------------------------
#
# The six things that fall out of a dead enemy. These are the only icons drawn
# for objects the player picks UP rather than for something a passive item
# does, so they share a rule of their own: each is ONE object filling the
# frame, with no secondary marks, because they are read at a glance while
# something is trying to kill you - and, unlike a totem's icon, from any
# distance and any angle.


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


# Icons whose tones are authored outright and must not go through the shared
# lighting pass again. Only the reference icon is in here.
RAW = {'venom'}


# ---- the player's status effects ------------------------------------------
#
# What something ELSE has done to YOU. These are the only icons in the set that
# stand for a bad thing, and they are read in the HUD - four or five of them in
# a row, 28px wide, while the arena is trying to kill you - so they follow the
# pickups' rule and then tighten it: ONE object, filling the frame, and no two
# of the six may share a silhouette family. That is why poison is a droplet
# rather than a skull (curse is the skull-adjacent sigil), and why fear is a
# face with no cranium ridge (TERROR already owns the skull).


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
    # A BOOT FROZEN INTO A BLOCK OF ICE. Two earlier passes were wrong in the
    # same way: a ball and chain says "held" without saying by what, and an
    # hourglass says "time" when every chip in the HUD already carries a timer
    # bar. This one names the effect AND its cause, which is the thing the
    # player has to connect - the frost on the floor is where it came from.
    #
    # CRYO already owns the snowflake. This is a chunk, not a crystal, so the
    # two never read as the same idea at chip size.
    c.poly([(11.0, 1.5), (19.5, 5.0), (22.0, 13.5), (18.0, 21.5),
            (7.5, 22.0), (2.0, 15.0), (3.5, 6.0)], S)
    # The boot, punched THROUGH the ice rather than drawn on it: a near-black
    # hole inside a lit block survives at any size, and a mid-tone boot on a
    # mid-tone chunk does not.
    c.rect(8.5, 6.5, 11.8, 13.5, DEEP)         # the shin
    c.rect(8.5, 13.5, 15.5, 16.6, DEEP)        # the foot, toe forward
    c.rect(7.4, 16.6, 15.5, 18.0, DEEP)        # the sole, wider than the foot
    # Facets. The lit edges of the block, and the only ENERGY in the icon, so
    # the eye lands on the ice rather than on the boot inside it.
    c.line(4.6, 8.0, 9.0, 3.6, E, 1.8)
    c.line(19.6, 8.6, 21.0, 14.6, E, 1.8)
    c.line(13.6, 3.4, 17.6, 5.2, E, 1.6)


# ---- ACTIVE ITEMS ---------------------------------------------------------
#
# The five things that go in the slot. They are drawn as OBJECTS - a case, a
# projector, a governor, a dome, a drive - where a passive item is drawn as an
# effect, because an item is a thing the player is carrying and a passive item
# is something that has happened to them. That distinction has to survive being
# seen at 24 pixels in the corner of the screen, so each one leans on a hard
# outer silhouette that no passive item in the catalogue has.
#
# Each also has to clear the pickup it is nearest to: TRAUMA KIT is a case and
# pickHealth is a bare cross, AEGIS is a dome and pickShield is a carried
# shield, OVERDRIVE is a governor and overclock is a dial.


@icon('itemHeal')           # TRAUMA KIT - heal 25 HP
def _(c):
    # A CASE, not a cross. pickHealth is already the bare cross and the two are
    # a metre apart on screen when a health drop lands during a wave break; what
    # separates them is the box around this one and the handle over it.
    c.rect(9.5, 3, 14.5, 5.5, S)            # the handle
    c.rect(10.8, 4, 13.2, 5.5, DEEP)        # and the grip hole through it
    c.rect(2.5, 5.5, 21.5, 21, S)           # the case
    c.rect(2.5, 11.5, 21.5, 13, D)          # the seam it opens on
    c.rect(10.5, 8, 13.5, 18.5, E)          # the cross
    c.rect(6, 11.75, 18, 14.75, E)


@icon('itemFreeze')         # CRYO PULSE - freeze every enemy for 2s
def _(c):
    # A flake INSIDE a shockwave, because the item is not ice - it is ice going
    # off. ABSOLUTE ZERO owns the plain hexagon-and-icicles reading; the ring is
    # what makes this one an event rather than a state.
    #
    # SIX FAT ARMS AND NOTHING ELSE. The first pass hung a pair of barbs off
    # each arm, which is what a snowflake actually looks like and what twelve
    # extra strokes inside a 24-pixel circle actually looks like, which is mush.
    c.ring(12, 12, 11, 2.0, S)
    spikes(c, 12, 12, 0, 7.6, 6, 3.0, E, phase=90)
    c.disc(12, 12, 3.0, E)
    c.disc(12, 12, 1.2, S)

@icon('itemRage')           # OVERDRIVE - 2x damage for 5s
def _(c):
    # A GOVERNOR PUSHED PAST ITS STOP: a housing with two chevrons climbing out
    # of it. OVERCLOCK is a dial and reads as a rate; this has to read as an
    # amount, so the movement in it is vertical rather than rotary - and the
    # doubling is said by there being two of them, which is the one thing about
    # this item worth saying at 24 pixels.
    c.rect(2.5, 17.5, 21.5, 22, S)
    c.rect(5.5, 19, 18.5, 20.5, DEEP)
    chevron(c, 12, 13.5, 8.0, S, diry=1, w=3.4)
    chevron(c, 12, 7.0, 8.0, E, diry=1, w=3.4)

@icon('itemGuard')          # AEGIS - invincible for 5s
def _(c):
    # A DOME OVER A FLOOR, not a shield in a hand. pickShield already owns the
    # carried hexagon, and the difference is the whole point: that one is a pool
    # of damage you spend, this one is a volume nothing gets into.
    #
    # TWO ARCS AND A SLAB. Anything inside the dome competes with the dome for
    # the same fifteen pixels, so what stands under it is one small core and no
    # more - enough to say the volume has something in it.
    c.ring(12, 17, 10.5, 2.2, S)
    c.ring(12, 17, 6.6, 1.8, E)
    c.erase(lambda px, py: py > 17)
    c.rect(0.5, 17, 23.5, 20, S)
    c.rect(3.5, 20, 20.5, 21.5, D)
    c.disc(12, 14.6, 1.9, E)

@icon('itemDash')           # BLINK DRIVE - dash forward
def _(c):
    # THE DASH KEPT ITS DRAWING LANGUAGE from when it was a passive item:
    # chevrons travelling right out of their own after-image.
    #
    # The after-image is THREE SHORT DASHES, not three long bars. Full-width
    # rules behind the arrows read as a barcode and take the eye left, which is
    # the opposite of what an icon about going forward should do.
    for y in (5.5, 11.2, 16.9):
        c.rect(0.5, y, 5, y + 2.2, D)
    chevron(c, 15, 12, 6.4, S, dirx=1, w=3.2)
    chevron(c, 22, 12, 6.4, E, dirx=1, w=3.2)


# ---- the rest of the active items -----------------------------------------
#
# Thirty-two more, under the same two rules as everything above: the light is
# upper-left and applied by finish(), and STRUCTURE is the object while ENERGY
# is what the item DOES to it - so the lit part of every drawing is the part
# that names the item.
#
# ONE EXTRA RULE THIS BLOCK ADDS, because it is where the set stops having room
# to be careless: NO NEW ICON MAY SHARE A SILHOUETTE WITH ITS NEAREST
# NEIGHBOUR. Sixty-five drawings could be checked by eye; ninety-seven cannot,
# so each of these names the icon it was drawn AGAINST in its own comment. The
# test is the black shape, not the colour - the pedestal tints them all by
# theme, and two items with the same outline in different colours are two items
# nobody can tell apart across an arena.


def cell(c, cx, cy, r, tone_wall, tone_core):
    """A rounded body with a lit centre. The heal family's shared skeleton."""
    c.disc(cx, cy, r, tone_wall)
    c.disc(cx, cy, r * 0.5, tone_core)


def hexagon(c, cx, cy, r, t, phase=90):
    pts = [(cx + math.cos(math.radians(phase + i * 60)) * r,
            cy - math.sin(math.radians(phase + i * 60)) * r) for i in range(6)]
    c.poly(pts, t)


@icon('itemPurify')         # WHITE CELL - clear every affliction
def _(c):
    # A CELL SWALLOWING SOMETHING BLACK. Not a cross (pickHealth owns it), not
    # a flask (that is a container, and this is an immune response), not a
    # shield (AEGIS). The tell is the DARK MOTE half-inside the pale body: a
    # ring alone would be a wheel, and the thing being eaten is the whole idea.
    c.disc(11, 12, 9.4, S)
    c.disc(11, 12, 6.2, E)
    # The pseudopod reaching round the mote, so the two are one shape and the
    # cell is visibly doing something rather than sitting next to it.
    c.arc(16.5, 9.5, 6.0, 2.6, 250, 110, S)
    c.disc(16.8, 9.2, 2.6, DEEP)


@icon('itemInferno')        # BRIMSTONE - set every enemy alight
def _(c):
    # Against INCENDIARY (one flame off a round) and statusFire (one big
    # tongue): this is fire happening to a CROWD, so the silhouette is three
    # heads under one flame rather than a flame on its own.
    #
    # THE FLAME HAS TO LEAVE ROOM FOR THEM. The first pass drew it fifteen
    # pixels tall and ten wide in the ENERGY tone, which is the brightest in
    # the ramp, and the three structural skulls under it simply stopped
    # existing at arena range. The fire is the lit thing and the crowd is what
    # it is happening TO, so the fire gets the top half and no more.
    flame(c, 12, 12.5, 6.4, 11.5, E)
    for x in (4.5, 12.0, 19.5):
        skullface(c, x, 18.0, 3.6, S)



@icon('itemArc')            # JACOB'S LADDER - a bolt through five enemies
def _(c):
    # Against LIGHTNING WIZARD (a bolt coming DOWN) and ARC ROUNDS (one hop):
    # a ladder. Two vertical rails with the arc climbing between them is the
    # real device, it reads as a chain rather than as a strike, and no other
    # icon in the set is two parallel bars.
    c.rect(3.0, 2.0, 5.4, 22.0, S)
    c.rect(18.6, 2.0, 21.0, 22.0, S)
    # The rungs widen as they climb, which is what the actual apparatus does
    # and what stops this being a barcode.
    for i, y in enumerate((18.5, 14.0, 9.5, 5.0)):
        w = 1.2 + i * 0.5
        c.line(5.4, y + 1.2, 18.6, y - 1.2, E, w)


@icon('itemMercy')          # LAST RITES - execute everything under 30%
def _(c):
    # Against EXECUTIONER (a blade over a crown) and TERROR (a skull with the
    # jaw open): a skull with a FLATLINE through it. The straight bar across
    # the eyes is the whole silhouette difference, and it says "already over"
    # rather than "about to happen", which is what the item does.
    skullface(c, 12, 11.0, 7.4, S)
    c.rect(0.5, 18.0, 23.5, 19.6, E)
    # The trace, drawn as one dip so the line reads as an instrument and not
    # as a strikethrough.
    c.line(8.0, 18.8, 11.0, 14.6, E, 1.8)
    c.line(11.0, 14.6, 14.0, 21.6, E, 1.8)
    c.line(14.0, 21.6, 16.0, 18.8, E, 1.8)


@icon('itemLeech')          # HAEMOPHAGE - hits heal you
def _(c):
    # Against VAMPIRIC ROUNDS (a fanged round) and BLOOD PACT: a leech with its
    # mouth on a cartridge.
    #
    # TWO SILHOUETTES, NOT ONE WRAPPED IN THE OTHER. The first two passes coiled
    # the leech AROUND the round, which is the better picture and the worse
    # icon: every tone in this drawing comes from the same hue, so a coil laid
    # over a case has no edge anywhere and the whole thing reads as one pink
    # blob with slashes on it. Side by side, the round is a round and the animal
    # is an animal, and the only place they touch is the bite.
    bullet(c, 2.5, 3.0, 7.0, 18.0, S, S)
    # The leech: a thick C, head at the top, tail curling away. Drawn as three
    # segments rather than an arc so its width can swell at the middle - a worm
    # of even thickness is a hose.
    c.line(12.0, 6.0, 18.5, 8.5, E, 3.6)
    c.line(18.5, 8.5, 19.5, 14.5, E, 4.4)
    c.line(19.5, 14.5, 13.5, 19.5, E, 3.4)
    c.disc(11.2, 5.6, 3.0, E)                     # the head...
    c.disc(9.8, 5.6, 1.2, DEEP)                   # ...and its mouth, on the case



@icon('itemLastStand')      # WATERLINE - heal up to half, never above
def _(c):
    # Against pickHealth (a cross) and GRAFT (a patched heart): a heart
    # FILLED TO A MARKED LINE. The empty top half is the item - it is the only
    # icon in the set with a deliberate void through the middle of the form.
    c.disc(8.4, 9.4, 4.8, S)
    c.disc(15.6, 9.4, 4.8, S)
    c.poly([(3.4, 11.0), (20.6, 11.0), (12, 21.8)], S)
    # Everything BELOW the line becomes energy. A second pass over the finished
    # heart rather than two drawn shapes: the waterline cuts across the widest
    # part of the form, and any two-polygon version of that leaves a seam the
    # outline pass then draws a line down.
    for y in range(14, G):
        for x in range(G):
            if c.g[y][x] == S:
                c.g[y][x] = E
    # The line is a hard edge and not a gradient - the number it stands for is
    # exact - and it is CLIPPED TO THE HEART. Run edge to edge it would be a
    # bar with a heart behind it, which is a different picture entirely.
    for x in range(G):
        for y in (12, 13):
            if c.g[y][x] != EMPTY:
                c.g[y][x] = DEEP



@icon('itemQuake')          # TECTONIC - hurl everything back
def _(c):
    # Against REACTIVE PLATING (a burst off a plate) and GRAVITY ROUNDS
    # (arrows pointing IN): ground split down the middle, with the two halves
    # driven apart. The arrows point OUT, which is the one-glance difference
    # from the gravity icon.
    #
    # THE GROUND IS A BAND, not two tall slabs. Two slabs either side of a thin
    # crack read as one filled rectangle the moment the icon is small enough
    # that the crack closes - which at arena range is always. A low band with a
    # wide wedge taken out of it keeps the split in the SILHOUETTE.
    c.rect(0.5, 14.0, 23.5, 21.5, S)
    c.poly([(12, 12.5), (16.5, 22.5), (7.5, 22.5)], EMPTY)
    c.line(12, 13.0, 12, 22.5, E, 2.6)
    arrow(c, 10.0, 6.5, 1.0, 6.5, E, 3.4, 6.0)
    arrow(c, 14.0, 6.5, 23.0, 6.5, E, 3.4, 6.0)



@icon('itemRate')           # RED LINE - double fire rate for 6s
def _(c):
    # Against OVERCLOCK, which is the same instrument. The difference is
    # deliberate and structural: OVERCLOCK's needle crosses the arc from the
    # centre and the dial is open; this one is a full ring with a RED BLOCK on
    # it and the needle buried inside that block. A rate you own versus a rate
    # you are borrowing past the limit.
    c.ring(12, 12, 10.0, 2.6, S)
    c.arc(12, 12, 10.6, 4.0, 20, 80, E)
    c.disc(12, 12, 2.6, S)
    c.line(12, 12, 18.6, 5.4, E, 2.4)
    c.disc(12, 12, 1.2, DEEP)


@icon('itemFrenzy')         # RED MIST - 3x damage, 2x taken
def _(c):
    # Against BLOODLUST (a fanged round) and BERSERKER: an open MOUTH, teeth
    # top and bottom, with the spray coming off it. A jaw filling the frame is
    # a silhouette nothing else in the set has - the skulls are closed forms.
    ellipse(c, 12, 12.5, 9.6, 8.4, S)
    ellipse(c, 12, 13.0, 6.6, 5.4, DEEP)
    for x in (7.0, 10.0, 13.0, 16.0):
        c.poly([(x - 1.4, 8.0), (x + 1.4, 8.0), (x, 12.4)], E)
        c.poly([(x - 1.4, 18.0), (x + 1.4, 18.0), (x, 13.6)], E)
    # Three flecks thrown clear. Small and separated, so they read as spray
    # rather than as part of the head.
    for px, py, r in ((2.6, 3.4, 1.6), (20.8, 4.4, 1.3), (21.6, 19.4, 1.5)):
        c.disc(px, py, r, E)


@icon('itemTally')          # BODY COUNT - +10% damage per kill
def _(c):
    # Against HOT STREAK (a rising bar) and CARNAGE (a splayed burst): a five
    # bar gate, four uprights and the diagonal, with the diagonal lit. It is
    # the only counting mark in the set and it reads as a NUMBER even at range.
    #
    # The uprights are three pixels wide, not two. At two the shading pass eats
    # one of them into shadow and the gate reads as a row of dashes.
    for x in (4.0, 8.6, 13.2, 17.8):
        c.rect(x - 1.5, 3.5, x + 1.5, 20.5, S)
    c.line(1.5, 21.0, 21.0, 3.0, E, 3.2)



@icon('itemPact')           # BLOOD TAX - 25 HP for 3x damage
def _(c):
    # Against BLOOD PACT (a cupped hand over a heart) and CURSED AMMO: an OPEN
    # PALM with a lit gash across it and the drops falling out of the frame.
    # Fingers are what make a hand a hand at 24 pixels - the first pass drew
    # the palm as one disc and it read as a lollipop.
    #
    # The GAPS between the fingers are load-bearing and have to be two pixels
    # clear. At one the generated outline has nothing to run between them and
    # four fingers fuse into a paddle.
    for x in (7.0, 11.0, 15.0, 19.0):
        c.rect(x - 1.2, 1.5, x + 1.2, 11.0, S)
    c.rect(2.0, 7.0, 4.4, 13.5, S)                # the thumb, out to the side
    c.rect(4.4, 10.5, 20.6, 18.0, S)              # the palm
    # The gash runs the width of the palm, so the lit part of the icon is the
    # wound and not the hand - the one rule the whole set runs on.
    c.rect(6.0, 13.0, 19.0, 15.6, E)
    for px, py in ((8.0, 21.5), (13.0, 22.5), (18.0, 21.5)):
        drop(c, px, py, 1.5, E)



@icon('itemRoulette')       # SIX CHAMBERS - full heal or 1 HP
def _(c):
    # Against SPEED LOADER, which is also a cylinder. That one is six chambers
    # ALL charged and has a rod out of the top; this is six chambers with
    # exactly ONE loaded, no rod, and the loaded chamber lit - the whole item
    # is which hole the round is in.
    c.disc(12, 12, 10.4, S)
    for i in range(6):
        a = math.radians(90 + i * 60)
        c.disc(12 + math.cos(a) * 5.6, 12 - math.sin(a) * 5.6, 2.4, DEEP)
    c.disc(12, 6.4, 2.4, E)
    c.disc(12, 12, 1.8, DEEP)


@icon('itemDonate')         # OPEN VEIN - 50 HP for a full reserve
def _(c):
    # Against AMMO FABRICATOR (a hopper making rounds out of nothing): a blood
    # bag feeding a magazine. Two bodies joined by a LINE is a silhouette
    # nothing else here has - which only works if the line survives, so it is
    # four pixels wide. At two the shading pass turns the whole tube to shadow
    # and the icon becomes two unrelated objects.
    c.poly([(5.0, 1.0), (15.0, 1.0), (16.0, 9.0), (4.0, 9.0)], S)
    c.rect(6.4, 2.0, 13.6, 7.6, E)                # what is in the bag
    c.rect(8.4, 9.0, 12.4, 14.0, S)               # the line
    c.rect(6.0, 13.5, 18.0, 23.0, S)              # the magazine
    for y in (16.0, 19.0):
        c.rect(7.6, y, 16.4, y + 1.8, E)



@icon('itemRegen')          # SUTURE ENGINE - 5 HP/s for 8s
def _(c):
    # Against NANOWEAVE (a woven plate) and pickHealth: a curved needle drawing
    # a thread across a wound. The stitches ARE the silhouette - a row of
    # crosses over a gap, which nothing else in the set draws.
    c.rect(1.0, 11.0, 23.0, 13.0, DEEP)           # the wound, held open
    for x in (4.5, 9.5, 14.5, 19.5):
        c.line(x - 2.4, 8.4, x + 2.4, 15.6, E, 1.9)
        c.line(x + 2.4, 8.4, x - 2.4, 15.6, E, 1.9)
    c.arc(19.0, 19.0, 5.6, 2.2, 200, 340, S)      # the needle, coming round
    c.disc(13.4, 19.6, 1.6, S)


@icon('itemReroll')         # SECOND OPINION - two free rerolls
def _(c):
    # Against `gear` (the reroll station) and DEVIL'S GAMBLE (a coin in the
    # air): two arrows chasing each other round a coin nobody has paid for.
    # The station is a toothed wheel; this is two open hooks, which is a much
    # lighter shape and reads as "again" rather than as machinery.
    c.disc(12, 12, 5.0, S)
    c.disc(12, 12, 2.6, DEEP)
    c.arc(12, 12, 9.6, 2.6, 40, 200, E)
    c.arc(12, 12, 9.6, 2.6, 220, 20, E)
    c.poly([(3.4, 8.6), (8.4, 8.0), (5.2, 3.4)], E)
    c.poly([(20.6, 15.4), (15.6, 16.0), (18.8, 20.6)], E)


@icon('itemHumours')        # FOUR HUMOURS - shots cycle four elements
def _(c):
    # Against DEVIL'S GAMBLE and VENOM ROUNDS: a round seen NOSE-ON, quartered.
    # A disc cut into four wedges is the only way to say "four things taking
    # turns" in a silhouette, and no other icon here is a divided circle.
    c.disc(12, 12, 10.0, S)
    c.rect(11.2, 1.5, 12.8, 22.5, DEEP)
    c.rect(1.5, 11.2, 22.5, 12.8, DEEP)
    # Two opposite quarters lit and two left as structure: all four lit is a
    # solid disc again, and the alternation is what says they take turns.
    c._scan(lambda px, py: (px - 12) ** 2 + (py - 12) ** 2 <= 81
            and px > 12.8 and py < 11.2, E)
    c._scan(lambda px, py: (px - 12) ** 2 + (py - 12) ** 2 <= 81
            and px < 11.2 and py > 12.8, E)
    c.disc(12, 12, 2.2, S)


@icon('itemGraft')          # GRAFT - permanent +3 max HP
def _(c):
    # Against pickHealth (a cross) and WATERLINE (a heart filled to a line):
    # the heart with a PATCH stitched onto it, and the patch is the lit part.
    # A heart with a rectangle and four stitches over one shoulder is a
    # different shape at any size.
    c.disc(8.4, 9.0, 5.0, S)
    c.disc(15.6, 9.0, 5.0, S)
    c.poly([(3.2, 10.8), (20.8, 10.8), (12, 22.0)], S)
    c.rect(12.6, 11.0, 20.0, 17.4, E)
    for x in (13.6, 16.3, 19.0):
        c.rect(x - 0.4, 10.0, x + 0.4, 11.6, DEEP)
        c.rect(x - 0.4, 16.8, x + 0.4, 18.4, DEEP)


@icon('itemMartyr')         # MARTYR - detonate yourself
def _(c):
    # Against DETONATOR (a round whose nose bursts) and REACTIVE PLATING: a
    # FIGURE at the centre of the blast. The little body is the whole item -
    # every other explosion in the set has an object in the middle and this one
    # has a person - so the middle has to be big enough to hold one.
    #
    # THE WELL IS AS IMPORTANT AS THE STAR. The figure is drawn in STRUCTURE
    # against the darkest tone available, not against the blast, because a
    # structural body laid straight over an energy burst is two mid-tones on
    # top of each other and disappears at arena range.
    star(c, 12, 12, 12.0, 8.4, 8, E, phase=22)
    c.disc(12, 12, 7.8, DEEP)
    c.disc(12, 8.0, 2.9, S)                       # head
    c.rect(9.8, 10.8, 14.2, 17.4, S)              # body
    c.line(9.8, 12.0, 6.2, 15.0, S, 2.4)          # arms out
    c.line(14.2, 12.0, 17.8, 15.0, S, 2.4)



@icon('itemMeteor')         # FALLING SKY - meteors strike for 3s
def _(c):
    # Against HELLFIRE and LIGHTNING WIZARD (one bolt from above): three rocks
    # on parallel diagonals with rings under them. The REPETITION is the tell -
    # a shower, not a strike - so all three run the same way at the same angle.
    #
    # STAGGERED DOWN THE FRAME, not lined up along the top. Three rocks at the
    # same height is a border; three at different heights is a fall in
    # progress, and it is also the only way this fills 24 by 24.
    for x0, y0 in ((1.5, 0.5), (8.0, 3.0), (14.5, 5.5)):
        c.line(x0 - 1.0, y0 - 0.5, x0 + 3.0, y0 + 3.5, E, 2.2)
        c.disc(x0 + 4.4, y0 + 5.0, 2.7, S)
    # The ground they are coming for. Three arcs on one line, so the eye reads
    # a floor rather than three unrelated marks.
    for cx in (4.0, 11.5, 19.0):
        c.arc(cx, 20.0, 4.2, 2.0, 200, 340, E)



@icon('itemLodestar')       # LODESTAR - pull in every orb and pickup
def _(c):
    # Against LODESTONE (a big coin with three small ones round it) and
    # pickMagnet (a horseshoe): a STAR with orbs falling into it. The pointed
    # silhouette is the difference - the other two are round.
    #
    # A FAT star: five points at rout 11 / rin 6. The first pass used rin 4,
    # which at this size is five needles with nothing joining them. The two
    # orbs sit in the GAPS between points, not on them - an orb on a point
    # lengthens the point and stops being an orb.
    star(c, 12, 12, 11.0, 6.8, 5, S)
    c.disc(12, 12, 4.2, E)
    for a in (126, 342):
        rad = math.radians(a)
        c.disc(12 + math.cos(rad) * 10.4, 12 - math.sin(rad) * 10.4, 2.2, E)



@icon('itemHoming')         # BIRD DOG - your shots find their mark
def _(c):
    # Against SEEKER, which is the same idea. SEEKER is a round bending around
    # a post; this is the same bend ARRIVING - the passive item says "it
    # curves", the item says "it lands" - so the thing it is drawn against is
    # the ring target, and the round is at the end of the curve rather than the
    # start.
    c.ring(16.5, 8.5, 7.0, 2.4, S)
    c.disc(16.5, 8.5, 2.6, E)
    # The curve as three straight segments. A real arc at this size is one
    # pixel wide through the middle and the shading pass eats it.
    c.line(1.0, 22.0, 6.0, 20.0, E, 3.0)
    c.line(6.0, 20.0, 10.0, 16.5, E, 3.0)
    c.line(10.0, 16.5, 13.4, 12.0, E, 3.0)



@icon('itemBlink')          # COLD SPOT - teleport to open ground
def _(c):
    # Against BLINK DRIVE (chevrons out of an after-image) and DOUBLE JUMP: two
    # marks with a gap of NOTHING between them. The absence is the icon, so the
    # two ends are drawn at different densities - one solid, one still forming -
    # and the trail between them is dots rather than a line, because a line
    # would say the player travelled the distance.
    hexagon(c, 5.8, 12.0, 5.2, S)
    hexagon(c, 17.8, 12.0, 5.2, E)
    for x in (11.0, 12.2, 13.4):
        c.disc(x, 12.0, 1.2, E)



@icon('itemCharge')         # BONESAW - dash through enemies
def _(c):
    # Against BLINK DRIVE, deliberately close and deliberately not the same:
    # both are movement to the right. That one is two clean chevrons out of
    # three dashes; this is a SERRATED wedge and a body that has come apart
    # behind it. The teeth are the difference and they are what name it.
    c.poly([(0.5, 2.0), (16.0, 12.0), (0.5, 22.0)], S)
    # Cut out of the leading edge rather than laid on top of it - notches in
    # the silhouette survive at any size, and a lit stripe inside a shape does
    # not read as a tooth.
    for i in range(4):
        y = 5.0 + i * 4.6
        c.erase(lambda px, py, y=y: abs(py - y) < 1.3 and px > 9.0)
    c.line(0.5, 2.0, 16.0, 12.0, E, 2.0)
    c.line(0.5, 22.0, 16.0, 12.0, E, 2.0)
    c.rect(18.5, 2.5, 23.5, 9.0, D)               # the two halves of what it
    c.rect(18.5, 15.0, 23.5, 21.5, D)             # just went through



@icon('itemLance')          # LANCE - 30 ammo, pierces everything
def _(c):
    # Against PIERCING SHOT (a round through two thin plates) and TRIPLE TAP:
    # ONE enormous cartridge, nose right, with the lance of light carrying on
    # past it. The SCALE is the message - it is the largest single object in the
    # set, which is exactly what the item is.
    #
    # THE RIM GROOVE IS WHAT MAKES IT A CARTRIDGE. Without it a case and a
    # tapered nose is a home-plate pentagon, which is what the first two passes
    # drew - and the beam behind it, in the same tone, vanished into it. The
    # beam is now only where the round is NOT.
    c.rect(0.5, 11.0, 5.0, 13.0, E)               # the lance, behind...
    c.rect(17.5, 11.0, 23.5, 13.0, E)             # ...and ahead of it
    c.rect(3.0, 6.5, 11.0, 17.5, S)               # the case
    c.poly([(11.0, 6.5), (18.0, 12.0), (11.0, 17.5)], S)   # and the nose
    c.rect(4.4, 6.5, 5.8, 17.5, DEEP)             # the rim groove



@icon('itemTurret')         # LITTLE BROTHER - an auto-turret
def _(c):
    # Against `gun` (the weapon offer) and AMMO STATION (a crate): a squat
    # tripod with a single barrel and a lit eye. Three splayed legs under one
    # drum is a silhouette nothing else in the set has.
    c.line(12, 14.0, 3.5, 22.0, S, 2.2)
    c.line(12, 14.0, 20.5, 22.0, S, 2.2)
    c.line(12, 14.0, 12.0, 22.5, S, 2.2)
    c.rect(6.0, 8.0, 18.0, 15.0, S)
    c.rect(1.0, 10.2, 6.0, 12.8, S)               # the barrel
    c.disc(13.0, 11.0, 2.6, E)                    # the eye
    c.rect(8.0, 4.5, 16.0, 8.0, S)


@icon('itemMine')           # WELCOME MAT - a proximity mine
def _(c):
    # Against DETONATOR and REACTIVE PLATING: a pressure plate with PRONGS
    # sticking up out of it and a lit ring around it on the floor. The prongs
    # are the tell - it is the only icon here that is waiting for a foot.
    c.ring(12, 16.5, 10.6, 1.6, E)                # the blast radius, on the deck
    ellipse(c, 12, 15.0, 7.6, 3.6, S)
    for x in (6.4, 12.0, 17.6):
        c.rect(x - 0.9, 8.0, x + 0.9, 13.0, S)
        c.disc(x, 7.4, 1.5, E)


@icon('itemBomb')           # SHORT FUSE - a bomb on a 3s fuse
def _(c):
    # Against DETONATOR (a round whose nose bursts): a sphere with a BURNING
    # FUSE curling off it. The fuse is a long thin lit line leaving the body,
    # which no other icon in the set has, and the round body is deliberately
    # featureless so the fuse is the only thing to look at.
    c.disc(11.0, 15.0, 7.6, S)
    c.rect(9.6, 5.8, 12.4, 8.4, S)                # the collar
    c.line(11.0, 6.0, 15.0, 3.0, E, 1.6)          # the fuse
    c.line(15.0, 3.0, 18.4, 5.2, E, 1.6)
    star(c, 19.6, 4.2, 4.0, 1.4, 5, E, phase=54)


@icon('itemWall')           # FIREBREAK - a wall of fire that stops shots
def _(c):
    # Against HELLFIRE (a trail dropped behind you) and statusFire: a ROW of
    # flames standing on a floor line. The straight base is the whole point -
    # every other fire in the set is a single free-standing tongue, and this
    # one is a barrier, so it is drawn as one.
    c.rect(0.5, 19.5, 23.5, 21.5, S)
    flame(c, 5.0, 19.5, 4.4, 11.0, E)
    flame(c, 12.0, 19.5, 5.2, 15.5, E)
    flame(c, 19.0, 19.5, 4.4, 12.5, E)
    # Two rounds stopping against it, which is the half of the item that is not
    # already said by the flames.
    c.rect(20.6, 8.0, 23.5, 9.6, D)
    c.rect(21.6, 13.0, 23.5, 14.6, D)


@icon('itemSwarm')          # APIARY - five hunting bees
def _(c):
    # Against NEUROTOXIN (poison jumping between bodies) and ARC ROUNDS: a hex
    # cell with five winged motes leaving it. The hexagon says where they came
    # from and the count says how many - both are the item.
    hexagon(c, 12, 13.5, 7.0, S)
    hexagon(c, 12, 13.5, 4.0, DEEP)
    for a, r in ((90, 11.0), (162, 9.6), (234, 10.4), (306, 9.6), (18, 10.8)):
        rad = math.radians(a)
        bx = 12 + math.cos(rad) * r
        by = 13.5 - math.sin(rad) * r
        c.disc(bx, by, 1.8, E)
        c.line(bx - 2.4, by - 1.6, bx - 0.6, by - 0.4, E, 1.0)
        c.line(bx + 2.4, by - 1.6, bx + 0.6, by - 0.4, E, 1.0)


@icon('itemHole')           # EVENT HORIZON - a thrown singularity
def _(c):
    # Against GRAVITY ROUNDS (arrows pointing inward at a point): a BLACK DISC
    # with a bright ring round it. The hole is the icon - it is the only
    # drawing in the whole set whose centre is deliberately the darkest tone
    # available, and the generated outline cannot fill it because it is
    # enclosed by lit pixels on every side.
    #
    # ONE spiral arc, not three. The first pass wound three at overlapping
    # radii and the shading pass turned the gaps between them into speckle -
    # at 24 pixels a spiral is one arc or it is noise.
    c.ring(12, 12, 11.0, 2.4, E)
    c.disc(12, 12, 8.4, S)
    c.arc(12, 12, 8.0, 1.8, 200, 20, E)
    c.disc(12, 12, 5.4, DEEP)



@icon('itemBoot')           # BOOTSTRAP - launch yourself skyward
def _(c):
    # Against DOUBLE JUMP (two chevrons) and COMBAT STIMS: a BOOT with a flame
    # cone under it. The L of the boot is a shape the movement family does not
    # have anywhere - everything else there is arrows.
    c.rect(7.0, 2.0, 14.0, 11.0, S)               # the shaft
    c.rect(7.0, 11.0, 19.5, 14.5, S)              # the foot
    c.rect(7.0, 8.4, 14.0, 10.0, DEEP)            # the laces, as one band
    flame(c, 11.0, 22.5, 4.6, 8.0, E)
    flame(c, 16.5, 22.0, 3.2, 5.6, E)


@icon('itemStone')          # BLOOD FROM STONE - credits heal you
def _(c):
    # Against VAMPIRIC ROUNDS and BLOOD PACT: a cracked block with a single
    # drop welling out of the fracture. A hard-edged polygon with one round
    # thing coming out of it is a silhouette the blood family does not have.
    c.poly([(2.5, 8.0), (9.0, 3.5), (19.5, 5.5), (21.5, 16.0),
            (13.0, 21.0), (3.5, 17.0)], S)
    # The fracture, drawn as a widening zigzag so it reads as split stone and
    # not as a scratch.
    c.line(9.0, 4.0, 11.0, 9.0, DEEP, 1.4)
    c.line(11.0, 9.0, 8.4, 13.0, DEEP, 1.8)
    c.line(8.4, 13.0, 11.5, 18.0, DEEP, 2.2)
    drop(c, 16.5, 13.0, 2.8, E)


# ---- the critical hit, as a family ---------------------------------------
#
# SIX DRAWINGS THAT MUST NOT COLLAPSE INTO EACH OTHER. They all mean "the shot
# hit harder", they are all in one hue, and at 24 pixels the obvious drawing for
# every one of them is a target with something in the middle of it. So the
# family is split by SHAPE rather than by decoration, and each one owns exactly
# one silhouette nothing else in the set has:
#
#   DEADEYE      an eye. The only eye in the catalogue.
#   MARKSMAN     a reticle - four brackets round a gap, no ring at all.
#   DEAD CENTER  a ring target with the bullseye punched out and enormous.
#   ASSASSIN     a dagger. Nothing else in the pool is a blade.
#   TELLTALE     three tally strokes, the third struck through.
#   SWEET SPOT   a crosshair over a struck spark.


@icon('deadeye')            # +15% critical hit chance
def _(c):
    # AN EYE, and it is the only one in the set. The lens is a lid shape - two
    # arcs meeting at points - because a disc alone reads as a coin and a disc
    # inside a ring reads as MIDAS. The pupil is the energy tone: what the
    # passive item does is SEE.
    c.poly([(1.5, 12.0), (7.0, 6.0), (12.0, 4.6), (17.0, 6.0), (22.5, 12.0),
            (17.0, 18.0), (12.0, 19.4), (7.0, 18.0)], S)
    c.disc(12, 12, 5.4, DEEP)
    c.disc(12, 12, 4.0, E)
    c.disc(12, 12, 1.7, DEEP)
    # The catchlight. Two pixels, upper left, where every other icon's highlight
    # is - which is what keeps the eye lit by the same lamp as the rest of them.
    c.disc(10.4, 10.4, 0.9, P)


@icon('marksman')           # +25% critical hit chance
def _(c):
    # A RETICLE MADE OF FOUR CORNER BRACKETS and nothing else - no ring, no
    # crosshair through the middle. Negative space in the centre is what tells
    # it apart from DEAD CENTER's solid bullseye, and the L-shaped corner is a
    # form the whole catalogue is otherwise free of.
    for sx in (-1, 1):
        for sy in (-1, 1):
            x = 12 + sx * 8.5
            y = 12 + sy * 8.5
            c.line(x, y, x - sx * 5.5, y, S, 2.6)
            c.line(x, y, x, y - sy * 5.5, S, 2.6)
    # The pip they are all pointing at. Bigger than a dot and smaller than a
    # bullseye: this passive item is about how OFTEN a crit lands, not how hard,
    # so the middle of the target is deliberately not the loudest thing here.
    star(c, 12, 12, 4.4, 1.6, 4, E)


@icon('deadCenter')         # crits do 3x, crit chance halved
def _(c):
    # A TARGET WHOSE MIDDLE IS THE WHOLE ICON. Concentric rings drawn thin and
    # dark so the bullseye is what the eye lands on - the passive item trades
    # the outside of the target away for the middle of it, and the drawing says
    # exactly that. It cannot be mistaken for MARKSMAN, which has no rings at
    # all, or for DEADEYE, whose outline is a lid rather than a circle.
    c.disc(12, 12, 11.0, S)
    c.ring(12, 12, 11.0, 1.6, D)
    c.ring(12, 12, 8.0, 1.6, DEEP)
    c.ring(12, 12, 5.0, 1.6, DEEP)
    c.disc(12, 12, 3.6, E)
    # The round already in it, off centre, so the target reads as SHOT rather
    # than as printed.
    c.disc(11.0, 11.0, 1.2, P)


@icon('assassin')           # the first hit on an enemy always crits
def _(c):
    # A DAGGER, POINT DOWN, and nothing else in the catalogue is a blade -
    # EXECUTIONER is an axe on a haft and BONESAW is a serrated wedge, both of
    # which are wide. This is the narrowest silhouette in the set.
    #
    # THE BLADE IS STRUCTURE AND THE EDGE IS ENERGY. Drawn the other way round
    # it came out almost entirely pale: the shading pass lights the upper-left
    # rim of a shape, and a four-pixel blade is nearly all rim.
    c.poly([(12.0, 1.0), (15.6, 7.0), (15.6, 14.5), (12.0, 18.5),
            (8.4, 14.5), (8.4, 7.0)], S)
    c.poly([(12.0, 2.5), (14.0, 7.4), (14.0, 14.0), (12.0, 16.6)], E)
    c.rect(4.5, 15.0, 19.5, 17.4, S)          # the guard
    c.rect(10.4, 17.4, 13.6, 22.0, S)         # the grip
    c.disc(12.0, 22.4, 2.2, S)                # the pommel


@icon('telltale')           # every 3rd hit on one enemy crits
def _(c):
    # A TALLY, AND THE STRIKE IS THE LIT PART. Three strokes and a diagonal
    # through the third - the one drawing in the world that means "every
    # third", and it is legible at three pixels a stroke. BODY COUNT is a
    # five-bar gate of five strokes; this is three, and the diagonal crosses
    # only the last of them, so the two can never read as each other.
    #
    # THE STROKES ARE ALL STRUCTURE AND ONLY THE STRIKE IS ENERGY. Lighting the
    # third stroke as well merged it with the diagonal into one bright blob -
    # the shading pass has nothing to separate two touching shapes of the same
    # tone with, and the whole reading is that the third mark is CROSSED.
    for x in (5.0, 10.5, 16.0):
        c.line(x, 4.5, x, 19.5, S, 3.0)
    c.line(12.5, 21.0, 20.0, 3.5, E, 2.8)


@icon('itemCrit')           # SWEET SPOT - every shot crits for 8s
def _(c):
    # A CROSSHAIR LANDING ON A SPARK. The four arms are a form the reticle
    # family has (MARKSMAN's brackets are corners, not arms) and the burst under
    # them is what makes it an EVENT rather than a sight: the item is eight
    # seconds of hits, not a way of aiming.
    star(c, 12, 12, 10.5, 3.4, 4, E)
    star(c, 12, 12, 7.4, 2.4, 4, P, phase=45)
    for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        c.line(12 + dx * 10.5, 12 + dy * 10.5, 12 + dx * 4.4, 12 + dy * 4.4, S, 2.2)
    c.disc(12, 12, 3.0, DEEP)
    c.disc(12, 12, 1.6, P)


# ---- range ----------------------------------------------------------------


@icon('longshot')           # more damage the further the target
def _(c):
    # THREE CHEVRONS, GROWING, AND THE FAR ONE IS LIT. The drawing says "the
    # further it travels, the harder it lands" without a number - the size IS
    # the number - and it is the only place in the catalogue where a repeated
    # shape changes scale.
    #
    # TWO EARLIER PASSES FAILED IN THE SAME WAY and both are worth recording.
    # A pair of target rings at two scales did not survive the shading: a ring
    # under two pixels thick is entirely rim, so the lit far target came back as
    # structure. Then the same chevrons over a trajectory LINE merged with it
    # into one solid wedge. What works is separation: no connecting line at all,
    # and the gaps are what let the eye read three of anything.
    for x, y, size, w, tone in (
        (4.0, 19.5, 2.4, 2.0, D),
        (10.5, 12.5, 3.4, 2.6, S),
        (17.5, 6.0, 4.4, 3.4, E),
    ):
        c.line(x - size, y + size, x + size, y, tone, w)
        c.line(x - size, y - size, x + size, y, tone, w)


@icon('pointBlank')         # +30% damage within 5 metres
def _(c):
    # A MUZZLE FIRED INTO SOMETHING THAT IS TOUCHING IT. Longshot is a taper
    # going away; this is a wall of flash filling the frame with no travel in it
    # at all - the two are opposites and the drawings have to be opposites.
    c.rect(0.5, 9.5, 8.5, 14.5, S)            # the barrel, edge on
    c.rect(0.5, 9.5, 2.2, 14.5, D)
    c.rect(6.5, 8.6, 8.5, 15.4, S)            # and its crown
    # The star of flash, enormous, taking most of the grid. One star and not
    # two: the second only ever filled in the notches of the first.
    star(c, 14.5, 12.0, 10.0, 3.4, 6, E, phase=0)
    c.disc(14.5, 12.0, 3.0, P)


# ---- what a hit taken is worth --------------------------------------------


@icon('bloodMoney')         # credits for damage taken
def _(c):
    # A COIN WITH A DROP FALLING OFF IT. Against MIDAS, which is a coin with a
    # ring and a bullseye and two stars: this one has no ring and no stars, and
    # what it has instead is the drop - the one shape the money family does not
    # own anywhere and the blood family owns everywhere.
    c.disc(10.0, 9.0, 8.0, S)
    c.ring(10.0, 9.0, 8.0, 1.2, D)
    # The mark on the face. A bar through it, not a currency glyph: text at this
    # size is four unreadable pixels.
    c.rect(8.9, 3.0, 11.1, 15.0, DEEP)
    c.rect(6.0, 6.6, 14.0, 8.0, DEEP)
    c.rect(6.0, 10.0, 14.0, 11.4, DEEP)
    # Clear of the coin, so the drop reads as having FALLEN rather than as a
    # nick out of the rim.
    drop(c, 18.5, 19.0, 3.4, E)


@icon('adrenaline')         # +4% damage per hit taken, resets each wave
def _(c):
    # A SYRINGE, WHICH THE CATALOGUE DOES NOT HAVE. COMBAT STIMS is a boot and a
    # chevron; the medical family is a cross (pickHealth) and a case (itemHeal).
    #
    # UPRIGHT, AND NARROW. Drawn on the diagonal - which was the first two
    # passes - the barrel, the flange and the plunger all touch at 24 pixels and
    # come back as one wedge. Upright they separate, and what stops it reading
    # as a MAGAZINE is the proportion: a magazine is a wide box, and this is a
    # four-pixel tube under a ten-pixel crossbar with a spike under it. Nothing
    # in the ammunition family has a T on top.
    c.rect(6.5, 1.0, 17.5, 3.2, S)            # the finger flange
    c.rect(10.6, 3.2, 13.4, 5.4, S)           # the plunger rod, thin
    c.rect(8.4, 6.4, 15.6, 18.0, S)           # the barrel
    c.rect(9.6, 8.6, 14.4, 17.2, E)           # the dose standing in it
    c.poly([(9.4, 18.0), (14.6, 18.0), (12.0, 20.4)], S)   # the shoulder
    c.rect(11.2, 20.0, 12.8, 23.0, S)         # the needle


# ---- the rest --------------------------------------------------------------


@icon('rabbitsFoot')        # +15% drop chance
def _(c):
    # A PAW, and it has to be unmistakably a paw or the charm reads as a generic
    # lucky token. A pad with four toes ABOVE AND CLEAR OF IT is the only shape
    # that does that at this size. Nothing else in the catalogue is organic.
    #
    # THE GAPS BETWEEN THE TOES ARE THE DRAWING. Two passes were lost to this:
    # at r=2.2 the shading pass ate every toe into a hollow ring, and at r=3.0
    # they touched and came back as one bar across the top. Two and a half, set
    # a clear pixel apart, is the one size that is both solid and separate.
    ellipse(c, 10.5, 17.5, 6.4, 4.6, S)
    for x, y in ((2.6, 10.0), (7.6, 6.2), (13.6, 6.4), (18.6, 9.8)):
        c.disc(x, y, 2.4, S)
    # The charm it hangs on: a ring off the ankle, which is what makes it a
    # keepsake rather than an animal - and it is the lit part, because the LUCK
    # is the upgrade and the foot is only where it is kept.
    c.line(15.6, 20.4, 18.6, 18.0, E, 2.2)
    c.ring(20.0, 15.0, 3.4, 2.2, E)


@icon('crouchfire')         # +20% fire rate while crouching
def _(c):
    # A FIGURE DOWN ON ONE KNEE, ON A FLOOR, WITH THE RATE COMING OFF ITS GUN.
    # DIG IN is a planted stake and a shield; this is a BODY, which the
    # catalogue has exactly one other of (MARTYR) and that one is standing
    # inside a blast.
    #
    # THE FLOOR LINE IS WHAT MAKES IT A CROUCH. Two passes were lost without
    # one: masses alone read as a hammer, because a head on a stalk over a
    # horizontal bar IS a hammer. With ground under it the same shape is a
    # person kneeling on it, and the reading is not ambiguous any more.
    c.rect(1.0, 20.6, 23.0, 22.4, D)               # the floor
    c.disc(6.6, 5.4, 3.4, S)                       # the head
    c.rect(3.6, 9.0, 10.4, 17.0, S)                # the torso, a block
    c.rect(3.6, 17.0, 15.0, 20.6, S)               # the leg, folded forward
    c.rect(11.6, 13.4, 15.0, 20.6, S)              # and the shin under the knee
    c.rect(10.6, 10.4, 19.0, 13.0, S)              # the gun, held level
    c.rect(10.6, 10.4, 19.0, 11.2, D)
    # The rate, as three bars stepping off the muzzle. The same vocabulary
    # OVERCLOCK's needle and HAIR TRIGGER use for speed, at the one place on
    # this drawing it can be read: out in front, against empty grid.
    for i in range(3):
        c.rect(19.6, 4.6 + i * 3.2, 23.0 - i * 1.6, 6.2 + i * 3.2, E)


@icon('bloodsport')         # melee kills heal
def _(c):
    # BRASS KNUCKLES, with a drop coming off them. A FIST was the obvious
    # drawing and it does not survive the size: the RAGE pickup is already a
    # fist, and two fists at 24 pixels are one shape. A bar with four holes
    # punched through it is a silhouette nothing else in the catalogue has, it
    # is unmistakably a melee weapon, and the holes are the generated outline's
    # best case - they are enclosed by lit pixels on every side.
    c.poly([(2.5, 8.0), (21.5, 8.0), (21.5, 14.5), (18.0, 18.0),
            (6.0, 18.0), (2.5, 14.5)], S)
    for i in range(4):
        c.disc(5.4 + i * 4.4, 11.6, 1.9, DEEP)
    # The grip bar under the holes, so the thing reads as held rather than as a
    # plate with holes in it.
    c.rect(4.0, 15.0, 20.0, 16.6, D)
    # And what it buys: the drop, clear of the metal.
    drop(c, 19.0, 21.0, 2.8, E)


@icon('warChest')           # +1 damage per $1,000 banked
def _(c):
    # A STACK OF MONEY WITH A ROUND STANDING IN IT. That is the entire pick -
    # the balance you did NOT spend, standing there as damage - and it is the
    # one drawing that says both halves at once.
    #
    # A CHEST WAS THE FIRST IDEA AND IT DOES NOT SURVIVE THE SIZE. A wide box
    # with a rim across it and a hasp down the middle is a shopfront: two
    # passes at it read as a building, because at 24 pixels a rectangle with a
    # horizontal band and a vertical divider is a facade whatever it was drawn
    # as. A stack is unambiguous, and it is distinct from the coin family -
    # MIDAS and BLOOD MONEY are each ONE disc, face on, and this is several
    # seen edge on.
    for i, y in enumerate((21.0, 18.2, 15.4)):
        ellipse(c, 11.0, y, 8.6 - i * 0.6, 2.3, S)
        # A dark seam under each disc, so a stack of three reads as three
        # rather than as one tall cylinder.
        ellipse(c, 11.0, y + 1.1, 8.6 - i * 0.6, 1.0, D)
    # The round standing in the top of it, big, and the only lit thing here.
    bullet(c, 8.0, 1.5, 6.0, 12.0, E, P)


@icon('twinCell')           # hold two active-item charges
def _(c):
    # TWO CELLS SIDE BY SIDE, one full and one filling. Against the single
    # battery nothing else in the set draws: the COUNT is the passive item, so
    # the icon is a pair, and the difference in fill between the two says which
    # one is the spare without a word.
    for i, (x, fill) in enumerate(((2.5, 1.0), (13.0, 0.45))):
        c.rect(x, 5.0, x + 8.5, 20.5, S)          # the case
        c.rect(x + 3.0, 3.2, x + 5.5, 5.0, S)     # the terminal
        c.rect(x + 1.4, 6.4, x + 7.1, 19.1, DEEP) # the window
        top = 19.1 - 12.7 * fill
        c.rect(x + 1.4, top, x + 7.1, 19.1, E)    # the charge in it
    # And the bolt across both, so the pair reads as CHARGE rather than as two
    # tins - the same mark the fire-rate pickup uses, small.
    c.poly([(13.0, 10.0), (10.0, 13.4), (11.8, 13.4), (9.6, 16.4),
            (13.4, 12.6), (11.6, 12.6)], P)


@icon('magpie')             # a bird that collects credits
def _(c):
    # A BIRD IN PROFILE WITH A COIN IN ITS BEAK. Nothing else in the catalogue
    # is an animal at all, so the silhouette is free - what it has to get right
    # is the LONG TAIL, which is the only thing that makes it a magpie rather
    # than a generic bird, and the coin, which is the only thing that says what
    # it is for.
    #
    # IT IS PIED, AND THAT IS WHAT MAKES IT LEGIBLE. Three passes were lost
    # drawing the whole animal in one tone with a small pale wing on it: the
    # shading pass lights the edges of the SILHOUETTE, so where the tail meets
    # the body there is no edge to light and the two fuse into a lump whatever
    # size they are drawn at. The bird is a WHITE BELLY with a dark head, wing
    # and tail instead - which is both the real marking and the only internal
    # contrast a 24-pixel animal can have.
    c.poly([(8.6, 15.0), (1.0, 20.6), (3.6, 23.0), (11.2, 17.6)], S)   # the tail
    ellipse(c, 11.6, 12.6, 5.6, 4.8, P)                                # the white body
    # The dark half: the folded wing over the back, meeting the head. Drawn as
    # a wedge rather than as a second ellipse so the join between the two tones
    # is a hard diagonal - a curve against a curve reads as a smudge.
    c.poly([(6.4, 13.4), (9.2, 8.4), (15.4, 8.8), (12.4, 13.4), (8.2, 14.6)], S)
    c.disc(16.6, 6.8, 3.5, S)                                          # the head
    c.poly([(19.6, 5.8), (23.5, 7.6), (19.6, 9.4)], E)                 # the beak
    c.disc(17.6, 6.0, 1.0, DEEP)                                       # the eye
    c.line(10.6, 16.8, 10.6, 20.4, S, 1.4)                             # the legs
    c.line(13.6, 16.4, 13.6, 20.0, S, 1.4)
    # The take, held clear of the beak so it is not lost in the head.
    c.disc(20.4, 13.8, 3.0, E)
    c.ring(20.4, 13.8, 3.0, 1.0, S)


@icon('lamprey')            # a leech that guards you
def _(c):
    # A RING OF TEETH ON A COILED BODY. HAEMOPHAGE (the active item) is a leech
    # wrapped round a CARTRIDGE - the round is the subject there. This one has
    # no cartridge: the mouth is the subject, drawn face on, because what the
    # passive item is is a thing that bites.
    #
    # THE BODY IS HALF THE DRAWING. The first pass gave it three short strokes
    # behind the head and the animal read as a doughnut with a stub; it curls
    # right across the grid now, tapering, so the head is clearly the FRONT of
    # something long. It curls to one side rather than coiling symmetrically -
    # a symmetric coil at this size is a spiral, and EVENT HORIZON owns that.
    c.line(11.0, 13.0, 5.0, 16.0, S, 5.6)
    c.line(5.0, 16.0, 4.0, 21.0, S, 4.4)
    c.line(4.0, 21.0, 10.0, 23.0, S, 3.2)
    c.line(10.0, 23.0, 15.5, 21.5, S, 2.0)
    c.disc(13.5, 9.0, 7.4, S)                     # the head
    c.ring(13.5, 9.0, 6.8, 1.8, E)                # the tooth ring
    c.disc(13.5, 9.0, 4.2, DEEP)                  # the funnel
    c.disc(13.5, 9.0, 2.4, E)                     # the lit throat
    # The teeth themselves, eight spokes into the funnel. Without them the head
    # is a doughnut; with them it is a mouth.
    spikes(c, 13.5, 9.0, 6.4, 4.0, 8, 1.2, E)
    # The gill row down the side, which is the one detail that makes it a
    # lamprey and not a worm.
    for i in range(3):
        c.disc(8.0 - i * 0.8, 15.0 + i * 2.2, 1.1, E)


@icon('itemAmmo')           # BANDOLIER - +30 reserve rounds
def _(c):
    # A BELT OF ROUNDS ACROSS THE FRAME. The ammo family is full of magazines
    # and drums - all of them upright containers - and a diagonal STRAP with
    # rounds seated in it is the one ammunition shape none of them is. It also
    # says QUANTITY in a way a magazine cannot: the rounds are visible and there
    # are six of them.
    c.line(1.0, 19.5, 22.5, 5.5, S, 6.4)
    c.line(1.0, 21.6, 22.5, 7.6, D, 1.4)
    for i in range(6):
        t = (i + 0.5) / 6.0
        x = 1.5 + t * 20.5
        y = 19.2 - t * 13.6
        # Seated across the strap, so each one reads as being IN a loop rather
        # than lying on top of it.
        c.line(x - 1.5, y - 2.4, x + 1.1, y + 1.8, E, 2.2)
        c.disc(x - 1.7, y - 2.8, 1.1, P)


@icon('itemMonkey')         # ORGAN GRINDER - the cymbal monkey
def _(c):
    # A MONKEY HOLDING TWO CYMBALS, and the whole job of this drawing is that
    # the player recognises the OBJECT - a wind-up toy - because that is what
    # makes an arena full of enemies walking toward it read as a joke rather
    # than as a bug. So the cymbals are enormous, the head is round, the ears
    # stick out, and there is a key in the back.
    c.disc(12.0, 9.0, 5.4, S)                      # the head
    c.disc(6.6, 8.4, 2.4, S)                       # the ears
    c.disc(17.4, 8.4, 2.4, S)
    c.disc(12.0, 10.6, 3.2, DEEP)                  # the face, dark
    c.disc(10.2, 8.2, 1.0, E)                      # and two lit eyes in it
    c.disc(13.8, 8.2, 1.0, E)
    c.rect(9.4, 14.0, 14.6, 20.0, S)               # the body
    # THE CYMBALS. Drawn edge-on as two vertical discs about to meet, which is
    # the only reading that says they are ABOUT to clash rather than lying flat.
    for sx in (-1, 1):
        x = 12.0 + sx * 6.4
        c.line(x, 12.6, x, 20.4, E, 3.0)           # the disc, edge on
        c.disc(x, 16.5, 1.6, P)                    # the dome in the middle
        c.line(12.0 + sx * 3.6, 15.0, x, 16.5, S, 1.8)   # the arm
    # The wind-up key, over the shoulder, which is the one mark that says TOY.
    c.ring(19.6, 3.6, 2.6, 1.1, E)
    c.line(17.4, 5.4, 15.4, 7.0, E, 1.4)


# ---- the posture and magazine picks ---------------------------------------


@icon('fatalReserve')       # the last 5 rounds of every magazine crit
def _(c):
    # A MAGAZINE WITH ONLY THE BOTTOM OF IT LOADED. The pick is a POSITION in
    # the magazine, not a quantity, so the drawing has to be a magazine with a
    # part of it singled out - and the part that is lit is the part that crits.
    # Five rounds, countable, at the bottom where they actually sit.
    #
    # AGAINST EXTENDED MAG, which is the same object: that one is FULL, seen
    # from the side, and reads as capacity. This one is mostly empty, which is
    # the whole difference and is legible at a glance because the dark window
    # is over half the shape.
    c.rect(6.0, 2.0, 17.0, 22.0, S)            # the body
    c.rect(5.0, 1.0, 18.0, 3.2, S)             # the feed lips
    c.rect(7.4, 3.6, 15.6, 20.6, DEEP)         # the window
    # THE FIVE SIT IN THE BOTTOM THIRD AND NOWHERE NEAR THE LIPS. Spread over
    # the whole window they filled it, and a full magazine is EXTENDED MAG -
    # the empty space above the stack is the entire subject of this drawing, so
    # it has to be most of the shape.
    # COUNTABLE, AND ON WHOLE ROWS. Canvas.rect fills ceil(y0)..floor(y1), so a
    # gap written as a sub-pixel band between two rounds lands on no row at all
    # and five rounds come back as one block - the number is the whole card
    # here, so the pitch is integer and the dark window IS the gap.
    for row in (19, 16, 13, 10, 7):
        c.rect(7.4, row, 15.6, row + 1, E)
    # The floorplate, so the stack clearly sits ON something rather than
    # floating in the bottom of a box.
    c.rect(5.6, 21.4, 17.4, 23.0, S)


@icon('primedMag')          # the reload throws the spent magazine
def _(c):
    # A MAGAZINE WITH A GRENADE'S PIN PULLED OUT OF IT, which is the entire
    # joke of the passive item drawn as one object. The ring is the only thing
    # here that is not ammunition, and it is what stops this reading as a third
    # entry in the magazine family.
    #
    # IT LIES OVER, not upright, because it is a magazine that has been THROWN.
    # Every other magazine in the set stands square, so the tilt alone
    # separates this from FATAL RESERVE across the arena.
    #
    # THE ROUNDS ARE ONE BLOCK, NOT FIVE STRIPES. Stripes drawn along a
    # diagonal come out of the rasteriser as a herringbone and the object stops
    # being an object; the count is FATAL RESERVE's subject, not this one's,
    # and all this has to say is "there is something still in it".
    c.poly([(0.6, 15.0), (12.4, 7.2), (17.4, 14.8), (5.6, 22.6)], S)
    c.poly([(3.0, 15.2), (11.4, 9.6), (14.6, 14.4), (6.2, 20.0)], DEEP)
    # Two rounds seated in it, across the tilt: without them the shape is a
    # tapered box and the ring above is doing all the work.
    c.line(4.4, 16.6, 12.6, 11.2, E, 2.2)
    c.line(6.2, 19.0, 14.2, 13.6, E, 2.2)
    # The feed lips, across the leading corner, so which end is the mouth is
    # never in question.
    c.line(11.8, 6.2, 18.2, 15.8, S, 2.8)
    # THE PIN, out and away: a fat ring on a short stem off the mouth.
    # THE PIN, small and off the shoulder. It was drawn big on the first pass
    # and the icon read as a key: the ring is the one detail that says GRENADE,
    # and a detail that outweighs its subject stops being a detail.
    c.ring(19.6, 4.2, 3.0, 1.8, E)
    c.line(17.4, 6.4, 15.0, 8.0, E, 1.8)


@icon('bailiff')            # using an item refunds 20% of its charge
def _(c):
    # A CELL INSIDE AN ARROW THAT COMES BACK ROUND TO IT. Charge is a battery
    # everywhere in this set - see TWIN CELL - so the object is already settled
    # and the only thing this drawing has to add is RETURNS.
    #
    # THE LOOP IS A RING WITH A BITE OUT OF IT, not an arc: an arc thin enough
    # to leave room for the cell inside comes out of the shading pass as a
    # dotted line. A fat ring, cut, is one unbroken stroke - and the cut has to
    # be WIDE, or the head lands on the tail and the loop reads as a full
    # circle with a lump on it.
    c.ring(12.0, 13.0, 10.6, 2.8, S)
    c.erase(lambda px, py: py < 9.0 and px > 8.0)
    # The head, clear of the cut end and pointing back into the loop.
    c.poly([(9.6, 0.8), (9.6, 9.6), (17.6, 5.2)], E)
    # The cell it all comes back to, upright in the middle.
    c.rect(8.6, 9.4, 15.4, 20.4, S)
    c.rect(10.6, 7.8, 13.4, 9.4, S)
    c.rect(9.8, 10.6, 14.2, 19.2, DEEP)
    # A FIFTH OF IT, filled from the bottom. The number on the card is 20%, and
    # this is the one place the drawing can say it without a digit.
    c.rect(9.8, 17.4, 14.2, 19.2, E)


# The classic pixel heart, seven wide. Drawn as a stamp rather than as two
# discs and a triangle: at seven pixels across, three overlapping primitives
# come out of the shading pass as one lump, and a heart that is not instantly a
# heart is not worth the seven pixels.
HEART = [
    '.44.44.',
    '4444444',
    '4444444',
    '.44444.',
    '..444..',
    '...4...',
]


@icon('paceCar')            # +10% fire rate and speed at full health
def _(c):
    # A CHEQUERED FLAG. Nothing else in the catalogue is a flag, the chequer is
    # unmistakable at this size, and the pace car is the one thing in a race
    # that is only ahead while everything is going well - which is the pick.
    #
    # THE HEART IS THE CONDITION, at the foot of the pole. Without it this is a
    # movement passive item and nothing more; with it the drawing says "while
    # whole". It is the only two-part icon in this group and it has to be: the
    # pick genuinely is two things, and neither is worth anything alone.
    c.line(3.2, 1.0, 3.2, 23.0, S, 2.4)         # the pole
    for gy in range(3):
        for gx in range(3):
            x = 5.2 + gx * 4.8
            y = 2.0 + gy * 4.8
            c.rect(x, y, x + 4.4, y + 4.4, E if (gx + gy) % 2 == 0 else DEEP)
    c.blit(HEART, 14, 17)


@icon('ceramicInsert')      # no hit takes more than 25% of max HP
def _(c):
    # A PLATE WITH A ROUND STOPPED DEAD ON ITS FACE. The pick is a CEILING, and
    # a ceiling is a thing that stops something - so the drawing is the moment
    # of stopping, with the round still there, flattened, and the crater around
    # it going no further.
    #
    # AGAINST REACTIVE PLATING, which is the other armour plate in the set:
    # that one is throwing a shockwave OUT. This one is absorbing, so everything
    # in it points inward and nothing leaves the silhouette.
    c.poly([(3.4, 4.0), (20.6, 4.0), (18.6, 21.4), (5.4, 21.4)], S)
    c.poly([(5.6, 6.0), (18.4, 6.0), (16.9, 19.4), (7.1, 19.4)], D)
    # The strike face: a shallow crater, lit, with the round embedded in it.
    ellipse(c, 12.0, 12.4, 6.4, 5.6, E)
    ering(c, 12.0, 12.4, 6.4, 5.6, 0.42, DEEP)
    # The round itself, seen nose-on and squashed - it did not get through.
    c.disc(12.0, 12.4, 2.6, P)
    c.disc(12.0, 12.4, 1.2, DEEP)


@icon('overdraw')           # overhealing becomes item charge
def _(c):
    # A CROSS SPILLING INTO A CELL. Two objects the set has already taught -
    # the health cross and the battery - with the overflow drawn between them,
    # which is the only way to say CONVERSION without an arrow. Nothing else in
    # the catalogue puts two established icons in one frame, and this is the one
    # passive item that genuinely is a pipe from one to the other.
    #
    # THE CROSS IS STRUCTURE AND THE SPILL IS ENERGY, on this set's rule: the
    # health was already there, and what the passive item DOES is the falling
    # part. A cross drawn in the pale tone came out of the shading pass flat,
    # with no rim at all, and read as a hole rather than as an object.
    c.rect(6.0, 1.0, 11.0, 13.0, S)             # the cross, brim full
    c.rect(1.6, 4.4, 15.4, 9.4, S)
    c.rect(6.6, 1.6, 9.4, 3.0, P)               # one lit facet, not a slab
    # The spill: three drops on their way down and to the right, shrinking.
    c.disc(9.6, 15.6, 2.0, E)
    c.disc(11.4, 18.4, 1.5, E)
    c.disc(13.0, 20.6, 1.0, E)
    # The cell catching it, bottom right. Deliberately the smaller of the two
    # objects: the health is the subject and the charge is where it ends up.
    c.rect(14.0, 13.6, 22.0, 23.0, S)
    c.rect(16.6, 11.8, 19.4, 13.6, S)
    c.rect(15.2, 14.8, 20.8, 21.8, DEEP)
    c.rect(15.2, 18.4, 20.8, 21.8, E)


@icon('leadBalloon')        # +25% damage, and you cannot jump
def _(c):
    # A BALLOON WITH A LEAD WEIGHT ON THE STRING, which is the name drawn
    # literally, and it earns the literalism: "went down like a lead balloon"
    # is the whole pick, both halves of it, in one object. The balloon is the
    # jump you no longer have and the block is what you were given for it.
    #
    # THE WEIGHT IS THE LIT PART, not the balloon. The rule for this set is
    # that the energy tone goes on what the passive item DOES, and what this
    # one does is make you heavy.
    ellipse(c, 8.4, 6.4, 6.4, 6.0, S)           # the balloon
    c.poly([(7.0, 11.8), (9.8, 11.8), (8.4, 14.0)], S)   # the knot
    c.line(8.4, 13.6, 12.6, 16.0, S, 1.2)       # the string, slack
    # The block, hanging off it and heavy enough to be the reason the string is
    # slack. It sits clear of the bottom edge, so the icon has a floor.
    c.rect(10.4, 15.6, 21.0, 22.4, E)
    c.rect(10.4, 15.6, 21.0, 17.0, P)           # the top face catching the light
    c.line(12.6, 19.6, 18.8, 19.6, DEEP, 1.2)   # a cast seam, so it reads solid


@icon('cheekweld')          # take 20% less damage while aiming
def _(c):
    # A STOCK IN PROFILE WITH THE CHEEKPIECE RAISED ON TOP OF IT - the one part
    # of a weapon this set has never drawn, and the one the passive item is
    # named after. The riser is the lit part, because the riser IS the passive
    # item: it is the thing your face is against.
    #
    # NOT A SCOPE AND NOT BRACKETS. STEADY AIM, MARKSMAN, DEADEYE and
    # TWENTY/TWENTY all already live in the sights-and-reticles corner of the
    # catalogue, and a fifth set of crosshairs would be unreadable beside them.
    #
    # IT IS DRAWN AS A LINE, NOT AS A MASS. The first pass stacked three solid
    # blocks and they fused into one grey slab filling three quarters of the
    # grid: at this size a weapon has to be a THIN thing with a couple of
    # cutouts, because the silhouette is doing all of the work and a silhouette
    # needs air around it.
    c.poly([(1.0, 13.6), (7.6, 10.4), (7.6, 16.6), (2.4, 19.6)], S)  # the butt
    c.rect(7.0, 10.4, 17.4, 13.8, S)            # the comb, running forward
    c.line(17.0, 11.8, 23.2, 11.8, S, 2.2)      # the barrel leaving the frame
    # THE CHEEKPIECE, raised clear of the comb and lit - the only thing in the
    # drawing above the weapon's own line, which is what makes it the subject.
    c.rect(6.4, 6.0, 15.6, 10.4, E)
    c.rect(6.4, 6.0, 15.6, 7.2, P)
    # The grip, and NOTHING ELSE below the line. A trigger guard was drawn
    # here for two passes and it never survived: a ring of stroke 1.4 hanging
    # off the underside of a bar comes back from the shading pass as four
    # unrelated pixels, and the weapon reads as debris. One solid raked block
    # is all the lower half needs to say which way the thing is pointing.
    c.poly([(9.4, 13.4), (14.2, 13.4), (12.2, 21.4), (7.4, 21.4)], S)
    c.line(10.4, 15.4, 12.4, 15.4, DEEP, 1.2)


@icon('groundhog')          # crouched: less damage taken, faster reload
def _(c):
    # A HEAD OUT OF A HOLE IN A MOUND. Crouching already has a drawing in this
    # set - CROUCHFIRE is a body under a ceiling - and a second body under a
    # second ceiling would be unreadable beside it. This is the same idea from
    # the other side: not a person made small, but a thing that LIVES down
    # there and is safe because of it.
    #
    # THE MOUND IS ONE THIRD OF THE FRAME AND NO MORE. The first pass gave it
    # half the grid and the animal was swallowed - at this size the subject has
    # to be the biggest thing in the drawing, and the subject is the groundhog.
    ellipse(c, 12.0, 25.0, 13.0, 8.6, E)        # the mound
    c.erase(lambda px, py: py > 23.6)
    ellipse(c, 12.0, 18.4, 5.2, 2.6, DEEP)      # the burrow mouth, cut into it
    # The animal. Smaller than the first pass and sitting DOWN in the hole, so
    # the lit mound still shows either side of it: the pick is the hole, and an
    # animal that covered its own burrow said nothing about being down there.
    c.disc(12.0, 11.6, 5.0, S)
    c.disc(8.4, 7.6, 2.2, S)
    c.disc(15.6, 7.6, 2.2, S)
    c.disc(10.2, 11.0, 1.3, DEEP)               # the eyes
    c.disc(13.8, 11.0, 1.3, DEEP)
    c.disc(12.0, 14.4, 2.0, P)                  # the muzzle
    c.disc(12.0, 14.0, 0.9, DEEP)               # and the nose in it


@icon('itemLockpick')       # LOCKPICK - a free mystery box roll
def _(c):
    # A PADLOCK WITH A PICK COMING IN AT THE KEYWAY. The mystery box is the
    # only locked thing in the game, so a lock is unambiguous here - and the
    # pick approaching the keyhole is what separates this from a lock that is
    # merely shut.
    #
    # THE LOCK IS OFF-CENTRE, LEFT, and the pick has the whole upper right to
    # itself. Three passes were lost running the shaft ACROSS the body, on the
    # reasoning that a pick in a lock is a pick inside it: a pale line over a
    # mid-tone block at this size is not a tool in a lock, it is a scratch on a
    # box, and it took the keyway with it. Two objects with air between them
    # read as two objects.
    c.ring(8.4, 10.0, 5.4, 3.0, S)              # the shackle
    c.erase(lambda px, py: py > 10.0 and 3.5 < px < 13.5)
    c.rect(2.6, 8.4, 5.0, 12.4, S)              # its near leg, seated
    c.rect(11.8, 5.4, 14.2, 12.4, S)            # and its far leg, lifted clear
    c.rect(1.6, 11.8, 15.2, 22.6, S)            # the body
    # THE KEYWAY, lit rather than dark: it is the way in, which is the whole
    # subject, and a black slot inside a black-outlined body is a smudge.
    c.disc(8.4, 15.8, 3.0, E)
    c.poly([(6.8, 15.8), (10.0, 15.8), (11.0, 20.8), (5.8, 20.8)], E)
    c.disc(8.4, 15.8, 1.3, DEEP)
    # The pick, in from the open corner: a shaft with a hooked tip, its point
    # ON the keyway and the rest of it out in clear air.
    c.line(11.0, 15.4, 22.4, 5.6, P, 2.0)
    c.line(11.0, 15.4, 9.6, 13.6, P, 2.0)


@icon('itemPayToWin')       # PAY TO WIN - $1,000 for 2x damage to everything
def _(c):
    # A TROPHY WITH A DOLLAR STRUCK ON THE CUP. Nothing else in the catalogue
    # is a trophy, the shape is legible at any size, and the two objects
    # together are the item's whole argument - the win, and what it cost.
    #
    # THE DOLLAR IS THE LIT PART, because what the item actually does is spend.
    c.poly([(5.0, 2.0), (19.0, 2.0), (17.4, 13.0), (6.6, 13.0)], S)  # the cup
    c.arc(5.2, 6.0, 3.6, 1.4, 60, 300, S)      # the handles
    c.arc(18.8, 6.0, 3.6, 1.4, 240, 120, S)
    c.rect(10.6, 13.0, 13.4, 17.4, S)          # the stem
    c.rect(6.6, 17.4, 17.4, 20.0, S)           # the plinth
    c.rect(4.6, 20.0, 19.4, 23.0, S)           # the base
    # The dollar: an S over a bar, both drawn, because at this size an S alone
    # is a squiggle and a bar alone is a stroke.
    c.arc(12.0, 5.6, 2.9, 1.5, 20, 200, E)
    c.arc(12.0, 9.4, 2.9, 1.5, 200, 20, E)
    c.line(12.0, 1.8, 12.0, 12.6, E, 1.3)
