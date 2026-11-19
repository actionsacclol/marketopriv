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
 * Flags: --config <path to chrome-bridge.json> (written by the app at start).
 * Chrome adds the calling extension's origin as an argument.
 */
const fs = require('node:fs');
const net = require('node:net');

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : null;
};
const CONFIG = flag('--config');
const ORIGIN = argv.find((a) => /^chrome-extension:\/\//i.test(a)) || '';
const RETRY_MS = 3000;

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

/** The socket to the app once it has accepted us. */
let sock = null;

function tryConnect() {
  const cfg = CONFIG ? readJson(CONFIG) : null;
  if (!cfg || !cfg.pipe || !cfg.token) return void setTimeout(tryConnect, RETRY_MS);
  const s = net.connect(cfg.pipe);
  let buf = '';
  let accepted = false;
  s.on('connect', () => s.write(`${JSON.stringify({ krypt: 'hello', token: cfg.token, origin: ORIGIN })}\n`));
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
          sock = s;
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
    if (sock === s) {
      sock = null;
      toChrome({ host: 'down' });
    }
    setTimeout(tryConnect, RETRY_MS);
  });
}

let inBuf = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  inBuf = inBuf.length ? Buffer.concat([inBuf, chunk]) : chunk;
  while (inBuf.length >= 4) {
    const n = inBuf.readUInt32LE(0);
    if (inBuf.length < 4 + n) break;
    const body = inBuf.subarray(4, 4 + n);
    inBuf = inBuf.subarray(4 + n);
    if (!sock) continue; // nothing to tell while the app is closed
    // Already JSON from Chrome: pass it on as one line.
    sock.write(`${body.toString('utf8').replace(/[\r\n]+/g, ' ')}\n`);
  }
});
// Chrome closes stdin when the extension lets go of the port (or Chrome quits).
process.stdin.on('end', () => process.exit(0));
process.stdin.on('error', () => process.exit(0));
process.stdout.on('error', () => process.exit(0));

tryConnect();
