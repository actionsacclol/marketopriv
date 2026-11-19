// The measuring behind reference videos: cuts and pacing, look and colours,
// tempo. Plain math on small frames and mono samples, with no browser or Node
// APIs, so the renderer (src/render/refAnalyze.ts) and tests share it.
//
// It only measures. What a frame shows (the hook's wording, how captions look)
// is left to whoever looks at the pictures.

import type { RefProfile, RefShot } from './types';

/** Frames are fed at about this rate; more adds nothing for finding cuts. */
export const SAMPLE_FPS = 15;
/** Long side of the small frame the meter looks at. */
export const SAMPLE_SIDE = 64;

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const round = (x: number, d = 2): number => Math.round(x * 10 ** d) / 10 ** d;
const hex = (r: number, g: number, b: number): string => `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;

export interface VideoMeasure {
  shots: RefShot[];
  /** Where each cut is, seconds. */
  cuts: number[];
  sections: RefShot[];
  /** Where the picture changes a lot: every cut, plus new text or graphics coming in. */
  marks: number[];
  hookHold: number;
  medianShot: number;
  medianSection: number;
  changesPerSec: number;
  motion: number;
  look: RefProfile['look'];
  colors: RefProfile['colors'];
  accent: string | null;
}

/** How many samples back a frame is compared with to catch animated changes (~0.4 s). */
const GAP = 6;

/** Feed it small frames in order; it keeps a few numbers per frame, not the pixels. */
export class VideoMeter {
  private readonly n: number;
  private prevGray: Float32Array | null = null;
  private prevHist: Float32Array | null = null;
  /** The last few frames, to compare a frame with the one ~0.4 s before it. */
  private readonly recent: Float32Array[] = [];
  /** Brightness change from the frame GAP samples earlier, 0..1: an animated change adds up here even when no single frame jumps. */
  private readonly dg: number[] = [];
  private readonly ts: number[] = [];
  /** Brightness change from the frame before, 0..1. */
  private readonly dl: number[] = [];
  /** Colour-mix change from the frame before, 0..1. */
  private readonly dh: number[] = [];
  private readonly palette = new Float64Array(4096);
  private dark = 0;
  private light = 0;
  private pixels = 0;

  constructor(
    w: number,
    h: number,
    /** Bytes per pixel in the data passed to push (4 = RGBA, 3 = RGB). */
    private readonly channels: 3 | 4 = 4,
  ) {
    this.n = w * h;
  }

  push(t: number, data: ArrayLike<number>): void {
    const { n, channels } = this;
    const gray = new Float32Array(n);
    const hist = new Float32Array(64);
    for (let i = 0, p = 0; i < n; i++, p += channels) {
      const r = data[p];
      const g = data[p + 1];
      const b = data[p + 2];
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      gray[i] = y;
      hist[((r >> 6) << 4) | ((g >> 6) << 2) | (b >> 6)]++;
      this.palette[((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)]++;
      if (y < 64) this.dark++;
      else if (y > 178) this.light++;
    }
    this.pixels += n;
    let dl = 0;
    let dh = 0;
    if (this.prevGray && this.prevHist) {
      for (let i = 0; i < n; i++) dl += Math.abs(gray[i] - this.prevGray[i]);
      dl /= n * 255;
      for (let i = 0; i < 64; i++) dh += Math.abs(hist[i] - this.prevHist[i]);
      dh /= 2 * n;
    }
    let dg = 0;
    const far = this.recent[0];
    if (far) {
      for (let i = 0; i < n; i++) dg += Math.abs(gray[i] - far[i]);
      dg /= n * 255;
    }
    this.recent.push(gray);
    if (this.recent.length > GAP) this.recent.shift();
    this.ts.push(t);
    this.dl.push(dl);
    this.dh.push(dh);
    this.dg.push(dg);
    this.prevGray = gray;
    this.prevHist = hist;
  }

  finish(seconds: number): VideoMeasure {
    const { ts, dl, dh } = this;
    const count = ts.length;
    // How different each frame is from the one before: a cut changes the picture and its colour mix at once.
    const score = dl.map((d, i) => Math.max(dh[i], Math.min(1, d * 2.5)));
    const around = (xs: number[], i: number, r: number): number => {
      const near: number[] = [];
      for (let j = Math.max(1, i - r); j <= Math.min(count - 1, i + r); j++) if (j !== i) near.push(xs[j]);
      return median(near);
    };

    // A cut stands far above what is normal around it (so fast footage is not all "cuts").
    let found: Array<{ t: number; s: number }> = [];
    for (let i = 1; i < count; i++) {
      if (score[i] < 0.22) continue;
      if (score[i] < 3 * around(score, i, 7) + 0.05) continue;
      // The cut is somewhere between this frame and the one before.
      found.push({ t: (ts[i - 1] + ts[i]) / 2, s: score[i] });
    }
    // A dissolve or a flash shows up as two or three hits in a row: keep the strongest.
    const merged: Array<{ t: number; s: number }> = [];
    for (const c of found) {
      const last = merged[merged.length - 1];
      if (last && c.t - last.t < 0.4) {
        if (c.s > last.s) merged[merged.length - 1] = c;
      } else merged.push(c);
    }
    found = merged.filter((c) => c.t > 0.15 && c.t < seconds - 0.15);
    const cuts = found.map((c) => round(c.t));

    // Stretches between two times, and how much moves inside each.
    let moveSum = 0;
    let moveN = 0;
    const split = (at: number[], tally: boolean): RefShot[] => {
      const edges = [0, ...at, seconds];
      const out: RefShot[] = [];
      for (let k = 0; k < edges.length - 1; k++) {
        const a = edges[k];
        const b = edges[k + 1];
        let sum = 0;
        let nIn = 0;
        for (let i = 1; i < count; i++) {
          // Leave out the frames right at the change.
          if (ts[i - 1] > a + 0.01 && ts[i] < b - 0.01) {
            sum += dl[i];
            nIn++;
          }
        }
        if (tally) {
          moveSum += sum;
          moveN += nIn;
        }
        out.push({ start: round(a), dur: round(b - a), motion: round(clamp((nIn ? sum / nIn : 0) / 0.04, 0, 1)) });
      }
      return out;
    };
    const shots = split(cuts, true);

    // Big changes that are not hard cuts: a new headline or graphic animating in over a few frames.
    // Each shows as a bump in the "0.4 s apart" difference that stands above the quiet stretches around it.
    const dg = this.dg;
    const low = (i: number, r: number): number => {
      const near: number[] = [];
      for (let j = Math.max(GAP, i - r); j <= Math.min(count - 1, i + r); j++) near.push(dg[j]);
      near.sort((x, y) => x - y);
      return near[Math.floor(near.length * 0.25)] ?? 0;
    };
    const soft: number[] = [];
    for (let i = GAP; i < count - 1; i++) {
      if (dg[i] < 0.02) continue;
      let peak = true;
      for (let j = Math.max(GAP, i - 5); j <= Math.min(count - 1, i + 5); j++) if (dg[j] > dg[i] || (dg[j] === dg[i] && j < i)) peak = false;
      // "A lot" is relative: in busy footage only something far above the usual movement counts.
      if (!peak || dg[i] < 4 * low(i, 22) + 0.012) continue;
      // The change happened inside the window that ends here: put it where most of the movement was.
      let wsum = 0;
      let tsum = 0;
      for (let j = i - GAP + 1; j <= i; j++) {
        wsum += dl[j];
        tsum += dl[j] * ((ts[j - 1] + ts[j]) / 2);
      }
      const t = wsum > 0 ? tsum / wsum : ts[i];
      if (t < 0.25 || t > seconds - 0.25) continue;
      // What follows right after a change (words filling in, a number counting up) belongs to it.
      if (cuts.some((c) => Math.abs(c - t) < 0.6) || soft.some((x) => Math.abs(x - t) < 0.6)) continue;
      soft.push(round(t));
    }
    const marks = [...cuts, ...soft].sort((x, y) => x - y);
    const sections = split(marks, false);

    // Visible changes that are not cuts: text or a graphic popping in.
    let changes = marks.length;
    let lastChange = -1;
    for (let i = 1; i < count - 1; i++) {
      if (dl[i] < 0.006 || dl[i] < dl[i - 1] || dl[i] < dl[i + 1]) continue;
      if (dl[i] < 2.2 * around(dl, i, 5) + 0.002) continue;
      if (marks.some((c) => Math.abs(c - ts[i]) < 0.25) || ts[i] - lastChange < 0.2) continue;
      lastChange = ts[i];
      changes++;
    }

    // Look and colours.
    const darkShare = this.pixels ? this.dark / this.pixels : 0;
    const lightShare = this.pixels ? this.light / this.pixels : 0;
    const look: RefProfile['look'] = darkShare > 0.55 ? 'dark' : lightShare > 0.55 ? 'light' : 'mixed';
    const bins: Array<{ r: number; g: number; b: number; w: number }> = [];
    for (let i = 0; i < 4096; i++) if (this.palette[i] > 0) bins.push({ r: ((i >> 8) & 15) * 17, g: ((i >> 4) & 15) * 17, b: (i & 15) * 17, w: this.palette[i] / this.pixels });
    bins.sort((x, y) => y.w - x.w);
    const group = (list: typeof bins, max: number, reach: number): typeof bins => {
      const out: typeof bins = [];
      for (const c of list) {
        const near = out.find((o) => Math.hypot(o.r - c.r, o.g - c.g, o.b - c.b) < reach);
        if (near) {
          const w = near.w + c.w;
          near.r = (near.r * near.w + c.r * c.w) / w;
          near.g = (near.g * near.w + c.g * c.w) / w;
          near.b = (near.b * near.w + c.b * c.w) / w;
          near.w = w;
        } else if (out.length < max) out.push({ ...c });
      }
      return out.sort((x, y) => y.w - x.w);
    };
    const colors = group(bins.slice(0, 400), 8, 56)
      .filter((c) => c.w >= 0.02)
      .slice(0, 5)
      .map((c) => ({ hex: hex(c.r, c.g, c.b), share: round(c.w, 3) }));
    const vivid = bins.filter((c) => {
      const mx = Math.max(c.r, c.g, c.b);
      const mn = Math.min(c.r, c.g, c.b);
      return mx >= 110 && (mx - mn) / mx >= 0.45;
    });
    const top = group(vivid.slice(0, 300), 6, 70)[0];
    const accent = top && top.w >= 0.006 ? hex(top.r, top.g, top.b) : null;

    return {
      shots,
      cuts,
      sections,
      marks,
      hookHold: round(marks.length ? marks[0] : seconds),
      medianShot: round(median(shots.map((s) => s.dur))),
      medianSection: round(median(sections.map((s) => s.dur))),
      changesPerSec: round(seconds > 0 ? changes / seconds : 0),
      motion: round(clamp((moveN ? moveSum / moveN : 0) / 0.04, 0, 1)),
      look,
      colors,
      accent,
    };
  }
}

/** Loudness, silence and tempo of a mono track, and whether the picture changes (cuts, new sections) follow the beat. */
export function measureAudio(samples: Float32Array | null, rate: number, cuts: number[]): RefProfile['audio'] {
  const none: RefProfile['audio'] = { present: false, quiet: 1, bpm: null, beatStrength: 0, cutsOnBeat: null };
  if (!samples || samples.length < rate) return none;
  const FPS = 100;
  const hop = Math.max(1, Math.round(rate / FPS));
  const frames = Math.floor(samples.length / hop);
  const e = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    const end = Math.min(samples.length, (i + 2) * hop);
    for (let j = i * hop; j < end; j++) sum += samples[j] * samples[j];
    e[i] = Math.sqrt(sum / Math.max(1, end - i * hop));
  }
  const sorted = Array.from(e).sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  if (p95 < 0.003) return none;
  const floor = Math.max(0.002, p95 * 0.08);
  let quietN = 0;
  for (let i = 0; i < frames; i++) if (e[i] < floor) quietN++;
  const quiet = round(quietN / frames, 3);

  // Where the sound gets louder all at once (a drum, a hit, a word starting).
  const o = new Float32Array(frames);
  let mean = 0;
  for (let i = 1; i < frames; i++) {
    o[i] = Math.max(0, Math.log1p(60 * (e[i] / p95)) - Math.log1p(60 * (e[i - 1] / p95)));
    mean += o[i];
  }
  mean /= frames;
  for (let i = 0; i < frames; i++) o[i] -= mean;
  let power = 0;
  for (let i = 0; i < frames; i++) power += o[i] * o[i];
  if (power <= 0 || frames < FPS * 4) return { present: true, quiet, bpm: null, beatStrength: 0, cutsOnBeat: null };

  // A steady beat repeats: how well does the track match itself one beat later (70 to 180 BPM)?
  const lo = Math.round((FPS * 60) / 180);
  const hi = Math.min(Math.round((FPS * 60) / 70), Math.floor(frames / 3));
  const acf = (lag: number): number => {
    let s = 0;
    for (let i = 0; i + lag < frames; i++) s += o[i] * o[i + lag];
    return (s / power) * (frames / (frames - lag));
  };
  let best = 0;
  let bestLag = 0;
  const r: number[] = [];
  for (let lag = lo - 1; lag <= hi + 1; lag++) r[lag] = acf(lag);
  for (let lag = lo; lag <= hi; lag++) {
    if (r[lag] > best && r[lag] >= r[lag - 1] && r[lag] >= r[lag + 1]) {
      best = r[lag];
      bestLag = lag;
    }
  }
  if (!bestLag || best < 0.15) return { present: true, quiet, bpm: null, beatStrength: round(Math.max(0, best)), cutsOnBeat: null };
  // Between two whole lags: fit a curve through the peak.
  const a = r[bestLag - 1];
  const b = r[bestLag];
  const c = r[bestLag + 1];
  const shift = a - 2 * b + c !== 0 ? (0.5 * (a - c)) / (a - 2 * b + c) : 0;
  const period = bestLag + clamp(shift, -0.5, 0.5);
  const bpm = Math.round((FPS * 60) / period);

  // Where the beats fall, then how many cuts sit on one.
  let phase = 0;
  let phaseBest = -Infinity;
  for (let p = 0; p < period; p += 0.5) {
    let s = 0;
    for (let k = 0; p + k * period < frames; k++) s += o[Math.round(p + k * period)] ?? 0;
    if (s > phaseBest) {
      phaseBest = s;
      phase = p;
    }
  }
  let cutsOnBeat: number | null = null;
  const beat = period / FPS;
  // With beats this close together any cut is "near" one, so it would say nothing.
  if (cuts.length >= 3 && beat >= 0.4) {
    let on = 0;
    for (const t of cuts) {
      const k = Math.round((t - phase / FPS) / beat);
      if (Math.abs(t - (phase / FPS + k * beat)) <= 0.09) on++;
    }
    cutsOnBeat = round(on / cuts.length);
  }
  return { present: true, quiet, bpm, beatStrength: round(clamp(best, 0, 1)), cutsOnBeat };
}

/** The small frame size to sample a video of this shape at. */
export function sampleSize(width: number, height: number): { w: number; h: number } {
  const k = SAMPLE_SIDE / Math.max(width, height, 1);
  return { w: Math.max(16, Math.round(width * k)), h: Math.max(16, Math.round(height * k)) };
}
