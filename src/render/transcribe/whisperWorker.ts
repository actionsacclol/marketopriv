/// <reference lib="webworker" />
/**
 * Whisper speech to text in a Web Worker (ONNX Runtime, like the Kokoro voice
 * worker): log-mel features (mel.ts), the encoder once per 30 s window, then
 * the merged decoder one token at a time with its KV cache. It follows
 * openai/whisper's own long-form loop (transcribe.py / decoding.py) so the
 * output behaves the same: language detected from the first window, the
 * spoken language transcribed (never translated), timestamp tokens on with
 * Whisper's timestamp rules so segment start / end pairs line up, greedy
 * decoding with the temperature fallback when a window loops or is unsure,
 * the no-speech check, and windows advanced to the last complete segment.
 *
 * Input is 16 kHz mono PCM (the page decodes the clip, src/render/transcribe/index.ts);
 * output is segments in seconds from the start of that audio. The sessions
 * stay loaded between requests; the caller terminates the worker to cancel.
 */
import * as ort from 'onnxruntime-web';
import ortWasmUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import ortMjsUrl from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import { HOP, logMel, N_FRAMES, N_MELS, N_SAMPLES, SAMPLE_RATE } from './mel';
import { Tokenizer } from './tokenizer';

export interface ModelUrls {
  encoder: string;
  decoder: string;
  vocab: string;
  config: string;
  generation: string;
}

interface RunMessage {
  type: 'run';
  audio: Float32Array;
  urls: ModelUrls;
}

export interface RawSegment {
  start: number;
  end: number;
  text: string;
  /** Mean log-probability of the window's tokens and its no-speech probability (for the silence filter). */
  avgLogprob: number;
  noSpeech: number;
}

export type WorkerOut =
  | { type: 'progress'; fraction: number; message: string }
  | { type: 'done'; language: string; segments: RawSegment[]; backend: string }
  | { type: 'error'; message: string };

const post = (m: WorkerOut): void => self.postMessage(m);

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
// Threads need a cross-origin isolated page (SharedArrayBuffer); the hub is not one, so this is 1 there.
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

/** 30 s window = 1500 encoder positions; one timestamp step is 0.02 s = 320 samples. */
const TS_SAMPLES = 2 * HOP;
/** Whisper's sample_len: at most half the decoder context per window. */
const MAX_TOKENS = 224;
const TEMPERATURES = [0, 0.4, 0.8];
const COMPRESSION_LIMIT = 2.4;
const LOGPROB_LIMIT = -1;
const NO_SPEECH_LIMIT = 0.6;

interface Model {
  key: string;
  encoder: ort.InferenceSession;
  encoderBackend: string;
  decoder: ort.InferenceSession;
  tok: Tokenizer;
  heads: number;
  headDim: number;
  vocabSize: number;
  sot: number;
  eot: number;
  transcribe: number;
  noTimestamps: number;
  noSpeech: number;
  tsBegin: number;
  /** language token id -> code ("en"). */
  languages: Map<number, string>;
  suppress: number[];
  beginSuppress: number[];
}

let model: Model | null = null;
let decoderLevel = '';

async function fetchBytes(url: string, what: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't read the ${what} (HTTP ${res.status}).`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchJson<T>(url: string, what: string): Promise<T> {
  return JSON.parse(new TextDecoder().decode(await fetchBytes(url, what))) as T;
}

async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function encoderSession(bytes: Uint8Array, gpu: boolean): Promise<ort.InferenceSession> {
  return ort.InferenceSession.create(bytes, gpu ? { executionProviders: ['webgpu'] } : { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

/**
 * The 8-bit decoder. ORT's QDQ rewrites trip over this export's quantized
 * embedding ("Missing required scale ... TransposeDQWeightsForMatMulNBits").
 * Turning them off also lets constant folding dequantize that 51865 x 512
 * table once at load, instead of on every token (about 10x faster per token).
 * Plainer levels stay as a fallback for other ORT builds.
 */
async function decoderSession(bytes: Uint8Array): Promise<ort.InferenceSession> {
  let error: unknown;
  const tries: Array<[string, ort.InferenceSession.SessionOptions]> = [
    ['all, no QDQ', { graphOptimizationLevel: 'all', extra: { session: { disable_quant_qdq: '1' } } }],
    ['all', { graphOptimizationLevel: 'all' }],
    ['basic', { graphOptimizationLevel: 'basic' }],
  ];
  for (const [level, options] of tries) {
    try {
      const s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], ...options });
      decoderLevel = level;
      return s;
    } catch (e) {
      error = e;
    }
  }
  throw error;
}

async function load(urls: ModelUrls): Promise<Model> {
  const key = urls.encoder + urls.decoder;
  if (model?.key === key) return model;
  await model?.encoder.release();
  await model?.decoder.release();
  model = null;
  post({ type: 'progress', fraction: 0, message: 'Loading the speech model…' });
  const [config, gen, vocab] = await Promise.all([
    fetchJson<{ decoder_attention_heads: number; d_model: number; vocab_size: number }>(urls.config, 'model settings'),
    fetchJson<{
      lang_to_id: Record<string, number>;
      task_to_id: Record<string, number>;
      suppress_tokens: number[];
      begin_suppress_tokens: number[];
      no_timestamps_token_id: number;
      decoder_start_token_id: number;
      eos_token_id: number;
    }>(urls.generation, 'model settings'),
    fetchJson<Record<string, number>>(urls.vocab, 'tokenizer'),
  ]);
  const [encBytes, decBytes] = await Promise.all([fetchBytes(urls.encoder, 'speech model'), fetchBytes(urls.decoder, 'speech model')]);
  // The encoder is one big full-precision pass per window: the GPU when there is one.
  // The decoder is 8-bit and runs one token at a time, which the CPU does well.
  let encoder: ort.InferenceSession;
  let encoderBackend = 'wasm';
  if (await hasWebGpu()) {
    try {
      encoder = await encoderSession(encBytes, true);
      encoderBackend = 'webgpu';
    } catch {
      encoder = await encoderSession(encBytes, false);
    }
  } else encoder = await encoderSession(encBytes, false);
  const decoder = await decoderSession(decBytes);
  for (const want of ['input_ids', 'encoder_hidden_states', 'use_cache_branch'])
    if (!decoder.inputNames.includes(want)) throw new Error(`The speech model is not a merged Whisper decoder (no input '${want}').`);
  const languages = new Map<number, string>();
  for (const [tok, id] of Object.entries(gen.lang_to_id)) languages.set(id, tok.replace(/^<\||\|>$/g, ''));
  const eot = gen.eos_token_id;
  const noTimestamps = gen.no_timestamps_token_id;
  const sot = gen.decoder_start_token_id;
  // Every special token after <|endoftext|> up to <|notimestamps|> (start, languages, tasks, no-speech...) is never text.
  const special: number[] = [];
  for (let id = eot + 1; id <= noTimestamps; id++) special.push(id);
  model = {
    key,
    encoder,
    encoderBackend,
    decoder,
    tok: new Tokenizer(vocab),
    heads: config.decoder_attention_heads,
    headDim: config.d_model / config.decoder_attention_heads,
    vocabSize: config.vocab_size,
    sot,
    eot,
    transcribe: gen.task_to_id.transcribe,
    noTimestamps,
    noSpeech: noTimestamps - 1,
    tsBegin: noTimestamps + 1,
    languages,
    suppress: [...new Set([...gen.suppress_tokens, ...special])],
    beginSuppress: gen.begin_suppress_tokens,
  };
  return model;
}

// ── Decoder with KV cache ──────────────────────────────────────────────────
type Cache = Record<string, ort.Tensor>;

function emptyCache(m: Model): Cache {
  const cache: Cache = {};
  for (const name of m.decoder.inputNames) if (name.startsWith('past_key_values.')) cache[name] = new ort.Tensor('float32', new Float32Array(0), [1, m.heads, 0, m.headDim]);
  return cache;
}

/** Feed `ids` after `cache`; returns the logits of the last position and the grown cache. */
async function step(m: Model, enc: ort.Tensor, ids: number[], cache: Cache, first: boolean): Promise<{ logits: Float32Array; cache: Cache }> {
  const out = await m.decoder.run({
    input_ids: new ort.Tensor('int64', BigInt64Array.from(ids, (v) => BigInt(v)), [1, ids.length]),
    encoder_hidden_states: enc,
    use_cache_branch: new ort.Tensor('bool', Uint8Array.of(first ? 0 : 1), [1]),
    ...cache,
  });
  const next: Cache = { ...cache };
  for (const [name, t] of Object.entries(out)) {
    if (!name.startsWith('present.')) continue;
    // The cross-attention keys / values depend only on the audio: keep the ones from the first step.
    if (!first && name.includes('.encoder.')) continue;
    next[name.replace(/^present\./, 'past_key_values.')] = t;
  }
  const all = out.logits.data as Float32Array;
  const v = m.vocabSize;
  return { logits: all.slice(all.length - v), cache: next };
}

function logSoftmax(x: Float32Array): Float32Array {
  let max = -Infinity;
  for (const v of x) if (v > max) max = v;
  let sum = 0;
  for (const v of x) sum += Math.exp(v - max);
  const lse = max + Math.log(sum);
  const out = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) out[i] = x[i] - lse;
  return out;
}

/** Whisper's logit filters for the next token, given the tokens sampled so far in this window. */
function filterLogits(m: Model, logits: Float32Array, seq: number[]): void {
  const { tsBegin, eot } = m;
  for (const id of m.suppress) logits[id] = -Infinity;
  if (seq.length === 0) for (const id of m.beginSuppress) logits[id] = -Infinity;
  // ApplyTimestampRules.
  logits[m.noTimestamps] = -Infinity;
  const n = seq.length;
  const lastTs = n >= 1 && seq[n - 1] >= tsBegin;
  const penultTs = n < 2 || seq[n - 2] >= tsBegin;
  if (lastTs) {
    // Timestamps come in pairs: after a lone one, either its partner or text follows.
    if (penultTs) for (let i = tsBegin; i < logits.length; i++) logits[i] = -Infinity;
    else for (let i = 0; i < eot; i++) logits[i] = -Infinity;
  }
  const stamps = seq.filter((t) => t >= tsBegin);
  if (stamps.length) {
    // Never go back in time, and give every segment some length.
    const floor = lastTs && !penultTs ? stamps[stamps.length - 1] : stamps[stamps.length - 1] + 1;
    for (let i = tsBegin; i < floor; i++) logits[i] = -Infinity;
  }
  if (n === 0) {
    // A window starts with a timestamp, at most 1 s in.
    for (let i = 0; i < tsBegin; i++) logits[i] = -Infinity;
    for (let i = tsBegin + 50 + 1; i < logits.length; i++) logits[i] = -Infinity;
  }
  // When the timestamps together are likelier than any single text token, take a timestamp.
  const lp = logSoftmax(logits);
  let tsMass = -Infinity;
  for (let i = tsBegin; i < lp.length; i++) {
    const v = lp[i];
    if (v === -Infinity) continue;
    tsMass = tsMass === -Infinity ? v : Math.max(tsMass, v) + Math.log1p(Math.exp(-Math.abs(tsMass - v)));
  }
  let textMax = -Infinity;
  for (let i = 0; i < tsBegin; i++) if (lp[i] > textMax) textMax = lp[i];
  if (tsMass > textMax) for (let i = 0; i < tsBegin; i++) logits[i] = -Infinity;
}

function pick(logits: Float32Array, temperature: number): number {
  if (temperature === 0) {
    let best = 0;
    for (let i = 1; i < logits.length; i++) if (logits[i] > logits[best]) best = i;
    return best;
  }
  let max = -Infinity;
  for (const v of logits) if (v > max) max = v;
  const p = new Float64Array(logits.length);
  let sum = 0;
  for (let i = 0; i < logits.length; i++) sum += p[i] = Math.exp((logits[i] - max) / temperature);
  let r = Math.random() * sum;
  for (let i = 0; i < p.length; i++) if ((r -= p[i]) <= 0) return i;
  return p.length - 1;
}

async function compressionRatio(text: string): Promise<number> {
  const raw = new TextEncoder().encode(text);
  if (!raw.length) return 0;
  const zipped = await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer();
  return raw.length / zipped.byteLength;
}

interface Attempt {
  tokens: number[];
  avgLogprob: number;
  ratio: number;
}

/** One decode of a window from the prompt's cache, with Whisper's quality checks. */
async function decodeWindow(m: Model, enc: ort.Tensor, start: { logits: Float32Array; cache: Cache }, temperature: number): Promise<Attempt> {
  const seq: number[] = [];
  let sum = 0;
  let { logits, cache } = start;
  for (let i = 0; i < MAX_TOKENS; i++) {
    const l = logits.slice();
    filterLogits(m, l, seq);
    const t = pick(l, temperature);
    sum += logSoftmax(l)[t];
    if (t === m.eot) break;
    seq.push(t);
    if (i === MAX_TOKENS - 1) break;
    ({ logits, cache } = await step(m, enc, [t], cache, false));
  }
  const text = m.tok.decode(seq.filter((t) => t < m.eot));
  return { tokens: seq, avgLogprob: sum / (seq.length + 1), ratio: await compressionRatio(text) };
}

async function run({ audio, urls }: RunMessage): Promise<void> {
  const m = await load(urls);
  const total = audio.length;
  const segments: RawSegment[] = [];
  let language: string | null = null;
  let seek = 0;
  // A tail shorter than this is not worth a window (Whisper would only hallucinate on it).
  const minTail = Math.round(0.2 * SAMPLE_RATE);
  // Windows normally move 10-30 s at a time; this only stops a model that keeps cutting its segments short from crawling.
  let windowsLeft = Math.ceil(total / N_SAMPLES) * 4 + 2;
  while (seek < total - minTail && windowsLeft-- > 0) {
    post({ type: 'progress', fraction: seek / total, message: 'Transcribing the speech…' });
    const windowSamples = Math.min(N_SAMPLES, total - seek);
    const mel = logMel(audio.subarray(seek, seek + windowSamples));
    const feats = new ort.Tensor('float32', mel, [1, N_MELS, N_FRAMES]);
    let encOut: Awaited<ReturnType<ort.InferenceSession['run']>>;
    try {
      encOut = await m.encoder.run({ [m.encoder.inputNames[0]]: feats });
    } catch (e) {
      if (m.encoderBackend === 'wasm') throw e;
      // A GPU that loads the model but fails to run it: fall back to the CPU for good.
      await m.encoder.release();
      m.encoder = await encoderSession(await fetchBytes(urls.encoder, 'speech model'), false);
      m.encoderBackend = 'wasm';
      encOut = await m.encoder.run({ [m.encoder.inputNames[0]]: feats });
    }
    const enc = encOut[m.encoder.outputNames[0]] as ort.Tensor;

    // <|startoftranscript|> alone: its logits give the language and the no-speech probability.
    const first = await step(m, enc, [m.sot], emptyCache(m), true);
    const sotLp = logSoftmax(first.logits);
    const noSpeech = Math.exp(sotLp[m.noSpeech]);
    let langId = -1;
    for (const id of m.languages.keys()) if (langId < 0 || first.logits[id] > first.logits[langId]) langId = id;
    const lang: string = language ?? m.languages.get(langId)!;
    const langToken = [...m.languages].find(([, code]) => code === lang)![0];
    const prompt = await step(m, enc, [langToken, m.transcribe], first.cache, false);

    let best: Attempt | null = null;
    for (const temp of TEMPERATURES) {
      best = await decodeWindow(m, enc, prompt, temp);
      const looped = best.ratio > COMPRESSION_LIMIT;
      const unsure = best.avgLogprob < LOGPROB_LIMIT;
      // Silence: no need to retry, it is skipped below.
      if (noSpeech > NO_SPEECH_LIMIT && unsure) break;
      if (!looped && !unsure) break;
    }
    const { tokens, avgLogprob } = best!;
    const silent = noSpeech > NO_SPEECH_LIMIT && avgLogprob < LOGPROB_LIMIT;

    const offset = seek / SAMPLE_RATE;
    const windowEnd = (seek + windowSamples) / SAMPLE_RATE;
    const time = (t: number): number => offset + (t - m.tsBegin) * (TS_SAMPLES / SAMPLE_RATE);
    const isTs = (t: number): boolean => t >= m.tsBegin;
    const add = (start: number, end: number, ids: number[]): void => {
      const text = m.tok.decode(ids.filter((t) => t < m.eot)).trim();
      if (!text) return;
      const s = Math.min(start, windowEnd);
      segments.push({ start: s, end: Math.max(s, Math.min(end, windowEnd)), text, avgLogprob, noSpeech });
    };
    let advance = windowSamples;
    if (!silent) {
      if (!language && tokens.some((t) => t < m.eot)) language = lang;
      const n = tokens.length;
      const singleEnding = n >= 2 && !isTs(tokens[n - 2]) && isTs(tokens[n - 1]);
      const cuts: number[] = [];
      for (let i = 1; i < n; i++) if (isTs(tokens[i]) && isTs(tokens[i - 1])) cuts.push(i);
      if (cuts.length) {
        if (singleEnding) cuts.push(n);
        let last = 0;
        for (const cut of cuts) {
          const part = tokens.slice(last, cut);
          add(time(part[0]), time(part[part.length - 1]), part);
          last = cut;
        }
        // The text after the last complete segment is cut off by the window: decode it again from there.
        if (!singleEnding) advance = (tokens[last - 1] - m.tsBegin) * TS_SAMPLES;
      } else {
        const stamps = tokens.filter(isTs);
        const end = stamps.length && stamps[stamps.length - 1] !== m.tsBegin ? time(stamps[stamps.length - 1]) : windowEnd;
        add(stamps.length ? time(stamps[0]) : offset, end, tokens);
      }
    }
    if (!(advance > 0)) advance = windowSamples;
    seek += advance;
  }
  post({ type: 'progress', fraction: 1, message: 'Done' });
  post({ type: 'done', language: language ?? 'en', segments, backend: `encoder ${m.encoderBackend}, decoder wasm (${decoderLevel} optimisation)` });
}

/** Requests are handled one at a time (one set of sessions). */
let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<RunMessage>): void => {
  const msg = e.data;
  if (msg?.type === 'run') chain = chain.then(() => run(msg)).catch((err) => post({ type: 'error', message: (err as Error)?.message ?? String(err) }));
};
