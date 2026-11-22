import type { StoryBeat } from '@shared/presets';
import { H, W, clamp01, easeOut, lerp, prog, type Ctx } from '../engine';

// Picture effects from a beat's flags (meme and narrated reels, story reels too):
// zoom (a sudden punch-in onto a point, held), slowzoom (a slow push-in), shake
// (a hard shake that dies down), fry (deep-fried colours and blocky pixels) and
// flash (a white flash). The sounds that usually go with them (boom, bass...) are
// separate flags, scheduled in shared/sfx.ts.

export interface FxView {
  /** Zoom factor and the point (canvas px) the view moves toward. */
  z: number;
  fx: number;
  fy: number;
  /** Shake offset and tilt. */
  dx: number;
  dy: number;
  rot: number;
}

/** What the beat's zoom / shake effects do to the view at `local` seconds into the beat. rect = the area the zoom point is measured in. */
export function fxView(b: StoryBeat, local: number, rect = { x: 0, y: 0, w: W, h: H }): FxView {
  const v: FxView = { z: 1, fx: rect.x + rect.w / 2, fy: rect.y + rect.h / 2, dx: 0, dy: 0, rot: 0 };
  for (const f of b.fx) {
    const since = local - f.at;
    if (since < 0) continue;
    if (f.kind === 'zoom') {
      const e = easeOut(prog(since, 0, 0.07));
      v.z *= lerp(1, 1.85, e);
      v.fx = lerp(v.fx, rect.x + f.x * rect.w, e);
      v.fy = lerp(v.fy, rect.y + f.y * rect.h, e);
    } else if (f.kind === 'slowzoom') {
      v.z *= 1 + 0.25 * clamp01(since / Math.max(0.6, b.dur - f.at));
    } else if (f.kind === 'shake') {
      const k = Math.max(0, 1 - since / 0.65);
      if (k > 0) {
        v.dx += (Math.sin(since * 93) * 30 + Math.sin(since * 41) * 14) * k;
        v.dy += (Math.cos(since * 79) * 26 + Math.sin(since * 57) * 10) * k;
        v.rot += Math.sin(since * 61) * 0.03 * k;
      }
    }
  }
  return v;
}

export const fxMoves = (v: FxView): boolean => v.z !== 1 || v.dx !== 0 || v.dy !== 0 || v.rot !== 0;

/** Apply a view to the context: the zoom point slides toward the middle of rect while it zooms. */
export function applyView(ctx: Ctx, v: FxView, rect = { x: 0, y: 0, w: W, h: H }): void {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  ctx.translate(cx + v.dx, cy + v.dy);
  if (v.rot) ctx.rotate(v.rot);
  ctx.scale(v.z, v.z);
  ctx.translate(-v.fx, -v.fy);
}

let fryLayer: HTMLCanvasElement | null = null;
let fryTiny: HTMLCanvasElement | null = null;

/** Fry and flash over everything drawn so far on ctx's canvas (call after the beat is drawn). */
export function fxPost(ctx: Ctx, b: StoryBeat, local: number): void {
  const fry = b.fx.find((f) => f.kind === 'fry' && local >= f.at);
  if (fry) {
    const canvas = ctx.canvas as HTMLCanvasElement;
    if (!fryLayer) {
      fryLayer = document.createElement('canvas');
      fryTiny = document.createElement('canvas');
    }
    fryLayer.width = canvas.width;
    fryLayer.height = canvas.height;
    const lc = fryLayer.getContext('2d')!;
    lc.filter = 'contrast(1.9) saturate(2.8) brightness(1.06)';
    lc.drawImage(canvas, 0, 0);
    lc.filter = 'none';
    // Blocky: down to a third and back up without smoothing, like a JPEG saved ten times.
    const tiny = fryTiny!;
    tiny.width = Math.round(canvas.width / 3.2);
    tiny.height = Math.round(canvas.height / 3.2);
    const tc = tiny.getContext('2d')!;
    tc.imageSmoothingEnabled = true;
    tc.drawImage(fryLayer, 0, 0, tiny.width, tiny.height);
    const k = easeOut(prog(local, fry.at, 0.08));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = k;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tiny, 0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    // A hot orange cast and a bloom on the brights.
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,110,0,0.35)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 * k;
    ctx.filter = 'blur(10px)';
    ctx.drawImage(fryLayer, 0, 0);
    ctx.restore();
  }
  for (const f of b.fx) {
    if (f.kind !== 'flash') continue;
    const u = prog(local, f.at, 0.35);
    if (local < f.at || u >= 1) continue;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = `rgba(255,255,255,${(0.92 * (1 - u)).toFixed(3)})`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
}
