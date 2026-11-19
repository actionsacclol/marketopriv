import { useState } from 'react';
import { AlertTriangle, Check, Copy, ExternalLink, Flame, Users, Youtube } from 'lucide-react';
import type { IgAccount, Site } from '@shared/types';
import { POST_MINUTES, SITE_LABEL, localDate, phasesFor, planFor, quotaKeys, quotaLabel, sameHandle, totalsOn, warmupPrompt, watchOnlyOn, ytLimit, ytUploadsToday, type Phase, type Quota } from '@shared/warmup';
import { Card, Empty, GhostButton, Page, PrimaryButton, Section, Toggle } from '../components/ui';
import { GlassSegmented } from '../components/glass/GlassSegmented';
import { AccountStatusChip, SignInLine } from './Accounts';
import { SITE_COLOR, SITE_ICON, SITE_SHORT, TONE_DOT, TONE_TEXT, accountSites, openSite } from '../lib/platforms';
import { useApp } from '../state/store';
import { cls, fmtDate } from '../lib/format';

const SETUP: Array<[keyof IgAccount['setup'], string]> = [
  ['avatar', 'Profile photo'],
  ['bio', 'Bio'],
  ['link', 'Link in bio'],
  ['firstPost', 'First post'],
];

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const label = (k: keyof Quota, site: Site): string => (k === 'messages' ? 'DMs' : cap(quotaLabel(k, site)));

/** done vs ceiling. Over the ceiling is called out in words, not just colour. */
function Meter({ label, done, limit }: { label: string; done: number; limit: number }) {
  const over = done > limit;
  const at = !over && limit > 0 && done >= limit;
  const ratio = limit > 0 ? Math.min(1, done / limit) : done > 0 ? 1 : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-krypt-muted">{label}</span>
        <span className="font-mono">
          <span className="text-white">{done}</span>
          <span className="text-krypt-muted"> / {limit}</span>
          {over && <span className="ml-1.5 text-rose-300">over</span>}
          {at && <span className="ml-1.5 text-amber-300">at limit</span>}
          {limit === 0 && !over && <span className="ml-1.5 text-krypt-muted">not yet</span>}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className={cls('h-full rounded-full', over ? 'bg-rose-400' : at ? 'bg-amber-400' : 'bg-krypt-gradient')} style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}

/** Last 28 days on one platform, one cell per day, shaded by minutes (single hue). */
function Calendar({ a, site, start }: { a: IgAccount; site: Site; start: string }) {
  const sessions = useApp((s) => s.db!.sessions);
  const days = Array.from({ length: 28 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (27 - i));
    const ymd = localDate(d);
    return { ymd, d, t: totalsOn(sessions, a.handle, ymd, site) };
  });
  const max = Math.max(30, ...days.map((x) => x.t.minutes));
  const [hover, setHover] = useState<number | null>(null);
  const hv = hover !== null ? days[hover] : null;
  const keys = quotaKeys(site).filter((k) => k !== 'minutes');
  return (
    <div>
      <div className="grid max-w-[620px] grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5" onMouseLeave={() => setHover(null)}>
        {days.map((x, i) => {
          const before = x.ymd < start;
          const today = x.ymd === localDate();
          return (
            <div
              key={x.ymd}
              onMouseEnter={() => setHover(i)}
              className={cls('aspect-square rounded-md border', today ? 'border-white/60' : x.ymd === start ? 'border-krypt-purple' : 'border-transparent', before && 'opacity-30')}
              style={{ background: x.t.minutes ? `rgba(168,85,247,${0.25 + 0.75 * Math.min(1, x.t.minutes / max)})` : 'rgba(255,255,255,0.05)' }}
            />
          );
        })}
      </div>
      <div className="mt-2 min-h-4 text-[11px] text-krypt-muted">
        {hv ? (
          <span className="font-mono">
            {hv.d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · {Math.round(hv.t.minutes)} min
            {keys.map((k) => ` · ${hv.t[k]} ${quotaLabel(k, site) === 'messages' ? 'DMs' : quotaLabel(k, site)}`).join('')}
          </span>
        ) : (
          <span>Last 28 days on {SITE_LABEL[site]}. Darker = more minutes. Purple outline = warm-up day 1, white = today.</span>
        )}
      </div>
    </div>
  );
}

function PhaseLadder({ phases, day, current }: { phases: Phase[]; day: number; current: string }) {
  return (
    <div className="flex gap-1.5">
      {phases.map((p) => {
        const isCur = p.id === current;
        const span = p.to === Infinity ? 1 : p.to - p.from + 1;
        const fill = isCur && p.to !== Infinity ? Math.min(1, (day - p.from + 1) / span) : day > p.to ? 1 : isCur ? 1 : 0;
        return (
          <div key={p.id} className="min-w-0" style={{ flex: p.to === Infinity ? 3 : span }}>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div className={cls('h-full', isCur ? 'bg-krypt-gradient' : 'bg-white/35')} style={{ width: `${fill * 100}%` }} />
            </div>
            <div className={cls('mt-1.5 truncate text-[11px]', isCur ? 'font-semibold text-white' : 'text-krypt-muted')}>
              {p.name} <span className="font-mono text-krypt-muted">{p.to === Infinity ? `${p.from}+` : `${p.from}–${p.to}`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** YouTube has no warm-up: Marketo only uploads Shorts there. */
function YouTubePanel({ a }: { a: IgAccount }) {
  const uploads = [...(a.youtube?.uploads ?? [])].sort().reverse();
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title="Today" description="YouTube has no warm-up ladder: Marketo only uploads Shorts there (no likes, subscribes or comments), so the only limit is uploads.">
        <Card>
          <Meter label="Shorts uploaded" done={ytUploadsToday(a)} limit={ytLimit(a)} />
        </Card>
      </Section>
      <Section title={`Uploads · ${uploads.length}`}>
        <Card padded={false} className="max-h-[260px] divide-y divide-white/5 overflow-auto">
          {uploads.length === 0 && <div className="p-4 text-sm text-krypt-muted">None yet.</div>}
          {uploads.map((t, i) => (
            <div key={`${t}-${i}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>Short published</span>
              <span className="font-mono text-xs text-krypt-muted">{fmtDate(t)}</span>
            </div>
          ))}
        </Card>
      </Section>
    </div>
  );
}

function AccountWarmup({ a }: { a: IgAccount }) {
  const db = useApp((s) => s.db)!;
  const st = useApp((s) => s.browser.find((x) => x.accountId === a.id));
  const toast = useApp((s) => s.toast);
  const states = accountSites(a, st, db);
  const [pick, setPick] = useState<Site>(states[0]?.site ?? 'instagram');
  const ss = states.find((x) => x.site === pick) ?? states[0];
  const patch = (x: Parameters<typeof window.marketo.db.saveAccount>[0]): void =>
    void window.marketo.db.saveAccount({ id: a.id, ...x }).then((r) => {
      if (!r.ok) toast('error', r.message ?? 'Could not save.');
    });

  if (!ss) {
    return (
      <Card className="text-sm text-krypt-muted">
        No platform is turned on for {a.handle}. Turn one on on the Accounts page.
      </Card>
    );
  }
  const site = ss.site;
  const L = SITE_LABEL[site];
  const yt = site === 'youtube';
  const plan = planFor(a, db.sessions, undefined, site);
  const phases = phasesFor(site);
  const q = plan.phase.quota;
  const keys = quotaKeys(site);
  const ig = site === 'instagram';
  // Instagram's ladder follows the account's status; every other platform warms up on its own clock.
  const warming = ig ? a.status === 'warming' : true;
  const start = ig ? a.warmupStart : (a[site as Exclude<Site, 'instagram' | 'youtube'>]?.warmupStart ?? localDate());
  const sessions = db.sessions.filter((s) => (s.site ?? 'instagram') === site && sameHandle(s.handle, a.handle));
  const watch = watchOnlyOn(a, site);
  const Icon = SITE_ICON[site];

  return (
    <div className="space-y-6">
      {states.length > 1 && (
        <GlassSegmented
          value={site}
          onChange={setPick}
          wrap
          options={states.map((x) => {
            const I = SITE_ICON[x.site];
            return { value: x.site, label: SITE_SHORT[x.site], icon: <I className="h-3.5 w-3.5" style={{ color: SITE_COLOR[x.site] }} />, title: `${SITE_LABEL[x.site]}: ${x.state}` };
          })}
        />
      )}

      <Card className="space-y-5">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-krypt-muted">{yt ? 'Shorts today' : warming ? 'Warm-up day' : 'Status'}</div>
            <div className="mt-1 font-mono text-5xl font-semibold text-krypt-gradient">{yt ? `${ytUploadsToday(a)}/${ytLimit(a)}` : warming ? plan.day : a.status}</div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Icon className="h-5 w-5" style={{ color: SITE_COLOR[site] }} />
              <span className="font-mono text-xl font-semibold">{ss.who}</span>
              {ig && <AccountStatusChip status={a.status} />}
            </div>
            <div className="mt-1">
              {ig ? (
                <SignInLine a={a} st={st} />
              ) : (
                <span className="flex items-center gap-2 text-xs">
                  <span className={cls('h-2 w-2 rounded-full', TONE_DOT[ss.tone])} />
                  <span className={TONE_TEXT[ss.tone]}>{ss.detail}</span>
                </span>
              )}
            </div>
            {!yt && (
              <div className="mt-1 text-sm text-krypt-muted">
                {L} · {plan.phase.name} phase{plan.next && warming ? ` · ${plan.next.name} from day ${plan.next.from}` : ''} · active {plan.activeDays7}/7 days · started {start}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <PrimaryButton onClick={() => void openSite(a.id, site)}>
              {yt ? <Youtube className="h-4 w-4" /> : <ExternalLink className="h-4 w-4" />} Open {yt ? 'YouTube Studio' : L}
            </PrimaryButton>
            {!yt && (
              <GhostButton onClick={() => void window.marketo.app.copyText(warmupPrompt(a, plan, site)).then(() => toast('ok', 'Prompt copied. Paste it into your AI (or the Chat page).'))}>
                <Copy className="h-4 w-4" /> Copy warm-up prompt
              </GhostButton>
            )}
          </div>
        </div>
        {!yt && warming && <PhaseLadder phases={phases} day={plan.day} current={plan.phase.id} />}
        {!yt && watch && (
          <div className="flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Watch only on {L}: the browser refuses likes, follows, comments and posts there. Change it on the Accounts page.
          </div>
        )}
      </Card>

      {yt ? (
        <YouTubePanel a={a} />
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <Section title={`Today on ${L} · ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`} description="Ceilings for this phase. The browser stops each action when its ceiling is reached. Each post adds a few minutes on top for uploading.">
              <Card className="space-y-3">
                {keys.map((k) => (
                  <Meter key={k} label={label(k, site)} done={Math.round(plan.done[k] * 10) / 10} limit={k === 'minutes' ? q.minutes + POST_MINUTES * plan.done.posts : q[k]} />
                ))}
              </Card>
            </Section>
            <Section title="This phase">
              <Card className="space-y-4">
                <ul className="space-y-2">
                  {plan.phase.tasks.map((t) => (
                    <li key={t} className="flex gap-2 text-sm text-white/85">
                      <Flame className="mt-0.5 h-4 w-4 shrink-0 text-krypt-purple" /> {t}
                    </li>
                  ))}
                </ul>
                {ig && (
                  <>
                    <div>
                      <div className="label">Profile setup</div>
                      <div className="grid grid-cols-2 gap-2">
                        {SETUP.map(([k, l]) => (
                          <Toggle key={k} on={a.setup[k]} onChange={(v) => patch({ setup: { [k]: v } })} label={l} />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="label mb-0">Status</span>
                      {(['warming', 'active', 'paused'] as const).map((s) => (
                        <button key={s} onClick={() => patch({ status: s })} className={cls('rounded-full border px-2.5 py-1 text-xs capitalize', a.status === s ? 'border-krypt-purple/60 bg-krypt-purple/15 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </Card>
            </Section>
          </div>

          <Section title="Activity">
            <Card>
              <Calendar a={a} site={site} start={start} />
            </Card>
          </Section>

          <div className="grid gap-6 xl:grid-cols-2">
            <Section title={`${L} ramp`}>
              <Card padded={false} className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-krypt-muted">
                      <th className="px-4 py-2.5 font-semibold">Phase</th>
                      {keys.map((k) => (
                        <th key={k} className="px-2 py-2.5 text-right font-semibold">
                          {k === 'minutes' ? 'min' : k === 'messages' ? 'DMs' : quotaLabel(k, site)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {phases.map((ph) => (
                      <tr key={ph.id} className={cls('border-t border-white/5', ph.id === plan.phase.id && 'bg-krypt-purple/10')}>
                        <td className="px-4 py-2 font-sans">
                          {ph.id === plan.phase.id && <Check className="mr-1 inline h-3.5 w-3.5 text-krypt-purple" />}
                          {ph.name} <span className="font-mono text-[11px] text-krypt-muted">d{ph.to === Infinity ? `${ph.from}+` : `${ph.from}–${ph.to}`}</span>
                        </td>
                        {keys.map((k) => (
                          <td key={k} className="px-2 py-2 text-right text-white/80">
                            {ph.quota[k]}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </Section>
            <Section title={`Sessions · ${sessions.length}`}>
              <Card padded={false} className="max-h-[260px] divide-y divide-white/5 overflow-auto">
                {sessions.length === 0 && <div className="p-4 text-sm text-krypt-muted">None yet on {L}. The browser records each session as your AI works.</div>}
                {sessions.map((s) => (
                  <div key={s.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="capitalize">
                        {s.kind}
                        {s.live && <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">recording</span>}
                      </span>
                      <span className="font-mono text-xs text-krypt-muted">
                        {fmtDate(s.startedAt)} · {s.minutes}m
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-krypt-muted">
                      {s.watched} watched
                      {keys
                        .filter((k) => k !== 'minutes' && k !== 'posts')
                        .map((k) => ` · ${(k === 'reposts' ? s.reposts : k === 'messages' ? s.messages : s[k]) ?? 0} ${k === 'messages' ? 'DMs' : quotaLabel(k, site)}`)
                        .join('')}
                    </div>
                  </div>
                ))}
              </Card>
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

export default function Warming() {
  const db = useApp((s) => s.db)!;
  const selected = useApp((s) => s.selectedAccount);
  const selectAccount = useApp((s) => s.selectAccount);
  const go = useApp((s) => s.go);
  const order = { warming: 0, active: 1, paused: 2 };
  const list = [...db.igAccounts].sort((x, y) => order[x.status] - order[y.status]);
  const current = list.find((a) => a.id === selected) ?? list.find((a) => sameHandle(a.handle, db.settings.handle)) ?? list[0];

  return (
    <Page title="Warming" subtitle="Daily ramp for each platform: what's allowed today and what's done.">
      {list.length === 0 ? (
        <Empty icon={<Users className="h-6 w-6" />} title="No accounts yet">
          <button onClick={() => go('accounts')} className="text-krypt-purple hover:underline">
            Add one on the Accounts page
          </button>{' '}
          and sign it in.
        </Empty>
      ) : (
        <>
          {list.length > 1 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {list.map((a) => (
                <button
                  key={a.id}
                  onClick={() => selectAccount(a.id)}
                  className={cls('flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition', a.id === current?.id ? 'border-krypt-purple/60 bg-krypt-purple/15 text-white' : 'border-white/10 bg-white/5 text-krypt-muted hover:text-white')}
                >
                  <span className="font-mono">{a.handle}</span>
                  <span className="text-[11px] text-krypt-muted">{a.status}</span>
                </button>
              ))}
            </div>
          )}
          {current && <AccountWarmup key={current.id} a={current} />}
        </>
      )}
    </Page>
  );
}
