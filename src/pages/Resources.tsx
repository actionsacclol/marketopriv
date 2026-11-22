// Resources: links around Marketo (guide videos, ElevenLabs, proxies, Krypt tools, growth services).
// The list lives in shared/resources.ts. Guide videos get their own row; every other card sits in one grid, each
// labelled with its section, so a section with one or two cards leaves no gap.

import { AlertTriangle, ExternalLink, Play } from 'lucide-react';
import { RESOURCES, type ResourceLink } from '@shared/resources';
import { Card, GhostButton, Page, PrimaryButton, Section } from '../components/ui';

const open = (url: string): void => void window.marketo.app.openExternal(url);

/** A YouTube video's picture with a play button; opens the video in the browser. */
function VideoPreview({ id, url, title }: { id: string; url: string; title: string }) {
  return (
    <button
      onClick={() => open(url)}
      title={`${title}: opens on YouTube in your browser`}
      className="group relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/40"
    >
      {/* No internet: the picture hides and the play button stays. */}
      <img
        src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
        alt=""
        className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-[1.03]"
        onError={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
      />
      <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white ring-1 ring-white/30 transition group-hover:bg-krypt-purple">
        <Play className="h-4 w-4 translate-x-px fill-current" />
      </span>
    </button>
  );
}

function Item({ r, kicker }: { r: ResourceLink; kicker?: string }) {
  return (
    <Card className="flex h-full flex-col gap-2">
      {r.video && r.url && <VideoPreview id={r.video} url={r.url} title={r.title} />}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {kicker && <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-krypt-muted">{kicker}</div>}
          <div className="text-sm font-semibold text-white">{r.title}</div>
        </div>
        {!r.url && <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-krypt-muted">Coming soon</span>}
      </div>
      <p className="flex-1 text-sm leading-relaxed text-white/75">{r.about}</p>
      {r.warning && (
        <p className="flex gap-1.5 rounded-lg border border-amber-400/25 bg-amber-400/5 p-2 text-xs leading-relaxed text-amber-200/90">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {r.warning}
        </p>
      )}
      {(r.url || r.extra) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {r.url && (
            <PrimaryButton onClick={() => open(r.url!)}>
              <ExternalLink className="h-4 w-4" /> {r.button ?? 'Open'}
            </PrimaryButton>
          )}
          {r.extra && (
            <GhostButton small onClick={() => open(r.extra!.url)}>
              {r.extra.label}
            </GhostButton>
          )}
        </div>
      )}
      {r.affiliate && r.url && <p className="text-[11px] text-krypt-muted">Affiliate link: {r.affiliate}.</p>}
    </Card>
  );
}

export default function Resources() {
  const guides = RESOURCES.find((s) => s.id === 'guides');
  const rest = RESOURCES.filter((s) => s.id !== 'guides').flatMap((s) => s.items.map((r) => ({ r, kicker: s.title })));
  return (
    <Page title="Resources" subtitle="Guide videos, the services Marketo works with, and Krypt's other tools.">
      {guides && (
        <Section title={guides.title} description={guides.about}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {guides.items.map((r) => (
              <Item key={r.title} r={r} />
            ))}
          </div>
        </Section>
      )}
      <Section title="Services and tools" description="The services Marketo works with and Krypt's other tools. Affiliate links are marked.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rest.map(({ r, kicker }) => (
            <Item key={`${kicker}|${r.title}`} r={r} kicker={kicker} />
          ))}
        </div>
      </Section>
    </Page>
  );
}
