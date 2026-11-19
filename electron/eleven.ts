// ElevenLabs voices, with the user's own API key.
//
// The key is encrypted with the OS keychain (safeStorage) and only ever leaves
// this process as the xi-api-key header to api.elevenlabs.io. Speech is bought
// only when a reel is rendered to post (previews use the free on-device voice),
// and every request is checked against the user's monthly credit budget first:
// a day that runs ahead of its share drops to the cheaper Flash model, and a
// budget that is spent stops ElevenLabs until the plan resets. A line that
// can't be bought (after retries) stops the render: a reel is never switched
// to the free voice or any other.

import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ElevenModel, ElevenSettings, ElevenStatus, ElevenTtsRequest, ElevenTtsResult, ElevenVoice, LibrarySort, LibraryVoice } from '../shared/types';
import { localDate } from '../shared/warmup';
import { setElevenNames } from '../shared/voice';
import * as store from './store';

const API = 'https://api.elevenlabs.io';
const DAY = 86_400_000;
/** A day may spend this much more than its even share before the hub switches to Flash. */
const DAY_SLACK = 1.5;

let memoryKey = '';
let log: (level: 'info' | 'warn', m: string) => void = () => {};
let sub: { tier: string; used: number; limit: number; resetAt: number; at: number } | null = null;

export function init(d: { log: typeof log }): void {
  log = d.log;
  setElevenNames(settings().voices ?? []);
}

// ── Key ────────────────────────────────────────────────────────────────────
const keyFile = (): string => path.join(app.getPath('userData'), 'eleven-key.bin');

function readKey(): string {
  if (memoryKey) return memoryKey;
  try {
    if (!safeStorage.isEncryptionAvailable()) return '';
    memoryKey = safeStorage.decryptString(fs.readFileSync(keyFile()));
    return memoryKey;
  } catch {
    return '';
  }
}

function writeKey(key: string): void {
  const k = key.trim();
  memoryKey = k;
  sub = null;
  try {
    if (!k) fs.rmSync(keyFile(), { force: true });
    else if (safeStorage.isEncryptionAvailable()) fs.writeFileSync(keyFile(), safeStorage.encryptString(k));
    // No OS encryption: the key stays in memory for this run only, never on disk in the clear.
  } catch (e) {
    log('warn', `eleven: could not store the key: ${(e as Error).message}`);
  }
}

const settings = (): ElevenSettings => store.get().settings.eleven ?? {};
const saveSettings = (patch: Partial<ElevenSettings>): void => void store.updateSettings({ eleven: { ...settings(), ...patch } });

async function api<T>(p: string, init: RequestInit = {}): Promise<T> {
  const key = readKey();
  if (!key) throw new Error('No ElevenLabs API key yet. Add it on the Voices page.');
  const res = await fetch(`${API}${p}`, { ...init, headers: { 'xi-api-key': key, 'content-type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TTS_TIMEOUT_MS) });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const j = (await res.json()) as { detail?: { message?: string; status?: string } | string };
      msg = typeof j.detail === 'string' ? j.detail : (j.detail?.message ?? j.detail?.status ?? msg);
    } catch {
      // not JSON
    }
    if (res.status === 401) msg = `the API key was refused (${msg})`;
    throw Object.assign(new Error(`ElevenLabs: ${msg}`), { status: res.status });
  }
  return (await res.json()) as T;
}

async function subscription(force = false): Promise<NonNullable<typeof sub>> {
  if (sub && !force && Date.now() - sub.at < 5 * 60_000) return sub;
  const s = await api<{ tier: string; character_count: number; character_limit: number; next_character_count_reset_unix: number }>('/v1/user/subscription');
  sub = { tier: s.tier, used: s.character_count, limit: s.character_limit, resetAt: s.next_character_count_reset_unix * 1000, at: Date.now() };
  return sub;
}

/** Credits a line costs on a model (Flash and Turbo bill half a credit per character). */
export const creditsFor = (text: string, model: ElevenModel): number => Math.ceil(text.length * (model === 'eleven_flash_v2_5' ? 0.5 : 1));

/** Budget for this billing cycle, and today's share of what is left. */
function budget(s: NonNullable<typeof sub>): { cap: number; left: number; todaySpent: number; todayAllowance: number } {
  const cfg = settings();
  const cap = Math.min(s.limit, cfg.budget && cfg.budget > 0 ? cfg.budget : s.limit);
  const today = localDate();
  let day = cfg.day;
  if (!day || day.date !== today || day.startUsed > s.used) {
    day = { date: today, startUsed: s.used };
    saveSettings({ day });
  }
  const daysLeft = Math.max(1, Math.ceil((s.resetAt - Date.now()) / DAY));
  return { cap, left: Math.max(0, cap - s.used), todaySpent: s.used - day.startUsed, todayAllowance: Math.max(0, (cap - day.startUsed) / daysLeft) };
}

export async function status(refresh = false): Promise<ElevenStatus> {
  if (!readKey()) return { hasKey: false };
  try {
    const s = await subscription(refresh);
    const b = budget(s);
    return { hasKey: true, tier: s.tier, used: s.used, limit: s.limit, cap: b.cap, resetAt: new Date(s.resetAt).toISOString(), todaySpent: b.todaySpent, todayAllowance: Math.round(b.todayAllowance) };
  } catch (e) {
    return { hasKey: true, error: (e as Error).message };
  }
}

/** The account's voices (its clones first), saved so reels and the AI can name them. */
export async function voices(): Promise<ElevenVoice[]> {
  const r = await api<{ voices: Array<{ voice_id: string; name: string; category?: string; preview_url?: string; labels?: Record<string, string> }> }>('/v2/voices?page_size=100');
  const rank = (c: string): number => (c === 'professional' ? 0 : c === 'cloned' ? 1 : c === 'generated' ? 2 : 3);
  const list: ElevenVoice[] = r.voices
    .map((v) => ({ id: v.voice_id, name: v.name.trim(), category: v.category ?? 'premade', ...(v.preview_url ? { preview: v.preview_url } : {}), ...(v.labels ? { about: [v.labels.gender, v.labels.accent, v.labels.age, v.labels.descriptive ?? v.labels.description, v.labels.use_case].filter(Boolean).join(', ') } : {}) }))
    .sort((a, b) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name));
  saveSettings({ voices: list });
  setElevenNames(list);
  return list;
}

/** The voice id in a Voice Library link (…voice-library?voiceId=…) or a bare id. */
export function libraryVoiceId(input: string): string | null {
  const s = input.trim();
  const m = s.match(/[?&]voiceId=([A-Za-z0-9]{8,40})/) ?? s.match(/^([A-Za-z0-9]{8,40})$/);
  return m ? m[1] : null;
}

type SharedVoice = { voice_id: string; public_owner_id: string; name: string; gender?: string; accent?: string; age?: string; descriptive?: string; use_case?: string; preview_url?: string; usage_character_count_1y?: number; language?: string };

const tidy = (s?: string): string => (s ?? '').replace(/_/g, ' ').trim();

/** The Voice Library's top English voices (sorted by ElevenLabs), for browsing with samples. */
export async function libraryVoices(sort: LibrarySort = 'trending', useCase = ''): Promise<LibraryVoice[]> {
  const q = new URLSearchParams({ page_size: '60', sort, language: 'en', ...(useCase ? { use_cases: useCase } : {}) });
  const r = await api<{ voices: SharedVoice[] }>(`/v1/shared-voices?${q}`);
  return r.voices
    .filter((v) => v.preview_url)
    .map((v) => ({
      id: v.voice_id,
      owner: v.public_owner_id,
      name: v.name.trim(),
      about: [v.gender, v.accent, v.age, v.descriptive].map(tidy).filter(Boolean).join(', '),
      preview: v.preview_url!,
      uses: v.usage_character_count_1y ?? 0,
      useCase: tidy(v.use_case),
    }));
}

/** Add a Voice Library voice to the account (My Voices) so it can be used, then list the voices again. */
export async function addLibraryVoice(input: string, nameHint = '', owner = ''): Promise<ElevenVoice> {
  const id = libraryVoiceId(input);
  if (!id) throw new Error('Paste a Voice Library link (it has ?voiceId= in it) or a voice id.');
  const have = (settings().voices ?? []).find((v) => v.id === id) ?? (await voices()).find((v) => v.id === id);
  if (have) return have;
  // The add call needs the voice's public owner, which only the library search gives.
  const find = async (search: string): Promise<SharedVoice | undefined> => {
    if (!search.trim()) return undefined;
    const r = await api<{ voices: SharedVoice[] }>(`/v1/shared-voices?page_size=100&search=${encodeURIComponent(search.trim())}`);
    return r.voices.find((v) => v.voice_id === id);
  };
  const shared = owner && /^[A-Za-z0-9]{8,80}$/.test(owner) ? { voice_id: id, public_owner_id: owner, name: nameHint || id } : ((await find(id)) ?? (await find(nameHint)));
  if (!shared) throw new Error(`Could not find voice ${id} in the Voice Library${nameHint ? ` (searched "${nameHint}" too)` : ''}. Type its name next to the link, or press "Add to My Voices" on its ElevenLabs page and reload the list.`);
  try {
    await api(`/v1/voices/add/${shared.public_owner_id}/${shared.voice_id}`, { method: 'POST', body: JSON.stringify({ new_name: shared.name }) });
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 401 || status === 403) throw new Error(`${(e as Error).message}. The API key may not be allowed to add voices: give it Voices (write) access, or press "Add to My Voices" on the voice's ElevenLabs page and reload the list.`);
    throw e;
  }
  log('info', `eleven: added library voice ${shared.name} (${id})`);
  const added = (await voices()).find((v) => v.id === id);
  if (!added) throw new Error('ElevenLabs accepted the voice but it is not in the list yet. Reload the list in a minute.');
  return added;
}

export async function setKey(key: string): Promise<ElevenStatus> {
  writeKey(key);
  if (!key.trim()) {
    saveSettings({ voices: [] });
    setElevenNames([]);
    return { hasKey: false };
  }
  const st = await status(true);
  if (st.error) {
    writeKey('');
    throw new Error(st.error);
  }
  await voices().catch((e) => log('warn', `eleven: listing voices failed: ${(e as Error).message}`));
  return st;
}

/** Tries per line, the waits between them, and how long one request may take. */
const TTS_ATTEMPTS = 4;
const TTS_BACKOFF_MS = [3_000, 10_000, 20_000];
/** A line normally comes back in about a second; four stuck tries plus the waits stay under 4 minutes. */
const TTS_TIMEOUT_MS = 45_000;

/** Worth trying again: timeouts, network drops, rate limits and server errors (not a refused key or a bad request). */
function transient(e: unknown): boolean {
  const status = (e as { status?: number }).status;
  if (typeof status === 'number') return status === 408 || status === 409 || status === 429 || status >= 500;
  return /timeout|timed out|aborted|fetch failed|network|socket|ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/i.test(`${(e as Error)?.name ?? ''} ${(e as Error)?.message ?? ''}`);
}

/** One line of speech. Refuses when the budget can't cover it; the render then stops (a reel never switches voice). */
export async function tts(req: ElevenTtsRequest): Promise<ElevenTtsResult> {
  const text = req.text.trim();
  if (!text) throw new Error('Nothing to say.');
  if (!/^[A-Za-z0-9]{8,40}$/.test(req.voice)) throw new Error(`Bad ElevenLabs voice id "${req.voice}".`);
  const s = await subscription().catch(async (e) => {
    if (!transient(e)) throw e;
    await new Promise((r) => setTimeout(r, 3_000));
    return subscription(true);
  });
  const b = budget(s);
  let model: ElevenModel = settings().model ?? 'eleven_multilingual_v2';
  let note = '';
  if (model !== 'eleven_flash_v2_5' && b.todaySpent + creditsFor(text, model) > b.todayAllowance * DAY_SLACK) {
    model = 'eleven_flash_v2_5';
    note = "today's share of the ElevenLabs budget is used up, so this line used the cheaper Flash model";
  }
  const cost = creditsFor(text, model);
  if (cost > b.left) throw new Error(`The ElevenLabs budget for this month is used up (${s.used.toLocaleString()} of ${b.cap.toLocaleString()} credits; it resets ${new Date(s.resetAt).toLocaleDateString()}).`);

  const v3 = model === 'eleven_v3';
  const body = {
    text,
    model_id: model,
    // v3 only takes stability 0 / 0.5 / 1 and no context; the others read the neighbouring lines so each one flows into the next.
    voice_settings: v3 ? { stability: 0.5 } : { stability: 0.45, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: Math.min(1.2, Math.max(0.7, req.speed)) },
    ...(!v3 && req.prev ? { previous_text: req.prev.slice(-300) } : {}),
    ...(!v3 && req.next ? { next_text: req.next.slice(0, 300) } : {}),
  };
  const q = `?output_format=mp3_44100_128`;
  let audio: Uint8Array = new Uint8Array();
  let alignment: ElevenTtsResult['alignment'];
  // A timeout, a dropped connection, "busy" (429) or a server error is usually gone a few seconds later: try again
  // before giving up, since a line that can't be bought holds the whole reel.
  for (let attempt = 1; ; attempt++) {
    try {
      try {
        const r = await api<{ audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } }>(`/v1/text-to-speech/${req.voice}/with-timestamps${q}`, { method: 'POST', body: JSON.stringify(body) });
        audio = new Uint8Array(Buffer.from(r.audio_base64, 'base64'));
        if (r.alignment) alignment = { chars: r.alignment.characters, starts: r.alignment.character_start_times_seconds, ends: r.alignment.character_end_times_seconds };
      } catch (e) {
        // A model without timings: plain audio.
        if ((e as { status?: number }).status !== 400 && (e as { status?: number }).status !== 422) throw e;
        const key = readKey();
        const res = await fetch(`${API}/v1/text-to-speech/${req.voice}${q}`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(TTS_TIMEOUT_MS) });
        if (!res.ok) throw Object.assign(new Error(`ElevenLabs: ${res.status} ${(await res.text()).slice(0, 200)}`), { status: res.status });
        audio = new Uint8Array(await res.arrayBuffer());
      }
      break;
    } catch (e) {
      if (attempt >= TTS_ATTEMPTS || !transient(e)) throw e;
      const wait = TTS_BACKOFF_MS[attempt - 1] ?? 15_000;
      log('warn', `eleven: line "${text.slice(0, 40)}" failed (${(e as Error).message}), try ${attempt + 1} of ${TTS_ATTEMPTS} in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  if (sub) sub = { ...sub, used: sub.used + cost };
  log('info', `eleven: ${model} ${cost} credits for "${text.slice(0, 40)}"`);
  return { audio, alignment, model, credits: cost, ...(note ? { note } : {}) };
}
