import type { StoryBeat } from './presets';

// Sound effects for story reels: one cue per on-screen change, the way the
// reference reels do it (a tick when a number lands, a riser while a chart
// climbs, a hit on a crash, a whoosh on a wipe, a click when the cursor
// clicks). The times here mirror the animation timings in
// src/render/presets/story.ts; change both together.
import { isAction } from './character';
import { ambienceFor, isSampleFlag, type SampleKind } from './sfxLib';
import { isMorphState } from './morph';
import { isCutItem } from './cutaway';
import { DIO_PIECE_GROUPS, dioRiseTime, dioThings } from './diorama';
import { STICK_KNOCKS, STICK_LIGHTNING_AT } from './stickman';
// The beat-flag sounds (FX_SOUNDS in presets.ts; kept here too so the two files don't import each other).
// Stickman poses that are not mascot actions (their big word pops like a mascot's label).
const STICK_WORD_POSES = ['idle', 'thumbsup', 'angry', 'walk', 'run', 'sit', 'type', 'phone', 'sleep', 'fall', 'jump', 'dance', 'groove', 'spin'];
const isFxSound = (k: string): boolean => ['boom', 'horn', 'scratch', 'ding', 'buzzer', 'boing', 'honk', 'sad', 'bass', 'whoosh', 'pop', 'impact', 'riser'].includes(k) || isSampleFlag(k);

export type SfxKind = 'tick' | 'pop' | 'click' | 'whoosh' | 'riser' | 'impact' | 'whirr' | 'boom' | 'horn' | 'scratch' | 'ding' | 'buzzer' | 'boing' | 'honk' | 'sad' | 'bass' | 'roomtone' | SampleKind;

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

/** A stickman reel (its fields have the stickman's own line weight and gear). */
const isStick = (f?: Record<string, unknown>): boolean => !!f && f.line !== undefined && f.gear !== undefined;

/** Props that get their own little sound when they appear in a stickman beat. */
const STICK_PROP_SFX: Record<string, [number, SfxKind, number]> = {
  sign: [0.12, 'pop', 0.45],
  bubble: [0.12, 'pop', 0.4],
  think: [0.12, 'pop', 0.4],
  arrow: [0.15, 'whoosh', 0.25],
  bulb: [0.18, 'ding', 0.4],
  question: [0.15, 'boing', 0.3],
  exclaim: [0.12, 'pop', 0.5],
  sweat: [0.2, 'pop', 0.3],
  money: [0.2, 'ding', 0.35],
  key: [0.2, 'tick', 0.45],
  torch: [0.1, 'click', 0.5],
  phone: [0.25, 'tick', 0.35],
  chart: [0.1, 'riser', 0.3],
  coffee: [0.25, 'tick', 0.3],
  bag: [0.2, 'whoosh', 0.2],
  food: [0.25, 'pop', 0.3],
  bottle: [0.25, 'pop', 0.3],
};

export function storySfx(beats: StoryBeat[], fields?: Record<string, unknown>): SfxEvent[] {
  const ev: SfxEvent[] = [];
  const stick = isStick(fields);
  beats.forEach((b, i) => {
    const at = (t: number, kind: SfxKind, extra: Partial<SfxEvent> = {}): void => {
      if (t < b.dur) ev.push({ t: b.start + t, kind, ...extra });
    };
    // Stickman: about eight small sounds every ten seconds, all under the voice. The camera glides to a new
    // framing (a soft whoosh), the pose changes (a light tick), and props that appear get their own sound.
    if (stick && i > 0) {
      const prev = beats[i - 1];
      const cam = (x: StoryBeat): string => x.tags.find((t) => t.startsWith('cam=')) ?? '';
      if (cam(prev) !== cam(b) || b.tags.includes('push')) at(0.02, 'whoosh', { dur: 0.35, gain: 0.22 });
      if (prev.visual !== b.visual) at(0.08, 'tick', { gain: 0.25 });
      const had = new Set(prev.b.split(';').map((x) => x.replace(/^\s*[abc]\s*:/i, '').split('=')[0].trim().toLowerCase()));
      let n = 0;
      for (const part of b.b.split(';')) {
        const kind = part.replace(/^\s*[abc]\s*:/i, '').split('=')[0].trim().toLowerCase();
        const cue = STICK_PROP_SFX[kind];
        if (!cue || had.has(kind) || n >= 2) continue;
        at(cue[0] + n * 0.12, cue[1], { gain: cue[2], ...(cue[1] === 'riser' || cue[1] === 'whoosh' ? { dur: 0.4 } : {}) });
        n++;
      }
      if (b.dur > 3.2) at(b.dur * 0.55, 'whoosh', { dur: 0.3, gain: 0.15 });
    }
    if (b.wipe) at(0, 'whoosh', { gain: 1 });
    // Kinetic cuts zoom through, so every cut gets a soft whoosh.
    else if (b.kinetic && i > 0) at(0, 'whoosh', { dur: 0.3, gain: 0.4 });
    // Stickman versus beats name two poses ("think/type"): the first one's cue plays.
    const vis = b.visual.split('/')[0].trim();
    // Ask reels: the board comes down or moves on with a whoosh; an asker's bubble pops.
    if (b.tags.some((x) => x.startsWith('part='))) at(0, 'whoosh', { dur: 0.35, gain: 0.5 });
    if (b.tags.includes('who=a') && !b.say && vis === 'none') at(0.08, 'pop', { gain: 0.6 });
    // Stickman places and weather (shared/stickman.ts): the whip to a new place, thunder, knocks on the door, steps walking in.
    if (stick && i > 0 && b.tags.some((x) => x.startsWith('set=') && x !== 'set=none')) at(0, 'whoosh', { dur: 0.3, gain: 0.55 });
    if (b.tags.includes('weather=storm')) at(STICK_LIGHTNING_AT, 'boom', { gain: 0.8 });
    if (b.tags.includes('knock')) for (const k of STICK_KNOCKS) at(k, 'impact', { gain: 0.2 });
    if (b.tags.some((x) => x.startsWith('enter='))) at(0.05, 'whoosh', { dur: 0.25, gain: 0.3 });
    // UI motion (shared/morph.ts): the cursor's click starts every change, the morph swishes, then the state's own sound.
    if (isMorphState(vis)) {
      const half = 0.3 * b.dur;
      if (i > 0 && !b.tags.includes('noclick')) at(0, 'click', { gain: 0.9 });
      at(0.02, 'whoosh', { dur: 0.22, gain: 0.25 });
      if (vis === 'toggle' || vis === 'tabs') at(half + 0.1, 'tick', { gain: 0.7 });
      else if (vis === 'checkbox') at(half + 0.12, 'pop', { gain: 0.7 });
      else if (vis === 'notify' || vis === 'message') at(vis === 'message' ? half : 0.18, vis === 'notify' ? 'ding' : 'pop', { gain: 0.55 });
      else if (vis === 'search' || vis === 'input') for (let k = 0; k < 5; k++) at(0.12 * b.dur + k * 0.11 * b.dur, 'tick', { gain: 0.3 });
      else if (vis === 'logo' || vis === 'word') at(0.12, 'impact', { gain: 0.5 });
    }
    // Backyard cutaway builds (shared/cutaway.ts): the dig rumbles, the build lands, the total ticks.
    if (isCutItem(vis) && fields?.toon !== 'dio') {
      at(0.05, 'whirr', { dur: 0.8, gain: 0.45 });
      at(0.75, 'pop', { gain: 0.7 });
      if (b.b.trim()) at(1.1, 'ding', { gain: 0.4 });
    }
    switch (vis) {
      // Space what-if scenes (shared/space.ts): soft swells, and the big moments land.
      case 'sun':
      case 'orbit':
        if (b.a.trim().toLowerCase() === 'gone') {
          at(b.dur * 0.42 - 0.6, 'riser', { dur: 0.6, gain: 0.6 });
          at(b.dur * 0.42, 'boom', { gain: 0.8 });
        } else at(0.05, 'whoosh', { dur: 0.5, gain: 0.3 });
        break;
      case 'impact':
        at(0.1, 'riser', { dur: Math.min(b.dur * 0.55, 1.6) - 0.1, gain: 0.7 });
        at(Math.min(b.dur * 0.55, 1.6), 'boom', { gain: 1 });
        break;
      case 'blackhole':
        at(0.05, 'bass', { gain: 0.7 });
        break;
      case 'compare':
        for (let k = 0; k < Math.min(4, b.a.split(/[;,]/).filter(Boolean).length || 2); k++) at(0.15 + k * 0.35, 'pop', { gain: 0.6 });
        break;
      case 'clock':
        for (let k = 0; k < Math.min(12, Math.floor(b.dur / 0.25)); k++) at(0.25 + k * 0.25, 'tick', { gain: 0.35 });
        break;
      case 'earth':
      case 'moon':
      case 'planet':
      case 'surface':
        at(0.03, 'whoosh', { dur: 0.45, gain: 0.3 });
        break;
      case 'astronaut':
        at(0.1, 'boing', { gain: 0.35 });
        break;
      case 'chip':
        at(0.15, 'pop', { gain: 0.7 });
        break;
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
      case 'photo':
      case 'char':
      case 'text':
      // Slideshows: the closing slide.
      case 'end':
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
      case 'spin':
        at(0.05, 'whoosh', { dur: 0.3, gain: 0.45 });
        break;
      // Blocky avatars (shared/blox.ts): the first hop of a jump.
      case 'jump':
        at(0.04, 'whoosh', { dur: 0.22, gain: 0.4 });
        at(0.68, 'tick', { gain: 0.5 });
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
  ev.push(...causeSfx(beats, fields), ...storyAmbience(beats, fields));
  return ev;
}

// ── Sounds with a cause ──────────────────────────────────────────────────────
// Every recorded cue answers: what made it, where, why now. A prop that comes into a line makes its own sound
// (coins clink, a bag thumps), an action makes its sound (digging, a sip), and the camera whipping to a new place
// swishes. Only things that change get a sound, so a held prop is quiet; the voice always stays on top.
const PROP_SOUND: Record<string, [SfxKind, number]> = {
  cash: ['cash', 0.8],
  money: ['cash', 0.8],
  coin: ['coin', 0.8],
  bag: ['cloth', 0.6],
  trashbag: ['thud', 0.55],
  phone: ['phone', 0.5],
  letter: ['paper', 0.7],
  card: ['paper', 0.5],
  sign: ['paper', 0.4],
  laptop: ['uiclick', 0.6],
  keys: ['keys', 0.7],
  key: ['keys', 0.7],
  briefcase: ['thud', 0.4],
  drive: ['clang', 0.3],
  shovel: ['stone', 0.6],
  gavel: ['knock', 0.9],
  burger: ['squish', 0.4],
  food: ['squish', 0.35],
  mug: ['drink', 0.5],
  cup: ['drink', 0.5],
  coffee: ['drink', 0.5],
  bottle: ['glass', 0.45],
  glass: ['glass', 0.45],
  trophy: ['bell', 0.4],
  goldbar: ['clang', 0.5],
  ring: ['bell', 0.35],
  torch: ['uiclick', 0.4],
};
const MOVE_SOUND: Record<string, [number, SfxKind, number]> = {
  dig: [0.35, 'stone', 0.7],
  drink: [0.4, 'drink', 0.6],
  phone: [0.2, 'phone', 0.5],
  facepalm: [0.25, 'punch', 0.3],
  anger: [0.3, 'thud', 0.35],
  angry: [0.3, 'thud', 0.35],
  shock: [0.05, 'swish', 0.35],
  walk: [0.1, 'step', 0.35],
  run: [0.05, 'step', 0.45],
  type: [0.15, 'uiclick', 0.35],
};
/** What the drawn-toon styles' moves sound like (in place of the general ones). */
const TOON_MOVE: Record<string, Record<string, [number, SfxKind, number]>> = {
  pixel: { jump: [0.05, 'jump', 0.5], fall: [0.25, 'uierror', 0.45], happy: [0.1, 'powerup', 0.4], shock: [0.05, 'blip', 0.45], walk: [0.1, 'blip', 0.12], run: [0.05, 'blip', 0.14], type: [0.15, 'blip', 0.25] },
  hose: { jump: [0.05, 'boing', 0.5], shock: [0.05, 'squeak', 0.45], fall: [0.25, 'thud', 0.55], sneak: [0.1, 'pizzi', 0.45], happy: [0.1, 'sax', 0.35], dance: [0.1, 'sax', 0.35], whistle: [0.2, 'pizzi', 0.3] },
  tv: { shock: [0.05, 'blip', 0.4], fall: [0.25, 'thud', 0.45], jump: [0.05, 'jump', 0.35], type: [0.15, 'uiclick', 0.35] },
};
const propsOf = (raw: string): string[] =>
  raw
    .split(';')
    .map((x) => x.replace(/^\s*[abc]\s*:/i, '').split('=')[0].trim().toLowerCase())
    .filter(Boolean);
const isInk = (f?: Record<string, unknown>): boolean => !!f && f.palette !== undefined && f.cast !== undefined;
const isPs2 = (f?: Record<string, unknown>): boolean => !!f && f.toon === undefined && f.palette === undefined && f.cast !== undefined && f.set !== undefined && f.time !== undefined;
/** pixel, hose or tv (their hidden toon field), else ''. */
const toonOf = (f?: Record<string, unknown>): string => (f && typeof f.toon === 'string' ? f.toon : '');

function causeSfx(beats: StoryBeat[], f?: Record<string, unknown>): SfxEvent[] {
  const ev: SfxEvent[] = [];
  const stick = isStick(f);
  const ink = isInk(f);
  const ps2 = isPs2(f);
  const toon = toonOf(f);
  if (toon === 'dio') return dioSfx(beats);
  if (!stick && !ink && !ps2 && !toon) return ev;
  const tagVal = (b: StoryBeat, key: string): string => b.tags.find((x) => x.startsWith(key + '='))?.slice(key.length + 1) ?? '';
  let coins = '';
  let hp = '';
  let place = f && typeof f.set === 'string' ? f.set : '';
  beats.forEach((b, i) => {
    const at = (t: number, kind: SfxKind, gain: number): void => {
      if (t < b.dur) ev.push({ t: b.start + t, kind, gain });
    };
    const prev = i > 0 ? beats[i - 1] : null;
    const before = place;
    for (const t of b.tags) if (t.startsWith('set=')) place = t.slice(4);
    const newPlace = !!prev && place !== before;
    // A new place: the camera whips there.
    if ((ink || ps2) && prev && (newPlace || b.tags.includes('whip'))) at(0, 'swish', 0.6);
    // The drawn-toon styles: each has its own sound for a new place, a title card and the end.
    if (toon === 'pixel') {
      if (newPlace) at(0.02, 'blip', 0.5);
      if (b.tags.includes('title')) at(0.05, 'nes', 0.6);
      const choice = tagVal(b, 'choice');
      if (choice) {
        at(0.3, 'blip', 0.3);
        if (choice.includes('/')) for (let t = 0.75; t < b.dur * 0.6; t += 0.45) at(t, 'blip', 0.3);
        at(b.dur * 0.6, 'uiok', 0.5);
      }
      const c = tagVal(b, 'coins');
      if (c && coins && c !== coins) at(0.1, 'coin', Number(c) > Number(coins) ? 0.6 : 0.45);
      if (c) coins = c;
      const h = tagVal(b, 'hp');
      if (h && hp && h !== hp) at(0.1, Number(h) > Number(hp) ? 'powerup' : 'uierror', 0.55);
      if (h) hp = h;
    } else if (toon === 'hose') {
      if (newPlace) at(0, 'swish', 0.45);
      if (b.tags.includes('title')) at(0.05, 'stinger', 0.55);
      if (b.tags.includes('end')) at(b.dur * 0.55, 'stinger', 0.5);
    } else if (toon === 'tv') {
      if (newPlace || b.tags.includes('static')) at(0.02, 'zap', 0.45);
      if (b.tags.includes('title')) at(0.05, 'uiopen', 0.5);
      if (b.tags.includes('end')) at(Math.max(0, b.dur - 0.6), 'zap', 0.5);
    }
    // Things that come into the line.
    const had = new Set(prev ? propsOf(prev.b) : []);
    let n = 0;
    for (const p of propsOf(b.b)) {
      const s = PROP_SOUND[p];
      if (!s || had.has(p) || n >= 2) continue;
      at(0.18 + n * 0.22, s[0], s[1]);
      n++;
    }
    // What they do (the first move of the line; a held move only sounds when it starts).
    const move = b.visual.split('/')[0].trim().toLowerCase();
    const was = prev ? prev.visual.split('/')[0].trim().toLowerCase() : '';
    const m = toon && TOON_MOVE[toon]?.[move] ? TOON_MOVE[toon][move] : MOVE_SOUND[move];
    if (m && move !== was) {
      at(m[0], m[1], m[2]);
      // Digging and walking repeat with the motion.
      if (move === 'dig') for (let t = m[0] + 0.9; t < b.dur - 0.2; t += 0.9) at(t, 'stone', m[2] * 0.8);
      if (move === 'walk' || move === 'run') for (let t = m[0] + 0.45; t < b.dur - 0.1; t += move === 'run' ? 0.3 : 0.45) at(t, m[1], m[2]);
      // Tiptoeing in the old cartoons: plucked strings on every step.
      if (move === 'sneak') for (let t = m[0] + 0.5; t < b.dur - 0.1; t += 0.5) at(t, 'pizzi', m[2]);
    }
    // Stickman: real knocks on the door, thunder in the storm, steps walking in.
    if (stick && b.tags.includes('knock')) for (const k of STICK_KNOCKS) at(k, 'knock', 0.9);
    if (stick && b.tags.includes('weather=storm')) at(STICK_LIGHTNING_AT + 0.05, 'thunder', 0.7);
    if (stick && b.tags.some((x) => x.startsWith('enter='))) for (const t of [0.1, 0.45, 0.8]) at(t, 'step', 0.35);
  });
  return ev;
}

// ── 3D diorama ───────────────────────────────────────────────────────────────
// Every piece that lands makes its own sound (a building thuds, a car door shuts, a dog barks), things taken away
// whoosh off, and actions sound for as long as they last: the mower's engine, rain, thunder on each flash, fire,
// water rising. Years passing get a soft rising sweep.
const DIO_SOUND: Record<string, [SfxKind, number]> = {
  car: ['cardoor', 0.55],
  truck: ['cardoor', 0.55],
  van: ['cardoor', 0.55],
  tractor: ['engine', 0.35],
  rocket: ['clang', 0.45],
  person: ['stepgrass', 0.45],
  crowd: ['stepgrass', 0.5],
  dog: ['dog', 0.5],
  coins: ['coin', 0.7],
  gold: ['clang', 0.5],
  chest: ['creak', 0.5],
  campfire: ['fire', 0.5],
  server: ['uiclick', 0.5],
  desk: ['uiclick', 0.45],
  atm: ['uiclick', 0.45],
  robot: ['zap', 0.35],
  fountain: ['splash', 0.35],
  bell: ['bell', 0.4],
  money: ['cash', 0.6],
  volcano: ['stone', 0.5],
};
const DIO_BUILDINGS = new Set<string>(DIO_PIECE_GROUPS.buildings);
const DIO_DRIVE = new Set(['car', 'truck', 'van', 'tractor']);
const DIO_PLANTS = new Set<string>(DIO_PIECE_GROUPS.nature);

function dioSfx(beats: StoryBeat[]): SfxEvent[] {
  const ev: SfxEvent[] = [];
  const dug = new Set<string>();
  beats.forEach((b) => {
    const at = (t: number, kind: SfxKind, gain: number, dur?: number): void => {
      if (t < b.dur) ev.push({ t: b.start + t, kind, gain, ...(dur ? { dur } : {}) });
    };
    let k = 0;
    let n = 0;
    for (const th of dioThings(b.visual)) {
      if (th.kind === 'piece') {
        if (th.remove) {
          if (DIO_DRIVE.has(th.name)) at(0.1, 'engine', 0.35);
          else at(0.1, 'whoosh', 0.3, 0.3);
          continue;
        }
        for (let c = 0; c < th.count; c++, k++) {
          if (n >= 4) continue;
          const t = 0.15 + k * 0.14;
          const s = DIO_SOUND[th.name];
          const rise = dioRiseTime(th.name);
          if (DIO_DRIVE.has(th.name)) {
            // Drives in from the edge, then parks.
            at(t, 'engine', 0.35);
            at(t + 1.0, 'cardoor', 0.45);
          } else if (s) at(t + 0.3, s[0], s[1]);
          else if (rise) {
            // Goes up floor by floor.
            at(t + 0.05, 'amb_construction', 0.3, rise);
            at(t + rise, 'thud', 0.45);
          }
          else if (DIO_BUILDINGS.has(th.name)) at(t + 0.35, 'thud', 0.5);
          else if (DIO_PLANTS.has(th.name)) at(t + 0.2, 'swish', 0.3);
          else at(t + 0.3, 'pop', 0.55);
          n++;
        }
      } else if (th.kind === 'under') {
        if (th.remove || dug.has(th.name)) continue;
        dug.add(th.name);
        at(0.05, 'whirr', 0.45, 0.8);
        at(0.75, 'pop', 0.7);
      } else if (th.name === 'mow') {
        for (let t = 0.2; t < b.dur - 0.3; t += 1.1) at(t, 'engine', 0.4);
      } else if (th.name === 'rain' || th.name === 'storm') {
        // The rain itself is the place sound (storyAmbience); a storm adds thunder on each flash.
        if (th.name === 'storm') {
          at(b.dur * 0.35, 'thunder', 0.8);
          at(b.dur * 0.72, 'thunder', 0.7);
        }
      } else if (th.name === 'fire') {
        for (let t = 0.2; t < b.dur - 0.2; t += 1.4) at(t, 'fire', 0.5);
      } else if (th.name === 'flood') {
        at(0.2, 'splash', 0.6);
        at(0.3, 'amb_water', 0.45, b.dur - 0.3);
      } else if (th.name === 'drain') at(0.1, 'amb_water', 0.3, b.dur * 0.8);
      else if (th.name === 'grow') at(0.1, 'swish', 0.35);
      else if (th.name === 'snow') at(0.05, 'whoosh', 0.2, 0.8);
      else if (th.name === 'launch') {
        at(0.3, 'riser', 0.45, 0.9);
        at(1.1, 'boom', 0.7);
        at(1.15, 'whirr', 0.5, Math.min(2.4, b.dur - 1.2));
        at(1.8, 'whoosh', 0.5, 0.8);
      } else if (th.name === 'quake') {
        at(0.1, 'boom', 0.8);
        at(0.15, 'whirr', 0.5, Math.min(2.4, b.dur - 0.3));
        at(0.5, 'stone', 0.6);
        at(1.2, 'thud', 0.5);
      } else if (th.name === 'tornado') {
        at(0.1, 'riser', 0.35, Math.min(2.5, b.dur * 0.6));
        for (let t = 0.4; t < b.dur - 0.4; t += 0.8) at(t, 'whoosh', 0.45, 0.7);
        at(b.dur * 0.5, 'thunder', 0.45);
      } else if (th.name === 'meteor') {
        const hit = Math.min(1.1, b.dur * 0.4);
        at(0.05, 'riser', 0.5, hit);
        at(hit, 'boom', 0.95);
        at(hit + 0.02, 'impact', 0.7);
        at(hit + 0.3, 'stone', 0.5);
      } else if (th.name === 'erupt') {
        at(0.6, 'boom', 0.85);
        at(0.7, 'whirr', 0.45, Math.min(2.5, b.dur - 0.8));
        at(0.9, 'fire', 0.55);
        for (let t = 1.2; t < b.dur - 0.3; t += 0.7) at(t, 'thud', 0.35);
      } else if (th.name === 'tsunami') {
        at(0.1, 'riser', 0.35, 0.6);
        at(0.25, 'whoosh', 0.55, 1.0);
        at(0.5, 'splash', 0.85);
        at(0.6, 'amb_water', 0.5, b.dur - 0.6);
        at(1.4, 'splash', 0.6);
      }
    }
    if (b.tags.some((x) => x.startsWith('age='))) {
      at(0.02, 'riser', 0.4, Math.min(1.4, b.dur * 0.6));
      at(0.05, 'whoosh', 0.3, 0.5);
    }
    if (b.b.trim()) at(1.1, 'tick', 0.45);
  });
  return ev;
}

// ── Places ───────────────────────────────────────────────────────────────────
/** Background sound for each place the reel goes (a loop per stretch), when the reel has places and ambience is on. */
export function storyAmbience(beats: StoryBeat[], f?: Record<string, unknown>): SfxEvent[] {
  if (!f || f.ambience === 'off' || !beats.length) return [];
  const hasPlaces = typeof f.set === 'string' || beats.some((b) => b.tags.some((t) => t.startsWith('set=')));
  if (!hasPlaces) return [];
  const out: SfxEvent[] = [];
  let set = typeof f.set === 'string' ? f.set : '';
  let time = typeof f.time === 'string' ? f.time : '';
  let weather = '';
  let cur: SfxEvent | null = null;
  for (const b of beats) {
    for (const t of b.tags) {
      if (t.startsWith('set=')) set = t.slice(4);
      if (t === 'day' || t === 'dusk' || t === 'night') time = t;
      if (t === 'sky=day' || t === 'sky=dusk' || t === 'sky=night') time = t.slice(4);
      if (t.startsWith('weather=')) weather = t.slice(8);
    }
    const dioRain = f.toon === 'dio' && dioThings(b.visual).some((x) => x.name === 'rain' || x.name === 'storm');
    const rainy = /rain|storm/.test(weather) || b.tags.includes('rain') || dioRain;
    const a = ambienceFor(rainy ? 'rain' : set, weather === 'night' ? 'night' : time);
    const kind = (a === 'room' ? 'roomtone' : a ? `amb_${a}` : '') as SfxKind | '';
    if (cur && cur.kind === kind) {
      cur.dur = b.start + b.dur - cur.t;
      continue;
    }
    if (kind) {
      cur = { t: b.start, kind, dur: b.dur, gain: kind === 'roomtone' ? 0.5 : 0.32 };
      out.push(cur);
    } else cur = null;
  }
  return out;
}
