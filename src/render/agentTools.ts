import { MAX_SLIDES, SHAPE_SIZE, type McpToolCall, type McpToolResult, type StillShape } from '@shared/types';
import { recordScreen } from './recorder';
import { elVoiceNote, hasSound, isVoiced, slideTimes, storyBeats, timingFor } from '@shared/presets';

const SILENT_NOTE = ' WARNING: this reel has no sound at all (no voice, no music). Silent videos do badly on TikTok, Shorts and Reels: make it a story reel (voiced, with sound effects and music) unless the user asked for a silent one.';
import { reelById, renderReel, useApp } from '../state/store';
import { renderStills } from './export';
import { ensureVoiceover, takeVoiceNotes } from './voice';
import { addReferenceVideo } from './refAnalyze';
import { profileLine } from '@shared/refStyle';
import { CLIP_ORIGIN_LABEL } from '@shared/clipping';
import { saveClip } from './clipSave';
import { renderThumbnail } from './thumbnail';
import { renderKipClip, type KipArt } from './kip';

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
    const a = (call.args ?? {}) as { url: string; start?: number; seconds?: number };
    const r = await saveClip(String(a.url ?? ''), progress, { start: a.start, seconds: a.seconds });
    const f = r.frames.map((x) => `${x.t}s`).join(', ');
    const words = r.captions.split('\n').filter(Boolean).length;
    return {
      ok: true,
      text: [
        ...(r.repeats.length ? [`SAME MOMENT: ${r.repeats.join('; ')}. Do not make a second reel of it: find_clips and save_clip another moment, unless the user asked for this one.`] : []),
        `Saved "${r.title || 'clip'}" by ${r.channel} on ${CLIP_ORIGIN_LABEL[r.site]} (${r.seconds.toFixed(1)}s, ${r.size.w}x${r.size.h}) → ${r.path}`,
        r.site === 'youtube' ? `Source: ${r.url} (the file starts at that point of the video)` : `Source: ${r.url}`,
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

  if (call.tool === 'render_thumbnail') {
    const id = String((call.args as { id?: string })?.id ?? '');
    const v = (useApp.getState().db?.longVideos ?? []).find((x) => x.id === id);
    if (!v) return { ok: false, text: `No long video "${id}". list_long_videos shows them.` };
    if (call.client !== 'Kip') useApp.getState().go('long');
    progress(0.2, 'Drawing the thumbnail');
    const png = await renderThumbnail(v);
    const r = await window.marketo.render.saveLongThumb(v.id, png);
    if (!r.ok || !r.data) return { ok: false, text: r.message ?? 'Saving the thumbnail failed.' };
    return { ok: true, text: `Saved the thumbnail of "${v.title}" (1280x720) → ${r.data}. Look at it: the words must read at phone size; change thumbnail_text / thumbnail_bg / thumbnail_side with save_long_video and render again if not.`, images: [{ data: png, mimeType: 'image/png' }] };
  }

  if (call.tool === 'render_kip') {
    const a = (call.args ?? {}) as { id?: string; sections?: number[]; art?: KipArt; redo?: boolean };
    const v = (useApp.getState().db?.longVideos ?? []).find((x) => x.id === a.id);
    if (!v) return { ok: false, text: `No long video "${a.id}". list_long_videos shows them.` };
    const want = (a.sections?.length ? a.sections.map((n) => n - 1) : v.sections.map((_, i) => i)).filter((i) => v.sections[i]);
    const todo = want.filter((i) => v.sections[i].audio && (a.redo || a.sections?.length || !v.sections[i].kipVideo));
    if (!todo.length) return { ok: true, text: want.some((i) => !v.sections[i].audio) ? 'Those sections have no narration yet: narrate_long_video first.' : 'Every section already has its Kip clip (redo: true renders them again).' };
    if (call.client !== 'Kip') useApp.getState().go('long');
    const accent = '#a855f7';
    const color = '#8B5CF6';
    const lines: string[] = [];
    for (let k = 0; k < todo.length; k++) {
      const i = todo[k];
      const s = v.sections[i];
      const r = await renderKipClip({ section: s, index: i, count: v.sections.length, art: a.art ?? '3d', color, accent, audioUrl: window.marketo.app.mediaUrl(s.audio!), onProgress: (u) => progress((k + u) / todo.length, `Kip, section ${i + 1} (${s.heading})`) });
      const saved = await window.marketo.render.saveLongFile(v.id, `Kip ${String(i + 1).padStart(2, '0')} ${s.heading}.mp4`, r.data, i);
      if (!saved.ok || !saved.data) return { ok: false, text: saved.message ?? 'Saving the Kip clip failed.' };
      lines.push(`${i + 1}. ${s.heading}: ${r.seconds}s, moves ${s.kip || 'automatic'} → ${saved.data}`);
    }
    return { ok: true, text: `Rendered Kip for ${todo.length} section${todo.length === 1 ? '' : 's'} (720x1280, green screen #00d800):\n${lines.join('\n')}\nIn the edit: a new video track added last (it draws in front), each clip at its section's start, chroma_key on, scale about 0.55, pos_y 0.22, pos_x -0.4 (bottom-left) beside a key-points panel or 0.4 (bottom-right) otherwise. Text and shapes draw over video, so no full-screen shape may cover him: check with preview_frames.` };
  }

  const args = (call.args ?? {}) as { id?: string; times?: number[]; scale?: number; shape?: StillShape; t?: number };
  let reel = reelById(args.id ?? null);
  if (!reel) return { ok: false, text: `No reel "${args.id}".` };
  if (call.tool === 'preview_reel') reel = await ensureVoiceover(reel, (s) => progress(0, s));
  const timing = timingFor(reel.preset, reel.fields);

  if (call.tool === 'preview_reel') {
    const stills = await renderStills(reel, args.times, args.scale ?? 0.35, args.shape);
    const f = reel.fields;
    const el = isVoiced(reel.preset) && f.voiceover === true ? elVoiceNote(storyBeats(f), String(f.voice ?? '')) : '';
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

  if (call.tool === 'render_slides') {
    const shape = args.shape ?? 'portrait';
    // A voiced reel's beats are as long as their lines: the voice comes first so each picture is taken at the right moment.
    if (reel.fields.voiceover === true) reel = await ensureVoiceover(reel, (s) => progress(0, s));
    const own = slideTimes(reel.preset, reel.fields);
    const times = (args.times?.length ? args.times : own).slice(0, MAX_SLIDES);
    if (!times.length) return { ok: false, text: `A ${reel.preset} reel has no slides of its own: pass times (the seconds to save, 2 to ${MAX_SLIDES}; preview_reel helps pick them), or make the slideshow with preset slides.` };
    if (times.length < 2) return { ok: false, text: 'A slideshow is at least 2 pictures. One picture is render_image.' };
    progress(0.1, 'Drawing the slides');
    const stills = await renderStills(reel, times, 1, shape, true);
    const saved = await window.marketo.render.saveSlides(reel.id, stills.map((s) => s.data), shape);
    if (!saved.ok || !saved.data) return { ok: false, text: saved.message ?? 'Saving the slides failed.' };
    const size = SHAPE_SIZE[shape];
    const cut = !args.times?.length && own.length > MAX_SLIDES ? ` Only the first ${MAX_SLIDES} of its ${own.length} slides were saved: a photo post takes ${MAX_SLIDES} here, so shorten it or pass times.` : '';
    // Small copies to look at: every slide has to read at phone size.
    const small = await renderStills(reel, times, 0.3, shape);
    return {
      ok: true,
      text: `Saved ${saved.data.length} slides of "${reel.title}" (${shape}, ${size.w}x${size.h}) → ${saved.data[0].replace(/[\\/][^\\/]+$/, '')}\n${saved.data.map((p, i) => `${i + 1}. ${p}`).join('\n')}${cut}\nLook at them below: each slide one idea, the words big enough to read on a phone, nothing cut off. Then browser_attach_slides with this reel's id and the platform puts them all into its composer as one photo post. Shapes: portrait for Instagram, Threads, Facebook and X (up to 4 there); vertical for TikTok (save that shape too before attaching there).`,
      images: small.map((s) => ({ data: s.data, mimeType: 'image/png' })),
    };
  }

  if (call.tool === 'render_reel') {
    if (call.client !== 'Kip') useApp.getState().go('studio', reel.id);
    const t0 = performance.now();
    const r = await renderReel(reel, (ratio, phase) => progress(ratio, `Rendering${args.shape === 'square' ? ' the square version' : ''} (${phase})`), args.shape === 'square' ? 'square' : 'vertical');
    const voiceNotes = takeVoiceNotes();
    const mute = hasSound(reel.preset, reel.fields) ? '' : SILENT_NOTE;
    return { ok: true, text: `Rendered ${args.shape === 'square' ? 'the square (X) version of ' : ''}"${reel.title}" → ${r.path} (${r.seconds.toFixed(1)}s, ${(r.bytes / 1e6).toFixed(1)} MB, took ${((performance.now() - t0) / 1000).toFixed(1)}s).${voiceNotes.length ? `\nVoice: ${voiceNotes.join(' ')}` : ''}${mute}` };
  }

  return { ok: false, text: `The renderer doesn't handle ${call.tool}.` };
}
