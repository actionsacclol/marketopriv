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

type Drawable = CanvasImageSource;

/** Draw the `area` of the video into the box, cropped from its middle to the box's shape (cover), `zoom` pushing in. */
function coverArea(ctx: Ctx, v: Drawable, vs: { w: number; h: number }, area: { x: number; y: number; w: number; h: number }, box: { x: number; y: number; w: number; h: number }, zoom = 1): void {
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
  ctx.drawImage(v, sx, sy, sw, sh, box.x, box.y, box.w, box.h);
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
      const s = cover * zoom;
      ctx.drawImage(v, W / 2 - (vs.w * s) / 2, H / 2 - (vs.h * s) / 2, vs.w * s, vs.h * s);
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
    const hk = fit(ctx, hook, seam !== null ? { maxW: 940, maxH: 200, max: 62, maxLines: 2 } : { maxW: 900, maxH: 360, max: 78, maxLines: 3 });
    const hp = easeOut(prog(t, 0, 0.3));
    const top = seam !== null ? seam - (hk.lines.length * hk.lh * 1.12) / 2 : SAFE.top + 10;
    if (seam !== null) captionY = top + hk.lines.length * hk.lh * 1.12 + 38;
    scaled(ctx, lerp(0.92, 1, hp), W / 2, top + 110, () =>
      withAlpha(ctx, lerp(0.5, 1, hp), () => {
        font(ctx, hk.size, 700);
        boxedLines(ctx, hk.lines, top, hk.lh * 1.12, hk.size, seam !== null ? 'rgba(0,0,0,0.88)' : 'rgba(0,0,0,0.78)');
      }),
    );
  }

  // Captions.
  const caps = clipCaptions(str(f, 'captions'), seconds);
  // A line with no text ("6.2 |") ends the one before it: nothing on screen while nobody talks.
  const cur = caps.find((c) => vt >= c.start && vt < c.end && c.text.trim());
  if (cur && str(f, 'fit') === 'split') {
    // Stream clips: the way streams caption themselves. White heavy text with a black outline, no box, and the
    // word being said lit up in the accent colour (spread over the line, about 0.4 s a word).
    const p = prog(vt, cur.start, 0.12);
    const c = fit(ctx, cur.text, { maxW: 940, maxH: 240, max: 88, maxLines: 2, weight: 800 });
    const cy = captionY ?? 1060;
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
            if (k === lit) {
              rrect(ctx, x - c.size * 0.12, base - c.size * 0.86, widths[j] + c.size * 0.24, c.size * 1.08, c.size * 0.16);
              ctx.fillStyle = gradient(ctx, x, 0, x + widths[j], 0, accent);
              ctx.fill();
            }
            ctx.lineWidth = c.size * 0.16;
            ctx.strokeStyle = 'rgba(0,0,0,0.92)';
            ctx.strokeText(w, x, base);
            ctx.fillStyle = '#FFFFFF';
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
    const cy = captionY ?? Math.min(Math.max(videoBottom + 50, 1300), 1500 - c.lh * c.lines.length);
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
