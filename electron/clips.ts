import { BrowserWindow, session as electronSession, type Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ClipListing, ClipMoment, ClipOrigin, ClipRange, ClipSite, ClipSource } from '../shared/types';
import { YT_MAX_SECONDS, clipKey, clipsPageUrl, hmsSeconds, listingFromCard, parseClipUrl, parseYouTube, replayedParts, sameMoment, spanOf, speechGrams, speechOverlap, youTubeClipUrl, type HeatMarker, type MomentSpan, type ReplayedPart } from '../shared/clipping';
import * as store from './store';
import * as profiles from './profiles';
import * as perf from './perf';

// The clipping style's eyes and hands: Twitch and Kick clips pages read the way a person's browser reads them, in a
// hidden, muted window of the hub's own (never the user's Chrome, never signed in). Kick sits behind Cloudflare, and
// a real browser window gets through where a plain request would not; the window's own session keeps that clearance.
// A clips list comes off the page itself; a clip's video is the file the clip page plays: an MP4 on Twitch, an HLS
// playlist of MPEG-TS byte ranges on Kick (joined here; the renderer turns it into an MP4).

const PARTITION = 'persist:marketo-clips';
const MAX_BYTES = 400 * 1024 * 1024;
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Kick's clip page asks for the chat replay from the clip's own start (web.kick.com/api/v1/chat/<id>/history?
// start_time=<ISO>): the page's own request, seen as it goes out, by the window that sent it.
const chatStart = new Map<number, string>();
let watching = false;
const ses = (): Session => {
  const s = electronSession.fromPartition(PARTITION);
  if (!watching) {
    watching = true;
    s.webRequest.onBeforeRequest({ urls: ['https://web.kick.com/api/v1/chat/*'] }, (d, cb) => {
      const m = /history\?(?:.*&)?start_time=([^&]+)/.exec(d.url);
      if (m && d.webContentsId != null && !chatStart.has(d.webContentsId)) chatStart.set(d.webContentsId, decodeURIComponent(m[1]));
      cb({});
    });
  }
  return s;
};

async function withPage<T>(url: string, fn: (w: BrowserWindow) => Promise<T>): Promise<T> {
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: ses(), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  // Clip pages start playing with sound; a hidden window must never make noise.
  w.webContents.setAudioMuted(true);
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  try {
    // Ads and trackers failing to load make loadURL reject although the page itself loaded; the checks below decide.
    // A page that never finishes loading (a video that keeps streaming, a slow PC) must not hold the call for
    // minutes: after 20 s the checks below look at whatever has loaded.
    await Promise.race([w.loadURL(url).catch(() => {}), sleep(20_000)]);
    return await fn(w);
  } finally {
    chatStart.delete(w.webContents.id);
    w.destroy();
  }
}

const run = <T>(w: BrowserWindow, code: string): Promise<T> => w.webContents.executeJavaScript(code, true) as Promise<T>;

/** Wait until the page passes `test` (JavaScript returning true), up to `ms`. */
async function until(w: BrowserWindow, test: string, ms: number): Promise<boolean> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await run<boolean>(w, `!!(${test})`).catch(() => false)) return true;
    await sleep(500);
  }
  return false;
}

// Every clip link on the page grouped into its card: the largest element around a link that holds no other clip.
const CARDS = `(() => {
  const isClip = (h) => /\\/clips\\/clip_[A-Za-z0-9]+|\\/clip\\/[A-Za-z0-9_-]+/.test(h || '');
  const abs = (h) => new URL(h, location.href).href.split('?')[0].split('#')[0];
  const byHref = new Map();
  for (const a of document.querySelectorAll('a[href]')) {
    const h = a.getAttribute('href');
    if (!isClip(h)) continue;
    const k = abs(h);
    if (!byHref.has(k)) byHref.set(k, a);
  }
  const out = [];
  for (const [href, a] of byHref) {
    let card = a;
    for (let p = a.parentElement; p && p !== document.body; p = p.parentElement) {
      const n = new Set([...p.querySelectorAll('a[href]')].map((x) => x.getAttribute('href')).filter(isClip).map(abs));
      if (n.size > 1) break;
      card = p;
    }
    out.push({ href, lines: (card.innerText || '').split('\\n').map((s) => s.trim()).filter(Boolean).slice(0, 12) });
  }
  return out;
})()`;

const BLOCKED = /just a moment|attention required|verify you are human|access denied/i;

// ── Where each clip sits in its stream (the same-moment check, shared/clipping.ts) ──
// A clip's moment never changes, so each one is read once and kept, with its length and, once saved, what it says.

export interface KnownClip {
  moment: ClipMoment | null;
  seconds: number | null;
  /** Caption lines from save_clip ("start | text"). */
  said?: string;
}
let known: Record<string, KnownClip> | null = null;
const knownFile = (): string => path.join(profiles.dir(profiles.MAIN), 'clip-moments.json');
function knownAll(): Record<string, KnownClip> {
  if (!known) {
    try {
      known = JSON.parse(fs.readFileSync(knownFile(), 'utf8')) as Record<string, KnownClip>;
    } catch {
      known = {};
    }
  }
  return known;
}
export const knownClip = (url: string): KnownClip | null => {
  const k = clipKey(url);
  return k ? (knownAll()[k] ?? null) : null;
};
export function remember(url: string, patch: Partial<KnownClip>): void {
  const k = clipKey(url);
  if (!k) return;
  const all = knownAll();
  const was = all[k] ?? { moment: null, seconds: null };
  delete all[k];
  all[k] = { ...was, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== null)) };
  // Oldest first out once there are many.
  const keys = Object.keys(all);
  for (const old of keys.slice(0, Math.max(0, keys.length - 5000))) delete all[old];
  try {
    fs.writeFileSync(knownFile(), JSON.stringify(all));
  } catch {
    // Only a memory; the next read finds the moment again.
  }
}

/** The clips the open profile's reels use (reel field source), with their moments and speech where known. */
export function usedClips(): Array<{ key: string; url: string; reel: { id: string; title: string }; span: MomentSpan | null; said: string }> {
  const out: ReturnType<typeof usedClips> = [];
  for (const r of store.get().reels) {
    const url = String(r.fields.source ?? '');
    const key = clipKey(url);
    if (!key) continue;
    const k = knownAll()[key];
    out.push({ key, url, reel: { id: r.id, title: r.title }, span: k?.moment && k.seconds ? spanOf(k.moment, 0, k.seconds) : null, said: k?.said ?? '' });
  }
  return out;
}

/** Speech shared with a used clip's at or above this share of the smaller one counts as the same moment. */
const SAME_SPEECH = 0.5;

/**
 * After save_clip: keep the clip's length and what it says, and name any reel whose clip is the same moment (by
 * where both sit in the stream, else by what they say).
 */
export function checkSaved(url: string, seconds: number, said: string): string[] {
  remember(url, { seconds: Math.round(seconds), said });
  const k = knownClip(url);
  const key = clipKey(url);
  const mine = k?.moment ? spanOf(k.moment, 0, seconds) : null;
  const grams = speechGrams(said);
  const out: string[] = [];
  for (const u of usedClips()) {
    if (u.key === key) {
      out.push(`reel "${u.reel.title}" (${u.reel.id}) already uses this exact clip`);
      continue;
    }
    if (mine && u.span && sameMoment(mine, u.span)) out.push(`reel "${u.reel.title}" (${u.reel.id}) uses the same moment, clipped by someone else (${u.url})`);
    else if (u.said && speechOverlap(grams, speechGrams(u.said)) >= SAME_SPEECH) out.push(`reel "${u.reel.title}" (${u.reel.id}) says the same words: very likely the same moment (${u.url})`);
  }
  return out;
}

const VOD_LINK = `(() => { const a = [...document.querySelectorAll('a[href*="/videos/"]')].find((x) => /[?&]t=/.test(x.href)); return a ? a.href : ''; })()`;

/** The clip's moment, off its open page: Twitch's "Watch Full Video" link, Kick's chat replay start. */
async function momentOn(w: BrowserWindow, site: ClipSite, channel: string, ms: number): Promise<ClipMoment | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (site === 'kick') {
      const iso = chatStart.get(w.webContents.id);
      const t = iso ? Date.parse(iso) : NaN;
      if (Number.isFinite(t) && channel) return { stream: `kick:${channel}`, start: Math.round(t / 1000) };
    } else {
      const href = await run<string>(w, VOD_LINK).catch(() => '');
      const m = /\/videos\/(\d+)\?(?:.*&)?t=([0-9hms]+)/.exec(href);
      const at = m ? hmsSeconds(m[2]) : null;
      if (m && at !== null) return { stream: `twitch:${m[1]}`, start: at };
    }
    await sleep(500);
  }
  return null;
}

/** Fill in each listing's moment: kept ones at once, the rest by opening their pages, three at a time (one with lightClips). */
async function withMoments(list: ClipListing[]): Promise<ClipListing[]> {
  // Read once (a clip whose page shows no moment, a Twitch clip without a saved VOD, is not opened again), and at
  // most ~30 s per streamer: the rest are read on the next look (an AI app gives up on a call that takes minutes).
  const queue = list.filter((c) => !knownClip(c.url));
  const until = Date.now() + 30_000;
  // Light clips (Setup > Performance): one hidden window, the same queue one page after another.
  const windows = perf.values().lightClips ? [0] : [0, 1, 2];
  await Promise.all(
    windows.map(async () => {
      for (let c = queue.shift(); c && Date.now() < until; c = queue.shift()) {
        const one = c;
        const moment = await withPage(one.url, (w) => momentOn(w, one.site, one.channel, 12_000)).catch(() => null);
        remember(one.url, { moment, seconds: one.seconds });
      }
    }),
  );
  return list.map((c) => ({ ...c, moment: knownClip(c.url)?.moment ?? null }));
}

/** The streamer's top clips over the range, best first, as the page lists them. */
export async function findClips(source: ClipSource, range: ClipRange, limit = 12): Promise<ClipListing[]> {
  const url = clipsPageUrl(source, range);
  return withPage(url, async (w) => {
    const own = source.site === 'kick' ? `/${source.channel}/clips/clip_` : `/${source.channel}/clip/`;
    const found = await until(w, `[...document.querySelectorAll('a[href]')].some((a) => (a.getAttribute('href') || '').toLowerCase().includes(${JSON.stringify(own)}))`, 25_000);
    if (!found) {
      const title = await run<string>(w, 'document.title').catch(() => '');
      const text = await run<string>(w, `(document.body && document.body.innerText || '').slice(0, 400)`).catch(() => '');
      if (BLOCKED.test(`${title} ${text}`)) throw new Error(`${source.site === 'kick' ? 'Kick' : 'Twitch'} showed a human check instead of the clips page. Try again later.`);
      if (/not found|doesn't exist|does not exist|page you are looking for|unavailable/i.test(`${title} ${text}`)) throw new Error(`No ${source.site === 'kick' ? 'Kick' : 'Twitch'} channel "${source.channel}".`);
      return [];
    }
    // Lazy rows: one scroll brings in the next few.
    await run(w, 'window.scrollTo(0, document.body.scrollHeight)').catch(() => {});
    await sleep(1500);
    const cards = await run<Array<{ href: string; lines: string[] }>>(w, CARDS);
    return cards
      .filter((c) => c.href.toLowerCase().includes(own))
      .map((c) => listingFromCard(source.site, source.channel, parseClipUrl(c.href)?.url ?? c.href, c.lines))
      .slice(0, limit);
  }).then(withMoments);
}

export interface FetchedClip {
  bytes: Uint8Array;
  /** mp4 = ready to use; ts = MPEG-TS that the renderer remuxes into an MP4; rec = a recording (fragmented MP4) it remuxes too. */
  kind: 'mp4' | 'ts' | 'rec';
  site: ClipOrigin;
  channel: string;
  url: string;
  title: string;
  moment: ClipMoment | null;
}

async function getBytes(s: Session, url: string, range?: [number, number]): Promise<Uint8Array> {
  const res = await s.fetch(url, range ? { headers: { Range: `bytes=${range[0]}-${range[1]}` } } : undefined);
  if (!res.ok) throw new Error(`The clip's video answered ${res.status}.`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) throw new Error('That clip is too large to use.');
  return buf;
}

interface Piece {
  uri: string;
  off: number | null;
  len: number | null;
}

/** An HLS media playlist's pieces in order: whole files, or byte ranges inside one (Kick's clips). */
function pieces(text: string, base: string): { init: Piece | null; list: Piece[] } {
  const list: Piece[] = [];
  let init: Piece | null = null;
  let range: { len: number; off: number | null } | null = null;
  const nextOff = new Map<string, number>();
  const parseRange = (v: string): { len: number; off: number | null } => {
    const [len, off] = v.split('@');
    return { len: Number(len), off: off === undefined ? null : Number(off) };
  };
  for (const raw of text.split(/\r?\n/)) {
    const l = raw.trim();
    if (!l) continue;
    if (l.startsWith('#EXT-X-MAP:')) {
      const uri = /URI="([^"]+)"/.exec(l)?.[1];
      const br = /BYTERANGE="([^"]+)"/.exec(l)?.[1];
      if (uri) {
        const r = br ? parseRange(br) : null;
        init = { uri: new URL(uri, base).href, off: r?.off ?? (r ? 0 : null), len: r?.len ?? null };
      }
    } else if (l.startsWith('#EXT-X-BYTERANGE:')) range = parseRange(l.slice('#EXT-X-BYTERANGE:'.length));
    else if (!l.startsWith('#')) {
      const uri = new URL(l, base).href;
      if (range) {
        const off = range.off ?? nextOff.get(uri) ?? 0;
        list.push({ uri, off, len: range.len });
        nextOff.set(uri, off + range.len);
      } else list.push({ uri, off: null, len: null });
      range = null;
    }
  }
  return { init, list };
}

/** Fetch an HLS stream's pieces and join them, merging neighbouring byte ranges of one file into one request. */
async function hls(s: Session, playlistUrl: string): Promise<{ bytes: Uint8Array; kind: 'mp4' | 'ts' }> {
  let url = playlistUrl;
  let text = new TextDecoder().decode(await getBytes(s, url));
  // A master playlist: take the best stream it offers.
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split(/\r?\n/);
    let best: { bw: number; uri: string } | null = null;
    lines.forEach((l, i) => {
      if (!l.startsWith('#EXT-X-STREAM-INF')) return;
      const bw = Number(/BANDWIDTH=(\d+)/.exec(l)?.[1] ?? 0);
      const uri = lines.slice(i + 1).find((x) => x.trim() && !x.startsWith('#'))?.trim();
      if (uri && (!best || bw > best.bw)) best = { bw, uri };
    });
    if (!best) throw new Error('The clip has no playable stream.');
    url = new URL((best as { uri: string }).uri, url).href;
    text = new TextDecoder().decode(await getBytes(s, url));
  }
  const { init, list } = pieces(text, url);
  if (!list.length) throw new Error('The clip has no video in it.');
  const runs: Piece[] = [];
  for (const p of list) {
    const last = runs[runs.length - 1];
    if (last && p.off !== null && last.off !== null && last.len !== null && p.len !== null && last.uri === p.uri && last.off + last.len === p.off) last.len += p.len;
    else runs.push({ ...p });
  }
  const parts: Uint8Array[] = [];
  let total = 0;
  for (const p of init ? [init, ...runs] : runs) {
    const b = await getBytes(s, p.uri, p.off !== null && p.len !== null ? [p.off, p.off + p.len - 1] : undefined);
    total += b.byteLength;
    if (total > MAX_BYTES) throw new Error('That clip is too large to use.');
    parts.push(b);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const b of parts) {
    out.set(b, at);
    at += b.byteLength;
  }
  // fMP4 segments with an init section are an MP4 already; plain segments are MPEG-TS.
  return { bytes: out, kind: init ? 'mp4' : 'ts' };
}

/** Download one clip: open its page like a viewer and take the video the page plays (YouTube: record the part). */
export async function fetchClip(url: string, span: { start?: number; seconds?: number } = {}): Promise<FetchedClip> {
  if (parseYouTube(url)) return recordYouTube(url, span);
  const c = parseClipUrl(url);
  if (!c || c.site === 'youtube') throw new Error(`"${url}" is not a Twitch or Kick clip address (kick.com/<channel>/clips/clip_..., twitch.tv/<channel>/clip/...).`);
  return withPage(c.url, async (w) => {
    // The video the page plays: a direct file (Twitch), or the HLS playlist the player loaded (Kick).
    const SRC = `(() => {
      const v = [...document.querySelectorAll('video')].map((x) => x.currentSrc || x.src).find((s) => /^https:/.test(s || '') && !/\\/ads\\//.test(s));
      const pl = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /\\.m3u8(\\?|$)/.test(n) && /clip/i.test(n));
      return v || pl || '';
    })()`;
    const ok = await until(w, SRC, 25_000);
    if (!ok) {
      const text = `${await run<string>(w, 'document.title').catch(() => '')} ${await run<string>(w, `(document.body && document.body.innerText || '').slice(0, 400)`).catch(() => '')}`;
      if (BLOCKED.test(text)) throw new Error(`${c.site === 'kick' ? 'Kick' : 'Twitch'} showed a human check instead of the clip. Try again later.`);
      throw new Error('The clip page did not play a video (deleted, private, or age-gated).');
    }
    const src = await run<string>(w, SRC);
    // The clip's own name: Twitch fills it in a few seconds after the player starts (until then the page says only
    // "Twitch" or "<channel> - Twitch"). Read og:title, the tab title and the description, and take the first one
    // that names the clip. "$260k Plinko Squirter - Syztmz Clip on KICK", "smol shroud - shroud on Twitch",
    // "smol shroud - Twitch", 'Watch shroud's ... clip titled "smol shroud" on Twitch.'
    const TITLE = `(() => {
      const ch = location.pathname.split('/').filter(Boolean)[0] || '';
      const meta = (k) => (document.querySelector('meta[property="' + k + '"]') || {}).content || '';
      const strip = (s) => s.replace(/\\s+-\\s+\\S+\\s+Clip on KICK$/i, '').replace(/\\s+-\\s+\\S+\\s+on Twitch$/i, '').replace(/\\s+-\\s+Twitch$/i, '').replace(/^Twitch$/i, '').trim();
      const titled = (meta('og:description').match(/titled "(.+)" on/) || [])[1] || '';
      const name = [meta('og:title'), document.title].map(strip).find((s) => s && s.toLowerCase() !== ch.toLowerCase()) || titled;
      return { title: name, channel: ch };
    })()`;
    await until(w, `!!${TITLE}.title`, 12_000);
    const page = await run<{ title: string; channel: string }>(w, TITLE);
    const title = page.title;
    const channel = (c.channel || page.channel).toLowerCase();
    const site = c.site as ClipSite;
    const moment = knownClip(c.url)?.moment ?? (await momentOn(w, site, channel, 6_000));
    if (moment) remember(c.url, { moment });
    const s = w.webContents.session;
    const got = /\.m3u8(\?|$)/.test(src) ? await hls(s, src) : { bytes: await getBytes(s, src), kind: 'mp4' as const };
    return { ...got, site: c.site, channel, url: c.url, title, moment };
  });
}

// ── YouTube ─────────────────────────────────────────────────────────────────
// A part of any YouTube video. The parts worth clipping come off the video's own "most replayed" graph (the data its
// watch page carries for the progress bar). The part itself is recorded off the page as it plays, in a hidden and
// muted window: the video element's own stream (its picture and sound, no player buttons), so it takes as long as
// the part. No downloader: only what the page plays a viewer.

export interface YouTubeVideo {
  id: string;
  url: string;
  title: string;
  channel: string;
  seconds: number;
  views: number | null;
  short: boolean;
  live: boolean;
  /** Why it can't be played here (age check, private, members only), or ''. */
  blocked: string;
  heat: HeatMarker[];
  chapters: Array<{ start: number; title: string }>;
  parts: ReplayedPart[];
}

/** The watch page's own data: title, channel, length, the replay graph and chapters. */
const YT_INFO = `(() => {
  const p = window.ytInitialPlayerResponse;
  const d = window.ytInitialData;
  if (!p || !p.videoDetails) return null;
  const v = p.videoDetails;
  const ps = p.playabilityStatus || {};
  const heat = [];
  const chapters = [];
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 45) return;
    if (o.markersList && o.markersList.markerType === 'MARKER_TYPE_HEATMAP' && Array.isArray(o.markersList.markers) && !heat.length)
      for (const m of o.markersList.markers) heat.push({ start: Number(m.startMillis) / 1000, dur: Number(m.durationMillis) / 1000, v: Number(m.intensityScoreNormalized) });
    if (Array.isArray(o.heatMarkers) && !heat.length)
      for (const h of o.heatMarkers) { const m = h.heatMarkerRenderer || {}; heat.push({ start: Number(m.timeRangeStartMillis) / 1000, dur: Number(m.markerDurationMillis) / 1000, v: Number(m.heatMarkerIntensityScoreNormalized) }); }
    if (o.chapterRenderer) {
      const c = o.chapterRenderer;
      const t = (c.title && (c.title.simpleText || (c.title.runs || []).map((r) => r.text).join(''))) || '';
      const at = Number(c.timeRangeStartMillis) / 1000;
      if (t && Number.isFinite(at) && !chapters.some((x) => x.start === at)) chapters.push({ start: at, title: t });
    }
    for (const k in o) walk(o[k], depth + 1);
  };
  walk(d, 0);
  walk(p, 0);
  const views = Number(v.viewCount);
  return {
    id: v.videoId || '',
    title: v.title || '',
    channel: v.author || '',
    seconds: Number(v.lengthSeconds) || 0,
    views: Number.isFinite(views) ? views : null,
    live: !!v.isLiveContent && !!v.isLive,
    status: ps.status || 'OK',
    reason: ps.reason || (ps.errorScreen && ps.errorScreen.playerErrorMessageRenderer && ps.errorScreen.playerErrorMessageRenderer.reason && ps.errorScreen.playerErrorMessageRenderer.reason.simpleText) || '',
    heat,
    chapters: chapters.sort((a, b) => a.start - b.start),
  };
})()`;

/** Off a consent page (outside the US): "Reject all", the choice that shares the least. */
const YT_CONSENT = `(() => {
  if (!/consent\\./.test(location.hostname)) return false;
  const b = [...document.querySelectorAll('button, [role=button], input[type=submit]')].find((x) => /reject all|alle ablehnen|tout refuser|rechazar todo|rifiuta tutto/i.test((x.innerText || x.value || x.getAttribute('aria-label') || '').trim()));
  if (b) b.click();
  return true;
})()`;

const ytUrl = (id: string, start?: number): string => `https://www.youtube.com/watch?v=${id}${start ? `&t=${Math.floor(start)}s` : ''}`;

async function ytInfo(w: BrowserWindow, id: string): Promise<YouTubeVideo> {
  type Info = Omit<YouTubeVideo, 'url' | 'short' | 'blocked' | 'parts'> & { status: string; reason: string };
  let info = null as Info | null;
  // The first visit to YouTube in a fresh session reloads the page once (a theme / sign-in check): read until it settles.
  const end = Date.now() + 30_000;
  while (Date.now() < end) {
    if (await run<boolean>(w, YT_CONSENT).catch(() => false)) {
      await sleep(2500);
      continue;
    }
    const got = await run<Info | null>(w, YT_INFO).catch(() => null);
    if (got && got.id === id) {
      info = got;
      // The replay graph can arrive a moment after the page's first data.
      if (got.heat.length || Date.now() > end - 22_000) break;
    }
    await sleep(700);
  }
  if (!info) {
    const text = `${await run<string>(w, 'document.title').catch(() => '')} ${await run<string>(w, `(document.body && document.body.innerText || '').slice(0, 400)`).catch(() => '')}`;
    if (BLOCKED.test(text) || /unusual traffic/i.test(text)) throw new Error('YouTube showed a human check instead of the video. Try again later.');
    throw new Error('The YouTube page did not load the video. Check the address, or try again.');
  }
  const blocked =
    info.status === 'OK'
      ? ''
      : info.status === 'LOGIN_REQUIRED'
        ? `YouTube asks to sign in for this video (${info.reason || 'age-restricted or private'}): it can't be clipped here.`
        : `YouTube won't play this video here (${info.reason || info.status}).`;
  const short = info.seconds <= 180 && !info.heat.length;
  return {
    ...info,
    url: ytUrl(id),
    short,
    blocked,
    parts: replayedParts(info.heat, info.seconds),
  };
}

/** A YouTube video's details and its most replayed parts (find_clips with a video). */
export async function findYouTubeParts(url: string): Promise<YouTubeVideo> {
  const yt = parseYouTube(url);
  if (!yt) throw new Error(`"${url}" is not a YouTube video address.`);
  const v = await withPage(ytUrl(yt.id), (w) => ytInfo(w, yt.id));
  return { ...v, short: v.short || yt.short };
}

/** True while YouTube plays an ad in the player (the video element plays the ad then). */
const YT_AD = `(() => { const p = document.getElementById('movie_player'); return !!(p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'))); })()`;
/** The ad's Skip button, where it sits (a real click: a script click is ignored). */
const YT_SKIP = `(() => { const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`;

async function realClick(w: BrowserWindow, x: number, y: number): Promise<void> {
  const at = { x: Math.round(x), y: Math.round(y) };
  w.webContents.sendInputEvent({ type: 'mouseMove', ...at });
  await sleep(rand(60, 140));
  w.webContents.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  await sleep(rand(50, 110));
  w.webContents.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
}
const rand = (a: number, b: number): number => a + Math.random() * (b - a);

/** Sit out the ads before the video (skipping when YouTube offers it), up to two minutes. */
async function pastAds(w: BrowserWindow): Promise<void> {
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    if (!(await run<boolean>(w, YT_AD).catch(() => false))) return;
    const skip = await run<{ x: number; y: number } | null>(w, YT_SKIP).catch(() => null);
    if (skip) await realClick(w, skip.x, skip.y);
    await sleep(800);
  }
  throw new Error('YouTube kept playing ads for two minutes. Try again later.');
}

/**
 * The recorder, run in the page: seek to the part, wait for it to buffer, then record the video element's own stream
 * until the video reaches the part's end. Recording pauses while the video waits for data or an ad plays, so neither
 * ends up in the clip. State in window.__krec, the file in window.__kbuf.
 */
const YT_RECORD = (start: number, seconds: number, light = false): string => `(async () => {
  const st = (window.__krec = { state: 'starting', err: '', t0: 0, t1: 0, w: 0, h: 0, mime: '', size: 0 });
  try {
    const p = document.getElementById('movie_player');
    const v = document.querySelector('#movie_player video') || document.querySelector('video');
    if (!p || !v) throw new Error('The player is not on the page.');
    try { p.setPlaybackQualityRange && p.setPlaybackQualityRange('${light ? 'hd720' : 'hd1080'}', '${light ? 'hd720' : 'hd1080'}'); } catch {}
    try { p.unMute && p.unMute(); p.setVolume && p.setVolume(100); } catch {}
    v.muted = false;
    v.volume = 1;
    const now = () => (p.getCurrentTime ? p.getCurrentTime() : v.currentTime);
    const ad = () => p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting');
    try { p.pauseVideo ? p.pauseVideo() : v.pause(); } catch {}
    if (p.seekTo) p.seekTo(${start}, true); else v.currentTime = ${start};
    // Let the start of the part buffer first (up to 10 s), so the recording does not open on a frozen picture.
    for (let i = 0; i < 100; i++) {
      const b = v.buffered;
      let ahead = 0;
      for (let k = 0; k < b.length; k++) if (b.start(k) <= v.currentTime + 0.2 && b.end(k) > v.currentTime) ahead = b.end(k) - v.currentTime;
      if (ahead >= Math.min(${seconds}, 12) && v.readyState >= 3) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const types = ['video/mp4;codecs=avc1.640028,opus', 'video/mp4;codecs=avc1.4d0028,opus', 'video/mp4;codecs=avc1,opus', 'video/mp4'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) throw new Error('This computer cannot record MP4 video.');
    const stream = v.captureStream();
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: ${light ? '5e6' : '8e6'}, audioBitsPerSecond: 160e3 });
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const stopped = new Promise((r) => (rec.onstop = r));
    await (p.playVideo ? (p.playVideo(), Promise.resolve()) : v.play());
    for (let i = 0; i < 50 && v.paused; i++) await new Promise((r) => setTimeout(r, 100));
    st.t0 = now();
    st.mime = mime;
    rec.start(1000);
    st.state = 'recording';
    const until = ${start} + ${seconds};
    const hardEnd = Date.now() + (${seconds} * 3 + 120) * 1000;
    while (Date.now() < hardEnd) {
      await new Promise((r) => setTimeout(r, 50));
      const holding = ad() || v.readyState < 3 || v.seeking || v.paused;
      if (holding && rec.state === 'recording') rec.pause();
      else if (!holding && rec.state === 'paused') rec.resume();
      if (v.paused && !ad() && !v.ended) { try { p.playVideo ? p.playVideo() : v.play(); } catch {} }
      if (!ad() && (now() >= until || v.ended)) break;
    }
    st.t1 = now();
    st.w = v.videoWidth;
    st.h = v.videoHeight;
    rec.stop();
    await stopped;
    try { p.pauseVideo ? p.pauseVideo() : v.pause(); } catch {}
    const blob = new Blob(parts, { type: mime });
    window.__kbuf = new Uint8Array(await blob.arrayBuffer());
    st.size = window.__kbuf.length;
    st.state = 'done';
  } catch (e) {
    st.err = String((e && e.message) || e);
    st.state = 'error';
  }
})(), true`;

const YT_SLICE = (from: number, len: number): string => `(() => {
  const b = window.__kbuf.subarray(${from}, ${from + len});
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
})()`;

/** Record a part of a YouTube video off its page (start / seconds into the video; default: a whole Short, else 30 s). */
export async function recordYouTube(url: string, span: { start?: number; seconds?: number } = {}): Promise<FetchedClip> {
  const yt = parseYouTube(url);
  if (!yt) throw new Error(`"${url}" is not a YouTube video address.`);
  const askedStart = Math.max(0, span.start ?? yt.start ?? 0);
  return withPage(ytUrl(yt.id, askedStart), async (w) => {
    const info = await ytInfo(w, yt.id);
    if (info.blocked) throw new Error(info.blocked);
    if (info.live) throw new Error('That video is live right now. Clip it once the stream is over (its replay is a normal video then).');
    const length = info.seconds || askedStart + (span.seconds ?? 30);
    if (askedStart >= length - 1) throw new Error(`The video is only ${Math.floor(length)} s long: start inside it.`);
    const want = span.seconds ?? (yt.short || info.short ? length - askedStart : 30);
    const seconds = Math.max(3, Math.min(YT_MAX_SECONDS, want, length - askedStart));
    await pastAds(w);
    const ok = await until(w, `!!document.querySelector('#movie_player video') && document.querySelector('#movie_player video').readyState >= 1`, 20_000);
    if (!ok) throw new Error('The YouTube player did not start. Try again.');
    // Light clips: the part at 720p, ~5 Mbps.
    await run(w, YT_RECORD(askedStart, seconds, perf.values().lightClips));
    type Rec = { state: string; err: string; t0: number; t1: number; w: number; h: number; mime: string; size: number };
    let st: Rec | null = null;
    const end = Date.now() + (seconds * 3 + 150) * 1000;
    while (Date.now() < end) {
      await sleep(1000);
      st = await run<Rec>(w, 'window.__krec').catch(() => st);
      if (!st || st.state === 'done' || st.state === 'error') break;
      // A mid-roll ad: the recorder holds; skip it when YouTube lets us.
      const skip = await run<{ x: number; y: number } | null>(w, YT_SKIP).catch(() => null);
      if (skip) await realClick(w, skip.x, skip.y);
    }
    if (!st || st.state === 'error') throw new Error(`Recording the video failed${st?.err ? `: ${st.err}` : ''}.`);
    if (st.state !== 'done') throw new Error('Recording the video took far too long (the page stalled). Try again.');
    if (st.size > MAX_BYTES) throw new Error('That part is too large to use.');
    if (st.size < 10_000) throw new Error('The recording came out empty. Try again.');
    const chunks: Buffer[] = [];
    const STEP = 4 * 1024 * 1024;
    for (let at = 0; at < st.size; at += STEP) chunks.push(Buffer.from(await run<string>(w, YT_SLICE(at, STEP)), 'base64'));
    await run(w, 'window.__kbuf = null').catch(() => {});
    const start = Math.round(st.t0 * 10) / 10;
    const clipUrl = youTubeClipUrl(yt.id, start);
    const moment: ClipMoment = { stream: `youtube:${yt.id}`, start: Math.round(start) };
    remember(clipUrl, { moment, seconds: Math.round(st.t1 - st.t0) });
    return { bytes: new Uint8Array(Buffer.concat(chunks)), kind: 'rec' as const, site: 'youtube' as const, channel: info.channel, url: clipUrl, title: info.title, moment };
  });
}

/** Save a clip (already an MP4) in the output folder's Clips folder; returns its path. */
export function save(bytes: Uint8Array, name: string): string {
  const dir = path.join(store.get().settings.outputDir, 'Clips');
  fs.mkdirSync(dir, { recursive: true });
  const base = (name.replace(/\.mp4$/i, '').trim() || 'clip').replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 70);
  const file = path.join(dir, `${base}.mp4`);
  fs.writeFileSync(file, bytes);
  return file;
}
