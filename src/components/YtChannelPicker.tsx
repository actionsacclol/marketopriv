import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, RefreshCw, Youtube } from 'lucide-react';
import type { YtChannelOption } from '@shared/types';
import { useApp } from '../state/store';
import { cls } from '../lib/format';
import { GhostButton, PrimaryButton } from './ui';

/**
 * A dropdown of every YouTube channel the Google sign-in in this account's Chrome profile owns (read from YouTube's
 * channel switcher there). Ticked channels are added: the first one becomes this account's channel when it has none
 * yet, and each other one becomes its own YouTube-only account in the same Chrome profile.
 */
export function YtChannelPicker({ accountId, initial, className }: { accountId: string; initial?: YtChannelOption[]; className?: string }) {
  const db = useApp((s) => s.db)!;
  const toast = useApp((s) => s.toast);
  const acct = db.igAccounts.find((x) => x.id === accountId);
  const [open, setOpen] = useState(false);
  /** Already read (the wizard's Chrome profile check): shown without opening YouTube again. */
  const [list, setList] = useState<YtChannelOption[] | null>(initial?.length ? initial : null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError('');
    const r = await window.marketo.browser.ytChannels(accountId);
    setLoading(false);
    if (!r.ok || !r.data) {
      const m = r.message ?? 'Could not read your channels.';
      return setError(/not connected/i.test(m) ? 'Chrome is not connected yet. Open the Chrome profile you picked on the Accounts step (with the Marketo extension added), then try again.' : m);
    }
    setList(r.data);
    setPicked(new Set());
  };
  const toggleOpen = (): void => {
    const next = !open;
    setOpen(next);
    if (next && !list && !loading) void load();
  };

  const addable = (c: YtChannelOption): boolean => !!c.handle && !c.owner;
  const needsMain = !acct?.youtube?.channelId;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (list ?? []).filter((c) => !q || c.name.toLowerCase().includes(q) || (c.handle ?? '').toLowerCase().includes(q));
  }, [list, query]);
  const choosable = shown.filter(addable);
  const allOn = choosable.length > 0 && choosable.every((c) => picked.has(c.handle!));
  /** In list order: the first ticked channel goes to this account when it has none. */
  const ticked = (list ?? []).filter((c) => addable(c) && picked.has(c.handle!));
  const mainPick = needsMain ? ticked[0] : undefined;

  const flip = (h: string): void =>
    setPicked((v) => {
      const n = new Set(v);
      if (n.has(h)) n.delete(h);
      else n.add(h);
      return n;
    });
  const flipAll = (): void =>
    setPicked((v) => {
      const n = new Set(v);
      for (const c of choosable) allOn ? n.delete(c.handle!) : n.add(c.handle!);
      return n;
    });

  const add = async (): Promise<void> => {
    if (!acct || !ticked.length) return;
    setBusy(true);
    const failed: string[] = [];
    let added = 0;
    for (const c of ticked) {
      if (c === mainPick) {
        const r = await window.marketo.app.resolveYtChannel(`@${c.handle}`);
        const fresh = useApp.getState().db?.igAccounts.find((x) => x.id === accountId) ?? acct;
        const s = r.ok && r.data
          ? await window.marketo.db.saveAccount({ id: accountId, youtube: { ...(fresh.youtube ?? { enabled: false }), channelId: r.data.id, channelName: r.data.name ?? c.name, channelHandle: r.data.handle ?? c.handle } })
          : r;
        if (s.ok) added++;
        else failed.push(`${c.name}: ${s.message ?? 'could not be read'}`);
        continue;
      }
      const r = await window.marketo.db.addYtChannel(accountId, `@${c.handle}`);
      if (r.ok) added++;
      else failed.push(`${c.name}: ${r.message ?? 'could not be added'}`);
    }
    setBusy(false);
    if (added) toast('ok', `Added ${added} channel${added === 1 ? '' : 's'}. Each runs as its own account in this Chrome profile; the hub switches YouTube Studio before every upload.`);
    if (failed.length) toast('error', failed.join(' · '));
    void load();
  };

  const label = !list ? 'Choose channels' : ticked.length ? `${ticked.length} picked` : `${list.length} channel${list.length === 1 ? '' : 's'} in this profile`;

  return (
    <div ref={box} className={cls('relative', className)}>
      <button
        onClick={toggleOpen}
        className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-left text-sm text-white transition hover:border-krypt-purple/50"
      >
        <Youtube className="h-4 w-4 shrink-0 text-krypt-muted" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className={cls('h-4 w-4 shrink-0 text-krypt-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 min-w-[300px] overflow-hidden rounded-xl border border-white/10 bg-krypt-panel shadow-2xl">
          {loading ? (
            <p className="p-4 text-sm text-krypt-muted">Reading your channels from YouTube in this Chrome profile…</p>
          ) : error ? (
            <div className="space-y-2 p-4">
              <p className="text-sm text-amber-300">{error}</p>
              <GhostButton small onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </GhostButton>
            </div>
          ) : list ? (
            <>
              <div className="space-y-2 border-b border-white/5 p-3">
                {list.length > 6 && <input className="input py-1.5 text-sm" placeholder="Search your channels" value={query} onChange={(e) => setQuery(e.target.value)} />}
                <div className="flex items-center gap-2">
                  <button onClick={flipAll} disabled={!choosable.length} className="flex items-center gap-2 text-xs text-white/80 hover:text-white disabled:opacity-40">
                    <Box on={allOn} /> Select all
                  </button>
                  <span className="flex-1" />
                  <button onClick={() => void load()} title="Read the list again" className="text-krypt-muted hover:text-white">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              <ul className="max-h-64 overflow-auto py-1">
                {shown.map((c) => {
                  const can = addable(c);
                  const on = can && picked.has(c.handle!);
                  const tag = c.owner
                    ? c.owner.id === accountId
                      ? 'this account'
                      : `added as ${c.owner.handle}`
                    : !c.handle
                      ? 'no @handle: paste its link instead'
                      : on
                        ? c === mainPick
                          ? `for ${acct?.handle ?? 'this account'}`
                          : 'new account'
                        : '';
                  return (
                    <li key={`${c.name}|${c.handle ?? ''}`}>
                      <button
                        onClick={() => can && flip(c.handle!)}
                        disabled={!can}
                        className={cls('flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition', can ? 'hover:bg-white/[0.04]' : 'cursor-default opacity-60')}
                      >
                        <Box on={on || !!c.owner} />
                        {c.photo ? <img src={c.photo} alt="" className="h-6 w-6 shrink-0 rounded-full" /> : <span className="h-6 w-6 shrink-0 rounded-full bg-white/10" />}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-white">{c.name}</span>
                          {c.handle && <span className="block truncate font-mono text-[11px] text-krypt-muted">@{c.handle}</span>}
                        </span>
                        {tag && <span className="shrink-0 text-[11px] text-krypt-muted">{tag}</span>}
                      </button>
                    </li>
                  );
                })}
                {!shown.length && <li className="px-3 py-2 text-sm text-krypt-muted">No channel matches.</li>}
              </ul>
              <div className="flex items-center gap-2 border-t border-white/5 p-3">
                <p className="min-w-0 flex-1 text-[11px] leading-snug text-krypt-muted">
                  {needsMain ? `The first one you tick becomes ${acct?.handle ?? 'this account'}'s channel; each other one gets its own account.` : 'Each one gets its own account, with its own limits and instructions.'}
                </p>
                <PrimaryButton disabled={busy || !ticked.length} onClick={() => void add()}>
                  {busy ? 'Adding…' : `Add ${ticked.length || ''}`.trim()}
                </PrimaryButton>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Box({ on }: { on: boolean }) {
  return (
    <span className={cls('flex h-4 w-4 shrink-0 items-center justify-center rounded border', on ? 'border-krypt-purple bg-krypt-purple' : 'border-white/25')}>
      {on && <Check className="h-3 w-3 text-white" />}
    </span>
  );
}
