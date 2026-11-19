import { useEffect, useMemo, useState } from 'react';
import { Ban, Copy, ExternalLink, Lightbulb, Search } from 'lucide-react';
import { KRYPT_PACK_READ, KRYPT_PACK_RULES, KRYPT_TOOLS, kryptToolPrompt, type KryptTool } from '@shared/kryptPack';
import { Card, GhostButton, Page, PrimaryButton } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Every krypt.cc tool, in full: the same catalog each connected AI reads with
// krypt_tools. It is part of the app, so there is nothing to switch off here.

const CATEGORIES = ['All', 'Trading', 'Utility', 'Degen', 'Donor'] as const;
type Category = (typeof CATEGORIES)[number];

const haystack = (t: KryptTool): string[] => [t.name, t.tagline, t.category, t.about, ...t.features, ...t.details.flatMap((d) => [d.title, ...d.points])].join(' ').toLowerCase().split(/[^a-z0-9$%.]+/).filter(Boolean);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-krypt-muted">{label}</div>
      <div className="mt-0.5 text-sm text-white/90">{children}</div>
    </div>
  );
}

function Bullets({ items, tone }: { items: string[]; tone?: 'warn' }) {
  return (
    <ul className="space-y-1.5">
      {items.map((x) => (
        <li key={x} className="flex gap-2 text-sm leading-snug text-white/85">
          <span className={cls('mt-[7px] h-1 w-1 shrink-0 rounded-full', tone === 'warn' ? 'bg-rose-400' : 'bg-krypt-purple')} />
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

/** The app's bundled screen recording, playing on a loop (silent). */
function ToolClip({ t, clips }: { t: KryptTool; clips: { dir: string; have: string[] } | null }) {
  if (!clips) return null;
  if (!clips.have.includes(t.id))
    return <div className="mb-4 flex aspect-[16/7] items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-krypt-muted">No screen recording of {t.name} yet.</div>;
  const file = (ext: string): string => window.marketo.app.mediaUrl(`${clips.dir}\\${t.id}.${ext}`);
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-white/10 bg-black">
      <video key={t.id} src={file('mp4')} poster={file('jpg')} muted loop autoPlay playsInline className="max-h-[420px] w-full object-contain" />
    </div>
  );
}

function Detail({ t, clips }: { t: KryptTool; clips: { dir: string; have: string[] } | null }) {
  const toast = useApp((s) => s.toast);
  const copy = async (): Promise<void> => {
    await window.marketo.app.copyText(kryptToolPrompt(t));
    toast('ok', 'Copied. Paste it to your AI, or on the Chat page.');
  };
  const unreleased = t.released === false;
  return (
    <div className="space-y-4">
      <Card>
        <ToolClip t={t} clips={clips} />
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight text-white">{t.name}</h2>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-krypt-muted">{t.category}</span>
              {unreleased && <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200">Not released yet</span>}
            </div>
            <div className="mt-1 text-sm text-krypt-muted">{t.tagline}</div>
          </div>
          <div className="flex shrink-0 gap-2">
            <GhostButton small onClick={() => void window.marketo.app.openExternal(`https://${t.url}`)}>
              <ExternalLink className="h-3.5 w-3.5" /> {t.url}
            </GhostButton>
            <PrimaryButton onClick={() => void copy()}>
              <Copy className="h-4 w-4" /> Copy reel prompt
            </PrimaryButton>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-white/85">{t.about}</p>
        <div className="mt-4 grid gap-4 border-t border-white/5 pt-4 sm:grid-cols-3">
          <Fact label="Runs on">{t.platforms}</Fact>
          <Fact label="Price">{t.price}</Fact>
          <Fact label="Version">{t.version ? `${t.version} (on ${KRYPT_PACK_READ})` : '—'}</Fact>
        </div>
      </Card>

      <Card>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">What it does</h3>
        <Bullets items={t.features} />
        {t.details.map((d) => (
          <div key={d.title} className="mt-5">
            <h4 className="mb-2 text-sm font-semibold text-white">{d.title}</h4>
            <Bullets items={d.points} />
          </div>
        ))}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">
            <Lightbulb className="h-3.5 w-3.5" /> Reel angles
          </h3>
          <Bullets items={t.angles} />
        </Card>
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">
            <Ban className="h-3.5 w-3.5" /> Never in a reel about it
          </h3>
          {t.avoid.length ? <Bullets items={t.avoid} tone="warn" /> : <div className="text-sm text-krypt-muted">Nothing specific. The rules for every Krypt reel still apply.</div>}
        </Card>
      </div>
    </div>
  );
}

export default function KryptTools() {
  const [id, setId] = useState(KRYPT_TOOLS[0].id);
  const [cat, setCat] = useState<Category>('All');
  const [q, setQ] = useState('');
  const [clips, setClips] = useState<{ dir: string; have: string[] } | null>(null);
  useEffect(() => void window.marketo.screen.toolClips().then(setClips), []);
  const index = useMemo(() => new Map(KRYPT_TOOLS.map((t) => [t.id, haystack(t)])), []);
  // Each typed word has to start a word in the tool's text ("stem" finds stem splitting, not "system").
  const words = q.toLowerCase().split(/[^a-z0-9$%.]+/).filter(Boolean);
  const list = KRYPT_TOOLS.filter((t) => (cat === 'All' || t.category === cat) && words.every((w) => index.get(t.id)!.some((x) => x.startsWith(w))));
  const tool = list.find((t) => t.id === id) ?? list[0];

  return (
    <Page title="Krypt tools" subtitle={`Everything about all ${KRYPT_TOOLS.length} krypt.cc tools. Built in: your AI reads the same catalog before it writes a reel about one.`} flush>
      <div className="flex h-full min-h-0 gap-6 px-8 pb-8">
        <div className="flex w-[280px] shrink-0 flex-col">
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-krypt-muted" />
            <input className="input pl-9" placeholder="Search tools and features" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={cls('rounded-full border px-2.5 py-1 text-[11px] transition', cat === c ? 'border-krypt-purple/60 bg-krypt-purple/15 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
                {c} {c === 'All' ? KRYPT_TOOLS.length : KRYPT_TOOLS.filter((t) => t.category === c).length}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 space-y-1 overflow-auto pr-1">
            {list.map((t) => (
              <button key={t.id} onClick={() => setId(t.id)} className={cls('w-full rounded-xl border px-3 py-2.5 text-left transition', tool?.id === t.id ? 'border-krypt-purple/50 bg-krypt-purple/10' : 'border-transparent hover:border-white/10 hover:bg-white/5')}>
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-white">{t.name}</span>
                  {clips?.have.includes(t.id) && <span title="Has a screen recording" className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />}
                  {t.released === false && <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-200">soon</span>}
                </div>
                <div className="truncate text-xs text-krypt-muted">{t.tagline}</div>
              </button>
            ))}
            {!list.length && <div className="px-3 py-6 text-sm text-krypt-muted">No tool matches.</div>}
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 overflow-auto pr-1">
          {tool && <Detail key={tool.id} t={tool} clips={clips} />}
          <Card className="mt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Rules for every reel about a Krypt tool</h3>
            <Bullets items={KRYPT_PACK_RULES} />
            <p className="mt-3 text-xs text-krypt-muted">Facts are from the public krypt.cc pages, read {KRYPT_PACK_READ}. Before a reel leans on a number (a fee, a version, a count), check the tool's page.</p>
          </Card>
        </div>
      </div>
    </Page>
  );
}
