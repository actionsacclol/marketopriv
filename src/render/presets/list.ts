import { INTRO, num, rows, str } from '@shared/presets';
import { FONT, SAFE, W, drawLines, easeBack, easeOut, fit, font, gradient, hexA, hookIn, lerp, pill, prog, registerPreset, rrect, scaled, withAlpha, wrap, type Ctx, type Env } from '../engine';

// Top-N list: kicker + headline, then GitHub-repo-style rows land one per beat.

function draw(ctx: Ctx, env: Env): void {
  const { t, fields: f, accent } = env;
  const items = rows(f, 'items');
  const beat = num(f, 'beat', 1.7);

  // Kicker + headline (visible from frame 0).
  const a0 = hookIn(t);
  let y = SAFE.top + 40;
  withAlpha(ctx, a0, () => {
    const kicker = str(f, 'kicker');
    if (kicker) pill(ctx, kicker, W / 2, y, { size: 28, stroke: hexA(accent[1], 0.8), fill: hexA(accent[1], 0.12), align: 'center' });
  });
  y += 90;
  const head = fit(ctx, str(f, 'headline'), { maxW: SAFE.right - SAFE.left, maxH: 330, max: 100, maxLines: 3 });
  scaled(ctx, lerp(0.9, 1, easeOut(prog(t, 0, 0.35))), W / 2, y + 120, () =>
    withAlpha(ctx, a0, () => {
      font(ctx, head.size, 700);
      y = drawLines(ctx, head.lines, W / 2, y, head.lh, { shadow: true });
    }),
  );
  // Gradient underline that sweeps in.
  const uw = 420 * easeOut(prog(t, 0.15, 0.6));
  ctx.fillStyle = gradient(ctx, W / 2 - 210, 0, W / 2 + 210, 0, accent);
  rrect(ctx, W / 2 - uw / 2, y + 22, uw, 8, 4);
  ctx.fill();

  // Rows.
  const top = y + 80;
  const gap = 24;
  const avail = SAFE.bottom - top;
  const rowH = Math.min(200, (avail - gap * (items.length - 1)) / Math.max(1, items.length));
  const latest = Math.floor((t - INTRO) / beat);
  items.forEach((cols, i) => {
    const start = INTRO + i * beat;
    const p = prog(t, start, 0.42);
    if (p <= 0) return;
    const ry = top + i * (rowH + gap);
    const dx = lerp(140, 0, easeOut(p));
    const active = i === Math.min(latest, items.length - 1);
    withAlpha(ctx, easeOut(p) * (active ? 1 : 0.78), () => {
      ctx.save();
      ctx.translate(dx, 0);
      const x = SAFE.left - 10;
      const w = SAFE.right - SAFE.left + 20;
      rrect(ctx, x, ry, w, rowH, 30);
      ctx.fillStyle = 'rgba(17,17,26,0.92)';
      ctx.fill();
      ctx.lineWidth = active ? 4 : 2;
      ctx.strokeStyle = active ? gradient(ctx, x, 0, x + w, 0, accent) : 'rgba(255,255,255,0.1)';
      if (active) {
        ctx.save();
        ctx.shadowColor = hexA(accent[1], 0.55);
        ctx.shadowBlur = 40;
        ctx.stroke();
        ctx.restore();
      } else ctx.stroke();

      const pad = 34;
      // Index.
      font(ctx, Math.min(40, rowH * 0.26), 600, FONT.mono);
      ctx.fillStyle = accent[1];
      ctx.textAlign = 'left';
      ctx.fillText(String(i + 1).padStart(2, '0'), x + pad, ry + rowH * 0.42);
      // Badge (right).
      const badge = cols[2];
      let right = x + w - pad;
      if (badge) {
        const bs = Math.min(28, rowH * 0.18);
        const pop = easeBack(prog(t, start + 0.2, 0.35));
        scaled(ctx, pop, right - 60, ry + rowH / 2, () => {
          const bw = pill(ctx, badge, right, ry + rowH / 2 - bs * 0.95, { size: bs, fill: gradient(ctx, right - 200, 0, right, 0, accent), align: 'right', weight: 600 });
          right -= bw + 20;
        });
      }
      // Name + description.
      const tx = x + pad + 86;
      const maxW = right - tx;
      font(ctx, Math.min(46, rowH * 0.3), 600, FONT.mono);
      ctx.fillStyle = '#FFFFFF';
      const name = wrap(ctx, cols[0] ?? '', maxW)[0] ?? '';
      ctx.fillText(name, tx, ry + rowH * 0.44);
      if (cols[1]) {
        font(ctx, Math.min(32, rowH * 0.21), 500);
        ctx.fillStyle = 'rgba(255,255,255,0.68)';
        const desc = wrap(ctx, cols[1], maxW)[0] ?? '';
        ctx.fillText(desc, tx, ry + rowH * 0.76);
      }
      ctx.restore();
    });
  });
}

registerPreset('list', draw);
