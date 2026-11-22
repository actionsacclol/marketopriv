// The built-in chat: for people who don't run an MCP app. They paste an API
// key for any OpenAI-compatible provider (xAI/Grok, OpenAI, OpenRouter, a local
// Ollama, …) and the hub runs the tool loop itself, with the same tools and
// the same limits as an AI connected over MCP.
//
// The key is encrypted with the OS keychain (safeStorage) and never leaves
// this process except as the Authorization header to the chosen provider.

import { app } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import type { ActionResult, AgentConfig, ChatState, ChatStep } from '../shared/types';
import { providerById } from '../shared/providers';
import type { McpHandle, ToolOutcome } from './mcp/index';
import { TOOLS, serverInstructions } from './mcp/tools';
import * as store from './store';
import * as usage from './usage';
import * as instance from './instance';
import { SecretFile } from './secret';

const MAX_ROUNDS = 60;
const KEEP_FULL_RESULTS = 6;
const RESULT_CAP = 20_000;

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}
type Part = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
interface Msg {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Part[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface Deps {
  mcp(): McpHandle | null;
  onState(s: ChatState): void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

let deps: Deps;
let messages: Msg[] = [];
let steps: ChatStep[] = [];
let busy = false;
let abort: AbortController | null = null;

export function init(d: Deps): void {
  deps = d;
}

// ── Key ────────────────────────────────────────────────────────────────────
const keyFile = (): string => path.join(instance.ROOT, 'agent-key.bin');

const key = new SecretFile(keyFile);
const readKey = (): string => key.get();
/** Read the saved key (at start, after secret.init). */
export const loadKey = (): Promise<string> => key.load();

function writeKey(k: string): void {
  // No OS encryption available: the key stays in memory for this run only, never on disk in the clear.
  key.set(k.trim()).catch((e) => deps.log('warn', `agent: could not store the key: ${(e as Error).message}`));
}

const config = (): AgentConfig => store.get().agent;
const needsKey = (): boolean => !providerById(config().provider).local;

export const state = (): ChatState => ({ busy, hasKey: !needsKey() || !!readKey(), steps: steps.map((s) => ({ ...s })) });
const changed = (): void => deps.onState(state());

export function saveConfig(patch: Partial<AgentConfig>, apiKey?: string): ActionResult {
  const next = { ...patch };
  if (next.baseUrl !== undefined) next.baseUrl = next.baseUrl.trim().replace(/\/+$/, '');
  if (next.model !== undefined) next.model = next.model.trim();
  store.saveAgentConfig(next);
  if (apiKey !== undefined) writeKey(apiKey);
  changed();
  return { ok: true };
}

// ── Provider calls ─────────────────────────────────────────────────────────
function headers(): Record<string, string> {
  const key = readKey();
  return { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) };
}

function checkConfig(): string | null {
  const c = config();
  if (!/^https?:\/\//i.test(c.baseUrl)) return 'Set the provider\'s API address first (it starts with https://).';
  if (needsKey() && !readKey()) return 'Add your API key first.';
  return null;
}

async function failText(res: Response): Promise<string> {
  const body = (await res.text().catch(() => '')).slice(0, 400);
  let detail = body;
  try {
    const j = JSON.parse(body) as { error?: { message?: string } | string };
    detail = typeof j.error === 'string' ? j.error : j.error?.message ?? body;
  } catch {
    /* not JSON */
  }
  return `The provider answered ${res.status}${detail ? `: ${detail}` : ''}`;
}

export async function models(): Promise<ActionResult<string[]>> {
  const bad = checkConfig();
  if (bad) return { ok: false, message: bad };
  try {
    const res = await fetch(`${config().baseUrl}/models`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return { ok: false, message: await failText(res) };
    const j = (await res.json()) as { data?: Array<{ id?: string }> };
    const ids = (j.data ?? []).map((m) => String(m.id ?? '')).filter(Boolean).sort();
    return ids.length ? { ok: true, data: ids } : { ok: false, message: 'The provider returned no models. Type the model name by hand.' };
  } catch (e) {
    return { ok: false, message: `Couldn't reach ${config().baseUrl}: ${(e as Error).message}` };
  }
}

const toolSpecs = (): unknown[] =>
  TOOLS.map((t) => {
    const { $schema: _drop, ...parameters } = z.toJSONSchema(t.input) as Record<string, unknown>;
    return { type: 'function', function: { name: t.name, description: t.description, parameters } };
  });

function systemPrompt(): string {
  return `${serverInstructions()}

You are the assistant built into Krypt Marketo's Chat page. Use the tools to do what the user asks instead of describing what you would do. Keep chat replies short and plain. When a tool says something is waiting for the user's approval, tell them it is waiting in the bar at the top of the hub, then call the same tool again to continue. If a tool refuses because of a limit or a rule, say so and stop; do not try another route.`;
}

/** Old tool results are the bulk of the context (page listings): keep the recent ones whole, shorten the rest. */
function trimmed(): Msg[] {
  const toolIdx = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  const keep = new Set(toolIdx.slice(-KEEP_FULL_RESULTS));
  return messages.map((m, i) => {
    if (m.role === 'tool' && !keep.has(i) && typeof m.content === 'string' && m.content.length > 700) return { ...m, content: `${m.content.slice(0, 500)}\n[…older result shortened]` };
    if (m.role === 'user' && Array.isArray(m.content) && i < messages.length - 8) return { ...m, content: '[images from an earlier step, removed]' };
    return m;
  });
}

const step = (s: Omit<ChatStep, 'id'>): ChatStep => {
  const full: ChatStep = { ...s, id: crypto.randomUUID() };
  steps.push(full);
  if (steps.length > 400) steps.splice(0, steps.length - 400);
  changed();
  return full;
};

async function complete(signal: AbortSignal): Promise<Msg> {
  const c = config();
  const res = await fetch(`${c.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: headers(),
    signal,
    body: JSON.stringify({ model: c.model, messages: [{ role: 'system', content: systemPrompt() }, ...trimmed()], tools: toolSpecs(), tool_choice: 'auto' }),
  });
  if (!res.ok) throw new Error(await failText(res));
  const j = (await res.json()) as { choices?: Array<{ message?: Msg }>; error?: { message?: string }; usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } };
  // What this answer used, for the usage table on the Autopilot page.
  if (j.usage) usage.addChat(c.model, j.usage.prompt_tokens ?? 0, j.usage.completion_tokens ?? 0, j.usage.prompt_tokens_details?.cached_tokens ?? 0);
  const m = j.choices?.[0]?.message;
  if (!m) throw new Error(j.error?.message ?? 'The provider sent an empty answer.');
  return { role: 'assistant', content: m.content ?? null, ...(m.tool_calls?.length ? { tool_calls: m.tool_calls } : {}) };
}

const textOf = (c: Msg['content']): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((p) => (p.type === 'text' ? p.text : '')).join('') : '');

export async function send(text: string): Promise<void> {
  const say = text.trim();
  if (!say || busy) return;
  step({ role: 'user', text: say });
  const bad = checkConfig() ?? (config().model ? null : 'Pick a model first.');
  if (bad) {
    step({ role: 'error', text: bad });
    return;
  }
  const mcp = deps.mcp();
  if (!mcp) {
    step({ role: 'error', text: 'The tool server did not start (see marketo.log).' });
    return;
  }
  messages.push({ role: 'user', content: say });
  busy = true;
  abort = new AbortController();
  const signal = abort.signal;
  const who = `Chat (${config().model})`;
  changed();
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const m = await complete(signal);
      messages.push(m);
      const said = textOf(m.content).trim();
      if (said) step({ role: 'assistant', text: said });
      if (!m.tool_calls?.length) return;
      const pictures: Part[] = [];
      for (const call of m.tool_calls) {
        const name = call.function?.name ?? '';
        const s = step({ role: 'tool', tool: name, text: (call.function?.arguments ?? '').slice(0, 200), state: 'running' });
        let out: ToolOutcome;
        try {
          const args = call.function?.arguments?.trim() ? (JSON.parse(call.function.arguments) as unknown) : {};
          out = await mcp.invoke(who, name, args, signal);
        } catch (e) {
          out = { ok: false, text: `Could not run ${name}: ${(e as Error).message}` };
        }
        s.state = out.ok ? 'ok' : 'error';
        s.text = out.text.split('\n').slice(0, 3).join('\n').slice(0, 400);
        s.images = out.images;
        changed();
        messages.push({ role: 'tool', tool_call_id: call.id, content: out.text.length > RESULT_CAP ? `${out.text.slice(0, RESULT_CAP)}\n[cut]` : out.text });
        if (config().vision) for (const img of out.images ?? []) pictures.push({ type: 'image_url', image_url: { url: `data:${img.mimeType};base64,${img.data}` } });
        if (signal.aborted) return;
      }
      // Tool messages carry text only; pictures follow as a user turn for models that can see.
      if (pictures.length) messages.push({ role: 'user', content: [{ type: 'text', text: 'The images those tools returned:' }, ...pictures] });
    }
    step({ role: 'error', text: `Stopped after ${MAX_ROUNDS} steps. Say "continue" to go on.` });
  } catch (e) {
    if (!signal.aborted) {
      step({ role: 'error', text: (e as Error).message });
      deps.log('warn', `agent: ${(e as Error).message}`);
    }
  } finally {
    // Every tool call must have an answer, or the provider rejects the next request.
    const answered = new Set(messages.filter((x) => x.role === 'tool').map((x) => x.tool_call_id));
    for (const m of messages) for (const c of m.tool_calls ?? []) if (!answered.has(c.id)) messages.push({ role: 'tool', tool_call_id: c.id, content: 'Stopped before this ran.' });
    for (const s of steps) if (s.state === 'running') s.state = 'error';
    busy = false;
    abort = null;
    changed();
  }
}

export function stop(): void {
  abort?.abort();
}

export function reset(): void {
  abort?.abort();
  messages = [];
  steps = [];
  changed();
}
