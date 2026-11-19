import { useState } from 'react';
import { Check, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { ProfilesResult } from '@shared/types';
import { Card, GhostButton, PrimaryButton, Section, Toggle } from './ui';
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
        onChange={(e) => {
          setBusy(true);
          void openProfile(e.target.value).finally(() => setBusy(false));
        }}
        className="input min-w-0 flex-1 py-1.5 text-xs font-semibold"
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id} className="bg-krypt-panel">
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Setup page: add, rename, open and delete profiles, and pick which ones the autopilot runs. */
export function ProfilesSection() {
  const profiles = useApp((s) => s.profiles);
  const autopilot = useApp((s) => s.autopilot);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState('');
  const [copy, setCopy] = useState(true);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const many = profiles.length > 1;

  const act = async (call: () => Promise<ProfilesResult>): Promise<boolean> => {
    setBusy(true);
    try {
      return await run(call());
    } finally {
      setBusy(false);
    }
  };
  const add = async (): Promise<void> => {
    const n = name.trim();
    if (!n) return toast('warn', 'Give the profile a name.');
    if (await act(() => window.marketo.app.createProfile(n, copy))) {
      setName('');
      toast('ok', `Profile "${n}" is ready. Open it to add its accounts and brand.`);
    }
  };
  const rename = async (): Promise<void> => {
    if (!editing) return;
    if (await act(() => window.marketo.app.renameProfile(editing.id, editing.name))) setEditing(null);
  };

  return (
    <Section
      title="Profiles"
      description="A profile is a complete, separate set: its own accounts and socials, brand, reels, post log, Training, learnings, notes and settings. One is open at a time, and your AI works in the one that is open."
    >
      <Card padded={false} className="divide-y divide-white/5">
        {profiles.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            {editing?.id === p.id ? (
              <>
                <input
                  autoFocus
                  className="input min-w-0 flex-1 py-1.5 text-sm"
                  value={editing.name}
                  maxLength={40}
                  onChange={(e) => setEditing({ id: p.id, name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void rename();
                    if (e.key === 'Escape') setEditing(null);
                  }}
                />
                <GhostButton small disabled={busy} onClick={() => void rename()}>
                  <Check className="h-3.5 w-3.5" /> Save
                </GhostButton>
                <GhostButton small onClick={() => setEditing(null)}>
                  <X className="h-3.5 w-3.5" />
                </GhostButton>
              </>
            ) : (
              <>
                <span className={cls('h-2 w-2 shrink-0 rounded-full', p.active ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]' : 'bg-white/20')} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white/90">
                  {p.name}
                  {p.active && <span className="ml-2 text-xs font-normal text-emerald-300/90">open now</span>}
                </span>
                {many && (
                  <label className="flex items-center gap-2" title="Scheduled autopilot runs work on this profile">
                    <Toggle on={p.autopilot} onChange={(v) => void act(() => window.marketo.app.setProfileAutopilot(p.id, v))} />
                    <span className="text-xs text-krypt-muted">Autopilot</span>
                  </label>
                )}
                {!p.active && (
                  <GhostButton small disabled={busy} onClick={() => void act(() => window.marketo.app.useProfile(p.id))}>
                    Open
                  </GhostButton>
                )}
                <button title="Rename" onClick={() => setEditing({ id: p.id, name: p.name })} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-white/[0.06] hover:text-white">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {p.id !== 'main' &&
                  !p.active &&
                  (confirm === p.id ? (
                    <>
                      <GhostButton
                        small
                        destructive
                        disabled={busy}
                        onClick={() =>
                          void act(() => window.marketo.app.deleteProfile(p.id)).then((ok) => {
                            setConfirm(null);
                            if (ok) toast('ok', `Profile "${p.name}" deleted. Its folder is in the Recycle Bin.`);
                          })
                        }
                      >
                        Delete everything in it
                      </GhostButton>
                      <GhostButton small onClick={() => setConfirm(null)}>
                        Keep
                      </GhostButton>
                    </>
                  ) : (
                    <button title="Delete" onClick={() => setConfirm(p.id)} className="rounded-lg p-1.5 text-krypt-muted transition hover:bg-rose-500/10 hover:text-rose-300">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ))}
              </>
            )}
          </div>
        ))}
        <div className="space-y-3 px-4 py-4">
          <div className="flex gap-2">
            <input
              className="input min-w-0 flex-1 py-2 text-sm"
              placeholder="New profile name"
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add();
              }}
            />
            <PrimaryButton disabled={busy || !name.trim()} onClick={() => void add()}>
              <Plus className="h-4 w-4" /> Add profile
            </PrimaryButton>
          </div>
          <label className="flex items-center gap-3">
            <Toggle on={copy} onChange={setCopy} />
            <span className="text-xs text-white/75">Start it with this profile's settings and saved voices (never its accounts, brand, reels or Training)</span>
          </label>
        </div>
      </Card>
      <p className="mt-3 text-[11px] leading-relaxed text-krypt-muted">
        Shared by every profile: your AI connections, the Chrome extension, your ElevenLabs key and the autopilot schedule.
        {many
          ? autopilot?.on
            ? ' Each scheduled run works through the profiles with Autopilot switched on, one after the other, with a report for each.'
            : ' When the autopilot is on, each run works through the profiles with Autopilot switched on, one after the other.'
          : ''}{' '}
        Switching closes the tabs Marketo has open. It waits while an autopilot run is going.
      </p>
    </Section>
  );
}
