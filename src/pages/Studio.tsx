import { useEffect, useRef, useState } from 'react';
import { Copy, FolderOpen, Images, Loader2, Mic, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { PRESETS, elVoiceNote, isVoiced, presetById, slideTimes, storyBeats, storyVoiceTrack, timingFor, type PresetField } from '@shared/presets';
import { FORMATS } from '@shared/formats';
import { bannerOf } from '@shared/campaigns';
import { MAX_SLIDES, type FieldValue, type Fields, type Reel } from '@shared/types';
import { renderStills } from '../render/export';
import { Card, GhostButton, Page, PrimaryButton, StatusChip, Toggle } from '../components/ui';
import { ReelPlayer } from '../components/ReelPlayer';
import { cancelCurrentRender, renderReel, useApp } from '../state/store';
import { cls, timeAgo } from '../lib/format';
import { ensureVoiceover } from '../render/voice';
import { DEFAULT_TUNE, VOICES, describeTune, tuneToFields, voiceName } from '@shared/voice';
import { DeleteReelsDialog } from '../components/DeleteReels';
import { BeatEditor } from '../components/BeatEditor';

/** Edits apply to the preview instantly and are saved after a short pause. */
function useDraft(reel: Reel | undefined): [Fields, (k: string, v: FieldValue) => void] {
  const [pending, setPending] = useState<Fields>({});
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef<Fields>({});
  useEffect(() => {
    setPending({});
    latest.current = {};
  }, [reel?.id]);
  const set = (k: string, v: FieldValue): void => {
    if (!reel) return;
    latest.current = { ...latest.current, [k]: v };
    setPending(latest.current);
    window.clearTimeout(timer.current);
    const id = reel.id;
    timer.current = window.setTimeout(() => {
      const patch = latest.current;
      latest.current = {};
      void window.marketo.db.updateReel(id, { fields: patch }).then((r) => {
        if (!r.ok) useApp.getState().toast('error', r.message ?? 'Saving failed.');
        setPending((p) => Object.fromEntries(Object.entries(p).filter(([key]) => !(key in patch) || p[key] !== patch[key])));
      });
    }, 350);
  };
  return [{ ...(reel?.fields ?? {}), ...pending }, set];
}

function FieldInput({ field, value, onChange }: { field: PresetField; value: FieldValue; onChange: (v: FieldValue) => void }) {
  // The narrator list also offers the user's ElevenLabs voices.
  const elVoices = useApp((s) => s.db?.settings.eleven?.voices);
  const options = field.key === 'voice' ? [...(elVoices ?? []).map((v) => `el:${v.id}`), ...(field.options ?? [])] : field.options;
  if (field.key === 'voice' && options && !options.includes(String(value))) options.unshift(String(value));
  switch (field.type) {
    case 'longtext':
      return <textarea className="input min-h-[76px] resize-y" rows={3} value={String(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'lines':
      return <textarea className="input min-h-[120px] resize-y font-mono text-xs leading-relaxed" rows={6} value={String(value)} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
    case 'number':
      return (
        <div className="flex items-center gap-2">
          <input type="range" className="flex-1 accent-[#A855F7]" min={field.min} max={field.max} step={field.step ?? 1} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />
          <input type="number" className="input w-20 py-1.5 font-mono text-xs" min={field.min} max={field.max} step={field.step ?? 1} value={Number(value)} onChange={(e) => onChange(Number(e.target.value))} />
        </div>
      );
    case 'select':
      return (
        <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {options?.map((o) => (
            <option key={o} value={o} className="bg-krypt-panel">
              {field.key.startsWith('voice') && o !== 'none' ? (o.startsWith('el:') ? voiceName(o) : `${voiceName(o)} (${o})`) : o}
            </option>
          ))}
        </select>
      );
    case 'toggle':
      return <Toggle on={value === true} onChange={onChange} label={value === true ? 'On' : 'Off'} />;
    case 'file':
      return (
        <div className="flex items-center gap-2">
          <div className="input truncate py-2 font-mono text-xs text-white/70" title={String(value)}>
            {String(value) ? String(value).split(/[\\/]/).pop() : <span className="text-white/30">none</span>}
          </div>
          <GhostButton small onClick={() => void window.marketo.app.pickFile(field.fileKind ?? 'video').then((p) => p && onChange(p))}>
            <Upload className="h-3.5 w-3.5" />
          </GhostButton>
          {String(value) && (
            <GhostButton small onClick={() => onChange('')}>
              <X className="h-3.5 w-3.5" />
            </GhostButton>
          )}
        </div>
      );
    default:
      return <input className="input" value={String(value)} onChange={(e) => onChange(e.target.value)} />;
  }
}

function NewReel() {
  const toast = useApp((s) => s.toast);
  const create = async (preset: string, format?: string): Promise<void> => {
    const r = await window.marketo.db.createReel(preset, undefined, format);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not create the reel.');
    if (format) toast('warn', 'The numbers in a format are examples. Replace them with real data before rendering.');
    useApp.getState().go('studio', r.data.id);
  };
  return (
    <div className="grid grid-cols-1 gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-krypt-muted">Formats</div>
      {FORMATS.map((f) => (
        <button key={f.id} onClick={() => void create(f.preset, f.id)} className="group rounded-xl border border-krypt-purple/25 bg-krypt-purple/[0.06] px-3 py-2.5 text-left transition hover:border-krypt-purple/50 hover:bg-krypt-purple/10">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-3.5 w-3.5 text-krypt-purple" /> {f.name}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-krypt-muted">{f.pitch}</div>
        </button>
      ))}
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-krypt-muted">Blank styles</div>
      {PRESETS.map((p) => (
        <button key={p.id} onClick={() => void create(p.id)} className="group rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition hover:border-krypt-purple/40 hover:bg-krypt-purple/10">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-3.5 w-3.5 text-krypt-purple" /> {p.name}
          </div>
          <div className="mt-0.5 text-[11px] leading-snug text-krypt-muted">{p.tagline}</div>
        </button>
      ))}
    </div>
  );
}

export default function Studio() {
  const db = useApp((s) => s.db)!;
  const selected = useApp((s) => s.selectedReel);
  const job = useApp((s) => s.job);
  const toast = useApp((s) => s.toast);
  const select = useApp((s) => s.select);
  const reel = db.reels.find((r) => r.id === selected) ?? db.reels[0];
  const [fields, setField] = useDraft(reel);
  const preset = reel ? presetById(reel.preset) : undefined;
  const banner = reel ? bannerOf(reel, db.campaigns) : undefined;
  const go = useApp((s) => s.go);
  const [asking, setAsking] = useState(false);
  const [caption, setCaption] = useState(reel?.caption ?? '');
  useEffect(() => setCaption(reel?.caption ?? ''), [reel?.id, reel?.caption]);

  const patch = async (p: Partial<Reel>): Promise<void> => {
    if (!reel) return;
    const r = await window.marketo.db.updateReel(reel.id, p);
    if (!r.ok) toast('error', r.message ?? 'Saving failed.');
  };

  const render = async (): Promise<void> => {
    if (!reel) return;
    try {
      const r = await renderReel({ ...reel, fields });
      toast('ok', `Rendered ${r.seconds.toFixed(1)}s → ${r.path}`);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };

  // A slideshow's slides as pictures, in the two shapes photo posts use (4:5 for feeds, full screen for TikTok).
  const [savingSlides, setSavingSlides] = useState(false);
  const saveSlides = async (): Promise<void> => {
    if (!reel || savingSlides) return;
    setSavingSlides(true);
    try {
      const now = { ...reel, fields };
      const times = slideTimes(now.preset, now.fields).slice(0, MAX_SLIDES);
      if (times.length < 2) throw new Error('A slideshow needs at least 2 slides.');
      let dir = '';
      for (const shape of ['portrait', 'vertical'] as const) {
        const stills = await renderStills(now, times, 1, shape, true);
        const r = await window.marketo.render.saveSlides(reel.id, stills.map((s) => s.data), shape);
        if (!r.ok || !r.data) throw new Error(r.message ?? 'Saving the slides failed.');
        if (!dir) dir = r.data[0];
      }
      toast('ok', `Saved ${times.length} slides as pictures (4:5 and full screen).`);
      if (dir) void window.marketo.app.showItemInFolder(dir);
    } catch (e) {
      toast('error', (e as Error).message);
    } finally {
      setSavingSlides(false);
    }
  };

  // Story voice-over: regenerate shortly after the lines or voices change.
  const [voiceStatus, setVoiceStatus] = useState('');
  const needsVoice = !!reel && isVoiced(reel.preset) && (fields.voiceover === true || fields.sfx === true || (!!fields.bed && fields.bed !== 'none')) && !storyVoiceTrack(fields);
  const voiceKey = needsVoice ? JSON.stringify([fields.beats, fields.voice, fields.voice_speed, fields.voice_pitch, fields.voice_warmth, fields.voice_clarity, fields.voice_blend, fields.voice_blend_amount, fields.voice_volume, fields.voiceover, fields.sfx, fields.sfx_volume, fields.gap, fields.bed, db.settings.sayAs]) : '';
  useEffect(() => {
    if (!voiceKey || !reel) return;
    let live = true;
    const t = setTimeout(() => {
      setVoiceStatus('Voice-over: generating');
      ensureVoiceover({ ...reel, fields }, (s) => live && setVoiceStatus(s))
        .then(() => live && setVoiceStatus(''))
        .catch((e: Error) => live && setVoiceStatus(`Voice-over failed: ${e.message}`));
    }, 1200);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceKey, reel?.id]);

  const [seek, setSeek] = useState<{ t: number; n: number } | undefined>(undefined);
  const isStory = !!reel && isVoiced(reel.preset);
  const beats = isStory ? storyBeats(fields) : [];
  const starts = beats.map((b) => b.start);
  const elNote = fields.voiceover === true ? elVoiceNote(beats, String(fields.voice ?? '')) : '';
  const rendering = job?.reelId === reel?.id;
  const timing = reel ? timingFor(reel.preset, fields) : null;

  return (
    <Page title="Studio" subtitle="Pick a preset, tweak the copy, render a 1080×1920 MP4. Your AI can do all of it too." flush>
      <div className={cls('grid h-full gap-5 px-8 pb-6', isStory ? 'grid-cols-[230px_1fr_440px]' : 'grid-cols-[250px_1fr_380px]')}>
        {/* Left: presets + reels */}
        <div className="flex min-h-0 flex-col gap-4 overflow-auto pr-1">
          <div>
            <div className="label">New from preset</div>
            <NewReel />
          </div>
          <div>
            <div className="label">Reels</div>
            <div className="space-y-1">
              {db.reels.map((r) => (
                <button key={r.id} onClick={() => select(r.id)} className={cls('w-full rounded-lg border px-3 py-2 text-left transition', r.id === reel?.id ? 'border-white/15 bg-white/10' : 'border-transparent hover:bg-white/5')}>
                  <div className="truncate text-sm">{r.title}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <StatusChip status={r.status} />
                    <span className="font-mono text-[10px] text-krypt-muted">{r.preset}</span>
                    <span className="ml-auto text-[10px] text-krypt-muted">{timeAgo(r.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Center: preview */}
        <div className="min-h-0">
          {reel && preset ? (
            <div className="flex h-full flex-col gap-2">
              {elNote && (
                <div className="mx-auto flex max-w-full items-center gap-2 rounded-full border border-krypt-purple/30 bg-krypt-purple/10 px-3 py-1 text-[11px] text-white/80">
                  <Mic className="h-3 w-3 shrink-0 text-krypt-purple" />
                  <span className="truncate">{elNote}</span>
                </div>
              )}
              <div className="relative min-h-0 flex-1">
              <ReelPlayer key={reel.id} preset={reel.preset} fields={fields} jump={seek} banner={banner} />
              {voiceStatus && (
                <div className="absolute left-1/2 top-3 flex max-w-[90%] -translate-x-1/2 items-center gap-2 truncate rounded-full border border-white/10 bg-black/70 px-3 py-1 text-[11px] text-white/80 backdrop-blur">
                  {!voiceStatus.includes('failed') && <Loader2 className="h-3 w-3 animate-spin" />}
                  <span className="truncate">{voiceStatus}</span>
                </div>
              )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center text-krypt-muted">
              <Sparkles className="mb-3 h-8 w-8 text-krypt-purple" />
              <div className="text-white">No reel selected</div>
              <div className="mt-1 text-sm">Pick a preset on the left.</div>
            </div>
          )}
        </div>

        {/* Right: inspector */}
        <div className="min-h-0 overflow-auto pr-1">
          {reel && preset && (
            <div className="space-y-4">
              <Card padded={false} className="space-y-3 p-4">
                <input className="input text-base font-semibold" value={reel.title} onChange={(e) => void patch({ title: e.target.value })} />
                <div className="flex items-center gap-2">
                  <select className="input" value={reel.preset} onChange={(e) => void patch({ preset: e.target.value })}>
                    {PRESETS.map((p) => (
                      <option key={p.id} value={p.id} className="bg-krypt-panel">
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <StatusChip status={reel.status} />
                </div>
                <div className="text-[11px] text-krypt-muted">
                  Style: {preset.inspiredBy} · {timing!.total.toFixed(1)}s
                </div>
                {rendering ? (
                  <div className="space-y-2">
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full bg-krypt-gradient transition-all" style={{ width: `${Math.round(job!.ratio * 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between font-mono text-xs text-krypt-muted">
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {job!.phase} {Math.round(job!.ratio * 100)}%
                      </span>
                      <button onClick={cancelCurrentRender} className="text-rose-300 hover:text-rose-200">
                        cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <PrimaryButton onClick={() => void render()} disabled={!!job} className="flex-1">
                      Render MP4
                    </PrimaryButton>
                    <GhostButton onClick={() => void window.marketo.db.duplicateReel(reel.id).then((r) => r.data && select(r.data.id))} className="px-3" disabled={!!job}>
                      <Copy className="h-4 w-4" />
                    </GhostButton>
                    <GhostButton destructive className="px-3" onClick={() => setAsking(true)} disabled={rendering}>
                      <Trash2 className="h-4 w-4" />
                    </GhostButton>
                  </div>
                )}
                {reel.preset === 'slides' && !rendering && (
                  <GhostButton onClick={() => void saveSlides()} disabled={!!job || savingSlides} className="flex w-full items-center justify-center gap-2">
                    {savingSlides ? <Loader2 className="h-4 w-4 animate-spin" /> : <Images className="h-4 w-4" />} Save slides as pictures
                  </GhostButton>
                )}
                {reel.renderPath && (
                  <button onClick={() => void window.marketo.app.showItemInFolder(reel.renderPath!)} className="flex w-full items-center gap-2 truncate text-left font-mono text-[11px] text-krypt-muted hover:text-white">
                    <FolderOpen className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{reel.renderPath}</span>
                  </button>
                )}
              </Card>

              <Card padded={false} className="space-y-3 p-4">
                {preset.fields.filter((f) => !f.hidden).map((f) => (
                  <div key={f.key}>
                    <label className="label" title={f.help}>
                      {f.label}
                    </label>
                    {isStory && f.key === 'beats' ? (
                      <BeatEditor preset={reel?.preset} value={String(fields.beats ?? f.default)} onChange={(v) => setField('beats', v)} starts={starts} onSeek={(t) => setSeek((s) => ({ t, n: (s?.n ?? 0) + 1 }))} help={f.help} />
                    ) : f.key === 'asker_voice' ? (
                      // A second voice of the same kind as the reel's (ElevenLabs with ElevenLabs, built-in with built-in).
                      <select className="input" value={String(fields.asker_voice ?? '') || 'none'} onChange={(e) => setField('asker_voice', e.target.value)}>
                        <option value="none" className="bg-krypt-panel">
                          No second voice
                        </option>
                        {(String(fields.voice ?? '').startsWith('el:') ? (db.settings.eleven?.voices ?? []).map((v) => [`el:${v.id}`, v.name]) : VOICES.map((v) => [v[0], v[1]]))
                          .filter(([id]) => id !== String(fields.voice ?? ''))
                          .map(([id, name]) => (
                            <option key={id} value={id} className="bg-krypt-panel">
                              {name}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <FieldInput field={f} value={fields[f.key] ?? f.default} onChange={(v) => setField(f.key, v)} />
                    )}
                    {f.help && (f.type === 'lines' || f.type === 'file') && !(isStory && f.key === 'beats') && <div className="mt-1 text-[11px] text-krypt-muted">{f.help}</div>}
                    {f.key === 'voice' && (
                      <div className="mt-2 flex items-center gap-2">
                        <select
                          className="input py-1.5 text-xs"
                          value=""
                          onChange={(e) => {
                            const t = e.target.value === 'default' ? (db.settings.voice ?? DEFAULT_TUNE) : db.voices.find((v) => v.id === e.target.value);
                            if (t) for (const [k, v] of Object.entries(tuneToFields(t))) setField(k, v);
                          }}
                        >
                          <option value="" className="bg-krypt-panel">
                            Use one of my voices…
                          </option>
                          <option value="default" className="bg-krypt-panel">
                            My default ({describeTune(db.settings.voice ?? DEFAULT_TUNE)})
                          </option>
                          {db.voices.map((v) => (
                            <option key={v.id} value={v.id} className="bg-krypt-panel">
                              {v.name} ({describeTune(v)})
                            </option>
                          ))}
                        </select>
                        <GhostButton small className="shrink-0" onClick={() => go('voices')}>
                          <Mic className="h-3.5 w-3.5" /> Hear voices
                        </GhostButton>
                      </div>
                    )}
                  </div>
                ))}
              </Card>

              <Card padded={false} className="space-y-3 p-4">
                <div>
                  <label className="label">Caption</label>
                  <textarea className="input min-h-[90px]" value={caption} onChange={(e) => setCaption(e.target.value)} onBlur={() => caption !== (reel.caption ?? '') && void patch({ caption })} placeholder="One line. Link in bio." />
                </div>
                <div>
                  <label className="label">Hashtags</label>
                  <input
                    className="input font-mono text-xs"
                    defaultValue={(reel.hashtags ?? []).join(' ')}
                    key={`${reel.id}-${(reel.hashtags ?? []).join(' ')}`}
                    onBlur={(e) => void patch({ hashtags: e.target.value.split(/[\s,]+/).map((h) => h.replace(/^#?/, '#')).filter((h) => h.length > 1) })}
                    placeholder="#memecoin #solana #crypto"
                  />
                </div>
                <GhostButton small onClick={() => void window.marketo.app.copyText(`${caption}\n\n${(reel.hashtags ?? []).join(' ')}`.trim()).then(() => toast('ok', 'Caption copied.'))}>
                  <Copy className="h-3.5 w-3.5" /> Copy caption + tags
                </GhostButton>
              </Card>
            </div>
          )}
        </div>
      </div>
      {asking && reel && (
        <DeleteReelsDialog
          reels={[reel]}
          onClose={(deleted) => {
            setAsking(false);
            if (deleted) select(null);
          }}
        />
      )}
    </Page>
  );
}
