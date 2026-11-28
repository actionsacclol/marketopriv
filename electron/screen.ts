import { app, desktopCapturer, shell } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as store from './store';

// Screen recordings for screen-tutorial reels (record_screen): the windows that
// can be recorded, launching an app by its Start menu name, and saving the
// recording. The recording itself runs in the renderer (MediaRecorder on a
// desktop capture stream of one window). Only windows, never the whole screen:
// what gets recorded is always one named app.

export interface ScreenSource {
  id: string;
  name: string;
}

/** Open windows that can be recorded (Marketo's own left out). */
export async function sources(): Promise<ScreenSource[]> {
  const list = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
  return list.filter((s) => s.name.trim() && !/^krypt marketo$/i.test(s.name.trim())).map((s) => ({ id: s.id, name: s.name }));
}

const START_MENUS = [path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs'), path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs')];

function shortcuts(): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number): void => {
    let items: fs.Dirent[] = [];
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const p = path.join(dir, it.name);
      if (it.isDirectory() && depth < 2) walk(p, depth + 1);
      else if (/\.lnk$/i.test(it.name)) out.push(p);
    }
  };
  START_MENUS.forEach((d) => walk(d, 0));
  return out;
}

/** Start an app: a path to an .exe / .lnk, or a Start menu name ("Krypt Tweaker"). Returns what was opened. */
export async function launch(target: string): Promise<string> {
  const t = target.trim();
  if (!t) throw new Error('Nothing to launch.');
  let file = '';
  if (/\.(exe|lnk)$/i.test(t) && fs.existsSync(t)) file = t;
  else {
    const want = t.toLowerCase().replace(/\.lnk$/, '');
    const all = shortcuts();
    file = all.find((p) => path.basename(p, '.lnk').toLowerCase() === want) ?? all.find((p) => path.basename(p, '.lnk').toLowerCase().includes(want)) ?? '';
    if (!file) throw new Error(`No app called "${t}" in the Start menu. Installed: ${[...new Set(all.map((p) => path.basename(p, '.lnk')).filter((n) => /krypt/i.test(n)))].join(', ') || 'none found'}.`);
  }
  const err = await shell.openPath(file);
  if (err) throw new Error(`Could not open ${file}: ${err}`);
  return path.basename(file).replace(/\.lnk$/i, '');
}

/** Short screen recordings of the Krypt apps that ship with the hub (resources/tools/<tool id>.mp4). */
export function toolsDir(): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'resources', 'tools') : path.join(app.getAppPath(), 'resources', 'tools');
}
export function toolClips(): string[] {
  const dir = toolsDir();
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).map((f) => f.slice(0, -4)) : [];
}
/** A tool's bundled recording (absolute path), or null. */
export function toolClip(id: string): string | null {
  const p = path.join(toolsDir(), `${id}.mp4`);
  return fs.existsSync(p) ? p : null;
}

/** The example videos of the reel styles that ship with the hub (resources/examples/<id>.mp4), absolute paths. */
export function exampleVideos(): string[] {
  const dir = app.isPackaged ? path.join(process.resourcesPath, 'resources', 'examples') : path.join(app.getAppPath(), 'resources', 'examples');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.mp4')).sort().map((f) => path.join(dir, f)) : [];
}

/** Save a recording in the output folder's Recordings folder. */
export function save(bytes: Uint8Array, name: string): string {
  const dir = path.join(store.get().settings.outputDir, 'Recordings');
  fs.mkdirSync(dir, { recursive: true });
  const ext = /\.mp4$/i.test(name) ? '.mp4' : '.webm';
  const base = (name.replace(/\.(mp4|webm)$/i, '').trim() || 'recording').replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const file = path.join(dir, `${base} ${stamp}${ext}`);
  fs.writeFileSync(file, bytes);
  return file;
}
