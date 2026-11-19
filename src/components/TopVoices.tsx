import { useEffect, useRef, useState } from 'react';
import { Check, FlaskConical, Loader2, Play, Plus, RefreshCw, Square, X } from 'lucide-react';
import type { ElevenStatus, LibrarySort, LibraryVoice } from '@shared/types';
import { LIBRARY_SNAPSHOT_DATE, LIBRARY_TOP } from '@shared/elLibrary';
import { cleanTune } from '@shared/voice';
import { Card, GhostButton } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// The ElevenLabs Voice Library's top voices, with their samples. The samples are
// public, so they play without a key (from the snapshot shipped with the app);
// with a key the list is loaded live and a voice is added and used in one click.

const SORTS: Array<[LibrarySort, string]> = [
  ['usage_character_count_1y', 'Most used'],
  ['trending', 'Trending'],
];
const USES: Array<[string, string]> = [
  ['', 'All'],
  ['social media', 'Social media'],
  ['narrative story', 'Storytelling'],
  ['conversational', 'Conversational'],
  ['advertisement', 'Ads'],
  ['informative educational', 'Explainers'],
];

const big = (n: number): string => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${Math.round(n / 1e6)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n));

export function TopVoices() {
  const db = useApp((s) => s.db)!;
  const toast = useApp((s) => s.toast);
  const [st, setSt] = useState<ElevenStatus | null>(null);
  const [sort, setSort] = useState<LibrarySort>('usage_character_count_1y');
  const [use, setUse] = useState('');
  const [live, setLive] = useState<LibraryVoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => void window.marketo.eleven.status().then(setSt), []);
  useEffect(() => () => audio.current?.pause(), []);

  const load = async (): Promise<void> => {
    setLoading(true);
    const r = await window.marketo.eleven.library(sort, use);
    setLoading(false);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not load the Voice Library.');
    setLive(r.data);
  };
  // With a key, the live list follows the sort and filter.
  useEffect(() => {
    if (st?.hasKey) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.hasKey, sort, use]);

  const snapshot = LIBRARY_TOP.filter((v) => (!use || v.useCase === use) && (sort === 'trending' ? v.tag === 'trending' : true)).sort((a, b) => (sort === 'trending' ? 0 : b.uses - a.uses));
  const list: LibraryVoice[] = live ?? snapshot;
  const mine = new Set((db.settings.eleven?.voices ?? []).map((v) => v.id));
  const current = db.settings.voice?.voice ?? '';
  const testing = (db.settings.voiceTest ?? []).filter((v) => v !== current);
  const nameOf = (voice: string): string => {
    const id = voice.slice(3);
    const n = db.settings.eleven?.voices?.find((v) => v.id === id)?.name ?? LIBRARY_TOP.find((v) => v.id === id)?.name ?? live?.find((v) => v.id === id)?.name ?? 'ElevenLabs voice';
    return n.split(/ [-–] /)[0].trim();
  };

  const play = (v: LibraryVoice): void => {
    audio.current?.pause();
    if (playing === v.id) return setPlaying(null);
    const a = new Audio(v.preview);
    audio.current = a;
    a.onended = () => audio.current === a && setPlaying(null);
    void a.play().then(() => setPlaying(v.id), () => toast('error', 'Could not play the sample.'));
  };

  const setTest = async (next: string[]): Promise<void> => {
    const s = await window.marketo.db.updateSettings({ voiceTest: next });
    if (!s.ok) toast('error', s.message ?? 'Could not save.');
  };

  // Voice test: the voice goes into the rotation with the default one; get_performance compares them.
  const testIt = async (v: LibraryVoice): Promise<void> => {
    const key = `el:${v.id}`;
    if (testing.includes(key)) return setTest(testing.filter((x) => x !== key));
    if (testing.length >= 4) return toast('error', 'The test holds 4 voices besides the default. Take one out first.');
    setBusy(v.id);
    if (!mine.has(v.id)) {
      const r = await window.marketo.eleven.addVoice(v.id, v.name, v.owner);
      if (!r.ok) {
        setBusy(null);
        return toast('error', r.message ?? 'Could not add the voice.');
      }
    }
    await setTest([...testing, key]);
    setBusy(null);
    toast('ok', `${v.name.split(' - ')[0]} joins the voice test. Story reels now take turns between the voices, and Results shows which gets more views.`);
  };

  const useIt = async (v: LibraryVoice): Promise<void> => {
    setBusy(v.id);
    if (!mine.has(v.id)) {
      const r = await window.marketo.eleven.addVoice(v.id, v.name, v.owner);
      if (!r.ok) {
        setBusy(null);
        return toast('error', r.message ?? 'Could not add the voice.');
      }
    }
    const s = await window.marketo.db.updateSettings({ voice: cleanTune({ voice: `el:${v.id}`, speed: 1 }) });
    setBusy(null);
    if (!s.ok) return toast('error', s.message ?? 'Could not save.');
    toast('ok', `New story reels will be voiced by ${v.name.split(' - ')[0]}. Previews stay silent until you render.`);
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">Top ElevenLabs voices</h3>
          <p className="mt-0.5 text-xs text-krypt-muted">
            {live ? 'Live from the ElevenLabs Voice Library.' : `The Voice Library's most used and trending English voices (as of ${LIBRARY_SNAPSHOT_DATE}).`} Press play to hear one; samples are free.
            {!st?.hasKey && ' Connect ElevenLabs above to use one in your reels.'}
          </p>
        </div>
        {st?.hasKey && (
          <GhostButton small disabled={loading} onClick={() => void load()}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </GhostButton>
        )}
      </div>
      {current.startsWith('el:') && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-white">
            <FlaskConical className="h-3.5 w-3.5 text-krypt-purple" /> Voice test
          </div>
          {testing.length ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-amber-300/40 px-2 py-0.5 text-amber-200">{nameOf(current)} (default)</span>
              {testing.map((v) => (
                <span key={v} className="flex items-center gap-1 rounded-full border border-krypt-purple/50 bg-krypt-purple/10 py-0.5 pl-2 pr-1 text-white">
                  {nameOf(v)}
                  <button aria-label={`Take ${nameOf(v)} out of the test`} onClick={() => void setTest(testing.filter((x) => x !== v))} className="rounded-full p-0.5 text-krypt-muted hover:text-white">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <span className="text-krypt-muted">Story reels take turns on each platform until every voice has 3 measured posts there; then the winner voices most of them.</span>
            </div>
          ) : (
            <p className="mt-1 text-krypt-muted">Off. Press the flask on a voice to test it against {nameOf(current)}: your AI takes turns between the voices on story reels and compares their views. It costs the same credits as one voice.</p>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {SORTS.map(([id, label]) => (
          <button key={id} onClick={() => setSort(id)} className={cls('rounded-full border px-2.5 py-1 text-xs', sort === id ? 'border-krypt-purple/60 bg-krypt-purple/15 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
            {label}
          </button>
        ))}
        <span className="mx-1 w-px bg-white/10" />
        {USES.map(([id, label]) => (
          <button key={id || 'all'} onClick={() => setUse(id)} className={cls('rounded-full border px-2.5 py-1 text-xs', use === id ? 'border-krypt-purple/60 bg-krypt-purple/15 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
            {label}
          </button>
        ))}
      </div>
      {list.length === 0 && <p className="text-sm text-krypt-muted">{loading ? 'Loading…' : 'No voices for this filter.'}</p>}
      <div className="grid max-h-[420px] gap-1 overflow-auto lg:grid-cols-2">
        {list.map((v) => {
          const on = current === `el:${v.id}`;
          const inTest = testing.includes(`el:${v.id}`);
          return (
            <div key={v.id} className={cls('flex items-center gap-2 rounded-xl border px-2 py-1.5', on ? 'border-krypt-purple/50 bg-krypt-purple/10' : 'border-transparent hover:border-white/10 hover:bg-white/5')}>
              <button aria-label={`Play ${v.name}`} onClick={() => play(v)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white hover:border-krypt-purple/60">
                {playing === v.id ? <Square className="h-3.5 w-3.5" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-white">{v.name}</div>
                <div className="truncate text-xs text-krypt-muted">
                  {[v.about, v.useCase].filter(Boolean).join(' · ')}
                  {v.uses ? ` · ${big(v.uses)} chars/yr` : ''}
                </div>
              </div>
              {!on && current.startsWith('el:') && (
                <button
                  disabled={!st?.hasKey || busy === v.id}
                  onClick={() => void testIt(v)}
                  aria-label={inTest ? `Take ${v.name} out of the voice test` : `Test ${v.name} against your default voice`}
                  title={st?.hasKey ? (inTest ? 'In the voice test (press to take it out)' : 'Add to the voice test') : 'Connect ElevenLabs first'}
                  className={cls('flex shrink-0 items-center rounded-md p-1 disabled:opacity-40', inTest ? 'text-krypt-purple' : 'text-krypt-muted hover:text-white')}
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                </button>
              )}
              {on ? (
                <span className="flex shrink-0 items-center gap-1 px-1.5 text-xs text-amber-300">
                  <Check className="h-3.5 w-3.5" /> In use
                </span>
              ) : (
                <button
                  disabled={!st?.hasKey || busy === v.id}
                  onClick={() => void useIt(v)}
                  title={st?.hasKey ? (mine.has(v.id) ? 'Use for new reels' : 'Add to your ElevenLabs voices and use for new reels') : 'Connect ElevenLabs first'}
                  className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs text-krypt-muted hover:text-white disabled:opacity-40"
                >
                  {busy === v.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Use
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
