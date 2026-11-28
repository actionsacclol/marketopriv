import { str, storyBeats, type StoryBeat } from '@shared/presets';
import { BODY_RADIUS, isSpaceScene, type SpaceScene } from '@shared/space';
import { applyView, fxMoves, fxPost, fxView } from './fx';
import { parseWords } from './story';
import { captions } from './duo';
import { FONT, H, W, clamp01, countUp, easeBack, easeInOut, easeOut, fit, font, hexA, lerp, markLightFrame, prog, registerPreset, rrect, scaled, withAlpha, type Ctx, type Env } from '../engine';

// "What if" space explainers in a flat, bright style: a turning Earth with clouds, the Sun, planets at their real
// sizes, an orbit, an impact, a black hole, a counting clock, and a small astronaut mascot (the brand's character in a
// suit). Every shape is drawn here; nothing is a picture or a video model. A pure function of time.

const D = Math.PI / 180;
const CX = W / 2;
const CY = 820;
const CAPTION_Y = 1350;

const HIGHLIGHTS: Record<string, string> = { yellow: '#FFD43B', orange: '#FF9F1C', cyan: '#5EE6FF', white: '#FFFFFF' };
const SKIES: Record<string, [string, string, string]> = {
  navy: ['#070A26', '#141A52', '#2A1A5E'],
  purple: ['#12082A', '#2B1257', '#4A1E6B'],
  black: ['#030308', '#0B0B18', '#14122A'],
};

const hash = (n: number): number => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const sceneOf = (b: StoryBeat): SpaceScene => (isSpaceScene(b.visual) ? b.visual : 'title');
const clean = (s: string): string => s.replace(/\*/g, '');

// ── Sky ────────────────────────────────────────────────────────────────────
function sky(ctx: Ctx, env: Env, t: number, drift: number): void {
  const [top, mid, low] = SKIES[str(env.fields, 'sky')] ?? SKIES.navy;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, low);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Two soft nebula clouds in the brand colours.
  for (const [x, y, r, c, a] of [
    [W * 0.15, H * 0.22, 700, env.accent[1], 0.16],
    [W * 0.9, H * 0.7, 760, env.accent[2], 0.12],
  ] as const) {
    const n = ctx.createRadialGradient(x + drift * 0.2, y, 0, x + drift * 0.2, y, r);
    n.addColorStop(0, hexA(c, a));
    n.addColorStop(1, hexA(c, 0));
    ctx.fillStyle = n;
    ctx.fillRect(0, 0, W, H);
  }
  // Stars in three layers, the near ones moving more with the camera.
  for (let i = 0; i < 190; i++) {
    const layer = i % 3;
    const x = (((hash(i) * W + drift * (0.15 + layer * 0.2)) % W) + W) % W;
    const y = hash(i + 500) * H;
    const r = 1 + layer * 0.8 + hash(i + 900) * 1.2;
    const tw = 0.45 + 0.55 * Math.abs(Math.sin(t * (0.8 + hash(i + 77) * 2) + i));
    ctx.fillStyle = `rgba(255,255,255,${(0.35 + layer * 0.2) * tw})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ── Bodies ─────────────────────────────────────────────────────────────────
/** Flat shading: the side away from the light darker, with a fairly hard edge, and a thin rim light. Inside a clip. */
function shade(ctx: Ctx, x: number, y: number, R: number, dark = 0.5): void {
  const g = ctx.createLinearGradient(x - R * 0.75, y - R * 0.75, x + R * 0.75, y + R * 0.75);
  g.addColorStop(0, 'rgba(8,6,40,0)');
  g.addColorStop(0.48, 'rgba(8,6,40,0)');
  g.addColorStop(0.6, `rgba(8,6,40,${dark * 0.8})`);
  g.addColorStop(1, `rgba(8,6,40,${dark})`);
  ctx.fillStyle = g;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
  const hl = ctx.createRadialGradient(x - R * 0.45, y - R * 0.45, 0, x - R * 0.45, y - R * 0.45, R * 0.9);
  hl.addColorStop(0, 'rgba(255,255,255,0.18)');
  hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
}

function glow(ctx: Ctx, x: number, y: number, R: number, color: string, k = 1.25, a = 0.5): void {
  const g = ctx.createRadialGradient(x, y, R * 0.9, x, y, R * k);
  g.addColorStop(0, hexA(color, a));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R * k, 0, Math.PI * 2);
  ctx.fill();
}

// Continents as clusters of round patches on the globe: [longitude, latitude, angular radius].
const LAND: Array<[number, number, number]> = [
  [-105, 50, 0.24], [-95, 38, 0.2], [-82, 30, 0.12], [-100, 22, 0.1], [-122, 60, 0.18], [-75, 62, 0.14], [-42, 72, 0.12],
  [-68, -5, 0.22], [-60, -22, 0.2], [-66, -40, 0.12], [-75, 8, 0.1],
  [12, 50, 0.13], [28, 56, 0.14], [18, 12, 0.2], [24, -8, 0.2], [26, -26, 0.15], [5, 22, 0.16], [36, 30, 0.1], [46, 22, 0.1],
  [80, 55, 0.24], [105, 48, 0.24], [125, 60, 0.2], [78, 24, 0.14], [102, 25, 0.14], [118, 32, 0.12], [140, 38, 0.06],
  [134, -24, 0.15], [146, -32, 0.08], [0, -78, 0.22], [90, -80, 0.22], [180, -78, 0.22], [-90, -80, 0.22],
];

type EarthLook = 'normal' | 'dark' | 'ice' | 'hot';

function earth(ctx: Ctx, x: number, y: number, R: number, rot: number, look: EarthLook, t: number): void {
  const P = {
    normal: { sea: '#2D6FD6', deep: '#1D4DB0', land: '#43C27A', land2: '#2F9F62', air: '#7FD3FF' },
    dark: { sea: '#0B1534', deep: '#081028', land: '#22346A', land2: '#1A2A56', air: '#3A4C8F' },
    ice: { sea: '#BFE5F6', deep: '#9ACFEA', land: '#FFFFFF', land2: '#E4F2FA', air: '#CFF1FF' },
    hot: { sea: '#B8492A', deep: '#8F3320', land: '#6E2414', land2: '#4F1A0E', air: '#FF8A4A' },
  }[look];
  glow(ctx, x, y, R, P.air, 1.18, look === 'dark' ? 0.25 : 0.55);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.clip();
  const sea = ctx.createRadialGradient(x - R * 0.3, y - R * 0.3, 0, x, y, R);
  sea.addColorStop(0, P.sea);
  sea.addColorStop(1, P.deep);
  ctx.fillStyle = sea;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
  // Land, then (normal) clouds drifting a little faster than the turn.
  const tilt = 18 * D;
  const patch = (lon: number, lat: number, r: number, color: string, scale = 1): { vis: number; px: number; py: number } => {
    const l = lon * D + rot;
    const p = lat * D;
    const z = Math.cos(p) * Math.cos(l);
    const px = R * Math.cos(p) * Math.sin(l);
    const py0 = -R * Math.sin(p);
    // A small tilt of the axis.
    const py = py0 * Math.cos(tilt) - z * R * Math.sin(tilt) * 0.3;
    if (z <= -0.05) return { vis: 0, px, py };
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + px, y + py, Math.max(2, r * R * scale * Math.max(0.12, Math.cos(l))), Math.max(2, r * R * scale * Math.max(0.2, Math.cos(p) * 0.6 + 0.4)), 0, 0, Math.PI * 2);
    ctx.fill();
    return { vis: z, px, py };
  };
  for (const [lon, lat, r] of LAND) patch(lon, lat, r * 1.08, P.land2);
  for (const [lon, lat, r] of LAND) patch(lon, lat, r, P.land, 0.92);
  if (look === 'dark') {
    // City lights on the land, twinkling a little.
    LAND.forEach(([lon, lat, r], k) => {
      if (Math.abs(lat) > 65) return;
      for (let n = 0; n < 12; n++) {
        const lo = lon + (hash(k * 9 + n) - 0.5) * r * 70;
        const la = lat + (hash(k * 13 + n) - 0.5) * r * 50;
        const l = lo * D + rot;
        const z = Math.cos(la * D) * Math.cos(l);
        if (z <= 0.05) continue;
        const px = x + R * Math.cos(la * D) * Math.sin(l);
        const py = y - R * Math.sin(la * D);
        const a = 0.6 + 0.4 * Math.sin(t * 3 + k + n);
        ctx.fillStyle = `rgba(255,214,120,${a})`;
        ctx.beginPath();
        ctx.arc(px, py, R * 0.012 + 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  if (look === 'normal' || look === 'ice') {
    for (let k = 0; k < 14; k++) {
      const lon = hash(k + 40) * 360;
      const lat = (hash(k + 80) - 0.5) * 130;
      ctx.globalAlpha = 0.75;
      patch(lon + t * 3, lat, 0.06 + hash(k + 120) * 0.07, 'rgba(255,255,255,0.9)', 1.6);
      ctx.globalAlpha = 1;
    }
  }
  shade(ctx, x, y, R, look === 'dark' ? 0.25 : 0.55);
  ctx.restore();
  // Rim light.
  ctx.strokeStyle = hexA(P.air, 0.6);
  ctx.lineWidth = Math.max(2, R * 0.025);
  ctx.beginPath();
  ctx.arc(x, y, R - ctx.lineWidth / 2, Math.PI * 1.05, Math.PI * 1.65);
  ctx.stroke();
}

function sunBody(ctx: Ctx, x: number, y: number, R: number, t: number, giant = false): void {
  const [c0, c1, c2] = giant ? ['#FFB38A', '#FF5A36', '#C2261A'] : ['#FFF6C2', '#FFC83A', '#FF8A1E'];
  const corona = ctx.createRadialGradient(x, y, R * 0.8, x, y, R * 2.4);
  corona.addColorStop(0, hexA(c1, 0.55));
  corona.addColorStop(0.4, hexA(c2, 0.18));
  corona.addColorStop(1, hexA(c2, 0));
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(x, y, R * 2.4, 0, Math.PI * 2);
  ctx.fill();
  // Slow rays.
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(t * 0.08);
  for (let k = 0; k < 12; k++) {
    ctx.rotate((Math.PI * 2) / 12);
    ctx.fillStyle = hexA(c1, 0.12 + 0.06 * Math.sin(t * 2 + k));
    ctx.beginPath();
    ctx.moveTo(-R * 0.12, R * 0.95);
    ctx.lineTo(0, R * (1.45 + 0.12 * Math.sin(t * 1.7 + k * 2)));
    ctx.lineTo(R * 0.12, R * 0.95);
    ctx.fill();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(x - R * 0.25, y - R * 0.25, 0, x, y, R);
  g.addColorStop(0, c0);
  g.addColorStop(0.55, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fill();
  // A few darker spots that drift.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.clip();
  for (let k = 0; k < 4; k++) {
    const a = hash(k + 3) * Math.PI * 2 + t * 0.05;
    const d = R * (0.2 + 0.5 * hash(k + 9));
    ctx.fillStyle = hexA(c2, 0.35);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, R * 0.07, R * 0.05, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function crater(ctx: Ctx, x: number, y: number, r: number, dark: string, light: string): void {
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = light;
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.beginPath();
  ctx.arc(x, y, r, Math.PI * 0.1, Math.PI * 0.9);
  ctx.stroke();
}

const PLANET_COLORS: Record<string, { base: string; dark: string; bands?: string[] }> = {
  mercury: { base: '#A9A3A0', dark: '#8C8683' },
  venus: { base: '#EFC97E', dark: '#D9A85A', bands: ['#F4D898', '#E6B866'] },
  moon: { base: '#CED2DC', dark: '#A9AEBB' },
  mars: { base: '#DB643C', dark: '#B4472A' },
  jupiter: { base: '#E5C29D', dark: '#B9845C', bands: ['#F2DFC4', '#C98A5B', '#E8C39E', '#A86B45', '#F0D7B5', '#C99467'] },
  saturn: { base: '#E9D296', dark: '#C9AB6A', bands: ['#F2E1AE', '#D8BC7C', '#EEDBA0'] },
  uranus: { base: '#A6E6EC', dark: '#7CCAD3' },
  neptune: { base: '#4277E2', dark: '#2C55B8', bands: ['#4F86F0', '#3A68D0'] },
  pluto: { base: '#D9BB9C', dark: '#B4927A' },
};

function planet(ctx: Ctx, name: string, x: number, y: number, R: number, t: number): void {
  if (name === 'earth') return earth(ctx, x, y, R, t * 0.25, 'normal', t);
  if (name === 'sun') return sunBody(ctx, x, y, R, t);
  const P = PLANET_COLORS[name] ?? PLANET_COLORS.mars;
  const ring = name === 'saturn';
  const ringPath = (front: boolean): void => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.32);
    for (const [k, c, w] of [
      [2.15, '#E8D7A8', 0.1],
      [1.85, '#C9AF78', 0.16],
      [1.5, '#F0E2B8', 0.12],
    ] as const) {
      ctx.strokeStyle = c;
      ctx.lineWidth = R * w;
      ctx.beginPath();
      ctx.ellipse(0, 0, R * k, R * k * 0.24, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };
  if (ring) ringPath(false);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = P.base;
  ctx.fillRect(x - R, y - R, R * 2, R * 2);
  if (P.bands) {
    const n = P.bands.length * 2 + 1;
    for (let k = 0; k < n; k++) {
      ctx.fillStyle = P.bands[k % P.bands.length];
      const yy = y - R + (k / n) * R * 2;
      ctx.beginPath();
      ctx.ellipse(x, yy + R / n, R * 1.1, (R / n) * (0.7 + 0.3 * hash(k + 7)), Math.sin(t * 0.2 + k) * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (name === 'jupiter') {
    ctx.fillStyle = '#C4553A';
    ctx.beginPath();
    ctx.ellipse(x + R * 0.35 * Math.cos(t * 0.15), y + R * 0.3, R * 0.2, R * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (name === 'mars') {
    ctx.fillStyle = P.dark;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (hash(k) - 0.5) * R * 1.2, y + (hash(k + 5) - 0.5) * R * 1.1, R * (0.12 + 0.15 * hash(k + 2)), R * 0.08, hash(k + 1), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.ellipse(x, y - R * 0.93, R * 0.35, R * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (name === 'neptune') {
    ctx.fillStyle = '#1C3C8C';
    ctx.beginPath();
    ctx.ellipse(x - R * 0.2, y + R * 0.2, R * 0.16, R * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (name === 'pluto') {
    ctx.fillStyle = '#F3E5D3';
    ctx.beginPath();
    ctx.ellipse(x + R * 0.15, y + R * 0.2, R * 0.32, R * 0.28, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  if (name === 'mercury' || name === 'moon') {
    for (let k = 0; k < 9; k++) crater(ctx, x + (hash(k + 30) - 0.5) * R * 1.5, y + (hash(k + 60) - 0.5) * R * 1.5, R * (0.06 + 0.1 * hash(k + 90)), P.dark, hexA('#FFFFFF', 0.25));
  }
  shade(ctx, x, y, R, 0.55);
  ctx.restore();
  if (ring) ringPath(true);
}

// ── The astronaut ──────────────────────────────────────────────────────────
type Mood = 'wave' | 'point' | 'shock' | 'float';

function astronaut(ctx: Ctx, env: Env, x: number, y: number, s: number, t: number, mood: Mood, local: number): void {
  const suit = '#F3F3F7';
  const suitDark = '#C9CBD8';
  const acc = env.accent[0];
  const bob = Math.sin(t * 1.6) * 14 * s;
  const tilt = mood === 'float' ? Math.sin(t * 0.7) * 0.35 : Math.sin(t * 1.1) * 0.06;
  ctx.save();
  ctx.translate(x, y + bob);
  ctx.rotate(tilt);
  ctx.scale(s, s);
  // Backpack.
  ctx.fillStyle = '#9EA2B6';
  rrect(ctx, -78, -40, 156, 170, 30);
  ctx.fill();
  // Legs.
  const leg = (dx: number, a: number): void => {
    ctx.save();
    ctx.translate(dx, 110);
    ctx.rotate(a);
    ctx.fillStyle = suitDark;
    rrect(ctx, -26, 0, 52, 110, 24);
    ctx.fill();
    ctx.fillStyle = suit;
    rrect(ctx, -26, -6, 48, 100, 22);
    ctx.fill();
    ctx.fillStyle = '#7C8098';
    rrect(ctx, -30, 86, 60, 34, 14);
    ctx.fill();
    ctx.restore();
  };
  leg(-32, 0.12 + Math.sin(t * 1.3) * 0.08);
  leg(32, -0.1 - Math.sin(t * 1.3 + 1) * 0.08);
  // Arms: by mood.
  const arm = (side: 1 | -1, a: number): void => {
    ctx.save();
    ctx.translate(side * 70, -10);
    ctx.rotate(a);
    ctx.fillStyle = suitDark;
    rrect(ctx, -22, 0, 44, 120, 22);
    ctx.fill();
    ctx.fillStyle = suit;
    rrect(ctx, -22, -4, 40, 108, 20);
    ctx.fill();
    ctx.fillStyle = acc;
    ctx.beginPath();
    ctx.arc(0, 118, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const wave = Math.sin(local * 9) * 0.35;
  if (mood === 'wave') {
    arm(-1, 0.35);
    arm(1, -2.6 + wave);
  } else if (mood === 'point') {
    arm(-1, 0.3);
    arm(1, -1.75);
  } else if (mood === 'shock') {
    arm(-1, 2.5 + Math.sin(local * 14) * 0.08);
    arm(1, -2.5 - Math.sin(local * 14) * 0.08);
  } else {
    arm(-1, 0.9 + Math.sin(t) * 0.2);
    arm(1, -0.9 - Math.sin(t + 1) * 0.2);
  }
  // Body.
  ctx.fillStyle = suitDark;
  rrect(ctx, -76, -60, 152, 190, 54);
  ctx.fill();
  ctx.fillStyle = suit;
  rrect(ctx, -76, -66, 146, 182, 52);
  ctx.fill();
  ctx.fillStyle = acc;
  rrect(ctx, -30, 0, 60, 44, 12);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(-12, 22, 6, 0, Math.PI * 2);
  ctx.arc(12, 22, 6, 0, Math.PI * 2);
  ctx.fill();
  // Helmet: a white shell, a dark visor with the character's two eyes in it.
  ctx.fillStyle = suitDark;
  ctx.beginPath();
  ctx.arc(0, -126, 104, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = suit;
  ctx.beginPath();
  ctx.arc(-4, -130, 100, 0, Math.PI * 2);
  ctx.fill();
  const vis = ctx.createLinearGradient(0, -200, 0, -60);
  vis.addColorStop(0, '#2A1F66');
  vis.addColorStop(1, '#120C33');
  ctx.fillStyle = vis;
  rrect(ctx, -76, -184, 146, 112, 52);
  ctx.fill();
  const eyeH = mood === 'shock' ? 40 : 30 * (Math.floor(t * 10) % 37 === 0 ? 0.15 : 1);
  ctx.fillStyle = '#5EF2E0';
  rrect(ctx, -44, -128 - eyeH / 2, 26, eyeH, 10);
  ctx.fill();
  rrect(ctx, 14, -128 - eyeH / 2, 26, eyeH, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(-4, -128, 60, Math.PI * 1.15, Math.PI * 1.4);
  ctx.stroke();
  ctx.restore();
}

// ── Scenes ─────────────────────────────────────────────────────────────────
function label(ctx: Ctx, text: string, x: number, y: number, size: number, color = '#FFFFFF', a = 1): void {
  const s = clean(text).trim();
  if (!s || a <= 0) return;
  withAlpha(ctx, a, () => {
    font(ctx, size, 800, FONT.meme);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = 'rgba(6,6,24,0.7)';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
    ctx.textBaseline = 'alphabetic';
  });
}

/** A line with *marked* words in the highlight colour, centred, wrapped. */
function marked(ctx: Ctx, text: string, cy: number, max: number, hi: string, a: number): void {
  const words = parseWords(text);
  if (!words.length) return;
  const plain = words.map((w) => w.text).join(' ');
  const c = fit(ctx, plain, { maxW: 920, maxH: 420, max, min: 44, maxLines: 4, weight: 900, family: FONT.meme, lh: 1.08 });
  withAlpha(ctx, a, () => {
    font(ctx, c.size, 900, FONT.meme);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const space = ctx.measureText(' ').width;
    let k = 0;
    const top = cy - ((c.lines.length - 1) * c.lh) / 2;
    c.lines.forEach((line, li) => {
      const n = line.split(/\s+/).filter(Boolean).length;
      const ws = words.slice(k, k + n);
      k += n;
      const total = ws.reduce((s, w) => s + ctx.measureText(w.text).width, 0) + space * (ws.length - 1);
      let x = CX - total / 2;
      for (const w of ws) {
        ctx.lineWidth = c.size * 0.16;
        ctx.strokeStyle = 'rgba(6,6,24,0.75)';
        ctx.strokeText(w.text, x, top + li * c.lh);
        ctx.fillStyle = w.accent ? hi : '#FFFFFF';
        ctx.fillText(w.text, x, top + li * c.lh);
        x += ctx.measureText(w.text).width + space;
      }
    });
    ctx.textBaseline = 'alphabetic';
  });
}

const toSecs = (s: string): number => {
  const parts = s.trim().split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
};
const clockText = (secs: number, long: boolean): string => {
  const s = Math.max(0, Math.round(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return long ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};

function scene(ctx: Ctx, env: Env, b: StoryBeat, local: number, t: number, hi: string): void {
  const sc = sceneOf(b);
  const a = b.a.trim().toLowerCase();
  const inK = easeOut(prog(local, 0, 0.5));
  switch (sc) {
    case 'title': {
      const ring = 260 + 20 * Math.sin(t);
      glow(ctx, CX, CY, ring, env.accent[1], 1.6, 0.25);
      marked(ctx, b.a || b.headline, CY - 30, 120, hi, inK);
      if (b.b) label(ctx, b.b, CX, CY + 230, 44, 'rgba(255,255,255,0.75)', easeOut(prog(local, 0.35, 0.4)));
      break;
    }
    case 'earth': {
      const look: EarthLook = a === 'dark' || a === 'ice' || a === 'hot' ? a : 'normal';
      earth(ctx, CX, CY, 330, t * 0.22, look, t);
      if (b.b) label(ctx, b.b, CX, CY + 430, 54, '#FFFFFF', easeOut(prog(local, 0.3, 0.4)));
      break;
    }
    case 'sun': {
      if (a === 'gone') {
        const at = b.dur * 0.42;
        const before = local < at;
        if (before) sunBody(ctx, CX, CY, 260, t);
        const k = prog(local, at, 0.6);
        if (!before && k < 1) {
          // A white flash, then a ring of light rushing out where it was.
          withAlpha(ctx, 1 - k, () => glow(ctx, CX, CY, 40 + 600 * easeOut(k), '#FFFFFF', 1.2, 0.9));
          ctx.strokeStyle = `rgba(255,230,170,${0.8 * (1 - k)})`;
          ctx.lineWidth = 16 * (1 - k) + 2;
          ctx.beginPath();
          ctx.arc(CX, CY, 260 + 500 * easeOut(k), 0, Math.PI * 2);
          ctx.stroke();
        }
      } else sunBody(ctx, CX, CY, a === 'giant' ? 380 : 260, t, a === 'giant');
      if (b.b) label(ctx, b.b, CX, CY + 470, 54, '#FFFFFF', easeOut(prog(local, 0.3, 0.4)));
      break;
    }
    case 'moon':
      glow(ctx, CX, CY, 260, '#FFFFFF', 1.15, 0.18);
      planet(ctx, 'moon', CX, CY, 260, t);
      if (b.b) label(ctx, b.b, CX, CY + 380, 54, '#FFFFFF', easeOut(prog(local, 0.3, 0.4)));
      break;
    case 'planet': {
      const name = PLANET_COLORS[a] ? a : 'mars';
      planet(ctx, name, CX, CY, name === 'saturn' ? 220 : 290, t);
      label(ctx, b.b || name.toUpperCase(), CX, CY + 420, 54, '#FFFFFF', easeOut(prog(local, 0.3, 0.4)));
      break;
    }
    case 'orbit': {
      const rx = 380;
      const ry = 150;
      const gone = a === 'gone';
      const at = b.dur * 0.42;
      const w = 0.9;
      const ang = (u: number): number => -0.6 + u * w;
      const pos = (u: number): { x: number; y: number } => ({ x: CX + Math.cos(ang(u)) * rx, y: CY + Math.sin(ang(u)) * ry });
      const vanished = gone && local >= at;
      // The orbit path, dashed.
      withAlpha(ctx, vanished ? 1 - prog(local, at, 0.8) : 1, () => {
        ctx.setLineDash([14, 16]);
        ctx.lineDashOffset = -t * 20;
        ctx.strokeStyle = 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.ellipse(CX, CY, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      let e = pos(local);
      if (vanished) {
        // Off on a straight line, along where it was heading.
        const p0 = pos(at);
        const d = { x: -Math.sin(ang(at)) * rx * w, y: Math.cos(ang(at)) * ry * w };
        e = { x: p0.x + d.x * (local - at), y: p0.y + d.y * (local - at) };
      }
      const behind = Math.sin(ang(local)) < 0 && !vanished;
      const drawEarth = (): void => earth(ctx, e.x, e.y, 46, t * 0.6, vanished ? 'dark' : 'normal', t);
      if (behind) drawEarth();
      if (!vanished) sunBody(ctx, CX, CY, 120, t);
      else {
        const k = prog(local, at, 0.6);
        if (k < 1) withAlpha(ctx, 1 - k, () => glow(ctx, CX, CY, 30 + 400 * easeOut(k), '#FFFFFF', 1.2, 0.9));
      }
      if (!behind) drawEarth();
      if (b.b) label(ctx, b.b, CX, CY + 380, 50, '#FFFFFF', easeOut(prog(local, 0.3, 0.4)));
      break;
    }
    case 'impact': {
      const R = 380;
      const ex = CX;
      const ey = CY + 420;
      earth(ctx, ex, ey, R, t * 0.1, 'normal', t);
      const hitAt = Math.min(b.dur * 0.55, 1.6);
      const hit = { x: ex + R * Math.cos(-2.2), y: ey + R * Math.sin(-2.2) };
      const start = { x: W + 140, y: 160 };
      const u = easeInOut(prog(local, 0.1, hitAt - 0.1));
      if (local < hitAt) {
        const rx = lerp(start.x, hit.x, u);
        const ry = lerp(start.y, hit.y, u);
        // The fiery tail, then the rock.
        const dx = start.x - hit.x;
        const dy = start.y - hit.y;
        const len = Math.hypot(dx, dy);
        const tail = ctx.createLinearGradient(rx, ry, rx + (dx / len) * 260, ry + (dy / len) * 260);
        tail.addColorStop(0, 'rgba(255,190,90,0.9)');
        tail.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.strokeStyle = tail;
        ctx.lineCap = 'round';
        ctx.lineWidth = 46;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + (dx / len) * 260, ry + (dy / len) * 260);
        ctx.stroke();
        ctx.fillStyle = '#6E5A50';
        ctx.beginPath();
        ctx.arc(rx, ry, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#8C766A';
        ctx.beginPath();
        ctx.arc(rx - 8, ry - 8, 14, 0, Math.PI * 2);
        ctx.fill();
        if (b.a) label(ctx, b.a, rx - 40, ry - 80, 44, hi, easeOut(prog(local, 0.2, 0.3)));
      } else {
        const k = prog(local, hitAt, 1.2);
        withAlpha(ctx, 1 - prog(local, hitAt, 0.5), () => {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, W, H);
        });
        glow(ctx, hit.x, hit.y, 40 + 220 * easeOut(k), '#FFB347', 1.4, 0.8 * (1 - k));
        ctx.strokeStyle = `rgba(255,220,160,${0.9 * (1 - k)})`;
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.ellipse(hit.x, hit.y, 60 + 420 * easeOut(k), (60 + 420 * easeOut(k)) * 0.5, -0.6, 0, Math.PI * 2);
        ctx.stroke();
        for (let n = 0; n < 18; n++) {
          const ang = -2.2 + (hash(n) - 0.5) * 2.2;
          const d = 40 + 380 * easeOut(k) * (0.5 + hash(n + 20));
          ctx.fillStyle = `rgba(255,${150 + Math.round(hash(n + 40) * 80)},90,${1 - k})`;
          ctx.beginPath();
          ctx.arc(hit.x + Math.cos(ang) * d, hit.y + Math.sin(ang) * d, 8 + 8 * hash(n + 60), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'blackhole': {
      const R = 170;
      const spin = t * 0.6;
      // The disc behind the hole, the hole, then the near half of the disc and the light bent over the top.
      const disc = (from: number, to: number): void => {
        for (let k = 0; k < 5; k++) {
          ctx.strokeStyle = hexA(['#FFE3A3', '#FFB451', '#FF8A2A', '#E85D1C', '#9C3412'][k], 0.85 - k * 0.12);
          ctx.lineWidth = 26 - k * 3;
          ctx.setLineDash([60 + k * 20, 18]);
          ctx.lineDashOffset = -spin * (120 - k * 15);
          ctx.beginPath();
          ctx.ellipse(CX, CY, R * (1.6 + k * 0.32), R * (0.34 + k * 0.07), -0.12, from, to);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      };
      glow(ctx, CX, CY, R, '#FF9A3C', 2.6, 0.35);
      disc(Math.PI, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,214,150,0.85)';
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.ellipse(CX, CY - R * 0.15, R * 1.18, R * 1.05, 0, Math.PI * 1.02, Math.PI * 1.98);
      ctx.stroke();
      ctx.fillStyle = '#000000';
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,236,200,0.9)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(CX, CY, R + 4, 0, Math.PI * 2);
      ctx.stroke();
      disc(0, Math.PI);
      if (b.a) label(ctx, b.a, CX, CY + 400, 54, '#FFFFFF', easeOut(prog(local, 0.3, 0.4)));
      break;
    }
    case 'compare': {
      const names = (b.a || 'earth;jupiter')
        .split(/[;,]/)
        .map((x) => x.trim().toLowerCase())
        .filter((x) => BODY_RADIUS[x] !== undefined)
        .slice(0, 4);
      const list = names.length ? names : ['earth', 'jupiter'];
      const radii = list.map((n) => BODY_RADIUS[n]);
      const gap = 50;
      const big = Math.max(...radii);
      const k = Math.min(300 / big, (960 - gap * (list.length - 1)) / radii.reduce((s, r) => s + 2 * r, 0));
      const rs = radii.map((r) => Math.max(5, r * k));
      const total = rs.reduce((s, r) => s + 2 * r, 0) + gap * (list.length - 1);
      let x = CX - total / 2;
      const base = CY + 200;
      list.forEach((n, j) => {
        const r = rs[j];
        const pop = easeBack(prog(local, 0.1 + j * 0.35, 0.45));
        const cx = x + r;
        const cy = base - r;
        if (pop > 0)
          scaled(ctx, clamp01(pop) * (pop > 1 ? pop : 1), cx, cy, () => {
            if (n === 'sun') sunBody(ctx, cx, cy, r, t);
            else planet(ctx, n, cx, cy, r, t);
          });
        label(ctx, n.toUpperCase(), cx, base + 70, 40, j === list.length - 1 ? hi : '#FFFFFF', easeOut(prog(local, 0.3 + j * 0.35, 0.3)));
        x += 2 * r + gap;
      });
      if (b.b) label(ctx, b.b, CX, base + 170, 50, '#FFFFFF', easeOut(prog(local, 0.4 + list.length * 0.35, 0.4)));
      break;
    }
    case 'number': {
      glow(ctx, CX, CY, 220, env.accent[1], 1.8, 0.3);
      const p = easeOut(prog(local, 0.15, Math.min(1.4, b.dur * 0.6)));
      const text = countUp(b.a || '0', p);
      const c = fit(ctx, text, { maxW: 940, maxH: 300, max: 230, min: 70, maxLines: 1, weight: 900, family: FONT.meme });
      label(ctx, text, CX, CY, c.size, hi, 1);
      if (b.b) label(ctx, b.b, CX, CY + 180, 52, '#FFFFFF', easeOut(prog(local, 0.4, 0.4)));
      break;
    }
    case 'clock': {
      const from = toSecs(b.a || '0:00');
      const to = toSecs(b.b || '8:20');
      const long = Math.max(from, to) >= 3600;
      const p = easeInOut(prog(local, 0.2, Math.max(0.6, b.dur * 0.7)));
      const now = lerp(from, to, p);
      const R = 250;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = hi;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(CX, CY, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, p));
      ctx.stroke();
      ctx.lineCap = 'butt';
      const text = clockText(now, long);
      const c = fit(ctx, text, { maxW: 400, maxH: 200, max: 150, min: 60, maxLines: 1, weight: 800, family: FONT.mono });
      label(ctx, text, CX, CY + 6, c.size, '#FFFFFF', 1);
      break;
    }
    case 'surface': {
      const kind = a === 'night' || a === 'ice' || a === 'mars' ? a : 'day';
      const S = {
        day: { sky: ['#4D9BEA', '#BFE4FF'], ground: ['#5CC27E', '#2F8F55'] },
        night: { sky: ['#070A26', '#1B2160'], ground: ['#2A3B66', '#141E3C'] },
        ice: { sky: ['#8FC4E6', '#E3F3FF'], ground: ['#F4FBFF', '#BFDDF0'] },
        mars: { sky: ['#D88A62', '#F2C29F'], ground: ['#C4552F', '#8E3A1E'] },
      }[kind];
      if (kind !== 'night') {
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.75);
        g.addColorStop(0, S.sky[0]);
        g.addColorStop(1, S.sky[1]);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      if (kind === 'night') earth(ctx, W * 0.75, 420, 110, t * 0.2, 'normal', t);
      if (kind === 'day' || kind === 'mars') sunBody(ctx, W * 0.78, 380, 70, t);
      const gr = ctx.createLinearGradient(0, 1130, 0, H);
      gr.addColorStop(0, S.ground[0]);
      gr.addColorStop(1, S.ground[1]);
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.ellipse(CX, 1130 + 2600, 2700, 2600, 0, 0, Math.PI * 2);
      ctx.fill();
      astronaut(ctx, env, CX - 40, 1000, 0.95, t * 0.3, 'wave', local);
      break;
    }
    case 'astronaut': {
      const mood = (['wave', 'point', 'shock', 'float'] as const).find((m) => m === a) ?? 'wave';
      glow(ctx, CX, CY, 260, env.accent[1], 1.5, 0.22);
      astronaut(ctx, env, CX, CY + 40, 1.35, t, mood, local);
      break;
    }
  }
}

// ── Frame ──────────────────────────────────────────────────────────────────
/** The camera for a scene at `local`: a slow push, or the cam= flag's move. */
function camOf(b: StoryBeat, local: number): { z: number; dx: number } {
  const u = easeInOut(clamp01(local / Math.max(0.5, b.dur)));
  const cam = b.tags.find((x) => x.startsWith('cam='))?.slice(4) ?? '';
  if (cam === 'close') return { z: lerp(1, 1.28, u), dx: 0 };
  if (cam === 'far') return { z: lerp(1.25, 1, u), dx: 0 };
  if (cam === 'drift') return { z: 1.04, dx: lerp(-70, 70, u) };
  return { z: 1 + 0.05 * u, dx: 0 };
}

function draw(ctx: Ctx, env: Env): void {
  const beats = storyBeats(env.fields);
  if (!beats.length) return;
  const t = Math.min(env.t, env.timing.body - 0.001);
  const i = Math.max(0, beats.findIndex((x) => t >= x.start && t < x.start + x.dur));
  const b = beats[i];
  const local = t - b.start;
  const hiKey = str(env.fields, 'highlight');
  const hi = hiKey === 'accent' ? env.accent[1] : (HIGHLIGHTS[hiKey] ?? HIGHLIGHTS.yellow);
  const prev = i > 0 ? beats[i - 1] : null;
  const view = fxView(b, local);

  ctx.save();
  if (fxMoves(view)) applyView(ctx, view);
  const cam = camOf(b, local);
  sky(ctx, env, t, cam.dx * 2 + t * 6);
  const drawScene = (x: StoryBeat, l: number): void => {
    const c = camOf(x, l);
    ctx.save();
    ctx.translate(CX + c.dx, CY);
    ctx.scale(c.z, c.z);
    ctx.translate(-CX, -CY);
    scene(ctx, env, x, l, t, hi);
    ctx.restore();
  };
  // A new scene comes in over the last one: a quick fade with a small zoom.
  const k = easeOut(prog(local, 0, 0.35));
  const cut = !!prev && (prev.visual !== b.visual || prev.a !== b.a);
  if (cut && k < 1) withAlpha(ctx, 1 - k, () => drawScene(prev, prev.dur));
  if (cut && k < 1) withAlpha(ctx, k, () => scaled(ctx, lerp(1.06, 1, k), CX, CY, () => drawScene(b, local)));
  else drawScene(b, cut ? local : prev && !cut ? t - beats[runStart(beats, i)].start : local);

  // The mascot floats in front of most scenes, small; astro puts it in front of this one, bigger.
  const sc = sceneOf(b);
  const mascot = str(env.fields, 'mascot') !== 'off' && sc !== 'surface' && sc !== 'astronaut';
  if (mascot || b.tags.includes('astro')) {
    const big = b.tags.includes('astro');
    const mood: Mood = big ? (sc === 'impact' || /gone/.test(b.a) ? 'shock' : 'point') : 'float';
    astronaut(ctx, env, big ? 820 : 900, big ? 1120 : 1160, big ? 0.72 : 0.42, t, mood, local);
  }
  if (sc !== 'title') captions(ctx, env, b, local, CAPTION_Y, hi);
  ctx.restore();
  fxPost(ctx, b, local);
  markLightFrame(false);
}

/** The first of the run of lines that show the same scene (the scene keeps animating across them). */
function runStart(beats: StoryBeat[], i: number): number {
  let k = i;
  while (k > 0 && beats[k - 1].visual === beats[i].visual && beats[k - 1].a === beats[i].a) k--;
  return k;
}

registerPreset('space', draw);
