import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FolderOpen, Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import type { LongVideo, Reel, ReelCover } from '@shared/types';
import { COVER_COLORS, COVER_LOOKS, COVER_PLACES, COVER_SAFE, DEFAULT_COVER, cleanCover } from '@shared/covers';
import { timingFor } from '@shared/presets';
import { Card, Empty, GhostButton, Page, PrimaryButton, Toggle } from '../components/ui';
import { ReelThumb } from '../components/ReelThumb';
import { useShowMore } from '../components/ShowMore';
import { renderCover } from '../render/cover';
import { renderThumbnail } from '../render/thumbnail';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Create > Thumbnails: covers for Shorts and reels (a frame of the reel plus a few big words, set as the cover when it
// is posted on Instagram, TikTok, Facebook and YouTube) and the long videos' 16:9 thumbnails. The AI makes them with
// render_cover / render_thumbnail; here the user sees, changes and saves them.

const totalOf = (r: Reel): number => {
  try {
    return timingFor(r.preset, r.fields).total;
  } catch {
    return 10;
  }
};
const fresh = (p: string, at?: string): string => `${window.marketo.app.mediaUrl(p)}?v=${encodeURIComponent(at ?? '')}`;
const startOf = (r: Reel): ReelCover => cleanCover({ ...DEFAULT_COVER, text: '', t: Math.min(1.2, totalOf(r) / 2), ...r.cover }, totalOf(r));

function Seg<T extends string>({ value, options, onChange }: { value: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={cls('rounded-lg px-2.5 py-1 text-xs font-medium transition', value === o.id ? 'bg-krypt-purple/30 text-white ring-1 ring-krypt-purple/60' : 'bg-white/5 text-white/60 hover:bg-white/10')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One reel's cover: live preview, words, frame, look, place, colour; Save writes the 1080x1920 file. */
function CoverEditor({ reel }: { reel: Reel }) {
  const toast = useApp((s) => s.toast);
  const total = totalOf(reel);
  const [c, setC] = useState<ReelCover>(() => startOf(reel));
  const [preview, setPreview] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [crop, setCrop] = useState(true);
  useEffect(() => setC(startOf(reel)), [reel.id]);
  const set = (patch: Partial<ReelCover>): void => setC((x) => cleanCover({ ...x, ...patch, path: undefined, at: undefined }, total));
  const saved = reel.cover;
  const same = !!saved?.path && JSON.stringify({ ...saved, path: '', at: '' }) === JSON.stringify({ ...c, path: '', at: '' });

  // Redraw shortly after the last change (a frame of the reel is drawn each time).
  const seq = useRef(0);
  const key = JSON.stringify({ ...c, path: '', at: '' }) + reel.updatedAt;
  useEffect(() => {
    const n = ++seq.current;
    setDrawing(true);
    const timer = setTimeout(() => {
      renderCover(reel, c, 0.4)
        .then((png) => n === seq.current && setPreview(`data:image/png;base64,${png}`))
        .catch((e: unknown) => n === seq.current && toast('error', `Could not draw the cover: ${(e as Error).message}`))
        .finally(() => n === seq.current && setDrawing(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [key]);

  const save = async (): Promise<void> => {
    if (!c.text && c.look !== 'frame') return toast('error', 'Write 2-5 words for the cover, or pick "Frame only".');
    setSaving(true);
    try {
      const png = await renderCover(reel, c, 1);
      const r = await window.marketo.render.saveCover(reel.id, png, c);
      if (!r.ok) throw new Error(r.message ?? 'Saving failed.');
      toast('ok', 'Cover saved. It is set when the reel is posted.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // The middle 3:4 on the preview (Instagram's grid and TikTok show only that part).
  const safeTop = (COVER_SAFE.top / 1920) * 100;
  const safeH = ((COVER_SAFE.bottom - COVER_SAFE.top) / 1920) * 100;

  return (
    <Card className="grid gap-5 md:grid-cols-[260px_1fr]">
      <div className="space-y-2">
        <div className="relative aspect-[9/16] w-full overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          {preview && <img src={preview} alt="" className="h-full w-full object-cover" />}
          {crop && (
            <>
              <div className="absolute inset-x-0 top-0 bg-black/55" style={{ height: `${safeTop}%` }} />
              <div className="absolute inset-x-0 bottom-0 bg-black/55" style={{ height: `${safeTop}%` }} />
              <div className="pointer-events-none absolute inset-x-0 border-y border-dashed border-white/40" style={{ top: `${safeTop}%`, height: `${safeH}%` }} />
            </>
          )}
          {drawing && <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-white/70" />}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-krypt-muted">
          <input type="checkbox" checked={crop} onChange={(e) => setCrop(e.target.checked)} /> Show the 3:4 part the grid and TikTok show
        </label>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-sm font-semibold text-white">{reel.title}</div>
          <div className="text-[11px] text-krypt-muted">
            {saved?.path ? (same ? 'This cover is saved and gets set when the reel is posted.' : 'Changed: Save to use these settings.') : 'No cover saved yet.'}
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-white/80">Words</span>
          <input
            value={c.text}
            maxLength={60}
            onChange={(e) => setC((x) => ({ ...x, text: e.target.value, path: undefined }))}
            placeholder="2-5 words, one in *stars* for the colour"
            className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-krypt-purple/60"
          />
          <span className="block text-[11px] text-krypt-muted">Make them want the video without giving it away. Not the caption, not the hook word for word.</span>
        </label>

        <label className="block space-y-1">
          <span className="flex justify-between text-xs font-medium text-white/80">
            <span>Frame</span>
            <span className="font-mono text-krypt-muted">{c.t.toFixed(1)}s of {total.toFixed(1)}s</span>
          </span>
          <input type="range" min={0} max={Math.max(0.1, total - 0.05)} step={0.1} value={c.t} onChange={(e) => set({ t: Number(e.target.value) })} className="w-full accent-krypt-purple" disabled={!!c.bg} />
          {c.bg && (
            <span className="flex items-center gap-2 text-[11px] text-krypt-muted">
              Using a picture instead of a frame.
              <button className="text-krypt-purple hover:underline" onClick={() => set({ bg: undefined })}>
                Use the frame
              </button>
            </span>
          )}
        </label>

        <div className="space-y-1">
          <span className="text-xs font-medium text-white/80">Look</span>
          <Seg value={c.look} options={COVER_LOOKS} onChange={(look) => set({ look })} />
          <span className="block text-[11px] text-krypt-muted">{COVER_LOOKS.find((l) => l.id === c.look)?.help}</span>
        </div>

        {c.look !== 'frame' && (
          <div className="flex flex-wrap gap-6">
            <div className="space-y-1">
              <span className="text-xs font-medium text-white/80">Place</span>
              <Seg value={c.place} options={COVER_PLACES} onChange={(place) => set({ place })} />
            </div>
            <div className="space-y-1">
              <span className="text-xs font-medium text-white/80">Accent colour</span>
              <div className="flex gap-1.5">
                {COVER_COLORS.map((col) => (
                  <button key={col} onClick={() => set({ color: col })} className={cls('h-6 w-6 rounded-full ring-2 transition', c.color === col ? 'ring-white' : 'ring-transparent hover:ring-white/40')} style={{ background: col }} aria-label={col} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <PrimaryButton onClick={() => void save()} disabled={saving || same}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : same ? <Check className="h-4 w-4" /> : null}
            {same ? 'Saved' : 'Save cover'}
          </PrimaryButton>
          {saved?.path && (
            <GhostButton onClick={() => void window.marketo.app.showItemInFolder(saved.path!)}>
              <FolderOpen className="h-4 w-4" /> Show file
            </GhostButton>
          )}
        </div>
      </div>
    </Card>
  );
}

function ReelCovers({ reels }: { reels: Reel[] }) {
  const [pick, setPick] = useState<string | null>(null);
  const { shown, more } = useShowMore(reels, 'covers', 24);
  const chosen = reels.find((r) => r.id === pick) ?? null;
  if (!reels.length)
    return (
      <Empty icon={<ImageIcon className="h-6 w-6" />} title="No reels yet">
        Make a reel in Studio (or let your AI make one) and its cover can be made here.
      </Empty>
    );
  return (
    <div className="space-y-5">
      {chosen && <CoverEditor reel={chosen} />}
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {shown.map((r) => (
          <button key={r.id} onClick={() => setPick(r.id)} className={cls('group space-y-1 text-left', pick === r.id && 'opacity-100')}>
            <div className={cls('relative aspect-[9/16] overflow-hidden rounded-lg ring-2 transition', pick === r.id ? 'ring-krypt-purple' : 'ring-transparent group-hover:ring-white/20')}>
              {r.cover?.path ? <img src={fresh(r.cover.path, r.cover.at)} alt="" className="h-full w-full object-cover" /> : <ReelThumb reel={r} className="h-full w-full" />}
              <span className={cls('absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider', r.cover?.path ? 'bg-emerald-500/80 text-white' : 'bg-black/60 text-white/70')}>
                {r.cover?.path ? 'Cover' : 'No cover'}
              </span>
            </div>
            <div className="truncate text-[11px] text-white/70">{r.title}</div>
          </button>
        ))}
      </div>
      {more}
    </div>
  );
}

/** A long video's 16:9 thumbnail: its words, and draw it again. */
function LongThumb({ v }: { v: LongVideo }) {
  const toast = useApp((s) => s.toast);
  const [text, setText] = useState(v.thumbnailText ?? '');
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(0);
  useEffect(() => setText(v.thumbnailText ?? ''), [v.id, v.thumbnailText]);
  const draw = async (): Promise<void> => {
    setBusy(true);
    try {
      if (text !== (v.thumbnailText ?? '')) {
        const r = await window.marketo.render.setLongThumbText(v.id, text);
        if (!r.ok) throw new Error(r.message ?? 'Saving the words failed.');
      }
      const png = await renderThumbnail({ ...v, thumbnailText: text || undefined });
      const r = await window.marketo.render.saveLongThumb(v.id, png);
      if (!r.ok) throw new Error(r.message ?? 'Saving the thumbnail failed.');
      setStamp(Date.now());
      toast('ok', 'Thumbnail saved.');
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card className="space-y-3">
      <div className="aspect-video overflow-hidden rounded-lg bg-black/40 ring-1 ring-white/10">
        {v.thumbnailPath ? <img src={`${fresh(v.thumbnailPath, v.updatedAt)}${stamp}`} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-xs text-krypt-muted">No thumbnail yet</div>}
      </div>
      <div className="truncate text-sm font-semibold text-white">{v.title}</div>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="2-5 words, one in *stars*"
          className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-1.5 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-krypt-purple/60"
        />
        <GhostButton small onClick={() => void draw()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Draw
        </GhostButton>
      </div>
    </Card>
  );
}

export default function Thumbnails() {
  const db = useApp((s) => s.db);
  const [tab, setTab] = useState<'reels' | 'long'>('reels');
  const reels = useMemo(() => [...(db?.reels ?? [])].filter((r) => r.preset !== 'slides').sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1)), [db?.reels]);
  const longs = db?.longVideos ?? [];
  if (!db) return null;
  const on = db.settings.covers !== false;
  const withCover = reels.filter((r) => r.cover?.path).length;
  return (
    <Page title="Thumbnails" subtitle="Covers for your Shorts and reels, and thumbnails for long videos. A good cover gets the tap from the grid, the Shorts shelf and search.">
      <div className="space-y-5">
        <Card className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="text-sm font-semibold text-white">Custom covers on posts</div>
            <p className="text-xs leading-relaxed text-krypt-muted">
              Your AI makes a cover for each reel (its strongest frame and a few big words) and sets it when it posts on Instagram, TikTok, Facebook and YouTube Shorts. YouTube gives Shorts thumbnails to some channels only; where it can't, the post goes up with
              YouTube's own pick. Threads, X and Pinterest show the video itself. {reels.length ? `${withCover} of ${reels.length} reels have one.` : ''}
            </p>
          </div>
          <Toggle on={on} onChange={(v) => void window.marketo.db.updateSettings({ covers: v })} />
        </Card>

        <div className="flex gap-1">
          {(
            [
              ['reels', `Shorts & reels (${reels.length})`],
              ['long', `Long videos (${longs.length})`],
            ] as const
          ).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={cls('rounded-lg px-3 py-1.5 text-sm font-medium transition', tab === id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80')}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'reels' ? (
          <ReelCovers reels={reels} />
        ) : longs.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {longs.map((v) => (
              <LongThumb key={v.id} v={v} />
            ))}
          </div>
        ) : (
          <Empty icon={<ImageIcon className="h-6 w-6" />} title="No long videos yet">
            Long videos (Create &gt; Long videos) get their 16:9 thumbnail here.
          </Empty>
        )}
      </div>
    </Page>
  );
}
