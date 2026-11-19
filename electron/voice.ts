import { app, net } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { VoiceStatus } from '../shared/types';
import { KOKORO_BYTES, KOKORO_FILES } from './kokoroFiles';
import * as profiles from './profiles';

// Voice-over: the on-device Kokoro-82M model. Krypt Editor and Krypt Studio
// install the same files under <appData>/<app>/models/kokoro, so a copy from
// either is used as it is; otherwise the hub downloads its own (Setup page)
// into <userData>/models/kokoro, checking every file's SHA-256. Generated
// clips live in <userData>/voice.

const ownDir = (): string => path.join(app.getPath('userData'), 'models', 'kokoro');
const CANDIDATES = (): string[] => [ownDir(), ...['Krypt Editor', 'Krypt Studio'].map((a) => path.join(app.getPath('appData'), a, 'models', 'kokoro'))];

export interface VoiceModel {
  dir: string | null;
  voices: string[];
}

export function model(): VoiceModel {
  for (const dir of CANDIDATES()) {
    try {
      const files = fs.readdirSync(dir);
      if (!files.includes('model.onnx')) continue;
      return { dir, voices: files.filter((f) => f.endsWith('.bin')).map((f) => f.slice(0, -4)) };
    } catch {
      // not installed there
    }
  }
  return { dir: null, voices: [] };
}

/** Model files may be served to the renderer only from these folders. */
export const modelDirs = (): string[] => CANDIDATES();

// ── Download ───────────────────────────────────────────────────────────────
let installing = false;
let done = 0;
let lastError: string | null = null;
let notify: (s: VoiceStatus) => void = () => {};

export function onStatus(cb: (s: VoiceStatus) => void): void {
  notify = cb;
}

export const status = (): VoiceStatus => ({ installed: model().dir !== null, installing, done, total: KOKORO_BYTES, error: lastError });

const sizeOf = (p: string): number => {
  try {
    return fs.statSync(p).size;
  } catch {
    return -1;
  }
};

async function fetchFile(f: (typeof KOKORO_FILES)[number], dest: string): Promise<void> {
  const res = await net.fetch(f.url);
  if (!res.ok || !res.body) throw new Error(`${f.name}: the download server answered ${res.status}`);
  const part = `${dest}.part`;
  const out = fs.createWriteStream(part);
  const hash = createHash('sha256');
  const reader = res.body.getReader();
  let lastTick = 0;
  try {
    for (;;) {
      const { done: end, value } = await reader.read();
      if (end) break;
      hash.update(value);
      done += value.byteLength;
      if (!out.write(value)) await new Promise<void>((r) => out.once('drain', () => r()));
      if (Date.now() - lastTick > 300) {
        lastTick = Date.now();
        notify(status());
      }
    }
  } finally {
    await new Promise<void>((r) => out.end(() => r()));
  }
  if (hash.digest('hex') !== f.sha256) {
    fs.rmSync(part, { force: true });
    throw new Error(`${f.name} did not match its checksum. Try again.`);
  }
  fs.renameSync(part, dest);
}

/** Download the voice model (about 340 MB). The model file goes last, so "installed" means every voice is there too. */
export async function install(): Promise<void> {
  if (installing || model().dir) return;
  installing = true;
  lastError = null;
  done = 0;
  notify(status());
  try {
    await fs.promises.mkdir(ownDir(), { recursive: true });
    const order = [...KOKORO_FILES].sort((a, b) => Number(a.name === 'model.onnx') - Number(b.name === 'model.onnx'));
    for (const f of order) {
      const dest = path.join(ownDir(), f.name);
      if (sizeOf(dest) === f.bytes) {
        done += f.bytes;
        continue;
      }
      await fetchFile(f, dest);
    }
  } catch (e) {
    lastError = (e as Error).message;
  } finally {
    installing = false;
    notify(status());
  }
}

// ── Generated clips ────────────────────────────────────────────────────────
/** Per profile: clearing unused clips looks only at the open profile's reels, so another profile's narration must not sit in the same folder. */
export const voiceDir = (): string => path.join(profiles.dir(), 'voice');

/** Write a generated clip (WAV) into the voice folder; returns its path. */
export async function save(name: string, data: Uint8Array): Promise<string> {
  if (!/^[a-z0-9_-]{1,80}\.wav$/i.test(name)) throw new Error(`Bad voice file name "${name}".`);
  await fs.promises.mkdir(voiceDir(), { recursive: true });
  const file = path.join(voiceDir(), name);
  const tmp = `${file}.part`;
  await fs.promises.writeFile(tmp, data);
  await fs.promises.rename(tmp, file);
  return file;
}

/**
 * Delete generated clips no reel uses any more (deleted reels, rewritten lines,
 * clips made just to listen on the Voices page). Recent files are left alone:
 * a reel being narrated right now has clips on disk that it has not saved yet.
 */
export async function prune(keep: Set<string>, olderThanMs = 15 * 60_000): Promise<number> {
  let removed = 0;
  let names: string[] = [];
  try {
    names = await fs.promises.readdir(voiceDir());
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!/\.(wav|part)$/i.test(name) || keep.has(name.toLowerCase())) continue;
    const file = path.join(voiceDir(), name);
    try {
      if (Date.now() - (await fs.promises.stat(file)).mtimeMs < olderThanMs) continue;
      await fs.promises.unlink(file);
      removed++;
    } catch {
      // in use or already gone
    }
  }
  return removed;
}

export const exists = (name: string): string | null => {
  const file = path.join(voiceDir(), name);
  return /^[a-z0-9_-]{1,80}\.wav$/i.test(name) && fs.existsSync(file) ? file : null;
};
