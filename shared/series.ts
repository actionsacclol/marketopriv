import type { PostLog, Reel, Site } from './types';
import { SITE_LABEL } from './warmup';

/**
 * Multi-part series stay together (the user, 2026-11-27: "part 1 and part 2 on insta, then part 3 on twitter, that's a
 * no go"). Part N goes up only on the platforms, and from the account, where part N-1 already went, so nobody meets a
 * series in the middle. Part 1 decides where the series lives.
 */

export interface SeriesPart {
  /** The series, lowercased: the same on every part. */
  key: string;
  /** As written, for messages. */
  name: string;
  part: number;
}

// "KIP and the Steam forum fix, Part 3 (hook: ...)", "3 apps to get on your PC pt.1: Cursor", "Windows crimes #4" is not
// matched (a number alone is not clearly a part).
const PART_RE = /^(.*?)[\s,:;|\-–—]*\b(?:part|pt)\.?\s*(\d{1,2})\b/i;

const keyOf = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Which series a reel is a part of: the vote story fields, or "Part N" / "pt. N" in its title. */
export function seriesPart(r: Pick<Reel, 'title' | 'vote'>): SeriesPart | null {
  if (r.vote?.series && r.vote.part > 0) return { key: keyOf(r.vote.series), name: r.vote.series, part: r.vote.part };
  const m = PART_RE.exec(r.title ?? '');
  if (!m) return null;
  const name = m[1].trim();
  const key = keyOf(name);
  if (!key) return null;
  return { key, name, part: Number(m[2]) };
}

/** Where a reel went up from one account (the post log). */
export function postedSites(posts: PostLog[], reelId: string, handle: string): Set<Site> {
  const h = handle.toLowerCase();
  return new Set(posts.filter((p) => p.reelId === reelId && (p.handle ?? '').toLowerCase() === h).map((p) => p.site));
}

/**
 * Why this reel may not go up on this site from this account (null = fine): a later part of a series goes only where the
 * part before it is already posted.
 */
export function seriesProblem(reels: Reel[], posts: PostLog[], reel: Reel, site: Site, handle: string): string | null {
  const me = seriesPart(reel);
  if (!me || me.part <= 1) return null;
  const prev = reels.filter((r) => r.id !== reel.id && seriesPart(r)?.key === me.key && seriesPart(r)?.part === me.part - 1);
  // The part before was deleted or made outside the hub: nothing to hold it to.
  if (!prev.length) return null;
  const where = new Set<Site>();
  for (const p of prev) for (const s of postedSites(posts, p.id, handle)) where.add(s);
  const label = `Part ${me.part} of "${me.name}"`;
  if (!where.size) return `${label} can't go up yet: Part ${me.part - 1} is not posted from ${handle} anywhere. Post Part ${me.part - 1} first (a series runs in order, on the same platforms).`;
  if (where.has(site)) return null;
  const list = [...where].map((s) => SITE_LABEL[s]).join(', ');
  return `${label} goes only where Part ${me.part - 1} went from ${handle}: ${list}. Part ${me.part - 1} is not on ${SITE_LABEL[site]}, so people there would meet the series in the middle. Post it on ${list} instead, and leave ${SITE_LABEL[site]} for this account's other reels (a new series can start there with its own Part 1).`;
}

/** Later parts still owed on a platform: Part N-1 is up there but Part N, already rendered, is not (for get_today). */
export function seriesOwed(reels: Reel[], posts: PostLog[], handle: string): string[] {
  const out: string[] = [];
  for (const r of reels) {
    const me = seriesPart(r);
    if (!me || me.part <= 1 || !r.renderPath) continue;
    const prev = reels.filter((x) => x.id !== r.id && seriesPart(x)?.key === me.key && seriesPart(x)?.part === me.part - 1);
    if (!prev.length) continue;
    const want = new Set<Site>();
    for (const p of prev) for (const s of postedSites(posts, p.id, handle)) want.add(s);
    const have = postedSites(posts, r.id, handle);
    const missing = [...want].filter((s) => !have.has(s));
    if (have.size && missing.length) out.push(`Part ${me.part} of "${me.name}" (${r.id}) is still owed on ${missing.map((s) => SITE_LABEL[s]).join(', ')}, where Part ${me.part - 1} went.`);
  }
  return out;
}
