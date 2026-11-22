import { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, Plus, X } from 'lucide-react';
import type { IgAccount, Site } from '@shared/types';
import { SITE_LABEL, localDate, quotaLabel, sameHandle } from '@shared/warmup';
import { SITE_COLOR, SITE_ICON, TONE_DOT, TONE_TEXT, accountSites, openSite, type SiteState } from '../lib/platforms';
import { cls, fmtNum } from '../lib/format';
import { useApp } from '../state/store';
import { GhostButton, PrimaryButton } from './ui';
import { GoalPicker } from './GoalPicker';
import { YtChannelPicker } from './YtChannelPicker';

// Home > click a platform: that platform for this account in one place. Today against its limits, the last 7 days,
// followers, recent posts, the user's own instructions for the AI there (get_today and browser_open pass them on),
// and on YouTube the channels that share this account's Chrome profile (one Google sign-in, many channels).

const DAYS = 7;

function Mini({ label, m }: { label: string; m?: { done: number; cap: number } }) {
  if (!m) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-krypt-muted">{label}</div>
      <div className="font-mono text-base text-white">
        {Math.round(m.done)}
        <span className="text-krypt-muted">/{m.cap}</span>
      </div>
    </div>
  );
}

export function PlatformPanel({ a, s, onClose }: { a: IgAccount; s: SiteState; onClose: () => void }) {
  const db = useApp((x) => x.db!);
  const browser = useApp((x) => x.browser);
  // YouTube: each channel is its own account; picking one in the channel list shows that one here.
  const [pickedId, setPickedId] = useState(a.id);
  const cur = db.igAccounts.find((x) => x.id === pickedId) ?? a;
  const curS = cur.id === a.id ? s : accountSites(cur, browser.find((b) => b.accountId === cur.id), db).find((x) => x.site === s.site) ?? s;
  return <PanelBody key={cur.id} a={cur} s={curS} home={a} onPick={setPickedId} onClose={onClose} />;
}

function PanelBody({ a, s, home, onPick, onClose }: { a: IgAccount; s: SiteState; home: IgAccount; onPick: (id: string) => void; onClose: () => void }) {
  const db = useApp((x) => x.db!);
  const toast = useApp((x) => x.toast);
  const site: Site = s.site;
  const Icon = SITE_ICON[site];
  const color = SITE_COLOR[site];
  const L = SITE_LABEL[site];
  const saved = a.platformNotes?.[site] ?? '';
  const [note, setNote] = useState(saved);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  // The last 7 days on this platform, newest first.
  const days = useMemo(() => {
    const out: Array<{ day: string; minutes: number; likes: number; follows: number; comments: number; posts: number }> = [];
    for (let i = 0; i < DAYS; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const day = localDate(d);
      const list = db.sessions.filter((x) => (x.site ?? 'instagram') === site && sameHandle(x.handle, a.handle) && localDate(x.startedAt) === day);
      const sum = (k: 'minutes' | 'likes' | 'follows' | 'comments'): number => list.reduce((n, x) => n + (x[k] ?? 0), 0);
      const posts = site === 'youtube' ? (a.youtube?.uploads ?? []).filter((u) => localDate(u) === day).length : list.reduce((n, x) => n + (x.posts ?? (x.kind === 'post' ? 1 : 0)), 0);
      out.push({ day, minutes: Math.round(sum('minutes')), likes: sum('likes'), follows: sum('follows'), comments: sum('comments'), posts });
    }
    return out;
  }, [db.sessions, a, site]);

  const snaps = db.accounts.filter((x) => (x.site ?? 'instagram') === site && sameHandle(x.handle, a.handle)).sort((x, y) => x.at.localeCompare(y.at));
  const last = snaps[snaps.length - 1];
  const weekAgo = [...snaps].reverse().find((x) => Date.now() - Date.parse(x.at) >= DAYS * 86_400_000);
  const posts = db.posts
    .filter((p) => p.site === site && sameHandle(p.handle, a.handle))
    .sort((x, y) => (y.postedAt ?? y.addedAt).localeCompare(x.postedAt ?? x.addedAt))
    .slice(0, 6);

  const saveNote = async (): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.db.saveAccount({ id: a.id, platformNotes: { ...(a.platformNotes ?? {}), [site]: note.trim() || undefined } });
    setBusy(false);
    toast(r.ok ? 'ok' : 'error', r.ok ? (note.trim() ? `Saved. The AI follows these on ${L} from the next run.` : `Cleared the ${L} instructions.`) : r.message ?? 'Could not save.');
  };

  const showEngagement = site !== 'youtube';
  return (
    <div className="fixed inset-0 z-[90] flex justify-end bg-black/50 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label={`${L} for ${a.handle}`} className="flex h-full w-[560px] max-w-full animate-pop-in flex-col overflow-y-auto border-l border-white/10 bg-krypt-panel shadow-krypt-card">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-krypt-panel/95 px-5 py-4 backdrop-blur">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10" style={{ background: `${color}22` }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              {L}
              <span className={cls('h-2 w-2 rounded-full', TONE_DOT[s.tone])} />
              <span className={cls('text-xs font-normal', TONE_TEXT[s.tone])}>{s.state}</span>
            </div>
            <div className="truncate font-mono text-xs text-krypt-muted">
              {a.handle} · {s.who}
            </div>
          </div>
          <GhostButton small onClick={() => void openSite(a.id, site)}>
            <ExternalLink className="h-3.5 w-3.5" /> Open in Chrome
          </GhostButton>
          <button aria-label="Close" onClick={onClose} className="rounded p-1 text-krypt-muted hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Today</h3>
            <div className="grid grid-cols-3 gap-2">
              <Mini label="posts" m={{ done: s.posts.done, cap: s.posts.target }} />
              {showEngagement && <Mini label={site === 'pinterest' ? 'reactions' : 'likes'} m={s.likes} />}
              {showEngagement && <Mini label="follows" m={s.follows} />}
              {showEngagement && <Mini label={quotaLabel('saves', site)} m={s.saves} />}
              {showEngagement && <Mini label={quotaLabel('comments', site)} m={s.comments} />}
              {showEngagement && <Mini label="minutes" m={s.minutes} />}
            </div>
            {s.day ? <p className="text-xs text-krypt-muted">Warm-up day {s.day} · {s.phase}</p> : null}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Last 7 days</h3>
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-krypt-muted">
                  <tr>
                    <th className="px-3 py-2 font-normal">Day</th>
                    <th className="px-2 py-2 text-right font-normal">Posts</th>
                    {showEngagement && <th className="px-2 py-2 text-right font-normal">Min</th>}
                    {showEngagement && <th className="px-2 py-2 text-right font-normal">Likes</th>}
                    {showEngagement && <th className="px-2 py-2 text-right font-normal">Follows</th>}
                    {showEngagement && <th className="px-3 py-2 text-right font-normal">{site === 'x' || site === 'threads' ? 'Replies' : 'Comments'}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-white/85">
                  {days.map((d, i) => (
                    <tr key={d.day}>
                      <td className="px-3 py-1.5">{i === 0 ? 'Today' : new Date(d.day + 'T12:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                      <td className="px-2 py-1.5 text-right">{d.posts || '·'}</td>
                      {showEngagement && <td className="px-2 py-1.5 text-right">{d.minutes || '·'}</td>}
                      {showEngagement && <td className="px-2 py-1.5 text-right">{d.likes || '·'}</td>}
                      {showEngagement && <td className="px-2 py-1.5 text-right">{d.follows || '·'}</td>}
                      {showEngagement && <td className="px-3 py-1.5 text-right">{d.comments || '·'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-krypt-muted">
              {last
                ? `${fmtNum(last.followers)} followers${weekAgo ? ` (${last.followers - weekAgo.followers >= 0 ? '+' : ''}${fmtNum(last.followers - weekAgo.followers)} in a week)` : ''} · ${fmtNum(last.following)} following, as of ${new Date(last.at).toLocaleDateString()}`
                : 'No follower count read yet on this platform.'}
            </p>
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Recent posts</h3>
            {posts.length ? (
              <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
                {posts.map((p) => (
                  <li key={p.id}>
                    <button onClick={() => void window.marketo.app.openExternal(p.url)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.03]">
                      <span className="min-w-0 flex-1 truncate text-sm text-white/85">{p.title || p.url}</span>
                      <span className="shrink-0 font-mono text-[11px] text-krypt-muted">
                        {p.views != null ? `${fmtNum(p.views)} views` : ''}
                        {p.likes != null ? ` · ${fmtNum(p.likes)} likes` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-krypt-muted">Nothing logged on {L} yet.</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Goal on {L}</h3>
            <GoalPicker a={a} site={site} />
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Your instructions for the AI on {L}</h3>
            <textarea
              className="input min-h-[110px] text-sm leading-relaxed"
              maxLength={2000}
              placeholder={PLACEHOLDER[site]}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-krypt-muted">Every run gets these for {a.handle} on {L}, on top of the usual rules. Your limits still apply.</p>
              <PrimaryButton disabled={busy || note.trim() === saved.trim()} onClick={() => void saveNote()}>
                <Check className="h-4 w-4" /> Save
              </PrimaryButton>
            </div>
          </section>

          {site === 'youtube' && <YtChannels a={home} current={a.id} onPick={onPick} />}
        </div>
      </div>
    </div>
  );
}

const PLACEHOLDER: Record<Site, string> = {
  instagram: 'e.g. Reply to every comment on our reels first. Engage with memecoin and on-chain accounts, not general finance.',
  youtube: 'e.g. Titles under 50 characters, no #Shorts tag. Always pin a comment with the tool link.',
  x: 'e.g. Reply to big crypto accounts within their first hour. Never quote-tweet.',
  tiktok: 'e.g. Post in the evening. Comment on trading-setup videos, not giveaways.',
  facebook: 'e.g. Post reels to the Page only, never to groups.',
  threads: 'e.g. Short text threads between reels, one question each.',
  pinterest: 'e.g. Save to the Trading tools board. Keywords first in every title.',
};

/** YouTube: the channels of the Google sign-in in this account's Chrome profile (click one to see it here), and adding another. */
function YtChannels({ a, current, onPick }: { a: IgAccount; current: string; onPick: (id: string) => void }) {
  const db = useApp((x) => x.db!);
  const toast = useApp((x) => x.toast);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const peers = db.igAccounts.filter((x) => x.youtube?.enabled && (x.id === a.id || (!!a.chromeDir && x.chromeDir === a.chromeDir)));
  const add = async (): Promise<void> => {
    if (!link.trim()) return;
    setBusy(true);
    const r = await window.marketo.db.addYtChannel(a.id, link);
    setBusy(false);
    if (!r.ok || !r.data) {
      toast('error', r.message ?? 'Could not add that channel.');
      return;
    }
    setLink('');
    toast('ok', `Added ${r.data.youtube?.channelName ?? r.data.handle} as ${r.data.handle}. Write its own instructions above; the hub switches channels itself.`);
    onPick(r.data.id);
  };
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Channels in this Chrome profile</h3>
      {peers.length > 1 && <p className="text-xs text-krypt-muted">Click a channel to see its numbers and write its own instructions above.</p>}
      <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
        {peers.map((x) => {
          const y = x.youtube!;
          const today = (y.uploads ?? []).filter((u) => localDate(u) === localDate()).length;
          return (
            <li key={x.id}>
              <button onClick={() => onPick(x.id)} className={cls('flex w-full items-center gap-3 px-3 py-2 text-left transition', x.id === current ? 'bg-krypt-purple/15' : 'hover:bg-white/[0.03]')}>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">{y.channelName ?? (y.channelHandle ? '@' + y.channelHandle : 'Channel not set')}</div>
                <div className="truncate font-mono text-[11px] text-krypt-muted">
                  {x.handle}
                  {x.id === current ? ' · showing' : ''}
                  {x.platformNotes?.youtube?.trim() ? ' · own instructions' : ''}
                  {y.channelHandle ? ` · @${y.channelHandle}` : ''}
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-krypt-muted">{today} today</span>
              </button>
            </li>
          );
        })}
      </ul>
      <YtChannelPicker accountId={a.id} />
      <div className="flex gap-2">
        <input className="input flex-1 text-sm" placeholder="Or paste a channel link, e.g. youtube.com/@mychannel" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} />
        <PrimaryButton disabled={busy || !link.trim()} onClick={() => void add()}>
          <Plus className="h-4 w-4" /> {busy ? 'Adding…' : 'Add channel'}
        </PrimaryButton>
      </div>
      <p className="text-xs leading-relaxed text-krypt-muted">
        One Google account can own many channels: youtube.com/channel_switcher lists yours (make new ones there with "Create a channel"). Each channel you add becomes its own account here, YouTube only, in this same Chrome profile, starting with {a.handle}'s styles. Set its own styles, limits and instructions on its account. Before every upload the hub switches YouTube Studio to the right channel.
      </p>
      <GhostButton small onClick={() => void window.marketo.browser.open(a.id, 'https://www.youtube.com/channel_switcher', 'youtube')}>
        <ExternalLink className="h-3.5 w-3.5" /> See my channels
      </GhostButton>
    </section>
  );
}
