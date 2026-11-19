// Instagram, X (and YouTube Studio, for uploading Shorts), for the AIs. An account runs in one of two places:
//   - the hub's own browser: a private, persistent session (its own cookies)
//     and a window the user can watch and use; or
//   - the user's own Chrome, through the Krypt Marketo extension
//     (chromeBridge.ts): the same device and fingerprint as their normal use.
// Either way any AI connected over MCP drives it through the same browser_*
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
import { BrowserWindow, app, session, type Session as ElectronSession, type WebContents } from 'electron';
import type { ApprovalKind, BrowserStatus, IgAccount, NetProfile, NetStatus, Network, Site } from '../shared/types';
import { NETWORKS, NETWORK_LABEL, isNetwork, linkOn, netOf, normalizeHandle, planFor, postGap, quotaKeys, quotaLabel, sameHandle, siteOn, ytLimit, ytUploadsToday, type Quota } from '../shared/warmup';
import { rewriteNote, textProblems, type TextKind } from '../shared/humanText';
import { followsKrypt, isKryptPage, isSubscribeButton, isSubscribedButton, kryptFollowDue, kryptKey, kryptRepostDue, kryptTarget, kryptVisitOf, onKryptPost, showsFollowing, type KryptAccount } from '../shared/kryptFollow';
import * as approvals from './approvals';
import * as chrome from './chromeBridge';
import type { ChromeConn, ChromeEvent } from './chromeBridge';
import { PAGE_SCRIPT } from './pageScript';
import * as store from './store';

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

const SITES: Record<Site, SiteDef> = {
  instagram: { label: 'Instagram', home: HOME, host: IG_HOST, signIn: SIGN_IN_HOST, gated: (u) => GATED_PATH.test(pathOf(u)), domain: 'instagram.com' },
  youtube: { label: 'YouTube', home: YT_HOME, host: YT_HOST, signIn: YT_SIGN_IN_HOST, gated: (u) => YT_GATED_HOST.test(hostOf(u)), domain: 'youtube.com' },
  x: { label: 'X', home: X_HOME, host: X_HOST, signIn: X_SIGN_IN_HOST, gated: (u) => X_GATED_PATH.test(pathOf(u)), domain: 'x.com' },
  tiktok: { label: 'TikTok', home: TT_HOME, host: TT_HOST, signIn: TT_SIGN_IN_HOST, gated: (u) => TT_GATED_PATH.test(pathOf(u)), domain: 'tiktok.com' },
  facebook: { label: 'Facebook', home: FB_HOME, host: FB_HOST, signIn: FB_SIGN_IN_HOST, gated: (u) => FB_GATED_PATH.test(pathOf(u)), domain: 'facebook.com' },
  threads: { label: 'Threads', home: TH_HOME, host: TH_HOST, signIn: TH_SIGN_IN_HOST, gated: (u) => TH_GATED_PATH.test(pathOf(u)), domain: 'threads.com' },
  pinterest: { label: 'Pinterest', home: PIN_HOME, host: PIN_HOST, signIn: PIN_SIGN_IN_HOST, gated: (u) => PIN_GATED_PATH.test(pathOf(u)), domain: 'pinterest.com' },
};

const siteOfUrl = (url: string): Site | null => {
  const h = hostOf(url);
  return IG_HOST.test(h) ? 'instagram' : YT_HOST.test(h) ? 'youtube' : X_HOST.test(h) ? 'x' : TT_HOST.test(h) ? 'tiktok' : FB_HOST.test(h) ? 'facebook' : TH_HOST.test(h) ? 'threads' : PIN_HOST.test(h) ? 'pinterest' : null;
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
  site: Site;
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
  /** A post was just sent here: the tab stays open until then so the upload can finish. */
  settleUntil?: number;
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
  lang?: string;
}

interface Deps {
  onStatus(s: BrowserStatus[]): void;
  log(level: 'info' | 'warn' | 'error', message: string): void;
}

const tabs = new Map<string, Tab>();
const configured = new Set<string>();
let deps: Deps = { onStatus: () => {}, log: () => {} };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
/** How long a pressed upload button gets to open its file chooser (the extension waits the same). */
const CHOOSER_WAIT_MS = 8000;
const rand =(a: number, b: number): number => a + Math.random() * (b - a);

export function init(d: Deps): void {
  deps = d;
}

// ── Where an account's Instagram runs ──────────────────────────────────────
/** A page the tools can read and send real input to: a built-in window, or a tab in the user's own Chrome. */
interface Surface {
  kind: 'hub' | 'chrome';
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

const wants = (a: IgAccount): 'hub' | 'chrome' => (a.browser === 'chrome' ? 'chrome' : 'hub');
const keyOf = (accountId: string, site: Site): string => `${accountId}|${site}`;
const tabOf = (accountId: string, site: Site): Tab | undefined => tabs.get(keyOf(accountId, site));
const tabsOf = (accountId: string): Array<[string, Tab]> => [...tabs].filter(([, t]) => t.accountId === accountId);

function newTab(a: IgAccount, site: Site, surface: (tab: Tab) => Surface, conn?: ChromeConn): Tab {
  const tab = { accountId: a.id, site, conn, lastCounted: 0, blocked: null, vw: 1280, vh: 800, queue: Promise.resolve() } as Tab;
  tab.s = surface(tab);
  tabs.set(keyOf(a.id, site), tab);
  return tab;
}

// ── The hub's own browser: one private session and window per account ──────
/** A normal Chrome user agent: the default one names Electron and this app, which sites treat as an unsupported browser. */
function userAgent(): string {
  return session.defaultSession.getUserAgent().replace(/ (?!Chrome\/|Safari\/|AppleWebKit\/)[A-Za-z0-9._-]+\/[0-9][^ ]*(?= )/g, '');
}

function sessionFor(accountId: string): ElectronSession {
  const ses = session.fromPartition(`persist:ig-${accountId}`);
  if (!configured.has(accountId)) {
    configured.add(accountId);
    ses.setUserAgent(userAgent());
    // Instagram needs none of these to work; a page (or an AI) can't turn them on.
    ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
  }
  return ses;
}

async function cookieState(accountId: string, site: Site = 'instagram'): Promise<{ loggedIn: boolean; userId?: string }> {
  try {
    if (site === 'youtube') {
      const yt = await sessionFor(accountId).cookies.get({ url: 'https://www.youtube.com/' });
      return { loggedIn: yt.some((c) => YT_COOKIES.includes(c.name) && !!c.value) };
    }
    if (site === 'x') {
      const x = await sessionFor(accountId).cookies.get({ url: 'https://x.com/' });
      const loggedIn = x.some((c) => c.name === 'auth_token' && !!c.value);
      const twid = /u(?:%3D|=)(\d+)/.exec(x.find((c) => c.name === 'twid')?.value ?? '');
      return { loggedIn, userId: loggedIn && twid ? twid[1] : undefined };
    }
    if (site === 'facebook') {
      // Signed in = an xs session cookie; c_user is the numeric user id.
      const fb = await sessionFor(accountId).cookies.get({ url: FB_HOME });
      const loggedIn = fb.some((c) => c.name === 'xs' && !!c.value);
      const uid = fb.find((c) => c.name === 'c_user')?.value;
      return { loggedIn, userId: loggedIn && uid && /^\d+$/.test(uid) ? uid : undefined };
    }
    if (site === 'threads') {
      // Threads keeps Instagram-style cookies (sessionid, ds_user_id), on threads.com or the older threads.net.
      const th = [...(await sessionFor(accountId).cookies.get({ url: TH_HOME })), ...(await sessionFor(accountId).cookies.get({ url: 'https://www.threads.net/' }))];
      const loggedIn = th.some((c) => c.name === 'sessionid' && !!c.value);
      const uid = th.find((c) => c.name === 'ds_user_id')?.value;
      return { loggedIn, userId: loggedIn && uid && /^\d+$/.test(uid) ? uid : undefined };
    }
    if (site === 'pinterest') {
      // _pinterest_sess is set for everyone; _auth=1 only once signed in.
      const pin = await sessionFor(accountId).cookies.get({ url: PIN_HOME });
      return { loggedIn: pin.some((c) => c.name === '_auth' && c.value === '1') };
    }
    if (site === 'tiktok') {
      const tt = await sessionFor(accountId).cookies.get({ url: 'https://www.tiktok.com/' });
      const loggedIn = tt.some((c) => c.name === 'sessionid' && !!c.value);
      const multi = /^(\d+)(?:%3A|:)/.exec(tt.find((c) => c.name === 'multi_sids')?.value ?? '');
      return { loggedIn, userId: loggedIn && multi ? multi[1] : undefined };
    }
    const cookies = await sessionFor(accountId).cookies.get({ url: HOME });
    const sid = cookies.find((c) => c.name === 'sessionid')?.value;
    return { loggedIn: !!sid, userId: cookies.find((c) => c.name === 'ds_user_id')?.value };
  } catch {
    return { loggedIn: false };
  }
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

function titleFor(a: IgAccount, site: Site): string {
  return `${SITES[site].label} · ${a.handle} · Krypt Marketo`;
}

function hubSurface(a: IgAccount, tab: Tab): Surface {
  const site = SITES[tab.site];
  const win = new BrowserWindow({
    width: 1320,
    height: 920,
    minWidth: 480,
    minHeight: 600,
    title: titleFor(a, tab.site),
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: { session: sessionFor(a.id), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  const wc = win.webContents;
  let attached = false;

  const guard = (e: { preventDefault(): void }, url: string): void => {
    if (/^https:/i.test(url) && site.signIn.test(hostOf(url))) return;
    e.preventDefault();
    tab.blocked = url;
  };
  wc.on('will-navigate', (e, url) => guard(e, url));
  wc.on('will-redirect', (e, url) => guard(e, url));
  // "Leave site?" (a draft the page wants to keep) would block every later command: leaving is what was asked for.
  wc.on('will-prevent-unload', (e) => e.preventDefault());
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https:/i.test(url) && site.signIn.test(hostOf(url))) void wc.loadURL(url).catch(() => {});
    else tab.blocked = url;
    return { action: 'deny' };
  });
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    const acct = store.get().igAccounts.find((x) => x.id === tab.accountId);
    if (acct) win.setTitle(titleFor(acct, tab.site));
  });
  const changed = (): void => void broadcast();
  wc.on('did-navigate', changed);
  wc.on('did-navigate-in-page', changed);
  wc.debugger.on('detach', () => {
    attached = false;
  });
  win.on('closed', () => {
    if (tabOf(a.id, tab.site) === tab) tabs.delete(keyOf(a.id, tab.site));
    void broadcast();
  });

  return {
    kind: 'hub',
    place: `${site.label} window`,
    alive: () => !win.isDestroyed(),
    url: async () => wc.getURL(),
    async load(url) {
      try {
        await Promise.race([wc.loadURL(url ?? site.home), sleep(20_000)]);
      } catch {
        // A redirect or a blocked hop rejects loadURL; whatever loaded is what we read.
      }
      await sleep(rand(900, 1500));
    },
    async evaluate<T>(expr: string): Promise<T> {
      return (await wc.executeJavaScriptInIsolatedWorld(WORLD, [{ code: `${PAGE_SCRIPT}\n${expr}` }], false)) as T;
    },
    async cdp<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
      const dbg = wc.debugger;
      if (!attached || !dbg.isAttached()) {
        try {
          if (!dbg.isAttached()) dbg.attach('1.3');
          attached = true;
        } catch (e) {
          throw new Error(`Could not control the ${site.label} window (${(e as Error).message}). Close its developer tools if they are open.`);
        }
      }
      return (await dbg.sendCommand(method, params)) as T;
    },
    async chooseFiles(press, files) {
      const dbg = wc.debugger;
      // Page events (the chooser opening) only arrive once the Page domain is on.
      await this.cdp('Page.enable');
      await this.cdp('Page.setInterceptFileChooserDialog', { enabled: true });
      let done: (node: number | null | undefined) => void = () => {};
      // undefined = no chooser opened; null = one opened without an input behind it.
      const opened = new Promise<number | null | undefined>((resolve) => (done = resolve));
      const onMessage = (_e: unknown, method: string, params: { backendNodeId?: number }): void => {
        if (method === 'Page.fileChooserOpened') done(params?.backendNodeId ?? null);
      };
      dbg.on('message', onMessage);
      const timer = setTimeout(() => done(undefined), CHOOSER_WAIT_MS);
      try {
        await press();
        const node = await opened;
        if (node == null) return false;
        await this.cdp('DOM.setFileInputFiles', { files, backendNodeId: node });
        return true;
      } finally {
        clearTimeout(timer);
        dbg.off('message', onMessage);
        if (dbg.isAttached()) await dbg.sendCommand('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
      }
    },
    cookies: () => cookieState(a.id, tab.site),
    async back() {
      const nav = wc.navigationHistory;
      if (!nav.canGoBack()) return false;
      nav.goBack();
      return true;
    },
    async reveal(focus) {
      if (win.isMinimized()) win.restore();
      if (focus) {
        win.show();
        win.focus();
      } else if (!win.isVisible()) win.showInactive();
    },
    close(force) {
      if (win.isDestroyed()) return;
      if (force) win.destroy();
      else win.close();
    },
  };
}

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

function chromeSurface(conn: ChromeConn, site: Site): Surface {
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
        await conn.send('open', { url, site }, 40_000);
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
    cookies: async () => (site === 'youtube' ? { loggedIn: conn.ytLoggedIn } : isNetwork(site) ? { loggedIn: conn.net[site].loggedIn, userId: conn.net[site].userId } : { loggedIn: conn.loggedIn, userId: conn.userId }),
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

const OUTDATED_EXT = 'The Krypt Marketo extension in that Chrome profile is an older version without this site (YouTube needs 0.2, X 0.3, TikTok 0.4, Facebook, Threads and Pinterest 0.5). The user reloads it: chrome://extensions > Krypt Marketo > the reload arrow (or Load unpacked again from the folder the Accounts page shows). Then try again.';

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

async function ensureTab(a: IgAccount, site: Site, url?: string): Promise<Tab> {
  let tab = tabOf(a.id, site);
  const conn = wants(a) === 'chrome' ? await chromeFor(a) : undefined;
  if (conn && !conn.sites.includes(site)) throw new Error(OUTDATED_EXT);
  if (tab && (!tab.s.alive() || tab.s.kind !== wants(a) || tab.conn !== conn)) {
    // The account moved between the built-in browser and Chrome (or to another Chrome profile).
    if (tab.s.kind === 'hub') tab.s.close();
    tabs.delete(keyOf(a.id, site));
    tab = undefined;
  }
  const fresh = !tab;
  const t = tab ?? newTab(a, site, (x) => (conn ? chromeSurface(conn, site) : hubSurface(a, x)), conn);
  if (fresh || url) await t.s.load(url);
  await t.s.reveal(false);
  void broadcast();
  return t;
}

async function statusOf(a: IgAccount): Promise<BrowserStatus> {
  const yt = !!a.youtube?.enabled;
  if (wants(a) === 'chrome') {
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
  const tab = tabOf(a.id, 'instagram');
  const open = !!tab && tab.s.kind === 'hub' && tab.s.alive();
  const c = await cookieState(a.id);
  let youtube: BrowserStatus['youtube'];
  if (yt) {
    const ytTab = tabOf(a.id, 'youtube');
    const ytOpen = !!ytTab && ytTab.s.kind === 'hub' && ytTab.s.alive();
    youtube = { open: ytOpen, loggedIn: (await cookieState(a.id, 'youtube')).loggedIn, url: ytOpen ? await ytTab!.s.url() : undefined };
  }
  const nets: Partial<Record<Network, NetStatus>> = {};
  for (const n of NETWORKS) {
    if (!netOf(a, n)?.enabled) continue;
    const t = tabOf(a.id, n);
    const o = !!t && t.s.kind === 'hub' && t.s.alive();
    const nc = await cookieState(a.id, n);
    nets[n] = { open: o, loggedIn: nc.loggedIn, signedInAs: nc.loggedIn ? t?.signedInAs : undefined, url: o ? await t!.s.url() : undefined };
  }
  return { accountId: a.id, handle: a.handle, via: 'hub', open, loggedIn: c.loggedIn, signedInAs: c.loggedIn ? tab?.signedInAs : undefined, url: open ? await tab!.s.url() : undefined, ...(youtube ? { youtube } : {}), ...nets };
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
  const s: Site = site ?? (url ? siteOfUrl(url) : null) ?? 'instagram';
  if (url && !(SITES[s].host.test(hostOf(url)) && /^https:/i.test(url))) throw new Error(`Only ${SITES[s].domain} pages open here.`);
  if (!siteOn(a, s)) throw new Error(`${s === 'youtube' ? 'YouTube Shorts' : SITES[s].label} is not turned on for ${a.handle}. Edit the account to turn it on.`);
  const tab = await ensureTab(a, s, url);
  await tab.s.reveal(true);
}

export function closeTab(accountId: string, site?: Site): void {
  for (const [, tab] of tabsOf(accountId)) if ((!site || tab.site === site) && tab.s.alive()) tab.s.close();
}

/** Sign out here: close the windows and wipe the account's cookies and storage (Instagram and YouTube share one browser profile per account). Chrome accounts: the hub only lets go; Chrome keeps its own sign-in. */
export async function clearSession(accountId: string): Promise<void> {
  for (const [key, tab] of tabsOf(accountId)) {
    if (tab.s.kind === 'chrome') tabs.delete(key);
    else if (tab.s.alive()) tab.s.close();
  }
  await sessionFor(accountId).clearStorageData();
  void broadcast();
}

/** A deleted profile's accounts: wipe the sign-ins the built-in browser kept for them. Chrome's own profiles are never touched. */
export async function forgetSessions(accountIds: string[]): Promise<void> {
  for (const id of accountIds) {
    if (!/^[\w-]+$/.test(id)) continue;
    await session
      .fromPartition(`persist:ig-${id}`)
      .clearStorageData()
      .catch(() => {});
    configured.delete(id);
  }
}

export function closeAll(): void {
  for (const t of tabs.values()) if (t.s.kind === 'hub') t.s.close(true);
  tabs.clear();
  // Chrome tabs stay open; the hub just stops controlling them.
  chrome.releaseAll();
}

// ── Page access ────────────────────────────────────────────────────────────
const inPage = <T>(tab: Tab, expr: string): Promise<T> => tab.s.evaluate<T>(expr);
const cdp = <T = unknown>(tab: Tab, method: string, params: Record<string, unknown> = {}): Promise<T> => tab.s.cdp<T>(method, params);

async function mouseClick(tab: Tab, x: number, y: number): Promise<void> {
  const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
  await cdp(tab, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x + rand(-30, 30)), y: Math.round(y + rand(-20, 20)) });
  await sleep(rand(40, 110));
  await cdp(tab, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: base.x, y: base.y });
  await sleep(rand(30, 90));
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

async function typeText(tab: Tab, text: string, rich = false): Promise<void> {
  // Whole characters (emoji are two code units), a few at a time, at an uneven pace.
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let l = 0; l < lines.length; l++) {
    if (l > 0) {
      if (rich) await softBreak(tab);
      else await cdp(tab, 'Input.insertText', { text: '\n' });
      await sleep(rand(60, 140));
    }
    const chars = Array.from(lines[l]);
    for (let i = 0; i < chars.length; ) {
      const n = Math.min(chars.length - i, Math.random() < 0.2 ? 2 : 1);
      await cdp(tab, 'Input.insertText', { text: chars.slice(i, i + n).join('') });
      i += n;
      await sleep(rand(25, 95));
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
}

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
    return { kind: 'never', why: `"${t.name}" is a button on youtube.com. Marketo only uploads Shorts on YouTube (in YouTube Studio); liking, subscribing and commenting there are not supported (only the one-time Subscribe on Krypt's own channel page). Links and search work.` };
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
  if (isButton && /^follow( back)?$/.test(n)) return { kind: 'follow' };
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
/** Seconds the hub stays on the page after Post / Share / Publish, so the upload finishes before anything else opens. */
const POST_SETTLE_S: Record<Site, number> = { instagram: 25, youtube: 0, x: 8, tiktok: 25, facebook: 40, threads: 30, pinterest: 20 };
/** Sites where a post was lost by leaving mid-upload: after the fixed wait, the click keeps waiting while the page still shows the upload, up to UPLOAD_HOLD_MS in all. */
const UPLOAD_WATCH = new Set<Site>(['facebook', 'threads']);
const UPLOAD_HOLD_MS = 5 * 60_000;
/** Words a page shows while a post is still going up (Facebook's "Reel processing" is the upload itself). */
const UPLOADING = /\b(reel processing|processing (your )?(reel|video)|uploading|posting\.\.\.|sharing\.\.\.)|\b(upload(ing)?|processing)\b[^\n]{0,20}\b\d{1,2}%/i;
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
  if (SITES[n].gated(url)) return `${L} is asking for a login or a security check. The user has to do that themselves in the ${place}; wait for them.`;
  if (n === 'tiktok' && (await inPage<boolean>(tab, 'window.__mk.captcha()').catch(() => false)))
    return `TikTok is showing a security check (a puzzle or "verify it's you"). The user solves it themselves in the ${place}; wait for them, then take a fresh browser_snapshot. Slow down afterwards: it usually means the session moved too fast.`;
  if (tab.signedInAs && want && !sameHandle(tab.signedInAs, want)) return `${L} here is signed in as @${tab.signedInAs}, not ${want}. Ask the user to switch accounts on ${L} (or fix the ${L} handle on the Accounts page).`;
  if (p?.userId && c.userId && p.userId !== c.userId && !tab.signedInAs) return `A different ${L} account than ${want ?? 'the saved one'} is signed in here. Ask the user to check the ${place}.`;
  if (lang && !/^en\b/i.test(lang)) return `${L} is showing in "${lang}". The safety limits read English button labels, so buttons stay locked until the user switches ${L}'s language to English (${LANG_SETTING[n]}).`;
  return null;
}

/** Why the AI may not act on this page at all (null = fine). */
async function inputBlock(tab: Tab, a: IgAccount, lang: string): Promise<string | null> {
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

// ── Reading the page ───────────────────────────────────────────────────────
async function readYt(tab: Tab, a: IgAccount, snap: Snap): Promise<string[]> {
  const c = await tab.s.cookies();
  const ch = snap.channel;
  if (c.loggedIn && ch?.id) {
    tab.channelId = ch.id;
    if (ch.name) tab.channelName = ch.name;
    // The first channel seen in Studio is the account's from now on; another one later locks the buttons.
    if (a.youtube && !a.youtube.channelId) store.saveAccount({ id: a.id, youtube: { ...a.youtube, channelId: ch.id, channelName: ch.name || undefined } });
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
  return true;
}

/** A visit to that Krypt account has started (shared/kryptFollow.ts). True when this call recorded it. */
function kryptVisited(accountId: string, site: Site, k: KryptAccount): boolean {
  const a = store.findAccount(accountId);
  if (!kryptVisitOf(a, site, k)) return false;
  store.saveAccount({ id: a.id, kryptVisited: { ...(a.kryptVisited ?? {}), [kryptKey(site, k)]: new Date().toISOString() } });
  deps.log('info', `[browser] ${a.handle} looks in on Krypt's ${k.handle} on ${SITES[site].label}`);
  return true;
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

async function withTab(handle: string | undefined, site: Site, fn: (tab: Tab, a: IgAccount) => Promise<Outcome>, open?: string | true): Promise<Outcome> {
  let a: IgAccount;
  try {
    a = account(handle);
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
  if (!siteOn(a, site)) return { ok: false, text: NOT_ON(a, site) };
  let tab = tabOf(a.id, site);
  if (open && tab?.s.alive() && (tab.settleUntil ?? 0) > Date.now())
    return { ok: false, text: `A post is still going up in this ${SITES[site].label} tab: opening another page here now can lose it. browser_wait with site "${site}" and look again until the upload is gone.` };
  if (open) {
    try {
      tab = await ensureTab(a, site, open === true ? undefined : open);
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    }
  }
  else if (!tab || !tab.s.alive() || tab.s.kind !== wants(a)) return { ok: false, text: `${SITES[site].label} for ${a.handle} isn't open${wants(a) === 'chrome' ? ' in Chrome' : ''}. browser_open${site === 'instagram' ? '' : ` with site "${site}"`} first.` };
  const t = tab;
  return serial(t, async () => {
    try {
      // Time on Instagram and X counts toward each one's warm-up budget; uploading to YouTube does not.
      if (site !== 'youtube') store.touchLive(a.handle, site);
      else store.wentTo(a.handle, site);
      return await fn(t, store.findAccount(a.id));
    } catch (e) {
      return { ok: false, text: (e as Error).message };
    } finally {
      // The time this call itself took (a watch, a paced click) is time on the app.
      if (site !== 'youtube') store.touchLive(a.handle, site, true);
    }
  });
}

// ── Tools ──────────────────────────────────────────────────────────────────
export function toolOpen(handle?: string, url?: string, site?: Site): Promise<Outcome> {
  let target = url?.trim();
  let s: Site = site ?? (target && /^https?:/i.test(target) ? siteOfUrl(target) : null) ?? 'instagram';
  if (target) {
    if (target.startsWith('/')) target = `${new URL(SITES[s].home).origin}${target}`;
    const on = siteOfUrl(target);
    if (!/^https:\/\//i.test(target) || !on) return Promise.resolve({ ok: false, text: 'Only pages of the account\'s platforms open here (instagram.com, youtube.com, x.com, tiktok.com, facebook.com, threads.com, pinterest.com; each once turned on for the account).' });
    if (site && on !== site) return Promise.resolve({ ok: false, text: `That URL is on ${SITES[on].domain}, not ${SITES[site].domain}.` });
    s = on;
  }
  return withTab(handle, s, async (tab, a) => ({ ok: true, text: (await read(tab, a)).text }), target ?? true);
}

export function toolSnapshot(handle?: string, full?: boolean, site: Site = 'instagram'): Promise<Outcome> {
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

async function approve(tab: Tab, a: IgAccount, v: Verdict, url: string, client: string): Promise<{ id: string; auto?: boolean } | Outcome> {
  if (v.kind === 'post') checkGap(a, tab.site);
  if (tab.site === 'youtube') {
    if (v.kind === 'post') checkYt(a);
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

export function toolClick(handle: string | undefined, ref: number, client: string, site: Site = 'instagram'): Promise<Outcome> {
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

    const judge = (x: Target): Verdict =>
      tab.site === 'youtube' ? classifyYt(x, a) : tab.site === 'x' ? classifyX(x) : tab.site === 'tiktok' ? classifyTt(x) : tab.site === 'facebook' ? classifyFb(x) : tab.site === 'threads' ? classifyTh(x) : tab.site === 'pinterest' ? classifyPin(x) : classify(x);
    const v = judge(t);
    let note = '';
    let approvalId: string | null = null;
    let auto = false;
    if (v.kind === 'never') return { ok: false, text: v.why ?? `"${t.name}" is for the user to press, not an AI.` };
    // Today's repost of one of Krypt's posts (shared/kryptFollow.ts): outside the repost limit, once a day per platform.
    const kryptRepost = v.kind === 'repost' && onKryptPost(tab.site, t) ? kryptRepostDue(a, tab.site, store.get().settings.firstRunAt) : null;
    if (isCounted(v.kind)) {
      if (kryptRepost) checkActive(a, 'reposts', tab.site);
      else checkAllowed(a, QUOTA_OF[v.kind], quotaLabel(QUOTA_OF[v.kind], tab.site), tab.site);
      // An uneven pause between engagement actions, enforced here.
      const gap = rand(3500, 9000) - (Date.now() - tab.lastCounted);
      if (gap > 0) await sleep(gap);
    } else if (v.kind !== 'free') {
      const r = await approve(tab, a, v, t.postUrl || t.url, client);
      if ('ok' in r) return r;
      approvalId = r.id;
      auto = !!r.auto;
      // The page may have moved while the user decided.
      t = await inPage<Target>(tab, `window.__mk.target(${ref})`);
      if (t.gone || t.covered) return { ok: false, text: 'Approved, but the page changed while waiting. Take a browser_snapshot and click it again within 5 minutes (no new approval needed if nothing else changed).' };
      const again = judge(t);
      if (again.kind !== v.kind || (again.text ?? '') !== (v.text ?? '')) return { ok: false, text: 'The text or button changed after the user approved it, so nothing was sent. Ask for approval again.' };
    }

    const before = t.name;
    await mouseClick(tab, t.x, t.y);
    await sleep(rand(650, 1100));

    if (isCounted(v.kind)) {
      tab.lastCounted = Date.now();
      const nameNow = (): Promise<string | null> => inPage<string | null>(tab, `window.__mk.nameNow(${ref})`).catch(() => null);
      let after = await nameNow();
      // Threads: the "Follow" beside a post in search only opens that account's card; the card's own Follow button
      // does the following. A button that still reads "Follow" followed nobody, so it is not counted.
      if (tab.site === 'threads' && v.kind === 'follow' && after && FOLLOW_LABEL.test(after.trim())) {
        await sleep(1400);
        after = await nameNow();
        if (after && FOLLOW_LABEL.test(after.trim())) {
          deps.log('info', `[browser] ${a.handle} Threads follow click left the button at "${after}": not counted (${client})`);
          return { ok: true, text: `Not counted: [${ref}] "${before}" still reads "${after}", so nobody was followed by that click. On Threads this button opens the account's card: press the Follow button inside the card. (If the listing below already shows "Following" for them, it did go through: say so in the report.)\n${(await read(tab, store.findAccount(a.id))).text}` };
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
      if (v.kind === 'comment' && tab.site !== 'youtube') store.recordAction(a.handle, t.postUrl || t.url, 'comment', { creator: t.creator || undefined, note: v.text }, tab.site);
      if (v.kind === 'comment') kryptCommented(a.id, tab.site, t);
      if (v.kind === 'message' && tab.site !== 'youtube') store.recordAction(a.handle, t.postUrl || t.url, 'message', { creator: t.creator || undefined, note: v.text }, tab.site);
      noteSent(textKindOf(v, tab.site), v.text);
      if (v.kind === 'post') postClicks.set(`${a.id}|${tab.site}`, Date.now());
      if (v.kind === 'post' && tab.site === 'youtube') store.recordYtUpload(a.id);
      else if (v.kind === 'post') store.recordAction(a.handle, t.url, 'post', {}, tab.site);
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
        while (UPLOAD_WATCH.has(tab.site) && Date.now() - t0 < UPLOAD_HOLD_MS) {
          const now = await read(tab, store.findAccount(a.id)).catch(() => null);
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
  const f = await inPage<Focus>(tab, 'window.__mk.focus()');
  let v = classifyEnter(f);
  // YouTube Studio: Enter only adds a line or a tag, except in a reply box.
  if (tab.site === 'youtube') v = v.kind === 'comment' ? { kind: 'other', action: 'Post this reply on YouTube', text: v.text } : { kind: 'free' };
  if (v.kind === 'free') {
    await pressKey(tab, 'Enter');
    return null;
  }
  const r = await approve(tab, a, v, f.postUrl || f.url || '', client);
  if ('ok' in r) return r;
  const now = await inPage<Focus>(tab, 'window.__mk.focus()');
  if (!now.editable || now.value !== f.value) return { ok: false, text: 'The text changed after the user approved it, so nothing was sent. Ask for approval again.' };
  await pressKey(tab, 'Enter');
  approvals.consume(r.id);
  if (v.kind === 'comment' && tab.site !== 'youtube') store.recordAction(a.handle, f.postUrl || f.url || '', 'comment', { creator: f.creator || undefined, note: v.text }, tab.site);
  if (v.kind === 'comment') kryptCommented(a.id, tab.site, f);
  if (v.kind === 'message' && tab.site !== 'youtube') store.recordAction(a.handle, f.postUrl || f.url || '', 'message', { creator: f.creator || undefined, note: v.text }, tab.site);
  noteSent(textKindOf(v, tab.site), v.text);
  deps.log('info', `[browser] ${a.handle} ${v.kind} ${r.auto ? 'sent (approvals off)' : 'approved and sent'} (${client})`);
  return null;
}

export function toolType(handle: string | undefined, ref: number, text: string, opts: { clear?: boolean; submit?: boolean }, client: string, site: Site = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const t = await inPage<Target>(tab, `window.__mk.target(${ref})`);
    if (t.gone) return { ok: false, text: `[${ref}] is no longer on the page. browser_snapshot for a fresh listing.` };
    const block = await inputBlock(tab, a, '');
    if (block) return { ok: false, text: block };
    if (!t.editable) return { ok: false, text: `[${ref}] "${t.name}" (${t.role}) is not a text field.` };
    if (t.type === 'password') return { ok: false, text: 'Passwords are typed by the user, never by an AI.' };
    if (t.covered) return { ok: false, text: `[${ref}] is covered by "${t.covered}".` };
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
    if (opts.clear && t.value) {
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

export function toolPress(handle: string | undefined, key: string, client: string, site: Site = 'instagram'): Promise<Outcome> {
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
    }
    await sleep(rand(500, 900));
    return { ok: true, text: `Pressed ${key}.\n${(await read(tab, store.findAccount(a.id))).text}` };
  });
}

export function toolScroll(handle: string | undefined, direction: 'up' | 'down', amount: 'small' | 'page' | 'big' = 'page', site: Site = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const h = tab.vh;
    const px = { small: h * 0.35, page: h * 0.8, big: h * 2.2 }[amount] * rand(0.9, 1.1);
    await wheel(tab, direction === 'down' ? px : -px);
    await sleep(rand(600, 1000));
    return { ok: true, text: `Scrolled ${direction}.\n${(await read(tab, a)).text}` };
  });
}

const POST_URL = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels)\/[A-Za-z0-9_-]+/;

/** Stay on the page (watching a reel is waiting). Long waits are how a human-paced session looks. */
export function toolWait(handle: string | undefined, seconds: number, site: Site = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const s = Math.max(1, Math.min(40, seconds));
    await sleep(s * 1000);
    const { snap, text } = await read(tab, a);
    // Waiting on a post that is still going up: keep the tab held while it uploads, free it once it is done.
    if ((tab.settleUntil ?? 0) > Date.now() && UPLOAD_WATCH.has(tab.site)) tab.settleUntil = UPLOADING.test(text) ? Date.now() + 60_000 : 0;
    if (s >= 3 && ((tab.site === 'instagram' && POST_URL.test(snap.url)) || (tab.site === 'x' && X_POST_URL.test(snap.url)) || (tab.site === 'tiktok' && TT_VIDEO_URL.test(snap.url)) || (tab.site === 'facebook' && FB_POST_URL.test(snap.url)) || (tab.site === 'threads' && TH_POST_URL.test(snap.url)) || (tab.site === 'pinterest' && PIN_URL.test(snap.url)))) store.recordAction(a.handle, snap.url, 'watch', {}, tab.site);
    return { ok: true, text: `Waited ${s}s.\n${text}` };
  });
}

/** Close the tabs/windows Marketo opened for an account (one site, or all). Only Marketo's own tabs: the user's other tabs are never touched. */
export function toolClose(handle?: string, site?: Site): Outcome {
  let a: IgAccount;
  try {
    a = account(handle);
  } catch (e) {
    return { ok: false, text: (e as Error).message };
  }
  const busy = [...tabsOf(a.id)].filter(([, t]) => (!site || t.site === site) && t.s.alive() && (t.settleUntil ?? 0) > Date.now()).map(([, t]) => t);
  if (busy.length) return { ok: false, text: `A post is still going up on ${busy.map((t) => SITES[t.site].label).join(', ')}: closing the tab now can lose it. Wait ${Math.ceil((Math.max(...busy.map((t) => t.settleUntil ?? 0)) - Date.now()) / 1000)}s, check the post is up, then close.` };
  const open = [...tabsOf(a.id)].filter(([, t]) => (!site || t.site === site) && t.s.alive()).map(([, t]) => SITES[t.site].label);
  closeTab(a.id, site);
  void broadcast();
  return { ok: true, text: open.length ? `Closed ${open.join(', ')} for ${a.handle}.` : `No Marketo tabs were open for ${a.handle}${site ? ` on ${SITES[site].label}` : ''}.` };
}

/** Close every tab Marketo opened, for every account (the end of an autopilot run). */
export function closeRunTabs(): number {
  let n = 0;
  for (const a of store.get().igAccounts) {
    n += [...tabsOf(a.id)].filter(([, t]) => t.s.alive()).length;
    closeTab(a.id);
  }
  void broadcast();
  return n;
}

export function toolBack(handle?: string, site: Site = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    if ((tab.settleUntil ?? 0) > Date.now()) return { ok: false, text: `A post is still going up in this ${SITES[site].label} tab: going back now can lose it. browser_wait and look again until the upload is gone.` };
    if (!(await tab.s.back())) return { ok: false, text: 'There is no page to go back to.' };
    await sleep(rand(1000, 1500));
    return { ok: true, text: `Went back.\n${(await read(tab, a)).text}` };
  });
}

export function toolScreenshot(handle?: string, site: Site = 'instagram'): Promise<Outcome> {
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
    const roots = [store.get().settings.outputDir, app.getPath('userData'), app.getAppPath()].filter(Boolean).map((r) => path.resolve(r).toLowerCase() + path.sep);
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

/** Chrome only lets an extension hand over a local file when the user allowed it file access. */
const FILE_ACCESS = 'Chrome refused to attach the file. The user turns on "Allow access to file URLs" for the Krypt Marketo extension (chrome://extensions > Krypt Marketo > Details), then try again. Or they upload the reel themselves.';

/** Put a rendered reel into Instagram's "create" file picker, or YouTube Studio's upload dialog (the final Share / Publish still needs the user's approval). */
export function toolAttach(handle: string | undefined, file: string, label: string, site: Site = 'instagram'): Promise<Outcome> {
  return withTab(handle, site, async (tab, a) => {
    const yt = tab.site === 'youtube';
    let block = await inputBlock(tab, a, '');
    if (block) return { ok: false, text: block };
    if (yt) checkYt(a);
    else checkAllowed(a, 'posts', 'posting', tab.site);
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
      // Studio's upload dialog: youtube.com/upload opens it on the signed-in channel.
      const picker = 'input[type=file][name=Filedata]';
      found = await filePickers(tab, picker);
      if (!found.length) {
        await tab.s.load(YT_UPLOAD);
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
        text: `Attached ${label}. Type the thread's text in the composer (a short hook line, then the link; Threads allows 500 characters), then press Post (it waits for the user only if they switched approvals on). Afterwards open the profile, copy the new thread's link and mark_posted with platform "threads".\n${(await read(tab, a)).text}`,
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
    return { ok: true, text: `Attached ${label}. Instagram is processing it; continue through its steps (crop, cover, caption). Then press the final Share (it waits for the user only if they switched approvals on).\n${(await read(tab, a)).text}` };
  });
}
