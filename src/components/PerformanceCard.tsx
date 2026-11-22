import { useEffect, useState, type ReactNode } from 'react';
import { Activity, Gauge } from 'lucide-react';
import { MIN_ACTIVITY_DAYS, PRESETS, WINDOW_SIZES, matchPreset, presetValues, suggestedAtOnce, suggestedChromeProfiles, type PerfPreset, type PerfReadout, type PerfSettings, type ProcessReadout, type Visuals } from '@shared/perf';
import { Card, GhostButton, Toggle } from './ui';
import { cls } from '../lib/format';
import { setPerf, usePerf } from '../lib/perf';
import { useApp } from '../state/store';

// Setup > Performance: presets, every setting (the user's own numbers, soft caps warned about, never blocked) and
// "What Marketo uses now". One set of settings for the whole PC: every profile window follows it.

const VISUALS: Array<{ id: Visuals; label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: 'live', label: 'Full glass' },
  { id: 'frost', label: 'Frost' },
  { id: 'flat', label: 'Flat' },
];

function Row({ title, text, children, warn }: { title: string; text: ReactNode; children: ReactNode; warn?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-sm text-white">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-krypt-muted">{text}</p>
        {warn && <p className="mt-1 text-xs leading-relaxed text-amber-300">{warn}</p>}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}

/** A whole number the user types; saved on Enter or when the box loses focus. */
function NumberBox({ value, onSave, unit }: { value: number; onSave: (n: number) => void; unit: string }) {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  const commit = (): void => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
    else setV(String(value));
  };
  return (
    <label className="flex items-center gap-1.5 text-xs text-krypt-muted">
      <input className="input w-16 py-1 text-right font-mono text-xs" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/[^\d]/g, ''))} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
      {unit}
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-white/5 pt-2">
      <div className="pt-1 text-[11px] font-semibold uppercase tracking-wider text-krypt-muted">{title}</div>
      <div className="divide-y divide-white/5">{children}</div>
    </div>
  );
}

export function PerformanceCard() {
  const p = usePerf();
  const toast = useApp((s) => s.toast);
  const [r, setR] = useState<PerfReadout | null>(null);
  const [procs, setProcs] = useState<ProcessReadout | null>(null);
  const [measuring, setMeasuring] = useState(false);
  const [all, setAll] = useState(false);

  // The readout: every 5 s while this card is on screen.
  useEffect(() => {
    let alive = true;
    const load = (): void => {
      if (document.hidden || !window.marketo.perf) return;
      void window.marketo.perf.readout().then((x) => alive && setR(x)).catch(() => {});
    };
    load();
    const t = setInterval(load, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const ram = r?.ramTotalGb ?? 16;
  const suggested = suggestedAtOnce(ram);
  const preset: PerfPreset = matchPreset(p, ram);

  const save = async (patch: PerfSettings, msg?: string): Promise<void> => {
    try {
      const next = { ...p, ...patch };
      await setPerf({ ...patch, preset: matchPreset(next, ram) });
      if (msg) toast('ok', msg);
    } catch (e) {
      toast('error', (e as Error).message || 'Could not save that.');
    }
  };
  const pick = (k: Exclude<PerfPreset, 'custom'>): void => void save(presetValues(k, ram), `${PRESETS[k].label}: saved for every profile on this PC.`);

  const measure = async (): Promise<void> => {
    setMeasuring(true);
    try {
      setProcs(await window.marketo.perf.measure());
    } finally {
      setMeasuring(false);
    }
  };

  const ramUsed = r ? Math.round((r.ramTotalGb - r.ramFreeGb) * 10) / 10 : 0;
  const ramTight = r ? r.ramFreeGb / r.ramTotalGb < 0.15 : false;

  return (
    <Card className="space-y-4">
      {/* Presets */}
      <div>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['normal', 'light', 'mass'] as const).map((k) => (
            <button
              key={k}
              onClick={() => pick(k)}
              className={cls('rounded-xl border p-3 text-left transition', preset === k ? 'border-krypt-purple bg-krypt-purple/15' : 'border-white/10 hover:border-white/20 hover:bg-white/5')}
            >
              <div className="text-sm font-medium text-white">{PRESETS[k].label}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-krypt-muted">{PRESETS[k].text}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-krypt-muted">
          {preset === 'custom' ? 'Custom: your own mix of the settings below. ' : ''}One set of settings for this whole PC: every profile window follows it. Normal is how Marketo has always run.
        </p>
      </div>

      {/* What Marketo uses now */}
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
          <Activity className="h-4 w-4 text-krypt-purple" /> What Marketo uses now
        </div>
        {!r ? (
          <p className="text-xs text-krypt-muted">Measuring...</p>
        ) : (
          <div className="grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
            <Fig label="PC memory" value={`${ramUsed} of ${r.ramTotalGb} GB in use`} warn={ramTight} />
            <Fig label="This hub window" value={`${r.hubMb} MB (${r.hub.map((g) => `${g.type} ${g.mb}`).join(', ')})`} />
            <Fig label="Hub busy (delay)" value={`${r.lagP50} ms typical, ${r.lagP99} ms worst`} warn={r.lagP99 > 200} />
            <Fig label="Data file" value={`${r.dbMb} MB, saved in ${r.lastSaveMs} ms`} warn={r.lastSaveMs > 100} />
            <Fig label="History" value={`${r.accounts} account${r.accounts === 1 ? '' : 's'}, ${r.sessions} sessions, ${r.reels} reels`} />
            <Fig label="Log" value={`${r.logMb} MB`} />
            <Fig label="Chrome" value={`${r.chromeProfilesConnected} profile${r.chromeProfilesConnected === 1 ? '' : 's'} connected, ${r.marketoTabs} Marketo tab${r.marketoTabs === 1 ? '' : 's'} open`} />
            <Fig label="AI runs at once" value={`about ${r.suggestedAtOnce} for ${r.ramTotalGb} GB (a suggestion)`} />
            {procs && (
              <>
                <Fig label="All of Chrome" value={`${procs.chromeMb} MB in ${procs.chromeCount} processes (${procs.helperCount} Marketo helper${procs.helperCount === 1 ? '' : 's'})`} />
                <Fig label="AI apps" value={procs.aiCount ? `${procs.aiMb} MB in ${procs.aiCount} process${procs.aiCount === 1 ? '' : 'es'}` : 'none running'} />
              </>
            )}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <GhostButton small disabled={measuring} onClick={() => void measure()}>
            <Gauge className="h-3.5 w-3.5" /> {measuring ? 'Measuring...' : 'Measure Chrome and AI'}
          </GhostButton>
          <span className="text-[11px] text-krypt-muted">Reads the process list once: names and memory only.</span>
        </div>
      </div>

      <button className="text-xs text-krypt-purple hover:underline" onClick={() => setAll((x) => !x)}>
        {all ? 'Hide the settings' : 'Show every setting'}
      </button>

      {all && (
        <div className="space-y-3">
          <Group title="Hub">
            <Row title="Visual effects" text="Full glass looks best. Frost keeps the look with less work. Flat drops the blur and the moving background: lightest on weak graphics cards and with many profile windows. Auto picks Frost by itself on a slow PC.">
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                {VISUALS.map((v) => (
                  <button key={v.id} onClick={() => void save({ visuals: v.id })} className={cls('px-2.5 py-1 text-xs', p.visuals === v.id ? 'bg-krypt-purple/30 text-white' : 'text-krypt-muted hover:text-white')}>
                    {v.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Lite reel preview" text="Previews are drawn at half size, 30 times a second, and stand still while you're away. Renders are not affected.">
              <Toggle on={p.litePreview} onChange={(v) => void save({ litePreview: v })} />
            </Row>
            <Row
              title="Save activity every"
              text="Likes, follows and watches are counted at once (every limit check uses them) and written to disk every few seconds instead of after each one. 0 = after each one. Posts, comments and messages always save at once."
              warn={p.batchSaveSec > 0 ? `If the PC crashes, the last ${p.batchSaveSec} seconds of like and follow counts can be lost.` : undefined}
            >
              <NumberBox value={p.batchSaveSec} unit="sec" onSave={(n) => void save({ batchSaveSec: n })} />
            </Row>
            <Row title="Quiet log" text="Routine browser steps stay out of marketo.log. Errors, warnings, posts and run reports are always kept. Export logs gets less detail.">
              <Toggle on={p.quietLog} onChange={(v) => void save({ quietLog: v })} />
            </Row>
            <Row title="Keep run reports for" text="Autopilot reports older than this are deleted. 0 = keep them all." warn={p.runLogDays > 0 && p.runLogDays < 7 ? 'Under a week leaves little history on the Autopilot and Usage pages.' : undefined}>
              <NumberBox value={p.runLogDays} unit="days" onSave={(n) => void save({ runLogDays: n })} />
            </Row>
            <Row title="Long lists in pages" text="Research, Library, Accounts and Results show 50 at a time with a Show more button, so pages with thousands of entries open fast. Search still looks through all of them.">
              <Toggle on={p.pageLists} onChange={(v) => void save({ pageLists: v })} />
            </Row>
            <Row
              title="Move old activity out after"
              text={`The step-by-step detail of sessions older than this (each like, watch and follow) moves to a file next to the data file, so the data file stays small and saves fast. Totals, limits and warm-up counts are unchanged. At least ${MIN_ACTIVITY_DAYS} days, so per-thread and daily checks always see what they need. 0 = keep it all in the data file.`}
            >
              <NumberBox value={p.keepActivityDays} unit="days" onSave={(n) => void save({ keepActivityDays: n && n < MIN_ACTIVITY_DAYS ? MIN_ACTIVITY_DAYS : n }, n && n < MIN_ACTIVITY_DAYS ? `Saved as ${MIN_ACTIVITY_DAYS} days, the least it can be.` : undefined)} />
            </Row>
            <Row
              title="Background profiles only for their run"
              text="With each profile in its own window (Multi run), background profiles no longer all start with Main: each one opens when its run starts and closes a couple of minutes after it ends. A window you bring up stays open."
              warn={p.bgOnDemand ? 'Extra runs and Kip for a background profile only work while its window is open (during its runs, or when you open it).' : undefined}
            >
              <Toggle on={p.bgOnDemand} onChange={(v) => void save({ bgOnDemand: v })} />
            </Row>
          </Group>

          <Group title="Chrome">
            <Row title="Close tabs between accounts" text="When a run moves on to the next account, the last account's Marketo tabs close, so a run over many accounts doesn't pile up windows. A post still going up, a tab waiting on your approval and a YouTube tab the next channel shares stay open. Chrome's flags, window size and pages are never changed.">
              <Toggle on={p.closeTabsOnSwitch} onChange={(v) => void save({ closeTabsOnSwitch: v })} />
            </Row>
            <Row
              title="Chrome profiles open at once"
              text={`Before another Chrome profile opens its first Marketo tab, the one used longest ago closes its Marketo tabs (your own tabs are never touched). Never one with a post going up, an approval waiting or a Content Rewards submission due: then one more opens and the log says so. About ${suggestedChromeProfiles(ram)} suits ${ram} GB. 0 = no limit.`}
              warn={p.maxChromeProfiles > suggestedChromeProfiles(ram) ? `${p.maxChromeProfiles} is more than the ${suggestedChromeProfiles(ram)} that ${ram} GB usually holds. Your call.` : undefined}
            >
              <NumberBox value={p.maxChromeProfiles} unit="profiles" onSave={(n) => void save({ maxChromeProfiles: n })} />
            </Row>
            <Row title="Let go of a platform's tab when moving on" text="When the AI moves to another platform in the same Chrome profile, the last one's tab stops being driven (Chrome's debugging bar goes away). The tab stays open, and a post still going up is never let go.">
              <Toggle on={p.detachOnSwitch} onChange={(v) => void save({ detachOnSwitch: v })} />
            </Row>
            <Row
              title="All platforms in one window"
              text="A Chrome profile's Marketo pages open as tabs in one window instead of a window each. The tab being worked on is always brought to the front; only Marketo's own tabs are switched."
              warn={p.oneWindow ? 'Needs the Marketo extension 1.1 (it updates itself when the hub restarts). A page behind another tab is hidden: nothing switches away while a post is going up.' : undefined}
            >
              <Toggle on={p.oneWindow} onChange={(v) => void save({ oneWindow: v })} />
            </Row>
            <Row
              title="Window size"
              text={`Size of new Marketo windows in Chrome. Normal ${WINDOW_SIZES.normal.w}x${WINDOW_SIZES.normal.h}, Compact ${WINDOW_SIZES.compact.w}x${WINDOW_SIZES.compact.h} (a little less to draw). Windows already open keep their size.`}
              warn={p.windowSize !== 'normal' ? 'Some pages lay out differently in a smaller window, and a window size is one more thing a site can see. Look at a run or two.' : undefined}
            >
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                {(['normal', 'compact'] as const).map((w) => (
                  <button key={w} onClick={() => void save({ windowSize: w })} className={cls('px-2.5 py-1 text-xs', p.windowSize === w ? 'bg-krypt-purple/30 text-white' : 'text-krypt-muted hover:text-white')}>
                    {w === 'normal' ? 'Normal' : 'Compact'}
                  </button>
                ))}
              </div>
            </Row>
            <Row
              title="A proxy for each Chrome profile"
              text="Each Chrome profile can have its own proxy and sticky IP, set on the Multi run page, so one Marketo profile can run many accounts on many IPs. A Chrome profile with none uses its Marketo profile's proxy."
              warn={p.proxyPerChrome ? 'Set each one on the Multi run page. One static residential IP per Chrome profile.' : undefined}
            >
              <Toggle on={p.proxyPerChrome} onChange={(v) => void save({ proxyPerChrome: v })} />
            </Row>
          </Group>

          <Group title="Runs">
            <Row
              title="AI runs at once"
              text={`With each profile in its own window (Multi run), how many profiles' runs work at the same time; the rest wait their turn. 0 = all at once. About ${suggested} suits ${ram} GB of memory. Windows only.`}
              warn={p.aiAtOnce > suggested ? `${p.aiAtOnce} is more than ${suggested}, what ${ram} GB usually holds: runs can slow down, and Chrome tabs can crash mid-session. Your call.` : p.aiAtOnce === 0 && (r?.ramTotalGb ?? 99) < 16 ? 'All at once on a PC with under 16 GB is heavy once you have more than a few profiles.' : undefined}
            >
              <NumberBox value={p.aiAtOnce} unit="runs" onSave={(n) => void save({ aiAtOnce: n }, 'Saved. The scheduled run is rewritten to match.')} />
            </Row>
            <Row title="Stagger profile starts" text="Each profile's run waits a random 0 to this many minutes before it starts, new every run, so they don't all start in the same second (also less lockstep for the platforms to notice). 0 = no wait." warn={p.staggerMin > 60 ? 'A long wait pushes runs late into their window.' : undefined}>
              <NumberBox value={p.staggerMin} unit="min" onSave={(n) => void save({ staggerMin: n }, 'Saved. The scheduled run is rewritten to match.')} />
            </Row>
            <Row title="Keep the PC awake during runs" text="Stops Windows from sleeping while a run is going. Uses more power on a laptop.">
              <Toggle on={p.keepAwake} onChange={(v) => void save({ keepAwake: v })} />
            </Row>
            <Row
              title="Accounts a run"
              text="With many accounts in one profile, each run works this many, the ones worked least recently first; the others come up in later runs. An account with a Content Rewards submission due is always in. 0 = every account every run."
              warn={p.accountsPerRun > 0 ? 'Each account then gets fewer runs a day: its engagement and posts are spread over the runs it gets, so daily targets can come out lower.' : undefined}
            >
              <NumberBox value={p.accountsPerRun} unit="accounts" onSave={(n) => void save({ accountsPerRun: n })} />
            </Row>
            <Row title="Shorter run plan" text="The plan the AI reads at the start of a run says the shared parts once instead of under every platform, so long account lists use fewer tokens. Your own per-platform instructions stay on every line.">
              <Toggle on={p.compactPlan} onChange={(v) => void save({ compactPlan: v })} />
            </Row>
          </Group>

          <Group title="Rendering">
            <Row title="Render at low priority" text="While a reel renders, the hub steps back so Chrome and your desktop stay smooth. Renders take a little longer. Chrome itself is never slowed.">
              <Toggle on={p.lowPriorityRender} onChange={(v) => void save({ lowPriorityRender: v })} />
            </Row>
            <Row title="Video encoder" text="Auto uses the graphics card and falls back to software. Software leaves the card free, useful when many profiles render; it is slower.">
              <div className="flex overflow-hidden rounded-lg border border-white/10">
                {(['auto', 'software'] as const).map((e) => (
                  <button key={e} onClick={() => void save({ encoder: e })} className={cls('px-2.5 py-1 text-xs', p.encoder === e ? 'bg-krypt-purple/30 text-white' : 'text-krypt-muted hover:text-white')}>
                    {e === 'auto' ? 'Auto' : 'Software'}
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Smaller video files" text="About half the file size, at a lower bitrate. Look at a render or two before leaving it on.">
              <Toggle on={p.mediumQuality} onChange={(v) => void save({ mediumQuality: v })} />
            </Row>
            <Row title="One render at a time" text="With each profile in its own window, only one profile renders at once; the others wait their turn (their render says so). Stops several renders fighting over the PC.">
              <Toggle on={p.oneRenderAtATime} onChange={(v) => void save({ oneRenderAtATime: v })} />
            </Row>
            <Row
              title="Clean up posted renders after"
              text="The video files of reels posted longer ago than this go to the Recycle Bin (the reel, its stats and its links stay). Never a file another reel uses, or one with a Content Rewards submission waiting. 0 = keep them."
              warn={p.cleanupDays > 0 && p.cleanupDays < 3 ? 'Under 3 days leaves no file to post again or check.' : undefined}
            >
              <NumberBox value={p.cleanupDays} unit="days" onSave={(n) => void save({ cleanupDays: n })} />
            </Row>
            <Row title="Lighter clip downloads" text="Twitch, Kick and YouTube clips are looked up one at a time and downloaded at 720p instead of the best there is. Less memory and network while clipping.">
              <Toggle on={p.lightClips} onChange={(v) => void save({ lightClips: v })} />
            </Row>
            <Row title="Faster screen recordings" text="App recordings are saved straight as MP4 where the PC supports it, instead of being converted after.">
              <Toggle on={p.fastRecording} onChange={(v) => void save({ fastRecording: v })} />
            </Row>
            <Row title="Lighter 3D characters" text="3D character styles draw with simpler lighting and shadows: much less work for the graphics card, a little less polished.">
              <Toggle on={p.fast3d} onChange={(v) => void save({ fast3d: v })} />
            </Row>
          </Group>
        </div>
      )}
    </Card>
  );
}

function Fig({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="flex gap-2">
      <span className="w-32 shrink-0 text-krypt-muted">{label}</span>
      <span className={cls('min-w-0 flex-1', warn ? 'text-amber-300' : 'text-white/85')}>{value}</span>
    </div>
  );
}
