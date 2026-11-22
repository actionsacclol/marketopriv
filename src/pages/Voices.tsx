import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Play, Plus, RotateCcw, Save, Square, Star, Trash2, X } from 'lucide-react';
import { DEFAULT_TUNE, FEATURED_VOICES, TUNE_RANGE, VOICES, cleanTune, describeTune, isEleven, tuneToFields, type SavedVoice, type VoiceTune } from '@shared/voice';
import { ElevenCard } from '../components/ElevenCard';
import { TopVoices } from '../components/TopVoices';
import { BUILTIN_SAY, cleanSayAs, setSayAs, type SayAs } from '@shared/pronounce';
import { isVoiced } from '@shared/presets';
import { Card, GhostButton, Page, PrimaryButton } from '../components/ui';
import { VoiceInstall, useVoiceStatus } from '../components/VoiceInstall';
import { useApp } from '../state/store';
import { speakClip } from '../render/voice';
import { mediaUrl } from '../render/media';
import { cls } from '../lib/format';

// Hear every narrator voice, tune one (pace, pitch, tone, a second voice mixed
// in), keep it under a name and make it what new reels start with. What plays
// here is generated exactly the way a reel's narration is.

const SAMPLES = [
  'Everyone says copy the smart money. We tested it. Here is what actually happened.',
  'Nine million trades. Ten groups of wallets. Zero of them made money after costs.',
  'Here is the part nobody tells you. It takes ten minutes, and it changes how you see the whole thing.',
];

const load = <T,>(key: string, fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};
const store = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* not remembered */
  }
};

const same = (a: VoiceTune, b: VoiceTune): boolean => JSON.stringify(cleanTune(a)) === JSON.stringify(cleanTune(b));
const signed = (n: number, unit: string): string => (n === 0 ? 'off' : `${n > 0 ? '+' : '−'}${Math.abs(n)}${unit}`);

function Slider({ label, hint, value, range, show, onChange, disabled }: { label: string; hint: string; value: number; range: { min: number; max: number; step: number }; show: string; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <div className={cls(disabled && 'opacity-40')}>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-semibold text-white">{label}</label>
        <span className="font-mono text-xs text-krypt-purple">{show}</span>
      </div>
      <input type="range" aria-label={label} className="mt-1 w-full accent-[#A855F7]" min={range.min} max={range.max} step={range.step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="text-[11px] text-krypt-muted">{hint}</div>
    </div>
  );
}

function Row({ active, title, sub, busy, playing, onPick, onPlay, badge, onDelete }: { active: boolean; title: string; sub: string; busy: boolean; playing: boolean; onPick: () => void; onPlay: () => void; badge?: React.ReactNode; onDelete?: () => void }) {
  return (
    <div data-voice-row className={cls('group flex items-center gap-2 rounded-xl border px-2 py-1.5 transition', active ? 'border-krypt-purple/50 bg-krypt-purple/10' : 'border-transparent hover:border-white/10 hover:bg-white/5')}>
      <button aria-label={`Play ${title}`} title="Play" onClick={onPlay} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:border-krypt-purple/60 hover:bg-krypt-purple/20">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Square className="h-3.5 w-3.5" /> : <Play className="h-4 w-4" />}
      </button>
      <button onClick={onPick} className="min-w-0 flex-1 text-left">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-white">{title}</span>
          {badge}
        </div>
        <div className="truncate text-xs text-krypt-muted">{sub}</div>
      </button>
      {onDelete && (
        <button aria-label={`Delete ${title}`} title="Delete this saved voice" onClick={onDelete} className="shrink-0 rounded-md p-1 text-krypt-muted opacity-0 hover:text-rose-300 group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export default function Voices() {
  const db = useApp((s) => s.db)!;
  const toast = useApp((s) => s.toast);
  const selectedReel = useApp((s) => s.selectedReel);
  const status = useVoiceStatus();
  const preferred = db.settings.voice ?? DEFAULT_TUNE;

  // The tuner is for the free on-device voices; an ElevenLabs default starts it on the built-in one.
  const [tune, setTuneRaw] = useState<VoiceTune>(() => {
    const t = cleanTune(load<VoiceTune>('marketo.voices.tune', isEleven(preferred.voice) ? DEFAULT_TUNE : preferred));
    return isEleven(t.voice) ? DEFAULT_TUNE : t;
  });
  const [text, setText] = useState<string>(() => load('marketo.voices.text', SAMPLES[0]));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);
  const seq = useRef(0);
  const warmed = useRef(false);

  const setTune = (patch: Partial<VoiceTune>): void =>
    setTuneRaw((t) => {
      // A voice can't be blended with itself; picking a second voice starts it at 30%.
      const next = { ...t, ...patch };
      if (patch.blend && !t.blend && !next.blendAmount) next.blendAmount = 0.3;
      if (next.blend === next.voice) next.blend = '';
      const clean = cleanTune(next);
      // cleanTune drops a blend at 0%; keep the choice visible while the slider is there.
      return next.blend && next.blend !== next.voice && !clean.blend ? { ...clean, blend: next.blend, blendAmount: 0 } : clean;
    });
  useEffect(() => store('marketo.voices.tune', tune), [tune]);
  useEffect(() => store('marketo.voices.text', text), [text]);

  const stop = (): void => {
    audio.current?.pause();
    audio.current = null;
    setPlaying(null);
  };
  useEffect(() => () => audio.current?.pause(), []);
  // Changing the tuning or the text while its clip plays stops it, so the next click plays the new version.
  useEffect(() => {
    if (playing === 'tuner') stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tune, text]);

  const play = async (t: VoiceTune, tag: string, line?: string): Promise<void> => {
    if (playing === tag) return stop();
    if (!status?.installed) return toast('warn', 'Download the voices first (the button at the top of this page).');
    const run = ++seq.current;
    stop();
    setBusy(tag);
    setNote('');
    try {
      const clip = await speakClip((line ?? text).trim() || SAMPLES[0], t, t.speed, {
        prefix: 'try-',
        onStatus: () => run === seq.current && setNote(warmed.current ? 'Generating…' : 'Loading the voices. The first one takes a few seconds; after that it is quick.'),
      });
      warmed.current = true;
      if (run !== seq.current) return;
      const a = new Audio(mediaUrl(clip.file));
      audio.current = a;
      a.onended = () => audio.current === a && setPlaying(null);
      await a.play();
      setPlaying(tag);
    } catch (e) {
      if (run === seq.current) toast('error', (e as Error).message);
    } finally {
      if (run === seq.current) {
        setBusy(null);
        setNote('');
      }
    }
  };

  const pickBuiltin = (id: string, andPlay: boolean): void => {
    const next = cleanTune({ ...tune, voice: id, ...(tune.blend === id ? { blend: '', blendAmount: 0 } : {}) });
    setTuneRaw(next);
    if (andPlay) void play(next, id);
  };
  const pickSaved = (v: SavedVoice, andPlay: boolean): void => {
    setTuneRaw(cleanTune(v));
    setName(v.name);
    if (andPlay) void play(v, v.id);
  };

  const saveVoice = async (): Promise<void> => {
    if (!name.trim()) return toast('warn', 'Give it a name first.');
    const r = await window.marketo.voice.saveVoice({ ...cleanTune(tune), name: name.trim() });
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not save.');
    toast('ok', `Saved "${r.data.name}". Pick it in Studio, or ask your AI for it by name.`);
  };
  const makeDefault = async (t: VoiceTune | null): Promise<void> => {
    const r = await window.marketo.db.updateSettings({ voice: t ? cleanTune(t) : undefined });
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    toast('ok', t ? 'New story reels will start with this voice.' : 'Back to the built-in default.');
  };

  // Put the tuned voice on an existing reel.
  const story = db.reels.filter((r) => isVoiced(r.preset));
  const [target, setTarget] = useState('');
  const targetId = story.some((r) => r.id === target) ? target : story.some((r) => r.id === selectedReel) ? selectedReel! : (story[0]?.id ?? '');
  const applyToReel = async (): Promise<void> => {
    const reel = story.find((r) => r.id === targetId);
    if (!reel) return;
    const r = await window.marketo.db.updateReel(reel.id, { fields: tuneToFields(cleanTune(tune)) });
    if (!r.ok) return toast('error', r.message ?? 'Could not change the reel.');
    toast('ok', `"${reel.title}" now uses this voice. It is re-narrated when you open it in Studio or render it.`);
  };

  // Pronunciation list.
  const sayAs = db.settings.sayAs ?? [];
  const [word, setWord] = useState('');
  const [say, setSay] = useState('');
  const saveSayAs = async (list: SayAs[]): Promise<boolean> => {
    const clean = cleanSayAs(list);
    setSayAs(clean);
    const r = await window.marketo.db.updateSettings({ sayAs: clean });
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    return r.ok;
  };
  const addSayAs = async (): Promise<void> => {
    const w = word.trim();
    const s = say.trim();
    if (!w || !s) return toast('warn', 'Type the word, and how it should sound.');
    if (/\s/.test(w)) return toast('warn', 'One word at a time (no spaces in the word).');
    if (!(await saveSayAs([...sayAs, { word: w, say: s }]))) return;
    setWord('');
    setSay('');
    void play(tune, `say:${w.toLowerCase()}`, w);
  };

  const featured = VOICES.filter(([id]) => FEATURED_VOICES.includes(id)).sort((a, b) => FEATURED_VOICES.indexOf(a[0]) - FEATURED_VOICES.indexOf(b[0]));
  const others = VOICES.filter(([id]) => !FEATURED_VOICES.includes(id));
  const activeSaved = db.voices.find((v) => same(v, tune));
  const isDefault = same(tune, preferred);
  const neutral = !tune.blend && !tune.pitch && !tune.warmth && !tune.clarity;
  const builtins = Object.keys(BUILTIN_SAY);

  const builtinRow = ([id, n, about]: (typeof VOICES)[number]): React.ReactNode => (
    <Row
      key={id}
      active={tune.voice === id && !activeSaved}
      title={n}
      sub={about}
      busy={busy === id}
      playing={playing === id}
      onPick={() => pickBuiltin(id, false)}
      onPlay={() => (playing === id ? stop() : pickBuiltin(id, true))}
      badge={preferred.voice === id && !db.voices.some((v) => same(v, preferred)) ? <Star className="h-3 w-3 shrink-0 fill-amber-300 text-amber-300" aria-label="Default for new reels" /> : undefined}
    />
  );

  return (
    <Page title="Voices" subtitle={`${VOICES.length} narrator voices, all on this computer. Hear them, tune one, and make it what new reels start with.`} flush>
      <div className="flex h-full min-h-0 gap-6 px-8 pb-8">
        <div className="flex w-[300px] shrink-0 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-auto pr-1">
            {db.voices.length > 0 && (
              <div>
                <div className="label">My voices</div>
                <div className="space-y-0.5">
                  {db.voices.map((v) => (
                    <Row
                      key={v.id}
                      active={activeSaved?.id === v.id}
                      title={v.name}
                      sub={describeTune(v)}
                      busy={busy === v.id}
                      playing={playing === v.id}
                      onPick={() => pickSaved(v, false)}
                      onPlay={() => (playing === v.id ? stop() : pickSaved(v, true))}
                      badge={same(v, preferred) ? <Star className="h-3 w-3 shrink-0 fill-amber-300 text-amber-300" aria-label="Default for new reels" /> : undefined}
                      onDelete={() => void window.marketo.voice.deleteVoice(v.id)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="label">Start with these</div>
              <div className="space-y-0.5">{featured.map(builtinRow)}</div>
            </div>
            <div>
              <div className="label">More voices</div>
              <div className="space-y-0.5">{others.map(builtinRow)}</div>
            </div>
          </div>
        </div>

        <div className="min-h-0 min-w-0 flex-1 space-y-4 overflow-auto pr-1">
          {status && !status.installed && <VoiceInstall st={status} />}
          <ElevenCard />
          <TopVoices />

          <Card className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">What it says</h3>
              <div className="flex gap-1.5">
                {SAMPLES.map((s, i) => (
                  <button key={s} onClick={() => setText(s)} className={cls('rounded-full border px-2.5 py-1 text-[11px] transition', text === s ? 'border-krypt-purple/60 bg-krypt-purple/15 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
                    {['Hook', 'Numbers', 'Calm'][i]}
                  </button>
                ))}
              </div>
            </div>
            <textarea aria-label="Sample text" className="input min-h-[64px] resize-y" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a line from your own reel." />
          </Card>

          <Card className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Tune it</h3>
                <div className="mt-1 truncate text-lg font-semibold text-white" data-tune>
                  {activeSaved ? `${activeSaved.name}: ` : ''}
                  {describeTune(tune)}
                </div>
              </div>
              <GhostButton small disabled={neutral && tune.speed === DEFAULT_TUNE.speed} onClick={() => setTuneRaw(cleanTune({ voice: tune.voice }))}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </GhostButton>
              <PrimaryButton onClick={() => void play(tune, 'tuner')}>
                {busy === 'tuner' ? <Loader2 className="h-4 w-4 animate-spin" /> : playing === 'tuner' ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {playing === 'tuner' ? 'Stop' : 'Listen'}
              </PrimaryButton>
            </div>
            {note && <div className="text-xs text-krypt-muted">{note}</div>}

            <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
              <Slider label="Speed" hint="1 is the voice's natural pace. Reels usually sit between 1.05 and 1.25." value={tune.speed} range={TUNE_RANGE.speed} show={`${tune.speed}×`} onChange={(v) => setTune({ speed: v })} />
              <Slider label="Pitch" hint="Left is deeper, right is higher. Small moves sound most natural." value={tune.pitch} range={TUNE_RANGE.pitch} show={signed(tune.pitch, '')} onChange={(v) => setTune({ pitch: v })} />
              <Slider label="Warmth" hint="More or less low end (body)." value={tune.warmth} range={TUNE_RANGE.warmth} show={signed(tune.warmth, ' dB')} onChange={(v) => setTune({ warmth: v })} />
              <Slider label="Clarity" hint="More or less high end (crispness on phone speakers)." value={tune.clarity} range={TUNE_RANGE.clarity} show={signed(tune.clarity, ' dB')} onChange={(v) => setTune({ clarity: v })} />
              <div>
                <label className="text-sm font-semibold text-white">Blend with a second voice</label>
                <select aria-label="Blend with" className="input mt-1" value={tune.blend} onChange={(e) => setTune({ blend: e.target.value, ...(e.target.value ? {} : { blendAmount: 0 }) })}>
                  <option value="" className="bg-krypt-panel">
                    None
                  </option>
                  {VOICES.filter(([id]) => id !== tune.voice).map(([id, n, about]) => (
                    <option key={id} value={id} className="bg-krypt-panel">
                      {n} · {about}
                    </option>
                  ))}
                </select>
                <div className="mt-1 text-[11px] text-krypt-muted">Mixes two voices into a new one. Still one voice for the whole reel.</div>
              </div>
              <Slider label="How much of the second voice" hint="30% keeps the first voice's character with a touch of the second." value={tune.blendAmount} range={TUNE_RANGE.blendAmount} show={`${Math.round(tune.blendAmount * 100)}%`} onChange={(v) => setTune({ blendAmount: v })} disabled={!tune.blend} />
            </div>

            <div className="grid gap-3 border-t border-white/5 pt-4 lg:grid-cols-2">
              <div className="flex items-center gap-2">
                <input aria-label="Voice name" className="input" placeholder="Name it, e.g. Desk narrator" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void saveVoice()} />
                <GhostButton className="shrink-0" onClick={() => void saveVoice()}>
                  <Save className="h-4 w-4" /> {db.voices.some((v) => v.name.toLowerCase() === name.trim().toLowerCase()) ? 'Update' : 'Save'}
                </GhostButton>
              </div>
              <div className="flex items-center gap-2">
                <GhostButton className="flex-1" disabled={isDefault} onClick={() => void makeDefault(tune)}>
                  {isDefault ? <Check className="h-4 w-4 text-emerald-300" /> : <Star className="h-4 w-4" />} {isDefault ? 'New reels use this' : 'Use for new reels'}
                </GhostButton>
                {db.settings.voice && (
                  <GhostButton small onClick={() => void makeDefault(null)}>
                    Built-in default
                  </GhostButton>
                )}
              </div>
              {story.length > 0 && (
                <div className="flex items-center gap-2 lg:col-span-2">
                  <select aria-label="Reel" className="input" value={targetId} onChange={(e) => setTarget(e.target.value)}>
                    {story.map((r) => (
                      <option key={r.id} value={r.id} className="bg-krypt-panel">
                        {r.title}
                      </option>
                    ))}
                  </select>
                  <GhostButton className="shrink-0" onClick={() => void applyToReel()}>
                    Put this voice on that reel
                  </GhostButton>
                </div>
              )}
            </div>
            <p className="text-xs text-krypt-muted">New reels start with: {describeTune(preferred)}. A reel keeps the voice it was made with until you change it.</p>
          </Card>

          <Card className="space-y-3">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Say it right</h3>
              <p className="mt-1 text-sm text-white/80">When the narrator says a name wrong, teach it here. Write it the way it sounds; a hyphen joins syllables into one word (so-lah-nah).</p>
            </div>
            {sayAs.map((e) => {
              const tag = `say:${e.word.toLowerCase()}`;
              return (
                <div key={e.word} data-say-row className="flex items-center gap-2 text-sm">
                  <button aria-label={`Play ${e.word}`} onClick={() => void play(tune, tag, e.word)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:border-krypt-purple/60">
                    {busy === tag ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : playing === tag ? <Square className="h-3 w-3" /> : <Play className="h-3.5 w-3.5" />}
                  </button>
                  <span className="w-40 truncate font-mono text-white">{e.word}</span>
                  <span className="text-krypt-muted">is said</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-krypt-purple">{e.say}</span>
                  <button aria-label={`Remove ${e.word}`} onClick={() => void saveSayAs(sayAs.filter((x) => x.word !== e.word))} className="text-krypt-muted hover:text-rose-300">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <input aria-label="Word" className="input w-44 font-mono text-sm" placeholder="Word, e.g. Kalshi" value={word} onChange={(e) => setWord(e.target.value)} />
              <input aria-label="Say it like" className="input font-mono text-sm" placeholder="How it sounds, e.g. kal-she" value={say} onChange={(e) => setSay(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addSayAs()} />
              <GhostButton className="shrink-0" onClick={() => void addSayAs()}>
                <Plus className="h-4 w-4" /> Add and hear
              </GhostButton>
            </div>
            <p className="text-xs text-krypt-muted">
              Already built in ({builtins.length}): {builtins.join(', ')}. Web addresses (krypt.cc), amounts ($3B, 9.3M, 50K), signed percentages (+12%) and version numbers are read out properly too. Yours win over the built-in ones.
            </p>
          </Card>
          <p className="px-1 text-xs text-krypt-muted">Clips you play here are only for listening and are cleared out by themselves.</p>
        </div>
      </div>
    </Page>
  );
}
