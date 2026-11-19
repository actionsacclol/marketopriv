// Connect AI apps to the hub. Every client gets the same thing: a stdio MCP
// server entry that runs the app's own executable as Node on the bridge script
// (resources/mcp/marketo-mcp.cjs), so nothing else has to be installed.
//
// Claude Code is added through its CLI. The others keep their MCP servers in
// a config file, which we edit in place: only our own entry is touched, the
// file is backed up first, and a file we can't parse is left alone (the user
// gets the block to paste instead).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import type { ActionResult, ClientInfo } from '../../shared/types';
import { SERVER_NAME } from './index';
import { binEnv, findBin } from '../findBin';

const home = os.homedir();
/** Where apps keep per-user config: %APPDATA%, ~/Library/Application Support, ~/.config. */
const appConfig = (...parts: string[]): string =>
  process.platform === 'win32'
    ? path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), ...parts)
    : process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support', ...parts)
      : path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), ...parts);

interface ClientDef {
  id: string;
  name: string;
  kind: 'claude-cli' | 'json' | 'toml';
  file: string;
  /** JSON clients: the object the server entries live under. */
  key?: 'mcpServers' | 'servers';
  /** Extra fields this client wants on a stdio entry. */
  extra?: Record<string, string>;
  /** A folder that exists when the app is installed. */
  sign: string;
  hint: string;
}

const CLIENTS: ClientDef[] = [
  { id: 'claude-code', name: 'Claude Code', kind: 'claude-cli', file: path.join(home, '.claude.json'), sign: path.join(home, '.claude'), hint: 'Start a new Claude Code session (or run /mcp).' },
  { id: 'claude-desktop', name: 'Claude Desktop', kind: 'json', key: 'mcpServers', file: appConfig('Claude', 'claude_desktop_config.json'), sign: appConfig('Claude'), hint: 'Quit Claude Desktop completely and open it again.' },
  { id: 'codex', name: 'Codex', kind: 'toml', file: path.join(home, '.codex', 'config.toml'), sign: path.join(home, '.codex'), hint: 'Start a new Codex session.' },
  { id: 'cursor', name: 'Cursor', kind: 'json', key: 'mcpServers', file: path.join(home, '.cursor', 'mcp.json'), sign: path.join(home, '.cursor'), hint: 'In Cursor: Settings > MCP, check that "marketo" is on, then start a new chat.' },
  { id: 'windsurf', name: 'Windsurf', kind: 'json', key: 'mcpServers', file: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'), sign: path.join(home, '.codeium', 'windsurf'), hint: 'In Windsurf: open the MCP panel and press Refresh.' },
  { id: 'gemini-cli', name: 'Gemini CLI', kind: 'json', key: 'mcpServers', file: path.join(home, '.gemini', 'settings.json'), sign: path.join(home, '.gemini'), hint: 'Start a new Gemini CLI session (/mcp lists it).' },
  { id: 'vscode', name: 'VS Code (Copilot)', kind: 'json', key: 'servers', extra: { type: 'stdio' }, file: appConfig('Code', 'User', 'mcp.json'), sign: appConfig('Code', 'User'), hint: 'In VS Code: open Copilot Chat in Agent mode and enable "marketo" under tools.' },
];

const MISSING = 'The bridge script (resources/mcp/marketo-mcp.cjs) is missing from this build.';

interface Entry {
  command: string;
  args: string[];
  env: Record<string, string>;
}
const entryFor = (exe: string, shim: string, client: string): Entry => ({ command: exe, args: [shim, '--client', client], env: { ELECTRON_RUN_AS_NODE: '1' } });

// ── Claude Code (CLI) ──────────────────────────────────────────────────────
export function claudeArgs(exe: string, shim: string): string[] {
  return ['mcp', 'add', '--scope', 'user', SERVER_NAME, '-e', 'ELECTRON_RUN_AS_NODE=1', '--', exe, shim, '--client', 'claude-code'];
}

function shellQuote(s: string): string {
  if (!/[\s"'$`&|<>()^%!;]/.test(s)) return s;
  return process.platform === 'win32' ? `"${s.replace(/"/g, '""')}"` : `'${s.replace(/'/g, `'\\''`)}'`;
}

export const installCommand = (exe: string, shim: string | null): string => (shim ? `claude ${claudeArgs(exe, shim).map(shellQuote).join(' ')}` : MISSING);

const findClaude = (): Promise<string | null> => findBin('claude');

function runClaude(bin: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    const done = (err: Error | null, stdout: string, stderr: string): void => resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}`.trim() || (err ? err.message : '') });
    if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin)) {
      const line = [bin, ...args].map((s) => `"${s.replace(/"/g, '""')}"`).join(' ');
      execFile('cmd.exe', ['/d', '/s', '/c', `"${line}"`], { windowsHide: true, timeout: 30_000, windowsVerbatimArguments: true }, (e, o, er) => done(e, o, er));
    } else {
      execFile(bin, args, { windowsHide: true, timeout: 30_000, env: binEnv(bin) }, (e, o, er) => done(e, o, er));
    }
  });
}

async function connectClaudeCode(exe: string, shim: string): Promise<ActionResult> {
  const bin = await findClaude();
  if (!bin) return { ok: false, message: `The Claude Code CLI wasn't found. Run this in a terminal: ${installCommand(exe, shim)}` };
  let r = await runClaude(bin, claudeArgs(exe, shim));
  if (!r.ok && /already exists/i.test(r.out)) {
    await runClaude(bin, ['mcp', 'remove', '--scope', 'user', SERVER_NAME]);
    r = await runClaude(bin, claudeArgs(exe, shim));
  }
  if (!r.ok) return { ok: false, message: `claude mcp add failed: ${r.out.slice(0, 300)}` };
  return { ok: true, message: 'Connected Claude Code. Start a new Claude Code session (or run /mcp).' };
}

// ── Config files ───────────────────────────────────────────────────────────
function readText(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch {
    return null;
  }
}

function writeWithBackup(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && !fs.existsSync(`${file}.before-marketo`)) fs.copyFileSync(file, `${file}.before-marketo`);
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

/** The file's JSON, {} when it doesn't exist or is empty, null when it can't be parsed (comments, syntax error). */
function readJson(file: string): Record<string, unknown> | null {
  const text = readText(file);
  if (text === null || !text.trim()) return {};
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const jsonBlock = (c: ClientDef, e: Entry): string => JSON.stringify({ [c.key!]: { [SERVER_NAME]: { ...(c.extra ?? {}), ...e } } }, null, 2);

function connectJson(c: ClientDef, e: Entry): ActionResult {
  const cfg = readJson(c.file);
  if (!cfg) return { ok: false, message: `${c.file} couldn't be read as JSON (it may have comments), so it was left alone. Add this to it by hand:\n${jsonBlock(c, e)}` };
  const servers = cfg[c.key!] && typeof cfg[c.key!] === 'object' ? (cfg[c.key!] as Record<string, unknown>) : {};
  cfg[c.key!] = { ...servers, [SERVER_NAME]: { ...(c.extra ?? {}), ...e } };
  writeWithBackup(c.file, `${JSON.stringify(cfg, null, 2)}\n`);
  return { ok: true, message: `Connected ${c.name}. ${c.hint}` };
}

function disconnectJson(c: ClientDef): ActionResult {
  const cfg = readJson(c.file);
  if (!cfg) return { ok: false, message: `${c.file} couldn't be read as JSON. Remove the "${SERVER_NAME}" entry by hand.` };
  const servers = cfg[c.key!] as Record<string, unknown> | undefined;
  if (servers && typeof servers === 'object' && SERVER_NAME in servers) {
    delete servers[SERVER_NAME];
    writeWithBackup(c.file, `${JSON.stringify(cfg, null, 2)}\n`);
  }
  return { ok: true, message: `Removed from ${c.name}.` };
}

const TOML_HEAD = new RegExp(`^\\s*\\[mcp_servers\\.${SERVER_NAME}(\\.[^\\]]+)?\\]\\s*$`);

/** The TOML text without our own tables. */
function stripToml(text: string): string {
  const out: string[] = [];
  let skipping = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) skipping = TOML_HEAD.test(line);
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

const tomlBlock = (e: Entry): string =>
  [`[mcp_servers.${SERVER_NAME}]`, `command = ${JSON.stringify(e.command)}`, `args = [${e.args.map((a) => JSON.stringify(a)).join(', ')}]`, '', `[mcp_servers.${SERVER_NAME}.env]`, ...Object.entries(e.env).map(([k, v]) => `${k} = ${JSON.stringify(v)}`)].join('\n');

function connectToml(c: ClientDef, e: Entry): ActionResult {
  const rest = stripToml(readText(c.file) ?? '');
  writeWithBackup(c.file, `${rest ? `${rest}\n\n` : ''}${tomlBlock(e)}\n`);
  return { ok: true, message: `Connected ${c.name}. ${c.hint}` };
}

function isConnected(c: ClientDef): boolean {
  if (c.kind === 'toml') return (readText(c.file) ?? '').split(/\r?\n/).some((l) => TOML_HEAD.test(l));
  const cfg = readJson(c.file);
  const servers = cfg?.[c.kind === 'claude-cli' ? 'mcpServers' : c.key!] as Record<string, unknown> | undefined;
  return !!servers && typeof servers === 'object' && SERVER_NAME in servers;
}

// ── Public ─────────────────────────────────────────────────────────────────
export function listClients(_exe: string, _shim: string | null): ClientInfo[] {
  return CLIENTS.map((c) => ({ id: c.id, name: c.name, configPath: c.file, detected: fs.existsSync(c.sign), connected: isConnected(c), hint: c.hint }));
}

export async function connectClient(id: string, exe: string, shim: string | null): Promise<ActionResult> {
  const c = CLIENTS.find((x) => x.id === id);
  if (!c) return { ok: false, message: `Unknown app "${id}".` };
  if (!shim) return { ok: false, message: MISSING };
  try {
    if (c.kind === 'claude-cli') return await connectClaudeCode(exe, shim);
    const e = entryFor(exe, shim, c.id);
    return c.kind === 'toml' ? connectToml(c, e) : connectJson(c, e);
  } catch (e) {
    return { ok: false, message: `Couldn't update ${c.file}: ${(e as Error).message}` };
  }
}

export async function disconnectClient(id: string): Promise<ActionResult> {
  const c = CLIENTS.find((x) => x.id === id);
  if (!c) return { ok: false, message: `Unknown app "${id}".` };
  try {
    if (c.kind === 'claude-cli') {
      const bin = await findClaude();
      if (!bin) return { ok: false, message: 'The Claude Code CLI wasn\'t found. Run: claude mcp remove --scope user marketo' };
      const r = await runClaude(bin, ['mcp', 'remove', '--scope', 'user', SERVER_NAME]);
      return r.ok ? { ok: true, message: 'Removed from Claude Code.' } : { ok: false, message: r.out.slice(0, 300) };
    }
    if (c.kind === 'toml') {
      const text = readText(c.file);
      if (text !== null) writeWithBackup(c.file, `${stripToml(text)}\n`);
      return { ok: true, message: `Removed from ${c.name}.` };
    }
    return disconnectJson(c);
  } catch (e) {
    return { ok: false, message: `Couldn't update ${c.file}: ${(e as Error).message}` };
  }
}

/** The block for any MCP client that isn't listed (most use this "mcpServers" shape). */
export function genericConfig(exe: string, shim: string | null): string {
  if (!shim) return MISSING;
  return JSON.stringify({ mcpServers: { [SERVER_NAME]: entryFor(exe, shim, 'mcp-client') } }, null, 2);
}
