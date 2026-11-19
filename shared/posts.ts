import type { PostLog, Reel, Site } from './types';
import { SITES, linkOn, localDate } from './warmup';

/** A post's day in local time (a bare YYYY-MM-DD stays as given). */
const dayOf = (at: string): string => (/^\d{4}-\d{2}-\d{2}$/.test(at) ? at : localDate(at));

// The post log: everything that went up on each platform, whether Marketo made
// it or not. The AI reads it before making a reel so it doesn't repeat a story,
// and get_today lists the recent ones.

/** One key per post, however its link was written (instagram /p/ vs /reel/, youtu.be vs /shorts/, ...). */
export function postKey(url: string): string {
  const u = url.trim();
  let m = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels)\/([A-Za-z0-9_-]+)/.exec(u);
  if (m) return `ig:${m[1]}`;
  m = /(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/.exec(u);
  if (m) return `x:${m[1]}`;
  m = /(?:youtube\.com\/(?:shorts\/|watch\?v=|live\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/.exec(u);
  if (m) return `yt:${m[1]}`;
  m = /studio\.youtube\.com\/video\/([A-Za-z0-9_-]{6,})/.exec(u);
  if (m) return `yt:${m[1]}`;
  m = /tiktok\.com\/@[^/]+\/(?:video|photo)\/(\d+)/.exec(u);
  if (m) return `tt:${m[1]}`;
  m = /facebook\.com\/(?:reel\/|watch\/?\?v=|[^/]+\/videos\/|[^/]+\/posts\/|share\/[rv]\/)([A-Za-z0-9_-]{5,})/.exec(u);
  if (m) return `fb:${m[1]}`;
  m = /threads\.(?:com|net)\/@[^/]+\/post\/([A-Za-z0-9_-]+)/.exec(u);
  if (m) return `th:${m[1]}`;
  m = /pinterest\.[a-z.]+\/pin\/([A-Za-z0-9_-]+)/.exec(u);
  if (m) return `pin:${m[1]}`;
  return u.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
}

/** The site a post link belongs to, if it can be told from the link. */
export function siteOfUrl(url: string): Site | undefined {
  const k = postKey(url);
  const PREFIX: Record<string, Site> = { ig: 'instagram', x: 'x', yt: 'youtube', tt: 'tiktok', fb: 'facebook', th: 'threads', pin: 'pinterest' };
  return PREFIX[k.split(':')[0]] && k.includes(':') ? PREFIX[k.split(':')[0]] : undefined;
}

/** A reel's links on every platform it went up on, as post-log entries. */
export function reelPosts(r: Reel, fallbackHandle: string): Array<Omit<PostLog, 'id' | 'key' | 'addedAt'>> {
  const out: Array<Omit<PostLog, 'id' | 'key' | 'addedAt'>> = [];
  const handle = r.postedBy ?? fallbackHandle;
  const add = (site: Site, url?: string, at?: string): void => {
    if (url) out.push({ site, handle, url, postedAt: at, title: r.title, kind: 'video', reelId: r.id, source: 'marketo' });
  };
  for (const s of SITES) {
    const l = linkOn(r, s);
    add(s, l?.url, l?.at);
  }
  return out;
}

/** Add or update posts by link. A post already logged keeps its id and gains whatever new fields arrive. */
export function mergePosts(list: PostLog[], items: Array<Omit<PostLog, 'id' | 'key' | 'addedAt'>>, newId: () => string, now: string): { list: PostLog[]; added: PostLog[]; updated: PostLog[] } {
  const next = [...list];
  const added: PostLog[] = [];
  const updated: PostLog[] = [];
  for (const it of items) {
    const key = postKey(it.url);
    const i = next.findIndex((p) => p.key === key);
    const given = Object.fromEntries(Object.entries(it).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) as Partial<PostLog>;
    if (i >= 0) {
      const prev = next[i];
      const p: PostLog = { ...prev, ...given, id: prev.id, key, addedAt: prev.addedAt, source: prev.source === 'marketo' ? 'marketo' : it.source, reelId: it.reelId ?? prev.reelId, updatedAt: now };
      next[i] = p;
      updated.push(p);
    } else {
      const p: PostLog = { ...(given as PostLog), id: newId(), key, addedAt: now };
      next.push(p);
      added.push(p);
    }
  }
  next.sort((a, b) => (b.postedAt ?? b.addedAt).localeCompare(a.postedAt ?? a.addedAt));
  return { list: next, added, updated };
}

const STOP = new Set(
  'about after again also another because been before being between both could does doing down each every from have having here into just like made make more most much only other over same should since some such than that their them then there these they this those through under until very what when where which while will with would your yours just ever still never krypt kryptcc cc short shorts reel video videos free tool tools guide tutorial showcase trailer version official'.split(' '),
);
const words = (s: string): Set<string> => new Set((s.toLowerCase().match(/[a-z0-9$]+/g) ?? []).filter((w) => (w.length >= 4 || /\d/.test(w)) && !STOP.has(w)));
const textOf = (p: PostLog): string => [p.title, p.topic ?? '', (p.tools ?? []).join(' ')].join(' ');

/** Logged posts that look like the same story as text (shared distinctive words), best match first. */
export function similarPosts(text: string, posts: PostLog[], limit = 5): PostLog[] {
  const a = words(text);
  if (!a.size) return [];
  return posts
    .map((p) => {
      const b = words(textOf(p));
      let shared = 0;
      for (const w of a) if (b.has(w)) shared++;
      return { p, shared, score: b.size ? shared / Math.min(a.size, b.size) : 0 };
    })
    .filter((x) => x.shared >= 3 || (x.shared >= 2 && x.score >= 0.5))
    .sort((x, y) => y.shared - x.shared || y.score - x.score)
    .slice(0, limit)
    .map((x) => x.p);
}

const LABEL: Record<Site, string> = { instagram: 'Instagram', youtube: 'YouTube', x: 'X', tiktok: 'TikTok', facebook: 'Facebook', threads: 'Threads', pinterest: 'Pinterest' };

/** One line per post for the AI. */
export function postLine(p: PostLog): string {
  const stats = [p.views !== undefined ? `${p.views} views` : '', p.likes !== undefined ? `${p.likes} likes` : '', p.comments !== undefined ? `${p.comments} comments` : ''].filter(Boolean).join(', ');
  return [
    p.postedAt ? dayOf(p.postedAt) : 'date unknown',
    LABEL[p.site],
    p.account ?? p.handle,
    `"${p.title}"`,
    p.topic ? `story: ${p.topic}` : '',
    p.tools?.length ? `tools: ${p.tools.join(', ')}` : '',
    p.kind && p.kind !== 'video' ? p.kind : '',
    stats,
    p.reelId ? `reel ${p.reelId}` : '',
    p.url,
  ]
    .filter(Boolean)
    .join(' · ');
}
