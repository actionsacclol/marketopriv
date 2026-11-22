// Setup > Help, "Export logs": one .zip a user can send to Krypt when something goes wrong. It holds the app log,
// the last autopilot runs and a short info sheet. Never the keys, the database, the AI connection files or a
// password: emails, the Windows user name in paths and anything that looks like a token are blanked out.

import { app } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import * as instance from './instance';

/** At most this much of the app log (its newest part). */
const LOG_MAX = 8 * 1024 * 1024;
/** The last this many autopilot runs. */
const RUNS = 20;

// ── A small zip writer (deflate, no dependencies) ──────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(d: Date): { time: number; date: number } {
  return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}

export function zip(files: Array<{ name: string; data: Buffer; at?: Date }>): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name.replace(/\\/g, '/'), 'utf8');
    const packed = zlib.deflateRawSync(f.data, { level: 9 });
    const crc = crc32(f.data);
    const { time, date } = dosTime(f.at ?? new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // names in UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(f.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(f.data.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    parts.push(local, name, packed);
    central.push(head, name);
    offset += local.length + name.length + packed.length;
  }
  const dir = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}

// ── What goes in ────────────────────────────────────────────────────────────
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Blank out what identifies the user or could open something: emails, their user name in paths, tokens and keys. */
export function redact(text: string): string {
  const home = os.homedir();
  const user = path.basename(home);
  let t = text;
  for (const h of [home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')]) t = t.split(h).join('~');
  if (user.length >= 3) t = t.replace(new RegExp(`([\\\\/]Users[\\\\/]+|[\\\\/]home[\\\\/]+)${esc(user)}\\b`, 'gi'), '$1<user>');
  // The account name (not always the home folder's name), also inside the MCP and Chrome pipe names.
  let account = '';
  try {
    account = os.userInfo().username || '';
  } catch {
    /* no account info */
  }
  for (const name of new Set([account, account.replace(/[^A-Za-z0-9_.-]/g, '_')])) {
    if (name.length < 3) continue;
    t = t.replace(new RegExp(`([\\\\/]Users[\\\\/]+|[\\\\/]home[\\\\/]+)${esc(name)}\\b`, 'gi'), '$1<user>');
    t = t.replace(new RegExp(`(krypt-marketo-(?:mcp|chrome)-)${esc(name)}`, 'gi'), '$1<user>');
  }
  t = t.replace(/[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g, (m) => `***@${m.split('@')[1]}`);
  t = t.replace(/((?:token|api[_-]?key|apikey|password|passwd|secret|authorization|bearer|cookie)["']?\s*[:=]\s*["']?(?:Bearer\s+)?)[^\s"',}]{6,}/gi, '$1<hidden>');
  t = t.replace(/\b(sk-[A-Za-z0-9_-]{8})[A-Za-z0-9_-]{10,}/g, '$1<hidden>');
  return t;
}

function tail(file: string, max: number): string | null {
  try {
    const size = fs.statSync(file).size;
    const fd = fs.openSync(file, 'r');
    try {
      const len = Math.min(size, max);
      const b = Buffer.alloc(len);
      fs.readSync(fd, b, 0, len, size - len);
      const s = b.toString('utf8');
      return size > max ? `(older lines left out: the file is ${(size / 1048576).toFixed(1)} MB)\n${s.slice(s.indexOf('\n') + 1)}` : s;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

/** Build the zip at `out`. `info` is the info sheet's lines from the app (version, profiles, Chrome, autopilot). */
export function exportLogs(out: string, info: string[]): { file: string; files: number; bytes: number } {
  const files: Array<{ name: string; data: Buffer; at?: Date }> = [];
  const add = (name: string, text: string | null, at?: Date): void => {
    if (text !== null) files.push({ name, data: Buffer.from(redact(text), 'utf8'), at });
  };
  const mtime = (f: string): Date | undefined => {
    try {
      return fs.statSync(f).mtime;
    } catch {
      return undefined;
    }
  };

  add(
    'info.txt',
    [
      `Krypt Marketo ${app.getVersion()}${app.isPackaged ? '' : ' (development copy)'}`,
      `Exported ${new Date().toISOString()}`,
      `System: ${os.type()} ${os.release()} ${process.arch}, ${Math.round(os.totalmem() / 1073741824)} GB memory, ${os.cpus().length} CPU threads`,
      `Electron ${process.versions.electron}, Chromium ${process.versions.chrome}, Node ${process.versions.node}`,
      ...info,
      '',
      'Emails, the Windows user name in paths and anything that looks like a key or token are blanked out.',
    ].join('\n'),
  );

  for (const name of ['marketo.log', 'marketo.log.old', 'marketo.log.1']) {
    const f = path.join(instance.ROOT, name);
    if (fs.existsSync(f)) add(name, tail(f, LOG_MAX), mtime(f));
  }

  // The last autopilot runs: the short report and the AI's own summary of the run.
  const logs = path.join(instance.ROOT, 'autopilot', 'logs');
  try {
    const runs = fs
      .readdirSync(logs)
      .filter((f) => /^run-.*\.txt$/.test(f))
      .sort()
      .slice(-RUNS);
    for (const r of runs) {
      const base = r.replace(/\.txt$/, '');
      for (const f of fs.readdirSync(logs).filter((x) => x.startsWith(base) && /\.(txt|json|log|md)$/.test(x))) add(`autopilot/${f}`, tail(path.join(logs, f), 2 * 1024 * 1024), mtime(path.join(logs, f)));
    }
  } catch {
    /* no runs yet */
  }
  // macOS: what launchd saw when it started the scheduled runs.
  const launchd = path.join(logs, 'launchd.log');
  if (fs.existsSync(launchd)) add('autopilot/launchd.log', tail(launchd, 1024 * 1024), mtime(launchd));
  for (const f of ['run.cmd', 'run.sh']) {
    const p = path.join(instance.ROOT, 'autopilot', f);
    if (fs.existsSync(p)) add(`autopilot/${f}`, tail(p, 256 * 1024), mtime(p));
  }

  // The profile list (names, which have autopilot on), not their data.
  const prof = path.join(instance.ROOT, 'profiles.json');
  if (fs.existsSync(prof)) add('profiles.json', tail(prof, 256 * 1024), mtime(prof));

  const buf = zip(files);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, buf);
  return { file: out, files: files.length, bytes: buf.length };
}
