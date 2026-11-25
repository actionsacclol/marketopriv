import { useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, Clapperboard, Download, RefreshCw } from 'lucide-react';
import type { EditorStatus, LongformPlan } from '@shared/types';
import { EDITOR_URL, LONGFORM_SOFT_CAP, LONG_LENGTHS, longformPlan } from '@shared/longform';
import { Card, GhostButton, PrimaryButton } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// The long-form YouTube mode's two shared pieces: getting Krypt Editor (where the videos are made) onto the
// computer and connected to the user's AI, and the channel's plan (how many a week, how long, how they go up).

/** Whether Krypt Editor is on this computer and connected to an AI; looked up again every few seconds while `live`. */
export function useEditorStatus(live = true): { status: EditorStatus | null; refresh: () => void } {
  const [status, setStatus] = useState<EditorStatus | null>(null);
  const refresh = (): void => void window.marketo.app.editorStatus().then(setStatus, () => setStatus({ installed: false, connected: [] }));
  useEffect(() => {
    refresh();
    if (!live) return;
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [live]);
  return { status, refresh };
}

function Mark({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={cls('mt-1 flex items-center gap-1.5 text-xs', ok ? 'text-emerald-300' : 'text-amber-300')}>
      {ok ? <CircleCheck className="h-3.5 w-3.5 shrink-0" /> : <CircleAlert className="h-3.5 w-3.5 shrink-0" />} {children}
    </span>
  );
}

/** Install Krypt Editor, then connect it to the AI: the two steps, each with a live check. */
export function EditorSetup({ status, refresh }: { status: EditorStatus | null; refresh: () => void }) {
  const installed = !!status?.installed;
  const connected = status?.connected ?? [];
  const steps: Array<{ title: string; about: React.ReactNode; ok: boolean; mark: string; action?: React.ReactNode }> = [
    {
      title: 'Install Krypt Editor',
      about: "Krypt's free video editor for Windows and macOS. The button opens its page on krypt.cc in your browser: download it, run the installer, and open it once.",
      ok: installed,
      mark: installed ? `Found on this computer${status?.version ? ` (version ${status.version})` : ''}` : 'Not found on this computer yet',
      action: (
        <PrimaryButton onClick={() => void window.marketo.app.openExternal(EDITOR_URL)}>
          <Download className="h-4 w-4" /> Get Krypt Editor
        </PrimaryButton>
      ),
    },
    {
      title: 'Connect it to your AI',
      about: 'In Krypt Editor, press AI agents (top right), pick your AI and press Connect. Use the same AI you connect to Marketo later in this setup, then start a new session in it.',
      ok: connected.length > 0,
      mark: connected.length ? `Connected to ${connected.join(', ')}` : 'Not connected to an AI yet',
    },
  ];
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <span className={cls('flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold', s.ok ? 'bg-emerald-500/25 text-emerald-100' : 'bg-krypt-purple text-white')}>{i + 1}</span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white">{s.title}</span>
            <span className="mt-0.5 block text-sm text-krypt-muted">{s.about}</span>
            <Mark ok={s.ok}>{s.mark}</Mark>
            {s.action && <span className="mt-3 block">{s.action}</span>}
          </span>
        </li>
      ))}
      <li className="flex items-center gap-2 px-1 text-xs text-krypt-muted">
        <GhostButton small onClick={refresh}>
          <RefreshCw className="h-3.5 w-3.5" /> Check again
        </GhostButton>
        These checks update by themselves every few seconds.
      </li>
    </ol>
  );
}

/** The channel's plan. Every number is the user's own; over the recommended most it says so and still saves. */
export function LongformPlanFields({ className }: { className?: string }) {
  const settings = useApp((s) => s.db!.settings);
  const toast = useApp((s) => s.toast);
  const plan = longformPlan(settings);
  const save = (patch: Partial<LongformPlan>): void =>
    void window.marketo.db.updateSettings({ longform: { ...plan, ...patch } }).then((r) => {
      if (!r.ok) toast('error', r.message ?? 'Could not save the plan.');
    });
  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Long videos a week</label>
          <input type="number" min={0} max={99} className="input font-mono" value={plan.perWeek} onChange={(e) => save({ perWeek: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        </div>
        <div>
          <label className="label">Length of each</label>
          <select className="input" value={plan.length} onChange={(e) => save({ length: e.target.value as LongformPlan['length'] })}>
            {LONG_LENGTHS.map((l) => (
              <option key={l} value={l} className="bg-krypt-panel">
                {l} minutes
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">A finished video goes up as</label>
          <select className="input" value={plan.visibility} onChange={(e) => save({ visibility: e.target.value as LongformPlan['visibility'] })}>
            <option value="public" className="bg-krypt-panel">
              Public right away
            </option>
            <option value="unlisted" className="bg-krypt-panel">
              Unlisted: I publish it myself
            </option>
          </select>
        </div>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-krypt-muted">
        {plan.perWeek === 0
          ? 'At 0 no new long video is started. Your AI still answers comments and reads the numbers.'
          : `Your AI spreads them over the week and starts the next one when it comes due. ${plan.visibility === 'public' ? 'Public means nobody watches it before your viewers do: pick Unlisted to check each one first.' : 'Each one waits in YouTube Studio until you make it public.'}`}
      </p>
      {plan.perWeek > LONGFORM_SOFT_CAP && (
        <p className="mt-1 flex items-start gap-1.5 text-[11px] leading-relaxed text-amber-300">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Over the recommended {LONGFORM_SOFT_CAP} a week (one a day). It is your number and it stands, but many near-alike long videos in a week can look mass-produced to YouTube, which risks the channel's reach and monetisation.
          </span>
        </p>
      )}
    </div>
  );
}

/** For the Long videos page: is Krypt Editor ready, in one small card. */
export function EditorReadyCard() {
  const { status } = useEditorStatus(true);
  const installed = !!status?.installed;
  const connected = status?.connected ?? [];
  return (
    <Card className="space-y-2.5 border-krypt-purple/30">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Clapperboard className="h-4 w-4 text-krypt-purple" /> Long videos are made in Krypt Editor
      </div>
      <p className="text-sm leading-relaxed text-white/80">
        Your AI builds each video there: narration, pictures, captions, chapters and the export. Marketo picks what to make, writes the title, description and thumbnail, uploads it and answers the comments.
      </p>
      <Mark ok={installed}>{installed ? `Krypt Editor is on this computer${status?.version ? ` (version ${status.version})` : ''}` : 'Krypt Editor is not on this computer yet'}</Mark>
      <Mark ok={connected.length > 0}>{connected.length ? `Connected to ${connected.join(', ')}` : 'Not connected to an AI yet: in Krypt Editor press AI agents (top right) and Connect'}</Mark>
      {!installed && (
        <PrimaryButton onClick={() => void window.marketo.app.openExternal(EDITOR_URL)}>
          <Download className="h-4 w-4" /> Get Krypt Editor
        </PrimaryButton>
      )}
    </Card>
  );
}
