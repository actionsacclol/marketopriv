import { useEffect, useState } from 'react';
import { SOFT_PROFILES } from '@shared/perf';
import { AppWindow, Check, ChevronDown, ChevronUp, Layers, Pencil, Play, Plus, RotateCw, Square, Trash2, X } from 'lucide-react';
import type { ProfilesResult, ProxyRow, ProxyScheme } from '@shared/types';
import { ProxyForm, Status } from './ProxySection';
import { Card, GhostButton, PrimaryButton, Toggle } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Profiles: complete, separate sets of everything the hub keeps (accounts and
// their socials, brand, reels, post log, Training, learnings, notes, settings).
// One is open at a time; opening another reloads the window on it.

/** Run a profile call, keep the list current and say what went wrong. */
async function run(call: Promise<ProfilesResult>): Promise<boolean> {
  const { toast } = useApp.getState();
  try {
    const r = await call;
    if (r.data) useApp.setState({ profiles: r.data });
    if (!r.ok) toast('error', r.message ?? 'That did not work.');
    return r.ok;
  } catch (e) {
    toast('error', e instanceof Error ? e.message : String(e));
    return false;
  }
}

/** Open another profile. The window reloads on it, so nothing after this runs on the old one. */
export const openProfile = (id: string): Promise<boolean> => run(window.marketo.app.useProfile(id));

/** The switcher: shown once there is more than one profile (sidebar, and the setup wizard of a new one). */
export function ProfileSelect({ className }: { className?: string }) {
  const profiles = useApp((s) => s.profiles);
  const [busy, setBusy] = useState(false);
  if (profiles.length < 2) return null;
  const open = profiles.find((p) => p.active);
  return (
    <label className={cls('flex items-center gap-2', className)} title="Profile: a separate set of accounts, brand, reels and Training">
      <Layers className="h-3.5 w-3.5 shrink-0 text-krypt-purple" />
      <select
        value={open?.id ?? ''}
        disabled={busy}
        // Other profiles start and stop on their own (multi-instance mode): fresh states when the list opens.
        onMouseDown={() => void window.marketo.app.profiles().then((list) => useApp.setState({ profiles: list }))}
        onChange={(e) => {
          setBusy(true);
          void openProfile(e.target.value).finally(() => setBusy(false));
        }}
        className="input min-w-0 flex-1 py-1.5 text-xs font-semibold"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id} className="bg-krypt-panel">
            {p.name}
            {p.running === undefined || p.active ? '' : p.running ? (p.visible === false ? '  (in background)' : '  (open)') : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Multi run page: every profile on one line (name, Autopilot, proxy, its window, rename / delete), new ones added
 * at the top. A line opens underneath for its proxy settings or to confirm a delete.
 */
export function MultiRunBoard() {
  const profiles = useApp((s) => s.profiles);
  const autopilot = useApp((s) => s.autopilot);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('');
  const [copy, setCopy] = useState(true);
  const [copyKnowledge, setCopyKnowledge] = useState(true);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [open, setOpen] = useState<{ id: string; what: 'proxy' | 'delete' } | null>(null);
  const [busy, setBusy] = useState(false);
  const many = profiles.length > 1;

  // Multi-instance mode: each profile in its own window, all at once (read at start, so a change needs a restart).
  const [multi, setMulti] = useState<{ saved: boolean; running: boolean } | null>(null);
  useEffect(() => {
    void window.marketo.app.profilesMulti().then(setMulti);
  }, []);
  const windows = !!multi?.running;

  // Every profile's proxy (any window sets any profile's; another window may change one too).
  const [proxies, setProxies] = useState<Record<string, ProxyRow>>({});
  const names = profiles.map((p) => `${p.id}:${p.name}:${p.active}`).join('|');
  const loadProxies = (): void => void window.marketo.proxy.list().then((rows) => setProxies(Object.fromEntries(rows.map((r) => [r.id, r]))));
  useEffect(loadProxies, [names]);
  // Other profiles start and stop on their own: fresh states as soon as the page opens.
  useEffect(() => {
    void window.marketo.app.profiles().then((list) => useApp.setState({ profiles: list }));
  }, []);
  useEffect(() => {
    const t = setInterval(
      () => {
        loadProxies();
        if (windows) void window.marketo.app.profiles().then((list) => useApp.setState({ profiles: list }));
      },
      windows ? 5000 : 15000,
    );
    return () => clearInterval(t);
  }, [windows]);

  const act = async (call: () => Promise<ProfilesResult>): Promise<boolean> => {
    setBusy(true);
    try {
      return await run(call());
    } finally {
      setBusy(false);
    }
  };
  // The new profile's own settings, set as it is made: Autopilot and its proxy.
  const [newAuto, setNewAuto] = useState(true);
  const [np, setNp] = useState<{ on: boolean; scheme: ProxyScheme; host: string; port: string; username: string; password: string }>({ on: false, scheme: 'http', host: '', port: '', username: '', password: '' });
  const npSocksPass = np.on && np.scheme === 'socks5' && (!!np.username || !!np.password);
  const npReady = !np.on || (!!np.host.trim() && !!np.port && !npSocksPass);
  const add = async (): Promise<void> => {
    const n = name.trim();
    if (!n) return toast('warn', 'Give the profile a name.');
    if (!npReady) return toast('warn', npSocksPass ? "Chrome can't send a password to a SOCKS5 proxy. Use your provider's HTTP endpoint." : 'Fill in the proxy host and port, or switch the proxy off.');
    const before = new Set(profiles.map((p) => p.id));
    setBusy(true);
    try {
      const r = await window.marketo.app.createProfile(n, copy, copyKnowledge);
      if (r.data) useApp.setState({ profiles: r.data });
      if (!r.ok) return toast('error', r.message ?? 'Could not add the profile.');
      const made = (r.data ?? []).find((p) => !before.has(p.id));
      if (!made) return toast('ok', `Profile "${n}" is ready.`);
      if (made.autopilot !== newAuto) await run(window.marketo.app.setProfileAutopilot(made.id, newAuto));
      let note = '';
      if (np.on) {
        const s = await window.marketo.proxy.save(made.id, { on: true, scheme: np.scheme, host: np.host.trim(), port: Number(np.port), username: np.username.trim(), ...(np.password ? { password: np.password } : {}) });
        if (!s.ok) note = ` Its proxy was not saved: ${s.message ?? 'it was refused'}. Set it on its line below.`;
        else {
          const c = await window.marketo.proxy.check(made.id);
          const st = c.data?.settings;
          note = !c.ok || st?.error ? ` Its proxy is saved but not working${st?.error ? `: ${st.error}` : ''}.` : ` Its proxy goes out from ${st?.seenIp}${st?.country ? ` (${st.country})` : ''}.`;
        }
        loadProxies();
      }
      setName('');
      setNp((x) => ({ ...x, on: false, host: '', port: '', username: '', password: '' }));
      toast(note.includes('not') ? 'warn' : 'ok', `Profile "${n}" is ready.${note} Open it to add its accounts.`);
    } finally {
      setBusy(false);
    }
  };
  const rename = async (): Promise<void> => {
    if (!editing) return;
    if (await act(() => window.marketo.app.renameProfile(editing.id, editing.name))) setEditing(null);
  };
  const flipMulti = async (on: boolean): Promise<void> => {
    if (await act(() => window.marketo.app.setProfilesMulti(on))) setMulti((m) => (m ? { ...m, saved: on } : m));
  };
  const toggle = (id: string, what: 'proxy' | 'delete'): void => setOpen((o) => (o?.id === id && o.what === what ? null : { id, what }));

  const COLS = windows ? 'grid grid-cols-[minmax(0,1fr)_72px_88px_minmax(0,1.2fr)_150px_88px] items-center gap-3' : 'grid grid-cols-[minmax(0,1fr)_80px_minmax(0,1.2fr)_150px_64px] items-center gap-3';
  const waitingBg = windows ? profiles.filter((p) => p.background && !p.running && !p.active) : [];

  return (
    <div className="space-y-4">
      {profiles.length >= SOFT_PROFILES && (
        <p className="text-xs text-amber-300">
          {profiles.length} profiles is at or over the {SOFT_PROFILES} Krypt suggests. Each profile's window and Chrome need memory of their own: see Setup &gt; Performance (Mass run, AI runs at once) before adding more. Your call.
        </p>
      )}
      {/* New profile, at the top */}
      <Card padded={false} className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <input
            className="input min-w-[180px] flex-1 py-1.5 text-sm"
            placeholder="New profile name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
          />
          <label className="flex items-center gap-2" title="Start it with this profile's settings and saved voices">
            <Toggle on={copy} onChange={setCopy} />
            <span className="text-xs text-white/75">Settings + voices</span>
          </label>
          <label className="flex items-center gap-2" title="Start it with this profile's Training and knowledge: brand, learnings, playbook notes, references, own styles">
            <Toggle on={copyKnowledge} onChange={setCopyKnowledge} />
            <span className="text-xs text-white/75">Training + knowledge</span>
          </label>
          <label className="flex items-center gap-2" title="Scheduled autopilot runs work on the new profile">
            <Toggle on={newAuto} onChange={setNewAuto} />
            <span className="text-xs text-white/75">Autopilot</span>
          </label>
          <label className="flex items-center gap-2" title="The new profile's accounts go out through a proxy, from one fixed IP">
            <Toggle on={np.on} onChange={(v) => setNp((x) => ({ ...x, on: v }))} />
            <span className="text-xs text-white/75">Proxy</span>
          </label>
          <PrimaryButton disabled={busy || !name.trim() || !npReady} onClick={() => void add()}>
            <Plus className="h-4 w-4" /> {busy ? 'Adding…' : 'Add profile'}
          </PrimaryButton>
        </div>
        {np.on && (
          <div className="mt-2 grid grid-cols-[100px_minmax(0,1.6fr)_80px_minmax(0,1fr)_minmax(0,1fr)] gap-2">
            <select value={np.scheme} onChange={(e) => setNp((x) => ({ ...x, scheme: e.target.value as ProxyScheme }))} className="input py-1.5 text-xs" title="The proxy type your provider gives">
              <option value="http" className="bg-krypt-panel">HTTP</option>
              <option value="https" className="bg-krypt-panel">HTTPS</option>
              <option value="socks5" className="bg-krypt-panel">SOCKS5</option>
            </select>
            <input value={np.host} onChange={(e) => setNp((x) => ({ ...x, host: e.target.value }))} placeholder="Host (gate.provider.com)" className="input py-1.5 text-xs" spellCheck={false} />
            <input value={np.port} onChange={(e) => setNp((x) => ({ ...x, port: e.target.value.replace(/\D/g, '').slice(0, 5) }))} placeholder="Port" className="input py-1.5 text-xs" inputMode="numeric" />
            <input value={np.username} onChange={(e) => setNp((x) => ({ ...x, username: e.target.value }))} placeholder="User name (optional)" className="input py-1.5 text-xs" spellCheck={false} autoComplete="off" />
            <input value={np.password} onChange={(e) => setNp((x) => ({ ...x, password: e.target.value }))} placeholder="Password (optional)" type="password" className="input py-1.5 text-xs" autoComplete="new-password" />
          </div>
        )}
        {npSocksPass && <p className="mt-1.5 text-[11px] text-amber-300/90">Chrome can't send a password to a SOCKS5 proxy. Use your provider's HTTP endpoint instead (most give both).</p>}
        <p className="mt-2 text-[11px] text-krypt-muted">
          Copies from the profile open in this window. Never its accounts, reels or post log: a new profile gets its own accounts.{np.on ? " The proxy is checked as soon as the profile is made; use a static residential IP (or your provider's sticky-session user name)." : ''}
        </p>
      </Card>

      {/* Every profile, one line each */}
      <Card padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-white/5 px-4 py-2.5">
          <span className="text-xs text-krypt-muted">
            {profiles.length} profile{profiles.length === 1 ? '' : 's'}
          </span>
          {multi && (
            <label
              className="ml-auto flex items-center gap-2"
              title="Every profile runs in its own Marketo window at the same time, each with its own AI connection and proxy, and the autopilot runs them all together. Off: one window, one profile at a time."
            >
              <Toggle on={multi.saved} onChange={(v) => !busy && void flipMulti(v)} />
              <span className="text-xs text-white/80">Run them all at once (each in its own window)</span>
            </label>
          )}
          {waitingBg.length > 0 && (
            <GhostButton small disabled={busy} onClick={() => void act(() => window.marketo.app.startBackground())}>
              <Play className="h-3.5 w-3.5" /> Start {waitingBg.length} in background
            </GhostButton>
          )}
          {multi && multi.saved !== multi.running && (
            <GhostButton small onClick={() => void window.marketo.app.restart()}>
              <RotateCw className="h-3.5 w-3.5" /> Restart to turn {multi.saved ? 'on' : 'off'}
            </GhostButton>
          )}
        </div>
        <div className={cls(COLS, 'px-4 pt-2.5 text-[10px] font-semibold uppercase tracking-wider text-krypt-muted')}>
          <span>Profile</span>
          <span>Autopilot</span>
          {windows && <span title="Runs with no window: started whenever Main opens, and by autopilot runs">Background</span>}
          <span>Proxy</span>
          <span>Window</span>
          <span />
        </div>
        <div className="divide-y divide-white/5">
          {profiles.map((p) => {
            const px = proxies[p.id];
            const row = open?.id === p.id ? open.what : null;
            return (
              <div key={p.id}>
                <div className={cls(COLS, 'px-4 py-2.5')}>
                  {/* Profile */}
                  {editing?.id === p.id ? (
                    <div className="flex min-w-0 items-center gap-1.5">
                      <input
                        autoFocus
                        className="input min-w-0 flex-1 py-1 text-sm"
                        value={editing.name}
                        maxLength={40}
                        onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                      <button title="Save" disabled={busy} onClick={() => void rename()} className="rounded-lg p-1.5 text-emerald-300 hover:bg-white/[0.06]">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button title="Cancel" onClick={() => setEditing(null)} className="rounded-lg p-1.5 text-krypt-muted hover:bg-white/[0.06] hover:text-white">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={cls('h-2 w-2 shrink-0 rounded-full', p.active ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : windows && p.running ? (p.visible === false ? 'bg-krypt-purple shadow-[0_0_8px_rgba(168,85,247,0.8)]' : 'bg-sky-400') : 'bg-white/20')}
                      />
                      <span className="truncate text-sm font-semibold text-white/90">{p.name}</span>
                      {p.active && <span className="shrink-0 text-[11px] text-emerald-300/90">{windows ? 'this window' : 'open'}</span>}
                      {!p.active && windows && p.running && <span className={cls('shrink-0 text-[11px]', p.visible === false ? 'text-violet-300/90' : 'text-sky-300/90')}>{p.visible === false ? 'running in background' : 'window open'}</span>}
                    </div>
                  )}

                  {/* Autopilot */}
                  <label className="flex items-center" title="Scheduled autopilot runs work on this profile">
                    <Toggle on={p.autopilot} onChange={(v) => void act(() => window.marketo.app.setProfileAutopilot(p.id, v))} />
                  </label>

                  {/* Background */}
                  {windows && (
                    <label className="flex items-center" title={p.id === 'main' ? 'Main is the window you work in' : 'Run with no window: started whenever Main opens, and by autopilot runs'}>
                      {p.id === 'main' ? <span className="text-xs text-white/30">-</span> : <Toggle on={!!p.background} onChange={(v) => void act(() => window.marketo.app.setProfileBackground(p.id, v))} />}
                    </label>
                  )}

                  {/* Proxy */}
                  <button
                    onClick={() => toggle(p.id, 'proxy')}
                    title="Set this profile's proxy"
                    className={cls('flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 text-left text-xs transition hover:bg-white/[0.05]', row === 'proxy' && 'bg-white/[0.06]')}
                  >
                    <span className="min-w-0 truncate">{px ? <Status st={px.state} /> : <span className="text-white/40">…</span>}</span>
                    {row === 'proxy' ? <ChevronUp className="h-3.5 w-3.5 shrink-0 text-white/50" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/50" />}
                  </button>

                  {/* Window */}
                  <div className="min-w-0">
                    {p.active ? (
                      <span className="text-xs text-white/40">{windows ? 'This one' : 'Open now'}</span>
                    ) : (
                      <GhostButton small disabled={busy} onClick={() => void act(() => window.marketo.app.useProfile(p.id))}>
                        {windows ? (
                          <>
                            <AppWindow className="h-3.5 w-3.5" /> {p.running ? 'Show window' : 'Open window'}
                          </>
                        ) : (
                          'Open'
                        )}
                      </GhostButton>
                    )}
                  </div>

                  {/* Stop / rename / delete */}
                  <div className="flex items-center justify-end gap-0.5">
                    {windows && p.running && !p.active && (
                      <button
                        title={`Stop "${p.name}" (its window or background run quits; an autopilot run starts it again)`}
                        disabled={busy}
                        onClick={() => void act(() => window.marketo.app.stopProfile(p.id))}
                        className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-rose-500/10 hover:text-rose-300"
                      >
                        <Square className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button title="Rename" onClick={() => setEditing({ id: p.id, name: p.name })} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-white/[0.06] hover:text-white">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {p.id !== 'main' && !p.active && !(windows && p.running) && (
                      <button title="Delete" onClick={() => toggle(p.id, 'delete')} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-rose-500/10 hover:text-rose-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {row === 'proxy' && px && (
                  <div className="border-t border-white/5 bg-white/[0.015] pt-3">
                    <ProxyForm row={px} onSaved={(st) => setProxies((all) => ({ ...all, [p.id]: { ...px, state: st } }))} />
                  </div>
                )}
                {row === 'delete' && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-white/5 bg-rose-500/[0.04] px-4 py-2.5 text-xs text-rose-200/90">
                    <span className="min-w-0 flex-1">Delete "{p.name}" with its accounts, reels, post log and Training? Its folder goes to the Recycle Bin.</span>
                    <GhostButton
                      small
                      destructive
                      disabled={busy}
                      onClick={() =>
                        void act(() => window.marketo.app.deleteProfile(p.id)).then((ok) => {
                          setOpen(null);
                          if (ok) toast('ok', `Profile "${p.name}" deleted. Its folder is in the Recycle Bin.`);
                        })
                      }
                    >
                      Delete everything in it
                    </GhostButton>
                    <GhostButton small onClick={() => setOpen(null)}>
                      Keep
                    </GhostButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <p className="text-[11px] leading-relaxed text-krypt-muted">
        A profile is a complete, separate set: its own accounts and socials, brand, reels, post log, Training and settings. Shared by every profile: your AI connections, the Chrome extension, your ElevenLabs key and the autopilot schedule.
        {many
          ? windows
            ? ' Each scheduled run works on every profile with Autopilot on at the same time, each in its own window (that uses your AI plan that many times faster). Background profiles run with no window: they start when Main opens and when a run needs them, and the sidebar list or Show window brings one up (closing it sends it back to the background; the square stops it).'
            : autopilot?.on
              ? ' Each scheduled run works through the profiles with Autopilot on, one after the other.'
              : ' When the autopilot is on, each run works through the profiles with Autopilot on, one after the other.'
          : ''}{' '}
        Proxy: every page a profile's accounts open goes out through it from one fixed IP; if it dies or the IP changes, that profile's pages stay closed instead of using your own IP. Use a static residential IP (or your provider's sticky-session user name). Accounts in
        Chrome take the proxy for their whole Chrome profile, so give each profile its own Chrome profile (Setup page, Chrome profile).
      </p>
    </div>
  );
}
