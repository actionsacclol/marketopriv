import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EditorStatus } from '../shared/types';
import { EDITOR_SERVER } from '../shared/longform';
import { claudeServer, clientsWith } from './mcp/clients';

// Krypt Editor, as Marketo sees it: is it on this computer, which AI apps it is connected to, and how an AI app
// starts its tools. Long videos are made there (the long-form mode needs it); Marketo never edits the Editor's files,
// it only reads its connection file (written by the Editor each time it runs) and the AI apps' settings.

const NAME = 'Krypt Editor';
const home = os.homedir();

const dataDir = (): string =>
  process.platform === 'win32'
    ? path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), NAME)
    : process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', NAME)
      : path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), NAME);

interface Conn {
  appExePath?: string | null;
  shimPath?: string | null;
  version?: string;
}

function conn(): Conn | null {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dataDir(), 'mcp.json'), 'utf8').replace(/^\uFEFF/, '')) as Conn;
    return j && typeof j === 'object' ? j : null;
  } catch {
    return null;
  }
}

/** Where the installer puts it: the program, and the bridge script an AI app starts. */
function installed(): Array<{ exe: string; shim: string }> {
  if (process.platform === 'win32') {
    const dirs = [path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Programs', NAME), path.join(process.env.ProgramFiles ?? 'C:\\Program Files', NAME)];
    return dirs.map((d) => ({ exe: path.join(d, `${NAME}.exe`), shim: path.join(d, 'resources', 'resources', 'mcp', 'krypt-editor-mcp.cjs') }));
  }
  if (process.platform === 'darwin')
    return ['/Applications', path.join(home, 'Applications')].map((d) => ({
      exe: path.join(d, `${NAME}.app`, 'Contents', 'MacOS', NAME),
      shim: path.join(d, `${NAME}.app`, 'Contents', 'Resources', 'resources', 'mcp', 'krypt-editor-mcp.cjs'),
    }));
  return [];
}

const there = (p?: string | null): p is string => !!p && fs.existsSync(p);

export interface EditorEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/**
 * How an AI app starts Krypt Editor's tools, for runs Marketo starts with a settings file of its own (Kip, and
 * runs pinned to one profile): the copy that ran last, else the one the user's Claude Code already uses, else the
 * installed one. null = not found.
 */
export function entry(client: string): EditorEntry | null {
  const env = { ELECTRON_RUN_AS_NODE: '1' };
  const c = conn();
  if (c && there(c.appExePath) && there(c.shimPath)) return { command: c.appExePath, args: [c.shimPath, '--client', client], env };
  const mine = claudeServer(EDITOR_SERVER);
  if (mine && there(mine.command) && mine.args.length && there(mine.args[0])) return { command: mine.command, args: [mine.args[0], '--client', client], env };
  const inst = installed().find((x) => there(x.exe) && there(x.shim));
  return inst ? { command: inst.exe, args: [inst.shim, '--client', client], env } : null;
}

export function status(): EditorStatus {
  const c = conn();
  const onDisk = installed().some((x) => there(x.exe));
  return {
    installed: onDisk || !!c || !!entry('marketo'),
    version: c?.version ? String(c.version) : undefined,
    connected: clientsWith(EDITOR_SERVER),
  };
}
