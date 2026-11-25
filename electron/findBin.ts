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

async function findWin(name: string): Promise<string | null> {
  const found = lines(await run(sys32('where.exe'), [name])).filter(isFile);
  const pick = found.find((p) => /\.exe$/i.test(p)) ?? found.find((p) => /\.(cmd|bat)$/i.test(p));
  if (pick) return pick;
  return inDirs(name, [...new Set([...(await savedWinPath()), ...winBinDirs()])]) ?? found[0] ?? null;
}

/** The full path of a program by its plain name ("claude"), or null when it isn't installed. */
export async function findBin(name: string): Promise<string | null> {
  if (!/^[\w.-]+$/.test(name)) return null;
  if (process.platform === 'win32') return findWin(name);
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
