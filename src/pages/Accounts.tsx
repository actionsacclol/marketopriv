import { useState } from 'react';
import { ChevronDown, Chrome, CircleCheck, CircleAlert, Eye, Flame, LogOut, Pencil, Plus, Star, Trash2, Unlink, Users } from 'lucide-react';
import type { AccountInput, AccountStatus, BrowserStatus, IgAccount, LimitKey, NetProfile, Network, Session, Site } from '@shared/types';
import { DEFAULT_TARGETS, NETWORKS, NETWORK_LABEL, POST_GAP_MIN, SITES, SITE_LABEL, YT_UPLOADS_PER_DAY, cleanLimit, limitKeys, limitLabel, localDate, planFor, quotaLabel, sameHandle, siteOn } from '@shared/warmup';
import { Card, Empty, GhostButton, Page, PrimaryButton, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { PlatformTile } from '../components/Platforms';
import { ExtensionSetup, extensionCheck } from '../components/ExtensionSetup';
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

/** Is the account signed in where it runs (the built-in browser or the user's Chrome), and as whom. */
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
function NetSettings({ f, set, n }: { f: AccountInput; set: <K extends keyof AccountInput>(k: K, v: AccountInput[K]) => void; n: Network }) {
  const L = NETWORK_LABEL[n];
  const p = f[n];
  const put = (v: NetProfile): void => set(n, v);
  return (
    <div>
      <Toggle on={!!p?.enabled} onChange={(v) => put({ warmupStart: localDate(), ...(p ?? {}), enabled: v })} label={`Also run this account on ${L}`} />
      <p className="mt-1 text-[11px] text-krypt-muted">
        AIs use {L} in the same {(f.browser ?? 'hub') === 'chrome' ? 'Chrome profile' : 'Marketo browser profile'} as this account's Instagram, with {L}'s own warm-up and daily limits. {NET_HELP[n]}
      </p>
      {p?.enabled && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <label className="label">{n === 'facebook' ? 'Facebook Page name' : `${L} handle`}</label>
            <input className="input font-mono" placeholder={n === 'facebook' ? 'Your Page' : n === 'threads' ? 'Same as Instagram' : 'Same as Instagram, or @handle'} value={p.handle ?? ''} onChange={(e) => put({ ...p, handle: e.target.value || undefined })} />
          </div>
          <div>
            <label className="label">{L} warm-up day 1</label>
            <input type="date" className="input font-mono text-xs" value={p.warmupStart ?? ''} onChange={(e) => put({ ...p, warmupStart: e.target.value })} />
          </div>
          <div className="col-span-2">
            <Toggle on={!!p.watchOnly} onChange={(v) => put({ ...p, watchOnly: v })} label={`Watch only on ${L}`} />
          </div>
        </div>
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
        <span className={cls('text-[11px]', custom.length ? 'text-amber-300' : 'text-krypt-muted')}>{custom.length ? `Your own on ${custom.map((s) => SITE_LABEL[s]).join(', ')}` : 'All recommended'}</span>
        <ChevronDown className={cls('h-4 w-4 shrink-0 text-krypt-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <p className="text-[11px] leading-relaxed text-krypt-muted">
            Marketo holds each platform to these numbers a day. The grey number in a box is the recommended one for today (it rises by itself while a new account warms up). Type your own in any box and that is used instead, as high or as low as you like. Empty means recommended.
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
                <div className="mb-1 truncate text-[11px] text-krypt-muted" title={`${limitLabel(k, site)}: recommended ${rec[k]}`}>
                  {SHORT_LABEL(k, site)}
                </div>
                <input type="number" min={0} className={cls('input font-mono text-xs', own[k] !== undefined && 'border-amber-400/40')} placeholder={String(rec[k])} value={own[k] ?? ''} onChange={(e) => put(k, e.target.value)} />
              </div>
            ))}
          </div>
          {over.length > 0 && (
            <p className="text-[11px] leading-relaxed text-amber-300">
              Past the recommended number: {over.map((k) => `${limitLabel(k, site)} (recommended ${rec[k]})`).join(', ')}. Platforms can limit or lock an account that goes fast, a new one most of all. It is your call.
            </p>
          )}
          {Object.keys(own).length > 0 && (
            <button type="button" onClick={() => set('limits', { ...(f.limits ?? {}), [site]: {} })} className="text-[11px] text-krypt-muted underline-offset-2 hover:text-white hover:underline">
              Back to recommended on {SITE_LABEL[site]}
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

function Editor({ account, onDone }: { account: IgAccount | null; onDone: () => void }) {
  const toast = useApp((s) => s.toast);
  const niche = useApp((s) => s.db!.brand.niche);
  const chromeUp = useApp((s) => (s.chrome?.profiles.length ?? 0) > 0);
  const [f, setF] = useState<AccountInput>(() => (account ? { ...account } : { handle: '', browser: chromeUp ? 'chrome' : 'hub', status: 'warming', createdOn: localDate(), warmupStart: localDate(), niche }));
  const setup = { avatar: false, bio: false, link: false, firstPost: false, ...(account?.setup ?? {}), ...(f.setup ?? {}) };
  const set = <K extends keyof AccountInput>(k: K, v: AccountInput[K]): void => setF((x) => ({ ...x, [k]: v }));
  const sessions = useApp((s) => s.db!.sessions);

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
    // X / TikTok handles are stored as "@name"; a changed handle forgets the user id saved for the old one.
    const nets: Partial<Record<Network, NetProfile>> = {};
    for (const n of NETWORKS) {
      const p = f[n];
      if (!p) continue;
      const raw = p.handle?.trim().replace(/^@+/, '').toLowerCase();
      const h = raw ? `@${raw}` : undefined;
      nets[n] = { ...p, handle: h, ...(h !== account?.[n]?.handle ? { userId: undefined } : {}) };
    }
    const r = await window.marketo.db.saveAccount({ ...f, ...nets, ...(f.limits || raised.length ? { limits } : {}), ...(account ? { id: account.id } : {}) });
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    toast('ok', account ? `${r.data!.handle} saved.` : r.data!.browser === 'chrome' ? `${r.data!.handle} added. It runs in your Chrome.` : `${r.data!.handle} added. Now open each platform and sign in.`);
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
      <div>
        <Toggle on={f.instagram !== false} onChange={(v) => set('instagram', v)} label="Run Instagram" />
        <p className="mt-1 text-[11px] text-krypt-muted">Off for an account that only uses TikTok, X or YouTube: turn those on below.</p>
      </div>
      <div>
        <label className="label">{f.instagram !== false ? 'Instagram handle' : 'Account name'}</label>
        <input className="input font-mono" placeholder={f.instagram !== false ? '@handle' : 'e.g. @mybrand'} value={f.handle ?? ''} onChange={(e) => set('handle', e.target.value)} autoFocus={!account} />
      </div>
      <div>
        <label className="label">Where it is signed in</label>
        <select className="input" value={f.browser ?? 'hub'} onChange={(e) => set('browser', e.target.value as 'hub' | 'chrome')}>
          <option value="hub" className="bg-krypt-panel">
            Marketo's own browser
          </option>
          <option value="chrome" className="bg-krypt-panel">
            My Chrome (Krypt Marketo extension)
          </option>
        </select>
        <p className="mt-1 text-[11px] text-krypt-muted">
          {(f.browser ?? 'hub') === 'chrome'
            ? 'Your AI works in your real Chrome profile: same device and sign-in Instagram already knows. Needs the extension (see below).'
            : 'A private session inside Marketo. Instagram sees it as a new browser, so pick this for accounts you will only ever use here.'}{' '}
          Pick one and stay on it.
        </p>
      </div>
      <div>
        <label className="label">Niche</label>
        <input className="input" value={f.niche ?? ''} onChange={(e) => set('niche', e.target.value)} placeholder="What this account watches and posts about" />
      </div>
      <div className="grid grid-cols-3 gap-2">
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
        <div>
          <label className="label">Created</label>
          <input type="date" className="input font-mono text-xs" value={f.createdOn ?? ''} onChange={(e) => set('createdOn', e.target.value)} />
        </div>
        <div>
          <label className="label">Warm-up day 1</label>
          <input type="date" className="input font-mono text-xs" value={f.warmupStart ?? ''} onChange={(e) => set('warmupStart', e.target.value)} />
        </div>
      </div>
      <div>
        <Toggle on={!!f.watchOnly} onChange={(v) => set('watchOnly', v)} label="Watch only" />
        <p className="mt-1 text-[11px] text-krypt-muted">On Instagram, AIs can scroll and watch but the browser refuses likes, saves, follows, comments and posts. Turn it on while Instagram restricts the account. YouTube uploads are not affected.</p>
      </div>
      <NetSettings f={f} set={set} n="x" />
      <NetSettings f={f} set={set} n="tiktok" />
      <div>
        <Toggle on={!!f.youtube?.enabled} onChange={(v) => set('youtube', { ...(f.youtube ?? {}), enabled: v })} label="Also post Shorts to YouTube" />
        <p className="mt-1 text-[11px] text-krypt-muted">
          AIs can upload rendered reels to this account's YouTube channel through YouTube Studio, in the same {(f.browser ?? 'hub') === 'chrome' ? 'Chrome profile' : 'Marketo browser profile'} as its Instagram. Publishing follows your approval setting. {YT_UPLOADS_PER_DAY} a day is the recommended limit; set your own under Daily limits.
          {(f.browser ?? 'hub') === 'hub' ? ' Google sometimes refuses to sign in inside apps; if it does, use My Chrome for this account.' : ''}
        </p>
      </div>
      <div>
        <label className="label">Posts a day</label>
        <div className="grid grid-cols-4 gap-2">
          {SITES
            .filter((s) => siteOn(f as IgAccount, s))
            .map((s) => (
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
        {raised.map((x) => (
          <p key={x.site} className="mt-1 text-[11px] leading-relaxed text-amber-300">
            {SITE_LABEL[x.site]}: {x.target} a day is past {x.own ? 'your own' : 'the recommended'} post limit of {x.limit} for today. Saving sets your {SITE_LABEL[x.site]} post limit to {x.target} as well. Platforms can limit or lock an account that posts fast; it is your call.
            {(x.target - 1) * x.gap > 16 * 60 ? ` At ${x.gap} minutes between posts, ${x.target} a day does not fit: shorten the post gap under Daily limits.` : ''}
          </p>
        ))}
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
  const signOut = async (): Promise<void> => {
    const r = await window.marketo.browser.clear(a.id);
    toast(r.ok ? 'ok' : 'error', r.ok ? `${a.handle} signed out of the hub's browser.` : r.message ?? 'Could not sign out.');
  };
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
          <GhostButton small onClick={() => void forgetChannel()}>
            <Unlink className="h-3.5 w-3.5" /> Forget channel
          </GhostButton>
        )}
        {!active && (
          <GhostButton small onClick={() => void window.marketo.db.updateSettings({ handle: a.handle })}>
            <Star className="h-3.5 w-3.5" /> Make active
          </GhostButton>
        )}
        {a.browser !== 'chrome' && (st?.loggedIn || st?.x?.loggedIn || st?.tiktok?.loggedIn || st?.youtube?.loggedIn) && (
          <GhostButton small onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5" /> Sign out here
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
  const nameOf =(p: (typeof profiles)[number]): string => {
    const a = accounts.find((x) => (p.userId && x.igUserId === p.userId) || (p.me && sameHandle(x.handle, p.me)));
    if (a) return a.handle;
    if (p.me) return `@${p.me}`;
    return p.loggedIn ? 'Instagram signed in (handle not read yet)' : 'Instagram signed out';
  };
  return (
    <Card className="space-y-2 text-sm text-white/80">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Chrome className="h-4 w-4" /> Use your own Chrome
      </div>
      <p>Keep an account in the Chrome profile it already lives in, so Instagram (and X, TikTok, and YouTube for Shorts) sees one device. Your AI works in a tab there, under the same limits and approval setting.</p>
      {profiles.length > 0 ? (
        <div className="space-y-1">
          {profiles.map((p) => (
            <div key={p.id} className={cls('flex items-center gap-1.5 text-xs', p.loggedIn ? 'text-emerald-300' : 'text-amber-300')}>
              {p.loggedIn ? <CircleCheck className="h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="h-3.5 w-3.5 shrink-0" />} Chrome connected · {nameOf(p)}
              {p.xLoggedIn ? ' · X signed in' : ''}
              {p.ttLoggedIn ? ' · TikTok signed in' : ''}
              {p.ytLoggedIn ? ' · YouTube signed in' : ''}
              {p.stopped ? ' · paused by you in Chrome' : ''}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 text-xs text-amber-300">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" /> No Chrome profile connected
        </div>
      )}
      <p className="text-xs text-krypt-muted">More than one Chrome profile? Pick which one each account runs in on the Setup page, under Chrome profile. Then set the account to My Chrome here.</p>
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

  return (
    <Page
      title="Accounts"
      subtitle="Every account you run, on the platforms you picked. Each one is signed in either in Marketo's own browser or in your own Chrome, kept apart from the others."
      actions={
        <PrimaryButton onClick={() => setEditing({ id: null })}>
          <Plus className="h-4 w-4" /> Add account
        </PrimaryButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div>
          {db.igAccounts.length === 0 ? (
            <Empty icon={<Users className="h-6 w-6" />} title="No accounts yet">
              Add an account, pick its platforms (Instagram, TikTok, YouTube Shorts, X) and choose where it is signed in: Marketo's own browser, or your Chrome. Your AI uses it there.
            </Empty>
          ) : (
            <div className="grid gap-4 2xl:grid-cols-2">
              {db.igAccounts.map((a) => (
                <AccountCard key={a.id} a={a} onEdit={() => setEditing({ id: a.id })} />
              ))}
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
          </Card>
          <Card className="space-y-2 text-sm text-white/80">
            <div className="text-sm font-semibold text-white">How accounts work here</div>
            <p>
              <span className="text-white">1.</span> Add the account, pick its platforms and sign in yourself: in Marketo's own browser (click a platform tile to open it), or as usual in your Chrome. Marketo never sees or stores your passwords.
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
