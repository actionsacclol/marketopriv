import { app, net } from 'electron';
import type { UpdateInfo } from '../shared/types';

// The hub never updates itself. Twice a day it reads one small file from krypt.cc and, when a newer version is
// out, says so (the sidebar, and get_overview for the AI) with the page to download it from. The request carries
// nothing about the user or the install.

/** { "version": "0.2", "url": "https://krypt.cc/tools", "notes": "one line" } */
export const VERSION_URL = 'https://krypt.cc/marketo/version.json';
const DOWNLOAD_PAGE = 'https://krypt.cc/tools';
const EVERY_MS = 12 * 3_600_000;

/** 0.1.0 reads as 0.1. */
export const shortVersion = (v: string): string => {
  const p = v.split('.');
  return p.length === 3 && p[2] === '0' ? `${p[0]}.${p[1]}` : v;
};

const parts = (v: string): number[] => v.split('.').map((x) => Number.parseInt(x, 10) || 0);

export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

let found: { version: string; url: string; notes?: string } | null = null;
let checkedAt: string | undefined;

export function updateInfo(): UpdateInfo {
  const current = shortVersion(app.getVersion());
  return found ? { current, latest: shortVersion(found.version), url: found.url, notes: found.notes, checkedAt } : { current, checkedAt };
}

async function check(log: (level: 'info' | 'warn' | 'error', msg: string) => void): Promise<void> {
  try {
    const res = await net.fetch(VERSION_URL, { signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    checkedAt = new Date().toISOString();
    if (!res.ok) return;
    const j = (await res.json()) as { version?: unknown; url?: unknown; notes?: unknown };
    const version = typeof j.version === 'string' && /^\d+(\.\d+){0,3}$/.test(j.version.trim()) ? j.version.trim() : null;
    if (!version) return;
    // Only a page on krypt.cc is ever opened from here.
    const url = typeof j.url === 'string' && /^https:\/\/krypt\.cc\//.test(j.url) ? j.url : DOWNLOAD_PAGE;
    const notes = typeof j.notes === 'string' ? j.notes.replace(/[\x00-\x1f]+/g, ' ').trim().slice(0, 160) || undefined : undefined;
    const before = found?.version;
    found = isNewer(version, app.getVersion()) ? { version, url, notes } : null;
    if (found && found.version !== before) log('info', `Krypt Marketo ${shortVersion(found.version)} is out (this is ${shortVersion(app.getVersion())}): ${found.url}`);
  } catch {
    // Offline, or the file is not there: nothing to say.
  }
}

export function startUpdateCheck(log: (level: 'info' | 'warn' | 'error', msg: string) => void): void {
  setTimeout(() => void check(log), 15_000);
  setInterval(() => void check(log), EVERY_MS);
}
