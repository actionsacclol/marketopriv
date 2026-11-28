import { useState } from 'react';
import { Check, ChevronDown, Chrome, CircleCheck, CircleAlert, Eye, Flame, Pencil, Plus, RefreshCw, Star, Trash2, Unlink, Users } from 'lucide-react';
import type { AccountInput, AccountStatus, BrowserStatus, ChromeStatus, IgAccount, LimitKey, NetProfile, Network, ProfileScan, Session, Site, YtChannelOption } from '@shared/types';
import { DEFAULT_TARGETS, NETWORKS, NETWORK_LABEL, POST_GAP_MIN, SITES, SITE_LABEL, YT_UPLOADS_PER_DAY, cleanLimit, limitKeys, limitLabel, localDate, planFor, quotaLabel, sameHandle, siteOn } from '@shared/warmup';
import { Card, Empty, GhostButton, Page, PrimaryButton, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { PlatformTile } from '../components/Platforms';
import { YtChannelPicker } from '../components/YtChannelPicker';
import { ExtensionSetup, chromeLabel, extensionCheck } from '../components/ExtensionSetup';
import { PAGE_SIZE, useShowMore } from '../components/ShowMore';
import { usePerf } from '../lib/perf';
import { accountSites } from '../lib/platforms';
import { cls, fmtNum } from '../lib/format';

const STATUS_STYLE: Record<AccountStatus, string> = {
  warming: 'border-amber-400/40 bg-amber-500/15 text-amber-200',
  active: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
  paused: 'border-white/15 bg-white/5 text-white/60',
};

export function AccountStatusChip({ status }: { status: AccountStatus }) {
  return <span className={cls('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', STATUS_STYLE[status])}>{status}</span>;
}

/** Is the account signed in where it runs (the user's Chrome), and as whom. */
export function SignInLine({ a, st }: { a: IgAccount; st: BrowserStatus | undefined }) {
  const inChrome = a.browser === 'chrome';
  const wrong = !!st?.loggedIn && !!st.signedInAs && !sameHandle(st.signedInAs, a.handle);
  if (inChrome && !st?.connected)
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-300">
        <CircleAlert className="h-3.5 w-3.5 shrink-0" /> Chrome is not connected: open the Chrome profile it is signed in to
      </div>
    );
  if (wrong)
    return (
      <div className="flex items-center gap-1.5 text-xs text-rose-300">
        <CircleAlert className="h-3.5 w-3.5 shrink-0" /> {inChrome ? 'That Chrome profile is signed in' : 'Signed in'} as @{st!.signedInAs}, not {a.handle}
      </div>
    );
  if (st?.loggedIn)
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-300">
        <CircleCheck className="h-3.5 w-3.5 shrink-0" /> Signed in{inChrome ? ' in your Chrome' : ''}
        {st.open ? (inChrome ? ' · tab open' : ' · window open') : ''}
      </div>
    );
  return (
    <div className="flex items-center gap-1.5 text-xs text-amber-300">
      <CircleAlert className="h-3.5 w-3.5 shrink-0" /> {inChrome ? 'Chrome is connected, but Instagram is signed out there' : 'Not signed in yet: open Instagram and log in'}
    </div>
  );
}

export async function openInstagram(accountId: string): Promise<void> {
  const r = await window.marketo.browser.open(accountId);
  if (!r.ok) useApp.getState().toast('error', r.message ?? 'Could not open Instagram.');
}

const NET_HELP: Record<Network, string> = {
  x: 'Likes, reposts and follows are counted; posts, replies, messages and unfollows follow your approval setting. X is strict about automated likes and follows, so the recommended limits are low; your own numbers go under Daily limits.',
  tiktok: 'Most of the time goes to watching the For You feed so TikTok learns the niche. Likes, favorites and follows are counted; posts, comments, messages and unfollows follow your approval setting. Security checks (puzzles) are yours to solve.',
  facebook: 'Posts Reels as your Facebook Page through Meta Business Suite (you switch to the Page yourself; Marketo never switches profiles or sends friend requests). Likes, follows and shares are counted; posts, comments and messages follow your approval setting.',
  threads: 'Signed in with your Instagram account. Likes, reposts and follows are counted; threads, replies and unfollows follow your approval setting. A strike on Threads can reach Instagram, so the recommended limits are low; your own numbers go under Daily limits.',
  pinterest: 'Reels go up as video Pins with a searchable title and your link. Saves into your boards and reactions are counted; Pins, comments and messages follow your approval setting.',
};

/** One network's part of the account form (X, TikTok, Facebook, Threads, Pinterest). */
function NetSettings({ f, set, n, more, pages }: { f: AccountInput; set: <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => void; n: Network; /** "More settings" is open: the warm-up date and watch-only show too. */ more: boolean; /** Facebook: the Pages the Chrome profile scan found. */ pages?: string[] }) {
  const L = NETWORK_LABEL[n];
  const p = f[n];
  const put = (v: NetProfile): void => set(n, v);
  const pick = n === 'facebook' && (pages?.length ?? 0) > 1;
  return (
    <div>
      <Toggle on={!!p?.enabled} onChange={(v) => put({ warmupStart: localDate(), ...(p ?? {}), enabled: v })} label={`Run ${L}`} />
      {p?.enabled && (
        <>
          <p className="mt-1 text-[11px] text-krypt-muted">
            AIs use {L} in this account's Chrome profile, with {L}'s own warm-up and daily limits. {NET_HELP[n]}
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div className={more ? '' : 'col-span-2'}>
              <label className="label">{n === 'facebook' ? 'Facebook Page' : `${L} handle`}</label>
              {pick ? (
                <select className="input text-sm" value={p.handle ?? ''} onChange={(e) => put({ ...p, handle: e.target.value || undefined })}>
                  <option value="" className="bg-krypt-panel">
                    Pick the Page it posts as
                  </option>
                  {[...new Set([...(pages ?? []), ...(p.handle ? [p.handle] : [])])].map((x) => (
                    <option key={x} value={x} className="bg-krypt-panel">
                      {x}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={cls('input', n !== 'facebook' && 'font-mono')} placeholder={n === 'facebook' ? 'Your Page' : n === 'threads' ? 'Same as Instagram' : 'Same as Instagram, or @handle'} value={p.handle ?? ''} onChange={(e) => put({ ...p, handle: e.target.value || undefined })} />
              )}
            </div>
            {more && (
              <>
                <div>
                  <label className="label">{L} warm-up day 1</label>
                  <input type="date" className="input font-mono text-xs" value={p.warmupStart ?? ''} onChange={(e) => put({ ...p, warmupStart: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <Toggle on={!!p.watchOnly} onChange={(v) => put({ ...p, watchOnly: v })} label={`Watch only on ${L}`} />
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const bare = (h?: string): string => (h ?? '').trim().replace(/^@+/, '');

/**
 * Read a Chrome profile's sign-ins (the same read the setup wizard does) and fill the account form from them:
 * every platform signed in there is listed and ticked, the user unticks what they don't want, then "Use these".
 */
function FromChrome({ f, setF, open, setOpen, onScan }: { f: AccountInput; setF: (fn: (x: AccountInput) => AccountInput) => void; open: boolean; setOpen: (v: boolean) => void; onScan: (s: ProfileScan) => void }) {
  const chrome = useApp((s) => s.chrome);
  const toast = useApp((s) => s.toast);
  const madeFor = useApp((s) => s.profiles.find((p) => p.active)?.chromeDir);
  const locals = chrome?.local ?? [];
  const [dir, setDir] = useState(f.chromeDir || madeFor || (locals.length === 1 ? locals[0].dir : '') || locals.find((x) => x.connected)?.dir || '');
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [scan, setScan] = useState<ProfileScan | null>(null);
  const [picked, setPicked] = useState<Set<Site>>(new Set());

  const read = async (): Promise<void> => {
    setErr('');
    setScan(null);
    const now = (): ChromeStatus | null | undefined => useApp.getState().chrome;
    const row = now()?.local.find((x) => x.dir === dir);
    if (dir && row && !row.hasExtension) return setErr('The Krypt Marketo extension is not added in that Chrome profile yet: the Chrome card on this page has the steps.');
    if (!dir && (now()?.profiles.length ?? 0) !== 1) return setErr('Pick the Chrome profile first.');
    // A closed Chrome profile is opened, and its extension waited for (as Multi run does).
    if (dir && !extensionCheck(now(), dir).connected) {
      setBusy('Opening that Chrome profile…');
      await window.marketo.chrome.open(dir);
      for (const until = Date.now() + 40_000; Date.now() < until && !extensionCheck(now(), dir).connected; ) await sleep(800);
      if (!extensionCheck(now(), dir).connected) {
        setBusy('');
        return setErr('Chrome opened it, but its extension did not connect. Reload the extension there (chrome://extensions), then try again.');
      }
      await sleep(1500);
    }
    setBusy('Reading who you are signed in as on each platform. Chrome opens each one for a moment and closes it again.');
    const r = await window.marketo.chrome.scan(dir);
    setBusy('');
    if (!r.ok || !r.data) return setErr(r.message ?? 'Could not read the Chrome profile.');
    setScan(r.data);
    onScan(r.data);
    setPicked(new Set(SITES.filter((s) => r.data!.sites[s]?.signedIn)));
  };

  const use = (): void => {
    if (!scan) return;
    const s = scan.sites;
    const ig = picked.has('instagram');
    const igName = bare(s.instagram?.handle);
    if (ig && !igName && !bare(f.handle)) toast('warn', 'Instagram is signed in, but its handle could not be read: type it in the Instagram handle box.');
    setF((x) => {
      const net = (n: Network): NetProfile | undefined => {
        const old = x[n];
        if (!picked.has(n)) return old ? { ...old, enabled: false } : undefined;
        // Facebook: the Page, when exactly one was found (more than one: picked in the Facebook section).
        const pages = s.facebook?.pages ?? [];
        const h = n === 'facebook' ? (pages.length === 1 && !old?.handle ? pages[0] : undefined) : bare(s[n]?.handle);
        return { warmupStart: localDate(), ...(old ?? {}), enabled: true, ...(h ? { handle: h } : {}) };
      };
      const other = (['x', 'tiktok', 'threads', 'pinterest'] as Network[]).filter((n) => picked.has(n)).map((n) => bare(s[n]?.handle)).find(Boolean);
      const handle = ig && igName ? `@${igName}` : bare(x.handle) ? x.handle! : other ? `@${other}` : x.handle ?? '';
      return {
        ...x,
        handle,
        browser: 'chrome',
        chromeDir: dir,
        instagram: ig,
        youtube: picked.has('youtube') ? { ...(x.youtube ?? {}), enabled: true } : x.youtube ? { ...x.youtube, enabled: false } : undefined,
        x: net('x'),
        tiktok: net('tiktok'),
        facebook: net('facebook'),
        threads: net('threads'),
        pinterest: net('pinterest'),
      };
    });
    toast('ok', `Filled in: ${[...picked].map((p) => SITE_LABEL[p]).join(', ') || 'no platforms'}. Check the form, then Save.`);
    setOpen(false);
  };

  if (!open)
    return (
      <GhostButton small onClick={() => setOpen(true)}>
        <Chrome className="h-3.5 w-3.5" /> {f.chromeDir ? 'Read its Chrome profile again' : 'Fill in from a Chrome profile'}
      </GhostButton>
    );
  const ytChannels = scan?.sites.youtube?.channels?.length ?? 0;
  return (
    <div className="space-y-2.5 rounded-xl border border-krypt-purple/30 bg-krypt-purple/[0.06] p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Chrome className="h-4 w-4" /> From your Chrome
      </div>
      <p className="text-[11px] text-krypt-muted">Pick the Chrome profile the accounts are signed in to. Marketo lists every platform signed in there; tick the ones this account should run.</p>
      <div className="flex gap-2">
        <select value={dir} onChange={(e) => (setDir(e.target.value), setScan(null))} className="input min-w-0 flex-1 py-1.5 text-xs">
          {locals.length !== 1 && (
            <option value="" className="bg-krypt-panel">
              Pick a Chrome profile
            </option>
          )}
          {locals.map((x) => (
            <option key={x.dir} value={x.dir} className="bg-krypt-panel">
              {chromeLabel(x)}
              {x.hasExtension ? '' : ' (no extension yet)'}
            </option>
          ))}
        </select>
        <GhostButton small disabled={!!busy || (!dir && locals.length !== 1)} onClick={() => void read()}>
          <RefreshCw className={cls('h-3.5 w-3.5', busy && 'animate-spin')} /> {scan ? 'Read again' : 'Read sign-ins'}
        </GhostButton>
      </div>
      {busy && <p className="text-[11px] text-krypt-muted">{busy}</p>}
      {err && <p className="text-[11px] text-amber-300">{err}</p>}
      {scan && (
        <>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {SITES.map((s) => {
              const r = scan.sites[s];
              const on = picked.has(s);
              const pages = r?.pages ?? [];
              const what = !r?.signedIn
                ? 'Not signed in'
                : s === 'youtube'
                  ? ytChannels ? `${ytChannels} channel${ytChannels === 1 ? '' : 's'}` : 'Signed in'
                  : s === 'facebook'
                    ? pages.length === 1 ? pages[0] : pages.length ? `${pages.length} Pages` : 'Signed in'
                    : r.handle ? `@${bare(r.handle)}` : 'Signed in';
              return (
                <button
                  key={s}
                  onClick={() =>
                    setPicked((v) => {
                      const n = new Set(v);
                      if (n.has(s)) n.delete(s);
                      else n.add(s);
                      return n;
                    })
                  }
                  className={cls('flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition', on ? 'border-krypt-purple/50 bg-krypt-purple/15' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}
                >
                  <span className={cls('flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border', on ? 'border-krypt-purple bg-krypt-purple' : 'border-white/25')}>{on && <Check className="h-2.5 w-2.5 text-white" />}</span>
                  <span className="w-20 shrink-0 text-white/85">{SITE_LABEL[s]}</span>
                  <span className={cls('min-w-0 truncate font-mono', r?.signedIn ? 'text-emerald-300' : 'text-krypt-muted')}>{what}</span>
                </button>
              );
            })}
          </div>
          {picked.has('facebook') && (scan.sites.facebook?.pages?.length ?? 0) !== 1 && (
            <p className="text-[11px] text-krypt-muted">{scan.sites.facebook?.pages?.length ? `Facebook: ${scan.sites.facebook.pages.length} Pages found. Pick the one it posts as in the Facebook section below.` : 'Facebook: no Page could be read. Type the Page it posts as in the Facebook section below.'}</p>
          )}
          {picked.has('youtube') && ytChannels > 1 && <p className="text-[11px] text-krypt-muted">YouTube: this sign-in owns {ytChannels} channels. Pick this account's in the YouTube section below, or the first one Studio shows is used.</p>}
          {[...picked].some((s) => !scan.sites[s]?.signedIn) && <p className="text-[11px] text-amber-300">Some ticked platforms are not signed in there yet: sign in to them in that Chrome profile before a run.</p>}
          <div className="flex gap-2">
            <PrimaryButton onClick={use} disabled={!picked.size}>
              Use these
            </PrimaryButton>
            <GhostButton onClick={() => setOpen(false)}>Fill in by hand</GhostButton>
          </div>
        </>
      )}
    </div>
  );
}

/** The recommended daily numbers on a platform for the account in the form (today's warm-up phase), whatever limits it has of its own. */
function recommendedFor(f: AccountInput, site: Site, sessions: Session[]): Record<LimitKey, number> {
  const plan = planFor({ ...(f as IgAccount), handle: f.handle ?? '', limits: undefined }, sessions, undefined, site);
  return { ...plan.recommended, gap: POST_GAP_MIN[site] };
}

const SHORT_LABEL = (k: LimitKey, site: Site): string => (k === 'gap' ? 'post gap (min)' : k === 'minutes' ? 'scroll (min)' : quotaLabel(k, site));

/**
 * The account's daily limits. Each one starts at the recommended number; the user can put their own on any of them,
 * as high or as low as they like, and the hub then holds the account to that instead.
 */
function LimitsEditor({ f, set }: { f: AccountInput; set: <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => void }) {
  const sessions = useApp((s) => s.db!.sessions);
  const sites = SITES.filter((s) => siteOn(f as IgAccount, s));
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Site>('instagram');
  if (!sites.length) return null;
  const site = sites.includes(picked) ? picked : sites[0];
  const own = f.limits?.[site] ?? {};
  const rec = recommendedFor(f, site, sessions);
  const custom = sites.filter((s) => Object.keys(f.limits?.[s] ?? {}).length > 0);
  const put = (k: LimitKey, raw: string): void => {
    const mine = { ...own };
    const n = cleanLimit(raw);
    if (n === undefined) delete mine[k];
    else mine[k] = n;
    set('limits', { ...(f.limits ?? {}), [site]: mine });
  };
  // A shorter gap than recommended is "more" too.
  const over = limitKeys(site).filter((k) => own[k] !== undefined && (k === 'gap' ? own[k]! < rec[k] : own[k]! > rec[k]));
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left" aria-expanded={open}>
        <span className="label !mb-0 flex-1">Daily limits</span>
        <span className={cls('text-[11px]', custom.length ? 'text-amber-300' : 'text-krypt-muted')}>{custom.length ? `Your own on ${custom.map((s) => SITE_LABEL[s]).join(', ')}` : 'All at soft caps'}</span>
        <ChevronDown className={cls('h-4 w-4 shrink-0 text-krypt-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] leading-relaxed text-krypt-muted">
            Marketo holds each platform to these numbers a day. The grey number in a box is Krypt's soft cap for today (it rises by itself while a new account warms up). Type your own in any box and that is used instead, as high or as low as you like. Empty means the soft cap.
          </p>
          <select className="input py-2 text-xs" value={site} onChange={(e) => setPicked(e.target.value as Site)}>
            {sites.map((s) => (
              <option key={s} value={s} className="bg-krypt-panel">
                {SITE_LABEL[s]}
                {Object.keys(f.limits?.[s] ?? {}).length ? ' (your own)' : ''}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-4 gap-2">
            {limitKeys(site).map((k) => (
              <div key={k}>
                <div className="mb-1 truncate text-[11px] text-krypt-muted" title={`${limitLabel(k, site)}: soft cap ${rec[k]}`}>
                  {SHORT_LABEL(k, site)}
                </div>
                <input type="number" min={0} className={cls('input font-mono text-xs', own[k] !== undefined && 'border-amber-400/40')} placeholder={String(rec[k])} value={own[k] ?? ''} onChange={(e) => put(k, e.target.value)} />
              </div>
            ))}
          </div>
          {over.length > 0 && (
            <p className="text-[11px] leading-relaxed text-amber-300">
              Over Krypt's soft cap: {over.map((k) => `${limitLabel(k, site)} (soft cap ${rec[k]})`).join(', ')}. Over a soft cap, {SITE_LABEL[site]} can flag, limit or lock the account, a new one most of all. It is your call.
            </p>
          )}
          {Object.keys(own).length > 0 && (
            <button type="button" onClick={() => set('limits', { ...(f.limits ?? {}), [site]: {} })} className="text-[11px] text-krypt-muted underline-offset-2 hover:text-white hover:underline">
              Back to soft caps on {SITE_LABEL[site]}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const SETUP: Array<[keyof IgAccount['setup'], string]> = [
  ['avatar', 'Profile photo'],
  ['bio', 'Bio'],
  ['link', 'Link in bio'],
  ['firstPost', 'First post'],
];

/** The same value, whatever order its keys are in. */
const sameValue = (a: unknown, b: unknown): boolean => {
  const sorted = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sorted((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
};
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Only what the form changed, laid over the account as it is now. A run keeps writing to the account while the form
 * is open (the Krypt follow and repost records, the day's Shorts uploads, X / TikTok user ids): a field the user did
 * not touch is left out (the save keeps it as it is), and in a section they did change (YouTube, X ...) only the
 * entries they changed replace the current ones.
 */
function onlyChanged(input: AccountInput, opened: IgAccount, current: IgAccount | undefined): AccountInput {
  const out: Record<string, unknown> = {};
  const was = opened as unknown as Record<string, unknown>;
  const cur = (current ?? opened) as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k === 'id' || k === 'handle') {
      out[k] = v;
      continue;
    }
    if (sameValue(v, was[k])) continue;
    if (plain(v) && plain(was[k]) && plain(cur[k])) {
      const merged: Record<string, unknown> = { ...(cur[k] as Record<string, unknown>) };
      const before = was[k] as Record<string, unknown>;
      for (const sk of new Set([...Object.keys(v), ...Object.keys(before)])) if (!sameValue(v[sk], before[sk])) merged[sk] = v[sk];
      out[k] = merged;
    } else out[k] = v;
  }
  return out as AccountInput;
}

function Editor({ account, onDone }: { account: IgAccount | null; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const niche = useApp((s) => s.db!.brand.niche);
  // Accounts always run in the user's Chrome (the built-in browser was removed).
  const [f, setF] = useState<AccountInput>(() => (account ? { ...account } : { handle: '', browser: 'chrome', status: 'warming', createdOn: localDate(), warmupStart: localDate(), niche }));
  const setup = { avatar: false, bio: false, link: false, firstPost: false, ...(account?.setup ?? {}), ...(f.setup ?? {}) };
  const set = <K extends keyof AccountInput>(k: K, v: AccountInput[K]): void => setF((x) => ({ ...x, [k]: v }));
  const sessions = useApp((s) => s.db!.sessions);
  const chromeNow = useApp((s) => s.chrome);
  const locals = chromeNow?.local ?? [];
  /** New accounts: warm up for a week (true) or already warmed up. */
  const [fresh, setFresh] = useState(true);
  const [more, setMore] = useState(false);
  /** The From your Chrome panel: open for a new account. */
  const [fromChrome, setFromChrome] = useState(!account);
  /** What the Chrome profile scan found: Facebook Pages and YouTube channels to pick from. */
  const [scan, setScan] = useState<ProfileScan | null>(null);

  // A posting target the user just typed that is past the platform's post limit: saving raises the limit to match, and says so first.
  const raised = SITES.filter((s) => siteOn(f as IgAccount, s))
    .map((s) => {
      const target = f.targets?.[s];
      const limit = f.limits?.[s]?.posts ?? recommendedFor(f, s, sessions).posts;
      const gap = f.limits?.[s]?.gap ?? POST_GAP_MIN[s];
      return { site: s, target: target ?? 0, limit, gap, own: f.limits?.[s]?.posts !== undefined, changed: target !== undefined && target !== account?.targets?.[s] };
    })
    .filter((x) => x.changed && x.target > x.limit);

  const save = async (): Promise<void> => {
    const limits = { ...(f.limits ?? {}) };
    for (const x of raised) limits[x.site] = { ...(limits[x.site] ?? {}), posts: x.target };
    // A new account: the warm-up choice sets day 1 for every platform turned on (a month back = already in its Active phase).
    const start = !account ? (fresh ? localDate() : localDate(new Date(Date.now() - 30 * 86_400_000))) : undefined;
    // X / TikTok handles are stored as "@name"; a changed handle forgets the user id saved for the old one.
    const nets: Partial<Record<Network, NetProfile>> = {};
    for (const n of NETWORKS) {
      const p = f[n];
      if (!p) continue;
      // A Facebook Page goes by its name, kept as typed.
      const raw = n === 'facebook' ? p.handle?.trim() : p.handle?.trim().replace(/^@+/, '').toLowerCase();
      const h = !raw ? undefined : n === 'facebook' ? raw : `@${raw}`;
      nets[n] = { ...p, handle: h, ...(start && p.enabled ? { warmupStart: start } : {}), ...(h !== account?.[n]?.handle ? { userId: undefined } : {}) };
    }
    // A channel picked with the channel picker while this form was open is saved already: keep it unless the form changed it.
    const now = account ? useApp.getState().db?.igAccounts.find((x) => x.id === account.id) : undefined;
    const ytKept =
      f.youtube && (f.youtube.channelId ?? '') === (account?.youtube?.channelId ?? '') && now?.youtube?.channelId
        ? { channelId: now.youtube.channelId, channelName: now.youtube.channelName, channelHandle: now.youtube.channelHandle }
        : {};
    const youtube = f.youtube ? { ...f.youtube, ...ytKept, ...(start && f.youtube.enabled ? { warmupStart: fresh ? start : undefined } : {}) } : undefined;
    const input: AccountInput = {
      ...f,
      ...nets,
      youtube,
      ...(start ? { status: fresh ? ('warming' as const) : ('active' as const), warmupStart: start } : {}),
      ...(f.limits || raised.length ? { limits } : {}),
      ...(account ? { id: account.id } : {}),
    };
    const r = await window.marketo.db.saveAccount(account ? onlyChanged(input, account, now) : input);
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    toast('ok', account ? `${r.data!.handle} saved.` : `${r.data!.handle} added. It runs in your Chrome.`);
    onDone();
  };
  const remove = async (): Promise<void> => {
    if (!account) return;
    const r = await window.marketo.db.deleteAccount(account.id);
    if (!r.ok) return toast('error', r.message ?? 'Could not delete.');
    toast('ok', `${account.handle} removed and signed out here. Its sessions stay in Research.`);
    onDone();
  };

  return (
    <Card className="space-y-3">
      <div className="text-sm font-semibold">{account ? `Edit ${account.handle}` : 'New account'}</div>
      <FromChrome f={f} setF={setF} open={fromChrome} setOpen={setFromChrome} onScan={setScan} />
      {/* Hidden while the panel above is open: it has its own Chrome profile picker. */}
      {locals.length > 0 && !fromChrome && (
        <div>
          <label className="label">Chrome profile</label>
          <select className="input py-2 text-sm" value={f.chromeDir ?? ''} onChange={(e) => setF((x) => ({ ...x, chromeDir: e.target.value, browser: 'chrome' }))}>
            <option value="" className="bg-krypt-panel">
              Automatic (the one signed in as this account)
            </option>
            {locals.map((x) => (
              <option key={x.dir} value={x.dir} className="bg-krypt-panel">
                {chromeLabel(x)}
                {x.hasExtension ? '' : ' (no extension yet)'}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-krypt-muted">Where this account is signed in. Every platform below runs in that Chrome profile, so they all see one device.</p>
        </div>
      )}
      <div>
        <Toggle on={f.instagram !== false} onChange={(v) => set('instagram', v)} label="Run Instagram" />
        <p className="mt-1 text-[11px] text-krypt-muted">Off for an account that doesn't use Instagram: turn its other platforms on below.</p>
      </div>
      <div>
        <label className="label">{f.instagram !== false ? 'Instagram handle' : 'Account name'}</label>
        <input className="input font-mono" placeholder={f.instagram !== false ? '@handle' : 'e.g. @mybrand'} value={f.handle ?? ''} onChange={(e) => set('handle', e.target.value)} />
      </div>
      <div>
        <label className="label">Niche</label>
        <input className="input" value={f.niche ?? ''} onChange={(e) => set('niche', e.target.value)} placeholder="What this account watches and posts about" />
      </div>
      {account ? (
        <div>
          <label className="label">Status</label>
          <select className="input" value={f.status} onChange={(e) => set('status', e.target.value as AccountStatus)}>
            {(['warming', 'active', 'paused'] as const).map((s) => (
              <option key={s} value={s} className="bg-krypt-panel">
                {s}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div>
          <label className="label">Warm-up</label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                [true, 'Warm up for 1 week', 'New accounts: watch and read first, then a few likes, follows and comments.'],
                [false, 'Already warmed up', 'Accounts used for a while: normal daily limits from today.'],
              ] as const
            ).map(([v, title, about]) => (
              <button
                key={title}
                onClick={() => setFresh(v)}
                className={cls('rounded-xl border p-2.5 text-left transition', fresh === v ? 'border-krypt-purple/60 bg-krypt-purple/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}
              >
                <div className="text-xs font-semibold text-white">{title}</div>
                <p className="mt-0.5 text-[11px] leading-snug text-krypt-muted">{about}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      <NetSettings f={f} set={set} n="x" more={more} />
      <NetSettings f={f} set={set} n="tiktok" more={more} />
      <div>
        <Toggle on={!!f.youtube?.enabled} onChange={(v) => set('youtube', { ...(f.youtube ?? {}), enabled: v })} label="Run YouTube Shorts" />
        {f.youtube?.enabled && (
          <>
            <p className="mt-1 text-[11px] text-krypt-muted">
              AIs upload rendered reels as Shorts through YouTube Studio, in this account's Chrome profile. Publishing follows your approval setting. {YT_UPLOADS_PER_DAY} a day is the recommended limit.
            </p>
            <YtChannelField f={f} set={set} accountId={account?.id} channels={scan?.sites.youtube?.channels} />
          </>
        )}
      </div>
      <NetSettings f={f} set={set} n="facebook" more={more} pages={scan?.sites.facebook?.pages} />
      <NetSettings f={f} set={set} n="threads" more={more} />
      <NetSettings f={f} set={set} n="pinterest" more={more} />
      <button onClick={() => setMore((v) => !v)} className="flex w-full items-center gap-2 border-t border-white/5 pt-3 text-left text-xs font-semibold text-white/80 hover:text-white">
        <ChevronDown className={cls('h-3.5 w-3.5 shrink-0 transition', more && 'rotate-180')} /> <span className="shrink-0 whitespace-nowrap">More settings</span>
        <span className="min-w-0 truncate font-normal text-krypt-muted">limits, dates, notes</span>
      </button>
      {more && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Created</label>
              <input type="date" className="input font-mono text-xs" value={f.createdOn ?? ''} onChange={(e) => set('createdOn', e.target.value)} />
            </div>
            {account && (
              <div>
                <label className="label">Warm-up day 1</label>
                <input type="date" className="input font-mono text-xs" value={f.warmupStart ?? ''} onChange={(e) => set('warmupStart', e.target.value)} />
              </div>
            )}
          </div>
          <div>
            <Toggle on={!!f.watchOnly} onChange={(v) => set('watchOnly', v)} label="Watch only on Instagram" />
            <p className="mt-1 text-[11px] text-krypt-muted">AIs can scroll and watch but the browser refuses likes, saves, follows, comments and posts. Turn it on while Instagram restricts the account. YouTube uploads are not affected.</p>
          </div>
          <div>
            <label className="label">Posts a day</label>
            <div className="grid grid-cols-4 gap-2">
              {SITES.filter((s) => siteOn(f as IgAccount, s)).map((s) => (
                <div key={s}>
                  <div className="mb-1 truncate text-[11px] text-krypt-muted">{SITE_LABEL[s]}</div>
                  <input
                    type="number"
                    min={0}
                    className="input font-mono text-xs"
                    value={f.targets?.[s] ?? DEFAULT_TARGETS[s]}
                    onChange={(e) => set('targets', { ...(f.targets ?? {}), [s]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                  />
                </div>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-krypt-muted">What your AI aims to post here each day. It stops at the day's post limit: the recommended one (it rises while a new account warms up) or your own, under Daily limits.</p>
          </div>
          <LimitsEditor f={f} set={set} />
          <div>
            <label className="label">Profile setup</label>
            <div className="grid grid-cols-2 gap-2">
              {SETUP.map(([k, label]) => (
                <Toggle key={k} on={setup[k]} onChange={(v) => set('setup', { ...setup, [k]: v })} label={label} />
              ))}
            </div>
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input min-h-[60px]" value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} placeholder="Sign-up email, phone used, anything worth remembering (no passwords)" />
          </div>
        </>
      )}
      {raised.map((x) => (
        <p key={x.site} className="text-[11px] leading-relaxed text-amber-300">
          {SITE_LABEL[x.site]}: {x.target} a day is past {x.own ? 'your own' : 'the recommended'} post limit of {x.limit} for today. Saving sets your {SITE_LABEL[x.site]} post limit to {x.target} as well. Platforms can limit or lock an account that posts fast; it is your call.
          {(x.target - 1) * x.gap > 16 * 60 ? ` At ${x.gap} minutes between posts, ${x.target} a day does not fit: shorten the post gap under Daily limits.` : ''}
        </p>
      ))}
      <div className="flex gap-2 pt-1">
        <PrimaryButton onClick={() => void save()} className="flex-1">
          Save
        </PrimaryButton>
        <GhostButton onClick={onDone}>Cancel</GhostButton>
        {account && (
          <GhostButton destructive onClick={() => void remove()} className="px-3">
            <Trash2 className="h-4 w-4" />
          </GhostButton>
        )}
      </div>
    </Card>
  );
}

function AccountCard({ a, onEdit }: { a: IgAccount; onEdit: () => void }) {
  const db = useApp((s) => s.db)!;
  const st = useApp((s) => s.browser.find((x) => x.accountId === a.id));
  const go = useApp((s) => s.go);
  const toast = useApp((s) => s.toast);
  const selectAccount = useApp((s) => s.selectAccount);
  const active = sameHandle(db.settings.handle, a.handle);
  const plan = planFor(a, db.sessions);
  const snap = [...db.accounts].reverse().find((s) => (s.site ?? 'instagram') === 'instagram' && sameHandle(s.handle, a.handle));
  const sessions = db.sessions.filter((s) => sameHandle(s.handle, a.handle));
  const minutes = Math.round(sessions.reduce((n, s) => n + s.minutes, 0));
  const setupDone = Object.values(a.setup).filter(Boolean).length;
  const forgetChannel = async (): Promise<void> => {
    const r = await window.marketo.db.saveAccount({ id: a.id, youtube: { enabled: true, uploads: a.youtube?.uploads } });
    toast(r.ok ? 'ok' : 'error', r.ok ? "Channel forgotten. The next channel YouTube Studio shows becomes this account's." : r.message ?? 'Could not save.');
  };
  return (
    <Card className={cls('space-y-4', active && 'border-krypt-purple/50 shadow-krypt-glow')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-lg font-semibold">{a.handle}</span>
            <AccountStatusChip status={a.status} />
            {a.watchOnly && (
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-sky-200">
                <Eye className="h-3 w-3" /> watch only
              </span>
            )}
            {active && <span className="text-[10px] font-semibold uppercase tracking-wider text-krypt-purple">Active</span>}
          </div>
          {a.browser === 'chrome' && !st?.connected && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-amber-300">
              <CircleAlert className="h-3.5 w-3.5 shrink-0" /> Chrome is not connected: open the Chrome profile this account is signed in to
            </div>
          )}
        </div>
        <button onClick={onEdit} className="text-krypt-muted hover:text-white" title="Edit">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {accountSites(a, st, db).map((s) => (
          <PlatformTile key={s.site} s={s} accountId={a.id} compact />
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 font-mono">
        {[
          ['Day', a.status === 'warming' ? String(plan.day) : '—', a.status === 'warming' ? plan.phase.name : a.status],
          ['Followers', snap ? fmtNum(snap.followers) : '—', snap ? `${fmtNum(snap.following)} following` : 'no snapshot'],
          ['Sessions', String(sessions.length), `${minutes} min`],
          ['Setup', `${setupDone}/4`, setupDone === 4 ? 'done' : 'open'],
        ].map(([k, v, sub]) => (
          <div key={k} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
            <div className="text-[10px] uppercase tracking-wider text-krypt-muted">{k}</div>
            <div className="text-lg text-white">{v}</div>
            <div className="truncate text-[10px] text-krypt-muted">{sub}</div>
          </div>
        ))}
      </div>
      {a.niche && <div className="truncate text-xs text-krypt-muted">{a.niche}</div>}
      <div className="flex flex-wrap gap-2">
        <GhostButton
          small
          onClick={() => {
            selectAccount(a.id);
            go('warming');
          }}
        >
          <Flame className="h-3.5 w-3.5" /> Warm-up plan
        </GhostButton>
        {a.youtube?.enabled && a.youtube.channelId && (
          <span className="inline-flex items-center gap-1 self-center truncate text-[11px] text-krypt-muted" title={a.youtube.channelId}>
            YouTube: {a.youtube.channelName ?? (a.youtube.channelHandle ? '@' + a.youtube.channelHandle : a.youtube.channelId)}
          </span>
        )}
        {a.youtube?.enabled && a.youtube.channelId && (
          <GhostButton small onClick={() => void forgetChannel()}>
            <Unlink className="h-3.5 w-3.5" /> Forget channel
          </GhostButton>
        )}
        {!active && (
          <GhostButton small onClick={() => void window.marketo.db.updateSettings({ handle: a.handle })}>
            <Star className="h-3.5 w-3.5" /> Make active
          </GhostButton>
        )}
      </div>
    </Card>
  );
}

/** The Chrome extension: what is connected, and how to install it. */
function ChromeCard() {
  const chrome = useApp((s) => s.chrome);
  const accounts = useApp((s) => s.db!.igAccounts);
  const profiles = chrome?.profiles ?? [];
  // Once Chrome is connected and current the steps fold away; they come back for adding another Chrome profile.
  const [steps, setSteps] = useState(false);
  /** The Chrome profile's own name when the hub can tell which one it is, else the account signed in there. */
  const nameOf = (p: (typeof profiles)[number]): string => {
    const local = p.dir ? chrome?.local.find((x) => x.dir === p.dir) : undefined;
    if (local) return chromeLabel(local);
    const a = accounts.find((x) => (p.userId && x.igUserId === p.userId) || (p.me && sameHandle(x.handle, p.me)));
    return a ? a.handle : p.me ? `@${p.me}` : 'a Chrome profile';
  };
  /** Every platform signed in there. */
  const signedIn = (p: (typeof profiles)[number]): Site[] =>
    SITES.filter((s) => (s === 'instagram' ? p.loggedIn : s === 'youtube' ? p.ytLoggedIn : (p.nets?.[s as Network] ?? (s === 'x' ? p.xLoggedIn : s === 'tiktok' ? p.ttLoggedIn : false))));
  return (
    <Card className="space-y-2 text-sm text-white/80">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Chrome className="h-4 w-4" /> Use your own Chrome
      </div>
      <p>Each account stays in the Chrome profile it already lives in, so every platform sees one device. Your AI works in a tab there, under the same limits and approval setting.</p>
      {profiles.length > 0 ? (
        <div className="space-y-2">
          {profiles.map((p) => {
            const on = signedIn(p);
            const used = p.dir ? accounts.filter((a) => a.chromeDir === p.dir).map((a) => a.handle) : [];
            return (
              <div key={p.id} className="text-xs">
                <div className={cls('flex items-center gap-1.5', on.length ? 'text-emerald-300' : 'text-amber-300')}>
                  {on.length ? <CircleCheck className="h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 truncate">{nameOf(p)}</span>
                  {p.stopped && <span className="shrink-0 text-amber-300">· paused by you in Chrome</span>}
                </div>
                <div className="ml-5 text-krypt-muted">
                  {on.length ? `Signed in: ${on.map((s) => SITE_LABEL[s]).join(', ')}` : 'Connected, signed in nowhere yet'}
                  {used.length ? ` · used by ${used.join(', ')}` : ''}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-amber-300">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" /> No Chrome profile connected
        </div>
      )}
      <p className="text-xs text-krypt-muted">More than one Chrome profile? Each account picks its own in its form (Chrome profile), and Add account can fill everything in from one.</p>
      {extensionCheck(chrome).ready && !steps ? (
        <GhostButton small onClick={() => setSteps(true)}>
          Add it to another Chrome profile
        </GhostButton>
      ) : (
        <div className="border-t border-white/5 pt-3">
          <div className="mb-3 font-semibold text-white">Add the extension to Chrome</div>
          <ExtensionSetup many />
        </div>
      )}
    </Card>
  );
}

export default function Accounts() {
  const db = useApp((s) => s.db)!;
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const editAccount = editing?.id ? db.igAccounts.find((a) => a.id === editing.id) ?? null : null;
  // Long lists 50 at a time (Setup > Performance): a handle search once there are more than 50 accounts.
  const [q, setQ] = useState('');
  const pageOn = usePerf().pageLists;
  const searchOn = pageOn && db.igAccounts.length > PAGE_SIZE;
  const needle = searchOn ? q.trim().replace(/^@/, '').toLowerCase() : '';
  const accounts = needle ? db.igAccounts.filter((a) => a.handle.toLowerCase().includes(needle)) : db.igAccounts;
  const page = useShowMore(accounts, needle);

  return (
    <Page
      title="Accounts"
      subtitle="Every account you run, on the platforms you picked. Each one is signed in in your own Chrome, one Chrome profile per set of accounts."
      actions={
        <PrimaryButton onClick={() => setEditing({ id: null })}>
          <Plus className="h-4 w-4" /> Add account
        </PrimaryButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div>
          {searchOn && <input className="input mb-4" placeholder="Search by handle" value={q} onChange={(e) => setQ(e.target.value)} />}
          {db.igAccounts.length === 0 ? (
            <Empty icon={<Users className="h-6 w-6" />} title="No accounts yet">
              Add an account, pick its platforms (Instagram, TikTok, YouTube Shorts, X) and sign it in in your Chrome. Your AI uses it there.
            </Empty>
          ) : accounts.length === 0 ? (
            <div className="py-6 text-sm text-krypt-muted">No account with that handle.</div>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              {page.shown.map((a) => (
                <AccountCard key={a.id} a={a} onEdit={() => setEditing({ id: a.id })} />
              ))}
              {page.more && <div className="2xl:col-span-2">{page.more}</div>}
            </div>
          )}
        </div>
        <div className="space-y-6">
          {editing && <Editor key={editing.id ?? 'new'} account={editAccount} onDone={() => setEditing(null)} />}
          <Card className="space-y-2">
            <Toggle on={!!db.settings.askApproval} onChange={(v) => void window.marketo.db.updateSettings({ askApproval: v })} label="Ask me before the AI posts" />
            <p className="text-xs text-krypt-muted">
              {db.settings.askApproval
                ? 'Posts, comments, replies, messages, unfollows and reposts wait at the top of the hub for your Approve.'
                : 'Off: posts, comments, replies, messages, unfollows and reposts go through right away, still inside each account\'s daily limits.'}{' '}
              Deletes, blocks, reports and account settings always ask.
            </p>
            <PerThread />
          </Card>
          <Card className="space-y-2 text-sm text-white/80">
            <div className="text-sm font-semibold text-white">How accounts work here</div>
            <p>
              <span className="text-white">1.</span> Add the account, pick its platforms and sign in yourself, as usual, in your Chrome. Marketo never sees or stores your passwords.
            </p>
            <p>
              <span className="text-white">2.</span> Your AI reads and clicks in that same window or tab. You can watch it, and take over at any time.
            </p>
            <p>
              <span className="text-white">3.</span> Likes, saves and follows stop at the day's limits. Comments, posts and messages go through right away, or wait for your Approve if you switch that on above. Deletes and profile changes always ask.
            </p>
            <p className="text-xs text-krypt-muted">Keep each platform's language set to English: the limits and posting steps read their button labels.</p>
          </Card>
          <ChromeCard />
        </div>
      </div>
    </Page>
  );
}

/** The per-thread cap (settings.perThread): replies an account sends into one thread before it leaves it. */
function PerThread() {
  const db = useApp((s) => s.db);
  const toast = useApp((s) => s.toast);
  const cur = db?.settings.perThread;
  const set = (raw: string): void => {
    const n = Math.floor(Number(raw));
    if (raw.trim() && (!Number.isFinite(n) || n < 1)) return;
    void window.marketo.db.updateSettings({ perThread: raw.trim() ? n : undefined });
    if (n > 2) toast('warn', `${n} per thread is over the recommended 2. Long back-and-forths are how AI accounts end up replying to each other, and they can get an account flagged. Your call.`);
  };
  return (
    <div className="flex items-center gap-3 border-t border-white/10 pt-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white">Replies per thread</div>
        <p className="text-xs text-krypt-muted">The most comments, replies or DMs an account sends into one post, X or Threads conversation, or chat. Then the AI moves on. Recommended 2.</p>
      </div>
      <input type="number" min={1} className={cls('input w-20 font-mono text-sm', cur !== undefined && cur > 2 && 'border-amber-400/40')} placeholder="2" value={cur ?? ''} onChange={(e) => set(e.target.value)} />
    </div>
  );
}

/** Which YouTube channel the account posts Shorts to: one Google sign-in can own many channels. */
function YtChannelField({ f, set, accountId, channels }: { f: AccountInput; set: <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => void; /** A saved account: the wizard's channel picker reads its Chrome profile's channels. */ accountId?: string; /** A new account: the channels the Chrome profile scan found. */ channels?: YtChannelOption[] }) {
  const toast = useApp((s) => s.toast);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState(false);
  const y = f.youtube!;
  const listed = (channels ?? []).filter((c) => c.handle);
  const look = async (what = text): Promise<void> => {
    if (!what.trim()) return;
    setBusy(true);
    const r = await window.marketo.app.resolveYtChannel(what);
    setBusy(false);
    if (!r.ok || !r.data) {
      toast('error', r.message ?? 'Could not find that channel.');
      return;
    }
    set('youtube', { ...y, enabled: true, channelId: r.data.id, channelName: r.data.name, channelHandle: r.data.handle });
    setText('');
    toast('ok', `Channel set: ${r.data.name ?? r.data.id}. Save the account to keep it.`);
  };
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <span className="text-krypt-muted">Channel</span>
        <span className="min-w-0 flex-1 truncate font-mono text-white/85" title={y.channelId}>
          {y.channelId ? `${y.channelName ?? (y.channelHandle ? '@' + y.channelHandle : '')} ${y.channelName || y.channelHandle ? '· ' : ''}${y.channelId}` : 'not set (the first one Studio shows)'}
        </span>
      </div>
      {accountId ? (
        <>
          <YtChannelPicker accountId={accountId} />
          <p className="text-[11px] leading-relaxed text-krypt-muted">Lists every channel this account's Chrome profile owns. Tick more than one and each extra channel becomes its own account; the hub switches YouTube Studio to the right channel before it uploads.</p>
        </>
      ) : listed.length > 1 ? (
        <select className="input py-1.5 text-xs" disabled={busy} value={y.channelHandle ?? ''} onChange={(e) => e.target.value && void look(`@${e.target.value}`)}>
          <option value="" className="bg-krypt-panel">
            {busy ? 'Looking it up…' : `Pick one of the ${listed.length} channels in this Chrome profile`}
          </option>
          {listed.map((c) => (
            <option key={c.handle} value={c.handle} className="bg-krypt-panel">
              {c.name} · @{c.handle}
            </option>
          ))}
        </select>
      ) : null}
      {paste || (!accountId && listed.length <= 1) ? (
        <div className="flex gap-2">
          <input className="input flex-1 py-1.5 text-xs" placeholder="Paste the channel link, e.g. youtube.com/@mychannel" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void look()} />
          <GhostButton small disabled={busy || !text.trim()} onClick={() => void look()}>
            {busy ? 'Looking…' : 'Set'}
          </GhostButton>
        </div>
      ) : (
        <button onClick={() => setPaste(true)} className="text-[11px] text-krypt-muted underline-offset-2 hover:text-white hover:underline">
          Or paste a channel link
        </button>
      )}
    </div>
  );
}
