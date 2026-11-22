import { ALL_FORMATS, BufferSource, BufferTarget, CanvasSink, Conversion, Input, Mp4OutputFormat, Output } from 'mediabunny';
import type { ClipOrigin } from '@shared/types';
import { clock, parseClipUrl, parseYouTube } from '@shared/clipping';
import { captionLines, transcribeFile } from './transcribe';

const blobToDataUrl = (b: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });

// save_clip: one Twitch / Kick clip downloaded (main reads it off the clip page), or a part of a YouTube video
// recorded off its page, made into an H.264 MP4 the reel
// pipeline can always decode, saved in the output folder, captioned on this computer, and a few whole frames so the
// AI can find the facecam for the split layout.

export interface SavedClip {
  path: string;
  site: ClipOrigin;
  channel: string;
  url: string;
  title: string;
  seconds: number;
  size: { w: number; h: number };
  language: string;
  /** "start | text" lines, seconds from the clip's start. */
  captions: string;
  frames: Array<{ t: number; data: string }>;
  /** Reels whose clip is the same moment (same spot in the stream, or the same words). */
  repeats: string[];
}

/** An MP4 with H.264 video: Kick's MPEG-TS and YouTube recordings repackaged as they are, Twitch's AV1 (or anything else) re-encoded once. */
async function toMp4(bytes: Uint8Array, kind: 'mp4' | 'ts' | 'rec'): Promise<Uint8Array> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('The clip has no video in it.');
  const avc = track.codec === 'avc';
  if (avc && kind === 'mp4') return bytes;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const conv = await Conversion.init({ input, output, ...(avc ? {} : { video: { codec: 'avc' as const, bitrate: 8e6 } }) });
  if (!conv.isValid) throw new Error(`The clip's video (${track.codec ?? 'unknown codec'}) can't be converted here.`);
  await conv.execute();
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) throw new Error('Converting the clip failed.');
  return new Uint8Array(buf);
}

export async function saveClip(url: string, progress: (fraction: number, message: string) => void, span: { start?: number; seconds?: number } = {}): Promise<SavedClip> {
  const yt = parseYouTube(url);
  if (!yt && !parseClipUrl(url)) throw new Error(`"${url}" is not a Twitch / Kick clip or a YouTube video address.`);
  if (yt) {
    const from = span.start ?? yt.start ?? 0;
    progress(0.02, span.seconds ? `Recording ${clock(from)}-${clock(from + span.seconds)} off YouTube (takes as long as the part)` : `Recording from ${clock(from)} off YouTube (takes as long as the part)`);
  } else progress(0.02, 'Opening the clip page');
  const got = await window.marketo.clips.fetch(url, span);
  if (!got.ok || !got.data) throw new Error(got.message ?? 'Could not download the clip.');
  const c = got.data;
  const id = parseClipUrl(c.url) ?? { id: 'clip' };
  progress(0.25, c.kind === 'mp4' ? 'Checking the video' : 'Making it an MP4');
  const mp4 = await toMp4(c.bytes, c.kind);
  // The id (and a YouTube part's start) before the title: the name is cut at 70 characters, and two parts of one video must not share a file.
  const tag = c.site === 'youtube' ? id.id.replace(/@(\d+)$/, ' $1s') : id.id.slice(-10);
  const saved = await window.marketo.clips.save(mp4, `${c.site} ${c.channel.slice(0, 24)} ${tag} ${c.title.slice(0, 40)}`);
  if (!saved.ok || !saved.data) throw new Error(saved.message ?? 'Could not save the clip.');
  const path = saved.data;

  // Length and frames: start, middle, near the end, whole frame so the facecam can be placed.
  progress(0.4, 'Taking frames');
  // Decoded straight from the file (a <video> seek can hand back a blank first picture).
  const input = new Input({ source: new BufferSource(mp4), formats: ALL_FORMATS });
  const seconds = await input.computeDuration();
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('The clip has no video in it.');
  const size = { w: track.displayWidth, h: track.displayHeight };
  const scale = Math.min(1, 640 / Math.max(size.w, 1));
  const sink = new CanvasSink(track, { width: Math.max(1, Math.round(size.w * scale)), height: Math.max(1, Math.round(size.h * scale)), fit: 'fill' });
  const frames: SavedClip['frames'] = [];
  const grab = async (at: number): Promise<void> => {
    const t = Math.round(Math.max(0, Math.min(at, seconds)) * 10) / 10;
    const fr = await sink.getCanvas(t);
    if (!fr) return;
    const cv = fr.canvas instanceof HTMLCanvasElement ? fr.canvas : null;
    const data = cv ? cv.toDataURL('image/png') : await blobToDataUrl(await (fr.canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' }));
    frames.push({ t, data: data.split(',')[1] });
  };
  for (const t of [1, seconds / 2, Math.max(0, seconds - 1)]) await grab(t);

  progress(0.45, 'Captioning the speech');
  const tr = await transcribeFile(path, { onProgress: (f, m) => progress(0.45 + Math.max(0, Math.min(1, f)) * 0.53, m) });
  const captions = captionLines(tr, { maxWords: 3 });
  // One more frame while someone talks: streams with live captions show them burned into the video only then.
  const talk = captions.split('\n').map((l) => Number(/^\s*([\d.]+)\s*\|/.exec(l)?.[1])).filter((x) => Number.isFinite(x));
  const mid = talk[Math.floor(talk.length / 2)];
  if (mid !== undefined && frames.every((x) => Math.abs(x.t - (mid + 0.8)) > 1.5)) {
    await grab(mid + 0.8);
    frames.sort((a, b) => a.t - b.t);
  }
  const chk = await window.marketo.clips.check(c.url, seconds, captions);
  return { path, site: c.site, channel: c.channel, url: c.url, title: c.title, seconds, size, language: tr.language, captions, frames, repeats: chk.ok ? (chk.data ?? []) : [] };
}
