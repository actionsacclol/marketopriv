import { perfNow } from '../lib/perf';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, QUALITY_HIGH } from 'mediabunny';
import { isAction, type Action } from '@shared/character';
import type { LongSection } from '@shared/types';
import { renderCharacter } from './char3d';

// Kip presenting a long video: one clip per narrated section, 720x1280 on a green screen (#00d800, Krypt Editor's
// default chroma key), Kip's mouth driven by the section's narration (its loudness, frame by frame) and its moves
// spread over the section. The edit keys the green out and places Kip beside the footage.

export const KIP_GREEN = '#00d800';
const KW = 720;
const KH = 1280;
const FPS = 30;

export type KipArt = '3d' | 'cartoon';

/** "0:wave, 3:talk, 9.5:point" → timed moves. Unknown moves are dropped. */
export function parseMoves(s: string | undefined): Array<{ at: number; action: Action }> {
  if (!s) return [];
  return s
    .split(/[,;\n]+/)
    .map((p) => /^\s*([\d.]+)\s*[:=]\s*([a-z]+)\s*$/i.exec(p))
    .filter((m): m is RegExpExecArray => !!m && isAction(m[2].toLowerCase()))
    .map((m) => ({ at: Number(m[1]), action: m[2].toLowerCase() as Action }))
    .sort((a, b) => a.at - b.at);
}

/** Moves when the AI gave none: talking most of the time, a gesture every few seconds, a wave to open, a cheer to close. */
export function autoMoves(index: number, count: number, seconds: number): Array<{ at: number; action: Action }> {
  const cycle: Action[] = ['talk', 'present', 'talk', 'point', 'talk', 'think'];
  const out: Array<{ at: number; action: Action }> = [];
  let t = 0;
  if (index === 0) {
    out.push({ at: 0, action: 'wave' });
    t = 2.6;
  }
  for (let k = index; t < seconds - 1.5; k++) {
    out.push({ at: t, action: cycle[k % cycle.length] });
    t += 4.5 + (k % 3);
  }
  if (index === count - 1 && seconds > 4) out.push({ at: Math.max(0, seconds - 2.8), action: 'cheer' });
  return out.length ? out : [{ at: 0, action: 'talk' }];
}

/** Mouth openness per frame from the narration's loudness (0 = closed). */
async function mouthTrack(audioUrl: string, frames: number): Promise<number[]> {
  const buf = await (await fetch(audioUrl)).arrayBuffer();
  const ac = new OfflineAudioContext(1, 1, 44100);
  const audio = await ac.decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const per = audio.sampleRate / FPS;
  const rms: number[] = [];
  for (let i = 0; i < frames; i++) {
    const a = Math.floor(i * per);
    const b = Math.min(data.length, Math.floor((i + 1) * per));
    let sum = 0;
    for (let j = a; j < b; j++) sum += data[j] * data[j];
    rms.push(b > a ? Math.sqrt(sum / (b - a)) : 0);
  }
  const loud = [...rms].sort((x, y) => x - y)[Math.floor(rms.length * 0.95)] || 1;
  // Gate the quiet parts shut, open with the loudness, smooth a little so it doesn't flicker.
  let prev = 0;
  return rms.map((v) => {
    const u = Math.max(0, Math.min(1, (v / loud - 0.12) / 0.75));
    prev = prev * 0.35 + u * 0.65;
    return prev;
  });
}

export interface KipClipOpts {
  section: LongSection;
  index: number;
  count: number;
  art: KipArt;
  color: string;
  accent: string;
  audioUrl: string;
  onProgress?: (ratio: number) => void;
}

/** One section's Kip clip as MP4 bytes (silent: the narration is on its own track in the edit). */
export async function renderKipClip(o: KipClipOpts): Promise<{ data: Uint8Array; seconds: number }> {
  const seconds = o.section.seconds ?? 0;
  if (!seconds) throw new Error(`"${o.section.heading}" has no narration yet: narrate_long_video first.`);
  const frames = Math.max(1, Math.round(seconds * FPS));
  const mouth = await mouthTrack(o.audioUrl, frames);
  const moves = parseMoves(o.section.kip);
  const plan = moves.length ? moves : autoMoves(o.index, o.count, seconds);

  const canvas = document.createElement('canvas');
  canvas.width = KW;
  canvas.height = KH;
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const build = async (hw: 'prefer-hardware' | 'prefer-software' | 'no-preference') => {
    const out = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const video = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH, hardwareAcceleration: hw });
    out.addVideoTrack(video, { frameRate: FPS });
    await out.start();
    return { out, video };
  };
  let pipe: Awaited<ReturnType<typeof build>>;
  // Setup > Performance: auto tries the graphics card first; software leaves it free (many profiles rendering).
  const enc = perfNow().encoder;
  let hw: 'prefer-hardware' | 'prefer-software' | 'no-preference' = enc === 'software' ? 'prefer-software' : 'prefer-hardware';
  try {
    pipe = await build(hw);
  } catch {
    hw = 'no-preference';
    pipe = await build(hw);
  }
  try {
    for (let i = 0; i < frames; i++) {
      const t = i / FPS;
      let m = plan[0];
      for (const p of plan) if (p.at <= t) m = p;
      const local = t - m.at;
      const r = renderCharacter({ art: o.art, action: m.action, local, t: t + o.index * 37, talk: mouth[i] ?? 0, place: 'stage', side: 0.35, zoom: 0.15, accent: o.accent, color: o.color });
      ctx.fillStyle = KIP_GREEN;
      ctx.fillRect(0, 0, KW, KH);
      ctx.drawImage(r.canvas, 0, 0, KW, KH);
      if (i === 0 && hw === 'prefer-hardware') {
        // The encoder is only set up on the first frame: a graphics card that turns the settings down fails here, not
        // at start. Start over in software then (the frame is still on the canvas).
        try {
          await pipe.video.add(t, 1 / FPS);
        } catch {
          await pipe.out.cancel().catch(() => {});
          hw = 'no-preference';
          pipe = await build(hw);
          await pipe.video.add(t, 1 / FPS);
        }
      } else await pipe.video.add(t, 1 / FPS);
      if (i % 15 === 0) o.onProgress?.(i / frames);
    }
    await pipe.out.finalize();
  } catch (e) {
    await pipe.out.cancel().catch(() => {});
    throw e;
  }
  const buf = (pipe.out.target as BufferTarget).buffer;
  if (!buf) throw new Error('The encoder produced no data.');
  return { data: new Uint8Array(buf), seconds };
}
