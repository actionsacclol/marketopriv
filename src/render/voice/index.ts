import { isVoiced, storyBeats, storyVoiceSig, timingFor, num, type StoryBeat } from '@shared/presets';
import { storySfx } from '@shared/sfx';
import type { Fields, Reel } from '@shared/types';
import { cleanTune, clipKey, isEleven, readVoiceCache, voiceName, type VoiceCache, type VoiceTune } from '@shared/voice';
import { lexiconFor, spokenText } from '@shared/pronounce';
import { mediaUrl } from '../media';
import { scheduleSfx } from './sfx';
import { scheduleRoomTone, scheduleSamples } from './samples';
import { BED_STYLES, duckGain, renderBed, seedOf, type BedStyle } from './bed';

// Soundtrack for story reels: each beat's line is spoken by Kokoro-82M (the
// on-device voice engine from Krypt Studio / Krypt Editor, kokoro/ is copied
// from Krypt Editor) and cached as a WAV by voice + speed + text, so editing
// one line only regenerates that line. The clips are laid out on the reel's
// timeline with the synthesized sound effects (sfx.ts) into one stereo track
// that the preview and the export play.
//
// A voice can be tuned (shared/voice.ts VoiceTune): a second voice blended in
// (inside the model), pitch (the line is generated slower or faster and then
// resampled back to its length), and warmth / clarity (two shelf filters).
// The Voices page plays the same clips a reel would get.

const SAMPLE_RATE = 24000;
const MIX_RATE = 48000;
/** Loudness every line is levelled to before mixing (linear RMS). */
const TARGET_RMS = 0.085;

let worker: Worker | null = null;
let queue: Promise<unknown> = Promise.resolve();
const workerFor = (): Worker => (worker ??= new Worker(new URL('./kokoro/kokoroWorker.ts', import.meta.url), { type: 'module' }));

interface RunJob {
  text: string;
  speed: number;
  modelUrl: string;
  voiceUrl: string;
  blendUrl?: string;
  blend?: number;
  lexicon?: Record<string, string>;
}

function run(job_: RunJob): Promise<Float32Array> {
  const job = (): Promise<Float32Array> =>
    new Promise((resolve, reject) => {
      const w = workerFor();
      w.onmessage = (e: MessageEvent<{ type: string; audio?: Float32Array; message?: string }>) => {
        const m = e.data;
        if (m.type === 'done' && m.audio) resolve(m.audio);
        else if (m.type === 'error') reject(new Error(m.message ?? 'Speech generation failed.'));
      };
      w.onerror = (e) => {
        w.terminate();
        if (worker === w) worker = null;
        reject(new Error(e.message || 'The speech worker crashed.'));
      };
      w.postMessage({ type: 'run', ...job_ });
    });
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  return p;
}

/** Float32 PCM (one array per channel) → 16-bit WAV bytes. */
function wav(channels: Float32Array[], sampleRate: number): Uint8Array {
  const ch = channels.length;
  const frames = channels[0].length;
  const dataLen = frames * ch * 2;
  const dv = new DataView(new ArrayBuffer(44 + dataLen));
  const tag = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) dv.setUint8(off + i, s.charCodeAt(i));
  };
  tag(0, 'RIFF');
  dv.setUint32(4, 36 + dataLen, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, ch, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * ch * 2, true);
  dv.setUint16(32, ch * 2, true);
  dv.setUint16(34, 16, true);
  tag(36, 'data');
  dv.setUint32(40, dataLen, true);
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, channels[c][i]));
      dv.setInt16(44 + (i * ch + c) * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
  return new Uint8Array(dv.buffer);
}

async function decode(path: string): Promise<AudioBuffer> {
  const res = await fetch(mediaUrl(path));
  if (!res.ok) throw new Error(`Couldn't read the voice clip (${res.status}).`);
  return new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE).decodeAudioData(await res.arrayBuffer());
}

async function saveWav(name: string, channels: Float32Array[], rate = SAMPLE_RATE): Promise<string> {
  const r = await window.marketo.voice.save(name, wav(channels, rate));
  if (!r.ok || !r.data) throw new Error(r.message ?? 'Saving the voice clip failed.');
  return r.data;
}

/** Resample by `ratio` (2 = half as long, an octave up) with a windowed-sinc filter, so nothing folds back. */
function resample(x: Float32Array, ratio: number): Float32Array {
  const n = Math.max(1, Math.floor(x.length / ratio));
  const out = new Float32Array(n);
  const A = 8;
  // Shrinking the signal needs a lower cutoff.
  const cut = Math.min(1, 1 / ratio);
  const reach = A / cut;
  for (let i = 0; i < n; i++) {
    const c = i * ratio;
    const from = Math.max(0, Math.ceil(c - reach));
    const to = Math.min(x.length - 1, Math.floor(c + reach));
    let sum = 0;
    let norm = 0;
    for (let j = from; j <= to; j++) {
      const d = (j - c) * cut;
      const w = d === 0 ? 1 : (Math.sin(Math.PI * d) / (Math.PI * d)) * (Math.sin((Math.PI * d) / A) / ((Math.PI * d) / A));
      sum += x[j] * w;
      norm += w;
    }
    out[i] = norm ? sum / norm : 0;
  }
  return out;
}

/** Pitch (by resampling a line generated at the matching pace) and tone. */
async function shape(audio: Float32Array, factor: number, warmth: number, clarity: number): Promise<Float32Array> {
  let x = factor === 1 ? audio : resample(audio, factor);
  if (warmth || clarity) {
    const ctx = new OfflineAudioContext(1, x.length, SAMPLE_RATE);
    const buf = ctx.createBuffer(1, x.length, SAMPLE_RATE);
    buf.getChannelData(0).set(x);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 220;
    low.gain.value = warmth;
    const high = ctx.createBiquadFilter();
    high.type = 'highshelf';
    high.frequency.value = 3800;
    high.gain.value = clarity;
    src.connect(low).connect(high).connect(ctx.destination);
    src.start();
    x = (await ctx.startRendering()).getChannelData(0).slice();
  }
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (peak > 0.99) for (let i = 0; i < x.length; i++) x[i] *= 0.99 / peak;
  return x;
}

let modelInfo: { at: number; value: { dir: string | null; voices: string[] } } | null = null;
async function voiceModel(): Promise<{ dir: string | null; voices: string[] }> {
  if (modelInfo && modelInfo.value.dir && Date.now() - modelInfo.at < 60_000) return modelInfo.value;
  modelInfo = { at: Date.now(), value: await window.marketo.voice.model() };
  return modelInfo.value;
}

/**
 * One line spoken by a voice, as a cached WAV. `speed` is the line's pace
 * (a beat can have its own). `prefix` names clips that are only for
 * listening (the Voices page), so the hub can clear them out later.
 */
export async function speakClip(say: string, tune: VoiceTune, speed: number, opts: { prefix?: string; onStatus?: (s: string) => void } = {}): Promise<{ file: string; dur: number; key: string; made: boolean }> {
  const t = cleanTune(tune);
  const key = clipKey(t, speed, say);
  const name = `${opts.prefix ?? ''}${key}.wav`;
  const hit = await window.marketo.voice.find(name);
  if (hit) return { file: hit, dur: (await decode(hit)).duration, key, made: false };
  const model = await voiceModel();
  if (!model.dir) throw new Error('The voice model isn’t installed yet. The user downloads it once on the Voices page (about 340 MB). Until then, set voiceover to false on this reel.');
  for (const v of [t.voice, t.blend].filter(Boolean)) if (!model.voices.includes(v)) throw new Error(`Voice "${v}" isn’t installed.`);
  opts.onStatus?.(say.slice(0, 40));
  const sep = model.dir.includes('\\') ? '\\' : '/';
  const url = (f: string): string => mediaUrl(`${model.dir}${sep}${f}`);
  // A deeper voice is the line spoken faster, then slowed back down to its length (and the other way round).
  const factor = Math.pow(2, t.pitch / 12);
  const spoken = spokenText(say);
  const raw = await run({
    text: spoken,
    speed: Math.min(2, Math.max(0.5, speed / factor)),
    modelUrl: url('model.onnx'),
    voiceUrl: url(`${t.voice}.bin`),
    ...(t.blend ? { blendUrl: url(`${t.blend}.bin`), blend: t.blendAmount } : {}),
    lexicon: lexiconFor(say),
  });
  const audio = await shape(raw, factor, t.warmth, t.clarity);
  return { file: await saveWav(name, [audio]), dur: audio.length / SAMPLE_RATE, key, made: true };
}

/** Silence below this (linear) at either end of an ElevenLabs line is trimmed to a short pad. */
const TRIM_BELOW = 0.01;
const PAD = 0.06;

/** One line bought from ElevenLabs, levelled like the rest and cached as a WAV under its key. */
/** Letters per second between the first and last spoken letter (from ElevenLabs' timings), or 0 if unknown. */
function paceOf(al: { chars: string[]; starts: number[]; ends: number[] } | undefined): number {
  if (!al) return 0;
  const idx = al.chars.map((c, i) => (/[\p{L}\p{N}]/u.test(c) ? i : -1)).filter((i) => i >= 0);
  if (idx.length < 15) return 0;
  const span = al.ends[idx[idx.length - 1]] - al.starts[idx[0]];
  return span > 0.3 ? idx.length / span : 0;
}

/** A line runs this much faster than the reel's usual pace before it is re-voiced (ElevenLabs often rushes the opening line). */
const PACE_RUSHED = 1.12;
/** Most lines re-voiced per reel for pace, so a bad day costs little. */
const PACE_RETAKES = 2;

/** When each word starts (seconds into the audio) from ElevenLabs' letter timings: a word starts at its first letter after a space. */
function wordStarts(al: { chars: string[]; starts: number[]; ends: number[] } | undefined): number[] {
  if (!al) return [];
  const out: number[] = [];
  let inWord = false;
  al.chars.forEach((c, i) => {
    const space = /\s/.test(c);
    if (!space && !inWord) out.push(al.starts[i] ?? 0);
    inWord = !space;
  });
  return out;
}

async function speakEleven(key: string, say: string, tune: VoiceTune, speed: number, prev: string, next: string): Promise<{ file: string; dur: number; pace: number; words?: number[]; note?: string }> {
  const r = await window.marketo.eleven.tts({ voice: tune.voice.slice(3), text: spokenText(say), speed, prev, next });
  if (!r.ok || !r.data) throw new Error(r.message ?? 'ElevenLabs failed.');
  const pace = paceOf(r.data.alignment);
  const buf = await new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE).decodeAudioData(r.data.audio.slice().buffer);
  let x = buf.getChannelData(0);
  let a = 0;
  let b = x.length - 1;
  while (a < b && Math.abs(x[a]) < TRIM_BELOW) a++;
  while (b > a && Math.abs(x[b]) < TRIM_BELOW) b--;
  const pad = Math.round(PAD * SAMPLE_RATE);
  const cut = Math.max(0, a - pad);
  x = x.slice(cut, Math.min(x.length, b + pad));
  const audio = await shape(x, 1, tune.warmth, tune.clarity);
  const dur = audio.length / SAMPLE_RATE;
  // Word starts moved by the trimmed silence, so captions and mouths follow the real voice.
  const words = wordStarts(r.data.alignment).map((s) => Math.round(Math.min(dur, Math.max(0, s - cut / SAMPLE_RATE)) * 1000) / 1000);
  return { file: await saveWav(`${key}.wav`, [audio]), dur, pace, ...(words.length ? { words } : {}), ...(r.data.note ? { note: r.data.note } : {}) };
}

let notes: string[] = [];
/** What happened with paid voices in the last build (budget fallbacks, errors), once. */
export function takeVoiceNotes(): string[] {
  const n = notes;
  notes = [];
  return n;
}

const pending = new Map<string, Promise<Reel>>();

/**
 * Make sure a story reel's soundtrack matches its beats: speak any new lines,
 * stretch beats to fit (via the cache field), and mix voice + effects.
 * Returns the reel as saved (unchanged when nothing was needed).
 */
export function ensureVoiceover(reel: Reel, onStatus?: (s: string) => void, opts: { final?: boolean } = {}): Promise<Reel> {
  const bedOn = BED_STYLES.includes(reel.fields.bed as BedStyle);
  if (!isVoiced(reel.preset) || (reel.fields.voiceover !== true && reel.fields.sfx !== true && !bedOn)) return Promise.resolve(reel);
  const tag = `${reel.id}:${opts.final ? 'final' : 'draft'}`;
  const running = pending.get(tag);
  if (running) return running;
  const p = build(reel, onStatus, !!opts.final).finally(() => pending.delete(tag));
  pending.set(tag, p);
  return p;
}

/** A final render stopped because its ElevenLabs lines could not be bought (the reel is held, never re-voiced). */
export class VoiceHeldError extends Error {}

/**
 * The ElevenLabs lines of a reel, bought for a final render. Lines already
 * bought are reused (cache or file). If any line can't be bought (after the
 * main process's retries), the render stops with VoiceHeldError: a reel is
 * never switched to the free voice or any other.
 */
async function buyEleven(reel: Reel, old: VoiceCache, onStatus?: (s: string) => void): Promise<VoiceCache['clips']> {
  const beats = storyBeats(reel.fields);
  const tune = cleanTune({ voice: String(reel.fields.voice ?? ''), speed: Number(reel.fields.voice_speed ?? 1), warmth: Number(reel.fields.voice_warmth ?? 0), clarity: Number(reel.fields.voice_clarity ?? 0) });
  const want = beats.filter((b) => b.elKey);
  if (!want.length || !isEleven(tune.voice)) return {};
  // Ask reels: the asker's lines are bought in the asker's voice.
  const tuneOf = (b: StoryBeat): VoiceTune => (b.elVoice && b.elVoice !== tune.voice ? cleanTune({ ...tune, voice: b.elVoice }) : tune);
  const got: VoiceCache['clips'] = {};
  let bought = 0;
  let credits = 0;
  const paces = new Map<number, number>();
  for (let i = 0; i < want.length; i++) {
    const b = want[i];
    if (got[b.elKey]) continue;
    const hit = old.clips[b.elKey];
    const file = await window.marketo.voice.find(`${b.elKey}.wav`);
    if (hit && file) {
      got[b.elKey] = hit;
      continue;
    }
    if (file) {
      got[b.elKey] = { file, dur: (await decode(file)).duration };
      continue;
    }
    onStatus?.(`ElevenLabs ${i + 1}/${want.length}: ${b.say.slice(0, 40)}`);
    try {
      const c = await speakEleven(b.elKey, b.say, tuneOf(b), tune.speed, want[i - 1]?.say ?? '', want[i + 1]?.say ?? '');
      got[b.elKey] = { file: c.file, dur: c.dur, ...(c.words ? { words: c.words } : {}) };
      if (c.pace) paces.set(i, c.pace);
      bought++;
      credits += b.say.length;
      if (c.note && !notes.includes(c.note)) notes.push(c.note);
    } catch (e) {
      // Never another voice in its place: the reel waits. Lines already bought stay saved and are reused next time.
      throw new VoiceHeldError(
        `Not rendered: ElevenLabs could not voice line ${i + 1} of ${want.length} in ${voiceName(tuneOf(b).voice)} (${(e as Error).message}). A reel is never switched to another voice, so it waits: render_reel it again later${bought ? ` (the ${bought} line${bought === 1 ? '' : 's'} bought this time ${bought === 1 ? 'is' : 'are'} kept)` : ''}. If it keeps failing, end the run's report with "NEEDS YOU: ElevenLabs is failing, reel not rendered" and do not post a stand-in.`,
      );
    }
  }
  // Even out the pace: a line well above the reel's usual pace (often the first) is voiced once more, slowed to match; the closer take wins.
  if (paces.size >= 3) {
    const sorted = [...paces.values()].sort((x, y) => x - y);
    const usual = sorted[Math.floor(sorted.length / 2)];
    const rushed = [...paces].filter(([, p]) => p > usual * PACE_RUSHED).sort((x, y) => y[1] - x[1]).slice(0, PACE_RETAKES);
    let evened = 0;
    for (const [i, p] of rushed) {
      const b = want[i];
      const speed = Math.min(1.2, Math.max(0.7, tune.speed * (usual / p)));
      onStatus?.(`ElevenLabs: evening out the pace of "${b.say.slice(0, 30)}"`);
      try {
        const c = await speakEleven(`${b.elKey}-p`, b.say, tuneOf(b), speed, want[i - 1]?.say ?? '', want[i + 1]?.say ?? '');
        credits += b.say.length;
        if (c.pace && Math.abs(c.pace - usual) < Math.abs(p - usual)) {
          got[b.elKey] = { file: c.file, dur: c.dur, ...(c.words ? { words: c.words } : {}) };
          evened++;
        }
      } catch {
        break; // keep the first take
      }
    }
    if (rushed.length) notes.push(`Evened out the pace of ${evened} of ${rushed.length} rushed line${rushed.length === 1 ? '' : 's'} (re-voiced once).`);
  }
  if (bought) notes.push(`${[...new Set(want.map((b) => voiceName(tuneOf(b).voice)))].join(' + ')}: bought ${bought} new line${bought === 1 ? '' : 's'} (about ${credits.toLocaleString()} characters).`);
  return got;
}

async function build(reel: Reel, onStatus?: (s: string) => void, final = false): Promise<Reel> {
  const old = readVoiceCache(reel.fields.vo_cache);
  if (final && reel.fields.voiceover === true) {
    const el = await buyEleven(reel, old, onStatus);
    if (Object.keys(el).length) {
      old.clips = { ...old.clips, ...el };
      reel = { ...reel, fields: { ...reel.fields, vo_cache: JSON.stringify(old) } };
    }
    // Every line was bought (buyEleven throws otherwise), so this render is in the reel's own voice.
    if (storyBeats(reel.fields).some((b) => b.elKey)) reel = { ...reel, fields: { ...reel.fields, voice_free: '' } };
  }
  const lines = storyBeats(reel.fields).filter((b) => b.key);
  const clips: VoiceCache['clips'] = {};
  let made = 0;
  for (const b of lines) {
    if (clips[b.key]) continue;
    const hit = old.clips[b.key];
    const file = await window.marketo.voice.find(`${b.key}.wav`);
    if (hit && file) {
      clips[b.key] = hit;
      continue;
    }
    if (file) {
      clips[b.key] = { file, dur: (await decode(file)).duration };
      continue;
    }
    const clip = await speakClip(b.say, b.tune, b.speed, { onStatus: (line) => onStatus?.(`Voice ${++made}: ${line}`) });
    clips[b.key] = { file: clip.file, dur: clip.dur };
  }

  // Bought ElevenLabs lines stay in the cache while their line is unchanged, even while
  // an edited line sends the reel back to the free voice: they were paid for.
  for (const b of storyBeats(reel.fields)) if (b.elKey && !clips[b.elKey] && old.clips[b.elKey]) clips[b.elKey] = old.clips[b.elKey];
  const fields: Fields = { ...reel.fields, vo_cache: JSON.stringify({ clips } satisfies VoiceCache) };
  const sig = storyVoiceSig(fields);
  let track = old.sig === sig && old.track && (await window.marketo.voice.find(`track-${sig}.wav`)) ? old.track : null;
  if (!track) {
    onStatus?.(BED_STYLES.includes(fields.bed as BedStyle) ? `Mixing voice, effects and ${fields.bed} music` : 'Mixing voice and effects');
    const total = timingFor(reel.preset, fields).total;
    const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(total * MIX_RATE)), MIX_RATE);
    const gain = ctx.createGain();
    gain.gain.value = num(fields, 'voice_volume', 1);
    gain.connect(ctx.destination);
    const beats = storyBeats(fields);
    if (fields.sfx === true) {
      const events = storySfx(beats, fields);
      const vol = num(fields, 'sfx_volume', 0.5) * 0.9;
      scheduleSfx(ctx, ctx.destination, events, vol);
      await scheduleSamples(ctx, ctx.destination, events, vol, reel.id);
      for (const e of events) if (e.kind === 'roomtone') scheduleRoomTone(ctx, ctx.destination, e.t, e.dur ?? 2, vol * (e.gain ?? 1));
    }
    const style = fields.bed as BedStyle;
    if (BED_STYLES.includes(style)) {
      const speech: Array<[number, number]> = [];
      for (const b of beats) {
        const c = b.key ? clips[b.key] : undefined;
        if (c && fields.voiceover === true) speech.push([b.start + b.voStart, b.start + b.voStart + c.dur]);
      }
      const bed = ctx.createBufferSource();
      bed.buffer = await renderBed(style, total, seedOf(reel.id), MIX_RATE, num(fields, 'bpm', 0));
      bed.connect(duckGain(ctx, num(fields, 'bed_volume', 0.6), speech)).connect(ctx.destination);
      bed.start(0);
    }
    for (const b of beats) {
      const c = b.key ? clips[b.key] : undefined;
      if (!c) continue;
      // Level every line to the same loudness (Kokoro voices and lines differ).
      const buf = await decode(c.file);
      const x = buf.getChannelData(0);
      let sum = 0;
      let peak = 0;
      for (const v of x) {
        sum += v * v;
        peak = Math.max(peak, Math.abs(v));
      }
      const rms = Math.sqrt(sum / Math.max(1, x.length));
      const level = ctx.createGain();
      level.gain.value = rms > 0 ? Math.min(TARGET_RMS / rms, 0.95 / peak) : 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(level).connect(gain);
      src.start(b.start + b.voStart);
    }
    const out = await ctx.startRendering();
    const chans = [out.getChannelData(0), out.getChannelData(1)];
    let peak = 0;
    for (const c of chans) for (const v of c) peak = Math.max(peak, Math.abs(v));
    if (peak > 0.97) for (const c of chans) for (let i = 0; i < c.length; i++) c[i] *= 0.97 / peak;
    track = await saveWav(`track-${sig}.wav`, chans, MIX_RATE);
  }
  const vo_cache = JSON.stringify({ clips, track, sig } satisfies VoiceCache);
  if (vo_cache === reel.fields.vo_cache && !final) return reel;
  const r = await window.marketo.db.updateReel(reel.id, { fields: { vo_cache, ...(final ? { voice_free: reel.fields.voice_free ?? '' } : {}) } });
  if (!r.ok || !r.data) throw new Error(r.message ?? 'Saving the voice-over failed.');
  return r.data;
}
