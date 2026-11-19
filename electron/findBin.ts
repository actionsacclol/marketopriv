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

/** The full path of a program by its plain name ("claude"), or null when it isn't installed. */
export async function findBin(name: string): Promise<string | null> {
  if (!/^[\w.-]+$/.test(name)) return null;
  if (process.platform === 'win32') {
    const found = lines(await run('where.exe', [name]));
    const pick = found.find((p) => /\.exe$/i.test(p)) ?? found.find((p) => /\.(cmd|bat)$/i.test(p)) ?? found[0];
    if (pick) return pick;
    const guess = path.join(home, '.local', 'bin', `${name}.exe`);
    return isFile(guess) ? guess : null;
  }
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
