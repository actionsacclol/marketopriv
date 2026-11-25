import { BrowserWindow, nativeImage, session as electronSession, type Session } from 'electron';

// Studying what works: TikTok photo slideshows in a niche, read the way a person's browser reads them, in a hidden
// window of the hub's own (never the user's Chrome, never signed in, so no account is touched and nothing counts
// toward a warm-up). A search lists photo posts; one post gives its slides, caption and numbers, so the AI can see
// the hook, the structure and the look, and make our own version with our own words and pictures.

const PARTITION = 'persist:marketo-research';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const ses = (): Session => electronSession.fromPartition(PARTITION);
const BLOCKED = /verify to continue|drag the slider|captcha|too many attempts|access denied|log in to tiktok/i;

/**
 * Open a page in the hidden window. With `feed`, the page's own list requests matching it are read as they arrive
 * (the feed a hashtag or profile page loads its grid from): each parsed answer goes to onFeed.
 */
async function withPage<T>(url: string, fn: (run: <R>(code: string) => Promise<R>) => Promise<T>, feed?: RegExp, onFeed?: (json: unknown) => void): Promise<T> {
  const w = new BrowserWindow({ show: false, width: 1400, height: 1800, webPreferences: { session: ses(), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  w.webContents.setAudioMuted(true);
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (feed && onFeed) {
    try {
      const dbg = w.webContents.debugger;
      dbg.attach('1.3');
      const wanted = new Set<string>();
      dbg.on('message', (_e, method, params: { requestId?: string; response?: { url?: string } }) => {
        if (method === 'Network.responseReceived' && params.requestId && feed.test(params.response?.url ?? '')) wanted.add(params.requestId);
        else if (method === 'Network.loadingFinished' && params.requestId && wanted.delete(params.requestId))
          void dbg
            .sendCommand('Network.getResponseBody', { requestId: params.requestId })
            .then((r: { body?: string; base64Encoded?: boolean }) => onFeed(JSON.parse(r.base64Encoded ? Buffer.from(r.body ?? '', 'base64').toString('utf8') : (r.body ?? ''))))
            .catch(() => {});
      });
      await Promise.race([dbg.sendCommand('Network.enable'), sleep(4000)]);
    } catch {
      // No feed then: the page's own links are still read.
    }
  }
  try {
    await Promise.race([w.loadURL(url).catch(() => {}), sleep(20_000)]);
    // A page in the middle of a navigation can leave a script unanswered: every read gives up after a few seconds.
    return await fn(<R>(code: string) => Promise.race([w.webContents.executeJavaScript(code, true) as Promise<R>, sleep(8000).then(() => Promise.reject(new Error('page busy')))]));
  } finally {
    try {
      if (w.webContents.debugger.isAttached()) w.webContents.debugger.detach();
    } catch {
      // already gone
    }
    w.destroy();
  }
}

export interface FoundSlideshow {
  url: string;
  author: string;
  /** Its caption (or what its card says). */
  text: string;
  slides?: number;
  views?: number;
  likes?: number;
  saves?: number;
}

/** The photo posts in one answer of a hashtag's or profile's feed. */
function photoItems(json: unknown): FoundSlideshow[] {
  const list = (json as { itemList?: unknown[] } | null)?.itemList;
  if (!Array.isArray(list)) return [];
  const n = (v: unknown): number | undefined => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const out: FoundSlideshow[] = [];
  for (const raw of list) {
    const it = raw as { id?: string; desc?: string; author?: { uniqueId?: string }; imagePost?: { images?: unknown[] }; stats?: Record<string, unknown>; statsV2?: Record<string, unknown> };
    if (!it?.id || !it.imagePost || !it.author?.uniqueId) continue;
    const s = it.statsV2 ?? it.stats ?? {};
    out.push({ url: `https://www.tiktok.com/@${it.author.uniqueId}/photo/${it.id}`, author: it.author.uniqueId, text: String(it.desc ?? '').replace(/\s+/g, ' ').trim().slice(0, 200), slides: it.imagePost.images?.length, views: n(s.playCount), likes: n(s.diggCount), saves: n(s.collectCount) });
  }
  return out;
}

// Every photo post linked on the page, with the text of its card.
const POSTS = `(() => {
  const out = [];
  const seen = new Set();
  for (const a of document.querySelectorAll('a[href*="/photo/"]')) {
    const m = /tiktok\\.com\\/@([^/]+)\\/photo\\/(\\d+)/.exec(a.href);
    if (!m || seen.has(m[2])) continue;
    seen.add(m[2]);
    let card = a;
    for (let p = a.parentElement, i = 0; p && i < 5; p = p.parentElement, i++) {
      if (p.querySelectorAll('a[href*="/photo/"], a[href*="/video/"]').length > 2) break;
      card = p;
    }
    out.push({ url: 'https://www.tiktok.com/@' + m[1] + '/photo/' + m[2], author: m[1], text: (card.innerText || a.getAttribute('title') || (a.querySelector('img') || {}).alt || '').replace(/\\s+/g, ' ').trim().slice(0, 220) });
  }
  return out;
})()`;

const pageText = `(document.title + ' | ' + (document.body ? document.body.innerText.slice(0, 300) : '')).replace(/\\s+/g, ' ')`;

/** Photo slideshows for a search (or a hashtag when the search shows none signed out), as TikTok orders them. */
export async function search(query: string, count = 12): Promise<FoundSlideshow[]> {
  const q = query.trim().replace(/^#/, '').slice(0, 80);
  if (!q) throw new Error('Give a few words (the niche, the way people search TikTok) or a hashtag.');
  const want = Math.min(30, Math.max(1, Math.floor(count)));
  // TikTok's search needs a sign-in; a hashtag's page and a creator's profile do not. Words become one hashtag.
  const profile = /^@[\w.]+$/.test(query.trim());
  const tag = q.toLowerCase().replace(/[^a-z0-9_]+/g, '');
  const url = profile ? `https://www.tiktok.com/${query.trim()}` : `https://www.tiktok.com/tag/${encodeURIComponent(tag)}`;
  const seen = new Map<string, FoundSlideshow>();
  let videos = 0;
  let seenText = '';
  let items = 0;
  await withPage(
    url,
    async (run) => {
      const end = Date.now() + 28_000;
      let still = 0;
      let last = -1;
      while (Date.now() < end && seen.size < want && still < 8) {
        // Photo posts linked as such on the page count too (the feed is the main source).
        for (const p of await run<FoundSlideshow[]>(POSTS).catch(() => [])) if (!seen.has(p.url)) seen.set(p.url, p);
        videos = await run<number>(`document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]').length`).catch(() => videos);
        still = videos === last ? still + 1 : 0;
        last = videos;
        await run(`window.scrollTo(0, document.documentElement.scrollHeight)`).catch(() => {});
        await sleep(1100);
      }
      if (!seen.size) seenText = await run<string>(pageText).catch(() => '');
    },
    /\/api\/(challenge|post)\/item_list/,
    (json) => {
      items += ((json as { itemList?: unknown[] } | null)?.itemList ?? []).length;
      for (const p of photoItems(json)) seen.set(p.url, p);
    },
  );
  if (seen.size) return [...seen.values()].sort((a, b) => (b.likes ?? 0) - (a.likes ?? 0)).slice(0, want);
  const where = profile ? `${query.trim()}'s profile` : `#${tag}`;
  if (BLOCKED.test(seenText) && !videos) throw new Error(`TikTok asked the hub's window to prove it is a person or to log in, and showed nothing for ${where}. Find slideshows in the account's own TikTok tab instead (browser_open site "tiktok", search the niche, Photos), then give this tool a post's link.`);
  throw new Error(
    profile
      ? `No photo slideshows among the ${items || videos} posts TikTok showed on ${where}: this creator posts videos. Try another creator, or give this tool a photo post's link.`
      : `TikTok shows only videos on a hashtag's page to a window that is not signed in (${items || videos} read for ${where}, none a photo post). Slideshow creators are found in the account's own TikTok tab: browser_open site "tiktok", search the niche and open the Photos tab (it counts as the account's TikTok time). Then find_slideshows with "@creator" lists a creator's slideshows with their numbers, and with a post's link shows its slides.`,
  );
}

export interface Slideshow {
  url: string;
  author: string;
  caption: string;
  music: string;
  stats: { views?: number; likes?: number; comments?: number; shares?: number; saves?: number };
  /** Small copies of its slides, in order. */
  slides: Array<{ data: string; mimeType: string }>;
  count: number;
}

// The post's own data, as its page carries it.
const ITEM = `(() => {
  const pick = (s) => s && { desc: s.desc || '', author: (s.author && s.author.uniqueId) || '', music: (s.music && [s.music.title, s.music.authorName].filter(Boolean).join(' - ')) || '', stats: s.statsV2 || s.stats || {}, images: ((s.imagePost && s.imagePost.images) || []).map((x) => (x.imageURL && x.imageURL.urlList && x.imageURL.urlList[0]) || '').filter(Boolean) };
  try {
    const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
    const scope = el ? JSON.parse(el.textContent).__DEFAULT_SCOPE__ || {} : {};
    for (const k of Object.keys(scope)) {
      const s = scope[k] && scope[k].itemInfo && scope[k].itemInfo.itemStruct;
      if (s && s.imagePost) return pick(s);
    }
  } catch (e) {}
  // No data block: the slides as the page shows them.
  const imgs = [...new Set([...document.querySelectorAll('[class*="swiper"] img, [data-e2e*="photo"] img, [class*="ImgPhotoSlide"]')].map((i) => i.currentSrc || i.src).filter((s) => /^https:/.test(s)))];
  if (!imgs.length) return null;
  const d = document.querySelector('[data-e2e="browse-video-desc"], [data-e2e="video-desc"], h1');
  // Counts as the page prints them ("65.7K").
  const num = (sel) => {
    const el = document.querySelector(sel);
    const m = el && /([\\d.,]+)\\s*([KMB])?/i.exec(el.textContent || '');
    if (!m) return undefined;
    const v = parseFloat(m[1].replace(/,/g, '')) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1);
    return Number.isFinite(v) ? Math.round(v) : undefined;
  };
  const music = document.querySelector('[data-e2e="browse-music"], [data-e2e="video-music"], a[href*="/music/"]');
  return { desc: d ? d.innerText : '', author: (/@([^/]+)\\/photo/.exec(location.href) || [])[1] || '', music: music ? (music.innerText || '').trim().slice(0, 80) : '', stats: { diggCount: num('[data-e2e="like-count"], [data-e2e="browse-like-count"]'), commentCount: num('[data-e2e="comment-count"], [data-e2e="browse-comment-count"]'), collectCount: num('[data-e2e="undefined-count"], [data-e2e="favorite-count"]'), shareCount: num('[data-e2e="share-count"]') }, images: imgs };
})()`;

/** One photo post: its slides (up to 12), caption, sound and numbers. */
export async function read(link: string): Promise<Slideshow> {
  const m = /tiktok\.com\/@[^/?#]+\/photo\/\d+/.exec(link) ?? /(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+|tiktok\.com\/t\/[A-Za-z0-9]+/.exec(link);
  if (!m) throw new Error('That is not a TikTok photo post link (tiktok.com/@name/photo/<number>).');
  const url = `https://www.${m[0].replace(/^www\./, '')}`.replace('https://www.vm.', 'https://vm.').replace('https://www.vt.', 'https://vt.');
  return withPage(url, async (run) => {
    type Item = { desc: string; author: string; music: string; stats: Record<string, string | number>; images: string[] };
    let item: Item | null = null;
    for (let i = 0; i < 12 && !item; i++) {
      item = await run<Item | null>(ITEM).catch(() => null);
      if (!item) await sleep(1000);
    }
    if (!item || !item.images.length) {
      const text = await run<string>(pageText).catch(() => '');
      throw new Error(BLOCKED.test(text) ? 'TikTok asked the hub\'s window to prove it is a person and did not show the post. Open it in the account\'s TikTok tab instead and browser_screenshot its slides.' : `No slides found on that page (it may be a video, private or gone; page: ${text.slice(0, 140) || 'empty'}).`);
    }
    const slides: Slideshow['slides'] = [];
    for (const src of item.images.slice(0, 12)) {
      try {
        const r = await ses().fetch(src, { headers: { referer: 'https://www.tiktok.com/' } });
        if (!r.ok) continue;
        const img = nativeImage.createFromBuffer(Buffer.from(await r.arrayBuffer()));
        if (img.isEmpty()) continue;
        const { height } = img.getSize();
        slides.push({ data: (height > 520 ? img.resize({ height: 520 }) : img).toJPEG(72).toString('base64'), mimeType: 'image/jpeg' });
      } catch {
        // one slide short
      }
    }
    const n = (v: string | number | undefined): number | undefined => (v === undefined || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
    const s = item.stats;
    return { url, author: item.author, caption: item.desc.replace(/\s+/g, ' ').trim(), music: item.music.replace(/\s+/g, ' ').trim(), stats: { views: n(s.playCount), likes: n(s.diggCount), comments: n(s.commentCount), shares: n(s.shareCount), saves: n(s.collectCount) }, slides, count: item.images.length };
  });
}
