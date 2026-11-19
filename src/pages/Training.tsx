import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, GraduationCap, Maximize2, MessageSquareText, Play, RefreshCw, ScrollText, Star, ThumbsDown, ThumbsUp, Trash2, X } from 'lucide-react';
import type { Reel, TrainingNote, TrainingTopic } from '@shared/types';
import { hookLine } from '@shared/score';
import { HOOK_STYLES } from '@shared/hooks';
import { KRYPT_TOOLS } from '@shared/kryptPack';
import { SITES, SITE_LABEL, linkOn } from '@shared/warmup';
import { BRIEF_PROMPT, RATING_LABEL, briefNews, briefState, byHookStyle, byTool, firstPostedAt, hookStyleName, isPosted, toolTopicKey, toolsOf, topicKeyOf, totalViews, trainingOf, type BriefState, type Tally } from '@shared/training';
import { Card, Empty, GhostButton, Page, PrimaryButton, Section, Stat, Tag } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { GlassSegmented } from '../components/glass/GlassSegmented';
import { useApp } from '../state/store';
import { cls, fmtNum } from '../lib/format';

// Training: the user teaches the AI their taste. They rate posted reels, judge each opening, mark topics as
// more / less and write notes; the AI reads all of it back (get_performance) and makes more of what they liked.

export type TrainingTab = 'rank' | 'hooks' | 'topics' | 'notes';

const api = () => window.marketo.db;

function useSave() {
  const toast = useApp((s) => s.toast);
  return (p: Promise<{ ok: boolean; message?: string }>): void => void p.then((r) => !r.ok && toast('error', r.message ?? 'Could not save that.'));
}

const day = (iso?: string): string => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

// ── Pieces ─────────────────────────────────────────────────────────────────
/** The reel's preview: click it to watch the whole video large, with sound (Viewer). */
function Preview({ reel, onOpen }: { reel: Reel; onOpen: () => void }) {
  if (!reel.renderPath) return <div className="flex aspect-[9/16] w-full items-center justify-center rounded-xl bg-black/50 px-2 text-center text-[11px] text-krypt-muted">No video file</div>;
  return (
    <button className="group relative block w-full overflow-hidden rounded-xl bg-black" title="Watch it full size" onClick={onOpen}>
      <video src={`${window.marketo.app.mediaUrl(reel.renderPath)}#t=0.8`} muted playsInline preload="metadata" className="aspect-[9/16] w-full object-cover" />
      <span className="absolute inset-0 flex items-center justify-center bg-black/25 transition group-hover:bg-black/10">
        <span className="rounded-full bg-black/60 p-2.5 text-white">
          <Play className="h-4 w-4" />
        </span>
      </span>
      <span className="absolute right-1.5 top-1.5 rounded-md bg-black/60 p-1 text-white/80 opacity-0 transition group-hover:opacity-100">
        <Maximize2 className="h-3 w-3" />
      </span>
    </button>
  );
}

/**
 * The whole reel, large and with sound, with its rating beside it. Left / right walk through the list being rated.
 * It is drawn on the page body: the cards are glass, and a glass element would trap a full-screen layer inside itself.
 */
function Viewer({ reels, id, onPick, onClose }: { reels: Reel[]; id: string; onPick: (id: string) => void; onClose: () => void }) {
  const at = reels.findIndex((r) => r.id === id);
  const reel = reels[at];
  const step = (d: number): void => {
    const next = reels[at + d];
    if (next) onPick(next.id);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const typing = e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement;
      if (e.key === 'Escape') onClose();
      else if (!typing && e.key === 'ArrowRight') step(1);
      else if (!typing && e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // The reel left the list (rated while "To rate" is open, or deleted): nothing to show.
  useEffect(() => {
    if (!reel) onClose();
  }, [reel, onClose]);
  if (!reel) return null;
  const views = totalViews(reel);
  const on = SITES.filter((s) => linkOn(reel, s));
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center gap-6 bg-black/80 p-6 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {reel.renderPath ? (
        <video key={reel.id} src={window.marketo.app.mediaUrl(reel.renderPath)} controls autoPlay playsInline className="aspect-[9/16] h-full max-h-[calc(100vh-48px)] rounded-2xl bg-black shadow-2xl" />
      ) : (
        <div className="flex aspect-[9/16] h-full max-h-[calc(100vh-48px)] items-center justify-center rounded-2xl bg-black/60 text-sm text-krypt-muted">No video file for this reel</div>
      )}
      <div className="flex max-h-full w-[380px] shrink-0 flex-col gap-4 overflow-auto rounded-2xl border border-white/10 bg-[#0d0b16] p-5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-base font-semibold leading-snug">{reel.title}</div>
            <div className="mt-1 text-[11px] text-krypt-muted">
              {on.length ? `${day(firstPostedAt(reel))} · ${on.map((s) => SITE_LABEL[s]).join(', ')}` : 'Not posted yet'}
              {views !== null ? ` · ${fmtNum(views)} views` : ''}
            </div>
          </div>
          <button title="Close (Esc)" aria-label="Close" onClick={onClose} className="glass-chip rounded-lg p-1.5 text-krypt-muted hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div>
          <div className="label">How much did you like it</div>
          <Stars reel={reel} />
        </div>
        <div>
          <div className="label">The opening</div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
            <div className="min-w-0 flex-1">
              <Opening reel={reel} className="whitespace-normal text-sm" />
              {reel.hookStyle && <div className="mt-0.5 text-[11px] text-krypt-muted">{hookStyleName(reel.hookStyle)}</div>}
            </div>
            <HookThumbs reel={reel} />
          </div>
        </div>
        <div>
          <div className="label">Your comment</div>
          <ReelNote key={reel.id} reel={reel} tall />
        </div>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <GhostButton small onClick={() => step(-1)} disabled={at <= 0}>
            <ChevronLeft className="h-3.5 w-3.5" /> Previous
          </GhostButton>
          <span className="flex-1 text-center font-mono text-[11px] text-krypt-muted">
            {at + 1} of {reels.length}
          </span>
          <GhostButton small onClick={() => step(1)} disabled={at >= reels.length - 1}>
            Next <ChevronRight className="h-3.5 w-3.5" />
          </GhostButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** The reel's first line. A video made outside the hub has none written down. */
function Opening({ reel, className }: { reel: Reel; className?: string }) {
  const line = hookLine(reel);
  return <div className={cls('truncate', line ? 'text-white/85' : 'italic text-krypt-muted', className)}>{line ? `“${line}”` : 'The opening (no line written down for this video)'}</div>;
}

/** One to five stars. Clicking the rating it already has clears it. */
function Stars({ reel }: { reel: Reel }) {
  const save = useSave();
  const [hover, setHover] = useState(0);
  const rating = reel.feedback?.rating ?? 0;
  const shown = hover || rating;
  return (
    <div className="flex items-center gap-2">
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} aria-label={`${n} of 5: ${RATING_LABEL[n]}`} title={RATING_LABEL[n]} onMouseEnter={() => setHover(n)} onClick={() => save(api().reelFeedback(reel.id, { rating: rating === n ? null : n }))} className="p-0.5">
            <Star className={cls('h-6 w-6 transition', n <= shown ? 'fill-amber-300 text-amber-300' : 'text-white/25 hover:text-white/50')} />
          </button>
        ))}
      </div>
      <span className={cls('text-xs', shown ? 'text-white/80' : 'text-krypt-muted')}>{shown ? RATING_LABEL[shown] : 'Not rated'}</span>
    </div>
  );
}

/** Thumb up / down for the opening on its own. */
function HookThumbs({ reel }: { reel: Reel }) {
  const save = useSave();
  const v = reel.feedback?.hook;
  const set = (x: 1 | -1): void => save(api().reelFeedback(reel.id, { hook: v === x ? null : x }));
  return (
    <span className="inline-flex shrink-0 gap-1">
      <button title="Good opening" aria-label="Good opening" onClick={() => set(1)} className={cls('glass-chip rounded-lg p-1.5', v === 1 ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-300' : 'text-krypt-muted hover:text-white')}>
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button title="Weak opening" aria-label="Weak opening" onClick={() => set(-1)} className={cls('glass-chip rounded-lg p-1.5', v === -1 ? 'border-rose-400/50 bg-rose-500/15 text-rose-300' : 'text-krypt-muted hover:text-white')}>
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

/** The user's comment on a reel. Saved when they click away. */
function ReelNote({ reel, tall }: { reel: Reel; tall?: boolean }) {
  const save = useSave();
  const saved = reel.feedback?.note ?? '';
  const [text, setText] = useState(saved);
  useEffect(() => setText(saved), [saved]);
  return (
    <textarea
      className={cls('input', tall ? 'min-h-[120px] text-sm' : 'min-h-[52px] text-xs')}
      value={text}
      placeholder="What did you like or not like about it? Your AI reads this."
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== saved && save(api().reelFeedback(reel.id, { note: text.trim() || null }))}
    />
  );
}

function ReelCard({ reel, rank, onOpen }: { reel: Reel; rank?: number; onOpen: () => void }) {
  const go = useApp((s) => s.go);
  const posts = useApp((s) => s.db!.posts);
  const views = totalViews(reel);
  const on = SITES.filter((s) => linkOn(reel, s));
  const first = on.map((s) => linkOn(reel, s)!).find((x) => x.url);
  const tools = toolsOf(reel, posts);
  return (
    <Card className="flex gap-4">
      <div className="w-[118px] shrink-0">
        <Preview reel={reel} onOpen={onOpen} />
      </div>
      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="flex items-start gap-2">
          {rank !== undefined && <span className="mt-0.5 font-mono text-sm text-krypt-muted">#{rank}</span>}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" title={reel.title}>
              {reel.title}
            </div>
            <div className="mt-0.5 truncate text-[11px] text-krypt-muted">
              {on.length ? `${day(firstPostedAt(reel))} · ${on.map((s) => SITE_LABEL[s]).join(', ')}` : 'Not posted yet'}
              {views !== null ? ` · ${fmtNum(views)} views` : ''}
            </div>
          </div>
          {first && (
            <button title="Open the post" onClick={() => void window.marketo.app.openExternal(first.url)} className="text-krypt-muted hover:text-white">
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <GhostButton small onClick={() => go('library', reel.id)}>
            Open
          </GhostButton>
        </div>
        <Stars reel={reel} />
        <div className="flex items-center gap-2 rounded-lg border border-white/10 px-2.5 py-1.5">
          <div className="min-w-0 flex-1">
            <Opening reel={reel} className="text-xs" />
            <div className="mt-0.5 flex flex-wrap gap-1">
              <Tag>{reel.hookStyle ? hookStyleName(reel.hookStyle) : 'opening'}</Tag>
              {tools.map((t) => (
                <Tag key={t}>{KRYPT_TOOLS.find((x) => x.id === t)?.name ?? t}</Tag>
              ))}
            </div>
          </div>
          <HookThumbs reel={reel} />
        </div>
        <ReelNote reel={reel} />
      </div>
    </Card>
  );
}

const KIND_LABEL: Record<TrainingNote['kind'], string> = { rule: 'Rule', more: 'More of', less: 'Less of' };
const KIND_TONE: Record<TrainingNote['kind'], string> = { rule: 'border-krypt-purple/40 bg-krypt-purple/10 text-purple-200', more: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200', less: 'border-rose-400/40 bg-rose-500/10 text-rose-200' };
const KIND_HINT: Record<TrainingNote['kind'], string> = {
  rule: 'Holds for every reel, e.g. "Never open with the product name" or "Keep reels under 30 seconds".',
  more: 'Something to make more of, e.g. "Videos that show the real app on screen".',
  less: 'Something to make less of, e.g. "Trader reports".',
};

/** Write a note for the AI: a rule, or more / less of something. */
function NoteComposer({ about }: { about: TrainingNote['about'] }) {
  const save = useSave();
  const [kind, setKind] = useState<TrainingNote['kind']>('rule');
  const [text, setText] = useState('');
  const add = (): void => {
    if (text.trim().length < 3) return;
    save(api().addTrainingNote({ kind, about, text: text.trim() }));
    setText('');
  };
  return (
    <Card className="space-y-3">
      <GlassSegmented value={kind} onChange={setKind} options={(['rule', 'more', 'less'] as const).map((k) => ({ value: k, label: KIND_LABEL[k] }))} />
      <textarea className="input min-h-[64px]" value={text} placeholder={KIND_HINT[kind]} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.ctrlKey || e.metaKey) && add()} />
      <div className="flex items-center gap-3">
        <PrimaryButton onClick={add} disabled={text.trim().length < 3}>
          Save note
        </PrimaryButton>
        <span className="text-[11px] text-krypt-muted">Your AI reads it before it plans the next reel.</span>
      </div>
    </Card>
  );
}

function NoteList({ notes, empty }: { notes: TrainingNote[]; empty: string }) {
  const save = useSave();
  if (!notes.length) return <div className="text-sm text-krypt-muted">{empty}</div>;
  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <Card key={n.id} className="flex items-start gap-3">
          <span className={cls('mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', KIND_TONE[n.kind])}>{KIND_LABEL[n.kind]}</span>
          <div className="min-w-0 flex-1">
            <div className="whitespace-pre-wrap text-sm">{n.text}</div>
            <div className="mt-1 text-[11px] text-krypt-muted">
              {day(n.at)}
              {n.about !== 'general' ? ` · ${n.about}` : ''}
            </div>
          </div>
          <button className="text-krypt-muted transition hover:text-red-400" title="Delete" onClick={() => save(api().deleteTrainingNote(n.id))}>
            <Trash2 className="h-4 w-4" />
          </button>
        </Card>
      ))}
    </div>
  );
}

const avgText = (t: Tally): string => (t.avg === null ? 'not rated' : `${t.avg.toFixed(1)} / 5`);
const avgTone = (t: Tally): string => (t.avg === null ? 'text-krypt-muted' : t.avg >= 4 ? 'text-emerald-300' : t.avg >= 3 ? 'text-amber-300' : 'text-rose-300');

// ── Rank ───────────────────────────────────────────────────────────────────
type RankView = 'todo' | 'ranked' | 'all';

function Rank() {
  const db = useApp((s) => s.db)!;
  const [view, setView] = useState<RankView>('todo');
  const [drafts, setDrafts] = useState(false);
  const newest = (a: Reel, b: Reel): number => (firstPostedAt(b) ?? b.renderedAt ?? b.updatedAt).localeCompare(firstPostedAt(a) ?? a.renderedAt ?? a.updatedAt);
  const pool = db.reels.filter((r) => isPosted(r) || (drafts && r.status === 'rendered')).sort(newest);
  const rated = pool.filter((r) => typeof r.feedback?.rating === 'number');
  const todo = pool.filter((r) => typeof r.feedback?.rating !== 'number');
  const ranked = [...rated].sort((a, b) => b.feedback!.rating! - a.feedback!.rating! || newest(a, b));
  // A reel rated from the "To rate" list stays in it until the list is left, so there is time to comment on it too.
  const stay = useRef(new Set<string>());
  if (view === 'todo') todo.forEach((r) => stay.current.add(r.id));
  else stay.current.clear();
  const list = view === 'todo' ? pool.filter((r) => stay.current.has(r.id)) : view === 'ranked' ? ranked : pool;
  // The reel open full size, and the list it was opened from (kept as it was, so rating one does not move the rest).
  const [viewer, setViewer] = useState<{ ids: string[]; id: string } | null>(null);
  const viewed = viewer ? viewer.ids.map((id) => db.reels.find((r) => r.id === id)).filter((r): r is Reel => !!r) : [];
  const avg = rated.length ? rated.reduce((n, r) => n + r.feedback!.rating!, 0) / rated.length : null;
  const waiting = db.reels.filter((r) => !isPosted(r) && r.status === 'rendered').length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Rated" value={`${rated.length} / ${pool.length}`} sub={todo.length ? `${todo.length} to rate` : 'all rated'} accent />
        <Stat label="Your average" value={avg === null ? '—' : avg.toFixed(1)} sub="out of 5" />
        <Stat label="Loved" value={rated.filter((r) => r.feedback!.rating === 5).length} sub={`${rated.filter((r) => r.feedback!.rating! <= 2).length} you would not repeat`} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <GlassSegmented
          value={view}
          onChange={setView}
          options={[
            { value: 'todo', label: `To rate (${todo.length})` },
            { value: 'ranked', label: `Your ranking (${rated.length})` },
            { value: 'all', label: `All (${pool.length})` },
          ]}
        />
        {waiting > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-xs text-krypt-muted">
            <input type="checkbox" checked={drafts} onChange={(e) => setDrafts(e.target.checked)} className="accent-purple-500" />
            Include {waiting} made but not posted yet
          </label>
        )}
      </div>
      {list.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {list.map((r, i) => (
            <ReelCard key={r.id} reel={r} rank={view === 'ranked' ? i + 1 : undefined} onOpen={() => setViewer({ ids: list.map((x) => x.id), id: r.id })} />
          ))}
        </div>
      ) : (
        <Empty icon={<GraduationCap className="h-6 w-6" />} title={view === 'todo' && pool.length ? 'Everything is rated' : view === 'ranked' ? 'Nothing rated yet' : 'No posted reels yet'}>
          {view === 'todo' && pool.length ? 'New reels show up here once they are posted.' : view === 'ranked' ? 'Rate a few reels and your ranking builds itself here, best first.' : 'Once a reel is posted it shows up here for you to rate.'}
        </Empty>
      )}
      {viewer && <Viewer reels={viewed} id={viewer.id} onPick={(id) => setViewer({ ...viewer, id })} onClose={() => setViewer(null)} />}
    </div>
  );
}

// ── Hooks ──────────────────────────────────────────────────────────────────
function Hooks() {
  const db = useApp((s) => s.db)!;
  const reels = db.reels.filter(isPosted);
  // Reels made before hook styles existed go last.
  const styles = byHookStyle(reels).sort((a, b) => Number(a.key === 'none') - Number(b.key === 'none'));
  const untested = HOOK_STYLES.filter((h) => !styles.some((s) => s.key === h.id));
  const open = [...reels].sort((a, b) => Number(!!a.feedback?.hook) - Number(!!b.feedback?.hook) || (firstPostedAt(b) ?? '').localeCompare(firstPostedAt(a) ?? ''));
  const notes = trainingOf(db).notes.filter((n) => n.about === 'hooks');
  return (
    <div>
      <Section title="By kind of opening" description="Every reel opens in one hook style. This is how you rated the reels in each, and how many of their openings you liked.">
        {styles.length ? (
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
            {styles.map((s) => (
              <Card key={s.key} className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold">{s.key === 'none' ? 'Made before hook styles' : s.name}</span>
                  <span className={cls('ml-auto shrink-0 font-mono text-sm font-semibold', avgTone(s))}>{avgText(s)}</span>
                </div>
                <div className="text-[11px] text-krypt-muted">
                  {s.n} reel{s.n === 1 ? '' : 's'} · {s.rated} rated · openings {s.liked} liked, {s.disliked} not
                </div>
                <div className="text-[11px] text-krypt-muted/80">{HOOK_STYLES.find((h) => h.id === s.key)?.pattern ?? ''}</div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-sm text-krypt-muted">No posted reels yet.</div>
        )}
        {untested.length > 0 && styles.length > 0 && <p className="mt-3 text-[11px] text-krypt-muted">Not tried yet: {untested.map((h) => h.name).join(', ')}.</p>}
      </Section>

      <Section title="Openings" description="The first line of every posted reel. Thumb up the ones that would stop you scrolling, thumb down the ones that would not.">
        {open.length ? (
          <Card padded={false} className="divide-y divide-white/5">
            {open.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <Opening reel={r} className="text-sm" />
                  <div className="mt-0.5 truncate text-[11px] text-krypt-muted">
                    {r.hookStyle ? `${hookStyleName(r.hookStyle)} · ` : ''}
                    {r.title}
                    {totalViews(r) !== null ? ` · ${fmtNum(totalViews(r))} views` : ''}
                  </div>
                </div>
                <HookThumbs reel={r} />
              </div>
            ))}
          </Card>
        ) : (
          <div className="text-sm text-krypt-muted">Openings show up here once reels are posted.</div>
        )}
      </Section>

      <Section title="Notes about hooks" description="Tell your AI what an opening should or should not do.">
        <div className="space-y-3">
          <NoteComposer about="hooks" />
          <NoteList notes={notes} empty="No hook notes yet." />
        </div>
      </Section>
    </div>
  );
}

// ── Topics ─────────────────────────────────────────────────────────────────
function Want({ topic, name, value }: { topic: string; name: string; value: TrainingTopic['want'] | undefined }) {
  const save = useSave();
  return (
    <GlassSegmented
      size="xs"
      value={value ?? 'normal'}
      onChange={(v) => save(api().setTrainingTopic({ key: topic, name, want: v === 'normal' ? null : v }))}
      options={[
        { value: 'less', label: 'Less' },
        { value: 'normal', label: 'Normal' },
        { value: 'more', label: 'More' },
      ]}
    />
  );
}

function Topics() {
  const db = useApp((s) => s.db)!;
  const save = useSave();
  const t = trainingOf(db);
  const [name, setName] = useState('');
  const reels = db.reels.filter(isPosted);
  const stats = byTool(reels, db.posts);
  const wantOf = (key: string): TrainingTopic['want'] | undefined => t.topics.find((x) => x.key === key)?.want;
  const tools = [...KRYPT_TOOLS].sort((a, b) => (stats.find((s) => s.key === b.id)?.n ?? 0) - (stats.find((s) => s.key === a.id)?.n ?? 0));
  const own = t.topics.filter((x) => !x.key.startsWith('tool:'));
  const add = (want: TrainingTopic['want']): void => {
    if (!name.trim()) return;
    save(api().setTrainingTopic({ key: topicKeyOf(name), name: name.trim(), want }));
    setName('');
  };
  const notes = t.notes.filter((n) => n.about === 'topics');
  return (
    <div>
      <Section title="Your own topics" description='Anything you want more or less of: "gaming tools", "Polymarket bots", "trader reports".'>
        <Card className="space-y-3">
          <div className="flex gap-2">
            <input className="input flex-1" value={name} placeholder="A topic, in your own words" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add('more')} />
            <GhostButton onClick={() => add('less')} disabled={!name.trim()}>
              Less of this
            </GhostButton>
            <PrimaryButton onClick={() => add('more')} disabled={!name.trim()}>
              More of this
            </PrimaryButton>
          </div>
          {own.length > 0 && (
            <div className="divide-y divide-white/5">
              {own.map((x) => (
                <div key={x.key} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{x.name}</span>
                  <Want topic={x.key} name={x.name} value={x.want} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </Section>

      <Section title="Krypt tools" description="How you rated the reels about each tool. Set More or Less and your AI plans the next reels around it.">
        <Card padded={false} className="divide-y divide-white/5">
          {tools.map((tool) => {
            const s = stats.find((x) => x.key === tool.id);
            return (
              <div key={tool.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{tool.name}</div>
                  <div className="truncate text-[11px] text-krypt-muted">{s ? `${s.n} reel${s.n === 1 ? '' : 's'} posted · ${s.rated} rated` : 'No reel posted yet'} · {tool.tagline}</div>
                </div>
                {s && <span className={cls('shrink-0 font-mono text-xs font-semibold', avgTone(s))}>{avgText(s)}</span>}
                <Want topic={toolTopicKey(tool.id)} name={tool.name} value={wantOf(toolTopicKey(tool.id))} />
              </div>
            );
          })}
        </Card>
      </Section>

      <Section title="Notes about topics" description="Angles you want, stories to stay away from, who the reels are for.">
        <div className="space-y-3">
          <NoteComposer about="topics" />
          <NoteList notes={notes} empty="No topic notes yet." />
        </div>
      </Section>
    </div>
  );
}

// ── Notes ──────────────────────────────────────────────────────────────────
function Notes() {
  const db = useApp((s) => s.db)!;
  const go = useApp((s) => s.go);
  const t = trainingOf(db);
  const commented = db.reels.filter((r) => r.feedback?.note?.trim()).sort((a, b) => (b.feedback!.at ?? '').localeCompare(a.feedback!.at ?? ''));
  return (
    <div>
      <Section title="Tell your AI" description="Rules hold for every reel. More of / Less of steer what gets made next.">
        <div className="space-y-3">
          <NoteComposer about="general" />
          <NoteList notes={t.notes} empty="No notes yet. Write the first thing you would tell someone making your videos." />
        </div>
      </Section>

      <Section title="Your comments on reels" description="What you wrote on single reels (Rank page).">
        {commented.length ? (
          <div className="space-y-2">
            {commented.map((r) => (
              <Card key={r.id} hoverable onClick={() => go('train-rank')} className="flex items-start gap-3">
                <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-krypt-purple" />
                <div className="min-w-0 flex-1">
                  <div className="whitespace-pre-wrap text-sm">{r.feedback!.note}</div>
                  <div className="mt-1 truncate text-[11px] text-krypt-muted">
                    {r.title}
                    {r.feedback!.rating ? ` · ${r.feedback!.rating} / 5` : ''}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-sm text-krypt-muted">None yet. Each reel on the Rank page has a box for what you thought of it.</div>
        )}
      </Section>

      <Section title="What your AI learned from the numbers" description="Its own lessons from views and watch time, kept on the Results page. When they point a different way than your ratings, it tells you instead of picking one.">
        <div className="flex items-center gap-3 text-sm text-krypt-muted">
          {db.learnings.length} lesson{db.learnings.length === 1 ? '' : 's'} so far.
          <GhostButton small onClick={() => go('results')}>
            See them
          </GhostButton>
        </div>
      </Section>
    </div>
  );
}

const HEAD: Record<TrainingTab, { title: string; subtitle: string }> = {
  rank: { title: 'Rank your reels', subtitle: 'Rate what was posted. Your AI makes more like the ones you rate high and stops making the ones you rate low.' },
  hooks: { title: 'Hooks', subtitle: 'Which openings work for you, and which kinds of opening you want more of.' },
  topics: { title: 'Topics', subtitle: 'What the reels should be about more, and less.' },
  notes: { title: 'Notes', subtitle: 'Everything you have told your AI about how you want your videos.' },
};

// ── The brief ──────────────────────────────────────────────────────────────
// One page the AI writes from every rating, opening thumb, comment and lesson. Runs read it (plus what is newer)
// in place of every single row, and the user reads it here to see what the AI thinks they want.

const OPEN_KEY = 'marketo.brief.open';

/** Update: Kip writes it right away when he can; otherwise the next AI that reads the Training does. */
function useBrief(): { s: BriefState; writing: boolean; update: () => void } {
  const db = useApp((x) => x.db)!;
  const kip = useApp((x) => x.kip);
  const toast = useApp((x) => x.toast);
  const s = briefState(db);
  // Kip takes a moment to say he has started.
  const [sending, setSending] = useState(false);
  const writing = sending || (s.asked && !!kip?.busy);
  const at = s.brief?.at;
  const seen = useRef(at);
  useEffect(() => {
    if (at && at !== seen.current) toast('ok', 'The brief is updated.');
    seen.current = at;
  }, [at, toast]);
  const update = (): void => {
    if (writing) return;
    void (async () => {
      const r = await api().askBrief();
      if (!r.ok) return toast('error', r.message ?? 'Could not ask for the brief.');
      if (kip?.available && !kip.busy) {
        setSending(true);
        setTimeout(() => setSending(false), 5000);
        await window.marketo.kip.send(BRIEF_PROMPT);
        toast('ok', 'Kip is writing it now. It takes about a minute; his answer is on the Kip page.');
      } else if (kip?.busy) toast('warn', 'Kip is busy with something else. Press Update again when he is done, or your AI writes the brief at the start of its next run.');
      else toast('ok', 'Asked for. Your AI writes the brief at the start of its next run, or right away if you tell it "update my Training brief".');
    })();
  };
  return { s, writing, update };
}

function briefStatus(s: BriefState, writing: boolean): { text: string; behind: boolean } {
  if (writing) return { text: 'Kip is writing it…', behind: false };
  if (!s.material) return { text: 'Rate a few reels first', behind: false };
  if (s.asked) return { text: 'Asked for: your AI writes it at its next run', behind: true };
  if (!s.brief) return { text: 'No brief yet', behind: true };
  const news = briefNews(s);
  if (news) return { text: `${news} since the last update`, behind: true };
  if (s.changed) return { text: 'Changed since the last update', behind: true };
  return { text: 'Up to date', behind: false };
}

function BriefButton({ s, writing, update }: { s: BriefState; writing: boolean; update: () => void }) {
  const status = briefStatus(s, writing);
  return (
    <>
      <span className={cls('text-xs', status.behind ? 'text-amber-300' : 'text-krypt-muted')}>{status.text}</span>
      <GhostButton onClick={update} disabled={writing || !s.material}>
        <RefreshCw className={cls('h-4 w-4', writing && 'animate-spin')} /> {writing ? 'Updating…' : 'Update brief'}
      </GhostButton>
    </>
  );
}

function BriefCard({ s, writing }: { s: BriefState; writing: boolean }) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(OPEN_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const toggle = (): void => {
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? '0' : '1');
      } catch {
        /* the choice is just not remembered */
      }
      return !v;
    });
  };
  return (
    <Card className="mb-6">
      <button onClick={toggle} className="flex w-full items-center gap-3 text-left" aria-expanded={open}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-krypt-purple/40 bg-krypt-purple/15 text-purple-200">
          <ScrollText className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">What your AI works from</span>
          <span className="block text-[11px] text-krypt-muted">{s.brief ? `The brief: one page on what you want from your videos. Written ${day(s.brief.at)}.` : 'The brief: one page on what you want from your videos. Not written yet.'}</span>
        </span>
        <ChevronDown className={cls('h-4 w-4 shrink-0 text-krypt-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-4 border-t border-white/5 pt-3">
          {s.brief ? (
            <Markdown source={s.brief.text} />
          ) : (
            <p className="text-sm text-krypt-muted">
              {writing
                ? 'Kip is reading your ratings and comments and writing it now.'
                : s.material
                  ? 'Press Update brief (top right) and your AI sums up your ratings, opening thumbs, comments and its own lessons on one page: what to make more of, what to stop, and which openings and topics work for you.'
                  : 'There is nothing to write it from yet. Rate a few posted reels on the Rank page first.'}
            </p>
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-krypt-muted">
            Once it is written, your AI reads this page plus anything newer, instead of every single rating and lesson. Your rules and notes are still sent word for word. Something wrong in it? Write a rule or a note on the Notes page, then press Update brief.
          </p>
        </div>
      )}
    </Card>
  );
}

export default function Training({ tab }: { tab: TrainingTab }) {
  const brief = useBrief();
  return (
    <Page key={tab} title={HEAD[tab].title} subtitle={HEAD[tab].subtitle} actions={<BriefButton {...brief} />}>
      <BriefCard s={brief.s} writing={brief.writing} />
      {tab === 'rank' ? <Rank /> : tab === 'hooks' ? <Hooks /> : tab === 'topics' ? <Topics /> : <Notes />}
    </Page>
  );
}
