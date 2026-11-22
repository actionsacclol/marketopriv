// Goal-driven extra runs (Autopilot): between the scheduled runs, a short run starts by itself when posts are still
// owed today and a platform's spacing allows one now. Only with the token saver off (every run uses AI plan), and
// never more a day than the user's own number.

import type { Db, IgAccount, Site } from './types';
import { humanCheckUntil } from './humanCheck';
import { linkOn, localDate, postGap, postTarget, sameHandle, sitesOf, watchOnlyOn } from './warmup';

/** Extra runs a day when the user has not set a number (0 = none). */
export const EXTRA_RUNS_DEFAULT = 4;
/** An extra run is told to take about this long… */
export const EXTRA_RUN_MIN = 15;
/** …and is stopped after this long. */
export const EXTRA_KILL_MIN = 30;
/** No extra run this close before a scheduled one: that run does the work. */
export const EXTRA_BEFORE_RUN_MIN = 40;
/** Nor this soon after any run ended. */
export const EXTRA_AFTER_RUN_MIN = 10;
/** Nor later than this many minutes after the day's last scheduled run. */
export const EXTRA_AFTER_LAST_MIN = 120;
/** A platform two extra runs in a row could not post on is left to the scheduled runs for the rest of the day. */
export const EXTRA_TRIES = 2;

export interface PostOwed {
  handle: string;
  site: Site;
  /** Posts still owed today there. */
  left: number;
  /** Posts done today there. */
  done: number;
  /** When the platform's spacing allows the next one (ms). */
  at: number;
}

/** The account's last confirmed post on a platform (ms; 0 = none). */
export function lastPostAt(d: Pick<Db, 'reels' | 'posts'>, a: IgAccount, site: Site): number {
  const times: number[] = [];
  for (const r of d.reels) {
    const at = linkOn(r, site)?.at;
    if (at && (!r.postedBy || sameHandle(r.postedBy, a.handle))) times.push(Date.parse(at));
  }
  for (const p of d.posts) if (p.site === site && p.postedAt && sameHandle(p.handle, a.handle)) times.push(Date.parse(p.postedAt));
  if (site === 'youtube') for (const u of a.youtube?.uploads ?? []) times.push(Date.parse(u));
  return Math.max(0, ...times.filter((n) => Number.isFinite(n) && n <= Date.now() + 60_000));
}

/** Every platform where posts are still owed today (target not met), with when the next one may go. */
export function postsOwed(d: Pick<Db, 'igAccounts' | 'sessions' | 'reels' | 'posts'>, now = Date.now()): PostOwed[] {
  const today = localDate(new Date(now));
  const out: PostOwed[] = [];
  for (const a of d.igAccounts) {
    if (a.status === 'paused') continue;
    for (const site of sitesOf(a)) {
      if (site !== 'youtube' && watchOnlyOn(a, site)) continue;
      // Read-only for a while after a human check: no post can go there, so no extra run for it.
      if (site !== 'youtube' && humanCheckUntil(a, site, now)) continue;
      const t = postTarget(a, site, d.sessions, today, d.reels, d.igAccounts.length === 1);
      if (t.target - t.done <= 0) continue;
      const last = lastPostAt(d, a, site);
      out.push({ handle: a.handle, site, left: t.target - t.done, done: t.done, at: last ? last + postGap(a, site) * 60_000 : now });
    }
  }
  return out;
}

/** Owed and allowed now (or within a couple of minutes). */
export const postsDueNow = (d: Pick<Db, 'igAccounts' | 'sessions' | 'reels' | 'posts'>, now = Date.now()): PostOwed[] => postsOwed(d, now).filter((p) => p.at <= now + 2 * 60_000);

/** A report file is an extra run's ("run-…-extra.txt"). */
export const isExtraReport = (file: string): boolean => /-extra\.(txt|json)$/.test(file);
