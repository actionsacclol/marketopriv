import { num, str, terminalSchedule, type TermLine } from '@shared/presets';
import { FONT, SAFE, W, drawLines, easeBack, easeOut, fit, font, gradient, hexA, hookIn, lerp, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';

// Terminal: a hook up top, a dev terminal that types commands and prints
// results, then a punchline over a dimmed terminal.

const TX = 56;
const TW = W - 112;
const FS = 34;
const LH = 52;

function draw(ctx: Ctx, env: Env): void {
  const { t, fields: f, accent } = env;

  const head = fit(ctx, str(f, 'headline'), { maxW: 940, maxH: 300, max: 86, maxLines: 3 });
  let y = SAFE.top + 10;
  scaled(ctx, lerp(0.9, 1, easeOut(prog(t, 0, 0.35))), W / 2, y + 100, () =>
    withAlpha(ctx, hookIn(t), () => {
      font(ctx, head.size, 700);
      y = drawLines(ctx, head.lines, W / 2, y, head.lh, { shadow: true });
    }),
  );

  const sched = terminalSchedule(f);
  const lt = t - 0.6; // terminal clock
  const top = Math.max(y + 60, 600);
  const bottom = 1470;
  const th = bottom - top;
  const wp = easeBack(prog(t, 0.1, 0.5));

  scaled(ctx, lerp(0.9, 1, wp), W / 2, top + th / 2, () =>
    withAlpha(ctx, lerp(0.4, 1, easeOut(prog(t, 0, 0.4))), () => {
      ctx.save();
      ctx.shadowColor = hexA(accent[1], 0.4);
      ctx.shadowBlur = 70;
      rrect(ctx, TX, top, TW, th, 28);
      ctx.fillStyle = '#07070B';
      ctx.fill();
      ctx.restore();
      rrect(ctx, TX, top, TW, th, 28);
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Title bar.
      ['#F43F5E', '#F59E0B', '#22C55E'].forEach((c, i) => {
        ctx.beginPath();
        ctx.arc(TX + 44 + i * 40, top + 44, 12, 0, Math.PI * 2);
        ctx.fillStyle = c;
        ctx.fill();
      });
      font(ctx, 28, 500, FONT.mono);
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'center';
      ctx.fillText(str(f, 'title'), W / 2, top + 54);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(TX, top + 88, TW, 2);

      // Body: wrap each visible line to the window, keep the newest in view.
      font(ctx, FS, 500, FONT.mono);
      const cw = ctx.measureText('M').width;
      const cols = Math.floor((TW - 80 - cw * 2) / cw);
      const visual: Array<{ line: TermLine; text: string; first: boolean; typing: boolean }> = [];
      for (const line of sched.lines) {
        if (lt < line.start) break;
        const n = line.kind === 'cmd' ? Math.floor(Math.min(line.text.length, (lt - line.start) * num(f, 'cps', 30))) : line.text.length;
        const text = line.text.slice(0, n);
        const typing = line.kind === 'cmd' && lt < line.end + 0.25;
        for (let k = 0; k === 0 || k < text.length; k += cols) visual.push({ line, text: text.slice(k, k + cols), first: k === 0, typing: typing && k + cols >= text.length });
      }
      const maxRows = Math.floor((th - 130) / LH);
      const shown = visual.slice(-maxRows);
      ctx.textAlign = 'left';
      shown.forEach((v, r) => {
        const by = top + 130 + r * LH;
        const x0 = TX + 40;
        const tx = x0 + cw * 2;
        const age = lt - v.line.start;
        const fade = v.line.kind === 'cmd' ? 1 : easeOut(prog(age, 0, 0.18));
        withAlpha(ctx, fade, () => {
          if (v.first) {
            const prefix = v.line.kind === 'cmd' ? '❯' : v.line.kind === 'ok' ? '✓' : v.line.kind === 'hi' ? '!' : v.line.kind === 'out' ? '›' : '';
            ctx.fillStyle = v.line.kind === 'cmd' ? accent[1] : v.line.kind === 'ok' ? '#22C55E' : v.line.kind === 'hi' ? '#F59E0B' : 'rgba(255,255,255,0.4)';
            ctx.fillText(prefix, x0, by);
          }
          if (v.line.kind === 'hi') {
            ctx.fillStyle = 'rgba(245,158,11,0.14)';
            ctx.fillRect(tx - 8, by - FS, ctx.measureText(v.text).width + 16, LH - 4);
          }
          ctx.fillStyle = v.line.kind === 'cmd' ? '#FFFFFF' : v.line.kind === 'ok' ? '#86EFAC' : v.line.kind === 'hi' ? '#FCD34D' : v.line.kind === 'out' ? 'rgba(255,255,255,0.62)' : 'rgba(255,255,255,0.85)';
          ctx.fillText(v.text, tx, by);
          if (v.typing && Math.floor(t * 2.6) % 2 === 0) {
            ctx.fillStyle = accent[1];
            ctx.fillRect(tx + ctx.measureText(v.text).width + 4, by - FS + 4, cw * 0.6, FS + 4);
          }
        });
      });
      // Idle prompt once everything has printed.
      if (lt > sched.end && shown.length < maxRows && Math.floor(t * 2.6) % 2 === 0) {
        const by = top + 130 + shown.length * LH;
        ctx.fillStyle = accent[1];
        ctx.fillText('❯', TX + 40, by);
        ctx.fillRect(TX + 40 + cw * 2, by - FS + 4, cw * 0.6, FS + 4);
      }
    }),
  );

  // Punchline over a dimmed terminal.
  const pStart = 0.6 + sched.end + 0.8;
  const pp = prog(t, pStart, 0.45);
  if (pp > 0) {
    withAlpha(ctx, easeOut(pp) * 0.94, () => {
      rrect(ctx, TX, top, TW, th, 28);
      ctx.fillStyle = '#050508';
      ctx.fill();
    });
    const p = fit(ctx, str(f, 'punch'), { maxW: 880, maxH: th - 120, max: 84, maxLines: 4 });
    const ph = p.lh * p.lines.length;
    scaled(ctx, lerp(0.85, 1, easeBack(pp)), W / 2, top + th / 2, () =>
      withAlpha(ctx, easeOut(pp), () => {
        font(ctx, p.size, 700);
        drawLines(ctx, p.lines, W / 2, top + th / 2 - ph / 2, p.lh, { fill: gradient(ctx, 140, 0, 940, 0, accent), glow: hexA(accent[1], 0.45) });
      }),
    );
  }
}

registerPreset('terminal', draw);
