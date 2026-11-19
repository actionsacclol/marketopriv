import { useState } from 'react';
import { Clapperboard, Copy, Images, Trash2, Upload } from 'lucide-react';
import type { RefVideo } from '@shared/types';
import { aspectOf, nearestAccent } from '@shared/refStyle';
import { Card, Empty, GhostButton, PrimaryButton, Section } from '../components/ui';
import { addReferenceVideo } from '../render/refAnalyze';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Reference videos: upload a reel whose edit you like, and any AI can make a
// new one "like this". The hub measures the video here, on this computer.

const url = (p: string): string => window.marketo.app.mediaUrl(p);
const r1 = (x: number): string => (Math.round(x * 10) / 10).toString();

/** The video's rhythm as a strip: one block per section, brighter edges where a hard cut is. */
function Rhythm({ r }: { r: RefVideo }) {
  const p = r.profile;
  const cuts = new Set(p.shots.slice(1).map((s) => s.start));
  return (
    <div className="flex h-5 w-full overflow-hidden rounded-md border border-white/10" title="One block per section. A white edge is a hard cut; a dim one is new text or graphics coming in.">
      {p.sections.map((s, i) => (
        <div
          key={i}
          style={{ width: `${(s.dur / p.seconds) * 100}%` }}
          className={cls('h-full', i % 2 ? 'bg-krypt-purple/35' : 'bg-krypt-purple/20', i > 0 && (cuts.has(s.start) ? 'border-l-2 border-white/80' : 'border-l border-white/25'))}
        />
      ))}
    </div>
  );
}

function RefCard({ r }: { r: RefVideo }) {
  const toast = useApp((s) => s.toast);
  const [name, setName] = useState(r.name);
  const [notes, setNotes] = useState(r.notes ?? '');
  const [frames, setFrames] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const p = r.profile;
  const cuts = p.shots.length - 1;

  const save = async (patch: { name?: string; notes?: string }): Promise<void> => {
    const res = await window.marketo.refs.update(r.id, patch);
    if (!res.ok) toast('error', res.message ?? 'Could not save.');
  };
  const remove = async (): Promise<void> => {
    const res = await window.marketo.refs.delete(r.id);
    toast(res.ok ? 'ok' : 'error', res.ok ? `"${r.name}" removed. Your original file was not touched.` : res.message ?? 'Could not remove it.');
  };
  const copyPrompt = async (): Promise<void> => {
    await window.marketo.app.copyText(`Make a reel about [topic] like "${r.name}".`);
    toast('ok', 'Copied. Paste it to your AI and fill in the topic.');
  };

  const sound = !p.audio.present ? 'No sound' : p.audio.bpm !== null && p.audio.beatStrength >= 0.25 ? `Beat ~${p.audio.bpm} BPM${p.audio.cutsOnBeat !== null && p.audio.cutsOnBeat >= 0.7 ? ', changes on the beat' : ''}` : p.audio.quiet >= 0.2 ? 'Sound with pauses (talking)' : 'Sound, no steady beat';

  return (
    <Card className="space-y-3">
      <div className="flex gap-4">
        <video src={url(r.file)} poster={url(r.sheets.poster)} controls preload="none" className="h-44 w-[100px] shrink-0 rounded-lg border border-white/10 bg-black object-cover" />
        <div className="min-w-0 flex-1 space-y-2">
          <input className="input font-semibold" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== r.name && void save({ name })} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-krypt-muted">
            <span className="text-white/80">{r1(p.seconds)}s · {aspectOf(p)}</span>
            <span>{p.sections.length} sections, ~{r1(p.medianSection)}s each</span>
            <span>{cuts} hard cut{cuts === 1 ? '' : 's'}</span>
            <span>opening holds {r1(p.hookHold)}s</span>
            <span>{p.look} look</span>
            <span>{sound}</span>
          </div>
          <Rhythm r={r} />
          <div className="flex items-center gap-1.5">
            {p.colors.map((c) => (
              <span key={c.hex} title={`${c.hex} · ${Math.round(c.share * 100)}%`} className="h-4 rounded border border-white/15" style={{ background: c.hex, width: `${Math.max(14, c.share * 120)}px` }} />
            ))}
            {p.accent && (
              <span className="ml-2 flex items-center gap-1 font-mono text-[10px] text-krypt-muted">
                accent <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: p.accent }} /> → {nearestAccent(p.accent)}
              </span>
            )}
          </div>
        </div>
      </div>
      <div>
        <label className="label">What to copy from it</label>
        <textarea
          className="input min-h-[56px]"
          placeholder="e.g. Big white hook in the top third, yellow captions one word at a time, hard cuts on every sentence. Your AI can fill this in after looking at the frames."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (r.notes ?? '') && void save({ notes })}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <GhostButton small onClick={() => void copyPrompt()}>
          <Copy className="h-3.5 w-3.5" /> Copy "make it like this"
        </GhostButton>
        <GhostButton small onClick={() => setFrames((f) => !f)}>
          <Images className="h-3.5 w-3.5" /> {frames ? 'Hide' : 'Show'} what the AI sees
        </GhostButton>
        <GhostButton small destructive onClick={() => (confirm ? void remove() : setConfirm(true))}>
          <Trash2 className="h-3.5 w-3.5" /> {confirm ? 'Click again to remove' : 'Remove'}
        </GhostButton>
      </div>
      {frames && (
        <div className="space-y-2">
          <div className="text-[11px] text-krypt-muted">The opening, frame by frame:</div>
          <img src={url(r.sheets.hook)} className="w-full rounded-lg border border-white/10" />
          <div className="text-[11px] text-krypt-muted">One frame per section:</div>
          <img src={url(r.sheets.shots)} className="w-full rounded-lg border border-white/10" />
        </div>
      )}
    </Card>
  );
}

export function RefVideosView() {
  const refs = useApp((s) => s.db!.refVideos);
  const job = useApp((s) => s.refJob);
  const toast = useApp((s) => s.toast);
  const [over, setOver] = useState(false);

  const add = async (path: string): Promise<void> => {
    try {
      const r = await addReferenceVideo(path);
      toast('ok', `"${r.name}" added. Tell your AI: make a reel like "${r.name}".`);
    } catch (e) {
      toast('error', (e as Error).message);
    }
  };
  const pick = async (): Promise<void> => {
    const p = await window.marketo.app.pickFile('video');
    if (p) await add(p);
  };
  const drop = async (e: React.DragEvent): Promise<void> => {
    e.preventDefault();
    setOver(false);
    for (const f of Array.from(e.dataTransfer.files)) {
      const p = window.marketo.app.pathForFile(f);
      if (p) await add(p);
    }
  };

  return (
    <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
      <Section title={`Reference videos · ${refs.length}`}>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => void drop(e)}
          className={cls('mb-4 flex items-center gap-4 rounded-2xl border border-dashed px-5 py-4 transition', over ? 'border-krypt-purple bg-krypt-purple/10' : 'border-white/15 bg-white/[0.02]')}
        >
          <Upload className="h-5 w-5 shrink-0 text-krypt-muted" />
          {job ? (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-white">
                Reading {job.name}: {job.phase}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-krypt-gradient transition-all" style={{ width: `${Math.round(job.ratio * 100)}%` }} />
              </div>
            </div>
          ) : (
            <div className="min-w-0 flex-1 text-sm text-krypt-muted">Drop a video here (a reel whose edit you like, up to 3 minutes), or</div>
          )}
          <PrimaryButton onClick={() => void pick()} disabled={!!job}>
            Choose a video
          </PrimaryButton>
        </div>
        {refs.length === 0 ? (
          <Empty icon={<Clapperboard className="h-6 w-6" />} title="No reference videos yet">
            Add a reel whose editing you like. Then tell your AI "make a reel about … like this one".
          </Empty>
        ) : (
          <div className="space-y-4">
            {refs.map((r) => (
              <RefCard key={r.id} r={r} />
            ))}
          </div>
        )}
      </Section>
      <div>
        <Card className="space-y-2 text-sm text-white/80">
          <div className="text-sm font-semibold text-white">How "edit like this" works</div>
          <p>
            <span className="text-white">1.</span> Add a video. Marketo measures it on this computer: where the picture changes, how fast, light or dark, its colours, the sound and its tempo. Nothing is uploaded.
          </p>
          <p>
            <span className="text-white">2.</span> Tell your AI to make a reel like it. It gets those numbers plus pictures of the video, sets the look and pace, and writes the new reel to the same rhythm.
          </p>
          <p>
            <span className="text-white">3.</span> Write down what you want copied (or let your AI do it after looking). That note is used every time.
          </p>
          <p className="text-xs text-krypt-muted">It copies the style: pacing, structure, look. The reel is still built from Marketo's own styles, so it will not be a frame-for-frame clone, and the reference's footage, sound and words are never reused.</p>
        </Card>
      </div>
    </div>
  );
}
