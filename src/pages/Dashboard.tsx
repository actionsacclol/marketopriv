import { runCountdown, runWhen } from '../lib/autopilotWindow';
import { useEffect, useMemo, useState } from 'react';
import { Activity, Bot, CircleAlert, Clapperboard, Eye, Heart, LineChart, MousePointerClick, Play, Radio, Send, ShieldCheck, Sparkles, UserPlus, Wand2, Zap } from 'lucide-react';
import type { AccountSnapshot, McpActivity, Session, Site } from '@shared/types';
import { SITE_LABEL, sameHandle } from '@shared/warmup';
import { Card, Empty, GhostButton, Section, StatusChip } from '../components/ui';
import { GlassPanel } from '../components/glass/GlassPanel';
import { GlassButton } from '../components/glass/GlassButton';
import { GLASS_RINGS, GLASS_TINTS } from '../components/glass/glassPresets';
import { ReelThumb } from '../components/ReelThumb';
import { PlatformTile } from '../components/Platforms';
import { accountSites, openSite, SITE_COLOR, SITE_ICON } from '../lib/platforms';
import { refreshAutopilot, useApp } from '../state/store';
import { cls, fmtDate, fmtNum, timeAgo } from '../lib/format';

const INK = '#A855F7';

/** Single-series line (followers over time) with a hover crosshair + readout. */
function FollowersChart({ snaps }: { snaps: AccountSnapshot[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 640;
  const h = 200;
  const pad = { l: 44, r: 12, t: 12, b: 26 };
  const xs = snaps.map((s) => new Date(s.at).getTime());
  const ys = snaps.map((s) => s.followers);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const yMax = Math.max(10, ...ys) * 1.15;
  const X = (t: number): number => pad.l + ((t - x0) / (x1 - x0)) * (w - pad.l - pad.r);
  const Y = (v: number): number => h - pad.b - (v / yMax) * (h - pad.t - pad.b);
  const path = snaps.map((s, i) => `${i ? 'L' : 'M'}${X(xs[i]).toFixed(1)},${Y(s.followers).toFixed(1)}`).join(' ');
  const ticks = [0, 0.5, 1].map((k) => Math.round(yMax * k));
  const hv = hover !== null ? snaps[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" onMouseLeave={() => setHover(null)}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={pad.l - 8} y={Y(v) + 4} textAnchor="end" className="fill-white/40 font-mono text-[10px]">
              {fmtNum(v)}
            </text>
          </g>
        ))}
        <path d={`${path} L${X(xs[xs.length - 1])},${Y(0)} L${X(xs[0])},${Y(0)} Z`} fill="url(#fg)" />
        <defs>
          <linearGradient id="fg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={INK} stopOpacity="0.25" />
            <stop offset="1" stopColor={INK} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path} fill="none" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
        {hv && <line x1={X(xs[hover!])} x2={X(xs[hover!])} y1={pad.t} y2={h - pad.b} stroke="rgba(255,255,255,0.25)" strokeDasharray="3 3" />}
        {snaps.map((s, i) => (
          <g key={s.at}>
            <circle cx={X(xs[i])} cy={Y(s.followers)} r={hover === i ? 5 : 4} fill={INK} stroke="#11111A" strokeWidth="2" />
            <rect x={X(xs[i]) - 14} y={pad.t} width={28} height={h - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
          </g>
        ))}
        <text x={pad.l} y={h - 6} className="fill-white/40 font-mono text-[10px]">
          {new Date(x0).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>
        <text x={w - pad.r} y={h - 6} textAnchor="end" className="fill-white/40 font-mono text-[10px]">
          {new Date(x1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </text>
      </svg>
      {hv && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs">
          <div className="text-krypt-muted">{fmtDate(hv.at)}</div>
          <div className="font-mono text-white">{fmtNum(hv.followers)} followers</div>
          <div className="font-mono text-krypt-muted">
            {fmtNum(hv.following)} following · {fmtNum(hv.posts)} posts
          </div>
        </div>
      )}
    </div>
  );
}

/** Minutes of activity per day, last 14 days (single series bars with hover). */
function ActivityBars({ sessions }: { sessions: Session[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => {
    const out: Array<{ key: string; label: string; minutes: number; likes: number; follows: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const list = sessions.filter((s) => new Date(s.startedAt).toDateString() === key);
      out.push({ key, label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), minutes: Math.round(list.reduce((n, s) => n + s.minutes, 0)), likes: list.reduce((n, s) => n + s.likes, 0), follows: list.reduce((n, s) => n + s.follows, 0) });
    }
    return out;
  }, [sessions]);
  const w = 640;
  const h = 200;
  const pad = { l: 30, r: 8, t: 12, b: 26 };
  // A round top value, so the axis never prints float noise.
  const max = Math.ceil(Math.max(30, ...days.map((d) => d.minutes)) / 10) * 10;
  const bw = (w - pad.l - pad.r) / days.length;
  const hv = hover !== null ? days[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" onMouseLeave={() => setHover(null)}>
        <line x1={pad.l} x2={w - pad.r} y1={h - pad.b} y2={h - pad.b} stroke="rgba(255,255,255,0.12)" />
        <line x1={pad.l} x2={w - pad.r} y1={pad.t} y2={pad.t} stroke="rgba(255,255,255,0.05)" />
        <text x={pad.l - 6} y={pad.t + 4} textAnchor="end" className="fill-white/40 font-mono text-[10px]">
          {max}
        </text>
        {days.map((d, i) => {
          const bh = (d.minutes / max) * (h - pad.t - pad.b);
          const x = pad.l + i * bw + 2;
          return (
            <g key={d.key} onMouseEnter={() => setHover(i)}>
              <rect x={x - 2} y={pad.t} width={bw} height={h - pad.t - pad.b} fill="transparent" />
              {bh > 0 && <path d={`M${x},${h - pad.b} V${h - pad.b - bh + 4} q0,-4 4,-4 H${x + bw - 8} q4,0 4,4 V${h - pad.b} Z`} fill={INK} opacity={hover === null || hover === i ? 1 : 0.55} />}
              {(i % 3 === 1 || i === days.length - 1) && (
                <text x={x + (bw - 4) / 2} y={h - 8} textAnchor="middle" className="fill-white/40 font-mono text-[10px]">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hv && (
        <div className="pointer-events-none absolute right-2 top-0 rounded-lg border border-white/10 bg-black/80 px-3 py-2 text-xs">
          <div className="text-krypt-muted">{hv.label}</div>
          <div className="font-mono text-white">{hv.minutes} min</div>
          <div className="font-mono text-krypt-muted">
            {hv.likes} likes · {hv.follows} follows
          </div>
        </div>
      )}
    </div>
  );
}

// ── Live feed ───────────────────────────────────────────────────────────────
const SITE_WORD: Record<string, Site> = { instagram: 'instagram', youtube: 'youtube', x: 'x', tiktok: 'tiktok', facebook: 'facebook', threads: 'threads', pinterest: 'pinterest' };

/** What an AI tool call did, in words a person reads at a glance. */
function describe(a: McpActivity): { text: string; icon: typeof Zap; site?: Site; quiet: boolean } {
  const site = SITE_WORD[/"site"\s*:\s*"(\w+)"/.exec(a.args)?.[1] ?? ''] ?? (a.tool.startsWith('browser_') ? 'instagram' : undefined);
  const on = site ? ` on ${SITE_LABEL[site]}` : '';
  const quoted = /"([^"]{1,40})"/.exec(a.result)?.[1];
  switch (a.tool) {
    case 'browser_click':
      if (quoted && /^(like|unlike)$/i.test(quoted)) return { text: `Liked a post${on}`, icon: Heart, site, quiet: false };
      if (quoted && /^follow/i.test(quoted)) return { text: `Followed someone${on}`, icon: UserPlus, site, quiet: false };
      if (quoted && /^(post|share|publish|reply)$/i.test(quoted)) return { text: `Pressed "${quoted}"${on}`, icon: Send, site, quiet: false };
      return { text: quoted ? `Clicked "${quoted}"${on}` : `Clicked${on}`, icon: MousePointerClick, site, quiet: false };
    case 'browser_type':
      return { text: `Typed${on}`, icon: Send, site, quiet: false };
    case 'browser_open':
      return { text: `Opened ${site ? SITE_LABEL[site] : 'the browser'}`, icon: Play, site, quiet: false };
    case 'browser_scroll':
    case 'browser_wait':
      return { text: `Watching the feed${on}`, icon: Eye, site, quiet: true };
    case 'browser_snapshot':
    case 'browser_screenshot':
      return { text: `Reading the page${on}`, icon: Eye, site, quiet: true };
    case 'browser_attach_reel':
    case 'browser_attach_image':
      return { text: `Attached a ${a.tool.endsWith('reel') ? 'video' : 'picture'}${on}`, icon: Send, site, quiet: false };
    case 'mark_posted':
      return { text: 'Posted a reel', icon: Send, quiet: false };
    case 'create_reel':
    case 'duplicate_reel':
    case 'make_hook_variants':
      return { text: 'Wrote a new reel', icon: Wand2, quiet: false };
    case 'update_reel':
      return { text: 'Edited a reel', icon: Wand2, quiet: false };
    case 'render_reel':
      return { text: 'Rendered a reel', icon: Clapperboard, quiet: false };
    case 'render_image':
      return { text: 'Saved an image for a post', icon: Clapperboard, quiet: false };
    case 'preview_reel':
      return { text: 'Checked a reel frame by frame', icon: Eye, quiet: true };
    case 'log_session':
      return { text: 'Logged a session', icon: Activity, quiet: false };
    case 'record_account_stats':
    case 'record_reel_metrics':
      return { text: 'Recorded new numbers', icon: LineChart, quiet: false };
    default:
      return { text: a.tool.replace(/^(get|list)_/, 'Read ').replace(/_/g, ' '), icon: Zap, quiet: true };
  }
}

function LiveFeed() {
  const mcp = useApp((s) => s.mcp);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const items = (mcp?.activity ?? []).slice(-14).reverse();
  const connected = (mcp?.clients.length ?? 0) > 0;
  const busy = items[0]?.state === 'running';
  return (
    <Card padded={false} className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <span className="relative flex h-2.5 w-2.5">
          {(connected || busy) && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={cls('relative inline-flex h-2.5 w-2.5 rounded-full', connected || busy ? 'bg-emerald-400' : 'bg-white/25')} />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Live</span>
        <span className="ml-auto truncate text-[11px] text-krypt-muted">{connected ? mcp!.clients.map((c) => c.name).join(', ') : 'no AI connected right now'}</span>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center text-sm text-krypt-muted">
          <Radio className="mb-2 h-6 w-6 text-krypt-purple" />
          Every like, follow, post and reply your AI makes shows up here as it happens.
        </div>
      ) : (
        <div className="min-h-0 flex-1 divide-y divide-white/[0.04] overflow-auto">
          {items.map((a, i) => {
            const d = describe(a);
            const Icon = d.site ? SITE_ICON[d.site] : d.icon;
            return (
              <div key={a.id} className={cls('flex items-center gap-3 px-4 py-2.5', i === 0 && 'animate-fade-in', d.quiet && 'opacity-60')}>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10" style={{ background: d.site ? `${SITE_COLOR[d.site]}1f` : 'rgba(168,85,247,0.12)' }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: d.site ? SITE_COLOR[d.site] : INK }} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-white">{d.text}</div>
                  <div className="truncate font-mono text-[10px] text-krypt-muted">
                    {a.client} · {timeAgo(new Date(a.ts).toISOString())}
                  </div>
                </div>
                {a.state === 'running' ? <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-krypt-purple" /> : a.state === 'error' ? <CircleAlert className="h-3.5 w-3.5 shrink-0 text-rose-300" /> : null}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

// ── Autopilot + needs-you ───────────────────────────────────────────────────

function AutopilotCard() {
  const ap = useApp((s) => s.autopilot);
  const go = useApp((s) => s.go);
  const toast = useApp((s) => s.toast);
  const ai = ap?.ais.find((x) => x.id === ap.ai)?.name ?? 'Claude Code';
  const on = !!ap?.on;
  return (
    <GlassPanel preset="card" tint={on ? GLASS_TINTS.brand : GLASS_TINTS.card} style={on ? { boxShadow: GLASS_RINGS.brand } : undefined} className="relative overflow-hidden rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">
        <Bot className="h-4 w-4 text-krypt-purple" /> Autopilot
        {ap?.running && <span className="ml-auto rounded-full bg-krypt-purple/30 px-2 py-0.5 text-[10px] text-white">running now</span>}
      </div>
      {!ap ? (
        <div className="mt-3 text-sm text-krypt-muted">Checking…</div>
      ) : on ? (
        <>
          <div className="mt-3 text-3xl font-bold tracking-tight">{ap.running ? 'Working' : runCountdown(ap.task.nextRun)}</div>
          <div className="mt-1 text-sm text-white/80">
            {ap.running ? `${ai} is running the accounts right now. It works in the background: no windows open.` : `Next run ${runWhen(ap.task.nextRun)} with ${ai}`}
          </div>
          <div className="mt-1 font-mono text-[11px] text-krypt-muted">{ap.times.join(' · ')} daily</div>
        </>
      ) : (
        <>
          <div className="mt-3 text-3xl font-bold tracking-tight text-white/70">Off</div>
          <div className="mt-1 text-sm text-krypt-muted">Turn it on and your AI runs every account a few times a day by itself.</div>
        </>
      )}
      <div className="mt-4 flex gap-2">
        {on ? (
          <GhostButton
            small
            disabled={ap?.running}
            onClick={() =>
              void window.marketo.autopilot.runNow().then((r) => {
                if (r.ok) toast('ok', 'Autopilot started a run.');
                else toast('error', r.message ?? 'Could not start a run.');
                void refreshAutopilot();
              })
            }
          >
            <Play className="h-3.5 w-3.5" /> Run now
          </GhostButton>
        ) : null}
        <GhostButton small onClick={() => go('autopilot')}>
          {on ? 'Reports' : 'Set it up'}
        </GhostButton>
      </div>
    </GlassPanel>
  );
}

interface Need {
  key: string;
  text: string;
  tone: 'warn' | 'bad';
  act?: () => void;
  site?: Site;
}

function NeedsYou({ needs }: { needs: Need[] }) {
  return (
    <GlassPanel preset="card" tint={needs.length ? GLASS_TINTS.warn : GLASS_TINTS.good} style={{ boxShadow: needs.length ? GLASS_RINGS.warn : GLASS_RINGS.good }} className="rounded-2xl p-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">
        <ShieldCheck className={cls('h-4 w-4', needs.length ? 'text-amber-300' : 'text-emerald-300')} /> Needs you
        <span className={cls('ml-auto rounded-full px-2 py-0.5 font-mono text-[11px] font-bold', needs.length ? 'bg-amber-400 text-amber-950' : 'bg-emerald-400/20 text-emerald-200')}>{needs.length}</span>
      </div>
      {needs.length === 0 ? (
        <div className="mt-3">
          <div className="text-3xl font-bold tracking-tight">All clear</div>
          <div className="mt-1 text-sm text-krypt-muted">Nothing is waiting on you. The AI has what it needs.</div>
        </div>
      ) : (
        <div className="mt-3 max-h-[132px] space-y-1.5 overflow-auto pr-1">
          {needs.map((n) => {
            const Icon = n.site ? SITE_ICON[n.site] : CircleAlert;
            return (
              <button key={n.key} onClick={n.act} disabled={!n.act} className={cls('flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition', n.act && 'hover:bg-white/5', n.tone === 'bad' ? 'text-rose-200' : 'text-amber-100')}>
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0">{n.text}</span>
              </button>
            );
          })}
        </div>
      )}
    </GlassPanel>
  );
}

const greeting = (): string => {
  const h = new Date().getHours();
  return h < 5 ? 'Up late' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function Dashboard() {
  const db = useApp((s) => s.db)!;
  const browser = useApp((s) => s.browser);
  const approvals = useApp((s) => s.approvals);
  const ap = useApp((s) => s.autopilot);
  const go = useApp((s) => s.go);
  const handle = db.settings.handle;
  const account = db.igAccounts.find((a) => sameHandle(a.handle, handle)) ?? db.igAccounts[0];
  const st = account ? browser.find((b) => b.accountId === account.id) : undefined;
  const sites = account ? accountSites(account, st, db) : [];
  const posted = db.reels.filter((r) => r.status === 'posted');
  const postsDone = sites.reduce((n, s) => n + s.posts.done, 0);
  const postsTarget = sites.reduce((n, s) => n + s.posts.target, 0);
  const signedIn = sites.filter((s) => s.tone === 'ok').length;

  // Followers on every platform (latest snapshot each).
  const followers = sites
    .map((s) => {
      const snaps = db.accounts.filter((x) => (x.site ?? 'instagram') === s.site && account && sameHandle(x.handle, account.handle)).sort((x, y) => x.at.localeCompare(y.at));
      return { site: s.site, n: snaps[snaps.length - 1]?.followers };
    })
    .filter((f): f is { site: Site; n: number } => typeof f.n === 'number');
  const totalFollowers = followers.reduce((n, f) => n + f.n, 0);
  const igSnaps = db.accounts.filter((a) => a.handle === handle && (a.site ?? 'instagram') === 'instagram');

  const needs: Need[] = [];
  const waiting = approvals.filter((a) => a.state === 'pending').length;
  if (waiting) needs.push({ key: 'approvals', tone: 'warn', text: `${waiting} action${waiting === 1 ? '' : 's'} waiting for your Approve (top of the window)` });
  for (const s of sites) if (s.tone !== 'ok' && account) needs.push({ key: `site-${s.site}`, tone: s.tone === 'bad' ? 'bad' : 'warn', text: s.detail, site: s.site, act: () => void openSite(account.id, s.site) });
  const report = ap?.reports.find((r) => r.ended);
  for (const [i, w] of (report?.warnings ?? []).slice(0, 2).entries()) needs.push({ key: `w${i}`, tone: 'bad', text: w, act: () => go('autopilot') });
  for (const [i, n] of (report?.needs ?? []).slice(0, 4).entries()) needs.push({ key: `n${i}`, tone: 'warn', text: n.replace(/^NEEDS YOU:?\s*/i, ''), act: () => go('autopilot') });
  if (ap && !ap.on) needs.push({ key: 'ap', tone: 'warn', text: 'Autopilot is off: the accounts only move while an AI is connected.', act: () => go('autopilot') });

  return (
    <div className="h-full overflow-auto px-8 pb-10 pt-7">
      {/* Hero */}
      <GlassPanel preset="hero" tint={GLASS_TINTS.hero} className="relative mb-6 overflow-hidden rounded-3xl p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-krypt-pink/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 h-64 w-64 rounded-full bg-krypt-indigo/25 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.25em] text-white/60">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {handle}
            </div>
            <h1 className="mt-2 text-4xl font-bold tracking-tight">{greeting()}.</h1>
            <p className="mt-2 max-w-xl text-sm text-white/75">
              {postsTarget ? (
                <>
                  <span className="font-semibold text-white">
                    {postsDone} of {postsTarget}
                  </span>{' '}
                  posts done today across {sites.length} platform{sites.length === 1 ? '' : 's'} · {signedIn} of {sites.length} signed in
                </>
              ) : (
                'Add an account and pick its platforms to start.'
              )}
            </p>
          </div>
          <div className="flex items-end gap-8">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">Followers</div>
              <div className="text-4xl font-bold tabular-nums text-white">{fmtNum(totalFollowers)}</div>
              <div className="mt-1 flex gap-2">
                {followers.map((f) => {
                  const Icon = SITE_ICON[f.site];
                  return (
                    <span key={f.site} className="inline-flex items-center gap-1 font-mono text-[11px] text-white/70" title={SITE_LABEL[f.site]}>
                      <Icon className="h-3 w-3" style={{ color: SITE_COLOR[f.site] }} /> {fmtNum(f.n)}
                    </span>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/60">Reels</div>
              <div className="text-4xl font-bold tabular-nums text-white">{posted.length}</div>
              <div className="mt-1 font-mono text-[11px] text-white/70">posted · {db.reels.length - posted.length} in the works</div>
            </div>
            <GlassButton variant="primary" onClick={() => go('studio')} className="px-4 py-2.5 font-semibold">
              <Sparkles className="h-4 w-4" /> New reel
            </GlassButton>
          </div>
        </div>
      </GlassPanel>

      {/* Autopilot · needs you */}
      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <AutopilotCard />
        <NeedsYou needs={needs} />
      </div>

      {/* Platforms + live feed */}
      <div className="mb-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Section title="Today on every platform" description="Posts against today's target, and warm-up actions against the phase's limits. Click a platform to open it." className="mb-0">
          {sites.length ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
              {sites.map((s) => (
                <PlatformTile key={s.site} s={s} accountId={account!.id} />
              ))}
            </div>
          ) : (
            <Empty icon={<Activity className="h-6 w-6" />} title="No platforms yet">
              Add an account on Grow › Accounts.
            </Empty>
          )}
        </Section>
        <div className="min-h-[360px]">
          <LiveFeed />
        </div>
      </div>

      {/* Reels */}
      <Section title="Latest reels" actions={<GhostButton small onClick={() => go('library')}>Library</GhostButton>}>
        {db.reels.length === 0 ? (
          <Empty icon={<Clapperboard className="h-6 w-6" />} title="No reels yet">
            Open Studio and pick a style, or ask your AI to make one.
          </Empty>
        ) : (
          <div className="grid grid-cols-3 gap-4 md:grid-cols-4 xl:grid-cols-6">
            {db.reels.slice(0, 6).map((r) => (
              <button key={r.id} onClick={() => go('studio', r.id)} className="group text-left">
                <ReelThumb reel={r} className="rounded-xl border border-white/10 transition group-hover:-translate-y-0.5 group-hover:border-krypt-purple/50" />
                <div className="mt-2 truncate text-sm font-medium">{r.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusChip status={r.status} />
                  <span className="text-[11px] text-krypt-muted">{timeAgo(r.updatedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* Trends */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Instagram followers · {handle}</div>
          {igSnaps.length >= 2 ? <FollowersChart snaps={igSnaps} /> : <Empty icon={<LineChart className="h-6 w-6" />} title="Not enough snapshots yet">Each record_account_stats call adds a point. Two make a line.</Empty>}
        </Card>
        <Card>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Minutes on the accounts · last 14 days</div>
          <ActivityBars sessions={db.sessions} />
        </Card>
      </div>
    </div>
  );
}
