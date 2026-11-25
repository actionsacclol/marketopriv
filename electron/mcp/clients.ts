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
  sign?: string;
  /** More places the app can be installed to (any one existing counts). */
  signs?: () => string[];
  /** The name the bridge reports for it, when it shares another app's settings file. */
  client?: string;
  hint: string;
}

/** Folders in `dir` whose name starts with `prefix` (Store apps live in Packages\<name>_<publisher id>). */
function dirsStarting(dir: string, prefix: string): string[] {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.toLowerCase().startsWith(prefix.toLowerCase()))
      .map((d) => path.join(dir, d.name));
  } catch {
    return [];
  }
}
const localAppData = (): string => process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local');

/**
 * Claude Desktop from the Microsoft Store (or its newer installer) keeps its settings inside its own package folder,
 * not in %APPDATA%\Claude: a file written only to the usual place is never read by it.
 */
const claudeStoreDirs = (): string[] => (process.platform === 'win32' ? dirsStarting(path.join(localAppData(), 'Packages'), 'Claude_').map((d) => path.join(d, 'LocalCache', 'Roaming', 'Claude')).filter((d) => fs.existsSync(d)) : []);

/** Where the ChatGPT desktop app is installed. */
const chatgptDirs = (): string[] =>
  process.platform === 'win32'
    ? [...dirsStarting(path.join(localAppData(), 'Packages'), 'OpenAI.ChatGPT'), path.join(localAppData(), 'Programs', 'ChatGPT')]
    : process.platform === 'darwin'
      ? ['/Applications/ChatGPT.app', path.join(home, 'Applications', 'ChatGPT.app')]
      : [];

/** Claude Code's own settings file (its user-level MCP servers live under "mcpServers"). */
const claudeCodeFile = (): string => path.join(process.env.CLAUDE_CONFIG_DIR?.trim() || home, '.claude.json');

const CLIENTS: ClientDef[] = [
  { id: 'claude-code', name: 'Claude Code', kind: 'claude-cli', file: claudeCodeFile(), sign: path.join(home, '.claude'), hint: 'Start a new Claude Code session (or run /mcp).' },
  { id: 'claude-desktop', name: 'Claude Desktop', kind: 'json', key: 'mcpServers', file: appConfig('Claude', 'claude_desktop_config.json'), sign: appConfig('Claude'), signs: claudeStoreDirs, hint: 'Quit Claude Desktop completely (also from the tray) and open it again.' },
  { id: 'codex', name: 'Codex', kind: 'toml', file: path.join(home, '.codex', 'config.toml'), sign: path.join(home, '.codex'), hint: 'Start a new Codex session.' },
  // The ChatGPT desktop app reads the same settings file as Codex (OpenAI: they "share this configuration").
  { id: 'chatgpt', name: 'ChatGPT desktop', kind: 'toml', client: 'codex', file: path.join(home, '.codex', 'config.toml'), signs: chatgptDirs, hint: 'In ChatGPT: Settings > MCP servers should list "marketo"; press Restart there. It shares these settings with Codex.' },
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

/** Claude Code is on this computer in some form (its folder or settings file exists), even when its program was not found. */
const claudeCodeHere = (): boolean => fs.existsSync(path.join(home, '.claude')) || fs.existsSync(claudeCodeFile());

/**
 * The same entry `claude mcp add --scope user` writes, put into Claude Code's settings file directly. For when its
 * program can't be found or run from here (installed somewhere unusual, or only inside the Claude desktop app).
 */
function connectClaudeFile(exe: string, shim: string): ActionResult {
  const file = claudeCodeFile();
  const cfg = readJson(file);
  if (!cfg) return { ok: false, message: `${file} couldn't be read, so it was left alone. Run this in a terminal instead: ${installCommand(exe, shim)}` };
  const servers = cfg.mcpServers && typeof cfg.mcpServers === 'object' ? (cfg.mcpServers as Record<string, unknown>) : {};
  cfg.mcpServers = { ...servers, [SERVER_NAME]: { type: 'stdio', ...entryFor(exe, shim, 'claude-code') } };
  writeWithBackup(file, `${JSON.stringify(cfg, null, 2)}\n`);
  return { ok: true, message: 'Connected Claude Code. Close it and start a new session (or run /mcp) so it picks Marketo up.' };
}

async function connectClaudeCode(exe: string, shim: string): Promise<ActionResult> {
  const bin = await findClaude();
  if (bin) {
    let r = await runClaude(bin, claudeArgs(exe, shim));
    if (!r.ok && /already exists/i.test(r.out)) {
      await runClaude(bin, ['mcp', 'remove', '--scope', 'user', SERVER_NAME]);
      r = await runClaude(bin, claudeArgs(exe, shim));
    }
    if (r.ok) return { ok: true, message: 'Connected Claude Code. Start a new Claude Code session (or run /mcp).' };
    // Its own command failed: write the same entry ourselves, and say why only if that fails too.
    const viaFile = connectClaudeFile(exe, shim);
    return viaFile.ok ? viaFile : { ok: false, message: `claude mcp add failed: ${r.out.slice(0, 300)}` };
  }
  if (!claudeCodeHere()) return { ok: false, message: 'Claude Code was not found on this computer. Install it (claude.com/claude-code), open it once and sign in, then press Connect again.' };
  return connectClaudeFile(exe, shim);
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

/**
 * The settings files to write for an app. Claude Desktop from the Store reads the copy inside its package folder, so
 * that one is written (and the usual one too when its folder is there: an older install may still read it).
 */
function filesOf(c: ClientDef): string[] {
  if (c.id !== 'claude-desktop') return [c.file];
  const store = claudeStoreDirs().map((d) => path.join(d, path.basename(c.file)));
  return store.length ? [...store, ...(fs.existsSync(path.dirname(c.file)) ? [c.file] : [])] : [c.file];
}

function connectJson(c: ClientDef, e: Entry): ActionResult {
  let wrote = 0;
  let bad = '';
  for (const file of filesOf(c)) {
    const cfg = readJson(file);
    if (!cfg) {
      bad = file;
      continue;
    }
    const servers = cfg[c.key!] && typeof cfg[c.key!] === 'object' ? (cfg[c.key!] as Record<string, unknown>) : {};
    cfg[c.key!] = { ...servers, [SERVER_NAME]: { ...(c.extra ?? {}), ...e } };
    writeWithBackup(file, `${JSON.stringify(cfg, null, 2)}\n`);
    wrote++;
  }
  if (!wrote) return { ok: false, message: `${bad || c.file} couldn't be read as JSON (it may have comments), so it was left alone. Add this to it by hand:\n${jsonBlock(c, e)}` };
  return { ok: true, message: `Connected ${c.name}. ${c.hint}` };
}

function disconnectJson(c: ClientDef, key = c.key!): ActionResult {
  for (const file of filesOf(c)) {
    const cfg = readJson(file);
    if (!cfg) return { ok: false, message: `${file} couldn't be read as JSON. Remove the "${SERVER_NAME}" entry by hand.` };
    const servers = cfg[key] as Record<string, unknown> | undefined;
    if (servers && typeof servers === 'object' && SERVER_NAME in servers) {
      delete servers[SERVER_NAME];
      writeWithBackup(file, `${JSON.stringify(cfg, null, 2)}\n`);
    }
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
  return filesOf(c).some((file) => {
    const servers = readJson(file)?.[c.kind === 'claude-cli' ? 'mcpServers' : c.key!] as Record<string, unknown> | undefined;
    return !!servers && typeof servers === 'object' && SERVER_NAME in servers;
  });
}

/** The AI apps whose settings hold a server of this name (Krypt Editor's, say), one name per settings file. */
export function clientsWith(name: string): string[] {
  const esc = name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const head = new RegExp(`^\\s*\\[\\s*mcp_servers\\.(?:"${esc}"|${esc})(\\.[^\\]]+)?\\s*\\]`);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of CLIENTS) {
    const has =
      c.kind === 'toml'
        ? (readText(c.file) ?? '').split(/\r?\n/).some((l) => head.test(l))
        : filesOf(c).some((file) => {
            const servers = readJson(file)?.[c.kind === 'claude-cli' ? 'mcpServers' : c.key!] as Record<string, unknown> | undefined;
            return !!servers && typeof servers === 'object' && name in servers;
          });
    if (!has || seen.has(c.file)) continue;
    seen.add(c.file);
    out.push(c.name);
  }
  return out;
}

/** A server's own entry in Claude Code's settings (how that app starts it), when it is there. */
export function claudeServer(name: string): { command: string; args: string[] } | null {
  const c = CLIENTS.find((x) => x.kind === 'claude-cli');
  const e = (c && (readJson(c.file)?.mcpServers as Record<string, { command?: unknown; args?: unknown }> | undefined))?.[name];
  return e && typeof e.command === 'string' && Array.isArray(e.args) ? { command: e.command, args: e.args.map(String) } : null;
}

// ── Public ─────────────────────────────────────────────────────────────────
export function listClients(_exe: string, _shim: string | null): ClientInfo[] {
  return CLIENTS.map((c) => ({ id: c.id, name: c.name, configPath: filesOf(c)[0], detected: (!!c.sign && fs.existsSync(c.sign)) || !!c.signs?.().some((d) => fs.existsSync(d)), connected: isConnected(c), hint: c.hint }));
}

export async function connectClient(id: string, exe: string, shim: string | null): Promise<ActionResult> {
  const c = CLIENTS.find((x) => x.id === id);
  if (!c) return { ok: false, message: `Unknown app "${id}".` };
  if (!shim) return { ok: false, message: MISSING };
  try {
    if (c.kind === 'claude-cli') return await connectClaudeCode(exe, shim);
    const e = entryFor(exe, shim, c.client ?? c.id);
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
      const r = bin ? await runClaude(bin, ['mcp', 'remove', '--scope', 'user', SERVER_NAME]) : { ok: false, out: '' };
      if (r.ok && !isConnected(c)) return { ok: true, message: 'Removed from Claude Code.' };
      // Its program was not found, failed, or left the entry: take the entry out of its settings file ourselves.
      return disconnectJson(c, 'mcpServers');
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
