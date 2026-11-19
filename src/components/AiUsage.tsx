import { useEffect, useState } from 'react';
import { refreshAutopilot, useApp } from '../state/store';
import { Check } from 'lucide-react';
import {
  BASELINE_RUN,
  CLAUDE_MODELS,
  MODEL_NAME,
  PRICES_AS_OF,
  SAVER_READ,
  USAGE_TIERS,
  USAGE_TIER_IDS,
  costAt,
  withSaver,
  fmtTokens,
  fmtUsd,
  priceOf,
  tierOf,
  tierRun,
  tierSummary,
  totalTokens,
  typicalRun,
  type RunUsage,
  type TierSpec,
  type TokenCount,
  type UsageTier,
} from '@shared/aiUsage';
import { Card, GhostButton } from './ui';

// Which model the autopilot runs use, what a day of runs is likely to use,
// and what past runs did use. The numbers come from the AI app itself (Claude
// Code reports tokens and an API-price cost when a run ends); the estimate is
// this computer's own typical run times the runs a day.

const OTHER = '__other__';

/**
 * The model drop-down. For Claude Code: its short names, its own setting, or a name typed by hand. For another AI
 * app (app = its name): its own setting or a typed name; Marketo keeps no list of other makers' models.
 */
export function ModelPicker({ value, onPick, disabled, app }: { value: string | undefined; onPick: (model: string) => void; disabled?: boolean; /** Not Claude Code: the app's name. */ app?: string }) {
  const list = app ? [{ id: '', label: `${app}'s own setting`, hint: `Whatever model ${app} is set to on this computer.` }] : CLAUDE_MODELS;
  const known = list.some((m) => m.id === (value ?? ''));
  const [other, setOther] = useState(!known);
  const [typed, setTyped] = useState(known ? '' : value ?? '');
  const hint = other ? `A model name, exactly as ${app ?? 'Claude Code'} takes it after --model.${app ? ' Not tried with Marketo yet.' : ''}` : list.find((m) => m.id === (value ?? ''))?.hint;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          disabled={disabled}
          value={other ? OTHER : value ?? ''}
          onChange={(e) => {
            if (e.target.value === OTHER) return setOther(true);
            setOther(false);
            onPick(e.target.value);
          }}
          className="input w-64 py-2 text-sm"
          title="The model scheduled runs use"
        >
          {list.map((m) => (
            <option key={m.id} value={m.id} className="bg-krypt-panel">
              {m.label}
            </option>
          ))}
          <option value={OTHER} className="bg-krypt-panel">
            Another model (type its name)
          </option>
        </select>
        {other && (
          <>
            <input className="input w-56 py-2 font-mono text-xs" placeholder={app ? 'the model name' : 'claude-sonnet-5-5'} value={typed} onChange={(e) => setTyped(e.target.value.trim())} />
            <GhostButton small disabled={disabled || !MODEL_NAME.test(typed) || typed === value} onClick={() => onPick(typed)}>
              <Check className="h-3.5 w-3.5" /> Use it
            </GhostButton>
          </>
        )}
      </div>
      {hint && <p className="text-xs text-krypt-muted">{hint}</p>}
    </div>
  );
}

const dayLabel = (d: string): string => {
  const t = new Date(`${d}T12:00`);
  return Number.isNaN(t.getTime()) ? d : t.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
};

/** One line for a run's report: steps, tokens, cost, model. */
export function usageLine(u: RunUsage): string {
  return [u.turns ? `${u.turns} steps` : '', `${fmtTokens(totalTokens(u))} tokens`, u.cost !== undefined ? `${fmtUsd(u.cost)} at API prices` : '', u.model ?? ''].filter(Boolean).join(' · ');
}

const sum = (list: RunUsage[]): { tokens: number; cost: number; priced: boolean; runs: number } => ({
  tokens: list.reduce((n, r) => n + totalTokens(r), 0),
  cost: list.reduce((n, r) => n + (r.cost ?? 0), 0),
  priced: list.some((r) => r.cost !== undefined),
  runs: list.filter((r) => r.kind === 'run').length,
});

/** A run's tier ('max' for runs from before tiers: they were full runs). */
const tierOfRun = (r: RunUsage): UsageTier => r.tier ?? 'max';

/** What one run on a tier is likely to use: measured runs on it, else a full run scaled to it (rough). */
export function tierEstimate(rows: RunUsage[], t: TierSpec, saver: boolean): { run: TokenCount; measured: number; scaled: boolean } {
  const same = typicalRun(rows.filter((r) => r.kind === 'run' && tierOfRun(r) === t.id && !!r.saver === saver));
  if (same) return { run: same, measured: same.runs, scaled: false };
  const full = typicalRun(rows.filter((r) => r.kind === 'run' && tierOfRun(r) === 'max')) ?? BASELINE_RUN;
  return { run: t.id === 'max' ? (saver ? withSaver(full) : full) : tierRun(full, { ...t, saver }), measured: 0, scaled: true };
}

/** The four usage tiers as cards; picking one sets the model, run times and token saver to it. */
export function TierPicker({ value, rows, onPick, disabled, custom }: { value: UsageTier; rows: RunUsage[]; onPick: (t: UsageTier) => void; disabled?: boolean; /** The model, times or saver were changed after the tier was picked. */ custom?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-4">
        {USAGE_TIER_IDS.map((id) => {
          const t = USAGE_TIERS[id];
          const { run } = tierEstimate(rows, t, t.saver);
          const price = CLAUDE_MODELS.find((m) => m.id === t.model)?.price;
          const sel = id === value;
          return (
            <button
              key={id}
              disabled={disabled}
              onClick={() => onPick(id)}
              className={`rounded-2xl border p-3 text-left transition disabled:opacity-60 ${sel ? 'border-krypt-purple/60 bg-krypt-purple/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25'}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">{t.label}</span>
                {sel && <Check className="h-3.5 w-3.5 text-krypt-purple" />}
              </div>
              <div className="mt-0.5 text-xs text-white/80">For {t.plan}.</div>
              <div className="mt-1.5 text-[11px] leading-relaxed text-krypt-muted">{tierSummary(t)}</div>
              <div className="mt-1.5 font-mono text-[11px] text-white/70">
                ~{fmtTokens(totalTokens(run) * t.times.length)} tokens a day{price ? ` · ${fmtUsd(costAt(run, price) * t.times.length)} at API prices` : ''}
              </div>
            </button>
          );
        })}
      </div>
      {custom && <p className="text-xs text-amber-200/90">You changed the model, the run times or the token saver after picking this tier. Each run still takes on what the tier says; pick the tier again to put the rest back.</p>}
      <p className="text-[11px] leading-relaxed text-krypt-muted">
        A tier sets the model, how many runs a day and the token saver, and how much each run takes on: how many platforms, how long it engages, how many new reels and web searches. Fewer platforms a run means each one comes up every few runs instead of every run. Claude and ChatGPT do not publish
        exact plan limits, so the plans named are a starting point and the token counts are rough until your own runs are measured (AI, Usage shows them). If your plan still runs out, go one tier down; if it has room left at the end of the week, go one up.
      </p>
    </div>
  );
}

/** The tier picker wired to the hub (Setup and Usage): picking saves it at once. */
export function UsageTierCard() {
  const st = useApp((s) => s.autopilot);
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!st) void refreshAutopilot();
  }, [st]);
  if (!st) return null;
  const tier = tierOf(st.tier);
  const claude = st.ai === 'claude';
  const custom = !!st.tier && ((claude && (st.model ?? '') !== tier.model) || st.times.join() !== tier.times.join() || !!st.saver !== tier.saver);
  const pick = async (t: UsageTier): Promise<void> => {
    if (busy || st.running) return;
    setBusy(true);
    const r = await window.marketo.autopilot.setTier(t);
    setBusy(false);
    if (r.ok && r.data) {
      useApp.setState({ autopilot: r.data });
      toast('ok', `${USAGE_TIERS[t].label} tier: ${tierSummary(USAGE_TIERS[t])}.`);
    } else toast('error', r.message ?? 'Could not save the tier.');
  };
  return (
    <Card>
      <TierPicker value={tier.id} rows={st.usage ?? []} onPick={(t) => void pick(t)} disabled={busy || st.running} custom={custom} />
      {st.running && <p className="mt-2 text-xs text-krypt-muted">A run is going now; the tier can be changed when it ends.</p>}
    </Card>
  );
}

/** What a day of runs is likely to use, on the picked model and on the others. */
export function EstimateCard({ rows, model, runsPerDay, measurable, saver, tier }: { rows: RunUsage[]; model: string | undefined; runsPerDay: number; measurable: boolean; saver?: boolean; tier?: TierSpec }) {
  // Runs made the way runs are made now (tier, saver on or off) are the measure. With none of those yet, a full run
  // is scaled to the tier, and the saver's effect is assumed: the same run with less re-reading.
  const t = tier ?? USAGE_TIERS.max;
  const est = tierEstimate(rows, t, !!saver);
  const mine = est.measured ? { runs: est.measured, model: typicalRun(rows.filter((r) => r.kind === 'run' && tierOfRun(r) === t.id))?.model } : typicalRun(rows);
  const scaledTier = est.scaled && t.id !== 'max';
  const assumed = !!saver && !est.measured;
  const run = est.run;
  // The model the estimate is for: the picked one, else the one the last measured run used.
  const basis = priceOf(model) ? model! : priceOf(mine?.model) ? mine!.model! : '';
  const basisChoice = CLAUDE_MODELS.find((m) => m.family && basis.toLowerCase().includes(m.family));
  const perRun = totalTokens(run);
  return (
      <Card className="space-y-3">
        {runsPerDay === 0 ? (
          <p className="text-sm text-krypt-muted">Add a run time above to see what a day would use.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <div>
                <div className="font-mono text-2xl font-semibold text-white">{fmtTokens(perRun * runsPerDay)}</div>
                <div className="text-[11px] uppercase tracking-wider text-krypt-muted">tokens a day</div>
              </div>
              {basisChoice?.price && (
                <div>
                  <div className="font-mono text-2xl font-semibold text-white">{fmtUsd(costAt(run, basisChoice.price) * runsPerDay)}</div>
                  <div className="text-[11px] uppercase tracking-wider text-krypt-muted">a day at API prices · {basisChoice.label}</div>
                </div>
              )}
            </div>
            <p className="text-xs leading-relaxed text-white/70">
              {runsPerDay} run{runsPerDay === 1 ? '' : 's'} a day × about {fmtTokens(perRun)} tokens a run.{' '}
              {scaledTier
                ? `No run on the ${t.label} tier has been measured yet, so this is a ${mine ? 'measured' : 'typical'} full run scaled down to its ~${t.runMin}-minute runs${saver ? ' with the token saver' : ''}: rough. Your own numbers replace it after the first run.`
                : mine
                ? assumed
                  ? `Based on your last ${mine.runs} measured run${mine.runs === 1 ? '' : 's'}, with the token saver's effect assumed (about ${Math.round((1 - SAVER_READ) * 100)}% less re-reading) until a run with it on is measured.`
                  : `Based on your last ${mine.runs} measured run${mine.runs === 1 ? '' : 's'}${saver ? ' with the token saver on' : ''}.`
                : measurable
                  ? 'No run has been measured on this computer yet, so this uses a typical full run on a seven-platform setup. Fewer platforms use less. Your own numbers replace it after the first run.'
                  : 'This AI app does not report its token use to Marketo, so this is a typical full run on a seven-platform setup with Claude Code.'}
            </p>
            {!measurable && <p className="text-xs leading-relaxed text-white/70">The prices below are for Claude models. Another maker's app is priced by its maker, and Marketo has no figures for it.</p>}
            <div className="overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/5 text-left text-[11px] uppercase tracking-wider text-krypt-muted">
                    <th className="px-3 py-1.5 font-medium">Model</th>
                    <th className="px-3 py-1.5 text-right font-medium">A run</th>
                    <th className="px-3 py-1.5 text-right font-medium">A day</th>
                    <th className="px-3 py-1.5 text-right font-medium">30 days</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 font-mono">
                  {CLAUDE_MODELS.filter((m) => m.price).map((m) => {
                    const c = costAt(run, m.price!);
                    const sel = m.id === basisChoice?.id;
                    return (
                      <tr key={m.id} className={sel ? 'bg-krypt-purple/10 text-white' : 'text-white/75'}>
                        <td className="px-3 py-1.5 font-sans">{m.label}</td>
                        <td className="px-3 py-1.5 text-right">{fmtUsd(c)}</td>
                        <td className="px-3 py-1.5 text-right">{fmtUsd(c * runsPerDay)}</td>
                        <td className="px-3 py-1.5 text-right">{fmtUsd(c * runsPerDay * 30)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] leading-relaxed text-krypt-muted">
              Dollars are Anthropic's API list prices as of {PRICES_AS_OF}, for the same tokens on each model. On a Claude subscription you are not billed per token: the same use counts against your plan's limits instead. Another model may take more or fewer steps
              than the one measured, so read the other rows as rough. Most of a run's tokens are the conversation being re-read on every step, which is billed at the low cached rate.
            </p>
          </>
        )}
      </Card>
  );
}

/** What runs and the built-in chat have used, day by day. */
export function HistoryCard({ rows, measurable }: { rows: RunUsage[]; measurable: boolean }) {
  const days = [...new Set(rows.map((r) => r.at.slice(0, 10)))].sort().reverse().slice(0, 14);
  const within = (n: number): RunUsage[] => {
    const from = new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    return rows.filter((r) => r.at.slice(0, 10) > from);
  };
  const week = sum(within(7));
  const month = sum(within(30));
  return (
      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          {rows.length > 0 && (
            <div className="text-xs text-white/70">
              Last 7 days: <span className="font-mono text-white">{fmtTokens(week.tokens)}</span> tokens{week.priced ? `, ${fmtUsd(week.cost)}` : ''} · last 30: <span className="font-mono text-white">{fmtTokens(month.tokens)}</span>
              {month.priced ? `, ${fmtUsd(month.cost)}` : ''}
            </div>
          )}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-krypt-muted">{measurable ? 'Nothing measured yet. Each run adds a line here when it ends.' : 'This AI app does not report its token use, so runs cannot be counted here.'}</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white/5 text-left text-[11px] uppercase tracking-wider text-krypt-muted">
                  <th className="px-3 py-1.5 font-medium">Day</th>
                  <th className="px-3 py-1.5 text-right font-medium">Runs</th>
                  <th className="px-3 py-1.5 text-right font-medium">Tokens</th>
                  <th className="px-3 py-1.5 text-right font-medium">Written</th>
                  <th className="px-3 py-1.5 text-right font-medium">API price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {days.map((d) => {
                  const list = rows.filter((r) => r.at.slice(0, 10) === d);
                  const s = sum(list);
                  const chat = list.some((r) => r.kind === 'chat');
                  return (
                    <tr key={d} className="text-white/80">
                      <td className="px-3 py-1.5">
                        {dayLabel(d)}
                        {chat && <span className="ml-1.5 text-[10px] text-krypt-muted">+ chat</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.runs || '—'}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{fmtTokens(s.tokens)}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{fmtTokens(list.reduce((n, r) => n + r.output, 0))}</td>
                      <td className="px-3 py-1.5 text-right font-mono">{s.priced ? fmtUsd(s.cost) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[11px] leading-relaxed text-krypt-muted">
          Counted: autopilot runs (as the AI app reports them when a run ends) and the built-in chat. Not counted: anything you do by talking to your own AI app yourself. Marketo never sees those tokens. "Written" is what the AI wrote; the rest is what it read.
        </p>
      </Card>
  );
}
