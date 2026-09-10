# Working on VOID ARENA

Notes for an agent picking this repo up. The README is the design document —
what the game does and why. This file is the shorter question: how to change it
without breaking it.

## Run the suites that cover what you changed

```bash
npm run test:newpool        # one suite by name
node test/newpool.mjs       # same thing, works from any directory
node test/all.mjs newpool   # or by filter, through the runner
```

The question is COVERAGE, not a count. Ask which suites touch the thing you
changed and run all of them - that is often three or four, and for anything
that lands in the item pool or the enemy tables it is more. Two suites is not a
budget to stay under; an untested change that passes because nobody asserted on
it is the failure this is trying to prevent.

What that costs: a suite is one to six minutes on a runner, so half a dozen of
them is fifteen minutes inside a job that has hours. Running the RIGHT six is
cheap. What is not affordable is the whole set - see the prohibition below.

### Which suites cover what

Grep for the thing you touched if it is not here; these are the common ones.

| changed | run |
|---|---|
| a passive or active item, the pool, the box | `newpool` `active` `icons` |
| an upgrade's numbers | `newpool` `icons`, plus whatever it modifies |
| an enemy, or a theme's table | `themes` `icons`, that theme's own suite, `boss` |
| movement - sprint, crouch, slide, dash, jump | `crouch` `sprint` `pad` |
| the weapon, the cone, recoil, reload | `accuracy` `aim` `seeker` `headshot` |
| money, prices, payouts, the streak | `money` `charge` `flawless` `drops` |
| a boss, or its telegraphs | `boss` `drops` `charge` |
| the HUD, an overlay, a menu | `pad` `versus` `flawless` |
| `js/main.js` - the loop itself | whatever you changed, plus `smoke` |

**`icons` and `themes` cost a tenth of a second each.** If a change goes
anywhere near an offer, a drawing or an enemy table, run them - there is no
reason not to, and `icons` is the one that catches an item with no artwork,
which is a crash the first time it is rolled and twenty minutes into a run.

Some suites take an argument - `node test/boss.mjs ember,rime` pins the themes
under test instead of walking all ten, which is much faster when you only care
about one.

### The one thing not to do

**On a CI runner, DO NOT run `npm run test:all`.** Thirty-one suites against a
real headless browser, and a runner has no GPU - it rasterizes every frame in
software on a shared vCPU, so the set is about ninety minutes of work there
against twenty on a developer machine. CI affords it by splitting the suites
across four machines at once; an agent has one, and gets no benefit from the
same trick. An agent that runs it burns its whole job on tests and is cancelled
before it can commit. This has already happened: six hours, and a good fix lost
with the runner.

CI runs the full set on every push and pull request, sharded four ways, in
about thirty minutes. That is the gate, and it does not need your help.

If you genuinely need the whole set locally, it is `npm run test:all`, about
twenty minutes on a developer machine.

### If a suite is killed rather than failing

`TIMEOUT` in the summary means the suite passed its per-suite cap and was
killed - a hang, or just a very slow machine. It is not an assertion failure,
and re-running the suite on its own is the way to tell which. Do not raise
`TIMEOUT=` and re-run the whole set hoping it passes; that is how a twenty
minute job becomes a six hour one.

### What the suites are for

They are not unit tests. Each one drives a real headless browser against a real
server and asserts on game STATE several seconds apart, because that is the
only place this game's bugs live. A boss that never releases its telegraph
handles, a countdown that re-arms itself every frame, a homing shot that
ignores cover — none of those throw, none show up in a screenshot, and all of
them are a suite away from being obvious.

So: **when you add a mechanic, add the assertion that would fail if it broke.**
Put it in the suite that owns that area rather than starting a new file. The
headers in each suite explain what it is guarding and are worth reading before
you extend one.

### If a suite fails

Read what it printed. These suites report the actual numbers — `damage=34
arcs=1` — rather than just failing, so the failure usually names the cause. A
suite that TIMES OUT rather than failing is a different question - see above.

## The rig

`test/harness.mjs` owns the three things a test cannot assume, and every
browser suite imports from it:

- `ROOT` — the repo, resolved from `import.meta.url`. Never `process.cwd()`,
  and never an absolute path to somebody's machine. Suites must run from any
  directory.
- `CHROME` — `puppeteer-core` ships no browser. The harness takes `CHROME`,
  `CHROME_PATH` or `PUPPETEER_EXECUTABLE_PATH` if set, then probes the usual
  macOS, Linux and Windows locations, then throws naming every path it tried.
- `startServer(port)` — one spawn, absolute script, explicit cwd.

**Every suite owns a unique port.** They collide silently if not: the second
server fails to bind and that suite quietly tests the first one's game. If you
add a suite, take a port nothing else uses.

New suites are picked up by `test:all` automatically — it reads the directory.
There is no list to update.

## Laying out a change

- `js/main.js` is the loop, the waves and the run state. Most systems are
  reached from here.
- `js/enemies/` is one file per theme, ten of them, registered by `index.js`.
  `shared.js` holds what more than one theme needs — the geometry and material
  caches, the status tables, the steering helpers, and `ENEMY_TYPES` itself.
- The ten themes are interchangeable by design. `test/themes.mjs` holds the
  balance law: every role filled, no type in two themes, every stat block
  inside the envelope its role shares across all ten. Adding an enemy means
  satisfying that, not just making it fun.
- Anything on a rhythm hangs off `Music.pulse`, the half-beat edge — not a
  timer of its own.
- Pools are everywhere: projectiles, particles, decals, telegraph handles. If
  you take a handle, release it on every path out, including the one where the
  thing dies early. Several suites assert pools drain precisely because that
  path is easy to miss.
- `js/pixelicons.js` is GENERATED (see `tools/pixelart`). Every offer needs a
  drawing and every drawing an offer — `npm run test:icons` is the check, and
  it runs in milliseconds.

## House style

Match the file you are in. This codebase comments the WHY — what breaks
otherwise, what the alternative was, which bug the line exists to prevent — and
does not narrate the what. A comment explaining that a loop iterates is noise
here; a comment explaining that a suffix range means the LAST n bytes and not
the first is the reason `server.js` is correct.

Keep the README current when behavior changes. It is long, specific, and people
actually read it.
