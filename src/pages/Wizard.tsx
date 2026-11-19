import { useEffect, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, AtSign, Boxes, Briefcase, Check, Chrome, CircleAlert, CircleCheck, Copy, ExternalLink, Facebook, ImageIcon, Instagram, MessageCircle, Monitor, Music2, Pin, Play, Scissors, X, Youtube } from 'lucide-react';
import type { Brand, ClientInfo, ClipSettings, IgAccount, NetProfile, Network, Site } from '@shared/types';
import { DEFAULT_TARGETS, SITES, SITE_LABEL, YT_UPLOADS_PER_DAY, localDate, sameHandle, sitesOf } from '@shared/warmup';
import { CREATOR_PITCH, EMPTY_BRAND, GUIDE_VIDEO_THUMB, GUIDE_VIDEO_URL, creatorProblem } from '@shared/brand';
import { brandFor, modeOf, savePromoting } from '../lib/promoteMode';
import { ClipSourcesEditor, EMPTY_CLIPPING } from '../components/ClipSourcesEditor';
import { ELEVEN_AFFILIATE_NOTE, ELEVEN_SIGNUP_URL } from '@shared/voice';
import { CreatorCard } from '../components/CreatorCard';
import { ElevenCard } from '../components/ElevenCard';
import { ModelPicker, TierPicker } from '../components/AiUsage';
import { USAGE_TIERS, type UsageTier } from '@shared/aiUsage';
import { ExtensionSetup, chromeLabel, extensionCheck } from '../components/ExtensionSetup';
import { Card, GhostButton, PrimaryButton, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';
import { FIELDS } from './Setup';
import { ClientRow } from './Agents';

// First-run setup: what you promote, which platforms, where the accounts are
// signed in, signing in, connecting an AI, and the daily rules. Every step
// after the brand can be skipped and finished later on the normal pages.

/** What the install is for: Krypt's tools, the user's own brand, or a clip channel (clipping style only). */
type Mode = 'krypt' | 'own' | 'clips';
type StepId = 'start' | 'brand' | 'platforms' | 'where' | 'signin' | 'ai' | 'voice' | 'rules';
const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'start', label: 'Start' },
  { id: 'brand', label: 'Brand' },
  { id: 'platforms', label: 'Platforms' },
  { id: 'where', label: 'Accounts' },
  { id: 'signin', label: 'Sign in' },
  { id: 'ai', label: 'Your AI' },
  { id: 'voice', label: 'Voice' },
  { id: 'rules', label: 'Daily rules' },
];

const SITE_ICON: Record<Site, typeof AtSign> = { instagram: Instagram, tiktok: Music2, youtube: Youtube, x: AtSign, facebook: Facebook, threads: MessageCircle, pinterest: Pin };
const SITE_ABOUT: Record<Site, string> = {
  instagram: 'Reels, comments and DMs, with a slow warm-up for new accounts.',
  tiktok: 'Videos from the same reels. Mostly watching the feed at first so TikTok learns your niche.',
  youtube: `The same vertical videos as Shorts, uploaded through YouTube Studio (${YT_UPLOADS_PER_DAY} a day recommended).`,
  x: 'Square video posts, replies in your niche and DMs. Strict limits on likes and follows.',
  facebook: 'The same reels as Facebook Reels on your Page, plus comments and Page messages.',
  threads: 'Video and text threads, and replies in your niche. Signs in with Instagram.',
  pinterest: 'Video Pins with your link that keep getting found in search for months. Best for products, how-tos and visual niches.',
};
/** Where people sign in. */
const SIGNIN_URL: Record<Site, string> = { instagram: 'instagram.com', tiktok: 'tiktok.com', youtube: 'studio.youtube.com', x: 'x.com', facebook: 'facebook.com, then switch to your Page', threads: 'threads.com', pinterest: 'pinterest.com' };

const cleanHandle = (h: string): string | undefined => {
  const raw = h.trim().replace(/^@+/, '').toLowerCase();
  return raw ? `@${raw}` : undefined;
};

function Choice({ on, onClick, icon, title, children }: { on: boolean; onClick: () => void; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        'flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition',
        on ? 'border-krypt-purple/60 bg-krypt-purple/10 shadow-krypt-glow' : 'border-white/10 bg-white/[0.03] hover:border-white/25',
      )}
    >
      <span className={cls('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border', on ? 'border-krypt-purple/50 bg-krypt-purple/20 text-white' : 'border-white/10 text-krypt-muted')}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-sm text-krypt-muted">{children}</span>
      </span>
      <span className={cls('mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', on ? 'border-emerald-400/60 bg-emerald-500/30' : 'border-white/20')}>{on && <Check className="h-3 w-3 text-emerald-100" />}</span>
    </button>
  );
}

function Status({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <div className={cls('flex items-center gap-1.5 text-xs', ok ? 'text-emerald-300' : 'text-amber-300')}>
      {ok ? <CircleCheck className="h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="h-3.5 w-3.5 shrink-0" />} {children}
    </div>
  );
}

export default function Wizard() {
  const db = useApp((s) => s.db)!;
  const browser = useApp((s) => s.browser);
  const chrome = useApp((s) => s.chrome);
  const mcp = useApp((s) => s.mcp);
  const chat = useApp((s) => s.chat);
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const setWizard = useApp((s) => s.setWizard);

  // Run again with accounts already there: the wizard edits the active one.
  const existing: IgAccount | undefined = db.igAccounts.find((a) => sameHandle(a.handle, db.settings.handle)) ?? db.igAccounts[0];
  const [step, setStep] = useState<StepId>('start');
  const startMode = modeOf(db);
  const [mode, setMode] = useState<Mode | null>(db.brand.setupDone ? startMode : null);
  const forKrypt = mode === 'krypt';
  const [clipping, setClipping] = useState<ClipSettings>(existing?.clipping ?? EMPTY_CLIPPING);
  const [brand, setBrand] = useState<Brand>(db.brand.name ? db.brand : { ...EMPTY_BRAND });
  const [sites, setSites] = useState<Set<Site>>(() => new Set(existing ? sitesOf(existing) : []));
  const [where, setWhere] = useState<'chrome' | 'hub'>(existing?.browser ?? 'chrome');
  const [name, setName] = useState(existing?.handle ?? '');
  /** The Chrome profile this account is kept to ('' = automatic: the one signed in as it). */
  const [chromeDir, setChromeDir] = useState(existing?.chromeDir ?? '');
  const [xHandle, setXHandle] = useState(existing?.x?.handle ?? '');
  const [ttHandle, setTtHandle] = useState(existing?.tiktok?.handle ?? '');
  const [fbPage, setFbPage] = useState(existing?.facebook?.handle ?? '');
  const [thHandle, setThHandle] = useState(existing?.threads?.handle ?? '');
  const [pinHandle, setPinHandle] = useState(existing?.pinterest?.handle ?? '');
  const [fresh, setFresh] = useState(existing ? existing.status === 'warming' : true);
  const [targets, setTargets] = useState<Partial<Record<Site, number>>>(existing?.targets ?? {});
  const [accountId, setAccountId] = useState<string | null>(existing?.id ?? null);
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [auto, setAuto] = useState(false);
  /** The model scheduled runs use ('' = the AI app's own setting). */
  const [runModel, setRunModel] = useState<string | undefined>(useApp.getState().autopilot?.model);
  /** The usage tier: a new install starts on Low (a $20 plan lasts the month); an existing one shows what it runs. */
  const [tier, setTierState] = useState<UsageTier>(() => {
    const t = useApp.getState().autopilot?.tier;
    return t ?? (db.brand.setupDone ? 'max' : 'low');
  });
  const pickTier = (t: UsageTier): void => {
    setTierState(t);
    void window.marketo.autopilot.setTier(t).then((r) => {
      if (!r.ok) return toast('error', r.message ?? 'Could not save the tier.');
      useApp.setState({ autopilot: r.data });
      setRunModel(r.data?.model ?? '');
    });
  };
  const claudeReady = clients.some((c) => c.id === 'claude-code' && c.connected);
  const [busy, setBusy] = useState(false);
  const [allApps, setAllApps] = useState(false);

  const refreshClients = (): void => void window.marketo.mcp.clients().then(setClients);
  useEffect(refreshClients, []);

  const at = STEPS.findIndex((s) => s.id === step);
  const next = (): void => setStep(STEPS[Math.min(STEPS.length - 1, at + 1)].id);
  const back = (): void => setStep(STEPS[Math.max(0, at - 1)].id);
  const close = (): void => setWizard(false);

  /** Each mode's form, as typed here, so going back and forth between the cards loses nothing. */
  const [drafts, setDrafts] = useState<Partial<Record<Mode, Brand>>>({});
  const pickMode = (m: Mode): void => {
    if (m === mode) return;
    if (mode) setDrafts((d) => ({ ...d, [mode]: brand }));
    const carry = { setupDone: brand.setupDone, ...((brand.creator ?? db.brand.creator) ? { creator: brand.creator ?? db.brand.creator } : {}) };
    // The mode's own saved copy (Setup keeps one per mode), else its defaults.
    setBrand(drafts[m] ? { ...drafts[m]!, ...carry } : db.brand.setupDone && m === startMode ? { ...db.brand, ...carry } : brandFor(db, m, { ...brand, ...carry }));
    setMode(m);
  };

  const saveBrand = async (): Promise<boolean> => {
    if (!brand.name.trim() || !brand.what.trim()) {
      toast('warn', 'Give it at least a name and one sentence on what it is.');
      return false;
    }
    const problem = forKrypt ? creatorProblem(brand.creator) : null;
    if (problem) {
      toast('warn', `${problem} Or clear it to join later.`);
      return false;
    }
    // Switching mode keeps the old mode's copy (brand and account styles) for later, like Setup does.
    const from = modeOf(db);
    const r = mode && db.brand.setupDone ? await savePromoting(db, from, mode, db.brand, brand) : await window.marketo.brand.save({ ...brand, setupDone: db.brand.setupDone });
    if (r.ok && mode && !db.brand.setupDone) await window.marketo.db.updateSettings({ promoting: mode });
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    return r.ok;
  };

  /** Create or update the account with the picked platforms. */
  const saveAccount = async (): Promise<boolean> => {
    const handle = name.trim();
    if (!handle) {
      toast('warn', sites.has('instagram') ? 'Type the Instagram handle.' : 'Give the account a name (your brand handle works).');
      return false;
    }
    const today = localDate();
    // An account people have used for a while skips the warm-up ramp: day 1 a month back puts every platform in its Active phase.
    const start = fresh ? today : localDate(new Date(Date.now() - 30 * 86_400_000));
    const net = (n: Network, h: string): NetProfile | undefined => {
      const old = existing?.[n];
      if (!sites.has(n)) return old ? { ...old, enabled: false } : undefined;
      // A Facebook Page goes by its name, not a handle.
      const handleNow = n === 'facebook' ? h.trim() || undefined : cleanHandle(h);
      return { ...(old ?? {}), warmupStart: old?.enabled ? old.warmupStart : start, enabled: true, handle: handleNow, ...(handleNow !== old?.handle ? { userId: undefined } : {}) };
    };
    setBusy(true);
    const r = await window.marketo.db.saveAccount({
      ...(accountId ? { id: accountId } : { createdOn: today, warmupStart: start }),
      handle,
      browser: where,
      chromeDir: where === 'chrome' ? chromeDir : '',
      instagram: sites.has('instagram'),
      status: fresh ? 'warming' : 'active',
      niche: existing?.niche || brand.niche,
      youtube: sites.has('youtube') || existing?.youtube ? { ...(existing?.youtube ?? {}), enabled: sites.has('youtube') } : undefined,
      x: net('x', xHandle),
      tiktok: net('tiktok', ttHandle),
      facebook: net('facebook', fbPage),
      threads: net('threads', thHandle),
      pinterest: net('pinterest', pinHandle),
      // A clip channel runs the clipping style only, on the streamers picked at the brand step.
      ...(mode === 'clips' ? { styles: ['clipping'], clipping } : {}),
    });
    setBusy(false);
    if (!r.ok || !r.data) {
      toast('error', r.message ?? 'Could not save the account.');
      return false;
    }
    setAccountId(r.data.id);
    if (!existing) void window.marketo.db.updateSettings({ handle: r.data.handle });
    return true;
  };

  const finish = async (): Promise<void> => {
    setBusy(true);
    if (accountId) await window.marketo.db.saveAccount({ id: accountId, targets });
    const r = await window.marketo.brand.save({ ...brand, setupDone: true });
    setBusy(false);
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    if (auto) {
      // The tier's run times; a tier never picked here is saved now, so the runs are sized to it.
      if (!useApp.getState().autopilot?.tier) await window.marketo.autopilot.setTier(tier);
      const a = await window.marketo.autopilot.enable({ ai: 'claude', times: USAGE_TIERS[tier].times });
      if (!a.ok) toast('warn', `Autopilot did not turn on: ${a.message ?? 'unknown error'}. The Autopilot page has it.`);
    }
    toast('ok', auto ? 'Set up, with autopilot on.' : 'Set up. Your AI now works from this.');
    setWizard(false);
    go(auto ? 'autopilot' : 'dashboard');
  };

  const st = browser.find((b) => b.accountId === accountId);
  const signedIn = (s: Site): boolean => (s === 'instagram' ? !!st?.loggedIn : s === 'youtube' ? !!st?.youtube?.loggedIn : !!st?.[s]?.loggedIn);
  const aiConnected = (mcp?.clients.length ?? 0) > 0 || clients.some((c) => c.connected) || !!(chat?.hasKey && db.agent.model);
  const firstPrompt = `Read the Marketo playbook, then run get_today and do today's plan for ${brand.name || 'my brand'}.`;

  const openSite = async (s: Site): Promise<void> => {
    if (!accountId) return;
    const r = await window.marketo.browser.open(accountId, undefined, s);
    if (r.ok) return;
    // The Chrome profile picked on the last step is not open: open it, so the next press lands there.
    if (where === 'chrome' && chromeDir && /not open or not connected/.test(r.message ?? '')) {
      await window.marketo.chrome.open(chromeDir);
      toast('warn', 'The Chrome profile you picked was not open. Marketo is opening it now: press the button again in a few seconds.');
      return;
    }
    // Chrome profile names stay out of the wizard.
    toast('error', (r.message ?? `Could not open ${SITE_LABEL[s]}.`).replace(/the Chrome profile "[^"]*"/g, 'the Chrome profile you picked'));
  };

  let body: ReactNode;
  let canNext = true;
  let onNext: (() => Promise<boolean>) | null = null;
  /** Something this step could not confirm; going on is still allowed. */
  let warn: string | null = null;

  if (step === 'start') {
    canNext = mode !== null;
    body = (
      <>
        <h1 className="text-3xl font-bold tracking-tight text-white">Welcome to Krypt Marketo</h1>
        <p className="mt-2 max-w-2xl text-sm text-krypt-muted">
          Marketo makes short videos and runs your social accounts with the AI you already use: posting, warming up new accounts, replying to comments and messages, and learning what works. Setup takes about five minutes, and you can skip anything and finish it later.
        </p>
        <button
          onClick={() => void window.marketo.app.openExternal(GUIDE_VIDEO_URL)}
          title="Opens on YouTube in your browser"
          className="group mt-5 flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-krypt-purple/50 hover:bg-krypt-purple/10"
        >
          <span className="relative flex aspect-video w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
            {/* No internet: the picture hides and the play button stays. */}
            <img src={GUIDE_VIDEO_THUMB} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
            <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 transition group-hover:bg-krypt-purple">
              <Play className="h-4 w-4 translate-x-px fill-current" />
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Video guide</span>
            <span className="mt-1 block text-sm font-semibold text-white">New here? Watch the guide first</span>
            <span className="mt-0.5 block text-sm text-krypt-muted">Krypt walks through what Marketo does and how to set it up. Opens on YouTube in your browser.</span>
          </span>
          <ExternalLink className="mr-1 h-4 w-4 shrink-0 text-krypt-muted transition group-hover:text-white" />
        </button>
        <div className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">What are you promoting?</div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          <Choice on={mode === 'krypt'} onClick={() => pickMode('krypt')} icon={<Boxes className="h-4 w-4" />} title="Promote Krypt and get paid">
            {CREATOR_PITCH} Everything about every krypt.cc tool is already filled in, so this is the fastest start.
          </Choice>
          <Choice on={mode === 'own'} onClick={() => pickMode('own')} icon={<Briefcase className="h-4 w-4" />} title="My own business or product">
            A shop, an app, a service, a creator page. You describe it next.
          </Choice>
          <Choice on={mode === 'clips'} onClick={() => pickMode('clips')} icon={<Scissors className="h-4 w-4" />} title="Clip streamers">
            A clip channel. Pick Twitch or Kick streamers, and every day their most-viewed clips become captioned videos that name the streamer.
          </Choice>
        </div>
      </>
    );
  } else if (step === 'brand') {
    canNext = !!brand.name.trim() && !!brand.what.trim() && (mode !== 'clips' || clipping.sources.length > 0);
    onNext = saveBrand;
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">{forKrypt ? 'Krypt, filled in for you' : mode === 'clips' ? 'Your clip channel' : 'Describe your brand'}</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          {forKrypt
            ? 'Add where you get paid, and you are done here. The brand below is already set up; change it only if you want to.'
            : mode === 'clips'
              ? 'Add the streamers to clip and name the channel. The rest is filled in for a clip page; change it only if you want to.'
              : 'Your AI reads this before every video and post. Name and one sentence are enough to start; your AI can fill in the rest later.'}
        </p>
        {forKrypt && <CreatorCard className="mt-5" value={brand.creator} onChange={(c) => setBrand((b) => ({ ...b, creator: c }))} />}
        {mode === 'clips' && (
          <Card className="mt-5">
            <div className="text-sm font-semibold text-white">
              Streamers to clip<span className="text-krypt-purple"> *</span>
            </div>
            <p className="mb-3 mt-1 text-xs text-krypt-muted">Type a name or paste their Kick or Twitch address. You can change the list any time on the Styles page.</p>
            <ClipSourcesEditor value={clipping} onChange={setClipping} />
          </Card>
        )}
        <Card className="mt-5 grid gap-3 md:grid-cols-2">
          {FIELDS.map((x) => (
            <div key={x.key} className={x.long ? 'md:col-span-2' : ''}>
              <label className="label">
                {x.label}
                {(x.key === 'name' || x.key === 'what') && <span className="text-krypt-purple"> *</span>}
              </label>
              {x.long ? (
                <textarea className="input min-h-[60px]" placeholder={x.placeholder} value={brand[x.key]} onChange={(e) => setBrand((v) => ({ ...v, [x.key]: e.target.value }))} />
              ) : (
                <input className="input" placeholder={x.placeholder} value={brand[x.key]} onChange={(e) => setBrand((v) => ({ ...v, [x.key]: e.target.value }))} />
              )}
            </div>
          ))}
          <div className="md:col-span-2">
            <label className="label">Logo (square image, optional)</label>
            <div className="flex items-center gap-2">
              <div className="input truncate font-mono text-xs text-white/70">{brand.logo || 'None: the end card has no logo'}</div>
              <GhostButton small onClick={() => void window.marketo.app.pickFile('image').then((p) => p && setBrand((b) => ({ ...b, logo: p })))}>
                <ImageIcon className="h-3.5 w-3.5" /> Choose
              </GhostButton>
              {brand.logo && (
                <GhostButton small onClick={() => setBrand((b) => ({ ...b, logo: '' }))}>
                  <X className="h-3.5 w-3.5" />
                </GhostButton>
              )}
            </div>
          </div>
        </Card>
      </>
    );
  } else if (step === 'platforms') {
    canNext = sites.size > 0;
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">Where do you want to post?</h1>
        <p className="mt-1 text-sm text-krypt-muted">Pick any. One is fine; you can add the others later on the Accounts page. Every platform keeps its own daily limits.</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {SITES.map((s) => {
            const Icon = SITE_ICON[s];
            return (
              <Choice
                key={s}
                on={sites.has(s)}
                onClick={() =>
                  setSites((v) => {
                    const n = new Set(v);
                    if (n.has(s)) n.delete(s);
                    else n.add(s);
                    return n;
                  })
                }
                icon={<Icon className="h-4 w-4" />}
                title={SITE_LABEL[s]}
              >
                {SITE_ABOUT[s]}
              </Choice>
            );
          })}
        </div>
      </>
    );
  } else if (step === 'where') {
    canNext = !!name.trim();
    if (where === 'chrome') {
      const c = extensionCheck(chrome, chromeDir);
      if (!c.ready) warn = c.connected ? 'Chrome is running an older copy of the extension: reload it (see the check above).' : 'Chrome is not connected yet. You can go on and finish this later on the Accounts page, but nothing can run in Chrome until the checks above are green.';
    }
    onNext = saveAccount;
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">Your accounts</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          {existing ? `Updating ${existing.handle}. More accounts can be added on the Accounts page.` : 'Marketo never sees your passwords: you sign in yourself, in the next step.'}
        </p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Choice on={where === 'chrome'} onClick={() => setWhere('chrome')} icon={<Chrome className="h-4 w-4" />} title="My Chrome (recommended)">
            Your AI works in a tab of the Chrome you already use, so the platforms see the same device as always. Needs a small extension.
          </Choice>
          <Choice on={where === 'hub'} onClick={() => setWhere('hub')} icon={<Monitor className="h-4 w-4" />} title="Marketo's own browser">
            A private window inside Marketo. Nothing to install. Best for brand-new accounts{sites.has('youtube') ? '; Google sometimes refuses sign-in in apps, so YouTube works best in Chrome' : ''}.
          </Choice>
        </div>

        {where === 'chrome' && (
          <Card className="mt-4 space-y-2 text-sm text-white/80">
            <div className="flex items-center gap-2 font-semibold text-white">
              <Chrome className="h-4 w-4" /> Add the Krypt Marketo extension to Chrome
            </div>
            <p className="text-xs text-krypt-muted">About a minute, once. Chrome only lets an extension like this be added by hand, so follow the four steps exactly.</p>
            {(chrome?.local.length ?? 0) > 1 && (
              <div className="space-y-1.5 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <label className="label">Which Chrome profile are these accounts signed in to?</label>
                <select value={chromeDir} onChange={(e) => setChromeDir(e.target.value)} className="input w-full py-2 text-sm" title="The Chrome profile this account runs in">
                  <option value="" className="bg-krypt-panel">
                    Automatic (Marketo uses the one signed in as the account)
                  </option>
                  {chrome!.local.map((x) => (
                    <option key={x.dir} value={x.dir} className="bg-krypt-panel">
                      {chromeLabel(x)}
                      {x.hasExtension ? '' : ' (no extension yet)'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-krypt-muted">Pick one to keep the account to that profile; you can change it later on the Setup page. Emails are partly hidden on purpose.</p>
              </div>
            )}
            <ExtensionSetup dir={chromeDir || undefined} />
          </Card>
        )}

        <Card className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">{sites.has('instagram') ? 'Instagram handle' : 'Account name'}</label>
            <input className="input font-mono" placeholder={sites.has('instagram') ? '@yourhandle' : '@yourbrand'} value={name} onChange={(e) => setName(e.target.value)} />
            {!sites.has('instagram') && <p className="mt-1 text-[11px] text-krypt-muted">Just a name for this account in Marketo.</p>}
          </div>
          {sites.has('x') && (
            <div>
              <label className="label">X handle (optional)</label>
              <input className="input font-mono" placeholder="Read from X when you sign in" value={xHandle} onChange={(e) => setXHandle(e.target.value)} />
            </div>
          )}
          {sites.has('tiktok') && (
            <div>
              <label className="label">TikTok handle (optional)</label>
              <input className="input font-mono" placeholder="Read from TikTok when you sign in" value={ttHandle} onChange={(e) => setTtHandle(e.target.value)} />
            </div>
          )}
          {sites.has('facebook') && (
            <div>
              <label className="label">Facebook Page name</label>
              <input className="input" placeholder="The Page your reels go up on" value={fbPage} onChange={(e) => setFbPage(e.target.value)} />
            </div>
          )}
          {sites.has('threads') && (
            <div>
              <label className="label">Threads handle (optional)</label>
              <input className="input font-mono" placeholder="Read from Threads when you sign in" value={thHandle} onChange={(e) => setThHandle(e.target.value)} />
            </div>
          )}
          {sites.has('pinterest') && (
            <div>
              <label className="label">Pinterest username (optional)</label>
              <input className="input font-mono" placeholder="Read from Pinterest when you sign in" value={pinHandle} onChange={(e) => setPinHandle(e.target.value)} />
            </div>
          )}
          <div className="md:col-span-2">
            <Toggle on={fresh} onChange={setFresh} label="These accounts are new (made in the last month)" />
            <p className="mt-1 text-[11px] text-krypt-muted">
              {fresh ? 'New accounts start with a slow warm-up: mostly watching, few likes and follows, posting after a few days. Platforms flag new accounts that go fast.' : 'Accounts you have used for a while skip the warm-up and start at the normal daily limits.'}
            </p>
          </div>
        </Card>
      </>
    );
  } else if (step === 'signin') {
    const picked = SITES.filter((s) => sites.has(s));
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          {where === 'chrome'
            ? chromeDir
              ? 'Each button opens the platform in the Chrome profile you picked on the last step, and the marks below are read from that profile. Sign in there as you normally would (skip any you are already signed in to). '
              : 'Sign in to each one in your Chrome as you normally would (skip any you are already signed in to). '
            : 'Each button opens the platform in Marketo\'s browser. '}
          You type your own passwords and solve any security checks; Marketo and your AI never see them.
        </p>
        <Card padded={false} className="mt-5 divide-y divide-white/5">
          {picked.map((s) => {
            const Icon = SITE_ICON[s];
            const ok = signedIn(s);
            return (
              <div key={s} className="flex items-center gap-3 px-4 py-3">
                <Icon className="h-4 w-4 shrink-0 text-krypt-muted" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-white">{SITE_LABEL[s]}</div>
                  <Status ok={ok}>{ok ? 'Signed in' : where === 'chrome' && st?.connected === false ? 'Chrome not connected yet' : `Not signed in yet (${SIGNIN_URL[s]})`}</Status>
                </div>
                <GhostButton small onClick={() => void openSite(s)}>
                  <ExternalLink className="h-3.5 w-3.5" /> {ok ? 'Open' : 'Open to sign in'}
                </GhostButton>
              </div>
            );
          })}
        </Card>
        <p className="mt-3 text-xs text-krypt-muted">This list updates by itself. Not ready now? Skip it: the Accounts page has the same buttons.</p>
      </>
    );
  } else if (step === 'ai') {
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">Connect your AI</h1>
        <p className="mt-1 text-sm text-krypt-muted">Marketo is driven by the AI you already use. Connect adds Marketo to its settings; restart that app afterwards so it picks it up.</p>
        <Card padded={false} className="mt-5 divide-y divide-white/5">
          {[...clients]
            .filter((c) => allApps || c.connected || c.detected || !clients.some((x) => x.connected || x.detected))
            .sort((a, b) => Number(b.connected) - Number(a.connected) || Number(b.detected) - Number(a.detected))
            .map((c) => (
              <ClientRow key={c.id} c={c} onChanged={refreshClients} />
            ))}
        </Card>
        {!allApps && clients.some((c) => !c.connected && !c.detected) && clients.some((c) => c.connected || c.detected) && (
          <button onClick={() => setAllApps(true)} className="mt-2 text-xs text-krypt-muted underline-offset-2 hover:text-white hover:underline">
            Show AI apps not found on this computer
          </button>
        )}
        <Card className="mt-4 space-y-2">
          <div className="text-sm font-semibold text-white">How much of your AI plan to use</div>
          <p className="text-xs text-krypt-muted">For the scheduled runs (autopilot, last step). On a $20 plan like Claude Pro, pick Low: it is made to last the whole month. Change it any time under AI, Usage.</p>
          <TierPicker value={tier} rows={useApp.getState().autopilot?.usage ?? []} onPick={pickTier} />
        </Card>
        {clients.some((c) => c.id === 'claude-code' && (c.connected || c.detected)) && (
          <Card className="mt-4 space-y-2">
            <div className="text-sm font-semibold text-white">Model for scheduled runs with Claude Code</div>
            <p className="text-xs text-krypt-muted">Only matters if you switch on autopilot (last step). When you talk to your AI yourself, it uses whatever model that app is on. The Usage page (under AI) shows what each model is likely to use.</p>
            <ModelPicker
              value={runModel}
              onPick={(m) =>
                void window.marketo.autopilot.setModel(m).then((r) => {
                  if (r.ok) setRunModel(r.data?.model ?? '');
                  else toast('error', r.message ?? 'Could not save the model.');
                })
              }
            />
          </Card>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Status ok={aiConnected}>{(mcp?.clients.length ?? 0) > 0 ? `Talking to Marketo now: ${mcp!.clients.map((c) => c.name).join(', ')}` : aiConnected ? 'Connected. It shows up here once it makes its first call.' : 'No AI connected yet'}</Status>
          <GhostButton
            small
            onClick={() => {
              close();
              go('chat');
            }}
          >
            No AI app? Use the built-in chat with an API key
          </GhostButton>
        </div>
      </>
    );
  } else if (step === 'voice') {
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">Pick the voice of your videos</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          The narrator is the first thing people judge a video by. Marketo comes with free voices that run on this computer, and they work. We recommend ElevenLabs: its voices sound like a person, and Krypt's own videos use it.
        </p>
        <Card className="mt-5 space-y-3">
          <div className="text-sm font-semibold text-white">Recommended: ElevenLabs</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-white/80">
            <li>Far more natural narration, and you can clone your own voice.</li>
            <li>You only pay when a video is rendered to post. Previews stay free.</li>
            <li>You set a monthly budget in Marketo; it never goes over it (videos wait for the reset instead).</li>
          </ul>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <PrimaryButton onClick={() => void window.marketo.app.openExternal(ELEVEN_SIGNUP_URL)}>
              <ExternalLink className="h-4 w-4" /> Create an ElevenLabs account
            </PrimaryButton>
            <span className="text-[11px] text-krypt-muted">Krypt's affiliate link: {ELEVEN_AFFILIATE_NOTE}.</span>
          </div>
        </Card>
        <div className="mt-4">
          <ElevenCard />
        </div>
        <p className="mt-3 text-xs text-krypt-muted">No account for now? Skip this: new videos use the free voice, and the Voices page has all of this later.</p>
      </>
    );
  } else {
    const picked = SITES.filter((s) => sites.has(s));
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">Daily rules</h1>
        <p className="mt-1 text-sm text-krypt-muted">How much your AI aims to post each day. It stops at each platform's daily limit, and new accounts post less while they warm up. Those limits are recommended numbers: you can set your own on the Accounts page (Daily limits).</p>
        <Card className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {picked.map((s) => (
              <div key={s}>
                <label className="label">{SITE_LABEL[s]}</label>
                <input type="number" min={0} className="input font-mono" value={targets[s] ?? DEFAULT_TARGETS[s]} onChange={(e) => setTargets((t) => ({ ...t, [s]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
                <div className="mt-1 text-[11px] text-krypt-muted">posts a day</div>
              </div>
            ))}
          </div>
          <div>
            <Toggle on={!!db.settings.askApproval} onChange={(v) => void window.marketo.db.updateSettings({ askApproval: v })} label="Ask me before the AI posts, comments or messages" />
            <p className="mt-1 text-[11px] text-krypt-muted">{db.settings.askApproval ? 'Each one waits at the top of Marketo for your Approve.' : 'Off: they go out right away, inside the daily limits.'} Deletes, blocks and account settings always ask.</p>
          </div>        </Card>
        <Card className="mt-4 space-y-2">
          <div className="text-sm font-semibold text-white">Then say this to your AI</div>
          <div className="flex items-center gap-2">
            <div className="input flex-1 text-sm text-white/90">{firstPrompt}</div>
            <GhostButton small onClick={() => void window.marketo.app.copyText(firstPrompt).then(() => toast('ok', 'Copied.'))}>
              <Copy className="h-3.5 w-3.5" /> Copy
            </GhostButton>
          </div>
          <p className="text-[11px] text-krypt-muted">It checks what is due on each platform, makes and posts the videos, warms up, and answers comments and messages. Run it once or a few times a day.</p>
        </Card>
        <Card className="mt-4 space-y-1">
          <Toggle on={auto} onChange={(v) => (claudeReady ? setAuto(v) : toast('warn', 'Autopilot needs Claude Code installed and connected (the "Your AI" step).'))} label="Or let it run by itself: autopilot, 3 times a day with Claude Code" />
          <p className="text-[11px] text-krypt-muted">
            {claudeReady ? 'Your computer starts Claude Code at about 9:00, 15:00 and 21:00 to do the daily work. Keep the computer on. Change or stop it on the Autopilot page.' : 'Needs Claude Code installed and connected to Marketo. You can turn it on later on the Autopilot page.'}
          </p>
        </Card>
      </>
    );
  }

  const isLast = step === 'rules';
  const skippable = step === 'signin' || step === 'ai' || step === 'voice';
  const doNext = async (): Promise<void> => {
    if (onNext && !(await onNext())) return;
    next();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-white/5 px-8 py-4">
        <img src="./krypt.png" alt="" className="h-8 w-8 rounded-md" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className={cls('flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', i === at ? 'bg-krypt-purple/25 text-white' : i < at ? 'text-emerald-300' : 'text-krypt-muted')}>
                {i < at ? <Check className="h-3 w-3" /> : <span className="font-mono">{i + 1}</span>} {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-white/10" />}
            </div>
          ))}
        </div>
        {db.brand.setupDone && (
          <GhostButton small onClick={close}>
            <X className="h-3.5 w-3.5" /> Close
          </GhostButton>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-8 py-8">
        <div className="mx-auto max-w-3xl">{body}</div>
      </div>
      <div className="flex items-center gap-3 border-t border-white/5 px-8 py-4">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          {at > 0 && (
            <GhostButton onClick={back} disabled={busy}>
              <ArrowLeft className="h-4 w-4" /> Back
            </GhostButton>
          )}
          {warn ? (
            <div className="flex min-w-0 flex-1 items-start gap-1.5 text-xs leading-relaxed text-amber-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{warn}</span>
            </div>
          ) : (
            <div className="flex-1" />
          )}
          {skippable && (
            <GhostButton onClick={next} disabled={busy}>
              Skip for now
            </GhostButton>
          )}
          {isLast ? (
            <PrimaryButton onClick={() => void finish()} disabled={busy}>
              <Check className="h-4 w-4" /> Finish
            </PrimaryButton>
          ) : (
            <PrimaryButton onClick={() => void doNext()} disabled={!canNext || busy}>
              {busy ? 'Saving…' : warn ? 'Continue anyway' : 'Continue'} <ArrowRight className="h-4 w-4" />
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}
