import { net } from 'electron';
import { parseYtChannel } from '../shared/ytChannel';

// A YouTube channel from what the user pastes (a channel link, a Studio link, an @handle or a UC… id): its id and name,
// read off the channel's public page. One Google account can own many channels; each Marketo account names its own
// this way, and the hub switches YouTube Studio to it before acting (browser.ts ytChannelGate).

export interface ResolvedChannel {
  id: string;
  name?: string;
  handle?: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const unescape = (s: string): string => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

export async function resolveYtChannel(input: string): Promise<ResolvedChannel> {
  const p = parseYtChannel(input);
  if (!p) throw new Error('That is not a YouTube channel. Paste the channel link (youtube.com/@name or youtube.com/channel/UC…), its @handle, or its Studio link.');
  const page = p.id ? `https://www.youtube.com/channel/${p.id}` : `https://www.youtube.com/@${encodeURIComponent(p.handle!)}`;
  let html = '';
  try {
    const res = await net.fetch(page, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' }, signal: AbortSignal.timeout(15_000), cache: 'no-store' });
    if (res.status === 404) throw new Error(`YouTube has no channel ${p.id ?? '@' + p.handle}.`);
    html = await res.text();
  } catch (e) {
    // A UC id is enough on its own; the name is filled in when Studio shows it.
    if (p.id) return { id: p.id };
    throw new Error(/no channel/.test((e as Error).message) ? (e as Error).message : `Could not reach YouTube to look up @${p.handle}: paste the channel's youtube.com/channel/UC… link instead.`);
  }
  const id = p.id ?? /"externalId":"(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1] ?? /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{22})"/.exec(html)?.[1];
  if (!id) throw new Error(`Could not find the channel id on @${p.handle}'s page. Paste its youtube.com/channel/UC… link (YouTube Studio > Customization > Basic info shows it).`);
  const name = /<meta property="og:title" content="([^"]{1,120})"/.exec(html)?.[1];
  const handle = p.handle ?? /"vanityChannelUrl":"https?:\/\/www\.youtube\.com\/@([^"]{1,60})"/.exec(html)?.[1];
  return { id, name: name ? unescape(name) : undefined, handle: handle ? decodeURIComponent(handle) : undefined };
}
