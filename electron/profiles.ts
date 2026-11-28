import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AutopilotSettings, ProfileInfo } from '../shared/types';
import * as instance from './instance';
import { errCode, isHeld, readText, stripBom, writeAtomic } from './safeFile';

// Profiles: complete, separate sets of everything the hub keeps. Each has its own accounts and their socials, brand,
// reels, post log, sessions and limits, Training, learnings, playbook notes, reference videos, saved voices and
// settings. One is open at a time and everything (the pages, the AI's tools, an autopilot run) works on that one.
//
// The first profile ("main") is the data folder itself, so an install from before profiles carries on untouched.
// The others live in <userData>/profiles/<id>/. Shared by all of them: the AI connections, the Chrome extension,
// the ElevenLabs and chat keys, the voice model and the autopilot schedule (each profile says whether it takes part).

export const MAIN = 'main';

interface Entry {
  id: string;
  name: string;
  createdAt: string;
  /** Scheduled autopilot runs work on this profile too. */
  autopilot?: boolean;
  /** Multi-instance mode: runs in the background (no window) whenever Main is open or a run needs it. */
  background?: boolean;
  /** The Chrome profile it was made for (Multi run > Chrome profiles): its accounts start out in that one. */
  chromeDir?: string;
}

interface State {
  active: string;
  list: Entry[];
  autopilot?: AutopilotSettings;
  /** Each profile in its own window (instance.ts). Takes effect at the next start. */
  multiInstance?: boolean;
}

let root = '';
let state: State = { active: MAIN, list: [] };
let switcher: ((id: string) => Promise<void>) | null = null;
/** In multi-instance mode: the one profile this process works on (it never switches). */
let own: string | null = null;
let readAt = 0;
/** profiles.json was held by another program at this start: the list in memory is a stand-in until it reads. */
let unread = false;

const file = (): string => path.join(root, 'profiles.json');

function parse(raw: Partial<State>): State {
  const list = (raw.list ?? []).filter((p): p is Entry => !!p && typeof p.id === 'string' && typeof p.name === 'string' && /^[a-z0-9_]+$/.test(p.id));
  if (!list.some((p) => p.id === MAIN)) list.unshift({ id: MAIN, name: 'Main', createdAt: new Date().toISOString(), autopilot: true });
  return { active: list.some((p) => p.id === raw.active) ? raw.active! : MAIN, list, autopilot: raw.autopilot, ...(raw.multiInstance === false ? { multiInstance: false } : {}) };
}

/** The list as saved in that file (through a BOM and a short hold by another program). Throws when it cannot be read. */
function readState(f: string, wait = true): State {
  // Only a start waits out a hold: the frequent re-reads (fresh) keep the list they have and look again next time.
  const raw = JSON.parse(wait ? readText(f) : stripBom(fs.readFileSync(f, 'utf8'))) as unknown;
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Partial<State>).list)) throw new Error('not a profile list');
  return parse(raw as Partial<State>);
}

/** Take up changes another instance wrote (several processes share the list in multi-instance mode). */
function fresh(): void {
  if (!root) return;
  try {
    const m = fs.statSync(file()).mtimeMs;
    if (m === readAt) return;
    state = readState(file(), false);
    readAt = m;
    unread = false;
  } catch {
    /* mid-write: the last copy read stays */
  }
}

/** profiles.json did not read at this start: the .bak is not replaced with it (set back once a save goes in). */
let holdBak = false;

function save(): void {
  fs.mkdirSync(root, { recursive: true });
  // The list as it was, for a start that finds profiles.json unreadable.
  if (!holdBak)
    try {
      if (fs.existsSync(file())) fs.copyFileSync(file(), `${file()}.bak`);
    } catch {
      /* best effort */
    }
  writeAtomic(file(), `${JSON.stringify(state, null, 2)}\n`);
  holdBak = false;
  try {
    readAt = fs.statSync(file()).mtimeMs;
  } catch {
    /* read again next time */
  }
}

/** Every change re-reads the file first, so one instance never writes over another's. */
function change(fn: () => void): void {
  fresh();
  if (unread) throw new Error('The profile list is held by another program right now. Try again in a moment.');
  fn();
  save();
}

/** Read the profile list. A hub from before profiles becomes one profile, "Main", with its autopilot schedule carried over. */
export function init(userData: string, ownProfile: string | null = null): void {
  root = userData;
  own = ownProfile;
  unread = false;
  holdBak = false;
  let problem: unknown;
  try {
    state = readState(file());
    readAt = fs.statSync(file()).mtimeMs;
    if (own && !state.list.some((p) => p.id === own)) own = MAIN;
    return;
  } catch (e) {
    problem = e;
  }
  if (errCode(problem) !== 'ENOENT') {
    let bak: State | null = null;
    try {
      bak = readState(`${file()}.bak`);
    } catch {
      /* no usable copy */
    }
    if (isHeld(problem)) {
      // Held by another program even after waiting (an instance renaming it as it starts, an antivirus): work from the
      // copy for now and write nothing; the real list is taken up as soon as it reads (fresh), and changes wait for it.
      state = bak ?? rebuilt();
      readAt = 0;
      unread = true;
      return;
    }
    // Not a profile list (cut off by a power cut, a bad hand edit): keep it aside, then go on from the .bak.
    try {
      fs.copyFileSync(file(), `${file()}.corrupt-${Date.now()}`);
    } catch {
      /* nothing to keep */
    }
    holdBak = true;
    if (bak) {
      state = bak;
      save();
      return;
    }
  }
  // First start with profiles, or a list that is lost.
  state = rebuilt();
  save();
}

/** A list from what is on disk: Main (with the schedule a hub from before profiles kept) and every profile folder found. */
function rebuilt(): State {
  let autopilot: AutopilotSettings | undefined;
  try {
    autopilot = (JSON.parse(readText(path.join(root, 'marketo-db.json'))) as { settings?: { autopilot?: AutopilotSettings } }).settings?.autopilot;
  } catch {
    /* a fresh install */
  }
  const out: State = { active: MAIN, list: [{ id: MAIN, name: 'Main', createdAt: new Date().toISOString(), autopilot: true }], autopilot };
  // The list was lost or unreadable but profile folders are there: list them again rather than strand their data.
  try {
    for (const id of fs.readdirSync(path.join(root, 'profiles'))) {
      if (!/^p_[a-z0-9]+$/.test(id) || !fs.existsSync(path.join(root, 'profiles', id, 'marketo-db.json'))) continue;
      out.list.push({ id, name: `Recovered ${out.list.length}`, createdAt: new Date().toISOString(), autopilot: false });
    }
  } catch {
    /* no other profiles */
  }
  return out;
}

const entry = (key: string): Entry => {
  fresh();
  const k = key.trim().toLowerCase();
  const p = state.list.find((x) => x.id === k) ?? state.list.find((x) => x.name.toLowerCase() === k);
  if (!p) throw new Error(`No profile "${key}". Profiles: ${state.list.map((x) => `"${x.name}" (${x.id})`).join(', ')}.`);
  return p;
};

export const activeId = (): string => own ?? state.active;
export const active = (): Entry => entry(activeId());
export function count(): number {
  fresh();
  return state.list.length;
}
export function list(): ProfileInfo[] {
  fresh();
  const on = instance.running();
  return state.list.map((p) => {
    const run = on.get(p.id);
    return {
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      active: p.id === activeId(),
      autopilot: !!p.autopilot,
      ...(p.background && p.id !== MAIN ? { background: true } : {}),
      ...(p.chromeDir ? { chromeDir: p.chromeDir } : {}),
      ...(instance.MULTI ? { running: !!run, ...(run ? { visible: run.visible !== false } : {}) } : {}),
    };
  });
}

/** Multi-instance mode as saved (it takes effect at the next start). On unless the user switched it off. */
export function multiSaved(): boolean {
  fresh();
  return state.multiInstance !== false;
}
export function setMulti(on: boolean): void {
  change(() => {
    if (on) delete state.multiInstance;
    else state.multiInstance = false;
  });
}
/** The one profile this process works on, in multi-instance mode (null otherwise). */
export const ownProfile = (): string | null => own;
export const find = (key: string): ProfileInfo => list().find((p) => p.id === entry(key).id)!;

/** Where a profile keeps its files (the open one when no id is given). */
export const dir = (id: string = activeId()): string => (id === MAIN ? root : path.join(root, 'profiles', id));

function cleanName(name: string, except?: string): string {
  const n = name.replace(/[\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) throw new Error('A profile needs a name.');
  if (n.length > 40) throw new Error('Keep the profile name under 40 characters.');
  if (state.list.some((p) => p.id !== except && p.name.toLowerCase() === n.toLowerCase())) throw new Error(`There is already a profile called "${n}".`);
  return n;
}

export function create(name: string): ProfileInfo {
  // No hard limit (the user's number): past SOFT_PROFILES the Profiles page warns about memory.
  fresh();
  const p: Entry = { id: `p_${crypto.randomBytes(4).toString('hex')}`, name: cleanName(name), createdAt: new Date().toISOString(), autopilot: false };
  fs.mkdirSync(dir(p.id), { recursive: true });
  change(() => state.list.push(p));
  return find(p.id);
}

export function rename(id: string, name: string): ProfileInfo {
  const p = entry(id);
  const n = cleanName(name, p.id);
  change(() => {
    const q = state.list.find((x) => x.id === p.id);
    if (q) q.name = n;
  });
  return find(p.id);
}

/** Tie a profile to a Chrome profile ('' = to none). */
export function setChromeDir(id: string, chromeDir: string): ProfileInfo {
  const p = entry(id);
  if (chromeDir && !/^(Default|Profile \d{1,4})$/.test(chromeDir)) throw new Error('That is not a Chrome profile.');
  change(() => {
    const q = state.list.find((x) => x.id === p.id);
    if (!q) return;
    if (chromeDir) q.chromeDir = chromeDir;
    else delete q.chromeDir;
  });
  return find(p.id);
}

/** A free profile name close to the one asked for ("Work", "Work 2", ...), short enough to be one. */
export function freeName(want: string): string {
  fresh();
  const base = want.replace(/[\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 36) || 'Chrome profile';
  const taken = new Set(state.list.map((p) => p.name.toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; n < 1000; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
  return `${base} ${Date.now() % 100000}`;
}

/** Take a profile off the list. Returns its folder, for the caller to move to the Recycle Bin. */
export function remove(id: string): string {
  const p = entry(id);
  if (p.id === MAIN) throw new Error('The first profile cannot be deleted (the app keeps its shared files there). Rename it or reuse it.');
  if (p.id === activeId()) throw new Error('That profile is open. Switch to another one first.');
  if (instance.running().has(p.id)) throw new Error('That profile is open in its own window. Close that window first.');
  change(() => {
    state.list = state.list.filter((x) => x.id !== p.id);
  });
  return dir(p.id);
}

export function setActive(id: string): void {
  const p = entry(id);
  if (own) throw new Error('Each profile has its own window in this mode.');
  change(() => {
    state.active = p.id;
  });
}

export function setAutopilotFor(id: string, on: boolean): ProfileInfo {
  const p = entry(id);
  change(() => {
    const q = state.list.find((x) => x.id === p.id);
    if (q) q.autopilot = !!on;
  });
  return find(p.id);
}

/** Run a profile in the background (multi-instance mode): no window, started whenever Main opens. Not Main itself. */
export function setBackgroundFor(id: string, on: boolean): ProfileInfo {
  const p = entry(id);
  if (p.id === MAIN && on) throw new Error('Main is the window you work in; the other profiles can run in the background.');
  change(() => {
    const q = state.list.find((x) => x.id === p.id);
    if (q) {
      if (on) q.background = true;
      else delete q.background;
    }
  });
  return find(p.id);
}

/** The profiles a scheduled run works through, in list order. */
export const autopilotList = (): ProfileInfo[] => list().filter((p) => p.autopilot);

export function autopilot(): AutopilotSettings | undefined {
  fresh();
  return state.autopilot;
}
export function setAutopilot(s: AutopilotSettings): void {
  change(() => {
    state.autopilot = s;
  });
}

/** main.ts owns the switch itself (tabs to close, data to reload, the window to refresh). */
export function setSwitcher(fn: (id: string) => Promise<void>): void {
  switcher = fn;
}

/** Open another profile. Everything the hub and the AI's tools work on changes with it. */
export async function use(key: string): Promise<ProfileInfo> {
  const p = entry(key);
  if (own && p.id !== own) throw new Error(`Each profile runs in its own window in this mode, and this window is "${active().name}". The user opens "${p.name}" in its own window (Multi run page); an AI connects to it there.`);
  if (p.id !== state.active) {
    if (!switcher) throw new Error('The hub is still starting. Try again in a moment.');
    await switcher(p.id);
  }
  return find(p.id);
}
