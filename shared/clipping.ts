import type { ClipListing, ClipMoment, ClipRange, ClipSettings, ClipSite, ClipSource } from './types';

// The clipping style: a streamer's top Twitch / Kick clips of the last day or week, cut into vertical reels with
// captions (electron/clips.ts reads the clips pages in a hidden window; save_clip downloads one, captions it on this
// computer and shows frames so the AI can place the facecam). The streamer is named in the post caption.

export const CLIP_SITE_LABEL: Record<ClipSite, string> = { twitch: 'Twitch', kick: 'Kick' };
export const CLIP_RANGE_LABEL: Record<ClipRange, string> = { day: 'Last day', week: 'Last week' };
export const MAX_CLIP_SOURCES = 20;

const CHANNEL: Record<ClipSite, RegExp> = { twitch: /^[a-z0-9_]{3,25}$/, kick: /^[a-z0-9_-]{2,30}$/ };

/**
 * A streamer from what the user typed: a name ("syztmz"), or any address on the site ("kick.com/syztmz",
 * "https://www.twitch.tv/shroud/clips"). The site comes from the address, else `site`. Null when it is not one.
 */
export function parseClipSource(input: string, site?: ClipSite): ClipSource | null {
  const s = input.trim();
  if (!s) return null;
  let u: URL | null = null;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : /^(www\.|m\.)?(kick\.com|twitch\.tv)\//i.test(s) ? `https://${s}` : 'x:');
  } catch {
    u = null;
  }
  if (u && /(^|\.)kick\.com$|(^|\.)twitch\.tv$/i.test(u.hostname)) {
    const first = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    const on: ClipSite = /kick\.com$/i.test(u.hostname) ? 'kick' : 'twitch';
    return CHANNEL[on].test(first) ? { site: on, channel: first } : null;
  }
  const name = s.replace(/^@/, '').toLowerCase();
  const on = site ?? 'twitch';
  return CHANNEL[on].test(name) ? { site: on, channel: name } : null;
}

/** The settings as saved: known sites, valid names, no repeats, at most MAX_CLIP_SOURCES. */
export function cleanClipping(c: Partial<ClipSettings> | undefined): ClipSettings | undefined {
  if (!c) return undefined;
  const sources: ClipSource[] = [];
  for (const x of c.sources ?? []) {
    const site: ClipSite | undefined = x?.site === 'kick' || x?.site === 'twitch' ? x.site : undefined;
    const p = site && typeof x.channel === 'string' ? parseClipSource(x.channel, site) : null;
    if (p && !sources.some((y) => y.site === p.site && y.channel === p.channel)) sources.push(p);
  }
  return { sources: sources.slice(0, MAX_CLIP_SOURCES), range: c.range === 'week' ? 'week' : 'day' };
}

/** The streamer's clips page, top by views over the range. */
export function clipsPageUrl(s: ClipSource, range: ClipRange): string {
  return s.site === 'kick'
    ? `https://kick.com/${s.channel}/clips?sort=view&range=${range === 'week' ? 'week' : 'day'}`
    : `https://www.twitch.tv/${s.channel}/clips?filter=clips&range=${range === 'week' ? '7d' : '24hr'}`;
}

/** A single clip's page: kick.com/<channel>/clips/clip_<id>, twitch.tv/<channel>/clip/<slug>, clips.twitch.tv/<slug>. */
export function parseClipUrl(url: string): { site: ClipSite; channel: string; id: string; url: string } | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (/(^|\.)kick\.com$/i.test(u.hostname) && parts.length >= 3 && parts[1] === 'clips' && /^clip_[A-Za-z0-9]+$/.test(parts[2]))
    return { site: 'kick', channel: parts[0].toLowerCase(), id: parts[2], url: `https://kick.com/${parts[0].toLowerCase()}/clips/${parts[2]}` };
  if (/(^|\.)twitch\.tv$/i.test(u.hostname) && !/^clips\./i.test(u.hostname) && parts.length >= 3 && parts[1] === 'clip' && /^[A-Za-z0-9_-]+$/.test(parts[2]))
    return { site: 'twitch', channel: parts[0].toLowerCase(), id: parts[2], url: `https://www.twitch.tv/${parts[0].toLowerCase()}/clip/${parts[2]}` };
  if (/^clips\.twitch\.tv$/i.test(u.hostname) && parts.length === 1 && /^[A-Za-z0-9_-]+$/.test(parts[0]))
    return { site: 'twitch', channel: '', id: parts[0], url: `https://clips.twitch.tv/${parts[0]}` };
  return null;
}

/** The same clip, however its address was written. */
export const clipKey = (url: string): string | null => {
  const c = parseClipUrl(url);
  return c ? `${c.site}:${c.id}` : null;
};

// ── Same moment, clipped twice ──
// Several people clip the same moment, under titles that say nothing ("asdasd", "IRL"). Where each clip starts in the
// stream is exact, so two spans of one stream that share enough are the same moment. Measured on 115 top clips of 6
// streamers (2026-11-18, checked by the user): real repeats shared 41-100% of the shorter clip, back-to-back
// neighbours 5-18%. The line sits between them.
export const SAME_MOMENT_SHARE = 0.3;

export interface MomentSpan {
  stream: string;
  start: number;
  end: number;
}

export const spanOf = (m: ClipMoment, from: number, seconds: number): MomentSpan => ({ stream: m.stream, start: m.start + from, end: m.start + from + Math.max(1, seconds) });

/** True when two spans of one stream share at least SAME_MOMENT_SHARE of the shorter one. */
export function sameMoment(a: MomentSpan, b: MomentSpan): boolean {
  if (a.stream !== b.stream) return false;
  const shared = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  return shared > 0 && shared >= SAME_MOMENT_SHARE * Math.min(a.end - a.start, b.end - b.start);
}

/** "1h56m59s" → seconds. */
export function hmsSeconds(t: string): number | null {
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t.trim());
  if (!m || !(m[1] || m[2] || m[3])) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** Word trigrams of caption lines ("start | text"), for comparing what two clips say. */
export function speechGrams(captions: string): Set<string> {
  const words = captions
    .split('\n')
    .map((l) => l.replace(/^\s*[\d.]+\s*\|/, ''))
    .join(' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i++) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  return out;
}

/** Share of the smaller set's trigrams found in the other (0..1); 0 when either says too little to judge. */
export function speechOverlap(a: Set<string>, b: Set<string>): number {
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  if (small.size < 6) return 0;
  let n = 0;
  for (const g of small) if (big.has(g)) n++;
  return n / small.size;
}

/** "1.9K" / "36,300" / "2M" as a number. */
export function parseCount(s: string): number | null {
  const m = /([\d.,]+)\s*([KMB])?/i.exec(s.replace(/\s+/g, ''));
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] ?? '').toUpperCase() as 'K' | 'M' | 'B'] ?? 1;
  return Math.round(n * mult);
}

/** "0:17", "00:22", "1:02:03" as seconds. */
export function parseDuration(s: string): number | null {
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(s.trim())) return null;
  return s.trim().split(':').reduce((acc, x) => acc * 60 + Number(x), 0);
}

/**
 * One clip card from the page's text, line by line. Both sites show the length ("0:17"), the views ("1.9K views"),
 * the age ("7 days ago", Kick puts a "·" before it), the title, and on Kick the channel and category too.
 */
export function listingFromCard(site: ClipSite, channel: string, url: string, lines: string[]): ClipListing {
  let seconds: number | null = null;
  let views: number | null = null;
  let age = '';
  const rest: string[] = [];
  for (const raw of lines) {
    const l = raw.replace(/^·\s*/, '').trim();
    if (!l || l === '·') continue;
    const d = parseDuration(l);
    if (d !== null && seconds === null) {
      seconds = d;
      continue;
    }
    // Twitch puts length, views and age on one line when it is read as a whole ("0:17 1.9K views 7 days ago").
    const viewsAt = /([\d.,]+\s*[KMB]?)\s+views?\b/i.exec(l);
    if (viewsAt) {
      views ??= parseCount(viewsAt[1]);
      const ago = /(\d+\s+\w+\s+ago|yesterday|today|just now)$/i.exec(l);
      if (ago && !age) age = ago[1];
      const len = /^(\d{1,2}(?::\d{2}){1,2})\b/.exec(l);
      if (len && seconds === null) seconds = parseDuration(len[1]);
      continue;
    }
    if (/\bago$|^yesterday$|^today$/i.test(l)) {
      age ||= l;
      continue;
    }
    if (/^[\d.,]+\s*[KMB]?$/i.test(l)) continue;
    if (l.toLowerCase() === channel.toLowerCase()) continue;
    rest.push(l);
  }
  return { site, channel, url, title: rest[0] ?? '', seconds, views, age };
}
