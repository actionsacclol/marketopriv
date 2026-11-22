import type { UsageTier } from '../shared/aiUsage';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, shell, webContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AccountInput, AgentConfig, Brand, LibrarySort, ProxyInput, Reel, RefVideoInput, Settings, Site, StyleInput, SubmissionStatus, UiFocus } from '../shared/types';
import * as media from './media';
import * as store from './store';
import * as browser from './browser';
import { startDiscordPresence, stopDiscordPresence } from './discord';
import * as chromeBridge from './chromeBridge';
import * as autopilot from './autopilot';
import { exportLogs } from './logExport';
import * as approvals from './approvals';
import * as agent from './agent';
import * as kip from './kip';
import * as research from './research';
import * as refs from './refs';
import * as voice from './voice';
import * as whisper from './whisper';
import * as eleven from './eleven';
import * as screen from './screen';
import * as clips from './clips';
import * as reelFiles from './reelFiles';
import * as mediaFolders from './mediaFolders';
import { resolveYtChannel } from './ytChannel';
import * as longVideo from './longVideo';
import type { VoiceTune } from '../shared/voice';
import { SITES, linkOn } from '../shared/warmup';
import { startAgentHost } from './mcp/host';
import { shortVersion, startUpdateCheck, updateInfo } from './update';
import * as profiles from './profiles';
import * as proxy from './proxy';
import * as secret from './secret';
import * as instance from './instance';
import * as perf from './perf';
import { setBanner } from './campaignBanner';
import { cleanPerf } from '../shared/perf';
import type { ProfilesResult } from '../shared/types';
import { locked, lockWindows, startedForDebugging } from './lock';
import type { McpHandle } from './mcp/index';

// Krypt Marketo — the reel hub. One hub window, plus Instagram per account:
// its own window here, or a tab in the user's Chrome through the extension
// (electron/browser.ts, electron/chromeBridge.ts). Any AI drives it over MCP,
// or through the built-in chat. Fixed userData folder so the stdio bridge always finds mcp.json.
app.setName('Krypt Marketo');
// KRYPT_MARKETO_DATA points a second copy at its own folder (development and tests), leaving the real hub's data alone.
// In multi-instance mode a profile started with --profile=<id> has Chromium's data in its own folder (instance.ts).
const dataOverride = instance.DEV;
app.setPath('userData', instance.userData);
instance.shareKey();

process.env.DIST = path.join(__dirname, '..', 'dist');

media.registerScheme();

const LOG_MAX = 20 * 1024 * 1024;
const QUIET = /^\[agent\] .* browser_(open|scroll|wait|snapshot|click|type|press|screenshot|back|close) ok \(|^MCP: .* (connected|disconnected)$/;
let logLines = 0;
const log = (level: 'info' | 'warn' | 'error', message: string): void => {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  // Quiet log (Setup > Performance): routine browser steps and MCP connects stay out of the file. Errors and warnings stay.
  if (level === 'info' && QUIET.test(message) && perf.values().quietLog) return;
  if (level === 'error') console.error(line.trim());
  else console.log(line.trim());
  try {
    const file = path.join(instance.ROOT, 'marketo.log');
    // Kept under LOG_MAX: the full log moves to marketo.log.old (Export logs takes both).
    if (++logLines % 500 === 0 && fs.statSync(file, { throwIfNoEntry: false })?.size! > LOG_MAX) fs.renameSync(file, `${file}.old`);
    fs.appendFileSync(file, instance.INSTANCE ? `[${instance.INSTANCE}] ${line}` : line);
  } catch {
    /* best effort */
  }
};

let mainWindow: BrowserWindow | null = null;
let mcpHandle: McpHandle | null = null;

if (startedForDebugging()) {
  // The installed app does not run under a debugger (electron/lock.ts).
  app.exit(0);
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // Another start of this profile (its name picked in another window, a click on the app): bring the window up.
  app.on('second-instance', (_e, argv) => {
    // An autopilot run starting a background profile that is already running: stay in the background.
    if (instance.isHidden() && argv.includes('--background')) return;
    showMainWindow();
  });
  app.whenReady().then(bootstrap);
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

// The whole db goes to the window on every change. Many changes in a row (a run liking and following) are sent at
// most once per DB_PUSH_MS, always ending with the latest; anything that hands work to the window flushes first.
const DB_PUSH_MS = 250;
let dbPending: unknown = null;
let dbTimer: NodeJS.Timeout | null = null;
let dbLastPush = 0;
/** When the window was last handed work (a renderer tool). */
let lastWork = 0;
function flushDb(): void {
  if (dbTimer) clearTimeout(dbTimer);
  dbTimer = null;
  if (dbPending === null) return;
  const d = dbPending;
  dbPending = null;
  dbLastPush = Date.now();
  send('db:changed', d);
}
function pushDb(d: unknown): void {
  // Nobody sees a hidden window: hold the latest until it is shown or handed work (getMainWindow flushes). Not while
  // it was handed work recently (a render or another tool may be reading the db as it changes).
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible() && Date.now() - lastWork > 10 * 60_000) {
    dbPending = d;
    return;
  }
  const since = Date.now() - dbLastPush;
  if (!dbTimer && since >= DB_PUSH_MS) {
    dbLastPush = Date.now();
    send('db:changed', d);
    return;
  }
  dbPending = d;
  if (!dbTimer) dbTimer = setTimeout(flushDb, Math.max(0, DB_PUSH_MS - since));
}

/** In multi-instance mode every window says which profile it is. */
const windowTitle = (): string => (instance.MULTI ? `Krypt Marketo · ${profiles.active().name}` : 'Krypt Marketo');

let quitting = false;
let lastPrune = 0;

/**
 * Setup > Performance, background profiles only for their run: a profile window started in the background (by its
 * run, or with Main) closes a couple of minutes after its own run ends, while nobody has brought it up and it has
 * nothing left to do. Never a window the user has open, and never Main.
 */
let ownRan = false;
let idleSince = 0;
function quitAfterOwnRun(): void {
  if (!instance.INSTANCE || !process.argv.includes('--background') || !perf.values().bgOnDemand || quitting) return;
  if (autopilot.running()) {
    ownRan = true;
    idleSince = 0;
    return;
  }
  const shown = !!mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();
  if (!ownRan || shown) {
    idleSince = 0;
    return;
  }
  if (!idleSince) idleSince = Date.now();
  if (Date.now() - idleSince < 2 * 60_000) return;
  log('info', "performance: this background profile's run ended, closing its window until the next run");
  app.quit();
}
app.on('before-quit', () => {
  quitting = true;
  perf.renderDone();
  // Counts a batched save was still holding.
  try {
    store.flush();
  } catch {
    /* best effort */
  }
});

function showMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    instance.setHidden(false);
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
    return mainWindow;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#0A0A0F',
    title: windowTitle(),
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'resources', process.platform === 'win32' ? 'krypt.ico' : 'krypt.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, devTools: !locked },
    show: false,
  });
  // A profile started in the background keeps its window hidden until the user opens it.
  win.once('ready-to-show', () => {
    if (!instance.isHidden()) win.show();
  });
  win.on('show', () => instance.setHidden(false));
  // A background profile's window goes back to the background when closed (Stop on the Multi run page quits it).
  win.on('close', (e) => {
    if (quitting || !instance.INSTANCE || !profiles.list().find((p) => p.active)?.background) return;
    e.preventDefault();
    win.hide();
    instance.setHidden(true);
  });
  // The page sets its own title; keep the profile's name on the window.
  win.on('page-title-updated', (e) => {
    e.preventDefault();
    win.setTitle(windowTitle());
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== win.webContents.getURL()) e.preventDefault();
  });
  win.on('focus', () => win.flashFrame(false));
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
    // The hub is the app: its Instagram windows go with it.
    browser.closeAll();
  });
  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) win.loadURL(devUrl).catch((e) => log('error', `loadURL: ${e}`));
  else win.loadFile(path.join(process.env.DIST!, 'index.html')).catch((e) => log('error', `loadFile: ${e}`));
  mainWindow = win;
  // A hidden window (a background profile) gets the latest db when it is shown, not on every change.
  win.on('show', flushDb);
  return win;
}

const wrap =
  <A extends unknown[], T>(fn: (...a: A) => T) =>
  (_e: unknown, ...a: A): { ok: boolean; message?: string; data?: T } => {
    try {
      return { ok: true, data: fn(...a) };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  };

/** Like wrap, for handlers that return a promise. */
const wrapAsync =
  <A extends unknown[], T>(fn: (...a: A) => Promise<T>) =>
  async (_e: unknown, ...a: A): Promise<{ ok: boolean; message?: string; data?: T }> => {
    try {
      return { ok: true, data: await fn(...a) };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  };

const safeName = (s: string): string => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'reel';

/** Where a profile's videos go unless the user picks another folder: the first profile keeps the folder it always had. */
const outputDirFor = (p: { id: string; name: string }): string => {
  const base = path.join(app.getPath('videos'), 'Krypt Marketo');
  return p.id === profiles.MAIN ? base : path.join(base, safeName(p.name));
};

/** The profile that was open before an autopilot run opened another one; the hub goes back to it when the run ends. */
let returnTo: string | null = null;

/** Open another profile: its tabs closed, its data loaded, the window started fresh on it. */
async function switchProfile(id: string): Promise<void> {
  const from = profiles.active();
  if (autopilot.running() && !returnTo) returnTo = from.id;
  const closed = browser.closeRunTabs();
  agent.reset();
  // Kip's conversation was about the profile being left.
  kip.reset();
  approvals.clear();
  store.settleNextRun(autopilot.reportRunning);
  store.open(profiles.dir(id), outputDirFor(profiles.find(id)));
  profiles.setActive(id);
  store.settleNextRun(autopilot.reportRunning);
  proxy.reset();
  applyMute();
  mcpHandle?.refreshManifest();
  log('info', `profile "${from.name}" closed (${closed} tab(s)); profile "${profiles.active().name}" open (db ${store.dbPath()})`);
  // The pages hold picks from the old profile (a selected reel, an account): start them fresh on the new one.
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  if (win)
    await new Promise<void>((resolve) => {
      const done = setTimeout(resolve, 6000);
      win.webContents.once('did-finish-load', () => {
        clearTimeout(done);
        // A moment for the pages to take up their side of the AI's tools (previews and renders run there).
        setTimeout(resolve, 900);
      });
      win.webContents.reload();
    });
  void browser.statusAll().then((st) => send('browser:status', st));
}

function registerIpc(): void {
  ipcMain.handle('app:version', () => app.getVersion());
  ipcMain.handle('app:update', () => updateInfo());

  // Profiles: complete, separate sets (electron/profiles.ts).
  const prof = async (f: () => unknown | Promise<unknown>): Promise<ProfilesResult> => {
    try {
      await f();
      return { ok: true, data: profiles.list() };
    } catch (e) {
      return { ok: false, message: (e as Error).message, data: profiles.list() };
    }
  };
  ipcMain.handle('profiles:list', () => profiles.list());
  ipcMain.handle('profiles:create', (_e, name: string, copySettings: boolean, copyKnowledge: boolean) =>
    prof(async () => {
      const p = profiles.create(String(name ?? ''));
      store.seed(profiles.dir(p.id), outputDirFor(p), { settings: !!copySettings, knowledge: !!copyKnowledge });
      const copied = [copySettings && 'settings', copyKnowledge && 'Training and knowledge'].filter(Boolean).join(' and ');
      log('info', `profile "${p.name}" (${p.id}) created${copied ? ` with this profile's ${copied}` : ''}`);
      await autopilot.refresh();
    }),
  );
  ipcMain.handle('profiles:rename', (_e, id: string, name: string) =>
    prof(async () => {
      profiles.rename(String(id), String(name ?? ''));
      await autopilot.refresh();
    }),
  );
  ipcMain.handle('profiles:delete', (_e, id: string) =>
    prof(async () => {
      if (autopilot.running()) throw new Error('An autopilot run is going. Delete the profile when it has ended.');
      const name = profiles.find(String(id)).name;
      const dir = profiles.remove(String(id));
      // To the Recycle Bin, so a mistake can be undone.
      if (fs.existsSync(dir)) await shell.trashItem(dir).catch((e) => log('warn', `profile folder not moved to the Recycle Bin (${dir}): ${(e as Error).message}`));
      log('info', `profile "${name}" (${id}) deleted`);
      await autopilot.refresh();
    }),
  );
  ipcMain.handle('profiles:use', (_e, id: string) =>
    prof(async () => {
      // Multi-instance mode: every profile is its own window, so "open" starts it (or brings it up).
      if (instance.MULTI) {
        const p = profiles.find(String(id));
        if (p.id === profiles.activeId()) return void showMainWindow();
        instance.launch(p.id);
        log('info', `profile "${p.name}" ${p.running ? 'window shown' : 'opened in its own window'}`);
        return;
      }
      if (autopilot.running()) throw new Error('An autopilot run is going. Switch profiles when it has ended.');
      await profiles.use(String(id));
    }),
  );
  ipcMain.handle('profiles:multi', () => ({ saved: profiles.multiSaved(), running: instance.MULTI }));
  ipcMain.handle('profiles:background', (_e, id: string, on: boolean) =>
    prof(async () => {
      const p = profiles.setBackgroundFor(String(id), !!on);
      if (on && instance.MULTI && !p.running && !p.active) {
        instance.launch(p.id, true);
        log('info', `profile "${p.name}" started in the background`);
      }
    }),
  );
  ipcMain.handle('profiles:stop', (_e, id: string) =>
    prof(async () => {
      const p = profiles.find(String(id));
      if (!instance.MULTI) throw new Error('Only in multi-instance mode.');
      if (p.active) throw new Error('This is the window you are in: close it instead.');
      if (!p.running) return;
      instance.requestStop(p.id);
      log('info', `profile "${p.name}" asked to stop`);
      // It quits within a couple of seconds: wait so the list shows it stopped.
      for (let i = 0; i < 20 && instance.running().has(p.id); i++) await new Promise((r) => setTimeout(r, 250));
    }),
  );
  ipcMain.handle('profiles:startBackground', () =>
    prof(async () => {
      if (!instance.MULTI) throw new Error('Only in multi-instance mode.');
      startBackgroundProfiles();
    }),
  );
  ipcMain.handle('profiles:setMulti', (_e, on: boolean) =>
    prof(async () => {
      if (!on && instance.running().size > 1) throw new Error('Close the other profiles\' windows first.');
      profiles.setMulti(!!on);
      log('info', `multi-instance mode ${on ? 'on' : 'off'} (from the next start)`);
    }),
  );
  ipcMain.handle('app:restart', () => {
    // Multi-instance mode is read at start. Another profile's window restarts as Main's (the base app).
    app.relaunch({ args: process.argv.slice(1).filter((a) => !a.startsWith('--profile=') && !a.startsWith('--launched-by-agent')) });
    app.quit();
  });
  ipcMain.handle('profiles:autopilot', (_e, id: string, on: boolean) =>
    prof(async () => {
      profiles.setAutopilotFor(String(id), !!on);
      await autopilot.refresh();
    }),
  );
  // The example videos shipped with the app (Create > Examples).
  ipcMain.handle('app:examples', () => {
    const dir = app.isPackaged ? path.join(process.resourcesPath, 'resources', 'examples') : path.join(app.getAppPath(), 'resources', 'examples');
    const have = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)) : [];
    return { dir, have };
  });
  ipcMain.handle('app:openExternal', (_e, url: string) => (/^https?:\/\//i.test(url) ? shell.openExternal(url) : undefined));
  ipcMain.handle('app:showItemInFolder', (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.handle('app:openMediaFolder', wrapAsync((kind: string) => mediaFolders.open(kind === 'memes' ? 'memes' : 'backgrounds')));
  ipcMain.handle('app:openCampaignFolder', wrapAsync((title: string) => mediaFolders.open('campaigns', String(title ?? '') || 'Campaign')));
  ipcMain.handle('app:resolveYtChannel', wrapAsync((input: string) => resolveYtChannel(String(input ?? ''))));
  // Setup > Help: the logs in one zip for the user to send to Krypt (redacted, see logExport.ts).
  ipcMain.handle(
    'app:exportLogs',
    wrapAsync(async () => {
      const day = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '');
      const opts: Electron.SaveDialogOptions = {
        title: 'Export logs',
        defaultPath: path.join(app.getPath('desktop'), `marketo-logs-${day}.zip`),
        filters: [{ name: 'Zip', extensions: ['zip'] }],
      };
      // A test copy can skip the save box (KRYPT_MARKETO_LOGS_TO), so the export can be checked without clicking.
      const to = instance.DEV ? process.env.KRYPT_MARKETO_LOGS_TO?.trim() : undefined;
      const r = to ? { canceled: false, filePath: to } : mainWindow ? await dialog.showSaveDialog(mainWindow, opts) : await dialog.showSaveDialog(opts);
      if (r.canceled || !r.filePath) return null;
      const info: string[] = [];
      const safe = (label: string, fn: () => string | string[]): void => {
        try {
          const v = fn();
          info.push(...(Array.isArray(v) ? v : [v]).map((x) => `${label}: ${x}`));
        } catch (e) {
          info.push(`${label}: (could not read: ${(e as Error).message})`);
        }
      };
      safe('Window', () => (instance.INSTANCE ? `profile ${instance.INSTANCE} in its own window` : 'main window'));
      safe('Profiles', () => `${profiles.list().map((p) => `${p.name}${p.active ? ' (open)' : ''}${p.autopilot ? ' [autopilot]' : ''}${p.running ? ' [window open]' : ''}`).join(', ')}; each in its own window: ${instance.MULTI ? 'on' : 'off'}`);
      safe('Account', () =>
        store.get().igAccounts.map((a) => {
          const nets = Object.entries(a as unknown as Record<string, unknown>)
            .filter(([k, v]) => v && typeof v === 'object' && 'handle' in (v as object))
            .map(([k]) => k);
          return `@${a.handle.replace(/^@+/, "")} in ${a.browser ?? 'hub'}${a.chromeDir ? ` (Chrome ${a.chromeDir})` : ''}${nets.length ? `, also ${nets.join(', ')}` : ''}`;
        }),
      );
      safe('Proxy', () => {
        const p = proxy.active();
        return p ? `on (${p.scheme}), sticky IP ${p.ip ? 'set' : 'not set'}${p.error ? `, error: ${p.error}` : ''}` : 'off';
      });
      safe('Chrome', () => {
        const c = chromeBridge.status();
        return [
          `helper ${c.registered ? 'registered' : 'not registered'}${c.error ? ` (${c.error})` : ''}, extension shipped ${c.extensionVersion ?? '?'}`,
          ...c.profiles.map((x) => `connected ${x.dir ?? '(unknown profile)'}: extension ${x.version ?? '?'}, signed in: ${Object.entries(x.nets ?? {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'none'}${x.stopped ? ', paused' : ''}`),
        ];
      });
      try {
        const a = await autopilot.status();
        info.push(`Autopilot: ${a.on ? 'on' : 'off'}, AI ${a.ai}, task ${a.task.registered ? `registered (${a.task.state ?? '?'}, next ${a.task.nextRun ?? '?'}, last ${a.task.lastRun ?? '?'} result ${a.task.lastResult ?? '?'})` : 'not registered'}${a.running ? ', running now' : ''}`);
        info.push(`AI apps: ${a.ais.map((x) => `${x.name} ${x.found ? 'found' : 'not found'}`).join(', ')}`);
      } catch (e) {
        info.push(`Autopilot: (could not read: ${(e as Error).message})`);
      }
      const out = exportLogs(r.filePath.toLowerCase().endsWith('.zip') ? r.filePath : `${r.filePath}.zip`, info);
      log('info', `logs exported (${out.files} files, ${Math.round(out.bytes / 1024)} KB)`);
      shell.showItemInFolder(out.file);
      return out;
    }),
  );
  ipcMain.handle('app:copyText', (_e, t: string) => clipboard.writeText(String(t)));
  ipcMain.handle('app:pickDirectory', async () => {
    const r = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return r.canceled ? null : r.filePaths[0];
  });
  ipcMain.handle('app:pickFile', async (_e, kind: 'video' | 'audio' | 'image') => {
    const ext = { video: ['mp4', 'mov', 'webm', 'mkv', 'm4v'], audio: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'], image: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }[kind];
    const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: kind, extensions: ext }] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle('db:get', () => store.get());
  ipcMain.handle('db:createReel', wrap((preset: string, title?: string, format?: string) => store.createReel(preset, title, {}, format).reel));
  ipcMain.handle('db:deleteLearning', wrap((id: string) => void store.deleteLearning(id)));
  ipcMain.handle('db:reelFeedback', wrap((id: string, patch: Parameters<typeof store.setFeedback>[1]) => store.setFeedback(String(id), patch ?? {})));
  ipcMain.handle('db:addTrainingNote', wrap((n: Parameters<typeof store.addTrainingNote>[0]) => store.addTrainingNote(n)));
  ipcMain.handle('db:deleteTrainingNote', wrap((id: string) => void store.deleteTrainingNote(String(id))));
  ipcMain.handle('db:setTrainingTopic', wrap((t: Parameters<typeof store.setTrainingTopic>[0]) => void store.setTrainingTopic(t)));
  ipcMain.handle('db:askBrief', wrap(() => void store.askBrief()));
  ipcMain.handle('db:updateReel', wrap((id: string, patch: Partial<Reel>) => store.updateReel(id, patch).reel));
  ipcMain.handle(
    'db:markPosted',
    wrap((id: string, site: Site, url: string) => {
      const r = store.findReel(String(id));
      const s: Site = SITES.includes(site) ? site : 'instagram';
      // A link pasted again (fixed) keeps its first time; a new one is now.
      const at = linkOn(r, s)?.at ?? new Date().toISOString();
      return store.markPosted(r.id, s, String(url).trim(), at, r.postedBy ?? store.get().settings.handle).reel;
    }),
  );
  ipcMain.handle('db:saveCampaign', wrap((input: Parameters<typeof store.saveCampaign>[0]) => store.saveCampaign(input ?? {})));
  ipcMain.handle('db:deleteCampaign', wrap((id: string) => store.deleteCampaign(String(id))));
  ipcMain.handle('db:setCampaignBanner', wrapAsync((id: string, source: string) => setBanner(String(id), String(source ?? ''))));
  ipcMain.handle('db:setSubmission', wrap((id: string, status: SubmissionStatus) => void store.updateSubmission(String(id), { status })));
  ipcMain.handle('db:duplicateReel', wrap((id: string) => store.duplicateReel(id)));
  ipcMain.handle('db:deleteLongVideo', wrap((id: string) => store.deleteLongVideo(String(id))));
  ipcMain.handle('db:deleteReel', wrapAsync(async (id: string) => void (await reelFiles.removeReels([String(id)], false))));
  ipcMain.handle('db:deleteReels', wrapAsync((ids: string[], trashFiles: boolean) => reelFiles.removeReels(Array.isArray(ids) ? ids : [], trashFiles === true)));
  ipcMain.handle('db:setNextRun', wrap((text: string) => store.setNextRun(String(text ?? ''))));
  ipcMain.handle('db:saveStyle', wrap((input: StyleInput) => store.saveStyle(input ?? ({} as StyleInput))));
  ipcMain.handle('db:deleteStyle', wrap((id: string) => store.deleteStyle(String(id))));
  ipcMain.handle('db:queueRun', wrap((text: string) => store.queueRun(String(text ?? ''))));
  ipcMain.handle('db:unqueueRun', wrap((id: string) => store.unqueueRun(String(id))));
  ipcMain.handle('db:moveQueued', wrap((id: string, by: number) => store.moveQueued(String(id), by < 0 ? -1 : 1)));
  ipcMain.handle('db:queueIdea', wrap((id: string) => store.queueIdea(String(id))));
  ipcMain.handle('db:dropIdea', wrap((id: string) => store.dropIdea(String(id))));
  ipcMain.handle(
    'db:updateSettings',
    wrap((all: Partial<Settings>) => {
      // The proxy is saved through proxy:save only (it checks the settings and keeps the password out of the db).
      const { proxy: _proxy, ...patch } = all ?? {};
      const s = store.updateSettings(patch);
      if ('mute' in patch || 'autoMute' in patch) applyMute();
      return s;
    }),
  );
  ipcMain.handle('db:deleteReference', wrap((id: string) => void store.deleteReference(id)));
  ipcMain.handle('db:saveAccount', wrap((a: AccountInput) => store.saveAccount(a)));
  ipcMain.handle('db:addYtChannel', wrapAsync((from: string, link: string) => browser.addYtChannel(String(from), String(link ?? ''))));
  ipcMain.handle('db:deleteAccount', wrapAsync(async (id: string) => {
    store.deleteAccount(id);
    browser.forget(id);
  }));
  ipcMain.handle('brand:save', wrap((patch: Partial<Brand>) => store.saveBrand(patch)));

  ipcMain.handle('browser:status', () => browser.statusAll());
  const siteArg = (s?: Site): Site | undefined => (s && (SITES as string[]).includes(s) ? s : undefined);
  ipcMain.handle('browser:open', wrapAsync((id: string, url?: string, site?: Site) => browser.openForUser(id, url, siteArg(site))));
  ipcMain.handle('browser:close', wrap((id: string, site?: Site) => browser.closeTab(id, siteArg(site))));
  ipcMain.handle('browser:ytChannels', wrapAsync((id: string) => browser.listYtChannels(String(id))));

  // The profile's proxy (Multi run page). Saving lets go of the Chrome tabs, so they take the new settings before the next page.
  // Any profile's, from any window: the window that runs it takes the change up before its next page.
  ipcMain.handle('proxy:list', () => proxy.list());
  ipcMain.handle('proxy:chromeRows', () => proxy.chromeRows());
  ipcMain.handle(
    'proxy:save',
    wrapAsync(async (id: string, input: ProxyInput) => {
      const st = await proxy.save(String(id), input ?? ({} as ProxyInput));
      if (profiles.find(String(id).split('::')[0]).id === profiles.activeId() && !autopilot.running()) browser.closeRunTabs();
      return st;
    }),
  );
  ipcMain.handle('proxy:check', wrapAsync((id: string) => proxy.checkNow(String(id))));
  ipcMain.handle('proxy:acceptIp', wrap((id: string) => proxy.acceptIp(String(id))));

  ipcMain.handle('chrome:status', () => chromeBridge.status());
  ipcMain.handle('chrome:open', wrap((dir: string) => chromeBridge.openProfile(String(dir))));
  ipcMain.handle('chrome:scan', wrapAsync((dir: string) => browser.scanChromeProfile(String(dir ?? ''))));
  autopilot.init({
    dev: !!dataOverride,
    log: (m) => log('info', m),
    // Runs pinned to one profile's window (multi-instance mode) start this app's MCP bridge with --profile.
    bridge: () => {
      const st = mcpHandle?.status();
      if (st?.shimPath && st.exePath) return { exe: st.exePath, shim: st.shimPath };
      try {
        const j = JSON.parse(fs.readFileSync(path.join(instance.ROOT, 'mcp.json'), 'utf8')) as { shimPath?: string };
        return j.shimPath ? { exe: process.execPath, shim: j.shimPath } : null;
      } catch {
        return null;
      }
    },
    onTick: (running) => {
      perf.keepAwake(running);
      quitAfterOwnRun();
      // Clean-ups the user switched on (Setup > Performance), looked at once an hour: old run reports, old activity
      // detail, rendered files of reels long posted.
      if (Date.now() - lastPrune > 3_600_000) {
        lastPrune = Date.now();
        const v = perf.values();
        if (v.runLogDays > 0) {
          const n = autopilot.pruneReports(v.runLogDays);
          if (n) log('info', `performance: removed ${n} run report file(s) older than ${v.runLogDays} days`);
        }
        if (v.keepActivityDays > 0 && !running) {
          try {
            const n = store.archiveActivity(v.keepActivityDays);
            if (n) log('info', `performance: moved the detail of ${n} session(s) older than ${Math.max(30, v.keepActivityDays)} days to the activity archive`);
          } catch (e) {
            log('warn', `performance: activity archive failed: ${(e as Error).message}`);
          }
        }
        if (v.cleanupDays > 0 && !running)
          void reelFiles
            .cleanupRenders(v.cleanupDays)
            .then((r) => r.files && log('info', `performance: ${r.files} rendered file(s) of ${r.reels} reel(s) posted over ${v.cleanupDays} days ago went to the Recycle Bin`))
            .catch((e: Error) => log('warn', `performance: clean-up failed: ${e.message}`));
      }
    },
    onRunEnd: () => {
      const n = browser.closeRunTabs();
      log('info', `autopilot run ended: closed ${n} tab(s) it left open`);
      // The note the run was given on the Next run page is used now.
      store.settleNextRun(autopilot.reportRunning);
      // A run that opened another profile leaves the hub where the user had it.
      const back = returnTo;
      returnTo = null;
      if (back && back !== profiles.activeId() && profiles.list().some((p) => p.id === back)) void switchProfile(back).catch((e) => log('warn', `could not go back to the profile that was open: ${(e as Error).message}`));
    },
  });
  const apRun = async (f: () => Promise<unknown>): Promise<{ ok: boolean; data?: unknown; message?: string }> => {
    try {
      return { ok: true, data: await f() };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  };
  ipcMain.handle('perf:get', () => perf.get());
  ipcMain.handle('perf:set', async (_e, patch: unknown) => {
    const before = perf.values();
    const next = perf.set(cleanPerf(patch));
    const after = perf.values();
    // AI runs at once and the staggered start live in the scheduled run's script (and its time limit): rewrite it.
    if (before.aiAtOnce !== after.aiAtOnce || before.staggerMin !== after.staggerMin) await autopilot.refresh();
    return next;
  });
  ipcMain.handle('perf:readout', () => {
    const d = store.get();
    return perf.readout({ dbFile: store.dbPath(), saveMs: store.saveTime(), sessions: d.sessions.length, reels: d.reels.length, accounts: d.igAccounts.length, chromeProfiles: chromeBridge.connections().length, tabs: browser.openTabCount() });
  });
  ipcMain.handle('perf:measure', () => perf.measureProcesses());
  ipcMain.handle('perf:rendering', (_e, on: boolean) => perf.rendering(!!on, mainWindow));
  ipcMain.handle('perf:renderTurn', () => perf.renderTurn(profiles.active().name));
  ipcMain.handle('perf:renderDone', () => perf.renderDone());
  ipcMain.handle('autopilot:status', () => autopilot.status());
  ipcMain.handle('autopilot:enable', (_e, input: { ai: 'claude' | 'codex'; times: string[]; model?: string }) => apRun(() => autopilot.enable({ ai: input.ai, times: input.times, model: typeof input.model === 'string' ? input.model : undefined })));
  ipcMain.handle('autopilot:setModel', (_e, model: string) => apRun(() => autopilot.setModel(String(model ?? ''))));
  ipcMain.handle('autopilot:setSaver', (_e, on: boolean) => apRun(() => autopilot.setSaver(on === true)));
  ipcMain.handle('autopilot:setExtraRuns', (_e, n: number) => apRun(() => autopilot.setExtraRuns(Number(n))));
  ipcMain.handle('autopilot:setTier', (_e, tier: string) => apRun(() => autopilot.setTier(String(tier) as UsageTier)));
  ipcMain.handle('autopilot:disable', () => apRun(() => autopilot.disable()));
  ipcMain.handle('autopilot:runNow', () => apRun(() => autopilot.runNow()));
  ipcMain.handle('autopilot:openFolder', () => void shell.openPath(autopilot.openFolder()));

  ipcMain.handle('refs:add', wrapAsync((input: RefVideoInput) => refs.add(profiles.dir(), input)));
  ipcMain.handle('refs:update', wrap((id: string, patch: { name?: string; notes?: string }) => store.updateRefVideo(String(id), patch ?? {})));
  ipcMain.handle('refs:delete', wrapAsync((id: string) => refs.remove(profiles.dir(), String(id))));

  ipcMain.handle('approvals:list', () => approvals.all());
  ipcMain.handle('approvals:answer', (_e, id: string, approve: boolean) => approvals.answer(String(id), !!approve));

  ipcMain.handle('kip:state', () => kip.refresh());
  ipcMain.handle('kip:send', (_e, text: string) => void kip.send(String(text ?? '')));
  ipcMain.handle('kip:stop', () => kip.stop());
  ipcMain.handle('kip:reset', () => kip.reset());
  ipcMain.handle('agent:state', () => agent.state());
  ipcMain.handle('agent:saveConfig', (_e, patch: Partial<AgentConfig>, apiKey?: string) => agent.saveConfig(patch ?? {}, apiKey));
  ipcMain.handle('agent:models', () => agent.models());
  ipcMain.handle('agent:send', (_e, text: string) => void agent.send(String(text ?? '')));
  ipcMain.handle('agent:stop', () => agent.stop());
  ipcMain.handle('agent:reset', () => agent.reset());
  ipcMain.handle('research:docs', () => research.listDocs());
  ipcMain.handle('research:deleteNote', wrap((file: string) => research.deleteNote(String(file ?? ''))));
  ipcMain.handle('voice:model', () => voice.model());
  ipcMain.handle('voice:status', () => voice.status());
  ipcMain.handle('voice:install', () => void voice.install());
  ipcMain.handle('whisper:status', () => whisper.status());
  ipcMain.handle('whisper:install', () => void whisper.install());
  ipcMain.handle('voice:find', (_e, name: string) => voice.exists(name));
  ipcMain.handle('eleven:status', (_e, refresh?: boolean) => eleven.status(!!refresh));
  ipcMain.handle('eleven:setKey', wrapAsync((key: string) => eleven.setKey(String(key ?? ''))));
  ipcMain.handle('eleven:voices', wrapAsync(() => eleven.voices()));
  ipcMain.handle('eleven:addVoice', wrapAsync((input: string, name?: string, owner?: string) => eleven.addLibraryVoice(String(input ?? ''), String(name ?? ''), String(owner ?? ''))));
  ipcMain.handle('eleven:library', wrapAsync((sort: LibrarySort, useCase?: string) => eleven.libraryVoices(sort, String(useCase ?? ''))));
  ipcMain.handle('app:toolClips', () => ({ dir: screen.toolsDir(), have: screen.toolClips() }));
  ipcMain.handle('screen:sources', wrapAsync(() => screen.sources()));
  ipcMain.handle('screen:launch', wrapAsync((target: string) => screen.launch(String(target ?? ''))));
  ipcMain.handle('screen:save', wrap((bytes: Uint8Array, name: string) => screen.save(bytes, String(name ?? ''))));
  ipcMain.handle(
    'clips:fetch',
    wrapAsync((url: string, span?: { start?: unknown; seconds?: unknown }) => {
      const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
      return clips.fetchClip(String(url ?? ''), { start: num(span?.start), seconds: num(span?.seconds) });
    }),
  );
  ipcMain.handle('clips:save', wrap((bytes: Uint8Array, name: string) => clips.save(bytes, String(name ?? ''))));
  ipcMain.handle('clips:check', wrap((url: string, seconds: number, said: string) => clips.checkSaved(String(url ?? ''), Number(seconds) || 0, String(said ?? ''))));
  ipcMain.handle('eleven:tts', wrapAsync((req: Parameters<typeof eleven.tts>[0]) => eleven.tts(req)));
  ipcMain.handle('voice:saveVoice', wrap((v: VoiceTune & { name: string; id?: string }) => store.saveVoice(v)));
  ipcMain.handle('voice:deleteVoice', wrap((id: string) => void store.deleteVoice(String(id))));
  ipcMain.handle('voice:save', async (_e, name: string, data: Uint8Array) => {
    try {
      return { ok: true, data: await voice.save(name, data) };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });

  // One frame as a PNG (image posts): "<title> <id> 3.2s square.png".
  ipcMain.handle('render:saveLongFile', async (_e, id: string, name: string, data: Uint8Array, section?: number) => {
    try {
      const v = store.findLongVideo(id);
      const dir = longVideo.dirOf(v);
      await fs.promises.mkdir(dir, { recursive: true });
      const ext = path.extname(String(name));
      const file = path.join(dir, safeName(path.basename(String(name), ext)) + ext);
      await fs.promises.writeFile(file, Buffer.from(data));
      if (typeof section === 'number' && v.sections[section]) {
        const sections = v.sections.map((s, i) => (i === section ? { ...s, kipVideo: file } : s));
        store.saveLongVideo({ id: v.id, sections });
      }
      return { ok: true, data: file };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
  ipcMain.handle('render:saveLongThumb', async (_e, id: string, png: string) => {
    try {
      const v = store.findLongVideo(id);
      const dir = longVideo.dirOf(v);
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'thumbnail.png');
      await fs.promises.writeFile(file, Buffer.from(String(png), 'base64'));
      store.saveLongVideo({ id: v.id, thumbnailPath: file });
      log('info', `saved long video thumbnail ${v.id} → ${file}`);
      return { ok: true, data: file };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
  ipcMain.handle('render:saveImage', async (_e, reelId: string, png: string, t: number, shape?: 'vertical' | 'square') => {
    try {
      const reel = store.findReel(reelId);
      const dir = store.get().settings.outputDir;
      await fs.promises.mkdir(dir, { recursive: true });
      const file = path.join(dir, `${safeName(reel.title)} ${reel.id.slice(5)} ${Number(t).toFixed(1)}s${shape === 'vertical' ? '' : ' square'}.png`);
      await fs.promises.writeFile(file, Buffer.from(String(png), 'base64'));
      log('info', `saved frame ${reel.id}@${t}s → ${file}`);
      return { ok: true, data: file };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });

  // A finished render: written next to the others as "<title> <id>.mp4".
  ipcMain.handle('render:save', async (_e, reelId: string, data: Uint8Array, seconds: number, shape?: 'vertical' | 'square') => {
    try {
      const reel = store.findReel(reelId);
      const dir = store.get().settings.outputDir;
      await fs.promises.mkdir(dir, { recursive: true });
      const square = shape === 'square';
      const file = path.join(dir, `${safeName(reel.title)} ${reel.id.slice(5)}${square ? ' square' : ''}.mp4`);
      const tmp = `${file}.part`;
      await fs.promises.writeFile(tmp, data);
      await fs.promises.rename(tmp, file);
      if (square) store.markSquare(reelId, file);
      else store.markRendered(reelId, file, seconds);
      log('info', `rendered ${reel.id} → ${file} (${(data.byteLength / 1e6).toFixed(1)} MB)`);
      return { ok: true, data: file };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  });
}

// ── Sound: the sidebar's mute button, and auto mute while no Marketo window is in front ──
let soundOff = false;
function applyMute(): void {
  const s = store.get().settings;
  soundOff = !!s.mute || (!!s.autoMute && !BrowserWindow.getFocusedWindow());
  for (const w of webContents.getAllWebContents()) if (!w.isDestroyed() && w.isAudioMuted() !== soundOff) w.setAudioMuted(soundOff);
  chromeBridge.setMuted(soundOff);
}

/** Multi-instance mode: start every profile set to run in the background that is not running yet. */
function startBackgroundProfiles(): void {
  for (const p of profiles.list()) {
    if (!p.background || p.running || p.active) continue;
    instance.launch(p.id, true);
    log('info', `profile "${p.name}" started in the background`);
  }
}

async function bootstrap(): Promise<void> {
  lockWindows();
  profiles.init(instance.ROOT, instance.MULTI ? instance.OWN : null);
  profiles.setSwitcher(switchProfile);
  store.init(profiles.dir(), outputDirFor(profiles.active()));
  // Every window Marketo opens (the hub, its Instagram / YouTube / ... windows) follows the mute.
  app.on('web-contents-created', (_e, wc) => wc.setAudioMuted(soundOff));
  app.on('browser-window-focus', () => applyMute());
  // Focus can move from one Marketo window to another: look once it has settled.
  app.on('browser-window-blur', () => setTimeout(applyMute, 150));
  applyMute();
  media.installHandler();
  registerIpc();
  store.onChange(pushDb);
  perf.init();
  store.setBatchSave(perf.values().batchSaveSec);
  perf.onChange((p) => {
    store.setBatchSave(perf.values().batchSaveSec);
    send('perf:changed', p);
  });

  // Saved keys and proxy passwords: OS-encrypted, read once here (Electron's async safeStorage).
  await secret.init();
  await Promise.all([agent.loadKey(), eleven.loadKey()]);
  proxy.init(log);
  browser.init({ onStatus: (st) => send('browser:status', st), log });
  // Discord Rich Presence (krypt.cc), always on like the other Krypt apps; quietly waits when Discord isn't open.
  // One Discord status for the app: in multi-instance mode the base app (Main) shows it, not every window.
  if (!instance.INSTANCE) startDiscordPresence((l, m) => log(l, m));
  app.on('will-quit', stopDiscordPresence);
  eleven.init({ log: (l, m) => log(l, m) });
  // The Chrome extension: accounts that live in the user's own Chrome.
  const resource = (...p: string[]): string => (app.isPackaged ? path.join(process.resourcesPath, 'resources', ...p) : path.join(app.getAppPath(), 'resources', ...p));
  const hostScript = resource('mcp', 'marketo-chrome-host.cjs');
  const extensionDir = resource('extension');
  void chromeBridge
    .start({
      userData: app.getPath('userData'),
      dev: !!dataOverride,
      pipeSuffix: instance.INSTANCE ? `-p-${instance.INSTANCE}` : '',
      // Chrome's entry for the helper points at the base app's files; another profile's window only listens.
      register: !instance.INSTANCE,
      onListening: (pipe, token) => {
        instance.publish({ chromePipe: pipe, chromeToken: token, chromeDirs: chromeDirsNow() });
      },
      exePath: process.execPath,
      hostScript: fs.existsSync(hostScript) ? hostScript : null,
      extensionDir: fs.existsSync(path.join(extensionDir, 'manifest.json')) ? extensionDir : null,
      log,
      onEvent: browser.onChromeEvent,
      onStatus: (st) => send('chrome:status', st),
    })
    .catch((e) => log('error', `Chrome bridge failed to start: ${(e as Error).message}`));
  approvals.onChange((list) => send('approvals:changed', list));
  approvals.onRequest((a) => {
    // The user has to see it: bring the hub up without taking the keyboard.
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : showMainWindow();
    if (win.isMinimized()) win.restore();
    if (!win.isVisible()) win.showInactive();
    if (!win.isFocused()) win.flashFrame(true);
    if (Notification.isSupported()) {
      const n = new Notification({ title: `Approve on Instagram? (${a.handle})`, body: `${a.action}${a.text ? `: ${a.text.slice(0, 120)}` : ''}` });
      n.on('click', () => showMainWindow());
      n.show();
    }
  });
  voice.onStatus((st) => send('voice:status', st));
  whisper.onStatus((st) => send('whisper:status', st));
  // Narration clips nothing points at any more (old lines, clips made just to listen).
  setTimeout(() => void reelFiles.pruneVoice().then((n) => n && log('info', `cleared ${n} unused voice clips`)), 20_000);
  agent.init({ mcp: () => mcpHandle, onState: (st) => send('agent:state', st), log });
  kip.init({
    dir: () => path.join(app.getPath('userData'), 'kip'),
    claude: () => autopilot.findClaude(),
    bridge: () => {
      const st = mcpHandle?.status();
      // This hub's own connection file: a second copy on its own data (KRYPT_MARKETO_DATA) must not reach the real hub.
      return st?.shimPath && st.exePath ? { exe: st.exePath, shim: st.shimPath, config: path.join(app.getPath('userData'), 'mcp.json') } : null;
    },
    model: () => autopilot.claudeModel(),
    runGoing: () => autopilot.running(),
    onState: (st) => send('kip:state', st),
    log,
  });

  // The instructions AIs get are built from the brand profile; accounts decide the browser status list.
  // (The user's own styles are part of those instructions too.)
  let brandSig = JSON.stringify([store.get().brand, store.get().customStyles ?? []]);
  let acctSig = '';
  store.onChange((d) => {
    const b = JSON.stringify([d.brand, d.customStyles ?? []]);
    if (b !== brandSig) {
      brandSig = b;
      mcpHandle?.refreshManifest();
    }
    const a = d.igAccounts.map((x) => `${x.id}:${x.handle}:${x.browser ?? ''}:${x.chromeDir ?? ''}:${x.igUserId ?? ''}:${x.youtube?.enabled ? 'yt' : ''}:${x.youtube?.channelId ?? ''}:${x.x?.enabled ? 'x' : ''}:${x.x?.handle ?? ''}:${x.tiktok?.enabled ? 'tt' : ''}:${x.tiktok?.handle ?? ''}:${['facebook', 'threads', 'pinterest'].map((n) => { const p = x[n as 'facebook']; return p?.enabled ? `${n}=${p.handle ?? ''}` : ''; }).join('/')}`).join(',');
    if (a !== acctSig) {
      acctSig = a;
      instance.publish({ chromeDirs: chromeDirsNow() });
      void browser.statusAll().then((st) => send('browser:status', st));
    }
  });

  showMainWindow();
  void startAgentHost({
    pipeSuffix: instance.pipeSuffix,
    getMainWindow: () => {
      // The window is about to get work: it must see the latest db first.
      lastWork = Date.now();
      flushDb();
      return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    },
    showMainWindow,
    focus: (f: UiFocus) => send('ui:focus', f),
    isEnabled: () => store.get().settings.agentAccess !== false,
    setEnabled: (on) => store.updateSettings({ agentAccess: on }),
    log,
  }).then((h) => {
    mcpHandle = h;
  });
  instance.publish({ chromeDirs: chromeDirsNow() });
  app.on('will-quit', () => instance.unpublish());
  instance.watchStop(() => {
    log('info', 'asked to stop from another window');
    app.quit();
  });
  // Main opening starts the profiles set to run in the background.
  // Setup > Performance, background profiles only for their run: they are not all started with Main; each run's
  // AI connection starts its profile's window, and that window closes after its run.
  if (instance.MULTI && !instance.INSTANCE && !perf.values().bgOnDemand) setTimeout(startBackgroundProfiles, 3000);
  log('info', `Krypt Marketo ${shortVersion(app.getVersion())} ready (profile "${profiles.active().name}"${instance.MULTI ? ', in its own window' : ''}, db ${store.dbPath()})`);
  startUpdateCheck(log);
}

/** The Chrome profiles this profile's accounts are set to: the Chrome helper sends those to this window. */
function chromeDirsNow(): string[] {
  return [...new Set(store.get().igAccounts.filter((a) => a.browser === 'chrome' && a.chromeDir).map((a) => a.chromeDir!))];
}

app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) => log('error', `uncaughtException: ${err?.stack ?? err}`));
process.on('unhandledRejection', (reason) => log('error', `unhandledRejection: ${String(reason)}`));
