import { shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { DeleteReelsResult } from '../shared/types';
import { readVoiceCache } from '../shared/voice';
import * as store from './store';
import * as voice from './voice';

// Deleting reels, and what they leave on disk: the rendered MP4 (only moved
// to the Recycle Bin / Trash when asked, never erased) and the narration
// clips in the hub's own voice folder (a cache; cleared when no reel uses them).

/** File names in the voice folder that some reel still points at. */
function voiceRefs(): Set<string> {
  const keep = new Set<string>();
  for (const r of store.get().reels) {
    if (r.preset !== 'story') continue;
    const c = readVoiceCache(r.fields.vo_cache);
    for (const clip of Object.values(c.clips)) if (clip?.file) keep.add(path.basename(clip.file).toLowerCase());
    if (c.track) keep.add(path.basename(c.track).toLowerCase());
  }
  return keep;
}

export const pruneVoice = (): Promise<number> => voice.prune(voiceRefs()).catch(() => 0);

/** Remove reels from the hub. With trashFiles, a rendered video no other reel points at goes to the Recycle Bin / Trash. */
export async function removeReels(ids: string[], trashFiles: boolean): Promise<DeleteReelsResult> {
  const gone = store.deleteReels(ids.map(String));
  const out: DeleteReelsResult = { deleted: gone.length, trashed: 0, failed: [] };
  if (trashFiles) {
    const still = new Set(store.get().reels.flatMap((r) => [r.renderPath, r.squarePath]).filter(Boolean));
    const files = [...new Set(gone.flatMap((r) => [r.renderPath, r.squarePath]).filter((p): p is string => !!p && !still.has(p)))];
    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      try {
        await shell.trashItem(f);
        out.trashed++;
      } catch {
        out.failed.push(f);
      }
    }
  }
  void pruneVoice();
  return out;
}
