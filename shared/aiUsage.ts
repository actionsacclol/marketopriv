// AI models and token usage: which model an autopilot run uses, what a run
// used, and what a day of runs is likely to use. Shared by the hub (which
// records what each run reports) and the Autopilot page (which estimates).

/** The tokens one AI session used, as the AI app itself reported them. */
export interface RunUsage {
  /** What this row is: a run's report file name, or 'chat <day> <model>' for the built-in chat. */
  key: string;
  /** When it started (local, YYYY-MM-DDTHH:MM). */
  at: string;
  kind: 'run' | 'chat';
  /** The model that did most of the work, as the app names it ("claude-sonnet-5-5"). */
  model?: string;
  /** Tokens sent that were not already cached. */
  input: number;
  output: number;
  /** Tokens re-read from the cache: the long conversation sent again on every step. The bulk of a run. */
  cacheRead: number;
  cacheWrite: number;
  /** The run was made with the token saver on. */
  saver?: boolean;
  /** The usage tier it ran on. Missing on runs from before tiers (full runs). */
  tier?: UsageTier;
  /** What the AI app says this would cost at API list prices, in USD. Missing when it does not say. */
  cost?: number;
  /** Steps the AI took (one per reply). */
  turns?: number;
  minutes?: number;
  profileId?: string;
}

export interface TokenCount {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const totalTokens = (u: TokenCount): number => u.input + u.output + u.cacheRead + u.cacheWrite;

/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ModelChoice {
  /** What goes after --model ('' = leave it to the AI app's own setting). */
  id: string;
  label: string;
  hint: string;
  /** Text that names this family inside a full model name ("claude-sonnet-5-5" has "sonnet"). */
  family?: string;
  price?: ModelPrice;
}

/** When the prices below were read. They are Anthropic's API list prices; a subscription is not billed per token. */
export const PRICES_AS_OF = 'November 2026';

/**
 * Claude Code's models, by the short names its --model option takes (each means the newest model of that family).
 * Cache writes are priced as the one-hour kind Claude Code uses (twice the input price). Haiku is priced at its
 * long-prompt rate, because a run's conversation is well past the size where that rate starts.
 */
export const CLAUDE_MODELS: ModelChoice[] = [
  { id: '', label: "Claude Code's own setting", hint: 'Whatever model Claude Code is set to on this computer.' },
  { id: 'fable', label: 'Fable', hint: 'Most capable, and the most expensive.', family: 'fable', price: { input: 8, output: 40, cacheRead: 0.2, cacheWrite: 16 } },
  { id: 'opus', label: 'Opus', hint: 'Very capable.', family: 'opus', price: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 8 } },
  { id: 'sonnet', label: 'Sonnet', hint: 'Fast and capable, well under half the cost of Fable on a run.', family: 'sonnet', price: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 4 } },
  { id: 'haiku', label: 'Haiku', hint: 'Smallest and cheapest. Not tried on full runs.', family: 'haiku', price: { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 1 } },
];

// ── Usage tiers ──
// How much of an AI plan the scheduled runs take. A tier sets the model, the runs a day and the token saver (each can
// still be changed by itself afterwards), and how much one run takes on: how many platforms, how long it engages,
// how many new reels and web searches. That last part is what lets a $20 plan last the month: a run's tokens grow
// faster than its length, because every step re-reads the conversation so far. Anthropic and OpenAI publish no exact
// plan limits, so the plans named here are a starting point; the Usage page shows what runs really used.

export type UsageTier = 'low' | 'medium' | 'high' | 'max';
export const USAGE_TIER_IDS: UsageTier[] = ['low', 'medium', 'high', 'max'];

export interface TierSpec {
  id: UsageTier;
  label: string;
  /** Which plans it is meant for. */
  plan: string;
  /** Claude Code model short name. */
  model: string;
  /** Run times a day (local HH:MM). */
  times: string[];
  saver: boolean;
  /** Platforms each account works on in one run (0 = all of them); the rest come up in the next runs. */
  platformsPerRun: number;
  /** Minutes of engagement per platform in a run (at most). */
  engageMin: number;
  /** About how long a run should take. */
  runMin: number;
  /** New reels made in one run (0 = as many as the day's targets need). */
  reelsPerRun: number;
  /** Web searches per reel (0 = as many as it takes). */
  searchesPerReel: number;
}

export const USAGE_TIERS: Record<UsageTier, TierSpec> = {
  low: { id: 'low', label: 'Low', plan: '$20 plans (Claude Pro, ChatGPT Plus): made to last the whole month', model: 'sonnet', times: ['12:00'], saver: true, platformsPerRun: 2, engageMin: 6, runMin: 20, reelsPerRun: 1, searchesPerReel: 2 },
  medium: { id: 'medium', label: 'Medium', plan: 'a $20 plan with room to spare, or a light $100 plan', model: 'sonnet', times: ['10:00', '18:00'], saver: true, platformsPerRun: 4, engageMin: 10, runMin: 35, reelsPerRun: 2, searchesPerReel: 4 },
  high: { id: 'high', label: 'High', plan: '$100 plans (Claude Max 5x)', model: 'opus', times: ['09:00', '15:00', '21:00'], saver: false, platformsPerRun: 0, engageMin: 12, runMin: 50, reelsPerRun: 0, searchesPerReel: 0 },
  max: { id: 'max', label: 'Max', plan: '$200 plans (Claude Max 20x) or an API key: full runs, what Krypt runs', model: 'fable', times: ['09:00', '13:00', '17:00', '21:00'], saver: false, platformsPerRun: 0, engageMin: 15, runMin: 60, reelsPerRun: 0, searchesPerReel: 0 },
};

/** Older installs have no tier: their runs were full runs. */
export const tierOf = (t: string | undefined): TierSpec => USAGE_TIERS[(USAGE_TIER_IDS as string[]).includes(t ?? '') ? (t as UsageTier) : 'max'];

/** What the tier's settings are, in one line ("Sonnet · 1 run a day · 2 platforms a run · token saver"). */
export function tierSummary(t: TierSpec): string {
  const model = CLAUDE_MODELS.find((m) => m.id === t.model)?.label ?? t.model;
  return [model, `${t.times.length} run${t.times.length === 1 ? '' : 's'} a day`, t.platformsPerRun ? `${t.platformsPerRun} platforms a run` : 'every platform each run', `~${t.runMin} min a run`, t.saver ? 'token saver' : ''].filter(Boolean).join(' · ');
}

/**
 * A full run's tokens scaled to a tier's run length, for estimates before a run on that tier is measured. Steps grow
 * with the minutes, and each step re-reads everything before it, so re-reading grows faster than the length; 1.5 is
 * a middle guess between straight (1) and every step re-reading all (2). Rough until measured.
 */
export function tierRun<T extends TokenCount>(full: T, t: TierSpec): T {
  const k = Math.pow(Math.min(1, t.runMin / 60), 1.5);
  const steps = Math.min(1, t.runMin / 60);
  const run = { ...full, cacheRead: Math.round(full.cacheRead * k), cacheWrite: Math.round(full.cacheWrite * steps), output: Math.round(full.output * steps), input: Math.round(full.input * steps) };
  return t.saver ? withSaver(run) : run;
}

/** A model name the run script can carry: letters, digits, dots, dashes and underscores only. */
export const MODEL_NAME = /^[A-Za-z0-9._-]{1,64}$/;

/** The price list entry for a model name, short ("sonnet") or full ("claude-sonnet-5-5"). */
export function priceOf(model: string | undefined): ModelPrice | undefined {
  const m = (model ?? '').toLowerCase();
  if (!m) return undefined;
  return CLAUDE_MODELS.find((c) => c.family && m.includes(c.family))?.price;
}

/** What that many tokens cost at a price list, in USD. */
export function costAt(u: TokenCount, p: ModelPrice): number {
  return (u.input * p.input + u.output * p.output + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
}

/**
 * A typical full run before this computer has measured one of its own: the middle of 20 real runs on Krypt's own
 * setup in November 2026 (seven platforms, about 140 steps, 35 minutes). A setup with fewer platforms uses less.
 */
export const BASELINE_RUN: TokenCount & { turns: number } = { input: 300, output: 37_000, cacheRead: 26_300_000, cacheWrite: 282_000, turns: 137 };

const middle = (list: number[]): number => {
  const v = [...list].sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : 0;
};

/** The typical run on this computer: the middle of its last measured runs (up to 10). Null before the first one. */
/**
 * Token saver: the conversation size (tokens) at which Claude Code is told to summarise it and carry on. Its own
 * default lets a run grow past 300k before that. 150k was the smallest tried that still finished a test task;
 * at 100k the summary came so early the AI lost its place.
 */
export const SAVER_WINDOW = 150_000;
/** With the saver on and nothing measured yet: the share of re-reading left, from replaying ten real runs with the lower limit. */
export const SAVER_READ = 0.45;
/** The summaries are not free: about three more a run, each written out and put in the cache (tokens a run, same replay). */
export const SAVER_EXTRA = { output: 18_000, cacheWrite: 40_000 };
/** A run as the token saver is expected to change it, for when none has been measured with it on. */
export function withSaver<T extends TokenCount>(run: T): T {
  return { ...run, cacheRead: Math.round(run.cacheRead * SAVER_READ), output: run.output + SAVER_EXTRA.output, cacheWrite: run.cacheWrite + SAVER_EXTRA.cacheWrite };
}

export function typicalRun(rows: RunUsage[]): (TokenCount & { runs: number; model?: string }) | null {
  const runs = rows.filter((r) => r.kind === 'run' && totalTokens(r) > 0).slice(-10);
  if (!runs.length) return null;
  return {
    input: middle(runs.map((r) => r.input)),
    output: middle(runs.map((r) => r.output)),
    cacheRead: middle(runs.map((r) => r.cacheRead)),
    cacheWrite: middle(runs.map((r) => r.cacheWrite)),
    runs: runs.length,
    model: runs[runs.length - 1].model,
  };
}

/** 26300000 -> "26.3M", 37000 -> "37k". */
export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

export function fmtUsd(n: number): string {
  return n >= 100 ? `$${Math.round(n)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(n >= 0.1 ? 2 : 3)}`;
}

/**
 * What a run's files say, once the AI app was asked for its answer as JSON (Claude Code's --output-format json):
 * the report text, the usage, and anything that should be shown as a warning. `out` is that JSON file's content
 * ('' when there is none, as with an app that only prints text).
 */
export function readRunOutput(out: string): { text: string; usage?: TokenCount & { model?: string; cost?: number; turns?: number; minutes?: number }; warnings: string[] } {
  const raw = out.trim();
  if (!raw) return { text: '', warnings: [] };
  type Result = {
    type?: string;
    result?: unknown;
    is_error?: boolean;
    total_cost_usd?: number;
    num_turns?: number;
    duration_ms?: number;
    credential_expires_at?: string;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    modelUsage?: Record<string, { inputTokens?: number; outputTokens?: number; cacheReadInputTokens?: number; cacheCreationInputTokens?: number; costUSD?: number }>;
  };
  let j: Result | null = null;
  const loose: string[] = [];
  try {
    const whole = JSON.parse(raw) as unknown;
    if (whole && typeof whole === 'object' && !Array.isArray(whole)) j = whole as Result;
  } catch {
    // Something else was printed around it: take the line that is the result, keep the rest as text.
    for (const line of raw.split(/\r?\n/)) {
      let hit: Result | null = null;
      if (line.trim().startsWith('{')) {
        try {
          const o = JSON.parse(line) as Result;
          if (o && typeof o === 'object' && (o.type === 'result' || 'result' in o)) hit = o;
        } catch {
          /* not the result line */
        }
      }
      if (hit) j = hit;
      else if (line.trim()) loose.push(line);
    }
  }
  if (!j) return { text: raw, warnings: [] };
  const warnings: string[] = [];
  const text = [...loose, typeof j.result === 'string' ? j.result : ''].filter(Boolean).join('\n');
  if (j.is_error) warnings.push(`Error: the AI app stopped with an error. ${text.split(/\r?\n/)[0]?.slice(0, 200) ?? ''}`.trim());
  const ends = j.credential_expires_at ? Date.parse(j.credential_expires_at) : NaN;
  if (Number.isFinite(ends) && ends - Date.now() < 3 * 86_400_000) warnings.push(`Warning: this sign-in ends ${new Date(ends).toISOString().slice(0, 10)}. Run "claude auth login" before then, or "claude setup-token" for a long-lived one.`);
  // Every model that took part counts (helpers on a smaller model too); the one that cost most names the run.
  const models = Object.entries(j.modelUsage ?? {});
  const sum = (pick: (m: NonNullable<Result['modelUsage']>[string]) => number | undefined): number => models.reduce((n, [, m]) => n + (pick(m) ?? 0), 0);
  const u = j.usage ?? {};
  const usage = models.length
    ? { input: sum((m) => m.inputTokens), output: sum((m) => m.outputTokens), cacheRead: sum((m) => m.cacheReadInputTokens), cacheWrite: sum((m) => m.cacheCreationInputTokens) }
    : { input: u.input_tokens ?? 0, output: u.output_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0 };
  if (totalTokens(usage) === 0 && j.total_cost_usd === undefined) return { text, warnings };
  const main = [...models].sort((a, b) => (b[1].costUSD ?? 0) - (a[1].costUSD ?? 0))[0]?.[0];
  return {
    text,
    warnings,
    usage: { ...usage, model: main, cost: typeof j.total_cost_usd === 'number' ? j.total_cost_usd : undefined, turns: j.num_turns, minutes: typeof j.duration_ms === 'number' ? Math.round(j.duration_ms / 60_000) : undefined },
  };
}
