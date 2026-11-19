import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AutopilotSettings, ProfileInfo } from '../shared/types';

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
}

interface State {
  active: string;
  list: Entry[];
  autopilot?: AutopilotSettings;
}

let root = '';
let state: State = { active: MAIN, list: [] };
let switcher: ((id: string) => Promise<void>) | null = null;

const file = (): string => path.join(root, 'profiles.json');

function save(): void {
  fs.mkdirSync(root, { recursive: true });
  const tmp = `${file()}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, file());
}

/** Read the profile list. A hub from before profiles becomes one profile, "Main", with its autopilot schedule carried over. */
export function init(userData: string): void {
  root = userData;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8')) as Partial<State>;
    const list = (raw.list ?? []).filter((p): p is Entry => !!p && typeof p.id === 'string' && typeof p.name === 'string' && /^[a-z0-9_]+$/.test(p.id));
    if (!list.some((p) => p.id === MAIN)) list.unshift({ id: MAIN, name: 'Main', createdAt: new Date().toISOString(), autopilot: true });
    state = { active: list.some((p) => p.id === raw.active) ? raw.active! : MAIN, list, autopilot: raw.autopilot };
    return;
  } catch {
    /* first start with profiles */
  }
  let autopilot: AutopilotSettings | undefined;
  try {
    autopilot = (JSON.parse(fs.readFileSync(path.join(root, 'marketo-db.json'), 'utf8')) as { settings?: { autopilot?: AutopilotSettings } }).settings?.autopilot;
  } catch {
    /* a fresh install */
  }
  state = { active: MAIN, list: [{ id: MAIN, name: 'Main', createdAt: new Date().toISOString(), autopilot: true }], autopilot };
  // The list was lost or unreadable but profile folders are there: list them again rather than strand their data.
  try {
    for (const id of fs.readdirSync(path.join(root, 'profiles'))) {
      if (!/^p_[a-z0-9]+$/.test(id) || !fs.existsSync(path.join(root, 'profiles', id, 'marketo-db.json'))) continue;
      state.list.push({ id, name: `Recovered ${state.list.length}`, createdAt: new Date().toISOString(), autopilot: false });
    }
  } catch {
    /* no other profiles */
  }
  save();
}

const entry = (key: string): Entry => {
  const k = key.trim().toLowerCase();
  const p = state.list.find((x) => x.id === k) ?? state.list.find((x) => x.name.toLowerCase() === k);
  if (!p) throw new Error(`No profile "${key}". Profiles: ${state.list.map((x) => `"${x.name}" (${x.id})`).join(', ')}.`);
  return p;
};

export const activeId = (): string => state.active;
export const active = (): Entry => entry(state.active);
export const count = (): number => state.list.length;
export const list = (): ProfileInfo[] => state.list.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, active: p.id === state.active, autopilot: !!p.autopilot }));
export const find = (key: string): ProfileInfo => list().find((p) => p.id === entry(key).id)!;

/** Where a profile keeps its files (the open one when no id is given). */
export const dir = (id: string = state.active): string => (id === MAIN ? root : path.join(root, 'profiles', id));

function cleanName(name: string, except?: string): string {
  const n = name.replace(/[\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!n) throw new Error('A profile needs a name.');
  if (n.length > 40) throw new Error('Keep the profile name under 40 characters.');
  if (state.list.some((p) => p.id !== except && p.name.toLowerCase() === n.toLowerCase())) throw new Error(`There is already a profile called "${n}".`);
  return n;
}

export function create(name: string): ProfileInfo {
  if (state.list.length >= 20) throw new Error('20 profiles is the limit.');
  const p: Entry = { id: `p_${crypto.randomBytes(4).toString('hex')}`, name: cleanName(name), createdAt: new Date().toISOString(), autopilot: false };
  fs.mkdirSync(dir(p.id), { recursive: true });
  state.list.push(p);
  save();
  return find(p.id);
}

export function rename(id: string, name: string): ProfileInfo {
  const p = entry(id);
  p.name = cleanName(name, p.id);
  save();
  return find(p.id);
}

/** Take a profile off the list. Returns its folder, for the caller to move to the Recycle Bin. */
export function remove(id: string): string {
  const p = entry(id);
  if (p.id === MAIN) throw new Error('The first profile cannot be deleted (the app keeps its shared files there). Rename it or reuse it.');
  if (p.id === state.active) throw new Error('That profile is open. Switch to another one first.');
  state.list = state.list.filter((x) => x.id !== p.id);
  save();
  return dir(p.id);
}

export function setActive(id: string): void {
  state.active = entry(id).id;
  save();
}

export function setAutopilotFor(id: string, on: boolean): ProfileInfo {
  const p = entry(id);
  p.autopilot = !!on;
  save();
  return find(p.id);
}

/** The profiles a scheduled run works through, in list order. */
export const autopilotList = (): ProfileInfo[] => list().filter((p) => p.autopilot);

export const autopilot = (): AutopilotSettings | undefined => state.autopilot;
export function setAutopilot(s: AutopilotSettings): void {
  state.autopilot = s;
  save();
}

/** main.ts owns the switch itself (tabs to close, data to reload, the window to refresh). */
export function setSwitcher(fn: (id: string) => Promise<void>): void {
  switcher = fn;
}

/** Open another profile. Everything the hub and the AI's tools work on changes with it. */
export async function use(key: string): Promise<ProfileInfo> {
  const p = entry(key);
  if (p.id !== state.active) {
    if (!switcher) throw new Error('The hub is still starting. Try again in a moment.');
    await switcher(p.id);
  }
  return find(p.id);
}
