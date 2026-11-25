import { useEffect, useRef, useState } from 'react';
import { Chrome, CircleAlert, CircleCheck, Copy, ExternalLink, Layers, Plus, UserPlus } from 'lucide-react';
import type { ChromeLocalRow } from '@shared/types';
import { Card, GhostButton, PrimaryButton, Toggle } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Multi run > Chrome profiles: Chrome's own profiles on this computer, each with what uses it here. Make new ones
// in bulk, and make a Marketo profile for each (a separate set of accounts that starts out in that Chrome profile),
// with the accounts that Chrome profile is signed in to added to it.
// Emails arrive partly hidden; the full address never reaches this window.

export function ChromeManager({ onMade }: { onMade?: () => void }) {
  const toast = useApp((s) => s.toast);
  const chrome = useApp((s) => s.chrome);
  const [rows, setRows] = useState<ChromeLocalRow[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState('5');
  const [prefix, setPrefix] = useState('Marketo');
  const [alsoProfiles, setAlsoProfiles] = useState(true);
  const [copy, setCopy] = useState(true);
  const [copyKnowledge, setCopyKnowledge] = useState(true);
  const [auto, setAuto] = useState(false);
  const [addAccts, setAddAccts] = useState(true);
  const [fresh, setFresh] = useState(true);
  const [useProxy, setUseProxy] = useState(true);
  /** Proxies in the list that are not failed (handed to new profiles before their pages load). */
  const [spare, setSpare] = useState(0);
  /** What reading each Chrome profile came to, shown on its line. */
  const [notes, setNotes] = useState<Record<string, { ok: boolean; text: string }>>({});
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const load = async (): Promise<ChromeLocalRow[]> => {
    const r = await window.marketo.chrome.locals();
    if (alive.current) setRows(r);
    void window.marketo.proxy.pool().then((p) => alive.current && setSpare(p.filter((x) => !x.error).length));
    return r;
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, []);

  const free = (rows ?? []).filter((r) => !r.profile && !r.accounts.length);
  const sel = free.filter((r) => picked.has(r.dir));
  const flip = (dir: string): void =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(dir)) n.delete(dir);
      else n.add(dir);
      return n;
    });

  const importDirs = async (dirs: string[]): Promise<number> => {
    const r = await window.marketo.chrome.importProfiles(dirs, copy, copyKnowledge, auto);
    if (r.data) useApp.setState({ profiles: r.data });
    if (!r.ok) {
      toast('error', r.message ?? 'Could not make the profiles.');
      return r.made ?? 0;
    }
    return r.made ?? 0;
  };
  const note = (dir: string, ok: boolean, text: string): void => setNotes((n) => ({ ...n, [dir]: { ok, text } }));
  /** A proxy from the list for each of these profiles that has none (good ones first, failed ones never), checked so its IP is set. */
  const handOut = async (list: ChromeLocalRow[]): Promise<number> => {
    const owners = new Map((await window.marketo.proxy.list()).map((r) => [r.id, !!r.state.settings?.on]));
    const pool = (await window.marketo.proxy.pool()).filter((x) => !x.error).sort((a, b) => Number(!!b.ip) - Number(!!a.ip));
    let given = 0;
    for (const r of list) {
      const id = r.profile?.id;
      if (!id || owners.get(id)) continue;
      const next = pool.shift();
      if (!next) break;
      note(r.dir, true, 'Setting its proxy…');
      const a = await window.marketo.proxy.poolAssign(next.id, id);
      if (!a.ok) {
        note(r.dir, false, a.message ?? 'Could not set its proxy.');
        continue;
      }
      const c = await window.marketo.proxy.check(id);
      if (c.data?.settings?.error) note(r.dir, false, `Its proxy did not work: ${c.data.settings.error}`);
      else given++;
    }
    return given;
  };
  /** Read each Chrome profile's sign-ins and add them as its profile's account, one Chrome profile at a time. */
  const readAccounts = async (list: ChromeLocalRow[]): Promise<number> => {
    let added = 0;
    for (const r of list) {
      if (!alive.current) break;
      if (!r.hasExtension) {
        note(r.dir, false, 'Add the extension there first, then press Add account.');
        continue;
      }
      note(r.dir, true, r.connected ? 'Reading its sign-ins…' : 'Opening it in Chrome…');
      const x = await window.marketo.chrome.addAccounts(r.dir, fresh);
      if (!x.ok || !x.data) note(r.dir, false, x.message ?? 'Could not read it.');
      else if (x.data.added) {
        added++;
        note(r.dir, true, `Added ${x.data.added} (${x.data.sites.join(', ')})${x.data.note ? `. ${x.data.note}` : ''}`);
      } else note(r.dir, false, x.data.note ?? 'Nothing added.');
    }
    return added;
  };
  const importPicked = async (): Promise<void> => {
    if (!sel.length) return;
    const dirs = new Set(sel.map((r) => r.dir));
    setBusy(true);
    const n = await importDirs([...dirs]);
    setPicked(new Set());
    const made = (await load()).filter((r) => dirs.has(r.dir) && r.profile && r.empty);
    const proxied = useProxy && spare > 0 ? await handOut(made) : 0;
    const added = addAccts ? await readAccounts(made) : 0;
    setBusy(false);
    await load();
    if (n) {
      const left = n - added;
      toast(
        'ok',
        `${n} profile${n === 1 ? '' : 's'} made${proxied ? `, ${proxied} given a proxy` : ''}${addAccts ? `, ${added} account${added === 1 ? '' : 's'} added` : ''}.${
          left > 0 ? ` ${left} still need${left === 1 ? 's' : ''} an account: see the note on ${left === 1 ? 'its' : 'each'} line.` : ''
        }`,
      );
      if (!addAccts || !left) onMade?.();
    }
  };
  const waiting = (rows ?? []).filter((r) => r.profile && r.empty);
  const addFor = async (list: ChromeLocalRow[]): Promise<void> => {
    if (!list.length) return;
    setBusy(true);
    const added = await readAccounts(list);
    setBusy(false);
    await load();
    toast(added ? 'ok' : 'warn', added ? `${added} account${added === 1 ? '' : 's'} added.` : 'No account added: see the note on each line.');
  };
  const make = async (): Promise<void> => {
    const n = Math.max(1, Math.min(50, Math.round(Number(count)) || 0));
    const base = prefix.trim() || 'Marketo';
    // Carry on after the highest "Marketo 7" there is.
    const taken = (rows ?? []).map((r) => new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`, 'i').exec(r.name)).filter(Boolean).map((m) => Number(m![1]));
    const from = (taken.length ? Math.max(...taken) : 0) + 1;
    const names = Array.from({ length: n }, (_, k) => `${base} ${from + k}`);
    setBusy(true);
    toast('ok', `Making ${n} Chrome profile${n === 1 ? '' : 's'}: a Chrome window opens for each.`);
    const r = await window.marketo.chrome.make(names);
    if (!r.ok || !r.data) {
      setBusy(false);
      return toast('error', r.message ?? 'Could not make the Chrome profiles.');
    }
    await load();
    let made = 0;
    if (alsoProfiles) made = await importDirs(r.data.map((x) => x.dir));
    setBusy(false);
    await load();
    toast('ok', `${r.data.length} Chrome profile${r.data.length === 1 ? '' : 's'} made${made ? `, and ${made} Marketo profile${made === 1 ? '' : 's'} for them` : ''}. In each one: add the Krypt Marketo extension, then sign in to its accounts.`);
    if (made) onMade?.();
  };
  const open = async (dir: string): Promise<void> => {
    const r = await window.marketo.chrome.open(dir);
    if (!r.ok) toast('error', r.message ?? 'Could not open Chrome.');
  };
  const COLS = 'grid grid-cols-[22px_minmax(0,1.2fr)_minmax(0,0.9fr)_minmax(0,1.5fr)_196px] items-center gap-3';
  const n = Math.max(1, Math.min(50, Math.round(Number(count)) || 0));

  return (
    <div className="space-y-4">
      {/* Make new ones */}
      <Card padded={false} className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-krypt-purple" />
          <span className="text-sm font-medium text-white">Make new Chrome profiles</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2 text-xs text-white/75">
            How many
            <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 2))} className="input w-16 py-1.5 text-center text-sm" inputMode="numeric" />
          </label>
          <label className="flex items-center gap-2 text-xs text-white/75">
            Named
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} maxLength={30} className="input w-40 py-1.5 text-sm" placeholder="Marketo" />
            <span className="text-white/40">1, 2, 3…</span>
          </label>
          <label className="flex items-center gap-2" title="Each new Chrome profile also gets its own Marketo profile: a separate set of accounts with its own proxy">
            <Toggle on={alsoProfiles} onChange={setAlsoProfiles} />
            <span className="text-xs text-white/75">A Marketo profile for each</span>
          </label>
          <PrimaryButton disabled={busy || !Number(count)} onClick={() => void make()}>
            <Chrome className="h-4 w-4" /> {busy ? 'Working…' : `Make ${n}`}
          </PrimaryButton>
        </div>
        <p className="text-[11px] leading-relaxed text-krypt-muted">
          A Chrome window opens once for each new profile (that is how Chrome adds it to its list). Chrome does not let an app add an extension for you, so in each new profile: open <span className="font-mono">chrome://extensions</span>, turn on Developer
          mode, press Load unpacked and pick the extension folder.
          {chrome?.extensionDir ? (
            <button onClick={() => void window.marketo.app.copyText(chrome.extensionDir!).then(() => toast('ok', 'Folder path copied. Paste it into the Load unpacked window.'))} className="ml-1 inline-flex items-center gap-1 font-semibold text-krypt-purple hover:underline">
              <Copy className="h-3 w-3" /> Copy the folder path
            </button>
          ) : null}
        </p>
      </Card>

      {/* Chrome's profiles, and a Marketo profile for each */}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/5 px-4 py-2.5">
          <span className="text-xs text-krypt-muted">
            {rows ? `${rows.length} Chrome profile${rows.length === 1 ? '' : 's'} on this computer` : 'Reading Chrome…'}
            {free.length ? ` · ${free.length} not used here yet` : ''}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2" title="Start each new profile with this profile's settings and saved voices">
              <Toggle on={copy} onChange={setCopy} />
              <span className="text-xs text-white/75">Settings + voices</span>
            </label>
            <label className="flex items-center gap-2" title="Start each with this profile's Training and knowledge: brand, learnings, playbook notes, references, own styles">
              <Toggle on={copyKnowledge} onChange={setCopyKnowledge} />
              <span className="text-xs text-white/75">Training + knowledge</span>
            </label>
            <label className="flex items-center gap-2" title="Scheduled autopilot runs work on the new profiles (they do nothing until an account is added)">
              <Toggle on={auto} onChange={setAuto} />
              <span className="text-xs text-white/75">Autopilot</span>
            </label>
            <label className="flex items-center gap-2" title="Reads which platforms each picked Chrome profile is signed in to and adds them as its profile's account. Off: you add the account yourself in each profile.">
              <Toggle on={addAccts} onChange={setAddAccts} />
              <span className="text-xs text-white/75">Add their accounts</span>
            </label>
            <label className="flex items-center gap-2" title="On: the accounts are new and start a warm-up today. Off: accounts you have used for a while, no warm-up.">
              <Toggle on={fresh} onChange={setFresh} />
              <span className="text-xs text-white/75">New accounts (warm up)</span>
            </label>
            {spare > 0 && (
              <label className="flex items-center gap-2" title="Each new profile takes a proxy from your list (Proxies tab) before any of its pages load">
                <Toggle on={useProxy} onChange={setUseProxy} />
                <span className="text-xs text-white/75">Proxy from the list ({spare})</span>
              </label>
            )}
            {waiting.length > 1 && (
              <GhostButton small disabled={busy} onClick={() => void addFor(waiting)}>
                <UserPlus className="h-3.5 w-3.5" /> Add accounts ({waiting.length})
              </GhostButton>
            )}
            <GhostButton small disabled={busy || !free.length} onClick={() => setPicked(sel.length === free.length ? new Set() : new Set(free.map((r) => r.dir)))}>
              {sel.length === free.length && free.length ? 'Pick none' : `Pick all ${free.length || ''}`.trim()}
            </GhostButton>
            <PrimaryButton disabled={busy || !sel.length} onClick={() => void importPicked()}>
              <Layers className="h-4 w-4" /> {sel.length ? `Make ${sel.length} profile${sel.length === 1 ? '' : 's'}` : 'Make profiles'}
            </PrimaryButton>
          </span>
        </div>
        <div className={cls(COLS, 'px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-krypt-muted')}>
          <span />
          <span>Chrome profile</span>
          <span>Extension</span>
          <span>Used by</span>
          <span />
        </div>
        <div className="divide-y divide-white/5">
          {(rows ?? []).map((r) => {
            const taken = !!r.profile || r.accounts.length > 0;
            return (
              <div key={r.dir} className={cls(COLS, 'px-4 py-2 text-xs')}>
                <input type="checkbox" disabled={taken || busy} checked={!taken && picked.has(r.dir)} onChange={() => flip(r.dir)} className="h-3.5 w-3.5 accent-krypt-purple disabled:opacity-30" title={taken ? 'Already used here' : 'Make a Marketo profile for it'} />
                <span className="min-w-0 truncate">
                  <span className="text-sm text-white/90">{r.name}</span>
                  {r.email ? <span className="text-white/40"> · {r.email}</span> : null}
                </span>
                <span className="min-w-0 truncate">
                  {r.connected ? (
                    <span className="flex items-center gap-1.5 text-emerald-300">
                      <CircleCheck className="h-3.5 w-3.5 shrink-0" /> Open and connected
                    </span>
                  ) : r.hasExtension ? (
                    <span className="text-white/60">Added, Chrome profile closed</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-amber-300">
                      <CircleAlert className="h-3.5 w-3.5 shrink-0" /> Not added yet
                    </span>
                  )}
                </span>
                <span className="min-w-0 truncate text-white/75">
                  {r.profile ? `Profile "${r.profile.name}"` : ''}
                  {r.profile && r.accounts.length ? ' · ' : ''}
                  {r.accounts.join(', ')}
                  {!taken && <span className="text-white/35">Nothing yet</span>}
                  {r.profile && r.empty && !notes[r.dir] ? <span className="text-white/40"> · no account yet</span> : null}
                  {notes[r.dir] ? (
                    <span className={cls('block truncate text-[11px]', notes[r.dir].ok ? 'text-emerald-300/90' : 'text-amber-300')} title={notes[r.dir].text}>
                      {notes[r.dir].text}
                    </span>
                  ) : null}
                </span>
                <span className="flex justify-end gap-1.5">
                  {r.profile && r.empty ? (
                    <GhostButton small disabled={busy} onClick={() => void addFor([r])}>
                      <UserPlus className="h-3.5 w-3.5" /> Add account
                    </GhostButton>
                  ) : null}
                  <GhostButton small onClick={() => void open(r.dir)}>
                    <ExternalLink className="h-3.5 w-3.5" /> Open
                  </GhostButton>
                </span>
              </div>
            );
          })}
          {rows && !rows.length && <p className="px-4 py-4 text-xs text-krypt-muted">Google Chrome's profiles were not found on this computer. Open Chrome once, then come back.</p>}
        </div>
      </Card>
      <p className="text-[11px] leading-relaxed text-krypt-muted">
        Making a profile for a Chrome profile adds a line on the Profiles tab with that Chrome profile's name: a separate set of accounts that starts out in that Chrome profile. With Add their accounts on, Marketo opens each picked Chrome profile, reads which
        platforms it is signed in to and adds them as that profile's account (a Facebook Page and extra YouTube channels are picked on the Accounts page). Those pages load through the profile's own proxy, so if the accounts need one, add your list on
        the Proxies tab first and each new profile takes one before anything opens; without a proxy they load from your own IP. Chrome profiles that already have a profile or an account here can't be picked again.
      </p>
    </div>
  );
}
