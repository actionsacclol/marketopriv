// Copies the Krypt Privacy Chrome extension into resources/privacy-extension, which ships with the app
// (Resources > Krypt Privacy Extension).
//
//   node scripts/sync-privacy-extension.mjs <folder that holds the extension's manifest.json>
//
// The shipped copy carries a "key" in its manifest. That fixes its Chrome id wherever Marketo is installed, so
// an update or a moved install never gives the extension a new id, which would reset each Chrome profile's
// identity. The key is made on the first run (private half in privacy-extension-key.pem, never shipped) and
// kept on every later one.
import { generateKeyPairSync, createHash } from 'node:crypto';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const from = process.argv[2] && path.resolve(process.argv[2]);
const to = path.join(root, 'resources', 'privacy-extension');
const pem = path.join(root, 'privacy-extension-key.pem');

if (!from || !existsSync(path.join(from, 'manifest.json'))) {
  console.error('Give the folder that holds the extension (the one with manifest.json).');
  process.exit(1);
}

let key = existsSync(path.join(to, 'manifest.json')) ? JSON.parse(readFileSync(path.join(to, 'manifest.json'), 'utf8')).key : undefined;
if (!key) {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  key = pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  writeFileSync(pem, pair.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  console.log(`made a new key (${path.basename(pem)})`);
}

rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
const manifest = JSON.parse(readFileSync(path.join(to, 'manifest.json'), 'utf8'));
// "key" right after the version, like resources/extension.
const withKey = {};
for (const [k, v] of Object.entries(manifest)) {
  if (k === 'key') continue;
  withKey[k] = v;
  if (k === 'version') withKey.key = key;
}
writeFileSync(path.join(to, 'manifest.json'), `${JSON.stringify(withKey, null, 2)}\n`);

// Chrome's id for a key: the first 16 bytes of its SHA-256, written with a-p for 0-f.
const id = [...createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
console.log(`Krypt Privacy ${manifest.version} copied to resources/privacy-extension (Chrome id ${id})`);
