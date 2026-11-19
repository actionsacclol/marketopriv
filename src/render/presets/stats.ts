import { INTRO, num, rows, str } from '@shared/presets';
import { FONT, SAFE, W, countUp, drawLines, easeBack, easeInOut, easeOut, fit, font, gradient, hexA, hookIn, lerp, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';

// Big numbers: the headline fills the screen, then docks at the top while one
// giant number per beat counts up with a glitch hit and a label under it.

function glitchText(ctx: Ctx, lines: string[], y: number, lh: number, fill: CanvasGradient, amount: number, seed: number): void {
  if (amount > 0.01) {
    const off = 14 * amount;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7 * amount;
    drawLines(ctx, lines, W / 2 - off, y, lh, { fill: '#FF2D55' });
    drawLines(ctx, lines, W / 2 + off, y + off * 0.3, lh, { fill: '#22D3EE' });
    ctx.restore();
  }
  drawLines(ctx, lines, W / 2, y, lh, { fill, glow: 'rgba(168,85,247,0.35)' });
  if (amount > 0.2) {
    // A couple of displaced horizontal slices.
    for (let i = 0; i < 3; i++) {
      const sy = y + ((seed * 97 + i * 131) % Math.max(1, lh * lines.length));
      const sh = 10 + ((seed * 13 + i * 7) % 26);
      const dx = (((seed + i) * 53) % 60) - 30;
      ctx.drawImage(ctx.canvas, 0, sy, W, sh, dx * amount, sy, W, sh);
    }
  }
}

function draw(ctx: Ctx, env: Env): void {
  const { t, fields: f, accent } = env;
  const stats = rows(f, 'stats');
  const beat = num(f, 'beat', 1.9);
  const dock = easeInOut(prog(t, INTRO - 0.35, 0.45));

  // Headline: big and centred, then docked small at the top.
  const big = fit(ctx, str(f, 'headline'), { maxW: 900, maxH: 520, max: 132, maxLines: 4 });
  const small = fit(ctx, str(f, 'headline').replace(/\n/g, ' '), { maxW: 900, maxH: 140, max: 54, maxLines: 2, weight: 600 });
  const bigH = big.lh * big.lines.length;
  withAlpha(ctx, hookIn(t) * (1 - dock), () =>
    scaled(ctx, lerp(0.9, 1, easeOut(prog(t, 0, 0.35))), W / 2, 880, () => {
      font(ctx, big.size, 700);
      drawLines(ctx, big.lines, W / 2, 880 - bigH / 2, big.lh, { fill: gradient(ctx, 100, 0, 980, 0, ['#FFFFFF', '#FFFFFF', accent[1]]), shadow: true });
    }),
  );
  withAlpha(ctx, dock, () => {
    font(ctx, small.size, 600);
    drawLines(ctx, small.lines, W / 2, SAFE.top + 30, small.lh, { fill: 'rgba(255,255,255,0.85)' });
  });

  // Current number.
  if (t < INTRO - 0.1 || stats.length === 0) return;
  const i = Math.min(stats.length - 1, Math.max(0, Math.floor((t - INTRO) / beat)));
  const local = t - INTRO - i * beat;
  const [value = '', label = ''] = stats[i];
  const exiting = i < stats.length - 1 ? prog(local, beat - 0.22, 0.22) : 0;
  const enter = prog(local, 0, 0.3);

  withAlpha(ctx, easeOut(enter) * (1 - exiting), () => {
    ctx.save();
    ctx.translate(0, -120 * easeOut(exiting));
    const v = fit(ctx, countUp(value, prog(local, 0.05, 0.7)), { maxW: 940, maxH: 340, max: 320, maxLines: 1, family: FONT.sans });
    // Size from the final value so the number doesn't jump while counting.
    const vFinal = fit(ctx, value, { maxW: 940, maxH: 340, max: 320, maxLines: 1, family: FONT.sans });
    const glitch = Math.max(0, 1 - local / 0.18);
    scaled(ctx, lerp(1.25, 1, easeBack(enter)), W / 2, 820, () => {
      font(ctx, vFinal.size, 700);
      glitchText(ctx, v.lines, 820 - vFinal.lh / 2, vFinal.lh, gradient(ctx, 140, 0, 940, 0, accent), glitch, env.frame);
    });
    const lp = prog(local, 0.18, 0.4);
    withAlpha(ctx, easeOut(lp), () => {
      const l = fit(ctx, label, { maxW: 860, maxH: 220, max: 60, maxLines: 3, weight: 500 });
      font(ctx, l.size, 500);
      drawLines(ctx, l.lines, W / 2, 1060 + 30 * (1 - easeOut(lp)), l.lh, { fill: 'rgba(255,255,255,0.86)' });
    });
    ctx.restore();
  });

  // Progress dots.
  const dotW = 56;
  const total = stats.length * dotW + (stats.length - 1) * 14;
  stats.forEach((_, k) => {
    const x = W / 2 - total / 2 + k * (dotW + 14);
    rrect(ctx, x, 1420, dotW, 10, 5);
    ctx.fillStyle = k < i ? hexA(accent[1], 0.7) : k === i ? gradient(ctx, x, 0, x + dotW, 0, accent) : 'rgba(255,255,255,0.15)';
    ctx.fill();
  });
}

registerPreset('stats', draw);
