import { ALL_FORMATS, CanvasSink, Input, UrlSource, type WrappedCanvas } from 'mediabunny';

// Media for reels: video frames for the clip preset (live element for the
// preview, exact seeks for stills, a sequential decoder for export) and the
// music bed (decoded, trimmed, faded).

export const mediaUrl = (p: string): string => window.marketo.app.mediaUrl(p);

/** How far the music drops under a voice-over. */
export const MUSIC_UNDER_VOICE = 0.28;

export interface FrameSource {
  size: { w: number; h: number };
  /** The frame showing at media time `t` (seconds). */
  frameAt(t: number): Promise<CanvasImageSource | null>;
  dispose(): void;
}

/** A <video> element for live preview. */
export function videoElement(path: string): HTMLVideoElement {
  const v = document.createElement('video');
  v.src = mediaUrl(path);
  v.muted = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.crossOrigin = 'anonymous';
  return v;
}

export function waitMeta(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    v.addEventListener('loadedmetadata', () => resolve(), { once: true });
    v.addEventListener('error', () => reject(new Error(`Couldn't open the video (${v.error?.message ?? 'unsupported file'}).`)), { once: true });
  });
}

export function seek(v: HTMLVideoElement, t: number): Promise<void> {
  const target = Math.max(0, Math.min(t, (v.duration || t) - 0.04));
  if (Math.abs(v.currentTime - target) < 0.01 && v.readyState >= 2) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => resolve();
    v.addEventListener('seeked', done, { once: true });
    setTimeout(done, 3000);
    v.currentTime = target;
  });
}

/** Exact frames by seeking a <video> (for a handful of stills). */
export async function seekingSource(path: string): Promise<FrameSource> {
  const v = videoElement(path);
  await waitMeta(v);
  return {
    size: { w: v.videoWidth, h: v.videoHeight },
    async frameAt(t) {
      await seek(v, t);
      return v;
    },
    dispose() {
      v.removeAttribute('src');
      v.load();
    },
  };
}

/** Decodes forward from `start` (for export: every source frame decoded once). */
export async function sequentialSource(path: string, start: number): Promise<FrameSource> {
  const input = new Input({ source: new UrlSource(mediaUrl(path)), formats: ALL_FORMATS });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('That file has no video track.');
  if (!(await track.canDecode())) throw new Error('This video codec can\'t be decoded here. Re-encode it as H.264 MP4.');
  const scale = Math.min(1, 1920 / Math.max(track.displayWidth, track.displayHeight));
  const sink = new CanvasSink(track, { width: Math.round(track.displayWidth * scale), height: Math.round(track.displayHeight * scale), fit: 'fill', poolSize: 4 });
  const gen = sink.canvases(start);
  let cur: WrappedCanvas | null = null;
  let next: WrappedCanvas | null = (await gen.next()).value ?? null;
  let ended = false;
  return {
    size: { w: Math.round(track.displayWidth * scale), h: Math.round(track.displayHeight * scale) },
    async frameAt(t) {
      while (next && next.timestamp <= t + 1e-3) {
        cur = next;
        if (ended) {
          next = null;
          break;
        }
        const r = await gen.next();
        if (r.done) ended = true;
        next = r.done ? null : r.value;
      }
      return (cur ?? next)?.canvas ?? null;
    },
    dispose() {
      void gen.return(undefined);
      input.dispose?.();
    },
  };
}

async function decodeFile(path: string, what: string, rate: number): Promise<AudioBuffer> {
  const res = await fetch(mediaUrl(path));
  if (!res.ok) throw new Error(`Couldn't read the ${what} file (${res.status}).`);
  return new OfflineAudioContext(2, rate, rate).decodeAudioData(await res.arrayBuffer());
}

/**
 * The reel's audio: the music bed (trimmed, volume applied, 1.2s fade out;
 * lowered under a voice-over or a clip's own sound) plus the voice track and,
 * for a clip reel that keeps it, the video file's own audio. Stereo 48 kHz, or
 * null when there is none of them.
 */
export async function soundtrack(
  seconds: number,
  music: { path: string; volume: number } | null,
  voice: string | null,
  clip: { path: string; start: number; seconds: number } | null = null,
): Promise<AudioBuffer | null> {
  // A clip's own sound: the part of the video file's audio the reel shows. A file without audio adds nothing.
  const own = clip ? await decodeFile(clip.path, 'video', 48000).catch(() => null) : null;
  if (!music && !voice && !own) return null;
  const rate = 48000;
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(seconds * rate)), rate);
  if (own && clip && clip.start < own.duration) {
    const src = ctx.createBufferSource();
    src.buffer = own;
    src.connect(ctx.destination);
    src.start(0, clip.start, Math.min(clip.seconds, own.duration - clip.start));
  }
  if (music) {
    const src = ctx.createBufferSource();
    src.buffer = await decodeFile(music.path, 'music', rate);
    const gain = ctx.createGain();
    const volume = music.volume * (voice || own ? MUSIC_UNDER_VOICE : 1);
    const fade = Math.min(1.2, seconds / 3);
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(volume, 0.04);
    gain.gain.setValueAtTime(volume, Math.max(0.05, seconds - fade));
    gain.gain.linearRampToValueAtTime(0, seconds);
    src.connect(gain).connect(ctx.destination);
    src.start(0);
  }
  if (voice) {
    const src = ctx.createBufferSource();
    src.buffer = await decodeFile(voice, 'voice-over', rate);
    src.connect(ctx.destination);
    src.start(0);
  }
  return ctx.startRendering();
}
