#!/usr/bin/env node
'use strict';
/**
 * marketo-chrome-host — the native messaging host Chrome starts for the Krypt
 * Marketo extension. Plain Node, no dependencies; it runs with the Krypt
 * Marketo executable as the Node runtime (ELECTRON_RUN_AS_NODE=1).
 *
 * It relays messages between the extension (Chrome's native messaging framing
 * on stdio: a 4-byte little-endian length, then UTF-8 JSON) and the running
 * app's per-user pipe (one JSON object per line). It stays alive while Chrome
 * keeps the port open and reconnects to the app whenever it (re)starts, so the
 * extension connects on its own a few seconds after the app opens.
 *
 *   → extension: {host:"up"} / {host:"down"} as the app comes and goes.
 *
 * Multi-instance mode (each Marketo profile in its own window): the running
 * windows are listed in instances.json next to the config, each with the Chrome
 * profile folders its accounts use. Chrome starts one of these helpers per
 * Chrome profile; it learns which Chrome profile it serves from the id the
 * extension keeps in that profile's storage (sent in its hello), and connects
 * to the window that uses that Chrome profile (the base app otherwise). It
 * checks again every few seconds and moves over when that window opens or closes.
 *
 * Flags: --config <path to chrome-bridge.json> (written by the app at start).
 * Chrome adds the calling extension's origin as an argument.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const CONFIG = flag('--config');
const REGISTRY = CONFIG ? path.join(path.dirname(CONFIG), 'instances.json') : null;
const ORIGIN = argv.find((a) => /^chrome-extension:\/\//i.test(a)) || '';
const EXT_IDS = ['bmelfallppaddlejniaapmofnfeccagc'];
const RETRY_MS = 3000;
const RECHECK_MS = 5000;

function toChrome(msg) {
  const body = Buffer.from(JSON.stringify(msg), 'utf8');
  const head = Buffer.alloc(4);
  head.writeUInt32LE(body.length, 0);
  try {
    process.stdout.write(Buffer.concat([head, body]));
  } catch {
    process.exit(0);
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

// ── Which Chrome profile this helper serves ───────────────────────────────
/** The extension's id for its Chrome profile (from its hello), and the folder found for it. */
let key = null;
let dir = null;
let lookedAt = 0;

function chromeUserData() {
  if (process.platform === 'win32') return process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data') : null;
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'google-chrome');
}

/** The extension keeps its id in its own storage, inside its Chrome profile's folder: find the folder holding it. */
function findDir() {
  if (dir || !key || Date.now() - lookedAt < 8000) return dir;
  lookedAt = Date.now();
  const root = chromeUserData();
  if (!root) return null;
  const needle = Buffer.from(key, 'ascii');
  let profiles = [];
  try {
    profiles = fs.readdirSync(root).filter((d) => /^(Default|Profile \d{1,4})$/.test(d));
  } catch {
    return null;
  }
  for (const p of profiles) {
    for (const id of EXT_IDS) {
      const store = path.join(root, p, 'Local Extension Settings', id);
      let files = [];
      try {
        files = fs.readdirSync(store).filter((f) => /\.(log|ldb)$/i.test(f));
      } catch {
        continue;
      }
      for (const f of files) {
        try {
          if (fs.statSync(path.join(store, f)).size > 8 * 1024 * 1024) continue;
          if (fs.readFileSync(path.join(store, f)).includes(needle)) return (dir = p);
        } catch {
          /* Chrome is compacting that file: found next time */
        }
      }
    }
  }
  return null;
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e && e.code === 'EPERM';
  }
};

/** Where to connect: the window whose accounts use this Chrome profile, else the base app. */
function target() {
  const base = CONFIG ? readJson(CONFIG) : null;
  // The base app writes its pid there; a stale file (the app closed) is no target.
  const main = base && base.pipe && base.token && (typeof base.pid !== 'number' || alive(base.pid)) ? { pipe: base.pipe, token: base.token } : null;
  const reg = REGISTRY ? readJson(REGISTRY) : null;
  const list = (reg && Array.isArray(reg.instances) ? reg.instances : []).filter((e) => e && e.chromePipe && e.chromeToken && typeof e.pid === 'number' && alive(e.pid));
  if (!list.some((e) => e.id !== 'main')) return main;
  const d = findDir();
  const own = d ? list.find((e) => e.id !== 'main' && Array.isArray(e.chromeDirs) && e.chromeDirs.includes(d)) : null;
  if (own) return { pipe: own.chromePipe, token: own.chromeToken };
  return main;
}

// ── The connection to the app ─────────────────────────────────────────────
/** The socket to the app once it has accepted us, and the pipe it is on. */
let sock = null;
let sockPipe = null;
let connecting = false;
/** With other windows open and the base app closed: ask the extension for its hello to learn which window to use. */
let probed = false;

function tryConnect() {
  if (sock || connecting) return;
  const t = target();
  if (!t) {
    // The base app is not running, but other windows may be: the extension's hello says which Chrome profile this is.
    if (!key && !probed && REGISTRY && readJson(REGISTRY)) {
      probed = true;
      toChrome({ host: 'up' });
      setTimeout(() => {
        if (!sock) toChrome({ host: 'down' });
      }, 1500);
    }
    return void setTimeout(tryConnect, RETRY_MS);
  }
  connecting = true;
  const s = net.connect(t.pipe);
  let buf = '';
  let accepted = false;
  s.on('connect', () => s.write(`${JSON.stringify({ krypt: 'hello', token: t.token, origin: ORIGIN })}\n`));
  s.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (!accepted) {
        if (msg && msg.krypt === 'ok') {
          accepted = true;
          connecting = false;
          sock = s;
          sockPipe = t.pipe;
          toChrome({ host: 'up' });
        } else {
          s.destroy();
        }
        continue;
      }
      toChrome(msg);
    }
  });
  s.on('error', () => {});
  s.once('close', () => {
    if (!accepted) connecting = false;
    if (sock === s) {
      sock = null;
      sockPipe = null;
      toChrome({ host: 'down' });
    }
    // Moved to another window: straight over. Not reachable: a little later.
    setTimeout(tryConnect, accepted ? 300 : RETRY_MS);
  });
}

// The window this Chrome profile belongs to opened (or closed): move over.
setInterval(() => {
  if (!sock || !REGISTRY) return;
  const t = target();
  if (t && t.pipe !== sockPipe) sock.destroy();
}, RECHECK_MS).unref();

let inBuf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inBuf = inBuf.length ? Buffer.concat([inBuf, chunk]) : chunk;
  while (inBuf.length >= 4) {
    const n = inBuf.readUInt32LE(0);
    if (inBuf.length < 4 + n) break;
    const body = inBuf.subarray(4, 4 + n);
    inBuf = inBuf.subarray(4 + n);
    const text = body.toString('utf8');
    // Learn which Chrome profile this is from the extension's hello (0.8+ sends its id).
    if (!key && text.includes('"hello"')) {
      try {
        const m = JSON.parse(text);
        if (m && m.ev === 'hello' && typeof m.key === 'string' && /^[a-f0-9]{32}$/.test(m.key)) {
          key = m.key;
          lookedAt = 0;
          if (!sock) setTimeout(tryConnect, 0);
          else if (REGISTRY) {
            // Connected to the base app first: if this Chrome profile belongs to another window, go there now
            // (its hello is not passed on, so the base app never takes this Chrome profile for its accounts).
            const t = target();
            if (t && t.pipe !== sockPipe) {
              sock.destroy();
              continue;
            }
          }
        }
      } catch {
        /* not JSON: passed on as it is */
      }
    }
    if (!sock) continue; // nothing to tell while the app is closed
    // Already JSON from Chrome: pass it on as one line.
    sock.write(`${text.replace(/[\r\n]+/g, ' ')}\n`);
  }
});
// Chrome closes stdin when the extension lets go of the port (or Chrome quits).
process.stdin.on('end', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
process.stdout.on('error', () => process.exit(0));

tryConnect();
