import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, Bot, Boxes, Check, Smile, Clapperboard, Gauge, Globe, GraduationCap, Palette, Settings, ShieldCheck, TrendingUp, Volume2, VolumeX, X } from 'lucide-react';
import type { Approval, IgAccount, PageId, UpdateInfo } from '@shared/types';
import { cls } from './lib/format';
import { initStore, useApp } from './state/store';
import { runAgentTool } from './render/agentTools';
import { Toasts } from './components/ui';
import { ProfileSelect } from './components/Profiles';
import { GlassBackdrop } from './components/glass/GlassBackdrop';
import { GlassPanel } from './components/glass/GlassPanel';
import { GlassLens } from './components/glass/GlassSegmented';
import { GLASS_TINTS } from './components/glass/glassPresets';
import { useGlideLens } from './components/glass/useGlideLens';
import { kickGlassWatchdog, startGlassWatchdog } from './components/glass/glassQuality';
import Dashboard from './pages/Dashboard';
import Studio from './pages/Studio';
import NextRun from './pages/NextRun';
import Usage from './pages/Usage';
import Examples from './pages/Examples';
import Styles from './pages/Styles';
import Library from './pages/Library';
import Results from './pages/Results';
import Training from './pages/Training';
import { isPosted } from '@shared/training';
import Research from './pages/Research';
import Agents from './pages/Agents';
import Autopilot from './pages/Autopilot';
import Warming from './pages/Warming';
import Accounts from './pages/Accounts';
import Setup from './pages/Setup';
import Chat from './pages/Chat';
import KryptTools from './pages/KryptTools';
import Kip from './pages/Kip';
import Voices from './pages/Voices';
import Wizard from './pages/Wizard';

/** Sound on / off for all of Marketo: the hub, its browser windows and the Chrome tabs it drives. */
function MuteButton() {
  const muted = useApp((s) => !!s.db?.settings.mute);
  const auto = useApp((s) => !!s.db?.settings.autoMute);
  return (
    <button
      onClick={() => void window.marketo.db.updateSettings({ mute: !muted })}
      title={muted ? 'Sound is off in Marketo. Click to turn it on.' : `Mute Marketo${auto ? ' (auto mute is on: it is quiet whenever Marketo is in the background)' : ''}`}
      aria-label={muted ? 'Unmute Marketo' : 'Mute Marketo'}
      className={cls('glass-chip flex items-center justify-center rounded-lg px-2.5 py-1.5', muted ? 'border-amber-400/40 bg-amber-500/10 text-amber-200' : 'text-krypt-muted hover:border-krypt-purple/40 hover:text-white')}
    >
      {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
    </button>
  );
}

const NO_ACCOUNTS: IgAccount[] = [];

type GroupId = 'home' | 'styles' | 'create' | 'grow' | 'train' | 'ai' | 'krypt' | 'kip';

interface NavGroup {
  id: GroupId;
  label: string;
  icon: typeof BarChart3;
  pages: Array<{ id: PageId; label: string }>;
  /** The page the group opens on the first time (default: the first one listed). */
  first?: PageId;
}

/** Five places instead of thirteen pages: the open group lists its pages underneath. Setup is the gear at the bottom. */
const GROUPS: NavGroup[] = [
  { id: 'home', label: 'Home', icon: Gauge, pages: [{ id: 'dashboard', label: 'Home' }] },
  { id: 'styles', label: 'Styles', icon: Palette, pages: [{ id: 'styles', label: 'Styles' }] },
  { id: 'create', label: 'Create', icon: Clapperboard, first: 'studio', pages: [{ id: 'next-run', label: 'Next run' }, { id: 'studio', label: 'Studio' }, { id: 'examples', label: 'Examples' }, { id: 'library', label: 'Library' }, { id: 'voices', label: 'Voices' }] },
  { id: 'grow', label: 'Grow', icon: TrendingUp, pages: [{ id: 'accounts', label: 'Accounts' }, { id: 'warming', label: 'Warm-up' }, { id: 'results', label: 'Results' }, { id: 'research', label: 'Research' }] },
  { id: 'train', label: 'Training', icon: GraduationCap, pages: [{ id: 'train-rank', label: 'Rank' }, { id: 'train-hooks', label: 'Hooks' }, { id: 'train-topics', label: 'Topics' }, { id: 'train-notes', label: 'Notes' }] },
  { id: 'ai', label: 'AI', icon: Bot, pages: [{ id: 'autopilot', label: 'Autopilot' }, { id: 'agents', label: 'Connect' }, { id: 'chat', label: 'Chat' }, { id: 'usage', label: 'Usage' }] },
  { id: 'krypt', label: 'Krypt tools', icon: Boxes, pages: [{ id: 'krypt', label: 'Krypt tools' }] },
  { id: 'kip', label: 'Kip', icon: Smile, pages: [{ id: 'kip', label: 'Kip' }] },
];
const groupOf = (p: PageId): GroupId | null => GROUPS.find((g) => g.pages.some((x) => x.id === p))?.id ?? null;
/** The page each group last showed, so going back to a group lands where you were. */
const lastIn: Partial<Record<GroupId, PageId>> = {};

function Sidebar() {
  const page = useApp((s) => s.page);
  const go = useApp((s) => s.go);
  const mcp = useApp((s) => s.mcp);
  const job = useApp((s) => s.job);
  const chatBusy = useApp((s) => !!s.chat?.busy);
  const kipBusy = useApp((s) => !!s.kip?.busy);
  const noteWaiting = useApp((s) => !!s.db?.nextRun?.note);
  const pending = useApp((s) => s.approvals.filter((a) => a.state === 'pending').length);
  const ap = useApp((s) => s.autopilot);
  const handle = useApp((s) => s.db?.settings.handle);
  // Posted reels the user has not rated yet (Training > Rank).
  const unrated = useApp((s) => s.db?.reels.filter((r) => isPosted(r) && typeof r.feedback?.rating !== 'number').length ?? 0);
  const accounts = useApp((s) => s.db?.igAccounts) ?? NO_ACCOUNTS;
  const connected = (mcp?.clients.length ?? 0) > 0;
  const live = mcp?.enabled && mcp.listening;
  const current = groupOf(page);
  if (current) lastIn[current] = page;
  const badge = (g: GroupId): ReactNode => {
    if (g === 'home' && pending > 0) return <span className="ml-auto rounded-full bg-amber-400 px-1.5 font-mono text-[10px] font-bold text-amber-950">{pending}</span>;
    if (g === 'train' && unrated > 0) return <span className="ml-auto rounded-full border border-krypt-purple/40 px-1.5 font-mono text-[10px] text-purple-200" title={`${unrated} posted reel${unrated === 1 ? '' : 's'} to rate`}>{unrated}</span>;
    if (g === 'create' && job) return <span className="ml-auto font-mono text-[10px] text-krypt-purple">{Math.round(job.ratio * 100)}%</span>;
    if (g === 'ai' && (chatBusy || ap?.running)) return <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-krypt-purple" />;
    if (g === 'kip' && kipBusy) return <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-krypt-purple" />;
    if (g === 'ai' && ap?.on) return <span className="ml-auto rounded-full border border-emerald-400/30 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">auto</span>;
    return null;
  };
  // The open group's pill: ONE glass lens that glides between the group
  // buttons (motion values, no React render per frame). It sits inside the
  // nav's scroll content, so it scrolls with the item it marks.
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  useGlideLens(navRef, pillRef, current, 'y');
  // The panel is live glass, and a backdrop-filter makes its element the
  // containing block for `fixed` descendants: never render an overlay in here.
  return (
    <GlassPanel preset="chrome" tint={GLASS_TINTS.chrome} className="relative z-10 h-full w-[220px] shrink-0 border-r border-white/[0.06]">
    <aside className="flex h-full w-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <img src="./krypt.png" alt="" className="h-9 w-9 rounded-md drop-shadow-[0_0_6px_rgba(168,85,247,0.55)]" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
        <div>
          <div className="text-lg font-bold leading-none text-krypt-gradient">Krypt</div>
          <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-krypt-muted">Marketo</div>
        </div>
      </div>
      <nav ref={navRef} className="relative flex min-h-0 flex-col gap-1 overflow-auto px-3">
        {GROUPS.map((g) => {
          const Icon = g.icon;
          const open = current === g.id;
          return (
            <div key={g.id}>
              <button
                data-glass-key={g.id}
                onClick={() => go(lastIn[g.id] ?? g.first ?? g.pages[0].id)}
                className={cls(
                  'group relative z-[1] flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-sm font-semibold transition',
                  open ? 'text-white' : 'text-krypt-muted hover:bg-white/[0.045] hover:text-white',
                )}
              >
                <Icon className={cls('h-4 w-4 transition-colors', open && 'text-krypt-purple drop-shadow-[0_0_6px_rgba(168,85,247,0.7)]')} />
                {g.label}
                {badge(g.id)}
                {open && <span className="absolute bottom-2 left-0 top-2 w-0.5 rounded-r-full bg-krypt-gradient" />}
              </button>
              {open && g.pages.length > 1 && (
                <div className="mb-1 ml-[22px] mt-1 space-y-0.5 border-l border-white/10 pl-3">
                  {g.pages.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => go(p.id)}
                      className={cls('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition', page === p.id ? 'bg-krypt-purple/15 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(168,85,247,0.22),inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-krypt-muted hover:bg-white/5 hover:text-white')}
                    >
                      {p.label}
                      {p.id === 'chat' && chatBusy && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-krypt-purple" />}
                      {p.id === 'next-run' && noteWaiting && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-krypt-purple" title="A note is waiting for the next run" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <GlassLens lensRef={pillRef} radius={12} />
      </nav>
      <div className="mt-auto space-y-3 px-4 pb-5 pt-3">
        <button onClick={() => go('agents')} className="glass-chip flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs">
          <span className={cls('h-2 w-2 shrink-0 rounded-full', connected ? 'animate-pulse-slow bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : live ? 'bg-krypt-purple' : 'bg-white/25')} />
          <span className="min-w-0 flex-1 truncate text-white/80">{connected ? mcp!.clients.map((c) => c.name).join(', ') : live ? 'Ready for an AI' : 'AI access off'}</span>
        </button>
        <ProfileSelect />
        {accounts.length > 1 ? (
          <select value={handle} onChange={(e) => void window.marketo.db.updateSettings({ handle: e.target.value })} className="input py-1.5 font-mono text-xs" title="Active account">
            {accounts.map((a) => (
              <option key={a.id} value={a.handle} className="bg-krypt-panel">
                {a.handle}
              </option>
            ))}
          </select>
        ) : (
          handle && <div className="truncate px-1 font-mono text-[11px] text-krypt-muted">{handle}</div>
        )}
        <div className="flex gap-2">
          <button onClick={() => window.marketo.app.openExternal('https://krypt.cc/tools')} className="glass-chip group flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-krypt-muted hover:border-krypt-purple/40 hover:bg-krypt-purple/10 hover:text-white">
            <Globe className="h-3.5 w-3.5 group-hover:text-krypt-purple" /> krypt.cc
          </button>
          <MuteButton />
          <button
            onClick={() => go('setup')}
            title="Setup"
            className={cls('glass-chip flex items-center justify-center rounded-lg px-2.5 py-1.5', page === 'setup' ? 'border-krypt-purple/50 bg-krypt-purple/15 text-white' : 'text-krypt-muted hover:border-krypt-purple/40 hover:text-white')}
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </div>
        <VersionLine />
      </div>
    </aside>
    </GlassPanel>
  );
}

/** This install's version. When krypt.cc lists a newer one it becomes a link to the download page (the hub never updates itself). */
function VersionLine() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    let off = false;
    const read = (): void => {
      void window.marketo.app
        .update()
        .then((u) => {
          if (!off) setInfo(u);
        })
        .catch(() => {});
    };
    read();
    // The first check runs a few seconds after the hub opens.
    const soon = setTimeout(read, 30_000);
    const timer = setInterval(read, 3_600_000);
    return () => {
      off = true;
      clearTimeout(soon);
      clearInterval(timer);
    };
  }, []);
  if (!info) return null;
  if (!info.latest || !info.url)
    return (
      <div className="px-1 font-mono text-[10px] text-krypt-muted/70" title="Krypt Marketo version">
        v{info.current}
      </div>
    );
  const url = info.url;
  return (
    <button
      onClick={() => void window.marketo.app.openExternal(url)}
      title={info.notes ? `${info.notes} (opens krypt.cc; the hub does not update itself)` : 'Opens the download page on krypt.cc. The hub does not update itself.'}
      className="glass-chip flex w-full items-center justify-between gap-2 rounded-lg border-krypt-purple/50 bg-krypt-purple/15 px-2.5 py-1.5 text-left text-[11px] font-semibold text-white hover:border-krypt-purple"
    >
      <span>Version {info.latest} is out</span>
      <span className="font-mono text-[10px] font-normal text-krypt-muted">you have {info.current}</span>
    </button>
  );
}

const KIND_LABEL: Record<Approval['kind'], string> = { comment: 'Comment', post: 'Publish', message: 'Message', profile: 'Account settings', unfollow: 'Unfollow', other: 'Action' };

/** What an AI is waiting to do on Instagram. Stays on top of every page until answered. */
function ApprovalBar() {
  const pending = useApp((s) => s.approvals).filter((a) => a.state === 'pending');
  if (!pending.length) return null;
  return (
    <div className="relative z-20 space-y-2 border-b border-amber-400/30 bg-amber-950/60 px-8 py-3 backdrop-blur-md">
      {pending.map((a) => (
        <div key={a.id} className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-50">
              {KIND_LABEL[a.kind]} on {a.handle}: {a.action}
            </div>
            {a.text && <div className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg border border-amber-400/20 bg-black/30 px-3 py-2 text-sm text-white">{a.text}</div>}
            <div className="mt-1 truncate font-mono text-[11px] text-amber-200/60">
              {a.client} · {a.url}
            </div>
          </div>
          <button onClick={() => void window.marketo.approvals.answer(a.id, true)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-emerald-950 hover:brightness-110">
            <Check className="h-4 w-4" /> Approve
          </button>
          <button onClick={() => void window.marketo.approvals.answer(a.id, false)} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20">
            <X className="h-4 w-4" /> Reject
          </button>
        </div>
      ))}
    </div>
  );
}

/** A page that throws must not blank the whole hub (the approval bar and navigation stay usable). */
class PageBoundary extends Component<{ page: PageId; children: ReactNode }, { error: string | null; page: PageId }> {
  state = { error: null as string | null, page: this.props.page };
  static getDerivedStateFromError(e: Error): { error: string } {
    return { error: e?.message || String(e) };
  }
  static getDerivedStateFromProps(props: { page: PageId }, state: { error: string | null; page: PageId }): { error: string | null; page: PageId } | null {
    // Going to another page clears the error.
    return props.page !== state.page ? { error: null, page: props.page } : null;
  }
  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="p-8">
        <div className="max-w-xl rounded-2xl border border-rose-400/30 bg-rose-950/40 p-5 text-sm text-rose-100">
          <div className="font-semibold">This page hit an error.</div>
          <div className="mt-1 break-words font-mono text-xs text-rose-200/80">{this.state.error}</div>
          <button onClick={() => this.setState({ error: null })} className="mt-3 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10">
            Try again
          </button>
        </div>
      </div>
    );
  }
}

export default function App() {
  const page = useApp((s) => s.page);
  const ready = useApp((s) => !!s.db);
  // The setup wizard: on its own until the brand is set up, and whenever the user reopens it.
  const wizard = useApp((s) => !!s.db && (s.wizard || !s.db.brand.setupDone));
  useEffect(() => initStore(), []);
  // Errors are turned into text here: a thrown Error loses its message on its
  // way through the preload bridge and would reach the AI as "[object Object]".
  useEffect(() => window.marketo.mcp.serve((call, progress) => runAgentTool(call, progress).catch((e: unknown) => ({ ok: false, text: e instanceof Error ? e.message : String(e) }))), []);
  // The Auto glass watchdog: drops live glass to frost on a machine that
  // can't hold its frame rate with it (glass/glassQuality.ts), re-checked
  // shortly after each page change.
  useEffect(() => startGlassWatchdog(), []);
  useEffect(() => kickGlassWatchdog(), [page]);
  if (wizard)
    return (
      <div className="flex h-full">
        {/* Fixed z-0 and FIRST, so the positioned shell paints over it. */}
        <GlassBackdrop />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <ApprovalBar />
          {/* A new profile opens on the wizard: keep the way back to the others in reach. */}
          <ProfileSelect className="absolute bottom-4 left-4 z-20 w-[220px]" />
          <div className="min-h-0 flex-1">
            <Wizard />
          </div>
        </main>
        <Toasts />
      </div>
    );
  return (
    <div className="flex h-full">
      {/* Fixed z-0 and FIRST, so the positioned shell paints over it. Held
          still in Studio, where the reel preview canvas plays. */}
      <GlassBackdrop still={page === 'studio'} />
      <Sidebar />
      <main className="relative flex min-w-0 flex-1 flex-col">
        <ApprovalBar />
        <div className="min-h-0 flex-1">
          <PageBoundary page={page}>
          {!ready ? null : page === 'dashboard' ? <Dashboard /> : page === 'warming' ? <Warming /> : page === 'accounts' ? <Accounts /> : page === 'next-run' ? <NextRun /> : page === 'kip' ? <Kip /> : page === 'studio' ? <Studio /> : page === 'examples' ? <Examples /> : page === 'styles' ? <Styles /> : page === 'library' ? <Library /> : page === 'results' ? <Results /> : page === 'train-rank' ? <Training tab="rank" /> : page === 'train-hooks' ? <Training tab="hooks" /> : page === 'train-topics' ? <Training tab="topics" /> : page === 'train-notes' ? <Training tab="notes" /> : page === 'research' ? <Research /> : page === 'voices' ? <Voices /> : page === 'krypt' ? <KryptTools /> : page === 'chat' ? <Chat /> : page === 'setup' ? <Setup /> : page === 'autopilot' ? <Autopilot /> : page === 'usage' ? <Usage /> : <Agents />}
          </PageBoundary>
        </div>
      </main>
      <Toasts />
    </div>
  );
}
