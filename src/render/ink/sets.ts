import type { Ctx } from '../engine';
import type { InkPalette, InkSet, InkTime } from '@shared/ink';
import { FINE, INK, box, glint, line, mix, oval, rng, shape, split, ticks, tone, type Pt } from './pen';

// The ink cartoon's places, built from depth layers (sky, far, mid, ground, front) so the moving camera gets parallax.
// Light is always two flat tones split by hard edges; something always moves (birds, smoke, a fan, gulls). World
// units: the ground line is y = 0, people stand on it, up is negative.

export interface Light {
  time: InkTime;
  pal: InkPalette;
  sky: [string, string, string];
  lit: string;
  shade: string;
  ground: string;
  groundShade: string;
  wall: string;
  wallShade: string;
  sun: string;
  /** People in this light: 0 = full colour, up to ~0.35 darker (night). */
  dim: number;
}

export function lightOf(time: InkTime, pal: InkPalette): Light {
  if (time === 'night')
    return { time, pal, sky: ['#1E2558', '#2C3A7A', '#46518F'], lit: mix(pal.skin, '#F4A3B0', 0.5), shade: '#2E3D86', ground: '#3A3F6E', groundShade: '#262A52', wall: '#4A4E86', wallShade: '#30346A', sun: '#F3EED8', dim: 0.25 };
  if (time === 'dusk')
    return { time, pal, sky: ['#5767B5', '#E68B78', '#F4B46A'], lit: '#F2A07E', shade: '#5160A8', ground: '#8C6A78', groundShade: '#5E4C70', wall: '#E8A486', wallShade: '#7C6AA0', sun: '#F8C55A', dim: 0.06 };
  return { time, pal, sky: ['#9EC1EA', '#BCD6F0', '#DCEAF6'], lit: '#F3DCB0', shade: '#8F8DCB', ground: '#C9B48E', groundShade: '#9F8FA8', wall: '#EAD9B8', wallShade: '#A7A0C8', sun: '#FFF1C4', dim: 0 };
}

export interface Layer {
  /** Parallax depth: 0 = fixed to the screen, 1 = moves with the people, more = in front of them. */
  p: number;
  draw(ctx: Ctx, L: Light, t: number): void;
}

const W0 = -2600;
const W1 = 2600;

// ── Pieces ─────────────────────────────────────────────────────────────────
function sky(ctx: Ctx, L: Light, t: number, horizon = -200): void {
  const [a, b, c] = L.sky;
  ctx.fillStyle = a;
  ctx.fillRect(W0 * 2, -4200, (W1 - W0) * 2, 4200 + horizon + 2000);
  shape(ctx, [[W0 * 2, -1500], [W1 * 2, -1700], [W1 * 2, horizon + 400], [W0 * 2, horizon + 400]], b, { w: 0, seed: 3 });
  shape(ctx, [[W0 * 2, horizon - 520], [W1 * 2, horizon - 600], [W1 * 2, horizon + 400], [W0 * 2, horizon + 400]], c, { w: 0, seed: 4 });
  // Sun or moon with a soft halo.
  const sx = 260;
  const sy = L.time === 'dusk' ? horizon - 330 : -1500;
  const sr = L.time === 'dusk' ? 420 : L.time === 'night' ? 130 : 160;
  ctx.fillStyle = L.time === 'night' ? 'rgba(243,238,216,0.12)' : 'rgba(255,230,160,0.18)';
  ctx.beginPath();
  ctx.arc(sx, sy, sr * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = L.sun;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.fill();
  if (L.time === 'night') {
    const r = rng(41);
    ctx.fillStyle = 'rgba(255,250,230,0.8)';
    for (let i = 0; i < 70; i++) {
      const tw = 0.5 + 0.5 * Math.sin(t * (1 + r() * 2) + i);
      ctx.globalAlpha = 0.4 + tw * 0.6;
      ctx.fillRect(W0 + r() * (W1 - W0), -3000 + r() * 2400, 5, 5);
    }
    ctx.globalAlpha = 1;
  } else clouds(ctx, L, t, horizon);
}

function clouds(ctx: Ctx, L: Light, t: number, horizon: number): void {
  const r = rng(17);
  for (let i = 0; i < 6; i++) {
    const x = W0 + ((r() * (W1 - W0) + t * (10 + i * 4)) % (W1 - W0));
    const y = horizon - 700 - r() * 900;
    const w = 260 + r() * 300;
    const c = L.time === 'dusk' ? '#F6B392' : '#F4F6FA';
    const p = shape(ctx, [[x - w / 2, y], [x - w * 0.3, y - 50], [x, y - 80], [x + w * 0.3, y - 55], [x + w / 2, y], [x, y + 20]], c, { w: 0, seed: 20 + i });
    split(ctx, p, tone(c, -0.12), x - w, y + 4, x + w, y - 10);
  }
}

function birds(ctx: Ctx, t: number, y0: number, n = 5, seed = 9): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = W0 + ((r() * 3000 + t * (60 + r() * 50)) % (W1 - W0));
    const y = y0 - r() * 500 + Math.sin(t * 2 + i) * 20;
    const f = Math.sin(t * 9 + i * 2) * 14;
    line(ctx, [[x - 24, y - f], [x, y], [x + 24, y - f]], { w: 3.6, seed: seed + i });
  }
}

function hills(ctx: Ctx, color: string, shade: string, y: number, amp: number, seed: number): void {
  const r = rng(seed);
  const pts: Pt[] = [[W0 * 1.5, 1200]];
  for (let x = W0 * 1.5; x <= W1 * 1.5; x += 380) pts.push([x, y - r() * amp]);
  pts.push([W1 * 1.5, 1200]);
  const p = shape(ctx, pts, color, { w: 3, seed });
  split(ctx, p, shade, W0, y - amp, W1, y + 200);
}

function groundPlane(ctx: Ctx, L: Light, seed: number, color = L.ground, shade = L.groundShade): Path2D {
  const p = shape(ctx, [[W0 * 1.5, -6], [W1 * 1.5, 6], [W1 * 1.5, 2400], [W0 * 1.5, 2400]], color, { w: 4, seed });
  split(ctx, p, shade, W0, 900, W1, 300);
  return p;
}

function building(ctx: Ctx, L: Light, x: number, w: number, h: number, color: string, seed: number, lit = false, t = 0): void {
  const p = shape(ctx, box(x, -h, w, h + 10, 0.01), color, { w: 4, seed });
  split(ctx, p, tone(color, -0.25), x + w * 0.65, -h - 400, x + w * 0.75, 200);
  const r = rng(seed);
  for (let yy = -h + 80; yy < -160; yy += 150)
    for (let xx = x + 50; xx < x + w - 80; xx += 130) {
      const on = lit && r() > 0.45 && Math.sin(t * 0.3 + xx) > -0.8;
      shape(ctx, box(xx, yy, 70, 90, 0.04), on ? '#F6D27A' : L.time === 'night' ? '#2A2F5E' : tone(L.sky[1], -0.1), { w: 3, seed: seed + xx + yy });
    }
}

// ── Sets ───────────────────────────────────────────────────────────────────
const SETS: Record<InkSet, Layer[]> = {
  road: [
    { p: 0.06, draw: (ctx, L, t) => sky(ctx, L, t, -260) },
    { p: 0.22, draw: (ctx, L) => hills(ctx, mix(L.shade, L.sky[2], 0.3), tone(L.shade, -0.1), -240, 160, 51) },
    {
      p: 0.5,
      draw: (ctx, L, t) => {
        hills(ctx, mix(L.ground, '#6E8A5A', 0.4), L.groundShade, -120, 60, 52);
        for (const x of [-1500, -300, 900, 2100]) {
          line(ctx, [[x, 0], [x + 6, -1150]], { w: 14, color: '#5A3A2A', seed: x, taper: false });
          line(ctx, [[x - 90, -1080], [x + 90, -1084]], { w: 9, seed: x + 1, taper: false });
        }
        for (const dy of [0, 50]) for (const x of [-1500, -300, 900]) line(ctx, [[x - 80, -1080 + dy], [x + 520, -1000 + dy + Math.sin(t * 1.4) * 6], [x + 1120, -1080 + dy]], { w: 2.4, seed: x + dy, taper: false });
        birds(ctx, t, -1300, 4, 13);
      },
    },
    {
      p: 0.82,
      draw: (ctx, L, t) => {
        // An old pickup truck parked by the road.
        const c = '#C2473A';
        const body = shape(ctx, [[-1500, -40], [-1500, -300], [-1180, -300], [-1120, -470], [-860, -470], [-800, -300], [-620, -290], [-610, -40]], c, { w: 4.4, seed: 61 });
        split(ctx, body, tone(c, -0.28), -1400, -500, -1100, 0);
        shape(ctx, box(-1100, -450, 220, 140, 0.06), mix(L.sky[1], '#FFFFFF', 0.2), { w: 3.4, seed: 62 });
        for (const x of [-1360, -760]) {
          shape(ctx, oval(x, -40, 100, 100, 14), '#241A1E', { w: 4, seed: x });
          shape(ctx, oval(x, -40, 44, 44, 10), '#9A98A4', { w: 3, seed: x + 1 });
        }
        glint(ctx, -1000, -420, 26, t);
      },
    },
    {
      p: 1,
      draw: (ctx, L) => {
        groundPlane(ctx, L, 71, mix(L.ground, '#55506A', 0.45), L.groundShade);
        for (let x = -2400; x < 2400; x += 360) shape(ctx, box(x, 220, 200, 22, 0.2), '#E8D9A8', { w: 2.4, seed: 72 + x });
        ticks(ctx, null, -2400, 40, 4800, 700, 160, { len: 10, color: 'rgba(255,240,220,0.3)', seed: 73 });
      },
    },
    { p: 1.3, draw: (ctx, L) => ticks(ctx, null, -2200, 380, 4400, 400, 120, { len: 46, angle: -1.5, spread: 0.7, color: mix(L.groundShade, '#3A5A3A', 0.5), w: 5, seed: 75 }) },
  ],
  street: [
    { p: 0.06, draw: (ctx, L, t) => sky(ctx, L, t, -900) },
    { p: 0.3, draw: (ctx, L, t) => [-2200, -1500, -700, 300, 1200, 2000].forEach((x, i) => building(ctx, L, x, 640, 1500 + (i % 3) * 300, mix(L.wallShade, L.sky[2], 0.3), 81 + i, L.time === 'night', t)) },
    {
      p: 0.7,
      draw: (ctx, L, t) => {
        const cols = [L.pal.accent2, L.pal.blue, L.pal.accent, '#7A8A6A'];
        [-2000, -1150, -300, 550, 1400].forEach((x, i) => {
          const c = mix(cols[i % 4], L.wall, 0.45);
          building(ctx, L, x, 820, 1150, c, 91 + i, L.time !== 'day', t);
          // Awning and a hanging sign that swings.
          const aw = shape(ctx, [[x + 60, -420], [x + 760, -420], [x + 800, -320], [x + 20, -320]], i % 2 ? L.pal.accent2 : L.pal.blue, { w: 4, seed: 96 + i });
          ctx.save();
          ctx.clip(aw);
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          for (let s = x; s < x + 800; s += 80) ctx.fillRect(s, -430, 36, 120);
          ctx.restore();
          ctx.save();
          ctx.translate(x + 700, -620);
          ctx.rotate(Math.sin(t * 1.6 + i) * 0.06);
          shape(ctx, box(-70, 0, 140, 90, 0.08), L.pal.pale, { w: 3.4, seed: 99 + i });
          ctx.restore();
        });
      },
    },
    {
      p: 1,
      draw: (ctx, L, t) => {
        groundPlane(ctx, L, 101, mix(L.wall, '#9A92A0', 0.5), L.groundShade);
        for (let x = -2400; x < 2400; x += 300) line(ctx, [[x, 10], [x - 140, 800]], { w: 2.4, color: FINE, seed: 102 + x });
        // Lamp post with a glint.
        line(ctx, [[900, 0], [904, -1400]], { w: 20, color: '#2E2A3A', seed: 104, taper: false });
        shape(ctx, box(840, -1500, 130, 110, 0.2), L.time === 'night' ? '#FBE3A0' : '#E8E0C8', { w: 4, seed: 105 });
        if (L.time === 'night') {
          ctx.fillStyle = 'rgba(251,227,160,0.16)';
          ctx.beginPath();
          ctx.moveTo(860, -1400);
          ctx.lineTo(950, -1400);
          ctx.lineTo(1300, 300);
          ctx.lineTo(500, 300);
          ctx.closePath();
          ctx.fill();
        }
        glint(ctx, 905, -1450, 30, t);
        birds(ctx, t, -1600, 3, 107);
      },
    },
  ],
  room: [
    {
      p: 0.55,
      draw: (ctx, L, t) => {
        const wall = shape(ctx, [[W0 * 1.5, -3200], [W1 * 1.5, -3200], [W1 * 1.5, 40], [W0 * 1.5, 40]], L.time === 'night' ? '#4A4E86' : mix(L.pal.pale, L.wall, 0.4), { w: 0, seed: 111 });
        split(ctx, wall, L.time === 'night' ? '#30346A' : L.wallShade, 300, -3200, -400, 100);
        // Window, and its warm shaft of light across the room.
        const wx = -760;
        shape(ctx, box(wx, -1700, 640, 820, 0.02), L.time === 'night' ? '#1E2558' : L.sky[1], { w: 6, seed: 112 });
        line(ctx, [[wx + 320, -1700], [wx + 320, -880]], { w: 8, seed: 113, taper: false });
        line(ctx, [[wx, -1290], [wx + 640, -1290]], { w: 8, seed: 114, taper: false });
        ctx.fillStyle = L.time === 'night' ? 'rgba(160,180,255,0.12)' : 'rgba(255,214,150,0.3)';
        ctx.beginPath();
        ctx.moveTo(wx, -1700);
        ctx.lineTo(wx + 640, -1700);
        ctx.lineTo(wx + 1900, 200);
        ctx.lineTo(wx + 900, 200);
        ctx.closePath();
        ctx.fill();
        // Dust in the light.
        const r = rng(115);
        ctx.fillStyle = 'rgba(255,245,220,0.7)';
        for (let i = 0; i < 26; i++) ctx.fillRect(wx + 300 + r() * 1300 + Math.sin(t * 0.6 + i) * 30, -1500 + r() * 1500 + Math.cos(t * 0.5 + i) * 30, 5, 5);
        // A picture frame and a floor lamp.
        shape(ctx, box(260, -1720, 420, 320, 0.03), '#8A5A34', { w: 4, seed: 116 });
        shape(ctx, box(300, -1680, 340, 240, 0.03), L.pal.accent, { w: 3, seed: 117 });
        ctx.save();
        ctx.beginPath();
        ctx.rect(300, -1680, 340, 240);
        ctx.clip();
        hills(ctx, L.pal.blue, tone(L.pal.blue, -0.2), -1500, 40, 118);
        ctx.restore();
      },
    },
    {
      p: 0.8,
      draw: (ctx, L, t) => {
        // Couch.
        const c = L.pal.accent2;
        const back = shape(ctx, box(-200, -620, 1300, 360, 0.12), tone(c, -0.08), { w: 4.4, seed: 121 });
        split(ctx, back, tone(c, -0.3), 300, -700, 500, 0);
        shape(ctx, box(-260, -330, 1420, 330, 0.1), c, { w: 4.4, seed: 122 });
        shape(ctx, box(-300, -520, 180, 520, 0.2), tone(c, -0.12), { w: 4.4, seed: 123 });
        shape(ctx, box(1080, -520, 180, 520, 0.2), tone(c, -0.12), { w: 4.4, seed: 124 });
        line(ctx, [[1400, 0], [1400, -1200]], { w: 12, seed: 125, taper: false });
        shape(ctx, [[1260, -1200], [1540, -1200], [1480, -1440], [1320, -1440]], '#F6D27A', { w: 4, seed: 126 });
        glint(ctx, 1400, -1180, 30, t);
      },
    },
    {
      p: 1,
      draw: (ctx, L) => {
        const f = groundPlane(ctx, L, 131, '#9A6A44', '#6E4A34');
        for (let x = -2600; x < 2600; x += 220) line(ctx, [[x, 0], [x - 300, 1000]], { w: 2.4, color: FINE, seed: 132 + x });
        ticks(ctx, f, -2400, 20, 4800, 800, 120, { len: 18, angle: 2.0, color: 'rgba(60,30,10,0.35)', seed: 133 });
      },
    },
  ],
  office: [
    {
      p: 0.55,
      draw: (ctx, L, t) => {
        const wall = shape(ctx, [[W0 * 1.5, -3200], [W1 * 1.5, -3200], [W1 * 1.5, 40], [W0 * 1.5, 40]], mix('#B8C8C4', L.wall, 0.3), { w: 0, seed: 141 });
        split(ctx, wall, mix('#7E8EA8', L.wallShade, 0.4), 500, -3200, 100, 100);
        // Blinds and the striped shaft of light.
        shape(ctx, box(-1500, -1800, 900, 900, 0.02), L.time === 'night' ? '#1E2558' : L.sky[1], { w: 6, seed: 142 });
        for (let y = -1780; y < -900; y += 60) line(ctx, [[-1500, y], [-600, y + 4]], { w: 4, seed: 143 + y, taper: false });
        ctx.fillStyle = L.time === 'night' ? 'rgba(150,170,255,0.08)' : 'rgba(255,230,170,0.22)';
        for (let k = 0; k < 7; k++) {
          ctx.beginPath();
          ctx.moveTo(-1500, -1780 + k * 120);
          ctx.lineTo(-600, -1780 + k * 120);
          ctx.lineTo(600, -400 + k * 120);
          ctx.lineTo(-300, -400 + k * 120);
          ctx.closePath();
          ctx.fill();
        }
        // A clock that ticks.
        shape(ctx, oval(800, -1700, 120, 120, 16), '#F6F1E4', { w: 4, seed: 145 });
        const a = Math.floor(t) * 0.105;
        line(ctx, [[800, -1700], [800 + Math.sin(a) * 90, -1700 - Math.cos(a) * 90]], { w: 4, seed: 146 });
        line(ctx, [[800, -1700], [860, -1740]], { w: 6, seed: 147 });
        // Filing cabinet and a plant.
        const fc = shape(ctx, box(1300, -900, 360, 900, 0.03), '#8E9AA8', { w: 4, seed: 148 });
        split(ctx, fc, '#6A7484', 1560, -1000, 1580, 0);
        for (let y = -860; y < 0; y += 220) line(ctx, [[1420, y + 100], [1540, y + 100]], { w: 6, seed: 149 + y, taper: false });
      },
    },
    {
      p: 0.85,
      draw: (ctx, L, t) => {
        const d = shape(ctx, [[-1300, -560], [1100, -560], [1100, -480], [-1300, -480]], '#8A5A34', { w: 4.4, seed: 151 });
        void d;
        shape(ctx, box(-1240, -480, 120, 480, 0.04), '#6E4628', { w: 4, seed: 152 });
        shape(ctx, box(960, -480, 120, 480, 0.04), '#6E4628', { w: 4, seed: 153 });
        shape(ctx, box(-700, -1020, 520, 380, 0.04), '#2A2430', { w: 4.4, seed: 154 });
        ctx.fillStyle = mix(L.pal.blue, '#9AD0FF', 0.3 + 0.08 * Math.sin(t * 7));
        ctx.fillRect(-670, -990, 460, 310);
        line(ctx, [[-440, -640], [-440, -560]], { w: 18, seed: 155, taper: false });
        shape(ctx, [[600, -560], [760, -560], [740, -700], [620, -700]], '#C8723A', { w: 4, seed: 156 });
        for (let i = 0; i < 5; i++) shape(ctx, oval(640 + i * 30 + Math.sin(t + i) * 6, -760 - i * 30, 30, 70, 8, (i - 2) * 0.4), '#5E9A5A', { w: 3, seed: 157 + i });
      },
    },
    {
      p: 1,
      draw: (ctx, L) => {
        groundPlane(ctx, L, 161, '#7A8090', '#5A5E74');
        ticks(ctx, null, -2400, 20, 4800, 800, 90, { len: 12, color: 'rgba(255,255,255,0.15)', seed: 162 });
      },
    },
  ],
  bar: [
    {
      p: 0.55,
      draw: (ctx, L, t) => {
        const wall = shape(ctx, [[W0 * 1.5, -3200], [W1 * 1.5, -3200], [W1 * 1.5, 40], [W0 * 1.5, 40]], '#6A3E2C', { w: 0, seed: 171 });
        split(ctx, wall, '#4A2A20', 700, -3200, 200, 100);
        for (let x = -2600; x < 2600; x += 260) line(ctx, [[x, -3000], [x + 6, 0]], { w: 3, color: 'rgba(23,11,8,0.5)', seed: 172 + x, taper: false });
        // Shelves of bottles, each with a glint.
        for (const y of [-1700, -1350]) {
          shape(ctx, box(-1600, y, 3000, 40, 0.1), '#8A5A34', { w: 4, seed: 173 + y });
          const r = rng(174 + y);
          for (let x = -1550; x < 1350; x += 120) {
            const c = [L.pal.accent, '#4E8A5A', L.pal.accent2, '#C9A77A'][Math.floor(r() * 4)];
            const h = 160 + r() * 80;
            shape(ctx, [[x, y], [x + 60, y], [x + 60, y - h * 0.65], [x + 42, y - h], [x + 18, y - h], [x, y - h * 0.65]], c, { w: 3, seed: 175 + x + y });
            if (r() > 0.6) glint(ctx, x + 44, y - h * 0.5, 16, t + x);
          }
        }
        // Hanging lamps that sway.
        for (const x of [-900, 300, 1400]) {
          const sw = Math.sin(t * 1.1 + x) * 30;
          line(ctx, [[x, -3000], [x + sw, -2100]], { w: 4, seed: 176 + x, taper: false });
          shape(ctx, [[x + sw - 140, -1980], [x + sw + 140, -1980], [x + sw + 60, -2100], [x + sw - 60, -2100]], '#3A5A4A', { w: 4, seed: 177 + x });
          ctx.fillStyle = 'rgba(255,214,140,0.14)';
          ctx.beginPath();
          ctx.moveTo(x + sw - 140, -1980);
          ctx.lineTo(x + sw + 140, -1980);
          ctx.lineTo(x + sw + 500, -300);
          ctx.lineTo(x + sw - 500, -300);
          ctx.closePath();
          ctx.fill();
        }
      },
    },
    { p: 1, draw: (ctx, L) => groundPlane(ctx, L, 181, '#5A3424', '#3E2218') },
    {
      p: 1.25,
      draw: (ctx, _L, t) => {
        const c = shape(ctx, [[-2600, -700], [2600, -700], [2600, 1400], [-2600, 1400]], '#8A5434', { w: 5, seed: 191 });
        split(ctx, c, '#6A3C24', -2600, -500, 2600, -520);
        line(ctx, [[-2600, -640], [2600, -640]], { w: 4, seed: 192, taper: false });
        // Smoke from somewhere at the bar.
        for (let i = 0; i < 4; i++) {
          const y = -800 - ((t * 60 + i * 140) % 600);
          ctx.fillStyle = `rgba(240,230,220,${0.18 * (1 - ((t * 60 + i * 140) % 600) / 600)})`;
          ctx.beginPath();
          ctx.ellipse(-1700 + Math.sin(t + i) * 40, y, 60 + i * 10, 40, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
  ],
  farm: [
    { p: 0.06, draw: (ctx, L, t) => sky(ctx, L, t, -300) },
    { p: 0.25, draw: (ctx, L) => hills(ctx, mix('#7A9A5A', L.shade, 0.35), tone(L.shade, -0.05), -280, 180, 201) },
    {
      p: 0.55,
      draw: (ctx, _L, t) => {
        // Red barn and a windmill turning.
        const bc = '#B8453A';
        const barn = shape(ctx, [[-1500, 0], [-1500, -700], [-1150, -1000], [-800, -700], [-800, 0]], bc, { w: 4.4, seed: 211 });
        split(ctx, barn, tone(bc, -0.3), -1150, -1100, -1000, 100);
        line(ctx, [[-1400, -40], [-900, -500]], { w: 6, color: '#F2E8D8', seed: 212 });
        line(ctx, [[-1400, -500], [-900, -40]], { w: 6, color: '#F2E8D8', seed: 213 });
        line(ctx, [[1300, 0], [1340, -1300]], { w: 16, color: '#6A5A54', seed: 214, taper: false });
        ctx.save();
        ctx.translate(1340, -1300);
        ctx.rotate(t * 0.8);
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          shape(ctx, [[-20, 0], [20, 0], [36, -320], [-10, -320]], '#E8E0D0', { w: 3.4, seed: 215 + k });
        }
        ctx.restore();
        birds(ctx, t, -1500, 4, 216);
      },
    },
    {
      p: 0.85,
      draw: (ctx, _L) => {
        for (let x = -2600; x < 2600; x += 300) line(ctx, [[x, 0], [x + 4, -300]], { w: 14, color: '#8A6A4A', seed: 221 + x, taper: false });
        line(ctx, [[-2600, -230], [2600, -226]], { w: 10, color: '#8A6A4A', seed: 222, taper: false });
        line(ctx, [[-2600, -120], [2600, -118]], { w: 10, color: '#8A6A4A', seed: 223, taper: false });
      },
    },
    {
      p: 1,
      draw: (ctx, L) => {
        const g = groundPlane(ctx, L, 231, mix('#A8A05A', L.ground, 0.4), L.groundShade);
        ticks(ctx, g, -2400, 30, 4800, 800, 200, { len: 26, angle: -1.6, color: 'rgba(60,80,30,0.4)', w: 3, seed: 232 });
      },
    },
  ],
  court: [
    {
      p: 0.55,
      draw: (ctx, L, t) => {
        const wall = shape(ctx, [[W0 * 1.5, -3200], [W1 * 1.5, -3200], [W1 * 1.5, 40], [W0 * 1.5, 40]], '#8A5A3A', { w: 0, seed: 241 });
        split(ctx, wall, '#62402A', 900, -3200, 300, 100);
        for (let x = -2400; x < 2400; x += 480) shape(ctx, box(x, -2600, 400, 1800, 0.02), '#7A4E32', { w: 3, seed: 242 + x });
        // The seal, a flag that moves a little, the judge's bench.
        shape(ctx, oval(0, -1900, 220, 220, 20), L.pal.accent, { w: 5, seed: 243 });
        line(ctx, oval(0, -1900, 170, 170, 20), { w: 3, closed: true, seed: 244 });
        line(ctx, [[1500, 0], [1500, -1800]], { w: 10, seed: 245, taper: false });
        const fl = Math.sin(t * 2) * 30;
        shape(ctx, [[1500, -1780], [1900 + fl, -1760], [1880 - fl, -1460], [1500, -1480]], L.pal.blue, { w: 4, seed: 246 });
        const bench = shape(ctx, box(-900, -1050, 1800, 1050, 0.01), '#6A3C24', { w: 5, seed: 247 });
        split(ctx, bench, '#4E2A18', 300, -1100, 500, 100);
        for (let x = -820; x < 900; x += 340) line(ctx, box(x, -960, 280, 860, 0.02), { w: 3, closed: true, seed: 248 + x });
      },
    },
    { p: 1, draw: (ctx, L) => groundPlane(ctx, L, 251, '#6E4A34', '#4E3424') },
  ],
  bank: [
    {
      p: 0.55,
      draw: (ctx, _L, t) => {
        const wall = shape(ctx, [[W0 * 1.5, -3200], [W1 * 1.5, -3200], [W1 * 1.5, 40], [W0 * 1.5, 40]], '#E6DCC8', { w: 0, seed: 261 });
        split(ctx, wall, '#B8AEC4', 700, -3200, 200, 100);
        for (const x of [-1900, -1100, 1100, 1900]) {
          const c = shape(ctx, box(x - 140, -2600, 280, 2600, 0.02), '#F2EBDD', { w: 4, seed: 262 + x });
          split(ctx, c, '#C8BED2', x + 40, -2600, x + 60, 0);
          for (let k = -100; k <= 100; k += 66) line(ctx, [[x + k, -2500], [x + k + 2, -80]], { w: 2, color: FINE, seed: 263 + x + k });
        }
        // The round vault door, its bolts and a turning wheel.
        const v = shape(ctx, oval(0, -1300, 620, 620, 28), '#A6A8B6', { w: 5, seed: 264 });
        split(ctx, v, '#7E8092', -700, -600, 700, -2000);
        line(ctx, oval(0, -1300, 480, 480, 24), { w: 3.4, closed: true, seed: 265 });
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          shape(ctx, oval(Math.cos(a) * 550, -1300 + Math.sin(a) * 550, 24, 24, 8), '#D6D8E2', { w: 2.4, seed: 266 + k });
        }
        ctx.save();
        ctx.translate(0, -1300);
        ctx.rotate(t * 0.4);
        for (let k = 0; k < 3; k++) {
          ctx.rotate(Math.PI / 3);
          line(ctx, [[-260, 0], [260, 0]], { w: 18, color: '#C9A24A', seed: 267 + k, taper: false });
        }
        ctx.restore();
        glint(ctx, 180, -1680, 34, t);
      },
    },
    { p: 1, draw: (ctx, L) => groundPlane(ctx, L, 271, '#C9BBA8', '#9A8EA6') },
    {
      p: 1.25,
      draw: (ctx) => {
        const c = shape(ctx, [[-2600, -560], [-1100, -560], [-1100, 1400], [-2600, 1400]], '#7A4E32', { w: 5, seed: 281 });
        split(ctx, c, '#5A3622', -1600, -600, -1500, 1400);
      },
    },
  ],
  city: [
    { p: 0.06, draw: (ctx, L, t) => sky(ctx, L, t, -500) },
    { p: 0.2, draw: (ctx, L, t) => [-2400, -1800, -1300, -700, -100, 500, 1100, 1700, 2300].forEach((x, i) => building(ctx, L, x, 500, 1400 + ((i * 37) % 5) * 260, mix(L.shade, L.sky[0], 0.4), 291 + i, true, t)) },
    {
      p: 0.6,
      draw: (ctx, L, t) => {
        [-2200, -1100, 0, 1100, 2100].forEach((x, i) => building(ctx, L, x, 900, 1000 + (i % 2) * 400, mix(L.wallShade, L.sky[1], 0.25), 301 + i, true, t));
        // A water tower on a roof.
        shape(ctx, box(-600, -2000, 340, 300, 0.2), '#7A5A44', { w: 4, seed: 306 });
        shape(ctx, [[-640, -2000], [-430, -2160], [-220, -2000]], '#5A4234', { w: 4, seed: 307 });
      },
    },
    {
      p: 1,
      draw: (ctx, L) => {
        groundPlane(ctx, L, 311, mix(L.wallShade, '#555', 0.4), L.groundShade);
        line(ctx, [[-2600, -260], [2600, -260]], { w: 10, seed: 312, taper: false });
        for (let x = -2600; x < 2600; x += 200) line(ctx, [[x, -260], [x, 0]], { w: 6, seed: 313 + x, taper: false });
      },
    },
  ],
  dump: [
    { p: 0.06, draw: (ctx, L, t) => sky(ctx, L, t, -340) },
    {
      p: 0.3,
      draw: (ctx, L, t) => {
        hills(ctx, mix('#5E5A6E', L.shade, 0.3), tone(L.shade, -0.15), -360, 520, 321);
        // Gulls circling over the heap.
        for (let i = 0; i < 6; i++) {
          const a = t * 0.6 + i * 1.05;
          const x = Math.cos(a) * (500 + i * 60);
          const y = -1400 + Math.sin(a * 1.3) * 200;
          const f = Math.sin(t * 8 + i) * 18;
          line(ctx, [[x - 34, y - f], [x - 6, y + 6], [x, y], [x + 6, y + 6], [x + 34, y - f]], { w: 4, color: '#F2F0EA', seed: 322 + i });
        }
      },
    },
    {
      p: 0.6,
      draw: (ctx, L, t) => {
        // Mounds of black bags with bits sticking out.
        const r = rng(331);
        for (let i = 0; i < 26; i++) {
          const x = -2600 + r() * 5200;
          const y = -60 - r() * 600;
          const s = 120 + r() * 120;
          const c = ['#2B2A33', '#3A3844', '#46434F'][Math.floor(r() * 3)];
          const p = shape(ctx, [[x - s, y + s * 0.5], [x - s * 0.8, y - s * 0.3], [x - s * 0.1, y - s * 0.6], [x + s * 0.7, y - s * 0.4], [x + s, y + s * 0.5]], c, { w: 3.6, seed: 332 + i });
          split(ctx, p, tone(c, 0.15), x, y - s, x + s, y + s);
          if (r() > 0.6) shape(ctx, box(x - 40, y - s * 0.6, 70, 50, 0.1), [L.pal.accent, L.pal.accent2, L.pal.pale][Math.floor(r() * 3)], { w: 2.6, seed: 333 + i });
        }
        // A bulldozer pushing back and forth.
        const bx = 1300 + Math.sin(t * 0.5) * 120;
        const y0 = -80;
        shape(ctx, box(bx - 260, y0 - 420, 360, 260, 0.06), '#E2A93A', { w: 4.4, seed: 341 });
        shape(ctx, box(bx - 330, y0 - 200, 520, 200, 0.08), '#D69630', { w: 4.4, seed: 342 });
        shape(ctx, box(bx - 380, y0 - 40, 620, 80, 0.4), '#2A2430', { w: 4, seed: 343 });
        shape(ctx, [[bx + 190, y0 - 260], [bx + 330, y0 - 300], [bx + 340, y0 + 40], [bx + 200, y0 + 30]], '#9A9AA8', { w: 4, seed: 344 });
        shape(ctx, box(bx - 220, y0 - 400, 160, 140, 0.04), mix(L.sky[1], '#FFFFFF', 0.3), { w: 3, seed: 345 });
        // Smoke from the exhaust.
        for (let i = 0; i < 4; i++) {
          const k = ((t * 0.7 + i * 0.25) % 1);
          ctx.fillStyle = `rgba(70,64,80,${0.35 * (1 - k)})`;
          ctx.beginPath();
          ctx.ellipse(bx - 40 + k * 120, y0 - 460 - k * 400, 40 + k * 80, 30 + k * 60, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      },
    },
    {
      p: 1,
      draw: (ctx, L) => {
        const g = groundPlane(ctx, L, 351, mix('#7A6A5A', L.ground, 0.3), L.groundShade);
        ticks(ctx, g, -2400, 20, 4800, 800, 140, { len: 20, angle: 0.3, spread: 2.5, color: 'rgba(23,11,8,0.4)', w: 3, seed: 352 });
      },
    },
    {
      p: 1.3,
      draw: (ctx) => {
        // Chain fence close to the camera.
        for (const x of [-2400, -1900, 1900, 2400]) line(ctx, [[x, 500], [x + 6, -1300]], { w: 18, color: '#8E8C96', seed: 361 + x, taper: false });
        ctx.strokeStyle = 'rgba(142,140,150,0.5)';
        ctx.lineWidth = 3;
        for (const x of [-2600, -2530, -2460, -2390, -2320, -2250, -2180, -2110, -2040, -1970, 1900, 1970, 2040, 2110, 2180, 2250, 2320, 2390]) {
          ctx.beginPath();
          ctx.moveTo(x, -1300);
          ctx.lineTo(x + 900, 500);
          ctx.moveTo(x + 900, -1300);
          ctx.lineTo(x, 500);
          ctx.stroke();
        }
        void INK;
      },
    },
  ],
};

export const setLayers = (set: InkSet): Layer[] => SETS[set] ?? SETS.road;
