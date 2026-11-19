// Whisper's audio front end, the same numbers as openai/whisper audio.py and
// Hugging Face's WhisperFeatureExtractor: 16 kHz mono, a 400-sample periodic
// Hann window every 160 samples (centred, reflect padded), power spectrum,
// 80 Slaney mel filters (librosa's default), log10, floored at 8 below the
// peak, then scaled to roughly -1..1. Input is one 30 s window (480000
// samples, zero padded); output is 80 x 3000, row-major by mel bin.

export const SAMPLE_RATE = 16000;
export const N_FFT = 400;
export const HOP = 160;
export const N_MELS = 80;
export const N_SAMPLES = 480000;
export const N_FRAMES = N_SAMPLES / HOP;

const N_BINS = N_FFT / 2 + 1;

// ── FFT ────────────────────────────────────────────────────────────────────
// 400 is not a power of two, so a small mixed-radix (2 x 2 x 2 x 2 x 5 x 5)
// decimation-in-time FFT; about 10x fewer multiplies than a plain DFT, which
// matters at 3000 frames per window.

const FACTORS: number[] = [];
for (let n = N_FFT, p = 2; n > 1; ) {
  if (n % p === 0) {
    FACTORS.push(p);
    n /= p;
  } else p++;
}
const COS = new Float64Array(N_FFT);
const SIN = new Float64Array(N_FFT);
for (let i = 0; i < N_FFT; i++) {
  COS[i] = Math.cos((2 * Math.PI * i) / N_FFT);
  SIN[i] = -Math.sin((2 * Math.PI * i) / N_FFT);
}
const TMP_RE = FACTORS.map(() => new Float64Array(N_FFT));
const TMP_IM = FACTORS.map(() => new Float64Array(N_FFT));

/** out[outOff .. outOff+n) = FFT of the n inputs at inOff, inOff+stride, ... (imaginary input is zero). */
function fft(input: Float64Array, inOff: number, stride: number, n: number, outRe: Float64Array, outIm: Float64Array, outOff: number, depth: number): void {
  if (n === 1) {
    outRe[outOff] = input[inOff];
    outIm[outOff] = 0;
    return;
  }
  const p = FACTORS[depth];
  const m = n / p;
  for (let q = 0; q < p; q++) fft(input, inOff + q * stride, stride * p, m, outRe, outIm, outOff + q * m, depth + 1);
  // Combine p sub-transforms of length m: X[k + s*m] = sum_q W_n^(q(k + s*m)) * Y_q[k].
  const tr = TMP_RE[depth];
  const ti = TMP_IM[depth];
  const step = N_FFT / n;
  for (let k = 0; k < m; k++) {
    for (let s = 0; s < p; s++) {
      const idx = k + s * m;
      let re = 0;
      let im = 0;
      for (let q = 0; q < p; q++) {
        const yr = outRe[outOff + q * m + k];
        const yi = outIm[outOff + q * m + k];
        const w = ((q * idx) % n) * step;
        re += yr * COS[w] - yi * SIN[w];
        im += yr * SIN[w] + yi * COS[w];
      }
      tr[idx] = re;
      ti[idx] = im;
    }
  }
  for (let i = 0; i < n; i++) {
    outRe[outOff + i] = tr[i];
    outIm[outOff + i] = ti[i];
  }
}

// ── Mel filters (Slaney scale and area normalisation, as librosa.filters.mel) ──
const hzToMel = (f: number): number => (f < 1000 ? f / (200 / 3) : 15 + Math.log(f / 1000) / (Math.log(6.4) / 27));
const melToHz = (m: number): number => (m < 15 ? m * (200 / 3) : 1000 * Math.exp((Math.log(6.4) / 27) * (m - 15)));

interface Filter {
  from: number;
  weights: Float64Array;
}

const FILTERS: Filter[] = (() => {
  const top = hzToMel(SAMPLE_RATE / 2);
  const pts = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz((top * i) / (N_MELS + 1)));
  const out: Filter[] = [];
  for (let i = 0; i < N_MELS; i++) {
    const [lo, mid, hi] = [pts[i], pts[i + 1], pts[i + 2]];
    const norm = 2 / (hi - lo);
    const row = new Float64Array(N_BINS);
    let first = -1;
    let last = -1;
    for (let k = 0; k < N_BINS; k++) {
      const f = (k * SAMPLE_RATE) / N_FFT;
      const w = Math.max(0, Math.min((f - lo) / (mid - lo), (hi - f) / (hi - mid))) * norm;
      row[k] = w;
      if (w > 0) {
        if (first < 0) first = k;
        last = k;
      }
    }
    out.push(first < 0 ? { from: 0, weights: new Float64Array(0) } : { from: first, weights: row.slice(first, last + 1) });
  }
  return out;
})();

const WINDOW = Float64Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT));

/** Log-mel features of one window: `audio` is up to 480000 samples at 16 kHz; the rest is silence. */
export function logMel(audio: Float32Array): Float32Array {
  const half = N_FFT / 2;
  // Zero padded to 30 s, then reflect padded by half a window on each side (torch.stft center=True).
  const x = new Float64Array(N_SAMPLES + N_FFT);
  const n = Math.min(audio.length, N_SAMPLES);
  for (let i = 0; i < n; i++) x[half + i] = audio[i];
  for (let i = 1; i <= half; i++) {
    x[half - i] = x[half + i];
    x[half + N_SAMPLES - 1 + i] = x[half + N_SAMPLES - 1 - i];
  }
  const out = new Float32Array(N_MELS * N_FRAMES);
  const frame = new Float64Array(N_FFT);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const power = new Float64Array(N_BINS);
  let peak = -Infinity;
  // N_FRAMES + 1 frames come out of the STFT; Whisper drops the last one.
  for (let t = 0; t < N_FRAMES; t++) {
    const off = t * HOP;
    for (let i = 0; i < N_FFT; i++) frame[i] = x[off + i] * WINDOW[i];
    fft(frame, 0, 1, N_FFT, re, im, 0, 0);
    for (let k = 0; k < N_BINS; k++) power[k] = re[k] * re[k] + im[k] * im[k];
    for (let m = 0; m < N_MELS; m++) {
      const { from, weights } = FILTERS[m];
      let s = 0;
      for (let k = 0; k < weights.length; k++) s += weights[k] * power[from + k];
      const v = Math.log10(Math.max(s, 1e-10));
      out[m * N_FRAMES + t] = v;
      if (v > peak) peak = v;
    }
  }
  const floor = peak - 8;
  for (let i = 0; i < out.length; i++) out[i] = (Math.max(out[i], floor) + 4) / 4;
  return out;
}
