// The AI apps Kip can think with. Each one is a command-line program that takes
// one message, works through Marketo's tools and prints what it does as JSON
// lines. This file knows how to start each and how to read its lines; it has no
// Electron in it, so it can be checked on its own.
//
// Apps with only a window (Claude Desktop, ChatGPT desktop, Windsurf, VS Code's
// own chat) are not here: another program cannot hand them a message and read the answer.

export type KipEngineId = 'claude' | 'codex' | 'gemini' | 'cursor' | 'copilot';

export interface KipServer {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export type KipEvent =
  /** The conversation's id, to carry on with next time. */
  | { t: 'session'; id: string }
  /** Something he said. `delta`: a piece of a message still being written. `key`: the same text may come twice. */
  | { t: 'text'; text: string; key?: string; delta?: boolean }
  | { t: 'tool'; id: string; name: string; input?: unknown }
  | { t: 'toolEnd'; id: string; ok: boolean; text: string; images?: Array<{ data: string; mimeType: string }> }
  | { t: 'error'; text: string }
  /** The whole answer again at the end: shown only when nothing was said before it. */
  | { t: 'final'; text: string }
  | { t: 'usage'; model: string; input: number; output: number; cached: number };

export interface KipLaunchInput {
  /** Kip's own folder: the program is started in it. */
  dir: string;
  /** The conversation to carry on, or null for a new one. */
  session: string | null;
  /** An id for a new conversation, for programs that take one. */
  fresh: string;
  model?: string;
  /** Who Kip is and how he works. */
  system: string;
  servers: Record<string, KipServer>;
}

export interface KipLaunch {
  args: string[];
  env?: Record<string, string>;
  /** Files to write first, each a path under Kip's folder. */
  files?: Array<{ file: string; text: string }>;
  /** The conversation's id is already known (the program takes one of ours). */
  session?: string;
  /** The message goes in as the last argument instead of on stdin. */
  argPrompt?: boolean;
  /** This program has no place for standing instructions of its own: they go in front of a conversation's first message. */
  lead?: boolean;
}

export interface KipEngine {
  id: KipEngineId;
  name: string;
  /** The program's name(s) on the command line. */
  bins: string[];
  /** Found files that are not the program (VS Code puts a stand-in for Copilot's on the PATH). */
  skip?: RegExp;
  /** The model picked for scheduled runs fits this program. */
  takesModel?: boolean;
  /**
   * The most tools one request can carry, counting the program's own (none = no known limit). Cursor sends every tool in
   * every request and its providers refuse long lists; Codex and Copilot look tools up on demand ("tool search").
   */
  toolCap?: number;
  /** What to tell the user when it says they are not signed in. */
  signIn: string;
  launch(i: KipLaunchInput): KipLaunch;
  /** One printed line, already read as JSON. `mem` is this message's scratch space. */
  parse(j: Record<string, unknown>, mem: Record<string, unknown>): KipEvent[];
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** A tool's name as the chat shows it: Marketo's own tools by their plain name, others with their server in front. */
export function toolName(server: string, tool: string): string {
  return !server || server === 'marketo' ? tool : `${server}: ${tool}`;
}

/** Text (and pictures) out of an MCP tool result, in any of the shapes these programs print. */
export function resultOf(content: unknown): { text: string; images: Array<{ data: string; mimeType: string }> } {
  if (typeof content === 'string') return { text: content, images: [] };
  const texts: string[] = [];
  const images: Array<{ data: string; mimeType: string }> = [];
  for (const raw of Array.isArray(content) ? content : []) {
    const b = obj(raw);
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
    if (b.type !== 'image' || images.length >= 4) continue;
    const src = obj(b.source);
    // Claude Code: { source: { data, media_type } }. Plain MCP: { data, mimeType }.
    if (typeof src.data === 'string') images.push({ data: src.data, mimeType: str(src.media_type) || 'image/png' });
    else if (typeof b.data === 'string') images.push({ data: b.data, mimeType: str(b.mimeType) || 'image/png' });
  }
  return { text: texts.join('\n'), images };
}

const json = (v: unknown): string => JSON.stringify(v);

// ── Claude Code ─────────────────────────────────────────────────────────────
const claude: KipEngine = {
  id: 'claude',
  name: 'Claude Code',
  bins: ['claude'],
  takesModel: true,
  signIn: 'Open a terminal and run "claude" once to sign in, then ask again.',
  launch(i) {
    const cfg = `${i.dir}/tools.mcp.json`;
    const allowed = [...Object.keys(i.servers).map((n) => `mcp__${n}`), 'WebSearch', 'WebFetch'].join(',');
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--strict-mcp-config', '--mcp-config', cfg, '--allowedTools', allowed, '--append-system-prompt', i.system];
    if (i.session) args.push('--resume', i.session);
    if (i.model) args.push('--model', i.model);
    return { args, files: [{ file: 'tools.mcp.json', text: json({ mcpServers: i.servers }) }] };
  },
  parse(j) {
    const out: KipEvent[] = [];
    const msg = obj(j.message);
    const content = Array.isArray(msg.content) ? (msg.content as unknown[]).map(obj) : [];
    if (j.type === 'system' && j.subtype === 'init' && typeof j.session_id === 'string') out.push({ t: 'session', id: j.session_id });
    else if (j.type === 'assistant') {
      for (const b of content) {
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push({ t: 'text', text: b.text, key: `${str(msg.id)}|${b.text}` });
        // (ToolSearch is Claude Code looking up its own tool list: not something the user asked for.)
        else if (b.type === 'tool_use' && typeof b.id === 'string' && b.name !== 'ToolSearch') {
          const m = /^mcp__(.+?)__(.+)$/.exec(str(b.name));
          out.push({ t: 'tool', id: b.id, name: m ? toolName(m[1], m[2]) : str(b.name) || 'tool', input: b.input });
        }
      }
    } else if (j.type === 'user') {
      for (const b of content) {
        if (b.type !== 'tool_result' || typeof b.tool_use_id !== 'string') continue;
        const r = resultOf(b.content);
        out.push({ t: 'toolEnd', id: b.tool_use_id, ok: !b.is_error, text: r.text, ...(r.images.length ? { images: r.images } : {}) });
      }
    } else if (j.type === 'result') {
      if (typeof j.session_id === 'string') out.push({ t: 'session', id: j.session_id });
      if (j.is_error) out.push({ t: 'error', text: str(j.result) || 'Claude Code stopped with an error.' });
      else if (str(j.result).trim()) out.push({ t: 'final', text: str(j.result) });
      for (const [name, raw] of Object.entries(obj(j.modelUsage))) {
        const u = obj(raw);
        out.push({ t: 'usage', model: name, input: num(u.inputTokens) + num(u.cacheCreationInputTokens), output: num(u.outputTokens), cached: num(u.cacheReadInputTokens) });
      }
    }
    return out;
  },
};

// ── Codex ───────────────────────────────────────────────────────────────────
/** Codex takes settings as `-c key=value`, the value written as TOML. JSON strings and lists of strings are valid TOML as they are. */
function codexServers(servers: Record<string, KipServer>): string[] {
  const out: string[] = [];
  for (const [name, s] of Object.entries(servers)) {
    out.push('-c', `mcp_servers.${name}.command=${json(s.command)}`, '-c', `mcp_servers.${name}.args=${json(s.args)}`);
    // Without this Codex holds every tool call for a person to approve, and with no window that means refusing it.
    out.push('-c', `mcp_servers.${name}.default_tools_approval_mode="approve"`);
    // Renders and uploads take minutes; Codex's own default gives a tool 60 s.
    out.push('-c', `mcp_servers.${name}.tool_timeout_sec=1800`, '-c', `mcp_servers.${name}.startup_timeout_sec=60`);
    const env = Object.entries(s.env ?? {});
    if (env.length) out.push('-c', `mcp_servers.${name}.env={${env.map(([k, v]) => `${k}=${json(v)}`).join(',')}}`);
  }
  return out;
}

const codex: KipEngine = {
  id: 'codex',
  name: 'Codex',
  bins: ['codex'],
  signIn: 'Open a terminal and run "codex login" once to sign in, then ask again.',
  launch(i) {
    // Shell commands stay in the read-only sandbox and nothing waits for a person: Kip works through the tools.
    // The instructions go in on every message (a carried-on conversation may not keep them) and in AGENTS.md, which Codex reads from the folder it is started in.
    const common = ['--json', '--skip-git-repo-check', '-c', 'sandbox_mode="read-only"', '-c', 'approval_policy="never"', '-c', 'web_search="live"', '-c', `developer_instructions=${json(i.system)}`, ...codexServers(i.servers)];
    const args = i.session ? ['exec', 'resume', ...common, i.session, '-'] : ['exec', ...common, '-'];
    return { args, files: [{ file: 'AGENTS.md', text: i.system }], lead: true };
  },
  parse(j, mem) {
    const out: KipEvent[] = [];
    const type = str(j.type);
    const item = obj(j.item);
    const id = str(item.id);
    const seen = (mem.seen ??= new Set<string>()) as Set<string>;
    const start = (name: string, input: unknown): void => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      out.push({ t: 'tool', id, name, input });
    };
    if (type === 'thread.started' && typeof j.thread_id === 'string') out.push({ t: 'session', id: j.thread_id });
    else if (type === 'item.started' || type === 'item.updated' || type === 'item.completed') {
      const done = type === 'item.completed';
      const kind = str(item.type);
      if (kind === 'agent_message') {
        if (done && str(item.text).trim()) out.push({ t: 'text', text: str(item.text), key: id || undefined });
      } else if (kind === 'mcp_tool_call') {
        start(toolName(str(item.server), str(item.tool) || 'tool'), item.arguments);
        if (done) {
          const err = obj(item.error);
          const failed = item.status === 'failed' || !!str(err.message);
          const r = resultOf(obj(item.result).content);
          out.push({ t: 'toolEnd', id, ok: !failed, text: failed ? str(err.message) || r.text || 'The tool failed.' : r.text, ...(r.images.length ? { images: r.images } : {}) });
        }
      } else if (kind === 'web_search') {
        start('web search', str(item.query) ? { query: item.query } : undefined);
        if (done) out.push({ t: 'toolEnd', id, ok: true, text: str(item.query) });
      } else if (kind === 'command_execution') {
        start('command', str(item.command) ? { command: item.command } : undefined);
        if (done) out.push({ t: 'toolEnd', id, ok: item.status !== 'failed' && !(num(item.exit_code) > 0), text: str(item.aggregated_output) });
      }
      // (An item of type "error" is a warning, such as a change of connection: the turn goes on.)
    } else if (type === 'turn.completed') {
      const u = obj(j.usage);
      const cached = num(u.cached_input_tokens);
      out.push({ t: 'usage', model: 'Codex', input: Math.max(0, num(u.input_tokens) - cached), output: num(u.output_tokens), cached });
    } else if (type === 'turn.failed') out.push({ t: 'error', text: str(obj(j.error).message) || 'Codex stopped with an error.' });
    // ("Reconnecting... 2/5" is Codex trying again by itself, not the end of the turn.)
    else if (type === 'error' && str(j.message) && !/^Reconnecting\b/i.test(str(j.message))) out.push({ t: 'error', text: str(j.message) });
    return out;
  },
};

// ── Gemini CLI ──────────────────────────────────────────────────────────────
const gemini: KipEngine = {
  id: 'gemini',
  name: 'Gemini CLI',
  bins: ['gemini'],
  signIn: 'Open a terminal and run "gemini" once to sign in, then ask again.',
  launch(i) {
    const names = Object.keys(i.servers);
    // Its settings for this folder: the tool servers, trusted so their tools run without a person saying yes.
    // Anything else that would ask (shell commands, writing files) is refused when there is no window.
    const settings = { mcpServers: Object.fromEntries(Object.entries(i.servers).map(([n, s]) => [n, { ...s, trust: true }])), mcp: { allowed: names } };
    const args = ['--output-format', 'stream-json', '--skip-trust', ...(i.session ? ['--resume', i.session] : ['--session-id', i.fresh]), '--allowed-mcp-server-names', ...names];
    return {
      args,
      files: [
        { file: '.gemini/settings.json', text: json(settings) },
        { file: 'GEMINI.md', text: i.system },
      ],
      lead: true,
    };
  },
  parse(j, mem) {
    const out: KipEvent[] = [];
    const type = str(j.type);
    if (type === 'init') {
      if (typeof j.session_id === 'string') out.push({ t: 'session', id: j.session_id });
      mem.model = str(j.model);
    } else if (type === 'message') {
      if (j.role === 'assistant' && str(j.content)) out.push({ t: 'text', text: str(j.content), delta: j.delta === true });
    } else if (type === 'tool_use' && typeof j.tool_id === 'string') {
      // MCP tools are named mcp_<server>_<tool>; a server's own name can hold an underscore, so the known ones are tried first.
      const full = str(j.tool_name);
      const known = /^mcp_(marketo|krypt-editor)_(.+)$/.exec(full);
      out.push({ t: 'tool', id: j.tool_id, name: known ? toolName(known[1], known[2]) : full.replace(/^mcp_/, '') || 'tool', input: j.parameters });
    } else if (type === 'tool_result' && typeof j.tool_id === 'string') {
      const failed = j.status === 'error';
      out.push({ t: 'toolEnd', id: j.tool_id, ok: !failed, text: failed ? str(obj(j.error).message) || str(j.output) || 'The tool failed.' : str(j.output) });
    } else if (type === 'error') {
      if (j.severity !== 'warning' && str(j.message)) out.push({ t: 'error', text: str(j.message) });
    } else if (type === 'result') {
      if (j.status === 'error') out.push({ t: 'error', text: str(obj(j.error).message) || 'Gemini CLI stopped with an error.' });
      const models = Object.entries(obj(obj(j.stats).models));
      for (const [name, raw] of models) {
        const m = obj(raw);
        const cached = num(m.cached);
        out.push({ t: 'usage', model: name, input: m.input === undefined ? Math.max(0, num(m.input_tokens) - cached) : num(m.input), output: num(m.output_tokens), cached });
      }
      if (!models.length) {
        const s = obj(j.stats);
        const cached = num(s.cached);
        out.push({ t: 'usage', model: str(mem.model) || 'Gemini', input: Math.max(0, num(s.input_tokens) - cached), output: num(s.output_tokens), cached });
      }
    }
    return out;
  },
};

// ── Cursor (its command-line agent) ─────────────────────────────────────────
// From Cursor's docs and other projects' readers of its output; not yet seen running with Marketo.
const cursor: KipEngine = {
  id: 'cursor',
  name: 'Cursor',
  bins: ['cursor-agent'],
  toolCap: 128,
  signIn: 'Open a terminal and run "cursor-agent login" once to sign in, then ask again.',
  launch(i) {
    const names = Object.keys(i.servers);
    // No --force: commands and file edits stay refused. The tool servers' own tools are allowed by name in this folder's settings.
    const args = ['-p', '--output-format', 'stream-json', '--trust', '--approve-mcps', ...(i.session ? ['--resume', i.session] : [])];
    return {
      args,
      files: [
        { file: '.cursor/mcp.json', text: json({ mcpServers: i.servers }) },
        { file: '.cursor/cli.json', text: json({ permissions: { allow: names.map((n) => `Mcp(${n}:*)`), deny: [] } }) },
        { file: 'AGENTS.md', text: i.system },
      ],
      lead: true,
      // (Its docs give the message as an argument; nothing says it reads one from stdin.)
      argPrompt: true,
    };
  },
  parse(j) {
    const out: KipEvent[] = [];
    const type = str(j.type);
    if (type === 'system' && j.subtype === 'init' && typeof j.session_id === 'string') out.push({ t: 'session', id: j.session_id });
    else if (type === 'assistant') {
      const content = obj(j.message).content;
      for (const raw of Array.isArray(content) ? content : []) {
        const b = obj(raw);
        if (b.type === 'text' && typeof b.text === 'string' && b.text.trim()) out.push({ t: 'text', text: b.text });
      }
    } else if (type === 'tool_call' && typeof j.call_id === 'string') {
      const call = obj(j.tool_call);
      // One key names the kind of tool: mcpToolCall for a tool server's, readToolCall and the like for its own.
      const kind = Object.keys(call)[0] ?? '';
      const body = obj(call[kind]);
      const a = obj(body.args);
      if (j.subtype === 'started') {
        const name = kind === 'mcpToolCall' ? toolName(str(a.providerIdentifier), str(a.toolName) || str(a.name) || 'tool') : kind.replace(/ToolCall$/, '') || 'tool';
        out.push({ t: 'tool', id: j.call_id, name, input: kind === 'mcpToolCall' ? a.args : a });
      } else if (j.subtype === 'completed') {
        const res = obj(body.result);
        const good = obj(res.success);
        const bad = obj(res.rejected ?? res.failure ?? res.error);
        const failed = !('success' in res) || good.isError === true;
        // Its text blocks are { text: { text } }; plain MCP ones are read too.
        const blocks = Array.isArray(good.content) ? good.content.map(obj) : [];
        const text = blocks.map((b) => str(obj(b.text).text) || str(b.text)).filter(Boolean).join('\n');
        out.push({ t: 'toolEnd', id: j.call_id, ok: !failed, text: failed ? str(bad.reason) || str(bad.message) || str(bad.errorMessage) || text || 'The tool was refused or failed.' : text });
      }
    } else if (type === 'result') {
      if (typeof j.session_id === 'string') out.push({ t: 'session', id: j.session_id });
      if (j.is_error === true) out.push({ t: 'error', text: str(j.result) || 'Cursor stopped with an error.' });
      else if (str(j.result).trim()) out.push({ t: 'final', text: str(j.result) });
      const u = obj(j.usage);
      if (num(u.inputTokens) || num(u.outputTokens)) out.push({ t: 'usage', model: 'Cursor', input: num(u.inputTokens) + num(u.cacheWriteTokens), output: num(u.outputTokens), cached: num(u.cacheReadTokens) });
    }
    return out;
  },
};

// ── GitHub Copilot (its command-line program; the one VS Code's Copilot plan covers) ──
// From GitHub's docs and other projects' recordings of its output; not yet seen running with Marketo.
const copilot: KipEngine = {
  id: 'copilot',
  name: 'GitHub Copilot',
  bins: ['copilot'],
  skip: /copilot-shim/i,
  signIn: 'Open a terminal and run "copilot" once, then /login to sign in, and ask again.',
  launch(i) {
    const names = Object.keys(i.servers);
    const cfg = `${i.dir}/copilot.mcp.json`;
    // It takes an id of ours: the first message with it starts the conversation, later ones carry it on.
    const id = i.session ?? i.fresh;
    const args = ['--output-format=json', '--no-color', '--no-ask-user', '--no-auto-update', `--additional-mcp-config=@${cfg}`, ...names.map((n) => `--allow-tool=${n}`), `--session-id=${id}`, ...(i.model ? [`--model=${i.model}`] : [])];
    return {
      args,
      files: [
        { file: 'copilot.mcp.json', text: json({ mcpServers: Object.fromEntries(Object.entries(i.servers).map(([n, s]) => [n, { type: 'local', ...s, tools: ['*'] }])) }) },
        { file: 'AGENTS.md', text: i.system },
      ],
      lead: true,
      session: id,
    };
  },
  parse(j, mem) {
    const out: KipEvent[] = [];
    const type = str(j.type);
    const d = obj(j.data);
    if (type === 'session.start' || type === 'session.resume') {
      if (typeof d.sessionId === 'string') out.push({ t: 'session', id: d.sessionId });
      if (str(d.selectedModel)) mem.model = str(d.selectedModel);
    } else if (type === 'assistant.message') {
      if (str(d.content).trim()) out.push({ t: 'text', text: str(d.content), key: str(d.messageId) || undefined });
    } else if (type === 'tool.execution_start' && typeof d.toolCallId === 'string') {
      const name = str(d.mcpToolName) ? toolName(str(d.mcpServerName), str(d.mcpToolName)) : str(d.toolName) || 'tool';
      out.push({ t: 'tool', id: d.toolCallId, name, input: d.arguments });
    } else if (type === 'tool.execution_complete' && typeof d.toolCallId === 'string') {
      const res = obj(d.result);
      const failed = d.success === false;
      out.push({ t: 'toolEnd', id: d.toolCallId, ok: !failed, text: failed ? str(obj(d.error).message) || 'The tool was refused or failed.' : str(res.content) || str(res.detailedContent) });
    } else if (type === 'assistant.usage') {
      out.push({ t: 'usage', model: str(d.model) || str(mem.model) || 'Copilot', input: num(d.inputTokens) + num(d.cacheWriteTokens), output: num(d.outputTokens), cached: num(d.cacheReadTokens) });
    } else if (type === 'session.error') {
      if (str(d.message)) out.push({ t: 'error', text: str(d.message) });
    } else if (type === 'result') {
      if (typeof j.sessionId === 'string') out.push({ t: 'session', id: j.sessionId });
    }
    return out;
  },
};

/** In the order Kip tries them when the user has not picked one. */
export const KIP_ENGINES: KipEngine[] = [claude, codex, gemini, cursor, copilot];

export const kipEngine = (id: string): KipEngine | undefined => KIP_ENGINES.find((e) => e.id === id);
