import crypto from 'node:crypto';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

// Discord Rich Presence, the same for every Krypt app: "Krypt Marketo" on the
// user's Discord profile with the krypt.cc buttons. Always on, no setting.
// Talks to the Discord app's local IPC socket directly (no package): an 8-byte
// header (opcode, length; little-endian uint32) then JSON. No Discord running
// is normal: it looks again every 30 s, and again after Discord restarts.

const CLIENT_ID = '1495323918234423406';
const RETRY_MS = 30_000;

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

let sock: net.Socket | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let startedAt = 0;
let wanted = false;
let connected = false;
let log: (level: 'info' | 'warn', msg: string) => void = () => {};

function activity(): Record<string, unknown> {
  return {
    details: 'Running reels with AI',
    state: 'krypt.cc/tools',
    timestamps: { start: startedAt },
    assets: { large_image: 'krypt', large_text: 'Krypt Marketo' },
    instance: false,
    buttons: [
      { label: 'Free Tools', url: 'https://krypt.cc/tools' },
      { label: 'Krypt.cc', url: 'https://discord.gg/muzFKR657F' },
    ],
  };
}

function pipePath(i: number): string {
  if (process.platform === 'win32') return `\\\\?\\pipe\\discord-ipc-${i}`;
  const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || os.tmpdir() || '/tmp';
  return path.join(base.replace(/\/$/, ''), `discord-ipc-${i}`);
}

function encode(op: number, data: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  const head = Buffer.alloc(8);
  head.writeUInt32LE(op, 0);
  head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** The first discord-ipc-N socket that answers (Discord, PTB and Canary take the next free number). */
function open(i = 0): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    if (i > 9) return reject(new Error('Discord is not running'));
    const s = net.createConnection(pipePath(i));
    const fail = (): void => {
      s.destroy();
      open(i + 1).then(resolve, reject);
    };
    s.once('connect', () => {
      s.off('error', fail);
      resolve(s);
    });
    s.once('error', fail);
  });
}

function scheduleRetry(): void {
  if (!wanted || retry) return;
  retry = setTimeout(() => {
    retry = null;
    void connect();
  }, RETRY_MS);
  // Never the reason the app stays open.
  retry.unref?.();
}

function dropped(s: net.Socket): void {
  if (sock !== s) return;
  sock = null;
  if (connected) log('info', '[discord] presence disconnected (Discord closed?)');
  connected = false;
  scheduleRetry();
}

async function connect(): Promise<void> {
  if (!wanted || sock) return;
  let s: net.Socket;
  try {
    s = await open();
  } catch {
    scheduleRetry();
    return;
  }
  if (!wanted || sock) {
    s.destroy();
    return;
  }
  sock = s;
  let buf = Buffer.alloc(0);
  s.on('data', (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 8) {
      const op = buf.readUInt32LE(0);
      const len = buf.readUInt32LE(4);
      if (buf.length < 8 + len) break;
      let msg: { cmd?: string; evt?: string; data?: { message?: string } } = {};
      try {
        msg = JSON.parse(buf.subarray(8, 8 + len).toString('utf8'));
      } catch {
        /* a frame we can't read: skip it */
      }
      buf = buf.subarray(8 + len);
      if (op === OP_PING) s.write(encode(OP_PONG, msg));
      else if (op === OP_CLOSE) s.destroy();
      else if (op === OP_FRAME && msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
        connected = true;
        log('info', '[discord] presence on');
        s.write(encode(OP_FRAME, { cmd: 'SET_ACTIVITY', args: { pid: process.pid, activity: activity() }, nonce: crypto.randomUUID() }));
      } else if (op === OP_FRAME && msg.evt === 'ERROR') log('warn', `[discord] ${msg.data?.message ?? 'error'}`);
    }
  });
  s.on('error', () => s.destroy());
  s.on('close', () => dropped(s));
  s.write(encode(OP_HANDSHAKE, { v: 1, client_id: CLIENT_ID }));
}

/** Show Marketo on the user's Discord profile while it runs. Safe to call once at startup. */
export function startDiscordPresence(logger?: (level: 'info' | 'warn', msg: string) => void): void {
  if (wanted) return;
  if (logger) log = logger;
  wanted = true;
  startedAt = Date.now();
  void connect();
}

/** On quit: closing the socket takes the presence off at once. */
export function stopDiscordPresence(): void {
  wanted = false;
  if (retry) clearTimeout(retry);
  retry = null;
  const s = sock;
  sock = null;
  connected = false;
  s?.destroy();
}

export const discordPresenceOn = (): boolean => connected;
