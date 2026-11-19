import type { Reel, ReelMetrics, Site } from './types';
import { timingFor } from './presets';

// How a posted reel did, from its latest metrics snapshot. Rates are per
// account reached (views when reach wasn't recorded), the way Instagram says
// it ranks reels: watch time first, then sends and likes per reach. The score
// is a rough 0-100 guide for comparing our own reels, not an Instagram number.

export interface ReelResult {
  reel: Reel;
  m: ReelMetrics;
  length: number;
  /** Average watch / length, 0..1+ (null without avg watch). */
  hold: number | null;
  /** Percent that skipped (null when not recorded). */
  skip: number | null;
  base: number;
  shareRate: number;
  saveRate: number;
  likeRate: number;
  commentRate: number;
  followRate: number;
  score: number;
}

// Rates (per reach) that count as excellent for a small account.
const GOOD = { share: 0.02, save: 0.02, like: 0.08, comment: 0.01, follow: 0.01 };

/** Snapshots from one platform, oldest first (missing site = Instagram). */
export const metricsOn = (reel: Reel, site: Site = 'instagram'): ReelMetrics[] => (reel.metrics ?? []).filter((m) => (m.site ?? 'instagram') === site);

export function resultOf(reel: Reel, site: Site = 'instagram'): ReelResult | null {
  const all = metricsOn(reel, site);
  const m = all[all.length - 1];
  if (!m) return null;
  const base = m.reach || m.views || 0;
  const length = timingFor(reel.preset, reel.fields).total;
  const per = (n?: number): number => (base > 0 && n ? n / base : 0);
  const hold = m.avgWatch !== undefined && length > 0 ? m.avgWatch / length : null;
  const skip = m.skipRate ?? null;
  const parts: Array<[number, number]> = [
    [Math.min(1, per(m.shares) / GOOD.share), 20],
    [Math.min(1, per(m.saves) / GOOD.save), 10],
    [Math.min(1, per(m.likes) / GOOD.like), 10],
    [Math.min(1, per(m.comments) / GOOD.comment), 5],
    [Math.min(1, per(m.follows) / GOOD.follow), 15],
  ];
  if (hold !== null) parts.push([Math.min(1, hold), 30]);
  if (skip !== null) parts.push([Math.max(0, 1 - skip / 100), 10]);
  const weight = parts.reduce((n, [, w]) => n + w, 0);
  const score = base > 0 ? Math.round((100 * parts.reduce((n, [v, w]) => n + v * w, 0)) / weight) : 0;
  return {
    reel,
    m,
    length,
    hold,
    skip,
    base,
    shareRate: per(m.shares),
    saveRate: per(m.saves),
    likeRate: per(m.likes),
    commentRate: per(m.comments),
    followRate: per(m.follows),
    score,
  };
}

export const pct = (v: number | null, digits = 1): string => (v === null ? '—' : `${(v * 100).toFixed(digits)}%`);

/** Reels grouped by hook test, each group best first. */
export function hookGroups(reels: Reel[]): Array<{ group: string; reels: Array<{ reel: Reel; result: ReelResult | null }> }> {
  const map = new Map<string, Reel[]>();
  for (const r of reels) if (r.group) map.set(r.group, [...(map.get(r.group) ?? []), r]);
  return [...map.entries()].map(([group, rs]) => ({
    group,
    reels: rs
      .map((reel) => ({ reel, result: resultOf(reel) }))
      .sort((a, b) => (b.result?.score ?? -1) - (a.result?.score ?? -1) || (a.reel.variant ?? '').localeCompare(b.reel.variant ?? '')),
  }));
}

/** The opening line of a reel, for comparing hooks. */
export function hookLine(reel: Reel): string {
  const f = reel.fields;
  if (reel.preset === 'story') {
    const first = String(f.beats ?? '').split('\n').find((l) => l.trim());
    return (first?.split('|')[1] ?? '').replace(/\*/g, '').trim();
  }
  return String(f.headline ?? '').replace(/\n/g, ' ').trim();
}
