// A proxy per profile (Multi run page, Proxy). Every page the profile's accounts load goes out through it: the Chrome
// profiles they run in take it through the extension. Nothing else does:
// the hub window, ElevenLabs, the update check and the AI app keep the computer's own connection.
//
// "Sticky": the first exit IP a check sees is kept, and pages refuse to open from any other one (or when the proxy
// is down) until the user looks. A fixed proxy has no fallback to a direct connection, so a dead proxy means pages
// fail to load, never that they load from the user's own IP.
//
// Each profile's proxy is a small file in its folder (proxy.json, the password encrypted beside it in proxy-key.bin),
// not in its database: any window can set any profile's proxy (multi-instance mode has one window per profile), and
// the window that runs that profile notices the change and takes it up.

import { app, BrowserWindow, session, type Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ProxyInput, ProxyRow, ProxySettings, ProxyState } from '../shared/types';
import * as store from './store';
import * as profiles from './profiles';
import * as secret from './secret';

const CHECK_URL = 'https://ipinfo.io/json';
/** A session or Chrome profile is checked again after this long. */
const RECHECK_MS = 30 * 60_000;

let log: (level: 'info' | 'warn' | 'error', m: string) => void = () => {};
/** Bumped whenever the open profile's proxy changes (here or in another window), so sessions and Chrome profiles take it up. */
let gen = 1;
/** In memory when the OS can't encrypt (the password is then never written to disk). By profile id. */
const memoryPass = new Map<string, string>();
/** Decrypted passwords, by profile id and the time the password was set. */
const passCache = new Map<string, { at: string; pass: string }>();

// An owner is a Marketo profile (its id), or, with "a proxy for each Chrome profile" (Setup > Performance), one
// Chrome profile inside a Marketo profile: "<profile id>::<Chrome profile folder>". Its files sit in the Marketo
// profile's chrome-proxies folder.
const SEP = '::';
export const chromeOwner = (dir: string, pid: string = profiles.activeId()): string => `${pid}${SEP}${dir}`;
const split = (id: string): { pid: string; dir?: string } => {
  const i = id.indexOf(SEP);
  return i < 0 ? { pid: id } : { pid: id.slice(0, i), dir: id.slice(i + SEP.length) };
};
/** A Chrome profile folder ("Profile 3", "Default") as a file name. */
const safe = (dir: string): string => dir.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80);
const file = (id: string): string => {
  const { pid, dir } = split(id);
  return dir ? path.join(profiles.dir(pid), 'chrome-proxies', `${safe(dir)}.json`) : path.join(profiles.dir(pid), 'proxy.json');
};
const keyFile = (id: string): string => {
  const { pid, dir } = split(id);
  return dir ? path.join(profiles.dir(pid), 'chrome-proxies', `${safe(dir)}-key.bin`) : path.join(profiles.dir(pid), 'proxy-key.bin');
};
const own = (): string => profiles.activeId();
/** The Marketo profile an owner belongs to (throws for an unknown one), and a name for messages. */
function ownerOf(id: string): { pid: string; dir?: string; name: string } {
  const { pid, dir } = split(id);
  const p = profiles.find(pid);
  return { pid: p.id, dir, name: dir ? `Chrome profile ${dir}` : p.name };
}

/** What decides where traffic goes: a change in any of these means sessions and Chrome profiles are set again. */
const sig = (p: ProxySettings | null): string => (p?.on && p.host && p.port ? [p.scheme, p.host, p.port, p.username ?? '', p.hasPassword ? p.passAt ?? '1' : ''].join('|') : 'direct');

// ── Reading and writing a profile's settings ─────────────────────────────────
const cache = new Map<string, { mtime: number; s: ProxySettings | null }>();
let ownSig = '';

/** A proxy saved by an older build of this version: in the profile's database. */
function legacy(id: string): ProxySettings | null {
  if (split(id).dir) return null;
  try {
    if (id === own()) return store.get().settings.proxy ?? null;
    const db = JSON.parse(fs.readFileSync(path.join(profiles.dir(id), 'marketo-db.json'), 'utf8').replace(/^﻿/, '')) as { settings?: { proxy?: ProxySettings } };
    return db.settings?.proxy ?? null;
  } catch {
    return null;
  }
}

export function settingsOf(id: string): ProxySettings | null {
  let mtime = -1;
  try {
    mtime = fs.statSync(file(id)).mtimeMs;
  } catch {
    /* none saved */
  }
  const c = cache.get(id);
  if (c && c.mtime === mtime) return c.s;
  let s: ProxySettings | null = null;
  if (mtime >= 0) {
    try {
      s = JSON.parse(fs.readFileSync(file(id), 'utf8')) as ProxySettings;
    } catch {
      return c?.s ?? null; // being written: the last copy read
    }
  } else s = legacy(id);
  cache.set(id, { mtime, s });
  noticeChange(id, s);
  return s;
}

/** The open profile's proxy changed (maybe in another window): everything is set and checked again. */
function noticeChange(id: string, s: ProxySettings | null): void {
  if (id !== own()) return;
  const now = sig(s);
  if (now === ownSig) return;
  ownSig = now;
  gen++;
  verified.clear();
}

function write(id: string, s: ProxySettings): void {
  fs.mkdirSync(path.dirname(file(id)), { recursive: true });
  const tmp = `${file(id)}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2), 'utf8');
  fs.renameSync(tmp, file(id));
  let mtime = -1;
  try {
    mtime = fs.statSync(file(id)).mtimeMs;
  } catch {
    /* read again next time */
  }
  cache.set(id, { mtime, s });
  noticeChange(id, s);
}

export const settings = (): ProxySettings | null => settingsOf(own());

const on = (p: ProxySettings | null): ProxySettings | null => (p?.on && p.host && p.port ? p : null);
/** The open profile's proxy in use, or null when it goes out directly. */
export const active = (): ProxySettings | null => on(settings());

export function generation(): number {
  settings();
  return gen;
}

/** Another profile was opened in this window: everything is set and checked again on its settings. */
export function reset(): void {
  ownSig = '';
  othersCache = null;
  settings();
  gen++;
  verified.clear();
}

async function passwordOf(id: string, p: ProxySettings): Promise<string> {
  if (memoryPass.has(id)) return memoryPass.get(id)!;
  const at = p.passAt ?? '';
  const c = passCache.get(id);
  if (c && c.at === at) return c.pass;
  const pass = await secret.read(keyFile(id));
  if (pass) passCache.set(id, { at, pass });
  return pass;
}

async function credentialsOf(id: string, p: ProxySettings | null): Promise<{ username: string; password: string } | null> {
  return p?.username ? { username: p.username, password: await passwordOf(id, p) } : null;
}
export const credentials = (): Promise<{ username: string; password: string } | null> => credentialsOf(own(), active());

/** Chromium's proxy rule for these settings: every scheme through the one server. */
export function rules(p: ProxySettings): string {
  return p.scheme === 'http' ? `${p.host}:${p.port}` : `${p.scheme}://${p.host}:${p.port}`;
}

export const label = (p: ProxySettings): string => `${p.scheme}://${p.host}:${p.port}`;

export function stateOf(id: string): ProxyState {
  const s = settingsOf(id);
  return { settings: s, canEncrypt: secret.canEncrypt(), ipChanged: !!(s?.ip && s.seenIp && s.seenIp !== s.ip) };
}
export const state = (): ProxyState => stateOf(own());

/** Every profile and its proxy (the Multi run page's list). */
export function list(): ProxyRow[] {
  return profiles.list().map((p) => ({ id: p.id, name: p.name, active: p.active, ...(p.running !== undefined ? { running: p.running } : {}), state: stateOf(p.id) }));
}

const HOST = /^(?=.{1,253}$)([A-Za-z0-9-]{1,63}\.)*[A-Za-z0-9-]{1,63}$|^\d{1,3}(\.\d{1,3}){3}$/;

/** Save a profile's proxy. A different server or user name forgets the sticky IP: the next check sets it again. */
export async function save(owner: string, input: ProxyInput): Promise<ProxyState> {
  const o = ownerOf(owner);
  const p = { id: o.dir ? chromeOwner(o.dir, o.pid) : o.pid, name: o.name };
  const scheme = input.scheme === 'https' || input.scheme === 'socks5' ? input.scheme : 'http';
  const host = String(input.host ?? '').trim().replace(/^[a-z0-9]+:\/\//i, '').replace(/\/.*$/, '');
  const port = Math.round(Number(input.port));
  const username = String(input.username ?? '').trim() || undefined;
  if (input.on || host) {
    if (!HOST.test(host)) throw new Error('That is not a proxy host. Use the server name or IP from your proxy provider, like gate.example.com.');
    if (!(port >= 1 && port <= 65535)) throw new Error('The port is a number from 1 to 65535.');
  }
  const old = settingsOf(p.id);
  const pass = input.password === undefined ? undefined : String(input.password);
  const hasPass = pass === undefined ? !!old?.hasPassword : !!pass;
  if (scheme === 'socks5' && (username || hasPass)) throw new Error("Chrome and Marketo can't send a user name and password to a SOCKS5 proxy. Use your provider's HTTP endpoint (most give both), or a SOCKS5 proxy that allows your IP without a password.");
  if (hasPass && !username) throw new Error('A password needs the user name that goes with it.');
  const same = !!old && old.host === host && old.port === port && old.username === username && old.scheme === scheme;
  let passAt = old?.passAt;
  if (pass !== undefined) {
    memoryPass.delete(p.id);
    passCache.delete(p.id);
    passAt = new Date().toISOString();
    try {
      if (!(await secret.write(keyFile(p.id), pass))) memoryPass.set(p.id, pass);
    } catch (e) {
      throw new Error(`Could not keep the password: ${(e as Error).message}`);
    }
  }
  const next: ProxySettings = {
    on: !!input.on && !!host,
    scheme,
    host,
    port: port || 0,
    ...(username ? { username } : {}),
    ...(hasPass ? { hasPassword: true, ...(passAt ? { passAt } : {}) } : {}),
    ...(same && old ? { ip: old.ip, country: old.country, city: old.city } : {}),
  };
  write(p.id, next);
  if (p.id === own() || o.pid === own()) verified.clear();
  othersCache = null;
  log('info', `proxy for "${p.name}": ${next.on ? `on, ${label(next)}${username ? ' with a user name' : ''}` : 'off'}${same ? '' : ' (new server: the sticky IP is set by the next check)'}`);
  return stateOf(p.id);
}

/** Keep the IP the last check saw as the profile's sticky IP (the user's answer to "the exit IP changed"). */
export function acceptIp(owner: string): ProxyState {
  const o = ownerOf(owner);
  const p = { id: o.dir ? chromeOwner(o.dir, o.pid) : o.pid, name: o.name };
  const s = settingsOf(p.id);
  if (!s?.seenIp) throw new Error('No checked IP to keep yet. Press Check first.');
  const next = { ...s, ip: s.seenIp };
  delete next.error;
  write(p.id, next);
  if (p.id === own() || o.pid === own()) verified.clear();
  log('info', `proxy for "${p.name}": sticky IP is now ${s.seenIp}`);
  return stateOf(p.id);
}

// ── The Check button's own throwaway session ──────────────────────────────────────────
/** What each session is set to, and the sign-in its pages answer the proxy with. */
const applied = new WeakMap<Session, string>();
const signIn = new WeakMap<Session, { host: string; username: string; password: string }>();

/** Point a session at a profile's proxy (the open one unless named), or straight out when it has none. */
export async function applyTo(ses: Session, id: string = own()): Promise<void> {
  const p = on(settingsOf(id));
  const want = sig(p);
  const c = await credentialsOf(id, p);
  if (p && c) signIn.set(ses, { host: p.host.toLowerCase(), ...c });
  else signIn.delete(ses);
  if (applied.get(ses) === want) return;
  if (p) await ses.setProxy({ mode: 'fixed_servers', proxyRules: rules(p), proxyBypassRules: '' });
  else await ses.setProxy({ mode: 'direct' });
  // Chromium remembers a proxy's sign-in: a changed password must be asked for again, not taken from that memory.
  await ses.clearAuthCache().catch(() => {});
  await ses.closeAllConnections().catch(() => {});
  applied.set(ses, want);
}

/** The proxy's sign-in, for the Check button's session. Wrong credentials are not retried forever. */
export function init(l: typeof log): void {
  log = l;
  ownSig = sig(settings());
  const tries = new Map<number, number>();
  app.on('login', (event, wc, _details, authInfo, callback) => {
    if (!authInfo.isProxy || !wc) return;
    const c = signIn.get(wc.session);
    if (!c || authInfo.host.toLowerCase() !== c.host) return;
    event.preventDefault();
    const n = (tries.get(wc.id) ?? 0) + 1;
    tries.set(wc.id, n);
    setTimeout(() => tries.delete(wc.id), 60_000).unref?.();
    if (n > 2) {
      log('warn', `proxy: ${c.host} refused the user name and password`);
      callback();
      return;
    }
    callback(c.username, c.password);
  });
}

export interface CheckResult {
  ok: boolean;
  ip?: string;
  country?: string;
  city?: string;
  error?: string;
}

/** What ipinfo.io says a session's exit IP is, loaded the way a page is (so the proxy and its sign-in are used). */
export async function checkSession(ses: Session, id: string = own()): Promise<CheckResult> {
  await applyTo(ses, id);
  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { session: ses, sandbox: true, contextIsolation: true, nodeIntegration: false } });
  try {
    win.webContents.setAudioMuted(true);
    let failed = '';
    win.webContents.once('did-fail-load', (_e, code, desc) => {
      failed = FAILS[code] ?? `${desc || 'failed'} (${code})`;
    });
    await Promise.race([win.loadURL(CHECK_URL).catch(() => {}), new Promise((r) => setTimeout(r, 20_000))]);
    const text = await win.webContents.executeJavaScript('document.body ? document.body.innerText : ""', true).catch(() => '');
    const j = parseIpInfo(String(text));
    if (j) return { ok: true, ...j };
    return { ok: false, error: failed ? `the proxy did not connect: ${failed}` : 'the proxy answered, but not with an IP (check the host, port and sign-in)' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

/** The Multi run page's Check: a profile's exit IP through its proxy, from a throwaway session. */
export async function checkNow(owner: string): Promise<ProxyState> {
  const o = ownerOf(owner);
  const p = { id: o.dir ? chromeOwner(o.dir, o.pid) : o.pid };
  if (!on(settingsOf(p.id))) throw new Error('Turn the proxy on (and save it) first.');
  const ses = session.fromPartition(`marketo-proxy-check-${safe(p.id)}`);
  applied.delete(ses);
  await ses.clearStorageData().catch(() => {});
  record(await checkSession(ses, p.id), p.id);
  return stateOf(p.id);
}

/** Chromium's network errors a proxy check usually ends in, said plainly. */
const FAILS: Record<number, string> = {
  [-130]: 'nothing answers at that host and port',
  [-111]: 'it refused the user name and password (or could not reach the site)',
  [-127]: 'it asked for a sign-in that did not work',
  [-105]: 'that host name does not exist',
  [-137]: 'that host name does not exist',
  [-118]: 'it did not answer in time',
  [-7]: 'it did not answer in time',
  [-106]: 'this computer is offline',
};

export function parseIpInfo(text: string): { ip: string; country?: string; city?: string } | null {
  try {
    const j = JSON.parse(text) as { ip?: unknown; country?: unknown; city?: unknown };
    if (typeof j.ip !== 'string' || !/^[0-9a-f.:]{3,45}$/i.test(j.ip)) return null;
    return { ip: j.ip, ...(typeof j.country === 'string' ? { country: j.country.slice(0, 4) } : {}), ...(typeof j.city === 'string' ? { city: j.city.slice(0, 60) } : {}) };
  } catch {
    return null;
  }
}

/** Keep a check's result: the first good IP becomes the sticky one. */
export function record(r: CheckResult, id: string = own()): ProxySettings | null {
  const s = settingsOf(id);
  if (!s) return null;
  const next: ProxySettings = { ...s, checkedAt: new Date().toISOString() };
  if (r.ok && r.ip) {
    next.seenIp = r.ip;
    delete next.error;
    if (!next.ip) {
      next.ip = r.ip;
      next.country = r.country;
      next.city = r.city;
      log('info', `proxy: sticky IP set to ${r.ip}${r.country ? ` (${r.country})` : ''}`);
    } else if (next.ip !== r.ip) log('warn', `proxy: exit IP is ${r.ip}, not the sticky ${next.ip}`);
  } else next.error = r.error ?? 'the check failed';
  write(id, next);
  return next;
}

/** Why pages must not open after this check (null = fine). */
export function refusal(s: ProxySettings | null): string | null {
  if (!s) return null;
  if (s.error) return `This profile's proxy is not working (${s.error}). Pages stay closed rather than open from this computer's own IP. The user checks the proxy on the Multi run page (Proxy), then tries again.`;
  if (s.ip && s.seenIp && s.seenIp !== s.ip) return `This profile's proxy now goes out from ${s.seenIp}, not its sticky IP ${s.ip}. Pages stay closed until the user looks: Multi run page, Proxy (keep the new IP, or fix the proxy).`;
  return null;
}

/** When each Chrome profile was last checked, and on which settings. */
const verified = new Map<string, { at: number; gen: number; sig: string }>();

/** A Chrome profile is on its proxy: the extension has taken the settings and its own check saw the sticky IP. */
export function chromeVerified(key: string, owner: string = own()): boolean {
  settings();
  const v = verified.get(key);
  return !!v && v.gen === gen && v.sig === sig(on(settingsOf(owner))) && Date.now() - v.at < RECHECK_MS;
}
export function markVerified(key: string, owner: string = own()): void {
  verified.set(key, { at: Date.now(), gen, sig: sig(on(settingsOf(owner))) });
}
/** A Chrome profile was closed and opened again: its next page waits for a fresh IP check. */
export const forgetVerified = (key: string): void => void verified.delete(key);

// ── Which Chrome profiles other profiles use ──────────────────────────────────
// A Chrome profile has one proxy at a time (the extension sets it for the whole Chrome profile), so a Chrome profile
// used by a profile with a proxy can't be shared with another Marketo profile.
let othersCache: { at: number; map: Map<string, { name: string; proxied: boolean }> } | null = null;

/** Chrome profile folder → the other Marketo profile that uses it, and whether that one has a proxy (read from their saved data). */
export function chromeDirsOfOthers(): Map<string, { name: string; proxied: boolean }> {
  if (othersCache && Date.now() - othersCache.at < 60_000) return othersCache.map;
  const map = new Map<string, { name: string; proxied: boolean }>();
  for (const p of profiles.list()) {
    if (p.id === own()) continue;
    try {
      const db = JSON.parse(fs.readFileSync(path.join(profiles.dir(p.id), 'marketo-db.json'), 'utf8').replace(/^﻿/, '')) as { igAccounts?: Array<{ browser?: string; chromeDir?: string }> };
      const proxied = !!on(settingsOf(p.id));
      for (const a of db.igAccounts ?? [])
        if (a.browser === 'chrome' && a.chromeDir) map.set(a.chromeDir, { name: p.name, proxied: proxied || !!on(settingsOf(chromeOwner(a.chromeDir, p.id))) || !!map.get(a.chromeDir)?.proxied });
    } catch {
      /* a profile never opened */
    }
  }
  othersCache = { at: Date.now(), map };
  return map;
}

/**
 * Whose proxy a Chrome profile takes: its own (with "a proxy for each Chrome profile" on and one saved for it), else
 * the open Marketo profile's. The signature changes whenever where its traffic goes changes.
 */
export function effectiveFor(dir: string | null | undefined, perChrome: boolean): { owner: string; p: ProxySettings | null; sig: string } {
  if (perChrome && dir) {
    const owner = chromeOwner(dir);
    const p = on(settingsOf(owner));
    if (p) return { owner, p, sig: `${owner}|${sig(p)}` };
  }
  const p = active();
  return { owner: own(), p, sig: `${own()}|${sig(p)}|${gen}` };
}

/** What the extension needs to set the proxy in its Chrome profile ({on:false} clears it). */
export async function forChrome(owner: string = own()): Promise<Record<string, unknown>> {
  const p = on(settingsOf(owner));
  if (!p) return { on: false, gen };
  const c = await credentialsOf(owner, p);
  return { on: true, gen, scheme: p.scheme, host: p.host, port: p.port, ...(c ? { username: c.username, password: c.password } : {}) };
}

/** The Chrome profiles this Marketo profile's accounts run in, each with its own proxy (Multi run page). */
export function chromeRows(): ProxyRow[] {
  const dirs = new Map<string, string[]>();
  for (const a of store.get().igAccounts) if (a.chromeDir) dirs.set(a.chromeDir, [...(dirs.get(a.chromeDir) ?? []), a.handle]);
  return [...dirs].map(([dir, handles]) => ({ id: chromeOwner(dir), name: `Chrome profile ${dir}`, active: true, accounts: handles, state: stateOf(chromeOwner(dir)) }));
}
