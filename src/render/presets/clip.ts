import { num, str } from '@shared/presets';
import { FONT, H, SAFE, W, easeBack, easeOut, fit, font, gradient, hexA, lerp, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';

// Clip + hook: a screen recording (blurred-fill or cover), a boxed hook up
// top from frame 0, and captions popping in underneath.

export function clipCaptions(fieldsText: string, seconds: number): Array<{ text: string; start: number; end: number }> {
  const lines = fieldsText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = /^(\d+(?:\.\d+)?)\s*\|\s*(.*)$/.exec(l);
      return m ? { at: Number(m[1]), text: m[2] } : { at: NaN, text: l };
    });
  const span = Math.max(0.5, seconds - 0.6);
  const out = lines.map((l, i) => ({ text: l.text, start: Number.isFinite(l.at) ? l.at : 0.6 + (i * span) / lines.length, end: 0 }));
  out.forEach((c, i) => (c.end = i + 1 < out.length ? out[i + 1].start : seconds));
  return out;
}

function boxedLines(ctx: Ctx, lines: string[], y: number, lh: number, size: number, bg: string): number {
  ctx.textAlign = 'center';
  lines.forEach((l, i) => {
    const w = ctx.measureText(l).width;
    const top = y + i * lh;
    rrect(ctx, W / 2 - w / 2 - size * 0.32, top - size * 0.02, w + size * 0.64, lh * 0.98, size * 0.22);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(l, W / 2, top + lh * 0.78);
  });
  return y + lh * lines.length;
}

/** "x,y,w,h" as fractions of the frame (clamped inside it), or null when empty or not four numbers. */
export function parseArea(s: string): { x: number; y: number; w: number; h: number } | null {
  const n = s.split(/[\s,]+/).filter(Boolean).map(Number);
  if (n.length !== 4 || n.some((x) => !Number.isFinite(x))) return null;
  const x = Math.min(Math.max(n[0], 0), 0.98);
  const y = Math.min(Math.max(n[1], 0), 0.98);
  const w = Math.min(Math.max(n[2], 0.02), 1 - x);
  const h = Math.min(Math.max(n[3], 0.02), 1 - y);
  return { x, y, w, h };
}

type Area = { x: number; y: number; w: number; h: number };

/**
 * The area to show, moving over time: "0 | x,y,w,h; 8.5 | x,y,w,h" (or one per line) glides to each area at its
 * time; a plain "x,y,w,h" stays put. Null when nothing valid is given.
 */
export function areaAt(text: string, t: number): Area | null {
  const parts = text.split(/[;\n]/).map((p) => p.trim()).filter(Boolean);
  const keys = parts
    .map((p) => {
      const m = /^(\d+(?:\.\d+)?)\s*\|\s*(.+)$/.exec(p);
      const a = parseArea(m ? m[2] : p);
      return a ? { at: m ? Number(m[1]) : 0, a } : null;
    })
    .filter((k): k is { at: number; a: Area } => !!k)
    .sort((x, y) => x.at - y.at);
  if (!keys.length) return null;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].at <= t) i++;
  const cur = keys[i];
  const prev = keys[i - 1];
  if (!prev || t < cur.at) return keys[0].a;
  const k = easeOut(prog(t, cur.at, 0.45));
  return { x: lerp(prev.a.x, cur.a.x, k), y: lerp(prev.a.y, cur.a.y, k), w: lerp(prev.a.w, cur.a.w, k), h: lerp(prev.a.h, cur.a.h, k) };
}

type Drawable = CanvasImageSource;

/** The part of the video coverArea draws: the `area` cropped from its middle to the box's shape, `zoom` pushing in. */
function coverSource(vs: { w: number; h: number }, area: { x: number; y: number; w: number; h: number }, box: { w: number; h: number }, zoom = 1): { sx: number; sy: number; sw: number; sh: number } {
  let sw = area.w * vs.w;
  let sh = area.h * vs.h;
  let sx = area.x * vs.w;
  let sy = area.y * vs.h;
  const want = box.w / box.h;
  if (sw / sh > want) {
    const nw = sh * want;
    sx += (sw - nw) / 2;
    sw = nw;
  } else {
    const nh = sw / want;
    sy += (sh - nh) / 2;
    sh = nh;
  }
  if (zoom > 1) {
    const zw = sw / zoom;
    const zh = sh / zoom;
    sx += (sw - zw) / 2;
    sy += (sh - zh) / 2;
    sw = zw;
    sh = zh;
  }
  return { sx, sy, sw, sh };
}

/** Draw the `area` of the video into the box, cropped from its middle to the box's shape (cover), `zoom` pushing in. */
function coverArea(ctx: Ctx, v: Drawable, vs: { w: number; h: number }, area: { x: number; y: number; w: number; h: number }, box: { x: number; y: number; w: number; h: number }, zoom = 1): void {
  const { sx, sy, sw, sh } = coverSource(vs, area, box, zoom);
  ctx.drawImage(v, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
}

export interface Stamp {
  start: number;
  end: number;
  text: string;
  sub: string;
}

/** "2.1 | 41 FPS", "2.1-4 | 41 FPS / before": big text slammed on at a moment, until the next one (at most 2.5 s). */
export function clipStamps(fieldsText: string, seconds: number): Stamp[] {
  const out: Stamp[] = [];
  for (const raw of fieldsText.split('\n')) {
    const m = /^\s*(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*\|\s*(.+)$/.exec(raw);
    if (!m) continue;
    const [text, sub = ''] = m[3].split(/\s+\/\s+/);
    out.push({ start: Number(m[1]), end: m[2] ? Number(m[2]) : NaN, text: text.trim(), sub: sub.trim() });
  }
  out.sort((a, b) => a.start - b.start);
  out.forEach((s, i) => {
    if (!Number.isFinite(s.end) || s.end <= s.start) s.end = Math.min(out[i + 1]?.start ?? seconds, s.start + 2.5, seconds);
  });
  return out.filter((s) => s.text);
}

export interface Punch {
  at: number;
  x: number;
  y: number;
  zoom: number;
  dur: number;
}

/** "3.2 | 0.7,0.4" or "3.2 | 0.7,0.4 | 2 | 1.8": a quick zoom onto a point of the video (fractions), how far, how long. */
export function clipPunches(fieldsText: string): Punch[] {
  const out: Punch[] = [];
  for (const raw of fieldsText.split('\n')) {
    const p = raw.split('|').map((x) => x.trim());
    const at = Number(p[0]);
    const xy = (p[1] ?? '').split(/[\s,]+/).map(Number);
    if (!p[0] || !Number.isFinite(at) || xy.length !== 2 || xy.some((n) => !Number.isFinite(n))) continue;
    const zoom = Math.min(3, Math.max(1.1, Number(p[2]) || 1.7));
    const dur = Math.min(6, Math.max(0.6, Number(p[3]) || 1.4));
    out.push({ at, x: Math.min(1, Math.max(0, xy[0])), y: Math.min(1, Math.max(0, xy[1])), zoom, dur });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** How far the punch in effect at t zooms (1 = none) and onto which point: in fast, hold, out. */
function punchAt(list: Punch[], t: number): { z: number; x: number; y: number } {
  const p = list.find((q) => t >= q.at && t < q.at + q.dur);
  if (!p) return { z: 1, x: 0.5, y: 0.5 };
  const into = easeOut(prog(t, p.at, 0.22));
  const out = 1 - easeOut(prog(t, p.at + p.dur - 0.3, 0.3));
  return { z: 1 + (p.zoom - 1) * Math.min(into, out), x: p.x, y: p.y };
}

/** Zoom the drawing done in fn around the screen point (px, py). */
function zoomedAt(ctx: Ctx, z: number, px: number, py: number, fn: () => void): void {
  if (z <= 1.0001) return fn();
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(z, z);
  ctx.translate(-px, -py);
  fn();
  ctx.restore();
}

/** Text the way meme pages write on video: white, heavy, a thick black outline, no box. */
function outlined(ctx: Ctx, lines: string[], top: number, lh: number, size: number): void {
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  lines.forEach((l, i) => {
    const y = top + i * lh + lh * 0.8;
    ctx.lineWidth = size * 0.26;
    ctx.strokeStyle = 'rgba(0,0,0,1)';
    ctx.strokeText(l, W / 2, y);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(l, W / 2, y);
  });
}

/** Split framing: how tall the facecam panel is. */
const CAM_H = 720;

function draw(ctx: Ctx, env: Env): void {
  const { t, fields: f, accent } = env;
  const seconds = num(f, 'seconds', 12);
  const vt = Math.min(t, seconds);

  // Video.
  const v = env.video;
  const vs = env.videoSize;
  const zoom = f.zoom === true && str(f, 'fit') !== 'full' ? lerp(1, 1.08, easeOut(vt / Math.max(1, seconds))) : 1;
  const meme = str(f, 'look') === 'meme';
  const punch = punchAt(clipPunches(str(f, 'punches')), vt);
  let videoBottom = 1300;
  /** Split framing puts the captions on the seam between camera and gameplay. */
  let captionY: number | null = null;
  /** Split with a camera: the headline sits on the seam, so it never covers the streamer's face. */
  let seam: number | null = null;
  if (v && vs && vs.w > 0 && vs.h > 0) {
    const cover = Math.max(W / vs.w, H / vs.h);
    const framing = str(f, 'fit');
    if (framing === 'split') {
      // A stream clip, the way clippers cut them: the streamer's camera on top, the gameplay under it. With no
      // camera marked, the gameplay fills the screen.
      const cam = parseArea(str(f, 'cam'));
      const game = parseArea(str(f, 'game')) ?? { x: 0, y: 0, w: 1, h: 1 };
      if (cam) {
        coverArea(ctx, v, vs, cam, { x: 0, y: 0, w: W, h: CAM_H });
        coverArea(ctx, v, vs, game, { x: 0, y: CAM_H, w: W, h: H - CAM_H }, zoom);
        ctx.fillStyle = gradient(ctx, 0, 0, W, 0, accent);
        ctx.fillRect(0, CAM_H - 3, W, 6);
        seam = CAM_H;
        // Right under the hook's box on the seam (set below, once the hook is measured), else just under the seam.
        captionY = CAM_H + 40;
      } else {
        coverArea(ctx, v, vs, game, { x: 0, y: 0, w: W, h: H }, zoom);
        captionY = 1060;
      }
      videoBottom = H;
    } else if (framing === 'cover' || framing === 'full') {
      // With an area marked (the panel that matters in a wide app window), that part fills the screen.
      const area = areaAt(str(f, 'game'), vt);
      if (area) {
        const box = { x: 0, y: 0, w: W, h: H };
        const src = coverSource(vs, area, box, zoom);
        const px = ((punch.x * vs.w - src.sx) / src.sw) * W;
        const py = ((punch.y * vs.h - src.sy) / src.sh) * H;
        zoomedAt(ctx, punch.z, px, py, () => coverArea(ctx, v, vs, area, box, zoom));
      } else {
        const s = cover * zoom;
        const left = W / 2 - (vs.w * s) / 2;
        const top = H / 2 - (vs.h * s) / 2;
        zoomedAt(ctx, punch.z, left + punch.x * vs.w * s, top + punch.y * vs.h * s, () => ctx.drawImage(v, left, top, vs.w * s, vs.h * s));
      }
      // full = a finished video shown as it is; cover dims it a little so the hook reads.
      if (framing === 'cover') {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, 0, W, H);
      }
      videoBottom = 1300;
    } else {
      ctx.save();
      ctx.filter = 'blur(38px) brightness(0.45) saturate(1.2)';
      ctx.drawImage(v, W / 2 - (vs.w * cover * 1.1) / 2, H / 2 - (vs.h * cover * 1.1) / 2, vs.w * cover * 1.1, vs.h * cover * 1.1);
      ctx.restore();
      const s = (Math.min(W / vs.w, 1100 / vs.h) * zoom);
      const w = vs.w * s;
      const h = vs.h * s;
      const cy = 1000;
      zoomedAt(ctx, punch.z, W / 2 - w / 2 + punch.x * w, cy - h / 2 + punch.y * h, () => {
        ctx.save();
        ctx.shadowColor = hexA(accent[1], 0.35);
        ctx.shadowBlur = 60;
        rrect(ctx, W / 2 - w / 2, cy - h / 2, w, h, w >= W - 2 ? 0 : 24);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.restore();
        ctx.save();
        rrect(ctx, W / 2 - w / 2, cy - h / 2, w, h, w >= W - 2 ? 0 : 24);
        ctx.clip();
        ctx.drawImage(v, W / 2 - w / 2, cy - h / 2, w, h);
        ctx.restore();
      });
      videoBottom = cy + h / 2;
    }
  } else {
    rrect(ctx, 60, 700, W - 120, 600, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    ctx.fill();
    ctx.setLineDash([16, 14]);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.setLineDash([]);
    font(ctx, 40, 600, FONT.mono);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.textAlign = 'center';
    ctx.fillText(str(f, 'video') ? 'loading video…' : 'pick a video', W / 2, 1012);
  }

  // Hook (frame 0); none when the field is empty.
  const hook = str(f, 'headline').trim();
  if (hook) {
    const hk = fit(ctx, hook, seam !== null ? { maxW: 940, maxH: 200, max: 62, maxLines: 2 } : meme ? { maxW: 960, maxH: 380, max: 84, maxLines: 3, weight: 800 } : { maxW: 900, maxH: 360, max: 78, maxLines: 3 });
    const hp = easeOut(prog(t, 0, 0.3));
    if (meme && seam === null) {
      // A dark fade behind the meme text: over a busy app screen, outlined text alone does not read.
      const fadeTo = SAFE.top + 10 + hk.lines.length * hk.lh * 1.08 + 220;
      const g = ctx.createLinearGradient(0, 0, 0, fadeTo);
      g.addColorStop(0, 'rgba(0,0,0,0.78)');
      g.addColorStop(0.65, 'rgba(0,0,0,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, fadeTo);
    }
    const top = seam !== null ? seam - (hk.lines.length * hk.lh * 1.12) / 2 : SAFE.top + 10;
    if (seam !== null) captionY = top + hk.lines.length * hk.lh * 1.12 + 38;
    scaled(ctx, lerp(0.92, 1, hp), W / 2, top + 110, () =>
      withAlpha(ctx, lerp(0.5, 1, hp), () => {
        if (meme && seam === null) {
          font(ctx, hk.size, 800);
          outlined(ctx, hk.lines, top, hk.lh * 1.08, hk.size);
        } else {
          font(ctx, hk.size, 700);
          boxedLines(ctx, hk.lines, top, hk.lh * 1.12, hk.size, seam !== null ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.78)');
        }
      }),
    );
  }

  // Stamps: a big number or word slammed onto the middle of the video, a little tilted, with a small line under it.
  const stamp = clipStamps(str(f, 'stamps'), seconds).find((s) => vt >= s.start && vt < s.end);
  if (stamp) {
    const sp = prog(vt, stamp.start, 0.18);
    const gone = 1 - easeOut(prog(vt, stamp.end - 0.15, 0.15));
    const st = fit(ctx, stamp.text, { maxW: 860, maxH: 300, max: 170, maxLines: 2, weight: 900 });
    const cy = 860;
    const shake = sp < 1 ? Math.sin(vt * 90) * 10 * (1 - sp) : 0;
    ctx.save();
    ctx.translate(W / 2 + shake, cy);
    ctx.rotate(-0.06);
    scaled(ctx, lerp(1.7, 1, easeBack(sp)), 0, 0, () =>
      withAlpha(ctx, Math.min(easeOut(prog(vt, stamp.start, 0.08)), gone), () => {
        font(ctx, st.size, 900);
        const widths = st.lines.map((l) => ctx.measureText(l).width);
        const bw = Math.max(...widths) + st.size * 0.7;
        const bh = st.lines.length * st.lh * 1.02 + st.size * 0.3;
        rrect(ctx, -bw / 2, -bh / 2, bw, bh, st.size * 0.2);
        ctx.fillStyle = gradient(ctx, -bw / 2, 0, bw / 2, 0, accent);
        ctx.fill();
        ctx.lineWidth = 8;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        st.lines.forEach((l, i) => ctx.fillText(l, 0, -bh / 2 + st.size * 0.15 + i * st.lh * 1.02 + st.lh * 0.8));
        if (stamp.sub) {
          font(ctx, 46, 800);
          const sw = ctx.measureText(stamp.sub).width;
          rrect(ctx, -sw / 2 - 22, bh / 2 + 14, sw + 44, 66, 14);
          ctx.fillStyle = 'rgba(0,0,0,0.85)';
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(stamp.sub, 0, bh / 2 + 62);
        }
      }),
    );
    ctx.restore();
  }

  // Captions.
  const caps = clipCaptions(str(f, 'captions'), seconds);
  // A line with no text ("6.2 |") ends the one before it: nothing on screen while nobody talks.
  const cur = caps.find((c) => vt >= c.start && vt < c.end && c.text.trim());
  if (cur && (str(f, 'fit') === 'split' || meme)) {
    // Stream clips: the way streams caption themselves. White heavy text with a black outline, no box, and the
    // word being said turns yellow (spread over the line, about 0.4 s a word). Same yellow as narrated captions.
    const p = prog(vt, cur.start, 0.12);
    const c = fit(ctx, cur.text, { maxW: 940, maxH: 240, max: 88, maxLines: 2, weight: 800 });
    let cy = captionY ?? (meme ? 1280 : 1060);
    // A campaign's ad banner near the bottom: the captions stay above it.
    if (env.bannerTop !== null) cy = Math.min(cy, env.bannerTop - 30 - c.lh * c.lines.length * 1.1);
    const words = cur.text.trim().split(/\s+/);
    const per = Math.min(0.4, (cur.end - cur.start) / Math.max(1, words.length));
    const lit = Math.min(words.length - 1, Math.floor((vt - cur.start) / Math.max(0.05, per)));
    scaled(ctx, lerp(0.9, 1, easeBack(p)), W / 2, cy + 40, () =>
      withAlpha(ctx, easeOut(p), () => {
        font(ctx, c.size, 800);
        ctx.textAlign = 'left';
        ctx.lineJoin = 'round';
        const space = ctx.measureText(' ').width;
        let k = 0;
        c.lines.forEach((l, i) => {
          const ws = l.split(/\s+/).filter(Boolean);
          const widths = ws.map((w) => ctx.measureText(w).width);
          let x = W / 2 - (widths.reduce((s, w) => s + w, 0) + space * (ws.length - 1)) / 2;
          const base = cy + i * c.lh * 1.1 + c.lh * 0.8;
          ws.forEach((w, j) => {
            ctx.lineWidth = c.size * 0.16;
            ctx.strokeStyle = 'rgba(0,0,0,0.92)';
            ctx.strokeText(w, x, base);
            ctx.fillStyle = k === lit ? '#FFE03D' : '#FFFFFF';
            ctx.fillText(w, x, base);
            x += widths[j] + space;
            k++;
          });
        });
      }),
    );
  } else if (cur) {
    const p = prog(vt, cur.start, 0.22);
    const c = fit(ctx, cur.text, { maxW: 860, maxH: 200, max: 64, maxLines: 2 });
    let cy = captionY ?? Math.min(Math.max(videoBottom + 50, 1300), 1500 - c.lh * c.lines.length);
    if (env.bannerTop !== null) cy = Math.min(cy, env.bannerTop - 30 - c.lh * c.lines.length * 1.15);
    scaled(ctx, lerp(0.8, 1, easeBack(p)), W / 2, cy + 40, () =>
      withAlpha(ctx, easeOut(p), () => {
        font(ctx, c.size, 700);
        ctx.textAlign = 'center';
        c.lines.forEach((l, i) => {
          const w = ctx.measureText(l).width;
          const top = cy + i * c.lh * 1.15;
          rrect(ctx, W / 2 - w / 2 - 26, top, w + 52, c.lh * 1.08, 18);
          ctx.fillStyle = gradient(ctx, W / 2 - w / 2, 0, W / 2 + w / 2, 0, accent);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(l, W / 2, top + c.lh * 0.82);
        });
      }),
    );
  }
}

registerPreset('clip', draw);
