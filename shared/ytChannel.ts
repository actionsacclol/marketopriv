// A YouTube channel from a pasted link, @handle or UC… id (no network: electron/ytChannel.ts looks the rest up).

const ID = /^UC[A-Za-z0-9_-]{22}$/;
const HANDLE = /^[A-Za-z0-9._-]{3,30}$/;

export function parseYtChannel(input: string): { id?: string; handle?: string } | null {
  const s = input.trim();
  if (!s) return null;
  if (ID.test(s)) return { id: s };
  if (/^@/.test(s)) return HANDLE.test(s.slice(1)) ? { handle: s.slice(1) } : null;
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  const ch = parts.indexOf('channel');
  if (ch >= 0 && ID.test(parts[ch + 1] ?? '')) return { id: parts[ch + 1] };
  const at = parts.find((x) => x.startsWith('@'));
  if (at) {
    const h = decodeURIComponent(at.slice(1));
    return HANDLE.test(h) ? { handle: h } : null;
  }
  return null;
}

/** The channel's id out of a YouTube Studio address (studio.youtube.com/channel/UC…/…), else null. */
export function studioChannelOf(url: string): string | null {
  const m = /^https:\/\/studio\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})(\/|$|\?)/.exec(url);
  return m ? m[1] : null;
}
