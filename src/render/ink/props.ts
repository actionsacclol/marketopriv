import type { Ctx } from '../engine';
import type { InkPalette, InkProp } from '@shared/ink';
import { FINE, INK, box, glint, line, oval, shape, split, ticks, tone, type Pt } from './pen';

// Props in the same ink and flat colour as the cast: every noun the narration names gets drawn, never left as a word.
// Each is about 140 px across at s = 1, centred on (0,0) after the caller's translate.

const GOLD = '#F2C14A';
const GREEN = '#7FB86A';
const STEEL = '#B9BCC8';

export function drawProp(ctx: Ctx, kind: InkProp, x: number, y: number, s: number, t: number, pal: InkPalette): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const sd = 91;
  switch (kind) {
    case 'cash': {
      for (let i = 2; i >= 0; i--) {
        const p = shape(ctx, box(-80 + i * 6, -40 - i * 12, 160, 80, 0.06), GREEN, { w: 3.4, seed: sd + i });
        split(ctx, p, tone(GREEN, -0.18), -100, 20, 100, -20);
        line(ctx, oval(i * 6, -i * 12, 22, 22, 10), { w: 2.4, closed: true, seed: sd + 5 + i });
      }
      ctx.fillStyle = '#E8DFC8';
      ctx.fillRect(-14, -66, 28, 84);
      line(ctx, [[-14, -66], [-14, 18]], { w: 2, seed: sd + 9 });
      line(ctx, [[14, -66], [14, 18]], { w: 2, seed: sd + 10 });
      break;
    }
    case 'bag': {
      const p = shape(ctx, [[-30, -70], [30, -70], [70, -10], [80, 50], [40, 80], [-40, 80], [-80, 50], [-70, -10]], '#C9A77A', { w: 4, seed: sd });
      split(ctx, p, '#A3825A', -20, -80, -60, 80);
      line(ctx, [[-34, -64], [0, -54], [34, -64]], { w: 5, seed: sd + 1 });
      ctx.fillStyle = INK;
      ctx.font = '700 70px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 46);
      break;
    }
    case 'coin':
    case 'ring': {
      if (kind === 'ring') {
        line(ctx, oval(0, 10, 50, 40, 16), { w: 16, closed: true, color: GOLD, seed: sd });
        line(ctx, oval(0, 10, 58, 48, 16), { w: 3, closed: true, seed: sd + 1 });
        const p = shape(ctx, [[0, -60], [26, -34], [0, -14], [-26, -34]], '#BFE6F2', { w: 3, seed: sd + 2 });
        split(ctx, p, '#8CC4D8', 0, -60, 0, -14);
        glint(ctx, 8, -44, 22, t);
        break;
      }
      const p = shape(ctx, oval(0, 0, 70, 70, 18), GOLD, { w: 4, seed: sd });
      split(ctx, p, tone(GOLD, -0.2), -80, 60, 80, -60);
      line(ctx, oval(0, 0, 52, 52, 16), { w: 2.4, closed: true, color: FINE, seed: sd + 1 });
      ctx.fillStyle = INK;
      ctx.font = '700 64px "Chakra Petch", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('₿', 0, 22);
      glint(ctx, 30, -36, 20, t);
      break;
    }
    case 'phone': {
      const p = shape(ctx, box(-40, -78, 80, 156, 0.16), '#2A2430', { w: 4, seed: sd });
      void p;
      ctx.fillStyle = pal.blue;
      ctx.fillRect(-30, -64, 60, 120);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-30, -64, 18, 120);
      break;
    }
    case 'letter': {
      const p = shape(ctx, box(-90, -60, 180, 120, 0.04), pal.pale, { w: 3.6, seed: sd });
      split(ctx, p, tone(pal.pale, -0.12), -90, 60, 90, -10);
      line(ctx, [[-90, -60], [0, 6], [90, -60]], { w: 3, seed: sd + 1 });
      shape(ctx, oval(0, 12, 16, 16, 10), pal.accent2, { w: 2.4, seed: sd + 2 });
      break;
    }
    case 'laptop': {
      const sc = shape(ctx, [[-90, -110], [90, -110], [86, 0], [-86, 0]], '#3A3440', { w: 4, seed: sd });
      void sc;
      ctx.fillStyle = pal.blue;
      ctx.fillRect(-76, -98, 152, 88);
      shape(ctx, [[-110, 0], [110, 0], [124, 22], [-124, 22]], STEEL, { w: 4, seed: sd + 1 });
      break;
    }
    case 'chart': {
      const p = shape(ctx, box(-90, -90, 180, 180, 0.04), pal.pale, { w: 3.6, seed: sd });
      split(ctx, p, tone(pal.pale, -0.1), -90, 90, 90, 20);
      const up = Math.sin(t * 0.7) > -2;
      const pts: Pt[] = [[-66, 40], [-30, 10], [0, 30], [30, -20], [66, up ? -60 : 50]];
      line(ctx, pts, { w: 6, color: up ? '#3FA34D' : '#C8423A', seed: sd + 1, taper: false });
      line(ctx, [[-70, -70], [-70, 66], [70, 66]], { w: 2.6, seed: sd + 2, taper: false });
      break;
    }
    case 'keys': {
      line(ctx, oval(-30, -30, 26, 26, 12), { w: 6, closed: true, color: STEEL, seed: sd });
      for (const [dx, a] of [[0, 0.5], [10, 1.1]] as Array<[number, number]>) {
        ctx.save();
        ctx.translate(-14 + dx, -14);
        ctx.rotate(a);
        shape(ctx, [[-10, 0], [10, 0], [8, 90], [20, 96], [20, 110], [-8, 112], [-10, 0]], dx ? GOLD : STEEL, { w: 3, seed: sd + 2 + dx });
        ctx.restore();
      }
      break;
    }
    case 'briefcase': {
      line(ctx, [[-30, -70], [-30, -90], [30, -90], [30, -70]], { w: 7, seed: sd, taper: false });
      const p = shape(ctx, box(-110, -70, 220, 140, 0.1), '#6A3C24', { w: 4, seed: sd + 1 });
      split(ctx, p, '#4E2A18', -110, 70, 110, -20);
      ctx.fillStyle = GOLD;
      ctx.fillRect(-14, -16, 28, 22);
      break;
    }
    case 'drive': {
      const p = shape(ctx, box(-80, -110, 160, 220, 0.08), STEEL, { w: 4, seed: sd });
      split(ctx, p, tone(STEEL, -0.18), -80, 110, 80, 0);
      line(ctx, oval(0, -20, 52, 52, 16), { w: 3, closed: true, seed: sd + 1 });
      line(ctx, oval(0, -20, 10, 10, 8), { w: 3, closed: true, seed: sd + 2 });
      line(ctx, [[0, -20], [46, 50]], { w: 4, seed: sd + 3 });
      ctx.fillStyle = '#2E7D3A';
      ctx.fillRect(-70, 78, 140, 22);
      glint(ctx, 40, -86, 18, t);
      break;
    }
    case 'trashbag': {
      const p = shape(ctx, [[-20, -110], [20, -110], [30, -80], [90, -20], [100, 60], [60, 100], [-60, 100], [-100, 60], [-90, -20], [-30, -80]], '#2B2A33', { w: 4, seed: sd });
      split(ctx, p, '#45434F', 10, -120, 80, 100);
      line(ctx, [[-30, -86], [0, -96], [30, -86]], { w: 3, seed: sd + 1 });
      ticks(ctx, p, -90, -60, 180, 150, 10, { len: 30, angle: 1.2, color: 'rgba(255,255,255,0.25)', seed: sd + 2, w: 2.4 });
      break;
    }
    case 'shovel': {
      line(ctx, [[0, -180], [0, 60]], { w: 14, color: '#8A5A34', seed: sd, taper: false });
      line(ctx, [[-24, -186], [24, -186]], { w: 10, seed: sd + 1, taper: false });
      const p = shape(ctx, [[-46, 56], [46, 56], [40, 140], [0, 170], [-40, 140]], STEEL, { w: 4, seed: sd + 2 });
      split(ctx, p, tone(STEEL, -0.2), 0, 50, 0, 170);
      break;
    }
    case 'gavel': {
      line(ctx, [[-90, 60], [30, -20]], { w: 16, color: '#7A4A2C', seed: sd, taper: false });
      ctx.save();
      ctx.translate(40, -30);
      ctx.rotate(-0.6);
      const p = shape(ctx, box(-30, -60, 60, 120, 0.14), '#8A5434', { w: 4, seed: sd + 1 });
      split(ctx, p, '#5E3620', -30, 60, 30, -10);
      ctx.restore();
      break;
    }
    case 'burger': {
      shape(ctx, [[-90, -10], [-80, -60], [0, -90], [80, -60], [90, -10]], '#D99A4A', { w: 4, seed: sd });
      shape(ctx, [[-96, -10], [96, -10], [90, 10], [-90, 10]], '#7FB86A', { w: 3, seed: sd + 1 });
      shape(ctx, [[-92, 8], [92, 8], [88, 34], [-88, 34]], '#6A3A24', { w: 3, seed: sd + 2 });
      shape(ctx, [[-90, 34], [90, 34], [80, 64], [-80, 64]], '#D99A4A', { w: 4, seed: sd + 3 });
      break;
    }
    case 'mug': {
      line(ctx, oval(76, 0, 30, 36, 12), { w: 12, closed: true, color: pal.pale, seed: sd });
      const p = shape(ctx, [[-70, -70], [70, -70], [64, 80], [-64, 80]], pal.pale, { w: 4, seed: sd + 1 });
      split(ctx, p, tone(pal.pale, -0.15), 20, -80, 50, 90);
      for (let i = 0; i < 3; i++) line(ctx, [[-30 + i * 30, -90], [-22 + i * 30 + Math.sin(t * 2 + i) * 8, -130], [-30 + i * 30, -170]], { w: 3, color: 'rgba(255,255,255,0.6)', seed: sd + 2 + i });
      break;
    }
    case 'bottle': {
      const p = shape(ctx, [[-16, -150], [16, -150], [16, -90], [46, -50], [46, 110], [-46, 110], [-46, -50], [-16, -90]], '#3F7A4A', { w: 4, seed: sd });
      split(ctx, p, '#2C5A36', -10, -150, -30, 110);
      shape(ctx, box(-40, -10, 80, 70, 0.06), pal.pale, { w: 3, seed: sd + 1 });
      glint(ctx, 26, -30, 18, t);
      break;
    }
    case 'trophy': {
      const p = shape(ctx, [[-80, -110], [80, -110], [66, -20], [20, 20], [20, 60], [50, 80], [-50, 80], [-20, 60], [-20, 20], [-66, -20]], GOLD, { w: 4, seed: sd });
      split(ctx, p, tone(GOLD, -0.2), -20, -120, -60, 80);
      line(ctx, oval(-92, -70, 24, 30, 10), { w: 8, closed: true, color: GOLD, seed: sd + 1 });
      line(ctx, oval(92, -70, 24, 30, 10), { w: 8, closed: true, color: GOLD, seed: sd + 2 });
      glint(ctx, 40, -84, 22, t);
      break;
    }
    case 'card': {
      const p = shape(ctx, box(-100, -64, 200, 128, 0.1), pal.blue, { w: 4, seed: sd });
      split(ctx, p, tone(pal.blue, -0.2), -100, 64, 100, -10);
      ctx.fillStyle = GOLD;
      ctx.fillRect(-74, -30, 40, 30);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 4; i++) ctx.fillRect(-74 + i * 40, 22, 30, 8);
      break;
    }
    case 'goldbar': {
      const p = shape(ctx, [[-70, -40], [70, -40], [100, 40], [-100, 40]], GOLD, { w: 4, seed: sd });
      split(ctx, p, tone(GOLD, -0.22), -100, 40, 100, 0);
      line(ctx, [[-50, -20], [50, -20]], { w: 2, color: FINE, seed: sd + 1 });
      glint(ctx, 50, -30, 22, t);
      break;
    }
  }
  ctx.restore();
}
