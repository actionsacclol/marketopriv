import { storyBeats, str, type StoryBeat } from '@shared/presets';
import { PS2_HEAD_Y, renderPs2, type Ps2Actor, type Ps2Cam, type Ps2Prop, type Ps2Time } from '../ps23d';
import { PS2_SETS, ps2Cast, ps2Last, ps2Moves, type Ps2Set, type Ps2Shot } from '@shared/ps2';
import { FONT, H, W, clamp01, easeInOut, fit, font, markLightFrame, registerPreset, rrect, type Ctx, type Env } from '../engine';
import { mouthAt } from '../char3d';
import { captions } from './narrated';
import { applyView, fxMoves, fxPost, fxView } from './fx';

// PS2 cutscene: two or three of our own low-poly characters act a short skit, cut
// like an old console cutscene: a hard cut to a new shot every line (two-shot, a
// close-up of whoever talks, over the other one's shoulder, a low angle), console
// subtitles, a small label over the shot, and a soft low-resolution picture.

type V3 = [number, number, number];

const who = (b: StoryBeat): number => (b.tags.includes('who=c') ? 2 : b.tags.includes('who=b') ? 1 : 0);

/** Where each cast member stands and which way they face (two face each other, three stand in a loose arc). */
function blocking(n: number): Array<{ x: number; z: number; yaw: number }> {
  if (n === 1) return [{ x: 0, z: 0, yaw: 0 }];
  if (n === 2) return [{ x: -0.52, z: 0, yaw: 44 }, { x: 0.52, z: 0, yaw: -44 }];
  return [{ x: -0.8, z: 0.15, yaw: 40 }, { x: 0, z: -0.25, yaw: 0 }, { x: 0.8, z: 0.15, yaw: -40 }];
}

/** Who spoke before this line (a different person), -1 when nobody did. */
function lastSpeaker(beats: StoryBeat[], i: number, spk: number): number {
  for (let k = i - 1; k >= 0; k--) if (who(beats[k]) !== spk) return who(beats[k]);
  return -1;
}

/** A line without a shot= flag: the next shot in a natural order (open wide, then close-ups and over-the-shoulder on whoever talks). */
function autoShot(beats: StoryBeat[], i: number, n: number): Ps2Shot {
  if (i === 0) return n > 2 ? 'group' : 'two';
  const spk = who(beats[i]);
  const prevSpk = who(beats[i - 1]);
  if (n === 1) return (['close', 'low', 'close', 'wide'] as Ps2Shot[])[i % 4];
  if (spk !== prevSpk) return i % 3 === 2 ? 'close' : 'ots';
  return i % 4 === 3 ? (n > 2 ? 'group' : 'two') : i % 2 ? 'close' : 'low';
}

function shotCam(shot: Ps2Shot, spot: Array<{ x: number; z: number; yaw: number }>, spk: number, t: number, through: number, push: boolean, last: number): Ps2Cam {
  const n = spot.length;
  const head = (k: number): V3 => [spot[k].x, PS2_HEAD_Y, spot[k].z];
  const sp = head(Math.min(spk, n - 1));
  // The listener is whoever spoke last (or the nearest other one), so the speaker faces the camera.
  const lis = n > 1 ? head(last !== spk && last >= 0 && last < n ? last : spk === 0 ? 1 : spk === 2 ? 1 : 0) : null;
  const drift = (a: number): number => a * Math.sin(t * 0.37) + a * 0.5 * Math.sin(t * 0.91);
  const pk = push ? 1 - 0.16 * easeInOut(through) : 1;
  let pos: V3;
  let at: V3;
  let fov = 30;
  if (shot === 'close') {
    // In front of the speaker, between where they face and the camera side: a three-quarter view.
    const yaw = (spot[Math.min(spk, n - 1)].yaw * Math.PI) / 180;
    const dx = Math.sin(yaw) * 0.6;
    const dz = Math.cos(yaw) * 0.6 + 0.8;
    const len = Math.hypot(dx, dz);
    const d = 1.5 * pk;
    pos = [sp[0] + (dx / len) * d + drift(0.01), sp[1] + 0.02, sp[2] + (dz / len) * d];
    at = [sp[0], sp[1] - 0.13, sp[2]];
  } else if (shot === 'ots' && lis) {
    // Behind the listener's shoulder (on the camera side), looking at the speaker.
    const vx = lis[0] - sp[0];
    const vz = lis[2] - sp[2];
    const len = Math.hypot(vx, vz) || 1;
    const d = 0.85 * pk;
    pos = [lis[0] + (vx / len) * d + drift(0.008), lis[1] + 0.1, lis[2] + (vz / len) * d + 0.55];
    at = [sp[0], sp[1] - 0.16, sp[2]];
    fov = 34;
  } else if (shot === 'low') {
    pos = [sp[0] + (sp[0] > 0 ? -0.35 : 0.35), 0.95, sp[2] + 1.7 * pk];
    at = [sp[0], sp[1] - 0.02, sp[2]];
    fov = 36;
  } else if (shot === 'wide') {
    pos = [drift(0.08), 1.85, 6.6 * pk];
    at = [0, 1.05, -0.4];
    fov = 34;
  } else {
    // Two-shot / group: everyone, waist up.
    const d = (n > 2 ? 5.2 : n > 1 ? 4.7 : 2.6) * pk;
    pos = [drift(0.05), 1.6, d];
    at = [0, n > 1 ? 1.36 : 1.5, 0];
    fov = n > 2 ? 36 : 31;
  }
  return { pos, at, fov };
}

const prop = (b: StoryBeat, k: number): Ps2Prop => {
  const p = stickPropsAny(b.b).find((x) => x.who === k);
  return p ? p.kind : '';
};

/** The props column ("cup;B:phone"), read the same way as the stickman's. */
function stickPropsAny(raw: string): Array<{ kind: Ps2Prop; who: number }> {
  const out: Array<{ kind: Ps2Prop; who: number }> = [];
  for (const part of raw.split(';')) {
    const m = /^\s*(?:([abc])\s*:\s*)?(cup|phone|glass)\s*$/i.exec(part);
    if (m) out.push({ kind: m[2].toLowerCase() as Ps2Prop, who: m[1] ? 'abc'.indexOf(m[1].toLowerCase()) : 0 });
  }
  return out;
}

// ── Words ─────────────────────────────────────────────────────────────────
/** Console subtitles: blocky capitals, white with a hard black edge, low in the frame. */
function subtitle(ctx: Ctx, text: string, y: number): void {
  const raw = text.trim();
  if (!raw) return;
  const plain = raw.replace(/\*/g, '').toUpperCase();
  const c = fit(ctx, plain, { maxW: 900, maxH: 230, max: 46, min: 28, maxLines: 4, weight: 400, family: FONT.pixel, lh: 1.5 });
  font(ctx, c.size, 400, FONT.pixel);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'miter';
  const top = y - ((c.lines.length - 1) * c.lh) / 2;
  c.lines.forEach((l, i) => {
    const yy = top + i * c.lh;
    ctx.lineWidth = c.size * 0.32;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(l, W / 2, yy);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(l, W / 2, yy);
  });
  ctx.textBaseline = 'alphabetic';
}

/** The small black label over the shot ("2:14 AM"). */
function topLabel(ctx: Ctx, text: string): void {
  const s = text.replace(/\*/g, '').trim().toUpperCase();
  if (!s) return;
  font(ctx, 38, 400, FONT.pixel);
  const w = Math.min(W - 120, ctx.measureText(s).width + 48);
  ctx.fillStyle = 'rgba(0,0,0,0.82)';
  rrect(ctx, W / 2 - w / 2, 262, w, 74, 4);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, W / 2, 301);
  ctx.textBaseline = 'alphabetic';
}

/** The console look on top of the scaled-up picture: faint scanlines, grain and a vignette. */
let lines: CanvasPattern | null = null;
function consoleLook(ctx: Ctx, frame: number): void {
  if (!lines) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 6;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(0,0,0,0.10)';
    g.fillRect(0, 0, 4, 2);
    lines = ctx.createPattern(c, 'repeat');
  }
  if (lines) {
    ctx.fillStyle = lines;
    ctx.fillRect(0, 0, W, H);
  }
  // Grain: a few hundred specks that move every frame.
  for (let i = 0; i < 260; i++) {
    const a = Math.sin((i + 1) * 91.7 + frame * 13.1) * 43758.5;
    const b = Math.sin((i + 1) * 17.3 + frame * 7.9) * 12345.6;
    ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect((a - Math.floor(a)) * W, (b - Math.floor(b)) * H, 3, 3);
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// ── Frame ─────────────────────────────────────────────────────────────────
function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const cast = ps2Cast(str(env.fields, 'cast') || 'jay;brad');
  const n = cast.length;
  const spot = blocking(n);
  const spk = Math.min(who(b), n - 1);
  const tagsSoFar = beats.slice(0, i + 1).map((x) => x.tags);
  const setTag = ps2Last(tagsSoFar, 'set');
  const fieldSet = str(env.fields, 'set');
  const set = ((PS2_SETS as readonly string[]).includes(setTag) ? setTag : (PS2_SETS as readonly string[]).includes(fieldSet) ? fieldSet : 'cafe') as Ps2Set;
  const night = tagsSoFar.some((x) => x.includes('night'));
  const time = (night ? 'night' : ['day', 'evening', 'night'].includes(str(env.fields, 'time')) ? str(env.fields, 'time') : 'day') as Ps2Time;
  const hd = str(env.fields, 'look') === 'hd';

  // Who says the line: their mouth moves with the voice, or with the subtitle when there is none.
  const text = b.say || b.headline.replace(/\*/g, '');
  const voiced = b.voDur > 0;
  const moves = ps2Moves(b.visual, n, spk);
  const prev = i > 0 ? beats[i - 1] : null;
  const before = prev ? ps2Moves(prev.visual, n, Math.min(who(prev), n - 1)) : null;
  const actors: Ps2Actor[] = cast.map((look, k) => {
    const talk = k === spk ? (voiced ? mouthAt(text, local, b.voStart, b.voDur) : mouthAt(text, local, 0.1, Math.max(0.4, Math.min(b.dur - 0.3, text.length * 0.06)))) : 0;
    const per = 3.1 + k * 0.9;
    return {
      look,
      move: moves[k],
      from: before ? before[k] : null,
      blend: clamp01(local / 0.45),
      local,
      talk,
      blink: (t + k * 1.7) % per < 0.12,
      x: spot[k].x,
      z: spot[k].z,
      // Whoever talks turns a little toward the camera.
      yaw: spot[k].yaw * (k === spk ? 0.72 : 1),
      prop: prop(b, k),
      seed: k * 3.7,
    };
  });

  const shotTag = b.tags.find((x) => x.startsWith('shot='))?.slice(5) as Ps2Shot | undefined;
  const shot = shotTag ?? autoShot(beats, i, n);
  const cam = shotCam(shot, spot, spk, t, clamp01(local / b.dur), b.tags.includes('push'), lastSpeaker(beats, i, spk));
  const out = renderPs2({ set, time, t, actors, cam, hd });

  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = hd ? 'high' : 'low';
  ctx.drawImage(out.canvas, 0, 0, W, H);
  ctx.restore();
  if (!hd) consoleLook(ctx, env.frame);

  topLabel(ctx, b.a);
  const mode = str(env.fields, 'captions') || 'subtitle';
  if (mode === 'subtitle') subtitle(ctx, b.headline, 1430);
  else if (mode !== 'off') captions(ctx, env, b, local, 1400, '#FFE14A');
  fxPost(ctx, b, local);
  markLightFrame(false);
}

registerPreset('ps2', draw);
