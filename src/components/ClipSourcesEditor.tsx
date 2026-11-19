import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ClipSettings, ClipSite, IgAccount } from '@shared/types';
import { CLIP_RANGE_LABEL, CLIP_SITE_LABEL, MAX_CLIP_SOURCES, parseClipSource } from '@shared/clipping';
import { Card, GhostButton } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

export const EMPTY_CLIPPING: ClipSettings = { sources: [], range: 'day' };

/** The streamers an account clips (Twitch / Kick) and how far back it looks: Styles page and setup. */
export function ClipSourcesEditor({ value, onChange }: { value: ClipSettings; onChange: (next: ClipSettings, added?: string) => void }) {
  const toast = useApp((s) => s.toast);
  const [draft, setDraft] = useState('');
  const [site, setSite] = useState<ClipSite>('kick');
  const add = (): void => {
    const p = parseClipSource(draft, site);
    if (!p) return toast('warn', 'Type a streamer name, or paste their kick.com or twitch.tv address.');
    if (value.sources.some((x) => x.site === p.site && x.channel === p.channel)) return toast('warn', `${p.channel} is already on the list.`);
    if (value.sources.length >= MAX_CLIP_SOURCES) return toast('warn', `Up to ${MAX_CLIP_SOURCES} streamers per account.`);
    setDraft('');
    onChange({ ...value, sources: [...value.sources, p] }, `${p.channel} on ${CLIP_SITE_LABEL[p.site]}`);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {value.sources.length === 0 && <span className="text-xs text-krypt-muted">No streamers yet.</span>}
        {value.sources.map((s) => (
          <span key={`${s.site}:${s.channel}`} className="flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 py-1 pl-3 pr-1.5 text-sm text-white/90">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-krypt-muted">{CLIP_SITE_LABEL[s.site]}</span>
            {s.channel}
            <button aria-label={`Remove ${s.channel}`} onClick={() => onChange({ ...value, sources: value.sources.filter((x) => !(x.site === s.site && x.channel === s.channel)) })} className="rounded-full p-0.5 text-krypt-muted hover:text-white">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select value={site} onChange={(e) => setSite(e.target.value as ClipSite)} className="input w-auto py-1.5 text-sm">
          <option value="kick">Kick</option>
          <option value="twitch">Twitch</option>
        </select>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="streamer name or address" className="input min-w-[200px] flex-1 py-1.5 text-sm" />
        <GhostButton small onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add
        </GhostButton>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-xs text-krypt-muted">
        Top clips of the
        {(['day', 'week'] as const).map((r) => (
          <button key={r} onClick={() => onChange({ ...value, range: r })} className={cls('rounded-full border px-2.5 py-1 transition', value.range === r ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/10 hover:text-white')}>
            {CLIP_RANGE_LABEL[r].replace(/^Last /, 'last ')}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Clipping style: the streamers each account clips, and last day or last week. */
export function ClipSources({ accounts }: { accounts: IgAccount[] }) {
  const toast = useApp((s) => s.toast);
  const save = async (a: IgAccount, next: ClipSettings, added?: string): Promise<void> => {
    const r = await window.marketo.db.saveAccount({ id: a.id, clipping: next });
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    if (added) toast('ok', `${a.handle} now clips ${added}.`);
  };
  return (
    <Card>
      <div className="text-sm font-semibold text-white">Streamers to clip</div>
      <p className="mt-1 text-xs text-krypt-muted">Each account cuts its reels from these streamers' top clips by views. Type a name or paste their Kick or Twitch address.</p>
      <div className="mt-3 space-y-4">
        {accounts.map((a) => (
          <div key={a.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 text-sm font-semibold text-white">{a.handle}</div>
            <ClipSourcesEditor value={a.clipping ?? EMPTY_CLIPPING} onChange={(next, added) => void save(a, next, added)} />
          </div>
        ))}
      </div>
    </Card>
  );
}
