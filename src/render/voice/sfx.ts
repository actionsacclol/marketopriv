import type { SfxEvent } from '@shared/sfx';

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

  for (const e of events) {
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
    }
  }
}
