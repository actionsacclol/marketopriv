import fs from 'node:fs';

// Small helpers for the JSON files the hub keeps (its data, the profile list, the usage ledger, the instance list).
// On Windows an antivirus, backup or sync tool can hold a freshly written file for a moment, Notepad and PowerShell
// save with a BOM, and a power cut can leave a half-written file: these read through all three and write so that the
// file in place is always a whole one.

const HELD = new Set(['EBUSY', 'EPERM', 'EACCES']);
/** The file is held by another program for now (worth another try in a moment). */
export const isHeld = (e: unknown): boolean => HELD.has((e as NodeJS.ErrnoException | null)?.code ?? '');
export const errCode = (e: unknown): string => (e as NodeJS.ErrnoException | null)?.code ?? '';

const pause = new Int32Array(new SharedArrayBuffer(4));
/** Wait on this thread (only on the rare retry paths, a second or so at most). */
export function sleepSync(ms: number): void {
  Atomics.wait(pause, 0, 0, ms);
}

/** The waits between tries while a file is held: about 1.5 s in all. */
export const HELD_WAITS = [50, 100, 200, 400, 800];

/** Run fn again while the file it works on is held by another program. */
export function retrySync<T>(fn: () => T, waits: number[] = HELD_WAITS): T {
  for (let i = 0; ; i++) {
    try {
      return fn();
    } catch (e) {
      if (i >= waits.length || !isHeld(e)) throw e;
      sleepSync(waits[i]);
    }
  }
}

export const stripBom = (s: string): string => (s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

/** A text file as text, through a BOM and a short hold. */
export function readText(file: string): string {
  return stripBom(retrySync(() => fs.readFileSync(file, 'utf8')));
}

/** Write the text and make sure it is on the disk (not only in the OS's cache) before anything renames it into place. */
export function writeDurable(file: string, text: string): void {
  const fd = fs.openSync(file, 'w');
  try {
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

/** Write a file whole: a temp file first, flushed to the disk, then renamed over the old one (retried while it is held). */
export function writeAtomic(file: string, text: string, tmp = `${file}.tmp-${process.pid}`): void {
  writeDurable(tmp, text);
  try {
    retrySync(() => fs.renameSync(tmp, file));
  } catch (e) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* left for the next write to replace */
    }
    throw e;
  }
}
