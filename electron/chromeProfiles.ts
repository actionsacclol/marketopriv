import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CHROME_EXT_IDS } from '../shared/chromeExt';

// The user's own Chrome profiles, as Chrome lists them in its profile picker:
// the folder ("Default", "Profile 2"), the name and the Google account email.
// Read from Chrome's "Local State" file on this computer, for the picker on
// the Setup page. Nothing here leaves the computer, and the emails are shown
// in the hub window only: never to a connected AI, never in the log.

export interface LocalChrome {
  /** Its folder under Chrome's data folder; what --profile-directory takes. */
  dir: string;
  name: string;
  /** The Google account signed in to that Chrome profile, partly hidden ("sk***ow@gmail.com"; '' when none). */
  email: string;
  /** The Krypt Marketo extension is added there. */
  hasExtension: boolean;
}

/**
 * An email with the middle of its name hidden: enough to tell two Chrome profiles apart, not enough to read off a
 * screen share or a screenshot. The full address is dropped here and goes no further.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email ? '***' : '';
  const name = email.slice(0, at);
  const shown = name.length >= 5 ? `${name.slice(0, 2)}***${name.slice(-2)}` : name.length >= 3 ? `${name[0]}***${name[name.length - 1]}` : `${name[0]}***`;
  return `${shown}${email.slice(at)}`;
}

/** Google Chrome's data folder for this user. */
export function userDataDir(): string | null {
  const dir =
    process.platform === 'win32'
      ? process.env.LOCALAPPDATA
        ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
        : null
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome')
        : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'google-chrome');
  return dir && fs.existsSync(path.join(dir, 'Local State')) ? dir : null;
}

const DIR = /^(Default|Profile \d{1,4})$/;
let cache: { at: number; list: LocalChrome[] } | null = null;

function hasExtension(profileDir: string): boolean {
  // An unpacked extension is recorded in "Secure Preferences"; a store one can be in either file.
  for (const f of ['Secure Preferences', 'Preferences']) {
    try {
      const text = fs.readFileSync(path.join(profileDir, f), 'utf8');
      if (CHROME_EXT_IDS.some((id) => text.includes(`"${id}"`))) return true;
    } catch {
      /* no such file in that profile */
    }
  }
  return false;
}

/** Every Chrome profile on this computer, "Default" first. Read again at most every 10 seconds. */
export function list(fresh = false): LocalChrome[] {
  if (!fresh && cache && Date.now() - cache.at < 10_000) return cache.list;
  const root = userDataDir();
  let out: LocalChrome[] = [];
  if (root) {
    try {
      const state = JSON.parse(fs.readFileSync(path.join(root, 'Local State'), 'utf8')) as { profile?: { info_cache?: Record<string, { name?: unknown; user_name?: unknown }> } };
      out = Object.entries(state.profile?.info_cache ?? {})
        .filter(([dir]) => DIR.test(dir) && fs.existsSync(path.join(root, dir)))
        .map(([dir, p]) => ({
          dir,
          name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 60) : dir,
          email: typeof p.user_name === 'string' ? maskEmail(p.user_name.trim().slice(0, 120)) : '',
          hasExtension: hasExtension(path.join(root, dir)),
        }))
        .sort((a, b) => Number(b.dir === 'Default') - Number(a.dir === 'Default') || (parseInt(a.dir.slice(8), 10) || 0) - (parseInt(b.dir.slice(8), 10) || 0));
    } catch {
      /* Chrome is rewriting the file, or it is not there: an empty list this time */
    }
  }
  cache = { at: Date.now(), list: out };
  return out;
}

export const find = (dir: string | undefined): LocalChrome | undefined => (dir ? list().find((p) => p.dir === dir) : undefined);

// ── Which Chrome profile a connected extension is in ───────────────────────
// The extension (0.8+) keeps a random id in its own storage, and Chrome writes
// that storage inside the profile's folder. Finding the id there tells the hub
// which Chrome profile a connection belongs to.
const dirByKey = new Map<string, string>();
const missAt = new Map<string, number>();

export function dirOfKey(key: string | undefined): string | null {
  if (!key || !/^[a-f0-9]{32}$/.test(key)) return null;
  const known = dirByKey.get(key);
  if (known) return known;
  if (Date.now() - (missAt.get(key) ?? 0) < 8000) return null;
  const root = userDataDir();
  const needle = Buffer.from(key, 'ascii');
  if (root) {
    for (const p of list()) {
      for (const id of CHROME_EXT_IDS) {
        const store = path.join(root, p.dir, 'Local Extension Settings', id);
        let files: string[] = [];
        try {
          files = fs.readdirSync(store).filter((f) => /\.(log|ldb)$/i.test(f));
        } catch {
          continue;
        }
        for (const f of files) {
          try {
            const st = fs.statSync(path.join(store, f));
            if (st.size > 8 * 1024 * 1024) continue;
            if (fs.readFileSync(path.join(store, f)).includes(needle)) {
              dirByKey.set(key, p.dir);
              return p.dir;
            }
          } catch {
            /* Chrome is compacting that file; the next look finds it */
          }
        }
      }
    }
  }
  missAt.set(key, Date.now());
  return null;
}

// ── Opening a Chrome profile ───────────────────────────────────────────────
function chromeExe(): string | null {
  const candidates =
    process.platform === 'win32'
      ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((x): x is string => !!x).map((b) => path.join(b, 'Google', 'Chrome', 'Application', 'chrome.exe'))
      : process.platform === 'darwin'
        ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', path.join(os.homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')]
        : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/opt/google/chrome/chrome'];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

const launchedAt = new Map<string, number>();
/** When that Chrome profile was last opened from here (0 = never). */
export const lastLaunch = (dir: string): number => launchedAt.get(dir) ?? 0;

/** Open a window of that Chrome profile (Chrome starts if it is not running). Only a profile from Chrome's own list. */
export function launch(dir: string): void {
  const p = list(true).find((x) => x.dir === dir);
  if (!p) throw new Error('That Chrome profile is not in Chrome any more. Pick another one on the Setup page.');
  const exe = chromeExe();
  if (!exe) throw new Error('Google Chrome was not found on this computer.');
  launchedAt.set(dir, Date.now());
  const child = spawn(exe, [`--profile-directory=${p.dir}`], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}
