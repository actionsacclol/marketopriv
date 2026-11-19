import { AtSign, Facebook, Instagram, MessageCircle, Music2, Pin, Youtube } from 'lucide-react';
import type { BrowserStatus, Db, IgAccount, Site } from '@shared/types';
import { SITE_LABEL, isNetwork, netOf, planFor, postTarget, quotaKeys, sameHandle, sitesOf, ytUploadsToday } from '@shared/warmup';
import { useApp } from '../state/store';

// One platform of one account, as the Home tiles and the Accounts cards show it.

export const SITE_ICON: Record<Site, typeof AtSign> = { instagram: Instagram, youtube: Youtube, x: AtSign, tiktok: Music2, facebook: Facebook, threads: MessageCircle, pinterest: Pin };
/** Brand colour per platform (icon bubble and accents). */
export const SITE_COLOR: Record<Site, string> = { instagram: '#E1306C', youtube: '#FF3B3B', x: '#E5E7EB', tiktok: '#25F4EE', facebook: '#1877F2', threads: '#D4D4D8', pinterest: '#E60023' };
export const SITE_SHORT: Record<Site, string> = { ...SITE_LABEL, youtube: 'Shorts' };

export type Tone = 'ok' | 'warn' | 'bad';

export interface SiteState {
  site: Site;
  tone: Tone;
  /** Short state: "Signed in", "Signed out", "Chrome off", "Wrong account", "Reload extension". */
  state: string;
  /** Longer sentence for tooltips and the Needs-you list. */
  detail: string;
  /** Who it runs as there (handle / Page / channel). */
  who: string;
  day?: number;
  phase?: string;
  watchOnly: boolean;
  posts: { done: number; target: number };
  /** Today against the phase's ceilings (YouTube has none of these). */
  likes?: { done: number; cap: number };
  follows?: { done: number; cap: number };
  /** Saves (TikTok favorites, Pinterest saves); absent where the platform's saves are not counted. */
  saves?: { done: number; cap: number };
  /** Comments, or replies on X and Threads. */
  comments?: { done: number; cap: number };
  minutes?: { done: number; cap: number };
}

export function siteState(a: IgAccount, st: BrowserStatus | undefined, site: Site, db: Db, solo: boolean): SiteState {
  const inChrome = a.browser === 'chrome';
  const L = SITE_LABEL[site];
  const posts = postTarget(a, site, db.sessions, undefined, db.reels, solo);
  const base = { site, posts: { done: posts.done, target: posts.target }, watchOnly: false };
  if (site === 'youtube') {
    const y = st?.youtube;
    const who = a.youtube?.channelName ? a.youtube.channelName : a.youtube?.channelId ? 'channel linked' : 'channel not linked';
    const s = { ...base, who, posts: { done: Math.max(ytUploadsToday(a), posts.done), target: posts.target } };
    if (inChrome && !st?.connected) return { ...s, tone: 'warn', state: 'Chrome off', detail: `${L}: Chrome is not connected` };
    if (y?.outdated) return { ...s, tone: 'warn', state: 'Reload extension', detail: `${L}: reload the Krypt Marketo extension in chrome://extensions` };
    if (y?.loggedIn) return { ...s, tone: 'ok', state: 'Signed in', detail: `${L}: signed in` };
    return { ...s, tone: 'warn', state: 'Signed out', detail: `${L}: sign in to the channel${inChrome ? ' in that Chrome profile' : ''}` };
  }
  const plan = planFor(a, db.sessions, undefined, site);
  const q = plan.phase.quota;
  const meters = {
    day: plan.day,
    phase: plan.phase.name,
    likes: { done: plan.done.likes, cap: q.likes },
    follows: { done: plan.done.follows, cap: q.follows },
    saves: quotaKeys(site).includes('saves') ? { done: plan.done.saves, cap: q.saves } : undefined,
    comments: { done: plan.done.comments, cap: q.comments },
    minutes: { done: Math.round(plan.done.minutes * 10) / 10, cap: plan.budgetMinutes },
  };
  if (site === 'instagram') {
    const s = { ...base, ...meters, who: a.handle, watchOnly: !!a.watchOnly, ...(a.status !== 'warming' ? { day: undefined, phase: a.status === 'active' ? 'Active' : 'Paused' } : {}) };
    const wrong = !!st?.loggedIn && !!st.signedInAs && !sameHandle(st.signedInAs, a.handle);
    if (inChrome && !st?.connected) return { ...s, tone: 'warn', state: 'Chrome off', detail: 'Instagram: Chrome is not connected. Open the Chrome profile it is signed in to.' };
    if (wrong) return { ...s, tone: 'bad', state: 'Wrong account', detail: `Instagram is signed in as @${st!.signedInAs}, not ${a.handle}` };
    if (st?.loggedIn) return { ...s, tone: 'ok', state: 'Signed in', detail: 'Instagram: signed in' };
    return { ...s, tone: 'warn', state: 'Signed out', detail: `Instagram: sign in${inChrome ? ' in that Chrome profile' : ''}` };
  }
  if (!isNetwork(site)) throw new Error(site);
  const p = netOf(a, site);
  const y = st?.[site];
  const want = p?.handle;
  const s = { ...base, ...meters, who: want ?? (y?.signedInAs ? `@${y.signedInAs}` : 'handle not seen yet'), watchOnly: !!p?.watchOnly };
  if (inChrome && !st?.connected) return { ...s, tone: 'warn', state: 'Chrome off', detail: `${L}: Chrome is not connected` };
  if (y?.outdated) return { ...s, tone: 'warn', state: 'Reload extension', detail: `${L}: reload the Krypt Marketo extension in chrome://extensions` };
  if (y?.loggedIn && y.signedInAs && want && !sameHandle(y.signedInAs, want)) return { ...s, tone: 'bad', state: 'Wrong account', detail: `${L} is signed in as @${y.signedInAs}, not ${want}` };
  if (y?.loggedIn) return { ...s, tone: 'ok', state: 'Signed in', detail: `${L}: signed in` };
  return { ...s, tone: 'warn', state: 'Signed out', detail: `${L}: sign in${inChrome ? ' in that Chrome profile' : ''}` };
}

/** Every platform the account runs on, in the usual order. */
export function accountSites(a: IgAccount, st: BrowserStatus | undefined, db: Db): SiteState[] {
  const solo = db.igAccounts.length <= 1;
  return sitesOf(a).map((s) => siteState(a, st, s, db, solo));
}

export async function openSite(accountId: string, site: Site): Promise<void> {
  const r = await window.marketo.browser.open(accountId, undefined, site === 'instagram' ? undefined : site);
  if (!r.ok) useApp.getState().toast('error', r.message ?? `Could not open ${SITE_LABEL[site]}.`);
}

export const TONE_DOT: Record<Tone, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]',
  warn: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.7)]',
  bad: 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]',
};
export const TONE_TEXT: Record<Tone, string> = { ok: 'text-emerald-300', warn: 'text-amber-300', bad: 'text-rose-300' };
