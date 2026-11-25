import { nativeImage, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import * as store from './store';

// The user's own media for the meme styles, in the output folder:
//   Backgrounds/  videos to play behind narrated (Reddit / greentext) reels
//   Memes/        meme templates, reaction pictures and short clips for meme reels
//   Campaigns/    one sub-folder per Content Rewards campaign: its logo, footage and other reference files
// The user fills them (Styles page > Open folder); the AI lists them with list_media.

//   Images/       pictures for photo slideshows: saved from a Pinterest search (find_images) or dropped in by the user
export type MediaKind = 'backgrounds' | 'memes' | 'campaigns' | 'images';
const FOLDER: Record<MediaKind, string> = { backgrounds: 'Backgrounds', memes: 'Memes', campaigns: 'Campaigns', images: 'Images' };
const VIDEO = new Set(['.mp4', '.mov', '.webm', '.mkv', '.m4v']);
const IMAGE = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp']);
const MAX = 400;

export interface MediaFile {
  path: string;
  name: string;
  type: 'video' | 'image';
  mb: number;
}

/** The folder (made when missing). */
export function folder(kind: MediaKind): string {
  const d = path.join(store.get().settings.outputDir, FOLDER[kind]);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

/** A campaign's own folder under Campaigns/ (made when missing). */
export function campaignFolder(title: string): string {
  const name = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Campaign';
  const d = path.join(folder('campaigns'), name);
  fs.mkdirSync(d, { recursive: true });
  return d;
}

export async function open(kind: MediaKind, sub?: string): Promise<string> {
  const d = sub ? campaignFolder(sub) : folder(kind);
  const err = await shell.openPath(d);
  if (err) throw new Error(err);
  return d;
}

/** Its files (and one level of sub-folders), newest first; query = words that must be in the name or sub-folder. */
export function list(kind: MediaKind, query = ''): MediaFile[] {
  const root = folder(kind);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const out: Array<MediaFile & { at: number }> = [];
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX) return;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < 2) walk(p, depth + 1);
        continue;
      }
      const ext = path.extname(e.name).toLowerCase();
      const type = VIDEO.has(ext) ? 'video' : IMAGE.has(ext) ? 'image' : null;
      if (!type || (kind === 'backgrounds' && type !== 'video')) continue;
      const rel = path.relative(root, p).toLowerCase();
      if (words.some((w) => !rel.includes(w))) continue;
      try {
        const st = fs.statSync(p);
        out.push({ path: p, name: path.relative(root, p), type, mb: Math.round((st.size / 1e6) * 10) / 10, at: st.mtimeMs });
      } catch {
        // gone meanwhile
      }
    }
  };
  walk(root, 0);
  return out.sort((a, b) => b.at - a.at).map(({ at: _at, ...f }) => f);
}

/** A small JPEG of a picture for the AI to look at (null when Electron can't read the format). */
export function thumb(p: string): { data: string; mimeType: string } | null {
  try {
    const img = nativeImage.createFromPath(p);
    if (img.isEmpty()) return null;
    const { width, height } = img.getSize();
    const r = width > height ? img.resize({ width: 360 }) : img.resize({ height: 360 });
    return { data: r.toJPEG(72).toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}
