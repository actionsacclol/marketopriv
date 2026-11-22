import { useEffect, useState } from 'react';
import { Check, Clapperboard, ExternalLink, FolderOpen, PenLine, Trash2, X } from 'lucide-react';
import type { LinkSite } from '@shared/types';
import { linkPatch } from '@shared/warmup';
import type { Reel, ReelStatus } from '@shared/types';
import { timingFor } from '@shared/presets';
import { formatById } from '@shared/formats';
import { pct, resultOf } from '@shared/score';
import { Card, Empty, GhostButton, Page, PrimaryButton, StatusChip } from '../components/ui';
import { ReelThumb } from '../components/ReelThumb';
import { DeleteReelsDialog } from '../components/DeleteReels';
import { useShowMore } from '../components/ShowMore';
import { useApp } from '../state/store';
import { cls, fmtDate, fmtNum, shortUrl } from '../lib/format';

const FILTERS: Array<ReelStatus | 'all'> = ['all', 'draft', 'rendered', 'posted'];

const LINK_FIELDS: Array<{ site: LinkSite; label: string; host: RegExp; placeholder: string }> = [
  { site: 'facebook', label: 'Facebook Reel', host: /^https?:\/\/([a-z0-9-]+\.)?(facebook\.com|fb\.watch)\//i, placeholder: 'https://www.facebook.com/reel/…' },
  { site: 'threads', label: 'Threads post', host: /^https?:\/\/([a-z0-9-]+\.)?threads\.(com|net)\//i, placeholder: 'https://www.threads.com/@…/post/…' },
  { site: 'pinterest', label: 'Pinterest Pin', host: /^https?:\/\/([a-z0-9-]+\.)?(pinterest\.[a-z.]+|pin\.it)\//i, placeholder: 'https://www.pinterest.com/pin/…' },
];

/** The link of the reel on Facebook, Threads or Pinterest. */
function LinkField({ reel, f }: { reel: Reel; f: (typeof LINK_FIELDS)[number] }) {
  const toast = useApp((s) => s.toast);
  const saved = reel.links?.[f.site]?.url ?? '';
  const [v, setV] = useState(saved);
  useEffect(() => setV(saved), [reel.id, saved]);
  const save = async (): Promise<void> => {
    if (!f.host.test(v)) return toast('warn', `Paste the link of the ${f.label}.`);
    const r = await window.marketo.db.updateReel(reel.id, { status: 'posted', ...linkPatch(reel, f.site, v, reel.links?.[f.site]?.at ?? new Date().toISOString()) });
    if (r.ok) toast('ok', `${f.label} saved.`);
  };
  return (
    <div>
      <label className="label">{f.label}</label>
      <div className="flex gap-2">
        <input className="input font-mono text-xs" value={v} onChange={(e) => setV(e.target.value)} placeholder={f.placeholder} />
        <PrimaryButton onClick={() => void save()} className="shrink-0 px-3 py-2 text-xs">
          {saved ? 'Update' : 'Save'}
        </PrimaryButton>
      </div>
    </div>
  );
}

function Detail({ reel, onDelete }: { reel: Reel; onDelete: () => void }) {
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const [url, setUrl] = useState(reel.postedUrl ?? '');
  useEffect(() => setUrl(reel.postedUrl ?? ''), [reel.id, reel.postedUrl]);
  const [xUrl, setXUrl] = useState(reel.xUrl ?? '');
  useEffect(() => setXUrl(reel.xUrl ?? ''), [reel.id, reel.xUrl]);
  const [ttUrl, setTtUrl] = useState(reel.tiktokUrl ?? '');
  useEffect(() => setTtUrl(reel.tiktokUrl ?? ''), [reel.id, reel.tiktokUrl]);
  const [shorts, setShorts] = useState(reel.shortsUrl ?? '');
  useEffect(() => setShorts(reel.shortsUrl ?? ''), [reel.id, reel.shortsUrl]);
  const latest = reel.metrics?.[reel.metrics.length - 1];
  const result = resultOf(reel);
  const markPosted = async (): Promise<void> => {
    if (!/^https?:\/\//.test(url)) return toast('warn', 'Paste the Instagram URL of the live reel.');
    const r = await window.marketo.db.markPosted(reel.id, 'instagram', url);
    if (r.ok) toast('ok', 'Marked as posted.');
  };
  const markX = async (): Promise<void> => {
    if (!/^https?:\/\/([a-z0-9-]+\.)?(x|twitter)\.com\//i.test(xUrl)) return toast('warn', 'Paste the link of the post on X.');
    const r = await window.marketo.db.markPosted(reel.id, 'x', xUrl);
    if (r.ok) toast('ok', 'X post saved.');
  };
  const markTt = async (): Promise<void> => {
    if (!/^https?:\/\/([a-z0-9-]+\.)?tiktok\.com\//i.test(ttUrl)) return toast('warn', 'Paste the link of the video on TikTok.');
    const r = await window.marketo.db.markPosted(reel.id, 'tiktok', ttUrl);
    if (r.ok) toast('ok', 'TikTok link saved.');
  };
  const markShort = async (): Promise<void> => {
    if (!/^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be)\//i.test(shorts)) return toast('warn', 'Paste the YouTube link of the live Short.');
    const r = await window.marketo.db.markPosted(reel.id, 'youtube', shorts);
    if (r.ok) toast('ok', 'Short saved.');
  };
  return (
    <Card className="sticky top-0 space-y-4">
      {reel.renderPath ? (
        <video key={reel.renderPath + reel.renderedAt} src={window.marketo.app.mediaUrl(reel.renderPath)} controls className="mx-auto aspect-[9/16] max-h-[460px] rounded-xl bg-black" />
      ) : (
        <div className="mx-auto max-w-[260px]">
          <ReelThumb reel={reel} className="rounded-xl" />
        </div>
      )}
      <div>
        <div className="flex items-center gap-2">
          <div className="truncate text-lg font-semibold">{reel.title}</div>
          <StatusChip status={reel.status} />
        </div>
        <div className="mt-1 font-mono text-xs text-krypt-muted">
          {reel.format ? formatById(reel.format)?.name ?? reel.format : reel.preset} · {timingFor(reel.preset, reel.fields).total.toFixed(1)}s{reel.renderedAt ? ` · rendered ${fmtDate(reel.renderedAt)}` : ''}
          {reel.trial ? ' · trial reel' : ''}
        </div>
        {reel.group && (
          <div className="mt-1 text-xs text-krypt-muted">
            Hook test version <span className="font-mono text-white">{reel.variant}</span>
            {reel.hook ? `: ${reel.hook}` : ''}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <GhostButton small onClick={() => go('studio', reel.id)}>
          <PenLine className="h-3.5 w-3.5" /> Edit in Studio
        </GhostButton>
        {reel.renderPath && (
          <GhostButton small onClick={() => void window.marketo.app.showItemInFolder(reel.renderPath!)}>
            <FolderOpen className="h-3.5 w-3.5" /> Show file
          </GhostButton>
        )}
        {reel.postedUrl && (
          <GhostButton small onClick={() => void window.marketo.app.openExternal(reel.postedUrl!)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open post
          </GhostButton>
        )}
        {reel.xUrl && (
          <GhostButton small onClick={() => void window.marketo.app.openExternal(reel.xUrl!)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open on X
          </GhostButton>
        )}
        {reel.tiktokUrl && (
          <GhostButton small onClick={() => void window.marketo.app.openExternal(reel.tiktokUrl!)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open on TikTok
          </GhostButton>
        )}
        {reel.shortsUrl && (
          <GhostButton small onClick={() => void window.marketo.app.openExternal(reel.shortsUrl!)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open Short
          </GhostButton>
        )}
        {LINK_FIELDS.filter((f) => reel.links?.[f.site]).map((f) => (
          <GhostButton key={f.site} small onClick={() => void window.marketo.app.openExternal(reel.links![f.site]!.url)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open on {f.label.split(' ')[0]}
          </GhostButton>
        ))}
        <GhostButton small destructive className="ml-auto" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </GhostButton>
      </div>
      {reel.caption && (
        <div className="rounded-xl border border-white/10 bg-black/30 p-3 text-sm text-white/85">
          {reel.caption}
          {reel.hashtags?.length ? <div className="mt-2 font-mono text-xs text-krypt-purple">{reel.hashtags.join(' ')}</div> : null}
        </div>
      )}
      <div>
        <label className="label">Live URL</label>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/reel/…" />
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-krypt-muted" title="Posted as a Trial Reel (shown to non-followers first)">
            <input type="checkbox" checked={reel.trial === true} onChange={(e) => void window.marketo.db.updateReel(reel.id, { trial: e.target.checked })} /> Trial
          </label>
          <PrimaryButton onClick={() => void markPosted()} className="shrink-0 px-3 py-2 text-xs">
            {reel.status === 'posted' ? 'Update' : 'Mark posted'}
          </PrimaryButton>
        </div>
      </div>
      <div>
        <label className="label">X post</label>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" value={xUrl} onChange={(e) => setXUrl(e.target.value)} placeholder="https://x.com/…/status/…" />
          <PrimaryButton onClick={() => void markX()} className="shrink-0 px-3 py-2 text-xs">
            {reel.xUrl ? 'Update' : 'Save'}
          </PrimaryButton>
        </div>
      </div>
      <div>
        <label className="label">TikTok video</label>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" value={ttUrl} onChange={(e) => setTtUrl(e.target.value)} placeholder="https://www.tiktok.com/@…/video/…" />
          <PrimaryButton onClick={() => void markTt()} className="shrink-0 px-3 py-2 text-xs">
            {reel.tiktokUrl ? 'Update' : 'Save'}
          </PrimaryButton>
        </div>
      </div>
      {LINK_FIELDS.map((f) => (
        <LinkField key={f.site} reel={reel} f={f} />
      ))}
      <div>
        <label className="label">YouTube Short</label>
        <div className="flex gap-2">
          <input className="input font-mono text-xs" value={shorts} onChange={(e) => setShorts(e.target.value)} placeholder="https://youtube.com/shorts/…" />
          <PrimaryButton onClick={() => void markShort()} className="shrink-0 px-3 py-2 text-xs">
            {reel.shortsUrl ? 'Update' : 'Save'}
          </PrimaryButton>
        </div>
      </div>
      <div>
        <label className="label">Metrics</label>
        {latest && result ? (
          <>
            <div className="grid grid-cols-3 gap-2 font-mono text-sm">
              {[
                ['score', String(result.score)],
                ['hold', pct(result.hold, 0)],
                ['skip', latest.skipRate === undefined ? '—' : `${latest.skipRate}%`],
                ['views', fmtNum(latest.views)],
                ['reach', fmtNum(latest.reach)],
                ['avg watch', latest.avgWatch === undefined ? '—' : `${latest.avgWatch.toFixed(1)}s`],
                ...(['likes', 'comments', 'saves', 'shares', 'follows'] as const).map((k) => [k, fmtNum(latest[k])]),
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-krypt-muted">{k}</div>
                  <div>{v}</div>
                </div>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-krypt-muted">
              {reel.metrics!.length} snapshot{reel.metrics!.length === 1 ? '' : 's'} · latest {fmtDate(latest.at)}{latest.site ? ` (${latest.site})` : ''}
            </div>
          </>
        ) : (
          <div className="text-xs text-krypt-muted">None yet. Once it's live, ask Claude to read the numbers off Instagram (record_reel_metrics).</div>
        )}
      </div>
    </Card>
  );
}

export default function Library() {
  const db = useApp((s) => s.db)!;
  const selected = useApp((s) => s.selectedReel);
  const select = useApp((s) => s.select);
  const [filter, setFilter] = useState<ReelStatus | 'all'>('all');
  const reels = db.reels.filter((r) => filter === 'all' || r.status === filter);
  // Long lists 50 at a time (Setup > Performance): only the grid pages; Select all still takes every reel in `reels`.
  const page = useShowMore(reels, filter);
  const current = db.reels.find((r) => r.id === selected) ?? reels[0];
  // Ticked reels (for deleting several at once) and the ones the dialog is asking about.
  const [picked, setPicked] = useState<string[]>([]);
  const [asking, setAsking] = useState<Reel[] | null>(null);
  const chosen = db.reels.filter((r) => picked.includes(r.id));
  const toggle = (id: string): void => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // Delete key: the ticked reels, or the one that is open. Escape clears the ticks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null;
      if (asking || (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))) return;
      if (e.key === 'Delete') {
        const list = chosen.length ? chosen : current ? [current] : [];
        if (list.length) setAsking(list);
      } else if (e.key === 'Escape') setPicked([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <Page
      title="Library"
      subtitle="Every reel, its file, caption, live link and numbers."
      actions={
        <>
        {chosen.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-krypt-purple/40 bg-krypt-purple/10 px-3 py-1.5 text-xs">
            <span className="font-semibold text-white">{chosen.length} selected</span>
            <button className="text-krypt-muted hover:text-white" onClick={() => setPicked(reels.map((r) => r.id))}>
              Select all {reels.length}
            </button>
            <button className="text-krypt-muted hover:text-white" onClick={() => setPicked([])}>
              Clear
            </button>
            <GhostButton small destructive onClick={() => setAsking(chosen)}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </GhostButton>
          </div>
        )}
        <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cls('rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition', filter === f ? 'bg-white/10 text-white' : 'text-krypt-muted hover:text-white')}>
              {f} <span className="font-mono text-[10px] text-krypt-muted">{f === 'all' ? db.reels.length : db.reels.filter((r) => r.status === f).length}</span>
            </button>
          ))}
        </div>
        </>
      }
    >
      {db.reels.length === 0 ? (
        <Empty icon={<Clapperboard className="h-6 w-6" />} title="Nothing here yet">Reels you make in Studio (or your AI makes) show up here.</Empty>
      ) : (
        <div className="grid grid-cols-[1fr_400px] gap-6">
          <div className="grid grid-cols-3 content-start gap-4 xl:grid-cols-4 2xl:grid-cols-5">
            {page.shown.map((r) => {
              const ticked = picked.includes(r.id);
              return (
                <div key={r.id} className="group relative" data-reel={r.id}>
                  <button onClick={() => select(r.id)} className="block w-full text-left">
                    <ReelThumb reel={r} className={cls('rounded-xl border transition', ticked ? 'border-krypt-purple' : r.id === current?.id ? 'border-krypt-purple shadow-krypt-glow' : 'border-white/10 group-hover:border-white/25')} />
                    <div className="mt-2 truncate text-sm font-medium">{r.title}</div>
                    <div className="mt-1 flex items-center gap-2">
                      <StatusChip status={r.status} />
                      {r.postedUrl && <span className="truncate font-mono text-[10px] text-krypt-muted">{shortUrl(r.postedUrl)}</span>}
                    </div>
                  </button>
                  <button
                    title={ticked ? 'Unselect' : 'Select (to delete several at once)'}
                    aria-label={ticked ? 'Unselect' : 'Select'}
                    onClick={() => toggle(r.id)}
                    className={cls('absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-md border transition', ticked ? 'border-krypt-purple bg-krypt-purple text-white' : 'border-white/40 bg-black/60 text-transparent hover:text-white/70', !ticked && !picked.length && 'opacity-0 group-hover:opacity-100')}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button title="Delete" aria-label="Delete reel" onClick={() => setAsking([r])} className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md border border-white/20 bg-black/70 text-white/80 opacity-0 transition hover:border-rose-400/60 hover:bg-rose-500/30 hover:text-rose-100 group-hover:opacity-100">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            {page.more && <div className="col-span-full">{page.more}</div>}
            {reels.length === 0 && (
              <div className="col-span-full flex items-center gap-2 py-10 text-sm text-krypt-muted">
                <X className="h-4 w-4" /> No {filter} reels.
              </div>
            )}
          </div>
          <div>{current && <Detail reel={current} onDelete={() => setAsking([current])} />}</div>
        </div>
      )}
      {asking && (
        <DeleteReelsDialog
          reels={asking}
          onClose={(deleted) => {
            if (deleted) {
              const gone = asking.map((r) => r.id);
              setPicked((p) => p.filter((id) => !gone.includes(id)));
              if (selected && gone.includes(selected)) select(null);
            }
            setAsking(null);
          }}
        />
      )}
    </Page>
  );
}
