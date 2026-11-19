import { useEffect, useState } from 'react';
import { Check, CircleAlert, Clock, Play, RotateCcw, Trash2 } from 'lucide-react';
import { runWhen } from '../lib/autopilotWindow';
import { Card, GhostButton, Page, PrimaryButton, Section } from '../components/ui';
import { refreshAutopilot, useApp } from '../state/store';
import { IdeasCard, PickCard, QueueCard } from '../components/ReelControls';

// Create > Next run: what the user wants the next autopilot run to do. One
// note, handed to one run (it reads it at the top of its plan), then kept in
// the list below. Each profile has its own.

const MAX = 2000;

const when = (iso?: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'today' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

export default function NextRun() {
  const next = useApp((s) => s.db!.nextRun);
  const ap = useApp((s) => s.autopilot);
  const profiles = useApp((s) => s.profiles);
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const note = next?.note;
  const done = next?.done ?? [];
  const [text, setText] = useState(note?.text ?? '');
  const [busy, setBusy] = useState(false);
  // What is saved changed from outside (a run used it, your AI wrote one): show that, unless you are mid-edit on something else.
  const [seen, setSeen] = useState(note?.text ?? '');
  useEffect(() => {
    const saved = note?.text ?? '';
    if (saved !== seen) {
      if (text.trim() === seen.trim()) setText(saved);
      setSeen(saved);
    }
  }, [note?.text, seen, text]);
  useEffect(() => void refreshAutopilot(), []);

  const dirty = text.trim() !== (note?.text ?? '');
  const open = profiles.find((p) => p.active);
  const many = profiles.length > 1;
  const given = !!note?.givenTo;

  const save = async (value: string): Promise<boolean> => {
    if (value.trim().length > MAX) {
      toast('warn', `Keep it under ${MAX} characters.`);
      return false;
    }
    const r = await window.marketo.db.setNextRun(value);
    if (!r.ok) toast('error', r.message ?? 'Could not save.');
    return r.ok;
  };
  const onSave = async (): Promise<void> => {
    setBusy(true);
    if (await save(text)) toast('ok', text.trim() ? 'Saved. The next autopilot run does this first.' : 'Cleared.');
    setBusy(false);
  };
  const onClear = async (): Promise<void> => {
    setBusy(true);
    if (await save('')) setText('');
    setBusy(false);
  };
  const onRunNow = async (): Promise<void> => {
    setBusy(true);
    try {
      if (!(await save(text))) return;
      const r = await window.marketo.autopilot.runNow();
      if (!r.ok) toast('error', r.message ?? 'Could not start a run.');
      else toast('ok', 'Started a run with these instructions. Its report shows up on the Autopilot page.');
      void refreshAutopilot();
    } finally {
      setBusy(false);
    }
  };

  const status = !ap
    ? 'Checking the autopilot…'
    : ap.running
      ? given
        ? 'A run is going now and has these instructions.'
        : 'A run is going now. What you save here is for it if it has not read its plan yet, otherwise for the run after.'
      : ap.on
        ? `Next run ${runWhen(ap.task.nextRun)}.`
        : 'Autopilot is off, so nothing runs by itself. Turn it on on the Autopilot page, or press Run now.';
  const skipped = many && open && !open.autopilot;

  return (
    <Page title="Next run" subtitle="Tell the autopilot what to do on its next run. It does this first, once, then goes back to its usual plan.">
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div>
          <Section title="For the next run" description="Write it the way you would say it. A topic, an angle, a platform, something to reply to, something to leave alone.">
            <Card className="space-y-3">
              <textarea
                className="input min-h-[190px] leading-relaxed"
                placeholder={'e.g. Make a reel about Krypt Tweaker: getting more FPS, and why paying someone on X for a "tweak pack" is a bad idea. Post it on Shorts and TikTok.'}
                value={text}
                maxLength={MAX + 200}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex flex-wrap items-center gap-2">
                <PrimaryButton disabled={busy || !dirty} onClick={() => void onSave()}>
                  <Check className="h-4 w-4" /> Save
                </PrimaryButton>
                <GhostButton disabled={busy || !text.trim() || !!ap?.running} onClick={() => void onRunNow()}>
                  <Play className="h-4 w-4" /> Save and run now
                </GhostButton>
                {(note || text) && (
                  <GhostButton disabled={busy} onClick={() => void onClear()}>
                    <Trash2 className="h-4 w-4" /> Clear
                  </GhostButton>
                )}
                <span className={`ml-auto text-xs ${text.trim().length > MAX ? 'text-rose-300' : 'text-krypt-muted'}`}>
                  {text.trim().length} / {MAX}
                </span>
              </div>
              <div className="flex items-start gap-2 border-t border-white/5 pt-3 text-xs text-white/75">
                <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-krypt-purple" />
                <span className="min-w-0 flex-1">
                  {note && !dirty ? (given ? '' : 'Saved and waiting. ') : dirty && text.trim() ? 'Not saved yet. ' : ''}
                  {status}
                </span>
                <GhostButton small onClick={() => go('autopilot')}>
                  Autopilot
                </GhostButton>
              </div>
              {skipped && (
                <div className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-300">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span>
                    Scheduled runs skip the profile "{open!.name}": its Autopilot switch is off (Setup, Profiles). This note waits until a run works on this profile.
                  </span>
                </div>
              )}
            </Card>
          </Section>
          <Section title="Then" description="A queue for the runs after that one.">
            <QueueCard />
          </Section>
          <Section title="Who picks the topics" description="Leave it to your AI, or have runs make only what you put here.">
            <PickCard />
          </Section>
        </div>

        <div>
          <Section title="Ideas from your AI" description="Suggestions waiting for a yes or a no. Nothing is made from one until you queue it.">
            <IdeasCard />
          </Section>
          <Section title="How it works">
            <Card className="space-y-2.5 text-sm leading-relaxed text-white/80">
              <p>The next run reads this at the top of its plan and does it before anything it would have picked itself.</p>
              <p>It is used once. When that run ends the note moves to the list below, and the run after gets the next one in your queue, or is back to normal when the queue is empty.</p>
              <p>Your limits still apply: the daily limits and post spacing (the recommended ones, or your own from the Accounts page), your brand's "never say" list and your Training rules. Anything stated as a fact is still checked before it goes into a reel. If part of it cannot be done, the report says so.</p>
              {many && <p>This note belongs to the profile "{open?.name}". Each profile has its own.</p>}
              <p className="text-xs text-krypt-muted">You can also tell your AI in a chat: "next run, make a reel about …" and it saves it here.</p>
            </Card>
          </Section>

          <Section title="Used" description="Notes earlier runs were given.">
            <Card padded={false} className="divide-y divide-white/5">
              {done.length === 0 ? (
                <div className="p-4 text-sm text-krypt-muted">Nothing yet.</div>
              ) : (
                done.map((d, i) => (
                  <div key={`${d.usedAt}-${i}`} className="space-y-2 px-4 py-3">
                    <p className="whitespace-pre-wrap break-words text-sm text-white/85">{d.text}</p>
                    <div className="flex items-center gap-2 text-[11px] text-krypt-muted">
                      <span className="min-w-0 flex-1">Given to the run of {when(d.usedAt) || 'an earlier day'}. Its report is on the Autopilot page.</span>
                      <GhostButton small onClick={() => setText(d.text)}>
                        <RotateCcw className="h-3.5 w-3.5" /> Use again
                      </GhostButton>
                    </div>
                  </div>
                ))
              )}
            </Card>
          </Section>
        </div>
      </div>
    </Page>
  );
}
