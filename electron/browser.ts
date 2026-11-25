// Instagram, X (and YouTube Studio, for uploading Shorts), for the AIs. Every account runs in the user's own Chrome,
// through the Krypt Marketo extension (chromeBridge.ts): the same device and fingerprint as their normal use. (A
// built-in browser used to be the other choice; it was removed because it failed too often.)
// Any AI connected over MCP drives it through the browser_*
// tools: it reads the page as numbered text lines and clicks by number, so no
// vision is needed.
//
// The rules live here, in code, not in the AI's instructions:
//   - only instagram.com opens (youtube.com in an account's YouTube window);
//     nothing is typed or clicked while a site asks for a login or a security
//     check (the user does those);
//   - likes, saves and follows are counted and stop at the day's limits, with
//     a pause between them; watch-only and paused accounts get none;
//   - comments, posts, messages, unfollows and profile changes wait for the
//     user to approve them in the hub;
//   - everything done is written to the session log by the browser itself.
//   - X has its own warm-up and limits (likes, reposts, follows counted;
//     posts, replies, messages, unfollows and settings need approval);
//   - YouTube is for uploading Shorts only: in Studio, the final Publish / Save
//     waits for the user's approval and stops at a daily ceiling; on youtube.com
//     itself only links and search can be used (no likes, subscribes, comments),
//     except the one-time Subscribe on Krypt's own channel (shared/kryptFollow.ts).

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import type { ApprovalKind, BrowserSite, BrowserStatus, IgAccount, NetProfile, NetStatus, Network, Site, YtChannelOption, ProfileScan } from '../shared/types';
import { REWARDS_HOME } from '../shared/campaigns';
import { SLIDE_SITES } from '../shared/slides';
import { studioChannelOf } from '../shared/ytChannel';
import { resolveYtChannel } from './ytChannel';
import { NETWORKS, NETWORK_LABEL, isNetwork, linkOn, localDate, netOf, normalizeHandle, planFor, postGap, quotaKeys, quotaLabel, sameHandle, siteOn, watchOnlyOn, ytLimit, ytUploadsToday, type Quota } from '../shared/warmup';
import { rewriteNote, textProblems, type TextKind } from '../shared/humanText';
import { HUMAN_CHECK_HOURS, humanCheckUntil } from '../shared/humanCheck';
import { followsKrypt, kryptAccountsOn, isKryptOwn, isKryptPage, isSubscribeButton, isSubscribedButton, kryptFollowDue, kryptFollowLine, kryptKey, kryptRepostDue, kryptTarget, kryptVisitDue, kryptVisitOf, kryptVisitsLine, onKryptPost, showsFollowing, type KryptAccount } from '../shared/kryptFollow';
import * as approvals from './approvals';
import * as chrome from './chromeBridge';
import type { ChromeConn, ChromeEvent } from './chromeBridge';
import { PAGE_SCRIPT } from './pageScript';
import * as store from './store';
import { goalPlaybook } from '../shared/goals';
import * as proxy from './proxy';
import * as instance from './instance';
import * as perf from './perf';
import { WINDOW_SIZES } from '../shared/perf';

const WORLD = 1717;
const HOME = 'https://www.instagram.com/';
const IG_HOST = /(^|\.)instagram\.com$/i;
/** Signing in can pass through Facebook / Meta pages; the user may go there, the AI may not act there. */
const SIGN_IN_HOST = /(^|\.)(instagram\.com|facebook\.com|meta\.com)$/i;
const GATED_PATH = /^\/(accounts\/(login|emailsignup|password|onetap|suspended|disabled)|challenge|auth_platform|two_factor)/i;
const APPROVAL_WAIT_MS = 45_000;

const YT_HOME = 'https://studio.youtube.com/';
const YT_UPLOAD = 'https://www.youtube.com/upload';
const YT_HOST = /(^|\.)youtube\.com$/i;
const STUDIO_HOST = /^studio\.youtube\.com$/i;
/** Signing in to YouTube goes through Google's pages. */
const YT_SIGN_IN_HOST = /(^|\.)(youtube\.com|google\.com)$/i;
/** Google sign-in and consent pages on youtube.com itself. */
const YT_GATED_HOST = /^(accounts|consent)\.youtube\.com$/i;
const YT_COOKIES = ['SID', '__Secure-3PSID', 'LOGIN_INFO'];

const X_HOME = 'https://x.com/home';
const X_COMPOSE = 'https://x.com/compose/post';
const X_HOST = /(^|\.)(x|twitter)\.com$/i;
/** Signing in to X can go through Google or Apple. */
const X_SIGN_IN_HOST = /(^|\.)(x\.com|twitter\.com|google\.com|apple\.com)$/i;
const X_GATED_PATH = /^\/(i\/flow\/(login|signup|password_reset|single_sign_on|consent_flow)|login|logout|account\/(access|login_challenge|login_verification)|i\/flow\/two_factor)/i;
const X_POST_URL = /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]{1,15}\/status\/\d+/i;

const TT_HOME = 'https://www.tiktok.com/foryou';
const TT_UPLOAD = 'https://www.tiktok.com/tiktokstudio/upload';
const TT_HOST = /(^|\.)tiktok\.com$/i;
/** Signing in to TikTok can go through Google, Apple, Facebook or X. */
const TT_SIGN_IN_HOST = /(^|\.)(tiktok\.com|google\.com|apple\.com|facebook\.com|x\.com|twitter\.com)$/i;
const TT_GATED_PATH = /^\/(login|signup|logout|passport|auth)(\/|$)/i;
const TT_VIDEO_URL = /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._]+\/(video|photo)\/\d+/i;
/** TikTok Studio, where videos are posted. */
const TT_STUDIO_PATH = /^\/(tiktokstudio|creator-center|upload)(\/|$)/i;

const FB_HOME = 'https://www.facebook.com/';
/** Meta Business Suite's Reels composer: posts as the Page picked at its top. */
const FB_UPLOAD = 'https://business.facebook.com/latest/reels_composer';
const FB_HOST = /(^|\.)facebook\.com$/i;
const FB_SIGN_IN_HOST = /(^|\.)(facebook\.com|meta\.com|fb\.com|messenger\.com)$/i;
const FB_GATED_PATH = /^\/(login|login\.php|checkpoint|two_step_verification|recover|confirmemail|authentication)(\/|$|\?)/i;
const FB_POST_URL = /^https:\/\/(www\.|m\.)?facebook\.com\/(reel\/\d+|watch\/?\?v=|[^/]+\/(videos|posts)\/)/i;
/** Business Suite and the Reels / post composers. */
const isFbComposer = (url: string): boolean => /^business\./i.test(hostOf(url)) || /^\/reels?\/create/i.test(pathOf(url));

const TH_HOME = 'https://www.threads.com/';
/** Threads' own "new thread" link (a web intent): it opens the composer. */
const TH_COMPOSE = 'https://www.threads.com/intent/post';
const TH_HOST = /(^|\.)threads\.(com|net)$/i;
/** Threads signs in with the Instagram account (or a Meta account). */
const TH_SIGN_IN_HOST = /(^|\.)(threads\.com|threads\.net|instagram\.com|facebook\.com|meta\.com)$/i;
const TH_GATED_PATH = /^\/(login|accounts\/login|challenge|oauth)(\/|$)/i;
const TH_POST_URL = /^https:\/\/(www\.)?threads\.(com|net)\/@[A-Za-z0-9._]+\/post\/[A-Za-z0-9_-]+/i;

const PIN_HOME = 'https://www.pinterest.com/';
const PIN_UPLOAD = 'https://www.pinterest.com/pin-creation-tool/';
/** pinterest.com (with its country subdomains, uk.pinterest.com …) and its country domains. */
const PIN_HOST = /(^|\.)pinterest\.(com|co\.uk|ca|com\.au|de|fr)$/i;
const PIN_SIGN_IN_HOST = /(^|\.)(pinterest\.(com|co\.uk|ca|com\.au|de|fr)|google\.com|facebook\.com|apple\.com)$/i;
const PIN_GATED_PATH = /^\/(login|signup|password|_\/_\/authentication|oauth)(\/|$)/i;
const PIN_URL = /^https:\/\/([a-z]+\.)?pinterest\.[a-z.]+\/pin\/[A-Za-z0-9_-]+/i;
const PIN_CREATE_PATH = /^\/(pin-creation-tool|pin-builder|idea-pin-builder)(\/|$)/i;

/** What differs between the sites an account's windows can be on. */
interface SiteDef {
  label: string;
  home: string;
  /** Where the AI may act. */
  host: RegExp;
  /** Where the user may go in the window (signing in). */
  signIn: RegExp;
  /** A login / security / consent page: the user's to handle. */
  gated(url: string): boolean;
  domain: string;
}

const RW_HOST = /(^|\.)contentrewards\.com$/i;
/** Content Rewards signs in through Whop, Discord, Google or Apple. */
const RW_SIGN_IN_HOST = /(^|\.)(contentrewards\.com|whop\.com|discord\.com|google\.com|apple\.com)$/i;
const RW_GATED_PATH = /^\/(login|signin|sign-in|signup|auth|oauth)(\/|$)/i;

const SITES: Record<BrowserSite, SiteDef> = {
  rewards: { label: 'Content Rewards', home: REWARDS_HOME, host: RW_HOST, signIn: RW_SIGN_IN_HOST, gated: (u) => RW_GATED_PATH.test(pathOf(u)), domain: 'contentrewards.com' },
  instagram: { label: 'Instagram', home: HOME, host: IG_HOST, signIn: SIGN_IN_HOST, gated: (u) => GATED_PATH.test(pathOf(u)), domain: 'instagram.com' },
  youtube: { label: 'YouTube', home: YT_HOME, host: YT_HOST, signIn: YT_SIGN_IN_HOST, gated: (u) => YT_GATED_HOST.test(hostOf(u)), domain: 'youtube.com' },
  x: { label: 'X', home: X_HOME, host: X_HOST, signIn: X_SIGN_IN_HOST, gated: (u) => X_GATED_PATH.test(pathOf(u)), domain: 'x.com' },
  tiktok: { label: 'TikTok', home: TT_HOME, host: TT_HOST, signIn: TT_SIGN_IN_HOST, gated: (u) => TT_GATED_PATH.test(pathOf(u)), domain: 'tiktok.com' },
  facebook: { label: 'Facebook', home: FB_HOME, host: FB_HOST, signIn: FB_SIGN_IN_HOST, gated: (u) => FB_GATED_PATH.test(pathOf(u)), domain: 'facebook.com' },
  threads: { label: 'Threads', home: TH_HOME, host: TH_HOST, signIn: TH_SIGN_IN_HOST, gated: (u) => TH_GATED_PATH.test(pathOf(u)), domain: 'threads.com' },
  pinterest: { label: 'Pinterest', home: PIN_HOME, host: PIN_HOST, signIn: PIN_SIGN_IN_HOST, gated: (u) => PIN_GATED_PATH.test(pathOf(u)), domain: 'pinterest.com' },
};

const siteOfUrl = (url: string): BrowserSite | null => {
  const h = hostOf(url);
  return RW_HOST.test(h) ? 'rewards' : IG_HOST.test(h) ? 'instagram' :YT_HOST.test(h) ? 'youtube' : X_HOST.test(h) ? 'x' : TT_HOST.test(h) ? 'tiktok' : FB_HOST.test(h) ? 'facebook' : TH_HOST.test(h) ? 'threads' : PIN_HOST.test(h) ? 'pinterest' : null;
};
/** The account has this network turned on (Instagram always). */
const NOT_ON = (a: IgAccount, site: Site): string =>
  `${site === 'youtube' ? 'YouTube Shorts' : SITES[site].label} is not turned on for ${a.handle}. Ask the user; they turn it on on the Accounts page (or save_account with ${site}: true once they agree).`;
/** Save an account's settings on one of its networks. */
const saveNet = (id: string, n: Network, v: NetProfile): void => {
  store.saveAccount({ id, [n]: v });
};

export interface Outcome {
  ok: boolean;
  text: string;
  images?: Array<{ data: string; mimeType: string }>;
}

interface Tab {
  accountId: string;
  site: BrowserSite;
  s: Surface;
  /** Chrome accounts: the Chrome profile it runs in. */
  conn?: ChromeConn;
  signedInAs?: string;
  /** YouTube: the Studio channel last seen in this window. */
  channelId?: string;
  channelName?: string;
  /** The page's size at the last listing (for scrolling). */
  vw: number;
  vh: number;
  /** When the last like / save / follow went out. */
  lastCounted: number;
  /** Engagement actions in a row without a real break (for the longer pauses). */
  streak?: number;
  /** Where the mouse was left (each click moves from there). */
  mouse?: { x: number; y: number };
  /** When the page last moved on (a scroll, another page): reading time counts from here. */
  lastMove?: number;
  /** The page last listed (a new one is a move). */
  seenUrl?: string;
  /** The post the last like / follow / repost / save went to. */
  lastPost?: string;
  /** X / Threads: the post a Repost menu was last opened on (the menu is drawn outside the post). */
  menuPost?: { url: string; creator: string; at: number };
  /** A post was just sent here: the tab stays open until then so the upload can finish. */
  settleUntil?: number;
  /** The hub closed this tab (the entry stays so its pacing carries over when it opens again). */
  closed?: boolean;
  /** A navigation the guard stopped since the last tool result. */
  blocked: string | null;
  queue: Promise<unknown>;
}

interface Snap {
  url: string;
  title: string;
  y: number;
  max: number;
  w: number;
  h: number;
  modal: string;
  lang: string;
  me: string | null;
  /** TikTok's security check is showing. */
  captcha?: boolean;
  channel: { id: string; name: string } | null;
  lines: string[];
  more: number;
}

interface Target {
  gone?: boolean;
  /** Words in the post around it (reading time). */
  words?: number;
  x: number;
  y: number;
  name: string;
  role: string;
  tag: string;
  type: string;
  href: string;
  covered: string;
  dialog: string;
  texts: Array<{ name: string; value: string; dlg?: boolean }>;
  /** The open dialog's text (X: "Replying to @…"). */
  dialogText: string;
  /** The element's data-testid (X names its buttons this way). */
  testid: string;
  /** aria-pressed="true" (TikTok's like / favorite buttons when already on). */
  pressed?: boolean;
  editable: boolean;
  value: string;
  lang: string;
  url: string;
  postUrl: string;
  creator: string;
  /** The thread a comment or message sent from here goes into (pageScript threadOf). */
  thread?: string;
}

interface Focus {
  editable: boolean;
  name?: string;
  value?: string;
  search?: boolean;
  multiline?: boolean;
  dialog?: string;
  url?: string;
  postUrl?: string;
  creator?: string;
  /** The thread a message or comment typed here goes into (pageScript threadOf). */
  thread?: string;
  lang?: string;
}

interface Deps {
  onStatus(s: BrowserStatus[]): void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

const tabs = new Map<string, Tab>();
let deps: Deps = { onStatus: () => {}, log: () => {} };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** How long a pressed upload button gets to open its file chooser (the extension waits the same). */
const CHOOSER_WAIT_MS = 8000;
const rand =(a: number, b: number): number => a + Math.random() * (b - a);

export function init(d: Deps): void {
  deps = d;
}

// ── Where an account's Instagram runs ──────────────────────────────────────
/** A page the tools can read and send real input to: a tab in the user's own Chrome. */
interface Surface {
  kind: 'chrome';
  /** What results call it. */
  place: string;
  alive(): boolean;
  url(): Promise<string>;
  /** Open it (where it already is, or on Instagram's home) or go to a page. */
  load(url?: string): Promise<void>;
  /** Run an expression next to the page script, in a world the page's own scripts can't see. */
  evaluate<T>(expr: string): Promise<T>;
  cdp<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T>;
  /**
   * For upload buttons that only make their file input when pressed (Meta Business Suite's "Add Video"): hold back the
   * system file dialog, run `press` (a real click on the button), and give the chooser that opens these files.
   * False when pressing opened no chooser.
   */
  chooseFiles(press: () => Promise<void>, files: string[]): Promise<boolean>;
  cookies(): Promise<{ loggedIn: boolean; userId?: string }>;
  back(): Promise<boolean>;
  reveal(focus: boolean): Promise<void>;
  close(force?: boolean): void;
}

const keyOf = (accountId: string, site: BrowserSite): string => `${accountId}|${site}`;
const tabOf = (accountId: string, site: BrowserSite): Tab | undefined => tabs.get(keyOf(accountId, site));
const tabsOf = (accountId: string): Array<[string, Tab]> => [...tabs].filter(([, t]) => t.accountId === accountId);
/** A tab that is open: its Chrome profile is connected and the hub has not closed it since. */
const isOpen = (t: Tab): boolean => t.s.alive() && !t.closed;
/** The hub closes one of its tabs. */
function closeIt(t: Tab): void {
  t.s.close();
  t.closed = true;
}
/** Marketo tabs open right now (Setup > Performance). */
export const openTabCount = (): number => [...tabs.values()].filter(isOpen).length;

function newTab(a: IgAccount, site: BrowserSite, surface: (tab: Tab) => Surface, conn?: ChromeConn): Tab {
  const tab = { accountId: a.id, site, conn, lastCounted: 0, blocked: null, vw: 1280, vh: 800, queue: Promise.resolve() } as Tab;
  tab.s = surface(tab);
  tabs.set(keyOf(a.id, site), tab);
  return tab;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};
const pathOf = (url: string): string => {
  try {
    return new URL(url).pathname;
  } catch {
    return '';
  }
};

// ── The user's own Chrome, through the extension ───────────────────────────
const CHROME_ERRORS: Array<[RegExp, string]> = [
  [/^STOPPED_BY_USER/, 'The user paused AI control in Chrome (Cancel on its "Krypt Marketo started debugging this browser" bar, or Pause in the extension). Stop here and ask them. It unlocks after 5 minutes, or when they press Resume in the extension.'],
  [/^NO_TAB/, 'The tab in Chrome was closed. browser_open opens it again.'],
  [/^NOT_INSTAGRAM/, 'The Chrome tab is not on instagram.com. browser_open goes back to Instagram.'],
  [/^NOT_YOUTUBE/, 'The Chrome tab is not on youtube.com. browser_open with site "youtube" goes back to YouTube Studio.'],
  [/^NOT_X/, 'The Chrome tab is not on x.com. browser_open with site "x" goes back to X.'],
  [/^NOT_TIKTOK/, 'The Chrome tab is not on tiktok.com. browser_open with site "tiktok" goes back to TikTok.'],
  [/^NOT_FACEBOOK/, 'The Chrome tab is not on facebook.com. browser_open with site "facebook" goes back to Facebook.'],
  [/^NOT_THREADS/, 'The Chrome tab is not on threads.com. browser_open with site "threads" goes back to Threads.'],
  [/^NOT_PINTEREST/, 'The Chrome tab is not on pinterest.com. browser_open with site "pinterest" goes back to Pinterest.'],
  [/^Unknown command chooser/, 'The Krypt Marketo extension in Chrome is an older version that cannot use this uploader (it needs 0.7). The user reloads it (chrome://extensions > Krypt Marketo > the reload arrow), then try again.'],
  [/^Unknown site/,'The Krypt Marketo extension in Chrome is an older version without this site. The user reloads it (chrome://extensions > Krypt Marketo > reload), then try again.'],
  [/^ATTACH_FAILED/, 'Chrome would not let Krypt Marketo control the tab. If DevTools is open on that tab the user closes it; then try again.'],
  [/^NOT_ALLOWED/, 'The Chrome extension does not allow that.'],
];

function chromeError(e: unknown): Error {
  const m = (e as Error)?.message ?? String(e);
  return new Error(CHROME_ERRORS.find(([re]) => re.test(m))?.[1] ?? m);
}

/**
 * Setup > Performance: how new Marketo windows open in Chrome. Nothing is added for today's settings (the extension's
 * own 1320x920 window). One window: not while one of this Chrome profile's tabs has a post going up (a tab put behind
 * another one is hidden, and a hidden upload slows down).
 */
function openLayout(conn: ChromeConn): Record<string, unknown> {
  const v = perf.values();
  const out: Record<string, unknown> = {};
  if (v.windowSize !== 'normal') Object.assign(out, { width: WINDOW_SIZES[v.windowSize].w, height: WINDOW_SIZES[v.windowSize].h });
  if (v.oneWindow && ![...tabs.values()].some((t) => t.conn === conn && isOpen(t) && (t.settleUntil ?? 0) > Date.now())) out.oneWindow = true;
  return out;
}

function chromeSurface(conn: ChromeConn, site: BrowserSite): Surface {
  /** The isolated world the page script lives in, for the document now showing. */
  let world: number | null = null;
  const cdp = async <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> => {
    try {
      return await conn.send<T>('cdp', { method, params, site }, 30_000);
    } catch (e) {
      throw chromeError(e);
    }
  };
  return {
    kind: 'chrome',
    place: `${SITES[site].label} tab in Chrome`,
    alive: () => conn.alive,
    url: async () => (await conn.send<{ url: string }>('info', { site })).url,
    async load(url) {
      world = null;
      try {
        await conn.send('open', { url, site, ...openLayout(conn) }, 40_000);
      } catch (e) {
        throw chromeError(e);
      }
      await sleep(rand(900, 1500));
    },
    async evaluate<T>(expr: string): Promise<T> {
      for (let attempt = 0; ; attempt++) {
        try {
          if (world === null) {
            const tree = await cdp<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree');
            world = (await cdp<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'krypt-marketo' })).executionContextId;
          }
          const r = await cdp<{ result: { value?: unknown }; exceptionDetails?: { text?: string; exception?: { description?: string } } }>('Runtime.evaluate', {
            expression: `${PAGE_SCRIPT}\n${expr}`,
            contextId: world,
            returnByValue: true,
            awaitPromise: true,
          });
          if (r.exceptionDetails) throw new Error(`The page script failed: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'unknown error'}`);
          return r.result.value as T;
        } catch (e) {
          // A new page is a new world: the old id is gone. Make one and ask again.
          if (attempt === 0 && world !== null && /context|world|frame/i.test((e as Error).message)) {
            world = null;
            continue;
          }
          throw e;
        }
      }
    },
    cdp,
    async chooseFiles(press, files) {
      // The extension holds back Chrome's file dialog ("arm"), then hands the chooser the files ("set").
      try {
        await conn.send('chooser', { site, op: 'arm' });
      } catch (e) {
        throw chromeError(e);
      }
      try {
        await press();
        return (await conn.send<{ attached: boolean }>('chooser', { site, op: 'set', files }, CHOOSER_WAIT_MS + 10_000)).attached;
      } catch (e) {
        void conn.send('chooser', { site, op: 'off' }, 3000).catch(() => {});
        throw chromeError(e);
      }
    },
    // Content Rewards: whether it is signed in is read off the page (rewardsHead), not from cookies.
    cookies: async () => (site === 'rewards' ? { loggedIn: true } : site === 'youtube' ? { loggedIn: conn.ytLoggedIn } : isNetwork(site) ? { loggedIn: conn.net[site].loggedIn, userId: conn.net[site].userId } : { loggedIn: conn.loggedIn, userId: conn.userId }),
    async back() {
      try {
        await conn.send('back', { site });
        return true;
      } catch {
        return false;
      }
    },
    async reveal(focus) {
      if (focus) await conn.send('show', { site }).catch(() => {});
    },
    close: () => void conn.send('close', { site }).catch(() => {}),
  };
}

/** The extension reported something about a Chrome profile. */
export function onChromeEvent(conn: ChromeConn, ev: ChromeEvent): void {
  for (const [key, t] of tabs) {
    if (t.conn !== conn) continue;
    if (ev.type === 'blocked' && ev.site === t.site) t.blocked = ev.url;
    if (ev.type === 'gone') tabs.delete(key);
  }
  if (ev.type !== 'blocked') void broadcast();
}

const OUTDATED_EXT = 'The Krypt Marketo extension in that Chrome profile is an older version without this site (YouTube needs 0.2, X 0.3, TikTok 0.4, Facebook, Threads and Pinterest 0.5, Content Rewards 0.10). The user reloads it: chrome://extensions > Krypt Marketo > the reload arrow (or Load unpacked again from the folder the Accounts page shows). Then try again.';

/**
 * The Chrome profile an account runs in. When the user picked one for it and that profile is not open, the hub opens
 * it (Chrome starts if it has to) and waits for its extension to connect, so an unattended run does not stop there.
 */
async function chromeFor(a: IgAccount): Promise<ChromeConn> {
  try {
    return chrome.pick(a, store.get().igAccounts);
  } catch (e) {
    if (!chrome.openFor(a)) throw e;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const c = chrome.match(a, store.get().igAccounts);
      if (c) return c;
    }
    throw e;
  }
}

/** Which proxy settings each Chrome connection has been given (a signature of where its traffic goes). */
const chromeProxySig = new WeakMap<ChromeConn, string>();

/**
 * Before anything loads in a Chrome profile: it is on this profile's proxy (or ours is taken away when the profile
 * has none), and a recent check from inside that Chrome profile saw the sticky IP. Throws, and nothing loads, if not.
 */
async function chromeProxyGate(who: string, conn: ChromeConn, forProfile?: string): Promise<void> {
  const dir = chrome.dirOf(conn);
  // Its own proxy (Setup > Performance, a proxy for each Chrome profile), else the Marketo profile's. Read for another
  // profile (Multi run > Chrome profiles): that profile's proxy, never the open one's.
  const eff = forProfile ? proxy.effectiveForProfile(forProfile) : proxy.effectiveFor(dir, perf.values().proxyPerChrome);
  const p = eff.p;
  const other = dir ? proxy.chromeDirsOfOthers().get(dir) : undefined;
  const name = chrome.nameOfDir(dir ?? undefined) || dir || 'that Chrome profile';
  if (other && (p || other.proxied))
    throw new Error(`${who} runs in the Chrome profile "${name}", which the Marketo profile "${other.name}" also uses. ${p ? 'This profile has a proxy' : `"${other.name}" has a proxy`}, and a Chrome profile can only be on one proxy: the user gives each Marketo profile its own Chrome profile (Setup page, Chrome profile).`);
  if (!p) {
    // A Chrome profile this profile uses that still carries a proxy we set (for a profile since switched off): take it away.
    if (chromeProxySig.get(conn) !== eff.sig && versionAtLeast(conn.version, '0.9')) {
      await conn.send('proxy', { on: false }, 10_000).catch(() => {});
      chromeProxySig.set(conn, eff.sig);
    }
    return;
  }
  if (!versionAtLeast(conn.version, '0.9'))
    throw new Error(`This profile has a proxy, and the Krypt Marketo extension in "${name}" is too old to use one (it needs 0.9). The user reloads it: chrome://extensions > Krypt Marketo > the reload arrow. Nothing opened, so nothing went out from this computer's own IP.`);
  if (chromeProxySig.get(conn) !== eff.sig) {
    const r = await conn.send<{ on: boolean; control?: string }>('proxy', await proxy.forChrome(eff.owner), 10_000);
    if (!r?.on)
      throw new Error(`Chrome would not take this profile's proxy in "${name}"${r?.control === 'controlled_by_other_extensions' ? ': another extension (a VPN or proxy extension) controls the proxy there. The user turns that extension off in that Chrome profile' : r?.control === 'not_controllable' ? ': a policy on this computer controls the proxy' : ''}. Nothing opened.`);
    chromeProxySig.set(conn, eff.sig);
  }
  const key = `chrome:${dir ?? conn.key ?? conn.id}`;
  if (proxy.chromeVerified(key, eff.owner)) return;
  const r = await conn
    .send<{ ip: string; country?: string; city?: string }>('ipcheck', {}, 25_000)
    .then((x) => ({ ok: !!x?.ip, ...x }), (e: Error) => ({ ok: false, error: e.message }));
  const why = proxy.refusal(proxy.record(r, eff.owner));
  if (why) throw new Error(eff.owner.includes('::') ? why.replace(/This profile's proxy/g, `The proxy of Chrome profile ${dir}`).replace(/Multi run page \(Proxy\)|Multi run page, Proxy/g, 'Multi run page, Chrome profile proxies') : why);
  proxy.markVerified(key, eff.owner);
}

const versionAtLeast = (v: string, min: string): boolean => {
  const a = v.split('.').map((x) => Number(x) || 0);
  const b = min.split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return true;
};

// ── Setup > Performance: Chrome profiles open at once, and letting go of a platform's tab ──────────
/** When each Chrome profile was last driven, and the platform it was last driven on. */
const connUse = new Map<ChromeConn, { at: number; site: BrowserSite }>();

/** A tool is about to drive this Chrome profile on this platform. */
function noteUse(conn: ChromeConn, site: BrowserSite): void {
  const prev = connUse.get(conn);
  connUse.set(conn, { at: Date.now(), site });
  // The AI moved to another platform in this Chrome profile: stop driving the last one's tab (Chrome's "debugging"
  // bar goes and the page stops being held as focused), unless a post is still going up there.
  if (!prev || prev.site === site || !perf.values().detachOnSwitch) return;
  const settling = [...tabs.values()].some((t) => t.conn === conn && t.site === prev.site && isOpen(t) && (t.settleUntil ?? 0) > Date.now());
  if (!settling) void conn.send('detachSite', { site: prev.site }, 5000).catch(() => {});
}

/** Nothing must close in this Chrome profile now: a post going up, an approval waiting, or a Content Rewards submission due. */
function connBusy(conn: ChromeConn): boolean {
  const now = Date.now();
  const open = [...tabs.values()].filter((t) => t.conn === conn && isOpen(t));
  if (open.some((t) => (t.settleUntil ?? 0) > now || ytUploading(t))) return true;
  const ids = new Set(open.map((t) => t.accountId));
  const handles = store.get().igAccounts.filter((x) => ids.has(x.id)).map((x) => x.handle);
  if (approvals.all().some((x) => (x.state === 'pending' || x.state === 'approved') && handles.some((h) => sameHandle(h, x.handle)))) return true;
  // store.submissions() first turns past-deadline ones to missed, so a stale "due" never keeps a profile open.
  return store.submissions().some((x) => x.status === 'due' && ids.has(x.accountId));
}

/**
 * At most N Chrome profiles with Marketo tabs open (Setup > Performance): before a profile with none opens one, the
 * least recently driven idle profile's Marketo tabs close (the user's own tabs are never touched). A soft cap: when
 * every open profile is busy, it opens anyway and says so in the log.
 */
function makeRoom(conn: ChromeConn): void {
  const max = perf.values().maxChromeProfiles;
  if (!(max > 0)) return;
  const live = new Set([...tabs.values()].filter((t) => t.conn && isOpen(t)).map((t) => t.conn!));
  if (live.has(conn) || live.size < max) return;
  const idle = [...live].filter((c) => !connBusy(c)).sort((x, y) => (connUse.get(x)?.at ?? 0) - (connUse.get(y)?.at ?? 0));
  const over = live.size - max + 1;
  if (idle.length < over) deps.log('info', `[browser] ${live.size} Chrome profiles are open and busy: opening one more than the ${max} set (Setup > Performance)`);
  for (const c of idle.slice(0, over)) {
    let n = 0;
    for (const t of tabs.values())
      if (t.conn === c && isOpen(t)) {
        closeIt(t);
        n++;
      }
    connUse.delete(c);
    // Opened again later, its first page waits for a fresh IP check.
    const dir = chrome.dirOf(c);
    proxy.forgetVerified(`chrome:${dir ?? c.key ?? c.id}`);
    deps.log('info', `[browser] closed ${n} Marketo tab(s) in Chrome profile ${chrome.nameOfDir(dir ?? undefined) || dir || `#${c.id}`}: at most ${max} open at once (Setup > Performance)`);
  }
  void broadcast();
}

async function ensureTab(a: IgAccount, site: BrowserSite, url?: string): Promise<Tab> {
  let tab = tabOf(a.id, site);
  // Every account runs in a real Chrome profile (the built-in browser was removed: it failed too often).
  const conn = await chromeFor(a);
  if (!conn.sites.includes(site)) throw new Error(OUTDATED_EXT);
  makeRoom(conn);
  // The profile's proxy first: nothing loads before it is in place and checked.
  await chromeProxyGate(a.handle, conn);
  if (tab && (!tab.s.alive() || tab.conn !== conn)) {
    // The account moved to another Chrome profile.
    tabs.delete(keyOf(a.id, site));
    tab = undefined;
  }
  const t = tab ?? newTab(a, site, () => chromeSurface(conn, site), conn);
  // Always through the extension's open: a tab the user (or browser_close) closed is opened again, and one that is still
  // there only comes to the front, on the page it is on (it never navigated without a url).
  await t.s.load(url);
  t.closed = false;
  await t.s.reveal(false);
  void broadcast();
  return t;
}

async function statusOf(a: IgAccount): Promise<BrowserStatus> {
  const yt = !!a.youtube?.enabled;
  const c = chrome.match(a, store.get().igAccounts);
  return {
    accountId: a.id,
    handle: a.handle,
    via: 'chrome',
    connected: !!c,
    open: !!c?.tabOpen,
    loggedIn: !!c?.loggedIn,
    signedInAs: c?.loggedIn ? c.me : undefined,
    url: c?.tabOpen ? c.tabUrl : undefined,
    ...(yt ? { youtube: { open: !!c?.ytTabOpen, loggedIn: !!c?.ytLoggedIn, outdated: !!c && !c.sites.includes('youtube'), url: c?.ytTabOpen ? c.ytTabUrl : undefined } } : {}),
    ...Object.fromEntries(
      NETWORKS.filter((n) => netOf(a, n)?.enabled).map((n): [Network, NetStatus] => {
        const k = c?.net[n];
        return [n, { open: !!k?.tabOpen, loggedIn: !!k?.loggedIn, signedInAs: k?.loggedIn ? k.me : undefined, outdated: !!c && !c.sites.includes(n), url: k?.tabOpen ? k.tabUrl : undefined }];
      }),
    ),
  };
}

export async function statusAll(): Promise<BrowserStatus[]> {
  return Promise.all(store.get().igAccounts.map(statusOf));
}

async function broadcast(): Promise<void> {
  try {
    deps.onStatus(await statusAll());
  } catch {
    /* the hub is closing */
  }
}

// ── What the user does from the hub ────────────────────────────────────────
export async function openForUser(accountId: string, url?: string, site?: Site): Promise<void> {
  const a = store.findAccount(accountId);
  const found = url ? siteOfUrl(url) : null;
  const s: Site = site ?? (found && found !== 'rewards' ? found : null) ?? 'instagram';
  if (url && !(SITES[s].host.test(hostOf(url)) && /^https:/i.test(url))) throw new Error(`Only ${SITES[s].domain} pages open here.`);
  if (!siteOn(a, s)) throw new Error(`${s === 'youtube' ? 'YouTube Shorts' : SITES[s].label} is not turned on for ${a.handle}. Edit the account to turn it on.`);
  const tab = await ensureTab(a, s, url);
  await tab.s.reveal(true);
}

export function closeTab(accountId: string, site?: BrowserSite): void {
  for (const [, tab] of tabsOf(accountId)) if ((!site || tab.site === site) && isOpen(tab)) closeIt(tab);
}

/** A deleted account: Marketo lets go of its Chrome tabs (Chrome keeps its own sign-ins). */
export function forget(accountId: string): void {
  for (const [key] of tabsOf(accountId)) tabs.delete(key);
  void broadcast();
}

export function closeAll(): void {
  tabs.clear();
  // Chrome tabs stay open; the hub just stops controlling them.
  chrome.releaseAll();
}

// ── Page access ────────────────────────────────────────────────────────────
const inPage = <T>(tab: Tab, expr: string): Promise<T> => tab.s.evaluate<T>(expr);
const cdp = <T = unknown>(tab: Tab, method: string, params: Record<string, unknown> = {}): Promise<T> => tab.s.cdp<T>(method, params);

/**
 * The pause before a like / save / follow / repost: uneven, and after a few in a row now and then a longer break, the
 * way a person reads, scrolls on and comes back. Bursts of quick actions are what get accounts checkpointed (Threads
 * asked @yuhgodev to confirm it was human after ~17 actions in 3.5 minutes, 2026-11-22).
 */
async function engagePause(tab: Tab): Promise<void> {
  const since = Date.now() - tab.lastCounted;
  tab.streak = since < 90_000 ? (tab.streak ?? 0) + 1 : 0;
  let want = rand(7000, 16000);
  if (tab.streak >= 3 && Math.random() < 0.35) {
    want = rand(20000, 45000);
    tab.streak = 0;
  }
  if (want > since) await sleep(want - since);
}

/** A web address as Threads would turn it into a link (a bare domain like krypt.cc/tools counts). */
const LINK_RE = /(https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9][a-z0-9-]*\.(com|cc|io|net|org|gg|app|dev|co|ai|xyz|me|tv|ly|link|sh|so|to|us|uk)(\/\S*)?(?=$|[\s),.!?]))/i;
/** Text with links, tags, case and punctuation taken out, to tell a copied caption from a new one. */
const plainText = (s: string): string =>
  s
    .toLowerCase()
    .replace(new RegExp(LINK_RE.source, 'gi'), ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * Why a Threads post or reply can't go out as written (null = fine). Threads is the harshest about new accounts that post
 * links and the same promo everywhere: posts never carry a link (it goes in our own first reply, after warm-up), one
 * topic tag at most, no YouTube "#Shorts", and never the reel's caption word for word from another platform.
 */
function threadsTextRule(a: IgAccount, kind: 'post' | 'comment', text: string, thread: string): string | null {
  const warm = planFor(a, store.get().sessions, undefined, 'threads').phase.id !== 'active';
  if (LINK_RE.test(text)) {
    if (kind === 'post')
      return `No links in a Threads post: post it without the address${warm ? '. During the Threads warm-up (until the Active phase) no links go anywhere on Threads' : '; the link can go in our own first reply under it'}. Naming the product is fine (a name like pump.fun is written without the dot).`;
    if (warm) return 'No links on Threads during its warm-up (until the Active phase): send the reply without the address.';
    const me = netOf(a, 'threads')?.handle;
    const owner = /threads\.(?:com|net)\/@([\w.]+)\/post\//i.exec(thread)?.[1];
    if (!me || !owner || !sameHandle(owner, me)) return 'Links only go in replies on our own Threads posts, never under someone else\'s: send it without the address.';
  }
  if (kind === 'post') {
    if (/#shorts\b/i.test(text)) return '"#Shorts" is YouTube\'s tag: take it out and post again.';
    const tags = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu) ?? [];
    if (tags.length > 1) return `Threads takes one topic tag per post and this has ${tags.length}: keep the one that fits best (or none) and take the rest out.`;
    // The same caption as the reel (it goes on every platform) or another platform's post: Threads gets its own text.
    const mine = plainText(text);
    if (mine.length >= 25) {
      const d = store.get();
      const others = [...d.reels.map((r) => r.caption ?? ''), ...d.posts.filter((p) => p.site !== 'threads').map((p) => (p as { text?: string }).text ?? '')];
      if (others.some((o) => o && plainText(o) === mine))
        return "This is the reel's caption word for word, the same text as on the other platforms. Write Threads its own: one or two short lines like people type there (a question or a take), no link, at most one tag.";
    }
  }
  return null;
}

/** Text-first platforms: the post has to be read before acting on it (videos make their own time by playing). */
const READ_SITES = new Set<BrowserSite>(['threads', 'x', 'pinterest', 'facebook']);

/** How long reading a post of this many words takes a person: a glance, then about 4 words a second. */
const readMs = (words: number): number => Math.min(35_000, rand(3000, 5500) + Math.min(words, 400) * rand(180, 260));

const clockOf = (t: number): string => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const dayClockOf = (t: number): string => new Date(t).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

/** Pages a platform shows when it wants proof the account is a person (a login page is not one). */
const HUMAN_CHECK_PATH = /^\/(accounts\/suspended|challenge|checkpoint|account\/access)\b/i;

/** A platform asked this account to prove it is human: record it, so the platform stays read-only for a while (shared/humanCheck.ts). */
async function noteHumanCheck(tab: Tab, a: IgAccount, url: string, captcha?: boolean): Promise<void> {
  if (tab.site === 'rewards' || tab.site === 'youtube') return;
  // TikTok's puzzle on its own login form is part of signing in.
  if (captcha && SITES[tab.site].gated(url) && !HUMAN_CHECK_PATH.test(pathOf(url))) captcha = false;
  if (!captcha && !HUMAN_CHECK_PATH.test(pathOf(url))) return;
  // A code or approval step while signing in is not a check on a working account: only a signed-in one counts.
  if (!(await tab.s.cookies().catch(() => ({ loggedIn: false }))).loggedIn) return;
  const fresh = store.findAccount(a.id);
  const was = Date.parse(fresh.humanCheck?.[tab.site] ?? '');
  // The same check seen again while it is still up is not a new one.
  if (Number.isFinite(was) && Date.now() - was < 30 * 60_000) return;
  store.saveAccount({ id: a.id, humanCheck: { ...(fresh.humanCheck ?? {}), [tab.site]: new Date().toISOString() } });
  deps.log('warn', `[browser] ${a.handle} ${SITES[tab.site].label} asked it to prove it is human (${pathOf(url) || 'a puzzle'}): read-only there for ${HUMAN_CHECK_HOURS}h`);
}

/** How often a run on a platform only reads (people often open an app and just scroll): Threads one in four, the rest one in six. */
const BROWSE_ODDS = (site: Site): number => (site === 'threads' ? 0.25 : site === 'youtube' ? 0 : 1 / 6);
/** Browse-only runs, per account and platform. Rolled when get_today plans the run and held for 90 minutes. */
const browseRuns = new Map<string, { on: boolean; until: number }>();
export function browseRun(a: IgAccount, site: Site): { on: boolean; until: number } {
  const now = Date.now();
  const key = `${a.id}|${site}`;
  let r = browseRuns.get(key);
  if (!r || r.until <= now) {
    r = { on: Math.random() < BROWSE_ODDS(site), until: now + 90 * 60_000 };
    browseRuns.set(key, r);
  }
  return r;
}

/** A browse-only run is going on this platform now (only looks: never rolls a new one). */
export function browseOn(a: Pick<IgAccount, 'id'>, site: BrowserSite): boolean {
  const r = browseRuns.get(`${a.id}|${site}`);
  return !!r?.on && r.until > Date.now();
}

/** The refusal while a platform is read-only after a human check (null = no hold). */
function humanCheckHold(a: IgAccount, site: BrowserSite): string | null {
  if (site === 'youtube' || site === 'rewards') return null;
  const until = humanCheckUntil(a, site);
  if (!until) return null;
  const L = SITES[site].label;
  return `${L} asked ${a.handle} to prove it is human (${clockOf(Date.parse(a.humanCheck?.[site] ?? ''))}). For ${HUMAN_CHECK_HOURS} hours after, the hub keeps ${L} read-only: scroll and read only, no likes, follows, replies, reposts or posts, until ${dayClockOf(until)}. Close this session with log_session and move on.`;
}

/** When this account last posted on the platform (a Post click not yet confirmed counts too). */
function lastPostAt(a: IgAccount, site: Site): number {
  const d = store.get();
  let last = postClicks.get(`${a.id}|${site}`) ?? 0;
  for (const r of d.reels) {
    const at = linkOn(r, site)?.at;
    if (at && (!r.postedBy || sameHandle(r.postedBy, a.handle))) last = Math.max(last, Date.parse(at) || 0);
  }
  for (const p of d.posts) if (p.site === site && p.postedAt && sameHandle(p.handle, a.handle)) last = Math.max(last, Date.parse(p.postedAt) || 0);
  return last <= Date.now() + 60_000 ? last : 0;
}

/** X / Threads: this button opens the Repost menu (Repost / Quote). */
const opensRepostMenu = (site: BrowserSite, t: Target): boolean => (site === 'x' && t.testid === 'retweet') || (site === 'threads' && /^repost\b/i.test(t.name.trim()));

/** A Repost item in a menu drawn outside any post belongs to the post the menu was just opened on. */
function fromMenu(tab: Tab, t: Target): void {
  const m = tab.menuPost;
  if (!m || t.words || Date.now() - m.at > 120_000) return;
  t.postUrl = m.url;
  t.creator = m.creator || t.creator;
}

/** Why this like / follow / repost / save has to wait for more reading (null = go ahead). */
function readFirst(tab: Tab, a: IgAccount, t: Target): string | null {
  const now = Date.now();
  const L = SITES[tab.site].label;
  if (tab.site !== 'rewards' && tab.site !== 'youtube') {
    const r = browseRuns.get(`${a.id}|${tab.site}`);
    if (r?.on && r.until > now)
      return `This is a browse-only run on ${L} (the hub makes some runs just reading, the way people open the app and only scroll): watch, read and scroll, answer replies on our own posts, post if one is due, but no likes, follows, saves or reposts until ${clockOf(r.until)}.`;
    // Right after a post, a person looks at it, its comments and the feed for a few minutes before engaging again.
    const posted = lastPostAt(a, tab.site);
    const quiet = posted ? posted + (5 + (Math.floor(posted / 1000) % 6)) * 60_000 : 0;
    if (quiet > now)
      return `Posted on ${L} at ${clockOf(posted)}: for a few minutes after a post only reading and watching (our post, its comments, the feed; answering comments on our post is fine). Likes, follows, saves and reposts can go again after ${clockOf(quiet)}.`;
  }
  // Acting down a list without moving on is what bots do: between two posts, scroll or open the next one.
  const key = t.postUrl || t.url;
  if (tab.lastCounted && key !== tab.lastPost && (tab.lastMove ?? 0) < tab.lastCounted)
    return `Read on first: scroll (browser_scroll) or open the next post before another like, follow or repost on ${SITES[tab.site].label}. Acting down a list without moving is what bots look like; the hub waits for a scroll or a new page between posts.`;
  return null;
}

async function mouseClick(tab: Tab, x: number, y: number): Promise<void> {
  const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  // A hand moves the mouse along a slight curve, fast in the middle and slow at both ends, from wherever it was left.
  const from = tab.mouse ?? { x: base.x + rand(-220, 220), y: base.y + rand(-160, 160) };
  const bend = { x: (from.x + base.x) / 2 + rand(-90, 90), y: (from.y + base.y) / 2 + rand(-70, 70) };
  const steps = Math.round(rand(7, 13));
  for (let i = 1; i < steps; i++) {
    const s = i / steps;
    const e = s < 0.5 ? 2 * s * s : 1 - (-2 * s + 2) ** 2 / 2;
    const px = (1 - e) * (1 - e) * from.x + 2 * (1 - e) * e * bend.x + e * e * base.x;
    const py = (1 - e) * (1 - e) * from.y + 2 * (1 - e) * e * bend.y + e * e * base.y;
    await cdp(tab, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(px), y: Math.round(py) });
    await sleep(rand(8, 24));
  }
  await cdp(tab, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: base.x, y: base.y });
  tab.mouse = { x: base.x, y: base.y };
  await sleep(rand(60, 160));
  await cdp(tab, 'Input.dispatchMouseEvent', { ...base, type: 'mousePressed' });
  await sleep(rand(45, 120));
  await cdp(tab, 'Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' });
}

const KEYS: Record<string, { code: string; vk: number; text?: string }> = {
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Escape: { code: 'Escape', vk: 27 },
  Tab: { code: 'Tab', vk: 9 },
  Backspace: { code: 'Backspace', vk: 8 },
  Space: { code: 'Space', vk: 32, text: ' ' },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 },
  ArrowRight: { code: 'ArrowRight', vk: 39 },
  PageUp: { code: 'PageUp', vk: 33 },
  PageDown: { code: 'PageDown', vk: 34 },
  Home: { code: 'Home', vk: 36 },
  End: { code: 'End', vk: 35 },
};
export const KEY_NAMES = Object.keys(KEYS) as [string, ...string[]];

async function pressKey(tab: Tab, key: string, modifiers = 0): Promise<void> {
  const k = KEYS[key];
  const base = { key: key === 'Space' ? ' ' : key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers };
  await cdp(tab, 'Input.dispatchKeyEvent', { ...base, type: k.text ? 'keyDown' : 'rawKeyDown', ...(k.text ? { text: k.text } : {}) });
  await sleep(rand(30, 80));
  await cdp(tab, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

/** A line break as Shift+Enter: rich editors (X's composer, Instagram's caption) take it as a new line; inserting "\n" as text makes some of them jump to the start. */
async function softBreak(tab: Tab): Promise<void> {
  const base = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, modifiers: 8 };
  await cdp(tab, 'Input.dispatchKeyEvent', { ...base, type: 'keyDown', text: '\r', unmodifiedText: '\r' });
  await sleep(rand(30, 80));
  await cdp(tab, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

/** Shifted symbols on a US keyboard: the key they sit on. */
const SHIFTED: Record<string, string> = { '!': '1', '@': '2', '#': '3', $: '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0', _: '-', '+': '=', '?': '/', ':': ';', '"': "'", '<': ',', '>': '.', '{': '[', '}': ']', '|': '\\', '~': '`' };
const KEY_OF: Record<string, [string, number]> = { ' ': ['Space', 32], '-': ['Minus', 189], '=': ['Equal', 187], ',': ['Comma', 188], '.': ['Period', 190], '/': ['Slash', 191], ';': ['Semicolon', 186], "'": ['Quote', 222], '[': ['BracketLeft', 219], ']': ['BracketRight', 221], '\\': ['Backslash', 220], '`': ['Backquote', 192] };
/** The physical key for a character (code, virtual key, shift), or null for one no US key types (emoji, accents). */
function keyFor(ch: string): { code: string; vk: number; shift: boolean } | null {
  if (/^[a-z]$/.test(ch)) return { code: `Key${ch.toUpperCase()}`, vk: ch.toUpperCase().charCodeAt(0), shift: false };
  if (/^[A-Z]$/.test(ch)) return { code: `Key${ch}`, vk: ch.charCodeAt(0), shift: true };
  if (/^[0-9]$/.test(ch)) return { code: `Digit${ch}`, vk: ch.charCodeAt(0), shift: false };
  const base = SHIFTED[ch];
  if (base) {
    const k = keyFor(base);
    return k ? { ...k, shift: true } : null;
  }
  const k = KEY_OF[ch];
  return k ? { code: k[0], vk: k[1], shift: false } : null;
}
/** Neighbouring letters on the keyboard, for the odd slip that gets corrected. */
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
function neighbour(ch: string): string | null {
  for (const row of ROWS) {
    const i = row.indexOf(ch);
    if (i >= 0) return row[i + (i > 0 && (i === row.length - 1 || Math.random() < 0.5) ? -1 : 1)] ?? null;
  }
  return null;
}
/** One key press: down (typing the character) and up, held a moment like a finger does. */
async function strike(tab: Tab, ch: string): Promise<void> {
  const k = keyFor(ch);
  if (!k) {
    await cdp(tab, 'Input.insertText', { text: ch });
    return;
  }
  const base = { key: ch, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk, modifiers: k.shift ? 8 : 0 };
  await cdp(tab, 'Input.dispatchKeyEvent', { ...base, type: 'keyDown', text: ch, unmodifiedText: k.shift ? ch.toLowerCase() : ch });
  await sleep(rand(35, 105));
  await cdp(tab, 'Input.dispatchKeyEvent', { ...base, type: 'keyUp' });
}

/** The text field still has the focus (key presses that land on the page instead are site shortcuts: "l" likes on X). */
const focusInField = (tab: Tab): Promise<boolean> =>
  inPage<boolean>(tab, `(() => { const e = document.activeElement; return !!e && (e.isContentEditable || /^(input|textarea)$/i.test(e.tagName)); })()`).catch(() => false);

async function typeText(tab: Tab, text: string, rich = false): Promise<void> {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  // Long text (a video description) is pasted, the way people do it: one line at a time as a paste.
  const paste = Array.from(text).length > 400;
  if (!(await focusInField(tab))) throw new Error('The text field lost the focus before typing, so nothing was typed (keys landing on the page can trigger its shortcuts). browser_snapshot and click into the field again.');
  let since = 0;
  for (let l = 0; l < lines.length; l++) {
    if (l > 0) {
      if (rich) await softBreak(tab);
      else await cdp(tab, 'Input.insertText', { text: '\n' });
      await sleep(paste ? rand(60, 140) : rand(250, 700));
    }
    if (paste) {
      if (lines[l]) await cdp(tab, 'Input.insertText', { text: lines[l] });
      await sleep(rand(40, 120));
      continue;
    }
    // A person's pace (about 45-70 words a minute): uneven keys, a beat after a word or a sentence, a pause to think now and then,
    // and once in a while a neighbouring key hit and taken back.
    const chars = Array.from(lines[l]);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const slip = /^[a-z]$/.test(ch) && Math.random() < 0.012 ? neighbour(ch) : null;
      if (slip) {
        await strike(tab, slip);
        await sleep(rand(180, 450));
        await pressKey(tab, 'Backspace');
        await sleep(rand(90, 220));
      }
      await strike(tab, ch);
      since++;
      let gap = rand(55, 160);
      if (ch === ' ') gap += rand(20, 140);
      if (/[.!?,]/.test(ch)) gap += rand(150, 500);
      if (since > rand(25, 70)) {
        gap += rand(600, 1800);
        since = 0;
        if (!(await focusInField(tab))) throw new Error(`The text field lost the focus after ${i + 1} characters, so typing stopped there. browser_snapshot, check what the box holds, and fix it before sending.`);
      }
      await sleep(gap);
    }
  }
}

async function wheel(tab: Tab, total: number): Promise<void> {
  const x = Math.round(tab.vw * rand(0.4, 0.6));
  const y = Math.round(tab.vh * rand(0.4, 0.6));
  const steps = Math.max(2, Math.min(8, Math.round(Math.abs(total) / 160)));
  for (let i = 0; i < steps; i++) {
    await cdp(tab, 'Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: Math.round(total / steps) });
    await sleep(rand(35, 90));
  }
}

// ── Rules ──────────────────────────────────────────────────────────────────
type Counted = 'like' | 'save' | 'follow' | 'repost';
const QUOTA_OF: Record<Counted, keyof Quota> = { like: 'likes', save: 'saves', follow: 'follows', repost: 'reposts' };
const isCounted = (k: Verdict['kind']): k is Counted => k === 'like' || k === 'save' || k === 'follow' || k === 'repost';

interface Verdict {
  kind: Counted | ApprovalKind | 'free' | 'never';
  /** What the approval card says will happen. */
  action?: string;
  text?: string;
  /** 'never': why, when it is not the generic "for the user to press". */
  why?: string;
  /** Ask the user even with approvals switched off (deletes, blocks, reports). */
  always?: boolean;
  /** The one-time Subscribe on Krypt's YouTube channel (a 'free' click that is recorded once it took). */
  krypt?: boolean;
  /** A like on one of Krypt's own Shorts during a visit (paced like engagement, outside any limit). */
  ytLike?: boolean;
}

/** Likes on Krypt's Shorts per account today (a visit likes its one or two newest: this is the ceiling). */
const ytKryptLikes = new Map<string, { day: string; n: number }>();
const YT_KRYPT_LIKES_A_DAY = 3;
const ytKryptLikesToday = (a: IgAccount): number => {
  const r = ytKryptLikes.get(a.id);
  return r && r.day === new Date().toDateString() ? r.n : 0;
};

/** Taking back a like or a repost: people almost never do, and a like flipped off and on again is a bot's mark. */
const UNDO_LABEL = /^(unlike|remove (like|love|care|haha|wow|sad|angry)|undo repost|remove repost)\b/i;

/** What clicking this element does, judged from its label and where it is. */
function classify(t: Target): Verdict {
  const n = t.name.trim().toLowerCase();
  const isButton = t.role === 'button' || t.tag === 'button' || t.type === 'submit';
  const path = pathOf(t.url);
  const text = (pattern: RegExp): string | undefined => (t.texts.find((x) => pattern.test(x.name)) ?? t.texts[0])?.value;

  if (/^(log out|log in|switch|switch accounts|add account|log into another account|delete account|deactivate account)$/.test(n)) return { kind: 'never' };
  if (n === 'like') return { kind: 'like' };
  if (n === 'save') return { kind: 'save' };
  if (n === 'follow' || n === 'follow back') return { kind: 'follow' };
  // Instagram's warm-up allows no reposts: only the daily Krypt repost gets through (toolClick).
  if (n === 'repost' && isButton) return { kind: 'repost' };
  if (n === 'unfollow') return { kind: 'unfollow', action: `Unfollow ${t.creator || 'this account'}` };
  if ((n === 'share' || n === 'post') && isButton && /create|new post|new reel|edit info/i.test(t.dialog)) return { kind: 'post', action: 'Publish this to Instagram', text: text(/caption/i) };
  if ((n === 'post' || n === 'reply') && isButton && t.texts.length) return { kind: 'comment', action: `Post this comment${t.creator ? ` on ${t.creator}'s post` : ''}`, text: text(/comment|reply/i) };
  if ((n === 'send' || n === 'send message') && isButton) return { kind: 'message', action: 'Send this as a direct message', text: text(/message/i) };
  if (isButton && (/^\/accounts\//i.test(path) || /^accountscenter\./i.test(hostOf(t.url)))) return { kind: 'profile', action: `Press "${t.name}" in the account settings`, text: t.texts.map((x) => `${x.name}: ${x.value}`).join('\n') || undefined };
  if (/^(delete|remove|remove follower|block|report|restrict|archive|submit|confirm|save changes|discard)$/.test(n)) return { kind: 'other', action: `Press "${t.name}"`, text: t.texts[0]?.value, always: true };
  return { kind: 'free' };
}

/** YouTube: uploading Shorts in Studio. On youtube.com itself only links and search work. */
function classifyYt(t: Target, a: IgAccount): Verdict {
  const n = t.name.trim().toLowerCase();
  const isButton = t.role === 'button' || t.tag === 'button' || t.type === 'submit';
  const path = pathOf(t.url);
  if (/^(sign out|switch account|add account|delete channel|remove channel|manage your google account)\b/.test(n)) return { kind: 'never' };
  if (!STUDIO_HOST.test(hostOf(t.url))) {
    if (t.tag === 'a' || t.role === 'link' || t.editable || /^search\b/.test(n)) return { kind: 'free' };
    // The one button pressed on youtube.com: Subscribe on Krypt's own channel page, once (shared/kryptFollow.ts).
    const kc = isButton && isSubscribeButton(t.name) ? isKryptPage('youtube', t.url) : null;
    if (kc) {
      if (a.status === 'paused') return { kind: 'never', why: `${a.handle} is paused: nothing is pressed for it. The user un-pauses it on the Warming page.` };
      if (kryptFollowDue(a, 'youtube').includes(kc)) return { kind: 'free', krypt: true };
      return { kind: 'never', why: "The one-time subscribe to Krypt's channel is already done for this account (or this is Krypt's own channel). Nothing to press here." };
    }
    // The other button pressed on youtube.com: Like on one of Krypt's own Shorts, during a visit (shared/kryptFollow.ts).
    const kl = isButton && /^like\b/.test(n) ? onKryptPost('youtube', t) : null;
    if (kl && !isKryptOwn(a, 'youtube', kl)) {
      if (a.status === 'paused') return { kind: 'never', why: `${a.handle} is paused: nothing is pressed for it. The user un-pauses it on the Warming page.` };
      if (t.pressed) return { kind: 'never', why: 'This Short is already liked: pressing again would take the like away. Leave it and move on.' };
      const peers = ytPeers(a);
      if (peers.length)
        return { kind: 'never', why: `This Chrome profile holds more than one YouTube channel (${[a, ...peers].map((p) => p.youtube?.channelName || p.handle).join(', ')}), and YouTube gives a like to whichever one is active, so Shorts are not liked here. Watching to the end is the visit.` };
      if (ytKryptLikesToday(a) >= YT_KRYPT_LIKES_A_DAY) return { kind: 'never', why: `${YT_KRYPT_LIKES_A_DAY} of Krypt's Shorts are already liked today from this channel. Watch only for the rest of today.` };
      return { kind: 'free', ytLike: true };
    }
    return { kind: 'never', why: `"${t.name}" is a button on youtube.com. Marketo only uploads Shorts on YouTube (in YouTube Studio); liking, subscribing and commenting there are not supported (only the one-time Subscribe on Krypt's own channel page and likes on Krypt's own Shorts during a visit). Links and search work.` };
  }
  const field = (re: RegExp): string | undefined => t.texts.find((x) => re.test(x.name))?.value;
  const details = (): string | undefined => {
    const title = field(/title/i);
    const desc = field(/description|tell viewers/i);
    const parts = [title ? `Title: ${title}` : '', desc ? `Description: ${desc}` : ''].filter(Boolean);
    return parts.length ? parts.join('\n') : t.texts.map((x) => x.value).join('\n') || undefined;
  };
  const where = a.youtube?.channelName ? ` (${a.youtube.channelName})` : '';
  if (isButton && /^(publish|schedule|save|update|premiere)$/.test(n)) {
    if (/setting|customi[sz]/i.test(t.dialog) || /\/editing\b|\/settings\b/.test(path)) return { kind: 'profile', action: `Press "${t.name}" in the YouTube channel settings${where}`, text: t.texts.map((x) => `${x.name}: ${x.value}`).join('\n') || undefined };
    // Saving changes to a video that is already up (its details page, no upload dialog) is not a new Short.
    if (!t.dialog && /\/video\//.test(path)) return { kind: 'other', action: `Save the changes to this YouTube video${where}`, text: details() };
    const long = longPending(a);
    if (long) return { kind: 'post', action: `Press "${t.name}" for the long video "${long.title}" on YouTube${where} (saves it with the visibility picked in the dialog)`, text: details() };
    const action = n === 'publish' ? `Publish this Short on YouTube${where}` : n === 'schedule' ? `Schedule this Short on YouTube${where}` : `Press "${t.name}" on this YouTube video${where} (saves it with the visibility picked in the dialog)`;
    return { kind: 'post', action, text: details() };
  }
  // Only with text in the reply box: the same button with nothing typed just opens the box.
  if ((n === 'reply' || n === 'comment' || n === 'post') && isButton && t.texts[0]?.value?.trim()) return { kind: 'other', action: `Post this reply on YouTube${where}`, text: t.texts[0]?.value };
  if (/^(delete|delete forever|remove|block|hide user from channel|report|submit|confirm|discard|discard changes)$/.test(n)) return { kind: 'other', action: `Press "${t.name}" in YouTube Studio${where}`, text: t.texts[0]?.value, always: true };
  return { kind: 'free' };
}

/** X: judged by its data-testid names first (they don't change with the counts in the labels), then by label. */
function classifyX(t: Target): Verdict {
  const n = t.name.trim().toLowerCase();
  const id = t.testid;
  const isButton = t.role === 'button' || t.tag === 'button' || t.type === 'submit' || t.role === 'menuitem';
  const path = pathOf(t.url);
  const who = t.creator || 'this account';
  if (/^(log out|add an existing account|create a new account|deactivate|delete account)\b/.test(n)) return { kind: 'never' };
  if (id === 'like') return { kind: 'like' };
  if (id === 'retweetConfirm') return { kind: 'repost' };
  if (/-follow$/.test(id) || (isButton && /^follow( back)?( @|$)/.test(n))) return { kind: 'follow' };
  if (id === 'unlike' || id === 'unretweetConfirm' || id === 'retweet' || id === 'unretweet' || /-unfollow$/.test(id) || id === 'bookmark' || id === 'removeBookmark') return { kind: 'free' };
  if (id === 'tweetButton' || id === 'tweetButtonInline') {
    const inDialog = !!t.dialog || !!t.dialogText;
    const boxes = t.texts.filter((x) => (inDialog ? x.dlg : !x.dlg) && /post text|what.s happening|post your reply|add another post/i.test(x.name));
    const text = (boxes.length ? boxes : t.texts.filter((x) => (inDialog ? x.dlg : !x.dlg))).map((x) => x.value).join('\n---\n') || undefined;
    const reply = id === 'tweetButtonInline' ? /\/status\/\d+/.test(path) : /replying to/i.test(t.dialogText);
    if (reply) return { kind: 'comment', action: `Reply to ${who === 'this account' ? 'this post' : `${who}'s post`} on X`, text };
    return { kind: 'post', action: /quote/i.test(t.dialogText) ? 'Quote this post on X' : 'Post this on X', text };
  }
  if (id === 'dmComposerSendButton' || (isButton && n === 'send' && /^\/messages/.test(path))) return { kind: 'message', action: 'Send this as a direct message on X', text: t.texts.find((x) => /message/i.test(x.name))?.value ?? t.texts[0]?.value };
  if (id === 'confirmationSheetConfirm') {
    if (/^unfollow/.test(n)) return { kind: 'unfollow', action: `Unfollow ${who} on X` };
    return { kind: 'other', action: `Press "${t.name}" on X`, text: t.dialogText || undefined };
  }
  if (isButton && (/^\/settings\//i.test(path) || /edit profile/i.test(t.dialog)) && /^(save|confirm|done|update|apply|next|delete|remove)\b/.test(n)) return { kind: 'profile', action: `Press "${t.name}" in the X profile / settings`, text: t.texts.map((x) => `${x.name}: ${x.value}`).join('\n') || undefined };
  if (isButton && /^(delete|block|report|mute|remove|submit|confirm|discard)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" on X`, text: t.texts[0]?.value, always: true };
  return { kind: 'free' };
}

/** TikTok: judged by its data-e2e names first (on the icon inside each button), then by label. */
function classifyTt(t: Target): Verdict {
  const n = t.name.trim().toLowerCase();
  const id = t.testid;
  const isButton = t.role === 'button' || t.tag === 'button' || t.type === 'submit' || t.role === 'menuitem';
  const path = pathOf(t.url);
  const who = t.creator || 'this account';
  if (/verif|captcha|puzzle|slider/i.test(`${t.dialog} ${t.dialogText.slice(0, 160)}`)) return { kind: 'never', why: 'TikTok is showing a security check. The user solves it themselves; wait for them.' };
  if (/^(log ?out|switch account|add account|delete account|deactivate)\b/.test(n)) return { kind: 'never' };
  // TikTok Studio: the upload's Post / Schedule asks; deleting a posted video asks; the rest is filling in the form.
  if (TT_STUDIO_PATH.test(path)) {
    if (id === 'post_video_button' || (isButton && /^(post|post now|schedule)$/.test(n))) {
      const caption = t.texts.find((x) => /caption|description/i.test(x.name)) ?? t.texts[0];
      return { kind: 'post', action: n === 'schedule' ? 'Schedule this video on TikTok' : 'Post this video on TikTok', text: caption?.value };
    }
    if (isButton && /^(delete|remove)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" in TikTok Studio`, text: t.dialogText || undefined, always: true };
    return { kind: 'free' };
  }
  if (/(^|-)like-icon$/.test(id) || (isButton && /^like( video)?\b/.test(n))) return t.pressed || /^unlike|\bliked\b/.test(n) ? { kind: 'free' } : { kind: 'like' };
  if (/(^|-)(undefined|favorite|collect)-icon$/.test(id) || (isButton && /^(add to )?favou?rites?\b/.test(n))) return t.pressed || /^remove from favou?rites/.test(n) ? { kind: 'free' } : { kind: 'save' };
  // "Following" / "Friends" unfollows when pressed.
  if (isButton && /^(following|friends|unfollow)$/.test(n)) return { kind: 'unfollow', action: `Unfollow ${who} on TikTok` };
  if (/(^|-)follow(-button)?$/.test(id) || (isButton && /^follow( back)?$/.test(n))) return { kind: 'follow' };
  const commentBox = t.texts.find((x) => /comment|reply/i.test(x.name));
  if (id === 'comment-post' || (isButton && n === 'post' && !!commentBox)) return { kind: 'comment', action: `Comment on ${who === 'this account' ? 'this video' : `${who}'s video`} on TikTok`, text: (commentBox ?? t.texts[0])?.value };
  if (/^\/messages/.test(path) && ((isButton && /^send\b/.test(n)) || /send/i.test(id))) return { kind: 'message', action: 'Send this as a direct message on TikTok', text: t.texts.find((x) => /message/i.test(x.name))?.value ?? t.texts[0]?.value };
  if (/repost/i.test(id) || (isButton && /^repost$/.test(n))) return { kind: 'other', action: `Repost ${who === 'this account' ? 'this video' : `${who}'s video`} to the account's followers on TikTok` };
  if (isButton && (/^\/setting/i.test(path) || /edit profile/i.test(t.dialog)) && /^(save|confirm|done|update|apply)\b/.test(n)) return { kind: 'profile', action: `Press "${t.name}" in the TikTok profile / settings`, text: t.texts.map((x) => `${x.name}: ${x.value}`).join('\n') || undefined };
  if (isButton && /^(delete|block|report|remove|submit|confirm|discard)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" on TikTok`, text: t.texts[0]?.value, always: true };
  return { kind: 'free' };
}

const isButtonOf = (t: Target): boolean => t.role === 'button' || t.tag === 'button' || t.type === 'submit' || t.role === 'menuitem';
/** The filled-in text of the box this button sends (a comment, reply or message). */
const boxText = (t: Target, re: RegExp): string | undefined => (t.texts.find((x) => re.test(x.name) && x.value) ?? t.texts.find((x) => x.value))?.value;

/** Facebook: posting Reels as a Page through Meta Business Suite; likes, follows, comments, shares and messages on facebook.com. */
function classifyFb(t: Target): Verdict {
  const n = t.name.trim().toLowerCase();
  const isButton = isButtonOf(t);
  const path = pathOf(t.url);
  const who = t.creator || 'this page';
  if (/^(log out|deactivate|delete (account|page)|add (a )?(profile|account))\b/.test(n)) return { kind: 'never' };
  if (/^(switch( (to|profile|profiles|account|now))?|see all profiles)\b/.test(n)) return { kind: 'never', why: 'Switching between the personal profile and a Page is for the user to do. Ask them.' };
  if (isFbComposer(t.url) || /create (reel|post)|reels? composer/i.test(t.dialog)) {
    if (isButton && /^(share|share now|publish|post|share reel|schedule)$/.test(n)) return { kind: 'post', action: n === 'schedule' ? 'Schedule this on Facebook' : 'Publish this on Facebook', text: boxText(t, /description|caption|text|on your mind|describe/i) };
    if (/^\/latest\/inbox/i.test(path) && isButton && /^send\b/.test(n)) return { kind: 'message', action: "Send this as a message from the Page's inbox", text: boxText(t, /message|reply/i) };
    if (isButton && /^(delete|remove|discard)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" in Meta Business Suite`, text: t.dialogText || undefined, always: true };
    return { kind: 'free' };
  }
  // Facebook names them per post: "Like Techoilyas's post" / "Remove Like from Techoilyas's post".
  // ("Like: 31K people" is the reaction count, and "Like Page" is a follow, below.)
  if (/^(unlike|remove (like|love|care|haha|wow|sad|angry))( from .*)?$/.test(n)) return { kind: 'free' };
  if (/^(like|love|care|haha|wow)( .*['’]s? (post|video|reel|photo|comment))?$/.test(n)) return t.pressed ? { kind: 'free' } : { kind: 'like' };
  // The video search page words it "React with Like to Techoilyas's post".
  if (/^react with (like|love|care|haha|wow)\b/.test(n)) return t.pressed ? { kind: 'free' } : { kind: 'like' };
  if (isButton && /^add friend$/.test(n)) return { kind: 'never', why: 'Marketo does not send friend requests. Follow pages and creators instead.' };
  if (isButton && /^(follow|follow page|like page)$/.test(n)) return { kind: 'follow' };
  if (isButton && /^(unfollow|unlike page)\b/.test(n)) return { kind: 'unfollow', action: `Unfollow ${who} on Facebook` };
  if (isButton && /^(share now|share to feed|share now \(public\))\b/.test(n)) return { kind: 'repost' };
  if (isButton && /^(comment|post comment|post|reply|submit)$/.test(n) && t.texts.some((x) => /comment|reply/i.test(x.name) && x.value)) return { kind: 'comment', action: `Comment on ${who === 'this page' ? 'this post' : `${who}'s post`} on Facebook`, text: boxText(t, /comment|reply/i) };
  if ((/^\/messages/.test(path) || /chat|messenger/i.test(t.dialog)) && isButton && /^(send|press enter to send)\b/.test(n)) return { kind: 'message', action: 'Send this as a message on Facebook', text: boxText(t, /message|aa/i) };
  if (isButton && (/^\/settings/i.test(path) || /edit (profile|page)/i.test(t.dialog)) && /^(save|confirm|done|update|apply)\b/.test(n)) return { kind: 'profile', action: `Press "${t.name}" in the Facebook Page / settings`, text: t.texts.map((x) => `${x.name}: ${x.value}`).join('\n') || undefined };
  if (isButton && /^(delete|block|report|remove|submit|confirm|discard|hide)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" on Facebook`, text: t.texts[0]?.value, always: true };
  return { kind: 'free' };
}

/** Threads: likes, follows, reposts, replies and new threads. */
function classifyTh(t: Target): Verdict {
  const n = t.name.trim().toLowerCase();
  const isButton = isButtonOf(t);
  const path = pathOf(t.url);
  const who = t.creator || 'this account';
  if (/^(log out|switch (accounts?|profiles?)|add (an? )?(account|profile)|deactivate|delete (profile|account))\b/.test(n)) return { kind: 'never' };
  // The like button is named by its icon plus the count ("Like 3" / "Unlike 3").
  if (/^unlike( [0-9]|$)/.test(n) || /^(remove|undo) repost/.test(n)) return { kind: 'free' };
  if (/^like( [0-9][0-9.,]*\s*[kmb]?)?$/.test(n)) return t.pressed ? { kind: 'free' } : { kind: 'like' };
  if (isButton && /^follow( back)?$/.test(n)) {
    // People open a profile and look it over before following: not straight from a search card, a post or the Activity list.
    if (t.dialog || !/^\/@[\w.]+(\/(replies|media|reposts))?\/?$/i.test(path))
      return {
        kind: 'never',
        why: `Follow ${who} from their profile: open it${who.startsWith('@') ? ` (https://www.threads.com/${who})` : ''}, look over a few of their posts, then press Follow there. Following straight from a search card, a post or the Activity list is refused on Threads: people look first.`,
      };
    return { kind: 'follow' };
  }
  if (isButton && /^unfollow\b/.test(n)) return { kind: 'unfollow', action: `Unfollow ${who} on Threads` };
  if (isButton && n === 'repost') return { kind: 'repost' };
  // The composer's Post: a reply when it answers a thread, else a new thread.
  if (isButton && /^post( all)?$/.test(n)) {
    const boxes = t.texts.filter((x) => (t.dialog ? x.dlg : !x.dlg) && x.value);
    const text = (boxes.length ? boxes : t.texts.filter((x) => x.value)).map((x) => x.value).join('\n---\n') || undefined;
    const reply = /reply|replying/i.test(`${t.dialog} ${t.dialogText.slice(0, 200)}`) || (!t.dialog && /\/post\//.test(path));
    if (reply) return { kind: 'comment', action: `Reply to ${who === 'this account' ? 'this thread' : `${who}'s thread`} on Threads`, text };
    return { kind: 'post', action: 'Post this on Threads', text };
  }
  // The reply box under a thread sends with a button named "Reply" (the icon that opens it is "Reply" or "Reply 3": free while nothing is typed).
  if (isButton && n === 'reply') {
    const text = t.texts.filter((x) => x.value).map((x) => x.value).join('\n---\n');
    if (text) return { kind: 'comment', action: `Reply to ${who === 'this account' ? 'this thread' : `${who}'s thread`} on Threads`, text };
  }
  if (/^\/(messages|inbox|direct)/.test(path) && isButton && /^send\b/.test(n)) return { kind: 'message', action: 'Send this as a message on Threads', text: boxText(t, /message/i) };
  if (isButton && (/^\/settings/i.test(path) || /edit (profile|bio)|show instagram badge|profile privacy/i.test(`${t.dialog} ${t.dialogText.slice(0, 600)}`)) && /^(save|done|confirm|update)\b/.test(n)) return { kind: 'profile', action: `Press "${t.name}" in the Threads profile / settings`, text: t.texts.map((x) => `${x.name}: ${x.value}`).join('\n') || undefined };
  if (isButton && /^(delete|block|report|remove|restrict|mute|submit|confirm|discard)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" on Threads`, text: t.texts[0]?.value, always: true };
  return { kind: 'free' };
}

/** Pinterest: video Pins from the Pin creation tool; saves (repins), reactions, follows and comments. */
function classifyPin(t: Target): Verdict {
  const n = t.name.trim().toLowerCase();
  const isButton = isButtonOf(t);
  const path = pathOf(t.url);
  const who = t.creator || 'this account';
  if (/^(log out|switch accounts?|add (an? )?account|deactivate|delete (account|profile))\b/.test(n)) return { kind: 'never' };
  if (PIN_CREATE_PATH.test(path) || /create pin/i.test(t.dialog)) {
    if (isButton && /^(publish|schedule)$/.test(n)) {
      const field = (re: RegExp): string | undefined => t.texts.find((x) => re.test(x.name) && x.value)?.value;
      const parts = [field(/title/i) ? `Title: ${field(/title/i)}` : '', field(/description|tell everyone/i) ? `Description: ${field(/description|tell everyone/i)}` : '', field(/link/i) ? `Link: ${field(/link/i)}` : ''].filter(Boolean);
      return { kind: 'post', action: n === 'schedule' ? 'Schedule this Pin on Pinterest' : 'Publish this Pin on Pinterest', text: parts.join('\n') || undefined };
    }
    if (isButton && /^(delete|remove|discard)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" in the Pin creation tool`, text: t.dialogText || undefined, always: true };
    return { kind: 'free' };
  }
  if (isButton && n === 'save') return { kind: 'save' };
  // The board picker lists each board as "<board name> Save" (not on settings pages, where Save means something else).
  if (/ save$/.test(n) && !/^\/settings/i.test(path) && !/edit (profile|board)/i.test(t.dialog)) return { kind: 'save' };
  if (/^(react|like)\b/.test(n)) return t.pressed || /remove/.test(n) ? { kind: 'free' } : { kind: 'like' };
  if (isButton && /^follow$/.test(n)) return { kind: 'follow' };
  if (isButton && /^(following|unfollow)$/.test(n)) return { kind: 'unfollow', action: `Unfollow ${who} on Pinterest` };
  if (isButton && /^(post|done|send|comment)$/.test(n) && t.texts.some((x) => /comment|reply/i.test(x.name) && x.value)) return { kind: 'comment', action: `Comment on ${who === 'this account' ? 'this Pin' : `${who}'s Pin`} on Pinterest`, text: boxText(t, /comment|reply/i) };
  if ((/^\/(messages|inbox)/.test(path) || /message/i.test(t.dialog)) && isButton && /^send\b/.test(n)) return { kind: 'message', action: 'Send this as a message on Pinterest', text: boxText(t, /message|reply/i) };
  if (isButton && (/^\/settings/i.test(path) || /edit (profile|board)/i.test(t.dialog)) && /^(save|done|confirm|update)\b/.test(n)) return { kind: 'profile', action: `Press "${t.name}" in the Pinterest profile / settings`, text: t.texts.map((x) => `${x.name}: ${x.value}`).join('\n') || undefined };
  if (isButton && /^(delete|block|report|remove|submit|confirm|discard)\b/.test(n)) return { kind: 'other', action: `Press "${t.name}" on Pinterest`, text: t.texts[0]?.value, always: true };
  return { kind: 'free' };
}

/** What clicking an element does on the platform the tab is on. */
const verdictOn = (site: BrowserSite, x: Target, a: IgAccount): Verdict =>
  site === 'youtube' ? classifyYt(x, a) : site === 'x' ? classifyX(x) : site === 'tiktok' ? classifyTt(x) : site === 'facebook' ? classifyFb(x) : site === 'threads' ? classifyTh(x) : site === 'pinterest' ? classifyPin(x) : classify(x);

/** Enter in a filled text box submits it. */
function classifyEnter(f: Focus): Verdict {
  if (!f.editable || f.search || !f.value) return { kind: 'free' };
  const name = f.name ?? '';
  if (/comment|reply/i.test(name)) return { kind: 'comment', action: `Post this comment${f.creator ? ` on ${f.creator}'s post` : ''}`, text: f.value };
  if (/message/i.test(name)) return { kind: 'message', action: 'Send this as a direct message', text: f.value };
  if (/caption/i.test(name) || f.multiline) return { kind: 'free' };
  return { kind: 'other', action: `Submit "${name || 'this text'}"`, text: f.value };
}

function quotaLine(a: IgAccount, site: Site = 'instagram'): string {
  const plan = planFor(a, store.get().sessions, undefined, site);
  const q = plan.phase.quota;
  const net = isNetwork(site);
  const watch = net ? netOf(a, site)?.watchOnly : a.watchOnly;
  const flags = [watch ? `WATCH-ONLY (no ${quotaKeys(site).filter((k) => k !== 'minutes').map((k) => quotaLabel(k, site)).join(', ')})` : '', a.status === 'paused' ? 'PAUSED' : ''].filter(Boolean).join(' · ');
  return `Today${net ? ` on ${NETWORK_LABEL[site]} (warm-up day ${plan.day}, ${plan.phase.name})` : ''} for ${a.handle}: ${quotaKeys(site).map((k) => `${Math.round(plan.done[k] * 10) / 10}/${k === 'minutes' ? plan.budgetMinutes : q[k]} ${quotaLabel(k, site)}`).join(', ')}.${flags ? ` ${flags}.` : ''}`;
}

function ytLine(a: IgAccount): string {
  return `YouTube Shorts published today for ${a.handle}: ${ytUploadsToday(a)}/${ytLimit(a)}.${a.status === 'paused' ? ' PAUSED.' : ''}`;
}

/** The limits are the user's to set: every refusal says where. */
const userSets = (what: string): string => `${what} is the user's own to set (Accounts page > Daily limits, or save_account limits when they ask for a number): tell them, do not change it yourself.`;
const USER_CAN_RAISE = userSets('This limit');

/** Throws with the reason when the account's channel may not publish now. */
function checkYt(a: IgAccount): void {
  if (a.status === 'paused') throw new Error(`${a.handle} is paused: nothing gets published. The user un-pauses it on the Accounts page.`);
  const n = ytUploadsToday(a);
  if (n >= ytLimit(a)) throw new Error(`Today's limit is reached for ${a.handle} on YouTube: ${n}/${ytLimit(a)} Shorts published. No more today. ${USER_CAN_RAISE}`);
}

/** Unconfirmed post clicks (not yet in the post log) block for this long: long enough to stop a double post, short enough to retry one that didn't go through. */
const UNCONFIRMED_GAP_MIN = 15;
/** YouTube Studio's dialog when Publish is pressed before its checks finish. */
const YT_HELD = /still checking|publish anyway/i;
const postClicks = new Map<string, number>();
/** A long video put into Studio's upload dialog (browser_attach_long), per account: its Save / Publish is that long
 *  video, not a Short, so the Shorts limit and post gap do not apply to it and it is not counted as one. */
const longUploads = new Map<string, { id: string; title: string; at: number }>();
const LONG_HOLD_MS = 3 * 3600_000;
function longPending(a: IgAccount): { id: string; title: string } | null {
  const l = longUploads.get(a.id);
  return l && Date.now() - l.at < LONG_HOLD_MS ? l : null;
}
/** Seconds the hub stays on the page after Post / Share / Publish, so the upload finishes before anything else opens. */
const POST_SETTLE_S: Record<Site, number> = { instagram: 25, youtube: 0, x: 8, tiktok: 25, facebook: 40, threads: 30, pinterest: 20 };
/** Sites where a post was lost by leaving mid-upload: after the fixed wait, the click keeps waiting while the page still shows the upload, up to UPLOAD_HOLD_MS in all. */
const UPLOAD_WATCH = new Set<BrowserSite>(['facebook', 'threads']);
const UPLOAD_HOLD_MS = 5 * 60_000;
/** Words a page shows while a post is still going up (Facebook's "Reel processing" is the upload itself). */
const UPLOADING = /\b(reel processing|processing (your )?(reel|video)|uploading|posting\.\.\.|sharing\.\.\.)|\b(upload(ing)?|processing)\b[^\n]{0,20}\b\d{1,2}%/i;
/**
 * Business Suite's "Reel processing" box after Share: "Once your reel finishes processing, it will be published".
 * It never closes by itself, and the reels that were left with it open never went live (Nov 18, three times);
 * the ones where Done was pressed did (Nov 17, Nov 19). So the hub presses Done itself.
 */
const FB_PROCESSING_BOX = /once your reel finishes processing|it will be published and you will be notified/i;

/** Press Done on Facebook's "Reel processing" box when it is up. True when it was pressed. */
async function fbProcessingDone(tab: Tab, text: string): Promise<boolean> {
  if (tab.site !== 'facebook' || !FB_PROCESSING_BOX.test(text)) return false;
  const ref = await inPage<number>(tab, `window.__mk.byName(${JSON.stringify('^done$')})`).catch(() => 0);
  const t = ref ? await inPage<Target>(tab, `window.__mk.target(${ref})`).catch(() => null) : null;
  if (!t || t.gone) return false;
  await mouseClick(tab, t.x, t.y);
  await sleep(2500);
  return true;
}
/** A follow button that has not followed anyone (yet). */
const FOLLOW_LABEL = /^follow( back)?$/i;

/** The exact number at the end of a button's name ("Favorites 320"); null when there is none or it is rounded ("4.6K"). */
export function countIn(name: string | null): number | null {
  const all = [...(name ?? '').matchAll(/(\d[\d,.]*)\s?([kmb])?(?![a-z])/gi)];
  const m = all[all.length - 1];
  if (!m || m[2] || m[1].includes('.')) return null;
  const n = Number(m[1].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** A post that was sent but never showed up on the profile: today's slot is given back, once the AI has looked (post_failed). */
export function postFailed(handle: string | undefined, site: Site): Outcome {
  let a: IgAccount;
  try {
    a = account(handle);
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
  if (site === 'youtube') return { ok: false, text: 'YouTube counts a Short only when Studio says it published, so there is no slot to give back. If Studio lists no such video, tell the user.' };
  if (!siteOn(a, site)) return { ok: false, text: NOT_ON(a, site) };
  const d = store.get();
  const confirmedSince = (t: number): boolean => {
    const from = t - 60_000;
    const reel = d.reels.some((r) => {
      const at = linkOn(r, site)?.at;
      return !!at && Date.parse(at) >= from && (!r.postedBy || sameHandle(r.postedBy, a.handle));
    });
    // A post logged since the click, unless it is an old one being read off the profile.
    const logged = d.posts.some((p) => p.site === site && sameHandle(p.handle, a.handle) && Date.parse(p.addedAt) >= from && (!p.postedAt || Date.parse(p.postedAt) >= from - 24 * 3_600_000));
    return reel || logged;
  };
  const r = store.releasePost(a.handle, site, confirmedSince);
  if (!r.ok) return { ok: false, text: r.text };
  postClicks.delete(`${a.id}|${site}`);
  deps.log('info', `[browser] ${a.handle} post on ${SITES[site].label} reported as not live: slot given back`);
  void broadcast();
  return { ok: true, text: `Gave the slot back. ${quotaLine(store.findAccount(a.id), site)}\nIt can be tried once more now: attach again, press Post / Share, and after the hub's wait check the profile before anything else. Say in the report that the first upload was lost.` };
}

/** Throws when the account posted on this platform too recently. */
function checkGap(a: IgAccount, site: Site): void {
  const d = store.get();
  const confirmed: number[] = [];
  for (const r of d.reels) {
    const at = linkOn(r, site)?.at;
    if (at && (!r.postedBy || sameHandle(r.postedBy, a.handle))) confirmed.push(Date.parse(at));
  }
  for (const p of d.posts) if (p.site === site && p.postedAt && sameHandle(p.handle, a.handle)) confirmed.push(Date.parse(p.postedAt));
  const clicks = [postClicks.get(`${a.id}|${site}`) ?? 0, ...(site === 'youtube' ? (a.youtube?.uploads ?? []).map((u) => Date.parse(u)) : [])];
  const lastConfirmed = Math.max(0, ...confirmed.filter((n) => Number.isFinite(n) && n <= Date.now() + 60_000));
  const lastClick = Math.max(0, ...clicks.filter(Number.isFinite));
  const mins = (t: number): number => Math.floor((Date.now() - t) / 60_000);
  // The user's own spacing for this platform, otherwise the recommended one.
  const gap = postGap(a, site);
  const clock = (t: number): string => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (lastConfirmed && mins(lastConfirmed) < gap)
    throw new Error(`${a.handle} posted on ${SITES[site].label} ${mins(lastConfirmed)} min ago (${clock(lastConfirmed)}). Posts there are spaced at least ${gap} min apart so they don't land back to back: the next one can go after ${clock(lastConfirmed + gap * 60_000)}. Close the composer without posting. ${userSets('The spacing')}`);
  // A click that is not in the post log yet: wait before posting again, so a slow upload is not posted twice.
  // With a short spacing of the user's own the wait shrinks with it (never under 2 minutes), and a click that has since been confirmed does not count.
  const unconfirmed = Math.max(2, Math.min(UNCONFIRMED_GAP_MIN, gap));
  if (lastClick && lastClick > lastConfirmed + 60_000 && mins(lastClick) < unconfirmed)
    throw new Error(`A post was just published on ${SITES[site].label} for ${a.handle} (${mins(lastClick)} min ago). Check the profile: if it went up, mark_posted it; the next post there can go ${gap} min after it. If it really did not go up, post_failed with platform "${site}" gives the slot back and lets you try once more.`);
}

/** Throws with the reason when the account may not do this now. */
/** Paused and watch-only stop every action, limits or not. */
function checkActive(a: IgAccount, verb: string, site: Site = 'instagram'): void {
  const on = isNetwork(site) ? ` on ${NETWORK_LABEL[site]}` : '';
  if (a.status === 'paused') throw new Error(`${a.handle} is paused: no ${verb}. The user un-pauses it on the Warming page.`);
  if (isNetwork(site) ? netOf(a, site)?.watchOnly : a.watchOnly) throw new Error(`${a.handle} is watch-only${on}: no ${verb}. Scroll and watch only. The user switches this off on the Accounts page.`);
}

function checkAllowed(a: IgAccount, key: keyof Quota, verb: string, site: Site = 'instagram'): void {
  const on = isNetwork(site) ? ` on ${NETWORK_LABEL[site]}` : '';
  checkActive(a, verb, site);
  const plan = planFor(a, store.get().sessions, undefined, site);
  if (plan.left[key] <= 0) throw new Error(`Today's limit is reached for ${a.handle}${on}: ${plan.done[key]}/${plan.phase.quota[key]} ${quotaLabel(key, site)}${plan.phase.quota[key] === 0 && plan.own[key] === undefined ? ` (none recommended yet in the ${plan.phase.name} phase)` : ''}. No more ${verb} today. ${USER_CAN_RAISE}`);
  // The time budget stops engagement for the day, except an action the user gave their own number while leaving the time budget at the recommended one:
  // their number is what they asked for, and a recommended budget does not cut it short.
  const timeBound = plan.own[key] === undefined || plan.own.minutes !== undefined;
  if (key !== 'posts' && key !== 'messages' && timeBound && plan.left.minutes <= 0) throw new Error(`Today's time budget for ${a.handle} is used up (${Math.round(plan.done.minutes * 10) / 10}/${plan.budgetMinutes} min). Stop engaging for today; log_session to close the session. ${USER_CAN_RAISE}`);
}

/** YouTube: why the AI may not act in this window (null = fine). */
async function ytBlock(tab: Tab, a: IgAccount, lang: string): Promise<string | null> {
  const url = await tab.s.url();
  const place = tab.s.place;
  const inChrome = tab.s.kind === 'chrome';
  const c = await tab.s.cookies();
  if (!c.loggedIn) return `${a.handle}'s YouTube is not signed in ${inChrome ? 'in this Chrome profile' : 'here'}. Ask the user to sign in to the Google account that owns the channel in the ${place} (it is open for them). Never ask for or type a password.`;
  if (!YT_HOST.test(hostOf(url))) return `The ${place} is on ${hostOf(url) || 'another page'}, not youtube.com (a Google page is for the user). browser_open with site "youtube" goes back to YouTube Studio.`;
  if (SITES.youtube.gated(url)) return `Google is asking for a sign-in, consent or security check. The user has to do that themselves in the ${place}; wait for them.`;
  const saved = a.youtube?.channelId;
  if (saved && tab.channelId && tab.channelId !== saved)
    return `YouTube Studio is on channel ${tab.channelName ? `"${tab.channelName}" ` : ''}(${tab.channelId}), not the one saved for ${a.handle} (${a.youtube?.channelName ? `"${a.youtube.channelName}" ` : ''}${saved}). Ask the user to switch channels in Studio (their profile picture > Switch account), or to forget the saved channel on the Accounts page if it changed.`;
  if (lang && !/^en\b/i.test(lang)) return `YouTube is showing in "${lang}". The safety rules read English button labels, so buttons stay locked until the user switches YouTube's language to English (profile picture > Language).`;
  return null;
}

const LANG_SETTING: Record<Network, string> = {
  x: 'Settings > Accessibility, display and languages > Languages',
  tiktok: 'Settings > Language',
  facebook: 'Settings & privacy > Language and region',
  threads: 'Settings > Language, or the Instagram app language',
  pinterest: 'Settings > Profile > Language',
};

/** X / TikTok: why the AI may not act in this window (null = fine). */
async function netBlock(tab: Tab, a: IgAccount, lang: string): Promise<string | null> {
  const n = tab.site as Network;
  const L = NETWORK_LABEL[n];
  const p = netOf(a, n);
  const url = await tab.s.url();
  const place = tab.s.place;
  const inChrome = tab.s.kind === 'chrome';
  const want = p?.handle;
  const c = await tab.s.cookies();
  if (!c.loggedIn) return `${a.handle}'s ${L} is not signed in ${inChrome ? 'in this Chrome profile' : 'here'}. Ask the user to sign in to ${want ?? `its ${L} account`} in the ${place} (it is open for them). Never ask for or type a password.`;
  if (!SITES[n].host.test(hostOf(url))) return `The ${place} is on ${hostOf(url) || 'another page'}, not ${SITES[n].domain}. browser_open with site "${n}" goes back to ${L}.`;
  if (SITES[n].gated(url)) {
    await noteHumanCheck(tab, a, url);
    return `${L} is asking for a login or a security check. The user has to do that themselves in the ${place}; wait for them.`;
  }
  if (n === 'tiktok' && (await inPage<boolean>(tab, 'window.__mk.captcha()').catch(() => false))) {
    await noteHumanCheck(tab, a, url, true);
    return `TikTok is showing a security check (a puzzle or "verify it's you"). The user solves it themselves in the ${place}; wait for them, then take a fresh browser_snapshot. Slow down afterwards: it usually means the session moved too fast.`;
  }
  if (tab.signedInAs && want && !sameHandle(tab.signedInAs, want)) return `${L} here is signed in as @${tab.signedInAs}, not ${want}. Ask the user to switch accounts on ${L} (or fix the ${L} handle on the Accounts page).`;
  if (p?.userId && c.userId && p.userId !== c.userId && !tab.signedInAs) return `A different ${L} account than ${want ?? 'the saved one'} is signed in here. Ask the user to check the ${place}.`;
  if (lang && !/^en\b/i.test(lang)) return `${L} is showing in "${lang}". The safety limits read English button labels, so buttons stay locked until the user switches ${L}'s language to English (${LANG_SETTING[n]}).`;
  return null;
}

/** Why the AI may not act on this page at all (null = fine). */
async function inputBlock(tab: Tab, a: IgAccount, lang: string): Promise<string | null> {
  if (tab.site === 'rewards') return rewardsBlock(tab);
  if (tab.site === 'youtube') return ytBlock(tab, a, lang);
  if (isNetwork(tab.site)) return netBlock(tab, a, lang);
  const url = await tab.s.url();
  const place = tab.s.place;
  const inChrome = tab.s.kind === 'chrome';
  if (!IG_HOST.test(hostOf(url))) return `The ${place} is on ${hostOf(url) || 'another page'}, not instagram.com. browser_open goes back to Instagram.`;
  const c = await tab.s.cookies();
  if (!c.loggedIn) return `${a.handle} is not signed in ${inChrome ? 'in this Chrome profile' : 'here'}. Ask the user to sign in in the ${place} (it is open for them). Never ask for or type a password.`;
  if (GATED_PATH.test(pathOf(url))) return `Instagram is asking for a login or a security check. The user has to do that themselves in the ${place}; wait for them.`;
  if (tab.signedInAs && !sameHandle(tab.signedInAs, a.handle))
    return inChrome
      ? `This Chrome profile is signed in as @${tab.signedInAs}, not ${a.handle}. Ask the user to open the Chrome profile where ${a.handle} is signed in and press "Use this Chrome profile in Marketo" in the Krypt Marketo extension (or to fix the handle on the Accounts page).`
      : `This window is signed in as @${tab.signedInAs}, not ${a.handle}. Ask the user to sign in with the right account (or fix the handle on the Accounts page).`;
  if (a.igUserId && c.userId && a.igUserId !== c.userId && !tab.signedInAs) return `A different Instagram account than ${a.handle} is signed in here. Ask the user to check the ${place}.`;
  if (lang && !/^en\b/i.test(lang)) return `Instagram is showing in "${lang}". The safety limits read English button labels, so buttons stay locked until the user switches Instagram's language to English (Settings > Language and translations).`;
  return null;
}

// ── Content Rewards (contentrewards.com) ───────────────────────────────────
// The AI only reads campaigns and submissions there and submits post links. Joining or leaving a campaign, connecting
// accounts, money and settings stay with the user (they accept terms or move money).
const RW_NEVER = /\b(join|leave|withdraw|cash ?out|payouts?|connect|disconnect|unlink|delete|remove|log ?out|sign ?out|save changes|upgrade|subscribe|buy|purchase|pay now|launch a campaign|book a call)\b/i;

async function rewardsBlock(tab: Tab): Promise<string | null> {
  const url = await tab.s.url();
  if (!RW_HOST.test(hostOf(url))) return `The ${tab.s.place} is on ${hostOf(url) || 'another page'}, not contentrewards.com (a sign-in page is for the user). browser_open with site "rewards" goes back.`;
  if (SITES.rewards.gated(url)) return `Content Rewards is asking for a sign-in. The user signs in themselves in the ${tab.s.place}; wait for them. Never type a password.`;
  return null;
}

function rewardsHead(tab: Tab, a: IgAccount, snap: Snap): string[] {
  const out = snap.lines.length < 400 && snap.lines.some((l) => /\b(log ?in|sign ?in|sign up)\b/i.test(l)) && !snap.lines.some((l) => /account menu|submissions|earnings/i.test(l));
  const head = [
    `${tab.s.place} (for ${a.handle}'s Chrome profile)${out ? ' · LOOKS SIGNED OUT: the user signs in (never type a password)' : ''}`,
    `${snap.url} · scrolled ${snap.y}/${snap.max}px${snap.modal ? ` · a dialog is open ("${snap.modal}"); only the dialog is listed` : ''}`,
    'Here you read campaigns, rules and submissions, press "Submit clip", paste a post link and send it. Joining or leaving campaigns, connecting accounts, money and settings are the user\'s.',
  ];
  if (tab.blocked) {
    head.push(`Blocked: ${tab.blocked.slice(0, 120)} did not open (only contentrewards.com opens here).`);
    tab.blocked = null;
  }
  return head;
}

async function rewardsClick(tab: Tab, a: IgAccount, ref: number, t: Target): Promise<Outcome> {
  const label = `${t.name} ${t.href}`.trim();
  if (RW_NEVER.test(t.name) || /\/(settings|earnings)\b.*(withdraw|payout)/i.test(t.href))
    return { ok: false, text: `"${t.name}" is for the user to press on Content Rewards (joining or leaving campaigns, connecting accounts, money and settings are theirs). Put it in the report if it is needed.` };
  deps.log('info', `[browser] ${a.handle} Content Rewards click: ${label.slice(0, 120)}`);
  await mouseClick(tab, t.x, t.y);
  await sleep(rand(700, 1200));
  return { ok: true, text: `Clicked [${ref}] "${t.name}".\n${(await read(tab, a)).text}` };
}

// ── Reading the page ───────────────────────────────────────────────────────
async function readYt(tab: Tab, a: IgAccount, snap: Snap): Promise<string[]> {
  const c = await tab.s.cookies();
  const ch = snap.channel;
  if (c.loggedIn && ch?.id) {
    tab.channelId = ch.id;
    if (ch.name) tab.channelName = ch.name;
    // The first channel seen in Studio is the account's from now on; another one later locks the buttons.
    // Not when other accounts use YouTube in this Chrome profile (one Google sign-in, several channels): then each one's
    // channel is set by the user, and the one Studio happens to show may well be another account's.
    if (a.youtube && !a.youtube.channelId && !ytPeers(a).length && !store.get().igAccounts.some((x) => x.id !== a.id && x.youtube?.channelId === ch.id))
      store.saveAccount({ id: a.id, youtube: { ...a.youtube, channelId: ch.id, channelName: ch.name || undefined } });
    else if (a.youtube && a.youtube.channelId === ch.id && ch.name && a.youtube.channelName !== ch.name) store.saveAccount({ id: a.id, youtube: { ...a.youtube, channelName: ch.name } });
  }
  if (!c.loggedIn) {
    tab.channelId = undefined;
    tab.channelName = undefined;
  }
  const saved = store.findAccount(a.id).youtube?.channelId;
  const name = tab.channelName ? `"${tab.channelName}" ` : '';
  const who = !c.loggedIn
    ? `NOT SIGNED IN (the user signs in to Google in this ${tab.s.kind === 'chrome' ? 'Chrome tab' : 'window'}; never type a password)`
    : tab.channelId
      ? saved && saved !== tab.channelId
        ? `STUDIO IS ON CHANNEL ${name}(${tab.channelId}), NOT THE ONE SAVED FOR ${a.handle} (${saved})`
        : `signed in · channel ${name}(${tab.channelId})`
      : `signed in${saved ? ` · saved channel ${a.youtube?.channelName ? `"${a.youtube.channelName}" ` : ''}(${saved})` : ''}`;
  const head = [`${tab.s.place} for ${a.handle} · ${who}`, `${snap.url} · scrolled ${snap.y}/${snap.max}px${snap.modal ? ` · a dialog is open ("${snap.modal}"); only the dialog is listed` : ''}`, ytLine(store.findAccount(a.id))];
  if (tab.blocked) {
    head.push(`Blocked: ${tab.blocked.slice(0, 120)} did not open (only youtube.com opens here).`);
    tab.blocked = null;
  }
  if (SITES.youtube.gated(snap.url) || !YT_HOST.test(hostOf(snap.url))) head.push('This is a Google sign-in / consent page: the user handles it. Do not type here.');
  return head;
}

async function readNet(tab: Tab, a: IgAccount, snap: Snap): Promise<string[]> {
  const n = tab.site as Network;
  const L = NETWORK_LABEL[n];
  const c = await tab.s.cookies();
  if (tab.conn && c.loggedIn && snap.me) tab.conn.net[n].me = snap.me;
  if (c.loggedIn && snap.me) {
    if (tab.signedInAs !== snap.me) {
      tab.signedInAs = snap.me;
      void broadcast();
    }
    const p = netOf(a, n)!;
    // No handle given: the first one seen signed in becomes it. Its user id is saved once the handle matches.
    if (!p.handle) saveNet(a.id, n, { ...p, handle: normalizeHandle(snap.me), ...(c.userId ? { userId: c.userId } : {}) });
    else if (sameHandle(snap.me, p.handle) && c.userId && p.userId !== c.userId) saveNet(a.id, n, { ...p, userId: c.userId });
  }
  // Facebook shows no handle to read: the user id first seen signed in becomes the account's.
  if (n === 'facebook' && c.loggedIn && c.userId && !netOf(a, n)?.userId) saveNet(a.id, n, { ...netOf(a, n)!, userId: c.userId });
  if (!c.loggedIn) tab.signedInAs = undefined;
  const acct = store.findAccount(a.id);
  const want = netOf(acct, n)?.handle;
  const who = !c.loggedIn
    ? `NOT SIGNED IN (the user signs in in this ${tab.s.kind === 'chrome' ? 'Chrome tab' : 'window'}; never type a password)`
    : tab.signedInAs
      ? !want || sameHandle(tab.signedInAs, want)
        ? `signed in as @${tab.signedInAs}`
        : `SIGNED IN AS @${tab.signedInAs}, NOT ${want}`
      : 'signed in';
  const head = [
    `${tab.s.place} for ${a.handle}${want && !sameHandle(want, a.handle) ? ` (${L}: ${want})` : ''} · ${who}`,
    `${snap.url} · scrolled ${snap.y}/${snap.max}px${snap.modal ? ` · a dialog is open ("${snap.modal}"); only the dialog is listed` : ''}`,
    quotaLine(acct, n),
  ];
  if (tab.blocked) {
    head.push(`Blocked: ${tab.blocked.slice(0, 120)} did not open (only ${SITES[n].domain} opens here).`);
    tab.blocked = null;
  }
  if (SITES[n].gated(snap.url)) head.push('This is a login / security page: the user handles it. Do not type here.');
  if (snap.captcha) head.push('TikTok is showing a security check: the user solves it. Do not click it; wait, then look again.');
  return head;
}

async function read(tab: Tab, a: IgAccount, full = false): Promise<{ snap: Snap; text: string }> {
  let snap: Snap;
  try {
    snap = await inPage<Snap>(tab, `window.__mk.snap(${full ? 'true' : 'false'})`);
  } catch (e) {
    if (tab.site === 'rewards') throw new Error(`The Content Rewards tab can't be read (${(e as Error).message}). If it is on a sign-in page, the user signs in there; then browser_open with site "rewards" again.`);
    // Chrome: the extension only reads its own sites, so Google's (or Apple's) sign-in page can't be listed.
    if (tab.site === 'youtube' && tab.s.kind === 'chrome' && !(await tab.s.cookies()).loggedIn)
      throw new Error(`${a.handle}'s YouTube is not signed in in this Chrome profile. The YouTube tab is open on Google's sign-in page: ask the user to sign in there with the Google account that owns the channel (never ask for or type a password), then browser_open with site "youtube" again.`);
    if (isNetwork(tab.site) && tab.s.kind === 'chrome' && !(await tab.s.cookies()).loggedIn)
      throw new Error(`${a.handle}'s ${NETWORK_LABEL[tab.site]} is not signed in in this Chrome profile. Ask the user to sign in in the ${NETWORK_LABEL[tab.site]} tab that is open (never ask for or type a password), then browser_open with site "${tab.site}" again.`);
    throw e;
  }
  if (snap.w > 0 && snap.h > 0) {
    tab.vw = snap.w;
    tab.vh = snap.h;
  }
  if (snap.url !== tab.seenUrl) {
    tab.seenUrl = snap.url;
    tab.lastMove = Date.now();
  }
  await noteHumanCheck(tab, a, snap.url, snap.captcha);
  if (tab.site === 'rewards') return { snap, text: listing(rewardsHead(tab, a, snap), snap) };
  // Krypt's profile already showing "Following" settles the one-time follow without a click.
  const kp = isKryptPage(tab.site, snap.url);
  if (kp && showsFollowing(tab.site, snap.lines)) kryptFollowed(a.id, tab.site, kp);
  // Opening Krypt's profile while a visit is up starts that visit: the next one comes up a few days later.
  if (kp) kryptVisited(a.id, tab.site, kp);
  if (tab.site === 'youtube') return { snap, text: listing(await readYt(tab, a, snap), snap) };
  if (isNetwork(tab.site)) return { snap, text: listing(await readNet(tab, a, snap), snap) };
  const c = await tab.s.cookies();
  if (tab.conn && c.loggedIn && snap.me) tab.conn.me = snap.me;
  if (c.loggedIn && snap.me) {
    if (tab.signedInAs !== snap.me) {
      tab.signedInAs = snap.me;
      void broadcast();
    }
    if (sameHandle(snap.me, a.handle) && c.userId && a.igUserId !== c.userId) store.saveAccount({ id: a.id, igUserId: c.userId });
  }
  if (!c.loggedIn) tab.signedInAs = undefined;
  const who = !c.loggedIn
    ? `NOT SIGNED IN (the user signs in in this ${tab.s.kind === 'chrome' ? 'Chrome tab' : 'window'}; never type a password)`
    : tab.signedInAs
      ? sameHandle(tab.signedInAs, a.handle)
        ? `signed in as @${tab.signedInAs}`
        : `SIGNED IN AS @${tab.signedInAs}, NOT ${a.handle}`
      : 'signed in';
  const head = [
    `${tab.s.place} for ${a.handle} · ${who}`,
    `${snap.url} · scrolled ${snap.y}/${snap.max}px${snap.modal ? ` · a dialog is open ("${snap.modal}"); only the dialog is listed` : ''}`,
    quotaLine(a),
  ];
  if (tab.blocked) {
    head.push(`Blocked: ${tab.blocked.slice(0, 120)} did not open (only instagram.com opens here).`);
    tab.blocked = null;
  }
  if (GATED_PATH.test(pathOf(snap.url))) head.push('This is a login / security page: the user handles it. Do not type here.');
  return { snap, text: listing(head, snap) };
}

/** The account follows that Krypt account now: its one-time follow is done. True when this call recorded it. */
function kryptFollowed(accountId: string, site: Site, k: KryptAccount): boolean {
  const a = store.findAccount(accountId);
  if (!kryptFollowDue(a, site).includes(k)) return false;
  const key = kryptKey(site, k);
  store.saveAccount({ id: a.id, kryptFollowed: { ...(a.kryptFollowed ?? {}), [key]: new Date().toISOString() }, kryptFollowedTo: { ...(a.kryptFollowedTo ?? {}), [key]: kryptTarget(k) } });
  deps.log('info', `[browser] ${a.handle} follows Krypt's ${k.handle} on ${SITES[site].label}`);
  // YouTube: the subscribe is the Google sign-in's, shared by every account whose channel is in this Chrome profile.
  if (site === 'youtube')
    for (const p of ytPeers(a)) if (kryptFollowDue(p, site).includes(k)) store.saveAccount({ id: p.id, kryptFollowed: { ...(p.kryptFollowed ?? {}), [key]: new Date().toISOString() }, kryptFollowedTo: { ...(p.kryptFollowedTo ?? {}), [key]: kryptTarget(k) } });
  return true;
}

/** A visit to that Krypt account has started (shared/kryptFollow.ts). True when this call recorded it. */
function kryptVisited(accountId: string, site: Site, k: KryptAccount): boolean {
  const a = store.findAccount(accountId);
  if (!kryptVisitOf(a, site, k)) return false;
  store.saveAccount({ id: a.id, kryptVisited: { ...(a.kryptVisited ?? {}), [kryptKey(site, k)]: new Date().toISOString() } });
  deps.log('info', `[browser] ${a.handle} looks in on Krypt's ${k.handle} on ${SITES[site].label}`);
  if (site === 'youtube') for (const p of ytPeers(a)) store.saveAccount({ id: p.id, kryptVisited: { ...(p.kryptVisited ?? {}), [kryptKey(site, k)]: new Date().toISOString() } });
  return true;
}

/** Account + platform + day -> the Krypt posts it acted on (liked, saved, reposted, commented). */
const kryptPostsToday = new Map<string, Set<string>>();
const KRYPT_POSTS_A_DAY = 5;
/**
 * Why this like / save / repost / comment on one of Krypt's posts is held back (null = go ahead): at most five of
 * Krypt's posts a day per platform (the visit's two or three plus a couple met in the feed), and one comment on Krypt's
 * posts per platform every three days. Every install following the same accounts and acting on every post they make
 * is what an engagement ring looks like; this keeps each install at a fan's rate.
 */
function kryptPostLimit(a: IgAccount, site: Site, k: KryptAccount, kind: string, post: string): string | null {
  if (kind === 'comment') {
    const fresh = store.findAccount(a.id);
    const last = Math.max(0, ...kryptAccountsOn(site).map((x) => Date.parse(fresh.kryptCommented?.[kryptKey(site, x)] ?? '') || 0));
    if (Date.now() - last < 3 * 86_400_000)
      return `${a.handle} commented on one of Krypt's posts on ${SITES[site].label} in the last 3 days (${dayClockOf(last)}): no comment on Krypt's posts there until 3 days after that. A like is fine.`;
  }
  const key = `${a.id}|${site}|${localDate()}`;
  const seen = kryptPostsToday.get(key) ?? new Set<string>();
  const id = (post || '').replace(/[?#].*$/, '').replace(/\/$/, '');
  if (!seen.has(id) && seen.size >= KRYPT_POSTS_A_DAY)
    return `Already ${seen.size} of Krypt's posts acted on today on ${SITES[site].label}: that is enough for one day (a fan, not a ring). Watch this one and move on; ${k.handle}'s posts can be liked again tomorrow.`;
  seen.add(id);
  kryptPostsToday.set(key, seen);
  return null;
}

/** A comment went out under one of Krypt's posts: the next visits to that account leave none for a few days. */
function kryptCommented(accountId: string, site: Site, t: { creator?: string; url?: string; postUrl?: string }): void {
  const k = onKryptPost(site, t);
  if (!k) return;
  const a = store.findAccount(accountId);
  store.saveAccount({ id: a.id, kryptCommented: { ...(a.kryptCommented ?? {}), [kryptKey(site, k)]: new Date().toISOString() } });
}

function listing(head: string[], snap: Snap): string {
  const body = snap.lines.length ? snap.lines.join('\n') : '(nothing readable on screen yet; browser_wait a few seconds and look again)';
  const tail = snap.more ? `\n(+${snap.more} more lines not shown: browser_scroll, or browser_snapshot with full: true)` : '';
  return `${head.join('\n')}\n---\n${body}${tail}\n---\n[n] = element number for browser_click / browser_type. Numbers change with every new listing.`;
}

function account(handle?: string): IgAccount {
  const d = store.get();
  if (!d.igAccounts.length) throw new Error('No Instagram account in the hub yet. save_account adds one; then the user signs in on the Accounts page.');
  return store.findAccount(handle ?? d.settings.handle);
}

/** One action at a time per window. */
function serial<T>(tab: Tab, fn: () => Promise<T>): Promise<T> {
  const next = tab.queue.then(fn, fn);
  tab.queue = next.catch(() => {});
  return next;
}

async function withTab(handle: string | undefined, site: BrowserSite, fn: (tab: Tab, a: IgAccount) => Promise<Outcome>, open?: string | true): Promise<Outcome> {
  let a: IgAccount;
  try {
    a = account(handle);
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
  if (site !== 'rewards' && !siteOn(a, site)) return { ok: false, text: NOT_ON(a, site) };
  let tab = tabOf(a.id, site);
  if (open && tab && isOpen(tab) && (tab.settleUntil ?? 0) > Date.now())
    return { ok: false, text: `A post is still going up in this ${SITES[site].label} tab: opening another page here now can lose it. browser_wait with site "${site}" and look again until the upload is gone.` };
  // One window (Setup > Performance): moving to another platform hides the tab of a post still going up, which can stall it.
  if (perf.values().oneWindow) {
    const up = [...tabs.values()].find((t) => t !== tab && t.site !== site && isOpen(t) && (t.settleUntil ?? 0) > Date.now() && (t.accountId === a.id || (!!tab?.conn && t.conn === tab.conn)));
    if (up) return { ok: false, text: `A post is still going up on ${SITES[up.site].label} in this Chrome window: switching to ${SITES[site].label} now can stall it. browser_wait with site "${up.site}" until the upload is gone, then come back.` };
  }
  // Another account's channel in the same Chrome profile shares this YouTube tab.
  if (site === 'youtube') {
    const busy = ytPeers(a).find((p) => (tabOf(p.id, 'youtube')?.settleUntil ?? 0) > Date.now());
    if (busy) return { ok: false, text: `${busy.handle}'s Short is still going up in this Chrome profile's YouTube tab (the same one ${a.handle} uses). browser_wait with site "youtube" for ${busy.handle}, then come back.` };
  }
  if (open) {
    try {
      tab = await ensureTab(a, site, open === true ? undefined : open);
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    }
  }
  else if (!tab || !isOpen(tab)) return { ok: false, text: `${SITES[site].label} for ${a.handle} isn't open in Chrome. browser_open${site === 'instagram' ? '' : ` with site "${site}"`} first.` };
  const t = tab;
  if (t.conn) noteUse(t.conn, site);
  const run = async (): Promise<Outcome> => {
    try {
      // Time on Instagram and X counts toward each one's warm-up budget; uploading to YouTube does not, nor Content Rewards.
      if (site === 'rewards') return await fn(t, store.findAccount(a.id));
      if (site !== 'youtube') store.touchLive(a.handle, site);
      else store.wentTo(a.handle, site);
      if (site === 'youtube') {
        const g = await ytChannelGate(t, store.findAccount(a.id), typeof open === 'string' ? open : undefined);
        if (g.block) return { ok: false, text: g.block };
        const out = await fn(t, store.findAccount(a.id));
        if (t.conn) ytLast.set(t.conn.id, { accountId: a.id, at: Date.now() });
        return g.note ? { ...out, text: `${g.note}\n${out.text}` } : out;
      }
      return await fn(t, store.findAccount(a.id));
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    } finally {
      // The time this call itself took (a watch, a paced click) is time on the app.
      if (site !== 'youtube' && site !== 'rewards') store.touchLive(a.handle, site, true);
    }
  };
  // One Chrome profile has one YouTube tab, shared by every account whose channel lives there: they take turns.
  return site === 'youtube' && t.conn ? serialOn(`yt|${t.conn.id}`, () => serial(t, run)) : serial(t, run);
}

const turns = new Map<string, Promise<unknown>>();
function serialOn<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const next = (turns.get(key) ?? Promise.resolve()).then(fn, fn);
  turns.set(key, next.catch(() => {}));
  return next;
}

// ── Several YouTube channels under one Google sign-in ───────────────────────
// A Google account can own many channels. Accounts that pick the same Chrome profile share its YouTube tab, each
// with its own channel (set by the user: a pasted channel link). Before every YouTube action the hub puts Studio on
// the account's channel (studio.youtube.com/channel/<id> switches it), and holds off while another account's
// upload there is still going.

/**
 * Another channel of the Google sign-in in this account's Chrome profile: a new account that only runs YouTube, in the
 * same Chrome profile (both pinned to it, so they stay together), starting with this account's styles and niche.
 */
export async function addYtChannel(fromId: string, link: string): Promise<IgAccount> {
  const from = store.findAccount(fromId);
  const ch = await resolveYtChannel(link);
  const all = store.get().igAccounts;
  const taken = all.find((x) => x.youtube?.channelId === ch.id);
  if (taken) throw new Error(`That channel is already ${taken.handle}'s.`);
  const conn = chrome.match(from, all);
  const dir = from.chromeDir ?? (conn ? chrome.dirOf(conn) : null);
  if (!dir) throw new Error(`Open Chrome with ${from.handle}'s profile first (or pick its Chrome profile in Setup), so the new channel can use the same one.`);
  if (!from.chromeDir) store.saveAccount({ id: from.id, chromeDir: dir });
  let handle = ch.handle ? '@' + ch.handle : '@' + (ch.name ?? ch.id).toLowerCase().replace(/[^a-z0-9._]+/g, '').slice(0, 30);
  if (all.some((x) => sameHandle(x.handle, handle))) handle = `${handle}.yt`;
  const today = localDate();
  const acct = store.saveAccount({
    handle,
    browser: 'chrome',
    chromeDir: dir,
    instagram: false,
    youtube: { enabled: true, channelId: ch.id, channelName: ch.name, channelHandle: ch.handle },
    styles: from.styles,
    styleMix: from.styleMix,
    niche: from.niche,
    tone: from.tone,
    status: 'warming',
    createdOn: today,
    warmupStart: today,
  });
  deps.log('info', `[browser] added YouTube channel "${ch.name ?? ch.id}" as ${acct.handle}, in the same Chrome profile as ${from.handle}`);
  void broadcast();
  return acct;
}

/** Reads YouTube's channel switcher (youtube.com/channel_switcher, open on `s`): every channel of the Google sign-in. */
async function switcherRows(s: Surface): Promise<YtChannelOption[]> {
  const SCRAPE = `(() => {
    const t = (x) => (x ? (x.simpleText ?? (x.runs || []).map((r) => r.text).join('')) : '');
    if (/accounts\\.google\\.com|ServiceLogin/.test(location.href)) return { signin: true };
    const rows = [...document.querySelectorAll('ytd-account-item-renderer')].map((el) => {
      // YouTube's own data when the page shares it; else the row's text (name, @handle, subscribers) and picture.
      const d = el.data || (el.polymerController && el.polymerController.data) || {};
      const name = t(d.accountName) || (el.querySelector('#channel-title') || {}).textContent || '';
      const handle = (t(d.channelHandle).match(/@([\\w.\\-]+)/) || (el.innerText || '').match(/(?:^|\\n)@([\\w.\\-]+)/) || [])[1];
      const img = el.querySelector('img');
      const photo = (((d.accountPhoto || {}).thumbnails || [])[0] || {}).url || (img && /^https:/.test(img.src) ? img.src : undefined);
      const mark = el.querySelector('#selected');
      const selected = d.isSelected !== undefined ? !!d.isSelected : !!(mark && !mark.hidden && mark.offsetWidth > 0);
      return { name: name.trim(), handle, photo, selected, hasChannel: d.hasChannel !== false };
    });
    return { rows: rows.filter((r) => r.name && r.hasChannel) };
  })()`;
  type Row = { name: string; handle?: string; photo?: string; selected: boolean };
  let rows: Row[] = [];
  for (const until = Date.now() + 15_000; Date.now() < until; await sleep(800)) {
    const r = await s.evaluate<{ signin?: boolean; rows?: Row[] }>(SCRAPE).catch(() => ({}) as { signin?: boolean; rows?: Row[] });
    if (r.signin) throw new Error('This Chrome profile is not signed in to YouTube yet. Sign in there first, then load the list again.');
    if (r.rows?.length) {
      rows = r.rows;
      break;
    }
  }
  if (!rows.length) {
    if (!(await s.cookies()).loggedIn) throw new Error('This Chrome profile is not signed in to YouTube yet. Sign in there first, then load the list again.');
    throw new Error('YouTube did not list any channels in this Chrome profile. Open youtube.com/channel_switcher there to check, or paste a channel link instead.');
  }
  const owners = store.get().igAccounts;
  return rows.map((r) => {
    const owner = r.handle ? owners.find((x) => x.youtube?.channelHandle && x.youtube.channelHandle.toLowerCase() === r.handle!.toLowerCase()) : undefined;
    return { ...r, ...(owner ? { owner: { id: owner.id, handle: owner.handle } } : {}) };
  });
}

/**
 * Every channel of the Google sign-in in the account's Chrome profile, read from YouTube's channel switcher
 * (youtube.com/channel_switcher, which lands on youtube.com/account). Waits its turn in the profile's shared YouTube
 * tab and refuses while an upload or another account's YouTube work is going on there.
 */
export async function listYtChannels(accountId: string): Promise<YtChannelOption[]> {
  const a = store.findAccount(accountId);
  const all = store.get().igAccounts;
  const sharing = [a, ...all.filter((x) => x.id !== a.id && x.youtube?.enabled && x.chromeDir && x.chromeDir === a.chromeDir)];
  const busy = sharing.find((p) => (tabOf(p.id, 'youtube')?.settleUntil ?? 0) > Date.now());
  if (busy) throw new Error(`${busy.handle}'s Short is still going up in this Chrome profile's YouTube tab. Try again in a minute.`);
  const conn0 = chrome.match(a, all);
  const last = conn0 ? ytLast.get(conn0.id) : undefined;
  if (last && Date.now() - last.at < YT_HOLD_MS)
    throw new Error('Your AI is working in YouTube in this Chrome profile right now. Try again in a minute or two, so its upload is not broken.');
  const read = async (): Promise<YtChannelOption[]> => switcherRows((await ensureTab(a, 'youtube', 'https://www.youtube.com/channel_switcher')).s);
  return conn0 ? serialOn(`yt|${conn0.id}`, read) : read();
}

// ── What a Chrome profile is signed in to (the setup wizard's Accounts step) ─
const SCAN_SITES: Site[] = ['instagram', 'youtube', 'x', 'tiktok', 'facebook', 'threads', 'pinterest'];
/** Sites whose page names the signed-in user (Facebook goes by a Page, picked later). */
const HANDLE_SITES = new Set<Site>(['instagram', 'x', 'tiktok', 'threads', 'pinterest']);

/**
 * Who the picked Chrome profile is signed in as on each platform: the cookies say signed in or not; the handle comes from
 * the platform's own page (opened in that profile, then closed again if Marketo opened it) and YouTube's channel
 * switcher lists the channels. A platform tab an account's AI is using right now is left alone.
 */
export async function scanChromeProfile(dir: string, forProfile?: string): Promise<ProfileScan> {
  const live = chrome.connections();
  const conn = dir ? live.find((c) => chrome.dirOf(c) === dir) : live.length === 1 ? live[0] : undefined;
  if (!conn) throw new Error(dir ? 'That Chrome profile is not connected yet: open it, with the Krypt Marketo extension added.' : 'Pick the Chrome profile first.');
  const signedIn = (s: Site): boolean => (s === 'instagram' ? conn.loggedIn : s === 'youtube' ? conn.ytLoggedIn : conn.net[s as Network].loggedIn);
  const known = (s: Site): string | undefined => (s === 'instagram' ? conn.me : s === 'youtube' ? undefined : conn.net[s as Network].me);
  const wasOpen = (s: Site): boolean => (s === 'instagram' ? conn.tabOpen : s === 'youtube' ? conn.ytTabOpen : conn.net[s as Network].tabOpen);
  const busy = (s: Site): boolean => {
    const used = [...tabs.values()].filter((t) => t.conn === conn && t.site === s);
    if (used.some((t) => (t.settleUntil ?? 0) > Date.now())) return true;
    const last = s === 'youtube' ? ytLast.get(conn.id) : undefined;
    return !!last && Date.now() - last.at < YT_HOLD_MS;
  };
  const sites: ProfileScan['sites'] = {};
  for (const s of SCAN_SITES) {
    const h = signedIn(s) ? known(s) : undefined;
    sites[s] = { signedIn: signedIn(s), ...(h ? { handle: h } : {}) };
  }
  const todo = SCAN_SITES.filter((s) => sites[s]!.signedIn && conn.sites.includes(s) && !busy(s) && (s === 'youtube' || (HANDLE_SITES.has(s) && !sites[s]!.handle)));
  if (!todo.length) return { sites };
  // The Marketo profile's proxy first: nothing loads in Chrome before it is in place.
  await chromeProxyGate('This Chrome profile', conn, forProfile);
  await Promise.all(
    todo.map(async (s) => {
      const surf = chromeSurface(conn, s);
      const opened = !wasOpen(s);
      try {
        if (s === 'youtube') {
          const go = async (): Promise<void> => {
            await surf.load('https://www.youtube.com/channel_switcher');
            sites.youtube!.channels = await switcherRows(surf);
          };
          await serialOn(`yt|${conn.id}`, go);
          return;
        }
        await surf.load(SITES[s].home);
        for (const until = Date.now() + 12_000; Date.now() < until; await sleep(800)) {
          const me = (await surf.evaluate<{ me?: string | null }>('window.__mk.snap(false)').catch(() => null))?.me;
          if (!me) continue;
          sites[s]!.handle = me;
          if (s === 'instagram') conn.me = me;
          else conn.net[s as Network].me = me;
          break;
        }
      } catch (e) {
        sites[s]!.error = (e as Error).message;
      } finally {
        if (opened) surf.close();
      }
    }),
  );
  deps.log('info', `[browser] scanned the Chrome profile ${dir || '(the only one connected)'}: ${SCAN_SITES.filter((s) => sites[s]!.signedIn).join(', ') || 'signed in nowhere'}`);
  return { sites };
}

/** Other accounts with YouTube on in the same Chrome profile as this one. */
function ytPeers(a: IgAccount): IgAccount[] {
  const all = store.get().igAccounts;
  const conn = chrome.match(a, all);
  if (!conn) return [];
  return all.filter((x) => x.id !== a.id && x.youtube?.enabled && chrome.match(x, all) === conn);
}

/** Chrome profile (connection id) -> the account that last acted in its YouTube tab, and when. */
const ytLast = new Map<number | string, { accountId: string; at: number }>();
/** How long an account keeps the shared YouTube tab after its last action (an upload is several calls). */
const YT_HOLD_MS = 120_000;

/** A YouTube tab worked in just now: an upload may still be going (Studio publishes before the file is up), so it is not closed. */
function ytUploading(t: Tab): boolean {
  if (t.site !== 'youtube' || !t.conn) return false;
  const last = ytLast.get(t.conn.id);
  return !!last && Date.now() - last.at < YT_HOLD_MS;
}

const STUDIO = /^https:\/\/studio\.youtube\.com\//;
const chName = (a: IgAccount): string => (a.youtube?.channelName ? `"${a.youtube.channelName}"` : a.youtube?.channelHandle ? `@${a.youtube.channelHandle}` : a.youtube?.channelId ?? 'its channel');

async function ytChannelGate(tab: Tab, a: IgAccount, target?: string): Promise<{ block?: string; note?: string }> {
  const peers = ytPeers(a);
  const want = a.youtube?.channelId;
  if (!want)
    return peers.length
      ? { block: `${[a, ...peers].map((x) => x.handle).join(', ')} all use YouTube in this Chrome profile, and ${a.handle} has no channel set, so the hub can't tell which channel is its. Ask the user for its channel link and save it with save_account (youtube_channel), or they paste it on the Accounts page.` }
      : {};
  if (!(await tab.s.cookies()).loggedIn) return {};
  // A youtube.com page the AI asked for (a channel, a video): Google's signed-in channel is shown there; nothing to switch.
  if (target && !STUDIO.test(target)) return {};
  const url = await tab.s.url();
  if (!STUDIO.test(url)) return {};
  const now = studioChannelOf(url);
  if (now === want) {
    tab.channelId = want;
    return {};
  }
  const last = tab.conn ? ytLast.get(tab.conn.id) : undefined;
  const holder = last && last.accountId !== a.id && Date.now() - last.at < YT_HOLD_MS ? peers.find((p) => p.id === last.accountId) : undefined;
  if (holder)
    return { block: `${holder.handle} is using this Chrome profile's YouTube tab (its last action ${Math.round((Date.now() - last!.at) / 1000)}s ago; switching channels now would break its upload). Finish ${holder.handle}'s YouTube work first, or browser_wait and try again in a minute.` };
  deps.log('info', `[browser] ${a.handle} switching YouTube Studio from ${now ?? 'its start page'} to channel ${want}`);
  const done = (drawer: string, how: string): { note: string } => {
    tab.channelId = want;
    tab.channelName = drawer;
    if (a.youtube?.channelName !== drawer) store.saveAccount({ id: a.id, youtube: { ...a.youtube!, channelName: drawer } });
    deps.log('info', `[browser] ${a.handle} YouTube Studio now on channel "${drawer}" (${want}, ${how})`);
    return { note: `Switched YouTube Studio to ${a.handle}'s channel "${drawer}".` };
  };
  // 1. Studio's own address for the channel: it opens that channel when the Google sign-in owns it.
  let drawer = await studioOn(tab, want, 25_000);
  if (drawer) return done(drawer, 'studio link');
  // 2. YouTube's channel switcher (youtube.com/channel_switcher lists every channel of the sign-in): the hub picks the
  //    account's channel there itself, then opens Studio again.
  const picked = await pickInSwitcher(tab, a);
  if (picked) {
    drawer = await studioOn(tab, want, 25_000);
    if (drawer) return done(drawer, 'channel switcher');
  }
  deps.log('warn', `[browser] ${a.handle} YouTube Studio did not switch to channel ${want}${picked ? '' : ' (not in the channel switcher)'}`);
  return {
    block: picked
      ? `YouTube Studio did not open ${a.handle}'s channel ${chName(a)} (${want}) even after picking it in YouTube's channel switcher. Studio may be asking something: ask the user to look at the YouTube tab.`
      : `${a.handle}'s channel ${chName(a)} (${want}) is not among the channels of the Google account signed in to this Chrome profile (youtube.com/channel_switcher lists them). Ask the user to check the channel link on the Accounts page, or the Chrome profile it runs in.`,
  };
}

/** Load Studio on that channel and wait until it really shows it (its side bar names the channel). The name, or ''. */
async function studioOn(tab: Tab, want: string, ms: number): Promise<string> {
  await tab.s.load(`https://studio.youtube.com/channel/${want}`);
  for (const until = Date.now() + ms; Date.now() < until; await sleep(700)) {
    const on = studioChannelOf(await tab.s.url().catch(() => ''));
    if (on && on !== want) {
      // Studio went to another channel: give it a moment in case it is still redirecting, then stop.
      await sleep(1500);
      if (studioChannelOf(await tab.s.url().catch(() => '')) !== want) return '';
      continue;
    }
    if (on !== want) continue;
    const name = await inPage<string>(tab, `(() => { const n = document.querySelector('#entity-name,ytcp-navigation-drawer .entity-name'); return n ? n.textContent.trim() : ''; })()`).catch(() => '');
    if (name) return name;
  }
  return '';
}

/** On youtube.com/channel_switcher (it lands on youtube.com/account, "All channels"), click the account's channel. */
async function pickInSwitcher(tab: Tab, a: IgAccount): Promise<boolean> {
  const y = a.youtube!;
  const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const names = [y.channelHandle ? `@${esc(y.channelHandle)}(\\s|$)` : '', y.channelName ? `^${esc(y.channelName)}\\s` : ''].filter(Boolean);
  if (!names.length) return false;
  await tab.s.load('https://www.youtube.com/channel_switcher');
  for (const until = Date.now() + 15_000; Date.now() < until; await sleep(700)) {
    for (const re of names) {
      const ref = await inPage<number>(tab, `window.__mk.byName(${JSON.stringify(re)})`).catch(() => 0);
      const t = ref ? await inPage<Target>(tab, `window.__mk.target(${ref})`).catch(() => null) : null;
      if (!t || t.gone) continue;
      await mouseClick(tab, t.x, t.y);
      deps.log('info', `[browser] ${a.handle} picked "${t.name}" in YouTube's channel switcher`);
      await sleep(3500);
      return true;
    }
  }
  return false;
}

// ── Tools ──────────────────────────────────────────────────────────────────
/** The account the AI opened a tab for last (closing tabs on an account switch, Setup > Performance). */
let lastOpened: string | null = null;

/**
 * Setup > Performance "close tabs between accounts": the AI moved on to another account, so the last one's Marketo
 * tabs close (one window per site per account otherwise piles up for the whole run). Kept open: a post still going up,
 * a tab with an approval waiting, a YouTube tab the new account shares, and Content Rewards tabs (a submission has a
 * 30-minute window; the run-end clean-up closes those).
 */
function closePreviousAccount(next: IgAccount): void {
  const prevId = lastOpened;
  lastOpened = next.id;
  if (!prevId || prevId === next.id || !perf.values().closeTabsOnSwitch) return;
  const prev = store.get().igAccounts.find((x) => x.id === prevId);
  if (!prev) return;
  if (approvals.all().some((x) => (x.state === 'pending' || x.state === 'approved') && sameHandle(x.handle, prev.handle))) return;
  const shared = new Set(ytPeers(prev).map((p) => p.id));
  const now = Date.now();
  const closed: string[] = [];
  for (const [, t] of tabsOf(prev.id)) {
    if (!isOpen(t) || t.site === 'rewards' || (t.settleUntil ?? 0) > now || ytUploading(t)) continue;
    if (t.site === 'youtube' && shared.has(next.id)) continue;
    closeIt(t);
    closed.push(SITES[t.site].label);
  }
  if (closed.length) {
    deps.log('info', `[browser] closed ${prev.handle}'s ${closed.join(', ')} tab(s): the run moved on to ${next.handle}`);
    void broadcast();
  }
}

/** Account + platform -> when pages were opened there lately (url, time), to keep page loads at a person's pace. */
const pageLoads = new Map<string, { url: string; at: number }[]>();
/** Why opening this page now would look like a script (null = fine): the same page again within 2 minutes, or 6 loads in 2 minutes. */
function loadPace(key: string, url: string): string | null {
  const now = Date.now();
  const norm = url.replace(/#.*$/, '').replace(/\/$/, '');
  const recent = (pageLoads.get(key) ?? []).filter((l) => now - l.at < 120_000);
  pageLoads.set(key, recent);
  const same = recent.find((l) => l.url === norm);
  if (same) return `That page was opened ${Math.round((now - same.at) / 1000)}s ago. Reloading the same page again and again (to see if something finished or changed) is what scripts do and gets accounts checked: do something else for a few minutes (scroll, watch, read), then look again, at most every few minutes.`;
  if (recent.length >= 6) return `${recent.length} pages opened here in 2 minutes: slow down, scroll and read on the page that is open for a minute or two before opening another.`;
  recent.push({ url: norm, at: now });
  return null;
}

export function toolOpen(handle?: string, url?: string, site?: BrowserSite): Promise<Outcome> {
  let acct: IgAccount | null = null;
  try {
    acct = account(handle);
    closePreviousAccount(acct);
  } catch {
    /* no such account: withTab says so */
  }
  let target = url?.trim();
  let s: BrowserSite = site ?? (target && /^https?:/i.test(target) ? siteOfUrl(target) : null) ?? 'instagram';
  if (target) {
    if (target.startsWith('/')) target = `${new URL(SITES[s].home).origin}${target}`;
    const on = siteOfUrl(target);
    if (on && acct && /^https:\/\//i.test(target)) {
      const slow = loadPace(`${acct.id}|${on}`, target);
      if (slow) return Promise.resolve({ ok: false, text: `Not opened. ${slow}` });
    }
    if (!/^https:\/\//i.test(target) || !on) return Promise.resolve({ ok: false, text: 'Only pages of the account\'s platforms open here (instagram.com, youtube.com, x.com, tiktok.com, facebook.com, threads.com, pinterest.com; each once turned on for the account), and contentrewards.com with site "rewards".' });
    if (site && on !== site) return Promise.resolve({ ok: false, text: `That URL is on ${SITES[on].domain}, not ${SITES[site].domain}.` });
    s = on;
  }
  return withTab(
    handle,
    s,
    async (tab, a) => {
      const r = await read(tab, a);
      if (tab.site === 'rewards') return { ok: true, text: r.text };
      return { ok: true, text: r.text + platformNote(store.findAccount(a.id), tab.site) + kryptNudge(store.findAccount(a.id), tab.site, r.snap.url) };
    },
    target ?? true,
  );
}

/** Account + platform -> the local day browser_open last passed on the user's instructions for it. */
const notesGiven = new Map<string, string>();

/** The user's own instructions for this platform (Home > a platform), the first time it is opened each day. */
function platformNote(a: IgAccount, site: Site): string {
  const note = a.platformNotes?.[site]?.trim();
  const playbook = goalPlaybook(a, site, store.get().brand);
  if (!note && !playbook) return '';
  const key = `${a.id}|${site}`;
  const today = localDate();
  if (notesGiven.get(key) === today) return '';
  notesGiven.set(key, today);
  return `${playbook ? `\n\n${playbook}` : ''}${note ? `\n\nTHE USER'S INSTRUCTIONS FOR ${SITES[site].label.toUpperCase()} (${a.handle}; follow them here, inside the limits and rules):\n${note}` : ''}`;
}

/** Account + platform -> the local day browser_open last reminded the AI of Krypt's follow / visit there. */
const kryptNudged = new Map<string, string>();

/**
 * The first time a day an account opens a platform where following or visiting Krypt's accounts is up, the answer says
 * so (with the links): it reaches every AI session, also one that never read get_today. '' when nothing is up, or it
 * was said today already.
 */
function kryptNudge(a: IgAccount, site: Site, url: string): string {
  if (a.status === 'paused' || (site !== 'youtube' && watchOnlyOn(a, site)) || isKryptPage(site, url)) return '';
  // Not while it would be refused (read-only after a human check, a Threads browse-only run): left for a later open.
  if (humanCheckHold(a, site) || browseOn(a, site)) return '';
  const today = localDate();
  const key = `${a.id}|${site}`;
  if (kryptNudged.get(key) === today) return '';
  let follows = kryptFollowDue(a, site);
  let visits = kryptVisitDue(a, site);
  if (site !== 'youtube') {
    const left = planFor(a, store.get().sessions, today, site).left;
    follows = follows.slice(0, Math.max(0, Math.floor(left.follows)));
    if (left.likes < 1 || left.minutes < 2) visits = [];
    // One comment at most, and only while one is left today.
    let comment = left.comments >= 1;
    visits = visits.map((v) => {
      const c = v.comment && comment;
      if (c) comment = false;
      return { ...v, comment: c };
    });
  }
  if (!follows.length && !visits.length) return '';
  kryptNudged.set(key, today);
  return ['', '', "KRYPT (built in; do it during this session on this platform, after a few minutes of normal scrolling, and before you leave it):", follows.length ? `- ${kryptFollowLine(site, follows)}.` : '', visits.length ? `- ${kryptVisitsLine(site, visits)}.` : ''].filter((x, i) => i < 2 || x).join('\n');
}

export function toolSnapshot(handle?: string, full?: boolean, site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => ({ ok: true, text: (await read(tab, a, !!full)).text }));
}

// What went out since the app started, newest first: exact order, where the session log only keeps one note per post.
const sentNow: Record<'comment' | 'message', string[]> = { comment: [], message: [] };

/** Which kind of text a send is, for the check below (a YouTube Studio reply is a comment too). */
const textKindOf = (v: Verdict, site: Site): TextKind | null =>
  v.kind === 'comment' || (site === 'youtube' && v.kind === 'other' && !!v.text) ? 'comment' : v.kind === 'message' ? 'message' : v.kind === 'post' ? 'post' : null;

/** Why this text would read as machine-written (shared/humanText), against what was already sent. Empty = fine. */
function unnatural(kind: TextKind, site: Site, text: string | undefined): string[] {
  if (!text?.trim()) return [];
  const earlier = kind === 'post' ? [] : [...sentNow[kind], ...store.recentTexts(kind)].filter((e, i, all) => all.indexOf(e) === i);
  return textProblems(kind, site, text, earlier);
}

function noteSent(kind: TextKind | null, text: string | undefined): void {
  if ((kind !== 'comment' && kind !== 'message') || !text?.trim()) return;
  sentNow[kind].unshift(text);
  sentNow[kind].length = Math.min(sentNow[kind].length, 60);
}

async function approve(tab: Tab, a: IgAccount, v: Verdict, url: string, client: string, thread = url): Promise<{ id: string; auto?: boolean } | Outcome> {
  if (tab.site === 'rewards') throw new Error('Content Rewards clicks are not approvals.');
  // Read-only after a human check: here too, so a reply or message sent with Enter is held like a click.
  const held = humanCheckHold(a, tab.site);
  if (held) return { ok: false, text: held };
  const long =tab.site === 'youtube' && v.kind === 'post' ? longPending(a) : null;
  if (v.kind === 'post' && !long) checkGap(a, tab.site);
  if (tab.site === 'youtube') {
    if (long && a.status === 'paused') throw new Error(`${a.handle} is paused: nothing gets sent or changed.`);
    if (v.kind === 'post' && !long) checkYt(a);
    else if (a.status === 'paused') throw new Error(`${a.handle} is paused: nothing gets sent or changed.`);
  } else if (isNetwork(tab.site)) {
    const n = tab.site;
    if (v.kind === 'comment') checkAllowed(a, 'comments', quotaLabel('comments', n), n);
    if (v.kind === 'post') checkAllowed(a, 'posts', 'posting', n);
    if (v.kind === 'message') checkAllowed(a, 'messages', 'messages', n);
    if ((v.kind === 'message' || v.kind === 'unfollow' || v.kind === 'profile' || v.kind === 'other') && (netOf(a, n)?.watchOnly || a.status === 'paused')) throw new Error(`${a.handle} is ${a.status === 'paused' ? 'paused' : `watch-only on ${NETWORK_LABEL[n]}`}: nothing gets sent or changed.`);
  } else {
    if (v.kind === 'comment') checkAllowed(a, 'comments', 'comments');
    if (v.kind === 'post') checkAllowed(a, 'posts', 'posting');
    if (v.kind === 'message') checkAllowed(a, 'messages', 'messages');
    if ((v.kind === 'message' || v.kind === 'unfollow' || v.kind === 'profile' || v.kind === 'other') && (a.watchOnly || a.status === 'paused')) throw new Error(`${a.handle} is ${a.status === 'paused' ? 'paused' : 'watch-only'}: nothing gets sent or changed.`);
  }
  if ((v.kind === 'comment' || v.kind === 'message') && !v.text?.trim()) throw new Error('There is no text to send yet. Type it first.');
  // At most the user's number of comments / replies / messages into one thread (default 2): no long back-and-forths,
  // which on X turn into AI accounts replying to each other (user, 2026-11-19).
  if ((v.kind === 'comment' || v.kind === 'message') && tab.site !== 'youtube' && thread) {
    const cap = store.perThreadCap();
    const sent = store.threadSends(a.handle, tab.site, thread);
    if (sent >= cap) {
      deps.log('info', `[browser] ${a.handle} ${v.kind} held back on ${tab.site}: ${sent} already in this thread (cap ${cap}) (${client})`);
      const what = v.kind === 'message' ? 'messages in this chat' : 'comments or replies in this thread';
      return {
        ok: false,
        text: `Not sent: ${a.handle} already has ${sent} ${what} (${thread}), and the cap is ${cap} per thread (the user's number, Accounts page): no long back-and-forths, which turn into AI accounts replying to each other. Leave this conversation and move on to another post${v.kind === 'message' ? '; if this person still needs an answer, put it in the report for the user' : ''}. Do not try another way to reply here.`,
      };
    }
  }
  // Threads' own text rules (user, 2026-11-22, after Threads asked @yuhgodev to prove it was human): no links in posts,
  // one topic tag, no captions copied from another platform.
  if (tab.site === 'threads' && (v.kind === 'post' || v.kind === 'comment') && v.text?.trim()) {
    const why = threadsTextRule(a, v.kind, v.text, thread || url);
    if (why) {
      deps.log('info', `[browser] ${a.handle} Threads ${v.kind} held back: ${why.slice(0, 80)} (${client})`);
      return { ok: false, text: `Not sent. ${why}` };
    }
  }
  // Text that reads as machine-written is what gets an account restricted: it is sent back for a rewrite, before the user is asked.
  const tk = textKindOf(v, tab.site);
  const problems = tk ? unnatural(tk, tab.site, v.text) : [];
  if (tk && problems.length) {
    deps.log('info', `[browser] ${a.handle} ${tk} held back for a rewrite on ${tab.site}: ${problems.join('; ')} (${client})`);
    return { ok: false, text: rewriteNote(tk, problems, true) };
  }
  const input = { handle: a.handle, kind: v.kind as ApprovalKind, action: v.action ?? `Do this on ${SITES[tab.site].label}`, text: v.text, url, client };
  // Approvals switched off (the default): it goes through now, still inside the limits checked above.
  if (!v.always && v.kind !== 'profile' && !store.get().settings.askApproval) return { id: approvals.auto(input).id, auto: true };
  const req = approvals.request(input);
  const state = await approvals.wait(req.id, APPROVAL_WAIT_MS);
  if (state === 'approved') return { id: req.id };
  if (state === 'rejected') return { ok: false, text: `The user rejected it (${v.action}). Don't retry the same thing; ask them what to change.` };
  if (state === 'pending') return { ok: false, text: `Waiting for the user: "${v.action}" needs their approval in Krypt Marketo (${req.id}). Nothing was sent. Call the same tool again to keep waiting; leave the text as it is.` };
  return { ok: false, text: `The approval for "${v.action}" expired unanswered. Ask the user whether they still want it.` };
}

export function toolClick(handle: string | undefined, ref: number, client: string, site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    let t = await inPage<Target>(tab, `window.__mk.target(${ref})`);
    if (t.gone) return { ok: false, text: `[${ref}] is no longer on the page. browser_snapshot for a fresh listing.` };
    const block = await inputBlock(tab, a, t.lang);
    if (block) return { ok: false, text: block };
    if (t.covered) {
      // X's docked Messages / Grok panels float over the bottom-right of a short window.
      const xPanel = tab.site === 'x' && /^(messages|grok|chat)\b/i.test(t.covered);
      return {
        ok: false,
        text: xPanel
          ? `[${ref}] "${t.name}" is under X's docked "${t.covered}" panel (bottom right; the Chrome window is too short for both). browser_snapshot, click the panel's collapse / close button (or press Escape), then click [${ref}] again.`
          : `[${ref}] "${t.name}" is covered by "${t.covered}". Close what is on top of it (Escape often does) or scroll, then look again.`,
      };
    }
    if (tab.site === 'rewards') return rewardsClick(tab, a, ref, t);

    const judge = (x: Target): Verdict => verdictOn(tab.site, x, a);
    const v = judge(t);
    let note = '';
    let approvalId: string | null = null;
    let auto = false;
    if (v.kind === 'never') return { ok: false, text: v.why ?? `"${t.name}" is for the user to press, not an AI.` };
    if (v.kind === 'free' && tab.site !== 'youtube' && (UNDO_LABEL.test(t.name.trim()) || t.testid === 'unlike' || t.testid === 'unretweetConfirm' || (t.pressed && /^like\b/i.test(t.name.trim()))))
      return { ok: false, text: `"${t.name}" would take back a like or repost that is already there. People almost never do that, and a like flipped off and on again is what bots look like: leave it as it is and move on. If it went on the wrong post by mistake, say so in the session report.` };
    if (v.kind === 'repost') fromMenu(tab, t);
    if (v.kind !== 'free') {
      const held = humanCheckHold(a, tab.site);
      if (held) return { ok: false, text: held };
    }
    if (isCounted(v.kind)) {
      const stop = readFirst(tab, a, t);
      if (stop) return { ok: false, text: stop };
    }
    // Krypt's posts met anywhere (the feed, a visit): at a fan's rate, so many installs never look like a ring.
    const onKrypt = tab.site !== 'youtube' && (isCounted(v.kind) || v.kind === 'comment') ? onKryptPost(tab.site, t) : null;
    if (onKrypt) {
      const stop = kryptPostLimit(a, tab.site, onKrypt, v.kind, t.postUrl || t.url);
      if (stop) return { ok: false, text: stop };
    }
    // Today's repost of one of Krypt's posts (shared/kryptFollow.ts): outside the repost limit, once a day per platform.
    const kryptRepost = v.kind === 'repost' && onKrypt ? kryptRepostDue(a, tab.site, store.get().settings.firstRunAt) : null;
    if (isCounted(v.kind)) {
      if (kryptRepost) checkActive(a, 'reposts', tab.site);
      else checkAllowed(a, QUOTA_OF[v.kind], quotaLabel(QUOTA_OF[v.kind], tab.site), tab.site);
      await engagePause(tab);
      // Long enough on the post to have read it (a person reads about 4 words a second, after a glance), or on a video
      // to have watched some of it.
      const need = (READ_SITES.has(tab.site) ? readMs(t.words ?? 0) : rand(6000, 12000)) - (Date.now() - (tab.lastMove ?? 0));
      if (need > 0) await sleep(need);
    } else if (v.ytLike) {
      await engagePause(tab);
    } else if (v.kind !== 'free') {
      const r = await approve(tab, a, v, t.postUrl || t.url, client, t.thread || t.postUrl || t.url);
      if ('ok' in r) return r;
      approvalId = r.id;
      auto = !!r.auto;
      // The page may have moved while the user decided.
      t = await inPage<Target>(tab, `window.__mk.target(${ref})`);
      if (t.gone || t.covered) return { ok: false, text: 'Approved, but the page changed while waiting. Take a browser_snapshot and click it again within 5 minutes (no new approval needed if nothing else changed).' };
      const again = judge(t);
      if (again.kind !== v.kind || (again.text ?? '') !== (v.text ?? '')) return { ok: false, text: 'The text or button changed after the user approved it, so nothing was sent. Ask for approval again.' };
    }

    // The pause and reading time can be long: find the button again where it is now before pressing it.
    if (isCounted(v.kind) || v.ytLike) {
      const now = await inPage<Target>(tab, `window.__mk.target(${ref})`).catch(() => null);
      if (!now || now.gone || now.covered || judge(now).kind !== v.kind)
        return { ok: false, text: `The page changed while reading, so [${ref}] was not pressed and nothing was counted. Take a browser_snapshot and look again.` };
      t = now;
      if (v.kind === 'repost') fromMenu(tab, t);
    }
    if (opensRepostMenu(tab.site, t) && t.words) tab.menuPost = { url: t.postUrl || t.url, creator: t.creator, at: Date.now() };
    const before = t.name;
    await mouseClick(tab, t.x, t.y);
    if (v.kind === 'free' && /^(next|previous|go to next|go to previous|next video|previous video)\b/i.test(t.name.trim())) tab.lastMove = Date.now();
    await sleep(rand(650, 1100));

    if (isCounted(v.kind)) {
      tab.lastCounted = Date.now();
      tab.lastPost = t.postUrl || t.url;
      const nameNow = (): Promise<string | null> => inPage<string | null>(tab, `window.__mk.nameNow(${ref})`).catch(() => null);
      let after = await nameNow();
      // Threads: a Follow button that still reads "Follow" after the click followed nobody (a slow page), so it is not counted.
      if (tab.site === 'threads' && v.kind === 'follow' && after && FOLLOW_LABEL.test(after.trim())) {
        await sleep(1400);
        after = await nameNow();
        if (after && FOLLOW_LABEL.test(after.trim())) {
          deps.log('info', `[browser] ${a.handle} Threads follow click left the button at "${after}": not counted (${client})`);
          return { ok: true, text: `Not counted: [${ref}] "${before}" still reads "${after}", so nobody was followed by that click. Take a browser_snapshot: if their profile still shows Follow, wait a moment and press it once more there, on their profile page (never from a card or a search result). (If the listing below already shows "Following" for them, it did go through: say so in the report.)\n${(await read(tab, store.findAccount(a.id))).text}` };
        }
      }
      // TikTok does not show whether a video is already in Favorites. A count that went down means this click took
      // it out: put it back and count nothing.
      if (tab.site === 'tiktok' && v.kind === 'save') {
        const was = countIn(before);
        const now = countIn(after);
        if (was !== null && now !== null && now < was) {
          await sleep(rand(900, 1500));
          await mouseClick(tab, t.x, t.y);
          await sleep(rand(700, 1100));
          const back = countIn(await nameNow());
          deps.log('info', `[browser] ${a.handle} TikTok favorite click removed an existing favorite (${was} to ${now}); clicked again, now ${back ?? 'unread'}; not counted (${client})`);
          return { ok: true, text: `Not counted: this video was already in the account's Favorites (the count went ${was} to ${now}, so that click took it out). ${back !== null && back >= was ? `Clicked once more and it is back in (${back}).` : 'Clicked once more to put it back: check the count in the listing below.'} Favorite a different video.\n${(await read(tab, store.findAccount(a.id))).text}` };
        }
      }
      store.recordAction(a.handle, t.postUrl || t.url, v.kind, { creator: t.creator || undefined }, tab.site);
      note = `Counted 1 ${tab.site === 'tiktok' && v.kind === 'save' ? 'favorite' : v.kind}${after && after.toLowerCase() !== before.toLowerCase() ? ` (button now says "${after}")` : ''}. `;
      const fk = v.kind === 'follow' ? followsKrypt(tab.site, t) : null;
      if (fk && kryptFollowed(a.id, tab.site, fk)) note += `That was Krypt's ${fk.handle}: the one-time follow of it is done. `;
      if (kryptRepost) {
        const fresh = store.findAccount(a.id);
        store.saveAccount({ id: a.id, kryptReposted: { ...(fresh.kryptReposted ?? {}), [tab.site]: new Date().toISOString() } });
        deps.log('info', `[browser] ${a.handle} reposted Krypt's post on ${SITES[tab.site].label}`);
        note += "That was today's repost of Krypt's post: done here for today. ";
      }
    } else if (v.ytLike) {
      tab.lastCounted = Date.now();
      await sleep(700);
      const now = await inPage<Target>(tab, `window.__mk.target(${ref})`).catch(() => null);
      if (now && !now.gone && now.pressed) {
        const day = new Date().toDateString();
        ytKryptLikes.set(a.id, { day, n: ytKryptLikesToday(a) + 1 });
        store.recordAction(a.handle, t.postUrl || t.url, 'like', { creator: t.creator || undefined }, tab.site);
        deps.log('info', `[browser] ${a.handle} liked Krypt's Short ${t.url} (${client})`);
        note = "Liked Krypt's Short. ";
      } else note = 'The Like button does not read as pressed yet: take a browser_snapshot before anything else, and do not press it again. ';
    } else if (v.krypt) {
      // Recorded only once the button itself reads as subscribed; a sign-in or confirm prompt leaves it open.
      await sleep(900);
      const after = await inPage<string | null>(tab, `window.__mk.nameNow(${ref})`).catch(() => null);
      const kc = isKryptPage(tab.site, t.url);
      if (after && kc && isSubscribedButton(after) && kryptFollowed(a.id, tab.site, kc)) note = `Subscribed to Krypt's channel ${kc.handle}: the one-time subscribe to it is done. `;
    } else if (approvalId) {
      approvals.consume(approvalId);
      // YouTube Studio may answer Publish with its "still checking" dialog instead of publishing: then nothing went out, so nothing is counted.
      if (v.kind === 'post' && tab.site === 'youtube') {
        await sleep(1500);
        const page = await read(tab, store.findAccount(a.id));
        if (YT_HELD.test(page.text) && !/video published/i.test(page.text)) {
          deps.log('info', `[browser] ${a.handle} YouTube publish held by "still checking"; not counted (${client})`);
          return { ok: true, text: `Clicked [${ref}] "${before}", but YouTube did not publish: it is still checking the video. Nothing was counted. Close this dialog if it offers that, wait for the checks to finish (the Checks step says complete), then press Publish again.
${page.text}` };
        }
      }
      if (v.kind === 'comment' && tab.site !== 'youtube') store.recordAction(a.handle, t.postUrl || t.url, 'comment', { creator: t.creator || undefined, note: v.text, thread: t.thread }, tab.site);
      if (v.kind === 'comment') kryptCommented(a.id, tab.site, t);
      if (v.kind === 'message' && tab.site !== 'youtube') store.recordAction(a.handle, t.postUrl || t.url, 'message', { creator: t.creator || undefined, note: v.text, thread: t.thread }, tab.site);
      noteSent(textKindOf(v, tab.site), v.text);
      const long = v.kind === 'post' && tab.site === 'youtube' ? longPending(a) : null;
      if (long) {
        longUploads.delete(a.id);
        store.saveLongVideo({ id: long.id, status: 'uploaded' });
      } else {
        if (v.kind === 'post') postClicks.set(`${a.id}|${tab.site}`, Date.now());
        if (v.kind === 'post' && tab.site === 'youtube') store.recordYtUpload(a.id);
        else if (v.kind === 'post') store.recordAction(a.handle, t.url, 'post', {}, tab.site);
      }
      note = auto ? `Done: ${v.action}. ` : `Approved by the user and done: ${v.action}. `;
      deps.log('info', `[browser] ${a.handle} ${v.kind} ${auto ? 'sent (approvals off)' : 'approved and sent'} (${client})`);
      if (v.kind === 'post' && tab.site !== 'youtube') {
        // Leaving the page while the upload is still going loses the post (seen on Threads and Facebook), so the hub stays here first.
        const t0 = Date.now();
        const hold = POST_SETTLE_S[tab.site];
        tab.settleUntil = t0 + hold * 1000;
        await sleep(hold * 1000);
        // A fixed wait was not enough: a slow Facebook upload ("Reel processing") was lost when the run moved on.
        // Keep waiting while the page still says it is uploading, up to UPLOAD_HOLD_MS in all.
        let still = false;
        let pressedDone = false;
        while (UPLOAD_WATCH.has(tab.site) && Date.now() - t0 < UPLOAD_HOLD_MS) {
          const now = await read(tab, store.findAccount(a.id)).catch(() => null);
          if (now && !pressedDone && (await fbProcessingDone(tab, now.text).catch(() => false))) {
            pressedDone = true;
            deps.log('info', `[browser] ${a.handle} pressed Done on Facebook's "Reel processing" box`);
            note += `Facebook said "Reel processing: once it finishes, it will be published", and the hub pressed Done on that box (the reels left with it open never went live). Facebook finishes it on its own now; look for it in Content or on the Page in a few minutes. `;
            break;
          }
          still = !!now && UPLOADING.test(now.text);
          if (!still) break;
          tab.settleUntil = Date.now() + 20_000;
          await sleep(10_000);
        }
        const waited = Math.round((Date.now() - t0) / 1000);
        if (still) {
          tab.settleUntil = Date.now() + 120_000;
          deps.log('warn', `[browser] ${a.handle} ${SITES[tab.site].label} post still uploading after ${waited}s`);
          note += `The page still says it is uploading after ${waited}s. Do not leave this page or close it yet: browser_wait here (40s at a time) until the upload is gone, then check the post is up. `;
        } else if (waited > hold + 5) deps.log('info', `[browser] ${a.handle} ${SITES[tab.site].label} upload finished after ${waited}s`);
        note += `Stayed on the page ${waited}s so it could finish going up. Sending it used one of today's post slots; it is not proof the post exists. Check now that it is really up (the profile, or the Published list): if it is, mark_posted (a reel) or log_posts with its link. If it is still uploading in the listing below, browser_wait and look again. If it never shows up, post_failed with platform "${tab.site}" gives the slot back for one more try. `;
      }
    }
    return { ok: true, text: `${note}Clicked [${ref}] "${before}".\n${(await read(tab, store.findAccount(a.id))).text}` };
  });
}

async function submitWithEnter(tab: Tab, a: IgAccount, client: string): Promise<Outcome | null> {
  // Content Rewards: Enter sends a link or a search, nothing that needs an approval.
  if (tab.site === 'rewards') {
    await pressKey(tab, 'Enter');
    return null;
  }
  const f = await inPage<Focus>(tab, 'window.__mk.focus()');
  let v = classifyEnter(f);
  // YouTube Studio: Enter only adds a line or a tag, except in a reply box.
  if (tab.site === 'youtube') v = v.kind === 'comment' ? { kind: 'other', action: 'Post this reply on YouTube', text: v.text } : { kind: 'free' };
  if (v.kind === 'free') {
    await pressKey(tab, 'Enter');
    return null;
  }
  const r = await approve(tab, a, v, f.postUrl || f.url || '', client, f.thread || f.postUrl || f.url || '');
  if ('ok' in r) return r;
  const now = await inPage<Focus>(tab, 'window.__mk.focus()');
  if (!now.editable || now.value !== f.value) return { ok: false, text: 'The text changed after the user approved it, so nothing was sent. Ask for approval again.' };
  await pressKey(tab, 'Enter');
  approvals.consume(r.id);
  if (v.kind === 'comment' && tab.site !== 'youtube') store.recordAction(a.handle, f.postUrl || f.url || '', 'comment', { creator: f.creator || undefined, note: v.text, thread: f.thread }, tab.site);
  if (v.kind === 'comment') kryptCommented(a.id, tab.site, f);
  if (v.kind === 'message' && tab.site !== 'youtube') store.recordAction(a.handle, f.postUrl || f.url || '', 'message', { creator: f.creator || undefined, note: v.text, thread: f.thread }, tab.site);
  noteSent(textKindOf(v, tab.site), v.text);
  deps.log('info', `[browser] ${a.handle} ${v.kind} ${r.auto ? 'sent (approvals off)' : 'approved and sent'} (${client})`);
  return null;
}

export function toolType(handle: string | undefined, ref: number, text: string, opts: { clear?: boolean; submit?: boolean }, client: string, site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const t = await inPage<Target>(tab, `window.__mk.target(${ref})`);
    if (t.gone) return { ok: false, text: `[${ref}] is no longer on the page. browser_snapshot for a fresh listing.` };
    const block = await inputBlock(tab, a, '');
    if (block) return { ok: false, text: block };
    if (!t.editable) return { ok: false, text: `[${ref}] "${t.name}" (${t.role}) is not a text field.` };
    if (t.type === 'password') return { ok: false, text: 'Passwords are typed by the user, never by an AI.' };
    if (t.covered) return { ok: false, text: `[${ref}] is covered by "${t.covered}".` };
    if (tab.site === 'rewards') {
      // Post links, searches and a short note only: everything else there (profile, payout details) is the user's.
      if (!/^https?:\/\/\S+$/i.test(text.trim()) && !/link|url|search|note/i.test(`${t.name} ${t.type}`)) return { ok: false, text: 'On Content Rewards only post links, searches and a short submission note are typed by the AI; the rest there is the user\'s.' };
      await mouseClick(tab, t.x, t.y);
      await sleep(rand(250, 500));
      if (opts.clear && t.value) {
        await inPage<boolean>(tab, `window.__mk.selectAll(${ref})`);
        await pressKey(tab, 'Backspace');
      }
      await typeText(tab, text, t.tag !== 'textarea' && t.tag !== 'input');
      if (opts.submit) await pressKey(tab, 'Enter');
      await sleep(rand(500, 900));
      return { ok: true, text: `Typed into [${ref}] "${t.name}".${opts.submit ? ' Pressed Enter.' : ''}\n${(await read(tab, a)).text}` };
    }
    // A comment, reply or message that would read as machine-written is turned back before a key is pressed
    // (the same check runs again when it is sent, on whatever the box then holds).
    // X names its reply box "Post text", like the composer: it is a reply box in a "Replying to" dialog, or inline on a post's page.
    const xReply = tab.site === 'x' && /post text|post your reply/i.test(t.name) && (t.dialog || t.dialogText ? /replying to/i.test(t.dialogText) : /\/status\/\d+/.test(pathOf(t.url)));
    const box: TextKind | null = t.type === 'search' || /search/i.test(t.name) ? null : xReply || /comment|reply/i.test(t.name) ? 'comment' : /message/i.test(t.name) ? 'message' : null;
    if (box) {
      const whole = opts.clear || !t.value ? text : `${t.value}${text}`;
      const problems = unnatural(box, tab.site, whole);
      if (problems.length) {
        deps.log('info', `[browser] ${a.handle} ${box} turned back before typing on ${tab.site}: ${problems.join('; ')} (${client})`);
        return { ok: false, text: rewriteNote(box, problems, false) };
      }
    }
    await mouseClick(tab, t.x, t.y);
    await sleep(rand(250, 500));
    // YouTube Studio's title box is pre-filled with the file name: what is typed there always replaces it (typing
    // after it made "<file name><title>" titles over the 100-character limit).
    const clear = opts.clear || (tab.site === 'youtube' && /add a title/i.test(t.name));
    if (clear && t.value) {
      // Ctrl/Cmd+A with the selectAll editing command: a synthetic key alone does not select in rich editors (TikTok, X).
      const mod = process.platform === 'darwin' ? 4 : 2;
      await cdp(tab, 'Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: mod, commands: ['selectAll'] });
      await cdp(tab, 'Input.dispatchKeyEvent', { type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: mod });
      // And select the field's contents directly, for editors that ignore the shortcut.
      await inPage<boolean>(tab, `window.__mk.selectAll(${ref})`);
      await sleep(rand(80, 160));
      await pressKey(tab, 'Backspace');
      await sleep(rand(120, 260));
      // Still text left (an editor that ignored the selection)? Delete it from the end, one key at a time.
      const left = await inPage<Target>(tab, `window.__mk.target(${ref})`);
      if (!left.gone && left.value) {
        await pressKey(tab, 'End');
        for (let i = 0; i < Math.min(600, Array.from(left.value).length + 4); i++) {
          await pressKey(tab, 'Backspace');
          await sleep(rand(15, 35));
          if (i % 40 === 39) {
            const now = await inPage<Target>(tab, `window.__mk.target(${ref})`);
            if (now.gone || !now.value) break;
          }
        }
        const rest = await inPage<Target>(tab, `window.__mk.target(${ref})`);
        if (!rest.gone && rest.value) return { ok: false, text: `Could not empty [${ref}] "${t.name}"; it still holds: "${rest.value.slice(0, 120)}". Nothing was typed.` };
      }
    }
    await typeText(tab, text, t.tag !== 'textarea' && t.tag !== 'input');
    await sleep(rand(300, 600));
    let note = `Typed into [${ref}] "${t.name}".`;
    if (opts.submit) {
      const stop = await submitWithEnter(tab, a, client);
      if (stop) return stop;
      note += ' Pressed Enter.';
      await sleep(rand(700, 1100));
    }
    return { ok: true, text: `${note}\n${(await read(tab, store.findAccount(a.id))).text}` };
  });
}

export function toolPress(handle: string | undefined, key: string, client: string, site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    if (!KEYS[key]) return { ok: false, text: `Unknown key "${key}". Keys: ${KEY_NAMES.join(', ')}.` };
    if (key !== 'Escape') {
      const block = await inputBlock(tab, a, '');
      if (block) return { ok: false, text: block };
    }
    if (key === 'Enter') {
      const stop = await submitWithEnter(tab, a, client);
      if (stop) return stop;
    } else {
      await pressKey(tab, key);
      if (/^(PageUp|PageDown|ArrowUp|ArrowDown|Space|Home|End)$/.test(key)) tab.lastMove = Date.now();
    }
    await sleep(rand(500, 900));
    return { ok: true, text: `Pressed ${key}.\n${(await read(tab, store.findAccount(a.id))).text}` };
  });
}

export function toolScroll(handle: string | undefined, direction: 'up' | 'down', amount: 'small' | 'page' | 'big' = 'page', site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const h = tab.vh;
    const px = { small: h * 0.35, page: h * 0.8, big: h * 2.2 }[amount] * rand(0.9, 1.1);
    await wheel(tab, direction === 'down' ? px : -px);
    tab.lastMove = Date.now();
    await sleep(rand(600, 1000));
    return { ok: true, text: `Scrolled ${direction}.\n${(await read(tab, a)).text}` };
  });
}

const POST_URL = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels)\/[A-Za-z0-9_-]+/;

/** Stay on the page (watching a reel is waiting). Long waits are how a human-paced session looks. */
export function toolWait(handle: string | undefined, seconds: number, site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const s = Math.max(1, Math.min(40, seconds));
    await sleep(s * 1000);
    let { snap, text } = await read(tab, a);
    if (await fbProcessingDone(tab, text).catch(() => false)) {
      deps.log('info', `[browser] ${a.handle} pressed Done on Facebook's "Reel processing" box (while waiting)`);
      ({ snap, text } = await read(tab, a));
    }
    // Waiting on a post that is still going up: keep the tab held while it uploads, free it once it is done.
    if ((tab.settleUntil ?? 0) > Date.now() && UPLOAD_WATCH.has(tab.site)) tab.settleUntil = UPLOADING.test(text) ? Date.now() + 60_000 : 0;
    if (s >= 3 && ((tab.site === 'instagram' && POST_URL.test(snap.url)) || (tab.site === 'x' && X_POST_URL.test(snap.url)) || (tab.site === 'tiktok' && TT_VIDEO_URL.test(snap.url)) || (tab.site === 'facebook' && FB_POST_URL.test(snap.url)) || (tab.site === 'threads' && TH_POST_URL.test(snap.url)) || (tab.site === 'pinterest' && PIN_URL.test(snap.url)))) store.recordAction(a.handle, snap.url, 'watch', {}, tab.site);
    return { ok: true, text: `Waited ${s}s.\n${text}` };
  });
}

/** Close the tabs/windows Marketo opened for an account (one site, or all). Only Marketo's own tabs: the user's other tabs are never touched. */
export function toolClose(handle?: string, site?: BrowserSite): Outcome {
  let a: IgAccount;
  try {
    a = account(handle);
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
  const busy = [...tabsOf(a.id)].filter(([, t]) => (!site || t.site === site) && isOpen(t) && (t.settleUntil ?? 0) > Date.now()).map(([, t]) => t);
  if (busy.length) return { ok: false, text: `A post is still going up on ${busy.map((t) => SITES[t.site].label).join(', ')}: closing the tab now can lose it. Wait ${Math.ceil((Math.max(...busy.map((t) => t.settleUntil ?? 0)) - Date.now()) / 1000)}s, check the post is up, then close.` };
  const open = [...tabsOf(a.id)].filter(([, t]) => (!site || t.site === site) && isOpen(t)).map(([, t]) => SITES[t.site].label);
  closeTab(a.id, site);
  void broadcast();
  return { ok: true, text: open.length ? `Closed ${open.join(', ')} for ${a.handle}.` : `No Marketo tabs were open for ${a.handle}${site ? ` on ${SITES[site].label}` : ''}.` };
}

/** Close every tab Marketo opened, for every account (the end of an autopilot run). */
export function closeRunTabs(): number {
  let n = 0;
  const now = Date.now();
  for (const a of store.get().igAccounts)
    for (const [, t] of tabsOf(a.id)) {
      if (!isOpen(t)) continue;
      // A post still going up stays open: closing it now can lose the upload.
      if ((t.settleUntil ?? 0) > now || ytUploading(t)) continue;
      closeIt(t);
      n++;
    }
  void broadcast();
  return n;
}

export function toolBack(handle?: string, site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    if ((tab.settleUntil ?? 0) > Date.now()) return { ok: false, text: `A post is still going up in this ${SITES[site].label} tab: going back now can lose it. browser_wait and look again until the upload is gone.` };
    if (!(await tab.s.back())) return { ok: false, text: 'There is no page to go back to.' };
    await sleep(rand(1000, 1500));
    return { ok: true, text: `Went back.\n${(await read(tab, a)).text}` };
  });
}

export function toolScreenshot(handle?: string, site: BrowserSite = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const shot = await cdp<{ data: string }>(tab, 'Page.captureScreenshot', { format: 'jpeg', quality: 60 });
    return { ok: true, text: `Screenshot of the ${tab.s.place} for ${a.handle} (${await tab.s.url()}). To click, use the numbers from browser_snapshot, not pixel positions.`, images: [{ data: shot.data, mimeType: 'image/jpeg' }] };
  });
}

async function filePickers(tab: Tab, selector: string): Promise<number[]> {
  const doc = await cdp<{ root: { nodeId: number } }>(tab, 'DOM.getDocument', { depth: 0 });
  return (await cdp<{ nodeIds: number[] }>(tab, 'DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector })).nodeIds;
}

const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

/**
 * Put an image (a profile photo, a cover, a Pin image) into the page's open image picker.
 * Only image files from Marketo's own folders: the render folder, the app's data and the app itself.
 */
export function toolAttachImage(handle: string | undefined, file: string, site: Site = 'instagram', ref?: number): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const full = path.resolve(file);
    const roots = [store.get().settings.outputDir, app.getPath('userData'), instance.ROOT, app.getAppPath()].filter(Boolean).map((r) => path.resolve(r).toLowerCase() + path.sep);
    if (!IMAGE_EXT.test(full)) return { ok: false, text: 'Only .png, .jpg or .webp images can be attached.' };
    if (!roots.some((r) => full.toLowerCase().startsWith(r))) return { ok: false, text: `Only images inside Marketo's render folder (${store.get().settings.outputDir}) or its own folders can be attached. Save the image there first.` };
    let st: fs.Stats;
    try {
      st = fs.statSync(full);
    } catch {
      return { ok: false, text: `No file at ${full}.` };
    }
    if (!st.isFile() || st.size > 15 * 1024 * 1024) return { ok: false, text: 'That is not an image file under 15 MB.' };
    const block = await inputBlock(tab, a, '');
    if (block) return { ok: false, text: block };
    let found: number[] = [];
    if (ref !== undefined) {
      const ok = await inPage<boolean>(tab, `window.__mk.markFile(${Math.floor(ref)})`).catch(() => false);
      if (!ok) return { ok: false, text: `No single image picker belongs to [${ref}]. Take a browser_snapshot and pass the number of the "Add photo" / "Upload" button, or leave ref out.` };
      found = await filePickers(tab, 'input[type=file][data-mk-pick]').catch(() => []);
    }
    // Without a button to go by, only a picker that can't be mistaken: the open dialog's, or the page's only one.
    // (A page can hold several: a profile page has the post composer's photo picker next to the cover's.)
    if (!found.length && ref === undefined) {
      for (const sel of ['[role=dialog] input[type=file]', 'input[type=file]']) {
        const all = await filePickers(tab, sel).catch(() => []);
        if (all.length > 1) return { ok: false, text: `The page has ${all.length} file pickers, so it is not clear which one this image is for. Pass ref: the number of the button it belongs to (e.g. "Add cover photo" or "Add profile picture"), from a fresh browser_snapshot.` };
        if (all.length === 1) {
          found = all;
          break;
        }
      }
    }
    if (!found.length) return { ok: false, text: 'There is no image picker on the page. Open the photo / cover / image upload first (for example "Edit profile picture"), or pass ref with the number of the upload button, then call this again.' };
    try {
      await cdp(tab, 'DOM.setFileInputFiles', { nodeId: found[found.length - 1], files: [full] });
    } catch (e) {
      if (tab.s.kind === 'chrome' && /not allowed/i.test((e as Error).message)) return { ok: false, text: 'Chrome refused to attach the file. The user turns on "Allow access to file URLs" for the Krypt Marketo extension (chrome://extensions > Krypt Marketo > Details), then try again.' };
      throw e;
    }
    await sleep(rand(1500, 2500));
    return { ok: true, text: `Attached ${path.basename(full)}. Crop or position it if the page asks, then press Save (profile changes always ask the user).\n${(await read(tab, a)).text}` };
  });
}

/** A file picker's accept list and whether it takes several files (read in the page; the last one matching, like the attach itself). */
async function pickerInfo(tab: Tab, selector: string): Promise<{ accept: string; multiple: boolean } | null> {
  return inPage<{ accept: string; multiple: boolean } | null>(
    tab,
    `(() => { const all = document.querySelectorAll(${JSON.stringify(selector)}); const el = all[all.length - 1]; return el ? { accept: el.getAttribute('accept') || '', multiple: !!el.multiple } : null; })()`,
  ).catch(() => null);
}
const takesImages = (accept: string): boolean => !accept.trim() || /image|\.jpe?g|\.png|\.webp|\*\/\*/i.test(accept);

/** Meta Business Suite's post composer (photos and text; Reels have their own). */
const FB_POST_COMPOSER = 'https://business.facebook.com/latest/composer';
/** A button that opens an upload, by its name (the only kind the hub presses for the AI when attaching). */
const UPLOAD_BUTTON = /photo|image|picture|media|upload|attach|add file|select file|gallery/i;

/**
 * Put a reel's slides (2-10 pictures) into a platform's composer as one photo post: an Instagram carousel, a TikTok
 * photo post, a multi-photo post on Threads, Facebook or X. The final Post / Share is the AI's click, counted and
 * spaced like any other post. ref = the upload button to use when the page's own picker can't be told.
 */
export function toolAttachSlides(handle: string | undefined, files: string[], label: string, site: Site, ref?: number): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const def = SLIDE_SITES[site];
    const L = SITES[site].label;
    if (!def) return { ok: false, text: `${L} takes no photo slideshow from the hub. Post the reel's video there instead (render_reel, then browser_attach_reel).` };
    const roots = [store.get().settings.outputDir, app.getPath('userData'), instance.ROOT, app.getAppPath()].filter(Boolean).map((r) => path.resolve(r).toLowerCase() + path.sep);
    const full = files.map((f) => path.resolve(f));
    for (const f of full) {
      if (!IMAGE_EXT.test(f) || !roots.some((r) => f.toLowerCase().startsWith(r))) return { ok: false, text: `Only pictures inside Marketo's render folder can be attached (${f} is not). render_slides saves them there.` };
      if (!fs.existsSync(f)) return { ok: false, text: `A slide is missing on disk (${f}). render_slides again, then attach.` };
    }
    let block = await inputBlock(tab, a, '');
    if (block) return { ok: false, text: block };
    checkAllowed(a, 'posts', 'posting', site);
    const refused = (e: unknown): Outcome | null => (tab.s.kind === 'chrome' && /not allowed/i.test((e as Error).message) ? { ok: false, text: FILE_ACCESS.replace('the reel', 'the slides') } : null);
    let sel = '';
    let found: number[] = [];
    let chosen = false;
    /** Press an upload button with a real click and hand the file dialog it opens the slides. */
    const viaButton = async (n: number): Promise<Outcome | null> => {
      const t = await inPage<Target>(tab, `window.__mk.target(${n})`).catch(() => null);
      if (!t || t.gone) return { ok: false, text: `[${n}] is no longer on the page. browser_snapshot for a fresh listing, then pass the number of the photo upload button.` };
      if (t.covered) return { ok: false, text: `[${n}] "${t.name}" is covered by "${t.covered}". Close what is on top of it (Escape often does), then call this again.` };
      if (verdictOn(tab.site, t, a).kind !== 'free' || !UPLOAD_BUTTON.test(t.name)) return { ok: false, text: `[${n}] "${t.name}" is not a photo upload button. Pass the number of the button that adds photos ("Add photo", "Upload", "Select from computer"), from a fresh browser_snapshot.` };
      try {
        chosen = await tab.s.chooseFiles(() => mouseClick(tab, t.x, t.y), full);
      } catch (e) {
        const r = refused(e);
        if (r) return r;
        throw e;
      }
      return chosen ? null : { ok: false, text: `Pressing "${t.name}" opened no file chooser. Take a browser_snapshot (site "${site}") to see what it opened instead.\n${(await read(tab, a)).text}` };
    };
    const wait = async (selectors: string[], tries: number): Promise<void> => {
      for (let i = 0; i < tries && !found.length; i++) {
        for (const s of selectors) {
          found = await filePickers(tab, s).catch(() => []);
          if (found.length) {
            sel = s;
            break;
          }
        }
        if (!found.length) await sleep(1100);
      }
    };

    if (ref !== undefined) {
      // The upload button the AI points at: its own picker when it has one, else the file dialog it opens.
      const n = Math.floor(ref);
      if (await inPage<boolean>(tab, `window.__mk.markFile(${n})`).catch(() => false)) await wait(['input[type=file][data-mk-pick]'], 1);
      if (!found.length) {
        const bad = await viaButton(n);
        if (bad) return bad;
      }
    } else if (site === 'x') {
      if (!/^\/compose\/post/.test(pathOf(await tab.s.url()))) await tab.s.load(X_COMPOSE);
      await wait(['[role=dialog] input[data-testid=fileInput]'], 4);
      if (!found.length) await wait(['input[data-testid=fileInput]'], 4);
    } else if (site === 'tiktok') {
      if (!TT_STUDIO_PATH.test(pathOf(await tab.s.url()))) await tab.s.load(TT_UPLOAD);
      await wait(['input[type=file][accept*="image"]', 'input[type=file]'], 10);
    } else if (site === 'threads') {
      const now = await tab.s.url();
      if (!/^\/intent\/post/i.test(pathOf(now)) && !(await filePickers(tab, '[role=dialog] input[type=file]').catch(() => [])).length) await tab.s.load(TH_COMPOSE);
      await wait(['[role=dialog] input[type=file]'], 8);
      if (!found.length) await wait(['input[type=file]'], 2);
    } else if (site === 'facebook') {
      const now = await tab.s.url();
      if (!(/^business\./i.test(hostOf(now)) && /^\/latest\/composer/i.test(pathOf(now)))) await tab.s.load(FB_POST_COMPOSER);
      // Business Suite keeps no file input in the page: its "Add photo" button makes one and opens the system dialog.
      await wait(['input[type=file][accept*="image"]'], 3);
      if (!found.length) {
        let opener = 0;
        for (let i = 0; i < 8 && !opener; i++) {
          opener = await inPage<number>(tab, `window.__mk.byName(${JSON.stringify('^add photos?(\\s*(/|or|and)\\s*videos?)?$|^photo(s)?(\\s*/\\s*video)?$')})`).catch(() => 0);
          if (!opener) await sleep(1100);
        }
        if (opener) {
          const bad = await viaButton(opener);
          if (bad) return bad;
        }
      }
    } else {
      // Instagram: the Create dialog's own picker (the AI opens Create > Post first).
      await wait(['[role=dialog] input[type=file]', 'input[type=file]'], 2);
    }
    await read(tab, a);
    block = await inputBlock(tab, a, '');
    if (block) return { ok: false, text: block };

    if (!found.length && !chosen) {
      const HOW: Record<string, string> = {
        instagram: 'No file picker on this page yet. Open Instagram\'s Create dialog first (the "New post" / "Create" entry in the navigation, then "Post"), then call this again.',
        x: 'X\'s compose dialog did not open. Take a browser_snapshot (site "x"), open the composer (the "Post" button in the side bar), then call this again.',
        tiktok: 'TikTok Studio\'s uploader did not open. browser_open with site "tiktok" and url "/tiktokstudio/upload" opens it; then call this again.',
        threads: 'The Threads composer did not open. Take a browser_snapshot (site "threads"), open the composer (the "Create" / "What\'s new?" box), then call this again.',
        facebook: `Meta Business Suite's post composer showed no photo upload. Take a browser_snapshot (site "facebook"): if it asks which Page, the user picks it; browser_open with site "facebook" and url "${FB_POST_COMPOSER}" opens the composer. Then call this again with ref = the number of its "Add photo" button.`,
      };
      return { ok: false, text: HOW[site] ?? `No photo upload found on ${L}. Take a browser_snapshot and pass ref = the number of the photo upload button.` };
    }

    if (!chosen) {
      const info = await pickerInfo(tab, sel);
      // TikTok's web uploader takes only video for many accounts: then the slideshow goes up as its video.
      if (info && !takesImages(info.accept))
        return {
          ok: false,
          text:
            site === 'tiktok'
              ? `TikTok's web uploader takes only video on this account (it accepts "${info.accept}"), so a photo post can't go up from here. If the page shows a separate photo upload button, call this again with ref = its number. Otherwise leave TikTok out for this slideshow (a video of still slides does badly there and can cost the account reach), post one of the account's video styles on TikTok instead, and say so in the report.`
              : `This ${L} uploader takes no pictures (it accepts "${info.accept}"). Take a browser_snapshot and call this again with ref = the number of the photo upload button, or post the video version (render_reel, browser_attach_reel).`,
        };
      if (info && !info.multiple && full.length > 1) return { ok: false, text: `This ${L} uploader takes one file at a time, so ${full.length} slides can't go in as one post. Call this again with ref = the number of the button that adds several photos, or post the video version (render_reel, browser_attach_reel).` };
      try {
        await cdp(tab, 'DOM.setFileInputFiles', { nodeId: found[found.length - 1], files: full });
      } catch (e) {
        const r = refused(e);
        if (r) return r;
        throw e;
      }
    }
    await sleep(rand(3000, 4200));
    deps.log('info', `[browser] ${a.handle} attached ${full.length} slides on ${L}`);
    const n = full.length;
    const after = `Afterwards open the profile, check the post is there with all ${n} pictures, copy its link and mark_posted with platform "${site}" and kind "slides".`;
    if (site === 'instagram') {
      const crop = await igOriginalCrop(tab, true);
      const cropNote =
        crop === 'set' || crop === 'already'
          ? 'The hub set the crop to Original (the full 4:5 picture): leave it.'
          : 'IMPORTANT: Instagram cuts photos to a square unless the crop is changed. Before Next: press the crop button at the bottom left of the picture ("Select crop") and pick "Original" (or 4:5), and check the whole slide shows, the title not cut. The first picture\'s crop is used for all of them.';
      return { ok: true, text: `Attached ${label} as one post (a carousel of ${n}). ${cropNote} Check the dialog shows ${n} pictures in order (the arrows on the picture step through them). Then Next (no filter), write the caption (the hook, a reason to save or send it, 3-5 hashtags) and press Share (it waits for the user only if they switched approvals on). ${after}\n${(await read(tab, a)).text}` };
    }
    if (site === 'tiktok')
      return { ok: true, text: `Attached ${label} as a photo post of ${n}. Check the page shows them as photos in order, not a video. Write the description (TikTok may pre-fill a file name: clear it first) with a few niche hashtags; if the page offers music for the photos, pick a calm track from its list (a photo post with no sound does worse), then press Post (it waits for the user only if they switched approvals on). ${after}\n${(await read(tab, a)).text}` };
    if (site === 'threads')
      return { ok: true, text: `Attached ${label} (${n} pictures) to a new thread. Type its text: written fresh for Threads, one or two short lines (a take or a question about the slides), at most one topic tag, no link. Then press Post (it waits for the user only if they switched approvals on). ${after}\n${(await read(tab, a)).text}` };
    if (site === 'facebook')
      return { ok: true, text: `Attached ${label} (${n} pictures) in Meta Business Suite. Check the Page named at the top is this account's Page (a wrong one: ask the user to switch; never switch it yourself) and that only Facebook is ticked under "Post to" unless the user wants it on Instagram too. Write the text (the hook line, 2-3 hashtags), then press Publish (it waits for the user only if they switched approvals on). ${after}\n${(await read(tab, a)).text}` };
    return { ok: true, text: `Attached ${label} (${n} pictures). Type the post text into the composer's "Post text" box (the hook, in your own words; never the same text twice), then press Post (it waits for the user only if they switched approvals on). ${after}\n${(await read(tab, a)).text}` };
  });
}

/** Chrome only lets an extension hand over a local file when the user allowed it file access. */
const FILE_ACCESS = 'Chrome refused to attach the file. The user turns on "Allow access to file URLs" for the Krypt Marketo extension (chrome://extensions > Krypt Marketo > Details), then try again. Or they upload the reel themselves.';

/** Put a rendered reel into Instagram's "create" file picker, or YouTube Studio's upload dialog (the final Share / Publish still needs the user's approval). */
export function toolAttach(handle: string | undefined, file: string, label: string, site: Site = 'instagram', long?: { id: string; title: string }): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const yt = tab.site === 'youtube';
    let block = await inputBlock(tab, a, '');
    if (block) return { ok: false, text: block };
    if (yt && long) longUploads.set(a.id, { ...long, at: Date.now() });
    else if (yt) checkYt(a);
    else checkAllowed(a, 'posts', 'posting', site);
    let found: number[] = [];
    /** The file already went in through the page's own file chooser (no input to set afterwards). */
    let chosen = false;
    if (tab.site === 'x') {
      // X's own compose dialog (not a reply box on a post page).
      if (!/^\/compose\/post/.test(pathOf(await tab.s.url()))) await tab.s.load(X_COMPOSE);
      // The compose dialog's own input: the home timeline under it has an inline composer with another one.
      for (let i = 0; i < 8 && !found.length; i++) {
        found = await filePickers(tab, '[role=dialog] input[data-testid=fileInput]').catch(() => []);
        if (!found.length && i >= 3) found = await filePickers(tab, 'input[data-testid=fileInput]').catch(() => []);
        if (!found.length) await sleep(1000);
      }
      await read(tab, a);
      block = await inputBlock(tab, a, '');
      if (block) return { ok: false, text: block };
      if (!found.length) return { ok: false, text: `X's compose dialog did not open. Take a browser_snapshot (site "x"), open the composer (the "Post" button in the side bar), then call this again.` };
    } else if (tab.site === 'tiktok') {
      // TikTok Studio's uploader.
      if (!TT_STUDIO_PATH.test(pathOf(await tab.s.url()))) await tab.s.load(TT_UPLOAD);
      for (let i = 0; i < 10 && !found.length; i++) {
        found = await filePickers(tab, 'input[type=file][accept*="video"]').catch(() => []);
        if (!found.length) found = await filePickers(tab, 'input[type=file]').catch(() => []);
        if (!found.length) await sleep(1200);
      }
      await read(tab, a);
      block = await inputBlock(tab, a, '');
      if (block) return { ok: false, text: block };
      if (!found.length) return { ok: false, text: `TikTok Studio's uploader did not open. Take a browser_snapshot (site "tiktok"); browser_open with site "tiktok" and url "/tiktokstudio/upload" opens it; then call this again.` };
    } else if (tab.site === 'facebook' || tab.site === 'threads' || tab.site === 'pinterest') {
      const s = tab.site;
      const now = await tab.s.url();
      const ready = s === 'facebook' ? /^business\./i.test(hostOf(now)) && /^\/latest\/(reels_composer|composer)/i.test(pathOf(now)) : s === 'pinterest' ? PIN_CREATE_PATH.test(pathOf(now)) : /^\/intent\/post/i.test(pathOf(now)) || !!(await filePickers(tab, '[role=dialog] input[type=file]').catch(() => [])).length;
      if (!ready) await tab.s.load(s === 'facebook' ? FB_UPLOAD : s === 'pinterest' ? PIN_UPLOAD : TH_COMPOSE);
      const first = s === 'threads' ? '[role=dialog] input[type=file]' : 'input[type=file][accept*="video"]';
      // Business Suite's composer has no file input in the page: "Add Video" makes one and opens the system dialog.
      const opener = s === 'facebook' ? `window.__mk.byName(${JSON.stringify('^add video$')})` : '';
      for (let i = 0; i < 10 && !found.length; i++) {
        found = await filePickers(tab, first).catch(() => []);
        if (!found.length && i >= 3) found = await filePickers(tab, 'input[type=file]').catch(() => []);
        if (!found.length && opener && i >= 1 && (await inPage<number>(tab, opener).catch(() => 0))) break;
        if (!found.length) await sleep(1200);
      }
      await read(tab, a);
      block = await inputBlock(tab, a, '');
      if (block) return { ok: false, text: block };
      if (!found.length && opener) {
        const ref = await inPage<number>(tab, opener).catch(() => 0);
        const t = ref ? await inPage<Target>(tab, `window.__mk.target(${ref})`) : null;
        if (t && !t.gone) {
          if (t.covered) return { ok: false, text: `Meta Business Suite's "${t.name}" button is covered by "${t.covered}". Take a browser_snapshot (site "facebook"), close what is on top of it (its Close button, or Escape), then call this again.` };
          try {
            chosen = await tab.s.chooseFiles(() => mouseClick(tab, t.x, t.y), [file]);
          } catch (e) {
            if (tab.s.kind === 'chrome' && /not allowed/i.test((e as Error).message)) return { ok: false, text: FILE_ACCESS };
            throw e;
          }
          if (!chosen) return { ok: false, text: `Pressing "${t.name}" in Meta Business Suite did not open a file chooser. Take a browser_snapshot (site "facebook") to see what it opened instead; if it asks which Page, the user picks it. Then call this again.\n${(await read(tab, a)).text}` };
        }
      }
      const HOW: Record<typeof s, string> = {
        facebook: `Meta Business Suite's Reels composer did not show an upload ("Add Video" is not on the page). Take a browser_snapshot (site "facebook"): if it asks which Page, the user picks it. browser_open with site "facebook" and url "${FB_UPLOAD}" opens the composer; then call this again.`,
        threads: 'The Threads composer did not open. Take a browser_snapshot (site "threads"), open the composer (the "Create" / "What\'s new?" box), then call this again.',
        pinterest: `Pinterest's Pin creation tool did not open. browser_open with site "pinterest" and url "/pin-creation-tool/" opens it; then call this again.`,
      };
      if (!found.length && !chosen) return { ok: false, text: HOW[s] };
    } else if (yt) {
      // Studio's upload dialog, on the account's own channel: youtube.com/upload would open it on the sign-in's
      // default channel instead (and undo the channel switch).
      const picker = 'input[type=file][name=Filedata]';
      found = await filePickers(tab, picker);
      if (!found.length) {
        const ch = a.youtube?.channelId;
        await tab.s.load(ch ? `https://studio.youtube.com/channel/${ch}/videos/upload?d=ud` : YT_UPLOAD);
        for (let i = 0; i < 8 && !found.length; i++) {
          await sleep(1200);
          found = await filePickers(tab, picker).catch(() => []);
        }
        await read(tab, a);
        block = await inputBlock(tab, a, '');
        if (block) return { ok: false, text: block };
      }
      if (!found.length) found = await filePickers(tab, 'input[type=file]');
      if (!found.length) return { ok: false, text: `YouTube Studio's upload dialog did not open. Take a browser_snapshot (site "youtube"): Create > Upload videos opens it; then call this again.\n${(await read(tab, a)).text}` };
    } else {
      found = await filePickers(tab, 'input[type=file]');
      if (!found.length) return { ok: false, text: 'No file picker on this page yet. Open Instagram\'s Create dialog first (the "New post" / "Create" entry in the navigation, then "Post"), then call this again.' };
    }
    // The dialog's own picker is the last one added to the page.
    if (!chosen) {
      try {
        await cdp(tab, 'DOM.setFileInputFiles', { nodeId: found[found.length - 1], files: [file] });
      } catch (e) {
        if (tab.s.kind === 'chrome' && /not allowed/i.test((e as Error).message)) return { ok: false, text: FILE_ACCESS };
        throw e;
      }
    }
    await sleep(rand(2500, 3500));
    if (tab.site === 'tiktok')
      return {
        ok: true,
        text: `Attached ${label}. TikTok is uploading it. Write the caption in the description box (TikTok pre-fills the file name: clear it first) with a few niche hashtags, leave the cover and "Who can watch" as they are unless the user said otherwise, then press Post (it waits for the user only if they switched approvals on). Afterwards open the profile, copy the video's link and mark_posted with platform "tiktok".\n${(await read(tab, a)).text}`,
      };
    if (tab.site === 'facebook')
      return {
        ok: true,
        text: `Attached ${label}. Facebook is uploading it in Meta Business Suite. Check the Page named at the top is this account's Page (a wrong one: ask the user to switch; never switch it yourself). Write the description (the hook line, the link, 2-3 hashtags), go through Next, then press Share / Publish (it waits for the user only if they switched approvals on). Afterwards open the Page's Reels, copy the new reel's link and mark_posted with platform "facebook".\n${(await read(tab, a)).text}`,
      };
    if (tab.site === 'threads')
      return {
        ok: true,
        text: `Attached ${label}. Type the thread's text in the composer: written fresh for Threads, one or two short lines (a take or a question), at most one topic tag, no link and not the reel's caption as it is (the hub refuses links, copies and "#Shorts" here). Then press Post (it waits for the user only if they switched approvals on). Afterwards open the profile, copy the new thread's link and mark_posted with platform "threads".\n${(await read(tab, a)).text}`,
      };
    if (tab.site === 'pinterest')
      return {
        ok: true,
        text: `Attached ${label}. Pinterest is uploading it. Fill in the Title (the words people would search for, under 100 characters), the Description (2-3 plain sentences with those keywords), the Link (the brand's site or the product page) and a board that fits (make the board on the profile first if none does). Then press Publish (it waits for the user only if they switched approvals on). Afterwards open the Pin, copy its link and mark_posted with platform "pinterest".\n${(await read(tab, a)).text}`,
      };
    if (tab.site === 'x')
      return {
        ok: true,
        text: `Attached ${label}. X is processing the video (a non-Premium account takes up to 2 minutes 20 seconds). Type the post text into the composer's "Post text" box, then press Post (it waits for the user only if they switched approvals on). Afterwards open the profile, copy the new post's link and mark_posted with platform "x".\n${(await read(tab, a)).text}`,
      };
    if (yt)
      return {
        ok: true,
        text: `Attached ${label}. YouTube is uploading it. Fill in the details: Title (under 100 characters; YouTube pre-fills the file name, so clear it), Description, and the audience ("No, it's not made for kids" is required). A vertical video of 3 minutes or less is posted as a Short by itself. Then Next through Video elements and Checks, pick the Visibility, and press Publish (or Save; it waits for the user only if they switched approvals on). Afterwards read the Short's link from the dialog and mark_posted with platform "youtube".\n${(await read(tab, a)).text}`,
      };
    const crop = await igOriginalCrop(tab);
    const cropNote =
      crop === 'set' || crop === 'already'
        ? 'The hub set the crop to Original (the full vertical 9:16 frame): leave the crop as it is.'
        : crop === 'unchecked'
          ? 'The hub picked Original in the crop menu but could not measure the picture: before Next, check the preview shows the full tall frame (not a square or 4:5 cut); if not, crop button at the bottom left of the picture ("Select crop") > Original.'
          : 'IMPORTANT: the crop must be Original (the full vertical 9:16 frame), never 1:1 or 4:5, or the reel goes out cut to a square. Before Next: press the crop button at the bottom left of the picture ("Select crop"), pick "Original", and check the preview shows the whole tall frame.';
    return { ok: true, text: `Attached ${label}. Instagram is processing it. ${cropNote} Then continue through its steps (cover, caption) and press the final Share (it waits for the user only if they switched approvals on).\n${(await read(tab, a)).text}` };
  });
}

/**
 * The shape of the media preview in Instagram's Create dialog (width / height of the part that shows), 0 when it
 * cannot be found. A reel at Original reads about 0.56; Instagram's 1:1 and 4:5 crops read 1 and 0.8.
 */
const IG_PREVIEW_RATIO = `(() => {
  const d = [...document.querySelectorAll('[role=dialog]')].filter((x) => x.getBoundingClientRect().width > 200).pop();
  if (!d) return 0;
  let best = null;
  for (const el of d.querySelectorAll('video, img, canvas')) {
    let r = el.getBoundingClientRect();
    let box = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    for (let p = el.parentElement; p && p !== d.parentElement; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.overflow === 'visible' && s.overflowX === 'visible' && s.overflowY === 'visible') continue;
      const q = p.getBoundingClientRect();
      box = { l: Math.max(box.l, q.left), t: Math.max(box.t, q.top), r: Math.min(box.r, q.right), b: Math.min(box.b, q.bottom) };
    }
    const w = box.r - box.l, h = box.b - box.t;
    if (w < 150 || h < 150) continue;
    if (!best || w * h > best.w * best.h) best = { w, h };
  }
  return best ? best.w / best.h : 0;
})()`;

/**
 * Instagram's web Create dialog cuts a video to a square or 4:5 unless "Original" is picked in its crop menu, and a
 * run that just pressed Next posted a reel cut to 4:5 (2026-11-19). So the hub picks Original itself after attaching.
 * 'set' / 'already' = the preview is the tall frame; 'unchecked' = Original was picked but the preview could not be
 * measured; 'failed' = the crop menu or its Original option was not found.
 */
async function igOriginalCrop(tab: Tab, photo = false): Promise<'set' | 'already' | 'unchecked' | 'failed'> {
  const find = async (re: string): Promise<Target | null> => {
    const ref = await inPage<number>(tab, `window.__mk.byName(${JSON.stringify(re)})`).catch(() => 0);
    const t = ref ? await inPage<Target>(tab, `window.__mk.target(${ref})`).catch(() => null) : null;
    return t && !t.gone ? t : null;
  };
  // A reel at Original reads about 0.56; a 4:5 photo (a slideshow's slides) reads 0.8, where Instagram's default square reads 1.
  const tall = (r: number): boolean => r > 0 && r < (photo ? 0.9 : 0.7);
  // The crop step comes up once Instagram has read the file.
  let toggle: Target | null = null;
  for (const until = Date.now() + 15_000; Date.now() < until; await sleep(600)) {
    toggle = await find('select crop');
    if (toggle) break;
  }
  if (!toggle) return 'failed';
  if (tall(await inPage<number>(tab, IG_PREVIEW_RATIO).catch(() => 0))) return 'already';
  await mouseClick(tab, toggle.x, toggle.y);
  await sleep(rand(700, 1100));
  const original = await find('(^|\\s)original$');
  if (!original) return 'failed';
  await mouseClick(tab, original.x, original.y);
  await sleep(rand(1000, 1400));
  const ratio = await inPage<number>(tab, IG_PREVIEW_RATIO).catch(() => 0);
  return tall(ratio) ? 'set' : ratio === 0 ? 'unchecked' : 'failed';
}
