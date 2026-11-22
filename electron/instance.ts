// Multi-instance mode (Multi run page, "Each profile in its own window"; off by default, for people running many
// accounts). Off: one Marketo, one open profile at a time, exactly as before. On: each profile runs as its own
// Marketo (its own process and window, started with --profile=<id>), all at the same time. The base app is the
// "Main" profile.
//
// What each instance has to itself: Chromium's data (its own userData under the profile's folder, so the
// window's storage and the single-instance lock don't collide), its AI pipe and mcp.json,
// its Chrome pipe, Kip. Shared through ROOT (the data folder): the profile list, the keys, the autopilot schedule
// and reports, the voice models and the log.
//
// Chrome starts one helper per Chrome profile (resources/mcp/marketo-chrome-host.cjs). In this mode the helper
// reads instances.json and connects each Chrome profile to the instance whose accounts use it.

import { app } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const override = process.env.KRYPT_MARKETO_DATA?.trim();
/** The data folder: the Main profile's files and everything the profiles share. */
export const ROOT = override ? path.resolve(override) : path.join(app.getPath('appData'), 'Krypt Marketo');
/** A development / test copy on its own data (KRYPT_MARKETO_DATA). */
export const DEV = !!override;

function readProfiles(): { multiInstance?: unknown; list?: Array<{ id?: unknown; name?: unknown }> } | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'profiles.json'), 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

/** Multi-instance mode, as it was when this process started (a change takes a restart). */
export const MULTI = readProfiles()?.multiInstance === true;

const asked = process.argv.find((a) => a.startsWith('--profile='))?.slice('--profile='.length).trim() ?? '';
/** The profile this process is, when it is not the base app (Main): only in multi-instance mode. */
export const INSTANCE: string | null =
  MULTI && /^p_[a-z0-9]+$/.test(asked) && (readProfiles()?.list ?? []).some((p) => p?.id === asked) && fs.existsSync(path.join(ROOT, 'profiles', asked)) ? asked : null;

/**
 * Started in the background (--background): the profile runs (its AI connection, its autopilot; its accounts work in Chrome)
 * with no window on screen until the user opens it from another window's profile list.
 */
export const BACKGROUND = !!INSTANCE && process.argv.includes('--background');
let hidden = BACKGROUND;
/** No Marketo window of this profile is on screen. */
export const isHidden = (): boolean => hidden;
export function setHidden(h: boolean): void {
  if (h === hidden) return;
  hidden = h;
  publish({ visible: !h });
}

/** Chromium's folder for this process. */
export const userData = INSTANCE ? path.join(ROOT, 'profiles', INSTANCE, 'app') : ROOT;
/** Added to the pipe names, so every instance (and a test copy) has its own. */
export const pipeSuffix = `${DEV ? '-dev' : ''}${INSTANCE ? `-p-${INSTANCE}` : ''}`;
/** The id this process works on in multi-instance mode. */
export const OWN = INSTANCE ?? 'main';

/**
 * An instance shares the base app's encryption key, so what one saved with the OS's protection (the ElevenLabs and
 * chat keys, a proxy password) the others can read. Chromium keeps that key, itself locked to this Windows user, in
 * "Local State"; copied before the app is ready, Chromium takes it as its own. Cookies are not encrypted in this app
 * (the EnableCookieEncryption fuse is off), so sign-ins copied between folders keep working.
 */
export function shareKey(): void {
  if (!INSTANCE) return;
  try {
    const root = JSON.parse(fs.readFileSync(path.join(ROOT, 'Local State'), 'utf8')) as { os_crypt?: unknown };
    if (!root.os_crypt) return;
    const file = path.join(userData, 'Local State');
    let mine: Record<string, unknown> = {};
    try {
      mine = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    } catch {
      /* first start of this instance */
    }
    if (JSON.stringify(mine.os_crypt) === JSON.stringify(root.os_crypt)) return;
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...mine, os_crypt: root.os_crypt }));
  } catch {
    /* the base app never ran: nothing saved to share yet */
  }
}

// ── Which instances are running ─────────────────────────────────────────────
export interface InstanceEntry {
  id: string;
  pid: number;
  /** Its Chrome pipe and the token that opens it. */
  chromePipe?: string;
  chromeToken?: string;
  /** The Chrome profile folders its accounts are set to (Setup > Chrome profile). */
  chromeDirs: string[];
  startedAt: string;
  /** Its window is on screen (false = running in the background). */
  visible?: boolean;
}

const regFile = (): string => path.join(ROOT, 'instances.json');

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

function readReg(): InstanceEntry[] {
  try {
    const j = JSON.parse(fs.readFileSync(regFile(), 'utf8')) as { instances?: InstanceEntry[] };
    return (j.instances ?? []).filter((e) => e && typeof e.id === 'string' && typeof e.pid === 'number');
  } catch {
    return [];
  }
}

function writeReg(list: InstanceEntry[]): void {
  const tmp = `${regFile()}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify({ instances: list }, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, regFile());
}

let mine: InstanceEntry | null = null;

/** Put this process on the list (and keep its Chrome profiles current). Only in multi-instance mode. */
export function publish(patch: Partial<InstanceEntry>): void {
  if (!MULTI) return;
  mine = { id: OWN, pid: process.pid, chromeDirs: [], startedAt: new Date().toISOString(), visible: !hidden, ...mine, ...patch };
  try {
    writeReg([...readReg().filter((e) => e.id !== OWN && e.pid !== process.pid && alive(e.pid)), mine]);
  } catch {
    /* another instance is writing; the next change publishes again */
  }
}

export function unpublish(): void {
  if (!MULTI) return;
  try {
    writeReg(readReg().filter((e) => e.pid !== process.pid && alive(e.pid)));
  } catch {
    /* gone anyway once the pid is dead */
  }
}

/** The instances running now, by profile id. */
export function running(): Map<string, InstanceEntry> {
  const out = new Map<string, InstanceEntry>();
  if (!MULTI) return out;
  for (const e of readReg()) if (alive(e.pid)) out.set(e.id, e);
  return out;
}

/** Start a profile's instance (or bring its window up: a second start of the same profile hands over to the first). */
export function launch(id: string, background = false): void {
  const args = [...(app.isPackaged ? [] : [app.getAppPath()]), ...(id === 'main' ? [] : [`--profile=${id}`]), ...(background && id !== 'main' ? ['--background'] : [])];
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  spawn(process.execPath, args, { detached: true, stdio: 'ignore', env, windowsHide: false }).unref();
}

// ── Stopping another profile's instance ─────────────────────────────────────
// A file asks it to quit; each instance looks for its own every 2 s (and quits the normal way, saving everything).
const stopFile = (id: string): string => path.join(ROOT, `stop-${id}.flag`);

export function requestStop(id: string): void {
  fs.writeFileSync(stopFile(id), new Date().toISOString());
}

export function watchStop(quit: () => void): void {
  if (!MULTI) return;
  try {
    fs.rmSync(stopFile(OWN), { force: true }); // an old request from before this start
  } catch {
    /* fine */
  }
  setInterval(() => {
    if (!fs.existsSync(stopFile(OWN))) return;
    try {
      fs.rmSync(stopFile(OWN), { force: true });
    } catch {
      /* quit anyway */
    }
    quit();
  }, 2000).unref();
}

