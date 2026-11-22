import type { StoryBeat } from './presets';

// Sound effects for story reels: one cue per on-screen change, the way the
// reference reels do it (a tick when a number lands, a riser while a chart
// climbs, a hit on a crash, a whoosh on a wipe, a click when the cursor
// clicks). The times here mirror the animation timings in
// src/render/presets/story.ts; change both together.
import { isAction } from './character';
// The beat-flag sounds (FX_SOUNDS in presets.ts; kept here too so the two files don't import each other).
// Stickman poses that are not mascot actions (their big word pops like a mascot's label).
const STICK_WORD_POSES = ['idle', 'thumbsup', 'angry', 'walk', 'run', 'sit', 'type', 'phone', 'sleep', 'fall'];
const isFxSound = (k: string): boolean => ['boom', 'horn', 'scratch', 'ding', 'buzzer', 'boing', 'honk', 'sad', 'bass', 'whoosh', 'pop', 'impact', 'riser'].includes(k);

export type SfxKind = 'tick' | 'pop' | 'click' | 'whoosh' | 'riser' | 'impact' | 'whirr' | 'boom' | 'horn' | 'scratch' | 'ding' | 'buzzer' | 'boing' | 'honk' | 'sad' | 'bass';

export interface SfxEvent {
  /** Reel time, seconds. */
  t: number;
  kind: SfxKind;
  /** Length for riser / whirr. */
  dur?: number;
  /** Relative level, 1 = normal. */
  gain?: number;
}

export const list = (s: string): string[] =>
  s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);

export const parseNum = (s: string): number => Number(s.replace(/[−–]/g, '-').replace(/[^0-9.\-]/g, '')) || 0;

/** Chart beat: how long the line takes to draw. */
export const chartDrawTime = (b: StoryBeat): number => Math.min(2.8, Math.max(1.2, b.dur - 1.1));
/** Chart points: "0.2,0.5,7.3" or labelled "2010:41;2013:7500000". */
export const chartPoints = (b: StoryBeat): { label: string; v: number }[] =>
  b.a
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const i = x.lastIndexOf(':');
      return { label: i >= 0 ? x.slice(0, i).trim() : '', v: parseNum(i >= 0 ? x.slice(i + 1) : x) };
    });
export const chartValues = (b: StoryBeat): number[] => chartPoints(b).map((p) => p.v);

/** Wallet beat rows reveal: "checking…" until this, then one row every WALLET_STEP. */
export const WALLET_AT = 0.9;
export const WALLET_STEP = 0.35;

/** Follow beat: the cursor clicks at this time. */
export const FOLLOW_CLICK = 1.05;

/** Poll beat: the 3-2-1 countdown starts once the question is spoken, one number per step. */
export const POLL_AT = 0.7;
export const POLL_STEP = 0.75;
export const pollStart = (b: Pick<StoryBeat, 'voStart' | 'voDur'>): number => Math.max(POLL_AT, b.voDur ? b.voStart + b.voDur + 0.15 : POLL_AT);
/** A poll beat lasts at least until the countdown ends and the "?" settles. */
export const pollEnd = (b: Pick<StoryBeat, 'voStart' | 'voDur'>): number => pollStart(b) + 3 * POLL_STEP + 0.6;

/** Stamp beat: the verdict lands at this time. */
export const STAMP_AT = 0.35;

/** Coin beat: the coin stops spinning and lands at this time. */
export const COIN_LAND = 1.0;

/** Crosshair: the first shape snaps in at CROSS_AT, the next every CROSS_STEP. */
export const CROSS_AT = 0.45;
export const CROSS_STEP = 0.5;

/** Radar: the first sound lights the ring at RADAR_AT, the next every RADAR_STEP. */
export const RADAR_AT = 0.4;
export const RADAR_STEP = 1.0;
const RADAR_DIRS: Record<string, number> = { ahead: 0, front: 0, frontright: 45, right: 90, behindright: 135, backright: 135, behind: 180, back: 180, behindleft: 225, backleft: 225, left: 270, frontleft: 315 };
const RADAR_DIR_NAMES = ['ahead', 'front right', 'right', 'behind right', 'behind', 'behind left', 'left', 'front left'];
export type RadarKind = 'steps' | 'shot' | 'other';
export interface RadarSound {
  label: string;
  /** Degrees clockwise from straight ahead. */
  deg: number;
  dir: string;
  kind: RadarKind;
  /** Set when the beat names a colour; otherwise the kind decides (low = amber, high = cyan, like the app). */
  color?: string;
}
/** "Footsteps:left;Gunshot:right:#22D3EE;Reload:front-left" → the sounds of a radar beat. A direction is a word (ahead, left, behind-right...) or degrees. */
export function radarSounds(a: string): RadarSound[] {
  return list(a || 'Footsteps:left;Gunshot:right;Footsteps:front-right').map((it) => {
    const [l, d, c] = it.split(':').map((x) => x.trim());
    const key = (d ?? '').toLowerCase().replace(/[^a-z0-9.]/g, '');
    const deg = (((key in RADAR_DIRS ? RADAR_DIRS[key] : Number.isFinite(parseFloat(key)) ? parseFloat(key) : 270) % 360) + 360) % 360;
    const label = l || 'Sound';
    const kind: RadarKind = /step|foot|walk|run/i.test(label) ? 'steps' : /shot|gun|fire|snip|explo|bang/i.test(label) ? 'shot' : 'other';
    return { label, deg, dir: RADAR_DIR_NAMES[Math.round(deg / 45) % 8], kind, color: c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : undefined };
  });
}
/** When a radar sound pulses (seconds after it starts): footsteps land three times, anything else once. */
export const radarPulses = (kind: RadarKind): number[] => (kind === 'steps' ? [0, 0.3, 0.6] : [0]);
/** The opening beat starts with its first sound already on the ring. */
export const radarShift = (first: boolean): number => (first ? RADAR_AT + 0.1 : 0);

/** Character beat: its big word pops in at this time. */
export const LABEL_AT = 0.35;

/** Number beat: the count finishes at this time. */
export const NUMBER_LAND = 1.1;

/** Tier beat: when the item lands on the board. */
export const TIER_LAND = 0.6;
export const TIERS = ['S', 'A', 'B', 'C', 'D', 'F'] as const;
/** "S:Krypto Mirror" → its tier and item (no tier given = C). */
export function tierItem(a: string): { tier: string; item: string } {
  const m = /^\s*([SABCDF])\s*[:=-]\s*(.+)$/i.exec(a);
  return m ? { tier: m[1].toUpperCase(), item: m[2].trim() } : { tier: 'C', item: a.trim() };
}

/** Chat beat: its messages (">text" = sent by me, on the right; anything else is received). */
export function chatMessages(a: string): Array<{ text: string; me: boolean }> {
  return list(a).map((m) => (m.startsWith('>') ? { text: m.slice(1).trim(), me: true } : { text: m, me: false })).filter((m) => m.text);
}
/** When each message of a chat beat appears (seconds into the beat): spread over the spoken line by length, else 0.8s apart. */
export function chatTimes(b: Pick<StoryBeat, 'a' | 'voStart' | 'voDur'>): number[] {
  const msgs = chatMessages(b.a);
  if (!msgs.length) return [];
  const total = msgs.reduce((n, m) => n + m.text.length + 8, 0);
  const span = b.voDur > 0 ? b.voDur * 0.88 : msgs.length * 0.8;
  let acc = 0;
  return msgs.map((m) => {
    const t = b.voStart + 0.1 + (span * acc) / total;
    acc += m.text.length + 8;
    return t;
  });
}
export const chatEnd = (b: Pick<StoryBeat, 'a' | 'voStart' | 'voDur'>): number => {
  const ts = chatTimes(b);
  return ts.length ? ts[ts.length - 1] + 1.0 : 0;
};

export function storySfx(beats: StoryBeat[]): SfxEvent[] {
  const ev: SfxEvent[] = [];
  beats.forEach((b, i) => {
    const at = (t: number, kind: SfxKind, extra: Partial<SfxEvent> = {}): void => {
      if (t < b.dur) ev.push({ t: b.start + t, kind, ...extra });
    };
    if (b.wipe) at(0, 'whoosh', { gain: 1 });
    // Kinetic cuts zoom through, so every cut gets a soft whoosh.
    else if (b.kinetic && i > 0) at(0, 'whoosh', { dur: 0.3, gain: 0.4 });
    // Stickman versus beats name two poses ("think/type"): the first one's cue plays.
    const vis = b.visual.split('/')[0].trim();
    switch (vis) {
      case 'title':
        at(0.06, 'impact', { gain: i === 0 ? 0.9 : 0.6 });
        break;
      case 'number': {
        at(0.2, 'whirr', { dur: 0.9, gain: 0.7 });
        if (parseNum(b.a) < 0) at(NUMBER_LAND, 'impact', { gain: 0.55 });
        else at(NUMBER_LAND, 'tick', { gain: 1 });
        if (b.kinetic) at(NUMBER_LAND, 'pop', { gain: 0.6 });
        break;
      }
      case 'chart': {
        const v = chartValues(b);
        const T = chartDrawTime(b);
        let peak = v[0] ?? 0;
        for (let k = 1; k < v.length; k++) {
          const t0 = 0.2 + (T * (k - 1)) / (v.length - 1);
          const t1 = 0.2 + (T * k) / (v.length - 1);
          if (v[k] > v[k - 1] * 1.3) at(t0, 'riser', { dur: t1 - t0, gain: 0.8 });
          if (peak > 0 && v[k] < peak * 0.5 && v[k - 1] >= peak * 0.5) at(t1, 'impact', { gain: 1 });
          else at(t1, 'tick', { gain: 0.5 });
          peak = Math.max(peak, v[k]);
        }
        break;
      }
      case 'flow':
        at(0.3, 'whoosh', { gain: 0.6 });
        at(1.2, 'pop', { gain: 0.8 });
        if (b.b) at(1.35, 'whoosh', { gain: 0.8 });
        break;
      case 'dots':
        at(0.2, 'whirr', { dur: 1.6, gain: 0.6 });
        at(1.85, 'tick', { gain: 1 });
        break;
      case 'wallet': {
        at(0.12, 'pop', { gain: 0.7 });
        const rows = list(b.b);
        rows.forEach((r, k) => at(WALLET_AT + k * WALLET_STEP, parseNum(r.split(':').pop() ?? '') < 0 && k === rows.length - 1 ? 'impact' : 'tick', { gain: k === rows.length - 1 ? 0.6 : 0.8 }));
        break;
      }
      case 'bars':
        list(b.a).forEach((_, k) => at(0.25 + k * 0.22, 'tick', { gain: 0.8 }));
        break;
      case 'wallets':
        at(0.2, 'whirr', { dur: 0.9, gain: 0.5 });
        break;
      case 'lag':
        at(0.15, 'riser', { dur: 1.3, gain: 0.7 });
        at(0.55, 'pop', { gain: 0.8 });
        at(1.0, 'pop', { gain: 0.9 });
        break;
      case 'steps':
        list(b.a).forEach((_, k) => at(0.2 + k * 0.3, 'pop', { gain: 0.7 }));
        break;
      case 'card':
        at(0.12, 'pop', { gain: 0.7 });
        list(b.b).forEach((_, k) => at(0.35 + k * 0.35, 'tick', { gain: 0.7 }));
        break;
      case 'follow':
        at(FOLLOW_CLICK, 'click', { gain: 1 });
        break;
      case 'poll':
        at(0.1, 'pop', { gain: 0.7 });
        at(0.22, 'pop', { gain: 0.7 });
        for (let k = 0; k < 3; k++) at(pollStart(b) + k * POLL_STEP, 'tick', { gain: 1.1 });
        at(pollStart(b) + 3 * POLL_STEP, 'pop', { gain: 0.9 });
        break;
      case 'coin':
        at(0.05, 'whirr', { dur: COIN_LAND - 0.1, gain: 0.6 });
        at(COIN_LAND, 'impact', { gain: 0.7 });
        at(COIN_LAND + 0.05, 'tick', { gain: 1 });
        break;
      case 'crosshair': {
        const n = Math.max(1, list(b.a || 'cross;dot;circle;t;chevron;x').length);
        const shift = b.start === 0 ? -(CROSS_AT + 0.3) : 0;
        for (let k = 0; k < n; k++) {
          const t = CROSS_AT + k * CROSS_STEP + shift;
          if (t < 0.05) continue;
          if (t > b.dur - 0.1) break;
          at(t, k === 0 ? 'pop' : 'click', { gain: k === 0 ? 0.8 : 0.75 });
          at(t + 0.01, 'tick', { gain: 0.6 });
        }
        break;
      }
      case 'radar': {
        const shift = radarShift(b.start === 0);
        radarSounds(b.a).forEach((s, k) => {
          for (const pulse of radarPulses(s.kind)) {
            const t = RADAR_AT + k * RADAR_STEP + pulse - shift;
            if (t < 0 || t > b.dur - 0.1) continue;
            if (s.kind === 'shot') at(t, 'impact', { gain: 0.75 });
            else at(t, s.kind === 'steps' ? 'tick' : 'pop', { gain: s.kind === 'steps' ? 0.7 : 0.6 });
          }
        });
        break;
      }
      case 'tier': {
        at(0.08, 'pop', { gain: 0.6 });
        at(TIER_LAND - 0.22, 'whoosh', { dur: 0.2, gain: 0.5 });
        at(TIER_LAND, tierItem(b.a).tier === 'S' || tierItem(b.a).tier === 'F' ? 'impact' : 'tick', { gain: 0.9 });
        break;
      }
      case 'chat':
        chatMessages(b.a).forEach((m, k) => at(chatTimes(b)[k], m.me ? 'whoosh' : 'pop', m.me ? { dur: 0.15, gain: 0.35 } : { gain: 0.8 }));
        break;
      case 'screen':
        at(0.02, 'whoosh', { dur: 0.25, gain: 0.45 });
        break;
      // Narrated reels: the post card pops up; each greentext line ticks onto the board.
      case 'post':
        at(0.08, 'pop', { gain: 0.8 });
        break;
      case 'green':
        at(0.04, 'tick', { gain: 0.7 });
        break;
      // Meme panels cut hard, each with a pop.
      case 'image':
      case 'char':
      case 'text':
        if (i > 0) at(0, 'pop', { gain: 0.55 });
        break;
      case 'stamp':
        at(STAMP_AT - 0.12, 'whoosh', { dur: 0.15, gain: 0.5 });
        at(STAMP_AT + 0.14, 'impact', { gain: 1 });
        break;
      case 'cta':
        at(0.05, 'whoosh', { gain: 0.6 });
        at(0.3, 'pop', { gain: 0.8 });
        break;
      // Character beats: the mascot's move gets a cue, and a big word above it pops.
      case 'shock':
        at(0.02, 'impact', { gain: 0.9 });
        at(0.08, 'whoosh', { dur: 0.2, gain: 0.5 });
        break;
      case 'cheer':
        at(0.1, 'riser', { dur: 0.3, gain: 0.4 });
        at(0.4, 'pop', { gain: 0.8 });
        at(0.62, 'pop', { gain: 0.6 });
        break;
      case 'point':
      case 'present':
      case 'wave':
        at(0.12, 'whoosh', { dur: 0.18, gain: 0.35 });
        break;
      case 'think':
        at(0.3, 'tick', { gain: 0.7 });
        at(0.55, 'tick', { gain: 0.5 });
        break;
      case 'facepalm':
        at(0.32, 'impact', { gain: 0.45 });
        break;
      case 'sad':
      case 'shrug':
      case 'laugh':
      case 'thumbsup':
        at(0.15, 'pop', { gain: 0.45 });
        break;
      // Stickman poses (shared/stickman.ts): the times match the move in src/render/presets/stickman.ts.
      case 'fall':
        at(0.05, 'whoosh', { dur: 0.25, gain: 0.5 });
        at(0.3, 'impact', { gain: 0.8 });
        break;
      case 'run':
        at(0.05, 'whoosh', { dur: 0.3, gain: 0.45 });
        break;
      case 'angry':
        at(0.1, 'impact', { gain: 0.4 });
        break;
      case 'type':
        for (let k = 0; k < 4; k++) at(0.2 + k * 0.17, 'tick', { gain: 0.35 });
        break;
      default:
        break;
    }
    if ((isAction(vis) || STICK_WORD_POSES.includes(vis)) && b.a) at(LABEL_AT, 'pop', { gain: 0.7 });
    // Meme sounds from the beat's flags (boom, horn, scratch...).
    for (const f of b.fx) if (isFxSound(f.kind)) at(f.at, f.kind as SfxKind, { gain: 1 });
  });
  return ev;
}
