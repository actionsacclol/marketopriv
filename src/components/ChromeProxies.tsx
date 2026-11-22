import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Globe } from 'lucide-react';
import type { ProxyRow } from '@shared/types';
import { Card } from './ui';
import { ProxyForm } from './ProxySection';
import { cls } from '../lib/format';
import { useApp } from '../state/store';

/**
 * Multi run page, with "a proxy for each Chrome profile" on (Setup > Performance): every Chrome profile the open
 * profile's accounts run in, each with its own proxy and sticky IP. One Marketo profile can then hold many accounts
 * on many IPs. A Chrome profile with no proxy of its own takes the Marketo profile's (or none).
 */
export function ChromeProxies() {
  const [rows, setRows] = useState<ProxyRow[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const accounts = useApp((s) => s.db?.igAccounts);
  useEffect(() => {
    void window.marketo.proxy.chromeRows().then(setRows).catch(() => setRows([]));
  }, [accounts]);
  if (!rows) return null;
  return (
    <Card padded={false} className="mb-5">
      <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
        <Globe className="h-4 w-4 text-krypt-purple" />
        <span className="text-sm font-medium text-white">Chrome profile proxies</span>
        <span className="text-[11px] text-krypt-muted">this profile's accounts, by the Chrome profile they run in</span>
      </div>
      {!rows.length ? (
        <p className="px-4 py-3 text-xs text-krypt-muted">No account here has a Chrome profile picked yet (Accounts page, or Setup &gt; Chrome profile).</p>
      ) : (
        <div className="divide-y divide-white/5">
          {rows.map((r) => {
            const s = r.state.settings;
            const on = !!s?.on;
            const shown = open === r.id;
            return (
              <div key={r.id}>
                <button onClick={() => setOpen(shown ? null : r.id)} className={cls('flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs transition hover:bg-white/[0.03]', shown && 'bg-white/[0.04]')}>
                  <span className="w-40 shrink-0 truncate text-sm text-white">{r.name.replace(/^Chrome profile /, '')}</span>
                  <span className="min-w-0 flex-1 truncate text-krypt-muted">{(r.accounts ?? []).join(', ')}</span>
                  <span className={cls('shrink-0', on ? (s?.error || r.state.ipChanged ? 'text-amber-300' : 'text-emerald-300') : 'text-krypt-muted')}>
                    {on ? (s?.error ? 'not working' : r.state.ipChanged ? 'IP changed' : s?.ip ? `on, ${s.ip}${s.country ? ` (${s.country})` : ''}` : 'on, not checked') : "the profile's proxy"}
                  </span>
                  {shown ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-white/50" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/50" />}
                </button>
                {shown && (
                  <div className="border-t border-white/5 bg-white/[0.015] pt-3">
                    <ProxyForm row={r} onSaved={(st) => setRows((all) => (all ?? []).map((x) => (x.id === r.id ? { ...x, state: st } : x)))} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="border-t border-white/5 px-4 py-2.5 text-[11px] leading-relaxed text-krypt-muted">
        Every account in a Chrome profile goes out through that Chrome profile's proxy, from one fixed IP; if it dies or the IP changes, its pages stay closed instead of using your own IP. A Chrome profile with no proxy here uses
        this Marketo profile's proxy. One static residential IP per Chrome profile.
      </p>
    </Card>
  );
}
