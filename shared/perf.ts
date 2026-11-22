// Performance settings: for slower PCs and for running many accounts on one PC.
// One file for the whole machine (every profile window follows it). A missing file or field is today's behaviour,
// and every number is the user's own: suggested values are soft caps that come with a plain warning, never a block.

export type Visuals = 'auto' | 'live' | 'frost' | 'flat';
export type EncoderChoice = 'auto' | 'software';
/** Chrome window size Marketo opens: normal = 1320x920 (today), compact = 1100x850. */
export type WindowSize = 'normal' | 'compact';
export const WINDOW_SIZES: Record<WindowSize, { w: number; h: number }> = { normal: { w: 1320, h: 920 }, compact: { w: 1100, h: 850 } };
/** The per-thread reply cap reads this many days of detailed activity: never kept for less. */
export const MIN_ACTIVITY_DAYS = 30;
export type PerfPreset = 'normal' | 'light' | 'mass' | 'custom';

export interface PerfSettings {
  preset?: PerfPreset;
  // ── Hub ──
  /** auto = today (live glass, drops to frost on a slow machine). flat = no glass blur, no moving backdrop. */
  visuals?: Visuals;
  /** Reel previews drawn at half size and 30 fps, paused while you're away. */
  litePreview?: boolean;
  /** Seconds between saves of likes/follows counts (0 = after every one, today). Posts and messages always save at once. */
  batchSaveSec?: number;
  /** Leave routine browser steps out of marketo.log (errors are always kept). */
  quietLog?: boolean;
  /** Delete autopilot run reports older than this many days (0 = keep all, today). */
  runLogDays?: number;
  /** Long lists (sessions, reels, accounts, results) show 50 at a time with "Show more". */
  pageLists?: boolean;
  /** Keep each like/follow/comment row this many days, then only the day's totals (0 = forever, today). At least MIN_ACTIVITY_DAYS. */
  keepActivityDays?: number;
  // ── Chrome ──
  /** Close an account's Marketo tabs when the run moves on to another account (uploads still going up are kept). */
  closeTabsOnSwitch?: boolean;
  /** At most this many Chrome profiles open at once: the least recently used idle one closes first (0 = no limit, today). */
  maxChromeProfiles?: number;
  /** An account's platforms open as tabs in one window instead of one window each. */
  oneWindow?: boolean;
  /** Let go of a platform's tab (end Marketo's control of it) as soon as the AI moves to another platform. */
  detachOnSwitch?: boolean;
  /** The size of the Chrome windows Marketo opens. */
  windowSize?: WindowSize;
  /** Each Chrome profile can have its own proxy (one Marketo profile, many proxies), instead of one proxy per Marketo profile. */
  proxyPerChrome?: boolean;
  // ── Runs ──
  /** Multi-instance mode: how many profiles' AI runs work at the same time (0 = all at once, today). */
  aiAtOnce?: number;
  /** Each profile's run waits a random 0-N minutes before it starts (0 = no wait, today). */
  staggerMin?: number;
  /** Keep the PC from sleeping while a run is going. */
  keepAwake?: boolean;
  /** Multi-instance mode: background profiles' windows start only for their run and close after it (instead of all at app start). */
  bgOnDemand?: boolean;
  /** Each run works this many accounts, the ones worked least recently first (0 = all, today). */
  accountsPerRun?: number;
  /** The run's plan prints the shared instructions once, not under every account. */
  compactPlan?: boolean;
  // ── Rendering ──
  /** Renders run at low priority so Chrome and the desktop stay smooth. */
  lowPriorityRender?: boolean;
  /** Video encoder for renders: auto = graphics card first, software if it fails (today); software = leave the card free. */
  encoder?: EncoderChoice;
  /** Smaller render files (about half the size). */
  mediumQuality?: boolean;
  /** One render at a time across all profiles on this PC; the others wait their turn. */
  oneRenderAtATime?: boolean;
  /** Rendered files of reels posted everywhere go to the Recycle Bin after this many days (0 = keep, today). */
  cleanupDays?: number;
  /** Clip lookups use one hidden window instead of three, and YouTube parts are recorded at 720p. */
  lightClips?: boolean;
  /** Screen recordings use the graphics card's encoder when it has one. */
  fastRecording?: boolean;
  /** The 3D mascot is drawn with lighter shading and shadows. */
  fast3d?: boolean;
}

export const PERF_DEFAULTS: Required<Omit<PerfSettings, 'preset'>> = {
  visuals: 'auto',
  litePreview: false,
  batchSaveSec: 0,
  quietLog: false,
  runLogDays: 0,
  closeTabsOnSwitch: false,
  aiAtOnce: 0,
  staggerMin: 0,
  keepAwake: false,
  lowPriorityRender: false,
  encoder: 'auto',
  mediumQuality: false,
  pageLists: false,
  keepActivityDays: 0,
  maxChromeProfiles: 0,
  oneWindow: false,
  detachOnSwitch: false,
  windowSize: 'normal',
  proxyPerChrome: false,
  bgOnDemand: false,
  accountsPerRun: 0,
  compactPlan: false,
  oneRenderAtATime: false,
  cleanupDays: 0,
  lightClips: false,
  fastRecording: false,
  fast3d: false,
};

export const perfOf = (p: PerfSettings | null | undefined): Required<Omit<PerfSettings, 'preset'>> & { preset: PerfPreset } => ({
  ...PERF_DEFAULTS,
  ...Object.fromEntries(Object.entries(p ?? {}).filter(([, v]) => v !== undefined && v !== null)),
  preset: p?.preset ?? 'normal',
});

/** Soft caps: past these Marketo warns plainly, it never refuses. */
export const SOFT_PROFILES = 20;
export const SOFT_RUNS_A_DAY = 8;

/** RAM (GB) a PC needs per AI run working at once, roughly: the AI, the shim, a hub window and Chrome tabs. */
export const GB_PER_RUN = 3;
/** Suggested Chrome profiles open at once: one with its tabs open takes about 1.5 GB (a soft cap). */
export const suggestedChromeProfiles = (ramGb: number): number => Math.max(1, Math.floor((ramGb - 4) / 1.5));
/** Suggested AI runs at once for this much RAM (a soft cap: the user can set any number). */
export const suggestedAtOnce = (ramGb: number): number => Math.max(1, Math.floor((ramGb - 4) / GB_PER_RUN));

/** Settings a preset never touches: they change how accounts look to the platforms or how proxies are set up. */
export const OUTSIDE_PRESETS = ['proxyPerChrome', 'windowSize', 'oneWindow', 'fastRecording', 'fast3d'] as const;
const presetKeys = (): Array<keyof typeof PERF_DEFAULTS> => (Object.keys(PERF_DEFAULTS) as Array<keyof typeof PERF_DEFAULTS>).filter((k) => !(OUTSIDE_PRESETS as readonly string[]).includes(k));
/** A preset's values without the settings presets leave alone. */
export const presetValues = (k: Exclude<PerfPreset, 'custom'>, ramGb: number): Omit<PerfSettings, 'preset'> => {
  const all = PRESETS[k].values(ramGb) as Record<string, unknown>;
  return Object.fromEntries(presetKeys().map((f) => [f, all[f] ?? PERF_DEFAULTS[f]])) as Omit<PerfSettings, 'preset'>;
};

export const PRESETS: Record<Exclude<PerfPreset, 'custom'>, { label: string; text: string; values: (ramGb: number) => Omit<PerfSettings, 'preset'> }> = {
  normal: {
    label: 'Normal',
    text: 'How Marketo has always run. Best on a strong PC with a few accounts.',
    values: () => ({ ...PERF_DEFAULTS }),
  },
  light: {
    label: 'Light PC',
    text: 'Lighter visuals and previews, quieter logs, tabs closed between accounts, renders at low priority.',
    values: () => ({ ...PERF_DEFAULTS, visuals: 'frost', litePreview: true, quietLog: true, closeTabsOnSwitch: true, lowPriorityRender: true, runLogDays: 60, pageLists: true, oneRenderAtATime: true, lightClips: true, detachOnSwitch: true }),
  },
  mass: {
    label: 'Mass run (100+ accounts)',
    text: 'Everything in Light PC, plus flat visuals, batched saves, limits on AI runs and Chrome profiles open at once, staggered starts, a few accounts per run and clean-up of old files.',
    values: (ram) => ({
      ...PERF_DEFAULTS,
      visuals: 'flat',
      litePreview: true,
      quietLog: true,
      closeTabsOnSwitch: true,
      lowPriorityRender: true,
      runLogDays: 30,
      batchSaveSec: 2,
      aiAtOnce: suggestedAtOnce(ram),
      staggerMin: 10,
      keepAwake: true,
      pageLists: true,
      keepActivityDays: 30,
      maxChromeProfiles: suggestedChromeProfiles(ram),
      detachOnSwitch: true,
      bgOnDemand: true,
      accountsPerRun: 5,
      compactPlan: true,
      oneRenderAtATime: true,
      cleanupDays: 14,
      lightClips: true,
    }),
  },
};

/** The preset these values match, or custom. */
export function matchPreset(p: PerfSettings, ramGb: number): PerfPreset {
  const v = perfOf(p);
  for (const k of ['normal', 'light', 'mass'] as const) {
    const want = perfOf(PRESETS[k].values(ramGb));
    if (presetKeys().every((f) => v[f] === want[f])) return k;
  }
  return 'custom';
}

/** Cleans what a window sends: unknown fields dropped, numbers whole and 0 or more (no upper bound: the user's number). */
export function cleanPerf(input: unknown): PerfSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const out: PerfSettings = {};
  const num = (k: keyof PerfSettings): void => {
    if (o[k] === undefined) return;
    const n = Math.round(Number(o[k]));
    if (Number.isFinite(n) && n >= 0) (out as Record<string, unknown>)[k] = n;
  };
  const bool = (k: keyof PerfSettings): void => {
    if (o[k] !== undefined) (out as Record<string, unknown>)[k] = !!o[k];
  };
  if (['normal', 'light', 'mass', 'custom'].includes(String(o.preset))) out.preset = o.preset as PerfPreset;
  if (['auto', 'live', 'frost', 'flat'].includes(String(o.visuals))) out.visuals = o.visuals as Visuals;
  if (['auto', 'software'].includes(String(o.encoder))) out.encoder = o.encoder as EncoderChoice;
  if (['normal', 'compact'].includes(String(o.windowSize))) out.windowSize = o.windowSize as WindowSize;
  (['batchSaveSec', 'runLogDays', 'aiAtOnce', 'staggerMin', 'keepActivityDays', 'maxChromeProfiles', 'accountsPerRun', 'cleanupDays'] as const).forEach(num);
  (['litePreview', 'quietLog', 'closeTabsOnSwitch', 'keepAwake', 'lowPriorityRender', 'mediumQuality', 'pageLists', 'oneWindow', 'detachOnSwitch', 'proxyPerChrome', 'bgOnDemand', 'compactPlan', 'oneRenderAtATime', 'lightClips', 'fastRecording', 'fast3d'] as const).forEach(bool);
  return out;
}

/** What the PC and the hub use right now (Setup > Performance). */
export interface PerfReadout {
  at: string;
  ramTotalGb: number;
  ramFreeGb: number;
  cpus: number;
  cpuModel: string;
  /** This hub window's processes, by type. */
  hub: Array<{ type: string; mb: number; cpu: number; count: number }>;
  hubMb: number;
  /** Main-thread delay (ms): high numbers mean the hub is busy. */
  lagP50: number;
  lagP99: number;
  dbMb: number;
  lastSaveMs: number;
  logMb: number;
  sessions: number;
  reels: number;
  accounts: number;
  chromeProfilesConnected: number;
  marketoTabs: number;
  suggestedAtOnce: number;
}

/** Measured on demand only (a button), never polled: Chrome and AI processes on this PC. */
export interface ProcessReadout {
  chromeMb: number;
  chromeCount: number;
  helperCount: number;
  aiMb: number;
  aiCount: number;
}
