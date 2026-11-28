import { SAMPLE_COUNTS, SAMPLE_GAIN, isSampleKind, type SampleKind } from '@shared/sfxLib';
import type { SfxEvent } from '@shared/sfx';
import { mediaUrl } from '../media';

// Recorded sound effects (resources/sfx, all CC0): each cue picks one of its kind's variants (never the same one
// twice in a row), so a run of footsteps or coins does not sound copy-pasted. Background places (amb_*) loop for
// their stretch with soft fades. A missing file is skipped quietly (the reel still renders).

let dirP: Promise<string> | null = null;
const sfxDir = (): Promise<string> => (dirP ??= window.marketo.app.sfxDir().catch(() => ''));
const cache = new Map<string, Promise<AudioBuffer | null>>();

async function load(ctx: BaseAudioContext, kind: SampleKind, n: number): Promise<AudioBuffer | null> {
  const dir = await sfxDir();
  if (!dir) return null;
  const file = `${dir}/${kind}/${String(n).padStart(2, '0')}.ogg`.replace(/\\/g, '/');
  let p = cache.get(file);
  if (!p) {
    p = fetch(mediaUrl(file))
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null);
    cache.set(file, p);
    // A failed load is not kept, so the next render tries again.
    void p.then((b) => {
      if (!b) cache.delete(file);
    });
  }
  return p;
}

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Whether an event plays a recording (and not a made-up sound). */
export const isSampleEvent = (e: SfxEvent): boolean => isSampleKind(e.kind);

/** Schedule the recorded cues and background loops of `events` on the mix. */
export async function scheduleSamples(ctx: BaseAudioContext, out: AudioNode, events: SfxEvent[], volume: number, seed = ''): Promise<void> {
  const last = new Map<string, number>();
  const list = events.filter(isSampleEvent).sort((a, b) => a.t - b.t);
  for (const e of list) {
    const kind = e.kind as SampleKind;
    const count = SAMPLE_COUNTS[kind];
    let n = (hash(`${seed}:${kind}:${Math.round(e.t * 100)}`) % count) + 1;
    if (count > 1 && last.get(kind) === n) n = (n % count) + 1;
    last.set(kind, n);
    const buf = await load(ctx, kind, n);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    const level = volume * (SAMPLE_GAIN[kind] ?? 0.6) * (e.gain ?? 1);
    const pan = ctx.createStereoPanner();
    pan.pan.value = kind.startsWith('amb_') ? 0 : Math.sin(e.t * 12.9898) * 0.25;
    src.connect(g).connect(pan).connect(out);
    if (kind.startsWith('amb_')) {
      // A place: loop under its stretch, fading in and out.
      const dur = Math.max(0.5, e.dur ?? 4);
      src.loop = true;
      const fade = Math.min(0.6, dur / 3);
      g.gain.setValueAtTime(0, e.t);
      g.gain.linearRampToValueAtTime(level, e.t + fade);
      g.gain.setValueAtTime(level, e.t + dur - fade);
      g.gain.linearRampToValueAtTime(0, e.t + dur);
      src.start(e.t, (hash(`${seed}:${e.t}`) % 1000) / 1000 * buf.duration);
      src.stop(e.t + dur + 0.05);
    } else {
      // Small level and pitch spread so repeats do not sound identical.
      const r = (hash(`${seed}:${e.t}:v`) % 1000) / 1000;
      g.gain.value = level * (0.85 + r * 0.3);
      src.playbackRate.value = 0.96 + r * 0.08;
      src.start(Math.max(0, e.t));
    }
  }
}

/** A quiet room tone (filtered noise with a slow drift) for indoor places, made here so it needs no file. */
export function scheduleRoomTone(ctx: BaseAudioContext, out: AudioNode, from: number, dur: number, volume: number): void {
  const len = Math.ceil(Math.min(dur + 0.2, 60) * ctx.sampleRate);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 4242;
  let b = 0;
  for (let i = 0; i < len; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    b = b * 0.985 + ((seed / 0x7fffffff) * 2 - 1) * 0.015;
    d[i] = b * 0.28;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const g = ctx.createGain();
  const level = volume * 0.5;
  const fade = Math.min(0.6, dur / 3);
  g.gain.setValueAtTime(0, from);
  g.gain.linearRampToValueAtTime(level, from + fade);
  g.gain.setValueAtTime(level, from + dur - fade);
  g.gain.linearRampToValueAtTime(0, from + dur);
  src.connect(lp).connect(g).connect(out);
  src.start(from);
  src.stop(from + dur + 0.05);
}
