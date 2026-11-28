import type { SfxEvent } from '@shared/sfx';
import { isSampleKind } from '@shared/sfxLib';

// Synthesized sound effects (no samples, nothing licensed): short UI ticks,
// pops, mouse clicks, noise whooshes, accelerating-tick risers, low hits and
// counter whirrs. Each is a few Web Audio nodes scheduled on an offline
// context, panned a little so they sit beside the centred voice.

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 12345;
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    d[i] = (seed / 0x7fffffff) * 2 - 1;
  }
  return buf;
}

const panOf = (t: number, spread: number): number => Math.sin(t * 12.9898) * spread;

export function scheduleSfx(ctx: BaseAudioContext, out: AudioNode, events: SfxEvent[], volume: number): void {
  const noise = noiseBuffer(ctx);

  const env = (t: number, peak: number, attack: number, decay: number): GainNode => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  };
  const panner = (pan: number): StereoPannerNode => {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(out);
    return p;
  };
  const tone = (t: number, f0: number, f1: number, glide: number, peak: number, decay: number, dest: AudioNode, type: OscillatorType = 'sine'): void => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
    o.connect(env(t, peak, 0.002, decay)).connect(dest);
    o.start(t);
    o.stop(t + decay + 0.05);
  };
  const burst = (t: number, len: number, peak: number, filter: BiquadFilterType, freq: number, dest: AudioNode, q = 0.8): void => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    s.connect(f).connect(env(t, peak, 0.001, len)).connect(dest);
    s.start(t, (t * 7.3) % 1.5);
    s.stop(t + len + 0.05);
  };

  const tick = (t: number, g: number, pitch = 2400): void => {
    const p = panner(panOf(t, 0.35));
    tone(t, pitch, pitch, 0, 0.32 * g, 0.045, p);
    burst(t, 0.012, 0.12 * g, 'highpass', 4500, p);
  };

  // ── Meme sounds (beat flags): all synthesized, nothing sampled ──
  /** Soft saturation, for the boom and the bass drop. */
  const drive = (amount: number, dest: AudioNode): WaveShaperNode => {
    const w = ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    w.curve = curve;
    w.connect(dest);
    return w;
  };
  /** A short room: a few filtered echoes, so a hit has a tail. */
  const room = (dest: AudioNode, time: number, feedback: number): AudioNode => {
    const input = ctx.createGain();
    input.connect(dest);
    const d = ctx.createDelay(1);
    d.delayTime.value = time;
    const fb = ctx.createGain();
    fb.gain.value = feedback;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    input.connect(d).connect(lp).connect(fb).connect(d);
    lp.connect(dest);
    return input;
  };
  /** A held note: oscillator(s) with attack / hold / release and an optional vibrato, into dest. */
  const note = (t: number, freqs: number[], hold: number, peak: number, dest: AudioNode, type: OscillatorType, opts: { attack?: number; release?: number; bend?: number; vibrato?: [number, number] } = {}): void => {
    const atk = opts.attack ?? 0.01;
    const rel = opts.release ?? 0.06;
    const v = ctx.createGain();
    v.gain.setValueAtTime(0, t);
    v.gain.linearRampToValueAtTime(peak, t + atk);
    v.gain.setValueAtTime(peak, t + atk + hold);
    v.gain.linearRampToValueAtTime(0, t + atk + hold + rel);
    v.connect(dest);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * (opts.bend ?? 1), t);
      if (opts.bend) o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      if (opts.vibrato) {
        const lfo = ctx.createOscillator();
        lfo.frequency.value = opts.vibrato[0];
        const depth = ctx.createGain();
        depth.gain.value = f * opts.vibrato[1];
        lfo.connect(depth).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + atk + hold + rel + 0.05);
      }
      o.connect(v);
      o.start(t);
      o.stop(t + atk + hold + rel + 0.05);
    }
  };
  const meme = (kind: string, t: number, g: number): void => {
    const center = panner(0);
    switch (kind) {
      case 'boom': {
        // The deep "vine boom": a falling sine, driven, with a thump and a room tail.
        const tail = room(drive(2.2, center), 0.09, 0.42);
        tone(t, 78, 42, 0.9, 0.85 * g, 1.6, tail);
        tone(t, 156, 70, 0.5, 0.25 * g, 0.7, tail);
        burst(t, 0.09, 0.5 * g, 'lowpass', 520, tail);
        break;
      }
      case 'bass': {
        // A distorted 808 drop: loud on purpose, but levelled so it never clips the mix.
        const d = drive(5, center);
        tone(t, 62, 41, 0.35, 0.55 * g, 1.5, d);
        tone(t, 124, 82, 0.35, 0.18 * g, 1.2, d);
        burst(t, 0.03, 0.35 * g, 'lowpass', 300, d);
        break;
      }
      case 'horn': {
        // Air horn: a stack of detuned saws, three blasts (short, short, long).
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 1400;
        f.Q.value = 0.6;
        f.connect(drive(1.6, center));
        const freqs = [466, 470, 932, 699];
        [
          [0, 0.13],
          [0.19, 0.13],
          [0.38, 0.55],
        ].forEach(([at, hold]) => note(t + at, freqs, hold, 0.09 * g, f, 'sawtooth', { attack: 0.012, release: 0.05, bend: 0.93 }));
        break;
      }
      case 'scratch': {
        // Record scratch: a band of noise and a saw dragged up and back down, twice.
        for (const [at, up] of [
          [0, true],
          [0.1, false],
          [0.2, true],
        ] as Array<[number, boolean]>) {
          const s = ctx.createBufferSource();
          s.buffer = noise;
          const f = ctx.createBiquadFilter();
          f.type = 'bandpass';
          f.Q.value = 3;
          f.frequency.setValueAtTime(up ? 500 : 2600, t + at);
          f.frequency.exponentialRampToValueAtTime(up ? 2600 : 450, t + at + 0.09);
          s.connect(f).connect(env(t + at, 0.9 * g, 0.004, 0.09)).connect(center);
          s.start(t + at, (at * 13) % 1.5);
          s.stop(t + at + 0.12);
          tone(t + at, up ? 180 : 700, up ? 700 : 160, 0.09, 0.12 * g, 0.1, center);
        }
        break;
      }
      case 'ding': {
        // A bell: two FM partials ringing out.
        for (const [f, peak, len] of [
          [1318, 0.32, 1.3],
          [2637, 0.1, 0.7],
        ]) {
          const car = ctx.createOscillator();
          car.frequency.value = f;
          const mod = ctx.createOscillator();
          mod.frequency.value = f * 3.5;
          const idx = ctx.createGain();
          idx.gain.setValueAtTime(f * 2, t);
          idx.gain.exponentialRampToValueAtTime(f * 0.05, t + len);
          mod.connect(idx).connect(car.frequency);
          car.connect(env(t, peak * g, 0.002, len)).connect(panner(0.1));
          for (const o of [car, mod]) {
            o.start(t);
            o.stop(t + len + 0.05);
          }
        }
        break;
      }
      case 'buzzer': {
        // Wrong answer: a low square chord, held, cut off hard.
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1300;
        f.connect(center);
        note(t, [150, 157, 225], 0.62, 0.11 * g, f, 'square', { attack: 0.005, release: 0.02 });
        break;
      }
      case 'boing': {
        // A spring: a rising sine with a fast vibrato that slows down.
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(170, t);
        o.frequency.exponentialRampToValueAtTime(420, t + 0.45);
        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(22, t);
        lfo.frequency.exponentialRampToValueAtTime(5, t + 0.6);
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(70, t);
        depth.gain.exponentialRampToValueAtTime(10, t + 0.6);
        lfo.connect(depth).connect(o.frequency);
        o.connect(env(t, 0.45 * g, 0.004, 0.65)).connect(panner(-0.1));
        for (const x of [o, lfo]) {
          x.start(t);
          x.stop(t + 0.75);
        }
        break;
      }
      case 'honk': {
        // Clown horn: two squeezes of a nasal square.
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 950;
        f.Q.value = 2.2;
        f.connect(center);
        note(t, [372, 376], 0.12, 0.4 * g, f, 'square', { attack: 0.015, release: 0.04, bend: 0.9 });
        note(t + 0.22, [372, 376], 0.16, 0.4 * g, f, 'square', { attack: 0.015, release: 0.05, bend: 0.9 });
        break;
      }
      case 'sad': {
        // Sad trombone: wah, wah, wah, waaah, each note through an opening and closing filter.
        const notes: Array<[number, number, number]> = [
          [0, 196, 0.36],
          [0.42, 185, 0.36],
          [0.84, 175, 0.36],
          [1.26, 165, 1.0],
        ];
        for (const [at, freq, hold] of notes) {
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass';
          f.Q.value = 4;
          f.frequency.setValueAtTime(350, t + at);
          f.frequency.linearRampToValueAtTime(1600, t + at + 0.12);
          f.frequency.linearRampToValueAtTime(500, t + at + hold);
          f.connect(center);
          note(t + at, [freq, freq * 1.004], hold, 0.16 * g, f, 'sawtooth', { attack: 0.03, release: 0.08, vibrato: hold > 0.5 ? [5.5, 0.025] : undefined });
        }
        break;
      }
    }
  };

  for (const e of events) {

    if (isSampleKind(e.kind) || e.kind === 'roomtone') continue; // recordings and room tone: samples.ts
    const g = (e.gain ?? 1) * volume;
    const t = Math.max(0, e.t);
    switch (e.kind) {
      case 'tick':
        tick(t, g);
        break;
      case 'pop': {
        const p = panner(panOf(t, 0.3));
        tone(t, 950, 240, 0.07, 0.5 * g, 0.12, p);
        burst(t, 0.01, 0.1 * g, 'highpass', 3000, p);
        break;
      }
      case 'click': {
        const p = panner(0.25);
        burst(t, 0.014, 1.4 * g, 'bandpass', 3200, p, 1.2);
        tone(t, 1700, 1700, 0, 0.35 * g, 0.014, p);
        burst(t + 0.06, 0.012, 1.0 * g, 'bandpass', 2800, p, 1.2);
        break;
      }
      case 'whoosh': {
        const len = e.dur ?? 0.45;
        const s = ctx.createBufferSource();
        s.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 1.1;
        f.frequency.setValueAtTime(300, t);
        f.frequency.exponentialRampToValueAtTime(3600, t + len);
        const v = ctx.createGain();
        v.gain.setValueAtTime(0, t);
        v.gain.linearRampToValueAtTime(0.55 * g, t + len * 0.6);
        v.gain.linearRampToValueAtTime(0, t + len);
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(-0.7, t);
        p.pan.linearRampToValueAtTime(0.7, t + len);
        s.connect(f).connect(v).connect(p).connect(out);
        s.start(t, 0.3);
        s.stop(t + len + 0.05);
        break;
      }
      case 'riser': {
        const len = Math.max(0.3, e.dur ?? 1);
        // Accelerating ticks climbing in pitch, over a rising filtered hiss.
        let u = 0;
        let tt = t;
        while (tt < t + len) {
          u = (tt - t) / len;
          tick(tt, g * (0.25 + 0.35 * u), 900 + 1800 * u);
          tt += 0.11 - 0.075 * u;
        }
        const s = ctx.createBufferSource();
        s.buffer = noise;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.Q.value = 2;
        f.frequency.setValueAtTime(500, t);
        f.frequency.exponentialRampToValueAtTime(2800, t + len);
        const v = ctx.createGain();
        v.gain.setValueAtTime(0, t);
        v.gain.linearRampToValueAtTime(0.14 * g, t + len);
        v.gain.linearRampToValueAtTime(0, t + len + 0.06);
        s.connect(f).connect(v).connect(panner(0));
        s.start(t, 0.7);
        s.stop(t + len + 0.1);
        break;
      }
      case 'impact': {
        const center = panner(0);
        tone(t, 120, 38, 0.4, 0.55 * g, 0.6, center);
        burst(t, 0.28, 0.22 * g, 'lowpass', 900, panner(-0.5));
        burst(t + 0.004, 0.28, 0.22 * g, 'lowpass', 900, panner(0.5));
        break;
      }
      case 'whirr': {
        const len = e.dur ?? 1;
        for (let tt = t, k = 0; tt < t + len; tt += 0.034, k++) {
          const p = panner(k % 2 ? 0.2 : -0.2);
          tone(tt, 1500 + (k % 3) * 120, 1500 + (k % 3) * 120, 0, 0.3 * g, 0.022, p);
        }
        break;
      }
      default:
        meme(e.kind, t, g);
    }
  }
}
