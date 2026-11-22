// Krypt Marketo's MCP server (Model Context Protocol), so any AI app that
// speaks MCP (Claude, Codex, Cursor, Windsurf, Gemini CLI, …) can drive the
// hub: make reels, render them, use Instagram in the user's Chrome, log
// sessions and stats. The built-in chat agent calls the same tools through
// invoke(). Same transport as Krypt Editor.
//
//   client ──stdio──▶ marketo-mcp.cjs (run by the app exe as Node)
//          ──pipe───▶ this module: one SDK McpServer per connection
//          ──IPC────▶ main (store tools) or renderer (preview/render)
//
// - Transport: a per-user named pipe (Windows) / Unix socket (mode 0600),
//   newline-delimited JSON-RPC. serveStdio() picks the protocol era per
//   connection (2026-07-28 server/discover or 2025 initialize).
// - Auth: the first line must be {"krypt":"hello","token":…}; the token is 256
//   random bits written to userData/mcp.json at every start, so only processes
//   that can read this user's profile can connect.
// - mcp-manifest.json: the discovery answers captured at start, served by the
//   shim while the app is closed so clients can list tools without launching it.

import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { InMemoryTransport, McpServer, type CallToolResult, type JSONRPCMessage, type Transport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import type { McpActivity, McpClientInfo, McpStatus } from '../../shared/types';
import { TOOLS, annotationsFor, serverInstructions, type ToolDef } from './tools';

export const SERVER_NAME = 'marketo';
const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const HELLO_TIMEOUT_MS = 5000;
const MAX_LINE = 32 * 1024 * 1024;

/** What a renderer-side tool run returns. */
export interface ToolOutcome {
  ok: boolean;
  text: string;
  images?: Array<{ data: string; mimeType: string }>;
}

export interface McpDeps {
  userData: string;
  version: string;
  /** Override the pipe / socket path (tests). */
  pipe?: string;
  /** Appended to the Windows pipe name (a development copy next to the installed hub). */
  pipeSuffix?: string;
  /** The shim script clients run (null when it's missing from this build). */
  shimPath: string | null;
  /** The app executable, which doubles as the shim's Node runtime. */
  exePath: string;
  /** What the shim launches when a tool is called while the app is closed (null in dev-server mode). */
  appExePath: string | null;
  /** Arguments for appExePath (the app folder when running an unpackaged build). */
  appArgs: string[];
  /** The `claude mcp add …` command shown on the Connect page. */
  installCommand: string;
  isEnabled(): boolean;
  /** Run a tool (in main, or in the renderer for preview/render). */
  runTool(name: string, args: unknown, client: string, onProgress: (fraction: number, message: string) => void, signal: AbortSignal): Promise<ToolOutcome>;
  onStatus(status: McpStatus): void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

// ── Slimmer tool list ──────────────────────────────────────────────────────
/**
 * The AI re-reads the tool list on every turn, so drop what the schema library adds that tells it nothing:
 * the $schema URL and the ±2^53 bounds every integer gets.
 */
function slimSchema(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(slimSchema);
  if (!v || typeof v !== 'object') return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k === '$schema') continue;
    if ((k === 'maximum' && x === Number.MAX_SAFE_INTEGER) || (k === 'minimum' && x === Number.MIN_SAFE_INTEGER)) continue;
    out[k] = slimSchema(x);
  }
  return out;
}
function slimMessage<T>(m: T): T {
  const tools = (m as { result?: { tools?: Array<Record<string, unknown>> } }).result?.tools;
  if (!Array.isArray(tools)) return m;
  const r = (m as { result: Record<string, unknown> }).result;
  return { ...m, result: { ...r, tools: tools.map((t) => ({ ...t, ...(t.inputSchema ? { inputSchema: slimSchema(t.inputSchema) } : {}) })) } };
}

// ── Pipe transport ─────────────────────────────────────────────────────────
/** Newline-delimited JSON-RPC over one socket (the stdio framing, as the spec recommends for custom streams). */
class LineTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T) => void;
  private buf = '';
  private closed = false;

  constructor(
    private readonly socket: net.Socket,
    private readonly initial: string,
    private readonly observe: (m: JSONRPCMessage) => void,
  ) {}

  private feed(chunk: string): void {
    this.buf += chunk;
    if (this.buf.length > MAX_LINE && this.buf.indexOf('\n') < 0) {
      this.onerror?.(new Error('Message too large'));
      this.buf = '';
      return;
    }
    let nl: number;
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl).replace(/\r$/, '');
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: JSONRPCMessage;
      try {
        msg = JSON.parse(line) as JSONRPCMessage;
      } catch {
        void this.send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } } as unknown as JSONRPCMessage);
        continue;
      }
      this.observe(msg);
      this.onmessage?.(msg);
    }
  }

  async start(): Promise<void> {
    this.socket.setEncoding('utf8');
    this.socket.on('data', (c: string) => this.feed(c));
    this.socket.on('close', () => this.finish());
    this.socket.on('error', (e) => this.onerror?.(e));
    if (this.initial) this.feed(this.initial);
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.closed || this.socket.destroyed) return;
    await new Promise<void>((resolve) => this.socket.write(`${JSON.stringify(slimMessage(message))}\n`, () => resolve()));
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  async close(): Promise<void> {
    this.socket.end();
    this.finish();
  }
}

// ── Server factory ─────────────────────────────────────────────────────────
type ToolExtra = {
  mcpReq?: {
    signal?: AbortSignal;
    _meta?: { progressToken?: string | number };
    notify?: (n: { method: string; params: Record<string, unknown> }) => Promise<void>;
  };
};

interface Hooks {
  client(): string;
  call(def: ToolDef, args: unknown, extra: ToolExtra | undefined): Promise<CallToolResult>;
}

function buildServer(version: string, hooks: Hooks): McpServer {
  const server = new McpServer({ name: SERVER_NAME, title: 'Krypt Marketo', version }, { capabilities: { tools: {} }, instructions: serverInstructions() });
  for (const def of TOOLS) {
    server.registerTool(
      def.name,
      { title: def.title, description: def.description, inputSchema: def.input, annotations: annotationsFor(def) },
      ((args: unknown, extra?: ToolExtra) => hooks.call(def, args, extra)) as never,
    );
  }
  return server;
}

/** notifications/progress for a call that carried a progressToken (≤ 4/s). */
function progressSender(extra: ToolExtra | undefined): (fraction: number, message: string) => void {
  const token = extra?.mcpReq?._meta?.progressToken;
  const notify = extra?.mcpReq?.notify;
  if ((typeof token !== 'string' && typeof token !== 'number') || !notify) return () => {};
  let last = 0;
  let count = 0;
  return (fraction, message) => {
    const now = Date.now();
    if (now - last < 250) return;
    last = now;
    const text = fraction >= 0 ? `${message} ${Math.round(fraction * 100)}%` : message;
    void notify({ method: 'notifications/progress', params: { progressToken: token, progress: ++count, message: text } }).catch(() => {});
  };
}

/** Capture both eras' discovery answers from a real server instance (served by the shim while the app is closed). */
async function captureManifest(version: string): Promise<Record<string, unknown>> {
  const hooks: Hooks = { client: () => 'manifest', call: async () => ({ content: [{ type: 'text', text: 'offline' }], isError: true }) };
  const ask = async (msgs: JSONRPCMessage[]): Promise<Map<number, unknown>> => {
    const [client, srv] = InMemoryTransport.createLinkedPair();
    const answers = new Map<number, unknown>();
    const want = msgs.filter((m) => 'id' in m).length;
    const done = new Promise<void>((resolve) => {
      client.onmessage = (m) => {
        const mm = slimMessage(m) as { id?: number; result?: unknown; error?: unknown };
        if (typeof mm.id === 'number') answers.set(mm.id, mm.result ?? { error: mm.error });
        if (answers.size >= want) resolve();
      };
    });
    await client.start();
    const handle = serveStdio(() => buildServer(version, hooks), { transport: srv });
    for (const m of msgs) await client.send(m);
    await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
    await handle.close();
    return answers;
  };
  const clientInfo = { name: 'krypt-manifest', version };
  const legacy = await ask([
    { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: LEGACY_VERSIONS[0], capabilities: {}, clientInfo } },
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  ] as JSONRPCMessage[]);
  const meta = { 'io.modelcontextprotocol/protocolVersion': MODERN_VERSION, 'io.modelcontextprotocol/clientCapabilities': {}, 'io.modelcontextprotocol/clientInfo': clientInfo };
  const modern = await ask([
    { jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: meta } },
    { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { _meta: meta } },
  ] as JSONRPCMessage[]);
  const empty = { 'prompts/list': { prompts: [] }, 'resources/list': { resources: [] }, 'resources/templates/list': { resourceTemplates: [] } };
  const legacyTools = legacy.get(2) ?? null;
  const modernTools = modern.get(2) as { error?: unknown } | undefined;
  return {
    server: SERVER_NAME,
    version,
    generatedAt: new Date().toISOString(),
    legacyVersions: LEGACY_VERSIONS,
    modernVersion: MODERN_VERSION,
    legacy: { initialize: legacy.get(1) ?? null, 'tools/list': legacyTools, ...empty },
    modern: { 'server/discover': modern.get(1) ?? null, 'tools/list': modernTools && !modernTools.error ? modernTools : legacyTools, ...empty },
    tools: TOOLS.map((t) => ({ name: t.name, title: t.title, kind: t.kind })),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function writeAtomic(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, file);
}

function tokenOk(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function pipePath(userData: string, suffix = ''): string {
  if (process.platform === 'win32') {
    const user = (os.userInfo().username || 'user').replace(/[^A-Za-z0-9_.-]/g, '_');
    return `\\\\.\\pipe\\krypt-marketo-mcp-${user}${suffix}`;
  }
  return path.join(userData, 'mcp.sock');
}

const CLIENT_LABELS: Record<string, string> = {
  kip: 'Kip',
  'claude-code': 'Claude Code',
  'claude-ai': 'Claude Desktop',
  'claude-desktop': 'Claude Desktop',
  codex: 'Codex',
  'codex-mcp-client': 'Codex',
  cursor: 'Cursor',
  'cursor-vscode': 'Cursor',
  vscode: 'VS Code',
  'visual-studio-code': 'VS Code',
  windsurf: 'Windsurf',
  'gemini-cli': 'Gemini CLI',
};
export function clientLabel(raw: string): string {
  const k = raw.toLowerCase();
  return CLIENT_LABELS[k] ?? (Object.entries(CLIENT_LABELS).find(([key]) => k.includes(key))?.[1] ?? raw);
}

/** One-line summary of a tool's arguments for the activity log. */
function argSummary(args: unknown): string {
  try {
    const s = JSON.stringify(args ?? {});
    return s === '{}' ? '' : s.length > 120 ? `${s.slice(0, 117)}…` : s;
  } catch {
    return '';
  }
}

// ── Server ─────────────────────────────────────────────────────────────────
/** Who a connection is. Kip is started by the hub itself (through Claude Code), so the hub's own word for him wins over what the program calls itself. */
const nameOf = (c: { hint: string; raw: string | null }): string => (c.hint === 'kip' ? 'Kip' : clientLabel(c.raw ?? c.hint));

interface Conn {
  id: number;
  socket: net.Socket;
  hint: string;
  raw: string | null;
  since: number;
  calls: number;
  close: (() => Promise<void>) | null;
}

export interface McpHandle {
  status(): McpStatus;
  stop(): Promise<void>;
  /** Run a tool for a caller inside the app (the built-in agent): same switch, same activity log. */
  invoke(client: string, name: string, args: unknown, signal: AbortSignal): Promise<ToolOutcome>;
  /** Re-capture the offline tool list / instructions (the brand profile changed). */
  refreshManifest(): void;
}

export async function startMcp(deps: McpDeps): Promise<McpHandle> {
  const token = crypto.randomBytes(32).toString('hex');
  const pipe = deps.pipe ?? pipePath(deps.userData, deps.pipeSuffix);
  const conns = new Map<number, Conn>();
  const activity: McpActivity[] = [];
  let nextId = 1;
  let listening = false;
  let error: string | null = null;

  const clients = (): McpClientInfo[] =>
    [...conns.values()].map((c) => ({ id: c.id, name: nameOf(c), since: c.since, calls: c.calls }));
  const status = (): McpStatus => ({
    enabled: deps.isEnabled(),
    listening,
    error,
    clients: clients(),
    activity: activity.slice(-40),
    shimPath: deps.shimPath,
    exePath: deps.exePath,
    toolCount: TOOLS.length,
    installCommand: deps.installCommand,
  });
  const broadcast = (): void => deps.onStatus(status());

  const observe = (c: Conn, m: JSONRPCMessage): void => {
    const mm = m as { method?: string; params?: { clientInfo?: { name?: string }; _meta?: Record<string, { name?: string }> } };
    const name = mm.params?.clientInfo?.name ?? mm.params?._meta?.['io.modelcontextprotocol/clientInfo']?.name;
    if (name && name !== c.raw && name !== 'krypt-manifest') {
      c.raw = name;
      broadcast();
    }
  };

  /** Run one tool call and keep the activity log (MCP clients and the built-in agent both come through here). */
  const run = async (who: string, def: ToolDef, args: unknown, onProgress: (fraction: number, message: string) => void, signal: AbortSignal): Promise<ToolOutcome> => {
    if (!deps.isEnabled()) return { ok: false, text: 'AI access is turned off in Krypt Marketo. Turn it on on the Connect page.' };
    const entry: McpActivity = { id: crypto.randomUUID(), ts: Date.now(), client: who, tool: def.name, args: argSummary(args), state: 'running', ms: 0, result: '' };
    activity.push(entry);
    if (activity.length > 200) activity.splice(0, activity.length - 200);
    broadcast();
    const t0 = Date.now();
    let outcome: ToolOutcome;
    try {
      outcome = await deps.runTool(def.name, args, who, onProgress, signal);
    } catch (e) {
      outcome = { ok: false, text: (e as Error).message || String(e) };
    }
    entry.state = outcome.ok ? 'ok' : 'error';
    entry.ms = Date.now() - t0;
    entry.result = outcome.text.split('\n')[0].slice(0, 160);
    deps.log(outcome.ok ? 'info' : 'warn', `[agent] ${who} ${def.name} ${outcome.ok ? 'ok' : 'failed'} (${entry.ms} ms): ${entry.result}`);
    broadcast();
    return outcome;
  };

  const callFor = (c: Conn) => async (def: ToolDef, args: unknown, extra: ToolExtra | undefined): Promise<CallToolResult> => {
    c.calls++;
    const outcome = await run(nameOf(c), def, args, progressSender(extra), extra?.mcpReq?.signal ?? new AbortController().signal);
    const content: CallToolResult['content'] = [{ type: 'text', text: outcome.text }];
    for (const img of outcome.images ?? []) content.push({ type: 'image', data: img.data, mimeType: img.mimeType });
    return { content, isError: !outcome.ok };
  };

  const onSocket = (socket: net.Socket): void => {
    const c: Conn = { id: nextId++, socket, hint: 'MCP client', raw: null, since: Date.now(), calls: 0, close: null };
    let buf = '';
    let authed = false;
    const timer = setTimeout(() => {
      if (!authed) socket.destroy();
    }, HELLO_TIMEOUT_MS);
    const deny = (message: string): void => {
      clearTimeout(timer);
      socket.end(`${JSON.stringify({ krypt: 'error', message })}\n`);
    };
    const onData = (chunk: Buffer): void => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl < 0) {
        if (buf.length > 4096) deny('hello line too long');
        return;
      }
      socket.removeListener('data', onData);
      clearTimeout(timer);
      let hello: { krypt?: string; token?: unknown; client?: unknown } | null = null;
      try {
        hello = JSON.parse(buf.slice(0, nl));
      } catch {
        /* fallthrough */
      }
      if (!hello || hello.krypt !== 'hello') return deny('Send {"krypt":"hello","token":…} first (connect through marketo-mcp).');
      if (!tokenOk(hello.token, token)) {
        deps.log('warn', 'MCP: rejected a pipe connection with a bad token');
        return deny('Bad token: Krypt Marketo restarted; reconnect.');
      }
      authed = true;
      if (typeof hello.client === 'string' && hello.client) c.hint = hello.client.slice(0, 60);
      const rest = buf.slice(nl + 1);
      socket.write(`${JSON.stringify({ krypt: 'ok', version: deps.version })}\n`);
      conns.set(c.id, c);
      const transport = new LineTransport(socket, rest, (m) => observe(c, m));
      const handle = serveStdio(() => buildServer(deps.version, { client: () => c.raw ?? c.hint, call: callFor(c) }), {
        transport,
        onerror: (e) => deps.log('warn', `MCP (${nameOf(c)}): ${e.message}`),
      });
      c.close = () => handle.close();
      deps.log('info', `MCP: ${clientLabel(c.hint)} connected`);
      broadcast();
    };
    socket.on('data', onData);
    socket.on('error', () => {});
    socket.on('close', () => {
      clearTimeout(timer);
      if (conns.delete(c.id)) {
        deps.log('info', `MCP: ${nameOf(c)} disconnected`);
        broadcast();
      }
    });
  };

  const server = net.createServer(onSocket);
  if (process.platform !== 'win32') {
    try {
      fs.unlinkSync(pipe);
    } catch {
      /* no stale socket */
    }
  }
  await new Promise<void>((resolve) => {
    server.once('error', (e) => {
      error = `Could not open the agent pipe: ${(e as Error).message}`;
      deps.log('error', `MCP: ${error}`);
      resolve();
    });
    server.listen(pipe, () => {
      listening = true;
      if (process.platform !== 'win32') {
        try {
          fs.chmodSync(pipe, 0o600);
        } catch {
          /* best effort */
        }
      }
      resolve();
    });
  });

  try {
    writeAtomic(
      path.join(deps.userData, 'mcp.json'),
      `${JSON.stringify({ pipe, token, appExePath: deps.appExePath, appArgs: deps.appArgs, shimPath: deps.shimPath, version: deps.version, pid: process.pid, writtenAt: new Date().toISOString() }, null, 2)}\n`,
    );
  } catch (e) {
    deps.log('error', `MCP: could not write mcp.json: ${(e as Error).message}`);
  }
  // The manifest changes when the app updates or the brand profile does; capture it off the boot path.
  const refreshManifest = (): void =>
    void captureManifest(deps.version)
      .then((m) => writeAtomic(path.join(deps.userData, 'mcp-manifest.json'), `${JSON.stringify(m, null, 2)}\n`))
      .catch((e) => deps.log('warn', `MCP: could not capture the tool manifest: ${(e as Error).message}`));
  refreshManifest();

  if (listening) deps.log('info', `MCP: listening on ${pipe} (${TOOLS.length} tools)`);
  broadcast();

  return {
    status,
    refreshManifest,
    async invoke(client, name, args, signal) {
      const def = TOOLS.find((t) => t.name === name);
      if (!def) return { ok: false, text: `Unknown tool "${name}".` };
      const parsed = def.input.safeParse(args ?? {});
      if (!parsed.success) return { ok: false, text: `Bad arguments for ${name}: ${parsed.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}` };
      return run(client, def, parsed.data, () => {}, signal);
    },
    async stop() {
      for (const c of conns.values()) await c.close?.().catch(() => {});
      await new Promise<void>((r) => server.close(() => r()));
    },
  };
}
