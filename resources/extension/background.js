// Krypt Marketo — Chrome extension (service worker).
//
// Lets the Krypt Marketo app on this computer use Instagram, X, TikTok, Facebook, Threads, Pinterest, and YouTube
// Studio for uploading Shorts, in THIS Chrome profile: same cookies, same
// device, same fingerprint as when you use them yourself. It holds no rules of
// its own beyond "these sites only": what an AI may do (daily limits,
// approvals, watch-only) is decided by the app.
//
//   Marketo app ⇄ native messaging host ⇄ this worker ⇄ one tab per site
//
// It only talks to the Marketo app installed on this computer (Chrome starts
// the app's helper itself; no network port is opened), and it only ever
// touches its own tabs (one per site), and only while each is on its own site.
'use strict';

const HOST = 'cc.krypt.marketo';
/** The sites the app may use, each in a tab of its own. */
const SITES = {
  instagram: {
    home: 'https://www.instagram.com/',
    host: /(^|\.)instagram\.com$/i,
    cookieUrl: 'https://www.instagram.com/',
  },
  youtube: {
    home: 'https://studio.youtube.com/',
    host: /(^|\.)youtube\.com$/i,
    cookieUrl: 'https://www.youtube.com/',
  },
  x: {
    home: 'https://x.com/home',
    host: /(^|\.)(x|twitter)\.com$/i,
    cookieUrl: 'https://x.com/',
  },
  tiktok: {
    home: 'https://www.tiktok.com/foryou',
    host: /(^|\.)tiktok\.com$/i,
    cookieUrl: 'https://www.tiktok.com/',
  },
  facebook: {
    home: 'https://www.facebook.com/',
    host: /(^|\.)facebook\.com$/i,
    cookieUrl: 'https://www.facebook.com/',
  },
  threads: {
    home: 'https://www.threads.com/',
    host: /(^|\.)threads\.(com|net)$/i,
    cookieUrl: 'https://www.threads.com/',
  },
  pinterest: {
    home: 'https://www.pinterest.com/',
    host: /(^|\.)pinterest\.(com|co\.uk|ca|com\.au|de|fr)$/i,
    cookieUrl: 'https://www.pinterest.com/',
  },
  // Content Rewards: where post links are submitted to the campaigns the user joined (0.10).
  rewards: {
    home: 'https://contentrewards.com/c/home',
    host: /(^|\.)contentrewards\.com$/i,
    cookieUrl: 'https://contentrewards.com/',
  },
};
const DOMAIN = { instagram: 'instagram.com', youtube: 'youtube.com', x: 'x.com', tiktok: 'tiktok.com', facebook: 'facebook.com', threads: 'threads.com', pinterest: 'pinterest.com', rewards: 'contentrewards.com' };
/** Everything the app may ask Chrome's debugger to do; nothing else is passed on. */
const CDP_ALLOWED = new Set([
  'Input.dispatchMouseEvent',
  'Input.dispatchKeyEvent',
  'Input.insertText',
  'Page.captureScreenshot',
  'Page.getFrameTree',
  'Page.createIsolatedWorld',
  'Runtime.evaluate',
  'DOM.getDocument',
  'DOM.querySelectorAll',
  'DOM.setFileInputFiles',
]);
/** Let go of a tab (and Chrome's "started debugging" bar) after this long without a command. */
const IDLE_DETACH_MS = 90000;
/** After the user presses Cancel on that bar, or Pause in the popup, nothing runs for this long. */
const USER_STOP_MS = 5 * 60000;

let port = null;
let hubUp = false;
let hostError = '';
/** The tab the app drives, per site. */
const tabIds = { instagram: null, youtube: null, x: null, tiktok: null, facebook: null, threads: null, pinterest: null, rewards: null };
let tabsLoaded = false;
const attached = new Set();
const idleTimers = new Map();
let stoppedAt = 0;
let stateTimer = null;
/** Marketo's mute (the app's sound button): applies to the tabs Marketo drives, never the user's own. */
let muted = false;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hostOf = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};
const siteOf = (name) => {
  const s = Object.prototype.hasOwnProperty.call(SITES, name || 'instagram') ? name || 'instagram' : null;
  if (!s) throw new Error(`Unknown site ${name}`);
  return s;
};
const onSite = (site, url) => /^https:\/\//i.test(url || '') && SITES[site].host.test(hostOf(url));
/** Without the "tabs" permission Chrome only tells us the URL of tabs on our sites: anything else reads as ''. */
const urlOf = (t) => (t && (t.url || t.pendingUrl)) || '';
const siteOfTab = (id) => Object.keys(tabIds).find((k) => tabIds[k] === id) || null;

function post(msg) {
  try {
    if (port && hubUp) port.postMessage(msg);
  } catch {
    /* the app went away */
  }
}

function badge() {
  chrome.action.setBadgeBackgroundColor({ color: hubUp ? '#22c55e' : '#6b7280' }).catch(() => {});
  chrome.action.setBadgeText({ text: hubUp ? 'on' : '' }).catch(() => {});
}

// ── Sign-in state (cookie names only; no cookie value ever leaves Chrome except the numeric user ids of Instagram and X) ──
async function igState() {
  try {
    const url = SITES.instagram.cookieUrl;
    const [sid, uid] = await Promise.all([chrome.cookies.get({ url, name: 'sessionid' }), chrome.cookies.get({ url, name: 'ds_user_id' })]);
    const loggedIn = !!(sid && sid.value);
    return { loggedIn, userId: loggedIn && uid ? uid.value : undefined };
  } catch {
    return { loggedIn: false };
  }
}

const YT_COOKIES = ['SID', '__Secure-3PSID', 'LOGIN_INFO'];
async function ytState() {
  try {
    const url = SITES.youtube.cookieUrl;
    const found = await Promise.all(YT_COOKIES.map((name) => chrome.cookies.get({ url, name })));
    return { ytLoggedIn: found.some((c) => c && c.value) };
  } catch {
    return { ytLoggedIn: false };
  }
}

// X: signed in = an auth_token cookie; its numeric user id is in twid ("u=123…").
async function xState() {
  try {
    const url = SITES.x.cookieUrl;
    const [auth, twid] = await Promise.all([chrome.cookies.get({ url, name: 'auth_token' }), chrome.cookies.get({ url, name: 'twid' })]);
    const xLoggedIn = !!(auth && auth.value);
    const m = twid && /u(?:%3D|=)(\d+)/.exec(twid.value);
    return { xLoggedIn, xUserId: xLoggedIn && m ? m[1] : undefined };
  } catch {
    return { xLoggedIn: false };
  }
}

// TikTok: signed in = a sessionid cookie; multi_sids starts with the numeric user id ("123…:session").
async function ttState() {
  try {
    const url = SITES.tiktok.cookieUrl;
    const [sid, multi] = await Promise.all([chrome.cookies.get({ url, name: 'sessionid' }), chrome.cookies.get({ url, name: 'multi_sids' })]);
    const ttLoggedIn = !!(sid && sid.value);
    const m = multi && /^(\d+)(?:%3A|:)/.exec(multi.value);
    return { ttLoggedIn, ttUserId: ttLoggedIn && m ? m[1] : undefined };
  } catch {
    return { ttLoggedIn: false };
  }
}

// Facebook (xs; c_user is the user id), Threads (sessionid; ds_user_id, on threads.com or threads.net), Pinterest (_auth=1).
async function netsState() {
  const get = (url, name) => chrome.cookies.get({ url, name }).catch(() => null);
  const id = (c) => (c && /^\d+$/.test(c.value) ? c.value : undefined);
  const [xs, cUser, thSid, thSidOld, thUid, pinAuth] = await Promise.all([
    get('https://www.facebook.com/', 'xs'),
    get('https://www.facebook.com/', 'c_user'),
    get('https://www.threads.com/', 'sessionid'),
    get('https://www.threads.net/', 'sessionid'),
    get('https://www.threads.com/', 'ds_user_id'),
    get('https://www.pinterest.com/', '_auth'),
  ]);
  const fb = !!(xs && xs.value);
  const th = !!((thSid && thSid.value) || (thSidOld && thSidOld.value));
  return {
    nets: {
      facebook: { loggedIn: fb, userId: fb ? id(cUser) : undefined },
      threads: { loggedIn: th, userId: th ? id(thUid) : undefined },
      pinterest: { loggedIn: !!(pinAuth && pinAuth.value === '1') },
    },
  };
}

const state = async () => ({ ...(await igState()), ...(await ytState()), ...(await xState()), ...(await ttState()), ...(await netsState()) });

// ── Which Chrome profile this is ───────────────────────────────────────────
// A random id made once per Chrome profile and kept in that profile's own
// extension storage. The app on this computer finds it in that profile's folder
// and so knows which Chrome profile this connection is (its Setup page lets the
// user pick which one an account runs in). The id itself says nothing about
// the person: no name, no email, no Chrome account.
async function profileKey() {
  const s = await chrome.storage.local.get('profileKey');
  if (typeof s.profileKey === 'string' && /^[a-f0-9]{32}$/.test(s.profileKey)) return s.profileKey;
  const key = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await chrome.storage.local.set({ profileKey: key });
  return key;
}

// ── The tabs ───────────────────────────────────────────────────────────────
async function loadTabs() {
  if (tabsLoaded) return;
  tabsLoaded = true;
  try {
    const s = await chrome.storage.session.get(['tabs', 'tabId']);
    if (s.tabs && typeof s.tabs === 'object') for (const k of Object.keys(tabIds)) tabIds[k] = typeof s.tabs[k] === 'number' ? s.tabs[k] : null;
    else if (typeof s.tabId === 'number') tabIds.instagram = s.tabId; // from version 0.1
  } catch {
    /* no session storage: start without tabs */
  }
}

async function setTab(site, id) {
  const old = tabIds[site];
  tabIds[site] = id;
  tabsLoaded = true;
  if (id == null && old != null) attached.delete(old);
  try {
    await chrome.storage.session.set({ tabs: { ...tabIds } });
  } catch {
    /* best effort */
  }
}

async function getTab(site) {
  await loadTabs();
  const id = tabIds[site];
  if (id == null) return null;
  try {
    return await chrome.tabs.get(id);
  } catch {
    await setTab(site, null);
    return null;
  }
}

async function waitLoaded(id, ms) {
  const until = Date.now() + ms;
  await sleep(250);
  while (Date.now() < until) {
    let t;
    try {
      t = await chrome.tabs.get(id);
    } catch {
      return;
    }
    if (t.status === 'complete') return;
    await sleep(150);
  }
}

async function info(site) {
  const t = await getTab(site);
  if (!t) return { open: false, url: '' };
  let minimized = false;
  try {
    minimized = (await chrome.windows.get(t.windowId)).state === 'minimized';
  } catch {
    /* the window is closing */
  }
  return { open: true, url: urlOf(t), minimized, attached: attached.has(t.id) };
}

// ── Debugger ───────────────────────────────────────────────────────────────
function touchIdle(id) {
  if (idleTimers.has(id)) clearTimeout(idleTimers.get(id));
  idleTimers.set(
    id,
    setTimeout(() => void detach(id), IDLE_DETACH_MS),
  );
}

async function attach(id) {
  if (attached.has(id)) return;
  try {
    await chrome.debugger.attach({ tabId: id }, '1.3');
  } catch (e) {
    const m = String((e && e.message) || e);
    // Our own session survives a restart of this worker.
    if (!/already attached/i.test(m)) throw new Error(`ATTACH_FAILED: ${m}`);
  }
  attached.add(id);
  // Dialog events (see the onEvent listener below).
  try {
    await chrome.debugger.sendCommand({ tabId: id }, 'Page.enable');
  } catch {
    /* no dialog handling on this tab */
  }
  // The tab is usually behind other windows while an AI works. Chrome treats a covered page as hidden: it stops
  // drawing it, pauses its videos and drops clicks sent to it. This keeps the page acting as visible and focused.
  try {
    await chrome.debugger.sendCommand({ tabId: id }, 'Emulation.setFocusEmulationEnabled', { enabled: true });
  } catch {
    /* older Chrome: the window then has to stay visible */
  }
}

async function detach(id) {
  if (idleTimers.has(id)) clearTimeout(idleTimers.get(id));
  idleTimers.delete(id);
  if (id == null || !attached.has(id)) return;
  await chooserOff(id);
  attached.delete(id);
  try {
    await chrome.debugger.detach({ tabId: id });
  } catch {
    /* already gone */
  }
}

const detachAll = () => Promise.all([...attached].map((id) => detach(id)));

// ── File choosers ──────────────────────────────────────────────────────────
// Some uploaders (Meta Business Suite's "Add Video") have no file input in the page: pressing the button makes one
// and opens Chrome's file dialog. While a tab is in this map that dialog is held back and the chooser's input is
// kept instead, so the app can give it the file.
/** tab id → { opened, node (the input's backend node id, if the chooser has one), timer }. */
const choosers = new Map();
/** The page gets this long to open its chooser after the app pressed the button. */
const CHOOSER_WAIT_MS = 8000;

async function chooserOff(id) {
  const c = choosers.get(id);
  if (!c) return;
  clearTimeout(c.timer);
  choosers.delete(id);
  if (!attached.has(id)) return;
  await chrome.debugger.sendCommand({ tabId: id }, 'Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
}

const stopped = () => Date.now() - stoppedAt < USER_STOP_MS;

// ── Commands from the app (each names its site; the default is Instagram) ──
async function applyMute() {
  await loadTabs();
  for (const id of Object.values(tabIds)) if (id != null) await chrome.tabs.update(id, { muted }).catch(() => {});
}

const COMMANDS = {
  state: () => state(),

  /** Since 1.0: the hub was updated and ships a newer copy of this extension. Reload from disk to pick it up
   *  (the same as the Reload button in chrome://extensions). The reply goes out first. */
  reload() {
    setTimeout(() => chrome.runtime.reload(), 300);
    return { reloading: chrome.runtime.getManifest().version };
  },

  /** Mute or unmute the tabs Marketo drives (the app's sound button). */
  async mute({ muted: m }) {
    muted = !!m;
    await applyMute();
    return { muted };
  },
  info: ({ site }) => info(siteOf(site)),

  /**
   * Open the site's tab (its own window the first time), or point it at another page of that site. Since 1.1 the app
   * may say how big a new window is, and (oneWindow) to open the tab in the window of one of our other tabs.
   */
  async open({ url, focus, site: name, width, height, oneWindow }) {
    const site = siteOf(name);
    const home = SITES[site].home;
    if (url && !onSite(site, url)) throw new Error(`Only ${DOMAIN[site]} pages open here.`);
    let t = await getTab(site);
    if (!t && oneWindow) {
      // A tab in the window one of our other tabs is in (the user's own windows are never used).
      for (const other of Object.keys(tabIds)) {
        if (other === site) continue;
        const o = await getTab(other);
        if (!o) continue;
        try {
          t = await chrome.tabs.create({ windowId: o.windowId, url: url || home, active: true });
        } catch {
          t = null;
        }
        if (t) break;
      }
      if (t) {
        await setTab(site, t.id);
        if (muted) await chrome.tabs.update(t.id, { muted: true }).catch(() => {});
        // That window may be minimized, and a minimized window does not draw: nothing in it loads or plays.
        const w = await chrome.windows.get(t.windowId).catch(() => null);
        if (w && w.state === 'minimized') await chrome.windows.update(t.windowId, { state: 'normal' }).catch(() => {});
        if (focus) await chrome.windows.update(t.windowId, { focused: true }).catch(() => {});
        await waitLoaded(t.id, 20000);
        return info(site);
      }
    }
    if (!t) {
      const w = Math.round(Number(width)) >= 800 && Math.round(Number(width)) <= 3840 ? Math.round(Number(width)) : 1320;
      const h = Math.round(Number(height)) >= 600 && Math.round(Number(height)) <= 2160 ? Math.round(Number(height)) : 920;
      const win = await chrome.windows.create({ url: url || home, type: 'normal', focused: !!focus, width: w, height: h });
      t = win.tabs && win.tabs[0];
      if (!t) throw new Error('Chrome did not open a window.');
      await setTab(site, t.id);
      if (muted) await chrome.tabs.update(t.id, { muted: true }).catch(() => {});
      await waitLoaded(t.id, 20000);
    } else {
      if (url || !onSite(site, urlOf(t))) {
        await chrome.tabs.update(t.id, { url: url || home });
        await waitLoaded(t.id, 20000);
      }
      if (!t.active) await chrome.tabs.update(t.id, { active: true });
      const w = await chrome.windows.get(t.windowId);
      // A minimized window does not draw, so nothing in it loads or plays.
      if (w.state === 'minimized') await chrome.windows.update(t.windowId, { state: 'normal' });
      if (focus) await chrome.windows.update(t.windowId, { focused: true });
    }
    return info(site);
  },

  async show({ site }) {
    const t = await getTab(siteOf(site));
    if (!t) throw new Error('NO_TAB');
    await chrome.tabs.update(t.id, { active: true });
    await chrome.windows.update(t.windowId, { focused: true });
    return info(siteOf(site));
  },

  async back({ site }) {
    const t = await getTab(siteOf(site));
    if (!t) throw new Error('NO_TAB');
    await chrome.tabs.goBack(t.id);
    return true;
  },

  async cdp({ method, params, site: name }) {
    const site = siteOf(name);
    if (!CDP_ALLOWED.has(method)) throw new Error(`NOT_ALLOWED: ${method}`);
    if (stopped()) throw new Error('STOPPED_BY_USER');
    const t = await getTab(site);
    if (!t) throw new Error('NO_TAB');
    if (!onSite(site, urlOf(t))) throw new Error(`NOT_${site.toUpperCase()}`);
    // Our tabs sharing one window: the one being driven must be the one showing (a background tab is hidden, and
    // a hidden page pauses its videos and drops clicks). Only ever switches between our own tabs.
    if (!t.active) {
      try {
        const [shown] = await chrome.tabs.query({ windowId: t.windowId, active: true });
        if (shown && siteOfTab(shown.id)) await chrome.tabs.update(t.id, { active: true });
      } catch {
        /* the window is closing */
      }
    }
    await attach(t.id);
    touchIdle(t.id);
    try {
      return await chrome.debugger.sendCommand({ tabId: t.id }, method, params || {});
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/not attached/i.test(m)) {
        attached.delete(t.id);
        throw new Error(`ATTACH_FAILED: ${m}`);
      }
      throw e;
    }
  },

  /**
   * Give a file to an upload button that only makes its file input when pressed. "arm" holds back Chrome's file
   * dialog on the tab; the app then presses the button with a real click; "set" hands the chooser that opened the
   * files (attached: false when none opened); "off" lets go without a file.
   */
  async chooser({ site: name, op, files }) {
    const site = siteOf(name);
    if (stopped()) throw new Error('STOPPED_BY_USER');
    const t = await getTab(site);
    if (!t) throw new Error('NO_TAB');
    if (op === 'off') {
      await chooserOff(t.id);
      return { attached: false };
    }
    if (!onSite(site, urlOf(t))) throw new Error(`NOT_${site.toUpperCase()}`);
    await attach(t.id);
    touchIdle(t.id);
    if (op === 'arm') {
      await chooserOff(t.id);
      await chrome.debugger.sendCommand({ tabId: t.id }, 'Page.setInterceptFileChooserDialog', { enabled: true });
      // Never leave the tab's own file dialog switched off: let go if the app does not come back.
      choosers.set(t.id, { opened: false, node: null, timer: setTimeout(() => void chooserOff(t.id), CHOOSER_WAIT_MS + 20000) });
      return { armed: true };
    }
    if (op !== 'set' || !Array.isArray(files) || !files.length || files.some((f) => typeof f !== 'string')) throw new Error('NOT_ALLOWED: chooser');
    try {
      const until = Date.now() + CHOOSER_WAIT_MS;
      let c = choosers.get(t.id);
      while (c && !c.opened && Date.now() < until) {
        await sleep(150);
        c = choosers.get(t.id);
      }
      if (!c || !c.opened || c.node == null) return { attached: false };
      await chrome.debugger.sendCommand({ tabId: t.id }, 'DOM.setFileInputFiles', { files, backendNodeId: c.node });
      return { attached: true };
    } finally {
      await chooserOff(t.id);
    }
  },

  /** Stop controlling the tabs without closing them. */
  async release() {
    await detachAll();
    return true;
  },

  /** Since 1.1: stop controlling one site's tab (the AI moved on to another platform); it stays open. */
  async detachSite({ site: name }) {
    const t = await getTab(siteOf(name));
    if (t) await detach(t.id);
    return true;
  },

  async close({ site: name }) {
    const site = siteOf(name);
    const t = await getTab(site);
    if (t) {
      await detach(t.id);
      await chrome.tabs.remove(t.id).catch(() => {});
    }
    await setTab(site, null);
    return true;
  },

  /**
   * The Marketo profile's proxy for this whole Chrome profile ({on:false} takes ours away). It stays set while
   * Marketo is closed and after Chrome restarts, so pages never load from this computer's own IP in between.
   */
  async proxy(args) {
    if (!args || !args.on) {
      const cur = await chrome.proxy.settings.get({ incognito: false });
      if (cur.levelOfControl === 'controlled_by_this_extension') await chrome.proxy.settings.clear({ scope: 'regular' });
      await chrome.storage.local.remove('proxyAuth');
      await chrome.privacy.network.webRTCIPHandlingPolicy.clear({ scope: 'regular' }).catch(() => {});
      return { on: false, control: cur.levelOfControl };
    }
    const scheme = ['http', 'https', 'socks5'].includes(args.scheme) ? args.scheme : 'http';
    const host = String(args.host || '');
    const port = Number(args.port);
    if (!/^[A-Za-z0-9.-]{1,253}$/.test(host) || !(port >= 1 && port <= 65535)) throw new Error('NOT_ALLOWED: proxy');
    const cur = await chrome.proxy.settings.get({ incognito: false });
    if (cur.levelOfControl === 'controlled_by_other_extensions' || cur.levelOfControl === 'not_controllable') return { on: false, control: cur.levelOfControl };
    if (args.username) await chrome.storage.local.set({ proxyAuth: { host: host.toLowerCase(), username: String(args.username), password: String(args.password || '') } });
    else await chrome.storage.local.remove('proxyAuth');
    await chrome.proxy.settings.set({ value: { mode: 'fixed_servers', rules: { singleProxy: { scheme, host, port }, bypassList: [] } }, scope: 'regular' });
    // WebRTC would otherwise reach out around the proxy and show the real IP to the page.
    await chrome.privacy.network.webRTCIPHandlingPolicy.set({ value: 'disable_non_proxied_udp', scope: 'regular' }).catch(() => {});
    const after = await chrome.proxy.settings.get({ incognito: false });
    await chrome.storage.session.remove('proxyWarm').catch(() => {});
    void warmProxy();
    return { on: true, control: after.levelOfControl };
  },

  /** The exit IP this Chrome profile shows to sites (through its proxy, if any). */
  async ipcheck() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const r = await fetch('https://ipinfo.io/json', { cache: 'no-store', credentials: 'omit', signal: ctl.signal });
      if (r.status === 407) throw new Error('the proxy refused the user name and password');
      if (!r.ok) throw new Error(`the check answered ${r.status}`);
      const j = await r.json();
      return { ip: String(j.ip || ''), country: j.country ? String(j.country) : undefined, city: j.city ? String(j.city) : undefined };
    } catch (e) {
      const m = String((e && e.message) || e);
      throw new Error(e && e.name === 'AbortError' ? 'the proxy did not answer in 20s' : /failed to fetch/i.test(m) ? 'nothing came back through the proxy (check its host, port, user name and password)' : m);
    } finally {
      clearTimeout(timer);
    }
  },
};

// Chrome asks this extension for the proxy's password only for its own sites. One request through the proxy to a
// site it may use signs Chrome in, and Chrome then reuses that sign-in for every other site in this Chrome profile
// (so the user never gets Chrome's own password box). Done once per Chrome start, and whenever the proxy changes.
async function warmProxy() {
  try {
    const { proxyAuth } = await chrome.storage.local.get('proxyAuth');
    if (!proxyAuth) return;
    const { proxyWarm } = await chrome.storage.session.get('proxyWarm');
    if (proxyWarm) return;
    const cur = await chrome.proxy.settings.get({ incognito: false });
    if (cur.levelOfControl !== 'controlled_by_this_extension') return;
    await COMMANDS.ipcheck();
    await chrome.storage.session.set({ proxyWarm: Date.now() });
  } catch {
    /* the proxy is down: tried again the next time this worker starts */
  }
}
chrome.runtime.onStartup.addListener(() => void warmProxy());
void warmProxy();

// The proxy's sign-in, from what the app gave us (registered at the top level so Chrome finds it after a restart).
// A wrong password is tried twice, then Chrome is left to fail rather than ask forever.
const authTries = new Map();
chrome.webRequest.onAuthRequired.addListener(
  (details, callback) => {
    if (!details.isProxy) return callback({});
    chrome.storage.local.get('proxyAuth').then(({ proxyAuth }) => {
      const n = (authTries.get(details.requestId) || 0) + 1;
      authTries.set(details.requestId, n);
      setTimeout(() => authTries.delete(details.requestId), 60000);
      if (!proxyAuth || n > 2 || (details.challenger && details.challenger.host && details.challenger.host.toLowerCase() !== proxyAuth.host)) return callback({ cancel: n > 2 });
      callback({ authCredentials: { username: proxyAuth.username, password: proxyAuth.password } });
    }, () => callback({}));
  },
  { urls: ['<all_urls>'] },
  ['asyncBlocking'],
);

async function hello() {
  // `tab` is the Instagram tab (what version 0.1 sent); `tabs` has every site.
  const tabs = {};
  for (const k of Object.keys(SITES)) tabs[k] = await info(k);
  const key = await profileKey().catch(() => undefined);
  post({ ev: 'hello', version: chrome.runtime.getManifest().version, key, sites: Object.keys(SITES), ...(await state()), tab: tabs.instagram, tabs, stopped: stopped() });
}

async function onHostMessage(m) {
  if (!m || typeof m !== 'object') return;
  if (m.host === 'up') {
    hubUp = true;
    hostError = '';
    badge();
    await hello();
    return;
  }
  if (m.host === 'down') {
    hubUp = false;
    badge();
    await detachAll();
    return;
  }
  if (typeof m.id !== 'number' || typeof m.cmd !== 'string') return;
  const fn = Object.prototype.hasOwnProperty.call(COMMANDS, m.cmd) ? COMMANDS[m.cmd] : null;
  try {
    if (!fn) throw new Error(`Unknown command ${m.cmd}`);
    post({ id: m.id, ok: true, result: await fn(m.args || {}) });
  } catch (e) {
    post({ id: m.id, ok: false, error: String((e && e.message) || e) });
  }
}

// ── Connection to the app ──────────────────────────────────────────────────
function connect() {
  if (port) return;
  let p;
  try {
    p = chrome.runtime.connectNative(HOST);
  } catch (e) {
    hostError = String((e && e.message) || e);
    return;
  }
  port = p;
  p.onMessage.addListener((m) => void onHostMessage(m));
  p.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    if (port !== p) return;
    hostError = err && err.message ? err.message : 'The Krypt Marketo helper stopped.';
    port = null;
    hubUp = false;
    badge();
    void detachAll();
  });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'reconnect') connect();
});
function boot() {
  chrome.alarms.create('reconnect', { periodInMinutes: 1 });
  badge();
  connect();
}
chrome.runtime.onInstalled.addListener(boot);
chrome.runtime.onStartup.addListener(boot);
boot();

// ── What the tabs do on their own ──────────────────────────────────────────
chrome.tabs.onRemoved.addListener((id) => {
  const site = siteOfTab(id);
  if (!site) return;
  attached.delete(id);
  void setTab(site, null);
  post({ ev: 'tab', site, open: false, url: '' });
});

chrome.tabs.onUpdated.addListener((id, change, tab) => {
  const site = siteOfTab(id);
  if (!site) return;
  if (change.url === undefined && change.status === undefined) return;
  const url = urlOf(tab);
  post({ ev: 'tab', site, open: true, url });
  // While an AI session holds the tab it stays on its site: a link that leaves is undone.
  if (attached.has(id) && change.status === 'loading' && !onSite(site, url)) {
    void state().then((s) => {
      // Signing in may pass through other Meta / Google / Apple pages.
      // Content Rewards: signing in there is the user's, done while no AI session holds the tab.
      const signedIn = site === 'rewards' ? true : site === 'youtube' ? s.ytLoggedIn : site === 'x' ? s.xLoggedIn : site === 'tiktok' ? s.ttLoggedIn : s.nets[site] ? s.nets[site].loggedIn : s.loggedIn;
      if (!signedIn) return;
      post({ ev: 'blocked', site, url: url || `a page outside ${DOMAIN[site]}` });
      chrome.tabs.goBack(id).catch(() => chrome.tabs.update(id, { url: SITES[site].home }).catch(() => {}));
    });
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  const site = tab.openerTabId == null ? null : siteOfTab(tab.openerTabId);
  if (!site || !attached.has(tab.openerTabId) || tab.id == null) return;
  // A link that wanted a new tab during an AI session: pages of the same site open in the same tab, anything else does not open.
  const url = urlOf(tab);
  chrome.tabs.remove(tab.id).catch(() => {});
  if (onSite(site, url)) chrome.tabs.update(tab.openerTabId, { url }).catch(() => {});
  else post({ ev: 'blocked', site, url: url || 'a link outside the site' });
});

// A "Leave site?" box (a draft the page wants to keep) or an alert freezes every debugger command until someone
// answers it. Leaving is what the AI asked for; any other alert, confirm or prompt is dismissed.
chrome.debugger.onEvent.addListener((source, method, params) => {
  if (source.tabId == null || !attached.has(source.tabId)) return;
  // The page opened its file chooser while the app was waiting for it (see the chooser command).
  if (method === 'Page.fileChooserOpened') {
    const c = choosers.get(source.tabId);
    if (c) {
      c.opened = true;
      c.node = params && typeof params.backendNodeId === 'number' ? params.backendNodeId : null;
    }
    return;
  }
  if (method !== 'Page.javascriptDialogOpening') return;
  chrome.debugger.sendCommand({ tabId: source.tabId }, 'Page.handleJavaScriptDialog', { accept: !!params && params.type === 'beforeunload' }).catch(() => {});
});

chrome.debugger.onDetach.addListener((source, reason) => {
  if (source.tabId == null || !attached.has(source.tabId)) return;
  attached.delete(source.tabId);
  if (reason === 'canceled_by_user') {
    stoppedAt = Date.now();
    void detachAll();
    post({ ev: 'stopped', on: true });
  }
});

chrome.cookies.onChanged.addListener((c) => {
  const k = c.cookie;
  if (!k) return;
  const ig = /instagram\.com$/i.test(k.domain) && (k.name === 'sessionid' || k.name === 'ds_user_id');
  const yt = /youtube\.com$/i.test(k.domain) && YT_COOKIES.includes(k.name);
  const x = /(^|\.)x\.com$/i.test(k.domain) && (k.name === 'auth_token' || k.name === 'twid');
  const tt = /(^|\.)tiktok\.com$/i.test(k.domain) && (k.name === 'sessionid' || k.name === 'multi_sids');
  const fb = /(^|\.)facebook\.com$/i.test(k.domain) && (k.name === 'xs' || k.name === 'c_user');
  const th = /(^|\.)threads\.(com|net)$/i.test(k.domain) && (k.name === 'sessionid' || k.name === 'ds_user_id');
  const pin = /(^|\.)pinterest\./i.test(k.domain) && k.name === '_auth';
  if (!ig && !yt && !x && !tt && !fb && !th && !pin) return;
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = setTimeout(() => void state().then((s) => post({ ev: 'state', ...s })), 600);
});

// ── Popup ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  void (async () => {
    if (msg && msg.type === 'prefer') post({ ev: 'prefer' });
    if (msg && msg.type === 'pause') {
      stoppedAt = Date.now();
      await detachAll();
      post({ ev: 'stopped', on: true });
    }
    if (msg && msg.type === 'resume') {
      stoppedAt = 0;
      post({ ev: 'stopped', on: false });
    }
    if (msg && msg.type === 'connect') connect();
    reply({ hubUp, hostError, stopped: stopped(), attached: attached.size > 0, ...(await state()), tab: await info('instagram') });
  })();
  return true;
});
