#!/usr/bin/env node
// Make the example videos for Create > Examples (resources/examples/<id>.mp4 + .jpg)
// from shared/examples.ts, through the running hub:
//   node scripts/make-examples.mjs            → every example
//   node scripts/make-examples.mjs story-ps2  → just these ids
// Each example is created as a temporary reel, rendered, shrunk to 720p with
// ffmpeg (must be on PATH), then the temporary reel is removed again.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'resources', 'examples');
fs.mkdirSync(out, { recursive: true });

// Load the TypeScript list.
const tmp = path.join(os.tmpdir(), `marketo-examples-${process.pid}.mjs`);
await build({ entryPoints: [path.join(root, 'shared', 'examples.ts')], bundle: true, platform: 'node', format: 'esm', outfile: tmp, logLevel: 'error' });
const { EXAMPLES } = await import(pathToFileURL(tmp).href);
fs.rmSync(tmp, { force: true });

const call = (tool, args) => execFileSync(process.execPath, [path.join(root, 'scripts', 'mcp-call.mjs'), tool, JSON.stringify(args)], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });

const only = process.argv.slice(2);
for (const ex of EXAMPLES.filter((e) => !only.length || only.includes(e.id))) {
  process.stdout.write(`${ex.id}: `);
  const fields = { ...ex.fields, ...(ex.video ? { video: path.join(out, ex.video) } : {}) };
  const created = call('create_reel', { preset: ex.preset, title: `EXAMPLE ${ex.name}`, ...(Object.keys(fields).length ? { fields } : {}) });
  const id = created.match(/reel_[a-z0-9]+/)?.[0];
  if (!id) {
    console.log(`could not create: ${created.slice(0, 200)}`);
    continue;
  }
  try {
    const rendered = call('render_reel', { id });
    const mp4 = rendered.match(/→ (.+?\.mp4)/)?.[1];
    if (!mp4 || !fs.existsSync(mp4)) throw new Error(`render failed: ${rendered.slice(0, 300)}`);
    const dest = path.join(out, `${ex.id}.mp4`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '26', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', dest]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '1.6', '-i', dest, '-frames:v', '1', '-q:v', '4', path.join(out, `${ex.id}.jpg`)]);
    console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
  } catch (e) {
    console.log(e.message);
  } finally {
    // The full-size render goes to the Recycle Bin with the temporary reel.
    call('delete_reel', { id, delete_file: true });
  }
}
