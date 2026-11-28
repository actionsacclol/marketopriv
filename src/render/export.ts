import { perfNow } from '../lib/perf';
import { AudioBufferSource, BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH, QUALITY_MEDIUM } from 'mediabunny';
import { clipSound, contentBand, isVoiced, num, storyBeats, storyVideoTime, storyVoiceTrack, str, timingFor } from '@shared/presets';
import { SHAPE_SIZE, type Reel, type RenderShape, type StillShape } from '@shared/types';
import { H, W, drawReel, loadBanner, loadFonts, loadLogo, preloadImages } from './engine';
import { bannerOf } from '@shared/campaigns';
import { useApp } from '../state/store';
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
  // A narrated reel's background plays straight through (looping): decode it in order.
  if (reel.preset === 'narrated' && str(reel.fields, 'bg') === 'video') return sequential ? sequentialSource(path, num(reel.fields, 'bg_start', 0)) : seekingSource(path);
  // Story and meme reels jump around the recording (each screen beat picks its own second), so they seek.
  if (isVoiced(reel.preset)) return seekingSource(path);
  if (reel.preset !== 'clip') return null;
  return sequential ? sequentialSource(path, num(reel.fields, 'start', 0)) : seekingSource(path);
}

/** The campaign's ad banner. A banner that is set but can't be read is left out, and the user is told. */
async function bannerFor(reel: Reel): Promise<{ path: string; img: HTMLImageElement | null }> {
  const path = (bannerOf(reel, useApp.getState().db?.campaigns) ?? '').trim();
  const img = await loadBanner(path);
  if (path && !img) {
    const text = `"${reel.title}": the campaign's ad banner could not be read (${path}), so it was left out. Set it again on Create > Campaigns, then render again.`;
    console.warn(text);
    useApp.getState().toast('warn', text);
  }
  return { path, img };
}

/** The source second to show at reel time t (null = no video in this frame). */
function sourceTime(reel: Reel, t: number, beats: ReturnType<typeof storyBeats> | null, duration = 0): number | null {
  if (isVoiced(reel.preset)) return beats ? storyVideoTime(reel.fields, t, beats, duration, reel.preset === 'slides') : null;
  return num(reel.fields, 'start', 0) + Math.min(t, num(reel.fields, 'seconds', 12));
}

/** bannerPath: the campaign banner this render was drawn with ('' = none), to tell when it changed meanwhile. */
export async function renderMp4(reel: Reel, opts: RenderOpts): Promise<{ data: Uint8Array; seconds: number; bannerPath: string }> {
  const fps = opts.fps;
  const timing = timingFor(reel.preset, reel.fields);
  const total = timing.total;
  await loadFonts();
  await preloadImages(reel.fields);
  const logo = await loadLogo(reel.fields.logo);
  const { path: bannerPath, img: banner } = await bannerFor(reel);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  // Square: each vertical frame is drawn, then its content band is placed on a square canvas (see squareFrame).
  const square = opts.shape === 'square' ? shapeCompositor(canvas, 'square', reel.preset) : null;
  const encoded = square ? square.canvas : canvas;

  const music = str(reel.fields, 'music');
  const voice = isVoiced(reel.preset) ? storyVoiceTrack(reel.fields) : null;
  const own = reel.preset === 'clip' && clipSound(reel.fields) ? { path: str(reel.fields, 'video'), start: num(reel.fields, 'start', 0), seconds: timing.body } : null;
  if (music || voice || own) opts.onProgress?.(0, 'audio');
  const audio = await soundtrack(total, music ? { path: music, volume: num(reel.fields, 'music_volume', 0.8) } : null, voice, own);

  const build = async (hw: 'prefer-hardware' | 'prefer-software' | 'no-preference') => {
    const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    // Smaller files (Setup > Performance) use mediabunny's medium bitrate.
    const quality = perfNow().mediumQuality ? QUALITY_MEDIUM : QUALITY_HIGH;
    const video = new CanvasSource(encoded, { codec: 'avc', bitrate: quality, hardwareAcceleration: hw });
    out.addVideoTrack(video, { frameRate: fps });
    let a: AudioBufferSource | null = null;
    if (audio) {
      a = new AudioBufferSource({ codec: 'aac', bitrate: quality });
      out.addAudioTrack(a);
    }
    await out.start();
    return { out, video, a };
  };
  let pipe: Awaited<ReturnType<typeof build>>;
  // Setup > Performance: auto tries the graphics card first; software leaves it free (many profiles rendering).
  const enc = perfNow().encoder;
  let hw: 'prefer-hardware' | 'prefer-software' | 'no-preference' = enc === 'software' ? 'prefer-software' : 'prefer-hardware';
  try {
    pipe = await build(hw);
  } catch {
    hw = 'no-preference';
    pipe = await build(hw);
  }

  const frames = Math.max(1, Math.round(total * fps));
  const src = await frameSource(reel, true);
  const beats = isVoiced(reel.preset) && src ? storyBeats(reel.fields) : null;
  try {
    for (let i = 0; i < frames; i++) {
      if (opts.cancelled?.()) throw new Error('Render cancelled.');
      const t = i / fps;
      const st = src ? sourceTime(reel, t, beats, src.duration) : null;
      const frame = src && st !== null ? await src.frameAt(st) : null;
      drawReel(ctx, { preset: reel.preset, fields: reel.fields, t, frame: i, logo, banner, video: frame, videoSize: src?.size ?? null });
      square?.draw();
      if (i === 0 && hw === 'prefer-hardware') {
        // The encoder is only set up on the first frame: a graphics card that turns the settings down fails here, not
        // at start. Start over in software then (the frame is still on the canvas).
        try {
          await pipe.video.add(t, 1 / fps);
        } catch {
          await pipe.out.cancel().catch(() => {});
          hw = 'no-preference';
          pipe = await build(hw);
          await pipe.video.add(t, 1 / fps);
        }
      } else await pipe.video.add(t, 1 / fps);
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
  return { data: new Uint8Array(buf), seconds: total, bannerPath };
}

// ── Other shapes (square for X, 4:5 and 2:3 pictures) ─────────────────────
/**
 * The vertical frame as another shape. Every preset keeps its content inside a band of the 1080x1920 frame (the
 * platforms' own buttons cover the rest; shared/presets.ts contentBand). A shape at least as tall as the band is cut
 * straight out of the frame around it; a shorter one gets the band scaled to its height and centred over a blurred,
 * dimmed fill of the same frame. Nothing of the content is cut either way.
 */
export function shapeCompositor(src: HTMLCanvasElement, shape: Exclude<StillShape, 'vertical'>, preset: string): { canvas: HTMLCanvasElement; draw: () => void } {
  const out = SHAPE_SIZE[shape];
  const band = contentBand(preset);
  const canvas = document.createElement('canvas');
  canvas.width = out.w;
  canvas.height = out.h;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const bandH = band.bottom - band.top;
  if (out.h >= bandH) {
    const top = Math.round(Math.min(H - out.h, Math.max(0, (band.top + band.bottom) / 2 - out.h / 2)));
    return { canvas, draw: () => ctx.drawImage(src, 0, top, W, out.h, 0, 0, out.w, out.h) };
  }
  // The fill: the frame shrunk to a few pixels and stretched back up, which blurs it cheaply.
  const tiny = document.createElement('canvas');
  tiny.width = 27;
  tiny.height = 27;
  const tctx = tiny.getContext('2d')!;
  const scale = out.h / bandH;
  const w = Math.round(W * scale);
  const x = Math.round((out.w - w) / 2);
  return {
    canvas,
    draw() {
      tctx.drawImage(src, 0, band.top, W, bandH, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(tiny, 0, 0, out.w, out.h);
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(0, 0, out.w, out.h);
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = 40;
      ctx.drawImage(src, 0, band.top, W, bandH, x, 0, w, out.h);
      ctx.restore();
    },
  };
}

/** Still frames as base64 images (scaled; PNG, or JPEG for full-size slides). Default times: opening frame, two body beats, end card. */
export async function renderStills(reel: Reel, times: number[] | undefined, scale: number, shape?: StillShape, jpeg = false): Promise<Array<{ t: number; data: string }>> {
  const timing = timingFor(reel.preset, reel.fields);
  const ts = (times?.length ? times : defaultTimes(timing.body, timing.cta)).map((t) => Math.max(0, Math.min(t, timing.total - 0.01)));
  await loadFonts();
  await preloadImages(reel.fields);
  const logo = await loadLogo(reel.fields.logo);
  const { img: banner } = await bannerFor(reel);
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const ctx = full.getContext('2d', { alpha: false })!;
  const sq = shape && shape !== 'vertical' ? shapeCompositor(full, shape, reel.preset) : null;
  const shown = sq ? sq.canvas : full;
  const small = document.createElement('canvas');
  small.width = Math.round(shown.width * scale);
  small.height = Math.round(shown.height * scale);
  const sctx = small.getContext('2d')!;
  const src = await frameSource(reel, false);
  const beats = isVoiced(reel.preset) && src ? storyBeats(reel.fields) : null;
  const out: Array<{ t: number; data: string }> = [];
  try {
    for (const t of ts) {
      const st = src ? sourceTime(reel, t, beats, src.duration) : null;
      const frame = src && st !== null ? await src.frameAt(st) : null;
      drawReel(ctx, { preset: reel.preset, fields: reel.fields, t, frame: Math.round(t * 30), logo, banner, video: frame, videoSize: src?.size ?? null });
      sq?.draw();
      sctx.drawImage(shown, 0, 0, small.width, small.height);
      out.push({ t, data: (jpeg ? small.toDataURL('image/jpeg', 0.93) : small.toDataURL('image/png')).split(',')[1] });
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

// ── Frozen picture check ─────────────────────────────────────────────────────
// The main picture should never sit unchanged for more than about 3 s: captions changing, a slow zoom or a tiny
// drift do not count as change. Frames every 0.25 s are shrunk to 54x96 grey with the caption band left out, and
// each is compared with the one half a second earlier; a stretch where nothing moves past the threshold for 3 s
// or more is reported with the lines it covers, so the AI can give that part an action, a prop or a new shot.
const STILL_STEP = 0.25;
const STILL_LIMIT = 3;
const stillCache = new Map<string, Array<{ from: number; to: number }>>();

export async function stillStretches(reel: Reel, threshold = 1.5): Promise<Array<{ from: number; to: number }>> {
  const key = `${reel.preset}|${JSON.stringify(reel.fields)}`;
  const hit = stillCache.get(key);
  if (hit) return hit;
  // Slideshows are still pictures on purpose; real footage moves by itself. This check is for drawn reels.
  if (reel.preset === 'slides') return [];
  const timing = timingFor(reel.preset, reel.fields);
  const src = await frameSource(reel, false);
  if (src) {
    src.dispose();
    return [];
  }
  await loadFonts();
  await preloadImages(reel.fields);
  const logo = await loadLogo(reel.fields.logo);
  // A campaign banner never moves, so it is left out (and its load warning is not shown twice).
  const banner = null;
  const full = document.createElement('canvas');
  full.width = W;
  full.height = H;
  const ctx = full.getContext('2d', { alpha: false })!;
  const sw = 54;
  const sh = 96;
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  // Rows left out: the caption band (most styles put words between 58% and 90% of the height).
  const skip = (y: number): boolean => y >= sh * 0.58 && y < sh * 0.9;
  const grey: Float32Array[] = [];
  const times: number[] = [];
  for (let t = 0; t < timing.body - 0.05; t += STILL_STEP) {
    drawReel(ctx, { preset: reel.preset, fields: reel.fields, t, frame: Math.round(t * 30), logo, banner, video: null, videoSize: null });
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(full, 0, 0, sw, sh);
    const d = sctx.getImageData(0, 0, sw, sh).data;
    const g = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    grey.push(g);
    times.push(t);
  }
  const lag = Math.round(0.5 / STILL_STEP);
  const moving: boolean[] = times.map(() => true);
  for (let i = lag; i < grey.length; i++) {
    let sum = 0;
    let n = 0;
    for (let y = 0; y < sh; y++) {
      if (skip(y)) continue;
      for (let x = 0; x < sw; x++) {
        sum += Math.abs(grey[i][y * sw + x] - grey[i - lag][y * sw + x]);
        n++;
      }
    }
    moving[i] = sum / n > threshold;
  }
  const out: Array<{ from: number; to: number }> = [];
  let start = -1;
  for (let i = 0; i <= moving.length; i++) {
    const still = i < moving.length && !moving[i];
    if (still && start < 0) start = i;
    if (!still && start >= 0) {
      // A still sample means the half second before it did not change either.
      const from = Math.max(0, times[start] - 0.5);
      const to = i < times.length ? times[i] : timing.body;
      if (to - from >= STILL_LIMIT) out.push({ from: Math.round(from * 10) / 10, to: Math.round(to * 10) / 10 });
      start = -1;
    }
  }
  stillCache.set(key, out);
  return out;
}

/** The frozen-picture stretches as a note for the AI ('' when there are none). */
export async function stillNote(reel: Reel): Promise<string> {
  const runs = await stillStretches(reel).catch(() => []);
  if (!runs.length) return '';
  const beats = isVoiced(reel.preset) ? storyBeats(reel.fields) : [];
  const where = runs
    .map((r) => {
      const lines = beats
        .map((b, i) => ({ b, i }))
        .filter(({ b }) => b.start < r.to && b.start + b.dur > r.from)
        .map(({ i }) => i + 1);
      return `${r.from}-${r.to}s${lines.length ? ` (line${lines.length > 1 ? 's' : ''} ${lines.join(', ')})` : ''}`;
    })
    .join('; ');
  return `\nStill picture: ${where} ${runs.length > 1 ? 'stay' : 'stays'} almost the same for 3 s or more (captions and slow zooms do not count). People scroll on a frozen picture: give that part an action, a prop coming in, a new shot or a reveal, or split the line.`;
}
