import { ALL_FORMATS, AudioBufferSink, Input, UrlSource } from 'mediabunny';
import type { WhisperStatus } from '@shared/types';
import { mediaUrl } from '../media';
import type { ModelUrls, RawSegment, WorkerOut } from './whisperWorker';

// Captions for stream clips: on-device Whisper (whisperWorker.ts) over the
// clip's own sound. The page decodes the audio (WebAudio, or mediabunny for
// containers Chromium does not read, like Twitch's MPEG-TS) to 16 kHz mono,
// the worker returns timed segments, and this file drops what Whisper makes
// up on silence, spreads each segment's words over its time and cuts them
// into short caption lines for the clip reel (src/render/presets/clip.ts).
// The model (about 137 MB) downloads on first use (electron/whisper.ts).

export interface Transcript {
  language: string;
  segments: Array<{ start: number; end: number; text: string }>;
  words: Array<{ start: number; end: number; text: string }>;
}

export interface TranscribeOptions {
  /** Part of the file to transcribe, in seconds (default: all of it). Times in the result stay file times. */
  from?: number;
  to?: number;
  onProgress?: (fraction: number, message: string) => void;
}

const RATE = 16000;
/** The worker (and its ~400 MB of model) is let go after this long without work. */
const IDLE_MS = 90_000;

// ── Model ──────────────────────────────────────────────────────────────────
const mb = (n: number): number => Math.round(n / 1e6);

/** The model folder, downloading the model first when it is not there yet. */
async function ensureModel(onProgress: (fraction: number, message: string) => void): Promise<string> {
  const api = window.marketo.whisper;
  const now = await api.status();
  if (now.installed && now.dir) return now.dir;
  const done = await new Promise<WhisperStatus>((resolve, reject) => {
    let settled = false;
    const finish = (s: WhisperStatus): void => {
      if (settled) return;
      if (s.installed && s.dir) {
        settled = true;
        off();
        resolve(s);
      } else if (!s.installing && s.error) {
        settled = true;
        off();
        reject(new Error(`Couldn't download the speech-to-text model: ${s.error}`));
      } else if (s.installing) {
        onProgress(s.total ? s.done / s.total : 0, `Downloading the speech-to-text model (${mb(s.done)} of ${mb(s.total)} MB)…`);
      }
    };
    // Subscribe before starting, so the last update cannot slip past.
    const off = api.onStatus(finish);
    onProgress(0, `Downloading the speech-to-text model (${mb(now.total)} MB, once)…`);
    void api
      .install()
      .then(() => api.status())
      .then(finish)
      .catch((e: Error) => {
        if (settled) return;
        settled = true;
        off();
        reject(e);
      });
  });
  return done.dir!;
}

const modelUrls = (dir: string): ModelUrls => {
  const f = (name: string): string => mediaUrl(`${dir}/${name}`);
  return {
    encoder: f('encoder_model.onnx'),
    decoder: f('decoder_model_merged_quantized.onnx'),
    vocab: f('vocab.json'),
    config: f('config.json'),
    generation: f('generation_config.json'),
  };
};

// ── Audio ──────────────────────────────────────────────────────────────────
function mono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += ch[i];
  }
  for (let i = 0; i < out.length; i++) out[i] /= buf.numberOfChannels;
  return out;
}

/** Mono PCM at `rate` -> 16 kHz (WebAudio's resampler, band-limited). */
async function to16k(pcm: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === RATE) return pcm;
  const ctx = new OfflineAudioContext(1, Math.max(1, Math.ceil((pcm.length * RATE) / rate)), RATE);
  const buf = ctx.createBuffer(1, pcm.length, rate);
  buf.getChannelData(0).set(pcm);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
  return (await ctx.startRendering()).getChannelData(0);
}

/** For files WebAudio cannot open (MPEG-TS stream segments, odd codecs): mediabunny + WebCodecs, only the part asked for. */
async function decodeWithMediabunny(path: string, from: number, to: number | undefined): Promise<{ pcm: Float32Array; start: number }> {
  const input = new Input({ source: new UrlSource(mediaUrl(path)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error('That clip has no sound to caption.');
    if (!(await track.canDecode())) throw new Error("This clip's audio codec can't be decoded here.");
    // MPEG-TS clocks rarely start at 0 (ffmpeg starts at 1.4 s, Twitch segments mid-stream): times here are from the file's own start.
    const t0 = await input.getFirstTimestamp();
    const end = to ?? (await track.computeDuration()) - t0;
    const rate = track.sampleRate;
    const out = new Float32Array(Math.max(1, Math.ceil((end - from) * rate)));
    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(t0 + from, t0 + end)) {
      const pcm = mono(buffer);
      const at = Math.round((timestamp - t0 - from) * rate);
      for (let i = Math.max(0, -at); i < pcm.length && at + i < out.length; i++) out[at + i] = pcm[i];
    }
    return { pcm: await to16k(out, rate), start: from };
  } finally {
    input.dispose();
  }
}

/** The clip's sound from `from` to `to` (seconds) as 16 kHz mono. */
async function loadAudio(path: string, from: number, to: number | undefined): Promise<{ pcm: Float32Array; start: number }> {
  const res = await fetch(mediaUrl(path));
  if (!res.ok) throw new Error(`Couldn't read the clip (${res.status}).`);
  // WebAudio decodes the whole file; for a long recording, decode only the part asked for.
  if (Number(res.headers.get('content-length')) > 300e6) {
    void res.body?.cancel();
    return decodeWithMediabunny(path, from, to);
  }
  let buf: AudioBuffer;
  try {
    // A 16 kHz context makes decodeAudioData resample on the way in.
    buf = await new OfflineAudioContext(1, RATE, RATE).decodeAudioData(await res.arrayBuffer());
  } catch {
    return decodeWithMediabunny(path, from, to);
  }
  const pcm = mono(buf);
  const a = Math.min(pcm.length, Math.max(0, Math.round(from * RATE)));
  const b = to === undefined ? pcm.length : Math.min(pcm.length, Math.max(a, Math.round(to * RATE)));
  return { pcm: pcm.slice(a, b), start: a / RATE };
}

// ── Worker ─────────────────────────────────────────────────────────────────
let worker: Worker | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function runWorker(audio: Float32Array, urls: ModelUrls, onProgress: (f: number, m: string) => void): Promise<{ language: string; segments: RawSegment[]; backend: string }> {
  const job = (): Promise<{ language: string; segments: RawSegment[]; backend: string }> =>
    new Promise((resolve, reject) => {
      if (idle) clearTimeout(idle);
      const w = (worker ??= new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' }));
      const release = (): void => {
        idle = setTimeout(() => {
          if (worker === w) {
            w.terminate();
            worker = null;
          }
        }, IDLE_MS);
      };
      w.onmessage = (e: MessageEvent<WorkerOut>) => {
        const m = e.data;
        if (m.type === 'progress') onProgress(m.fraction, m.message);
        else if (m.type === 'done') {
          release();
          resolve(m);
        } else if (m.type === 'error') {
          release();
          reject(new Error(m.message || 'Transcription failed.'));
        }
      };
      w.onerror = (e) => {
        w.terminate();
        if (worker === w) worker = null;
        reject(new Error(e.message || 'The speech-to-text worker crashed.'));
      };
      w.postMessage({ type: 'run', audio, urls }, [audio.buffer]);
    });
  const p = queue.then(job, job);
  queue = p.catch(() => undefined);
  return p;
}

// ── Cleaning up what Whisper invents ───────────────────────────────────────
// Whisper was trained on subtitled video, so on silence or noise it tends to
// "hear" the lines that end videos. Those are dropped when the audio under
// them is quiet; anything on near-silence is dropped whatever it says.

const STOCK = new Set(
  [
    'you',
    'thank you',
    'thanks',
    'thank you so much',
    'thank you very much',
    'thanks for watching',
    'thank you for watching',
    'thank you for watching please subscribe',
    'please subscribe',
    'subscribe',
    'like and subscribe',
    'see you next time',
    'see you in the next video',
    'bye',
    'bye bye',
    'so',
    'okay',
    'oh',
    'hmm',
    'music',
    'applause',
    'silence',
    'subtitles by the amaraorg community',
    'продолжение следует',
    'спасибо за внимание',
    'ご視聴ありがとうございました',
    'untertitel der amaraorg community',
    'untertitel im auftrag des zdf für funk 2017',
    'soustitres réalisés par la communauté damaraorg',
    'gracias',
    'gracias por ver',
    'obrigado',
    'merci',
    'danke',
  ].map((s) => s.normalize('NFKC')),
);

const norm = (s: string): string =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Loudness of the speech-ish part of a stretch: the 90th percentile of 30 ms RMS frames. */
function loudness(pcm: Float32Array, a: number, b: number): number {
  const frame = Math.round(0.03 * RATE);
  const from = Math.max(0, Math.floor(a * RATE));
  const to = Math.min(pcm.length, Math.ceil(b * RATE));
  const rms: number[] = [];
  for (let i = from; i + frame <= to; i += frame) {
    let s = 0;
    for (let j = i; j < i + frame; j++) s += pcm[j] * pcm[j];
    rms.push(Math.sqrt(s / frame));
  }
  if (!rms.length) return 0;
  rms.sort((x, y) => x - y);
  return rms[Math.floor(rms.length * 0.9)];
}

/** About -50 dBFS: nothing anyone would caption. */
const SILENT = 0.003;

function keep(seg: RawSegment, pcm: Float32Array, start: number, clipLevel: number): boolean {
  const text = norm(seg.text);
  // Only punctuation, or nothing but [Music] / (applause) / *laughs* / ♪ lyrics ♪ tags.
  if (!text || /^(\s*(\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪[^♪]*♪|♪+))+\s*$/u.test(seg.text)) return false;
  const level = loudness(pcm, seg.start - start, seg.end - start);
  if (level < SILENT) return false;
  // A stock line well under the clip's own speech level (20 dB down), or a confident "no speech".
  if (STOCK.has(text) && (level < clipLevel * 0.1 || seg.noSpeech > 0.5)) return false;
  return true;
}

// ── Words ──────────────────────────────────────────────────────────────────
/** Languages written without spaces: their "words" are short runs of characters. */
const NO_SPACES = new Set(['zh', 'ja', 'th', 'lo', 'km', 'my', 'bo']);

function splitWords(text: string, language: string): string[] {
  const parts = text.split(/\s+/).filter(Boolean);
  if (!NO_SPACES.has(language)) return parts;
  const out: string[] = [];
  for (const p of parts) {
    // Break after punctuation, else every 4 characters.
    let cur = '';
    for (const ch of p) {
      cur += ch;
      if (/[\p{P}]/u.test(ch) || [...cur].length >= 4) {
        out.push(cur);
        cur = '';
      }
    }
    if (cur) {
      if (out.length && /^[\p{P}]+$/u.test(cur)) out[out.length - 1] += cur;
      else out.push(cur);
    }
  }
  return out;
}

// ── Where the speech is ────────────────────────────────────────────────────
// Whisper's segment times are only as fine as its timestamp tokens, and a
// segment after a silence usually starts where the silence starts (eight
// seconds of nothing, then a line: the line is stamped from 0). So each
// segment is shrunk to the 20 ms frames that carry speech, and its words are
// spread over those frames only, not over the pauses between sentences.
// "Speech" here is loudness in the voice band (250-3500 Hz, so game rumble
// and music bass do not count) above the clip's own background level.

const FRAME = 0.02;
const FRAME_LEN = Math.round(FRAME * RATE);

interface Speech {
  /** RMS of each 20 ms frame of the voice band, from the start of the decoded audio. */
  rms: Float32Array;
  /** The clip's background: its quietest tenth of frames. */
  floor: number;
}

async function speechOf(pcm: Float32Array): Promise<Speech> {
  const ctx = new OfflineAudioContext(1, pcm.length, RATE);
  const buf = ctx.createBuffer(1, pcm.length, RATE);
  buf.getChannelData(0).set(pcm);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 250;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3500;
  src.connect(hp).connect(lp).connect(ctx.destination);
  src.start(0);
  const band = (await ctx.startRendering()).getChannelData(0);
  const n = Math.floor(band.length / FRAME_LEN);
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let s = 0;
    for (let j = f * FRAME_LEN, end = j + FRAME_LEN; j < end; j++) s += band[j] * band[j];
    rms[f] = Math.sqrt(s / FRAME_LEN);
  }
  const sorted = Float32Array.from(rms).sort();
  return { rms, floor: sorted[Math.floor(n * 0.1)] ?? 0 };
}

/**
 * Indices (from `a`) of the 20 ms frames in a..b (seconds into the decoded
 * audio) that carry speech: within 20 dB of the stretch's loud part and well
 * over the background, short gaps between words filled, lone clicks dropped.
 */
function voicedFrames(sp: Speech, a: number, b: number): number[] {
  const first = Math.max(0, Math.round(a / FRAME));
  const rms = sp.rms.subarray(first, Math.max(first, Math.min(sp.rms.length, Math.round(b / FRAME))));
  const n = rms.length;
  const sorted = Float32Array.from(rms).sort();
  const thr = Math.max(SILENT / 2, (sorted[Math.floor(n * 0.9)] ?? 0) * 0.1, sp.floor * 2.5);
  const on = Array.from(rms, (v) => v >= thr);
  // Gaps under 0.25 s are the space between words, not a pause.
  for (let f = 0, last = -1; f < n; f++) {
    if (!on[f]) continue;
    if (last >= 0 && f - last - 1 < 12) for (let g = last + 1; g < f; g++) on[g] = true;
    last = f;
  }
  // Sound under 60 ms on its own is a click or a breath.
  for (let f = 0; f < n; ) {
    if (!on[f]) {
      f++;
      continue;
    }
    let e = f;
    while (e < n && on[e]) e++;
    if (e - f < 3) for (let g = f; g < e; g++) on[g] = false;
    f = e;
  }
  const out: number[] = [];
  on.forEach((v, f) => v && out.push(f));
  return out;
}

/** The segment shrunk to its speech (never grown), with a little air on both sides. `offset` = file time of the decoded audio's start. */
function tighten<T extends { start: number; end: number }>(seg: T, sp: Speech, offset: number): T {
  const v = voicedFrames(sp, seg.start - offset, seg.end - offset);
  if (!v.length) return seg;
  const start = Math.max(seg.start, seg.start + v[0] * FRAME - 0.05);
  const end = Math.min(seg.end, seg.start + (v[v.length - 1] + 1) * FRAME + 0.05);
  return end > start ? { ...seg, start, end } : seg;
}

/** Each word gets a share of its segment's speaking time in proportion to its length (no forced alignment). */
function wordsOf(seg: { start: number; end: number; text: string }, language: string, sp: Speech, offset: number): Transcript['words'] {
  const words = splitWords(seg.text, language);
  // A space's worth per word, so short words still get a moment.
  const weight = words.map((w) => [...w].length + 1);
  const total = weight.reduce((a, b) => a + b, 0);
  const v = voicedFrames(sp, seg.start - offset, seg.end - offset);
  // Fraction of the segment's speech -> time.
  const at = (f: number): number => {
    if (!v.length) return seg.start + (seg.end - seg.start) * f;
    if (f >= 1) return Math.min(seg.end, seg.start + (v[v.length - 1] + 1) * FRAME);
    const x = f * v.length;
    const k = Math.floor(x);
    return seg.start + (v[k] + (x - k)) * FRAME;
  };
  let acc = 0;
  return words.map((text, i) => {
    const start = at(acc / total);
    acc += weight[i];
    return { start: round(start), end: round(at(acc / total)), text };
  });
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

// ── API ────────────────────────────────────────────────────────────────────
/**
 * Transcribe a clip's speech on this computer. `path` is any audio or video
 * file the hub can read (mp4, ts, wav...). Downloads the model first if needed.
 */
export async function transcribeFile(path: string, opts: TranscribeOptions = {}): Promise<Transcript> {
  const report = opts.onProgress ?? (() => {});
  const from = Math.max(0, opts.from ?? 0);
  // A download (first use only) is the first half of the bar.
  const base = (await window.marketo.whisper.status()).installed ? 0 : 0.5;
  const dir = await ensureModel((f, m) => report(f * 0.5, m));
  const scaled = (f: number, m: string): void => report(base + (1 - base) * f, m);
  scaled(0, 'Reading the clip’s sound…');
  const to = opts.to ?? Infinity;
  // A range cut mid-word makes Whisper guess at the cut word, so it hears 1.5 s past the end; only the words inside are kept.
  // (No lead-in before `from`: Whisper folds a cut word into its first segment and that skews the word times.)
  const ranged = from > 0 || opts.to !== undefined;
  const { pcm, start } = await loadAudio(path, from, opts.to === undefined ? undefined : opts.to + 1.5);
  if (pcm.length < RATE * 0.2) return { language: 'en', segments: [], words: [] };
  const clipLevel = loudness(pcm, 0, pcm.length / RATE);
  // The worker takes ownership of what it is sent, and the filter below still needs the samples.
  const raw = await runWorker(pcm.slice(), modelUrls(dir), (f, m) => scaled(0.05 + 0.95 * f, m));
  const speech = await speechOf(pcm);
  const segments: Transcript['segments'] = [];
  const words: Transcript['words'] = [];
  for (const s of raw.segments) {
    const seg = { ...s, start: s.start + start, end: s.end + start };
    if (!keep(seg, pcm, start, clipLevel)) continue;
    const tight = tighten(seg, speech, start);
    let ws = wordsOf(tight, raw.language, speech, start);
    // A word counts when its (estimated) end is inside: the estimate is a few hundred ms off at worst.
    if (ranged) ws = ws.filter((w) => w.end > from + 0.05 && w.start < to);
    if (!ws.length) continue;
    const text = ranged ? ws.map((w) => w.text).join(NO_SPACES.has(raw.language) ? '' : ' ') : tight.text;
    segments.push({ start: round(Math.max(tight.start, ws[0].start)), end: round(Math.min(tight.end, to, ws[ws.length - 1].end)), text });
    words.push(...ws);
  }
  return { language: raw.language, segments, words };
}

/** Short punchy caption lines for the clip reel: about maxWords words each (never across a sentence end), as "start | text" lines, times relative to `from`. */
export function captionLines(t: Transcript, opts: { maxWords?: number; from?: number; to?: number } = {}): string {
  const max = Math.max(1, Math.round(opts.maxWords ?? 3));
  const from = opts.from ?? 0;
  const to = opts.to ?? Infinity;
  const words = t.words.filter((w) => w.end > from + 0.05 && w.start < to && w.text.trim());
  // Runs of words with no sentence end and no real pause inside.
  const runs: Array<typeof words> = [];
  let cur: typeof words = [];
  words.forEach((w, i) => {
    const prev = words[i - 1];
    if (cur.length && prev && w.start - prev.end > 0.7) {
      runs.push(cur);
      cur = [];
    }
    cur.push(w);
    if (/[.!?…。！？]["'”’)\]]*$/u.test(w.text)) {
      runs.push(cur);
      cur = [];
    }
  });
  if (cur.length) runs.push(cur);
  const lines: string[] = [];
  runs.forEach((run, r) => {
    // Even line lengths (5 words at 3 a line = 3 + 2, not 3 + 1 + ...).
    const n = Math.ceil(run.length / max);
    let i = 0;
    for (let k = 0; k < n; k++) {
      const size = Math.ceil((run.length - i) / (n - k));
      const part = run.slice(i, i + size);
      i += size;
      const at = Math.max(0, Math.round((part[0].start - from) * 100) / 100);
      const sep = NO_SPACES.has(t.language) ? '' : ' ';
      lines.push(`${at} | ${part.map((w) => w.text.replace(/[\r\n]+/g, ' ')).join(sep)}`);
    }
    // A pause before the next words: the last line clears half a second after it is said ("start |" with no text).
    const last = run[run.length - 1];
    const next = runs[r + 1]?.[0];
    const off = last.end + 0.5;
    if (!next || next.start - off > 0.4) lines.push(`${Math.max(0, Math.round((off - from) * 100) / 100)} |`);
  });
  return lines.join('\n');
}
