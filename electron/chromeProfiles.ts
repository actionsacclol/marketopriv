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

// A test copy of the hub (KRYPT_MARKETO_DATA) can be pointed at a throwaway Chrome data folder, so making profiles is tried without touching the user's Chrome.
const TEST_ROOT = process.env.KRYPT_MARKETO_DATA?.trim() ? process.env.KRYPT_MARKETO_CHROME_DATA?.trim() || '' : '';
const rootArgs = (): string[] => (TEST_ROOT ? [`--user-data-dir=${TEST_ROOT}`] : []);

/** Google Chrome's data folder for this user. */
export function userDataDir(): string | null {
  if (TEST_ROOT) return fs.existsSync(path.join(TEST_ROOT, 'Local State')) ? TEST_ROOT : null;
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
  // Ones made here a moment ago, until Chrome has written them into its own list.
  for (const [dir, name] of made) {
    if (out.some((p) => p.dir === dir)) made.delete(dir);
    else if (root && fs.existsSync(path.join(root, dir))) out.push({ dir, name, email: '', hasExtension: hasExtension(path.join(root, dir)) });
  }
  cache = { at: Date.now(), list: out };
  return out;
}

// ── Making Chrome profiles ─────────────────────────────────────────────────
// Chrome makes a profile the first time it is started on a folder that is not there yet, and takes the profile's
// name from a Preferences file found in it (checked against a throwaway Chrome, closed and already running). The
// folders are numbered from 2001: Chrome numbers its own from a counter that never looks at what exists, so a
// low number could be handed out twice.
const made = new Map<string, string>();
const FIRST_MADE = 2001;

/** Make Chrome profiles with these names and open each once (that is what makes Chrome list them). */
export async function create(names: string[]): Promise<Array<{ dir: string; name: string }>> {
  const root = userDataDir();
  if (!root) throw new Error('Google Chrome has not been used on this computer yet. Open Chrome once, then try again.');
  const exe = chromeExe();
  if (!exe) throw new Error('Google Chrome was not found on this computer.');
  const clean = names.map((n) => String(n ?? '').replace(/[\x00-\x1f"\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40)).filter(Boolean);
  if (!clean.length) throw new Error('Give the Chrome profile a name.');
  if (clean.length > 50) throw new Error('Make at most 50 Chrome profiles in one go.');
  let n = FIRST_MADE;
  for (const d of fs.readdirSync(root)) {
    const m = /^Profile (\d{1,4})$/.exec(d);
    if (m && Number(m[1]) >= n) n = Number(m[1]) + 1;
  }
  const out: Array<{ dir: string; name: string }> = [];
  for (const name of clean) {
    if (n > 9999) throw new Error('Chrome has no room for more profiles made here.');
    const dir = `Profile ${n++}`;
    fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, dir, 'Preferences'), JSON.stringify({ profile: { name } }), 'utf8');
    made.set(dir, name);
    launchedAt.set(dir, Date.now());
    const child = spawn(exe, [...rootArgs(), `--profile-directory=${dir}`, '--no-first-run', '--no-default-browser-check'], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    out.push({ dir, name });
    // One at a time: Chrome takes a moment to set each one up.
    if (out.length < clean.length) await new Promise((r) => setTimeout(r, 1500));
  }
  cache = null;
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
  const child = spawn(exe, [...rootArgs(), `--profile-directory=${p.dir}`], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}
