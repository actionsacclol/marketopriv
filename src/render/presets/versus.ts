import { INTRO, num, rows, str } from '@shared/presets';
import { FONT, SAFE, W, drawLines, easeBack, easeOut, fit, font, gradient, hexA, hookIn, lerp, prog, registerPreset, rrect, scaled, withAlpha, wrap, type Ctx, type Env } from '../engine';

// Versus: headline, two column headers (theirs muted, ours lit), rows tick in
// with checks and crosses, then a verdict.

const FEATURE_X = 70;
const LEFT_C = 640;
const RIGHT_C = 880;
const COL_W = 220;

function mark(ctx: Ctx, v: string, cx: number, cy: number, p: number, accent: [string, string, string], ours: boolean): void {
  const s = easeBack(p);
  if (s <= 0) return;
  const val = v.trim().toLowerCase();
  scaled(ctx, s, cx, cy, () => {
    if (val === 'yes' || val === '✓' || val === 'y') {
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fillStyle = ours ? gradient(ctx, cx - 34, cy, cx + 34, cy, ['#10B981', '#22C55E']) : 'rgba(34,197,94,0.25)';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy);
      ctx.lineTo(cx - 3, cy + 13);
      ctx.lineTo(cx + 17, cy - 13);
      ctx.stroke();
    } else if (val === 'no' || val === '✗' || val === 'x' || val === 'n') {
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(239,68,68,0.22)';
      ctx.fill();
      ctx.strokeStyle = '#F87171';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 12, cy - 12);
      ctx.lineTo(cx + 12, cy + 12);
      ctx.moveTo(cx + 12, cy - 12);
      ctx.lineTo(cx - 12, cy + 12);
      ctx.stroke();
    } else {
      font(ctx, 30, 600, FONT.mono);
      ctx.textAlign = 'center';
      ctx.fillStyle = ours ? accent[1] : 'rgba(255,255,255,0.55)';
      const l = wrap(ctx, v, COL_W - 20).slice(0, 2);
      l.forEach((line, k) => ctx.fillText(line, cx, cy + 10 + (k - (l.length - 1) / 2) * 36));
    }
  });
}

function draw(ctx: Ctx, env: Env): void {
  const { t, fields: f, accent } = env;
  const list = rows(f, 'rows');
  const beat = num(f, 'beat', 0.9);

  const head = fit(ctx, str(f, 'headline'), { maxW: 920, maxH: 260, max: 96, maxLines: 3 });
  let y = SAFE.top + 20;
  scaled(ctx, lerp(0.9, 1, easeOut(prog(t, 0, 0.35))), W / 2, y + 100, () =>
    withAlpha(ctx, hookIn(t), () => {
      font(ctx, head.size, 700);
      y = drawLines(ctx, head.lines, W / 2, y, head.lh, { shadow: true });
    }),
  );

  // Column headers.
  const hy = y + 60;
  const hp = easeOut(prog(t, INTRO, 0.5));
  const rowsTop = hy + 190;
  const gap = 16;
  const rowH = Math.min(124, (1300 - rowsTop - gap * (list.length - 1)) / Math.max(1, list.length));
  const tableBottom = rowsTop + list.length * (rowH + gap) - gap;
  withAlpha(ctx, hp, () => {
    // Our column glows.
    ctx.save();
    ctx.shadowColor = hexA(accent[1], 0.5);
    ctx.shadowBlur = 50;
    rrect(ctx, RIGHT_C - COL_W / 2, hy - 20, COL_W, tableBottom - hy + 40, 32);
    ctx.fillStyle = hexA(accent[1], 0.12);
    ctx.fill();
    ctx.restore();
    rrect(ctx, RIGHT_C - COL_W / 2, hy - 20, COL_W, tableBottom - hy + 40, 32);
    ctx.lineWidth = 3;
    ctx.strokeStyle = gradient(ctx, RIGHT_C - COL_W / 2, 0, RIGHT_C + COL_W / 2, 0, accent);
    ctx.stroke();

    const header = (name: string, price: string, cx: number, ours: boolean): void => {
      const n = fit(ctx, name, { maxW: COL_W - 24, maxH: 90, max: 34, min: 20, maxLines: 2, weight: 700 });
      font(ctx, n.size, 700);
      drawLines(ctx, n.lines, cx, hy, n.lh, { fill: ours ? '#FFFFFF' : 'rgba(255,255,255,0.6)' });
      const pr = fit(ctx, price, { maxW: COL_W - 24, maxH: 60, max: 44, min: 22, maxLines: 1, weight: 700, family: FONT.mono });
      font(ctx, pr.size, 700, FONT.mono);
      drawLines(ctx, pr.lines, cx, hy + 100, pr.lh, { fill: ours ? gradient(ctx, cx - 90, 0, cx + 90, 0, accent) : 'rgba(255,255,255,0.45)' });
    };
    header(str(f, 'left_name'), str(f, 'left_price'), LEFT_C, false);
    header(str(f, 'right_name'), str(f, 'right_price'), RIGHT_C, true);
  });

  // Rows.
  const rowsStart = INTRO + 0.6;
  list.forEach((cols, i) => {
    const start = rowsStart + i * beat;
    const p = prog(t, start, 0.35);
    if (p <= 0) return;
    const ry = rowsTop + i * (rowH + gap);
    const cy = ry + rowH / 2;
    withAlpha(ctx, easeOut(p), () => {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(FEATURE_X, ry + rowH + gap / 2, LEFT_C + COL_W / 2 - FEATURE_X - 20, 2);
      const ft = fit(ctx, cols[0] ?? '', { maxW: LEFT_C - COL_W / 2 - FEATURE_X - 20, maxH: rowH - 10, max: 42, min: 24, maxLines: 2, weight: 600 });
      font(ctx, ft.size, 600);
      drawLines(ctx, ft.lines, FEATURE_X + 30 * (1 - easeOut(p)), cy - (ft.lh * ft.lines.length) / 2, ft.lh, { align: 'left' });
    });
    mark(ctx, cols[1] ?? '', LEFT_C, cy, prog(t, start + 0.08, 0.35), accent, false);
    mark(ctx, cols[2] ?? '', RIGHT_C, cy, prog(t, start + 0.22, 0.35), accent, true);
  });

  // Verdict.
  const vStart = rowsStart + list.length * beat + 0.4;
  const vp = prog(t, vStart, 0.45);
  if (vp > 0) {
    const v = fit(ctx, str(f, 'verdict'), { maxW: 940, maxH: 150, max: 70, maxLines: 2 });
    const vy = Math.min(tableBottom + 70, 1500 - v.lh * v.lines.length);
    scaled(ctx, lerp(0.8, 1, easeBack(vp)), W / 2, vy + 50, () =>
      withAlpha(ctx, easeOut(vp), () => {
        font(ctx, v.size, 700);
        drawLines(ctx, v.lines, W / 2, vy, v.lh, { fill: gradient(ctx, 120, 0, 960, 0, accent), glow: hexA(accent[1], 0.45) });
      }),
    );
  }
}

registerPreset('versus', draw);
