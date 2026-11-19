import { num, postTyping, str } from '@shared/presets';
import { FONT, W, countUp, drawLines, easeBack, easeOut, fit, font, gradient, hexA, lerp, logo, prog, registerPreset, rrect, scaled, withAlpha, wrap, type Ctx, type Env } from '../engine';

// Post card: one of OUR posts types itself out on a dark card, the numbers
// tick up, then a punchline lands under it.

const CARD_X = 60;
const CARD_W = W - 120;
const PAD = 48;

function icon(ctx: Ctx, kind: 'reply' | 'repost' | 'like' | 'views', x: number, y: number, s: number, color: string): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (kind === 'reply') {
    ctx.roundRect(x, y - s * 0.4, s, s * 0.7, s * 0.3);
    ctx.moveTo(x + s * 0.25, y + s * 0.3);
    ctx.lineTo(x + s * 0.1, y + s * 0.5);
  } else if (kind === 'repost') {
    ctx.moveTo(x, y - s * 0.15);
    ctx.lineTo(x + s * 0.2, y - s * 0.35);
    ctx.lineTo(x + s * 0.8, y - s * 0.35);
    ctx.lineTo(x + s * 0.8, y);
    ctx.moveTo(x + s, y + s * 0.15);
    ctx.lineTo(x + s * 0.8, y + s * 0.35);
    ctx.lineTo(x + s * 0.2, y + s * 0.35);
    ctx.lineTo(x + s * 0.2, y);
  } else if (kind === 'like') {
    const cx = x + s / 2;
    ctx.moveTo(cx, y + s * 0.4);
    ctx.bezierCurveTo(x - s * 0.1, y - s * 0.05, x + s * 0.15, y - s * 0.55, cx, y - s * 0.15);
    ctx.bezierCurveTo(x + s * 0.85, y - s * 0.55, x + s * 1.1, y - s * 0.05, cx, y + s * 0.4);
  } else {
    for (let i = 0; i < 4; i++) {
      const h = s * (0.3 + i * 0.2);
      ctx.moveTo(x + i * s * 0.28, y + s * 0.4);
      ctx.lineTo(x + i * s * 0.28, y + s * 0.4 - h);
    }
  }
  if (kind === 'like') ctx.fill();
  else ctx.stroke();
  ctx.restore();
}

function draw(ctx: Ctx, env: Env): void {
  const { t, fields: f, accent } = env;
  const text = str(f, 'text');
  const typeEnd = 0.7 + postTyping(f);
  // Layout (from the full text so the card doesn't grow while typing).
  font(ctx, 50, 500);
  const lines = wrap(ctx, text, CARD_W - PAD * 2);
  // The first line is there from frame 0 (the hook); the rest types out.
  const typed = (lines[0]?.length ?? 0) + 1 + Math.floor(Math.max(0, t - 0.5) * num(f, 'cps', 42));
  const shown = text.slice(0, Math.min(text.length, typed));
  const bodyLh = 66;
  const headH = 130;
  const metricsH = 110;
  const cardH = PAD + headH + 24 + lines.length * bodyLh + 30 + metricsH;
  const punchStart = typeEnd + 1.0;
  const lift = easeOut(prog(t, punchStart, 0.5)) * 140;
  const cardY = Math.max(260, 860 - cardH / 2) - lift;

  const pop = easeBack(prog(t, 0, 0.55));
  scaled(ctx, lerp(0.86, 1, pop), W / 2, cardY + cardH / 2, () =>
    withAlpha(ctx, lerp(0.75, 1, easeOut(prog(t, 0, 0.3))), () => {
      // Card.
      ctx.save();
      ctx.shadowColor = hexA(accent[1], 0.35);
      ctx.shadowBlur = 60;
      rrect(ctx, CARD_X, cardY, CARD_W, cardH, 36);
      ctx.fillStyle = '#0B0B10';
      ctx.fill();
      ctx.restore();
      rrect(ctx, CARD_X, cardY, CARD_W, cardH, 36);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Header: avatar, name, badge, handle.
      const ax = CARD_X + PAD + 50;
      const ay = cardY + PAD + 50;
      ctx.beginPath();
      ctx.arc(ax, ay, 52, 0, Math.PI * 2);
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = gradient(ctx, ax - 52, ay, ax + 52, ay, accent);
      ctx.stroke();
      logo(ctx, env, ax, ay, 78);
      const nx = ax + 80;
      font(ctx, 46, 700);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      const name = str(f, 'name');
      ctx.fillText(name, nx, ay - 6);
      if (f.verified === true) {
        const bx = nx + ctx.measureText(name).width + 34;
        ctx.beginPath();
        ctx.arc(bx, ay - 22, 20, 0, Math.PI * 2);
        ctx.fillStyle = accent[1];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(bx - 9, ay - 22);
        ctx.lineTo(bx - 2, ay - 14);
        ctx.lineTo(bx + 10, ay - 30);
        ctx.stroke();
      }
      font(ctx, 36, 500);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText(`${str(f, 'handle')} · 2h`, nx, ay + 42);

      // Body text, typed.
      font(ctx, 50, 500);
      ctx.fillStyle = '#F4F4F5';
      const typedLines = wrapTyped(lines, shown.length);
      let by = cardY + PAD + headH + 24;
      typedLines.forEach((l) => {
        ctx.fillText(l, CARD_X + PAD, by + bodyLh * 0.78);
        by += bodyLh;
      });
      const typing = shown.length < text.length || t < typeEnd + 0.6;
      if (typing && Math.floor(t * 2.4) % 2 === 0) {
        const last = typedLines[typedLines.length - 1] ?? '';
        const cx = CARD_X + PAD + ctx.measureText(last).width + 6;
        const cy = cardY + PAD + headH + 24 + (typedLines.length - 1) * bodyLh;
        ctx.fillStyle = accent[1];
        ctx.fillRect(cx, cy + 12, 5, bodyLh - 14);
      }

      // Metrics, counting up once the post is written.
      const my = cardY + cardH - metricsH / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fillRect(CARD_X + PAD, my - metricsH / 2 + 6, CARD_W - PAD * 2, 2);
      const mp = prog(t, typeEnd - 0.2, 1.1);
      const metrics: Array<['reply' | 'repost' | 'like' | 'views', string]> = [
        ['reply', ''],
        ['repost', str(f, 'reposts')],
        ['like', str(f, 'likes')],
        ['views', str(f, 'views')],
      ];
      const colW = (CARD_W - PAD * 2) / metrics.length;
      metrics.forEach(([k, v], i) => {
        const x = CARD_X + PAD + i * colW;
        const liked = k === 'like' && mp > 0.3;
        icon(ctx, k, x, my, 34, liked ? '#F43F5E' : 'rgba(255,255,255,0.55)');
        if (v && mp > 0) {
          font(ctx, 32, 500, FONT.mono);
          ctx.fillStyle = liked ? '#F43F5E' : 'rgba(255,255,255,0.6)';
          ctx.textAlign = 'left';
          ctx.fillText(countUp(v, mp), x + 50, my + 11);
        }
      });
    }),
  );

  // Punchline.
  const pp = prog(t, punchStart, 0.45);
  if (pp > 0) {
    const py = cardY + cardH + 70;
    const punch = fit(ctx, str(f, 'punch'), { maxW: 920, maxH: Math.max(120, 1500 - py), max: 92, maxLines: 3 });
    scaled(ctx, lerp(0.8, 1, easeBack(pp)), W / 2, py + 80, () =>
      withAlpha(ctx, easeOut(pp), () => {
        font(ctx, punch.size, 700);
        drawLines(ctx, punch.lines, W / 2, py, punch.lh, { fill: gradient(ctx, 120, 0, 960, 0, accent), glow: hexA(accent[1], 0.45) });
      }),
    );
  }
}

/** The first n characters of the text, laid out on the final (full-text) lines. */
function wrapTyped(lines: string[], n: number): string[] {
  const out: string[] = [];
  let left = n;
  for (const l of lines) {
    if (left <= 0) break;
    out.push(l.slice(0, left));
    left -= l.length + 1; // the newline / space the wrap consumed
  }
  return out;
}

registerPreset('post', draw);
