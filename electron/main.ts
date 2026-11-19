import type { UsageTier } from '../shared/aiUsage';
import { app, BrowserWindow, clipboard, dialog, ipcMain, Notification, shell, webContents } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AccountInput, AgentConfig, Brand, LibrarySort, Reel, RefVideoInput, Settings, Site, StyleInput, UiFocus } from '../shared/types';
import * as media from './media';
import * as store from './store';
import * as browser from './browser';
import { startDiscordPresence, stopDiscordPresence } from './discord';
import * as chromeBridge from './chromeBridge';
import * as autopilot from './autopilot';
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
import type { VoiceTune } from '../shared/voice';
import { SITES } from '../shared/warmup';
import { startAgentHost } from './mcp/host';
import { shortVersion, startUpdateCheck, updateInfo } from './update';
import * as profiles from './profiles';
import type { ProfilesResult } from '../shared/types';
import { locked, lockWindows, startedForDebugging } from './lock';
import type { McpHandle } from './mcp/index';

// Krypt Marketo — the reel hub. One hub window, plus Instagram per account:
// its own window here, or a tab in the user's Chrome through the extension
// (electron/browser.ts, electron/chromeBridge.ts). Any AI drives it over MCP,
// or through the built-in chat. Fixed userData folder so the stdio bridge always finds mcp.json.
app.setName('Krypt Marketo');
// KRYPT_MARKETO_DATA points a second copy at its own folder (development and tests), leaving the real hub's data alone.
const dataOverride = process.env.KRYPT_MARKETO_DATA?.trim();
app.setPath('userData', dataOverride ? path.resolve(dataOverride) : path.join(app.getPath('appData'), 'Krypt Marketo'));

process.env.DIST = path.join(__dirname, '..', 'dist');

media.registerScheme();

const log = (level: 'info' | 'warn' | 'error', message: string): void => {
  const line = `${new Date().toISOString()} [${level}] ${message}\n`;
  if (level === 'error') console.error(line.trim());
  else console.log(line.trim());
  try {
    fs.appendFileSync(path.join(app.getPath('userData'), 'marketo.log'), line);
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
  app.on('second-instance', () => showMainWindow());
  app.whenReady().then(bootstrap);
}

function send(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function showMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
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
    title: 'Krypt Marketo',
    autoHideMenuBar: true,
    icon: path.join(app.getAppPath(), 'resources', process.platform === 'win32' ? 'krypt.ico' : 'krypt.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false, devTools: !locked },
    show: false,
  });
  win.once('ready-to-show', () => win.show());
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
  ipcMain.handle('profiles:create', (_e, name: string, copySettings: boolean) =>
    prof(async () => {
      const p = profiles.create(String(name ?? ''));
      store.seed(profiles.dir(p.id), outputDirFor(p), !!copySettings);
      log('info', `profile "${p.name}" (${p.id}) created${copySettings ? ' with this profile\'s settings' : ''}`);
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
      // Its accounts' sign-ins in the built-in browser go with it (they are kept outside the profile's folder).
      try {
        const old = JSON.parse(fs.readFileSync(path.join(dir, 'marketo-db.json'), 'utf8')) as { igAccounts?: Array<{ id?: string }> };
        await browser.forgetSessions((old.igAccounts ?? []).map((a) => String(a.id ?? '')).filter(Boolean));
      } catch {
        /* never set up: nothing signed in */
      }
      // To the Recycle Bin, so a mistake can be undone.
      if (fs.existsSync(dir)) await shell.trashItem(dir).catch((e) => log('warn', `profile folder not moved to the Recycle Bin (${dir}): ${(e as Error).message}`));
      log('info', `profile "${name}" (${id}) deleted`);
      await autopilot.refresh();
    }),
  );
  ipcMain.handle('profiles:use', (_e, id: string) =>
    prof(async () => {
      if (autopilot.running()) throw new Error('An autopilot run is going. Switch profiles when it has ended.');
      await profiles.use(String(id));
    }),
  );
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
  ipcMain.handle('db:duplicateReel', wrap((id: string) => store.duplicateReel(id)));
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
    wrap((patch: Partial<Settings>) => {
      const s = store.updateSettings(patch);
      if ('mute' in patch || 'autoMute' in patch) applyMute();
      return s;
    }),
  );
  ipcMain.handle('db:deleteReference', wrap((id: string) => void store.deleteReference(id)));
  ipcMain.handle('db:saveAccount', wrap((a: AccountInput) => store.saveAccount(a)));
  ipcMain.handle('db:deleteAccount', wrapAsync(async (id: string) => {
    store.deleteAccount(id);
    await browser.clearSession(id);
  }));
  ipcMain.handle('brand:save', wrap((patch: Partial<Brand>) => store.saveBrand(patch)));

  ipcMain.handle('browser:status', () => browser.statusAll());
  const siteArg = (s?: Site): Site | undefined => (s && (SITES as string[]).includes(s) ? s : undefined);
  ipcMain.handle('browser:open', wrapAsync((id: string, url?: string, site?: Site) => browser.openForUser(id, url, siteArg(site))));
  ipcMain.handle('browser:close', wrap((id: string, site?: Site) => browser.closeTab(id, siteArg(site))));
  ipcMain.handle('browser:clear', wrapAsync((id: string) => browser.clearSession(id)));

  ipcMain.handle('chrome:status', () => chromeBridge.status());
  ipcMain.handle('chrome:open', wrap((dir: string) => chromeBridge.openProfile(String(dir))));
  autopilot.init({
    dev: !!dataOverride,
    log: (m) => log('info', m),
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
  ipcMain.handle('autopilot:status', () => autopilot.status());
  ipcMain.handle('autopilot:enable', (_e, input: { ai: 'claude' | 'codex'; times: string[]; model?: string }) => apRun(() => autopilot.enable({ ai: input.ai, times: input.times, model: typeof input.model === 'string' ? input.model : undefined })));
  ipcMain.handle('autopilot:setModel', (_e, model: string) => apRun(() => autopilot.setModel(String(model ?? ''))));
  ipcMain.handle('autopilot:setSaver', (_e, on: boolean) => apRun(() => autopilot.setSaver(on === true)));
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
  ipcMain.handle('clips:fetch', wrapAsync((url: string) => clips.fetchClip(String(url ?? ''))));
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

async function bootstrap(): Promise<void> {
  lockWindows();
  profiles.init(app.getPath('userData'));
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
  store.onChange((d) => send('db:changed', d));

  browser.init({ onStatus: (st) => send('browser:status', st), log });
  // Discord Rich Presence (krypt.cc), always on like the other Krypt apps; quietly waits when Discord isn't open.
  startDiscordPresence((l, m) => log(l, m));
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
      void browser.statusAll().then((st) => send('browser:status', st));
    }
  });

  showMainWindow();
  void startAgentHost({
    pipeSuffix: dataOverride ? '-dev' : '',
    getMainWindow: () => (mainWindow && !mainWindow.isDestroyed() ? mainWindow : null),
    showMainWindow,
    focus: (f: UiFocus) => send('ui:focus', f),
    isEnabled: () => store.get().settings.agentAccess !== false,
    setEnabled: (on) => store.updateSettings({ agentAccess: on }),
    log,
  }).then((h) => {
    mcpHandle = h;
  });
  log('info', `Krypt Marketo ${shortVersion(app.getVersion())} ready (profile "${profiles.active().name}", db ${store.dbPath()})`);
  startUpdateCheck(log);
}

app.on('window-all-closed', () => app.quit());
process.on('uncaughtException', (err) => log('error', `uncaughtException: ${err?.stack ?? err}`));
process.on('unhandledRejection', (reason) => log('error', `unhandledRejection: ${String(reason)}`));
