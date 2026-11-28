import { storyBeats, str, type StoryBeat } from '@shared/presets';
import { INK_PALETTE, INK_PALETTES, INK_SETS, INK_TIMES, inkCast, inkLast, inkMoves, inkProps, type InkMove, type InkPaletteId, type InkProp, type InkSet, type InkShot, type InkTime } from '@shared/ink';
import { FONT, H, W, clamp01, easeInOut, font, markLightFrame, registerPreset, type Ctx, type Env } from '../engine';
import { mouthAt } from '../char3d';
import { captions } from './narrated';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { drawPerson, headOf, heightOf, widthOf, type Actor } from '../ink/people';
import { drawProp } from '../ink/props';
import { lightOf, setLayers, type Light } from '../ink/sets';
import { glint, line, setZoom } from '../ink/pen';

// Ink cartoon: a narrated story acted out by our own caricature cast in hand-inked cels. Every line is one shot (who,
// a face, a body action, a camera move); the shots cycle close / wide / insert / reaction and never hold the same
// framing twice; the camera always moves (a push or a drift), glides to the next framing instead of cutting, and
// whip-pans between places. A warm grainy print finish goes over the picture; yellow word captions go on last.

interface Cam {
  cx: number;
  cy: number;
  k: number;
}

const who = (b: StoryBeat): number => (b.tags.includes('who=c') ? 2 : b.tags.includes('who=b') ? 1 : 0);

/** Where each cast member stands: side by side with room between them, facing the middle. */
function blocking(cast: string[]): Array<{ x: number; facing: 1 | -1 }> {
  if (cast.length === 1) return [{ x: 0, facing: 1 }];
  const ws = cast.map((n) => widthOf(n));
  const gaps = ws.slice(1).map((w, i) => (w + ws[i]) * 0.72 + 190);
  const total = gaps.reduce((a, b) => a + b, 0);
  let x = -total / 2;
  return cast.map((_, i) => {
    if (i > 0) x += gaps[i - 1];
    const at = x;
    return { x: at, facing: at < -1 ? 1 : at > 1 ? -1 : 1 };
  });
}

function setAt(beats: StoryBeat[], i: number, field: string): InkSet {
  const tag = inkLast(beats.slice(0, i + 1).map((x) => x.tags), 'set');
  return ((INK_SETS as readonly string[]).includes(tag) ? tag : (INK_SETS as readonly string[]).includes(field) ? field : 'road') as InkSet;
}

function timeAt(beats: StoryBeat[], i: number, field: string): InkTime {
  let t = ((INK_TIMES as readonly string[]).includes(field) ? field : 'dusk') as InkTime;
  for (const b of beats.slice(0, i + 1)) for (const x of b.tags) if ((INK_TIMES as readonly string[]).includes(x)) t = x as InkTime;
  return t;
}

const firstProp = (b: StoryBeat): InkProp | undefined => inkProps(b.b)[0]?.kind;

/** The shot for a line without shot=: a cycle of close / wide / insert / reaction that never repeats a framing. */
function shotOf(beats: StoryBeat[], i: number, n: number, field: string, memo: Map<number, InkShot>): InkShot {
  const hit = memo.get(i);
  if (hit) return hit;
  const b = beats[i];
  const tag = b.tags.find((x) => x.startsWith('shot='))?.slice(5) as InkShot | undefined;
  let s: InkShot;
  if (tag) s = tag;
  else if (i === 0) s = firstProp(b) ? 'mid' : 'close';
  else if (setAt(beats, i, field) !== setAt(beats, i - 1, field)) s = 'wide';
  else {
    const prev = shotOf(beats, i - 1, n, field, memo);
    const cycle: InkShot[] = ['wide', 'close', firstProp(b) ? 'insert' : 'mid', n > 1 ? 'react' : 'two', 'mid', 'two'];
    s = cycle[i % cycle.length];
    if (s === prev) s = cycle[(i + 1) % cycle.length];
    if (s === 'insert' && !firstProp(b)) s = 'mid';
    if (s === 'react' && n < 2) s = 'close';
    if (s === prev) s = prev === 'wide' ? 'close' : 'wide';
    if (firstProp(b) && (s === 'close' || s === 'react')) s = prev === 'insert' ? 'mid' : 'insert';
  }
  if (s === 'insert' && !firstProp(b)) s = 'close';
  memo.set(i, s);
  return s;
}

/** The camera a shot wants (before its move). */
function camOf(shot: InkShot, cast: string[], spot: Array<{ x: number }>, focus: number, other: number, solo: boolean): Cam {
  const f = Math.min(focus, cast.length - 1);
  const mean = spot.reduce((a, s) => a + s.x, 0) / spot.length;
  switch (shot) {
    case 'wide':
      return { cx: mean * 0.6, cy: -720, k: cast.length > 1 && !solo ? 0.7 : 0.84 };
    case 'two':
      return { cx: mean, cy: -820, k: cast.length > 2 ? 0.78 : 0.95 };
    case 'mid':
      return { cx: spot[f].x, cy: -heightOf(cast[f]) * 0.72, k: 1.25 };
    case 'close':
    case 'insert':
      return { cx: spot[f].x, cy: -headOf(cast[f]) + 90, k: 2.15 };
    case 'react': {
      const o = other >= 0 ? other : f === 0 ? 1 : 0;
      const k = Math.min(o, cast.length - 1);
      return { cx: spot[k].x, cy: -headOf(cast[k]) + 90, k: 2.05 };
    }
  }
}

/** The other one in a reaction shot: whoever the last different line was about, or the nearest. */
function otherOf(beats: StoryBeat[], i: number, focus: number, n: number): number {
  for (let k = i - 1; k >= 0; k--) if (who(beats[k]) !== focus && who(beats[k]) < n) return who(beats[k]);
  return n > 1 ? (focus === 0 ? 1 : 0) : -1;
}

/** The camera at this moment: the shot's framing with its own move (push in or drift), glided from the last one. */
function cameraAt(beats: StoryBeat[], i: number, local: number, t: number, cast: string[], spot: Array<{ x: number }>, field: string, memo: Map<number, InkShot>): Cam {
  const n = cast.length;
  const shotCam = (k: number): Cam => {
    const b = beats[k];
    const f = Math.min(who(b), n - 1);
    const c = camOf(shotOf(beats, k, n, field, memo), b.tags.includes('solo') ? [cast[f]] : cast, b.tags.includes('solo') ? [{ x: 0 }] : spot, b.tags.includes('solo') ? 0 : f, otherOf(beats, k, f, n), b.tags.includes('solo'));
    // Every shot moves: a push in, or a slow sideways drift on alternate lines.
    const u = clamp01(b.dur > 0 ? (k === i ? local : b.dur) / b.dur : 1);
    const push = b.tags.includes('push') ? 0.16 : 0.07;
    if (k % 2 === 0 || b.tags.includes('push')) c.k *= 1 + push * easeInOut(u);
    else c.cx += (k % 4 === 1 ? 1 : -1) * (60 / c.k) * (u - 0.5);
    return c;
  };
  const cur = shotCam(i);
  cur.cx += (Math.sin(t * 0.31) * 14 + Math.sin(t * 0.83) * 6) / cur.k;
  cur.cy += (Math.sin(t * 0.27 + 1) * 10) / cur.k;
  if (i === 0 || whipAt(beats, i, field)) return cur;
  // A quick glide from the last framing (never a hard cut inside one place).
  const prev = shotCam(i - 1);
  const g = easeInOut(clamp01(local / 0.32));
  if (g >= 1) return cur;
  const lk = Math.log(prev.k) + (Math.log(cur.k) - Math.log(prev.k)) * g;
  return { cx: prev.cx + (cur.cx - prev.cx) * g, cy: prev.cy + (cur.cy - prev.cy) * g, k: Math.exp(lk) };
}

/** A whip-pan starts this line: a new place, or the whip flag. */
const whipAt = (beats: StoryBeat[], i: number, field: string): boolean => i > 0 && (beats[i].tags.includes('whip') || setAt(beats, i, field) !== setAt(beats, i - 1, field));

// ── Canvases ───────────────────────────────────────────────────────────────
let bgC: HTMLCanvasElement | null = null;
let fgC: HTMLCanvasElement | null = null;
let frameC: HTMLCanvasElement | null = null;
let smallC: HTMLCanvasElement | null = null;
let grain: HTMLCanvasElement[] = [];
const canvas = (c: HTMLCanvasElement | null, w = W, h = H): HTMLCanvasElement => {
  if (c && c.width === w && c.height === h) return c;
  const n = document.createElement('canvas');
  n.width = w;
  n.height = h;
  return n;
};

/** Draw one depth layer of the set through the camera (parallax: a far layer moves and zooms less). */
function layer(ctx: Ctx, cam: Cam, p: number, drawIt: (k: number) => void): void {
  const kp = Math.pow(cam.k, p);
  const anchorY = -700;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.scale(kp, kp);
  ctx.translate(-cam.cx * p, -(anchorY + (cam.cy - anchorY) * p));
  setZoom(kp);
  drawIt(kp);
  ctx.restore();
}

/** The old-cartoon print pass over the composed picture: bloom, warm tone, lifted blacks, mottle, grain, vignette. */
function finish(ctx: Ctx, src: HTMLCanvasElement, frame: number): void {
  smallC = canvas(smallC, W / 8, H / 8);
  const s = smallC.getContext('2d')!;
  s.filter = 'blur(3px)';
  s.clearRect(0, 0, smallC.width, smallC.height);
  s.drawImage(src, 0, 0, smallC.width, smallC.height);
  s.filter = 'none';
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = 0.16;
  ctx.drawImage(smallC, 0, 0, W, H);
  // Slight colour off-register: a faint warm copy two pixels to the side.
  ctx.globalAlpha = 0.05;
  ctx.drawImage(src, 2, 0);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = '#FFB27A';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighten';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#2A1712';
  ctx.fillRect(0, 0, W, H);
  // Grain in brightness only, a new pattern each frame.
  if (!grain.length)
    grain = [0, 1, 2, 3].map((g) => {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 256;
      const x = c.getContext('2d')!;
      const img = x.createImageData(256, 256);
      let a = 1234 + g * 777;
      for (let i = 0; i < img.data.length; i += 4) {
        a = (a * 1103515245 + 12345) & 0x7fffffff;
        const v = 128 + ((a % 256) - 128) * 0.9;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      return c;
    });
  const pat = ctx.createPattern(grain[frame % 4], 'repeat');
  if (pat) {
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.09;
    ctx.translate(((frame * 37) % 256) - 128, ((frame * 53) % 256) - 128);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, W + 256, H + 256);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(40,16,10,0)');
  v.addColorStop(1, 'rgba(40,16,10,0.42)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** The small label over a shot ("2013"): a cream tag with an ink edge. */
function topLabel(ctx: Ctx, text: string): void {
  const s = text.replace(/\*/g, '').trim().toUpperCase();
  if (!s) return;
  font(ctx, 64, 400, FONT.impact);
  const w = Math.min(W - 160, ctx.measureText(s).width + 70);
  ctx.save();
  ctx.translate(W / 2, 300);
  ctx.rotate(-0.025);
  ctx.fillStyle = '#F3E6C8';
  ctx.fillRect(-w / 2, -50, w, 100);
  setZoom(1);
  line(ctx, [[-w / 2, -50], [w / 2, -50], [w / 2, 50], [-w / 2, 50]], { w: 5, closed: true, seed: 5 });
  ctx.fillStyle = '#170B08';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(s, 0, 4);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

// ── Frame ──────────────────────────────────────────────────────────────────
function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const cast = inkCast(str(env.fields, 'cast') || 'bubba;vince');
  const n = cast.length;
  const solo = b.tags.includes('solo');
  const focus = Math.min(who(b), n - 1);
  const spot = solo ? cast.map(() => ({ x: 0, facing: 1 as const })) : blocking(cast);
  const field = str(env.fields, 'set');
  const set = setAt(beats, i, field);
  const palId = ((INK_PALETTES as readonly string[]).includes(str(env.fields, 'palette')) ? str(env.fields, 'palette') : 'sunset') as InkPaletteId;
  const pal = INK_PALETTE[palId];
  const L: Light = lightOf(timeAt(beats, i, str(env.fields, 'time')), pal);
  const memo = new Map<number, InkShot>();
  const shot = shotOf(beats, i, n, field, memo);
  const cam = cameraAt(beats, i, local, t, cast, spot, field, memo);

  // Whip-pan: the last 0.1 s of the old place and the first 0.15 s of the new one smear sideways.
  const whipIn = whipAt(beats, i, field) ? clamp01(1 - local / 0.15) : 0;
  const next = i + 1 < beats.length ? i + 1 : -1;
  const whipOut = next > 0 && whipAt(beats, next, field) ? clamp01(1 - (b.dur - local) / 0.1) : 0;
  const whip = Math.max(whipIn, whipOut);
  if (whip > 0) cam.cx += (whipIn > 0 ? -1 : 1) * whip * 900 / cam.k;

  frameC = canvas(frameC);
  bgC = canvas(bgC);
  fgC = canvas(fgC);
  const f = frameC.getContext('2d')!;
  const bg = bgC.getContext('2d')!;
  const fg = fgC.getContext('2d')!;
  const layers = setLayers(set);
  const near = shot === 'close' || shot === 'react' || shot === 'insert';

  // The set behind, blurred behind a close-up.
  bg.setTransform(1, 0, 0, 1, 0, 0);
  bg.clearRect(0, 0, W, H);
  for (const ly of layers) if (ly.p <= 1) layer(bg, cam, ly.p, () => ly.draw(bg, L, t));
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.fillStyle = L.sky[0];
  f.fillRect(0, 0, W, H);
  f.filter = near ? `blur(${shot === 'insert' ? 12 : 7}px)` : 'none';
  f.drawImage(bgC, 0, 0);
  f.filter = 'none';

  // The cast, then anything in front of them.
  fg.setTransform(1, 0, 0, 1, 0, 0);
  fg.clearRect(0, 0, W, H);
  if (shot !== 'insert') {
    const moves = inkMoves(b.visual, n, focus);
    const prev = i > 0 ? beats[i - 1] : null;
    const before = prev ? inkMoves(prev.visual, n, Math.min(who(prev), n - 1)) : null;
    const text = b.say || b.headline.replace(/\*/g, '');
    const voiced = b.voDur > 0;
    const props = inkProps(b.b);
    // Solo lines show only whoever the line is about; the focus is drawn last (in front).
    const order = cast.map((_, k) => k).filter((k) => !b.tags.includes('solo') || k === focus).sort((a, c) => (a === focus ? 1 : c === focus ? -1 : 0));
    for (const k of order) {
      const mv: InkMove = moves[k];
      const actor: Actor = {
        name: cast[k],
        move: mv,
        from: before ? before[k] : null,
        local,
        t,
        talk: mv === 'talk' ? (voiced ? mouthAt(text, local, b.voStart, b.voDur) : mouthAt(text, local, 0.1, Math.max(0.4, Math.min(b.dur - 0.3, text.length * 0.06)))) : 0,
        facing: spot[k].facing,
        prop: props.find((p) => p.who === k)?.kind,
      };
      layer(fg, cam, 1, (kp) => {
        fg.save();
        fg.translate(spot[k].x, 0);
        if (actor.facing < 0) fg.scale(-1, 1);
        drawPerson(fg, actor, pal, kp);
        fg.restore();
      });
    }
    if (L.dim > 0) {
      fg.save();
      fg.globalCompositeOperation = 'source-atop';
      fg.fillStyle = `rgba(40,52,130,${L.dim})`;
      fg.fillRect(0, 0, W, H);
      fg.restore();
    }
    if (!near) for (const ly of layers) if (ly.p > 1) layer(fg, cam, ly.p, () => ly.draw(fg, L, t));
  } else {
    // Insert: the prop big over the blurred set, turning a little, with a glint.
    const prop = firstProp(b)!;
    const u = clamp01(local / Math.max(0.5, b.dur));
    const s = 4.2 * (1 + 0.08 * easeInOut(u));
    fg.save();
    fg.translate(W / 2, H / 2 - 60);
    fg.rotate(Math.sin(t * 0.8) * 0.06 - 0.04);
    setZoom(s);
    drawProp(fg, prop, 0, 0, s, t, pal);
    fg.restore();
    setZoom(1);
    glint(fg, W / 2 + 220, H / 2 - 320, 40, t);
  }
  f.drawImage(fgC, 0, 0);

  // Onto the frame: the effects' camera, the whip smear, the print finish, then the words.
  const view = fxView(b, local);
  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  if (whip > 0.02) {
    const steps = 7;
    for (let s = 0; s < steps; s++) {
      ctx.globalAlpha = s === 0 ? 1 : 1 / (s + 1);
      ctx.drawImage(frameC, (s - steps / 2) * whip * 38, 0);
    }
    ctx.globalAlpha = 1;
  } else ctx.drawImage(frameC, 0, 0);
  ctx.restore();
  if (str(env.fields, 'look') !== 'clean') finish(ctx, frameC, env.frame);

  topLabel(ctx, b.a);
  captions(ctx, env, b, local, 1430, '#FFE21A');
  fxPost(ctx, b, local);
  markLightFrame(false);
}

registerPreset('ink', draw);
