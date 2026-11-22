import { shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { DeleteReelsResult, Reel } from '../shared/types';
import { readVoiceCache } from '../shared/voice';
import { isVoiced } from '../shared/presets';
import * as store from './store';
import * as voice from './voice';

// Deleting reels, and what they leave on disk: the rendered MP4 (only moved
// to the Recycle Bin / Trash when asked, never erased) and the narration
// clips in the hub's own voice folder (a cache; cleared when no reel uses them).

/** File names in the voice folder that some reel still points at. */
function voiceRefs(): Set<string> {
  const keep = new Set<string>();
  for (const r of store.get().reels) {
    if (!isVoiced(r.preset)) continue;
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

/** The last time a reel went up anywhere. */
function lastPosted(r: Reel): number {
  const at = [r.postedAt, r.shortsPostedAt, r.xPostedAt, r.tiktokPostedAt, ...Object.values(r.links ?? {}).map((l) => l?.at)];
  return Math.max(0, ...at.map((x) => (x ? Date.parse(x) || 0 : 0)));
}

/**
 * Setup > Performance, clean up posted reels: a posted reel's rendered files (vertical and square) go to the Recycle
 * Bin once its last post is this many days old, unless another reel uses the same file or a Content Rewards
 * submission for it is still open. The reel, its caption, links and numbers stay; render it again to post it again.
 */
export async function cleanupRenders(days: number): Promise<{ reels: number; files: number }> {
  if (!(days > 0)) return { reels: 0, files: 0 };
  const d = store.get();
  const before = Date.now() - days * 86_400_000;
  const open = new Set((d.submissions ?? []).filter((s) => s.status === 'due' || s.status === 'submitted').map((s) => s.reelId));
  const done = d.reels.filter((r) => r.status === 'posted' && (r.renderPath || r.squarePath) && !open.has(r.id) && lastPosted(r) > 0 && lastPosted(r) < before);
  if (!done.length) return { reels: 0, files: 0 };
  const ids = new Set(done.map((r) => r.id));
  const keep = new Set(d.reels.filter((r) => !ids.has(r.id)).flatMap((r) => [r.renderPath, r.squarePath]).filter(Boolean));
  let files = 0;
  const cleaned: string[] = [];
  for (const r of done) {
    let ok = true;
    for (const f of [r.renderPath, r.squarePath]) {
      if (!f || keep.has(f) || !fs.existsSync(f)) continue;
      try {
        await shell.trashItem(f);
        files++;
      } catch {
        ok = false;
      }
    }
    if (ok) cleaned.push(r.id);
  }
  if (cleaned.length) store.filesCleaned(cleaned);
  return { reels: cleaned.length, files };
}
