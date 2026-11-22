// Autopilot: the user's own AI app (Claude Code, or Codex) started by Windows Task Scheduler a few
// times a day, headless, to run the day's plan through Marketo's tools. Each run is a fresh session
// that can use only Marketo's MCP tools; its report lands in userData/autopilot/logs.
//
// Everything lives in files the user can read: run-prompt.md (what the AI is told), run.cmd (what
// the scheduled task starts) and logs/. Nothing here signs in anywhere or stores a key.

import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { app } from 'electron';
import { MODEL_NAME, OLD_TIER_MODEL, SAVER_WINDOW, USAGE_TIERS, readRunOutput, type UsageTier } from '../shared/aiUsage';
import * as usage from './usage';
import type { AutopilotAi, AutopilotReport, AutopilotSettings, AutopilotStatus } from '../shared/types';
import * as store from './store';
import * as profiles from './profiles';
import { findBin, unixPath } from './findBin';
import * as instance from './instance';
import * as perf from './perf';
import { EXTRA_AFTER_LAST_MIN, EXTRA_AFTER_RUN_MIN, EXTRA_BEFORE_RUN_MIN, EXTRA_KILL_MIN, EXTRA_RUNS_DEFAULT, EXTRA_RUN_MIN, EXTRA_TRIES, isExtraReport, postsOwed, type PostOwed } from '../shared/extraRuns';
import { SITE_LABEL } from '../shared/warmup';

const home = os.homedir();
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const DEFAULT_TIMES = ['09:00', '13:00', '17:00', '21:00'];
/** Each run starts up to this long after its time, so the accounts are not active at the same minute every day. */
const JITTER_MIN = 30;
/** A run is stopped after this long. */
const LIMIT_MIN = 90;

let deps: {
  dev: boolean;
  log: (m: string) => void;
  onRunEnd?: () => void;
  /** Every 20 s: whether a run is going (keep-awake, run report clean-up). */
  onTick?: (running: boolean) => void;
  /** The app and its MCP bridge script, for runs pinned to one profile's window (multi-instance mode). */
  bridge?: () => { exe: string; shim: string } | null;
} = { dev: false, log: () => {} };
let wasRunning = false;

export function init(d: typeof deps): void {
  deps = d;
  // When a run ends, close the tabs it left open (the run is told to, this is the backstop).
  setInterval(() => {
    let now = false;
    try {
      now = isRunning();
    } catch {
      return;
    }
    if (wasRunning && !now) deps.onRunEnd?.();
    wasRunning = now;
    deps.onTick?.(now);
  }, 20_000).unref?.();
  // Goal-driven extra runs: looked at once a minute. Never in a test copy unless asked (KRYPT_MARKETO_EXTRA_RUNS=1).
  if (!deps.dev || process.env.KRYPT_MARKETO_EXTRA_RUNS === '1') setInterval(() => void tickExtra(), 60_000).unref?.();
  // Keep the scheduled run's prompt and script current with this version of the hub (allowed tools, steps).
  // With the model and token saver the user picked (left out, the run would fall back to the app's own model).
  if (settings().on && fs.existsSync(dir()))
    writeFiles(settings().ai, settings().model, settings().saver).catch(() => {
      /* rewritten again when autopilot is turned on */
    });
}

const dir = (): string => path.join(instance.ROOT, 'autopilot');
const logsDir = (): string => path.join(dir(), 'logs');
const taskName = (): string => `Krypt Marketo Autopilot${deps.dev ? ' (dev)' : ''}`;

export const PROMPT = `This is a scheduled, unattended Krypt Marketo run. Nobody is watching: work through today's plan with the marketo tools, then stop.

1. get_overview, then get_today. get_today is the plan: follow its order (inbox, engagement, posts against today's targets, replies to comments, metrics, stats, log_session). When it opens with instructions from the user for this run, those come first: they decide what this run makes or does, inside the same limits and rules. It ends with the last run's report: don't redo what it did, and pick up what it left.
2. Research every reel with WebSearch and WebFetch, whatever its type (story, list, versus, stats, tool reels too): find a real, current angle (news, on-chain events, launches, trends, what people are asking about this week) and check every number and claim against the source you read. Never invent a story or a number; if you can't source it, pick another angle. (The reddit, greentext, meme and dumb styles are the exception: made-up stories and jokes on purpose, written the way their style rules say, never presented as news or fact. The stickman style's scenes are made-up too, but every fact, setting and tool in them is real.) Before making a reel: get_performance (its "User feedback" part is the user's own ratings, rules and more / less of: it sets the direction), get_playbook (its notes say which content goes on which platform, if there are any), and list_posts with your idea as the query so you don't repeat a story. Read krypt_tools for any Krypt tool you feature. For a story reel, set its art style (art: flat, cartoon, ps2, 3d) to what get_performance's art style test says for the platform it is mainly for, and give the mascot character beats (shock, think, cheer...) where the line has an emotion. Make it, preview it, render it (square too for X), post it where it fits, and mark_posted each link. X is not a video feed: of its posts each day, at most 1-2 are videos; the others are text posts (a sharp sourced take, a stat with its source, a question, a short thread) and image posts (render_image of a reel's strongest frame).
3. Engagement is half the job, not an extra: on every platform, do the "THIS RUN" engagement goal get_today lists (likes, comments or replies, follows, reposts, saves and favorites, spread through the run between posts). It is a goal to reach, not a ceiling to stay far under: a run that ends with half of it undone on a platform says why in the report. Watch first and like only what you actually watched; follow accounts in the niche that post well. Comments and replies are in the goal (the writing rules in the instructions); when the hub turns one back as machine-written, rewrite it and send it again: that is not a failed post. Watch one platform at a time, so the videos really play. If a feed or search is off-niche or empty, try the niche's keywords and hashtags, or the accounts it already follows, before giving up. Stay human-paced and under the limits: the recommended ones are ceilings to stay well under, and a limit the user set themselves (get_warmup_plan names those) is a number they want reached. Never change a limit yourself. Post once per platform in a run, unless that platform's get_today line says more for this run: the hub refuses a post that comes sooner than the platform's gap after the last one (2 hours, 90 min on X, or the user's own number), so the next one goes later in the run or in the next run. Spread the platforms through the run (post on one, engage or answer the inbox on another, then post on the next) instead of uploading everywhere in one burst.
3b. Lines starting ONE-TIME (following Krypt's accounts) and KRYPT VISIT (looking in on them, with likes and sometimes a comment) in get_today or in a browser_open answer are part of every run: do them partway through that platform's engagement (not as the very first action there), before you leave that platform, and never skip them for time. Say in the report what you did there.
4. Anything only the user can do (a sign-in, a security check or captcha, a passcode, a checkpoint, a "verify it's you", a Page/profile switch, an approval card that is still waiting): do not try to solve it. Skip that platform for this run and put it in the report.
5. If a posting or upload flow fails twice on a platform, stop on that platform for this run and put the exact error in the report. Do not loop.
6. Only open web pages to research; never sign in, fill forms or download anything on the web. (Content Rewards links are submitted through browser_open site "rewards", as get_today says.)
7. Keep the whole run within the time get_today's USAGE TIER line gives (never more than about 60 minutes). That line also says how many platforms, new reels and web searches this run gets: it overrides anything above that asks for more. It is what keeps the user's AI plan from running out.
8. Learn, before the report: record_reel_metrics for every reel get_today lists as due (each platform separately, platform set), record_account_stats for each platform, then get_performance. When the numbers show a pattern on at least 2 reels a side (a hook type, format, topic, length, music, posting time, or one platform liking something another doesn't), add_learning with the evidence and the platform. If newer numbers contradict an older learning, delete_learning it. Never save a guess as a learning. The next runs read these before they make anything.

Last step: browser_close for each account (no site) so the tabs this run opened are closed.

End with a short report, plain text, one line per platform: what was posted (with links), how many likes/follows/comments/replies/DMs, and anything that needs the user (start that line with NEEDS YOU). Then one line starting with NEXT RUN: what the next run should do first. The next run reads this report.
`;

/** What a run for one profile starts with, when the hub has more than one. */
const profileHeader = (id: string, name: string): string =>
  instance.MULTI
    ? `This run is for the Krypt Marketo profile "${name}" (id ${id}). Its tools reach that profile's own window only, so never call use_profile. Everything below is about this profile only.\n\n`
    : `This run is for the Krypt Marketo profile "${name}" (id ${id}). Before anything else, call use_profile with id "${id}" and check that its answer says that profile is open. If it does not, stop and say so in the report: never work in another profile. Everything below is about this profile only.\n\n`;

/**
 * Multi-instance mode: each profile's run gets its own MCP config, pinned to that profile's window (--profile), and
 * only that one (--strict-mcp-config), so runs for different profiles go at the same time without crossing over.
 */
function pinnedArgs(ai: AutopilotAi, id: string): string[] {
  if (!instance.MULTI || ai !== 'claude') return [];
  const b = deps.bridge?.();
  if (!b) throw new Error('The AI connection is still starting. Try again in a moment.');
  const file = path.join(dir(), `run-mcp-${id}.json`);
  fs.writeFileSync(file, JSON.stringify({ mcpServers: { marketo: { command: b.exe, args: [b.shim, '--client', 'claude-code', '--config', path.join(instance.ROOT, 'mcp.json'), '--profile', id], env: { ELECTRON_RUN_AS_NODE: '1' } } } }, null, 2));
  return ['--strict-mcp-config', '--mcp-config', file];
}

/** The AI apps that can run headless, and how. Claude Code is the one this is built and tested with. */
const AIS: Record<AutopilotAi, { name: string; bin: string; args: string[]; client: string; note?: string; /** Its answer comes as JSON with the tokens used (kept beside the report). */ json?: boolean; /** The option that picks the model. */ modelFlag?: string; /** The setting that makes it summarise a long conversation earlier (the token saver). */ saverEnv?: string }> = {
  claude: { name: 'Claude Code', bin: 'claude', args: ['-p', '--output-format', 'json', '--allowedTools', 'mcp__marketo,WebSearch,WebFetch'], client: 'claude-code', json: true, modelFlag: '--model', saverEnv: 'CLAUDE_CODE_AUTO_COMPACT_WINDOW' },
  codex: { name: 'Codex', bin: 'codex', args: ['exec', '--skip-git-repo-check', '-'], client: 'codex', note: 'Not tested with Marketo yet.', modelFlag: '--model' },
};

const where = (name: string): Promise<string | null> => findBin(name);

/** Windows (Task Scheduler) and macOS (a LaunchAgent). */
const SUPPORTED = process.platform === 'win32' || process.platform === 'darwin';
const MAC = process.platform === 'darwin';
const scriptFile = (): string => path.join(dir(), MAC ? 'run.sh' : 'run.cmd');

function powershell(script: string, timeout = 30_000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    // No progress records: PowerShell writes them to stderr as CLIXML.
    const enc = Buffer.from(`$ProgressPreference = 'SilentlyContinue'\n${script}`, 'utf16le').toString('base64');
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', enc], { windowsHide: true, timeout }, (err, stdout, stderr) => {
      const out = (stdout ?? '').trim();
      const errText = (stderr ?? '').replace(/#< CLIXML[\s\S]*$/, '').trim();
      resolve({ ok: !err, out: out || errText });
    });
  });
}

const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

/** The schedule belongs to the app, not to one profile: each profile only says whether the runs work on it. */
export function settings(): AutopilotSettings {
  const s = profiles.autopilot();
  return { on: !!s?.on, ai: s?.ai ?? 'claude', times: s?.times?.length ? s.times : DEFAULT_TIMES, picked: s?.picked, pickedOn: s?.pickedOn, model: s?.model && MODEL_NAME.test(s.model) ? s.model : undefined, saver: !!s?.saver, ...(s?.tier && USAGE_TIERS[s.tier] ? { tier: s.tier } : {}), ...(typeof s?.extraRuns === 'number' && s.extraRuns >= 0 ? { extraRuns: Math.round(s.extraRuns) } : {}) };
}

const toMin = (t: string): number => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number): string => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Each run's exact start: its time plus a random 0-29 minutes. A slot whose window is open right now keeps the minute it had, so re-picking never skips today's run. */
function pickMinutes(times: string[], prev?: { times: string[]; picked?: string[] }): string[] {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return times.map((t) => {
    const base = toMin(t);
    const i = prev?.times.indexOf(t) ?? -1;
    const old = i >= 0 ? prev?.picked?.[i] : undefined;
    if (old && nowMin >= base && nowMin < base + JITTER_MIN) return old;
    return toTime(Math.min(base + Math.floor(Math.random() * JITTER_MIN), 23 * 60 + 59));
  });
}

const WIN_SLEEP = (s: number): string => `"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -WindowStyle Hidden -Command "Start-Sleep ${s}"`;
/** Opens Chrome when it is not running (the accounts live there), at normal priority: a task runs below normal, and a
 * Chrome started from it would inherit that (videos stutter, watch time stretches). */
const WIN_CHROME = `"%SystemRoot%\\System32\\tasklist.exe" /FI "IMAGENAME eq chrome.exe" 2>nul | "%SystemRoot%\\System32\\find.exe" /I "chrome.exe" >nul || (start "" /NORMAL chrome & ${WIN_SLEEP(20)})`;
/** A scheduled run first waits (up to 20 minutes) for a goal-driven extra run that is still going: they share Chrome. */
const WIN_WAIT_EXTRA = [
  'rem A goal-driven extra run may still be going (they share Chrome): wait for it, up to 20 minutes.',
  'set WAITN=0',
  ':waitextra',
  'if not exist "extra-running*.flag" goto noextra',
  'if %WAITN% GEQ 40 goto noextra',
  WIN_SLEEP(30),
  'set /a WAITN+=1',
  'goto waitextra',
  ':noextra',
];
/** cmd.exe reads a script in the console's code page: the scripts are UTF-8, so paths with letters like ü or é need this. */
const WIN_UTF8 = 'chcp 65001 >nul 2>&1';
/**
 * A scheduled run keeps this file while it is going, from its first line (its report only starts after the waits
 * for an extra run and for Chrome), so no extra run starts under it. With each profile in its own window, each
 * profile's part has one of its own once the parts start.
 */
const SCHED_FLAG = 'scheduled-running.flag';
const schedFlagFor = (id: string): string => `scheduled-running-${id}.flag`;
const SH_CHROME_NOTE = '# The accounts live in Chrome: open it if it is not running.';
const SH_CHROME = 'if ! pgrep -xq "Google Chrome"; then open -ga "Google Chrome" && sleep 20; fi';
const SH_WAIT_EXTRA = [
  '# A goal-driven extra run may still be going (they share Chrome): wait for it, up to 20 minutes.',
  'for i in $(seq 1 40); do ls extra-running*.flag >/dev/null 2>&1 || break; sleep 30; done',
];

/** Write the prompt and the script the scheduled task starts. */
async function writeFiles(ai: AutopilotAi, model?: string, saver?: boolean): Promise<string> {
  // The model name goes into a script: only a plain name gets there.
  const pick = model && AIS[ai].modelFlag && MODEL_NAME.test(model) ? [AIS[ai].modelFlag!, model] : [];
  const bin = await where(AIS[ai].bin);
  if (!bin) throw new Error(`${AIS[ai].name} is not installed on this computer (or not on PATH).`);
  fs.mkdirSync(logsDir(), { recursive: true });
  // With one profile the run is what it always was. With several, the AI is started once per profile that takes
  // part, one after the other, each told which profile to open first and each with its own report.
  const multi = profiles.count() > 1;
  const targets = multi ? profiles.autopilotList() : profiles.list();
  if (!targets.length) throw new Error('No profile has autopilot switched on. Switch it on for at least one (Multi run page).');
  const chrome = multi || store.get().igAccounts.some((a) => a.browser === 'chrome');
  // Prompts written for profiles that no longer take part.
  for (const f of fs.readdirSync(dir())) if (/^run-(prompt|mcp|part)-[a-z0-9_]+\.(md|json|cmd)$/.test(f) && !(multi && targets.some((p) => f === `run-prompt-${p.id}.md` || (instance.MULTI && (f === `run-mcp-${p.id}.json` || f === `run-part-${p.id}.cmd`))))) fs.rmSync(path.join(dir(), f), { force: true });
  if (ai !== 'claude' && instance.MULTI && multi) throw new Error('With each profile in its own window, scheduled runs need Claude Code (it can be pinned to one window per run).');
  for (const p of targets) fs.writeFileSync(promptFile(multi, p.id), multi ? `${profileHeader(p.id, p.name)}${PROMPT}` : PROMPT, 'utf8');
  if (process.platform === 'darwin') return writeShScript(ai, bin, pick, saver, multi, targets, chrome);
  const q = (s: string): string => `"${s.replace(/%/g, '%%')}"`;
  const lines = [
    '@echo off',
    WIN_UTF8,
    'rem Krypt Marketo autopilot: one unattended run. Written by Krypt Marketo (Autopilot page); turning autopilot on again rewrites it.',
    'setlocal',
    `cd /d ${q(dir())}`,
    `echo running > "${SCHED_FLAG}"`,
    ...WIN_WAIT_EXTRA,
    'for /f %%i in (\'powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"\') do set STAMP=%%i',
    ...(chrome ? ['rem The accounts live in Chrome: open it if it is not running.', WIN_CHROME] : []),
  ];
  // Multi-instance mode: every profile's run is a script of its own, all started together; this one waits for them.
  const together = instance.MULTI && multi;
  const parts: string[] = [];
  for (const p of targets) {
    const prompt = promptFile(multi, p.id);
    // Only letters, digits, spaces, dots and dashes go into the script itself.
    const shown = p.name.replace(/[^\w .-]+/g, '_');
    const pinned = pinnedArgs(ai, p.id);
    const block: string[] = [];
    block.push(
      `set LOG=${q(logsDir()).slice(0, -1)}\\run-%STAMP%${multi ? `--${p.id}` : ''}.txt"`,
      `echo Run started %DATE% %TIME% with ${AIS[ai].name}${multi ? ` for profile ${shown}` : ''} > %LOG%`,
      // An app that answers in JSON writes it to its own file beside the report (the hub reads both); anything it says on the side still lands in the report.
      ...(AIS[ai].json ? [`set OUT=${q(logsDir()).slice(0, -1)}\\run-%STAMP%${multi ? `--${p.id}` : ''}.json"`] : []),
      // Token saver: the app summarises its conversation at this size instead of letting it grow.
      ...(saver && AIS[ai].saverEnv ? [`set ${AIS[ai].saverEnv}=${SAVER_WINDOW}`] : []),
      `type ${q(prompt)} | ${/\.(cmd|bat)$/i.test(bin) ? 'call ' : ''}${q(bin)} ${[...AIS[ai].args, ...pick, ...pinned].map((a) => (/\s/.test(a) ? q(a) : a)).join(' ')} ${AIS[ai].json ? '> %OUT% 2>> %LOG%' : '>> %LOG% 2>&1'}`,
      `echo ${AIS[ai].name} exited with code %ERRORLEVEL% >> %LOG%`,
      'echo. >> %LOG%',
      'echo Run ended %DATE% %TIME% >> %LOG%',
    );
    if (!together) {
      lines.push(...block);
      continue;
    }
    const part = path.join(dir(), `run-part-${p.id}.cmd`);
    // Setup > Performance: a random wait before this profile starts, and at most N profiles' AI working at once.
    const { staggerMin, aiAtOnce } = perf.values();
    const ps = '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile';
    const slotDir = (n: string): string => `"${path.join(dir(), 'slots').replace(/%/g, '%%')}\\${n}"`;
    const before: string[] = [];
    if (staggerMin > 0)
      before.push(
        'rem Staggered start (Setup > Performance): a random wait, new every run.',
        `for /f %%w in ('powershell -NoProfile -Command "Get-Random -Maximum ${staggerMin * 60}"') do set WAITS=%%w`,
        'if not defined WAITS set WAITS=0',
        `${ps} -WindowStyle Hidden -Command "Start-Sleep %WAITS%"`,
      );
    const slotted = aiAtOnce > 0 && aiAtOnce < targets.length;
    if (slotted)
      before.push(
        `rem AI runs at once (Setup > Performance): wait for one of the ${aiAtOnce} slots.`,
        ':slot',
        `for /L %%s in (1,1,${aiAtOnce}) do mkdir ${slotDir('%%s')} 2>nul && (set SLOT=%%s&& goto haveslot)`,
        `${ps} -WindowStyle Hidden -Command "Start-Sleep 30"`,
        'goto slot',
        ':haveslot',
      );
    // An extra run on this profile that started before this part's flag was there: wait for it, up to 20 minutes.
    before.push(
      'set WAITN=0',
      ':waitextra',
      `if not exist ${q(extraFlag(p.id))} goto noextra`,
      'if %WAITN% GEQ 40 goto noextra',
      WIN_SLEEP(30),
      'set /a WAITN+=1',
      'goto waitextra',
      ':noextra',
    );
    const after = slotted ? [`rmdir ${slotDir('%SLOT%')} 2>nul`] : [];
    fs.writeFileSync(part, ['@echo off', WIN_UTF8, 'setlocal', ...before, ...block, ...after, `del /q ${q(path.join(dir(), schedFlagFor(p.id)))} 2>nul`, `echo done > ${q(path.join(dir(), `done-${p.id}.flag`))}`, 'endlocal', ''].join('\r\n'), 'utf8');
    parts.push(p.id);
  }
  if (together) {
    lines.push('rem Each profile runs in its own window: their runs go at the same time, and this waits for all of them.', 'del /q "done-*.flag" 2>nul', 'rmdir /s /q "slots" 2>nul', 'mkdir "slots" 2>nul');
    // From here each profile's part keeps a flag of its own (a profile whose part ended can have extra runs again).
    for (const id of parts) lines.push(`echo running > "${schedFlagFor(id)}"`);
    lines.push(`del /q "${SCHED_FLAG}" 2>nul`);
    for (const id of parts) lines.push(`start "" /b cmd /c ${q(path.join(dir(), `run-part-${id}.cmd`))}`);
    lines.push(':wait', '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -WindowStyle Hidden -Command "Start-Sleep 15"');
    for (const id of parts) lines.push(`if not exist "done-${id}.flag" goto wait`);
    lines.push('del /q "done-*.flag" 2>nul');
  }
  lines.push(`del /q "${SCHED_FLAG}" 2>nul`, 'endlocal', '');
  const cmd = path.join(dir(), 'run.cmd');
  fs.writeFileSync(cmd, lines.join('\r\n'), 'utf8');
  return cmd;
}

// ── macOS ──────────────────────────────────────────────────────────────────
// The same run as run.cmd, as a bash script (run.sh) that a LaunchAgent starts at the picked minutes. launchd
// starts a job with a bare PATH, so the script sets one; it never starts a second copy of a job that is still
// running (like the Windows task's IgnoreNew), and a time missed while the Mac slept runs when it wakes.

/** The prompt file for a profile (one file with a single profile). */
const promptFile = (multi: boolean, id: string): string => path.join(dir(), multi ? `run-prompt-${id}.md` : 'run-prompt.md');

/** A shell word: single quotes, with any quote inside closed and reopened. */
const shq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

function writeShScript(ai: AutopilotAi, bin: string, pick: string[], saver: boolean | undefined, multi: boolean, targets: Array<{ id: string; name: string }>, chrome: boolean): string {
  const lines = [
    '#!/bin/bash',
    '# Krypt Marketo autopilot: one unattended run. Written by Krypt Marketo (Autopilot page); turning autopilot on again rewrites it.',
    `cd ${shq(dir())} || exit 1`,
    `export PATH=${shq(unixPath(bin))}`,
    `touch ${shq(SCHED_FLAG)}`,
    ...SH_WAIT_EXTRA,
    'STAMP=$(date +%Y-%m-%d_%H%M)',
    ...(chrome ? [SH_CHROME_NOTE, SH_CHROME] : []),
  ];
  // Each profile in its own window: from here each profile's run keeps a flag of its own.
  if (instance.MULTI && multi) lines.push(...targets.map((p) => `touch ${shq(schedFlagFor(p.id))}`), `rm -f ${shq(SCHED_FLAG)}`);
  for (const p of targets) {
    const shown = p.name.replace(/[^\w .-]+/g, '_');
    const base = `${logsDir()}/run-`;
    const suffix = multi ? `--${p.id}` : '';
    const out = AIS[ai].json ? `> "$OUT" 2>> "$LOG"` : `>> "$LOG" 2>&1`;
    // Multi-instance mode: each profile's run in a subshell of its own, all at the same time.
    const together = instance.MULTI && multi;
    if (together) lines.push('(');
    lines.push(
      `LOG=${shq(base)}"$STAMP"${shq(`${suffix}.txt`)}`,
      `echo "Run started $(date) with ${AIS[ai].name}${multi ? ` for profile ${shown}` : ''}" > "$LOG"`,
      ...(AIS[ai].json ? [`OUT=${shq(base)}"$STAMP"${shq(`${suffix}.json`)}`] : []),
      ...(saver && AIS[ai].saverEnv ? [`export ${AIS[ai].saverEnv}=${SAVER_WINDOW}`] : []),
      // In the background with a watchdog: a run is stopped after LIMIT_MIN, like the Windows task's time limit.
      `${shq(bin)} ${[...AIS[ai].args, ...pick, ...pinnedArgs(ai, p.id)].map(shq).join(' ')} < ${shq(promptFile(multi, p.id))} ${out} &`,
      'PID=$!',
      `( sleep ${LIMIT_MIN * 60}; kill -TERM $PID 2>/dev/null ) &`,
      'DOG=$!',
      'wait $PID',
      'CODE=$?',
      'kill $DOG 2>/dev/null',
      `echo "${AIS[ai].name} exited with code $CODE" >> "$LOG"`,
      'echo >> "$LOG"',
      'echo "Run ended $(date)" >> "$LOG"',
    );
    if (together) lines.push(`rm -f ${shq(schedFlagFor(p.id))}`, ') &');
  }
  if (instance.MULTI && multi) lines.push('wait');
  lines.push(`rm -f ${shq(SCHED_FLAG)}`, '');
  const sh = path.join(dir(), 'run.sh');
  fs.writeFileSync(sh, lines.join('\n'), { encoding: 'utf8', mode: 0o755 });
  fs.chmodSync(sh, 0o755);
  return sh;
}

const launchLabel = (): string => `cc.krypt.marketo.autopilot${deps.dev ? '.dev' : ''}`;
const plistFile = (): string => path.join(home, 'Library', 'LaunchAgents', `${launchLabel()}.plist`);
const guiDomain = (): string => `gui/${process.getuid?.() ?? 501}`;

function launchctl(args: string[], timeout = 15_000): Promise<{ ok: boolean; out: string; code: number }> {
  return new Promise((resolve) => {
    execFile('/bin/launchctl', args, { timeout }, (err, stdout, stderr) => {
      const code = err ? (typeof (err as NodeJS.ErrnoException & { code?: unknown }).code === 'number' ? ((err as unknown as { code: number }).code) : 1) : 0;
      resolve({ ok: !err, out: `${stdout ?? ''}${stderr ?? ''}`.trim(), code });
    });
  });
}

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Write the LaunchAgent for these start minutes and (re)load it. */
async function scheduleMac(script: string, picked: string[]): Promise<void> {
  const when = picked.map((t) => `      <dict><key>Hour</key><integer>${Number(t.slice(0, 2))}</integer><key>Minute</key><integer>${Number(t.slice(3, 5))}</integer></dict>`);
  const plist = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key><string>${xml(launchLabel())}</string>`,
    '  <key>Comment</key><string>Krypt Marketo autopilot: runs your AI against Marketo a few times a day. Change it on the Autopilot page in Krypt Marketo.</string>',
    `  <key>ProgramArguments</key><array><string>/bin/bash</string><string>${xml(script)}</string></array>`,
    `  <key>WorkingDirectory</key><string>${xml(dir())}</string>`,
    '  <key>StartCalendarInterval</key>',
    '  <array>',
    ...when,
    '  </array>',
    `  <key>StandardOutPath</key><string>${xml(path.join(logsDir(), 'launchd.log'))}</string>`,
    `  <key>StandardErrorPath</key><string>${xml(path.join(logsDir(), 'launchd.log'))}</string>`,
    '  <key>ProcessType</key><string>Standard</string>',
    '  <key>RunAtLoad</key><false/>',
    '</dict>',
    '</plist>',
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(plistFile()), { recursive: true });
  fs.writeFileSync(plistFile(), plist, 'utf8');
  // Swap the old job out for the new one. bootout is async inside launchd: give it a moment before bootstrap.
  await launchctl(['bootout', `${guiDomain()}/${launchLabel()}`]);
  await new Promise((r) => setTimeout(r, 500));
  let r = await launchctl(['bootstrap', guiDomain(), plistFile()]);
  if (!r.ok) {
    await new Promise((res) => setTimeout(res, 1500));
    r = await launchctl(['bootstrap', guiDomain(), plistFile()]);
  }
  // Older macOS: the legacy commands.
  if (!r.ok) r = await launchctl(['load', '-w', plistFile()]);
  if (!r.ok) throw new Error(`macOS did not accept the scheduled run: ${r.out.slice(0, 300)}`);
}

async function unscheduleMac(): Promise<void> {
  await launchctl(['bootout', `${guiDomain()}/${launchLabel()}`]);
  fs.rmSync(plistFile(), { force: true });
}

/** The loaded job: registered or not, running or waiting, and its last exit code. */
async function macTask(picked: string[]): Promise<{ registered: boolean; nextRun?: string; lastRun?: string; lastResult?: number; state?: string }> {
  const r = await launchctl(['print', `${guiDomain()}/${launchLabel()}`]);
  if (!r.ok || !fs.existsSync(plistFile())) return { registered: false };
  const state = /^\s*state = (.+)$/m.exec(r.out)?.[1]?.trim();
  const last = /last exit code = (-?\d+)/.exec(r.out)?.[1];
  return { registered: true, state: state === 'running' ? 'Running' : 'Ready', nextRun: nextStart(picked), lastResult: last !== undefined ? Number(last) : undefined };
}

/** The next of these daily start minutes after now, as an ISO time. */
function nextStart(picked: string[]): string | undefined {
  if (!picked.length) return undefined;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const mins = picked.map(toMin).sort((a, b) => a - b);
  const today = mins.find((m) => m > nowMin);
  const d = new Date(now);
  d.setSeconds(0, 0);
  if (today !== undefined) d.setHours(Math.floor(today / 60), today % 60);
  else {
    d.setDate(d.getDate() + 1);
    d.setHours(Math.floor(mins[0] / 60), mins[0] % 60);
  }
  return d.toISOString();
}

// Changes to the schedule run one at a time, in the order they were asked for: each rewrites the run script and the
// Windows task, which takes seconds, and two at once could leave the script on one model and the settings on another.
let changes: Promise<unknown> = Promise.resolve();
/** A change is being made right now (each ends with status(), which must not queue another change behind itself). */
let inChange = 0;
function oneAtATime<T>(fn: () => Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    inChange++;
    try {
      return await fn();
    } finally {
      inChange--;
    }
  };
  const p = changes.then(run, run);
  changes = p.catch(() => undefined);
  return p;
}

/**
 * How long Windows lets one scheduled run go: one run per profile after another, or (each profile in its own window)
 * rounds of "AI runs at once" plus the staggered-start wait.
 */
function taskLimitMin(): number {
  const n = profiles.count() > 1 ? profiles.autopilotList().length : 1;
  if (!instance.MULTI || n <= 1) return LIMIT_MIN * Math.max(1, n) + 10;
  const { aiAtOnce, staggerMin } = perf.values();
  const rounds = aiAtOnce > 0 ? Math.ceil(n / aiAtOnce) : 1;
  return LIMIT_MIN * rounds + staggerMin + 10;
}

/** Several profiles and none of them in the runs: there is nothing to run. */
const noneInRuns = (): boolean => profiles.count() > 1 && !profiles.autopilotList().length;

/** The scheduled-run flags that are there and fresh (one left by a run Windows stopped is older than the task's limit). */
function scheduledFlags(): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir());
  } catch {
    return [];
  }
  const limit = taskLimitMin() * 60_000;
  return names.filter((f) => {
    if (f !== SCHED_FLAG && !/^scheduled-running-[a-z0-9_]+\.flag$/.test(f)) return false;
    try {
      return Date.now() - fs.statSync(path.join(dir(), f)).mtimeMs < limit;
    } catch {
      return false;
    }
  });
}

async function enableNow(input: { ai: AutopilotAi; times: string[]; keepMinutes?: boolean; /** '' = the AI app's own setting; left out = as it was. */ model?: string; /** Left out = as it was. */ saver?: boolean; /** Left out = as it was. */ tier?: UsageTier }): Promise<AutopilotStatus> {
  if (!SUPPORTED) throw new Error('Autopilot runs on Windows and macOS only for now.');
  const times =[...new Set(input.times.map((t) => t.trim()).filter((t) => TIME.test(t)))].sort();
  if (!times.length) throw new Error('Pick at least one time (HH:MM).');
  // No hard limit on runs a day (the user's number): past SOFT_RUNS_A_DAY the Autopilot page warns.
  const prev = settings();
  // A model name belongs to one AI app: switching apps goes back to the new app's own setting.
  const model = input.model === undefined ? (input.ai === prev.ai ? prev.model : undefined) : input.model.trim() || undefined;
  const saver = input.saver === undefined ? !!prev.saver : input.saver;
  const tier = input.tier ?? prev.tier;
  if (model && !MODEL_NAME.test(model)) throw new Error('That is not a model name: letters, digits, dots and dashes only.');
  const cmd = await writeFiles(input.ai, model, saver);
  // A profile change rewrites the run but leaves today's start minutes where they are.
  const same = input.keepMinutes && prev.picked?.length === times.length && prev.times.join() === times.join() && prev.pickedOn === todayStr();
  const picked = same ? prev.picked! : pickMinutes(times, prev.on ? prev : undefined);
  if (MAC) {
    await scheduleMac(cmd, picked);
    profiles.setAutopilot({ on: true, ai: input.ai, times, picked, pickedOn: todayStr(), ...(model ? { model } : {}), ...(saver ? { saver: true } : {}), ...(tier ? { tier } : {}), ...(prev.extraRuns !== undefined ? { extraRuns: prev.extraRuns } : {}) });
    deps.log(`autopilot on (launchd): ${input.ai}${model ? ` (${model})` : ''}${saver ? ' (token saver)' : ''}${tier ? ` (${tier} tier)` : ''} at ${times.join(', ')} (today's minutes ${picked.join(', ')})`);
    return status();
  }
  const user =`${process.env.USERDOMAIN ?? os.hostname()}\\${process.env.USERNAME ?? os.userInfo().username}`;
  const script = [
    `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(`-NoProfile -WindowStyle Hidden -Command "& '${cmd.replace(/'/g, "''")}'"`)}`,
    `$triggers = @(${picked.map(psQuote).join(',')}) | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }`,
    `$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes ${taskLimitMin()}) -MultipleInstances IgnoreNew`,
    `$principal = New-ScheduledTaskPrincipal -UserId ${psQuote(user)} -LogonType Interactive`,
    `Register-ScheduledTask -TaskName ${psQuote(taskName())} -Description 'Krypt Marketo autopilot: runs your AI against Marketo a few times a day. Change it on the Autopilot page in Krypt Marketo.' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null`,
    "'ok'",
  ].join('\n');
  const r = await powershell(script);
  if (!r.ok || !/ok\s*$/.test(r.out)) throw new Error(`Windows did not accept the scheduled task: ${r.out.slice(0, 300)}`);
  profiles.setAutopilot({ on: true, ai: input.ai, times, picked, pickedOn: todayStr(), ...(model ? { model } : {}), ...(saver ? { saver: true } : {}), ...(tier ? { tier } : {}), ...(prev.extraRuns !== undefined ? { extraRuns: prev.extraRuns } : {}) });
  deps.log(`autopilot on: ${input.ai}${model ? ` (${model})` : ''}${saver ? ' (token saver)' : ''}${tier ? ` (${tier} tier)` : ''} at ${times.join(', ')} (today's minutes ${picked.join(', ')})`);
  return status();
}

async function disableNow(): Promise<AutopilotStatus> {
  // The extra-run tasks go with it (they only ever run when the hub starts them).
  if (process.platform === 'win32') await powershell(`Unregister-ScheduledTask -TaskName ${psQuote(taskName())} -Confirm:$false -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName ${psQuote(`${taskName()} (run now)`)} -Confirm:$false -ErrorAction SilentlyContinue; Get-ScheduledTask -TaskName ${psQuote(`${extraTaskPrefix()}*`)} -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -eq ${psQuote(extraTaskPrefix())} -or $_.TaskName -like ${psQuote(`${extraTaskPrefix()} (*`)} } | Unregister-ScheduledTask -Confirm:$false; 'ok'`);
  else if (MAC) await unscheduleMac();
  profiles.setAutopilot({ ...settings(), on: false });
  deps.log('autopilot off');
  return status();
}

/** Which model the runs use ('' = the AI app's own setting). Saved either way; with autopilot on, the run is rewritten now. */
async function setModelNow(model: string): Promise<AutopilotStatus> {
  const m = String(model ?? '').trim();
  if (m && !MODEL_NAME.test(m)) throw new Error('That is not a model name: letters, digits, dots and dashes only.');
  const s = settings();
  if (s.on && SUPPORTED) return enableNow({ ai: s.ai, times: s.times, keepMinutes: true, model: m });
  const { model: _old, ...rest } = s;
  profiles.setAutopilot({ ...rest, ...(m ? { model: m } : {}) });
  return status();
}

export const enable = (input: Parameters<typeof enableNow>[0]): Promise<AutopilotStatus> => oneAtATime(() => enableNow(input));
export const disable = (): Promise<AutopilotStatus> => oneAtATime(disableNow);
export const setModel = (model: string): Promise<AutopilotStatus> => oneAtATime(() => setModelNow(model));
/** Token saver on or off. Saved either way; with autopilot on, the run is rewritten now. */
export const setSaver = (on: boolean): Promise<AutopilotStatus> =>
  oneAtATime(async () => {
    const s = settings();
    if (s.on && SUPPORTED) return enableNow({ ai: s.ai, times: s.times, keepMinutes: true, saver: !!on });
    profiles.setAutopilot({ ...s, saver: !!on });
    return status();
  });

/**
 * Pick a usage tier: it sets the model (Claude Code only; another app keeps its own), the run times and the token
 * saver to the tier's, and from then on get_today sizes each run to it. With autopilot on, the run is rewritten now.
 */
export const setTier = (tier: UsageTier): Promise<AutopilotStatus> =>
  oneAtATime(async () => {
    const t = USAGE_TIERS[tier];
    if (!t) throw new Error(`No usage tier "${tier}".`);
    const s = settings();
    const model = s.ai === 'claude' ? t.model : s.model;
    if (s.on && SUPPORTED) return enableNow({ ai: s.ai, times: t.times, model: model ?? '', saver: t.saver, tier });
    const { model: _old, ...rest } = s;
    profiles.setAutopilot({ ...rest, times: t.times, saver: t.saver, tier, ...(model ? { model } : {}) });
    deps.log(`usage tier: ${tier}`);
    return status();
  });

/** The profiles changed (one added, removed, renamed, or its autopilot switch flipped): rewrite the run to match. */
export async function refresh(): Promise<void> {
  const s = settings();
  if (!s.on || !SUPPORTED) return;
  // The last profile in the runs was switched off (or deleted): the schedule goes too, or it would keep running that profile.
  if (noneInRuns()) {
    try {
      await disable();
      deps.log('autopilot: turned off, no profile has autopilot switched on');
    } catch (e) {
      deps.log(`autopilot: could not turn off after a profile change: ${(e as Error).message}`);
    }
    return;
  }
  try {
    await enable({ ai: s.ai, times: s.times, keepMinutes: true });
  } catch (e) {
    deps.log(`autopilot: could not rewrite the run after a profile change: ${(e as Error).message}`);
  }
}

/** Where Claude Code is on this computer (null when it is not installed). */
export const findClaude = (): Promise<string | null> => where(AIS.claude.bin);
/** The model picked for the runs, when they use Claude Code. */
export const claudeModel = (): string | undefined => {
  const s = settings();
  return s.ai === 'claude' ? s.model : undefined;
};

/** A scheduled or started run is working right now (in multi-instance mode: on this window's profile). */
export const running = (): boolean => {
  try {
    if (instance.MULTI && profiles.count() > 1) return liveReports().some((r) => r.running && r.profileId === profiles.activeId());
    return isRunning();
  } catch {
    return false;
  }
};

/** Start one run now (the same script the schedule starts), in the background. */
export async function runNow(): Promise<AutopilotStatus> {
  if (!SUPPORTED) throw new Error('Autopilot runs on Windows and macOS only for now.');
  if (isRunning()) throw new Error('A run is already going. Its report shows up here when it ends.');
  const cmd = await writeFiles(settings().ai, settings().model, settings().saver);
  if (MAC) {
    // The LaunchAgent starts it when there is one (launchd then knows it is running and won't start it twice).
    const kicked = fs.existsSync(plistFile()) && (await launchctl(['kickstart', `${guiDomain()}/${launchLabel()}`])).ok;
    if (!kicked) spawn('/bin/bash', [cmd], { detached: true, stdio: 'ignore', cwd: dir() }).unref();
    await new Promise((r) => setTimeout(r, 3000));
    return status();
  }
  // The scheduled task starts it in a hidden PowerShell, so no console window opens (closing one would kill the run).
  const started = await powershell(`$t = Get-ScheduledTask -TaskName ${psQuote(taskName())} -ErrorAction SilentlyContinue; if ($t) { Start-ScheduledTask -TaskName ${psQuote(taskName())}; 'task' } else { 'none' }`);
  // No schedule (autopilot off): a task of its own with no times, started once (a fully detached PowerShell exits before running anything).
  if (!/task\s*$/.test(started.out)) {
    const r = await startOnDemand(`${taskName()} (run now)`, cmd, taskLimitMin(), 'Krypt Marketo: one run started with "Run once now" on the Autopilot page.');
    if (!r) throw new Error('Windows did not start the run. Try again, or turn autopilot on.');
  }
  await new Promise((r) => setTimeout(r, 3000));
  return status();
}

// ── Goal-driven extra runs ─────────────────────────────────────────────────
// Between the scheduled runs, a short run starts by itself when posts are still owed today and a platform's spacing
// allows one now (shared/extraRuns.ts). It posts and answers comments on those platforms, nothing else, and only
// while the hub is open (each run opens it). Off with the token saver on, and never more a day than the user's number.

export const EXTRA_PROMPT = `This is a short goal-driven extra run of Krypt Marketo, between the scheduled runs. Nobody is watching. It started because posts are still owed today and a platform's spacing between posts allows one now.

1. get_overview, then get_today. Its EXTRA RUN line is the plan: post on the platforms marked THIS RUN (one post on each), then answer new comments and replies on the account's own posts there. Nothing else: no inbox sweep, no engagement goal, no metrics, no learning step, no Krypt follow or visit.
2. Post what is ready first (get_today lists the ready reels and what went where). On X and Threads a text post works: one sharp take or a stat, checked against its source with WebSearch and WebFetch. Make at most one new reel, only when a platform needs a video and nothing ready fits, researched and checked like any reel. Never post the same thing twice on a platform.
3. Anything only the user can do (a sign-in, a security check, a passcode, an approval card that is still waiting): skip that platform and put it in the report. A posting flow that fails twice: stop on that platform and put the exact error in the report.
4. Stop within about ${EXTRA_RUN_MIN} minutes (the run is stopped at ${EXTRA_KILL_MIN}). Last step: browser_close for each account (no site).

End with a short report, plain text: one line per platform you posted on (with the link), anything that needs the user (start that line with NEEDS YOU).
`;

const extraFlag = (id: string): string => path.join(dir(), `extra-running-${id}.flag`);
const extraPromptFile = (multi: boolean, id: string): string => path.join(dir(), multi ? `extra-prompt-${id}.md` : 'extra-prompt.md');

/** The script for one extra run on the open profile (run-extra.cmd / run-extra.sh). */
async function writeExtra(): Promise<string> {
  const s = settings();
  const ai = s.ai;
  const pick = s.model && AIS[ai].modelFlag && MODEL_NAME.test(s.model) ? [AIS[ai].modelFlag!, s.model] : [];
  const bin = await where(AIS[ai].bin);
  if (!bin) throw new Error(`${AIS[ai].name} is not installed on this computer (or not on PATH).`);
  fs.mkdirSync(logsDir(), { recursive: true });
  const multi = profiles.count() > 1;
  // Like the scheduled runs: only Claude Code can be pinned to this window, and the prompt forbids use_profile.
  if (ai !== 'claude' && instance.MULTI && multi) throw new Error('With each profile in its own window, runs need Claude Code (it can be pinned to one window per run).');
  const p = profiles.active();
  const prompt = extraPromptFile(multi, p.id);
  fs.writeFileSync(prompt, multi ? `${profileHeader(p.id, p.name)}${EXTRA_PROMPT}` : EXTRA_PROMPT, 'utf8');
  const chrome = multi || store.get().igAccounts.some((a) => a.browser === 'chrome');
  const suffix = `${multi ? `--${p.id}` : ''}-extra`;
  const flag = extraFlag(p.id);
  const pinned = pinnedArgs(ai, p.id);
  if (MAC) {
    const base = `${logsDir()}/run-`;
    const out = AIS[ai].json ? `> "$OUT" 2>> "$LOG"` : `>> "$LOG" 2>&1`;
    const lines = [
      '#!/bin/bash',
      '# Krypt Marketo: one goal-driven extra run, started by the hub. Rewritten before each one.',
      `cd ${shq(dir())} || exit 1`,
      `export PATH=${shq(unixPath(bin))}`,
      `touch ${shq(flag)}`,
      // The path has spaces on a Mac (Application Support): quoted inside the trap's own quotes.
      `trap ${shq(`rm -f ${shq(flag)}`)} EXIT`,
      'STAMP=$(date +%Y-%m-%d_%H%M)',
      ...(chrome ? [SH_CHROME_NOTE, SH_CHROME] : []),
      `LOG=${shq(base)}"$STAMP"${shq(`${suffix}.txt`)}`,
      `echo "Run started $(date) with ${AIS[ai].name} (extra run)" > "$LOG"`,
      ...(AIS[ai].json ? [`OUT=${shq(base)}"$STAMP"${shq(`${suffix}.json`)}`] : []),
      `${shq(bin)} ${[...AIS[ai].args, ...pick, ...pinned].map(shq).join(' ')} < ${shq(prompt)} ${out} &`,
      'PID=$!',
      `( sleep ${EXTRA_KILL_MIN * 60}; kill -TERM $PID 2>/dev/null ) &`,
      'DOG=$!',
      'wait $PID',
      'CODE=$?',
      'kill $DOG 2>/dev/null',
      `echo "${AIS[ai].name} exited with code $CODE" >> "$LOG"`,
      'echo >> "$LOG"',
      'echo "Run ended $(date)" >> "$LOG"',
      '',
    ];
    const sh = path.join(dir(), multi ? `run-extra-${p.id}.sh` : 'run-extra.sh');
    fs.writeFileSync(sh, lines.join('\n'), { encoding: 'utf8', mode: 0o755 });
    fs.chmodSync(sh, 0o755);
    return sh;
  }
  const q = (x: string): string => `"${x.replace(/%/g, '%%')}"`;
  const lines = [
    '@echo off',
    WIN_UTF8,
    'rem Krypt Marketo: one goal-driven extra run, started by the hub. Rewritten before each one.',
    'setlocal',
    `cd /d ${q(dir())}`,
    `echo running > ${q(flag)}`,
    'for /f %%i in (\'powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd_HHmm"\') do set STAMP=%%i',
    ...(chrome ? ['rem The accounts live in Chrome: open it if it is not running.', WIN_CHROME] : []),
    `set LOG=${q(logsDir()).slice(0, -1)}\\run-%STAMP%${suffix}.txt"`,
    `echo Run started %DATE% %TIME% with ${AIS[ai].name} (extra run) > %LOG%`,
    ...(AIS[ai].json ? [`set OUT=${q(logsDir()).slice(0, -1)}\\run-%STAMP%${suffix}.json"`] : []),
    `type ${q(prompt)} | ${/\.(cmd|bat)$/i.test(bin) ? 'call ' : ''}${q(bin)} ${[...AIS[ai].args, ...pick, ...pinned].map((a) => (/\s/.test(a) ? q(a) : a)).join(' ')} ${AIS[ai].json ? '> %OUT% 2>> %LOG%' : '>> %LOG% 2>&1'}`,
    `echo ${AIS[ai].name} exited with code %ERRORLEVEL% >> %LOG%`,
    'echo. >> %LOG%',
    'echo Run ended %DATE% %TIME% >> %LOG%',
    `del /q ${q(flag)} 2>nul`,
    'endlocal',
    '',
  ];
  const cmd = path.join(dir(), multi ? `run-extra-${p.id}.cmd` : 'run-extra.cmd');
  fs.writeFileSync(cmd, lines.join('\r\n'), 'utf8');
  return cmd;
}

/** This profile's extra-run reports from today. */
function extrasToday(): string[] {
  if (!fs.existsSync(logsDir())) return [];
  const multi = profiles.count() > 1;
  const id = profiles.activeId();
  return fs.readdirSync(logsDir()).filter((f) => f.startsWith(`run-${todayStr()}_`) && /-extra\.txt$/.test(f) && (!multi || f.includes(`--${id}-extra`)));
}

/** When this profile's newest finished run ended (ms; 0 = none). */
function lastEndedAt(): number {
  try {
    const r = reports(6).find((x) => x.ended && (profiles.count() < 2 || x.profileId === profiles.activeId()));
    return r ? fs.statSync(r.file).mtimeMs : 0;
  } catch {
    return 0;
  }
}

/** Platforms extra runs tried today and how many posts they had then: one that stays stuck is left to the scheduled runs. */
let tries: { day: string; by: Map<string, { done: number; n: number }> } = { day: '', by: new Map() };
const tryKey = (p: PostOwed): string => `${p.handle}|${p.site}`;
let starting = 0;
/** Extra runs started today (a start whose script never wrote a report still counts, so a failing one is not retried all day). */
let started: { day: string; n: number } = { day: '', n: 0 };

/** What the extra-run planner sees now, and whether it starts one. */
export function extraPlan(now = Date.now()): { max: number; today: number; note: string; due: PostOwed[]; go?: boolean } {
  const s = settings();
  const max = s.extraRuns ?? EXTRA_RUNS_DEFAULT;
  const today = Math.max(extrasToday().length, started.day === todayStr() ? started.n : 0);
  const base = { max, today, due: [] as PostOwed[] };
  if (!s.on) return { ...base, note: 'Autopilot is off.' };
  if (s.saver) return { ...base, note: 'Off while the token saver is on (extra runs use more of your AI plan).' };
  if (max <= 0) return { ...base, note: 'Off (0 a day).' };
  if (profiles.count() > 1 && !profiles.autopilotList().some((p) => p.id === profiles.activeId())) return { ...base, note: 'This profile is not in the runs (Multi run page).' };
  if (tries.day !== todayStr()) tries = { day: todayStr(), by: new Map() };
  const owed = postsOwed(store.get(), now).filter((p) => {
    const t = tries.by.get(tryKey(p));
    return !(t && t.done === p.done && t.n >= EXTRA_TRIES);
  });
  if (today >= max) return { ...base, note: `All ${max} for today are done.` };
  if (!owed.length) return { ...base, note: "Nothing owed: today's post targets are met (or left to the scheduled runs)." };
  const list = owed.map((p) => `${SITE_LABEL[p.site]} ${p.left}`).join(', ');
  const owedNote = `Posts still owed today: ${list}.`;
  const d = new Date(now);
  const nowMin = d.getHours() * 60 + d.getMinutes();
  const starts = (s.pickedOn === todayStr() && s.picked?.length ? s.picked : s.times).map(toMin).sort((a, b) => a - b);
  const next = starts.find((m) => m > nowMin);
  const due = owed.filter((p) => p.at <= now + 2 * 60_000);
  const clock = (t: number): string => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (nowMin < starts[0]) return { ...base, due, note: `${owedNote} Extra runs start after today's first run.` };
  if (nowMin > Math.min(starts[starts.length - 1] + EXTRA_AFTER_LAST_MIN, 23 * 60 + 30)) return { ...base, due, note: `${owedNote} Too late in the day for an extra run.` };
  if (next !== undefined && next - nowMin < EXTRA_BEFORE_RUN_MIN) return { ...base, due, note: `${owedNote} The next scheduled run is close; it does them.` };
  // A scheduled run that started (or is waiting for its turn) before its report exists: its flag, and the first minutes after its time.
  const flags = scheduledFlags();
  if (flags.includes(SCHED_FLAG) || (profiles.count() > 1 && flags.includes(schedFlagFor(profiles.activeId()))) || starts.some((m) => nowMin >= m && nowMin - m < 5))
    return { ...base, due, note: `${owedNote} A scheduled run is starting.` };
  if (running() || Date.now() - starting < 90_000) return { ...base, due, note: `${owedNote} Waiting for the run that is going now.` };
  const ended = lastEndedAt();
  if (ended && now - ended < EXTRA_AFTER_RUN_MIN * 60_000) return { ...base, due, note: `${owedNote} Checking again a few minutes after the last run.` };
  if (!due.length) return { ...base, due, note: `${owedNote} Next extra run when the spacing allows, about ${clock(Math.min(...owed.map((p) => p.at)))}.` };
  return { ...base, due, note: `${owedNote} Starting an extra run.`, go: true };
}

/** Once a minute: start an extra run when the plan says so. */
async function tickExtra(): Promise<void> {
  if (!SUPPORTED) return;
  closeStaleExtras();
  let plan: ReturnType<typeof extraPlan>;
  try {
    plan = extraPlan();
  } catch (e) {
    deps.log(`autopilot: extra-run check failed: ${(e as Error).message}`);
    return;
  }
  if (!plan.go) return;
  starting = Date.now();
  try {
    const file = await writeExtra();
    for (const p of plan.due) {
      const t = tries.by.get(tryKey(p));
      tries.by.set(tryKey(p), { done: p.done, n: t && t.done === p.done ? t.n + 1 : 1 });
    }
    started = { day: todayStr(), n: (started.day === todayStr() ? started.n : 0) + 1 };
    deps.log(`autopilot: extra run ${plan.today + 1}/${plan.max} today for ${plan.due.map((p) => `${p.handle} ${SITE_LABEL[p.site]}`).join(', ')}`);
    if (MAC) {
      // What the launcher itself says (a script that fails before its report) goes to extra-launch.log. The script has its own watchdog.
      const said = fs.openSync(path.join(logsDir(), 'extra-launch.log'), 'w');
      const child = spawn('/bin/bash', [file], { detached: true, stdio: ['ignore', said, said], cwd: dir() });
      child.on('error', (e) => deps.log(`autopilot: extra run did not start: ${e.message}`));
      child.unref();
      fs.closeSync(said);
      return;
    }
    // Windows: through Task Scheduler, like the scheduled runs, as a task of its own with no times (it only ever runs
    // when started here). Windows stops it at the limit.
    if (!(await startOnDemand(extraTaskName(), file, EXTRA_KILL_MIN, 'Krypt Marketo: a short extra run for posts still owed today, started by the hub between the scheduled runs. Set on the Autopilot page.'))) deps.log('autopilot: Windows did not start the extra run');
  } catch (e) {
    deps.log(`autopilot: could not start an extra run: ${(e as Error).message}`);
  }
}

/**
 * Windows: run a script once through Task Scheduler, as a task with no times of its own (registered or refreshed, then
 * started). A fully detached PowerShell started from the hub exits before running anything, so this is how the hub
 * starts a run itself; Windows stops it after `limitMin`. False when Windows did not take it.
 */
async function startOnDemand(name: string, file: string, limitMin: number, description: string): Promise<boolean> {
  const user = `${process.env.USERDOMAIN ?? os.hostname()}\\${process.env.USERNAME ?? os.userInfo().username}`;
  const r = await powershell(
    [
      `$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ${psQuote(`-NoProfile -WindowStyle Hidden -Command "& '${file.replace(/'/g, "''")}'"`)}`,
      `$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes ${limitMin}) -MultipleInstances IgnoreNew`,
      `$principal = New-ScheduledTaskPrincipal -UserId ${psQuote(user)} -LogonType Interactive`,
      `Register-ScheduledTask -TaskName ${psQuote(name)} -Description ${psQuote(description)} -Action $action -Settings $settings -Principal $principal -Force | Out-Null`,
      `Start-ScheduledTask -TaskName ${psQuote(name)}`,
      "'ok'",
    ].join('\n'),
  );
  if (!r.ok || !/ok\s*$/.test(r.out)) {
    deps.log(`autopilot: Task Scheduler did not take "${name}": ${r.out.slice(0, 300)}`);
    return false;
  }
  return true;
}

/** The extra-run task (Windows): one per profile window when several run at once. Test copies have their own. */
const extraTaskPrefix = (): string => `Krypt Marketo${deps.dev ? ' (dev)' : ''} Extra run`;
const extraTaskName = (): string => (instance.MULTI && profiles.count() > 1 ? `${extraTaskPrefix()} (${profiles.activeId()})` : extraTaskPrefix());

/**
 * An extra run past its limit (Windows stopped it, or the computer slept through it): its report is closed and its
 * flag removed, so the next runs don't wait on it.
 */
function closeStaleExtras(): void {
  try {
    for (const f of fs.readdirSync(dir())) if (/^extra-running-[a-z0-9_]+\.flag$/.test(f) && Date.now() - fs.statSync(path.join(dir(), f)).mtimeMs > (EXTRA_KILL_MIN + 3) * 60_000) fs.rmSync(path.join(dir(), f), { force: true });
    if (!fs.existsSync(logsDir())) return;
    for (const f of fs.readdirSync(logsDir())) {
      if (!/-extra\.txt$/.test(f)) continue;
      const full = path.join(logsDir(), f);
      const st = fs.statSync(full);
      if (Date.now() - st.mtimeMs < (EXTRA_KILL_MIN + 3) * 60_000 || Date.now() - st.mtimeMs > 24 * 3600_000) continue;
      if (/^Run ended/m.test(fs.readFileSync(full, 'utf8'))) continue;
      fs.appendFileSync(full, `\r\nStopped at its ${EXTRA_KILL_MIN}-minute limit.\r\n\r\nRun ended ${new Date().toString()}\r\n`);
      deps.log(`autopilot: extra run ${f} stopped at its ${EXTRA_KILL_MIN}-minute limit`);
    }
  } catch {
    /* no folder yet */
  }
}

/** The user's number of extra runs a day (0 = none). Saved as is: no upper bound. */
export const setExtraRuns = (n: number): Promise<AutopilotStatus> =>
  oneAtATime(async () => {
    const v = Math.round(Number(n));
    if (!Number.isFinite(v) || v < 0) throw new Error('Extra runs a day is a whole number from 0 up.');
    profiles.setAutopilot({ ...settings(), extraRuns: v });
    deps.log(`autopilot: extra runs ${v} a day`);
    return status();
  });

function reportOf(file: string): AutopilotReport {
  const full = path.join(logsDir(), file);
  const log = fs.readFileSync(full, 'utf8');
  const st = fs.statSync(full);
  const ended = /^Run ended/m.test(log);
  // An app that answers in JSON left its answer (and the tokens it used) in a file beside the report.
  let out: ReturnType<typeof readRunOutput> = { text: '', warnings: [] };
  try {
    const side = full.replace(/\.txt$/, '.json');
    if (fs.existsSync(side)) out = readRunOutput(fs.readFileSync(side, 'utf8'));
  } catch {
    /* unreadable: the report is what the log says */
  }
  // The answer goes where it used to be printed: before the "exited with code" line.
  const logLines = log.split(/\r?\n/);
  const at = logLines.findIndex((l) => /exited with code \d+/.test(l));
  const lines = out.text || out.warnings.length ? [...logLines.slice(0, at < 0 ? logLines.length : at), ...out.warnings, ...out.text.split(/\r?\n/), ...(at < 0 ? [] : logLines.slice(at))] : logLines;
  const text = lines.join('\n');
  const m = /run-(\d{4}-\d{2}-\d{2})_(\d{2})(\d{2})(?:--([a-z0-9_]+))?/.exec(file);
  // A report with no profile in its name is from when there was only the first one.
  const profileId = m?.[4] ?? profiles.MAIN;
  return {
    profileId,
    profile: profiles.count() > 1 ? profiles.list().find((p) => p.id === profileId)?.name ?? 'a deleted profile' : undefined,
    file: full,
    at: m ? `${m[1]}T${m[2]}:${m[3]}` : st.mtime.toISOString(),
    running: !ended && Date.now() - st.mtimeMs < LIMIT_MIN * 60_000,
    ended,
    needs: lines.filter((l) => /NEEDS YOU/i.test(l)).map((l) => l.replace(/^[\s\-*•]+/, '').trim()).slice(0, 12),
    warnings: lines.filter((l) => /^(warning|error)\b|sign-in ends|please run \/login|invalid api key|not logged in|authentication|exited with code [1-9]/i.test(l.trim())).map((l) => l.trim()).slice(0, 6),
    text: text.length > 20_000 ? `${text.slice(0, 20_000)}\n…` : text,
    ...(isExtraReport(file) ? { extra: true } : {}),
    usage: out.usage ? { key: file, at: m ? `${m[1]}T${m[2]}:${m[3]}` : st.mtime.toISOString().slice(0, 16), kind: 'run', profileId, ...out.usage } : undefined,
  };
}

function reports(n = 8): AutopilotReport[] {
  if (!fs.existsSync(logsDir())) return [];
  return fs
    .readdirSync(logsDir())
    .filter((f) => /^run-.*\.txt$/.test(f))
    .sort()
    .reverse()
    .slice(0, n)
    .map(reportOf);
}

/**
 * Every report that can still be running: written to in the last LIMIT_MIN minutes (a running report is one that
 * has not ended and was written to that recently). Not "the newest few": with many profiles running at once, the
 * newest few can all have ended while an older one is still going.
 */
function liveReports(): AutopilotReport[] {
  if (!fs.existsSync(logsDir())) return [];
  const since = Date.now() - LIMIT_MIN * 60_000;
  // Names carry the start date (local time): only the last two days can still be written to.
  const day = (d: number): string => new Date(d).toISOString().slice(0, 10);
  const oldest = `run-${day(Date.now() - 2 * 86_400_000)}`;
  return fs
    .readdirSync(logsDir())
    .filter((f) => /^run-.*\.txt$/.test(f) && f >= oldest)
    .filter((f) => {
      try {
        return fs.statSync(path.join(logsDir(), f)).mtimeMs >= since;
      } catch {
        return false;
      }
    })
    .map(reportOf);
}

const isRunning = (): boolean => liveReports().some((r) => r.running);

/** Deletes run reports (and their answer files) older than this many days; never one that may still be running. */
export function pruneReports(days: number): number {
  if (!(days > 0) || !fs.existsSync(logsDir())) return 0;
  const before = Date.now() - days * 86_400_000;
  let n = 0;
  for (const f of fs.readdirSync(logsDir())) {
    if (!/^run-.*\.(txt|json)$/.test(f)) continue;
    const full = path.join(logsDir(), f);
    try {
      if (fs.statSync(full).mtimeMs < before) {
        fs.unlinkSync(full);
        n++;
      }
    } catch {
      /* in use: next time */
    }
  }
  return n;
}

/** The report of the run working on the open profile right now (null when no run is). */
export function currentReport(): string | null {
  try {
    const multi = profiles.count() > 1;
    return liveReports().find((r) => r.running && (!multi || r.profileId === profiles.activeId()))?.file ?? null;
  } catch {
    return null;
  }
}

/** That run (by its report file) is still going. */
export function reportRunning(file: string): boolean {
  try {
    return liveReports().some((r) => r.file === file && r.running);
  } catch {
    return false;
  }
}

/** The newest finished (or abandoned) run, trimmed to its final report: get_today shows it so each run picks up where the last left off. */
export function lastRun(): { at: string; ended: boolean; summary: string } | null {
  try {
    // The open profile's own last full run (an extra run only posted): another profile's report says nothing about this one.
    const r = reports(12).find((x) => !x.running && !x.extra && x.profileId === profiles.activeId());
    if (!r) return null;
    const body = r.text.split(/\r?\n/).filter((l) => l.trim() && !/^Run (started|ended)\b/.test(l));
    // Whole lines from the end, up to about 3500 characters: a cut mid-line lost the report's first platform.
    const kept: string[] = [];
    let size = 0;
    for (const l of body.slice(-24).reverse()) {
      if (kept.length && size + l.length > 3500) break;
      kept.unshift(l.length > 3500 ? `…${l.slice(-3500)}` : l);
      size += l.length + 1;
    }
    const tail = kept.join('\n').trim();
    return { at: r.at, ended: r.ended, summary: tail || '(no report text)' };
  } catch {
    return null;
  }
}

/** How many runs are left today, the current one included (at least 1). Used to spread engagement over the day. */
export function runsLeftToday(): number {
  const s = settings();
  if (!s.on) return 1;
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const starts = (s.pickedOn === todayStr() && s.picked?.length ? s.picked : s.times).map(toMin);
  return Math.max(1, starts.filter((m) => m > nowMin + 5).length + 1);
}

let rerolling = false;
/** Once a day, pick new random minutes for the runs. */
async function rerollIfStale(): Promise<void> {
  const s = settings();
  // Inside a change (enable and the others end with status()): queueing another change here would wait on itself forever.
  if (rerolling || inChange) return;
  // A tier whose model changed (Low and Medium: Sonnet to Opus, 2026-11-19), with the install still on the old one.
  const was = s.tier ? OLD_TIER_MODEL[s.tier] : undefined;
  if (s.tier && was && s.ai === 'claude' && s.model === was && USAGE_TIERS[s.tier].model !== was) {
    let busy = false;
    try {
      busy = isRunning();
    } catch {
      busy = true;
    }
    if (!busy) {
      const model = USAGE_TIERS[s.tier].model;
      rerolling = true;
      try {
        if (s.on && SUPPORTED) await oneAtATime(() => enableNow({ ai: s.ai, times: s.times, keepMinutes: true, model }));
        else profiles.setAutopilot({ ...s, model });
        deps.log(`usage tier ${s.tier}: model ${was} -> ${model}`);
      } catch (e) {
        deps.log(`autopilot: could not move the ${s.tier} tier to ${model}: ${(e as Error).message}`);
      } finally {
        rerolling = false;
      }
      return;
    }
  }
  if (!s.on || !SUPPORTED) return;
  // Several profiles and none in the runs (left that way by an older version): turn the schedule off.
  if (noneInRuns()) {
    rerolling = true;
    try {
      await disable();
      deps.log('autopilot: turned off, no profile has autopilot switched on');
    } catch (e) {
      deps.log(`autopilot: could not turn off: ${(e as Error).message}`);
    } finally {
      rerolling = false;
    }
    return;
  }
  // The run script on disk was written by an older Marketo (its AI start line is not today's): rewrite it, keeping
  // today's minutes. Never under a run: the script is being read while it runs.
  let old = false;
  try {
    // With each profile in its own window, the AI's start lines are in the per-profile scripts (run-part-<id>.cmd).
    const parts = fs.readdirSync(dir()).filter((f) => /^run-part-[a-z0-9_]+\.cmd$/.test(f));
    const text = [fs.readFileSync(scriptFile(), 'utf8'), ...parts.map((f) => fs.readFileSync(path.join(dir(), f), 'utf8'))].join('\n');
    // run.sh has each word in single quotes; run.cmd has them bare (none has a space).
    const sig = MAC ? AIS[s.ai].args.map(shq).join(' ') : AIS[s.ai].args.join(' ');
    old = !!AIS[s.ai].json && !isRunning() && !scheduledFlags().length && !text.includes(sig);
  } catch {
    /* no script yet: turning autopilot on writes it */
  }
  if (s.pickedOn === todayStr() && !old) return;
  const keepMinutes = s.pickedOn === todayStr();
  rerolling = true;
  try {
    await enable({ ai: s.ai, times: s.times, keepMinutes });
  } catch (e) {
    deps.log(`autopilot: could not re-pick today's minutes: ${(e as Error).message}`);
  } finally {
    rerolling = false;
  }
}

export async function status(): Promise<AutopilotStatus> {
  await rerollIfStale();
  const s = settings();
  const supported = SUPPORTED;
  const ais = await Promise.all(
    (Object.keys(AIS) as AutopilotAi[]).map(async (id) => {
      const p = await where(AIS[id].bin);
      return { id, name: AIS[id].name, found: !!p, path: p ?? undefined, client: AIS[id].client, note: AIS[id].note };
    }),
  );
  let task: { registered: boolean; nextRun?: string; lastRun?: string; lastResult?: number; state?: string } = { registered: false };
  if (MAC) task = await macTask(s.pickedOn === todayStr() && s.picked?.length ? s.picked : s.times);
  else if (supported) {
    const r = await powershell(
      `$t = Get-ScheduledTask -TaskName ${psQuote(taskName())} -ErrorAction SilentlyContinue; if ($t) { $i = $t | Get-ScheduledTaskInfo; [pscustomobject]@{ state = "$($t.State)"; next = if ($i.NextRunTime) { $i.NextRunTime.ToString('o') } else { '' }; last = if ($i.LastRunTime -and $i.LastRunTime.Year -gt 2000) { $i.LastRunTime.ToString('o') } else { '' }; result = $i.LastTaskResult } | ConvertTo-Json -Compress } else { '{}' }`,
    );
    try {
      const j = JSON.parse(r.out.split(/\r?\n/).pop() || '{}') as { state?: string; next?: string; last?: string; result?: number };
      if (j.state) task = { registered: true, state: j.state, nextRun: j.next || undefined, lastRun: j.last || undefined, lastResult: j.result };
    } catch {
      /* leave it unregistered */
    }
  }
  const rs = reports();
  // Every finished run goes into the usage ledger once.
  for (const r of rs) if (r.ended && r.usage) usage.addRun({ ...r.usage, ...(s.saver && AIS[s.ai].saverEnv ? { saver: true } : {}), ...(s.tier ? { tier: s.tier } : {}) });
  return { supported, ...s, on: s.on && task.registered, ais: ais.map((a) => ({ ...a, picksModel: !!AIS[a.id].modelFlag, measured: !!AIS[a.id].json, saves: !!AIS[a.id].saverEnv })), task, running: rs.some((r) => r.running), reports: rs, usage: usage.recent(30), folder: dir(), prompt: PROMPT, extra: (({ max, today, note }) => ({ max, today, note }))(extraPlan()), profiles: profiles.count() > 1 ? profiles.autopilotList().map((p) => p.name) : undefined };
}

export function openFolder(): string {
  fs.mkdirSync(logsDir(), { recursive: true });
  return dir();
}
