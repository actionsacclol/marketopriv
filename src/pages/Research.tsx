import { useEffect, useState } from 'react';
import { BookOpen, Bookmark, ChevronDown, ExternalLink, Eye, Heart, MessageCircle, Repeat2, Send, Trash2, UserPlus } from 'lucide-react';
import type { ResearchDoc, Session, SessionAction } from '@shared/types';
import { Card, Empty, GhostButton, Page, Section, Tag } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { useApp } from '../state/store';
import { RefVideosView } from './RefVideos';
import { cls, fmtDate, shortUrl } from '../lib/format';
import { SITE_LABEL } from '@shared/warmup';

const ACTION_ICON: Record<SessionAction, typeof Heart> = { watch: Eye, like: Heart, save: Bookmark, follow: UserPlus, comment: MessageCircle, repost: Repeat2, message: Send };
const ACTION_COLOR: Record<SessionAction, string> = { watch: 'text-white/40', like: 'text-rose-300', save: 'text-krypt-purple', follow: 'text-emerald-300', comment: 'text-amber-300', repost: 'text-sky-300', message: 'text-cyan-300' };

const open = (url: string): void => void window.marketo.app.openExternal(url);

function SessionCard({ s, initiallyOpen }: { s: Session; initiallyOpen: boolean }) {
  const [openState, setOpen] = useState(initiallyOpen);
  const [only, setOnly] = useState<SessionAction | null>(null);
  const items = s.items.filter((i) => !only || i.actions.includes(only));
  return (
    <Card padded={false}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-4 px-5 py-4 text-left">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold capitalize">{s.kind}</span>
            <span className="font-mono text-xs text-krypt-muted">{s.handle}{s.site && s.site !== 'instagram' ? ` · ${SITE_LABEL[s.site]}` : ''}</span>
            <span className="font-mono text-xs text-krypt-muted">· {fmtDate(s.startedAt)} · {s.minutes} min</span>
          </div>
          {s.niche && <div className="mt-1 truncate text-xs text-krypt-muted">{s.niche}</div>}
        </div>
        <div className="flex gap-3 font-mono text-xs">
          {(['watch', 'like', 'save', 'follow', 'comment'] as const).map((a) => {
            const Icon = ACTION_ICON[a];
            const n = a === 'watch' ? s.watched : s[`${a}s` as 'likes' | 'saves' | 'follows' | 'comments'];
            return (
              <span key={a} className={cls('flex items-center gap-1', ACTION_COLOR[a])}>
                <Icon className="h-3.5 w-3.5" /> {n}
              </span>
            );
          })}
        </div>
        <ChevronDown className={cls('h-4 w-4 text-krypt-muted transition', openState && 'rotate-180')} />
      </button>
      {openState && (
        <div className="border-t border-white/5 px-5 pb-4 pt-3">
          {s.notes && <div className="mb-3 text-sm text-white/80">{s.notes}</div>}
          <div className="mb-3 flex gap-1.5">
            {(['like', 'save', 'follow', 'comment'] as const).map((a) => (
              <button key={a} onClick={() => setOnly(only === a ? null : a)} className={cls('rounded-full border px-2.5 py-1 text-[11px] capitalize transition', only === a ? 'border-krypt-purple/60 bg-krypt-purple/15 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
                {a}s only
              </button>
            ))}
          </div>
          <div className="divide-y divide-white/5">
            {items.map((i) => (
              <div key={i.url} className="flex items-center gap-3 py-2">
                <div className="flex w-[92px] shrink-0 gap-1.5">
                  {i.actions.map((a) => {
                    const Icon = ACTION_ICON[a];
                    return <Icon key={a} className={cls('h-3.5 w-3.5', ACTION_COLOR[a])} />;
                  })}
                </div>
                <div className="w-[150px] shrink-0 truncate font-mono text-xs text-white/85">{i.creator ?? '—'}</div>
                <div className="min-w-0 flex-1 truncate text-sm text-white/80">{i.title ?? i.note ?? ''}</div>
                <button onClick={() => open(i.url)} className="flex shrink-0 items-center gap-1 font-mono text-[11px] text-krypt-muted hover:text-krypt-purple">
                  {shortUrl(i.url).replace('instagram.com', 'ig')} <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function SessionsView() {
  const db = useApp((s) => s.db)!;
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const tags = [...new Set(db.references.flatMap((r) => r.tags))].sort();
  const refs = db.references.filter((r) => (!tag || r.tags.includes(tag)) && (!q || `${r.creator} ${r.title} ${r.notes}`.toLowerCase().includes(q.toLowerCase())));
  return (
      <div className="grid gap-8 2xl:grid-cols-[1fr_520px]">
        <Section title={`Sessions · ${db.sessions.length}`}>
          {db.sessions.length === 0 ? (
            <Empty icon={<Eye className="h-6 w-6" />} title="No sessions yet">When your AI scrolls Instagram through Marketo, every post it touched is logged here.</Empty>
          ) : (
            <div className="space-y-3">
              {db.sessions.map((s, i) => (
                <SessionCard key={s.id} s={s} initiallyOpen={i === 0} />
              ))}
            </div>
          )}
        </Section>
        <Section title={`References · ${db.references.length}`}>
          <input className="input mb-3" placeholder="Search creator, title, notes" value={q} onChange={(e) => setQ(e.target.value)} />
          {tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <Tag key={t} onClick={() => setTag(tag === t ? null : t)}>
                  <span className={tag === t ? 'text-krypt-purple' : ''}>#{t}</span>
                </Tag>
              ))}
            </div>
          )}
          {refs.length === 0 ? (
            <Empty icon={<Bookmark className="h-6 w-6" />} title="No references">Saved posts from sessions land here automatically.</Empty>
          ) : (
            <div className="space-y-2">
              {refs.map((r) => (
                <Card key={r.id} padded={false} className="group flex items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-white">{r.creator ?? '—'}</span>
                      <span className="text-[10px] text-krypt-muted">{fmtDate(r.savedAt)}</span>
                    </div>
                    {r.title && <div className="mt-0.5 text-sm text-white/85">{r.title}</div>}
                    {r.notes && <div className="mt-0.5 text-xs text-krypt-muted">{r.notes}</div>}
                  </div>
                  <button onClick={() => open(r.url)} className="mt-0.5 text-krypt-muted hover:text-krypt-purple" title={r.url}>
                    <ExternalLink className="h-4 w-4" />
                  </button>
                  <button onClick={() => void window.marketo.db.deleteReference(r.id)} className="mt-0.5 text-krypt-muted opacity-0 transition hover:text-rose-300 group-hover:opacity-100" title="Remove">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </Card>
              ))}
            </div>
          )}
        </Section>
      </div>
  );
}

function PlaybookView() {
  const [docs, setDocs] = useState<ResearchDoc[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const toast = useApp((s) => s.toast);
  /** The note whose Delete was pressed once: a second press deletes it. */
  const [sure, setSure] = useState<string | null>(null);
  const load = (): void => void window.marketo.research.docs().then(setDocs);
  useEffect(load, []);
  const remove = async (file: string): Promise<void> => {
    if (sure !== file) return setSure(file);
    setSure(null);
    const r = await window.marketo.research.deleteNote(file);
    if (!r.ok) return toast('error', r.message ?? 'Could not delete the note.');
    toast('ok', 'Note deleted. The file is kept in the playbook’s "deleted" folder.');
    setCurrent(null);
    load();
  };
  const doc = docs.find((d) => d.file === current) ?? docs.find((d) => /playbook/i.test(d.file)) ?? docs[0];
  if (!docs.length) return <Empty icon={<BookOpen className="h-6 w-6" />} title="No research docs">Add markdown files to the research/ folder.</Empty>;
  return (
    <div className="grid gap-8 xl:grid-cols-[240px_1fr]">
      <div className="space-y-1">
        {docs.map((d) => (
          <button key={d.file} onClick={() => setCurrent(d.file)} className={cls('w-full rounded-lg border px-3 py-2 text-left transition', d.file === doc?.file ? 'border-white/15 bg-white/10' : 'border-transparent hover:bg-white/5')}>
            <div className="text-sm">{d.title}</div>
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-krypt-muted">
              <span className="min-w-0 truncate">{d.file}</span>
              {d.mine && <span className="shrink-0 rounded bg-krypt-purple/30 px-1 font-sans text-[9px] font-semibold uppercase tracking-wider text-white">yours</span>}
            </div>
          </button>
        ))}
        <p className="px-3 pt-3 text-[11px] leading-relaxed text-krypt-muted">Your AI reads these with get_playbook before making a reel. The ones marked "yours" were saved by you or your AI and can be deleted; the rest come with the app.</p>
      </div>
      <Card className="min-w-0 p-7">
        {doc?.mine && (
          <div className="mb-4 flex items-center justify-end gap-2">
            {sure === doc.file && (
              <GhostButton small onClick={() => setSure(null)}>
                Keep it
              </GhostButton>
            )}
            <GhostButton small onClick={() => void remove(doc.file)}>
              <Trash2 className="h-3.5 w-3.5" /> {sure === doc.file ? 'Really delete this note?' : 'Delete note'}
            </GhostButton>
          </div>
        )}
        {doc && <Markdown source={doc.content} />}
      </Card>
    </div>
  );
}

export default function Research() {
  const [tab, setTab] = useState<'playbook' | 'refs' | 'activity'>('playbook');
  // A reference video being read (by the user or an AI) or looked at brings its tab up.
  const reading = useApp((s) => !!s.refJob);
  useEffect(() => {
    if (reading) setTab('refs');
  }, [reading]);
  return (
    <Page
      title="Research"
      subtitle="What wins on Reels, videos to edit like, plus every session and reference we've logged."
      actions={
        <div className="flex rounded-xl border border-white/10 bg-white/5 p-1">
          {(['playbook', 'refs', 'activity'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={cls('rounded-lg px-3 py-1.5 text-xs font-semibold transition', tab === t ? 'bg-white/10 text-white' : 'text-krypt-muted hover:text-white')}>
              {t === 'playbook' ? 'Playbook' : t === 'refs' ? 'Reference videos' : 'Sessions & references'}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'playbook' ? <PlaybookView /> : tab === 'refs' ? <RefVideosView /> : <SessionsView />}
    </Page>
  );
}
