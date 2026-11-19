import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BASELINE_RUN, CLAUDE_MODELS, SAVER_READ, costAt, tierOf, typicalRun, withSaver } from '@shared/aiUsage';
import { EstimateCard, HistoryCard, ModelPicker, UsageTierCard } from '../components/AiUsage';
import { Card, GhostButton, Page, Section, Toggle } from '../components/ui';
import { refreshAutopilot, useApp } from '../state/store';

// AI > Usage: which model the scheduled runs use, what a day of them is likely
// to use, and what past runs did use. The same model setting as on the
// Autopilot page; it is here too because this is where its cost shows.

export default function Usage() {
  const st = useApp((s) => s.autopilot);
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const [busy, setBusy] = useState(false);
  useEffect(() => void refreshAutopilot(), []);

  if (!st) return <Page title="Usage">Loading…</Page>;
  const ai = st.ais.find((x) => x.id === st.ai);
  const picks = !!ai?.picksModel;
  const claude = st.ai === 'claude';
  const measured = !!ai?.measured;
  const saverOn = !!st.saver && !!ai?.saves;
  // What a smaller model saves on this computer's own typical run.
  const typical = typicalRun(st.usage ?? []) ?? BASELINE_RUN;
  const priceFor = (id: string): number => costAt(typical, CLAUDE_MODELS.find((m) => m.id === id)!.price!);
  const sonnetLess = Math.round((1 - priceFor('sonnet') / priceFor('fable')) * 100);
  const fable = CLAUDE_MODELS.find((m) => m.id === 'fable')!.price!;
  const saverLess = Math.round((1 - costAt(withSaver(typical), fable) / costAt(typical, fable)) * 100);
  const setSaver = async (on: boolean): Promise<void> => {
    if (busy || st.running) return;
    setBusy(true);
    const r = await window.marketo.autopilot.setSaver(on);
    setBusy(false);
    if (r.ok && r.data) {
      useApp.setState({ autopilot: r.data });
      toast('ok', on ? 'Token saver is on for the next run.' : 'Token saver is off.');
    } else toast('error', r.message ?? 'Could not save that.');
  };
  const runsPerDay = st.times.length * Math.max(1, st.profiles?.length ?? 1);
  const tier = tierOf(st.tier);
  const setModel = async (m: string): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.autopilot.setModel(m);
    setBusy(false);
    if (r.ok && r.data) {
      useApp.setState({ autopilot: r.data });
      toast('ok', m ? `Scheduled runs now use ${m}.` : 'Scheduled runs now use the model the AI app is set to.');
    } else toast('error', r.message ?? 'Could not save the model.');
  };

  return (
    <Page
      title="Usage"
      subtitle="How much AI your scheduled runs use: pick the model, see what a day is likely to take, and what past runs took."
      actions={
        <GhostButton small onClick={() => void refreshAutopilot()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </GhostButton>
      }
    >
      <Section title="Usage tier" description="How much of your AI plan the scheduled runs take. Pick the one for your plan: Low is made so a $20 plan lasts the whole month.">
        <UsageTierCard />
      </Section>
      <div className="grid gap-6 xl:grid-cols-2">
        <div>
          <Section title="Model for scheduled runs" description="A bigger model reasons better and uses more of your plan or your API budget. When you talk to your AI yourself, it uses whatever model that app is on.">
            <Card className="space-y-2">
              {picks ? <ModelPicker key={st.ai} app={claude ? undefined : ai?.name} value={st.model} disabled={busy || st.running} onPick={(m) => void setModel(m)} /> : <p className="text-sm text-krypt-muted">{ai?.name ?? 'This AI app'} picks its own model: set it in the app itself.</p>}
              {st.running && <p className="text-xs text-krypt-muted">A run is going now; the model can be changed when it ends.</p>}
              <div className="flex items-center gap-2 border-t border-white/5 pt-2 text-xs text-krypt-muted">
                <span className="min-w-0 flex-1">
                  {st.on ? `Autopilot is on with ${ai?.name ?? 'your AI'}: ${st.times.length} run${st.times.length === 1 ? '' : 's'} a day.` : 'Autopilot is off, so nothing runs by itself yet. The estimate uses the run times set on the Autopilot page.'}
                </span>
                <GhostButton small onClick={() => go('autopilot')}>
                  Autopilot
                </GhostButton>
              </div>
            </Card>
          </Section>
          <Section title="Estimate" description="What a day of runs is likely to use.">
            <EstimateCard rows={st.usage ?? []} model={claude ? st.model : undefined} runsPerDay={runsPerDay} measurable={measured} saver={saverOn} tier={tier} />
          </Section>
        </div>
        <div>
          <Section title="Used so far" description="What runs and the built-in chat have used, day by day.">
            <HistoryCard rows={st.usage ?? []} measurable={measured} />
          </Section>
          <Section title="Use less" description="The usage tier above sets all of these at once. Each one by itself, biggest first:">
            <Card className="space-y-3 text-xs leading-relaxed text-white/75">
              <div>
                <div className="text-sm font-medium text-white">1 · A smaller model</div>
                <p className="mt-0.5">
                  The biggest saving by far: on a typical run Sonnet comes to about {sonnetLess}% less than Fable at API prices. Whether a smaller model does a full run as well has not been tried: watch the first reports after switching.
                </p>
              </div>
              <div className="border-t border-white/5 pt-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1 text-sm font-medium text-white">2 · Token saver</div>
                  {ai?.saves ? <Toggle on={saverOn} onChange={(v) => void setSaver(v)} /> : <span className="text-krypt-muted">Claude Code only</span>}
                </div>
                <p className="mt-1">
                  Most of a run is the whole conversation being read again on every step, and it grows all run long. With this on, Claude Code sums the conversation up and carries on from the summary much earlier. Replaying ten real runs that way came to about{' '}
                  {Math.round((1 - SAVER_READ) * 100)}% fewer tokens re-read, and about {saverLess}% off the API price of a run (less than the token count suggests: re-reading is cheap per token, and the summaries cost a little themselves). The trade: after each summary the AI remembers the gist, not every detail, of what it did earlier in the run. Marketo keeps the day's counts and limits
                  itself, so those are not lost. Not yet tried on a full run.
                </p>
                {st.running && <p className="mt-1 text-krypt-muted">A run is going now; this can be changed when it ends.</p>}
              </div>
              <div className="border-t border-white/5 pt-3">
                <div className="text-sm font-medium text-white">3 · Fewer platforms</div>
                <p className="mt-0.5">Every platform adds its own browsing to every run. Switching one off on the Accounts page takes its share of the steps away.</p>
              </div>
            </Card>
          </Section>
        </div>
      </div>
    </Page>
  );
}
