import { screenZoom, storyBeats, str, type StoryBeat } from '@shared/presets';
import { isAction } from '@shared/character';
import { FONT, H, W, clamp01, easeBack, easeInOut, easeOut, fit, font, imageOf, lerp, prog, registerPreset, scaled, withAlpha, type Ctx, type Env } from '../engine';
import { artBackdrop, drawMascot } from './storyArt';
import { fxPost, fxView } from './fx';

// Meme: panels cut hard one after another, the way meme pages and shitpost
// edits are made. Each panel is a picture (a meme template, a screenshot), a
// part of a clip, the mascot acting it out, or just text; its caption sits in
// a white bar above it (top), as classic outlined text on it (impact) or over
// a full-screen picture (over). Beat flags add the edit: zoom punch, shake,
// deep fry, flash, freeze, and the meme sounds.

type Rect = { x: number; y: number; w: number; h: number };
const clean = (s: string): string => s.replace(/\*/g, '').trim();

/** The panel's media size (aspect), before layout. */
function mediaSize(env: Env, b: StoryBeat): { w: number; h: number } | null {
  if (b.visual === 'image') {
    const img = imageOf(b.a);
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 1080, h: 1080 };
  }
  if (b.visual === 'screen') return env.videoSize ?? { w: 1920, h: 1080 };
  if (b.visual === 'char') return { w: 1080, h: 1080 };
  return null;
}

let charLayer: HTMLCanvasElement | null = null;

/** Draw the panel's media to fill rect (cover). */
function drawMedia(ctx: Ctx, env: Env, b: StoryBeat, local: number, rect: Rect): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  const cover = (src: CanvasImageSource, sw: number, sh: number, sx = 0, sy = 0, cw = sw, ch = sh): void => {
    const s = Math.max(rect.w / cw, rect.h / ch);
    const w = cw * s;
    const h = ch * s;
    ctx.drawImage(src, sx, sy, cw, ch, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
  };
  if (b.visual === 'image') {
    const img = imageOf(b.a);
    if (img) cover(img, img.naturalWidth, img.naturalHeight);
    else placeholder(ctx, rect, b.a ? 'loading picture…' : 'picture goes here');
    return;
  }
  if (b.visual === 'screen') {
    const v = env.video;
    const vs = env.videoSize;
    if (!v || !vs) return placeholder(ctx, rect, str(env.fields, 'video') ? 'loading video…' : 'video goes here');
    const zm = screenZoom(b.a);
    const z = lerp(1, zm.z, easeInOut(prog(local, 0.2, 0.6)));
    const cw = vs.w / z;
    const ch = vs.h / z;
    const sx = Math.min(vs.w - cw, Math.max(0, zm.x * vs.w - cw / 2));
    const sy = Math.min(vs.h - ch, Math.max(0, zm.y * vs.h - ch / 2));
    cover(v, vs.w, vs.h, sx, sy, cw, ch);
    return;
  }
  if (b.visual === 'char') {
    const art = (['3d', 'cartoon', 'ps2'].includes(str(env.fields, 'art')) ? str(env.fields, 'art') : '3d') as '3d' | 'cartoon' | 'ps2';
    if (!charLayer) {
      charLayer = document.createElement('canvas');
      charLayer.width = W;
      charLayer.height = H;
    }
    const g = charLayer.getContext('2d')!;
    g.clearRect(0, 0, W, H);
    const act = isAction(b.a.trim().toLowerCase()) ? b.a.trim().toLowerCase() : 'talk';
    const beat: StoryBeat = { ...b, visual: act, a: '', b: '' };
    artBackdrop(g, env, art, 0);
    drawMascot(g, env, art, beat, 0, local, 'stage');
    // The square around the mascot.
    cover(charLayer, W, H, 0, H * 0.6 - W / 2, W, W);
  }
}

function placeholder(ctx: Ctx, rect: Rect, text: string): void {
  ctx.fillStyle = '#16161C';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  font(ctx, 34, 600, FONT.mono);
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.textAlign = 'center';
  ctx.fillText(text, rect.x + rect.w / 2, rect.y + rect.h / 2);
}

/** Classic meme text: Anton, upper case, white with a thick black outline. top = anchor at the top edge, else the bottom. */
function impactText(ctx: Ctx, text: string, rect: Rect, atTop: boolean, pop: number): void {
  const s = clean(text).toUpperCase();
  if (!s) return;
  const c = fit(ctx, s, { maxW: rect.w - 70, maxH: Math.min(420, rect.h * 0.34), max: 120, min: 44, maxLines: 3, weight: 400, family: FONT.impact, lh: 1.04 });
  const blockH = c.lines.length * c.lh;
  const y0 = atTop ? Math.max(rect.y + 26, 230) : Math.min(rect.y + rect.h - 26, 1560) - blockH;
  scaled(ctx, lerp(0.85, 1, easeBack(pop)), W / 2, y0 + blockH / 2, () => {
    font(ctx, c.size, 400, FONT.impact);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    c.lines.forEach((l, i) => {
      const y = y0 + c.lh * (i + 0.86);
      ctx.lineWidth = c.size * 0.16;
      ctx.strokeStyle = '#000';
      ctx.strokeText(l, W / 2, y);
      ctx.fillStyle = '#FFF';
      ctx.fillText(l, W / 2, y);
    });
  });
}

/** Over layout: the meme-look caption (heavy white, black outline) on a dark fade. */
function overText(ctx: Ctx, text: string, y: number, pop: number, max = 84): number {
  const s = clean(text);
  if (!s) return y;
  const c = fit(ctx, s, { maxW: 940, maxH: 400, max, min: 40, maxLines: 4, weight: 900, family: FONT.meme });
  const h = c.lines.length * c.lh;
  const g = ctx.createLinearGradient(0, y - 120, 0, y + h + 120);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.38)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, y - 120, W, h + 240);
  withAlpha(ctx, clamp01(pop * 2), () =>
    scaled(ctx, lerp(0.88, 1, easeBack(pop)), W / 2, y + h / 2, () => {
      font(ctx, c.size, 900, FONT.meme);
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      c.lines.forEach((l, i) => {
        const yy = y + c.lh * (i + 0.82);
        ctx.lineWidth = c.size * 0.22;
        ctx.strokeStyle = '#000';
        ctx.strokeText(l, W / 2, yy);
        ctx.fillStyle = '#FFF';
        ctx.fillText(l, W / 2, yy);
      });
    }),
  );
  return y + h;
}

/** A text-only panel: white, black, or a phone notes page. */
function textPanel(ctx: Ctx, b: StoryBeat, local: number): void {
  const look = b.a.trim().toLowerCase();
  const s = clean(b.headline);
  if (look === 'notes') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);
    font(ctx, 40, 600, FONT.board);
    ctx.fillStyle = '#E0A800';
    ctx.textAlign = 'left';
    ctx.fillText('‹ Notes', 60, 290);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
    ctx.lineWidth = 2;
    for (let y = 420; y < H; y += 74) {
      ctx.beginPath();
      ctx.moveTo(60, y);
      ctx.lineTo(W - 60, y);
      ctx.stroke();
    }
    const c = fit(ctx, s, { maxW: W - 140, maxH: 1100, max: 64, min: 34, weight: 600, family: FONT.board, lh: 1.25 });
    font(ctx, c.size, 600, FONT.board);
    ctx.fillStyle = '#111';
    c.lines.forEach((l, i) => ctx.fillText(l, 70, 400 + c.lh * (i + 0.8)));
    return;
  }
  const dark = look !== 'white';
  ctx.fillStyle = dark ? '#000' : '#FFF';
  ctx.fillRect(0, 0, W, H);
  const c = fit(ctx, s, { maxW: 920, maxH: 1000, max: 96, min: 40, weight: 800, family: FONT.meme, lh: 1.16 });
  const top = 940 - (c.lines.length * c.lh) / 2;
  const p = easeOut(prog(local, 0, 0.12));
  withAlpha(ctx, lerp(0.6, 1, p), () => {
    font(ctx, c.size, 800, FONT.meme);
    ctx.fillStyle = dark ? '#FFF' : '#000';
    ctx.textAlign = 'center';
    c.lines.forEach((l, i) => ctx.fillText(l, W / 2, top + c.lh * (i + 0.82)));
  });
}

function panel(ctx: Ctx, env: Env, beats: StoryBeat[], i: number, local: number): void {
  const b = beats[i];
  const f = env.fields;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const v = fxView(b, local);
  // Shake moves the whole frame.
  ctx.save();
  ctx.translate(W / 2 + v.dx, H / 2 + v.dy);
  if (v.rot) ctx.rotate(v.rot);
  ctx.translate(-W / 2, -H / 2);
  if (b.visual === 'text') {
    textPanel(ctx, b, local);
    ctx.restore();
    return;
  }
  const layout = b.layout || str(f, 'layout') || 'top';
  const size = mediaSize(env, b) ?? { w: 1080, h: 1080 };
  const aspect = size.h / size.w;
  const pop = i === 0 ? 1 : prog(local, 0, 0.16);
  let rect: Rect;
  if (layout === 'over') {
    rect = { x: 0, y: 0, w: W, h: H };
  } else if (layout === 'impact') {
    const h = Math.min(1500, W * aspect);
    rect = { x: 0, y: 960 - h / 2, w: W, h };
  } else {
    // Top: a white caption bar, the picture right under it, the pair centred.
    const cap = clean(b.headline);
    const c = cap ? fit(ctx, cap, { maxW: 960, maxH: 520, max: 64, min: 36, maxLines: 6, weight: 800, family: FONT.meme, lh: 1.18 }) : null;
    const barH = c ? c.lines.length * c.lh + 70 : 0;
    const mh = Math.min(1500 - barH, W * aspect);
    const top = Math.max(230, 960 - (barH + mh) / 2);
    if (c) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, top, W, barH);
      font(ctx, c.size, 800, FONT.meme);
      ctx.fillStyle = '#000';
      ctx.textAlign = 'left';
      c.lines.forEach((l, k) => ctx.fillText(l, 60, top + 35 + c.lh * (k + 0.8)));
    }
    rect = { x: 0, y: top + barH, w: W, h: mh };
  }
  // Media, with the zoom punch inside its own frame.
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();
  const zr = fxView(b, local, rect);
  const settle = i === 0 ? 1 : lerp(1.05, 1, easeOut(prog(local, 0, 0.14)));
  ctx.translate(rect.x + rect.w / 2, rect.y + rect.h / 2);
  ctx.scale(zr.z * settle, zr.z * settle);
  ctx.translate(-zr.fx, -zr.fy);
  drawMedia(ctx, env, b, local, rect);
  ctx.restore();
  // Text on the picture.
  if (layout === 'impact') {
    impactText(ctx, b.headline, rect, true, pop);
    if (b.visual !== 'char' && b.b) impactText(ctx, b.b, rect, false, pop);
  } else if (layout === 'over') {
    overText(ctx, b.headline, 330, pop);
    if (b.visual !== 'char' && b.b) overText(ctx, b.b, 1330, pop, 70);
  }
  // A mascot panel's big word, over it.
  if (b.visual === 'char' && b.b) {
    const a = easeBack(prog(local, 0.25, 0.3));
    withAlpha(ctx, clamp01(a), () => impactText(ctx, b.b, { x: rect.x, y: rect.y + rect.h * 0.04, w: rect.w, h: rect.h }, true, a));
  }
  ctx.restore();
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  panel(ctx, env, beats, i, local);
  fxPost(ctx, b, local);
}

registerPreset('meme', draw);
