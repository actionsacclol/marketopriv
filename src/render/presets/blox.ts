import { screenZoom, storyBeats, str, type StoryBeat } from '@shared/presets';
import { LABEL_AT } from '@shared/sfx';
import { BLOX_LOOK_A, BLOX_LOOK_B, BLOX_SETS, BLOX_SPEED, BLOX_TIMES, bloxLook, bloxMoves, bloxProps, type BloxMove, type BloxProp, type BloxSet, type BloxTime } from '@shared/blox';
import { mouthAt } from '../char3d';
import { mixShot, renderBlox, type BloxActor, type BloxHead, type Shot } from '../blox3d';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { captions } from './narrated';
import { FONT, H, W, clamp01, easeBack, easeInOut, easeOut, fit, font, hexA, lerp, markLightFrame, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';

// Blocky avatars: one or two of our own blocky game-style figures in a small 3D world (blox3d.ts), acting a story,
// a rant or a skit out. This file reads the beats (shared/blox.ts), picks the camera, and draws what sits on top of
// the 3D picture: captions, the big word, name tags, chat bubbles, the screen panel and the winner's burst.

const HIGHLIGHTS: Record<string, string> = { yellow: '#FDE047', green: '#4ADE80', orange: '#FB923C', red: '#F87171', cyan: '#67E8F9', white: '#FFFFFF' };
const highlightOf = (env: Env): string => HIGHLIGHTS[str(env.fields, 'highlight')] ?? (str(env.fields, 'highlight') === 'accent' ? env.accent[1] : HIGHLIGHTS.yellow);
const PANEL = { x: 40, y: 500, w: 1000, h: 562 };

interface Scene {
  moves: [BloxMove, BloxMove];
  props: BloxProp[];
  /** Where each avatar stands. */
  xs: number[];
  floor: { kind: 'crate' | 'trophy'; x: number; z: number } | null;
  screen: BloxProp | null;
}

function sceneOf(b: StoryBeat, duo: boolean): Scene {
  const props = bloxProps(b.b).filter((p) => duo || p.who === 0);
  const onFloor = props.find((p) => p.kind === 'crate' || p.kind === 'trophy');
  const floor = onFloor ? { kind: onFloor.kind as 'crate' | 'trophy', x: duo ? 0 : 0.74, z: duo ? 0.7 : 0.1 } : null;
  const moves = bloxMoves(b.visual);
  // Two on stage: one that lies down does it a little towards the middle, so its head stays in the frame.
  const lies = (k: number): number => (moves[k] === 'fall' || moves[k] === 'sleep' ? 0.3 : 0);
  return { moves, props, xs: duo ? [-0.95 + lies(0), 0.95 - lies(1)] : [floor ? -0.44 : 0], floor, screen: props.find((p) => p.kind === 'screen') ?? null };
}

const tagOf = (b: StoryBeat, name: string): string => {
  const hit = b.tags.find((t) => t.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : '';
};

/** The camera for a beat, before its drift and push. */
function shotOf(b: StoryBeat, sc: Scene, duo: boolean, who: number, i: number): Shot {
  const cx = duo ? 0 : sc.floor ? 0.12 : sc.xs[0];
  if (sc.screen) return { x: cx, y: 1.15, z: 0, orbit: 0, vis: duo ? 7.6 : 6.4, fy: 0.8, rise: 0.3 };
  const cam = tagOf(b, 'cam');
  const k = cam === 'b' && duo ? 1 : cam === 'a' ? 0 : who;
  const turn = duo ? (k ? -0.24 : 0.24) : 0;
  // A lying avatar is framed where it lies, not where it stood.
  const lying = sc.moves[k] === 'sleep' || sc.moves[k] === 'fall';
  if (cam === 'close' || cam === 'a' || cam === 'b') return lying ? { x: sc.xs[k], y: 0.5, z: 0, orbit: turn, vis: 3.4, fy: 0.66, rise: 0.9 } : { x: sc.xs[k], y: 1.62, z: 0, orbit: turn, vis: 3.1, fy: 0.6, rise: 0.1 };
  if (cam === 'low') return { x: sc.xs[k], y: 1.3, z: 0, orbit: turn || 0.18, vis: 3.9, fy: 0.62, rise: -1.05 };
  if (cam === 'far') return { x: cx, y: 1.3, z: 0, orbit: 0.14, vis: 9.6, fy: 0.7, rise: 1.3 };
  // Wide: a little to one side or the other, so cuts between wide beats still read as cuts.
  const side = ((i % 3) - 1) * 0.09;
  return duo ? { x: 0, y: 1.1, z: 0, orbit: side, vis: 6.9, fy: 0.62, rise: 0.4 } : { x: cx, y: 1.15, z: 0, orbit: side, vis: 4.5, fy: 0.66, rise: 0.35 };
}

/** How far the world has slid past by reel time t (walk and run beats). */
function travelAt(beats: StoryBeat[], t: number, duo: boolean): number {
  let d = 0;
  for (const b of beats) {
    if (t <= b.start) break;
    const [a, bm] = bloxMoves(b.visual);
    const speed = BLOX_SPEED[a] ?? (duo ? (BLOX_SPEED[bm] ?? 0) : 0);
    d += speed * (Math.min(t, b.start + b.dur) - b.start);
  }
  return d;
}

/** The beat a run of the same move (for avatar k) began on: a move does not restart on every line. */
function runStart(beats: StoryBeat[], i: number, k: number): number {
  let j = i;
  const m = bloxMoves(beats[i].visual)[k];
  while (j > 0 && bloxMoves(beats[j - 1].visual)[k] === m) j--;
  return j;
}

// ── On top of the 3D picture ───────────────────────────────────────────────
function panel(ctx: Ctx, env: Env, value: string, local: number, hi: string): void {
  const pop = easeBack(prog(local, 0.05, 0.3));
  if (pop <= 0) return;
  const { x, y, w, h } = PANEL;
  scaled(ctx, lerp(0.8, 1, pop), W / 2, y + h / 2, () =>
    withAlpha(ctx, clamp01(pop * 1.5), () => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 40;
      ctx.shadowOffsetY = 14;
      rrect(ctx, x - 12, y - 12, w + 24, h + 24, 34);
      ctx.fillStyle = '#14151B';
      ctx.fill();
      ctx.restore();
      ctx.save();
      rrect(ctx, x, y, w, h, 22);
      ctx.clip();
      ctx.fillStyle = '#0D0E13';
      ctx.fillRect(x, y, w, h);
      const v = env.video;
      const vs = env.videoSize;
      if (v && vs && /^\s*\d/.test(value)) {
        const zm = screenZoom(value);
        const z = lerp(1, zm.z, easeInOut(prog(local, 0.4, 0.6)));
        const cw = vs.w / z;
        const ch = vs.h / z;
        const sx = Math.min(vs.w - cw, Math.max(0, zm.x * vs.w - cw / 2));
        const sy = Math.min(vs.h - ch, Math.max(0, zm.y * vs.h - ch / 2));
        const k = Math.max(w / cw, h / ch);
        ctx.drawImage(v, sx, sy, cw, ch, x + (w - cw * k) / 2, y + (h - ch * k) / 2, cw * k, ch * k);
      } else {
        // No recording: an app window with a few lines, so the panel never shows up empty.
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x, y, w, 64);
        for (let r = 0; r < 4; r++) {
          ctx.fillStyle = r === 1 ? hi : 'rgba(255,255,255,0.2)';
          rrect(ctx, x + 70, y + 140 + r * 96, [520, 760, 430, 640][r], 40, 14);
          ctx.fill();
        }
      }
      ctx.restore();
      rrect(ctx, x - 12, y - 12, w + 24, h + 24, 34);
      ctx.lineWidth = 4;
      ctx.strokeStyle = hexA(hi, 0.7);
      ctx.stroke();
    }),
  );
}

/** A chat or thought bubble over a head (it takes the name tag's place while it shows). */
function bubble(ctx: Ctx, text: string, head: BloxHead, think: boolean, local: number, minY: number): void {
  const a = easeBack(prog(local, 0.08, 0.3));
  const s = text.replace(/\*/g, '').trim() || (think ? '...' : '');
  if (a <= 0 || !s) return;
  const f = fit(ctx, s, { maxW: 520, maxH: 210, max: 56, min: 32, maxLines: 3, weight: 700 });
  font(ctx, f.size, 700);
  const tw = Math.max(...f.lines.map((l) => ctx.measureText(l).width));
  const w = tw + 68;
  const h = f.lines.length * f.lh + 44;
  const cx = Math.min(W - 36 - w / 2, Math.max(36 + w / 2, head.x * W));
  const bottom = Math.max(minY + h, head.top * H - 44);
  const top = bottom - h;
  scaled(ctx, lerp(0.5, 1, a), cx, bottom, () =>
    withAlpha(ctx, clamp01(a * 1.4), () => {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = '#FFFFFF';
      rrect(ctx, cx - w / 2, top, w, h, think ? h / 2 : 30);
      ctx.fill();
      ctx.restore();
      const tx = Math.min(cx + w / 2 - 52, Math.max(cx - w / 2 + 52, head.x * W));
      ctx.fillStyle = '#FFFFFF';
      if (think) {
        for (let i = 0; i < 2; i++) {
          ctx.beginPath();
          ctx.arc(tx + (i ? 8 : -6), bottom + 16 + i * 20, 11 - i * 4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.moveTo(tx - 20, bottom - 2);
        ctx.lineTo(tx + 20, bottom - 2);
        ctx.lineTo(tx - 2, bottom + 28);
        ctx.closePath();
        ctx.fill();
      }
      font(ctx, f.size, 700);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#0B0B0F';
      f.lines.forEach((l, li) => ctx.fillText(l, cx, top + 22 + f.lh * (li + 0.8)));
    }),
  );
}

/** A big ? or ! (or a row of z's) popping over a head. */
function mark(ctx: Ctx, glyph: string, head: BloxHead, local: number, t: number, hi: string): void {
  const size = Math.max(130, Math.min(220, head.r * H * 1.3));
  const x = head.x * W + head.r * H * 0.9;
  const y = head.top * H - size * 0.25;
  if (glyph === 'z') {
    for (let i = 0; i < 3; i++) {
      const u = (t * 0.55 + i / 3) % 1;
      withAlpha(ctx, Math.sin(Math.PI * u), () => {
        font(ctx, size * (0.34 + 0.3 * u), 900, FONT.meme);
        ctx.textAlign = 'center';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 10;
        ctx.strokeStyle = '#0B0B0F';
        const zx = x + u * size * 0.7 + Math.sin(u * 6 + i) * 10;
        const zy = y - u * size * 1.1;
        ctx.strokeText('Z', zx, zy);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText('Z', zx, zy);
      });
    }
    return;
  }
  const a = easeBack(prog(local, 0.06, 0.26));
  if (a <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.14 + 0.05 * Math.sin(t * 6));
  ctx.scale(lerp(0.3, 1, a), lerp(0.3, 1, a));
  font(ctx, size, 900, FONT.meme);
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = '#0B0B0F';
  ctx.strokeText(glyph, 0, 0);
  ctx.fillStyle = glyph === '!' ? '#F87171' : hi;
  ctx.fillText(glyph, 0, 0);
  ctx.restore();
}

/** The name over a head, the way a game shows who is who. */
function nameTag(ctx: Ctx, name: string, head: BloxHead, color: string): void {
  const size = Math.max(40, Math.min(60, head.r * H * 0.62));
  font(ctx, size, 800);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  const x = Math.min(W - 30 - ctx.measureText(name).width / 2, Math.max(30 + ctx.measureText(name).width / 2, head.x * W));
  const y = head.top * H - 16;
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = 'rgba(8,8,12,0.9)';
  ctx.strokeText(name, x, y);
  ctx.fillStyle = color;
  ctx.fillText(name, x, y);
}

function burst(ctx: Ctx, head: BloxHead, local: number, hi: string): void {
  const cx = head.x * W;
  const cy = (head.y + head.r * 1.6) * H;
  const R = head.r * H;
  const k = prog(local, 0.15, 0.55);
  if (k > 0 && k < 1)
    withAlpha(ctx, 1 - k, () => {
      ctx.strokeStyle = hi;
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(8, R * 0.12);
      for (let r = 0; r < 12; r++) {
        const a = (r / 12) * Math.PI * 2 + 0.2;
        const r0 = R * (3.3 + 1.2 * k);
        const r1 = R * (4.3 + 2.6 * k);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 1.15);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 1.15);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    });
  // Confetti keeps falling for the rest of the beat.
  const since = local - 0.15;
  if (since <= 0) return;
  const colors = [hi, '#FFFFFF', '#F472B6', '#67E8F9', '#4ADE80'];
  for (let n = 0; n < 26; n++) {
    const h1 = Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1;
    const h2 = Math.abs(Math.sin(n * 78.233) * 12543.117) % 1;
    const u = since * (0.5 + 0.5 * h2) - h1 * 0.5;
    if (u < 0) continue;
    const x = cx + (h1 - 0.5) * R * 9 + Math.sin(u * 5 + n) * 24;
    const y = cy - R * 4.4 + u * (520 + 300 * h2);
    if (y > H) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(u * 7 + n);
    ctx.fillStyle = colors[n % colors.length];
    ctx.fillRect(-9, -5, 18, 10);
    ctx.restore();
  }
}

function bigWord(ctx: Ctx, text: string, local: number, y: number, hi: string): void {
  const s = text.replace(/\*/g, '').trim();
  if (!s) return;
  const p = prog(local, LABEL_AT, 0.3);
  if (p <= 0) return;
  const c = fit(ctx, s, { maxW: 900, maxH: 210, max: 156, min: 60, maxLines: 2, weight: 900, family: FONT.meme, lh: 1.02 });
  const h = c.lines.length * c.lh;
  withAlpha(ctx, clamp01(p * 2.5), () =>
    scaled(ctx, lerp(0.55, 1, easeBack(p)), W / 2, y, () => {
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.rotate(-0.04);
      font(ctx, c.size, 900, FONT.meme);
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      c.lines.forEach((l, i) => {
        const yy = -h / 2 + c.lh * (i + 0.82);
        ctx.lineWidth = c.size * 0.18;
        ctx.strokeStyle = '#0B0B0F';
        ctx.strokeText(l, 0, yy);
        ctx.fillStyle = hi;
        ctx.fillText(l, 0, yy);
      });
      ctx.restore();
    }),
  );
}

/** Title captions: the line as plain text at the top, *word* in the highlight colour (wordless skits and dances). */
function titleCaption(ctx: Ctx, text: string, alpha: number, hi: string): void {
  const raw = text.trim();
  if (!raw) return;
  const c = fit(ctx, raw.replace(/\*/g, ''), { maxW: 940, maxH: 320, max: 84, min: 42, maxLines: 3, weight: 800, family: FONT.meme, lh: 1.14 });
  const hot: boolean[] = [];
  let on = false;
  for (const w of raw.split(/\s+/).filter(Boolean)) {
    if (w.startsWith('*')) on = true;
    hot.push(on || w.includes('*'));
    if (w.endsWith('*') && (w.length > 1 || !w.startsWith('*'))) on = false;
  }
  let n = 0;
  withAlpha(ctx, alpha, () => {
    font(ctx, c.size, 800, FONT.meme);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const space = ctx.measureText(' ').width;
    c.lines.forEach((line, i) => {
      const words = line.split(' ');
      const widths = words.map((w) => ctx.measureText(w).width);
      let x = W / 2 - (widths.reduce((a, b) => a + b, 0) + space * (words.length - 1)) / 2;
      const y = 290 + c.lh * (i + 0.8);
      words.forEach((w, k) => {
        ctx.lineWidth = c.size * 0.2;
        ctx.strokeStyle = '#0B0B0F';
        ctx.strokeText(w, x, y);
        ctx.fillStyle = hot[n++] ? hi : '#FFFFFF';
        ctx.fillText(w, x, y);
        x += widths[k] + space;
      });
    });
  });
}

// ── Frame ──────────────────────────────────────────────────────────────────
function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const hi = highlightOf(env);
  const names = str(env.fields, 'names').split(';').map((x) => x.trim());
  const duo = str(env.fields, 'names').includes(';') || beats.some((x) => x.visual.includes('/'));
  const n = duo ? 2 : 1;
  const sc = sceneOf(b, duo);
  const prev = i > 0 ? beats[i - 1] : null;
  const psc = prev ? sceneOf(prev, duo) : null;
  const who = b.tags.includes('who=b') && duo ? 1 : 0;
  const winTag = b.tags.find((x) => x === 'win' || x.startsWith('win='));
  const win = winTag ? (winTag === 'win=b' && duo ? 1 : 0) : -1;
  const talking = !!b.say && b.voDur > 0 && local >= b.voStart && local <= b.voStart + b.voDur;

  // Camera: this beat's shot, moving in from the last one's; then drift, the orbit and push flags.
  const cut = easeInOut(prog(local, 0, 0.2));
  let shot = prev && psc ? mixShot(shotOf(prev, psc, duo, prev.tags.includes('who=b') && duo ? 1 : 0, i - 1), shotOf(b, sc, duo, who, i), cut) : shotOf(b, sc, duo, who, 0);
  const through = clamp01(local / b.dur);
  shot = { ...shot, orbit: shot.orbit + 0.025 * Math.sin(t * 0.4) + (b.tags.includes('orbit') ? (through - 0.5) * 0.8 : 0), vis: shot.vis * (1 - (b.tags.includes('push') ? 0.11 * easeInOut(through) : 0.02 * through)) };

  const slide = easeOut(prog(local, 0, 0.25));
  const actors: BloxActor[] = [];
  for (let k = 0; k < n; k++) {
    const move = sc.moves[k];
    const j = runStart(beats, i, k);
    const mine = sc.props.filter((p) => p.who === k);
    const said = mine.find((p) => p.kind === 'bubble');
    const speaking = talking && k === who;
    const talk = speaking ? mouthAt(b.say, local, b.voStart, b.voDur) : said ? mouthAt(said.value, local, 0.1, Math.min(1.1, b.dur - 0.2)) : 0;
    const before = j > 0 ? bloxMoves(beats[j - 1].visual)[k] : null;
    const sign = mine.find((p) => p.kind === 'sign');
    actors.push({
      move,
      local: t - beats[j].start,
      from: before,
      fromLocal: before && j > 0 ? t - beats[runStart(beats, j - 1, k)].start : 0,
      blend: prog(t - beats[j].start, 0, 0.24),
      talk,
      x: psc ? lerp(psc.xs[k] ?? sc.xs[k], sc.xs[k], slide) : sc.xs[k],
      face: duo ? (k ? -20 : 20) : 0,
      mirror: duo && k === 1,
      sign: sign ? sign.value || '!' : '',
      pointUp: !!sc.screen,
      coin: mine.some((p) => p.kind === 'coin'),
      robot: mine.some((p) => p.kind === 'robot'),
      side: duo ? (k ? 1 : -1) : sc.floor ? -1 : 1,
    });
  }

  const set = (BLOX_SETS as readonly string[]).includes(str(env.fields, 'set')) ? (str(env.fields, 'set') as BloxSet) : 'baseplate';
  const time = (BLOX_TIMES as readonly string[]).includes(str(env.fields, 'time')) ? (str(env.fields, 'time') as BloxTime) : 'day';
  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  const out = renderBlox({
    set,
    time,
    t,
    travel: travelAt(beats, t, duo),
    shot,
    looks: [bloxLook(str(env.fields, 'avatar'), BLOX_LOOK_A), bloxLook(str(env.fields, 'avatar_b'), BLOX_LOOK_B)],
    actors,
    floor: sc.floor,
    hi,
  });
  ctx.drawImage(out.canvas, 0, 0, W, H);
  // Darker towards the bottom, where the platform's own text sits.
  const g = ctx.createLinearGradient(0, H * 0.7, 0, H);
  g.addColorStop(0, 'rgba(6,6,10,0)');
  g.addColorStop(1, 'rgba(6,6,10,0.5)');
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.7, W, H * 0.3);

  if (sc.screen) panel(ctx, env, sc.screen.value, local, hi);
  const lit = win >= 0 && local >= 0.15;
  if (win >= 0 && out.heads[win]) burst(ctx, out.heads[win], local, hi);
  const floorY = sc.screen ? PANEL.y + PANEL.h + 24 : 250;
  out.heads.forEach((head, k) => {
    // Out of the shot (a close-up of the other one): nothing of theirs is drawn.
    if (head.x < 0.04 || head.x > 0.96 || head.y < 0 || head.y > 1) return;
    const mine = sc.props.filter((p) => p.who === k);
    const said = mine.find((p) => p.kind === 'bubble');
    const thought = mine.find((p) => p.kind === 'think');
    // The name stays put unless a bubble takes its place.
    if (names[k] && !said && !thought) nameTag(ctx, names[k], head, lit && win === k ? hi : '#FFFFFF');
    if (said) bubble(ctx, said.value, head, false, local, floorY);
    else if (thought) bubble(ctx, thought.value, head, true, local, floorY);
    if (mine.some((p) => p.kind === 'question')) mark(ctx, '?', head, local, t, hi);
    if (mine.some((p) => p.kind === 'exclaim')) mark(ctx, '!', head, local, t, hi);
    if (mine.some((p) => p.kind === 'zzz') || sc.moves[k] === 'sleep') mark(ctx, 'z', head, local, t, hi);
  });

  // Words on top.
  const mode = str(env.fields, 'captions') || 'words';
  if (mode === 'title') {
    const same = prev && prev.headline.trim() === b.headline.trim();
    titleCaption(ctx, b.headline, same || i === 0 ? 1 : easeOut(prog(local, 0, 0.2)), hi);
  } else if (mode !== 'off') captions(ctx, env, b, local, sc.screen ? 380 : 430, hi);
  // The big word sits between the captions and the heads. Where a beat has something up there (a close or low shot,
  // a held sign) it goes lower down instead. Decided per beat, never per frame: a hopping avatar must not move it.
  const cam = tagOf(b, 'cam');
  const tight = cam === 'close' || cam === 'a' || cam === 'b' || cam === 'low' || actors.some((a) => a.sign);
  bigWord(ctx, b.a, local, sc.screen ? 1500 : tight ? 1410 : mode === 'title' ? 720 : 660, hi);
  ctx.restore();
  fxPost(ctx, b, local);
  markLightFrame(false);
}

registerPreset('blox', draw);
