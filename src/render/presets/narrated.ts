import { num, storyBeats, str, type StoryBeat } from '@shared/presets';
import { list } from '@shared/sfx';
import { FONT, H, W, clamp01, easeBack, easeOut, fit, font, imageOf, lerp, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';
import { coverVideo, drawBackground } from './backgrounds';
import { applyView, fxMoves, fxPost, fxView } from './fx';

// Narrated story: the Reddit-story / greentext format. A moving background
// (drawn by Marketo, or the user's own footage) under big captions that pop in
// a few words at a time as the voice reads them. A post line shows a forum post
// card while its title is read; green lines stack up on a greentext board.

const CAPTION_Y = 960;
const COLORS: Record<string, string> = { yellow: '#FFE03D', green: '#4ADE80', white: '#FFFFFF' };

function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 997;
}

const clean = (s: string): string => s.replace(/\*/g, '');

/** When each word of a line is said: by its share of the letters while the voice speaks, else at the reading speed. */
export function wordTimesOf(b: StoryBeat, words: string[], wps: number): number[] {
  // ElevenLabs' own timings, when the caption has the same words as the spoken line.
  if (b.voWords && b.voWords.length === words.length) return b.voWords.map((s) => b.voStart + s);
  if (b.voDur > 0) {
    const total = words.reduce((n, w) => n + w.length + 1, 0);
    let acc = 0;
    return words.map((w) => {
      const t = b.voStart + b.voDur * 0.95 * (acc / total);
      acc += w.length + 1;
      return t;
    });
  }
  return words.map((_, i) => b.voStart + i / Math.max(0.5, wps));
}

/** Words grouped the way story channels caption: up to 3 words / ~16 letters, breaking after punctuation. */
function chunks(words: string[]): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  words.forEach((w, i) => {
    if (cur.length && (cur.length >= 3 || len + w.length > 16)) {
      out.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(i);
    len += w.length + 1;
    if (/[.,!?;:]$/.test(w)) {
      out.push(cur);
      cur = [];
      len = 0;
    }
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Outlined caption words on one or more lines, the spoken word in colour. Returns nothing; centred on cy. */
function captionWords(ctx: Ctx, words: string[], lit: number, cy: number, size: number, color: string, pop: number): void {
  font(ctx, size, 900, FONT.meme);
  const space = ctx.measureText(' ').width;
  // Wrap to 900px.
  const lines: number[][] = [[]];
  let w = 0;
  words.forEach((word, i) => {
    const ww = ctx.measureText(word).width;
    if (lines[lines.length - 1].length && w + space + ww > 920) {
      lines.push([]);
      w = 0;
    }
    w += (lines[lines.length - 1].length ? space : 0) + ww;
    lines[lines.length - 1].push(i);
  });
  const lh = size * 1.12;
  const top = cy - (lines.length * lh) / 2;
  scaled(ctx, lerp(0.72, 1, easeBack(pop)), W / 2, cy, () => {
    ctx.textAlign = 'left';
    ctx.lineJoin = 'round';
    lines.forEach((ln, li) => {
      const widths = ln.map((i) => ctx.measureText(words[i]).width);
      let x = W / 2 - (widths.reduce((s, v) => s + v, 0) + space * (ln.length - 1)) / 2;
      const y = top + li * lh + lh * 0.8;
      ln.forEach((i, k) => {
        ctx.lineWidth = size * 0.2;
        ctx.strokeStyle = '#000';
        ctx.strokeText(words[i], x, y);
        ctx.fillStyle = i === lit ? color : '#FFFFFF';
        ctx.fillText(words[i], x, y);
        x += widths[k] + space;
      });
    });
  });
}

export function captions(ctx: Ctx, env: Env, b: StoryBeat, local: number, cy: number, litColor?: string): void {
  const mode = str(env.fields, 'captions') || 'words';
  if (mode === 'off') return;
  const text = clean(b.headline).trim();
  if (!text) return;
  const words = text.split(/\s+/).filter(Boolean);
  const times = wordTimesOf(b, words, num(env.fields, 'wps', 3.2));
  const cc = str(env.fields, 'caption_color');
  const color = litColor ?? (cc === 'accent' ? env.accent[1] : (COLORS[cc] ?? COLORS.yellow));
  let lit = -1;
  for (let i = 0; i < words.length; i++) if (local >= times[i]) lit = i;
  if (mode === 'line') {
    if (local < times[0] - 0.05) return;
    const size = fit(ctx, text, { maxW: 920, maxH: 420, max: 86, maxLines: 4, weight: 900, family: FONT.meme }).size;
    captionWords(ctx, words, lit, cy, size, color, prog(local, times[0], 0.14));
    return;
  }
  const groups = chunks(words);
  const gi = groups.findIndex((g, k) => local >= times[g[0]] && (k === groups.length - 1 || local < times[groups[k + 1][0]]));
  if (gi < 0) return;
  const g = groups[gi];
  const shown = g.map((i) => words[i]);
  const size = fit(ctx, shown.join(' '), { maxW: 900, maxH: 300, max: 112, maxLines: 2, weight: 900, family: FONT.meme }).size;
  captionWords(ctx, shown, g.indexOf(lit), cy, size, color, prog(local, times[g[0]], 0.12));
}

// ── Post card ──────────────────────────────────────────────────────────────
function arrow(ctx: Ctx, x: number, y: number, s: number, up: boolean, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  if (!up) ctx.rotate(Math.PI);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.55);
  ctx.lineTo(s * 0.5, 0);
  ctx.lineTo(s * 0.22, 0);
  ctx.lineTo(s * 0.22, s * 0.5);
  ctx.lineTo(-s * 0.22, s * 0.5);
  ctx.lineTo(-s * 0.22, 0);
  ctx.lineTo(-s * 0.5, 0);
  ctx.closePath();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function postCard(ctx: Ctx, env: Env, b: StoryBeat, local: number): void {
  const f = env.fields;
  const meta = b.a.split('·').map((x) => x.trim()).filter(Boolean);
  const sub = meta[0] || 'r/stories';
  const by = meta.slice(1).join(' · ') || 'u/anonymous';
  const [ups, comments] = list(b.b);
  const title = clean(b.headline);
  const part = str(f, 'part');
  const inP = local < 0 ? 1 : easeBack(prog(local, 0, 0.32));
  const outP = easeOut(prog(local, b.dur - 0.22, 0.22));
  const cardW = 940;
  const x = W / 2 - cardW / 2;
  const t = fit(ctx, title, { maxW: cardW - 96, maxH: 520, max: 58, min: 34, maxLines: 7, weight: 700, family: FONT.board, lh: 1.22 });
  const h = 150 + t.lines.length * t.lh + 130;
  const y = 860 - h / 2;
  withAlpha(ctx, clamp01(inP) * (1 - outP), () =>
    scaled(ctx, lerp(0.86, 1, inP) * lerp(1, 0.94, outP), W / 2, y + h / 2, () => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 12;
      rrect(ctx, x, y, cardW, h, 34);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.restore();
      // Header: community avatar, name, poster and age.
      const ax = x + 48 + 34;
      const ay = y + 48 + 34;
      ctx.fillStyle = '#FF4500';
      ctx.beginPath();
      ctx.arc(ax, ay, 34, 0, Math.PI * 2);
      ctx.fill();
      font(ctx, 34, 700, FONT.board);
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.fillText((sub.replace(/^r\//i, '')[0] ?? 'R').toUpperCase(), ax, ay + 12);
      ctx.textAlign = 'left';
      font(ctx, 34, 700, FONT.board);
      ctx.fillStyle = '#1A1A1B';
      ctx.fillText(sub, ax + 52, ay - 6);
      font(ctx, 28, 400, FONT.board);
      ctx.fillStyle = '#787C7E';
      ctx.fillText(by, ax + 52, ay + 30);
      if (part) {
        font(ctx, 28, 700, FONT.board);
        const pw = ctx.measureText(part).width + 36;
        rrect(ctx, x + cardW - 48 - pw, ay - 26, pw, 52, 26);
        ctx.fillStyle = '#FF4500';
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(part, x + cardW - 48 - pw + 18, ay + 10);
      }
      // Title.
      font(ctx, t.size, 700, FONT.board);
      ctx.fillStyle = '#1A1A1B';
      t.lines.forEach((l, i) => ctx.fillText(l, x + 48, y + 160 + t.lh * (i + 0.8)));
      // Footer: votes and comments.
      const fy = y + h - 64;
      rrect(ctx, x + 40, fy - 32, 250, 64, 32);
      ctx.fillStyle = '#F2F3F5';
      ctx.fill();
      arrow(ctx, x + 84, fy, 34, true, '#FF4500');
      font(ctx, 30, 700, FONT.board);
      ctx.fillStyle = '#1A1A1B';
      ctx.fillText(ups || '1', x + 112, fy + 11);
      arrow(ctx, x + 250, fy, 34, false, '#878A8C');
      rrect(ctx, x + 310, fy - 32, 200, 64, 32);
      ctx.fillStyle = '#F2F3F5';
      ctx.fill();
      // Speech bubble.
      ctx.strokeStyle = '#1A1A1B';
      ctx.lineWidth = 3.5;
      rrect(ctx, x + 340, fy - 15, 40, 28, 8);
      ctx.stroke();
      ctx.fillStyle = '#1A1A1B';
      ctx.fillText(comments || '0', x + 394, fy + 11);
    }),
  );
}

// ── Greentext board ────────────────────────────────────────────────────────
function boardLayout(ctx: Ctx, beats: StoryBeat[], i: number) {
  // Every green line from the first in this run up to this one.
  let s = i;
  while (s > 0 && beats[s - 1].visual === 'green') s--;
  const lines: Array<{ text: string; beat: number }> = [];
  for (let k = s; k <= i; k++) for (const l of beats[k].headline.split(/\s+\/\s+/)) if (l.trim()) lines.push({ text: clean(l.trim()), beat: k });
  const x = 70;
  const w = W - 140;
  const top = 330;
  const size = 56;
  font(ctx, size, 400, FONT.board);
  const lh = size * 1.3;
  // Wrap each line; scroll up when the board is full.
  const rows: Array<{ text: string; beat: number; green: boolean }> = [];
  for (const l of lines) {
    const parts: string[] = [];
    let cur = '';
    for (const word of l.text.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && ctx.measureText(next).width > w - 90) {
        parts.push(cur);
        cur = word;
      } else cur = next;
    }
    parts.push(cur);
    parts.forEach((p) => rows.push({ text: p, beat: l.beat, green: l.text.startsWith('>') }));
  }
  const maxRows = 13;
  const shownRows = rows.slice(-maxRows);
  const h = 150 + Math.max(4, shownRows.length) * lh + 50;
  return { s, rows: shownRows, x, w, top, size, lh, h };
}

/** The middle (canvas y) of the newest lines on the board: where a zoom on a greentext line aims. */
function newestLineY(ctx: Ctx, beats: StoryBeat[], i: number): number {
  const L = boardLayout(ctx, beats, i);
  const ks = L.rows.map((r, k) => (r.beat === i ? k : -1)).filter((k) => k >= 0);
  if (!ks.length) return H / 2;
  const mid = (ks[0] + ks[ks.length - 1]) / 2;
  return L.top + 150 + mid * L.lh - L.size * 0.35;
}

function greenBoard(ctx: Ctx, env: Env, beats: StoryBeat[], i: number, local: number): void {
  const f = env.fields;
  const dark = str(f, 'board_look') === 'dark';
  const C = dark ? { bg: '#1D1F21', page: 'rgba(16,17,19,0.94)', text: '#C5C8C6', green: '#B5BD68', name: '#5F89AC', meta: '#81A2BE' } : { bg: '#F0E0D6', page: 'rgba(255,255,238,0.96)', text: '#800000', green: '#789922', name: '#117743', meta: '#000000' };
  const { s, rows: shownRows, x, w, top, size, lh, h } = boardLayout(ctx, beats, i);
  // The board is there from frame 0 when the reel opens on it (the thumbnail).
  const enter = i === s && i > 0 ? easeOut(prog(local, 0, 0.3)) : 1;
  withAlpha(ctx, enter, () => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    rrect(ctx, x - 20, top - 20, w + 40, h + 40, 18);
    ctx.fillStyle = C.page;
    ctx.fill();
    ctx.restore();
    rrect(ctx, x, top, w, h, 10);
    ctx.fillStyle = C.bg;
    ctx.fill();
    // Header: name, today's date, a post number.
    const seed = seedOf(str(f, 'beats'));
    const d = new Date();
    const two = (n: number): string => String(n).padStart(2, '0');
    const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
    font(ctx, 34, 700, FONT.board);
    ctx.textAlign = 'left';
    ctx.fillStyle = C.name;
    const name = str(f, 'board') || 'Anonymous';
    ctx.fillText(name, x + 36, top + 66);
    const nw = ctx.measureText(name).width;
    font(ctx, 30, 400, FONT.board);
    ctx.fillStyle = C.meta;
    ctx.fillText(`${two(d.getMonth() + 1)}/${two(d.getDate())}/${String(d.getFullYear()).slice(2)}(${day})${two(seed % 24)}:${two((seed * 7) % 60)}:${two((seed * 13) % 60)} No.${48213372 + seed * 911}`, x + 36 + nw + 18, top + 66);
    font(ctx, size, 400, FONT.board);
    shownRows.forEach((r, k) => {
      const y = top + 150 + k * lh;
      const isNew = r.beat === i;
      const since = isNew ? local : 5;
      const a = easeOut(prog(since, 0, 0.18));
      withAlpha(ctx, a, () => {
        if (isNew) {
          ctx.fillStyle = dark ? 'rgba(181,189,104,0.12)' : 'rgba(120,153,34,0.12)';
          ctx.fillRect(x + 20, y - size * 0.95, w - 40, lh);
        }
        ctx.fillStyle = r.green ? C.green : C.text;
        ctx.fillText(r.text, x + 36 + (1 - a) * 20, y);
      });
    });
  });
}

// ── Image line ─────────────────────────────────────────────────────────────
function imageLine(ctx: Ctx, b: StoryBeat, local: number): number {
  const img = imageOf(b.a);
  const box = { w: 900, h: 760 };
  const cy = 700;
  const p = easeBack(prog(local, 0, 0.3));
  if (!img) return cy + box.h / 2;
  const s = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  withAlpha(ctx, clamp01(p), () =>
    scaled(ctx, lerp(0.85, 1, p), W / 2, cy, () => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 40;
      rrect(ctx, W / 2 - w / 2, cy - h / 2, w, h, 24);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();
      ctx.save();
      rrect(ctx, W / 2 - w / 2, cy - h / 2, w, h, 24);
      ctx.clip();
      ctx.drawImage(img, W / 2 - w / 2, cy - h / 2, w, h);
      ctx.restore();
    }),
  );
  if (b.b) {
    const c = fit(ctx, b.b, { maxW: 860, maxH: 120, max: 44, maxLines: 2, weight: 700, family: FONT.meme });
    font(ctx, c.size, 700, FONT.meme);
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    c.lines.forEach((l, k) => {
      const y = cy + h / 2 + 60 + k * c.lh;
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#000';
      ctx.strokeText(l, W / 2, y);
      ctx.fillStyle = '#FFF';
      ctx.fillText(l, W / 2, y);
    });
  }
  return cy + h / 2 + (b.b ? 140 : 0);
}

// ── Frame ──────────────────────────────────────────────────────────────────
function background(ctx: Ctx, env: Env): void {
  const f = env.fields;
  const kind = str(f, 'bg') || 'runner';
  if (kind === 'video') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    if (env.video && env.videoSize) coverVideo(ctx, env.video, env.videoSize);
    else {
      font(ctx, 34, 600, FONT.mono);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'center';
      ctx.fillText(str(f, 'video') ? 'loading background…' : 'background video goes here', W / 2, 1500);
    }
  } else if (kind === 'none') {
    ctx.fillStyle = '#0B0B10';
    ctx.fillRect(0, 0, W, H);
  } else drawBackground(ctx, kind, env.t, seedOf(str(f, 'beats').slice(0, 80)));
  const dim = num(f, 'bg_dim', 0.15);
  if (dim > 0) {
    ctx.fillStyle = `rgba(0,0,0,${dim})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function partBadge(ctx: Ctx, env: Env, b: StoryBeat): void {
  const part = str(env.fields, 'part');
  if (!part || b.visual === 'post') return;
  font(ctx, 34, 800, FONT.meme);
  const w = ctx.measureText(part).width + 44;
  rrect(ctx, 70, 250, w, 64, 32);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.fillText(part, 92, 294);
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const view = fxView(b, local);
  // Greentext: a zoom aims at the newest line and stays small enough to keep the whole line on screen.
  if (b.visual === 'green' && view.z > 1) {
    const e = clamp01((view.z - 1) / 0.85);
    view.z = 1 + 0.2 * e;
    view.fx = W / 2;
    view.fy = lerp(H / 2, newestLineY(ctx, beats, i), e);
  }
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  background(ctx, env);
  let capY = CAPTION_Y;
  switch (b.visual) {
    case 'post':
      postCard(ctx, env, b, local);
      capY = -1;
      break;
    case 'green':
      greenBoard(ctx, env, beats, i, local);
      capY = -1;
      break;
    case 'image':
      capY = Math.min(1420, imageLine(ctx, b, local) + 120);
      break;
    default:
      break;
  }
  ctx.restore();
  // Captions shake with the picture but never zoom: a punch-in would push the words off the screen.
  if (capY > 0) {
    ctx.save();
    const still = { ...view, z: 1, fx: W / 2, fy: H / 2 };
    if (fxMoves(still)) applyView(ctx, still);
    captions(ctx, env, b, local, capY);
    ctx.restore();
  }
  partBadge(ctx, env, b);
  fxPost(ctx, b, local);
  // Loop: the last line fades into the opening frame.
  if (env.fields.loop === true && i === beats.length - 1) {
    const fade = prog(env.t, env.timing.body - 0.4, 0.4);
    if (fade > 0)
      withAlpha(ctx, fade, () => {
        background(ctx, { ...env, t: 0 });
        if (beats[0].visual === 'post') postCard(ctx, env, beats[0], -1);
      });
  }
}

registerPreset('narrated', draw);
