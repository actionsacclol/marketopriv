import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Check, Copy, Film, Pencil, Plus, Trash2, Volume2, VolumeX } from 'lucide-react';
import type { CustomStyle, IgAccount } from '@shared/types';
import { ClipSources } from '../components/ClipSourcesEditor';
import { MemeStyleSettings } from '../components/MemeStyleSettings';
import { STYLES, TONE_STYLES, allStyles, styleName, styleNeeds, stylesOf, type ChannelStyle } from '@shared/styles';
import { MixCard, VarietyCard } from '../components/ReelControls';
import { STYLE_PAGES } from '@shared/stylePages';
import { Card, GhostButton, Page, PrimaryButton } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';
import { SlidePreview, slideUrls } from '../components/SlidePreview';
import { modeOf } from '../lib/promoteMode';

// Styles: what each account's videos are (shared/styles.ts). The grid shows every
// style with its preview and an on/off switch: every built-in style starts on, and
// the user switches off the ones their AI should not make. Clicking a card opens the
// style's own page (why it works, hooks, how a video is built), where it can be set
// per account. The user can also tell the AI "run the vote style on @handle".

type Media = { dir: string; have: string[]; slides?: Record<string, number> };
const fileOf = (m: Media, id: string, ext: string): string => window.marketo.app.mediaUrl(`${m.dir}\\${id}.${ext}`);

function Missing() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black text-krypt-muted">
      <Film className="h-7 w-7" />
      <span className="text-xs">Preview not made yet</span>
    </div>
  );
}

/**
 * Switch a style on or off for the given accounts (all of them from a card's switch). Returns how many changed and
 * the accounts left alone because the style was their last one.
 */
async function switchStyle(accounts: IgAccount[], id: string, on: boolean): Promise<{ changed: number; kept: string[]; error?: string }> {
  let changed = 0;
  const kept: string[] = [];
  for (const a of accounts) {
    const now = stylesOf(a);
    if (now.includes(id) === on) continue;
    const next = on ? [...now, id] : now.filter((x) => x !== id);
    if (!next.length) {
      kept.push(a.handle);
      continue;
    }
    const r = await window.marketo.db.saveAccount({ id: a.id, styles: [...next.filter((x) => x === 'main'), ...next.filter((x) => x !== 'main')] });
    if (!r.ok) return { changed, kept, error: r.message ?? 'Could not save.' };
    changed++;
  }
  return { changed, kept };
}

/** A small on/off switch. `part` = on for some accounts only. */
function Switch({ on, part, disabled, label, onChange }: { on: boolean; part?: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={part ? 'mixed' : on}
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={cls('relative h-[20px] w-[36px] shrink-0 rounded-full border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-krypt-purple/60 disabled:opacity-50', on ? 'border-emerald-400/60 bg-emerald-500/80' : part ? 'border-emerald-400/40 bg-emerald-500/30' : 'border-white/15 bg-white/[0.12]')}
    >
      <span className={cls('absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all duration-200', on ? 'left-[18px]' : part ? 'left-[10px]' : 'left-[2px]')} />
    </button>
  );
}

/** The grid: hover to play (muted), click to open the style's page, the switch turns it on or off for every account. */
function StyleTile({ st, media, accounts, onOpen }: { st: ChannelStyle; media: Media; accounts: IgAccount[]; onOpen: () => void }) {
  const brand = useApp((s) => s.db!.brand);
  const toast = useApp((s) => s.toast);
  const video = useRef<HTMLVideoElement>(null);
  const [busy, setBusy] = useState(false);
  const { name, label } = styleName(st, brand);
  const have = media.have.includes(st.preview);
  const running = accounts.filter((a) => stylesOf(a).includes(st.id));
  const on = accounts.length > 0 && running.length === accounts.length;
  const part = running.length > 0 && !on;
  // On, but something is missing before the AI can make it (streamers to clip, a Krypt tool to show).
  const needs = running.map((a) => styleNeeds(st.id, a, brand)).find(Boolean) ?? '';
  const flip = async (want: boolean): Promise<void> => {
    setBusy(true);
    const r = await switchStyle(accounts, st.id, want);
    setBusy(false);
    if (r.error) return toast('error', r.error);
    if (r.kept.length) return toast('warn', `${r.kept.join(', ')} ${r.kept.length === 1 ? 'needs' : 'need'} at least one style: switch another on first.`);
    toast('ok', want ? `${name} is on: your AI makes it in its turn.` : `${name} is off: your AI will not make it.`);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={() => void video.current?.play().catch(() => {})}
      onMouseLeave={() => {
        if (!video.current) return;
        video.current.pause();
        video.current.currentTime = 0;
      }}
      className={cls('group flex cursor-pointer flex-col overflow-hidden rounded-2xl border text-left transition hover:-translate-y-0.5', st.id === 'main' ? 'border-krypt-purple/50 bg-krypt-purple/[0.07]' : 'border-white/10 bg-white/[0.03] hover:border-white/25')}
    >
      <div className={cls('relative aspect-[9/16] w-full bg-black transition', running.length === 0 && accounts.length > 0 && 'opacity-40 grayscale group-hover:opacity-80 group-hover:grayscale-0')}>
        {slideUrls(media, st.preview).length ? (
          <SlidePreview urls={slideUrls(media, st.preview)} />
        ) : have ? (
          <video ref={video} src={fileOf(media, st.preview, 'mp4')} poster={fileOf(media, st.preview, 'jpg')} muted loop playsInline preload="none" className="h-full w-full object-cover" />
        ) : (
          <Missing />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-white">{name}</span>
          {st.custom && <span className="shrink-0 rounded bg-krypt-purple/30 px-1 text-[9px] font-semibold uppercase tracking-wider text-white">yours</span>}
          <span className="ml-auto shrink-0 rounded border border-white/15 px-1 font-mono text-[10px] text-white/70">{label}</span>
        </div>
        <p className="line-clamp-2 text-xs leading-snug text-krypt-muted">{st.about}</p>
        <div className="mt-auto flex items-center gap-2 pt-2">
          <Switch on={on} part={part} disabled={busy || accounts.length === 0} label={`${name}: ${on ? 'on' : 'off'}`} onChange={() => void flip(!on)} />
          <span className={cls('min-w-0 truncate text-[11px]', needs ? 'text-amber-200/90' : running.length ? 'text-emerald-200/90' : 'text-krypt-muted')}>
            {accounts.length === 0 ? 'Add an account first' : needs ? needs : on ? 'On' : part ? `On for ${running.length} of ${accounts.length}` : 'Off'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Make a style of your own, or change one: a name, what it is, and how a video in it is made. */
function StyleForm({ own, onDone }: { own?: CustomStyle; onDone: () => void }) {
  const brand = useApp((s) => s.db!.brand);
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState(own?.name ?? '');
  const [about, setAbout] = useState(own?.about ?? '');
  const [rules, setRules] = useState(own?.rules ?? '');
  const [base, setBase] = useState(own?.base ?? 'main');
  const [busy, setBusy] = useState(false);
  const save = async (): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.db.saveStyle({ id: own?.id, name, about, rules, base });
    setBusy(false);
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    toast('ok', own ? 'Style saved.' : 'Style made. Switch it on with the switch on its card.');
    onDone();
  };
  return (
    <Card className="max-w-3xl space-y-3">
      <div>
        <div className="text-sm font-semibold text-white">{own ? `Change "${own.name}"` : 'New style'}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-krypt-muted">A style of your own is a set of written rules your AI follows, on top of one of the built-in styles. You can also just tell Kip or your AI: "make a new style where …".</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-krypt-muted">
          Name
          <input className="input w-full text-sm" maxLength={40} placeholder="e.g. Speedrun tips" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-krypt-muted">
          Built on
          <select className="input w-full text-sm" value={base} onChange={(e) => setBase(e.target.value)}>
            {STYLES.map((x) => (
              <option key={x.id} value={x.id}>
                {styleName(x, brand).name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-xs text-krypt-muted">
        What it is (one or two lines for its card)
        <input className="input w-full text-sm" maxLength={240} placeholder="e.g. One game setting explained in 20 seconds, with the before and after on screen." value={about} onChange={(e) => setAbout(e.target.value)} />
      </label>
      <label className="block space-y-1 text-xs text-krypt-muted">
        How a video in this style is made
        <textarea className="input min-h-[130px] w-full text-sm leading-relaxed" maxLength={2000} placeholder="The kind of story, how it opens, what each part shows, the look, the length, how it ends." value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      <div className="flex items-center gap-2">
        <PrimaryButton disabled={busy || name.trim().length < 2 || rules.trim().length < 20} onClick={() => void save()}>
          <Check className="h-4 w-4" /> {own ? 'Save' : 'Make style'}
        </PrimaryButton>
        <GhostButton disabled={busy} onClick={onDone}>
          Cancel
        </GhostButton>
      </div>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">{title}</h3>
      {children}
    </Card>
  );
}

/** One style's page. */
function StylePageView({ st, media, accounts, onBack }: { st: ChannelStyle; media: Media; accounts: IgAccount[]; onBack: () => void }) {
  const brand = useApp((s) => s.db!.brand);
  const toast = useApp((s) => s.toast);
  const own = useApp((s) => s.db!.customStyles)?.find((x) => x.id === st.id);
  const [editing, setEditing] = useState(false);
  const [sure, setSure] = useState(false);
  const remove = async (): Promise<void> => {
    const r = await window.marketo.db.deleteStyle(st.id);
    if (!r.ok) return toast('error', r.message ?? 'Could not delete.');
    toast('ok', `Deleted "${st.name}".`);
    onBack();
  };
  const [busy, setBusy] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const { name, label } = styleName(st, brand);
  const page = STYLE_PAGES[st.id];
  const have = media.have.includes(st.preview);
  const say = `run the ${label} style on @${accounts[0]?.handle.replace(/^@/, '') ?? 'yourhandle'}`;

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    void v.play().catch(() => {});
    const onVol = (): void => setSound(!v.muted);
    v.addEventListener('volumechange', onVol);
    return () => v.removeEventListener('volumechange', onVol);
  }, [st.id]);

  const toggleSound = (): void => {
    const v = video.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
  };

  const toggle = async (a: IgAccount): Promise<void> => {
    const on = stylesOf(a).includes(st.id);
    setBusy(a.id);
    const r = await switchStyle([a], st.id, !on);
    setBusy(null);
    if (r.error) return toast('error', r.error);
    if (r.kept.length) return toast('warn', `${a.handle} needs at least one style.`);
    toast('ok', on ? `${a.handle} stops making ${name} videos.` : `${a.handle} now runs ${name}. Set how often each is used under Style mix.`);
  };
  const needs = accounts.filter((a) => stylesOf(a).includes(st.id)).map((a) => styleNeeds(st.id, a, brand)).find(Boolean) ?? '';

  return (
    <div className="space-y-5">
      <GhostButton small onClick={onBack}>
        <ArrowLeft className="h-3.5 w-3.5" /> All styles
      </GhostButton>
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="relative aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-2xl border border-white/10 bg-black">
          {slideUrls(media, st.preview).length ? (
            <SlidePreview big urls={slideUrls(media, st.preview)} />
          ) : have ? (
            <>
              <video ref={video} src={fileOf(media, st.preview, 'mp4')} poster={fileOf(media, st.preview, 'jpg')} muted loop playsInline autoPlay className="h-full w-full cursor-pointer object-cover" onClick={toggleSound} />
              <button aria-label={sound ? 'Mute' : 'Play with sound'} onClick={toggleSound} className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur hover:bg-black/80">
                {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
              </button>
            </>
          ) : (
            <Missing />
          )}
        </div>
        <div className="min-w-0 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-3xl font-bold text-white">{name}</h2>
              <span className="rounded-md border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-sm text-white/85">{label}</span>
              {st.id === 'main' && <span className="rounded-full bg-krypt-purple/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Main</span>}
              {own && <span className="rounded-full bg-krypt-purple/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">Yours</span>}
              {own && (
                <span className="ml-auto flex items-center gap-1.5">
                  <GhostButton small onClick={() => setEditing((v) => !v)}>
                    <Pencil className="h-3.5 w-3.5" /> Change
                  </GhostButton>
                  <GhostButton small onClick={() => (sure ? void remove() : setSure(true))}>
                    <Trash2 className="h-3.5 w-3.5" /> {sure ? 'Really delete?' : 'Delete'}
                  </GhostButton>
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-white/80">{st.about}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/10 px-2.5 py-1 text-white/70">Best on: {st.bestOn}</span>
              {page && <span className="rounded-full border border-white/10 px-2.5 py-1 text-white/70">Length: {page.length}</span>}
            </div>
          </div>
          {own && editing && <StyleForm own={own} onDone={() => setEditing(false)} />}
          {own && !editing && (
            <Section title="Rules your AI follows">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">{own.rules}</p>
              <p className="mt-2 text-xs text-krypt-muted">Built on {styleName(STYLES.find((x) => x.id === own.base) ?? STYLES[0], brand).name}: the preview shown is that style's.</p>
            </Section>
          )}
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-white">Run it on</div>
              {needs && <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-100">{needs}{st.id === 'clipping' ? ' (below)' : ''}: until then your AI skips it</span>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {accounts.length === 0 && <span className="text-xs text-krypt-muted">Add an account first (Grow &gt; Accounts).</span>}
              {accounts.map((a) => {
                const on = stylesOf(a).includes(st.id);
                return (
                  <button key={a.id} disabled={busy === a.id} onClick={() => void toggle(a)} className={cls('flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition disabled:opacity-50', on ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/10 text-krypt-muted hover:text-white')}>
                    {on && <Check className="h-3.5 w-3.5" />}
                    {a.handle}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-krypt-muted">
              Or tell your AI:
              <span className="rounded-md bg-black/30 px-2 py-1 font-mono text-white/85">"{say}"</span>
              <button aria-label="Copy" onClick={() => void window.marketo.app.copyText(say).then(() => toast('ok', 'Copied.'))} className="rounded p-1 hover:text-white">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </Card>
          {st.id === 'clipping' && accounts.some((a) => stylesOf(a).includes('clipping')) && <ClipSources accounts={accounts.filter((a) => stylesOf(a).includes('clipping'))} />}
          {TONE_STYLES.includes(st.id) && <MemeStyleSettings styleId={st.id} accounts={accounts} />}
          {page && (
            <div className="grid gap-4 xl:grid-cols-2">
              <Section title="Why it works">
                <ul className="space-y-2 text-sm leading-relaxed text-white/80">
                  {page.benefits.map((b) => (
                    <li key={b} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      {b}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="Hooks that work">
                <ul className="space-y-2 text-sm text-white/85">
                  {page.hooks.map((h) => (
                    <li key={h} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                      {h}
                    </li>
                  ))}
                </ul>
              </Section>
              <Section title="How a video is built">
                <ol className="space-y-2 text-sm text-white/80">
                  {page.structure.map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-krypt-purple/20 font-mono text-xs text-white">{i + 1}</span>
                      <span className="pt-0.5">{s}</span>
                    </li>
                  ))}
                </ol>
              </Section>
              <Section title="Rules your AI follows">
                <p className="text-sm leading-relaxed text-white/70">{st.rules}</p>
              </Section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Styles() {
  const accounts = useApp((s) => s.db!.igAccounts);
  const open = useApp((s) => s.selectedStyle);
  const openStyle = useApp((s) => s.openStyle);
  const [media, setMedia] = useState<Media | null>(null);
  useEffect(() => void window.marketo.app.examples().then(setMedia), []);
  // The user's own styles: read here so the page redraws when one is made, changed or deleted.
  const mine = useApp((s) => s.db!.customStyles) ?? [];
  const [adding, setAdding] = useState(false);
  const st = open ? allStyles().find((x) => x.id === open) : undefined;
  const toast = useApp((s) => s.toast);
  const [allBusy, setAllBusy] = useState(false);
  // A clip channel runs the clipping style alone: no "all on" there.
  const clips = useApp((s) => modeOf(s.db!)) === 'clips';
  const everyId = allStyles().map((x) => x.id);
  const allOn = accounts.every((a) => everyId.every((id) => stylesOf(a).includes(id)));
  const onlyMain = accounts.every((a) => stylesOf(a).length === 1 && stylesOf(a)[0] === 'main');
  // Every style on, or back to the main style alone, for every account. A style mix the user saved is theirs: it is left as it is.
  const setAll = async (on: boolean): Promise<void> => {
    setAllBusy(true);
    for (const a of accounts) {
      const r = await window.marketo.db.saveAccount({ id: a.id, styles: on ? everyId : ['main'] });
      if (!r.ok) {
        setAllBusy(false);
        return toast('error', r.message ?? 'Could not save.');
      }
    }
    setAllBusy(false);
    toast('ok', on ? 'Every style is on.' : 'Only the main style is on. Switch on the ones you want.');
  };
  return (
    <Page
      title="Styles"
      subtitle={st ? undefined : 'The kinds of video your AI makes. Every style starts on: switch off the ones you do not want. Hover to preview, click a style to see how it works.'}
      actions={
        st ? undefined : (
          <span className="flex items-center gap-2">
            {accounts.length > 0 && !clips && (
              <>
                <GhostButton small className="whitespace-nowrap" disabled={allBusy || allOn} onClick={() => void setAll(true)}>
                  All on
                </GhostButton>
                <GhostButton small className="whitespace-nowrap" disabled={allBusy || onlyMain} onClick={() => void setAll(false)}>
                  Main only
                </GhostButton>
              </>
            )}
            <GhostButton small className="whitespace-nowrap" onClick={() => setAdding(true)}>
              <Plus className="h-3.5 w-3.5" /> New style
            </GhostButton>
          </span>
        )
      }
    >
      {media &&
        (st ? (
          <StylePageView st={st} media={media} accounts={accounts} onBack={() => openStyle(null)} />
        ) : (
          <div className="space-y-5" data-own={mine.length}>
          {adding && <StyleForm onDone={() => setAdding(false)} />}
          <div className="grid gap-4 xl:grid-cols-2">
            <MixCard accounts={accounts} />
            <VarietyCard />
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
            {allStyles().map((x) => (
              <StyleTile key={x.id} st={x} media={media} accounts={accounts} onOpen={() => openStyle(x.id)} />
            ))}
          </div>
          </div>
        ))}
    </Page>
  );
}
