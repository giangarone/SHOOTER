# 100 NEW MUTATIONS PLAN
## VOID ARENA - Creative Mutation Expansion

Based on analysis of `js/upgrades.js`, `js/player.js`, `js/enemy.js`, `js/status.js`, and `js/main.js`.

---

## DESIGN PRINCIPLES (from codebase)
- **Single-tier mutations** (max: 1) change "what happens" - readable from one shot
- **Stacking upgrades** (max: 2-5) modify stats absolutely via `apply(mods, n)`
- **Visual language**: Gun marks (colored gems), enemy body tints (STATUS_TINT), particle drips (STATUS_FX)
- **Color = mechanic family**: Poison=green, Fire=orange, Ice=blue, Fear=purple, Stone=gray, Electric=yellow
- **Tradeoffs**: Benefit + Drawback on same card (GOOD/BAD/NEUTRAL)
- **mark: true** for bullet-behavior changes (status, chain, blast, multi-shot)
- **Devil deals**: Cost max HP, `devil: true`, flat rarity weight, `cost` field

---

## NEW MECHANICS TO INTRODUCE

### 1. **Resonance** - Hitting statused enemies triggers bonus effects
### 2. **Overcharge** - Holding fire builds charge; release for empowered shot
### 3. **Corruption** - Permanent debuffs on player for massive power
### 4. **Echo** - Shots leave temporal echoes that fire again
### 5. **Terrain Interaction** - Shots create/alter floor hazards
### 6. **Reflection** - Projectiles bounce off walls/enemies/shields
### 7. **Absorption** - Convert incoming damage/types into resources
### 8. **Combo Chains** - Consecutive hits on same target escalate
### 9. **Sacrifice** - Spend health/ammo/reserves for burst effects
### 10. **Parasitism** - Enemies become allies/minions temporarily
### 11. **Time Dilation** - Local slow/stop fields on hit/kill
### 12. **Fragmentation** - Shots split into seeking fragments
### 13. **Conduit** - Link enemies; damage spreads across links
### 14. **Anomaly** - Random mutator per wave/encounter
### 15. **Vampiric Link** - Tether to enemy; heal while damaging

---

## CATEGORY 1: NEW ELEMENTAL / STATUS MUTATIONS (15)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 1 | `irradiate` | **IRRADIATE** | rare | 0x9c27b0 (purple) | ✓ | HITS RADIATE: 15 DPS 4s<br>RADIATION SPREADS 3m | **Radiation** - new status: deals DPS, spreads to nearby enemies on death, reduces their damage by 20% |
| 2 | `corrode` | **CORRODE** | rare | 0x795548 (brown) | ✓ | HITS CORRODE: -15% ARMOR 5s<br>STACKS TO -60% | **Armor Shred** - reduces enemy `armor`/`armorDefault` multiplier; visual: rust particles |
| 3 | `void_touch` | **VOID TOUCH** | rare | 0x311b92 (deep purple) | ✓ | HITS VOID: 10% MAX HP<br>AS TRUE DAMAGE | **True Damage** - bypasses all armor/resistance; void tint (purple-black) |
| 4 | `frostbite` | **FROSTBITE** | rare | 0x00bcd4 (cyan) | ✓ | FROZEN ENEMIES: SHATTER ON HIT<br>+200% DMG, EXPLODE 3m | **Shatter** - frozen enemies take 3x damage and explode on death (synergy with Cryo/Crystallize) |
| 5 | `scorch` | **SCORCH** | rare | 0xff3d00 (deep orange) | ✓ | BURNING ENEMIES: IGNITE ALLIES<br>+50% BURN DPS, 5m RADIUS | **Wildfire** - burning enemies radiate heat, increasing burn DPS of nearby burning enemies |
| 6 | `neuro_link` | **NEURO LINK** | rare | 0x673ab7 (purple) | ✓ | POISONED ENEMIES SHARE DMG<br>25% OF DMG TO ONE → ALL | **Hivemind** - poisoned enemies linked; damage to one splits to all linked |
| 7 | `petrify_true` | **TRUE PETRIFY** | cursed | 0x607d8b (blue-gray) | ✓ | 8% TO TURN TO STONE 3s<br>STONE: IMMOBILE, -50% DMG TAKEN | **Stone** status - existing but expanded: enemy becomes statue, blocks projectiles, shatters on heavy hit |
| 8 | `entropic_decay` | **ENTROPIC DECAY** | cursed | 0x4a148c (dark purple) | ✓ | STATUS EFFECTS NEVER END<br>ON ENEMIES UNDER 20% HP<br>PLAYER: -1 HP/s PER ACTIVE STATUS | **Entropy** enhancement - player pays health for eternal enemy statuses |
| 9 | `cryo_chain` | **CRYO CHAIN** | rare | 0x4fc3f7 (pale blue) | ✓ | FROZEN ENEMIES CHAIN FREEZE<br>TO 2 NEARBY, 1.5s EACH | **Freeze Chain** - frozen enemies spread freeze on hit/death |
| 10 | `ashen_wake` | **ASHEN WAKE** | rare | 0xff6f00 (amber) | ✓ | BURNING DEATH: LEAVE EMBER<br>EMBERS SEEK ENEMIES 8m | **Seeking Embers** - burning corpses launch homing embers (new projectile type) |
| 11 | `venom_sac` | **VENOM SAC** | rare | 0x43a047 (green) | ✓ | POISON KILLS: EXPLODE GAS<br>6 DPS 5s IN 4m | **Gas Cloud** - poison kills leave lingering hazard zone |
| 12 | `terror_aura` | **TERROR AURA** | rare | 0x7b1fa2 (purple) | ✓ | FEARED ENEMIES: 20% CHANCE<br>TO FLEE ON HIT, 1s | **Panic** - feared enemies can panic on any hit, not just Terror application |
| 13 | `storm_front` | **STORM FRONT** | rare | 0x29b6f6 (light blue) | ✓ | SHOCKED ENEMIES: ARC LIGHTNING<br>TO 3 TARGETS, 35% DMG | **Storm** status - electric arc chains (distinct from Arc Rounds) |
| 14 | `gravity_well_shot` | **GRAVITY WELL SHOT** | rare | 0x5c6bc0 (indigo) | ✓ | HITS CREATE 2s WELL 3m<br>PULLS ENEMIES 2m/s | **Micro Gravity** - bullet impact creates temporary gravity well |
| 15 | `radiant` | **RADIANT** | devil | 0xffd600 (gold) | ✓ | HITS BLIND 1.5s<br>BLIND: -60% ACCURACY, NO ATTACK | **Blind** - new player/enemy status: reduced accuracy, enemies wander randomly |

---

## CATEGORY 2: BULLET BEHAVIOR MUTATIONS (15)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 16 | `ricochet` | **RICOCHET** | rare | 0xffeb3b (yellow) | ✓ | SHOTS BOUNCE 2x OFF WALLS<br>+25% DMG PER BOUNCE | **Wall Bounce** - projectiles reflect off arena walls, gain damage per bounce |
| 17 | `split_shot` | **SPLIT SHOT** | rare | 0x4caf50 (green) | ✓ | ON KILL: SHOT SPLITS TO 3<br>SEEKING FRAGMENTS, 40% DMG | **Fragmentation** - killing shot splits into homing fragments |
| 18 | `phase_round` | **PHASE ROUND** | rare | 0x9c27b0 (purple) | ✓ | SHOTS PHASE THROUGH 1 ENEMY<br>+50% DMG ON 2ND HIT | **Phasing** - pierce with damage ramp; visual: ghostly trail |
| 19 | `anchor_shot` | **ANCHOR SHOT** | rare | 0x795548 (brown) | ✓ | HITS TETHER ENEMIES 4m<br>TETHERED: -40% SPEED | **Tether** - enemies linked to impact point, slowed |
| 20 | `delayed_detonation` | **DELAYED DETONATION** | rare | 0xff5722 (deep orange) | ✓ | SHOTS LODGE, DETONATE 0.8s<br>60 DMG 3m, CAN STACK | **Lodged Explosives** - shots stick then explode; multiple stack |
| 21 | `homing_burst` | **HOMING BURST** | rare | 0xe91e63 (pink) | ✓ | RELOAD: FIRE 6 HOMING DARTS<br>15 DMG EACH, SEEK 10m | **Reload Burst variant** - homing darts on reload |
| 22 | `piercing_lance` | **PIERCING LANCE** | cursed | 0x607d8b (blue-gray) | ✓ | HOLD FIRE 1s: CHARGE LANCE<br>INFINITE PIERCE, 3x DMG | **Overcharge** - hold fire to charge penetrating beam |
| 23 | `echo_round` | **ECHO ROUND** | rare | 0x00bcd4 (cyan) | ✓ | SHOTS LEAVE ECHO 2s<br>ECHO FIRES AGAIN AT 50% | **Echo** - temporal echo fires duplicate shot after delay |
| 24 | `gravity_bolt` | **GRAVITY BOLT** | rare | 0x3f51b5 (indigo) | ✓ | SHOTS PULL ENEMIES TO IMPACT<br>4m RADIUS, 3m/s PULL | **Implosion** - reverse knockout, pulls enemies to impact point |
| 25 | `mirror_shot` | **MIRROR SHOT** | rare | 0xffffff (white) | ✓ | 20%: SHOT MIRRORS TO CLOSEST<br>ENEMY BEHIND YOU, 100% DMG | **Rear Coverage** - shots can duplicate backward |
| 26 | `void_bolt` | **VOID BOLT** | cursed | 0x1a237e (dark blue) | ✓ | SHOTS ERASE 1m PATH<br>ENEMIES IN PATH: 40 TRUE DMG | **Erasure** - beam deletes projectiles/enemies in line |
| 27 | `chain_lightning_shot` | **CHAIN LIGHTNING** | rare | 0xffd600 (gold) | ✓ | CRIT HITS: ARC TO 4 ENEMIES<br>80% → 60% → 40% → 20% | **Crit Chain** - critical hits chain lightning with falloff |
| 28 | `swarm_shot` | **SWARM SHOT** | rare | 0x8d6e63 (brown) | ✓ | SHOTS RELEASE 3 DRONES 4s<br>DRONES ATTACK NEAREST | **Drone Swarm** - shots spawn temporary autonomous drones |
| 29 | `prismatic_shot` | **PRISMATIC SHOT** | cursed | 0xe1bee7 (light purple) | ✓ | SHOTS CYCLE ELEMENTS<br>FIRE→ICE→SHOCK→POISON→VOID | **Element Cycle** - each shot applies next status in rotation |
| 30 | `singularity_shot` | **SINGULARITY SHOT** | devil | 0x311b92 (void) | ✓ | KILL: CREATE SINGULARITY 4s<br>PULLS ALL 5m/s, 6m RADIUS | **Singularity** - kill creates black hole pulling everything |

---

## CATEGORY 3: ENEMY INTERACTION / MANIPULATION (12)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 31 | `dominate` | **DOMINATE** | rare | 0x9c27b0 (purple) | ✓ | 12% ON HIT: ENEMY ALLIES 6s<br>ALLIED: FIGHTS FOR YOU | **Conversion** - charmed enemies fight for player, retain abilities |
| 32 | `bounty_hunter` | **BOUNTY HUNTER** | rare | 0xffd600 (gold) | - | MARKED TARGET: +50% DMG<br>KILL: +25 CREDITS, HEAL 5 HP | **Mark Target** - press key to mark enemy; bonus vs marked |
| 33 | `executioner_round` | **EXECUTIONER ROUND** | rare | 0xb71c1c (dark red) | ✓ | ENEMIES UNDER 30%: INSTAKILL<br>ON HIT, 3s COOLDOWN | **Execute** - low-HP enemies die instantly on hit |
| 34 | `anathema` | **ANATHEMA** | rare | 0x4a148c (dark purple) | ✓ | HITS MARK TARGET 8s<br>MARKED: TAKE +40% DMG FROM ALL | **Vulnerability Mark** - debuff amplifier for team/follow-up |
| 35 | `siphon` | **SIPHON** | rare | 0x00bcd4 (cyan) | ✓ | HITS STEAL 2% MAX HP<br>AS TEMP SHIELD, 5s DURATION | **Life Siphon** - convert damage to temporary overshield |
| 36 | `puppeteer` | **PUPPETEER** | cursed | 0x6a1b9a (purple) | ✓ | KILL: RAISE GHOST 10s<br>GHOST: 30% HP, YOUR DMG | **Necromancy** - killed enemies become temporary minions |
| 37 | `weakness_aura` | **WEAKNESS AURA** | rare | 0x78909c (blue-gray) | - | ENEMIES IN 8m: -25% DMG<br>YOU: -15% MOVE SPEED | **Aura** - passive radius debuff with self-slow |
| 38 | `taunt_round` | **TAUNT ROUND** | rare | 0xff5722 (deep orange) | ✓ | HITS TAUNT 3s<br>TAUNTED: TARGET ONLY YOU | **Taunt** - forces enemy aggro; synergy with tank builds |
| 39 | `expose` | **EXPOSE** | rare | 0xff9800 (orange) | ✓ | 1st HIT ON ENEMY: REVEAL WEAK<br>WEAK SPOT: +100% DMG, 4s | **Weak Spot** - first hit creates temporary weak point |
| 40 | `quarantine` | **QUARANTINE** | rare | 0x43a047 (green) | ✓ | STATUS ENEMIES: CANNOT SPREAD<br>STATUS TO OTHERS | **Containment** - prevents status spread (counters Conduit/Hivemind) |
| 41 | `harvest` | **HARVEST** | rare | 0x8bc34a (light green) | - | KILL: +1 MAX HP (CAP +50)<br>LOSE ALL ON HIT | **Harvest** - permanent HP gain per kill, lost on damage |
| 42 | `parasite` | **PARASITE** | cursed | 0x5d4037 (dark brown) | ✓ | HITS IMPLANT PARASITE 8s<br>PARASITE: 5 DPS, HEALS YOU | **Parasite** - DoT on enemy that heals player |

---

## CATEGORY 4: ECONOMY / RESOURCE MUTATIONS (10)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 43 | `investor` | **INVESTOR** | rare | 0xffd600 (gold) | - | CREDITS EARN 5% INTEREST/WAVE<br>COMPOUNDS, CAP 2x BASE | **Compound Interest** - passive credit growth per wave |
| 44 | `ammo_alchemist` | **AMMO ALCHEMIST** | rare | 0x00bcd4 (cyan) | - | 15%: AMMO PICKUP → HEALTH<br>15%: HEALTH PICKUP → AMMO | **Transmutation** - convert pickup types |
| 45 | `scrap_master` | **SCRAP MASTER** | common | 0x795548 (brown) | - | DESTROYED COVER: DROP SCRAP<br>SCRAP: 5 CREDITS OR 2 AMMO | **Environmental Economy** - breaking cover yields resources |
| 46 | `blood_bank` | **BLOOD BANK** | cursed | 0xb71c1c (dark red) | - | -20 MAX HP: +100 CREDITS/W<br>CAN REPEAT, MIN 40 HP | **Blood Tithe** - permanently sacrifice max HP for wave income |
| 47 | `munitions_expert` | **MUNITIONS EXPERT** | rare | 0xff9800 (orange) | - | RELOAD: 20% FREE AMMO<br>EMPTY MAG: +50% DMG NEXT MAG | **Ammo Efficiency** - free reloads, empty-mag bonus |
| 48 | `credit_sink` | **CREDIT SINK** | cursed | 0x9e9d24 (olive) | - | SPEND 500 CR: +10% ALL STATS<br>STACKS, RESETS ON PURCHASE | **Credit Dump** - convert credits to permanent stats |
| 49 | `lucky_find` | **LUCKY FIND** | rare | 0xffeb3b (yellow) | - | 5%: KILL DROPS RARE PICKUP<br>RARE: 50 CR, 30 HP, OR UPGRADE | **Rare Drops** - chance for premium pickup |
| 50 | `hoarder` | **HOARDER** | common | 0xf9a825 (amber) | - | +100% MAX AMMO RESERVE<br>AMMO PICKUPS: +50% VALUE | **Reserve Mastery** - bigger reserve, better pickups |
| 51 | `salvager` | **SALVAGER** | rare | 0x607d8b (blue-gray) | - | DESTROYED ENEMIES DROP PARTS<br>PARTS: CRAFT TEMP UPGRADES | **Crafting** - collect parts to build temporary mutations |
| 52 | `midas_greed` | **MIDAS GREED** | devil | 0xffd600 (gold) | - | ENEMIES TO GOLD ON KILL<br>GOLD ENEMIES: 5x CREDITS<br>YOU: TAKE +50% DMG | **Gold Touch** - Midas evolution: all kills gold, but fragile |

---

## CATEGORY 5: DEFENSIVE / SURVIVAL MUTATIONS (10)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 53 | `iron_skin` | **IRON SKIN** | rare | 0x90a4ae (blue-gray) | - | +50 MAX HP<br>IMMUNE TO KNOCKBACK | **Knockback Immunity** - stand firm against all forces |
| 54 | `phase_shift` | **PHASE SHIFT** | rare | 0xba68c8 (purple) | - | DODGE: BECOME INTANGIBLE 1s<br>PROJECTILES PASS THROUGH | **Intangibility** - dodge grants projectile immunity |
| 55 | `retaliation` | **RETALIATION** | rare | 0xff5252 (red) | - | ON HIT: COUNTERATTACK 120 DMG<br>TO ATTACKER, 8m RANGE | **Counter** - automatic strike back on hit |
| 56 | `fortress` | **FORTRESS** | cursed | 0x546e7a (dark blue-gray) | - | +100 MAX HP, -40% MOVE<br>RELOAD: DEPLOY SHIELD 4s | **Deployable Shield** - reload creates temporary cover |
| 57 | `adrenaline` | **ADRENALINE** | rare | 0xff1744 (red) | - | UNDER 30% HP: +60% SPD,<br>+40% FR, 3s INVULN ON HIT | **Adrenaline Rush** - low-HP power spike with brief invuln |
| 58 | `warding` | **WARDING** | rare | 0x4fc3f7 (pale blue) | - | EVERY 30s: AUTO-WARD 1 HIT<br>WARD: REFLECT PROJECTILE | **Auto-Ward** - periodic automatic Holy Mantle + reflect |
| 59 | `second_wind` | **SECOND WIND** | rare | 0x4caf50 (green) | - | ONCE/WAVE: 0 HP → 30% HP<br>+3s INVULN, CLEAR STATUS | **Last Stand** - once per wave, cheat death |
| 60 | `bulwark_aura` | **BULWARK AURA** | rare | 0x4ef3ff (cyan) | - | ALLIES IN 6m: +20% DR<br>YOU: +10% DR PER ALLY | **Shared Defense** - group damage reduction |
| 61 | `evasion_master` | **EVASION MASTER** | rare | 0x18ffff (cyan) | - | DODGE: TELEPORT 4m BACK<br>+100% DMG NEXT SHOT | **Blink Dodge** - dodge becomes combat teleport |
| 62 | `pain_conduit` | **PAIN CONDUIT** | cursed | 0x880e4f (dark pink) | - | TAKE DMG: STORE 50%<br>NEXT SHOT: RELEASE STORED | **Pain Storage** - absorb damage, unleash on next shot |

---

## CATEGORY 6: OFFENSIVE / DAMAGE MUTATIONS (12)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 63 | `overkill` | **OVERKILL** | rare | 0xff1744 (red) | - | EXCESS DMG CARRIES TO NEXT<br>ENEMY IN 5m, 50% EFFICIENCY | **Damage Carryover** - overkill damage chains to nearby enemy |
| 64 | `combo_striker` | **COMBO STRIKER** | rare | 0xff6d00 (deep orange) | - | SAME TARGET: +10% DMG/HIT<br>CAP +100%, RESET ON SWITCH | **Combo Chain** - focus fire on single target ramps damage |
| 65 | `critical_mass` | **CRITICAL MASS** | rare | 0xffd600 (gold) | - | CRIT CHANCE: 5% + 1%/KILL<br>CRIT: 2.5x, RESET ON CRIT | **Ramping Crits** - crit chance builds, resets on crit |
| 66 | `demolitionist` | **DEMOLITIONIST** | rare | 0xff3d00 (deep orange) | ✓ | EXPLOSIONS: +50% RADIUS,<br>+30% DMG, IGNORE COVER | **Explosion Mastery** - buffs all blast/corpse/ashen explosions |
| 67 | `precision_strike` | **PRECISION STRIKE** | rare | 0x00e676 (green) | - | HEADSHOTS: +100% DMG,<br>RETURN 1 AMMO, 0.5s CD | **Headhunter** - precision rewarded with ammo sustain |
| 68 | `rampage` | **RAMPAGE** | cursed | 0xb71c1c (dark red) | - | KILL: +5% DMG, +3% FR<br>STACKS TO +100%, RESET ON HIT | **Rampage** - Carnage-like but for damage+fire rate |
| 69 | `focus_fire` | **FOCUS FIRE** | rare | 0x2979ff (blue) | - | STAND STILL 2s: +80% DMG<br>MOVING: -30% DMG | **Sniper Stance** - extreme reward for stillness |
| 70 | `shredder` | **SHREDDER** | rare | 0x795548 (brown) | ✓ | HITS REDUCE ENEMY ARMOR<br>-10% PER HIT, STACKS TO -80% | **Armor Shred** - progressive armor reduction per hit |
| 71 | `volley_fire` | **VOLLEY FIRE** | rare | 0x3f51b5 (indigo) | ✓ | EVERY 3rd SHOT: 3-ROUND BURST<br>BURST: 150% DMG, 0 SPREAD | **Burst Pattern** - rhythmic burst shot |
| 72 | `annihilation` | **ANNIHILATION** | devil | 0x1a1a2e (near black) | ✓ | KILL: NEXT SHOT 500% DMG<br>PIERCES ALL, SEEKS BOSS | **Annihilation** - kill charges a single god-shot |
| 73 | `blood_ritual` | **BLOOD RITUAL** | cursed | 0x880e4f (dark pink) | - | -5 HP/SHOT: +200% DMG<br>CANNOT DROP BELOW 1 HP | **Blood Magic** - Cursed Ammo evolution: guaranteed double damage for HP |
| 74 | `elemental_mastery` | **ELEMENTAL MASTERY** | rare | 0xab47bc (purple) | - | STATUS DMG: +100%<br>APPLYING STATUS: +1 STACK | **Status Amplifier** - doubles all DoT, easier application |

---

## CATEGORY 7: MOVEMENT / POSITIONING MUTATIONS (8)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 75 | `blink` | **BLINK** | rare | 0x7c4dff (purple) | - | RELOAD: TELEPORT 8m<br>TO CROSSHAIR, 15s CD | **Combat Blink** - reload becomes reposition tool |
| 76 | `gravity_boots` | **GRAVITY BOOTS** | rare | 0x5c6bc0 (indigo) | - | WALK ON WALLS/CEILING<br>JUMP: FALL UP 10m | **Surface Walking** - defy gravity, fight in 3D |
| 77 | `shadow_step` | **SHADOW STEP** | rare | 0x311b92 (void) | - | KILL: TELEPORT TO CORPSE<br>+3s STEALTH, ENEMIES IGNORE | **Shadow Walk** - kill teleport with stealth |
| 78 | `wind_walker` | **WIND WALKER** | rare | 0x81d4fa (light blue) | - | SPRINT: LEAVE WIND TRAIL 4s<br>TRAIL: +40% SPD TO ALLIES | **Speed Trail** - sprint leaves speed-boosting path |
| 79 | `anchor` | **ANCHOR** | rare | 0x795548 (brown) | - | CROUCH: IMMOVABLE, +100% DMG<br>CANNOT MOVE UNTIL UNCROUCH | **Entrench** - stationary fortress mode |
| 80 | `phase_dash` | **PHASE DASH** | rare | 0xba68c8 (purple) | - | DASH: PHASE THROUGH ENEMIES<br>DEAL 30 DMG TO PASSED | **Phase Dash** - dash damages and passes through |
| 81 | `graviton` | **GRAVITON** | devil | 0x311b92 (void) | - | HOLD JUMP: FLOAT, PULL ENEMIES<br>RELEASE: SLAM 100 DMG 5m | **Gravity Control** - float, pull, slam |
| 82 | `time_walker` | **TIME WALKER** | cursed | 0xe1bee7 (light purple) | - | DASH: REWIND 2s POSITION<br>HEALTH/AMMO/STACKS RESTORED | **Time Rewind** - dash rewinds personal timeline |

---

## CATEGORY 8: WEAPON / RELOAD MUTATIONS (8)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 83 | `auto_loader` | **AUTO LOADER** | common | 0xffb300 (amber) | - | EMPTY MAG: AUTO RELOAD<br>+25% RELOAD SPEED | **Auto Reload** - never manually reload |
| 84 | `tactical_reload` | **TACTICAL RELOAD** | rare | 0x4caf50 (green) | - | RELOAD EARLY: RETAIN AMMO<br>+1 MAG NEXT RELOAD | **Tactical Reload** - reward for reloading before empty |
| 85 | `magazine_surge` | **MAGAZINE SURGE** | rare | 0xff9800 (orange) | - | FINAL 5 ROUNDS: +60% DMG<br>+40% FIRE RATE | **Final Stand** - last bullets hit harder and faster |
| 86 | `infinite_chamber` | **INFINITE CHAMBER** | cursed | 0x6a1b9a (purple) | - | NO RELOAD, -50% MAG SIZE<br>SHOTS CONSUME RESERVE DIRECTLY | **Chamber Feed** - belt feed extreme: no mag, direct reserve |
| 87 | `dual_wield` | **DUAL WIELD** | devil | 0xff1744 (red) | ✓ | SECOND GUN: 60% DMG EACH<br>2x AMMO CONSUMPTION | **Akimbio** - second gun model, split stats |
| 88 | `overcharged_chamber` | **OVERCHARGED CHAMBER** | rare | 0xffd600 (gold) | - | FIRST SHOT AFTER RELOAD: 3x DMG<br>PIERCES, EXPLODES 4m | **Breach Round++** - supercharged first shot |
| 89 | `ammo_synthesizer` | **AMMO SYNTHESIZER** | rare | 0x00bcd4 (cyan) | - | KILL: 15% REGEN 1 MAG<br>OVERCAP → TEMP MAG +50% | **Mag Regen** - kills can refill magazine beyond capacity |
| 90 | `charging_handle` | **CHARGING HANDLE** | rare | 0x795548 (brown) | - | HOLD RELOAD: CHARGE SHOTS<br>+25% DMG/0.5s, MAX 3x | **Charge Reload** - hold reload to empower next shots |

---

## CATEGORY 9: RISK / REWARD (CURSED) MUTATIONS (8)

| # | ID | Name | Rarity | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|-------|------|---------|---------------|
| 91 | `glass_heart` | **GLASS HEART** | cursed | 0xcfe8ff (pale blue) | - | +150% DMG, +100% FR<br>MAX HP = 1, NO REGEN | **One HP God** - extreme offense, single hit death |
| 92 | `reckless` | **RECKLESS** | cursed | 0xff1744 (red) | - | MOVING: +80% DMG<br>STANDING: -50% DMG, TAKE 2x | **Motion Required** - must move to deal damage |
| 93 | `blood_price` | **BLOOD PRICE** | cursed | 0x880e4f (dark pink) | - | SHOTS COST 2 HP, 3x DMG<br>KILL REFUNDS 5 HP | **Health Spender** - every shot costs health, kills refund |
| 94 | `unstable` | **UNSTABLE** | cursed | 0xff5722 (deep orange) | ✓ | 10%: SHOT EXPLODES 5m 80 DMG<br>10%: SHOT DUD, 0 DMG | **Volatile Ammo** - extreme variance per shot |
| 95 | `corrupted` | **CORRUPTED** | cursed | 0x4a148c (dark purple) | - | GAIN 3 RANDOM MUTATIONS<br>TAKE +100% DMG, -50% HEAL | **Corruption** - free mutations for fragility |
| 96 | `void_pact` | **VOID PACT** | cursed | 0x1a237e (dark blue) | - | NO STATUS EFFECTS ON YOU<br>ENEMIES: STATUS NEVER END | **Void Immunity** - player immune, enemies eternal status |
| 97 | `martyr` | **MARTYR** | cursed | 0xb71c1c (dark red) | - | ON DEATH: NUKE 15m 500 DMG<br>REVIVE 1 HP, 60s CD | **Martyrdom** - death explosion with revive |
| 98 | `chaos_chamber` | **CHAOS CHAMBER** | cursed | 0x9c27b0 (purple) | ✓ | EACH SHOT: RANDOM EFFECT<br>FROM ALL MUTATIONS IN POOL | **Chaos** - every shot rolls random mutation effect |

---

## CATEGORY 10: DEVIL DEALS (10)

| # | ID | Name | Rarity | Cost | Theme | Mark | Effects | New Mechanics |
|---|-----|------|--------|------|-------|------|---------|---------------|
| 99 | `soul_harvest` | **SOUL HARVEST** | devil | 30 | 0x4a148c | ✓ | KILLS: +2% DMG, +1% FR<br>STACKS TO +200%, LOST ON HIT | **Soul Stacks** - Carnage++ with fire rate |
| 100 | `pact_of_ashes` | **PACT OF ASHES** | devil | 25 | 0xd84315 | ✓ | RELOAD: ASH CLOUD 5m 30 DPS<br>YOU: IMMUNE TO FIRE/ASH | **Ash Walker** - reload creates safe fire zone |
| 101 | `void_walker` | **VOID WALKER** | devil | 40 | 0x1a237e | - | DASH: TELEPORT 15m<br>LEAVE VOID RIFT 4s: 40 DPS | **Void Rift** - dash creates damaging zone |
| 102 | `blood_sovereign` | **BLOOD SOVEREIGN** | devil | 50 | 0x880e4f | - | ENEMIES IN 10m: BLEED 10 DPS<br>YOU: HEAL 50% OF BLEED | **Blood Aura** - passive bleed aura with leech |
| 103 | `time_lord` | **TIME LORD** | devil | 35 | 0xe1bee7 | - | KILL: FREEZE TIME 0.5s<br>YOU MOVE, ENEMIES FROZEN | **Time Stop** - kill freezes everything but player |
| 104 | `necromancer` | **NECROMANCER** | devil | 30 | 0x4a148c | ✓ | KILLS RAISE SKELETONS (MAX 5)<br>SKELETONS: 30% HP, YOUR DMG | **Minion Master** - permanent skeleton army |
| 105 | `storm_herald` | **STORM HERALD** | devil | 20 | 0x29b6f6 | ✓ | SHOTS: 15% CALL LIGHTNING<br>LIGHTNING: 120 DMG 6m CHAIN | **Storm Calling** - Lightning Wizard++ |
| 106 | `reality_breaker` | **REALITY BREAKER** | devil | 60 | 0x311b92 | ✓ | SHOTS IGNORE ARMOR/WALLS<br>PIERCE INFINITE, +50% DMG | **Absolute Pierce** - true ignoring of all barriers |
| 107 | `entropy_avatar` | **ENTROPY AVATAR** | devil | 45 | 0x4a148c | - | STATUS ON YOU: REFLECT TO ALL<br>ENEMIES IN 15m, 2x DURATION | **Status Mirror** - player statuses become enemy auras |
| 108 | `final_stand` | **FINAL STAND** | devil | 20 | 0xb71c1c | - | UNDER 10% HP: INVULNERABLE<br>+300% DMG, UNLIMITED AMMO | **Desperation** - near-death god mode |

---

## IMPLEMENTATION NOTES

### New Status Effects Needed (add to `js/enemy.js` STATUS_TINT/STATUS_FX, `js/status.js`):
1. **Radiation** (purple) - DPS + spread + damage reduction
2. **Corrosion** (brown) - armor shred stacking
3. **Void** (dark purple) - true damage, no resistance
4. **Stone** (gray) - immobile, damage reduction, shatterable
5. **Blind** (white) - accuracy loss, random movement
6. **Storm/Electric** (yellow) - chain lightning
7. **Tether** (brown) - movement restriction to point
8. **Parasite** (dark brown) - DoT that heals attacker

### New Player Status Effects (add to `js/status.js`):
1. **Intangible** - projectiles pass through
2. **Stealth** - enemies ignore
3. **Time Stop** - local time dilation

### New Mod Fields (add to `DEFAULT_MODS` in `js/player.js`):
- `radiationDps`, `radiationTime`, `radiationSpread`
- `corrosionStacks`, `corrosionMax`
- `voidDamage`, `trueDamage`
- `shatterDamage`, `shatterBonus`
- `wildfireRadius`, `wildfireBonus`
- `hivemindShare`
- `stoneChance`, `stoneTime`
- `blindChance`, `blindTime`
- `stormChance`, `stormChains`, `stormFalloff`
- `gravityWellChance`, `gravityWellRadius`, `gravityWellPull`
- `dominateChance`, `dominateTime`
- `markTargetDamage`, `markTargetHeal`
- `executeThreshold`, `executeCooldown`
- `anathemaDamage`, `anathemaTime`
- `siphonPercent`, `siphonShieldTime`
- `necromancyChance`, `necromancyTime`, `necromancyPower`
- `weaknessAuraRadius`, `weaknessAuraPower`, `weaknessAuraSelfSlow`
- `tauntChance`, `tauntTime`
- `exposeChance`, `exposeBonus`, `exposeTime`
- `quarantineRadius`
- `harvestHpPerKill`, `harvestCap`
- `parasiteDps`, `parasiteTime`, `parasiteHeal`
- `interestRate`, `interestCap`
- `transmuteChance`
- `scrapChance`, `scrapValue`
- `bloodTitheHp`, `bloodTitheCredits`
- `freeReloadChance`, `emptyMagBonus`
- `creditSinkCost`, `creditSinkBonus`
- `rareDropChance`
- `reserveMult`, `pickupMult`
- `craftParts`, `craftOptions`
- `midasGreed`, `midasGreedDamageTaken`
- `knockbackImmune`
- `intangibleOnDodge`, `intangibleTime`
- `counterDamage`, `counterRange`
- `fortressHp`, `fortressSpeedPenalty`, `fortressShieldTime`
- `adrenalineThreshold`, `adrenalineSpeed`, `adrenalineFR`, `adrenalineInvuln`
- `autoWardInterval`, `autoWardReflect`
- `secondWindPerWave`, `secondWindHeal`, `secondWindInvuln`, `secondWindClearStatus`
- `bulwarkAuraRadius`, `bulwarkAuraAllyDR`, `bulwarkAuraSelfDRPerAlly`
- `blinkDodgeDistance`, `blinkDodgeDamageBonus`
- `painConduitStore`, `painConduitRelease`
- `overkillCarry`, `overkillEfficiency`, `overkillRange`
- `comboStrikerStep`, `comboStrikerCap`
- `critMassBase`, `critMassPerKill`, `critMassMult`, `critMassReset`
- `demolitionRadius`, `demolitionDamage`, `demolitionIgnoreCover`
- `headshotBonus`, `headshotAmmo`, `headshotCd`
- `rampageStep`, `rampageCap`
- `focusFireStillTime`, `focusFireBonus`, `focusFireMovePenalty`
- `shredPerHit`, `shredMax`
- `volleyCount`, `volleyBurst`, `volleyDamage`, `volleySpread`
- `annihilationCharge`, `annihilationDamage`, `annihilationPierce`, `annihilationSeek`
- `bloodRitualCost`, `bloodRitualDamage`
- `elementalMasteryDot`, `elementalMasteryStacks`
- `blinkTeleport`, `blinkCd`
- `gravityBoots`
- `shadowStepTeleport`, `shadowStepStealth`
- `windTrailTime`, `windTrailSpeed`
- `anchorDamage`, `anchorImmobile`
- `phaseDashDamage`
- `gravitonFloat`, `gravitonPull`, `gravitonSlamDamage`, `gravitonSlamRadius`
- `timeRewindTime`, `timeRewindRestore`
- `autoReload`, `autoReloadSpeed`
- `tacticalReloadRetain`, `tacticalReloadBonus`
- `finalRoundsThreshold`, `finalRoundsDamage`, `finalRoundsFR`
- `infiniteChamber`, `infiniteChamberMagPenalty`
- `dualWield`, `dualWieldDamage`, `dualWieldAmmo`
- `overchargedFirstShot`, `overchargedPierce`, `overchargedExplode`
- `magRegenChance`, `magRegenAmount`, `magRegenOvercap`
- `chargeReloadRate`, `chargeReloadMax`
- `glassHeartDamage`, `glassHeartFR`, `glassHeartHp`
- `recklessMoveBonus`, `recklessStandPenalty`, `recklessStandDamageTaken`
- `bloodPriceCost`, `bloodPriceDamage`, `bloodPriceRefund`
- `unstableExplodeChance`, `unstableExplodeDamage`, `unstableExplodeRadius`, `unstableDudChance`
- `corruptedMutations`, `corruptedDamageTaken`, `corruptedHealPenalty`
- `voidPactPlayerImmune`, `voidPactEnemyEternal`
- `martyrExplodeDamage`, `martyrExplodeRadius`, `martyrReviveHp`, `martyrCd`
- `chaosChamber`

### Devil Deal Mod Fields:
- `soulHarvestStep`, `soulHarvestFRStep`, `soulHarvestMax`
- `pactOfAshesRadius`, `pactOfAshesDps`, `pactOfAshesFireImmune`
- `voidWalkerTeleport`, `voidWalkerRiftDps`, `voidWalkerRiftTime`
- `bloodSovereignRadius`, `bloodSovereignDps`, `bloodSovereignLeech`
- `timeLordFreezeTime`
- `necromancerMax`, `necromancerPower`
- `stormHeraldChance`, `stormHeraldDamage`, `stormHeraldChains`
- `realityBreakerPierce`, `realityBreakerDamage`
- `entropyAvatarReflect`, `entropyAvatarRadius`, `entropyAvatarMult`
- `finalStandThreshold`, `finalStandDamage`, `finalStandAmmo`

### Required Hooks in `js/main.js`:
- Radiation spread on enemy death
- Corrosion armor reduction application
- True damage bypass
- Shatter on frozen enemy hit
- Wildfire aura on burning enemies
- Hivemind damage sharing
- Stone status application/behavior
- Blind status on enemies
- Storm chain lightning
- Gravity well creation
- Singularity on kill
- Dominate/conversion AI
- Mark target system
- Execute threshold check
- Anathema vulnerability
- Siphon shield grant
- Necromancy minion spawn
- Weakness aura application
- Taunt aggro override
- Expose weak spot creation
- Quarantine status spread block
- Harvest HP gain/loss
- Parasite implant/heal
- Interest calculation per wave
- Transmutation pickup conversion
- Scrap drop on cover destruction
- Blood tithe wave income
- Tactical reload detection
- Final rounds detection
- Infinite chamber reserve feed
- Dual wield model/rendering
- Overcharged shot charge
- Magazine regen on kill
- Charge reload hold detection
- Overkill carryover
- Combo striker target tracking
- Crit mass ramping
- Demolition explosion buff
- Headshot detection
- Rampage stack management
- Focus fire stillness detection
- Shred armor reduction
- Volley pattern counting
- Annihilation charge/shot
- Blood ritual HP cost
- Elemental mastery DoT boost
- Blink teleport on reload
- Gravity boots movement mode
- Shadow step teleport/stealth
- Wind trail creation
- Anchor entrench
- Phase dash passthrough
- Graviton float/pull/slam
- Time rewind state capture/restore
- Chaos chamber random effect

### Visual Assets Needed (in `tools/pixelart/icons.py`):
- 100 new icon drawings keyed by mutation ID
- New status tint colors for Radiation, Corrosion, Void, Stone, Blind, Storm, Tether, Parasite
- New particle FX configs for each new status
- Gun mark colors for marked mutations (THEME values)

---

## BALANCING CONSIDERATIONS

1. **Rarity Distribution**: Keep ~40% common, ~35% rare, ~15% cursed, ~10% devil
2. **Mark Budget**: Max 20 gun marks - currently ~35 marked mutations. New marks should be selective.
3. **Synergy Clusters**: Design mutations that combo (e.g., Cryo + Frostbite + Crystallize + Cryo Chain)
4. **Counter-play**: Every strong effect needs a readable tell and counter (e.g., Blind has visual indicator, Quarantine counters spread)
5. **Devil Deal Costs**: Price in max HP should reflect power level (20-60 range)
6. **Stacking vs Mutation**: Stacking = stat modifiers; Mutation = behavior changers
7. **Wave Gating**: Rare unlocks wave 2, Cursed wave 3, Devil boss waves only

---

## PRIORITY IMPLEMENTATION ORDER

**Phase 1** (Core mechanics, high impact): 1-15 (New Status), 16-20 (Bullet), 31-35 (Enemy), 53-57 (Defensive), 63-67 (Offensive)
**Phase 2** (Build-around mechanics): 21-30 (Bullet), 36-42 (Enemy), 43-52 (Economy), 58-62 (Defensive), 68-74 (Offensive)
**Phase 3** (Movement/Weapon): 75-82 (Movement), 83-90 (Weapon)
**Phase 4** (High risk/reward): 91-98 (Cursed), 99-108 (Devil)

---

## TESTING CHECKLIST PER MUTATION

- [ ] `apply()` sets absolute values from `n` (not incremental)
- [ ] `effects` function shows tiered readout correctly
- [ ] Icon drawn in `tools/pixelart/icons.py` under same key
- [ ] `mark: true` mutations add gun gem correctly
- [ ] Status effects have `STATUS_TINT`, `STATUS_FX`, `STATUS_ORDER` entries
- [ ] Player status effects in `js/status.js` if applicable
- [ ] `DEFAULT_MODS` has all new fields with defaults
- [ ] Hooks in `main.js` for event reactions (onHit, onKill, onReload, onDash, etc.)
- [ ] Visual feedback readable at distance (tint, particles, projectiles)
- [ ] Devil deals checked by `canPay()` and `payMaxHp()`
- [ ] No performance regression (particle limits, projectile caps)
- [ ] Multiplayer/Versus sync if applicable