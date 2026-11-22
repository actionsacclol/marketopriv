#!/usr/bin/env node
'use strict';
/**
 * marketo-mcp — the stdio bridge MCP clients launch (Claude, Codex, Cursor, …) to reach
 * Krypt Marketo. Adapted from Krypt Editor's krypt-editor-mcp.cjs.
 *
 * It is plain Node with no dependencies. Clients run it with the Krypt Marketo
 * executable itself as the Node runtime (ELECTRON_RUN_AS_NODE=1), so nothing
 * extra has to be installed. It relays newline-delimited JSON-RPC between the
 * client's stdio and the running app's per-user pipe; the MCP server itself
 * lives in the app (electron/mcp).
 *
 *   App running        → every message is relayed.
 *   App closed         → discovery (initialize, server/discover, tools/list,
 *                        prompts/list, resources/list) is answered from
 *                        mcp-manifest.json, the answers the app captured at its
 *                        last start, so clients can list tools without the app
 *                        popping open at every session start. A tool call
 *                        launches the app (packaged builds) and waits for it.
 *   App quits mid-run  → in-flight requests get an error; the next request
 *                        reconnects and, for 2025-era clients, the shim replays
 *                        `initialize` so the new session is ready.
 *
 * Flags: --client <name> (label until the client's clientInfo arrives),
 *        --config <path to mcp.json>, --no-launch, --print-config-path.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const CLIENT = flag('--client') || process.env.KRYPT_MCP_CLIENT || 'mcp-client';
const NO_LAUNCH = argv.includes('--no-launch') || process.env.KRYPT_AUTOLAUNCH === '0';

function userDataDir() {
  const name = 'Krypt Marketo';
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), name);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', name);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), name);
}
/** The base app's connection file; its folder holds the profile list and the profiles. */
const BASE_CONFIG = flag('--config') || process.env.KRYPT_MARKETO_MCP_CONFIG || path.join(userDataDir(), 'mcp.json');
const ROOT = path.dirname(BASE_CONFIG);
const PROFILE_ID = /^(main|p_[a-z0-9]+)$/;
/**
 * Multi-instance mode (each profile in its own window): the profile this bridge works in. --profile picks it (the
 * autopilot gives each profile's run its own); use_profile moves it. Left out: the base app (Main).
 */
let profile = PROFILE_ID.test(flag('--profile') || '') ? flag('--profile') : null;
const configFor = (id) => (id && id !== 'main' ? path.join(ROOT, 'profiles', id, 'app', 'mcp.json') : BASE_CONFIG);
let CONFIG = configFor(profile);
/** The tool list the app saved at its last start (a profile's window that never ran yet answers from the base app's). */
const manifestFile = () => {
  const own = path.join(path.dirname(CONFIG), 'mcp-manifest.json');
  return fs.existsSync(own) ? own : path.join(ROOT, 'mcp-manifest.json');
};

if (argv.includes('--print-config-path')) {
  process.stdout.write(`${CONFIG}\n`);
  process.exit(0);
}

const LAUNCH_WAIT_MS = 25000;
const REPLAY_ID = 'krypt-replay-initialize';

// ── stdio framing ──────────────────────────────────────────────────────────
function lineReader(stream, onLine) {
  let buf = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line.trim()) onLine(line);
    }
  });
}
const out = (msg) => process.stdout.write(`${JSON.stringify(msg)}\n`);
const log = (...a) => process.stderr.write(`[marketo-mcp] ${a.join(' ')}\n`);

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

// ── State ──────────────────────────────────────────────────────────────────
/** The client's 2025-era initialize request, replayed on every (re)connect. */
let savedInit = null;
/** The socket to the app once connected and authorised. */
let conn = null;
let connecting = null;
/** Ids we forwarded and haven't seen answered (they get an error if the app goes away). */
const inflight = new Map();
/** 2026-era subscriptions/listen requests held while the app is closed (never launch for these). */
const heldListens = [];

function connect(cfg) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(cfg.pipe);
    let buf = '';
    let done = false;
    const fail = (e) => {
      if (done) return;
      done = true;
      sock.destroy();
      reject(e);
    };
    const timer = setTimeout(() => fail(new Error('timed out waiting for Krypt Marketo')), 5000);
    sock.once('error', fail);
    sock.on('connect', () => sock.write(`${JSON.stringify({ krypt: 'hello', token: cfg.token, client: CLIENT })}\n`));
    const onData = (chunk) => {
      buf += chunk.toString('utf8');
      const nl = buf.indexOf('\n');
      if (nl < 0) return;
      clearTimeout(timer);
      sock.removeListener('data', onData);
      sock.removeListener('error', fail);
      let reply = null;
      try {
        reply = JSON.parse(buf.slice(0, nl));
      } catch {
        /* fallthrough */
      }
      if (!reply || reply.krypt !== 'ok') return fail(new Error((reply && reply.message) || 'Krypt Marketo refused the connection'));
      done = true;
      const rest = buf.slice(nl + 1);
      resolve({ sock, rest });
    };
    sock.on('data', onData);
  });
}

function attach(sock, rest) {
  conn = sock;
  let buf = rest;
  const handle = (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    if (msg && msg.id === REPLAY_ID) return; // our replayed initialize: the client already has its answer
    if (msg && msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) inflight.delete(JSON.stringify(msg.id));
    out(msg);
  };
  const drain = () => {
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line.trim()) handle(line);
    }
  };
  drain();
  sock.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    drain();
  });
  const gone = () => {
    if (conn !== sock) return;
    conn = null;
    for (const [, id] of inflight) out({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Krypt Marketo closed while handling this request. Retry to reopen it.' } });
    inflight.clear();
  };
  sock.on('close', gone);
  sock.on('error', gone);
}

function send(msg) {
  if (msg.id !== undefined && msg.method) inflight.set(JSON.stringify(msg.id), msg.id);
  conn.write(`${JSON.stringify(msg)}\n`);
}

function launchApp(given) {
  // A profile's window that never ran has no connection file yet: start the base app's program as that profile.
  let cfg = given;
  if (!cfg && profile && profile !== 'main') {
    const base = readJson(BASE_CONFIG);
    if (base) cfg = { ...base, appArgs: [...(base.appArgs || []).filter((a) => !String(a).startsWith('--profile=')), `--profile=${profile}`] };
  }
  if (NO_LAUNCH || !cfg || !cfg.appExePath || !fs.existsSync(cfg.appExePath)) return false;
  try {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE; // the app must start as an app, not as Node
    // A profile set to run in the background starts without a window.
    const entry = profile && profile !== 'main' ? (profileList() || []).find((p) => p.id === profile) : null;
    const bg = entry && entry.background === true ? ['--background'] : [];
    const child = spawn(cfg.appExePath, [...(cfg.appArgs || []), `--launched-by-agent=${CLIENT}`, ...bg], { detached: true, stdio: 'ignore', env, windowsHide: false });
    child.unref();
    return true;
  } catch (e) {
    log('launch failed:', e.message);
    return false;
  }
}

/** Connect to the running app; with launch=true start it first if it isn't running. */
async function ensureConnected(launch) {
  if (conn) return true;
  if (connecting) return connecting;
  connecting = (async () => {
    const tryOnce = async () => {
      const cfg = readJson(CONFIG);
      if (!cfg || !cfg.pipe || !cfg.token) return false;
      try {
        const { sock, rest } = await connect(cfg);
        attach(sock, rest);
        if (savedInit) {
          send({ ...savedInit, id: REPLAY_ID });
          inflight.delete(JSON.stringify(REPLAY_ID));
          sock.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
        }
        for (const m of heldListens.splice(0)) send(m);
        return true;
      } catch {
        return false;
      }
    };
    if (await tryOnce()) return true;
    if (!launch || !launchApp(readJson(CONFIG))) return false;
    const until = Date.now() + LAUNCH_WAIT_MS;
    while (Date.now() < until) {
      await new Promise((r) => setTimeout(r, 500));
      if (await tryOnce()) return true;
    }
    return false;
  })();
  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

// ── Offline answers ────────────────────────────────────────────────────────
const LIST_METHODS = new Set(['tools/list', 'prompts/list', 'resources/list', 'resources/templates/list']);

function offlineAnswer(msg) {
  const man = readJson(manifestFile());
  if (!man) return null;
  if (msg.method === 'initialize') {
    const init = man.legacy && man.legacy.initialize;
    if (!init || init.error) return null;
    const asked = msg.params && msg.params.protocolVersion;
    const versions = man.legacyVersions || [];
    return { ...init, protocolVersion: versions.includes(asked) ? asked : init.protocolVersion };
  }
  if (msg.method === 'server/discover') {
    const d = man.modern && man.modern['server/discover'];
    return d && !d.error ? d : null;
  }
  if (LIST_METHODS.has(msg.method)) {
    const modern = !!(msg.params && msg.params._meta && msg.params._meta['io.modelcontextprotocol/protocolVersion']);
    const src = (modern ? man.modern : man.legacy) || man.legacy;
    const r = src && src[msg.method];
    return r && !r.error ? r : null;
  }
  return null;
}

const notRunning = 'Krypt Marketo isn\'t running. Open Krypt Marketo, then retry.';

// ── Multi-instance mode: moving this conversation to another profile's window ──
function profileList() {
  const j = readJson(path.join(ROOT, 'profiles.json'));
  if (!j || j.multiInstance !== true) return null;
  const list = Array.isArray(j.list) ? j.list.filter((p) => p && PROFILE_ID.test(String(p.id)) && typeof p.name === 'string') : [];
  if (!list.some((p) => p.id === 'main')) list.unshift({ id: 'main', name: 'Main' });
  return list;
}

/** use_profile in multi-instance mode: this bridge reconnects to that profile's window (started if it is closed). */
async function moveTo(msg) {
  const list = profileList();
  const asked = String((msg.params && msg.params.arguments && msg.params.arguments.id) || '').trim().toLowerCase();
  const answer = (text, isError) => out({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) } });
  const p = list.find((x) => x.id === asked) || list.find((x) => x.name.toLowerCase() === asked);
  if (!p) return answer(`No profile "${asked}". Profiles: ${list.map((x) => `"${x.name}" (${x.id})`).join(', ')}.`, true);
  if ((profile || 'main') === p.id && conn) return answer(`This conversation works in the profile "${p.name}" (${p.id}) already. Nothing changed.`);
  const from = profile || 'main';
  profile = p.id;
  CONFIG = configFor(p.id);
  if (conn) {
    const old = conn;
    conn = null;
    old.end();
  }
  if (!(await ensureConnected(true))) {
    profile = from;
    CONFIG = configFor(from);
    return answer(`Could not open the profile "${p.name}" in its own window. The user opens it on the Multi run page, then you try again.`, true);
  }
  return answer(`This conversation now works in the profile "${p.name}" (${p.id}), in its own Krypt Marketo window. Other conversations and windows are not affected. Everything you read before belongs to the profile you left: call get_overview and get_today again before doing anything.`);
}

async function onClientMessage(msg) {
  if (!msg || typeof msg !== 'object') return;
  if (msg.method === 'initialize' && msg.id !== undefined) savedInit = msg;
  const isRequest = msg.id !== undefined && typeof msg.method === 'string';
  if (isRequest && msg.method === 'tools/call' && msg.params && msg.params.name === 'use_profile' && profileList()) return moveTo(msg);

  if (conn) return send(msg);

  // Notifications and responses while the app is closed have nowhere to go.
  if (!isRequest) return;

  if (msg.method === 'ping') return out({ jsonrpc: '2.0', id: msg.id, result: {} });

  if (msg.method === 'subscriptions/listen') {
    // Clients open this at startup and re-open it right after the app quits:
    // launching here would reopen a window the user just closed. Hold it.
    if (await ensureConnected(false)) return send(msg);
    heldListens.push(msg);
    return;
  }

  if (msg.method === 'initialize' || msg.method === 'server/discover' || LIST_METHODS.has(msg.method)) {
    // Discovery never launches the app. Use it if it's already running.
    if (await ensureConnected(false)) return send(msg);
    const answer = offlineAnswer(msg);
    if (answer) return out({ jsonrpc: '2.0', id: msg.id, result: answer });
    return out({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: `${notRunning} (No cached tool list yet: start Krypt Marketo once.)` } });
  }

  // Anything else (tools/call, resources/read, prompts/get, …) needs the app.
  if (await ensureConnected(true)) return send(msg);
  if (msg.method === 'tools/call') return out({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text: notRunning }], isError: true } });
  return out({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: notRunning } });
}

// Process messages strictly in order: a tools/call that has to launch the app
// must not be overtaken by the request behind it.
let chain = Promise.resolve();
lineReader(process.stdin, (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    out({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  chain = chain.then(() => onClientMessage(msg)).catch((e) => log('error:', e && e.message));
});
process.stdin.on('end', () => {
  chain.finally(() => {
    if (conn) conn.end();
    process.exit(0);
  });
});
