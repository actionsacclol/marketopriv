import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } from 'mediabunny';
import { clipSound, num, storyBeats, storyVideoTime, storyVoiceTrack, str, timingFor } from '@shared/presets';
import type { Reel, RenderShape } from '@shared/types';
import { H, W, drawReel, loadFonts, loadLogo } from './engine';
import { seekingSource, sequentialSource, soundtrack, type FrameSource } from './media';
import './presets';

// Reel → 1080x1920 H.264/AAC MP4 (in memory; reels are short), and reel →
// still PNGs for the agent. Both draw through the same drawReel as the preview.

export interface RenderOpts {
  fps: number;
  /** square: 1080x1080 for X. Default vertical (1080x1920). */
  shape?: RenderShape;
  onProgress?: (ratio: number, phase: string) => void;
  cancelled?: () => boolean;
}

async function frameSource(reel: Reel, sequential: boolean): Promise<FrameSource | null> {
  const path = str(reel.fields, 'video');
  if (!path) return null;
  // Story reels jump around the recording (each screen beat picks its own second), so they seek.
  if (reel.preset === 'story') return seekingSource(path);
  if (reel.preset !== 'clip') return null;
  return sequential ? sequentialSource(path, num(reel.fields, 'start', 0)) : seekingSource(path);
}

/** The source second to show at reel time t (null = no video in this frame). */
function sourceTime(reel: Reel, t: number, beats: ReturnType<typeof storyBeats> | null): number | null {
  if (reel.preset === 'story') return beats ? storyVideoTime(reel.fields, t, beats) : null;
  return num(reel.fields, 'start', 0) + Math.min(t, num(reel.fields, 'seconds', 12));
}

export async function renderMp4(reel: Reel, opts: RenderOpts): Promise<{ data: Uint8Array; seconds: number }> {
  const fps = opts.fps;
  const timing = timingFor(reel.preset, reel.fields);
  const total = timing.total;
  await loadFonts();
  const logo = await loadLogo(reel.fields.logo);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  // Square: each vertical frame is drawn, then its content band is placed on a square canvas (see squareFrame).
  const square = opts.shape === 'square' ? squareCompositor(canvas) : null;
  const encoded = square ? square.canvas : canvas;

  const music = str(reel.fields, 'music');
  const voice = reel.preset === 'story' ? storyVoiceTrack(reel.fields) : null;
  const own = reel.preset === 'clip' && clipSound(reel.fields) ? { path: str(reel.fields, 'video'), start: num(reel.fields, 'start', 0), seconds: timing.body } : null;
  if (music || voice || own) opts.onProgress?.(0, 'audio');
  const audio = await soundtrack(total, music ? { path: music, volume: num(reel.fields, 'music_volume', 0.8) } : null, voice, own);

  const build = async (hw: 'prefer-hardware' | 'no-preference') => {
    const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const video = new CanvasSource(encoded, { codec: 'avc', bitrate: QUALITY_HIGH, hardwareAcceleration: hw });
    out.addVideoTrack(video, { frameRate: fps });
    let a: AudioBufferSource | null = null;
    if (audio) {
      a = new AudioBufferSource({ codec: 'aac', bitrate: QUALITY_HIGH });
      out.addAudioTrack(a);
    }
    await out.start();
    return { out, video, a };
  };
  let pipe: Awaited<ReturnType<typeof build>>;
  try {
    pipe = await build('prefer-hardware');
  } catch {
    pipe = await build('no-preference');
  }

  const frames = Math.max(1, Math.round(total * fps));
  const src = await frameSource(reel, true);
  const beats = reel.preset === 'story' && src ? storyBeats(reel.fields) : null;
  try {
    for (let i = 0; i < frames; i++) {
      if (opts.cancelled?.()) throw new Error('Render cancelled.');
      const t = i / fps;
      const st = src ? sourceTime(reel, t, beats) : null;
      const frame = src && st !== null ? await src.frameAt(st) : null;
      drawReel(ctx, { preset: reel.preset, fields: reel.fields, t, frame: i, logo, video: frame, videoSize: src?.size ?? null });
      square?.draw();
      await pipe.video.add(t, 1 / fps);
      if (i % 5 === 0) opts.onProgress?.((i + 1) / frames * (audio ? 0.95 : 0.98), 'video');
    }
    if (pipe.a && audio) {
      opts.onProgress?.(0.96, 'audio');
      await pipe.a.add(audio);
    }
    opts.onProgress?.(0.98, 'finalizing');
    await pipe.out.finalize();
  } catch (e) {
    await pipe.out.cancel().catch(() => {});
    throw e;
  } finally {
    src?.dispose();
  }
  const buf = (pipe.out.target as BufferTarget).buffer;
  if (!buf) throw new Error('The encoder produced no data.');
  opts.onProgress?.(1, 'done');
  return { data: new Uint8Array(buf), seconds: total };
}

// ── Square (X) ────────────────────────────────────────────────────────────
/** Every preset keeps its text inside this band of the 1080x1920 frame (Instagram's own buttons cover the rest). */
const BAND_TOP = 220;
const BAND_BOTTOM = 1680;
const SQ = 1080;

/** Draws the vertical frame's content band, scaled to the square's height and centred, over a blurred, dimmed fill of the same frame. Nothing is cut. */
export function squareCompositor(src: HTMLCanvasElement): { canvas: HTMLCanvasElement; draw: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = SQ;
  canvas.height = SQ;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  // The fill: the frame shrunk to a few pixels and stretched back up, which blurs it cheaply.
  const tiny = document.createElement('canvas');
  tiny.width = 27;
  tiny.height = 27;
  const tctx = tiny.getContext('2d')!;
  const bandH = BAND_BOTTOM - BAND_TOP;
  const scale = SQ / bandH;
  const w = Math.round(W * scale);
  const x = Math.round((SQ - w) / 2);
  return {
    canvas,
    draw() {
      tctx.drawImage(src, 0, BAND_TOP, W, bandH, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tiny, 0, 0, SQ, SQ);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, SQ, SQ);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 40;
      ctx.drawImage(src, 0, BAND_TOP, W, bandH, x, 0, w, SQ);
      ctx.restore();
    },
  };
}

/** Still frames as base64 PNGs (scaled). Default times: opening frame, two body beats, end card. */
export async function renderStills(reel: Reel, times: number[] | undefined, scale: number, shape?: RenderShape): Promise<Array<{ t: number; data: string }>> {
  const timing = timingFor(reel.preset, reel.fields);
  const ts = (times?.length ? times : defaultTimes(timing.body, timing.cta)).map((t) => Math.max(0, Math.min(t, timing.total - 0.01)));
  await loadFonts();
  const logo = await loadLogo(reel.fields.logo);
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const ctx = full.getContext('2d', { alpha: false })!;
  const sq = shape === 'square' ? squareCompositor(full) : null;
  const shown = sq ? sq.canvas : full;
  const small = document.createElement('canvas');
  small.width = Math.round(shown.width * scale);
  small.height = Math.round(shown.height * scale);
  const sctx = small.getContext('2d')!;
  const src = await frameSource(reel, false);
  const beats = reel.preset === 'story' && src ? storyBeats(reel.fields) : null;
  const out: Array<{ t: number; data: string }> = [];
  try {
    for (const t of ts) {
      const st = src ? sourceTime(reel, t, beats) : null;
      const frame = src && st !== null ? await src.frameAt(st) : null;
      drawReel(ctx, { preset: reel.preset, fields: reel.fields, t, frame: Math.round(t * 30), logo, video: frame, videoSize: src?.size ?? null });
      sq?.draw();
      sctx.drawImage(shown, 0, 0, small.width, small.height);
      out.push({ t, data: small.toDataURL('image/png').split(',')[1] });
    }
  } finally {
    src?.dispose();
  }
  return out;
}

export function defaultTimes(body: number, cta: number): number[] {
  const ts = [0, body * 0.45, Math.max(0, body - 0.3)];
  if (cta > 0) ts.push(body + Math.min(cta - 0.05, 1));
  return ts.map((t) => Math.round(t * 100) / 100);
}
