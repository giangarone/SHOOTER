// The pre-analysed beat grid for the soundtrack, and the lookup that turns a
// playback position into "where are we in the bar".
//
// WHY THIS EXISTS: beats used to be found live, from a spectral-flux spike in
// the bass bins. That works, but it is a detector - it can only fire AFTER the
// transient has happened, it fires on the wrong things during a busy passage,
// and its timing wanders by tens of milliseconds because the analyser only
// sees the signal in FFT-frame lumps. None of that is fixable live. Analysing
// the file once, offline, with the whole track visible at once, is: see
// tools/analyze_beats.py.
//
// THE FORMAT is not a list of beat times. Inside one song the beats are almost
// exactly periodic, so each segment ships the LINE through them - an anchor
// and a period - and the beat times are computed back out by arithmetic. That
// removes the detector's residual jitter (the fit is over hundreds of beats,
// so it averages the noise away), and it makes the whole three hours a few
// kilobytes of JSON instead of tens of thousands of floats. Segments where a
// line did not fit - crossovers, tempo ramps, sections with no steady pulse -
// carry their raw beat times instead and are marked `quantized: false`.
//
// Segments tile the timeline with no gaps, so any time inside the file lands
// in exactly one of them.

export class BeatMap {
  // Returns a BeatMap, or null if the file is missing or unusable. Never
  // throws: the game has to run without it, falling back to live detection.
  static async load(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = await res.json();
      if (!doc || !Array.isArray(doc.segments) || !doc.segments.length) return null;
      return new BeatMap(doc);
    } catch {
      return null;
    }
  }

  constructor(doc) {
    this.duration = doc.duration;
    // Added to every beat time. Covers a disagreement between the browser's
    // decoder and the one the analysis ran through about where sample zero of
    // the file is - AAC carries priming samples, and not every decoder drops
    // the same number of them. Measure it with Music.calibrate().
    this.offset = doc.offset || 0;
    this.segments = doc.segments;
    // Playback walks forward, so the segment we wanted last frame is almost
    // always the one we want now. The search below only runs on a seek, a
    // loop, or a segment boundary.
    this._seg = 0;
    this._raw = 0;
    // Reused so the per-frame lookup allocates nothing.
    this._out = { last: 0, next: 0, index: 0, bar: 0, downbeat: false, bpm: 0, exact: true };
  }

  _find(t) {
    let lo = 0, hi = this.segments.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (t < this.segments[mid].t1) hi = mid; else lo = mid + 1;
    }
    return lo;
  }

  // First and last beat a segment actually contains, used to carry the
  // envelope across a segment boundary rather than restarting it there.
  _first(s) {
    return s.quantized ? s.anchor : (s.beats.length ? s.beats[0] : s.t0);
  }

  _last(s) {
    if (!s.quantized) return s.beats.length ? s.beats[s.beats.length - 1] : s.t0;
    return s.anchor + Math.floor((s.t1 - s.anchor) / s.period) * s.period;
  }

  // Beat context at track position `t` (seconds into the file, before the
  // map's own offset is applied - this does that). Returns the SAME object
  // every call; read what you need before calling again.
  at(t) {
    t -= this.offset;
    const segs = this.segments;
    if (t < 0 || t >= this.duration) return null;

    let i = this._seg;
    if (i >= segs.length || t < segs[i].t0 || t >= segs[i].t1) i = this._seg = this._find(t);
    const s = segs[i];
    const o = this._out;

    if (s.quantized) {
      const n = Math.floor((t - s.anchor) / s.period);
      o.last = s.anchor + n * s.period;
      o.next = o.last + s.period;
      o.index = n;
      const bpb = s.beatsPerBar || 4;
      o.bar = ((n % bpb) + bpb) % bpb;
      o.downbeat = o.bar === s.barOffset;
      o.bpm = s.bpm;
      o.exact = true;
    } else {
      const b = s.beats;
      let j = this._raw;
      if (j >= b.length || b[j] > t || (j + 1 < b.length && b[j + 1] <= t)) {
        let lo = 0, hi = b.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (b[mid] <= t) lo = mid; else hi = mid - 1;
        }
        j = lo;
      }
      this._raw = j;
      o.last = b.length ? b[j] : s.t0;
      o.next = j + 1 < b.length ? b[j + 1] : s.t1;
      o.index = j;
      o.bar = 0;
      o.downbeat = false;
      o.bpm = b.length > 1 ? 60 / ((b[b.length - 1] - b[0]) / (b.length - 1)) : 0;
      o.exact = false;
    }

    // A beat can fall outside the segment at either end - the anchor is the
    // first grid point INSIDE it, so a moment before that belongs to the
    // previous segment's last beat. Reaching across keeps the gap between
    // consecutive beats honest at a boundary, which is what the envelope in
    // Music.sample() is measuring against.
    if (o.last < s.t0 && i > 0) o.last = this._last(segs[i - 1]);
    if (o.next > s.t1) {
      o.next = i + 1 < segs.length ? this._first(segs[i + 1])
        : this._first(segs[0]) + this.duration;   // the track loops
    }

    o.last += this.offset;
    o.next += this.offset;
    return o;
  }
}
