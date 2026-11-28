// Covers (thumbnails) for Shorts and reels: a reel's own frame with a few big words, saved as a 1080x1920 picture and
// set as the cover when the reel is posted. Instagram's profile grid and TikTok show covers cut to 3:4 (the middle
// 1080x1440), so the words always stay inside that part. Create > Thumbnails, render_cover and the posting steps.

import type { CoverLook, CoverPlace, ReelCover, Site } from './types';

export const COVER_LOOKS: Array<{ id: CoverLook; label: string; help: string }> = [
  { id: 'bold', label: 'Bold', help: 'Huge outlined words over the frame, one in the accent colour. The classic Shorts cover.' },
  { id: 'box', label: 'Boxes', help: 'Each line on a white box, like the platforms\' own text. Clean and easy to read.' },
  { id: 'bar', label: 'Band', help: 'A dark band across the frame with the words in it. Leaves the rest of the frame clear.' },
  { id: 'frame', label: 'Frame only', help: 'Just the frame, no words: for a frame that already says it (a hook title on screen).' },
];

export const COVER_PLACES: Array<{ id: CoverPlace; label: string }> = [
  { id: 'top', label: 'Top' },
  { id: 'middle', label: 'Middle' },
  { id: 'bottom', label: 'Bottom' },
];

export const COVER_COLORS = ['#FFD84D', '#4ADE80', '#F43F5E', '#A855F7', '#38BDF8', '#FFFFFF'];

/** The middle 3:4 of a 9:16 cover (Instagram's grid, TikTok's cover crop): the words stay in here. */
export const COVER_SAFE = { top: 240, bottom: 1680 };

/** The band the words are centred on, per place (inside the 3:4 part, clear of the platforms' own buttons). */
export const COVER_PLACE_Y: Record<CoverPlace, number> = { top: 560, middle: 960, bottom: 1380 };

export const DEFAULT_COVER: Omit<ReelCover, 'text' | 't'> = { look: 'bold', place: 'middle', color: COVER_COLORS[0] };

/** A cover as sent by the UI or the AI, cleaned: unknown looks and places fall back, text at most 60 characters. */
export function cleanCover(c: Partial<ReelCover>, total: number): ReelCover {
  const look = COVER_LOOKS.some((l) => l.id === c.look) ? (c.look as CoverLook) : DEFAULT_COVER.look;
  const place = COVER_PLACES.some((p) => p.id === c.place) ? (c.place as CoverPlace) : DEFAULT_COVER.place;
  const color = typeof c.color === 'string' && /^#[0-9a-f]{6}$/i.test(c.color) ? c.color.toUpperCase() : DEFAULT_COVER.color;
  const t = Number.isFinite(c.t) ? Math.max(0, Math.min(Number(c.t), Math.max(0, total - 0.05))) : Math.min(1, total / 2);
  const text = String(c.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return { text, t: +t.toFixed(2), look, place, color, ...(c.bg ? { bg: String(c.bg) } : {}), ...(c.path ? { path: c.path } : {}), ...(c.at ? { at: c.at } : {}) };
}

/** Where a custom cover can be set when a reel goes up from a desktop browser, and how (said to the AI after attaching). */
export const COVER_STEP: Partial<Record<Site, string>> = {
  instagram:
    'On Instagram\'s Edit step press "Cover photo" (or "Edit cover"), then "Select from computer": browser_attach_image with the cover file and ref = that button (the dialog has the video\'s picker too). Check the cover shows, then go on.',
  tiktok:
    'Press "Edit cover" on the video preview, open its "Upload" tab, browser_attach_image with the cover file (ref = the upload button), then Confirm. TikTok cuts covers to 3:4; the words sit in the middle so they stay.',
  facebook:
    'In the reel composer open the thumbnail / cover option ("Edit" on the thumbnail, then "Upload image"), browser_attach_image with the cover file (ref = that button), then save it.',
  youtube:
    'If the Details step shows "Thumbnail" with "Upload file", browser_attach_image with the cover file and ref = that button. If it does not, set it after the Short is published: Studio > Content > Shorts > the Short\'s Details > Thumbnail > Upload file > Save. No "Upload file" there means YouTube has not given this channel Shorts thumbnails yet: skip it, never stop the post for it.',
};
