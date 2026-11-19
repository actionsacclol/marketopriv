import { app, net } from 'electron';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { WhisperStatus } from '../shared/types';
import { WHISPER_BYTES, WHISPER_FILES, WHISPER_MARKER } from './whisperFiles';

// Speech to text for stream clips: the on-device Whisper model, downloaded
// on first use into <userData>/models/whisper the same way as the Kokoro
// voice (electron/voice.ts): a fixed file list, every file SHA-256 checked,
// written as .part and renamed. The renderer runs it (src/render/transcribe)
// and reads the files through the media protocol (electron/media.ts).

export const whisperDir = (): string => path.join(app.getPath('userData'), 'models', 'whisper');

const sizeOf = (p: string): number => {
  try {
    return fs.statSync(p).size;
  } catch {
    return -1;
  }
};

/** Installed = every file there at its full size (a size check, not a re-hash: they were hashed on the way in). */
const installed = (): boolean => WHISPER_FILES.every((f) => sizeOf(path.join(whisperDir(), f.name)) === f.bytes);

let installing = false;
let done = 0;
let lastError: string | null = null;
let notify: (s: WhisperStatus) => void = () => {};

export function onStatus(cb: (s: WhisperStatus) => void): void {
  notify = cb;
}

export const status = (): WhisperStatus => {
  const ok = installed();
  return { installed: ok, installing, done, total: WHISPER_BYTES, error: lastError, dir: ok ? whisperDir() : null };
};

async function fetchFile(f: (typeof WHISPER_FILES)[number], dest: string): Promise<void> {
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

/** Download the speech-to-text model (about 137 MB). Files already in place are kept, so a broken download resumes per file. */
export async function install(): Promise<void> {
  if (installing || installed()) return;
  installing = true;
  lastError = null;
  done = 0;
  notify(status());
  try {
    await fs.promises.mkdir(whisperDir(), { recursive: true });
    const order = [...WHISPER_FILES].sort((a, b) => Number(a.name === WHISPER_MARKER) - Number(b.name === WHISPER_MARKER));
    for (const f of order) {
      const dest = path.join(whisperDir(), f.name);
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
