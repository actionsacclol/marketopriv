import type { ProxyScheme } from './types';

// Proxy lists as providers hand them out, one proxy a line, read into the
// hub's own shape. Pure: used by the proxy manager's bulk import.

export interface ParsedProxy {
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

const HOST = /^(?=.{1,253}$)([A-Za-z0-9-]{1,63}\.)*[A-Za-z0-9-]{1,63}$/;
const isPort = (s: string): boolean => /^\d{1,5}$/.test(s) && Number(s) >= 1 && Number(s) <= 65535;
const isHost = (s: string): boolean => HOST.test(s) && /[A-Za-z]|^\d{1,3}(\.\d{1,3}){3}$/.test(s);

/**
 * One line of a proxy list, or why it can't be used. Understood:
 * host:port, host:port:user:pass, user:pass:host:port, user:pass@host:port,
 * host:port@user:pass, each with or without http:// https:// socks5:// in
 * front, and the same fields split by spaces, tabs, commas or semicolons.
 */
export function parseProxyLine(raw: string): ParsedProxy | { error: string } {
  let line = raw.trim();
  let scheme: ProxyScheme = 'http';
  const m = /^([a-z][a-z0-9+.-]*):\/\//i.exec(line);
  if (m) {
    const s = m[1].toLowerCase();
    if (s === 'http' || s === 'https') scheme = s;
    else if (s === 'socks5' || s === 'socks5h' || s === 'socks') scheme = 'socks5';
    else return { error: `"${s}" proxies are not supported (HTTP, HTTPS or SOCKS5)` };
    line = line.slice(m[0].length);
  }
  line = line.replace(/\/+$/, '');
  if (!line) return { error: 'empty' };

  let host = '';
  let port = '';
  let user = '';
  let pass = '';
  const at = line.lastIndexOf('@');
  if (at > 0) {
    // user:pass@host:port, or host:port@user:pass (some providers).
    const left = line.slice(0, at);
    const right = line.slice(at + 1);
    const r = right.split(':');
    const l = left.split(':');
    if (r.length === 2 && isHost(r[0]) && isPort(r[1])) {
      [host, port] = r;
      user = l[0];
      pass = l.slice(1).join(':');
    } else if (l.length === 2 && isHost(l[0]) && isPort(l[1])) {
      [host, port] = l;
      user = r[0];
      pass = r.slice(1).join(':');
    } else return { error: 'no host and port found' };
  } else {
    const parts = line.includes(':') ? line.split(':') : line.split(/[\s,;|]+/).filter(Boolean);
    if (parts.length < 2) return { error: 'no host and port found' };
    if (isHost(parts[0]) && isPort(parts[1])) {
      [host, port] = parts;
      user = parts[2] ?? '';
      pass = parts.slice(3).join(':');
    } else if (parts.length >= 4 && isHost(parts[parts.length - 2]) && isPort(parts[parts.length - 1])) {
      host = parts[parts.length - 2];
      port = parts[parts.length - 1];
      user = parts[0];
      pass = parts.slice(1, -2).join(':');
    } else return { error: 'no host and port found' };
  }
  user = user.trim();
  if (pass && !user) return { error: 'a password with no user name' };
  if (scheme === 'socks5' && user) return { error: "Chrome can't send a user name and password to a SOCKS5 proxy: use the provider's HTTP endpoint" };
  return { scheme, host: host.toLowerCase(), port: Number(port), ...(user ? { username: user } : {}), ...(pass ? { password: pass } : {}) };
}

/** A pasted list: the proxies in it (no doubles), and the lines that could not be read. */
export function parseProxyList(text: string): { proxies: ParsedProxy[]; skipped: Array<{ line: number; why: string }> } {
  const proxies: ParsedProxy[] = [];
  const skipped: Array<{ line: number; why: string }> = [];
  const seen = new Set<string>();
  String(text ?? '')
    .split(/\r?\n/)
    .slice(0, 2000)
    .forEach((raw, i) => {
      const line = raw.trim();
      if (!line || line.startsWith('#') || line.startsWith('//')) return;
      const p = parseProxyLine(line);
      if ('error' in p) return void skipped.push({ line: i + 1, why: p.error });
      const key = proxyKey(p);
      if (seen.has(key)) return void skipped.push({ line: i + 1, why: 'the same proxy is higher up in the list' });
      seen.add(key);
      proxies.push(p);
    });
  return { proxies, skipped };
}

/** What makes two proxies the same one. */
export const proxyKey = (p: { scheme: string; host: string; port: number; username?: string }): string => `${p.scheme}|${p.host.toLowerCase()}|${p.port}|${p.username ?? ''}`;
