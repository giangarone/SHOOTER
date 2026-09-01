"""Draws every icon and rewrites the PIXEL_ICONS table in js/pixelicons.js."""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from canvas import Canvas
import icons as A

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
TARGET = os.path.join(ROOT, 'js', 'pixelicons.js')

# One line per icon saying what the mutation does, so the table reads as a
# design document rather than as 1,560 characters of noise.
NOTE = {
    'overclock': 'OVERCLOCK - fire rate. A dial with the needle past the stop.',
    'extendedMag': 'EXTENDED MAG - magazine size. The rounds show through it.',
    'speedLoader': 'SPEED LOADER - reload speed. A cylinder charged all at once.',
    'beltFeed': 'BELT FEED - some shots come straight off the reserve.',
    'ammoHoarder': 'AMMO HOARDER - twice the reserve. The biggest drum there is.',
    'ammoFab': 'AMMO FABRICATOR - rounds made out of nothing, per second.',
    'scavenger': 'SCAVENGER - kills pull ammo to you.',
    'lodestone': 'LODESTONE - money and pickups come to you. The coin pulls.',
    'ammoBox': 'AMMO STATION.',
    'pickAmmo': 'AMMO PICKUP - one magazine off a body.',
    'pickHealth': 'HEALTH PICKUP - a cross. The heart is the max-HP station.',
    'pickDamage': 'RAGE PICKUP - damage and speed. A fist.',
    'pickRate': 'FIRE RATE PICKUP - a bolt.',
    'pickShield': 'SHIELD PICKUP.',
    'pickMagnet': 'MAGNET PICKUP - every orb on the floor comes to you.',
    'hollowPoint': 'HOLLOW POINT - more damage, smaller magazine. Nose-on.',
    'steadyAim': 'STEADY AIM - damage while you do not move. Planted.',
    'glassCannon': 'GLASS CANNON - all damage, no health. Already cracked.',
    'tripleTap': 'TRIPLE TAP - three rounds spent on one shot.',
    'darkPower': 'DARK POWER - damage for nothing. Appetite, not a weapon.',
    'berserker': 'BERSERKER - the emptier the heart, the harder you hit.',
    'hotStreak': 'HOT STREAK - damage climbs while you keep hitting.',
    'noHitBonus': 'NO-HIT BONUS - a wave cleared without being touched.',
    'bloodlust': 'BLOODLUST - fire rate that opens up with every kill.',
    'cursedAmmo': 'CURSED AMMO - a round that costs you health to fire.',
    'devilsGamble': "DEVIL'S GAMBLE - every shot is a coin toss.",
    'midas': 'MIDAS TOUCH - the dead turn gold.',
    'executioner': 'EXECUTIONER - bosses lose half their health.',
    'holyMantle': 'HOLY MANTLE - the first hit of a wave passes through you.',
    'deadCat': 'DEAD CAT - one more life, and less of it.',
    'bulwark': 'BULWARK - health bought with speed.',
    'nanoweave': 'NANOWEAVE - health that comes back on its own.',
    'reactivePlating': 'REACTIVE PLATING - being hit sets off a shockwave.',
    'vampiric': 'VAMPIRIC ROUNDS - kills give health back.',
    'bloodPact': 'BLOOD PACT - kills heal, everything else hurts more.',
    'combatStims': 'COMBAT STIMS - move faster.',
    'thorns': 'THORNS - whoever hits you gets half of it back.',
    'heart': 'MAX HEALTH STATION.',
    'evasion': 'EVASION - some hits simply find nobody there.',
    'doubleJump': 'DOUBLE JUMP - a second jump with no ground under it.',
    'doubleDash': 'DOUBLE DASH - two charges, spent sideways.',
    'demonicDodge': 'DEMONIC DODGE - dodge, then a second of being untouchable.',
    'venom': 'VENOM ROUNDS - the ammunition is poisoned, not the enemy.',
    'incendiary': 'INCENDIARY - hits set fire and it spreads off the dead.',
    'cryo': 'CRYO ROUNDS - hits halve their speed, and their shots too.',
    'petrify': 'PETRIFY - a chance to stop something where it stands.',
    'terror': 'TERROR - hit enemies run, and cannot shoot while they do.',
    'knockout': 'KNOCKOUT DROPS - hits shove.',
    'arcRounds': 'ARC ROUNDS - a hit jumps to one more enemy.',
    'piercingShot': 'PIERCING SHOT - one shot, several enemies.',
    'gravityRounds': 'GRAVITY ROUNDS - hits pull everything nearby inward.',
    'twentyTwenty': 'TWENTY/TWENTY - one trigger pull, two rounds.',
    'seeker': 'SEEKER - a miss bends onto the target anyway.',
    'detonator': 'DETONATOR - hits explode.',
    'breachRound': 'BREACH ROUND - the first shot after a reload goes off.',
    'reloadBurst': 'RELOAD BURST - the reload itself is the attack.',
    'neurotoxin': 'NEUROTOXIN - poison moves between bodies.',
    'malady': 'MALADY - poison and fire burn hotter and shorter.',
    'entropy': 'ENTROPY - the timer breaks and the status stays.',
    'crystallize': 'CRYSTALLIZE - the frozen dead come apart.',
    'ashen': 'ASHEN - the burnt dead leave something still burning.',
    'blastCorpse': 'BLAST CORPSE - the dead go off, and not only at enemies.',
    'eternalAffliction': 'ETERNAL AFFLICTION - it never lifts.',
    'absoluteZero': 'ABSOLUTE ZERO - the whole arena slows, you included.',
    'antidote': 'ANTIDOTE - poison in the world heals you instead.',
    'hellfire': 'HELLFIRE - a reload lays fire on the ground behind you.',
    'overload': 'OVERLOAD - an empty magazine discharges into everything.',
    'lightningWizard': 'LIGHTNING WIZARD - hits call it down from above.',
    'carnage': 'CARNAGE - damage stacked on kills, lost the moment you are hurt.',
    'demonicPresence': 'DEMONIC PRESENCE - he is the mutation, so he is the icon.',
    'statusFire': 'BURNING - a status on the PLAYER. Damage over time.',
    'statusPoison': 'POISONED - a status on the player. Damage over time.',
    'statusFear': 'AFRAID - a status on the player. The trigger does nothing.',
    'statusWeakness': 'WEAKENED - a status on the player. Your shots hit softer.',
    'statusCurse': 'CURSED - a status on the player. Everything hurts 25% more.',
    'statusSlowness': 'SLOWED - a status on the player. You move at a fraction.',
    'gear': 'REROLL STATIONS.',
    'gun': 'WEAPON OFFER.',
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
