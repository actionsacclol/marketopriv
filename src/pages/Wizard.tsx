import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, AtSign, RefreshCw, Boxes, Briefcase, Check, Chrome, Clapperboard, CircleAlert, CircleCheck, Copy, ExternalLink, Facebook, ImageIcon, Instagram, MessageCircle, Music2, Pin, Play, Scissors, X, Youtube } from 'lucide-react';
import type { Brand, ClientInfo, ClipSettings, IgAccount, NetProfile, Network, ProfileScan, Site } from '@shared/types';
import { DEFAULT_TARGETS, SITES, SITE_LABEL, YT_UPLOADS_PER_DAY, localDate, sameHandle, sitesOf } from '@shared/warmup';
import { CLIPPING_GUIDE_THUMB, CLIPPING_GUIDE_URL, CREATOR_PITCH, EMPTY_BRAND, GUIDE_VIDEO_THUMB, GUIDE_VIDEO_URL, creatorProblem } from '@shared/brand';
import { REWARDS_REFERRAL_NOTE, REWARDS_REFERRAL_URL } from '@shared/campaigns';
import { brandFor, modeOf, savePromoting } from '../lib/promoteMode';
import { ClipSourcesEditor, EMPTY_CLIPPING } from '../components/ClipSourcesEditor';
import { YtChannelPicker } from '../components/YtChannelPicker';
import { ELEVEN_AFFILIATE_NOTE, ELEVEN_SIGNUP_URL } from '@shared/voice';
import { CreatorCard } from '../components/CreatorCard';
import { ElevenCard } from '../components/ElevenCard';
import { ModelPicker, TierPicker } from '../components/AiUsage';
import { USAGE_TIERS, type UsageTier } from '@shared/aiUsage';
import { ExtensionSetup, chromeLabel, extensionCheck } from '../components/ExtensionSetup';
import { Card, GhostButton, PrimaryButton, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';
import { fieldsFor } from './Setup';
import { EditorSetup, LongformPlanFields, useEditorStatus } from '../components/Longform';
import { ClientRow } from './Agents';
import { GoalButtons, ProductField } from '../components/GoalPicker';
import type { GoalId } from '@shared/goals';

// First-run setup: what you promote, which platforms, where the accounts are
// signed in, signing in, connecting an AI, and the daily rules. Every step
// after the brand can be skipped and finished later on the normal pages.

/** What the install is for: Krypt's tools, the user's own brand, a clip channel (clipping style only), or a long-form YouTube channel. */
type Mode = 'krypt' | 'own' | 'clips' | 'longform';
type StepId = 'start' | 'plan' | 'editor' | 'brand' | 'platforms' | 'where' | 'signin' | 'ai' | 'voice' | 'rules';
/** The clip channel's extra step after Start: the short plan and the clipping guide video. */
const PLAN_STEP: { id: StepId; label: string } = { id: 'plan', label: 'The plan' };
/** The long-form channel's extra step after Start: install Krypt Editor, where its videos are made. */
const EDITOR_STEP: { id: StepId; label: string } = { id: 'editor', label: 'Krypt Editor' };
const STEPS: Array<{ id: StepId; label: string }> = [
  { id: 'start', label: 'Start' },
  { id: 'brand', label: 'Brand' },
  // Accounts (the Chrome profile) comes first, so Platforms can list that profile's YouTube channels.
  { id: 'where', label: 'Accounts' },
  { id: 'platforms', label: 'Platforms' },
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

/** A YouTube video as a card: thumbnail with a play button, opens in the browser. */
function VideoCard({ url, thumb, title, children }: { url: string; thumb: string; title: string; children: ReactNode }) {
  return (
    <button
      onClick={() => void window.marketo.app.openExternal(url)}
      title="Opens on YouTube in your browser"
      className="group mt-5 flex w-full items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-left transition hover:border-krypt-purple/50 hover:bg-krypt-purple/10"
    >
      <span className="relative flex aspect-video w-44 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40">
        {/* No internet: the picture hides and the play button stays. */}
        <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')} />
        <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 transition group-hover:bg-krypt-purple">
          <Play className="h-4 w-4 translate-x-px fill-current" />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Video guide</span>
        <span className="mt-1 block text-sm font-semibold text-white">{title}</span>
        <span className="mt-0.5 block text-sm text-krypt-muted">{children}</span>
      </span>
      <ExternalLink className="mr-1 h-4 w-4 shrink-0 text-krypt-muted transition group-hover:text-white" />
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
  // Accounts always run in the user's Chrome (the built-in browser was removed).
  const where = 'chrome' as 'chrome' | 'hub';
  const [name, setName] = useState(existing?.handle ?? '');
  /** The Chrome profile this account is kept to ('' = automatic: the one signed in as it). */
  // A profile made for one Chrome profile (Multi run > Chrome profiles) starts its first account in that one.
  const madeFor = useApp((st) => st.profiles.find((p) => p.active)?.chromeDir);
  const [chromeDir, setChromeDir] = useState(existing?.chromeDir ?? madeFor ?? '');
  const [xHandle, setXHandle] = useState(existing?.x?.handle ?? '');
  const [ttHandle, setTtHandle] = useState(existing?.tiktok?.handle ?? '');
  const [fbPage, setFbPage] = useState(existing?.facebook?.handle ?? '');
  const [thHandle, setThHandle] = useState(existing?.threads?.handle ?? '');
  const [pinHandle, setPinHandle] = useState(existing?.pinterest?.handle ?? '');
  const [fresh, setFresh] = useState(existing ? existing.status === 'warming' : true);
  const [targets, setTargets] = useState<Partial<Record<Site, number>>>(existing?.targets ?? {});
  /** What the account is for (every platform it runs; Home > a platform changes one). */
  const [goal, setGoal] = useState<GoalId>(existing?.goals?.instagram ?? 'grow');
  const [pushProduct, setPushProduct] = useState(existing?.pushProduct ?? '');
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

  // ── What the picked Chrome profile is signed in to (read once it is connected; fills in the handles) ──
  const [scan, setScan] = useState<ProfileScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState('');
  const scannedFor = useRef<string | null>(null);
  const runScan = async (dir: string): Promise<void> => {
    setScanning(true);
    setScanErr('');
    const r = await window.marketo.chrome.scan(dir);
    setScanning(false);
    if (!r.ok || !r.data) {
      setScan(null);
      setScanErr(r.message ?? 'Could not read the Chrome profile.');
      return;
    }
    const found = r.data.sites;
    setScan(r.data);
    const at = (s: Site): string => (found[s]?.handle ? `@${found[s]!.handle}` : '');
    setName((v) => v.trim() || at('instagram') || at('x') || at('tiktok') || at('threads') || at('pinterest') || v);
    setXHandle((v) => v.trim() || at('x'));
    setTtHandle((v) => v.trim() || at('tiktok'));
    setThHandle((v) => v.trim() || at('threads'));
    setPinHandle((v) => v.trim() || at('pinterest'));
  };
  const scanReady = extensionCheck(chrome, chromeDir).ready && (!!chromeDir || (chrome?.profiles.length ?? 0) === 1);
  useEffect(() => {
    if (step !== 'where' || !scanReady || scannedFor.current === chromeDir) return;
    scannedFor.current = chromeDir;
    setScan(null);
    void runScan(chromeDir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, chromeDir, scanReady]);

  const refreshClients = (): void => void window.marketo.mcp.clients().then(setClients);
  useEffect(refreshClients, []);

  const steps = mode === 'clips' ? [STEPS[0], PLAN_STEP, ...STEPS.slice(1)] : mode === 'longform' ? [STEPS[0], EDITOR_STEP, { id: 'brand' as StepId, label: 'Channel' }, ...STEPS.slice(2)] : STEPS;
  const editor = useEditorStatus(step === 'editor' || (step === 'ai' && mode === 'longform'));
  const at = Math.max(0, steps.findIndex((s) => s.id === step));
  const next = (): void => setStep(steps[Math.min(steps.length - 1, at + 1)].id);
  const back = (): void => setStep(steps[Math.max(0, at - 1)].id);
  const close = (): void => setWizard(false);
  /** Leave the wizard without finishing it: what is saved stays, the rest is on the Setup and Accounts pages. */
  const skipAll = async (): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.brand.save({ setupDone: true });
    setBusy(false);
    if (!r.ok) return toast('error', r.message ?? 'Could not skip.');
    toast('ok', 'Setup skipped. The Setup page and Accounts have everything when you want it.');
    setWizard(false);
    go('dashboard');
  };

  /** Each mode's form, as typed here, so going back and forth between the cards loses nothing. */
  const [drafts, setDrafts] = useState<Partial<Record<Mode, Brand>>>({});
  const pickMode = (m: Mode): void => {
    if (m === mode) return;
    if (mode) setDrafts((d) => ({ ...d, [mode]: brand }));
    const carry = { setupDone: brand.setupDone, ...((brand.creator ?? db.brand.creator) ? { creator: brand.creator ?? db.brand.creator } : {}) };
    // The mode's own saved copy (Setup keeps one per mode), else its defaults.
    setBrand(drafts[m] ? { ...drafts[m]!, ...carry } : db.brand.setupDone && m === startMode ? { ...db.brand, ...carry } : brandFor(db, m, { ...brand, ...carry }));
    setMode(m);
    // A long-form channel is a YouTube channel: YouTube starts picked.
    if (m === 'longform') setSites((v) => new Set<Site>([...v, 'youtube']));
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
    // The account as saved now (the Accounts step saves it before Platforms, and a channel picked there is kept).
    const cur = (accountId ? db.igAccounts.find((x) => x.id === accountId) : undefined) ?? existing;
    const net = (n: Network, h: string): NetProfile | undefined => {
      const old = cur?.[n];
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
      // A channel turned on here warms up for a week when the accounts are new; one already on keeps its own start.
      youtube: sites.has('youtube') || cur?.youtube ? { ...(cur?.youtube ?? {}), enabled: sites.has('youtube'), warmupStart: cur?.youtube?.enabled ? cur.youtube.warmupStart : fresh ? start : undefined } : undefined,
      x: net('x', xHandle),
      tiktok: net('tiktok', ttHandle),
      facebook: net('facebook', fbPage),
      threads: net('threads', thHandle),
      pinterest: net('pinterest', pinHandle),
      goals: Object.fromEntries([...sites].map((s) => [s, mode === 'clips' || mode === 'longform' ? 'grow' : goal])) as Partial<Record<Site, GoalId>>,
      pushProduct: goal === 'product' ? pushProduct : '',
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
    // A long-form channel posts no Shorts unless a number was typed for them on this page.
    if (accountId) await window.marketo.db.saveAccount({ id: accountId, targets: mode === 'longform' ? { youtube: 0, ...targets } : targets });
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
  const firstPrompt =
    mode === 'longform'
      ? `Run get_today in Marketo and work on the next long video for ${brand.name || 'my channel'}: pick it from the channel, make it in Krypt Editor, then upload it.`
      : `Read the Marketo playbook, then run get_today and do today's plan for ${brand.name || 'my brand'}.`;

  const openSite = async (s: Site): Promise<void> => {
    if (!accountId) return;
    const r = await window.marketo.browser.open(accountId, undefined, s);
    if (r.ok) return;
    // The Chrome profile picked on the Accounts step is not open: open it, so the next press lands there.
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
        <VideoCard url={GUIDE_VIDEO_URL} thumb={GUIDE_VIDEO_THUMB} title="New here? Watch the guide first">
          Krypt walks through what Marketo does and how to set it up. Opens on YouTube in your browser.
        </VideoCard>
        <div className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">What is it for?</div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Choice on={mode === 'krypt'} onClick={() => pickMode('krypt')} icon={<Boxes className="h-4 w-4" />} title="Promote Krypt and get paid">
            {CREATOR_PITCH} Everything about every krypt.cc tool is already filled in, so this is the fastest start.
          </Choice>
          <Choice on={mode === 'own'} onClick={() => pickMode('own')} icon={<Briefcase className="h-4 w-4" />} title="My own business or product">
            A shop, an app, a service, a creator page. You describe it next.
          </Choice>
          <Choice on={mode === 'clips'} onClick={() => pickMode('clips')} icon={<Scissors className="h-4 w-4" />} title="Clip streamers">
            A clip channel. Pick Twitch or Kick streamers, and every day their most-viewed clips become captioned videos that name the streamer.
          </Choice>
          <Choice on={mode === 'longform'} onClick={() => pickMode('longform')} icon={<Clapperboard className="h-4 w-4" />} title="A long-form YouTube channel">
            Full-length YouTube videos, made in Krypt Editor. Marketo picks what to make from your channel, writes the title, description and thumbnail, uploads it and answers the comments.
          </Choice>
        </div>
      </>
    );
  } else if (step === 'editor') {
    if (editor.status && !editor.status.installed) warn = 'Krypt Editor is not on this computer yet. You can go on and install it later, but no long video can be made until it is installed and connected to your AI.';
    else if (editor.status && !editor.status.connected.length) warn = 'Krypt Editor is not connected to an AI yet. You can go on, but your AI cannot make a video in it until it is.';
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">First, get Krypt Editor</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          Long videos are made in Krypt Editor, Krypt's free video editor. Your AI builds the whole video in it from a script: the narration, the pictures, captions, chapters and the export. Marketo does the rest of the channel: it picks what to make, writes the title, description and thumbnail, uploads through YouTube Studio and answers the comments.
        </p>
        <div className="mt-5">
          <EditorSetup status={editor.status} refresh={editor.refresh} />
        </div>
        <p className="mt-3 text-xs text-krypt-muted">You do not have to keep Krypt Editor open: your AI opens it when a video is due. Next you describe the channel.</p>
      </>
    );
  } else if (step === 'plan') {
    const planSteps: Array<{ title: string; about: ReactNode }> = [
      {
        title: 'Sign up for Content Rewards through Marketo',
        about: (
          <>
            Do this first, with the button below (it is also in Create → Campaigns), then connect your accounts in Content Rewards under Settings → Accounts.
            <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <GhostButton small onClick={() => void window.marketo.app.openExternal(REWARDS_REFERRAL_URL)}>
                <ExternalLink className="h-3.5 w-3.5" /> Sign up for Content Rewards
              </GhostButton>
              <span className="text-xs text-krypt-muted">Referral link: {REWARDS_REFERRAL_NOTE}.</span>
            </span>
          </>
        ),
      },
      { title: 'Pick the streamers to clip', about: 'On the next page. Kick or Twitch, as many as you like; you can change them later on the Styles page.' },
      { title: 'Add the Marketo Chrome extension and sign in', about: 'Your accounts run in your own Chrome. New accounts warm up for about a week before they post.' },
      { title: 'Connect your AI', about: 'Claude Code or another AI you already use. Kip, Marketo’s AI manager, runs on it.' },
      {
        title: 'Join a campaign and let Kip clip',
        about: 'Join a campaign on Content Rewards, then add it in Create → Campaigns. Kip makes clips to its rules, posts them and submits each link within the 30-minute window.',
      },
    ];
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">Your clipping plan</h1>
        <p className="mt-1 text-sm text-krypt-muted">Five steps from here to clips that post and submit themselves. The guide shows every one of them.</p>
        <VideoCard url={CLIPPING_GUIDE_URL} thumb={CLIPPING_GUIDE_THUMB} title="Watch the clipping guide">
          Signing up, picking a streamer, joining a campaign, and Kip posting and submitting a clip. Opens on YouTube in your browser.
        </VideoCard>
        <ol className="mt-6 space-y-3">
          {planSteps.map((s, i) => (
            <li key={s.title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <span className={cls('flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold', i === 0 ? 'bg-krypt-purple text-white' : 'bg-white/10 text-krypt-muted')}>{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">{s.title}</span>
                <span className="mt-0.5 block text-sm text-krypt-muted">{s.about}</span>
              </span>
            </li>
          ))}
        </ol>
      </>
    );
  } else if (step === 'brand') {
    canNext = !!brand.name.trim() && !!brand.what.trim() && (mode !== 'clips' || clipping.sources.length > 0);
    onNext = saveBrand;
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">{forKrypt ? 'Krypt, filled in for you' : mode === 'clips' ? 'Your clip channel' : mode === 'longform' ? 'Describe your channel' : 'Describe your brand'}</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          {forKrypt
            ? 'Add where you get paid, and you are done here. The brand below is already set up; change it only if you want to.'
            : mode === 'clips'
              ? 'Add the streamers to clip and name the channel. The rest is filled in for a clip page; change it only if you want to.'
              : mode === 'longform'
                ? 'Your AI reads this before it picks and writes every video. The name and what the channel is about are enough to start; say the kind of video you want (explainers, documentaries, top lists, tutorials, stickman stories) and it is built that way.'
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
          {fieldsFor(mode ?? 'own').map((x) => (
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
    const long = mode === 'longform';
    canNext = long ? sites.has('youtube') : sites.size > 0;
    onNext = saveAccount;
    const ytOn = sites.has('youtube');
    const acct = accountId ? db.igAccounts.find((x) => x.id === accountId) : undefined;
    const moreYt = acct?.chromeDir ? db.igAccounts.filter((x) => x.id !== acct.id && x.youtube?.enabled && x.chromeDir === acct.chromeDir).length : 0;
    const handleFields: Array<{ s: Site; label: string; placeholder: string; value: string; set: (v: string) => void; mono?: boolean }> = [
      { s: 'x', label: 'X handle (optional)', placeholder: 'Read from X when you sign in', value: xHandle, set: setXHandle, mono: true },
      { s: 'tiktok', label: 'TikTok handle (optional)', placeholder: 'Read from TikTok when you sign in', value: ttHandle, set: setTtHandle, mono: true },
      { s: 'facebook', label: 'Facebook Page name', placeholder: 'The Page your reels go up on', value: fbPage, set: setFbPage },
      { s: 'threads', label: 'Threads handle (optional)', placeholder: 'Read from Threads when you sign in', value: thHandle, set: setThHandle, mono: true },
      { s: 'pinterest', label: 'Pinterest username (optional)', placeholder: 'Read from Pinterest when you sign in', value: pinHandle, set: setPinHandle, mono: true },
    ].filter((f) => sites.has(f.s as Site)) as Array<{ s: Site; label: string; placeholder: string; value: string; set: (v: string) => void; mono?: boolean }>;
    body = (
      <>
        <h1 className="text-2xl font-bold text-white">{long ? 'Your YouTube channel' : 'Where do you want to post?'}</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          {long
            ? 'YouTube is on: the long videos go up there. Pick the channel in the card below if your Google sign-in owns more than one. The other platforms are optional, for short videos; you can add them later on the Accounts page.'
            : 'Pick any. One is fine; you can add the others later on the Accounts page. Every platform keeps its own daily limits.'}
        </p>
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
                title={long && s === 'youtube' ? 'YouTube' : SITE_LABEL[s]}
              >
                {long && s === 'youtube' ? 'Your long videos, uploaded through YouTube Studio, and their comments. Shorts too if you set a number for them on the last step.' : SITE_ABOUT[s]}
                {scan?.sites[s]?.signedIn && (
                  <span className="mt-1 block font-mono text-xs text-emerald-300">
                    {s === 'youtube' ? `Signed in${scan.sites.youtube?.channels?.length ? ` · ${scan.sites.youtube.channels.length} channels` : ''}` : scan.sites[s]?.handle ? `Signed in as @${scan.sites[s]!.handle}` : 'Signed in'}
                  </span>
                )}
              </Choice>
            );
          })}
          <div className={cls('rounded-2xl border p-4 transition', ytOn ? 'border-white/10 bg-white/[0.03]' : 'border-white/5 bg-white/[0.015]')}>
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-krypt-muted">
                <Youtube className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-white">More YouTube channels</span>
                <span className="mt-0.5 block text-sm text-krypt-muted">
                  {ytOn
                    ? `One Google sign-in can own many channels. Pick them from your Chrome profile; each runs as its own account.${moreYt ? ` ${moreYt} added so far.` : ''}`
                    : 'Turn on YouTube Shorts to run more than one channel from your Chrome profile.'}
                </span>
              </span>
            </div>
            {ytOn && accountId && <YtChannelPicker accountId={accountId} initial={scan?.sites.youtube?.channels} className="mt-3" />}
          </div>
        </div>
        {handleFields.length > 0 && (
          <Card className="mt-4 grid gap-3 md:grid-cols-2">
            {handleFields.map((f) => (
              <div key={f.s}>
                <label className="label">{f.label}</label>
                <input className={cls('input', f.mono && 'font-mono')} placeholder={f.placeholder} value={f.value} onChange={(e) => f.set(e.target.value)} />
              </div>
            ))}
          </Card>
        )}
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
          {existing ? `Updating ${existing.handle}. More accounts can be added on the Accounts page.` : 'Marketo never sees your passwords: you sign in yourself, after picking your platforms.'}
        </p>
        <p className="mt-4 text-sm text-white/80">Your AI works in a tab of your real Chrome, so the platforms see the same device as always. It needs a small extension, once.</p>

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

        {(scanning || scan || scanErr) && (
          <Card className="mt-4">
            <div className="flex items-center gap-2">
              <div className="flex-1 text-sm font-semibold text-white">What this Chrome profile is signed in to</div>
              {!scanning && (
                <GhostButton small onClick={() => void runScan(chromeDir)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Check again
                </GhostButton>
              )}
            </div>
            {scanning ? (
              <p className="mt-2 text-xs text-krypt-muted">Reading who you are signed in as on each platform. Chrome opens each one for a moment and closes it again.</p>
            ) : scanErr ? (
              <p className="mt-2 text-xs text-amber-300">{scanErr}</p>
            ) : (
              <>
                <div className="mt-3 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  {SITES.map((s) => {
                    const r = scan!.sites[s];
                    const Icon = SITE_ICON[s];
                    const n = r?.channels?.length ?? 0;
                    const what = !r?.signedIn ? 'Not signed in' : s === 'youtube' ? (n ? `${n} channel${n === 1 ? '' : 's'}` : 'Signed in') : r.handle ? `@${r.handle}` : 'Signed in';
                    return (
                      <div key={s} className="flex items-center gap-2 text-sm">
                        <Icon className="h-4 w-4 shrink-0 text-krypt-muted" />
                        <span className="w-28 shrink-0 text-white/80">{SITE_LABEL[s]}</span>
                        <span className={cls('min-w-0 truncate', r?.signedIn ? 'font-mono text-emerald-300' : 'text-krypt-muted')}>{what}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[11px] text-krypt-muted">The handles below and on the next page are filled in from this. You pick the platforms next; YouTube channels are picked there too.</p>
              </>
            )}
          </Card>
        )}

        <Card className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="label">Account name</label>
            <input className="input font-mono" placeholder="@yourhandle" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-[11px] text-krypt-muted">Your Instagram handle if this account will post on Instagram; otherwise any name for it in Marketo.</p>
          </div>
          <div className="md:col-span-2">
            <label className="label">Warm-up</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                [true, 'Warm up for 1 week', 'For new accounts: the first days only watch and read, then a few likes, follows and comments. First post: Instagram day 7; YouTube, X, TikTok and Facebook day 5; Threads day 3; Pinterest Pins from day 2 with links from day 4. Normal limits from day 8 (X from day 15).'],
                [false, 'Already warmed up', 'For accounts you have used for a while: normal daily limits from today. Still raise activity step by step; sudden jumps get flagged.'],
              ] as const).map(([v, title, about]) => (
                <button
                  key={title}
                  onClick={() => setFresh(v)}
                  className={cls('rounded-xl border p-3 text-left transition', fresh === v ? 'border-krypt-purple/60 bg-krypt-purple/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}
                >
                  <div className="text-sm font-semibold text-white">{title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-krypt-muted">{about}</p>
                </button>
              ))}
            </div>
            {fresh && <p className="mt-1 text-[11px] text-krypt-muted">On a brand-new account the link in bio waits until about day 30; an early link can get it restricted.</p>}
          </div>
          {mode !== 'clips' && mode !== 'longform' && (
            <div className="space-y-2 md:col-span-2">
              <label className="label">Goal</label>
              <GoalButtons value={goal} onChange={setGoal} />
              {goal === 'product' && (
                <div className="space-y-1">
                  <label className="label">What to push</label>
                  <ProductField value={pushProduct} onChange={setPushProduct} />
                </div>
              )}
              <p className="text-[11px] text-krypt-muted">Applies to every platform here; Home &gt; a platform changes it for one. Every platform has its researched playbook.</p>
            </div>
          )}
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
              ? 'Each button opens the platform in the Chrome profile you picked on the Accounts step, and the marks below are read from that profile. Sign in there as you normally would (skip any you are already signed in to). '
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
                  <div className="text-sm font-medium text-white">{mode === 'longform' && s === 'youtube' ? 'YouTube' : SITE_LABEL[s]}</div>
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
            .sort((a, b) => Number(b.connected) - Number(a.connected) || Number(b.detected) - Number(a.detected))
            .map((c) => (
              <ClientRow key={c.id} c={c} onChanged={refreshClients} />
            ))}
        </Card>
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
        {mode === 'longform' && editor.status && (
          <div className="mt-3">
            <Status ok={editor.status.connected.length > 0}>
              {editor.status.connected.length
                ? `Krypt Editor is connected to ${editor.status.connected.join(', ')}. Your AI needs both: Marketo and Krypt Editor.`
                : 'Krypt Editor is not connected to an AI yet: in Krypt Editor press AI agents (top right) and Connect, with the same AI as here.'}
            </Status>
          </div>
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
        <h1 className="text-2xl font-bold text-white">{mode === 'longform' ? 'The channel plan' : 'Daily rules'}</h1>
        <p className="mt-1 text-sm text-krypt-muted">
          {mode === 'longform'
            ? 'How many long videos your AI makes, and how they go up. Change it any time under Create, Long videos. Below that, short videos a day, if you want any.'
            : "How much your AI aims to post each day. It stops at each platform's daily limit, and new accounts post less while they warm up. Those limits are recommended numbers: you can set your own on the Accounts page (Daily limits)."}
        </p>
        {mode === 'longform' && (
          <Card className="mt-5">
            <div className="mb-3 text-sm font-semibold text-white">Long videos</div>
            <LongformPlanFields />
          </Card>
        )}
        <Card className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {picked.map((s) => (
              <div key={s}>
                <label className="label">{SITE_LABEL[s]}</label>
                <input type="number" min={0} className="input font-mono" value={targets[s] ?? (mode === 'longform' && s === 'youtube' ? 0 : DEFAULT_TARGETS[s])} onChange={(e) => setTargets((t) => ({ ...t, [s]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} />
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
          <p className="text-[11px] text-krypt-muted">
            {mode === 'longform'
              ? 'It reads the channel, picks the next video, builds it in Krypt Editor, uploads it and answers the comments. A long video can take more than one sitting; it carries on where it stopped.'
              : 'It checks what is due on each platform, makes and posts the videos, warms up, and answers comments and messages. Run it once or a few times a day.'}
          </p>
        </Card>
        <Card className="mt-4 space-y-1">
          <Toggle on={auto} onChange={(v) => (claudeReady ? setAuto(v) : toast('warn', 'This switch needs Claude Code installed and connected (the "Your AI" step). With Codex, turn autopilot on from the Autopilot page after setup.'))} label="Or let it run by itself: autopilot, 3 times a day with Claude Code" />
          <p className="text-[11px] text-krypt-muted">
            {claudeReady ? 'Your computer starts Claude Code at about 9:00, 15:00 and 21:00 to do the daily work. Keep the computer on. Change or stop it on the Autopilot page. Later, Create > Campaigns can get your posts paid per view (Content Rewards).' :'This switch needs Claude Code installed and connected to Marketo. With Codex (its command-line program), or later, turn it on from the Autopilot page.'}
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
          {steps.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5">
              <span className={cls('flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium', i === at ? 'bg-krypt-purple/25 text-white' : i < at ? 'text-emerald-300' : 'text-krypt-muted')}>
                {i < at ? <Check className="h-3 w-3" /> : <span className="font-mono">{i + 1}</span>} {s.label}
              </span>
              {i < steps.length - 1 && <span className="h-px w-4 bg-white/10" />}
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
          {!db.brand.setupDone && (
            <GhostButton onClick={() => void skipAll()} disabled={busy}>
              Skip setup
            </GhostButton>
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
