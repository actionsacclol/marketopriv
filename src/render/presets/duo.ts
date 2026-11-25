import { num, storyBeats, str, type StoryBeat } from '@shared/presets';
import { duoLines, duoParts, DUO_SETS, type DuoLine, type DuoSet } from '@shared/duo';
import { isAction, type Action } from '@shared/character';
import { mouthAt } from '../char3d';
import { SHOTS, mixShot, renderDuo, type DuoOut, type Shot } from '../duo3d';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { wordTimesOf } from './narrated';
import { DARK, parseWords, storyVisual, type Word } from './story';
import { FONT, H, W, clamp01, easeBack, easeInOut, easeOut, fit, font, hexA, lerp, logo, markLightFrame, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';

// Ask the AI: a person asks, the AI character answers, in a low-poly 3D room (duo3d.ts). The reel opens full screen
// on the two of them; from the first part= line a board covers the top half: the parts as tabs, the part's name, and
// the diagram of the latest line that named one (the story preset's diagrams, drawn smaller). Captions sit on the
// seam between the board and the room. The asker's lines are speech bubbles unless the reel has them spoken.

const BOARD = { x: 36, y: 176, w: 1008, h: 836 };
const CONTENT = { top: 400, cy: 712, k: 0.92 };
/** Diagrams that run taller than the rest are drawn smaller, so nothing is cut off at the board's edge. */
const SCALE: Record<string, number> = { chart: 0.8, card: 0.82, dots: 0.8, wallet: 0.86, bars: 0.86, poll: 0.86, coin: 0.8, lag: 0.82, flow: 0.82 };
const VY = 1010; // the story diagrams' own centre

const HIGHLIGHTS: Record<string, string> = { yellow: '#FDE047', green: '#4ADE80', white: '#FFFFFF' };
const highlightOf = (env: Env): string => HIGHLIGHTS[str(env.fields, 'highlight')] ?? (str(env.fields, 'highlight') === 'accent' ? env.accent[1] : HIGHLIGHTS.yellow);
const setOf = (env: Env): DuoSet => (DUO_SETS as readonly string[]).includes(str(env.fields, 'set')) ? (str(env.fields, 'set') as DuoSet) : 'studio';
const hexOr = (v: string, d: string): string => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);

const tagOf = (b: StoryBeat, name: string): string => {
  const hit = b.tags.find((t) => t.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : '';
};

/** What the one talking does on this line. */
function moveOf(b: StoryBeat, l: DuoLine): Action {
  const act = tagOf(b, 'act');
  if (isAction(act)) return act;
  if (l.end) return 'wave';
  // A question nobody hears still has to read as one.
  if (l.asker && !b.say) return /\?\s*$/.test(b.headline) ? 'shrug' : /!\s*$/.test(b.headline) ? 'shock' : 'point';
  return 'talk';
}

function shotOf(beats: StoryBeat[], lines: DuoLine[], k: number): Shot {
  if (lines[k].end) return k > 0 ? shotOf(beats, lines, k - 1) : SHOTS.wide;
  if (lines[k].part >= 0) return SHOTS.board;
  const cam = tagOf(beats[k], 'cam');
  if (cam === 'wide') return SHOTS.wide;
  if (cam === 'a' || cam === 'b') return SHOTS[cam];
  if (k === 0 && cam !== 'close') return SHOTS.wide;
  return lines[k].asker ? SHOTS.a : SHOTS.b;
}

/** When the run of lines this one belongs to (same speaker, same move) began: the move does not restart on every line. */
function runStart(beats: StoryBeat[], lines: DuoLine[], i: number): number {
  let k = i;
  while (k > 0 && lines[k - 1].asker === lines[i].asker && !lines[k - 1].end && moveOf(beats[k - 1], lines[k - 1]) === moveOf(beats[i], lines[i])) k--;
  return beats[k].start;
}

// ── The room ───────────────────────────────────────────────────────────────
function room(ctx: Ctx, env: Env, beats: StoryBeat[], lines: DuoLine[], i: number, local: number, t: number): { out: DuoOut; shot: Shot } {
  const b = beats[i];
  const l = lines[i];
  const glide = i > 0 && (l.part >= 0) !== (lines[i - 1].part >= 0);
  const cut = easeInOut(prog(local, 0, glide ? 0.5 : 0.16));
  let shot = i > 0 ? mixShot(shotOf(beats, lines, i - 1), shotOf(beats, lines, i), cut) : shotOf(beats, lines, 0);
  // A slow push-in while a full-screen line is said.
  if (l.part < 0 && !l.end) shot = { ...shot, vis: shot.vis * (1 - 0.045 * clamp01(local / b.dur)) };

  const move = moveOf(b, l);
  const since = t - runStart(beats, lines, i);
  const speak = b.voDur > 0 ? b.voDur : b.say.length / 14;
  // A bubble line: the mouth still moves for a moment, the way a silent comic panel reads.
  const talk = b.say ? mouthAt(b.say, local, b.voStart, speak) : l.asker ? mouthAt(b.headline, local, 0.1, Math.min(1.1, b.dur - 0.2)) : 0;
  const speaker = { action: move, local: since, talk, listen: l.end ? 0 : 0.3 };
  const other = { action: (l.end ? 'wave' : 'talk') as Action, local: l.end ? since : t, talk: 0, listen: l.end ? 0 : 1 };
  const out = renderDuo({
    set: setOf(env),
    t,
    shot,
    sign: str(env.fields, 'sign'),
    accent: env.accent[1],
    skin: str(env.fields, 'asker_skin') || 'brown',
    a: { ...(l.asker ? speaker : other), color: hexOr(str(env.fields, 'asker_color'), '#2F6F6A') },
    b: { ...(l.asker ? other : speaker), color: hexOr(str(env.fields, 'char_color'), '#8B5CF6') },
  });
  ctx.drawImage(out.canvas, 0, 0, W, H);
  // Darker towards the bottom, where captions and the platform's own text sit.
  const g = ctx.createLinearGradient(0, H * 0.62, 0, H);
  g.addColorStop(0, 'rgba(6,6,10,0)');
  g.addColorStop(1, 'rgba(6,6,10,0.62)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);
  return { out, shot };
}

// ── Cold open: chips in the top corner ─────────────────────────────────────
function chips(ctx: Ctx, beats: StoryBeat[], lines: DuoLine[], i: number, t: number, hi: string): void {
  let y = 250;
  for (let k = 0; k <= i; k++) {
    if (lines[k].reached >= 0) break;
    const c = beats[k];
    if (c.visual !== 'chip' || !c.a) continue;
    const a = easeBack(prog(t, c.start + 0.15, 0.32));
    const big = fit(ctx, c.a, { maxW: 520, maxH: 110, max: 92, min: 44, maxLines: 1, weight: 700 });
    font(ctx, big.size, 700);
    const wBig = ctx.measureText(c.a).width;
    font(ctx, 26, 600, FONT.mono);
    const wTag = c.b ? ctx.measureText(c.b.toUpperCase()).width + 36 : 0;
    const w = Math.max(wBig, wTag) + 56;
    const h = big.size * 1.1 + (c.b ? 62 : 22) + 20;
    if (a > 0)
      scaled(ctx, lerp(0.6, 1, a), 60 + w / 2, y + h / 2, () =>
        withAlpha(ctx, clamp01(a), () => {
          ctx.save();
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 30;
          ctx.shadowOffsetY = 10;
          rrect(ctx, 60, y, w, h, 24);
          ctx.fillStyle = 'rgba(14,14,20,0.94)';
          ctx.fill();
          ctx.restore();
          rrect(ctx, 60, y, w, h, 24);
          ctx.lineWidth = 3;
          ctx.strokeStyle = hexA(hi, 0.85);
          ctx.stroke();
          font(ctx, big.size, 700);
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(c.a, 88, y + 18 + big.size * 0.9);
          if (c.b) {
            font(ctx, 26, 600, FONT.mono);
            const ty = y + 18 + big.size * 1.1 + 8;
            rrect(ctx, 88, ty, wTag, 42, 12);
            ctx.fillStyle = hi;
            ctx.fill();
            ctx.fillStyle = '#0B0B0F';
            ctx.fillText(c.b.toUpperCase(), 106, ty + 31);
          }
        }),
      );
    y += h + 18;
  }
}

// ── The board ──────────────────────────────────────────────────────────────
function lock(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y - 5, 6, Math.PI, 0);
  ctx.stroke();
  rrect(ctx, x - 9, y - 5, 18, 14, 3);
  ctx.fillStyle = color;
  ctx.fill();
}

function tabs(ctx: Ctx, parts: string[], reached: number, since: number, hi: string): void {
  const n = parts.length;
  const gap = 12;
  const x0 = BOARD.x + 24;
  const w = (BOARD.w - 48 - gap * (n - 1)) / n;
  const y = BOARD.y + 62;
  const h = 84;
  parts.forEach((name, k) => {
    const x = x0 + k * (w + gap);
    const done = k < reached;
    const now = k === reached;
    const pulse = now ? 1 + 0.07 * (1 - easeOut(prog(since, 0, 0.45))) : 1;
    scaled(ctx, pulse, x + w / 2, y + h / 2, () => {
      rrect(ctx, x, y, w, h, 16);
      ctx.fillStyle = done ? hexA(hi, 0.92) : now ? hexA(hi, 0.16) : 'rgba(255,255,255,0.05)';
      ctx.fill();
      if (!done) {
        ctx.lineWidth = now ? 3 : 2;
        ctx.strokeStyle = now ? hi : 'rgba(255,255,255,0.12)';
        ctx.stroke();
      }
      const label = fit(ctx, name.toUpperCase(), { maxW: w - 70, maxH: h - 14, max: 28, min: 18, maxLines: 2, weight: 700, lh: 1.05 });
      font(ctx, label.size, 700);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const ix = x + 26;
      const iy = y + h / 2;
      if (done) {
        ctx.strokeStyle = '#0B0B0F';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ix - 8, iy);
        ctx.lineTo(ix - 2, iy + 7);
        ctx.lineTo(ix + 9, iy - 7);
        ctx.stroke();
        ctx.lineCap = 'butt';
      } else if (now) {
        ctx.beginPath();
        ctx.arc(ix, iy, 6, 0, Math.PI * 2);
        ctx.fillStyle = hi;
        ctx.fill();
      } else lock(ctx, ix, iy, 'rgba(255,255,255,0.4)');
      ctx.fillStyle = done ? '#0B0B0F' : now ? '#FFFFFF' : 'rgba(255,255,255,0.45)';
      label.lines.forEach((line, li) => ctx.fillText(line, x + 48, iy + 2 + (li - (label.lines.length - 1) / 2) * label.lh));
      ctx.textBaseline = 'alphabetic';
    });
  });
}

function board(ctx: Ctx, env: Env, beats: StoryBeat[], lines: DuoLine[], i: number, t: number, up: number, hi: string): void {
  // The part to show while it slides away after the last board line is the previous line's.
  const k = lines[i].part >= 0 ? i : i - 1;
  if (k < 0 || lines[k].part < 0) return;
  const l = lines[k];
  const parts = duoParts(str(env.fields, 'parts'));
  let first = k;
  while (first > 0 && lines[first - 1].reached === l.reached) first--;
  const since = t - beats[first].start;
  ctx.save();
  ctx.translate(0, lerp(-(BOARD.y + BOARD.h + 40), 0, up));
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 50;
  ctx.shadowOffsetY = 14;
  rrect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 34);
  ctx.fillStyle = 'rgba(13,13,19,0.95)';
  ctx.fill();
  ctx.restore();
  rrect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 34);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = hexA(hi, 0.45);
  ctx.stroke();

  // Header: the episode's name, and where we are.
  const c = ctx as Ctx & { letterSpacing?: string };
  const spacing = c.letterSpacing;
  c.letterSpacing = '3px';
  font(ctx, 24, 600, FONT.mono);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = hi;
  ctx.fillText(str(env.fields, 'board_title').toUpperCase(), BOARD.x + 30, BOARD.y + 42);
  if (parts.length) {
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(`PART ${Math.min(parts.length, l.reached + 1)} OF ${parts.length}`, BOARD.x + BOARD.w - 30, BOARD.y + 42);
  }
  if (spacing !== undefined) c.letterSpacing = spacing;
  if (parts.length) tabs(ctx, parts, l.reached, since, hi);

  const name = parts[l.reached] ?? '';
  const held = l.held;
  ctx.save();
  rrect(ctx, BOARD.x + 8, CONTENT.top - 50, BOARD.w - 16, BOARD.y + BOARD.h - CONTENT.top + 42, 26);
  ctx.clip();
  if (held < 0) {
    // The part opens on its name.
    const a = easeOut(prog(since, 0.1, 0.4));
    const f = fit(ctx, name.toUpperCase(), { maxW: 880, maxH: 260, max: 104, min: 48, maxLines: 2, weight: 700 });
    withAlpha(ctx, a, () => {
      font(ctx, 26, 600, FONT.mono);
      ctx.textAlign = 'center';
      ctx.fillStyle = hi;
      ctx.fillText(`PART ${l.reached + 1}`, W / 2, CONTENT.cy - (f.lines.length * f.lh) / 2 - 34 + (1 - a) * 20);
      font(ctx, f.size, 700);
      ctx.fillStyle = '#FFFFFF';
      f.lines.forEach((line, li) => ctx.fillText(line, W / 2, CONTENT.cy - (f.lines.length * f.lh) / 2 + f.lh * (li + 0.84) + (1 - a) * 30));
    });
  } else {
    // The part's name stays as a small heading over the diagram.
    font(ctx, 36, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(name.toUpperCase(), W / 2, CONTENT.top - 4);
    const hb = beats[held];
    const vl = t - hb.start;
    // A recording is as tall as its own shape makes it: fit that.
    const vs = env.videoSize;
    const shotH = hb.visual === 'screen' && vs && vs.w > 0 ? vs.h * Math.min(1000 / vs.w, 1080 / vs.h) + (hb.b ? 190 : 0) : 0;
    const k = shotH ? Math.min(0.95, 540 / shotH) : (SCALE[hb.visual] ?? CONTENT.k);
    ctx.translate(W / 2, CONTENT.cy + 22 - (shotH ? 30 * k : 0));
    ctx.scale(k, k);
    ctx.translate(-W / 2, -VY);
    storyVisual(ctx, env, DARK, beats, held, vl, easeOut(prog(vl, 0.08, 0.4)), true);
  }
  ctx.restore();
  ctx.restore();
}

// ── Captions ───────────────────────────────────────────────────────────────
function chunksOf(words: Word[], maxWords: number, maxChars: number): number[][] {
  const out: number[][] = [[]];
  let chars = 0;
  words.forEach((w, k) => {
    const cur = out[out.length - 1];
    if (cur.length && (cur.length >= maxWords || chars + w.text.length > maxChars)) {
      out.push([]);
      chars = 0;
    }
    out[out.length - 1].push(k);
    chars += w.text.length + 1;
    // A sentence ends the chunk, so a caption never straddles a full stop.
    if (/[.!?]$/.test(w.text) && k < words.length - 1) {
      out.push([]);
      chars = 0;
    }
  });
  return out.filter((c) => c.length);
}

function captions(ctx: Ctx, env: Env, b: StoryBeat, local: number, y: number, hi: string): void {
  const mode = str(env.fields, 'captions') || 'line';
  if (mode === 'off') return;
  const words = parseWords(b.headline);
  if (!words.length) return;
  const times = wordTimesOf(b, words.map((w) => w.text), num(env.fields, 'wps', 3));
  let cur = 0;
  times.forEach((at, k) => {
    if (local >= at) cur = k;
  });
  const pop = mode === 'words';
  const groups = chunksOf(words, pop ? 3 : 4, pop ? 14 : 24);
  const g = groups.find((c) => c.includes(cur)) ?? groups[0];
  const size = pop ? 78 : 52;
  const family = pop ? FONT.meme : FONT.sans;
  const weight = pop ? 800 : 600;
  font(ctx, size, weight, family);
  const space = ctx.measureText(' ').width;
  const widths = g.map((k) => ctx.measureText(words[k].text).width);
  const total = widths.reduce((a, w) => a + w, 0) + space * (g.length - 1);
  const k0 = Math.min(1, 940 / total);
  const since = local - times[g[0]];
  const enter = pop ? lerp(0.7, 1, easeBack(prog(since, 0, 0.18))) : 1;
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.scale(k0 * enter, k0 * enter);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  let x = -total / 2;
  g.forEach((k, gi) => {
    const said = k === cur && local >= times[k];
    ctx.lineWidth = size * (pop ? 0.2 : 0.16);
    ctx.strokeStyle = 'rgba(6,6,10,0.82)';
    ctx.strokeText(words[k].text, x, 0);
    ctx.fillStyle = said || (pop && words[k].accent) ? hi : '#FFFFFF';
    ctx.fillText(words[k].text, x, 0);
    x += widths[gi] + space;
  });
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

/** The asker's line as a speech bubble over their head. */
function bubble(ctx: Ctx, text: string, head: { x: number; y: number }, headR: number, local: number, minY: number): void {
  const a = easeBack(prog(local, 0.08, 0.3));
  if (a <= 0) return;
  const f = fit(ctx, text.replace(/\*/g, ''), { maxW: 560, maxH: 200, max: 54, min: 34, maxLines: 3, weight: 700 });
  font(ctx, f.size, 700);
  const tw = Math.max(...f.lines.map((l) => ctx.measureText(l).width));
  const w = tw + 64;
  const h = f.lines.length * f.lh + 44;
  const cx = Math.min(W - 40 - w / 2, Math.max(40 + w / 2, head.x * W + 30));
  const bottom = Math.max(minY + h, head.y * H - headR - 26);
  const top = bottom - h;
  scaled(ctx, lerp(0.5, 1, a), cx, bottom, () =>
    withAlpha(ctx, clamp01(a * 1.4), () => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#FFFFFF';
      rrect(ctx, cx - w / 2, top, w, h, 30);
      ctx.fill();
      ctx.restore();
      // Tail towards the head.
      const tx = Math.min(cx + w / 2 - 50, Math.max(cx - w / 2 + 50, head.x * W));
      ctx.beginPath();
      ctx.moveTo(tx - 20, bottom - 2);
      ctx.lineTo(tx + 20, bottom - 2);
      ctx.lineTo(tx - 4, bottom + 26);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      font(ctx, f.size, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#0B0B0F';
      f.lines.forEach((l, li) => ctx.fillText(l, cx, top + 22 + f.lh * (li + 0.8)));
    }),
  );
}

// ── End card ───────────────────────────────────────────────────────────────
function accentLine(ctx: Ctx, text: string, y: number, size: number, hi: string): void {
  // Marked words that follow each other share one label ("*part two*").
  const words: Word[] = [];
  for (const w of parseWords(text)) {
    const last = words[words.length - 1];
    if (w.accent && last?.accent) last.text += ` ${w.text}`;
    else words.push({ ...w });
  }
  font(ctx, size, 600);
  const space = ctx.measureText(' ').width;
  const widths = words.map((w) => ctx.measureText(w.text).width + (w.accent ? 28 : 0));
  const total = widths.reduce((a, w) => a + w, 0) + space * (words.length - 1);
  const k = Math.min(1, 920 / total);
  ctx.save();
  ctx.translate(W / 2, y);
  ctx.scale(k, k);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let x = -total / 2;
  words.forEach((w, i) => {
    if (w.accent) {
      rrect(ctx, x, -size * 0.66, widths[i], size * 1.3, 12);
      ctx.fillStyle = hi;
      ctx.fill();
      ctx.fillStyle = '#0B0B0F';
      ctx.fillText(w.text, x + 14, 2);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.fillText(w.text, x, 2);
    }
    x += widths[i] + space;
  });
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function endCard(ctx: Ctx, env: Env, b: StoryBeat, local: number, hi: string): void {
  const p = easeOut(prog(local, 0, 0.45));
  withAlpha(ctx, p, () => {
    ctx.fillStyle = 'rgba(8,8,12,0.9)';
    ctx.fillRect(0, 0, W, H);
  });
  const cy = env.logo ? 660 : 560;
  if (env.logo) {
    const a = easeBack(prog(local, 0.1, 0.4));
    scaled(ctx, lerp(0.6, 1, a) * (1 + 0.02 * Math.sin(local * 3)), W / 2, cy, () =>
      withAlpha(ctx, clamp01(a), () => {
        const g = ctx.createRadialGradient(W / 2, cy, 20, W / 2, cy, 230);
        g.addColorStop(0, hexA(hi, 0.22));
        g.addColorStop(1, hexA(hi, 0.03));
        ctx.beginPath();
        ctx.arc(W / 2, cy, 230, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        logo(ctx, env, W / 2, cy, 190);
      }),
    );
  }
  const f = fit(ctx, b.headline.replace(/\*/g, ''), { maxW: 900, maxH: 330, max: 78, min: 44, maxLines: 3, weight: 700, lh: 1.16 });
  const top = cy + (env.logo ? 280 : 60);
  withAlpha(ctx, easeOut(prog(local, 0.25, 0.4)), () => {
    font(ctx, f.size, 700);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    f.lines.forEach((l, li) => ctx.fillText(l, W / 2, top + f.lh * (li + 0.8)));
  });
  const y2 = top + f.lines.length * f.lh + 90;
  if (b.a) withAlpha(ctx, easeOut(prog(local, 0.55, 0.4)), () => accentLine(ctx, b.a, y2, 44, hi));
  if (b.b)
    withAlpha(ctx, easeOut(prog(local, 0.8, 0.4)), () => {
      font(ctx, 30, 500, FONT.mono);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(b.b, W / 2, y2 + 92);
    });
}

// ── Frame ──────────────────────────────────────────────────────────────────
function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const lines = duoLines(beats);
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((b) => t >= b.start && t < b.start + b.dur));
  const b = beats[i];
  const l = lines[i];
  const local = t - b.start;
  const hi = highlightOf(env);
  const on = (k: number): number => (k >= 0 && lines[k].part >= 0 ? 1 : 0);
  const up = lerp(on(i - 1), on(i), easeInOut(prog(local, 0, 0.5)));

  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  const { out, shot } = room(ctx, env, beats, lines, i, local, t);
  if (up < 1 && !l.end && (l.reached < 0 || (i > 0 && lines[i - 1].reached < 0))) withAlpha(ctx, 1 - up, () => chips(ctx, beats, lines, i, t, hi));
  if (up > 0.001) board(ctx, env, beats, lines, i, t, up, hi);
  if (l.end) endCard(ctx, env, b, local, hi);
  else if (l.asker && !b.say) bubble(ctx, b.headline, out.a, (0.5 * H) / shot.vis, local, up > 0.5 ? BOARD.y + BOARD.h + 14 : 230);
  else {
    let y = lerp(1500, BOARD.y + BOARD.h + 62, up);
    if (env.bannerTop !== null) y = Math.min(y, env.bannerTop - 70);
    captions(ctx, env, b, local, y, hi);
  }
  ctx.restore();
  fxPost(ctx, b, local);
  markLightFrame(false);
}

registerPreset('duo', draw);
