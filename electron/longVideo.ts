import fs from 'node:fs';
import path from 'node:path';
import type { LongVideo } from '../shared/types';
import * as store from './store';
import * as eleven from './eleven';

// Long videos (YouTube, 5-20 min): the script lives in the hub, section by section; narrate() buys each section's
// speech from ElevenLabs in the user's default voice and saves it as its own MP3 in the video's folder, so the edit
// (Krypt Editor, 16:9) lays them end to end. The thumbnail is drawn in the renderer (render_thumbnail).

const safe = (s: string): string => s.replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'video';

/** <output folder>/Long videos/<title> <id>/ */
export function dirOf(v: LongVideo): string {
  return path.join(store.get().settings.outputDir, 'Long videos', `${safe(v.title)} ${v.id.slice(5)}`);
}

/** The ElevenLabs voice id of the user's default voice (Voices page). Long videos use that one voice throughout. */
function voiceId(): { id: string; speed: number } {
  const v = store.get().settings.voice;
  if (!v?.voice?.startsWith('el:')) throw new Error('Long videos are narrated with the ElevenLabs voice set as the default on the Voices page, and none is set. Ask the user to pick one there.');
  return { id: v.voice.slice(3), speed: v.speed || 1 };
}

export interface NarrateResult {
  video: LongVideo;
  bought: number;
  credits: number;
  notes: string[];
}

/** Speak every section that has no audio yet (or all, with redo). Each section is one MP3: NN <heading>.mp3. */
export async function narrate(id: string, redo = false): Promise<NarrateResult> {
  let v = store.findLongVideo(id);
  if (!v.sections.length) throw new Error('This video has no script yet: save_long_video with sections first.');
  const voice = voiceId();
  const dir = dirOf(v);
  await fs.promises.mkdir(dir, { recursive: true });
  let bought = 0;
  let credits = 0;
  const notes = new Set<string>();
  const sections = [...v.sections];
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (!redo && s.audio && fs.existsSync(s.audio) && s.spoken === s.text) continue;
    const r = await eleven.tts({ voice: voice.id, text: s.text, speed: voice.speed, prev: sections[i - 1]?.text, next: sections[i + 1]?.text });
    const file = path.join(dir, `${String(i + 1).padStart(2, '0')} ${safe(s.heading)}.mp3`);
    await fs.promises.writeFile(file, r.audio);
    const seconds = r.alignment?.ends.length ? Math.round(r.alignment.ends[r.alignment.ends.length - 1] * 100) / 100 : undefined;
    sections[i] = { ...s, audio: file, seconds, spoken: s.text };
    bought++;
    credits += r.credits;
    if (r.note) notes.add(r.note);
    // Saved as it goes: a budget stop halfway keeps what was bought.
    v = store.saveLongVideo({ id: v.id, sections, voice: `el:${voice.id}` });
  }
  if (sections.every((s) => s.audio)) v = store.saveLongVideo({ id: v.id, status: v.status === 'script' ? 'narrated' : v.status });
  return { video: v, bought, credits, notes: [...notes] };
}
