// Reference videos on disk: the hub keeps its own copy of each uploaded video
// and the pictures made of it, in <userData>/refs/<id>/. The analysis itself
// runs in the renderer (src/render/refAnalyze.ts); the numbers live in the DB.

import fs from 'node:fs';
import path from 'node:path';
import type { RefVideo, RefVideoInput } from '../shared/types';
import { isMediaPath } from './media';
import * as store from './store';

/** Reference videos are short clips; anything bigger is the wrong file. */
export const MAX_REF_BYTES = 500 * 1024 * 1024;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv)$/i;

/** Why this file can't be a reference video (null = fine). Checked before the hub window is asked to analyse it. */
export function problemWith(file: string): string | null {
  if (!file || !path.isAbsolute(file)) return 'Pass the full path of a video file on this computer.';
  if (!isMediaPath(file) || !VIDEO_EXT.test(file)) return 'That is not a video file (mp4, mov, webm, mkv).';
  let stat: fs.Stats;
  try {
    stat = fs.statSync(file);
  } catch {
    return `There is no file at ${file}.`;
  }
  if (!stat.isFile()) return `${file} is not a file.`;
  if (stat.size > MAX_REF_BYTES) return `That video is ${(stat.size / 1e6).toFixed(0)} MB. Reference videos are short clips (up to 500 MB); trim it first.`;
  return null;
}

const dirOf = (userData: string, id: string): string => path.join(userData, 'refs', id);

export async function add(userData: string, input: RefVideoInput): Promise<RefVideo> {
  const bad = problemWith(input.path);
  if (bad) throw new Error(bad);
  const id = store.newRefId();
  const dir = dirOf(userData, id);
  await fs.promises.mkdir(dir, { recursive: true });
  try {
    const file = path.join(dir, `video${path.extname(input.path).toLowerCase()}`);
    await fs.promises.copyFile(input.path, file);
    const sheets = { poster: path.join(dir, 'poster.jpg'), hook: path.join(dir, 'hook.jpg'), shots: path.join(dir, 'shots.jpg') };
    await fs.promises.writeFile(sheets.poster, input.poster);
    await fs.promises.writeFile(sheets.hook, input.hook);
    await fs.promises.writeFile(sheets.shots, input.shots);
    const name = (input.name?.trim() || path.basename(input.path, path.extname(input.path)).replace(/[_-]+/g, ' ').trim() || 'Reference').slice(0, 80);
    return store.addRefVideo({ id, name, file, source: input.path, notes: input.notes?.trim() || undefined, profile: input.profile, sheets, addedAt: new Date().toISOString() });
  } catch (e) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
    throw e;
  }
}

/** Remove a reference video and the hub's copy of it (the user's original file is not touched). */
export async function remove(userData: string, id: string): Promise<void> {
  const r = store.deleteRefVideo(id);
  const dir = dirOf(userData, r.id);
  // Only ever delete our own folder for this id.
  if (path.dirname(r.file) === dir) await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
}

export function readSheet(file: string): { data: string; mimeType: string } | null {
  try {
    return { data: fs.readFileSync(file).toString('base64'), mimeType: 'image/jpeg' };
  } catch {
    return null;
  }
}
