import { useState } from 'react';
import { Plus, Scissors } from 'lucide-react';
import { YT_MAX_SECONDS, clock, hmsSeconds, parseYouTube } from '@shared/clipping';
import { cls } from '../lib/format';
import { useApp } from '../state/store';
import { Card, PrimaryButton } from './ui';

// Create > Next run: paste a YouTube link and the runs turn a part of it into a clipping-style reel. It goes into
// the reel queue as plain instructions (one per run, like everything else there); the clipping style's rules
// (shared/styles.ts) say how: find_clips with the video lists its most replayed parts, save_clip records one.

/** "1:23", "1:02:03", "83", "1m23s" → seconds. */
function timeOf(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const c = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(t);
  if (c) return Number(c[1] ?? 0) * 3600 + Number(c[2]) * 60 + Number(c[3]);
  return hmsSeconds(t);
}

type Part = 'replayed' | 'time';

export function YouTubeClipCard() {
  const toast = useApp((s) => s.toast);
  const nextRun = useApp((s) => s.db!.nextRun);
  const [link, setLink] = useState('');
  const [part, setPart] = useState<Part>('replayed');
  const [from, setFrom] = useState('');
  const [secs, setSecs] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const yt = link.trim() ? parseYouTube(link) : null;
  const bad = !!link.trim() && !yt;
  // A link with ?t= in it fills the start time.
  const fromSec = part === 'time' ? (timeOf(from) ?? yt?.start ?? null) : null;
  const len = secs.trim() ? Math.round(Number(secs)) : null;
  const lenBad = len !== null && (!Number.isFinite(len) || len < 5 || len > YT_MAX_SECONDS);
  const timeBad = part === 'time' && fromSec === null;
  const ready = !!yt && !lenBad && !timeBad && !busy;

  const add = async (): Promise<void> => {
    if (!yt || !ready) return;
    const which =
      part === 'time'
        ? `Use the part starting at ${clock(fromSec!)}${len ? `, about ${len} s long` : ''} (save_clip with that start).`
        : `Use its most replayed part: find_clips with this video lists them; pick the strongest one that works on its own${len ? `, about ${len} s long` : ''}.`;
    const text = [
      `Clip this YouTube ${yt.short ? 'Short' : 'video'} into a reel, clipping style: ${yt.url}`,
      which,
      note.trim() ? `From the user: ${note.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    const first = !nextRun?.note;
    setBusy(true);
    const r = await window.marketo.db.queueRun(text);
    setBusy(false);
    if (!r.ok) {
      toast('error', r.message ?? 'Could not add it.');
      return;
    }
    toast('ok', first ? 'Added. The next run clips it.' : 'Added to the queue. A run clips it when it comes up.');
    setLink('');
    setFrom('');
    setSecs('');
    setNote('');
  };

  return (
    <Card className="space-y-3">
      <div className="flex gap-3">
        {yt ? (
          <img src={`https://i.ytimg.com/vi/${yt.id}/mqdefault.jpg`} alt="" className="h-[68px] w-[120px] shrink-0 rounded-lg border border-white/10 object-cover" />
        ) : (
          <div className="flex h-[68px] w-[120px] shrink-0 items-center justify-center rounded-lg border border-dashed border-white/15 text-krypt-muted">
            <Scissors className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1.5">
          <input
            className={cls('input text-sm', bad && 'border-rose-400/50')}
            placeholder="https://www.youtube.com/watch?v=… or youtu.be/… or a Shorts link"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              const p = parseYouTube(e.target.value);
              if (p?.start != null) {
                setPart('time');
                setFrom(clock(p.start));
              }
            }}
          />
          <p className={cls('text-xs', bad ? 'text-rose-300' : 'text-krypt-muted')}>{bad ? 'That is not a YouTube video link.' : yt ? `Video ${yt.id}${yt.short ? ' (a Short)' : ''}` : 'Any public YouTube video, stream VOD or Short.'}</p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            { id: 'replayed', label: 'Most replayed part', hint: 'Where viewers went back and watched again (YouTube’s own replay graph).' },
            { id: 'time', label: 'From a time I pick', hint: 'You give the start; the run takes it from there.' },
          ] as Array<{ id: Part; label: string; hint: string }>
        ).map((o) => (
          <button key={o.id} onClick={() => setPart(o.id)} className={cls('rounded-xl border px-3 py-2 text-left transition', o.id === part ? 'border-krypt-purple/60 bg-krypt-purple/15' : 'border-white/10 hover:border-white/25')}>
            <div className="text-sm font-semibold text-white">{o.label}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-white/65">{o.hint}</div>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {part === 'time' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-krypt-muted">Start</span>
            <input className={cls('input w-28 font-mono text-sm', from.trim() && timeOf(from) === null && 'border-rose-400/50')} placeholder="1:23" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-krypt-muted">Length (s)</span>
          <input className={cls('input w-28 font-mono text-sm', lenBad && 'border-rose-400/50')} placeholder="AI picks" value={secs} onChange={(e) => setSecs(e.target.value.replace(/[^\d]/g, ''))} />
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-krypt-muted">Note (optional)</span>
          <input className="input text-sm" placeholder="e.g. the bit where he loses it, post on TikTok and Shorts" maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-krypt-muted">
          {lenBad ? `Length: 5 to ${YT_MAX_SECONDS} seconds.` : 'Goes in the queue below, one per run. The run records the part off the page (it takes about as long as the part plays), captions it, and makes a split or full-frame reel. The creator is credited in the caption.'}
        </p>
        <PrimaryButton disabled={!ready} onClick={() => void add()}>
          <Plus className="h-4 w-4" /> Add clip
        </PrimaryButton>
      </div>
    </Card>
  );
}
