import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, KeyRound, Loader2, Play, Plus, RefreshCw, Square, Star } from 'lucide-react';
import type { ElevenModel, ElevenSettings, ElevenStatus } from '@shared/types';
import { ELEVEN_AFFILIATE_NOTE, ELEVEN_KEYS_URL as KEYS_URL, ELEVEN_SIGNUP_URL as SIGNUP_URL, cleanTune, isEleven } from '@shared/voice';
import { Card, GhostButton, PrimaryButton } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// ElevenLabs with the user's own key: connect, set a monthly credit budget,
// and pick the voice new reels are rendered with. Previews of a reel have no
// narration; ElevenLabs is only paid for when a reel is rendered.

const MODELS: Array<[ElevenModel, string, string]> = [
  ['eleven_multilingual_v2', 'Multilingual v2', 'Best quality narration. 1 credit per character.'],
  ['eleven_flash_v2_5', 'Flash v2.5', 'Fast and half the credits, a little less natural.'],
  ['eleven_v3', 'v3', 'Most expressive. 1 credit per character; less tested here.'],
];

const n = (x: number | undefined): string => (x ?? 0).toLocaleString();

export function ElevenCard() {
  const db = useApp((s) => s.db)!;
  const toast = useApp((s) => s.toast);
  const cfg: ElevenSettings = db.settings.eleven ?? {};
  const [st, setSt] = useState<ElevenStatus | null>(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [budget, setBudget] = useState(String(cfg.budget ?? ''));
  const [lib, setLib] = useState('');
  const [libName, setLibName] = useState('');
  const audio = useRef<HTMLAudioElement | null>(null);

  const refresh = (force = false): void => void window.marketo.eleven.status(force).then(setSt);
  useEffect(() => {
    refresh();
    return () => audio.current?.pause();
  }, []);
  useEffect(() => setBudget(String(cfg.budget ?? '')), [cfg.budget]);

  const save = async (patch: Partial<ElevenSettings>): Promise<void> => {
    const r = await window.marketo.db.updateSettings({ eleven: { ...cfg, ...patch } });
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    else refresh();
  };

  const connect = async (k: string): Promise<void> => {
    setBusy('key');
    const r = await window.marketo.eleven.setKey(k);
    setBusy(null);
    if (!r.ok) return toast('error', r.message ?? 'That key did not work.');
    setKey('');
    setSt(r.data ?? null);
    toast('ok', k ? 'ElevenLabs connected.' : 'ElevenLabs key removed.');
  };

  const listVoices = async (): Promise<void> => {
    setBusy('voices');
    const r = await window.marketo.eleven.voices();
    setBusy(null);
    if (!r.ok) toast('error', r.message ?? 'Could not list the voices.');
  };

  const addVoice = async (): Promise<void> => {
    setBusy('add');
    const r = await window.marketo.eleven.addVoice(lib, libName);
    setBusy(null);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not add the voice.');
    setLib('');
    setLibName('');
    toast('ok', `${r.data.name} is in your voices. Press its star to use it for new reels.`);
  };

  const play = (id: string, url?: string): void => {
    audio.current?.pause();
    if (playing === id || !url) return setPlaying(null);
    const a = new Audio(url);
    audio.current = a;
    a.onended = () => audio.current === a && setPlaying(null);
    void a.play().then(() => setPlaying(id), () => toast('error', 'Could not play the sample.'));
  };

  const current = db.settings.voice?.voice ?? '';
  const useVoice = async (id: string): Promise<void> => {
    const r = await window.marketo.db.updateSettings({ voice: cleanTune({ voice: `el:${id}`, speed: 1 }) });
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    toast('ok', 'New story reels will be rendered with this voice. Previews stay silent until you render, so nothing is spent before that.');
  };

  if (!st) return null;

  if (!st.hasKey)
    return (
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">ElevenLabs</h3>
          <div className="flex items-center gap-4">
            <button onClick={() => void window.marketo.app.openExternal(SIGNUP_URL)} className="flex items-center gap-1 text-xs text-krypt-purple hover:underline">
              Create an account <ExternalLink className="h-3 w-3" />
            </button>
            <button onClick={() => void window.marketo.app.openExternal(KEYS_URL)} className="flex items-center gap-1 text-xs text-krypt-purple hover:underline">
              Get a key <ExternalLink className="h-3 w-3" />
            </button>
          </div>
        </div>
        <p className="text-sm text-white/80">More natural narration, including a clone of your own voice, with your own ElevenLabs plan. It is only paid for when a reel is rendered to post; previews stay free. Give the key Text to Speech, Voices (read) and User (read) access.</p>
        <div className="flex items-center gap-2">
          <input aria-label="ElevenLabs API key" type="password" className="input font-mono text-sm" placeholder="sk_…" value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && key.trim() && void connect(key)} />
          <PrimaryButton className="shrink-0" disabled={!key.trim() || busy === 'key'} onClick={() => void connect(key)}>
            {busy === 'key' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Connect
          </PrimaryButton>
        </div>
        <p className="text-[11px] text-krypt-muted">The key is encrypted on this computer and only sent to ElevenLabs. "Create an account" is Krypt's affiliate link: {ELEVEN_AFFILIATE_NOTE}.</p>
      </Card>
    );

  const cap = st.cap ?? st.limit ?? 0;
  const ratio = cap ? Math.min(1, (st.used ?? 0) / cap) : 0;
  const voices = cfg.voices ?? [];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">ElevenLabs{st.tier ? ` · ${st.tier}` : ''}</h3>
          {st.error ? (
            <div className="mt-1 text-sm text-rose-300">{st.error}</div>
          ) : (
            <div className="mt-1 font-mono text-sm text-white">
              {n(st.used)} / {n(cap)} credits this cycle{st.resetAt ? <span className="text-krypt-muted"> · resets {new Date(st.resetAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> : null}
            </div>
          )}
        </div>
        <GhostButton small onClick={() => refresh(true)}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </GhostButton>
        <GhostButton small onClick={() => void connect('')}>
          Remove key
        </GhostButton>
      </div>
      {!st.error && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className={cls('h-full rounded-full', ratio > 0.9 ? 'bg-rose-400' : ratio > 0.75 ? 'bg-amber-400' : 'bg-krypt-gradient')} style={{ width: `${ratio * 100}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-krypt-muted">
            Today: {n(st.todaySpent)} of about {n(st.todayAllowance)} credits (the rest of the budget spread over the days left). Past 1.5× that, renders switch to Flash; when the budget is spent, ElevenLabs reels wait until it resets (they are never switched to another voice).
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <label className="text-sm font-semibold text-white">Monthly budget</label>
          <input aria-label="Monthly credit budget" className="input mt-1 font-mono" inputMode="numeric" placeholder={st.limit ? `${n(st.limit)} (whole plan)` : 'whole plan'} value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d]/g, ''))} onBlur={() => void save({ budget: budget ? Number(budget) : undefined })} />
          <div className="mt-1 text-[11px] text-krypt-muted">Credits Marketo may use per cycle. Empty = the whole plan.</div>
        </div>
        <div>
          <label className="text-sm font-semibold text-white">Model</label>
          <select aria-label="ElevenLabs model" className="input mt-1" value={cfg.model ?? 'eleven_multilingual_v2'} onChange={(e) => void save({ model: e.target.value as ElevenModel })}>
            {MODELS.map(([id, name]) => (
              <option key={id} value={id} className="bg-krypt-panel">
                {name}
              </option>
            ))}
          </select>
          <div className="mt-1 text-[11px] text-krypt-muted">{MODELS.find((m) => m[0] === (cfg.model ?? 'eleven_multilingual_v2'))?.[2]}</div>
        </div>
        <div>
          <div className="text-sm font-semibold text-white">If ElevenLabs fails</div>
          <div className="mt-1 text-[11px] text-krypt-muted">Previews have no narration. A render tries each line a few times; if ElevenLabs still fails (or the budget is spent), the reel waits and shows up under Needs you. It is never posted in another voice.</div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <div className="label mb-0">Your ElevenLabs voices</div>
          <GhostButton small disabled={busy === 'voices'} onClick={() => void listVoices()}>
            {busy === 'voices' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Reload list
          </GhostButton>
        </div>
        {voices.length === 0 && <p className="text-sm text-krypt-muted">No voices listed yet. Add or clone one in ElevenLabs (My Voices), then reload the list.</p>}
        <div className="mb-2 flex items-center gap-2">
          <input aria-label="Voice Library link" className="input font-mono text-xs" spellCheck={false} placeholder="Add from the Voice Library: paste its link (…voice-library?voiceId=…)" value={lib} onChange={(e) => setLib(e.target.value)} />
          <input aria-label="Voice name (helps find it)" className="input w-36 shrink-0 text-xs" placeholder="Name (optional)" value={libName} onChange={(e) => setLibName(e.target.value)} />
          <GhostButton small disabled={!lib.trim() || busy === 'add'} onClick={() => void addVoice()}>
            {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Add
          </GhostButton>
        </div>
        <div className="grid max-h-[320px] gap-1 overflow-auto lg:grid-cols-2">
          {voices.map((v) => {
            const on = current === `el:${v.id}`;
            const mine = v.category === 'cloned';
            return (
              <div key={v.id} className={cls('flex items-center gap-2 rounded-xl border px-2 py-1.5', on ? 'border-krypt-purple/50 bg-krypt-purple/10' : 'border-transparent hover:border-white/10 hover:bg-white/5')}>
                <button aria-label={`Play ${v.name}`} disabled={!v.preview} onClick={() => play(v.id, v.preview)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:border-krypt-purple/60 disabled:opacity-30">
                  {playing === v.id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-white">{v.name}</span>
                    {mine && <span className="rounded-full bg-krypt-purple/20 px-1.5 text-[10px] text-krypt-purple">your clone</span>}
                  </div>
                  <div className="truncate text-xs text-krypt-muted">{v.about || v.category}</div>
                </div>
                <button onClick={() => void useVoice(v.id)} disabled={on} title={on ? 'New reels use this' : 'Use for new reels'} className="shrink-0 rounded-md p-1.5 text-krypt-muted hover:text-white disabled:text-amber-300">
                  {on ? <Check className="h-4 w-4" /> : <Star className="h-4 w-4" />}
                </button>
              </div>
            );
          })}
        </div>
        {isEleven(current) && <p className="mt-2 text-xs text-krypt-muted">New story reels are rendered with an ElevenLabs voice. Pick a voice on the left and press "Use for new reels" to go back to a free one.</p>}
      </div>
    </Card>
  );
}
