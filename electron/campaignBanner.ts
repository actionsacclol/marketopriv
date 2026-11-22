import fs from 'node:fs';
import path from 'node:path';
import * as store from './store';
import { campaignFolder } from './mediaFolders';

// A campaign's ad banner (Create > Campaigns): some Content Rewards campaigns want their banner on every clip. The
// user uploads it, or the AI (Kip, a run) gives a link from the campaign page or a file from its folder. The hub
// keeps one copy in the campaign's folder and every reel made for the campaign draws it near the bottom.

/** Bigger than any banner needs to be. */
const MAX_BYTES = 15 * 1024 * 1024;

/** What the first bytes say the file is (only pictures are taken). */
function kindOf(b: Buffer): 'png' | 'jpg' | 'webp' | 'gif' | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  return null;
}

/** Share links that show a page instead of the file: the link to the file itself. */
export function directLink(url: string): string {
  const drive = /drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:.*&)?id=)([\w-]{10,})/i.exec(url);
  if (drive) return `https://drive.google.com/uc?export=download&id=${drive[1]}`;
  if (/^https:\/\/(www\.)?dropbox\.com\//i.test(url)) {
    try {
      const u = new URL(url);
      u.searchParams.set('dl', '1');
      return u.toString();
    } catch {
      return url;
    }
  }
  return url;
}

async function download(url: string): Promise<Buffer> {
  if (!/^https:\/\//i.test(url)) throw new Error('A banner link has to start with https://.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const r = await fetch(directLink(url), { signal: ctrl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`That link answered ${r.status}.`);
    const len = Number(r.headers.get('content-length') || 0);
    if (len > MAX_BYTES) throw new Error('That picture is over 15 MB.');
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length > MAX_BYTES) throw new Error('That picture is over 15 MB.');
    return b;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('That link took over 30 seconds.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Set a campaign's banner from a picture file or an https link ("" removes it). Its reels already rendered but not
 * posted go back to draft, so their next render has it.
 */
export async function setBanner(campaign: string, source: string): Promise<{ path?: string; redo: number }> {
  const c = store.findCampaign(campaign);
  const dir = campaignFolder(c.title);
  const old = c.banner;
  let saved: string | undefined;
  const src = source.trim();
  if (src) {
    let bytes: Buffer;
    if (/^https?:\/\//i.test(src)) bytes = await download(src);
    else {
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) throw new Error(`No file at ${src}.`);
      if (fs.statSync(src).size > MAX_BYTES) throw new Error('That picture is over 15 MB.');
      bytes = fs.readFileSync(src);
    }
    const kind = kindOf(bytes);
    if (!kind)
      throw new Error(
        /^https?:/i.test(src)
          ? 'That link is not a picture (PNG, JPG, WebP or GIF): it may be a page. Open it and use the link of the image itself, or ask the user to download it into the campaign folder.'
          : 'That file is not a PNG, JPG, WebP or GIF picture.',
      );
    // A new name each time, so the preview and renders never show a cached older banner.
    saved = path.join(dir, `ad-banner-${Date.now()}.${kind}`);
    fs.writeFileSync(saved, bytes);
  }
  store.saveCampaign({ id: c.id, banner: saved ?? '' });
  // The old copy goes, unless it is the file the user picked (or one outside the campaign folder).
  if (old && old !== saved && path.dirname(old) === dir && /^ad-banner-\d+\.\w+$/.test(path.basename(old)) && old !== src) fs.rmSync(old, { force: true });
  return { path: saved, redo: store.campaignReelsToRedo(c.id) };
}
