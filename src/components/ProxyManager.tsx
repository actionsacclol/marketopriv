import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleCheck, ListPlus, RefreshCw, Trash2, Undo2, Wand2 } from 'lucide-react';
import type { ProxyPoolItem, ProxyRow } from '@shared/types';
import { Status } from './ProxySection';
import { Card, GhostButton, PrimaryButton } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Multi run > Proxies: paste a whole list of proxies, check which ones work and where they go out, and hand them to
// profiles (one click gives every profile without a proxy the next good one). A proxy taken off a profile comes
// back to the list. Passwords stay in the hub, encrypted; this window only learns that one is saved.

const EXAMPLE = 'One proxy a line, the way your provider lists them:\n\n203.0.113.7:8000:user:pass\nuser:pass@gate.provider.com:7000\nhttp://203.0.113.9:3128';

/** Run jobs a few at a time (a dead proxy takes up to 20 seconds to give up). */
async function pooled<T>(list: T[], n: number, job: (x: T) => Promise<void>): Promise<void> {
  const todo = [...list];
  await Promise.all(Array.from({ length: Math.min(n, todo.length) }, async () => {
    for (let x = todo.shift(); x !== undefined; x = todo.shift()) await job(x).catch(() => {});
  }));
}

function PoolStatus({ it, busy }: { it: ProxyPoolItem; busy: boolean }) {
  if (busy) return <span className="text-white/60">Checking…</span>;
  if (it.error)
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-red-300" title={it.error}>
        <CircleAlert className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">Not working: {it.error}</span>
      </span>
    );
  if (it.ip)
    return (
      <span className="flex min-w-0 items-center gap-1.5 text-emerald-300">
        <CircleCheck className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">
          {it.ip}
          {it.city || it.country ? ` (${[it.city, it.country].filter(Boolean).join(', ')})` : ''}
          {it.ms ? ` · ${(it.ms / 1000).toFixed(1)}s` : ''}
        </span>
      </span>
    );
  return <span className="text-white/45">Not checked yet</span>;
}

export function ProxyManager({ perChrome }: { perChrome: boolean }) {
  const toast = useApp((s) => s.toast);
  const [pool, setPool] = useState<ProxyPoolItem[]>([]);
  const [rows, setRows] = useState<ProxyRow[]>([]);
  const [text, setText] = useState('');
  const [left, setLeft] = useState<Array<{ line: number; why: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<Set<string>>(new Set());
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const load = async (): Promise<void> => {
    const [p, r, c] = await Promise.all([window.marketo.proxy.pool(), window.marketo.proxy.list(), perChrome ? window.marketo.proxy.chromeRows() : Promise.resolve([] as ProxyRow[])]);
    if (!alive.current) return;
    setPool(p);
    setRows([...r, ...c]);
  };
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perChrome]);

  const mark = (id: string, on: boolean): void =>
    setChecking((s) => {
      const n = new Set(s);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const checkPool = async (id: string): Promise<void> => {
    mark(id, true);
    const r = await window.marketo.proxy.poolCheck(id);
    mark(id, false);
    if (r.ok && r.data && alive.current) setPool(r.data);
  };
  const checkOwner = async (id: string): Promise<void> => {
    mark(id, true);
    const r = await window.marketo.proxy.check(id);
    mark(id, false);
    if (r.ok && r.data && alive.current) setRows((all) => all.map((x) => (x.id === id ? { ...x, state: r.data! } : x)));
  };

  const add = async (): Promise<void> => {
    if (!text.trim()) return;
    setBusy(true);
    const r = await window.marketo.proxy.poolImport(text);
    setBusy(false);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not read that list.');
    setPool(r.data.items);
    setLeft(r.data.skipped);
    if (r.data.added) setText('');
    toast(r.data.added ? 'ok' : 'warn', `${r.data.added} prox${r.data.added === 1 ? 'y' : 'ies'} added${r.data.skipped.length ? `, ${r.data.skipped.length} left out (see under the box)` : ''}.${r.data.added ? ' Press Check all to see which work.' : ''}`);
  };

  const used = rows.filter((r) => r.state.settings?.on);
  const free = rows.filter((r) => !r.state.settings?.on);
  const checkAll = async (): Promise<void> => {
    setBusy(true);
    await pooled([...pool.map((p) => ({ pool: true, id: p.id })), ...used.map((r) => ({ pool: false, id: r.id }))], 4, (x) => (x.pool ? checkPool(x.id) : checkOwner(x.id)));
    setBusy(false);
    await load();
  };
  const assign = async (id: string, owner: string): Promise<void> => {
    if (!owner) return;
    setBusy(true);
    const r = await window.marketo.proxy.poolAssign(id, owner);
    if (!r.ok || !r.data) {
      setBusy(false);
      return toast('error', r.message ?? 'Could not give it to that profile.');
    }
    setPool(r.data);
    await load();
    // The first good check is what sets the profile's sticky IP.
    await checkOwner(owner);
    setBusy(false);
  };
  const auto = async (): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.proxy.poolAuto();
    if (!r.ok || !r.data) {
      setBusy(false);
      return toast('error', r.message ?? 'Could not hand them out.');
    }
    setPool(r.data.items);
    await load();
    const given = r.data.given;
    if (!given.length) {
      setBusy(false);
      return toast('warn', free.length ? 'No proxy in the list to hand out (ones whose check failed are never used).' : 'Every profile already has a proxy.');
    }
    await pooled(given, 4, (g) => checkOwner(g.id));
    setBusy(false);
    toast('ok', `${given.length} profile${given.length === 1 ? '' : 's'} got a proxy: ${given.slice(0, 4).map((g) => g.profile).join(', ')}${given.length > 4 ? '…' : ''}. Each was checked; look for red lines below.`);
  };
  const release = async (owner: string, name: string): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.proxy.poolRelease(owner);
    setBusy(false);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not take it back.');
    setPool(r.data);
    await load();
    toast('ok', `"${name}" goes out directly again. Its proxy is back in the list.`);
  };
  const remove = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const r = await window.marketo.proxy.poolRemove(ids);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not remove.');
    setPool(r.data);
  };
  const failed = pool.filter((p) => p.error);
  const needy = rows.filter((r) => !r.id.includes('::') && !r.state.settings?.on).length;
  const COLS = 'grid grid-cols-[minmax(0,1.3fr)_minmax(0,1.4fr)_minmax(0,1fr)_76px] items-center gap-3';

  return (
    <div className="space-y-4">
      <Card padded={false} className="space-y-2 px-4 py-3">
        <div className="flex items-center gap-2">
          <ListPlus className="h-4 w-4 text-krypt-purple" />
          <span className="text-sm font-medium text-white">Add proxies in bulk</span>
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={EXAMPLE} rows={5} spellCheck={false} className="input w-full resize-y font-mono text-xs leading-relaxed" />
        <div className="flex flex-wrap items-center gap-3">
          <PrimaryButton disabled={busy || !text.trim()} onClick={() => void add()}>
            Add to the list
          </PrimaryButton>
          <span className="text-[11px] text-krypt-muted">HTTP unless a line starts with https:// or socks5://. Passwords are kept encrypted on this computer.</span>
        </div>
        {left.length > 0 && (
          <div className="rounded-lg border border-amber-400/20 bg-amber-400/[0.05] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
            Left out:
            {left.slice(0, 8).map((s, i) => (
              <div key={i}>
                {s.line ? `Line ${s.line}: ` : ''}
                {s.why}
              </div>
            ))}
            {left.length > 8 && <div>…and {left.length - 8} more.</div>}
          </div>
        )}
      </Card>

      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-2 border-b border-white/5 px-4 py-2.5">
          <span className="text-xs text-krypt-muted">
            {pool.length} in the list · {used.length} in use
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <GhostButton small disabled={busy || (!pool.length && !used.length)} onClick={() => void checkAll()}>
              <RefreshCw className={cls('h-3.5 w-3.5', checking.size > 0 && 'animate-spin')} /> Check all
            </GhostButton>
            <GhostButton small disabled={busy || !pool.length || !needy} onClick={() => void auto()}>
              <Wand2 className="h-3.5 w-3.5" /> Give one to each profile without a proxy{needy ? ` (${needy})` : ''}
            </GhostButton>
            {failed.length > 0 && (
              <GhostButton small destructive disabled={busy} onClick={() => void remove(failed.map((f) => f.id))}>
                <Trash2 className="h-3.5 w-3.5" /> Remove {failed.length} not working
              </GhostButton>
            )}
          </span>
        </div>
        <div className={cls(COLS, 'px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-krypt-muted')}>
          <span>Proxy</span>
          <span>Check</span>
          <span>Used by</span>
          <span />
        </div>
        <div className="divide-y divide-white/5">
          {used.map((r) => {
            const s = r.state.settings!;
            return (
              <div key={r.id} className={cls(COLS, 'px-4 py-2 text-xs')}>
                <span className="min-w-0 truncate font-mono text-white/85" title={`${s.scheme}://${s.host}:${s.port}`}>
                  {s.host}:{s.port}
                  {s.username ? <span className="text-white/40"> · {s.username}</span> : null}
                </span>
                <span className="min-w-0 truncate">{checking.has(r.id) ? <span className="text-white/60">Checking…</span> : <Status st={r.state} />}</span>
                <span className="min-w-0 truncate text-white/85">{r.name}</span>
                <span className="flex items-center justify-end gap-0.5">
                  <button title="Check now" disabled={checking.has(r.id)} onClick={() => void checkOwner(r.id)} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-white/[0.06] hover:text-white">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button title={`Take it off "${r.name}" and back into the list`} disabled={busy} onClick={() => void release(r.id, r.name)} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-white/[0.06] hover:text-white">
                    <Undo2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </div>
            );
          })}
          {pool.map((it) => (
            <div key={it.id} className={cls(COLS, 'px-4 py-2 text-xs')}>
              <span className="min-w-0 truncate font-mono text-white/85" title={`${it.scheme}://${it.host}:${it.port}`}>
                {it.scheme !== 'http' ? <span className="text-white/40">{it.scheme} </span> : null}
                {it.host}:{it.port}
                {it.username ? <span className="text-white/40"> · {it.username}</span> : null}
              </span>
              <span className="min-w-0 truncate">
                <PoolStatus it={it} busy={checking.has(it.id)} />
              </span>
              <select value="" disabled={busy} onChange={(e) => void assign(it.id, e.target.value)} className="input min-w-0 py-1 text-xs" title="Give this proxy to a profile">
                <option value="" className="bg-krypt-panel">
                  Give to…
                </option>
                {rows.map((r) => (
                  <option key={r.id} value={r.id} className="bg-krypt-panel">
                    {r.name}
                    {r.state.settings?.on ? ' (swaps with its own)' : ''}
                  </option>
                ))}
              </select>
              <span className="flex items-center justify-end gap-0.5">
                <button title="Check now" disabled={checking.has(it.id)} onClick={() => void checkPool(it.id)} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-white/[0.06] hover:text-white">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button title="Remove from the list" onClick={() => void remove([it.id])} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-rose-500/10 hover:text-rose-300">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            </div>
          ))}
          {!pool.length && !used.length && <p className="px-4 py-4 text-xs text-krypt-muted">No proxies yet. Paste a list above.</p>}
        </div>
      </Card>
      <p className="text-[11px] leading-relaxed text-krypt-muted">
        A check loads one small page through the proxy and shows where it goes out and how long that took. A profile's first good check sets its sticky IP: its pages only ever open from that one. One static residential IP per profile; a proxy whose check
        failed is never handed out.
      </p>
    </div>
  );
}
