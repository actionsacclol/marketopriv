import { ALL_FORMATS, CanvasSink, Input, UrlSource } from 'mediabunny';
import { SAMPLE_FPS, VideoMeter, measureAudio, sampleSize } from '@shared/refAnalysis';
import type { RefProfile, RefVideo, RefVideoInput } from '@shared/types';
import { mediaUrl } from './media';
import { useApp } from '../state/store';

// Reference videos: decode the upload on this computer, measure it
// (shared/refAnalysis.ts) and make the pictures an AI looks at: the opening
// seconds and one frame per section. Nothing is uploaded anywhere.

/** Longer than this is not a reel to copy the edit of. */
const MAX_SECONDS = 180;
const CELL_W = 270;
const LABEL_H = 28;
const COLS = 4;

async function jpeg(canvas: HTMLCanvasElement, quality = 0.82): Promise<Uint8Array> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Could not make a picture of the video.');
  return new Uint8Array(await blob.arrayBuffer());
}

/** A grid of labelled frames. */
async function sheet(sink: CanvasSink, cells: Array<{ t: number; label: string }>, cellH: number): Promise<Uint8Array> {
  const rows = Math.max(1, Math.ceil(cells.length / COLS));
  const canvas = document.createElement('canvas');
  canvas.width = CELL_W * COLS;
  canvas.height = rows * (cellH + LABEL_H);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = '600 15px system-ui, "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < cells.length; i++) {
    const x = (i % COLS) * CELL_W;
    const y = Math.floor(i / COLS) * (cellH + LABEL_H);
    const frame = await sink.getCanvas(cells[i].t);
    if (frame) ctx.drawImage(frame.canvas, x, y + LABEL_H, CELL_W, cellH);
    ctx.fillStyle = '#16161f';
    ctx.fillRect(x, y, CELL_W, LABEL_H);
    ctx.fillStyle = '#e8e8f0';
    ctx.fillText(cells[i].label, x + 8, y + LABEL_H / 2 + 1);
    ctx.strokeStyle = '#0a0a0f';
    ctx.strokeRect(x + 0.5, y + 0.5, CELL_W - 1, cellH + LABEL_H - 1);
  }
  return jpeg(canvas);
}

async function monoSamples(path: string, rate: number): Promise<Float32Array | null> {
  try {
    const res = await fetch(mediaUrl(path));
    if (!res.ok) return null;
    const buf = await new OfflineAudioContext(1, rate, rate).decodeAudioData(await res.arrayBuffer());
    if (buf.numberOfChannels === 1) return buf.getChannelData(0);
    const out = new Float32Array(buf.length);
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < out.length; i++) out[i] += ch[i] / buf.numberOfChannels;
    }
    return out;
  } catch {
    // No audio track, or one this computer can't decode: treated as silent.
    return null;
  }
}

const fmt = (t: number): string => `${t.toFixed(1)}s`;

export interface Analysis {
  profile: RefProfile;
  poster: Uint8Array;
  hook: Uint8Array;
  shots: Uint8Array;
}

export async function analyzeReference(path: string, onProgress: (ratio: number, phase: string) => void = () => {}): Promise<Analysis> {
  const input = new Input({ source: new UrlSource(mediaUrl(path)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error('That file has no video in it.');
    if (!(await track.canDecode())) throw new Error('This video\'s format can\'t be read here. Save it as an H.264 MP4 and add it again.');
    const seconds = await input.computeDuration();
    if (!(seconds > 0.5)) throw new Error('That video is too short to learn anything from.');
    if (seconds > MAX_SECONDS) throw new Error(`That video is ${Math.round(seconds)}s long. Reference videos are short clips (up to ${MAX_SECONDS / 60} minutes): trim it to the part you want copied.`);
    const width = track.displayWidth;
    const height = track.displayHeight;

    // 1. Every frame, small: where the picture changes, what it looks like.
    onProgress(0, 'reading the video');
    const { w, h } = sampleSize(width, height);
    const small = new CanvasSink(track, { width: w, height: h, fit: 'fill', poolSize: 2 });
    const meter = new VideoMeter(w, h, 4);
    let last = -1;
    let n = 0;
    for await (const frame of small.canvases()) {
      if (frame.timestamp - last < 1 / SAMPLE_FPS - 0.002) continue;
      last = frame.timestamp;
      const ctx = (frame.canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) throw new Error('Could not read the video\'s frames.');
      meter.push(Math.max(0, frame.timestamp), ctx.getImageData(0, 0, w, h).data);
      if (++n % 20 === 0) onProgress(Math.min(0.7, (frame.timestamp / seconds) * 0.7), 'finding the cuts');
    }
    if (n < 4) throw new Error('Could not read enough of that video to measure it.');
    const video = meter.finish(seconds);

    // 2. Sound: silence, tempo, and whether the changes follow the beat.
    onProgress(0.72, 'listening to the sound');
    const audio = measureAudio(await monoSamples(path, 11025), 11025, video.marks);

    // 3. Pictures for whoever looks at it.
    onProgress(0.82, 'making pictures');
    const cellH = Math.round(CELL_W * clamp(height / width, 0.4, 2));
    const big = new CanvasSink(track, { width: CELL_W, height: cellH, fit: 'fill', poolSize: 2 });
    const at = (t: number): number => clamp(t, 0, Math.max(0, seconds - 0.05));
    const hookTimes = [0, 0.5, 1, 1.5, 2, 2.5, 3, 4].filter((t, i) => i === 0 || t < seconds - 0.1);
    const hook = await sheet(big, hookTimes.map((t) => ({ t: at(t), label: fmt(t) })), cellH);
    // One frame per section, taken late in it (text that builds up word by word is complete by then). At most 16, spread evenly.
    const secs = video.sections.map((s, i) => ({ ...s, i }));
    const picked = secs.length <= 16 ? secs : Array.from({ length: 16 }, (_, k) => secs[Math.round((k * (secs.length - 1)) / 15)]);
    const shots = await sheet(big, picked.map((s) => ({ t: at(s.start + Math.max(Math.min(0.2, s.dur / 2), s.dur * 0.8)), label: `#${s.i + 1} · ${fmt(s.start)} · ${fmt(s.dur)} long` })), cellH);
    const posterFrame = await big.getCanvas(at(Math.min(1, seconds / 3)));
    const pc = document.createElement('canvas');
    pc.width = CELL_W;
    pc.height = cellH;
    if (posterFrame) pc.getContext('2d')!.drawImage(posterFrame.canvas, 0, 0, CELL_W, cellH);
    const poster = await jpeg(pc, 0.8);
    onProgress(1, 'done');

    const profile: RefProfile = {
      seconds: Math.round(seconds * 100) / 100,
      width,
      height,
      shots: video.shots,
      sections: video.sections,
      hookHold: video.hookHold,
      medianShot: video.medianShot,
      medianSection: video.medianSection,
      changesPerSec: video.changesPerSec,
      motion: video.motion,
      look: video.look,
      colors: video.colors,
      accent: video.accent,
      audio,
    };
    return { profile, poster, hook, shots };
  } finally {
    input.dispose?.();
  }
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

/** Analyse a video and store it as a reference. One at a time; the UI and the AI tool share this. */
export async function addReferenceVideo(path: string, opts: { name?: string; notes?: string } = {}, onProgress?: (ratio: number, phase: string) => void): Promise<RefVideo> {
  if (useApp.getState().refJob) throw new Error('Another reference video is being read. Wait for it to finish.');
  const label = opts.name?.trim() || path.replace(/^.*[\\/]/, '');
  useApp.setState({ refJob: { name: label, ratio: 0, phase: 'opening' } });
  try {
    const a = await analyzeReference(path, (ratio, phase) => {
      useApp.setState({ refJob: { name: label, ratio, phase } });
      onProgress?.(ratio, phase);
    });
    const input: RefVideoInput = { path, name: opts.name, notes: opts.notes, ...a };
    const r = await window.marketo.refs.add(input);
    if (!r.ok || !r.data) throw new Error(r.message ?? 'Could not save the reference video.');
    return r.data;
  } finally {
    useApp.setState({ refJob: null });
  }
}
