import { useState } from 'react';
import { CircleAlert, CircleCheck, Globe, RefreshCw } from 'lucide-react';
import type { ProxyRow, ProxyScheme, ProxyState } from '@shared/types';
import { GhostButton, PrimaryButton, Toggle } from './ui';
import { useApp } from '../state/store';

// Every profile's proxy in one list (Main too): every page a profile's accounts load (Marketo's own windows and the
// Chrome profiles they run in) goes out through its proxy, and only from its sticky IP. Off by default.

const ago = (iso?: string): string => {
  if (!iso) return '';
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** One line saying where a profile's pages go out from. */
export function Status({ st }: { st: ProxyState }) {
  const p = st.settings;
  if (!p?.on) return <span className="text-white/45">Direct (no proxy)</span>;
  if (p.error)
    return (
      <span className="flex items-center gap-1.5 text-red-300">
        <CircleAlert className="h-3.5 w-3.5 shrink-0" /> Not working: pages stay closed
      </span>
    );
  if (st.ipChanged)
    return (
      <span className="flex items-center gap-1.5 text-amber-300">
        <CircleAlert className="h-3.5 w-3.5 shrink-0" /> IP changed to {p.seenIp}
      </span>
    );
  if (p.ip)
    return (
      <span className="flex items-center gap-1.5 text-emerald-300">
        <CircleCheck className="h-3.5 w-3.5 shrink-0" /> {p.ip}
        {p.country ? ` (${p.country})` : ''}
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 text-white/60">
      <Globe className="h-3.5 w-3.5 shrink-0" /> {p.host}:{p.port}, not checked yet
    </span>
  );
}

export function ProxyForm({ row, onSaved }: { row: ProxyRow; onSaved: (st: ProxyState) => void }) {
  const toast = useApp((s) => s.toast);
  const st = row.state;
  const p = st.settings;
  const [on, setOn] = useState(!!p?.on);
  const [scheme, setScheme] = useState<ProxyScheme>(p?.scheme ?? 'http');
  const [host, setHost] = useState(p?.host ?? '');
  const [port, setPort] = useState(p?.port ? String(p.port) : '');
  const [username, setUsername] = useState(p?.username ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (nextOn: boolean): Promise<boolean> => {
    setBusy(true);
    try {
      const r = await window.marketo.proxy.save(row.id, { on: nextOn, scheme, host, port: Number(port), username, ...(password ? { password } : {}) });
      if (!r.ok || !r.data) {
        toast('error', r.message ?? 'Could not save the proxy.');
        return false;
      }
      setPassword('');
      onSaved(r.data);
      if (!nextOn) toast('ok', `Proxy off: "${row.name}" goes out directly again.`);
      return true;
    } finally {
      setBusy(false);
    }
  };
  const check = async (): Promise<void> => {
    setBusy(true);
    try {
      const r = await window.marketo.proxy.check(row.id);
      if (!r.ok || !r.data) return toast('error', r.message ?? 'The check failed.');
      onSaved(r.data);
      const s = r.data.settings;
      if (s?.error) toast('error', `"${row.name}" proxy not working: ${s.error}`);
      else if (r.data.ipChanged) toast('error', `"${row.name}" exit IP changed to ${s?.seenIp}.`);
      else toast('ok', `"${row.name}" goes out from ${s?.seenIp}${s?.country ? ` (${s.country})` : ''}.`);
    } finally {
      setBusy(false);
    }
  };
  const accept = async (): Promise<void> => {
    const r = await window.marketo.proxy.acceptIp(row.id);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not keep the new IP.');
    onSaved(r.data);
    toast('ok', `"${row.name}" sticky IP is now ${r.data.settings?.ip}.`);
  };
  const socksWithPass = scheme === 'socks5' && (!!username || !!password || !!p?.hasPassword);

  return (
    <div className="space-y-3 px-4 pb-4">
      <label className="flex items-center gap-3">
        <Toggle
          on={on}
          onChange={(v) => {
            setOn(v);
            if (!v && p?.on) void save(false);
          }}
        />
        <span className="text-sm text-white/80">Use a proxy for "{row.name}"</span>
      </label>
      {on && (
        <>
          <div className="grid grid-cols-[100px_1fr_80px] gap-2">
            <select value={scheme} onChange={(e) => setScheme(e.target.value as ProxyScheme)} className="input py-1.5 text-xs" title="The proxy type your provider gives">
              <option value="http" className="bg-krypt-panel">HTTP</option>
              <option value="https" className="bg-krypt-panel">HTTPS</option>
              <option value="socks5" className="bg-krypt-panel">SOCKS5</option>
            </select>
            <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="Host (gate.provider.com)" className="input py-1.5 text-xs" spellCheck={false} />
            <input value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="Port" className="input py-1.5 text-xs" inputMode="numeric" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="User name (optional)" className="input py-1.5 text-xs" spellCheck={false} autoComplete="off" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={p?.hasPassword ? 'Password saved (type to change)' : 'Password (optional)'}
              type="password"
              className="input py-1.5 text-xs"
              autoComplete="new-password"
            />
          </div>
          {socksWithPass && <p className="text-[11px] text-amber-300/90">Chrome can't send a password to a SOCKS5 proxy. Use your provider's HTTP endpoint instead (most give both).</p>}
          <div className="flex flex-wrap items-center gap-2">
            <PrimaryButton onClick={() => void (async () => (await save(true)) && (await check()))()} disabled={busy || !host || !port || socksWithPass}>
              {busy ? 'Working…' : 'Save and check'}
            </PrimaryButton>
            {p?.on && (
              <GhostButton small onClick={() => void check()} disabled={busy}>
                <RefreshCw className="h-3.5 w-3.5" /> Check again
              </GhostButton>
            )}
          </div>
        </>
      )}
      {p?.on && (p.error || st.ipChanged || p.ip) && (
        <div className="space-y-1 text-[11px]">
          {p.error ? (
            <p className="text-red-300">Not working: {p.error}. Pages stay closed for this profile until it works (nothing goes out from your own IP).</p>
          ) : st.ipChanged ? (
            <div className="flex flex-wrap items-center gap-2 text-amber-300">
              <span className="min-w-0 flex-1">
                The exit IP changed from {p.ip} to {p.seenIp}. Pages stay closed until you decide.
              </span>
              <GhostButton small onClick={() => void accept()}>
                Keep {p.seenIp}
              </GhostButton>
            </div>
          ) : (
            <p className="text-krypt-muted">
              Sticky IP {p.ip}
              {p.city || p.country ? ` (${[p.city, p.country].filter(Boolean).join(', ')})` : ''}
              {p.checkedAt ? `, checked ${ago(p.checkedAt)}` : ''}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
