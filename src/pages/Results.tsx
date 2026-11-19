import { AtSign, ExternalLink, Facebook, Instagram, Lightbulb, MessageCircle, Music2, Pin, Trash2, TrendingUp, Youtube } from 'lucide-react';
import type { IgAccount, Reel, Site } from '@shared/types';
import { hookGroups, hookLine, pct, resultOf, type ReelResult } from '@shared/score';
import { SITES, SITE_LABEL, linkOn, localDate, netOf, postTarget, sameHandle, siteOn } from '@shared/warmup';
import { formatById } from '@shared/formats';
import { Card, Empty, Page, Section, Stat } from '../components/ui';
import { useApp } from '../state/store';
import { cls, fmtDate, fmtNum } from '../lib/format';

// Results: how posted reels did (ranked), hook tests side by side and what we
// learned. The AI fills it from each reel's Insights (record_reel_metrics) and
// reads the same numbers back with get_performance.

// ── Accounts by platform ───────────────────────────────────────────────────
const PLATFORM_ICON: Record<Site, typeof AtSign> = { instagram: Instagram, youtube: Youtube, x: AtSign, tiktok: Music2, facebook: Facebook, threads: MessageCircle, pinterest: Pin };
const PLATFORMS: Site[] = SITES;
const onSite = siteOn;
const nameOn = (a: IgAccount, s: Site): string =>
  s === 'instagram' ? a.handle : s === 'youtube' ? a.youtube?.channelName ?? 'channel not seen yet' : netOf(a, s)?.handle ?? 'handle not seen yet';
/** The reel's link and date on a platform, if it went up there. */
const postOn = linkOn;

function PlatformCard({ site }: { site: Site }) {
  const db = useApp((s) => s.db)!;
  const Icon = PLATFORM_ICON[site];
  const accts = db.igAccounts.filter((a) => onSite(a, site));
  const single = db.igAccounts.length === 1;
  const weekAgo = Date.now() - 7 * 86_400_000;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4" /> {SITE_LABEL[site]}
        <span className="ml-auto text-[11px] font-normal text-krypt-muted">
          {accts.length} account{accts.length === 1 ? '' : 's'}
        </span>
      </div>
      {accts.length === 0 && <div className="text-xs text-krypt-muted">No account runs here yet (Accounts page).</div>}
      {accts.map((a) => {
        const snaps = db.accounts.filter((x) => (x.site ?? 'instagram') === site && sameHandle(x.handle, a.handle)).sort((x, y) => x.at.localeCompare(y.at));
        const last = snaps[snaps.length - 1];
        const before = [...snaps].reverse().find((x) => Date.parse(x.at) <= weekAgo) ?? snaps[0];
        const delta = last && before && before !== last ? last.followers - before.followers : null;
        const posts = db.reels
          .map((r) => ({ r, p: postOn(r, site) }))
          .filter((x): x is { r: Reel; p: { url: string; at?: string } } => !!x.p && (x.r.postedBy ? sameHandle(x.r.postedBy, a.handle) : single));
        const log = (db.posts ?? []).filter((p) => p.site === site && sameHandle(p.handle, a.handle));
        const week = log.filter((p) => Date.parse(p.postedAt ?? p.addedAt) >= weekAgo).length;
        const t = postTarget(a, site, db.sessions, localDate(), db.reels, single);
        return (
          <div key={a.id} className="space-y-1.5 rounded-lg border border-white/10 px-3 py-2">
            <div className="flex items-baseline gap-2">
              <span className="truncate font-mono text-sm">{nameOn(a, site)}</span>
              {site !== 'instagram' && <span className="truncate text-[11px] text-krypt-muted">via {a.handle}</span>}
              <span className="ml-auto shrink-0 font-mono text-xs">
                {last ? fmtNum(last.followers) : '—'} <span className="text-krypt-muted">{site === 'youtube' ? 'subs' : 'followers'}</span>
                {delta !== null && delta !== 0 && <span className={delta > 0 ? 'text-emerald-400' : 'text-rose-300'}> {delta > 0 ? '+' : ''}{delta}</span>}
              </span>
            </div>
            <div className="text-[11px] text-krypt-muted">
              Today {t.done}/{t.target} · {week} this week · {log.length} in the post log · {posts.length} made with Marketo{last ? ` · stats ${fmtDate(last.at)}` : ''}
            </div>
            {log.slice(0, 3).map((p) => (
              <button key={p.id} onClick={() => void window.marketo.app.openExternal(p.url)} className="flex w-full items-center gap-2 text-left text-xs text-white/80 hover:text-white">
                <ExternalLink className="h-3 w-3 shrink-0 text-krypt-muted" />
                <span className="truncate">{p.title}</span>
                <span className="ml-auto shrink-0 text-[11px] text-krypt-muted">{p.postedAt ? fmtDate(p.postedAt) : ''}</span>
              </button>
            ))}
          </div>
        );
      })}
    </Card>
  );
}

const scoreTone = (s: number): string => (s >= 60 ? 'text-emerald-400' : s >= 35 ? 'text-amber-300' : 'text-white/60');

function Row({ x, rank }: { x: ReelResult; rank: number }) {
  const go = useApp((s) => s.go);
  const m = x.m;
  return (
    <tr className="cursor-pointer border-t border-white/5 hover:bg-white/[0.03]" onClick={() => go('library', x.reel.id)}>
      <td className="py-2 pl-3 pr-2 font-mono text-xs text-krypt-muted">{rank}</td>
      <td className={cls('px-2 font-mono text-base font-semibold', scoreTone(x.score))}>{x.score}</td>
      <td className="max-w-[320px] px-2">
        <div className="truncate text-sm font-medium">{x.reel.title}</div>
        <div className="truncate text-[11px] text-krypt-muted">
          {x.reel.format ? formatById(x.reel.format)?.name ?? x.reel.format : x.reel.preset}
          {x.reel.trial ? ' · trial' : ''} · “{x.reel.hook ?? hookLine(x.reel)}”
        </div>
      </td>
      <td className="px-2 text-right font-mono text-xs">{fmtNum(m.views)}</td>
      <td className="px-2 text-right font-mono text-xs">{pct(x.hold, 0)}</td>
      <td className="px-2 text-right font-mono text-xs">{m.skipRate === undefined ? '—' : `${m.skipRate}%`}</td>
      <td className="px-2 text-right font-mono text-xs">{pct(x.shareRate)}</td>
      <td className="px-2 text-right font-mono text-xs">{pct(x.saveRate)}</td>
      <td className="px-2 text-right font-mono text-xs">{pct(x.likeRate)}</td>
      <td className="px-2 pr-3 text-right font-mono text-xs">{pct(x.followRate, 2)}</td>
    </tr>
  );
}

export default function Results() {
  const db = useApp((s) => s.db)!;
  const toast = useApp((s) => s.toast);
  const results = db.reels
    .map((r) => resultOf(r))
    .filter((x): x is ReelResult => !!x)
    .sort((a, b) => b.score - a.score);
  const groups = hookGroups(db.reels);
  const posted = db.reels.filter((r) => r.status === 'posted');
  const waiting = posted.filter((r) => !r.metrics?.length);
  const avg = (f: (x: ReelResult) => number | null): number | null => {
    const v = results.map(f).filter((n): n is number => n !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  return (
    <Page title="Results" subtitle="What worked: every posted reel ranked, hook tests side by side, and the lessons we keep.">
      <div className="space-y-6">
        <div className="grid grid-cols-4 gap-4">
          <Stat label="Posted" value={posted.length} sub={waiting.length ? `${waiting.length} waiting for numbers` : 'all measured'} />
          <Stat label="Avg hold" value={pct(avg((x) => x.hold), 0)} sub="avg watch / length" accent />
          <Stat label="Avg share rate" value={pct(avg((x) => x.shareRate))} sub="sends per account reached" />
          <Stat label="Hook tests" value={groups.length} sub={`${db.learnings.length} learning${db.learnings.length === 1 ? '' : 's'}`} />
        </div>

        <Section title="Accounts by platform" description="Every account on each platform: followers (change over the last week), today's posts against its target, and what Marketo posted there. Your AI records follower counts with record_account_stats.">
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {PLATFORMS.filter((s) => s === 'instagram' || db.igAccounts.some((a) => onSite(a, s))).map((s) => (
              <PlatformCard key={s} site={s} />
            ))}
          </div>
        </Section>

        <Section title="Ranked" description="Score 0–100: hold 30, shares 20, follows 15, saves 10, likes 10, skip 10, comments 5 (per account reached). For comparing our own reels.">
          {results.length ? (
            <Card padded={false} className="overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-krypt-muted">
                    <th className="py-2 pl-3 pr-2">#</th>
                    <th className="px-2">Score</th>
                    <th className="px-2">Reel</th>
                    <th className="px-2 text-right">Views</th>
                    <th className="px-2 text-right">Hold</th>
                    <th className="px-2 text-right">Skip</th>
                    <th className="px-2 text-right">Shares</th>
                    <th className="px-2 text-right">Saves</th>
                    <th className="px-2 text-right">Likes</th>
                    <th className="px-2 pr-3 text-right">Follows</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((x, i) => (
                    <Row key={x.reel.id} x={x} rank={i + 1} />
                  ))}
                </tbody>
              </table>
            </Card>
          ) : (
            <Empty icon={<TrendingUp className="h-6 w-6" />} title="No numbers yet">
              Once a reel is live, ask your AI to read its Insights (views, reach, average watch time, skip rate, shares, saves, follows). They land here.
            </Empty>
          )}
        </Section>

        {groups.length > 0 && (
          <Section title="Hook tests" description="Same reel, different openings. The leader is the best score once two versions have numbers.">
            <div className="grid grid-cols-2 gap-4">
              {groups.map((g) => {
                const measured = g.reels.filter((x) => x.result).length;
                return (
                  <Card key={g.group} className="space-y-2">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-krypt-muted">{g.group}</div>
                    {g.reels.map((x, i) => (
                      <div key={x.reel.id} className={cls('flex items-center gap-3 rounded-lg border px-3 py-2', i === 0 && measured >= 2 ? 'border-emerald-400/40 bg-emerald-400/5' : 'border-white/10')}>
                        <div className="w-6 font-mono text-sm font-semibold">{x.reel.variant}</div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{x.reel.hook ?? hookLine(x.reel)}</div>
                          <div className="truncate text-[11px] text-krypt-muted">“{hookLine(x.reel)}” · {x.reel.status}</div>
                        </div>
                        <div className="text-right font-mono text-xs">
                          {x.result ? (
                            <>
                              <div className={cls('text-sm font-semibold', scoreTone(x.result.score))}>{x.result.score}</div>
                              <div className="text-krypt-muted">hold {pct(x.result.hold, 0)}</div>
                            </>
                          ) : (
                            <span className="text-krypt-muted">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </Card>
                );
              })}
            </div>
          </Section>
        )}

        <Section title="Learnings" description="Lessons from the numbers. Your AI reads these before writing the next reel.">
          {db.learnings.length ? (
            <div className="space-y-2">
              {db.learnings.map((l) => (
                <Card key={l.id} className="flex items-start gap-3">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{l.text}</div>
                    <div className="mt-1 text-[11px] text-krypt-muted">{fmtDate(l.at)}</div>
                  </div>
                  <button
                    className="text-krypt-muted transition hover:text-red-400"
                    title="Delete"
                    onClick={() => void window.marketo.db.deleteLearning(l.id).then((r) => !r.ok && toast('error', r.message ?? 'Could not delete.'))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-sm text-krypt-muted">None yet. After a hook test or a few posts, Claude saves what the numbers show (add_learning).</div>
          )}
        </Section>
      </div>
    </Page>
  );
}
