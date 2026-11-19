import type { IgAccount, LimitKey, NetProfile, Network, Reel, Session, SiteLimits, Site } from './types';

// The warm-up ramp for a new account. These are our own conservative house
// numbers (not numbers Instagram publishes), and they are RECOMMENDED, not
// forced: the user can put their own number on any of them, per platform
// (IgAccount.limits, the Accounts page). The hub then holds the account to
// the user's number instead. A missing number is the recommended one.

export interface Quota {
  minutes: number;
  likes: number;
  saves: number;
  follows: number;
  comments: number;
  posts: number;
  /** X only. */
  reposts: number;
  /** Direct messages sent (replies in the inbox). */
  messages: number;
}

export interface Phase {
  id: 'lurk' | 'engage' | 'ramp' | 'active';
  name: string;
  /** First and last warm-up day of the phase (last = Infinity for active). */
  from: number;
  to: number;
  quota: Quota;
  tasks: string[];
}

export const PHASES: Phase[] = [
  {
    id: 'lurk',
    name: 'Lurk',
    from: 1,
    to: 3,
    quota: { minutes: 25, likes: 15, saves: 5, follows: 3, comments: 0, posts: 0, reposts: 0, messages: 0 },
    tasks: ['Scroll niche reels and search terms; watch most of each video', 'Like only what fits the niche', 'Add a profile photo (day 2 or 3)'],
  },
  {
    id: 'engage',
    name: 'Engage',
    from: 4,
    to: 7,
    quota: { minutes: 30, likes: 25, saves: 8, follows: 5, comments: 2, posts: 0, reposts: 0, messages: 5 },
    tasks: ['Write the bio (no link yet)', 'A couple of real comments on niche posts (user approves each)', 'Follow a few accounts the feed keeps serving'],
  },
  {
    id: 'ramp',
    name: 'Ramp',
    from: 8,
    to: 14,
    quota: { minutes: 35, likes: 40, saves: 10, follows: 10, comments: 5, posts: 1, reposts: 0, messages: 15 },
    tasks: ['First reel can go up (one a day at most)', 'Reply to every comment on our posts', 'Keep the daily scroll going'],
  },
  {
    id: 'active',
    name: 'Active',
    from: 15,
    to: Infinity,
    quota: { minutes: 45, likes: 60, saves: 15, follows: 15, comments: 10, posts: 1, reposts: 0, messages: 30 },
    tasks: ['Add the link in bio now, not earlier (a link on a brand-new account can get it restricted)', 'One reel a day', 'Record follower stats daily', 'Engage before and after posting'],
  },
];

/** YYYY-MM-DD in local time. */
export const localDate = (d: Date | string = new Date()): string => {
  const x = typeof d === 'string' ? new Date(d) : d;
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

const dayIndex = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Math.round(new Date(y, m - 1, d).getTime() / 86_400_000);
};

/** Warm-up day number (1 = the start date). */
export const warmupDay = (a: Pick<IgAccount, 'warmupStart'>, today = localDate()): number => Math.max(1, dayIndex(today) - dayIndex(a.warmupStart) + 1);

export const phaseFor = (day: number): Phase => PHASES.find((p) => day >= p.from && day <= p.to) ?? PHASES[PHASES.length - 1];

export interface DayTotals extends Quota {
  sessions: number;
}

export function totalsOn(sessions: Session[], handle: string, ymd: string, site: Site = 'instagram'): DayTotals {
  const list = sessions.filter((s) => (s.site ?? 'instagram') === site && sameHandle(s.handle, handle) && localDate(s.startedAt) === ymd);
  return {
    sessions: list.length,
    minutes: list.reduce((n, s) => n + s.minutes, 0),
    likes: list.reduce((n, s) => n + s.likes, 0),
    saves: list.reduce((n, s) => n + s.saves, 0),
    follows: list.reduce((n, s) => n + s.follows, 0),
    comments: list.reduce((n, s) => n + s.comments, 0),
    posts: list.reduce((n, s) => n + (s.posts ?? (s.kind === 'post' ? 1 : 0)), 0),
    reposts: list.reduce((n, s) => n + (s.reposts ?? 0), 0),
    messages: list.reduce((n, s) => n + (s.messages ?? 0), 0),
  };
}

export const normalizeHandle = (h: string): string => `@${h.trim().replace(/^@+/, '').toLowerCase()}`;
export const sameHandle = (a: string, b: string): boolean => normalizeHandle(a) === normalizeHandle(b);

export const QUOTA_KEYS: Array<keyof Quota> = ['minutes', 'likes', 'saves', 'follows', 'comments', 'messages', 'posts'];
/** What X counts (bookmarks are private and not counted; replies are "comments"). */
export const X_QUOTA_KEYS: Array<keyof Quota> = ['minutes', 'likes', 'reposts', 'follows', 'comments', 'messages', 'posts'];
/** Facebook: shares are counted as reposts; saving a post is private and not counted. */
export const FB_QUOTA_KEYS: Array<keyof Quota> = ['minutes', 'likes', 'reposts', 'follows', 'comments', 'messages', 'posts'];
export const quotaKeys = (site: Site): Array<keyof Quota> => (site === 'x' || site === 'threads' ? X_QUOTA_KEYS : site === 'facebook' ? FB_QUOTA_KEYS : QUOTA_KEYS);
/** How a quota key reads on a network (X and Threads call comments replies; TikTok calls saves favorites; Pinterest likes are reactions). */
export const quotaLabel = (k: keyof Quota, site: Site): string =>
  (site === 'x' || site === 'threads') && k === 'comments'
    ? 'replies'
    : site === 'tiktok' && k === 'saves'
      ? 'favorites'
      : site === 'pinterest' && k === 'likes'
        ? 'reactions'
        : site === 'facebook' && k === 'reposts'
          ? 'shares'
          : k;

export const NETWORKS: Network[] = ['x', 'tiktok', 'facebook', 'threads', 'pinterest'];
export const NETWORK_LABEL: Record<Network, string> = { x: 'X', tiktok: 'TikTok', facebook: 'Facebook', threads: 'Threads', pinterest: 'Pinterest' };
export const isNetwork = (s: Site): s is Network => s !== 'instagram' && s !== 'youtube';
/** The account's settings on one of those networks. */
export const netOf = (a: IgAccount, n: Network): NetProfile | undefined => a[n];

/** Every platform, in the order the hub lists them. */
export const SITES: Site[] = ['instagram', 'youtube', 'x', 'tiktok', 'facebook', 'threads', 'pinterest'];
/** Is the platform turned on for the account: Instagram unless switched off, the others once switched on. */
export const siteOn = (a: IgAccount, site: Site): boolean => (site === 'instagram' ? a.instagram !== false : site === 'youtube' ? !!a.youtube?.enabled : !!netOf(a, site)?.enabled);
/** The platforms the account runs on. */
export const sitesOf = (a: IgAccount): Site[] => SITES.filter((s) => siteOn(a, s));

// TikTok's own ramp. House limits: TikTok shadow-limits new accounts that like, follow or comment in bursts, so the
// first days are mostly watching the For You feed to teach it the niche, and posting starts after the feed has settled.
export const TT_PHASES: Phase[] = [
  { id: 'lurk', name: 'Lurk', from: 1, to: 3, quota: { minutes: 30, likes: 10, saves: 2, follows: 2, comments: 0, posts: 0, reposts: 0, messages: 0 }, tasks: ['Watch the For You feed and niche searches; watch most videos to the end', 'Skip what is off-niche quickly', 'Profile photo and bio'] },
  { id: 'engage', name: 'Engage', from: 4, to: 7, quota: { minutes: 35, likes: 25, saves: 5, follows: 5, comments: 2, posts: 1, reposts: 0, messages: 3 }, tasks: ['First video can go up', 'A couple of real comments on niche videos (user approves each)', 'Follow creators the feed keeps serving'] },
  { id: 'ramp', name: 'Ramp', from: 8, to: 14, quota: { minutes: 40, likes: 40, saves: 8, follows: 10, comments: 5, posts: 2, reposts: 0, messages: 10 }, tasks: ['Post reels as TikTok videos', 'Reply to comments on our videos'] },
  { id: 'active', name: 'Active', from: 15, to: Infinity, quota: { minutes: 45, likes: 60, saves: 10, follows: 15, comments: 10, posts: 3, reposts: 0, messages: 20 }, tasks: ['Link in bio when TikTok allows it', 'Post daily; reply early to comments', 'Record follower stats'] },
];

// X's own ramp. House limits, far under X's published ones (around 400 follows and 1,000 likes a day): X's automation
// rules single out automated likes and aggressive following, and it locks new accounts for them quickly.
// Facebook (posting as a Page): Meta links it to the Instagram side, so the same slow start; Reels can go up from week one.
export const FB_PHASES: Phase[] = [
  { id: 'lurk', name: 'Lurk', from: 1, to: 3, quota: { minutes: 20, likes: 10, saves: 0, follows: 2, comments: 0, posts: 0, reposts: 0, messages: 5 }, tasks: ['Page photo, cover and About filled in', 'Read the niche: groups, pages and Reels the feed serves', 'Like what you watched to the end; follow a page or two that keeps posting well in the niche', 'Answer anyone who messages the Page'] },
  { id: 'engage', name: 'Engage', from: 4, to: 7, quota: { minutes: 25, likes: 20, saves: 0, follows: 4, comments: 3, posts: 1, reposts: 1, messages: 10 }, tasks: ['First Reel can go up', 'A few real comments on niche posts', 'Follow pages the feed keeps serving'] },
  { id: 'ramp', name: 'Ramp', from: 8, to: 14, quota: { minutes: 30, likes: 35, saves: 0, follows: 8, comments: 6, posts: 2, reposts: 2, messages: 20 }, tasks: ['Post reels as Facebook Reels', 'Reply to comments on our posts'] },
  { id: 'active', name: 'Active', from: 15, to: Infinity, quota: { minutes: 35, likes: 50, saves: 0, follows: 12, comments: 10, posts: 3, reposts: 3, messages: 30 }, tasks: ['Post daily; reply early to comments', 'Record follower stats'] },
];

// Threads: text-first, signed in through Instagram. Replies are what grow an account there.
export const TH_PHASES: Phase[] = [
  { id: 'lurk', name: 'Lurk', from: 1, to: 3, quota: { minutes: 20, likes: 10, saves: 0, follows: 3, comments: 1, posts: 1, reposts: 0, messages: 0 }, tasks: ['Bio filled in', 'Read the niche feed and search; like only what fits', 'Follow a couple of accounts whose threads you read', 'One post a day at most'] },
  { id: 'engage', name: 'Engage', from: 4, to: 7, quota: { minutes: 25, likes: 20, saves: 0, follows: 5, comments: 4, posts: 2, reposts: 1, messages: 3 }, tasks: ['A few real replies on niche threads', 'Follow accounts the feed keeps serving'] },
  { id: 'ramp', name: 'Ramp', from: 8, to: 14, quota: { minutes: 30, likes: 35, saves: 0, follows: 10, comments: 8, posts: 3, reposts: 2, messages: 8 }, tasks: ['Post reels as video threads, and short text threads', 'Reply to replies on our threads'] },
  { id: 'active', name: 'Active', from: 15, to: Infinity, quota: { minutes: 35, likes: 50, saves: 0, follows: 15, comments: 12, posts: 4, reposts: 3, messages: 15 }, tasks: ['Post daily; reply early', 'Record follower stats'] },
];

// Pinterest: a search engine more than a feed. Saves (repins into our boards) teach it the niche; Pins keep being found for months.
export const PIN_PHASES: Phase[] = [
  { id: 'lurk', name: 'Lurk', from: 1, to: 3, quota: { minutes: 20, likes: 5, saves: 10, follows: 3, comments: 0, posts: 1, reposts: 0, messages: 0 }, tasks: ['Profile photo, bio and website', 'Make 3-5 boards named for what people search', 'Save niche Pins into them'] },
  { id: 'engage', name: 'Engage', from: 4, to: 7, quota: { minutes: 25, likes: 10, saves: 20, follows: 5, comments: 1, posts: 2, reposts: 0, messages: 2 }, tasks: ['First video Pins can go up', 'Keep saving niche Pins'] },
  { id: 'ramp', name: 'Ramp', from: 8, to: 14, quota: { minutes: 25, likes: 15, saves: 30, follows: 8, comments: 2, posts: 3, reposts: 0, messages: 5 }, tasks: ['Post reels as video Pins with keyword titles and the link', 'Spread Pins across boards'] },
  { id: 'active', name: 'Active', from: 15, to: Infinity, quota: { minutes: 30, likes: 20, saves: 40, follows: 10, comments: 3, posts: 5, reposts: 0, messages: 10 }, tasks: ['Pin daily', 'Record follower stats'] },
];

export const X_PHASES: Phase[] = [
  { id: 'lurk', name: 'Lurk', from: 1, to: 3, quota: { minutes: 20, likes: 10, saves: 0, follows: 3, comments: 0, posts: 1, reposts: 0, messages: 0 }, tasks: ['Read the niche feed and search; like only what fits', 'Profile photo, banner and bio', 'One post a day at most'] },
  { id: 'engage', name: 'Engage', from: 4, to: 7, quota: { minutes: 25, likes: 20, saves: 0, follows: 5, comments: 3, posts: 2, reposts: 2, messages: 5 }, tasks: ['A few real replies on niche posts (user approves each)', 'Follow accounts the feed keeps serving'] },
  { id: 'ramp', name: 'Ramp', from: 8, to: 14, quota: { minutes: 30, likes: 35, saves: 0, follows: 10, comments: 6, posts: 3, reposts: 4, messages: 15 }, tasks: ['Post reels as video posts', 'Reply to replies on our posts'] },
  { id: 'active', name: 'Active', from: 15, to: Infinity, quota: { minutes: 40, likes: 50, saves: 0, follows: 15, comments: 10, posts: 4, reposts: 6, messages: 30 }, tasks: ['Link in bio now', 'Post daily; reply early to replies', 'Record follower stats'] },
];

// ── The user's own limits ──────────────────────────────────────────────────
/** Recommended minutes between two posts on the same platform. Back-to-back uploads look automated and split the first post's reach. */
export const POST_GAP_MIN: Record<Site, number> = { instagram: 120, youtube: 120, x: 90, tiktok: 120, facebook: 120, threads: 120, pinterest: 120 };
/** Recommended Shorts per channel per day (YouTube's own limit is far higher; this keeps a new channel looking normal). */
export const YT_UPLOADS_PER_DAY = 3;

/** The limits the user can set on a platform, in the order the hub lists them (YouTube only posts). */
export const limitKeys = (site: Site): LimitKey[] => (site === 'youtube' ? ['posts', 'gap'] : [...quotaKeys(site), 'gap']);
export const limitLabel = (k: LimitKey, site: Site): string => (k === 'gap' ? 'minutes between posts' : k === 'minutes' ? 'minutes of scrolling' : quotaLabel(k, site));

/** A limit as typed or sent: a whole number from 0 up, or undefined for "the recommended one". */
export const cleanLimit = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
/** The user's own limits with everything that is not one dropped (undefined when none are left). */
export function cleanLimits(all: Partial<Record<Site, SiteLimits>> | undefined): Partial<Record<Site, SiteLimits>> | undefined {
  const out: Partial<Record<Site, SiteLimits>> = {};
  for (const site of SITES) {
    const mine: SiteLimits = {};
    for (const k of limitKeys(site)) {
      const n = cleanLimit(all?.[site]?.[k]);
      if (n !== undefined) mine[k] = n;
    }
    if (Object.keys(mine).length) out[site] = mine;
  }
  return Object.keys(out).length ? out : undefined;
}

/** The user's own limits on a platform ({} = all recommended). */
export const limitsOf = (a: Pick<IgAccount, 'limits'>, site: Site): SiteLimits => a.limits?.[site] ?? {};
/** Minutes that must pass between two posts on a platform: the user's number, otherwise the recommended one. */
export const postGap = (a: Pick<IgAccount, 'limits'>, site: Site): number => limitsOf(a, site).gap ?? POST_GAP_MIN[site];
/** Shorts a day for the account's channel: the user's number, otherwise the recommended one. */
export const ytLimit = (a: Pick<IgAccount, 'limits'>): number => limitsOf(a, 'youtube').posts ?? YT_UPLOADS_PER_DAY;

export interface WarmupPlan {
  day: number;
  /** The phase the account is in. Its quota is what the hub holds the account to today: the user's own numbers where they set any, the recommended ones otherwise. */
  phase: Phase;
  /** The recommended numbers for today (the phase's own), whatever the user set. */
  recommended: Quota;
  /** The limits the user set themselves on this platform. */
  own: SiteLimits;
  next?: Phase;
  done: DayTotals;
  left: Quota;
  /** Today's time budget in minutes: the phase's minutes plus the allowance each post made today adds. */
  budgetMinutes: number;
  /** Days with any session in the last 7 (including today). */
  activeDays7: number;
}

/** Minutes of app time each post gets on top of the phase budget (upload, caption, checks). */
export const POST_MINUTES = 8;

/** The warm-up ladder a platform runs on (Instagram's for Instagram and YouTube). */
export const phasesFor = (site: Site): Phase[] => (site === 'x' ? X_PHASES : site === 'tiktok' ? TT_PHASES : site === 'facebook' ? FB_PHASES : site === 'threads' ? TH_PHASES : site === 'pinterest' ? PIN_PHASES : PHASES);

/** Watch-only on that platform (Instagram's own switch, or the network's). */
export const watchOnlyOn = (a: IgAccount, site: Site): boolean => (isNetwork(site) ? !!netOf(a, site)?.watchOnly : !!a.watchOnly);

export function planFor(a: IgAccount, sessions: Session[], today = localDate(), site: Site = 'instagram'): WarmupPlan {
  const net = isNetwork(site);
  const phases = phasesFor(site);
  const day = warmupDay(net ? { warmupStart: netOf(a, site)?.warmupStart ?? today } : a, today);
  const ramp = !net && a.status === 'active' ? PHASES[PHASES.length - 1] : phases.find((p) => day >= p.from && day <= p.to) ?? phases[phases.length - 1];
  // The user's own numbers win over the ramp's, with no upper bound: the limits are theirs to set.
  const own = limitsOf(a, site);
  const recommended = site === 'youtube' ? { ...ramp.quota, posts: YT_UPLOADS_PER_DAY } : ramp.quota;
  const quota = { ...recommended };
  for (const k of Object.keys(quota) as Array<keyof Quota>) if (own[k] !== undefined) quota[k] = own[k]!;
  const phase: Phase = { ...ramp, quota };
  const done = totalsOn(sessions, a.handle, today, site);
  const left = Object.fromEntries((['minutes', 'likes', 'saves', 'follows', 'comments', 'posts', 'reposts', 'messages'] as Array<keyof Quota>).map((k) => [k, Math.max(0, phase.quota[k] - done[k])])) as unknown as Quota;
  // Uploading and writing a caption is time on the app too, but it shouldn't eat the engagement budget: each post today adds its own allowance.
  const budgetMinutes = phase.quota.minutes + POST_MINUTES * done.posts;
  left.minutes = Math.max(0, budgetMinutes - done.minutes);
  let activeDays7 = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    if (totalsOn(sessions, a.handle, localDate(d), site).sessions > 0) activeDays7++;
  }
  const next = phases[phases.indexOf(ramp) + 1];
  return { day, phase, recommended, own, next, done, left, budgetMinutes, activeDays7 };
}

/** A ready-to-paste instruction for any connected AI to run today's warm-up. */
export function warmupPrompt(a: IgAccount, plan: WarmupPlan, site: Site = 'instagram'): string {
  const { left, phase, day } = plan;
  const where = SITE_LABEL[site];
  const open = site === 'instagram' ? 'browser_open' : `browser_open with site "${site}"`;
  const allowed = quotaKeys(site).filter((k) => k !== 'minutes' && k !== 'posts' && k !== 'messages' && phase.quota[k] > 0);
  return [
    `Warm up ${a.handle} on ${where} for about ${Math.max(10, Math.round(left.minutes))} minutes using Krypt Marketo's browser tools.`,
    `It's ${where} warm-up day ${day} (${phase.name} phase). Call get_warmup_plan for ${a.handle} first, then ${open}.`,
    watchOnlyOn(a, site) ? `The account is watch-only on ${where} right now: scroll and watch, nothing else.` : `Left today: ${allowed.map((k) => `${Math.round(left[k])} ${quotaLabel(k, site)}`).join(', ')}. The browser enforces these.`,
    a.niche ? `Niche: ${a.niche}.` : '',
    "Don't like everything and vary the pace. Comments wait for my approval in the hub. When done, log_session with the niche and a note on what the feed showed.",
  ]
    .filter(Boolean)
    .join(' ');
}

// ── YouTube Shorts ─────────────────────────────────────────────────────────
/** Shorts the account's channel published today (local time). */
export const ytUploadsToday = (a: Pick<IgAccount, 'youtube'>, today = localDate()): number => (a.youtube?.uploads ?? []).filter((t) => localDate(t) === today).length;

// ── Daily posting targets ───────────────────────────────────────────────────
/** Posts a day the AI aims for when the user has not set one (the user's plan: 1 reel, 2 Shorts, X up to its limit, 1 TikTok). */
export const DEFAULT_TARGETS: Record<Site, number> = { instagram: 1, youtube: 2, x: 4, tiktok: 1, facebook: 1, threads: 2, pinterest: 2 };
export const SITE_LABEL: Record<Site, string> = { instagram: 'Instagram', youtube: 'YouTube Shorts', x: 'X', tiktok: 'TikTok', facebook: 'Facebook', threads: 'Threads', pinterest: 'Pinterest' };
/** A reel's link and date on a platform, if it went up there. */
export const linkOn = (r: Reel, site: Site): { url: string; at?: string } | null => {
  const pair = (url?: string, at?: string): { url: string; at?: string } | null => (url ? { url, at } : null);
  if (site === 'instagram') return pair(r.postedUrl, r.postedAt);
  if (site === 'youtube') return pair(r.shortsUrl, r.shortsPostedAt);
  if (site === 'x') return pair(r.xUrl, r.xPostedAt);
  if (site === 'tiktok') return pair(r.tiktokUrl, r.tiktokPostedAt);
  return r.links?.[site] ?? null;
};
/** The fields that record a reel going up on a platform. */
export const linkPatch = (r: Reel, site: Site, url: string, at: string): Partial<Reel> =>
  site === 'instagram'
    ? { postedUrl: url, postedAt: at }
    : site === 'youtube'
      ? { shortsUrl: url, shortsPostedAt: at }
      : site === 'x'
        ? { xUrl: url, xPostedAt: at }
        : site === 'tiktok'
          ? { tiktokUrl: url, tiktokPostedAt: at }
          : { links: { ...(r.links ?? {}), [site]: { url, at } } };

/** When a reel went up on a platform (mark_posted), if it did. */
export const postedAtOn = (r: Reel, site: Site): string | undefined => linkOn(r, site)?.at;

/** The post limit on a platform today: the user's own number, otherwise the recommended one (the warm-up phase's, or the Shorts number). */
export function postLimit(a: IgAccount, site: Site, sessions: Session[], today = localDate()): { limit: number; recommended: number; own: boolean } {
  if (site === 'youtube') return { limit: ytLimit(a), recommended: YT_UPLOADS_PER_DAY, own: limitsOf(a, 'youtube').posts !== undefined };
  const plan = planFor(a, sessions, today, site);
  return { limit: plan.phase.quota.posts, recommended: plan.recommended.posts, own: plan.own.posts !== undefined };
}

/**
 * Today's posts on a platform against the account's target and that day's post limit (wanted = the target as the user
 * set it; target = what can be done of it today, never past the limit). Reels the user posted by hand count once they are marked posted.
 */
export function postTarget(a: IgAccount, site: Site, sessions: Session[], today = localDate(), reels: Reel[] = [], solo = false): { target: number; wanted: number; ceiling: number; done: number } {
  const marked = reels.filter((r) => { const at = postedAtOn(r, site); return !!at && localDate(at) === today && (r.postedBy ? sameHandle(r.postedBy, a.handle) : solo); }).length;
  const wanted = a.targets?.[site] ?? DEFAULT_TARGETS[site];
  const ceiling = postLimit(a, site, sessions, today).limit;
  const done = site === 'youtube' ? Math.max(ytUploadsToday(a, today), marked) : Math.max(planFor(a, sessions, today, site).done.posts, marked);
  return { target: Math.min(wanted, ceiling), wanted, ceiling, done };
}
