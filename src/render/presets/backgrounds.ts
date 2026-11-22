import { H, W, clamp01, easeInOut, easeOut, hexA, lerp, type Ctx } from '../engine';

// Moving backgrounds Marketo draws itself, for narrated reels (the "something to
// watch while the story is read" layer that Reddit-story channels use gameplay
// for). Nothing filmed or licensed: every frame is a function of the time, so
// preview and export match. runner = a neon endless-runner track; bounce = a
// ball bouncing inside a ring with a rainbow trail; slice = a layered block
// sliced off one slab at a time.

function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// ── Runner ────────────────────────────────────────────────────────────────
const HORIZON = 760;
const FOCAL = 900;
const CAM_H = 330;
// Lanes close enough that the side ones stay on screen at the runner's distance (±386 px).
const LANES = [-180, 0, 180];
const SPEED = 1500; // world units a second
const GAP = 900; // between obstacles

const project = (x: number, y: number, d: number): { x: number; y: number; s: number } => {
  const s = FOCAL / Math.max(1, d);
  return { x: W / 2 + x * s, y: HORIZON + (CAM_H - y) * s, s };
};

/** Obstacle k: its lane, and whether it is a low bar (jumped) or a block (dodged). */
const obstacle = (k: number): { lane: number; low: boolean } => ({ lane: Math.floor(hash(k) * 3), low: hash(k + 0.5) < 0.3 });

function runner(ctx: Ctx, t: number, seed: number): void {
  const hue = (seed * 47) % 360;
  // Sky: a dusk gradient and a striped sun.
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, `hsl(${hue + 250}, 60%, 8%)`);
  sky.addColorStop(1, `hsl(${hue + 300}, 70%, 28%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON);
  const sunY = HORIZON - 120;
  const sun = ctx.createLinearGradient(0, sunY - 260, 0, sunY + 260);
  sun.addColorStop(0, '#FFE066');
  sun.addColorStop(1, '#FF3D81');
  ctx.save();
  ctx.beginPath();
  ctx.arc(W / 2, sunY, 260, Math.PI, 0);
  ctx.clip();
  ctx.fillStyle = sun;
  ctx.fillRect(W / 2 - 260, sunY - 260, 520, 260);
  ctx.fillStyle = `hsl(${hue + 300}, 70%, 28%)`;
  for (let i = 0; i < 7; i++) {
    const y = sunY - 16 - i * 30 + ((t * 18) % 30);
    ctx.fillRect(W / 2 - 270, y, 540, 4 + i * 1.2);
  }
  ctx.restore();
  // Ground.
  const ground = ctx.createLinearGradient(0, HORIZON, 0, H);
  ground.addColorStop(0, `hsl(${hue + 270}, 70%, 10%)`);
  ground.addColorStop(1, `hsl(${hue + 260}, 60%, 4%)`);
  ctx.fillStyle = ground;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);
  const z0 = t * SPEED;
  // Grid lines across the floor, scrolling toward the camera.
  ctx.strokeStyle = hexA('#FF4FD8', 0.5);
  ctx.lineWidth = 2;
  for (let k = 0; k < 40; k++) {
    const d = (k + 1) * 220 - (z0 % 220);
    if (d < 60) continue;
    const p = project(0, 0, d);
    ctx.globalAlpha = clamp01(1.2 - d / 8000);
    ctx.beginPath();
    ctx.moveTo(0, p.y);
    ctx.lineTo(W, p.y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (let x = -2400; x <= 2400; x += 300) {
    const a = project(x, 0, 60);
    const b = project(x, 0, 9000);
    ctx.strokeStyle = hexA('#FF4FD8', 0.35);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  // The track: a glowing road with lane lines.
  const edge = (x: number): void => {
    const a = project(x, 0, 80);
    const b = project(x, 0, 9000);
    ctx.save();
    ctx.shadowColor = '#22D3EE';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = '#67E8F9';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };
  const l = project(-280, 0, 80);
  const r = project(280, 0, 80);
  const lf = project(-280, 0, 9000);
  const rf = project(280, 0, 9000);
  ctx.fillStyle = 'rgba(10,6,30,0.75)';
  ctx.beginPath();
  ctx.moveTo(l.x, l.y);
  ctx.lineTo(lf.x, lf.y);
  ctx.lineTo(rf.x, rf.y);
  ctx.lineTo(r.x, r.y);
  ctx.closePath();
  ctx.fill();
  edge(-280);
  edge(280);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 4;
  for (const x of [-90, 90])
    for (let k = 0; k < 30; k++) {
      const d = k * 400 - (z0 % 400) + 120;
      if (d < 100) continue;
      const a = project(x, 0, d);
      const b = project(x, 0, d + 160);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  // Obstacles, far to near.
  const runnerD = 420;
  const first = Math.floor(z0 / GAP) + 1;
  const list: Array<{ d: number; k: number }> = [];
  for (let k = first; k < first + 10; k++) list.push({ d: k * GAP - z0 + runnerD, k });
  for (const { d, k } of list.reverse()) {
    if (d < 120) continue;
    const o = obstacle(k);
    const x = LANES[o.lane];
    const h = o.low ? 70 : 220;
    const near = project(x, 0, d);
    const top = project(x, h, d);
    const w = 150 * near.s;
    const c = o.low ? '#FACC15' : '#F43F5E';
    ctx.save();
    ctx.globalAlpha = clamp01(1.3 - d / 9000);
    ctx.shadowColor = c;
    ctx.shadowBlur = 30 * near.s + 6;
    ctx.fillStyle = hexA(c, 0.25);
    ctx.strokeStyle = c;
    ctx.lineWidth = Math.max(2, 6 * near.s);
    ctx.fillRect(near.x - w / 2, top.y, w, near.y - top.y);
    ctx.strokeRect(near.x - w / 2, top.y, w, near.y - top.y);
    ctx.restore();
  }
  // The runner: a glowing cube that changes lanes to dodge blocks and hops the low bars.
  const kNext = Math.floor((z0 + 1) / GAP) + 1;
  const laneAt = (k: number): number => {
    const o = obstacle(k);
    if (o.low) return 1;
    return o.lane === 1 ? (hash(k + 0.9) < 0.5 ? 0 : 2) : 1;
  };
  const prevLane = laneAt(kNext - 1);
  const nextLane = laneAt(kNext);
  const since = (z0 - (kNext - 1) * GAP) / GAP; // 0..1 between obstacles
  const lx = lerp(LANES[prevLane], LANES[nextLane], easeInOut(clamp01((since - 0.25) / 0.35)));
  const ob = obstacle(kNext);
  const jumpP = ob.low ? clamp01((since - 0.62) / 0.36) : 0;
  const jump = Math.sin(jumpP * Math.PI) * 190;
  const base = project(lx, 0, runnerD);
  const top = project(lx, 100 + jump, runnerD);
  const size = 100 * base.s;
  // Shadow on the track.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(base.x, base.y, size * 0.6 * (1 - jump / 500), size * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  const bob = Math.abs(Math.sin(t * 9)) * 8 * (jump ? 0 : 1);
  ctx.save();
  ctx.translate(base.x, top.y + size / 2 - bob);
  ctx.rotate(jump ? jumpP * Math.PI * 2 : Math.sin(t * 9) * 0.05);
  ctx.shadowColor = '#A855F7';
  ctx.shadowBlur = 40;
  const g = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
  g.addColorStop(0, '#C084FC');
  g.addColorStop(1, '#6366F1');
  ctx.fillStyle = g;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.strokeStyle = '#F5F3FF';
  ctx.lineWidth = 5;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  ctx.restore();
  // Speed streaks at the edges.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const u = (t * 2.2 + hash(i)) % 1;
    const y = HORIZON + 80 + u * (H - HORIZON);
    const x = W / 2 + side * (420 + u * 520 + hash(i + 3) * 80);
    ctx.globalAlpha = u;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + side * 40 * u, y + 90 * u);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// ── Bounce ────────────────────────────────────────────────────────────────
const RING = { x: W / 2, y: 980, r: 400 };
const DT = 1 / 240;
interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hits: number;
  lastHit: number;
}
interface BounceSim {
  seed: number;
  t: number;
  ball: Ball;
  trail: Array<{ x: number; y: number; t: number }>;
  hits: Array<{ t: number; a: number }>;
}
let sim: BounceSim | null = null;

function startSim(seed: number): BounceSim {
  const a = hash(seed) * Math.PI * 2;
  return { seed, t: 0, ball: { x: RING.x + Math.cos(a) * 120, y: RING.y - 180, vx: 520 * Math.cos(a * 3), vy: 0, r: 26, hits: 0, lastHit: -1 }, trail: [], hits: [] };
}

function stepSim(s: BounceSim, until: number): void {
  const b = s.ball;
  while (s.t + DT <= until) {
    s.t += DT;
    b.vy += 1900 * DT;
    b.x += b.vx * DT;
    b.y += b.vy * DT;
    const dx = b.x - RING.x;
    const dy = b.y - RING.y;
    const d = Math.hypot(dx, dy);
    const lim = RING.r - b.r;
    if (d > lim) {
      const nx = dx / d;
      const ny = dy / d;
      b.x = RING.x + nx * lim;
      b.y = RING.y + ny * lim;
      const dot = b.vx * nx + b.vy * ny;
      b.vx -= 2 * dot * nx;
      b.vy -= 2 * dot * ny;
      // Never settle: keep the speed up, and nudge sideways so the path keeps changing.
      const sp = Math.hypot(b.vx, b.vy);
      const want = Math.max(sp, 1150);
      b.vx = (b.vx / sp) * want - ny * 90;
      b.vy = (b.vy / sp) * want + nx * 90;
      b.hits++;
      b.r = b.hits % 40 === 0 ? 26 : Math.min(120, b.r + 2.4);
      s.hits.push({ t: s.t, a: Math.atan2(ny, nx) });
      if (s.hits.length > 30) s.hits.shift();
    }
    if (Math.round(s.t / DT) % 4 === 0) {
      s.trail.push({ x: b.x, y: b.y, t: s.t });
      if (s.trail.length > 70) s.trail.shift();
    }
  }
}

function bounce(ctx: Ctx, t: number, seed: number): void {
  if (!sim || sim.seed !== seed || sim.t > t + 1e-6) sim = startSim(seed);
  stepSim(sim, t);
  const s = sim;
  ctx.fillStyle = '#07060C';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(RING.x, RING.y, 0, RING.x, RING.y, 900);
  glow.addColorStop(0, `hsla(${(t * 40 + seed) % 360}, 80%, 30%, 0.35)`);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  // Rotating outer arcs.
  for (let i = 0; i < 3; i++) {
    const rr = RING.r + 50 + i * 38;
    const a0 = t * (0.6 + i * 0.35) * (i % 2 ? -1 : 1);
    ctx.strokeStyle = `hsla(${(t * 60 + i * 90 + seed) % 360}, 90%, 60%, ${0.5 - i * 0.12})`;
    ctx.lineWidth = 10 - i * 2;
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(RING.x, RING.y, rr, a0 + (k * Math.PI * 2) / 3, a0 + (k * Math.PI * 2) / 3 + 1.3);
      ctx.stroke();
    }
  }
  // The ring, flaring where the ball last hit.
  const last = s.hits[s.hits.length - 1];
  const flare = last ? Math.max(0, 1 - (t - last.t) / 0.3) : 0;
  ctx.save();
  ctx.shadowColor = `hsl(${(s.ball.hits * 23 + seed) % 360}, 100%, 60%)`;
  ctx.shadowBlur = 30 + 50 * flare;
  ctx.strokeStyle = `hsl(${(s.ball.hits * 23 + seed) % 360}, 100%, ${65 + 20 * flare}%)`;
  ctx.lineWidth = 12 + 8 * flare;
  ctx.beginPath();
  ctx.arc(RING.x, RING.y, RING.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  // Lines from each recent hit to the ball (string art).
  for (const h of s.hits) {
    const age = t - h.t;
    if (age > 4) continue;
    ctx.strokeStyle = `hsla(${(h.t * 90 + seed) % 360}, 90%, 65%, ${0.5 * (1 - age / 4)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(RING.x + Math.cos(h.a) * RING.r, RING.y + Math.sin(h.a) * RING.r);
    ctx.lineTo(s.ball.x, s.ball.y);
    ctx.stroke();
  }
  // Rainbow trail, then the ball.
  s.trail.forEach((p, i) => {
    const u = i / s.trail.length;
    ctx.fillStyle = `hsla(${(p.t * 120 + seed) % 360}, 95%, 60%, ${0.08 + u * 0.35})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, s.ball.r * (0.4 + 0.6 * u), 0, Math.PI * 2);
    ctx.fill();
  });
  const b = s.ball;
  const bg = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 2, b.x, b.y, b.r);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(1, `hsl(${(t * 120 + seed) % 360}, 95%, 60%)`);
  ctx.save();
  ctx.shadowColor = '#FFFFFF';
  ctx.shadowBlur = 30;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Slice ─────────────────────────────────────────────────────────────────
const SLICE_EVERY = 1.05;
const PALETTES = [
  ['#FF9AA2', '#FFB7B2', '#FFDAC1', '#E2F0CB', '#B5EAD7', '#C7CEEA', '#A0C4FF', '#BDB2FF'],
  ['#F72585', '#B5179E', '#7209B7', '#560BAD', '#480CA8', '#3A0CA3', '#3F37C9', '#4361EE'],
  ['#FEC5BB', '#FCD5CE', '#FAE1DD', '#F8EDEB', '#E8E8E4', '#D8E2DC', '#ECE4DB', '#FFE5D9'],
  ['#06D6A0', '#1B9AAA', '#EF476F', '#FFC43D', '#F8FFE5', '#06D6A0', '#EF476F', '#FFC43D'],
];

function layers(ctx: Ctx, x: number, y: number, w: number, h: number, pal: string[], shade: number, grain: number): void {
  const n = pal.length;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = pal[i];
    ctx.fillRect(x, y + (h * i) / n, w, h / n + 1);
  }
  // Soft vertical streaks, like a cut through sand or soap.
  ctx.fillStyle = `rgba(255,255,255,${0.08 + 0.04 * grain})`;
  for (let k = 0; k < 18; k++) ctx.fillRect(x + w * hash(k + grain * 7), y, 2 + 3 * hash(k + 9), h);
  if (shade) {
    ctx.fillStyle = `rgba(0,0,0,${shade})`;
    ctx.fillRect(x, y, w, h);
  }
}

function slice(ctx: Ctx, t: number, seed: number): void {
  const pal = PALETTES[seed % PALETTES.length];
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1A1622');
  bg.addColorStop(1, '#0B0A10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // A table.
  ctx.fillStyle = '#2A2433';
  ctx.fillRect(0, 1330, W, H - 1330);
  const k = Math.floor(t / SLICE_EVERY);
  const u = (t % SLICE_EVERY) / SLICE_EVERY;
  // The block: a front face (the fresh cut, layered) and a top, in a gentle 3/4 view.
  const bx = 200;
  const bw = 680;
  const by = 760;
  const bh = 560;
  const depth = 120 + (1 - ((k % 12) / 12)) * 160;
  const off = 70;
  ctx.fillStyle = pal[0];
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + off, by - depth * 0.45);
  ctx.lineTo(bx + bw + off, by - depth * 0.45);
  ctx.lineTo(bx + bw, by);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fill();
  ctx.fillStyle = pal[pal.length - 1];
  ctx.beginPath();
  ctx.moveTo(bx + bw, by);
  ctx.lineTo(bx + bw + off, by - depth * 0.45);
  ctx.lineTo(bx + bw + off, by + bh - depth * 0.45);
  ctx.lineTo(bx + bw, by + bh);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fill();
  layers(ctx, bx, by, bw, bh, pal, 0, k);
  // The blade: comes down in the first 40% of the cycle.
  const down = easeInOut(clamp01(u / 0.4));
  const up = clamp01((u - 0.55) / 0.3);
  const bladeY = lerp(by - 420, by + bh - 20, down) - lerp(0, bh + 400, easeInOut(up));
  ctx.save();
  const metal = ctx.createLinearGradient(0, bladeY - 300, 0, bladeY);
  metal.addColorStop(0, '#6B7280');
  metal.addColorStop(0.7, '#E5E7EB');
  metal.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = metal;
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 20;
  ctx.fillRect(bx - 40, bladeY - 300, bw + 80, 300);
  ctx.fillStyle = '#374151';
  ctx.fillRect(bx - 40, bladeY - 320, bw + 80, 26);
  ctx.restore();
  // The slab: once the blade is through, it peels forward and falls off the table.
  const peel = clamp01((u - 0.38) / 0.62);
  if (peel > 0) {
    const tilt = easeOut(clamp01(peel * 1.6)) * 1.25;
    const fall = Math.max(0, peel - 0.4) * 1400;
    ctx.save();
    ctx.translate(bx + bw / 2, by + bh + fall);
    // Rotating about the bottom edge toward the camera: the face squashes and darkens.
    const sq = Math.cos(tilt);
    ctx.scale(1 + 0.08 * Math.sin(tilt), Math.max(0.04, sq));
    ctx.globalAlpha = clamp01(1.6 - peel * 1.4);
    layers(ctx, -bw / 2, -bh, bw, bh, pal, 0.1 + 0.35 * (1 - sq), k + 1);
    ctx.restore();
  }
  // Crumbs.
  for (let i = 0; i < 16; i++) {
    const a = clamp01((u - 0.36) / 0.4);
    if (a <= 0 || a >= 1) continue;
    ctx.fillStyle = pal[i % pal.length];
    const x = bx + bw * hash(i + k * 3);
    const y = by + bh - 10 + a * a * 300 * (0.5 + hash(i + 1));
    ctx.globalAlpha = 1 - a;
    ctx.fillRect(x, y, 8, 8);
  }
  ctx.globalAlpha = 1;
  // Reflection on the table.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(bx, by + bh + 4, bw, 60);
}

/** Draw a built-in background. seed varies colours and paths between reels. */
export function drawBackground(ctx: Ctx, kind: string, t: number, seed: number): boolean {
  if (kind === 'runner') runner(ctx, t, seed);
  else if (kind === 'bounce') bounce(ctx, t, seed);
  else if (kind === 'slice') slice(ctx, t, seed);
  else return false;
  return true;
}

/** Fill the frame with a video frame, cropped to fill (cover). */
export function coverVideo(ctx: Ctx, v: CanvasImageSource, size: { w: number; h: number }, rect = { x: 0, y: 0, w: W, h: H }): void {
  const s = Math.max(rect.w / size.w, rect.h / size.h);
  const w = size.w * s;
  const h = size.h * s;
  ctx.drawImage(v, rect.x + (rect.w - w) / 2, rect.y + (rect.h - h) / 2, w, h);
}

