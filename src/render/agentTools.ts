import type { McpToolCall, McpToolResult } from '@shared/types';
import { recordScreen } from './recorder';
import { elVoiceNote, hasSound, storyBeats, timingFor } from '@shared/presets';

const SILENT_NOTE = ' WARNING: this reel has no sound at all (no voice, no music). Silent videos do badly on TikTok, Shorts and Reels: make it a story reel (voiced, with sound effects and music) unless the user asked for a silent one.';
import { reelById, renderReel, useApp } from '../state/store';
import { renderStills } from './export';
import { ensureVoiceover, takeVoiceNotes } from './voice';
import { addReferenceVideo } from './refAnalyze';
import { profileLine } from '@shared/refStyle';
import { CLIP_SITE_LABEL } from '@shared/clipping';
import { saveClip } from './clipSave';

// The renderer half of the MCP tools: anything that needs a canvas or the
// encoder. Called by main through window.marketo.mcp.serve.

export async function runAgentTool(call: McpToolCall, progress: (fraction: number, message: string) => void): Promise<McpToolResult> {
  if (call.tool === 'add_reference_video') {
    const a = (call.args ?? {}) as { path: string; name?: string; notes?: string };
    if (call.client !== 'Kip') useApp.getState().go('research');
    const r = await addReferenceVideo(a.path, { name: a.name, notes: a.notes }, (ratio, phase) => progress(ratio, `Reading the video (${phase})`));
    return { ok: true, text: `Added reference video "${r.name}" (${r.id}): ${profileLine(r.profile)}.\nget_reference_video shows it in full, with pictures to look at. Then create_reel with like: "${r.id}".` };
  }

  if (call.tool === 'save_clip') {
    const a = (call.args ?? {}) as { url: string };
    const r = await saveClip(String(a.url ?? ''), progress);
    const f = r.frames.map((x) => `${x.t}s`).join(', ');
    const words = r.captions.split('\n').filter(Boolean).length;
    return {
      ok: true,
      text: [
        ...(r.repeats.length ? [`SAME MOMENT: ${r.repeats.join('; ')}. Do not make a second reel of it: find_clips and save_clip another moment, unless the user asked for this one.`] : []),
        `Saved "${r.title || 'clip'}" by ${r.channel} on ${CLIP_SITE_LABEL[r.site]} (${r.seconds.toFixed(1)}s, ${r.size.w}x${r.size.h}) → ${r.path}`,
        `Source: ${r.url}`,
        r.captions
          ? `Captions (${r.language || 'speech'}, ${words} lines, "start | text", seconds from the clip's start; a line with only a time clears the caption during a pause, keep those; when the reel starts later, take the lines in its span and subtract its start):\n${r.captions}`
          : 'Captions: no speech found in it. Write a few short captions about what happens, or pick another clip.',
        `Frames at ${f} (whole frame, ${r.size.w}x${r.size.h}): find the streamer's webcam and give cam as "x,y,w,h" fractions of the frame (x,y = its top-left corner). No webcam: leave cam empty. Words already on the video (the stream's own live captions, often near the bottom): leave captions empty, or set game so they are left out.`,
        `Next: create_reel preset clip with video = that path, source = ${r.url}, fit split, cam, game, sound true, zoom false, start/seconds on the best part, headline, captions. Name ${r.channel} in the post caption. Only the clip: no end card, logo, link or plug unless the user asked.`,
      ].join('\n\n'),
      images: r.frames.map((x) => ({ data: x.data, mimeType: 'image/png' })),
    };
  }

  if (call.tool === 'record_screen') {
    const a = (call.args ?? {}) as { window: string; seconds?: number; launch?: string; name?: string };
    const r = await recordScreen({ window: a.window, seconds: a.seconds ?? 15, launch: a.launch, name: a.name }, progress);
    return {
      ok: true,
      text: `Recorded ${r.seconds}s of "${r.window}" → ${r.path}\nUse it in a story reel: update_reel fields.video = that path, then screen beats (visual screen, a = the second to start at, optionally "@x,y x2" to zoom in on a spot, b = a callout). Frames below at ${r.frames.map((f) => `${f.t}s`).join(', ')}.`,
      images: r.frames.map((f) => ({ data: f.data, mimeType: 'image/png' })),
    };
  }

  const args = (call.args ?? {}) as { id?: string; times?: number[]; scale?: number; shape?: 'vertical' | 'square'; t?: number };
  let reel = reelById(args.id ?? null);
  if (!reel) return { ok: false, text: `No reel "${args.id}".` };
  if (call.tool === 'preview_reel') reel = await ensureVoiceover(reel, (s) => progress(0, s));
  const timing = timingFor(reel.preset, reel.fields);

  if (call.tool === 'preview_reel') {
    const stills = await renderStills(reel, args.times, args.scale ?? 0.35, args.shape);
    const f = reel.fields;
    const el = reel.preset === 'story' && f.voiceover === true ? elVoiceNote(storyBeats(f), String(f.voice ?? '')) : '';
    return {
      ok: true,
      text: `${reel.title} (${reel.preset}, ${timing.total.toFixed(1)}s; body ${timing.body.toFixed(1)}s + end card ${timing.cta}s).${el ? ` ${el}${el.startsWith('No narration') ? ' Timing is estimated from the text and can shift a little at render.' : ''}` : ''} Frames at ${stills.map((s) => `${s.t}s`).join(', ')}:${hasSound(reel.preset, reel.fields) ? '' : SILENT_NOTE}`,
      images: stills.map((s) => ({ data: s.data, mimeType: 'image/png' })),
    };
  }

  if (call.tool === 'render_image') {
    reel = await ensureVoiceover(reel, (s) => progress(0, s));
    const shape = args.shape ?? 'square';
    const [still] = await renderStills(reel, [args.t ?? 1.5], 1, shape);
    const r = await window.marketo.render.saveImage(reel.id, still.data, still.t, shape);
    if (!r.ok || !r.data) return { ok: false, text: r.message ?? 'Saving the image failed.' };
    return { ok: true, text: `Saved the ${shape} frame at ${still.t}s of "${reel.title}" → ${r.data}`, images: [{ data: (await renderStills(reel, [still.t], 0.35, shape))[0].data, mimeType: 'image/png' }] };
  }

  if (call.tool === 'render_reel') {
    if (call.client !== 'Kip') useApp.getState().go('studio', reel.id);
    const t0 = performance.now();
    const r = await renderReel(reel, (ratio, phase) => progress(ratio, `Rendering${args.shape === 'square' ? ' the square version' : ''} (${phase})`), args.shape ?? 'vertical');
    const voiceNotes = takeVoiceNotes();
    const mute = hasSound(reel.preset, reel.fields) ? '' : SILENT_NOTE;
    return { ok: true, text: `Rendered ${args.shape === 'square' ? 'the square (X) version of ' : ''}"${reel.title}" → ${r.path} (${r.seconds.toFixed(1)}s, ${(r.bytes / 1e6).toFixed(1)} MB, took ${((performance.now() - t0) / 1000).toFixed(1)}s).${voiceNotes.length ? `\nVoice: ${voiceNotes.join(' ')}` : ''}${mute}` };
  }

  return { ok: false, text: `The renderer doesn't handle ${call.tool}.` };
}
