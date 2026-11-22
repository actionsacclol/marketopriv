// Performance settings (shared/perf.ts) for the whole machine: ROOT/performance.json, followed by every profile
// window. Plus the "What Marketo uses now" readout, measured only while Setup > Performance asks for it.
import { app, BrowserWindow, powerSaveBlocker, webContents, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';

type IntervalHistogram = ReturnType<typeof monitorEventLoopDelay>;
import { cleanPerf, perfOf, suggestedAtOnce, type PerfReadout, type PerfSettings, type ProcessReadout } from '../shared/perf';
import * as instance from './instance';

const FILE = (): string => path.join(instance.ROOT, 'performance.json');

let cached: PerfSettings = {};
let mtime = -1;
let checkedAt = 0;
const listeners = new Set<(p: PerfSettings) => void>();

function load(): void {
  try {
    const st = fs.statSync(FILE(), { throwIfNoEntry: false });
    const m = st?.mtimeMs ?? 0;
    if (m === mtime) return;
    mtime = m;
    cached = st ? cleanPerf(JSON.parse(fs.readFileSync(FILE(), 'utf8'))) : {};
    for (const l of listeners) l(cached);
  } catch {
    /* unreadable: keep what we had */
  }
}

/** The settings (another profile's window may have changed them: looked at again every 2 s at most). */
export function get(): PerfSettings {
  if (Date.now() - checkedAt > 2000) {
    checkedAt = Date.now();
    load();
  }
  return cached;
}
export const values = (): ReturnType<typeof perfOf> => perfOf(get());

export function set(patch: unknown): PerfSettings {
  const next = cleanPerf({ ...get(), ...cleanPerf(patch) });
  fs.mkdirSync(instance.ROOT, { recursive: true });
  const tmp = `${FILE()}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, FILE());
  checkedAt = 0;
  get();
  return cached;
}

export function onChange(cb: (p: PerfSettings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function init(): void {
  load();
  // Other profile windows write the same file: follow them.
  try {
    fs.watch(instance.ROOT, (_e, name) => {
      if (name === 'performance.json') {
        checkedAt = 0;
        get();
      }
    });
  } catch {
    /* the 2 s re-check covers it */
  }
}

// ── Keep awake while a run is going ─────────────────────────────────────────
let blocker: number | null = null;
export function keepAwake(running: boolean): void {
  const want = running && values().keepAwake;
  if (want && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
  else if (!want && blocker !== null) {
    powerSaveBlocker.stop(blocker);
    blocker = null;
  }
}

// ── Low-priority rendering ──────────────────────────────────────────────────
/** While a render runs: the hub's renderer and GPU processes at below-normal priority (Chrome is never touched). */
export function rendering(on: boolean, win: BrowserWindow | null): void {
  if (!values().lowPriorityRender && on) return;
  const prio = on ? os.constants.priority.PRIORITY_BELOW_NORMAL : os.constants.priority.PRIORITY_NORMAL;
  const pids = new Set<number>();
  try {
    const r = win && !win.isDestroyed() ? win.webContents.getOSProcessId() : 0;
    if (r) pids.add(r);
    for (const m of app.getAppMetrics()) if (m.type === 'GPU') pids.add(m.pid);
  } catch {
    /* window gone */
  }
  for (const pid of pids)
    try {
      os.setPriority(pid, prio);
    } catch {
      /* not allowed: leave it */
    }
}

// ── Readout ─────────────────────────────────────────────────────────────────
let lag: IntervalHistogram | null = null;
let lagStopAt = 0;
/** Main-thread delay is only measured while the readout is being looked at (and a minute after). */
function lagHistogram(): IntervalHistogram {
  if (!lag) {
    lag = monitorEventLoopDelay({ resolution: 20 });
    lag.enable();
    const t = setInterval(() => {
      if (Date.now() > lagStopAt && lag) {
        lag.disable();
        lag = null;
        clearInterval(t);
      }
    }, 10_000);
    t.unref?.();
  }
  lagStopAt = Date.now() + 60_000;
  return lag;
}

const mb = (b: number): number => Math.round(b / 1024 / 1024);
const sizeOf = (p: string): number => fs.statSync(p, { throwIfNoEntry: false })?.size ?? 0;

export function readout(extra: { dbFile: string; saveMs: number; sessions: number; reels: number; accounts: number; chromeProfiles: number; tabs: number }): PerfReadout {
  const h = lagHistogram();
  const groups = new Map<string, { mb: number; cpu: number; count: number }>();
  for (const m of app.getAppMetrics()) {
    const type = m.type === 'Tab' ? 'Window' : m.type === 'Browser' ? 'Main' : m.type;
    const g = groups.get(type) ?? { mb: 0, cpu: 0, count: 0 };
    // privateBytes is Windows-only; workingSetSize elsewhere. Both in KB.
    g.mb += (m.memory.privateBytes ?? m.memory.workingSetSize) / 1024;
    g.cpu += m.cpu.percentCPUUsage;
    g.count++;
    groups.set(type, g);
  }
  const hub = [...groups].map(([type, g]) => ({ type, mb: Math.round(g.mb), cpu: Math.round(g.cpu * 10) / 10, count: g.count })).sort((a, b) => b.mb - a.mb);
  const ramTotalGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  return {
    at: new Date().toISOString(),
    ramTotalGb,
    ramFreeGb: Math.round((os.freemem() / 1024 ** 3) * 10) / 10,
    cpus: os.cpus().length,
    cpuModel: os.cpus()[0]?.model?.trim() ?? '',
    hub,
    hubMb: hub.reduce((n, g) => n + g.mb, 0),
    // Above the quietest reading: the timer itself fires late by the OS's granularity (about 15 ms on Windows).
    lagP50: h.count ? Math.round((h.percentile(50) - h.min) / 1e6) : 0,
    lagP99: h.count ? Math.round((h.percentile(99) - h.min) / 1e6) : 0,
    dbMb: Math.round((sizeOf(extra.dbFile) / 1024 / 1024) * 10) / 10,
    lastSaveMs: extra.saveMs,
    logMb: mb(sizeOf(path.join(instance.ROOT, 'marketo.log'))),
    sessions: extra.sessions,
    reels: extra.reels,
    accounts: extra.accounts,
    chromeProfilesConnected: extra.chromeProfiles,
    marketoTabs: extra.tabs,
    suggestedAtOnce: suggestedAtOnce(ramTotalGb),
  };
}

/** Chrome and AI processes on this PC, read once from the process list (the button on the readout). */
export function measureProcesses(): Promise<ProcessReadout> {
  const empty: ProcessReadout = { chromeMb: 0, chromeCount: 0, helperCount: 0, aiMb: 0, aiCount: 0 };
  if (process.platform !== 'win32') return Promise.resolve(empty);
  const ps = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
  // Names and memory only: no command lines, paths or window titles.
  const script =
    "$p = Get-Process chrome,claude,codex -ErrorAction SilentlyContinue | Select-Object Name,@{n='m';e={$_.PrivateMemorySize64}}; " +
    "$h = @(Get-CimInstance Win32_Process -Filter \"Name='node.exe' or Name='electron.exe' or Name='Krypt Marketo.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*marketo-chrome-host*' }).Count; " +
    '@{ p = @($p); h = $h } | ConvertTo-Json -Compress -Depth 3';
  return new Promise((resolve) => {
    execFile(ps, ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, timeout: 20_000 }, (err, out) => {
      if (err) return resolve(empty);
      try {
        const j = JSON.parse(String(out)) as { p: Array<{ Name: string; m: number }>; h: number };
        const r = { ...empty, helperCount: Number(j.h) || 0 };
        for (const x of j.p ?? []) {
          if (/^chrome$/i.test(x.Name)) {
            r.chromeMb += mb(x.m);
            r.chromeCount++;
          } else {
            r.aiMb += mb(x.m);
            r.aiCount++;
          }
        }
        resolve(r);
      } catch {
        resolve(empty);
      }
    });
  });
}

// ── One render at a time across profiles ────────────────────────────────────
const RENDER_LOCK = (): string => path.join(instance.ROOT, 'render.lock');
/** A render longer than this is taken as stuck: its turn is given to the next one. */
const RENDER_STALE_MS = 45 * 60_000;

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

// The app's own page (not the hidden windows clips and proxy open on websites).
const ownUi = (u: string): boolean => /^file:/i.test(u) || (!!process.env.VITE_DEV_SERVER_URL && u.startsWith(process.env.VITE_DEV_SERVER_URL));
const watched = new WeakSet<WebContents>();
/** The render runs in this window's page: if that page crashes or reloads, the render is gone, so is its turn. */
function watchPages(): void {
  for (const wc of webContents.getAllWebContents()) {
    if (watched.has(wc) || !ownUi(wc.getURL())) continue;
    watched.add(wc);
    wc.on('render-process-gone', () => renderDone());
    wc.on('did-navigate', () => renderDone());
    wc.once('destroyed', () => renderDone());
  }
}

/** Setup > Performance, one render at a time: this window's render may start (true), or another profile's is going. */
export function renderTurn(who: string): { ok: boolean; holder?: string } {
  if (!values().oneRenderAtATime) return { ok: true };
  const f = RENDER_LOCK();
  for (let i = 0; i < 2; i++) {
    try {
      const fd = fs.openSync(f, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, who, at: Date.now() }));
      fs.closeSync(fd);
      watchPages();
      return { ok: true };
    } catch {
      try {
        const h = JSON.parse(fs.readFileSync(f, 'utf8')) as { pid: number; who: string; at: number };
        if (h.pid === process.pid) {
          watchPages();
          return { ok: true };
        }
        if (alive(h.pid) && Date.now() - h.at < RENDER_STALE_MS) return { ok: false, holder: h.who };
        fs.rmSync(f, { force: true });
      } catch {
        // Half-written by another window: wait for the next look. Still empty or broken after 10 s, it never
        // will be (that window was killed between creating and writing it): take it as stale.
        let old = false;
        try {
          old = Date.now() - fs.statSync(f).mtimeMs > 10_000;
        } catch {
          /* gone meanwhile: look again */
          continue;
        }
        if (!old) return { ok: false, holder: 'another profile' };
        try {
          fs.rmSync(f, { force: true });
        } catch {
          return { ok: false, holder: 'another profile' };
        }
      }
    }
  }
  return { ok: false, holder: 'another profile' };
}

/** This window's render ended: the next profile's may start. */
export function renderDone(): void {
  try {
    const h = JSON.parse(fs.readFileSync(RENDER_LOCK(), 'utf8')) as { pid: number };
    if (h.pid === process.pid) fs.rmSync(RENDER_LOCK(), { force: true });
  } catch {
    /* none held */
  }
}
