// The proxy manager's pool (Multi run > Proxies): proxies the user pasted in
// bulk that are not a profile's yet. One list for every profile and window, in
// the data folder; the passwords sit next to it, encrypted by the OS (or in
// memory only when the OS can't encrypt). Giving one to a profile saves it as
// that profile's proxy (proxy.ts) and takes it out of the pool; the proxy the
// profile had before comes back here, so nothing typed in is ever lost.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ProxyPoolItem, ProxyPoolImport } from '../shared/types';
import { parseProxyList, proxyKey } from '../shared/proxyParse';
import * as instance from './instance';
import * as profiles from './profiles';
import * as proxy from './proxy';
import * as secret from './secret';

const file = (): string => path.join(instance.ROOT, 'proxy-pool.json');
const keyFile = (): string => path.join(instance.ROOT, 'proxy-pool-key.bin');
/** When the OS can't encrypt: the passwords of this run, never on disk. */
let memory: Record<string, string> | null = null;

let log: (level: 'info' | 'warn', m: string) => void = () => {};
export function init(l: typeof log): void {
  log = l;
}

function read(): ProxyPoolItem[] {
  try {
    const j = JSON.parse(fs.readFileSync(file(), 'utf8')) as { items?: ProxyPoolItem[] };
    return (j.items ?? []).filter((x) => x && typeof x.id === 'string' && typeof x.host === 'string' && Number(x.port) > 0);
  } catch {
    return [];
  }
}

function write(items: ProxyPoolItem[]): void {
  fs.mkdirSync(instance.ROOT, { recursive: true });
  const tmp = `${file()}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ items }, null, 2), 'utf8');
  fs.renameSync(tmp, file());
}

async function passwords(): Promise<Record<string, string>> {
  if (memory) return memory;
  try {
    const text = await secret.read(keyFile());
    return text ? (JSON.parse(text) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function savePasswords(map: Record<string, string>): Promise<void> {
  if (!Object.keys(map).length) {
    memory = null;
    await secret.write(keyFile(), '');
    return;
  }
  if (await secret.write(keyFile(), JSON.stringify(map))) memory = null;
  else memory = map;
}

export const list = (): ProxyPoolItem[] => read();

/** Add a pasted list. Proxies already in the pool, or already a profile's, are left out and named. */
export async function importText(text: string): Promise<ProxyPoolImport> {
  const { proxies, skipped } = parseProxyList(text);
  const items = read();
  const have = new Set(items.map(proxyKey));
  const used = new Map<string, string>();
  for (const row of proxy.list()) {
    const s = row.state.settings;
    if (s?.host && s.port) used.set(proxyKey(s), row.name);
  }
  const pass = await passwords();
  let added = 0;
  for (const p of proxies) {
    const key = proxyKey(p);
    if (have.has(key)) {
      skipped.push({ line: 0, why: `${p.host}:${p.port} is already in the list` });
      continue;
    }
    if (used.has(key)) {
      skipped.push({ line: 0, why: `${p.host}:${p.port} is already the proxy of "${used.get(key)}"` });
      continue;
    }
    const id = `px_${crypto.randomBytes(5).toString('hex')}`;
    items.push({ id, scheme: p.scheme, host: p.host, port: p.port, ...(p.username ? { username: p.username } : {}), ...(p.password ? { hasPassword: true } : {}) });
    if (p.password) pass[id] = p.password;
    have.add(key);
    added++;
  }
  if (added) {
    await savePasswords(pass);
    write(items);
    log('info', `proxy list: ${added} added${skipped.length ? `, ${skipped.length} left out` : ''}`);
  }
  return { added, skipped: skipped.slice(0, 50), items };
}

/** Check one: where it goes out and how long the answer took. */
export async function check(id: string): Promise<ProxyPoolItem[]> {
  const it = read().find((x) => x.id === id);
  if (!it) throw new Error('That proxy is no longer in the list.');
  const pass = (await passwords())[id];
  const r = await proxy.checkRaw(id, { scheme: it.scheme, host: it.host, port: it.port, ...(it.username ? { username: it.username, password: pass ?? '' } : {}) });
  // Read again: other checks finish in the meantime.
  const items = read().map((x) => {
    if (x.id !== id) return x;
    const next: ProxyPoolItem = { ...x, checkedAt: new Date().toISOString() };
    if (r.ok && r.ip) {
      next.ip = r.ip;
      next.country = r.country;
      next.city = r.city;
      next.ms = r.ms;
      delete next.error;
    } else {
      next.error = r.error ?? 'the check failed';
      delete next.ms;
    }
    return next;
  });
  write(items);
  return items;
}

export async function remove(ids: string[]): Promise<ProxyPoolItem[]> {
  const gone = new Set(ids.map(String));
  const items = read().filter((x) => !gone.has(x.id));
  const pass = await passwords();
  for (const id of gone) delete pass[id];
  await savePasswords(pass);
  write(items);
  return items;
}

/** A profile's own proxy, as a pool line (when it has one worth keeping). */
async function fromOwner(owner: string): Promise<{ item: ProxyPoolItem; password: string } | null> {
  const s = proxy.settingsOf(owner);
  if (!s?.host || !s.port) return null;
  const password = s.hasPassword ? await proxy.passwordFor(owner) : '';
  const id = `px_${crypto.randomBytes(5).toString('hex')}`;
  return {
    item: { id, scheme: s.scheme, host: s.host, port: s.port, ...(s.username ? { username: s.username } : {}), ...(password ? { hasPassword: true } : {}), ...(s.ip ? { ip: s.ip, country: s.country, city: s.city } : {}), ...(s.checkedAt ? { checkedAt: s.checkedAt } : {}), ...(s.error ? { error: s.error } : {}) },
    password,
  };
}

/**
 * Give a pool proxy to a profile (or, with a proxy for each Chrome profile, to one Chrome profile: "<profile>::<folder>").
 * The proxy that owner had goes back into the pool.
 */
export async function assign(id: string, owner: string): Promise<ProxyPoolItem[]> {
  let items = read();
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('That proxy is no longer in the list.');
  const pass = await passwords();
  const old = await fromOwner(owner);
  await proxy.save(owner, { on: true, scheme: it.scheme, host: it.host, port: it.port, username: it.username ?? '', password: pass[id] ?? '' });
  items = read().filter((x) => x.id !== id);
  delete pass[id];
  if (old && proxyKey(old.item) !== proxyKey(it)) {
    items.push(old.item);
    if (old.password) pass[old.item.id] = old.password;
  }
  await savePasswords(pass);
  write(items);
  return items;
}

/** Take a profile's proxy off it and put it back in the pool: the profile goes out directly again. */
export async function release(owner: string): Promise<ProxyPoolItem[]> {
  const old = await fromOwner(owner);
  if (!old) throw new Error('That profile has no proxy to take back.');
  const s = proxy.settingsOf(owner)!;
  const items = read();
  const pass = await passwords();
  if (!items.some((x) => proxyKey(x) === proxyKey(old.item))) {
    items.push(old.item);
    if (old.password) pass[old.item.id] = old.password;
  }
  await savePasswords(pass);
  write(items);
  await proxy.save(owner, { on: false, scheme: s.scheme, host: '', port: 0, username: '', password: '' });
  return items;
}

/**
 * One proxy each for the profiles that have none on, in the order of the profile list. Proxies that checked fine go
 * first, then the unchecked ones; a proxy whose check failed is never handed out.
 */
export async function autoAssign(): Promise<{ given: Array<{ profile: string; id: string; proxy: string }>; items: ProxyPoolItem[] }> {
  const need = profiles.list().filter((p) => !proxy.settingsOf(p.id)?.on);
  const ready = read().filter((x) => !x.error);
  const order = [...ready.filter((x) => x.ip), ...ready.filter((x) => !x.ip)];
  const given: Array<{ profile: string; id: string; proxy: string }> = [];
  for (const p of need) {
    const it = order.shift();
    if (!it) break;
    await assign(it.id, p.id);
    given.push({ profile: p.name, id: p.id, proxy: `${it.host}:${it.port}` });
  }
  if (given.length) log('info', `proxy list: ${given.length} given to profiles that had none`);
  return { given, items: read() };
}
