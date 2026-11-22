// Secrets on disk (the AI and ElevenLabs API keys, proxy passwords), encrypted by the OS through Electron's async
// safeStorage. Electron 45 deprecates the old sync calls; the async ones write the same "v10" blobs and read the
// old ones (checked both ways), so keys saved by older builds keep working.

import { safeStorage } from 'electron';
import fs from 'node:fs';

let available = false;

/** Once, after app ready and before anything reads a secret. */
export async function init(): Promise<void> {
  try {
    available = await safeStorage.isAsyncEncryptionAvailable();
  } catch {
    available = false;
  }
}

/** False when the OS has no encryption to offer: secrets then stay in memory only, never on disk in the clear. */
export const canEncrypt = (): boolean => available;

const mtimeOf = (file: string): number => {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return -1;
  }
};

/** The secret in a file, or '' when there is none or it can't be read. */
export async function read(file: string): Promise<string> {
  if (!available || !fs.existsSync(file)) return '';
  try {
    return (await safeStorage.decryptStringAsync(await fs.promises.readFile(file))).result;
  } catch {
    return '';
  }
}

const queues = new Map<string, Promise<boolean>>();

/** Encrypt and save (empty text deletes the file); writes to one file run in order. False when the OS can't encrypt. */
export function write(file: string, text: string): Promise<boolean> {
  const run = async (): Promise<boolean> => {
    if (!text) {
      await fs.promises.rm(file, { force: true });
      return true;
    }
    if (!available) return false;
    const blob = await safeStorage.encryptStringAsync(text);
    const tmp = `${file}.tmp-${process.pid}`;
    await fs.promises.writeFile(tmp, blob);
    await fs.promises.rename(tmp, file);
    return true;
  };
  const next = (queues.get(file) ?? Promise.resolve(true)).catch(() => true).then(run);
  queues.set(file, next);
  return next;
}

/** One secret file that other windows may change too: read at start, then again whenever the file changes. */
export class SecretFile {
  private value = '';
  private seen = -2;
  private memoryOnly = false;
  private loading: Promise<void> | null = null;

  constructor(private readonly file: () => string) {}

  /** Read it (again, if the file changed since). */
  async load(): Promise<string> {
    if (this.memoryOnly) return this.value;
    const m = mtimeOf(this.file());
    if (m === this.seen) return this.value;
    if (!this.loading) {
      this.loading = (async () => {
        const v = await read(this.file());
        if (this.memoryOnly) return;
        this.value = v;
        this.seen = m;
      })().finally(() => {
        this.loading = null;
      });
    }
    await this.loading;
    return this.value;
  }

  /** The value now; when the file changed (another window saved a new one), it is read again in the background. */
  get(): string {
    if (!this.memoryOnly && mtimeOf(this.file()) !== this.seen) void this.load();
    return this.value;
  }

  /** Keep a new value: in memory at once, on disk encrypted (or in memory only when the OS can't encrypt). */
  async set(text: string): Promise<void> {
    this.value = text;
    this.memoryOnly = !!text && !available;
    if (!(await write(this.file(), text))) return;
    this.seen = mtimeOf(this.file());
  }
}
