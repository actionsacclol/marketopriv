import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Finding a command-line program (claude, codex, node) from the app. On macOS an
// app opened from the Finder or the Dock gets only /usr/bin:/bin:/usr/sbin:/sbin
// as its PATH, so `which claude` misses Homebrew, npm and Claude Code's own
// installer. This also looks in the usual install folders and asks the user's
// login shell, which reads their profile the way Terminal does.

const home = os.homedir();

/** Where command-line programs usually live on macOS / Linux, beyond the PATH a GUI app gets. */
export const UNIX_BIN_DIRS = [
  path.join(home, '.local', 'bin'),
  path.join(home, '.claude', 'local'),
  '/opt/homebrew/bin',
  '/usr/local/bin',
  path.join(home, '.npm-global', 'bin'),
  path.join(home, '.bun', 'bin'),
  path.join(home, '.volta', 'bin'),
  path.join(home, 'bin'),
];

const run = (file: string, args: string[], env?: NodeJS.ProcessEnv, timeout = 10_000): Promise<string> =>
  new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, env: env ?? process.env }, (err, stdout) => resolve(err ? '' : String(stdout ?? '')));
  });

const lines = (s: string): string[] =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

const isFile = (p: string): boolean => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/** The environment to start a found program in: on macOS / Linux its own folder and the usual ones go on the PATH (an npm-installed claude is a node script and needs node). */
export function binEnv(bin: string, extra?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (process.platform === 'win32') return { ...process.env, ...extra };
  return { ...process.env, ...extra, PATH: unixPath(bin) };
}

/** That PATH as one string. */
export function unixPath(bin?: string): string {
  return [...new Set([...(bin ? [path.dirname(bin)] : []), ...(process.env.PATH ?? '').split(':').filter(Boolean), ...UNIX_BIN_DIRS, '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(':');
}

// ── Windows ────────────────────────────────────────────────────────────────
// An app keeps the PATH it was started with. A program installed while Marketo was open (or started with Windows,
// before the installer changed PATH) is not on it, and some installers never put their folder on PATH at all
// (Claude Code's own installer only says to add it). So: the PATH we have, then the PATH Windows has saved now,
// then the folders these programs are usually installed to.
const winEnv = (s: string): string => s.replace(/%([^%]+)%/g, (m, k: string) => process.env[k] ?? process.env[k.toUpperCase()] ?? Object.entries(process.env).find(([n]) => n.toLowerCase() === k.toLowerCase())?.[1] ?? m);
const sys32 = (exe: string): string => path.join(process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows', 'System32', exe);

/** The PATH saved for this user and for the computer, as Windows has it now (not the copy this app started with). */
async function savedWinPath(): Promise<string[]> {
  const out: string[] = [];
  for (const key of ['HKCU\\Environment', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment']) {
    const text = await run(sys32('reg.exe'), ['query', key, '/v', 'Path'], undefined, 6000);
    const m = /^\s*Path\s+REG_(?:EXPAND_)?SZ\s+(.*)$/im.exec(text);
    if (m) out.push(...m[1].split(';').map((d) => winEnv(d.trim())).filter(Boolean));
  }
  return out;
}

/** Where command-line programs usually land on Windows (Claude Code's installer, npm, pnpm, bun, Volta, nvm, Scoop, winget, Chocolatey). */
function winBinDirs(): string[] {
  const e = process.env;
  const local = e.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');
  const roaming = e.APPDATA ?? path.join(home, 'AppData', 'Roaming');
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.claude', 'local'),
    path.join(roaming, 'npm'),
    path.join(local, 'pnpm'),
    path.join(home, '.bun', 'bin'),
    path.join(local, 'Volta', 'bin'),
    path.join(home, '.volta', 'bin'),
    ...(e.NVM_SYMLINK ? [e.NVM_SYMLINK] : []),
    ...(e.PNPM_HOME ? [e.PNPM_HOME] : []),
    path.join(e.ProgramFiles ?? 'C:\\Program Files', 'nodejs'),
    path.join(home, 'scoop', 'shims'),
    path.join(local, 'Microsoft', 'WinGet', 'Links'),
    // Codex: its own installer, and the copy the ChatGPT / Codex desktop app keeps (from user reports, not its docs).
    path.join(local, 'Programs', 'OpenAI', 'Codex', 'bin'),
    path.join(local, 'OpenAI', 'Codex', 'bin'),
    // Cursor's command-line agent (its installer's folder).
    path.join(local, 'cursor-agent'),
    path.join(e.ProgramData ?? 'C:\\ProgramData', 'chocolatey', 'bin'),
  ];
}

/** The program in one of these folders: the .exe first, then the .cmd / .bat npm writes. */
function inDirs(name: string, dirs: string[]): string | null {
  for (const ext of ['.exe', '.cmd', '.bat'])
    for (const d of dirs) {
      const p = path.join(d, `${name}${ext}`);
      if (isFile(p)) return p;
    }
  return null;
}

async function findWin(name: string, skip?: RegExp): Promise<string | null> {
  const found = lines(await run(sys32('where.exe'), [name])).filter((p) => isFile(p) && !skip?.test(p));
  const pick = found.find((p) => /\.exe$/i.test(p)) ?? found.find((p) => /\.(cmd|bat)$/i.test(p));
  if (pick) return pick;
  return inDirs(name, [...new Set([...(await savedWinPath()), ...winBinDirs()])].filter((d) => !skip?.test(d))) ?? found[0] ?? null;
}

/**
 * A .cmd launcher that hands over to a PowerShell script, which starts the node.exe and index.js the program ships:
 * beside the launcher, or in the newest folder under versions\ (Cursor's command-line agent is installed like this).
 * Starting those two directly keeps cmd.exe and PowerShell away from the arguments.
 */
function ownNode(bin: string): { cmd: string; pre: string[]; env: NodeJS.ProcessEnv } | null {
  const dir = path.dirname(bin);
  const pair = (d: string): { cmd: string; pre: string[]; env: NodeJS.ProcessEnv } | null => (isFile(path.join(d, 'node.exe')) && isFile(path.join(d, 'index.js')) ? { cmd: path.join(d, 'node.exe'), pre: [path.join(d, 'index.js')], env: { CURSOR_INVOKED_AS: path.basename(bin) } } : null);
  if (!isFile(bin.replace(/\.(cmd|bat)$/i, '.ps1'))) return null;
  const here = pair(dir);
  if (here) return here;
  let names: string[] = [];
  try {
    names = fs.readdirSync(path.join(dir, 'versions'));
  } catch {
    return null;
  }
  // 2026.11.22-e9042b2, or 2026.11.22-08-15-00-e9042b2 with the build time: the newest by date, then time.
  const key = (n: string): string => {
    const m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})(?:-(\d{2})-(\d{2})-(\d{2}))?-[a-f0-9]+$/.exec(n);
    return m ? `${m[1]}${m[2].padStart(2, '0')}${m[3].padStart(2, '0')}${m[4] ?? '00'}${m[5] ?? '00'}${m[6] ?? '00'}` : '';
  };
  for (const n of names.filter(key).sort((a, b) => key(b).localeCompare(key(a)))) {
    const found = pair(path.join(dir, 'versions', n));
    if (found) return found;
  }
  return null;
}

/**
 * How to start a found program directly, with no shell in between. On Windows an npm-installed program is a .cmd
 * launcher, which cannot be started that way: this reads the script the launcher runs and starts it with node (the one
 * beside it, the one installed, or this app's own). A .cmd file that is not npm's comes back marked viaCmd.
 */
export async function launcher(bin: string): Promise<{ cmd: string; pre: string[]; env?: NodeJS.ProcessEnv; /** A .cmd file that is not npm's: it has to go through cmd.exe. */ viaCmd?: boolean }> {
  if (process.platform !== 'win32' || !/\.(cmd|bat)$/i.test(bin)) return { cmd: bin, pre: [] };
  let text = '';
  try {
    text = fs.readFileSync(bin, 'utf8');
  } catch {
    return { cmd: bin, pre: [], viaCmd: true };
  }
  const m = /"%~?dp0%?\\([^"]+?\.(?:c|m)?js)"/i.exec(text);
  const script = m ? path.join(path.dirname(bin), m[1]) : '';
  if (!script || !isFile(script)) return ownNode(bin) ?? { cmd: bin, pre: [], viaCmd: true };
  const beside = path.join(path.dirname(bin), 'node.exe');
  const node = isFile(beside) ? beside : await findWin('node');
  if (node && /\.exe$/i.test(node)) return { cmd: node, pre: [script] };
  return { cmd: process.execPath, pre: [script], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

/**
 * What the last searches found: the Autopilot page asks every 15-60 s, and each search starts where.exe and reg.exe
 * (Windows) or a login shell (macOS). A found program is kept 5 minutes (while its file is there), a missing one 1 minute.
 */
const seen = new Map<string, { at: number; path: string | null }>();
const FOUND_MS = 5 * 60_000;
const MISSING_MS = 60_000;

/** Search again next time (after Connect, or when the user says they installed something). */
export function forgetBins(): void {
  seen.clear();
}

/** The full path of a program by its plain name ("claude"), or null when it isn't installed. `skip`: found files that are not the program itself (Windows). */
export async function findBin(name: string, skip?: RegExp): Promise<string | null> {
  if (!/^[\w.-]+$/.test(name)) return null;
  const key = `${name}|${skip?.source ?? ''}`;
  const had = seen.get(key);
  if (had && Date.now() - had.at < (had.path ? FOUND_MS : MISSING_MS) && (!had.path || isFile(had.path))) return had.path;
  const p = await findBinNow(name, skip);
  seen.set(key, { at: Date.now(), path: p });
  return p;
}

async function findBinNow(name: string, skip?: RegExp): Promise<string | null> {
  if (process.platform === 'win32') return findWin(name, skip);
  // 1. The PATH the app has, plus the usual folders.
  const PATH = [...new Set([...(process.env.PATH ?? '').split(':').filter(Boolean), ...UNIX_BIN_DIRS])].join(':');
  const viaWhich = lines(await run('/usr/bin/which', [name], { ...process.env, PATH }))[0];
  if (viaWhich?.startsWith('/')) return viaWhich;
  // 2. The user's login shell (nvm, asdf, custom PATH lines in .zshrc / .zprofile).
  const shell = process.env.SHELL && /^\/[\w/.-]+$/.test(process.env.SHELL) ? process.env.SHELL : '/bin/zsh';
  const viaShell = lines(await run(shell, ['-lic', `command -v ${name}`], undefined, 15_000))
    .filter((l) => l.startsWith('/'))
    .pop();
  if (viaShell && isFile(viaShell)) return viaShell;
  return null;
}
