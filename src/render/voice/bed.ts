// Background music ("bed"), synthesized like the sound effects: no samples,
// nothing licensed, so no platform can mute or claim it. Three styles:
//   lofi    - dusty electric-piano 7th chords, swung boom-bap drums, round bass, vinyl crackle
//   ambient - slow detuned pads and a soft sub, no drums
//   pulse   - a driving four-on-the-floor groove with an 8th-note bass and a pad
// The seed (from the reel's text) picks the key and the progression, so two
// reels don't sound the same. The bed is rendered on its own, levelled, then
// mixed under the voice with ducking while anyone speaks.

export type BedStyle = 'lofi' | 'ambient' | 'pulse';
export const BED_STYLES: BedStyle[] = ['lofi', 'ambient', 'pulse'];

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = rng(seed);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return buf;
}

// Progressions as [bass root, chord tones...] in MIDI, around C. Each lasts one bar.
const LOFI: number[][][] = [
  [[41, 53, 57, 60, 64], [40, 52, 55, 59, 62], [38, 50, 53, 57, 60, 64], [36, 48, 52, 55, 59]], // Fmaj7 Em7 Dm9 Cmaj7
  [[38, 50, 53, 57, 60, 64], [43, 53, 55, 59, 62], [36, 48, 52, 55, 59, 62], [45, 52, 55, 57, 60]], // Dm9 G7 Cmaj9 Am7
  [[45, 52, 55, 57, 60], [38, 50, 53, 57, 60], [43, 50, 53, 55, 59], [36, 52, 55, 59, 62]], // Am7 Dm7 G7 Cmaj7
];
const AMBIENT: number[][][] = [
  [[36, 55, 60, 64, 67], [41, 57, 60, 64, 69], [45, 57, 60, 64, 67], [43, 55, 59, 62, 67]],
  [[38, 53, 57, 62, 64], [34, 53, 58, 62, 65], [41, 53, 57, 60, 65], [36, 52, 55, 60, 64]],
];
const PULSE: number[][][] = [
  [[45, 57, 60, 64], [41, 57, 60, 65], [36, 55, 60, 64], [43, 55, 59, 62]], // Am F C G
  [[38, 57, 62, 65], [46, 58, 62, 65], [41, 57, 60, 65], [45, 57, 61, 64]], // Dm Bb F A
];

const STYLE = {
  lofi: { bpm: [76, 84], swing: 0.16 },
  ambient: { bpm: [60, 60], swing: 0 },
  pulse: { bpm: [100, 108], swing: 0 },
} as const;

/** Render the bed on its own (stereo), levelled to a fixed loudness. */
export async function renderBed(style: BedStyle, seconds: number, seed: number, rate: number): Promise<AudioBuffer> {
  const len = Math.max(1, Math.ceil((seconds + 0.5) * rate));
  const ctx = new OfflineAudioContext(2, len, rate);
  const r = rng(seed);
  const transpose = Math.floor(r() * 6) - 3; // -3..+2 semitones
  const [lo, hi] = STYLE[style].bpm;
  const bpm = lo + Math.round(r() * (hi - lo));
  const beat = 60 / bpm;
  const bar = beat * 4;
  const swing = STYLE[style].swing;
  const progs = style === 'lofi' ? LOFI : style === 'ambient' ? AMBIENT : PULSE;
  const prog = progs[Math.floor(r() * progs.length)];
  const noise = noiseBuffer(ctx, 2, seed ^ 0x9e3779b9);

  // Master: a gentle tape-ish low-pass, a fade in and a fade out.
  const master = ctx.createGain();
  master.gain.setValueAtTime(0, 0);
  master.gain.linearRampToValueAtTime(1, 0.6);
  master.gain.setValueAtTime(1, Math.max(0.7, seconds - 1.4));
  master.gain.linearRampToValueAtTime(0, seconds);
  const tape = ctx.createBiquadFilter();
  tape.type = 'lowpass';
  tape.frequency.value = style === 'lofi' ? 5200 : style === 'ambient' ? 7000 : 11000;
  tape.Q.value = 0.4;
  master.connect(tape).connect(ctx.destination);

  const pan = (v: number): StereoPannerNode => {
    const p = ctx.createStereoPanner();
    p.pan.value = v;
    p.connect(master);
    return p;
  };
  const center = pan(0);

  // Step time inside a bar (16ths), with swing on the off 16ths.
  const step = (barStart: number, s: number): number => barStart + s * (beat / 4) + (s % 2 === 1 ? swing * (beat / 4) : 0);

  const burst = (t: number, len: number, peak: number, type: BiquadFilterType, freq: number, q: number, dest: AudioNode): void => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f).connect(g).connect(dest);
    s.start(t, r() * 1.5);
    s.stop(t + len + 0.02);
  };
  const kick = (t: number, v: number): void => {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(style === 'pulse' ? 140 : 115, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.95 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (style === 'pulse' ? 0.32 : 0.42));
    o.connect(g).connect(center);
    o.start(t);
    o.stop(t + 0.5);
    burst(t, 0.012, 0.18 * v, 'highpass', 2500, 0.7, center);
  };
  const snare = (t: number, v: number): void => {
    const p = pan(-0.05);
    burst(t, style === 'lofi' ? 0.2 : 0.16, 0.42 * v, 'bandpass', style === 'lofi' ? 1900 : 2600, 0.6, p);
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28 * v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(p);
    o.start(t);
    o.stop(t + 0.12);
  };
  const hat = (t: number, v: number, open = false): void => burst(t, open ? 0.22 : 0.045, 0.16 * v, 'highpass', style === 'lofi' ? 6500 : 8000, 0.5, pan(0.28));

  // Electric piano: a 2-operator FM voice (bell-ish attack that mellows), slightly detuned pair, strummed.
  const ep = (t: number, midi: number, dur: number, v: number, dest: AudioNode): void => {
    const f = hz(midi + transpose);
    for (const det of [-4, 4]) {
      const car = ctx.createOscillator();
      car.frequency.value = f;
      car.detune.value = det;
      const mod = ctx.createOscillator();
      mod.frequency.value = f;
      const idx = ctx.createGain();
      idx.gain.setValueAtTime(f * 1.6, t);
      idx.gain.exponentialRampToValueAtTime(f * 0.18, t + 0.9);
      mod.connect(idx).connect(car.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.09 * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.045 * v, t + 0.7);
      g.gain.setValueAtTime(0.045 * v, t + dur);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.45);
      car.connect(g).connect(dest);
      for (const o of [car, mod]) {
        o.start(t);
        o.stop(t + dur + 0.5);
      }
    }
  };
  // Pad: three detuned saws through a low-pass, slow attack and release.
  const pad = (t: number, midi: number, dur: number, v: number, dest: AudioNode, cutoff: number): void => {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 0.6, t);
    f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.6);
    f.Q.value = 0.7;
    const g = ctx.createGain();
    const atk = Math.min(1.4, dur * 0.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.035 * v, t + atk);
    g.gain.setValueAtTime(0.035 * v, t + dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 1.2);
    f.connect(g).connect(dest);
    for (const det of [-9, 0, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = hz(midi + transpose);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 1.3);
    }
  };
  const bass = (t: number, midi: number, dur: number, v: number, type: OscillatorType = 'sine'): void => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz(midi + transpose);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = type === 'sine' ? 400 : 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.3 * v, t + 0.015);
    g.gain.setValueAtTime(0.26 * v, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(f).connect(g).connect(center);
    o.start(t);
    o.stop(t + dur + 0.05);
  };

  // Tremolo bus for the keys (lofi wobble).
  const keys = ctx.createGain();
  keys.gain.value = 1;
  const keysTone = ctx.createBiquadFilter();
  keysTone.type = 'lowpass';
  keysTone.frequency.value = style === 'lofi' ? 2300 : 5000;
  keys.connect(keysTone).connect(pan(-0.12));
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4.2;
  const depth = ctx.createGain();
  depth.gain.value = style === 'lofi' ? 0.12 : 0.04;
  lfo.connect(depth).connect(keys.gain);
  lfo.start(0);
  lfo.stop(seconds + 0.5);

  const bars = Math.ceil(seconds / bar) + 1;
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    if (t0 > seconds) break;
    const [root, ...tones] = prog[b % prog.length];
    if (style === 'lofi') {
      const strum = (at: number, v: number, len: number): void => tones.forEach((n, i) => ep(at + i * (0.012 + r() * 0.012), n, len, v * (0.85 + r() * 0.3), keys));
      strum(t0, 1, bar * 0.55);
      strum(step(t0, 10), 0.6, bar * 0.3);
      bass(t0, root, beat * 1.6, 1);
      bass(step(t0, 7), root, beat * 0.5, 0.7);
      bass(step(t0, 10), root + 7, beat * 1.2, 0.8);
      if (b > 0 || r() > 0.5) {
        kick(t0, 1);
        kick(step(t0, 7), 0.55);
        kick(step(t0, 10), 0.85);
        snare(step(t0, 4), 0.9);
        snare(step(t0, 12), 1);
        if (r() > 0.6) snare(step(t0, 15), 0.25);
        for (let s = 0; s < 16; s += 2) hat(step(t0, s), s % 4 === 0 ? 0.9 : 0.55);
        if (r() > 0.5) hat(step(t0, 13), 0.3);
      }
    } else if (style === 'ambient') {
      tones.forEach((n, i) => pad(t0 + i * 0.05, n, bar, 0.9, pan(i % 2 ? 0.25 : -0.25), 1800));
      bass(t0, root - 12 < 28 ? root : root - 12, bar, 0.55);
      // A soft bell on the top note every other bar.
      if (b % 2 === 1) ep(t0 + beat * 2, tones[tones.length - 1] + 12, beat * 2, 0.35, keys);
    } else {
      tones.forEach((n, i) => pad(t0, n, bar, 0.7, pan(i % 2 ? 0.3 : -0.3), 3200));
      for (let s = 0; s < 16; s += 2) bass(step(t0, s), root, beat * 0.42, s % 4 === 0 ? 1 : 0.75, 'sawtooth');
      for (let s = 0; s < 16; s += 4) kick(step(t0, s), 1);
      snare(step(t0, 4), 0.8);
      snare(step(t0, 12), 0.8);
      for (let s = 2; s < 16; s += 4) hat(step(t0, s), 0.8, true);
      for (let s = 1; s < 16; s += 2) hat(step(t0, s), 0.3);
    }
  }

  // Vinyl: steady filtered hiss plus random crackle (lofi only).
  if (style === 'lofi') {
    const hiss = ctx.createBufferSource();
    hiss.buffer = noise;
    hiss.loop = true;
    const hf = ctx.createBiquadFilter();
    hf.type = 'bandpass';
    hf.frequency.value = 3500;
    hf.Q.value = 0.4;
    const hg = ctx.createGain();
    hg.gain.value = 0.012;
    hiss.connect(hf).connect(hg).connect(center);
    hiss.start(0);
    hiss.stop(seconds + 0.5);
    for (let t = 0.2; t < seconds; t += 0.05 + r() * 0.35) burst(t, 0.004 + r() * 0.006, 0.05 + r() * 0.12, 'highpass', 2000 + r() * 3000, 0.5, pan(r() * 0.8 - 0.4));
  }

  const out = await ctx.startRendering();
  // Level to a fixed loudness so every style sits the same under the voice.
  const L = out.getChannelData(0);
  const R = out.getChannelData(1);
  let sum = 0;
  let n = 0;
  for (let i = Math.floor(rate); i < Math.min(L.length, Math.floor((seconds - 1.5) * rate)); i++) {
    sum += (L[i] * L[i] + R[i] * R[i]) / 2;
    n++;
  }
  const rms = Math.sqrt(sum / Math.max(1, n));
  const gain = rms > 0 ? BED_RMS / rms : 1;
  for (const c of [L, R]) for (let i = 0; i < c.length; i++) c[i] *= gain;
  return out;
}

/** Loudness of the bed at volume 1, before ducking (the voice is levelled to 0.085). */
const BED_RMS = 0.05;

/** Duck the bed under speech: full level in the gaps, `duck` of it while someone talks. */
export function duckGain(ctx: BaseAudioContext, volume: number, speech: Array<[number, number]>, duck = 0.42): GainNode {
  const g = ctx.createGain();
  const p = g.gain;
  p.setValueAtTime(volume, 0);
  const merged: Array<[number, number]> = [];
  for (const [a, b] of [...speech].sort((x, y) => x[0] - y[0])) {
    const last = merged[merged.length - 1];
    if (last && a - last[1] < 0.6) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  for (const [a, b] of merged) {
    p.setValueAtTime(volume, Math.max(0, a - 0.12));
    p.linearRampToValueAtTime(volume * duck, Math.max(0.01, a));
    p.setValueAtTime(volume * duck, b);
    p.linearRampToValueAtTime(volume, b + 0.35);
  }
  return g;
}
