import { BrowserWindow, nativeImage, session as electronSession, type Session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import * as mediaFolders from './mediaFolders';

// Pictures for photo slideshows: a Pinterest search read the way a person's browser reads it, in a hidden window of
// the hub's own (never the user's Chrome, never signed in, so no account is touched), and the chosen pictures saved
// into the Images folder next to the renders. Where each one came from is kept beside it (sources.json), so a
// picture can always be traced back to its Pin.

const PARTITION = 'persist:marketo-images';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ses = (): Session => electronSession.fromPartition(PARTITION);

export interface FoundImage {
  /** Short id to save it by. */
  id: string;
  /** The small copy shown in the search. */
  thumb: string;
  /** The Pin it is on. */
  pin: string;
  /** What the Pin says it shows. */
  alt: string;
  w: number;
  h: number;
  query: string;
}

/** The pictures of the searches so far (this run of the hub), by id. */
const found = new Map<string, FoundImage>();

// Every Pin picture on the page: its address, what it says it is, its Pin and its shape.
const PINS = `(() => {
  const out = [];
  for (const img of document.querySelectorAll('img[src*="i.pinimg.com/"]')) {
    const src = img.currentSrc || img.src;
    if (!/\\/(236x|474x|564x|736x)\\//.test(src)) continue;
    const a = img.closest('a[href*="/pin/"]');
    const r = img.getBoundingClientRect();
    out.push({ src, alt: (img.alt || '').replace(/^this (may )?contains?( an image of)?:?\\s*/i, '').replace(/^pin$/i, '').trim().slice(0, 140), pin: a ? new URL(a.getAttribute('href'), location.href).href.split('?')[0] : '', w: Math.round(img.naturalWidth || r.width), h: Math.round(img.naturalHeight || r.height) });
  }
  return out;
})()`;

const BLOCKED = /just a moment|attention required|verify you are human|access denied|unusual activity/i;
/** "https://i.pinimg.com/236x/ab/cd/ef/<hash>.jpg" → its path after the size, the same for every size of a picture. */
const tail = (src: string): string => /i\.pinimg\.com\/[^/]+\/(.+)$/.exec(src)?.[1] ?? '';

/** Search Pinterest for pictures. Up to `count` (at most 40), best matches first as Pinterest orders them. */
export async function search(query: string, count = 12): Promise<FoundImage[]> {
  const q = query.trim().slice(0, 100);
  if (!q) throw new Error('Give a few words to search for.');
  const want = Math.min(40, Math.max(1, Math.floor(count)));
  const w = new BrowserWindow({ show: false, width: 1400, height: 1800, webPreferences: { session: ses(), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  w.webContents.setAudioMuted(true);
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const run = <T>(code: string): Promise<T> => w.webContents.executeJavaScript(code, true) as Promise<T>;
  try {
    await Promise.race([w.loadURL(`https://www.pinterest.com/search/pins/?q=${encodeURIComponent(q)}&rs=typed`).catch(() => {}), sleep(20_000)]);
    const seen = new Map<string, { src: string; alt: string; pin: string; w: number; h: number }>();
    const end = Date.now() + 25_000;
    let still = 0;
    while (Date.now() < end && seen.size < want && still < 6) {
      const before = seen.size;
      const list = await run<Array<{ src: string; alt: string; pin: string; w: number; h: number }>>(PINS).catch(() => []);
      for (const p of list) {
        const k = tail(p.src);
        if (k && !seen.has(k)) seen.set(k, p);
      }
      still = seen.size === before ? still + 1 : 0;
      if (seen.size >= want) break;
      // The next rows load as the page is scrolled.
      await run(`window.scrollBy(0, Math.round(window.innerHeight * 0.9))`).catch(() => {});
      await sleep(900);
    }
    if (!seen.size) {
      const text = await run<string>(`(document.title + ' ' + (document.body ? document.body.innerText.slice(0, 400) : ''))`).catch(() => '');
      if (BLOCKED.test(text)) throw new Error('Pinterest asked the hub to prove it is a person and showed no pictures. Try again in a few minutes, or use pictures from the Images folder (list_media kind images).');
      throw new Error(`Pinterest showed no pictures for "${q}". Try other words (what the picture shows, plus a look: "desk setup dark aesthetic").`);
    }
    const out: FoundImage[] = [];
    for (const [k, p] of [...seen].slice(0, want)) {
      const id = (/([0-9a-f]{10})[0-9a-f]*\.\w+$/i.exec(k)?.[1] ?? k.replace(/\W/g, '').slice(-10)).toLowerCase();
      const f: FoundImage = { id, thumb: p.src, pin: p.pin, alt: p.alt, w: p.w, h: p.h, query: q };
      found.set(id, f);
      out.push(f);
    }
    return out;
  } finally {
    w.destroy();
  }
}

async function bytes(url: string): Promise<Buffer | null> {
  try {
    const r = await ses().fetch(url, { headers: { referer: 'https://www.pinterest.com/' } });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    return b.length > 2000 ? b : null;
  } catch {
    return null;
  }
}

/** Small JPEG copies of found pictures for the AI to look at (null where one would not load). */
export async function thumbs(list: FoundImage[]): Promise<Array<{ data: string; mimeType: string } | null>> {
  return Promise.all(
    list.map(async (f) => {
      const b = await bytes(f.thumb);
      if (!b) return null;
      const img = nativeImage.createFromBuffer(b);
      if (img.isEmpty()) return null;
      const { width, height } = img.getSize();
      const r = height > 300 ? img.resize({ height: 300 }) : width > 300 ? img.resize({ width: 300 }) : img;
      return { data: r.toJPEG(70).toString('base64'), mimeType: 'image/jpeg' };
    }),
  );
}

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'pictures';

export interface SavedImage {
  id: string;
  path: string;
  w: number;
  h: number;
  pin: string;
}

/** Save found pictures (by id) into Images/<folder>, the largest copy Pinterest has. Ids from an older run of the hub are gone: search again. */
export async function save(ids: string[], folder?: string): Promise<{ saved: SavedImage[]; missing: string[]; failed: string[] }> {
  const saved: SavedImage[] = [];
  const missing: string[] = [];
  const failed: string[] = [];
  const root = mediaFolders.folder('images');
  for (const raw of ids) {
    const id = raw.trim().toLowerCase();
    const f = found.get(id);
    if (!f) {
      missing.push(raw);
      continue;
    }
    const t = tail(f.thumb);
    // The original first; some are a PNG or WebP under another extension, so the 736 px copy is the fallback.
    let data: Buffer | null = null;
    let ext = path.extname(t).toLowerCase() || '.jpg';
    for (const url of [`https://i.pinimg.com/originals/${t}`, `https://i.pinimg.com/originals/${t.replace(/\.\w+$/, '.png')}`, `https://i.pinimg.com/736x/${t}`]) {
      data = await bytes(url);
      if (data) {
        ext = path.extname(url).toLowerCase() || ext;
        break;
      }
    }
    const img = data ? nativeImage.createFromBuffer(data) : null;
    if (!data || !img || img.isEmpty()) {
      failed.push(raw);
      continue;
    }
    const dir = path.join(root, slug(folder || f.query));
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slug(f.alt).slice(0, 30) || 'pin'}-${id}${ext === '.jpeg' ? '.jpg' : ext}`);
    fs.writeFileSync(file, data);
    const { width, height } = img.getSize();
    saved.push({ id, path: file, w: width, h: height, pin: f.pin });
    note(root, { file: path.relative(root, file), pin: f.pin, query: f.query, savedAt: new Date().toISOString() });
  }
  return { saved, missing, failed };
}

/** Where each saved picture came from, beside the pictures. */
function note(root: string, row: { file: string; pin: string; query: string; savedAt: string }): void {
  const p = path.join(root, 'sources.json');
  let rows: Array<typeof row> = [];
  try {
    rows = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(rows)) rows = [];
  } catch {
    // first one
  }
  rows = rows.filter((r) => r.file !== row.file);
  rows.push(row);
  fs.writeFileSync(p, JSON.stringify(rows.slice(-2000), null, 1));
}
