// The hub's end of the Krypt Marketo Chrome extension (resources/extension).
//
// An account can live in the user's own Chrome instead of the hub's built-in
// browser: same cookies, same device, same fingerprint as when they use
// Instagram themselves. Each Chrome profile with the extension installed shows
// up here as one connection. electron/browser.ts drives it with the same tools
// and the same rules as a built-in window.
//
//   extension ⇄ Chrome native messaging ⇄ marketo-chrome-host.cjs ⇄ this pipe
//
// No network port: Chrome starts the helper itself (it is registered for this
// user only, and only for our extension's id), and the helper reaches the hub
// over a per-user pipe with a token that changes at every start.

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { CHROME_EXT_IDS, CHROME_HOST_NAME } from '../shared/chromeExt';
import * as chromeProfiles from './chromeProfiles';
import type { LocalChrome } from './chromeProfiles';

/** What the bridge needs to know about the user's Chrome profiles. */
export interface ChromeSource {
  list(fresh?: boolean): LocalChrome[];
  dirOfKey(key: string | undefined): string | null;
}
import type { ChromeStatus, IgAccount, Network, Site } from '../shared/types';

/** An X or TikTok tab in that profile. */
export interface NetConn {
  /** Session cookies are present in that profile; the network's numeric user id. */
  loggedIn: boolean;
  userId?: string;
  /** The handle seen on the page there. */
  me?: string;
  tabOpen: boolean;
  tabUrl: string;
}
import { NETWORKS, SITES as ALL_SITES, sameHandle } from '../shared/warmup';

export interface ChromeConn {
  id: number;
  alive: boolean;
  version: string;
  /** That Chrome profile's lasting id (a random one the extension made for itself; 0.8+). */
  key?: string;
  /** The Chrome profile folder it was found in ("Default", "Profile 2"), once known. */
  dir?: string;
  /** Instagram session cookies are present in that profile. */
  loggedIn: boolean;
  /** Instagram's numeric id of the signed-in user (from the ds_user_id cookie). */
  userId?: string;
  /** The handle seen on the page there, once a page was read. */
  me?: string;
  tabOpen: boolean;
  tabUrl: string;
  /** Sites this extension version can drive (0.1 knew only Instagram). */
  sites: Site[];
  /** Google / YouTube session cookies are present in that profile. */
  ytLoggedIn: boolean;
  /** Its YouTube tab. */
  ytTabOpen: boolean;
  ytTabUrl: string;
  /** Its X and TikTok tabs and sign-ins. */
  net: Record<Network, NetConn>;
  connectedAt: number;
  /** When the user pressed "Use this Chrome profile in Marketo" in the extension. */
  preferredAt: number;
  /** The user paused AI control in Chrome (its debugging bar's Cancel, or the popup). */
  stopped: boolean;
  send<T = unknown>(cmd: string, args?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
}

export type ChromeEvent = { type: 'change' } | { type: 'gone' } | { type: 'blocked'; url: string; site: Site };

interface Deps {
  userData: string;
  /** Set for a development copy next to the installed hub: its own pipe and host name. */
  dev: boolean;
  /** The executable that runs the helper as Node (the app itself). */
  exePath: string;
  hostScript: string | null;
  extensionDir: string | null;
  log(level: 'info' | 'warn' | 'error', message: string): void;
  /** Where the list of Chrome profiles comes from (Chrome's own files unless a test supplies one). */
  chrome?: ChromeSource;
  onEvent(conn: ChromeConn, ev: ChromeEvent): void;
  onStatus(s: ChromeStatus): void;
}

const conns = new Map<number, ChromeConn>();
let nextConn = 1;
let deps: Deps | null = null;
let registered = false;
let regError: string | undefined;

const hostName = (): string => `${CHROME_HOST_NAME}${deps?.dev ? '.dev' : ''}`;

function pipePath(userData: string, dev: boolean): string {
  if (process.platform === 'win32') {
    const user = (os.userInfo().username || 'user').replace(/[^A-Za-z0-9_.-]/g, '_');
    return `\\\\.\\pipe\\krypt-marketo-chrome-${user}${dev ? '-dev' : ''}`;
  }
  return path.join(userData, 'chrome.sock');
}

function tokenOk(given: unknown, expected: string): boolean {
  if (typeof given !== 'string' || given.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const originOk = (origin: unknown): boolean => typeof origin === 'string' && CHROME_EXT_IDS.some((id) => origin.replace(/\/+$/, '') === `chrome-extension://${id}`);

// ── Telling Chrome where the helper is ─────────────────────────────────────
function reg(args: string[]): Promise<boolean> {
  return new Promise((resolve) => execFile('reg', args, { windowsHide: true }, (err) => resolve(!err)));
}

/** Browsers that read Chrome extensions: [registry key (Windows), profile folder under the home config dir (macOS, Linux)]. */
const BROWSERS: Array<{ always: boolean; win: string; mac: string; linux: string }> = [
  { always: true, win: 'Software\\Google\\Chrome', mac: 'Google/Chrome', linux: 'google-chrome' },
  { always: false, win: 'Software\\Microsoft\\Edge', mac: 'Microsoft Edge', linux: 'microsoft-edge' },
  { always: false, win: 'Software\\BraveSoftware\\Brave-Browser', mac: 'BraveSoftware/Brave-Browser', linux: 'BraveSoftware/Brave-Browser' },
  { always: false, win: 'Software\\Chromium', mac: 'Chromium', linux: 'chromium' },
];

async function register(d: Deps, bridgeConfig: string): Promise<void> {
  if (!d.hostScript) throw new Error('The Chrome helper script is missing from this install.');
  const name = hostName();
  const win = process.platform === 'win32';
  // Chrome needs something it can execute: a launcher that runs the helper with the app as Node.
  const launcher = path.join(d.userData, win ? 'chrome-host.bat' : 'chrome-host.sh');
  if (win) {
    fs.writeFileSync(launcher, `@echo off\r\nchcp 65001 >nul 2>&1\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${d.exePath}" "${d.hostScript}" --config "${bridgeConfig}" %*\r\n`);
  } else {
    const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
    fs.writeFileSync(launcher, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${q(d.exePath)} ${q(d.hostScript)} --config ${q(bridgeConfig)} "$@"\n`);
    fs.chmodSync(launcher, 0o755);
  }
  const manifest = `${JSON.stringify({ name, description: 'Krypt Marketo: Instagram, X and YouTube in your own Chrome', path: launcher, type: 'stdio', allowed_origins: CHROME_EXT_IDS.map((id) => `chrome-extension://${id}/`) }, null, 2)}\n`;

  if (win) {
    const file = path.join(d.userData, 'chrome-host.json');
    fs.writeFileSync(file, manifest);
    let any = false;
    for (const b of BROWSERS) {
      if (!b.always && !(await reg(['query', `HKCU\\${b.win}`]))) continue;
      if (await reg(['add', `HKCU\\${b.win}\\NativeMessagingHosts\\${name}`, '/ve', '/t', 'REG_SZ', '/d', file, '/f'])) any = true;
    }
    if (!any) throw new Error('Could not write the Chrome helper entry to the registry.');
    return;
  }
  const base = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  let any = false;
  for (const b of BROWSERS) {
    const dir = path.join(base, process.platform === 'darwin' ? b.mac : b.linux);
    if (!b.always && !fs.existsSync(dir)) continue;
    try {
      fs.mkdirSync(path.join(dir, 'NativeMessagingHosts'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'NativeMessagingHosts', `${name}.json`), manifest);
      any = true;
    } catch {
      /* that browser is not writable; try the next */
    }
  }
  if (!any) throw new Error('Could not write the Chrome helper entry.');
}

// ── Connections ────────────────────────────────────────────────────────────
function emitStatus(): void {
  deps?.onStatus(status());
}

// Which of the user's Chrome profiles a connection is (electron/chromeProfiles.ts
// reads Chrome's own list: folder, name, email). The picker on the Setup page
// offers that list, and an account can be kept to one of them.
const source = (): ChromeSource => deps?.chrome ?? chromeProfiles;

/** The Chrome profile folder ("Default", "Profile 2") a connection belongs to, when the hub can tell. */
export function dirOf(c: ChromeConn): string | null {
  if (c.dir) return c.dir;
  const byKey = source().dirOfKey(c.key);
  if (byKey) {
    c.dir = byKey;
    return byKey;
  }
  // No id to go by (an extension from before 0.8, or Chrome has not written it to disk yet):
  // with the extension in exactly one Chrome profile and one connection, it is that one.
  const withExt = source().list().filter((p) => p.hasExtension);
  return withExt.length === 1 && connections().length === 1 ? withExt[0].dir : null;
}

/** Chrome's own name for a profile folder ('' when Chrome no longer lists it). Never the email. */
export const nameOfDir = (dir: string | undefined): string => (dir ? source().list().find((p) => p.dir === dir)?.name ?? '' : '');

/** Open a window of that Chrome profile for the user. */
export function openProfile(dir: string): void {
  chromeProfiles.launch(dir);
}

/**
 * An account kept to a Chrome profile that is not connected: open that profile (Chrome starts if needed) so its
 * extension connects. False when there is nothing to open: no extension there, Chrome just started it, or the hub
 * itself only just started and the connection is on its way.
 */
export function openFor(a: IgAccount): boolean {
  const p = a.chromeDir ? source().list().find((x) => x.dir === a.chromeDir) : undefined;
  if (!p || !p.hasExtension || process.uptime() < 20 || Date.now() - chromeProfiles.lastLaunch(p.dir) < 120_000) return false;
  try {
    chromeProfiles.launch(p.dir);
    deps?.log('info', `Chrome: opened the Chrome profile ${p.dir} for ${a.handle} (it was not connected)`);
    return true;
  } catch (e) {
    deps?.log('warn', `Chrome: could not open the Chrome profile ${p.dir}: ${(e as Error).message}`);
    return false;
  }
}

type Live = ChromeConn & { onLine(m: Record<string, unknown>): void; onClose(): void };

function accept(sock: net.Socket, d: Deps): Live {
  const pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: NodeJS.Timeout }>();
  let nextId = 1;
  const conn: ChromeConn = {
    id: nextConn++,
    alive: true,
    version: '',
    loggedIn: false,
    tabOpen: false,
    tabUrl: '',
    sites: ['instagram'],
    ytLoggedIn: false,
    ytTabOpen: false,
    ytTabUrl: '',
    net: Object.fromEntries(NETWORKS.map((n) => [n, { loggedIn: false, tabOpen: false, tabUrl: '' }])) as Record<Network, NetConn>,
    connectedAt: Date.now(),
    preferredAt: 0,
    stopped: false,
    send<T>(cmd: string, args: Record<string, unknown> = {}, timeoutMs = 15_000): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        if (!conn.alive) return reject(new Error('Chrome disconnected.'));
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error('Chrome did not answer in time. Check that the Chrome window is open and not frozen.'));
        }, timeoutMs);
        pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        sock.write(`${JSON.stringify({ id, cmd, args })}\n`);
      });
    },
  };
  conns.set(conn.id, conn);

  const setTab = (t: { open?: unknown; url?: unknown; site?: unknown } | undefined): void => {
    const url = typeof t?.url === 'string' ? t.url : '';
    if (t?.site === 'youtube') {
      conn.ytTabOpen = !!t.open;
      conn.ytTabUrl = url;
    } else if (NETWORKS.includes(t?.site as Network)) {
      conn.net[t!.site as Network].tabOpen = !!t!.open;
      conn.net[t!.site as Network].tabUrl = url;
    } else {
      conn.tabOpen = !!t?.open;
      conn.tabUrl = url;
    }
  };
  const setNet = (n: NetConn, loggedIn: unknown, id: unknown): void => {
    const uid = typeof id === 'string' && /^\d+$/.test(id) ? id : undefined;
    if (uid !== n.userId) n.me = undefined;
    n.loggedIn = !!loggedIn;
    n.userId = n.loggedIn ? uid : undefined;
  };
  const setState = (m: { loggedIn?: unknown; userId?: unknown; ytLoggedIn?: unknown; xLoggedIn?: unknown; xUserId?: unknown; ttLoggedIn?: unknown; ttUserId?: unknown; nets?: unknown }): void => {
    conn.ytLoggedIn = !!m.ytLoggedIn;
    setNet(conn.net.x, m.xLoggedIn, m.xUserId);
    setNet(conn.net.tiktok, m.ttLoggedIn, m.ttUserId);
    // Version 0.5 sends the newer networks together: { facebook: { loggedIn, userId }, … }.
    const nets = (m.nets && typeof m.nets === 'object' ? m.nets : {}) as Record<string, { loggedIn?: unknown; userId?: unknown } | undefined>;
    for (const n of ['facebook', 'threads', 'pinterest'] as Network[]) setNet(conn.net[n], nets[n]?.loggedIn, nets[n]?.userId);
    const userId = typeof m.userId === 'string' && /^\d+$/.test(m.userId) ? m.userId : undefined;
    // Another account signed in there: what we knew about the handle no longer holds.
    if (userId !== conn.userId) conn.me = undefined;
    conn.loggedIn = !!m.loggedIn;
    conn.userId = conn.loggedIn ? userId : undefined;
  };

  return Object.assign(conn, {
    onLine(m: Record<string, unknown>): void {
      if (typeof m.id === 'number') {
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        clearTimeout(p.timer);
        if (m.ok) p.resolve(m.result);
        else p.reject(new Error(String(m.error ?? 'Chrome refused.')));
        return;
      }
      switch (m.ev) {
        case 'hello':
          conn.version = String(m.version ?? '');
          conn.stopped = !!m.stopped;
          conn.key = typeof m.key === 'string' && /^[a-f0-9]{32}$/.test(m.key) ? m.key : undefined;
          // A profile that just got the extension: read Chrome's list again.
          source().list(true);
          if (Array.isArray(m.sites)) conn.sites = m.sites.filter((x): x is Site => ALL_SITES.includes(x as Site));
          setState(m);
          setTab(m.tab as { open?: unknown; url?: unknown });
          if (m.tabs && typeof m.tabs === 'object') {
            setTab({ ...(m.tabs as { youtube?: object }).youtube, site: 'youtube' });
            for (const n of NETWORKS) setTab({ ...(m.tabs as Record<string, object | undefined>)[n], site: n });
          }
          if (muteWanted) void conn.send('mute', { muted: true }, 3000).catch(() => {});
          d.log('info', `Chrome: extension ${conn.version} connected (#${conn.id}, Chrome profile ${dirOf(conn) ?? (conn.key ? 'not placed yet' : 'unknown: older extension')}, Instagram ${conn.loggedIn ? 'signed in' : 'signed out'})`);
          break;
        case 'state':
          setState(m);
          break;
        case 'tab':
          setTab(m);
          break;
        case 'prefer':
          conn.preferredAt = Date.now();
          break;
        case 'stopped':
          conn.stopped = !!m.on;
          break;
        case 'blocked':
          d.onEvent(conn, { type: 'blocked', url: String(m.url ?? ''), site: ALL_SITES.includes(m.site as Site) ? (m.site as Site) : 'instagram' });
          return;
        default:
          return;
      }
      d.onEvent(conn, { type: 'change' });
      emitStatus();
    },
    onClose(): void {
      conn.alive = false;
      conns.delete(conn.id);
      for (const p of pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('Chrome disconnected.'));
      }
      pending.clear();
      d.onEvent(conn, { type: 'gone' });
      emitStatus();
    },
  });
}

export async function start(d: Deps): Promise<void> {
  deps = d;
  const token = crypto.randomBytes(32).toString('hex');
  const pipe = pipePath(d.userData, d.dev);
  const server = net.createServer((sock) => {
    let buf = '';
    let conn: Live | null = null;
    const deny = (): void => {
      sock.end(`${JSON.stringify({ krypt: 'denied' })}\n`);
    };
    const timer = setTimeout(() => !conn && sock.destroy(), 5000);
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (!line.trim()) continue;
        let m: Record<string, unknown>;
        try {
          m = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (!m || typeof m !== 'object') continue;
        if (!conn) {
          clearTimeout(timer);
          if (m.krypt !== 'hello' || !tokenOk(m.token, token)) return deny();
          if (!originOk(m.origin)) {
            d.log('warn', `Chrome: refused an extension that is not ours (${String(m.origin).slice(0, 80)})`);
            return deny();
          }
          conn = accept(sock, d);
          sock.write(`${JSON.stringify({ krypt: 'ok' })}\n`);
          continue;
        }
        conn.onLine(m);
      }
    });
    sock.on('error', () => {});
    sock.on('close', () => {
      clearTimeout(timer);
      conn?.onClose();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    if (process.platform !== 'win32') {
      try {
        fs.unlinkSync(pipe);
      } catch {
        /* no stale socket */
      }
    }
    server.listen(pipe, () => {
      if (process.platform !== 'win32') fs.chmodSync(pipe, 0o600);
      resolve();
    });
  });

  const config = path.join(d.userData, 'chrome-bridge.json');
  fs.writeFileSync(config, `${JSON.stringify({ pipe, token, pid: process.pid, writtenAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  try {
    await register(d, config);
    registered = true;
    d.log('info', `Chrome: helper registered as ${hostName()}, listening on ${pipe}`);
  } catch (e) {
    regError = (e as Error).message;
    d.log('warn', `Chrome: ${regError}`);
  }
  emitStatus();
}

export function connections(): ChromeConn[] {
  return [...conns.values()].filter((c) => c.alive);
}

const NOT_CONNECTED =
  'Chrome is not connected to Krypt Marketo. The user opens the Chrome profile where this account is signed in, with the Krypt Marketo extension installed (Accounts page shows how); it connects by itself within a few seconds.';

/**
 * The Chrome profile an account lives in. When the user picked one for it on
 * the Setup page, that one or nothing. Otherwise the one signed in as it (by
 * Instagram's user id, saved the first time its handle was confirmed there, or
 * by the handle seen on the page); an account not matched yet gets the profile
 * the user preferred in the extension, else the newest one no other account
 * owns. A wrong guess is harmless: the browser refuses to act until the
 * signed-in handle matches.
 */
export function match(a: IgAccount, all: IgAccount[]): ChromeConn | null {
  let live = connections();
  if (!live.length) return null;
  if (a.chromeDir) {
    const hit = live.find((c) => dirOf(c) === a.chromeDir);
    if (hit) return hit;
    // Connections the hub cannot place (extensions from before 0.8 in more than one Chrome profile): the pick
    // cannot be checked against those, so they are matched the automatic way rather than stopping the account.
    live = live.filter((c) => !dirOf(c));
    if (!live.length) return null;
  }
  const byId = a.igUserId ? live.find((c) => c.userId === a.igUserId) : undefined;
  if (byId) return byId;
  const byHandle = live.find((c) => c.me && sameHandle(c.me, a.handle));
  if (byHandle) return byHandle;
  const owned = new Set(all.filter((x) => x.id !== a.id && x.igUserId).map((x) => x.igUserId!));
  // Not one another account owns: by its sign-in there, or because the user picked it for that account.
  const pinned = new Set(all.filter((x) => x.id !== a.id && x.chromeDir).map((x) => x.chromeDir!));
  const free = live.filter((c) => !(c.userId && owned.has(c.userId)) && !(c.me && all.some((x) => x.id !== a.id && sameHandle(x.handle, c.me!))) && !(pinned.size && pinned.has(dirOf(c) ?? '')));
  // The account is known and signed in nowhere: a signed-out profile is where the user would sign it in.
  const pool = a.igUserId ? free.filter((c) => !c.userId) : free;
  return [...pool].sort((x, y) => y.preferredAt - x.preferredAt || y.connectedAt - x.connectedAt)[0] ?? null;
}

export function pick(a: IgAccount, all: IgAccount[]): ChromeConn {
  const c = match(a, all);
  if (c) return c;
  if (a.chromeDir) {
    const p = source().list().find((x) => x.dir === a.chromeDir);
    if (!p) throw new Error(`${a.handle} is set to run in a Chrome profile that Chrome no longer has. The user picks one again on the Setup page, under Chrome profile.`);
    if (!p.hasExtension) throw new Error(`${a.handle} is set to run in the Chrome profile "${p.name}", and the Krypt Marketo extension is not added there. The user adds it in that Chrome profile (the Setup page shows how), or picks another profile.`);
    throw new Error(`${a.handle} is set to run in the Chrome profile "${p.name}" (Setup page, Chrome profile), and that one is not open or not connected. The user opens that Chrome profile, or picks another one there.`);
  }
  if (!connections().length) throw new Error(NOT_CONNECTED);
  const seen = connections().map((c) => (c.me ? `@${c.me}` : c.loggedIn ? 'an account Marketo has not matched' : 'signed out'));
  throw new Error(`${a.handle} is not signed in in any connected Chrome profile (connected now: ${seen.join(', ')}). The user opens the Chrome profile where ${a.handle} is signed in (with the Krypt Marketo extension), or signs in there.`);
}

let shippedVersion: string | undefined;
/** The version of the extension this copy of the hub ships (read once from its manifest). */
function extensionVersion(): string | undefined {
  if (shippedVersion === undefined && deps?.extensionDir) {
    try {
      shippedVersion = String((JSON.parse(fs.readFileSync(path.join(deps.extensionDir, 'manifest.json'), 'utf8')) as { version?: string }).version ?? '');
    } catch {
      shippedVersion = '';
    }
  }
  return shippedVersion || undefined;
}

export function status(): ChromeStatus {
  const live = connections();
  const dirs = live.map((c) => dirOf(c));
  return {
    extensionDir: deps?.extensionDir ?? null,
    extensionVersion: extensionVersion(),
    registered,
    error: regError,
    profiles: live.map((c, i) => ({ id: c.id, loggedIn: c.loggedIn, userId: c.userId, me: c.me, tabOpen: c.tabOpen, stopped: c.stopped, version: c.version, ytLoggedIn: c.ytLoggedIn, xLoggedIn: c.net.x.loggedIn, ttLoggedIn: c.net.tiktok.loggedIn, nets: Object.fromEntries(NETWORKS.map((n) => [n, c.net[n].loggedIn])), dir: dirs[i] ?? undefined })),
    local: deps ? source().list().map((p) => ({ ...p, connected: dirs.includes(p.dir) })) : [],
    unplaced: dirs.filter((d) => !d).length,
  };
}

let muteWanted = false;
/** Mute or unmute the tabs Marketo drives in every connected Chrome profile (extension 0.6+; older ones ignore it). */
export function setMuted(m: boolean): void {
  if (m === muteWanted) return;
  muteWanted = m;
  for (const c of connections()) void c.send('mute', { muted: m }, 3000).catch(() => {});
}

/** Let go of every Chrome tab (the hub is closing); the tabs stay open. */
export function releaseAll(): void {
  for (const c of connections()) void c.send('release', {}, 2000).catch(() => {});
}
