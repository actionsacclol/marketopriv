import { useEffect, useState, type ReactNode } from 'react';
import { Chrome, ExternalLink, Globe, Layers, Play, RotateCw, Settings2 } from 'lucide-react';
import { BRIGHT_DATA_URL, PROXY_CHEAP_NOTE, PROXY_CHEAP_URL, PROXY_GUIDE_THUMB, PROXY_GUIDE_URL } from '@shared/brand';
import { Card, GhostButton, Page, PrimaryButton, Toggle } from '../components/ui';
import { MultiRunBoard } from '../components/Profiles';
import { ChromeProxies } from '../components/ChromeProxies';
import { ProxyManager } from '../components/ProxyManager';
import { ChromeManager } from '../components/ChromeManager';
import { setPerf, usePerf } from '../lib/perf';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

const open = (url: string): void => void window.marketo.app.openExternal(url);

type Tab = 'profiles' | 'proxies' | 'chrome' | 'settings';
const TABS: Array<{ id: Tab; label: string; icon: typeof Layers }> = [
  { id: 'profiles', label: 'Profiles', icon: Layers },
  { id: 'proxies', label: 'Proxies', icon: Globe },
  { id: 'chrome', label: 'Chrome profiles', icon: Chrome },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];
const KEY = 'mk.multirun.tab';
const saved = (): Tab => {
  try {
    const t = localStorage.getItem(KEY) as Tab | null;
    return t && TABS.some((x) => x.id === t) ? t : 'profiles';
  } catch {
    return 'profiles';
  }
};

/** Where to buy static residential IPs, and the setup guide. */
function ProxyGuide() {
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-5">
        <button
          onClick={() => open(PROXY_GUIDE_URL)}
          title="Opens on YouTube in your browser"
          className="group relative flex aspect-video w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40"
        >
          {/* No internet: the picture hides and the play button stays. */}
          <img src={PROXY_GUIDE_THUMB} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
          <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 transition group-hover:bg-krypt-purple">
            <Play className="h-4 w-4 translate-x-px fill-current" />
          </span>
        </button>
        <div className="min-w-[260px] flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Proxies</p>
          <p className="mt-1 text-sm text-white/90">
            After about three sets of accounts, give each profile its own static residential (ISP) IP. On Proxy-Cheap, pick Static Residential (ISP), Dedicated; on Bright Data, pick ISP proxies. One IP per profile, then paste the whole list above.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <PrimaryButton onClick={() => open(PROXY_CHEAP_URL)}>
              <ExternalLink className="h-4 w-4" /> Proxy-Cheap
            </PrimaryButton>
            <GhostButton onClick={() => open(BRIGHT_DATA_URL)}>
              <ExternalLink className="h-4 w-4" /> Bright Data
            </GhostButton>
            <button onClick={() => open(PROXY_GUIDE_URL)} className="text-sm font-semibold text-krypt-purple hover:underline">
              Watch the setup guide
            </button>
          </div>
          <p className="mt-2 text-[11px] text-krypt-muted">Proxy-Cheap and Bright Data are referral links: {PROXY_CHEAP_NOTE}.</p>
        </div>
      </div>
    </Card>
  );
}

const Row = ({ title, text, children }: { title: string; text: string; children: ReactNode }) => (
  <div className="flex items-start gap-4 px-4 py-3.5">
    <div className="min-w-0 flex-1">
      <div className="text-sm font-medium text-white">{title}</div>
      <p className="mt-0.5 text-xs leading-relaxed text-krypt-muted">{text}</p>
    </div>
    <div className="flex shrink-0 items-center gap-2 pt-0.5">{children}</div>
  </div>
);

/** How the profiles run: all at once in their own windows, and a proxy per Chrome profile. */
function MultiSettings() {
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const perf = usePerf();
  const [multi, setMulti] = useState<{ saved: boolean; running: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void window.marketo.app.profilesMulti().then(setMulti);
  }, []);
  const flipMulti = async (on: boolean): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.app.setProfilesMulti(on);
    setBusy(false);
    if (r.data) useApp.setState({ profiles: r.data });
    if (!r.ok) return toast('error', r.message ?? 'Could not save that.');
    setMulti((m) => (m ? { ...m, saved: on } : m));
  };
  return (
    <div className="space-y-4">
      <Card padded={false} className="divide-y divide-white/5">
        <Row
          title="Each profile in its own window"
          text="On by default: opening a profile pops up its own Marketo window next to this one, each with its own AI connection and proxy. With Claude Code the autopilot runs them all at the same time (that uses your AI plan that many times faster); other AI apps go through them one after the other. Off: one window, and opening a profile replaces the one you are in. Takes effect after a restart."
        >
          {multi && multi.saved !== multi.running && (
            <GhostButton small onClick={() => void window.marketo.app.restart()}>
              <RotateCw className="h-3.5 w-3.5" /> Restart to turn {multi.saved ? 'on' : 'off'}
            </GhostButton>
          )}
          {multi && <Toggle on={multi.saved} onChange={(v) => !busy && void flipMulti(v)} />}
        </Row>
        <Row
          title="A proxy for each Chrome profile"
          text="One Marketo profile can then hold many accounts on many IPs: each Chrome profile its accounts run in gets its own proxy and sticky IP (set them on the Proxies tab). Off: a profile has one proxy for all its accounts."
        >
          <Toggle on={perf.proxyPerChrome} onChange={(v) => void setPerf({ proxyPerChrome: v }).catch((e) => toast('error', (e as Error).message || 'Could not save that.'))} />
        </Row>
        <Row title="Memory, AI runs at once, staggered starts" text="How many AI runs go at the same time, a random wait before each profile's run, background profiles started only when needed, and the rest of the heavy-load options.">
          <GhostButton small onClick={() => go('setup')}>
            Setup &gt; Performance
          </GhostButton>
        </Row>
      </Card>
      <p className="text-[11px] leading-relaxed text-krypt-muted">
        A profile is a complete, separate set: its own accounts and socials, brand, reels, post log, Training and settings. Shared by every profile: your AI connections, the Chrome extension, your ElevenLabs key and the autopilot schedule. Accounts in
        Chrome take the proxy for their whole Chrome profile, so give each profile its own Chrome profile.
      </p>
    </div>
  );
}

// Multi run: for running many accounts. Profiles (separate sets of accounts, one line each), the proxy manager
// (bulk import, checks, handing proxies to profiles), Chrome's own profiles (make new ones, a Marketo profile for
// each) and how they all run.
export default function MultiRun() {
  const perChrome = usePerf().proxyPerChrome;
  const [tab, setTabState] = useState<Tab>(saved);
  const setTab = (t: Tab): void => {
    setTabState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode: the tab is just not remembered */
    }
  };
  return (
    <Page title="Multi run" subtitle="Separate sets of accounts, each with its own proxy, run one at a time or all at once.">
      <div className="mb-5 inline-flex flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cls('flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition', tab === t.id ? 'bg-krypt-purple text-white shadow' : 'text-white/65 hover:bg-white/[0.06] hover:text-white')}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>
      {tab === 'profiles' && <MultiRunBoard onProxies={() => setTab('proxies')} onChrome={() => setTab('chrome')} />}
      {tab === 'proxies' && (
        <div className="space-y-5">
          <ProxyManager perChrome={perChrome} />
          {perChrome && <ChromeProxies />}
          <ProxyGuide />
        </div>
      )}
      {tab === 'chrome' && <ChromeManager onMade={() => setTab('profiles')} />}
      {tab === 'settings' && <MultiSettings />}
    </Page>
  );
}
