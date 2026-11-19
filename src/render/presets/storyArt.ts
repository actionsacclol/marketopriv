import { str, type StoryBeat } from '@shared/presets';
import { isAction, type Action, type Art } from '@shared/character';
import { LABEL_AT } from '@shared/sfx';
import { FONT, H, W, clamp01, easeBack, easeOut, fit, font, lerp, prog, rrect, withAlpha, type Ctx, type Env } from '../engine';
import { mouthAt, renderCharacter } from '../char3d';
import { parseWords, wordTimes, type Word } from './story';

// Story art styles (cartoon, ps2, 3d): the backdrop, the mascot, the lettering
// and the little effects around the mascot's head. story.ts calls these from
// its scene when the reel's art field is not "flat".

export type StoryArt = 'flat' | Art;

export const artOf = (f: Env['fields']): StoryArt => {
  const a = str(f, 'art');
  return a === 'cartoon' || a === 'ps2' || a === '3d' ? a : 'flat';
};

const HEAD_TOP = 340;
const CARTOON_BG = ['#FFC83D', '#4CC9F0', '#FF6B9A', '#8BE07A', '#B79CFF'];
const SIDES = [0, -0.55, 0.55, -0.3, 0.3];
const ZOOM: Record<Action, number> = { talk: 0.45, point: 0.1, present: 0.2, shrug: 0.3, shock: 0.65, cheer: 0, think: 0.6, wave: 0.2, facepalm: 0.55, sad: 0.45, laugh: 0.4 };

function hash(n: number): number {
  const x = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

const colorOf = (f: Env['fields']): string => {
  const c = str(f, 'char_color');
  return /^#[0-9a-f]{6}$/i.test(c) ? c : '#8B5CF6';
};

// ── Backdrops ──────────────────────────────────────────────────────────────
export function artBackdrop(ctx: Ctx, env: Env, art: Art, i: number): void {
  if (art === 'cartoon') {
    const bg = CARTOON_BG[i % CARTOON_BG.length];
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // Sunburst turning slowly behind the mascot.
    const cx = W / 2;
    const cy = H * 0.56;
    const rays = 18;
    const rot = env.t * 0.12;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    for (let k = 0; k < rays; k++) {
      const a0 = rot + (k / rays) * Math.PI * 2;
      const a1 = a0 + Math.PI / rays;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * 2400, cy + Math.sin(a0) * 2400);
      ctx.lineTo(cx + Math.cos(a1) * 2400, cy + Math.sin(a1) * 2400);
      ctx.closePath();
      ctx.fill();
    }
    // Halftone dots fading in from the corners.
    ctx.fillStyle = 'rgba(0,0,0,0.09)';
    const step = 34;
    for (let y = 0; y < H; y += step)
      for (let x = (y / step) % 2 ? step / 2 : 0; x < W; x += step) {
        const d = Math.min(Math.hypot(x, y), Math.hypot(W - x, H - y)) / 900;
        const r = (1 - Math.min(1, d)) * 9;
        if (r < 0.8) continue;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.restore();
    return;
  }
  if (art === '3d') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#F6F3FF');
    g.addColorStop(0.62, '#E4DDF7');
    g.addColorStop(1, '#CFC5EE');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Studio floor: a soft pool of light under the mascot.
    const f = ctx.createRadialGradient(W / 2, H * 0.8, 40, W / 2, H * 0.8, 700);
    f.addColorStop(0, 'rgba(255,255,255,0.75)');
    f.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = f;
    ctx.fillRect(0, 0, W, H);
    return;
  }
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
}

// ── Mascot ─────────────────────────────────────────────────────────────────
export interface HeadPos {
  x: number;
  y: number;
  size: number;
}

export function drawMascot(ctx: Ctx, env: Env, art: Art, b: StoryBeat, i: number, local: number, place: 'stage' | 'corner'): HeadPos {
  const act: Action = isAction(b.visual) ? b.visual : place === 'corner' ? 'present' : 'talk';
  const speak = b.voDur > 0 ? b.voDur : b.say.length / 14;
  const talk = mouthAt(b.say, local, b.voStart, speak);
  const zoom = b.a ? Math.min(ZOOM[act], 0.2) : ZOOM[act];
  const out = renderCharacter({ art, action: act, local, t: env.t, talk, place, side: SIDES[i % SIDES.length], zoom, low: !!b.a, accent: env.accent[1], color: colorOf(env.fields) });
  ctx.save();
  if (art === 'ps2') ctx.imageSmoothingEnabled = false;
  ctx.drawImage(out.canvas, 0, 0, W, H);
  ctx.restore();
  if (art === 'ps2') {
    // CRT-ish scanlines and a soft vignette.
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  }
  return { x: out.head.x * W, y: out.head.y * H, size: out.headSize * H };
}

// ── Lettering ──────────────────────────────────────────────────────────────
function layout(ctx: Ctx, words: Word[], maxW: number, start: number, min: number, maxLines: number, weight: number, family = FONT.sans): { size: number; lines: Word[][] } {
  for (let size = start; ; size = Math.floor(size * 0.94)) {
    font(ctx, size, weight, family);
    const space = ctx.measureText(' ').width;
    const lines: Word[][] = [[]];
    let w = 0;
    for (const word of words) {
      const ww = ctx.measureText(word.text).width;
      if (lines[lines.length - 1].length && w + space + ww > maxW) {
        lines.push([]);
        w = 0;
      }
      w += (lines[lines.length - 1].length ? space : 0) + ww;
      lines[lines.length - 1].push(word);
    }
    if (lines.length <= maxLines || size <= min) return { size, lines };
  }
}

/** Comic lettering: white words with a thick ink outline that pop in, tilted a touch, as they are spoken. */
export function cartoonHeadline(ctx: Ctx, env: Env, b: StoryBeat, local: number, instant: boolean, ghost: boolean): void {
  const words = parseWords(b.headline);
  if (!words.length) return;
  const { size, lines } = layout(ctx, words, 900, 80, 44, 3, 800);
  const times = wordTimes(env, b, words);
  font(ctx, size, 800);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const space = ctx.measureText(' ').width;
  const lh = size * 1.18;
  let idx = 0;
  lines.forEach((line, li) => {
    const widths = line.map((w) => ctx.measureText(w.text).width);
    const total = widths.reduce((a, c) => a + c, 0) + space * (line.length - 1);
    let x = W / 2 - total / 2;
    const y = HEAD_TOP + lh * (li + 0.85);
    line.forEach((w, wi) => {
      const since = instant ? 5 : local - times[idx];
      const shown = ghost && since < 0 ? 0.35 : 1;
      const a = since < 0 ? (ghost ? 1 : 0) : prog(since, 0, 0.28);
      if (a > 0) {
        const sc = since < 0 ? 1 : lerp(0.3, 1, easeBack(a));
        const rot = (hash(idx + b.start * 7) - 0.5) * 0.12;
        const cx = x + widths[wi] / 2;
        const cy = y - size * 0.35;
        ctx.save();
        ctx.globalAlpha *= shown * clamp01(a * 3);
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = '#0B0B10';
        ctx.fillText(w.text, x + size * 0.05, y + size * 0.09);
        ctx.lineWidth = size * 0.17;
        ctx.strokeStyle = '#0B0B10';
        ctx.strokeText(w.text, x, y);
        ctx.fillStyle = w.accent ? '#FFE14D' : '#FFFFFF';
        ctx.fillText(w.text, x, y);
        ctx.restore();
      }
      x += widths[wi] + space;
      idx++;
    });
  });
}

/** Game dialogue box: the speaker's name on a tab, the line typed out as it is spoken, a blinking arrow when done. */
export function dialogueBox(ctx: Ctx, env: Env, b: StoryBeat, local: number, instant: boolean, top: boolean): void {
  const words = parseWords(b.headline);
  if (!words.length) return;
  const x0 = 60;
  const bw = W - 120;
  const { size, lines } = layout(ctx, words, bw - 100, 60, 38, 3, 600);
  const lh = size * 1.3;
  const bh = Math.max(230, lines.length * lh + 90);
  const y0 = top ? 330 : 1500 - bh;
  const open = instant ? 1 : easeOut(prog(local, 0, 0.18));
  ctx.save();
  ctx.translate(W / 2, y0 + bh / 2);
  ctx.scale(1, lerp(0.05, 1, open));
  ctx.translate(-W / 2, -(y0 + bh / 2));
  // Box: deep blue gradient, double border.
  const g = ctx.createLinearGradient(0, y0, 0, y0 + bh);
  g.addColorStop(0, 'rgba(40,62,170,0.93)');
  g.addColorStop(1, 'rgba(10,16,70,0.93)');
  rrect(ctx, x0, y0, bw, bh, 22);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#E8ECFF';
  ctx.stroke();
  rrect(ctx, x0 + 10, y0 + 10, bw - 20, bh - 20, 14);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(160,180,255,0.6)';
  ctx.stroke();
  ctx.restore();
  if (open < 0.95) return;
  // Name tab.
  const name = (str(env.fields, 'char_name') || 'KIP').toUpperCase();
  font(ctx, 34, 700);
  const nw = ctx.measureText(name).width + 50;
  rrect(ctx, x0 + 30, y0 - 34, nw, 58, 12);
  ctx.fillStyle = '#F2C94C';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#0A1046';
  ctx.stroke();
  ctx.fillStyle = '#0A1046';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, x0 + 55, y0 - 4);
  // Typed text, in step with the voice.
  const chars = words.reduce((n, w) => n + w.text.length + 1, 0);
  const speak = b.voDur > 0 ? b.voDur * 0.92 : chars / 26;
  const shown = instant ? chars : Math.floor(chars * clamp01((local - b.voStart) / speak));
  font(ctx, size, 600);
  ctx.textBaseline = 'alphabetic';
  const space = ctx.measureText(' ').width;
  let n = 0;
  lines.forEach((line, li) => {
    let x = x0 + 50;
    const y = y0 + 58 + lh * (li + 0.62);
    for (const w of line) {
      const left = shown - n;
      if (left > 0) {
        const t = w.text.slice(0, left);
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(t, x + 3, y + 3);
        ctx.fillStyle = w.accent ? '#FFD95A' : '#FFFFFF';
        ctx.fillText(t, x, y);
      }
      n += w.text.length + 1;
      x += ctx.measureText(w.text).width + space;
    }
  });
  if (shown >= chars && Math.floor(env.t * 2.5) % 2 === 0) {
    const ax = x0 + bw - 60;
    const ay = y0 + bh - 40;
    ctx.beginPath();
    ctx.moveTo(ax - 14, ay - 10);
    ctx.lineTo(ax + 14, ay - 10);
    ctx.lineTo(ax, ay + 8);
    ctx.closePath();
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  }
}

/** The big word / number of a character beat, and its small line. */
export function actionLabel(ctx: Ctx, _env: Env, art: StoryArt, b: StoryBeat, local: number, instant: boolean): void {
  if (!b.a) return;
  const a = instant ? 1 : prog(local, LABEL_AT, 0.3);
  if (a <= 0) return;
  const y = art === 'ps2' ? 540 : art === 'cartoon' ? 800 : 720;
  const neg = /^\s*[-−]/.test(b.a);
  const pos = /^\s*\+/.test(b.a);
  const f = fit(ctx, b.a, { maxW: 820, maxH: 190, max: 170, maxLines: 1, weight: 800 });
  const sc = lerp(0.2, 1, easeBack(a));
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.scale(sc, sc);
  ctx.rotate(art === 'cartoon' ? -0.05 : 0);
  font(ctx, f.size, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const tw = ctx.measureText(b.a).width;
  if (art === 'cartoon') {
    // Starburst behind the word.
    const r0 = Math.max(tw / 2 + 60, f.size * 0.9);
    ctx.beginPath();
    for (let k = 0; k < 28; k++) {
      const ang = (k / 28) * Math.PI * 2;
      const r = k % 2 ? r0 * 0.8 : r0 * 1.05;
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * Math.min(r * 0.55, f.size * 1.05));
    }
    ctx.closePath();
    ctx.fillStyle = neg ? '#FF4D6D' : pos ? '#38D27A' : '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#0B0B10';
    ctx.stroke();
    ctx.lineWidth = f.size * 0.16;
    ctx.strokeStyle = '#0B0B10';
    ctx.strokeText(b.a, 0, 0);
    ctx.fillStyle = neg || pos ? '#FFFFFF' : '#FFE14D';
    ctx.fillText(b.a, 0, 0);
  } else if (art === 'ps2') {
    ctx.lineWidth = f.size * 0.14;
    ctx.strokeStyle = '#1A0B3A';
    ctx.strokeText(b.a, 0, 0);
    const g = ctx.createLinearGradient(0, -f.size / 2, 0, f.size / 2);
    g.addColorStop(0, neg ? '#FFB3B3' : '#FFF6B0');
    g.addColorStop(0.5, neg ? '#FF4040' : '#FFC93C');
    g.addColorStop(1, neg ? '#A01010' : '#C27400');
    ctx.fillStyle = g;
    ctx.fillText(b.a, 0, 0);
  } else {
    ctx.shadowColor = 'rgba(40,20,90,0.25)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 14;
    rrect(ctx, -tw / 2 - 50, -f.size * 0.72, tw + 100, f.size * 1.44, f.size * 0.4);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = neg ? '#E11D48' : pos ? '#16A34A' : '#0B0B0F';
    ctx.fillText(b.a, 0, 0);
  }
  ctx.restore();
  if (b.b)
    withAlpha(ctx, easeOut(prog(local, LABEL_AT + 0.2, 0.3)) || (instant ? 1 : 0), () => {
      const s = fit(ctx, b.b, { maxW: 860, maxH: 90, max: 42, maxLines: 2, weight: 700 });
      font(ctx, s.size, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      s.lines.forEach((line, k) => {
        const ly = y + f.size * 0.75 + 30 + k * s.lh;
        if (art === 'cartoon' || art === 'ps2') {
          ctx.lineWidth = 9;
          ctx.strokeStyle = art === 'ps2' ? '#0A1046' : '#0B0B10';
          ctx.strokeText(line, W / 2, ly);
          ctx.fillStyle = '#FFFFFF';
        } else ctx.fillStyle = 'rgba(11,11,15,0.6)';
        ctx.fillText(line, W / 2, ly);
      });
    });
}

// ── Effects around the head ────────────────────────────────────────────────
export function actionFx(ctx: Ctx, art: StoryArt, act: string, head: HeadPos, local: number): void {
  const ink = art === 'cartoon' ? '#0B0B10' : art === 'ps2' ? '#0A1046' : 'rgba(40,20,90,0.55)';
  const r = head.size * 0.6;
  const outlined = (draw: () => void, fill: string): void => {
    ctx.lineJoin = 'round';
    ctx.lineWidth = art === '3d' ? 0 : 7;
    ctx.strokeStyle = ink;
    ctx.fillStyle = fill;
    draw();
    ctx.fill();
    if (art !== '3d') ctx.stroke();
  };
  ctx.save();
  switch (act) {
    case 'shock': {
      // Ink lines bursting out, then "!".
      const u = prog(local, 0.02, 0.35);
      ctx.strokeStyle = art === '3d' ? '#7C3AED' : ink;
      ctx.lineCap = 'round';
      ctx.lineWidth = 12;
      for (let k = 0; k < 7; k++) {
        const ang = -Math.PI * (0.15 + (0.7 * k) / 6);
        const d0 = r * 1.15;
        const d1 = d0 + r * 0.55 * easeOut(u);
        ctx.beginPath();
        ctx.moveTo(head.x + Math.cos(ang) * d0, head.y + Math.sin(ang) * d0);
        ctx.lineTo(head.x + Math.cos(ang) * d1, head.y + Math.sin(ang) * d1);
        ctx.stroke();
      }
      break;
    }
    case 'think': {
      const u = prog(local, 0.25, 0.5);
      // Bubbles rise on the side with more room, and stay in frame.
      const dir = head.x > W / 2 ? -1 : 1;
      const inX = (x: number): number => Math.min(W - 90, Math.max(90, x));
      for (let k = 0; k < 3; k++) {
        const a = clamp01(u * 3 - k);
        if (a <= 0) continue;
        const cx = inX(head.x + dir * r * (0.9 + k * 0.32));
        const cy = Math.max(760 - k * 40, head.y - r * (0.9 + k * 0.42)) + 6 * Math.sin(local * 3 + k);
        withAlpha(ctx, a, () => outlined(() => {
          ctx.beginPath();
          ctx.arc(cx, cy, r * (0.09 + k * 0.06), 0, Math.PI * 2);
        }, '#FFFFFF'));
      }
      if (u >= 1) {
        font(ctx, r * 0.6, 800);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const qx = inX(head.x + dir * r * 1.55);
        const qy = Math.max(680, head.y - r * 2.05);
        ctx.lineWidth = 8;
        ctx.strokeStyle = ink;
        if (art !== '3d') ctx.strokeText('?', qx, qy);
        ctx.fillStyle = art === '3d' ? '#7C3AED' : '#FFE14D';
        ctx.fillText('?', qx, qy);
      }
      break;
    }
    case 'cheer': {
      // Confetti falling through the frame.
      const cols = ['#FF4D6D', '#FFE14D', '#4CC9F0', '#38D27A', '#B79CFF'];
      for (let k = 0; k < 46; k++) {
        const t0 = hash(k) * 0.6;
        const age = local - t0;
        if (age < 0) continue;
        const x = (hash(k + 50) * 1.2 - 0.1) * W + Math.sin(age * 3 + k) * 30;
        const y = -40 + age * (260 + 220 * hash(k + 9));
        if (y > H) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(age * (4 + 4 * hash(k + 3)));
        ctx.fillStyle = cols[k % cols.length];
        ctx.fillRect(-10, -5, 20, 10);
        ctx.restore();
      }
      break;
    }
    case 'sad': {
      const u = prog(local, 0.4, 1.2);
      if (u > 0) {
        const tx = head.x + r * 0.45;
        const ty = head.y + r * 0.1 + u * r * 0.9;
        withAlpha(ctx, 1 - u * 0.4, () => outlined(() => {
          ctx.beginPath();
          ctx.moveTo(tx, ty - r * 0.22);
          ctx.quadraticCurveTo(tx + r * 0.13, ty, tx, ty + r * 0.08);
          ctx.quadraticCurveTo(tx - r * 0.13, ty, tx, ty - r * 0.22);
        }, '#7CC8FF'));
      }
      break;
    }
    case 'facepalm':
    case 'shrug': {
      const u = prog(local, 0.35, 0.3);
      if (u > 0) {
        const tx = head.x + r * 0.95;
        const ty = head.y - r * 0.75 + (1 - easeOut(u)) * -20;
        outlined(() => {
          ctx.beginPath();
          ctx.moveTo(tx, ty - r * 0.2);
          ctx.quadraticCurveTo(tx + r * 0.12, ty, tx, ty + r * 0.08);
          ctx.quadraticCurveTo(tx - r * 0.12, ty, tx, ty - r * 0.2);
        }, '#BDE6FF');
      }
      break;
    }
    case 'laugh': {
      font(ctx, r * 0.42, 800);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      [0.2, 0.5, 0.8].forEach((t0, k) => {
        const a = prog(local, t0, 0.2);
        if (a <= 0) return;
        const x = head.x + (k % 2 ? -1 : 1) * r * (1.1 + 0.15 * k);
        const y = head.y - r * (0.6 + 0.35 * k);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((k % 2 ? -1 : 1) * 0.2);
        ctx.scale(easeBack(a), easeBack(a));
        ctx.lineWidth = 8;
        ctx.strokeStyle = ink;
        if (art !== '3d') ctx.strokeText('HA', 0, 0);
        ctx.fillStyle = art === '3d' ? '#7C3AED' : '#FFFFFF';
        ctx.fillText('HA', 0, 0);
        ctx.restore();
      });
      break;
    }
    default:
      break;
  }
  ctx.restore();
}

