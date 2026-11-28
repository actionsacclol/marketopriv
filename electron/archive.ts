import { nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import * as mediaFolders from './mediaFolders';

// Free footage and music from the Internet Archive (archive.org): its open search and file API, no key, no account.
// Only collections that are safe to put in a posted video are searched:
//   film  = the Prelinger Archives (ads, educational and industrial films, home movies; public domain)
//   music = the Great 78 Project's records from 1925 or earlier (US public domain since 2026: sound recordings
//           published before 1926 are free under the Music Modernization Act; later 78s are NOT, so they are left out)
// The Live Music Archive (concert recordings) is never searched: those are shared on the bands' trading terms,
// not public domain. A saved file goes into Footage/ or Music/ with where it came from beside it (sources.json).

export type ArchiveKind = 'film' | 'music';

export interface ArchiveItem {
  id: string;
  title: string;
  year: string;
  /** Minutes, when the archive knows it. */
  minutes: number | null;
  downloads: number;
  license: string;
  kind: ArchiveKind;
}

const API = 'https://archive.org';
const UA = 'KryptMarketo/1.0 (desktop app)';
const LAST_PD_YEAR = 1925;
const MAX_BYTES = 400e6;
/** A licence that would not let a monetised account post it (non-commercial, no derivatives). */
const RESTRICTED = /by-nc|\/nc[-/]|noncommercial|-nd[-/]|\/nd\//i;

async function json<T>(url: string, ms = 20000): Promise<T> {
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`The Internet Archive answered ${r.status} (${url.split('?')[0]}). Try again in a minute.`);
  return (await r.json()) as T;
}

const minutesOf = (v: unknown): number | null => {
  const s = String(Array.isArray(v) ? v[0] : (v ?? '')).trim();
  if (!s) return null;
  const parts = s.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) {
    const m = /(\d+(?:\.\d+)?)\s*min/i.exec(s);
    return m ? Number(m[1]) : null;
  }
  const secs = parts.reduce((acc, n) => acc * 60 + n, 0);
  return parts.length === 1 ? secs / 60 : Math.round((secs / 60) * 10) / 10;
};

const yearOf = (d: Record<string, unknown>): string => String(d.year ?? (typeof d.date === 'string' ? d.date.slice(0, 4) : '') ?? '').slice(0, 4);

/** Search one of the safe collections. Most downloaded first, so the well-known reels come up before the obscure ones. */
export async function search(query: string, kind: ArchiveKind, count = 12): Promise<ArchiveItem[]> {
  const words = query.replace(/[():"\\]/g, ' ').trim();
  const where =
    kind === 'film'
      ? 'collection:prelinger AND mediatype:movies'
      : `collection:georgeblood AND mediatype:audio AND (year:[1890 TO ${LAST_PD_YEAR}] OR date:[1890-01-01 TO ${LAST_PD_YEAR}-12-31])`;
  const q = words ? `(${words}) AND ${where}` : where;
  const fl = ['identifier', 'title', 'year', 'date', 'runtime', 'downloads', 'licenseurl'];
  const url = `${API}/advancedsearch.php?q=${encodeURIComponent(q)}&${fl.map((f) => `fl[]=${f}`).join('&')}&rows=${Math.min(30, Math.max(1, count))}&sort[]=downloads+desc&output=json`;
  const r = await json<{ response?: { docs?: Array<Record<string, unknown>> } }>(url);
  const docs = r.response?.docs ?? [];
  return docs
    .map((d) => ({
      id: String(d.identifier ?? ''),
      title: String(Array.isArray(d.title) ? d.title[0] : (d.title ?? '')).slice(0, 140),
      year: yearOf(d),
      minutes: minutesOf(d.runtime),
      downloads: Number(d.downloads) || 0,
      license: String(d.licenseurl ?? ''),
      kind,
    }))
    // A 78 whose year is missing or after the cut-off is not known to be free.
    .filter((x) => x.id && !RESTRICTED.test(x.license) && (kind === 'film' || (/^\d{4}$/.test(x.year) && Number(x.year) <= LAST_PD_YEAR)));
}

/** Each item's cover picture, small, for the AI to look at (null where there is none). */
export async function thumbs(items: ArchiveItem[]): Promise<Array<{ data: string; mimeType: string } | null>> {
  return Promise.all(
    items.map(async (it) => {
      try {
        const r = await fetch(`${API}/services/img/${encodeURIComponent(it.id)}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(12000) });
        if (!r.ok) return null;
        const img = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()));
        if (img.isEmpty()) return null;
        const { width, height } = img.getSize();
        const small = width > height ? img.resize({ width: 320 }) : img.resize({ height: 320 });
        return { data: small.toJPEG(70).toString('base64'), mimeType: 'image/jpeg' };
      } catch {
        return null;
      }
    }),
  );
}

interface ArchiveFile {
  name: string;
  format?: string;
  size?: string;
  length?: string;
  source?: string;
}

// The copies the archive makes of every upload, in the order we would rather have them: plays everywhere, small enough.
const VIDEO_FORMATS = ['h.264', 'h.264 hd', 'mpeg4', '512kb mpeg4'];
const AUDIO_FORMATS = ['vbr mp3', '128kbps mp3', '64kbps mp3', 'mp3'];

function pick(files: ArchiveFile[], kind: ArchiveKind): ArchiveFile | null {
  const want = kind === 'film' ? VIDEO_FORMATS : AUDIO_FORMATS;
  const ext = kind === 'film' ? /\.mp4$/i : /\.mp3$/i;
  const ok = files.filter((f) => ext.test(f.name) && (Number(f.size) || 0) < MAX_BYTES);
  for (const fmt of want) {
    const hit = ok.find((f) => (f.format ?? '').toLowerCase() === fmt);
    if (hit) return hit;
  }
  return ok.sort((a, b) => (Number(a.size) || 0) - (Number(b.size) || 0))[0] ?? null;
}

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'archive';

export interface SavedArchive {
  path: string;
  title: string;
  year: string;
  seconds: number | null;
  mb: number;
  credit: string;
  page: string;
  license: string;
}

/** Download one item's video (film) or record (music) into Footage/ or Music/. Already saved = the same file again. */
export async function save(id: string): Promise<SavedArchive> {
  const clean = id.trim().replace(/^https?:\/\/archive\.org\/(?:details|download)\//i, '').split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9._-]{2,100}$/.test(clean)) throw new Error(`"${id}" is not an Internet Archive id. Pass the id find_archive gave.`);
  const meta = await json<{ metadata?: Record<string, unknown>; files?: ArchiveFile[] }>(`${API}/metadata/${encodeURIComponent(clean)}`);
  const m = meta.metadata ?? {};
  const cols = ([] as unknown[]).concat(m.collection ?? []).map((c) => String(c).toLowerCase());
  const kind: ArchiveKind | null = cols.includes('prelinger') ? 'film' : cols.includes('georgeblood') ? 'music' : null;
  if (!kind) throw new Error(`${clean} is not in the Prelinger Archives or the Great 78 Project, the two collections known to be free to post. Pick one from find_archive.`);
  const year = yearOf(m);
  if (RESTRICTED.test(String(m.licenseurl ?? ''))) throw new Error(`${clean} is under a non-commercial or no-changes licence (${String(m.licenseurl)}), so it cannot go in a posted reel. Pick another.`);
  if (kind === 'music' && !(/^\d{4}$/.test(year) && Number(year) <= LAST_PD_YEAR))
    throw new Error(`${clean} is a record from ${year || 'an unknown year'}: only records from ${LAST_PD_YEAR} or earlier are public domain in the US. Pick an older one.`);
  const file = pick(meta.files ?? [], kind);
  if (!file) throw new Error(`${clean} has no ${kind === 'film' ? 'MP4' : 'MP3'} copy under ${MAX_BYTES / 1e6} MB to download.`);
  const title = String(Array.isArray(m.title) ? m.title[0] : (m.title ?? clean));
  const dir = mediaFolders.folder(kind === 'film' ? 'footage' : 'music');
  const dest = path.join(dir, `${slug(title)}-${slug(clean).slice(0, 24)}${kind === 'film' ? '.mp4' : '.mp3'}`);
  // A file's length is seconds ("882.78") or a clock ("14:42"); the item's runtime is the fallback.
  const mins = minutesOf(/:/.test(file.length ?? '') ? file.length : null) ?? (Number(file.length) > 0 ? Number(file.length) / 60 : minutesOf(m.runtime));
  const seconds = mins !== null ? Math.round(mins * 60) : null;
  const credit = kind === 'film' ? `"${title}" (Prelinger Archives, via the Internet Archive)` : `"${title}"${year ? ` (${year})` : ''} (Great 78 Project, via the Internet Archive)`;
  const out: SavedArchive = { path: dest, title, year, seconds, mb: 0, credit, page: `${API}/details/${clean}`, license: String(m.licenseurl ?? '') };
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return { ...out, mb: Math.round(fs.statSync(dest).size / 1e5) / 10 };

  const url = `${API}/download/${encodeURIComponent(clean)}/${file.name.split('/').map(encodeURIComponent).join('/')}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10 * 60_000) });
  if (!r.ok || !r.body) throw new Error(`The download of ${clean} failed (${r.status}). Try again, or pick another.`);
  const part = `${dest}.part`;
  try {
    await pipeline(Readable.fromWeb(r.body as never), fs.createWriteStream(part));
    fs.renameSync(part, dest);
  } catch (e) {
    fs.rmSync(part, { force: true });
    throw e;
  }
  note(dir, { file: path.basename(dest), id: clean, title, year, page: out.page, credit, savedAt: new Date().toISOString() });
  return { ...out, mb: Math.round(fs.statSync(dest).size / 1e5) / 10 };
}

function note(dir: string, row: Record<string, string>): void {
  const p = path.join(dir, 'sources.json');
  let rows: Array<Record<string, string>> = [];
  try {
    rows = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(rows)) rows = [];
  } catch {
    // first one
  }
  rows = rows.filter((x) => x.file !== row.file);
  rows.push(row);
  fs.writeFileSync(p, JSON.stringify(rows.slice(-2000), null, 1));
}
