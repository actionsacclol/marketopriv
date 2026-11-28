import { num, str, storyBeats, type StoryBeat } from '@shared/presets';
import { atWord } from '@shared/lecture';
import { isAction, type Action } from '@shared/character';
import { mouthAt, renderCharacter } from '../char3d';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { wordTimesOf } from './narrated';
import { DARK, LIGHT, parseWords, storyVisual, type Theme } from './story';
import { captions, endCard } from './duo';
import { FONT, H, W, clamp01, easeOut, font, hexA, markLightFrame, prog, registerPreset, rrect, withAlpha, type Ctx, type Env } from '../engine';

// A lecture reel: a short lesson on a board, the teacher (the brand's character) talking bottom right. Every line can
// put a card on the board (the story preset's diagrams); it lands on the word that names it (at=word), and stays up
// under the lines after it until the next card. Captions sit between the board and the teacher.

const BOARD = { x: 40, y: 196, w: 1000, h: 1010 };
const CONTENT = { cy: 700, k: 0.9 };
/** Diagrams that run taller than the rest are drawn smaller, so nothing is cut off at the board's edge. */
const SCALE: Record<string, number> = { chart: 0.8, card: 0.82, dots: 0.8, wallet: 0.84, bars: 0.86, poll: 0.84, coin: 0.8, lag: 0.82, flow: 0.82 };
const VY = 1010; // the story diagrams' own centre
const CAPTION_Y = 1296;

const HIGHLIGHTS: Record<string, string> = { yellow: '#FACC15', green: '#22C55E', orange: '#F97316' };
const hexOr = (v: string, d: string): string => (/^#[0-9a-f]{6}$/i.test(v) ? v : d);
const shows = (v: string): boolean => !!v && v !== 'none' && v !== 'end';

interface Look {
  light: boolean;
  bg: string;
  board: string;
  rule: string;
  theme: Theme;
}
const LOOKS: Record<string, Look> = {
  paper: { light: true, bg: '#EDE6D8', board: '#FBF8F1', rule: 'rgba(60,50,30,0.07)', theme: LIGHT },
  dark: { light: false, bg: '#0C0E13', board: '#151922', rule: 'rgba(255,255,255,0.05)', theme: DARK },
  chalk: { light: false, bg: '#1C2A22', board: '#22352B', rule: 'rgba(255,255,255,0.06)', theme: DARK },
};

/** How long after it starts each diagram first shows something (shared/sfx.ts has the same times): the card starts
 *  that much before its word, so what lands, lands on the word. */
const LEAD: Record<string, number> = { stamp: 0.35, steps: 0.2, number: 0.2, bars: 0.25, coin: 0.3, flow: 0.3, wallet: 0.12 };

/** When line k's card starts, in reel time. */
function landAt(env: Env, b: StoryBeat): number {
  const words = parseWords(b.headline).map((w) => w.text);
  const k = atWord(words, b.tags);
  if (k < 0) return b.start + 0.1;
  const times = wordTimesOf(b, words, num(env.fields, 'wps', 3));
  // Always before the line ends, even when the line is shorter than its words (no voice, short seconds).
  return b.start + Math.min(Math.max(0.1, b.dur - 0.45), Math.max(0.02, (times[k] ?? 0.1) - (LEAD[b.visual] ?? 0.08)));
}

interface Up {
  k: number;
  at: number;
  /** The card it replaced (-1 = none), still fading out for a moment. */
  was: number;
  wasAt: number;
}

/** The line whose card is on the board at time t (-1 = none), when it started, and the one before it. */
function onBoard(env: Env, beats: StoryBeat[], t: number): Up {
  let out: Up = { k: -1, at: 0, was: -1, wasAt: 0 };
  for (let k = 0; k < beats.length; k++) {
    const b = beats[k];
    if (b.start > t) break;
    if (b.tags.includes('clear')) out = { k: -1, at: b.start, was: out.k, wasAt: out.at };
    if (!shows(b.visual)) continue;
    const at = landAt(env, b);
    if (t >= at) out = { k, at, was: out.k, wasAt: out.at };
  }
  return out;
}

function teacherMove(b: StoryBeat, landed: boolean, sinceLand: number): Action {
  const act = b.tags.find((x) => x.startsWith('act='))?.slice(4) ?? '';
  if (isAction(act)) return act;
  if (b.visual === 'end') return 'wave';
  if (landed && sinceLand < 1.4) return b.visual === 'title' ? 'present' : 'point';
  return 'talk';
}

function board(ctx: Ctx, env: Env, look: Look, beats: StoryBeat[], t: number, hi: string): void {
  ctx.save();
  ctx.shadowColor = look.light ? 'rgba(60,40,10,0.16)' : 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  rrect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 30);
  ctx.fillStyle = look.board;
  ctx.fill();
  ctx.restore();
  // Faint ruled lines, like a lesson pad.
  ctx.save();
  rrect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 30);
  ctx.clip();
  ctx.strokeStyle = look.rule;
  ctx.lineWidth = 2;
  for (let y = BOARD.y + 120; y < BOARD.y + BOARD.h; y += 64) {
    ctx.beginPath();
    ctx.moveTo(BOARD.x, y);
    ctx.lineTo(BOARD.x + BOARD.w, y);
    ctx.stroke();
  }
  // The lesson's name in the corner.
  const topic = str(env.fields, 'topic').toUpperCase();
  if (topic) {
    const c = ctx as Ctx & { letterSpacing?: string };
    const sp = c.letterSpacing;
    c.letterSpacing = '3px';
    font(ctx, 26, 700, FONT.mono);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = hi;
    ctx.fillText(topic.slice(0, 40), BOARD.x + 34, BOARD.y + 54);
    if (sp !== undefined) c.letterSpacing = sp;
  }

  const up = onBoard(env, beats, t);
  const card = (k: number, vl: number, alpha: number, animate: boolean): void => {
    const hb = beats[k];
    const vs = env.videoSize;
    const shotH = hb.visual === 'screen' && vs && vs.w > 0 ? vs.h * Math.min(1000 / vs.w, 1080 / vs.h) + (hb.b ? 190 : 0) : 0;
    const s = shotH ? Math.min(0.92, 720 / shotH) : (SCALE[hb.visual] ?? CONTENT.k);
    withAlpha(ctx, alpha, () => {
      ctx.save();
      ctx.translate(W / 2, CONTENT.cy - (shotH ? 20 * s : 0));
      ctx.scale(s, s);
      ctx.translate(-W / 2, -VY);
      storyVisual(ctx, env, look.theme, beats, k, vl, animate ? easeOut(prog(vl, 0.02, 0.35)) : 1, animate);
      ctx.restore();
    });
  };
  // The card it replaces fades out while the new one comes in, so the board is never blank between them.
  const since = t - up.at;
  if (up.was >= 0 && since < 0.4) card(up.was, t - up.wasAt + 5, 1 - easeOut(clamp01(since / 0.4)), false);
  if (up.k >= 0) card(up.k, since, 1, true);
  ctx.restore();
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const look = LOOKS[str(env.fields, 'board')] ?? LOOKS.paper;
  const hiKey = str(env.fields, 'highlight');
  const hi = hiKey === 'accent' ? env.accent[1] : (HIGHLIGHTS[hiKey] ?? HIGHLIGHTS.yellow);

  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, W, H);
  // A soft light from the top left, so the page is not flat.
  const glow = ctx.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, H * 0.8);
  glow.addColorStop(0, look.light ? 'rgba(255,255,255,0.55)' : hexA(env.accent[1], 0.12));
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  board(ctx, env, look, beats, t, hi);

  // The teacher, bottom right, waist up.
  const now = onBoard(env, beats, t);
  const landed = now.k === i;
  const move = teacherMove(b, landed, t - now.at);
  const speak = b.voDur > 0 ? b.voDur : b.say.length / 14;
  const art = str(env.fields, 'art') === '3d' ? '3d' : 'cartoon';
  const out = renderCharacter({
    art,
    action: move,
    local: landed ? Math.max(0, t - now.at) : local,
    t,
    talk: mouthAt(b.say, local, b.voStart, speak),
    place: 'right',
    side: -0.35,
    zoom: 0,
    accent: hi,
    color: hexOr(str(env.fields, 'char_color'), '#8B5CF6'),
  });
  // A shadow strip under the teacher so the character sits on something.
  const floor = ctx.createLinearGradient(0, H - 420, 0, H);
  floor.addColorStop(0, 'rgba(0,0,0,0)');
  floor.addColorStop(1, look.light ? 'rgba(60,40,10,0.12)' : 'rgba(0,0,0,0.4)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, H - 420, W, 420);
  ctx.drawImage(out.canvas, 0, 0, W, H);

  // The teacher's name tag.
  const name = str(env.fields, 'char_name');
  if (name) {
    const x = out.head.x * W;
    const y = Math.min(H - 120, out.head.y * H + out.headSize * H * 1.9);
    font(ctx, 30, 800, FONT.mono);
    const w = ctx.measureText(name.toUpperCase()).width + 40;
    rrect(ctx, x - w / 2, y - 26, w, 52, 26);
    ctx.fillStyle = look.light ? 'rgba(20,16,10,0.85)' : 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = look.light ? '#FFFFFF' : '#0B0B10';
    ctx.fillText(name.toUpperCase(), x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  if (b.visual !== 'end') captions(ctx, env, b, local, CAPTION_Y, hi);
  ctx.restore();
  if (b.visual === 'end') endCard(ctx, env, b, local, hi);
  const small = str(env.fields, 'disclaimer');
  if (small) {
    font(ctx, 26, 500, FONT.mono);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = look.light && b.visual !== 'end' ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.5)';
    ctx.fillText(small, W / 2, b.visual === 'end' ? 1560 : 1246);
  }
  fxPost(ctx, b, local);
  markLightFrame(look.light && b.visual !== 'end');
}

registerPreset('lecture', draw);
