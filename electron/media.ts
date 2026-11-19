/**
 * `marketo://media/<encoded-path>` streams a local media file (clips, music,
 * finished renders) to the renderer with Range support, so <video>/<audio>
 * seek and mediabunny can read it. Same design as Krypt Editor's protocol.
 *
 * This hub is internal, so instead of a per-import allowlist it serves any
 * existing file with a media extension, and nothing else.
 *
 * registerScheme() must run BEFORE app 'ready'; installHandler() after.
 */

import { protocol } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { modelDirs } from './voice';
import { whisperDir } from './whisper';

export const SCHEME = 'marketo';

const MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/aac',
  aac: 'audio/aac',
  flac: 'audio/flac',
  // Twitch / Kick stream segments: Chromium does not play MPEG-TS, but the transcriber reads them through mediabunny.
  ts: 'video/mp2t',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const isMediaPath = (p: string): boolean => path.extname(p).slice(1).toLowerCase() in MIME;

/** The Kokoro voice model (.onnx/.bin), only from Krypt Editor's / Studio's model folders. */
const isModelPath = (p: string): boolean => {
  if (!/\.(onnx|bin)$/i.test(p)) return false;
  const full = path.resolve(p).toLowerCase();
  return modelDirs().some((d) => full.startsWith(path.resolve(d).toLowerCase() + path.sep));
};

/** The Whisper speech-to-text model (.onnx plus its tokenizer / config .json), only from its own folder. */
const isWhisperPath = (p: string): boolean =>
  /\.(onnx|json)$/i.test(p) && path.resolve(p).toLowerCase().startsWith(path.resolve(whisperDir()).toLowerCase() + path.sep);

export function registerScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } },
  ]);
}

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header ? /^bytes=(\d*)-(\d*)$/.exec(header.trim()) : null;
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start: number;
  let end: number;
  if (m[1] === '') {
    const n = parseInt(m[2], 10);
    if (!(n > 0)) return null;
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] === '' ? size - 1 : parseInt(m[2], 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges, Content-Type',
};

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== 'media') return new Response('not found', { status: 404 });
  const filePath = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!filePath || !(isMediaPath(filePath) || isModelPath(filePath) || isWhisperPath(filePath))) return new Response('forbidden', { status: 403 });
  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return new Response('not found', { status: 404 });
  }
  if (!stat.isFile()) return new Response('not found', { status: 404 });
  const size = stat.size;
  const mime = MIME[path.extname(filePath).slice(1).toLowerCase()] ?? 'application/octet-stream';
  const range = parseRange(request.headers.get('range'), size);
  if (range) {
    const body = Readable.toWeb(fs.createReadStream(filePath, range)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 206,
      headers: { 'Content-Type': mime, 'Content-Length': String(range.end - range.start + 1), 'Content-Range': `bytes ${range.start}-${range.end}/${size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' },
    });
  }
  const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;
  return new Response(body, { status: 200, headers: { 'Content-Type': mime, 'Content-Length': String(size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' } });
}

export function installHandler(): void {
  protocol.handle(SCHEME, async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    let res: Response;
    try {
      res = await serve(request);
    } catch (e) {
      res = new Response(`error: ${(e as Error).message}`, { status: 500 });
    }
    for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
    return res;
  });
}
