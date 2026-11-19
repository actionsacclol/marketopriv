#!/usr/bin/env node
// Call a Krypt Marketo MCP tool through the real stdio bridge, like Claude Code does.
//   node scripts/mcp-call.mjs list                       → tool names
//   node scripts/mcp-call.mjs <tool> '<json args>' [--out <dir>]   → result text; images saved to --out
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const shim = path.join(here, '..', 'resources', 'mcp', 'marketo-mcp.cjs');
const [tool = 'list', rawArgs = '{}', ...rest] = process.argv.slice(2);
const outDir = rest[0] === '--out' ? rest[1] : null;
const argsJson = rawArgs.startsWith('@') ? fs.readFileSync(rawArgs.slice(1), 'utf8') : rawArgs;

const child = spawn(process.execPath, [shim, '--client', 'mcp-call', '--no-launch'], { stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '';
const waiters = new Map();
child.stdout.setEncoding('utf8');
child.stdout.on('data', (c) => {
  buf += c;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    const msg = JSON.parse(line);
    if (msg.method === 'notifications/progress') {
      process.stderr.write(`\r${msg.params.message}        `);
      continue;
    }
    waiters.get(msg.id)?.(msg);
  }
});
let id = 0;
const rpc = (method, params) =>
  new Promise((resolve) => {
    const i = ++id;
    waiters.set(i, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: i, method, params })}\n`);
  });

const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'mcp-call', version: '1' } });
if (init.error) throw new Error(JSON.stringify(init.error));
child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);

if (tool === 'list') {
  const r = await rpc('tools/list', {});
  console.log(r.result.tools.map((t) => t.name).join('\n'));
} else {
  const r = await rpc('tools/call', { name: tool, arguments: JSON.parse(argsJson), _meta: { progressToken: 'p1' } });
  if (r.error) {
    console.error('ERROR', JSON.stringify(r.error));
  } else {
    let n = 0;
    for (const c of r.result.content) {
      if (c.type === 'text') console.log(c.text);
      else if (c.type === 'image' && outDir) {
        fs.mkdirSync(outDir, { recursive: true });
        const f = path.join(outDir, `${tool}-${++n}.png`);
        fs.writeFileSync(f, Buffer.from(c.data, 'base64'));
        console.log(`[image] ${f}`);
      }
    }
    if (r.result.isError) process.exitCode = 1;
  }
}
child.stdin.end();
child.kill();
process.exit();
