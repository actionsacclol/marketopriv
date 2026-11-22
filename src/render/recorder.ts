import { ALL_FORMATS, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';
import { seekingSource } from './media';
import { perfNow } from '../lib/perf';

// record_screen: record one app window for a few seconds (desktop capture +
// MediaRecorder), turn it into a seekable MP4, save it in the output folder and
// return a few frames so the AI can pick the seconds for its screen beats.

export interface RecordArgs {
  window: string;
  seconds: number;
  launch?: string;
  name?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// Every window that matches, exact titles first: an app can have several with
// the same title (a hidden tray panel and its main window), and a hidden one
// can't be captured, so the caller tries them in turn.
async function findWindow(want: string, waitMs: number): Promise<{ hits: Array<{ id: string; name: string }> } | { error: string }> {
  const w = want.trim().toLowerCase();
  const until = Date.now() + waitMs;
  let names: string[] = [];
  for (;;) {
    const r = await window.marketo.screen.sources();
    if (!r.ok || !r.data) return { error: r.message ?? 'Could not list the windows.' };
    names = r.data.map((s) => s.name);
    const hits = [...r.data.filter((s) => s.name.toLowerCase() === w), ...r.data.filter((s) => s.name.toLowerCase() !== w && s.name.toLowerCase().includes(w))];
    if (hits.length) return { hits };
    if (Date.now() >= until) break;
    await sleep(1000);
  }
  return { error: `No open window matches "${want}". Open windows: ${names.slice(0, 25).map((n) => `"${n}"`).join(', ') || 'none'}.` };
}

/**
 * Re-encode the recorder's WebM (no index, so it can't be scrubbed) as an H.264 MP4; falls back to a remuxed WebM.
 * An H.264 MP4 recording (fastRecording) is first only copied into an indexed MP4: no re-encode.
 */
async function seekable(blob: Blob, h264 = false): Promise<{ bytes: Uint8Array; ext: 'mp4' | 'webm' }> {
  const ways = h264 ? (['copy', 'mp4', 'webm'] as const) : (['mp4', 'webm'] as const);
  for (const way of ways) {
    const ext = way === 'webm' ? 'webm' : 'mp4';
    try {
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const output = new Output({ format: ext === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
      // Same codec and no bitrate: mediabunny copies the frames as they are.
      const video = way === 'copy' ? { codec: 'avc' as const } : way === 'mp4' ? { codec: 'avc' as const, bitrate: 8e6 } : undefined;
      const conv = await Conversion.init({ input, output, ...(video ? { video } : {}) });
      if (!conv.isValid) throw new Error('not convertible');
      await conv.execute();
      const buf = (output.target as BufferTarget).buffer;
      if (buf) return { bytes: new Uint8Array(buf), ext };
    } catch {
      // try the next way
    }
  }
  return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: h264 ? 'mp4' : 'webm' };
}

export async function recordScreen(a: RecordArgs, progress: (fraction: number, message: string) => void): Promise<{ path: string; seconds: number; window: string; frames: Array<{ t: number; data: string }> }> {
  const seconds = Math.min(120, Math.max(2, a.seconds));
  if (a.launch) {
    progress(0, `Opening ${a.launch}`);
    const r = await window.marketo.screen.launch(a.launch);
    if (!r.ok) throw new Error(r.message ?? `Could not open ${a.launch}.`);
  }
  const found = await findWindow(a.window, a.launch ? 25000 : 0);
  if ('error' in found) throw new Error(found.error);
  if (a.launch) await sleep(1500);
  let stream: MediaStream | null = null;
  let src = found.hits[0];
  let why = '';
  for (const hit of found.hits) {
    const constraints = { audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: hit.id, maxFrameRate: 30, maxWidth: 1920, maxHeight: 1080 } } } as unknown as MediaStreamConstraints;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      src = hit;
      break;
    } catch (e) {
      why = e instanceof Error ? e.message : String(e);
    }
  }
  if (!stream) throw new Error(`Windows would not let the hub capture "${src.name}" (${why || 'no reason given'}). The window may be hidden or minimised (show it first), or the app blocks screen capture.`);
  // Fast recording (Setup > Performance): H.264 MP4, encoded by the graphics card where Chromium can; else as before.
  const h264 = perfNow().fastRecording && MediaRecorder.isTypeSupported('video/mp4;codecs=avc1');
  const mime = h264 ? 'video/mp4;codecs=avc1' : (['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m)) ?? 'video/webm');
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10e6 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => (rec.onstop = () => r()));
  rec.start(500);
  const t0 = performance.now();
  while (performance.now() - t0 < seconds * 1000) {
    progress((performance.now() - t0) / (seconds * 1000) * 0.8, `Recording "${src.name}"`);
    await sleep(250);
  }
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  progress(0.85, 'Making it seekable');
  const out = await seekable(new Blob(chunks, { type: mime }), h264);
  const saved = await window.marketo.screen.save(out.bytes, `${a.name?.trim() || src.name}.${out.ext}`);
  if (!saved.ok || !saved.data) throw new Error(saved.message ?? 'Could not save the recording.');
  // A few frames, so the AI can pick the seconds for its screen beats.
  progress(0.95, 'Taking frames');
  const frames: Array<{ t: number; data: string }> = [];
  try {
    const fs = await seekingSource(saved.data);
    const c = document.createElement('canvas');
    const scale = Math.min(1, 480 / Math.max(fs.size.w, 1));
    c.width = Math.max(1, Math.round(fs.size.w * scale));
    c.height = Math.max(1, Math.round(fs.size.h * scale));
    const g = c.getContext('2d')!;
    const n = Math.min(6, Math.max(3, Math.round(seconds / 4)));
    for (let k = 0; k < n; k++) {
      const t = Math.round(((seconds - 0.3) * k) / (n - 1) * 10) / 10;
      const f = await fs.frameAt(t);
      if (!f) continue;
      g.drawImage(f, 0, 0, c.width, c.height);
      frames.push({ t, data: c.toDataURL('image/png').split(',')[1] });
    }
    fs.dispose();
  } catch {
    // frames are a convenience
  }
  return { path: saved.data, seconds, window: src.name, frames };
}
