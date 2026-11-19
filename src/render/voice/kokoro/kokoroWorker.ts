/// <reference lib="webworker" />
/**
 * Kokoro-82M text to speech in a Web Worker: the G2P (g2p.ts) turns text into
 * Kokoro phonemes, then one ONNX Runtime inference per sentence, WebGPU when
 * the GPU has it, else WASM. Same pipeline as Krypt Studio's analyzer
 * (engine/crates/analyzer/src/tts/mod.rs): edge silence trimmed, sentences
 * joined with short pauses, never clipped. The model and session stay loaded
 * between requests; the caller terminates the worker to cancel.
 */
import * as ort from 'onnxruntime-web';
import ortWasmUrl from '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm?url';
import ortMjsUrl from '../../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs?url';
import dictUrl from './cmudict.txt.deflate?url';
import { dictLoaded, loadDict, setLexicon, textChunks } from './g2p';
import { encode, PAD } from './vocab';

interface RunMessage {
  type: 'run';
  text: string;
  speed: number;
  modelUrl: string;
  voiceUrl: string;
  /** A second voice to mix in, and its share (0..1). */
  blendUrl?: string;
  blend?: number;
  /** Words to say a set way (g2p.setLexicon). */
  lexicon?: Record<string, string>;
}

/** Load the model and run one short line so the first real request skips WebGPU's shader compile (~10 s). */
interface WarmMessage {
  type: 'warm';
  modelUrl: string;
  voiceUrl: string;
}

type OutMessage =
  | { type: 'status'; status: string }
  | { type: 'progress'; ratio: number }
  | { type: 'done'; audio: Float32Array; sampleRate: number }
  | { type: 'error'; message: string };

const post = (m: OutMessage, transfer?: Transferable[]): void => self.postMessage(m, { transfer });

const SAMPLE_RATE = 24000;
const STYLE_DIM = 256;
/** Pause after a sentence / after a clause split (seconds). */
const SENTENCE_PAUSE = 0.22;
const CLAUSE_PAUSE = 0.12;
/** Silence kept around each trimmed chunk (seconds). */
const EDGE_KEEP = 0.03;

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
ort.env.wasm.numThreads = 1;

let session: { url: string; s: ort.InferenceSession } | null = null;
const voices = new Map<string, Float32Array>();

async function fetchBytes(url: string, what: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't read the ${what} (HTTP ${res.status}).`);
  return res.arrayBuffer();
}

async function ensureDict(): Promise<void> {
  if (dictLoaded()) return;
  const res = await fetch(dictUrl);
  if (!res.ok || !res.body) throw new Error('The built-in pronunciation dictionary is missing.');
  loadDict(await new Response(res.body.pipeThrough(new DecompressionStream('deflate-raw'))).text());
}

async function ensureSession(url: string): Promise<ort.InferenceSession> {
  if (session?.url === url) return session.s;
  await session?.s.release();
  session = null;
  const bytes = new Uint8Array(await fetchBytes(url, 'voice model'));
  let s: ort.InferenceSession;
  try {
    if (!('gpu' in navigator) || !(await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter())) throw new Error('no WebGPU');
    s = await ort.InferenceSession.create(bytes, { executionProviders: ['webgpu'] });
  } catch {
    s = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  }
  for (const want of ['input_ids', 'style', 'speed']) if (!s.inputNames.includes(want)) throw new Error(`The voice model is not Kokoro (no input '${want}').`);
  session = { url, s };
  return s;
}

async function voiceTable(url: string): Promise<Float32Array> {
  const hit = voices.get(url);
  if (hit) return hit;
  const buf = await fetchBytes(url, 'voice');
  if (buf.byteLength === 0 || buf.byteLength % (4 * STYLE_DIM) !== 0) throw new Error('The voice file is damaged (unexpected size).');
  const table = new Float32Array(buf);
  voices.set(url, table);
  return table;
}

/** First / last sample above the trim threshold, widened by EDGE_KEEP. */
function trimBounds(x: Float32Array): [number, number] {
  let peak = 0;
  for (const v of x) peak = Math.max(peak, Math.abs(v));
  if (peak <= 0) return [0, 0];
  const thr = Math.max(peak * 0.02, 1e-4);
  let first = 0;
  while (first < x.length && Math.abs(x[first]) <= thr) first++;
  let last = x.length;
  while (last > 0 && Math.abs(x[last - 1]) <= thr) last--;
  if (first >= x.length) [first, last] = [0, x.length];
  const keep = Math.floor(EDGE_KEEP * SAMPLE_RATE);
  return [Math.max(0, first - keep), Math.min(x.length, last + keep)];
}

async function run({ text, speed, modelUrl, voiceUrl, blendUrl, blend, lexicon }: RunMessage): Promise<void> {
  post({ type: 'status', status: 'Reading the text…' });
  await ensureDict();
  setLexicon(lexicon ?? {});
  const chunks = textChunks(text)
    .map((c) => ({ phonemes: c.phonemes, ids: encode(c.phonemes) }))
    .filter((c) => c.ids.some((t) => t !== 16));
  if (!chunks.length) throw new Error('Nothing to say: the text has no words the voice can pronounce.');
  post({ type: 'status', status: 'Loading the voice…' });
  const table = await voiceTable(voiceUrl);
  const mix = blendUrl && blend && blend > 0 ? Math.min(1, blend) : 0;
  const second = mix ? await voiceTable(blendUrl!) : null;
  const s = await ensureSession(modelUrl);
  post({ type: 'status', status: 'Generating speech…' });
  const rows = table.length / STYLE_DIM;
  const pieces: Float32Array[] = [];
  let total = 0;
  for (let i = 0; i < chunks.length; i++) {
    const { ids } = chunks[i];
    const padded = BigInt64Array.from([PAD, ...ids, PAD], (v) => BigInt(v));
    const r = Math.min(ids.length, rows - 1);
    const style = table.slice(r * STYLE_DIM, (r + 1) * STYLE_DIM);
    // Two voices mixed: the style vectors are averaged by share (how Kokoro voices are blended).
    if (second) {
      const r2 = Math.min(ids.length, second.length / STYLE_DIM - 1) * STYLE_DIM;
      for (let k = 0; k < STYLE_DIM; k++) style[k] = style[k] * (1 - mix) + second[r2 + k] * mix;
    }
    const out = await s.run({
      input_ids: new ort.Tensor('int64', padded, [1, padded.length]),
      style: new ort.Tensor('float32', style, [1, STYLE_DIM]),
      speed: new ort.Tensor('float32', Float32Array.of(speed), [1]),
    });
    const wav = out.waveform.data as Float32Array;
    const [a, b] = trimBounds(wav);
    if (b > a) {
      if (pieces.length) {
        const prevEnd = chunks[i - 1].phonemes.trimEnd().slice(-1);
        const pause = '.!?…'.includes(prevEnd) && prevEnd !== '' ? SENTENCE_PAUSE : CLAUSE_PAUSE;
        const gap = new Float32Array(Math.floor(pause * SAMPLE_RATE));
        pieces.push(gap);
        total += gap.length;
      }
      pieces.push(wav.slice(a, b));
      total += b - a;
    }
    post({ type: 'progress', ratio: (i + 1) / chunks.length });
  }
  const audio = new Float32Array(total);
  let off = 0;
  let peak = 0;
  for (const p of pieces) {
    audio.set(p, off);
    off += p.length;
  }
  for (const v of audio) peak = Math.max(peak, Math.abs(v));
  // Never clip.
  if (peak > 0.99) for (let i = 0; i < audio.length; i++) audio[i] *= 0.99 / peak;
  if (!audio.length) throw new Error('The voice model produced no audio.');
  post({ type: 'done', audio, sampleRate: SAMPLE_RATE }, [audio.buffer]);
}

async function warm({ modelUrl, voiceUrl }: WarmMessage): Promise<void> {
  await ensureDict();
  const table = await voiceTable(voiceUrl);
  const s = await ensureSession(modelUrl);
  const ids = encode(textChunks('Ready.')[0]?.phonemes ?? '');
  const padded = BigInt64Array.from([PAD, ...ids, PAD], (v) => BigInt(v));
  await s.run({
    input_ids: new ort.Tensor('int64', padded, [1, padded.length]),
    style: new ort.Tensor('float32', table.slice(ids.length * STYLE_DIM, (ids.length + 1) * STYLE_DIM), [1, STYLE_DIM]),
    speed: new ort.Tensor('float32', Float32Array.of(1), [1]),
  });
}

/** Messages are handled one at a time (one session, one GPU queue). */
let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<RunMessage | WarmMessage>): void => {
  const m = e.data;
  if (m?.type === 'run') chain = chain.then(() => run(m)).catch((err) => post({ type: 'error', message: (err as Error)?.message ?? String(err) }));
  else if (m?.type === 'warm') chain = chain.then(() => warm(m)).catch(() => undefined);
};
