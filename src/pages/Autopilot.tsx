import { runWhen } from '../lib/autopilotWindow';
import { SOFT_RUNS_A_DAY } from '@shared/perf';
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Check, ChevronDown, CircleAlert, CircleCheck, Clock, FolderOpen, Play, Plug, Plus, Power, RefreshCw, X } from 'lucide-react';
import type { AutopilotAi, AutopilotReport, AutopilotStatus, ClientInfo } from '@shared/types';
import { Card, GhostButton, Page, PrimaryButton, Section } from '../components/ui';
import { useApp } from '../state/store';
import { ModelPicker, usageLine } from '../components/AiUsage';
import { cls } from '../lib/format';

const PRESETS: Array<{ label: string; times: string[] }> = [
  { label: '2 a day', times: ['10:00', '19:00'] },
  { label: '3 a day', times: ['09:00', '15:00', '21:00'] },
  { label: '4 a day', times: ['09:00', '13:00', '17:00', '21:00'] },
];

const fmtWhen = (iso?: string): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date().toDateString() === d.toDateString();
  return `${today ? 'today' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
};

/** Goal-driven extra runs: how many a day (the user's number), and what the planner sees right now. */
function ExtraRuns({ st, busy, onSet }: { st: AutopilotStatus; busy: boolean; onSet: (n: number) => void }) {
  const [n, setN] = useState(String(st.extra.max));
  useEffect(() => setN(String(st.extra.max)), [st.extra.max]);
  const v = Math.round(Number(n));
  const valid = n.trim() !== '' && Number.isFinite(v) && v >= 0;
  return (
    <div className="space-y-1.5 border-t border-white/5 pt-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm">Extra runs for posts still owed</span>
        <input type="number" min={0} className="input w-20 py-1 font-mono text-xs" value={n} onChange={(e) => setN(e.target.value)} />
        <span className="text-xs text-krypt-muted">a day</span>
        <GhostButton small disabled={busy || !valid || v === st.extra.max} onClick={() => onSet(v)}>
          Save
        </GhostButton>
      </div>
      <p className="text-[11px] leading-relaxed text-krypt-muted">
        Between the main runs, a short run (about 15 min) starts by itself when a platform still owes posts today and its spacing allows the next one: it posts and answers comments, nothing else. Only while the token saver is off, since each one uses more of your AI plan. 0 turns them off.
      </p>
      {st.on && (
        <p className="text-[11px] text-white/70">
          Today {st.extra.today} of {st.extra.max}. {st.extra.note}
        </p>
      )}
    </div>
  );
}

function Report({ r, open, onToggle }: { r: AutopilotReport; open: boolean; onToggle: () => void }) {
  return (
    <div className="px-4 py-3">
      <button className="flex w-full items-center gap-2 text-left text-sm" onClick={onToggle}>
        <span className={cls('h-2 w-2 rounded-full', r.running ? 'animate-pulse bg-krypt-purple' : r.needs.length || r.warnings.length ? 'bg-amber-400' : r.ended ? 'bg-emerald-400' : 'bg-rose-400')} />
        <span className="font-medium">{fmtWhen(r.at)}</span>
        {r.profile && <span className="rounded-md border border-krypt-purple/30 bg-krypt-purple/10 px-1.5 py-0.5 text-[11px] text-white/80">{r.profile}</span>}
        {r.extra && <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] text-krypt-muted">extra</span>}
        <span className="text-xs text-krypt-muted">{r.running ? 'running now' : !r.ended ? 'stopped before the end' : r.needs.length ? `${r.needs.length} thing${r.needs.length === 1 ? '' : 's'} need you` : 'done'}</span>
        <ChevronDown className={cls('ml-auto h-4 w-4 text-krypt-muted transition', open && 'rotate-180')} />
      </button>
      {(r.needs.length > 0 || r.warnings.length > 0) && (
        <div className="mt-2 space-y-1">
          {r.warnings.map((w, i) => (
            <div key={`w${i}`} className="flex gap-2 text-xs text-rose-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {w}
            </div>
          ))}
          {r.needs.map((n, i) => (
            <div key={`n${i}`} className="flex gap-2 text-xs text-amber-200">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n.replace(/^NEEDS YOU:?\s*/i, '')}
            </div>
          ))}
        </div>
      )}
      {r.usage && <div className="mt-1.5 pl-4 font-mono text-[11px] text-krypt-muted">{usageLine(r.usage)}</div>}
      {open && <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-[11px] text-white/75">{r.text}</pre>}
    </div>
  );
}

export default function Autopilot() {
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const browser = useApp((s) => s.browser);
  const db = useApp((s) => s.db)!;
  // The last status read shows at once; a fresh one follows.
  const cached = useApp.getState().autopilot;
  const [st, setStLocal] = useState<AutopilotStatus | null>(cached);
  const setSt = (s: AutopilotStatus): void => {
    setStLocal(s);
    useApp.setState({ autopilot: s });
  };
  const [clients, setClients] = useState<ClientInfo[]>([]);
  const [ai, setAi] = useState<AutopilotAi>(cached?.ai ?? 'claude');
  const [times, setTimes] = useState<string[]>(cached?.times ?? []);
  const [newTime, setNewTime] = useState('12:00');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const refresh = useCallback(async (first = false): Promise<void> => {
    const s = await window.marketo.autopilot.status();
    setSt(s);
    if (first && !cached) {
      setAi(s.ai);
      setTimes(s.times);
    }
    void window.marketo.mcp.clients().then(setClients);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    void refresh(true);
    const t = setInterval(() => void refresh(), 20_000);
    return () => clearInterval(t);
  }, [refresh]);

  const act = async (f: () => Promise<{ ok: boolean; data?: AutopilotStatus; message?: string }>, done: string): Promise<void> => {
    setBusy(true);
    const r = await f();
    setBusy(false);
    if (r.ok && r.data) {
      setSt(r.data);
      toast('ok', done);
    } else toast('error', r.message ?? 'That did not work.');
  };

  if (!st) return <Page title="Autopilot">Loading…</Page>;
  const pick = st.ais.find((x) => x.id === ai)!;
  const client = clients.find((c) => c.id === pick.client);
  const connected = !!client?.connected;
  const notSignedIn = browser.flatMap((b) => {
    const a = db.igAccounts.find((x) => x.id === b.accountId);
    if (!a) return [];
    const out: string[] = [];
    if (a.instagram !== false && !b.loggedIn) out.push(`${a.handle} Instagram`);
    if (a.youtube?.enabled && b.youtube && !b.youtube.loggedIn) out.push(`${a.handle} YouTube`);
    for (const n of ['x', 'tiktok', 'facebook', 'threads', 'pinterest'] as const) if (a[n]?.enabled && b[n] && !b[n]!.loggedIn) out.push(`${a.handle} ${n === 'x' ? 'X' : n[0].toUpperCase() + n.slice(1)}`);
    return out;
  });
  const changed = st.on && (st.ai !== ai || st.times.join() !== [...times].sort().join());
  const ready = st.supported && pick.found && connected && times.length > 0 && db.igAccounts.length > 0;

  return (
    <Page
      title="Autopilot"
      subtitle="Your AI runs Marketo by itself a few times a day: messages, engagement, new posts, replies and stats, inside every platform's daily limits. Set it up once and leave the computer on."
      actions={
        <GhostButton small onClick={() => void refresh()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </GhostButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
        <div>
          <Section title="Status">
            <Card className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={cls('flex h-10 w-10 items-center justify-center rounded-xl', st.on ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/5 text-krypt-muted')}>
                  <Bot className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold">{!st.supported ? 'Windows and macOS only for now' : st.on ? `On · ${st.ais.find((x) => x.id === st.ai)?.name} · ${st.times.join(', ')}` : 'Off'}</div>
                  <div className="text-xs text-krypt-muted">
                    {st.running ? 'A run is going now.' : st.on ? `Next run ${runWhen(st.task.nextRun)}. Each run starts at a random minute up to 30 min after its time (picked fresh every day), so it doesn't look scheduled.` : 'Nothing runs until you turn it on.'}
                    {st.task.lastRun ? ` · last ran ${fmtWhen(st.task.lastRun)}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {!st.on || changed ? (
                  <PrimaryButton disabled={busy || !ready} onClick={() => void act(() => window.marketo.autopilot.enable({ ai, times }), changed ? 'Autopilot updated.' : 'Autopilot is on.')}>
                    <Power className="h-4 w-4" /> {changed ? 'Save changes' : 'Turn on autopilot'}
                  </PrimaryButton>
                ) : (
                  <GhostButton disabled={busy} onClick={() => void act(() => window.marketo.autopilot.disable(), 'Autopilot is off.')}>
                    <Power className="h-4 w-4" /> Turn off
                  </GhostButton>
                )}
                <GhostButton disabled={busy || st.running || !ready} onClick={() => void act(() => window.marketo.autopilot.runNow(), 'Started a run. Its report shows up below when it ends.')}>
                  <Play className="h-4 w-4" /> Run once now
                </GhostButton>
                <GhostButton small onClick={() => void window.marketo.autopilot.openFolder()}>
                  <FolderOpen className="h-3.5 w-3.5" /> Files
                </GhostButton>
              </div>
            </Card>
          </Section>

          <Section title="1 · Which AI runs it" description="It runs in the background with no window, can use only Marketo's tools, and stops after 90 minutes.">
            <Card padded={false} className="divide-y divide-white/5">
              {st.ais.map((x) => {
                const c = clients.find((y) => y.id === x.client);
                const sel = ai === x.id;
                return (
                  <div key={x.id} className={cls('flex items-center gap-3 px-4 py-3', sel && 'bg-krypt-purple/10')}>
                    <button disabled={!x.found} onClick={() => setAi(x.id)} className={cls('flex h-5 w-5 shrink-0 items-center justify-center rounded-full border', sel ? 'border-krypt-purple bg-krypt-purple' : 'border-white/25', !x.found && 'opacity-40')}>
                      {sel && <Check className="h-3 w-3" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{x.name}</span>
                        {x.id === 'claude' && <span className="rounded-full bg-krypt-purple/20 px-2 py-0.5 text-[10px] text-krypt-purple">Recommended</span>}
                      </div>
                      <div className="text-[11px] text-krypt-muted">
                        {!x.found ? 'Not installed on this computer.' : c?.connected ? 'Installed and connected to Marketo.' : 'Installed, not connected to Marketo yet.'}
                        {x.note ? ` ${x.note}` : ''}
                      </div>
                    </div>
                    {x.found && c && !c.connected && (
                      <PrimaryButton className="px-3 py-1.5 text-xs" onClick={() => void window.marketo.mcp.connect(c.id).then((r) => { toast(r.ok ? 'ok' : 'error', r.message ?? (r.ok ? 'Connected.' : 'Failed.')); void refresh(); })}>
                        <Plug className="h-3.5 w-3.5" /> Connect
                      </PrimaryButton>
                    )}
                  </div>
                );
              })}
            </Card>
            {!st.ais.some((x) => x.found) && (
              <p className="mt-2 text-xs text-krypt-muted">
                Install Claude Code (claude.com/claude-code) and sign in to it once in a terminal, then press Refresh.
              </p>
            )}
          </Section>

          <Section title="2 · When it runs" description="The main runs do everything: messages, engagement, posts, replies and stats, inside every platform's daily limits. 3 or 4 a day is a good default. Extra runs fill in the posts that are still owed in between.">
            <Card className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button key={p.label} onClick={() => setTimes(p.times)} className={cls('rounded-full border px-3 py-1 text-xs', times.join() === p.times.join() ? 'border-krypt-purple bg-krypt-purple/15 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[...times].sort().map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs">
                    <Clock className="h-3 w-3 text-krypt-muted" /> {t}
                    <button className="text-krypt-muted hover:text-rose-300" onClick={() => setTimes(times.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input type="time" className="input w-28 py-1 font-mono text-xs" value={newTime} onChange={(e) => setNewTime(e.target.value)} />
                <GhostButton small disabled={!newTime || times.includes(newTime)} onClick={() => setTimes([...times, newTime])}>
                  <Plus className="h-3.5 w-3.5" /> Add
                </GhostButton>
              </div>
              {times.length > SOFT_RUNS_A_DAY && (
                <p className="text-xs text-amber-300">
                  {times.length} runs a day is over the {SOFT_RUNS_A_DAY} Krypt suggests. Each run is a full session on every account: more of your AI plan, and more activity a day than most people show, which platforms can flag, limit or lock. Your call.
                </p>
              )}
              <ExtraRuns st={st} busy={busy} onSet={(n) => void act(() => window.marketo.autopilot.setExtraRuns(n), n ? `Up to ${n} extra run${n === 1 ? '' : 's'} a day.` : 'Extra runs are off.')} />
            </Card>
          </Section>

          <Section title="3 · Which model" description="The model the scheduled runs use. A bigger model reasons better and uses more of your plan or your API budget.">
            <Card className="space-y-2">
              {pick.picksModel ? (
                <ModelPicker key={pick.id} app={pick.id === 'claude' ? undefined : pick.name} value={pick.id === st.ai ? st.model : undefined} disabled={busy || st.running || pick.id !== st.ai} onPick={(m) => void act(() => window.marketo.autopilot.setModel(m), m ? `Runs now use ${m}.` : 'Runs now use the model the AI app is set to.')} />
              ) : (
                <p className="text-sm text-krypt-muted">{pick.name} picks its own model: set it in {pick.name} itself.</p>
              )}
              {st.running && <p className="text-xs text-krypt-muted">A run is going now; the model can be changed when it ends.</p>}
              <div className="flex items-center gap-2 border-t border-white/5 pt-2 text-xs text-krypt-muted">
                <span className="min-w-0 flex-1">What each model is likely to use in a day, and what past runs used.</span>
                <GhostButton small onClick={() => go('usage')}>
                  Usage
                </GhostButton>
              </div>
            </Card>
          </Section>

          <Section title="4 · Leave it running">
            <Card className="space-y-2 text-sm">
              <Check2 ok={st.supported} text={/Mac/i.test(navigator.userAgent) ? 'macOS (it schedules the runs with launchd; a Mac that is asleep runs them when it wakes)' : 'Windows or macOS (it uses Task Scheduler on Windows, launchd on a Mac)'} />
              <Check2 ok={db.igAccounts.length > 0} text={db.igAccounts.length ? `${db.igAccounts.length} account${db.igAccounts.length === 1 ? '' : 's'} set up` : 'Add an account first'} action={db.igAccounts.length ? undefined : { label: 'Accounts', on: () => go('accounts') }} />
              <Check2 ok={notSignedIn.length === 0} text={notSignedIn.length ? `Not signed in: ${notSignedIn.join(', ')}. Runs skip those until you sign in.` : 'Every platform is signed in'} action={notSignedIn.length ? { label: 'Accounts', on: () => go('accounts') } : undefined} />
              <Check2 ok text="Keep the computer on and logged in. Marketo opens by itself for each run, and so does Chrome when your accounts live there." />
              <Check2 ok={!db.settings.askApproval} text={db.settings.askApproval ? '"Ask me before the AI posts" is on: runs will wait on your approvals. Turn it off on the Accounts page for hands-off runs.' : 'Posts and replies go out without waiting for you. Deletes and profile changes still wait for your approval.'} />
              {st.profiles && (
                <p className="pt-1 text-xs text-krypt-muted">
                  {st.profiles.length
                    ? `Each run works through ${st.profiles.length === 1 ? 'the profile' : 'these profiles, one after the other'}: ${st.profiles.join(', ')}. Pick which on the Multi run page.`
                    : 'No profile has Autopilot switched on, so runs have nothing to work on. Switch it on for one on the Multi run page.'}
                </p>
              )}
              <p className="pt-1 text-xs text-krypt-muted">
                Sign-ins, security checks and passcodes are never done by the AI: when one comes up, the run skips that platform and its report says so below.
                {ai === 'claude' ? ' Claude Code sign-ins expire: if a report warns about it, run "claude setup-token" in a terminal for a long-lived one.' : ''}
              </p>
            </Card>
          </Section>
        </div>

        <div>
          <Section title="Reports" description="One per run: what got posted, what was done, and anything that needs you.">
            <Card padded={false} className="divide-y divide-white/5">
              {st.reports.length === 0 ? (
                <div className="p-5 text-sm text-krypt-muted">No runs yet. "Run once now" starts one, or wait for the first scheduled time.</div>
              ) : (
                st.reports.map((r) => <Report key={r.file} r={r} open={open === r.file} onToggle={() => setOpen(open === r.file ? null : r.file)} />)
              )}
            </Card>
          </Section>
          <Section title="What the AI is told each run">
            <Card>
              <button className="flex w-full items-center gap-2 text-left text-sm text-krypt-muted" onClick={() => setShowPrompt(!showPrompt)}>
                <ChevronDown className={cls('h-4 w-4 transition', showPrompt && 'rotate-180')} /> {showPrompt ? 'Hide' : 'Show'} the run instructions
              </button>
              {showPrompt && <pre className="mt-3 whitespace-pre-wrap font-mono text-[11px] text-white/70">{st.prompt}</pre>}
            </Card>
          </Section>
        </div>
      </div>
    </Page>
  );
}

function Check2({ ok, text, action }: { ok: boolean; text: string; action?: { label: string; on: () => void } }) {
  return (
    <div className="flex items-start gap-2">
      {ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />}
      <span className="flex-1 text-white/80">{text}</span>
      {action && (
        <GhostButton small onClick={action.on}>
          {action.label}
        </GhostButton>
      )}
    </div>
  );
}
