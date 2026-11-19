import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { ResearchDoc } from '../shared/types';
import * as profiles from './profiles';

// Markdown notes the AI reads before making reels (get_playbook): the ones
// that ship with the app (<app>/research) plus the user's own
// (<userData>/playbook: product notes, their own research). Read fresh each
// time so edits show up without restarting the hub.

const builtinDir = (): string => path.join(app.getAppPath(), 'research');
export const userDir = (): string => path.join(profiles.dir(), 'playbook');

function read(dir: string): ResearchDoc[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => /^\d+-.*\.md$/i.test(f))
      .sort()
      .map((file) => {
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const title = /^#\s+(.+)$/m.exec(content)?.[1].trim() ?? file;
        return { file, title, content };
      });
  } catch {
    return [];
  }
}

/** Built-in docs first, then the user's; a user file with the same name replaces the built-in one. */
export function listDocs(): ResearchDoc[] {
  const mine = read(userDir()).map((d) => ({ ...d, mine: true }));
  const names = new Set(mine.map((d) => d.file));
  return [...read(builtinDir()).filter((d) => !names.has(d.file)), ...mine];
}

/** By file name, number prefix ("03") or a word in the title/file name. */
export function findDoc(key: string): ResearchDoc | undefined {
  const k = key.trim().toLowerCase();
  const docs = listDocs();
  return docs.find((d) => d.file.toLowerCase() === k || d.file.toLowerCase() === `${k}.md`) ?? docs.find((d) => d.file.startsWith(k.padStart(2, '0') + '-')) ?? docs.find((d) => `${d.file} ${d.title}`.toLowerCase().includes(k));
}

/**
 * Delete one of the user's own notes: by file name, its number ("56") or its exact title. Never a guess from one
 * word, and never a note that came with the app. The file is moved into the playbook's "deleted" folder, so a
 * note deleted by mistake can be put back by hand.
 */
export function deleteNote(key: string): { file: string; title: string; builtinBack: boolean } {
  const k = String(key ?? '').trim().toLowerCase();
  if (!k) throw new Error('Say which note: its file name or number.');
  const mine = read(userDir());
  const hits = mine.filter((d) => d.file.toLowerCase() === k || d.file.toLowerCase() === `${k}.md` || (/^\d+$/.test(k) && d.file.startsWith(`${k.padStart(2, '0')}-`)) || d.title.toLowerCase() === k);
  if (hits.length > 1) throw new Error(`More than one note matches "${key}": ${hits.map((d) => d.file).join(', ')}. Give the file name.`);
  const d = hits[0];
  if (!d) {
    const builtin = read(builtinDir()).some((x) => x.file.toLowerCase() === k || x.file.toLowerCase() === `${k}.md` || (/^\d+$/.test(k) && x.file.startsWith(`${k.padStart(2, '0')}-`)));
    throw new Error(builtin ? `"${key}" came with the app and cannot be deleted. Only the user's own notes can.` : `No note of the user's own matches "${key}". Their notes: ${mine.map((x) => x.file).join(', ') || 'none'}.`);
  }
  const bin = path.join(userDir(), 'deleted');
  fs.mkdirSync(bin, { recursive: true });
  fs.renameSync(path.join(userDir(), d.file), path.join(bin, `${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')} ${d.file}`));
  return { file: d.file, title: d.title, builtinBack: read(builtinDir()).some((x) => x.file === d.file) };
}

/** Save a note into the user's playbook (same title = update it). Returns the file name. */
export function saveNote(title: string, content: string): string {
  const clean = title.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('The note needs a title.');
  const slug = clean.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'note';
  fs.mkdirSync(userDir(), { recursive: true });
  const mine = read(userDir());
  const existing = mine.find((d) => d.file.replace(/^\d+-/, '') === `${slug}.md`);
  // User notes are numbered from 50 so they list after the built-in docs.
  const next = Math.max(49, ...mine.map((d) => parseInt(d.file, 10) || 0)) + 1;
  const file = existing?.file ?? `${String(next).padStart(2, '0')}-${slug}.md`;
  const body = /^#\s/m.test(content.trimStart().slice(0, 200)) ? content.trim() : `# ${clean}\n\n${content.trim()}`;
  fs.writeFileSync(path.join(userDir(), file), `${body}\n`, 'utf8');
  return file;
}
