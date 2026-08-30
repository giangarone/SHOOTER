// Local high-score table. Ten best runs, kept in localStorage.
//
// LOCAL ON PURPOSE. There is no server side to this: server.js is a static
// file server with nothing to persist to, and the game is client-side
// javascript, so any score posted to a shared board could be forged from the
// console in about ten seconds. A per-browser board is the honest version of
// the feature - it is a record of YOUR runs, and it cannot lie to anybody else.
//
// Everything here is defensive about what comes back out of storage. It is
// user-writable text: another tab, an extension, or a half-finished write can
// leave anything at all under this key, and a leaderboard is not worth taking
// the game down for. Every read goes through parse(), every write is wrapped,
// and a failure just means the board is empty this session.
//
// RANKING: score first, wave as the tiebreak. Score already folds in kills,
// combo multipliers and clear bonuses, so it is the closest thing the game has
// to a single measure of a run.

const KEY = 'va-scores';
export const MAX_ENTRIES = 10;
// Names are drawn into a fixed-width column and stored forever; long ones are
// simply cut rather than rejected, so the entry field can stay permissive.
const MAX_NAME = 12;

// score desc, then wave desc. Used for both insertion and display, so the
// board can never disagree with the qualification test.
function rank(a, b) {
  return b.score - a.score || b.wave - a.wave;
}

// One entry, or null if the stored value is not one. Anything shaped wrong is
// dropped rather than repaired: a half-valid row would sort unpredictably.
function clean(e) {
  if (!e || typeof e !== 'object') return null;
  const score = Number(e.score);
  const wave = Number(e.wave);
  if (!Number.isFinite(score) || !Number.isFinite(wave)) return null;
  return {
    name: typeof e.name === 'string' ? e.name.slice(0, MAX_NAME) : '',
    score: Math.max(0, Math.floor(score)),
    wave: Math.max(0, Math.floor(wave)),
    kills: Number.isFinite(Number(e.kills)) ? Math.max(0, Math.floor(Number(e.kills))) : 0,
    combo: Number.isFinite(Number(e.combo)) ? Math.max(0, Math.floor(Number(e.combo))) : 0,
    at: typeof e.at === 'string' ? e.at : '',
  };
}

export function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    // Private-mode Safari and blocked-cookie setups throw on access itself.
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(clean).filter(Boolean).sort(rank).slice(0, MAX_ENTRIES);
}

// True if a run with this score would make the table. A board with room in it
// always qualifies, which is what makes the first ten runs all count.
export function qualifies(score, wave) {
  if (score <= 0) return false;
  const list = load();
  if (list.length < MAX_ENTRIES) return true;
  const last = list[list.length - 1];
  return rank({ score, wave }, last) < 0;
}

// Inserts a run and returns { list, index } - index is where it landed, so the
// caller can highlight the new row, or -1 if it did not place.
export function add(entry) {
  const e = clean({ ...entry, at: new Date().toISOString().slice(0, 10) });
  if (!e) return { list: load(), index: -1 };
  const list = load();
  list.push(e);
  list.sort(rank);
  const trimmed = list.slice(0, MAX_ENTRIES);
  const index = trimmed.indexOf(e);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Quota or a blocked store. The board still shows this run for the rest of
    // the session; it just will not survive a reload.
  }
  return { list: trimmed, index };
}
