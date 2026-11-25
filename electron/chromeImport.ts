// Multi run > Chrome profiles: add the accounts a Chrome profile is signed in to, to the Marketo profile made for
// it. The Chrome profile is opened if it is closed, read through the extension (the same read the setup wizard
// does), and every platform found signed in becomes part of one account kept to that Chrome profile. Pages load
// through the proxy of the profile the accounts are for, never the open profile's.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AccountInput, ChromeImportResult, IgAccount, NetProfile, Network, ProfileScan, Site } from '../shared/types';
import { SITE_LABEL, localDate, normalizeHandle } from '../shared/warmup';
import * as browser from './browser';
import * as chromeBridge from './chromeBridge';
import * as instance from './instance';
import * as profiles from './profiles';
import * as store from './store';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const NETS: Network[] = ['x', 'tiktok', 'threads', 'pinterest'];
const label = (s: Site): string => SITE_LABEL[s] ?? s;

// A test copy of the hub run from source (never an installed build) can be handed made-up sign-ins from a file, so adding
// accounts is tried without opening anybody's Chrome: { "Profile 2001": { "instagram": { "signedIn": true, "handle": "x" } } }.
const FAKE_SCAN = !app.isPackaged && process.env.KRYPT_MARKETO_DATA?.trim() ? process.env.KRYPT_MARKETO_FAKE_SCAN?.trim() || '' : '';
const fakeSites = (dir: string): ProfileScan['sites'] => (JSON.parse(fs.readFileSync(FAKE_SCAN, 'utf8')) as Record<string, ProfileScan['sites']>)[dir] ?? {};

const connected = (dir: string): boolean => chromeBridge.connections().some((c) => chromeBridge.dirOf(c) === dir);

/** The account as the wizard would save it, from what the Chrome profile is signed in to (null = signed in nowhere usable). */
function build(dir: string, chromeName: string, sites: ProfileScan['sites'], fresh: boolean, niche: string): { input: AccountInput; on: Site[] } | null {
  const today = localDate();
  // An account people have used for a while skips the warm-up ramp: day 1 a month back puts every platform in its Active phase.
  const start = fresh ? today : localDate(new Date(Date.now() - 30 * 86_400_000));
  const ig = sites.instagram?.signedIn && sites.instagram.handle ? sites.instagram.handle : '';
  const nets = NETS.filter((n) => sites[n]?.signedIn);
  const yt = !!sites.youtube?.signedIn;
  if (!ig && !nets.length && !yt) return null;
  const name = ig || nets.map((n) => sites[n]!.handle).find(Boolean) || chromeName.replace(/[^A-Za-z0-9._]+/g, '_').replace(/^_+|_+$/g, '') || 'account';
  const net = (n: Network): NetProfile | undefined => (sites[n]?.signedIn ? { enabled: true, warmupStart: start, ...(sites[n]!.handle ? { handle: sites[n]!.handle!.replace(/^@+/, '') } : {}) } : undefined);
  return {
    input: {
      handle: name,
      browser: 'chrome',
      chromeDir: dir,
      instagram: !!ig,
      status: fresh ? 'warming' : 'active',
      createdOn: today,
      warmupStart: start,
      ...(niche ? { niche } : {}),
      ...(yt ? { youtube: { enabled: true, ...(fresh ? { warmupStart: start } : {}) } } : {}),
      x: net('x'),
      tiktok: net('tiktok'),
      threads: net('threads'),
      pinterest: net('pinterest'),
    } as AccountInput,
    on: [...(ig ? (['instagram'] as Site[]) : []), ...(yt ? (['youtube'] as Site[]) : []), ...nets],
  };
}

/** The saved data of a profile that is not open here. */
function readDb(file: string): { igAccounts?: IgAccount[]; settings?: { handle?: string }; brand?: { niche?: string } } & Record<string, unknown> {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
}

/**
 * Read one Chrome profile's sign-ins and add them as the account of the Marketo profile made for it.
 * `fresh` = the accounts are new and start their warm-up today.
 */
export async function addAccounts(dir: string, fresh: boolean): Promise<ChromeImportResult> {
  const p = profiles.list().find((x) => x.chromeDir === dir);
  if (!p) throw new Error('Make a profile for that Chrome profile first.');
  const chromeRow = chromeBridge.status().local.find((c) => c.dir === dir);
  if (!chromeRow) throw new Error('That Chrome profile is not in Chrome any more.');
  const base: ChromeImportResult = { dir, profile: p.name, sites: [] };
  if (!p.active && instance.MULTI && p.running) return { ...base, note: `"${p.name}" is open in its own window: add its account there.` };
  const file = path.join(profiles.dir(p.id), 'marketo-db.json');
  const there = p.active ? store.get().igAccounts : (readDb(file).igAccounts ?? []);
  if (there.length) return { ...base, note: 'It already has an account.' };
  if (!FAKE_SCAN && !chromeRow.hasExtension) return { ...base, note: 'The Krypt Marketo extension is not added in that Chrome profile yet.' };

  // Open it if it is closed, and wait for its extension to connect.
  if (!FAKE_SCAN && !connected(dir)) {
    chromeBridge.openProfile(dir);
    for (const until = Date.now() + 40_000; Date.now() < until && !connected(dir); ) await sleep(800);
    if (!connected(dir)) return { ...base, note: 'Chrome opened it, but its extension did not connect. Reload the extension there (chrome://extensions), then try again.' };
    // Its first status (which sites it is signed in to) follows the connection by a moment.
    await sleep(1500);
  }
  const scan: ProfileScan = FAKE_SCAN ? { sites: fakeSites(dir) } : await browser.scanChromeProfile(dir, p.id);
  const niche = p.active ? store.get().brand.niche : (readDb(file).brand?.niche ?? '');
  const made = build(dir, chromeRow.name, scan.sites, fresh, niche ?? '');
  const unread = (['instagram'] as Site[]).filter((s) => scan.sites[s]?.signedIn && !scan.sites[s]?.handle).map((s) => `${label(s)} is signed in but its name could not be read (add it on the Accounts page)`);
  if (!made) return { ...base, note: unread[0] ?? 'Not signed in to any platform there yet. Sign in, then try again.' };

  let handle: string;
  if (p.active) handle = store.saveAccount(made.input).handle;
  else {
    // The profile is not open anywhere: its account goes straight into its saved data.
    const t = new Date().toISOString();
    handle = normalizeHandle(made.input.handle!);
    const { handle: _h, ...rest } = made.input;
    const acct = { id: store.newId('acct'), handle, ...Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)), setup: { avatar: false, bio: false, link: false, firstPost: false }, createdAt: t, updatedAt: t } as IgAccount;
    const db = readDb(file);
    if ((db.igAccounts ?? []).length) return { ...base, note: 'It already has an account.' };
    db.igAccounts = [acct];
    db.settings = { ...(db.settings ?? {}), handle };
    const tmp = `${file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  }
  const fb = scan.sites.facebook?.signedIn ? 'Facebook is signed in too: pick its Page on the Accounts page.' : '';
  return { ...base, added: handle, sites: made.on.map(label), ...(unread.length || fb ? { note: [...unread, fb].filter(Boolean).join(' ') } : {}) };
}
