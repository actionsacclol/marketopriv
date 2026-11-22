import type { Fields } from './types';
import { hashKey } from './hash';
import { pronounceSig } from './pronounce';

export { hashKey };

// Kokoro-82M v1.0 English voices (a = US, b = UK). Same list as Krypt Editor.
export const VOICES: Array<[id: string, name: string, about: string]> = [
  ['am_michael', 'Michael', 'US male, narrator'],
  ['am_onyx', 'Onyx', 'US male, low'],
  ['am_fenrir', 'Fenrir', 'US male, deep'],
  ['am_puck', 'Puck', 'US male, lively'],
  ['am_echo', 'Echo', 'US male'],
  ['am_eric', 'Eric', 'US male'],
  ['am_liam', 'Liam', 'US male'],
  ['am_adam', 'Adam', 'US male'],
  ['af_heart', 'Heart', 'US female, warm'],
  ['af_bella', 'Bella', 'US female, bright'],
  ['af_nicole', 'Nicole', 'US female, soft'],
  ['af_sarah', 'Sarah', 'US female'],
  ['af_nova', 'Nova', 'US female'],
  ['af_sky', 'Sky', 'US female'],
  ['af_jessica', 'Jessica', 'US female'],
  ['af_river', 'River', 'US female'],
  ['af_aoede', 'Aoede', 'US female'],
  ['af_kore', 'Kore', 'US female'],
  ['af_alloy', 'Alloy', 'US female'],
  ['bm_george', 'George', 'UK male'],
  ['bm_daniel', 'Daniel', 'UK male'],
  ['bm_lewis', 'Lewis', 'UK male'],
  ['bm_fable', 'Fable', 'UK male'],
  ['bf_emma', 'Emma', 'UK female'],
  ['bf_isabella', 'Isabella', 'UK female'],
  ['bf_alice', 'Alice', 'UK female'],
  ['bf_lily', 'Lily', 'UK female'],
];

export const VOICE_IDS = VOICES.map((v) => v[0]);

// ── ElevenLabs voices ("el:<voice id>") ─────────────────────────────────────
export const isEleven = (v: string): boolean => /^el:[A-Za-z0-9]{8,40}$/.test(v);
/** Where someone without an ElevenLabs account signs up: Krypt's affiliate link. Always shown or said with a note that it is one. */
export const ELEVEN_SIGNUP_URL = 'https://try.elevenlabs.io/3sz5hcqz96uf';
export const ELEVEN_KEYS_URL = 'https://elevenlabs.io/app/settings/api-keys';
export const ELEVEN_AFFILIATE_NOTE = 'Krypt may earn a commission if you sign up through it';
/** ElevenLabs takes 0.7..1.2 (1 = the voice's natural pace). */
export const ELEVEN_SPEED = { min: 0.7, max: 1.2 } as const;
const elNames = new Map<string, string>();
/** The account's voices by id, so names read well and the AI can pick one by name (set from settings). */
export function setElevenNames(list: Array<{ id: string; name: string }>): void {
  elNames.clear();
  for (const v of list) elNames.set(v.id, v.name);
}

/** The ones to try first on the Voices page: the clearest of each kind. */
export const FEATURED_VOICES = ['am_michael', 'am_fenrir', 'am_puck', 'af_heart', 'af_bella', 'af_nicole', 'bm_george', 'bf_emma'];

/** "onyx", "Onyx", "am_onyx" → "am_onyx"; unknown → null. */
export function voiceId(name: string): string | null {
  const raw = name.trim();
  const k = raw.toLowerCase();
  if (!k) return null;
  if (isEleven(raw)) return raw;
  const kokoro = VOICES.find(([id, n]) => id === k || n.toLowerCase() === k)?.[0];
  if (kokoro) return kokoro;
  for (const [id, n] of elNames) if (n.toLowerCase() === k || id === raw || n.toLowerCase().split(/\s+-\s+/)[0] === k) return `el:${id}`;
  return null;
}

export const voiceName = (id: string): string => (isEleven(id) ? `${elNames.get(id.slice(3)) ?? 'ElevenLabs voice'} (ElevenLabs)` : (VOICES.find((v) => v[0] === id)?.[1] ?? id));

// ── A tuned voice ──────────────────────────────────────────────────────────
/** A built-in voice plus the user's tuning. Reels carry it as their voice_* fields. */
export interface VoiceTune {
  /** Kokoro voice id. */
  voice: string;
  /** A second voice mixed in ('' = none). */
  blend: string;
  /** Share of the second voice, 0..0.9. */
  blendAmount: number;
  /** 0.7..1.5 (1 = the model's natural pace). */
  speed: number;
  /** Semitones, -3..+3: lower is deeper. */
  pitch: number;
  /** Low end, dB (-6..+6). */
  warmth: number;
  /** High end, dB (-6..+6). */
  clarity: number;
}

/** A tuning the user named on the Voices page; a reel's voice field accepts the name. */
export interface SavedVoice extends VoiceTune {
  id: string;
  name: string;
}

export const DEFAULT_TUNE: VoiceTune = { voice: 'am_michael', blend: '', blendAmount: 0, speed: 1.2, pitch: 0, warmth: 0, clarity: 0 };

export const TUNE_RANGE = {
  speed: { min: 0.7, max: 1.5, step: 0.05 },
  blendAmount: { min: 0, max: 0.9, step: 0.05 },
  pitch: { min: -3, max: 3, step: 0.25 },
  warmth: { min: -6, max: 6, step: 0.5 },
  clarity: { min: -6, max: 6, step: 0.5 },
} as const;

const clampTo = (v: unknown, r: { min: number; max: number }, d: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(r.max, Math.max(r.min, Math.round(n * 1000) / 1000)) : d;
};

/** Any object with tune-like values → a valid tune. */
export function cleanTune(t: Partial<VoiceTune> | undefined): VoiceTune {
  const voice = voiceId(String(t?.voice ?? '')) ?? DEFAULT_TUNE.voice;
  const el = isEleven(voice);
  const second = el ? null : voiceId(String(t?.blend ?? ''));
  const amount = clampTo(t?.blendAmount, TUNE_RANGE.blendAmount, 0);
  const on = !!second && !isEleven(second) && second !== voice && amount > 0;
  return {
    voice,
    blend: on ? second! : '',
    blendAmount: on ? amount : 0,
    // ElevenLabs: its own speed range, and no pitch shifting (the voice is the voice).
    speed: el ? clampTo(t?.speed, ELEVEN_SPEED, 1) : clampTo(t?.speed, TUNE_RANGE.speed, DEFAULT_TUNE.speed),
    pitch: el ? 0 : clampTo(t?.pitch, TUNE_RANGE.pitch, 0),
    warmth: clampTo(t?.warmth, TUNE_RANGE.warmth, 0),
    clarity: clampTo(t?.clarity, TUNE_RANGE.clarity, 0),
  };
}

/** The voice a story reel's fields ask for. */
export function tuneFromFields(f: Fields): VoiceTune {
  return cleanTune({ voice: String(f.voice ?? ''), blend: String(f.voice_blend ?? ''), blendAmount: Number(f.voice_blend_amount ?? 0), speed: Number(f.voice_speed ?? DEFAULT_TUNE.speed), pitch: Number(f.voice_pitch ?? 0), warmth: Number(f.voice_warmth ?? 0), clarity: Number(f.voice_clarity ?? 0) });
}

/** A tune as story reel fields. */
export function tuneToFields(t: VoiceTune): Fields {
  const c = cleanTune(t);
  return { voice: c.voice, voice_blend: c.blend || 'none', voice_blend_amount: c.blendAmount, voice_speed: c.speed, voice_pitch: c.pitch, voice_warmth: c.warmth, voice_clarity: c.clarity };
}

const signed = (n: number): string => `${n > 0 ? '+' : '−'}${Math.abs(n)}`;

/** "Michael + 30% Onyx · 1.1× · pitch −1 · warmth +2" */
export function describeTune(t: VoiceTune): string {
  const c = cleanTune(t);
  return [`${voiceName(c.voice)}${c.blend ? ` + ${Math.round(c.blendAmount * 100)}% ${voiceName(c.blend)}` : ''}`, `${c.speed}×`, c.pitch ? `pitch ${signed(c.pitch)}` : '', c.warmth ? `warmth ${signed(c.warmth)}` : '', c.clarity ? `clarity ${signed(c.clarity)}` : ''].filter(Boolean).join(' · ');
}

/**
 * Cache key of one spoken line. A plain voice reading a line as written keeps
 * the key it always had (voice + speed + text), so clips made before tuning
 * existed are still found; tuning and pronunciation fixes add to it.
 */
export function clipKey(t: VoiceTune, speed: number, say: string): string {
  const extra = [t.blend && t.blendAmount > 0 ? `b=${t.blend}:${t.blendAmount}` : '', t.pitch ? `p=${t.pitch}` : '', t.warmth ? `w=${t.warmth}` : '', t.clarity ? `c=${t.clarity}` : '', pronounceSig(say) ? `x=${pronounceSig(say)}` : ''].filter(Boolean).join(';');
  return hashKey(`${t.voice}|${speed}|${say}${extra ? `|${extra}` : ''}`);
}

/** The voice cache field: generated clips by key, and the mixed track for the current timing. */
export interface VoiceCache {
  /** words = when each spoken word starts in the clip (ElevenLabs lines, from its timings). */
  clips: Record<string, { file: string; dur: number; words?: number[] }>;
  track?: string;
  sig?: string;
}

export function readVoiceCache(raw: unknown): VoiceCache {
  try {
    const v = JSON.parse(String(raw ?? '')) as VoiceCache;
    if (v && typeof v === 'object' && v.clips && typeof v.clips === 'object') return v;
  } catch {
    // empty or hand-edited
  }
  return { clips: {} };
}
