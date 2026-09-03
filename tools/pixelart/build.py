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
    'pickHealth': 'HEALTH PICKUP - a cross.',
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
    'evasion': 'EVASION - some hits simply find nobody there.',
    'doubleJump': 'DOUBLE JUMP - a second jump with no ground under it.',
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
    'statusFire': 'BURNING - a status on the PLAYER. Damage over time.',
    'statusPoison': 'POISONED - a status on the player. Damage over time.',
    'statusFear': 'AFRAID - a status on the player. The trigger does nothing.',
    'statusWeakness': 'WEAKENED - a status on the player. Your shots hit softer.',
    'statusCurse': 'CURSED - a status on the player. Everything hurts 25% more.',
    'statusSlowness': 'SLOWED - a status on the player. You move at a fraction.',
    'hairTrigger': 'HAIR TRIGGER - rate bought with recoil. The trigger and the kick.',
    'brassEcho': 'BRASS ECHO - a round that hit comes back to the reserve.',
    'openingSalvo': 'OPENING SALVO - the first ten seconds of a wave are free.',
    'untouched': 'UNTOUCHED - max HP banked for every wave nothing touched you.',
    'scarTissue': 'SCAR TISSUE - max HP every wave, and every hit hurts more.',
    'blackout': 'BLACKOUT - health bought with the range you can see.',
    'digIn': 'DIG IN - stand still and you knit back together.',
    'secondWind': 'SECOND WIND - stamina spent slower and returned faster.',
    'gear': 'REROLL STATIONS.',
    'gun': 'WEAPON OFFER.',
    'itemHeal': 'TRAUMA KIT - heal 25 HP. A case, so it is not pickHealth.',
    'itemFreeze': 'CRYO PULSE - freeze the room. A flake inside a shockwave.',
    'itemRage': 'OVERDRIVE - 2x damage. A governor pushed past its stop.',
    'itemGuard': 'AEGIS - invincible. A dome, not a shield in a hand.',
    'itemDash': 'BLINK DRIVE - the dash, now a device in a slot.',
    'itemPurify': 'WHITE CELL - clear every affliction. A cell eating the dark.',
    'itemInferno': 'BRIMSTONE - the whole room burns. Fire over a crowd.',
    'itemArc': "JACOB'S LADDER - a bolt walks through five bodies.",
    'itemMercy': 'LAST RITES - the nearly dead are finished. Skull and flatline.',
    'itemLeech': 'HAEMOPHAGE - hits heal. A leech coiled round the round.',
    'itemLastStand': 'WATERLINE - healed up to half, and no further.',
    'itemQuake': 'TECTONIC - the ground drives them all outward.',
    'itemRate': 'RED LINE - the dial with the needle in the red block.',
    'itemFrenzy': 'RED MIST - three times damage, twice taken. An open jaw.',
    'itemTally': 'BODY COUNT - damage per kill. A five bar gate.',
    'itemPact': 'BLOOD TAX - health for damage. An opened palm.',
    'itemRoulette': 'SIX CHAMBERS - one chamber loaded out of six.',
    'itemDonate': 'OPEN VEIN - blood into ammunition. A bag feeding a magazine.',
    'itemRegen': 'SUTURE ENGINE - health knitted back. Needle and stitches.',
    'itemReroll': 'SECOND OPINION - two free rerolls. A coin nobody paid for.',
    'itemHumours': 'FOUR HUMOURS - every element in turn. A quartered round.',
    'itemGraft': 'GRAFT - permanent max health. A heart with a patch on it.',
    'itemMartyr': 'MARTYR - you are the bomb. A figure inside the blast.',
    'itemMeteor': 'FALLING SKY - rocks, plural, still falling.',
    'itemLodestar': 'LODESTAR - the floor comes to you. Orbs into a star.',
    'itemHoming': 'BIRD DOG - the shot arrives. A curve into a target.',
    'itemBlink': 'COLD SPOT - out here, in over there, nothing between.',
    'itemStone': 'BLOOD FROM STONE - money heals. A drop out of a fracture.',
    'itemBomb': 'SHORT FUSE - three seconds. The fuse is the whole icon.',
    'itemMine': 'WELCOME MAT - a plate with prongs, waiting for a foot.',
    'itemWall': 'FIREBREAK - fire standing in a line, stopping rounds.',
    'itemTurret': 'LITTLE BROTHER - a tripod with one barrel and an eye.',
    'itemSwarm': 'APIARY - five bees leaving one cell.',
    'itemHole': 'EVENT HORIZON - a hole. The darkest centre in the set.',
    'itemBoot': 'BOOTSTRAP - straight up. A boot on a flame.',
    'itemCharge': 'BONESAW - a serrated wedge through what it went through.',
    'itemLance': 'LANCE - thirty rounds as one. The biggest object in the set.',
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
