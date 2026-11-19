#!/usr/bin/env node
// Record the short screen clips of the Krypt apps that ship with the hub
// (resources/tools/<tool id>.mp4 + .jpg), through the running hub:
//   node scripts/record-tools.mjs "studio=Krypt Studio" "editor=Krypt Editor|Krypt Editor"
// Each argument is <tool id>=<Start menu name or .exe path>[|<window title, if it differs>],
// or <tool id>=src:<app source folder>|<window title> to run a built Electron app from its source
// folder (npm install + npm run build there first).
// The app is opened, its window recorded for SECONDS, and closed again if it
// was not running before. Look at every clip before it ships: nothing private
// (balances, accounts, messages, locations) may be on screen.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'resources', 'tools');
fs.mkdirSync(out, { recursive: true });
const SECONDS = Number(process.env.SECONDS || 12);

const call = (tool, args) => execFileSync(process.execPath, [path.join(root, 'scripts', 'mcp-call.mjs'), tool, JSON.stringify(args)], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
const ps = (cmd) => execFileSync('powershell', ['-NoProfile', '-Command', cmd], { encoding: 'utf8' });
const windows = () => ps('Get-Process | ? { $_.MainWindowTitle } | % { "$($_.Id)|$($_.MainWindowTitle)" }').split(/\r?\n/).filter(Boolean).map((l) => ({ pid: Number(l.split('|')[0]), title: l.slice(l.indexOf('|') + 1) }));

for (const arg of process.argv.slice(2)) {
  const [id, rest] = arg.split('=');
  const [launch, title] = rest.split('|');
  const want = (title || launch).replace(/\.(exe|lnk)$/i, '').split(/[\\/]/).pop();
  process.stdout.write(`${id}: `);
  const before = new Set(windows().map((w) => w.pid));
  const src = launch.startsWith('src:') ? launch.slice(4) : '';
  const child = src ? spawn(path.join(src, 'node_modules', 'electron', 'dist', 'electron.exe'), [src], { cwd: src, detached: true, stdio: 'ignore' }) : null;
  if (child) await new Promise((r) => setTimeout(r, 10000));
  try {
    const r = call('record_screen', src ? { window: want, seconds: SECONDS, name: `tool ${id}` } : { window: want, launch, seconds: SECONDS, name: `tool ${id}` });
    const file = r.match(/→ (.+?\.(mp4|webm))/)?.[1];
    if (!file || !fs.existsSync(file)) throw new Error(r.split('\n').find((l) => /No open window|Could not|No app/.test(l)) ?? r.slice(0, 300));
    const dest = path.join(out, `${id}.mp4`);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', file, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-an', '-movflags', '+faststart', dest]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', '3', '-i', dest, '-frames:v', '1', '-q:v', '4', path.join(out, `${id}.jpg`)]);
    console.log(`${(fs.statSync(dest).size / 1e6).toFixed(1)} MB`);
  } catch (e) {
    console.log(`FAILED: ${String(e.message).split('\n')[0].slice(0, 300)}`);
  } finally {
    if (child) ps(`taskkill /PID ${child.pid} /T /F 2>$null | Out-Null`);
    // Close only what this opened.
    for (const w of windows()) if (!before.has(w.pid) && w.title.toLowerCase().includes(want.toLowerCase().split(' ').pop())) ps(`$p = Get-Process -Id ${w.pid} -ErrorAction SilentlyContinue; if ($p) { [void]$p.CloseMainWindow() }`);
  }
}
