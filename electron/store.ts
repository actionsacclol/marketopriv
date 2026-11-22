// The hub's single source of truth: one JSON file in userData, written
// atomically on every change (with a .bak of the previous version). The UI and
// the MCP tools both go through these functions; every change is broadcast to
// the renderer so the hub updates live while an agent works.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AccountInput, AccountSnapshot, AgentConfig, Brand, Campaign, Submission, Db,Fields, IgAccount, Learning, PostLog, Reel, ReelFeedback, Reference, RefVideo, Session, SessionAction, Settings, Site, TrainingBrief, TrainingNote, TrainingTopic, LongVideo } from '../shared/types';
import { mergePosts, postKey, reelPosts } from '../shared/posts';
import { REWARDS_SITES, SUBMIT_WINDOW_MS, campaignIdOf, campaignUrl, isKryptAccountOn } from '../shared/campaigns';
import { defaultsFor, isVoiced, normalizeFields, presetById } from '../shared/presets';
import { formatById } from '../shared/formats';
import { hookLine } from '../shared/score';
import { BRIEF_MAX_CHARS, topicKeyOf, trainingOf } from '../shared/training';
import { cleanLimits, forgetDayIndex, linkPatch, localDate, normalizeHandle, sameHandle } from '../shared/warmup';
import { cleanTune, tuneToFields, voiceId, type SavedVoice, type VoiceTune } from '../shared/voice';
import { cleanSayAs, setSayAs } from '../shared/pronounce';
import { EMPTY_BRAND, KRYPT_BRAND, cleanInvite, creatorProblem } from '../shared/brand';
import { cleanClipping } from '../shared/clipping';

let file = '';
let db: Db;
const listeners = new Set<(db: Db) => void>();

const now = (): string => new Date().toISOString();
export const newId = (prefix: string): string => `${prefix}_${crypto.randomBytes(5).toString('hex')}`;

const EMPTY_AGENT: AgentConfig = { provider: 'xai', baseUrl: 'https://api.x.ai/v1', model: '', vision: false };

function empty(outputDir: string): Db {
  return { version: 1, settings: { handle: '', outputDir, fps: 30, agentAccess: true }, accounts: [], igAccounts: [], sessions: [], reels: [], posts: [], references: [], refVideos: [], learnings: [], voices: [], brand: { ...EMPTY_BRAND }, agent: { ...EMPTY_AGENT } };
}

export function init(userData: string, defaultOutputDir: string): void {
  file = path.join(userData, 'marketo-db.json');
  db = empty(defaultOutputDir);
  setCustomStyles(undefined);
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<Db>;
    // A hub from before brand profiles was the Krypt one: keep it working as it did.
    const brand: Brand = raw.brand ? { ...EMPTY_BRAND, ...raw.brand } : { ...KRYPT_BRAND };
    // The Krypt tools catalog used to have a switch. It is built in now.
    delete (brand as Brand & { kryptPack?: boolean }).kryptPack;
    // The built-in browser is gone (2026-11-19): every account runs in the user's Chrome.
    db = { ...db, ...raw, igAccounts: (raw.igAccounts ?? []).map((a: IgAccount) => ({ ...a, browser: 'chrome' as const })), learnings: raw.learnings ?? [], posts: raw.posts ?? [], refVideos: raw.refVideos ?? [], voices: raw.voices ?? [], settings: { ...db.settings, ...(raw.settings ?? {}) }, brand, agent: { ...EMPTY_AGENT, ...(raw.agent ?? {}) }, version: 1 };
    // Reels posted before the post log existed go into it.
    if (!raw.posts) db.posts = mergePosts([], db.reels.flatMap((r) => reelPosts(r, db.settings.handle)), () => newId('post'), now()).list;
    // A recording left open by a crash or quit is closed as it stands.
    for (const x of db.sessions) if (x.live) delete x.live;
    setSayAs(db.settings.sayAs);
    setCustomStyles(db.customStyles);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
      // Unreadable: keep it aside rather than overwrite it.
      try {
        fs.copyFileSync(file, `${file}.corrupt-${Date.now()}`);
      } catch {
        /* nothing to keep */
      }
    }
  }
  // When this install started (Krypt reposts wait two weeks from it): an older one from its first recorded session.
  if (!db.settings.firstRunAt) db.settings.firstRunAt = db.sessions.reduce((min, x) => (x.startedAt && x.startedAt < min ? x.startedAt : min), now());
}

/** Open another profile's data (electron/profiles.ts): the same as starting on it, and everything listening gets the new set. */
export function open(dir: string, defaultOutputDir: string): void {
  // Session time since the last save (it is written every 20 s) stays with the profile being closed.
  if (file) persist();
  init(dir, defaultOutputDir);
  lastBak = 0;
  lastSite.clear();
  for (const l of listeners) l(db);
}

/**
 * Write a new profile's first data file: empty, or with the open profile's settings, saved voices and chat setup,
 * and/or its knowledge (Training, learnings, playbook notes, references, reference videos, own styles, brand).
 * Never its accounts, their follower numbers, sessions, reels or post log: those are what a profile keeps apart.
 */
export function seed(dir: string, outputDir: string, copy: { settings: boolean; knowledge: boolean }): void {
  const next = empty(outputDir);
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  fs.mkdirSync(dir, { recursive: true });
  if (copy.settings) {
    const settings = { ...clone(db.settings), handle: '', outputDir };
    delete settings.autopilot;
    delete settings.proxy;
    next.settings = settings;
    next.voices = clone(db.voices);
    next.agent = clone(db.agent);
  }
  if (copy.knowledge) {
    const from = path.dirname(file);
    if (db.training) next.training = clone(db.training);
    next.learnings = clone(db.learnings);
    next.references = clone(db.references);
    if (db.customStyles) next.customStyles = clone(db.customStyles);
    if (db.settings.promoting) next.settings.promoting = db.settings.promoting;
    // The brand as it is here, set up: the new profile opens ready, with only its accounts to add (no setup wizard).
    next.brand = clone(db.brand);
    // The user's playbook notes and the reference videos (their files too, so each profile can delete its own).
    for (const sub of ['playbook', 'refs']) {
      try {
        if (fs.existsSync(path.join(from, sub))) fs.cpSync(path.join(from, sub), path.join(dir, sub), { recursive: true });
      } catch {
        /* best effort: the rows below still point at files that exist */
      }
    }
    const moved = (p: string): string => {
      const rel = path.relative(path.join(from, 'refs'), p);
      const there = path.join(dir, 'refs', rel);
      return !rel.startsWith('..') && !path.isAbsolute(rel) && fs.existsSync(there) ? there : p;
    };
    next.refVideos = clone(db.refVideos).map((r) => ({ ...r, file: moved(r.file), sheets: { poster: moved(r.sheets.poster), hook: moved(r.sheets.hook), shots: moved(r.sheets.shots) } }));
  }
  fs.writeFileSync(path.join(dir, 'marketo-db.json'), JSON.stringify(next, null, 2), 'utf8');
}

/** When the .bak copy was last made: once a minute is enough (a run saves after every like and follow). */
let lastBak = 0;
let lastSaveMs = 0;
/** How long the last save took (Setup > Performance). */
export const saveTime = (): number => lastSaveMs;
function persist(): void {
  const t0 = performance.now();
  // Whatever a batched save was waiting for goes in this one.
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (Date.now() - lastBak >= 60_000)
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, `${file}.bak`);
      lastBak = Date.now();
    } catch {
      /* best effort */
    }
  const tmp = `${file}.tmp-${process.pid}`;
  // Compact: about a quarter smaller and quicker to write than indented JSON; it reads back the same.
  fs.writeFileSync(tmp, JSON.stringify(db), 'utf8');
  fs.renameSync(tmp, file);
  lastSaveMs = Math.round(performance.now() - t0);
}

// Batched saves (Setup > Performance, off by default): likes, follows, saves and watches are counted in memory at
// once (every limit check reads memory), and written to disk at most every batchSec seconds. Posts, comments and
// messages always save at once.
let batchSec = 0;
let batchTimer: NodeJS.Timeout | null = null;
export function setBatchSave(sec: number): void {
  batchSec = Math.max(0, Number(sec) || 0);
  if (!batchSec) flush();
}
/** Write anything a batched save is still holding (quit, profile switch). */
export function flush(): void {
  if (batchTimer) saveLive(true);
}

export const get = (): Db => db;
export const dbPath = (): string => file;

export function onChange(cb: (db: Db) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function commit<T>(fn: (d: Db) => T): T {
  const out = fn(db);
  persist();
  for (const l of listeners) l(db);
  return out;
}

// ── Long videos ────────────────────────────────────────────────────────────
export function findLongVideo(idOrTitle: string): LongVideo {
  const list = db.longVideos ?? [];
  const q = idOrTitle.trim().toLowerCase();
  const v = list.find((x) => x.id === idOrTitle) ?? list.find((x) => x.title.toLowerCase() === q);
  if (!v) throw new Error(`No long video "${idOrTitle}". list_long_videos shows them.`);
  return v;
}

export function saveLongVideo(input: Partial<LongVideo> & { id?: string }): LongVideo {
  return commit((d) => {
    const list = (d.longVideos ??= []);
    const t = now();
    const i = input.id ? list.findIndex((x) => x.id === input.id) : -1;
    if (input.id && i < 0) throw new Error(`No long video "${input.id}".`);
    const clean = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<LongVideo>;
    if (i >= 0) {
      list[i] = { ...list[i], ...clean, updatedAt: t };
      return list[i];
    }
    if (!clean.title?.trim()) throw new Error('A long video needs a title.');
    if (!clean.accountId) throw new Error('A long video needs the account whose channel it goes to.');
    const v: LongVideo = { sections: [], status: 'script', ...clean, id: newId('long'), title: clean.title.trim(), accountId: clean.accountId, createdAt: t, updatedAt: t } as LongVideo;
    list.unshift(v);
    return v;
  });
}

export function deleteLongVideo(id: string): void {
  commit((d) => {
    d.longVideos = (d.longVideos ?? []).filter((x) => x.id !== id);
  });
}

// ── Content Rewards campaigns ──────────────────────────────────────────────
export function findCampaign(idOrTitle: string): Campaign {
  const list = db.campaigns ?? [];
  const q = idOrTitle.trim().toLowerCase();
  const key = campaignIdOf(idOrTitle) ?? q;
  const c = list.find((x) => x.id === key) ?? list.find((x) => x.title.toLowerCase() === q);
  if (!c) throw new Error(`No campaign "${idOrTitle}". list_campaigns shows them; the user adds one on the Campaigns page.`);
  return c;
}

const cleanTags = (v: unknown): string[] | undefined => (Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim()).filter(Boolean))].slice(0, 20) : undefined);

/** Add a campaign (by its link) or change one. Only the fields given change. */
export function saveCampaign(input: Partial<Campaign> & { url?: string; id?: string }): Campaign {
  return commit((d) => {
    const list = (d.campaigns ??= []);
    const t = now();
    const id = input.id ?? (input.url ? campaignIdOf(input.url) : null);
    if (!id) throw new Error('A campaign needs its contentrewards.com link (contentrewards.com/c/campaigns/…).');
    const i = list.findIndex((x) => x.id === id);
    const clean: Partial<Campaign> = {};
    if (input.title !== undefined) clean.title = String(input.title).trim().slice(0, 140);
    if (input.brand !== undefined) clean.brand = String(input.brand).trim().slice(0, 80) || undefined;
    if (input.platforms !== undefined) clean.platforms = input.platforms.filter((s) => REWARDS_SITES.includes(s));
    if (input.pay !== undefined) clean.pay = String(input.pay).trim().slice(0, 200) || undefined;
    if (input.rules !== undefined) clean.rules = String(input.rules).trim().slice(0, 6000) || undefined;
    if (input.hashtags !== undefined) clean.hashtags = cleanTags(input.hashtags);
    if (input.mentions !== undefined) clean.mentions = cleanTags(input.mentions);
    if (input.links !== undefined) clean.links = cleanTags(input.links);
    if (input.sources !== undefined) clean.sources = cleanTags(input.sources);
    // Set by campaignBanner.setBanner (a copy in the campaign's folder); "" removes it.
    if (input.banner !== undefined) clean.banner = String(input.banner).trim() || undefined;
    if (input.accounts !== undefined) clean.accounts = input.accounts.filter((x) => d.igAccounts.some((a) => a.id === x));
    // The user's number, no ceiling.
    if (input.perDay !== undefined) clean.perDay = Math.max(0, Math.round(Number(input.perDay) || 0));
    if (input.on !== undefined) clean.on = !!input.on;
    if (input.test !== undefined) clean.test = !!input.test || undefined;
    // Krypt's own accounts never post for a paying campaign (every install engages with them: a Content Rewards
    // ban). A test campaign, set by the user on the page, is the exception.
    const noKrypt = (c: Campaign): Campaign => c.test ? c : ({
      ...c,
      accounts: c.accounts.filter((x) => {
        const a = d.igAccounts.find((y) => y.id === x);
        return !!a && !c.platforms.some((s) => isKryptAccountOn(a, s));
      }),
    });
    if (i >= 0) {
      list[i] = noKrypt({ ...list[i], ...clean, updatedAt: t });
      return list[i];
    }
    const c = noKrypt({ platforms: [], accounts: [], perDay: 1, on: true, ...clean, id, url: campaignUrl(id), title: clean.title || 'New campaign', addedAt: t, updatedAt: t });
    list.unshift(c);
    return c;
  });
}

export function deleteCampaign(id: string): void {
  commit((d) => {
    d.campaigns = (d.campaigns ?? []).filter((x) => x.id !== id);
  });
}

/** Submissions, with ones past their 30 minutes turned to missed. */
export function submissions(): Submission[] {
  const list = db.submissions ?? [];
  const t = Date.now();
  if (list.some((s) => s.status === 'due' && Date.parse(s.deadline) < t))
    commit((d) => {
      d.submissions = (d.submissions ?? []).map((s) => (s.status === 'due' && Date.parse(s.deadline) < t ? { ...s, status: 'missed', note: s.note ?? 'not submitted within 30 minutes of posting' } : s));
    });
  return db.submissions ?? [];
}

export function updateSubmission(id: string, patch: Partial<Pick<Submission, 'status' | 'note'>>): Submission {
  return commit((d) => {
    const list = d.submissions ?? [];
    const i = list.findIndex((s) => s.id === id || s.postUrl === id);
    if (i < 0) throw new Error(`No submission "${id}". list_campaigns shows them.`);
    const s = list[i];
    list[i] = { ...s, ...(patch.status ? { status: patch.status } : {}), ...(patch.note !== undefined ? { note: patch.note.trim().slice(0, 300) || undefined } : {}), ...(patch.status === 'submitted' && !s.submittedAt ? { submittedAt: now() } : {}) };
    return list[i];
  });
}

/**
 * A campaign reel just went live on a platform: queue its link for Content Rewards (due within 30 minutes).
 * Null when the reel has no campaign, the campaign doesn't pay there, or the post is already in one.
 */
function queueSubmission(d: Db, r: Reel, site: Site, url: string, at: string, by: string): Submission | null {
  const c = r.campaignId ? (d.campaigns ?? []).find((x) => x.id === r.campaignId) : undefined;
  if (!c || !c.platforms.includes(site)) return null;
  const list = (d.submissions ??= []);
  const key = postKey(url);
  if (list.some((s) => postKey(s.postUrl) === key)) return null;
  const a = d.igAccounts.find((x) => sameHandle(x.handle, by));
  if (!a || isKryptAccountOn(a, site)) return null;
  const s: Submission = { id: newId('sub'), campaignId: c.id, reelId: r.id, accountId: a.id, site, postUrl: url, postedAt: at, deadline: new Date(Date.parse(at) + SUBMIT_WINDOW_MS).toISOString(), status: 'due' };
  list.unshift(s);
  return s;
}

/** A reel went live: its link on the reel, the post log, and a Content Rewards submission if it was made for a campaign. */
export function markPosted(id: string, site: Site, url: string, at: string, by: string, extra: Partial<Reel> = {}): { reel: Reel; submission: Submission | null } {
  const r0 = findReel(id);
  const { reel } = updateReel(id, { status: 'posted', postedBy: by, ...linkPatch(r0, site, url, at), ...extra });
  logPosts([{ site, handle: by, url, postedAt: at, title: reel.title, kind: 'video', reelId: reel.id, source: 'marketo' }]);
  const submission = commit((d) => queueSubmission(d, reel, site, url, at, by));
  return { reel, submission };
}

// ── Reels ──────────────────────────────────────────────────────────────────
export function findReel(id: string): Reel {
  const r = db.reels.find((x) => x.id === id);
  if (!r) throw new Error(`No reel "${id}". list_reels shows the ids.`);
  return r;
}

/** Defaults that come from the brand profile instead of the preset (end card link, footer, our own handle). */
function brandDefaults(keys: string[]): Fields {
  const b = db.brand;
  const out: Fields = {};
  if (!b.name) return out;
  if (b.site && keys.includes('cta')) out.cta = b.site;
  // The brand decides the small print, including "none" (presets default to a trading disclaimer).
  if (keys.includes('disclaimer')) out.disclaimer = b.disclaimer;
  // Another brand's reels don't carry the Krypt mark unless the reel is about a Krypt tool (the AI clears the field for those).
  if (keys.includes('logo')) out.logo = b.logo || (b.name.trim().toLowerCase() === 'krypt' ? '' : 'none');
  if (keys.includes('card_by')) out.card_by = `by ${b.name}`;
  if (keys.includes('name') && keys.includes('handle')) {
    out.name = b.name;
    if (db.settings.handle) out.handle = db.settings.handle;
  }
  return out;
}

/**
 * The voice fields as given by a person or an AI, made exact: a saved voice's
 * name becomes its whole tuning, "onyx" becomes am_onyx. Fields passed next to
 * the name still win.
 */
function expandVoice(given: Fields): Fields {
  const out: Fields = { ...given };
  if (typeof out.voice === 'string' && out.voice.trim()) {
    const k = out.voice.trim().toLowerCase();
    const saved = db.voices.find((v) => v.id === out.voice || v.name.toLowerCase() === k);
    if (saved) Object.assign(out, { ...tuneToFields(saved), ...Object.fromEntries(Object.entries(given).filter(([key]) => key !== 'voice')) });
    else out.voice = voiceId(out.voice) ?? out.voice;
  }
  if (typeof out.voice_blend === 'string') out.voice_blend = out.voice_blend.trim() ? (voiceId(out.voice_blend) ?? out.voice_blend) : 'none';
  return out;
}

/** New reel from a preset, or from a format (its preset + skeleton fields + caption). */
export function createReel(presetId: string, title?: string, fields: Fields = {}, formatId?: string): { reel: Reel; warnings: string[] } {
  const fmt = formatId ? formatById(formatId) : undefined;
  if (formatId && !fmt) throw new Error(`Unknown format "${formatId}". list_formats shows them.`);
  const p = presetById(fmt?.preset ?? presetId);
  if (!p) throw new Error(`Unknown preset "${presetId}". list_presets shows them.`);
  // New narrated reels start with the user's voice (Voices page), unless the format or the caller says otherwise.
  const voice = db.settings.voice && p.fields.some((x) => x.key === 'voice') ? { ...tuneToFields(db.settings.voice), ...(p.fields.some((x) => x.key === 'voice_standin') && db.settings.eleven?.standin ? { voice_standin: db.settings.eleven.standin } : {}) } : {};
  const { fields: f, warnings } = normalizeFields(p, expandVoice(fields), { ...defaultsFor(p), ...(p.brandFree ? {} : brandDefaults(p.fields.map((x) => x.key))), ...voice, ...(fmt?.fields ?? {}) });
  const t = now();
  const reel: Reel = { id: newId('reel'), title: title?.trim() || `${fmt?.name ?? p.name} ${db.reels.length + 1}`, preset: p.id, fields: f, status: 'draft', ...(fmt ? { format: fmt.id, caption: fmt.caption } : {}), createdAt: t, updatedAt: t };
  commit((d) => d.reels.unshift(reel));
  return { reel, warnings };
}

/** Patch a reel. `fields` merge into the existing ones (validated against the preset). */
/** These reels' rendered files went to the Recycle Bin: they no longer point at them. */
export function filesCleaned(ids: string[]): void {
  const set = new Set(ids);
  const t = new Date().toISOString();
  commit((d) => {
    for (const r of d.reels)
      if (set.has(r.id)) {
        delete r.renderPath;
        delete r.squarePath;
        r.filesCleaned = t;
      }
  });
}

export function updateReel(id: string, patch: Partial<Reel>): { reel: Reel; warnings: string[] } {
  const r = findReel(id);
  let warnings: string[] = [];
  const next: Reel = { ...r, ...patch, id: r.id, createdAt: r.createdAt, updatedAt: now() };
  if (patch.preset && patch.preset !== r.preset && !presetById(patch.preset)) throw new Error(`Unknown preset "${patch.preset}".`);
  if (patch.fields || patch.preset) {
    const p = presetById(next.preset)!;
    const n = normalizeFields(p, expandVoice(patch.fields ?? {}), r.fields);
    next.fields = n.fields;
    warnings = n.warnings;
    // Content changed after a render: the file on disk no longer matches.
    if (r.status === 'rendered') next.status = 'draft';
  }
  commit((d) => {
    d.reels = d.reels.map((x) => (x.id === id ? next : x));
  });
  return { reel: next, warnings };
}

/** A campaign's banner changed: its reels rendered but not yet posted go back to draft (their file lacks it). */
export function campaignReelsToRedo(campaignId: string): number {
  let n = 0;
  commit((d) => {
    for (const r of d.reels)
      if (r.campaignId === campaignId && r.status === 'rendered') {
        r.status = 'draft';
        r.updatedAt = now();
        n++;
      }
  });
  return n;
}

export function duplicateReel(id: string): Reel {
  const r = findReel(id);
  const t = now();
  const copy: Reel = { id: newId('reel'), title: `${r.title} (copy)`, preset: r.preset, fields: { ...r.fields }, status: 'draft', caption: r.caption, hashtags: r.hashtags, format: r.format, createdAt: t, updatedAt: t };
  commit((d) => d.reels.unshift(copy));
  return copy;
}

export interface VariantInput {
  hook: string;
  /** Story reels: replaces the first line of beats. */
  firstBeat?: string;
  fields?: Fields;
}

/**
 * Hook test: put a reel in a group as version A and add one copy per variant
 * (B, C, ...) with a different opening. Everything after the hook stays the
 * same, so the numbers compare openings only.
 */
export function makeVariants(id: string, variants: VariantInput[], originalHook?: string): { original: Reel; created: Reel[]; warnings: string[] } {
  const r = findReel(id);
  const p = presetById(r.preset)!;
  const group = r.group ?? newId('grp');
  const taken = db.reels.filter((x) => x.group === group).map((x) => x.variant ?? '');
  const original: Reel = { ...r, group, variant: r.variant ?? 'A', hook: originalHook ?? r.hook ?? hookLine(r), updatedAt: now() };
  if (!taken.includes(original.variant!)) taken.push(original.variant!);
  const base = r.title.replace(/\s*\[[A-Z]\]$/, '');
  const warnings: string[] = [];
  const created: Reel[] = variants.map((v) => {
    let given: Fields = { ...(v.fields ?? {}) };
    if (v.firstBeat !== undefined) {
      if (!isVoiced(r.preset)) throw new Error('first_beat only works on story, narrated and meme reels; pass fields (e.g. headline) instead.');
      const lines = String(given.beats ?? r.fields.beats ?? '').split('\n');
      const at = lines.findIndex((l) => l.trim());
      lines[at < 0 ? 0 : at] = v.firstBeat.trim();
      given = { ...given, beats: lines.join('\n') };
    }
    if (!Object.keys(given).length) throw new Error(`Variant "${v.hook}" changes nothing; pass first_beat or fields.`);
    const n = normalizeFields(p, given, r.fields);
    warnings.push(...n.warnings);
    let label = 'B';
    for (let c = 66; c < 91; c++) {
      label = String.fromCharCode(c);
      if (!taken.includes(label)) break;
    }
    taken.push(label);
    const t = now();
    return { id: newId('reel'), title: `${base} [${label}]`, preset: r.preset, fields: n.fields, status: 'draft', caption: r.caption, hashtags: r.hashtags, format: r.format, group, variant: label, hook: v.hook, createdAt: t, updatedAt: t };
  });
  if (!/\[[A-Z]\]$/.test(original.title)) original.title = `${base} [${original.variant}]`;
  commit((d) => {
    d.reels = d.reels.map((x) => (x.id === id ? original : x));
    const at = d.reels.findIndex((x) => x.id === id);
    d.reels.splice(at, 0, ...created.slice().reverse());
  });
  return { original, created, warnings };
}

export function deleteReel(id: string): void {
  findReel(id);
  deleteReels([id]);
}

/** Remove several reels in one go; returns the ones that were there. */
export function deleteReels(ids: string[]): Reel[] {
  const gone = db.reels.filter((x) => ids.includes(x.id));
  if (gone.length) {
    commit((d) => {
      d.reels = d.reels.filter((x) => !ids.includes(x.id));
    });
  }
  return gone;
}

// ── Voices ─────────────────────────────────────────────────────────────────
export function saveVoice(v: VoiceTune & { name: string; id?: string }): SavedVoice {
  const name = String(v.name ?? '').trim().slice(0, 40);
  if (!name) throw new Error('Give the voice a name.');
  if (voiceId(name)) throw new Error(`"${name}" is the name of a built-in voice. Pick another name.`);
  const existing = db.voices.find((x) => x.id === v.id) ?? db.voices.find((x) => x.name.toLowerCase() === name.toLowerCase());
  const next: SavedVoice = { ...cleanTune(v), id: existing?.id ?? newId('voice'), name };
  commit((d) => {
    d.voices = existing ? d.voices.map((x) => (x.id === existing.id ? next : x)) : [...d.voices, next];
  });
  return next;
}

export function deleteVoice(id: string): void {
  commit((d) => {
    d.voices = d.voices.filter((x) => x.id !== id);
  });
}

/** The square (X) version of a reel was rendered. */
export function markSquare(id: string, squarePath: string): Reel {
  const r = findReel(id);
  const next: Reel = { ...r, squarePath, updatedAt: now() };
  commit((d) => {
    d.reels = d.reels.map((x) => (x.id === id ? next : x));
  });
  return next;
}

// ── Post log ───────────────────────────────────────────────────────────────
export type PostInput = Omit<PostLog, 'id' | 'key' | 'addedAt'>;

/** Add posts to the log, or update ones already there (matched by link). */
export function logPosts(items: PostInput[]): { added: PostLog[]; updated: PostLog[] } {
  return commit((d) => {
    const r = mergePosts(d.posts, items, () => newId('post'), now());
    d.posts = r.list;
    return { added: r.added, updated: r.updated };
  });
}

export function deletePost(key: string): PostLog {
  const p = db.posts.find((x) => x.id === key || x.url === key);
  if (!p) throw new Error(`No post "${key}" in the log.`);
  commit((d) => {
    d.posts = d.posts.filter((x) => x.id !== p.id);
  });
  return p;
}

export function markRendered(id: string, renderPath: string, seconds: number): Reel {
  const r = findReel(id);
  const next: Reel = { ...r, status: r.status === 'posted' ? 'posted' : 'rendered', renderPath, renderSeconds: seconds, renderedAt: now(), updatedAt: now() };
  commit((d) => {
    d.reels = d.reels.map((x) => (x.id === id ? next : x));
  });
  return next;
}

// ── Stats / research ───────────────────────────────────────────────────────
export function addAccountSnapshot(s: Omit<AccountSnapshot, 'at'> & { at?: string }): AccountSnapshot {
  const snap: AccountSnapshot = { ...s, at: s.at ?? now() };
  commit((d) => {
    d.accounts.push(snap);
    d.accounts.sort((a, b) => a.at.localeCompare(b.at));
  });
  return snap;
}

// ── Recorded sessions (the built-in browser counts its own actions) ─────────
const LIVE_IDLE_MS = 30 * 60_000;
const ACTIVE_GAP_MS = 3 * 60_000;
const BETWEEN_CALLS_MS = 90_000;
let lastLivePersist = 0;

const onSite = (s: Session, site: Site): boolean => (s.site ?? 'instagram') === site;

/** The comments (or messages) the browser sent from this profile's accounts, newest sessions first: what a new one must not repeat. */
export function recentTexts(kind: 'comment' | 'message', limit = 40): string[] {
  const out: string[] = [];
  for (const s of db.sessions) {
    for (let i = s.items.length - 1; i >= 0 && out.length < limit; i--) {
      const it = s.items[i];
      if (it.note && it.actions.includes(kind)) out.push(it.note);
    }
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Keep detailed activity for N days (Setup > Performance; never under 30, the reply cap's window): older sessions'
 * per-item lists move to activity-archive/sessions-YYYY-MM.jsonl and only their counts stay in the database, so the
 * warm-up math, Calendar and Dashboard read the same numbers. Returns how many sessions were trimmed.
 */
export function archiveActivity(days: number): number {
  if (!(days > 0) || !file) return 0;
  const keep = Math.max(days, 30);
  const before = Date.now() - keep * 86_400_000;
  const old = db.sessions.filter((s) => !s.live && s.items.length > 0 && Date.parse(s.endedAt ?? s.startedAt) < before);
  if (!old.length) return 0;
  const dir = path.join(path.dirname(file), 'activity-archive');
  fs.mkdirSync(dir, { recursive: true });
  const byMonth = new Map<string, string[]>();
  for (const s of old) {
    const m = (s.startedAt || '').slice(0, 7) || 'unknown';
    byMonth.set(m, [...(byMonth.get(m) ?? []), JSON.stringify({ id: s.id, handle: s.handle, site: s.site ?? 'instagram', startedAt: s.startedAt, items: s.items })]);
  }
  // Written first: the database only loses the lists once they are safely in the archive.
  for (const [m, lines] of byMonth) fs.appendFileSync(path.join(dir, `sessions-${m}.jsonl`), `${lines.join('\n')}\n`, 'utf8');
  commit(() => {
    for (const s of old) {
      s.itemsArchived = (s.itemsArchived ?? 0) + s.items.length;
      s.items = [];
    }
  });
  return old.length;
}

/** The per-thread cap: the user's number, else the recommended 2. */
export const PER_THREAD_DEFAULT = 2;
export const perThreadCap = (): number => {
  const n = db.settings.perThread;
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : PER_THREAD_DEFAULT;
};

/** How many comments, replies and messages this account sent into that thread on that platform (the last 30 days). */
export function threadSends(handle: string, site: Site, thread: string): number {
  const key = canonicalUrl(thread);
  const since = Date.now() - 30 * 86_400_000;
  let n = 0;
  for (const s of db.sessions) {
    if ((s.site ?? 'instagram') !== site || !sameHandle(s.handle, handle) || Date.parse(s.startedAt) < since) continue;
    for (const it of s.items) if ((it.thread ?? it.url) === key) n += it.actions.filter((x) => x === 'comment' || x === 'message').length;
  }
  return n;
}

/** The session the browser is recording for this account on this network right now, if any. */
export function liveSession(handle: string, site: Site = 'instagram'): Session | undefined {
  const t = Date.now();
  return db.sessions.find((s) => s.live && onSite(s, site) && sameHandle(s.handle, handle) && localDate(s.startedAt) === localDate() && t - new Date(s.endedAt ?? s.startedAt).getTime() < LIVE_IDLE_MS);
}

function openLive(handle: string, site: Site): Session {
  const existing = liveSession(handle, site);
  if (existing) return existing;
  // Anything older for this account on this network is finished.
  for (const s of db.sessions) if (s.live && onSite(s, site) && sameHandle(s.handle, handle)) delete s.live;
  const acct = db.igAccounts.find((a) => sameHandle(a.handle, handle));
  const t = now();
  const s: Session = { id: newId('sess'), kind: acct?.status === 'warming' ? 'warmup' : 'engage', handle: acct?.handle ?? normalizeHandle(handle), ...(site === 'instagram' ? {} : { site, reposts: 0 }), startedAt: t, endedAt: t, activeMs: 0, minutes: 0, niche: acct?.niche, likes: 0, saves: 0, follows: 0, comments: 0, watched: 0, posts: 0, items: [], live: true };
  db.sessions.unshift(s);
  return s;
}

/**
 * Adds the time since the last tick. Time inside a tool call (a watch, a click) counts in full. Time between two
 * calls counts only when it is short (the AI reading the page): a longer gap means it was on another platform or
 * making a reel, with or without this tab open, and that is not time on the app.
 */
function tick(s: Session, inside = false, away = false): void {
  const t = Date.now();
  const gap = Math.max(0, t - new Date(s.endedAt ?? s.startedAt).getTime());
  s.activeMs = (s.activeMs ?? 0) + (inside ? Math.min(gap, ACTIVE_GAP_MS) : !away && gap <= BETWEEN_CALLS_MS ? gap : 0);
  s.endedAt = new Date(t).toISOString();
  s.minutes = Math.round((s.activeMs / 60_000) * 10) / 10;
}

function saveLive(force: boolean): void {
  if (!force && Date.now() - lastLivePersist < 20_000) return;
  lastLivePersist = Date.now();
  persist();
  for (const l of listeners) l(db);
}

/** A browser tool ran for this account: time on Instagram (or X) counts. */
export function touchLive(handle: string, site: Site = 'instagram', inside = false): Session {
  const s = openLive(handle, site);
  // Back from another platform: the time spent over there is not time here.
  const key = normalizeHandle(handle);
  const away = lastSite.has(key) && lastSite.get(key) !== site;
  lastSite.set(key, site);
  tick(s, inside, away);
  saveLive(false);
  return s;
}

/** The platform each account's last browser call was on. */
const lastSite = new Map<string, Site>();

/** A browser call on a platform whose time is not counted (YouTube Studio): the others still see the account went elsewhere. */
export function wentTo(handle: string, site: Site): void {
  lastSite.set(normalizeHandle(handle), site);
}

/** Post slots a platform gives back in one day at most: enough for a lost upload, not enough to post without end. */
const POSTS_LOST_PER_DAY = 2;

/**
 * A post that was sent but never showed up on the profile: its slot in today's count is given back.
 * `confirmedSince(t)` says whether a post was recorded as live on that platform since the click at t.
 */
export function releasePost(handle: string, site: Site, confirmedSince: (t: number) => boolean): { ok: boolean; text: string } {
  const today = db.sessions.filter((s) => onSite(s, site) && sameHandle(s.handle, handle) && localDate(s.startedAt) === localDate());
  const lost = today.reduce((n, s) => n + (s.postsLost ?? 0), 0);
  const withClick = today.filter((s) => s.postClicks?.length).sort((a, b) => a.postClicks![a.postClicks!.length - 1].localeCompare(b.postClicks![b.postClicks!.length - 1]));
  const s = withClick[withClick.length - 1];
  if (!s) return { ok: false, text: 'No post was sent here today, so there is no slot to give back.' };
  const at = Date.parse(s.postClicks![s.postClicks!.length - 1]);
  const age = Date.now() - at;
  if (age < 2 * 60_000) return { ok: false, text: `That post was sent ${Math.round(age / 1000)}s ago. Give it two minutes, then look at the profile again (new posts can take a minute to show) before calling it lost.` };
  if (confirmedSince(at)) return { ok: false, text: 'A post is recorded as live here since that click (mark_posted or log_posts with its link), so the slot stays used. If that link is wrong, tell the user.' };
  if (lost >= POSTS_LOST_PER_DAY) return { ok: false, text: `${lost} posts were already given back here today. Two uploads lost in one day means something is wrong on the platform: stop posting here today and tell the user.` };
  s.postClicks!.pop();
  s.posts = Math.max(0, (s.posts ?? 0) - 1);
  s.postsLost = (s.postsLost ?? 0) + 1;
  saveLive(true);
  return { ok: true, text: '' };
}

/** The browser did something on a post. Counted here, so no AI has to be trusted to report it. */
export function recordAction(handle: string, url: string, action: SessionAction | 'post', meta: { creator?: string; title?: string; note?: string; thread?: string } = {}, site: Site = 'instagram'): Session {
  const s = openLive(handle, site);
  tick(s);
  if (action === 'post') {
    s.posts = (s.posts ?? 0) + 1;
    s.postClicks = [...(s.postClicks ?? []), new Date(Date.now()).toISOString()];
  } else {
    const key = canonicalUrl(url);
    const { thread, ...rest } = meta;
    let item = s.items.find((i) => i.url === key);
    if (!item) {
      item = { url: key, actions: [], ...rest };
      s.items.push(item);
    }
    if (action !== 'watch' || !item.actions.includes('watch')) item.actions.push(action);
    if (meta.note) item.note = meta.note;
    if (thread && canonicalUrl(thread) !== key) item.thread = canonicalUrl(thread);
    const n = (a: SessionAction): number => s.items.reduce((sum, i) => sum + i.actions.filter((x) => x === a).length, 0);
    s.likes = n('like');
    s.saves = n('save');
    s.follows = n('follow');
    s.comments = n('comment');
    if (site === 'x' || site === 'threads' || site === 'facebook') s.reposts = n('repost');
    s.messages = n('message');
    s.watched = s.items.filter((i) => !i.actions.includes('message')).length;
  }
  if (batchSec > 0 && action !== 'post' && action !== 'comment' && action !== 'message') {
    if (!batchTimer)
      batchTimer = setTimeout(() => {
        batchTimer = null;
        saveLive(true);
      }, batchSec * 1000);
  } else saveLive(true);
  return s;
}

/** log_session while a recording is open: the AI adds context; the counts stay the browser's. */
export function closeLive(handle: string, extra: { kind?: Session['kind']; minutes?: number; niche?: string; notes?: string; items?: Session['items'] }, site: Site = 'instagram'): { session: Session; ignored: number } | null {
  const s = liveSession(handle, site);
  if (!s) return null;
  tick(s);
  let ignored = 0;
  for (const it of extra.items ?? []) {
    const key = canonicalUrl(it.url);
    let item = s.items.find((i) => i.url === key);
    if (!item) {
      item = { url: key, actions: ['watch'] };
      s.items.push(item);
    }
    item.creator ??= it.creator;
    item.title ??= it.title;
    item.note ??= it.note;
    for (const a of it.actions) {
      if (a === 'watch') {
        if (!item.actions.includes('watch')) item.actions.push('watch');
      } else if (!item.actions.includes(a)) ignored++;
    }
  }
  s.watched = s.items.length;
  if (extra.kind) s.kind = extra.kind;
  if (extra.niche) s.niche = extra.niche;
  if (extra.notes) s.notes = extra.notes;
  if (extra.minutes !== undefined) s.minutes = Math.max(s.minutes, extra.minutes);
  delete s.live;
  saveLive(true);
  return { session: s, ignored };
}

export function addSession(s: Omit<Session, 'id'>): Session {
  const session: Session = { ...s, id: newId('sess') };
  commit((d) => {
    d.sessions.push(session);
    d.sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  });
  return session;
}

export function addReferences(refs: Array<Omit<Reference, 'id' | 'savedAt'> & { savedAt?: string }>): { added: Reference[]; skipped: number } {
  const added: Reference[] = [];
  let skipped = 0;
  commit((d) => {
    for (const r of refs) {
      const key = canonicalUrl(r.url);
      if (d.references.some((x) => canonicalUrl(x.url) === key)) {
        skipped++;
        continue;
      }
      const ref: Reference = { ...r, url: key, tags: r.tags ?? [], id: newId('ref'), savedAt: r.savedAt ?? now() };
      d.references.unshift(ref);
      added.push(ref);
    }
  });
  return { added, skipped };
}

// ── Reference videos ───────────────────────────────────────────────────────
/** By id, or by name (exact first, then a name that contains the words). */
export function findRefVideo(key: string): RefVideo {
  const k = key.trim().toLowerCase();
  const r = db.refVideos.find((x) => x.id === key) ?? db.refVideos.find((x) => x.name.toLowerCase() === k) ?? db.refVideos.find((x) => k.length > 2 && x.name.toLowerCase().includes(k));
  if (!r) throw new Error(`No reference video "${key}". list_reference_videos shows them.`);
  return r;
}

export function addRefVideo(r: RefVideo): RefVideo {
  commit((d) => d.refVideos.unshift(r));
  return r;
}

export function updateRefVideo(id: string, patch: { name?: string; notes?: string }): RefVideo {
  const r = findRefVideo(id);
  const next: RefVideo = { ...r };
  if (patch.name !== undefined && patch.name.trim()) next.name = patch.name.trim().slice(0, 80);
  if (patch.notes !== undefined) next.notes = patch.notes.trim().slice(0, 4000) || undefined;
  commit((d) => {
    d.refVideos = d.refVideos.map((x) => (x.id === r.id ? next : x));
  });
  return next;
}

export function deleteRefVideo(id: string): RefVideo {
  const r = findRefVideo(id);
  commit((d) => {
    d.refVideos = d.refVideos.filter((x) => x.id !== r.id);
  });
  return r;
}

export const newRefId = (): string => newId('refv');

export function deleteReference(id: string): void {
  commit((d) => {
    d.references = d.references.filter((x) => x.id !== id);
  });
}

// ── Learnings ──────────────────────────────────────────────────────────────
// ── Next run (Create > Next run) ───────────────────────────────────────────
import { cleanMix, setCustomStyles, styleById, stylesOf as stylesOfAccount } from '../shared/styles';
import type { CustomStyle, StyleInput } from '../shared/types';

export const NEXT_RUN_MAX = 2000;
const QUEUE_MAX = 30;
const IDEAS_MAX = 12;

/** With no note waiting, the first queued one becomes the note (the next run's instructions). Empty parts are dropped. */
function promote(d: Db): void {
  const n = d.nextRun;
  if (!n) return;
  if (!n.note && n.queue?.length) {
    const [head, ...rest] = n.queue;
    n.note = { text: head.text, setAt: head.addedAt };
    n.queue = rest;
  }
  if (!n.queue?.length) delete n.queue;
  if (!n.done?.length) delete n.done;
  if (!n.note && !n.queue && !n.done) delete d.nextRun;
}

const OWN_STYLES_MAX = 12;

/** Make one of the user's own channel styles, or change one (by id). */
export function saveStyle(input: StyleInput): CustomStyle {
  const name = String(input.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const rules = String(input.rules ?? '').replace(/\r\n/g, '\n').trim().slice(0, 2000);
  const about = String(input.about ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
  if (name.length < 2) throw new Error('Give the style a name.');
  if (rules.length < 20) throw new Error('Describe how a video in this style is made: a few sentences on the story, the look and how it ends.');
  const base = styleById(input.base || 'main');
  if (!base || base.custom) throw new Error('Build it on one of the built-in styles.');
  return commit((d) => {
    const list = d.customStyles ?? [];
    const old = input.id ? list.find((x) => x.id === input.id) : undefined;
    if (input.id && !old) throw new Error('That style is not one of your own (any more).');
    const label = String(input.label || old?.label || name).toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12);
    if (!label) throw new Error('The style needs a short name made of letters or numbers.');
    const taken = (k: string): boolean => {
      const s = styleById(k);
      return !!s && s.id !== old?.id;
    };
    if (label === 'krypt' || label === 'main' || taken(label)) throw new Error(`There is already a style called "${label}". Give this one another short name.`);
    if (taken(name)) throw new Error(`There is already a style called "${name}". Give this one another name.`);
    if (!old && list.length >= OWN_STYLES_MAX) throw new Error(`You can have ${OWN_STYLES_MAX} styles of your own. Delete one first.`);
    const next: CustomStyle = { id: old?.id ?? newId('style'), label, name, about: about || rules.split(/(?<=[.!?])\s/)[0].slice(0, 240), rules, base: base.id, createdAt: old?.createdAt ?? now(), updatedAt: now() };
    d.customStyles = old ? list.map((x) => (x.id === old.id ? next : x)) : [...list, next];
    setCustomStyles(d.customStyles);
    return next;
  });
}

/** Delete one of the user's own styles (by id or label). Accounts stop running it; reels already made keep their tag. */
export function deleteStyle(idOrLabel: string): CustomStyle {
  const k = String(idOrLabel ?? '').trim().toLowerCase();
  return commit((d) => {
    const s = (d.customStyles ?? []).find((x) => x.id === k || x.label === k || x.name.toLowerCase() === k);
    if (!s) throw new Error('That is not one of your own styles. The built-in ones cannot be deleted, only switched off for an account.');
    d.customStyles = d.customStyles!.filter((x) => x.id !== s.id);
    if (!d.customStyles.length) delete d.customStyles;
    for (const a of d.igAccounts) {
      if (a.styles?.includes(s.id)) {
        a.styles = a.styles.filter((x) => x !== s.id);
        if (!a.styles.length) delete a.styles;
      }
      if (a.styleMix && s.id in a.styleMix) {
        const mix = cleanMix({ ...a.styleMix, [s.id]: 0 }, stylesOfAccount(a));
        if (mix) a.styleMix = mix;
        else delete a.styleMix;
      }
    }
    setCustomStyles(d.customStyles);
    return s;
  });
}

function runText(text: string): string {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (!t) throw new Error('Write what the run should do.');
  if (t.length > NEXT_RUN_MAX) throw new Error(`Keep it under ${NEXT_RUN_MAX} characters.`);
  return t;
}

/** Add instructions to the end of the reel queue (with nothing waiting, they become the next run's note). */
export function queueRun(text: string): void {
  const t = runText(text);
  commit((d) => {
    const n = (d.nextRun ??= {});
    if ((n.queue?.length ?? 0) >= QUEUE_MAX) throw new Error(`The queue holds ${QUEUE_MAX}. Remove one first.`);
    n.queue = [...(n.queue ?? []), { id: newId('q'), text: t, addedAt: now() }];
    promote(d);
  });
}

export function unqueueRun(id: string): void {
  commit((d) => {
    if (!d.nextRun?.queue?.some((q) => q.id === id)) throw new Error('That one is not in the queue (any more).');
    d.nextRun.queue = d.nextRun.queue.filter((q) => q.id !== id);
    promote(d);
  });
}

/** Everything after the next run's note. */
export function clearQueue(): void {
  commit((d) => {
    if (d.nextRun) delete d.nextRun.queue;
    promote(d);
  });
}

export function moveQueued(id: string, by: -1 | 1): void {
  commit((d) => {
    const q = [...(d.nextRun?.queue ?? [])];
    const i = q.findIndex((x) => x.id === id);
    const j = i + (by < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= q.length) return;
    [q[i], q[j]] = [q[j], q[i]];
    d.nextRun!.queue = q;
  });
}

/** Reels the AI suggests, for the user to pick from. Newest first; the oldest fall off. */
export function proposeReels(ideas: Array<{ topic: string; hook?: string; style?: string; why?: string }>): void {
  const clean = (s: string | undefined, max: number): string | undefined => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max) || undefined;
  const fresh = ideas
    .map((i) => ({ id: newId('idea'), topic: clean(i.topic, 500) ?? '', hook: clean(i.hook, 240), style: clean(i.style, 40), why: clean(i.why, 300), at: now() }))
    .filter((i) => i.topic)
    .map((i) => Object.fromEntries(Object.entries(i).filter(([, v]) => v !== undefined)) as unknown as NonNullable<Db['reelIdeas']>[number]);
  if (!fresh.length) throw new Error('Each idea needs a topic.');
  commit((d) => {
    const seen = new Set(fresh.map((i) => i.topic.toLowerCase()));
    d.reelIdeas = [...fresh, ...(d.reelIdeas ?? []).filter((i) => !seen.has(i.topic.toLowerCase()))].slice(0, IDEAS_MAX);
  });
}

export function dropIdea(id: string): void {
  commit((d) => {
    d.reelIdeas = (d.reelIdeas ?? []).filter((i) => i.id !== id);
    if (!d.reelIdeas.length) delete d.reelIdeas;
  });
}

/** The user picked an idea: it goes to the end of the reel queue, in words a run can act on. */
export function queueIdea(id: string): void {
  const i = db.reelIdeas?.find((x) => x.id === id);
  if (!i) throw new Error('That idea is gone.');
  queueRun(`Make a reel about: ${i.topic}${/[.!?]$/.test(i.topic) ? '' : '.'}${i.hook ? ` Opening line: "${i.hook}".` : ''}${i.style ? ` Style: ${i.style}.` : ''}`);
  dropIdea(id);
}

/** The user's instructions for the next autopilot run. '' clears them. A new text is a new note: no run has had it. */
export function setNextRun(text: string): void {
  const t = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (t.length > NEXT_RUN_MAX) throw new Error(`Keep it under ${NEXT_RUN_MAX} characters.`);
  commit((d) => {
    const n = (d.nextRun ??= {});
    // Cleared: the first queued one (if any) moves up.
    if (!t) delete n.note;
    else if (n.note?.text !== t) n.note = { text: t, setAt: now() };
    promote(d);
  });
}

/** An autopilot run read the note: remember which one, so it is not handed to the run after it too. */
export function giveNextRun(report: string): void {
  const n = db.nextRun?.note;
  if (!n || n.givenTo === report) return;
  commit((d) => {
    d.nextRun!.note = { ...n, givenTo: report, givenAt: now() };
  });
}

/** The run a note was handed to has ended: the note is used, and moves to the list of done ones. */
export function settleNextRun(stillRunning: (report: string) => boolean): void {
  const n = db.nextRun?.note;
  if (!n?.givenTo || stillRunning(n.givenTo)) return;
  commit((d) => {
    d.nextRun = { queue: d.nextRun?.queue, done: [{ text: n.text, setAt: n.setAt, usedAt: n.givenAt ?? now(), report: n.givenTo }, ...(d.nextRun?.done ?? [])].slice(0, 12) };
    // The run after it gets the next one in the queue.
    promote(d);
  });
}

/** Something the Training brief is written from changed: the brief is behind from now. */
function touchTraining(d: Db): void {
  d.training = { ...trainingOf(d), touched: now() };
}

export function addLearning(text: string, reelIds?: string[]): Learning {
  for (const id of reelIds ?? []) findReel(id);
  const l: Learning = { id: newId('learn'), at: now(), text: text.trim(), ...(reelIds?.length ? { reelIds } : {}) };
  commit((d) => {
    d.learnings.unshift(l);
    touchTraining(d);
  });
  return l;
}

export function deleteLearning(id: string): void {
  commit((d) => {
    d.learnings = d.learnings.filter((x) => x.id !== id);
    touchTraining(d);
  });
}

// ── Training (the user's own feedback) ─────────────────────────────────────
/** The user's verdict on a reel. Fields left out stay; null clears one. The reel's own content and dates are not touched. */
export function setFeedback(id: string, patch: { rating?: number | null; hook?: 1 | -1 | null; note?: string | null }): Reel {
  const r = findReel(id);
  const f: ReelFeedback = { ...(r.feedback ?? {}), at: now() };
  if (patch.rating !== undefined) {
    if (patch.rating === null) delete f.rating;
    else {
      const n = Math.round(Number(patch.rating));
      if (!(n >= 1 && n <= 5)) throw new Error('A rating is 1 (never again) to 5 (more like this).');
      f.rating = n;
    }
  }
  if (patch.hook !== undefined) {
    if (patch.hook === null) delete f.hook;
    else f.hook = patch.hook === -1 ? -1 : 1;
  }
  if (patch.note !== undefined) {
    const text = (patch.note ?? '').trim().slice(0, 2000);
    if (text) f.note = text;
    else delete f.note;
  }
  const empty = f.rating === undefined && f.hook === undefined && !f.note;
  const next: Reel = { ...r };
  if (empty) delete next.feedback;
  else next.feedback = f;
  commit((d) => {
    d.reels = d.reels.map((x) => (x.id === id ? next : x));
    touchTraining(d);
  });
  return next;
}

export function addTrainingNote(input: { kind: TrainingNote['kind']; about?: TrainingNote['about']; text: string }): TrainingNote {
  const text = String(input.text ?? '').trim().slice(0, 1000);
  if (text.length < 3) throw new Error('Write what you want in a few words first.');
  const kind: TrainingNote['kind'] = input.kind === 'more' || input.kind === 'less' ? input.kind : 'rule';
  const about: TrainingNote['about'] = input.about === 'hooks' || input.about === 'topics' ? input.about : 'general';
  const n: TrainingNote = { id: newId('note'), at: now(), kind, about, text };
  commit((d) => {
    d.training = { ...trainingOf(d), notes: [n, ...trainingOf(d).notes], touched: now() };
  });
  return n;
}

export function deleteTrainingNote(id: string): void {
  commit((d) => {
    d.training = { ...trainingOf(d), notes: trainingOf(d).notes.filter((x) => x.id !== id), touched: now() };
  });
}

/** The Training brief, written by the AI. Saving one answers the user's Update. */
export function saveBrief(text: string): TrainingBrief {
  const clean = String(text ?? '').replace(/\r/g, '').trim();
  if (clean.length < 80) throw new Error('That is too short to be the brief: write the page (about 150 to 300 words).');
  if (clean.length > BRIEF_MAX_CHARS) throw new Error(`Keep the brief to one page: under ${BRIEF_MAX_CHARS} characters (this is ${clean.length}).`);
  const brief: TrainingBrief = { text: clean, at: now() };
  commit((d) => {
    const { briefAsked: _asked, ...rest } = trainingOf(d);
    d.training = { ...rest, brief };
  });
  return brief;
}

/** The user pressed Update on a Training page. */
export function askBrief(): void {
  commit((d) => {
    d.training = { ...trainingOf(d), briefAsked: now() };
  });
}

/** Mark a topic as wanted more or less; want null puts it back to normal. */
export function setTrainingTopic(input: { key?: string; name: string; want: TrainingTopic['want'] | null }): void {
  const name = String(input.name ?? '').trim().slice(0, 80);
  const key = (input.key ?? topicKeyOf(name)).trim();
  if (!key || !name) throw new Error('Name the topic first.');
  commit((d) => {
    const rest = trainingOf(d).topics.filter((x) => x.key !== key);
    d.training = { ...trainingOf(d), topics: input.want ? [{ key, name, want: input.want === 'less' ? 'less' : 'more', at: now() }, ...rest] : rest, touched: now() };
  });
}

// ── Accounts ───────────────────────────────────────────────────────────────
export function findAccount(key: string): IgAccount {
  const a = db.igAccounts.find((x) => x.id === key) ?? db.igAccounts.find((x) => sameHandle(x.handle, key));
  if (!a) throw new Error(`No account "${key}". list_accounts shows them.`);
  return a;
}

export const activeAccount = (): IgAccount | undefined => db.igAccounts.find((x) => sameHandle(x.handle, db.settings.handle));

const ymd = /^\d{4}-\d{2}-\d{2}$/;

export function saveAccount(input: AccountInput): IgAccount {
  const t = now();
  const existing = input.id ? findAccount(input.id) : input.handle ? db.igAccounts.find((x) => sameHandle(x.handle, input.handle!)) : undefined;
  if (!existing && !input.handle?.trim()) throw new Error('An account needs a handle.');
  const handle = input.handle ? normalizeHandle(input.handle) : existing!.handle;
  if (db.igAccounts.some((x) => x.id !== existing?.id && sameHandle(x.handle, handle))) throw new Error(`${handle} already exists.`);
  for (const k of ['createdOn', 'warmupStart'] as const) if (input[k] !== undefined && !ymd.test(input[k]!)) throw new Error(`${k} must be YYYY-MM-DD.`);
  if (input.browser) input = { ...input, browser: 'chrome' };
  const base: IgAccount = existing ?? {
    id: newId('acct'),
    handle,
    browser: 'chrome',
    status: 'warming',
    createdOn: input.createdOn ?? localDate(),
    warmupStart: input.warmupStart ?? input.createdOn ?? localDate(),
    setup: { avatar: false, bio: false, link: false, firstPost: false },
    createdAt: t,
    updatedAt: t,
  };
  const { setup, ...rest } = input;
  const next: IgAccount = { ...base, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), id: base.id, handle, setup: { ...base.setup, ...(setup ?? {}) }, createdAt: base.createdAt, updatedAt: t };
  if (next.chromeProfile === '') delete next.chromeProfile;
  if (next.styleMix) {
    const mix = cleanMix(next.styleMix, stylesOfAccount(next));
    if (mix) next.styleMix = mix;
    else delete next.styleMix;
  }
  if (next.clipping) next.clipping = cleanClipping(next.clipping);
  if (next.tone && !['clean', 'edgy', 'raw'].includes(next.tone)) delete next.tone;
  if (next.goals) {
    const goals = Object.fromEntries(Object.entries(next.goals).filter(([s, g]) => (['instagram', 'youtube', 'x', 'tiktok', 'facebook', 'threads', 'pinterest'] as string[]).includes(s) && (g === 'grow' || g === 'product')));
    if (Object.keys(goals).length) next.goals = goals;
    else delete next.goals;
  }
  if (next.pushProduct !== undefined && !next.pushProduct.trim()) delete next.pushProduct;
  // The user's own limits: whole numbers from 0 up, no upper bound. An empty set means "all recommended".
  if (next.limits) {
    const limits = cleanLimits(next.limits);
    if (limits) next.limits = limits;
    else delete next.limits;
  }
  if (!next.chromeDir) delete next.chromeDir;
  else if (!/^(Default|Profile \d{1,4})$/.test(next.chromeDir)) throw new Error('That is not a Chrome profile.');
  const oldHandle = existing?.handle;
  commit((d) => {
    d.igAccounts = existing ? d.igAccounts.map((x) => (x.id === next.id ? next : x)) : [...d.igAccounts, next];
    // A renamed handle carries its history and the active selection with it.
    if (oldHandle && oldHandle !== handle) {
      d.sessions.forEach((s) => sameHandle(s.handle, oldHandle) && (s.handle = handle));
      forgetDayIndex(d.sessions);
      d.accounts.forEach((s) => sameHandle(s.handle, oldHandle) && (s.handle = handle));
      if (sameHandle(d.settings.handle, oldHandle)) d.settings.handle = handle;
    }
    if (d.igAccounts.length === 1) d.settings.handle = handle;
  });
  return next;
}

/** A Short went out on the account's YouTube channel (counted for the day's ceiling). */
export function recordYtUpload(accountId: string): void {
  const a = findAccount(accountId);
  if (!a.youtube) return;
  const uploads = [...(a.youtube.uploads ?? []), now()].slice(-50);
  commit((d) => {
    d.igAccounts = d.igAccounts.map((x) => (x.id === a.id ? { ...x, youtube: { ...x.youtube!, uploads }, updatedAt: now() } : x));
  });
}

export function deleteAccount(id: string): void {
  const a = findAccount(id);
  commit((d) => {
    d.igAccounts = d.igAccounts.filter((x) => x.id !== a.id);
    if (sameHandle(d.settings.handle, a.handle) && d.igAccounts[0]) d.settings.handle = d.igAccounts[0].handle;
  });
}

export function saveBrand(patch: Partial<Brand>): Brand {
  return commit((d) => {
    const clean: Partial<Brand> = Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    if ('creator' in patch) {
      const problem = creatorProblem(patch.creator);
      if (problem) throw new Error(problem);
      const wallet = patch.creator?.wallet.trim() ?? '';
      const discord = patch.creator?.discord.trim().replace(/^@+/, '') ?? '';
      const invite = cleanInvite(patch.creator?.invite ?? '') ?? '';
      clean.creator = wallet || discord || invite ? { wallet, discord, ...(invite ? { invite } : {}) } : undefined;
    }
    d.brand = { ...d.brand, ...clean };
    if (!d.brand.creator) delete d.brand.creator;
    d.brand.site = d.brand.site.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
    return d.brand;
  });
}

export function saveAgentConfig(patch: Partial<AgentConfig>): AgentConfig {
  return commit((d) => {
    d.agent = { ...d.agent, ...patch };
    return d.agent;
  });
}

export function updateSettings(patch: Partial<Settings>): Settings {
  return commit((d) => {
    const next: Settings = { ...d.settings, ...patch };
    if ('variety' in patch && !['proven', 'balanced', 'experimental'].includes(String(patch.variety))) delete next.variety;
    if ('reelPick' in patch && !['ai', 'me'].includes(String(patch.reelPick))) delete next.reelPick;
    // null / undefined clears the default voice (back to the built-in one).
    if ('voice' in patch) {
      if (patch.voice) next.voice = cleanTune(patch.voice);
      else delete next.voice;
    }
    if ('sayAs' in patch) next.sayAs = cleanSayAs(patch.sayAs ?? []);
    if ('voiceTest' in patch) {
      const test = [...new Set((patch.voiceTest ?? []).filter((v) => /^el:[A-Za-z0-9]{8,40}$/.test(v) && v !== next.voice?.voice))].slice(0, 4);
      if (test.length) next.voiceTest = test;
      else delete next.voiceTest;
    }
    d.settings = next;
    setSayAs(next.sayAs);
    return d.settings;
  });
}

/** instagram.com/<user>/reel/<code>/ and /reel/<code>/ and /p/<code>/ all name the same post. */
export function canonicalUrl(url: string): string {
  const m = /instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels)\/([A-Za-z0-9_-]+)/.exec(url);
  return m ? `https://www.instagram.com/p/${m[1]}/` : url.trim();
}
