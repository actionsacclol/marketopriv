import { z } from 'zod';
import type { BrowserStatus, Fields, IgAccount, NetProfile, Network, Reel, SessionAction, Site, UiFocus, VoteStory } from '../../shared/types';
import { MAX_SLIDES, SHAPE_SIZE } from '../../shared/types';
import { SLIDE_SITES } from '../../shared/slides';
import { seriesOwed, seriesProblem } from '../../shared/series';
import * as perf from '../perf';
import { setBanner } from '../campaignBanner';
import { resolveYtChannel } from '../ytChannel';
import * as longVideo from '../longVideo';
import { PRESETS, isVoiced, presetById, presetSummary, timingFor } from '../../shared/presets';
import { FORMATS, formatById, formatSummary } from '../../shared/formats';
import { hookGroups, hookLine, metricsOn, pct, resultOf, type ReelResult } from '../../shared/score';
import { currentReport, lastRun, reportRunning, running as autopilotRunning, runsLeftToday, settings as autopilotSettings } from '../autopilot';
import { EXTRA_RUN_MIN, isExtraReport, postsDueNow } from '../../shared/extraRuns';
import { tierOf } from '../../shared/aiUsage';
import { updateInfo } from '../update';
import * as profiles from '../profiles';
import * as chromeBridge from '../chromeBridge';
import * as store from '../store';
import * as browser from '../browser';
import { humanCheckUntil } from '../../shared/humanCheck';
import * as approvals from '../approvals';
import * as research from '../research';
import * as refs from '../refs';
import { REF_RULES, profileLine, refReport, styleFor } from '../../shared/refStyle';
import { NETWORKS, NETWORK_LABEL, POST_GAP_MIN, QUOTA_KEYS, SITES, SITE_LABEL, YT_UPLOADS_PER_DAY, cleanLimit, isNetwork, limitKeys, limitLabel, limitsOf, linkOn, linkPatch, localDate, netOf, normalizeHandle, planFor, postGap, postLimit, postTarget, quotaKeys, quotaLabel, sameHandle, siteOn, sitesOf, watchOnlyOn, ytLimit, ytUploadsToday } from '../../shared/warmup';
import { KRYPT_PACK_READ, KRYPT_PACK_RULES, KRYPT_TOOLS, kryptToolById, kryptToolDetail, kryptToolNames, kryptToolsFeaturedFirst, kryptToolSummary } from '../../shared/kryptPack';
import { DEFAULT_TUNE, ELEVEN_SIGNUP_URL, describeTune } from '../../shared/voice';
import { HOOK_STYLES, HOOK_STYLE_IDS, hookStyleById, hooksNote } from '../../shared/hooks';
import { goalLine } from '../../shared/goals';
import { ytWarmupLine } from '../../shared/warmup';
import { ARTS } from '../../shared/character';
import { KRYPT_DISCORD, activeCreator, cleanInvite, isKryptBrand } from '../../shared/brand';
import { EDITOR_SERVER, EDITOR_URL, LONGFORM_SOFT_CAP, NEXT_STEP, isLongform, longformPlan, longformState } from '../../shared/longform';
import { kryptFollowLine, kryptFollowNow, kryptRepostDue, kryptRepostLine, kryptVisitDue, kryptVisitsLine } from '../../shared/kryptFollow';
import { CLIP_RANGE_LABEL, CLIP_SITE_LABEL, YT_MAX_SECONDS, clipKey, clock, parseClipSource, parseYouTube, sameMoment, spanOf, type MomentSpan } from '../../shared/clipping';
import type { ClipSource } from '../../shared/types';
import * as clips from '../clips';
import * as mediaFolders from '../mediaFolders';
import * as images from '../images';
import * as archive from '../archive';
import * as slideshows from '../slideshows';
import { briefText, lessonsText, trainingRules, trainingText } from '../../shared/training';
import { TONE_STYLES, allStyles, cleanStyles, mixWindow, nextStyle, rankedStyles, styleById, styleMix, styleName, styleNeeds, stylesOf } from '../../shared/styles';
import { removeReels } from '../reelFiles';
import * as screenRec from '../screen';
import { postGroups, postKey, postLine, siteOfUrl, similarPosts } from '../../shared/posts';
import { HUMAN_RULES, textProblems } from '../../shared/humanText';
import { COVER_STEP } from '../../shared/covers';
import { DISCLOSURE_STEP, REWARDS_SUBMISSIONS, campaignLine, campaignProblems, madeToday, submissionLine } from '../../shared/campaigns';
import type { ToolOutcome } from './index';

/** Share of each daily ceiling to aim for: well under it, but not near zero. */
const GOAL_SHARE = { likes: 0.7, follows: 0.6, reposts: 0.4, saves: 0.75, comments: 0.5 } as const;
/** The hub's version for the AI, and the newer one when krypt.cc lists it (the hub never updates itself). */
function versionNote(): string {
  const u = updateInfo();
  return u.latest ? `Krypt Marketo ${u.current}. Version ${u.latest} is out: tell the user once, in one line, that they can download it from ${u.url} (the hub does not update itself). Never download or install it yourself.` : `Krypt Marketo ${u.current}.`;
}

/**
 * The user's instructions for the next autopilot run (Create > Next run), for the top of get_today. Only an autopilot
 * run gets them, and only one: the note is marked with the run that read it and is done when that run ends.
 */
function nextRunNote(): string {
  store.settleNextRun(reportRunning);
  const n = store.get().nextRun?.note;
  if (!n) return '';
  const run = currentReport();
  if (!run) return 'The user has left instructions for the next autopilot run (Create > Next run in the hub). They are for that run, not for this conversation, unless the user says otherwise here.';
  if (n.givenTo && n.givenTo !== run) return '';
  store.giveNextRun(run);
  return [
    `FROM THE USER, FOR THIS RUN (written ${n.setAt.slice(0, 16).replace('T', ' ')} UTC on the hub's Next run page). Do this first; it decides what this run makes or does:`,
    '"""',
    n.text,
    '"""',
    "It is the user's own instruction, so it outranks the usual pick of topic, format and order. It does not lift anything else: the daily limits and the spacing between posts (recommended, or the user's own numbers), the brand's never-list, the Training rules and the checks on every claim all still hold, and a claim the user makes in it (a number, something about a competitor, what a tool does) is still checked like any other before it goes into a reel. If part of it cannot be done inside those, do the closest thing that can and say so. In the report, one line starting with NEXT RUN NOTE: says what you did about it. It is for this run only: the next run does not get it.",
  ].join('\n');
}

/** How much the runs experiment (Styles page): 'proven' never tests, 'experimental' never stops. */
const variety = (): 'proven' | 'balanced' | 'experimental' => store.get().settings.variety ?? 'balanced';
/** Whether a test (hook style, art style, voice) is still trying things out, given what its own numbers say. */
const exploring = (unfinished: boolean): boolean => (variety() === 'experimental' ? true : variety() === 'proven' ? false : unfinished);
/** The test rows in the words of the user's variety setting. */
function varietyText(rows: string): string {
  if (variety() === 'proven') return rows.replace(/: use it for about 2 of 3 ((?:story )?reels), keep testing the others[^\n]*/g, ': use it for all the $1 here (the user chose "proven" on the Styles page: no testing)');
  if (variety() === 'experimental') return rows.replace(/still testing: /g, 'keep rotating evenly (the user chose "experimental" on the Styles page): ');
  return rows;
}

/** The reel queue and the ideas waiting, as the AI reads them. */
function queueText(): string {
  const d = store.get();
  const n = d.nextRun;
  const out: string[] = [`Reel topics are picked by ${d.settings.reelPick === 'me' ? 'the user (runs make only what is queued)' : 'the AI (the queue comes first)'}. Variety: ${variety()}.`];
  out.push(n?.note ? `Next run${n.note.givenTo ? ' (a run has it now)' : ''}: """${n.note.text}"""` : 'Next run: no instructions (the AI picks, unless the user picks every topic).');
  out.push(n?.queue?.length ? `Queued after it, one per run:\n${n.queue.map((q, i) => `${i + 2}. [${q.id}] ${q.text}`).join('\n')}` : 'Nothing queued after it.');
  if (d.reelIdeas?.length) out.push(`Ideas waiting for the user to pick (Create > Next run):\n${d.reelIdeas.map((i) => `- ${i.topic}${i.hook ? ` · opens "${i.hook}"` : ''}${i.style ? ` · ${i.style}` : ''}`).join('\n')}`);
  return out.join('\n');
}

/** Who picks the next reel's topic and which style it is in: what the user set on the Next run and Styles pages. */
function reelPlanNote(): string {
  const d = store.get();
  const out: string[] = [];
  const run = currentReport();
  const note = d.nextRun?.note;
  const waiting = (d.nextRun?.queue?.length ?? 0) + (note ? 1 : 0);
  if (d.settings.reelPick === 'me') {
    if (!run) out.push(`Reel topics: the user picks every one. Make a reel only when they ask for one in this conversation; scheduled runs make only the reels in their queue (Create > Next run, ${waiting ? `${waiting} waiting` : 'empty now'}). propose_reels leaves ideas there for them to pick from.`);
    else if (note && note.givenTo === run) out.push('Reel topics: the user picks every one. This run makes the reel their instructions above ask for, and no other.');
    else out.push('Reel topics: the user picks every one (Create > Next run), and nothing is queued for this run. Make NO new reel this run: do the rest of the plan (messages, replies, engagement, stats). Then call propose_reels with 3 ideas for the next reels (topic, opening line, style, one line on why, from what is working and what has not been covered) so the user can pick, and say in the report that the queue is empty.');
  } else if (!run && waiting) out.push(`The reel queue has ${waiting} waiting (Create > Next run): each autopilot run takes the top one. queue_reels reads or changes it when the user asks.`);
  const b = d.brand;
  const label = (id: string): string => {
    const s = styleById(id);
    return s ? styleName(s, b).label : id;
  };
  const told = new Set<string>();
  for (const a of d.igAccounts) {
    // Styles that are on but cannot be made for this account (no streamers picked, not a Krypt tool) stay out of the rotation.
    const mix = styleMix(a).filter((m) => !styleNeeds(m.id, a, b));
    if (mix.length < 2) continue;
    const ids = new Set(mix.map((m) => m.id));
    const recent = [...d.reels].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).map((r) => r.style ?? 'main').filter((s) => ids.has(s)).slice(0, mixWindow(mix));
    // A comment vote story whose votes are counted waits for its next part: that goes before the rotation, or the story stalls.
    const waitingIn = ['vote', 'survival'].find((id) => ids.has(id) && voteWaiting(id));
    const waiting = !!waitingIn;
    const due = waitingIn ?? nextStyle(mix, recent);
    const made = (id: string): number => recent.filter((x) => x === id).length;
    // With many styles on, the line names the big shares and the ones made lately, not all of them.
    const few = mix.length <= 8;
    const big = mix.filter((m) => few || m.share >= 5);
    const rest = mix.length - big.length;
    const shares = `${big.map((m) => `${label(m.id)} ${m.share}%`).join(', ')}${rest ? `${big.length ? ', ' : ''}the other ${rest} styles that are on share the rest` : ''}`;
    const lately = mix.filter((m) => few || made(m.id)).map((m) => `${label(m.id)} ${made(m.id)}`).join(', ');
    out.push(`Style for the next reel on ${a.handle}: "${label(due)}"${waiting ? ' (its vote story has a counted vote and waits for the next part, so that goes first)' : ''}. Its mix${a.styleMix ? ' (set by the user on the Styles page)' : ' (the default, from the style ranking: the best-ranked styles get the most)'}: ${shares}; the last ${recent.length} reels: ${lately || 'none yet'}. A reel the user asked for in another style is made in that one. If "${label(due)}" cannot be made today (it needs a recording, footage or a product this account does not have), make the reel in the main style and say so in the report.`);
    const st = styleById(due);
    if (st && st.id !== 'main' && !rulesInline() && !told.has(st.id)) {
      told.add(st.id);
      out.push(`How to make a "${label(due)}" reel: ${st.rules}`);
    }
  }
  return out.join('\n');
}

/** Which profile is open, when the hub has more than one ('' with a single profile, so nothing changes there). */
function profileNote(): string {
  const all = profiles.list();
  if (all.length < 2) return '';
  const open = all.find((p) => p.active)!;
  return `Profile open: "${open.name}" (${open.id}). The hub has ${all.length} profiles (${all.map((p) => `"${p.name}"`).join(', ')}): each is a separate set with its own accounts, brand, reels, post log, Training, learnings and notes. Everything you read and do is in the open one. Switch with use_profile only when the user asks for another profile by name, or a run's instructions name one.`;
}

/** The user's own limits with a change from save_account merged in (null = back to the recommended number). */
function mergeLimits(old: IgAccount['limits'], patch: Partial<Record<Site, Record<string, number | null>>>): NonNullable<IgAccount['limits']> {
  const out: NonNullable<IgAccount['limits']> = { ...(old ?? {}) };
  for (const site of Object.keys(patch) as Site[]) {
    const mine = { ...(out[site] ?? {}) };
    for (const k of limitKeys(site)) {
      const v = patch[site]?.[k];
      if (v === undefined) continue;
      const n = cleanLimit(v);
      if (n === undefined) delete mine[k];
      else mine[k] = n;
    }
    const unknown = Object.keys(patch[site] ?? {}).filter((k) => !(limitKeys(site) as string[]).includes(k));
    if (unknown.length) throw new Error(`${SITE_LABEL[site]} has no ${unknown.join(', ')} limit. Its limits: ${limitKeys(site).join(', ')}.`);
    out[site] = mine;
  }
  return out;
}

/** How to read the day's numbers: recommended ones are ceilings, the user's own are what they want done. */
function ceilingNote(plan: ReturnType<typeof planFor>, site: Site): string {
  const mine = quotaKeys(site).filter((k) => plan.own[k] !== undefined);
  if (!mine.length) return 'These are recommended ceilings the browser enforces, not targets; stop well short of them. They are the user\'s to change (Accounts page > Daily limits).';
  return `The user set these themselves: ${mine.map((k) => `${quotaLabel(k, site)} ${plan.own[k]} (recommended ${plan.recommended[k]})`).join(', ')}. Those are the numbers they want, so use them. The rest are recommended ceilings: stop well short of them. The browser enforces all of them.`;
}

/** After a change to limits or post targets: where each of those platforms stands now, with the recommended numbers beside the user's. */
function limitsNote(a: IgAccount, sites: Site[]): string {
  const d = store.get();
  const rows = sites
    .filter((s) => siteOn(a, s))
    .map((site) => {
      const own = limitsOf(a, site);
      const rec = site === 'youtube' ? null : planFor(a, d.sessions, undefined, site).recommended;
      const recOf = (k: (ReturnType<typeof limitKeys>)[number]): number => (k === 'gap' ? POST_GAP_MIN[site] : k === 'posts' && site === 'youtube' ? YT_UPLOADS_PER_DAY : rec![k as keyof typeof rec]);
      const mine = limitKeys(site).filter((k) => own[k] !== undefined).map((k) => `${limitLabel(k, site)} ${own[k]} (recommended ${recOf(k)})`);
      const t = postTarget(a, site, d.sessions);
      const over = t.wanted > t.ceiling ? ` The post target of ${t.wanted} a day is above today's post limit of ${t.ceiling}, so it stops at ${t.ceiling}: if the user asked for ${t.wanted}, raise the limit too (limits: { ${site}: { posts: ${t.wanted} } }).` : '';
      const hours = Math.round(((t.target - 1) * postGap(a, site)) / 6) / 10;
      const gapNote =
        t.target > 1 && postGap(a, site) > 0
          ? ` Posts there are spaced ${postGap(a, site)} min apart${own.gap === undefined ? ' (recommended)' : ''}: ${hours > 16 ? `${t.target} a day does not fit in a day at that spacing, so tell the user and set the shorter gap they pick (limits: { ${site}: { gap: minutes } })` : `${t.target} a day needs runs spread over at least ${hours} hours`}.`
          : '';
      const past = limitKeys(site).filter((k) => own[k] !== undefined && (k === 'gap' ? own[k]! < recOf(k) : own[k]! > recOf(k)));
      const warn = past.length
        ? ` WARN THE USER in your reply, plainly: ${past.map((k) => (k === 'gap' ? `${own[k]} min between posts is shorter than Krypt's soft cap of ${recOf(k)}` : `${limitLabel(k, site)} ${own[k]} is over Krypt's soft cap of ${recOf(k)}`)).join('; ')}. Over a soft cap, ${SITE_LABEL[site]} can flag, limit or lock the account (a newer account most of all). It is set as they asked: their call.`
        : '';
      return `\n${SITE_LABEL[site]}: ${mine.length ? `the user's own limits: ${mine.join(', ')}; everything else at the soft cap.` : 'all limits at the soft cap.'}${over}${gapNote}${warn}`;
    });
  return rows.length ? `${rows.join('')}\n` : '';
}

/** Seconds one like (or one Pinterest save) really costs, with the post watched or read to the end and the hub's own pause between actions. From the run logs. */
const SECONDS_PER_ACTION: Record<Site, number> = { instagram: 80, youtube: 60, x: 75, tiktok: 60, facebook: 75, threads: 60, pinterest: 60 };


/**
 * The tools Krypt Marketo offers MCP clients. Store tools run here in the main
 * process; preview_reel and render_reel need a canvas + WebCodecs, so they run
 * in the renderer (src/render/agentTools.ts). Every change lands in the hub
 * live, and the hub jumps to whatever the agent is working on.
 */

export type ToolKind = 'read' | 'write' | 'destructive' | 'export';

export interface ToolDef {
  name: string;
  title: string;
  kind: ToolKind;
  where: 'main' | 'renderer';
  description: string;
  input: z.ZodObject;
}

export interface MainCtx {
  focus(f: UiFocus): void;
  /** Which AI app is calling (shown on approval requests). */
  client: string;
}

const fieldsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).describe('Preset field values by key (list_presets shows each preset\'s keys). Only the keys you pass change.');
const reelId = z.string().describe('Reel id (from create_reel / list_reels)');
const iso = z.string().describe('ISO 8601 date-time');
const action = z.enum(['watch', 'like', 'save', 'follow', 'comment', 'repost', 'message']);
const browserHandle = z.string().optional().describe('Which account (default: the active one)');
const site = z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest', 'rewards']).optional().describe("Which of the account's windows: 'instagram' (default), 'x', 'tiktok', 'facebook', 'threads' or 'pinterest' (each once turned on for the account), 'youtube' (YouTube Studio, for uploading Shorts; YouTube turned on), or 'rewards' (contentrewards.com, for campaign submissions)");
const campaignRef = z.string().optional().describe('The Content Rewards campaign it is made for (list_campaigns): caption must start with #ad and carry its required tags');
const network = z.enum(['instagram', 'x', 'tiktok', 'facebook', 'threads', 'pinterest']).optional().describe("Which network (default 'instagram'). X, TikTok, Facebook, Threads and Pinterest each have their own warm-up, limits and sessions.");
/** What each network watches for, said in its warm-up plan. */
const NET_CARE: Record<Network, string> = {
  x: "X's rules single out automated likes and aggressive following: like only posts you read, never follow in a burst.",
  tiktok: 'TikTok watches for bursts: watch most of each video before acting on it, skip off-niche videos quickly, spread follows out, and stop for the day if a security check appears.',
  facebook: 'Facebook ties the Page to the personal profile and to Instagram: no friend requests, no group spam, no links dropped in other people\'s comments; follows and likes slowly; stop for the day at any checkpoint.',
  threads: "Threads is linked to the Instagram account, so a strike there can reach Instagram: replies that add something, likes only on what you read, follows spread out.",
  pinterest: 'Pinterest flags accounts that pin the same link over and over or save in bursts: vary the boards and titles, save niche Pins at a human pace, never post the same Pin twice.',
};

const voteSchema = z.object({
  series: z.string().min(1).describe('The series name, the same on every part'),
  part: z.number().int().min(1).max(50),
  a: z.string().min(1).describe('Option A, a few words'),
  b: z.string().min(1).describe('Option B, a few words'),
  finale: z.boolean().optional().describe('The last part: no vote, it wraps the story up'),
});

const S = {
  get_overview: z.object({}),
  list_presets: z.object({ preset: z.string().optional().describe('A preset id: its fields, types and defaults. Leave out for the list.') }),
  list_reels: z.object({
    status: z.enum(['draft', 'rendered', 'posted']).optional(),
    limit: z.number().int().min(1).max(200).optional().describe('How many, newest first (default 40)'),
    offset: z.number().int().min(0).optional().describe('Skip this many of the newest first, for older reels'),
  }),
  get_reel: z.object({ id: reelId }),
  list_formats: z.object({ style: z.string().optional().describe('A channel style (label or id): returns how to make a reel in that style (its rules) and the format it starts from, instead of every format.') }),
  create_reel: z.object({
    preset: z.string().optional().describe('Preset id: story, list, post, stats, versus, terminal, clip, narrated (Reddit-style / greentext story over a moving background), meme (meme panels with effects), stickman (a hand-drawn stick figure, or two for versus clips, acting it out), blox (one or two blocky game-style 3D avatars acting it out: rants, skits, dances), slides (a slideshow), duo (a person asks, a 3D AI character answers, with a board of parts), morph (UI motion: one shape morphs through app states on the beat), lecture (the character teaches in the corner, a board builds the lesson), space (what-if space explainers drawn in flat scenes), cutaway (a 3D backyard cut open, one build a line, a running total), diorama (a little 3D world on any scene base that fills up or changes a line at a time: pieces, weather, fire, floods, years passing, a counter), ps2 (a PS2-style low-poly cutscene skit, our own cast, a hard cut every line, console subtitles), ink (a narrated true story acted out by our own caricature cast in hand-inked cartoon cels, a camera that never stops, a warm grainy print look), tv (a calm true story or explainer on an old CRT: our own glowing phosphor figures in glowing line-art places, scanlines and bloom, static between channels), hose (a true story told like a 1930s rubber hose cartoon: our own bouncing cast with hose arms and white gloves, old film, iris transitions, art-deco title cards), pixel (a story played like a 16-bit game: our own pixel cast, a typing text box, a choice menu, a HUD, a quiet typed ending); not needed with format'),
    format: z.string().optional().describe('Start from a format (list_formats): its preset, beat skeleton and caption. Its numbers are examples; replace them.'),
    title: z.string().optional().describe('Name in the hub (not shown in the video)'),
    fields: fieldsSchema.optional(),
    caption: z.string().optional().describe('Instagram caption to post with it'),
    hashtags: z.array(z.string()).optional(),
    hook_style: z.string().optional().describe(`The kind of opening this reel has, for the hook style test: ${HOOK_STYLE_IDS.join(', ')} (get_performance names the one to use next on each platform).`),
    style: z.string().optional().describe('The channel style it is made in (the Styles page: krypt/main, vote, tips, retro, toy, wyr, case, quiz, myth, top, chat, tier, screen, clipping, the real-footage ones proof, pov, speed, series, the meme ones reddit, greentext, meme, dumb, stickman, blox, slides, ask, whatif, survival, cutaway, diorama, lecture, uimotion, ps2, ink, pixel, hose and tv). Default main. It counts in the format test.'),
    vote: voteSchema.optional().describe('For the vote and survival styles: which part of which comment vote story this is, and its two options (with style survival the reel stays in that style).'),
    like: z.string().optional().describe('A reference video (id or name from list_reference_videos) whose editing style to follow: sets what the preset can take from it (accent, light/dark look, pace) and returns notes on matching the rest. Fields you pass still win.'),
    campaign: campaignRef,
  }),
  update_reel: z.object({
    id: reelId,
    title: z.string().optional(),
    preset: z.string().optional().describe('Switch style; matching field keys carry over'),
    fields: fieldsSchema.optional(),
    style: z.string().optional().describe('The channel style it is made in (krypt/main, vote, tips, retro, toy; the Styles page). Default main.'),
    vote: voteSchema.optional().describe('For the vote and survival styles: which part of which comment vote story this is, and its two options (with style survival the reel stays in that style).'),
    like: z.string().optional().describe('A reference video (id or name from list_reference_videos) whose editing style to follow: sets what the preset can take from it (accent, light/dark look, pace) and returns notes on matching the rest. Fields you pass still win.'),
    caption: z.string().optional(),
    hashtags: z.array(z.string()).optional(),
    hook_style: z.string().optional().describe(`The kind of opening this reel has, for the hook style test: ${HOOK_STYLE_IDS.join(', ')} (get_performance names the one to use next on each platform).`),
    campaign: z.string().optional().describe('Content Rewards campaign it is made for ("" = none)'),
  }),
  duplicate_reel: z.object({ id: reelId }),
  list_campaigns: z.object({}),
  save_campaign: z.object({
    campaign: z.string().describe('Its contentrewards.com link or id'),
    title: z.string().optional(),
    brand: z.string().optional(),
    platforms: z.array(z.enum(['tiktok', 'instagram', 'youtube', 'x', 'facebook'])).optional().describe('Where it pays'),
    pay: z.string().optional().describe('What it pays, as the page shows it'),
    rules: z.string().optional().describe("The campaign's brief and content rules, copied from its page"),
    hashtags: z.array(z.string()).optional().describe('Required in every caption'),
    mentions: z.array(z.string()).optional(),
    links: z.array(z.string()).optional(),
    sources: z.array(z.string()).optional().describe('Streamer / channel links to clip from'),
    banner: z.string().optional().describe('Ad banner the campaign wants on its clips: a picture link from its page (Drive/Dropbox share links work) or a file path from list_media; "" removes it. The hub draws it near the bottom of every reel for the campaign'),
  }),
  record_submission: z.object({
    id: z.string().describe('Submission id (list_campaigns) or the post link'),
    status: z.enum(['submitted', 'approved', 'rejected', 'missed']),
    note: z.string().optional().describe("Content Rewards' reason, or what went wrong"),
  }),
  make_hook_variants: z.object({
    id: reelId,
    original_hook: z.string().optional().describe("Name the original reel's hook angle (default: its first line)"),
    variants: z
      .array(
        z.object({
          hook: z.string().describe('The angle in a few words, e.g. "question first", "loss number first"'),
          first_beat: z.string().optional().describe('Story reels: the new first beat line (seconds | headline | visual | a | b | say | flags)'),
          fields: fieldsSchema.optional().describe('Other field changes for this version (e.g. headline, kicker)'),
        }),
      )
      .min(1)
      .max(4),
  }),
  delete_reel: z.object({ id: reelId, delete_file: z.boolean().optional().describe('Also move its rendered video to the Recycle Bin / Trash (default: the file stays).') }),
  preview_reel: z.object({
    id: reelId,
    times: z.array(z.number().min(0)).max(8).optional().describe('Seconds to grab. Default: the opening frame, two body beats and the end card.'),
    scale: z.number().min(0.15).max(1).optional().describe('Image size vs 1080x1920. Default 0.35.'),
    shape: z.enum(['vertical', 'square', 'portrait', 'pin']).optional().describe('square: preview the 1080x1080 version X gets; portrait (4:5) and pin (2:3): how a picture of it comes out'),
  }),
  render_image: z.object({
    id: reelId,
    t: z.number().min(0).optional().describe('Second of the reel to grab (default 1.5: the hook once it has landed). preview_reel first to find the strongest frame.'),
    shape: z.enum(['square', 'vertical', 'portrait', 'pin']).optional().describe('square (default) = 1080x1080 for X and feeds; portrait = 1080x1350 (4:5: Instagram, Threads, Facebook); pin = 1080x1620 (2:3: a Pin); vertical = 1080x1920'),
  }),
  render_cover: z.object({
    id: reelId,
    text: z.string().max(60).optional().describe('2-5 big words that make people tap, one in *stars* for the accent colour. Not the caption and not the hook line word for word. Leave out to keep the saved text; "" with look frame'),
    t: z.number().min(0).optional().describe('The second of the reel the frame comes from: its strongest picture (a face, the result, the number), found with preview_reel. Default: the saved one, else the middle of the opening'),
    look: z.enum(['bold', 'box', 'bar', 'frame']).optional().describe('bold (default) = huge outlined words; box = lines on white boxes; bar = a dark band with the words; frame = the frame alone (it already says it)'),
    place: z.enum(['top', 'middle', 'bottom']).optional().describe('Where the words go (all inside the middle 3:4 that Instagram\'s grid and TikTok show). Pick the place that leaves the face or subject clear'),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe('Accent colour for the *starred* word, #RRGGBB (default yellow #FFD84D)'),
    bg: z.string().optional().describe('An image to use instead of the reel\'s frame (absolute path, e.g. from save_images or list_media)'),
  }),
  render_slides: z.object({
    id: reelId,
    shape: z.enum(['portrait', 'vertical', 'square', 'pin']).optional().describe('portrait (default) = 1080x1350, 4:5: Instagram, Threads, Facebook, X; vertical = 1080x1920: TikTok; pin = 1080x1620, 2:3: Pinterest; square = 1080x1080'),
    times: z.array(z.number().min(0)).min(2).max(MAX_SLIDES).optional().describe('The seconds to save, in order. Leave out for a slides, meme, story, narrated or stickman reel: one picture per slide / panel / beat, each once it has landed.'),
  }),
  render_reel: z.object({ id: reelId, shape: z.enum(['vertical', 'square']).optional().describe('vertical (default) = 1080x1920 for Instagram, TikTok and Shorts; square = 1080x1080 for X (the same reel, its content band on a blurred fill; saved next to the vertical one)') }),
  mark_posted: z.object({
    id: reelId,
    url: z.string().describe('The live URL (instagram.com/reel/… or youtube.com/shorts/…)'),
    platform: z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']).optional().describe("Where it went live (default: read from the URL, else instagram). A reel can be posted on all of them; each keeps its own link."),
    posted_at: iso.optional().describe('When it went live, as a full ISO time with its zone. Leave out for a post that just went up: the hub records now. A date only, a guessed year, a time in the future or one more than 7 days back is recorded as now.'),
    caption: z.string().optional(),
    trial: z.boolean().optional().describe('Posted as a Trial Reel (Instagram)'),
    kind: z.enum(['video', 'slides']).optional().describe('slides = it went up as a photo post of its slides (browser_attach_slides). Default video.'),
    handle: z.string().optional().describe('The account that posted it (its Instagram handle, also for its X / TikTok / YouTube). Default: the active account.'),
  }),
  record_screen: z.object({
    window: z.string().describe('The window to record: its title or part of it, e.g. "Krypt Tweaker"'),
    seconds: z.number().min(2).max(120).optional().describe('How long to record (default 15)'),
    launch: z.string().optional().describe('Open this app first: its Start menu name ("Krypt Tweaker") or an .exe / .lnk path. Then waits for its window.'),
    name: z.string().optional().describe('File name for the recording'),
  }),
  list_media: z.object({
    kind: z.enum(['backgrounds', 'memes', 'campaigns', 'images', 'footage', 'music']).describe("backgrounds = videos to play behind narrated reels (the user's Backgrounds folder); memes = the user's meme templates, reaction pictures and clips (the Memes folder); campaigns = Content Rewards campaigns' logos and footage (query: the campaign title); images = pictures for photo slideshows (the Images folder: saved with save_images or the user's own); footage = b-roll films (the Footage folder: public-domain films saved with save_archive, or the user's own); music = music files (the Music folder: public-domain records saved with save_archive, or the user's own)"),
    query: z.string().optional().describe('Only files whose name or sub-folder has these words'),
    look: z.boolean().optional().describe('Also return small pictures of up to 10 of the images (from offset), to pick ones that fit the joke'),
    offset: z.number().int().min(0).optional().describe('With look: skip this many images (to see the next 10)'),
  }),
  find_archive: z.object({
    query: z.string().describe('What to look for, in plain words: "atom bomb drill", "1950s kitchen", "rocket launch", "office workers typing" (films) or "jazz", "ragtime piano", "march", "blues" (records)'),
    kind: z.enum(['film', 'music']).describe('film = public-domain films (the Prelinger Archives: ads, educational and industrial films, home movies, 1920s-1970s); music = public-domain 78 rpm records (the Great 78 Project, 1925 or earlier only)'),
    count: z.number().int().min(1).max(20).optional().describe('How many to list (default 10)'),
  }),
  save_archive: z.object({
    id: z.string().describe('The id from find_archive (or an archive.org/details/<id> link)'),
  }),
  find_images: z.object({
    query: z.string().min(2).describe('What the picture shows plus the look, the way people search Pinterest: "messy desk night aesthetic", "gym mirror selfie", "cozy gaming setup purple"'),
    count: z.number().int().min(1).max(24).optional().describe('How many to return (default 12)'),
  }),
  find_slideshows: z.object({
    query: z.string().optional().describe('A creator ("@name"): lists their photo slideshows with slide counts, likes, views and saves, most liked first. (Hashtag pages show only videos signed out; find slideshow creators in the account\'s TikTok tab: search the niche, Photos.)'),
    url: z.string().optional().describe('A TikTok photo post link (tiktok.com/@name/photo/...): returns its slides to look at, its caption, sound and numbers'),
    count: z.number().int().min(1).max(30).optional().describe('With query: how many to list (default 12)'),
  }),
  save_images: z.object({
    ids: z.array(z.string()).min(1).max(20).describe('The ids of the pictures to keep, from find_images'),
    folder: z.string().optional().describe('Sub-folder of Images to put them in (default: the search words)'),
  }),
  find_clips: z.object({
    handle: z.string().optional().describe('The account whose clipping streamers to read (Styles page). Default: the active account.'),
    streamer: z.string().optional().describe('Read this streamer instead: "kick.com/name", "twitch.tv/name", or a name with site'),
    video: z.string().optional().describe('A YouTube video address (watch, youtu.be or shorts link): lists its most replayed parts instead of streamer clips'),
    site: z.enum(['twitch', 'kick']).optional().describe('With a bare streamer name: which site'),
    range: z.enum(['day', 'week']).optional().describe("Top clips of the last day or week. Default: the account's setting"),
  }),
  save_clip: z.object({
    url: z.string().describe('The clip address from find_clips (kick.com/<name>/clips/clip_..., twitch.tv/<name>/clip/...), or a YouTube video address'),
    start: z.number().min(0).optional().describe('YouTube only: where the part starts, in seconds into the video (default: the t= in the address, else 0)'),
    seconds: z.number().min(3).max(90).optional().describe('YouTube only: how long the part is (default: a whole Short, else 30). Recorded in real time, so 40 s takes about 40 s plus loading'),
  }),
  record_votes: z.object({
    id: reelId.describe('The vote story part (a posted reel with vote set)'),
    a: z.number().int().min(0).describe('People who clearly picked A, each counted once, across every platform it is on'),
    b: z.number().int().min(0).describe('People who clearly picked B'),
    winner: z.enum(['a', 'b']).optional().describe('Only for a tie (or no votes): the option the next part follows'),
  }),
  record_reel_metrics: z.object({
    id: reelId,
    views: z.number().int().min(0).optional(),
    likes: z.number().int().min(0).optional(),
    comments: z.number().int().min(0).optional(),
    saves: z.number().int().min(0).optional(),
    shares: z.number().int().min(0).optional(),
    follows: z.number().int().min(0).optional(),
    reach: z.number().int().min(0).optional().describe('Accounts reached'),
    avg_watch_seconds: z.number().min(0).optional().describe('Average watch time'),
    skip_rate: z.number().min(0).max(100).optional().describe('Skip rate, percent'),
    platform: z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']).optional().describe("Which platform's numbers these are (default instagram). Record each platform the reel is on separately: YouTube Studio analytics for Shorts, TikTok Studio for TikTok, the post's view count on X/Threads, Business Suite for Facebook, Pin stats for Pinterest. Leave out what the platform doesn't show."),
    at: iso.optional(),
  }),
  get_performance: z.object({
    limit: z.number().int().min(1).max(100).optional(),
    full: z.boolean().optional().describe('true = every reel the user judged and every learning as single rows (with ids), in place of the Training brief. For writing the brief (save_brief) or finding a learning to delete; leave it out otherwise.'),
  }),
  save_brief: z.object({ text: z.string().min(80).describe('The whole brief, about 150 to 300 words, in Markdown under the headings the tool description names.') }),
  delete_learning: z.object({ id: z.string().describe('Learning id (from get_performance)') }),
  save_feedback: z.object({
    reel_id: z.string().optional().describe('The reel the user was talking about. Leave out for a note about the content in general.'),
    rating: z.number().int().min(1).max(5).optional().describe('Their rating of that reel, only if they gave one or their words are unmistakable: 1 never again, 2 weak, 3 fine, 4 good, 5 more like this'),
    hook_liked: z.boolean().optional().describe('What they said about the opening itself: true liked it, false did not'),
    note: z.string().optional().describe("What they said, in their words (quote or close to it). With reel_id it is kept on that reel; without, it becomes a note on the Training pages."),
    kind: z.enum(['rule', 'more', 'less']).optional().describe('For a general note: rule = holds for every reel ("never use that voice"), more / less = what to make more or less of. Default rule.'),
    about: z.enum(['general', 'hooks', 'topics']).optional(),
    topic: z.string().optional().describe('A topic or krypt_tools id they want more or less of (with kind more or less): it is marked on the Topics page'),
  }),
  add_learning: z.object({ text: z.string().min(3).describe('One lesson, with the evidence ("Question hooks held 2x longer than number hooks: B vs A, 41% vs 19% hold")'), reel_ids: z.array(z.string()).optional() }),
  record_account_stats: z.object({
    handle: z.string().optional().describe('Default: the hub\'s account handle'),
    site: z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']).describe("Required: the platform whose profile these numbers were read from. For YouTube: subscribers as followers, 0 following, videos as posts."),
    followers: z.number().int().min(0),
    following: z.number().int().min(0),
    posts: z.number().int().min(0),
    at: iso.optional(),
    confirm: z.boolean().optional().describe('Set only after re-reading the profile, when the hub questioned a big jump from the last reading and the numbers are right'),
  }),
  log_session: z.object({
    kind: z.enum(['warmup', 'engage', 'post', 'research', 'inbox']).describe('inbox = answering direct messages'),
    handle: z.string().optional(),
    site: network,
    started_at: iso,
    minutes: z.number().min(0),
    niche: z.string().optional().describe('e.g. "trading SaaS / AI trading bots / GitHub repos"'),
    notes: z.string().optional(),
    items: z
      .array(z.object({ url: z.string(), creator: z.string().optional(), title: z.string().optional(), actions: z.array(action).min(1), note: z.string().optional() }))
      .describe('Every post touched, with what was done to it'),
    save_references: z.boolean().optional().describe('Also add saved items to References (default true)'),
  }),
  list_sessions: z.object({ limit: z.number().int().min(1).max(50).optional(), with_items: z.boolean().optional() }),
  add_references: z.object({
    items: z.array(z.object({ url: z.string(), creator: z.string().optional(), title: z.string().optional(), notes: z.string().optional(), tags: z.array(z.string()).optional() })).min(1),
  }),
  list_references: z.object({ tag: z.string().optional(), query: z.string().optional(), limit: z.number().int().min(1).max(200).optional() }),
  add_reference_video: z.object({
    path: z.string().describe('Full path of a video file on this computer that the user gave you (mp4, mov, webm; up to 3 minutes). The hub keeps its own copy.'),
    name: z.string().optional().describe('What to call it, e.g. "fast captions, dark" (default: the file name)'),
    notes: z.string().optional().describe('What the user said about it, or what to copy from it'),
  }),
  list_reference_videos: z.object({}),
  get_reference_video: z.object({
    ref: z.string().describe('Reference video id or name'),
    preset: z.string().optional().describe('Also say how to match it with this preset'),
    pictures: z.boolean().optional().describe('Include the pictures of it: the opening seconds and one frame per section (default true; pass false if you cannot see images)'),
  }),
  note_reference_video: z.object({
    ref: z.string().describe('Reference video id or name'),
    notes: z.string().optional().describe('What its frames show, so the next reel can match it without looking again: how the hook is worded and where it sits, caption position / size / colour, transitions, what kind of visuals, voice or music. Replaces the old notes.'),
    name: z.string().optional().describe('Rename it'),
  }),
  set_settings: z.object({
    handle: z.string().optional(),
    output_dir: z.string().optional(),
    fps: z.union([z.literal(24), z.literal(30), z.literal(60)]).optional(),
    variety: z.enum(['proven', 'balanced', 'experimental']).optional().describe('How much the runs experiment with openings, art styles and voices (Styles page): proven = always the best so far, balanced = test then lean on the winner, experimental = keep rotating. Only with the user\'s say-so.'),
    per_thread: z.number().int().min(1).optional().describe("The most comments, replies and messages an account sends into one thread (a post's comments, an X or Threads conversation, a DM chat). Recommended 2 (the soft cap). Only when the user gives a number; over 2, warn them plainly that long back-and-forths are how AI accounts end up replying to each other and how accounts get flagged."),
    reel_pick: z.enum(['ai', 'me']).optional().describe('Who picks each reel\'s topic (Create > Next run): ai = the AI, with the queue first; me = only the user\'s queue. Only with the user\'s say-so.'),
    longform: z
      .object({ per_week: z.number().int().min(0).max(99).optional(), length: z.enum(['5-7', '8-12', '12-20']).optional().describe('Minutes each'), visibility: z.enum(['public', 'unlisted']).optional() })
      .optional()
      .describe(`The long-form channel's plan (Create > Long videos): long videos a week (recommended up to ${LONGFORM_SOFT_CAP}; the user's number stands), how long each is, and how a finished one goes up. Only when the user asks.`),
    voice_test: z.array(z.string()).max(4).optional().describe('The ElevenLabs voices ("el:<id>") that rotate with the default voice in the voice test. Replaces the list; an empty list ends the test. Only when the user asks to add or drop a voice.'),
  }),
  set_next_run: z.object({ text: z.string().max(2000).describe("The user's instructions for the next autopilot run, in their words. An empty string clears them.") }),
  save_style: z.object({
    id: z.string().optional().describe("To change one of the user's own styles: its label or id. Leave out to make a new one."),
    name: z.string().min(2).max(40).describe('What it is called on the Styles page, e.g. "Speedrun tips".'),
    label: z.string().max(12).optional().describe('One short lowercase word the user can say ("run the speedrun style"). Made from the name when left out.'),
    about: z.string().max(240).optional().describe('One or two lines for its card: what a video in this style is.'),
    rules: z.string().min(20).max(2000).describe('How a video in this style is made, written for the AI that will make it: the kind of story, how it opens, the beats, the look, the length, how it ends. Only things the hub can make (list_presets, list_formats).'),
    base: z.string().optional().describe('The built-in style it builds on, by label or id (default main): its format and preview are used.'),
  }),
  delete_style: z.object({ style: z.string().describe("One of the user's own styles, by label or id.") }),
  queue_reels: z.object({
    add: z.array(z.string().min(1).max(2000)).max(10).optional().describe("Instructions to put at the end of the queue, one per run, in the user's words."),
    remove: z.array(z.string()).max(30).optional().describe('Ids of queued ones to take out (the ids are in this tool\'s answer).'),
    clear: z.boolean().optional().describe('true empties the queue (the next run\'s own note stays).'),
  }),
  propose_reels: z.object({
    ideas: z
      .array(
        z.object({
          topic: z.string().min(3).max(500).describe('The story or angle, specific enough to act on.'),
          hook: z.string().max(240).optional().describe('The opening line it would start with.'),
          style: z.string().max(40).optional().describe('Channel style (label or id) it suits.'),
          why: z.string().max(300).optional().describe('One line on why it should work, from the numbers or the Training feedback.'),
        }),
      )
      .min(1)
      .max(6),
  }),
  show: z.object({ page: z.enum(['dashboard', 'styles', 'warming', 'accounts', 'next-run', 'studio', 'library', 'results', 'research', 'train-rank', 'train-hooks', 'train-topics', 'train-notes', 'voices', 'krypt', 'chat', 'agents', 'autopilot', 'usage', 'kip', 'multi-run', 'setup']), reel_id: z.string().optional() }),
  get_playbook: z.object({ doc: z.string().optional().describe('Which doc: number ("01"), file name or a word from its title. Default: the reel playbook plus the list of all docs.') }),
  list_accounts: z.object({}),
  get_today: z.object({}),
  log_posts: z.object({
    handle: z.string().optional().describe('The Marketo account (its Instagram handle). Default: the active one.'),
    posts: z
      .array(
        z.object({
          url: z.string().describe('The post link (instagram.com/reel/..., youtube.com/shorts/... or watch?v=..., x.com/<user>/status/..., tiktok.com/@<user>/video/...)'),
          site: z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']).optional().describe('Default: read from the link'),
          posted_at: z.string().optional().describe('When it went up: a full ISO time with its zone (2026-11-26T15:04:00Z). For a post from before today a date (YYYY-MM-DD) as close as the page shows is fine. A date only, no zone or a time in the future for a post made today is recorded as now.'),
          title: z.string().optional().describe('What it is in one line: the title, or the first line of the caption. Needed for a post not in the log yet.'),
          topic: z.string().optional().describe('The story or angle, specific enough to recognise a repeat (e.g. "GTA 6 trailer pumped DacityCoin", "Krypt Trader: how the Kalshi bot picks a side")'),
          tools: z.array(z.string()).optional().describe('krypt_tools ids it features (bot, mirror, trader, larp, ...)'),
          kind: z.enum(['video', 'short', 'text', 'image', 'slides', 'live']).optional().describe('slides = a photo post of several pictures (a carousel / slideshow)'),
          views: z.number().int().min(0).optional(),
          likes: z.number().int().min(0).optional(),
          comments: z.number().int().min(0).optional(),
          reel_id: z.string().optional().describe('The hub reel it was made from, if any'),
        }),
      )
      .min(1)
      .max(100),
  }),
  list_posts: z.object({
    site: z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']).optional(),
    query: z.string().optional().describe('A story, tool or angle you are thinking of making: returns the past posts that look like it'),
    days: z.number().int().min(1).max(3650).optional().describe('Only posts from the last N days'),
    limit: z.number().int().min(1).max(300).optional().describe('Default 60'),
  }),
  delete_post: z.object({ id: z.string().describe('Post id from list_posts, or its link') }),
  save_account: z.object({
    handle: z.string().describe('Instagram handle, e.g. @yuhgodev (or, for an account without Instagram, its name). Matches an existing account (to update it) or creates one.'),
    instagram: z.boolean().optional().describe("Run Instagram for this account (default on). Off for an account that only uses TikTok, X or YouTube. Only with the user's say-so."),
    new_handle: z.string().optional().describe('Rename the account (history moves with it)'),
    browser: z.enum(['hub', 'chrome']).optional().describe("Always 'chrome' now: every account runs in the user's own Chrome through the Krypt Marketo extension ('hub', the old built-in browser, is taken as 'chrome')."),
    watch_only: z.boolean().optional().describe('Watch only: on Instagram the browser refuses likes, saves, follows, comments and posts for this account (use while Instagram restricts it). YouTube uploads are not affected.'),
    youtube: z.boolean().optional().describe("Turn YouTube Shorts uploading on or off for this account. Its YouTube runs in the same place as its Instagram (same window profile, or the same Chrome profile). Only with the user's say-so."),
    forget_youtube_channel: z.boolean().optional().describe('Forget the YouTube channel saved for this account (the next channel seen in YouTube Studio becomes its channel). Only when the user asks.'),
    platform_notes: z.partialRecord(z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']), z.string().max(2000)).optional().describe("The user's own standing instructions for the AI on a platform, in their words (Home > click a platform shows and edits them). Replaces that platform's note; an empty string clears it. Only when the user asks."),
    goals: z.partialRecord(z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']), z.enum(['grow', 'product'])).optional().describe("What the account is for on each platform, only as the user says: grow (Mass growth: followers first) or product (Push product: customers for push_product). Missing = grow. Each platform with a researched preset gets its playbook in browser_open."),
    push_product: z.string().optional().describe('What Push product pushes for this account: a Krypt tool id (krypt_tools) or the product\'s name and link. Empty = the brand (Krypt: all tools, one per reel).'),
    youtube_channel: z.string().optional().describe("Which YouTube channel this account posts Shorts to: the channel link (youtube.com/@name or youtube.com/channel/UC…), its @handle or its UC… id, from the user. One Google account can own many channels: several accounts can share one Chrome profile, each with its own channel set here, and the hub switches YouTube Studio to the right one before acting. Turns YouTube on."),
    posts_per_day: z
      .partialRecord(z.enum(SITES), z.number().int().min(0))
      .optional()
      .describe("Daily posting targets per platform (defaults: Instagram 1, YouTube Shorts 2, X 4, TikTok 1, Facebook 1, Threads 2, Pinterest 2). get_today counts against them. A target above that platform's post limit for the day stops at the limit until the limit is raised too (limits). Only with the user's say-so."),
    limits: z
      .partialRecord(z.enum(SITES), z.partialRecord(z.enum(['minutes', 'likes', 'saves', 'follows', 'comments', 'posts', 'reposts', 'messages', 'gap']), z.number().int().min(0).nullable()))
      .optional()
      .describe("The user's own daily limits on a platform, in place of the recommended ones: e.g. { x: { posts: 20, comments: 20, gap: 30 } }. Keys: minutes (scrolling time), likes, saves (TikTok favorites), reposts (X, Threads; shares on Facebook), follows, comments (replies on X and Threads), messages, posts, gap (minutes between two posts there). YouTube takes posts and gap only. null puts one back to the recommended number. The recommended numbers are Krypt's soft caps: there is no upper bound, the limits are the user's to choose, and the hub then holds the account to their number. Only the ones named change. Only when the user asks for a number themselves, never on your own. Going over a soft cap: set it, and warn them plainly in your reply that the account could be flagged, limited or locked by the platform over Krypt's soft cap (the result says which numbers are over)."),
    x: z.boolean().optional().describe("Turn the account's X profile on or off (engagement and posting there, with its own warm-up and limits). Runs in the same place as its Instagram. Only with the user's say-so."),
    x_handle: z.string().optional().describe('The X handle, if it differs from the Instagram one. Left empty, the first X account seen signed in becomes it.'),
    x_warmup_start: z.string().optional().describe('YYYY-MM-DD of X warm-up day 1 (default: the day X is turned on)'),
    x_watch_only: z.boolean().optional().describe('Watch only on X: no likes, reposts, follows, replies or posts there'),
    tiktok: z.boolean().optional().describe("Turn the account's TikTok on or off (watching, engagement and posting there, with its own warm-up and limits). Runs in the same place as its Instagram. Only with the user's say-so."),
    tiktok_handle: z.string().optional().describe('The TikTok handle, if it differs from the Instagram one. Left empty, the first TikTok account seen signed in becomes it.'),
    tiktok_warmup_start: z.string().optional().describe('YYYY-MM-DD of TikTok warm-up day 1 (default: the day TikTok is turned on)'),
    tiktok_watch_only: z.boolean().optional().describe('Watch only on TikTok: no likes, favorites, follows, comments or posts there'),
    facebook: z.boolean().optional().describe("Turn the account's Facebook on or off (a Facebook Page it posts Reels as, plus engagement; its own warm-up and limits). Runs in the same place as its Instagram. Only with the user's say-so."),
    facebook_handle: z.string().optional().describe('The Facebook Page name, for reference.'),
    facebook_warmup_start: z.string().optional().describe('YYYY-MM-DD of Facebook warm-up day 1 (default: the day Facebook is turned on)'),
    facebook_watch_only: z.boolean().optional().describe('Watch only on Facebook: no likes, shares, follows, comments or posts there'),
    threads: z.boolean().optional().describe("Turn the account's Threads on or off (its own warm-up and limits; signed in with the Instagram account). Only with the user's say-so."),
    threads_handle: z.string().optional().describe('The Threads handle, if it differs from the Instagram one. Left empty, the first one seen signed in becomes it.'),
    threads_warmup_start: z.string().optional().describe('YYYY-MM-DD of Threads warm-up day 1 (default: the day Threads is turned on)'),
    threads_watch_only: z.boolean().optional().describe('Watch only on Threads: no likes, reposts, follows, replies or posts there'),
    pinterest: z.boolean().optional().describe("Turn the account's Pinterest on or off (video Pins, saves; its own warm-up and limits). Only with the user's say-so."),
    pinterest_handle: z.string().optional().describe('The Pinterest username. Left empty, the first one seen signed in becomes it.'),
    pinterest_warmup_start: z.string().optional().describe('YYYY-MM-DD of Pinterest warm-up day 1 (default: the day Pinterest is turned on)'),
    pinterest_watch_only: z.boolean().optional().describe('Watch only on Pinterest: no saves, reactions, follows, comments or Pins there'),
    niche: z.string().optional(),
    style_mix: z.record(z.string(), z.number().min(0).max(100)).optional().describe('The share of reels each of its styles gets, in percent, by style label or id, e.g. {"main": 60, "vote": 40} (Styles page). An empty object goes back to the default. Only with the user\'s say-so.'),
    styles: z.array(z.string()).optional().describe('Channel styles the account runs, main first (Styles page): krypt/main, vote, tips, retro, toy, ... reddit, greentext, meme, dumb, stickman, blox, slides, ask, whatif, survival, cutaway, diorama, lecture, uimotion, ps2, ink, pixel, hose, tv. Only with the user\'s say-so.'),
    tone: z.enum(['clean', 'edgy', 'raw']).optional().describe("How rough its reddit, greentext, meme and dumb videos may be: clean (no swearing), edgy (dark humour, mild swearing, strong words censored), raw (swearing allowed; never slurs). The user's call: only when they ask."),
    status: z.enum(['warming', 'active', 'paused']).optional(),
    created_on: z.string().optional().describe('YYYY-MM-DD the account was made'),
    warmup_start: z.string().optional().describe('YYYY-MM-DD of warm-up day 1 (default: created_on)'),
    setup: z.object({ avatar: z.boolean().optional(), bio: z.boolean().optional(), link: z.boolean().optional(), first_post: z.boolean().optional() }).optional().describe('Profile checklist'),
    notes: z.string().optional(),
    make_active: z.boolean().optional().describe("Make it the hub's active account"),
  }),
  get_warmup_plan: z.object({ handle: z.string().optional().describe('Default: the active account'), site: network }),
  krypt_tools: z.object({ tool: z.string().optional().describe('Tool id or name (e.g. "bot", "Krypt Tweaker"). Leave out for the whole list.') }),
  set_brand: z.object({
    name: z.string().optional().describe('Brand or product name'),
    what: z.string().optional().describe('What it is and who it is for, in one or two sentences'),
    site: z.string().optional().describe('Link shown on end cards, e.g. "example.com"'),
    niche: z.string().optional().describe('Topics the account posts about'),
    voice: z.string().optional().describe('How the copy should sound'),
    never: z.string().optional().describe('Claims and words that must never appear'),
    disclaimer: z.string().optional().describe('Small print for reels that need it'),
    logo: z.string().optional().describe('Path of a square logo image'),
  }),
  delete_playbook_note: z.object({ doc: z.string().min(1).describe("Which of the user's own notes: its file name (\"56-old-rule.md\") or its number (\"56\"). get_playbook lists them.") }),
  save_playbook_note: z.object({ title: z.string().min(2), content: z.string().min(10).describe('Markdown. Product facts, feature lists, research, what worked. Saving the same title again replaces the note.') }),
  browser_open: z.object({
    handle: browserHandle,
    site,
    url: z.string().optional().describe('An instagram.com URL or a path like "/reels/" (or a youtube.com URL; a path is then on studio.youtube.com). A youtube.com URL picks site "youtube" by itself. Default: stay where the window is (or the home page if it was closed: the feed, or YouTube Studio).'),
  }),
  browser_snapshot: z.object({ handle: browserHandle, site, full: z.boolean().optional().describe('List the whole page, not only what is on screen (longer). Use for Insights and stats pages.') }),
  browser_click: z.object({ handle: browserHandle, site, ref: z.number().int().min(1).describe('Element number from the latest listing') }),
  browser_type: z.object({
    handle: browserHandle,
    site,
    ref: z.number().int().min(1).describe('Number of a text field from the latest listing'),
    text: z.string().min(1).max(2200),
    clear: z.boolean().optional().describe('Empty the field first'),
    submit: z.boolean().optional().describe('Press Enter afterwards (search boxes). Sending a comment or message this way asks the user first.'),
  }),
  browser_press: z.object({ handle: browserHandle, site, key: z.enum(browser.KEY_NAMES).describe('ArrowDown / ArrowUp move between reels; Escape closes a dialog.') }),
  browser_scroll: z.object({ handle: browserHandle, site, direction: z.enum(['down', 'up']), amount: z.enum(['small', 'page', 'big']).optional() }),
  browser_wait: z.object({ handle: browserHandle, site, seconds: z.number().min(1).max(40).describe('How long to stay (watching a reel is waiting)') }),
  browser_back: z.object({ handle: browserHandle, site }),
  browser_close: z.object({ handle: browserHandle, site: z.enum(['instagram', 'x', 'tiktok', 'youtube', 'facebook', 'threads', 'pinterest']).optional().describe('Only this platform\'s tab. Leave out to close all of the account\'s tabs.') }),
  browser_screenshot: z.object({ handle: browserHandle, site }),
  list_profiles: z.object({}),
  use_profile: z.object({ id: z.string().min(1).describe('The profile id or its name, from list_profiles') }),
  post_failed: z.object({ handle: browserHandle, platform: z.enum(['instagram', 'x', 'tiktok', 'facebook', 'threads', 'pinterest']).describe('Where the post was sent and never showed up') }),
  browser_attach_image: z.object({
    handle: browserHandle,
    site,
    ref: z.number().int().optional().describe('The element number of the upload button the image is for (e.g. "Add profile picture" vs "Add cover photo"), when the page has more than one. Do not click that button: it opens a file dialog only the user can use.'),
    path: z.string().describe("An image file (.png/.jpg/.webp) inside Marketo's render folder (get_overview names it) or the app's own folders, e.g. a profile photo or cover you made there"),
  }),
  browser_attach_reel: z.object({ handle: browserHandle, site, id: reelId.describe('A rendered reel (render_reel first)') }),
  browser_attach_slides: z.object({
    handle: browserHandle,
    site,
    id: reelId.describe('The reel whose slides go up as pictures'),
    ref: z.number().int().optional().describe('Only when the answer asks for it: the element number of the page\'s photo upload button ("Add photo", "Upload"), from a fresh browser_snapshot. Do not click that button yourself: it opens a file dialog only the hub can fill.'),
  }),
  save_long_video: z.object({
    id: z.string().optional().describe('To change one: its id (list_long_videos). Leave out to start a new one.'),
    handle: z.string().optional().describe("The account whose YouTube channel it goes to (default: the active one). A new video needs it."),
    title: z.string().max(100).optional().describe('The YouTube title: what people type into search, first; under 70 characters; no clickbait the video does not pay off.'),
    topic: z.string().max(400).optional(),
    tools: z.array(z.string()).max(5).optional().describe('krypt_tools ids it is about'),
    sections: z
      .array(z.object({ heading: z.string().min(1).max(80), text: z.string().min(1).max(5000).describe('Exactly what the narrator says in this section'), visual: z.string().max(600).optional().describe('What is on screen meanwhile'), kip: z.string().max(400).optional().describe(`Kip's moves in this section: "0:wave, 3:talk, 9.5:point" (seconds into the section; moves: talk, point, present, shrug, shock, cheer, think, wave, facepalm, sad, laugh). Match them to the words: point when it says "this", shrug on a "meh", think on a question. Leave out for automatic.`) }))
      .max(30)
      .optional()
      .describe('The whole script, in order, one entry per chapter. Replaces the old list; a section whose text did not change keeps its narration.'),
    description: z.string().max(5000).optional().describe('The YouTube description: two lines that say what the video covers (search words in them), the link, chapters ("0:00 Intro" lines, from the edit), and a few hashtags.'),
    tags: z.array(z.string().max(60)).max(30).optional(),
    thumbnail_text: z.string().max(60).optional().describe('2 to 5 big words for the thumbnail; wrap one in *stars* for the accent colour. Not the title repeated.'),
    thumbnail_bg: z.string().optional().describe('A picture or video (a frame of it) behind the thumbnail text: absolute path'),
    thumbnail_side: z.string().optional().describe("A second picture on the thumbnail's right (a product screenshot): absolute path"),
    thumbnail_path: z.string().optional().describe('A finished 1280x720 thumbnail made elsewhere (Krypt Editor make_thumbnail): absolute path. render_thumbnail draws one here instead'),
    stats: z
      .object({ views: z.number().min(0), likes: z.number().min(0).optional(), comments: z.number().min(0).optional(), ctr: z.number().min(0).max(100).optional().describe('Impressions click-through rate, percent'), avg_viewed: z.number().min(0).max(100).optional().describe('Average percentage viewed'), subs: z.number().optional().describe('Subscribers it brought') })
      .optional()
      .describe("An uploaded video's numbers as YouTube Studio shows them now (Content and Analytics). Only what you read there"),
    project_path: z.string().optional().describe('The Krypt Editor project (.krypt)'),
    video_path: z.string().optional().describe('The exported MP4 (Krypt Editor export_video)'),
    status: z.enum(['script', 'narrated', 'edited', 'ready', 'uploaded']).optional(),
    visibility: z.enum(['unlisted', 'public', 'private']).optional(),
    url: z.string().optional().describe('Its YouTube link, once uploaded'),
  }),
  list_long_videos: z.object({ id: z.string().optional().describe('One video in full (script, files, description)') }),
  narrate_long_video: z.object({ id: z.string(), redo: z.boolean().optional().describe('Buy every section again, not only new or changed ones') }),
  render_thumbnail: z.object({ id: z.string() }),
  render_kip: z.object({
    id: z.string(),
    sections: z.array(z.number().int().min(1)).optional().describe('Only these sections (1 = the first); default every narrated one without a Kip clip yet'),
    art: z.enum(['3d', 'cartoon']).optional().describe('3d (default): glossy toy look; cartoon: toon shading with ink outlines'),
    redo: z.boolean().optional(),
  }),
  browser_attach_long: z.object({ handle: browserHandle, id: z.string().describe('A long video with video_path set') }),
};

export const TOOLS: ToolDef[] = [
  { name: 'get_overview', title: 'Overview', kind: 'read', where: 'main', description: 'START HERE. How to work in Krypt Marketo, the brand the reels are for and its rules, plus account stats, reel counts and recent sessions. Call this first in every conversation.', input: S.get_overview },
  { name: 'list_presets', title: 'List presets', kind: 'read', where: 'main', description: 'The reel presets, one line each; with preset, that one\'s fields, types and defaults.', input: S.list_presets },
  { name: 'list_reels', title: 'List reels', kind: 'read', where: 'main', description: 'Reels in the hub with status, length, render path and latest metrics.', input: S.list_reels },
  { name: 'get_reel', title: 'Get reel', kind: 'read', where: 'main', description: 'One reel\'s full field values, caption and timing.', input: S.get_reel },
  { name: 'list_formats', title: 'List formats', kind: 'read', where: 'main', description: 'Reel formats to start from (Would you copy this?, 30-second explainer, Myth vs data, Paper-trade diary, Same-day news, POV meme, for the meme styles Reddit story, Greentext, Meme slideshow, Dumb edit, for the stickman style Stickman explainer and Stickman versus, for the blox style Blocky rant, Blocky skit and Blocky dance, and UI motion, Lecture, What if (space), What if (stickman), Survival story, Backyard cutaway, 3D diorama (build it up, years pass, disasters, two blocks) and PS2 cutscene skit): when to use each, the job of every beat and hooks to test. Their content is example data to replace.', input: S.list_formats },
  { name: 'create_reel', title: 'Create reel', kind: 'write', where: 'main', description: 'Create a reel from a format (recommended) or a preset. Missing fields use the defaults (examples: replace every example line and number with real content for the product this reel is about). The hub opens it in Studio.', input: S.create_reel },
  { name: 'update_reel', title: 'Update reel', kind: 'write', where: 'main', description: 'Change a reel\'s fields, title, caption, hashtags or style. A rendered reel goes back to draft when its content changes.', input: S.update_reel },
  { name: 'duplicate_reel', title: 'Duplicate reel', kind: 'write', where: 'main', description: 'Copy a reel (for variations / A-B hooks).', input: S.duplicate_reel },
  { name: 'list_campaigns', title: 'Content Rewards campaigns', kind: 'read', where: 'main', description: 'Content Rewards campaigns the user joined: rules, accounts, reels due today, submissions.', input: S.list_campaigns },
  { name: 'save_campaign', title: 'Save campaign', kind: 'write', where: 'main', description: "Save a joined campaign's details from its page. Only what you pass changes.", input: S.save_campaign },
  { name: 'record_submission', title: 'Record submission', kind: 'write', where: 'main', description: "Set a campaign submission's status.", input: S.record_submission },
  { name: 'make_hook_variants', title: 'Make hook variants', kind: 'write', where: 'main', description: 'Hook test: copy a reel into up to 4 versions that differ only in the opening (version A is the original). Render each, post them as separate Trial Reels, then compare with get_performance.', input: S.make_hook_variants },
  { name: 'delete_reel', title: 'Delete reel', kind: 'destructive', where: 'main', description: 'Remove a reel from the hub. Its rendered file stays on disk unless delete_file is true (then it goes to the Recycle Bin / Trash).', input: S.delete_reel },
  { name: 'preview_reel', title: 'Preview frames', kind: 'read', where: 'renderer', description: 'Render still frames of a reel as images, to check layout and copy before rendering. If you cannot see images, get_reel shows the exact text of every beat instead.', input: S.preview_reel },
  { name: 'render_image', title: 'Render image', kind: 'export', where: 'renderer', description: "Save one frame of a reel as a full-size PNG in the output folder (square by default) for an image post: X, Threads, a Facebook photo or a Pin. Returns the file path to give browser_attach_image.", input: S.render_image },
  { name: 'render_reel', title: 'Render reel', kind: 'export', where: 'renderer', description: 'Render the reel to an MP4 (H.264/AAC) in the output folder: 1080x1920 for Instagram, TikTok and Shorts, or with shape "square" the 1080x1080 version X gets. Returns the file path.', input: S.render_reel },
  { name: 'render_slides', title: 'Save slides', kind: 'export', where: 'renderer', description: "Save a reel's slides as pictures (2-10 JPEGs in a folder of their own) for a photo post people swipe through: an Instagram carousel, a TikTok photo post, a multi-photo post on Threads, Facebook or X. Made for slides reels (preset slides); also works on meme, story, narrated and stickman reels (one picture per panel or beat). Returns the files and small copies to check. Then browser_attach_slides.", input: S.render_slides },
  { name: 'mark_posted', title: 'Mark posted', kind: 'write', where: 'main', description: 'Record that a reel went live on Instagram, X, TikTok, Facebook, Threads, Pinterest or as a YouTube Short (platform "youtube"), with its URL.', input: S.mark_posted },
  { name: 'set_next_run', title: 'Next run instructions', kind: 'write', where: 'main', description: "Save what the user wants the next autopilot run to do (the hub's Create > Next run page). Only when the user asks for it (\"next run, make a reel about ...\"); write it in their words, never your own plan. The next run reads it first, once. Replaces what was there; an empty text clears it.", input: S.set_next_run },
  { name: 'save_style', title: 'Make or change a style', kind: 'write', where: 'main', description: "Make a channel style of the user's own (it appears on the Styles page), or change one they made (id). Use it when the user asks for a new kind of video: write the rules from what they describe. The built-in styles cannot be changed; build a new one on top of one (base). A style is used once an account runs it (save_account styles), which is the user's call.", input: S.save_style },
  { name: 'delete_style', title: 'Delete a style', kind: 'write', where: 'main', description: "Delete one of the user's own styles, only when they ask. Accounts stop running it; reels already made keep their tag. Built-in styles cannot be deleted.", input: S.delete_style },
  { name: 'queue_reels', title: 'Reel queue', kind: 'write', where: 'main', description: "The reel queue (the hub's Create > Next run page): instructions the autopilot runs work through, one per run, after the next run's own note. With no arguments it only reads: the queue, the ideas waiting, who picks the topics and the variety setting. add / remove / clear only when the user asks (\"queue three reels about ...\"), in their words, never your own plan.", input: S.queue_reels },
  { name: 'propose_reels', title: 'Suggest reels', kind: 'write', where: 'main', description: 'Leave reel ideas for the user to pick from (Create > Next run shows them with a "Queue it" button). Use it when the user asks for ideas, and at the end of a run when they pick every topic themselves and the queue is empty. Ideas only: nothing is made from them until the user queues one.', input: S.propose_reels },
  { name: 'list_profiles', title: 'Profiles', kind: 'read', where: 'main', description: 'The profiles in the hub and which one is open. A profile is a complete, separate set: its own accounts and socials, brand, reels, post log, Training, learnings and notes.', input: S.list_profiles },
  { name: 'use_profile', title: 'Open a profile', kind: 'write', where: 'main', description: "Open another profile. Its tabs replace the open ones and everything you read before (overview, today's plan, performance) belongs to the profile you left, so read them again. Only when the user asks for a profile by name, or a run's instructions name one; never on your own.", input: S.use_profile },
  { name: 'post_failed', title: 'Post did not go up', kind: 'write', where: 'main', description: "A post you pressed Post / Share / Publish on never showed up on the profile (or in the platform's Published list): gives today's post slot back so it can be tried once more. Only after you looked, at least two minutes after sending. Refused when a post was recorded as live there since (mark_posted / log_posts), and after two a day per platform.", input: S.post_failed },
  { name: 'list_media', title: 'Backgrounds and memes', kind: 'read', where: 'main', description: "The user's own media for the meme styles: background videos (Backgrounds folder) for narrated reels, and meme templates, reaction pictures and clips (Memes folder) for meme reels. Returns file paths to put in a reel (fields.video, or an image panel's a); with look, small pictures of the images.", input: S.list_media },
  { name: 'find_clips', title: 'Find stream clips', kind: 'read', where: 'main', description: "Clipping style: the top Twitch / Kick clips (by views, last day or week) of the streamers set for the account on the Styles page, read off their clips pages. Each has its address, title, length and views, and whether a reel already uses it. save_clip the one to cut. With video (a YouTube address the user gave, in chat or in the reel queue): that video's most replayed parts off YouTube's own replay graph, with chapters, for save_clip with start and seconds.", input: S.find_clips },
  { name: 'find_archive', title: 'Find free footage and music', kind: 'read', where: 'main', description: "Search the Internet Archive for footage and music a posted reel can use for free: public-domain films (the Prelinger Archives: old ads, educational, industrial and home movies) and public-domain 78 rpm records (1925 or earlier). No key, no account. Returns each with its id, year, length and downloads, plus small cover pictures to pick by looking. Then save_archive. Concert recordings and newer records are never listed: they are not free to post.", input: S.find_archive },
  { name: 'save_archive', title: 'Save free footage or music', kind: 'export', where: 'main', description: "Download one find_archive result into the Footage folder (a film, MP4) or the Music folder (a record, MP3) and return its path and the credit line. A film is b-roll: a reel's video (fields.video with bg_start / a screen beat's second, or a clip reel), a few seconds of it a cut, never the whole film. A record is a reel's music file (fields.music). The credit line goes in the post caption.", input: S.save_archive },
  { name: 'find_images', title: 'Find pictures', kind: 'read', where: 'main', description: 'Search Pinterest for pictures for a photo slideshow (read in a hidden window of the hub, signed out: no account is used and nothing counts toward a warm-up). Returns each picture small, with an id, its shape and what its Pin says. Pick by looking: one look for the whole slideshow, upright pictures, no text or watermark on them, no recognisable faces. Then save_images.', input: S.find_images },
  { name: 'find_slideshows', title: 'Study slideshows', kind: 'read', where: 'main', description: "Study TikTok photo slideshows (read in a hidden window of the hub, signed out: no account is used). With query \"@creator\": that creator's photo posts with their numbers, most liked first. With url: one post's slides as pictures, its caption, sound and numbers, to see what its hook is, how it is built and how it looks. Use what works (the hook's angle, the structure, the slide count, the look) for our own slideshow with our own words and pictures; never copy a post's sentences or reuse its slides.", input: S.find_slideshows },
  { name: 'save_images', title: 'Save pictures', kind: 'export', where: 'main', description: "Save pictures from find_images into the Images folder at full size and return their file paths, for a slideshow's photo slides (beats: seconds | text | photo | <path>). Each picture must be changed before it is posted: our own words on it, plus a crop, flip, tint or grain (the slides style's rules).", input: S.save_images },
  { name: 'save_clip', title: 'Save stream clip', kind: 'export', where: 'renderer', description: 'Clipping style: download one Twitch / Kick clip (the video its page plays), or record a part of a YouTube video off its page (start, seconds; up to 90 s, in real time), save it as an MP4 in the output folder, caption its speech on this computer and return frames to find the facecam. Then create_reel with preset clip, fit split (the clipping style\'s rules say how).', input: S.save_clip },
  { name: 'record_screen', title: 'Record screen', kind: 'export', where: 'renderer', description: 'Record one app window (never the whole screen) for a few seconds, for screen-tutorial reels: optionally opens the app first by its Start menu name. Saves a seekable MP4 in the output folder and returns frames so you can pick the seconds. Only record Krypt apps or the user\'s own; trading tools in paper / demo mode only.', input: S.record_screen },
  { name: 'record_votes', title: 'Record votes', kind: 'write', where: 'main', description: 'Comment vote story: save how many people picked A and B on a posted part (read from its comments on every platform it is on; each person once). The most votes decide the next part; get_overview says what is next.', input: S.record_votes },
  { name: 'record_reel_metrics', title: 'Record reel metrics', kind: 'write', where: 'main', description: "Add a metrics snapshot for a posted reel on one platform (platform, default instagram): views, reach, average watch time, skip rate, likes, comments, saves, shares, follows, read off that platform's own stats. get_today says which are due (24h after posting, again at 7 days).", input: S.record_reel_metrics },
  { name: 'get_performance', title: 'Performance', kind: 'read', where: 'main', description: 'How posted reels did: ranked by score with hold %, skip rate and per-reach share/save/like/follow rates, hook tests side by side with the leader, averages by format, the art style test (which story art style to use next on each platform), and what we learned so far. Once there is a Training brief it gives that page plus what is newer than it, in place of every single rating and learning (full: true lists them all). Read before planning the next reel.', input: S.get_performance },
  { name: 'save_brief', title: 'Write the Training brief', kind: 'write', where: 'main', description: "Write the Training brief: the one page the next runs read in place of every single rating and learning, and that the user reads on the hub's Training pages to see what you think they want. Only when the user asks for it (they press Update there, or say so) or get_performance says it is due. First get_performance with full: true, and write from those rows every time, never from the brief as it stands. About 150 to 300 words in Markdown: each heading on its own line as \"### Heading\" and the points under it as short \"- \" lines, under these headings: \"Make more of\", \"Make less of\", \"Openings\", \"Topics\", \"From the numbers\". The first four are the user's own verdicts only (ratings, opening thumbs, comments, topics): name what the 4s and 5s have in common and what the 1s and 2s have in common, and quote their words where they said why; where there are too few ratings to see a pattern, say that instead of guessing. \"From the numbers\" sums up the learnings, each with the figure behind it and its platform. Where the user's taste and the numbers point different ways, say so in one line and do not pick. Leave out the user's rules and notes: those are always sent word for word. Nothing in it may be a guess about their taste.", input: S.save_brief },
  { name: 'delete_learning', title: 'Delete learning', kind: 'destructive', where: 'main', description: 'Remove a learning that turned out wrong or was superseded.', input: S.delete_learning },
  { name: 'save_feedback', title: 'Save user feedback', kind: 'write', where: 'main', description: "Record what the USER said about a reel (their rating, what they thought of its opening, their comment) or about the content in general (a rule, more of / less of, a topic). Only the user's own verdict, in their words: never your opinion, never something inferred from the numbers. It shows on the hub's Training pages and get_performance reads it back.", input: S.save_feedback },
  { name: 'add_learning', title: 'Add learning', kind: 'write', where: 'main', description: 'Save one lesson from the results (with the evidence) so later reels use it. get_performance lists them.', input: S.add_learning },
  { name: 'record_account_stats', title: 'Record account stats', kind: 'write', where: 'main', description: 'Add a followers/following/posts snapshot for one platform: site is required and must be the platform whose profile you read the numbers on (one call per platform).', input: S.record_account_stats },
  { name: 'log_session', title: 'Log session', kind: 'write', where: 'main', description: 'Close a warm-up / engagement session with its niche and notes (site "x", "tiktok", "facebook", "threads" or "pinterest" for a session there). Sessions run through the browser tools are already counted by the hub (likes, saves, reposts, follows, comments/replies, minutes); this adds your notes and any posts you only watched. Sessions done elsewhere are logged from the items you pass.', input: S.log_session },
  { name: 'list_sessions', title: 'List sessions', kind: 'read', where: 'main', description: 'Recent sessions, newest first.', input: S.list_sessions },
  { name: 'add_references', title: 'Add references', kind: 'write', where: 'main', description: 'Save inspiration posts (URL, creator, notes, tags). Duplicates are skipped.', input: S.add_references },
  { name: 'list_references', title: 'List references', kind: 'read', where: 'main', description: 'Saved inspiration posts, filtered by tag or text.', input: S.list_references },
  { name: 'add_reference_video', title: 'Add reference video', kind: 'write', where: 'renderer', description: 'Add a video file as a reference to copy the editing style of ("make it like this"). The hub measures it on this computer (sections and cuts, pace, look, colours, sound and tempo) and keeps pictures of it. Takes a few seconds.', input: S.add_reference_video },
  { name: 'list_reference_videos', title: 'List reference videos', kind: 'read', where: 'main', description: 'The videos the user uploaded to copy the editing style of, with their measured pace and look.', input: S.list_reference_videos },
  { name: 'get_reference_video', title: 'Reference video', kind: 'read', where: 'main', description: "Everything about one reference video: its rhythm section by section, cuts, look, colours, sound and tempo, the saved notes, how to match it, and pictures of it (the opening seconds, one frame per section). Call it when the user says \"like this\" or names a reference.", input: S.get_reference_video },
  { name: 'note_reference_video', title: 'Describe reference video', kind: 'write', where: 'main', description: "Save what a reference video's frames show (hook, captions, transitions, visuals), or rename it. Do it after looking at the pictures, so the style is there next time and for AIs that cannot see.", input: S.note_reference_video },
  { name: 'set_settings', title: 'Settings', kind: 'write', where: 'main', description: 'Change the account handle, render output folder, frame rate, or which voices are in the voice test.', input: S.set_settings },
  { name: 'get_playbook', title: 'Playbook', kind: 'read', where: 'main', description: 'Notes for making reels: the reel playbook (story format, hooks, visuals, captions, CTAs, checklist), the algorithm/growth research, and the user\'s own product notes. Read before writing a reel.', input: S.get_playbook },
  { name: 'list_accounts', title: 'List accounts', kind: 'read', where: 'main', description: "The accounts in the hub: handle, which Chrome profile it runs in and whether it is signed in, status, warm-up day/phase, today's activity vs limits, latest follower count, and its YouTube channel for Shorts if it has one.", input: S.list_accounts },
  { name: 'save_account', title: 'Save account', kind: 'write', where: 'main', description: 'Add or update an Instagram account: which Chrome profile it runs in, niche, status, watch-only, YouTube Shorts on/off, dates, profile checklist, notes. The user signs it in themselves on the Accounts page.', input: S.save_account },
  { name: 'log_posts', title: 'Log posts', kind: 'write', where: 'main', description: "Record posts in the post log: what went up on each platform, made with Marketo or not, so later reels don't repeat a story. Matched by link, so logging the same post again just updates it (views, topic...). mark_posted logs hub reels by itself; use this for everything else (posts the user made by hand, older posts read off each profile).", input: S.log_posts },
  { name: 'list_posts', title: 'Post log', kind: 'read', where: 'main', description: 'The post log: every post on every platform, newest first, with its story/angle and tools. Pass query with a story or tool you are about to make a reel about to see the past posts that look like it. Read it before every new reel.', input: S.list_posts },
  { name: 'delete_post', title: 'Delete logged post', kind: 'write', where: 'main', description: 'Remove one entry from the post log (a wrong link or a post that was taken down).', input: S.delete_post },
  { name: 'get_today', title: 'Today', kind: 'read', where: 'main', description: "EVERY TIME YOU CONNECT, after get_overview: what is left to do today for every account on every platform (Instagram, YouTube Shorts, X, TikTok, Facebook, Threads, Pinterest): posts against the user's daily targets, inbox, engagement left, reels ready to post, metrics due, and the order to do it in.", input: S.get_today },
  { name: 'get_warmup_plan', title: 'Warm-up plan', kind: 'read', where: 'main', description: "Today's warm-up plan for an account on Instagram, or on another network with site set to it (each has its own ramp): phase, time budget, what's left of today's limits, tasks. Call before every warm-up / engagement session.", input: S.get_warmup_plan },
  { name: 'krypt_tools', title: 'Krypt tools', kind: 'read', where: 'main', description: 'The built-in catalog of every krypt.cc tool (trading bots, editor, studio, PC utilities): with a tool name, everything about it (what it does in full, price, platforms, version, reel angles, what never to claim); without one, the list. Read it before making a reel about any Krypt tool.', input: S.krypt_tools },
  { name: 'set_brand', title: 'Set brand', kind: 'write', where: 'main', description: 'Fill in or change the brand profile the reels are made for (name, what it is, link, niche, voice, banned claims, disclaimer). Only what you pass changes.', input: S.set_brand },
  { name: 'delete_playbook_note', title: 'Delete playbook note', kind: 'write', where: 'main', description: "Delete one of the user's own playbook notes (the ones saved with save_playbook_note, numbered from 50). Use it when the user asks, or to remove a duplicate or wrong note you saved yourself in this conversation. To change a note, save it again under the same title instead. The docs that came with the app cannot be deleted. The file is kept in the playbook's \"deleted\" folder.", input: S.delete_playbook_note },
  { name: 'save_playbook_note', title: 'Save playbook note', kind: 'write', where: 'main', description: 'Save product facts or research as a note in the user\'s playbook, so later sessions (and other AIs) read it with get_playbook.', input: S.save_playbook_note },
  { name: 'browser_open', title: 'Open Instagram', kind: 'write', where: 'main', description: "Open an account's Instagram (optionally at an instagram.com URL), its X with site \"x\", its TikTok, Facebook, Threads or Pinterest with site \"tiktok\" / \"facebook\" / \"threads\" / \"pinterest\", or its YouTube Studio with site \"youtube\", and list what is on screen as numbered lines. It opens in a tab of the user's own Chrome, in the Chrome profile the account is signed in to. This is how you use Instagram and YouTube here; don't use any other browser tool for them.", input: S.browser_open },
  { name: 'browser_snapshot', title: 'Read the page', kind: 'read', where: 'main', description: 'List what is on screen in the Instagram window again: text, plus every button, link and field with a number to click or type into.', input: S.browser_snapshot },
  { name: 'browser_click', title: 'Click', kind: 'write', where: 'main', description: 'Click a numbered element. Likes, saves and follows are counted and stop at the daily limits. Posting a comment, publishing, sending a message and unfollowing go through at once, or ask the user first if they switched approvals on; deletes and settings changes always ask.', input: S.browser_click },
  { name: 'browser_type', title: 'Type', kind: 'write', where: 'main', description: 'Type into a numbered text field (search, comment box, caption). Typing sends nothing by itself. Never type passwords or codes.', input: S.browser_type },
  { name: 'browser_press', title: 'Press a key', kind: 'write', where: 'main', description: 'Press one key in the Instagram window.', input: S.browser_press },
  { name: 'browser_scroll', title: 'Scroll', kind: 'write', where: 'main', description: 'Scroll the Instagram window and list the new view.', input: S.browser_scroll },
  { name: 'browser_wait', title: 'Wait / watch', kind: 'read', where: 'main', description: 'Stay on the page for some seconds (this is how a reel gets watched), then list the page. A post watched for 3s or more is logged as watched.', input: S.browser_wait },
  { name: 'browser_back', title: 'Back', kind: 'write', where: 'main', description: 'Go back one page in the Instagram window.', input: S.browser_back },
  { name: 'browser_close', title: 'Close tabs', kind: 'write', where: 'main', description: 'Close the tabs Marketo opened for the account (one platform, or all when site is left out) once you are done with them, e.g. at the end of a session. The user\'s own tabs are never touched.', input: S.browser_close },
  { name: 'browser_screenshot', title: 'Screenshot', kind: 'read', where: 'main', description: 'A picture of the Instagram window, for models that can see images. Clicking still uses the numbers from browser_snapshot.', input: S.browser_screenshot },
  { name: 'save_long_video', title: 'Save long video', kind: 'write', where: 'main', description: 'Start or change a long YouTube video (5-20 min, 16:9): its title, script sections, description, tags, thumbnail words, files and status. See "Long videos" in get_overview.', input: S.save_long_video },
  { name: 'list_long_videos', title: 'Long videos', kind: 'read', where: 'main', description: 'The long videos with their status; with id, one in full.', input: S.list_long_videos },
  { name: 'narrate_long_video', title: 'Narrate long video', kind: 'export', where: 'main', description: "Buy the narration of a long video's script from ElevenLabs in the user's default voice: one MP3 per section in the video's folder, with its length. Only new or changed sections are bought. Costs ElevenLabs credits (about one per character).", input: S.narrate_long_video },
  { name: 'render_cover', title: 'Render cover', kind: 'export', where: 'renderer', description: "Make a Short / reel's cover (thumbnail): its strongest frame with 2-5 big words, 1080x1920, saved next to the video. browser_attach_reel then says how to set it on Instagram, TikTok, Facebook and YouTube. Returns the picture to check: the words must read at the size of a grid tile.", input: S.render_cover },
  { name: 'render_thumbnail', title: 'Render thumbnail', kind: 'export', where: 'renderer', description: "Draw a long video's 1280x720 YouTube thumbnail from its thumbnail_text, thumbnail_bg and thumbnail_side, and save it in its folder. Returns the picture to check.", input: S.render_thumbnail },
  { name: 'render_kip', title: 'Render Kip', kind: 'export', where: 'renderer', description: "Render Kip, the mascot, presenting each narrated section of a long video: one 720x1280 MP4 per section on a green screen (#00d800), its mouth moving with that section's narration, its moves from the section's kip field (or automatic). Put them in the edit over the footage with chroma_key on.", input: S.render_kip },
  { name: 'browser_attach_long', title: 'Attach long video', kind: 'write', where: 'main', description: "Put a long video's MP4 into YouTube Studio's upload dialog (site youtube; open Studio's Create > Upload videos first, or the hub opens it).", input: S.browser_attach_long },
  { name: 'browser_attach_reel', title: 'Attach reel', kind: 'write', where: 'main', description: "Put a rendered reel's MP4 into Instagram's Create dialog (open the dialog first; the hub then sets its crop to Original, the full vertical frame, and says so: never change it to 1:1 or 4:5), with site \"x\" into X's compose dialog (it opens it itself), with site \"tiktok\" into TikTok Studio's uploader, with site \"facebook\" into Meta Business Suite's Reels composer, with site \"threads\" into a new thread, with site \"pinterest\" into the Pin creation tool (each opens it itself), or with site \"youtube\" into YouTube Studio's upload dialog (it opens the dialog itself) to post it as a Short. Publishing still needs the user's approval on the final Share / Publish click.", input: S.browser_attach_reel },
  { name: 'browser_attach_slides', title: 'Attach slides', kind: 'write', where: 'main', description: "Put a reel's saved slides (render_slides) into a platform's composer as ONE photo post people swipe through: Instagram (a carousel; open the Create dialog first, the hub then sets the crop to Original), TikTok (a photo post, shape vertical; if its web uploader takes only video on this account the answer says so), Threads, Facebook (Meta Business Suite's post composer) and X (up to 4 pictures); those four open their composer themselves. Its answer gives the steps to post. Not for YouTube or Pinterest (one picture a Pin).", input: S.browser_attach_slides },
  { name: 'browser_attach_image', title: 'Attach image', kind: 'write', where: 'main', description: "Put an image (profile photo, Page cover, Pin image) into the page's open image picker: open the upload first (e.g. Edit profile picture > Upload photo). Only image files inside Marketo's render folder or its own folders. Saving the profile still asks the user.", input: S.browser_attach_image },
  { name: 'show', title: 'Show page', kind: 'read', where: 'main', description: 'Switch the hub to a page (and a reel in Studio) so the user sees it.', input: S.show },
];

export function annotationsFor(def: ToolDef): Record<string, boolean | string> {
  return { title: def.title, readOnlyHint: def.kind === 'read', destructiveHint: def.kind === 'destructive', idempotentHint: def.kind === 'read', openWorldHint: false };
}

/** The rules every connected AI gets, built from the brand profile. Also the top of get_overview, for apps that don't pass server instructions on. */
/** Uploading a long video through Studio; `vis` says which visibility to pick. */
const longUpload = (vis: string): string =>
  `Studio > Create > Upload videos, browser_attach_long, type the title and description, upload the thumbnail (browser_attach_image with the thumbnail's file and the ref of Studio's thumbnail upload button), "No, it's not made for kids", Next to Visibility, pick ${vis}, and wait until the dialog no longer says "Checking ..." (YouTube's copyright and policy checks, often 10 minutes or more; browser_wait and look again) before Save: saving during the checks risks a strike. The hub marks the video uploaded when Save goes through; then save_long_video with url. A long video's Save is not a Short: the Shorts limit and post gap don't apply to it.`;

/** How a long video is made, given with list_long_videos (not in every conversation's instructions). */
const LONG_VIDEO_STEPS = `Long videos (YouTube, 16:9, 5-20 min): The edit is done in Krypt Editor (its own MCP tools; the user installs it and connects it to their AI): if its tools are missing, tell the user. Steps: (1) research and save_long_video with the title (search words first, under 70 characters), sections (one per chapter: heading, the exact narration, what is on screen), description and tags. Every fact is checked first; no numbers that were not measured; tool features only from krypt_tools. Write for the ear: short sentences, one idea each, a hook in the first 15 seconds that says what the viewer gets, and the Krypt tool where it really fits (usually the last third), never a hard sell. (2) narrate_long_video (one voice, the user's default). (3) Kip presents: give each section kip moves that match its words, then render_kip. (4) Krypt Editor: set_canvas 16:9, import the section MP3s in order onto one audio track, build the picture over each (screen recordings with record_screen, the tool's bundled recording, title cards as chapters with chapter: true, key points), then, as the last step of the build, edit_track add a new video track for Kip (the newest video track draws in front of the others): each section's Kip clip at that section's start, update_clip chroma_key enabled (green #00d800, similarity about 0.38), scale about 0.55, pos_y about 0.22 (pos is in whole canvas widths/heights from the centre, so 0.5 is already the edge). Text and shapes always draw over video, so Kip goes where no card, panel or text is: bottom-left (pos_x about -0.4) while a key-points panel fills the right, bottom-right (pos_x about 0.4) otherwise. A full-screen card or panel hides him: where nothing is under it, delete its full-screen backing shape (the canvas colour shows instead) so Kip stays visible; chapter cards can cover him, which is why each clip starts after its card. Check every section with preview_frames that he is on screen. Keep it moving, never a still frame for more than a few seconds: animate_clip motion zoom-in or pan on every screen recording and picture (alternate them), add_transitions on scene changes (one family, skip_jump_cuts), entrances on cards and overlays, a short zoom on the exact setting the voice names (set_keyframes). Check it with preview_frames, export_video with loudness -14 into the video's folder, get_chapters for the description; save_long_video with project_path, video_path, the description with chapters, status edited. Check every frame of screen recordings for private data. (5) render_thumbnail (thumbnail_text: 2-5 words, one in *stars*; thumbnail_bg / thumbnail_side pictures), look at it, fix and render again until it reads at phone size. (6) Upload: ${longUpload('what the user asked (Unlisted unless they said public)')}`;

/**
 * Long-form mode (the profile runs a channel of long videos): who does what, and the steps. Krypt Editor makes the
 * video with its own tools; Marketo decides what to make and owns the packaging, the upload and the comments.
 */
function longformSteps(): string {
  const d = store.get();
  const plan = longformPlan(d.settings);
  const link = d.brand.site ? `, the link ${d.brand.site}` : '';
  return `Long-form channel: this profile runs a YouTube channel of long videos (16:9, about ${plan.length} minutes each). Who does what: Marketo (these tools) decides what video to make, and owns the title, description, tags, thumbnail, the upload and the comments. Krypt Editor (its own tools, named ${EDITOR_SERVER}) makes the video itself. When the ${EDITOR_SERVER} tools are missing, do the Marketo parts, then stop and tell the user: they install Krypt Editor (${EDITOR_URL.replace(/^https:\/\//, '')}), open it and connect it to this AI from its AI agents button.
(1) Decide from the channel, never from a guess. browser_open site youtube, then in Studio read Content (what is up, and each video's views), Analytics (which videos pull views and hold viewers; its Research tab shows what viewers search for) and Comments (what people ask for). list_long_videos has what was made already: never the same topic twice. Save each uploaded video's numbers as you read them (save_long_video with stats): the next pick leans on them. A new channel has no numbers yet: search the web for what works in the niche now, and what viewers ask that nobody answers well. Pick the one video a viewer of the channel's best would click.
(2) save_long_video with the title (search words first, under 70 characters, nothing the video does not pay off), the topic, the script as sections (heading, the exact narration, what is on screen), tags and thumbnail_text. Every fact is checked against a source you read; no numbers nobody measured. Write for the ear: short sentences, one idea each, and an opening that says in the first 15 seconds what the viewer gets.
(3) The voice: when the user has an ElevenLabs default voice (Voices page), narrate_long_video and give Krypt Editor each section's MP3 as that section's audio. When it answers that none is set, Krypt Editor speaks the script itself: leave it to it.
(4) Krypt Editor makes it (when its tools are there but build_longform is not among them, the user's Krypt Editor is too old to make long videos: do not piece one together by hand, tell the user to update Krypt Editor and stop at the script). Its list_formats, then build_longform with the sections in the format and look that fit this channel (the style and brief in its get_project are the user's own choices: follow them). Look at a few moments with preview_frames and fix what reads badly, save_project, export_video (MP4, loudness -14) into the video's folder (list_long_videos with the id names it), get_chapters. Then save_long_video with project_path, video_path, status edited and the description: two lines on what it covers with the search words in them${link}, the chapters, the picture credits. (The Editor's send_to_marketo with this video's id does the same from its side.) Check every screen recording for private data before it goes in.
(5) Thumbnail: render_thumbnail (thumbnail_text: 2-5 words, one in *stars*), or the Editor's make_thumbnail and save_long_video with thumbnail_path. Look at it and redo it until it reads at phone size and does not repeat the title.
(6) Upload: ${longUpload(`${plan.visibility === 'public' ? 'Public' : 'Unlisted'} (the user's plan; a video they asked to see first goes up Unlisted)`)}
(7) Between videos, every run: Studio's Comments. Answer real questions and comments on the channel's own videos in a line or two, the way a person types; never the same reply twice; leave spam alone; give the good ones a heart. A comment that asks for a video is an idea: keep it in mind for step 1. Nothing is pressed on youtube.com itself.
A video takes more than one run when time is short: stop after a finished step (the status keeps the place) and say in the report where it stands.`;
}

export function serverInstructions(): string {
  const b = store.get().brand;
  const krypt = isKryptBrand(b);
  const longform = isLongform(store.get().settings);
  const creator = activeCreator(b);
  const invite =(creator?.invite && cleanInvite(creator.invite)) || KRYPT_DISCORD.replace(/^https:\/\//, '');
  const brand = b.name
    ? [
        (longform ? `${b.name} is a long-form YouTube channel${b.site ? ` (${b.site})` : ''}: long videos are this profile's main work. ${b.what}` : `The reels are for ${b.name}${b.site ? ` (${b.site})` : ''}. ${b.what}`).trim(),
        b.niche ? `${longform ? 'The channel covers' : 'The account posts about'}: ${b.niche}.` : '',
        b.voice ? `Voice: ${b.voice}` : '',
        b.never ? `Never: ${b.never}` : '',
        b.disclaimer ? `Disclaimer for reels that need it: "${b.disclaimer}"` : '',
        creator
          ? [
              `Krypt creator program: this user runs these accounts as a Krypt creator. Krypt sends them 100% of the donations their videos bring in (donations are made in the Krypt Discord), and their Solana address ${creator.wallet} is their referral code for Krypto Mirror and Krypto Bot.`,
              `Their Discord invite: ${invite}. Whenever you point anyone to the Krypt Discord, use exactly this link and no other.`,
              `Captions: every Krypto Mirror or Krypto Bot reel's caption, and its text on every platform, ends with "Referral code when you set up <the tool the reel is about>: ${creator.wallet}". Reels about a donor tool (krypt_tools says donors get it through the Krypt Discord) end with "Donor access is in the Krypt Discord: ${invite}".`,
              `Messages and comments: help people who ask. To join Krypt, give the invite. To set up Krypto Bot or Krypto Mirror, give its link from krypt_tools and say to enter ${creator.wallet} as the referral code when the app asks for one; answer setup questions only from krypt_tools. The referral code and the invite are public and meant to be shared; every other wallet stays private. Still never cold-message anyone, never tell anyone they will earn, and never promise the user earnings.`,
            ].join(' ')
          : krypt
            ? `Krypt Discord: ${KRYPT_DISCORD}. Krypt creator program: not joined yet (no Solana address on the Setup page). Users who run Krypt videos keep 100% of the donations they bring in and are the referrer on Krypto Mirror and Krypto Bot; mention it to the user once if they ask how to earn from the account.`
            : '',
      ]
        .filter(Boolean)
        .join('\n')
    : 'No brand is set up yet. Ask the user what they are promoting (name, what it is, link, niche, tone, claims to avoid) and save it with set_brand before making reels. They can also fill it in on the Setup page.';
  // Always there: the catalog is part of the app, not a setting.
  const pack = `\n\nKrypt tools: the hub has a built-in catalog of every krypt.cc tool: ${kryptToolNames()}. krypt_tools with a tool's name returns everything about it (what it does in full, price, platforms, reel angles, what never to claim); read it before writing a reel about one, and never state a feature that is not in it.${krypt ? '' : ' The user can make reels about any of them.'} For a reel about one: ${KRYPT_PACK_RULES.join(' ')}${krypt ? '' : ' That content is about someone else\'s product: never speak as Krypt or imply the account is the company.'}`;
  return `Krypt Marketo is a desktop hub for making Instagram reels (also posted on X, TikTok and as YouTube Shorts) and running Instagram, X, TikTok, Facebook, Threads and Pinterest accounts. You drive it with these tools; the user watches the hub and it follows what you do.

${brand}${pack}

How to work:
- get_overview first, then get_performance (what worked, the user's feedback, learnings) and get_playbook (hook rules, caption template, checklist, product notes).${krypt ? '' : ' The built-in playbook was written for a crypto account: its rules apply to any brand; where it names Krypt products or crypto topics, use this brand profile instead.'} list_formats has the proven structures, list_presets the presets (with preset: <id>, its fields).
- Make a reel: create_reel with a format (or a preset) and the fields to change. Formats and presets come filled with example content: replace every example line and number with real, sourced content for the product the reel is about (the reddit, greentext, meme and dumb styles are made-up stories and jokes on purpose, as their style rules say; stickman, blocky-avatar, survival, what-if, cutaway, diorama and PS2 cutscene scenes are made-up, the facts, prices and numbers in them are not). preview_reel to look at frames, update_reel to fix, render_reel for the MP4. One voice per reel: new ones start with the user's voice from the Voices page, so leave the voice fields alone unless the user asks.
- "Make it like this": for a reference video the user points at (Research > Reference videos, or a file path for add_reference_video), get_reference_video, then create_reel with like: <its id> written to its timing, and note_reference_video what you saw. ${REF_RULES}
- make_hook_variants gives 2-4 openings of one reel to test; render each, they post as separate Trial Reels.
- Covers: a Short or reel gets its own cover (render_cover: its strongest frame and 2-5 big words, one *starred*) before it is posted; browser_attach_reel says how to set it on each platform.
- No frozen picture: the main picture never sits still for more than about 3 s (changing captions and slow zooms do not count). preview_reel and render_reel name any "Still picture" stretch: fix it (an action, a prop coming in, a new shot, a reveal, or split the line) before posting.
- Sound has a cause: every effect answers what made it, where, and why now (coins on the coins, a door when a door moves); real recorded sounds are line flags (coin, cash, paper, door, keys, step, glass, thud, phone...; the beats help lists them), props and actions in the drawn styles get theirs on their own, and each place gets its own quiet background sound (Place sound: auto). Save big hits (boom, impact, stinger) for the one or two moments that earn them; the voice always stays on top.
${hooksNote()}
- The platforms are used through the browser_* tools only (pages come back as numbered lines; click by number), in the user's own Chrome through the Krypt Marketo extension; list_accounts says which Chrome profile. Another browser tool would bypass the limits. Sign-ins, codes and security checks are the user's: if an account is not signed in or Chrome is not connected, tell the user.
- The hub enforces the limits: likes, saves, follows and the rest are counted and refused past the day's number, and a watch-only or paused account gets none. A refusal is final for the day. Posts, comments, messages, unfollows and reposts go out when you click unless the user switched on "Ask me before the AI posts" (then the click waits for their answer); deletes, blocks, reports and settings changes always ask. Get the text right before you click.
- ${HUMAN_RULES}
${stylesNote()}
- Sound: only story reels have a voice, sound effects and music; the list, post, stats, versus and terminal presets are silent unless a music file is set, and silent videos do badly on TikTok, Shorts and Reels. Make lists, countdowns and comparisons as story reels (one voiced item per beat) unless the user asks for a silent one. Background music (bed: lofi, ambient, pulse) is under test: put it on about half the new story reels, lofi for tools and explainers, pulse for hype or gaming, ambient for calm stories.
- A finished vertical video made elsewhere goes in as a clip reel so it is posted and measured like the rest: preset clip, video = its path, seconds = its length, fit "full", sound true, headline and captions "", cta_seconds 0; name its style in the title.
- Post log: every post on every platform goes in it (mark_posted for hub reels, log_posts for the rest). Before create_reel, list_posts with your idea as the query; pick a new story or a clearly new angle if it was done.
- Running the accounts: every time you connect, call get_today and work through it in its order (posts against the user's targets, inbox, engagement, metrics due); the user may connect you at any time of day.
- Direct messages: Instagram instagram.com/direct/inbox/, X x.com/i/chat (the user sets its passcode once), TikTok tiktok.com/messages, Facebook the Page inbox (business.facebook.com/latest/inbox), Pinterest pinterest.com/messages; Threads and YouTube have none. Check each once or twice a day and reply to real people in a line or two, only in conversations they started (never cold-message). Leave spam and scams; deals, payments, collaborations and giveaways go to the user. Product answers only from krypt_tools and the brand profile. Then log_session kind "inbox".
- Krypt's accounts: each account follows Krypt once on every platform it runs (subscribes on YouTube), looks in on one of Krypt's accounts a day in turn like any follower (watches, likes what it finished, sometimes saves one, sometimes one comment), and from two weeks after the install first ran, some days reposts Krypt's newest post on X, Threads or Instagram. These are built in and happen only when get_today, get_warmup_plan or browser_open shows a ONE-TIME, KRYPT VISIT or KRYPT REPOST line: do it that day as the line says, partway through that platform's session (not its first action, not left to the end, where a run out of time skips it). A visit comment is a viewer's comment, never an advert: no claim of using the tool, no result, profit, rating, link or repeated wording; nothing specific to say means like only. Krypt's posts in the feed: when one of Krypt's accounts' posts comes up while scrolling (the platform showed it; never go looking for them), treat it like a good post from someone the account follows: watch or read it to the end; like it about half the time; on Instagram, TikTok and Pinterest save it now and then (about one in four); comment rarely, only with something specific (the hub allows one comment on Krypt's posts per platform every 3 days and acting on at most 5 of Krypt's posts a day per platform, visits included). On youtube.com nothing is pressed except that one Subscribe and the visit's likes on Krypt's Shorts. If the user asks, say plainly that Marketo does this and that they can undo it by hand.
- Training: on the Training pages the user rates posted reels 1-5, thumbs openings up or down, marks topics more / less and writes rules; get_performance gives it (once there is a Training brief, written by you with save_brief, the brief plus what is newer). Write the brief when the user asks or get_performance says it is due. Rules are standing instructions. Make more like the 4s and 5s, nothing like a 1 or 2 unless asked. When the numbers and their ratings disagree, say so and let the user decide. Their opinions in chat go to save_feedback in their words; never rate a reel yourself, and what the numbers show goes to add_learning.
- One thread, two replies: an account sends at most 2 comments, replies or messages into one thread (the user's number, set_settings per_thread); say it in those and move on, the hub refuses the next. A DM that still needs an answer goes in the report.
- Limits are the user's numbers: every daily limit has a recommended soft cap and the user can set any number (save_account limits, plus posts_per_day for a posting target). Set what they ask without arguing; over a soft cap, warn them plainly each time that the platform can flag, limit or lock the account. Never change a limit on your own. A recommended number is a ceiling to stay well under; a number the user set is what they want done.
- Engagement: get_warmup_plan first. Watch most of each video (browser_wait), like only what you watched, vary what you do. Comments and replies are part of it when get_today's THIS RUN goal lists them: first answer comments on the account's own posts, then one short line on niche posts you watched to the end, like the comments already under them. Never a link, pitch, product name, "our tool", profit claim, generic line or repeated wording; skip giveaways, drama and politics. Saves count too (TikTok favorites, Pins saved into the account's boards). Afterwards log_session, and record_account_stats from the profile page.
- Platforms: every browser_* call names its site (instagram, x, tiktok, youtube, facebook, threads, pinterest); each has its own warm-up and limits (get_warmup_plan with site). browser_attach_reel opens the platform's uploader and its answer gives the steps to post; then mark_posted with that platform.
  X: stay far under its limits (X singles out automated likes and aggressive following; never follow in bursts). Of about 4 posts a day at most 1-2 are videos (render_reel shape "square"); the rest are text posts (one sourced take, a stat with its source, a question, a 3-5 post thread) and images (render_image, then browser_attach_image on "Add photos or video"). Never the same text twice.
  TikTok: mostly watching the For You feed (browser_wait most of each video, ArrowDown with browser_press, skip off-niche fast). Its puzzles and "verify it's you" are the user's.
  Facebook: posts as the brand's Page, never the personal profile; if the wrong one shows, ask the user to switch. No friend requests.
  Threads: signs in with the Instagram account, so its standing is Instagram's: stay well under. Video threads and short text threads; replies that add to the conversation grow it.
  Pinterest: a search engine: searchable titles and descriptions, the link on every Pin, a fitting board. Warm-up is searching the niche and saving good Pins.
  YouTube: Shorts through Studio (a vertical video of 3 minutes or less is a Short; 3 a day per channel recommended). Outside Studio only links and search, plus a Krypt visit's likes. Several channels can share one Google sign-in (save_account youtube_channel); the hub switches Studio to the account's channel itself, and those accounts take turns in the one tab: finish one upload before starting another. Never switch channels in Studio's menu.
${longform ? "- Long videos (YouTube 16:9, Create > Long videos) are this profile's main work: get_today's LONG-FORM CHANNEL part says what is due, and list_long_videos gives the steps and who does what (Krypt Editor makes the video; these tools pick it, package it, upload it and answer the comments). Reels and Shorts only where get_today shows a post target above 0." : '- Long videos (YouTube 16:9, Create > Long videos): only when the user asks or get_today says one is due. list_long_videos first: it gives the steps.'}
- Profiles: each profile is a separate set (accounts, brand, reels, post log, Training, learnings). Every tool works on the open one; never carry a rule, learning or reel from one into another. use_profile only when the user or a run's instructions name a profile; then get_overview and get_today again.
- Sending a post: after Post / Share / Publish the hub stays on the page 8-40 s so the upload finishes; don't open another page on that platform in the same step. Only a post you can see on the profile (or the Published list) is posted: check, then mark_posted or log_posts with its link. Not there after a couple of minutes: post_failed gives the slot back (at most twice a day per platform) and the report says an upload was lost.
- After a reel is live: mark_posted with its URL (trial: true for Trial Reels). From 24h on, open its Insights and record_reel_metrics; then get_performance, and add_learning for what a comparison shows.${(store.get().campaigns ?? []).some((c) => c.on) ? `\n${CAMPAIGN_RULES}` : ''}`;
}

/** In the instructions only while the user has a Content Rewards campaign on. */
const CAMPAIGN_RULES = `- Content Rewards campaigns (list_campaigns): brands pay per view for posts from the user's accounts. Make each campaign reel to its saved rules (create_reel campaign), caption starting with #ad plus its required tags, post it on the campaign's platforms with that platform's paid-partnership label (the attach answer says how), mark_posted, then submit the link on contentrewards.com (browser_open site "rewards") within 30 minutes and record_submission. A post goes to one campaign, once. Never join or leave campaigns, connect accounts, or touch money or settings there: the user does. Never ask anyone to view, like or comment on a campaign post (coordinated engagement is a permanent ban).`;

// ── Main-process handlers ──────────────────────────────────────────────────
type Handler = (args: never, ctx: MainCtx) => ToolOutcome | Promise<ToolOutcome>;
const ok = (text: string): ToolOutcome => ({ ok: true, text });

// ── Dates the AI gives ─────────────────────────────────────────────────────
/** A full ISO 8601 time with its zone ("2026-11-26T15:04:00Z", "…+01:00"): the only kind a posted time is believed in. */
const ZONED_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;
const DAY_MS = 86_400_000;
/** A time this far ahead of the hub's clock is wrong (a local time sent as UTC, say), not early. */
const AHEAD_MS = 5 * 60_000;
/** mark_posted is for a post that just went live: a time further back than this is a wrong date (older posts go through log_posts). */
const MARK_BACK_MS = 7 * DAY_MS;

/** The same date and time in this year (or the last, around New Year) lands in the last day and a half: the year is the AI's mistake. */
function wrongYear(t: number, now: number): boolean {
  const d = new Date(t);
  const y = new Date(now).getUTCFullYear();
  return [y, y - 1].some((yy) => {
    if (yy === d.getUTCFullYear()) return false;
    const c = new Date(t);
    c.setUTCFullYear(yy);
    return c.getTime() >= now - 1.5 * DAY_MS && c.getTime() <= now + AHEAD_MS;
  });
}

/**
 * A posted_at as an AI gave it, made safe for the spacing between posts (it counts from the newest posted time: a date
 * only reads as midnight UTC, a wrong year or zone as hours or months off, and the next post would go up inside the user's
 * gap). A full ISO time with its zone is kept. One in the future, with the wrong year or (with `back`) further back than
 * that becomes now, and so does anything else. `old` (log_posts: posts read off a profile): a date from before today, with
 * or without a time, stays as the page gave it, and no posted_at stays none. `fixed`: it was not used as given.
 */
function safePostedAt(v: string | undefined, o: { back?: number; old?: boolean } = {}, now = Date.now()): { at: string | undefined; fixed: boolean } {
  if (v === undefined) return { at: o.old ? undefined : new Date(now).toISOString(), fixed: false };
  const s = v.trim();
  const t = Date.parse(s);
  const fallback = { at: new Date(now).toISOString(), fixed: true };
  if (!Number.isFinite(t) || t > now + AHEAD_MS || wrongYear(t, now)) return fallback;
  if (ZONED_TIME.test(s)) return o.back !== undefined && t < now - o.back ? fallback : { at: new Date(t).toISOString(), fixed: false };
  // A date only, or a time with no zone: believable only for an older post, from a day before today.
  if (o.old && /^\d{4}-\d{2}-\d{2}/.test(s) && s.slice(0, 10) < localDate(new Date(now))) return { at: s, fixed: false };
  return fallback;
}
/** list_sessions with_items: the items shown per session (the newest). */
const SESSION_ITEMS_SHOWN = 40;

/** What the AI is told when its posted_at was not used. */
const POSTED_AT_NOTE = 'posted_at needs a full ISO time with its zone, as the hub\'s clock has it (e.g. 2026-11-26T15:04:00Z), never a date only, a guessed year or a time in the future';

/** A snapshot's `at`: any date the hub can read, as ISO (anything else, "now" say, would sort after every real time). Unreadable = now. */
const isoAt = (v: string | undefined): string | undefined => {
  if (v === undefined) return undefined;
  const t = Date.parse(v.trim());
  return Number.isFinite(t) && t <= Date.now() + AHEAD_MS ? new Date(t).toISOString() : new Date().toISOString();
};

// ── The tab an AI app is working in ────────────────────────────────────────
type SiteArg = z.infer<typeof site>;
/** Per AI app: the account and window its latest listing came from. Element numbers belong to that listing. */
const lastTab = new Map<string, { handle: string; site: NonNullable<SiteArg> }>();
/**
 * The account and window a browser tool acts on. `follow` (a click, typing, a key): a site or handle left out means the
 * tab the app last listed, so element N is the one it saw, not the same number in the active account's Instagram tab.
 */
function tabFor(ctx: MainCtx, handle: string | undefined, s: SiteArg, follow: boolean): { handle: string | undefined; site: SiteArg } {
  const last = lastTab.get(ctx.client);
  let h = handle;
  let st = s;
  if (follow && last) {
    if (h === undefined && (st === undefined || st === last.site)) h = last.handle;
    if (st === undefined && h !== undefined && sameHandle(h, last.handle)) st = last.site;
  }
  lastTab.set(ctx.client, { handle: h ?? store.get().settings.handle, site: st ?? 'instagram' });
  return { handle: h, site: st };
}

const fmtNum = (n: number | undefined): string => (n === undefined ? '—' : n.toLocaleString('en-US'));

/** The style / vote fields for create_reel and update_reel. */
function styleTag(style?: string, vote?: z.infer<typeof voteSchema>): Partial<Reel> {
  const out: Partial<Reel> = {};
  if (style !== undefined) {
    const st = styleById(style);
    if (!st) throw new Error(`No style "${style}". Styles: ${rankedStyles().map((x) => x.label).join(', ')} (krypt = main).`);
    out.style = st.id;
  }
  if (vote) {
    out.vote = { series: vote.series.trim(), part: vote.part, a: vote.a.trim(), b: vote.b.trim(), ...(vote.finale ? { finale: true } : {}) };
    // A vote story in another style that ends on a vote (the survival style's parts) keeps that style.
    if (style === undefined) out.style = 'vote';
  }
  return out;
}

/** When a reel first went out anywhere (ISO), or ''. */
function postedAt(r: Reel): string {
  const all = [r.postedAt, r.shortsPostedAt, r.xPostedAt, r.tiktokPostedAt, ...Object.values(r.links ?? {}).map((l) => l?.at)].filter((x): x is string => !!x).sort();
  return all[0] ?? '';
}

/** Whether a comment vote story has its votes counted and its next part not made yet. */
function voteWaiting(style?: string): boolean {
  const parts = store.get().reels.filter((r) => r.vote && (!style || (r.style ?? 'vote') === style));
  const series = [...new Set(parts.map((r) => r.vote!.series.toLowerCase()))];
  return series.some((key) => {
    const mine = parts.filter((r) => r.vote!.series.toLowerCase() === key).sort((x, y) => x.vote!.part - y.vote!.part || x.createdAt.localeCompare(y.createdAt));
    const v = mine[mine.length - 1].vote!;
    return !!v.winner && !v.finale;
  });
}

/** Where each comment vote story stands: what to count, what to make next. */
function voteStatus(): string {
  const d = store.get();
  const parts = d.reels.filter((r) => r.vote);
  if (!parts.length) return '';
  const series = [...new Set(parts.map((r) => r.vote!.series.toLowerCase()))];
  const lines = series.map((key) => {
    const mine = parts.filter((r) => r.vote!.series.toLowerCase() === key).sort((x, y) => x.vote!.part - y.vote!.part || x.createdAt.localeCompare(y.createdAt));
    const last = mine[mine.length - 1];
    const v = last.vote!;
    const name = `"${v.series}" part ${v.part} (${last.id})`;
    const at = postedAt(last);
    if (v.finale) return `- ${name} is the finale${at ? ': the series is finished; start a new one when the vote style is next' : `: not posted yet (${last.status})`}.`;
    if (!at) return `- ${name}: not posted yet (${last.status}). Post it on the same platforms as the last part.`;
    if (v.winner) return `- ${name}: ${v.winner.toUpperCase()} won (${v.votes?.a ?? 0}-${v.votes?.b ?? 0}: "${v[v.winner]}"). Next: make part ${v.part + 1}, opening with the result.`;
    const due = new Date(Date.parse(at) + 12 * 3600e3);
    return `- ${name}: posted ${at.slice(0, 16).replace('T', ' ')} UTC, A "${v.a}" / B "${v.b}". ${Date.now() >= due.getTime() ? 'Count its votes now (read the comments on every platform it is on), then record_votes.' : `Count its votes from ${due.toISOString().slice(0, 16).replace('T', ' ')} UTC.`}`;
  });
  return `Comment vote stories:\n${lines.join('\n')}`;
}

function reelLine(r: Reel): string {
  const t = timingFor(r.preset, r.fields);
  const res = resultOf(r);
  const metrics = res ? ` · ${fmtNum(res.m.views)} views, hold ${pct(res.hold, 0)}, score ${res.score}` : '';
  const tags = [r.style && r.style !== 'main' ? `style ${r.style}` : '', r.vote ? `vote "${r.vote.series}" part ${r.vote.part}${r.vote.finale ? ' (finale)' : ` A: ${r.vote.a} / B: ${r.vote.b}${r.vote.winner ? ` → ${r.vote.winner.toUpperCase()} won ${r.vote.votes?.a ?? 0}-${r.vote.votes?.b ?? 0}` : ''}`}` : '', r.format ? `format ${r.format}` : '', r.hookStyle ? `hook ${r.hookStyle}` : '', r.group ? `hook test ${r.group} ${r.variant}: ${r.hook ?? ''}` : '', r.trial ? 'trial' : ''].filter(Boolean).join(' · ');
  return `${r.id} · "${r.title}" · ${r.preset} · ${t.total.toFixed(1)}s · ${r.status}${tags ? ` · ${tags}` : ''}${r.renderPath ? ` · ${r.renderPath}` : ''}${r.cover?.path ? ' · cover' : ''}${r.postedUrl ? ` · ${r.postedUrl}` : ''}${r.xUrl ? ` · X: ${r.xUrl}` : ''}${r.tiktokUrl ? ` · TikTok: ${r.tiktokUrl}` : ''}${r.shortsUrl ? ` · Short: ${r.shortsUrl}` : ''}${(['facebook', 'threads', 'pinterest'] as const).map((s) => (r.links?.[s] ? ` · ${SITE_LABEL[s]}: ${r.links[s]!.url}` : '')).join('')}${metrics}`;
}

function resultLine(x: ReelResult): string {
  const m = x.m;
  return `${x.score} · "${x.reel.title}"${x.reel.format ? ` [${x.reel.format}]` : ''}${x.reel.trial ? ' (trial)' : ''} · ${fmtNum(m.views)} views, ${fmtNum(m.reach)} reach · hold ${pct(x.hold, 0)} (${m.avgWatch?.toFixed(1) ?? '—'}s of ${x.length.toFixed(0)}s) · skip ${m.skipRate === undefined ? '—' : `${m.skipRate}%`} · shares ${pct(x.shareRate)} · saves ${pct(x.saveRate)} · likes ${pct(x.likeRate)} · comments ${pct(x.commentRate)} · follows ${pct(x.followRate)} · as of ${m.at.slice(0, 10)} · hook: "${x.reel.hook ?? hookLine(x.reel)}"`;
}

function reelDetail(r: Reel): string {
  const t = timingFor(r.preset, r.fields);
  return JSON.stringify({ ...r, timing: { body_seconds: +t.body.toFixed(2), end_card_seconds: t.cta, total_seconds: +t.total.toFixed(2) } }, null, 2);
}

/** What following a reference did to a reel, and what is left for the AI. */
function likeNote(name: string, style: { fields: Fields; guide: string[] }): string {
  const set = Object.entries(style.fields).map(([k, v]) => `${k}=${v}`);
  return `\nLike "${name}": ${set.length ? `set ${set.join(', ')}` : 'nothing to set on this preset by itself'}. To match the rest:\n${style.guide.map((g) => `- ${g}`).join('\n')}\n${REF_RULES}`;
}

const withWarnings = (text: string, warnings: string[]): string => (warnings.length ? `${text}\nNotes: ${warnings.join('; ')}` : text);

/** A caption that would be refused when it is posted: said now, while it is cheap to fix. */
const captionNotes = (caption: string | undefined): string[] => {
  const p = caption ? textProblems('post', 'instagram', caption) : [];
  return p.length ? [`the caption would read as machine-written and the hub will not post it like this (${p.join('; ')}): fix it with update_reel`] : [];
};

function ytAccountNote(a: IgAccount, st?: BrowserStatus): string {
  if (!a.youtube?.enabled) return '';
  const ch = a.youtube.channelId ? `channel ${a.youtube.channelName ? `"${a.youtube.channelName}" ` : ''}(${a.youtube.channelId})` : 'channel not seen yet';
  const y = st?.youtube;
  const login = !y ? '' : y.outdated ? ', the Chrome extension needs a reload for YouTube' : y.loggedIn ? ', signed in' : `, NOT signed in to YouTube${a.browser === 'chrome' ? ' in that Chrome profile' : ''}`;
  return ` · YouTube Shorts: ${ch}${login}, ${ytUploadsToday(a)}/${ytLimit(a)} today`;
}

/** The account's X and TikTok, for list_accounts. */
function netAccountNote(a: IgAccount, st?: BrowserStatus): string {
  const d = store.get();
  return NETWORKS.map((n) => {
    const p = netOf(a, n);
    if (!p?.enabled) return '';
    const L = NETWORK_LABEL[n];
    const plan = planFor(a, d.sessions, undefined, n);
    const y = st?.[n];
    const login = !y ? '' : y.outdated ? `, the Chrome extension needs a reload for ${L}` : y.loggedIn ? `, signed in${y.signedInAs ? ` as @${y.signedInAs}` : ''}` : `, NOT signed in to ${L}${a.browser === 'chrome' ? ' in that Chrome profile' : ''}`;
    const snap = [...d.accounts].reverse().find((s) => s.site === n && sameHandle(s.handle, a.handle));
    return ` · ${L}: ${p.handle ?? 'handle not seen yet'}${login}${p.watchOnly ? ', watch-only' : ''}, warm-up day ${plan.day} (${plan.phase.name}), today ${plan.done.likes}/${plan.phase.quota.likes} likes, ${plan.done.follows}/${plan.phase.quota.follows} follows, ${plan.done.posts}/${plan.phase.quota.posts} posts${snap ? `, ${snap.followers} followers` : ''}`;
  }).join('');
}

const onNet = (site?: string): string => (site && site !== 'instagram' && site in SITE_LABEL ? ` on ${site === 'youtube' ? 'YouTube' : SITE_LABEL[site as Site]}` : '');

/** save_account: the X / TikTok settings from its flat parameters (undefined = unchanged). */
function netPatch(prev: NetProfile | undefined, on: boolean | undefined, handle: string | undefined, start: string | undefined, watch: boolean | undefined, key: Network): NetProfile | undefined {
  if (on === undefined && handle === undefined && start === undefined && watch === undefined) return undefined;
  const p: NetProfile = { enabled: false, warmupStart: localDate(), ...(prev ?? {}) };
  if (on !== undefined) {
    // Turning it on for the first time starts its warm-up today unless a date is given.
    if (on && !prev) p.warmupStart = localDate();
    p.enabled = on;
  }
  if (handle !== undefined) {
    const h = !handle.trim() ? undefined : key === 'facebook' ? handle.trim() : normalizeHandle(handle);
    if (h !== p.handle) delete p.userId;
    if (h) p.handle = h;
    else delete p.handle;
  }
  if (start !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error(`${key}_warmup_start must be YYYY-MM-DD.`);
    p.warmupStart = start;
  }
  if (watch !== undefined) p.watchOnly = watch;
  return p;
}

/** " · styles: Krypt (main), Comment vote story (vote)" for an account line. With many on, just their labels. */
function styleNote(a: IgAccount): string {
  const b = store.get().brand;
  const on = stylesOf(a)
    .map((id) => styleById(id))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const tone = on.some((x) => TONE_STYLES.includes(x.id)) ? ` · tone: ${a.tone ?? 'clean'}` : '';
  if (on.length > 6) return ` · styles (${on.length} on): ${on.map((x) => styleName(x, b).label).join(', ')}${tone}`;
  return ` · styles: ${on
    .map((x) => {
      const n = styleName(x, b);
      return `${n.name} (${n.label})`;
    })
    .join(', ')}${tone}`;
}

/** The styles the accounts run, plus any the next-run note or the queue asks for by name. */
function stylesInUse(): Set<string> {
  const d = store.get();
  const used = new Set(d.igAccounts.flatMap((a) => stylesOf(a)));
  // A style the next-run note or the queue asks for by name ("…, clipping style": the YouTube clip box on Create > Next run) gets its rules too.
  const asked = [d.nextRun?.note?.text ?? '', ...(d.nextRun?.queue ?? []).map((q) => q.text)].join(' ').toLowerCase();
  for (const x of allStyles()) if (asked.includes(`${x.id} style`)) used.add(x.id);
  return used;
}

/**
 * Whether every style in use has its rules written out in the instructions. With a few styles on, yes. With many
 * (they all start on), that text would be re-read on every turn of every run, so the rules come when they are
 * needed instead: get_today gives the due style's, list_formats gives any other's.
 */
function rulesInline(): boolean {
  const used = stylesInUse();
  return allStyles().filter((x) => x.id !== 'main' && used.has(x.id)).reduce((n, x) => n + x.rules.length, 0) <= 6000;
}

/** The channel styles part of the instructions: how to run the ones the accounts use. */
function stylesNote(): string {
  const d = store.get();
  const used = stylesInUse();
  const inline = rulesInline();
  const label = (id: string): string => {
    const x = styleById(id)!;
    const n = styleName(x, d.brand);
    return `${n.name} (${n.label})`;
  };
  const rules = rankedStyles().filter((x) => x.id !== 'main' && used.has(x.id)).map((x) => `  - ${label(x.id)}: ${x.rules}`);
  const others = rankedStyles().filter((x) => !used.has(x.id)).map((x) => label(x.id));
  return [
    `- Channel styles (the Styles page, where the user switches each one on or off; every built-in style starts on; the user can also say "run the vote style on @x"): each account line says which styles it runs, its main style first. With more than one, get_today names the style the next reel is in (from the mix the user set on the Styles page; with none set it follows the style ranking: the best-ranked styles get the most), one style per reel, and pass style to create_reel. Change an account's styles (save_account styles) only when the user asks.`,
    !rules.length ? '' : inline ? `  How to make the styles in use:\n${rules.join('\n')}` : `  How to make a style: get_today gives the rules of the style that is due. For a reel in any other style, list_formats with style: <its label> returns that style's rules and its format; read them before create_reel. Never make a styled reel from memory of another style's rules.`,
    others.length ? `  Styles the user switched off (never make these unless they ask for one): ${others.join(', ')}.` : '',
    '  The user can also have styles of their own (the Styles page, "New style"): when they ask for a new kind of video, save_style makes one from a description (delete_style removes one); it is used once an account runs it.',
  ]
    .filter(Boolean)
    .join('\n');
}

function accountLine(a: IgAccount, signedIn?: boolean, st?: BrowserStatus): string {
  const d = store.get();
  const plan = planFor(a, d.sessions);
  const snap = [...d.accounts].reverse().find((s) => (s.site ?? 'instagram') === 'instagram' && sameHandle(s.handle, a.handle));
  const active = sameHandle(d.settings.handle, a.handle) ? ' (active)' : '';
  const warm = a.status === 'warming' ? ` · warm-up day ${plan.day} (${plan.phase.name})` : '';
  // The user can pin an account to one of their Chrome profiles (Setup page); the AI only needs to know which, to tell them what to open.
  const pinned = a.browser === 'chrome' && a.chromeDir ? ` (the user picked the Chrome profile "${chromeBridge.nameOfDir(a.chromeDir) || 'one Chrome no longer has'}" for it; only that one is used, and Marketo opens it when needed)` : '';
  const where = a.browser === 'chrome' ? ` · in the user's Chrome${pinned}` : '';
  const login = signedIn === undefined ? '' : signedIn ? ' · signed in' : a.browser === 'chrome' ? ' · NOT signed in or Chrome not connected (the Accounts page shows which)' : ' · NOT signed in (the user signs in on the Accounts page)';
  if (a.instagram === false) return `${a.handle}${active}${styleNote(a)}${where} · ${a.status} · Instagram OFF (not run for this account; only the platforms below)${a.niche ? ` · ${a.niche}` : ''}${netAccountNote(a, st)}${ytAccountNote(a, st)}`;
  return `${a.handle}${active}${styleNote(a)}${where} · ${a.status}${a.watchOnly ? ' · watch-only' : ''}${warm}${login} · today ${Math.round(plan.done.minutes * 10) / 10}/${plan.budgetMinutes} min, ${plan.done.likes}/${plan.phase.quota.likes} likes, ${plan.done.follows}/${plan.phase.quota.follows} follows${snap ? ` · ${snap.followers} followers` : ''}${a.niche ? ` · ${a.niche}` : ''}${netAccountNote(a, st)}${ytAccountNote(a, st)}`;
}

/** An ElevenLabs voice's short name ("Jarnathan" for "Jarnathan - Confident and Versatile"). */
function elLabel(voice: string): string {
  const v = store.get().settings.eleven?.voices?.find((x) => `el:${x.id}` === voice);
  return v ? v.name.split(/ [-–] /)[0].trim() : voice;
}

/** hook_style as given by the AI → the reel tag (unknown names are refused with the list). */
/** A reel's Content Rewards campaign ("" clears it). */
function campaignTag(ref: string | undefined): Partial<Reel> {
  if (ref === undefined) return {};
  if (!ref.trim()) return { campaignId: undefined };
  return { campaignId: store.findCampaign(ref).id };
}

/** What a campaign reel still needs before it can be posted, and the campaign's rules. */
function campaignNote(r: Reel): string {
  const c = r.campaignId ? store.get().campaigns?.find((x) => x.id === r.campaignId) : undefined;
  if (!c) return '';
  const left = campaignProblems(r, c, undefined, null);
  return `\nCampaign "${c.title}": ${left.length ? `before posting, ${left.join('; ')}.` : 'caption is ready.'} The disclosure is the #ad caption and the platform's paid label, never text in the video.${c.banner ? ' The campaign\'s ad banner is drawn near the bottom automatically: keep captions and key action above it.' : ''}${c.rules ? `\nIts rules: ${c.rules}` : ' Its rules are not saved yet: open its page (browser_open site "rewards" url ' + c.url + ') and save_campaign them first.'}`;
}

function hookTag(id: string | undefined): Partial<Reel> {
  if (id === undefined) return {};
  const key = id.trim().toLowerCase();
  if (!key) return { hookStyle: undefined };
  if (!hookStyleById(key)) throw new Error(`Unknown hook_style "${id}". Use one of: ${HOOK_STYLE_IDS.join(', ')}.`);
  return { hookStyle: key };
}

/** Hook style test: rotate the kinds of opening on each platform until each has 2 measured posts there, then lean on the leader. */
function hookTestRows(): string {
  const d = store.get();
  const tagged = d.reels.filter((r) => hookStyleById(r.hookStyle));
  const list = HOOK_STYLES.map((h) => `${h.id} = ${h.name}`).join(', ');
  const rows: string[] = [];
  for (const site of SITES) {
    const posted = tagged.filter((r) => linkOn(r, site));
    const stats = HOOK_STYLES.map((h) => {
      const mine = posted.filter((r) => r.hookStyle === h.id);
      const measured = mine.map((r) => metricsOn(r, site).slice(-1)[0]).filter((m): m is NonNullable<typeof m> => !!m);
      const views = measured.length ? Math.round(measured.reduce((n, m) => n + (m.views ?? 0), 0) / measured.length) : null;
      return { id: h.id, posted: mine.length, measured: measured.length, views };
    });
    const testing = exploring(stats.some((x) => x.measured < 2));
    const next = testing ? [...stats].sort((x, y) => x.posted - y.posted)[0].id : [...stats].sort((x, y) => (y.views ?? 0) - (x.views ?? 0))[0].id;
    const seen = stats.filter((x) => x.posted);
    rows.push(`- ${SITE_LABEL[site]}: ${seen.length ? seen.map((x) => `${x.id} ${x.posted} posted${x.measured ? `, ${fmtNum(x.views ?? 0)} avg views (${x.measured})` : ''}`).join(' · ') : 'none posted yet'} → ${testing ? `still testing: next reel here opens in "${next}"` : `leader "${next}": use it for about 2 of 3 reels, keep testing the others in the third`}`);
  }
  return `Hook style test (every reel, hook_style; ${list}):\n${varietyText(rows.join('\n'))}\nReels made before the test have no hook style and are not counted. Views depend on the topic too: compare the same kind of reel on the same platform before saving a learning.`;
}

/** Average latest views on a platform for a set of reels, and how many have numbers there. */
function viewsOn(reels: Reel[], site: (typeof SITES)[number]): { posted: number; measured: number; views: number | null } {
  const posted = reels.filter((r) => linkOn(r, site));
  const measured = posted.map((r) => metricsOn(r, site).slice(-1)[0]).filter((m): m is NonNullable<typeof m> => !!m);
  return { posted: posted.length, measured: measured.length, views: measured.length ? Math.round(measured.reduce((n, m) => n + (m.views ?? 0), 0) / measured.length) : null };
}

/**
 * Format test: which kind of video (the channel style it was made in) gets the views on each platform, across every
 * style the accounts run. Rendered story styles against the real-footage ones (proof, pov, speed, series, screen).
 */
function formatTestRows(): string {
  const d = store.get();
  const running = [...new Set(d.igAccounts.flatMap((a) => stylesOf(a)))];
  const ids = [...new Set([...running, ...d.reels.filter((r) => r.status === 'posted').map((r) => r.style ?? 'main')])];
  if (ids.length < 2) return 'Format test: the accounts run one style only, so there is nothing to compare. The Styles page switches more on (the real-footage ones: proof, pov, speed, series, screen).';
  const name = (id: string): string => styleById(id)?.label ?? id;
  const rows: string[] = [];
  for (const site of SITES) {
    const stats = ids.map((id) => ({ id, ...viewsOn(d.reels.filter((r) => (r.style ?? 'main') === id), site) }));
    const seen = stats.filter((x) => x.posted);
    if (!seen.length) continue;
    const pool = stats.filter((x) => running.includes(x.id));
    const testing = exploring(pool.some((x) => x.measured < 3));
    const next = pool.length ? (testing ? [...pool].sort((x, y) => x.posted - y.posted)[0].id : [...pool].sort((x, y) => (y.views ?? 0) - (x.views ?? 0))[0].id) : '';
    rows.push(`- ${SITE_LABEL[site]}: ${seen.map((x) => `${name(x.id)} ${x.posted} posted${x.measured ? `, ${fmtNum(x.views ?? 0)} avg views (${x.measured})` : ''}`).join(' · ')}${next ? ` → ${testing ? `still testing: the next reel here in "${name(next)}" when the style mix allows` : `leader "${name(next)}"`}` : ''}`);
  }
  return rows.length ? `Format test (the style each reel was made in, latest views per platform):\n${varietyText(rows.join('\n'))}\nThe style mix on the Styles page decides each reel's style; when one format leads a platform clearly (3+ measured each), tell the user so they can give it a bigger share there.` : 'Format test: no posted reels with numbers yet.';
}

const LENGTHS: Array<{ id: string; max: number }> = [
  { id: 'up to 12s', max: 12.5 },
  { id: '13-18s', max: 18.5 },
  { id: '19-30s', max: 30.5 },
  { id: 'over 30s', max: Infinity },
];

/** Length test: shorter reels against longer ones, per platform (views; hold where the platform gives it). */
function lengthTestRows(): string {
  const d = store.get();
  const len = (r: Reel): number => timingFor(r.preset, r.fields).total;
  const rows: string[] = [];
  for (const site of SITES) {
    const stats = LENGTHS.map((b, i) => ({ id: b.id, ...viewsOn(d.reels.filter((r) => len(r) <= b.max && len(r) > (LENGTHS[i - 1]?.max ?? 0)), site) }));
    const seen = stats.filter((x) => x.posted);
    if (!seen.length) continue;
    rows.push(`- ${SITE_LABEL[site]}: ${seen.map((x) => `${x.id} ${x.posted} posted${x.measured ? `, ${fmtNum(x.views ?? 0)} avg views (${x.measured})` : ''}`).join(' · ')}`);
  }
  return rows.length ? `Length test (whole reel, end card included):\n${rows.join('\n')}\nMost reels so far are 20-35s; short ones (up to 18s) loop and get rewatched. Make about every other reel 18s or less until each length has 3+ measured posts on a platform.` : '';
}

/** The voices in the voice test (the default first), or [] when no test is on. */
function voiceTestPool(): string[] {
  const st = store.get().settings;
  const base = st.voice?.voice ?? '';
  const test = (st.voiceTest ?? []).filter((v) => v !== base);
  return test.length && base.startsWith('el:') ? [base, ...test] : [];
}

/** Voice test (story reels): rotate the voices on each platform until each has 3 measured posts there, then lean on the leader. */
function voiceTestRows(): string {
  const pool = voiceTestPool();
  if (!pool.length) return '';
  const d = store.get();
  // Only reels that were really voiced by that voice count (not a render that fell back to the free voice).
  const voiceOf = (r: Reel): string => (isVoiced(r.preset) && r.fields.voiceover !== false && !r.fields.voice_free ? String(r.fields.voice ?? '') : '');
  const rows: string[] = [];
  for (const site of SITES) {
    const posted = d.reels.filter((r) => pool.includes(voiceOf(r)) && linkOn(r, site));
    const stats = pool.map((v) => {
      const mine = posted.filter((r) => voiceOf(r) === v);
      const measured = mine.map((r) => metricsOn(r, site).slice(-1)[0]).filter((m): m is NonNullable<typeof m> => !!m);
      const views = measured.length ? Math.round(measured.reduce((n, m) => n + (m.views ?? 0), 0) / measured.length) : null;
      return { v, posted: mine.length, measured: measured.length, views };
    });
    const testing = exploring(stats.some((x) => x.measured < 3));
    // Ties go to the voices being tried, so the new ones are heard first.
    const next = testing ? [...stats].sort((x, y) => x.posted - y.posted || Number(x.v === pool[0]) - Number(y.v === pool[0]))[0].v : [...stats].sort((x, y) => (y.views ?? 0) - (x.views ?? 0))[0].v;
    rows.push(`- ${SITE_LABEL[site]}: ${stats.map((x) => `${elLabel(x.v)} ${x.posted} posted${x.measured ? `, ${fmtNum(x.views ?? 0)} avg views (${x.measured})` : ''}`).join(' · ')} → ${testing ? `still testing: next story reel here voiced by ${elLabel(next)} (fields.voice "${next}")` : `leader ${elLabel(next)}: use it for about 2 of 3 story reels, keep testing the others in the third`}`);
  }
  return `Voice test (story reels, field voice; the user picked these on the Voices page):\n${varietyText(rows.join('\n'))}\nOne voice per reel. Change only the voice when you can, so the comparison stays fair; compare like with like before saving a learning.`;
}

/** The narrator: what new reels start with, and the voices the user tuned and named. */
function voiceNote(): string {
  const d = store.get();
  const saved = d.voices.length ? ` Voices the user saved (set fields.voice to the name): ${d.voices.map((v) => `"${v.name}" (${describeTune(v)})`).join(', ')}.` : '';
  const el = d.settings.eleven?.voices?.length ? ` ElevenLabs is connected (the user's key): its voices are bought only when you render_reel; previews have no narration (timed from the text), so preview timing shifts a little at render. Keep spoken lines tight (about 450 characters a reel) to stay in the user's credit budget; the hub drops to a cheaper model when a day runs ahead of its share, and render_reel says when it did. A reel is never voiced by anything but its own voice: when ElevenLabs keeps failing or the month's budget is spent, render_reel stops with "Not rendered" (bought lines are kept). Then try again later in the run, and if it still fails, leave the reel unposted and end the report with NEEDS YOU; never post it with another voice or no voice. Their ElevenLabs voices: ${d.settings.eleven.voices.slice(0, 12).map((v) => `"${v.name}"${v.category === 'cloned' || v.category === 'professional' ? ' (cloned)' : ''}`).join(', ')}.` : ` ElevenLabs is not connected, so narration uses the free on-device voice. Marketo recommends ElevenLabs for more natural narration (the user's own plan and key, connected on the Voices page; only paid for when a reel is rendered). While you help the user set Marketo up, or when they ask about better voices, recommend it once and give this sign-up link, saying plainly that it is Krypt's affiliate link and Krypt may earn a commission: ${ELEVEN_SIGNUP_URL} . Do not bring it up again after that.`;
  const pool = voiceTestPool();
  const test = pool.length ? ` Voice test is on: story reels rotate fields.voice between ${pool.map((v) => `${elLabel(v)} ("${v}")`).join(', ')}, one voice per reel (ask reels add the asker's voice themselves); get_performance says which voice is next on each platform. Leave voice_speed at 1 for them.` : '';
  return `Narrator voice for new story reels: ${describeTune(d.settings.voice ?? DEFAULT_TUNE)}${d.settings.voice ? (pool.length ? ' (the user\'s default; the voice test below decides each reel\'s voice)' : ' (the user chose it on the Voices page; keep it unless they ask for another)') : ''}.${saved}${el}${test} The user hears and tunes voices on the Voices page.`;
}

const resolveAccount = (handle?: string): IgAccount => store.findAccount(handle ?? store.get().settings.handle);

/** The warm-up plan's line about the one-time follow of Krypt's account ('' when there is nothing to do, or no follow left today). */
function kryptDue(a: IgAccount, site: Site, left: { follows: number; likes: number; comments: number; minutes: number }): string {
  if (watchOnlyOn(a, site) || a.status === 'paused') return '';
  // Nothing while the platform is read-only after a human check, or in a Threads browse-only run (as in get_today).
  if ((site !== 'youtube' && humanCheckUntil(a, site)) || browser.browseOn(a, site)) return '';
  const repost = kryptRepostDue(a, site, store.get().settings.firstRunAt);
  const also = repost ? ` ${kryptRepostLine(site, repost)}.` : '';
  const ks = kryptFollowsNow(a, site, left.follows);
  const visit = kryptVisitNow(a, site, left);
  return [ks.length ? `${kryptFollowLine(site, ks)}.` : '', visit ? `${visit}.` : '', also.trim()].filter(Boolean).join(' ');
}

/** Krypt's accounts to follow there now, as many as today's follows left allow. */
function kryptFollowsNow(a: IgAccount, site: Site, followsLeft: number): ReturnType<typeof kryptFollowNow> {
  return kryptFollowNow(a, site).slice(0, site === 'youtube' ? Infinity : Math.max(0, Math.floor(followsLeft)));
}

/** The line about the visits to Krypt's accounts that are up now ('' when none is, or the day has no like or no time left for them). */
function kryptVisitNow(a: IgAccount, site: Site, left?: { likes: number; comments: number; minutes: number }): string {
  if (a.status === 'paused' || (site !== 'youtube' && watchOnlyOn(a, site))) return '';
  if (left && (left.likes < 1 || left.minutes < 2)) return '';
  const vs = kryptVisitDue(a, site);
  if (!vs.length) return '';
  // Only one visit a run may carry a comment, and only while a comment is left today.
  let commentLeft = !!left && left.comments >= 1;
  return kryptVisitsLine(
    site,
    vs.map((v) => {
      const comment = v.comment && commentLeft;
      if (comment) commentLeft = false;
      return { ...v, comment };
    }),
  );
}

const SETUP_LABEL: Record<keyof IgAccount['setup'], string> = { avatar: 'profile photo', bio: 'bio', link: 'link in bio', firstPost: 'first post' };

/** find_clips with a video: its most replayed parts (YouTube's replay graph), chapters, and which parts reels already use. */
async function youTubeParts(url: string): Promise<string> {
  const v = await clips.findYouTubeParts(url);
  const used = clips.usedClips().filter((u) => u.span?.stream === `youtube:${v.id}`);
  const usedBy = (start: number, end: number): string => {
    const u = used.find((x) => x.span && sameMoment({ stream: x.span.stream, start, end }, x.span));
    return u ? `USED (reel "${u.reel.title}") · ` : '';
  };
  const head = `## YouTube · "${v.title}" by ${v.channel} · ${clock(v.seconds)}${v.views !== null ? ` · ${v.views.toLocaleString('en-US')} views` : ''} · ${v.url}`;
  if (v.blocked) return `${head}\n${v.blocked}`;
  if (v.live) return `${head}\nIt is live right now: it can be clipped once the stream is over.`;
  const lines: string[] = [head];
  if (v.short) lines.push(`A short video: save_clip with url "${v.url}" records all of it (${Math.min(v.seconds, YT_MAX_SECONDS)} s)${v.seconds > YT_MAX_SECONDS ? `, or pass start and seconds for up to ${YT_MAX_SECONDS} s of it` : ''}.`);
  else if (v.parts.length) {
    lines.push('Most replayed parts (YouTube\'s own replay graph, 0-100: where viewers went back and watched again, measured as how far each bump rises over the graph around it), most replayed first. Each starts a few seconds before the peak; trim it in the reel.');
    v.parts.forEach((p, i) => {
      const ch = [...v.chapters].reverse().find((c) => c.start <= p.start + 2);
      lines.push(`- #${i + 1} ${usedBy(p.start, p.end)}${clock(p.start)}-${clock(p.end)} (start ${p.start}, seconds ${p.end - p.start}) · rises ${Math.round(p.rise * 100)} over the rest${ch ? ` · chapter "${ch.title}"` : ''}`);
    });
  } else lines.push(v.heat.length ? 'The replay graph has no part that stands out: viewers watch it straight through. Pick a part from the chapters or the title, or ask the user which part; save_clip records any part.' : 'YouTube shows no replay graph for this video (it appears once a video has enough views). Pick a part from the chapters or the title, or ask the user which part; save_clip records any part.');
  if (v.chapters.length) lines.push(`Chapters: ${v.chapters.map((c) => `${clock(c.start)} ${c.title}`).join(' · ')}`);
  if (used.length && !v.parts.length) lines.push(`Already used in reels: ${used.map((u) => `"${u.reel.title}" at ${clock(u.span?.start ?? 0)}`).join(', ')}.`);
  lines.push(
    '',
    `save_clip with url "${v.url}", start and seconds (one part per reel, up to ${YT_MAX_SECONDS} s; it records in real time, so keep it to the part you need plus a few seconds). Name ${v.channel} in the post caption. Skip a USED part unless the user asked for it.`,
  );
  return lines.join('\n');
}

/** AI apps that put the server's instructions in front of the model themselves. */
const SHOWS_INSTRUCTIONS = new Set(['Claude Code', 'Kip']);
/** Kip runs in whichever AI app the user has. Only Claude Code is known to show the server's instructions itself, so in the others he gets them from get_overview like any other AI. */
let kipShowsInstructions = true;
export const setKipShowsInstructions = (v: boolean): void => {
  kipShowsInstructions = v;
};

/** The AI app whose use_profile is switching the hub right now (null = the user, or a run's script). */
let switchBy: string | null = null;
export const profileSwitchBy = (): string | null => switchBy;

export const MAIN_HANDLERS: Record<string, Handler> = {
  get_overview: (_a: unknown, ctx: MainCtx) => {
    const d = store.get();
    const keys = [...new Set(d.accounts.map((a) => `${a.site ?? 'instagram'}|${a.handle}`))];
    const accounts = keys.map((key) => {
      const [site, h] = key.split('|');
      const snaps = d.accounts.filter((a) => a.handle === h && (a.site ?? 'instagram') === site);
      const last = snaps[snaps.length - 1];
      const first = snaps[0];
      return `${h}${onNet(site)}: ${fmtNum(last.followers)} followers (${last.followers - first.followers >= 0 ? '+' : ''}${last.followers - first.followers} since ${first.at.slice(0, 10)}), ${fmtNum(last.following)} following, ${fmtNum(last.posts)} posts — as of ${last.at.slice(0, 16)}`;
    });
    const by = (s: string): number => d.reels.filter((r) => r.status === s).length;
    const sum = (k: 'likes' | 'saves' | 'follows' | 'comments' | 'minutes'): number => d.sessions.reduce((n, s) => n + s[k], 0);
    const sessions = d.sessions.slice(0, 5).map((s) => `${s.startedAt.slice(0, 16)}${onNet(s.site)} ${s.kind} ${s.minutes}min (${s.niche ?? '—'}): ${s.likes} likes, ${s.saves} saves, ${s.follows} follows, ${s.comments} comments, ${s.watched} watched`);
    return ok(
      [
        // Claude Code (and Kip, when he runs in it) already has these as the server's instructions: don't send them twice.
        SHOWS_INSTRUCTIONS.has(ctx.client) && (ctx.client !== 'Kip' || kipShowsInstructions) ? '' : serverInstructions(),
        '--- Current state ---',
        versionNote(),
        profileNote(),
        `Active account: ${d.settings.handle || 'none yet'}. Output folder: ${d.settings.outputDir}. ${d.settings.fps} fps.`,
        `Accounts:\n${d.igAccounts.length ? d.igAccounts.map((a) => `- ${accountLine(a)}`).join('\n') : '- none yet (save_account, then the user signs in on the Accounts page)'}`,
        `Follower snapshots:\n${accounts.length ? accounts.map((a) => `- ${a}`).join('\n') : '- none yet (record_account_stats)'}`,
        `Reels: ${d.reels.length} (${by('draft')} draft, ${by('rendered')} rendered, ${by('posted')} posted).`,
        `Sessions: ${d.sessions.length}, ${sum('minutes')} min total — ${sum('likes')} likes, ${sum('saves')} saves, ${sum('follows')} follows, ${sum('comments')} comments.`,
        sessions.length ? `Recent sessions:\n${sessions.map((s) => `- ${s}`).join('\n')}` : '',
        voiceNote(),
        voteStatus(),
        `References: ${d.references.length}. Reference videos: ${d.refVideos.length ? d.refVideos.map((r) => `"${r.name}" (${r.id})`).join(', ') : 'none'}. Presets: ${PRESETS.map((p) => p.id).join(', ')}.`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },

  list_media: (a: z.infer<typeof S.list_media>) => {
    const name = a.kind === 'memes' ? 'Memes' : a.kind === 'campaigns' ? 'Campaigns' : a.kind === 'images' ? 'Images' : a.kind === 'footage' ? 'Footage' : a.kind === 'music' ? 'Music' : 'Backgrounds';
    if (a.kind === 'campaigns' && !mediaFolders.list('campaigns', a.query ?? '').length)
      return ok(`Nothing in the Campaigns folder (${mediaFolders.folder('campaigns')})${a.query ? ' matching that' : ''}. Campaign files (logos, footage) are downloaded by the user from the campaign page into its folder (Create > Campaigns > Folder). If a campaign needs one, put it in the report as NEEDS YOU.`);
    const dir = mediaFolders.folder(a.kind);
    const files = mediaFolders.list(a.kind, a.query ?? '');
    if (!files.length)
      return ok(
        `The ${name} folder (${dir}) has ${a.query ? 'nothing matching that' : 'nothing in it yet'}. ${a.kind === 'backgrounds' ? 'Use a built-in background (bg runner, bounce or slice), or save a part of a YouTube video the user gave with save_clip and use that.' : a.kind === 'images' ? 'find_images searches Pinterest for pictures and save_images puts the ones you pick here.' : a.kind === 'footage' || a.kind === 'music' ? 'find_archive searches the Internet Archive for public-domain films and records, and save_archive puts the one you pick here.' : 'Use the mascot (char panels), text panels or a part of a saved clip (screen panels) instead.'} The user fills it on the Styles page (Open folder) or by dropping files into ${dir}.`,
      );
    const lines = files.map((f, i) => `${i + 1}. ${f.path} (${f.type}, ${f.mb} MB)`);
    const images: Array<{ data: string; mimeType: string }> = [];
    const shown: number[] = [];
    if (a.look) {
      const from = a.offset ?? 0;
      const pics = files.map((f, i) => ({ f, i })).filter((x) => x.f.type === 'image').slice(from, from + 10);
      for (const p of pics) {
        const t = mediaFolders.thumb(p.f.path);
        if (!t) continue;
        images.push(t);
        shown.push(p.i + 1);
      }
    }
    const note = a.look ? (shown.length ? `\nPictures, in order: files ${shown.join(', ')}.` : '\n(No pictures could be shown.)') : '';
    return { ok: true, text: `${name} folder: ${dir}\n${lines.join('\n')}${note}`, images: images.length ? images : undefined };
  },
  find_archive: async (a: z.infer<typeof S.find_archive>) => {
    const list = await archive.search(a.query, a.kind, a.count ?? 10);
    if (!list.length) return ok(`Nothing in the ${a.kind === 'film' ? 'Prelinger Archives' : 'public-domain 78s'} for "${a.query}". Try plainer or older words (${a.kind === 'film' ? '"factory", "kitchen", "car", "school", "city traffic", "atom"' : '"jazz", "blues", "ragtime", "waltz", "march", "foxtrot"'}).`);
    const pics = a.kind === 'film' ? await archive.thumbs(list) : [];
    const lines = list.map((it, i) => `${i + 1}. id ${it.id} · ${it.title}${it.year ? ` (${it.year})` : ''}${it.minutes !== null ? ` · ${it.minutes} min` : ''} · ${fmtNum(it.downloads)} downloads${a.kind === 'film' && !pics[i] ? ' · (no picture)' : ''}`);
    const shown = pics.filter((x): x is { data: string; mimeType: string } => !!x);
    return {
      ok: true,
      text: `${a.kind === 'film' ? 'Public-domain films (Prelinger Archives)' : 'Public-domain 78 rpm records (1925 or earlier)'} for "${a.query}", most downloaded first${shown.length ? ', cover pictures in this order' : ''}:\n${lines.join('\n')}\nsave_archive the one that fits with its id. ${a.kind === 'film' ? 'Use a few seconds of it per cut as b-roll (old film reads as "the way it used to be", "what they told us"), never the whole film, and keep our own words and captions on top.' : "A record is a reel's music (fields.music, music_volume about 0.5 under a voice); its crackle and swing suit the meme, story and what-if styles."} Say where it came from in the post caption (the credit line save_archive gives).`,
      images: shown.length ? shown : undefined,
    };
  },

  save_archive: async (a: z.infer<typeof S.save_archive>) => {
    const r = await archive.save(a.id);
    const len = r.seconds !== null ? ` · ${Math.floor(r.seconds / 60)}:${String(r.seconds % 60).padStart(2, '0')}` : '';
    return ok(`Saved ${r.path} (${r.mb} MB${len}).\nCredit for the post caption: ${r.credit}.\nPage: ${r.page}\n${r.path.endsWith('.mp4') ? 'Use it as fields.video: a narrated reel plays it behind the lines (bg video, bg_start = the second to start at); a story screen beat or a clip reel shows from second a. Pick the seconds that match the line; cut often.' : 'Use it as fields.music (music_volume 0.4-0.6 under a voice, up to 0.9 on a wordless reel).'}`);
  },

  find_images: async (a: z.infer<typeof S.find_images>) => {
    const list = await images.search(a.query, a.count ?? 12);
    const pics = await images.thumbs(list);
    const shape = (f: images.FoundImage): string => (f.h > f.w * 1.15 ? 'upright' : f.w > f.h * 1.15 ? 'wide' : 'square');
    const lines = list.map((f, i) => `${i + 1}. id ${f.id} · ${shape(f)}${pics[i] ? '' : ' · (no preview)'}${f.alt ? ` · ${f.alt}` : ''}`);
    const shown = pics.filter((p): p is { data: string; mimeType: string } => !!p);
    return {
      ok: true,
      text: `Pinterest pictures for "${a.query}" (${list.length}), previews in this order:\n${lines.join('\n')}\nPick the ones that fit and save_images with their ids. Upright ones fill a slide; a wide one gets cropped hard. Skip any with words, logos, watermarks or a recognisable face on them. Not what you wanted: search again with other words (add the look: "dark", "film", "minimal", "aesthetic").`,
      images: shown.length ? shown : undefined,
    };
  },

  find_slideshows: async (a: z.infer<typeof S.find_slideshows>) => {
    if (a.url) {
      const s = await slideshows.read(a.url);
      const st = s.stats;
      const nums = [st.views !== undefined ? `${fmtNum(st.views)} views` : '', st.likes !== undefined ? `${fmtNum(st.likes)} likes` : '', st.comments !== undefined ? `${fmtNum(st.comments)} comments` : '', st.saves !== undefined ? `${fmtNum(st.saves)} saves` : '', st.shares !== undefined ? `${fmtNum(st.shares)} shares` : ''].filter(Boolean).join(', ');
      return {
        ok: true,
        text: `@${s.author}: ${s.count} slides${nums ? ` · ${nums}` : ''}${s.music ? ` · sound: ${s.music}` : ''}\nCaption: ${s.caption || '(none)'}\n${s.slides.length ? `Its slides below, in order${s.slides.length < s.count ? ` (the first ${s.slides.length})` : ''}.` : '(Its slides would not load.)'} Note what makes it work: the hook on slide 1, what each slide adds, how many words a slide, where the words sit, the look of the pictures, how it ends. Then make ours with that shape (format slides-photo): our own words, pictures from find_images, our topic. add_references keeps the link and what you saw.`,
        images: s.slides.length ? s.slides : undefined,
      };
    }
    if (!a.query) throw new Error('Pass query ("@creator") to list a creator\'s slideshows, or url (one photo post) to study it.');
    const list = await slideshows.search(a.query, a.count ?? 12);
    const line = (p: slideshows.FoundSlideshow): string => [p.url, p.slides ? `${p.slides} slides` : '', p.likes !== undefined ? `${fmtNum(p.likes)} likes` : '', p.views !== undefined ? `${fmtNum(p.views)} views` : '', p.saves !== undefined ? `${fmtNum(p.saves)} saves` : '', p.text].filter(Boolean).join(' · ');
    return ok(`TikTok photo slideshows for "${a.query}" (${list.length}), most liked first:\n${list.map((p, i) => `${i + 1}. ${line(p)}`).join('\n')}\nfind_slideshows with url: <one of these> shows its slides. Study two or three of the most liked before writing ours.`);
  },

  save_images: async (a: z.infer<typeof S.save_images>) => {
    const r = await images.save(a.ids, a.folder);
    const parts: string[] = [];
    if (r.saved.length) parts.push(`Saved ${r.saved.length} picture${r.saved.length === 1 ? '' : 's'}:\n${r.saved.map((s, i) => `${i + 1}. ${s.path} (${s.w}x${s.h})`).join('\n')}`);
    if (r.missing.length) parts.push(`Not from a search in this run of the hub (find_images again): ${r.missing.join(', ')}.`);
    if (r.failed.length) parts.push(`Would not download: ${r.failed.join(', ')}. Pick others.`);
    if (!r.saved.length) throw new Error(parts.join('\n'));
    parts.push('Use each as a photo slide (preset slides, beats: seconds | the words on it | photo | <path> | a smaller line | | flags). These are other people\'s pictures: every one gets our own words and at least one change (a crop "@x,y,w,h" after the path, flip, warm / cool / bw, grain, dim) so the slide is ours, and never a picture with a watermark, a logo or a recognisable person.');
    return ok(parts.join('\n'));
  },

  list_formats: (a: z.infer<typeof S.list_formats>) => {
    const tail = 'create_reel with format: <id> starts from one. Every number in a format is an example (the dateline says so): replace them all with real data before rendering.';
    if (!a.style?.trim()) return ok(`${FORMATS.map(formatSummary).join('\n\n')}\n\n${tail}`);
    const st = styleById(a.style);
    if (!st) throw new Error(`No style "${a.style}". Styles: ${rankedStyles().map((x) => x.label).join(', ')} (krypt = main).`);
    const n = styleName(st, store.get().brand);
    // The style's own format, plus the others made for it (their ids start with the same word: blox-rant, blox-skit…).
    const stem = st.format?.split('-')[0];
    const mine = FORMATS.filter((f) => f.id === st.format || (!!stem && stem.length > 3 && f.id.startsWith(`${stem}-`)));
    return ok([`${n.name} (${n.label}): ${st.about}`, `How to make it: ${st.id === 'main' ? 'the main style: everything in the instructions describes it.' : st.rules}`, mine.length ? `Its format${mine.length > 1 ? 's' : ''}:\n\n${mine.map(formatSummary).join('\n\n')}\n\n${tail}` : 'It has no format of its own: start from a preset (list_presets) as its rules say.', 'Pass style to create_reel so the reel is counted in this style.'].join('\n\n'));
  },

  list_presets: (a: { preset?: string }) => {
    if (!a.preset) return ok(`${PRESETS.map((p) => `${p.id}: ${p.tagline}`).join('\n')}\n\nlist_presets with preset: <id> gives its fields.`);
    const p = presetById(a.preset);
    if (!p) throw new Error(`Unknown preset "${a.preset}". Presets: ${PRESETS.map((x) => x.id).join(', ')}.`);
    return ok(`${presetSummary(p)}\n\n"lines" fields: one entry per line, columns separated by " | ".${isVoiced(p.id) ? `\n\n${voiceNote()}` : ''}`);
  },

  list_reels: (a: z.infer<typeof S.list_reels>) => {
    const reels = store
      .get()
      .reels.filter((r) => !a.status || r.status === a.status)
      .sort((x, y) => (y.createdAt ?? '').localeCompare(x.createdAt ?? ''));
    if (!reels.length) return ok(a.status ? `No ${a.status} reels.` : 'No reels yet. create_reel makes one.');
    // Newest first, a page at a time: a hub used for months has hundreds, too many for one answer.
    const from = a.offset ?? 0;
    const page = reels.slice(from, from + (a.limit ?? 40));
    const older = reels.length - from - page.length;
    return ok(`${page.length ? page.map(reelLine).join('\n') : `Nothing past the first ${reels.length}.`}${older > 0 ? `\n(${older} older reel${older === 1 ? '' : 's'} not shown: list_reels with offset ${from + page.length} for the next ones.)` : ''}`);
  },

  get_reel: (a: z.infer<typeof S.get_reel>) => ok(reelDetail(store.findReel(a.id))),

  create_reel: (a: z.infer<typeof S.create_reel>, ctx) => {
    if (!a.preset && !a.format) throw new Error('Pass a format (list_formats) or a preset (list_presets).');
    const ref = a.like ? store.findRefVideo(a.like) : null;
    const presetId = (a.format ? formatById(a.format)?.preset : undefined) ?? a.preset ?? '';
    const style = ref ? styleFor(presetId, ref.profile) : null;
    // The reference sets the look and pace; anything passed explicitly still wins.
    // A stream clip is just the clip: no end card or logo unless the AI was told to add them (and passes them).
    const streamClip = presetId === 'clip' && (a.style === 'clipping' || !!String(a.fields?.source ?? '').trim() || a.fields?.fit === 'split');
    const clipDefaults: Fields = streamClip ? { cta: '', cta_sub: '', cta_seconds: 0, logo: 'none', disclaimer: '' } : {};
    const { reel, warnings } = store.createReel(a.preset ?? '', a.title, { ...clipDefaults, ...(style?.fields ?? {}), ...(a.fields ?? {}) }, a.format);
    let r = reel;
    const tag: Partial<Reel> = { ...styleTag(a.style, a.vote), ...hookTag(a.hook_style), ...campaignTag(a.campaign) };
    if (a.caption !== undefined || a.hashtags || ref || Object.keys(tag).length) r = store.updateReel(reel.id, { caption: a.caption ?? reel.caption, hashtags: a.hashtags, ...(ref ? { like: ref.id } : {}), ...tag }).reel;
    ctx.focus({ page: 'studio', reelId: r.id });
    const fmt = a.format ? formatById(a.format) : undefined;
    const guide = fmt ? `\nFormat "${fmt.name}": ${fmt.structure.map((s, i) => `${i + 1}. ${s}`).join(' ')}\n${String(fmt.fields.kicker ?? '').includes('EXAMPLE') ? 'The beats hold example numbers and the dateline says EXAMPLE DATA: replace both with real data (update_reel) before rendering.' : 'The beats are an example: write your own story into them (update_reel) before rendering.'}` : '';
    const like = similarPosts([r.title, a.caption ?? ''].join(' '), store.get().posts.filter((p) => p.reelId !== r.id));
    const repeat = like.length ? `\nPast posts that look like this story (post log). Make sure this one is a new angle, or change it:\n${like.map((p) => `- ${postLine(p)}`).join('\n')}` : '';
    return ok(withWarnings(`Created ${reelLine(r)}. Open in Studio. preview_reel to check it.${guide}${ref && style ? likeNote(ref.name, style) : ''}${repeat}${campaignNote(r)}`, [...warnings, ...captionNotes(a.caption)]));
  },

  update_reel: (a: z.infer<typeof S.update_reel>, ctx) => {
    const patch: Partial<Reel> = {};
    if (a.title !== undefined) patch.title = a.title;
    if (a.preset !== undefined) patch.preset = a.preset;
    if (a.fields !== undefined) patch.fields = a.fields;
    if (a.caption !== undefined) patch.caption = a.caption;
    if (a.hashtags !== undefined) patch.hashtags = a.hashtags;
    Object.assign(patch, styleTag(a.style, a.vote), hookTag(a.hook_style));
    if (a.campaign !== undefined) {
      // Nothing about a campaign is in the video, so a rendered reel stays rendered.
      Object.assign(patch, campaignTag(a.campaign));
    }
    const ref = a.like ? store.findRefVideo(a.like) : null;
    const style = ref ? styleFor(a.preset ?? store.findReel(a.id).preset, ref.profile) : null;
    if (ref && style) {
      patch.fields = { ...style.fields, ...(a.fields ?? {}) };
      patch.like = ref.id;
    }
    const { reel, warnings } = store.updateReel(a.id, patch);
    ctx.focus({ page: 'studio', reelId: reel.id });
    return ok(withWarnings(`Updated ${reelLine(reel)}.${ref && style ? likeNote(ref.name, style) : ''}${a.campaign !== undefined || a.caption !== undefined || a.hashtags ? campaignNote(reel) : ''}`, [...warnings, ...captionNotes(a.caption)]));
  },

  list_campaigns: () => {
    const d = store.get();
    const list = d.campaigns ?? [];
    if (!list.length) return ok(`No Content Rewards campaigns yet. The user signs up and joins campaigns on contentrewards.com, then adds them on Create > Campaigns.`);
    const handleOf = (id: string): string => d.igAccounts.find((x) => x.id === id)?.handle ?? id;
    const subs = store.submissions();
    const out = list.map((c) => {
      const target = c.on && !c.test ? c.perDay * c.accounts.length : 0;
      const left = Math.max(0, target - madeToday(d.reels, c));
      return `${campaignLine(c, c.accounts.map(handleOf))}${target ? `\n  reels to make today: ${left} of ${target}` : ''}${c.rules ? `\n  rules: ${c.rules}` : ''}`;
    });
    const recent = subs.slice(0, 15).map((s) => `- ${submissionLine(s, list.find((c) => c.id === s.campaignId), handleOf(s.accountId))}`);
    return ok(`${out.join('\n')}${recent.length ? `\n\nSubmissions (newest first):\n${recent.join('\n')}` : '\n\nNo submissions yet.'}\n\nMake a campaign reel with create_reel campaign: <id>; after mark_posted, submit its link within 30 min. Statuses: read ${REWARDS_SUBMISSIONS} (site "rewards") and record_submission what changed.`);
  },

  save_campaign: async (a: z.infer<typeof S.save_campaign>) => {
    const existing = (() => {
      try {
        return store.findCampaign(a.campaign);
      } catch {
        return null;
      }
    })();
    const c = store.saveCampaign({ ...(existing ? { id: existing.id } : { url: a.campaign }), title: a.title, brand: a.brand, platforms: a.platforms, pay: a.pay, rules: a.rules, hashtags: a.hashtags, mentions: a.mentions, links: a.links, sources: a.sources });
    const handles = c.accounts.map((id) => store.get().igAccounts.find((x) => x.id === id)?.handle ?? id);
    let banner = '';
    if (a.banner !== undefined) {
      try {
        const b = await setBanner(c.id, a.banner);
        banner = b.path ? `\nBanner saved (${b.path}): every reel for this campaign draws it near the bottom${b.redo ? `; ${b.redo} rendered reel(s) went back to draft, render them again` : ''}.` : '\nBanner removed.';
      } catch (e) {
        banner = `\nBANNER NOT SAVED: ${(e as Error).message}`;
      }
    }
    return ok(`Saved: ${campaignLine(c, handles)}${banner}${c.accounts.length ? '' : '\nThe user picks which accounts make reels for it on Create > Campaigns.'}`);
  },

  record_submission: (a: z.infer<typeof S.record_submission>) => {
    const s = store.updateSubmission(a.id, { status: a.status, note: a.note });
    return ok(`Recorded: ${submissionLine(s, store.get().campaigns?.find((c) => c.id === s.campaignId), store.get().igAccounts.find((x) => x.id === s.accountId)?.handle ?? '')}`);
  },

  duplicate_reel: (a: z.infer<typeof S.duplicate_reel>, ctx) => {
    const r = store.duplicateReel(a.id);
    ctx.focus({ page: 'studio', reelId: r.id });
    return ok(`Duplicated as ${reelLine(r)}.`);
  },

  make_hook_variants: (a: z.infer<typeof S.make_hook_variants>, ctx) => {
    const { original, created, warnings } = store.makeVariants(
      a.id,
      a.variants.map((v) => ({ hook: v.hook, firstBeat: v.first_beat, fields: v.fields })),
      a.original_hook,
    );
    ctx.focus({ page: 'studio', reelId: created[0]?.id ?? original.id });
    return ok(withWarnings(`Hook test ${original.group}:\n${[original, ...created].map((r) => `- ${r.variant}: ${reelLine(r)}`).join('\n')}\npreview_reel and render_reel each one. They post as separate Trial Reels; record_reel_metrics on each, then get_performance compares them.`, warnings));
  },

  delete_reel: async (a: z.infer<typeof S.delete_reel>) => {
    const r = store.findReel(a.id);
    const res = await removeReels([a.id], a.delete_file === true);
    const file = !r.renderPath ? '' : res.trashed ? ` Its video went to the Recycle Bin.` : res.failed.length ? ` Its video could not be moved and is still at ${r.renderPath}.` : ` The file ${r.renderPath} is still on disk.`;
    return ok(`Deleted "${r.title}".${file}`);
  },

  mark_posted: (a: z.infer<typeof S.mark_posted>, ctx) => {
    const host = (() => {
      try {
        return new URL(a.url).hostname;
      } catch {
        return '';
      }
    })();
    const platform: Site =
      a.platform ?? (/(^|\.)(youtube\.com|youtu\.be)$/i.test(host) ? 'youtube' : /(^|\.)(x|twitter)\.com$/i.test(host) ? 'x' : /(^|\.)tiktok\.com$/i.test(host) ? 'tiktok' : /(^|\.)(facebook\.com|fb\.watch)$/i.test(host) ? 'facebook' : /(^|\.)threads\.(com|net)$/i.test(host) ? 'threads' : /(^|\.)(pinterest\.[a-z.]+|pin\.it)$/i.test(host) ? 'pinterest' : 'instagram');
    const when = safePostedAt(a.posted_at, { back: MARK_BACK_MS });
    const at = when.at!;
    const fixedNote = when.fixed ? `\n(posted_at "${a.posted_at}" was not used, so it is recorded as posted now: ${POSTED_AT_NOTE}, and no more than 7 days back.)` : '';
    const by = store.findAccount(a.handle ?? store.get().settings.handle).handle;
    const split = seriesProblem(store.get().reels, store.get().posts, store.findReel(a.id), platform, by);
    const splitNote = split ? `
SERIES SPLIT: ${split} It is live now, so it is recorded; tell the user, and delete it from ${SITE_LABEL[platform]} only if they say so.` : '';
    const extra: Partial<Reel> = { ...(platform === 'instagram' && a.trial !== undefined ? { trial: a.trial } : {}), ...(a.caption !== undefined ? { caption: a.caption } : {}) };
    const { reel, submission: sub } = store.markPosted(a.id, platform, a.url, at, by, extra, a.kind ?? 'video');
    ctx.focus({ page: 'library', reelId: reel.id });
    if (!sub) return ok(`Marked posted: ${reelLine(reel)}.${fixedNote}${splitNote}`);
    const c = store.findCampaign(sub.campaignId);
    const mins = Math.max(0, Math.round((Date.parse(sub.deadline) - Date.now()) / 60_000));
    return ok(
      `Marked posted: ${reelLine(reel)}.\nNOW, before anything else (${mins} min left; Content Rewards refuses it after 30 min from posting): submit it to "${c.title}". browser_open with handle "${by}", site "rewards" and url "${c.url}", press its "Submit clip" button, pick this ${SITE_LABEL[platform]} account if asked, paste ${a.url}, send it, check it shows as pending, then record_submission id "${sub.id}" status "submitted" (or "missed" with a note if it won't take it). A post goes to one campaign only, once.${fixedNote}${splitNote}`,
    );
  },

  find_clips: async (a: z.infer<typeof S.find_clips>) => {
    const videoUrl = a.video ?? (a.streamer && parseYouTube(a.streamer) ? a.streamer : undefined);
    if (videoUrl) return ok(await youTubeParts(videoUrl));
    const acct = resolveAccount(a.handle);
    let sources: ClipSource[];
    if (a.streamer) {
      const one = parseClipSource(a.streamer, a.site);
      if (!one) throw new Error(`"${a.streamer}" is not a Twitch or Kick channel. Give "kick.com/name" or "twitch.tv/name", or a name with site.`);
      sources = [one];
    } else sources = acct.clipping?.sources ?? [];
    if (!sources.length) throw new Error(`${acct.handle} has no streamers to clip. The user adds them on the Styles page (Stream clips), or pass streamer.`);
    const range = a.range ?? acct.clipping?.range ?? 'day';
    // Clips a reel in the open profile already uses, and where they sit in their streams: several people clip the
    // same moment, so a different clip of a used moment is used too (shared/clipping.ts sameMoment).
    const usedList = clips.usedClips();
    const used = new Set(usedList.map((u) => u.key));
    const seen: Array<{ n: number; span: MomentSpan }> = [];
    let n = 0;
    const out: string[] = [];
    for (const s of sources) {
      const head = `## ${CLIP_SITE_LABEL[s.site]} ${s.channel} · ${CLIP_RANGE_LABEL[range].toLowerCase()}`;
      try {
        const list = await clips.findClips(s, range);
        if (!list.length) {
          out.push(head, '- no clips in that range');
          continue;
        }
        out.push(head);
        for (const c of list) {
          n++;
          const span = c.moment ? spanOf(c.moment, 0, c.seconds ?? 30) : null;
          const usedBy = span ? usedList.find((u) => u.span && sameMoment(span, u.span)) : undefined;
          const twin = span ? seen.find((x) => sameMoment(span, x.span)) : undefined;
          const tag = used.has(clipKey(c.url) ?? '') ? 'USED · ' : usedBy ? `USED (same moment as reel "${usedBy.reel.title}") · ` : twin ? `SAME MOMENT as #${twin.n} · ` : '';
          if (span && !twin) seen.push({ n, span });
          out.push(`- #${n} ${tag}${c.title || '(no title)'} · ${c.seconds !== null ? `${c.seconds}s` : '?s'} · ${c.views !== null ? `${c.views.toLocaleString('en-US')} views` : 'views ?'}${c.age ? ` · ${c.age}` : ''} · ${c.url}`);
        }
      } catch (e) {
        out.push(head, `- could not read it: ${(e as Error).message}`);
      }
    }
    return ok(
      `Top clips by views, best first. USED = a reel already uses it or the same moment; SAME MOMENT as #n = another clip of that moment (one reel per moment: pick one of them).\n${out.join('\n')}\n\nsave_clip the best unused one with a moment worth watching in 8-60s. save_clip also checks what the clip says against the clips already used.`,
    );
  },
  record_votes: (a: z.infer<typeof S.record_votes>) => {
    const r = store.findReel(a.id);
    if (!r.vote) throw new Error(`${r.id} is not a vote story part (create_reel / update_reel with vote sets one).`);
    if (r.vote.finale) throw new Error(`${r.id} is the finale of "${r.vote.series}": it has no vote.`);
    if (!postedAt(r)) throw new Error(`${r.id} is not posted yet, so it has no votes.`);
    if (a.a !== a.b && a.winner && a.winner !== (a.a > a.b ? 'a' : 'b')) throw new Error('The winner is the option with more votes; pass winner only for a tie.');
    const winner: 'a' | 'b' = a.a > a.b ? 'a' : a.b > a.a ? 'b' : (a.winner ?? 'a');
    const vote: VoteStory = { ...r.vote, votes: { a: a.a, b: a.b, at: new Date().toISOString() }, winner };
    store.updateReel(r.id, { vote });
    const tie = a.a === a.b ? (a.a ? ' (a tie, broken by your pick: say so in the next part)' : ' (no votes: say in the next part that nobody voted, so the story chose)') : '';
    return ok(`"${vote.series}" part ${vote.part}: A ${a.a} · B ${a.b} → ${winner.toUpperCase()} (${vote[winner]})${tie}. Make part ${vote.part + 1} now: open with "You picked ${winner.toUpperCase()}" and what happened, then the next choice; post it where part ${vote.part} is.`);
  },

  record_reel_metrics: (a: z.infer<typeof S.record_reel_metrics>) => {
    const r = store.findReel(a.id);
    const { id, at, avg_watch_seconds, skip_rate, platform, ...m } = a;
    if (platform && !linkOn(r, platform)) throw new Error(`${r.id} is not marked posted on ${SITE_LABEL[platform]}: mark_posted it there first.`);
    const snap = { ...m, ...(avg_watch_seconds !== undefined ? { avgWatch: avg_watch_seconds } : {}), ...(skip_rate !== undefined ? { skipRate: skip_rate } : {}), ...(platform && platform !== 'instagram' ? { site: platform } : {}), at: isoAt(at) ?? new Date().toISOString() };
    const { reel } = store.updateReel(id, { metrics: [...(r.metrics ?? []), snap] });
    return ok(`Recorded ${SITE_LABEL[platform ?? 'instagram']} metrics: ${reelLine(reel)}.`);
  },

  get_performance: (a: z.infer<typeof S.get_performance>, ctx) => {
    const d = store.get();
    const results = d.reels.map((r) => resultOf(r)).filter((x): x is ReelResult => !!x).sort((x, y) => y.score - x.score);
    const posted = d.reels.filter((r) => r.status === 'posted');
    const lines: string[] = [];
    lines.push(`Posted: ${posted.length} reel(s), ${results.length} with metrics. Score 0-100 weighs hold (avg watch / length) 30, shares 20, follows 15, saves 10, likes 10, skip 10, comments 5 (rates per reach). It compares our own reels; it is not an Instagram number.`);
    const missing = posted.filter((r) => !r.metrics?.length);
    // The newest few: the list only grows on an install where numbers are not read back.
    const MISSING_SHOWN = 15;
    if (missing.length) lines.push(`No metrics yet: ${missing.slice(0, MISSING_SHOWN).map((r) => `${r.id} "${r.title}" ${r.postedUrl ?? ''}`).join('; ')}${missing.length > MISSING_SHOWN ? ` (+${missing.length - MISSING_SHOWN} older ones not shown)` : ''}`);
    if (results.length) lines.push(`Ranked:\n${results.slice(0, a.limit ?? 30).map((x) => `- ${resultLine(x)}`).join('\n')}`);
    const groups = hookGroups(d.reels);
    if (groups.length)
      lines.push(
        `Hook tests:\n${groups
          .map((g) => {
            const measured = g.reels.filter((x) => x.result);
            const lead = measured.length >= 2 ? ` · leader: ${measured[0].reel.variant}` : measured.length ? ' · waiting on the other versions' : ' · no metrics yet';
            return `- ${g.group}${lead}\n${g.reels.map((x) => `  ${x.reel.variant} "${x.reel.hook ?? hookLine(x.reel)}" · ${x.reel.status}${x.result ? ` · score ${x.result.score}, hold ${pct(x.result.hold, 0)}, skip ${x.result.skip ?? '—'}%, ${fmtNum(x.result.m.views)} views` : ''}`).join('\n')}`;
          })
          .join('\n')}`,
      );
    // Background music test: reels with a bed vs without (story reels only).
    const story = results.filter((x) => x.reel.preset === 'story');
    const withBed = story.filter((x) => x.reel.fields.bed && x.reel.fields.bed !== 'none');
    const without = story.filter((x) => !x.reel.fields.bed || x.reel.fields.bed === 'none');
    const avg = (xs: ReelResult[], f: (x: ReelResult) => number | null): string => {
      const v = xs.map(f).filter((n): n is number => n !== null);
      return v.length ? (v.reduce((a2, b2) => a2 + b2, 0) / v.length).toFixed(2) : '—';
    };
    if (withBed.length || story.some((x) => x.reel.fields.bed))
      lines.push(`Background music test (story reels with metrics): with music ${withBed.length} (avg score ${avg(withBed, (x) => x.score)}, avg hold ${avg(withBed, (x) => x.hold)}; styles ${[...new Set(withBed.map((x) => String(x.reel.fields.bed)))].join(', ') || '—'}) vs without ${without.length} (avg score ${avg(without, (x) => x.score)}, avg hold ${avg(without, (x) => x.hold)}). Keep putting music on about half the reels until each side has 5+.`);
    const byFormat = new Map<string, ReelResult[]>();
    for (const x of results) {
      const k = x.reel.format ?? x.reel.preset;
      byFormat.set(k, [...(byFormat.get(k) ?? []), x]);
    }
    if (byFormat.size > 1) lines.push(`By format: ${[...byFormat.entries()].map(([k, xs]) => `${k} avg score ${Math.round(xs.reduce((n, x) => n + x.score, 0) / xs.length)} (${xs.length})`).join(' · ')}`);
    // Every platform's own numbers (the score above is Instagram only).
    const perSite: string[] = [];
    for (const site of SITES) {
      const rows = d.reels
        .map((r) => ({ r, m: metricsOn(r, site).slice(-1)[0] }))
        .filter((x): x is { r: (typeof d.reels)[number]; m: NonNullable<typeof x.m> } => !!x.m)
        .sort((x, y) => (y.m.views ?? 0) - (x.m.views ?? 0));
      const live = d.reels.filter((r) => linkOn(r, site)).length;
      if (!rows.length && !live) continue;
      const avgViews = rows.length ? Math.round(rows.reduce((n, x) => n + (x.m.views ?? 0), 0) / rows.length) : 0;
      perSite.push(`${SITE_LABEL[site]}: ${live} posted, ${rows.length} measured${rows.length ? `, avg ${fmtNum(avgViews)} views` : ''}${rows.slice(0, 6).map((x) => `\n  - ${x.r.id} "${x.r.title}" · ${x.r.format ?? x.r.preset}${x.r.preset === 'story' ? ` · art ${String(x.r.fields.art || 'flat')}` : ''}${x.r.fields.bed && x.r.fields.bed !== 'none' ? ` · music ${x.r.fields.bed}` : ''} · ${fmtNum(x.m.views ?? 0)} views, ${x.m.likes ?? 0} likes, ${x.m.comments ?? 0} comments, ${x.m.shares ?? 0} shares${x.m.avgWatch !== undefined ? `, ${x.m.avgWatch}s avg watch` : ''} (${x.m.at.slice(0, 10)})`).join('')}`);
    }
    if (perSite.length) lines.push(`By platform (latest numbers on each):\n${perSite.join('\n')}`);
    // Art style test (story reels): rotate the styles on each platform until each has 3 measured posts, then lean on the leader.
    const artOfReel = (r: (typeof d.reels)[number]): string => (r.preset === 'story' ? String(r.fields.art || 'flat') : '');
    const artRows: string[] = [];
    for (const site of SITES) {
      const posted = d.reels.filter((r) => artOfReel(r) && linkOn(r, site));
      if (!posted.length) continue;
      const stats = ARTS.map((art) => {
        const mine = posted.filter((r) => artOfReel(r) === art);
        const measured = mine.map((r) => metricsOn(r, site).slice(-1)[0]).filter((m): m is NonNullable<typeof m> => !!m);
        const views = measured.length ? Math.round(measured.reduce((n, m) => n + (m.views ?? 0), 0) / measured.length) : null;
        return { art, posted: mine.length, measured: measured.length, views };
      });
      const testing = exploring(stats.some((x) => x.measured < 3));
      const next = testing ? [...stats].sort((x, y) => x.posted - y.posted)[0].art : [...stats].sort((x, y) => (y.views ?? 0) - (x.views ?? 0))[0].art;
      artRows.push(`- ${SITE_LABEL[site]}: ${stats.map((x) => `${x.art} ${x.posted} posted${x.measured ? `, ${fmtNum(x.views ?? 0)} avg views (${x.measured})` : ''}`).join(' · ')} → ${testing ? `still testing: next story reel here in "${next}"` : `leader "${next}": use it for about 2 of 3 story reels, keep testing the others in the third`}`);
    }
    lines.push(
      artRows.length
        ? `Art style test (story reels, field art):\n${varietyText(artRows.join('\n'))}\nCompare like with like (same kind of story, same platform) before saving a learning.`
        : `Art style test: no story reels posted yet with an art style. Story reels rotate art = ${ARTS.join(' / ')} on each platform until each has 3 measured posts there; then the leader gets about 2 of 3.`,
    );
    lines.push(hookTestRows());
    lines.push(formatTestRows());
    const lt = lengthTestRows();
    if (lt) lines.push(lt);
    const vt = voiceTestRows();
    if (vt) lines.push(vt);
    // With a Training brief, the page stands in for the single ratings and learnings it was written from.
    const brief = briefText(d, a.full);
    if (brief) lines.push(brief);
    lines.push(trainingText(d, a.full));
    lines.push(lessonsText(d, a.full));
    ctx.focus({ page: 'results' });
    return ok(lines.join('\n'));
  },

  save_brief: (a: z.infer<typeof S.save_brief>, ctx) => {
    const had = !!store.get().training?.brief;
    const b = store.saveBrief(a.text);
    ctx.focus({ page: 'train-notes' });
    return ok(`${had ? 'Rewrote' : 'Wrote'} the Training brief (${b.text.split(/\s+/).length} words). The user reads it at the top of the hub's Training pages, and get_performance now gives it in place of the single ratings and learnings it covers.`);
  },

  delete_learning: (a: z.infer<typeof S.delete_learning>) => {
    const l = store.get().learnings.find((x) => x.id === a.id);
    if (!l) throw new Error(`No learning "${a.id}". get_performance lists them.`);
    store.deleteLearning(a.id);
    return ok(`Deleted learning: ${l.text}`);
  },

  save_feedback: (a: z.infer<typeof S.save_feedback>, ctx) => {
    const done: string[] = [];
    const note = a.note?.trim();
    if (a.reel_id) {
      if (a.rating === undefined && a.hook_liked === undefined && !note) throw new Error('Nothing to save: pass the rating, hook_liked or the note the user gave.');
      const r = store.setFeedback(a.reel_id, { ...(a.rating !== undefined ? { rating: a.rating } : {}), ...(a.hook_liked !== undefined ? { hook: a.hook_liked ? 1 : -1 } : {}), ...(note ? { note } : {}) });
      done.push(`"${r.title}": ${[r.feedback?.rating ? `${r.feedback.rating}/5` : '', r.feedback?.hook === 1 ? 'opening liked' : r.feedback?.hook === -1 ? 'opening disliked' : '', r.feedback?.note ? `note "${r.feedback.note}"` : ''].filter(Boolean).join(', ')}`);
    } else if (a.rating !== undefined || a.hook_liked !== undefined) throw new Error('A rating or hook_liked needs the reel_id it is about (list_reels shows the ids).');
    if (a.topic?.trim()) {
      if (a.kind !== 'more' && a.kind !== 'less') throw new Error('A topic needs kind "more" or "less".');
      const tool = KRYPT_TOOLS.find((t) => t.id === a.topic!.trim().toLowerCase() || t.name.toLowerCase() === a.topic!.trim().toLowerCase());
      store.setTrainingTopic(tool ? { key: `tool:${tool.id}`, name: tool.name, want: a.kind } : { name: a.topic.trim(), want: a.kind });
      done.push(`topic "${tool?.name ?? a.topic.trim()}": ${a.kind}`);
    }
    if (!a.reel_id && note) {
      const n = store.addTrainingNote({ kind: a.kind ?? 'rule', about: a.about, text: note });
      done.push(`${n.kind} note ${n.id}: ${n.text}`);
    }
    if (!done.length) throw new Error('Nothing to save: pass a reel_id with the rating or note, a general note, or a topic with kind more / less.');
    ctx.focus({ page: a.reel_id ? 'train-rank' : a.topic && !note ? 'train-topics' : 'train-notes' });
    return ok(`Saved the user's feedback: ${done.join('; ').replace(/\.$/, '')}.`);
  },

  add_learning: (a: z.infer<typeof S.add_learning>, ctx) => {
    const l = store.addLearning(a.text, a.reel_ids);
    ctx.focus({ page: 'results' });
    return ok(`Saved learning ${l.id}: ${l.text}`);
  },

  record_account_stats: (a: z.infer<typeof S.record_account_stats>) => {
    const handle = a.handle ?? store.get().settings.handle;
    // Numbers read off one platform and saved under another (the site left out) showed up as Instagram jumping
    // from 12 to 68 followers. A big jump from the last reading on that platform is questioned once.
    const prev = store
      .get()
      .accounts.filter((x) => sameHandle(x.handle, handle) && (x.site ?? 'instagram') === a.site)
      .sort((x, y) => (x.at < y.at ? 1 : -1))[0];
    if (prev && !a.confirm) {
      const days = Math.max(0, (Date.now() - Date.parse(prev.at)) / 86_400_000);
      const jump = (from: number, to: number, floor: number): boolean => Math.abs(to - from) >= floor && (to >= from * 2.5 || to <= from / 2.5);
      const odd = [jump(prev.followers, a.followers, 25) && 'followers', jump(prev.posts, a.posts, 15) && 'posts', jump(prev.following, a.following, 25) && 'following'].filter(Boolean);
      if (odd.length && days < 7) {
        throw new Error(
          `Not recorded: on ${SITE_LABEL[a.site]} ${handle} had ${prev.followers} followers, ${prev.following} following, ${prev.posts} posts at ${prev.at.slice(0, 16)}, and these numbers (${a.followers} / ${a.following} / ${a.posts}) jump in ${odd.join(', ')}. Numbers from another platform's profile are the usual cause: check that site is the platform you read them on. If they really are ${SITE_LABEL[a.site]}'s, call again with confirm true.`,
        );
      }
    }
    const s = store.addAccountSnapshot({ handle, ...(a.site !== 'instagram' ? { site: a.site } : {}), followers: a.followers, following: a.following, posts: a.posts, at: isoAt(a.at) });
    return ok(`Recorded ${s.handle}${onNet(s.site)}: ${s.followers} followers, ${s.following} following, ${s.posts} posts at ${s.at}.`);
  },

  log_session: (a: z.infer<typeof S.log_session>, ctx) => {
    const count = (act: SessionAction): number => a.items.filter((i) => i.actions.includes(act)).length;
    const items = a.items.map((i) => ({ ...i, url: store.canonicalUrl(i.url) }));
    const handle = a.handle ?? store.get().settings.handle;
    const sitex = a.site ?? 'instagram';
    const recorded = store.closeLive(handle, { kind: a.kind, minutes: a.minutes, niche: a.niche, notes: a.notes, items }, sitex);
    if (recorded) {
      const r = recorded.session;
      ctx.focus({ page: 'research' });
      return ok(
        `Closed session ${r.id}${onNet(sitex)} (recorded by Marketo): ${r.minutes} min, ${r.watched} posts — ${r.likes} likes, ${quotaKeys(sitex).includes('reposts') ? `${r.reposts ?? 0} ${quotaLabel('reposts', sitex)}` : `${r.saves} ${quotaLabel('saves', sitex)}`}, ${r.follows} follows, ${r.comments} ${quotaLabel('comments', sitex)}.${recorded.ignored ? ` ${recorded.ignored} action(s) you listed were not seen by the browser and were left out.` : ''}`,
      );
    }
    const s = store.addSession({
      kind: a.kind,
      handle,
      ...(sitex !== 'instagram' ? { site: sitex } : {}),
      ...(sitex === 'x' || sitex === 'threads' || sitex === 'facebook' ? { reposts: count('repost') } : {}),
      startedAt: a.started_at,
      minutes: a.minutes,
      niche: a.niche,
      notes: a.notes,
      likes: count('like'),
      saves: count('save'),
      follows: count('follow'),
      comments: count('comment'),
      messages: count('message'),
      watched: items.filter((i) => !i.actions.includes('message')).length,
      items,
    });
    let refs = '';
    if (a.save_references !== false) {
      const saved = items.filter((i) => i.actions.includes('save'));
      if (saved.length) {
        const r = store.addReferences(saved.map((i) => ({ url: i.url, creator: i.creator, title: i.title, notes: i.note, tags: a.niche ? a.niche.split(/[\/,]/).map((t) => t.trim().toLowerCase()).filter(Boolean) : [] })));
        refs = ` ${r.added.length} saved post${r.added.length === 1 ? '' : 's'} added to References${r.skipped ? ` (${r.skipped} already there)` : ''}.`;
      }
    }
    ctx.focus({ page: 'research' });
    return ok(`Logged ${s.kind} session ${s.id}: ${s.minutes} min, ${s.watched} posts — ${s.likes} likes, ${s.saves} saves, ${s.follows} follows, ${s.comments} comments.${refs}`);
  },

  list_sessions: (a: z.infer<typeof S.list_sessions>) => {
    const list = store.get().sessions.slice(0, a.limit ?? 10);
    if (!list.length) return ok('No sessions logged yet.');
    return ok(
      list
        .map((s) => {
          const head = `${s.id} · ${s.startedAt.slice(0, 16)} · ${s.site && s.site !== 'instagram' ? `${NETWORK_LABEL[s.site as Network] ?? s.site} ` : ''}${s.kind} · ${s.handle} · ${s.minutes} min · ${s.niche ?? '—'} · ${s.likes}L ${s.site === 'x' || s.site === 'threads' || s.site === 'facebook' ? `${s.reposts ?? 0}R` : `${s.saves}S`} ${s.follows}F ${s.comments}C / ${s.watched} posts${s.notes ? ` · ${s.notes}` : ''}`;
          if (!a.with_items) return head;
          // The newest items of each: a long session holds hundreds.
          const shown = s.items.slice(-SESSION_ITEMS_SHOWN);
          const more = s.items.length - shown.length;
          return `${head}\n${more > 0 ? `  (${more} earlier item${more === 1 ? '' : 's'} not shown)\n` : ''}${shown.map((i) => `  - [${i.actions.join(',')}] ${i.creator ?? ''} ${i.url}${i.title ? ` — ${i.title}` : ''}`).join('\n')}`;
        })
        .join('\n'),
    );
  },

  add_references: (a: z.infer<typeof S.add_references>, ctx) => {
    const r = store.addReferences(a.items.map((i) => ({ ...i, tags: i.tags ?? [] })));
    ctx.focus({ page: 'research' });
    return ok(`Added ${r.added.length} reference${r.added.length === 1 ? '' : 's'}${r.skipped ? `, skipped ${r.skipped} duplicate${r.skipped === 1 ? '' : 's'}` : ''}.`);
  },

  list_reference_videos: () => {
    const list = store.get().refVideos;
    return ok(list.length ? `${list.map((r) => `${r.id} · "${r.name}" · ${profileLine(r.profile)}${r.notes ? ` · ${r.notes.slice(0, 140)}` : ' · no notes yet'}`).join('\n')}\nget_reference_video shows one in full, with pictures.` : 'No reference videos yet. The user adds one on the Research page (Reference videos), or gives you a file path for add_reference_video.');
  },

  get_reference_video: (a: z.infer<typeof S.get_reference_video>, ctx) => {
    const r = store.findRefVideo(a.ref);
    if (a.preset && !presetById(a.preset)) throw new Error(`Unknown preset "${a.preset}". list_presets shows them.`);
    ctx.focus({ page: 'research' });
    const images = a.pictures === false ? [] : [refs.readSheet(r.sheets.hook), refs.readSheet(r.sheets.shots)].filter((x): x is { data: string; mimeType: string } => !!x);
    const text = `${refReport(r, a.preset)}${images.length === 2 ? '\nPictures: 1) the opening, frame by frame (labels are seconds). 2) one frame per section (labels: section number, start, length).' : a.pictures === false ? '' : '\n(The pictures of it are missing on disk.)'}`;
    return { ok: true, text, images: images.length ? images : undefined };
  },

  note_reference_video: (a: z.infer<typeof S.note_reference_video>, ctx) => {
    if (a.notes === undefined && a.name === undefined) throw new Error('Pass notes, a name, or both.');
    const r = store.updateRefVideo(store.findRefVideo(a.ref).id, { name: a.name, notes: a.notes });
    ctx.focus({ page: 'research' });
    return ok(`Saved "${r.name}" (${r.id})${r.notes ? `: ${r.notes.slice(0, 200)}` : ''}.`);
  },

  list_references: (a: z.infer<typeof S.list_references>) => {
    const q = a.query?.toLowerCase();
    const list = store
      .get()
      .references.filter((r) => !a.tag || r.tags.includes(a.tag.toLowerCase()))
      .filter((r) => !q || `${r.creator} ${r.title} ${r.notes} ${r.url}`.toLowerCase().includes(q))
      .slice(0, a.limit ?? 50);
    return ok(list.length ? list.map((r) => `${r.id} · ${r.creator ?? '—'} · ${r.url}${r.title ? ` · ${r.title}` : ''}${r.tags.length ? ` · #${r.tags.join(' #')}` : ''}${r.notes ? ` · ${r.notes}` : ''}`).join('\n') : 'No references match.');
  },

  set_settings: (a: z.infer<typeof S.set_settings>) => {
    const s = store.updateSettings({ ...(a.handle ? { handle: a.handle } : {}), ...(a.output_dir ? { outputDir: a.output_dir } : {}), ...(a.fps ? { fps: a.fps } : {}), ...(a.voice_test ? { voiceTest: a.voice_test } : {}), ...(a.variety ? { variety: a.variety } : {}), ...(a.reel_pick ? { reelPick: a.reel_pick } : {}), ...(a.per_thread ? { perThread: a.per_thread } : {}), ...(a.longform ? { longform: { ...longformPlan(store.get().settings), ...(a.longform.per_week !== undefined ? { perWeek: a.longform.per_week } : {}), ...(a.longform.length ? { length: a.longform.length } : {}), ...(a.longform.visibility ? { visibility: a.longform.visibility } : {}) } } : {}) });
    const pool = voiceTestPool();
    if (a.longform) {
      const p = longformPlan(s);
      return ok(`Long-form plan: ${p.perWeek} long video${p.perWeek === 1 ? '' : 's'} a week, about ${p.length} minutes each, uploaded as ${p.visibility}.${p.perWeek > LONGFORM_SOFT_CAP ? ` ${p.perWeek} a week is over the recommended ${LONGFORM_SOFT_CAP} (one a day): tell the user plainly that many near-alike long videos can read as mass-produced to YouTube. It is their number and it stands.` : ''}${isLongform(s) ? '' : ' This profile is not in the long-form mode (Setup > What you are promoting), so the plan waits until it is.'}`);
    }
    return ok(`Settings: per-thread cap ${store.perThreadCap()} (comments, replies and messages an account sends into one thread), handle ${s.handle}, output ${s.outputDir}, ${s.fps} fps, variety ${s.variety ?? 'balanced'}, reel topics picked by ${s.reelPick === 'me' ? 'the user (their queue only)' : 'the AI (the queue first)'}.${a.voice_test ? (pool.length ? ` Voice test: ${pool.map((v) => elLabel(v)).join(', ')}.` : ' Voice test: off.') : ''}`);
  },

  get_playbook: (a: z.infer<typeof S.get_playbook>) => {
    const docs = research.listDocs();
    if (!docs.length) return ok('No research docs found (research/ folder).');
    const index = `Research docs:\n${docs.map((d) => `- ${d.file}: ${d.title}`).join('\n')}`;
    if (a.doc) {
      const d = research.findDoc(a.doc);
      if (!d) throw new Error(`No doc matches "${a.doc}".\n${index}`);
      return ok(`${d.content}\n\n---\n${index}`);
    }
    const main = docs.find((d) => /playbook/i.test(d.file)) ?? docs[0];
    return ok(`${main.content}\n\n---\n${index}\nget_playbook with a doc number for any of the others.`);
  },

  log_posts: (a: z.infer<typeof S.log_posts>, ctx) => {
    const acct = store.findAccount(a.handle ?? store.get().settings.handle);
    const fixed: string[] = [];
    const items = a.posts.map((p) => {
      const site = p.site ?? siteOfUrl(p.url);
      if (!site) throw new Error(`Can't tell the platform of ${p.url}: pass site.`);
      if (!p.title && !store.get().posts.some((x) => x.key === postKey(p.url))) throw new Error(`${p.url} is not in the post log yet: pass its title.`);
      const account = site === 'instagram' ? undefined : site === 'youtube' ? acct.youtube?.channelName : netOf(acct, site)?.handle;
      const when = safePostedAt(p.posted_at, { old: true });
      // A post in the log already keeps the time it has; a new one is recorded as posted now.
      const known = when.fixed && store.get().posts.some((x) => x.key === postKey(p.url));
      if (when.fixed && !known) fixed.push(`${p.url} ("${p.posted_at}")`);
      return { site, handle: acct.handle, account, url: p.url, postedAt: known ? undefined : when.at, title: p.title ?? '', topic: p.topic, tools: p.tools, kind: p.kind, views: p.views, likes: p.likes, comments: p.comments, reelId: p.reel_id, source: 'imported' as const };
    });
    const r = store.logPosts(items);
    ctx.focus({ page: 'results' });
    const fixedNote = fixed.length ? `\nRecorded as posted now, because their posted_at could not be used (${POSTED_AT_NOTE}; a post from before today may give its date as the page shows it): ${fixed.join(', ')}. If one went up earlier, log it again with its real time.` : '';
    return ok(`Post log: ${r.added.length} added, ${r.updated.length} updated (${store.get().posts.length} posts in all).${r.added.length ? `\nAdded:\n${r.added.map((p) => `- ${postLine(p)}`).join('\n')}` : ''}${fixedNote}`);
  },

  list_posts: (a: z.infer<typeof S.list_posts>) => {
    const all = store.get().posts;
    const since = a.days ? Date.now() - a.days * 86_400_000 : 0;
    let list = all.filter((p) => (!a.site || p.site === a.site) && (!since || Date.parse(p.postedAt ?? p.addedAt) >= since));
    if (a.query) list = similarPosts(a.query, list, a.limit ?? 20);
    const counts = SITES.map((s) => `${SITE_LABEL[s]} ${all.filter((p) => p.site === s).length}`).join(', ');
    if (!list.length) return ok(a.query ? `Nothing in the post log looks like "${a.query}". (${counts})` : `No posts logged${a.site ? ` on ${SITE_LABEL[a.site]}` : ''} yet. (${counts}) Read each profile and log_posts what is there.`);
    const tools = new Map<string, number>();
    for (const p of all) for (const t of p.tools ?? []) tools.set(t, (tools.get(t) ?? 0) + 1);
    const toolLine = tools.size ? `\nTools covered (posts): ${[...tools].sort((x, y) => y[1] - x[1]).map(([t, n]) => `${t} ${n}`).join(', ')}` : '';
    return ok(`Post log (${counts}).${toolLine}\n${a.query ? `Looks like "${a.query}":` : 'Newest first:'}\n${list.slice(0, a.limit ?? 60).map((p) => `- ${p.id} · ${postLine(p)}`).join('\n')}`);
  },

  delete_post: (a: z.infer<typeof S.delete_post>) => {
    const p = store.deletePost(a.id);
    return ok(`Removed from the post log: ${postLine(p)}`);
  },

  get_today: async (_a, ctx) => {
    const d = store.get();
    const today = localDate();
    const status = await browser.statusAll();
    const ask = !!d.settings.askApproval;
    const out: string[] = [
      `${profiles.count() > 1 ? `Profile "${profiles.active().name}". ` : ''}Today ${today}. Approvals ${ask ? 'ON: posts, comments and messages wait for the user\'s Approve in the hub' : 'OFF: posts, comments and messages go out when you click (deletes, blocks and settings still ask), so get the text right first'}.`,
    ];
    if (!d.igAccounts.length) return ok(`${out[0]}\nNo accounts yet. save_account adds one.`);
    // The usage tier the user picked (AI > Usage): how much this run takes on, so their AI plan lasts.
    const tier = tierOf(autopilotSettings().tier);
    const N = tier.platformsPerRun;
    // A goal-driven extra run (between the scheduled ones): posts owed and allowed now, and nothing else.
    const extraRun = (() => {
      const f = currentReport();
      return !!f && isExtraReport(f);
    })();
    const dueNow = extraRun ? postsDueNow(d) : [];
    out.push(
      extraRun
        ? `EXTRA RUN (goal-driven, between the scheduled runs): about ${EXTRA_RUN_MIN} minutes, posts only. Post once on each platform marked THIS RUN below (a post is owed there today and its spacing allows one now), then answer new comments and replies on the account's own posts there. No inbox sweep, no engagement goal, no metrics or learning step, no Krypt follow or visit: the scheduled runs do those. At most one new reel, and only when a platform needs a video and nothing ready fits. This overrides the order at the end.`
        : tier.id === 'max'
        ? `USAGE TIER ${tier.label}: a full run, about ${tier.runMin} minutes.`
        : `USAGE TIER ${tier.label} (the user picked it so their AI plan lasts: staying inside it matters more than meeting every target). This run: about ${tier.runMin} minutes${N ? `; only the platforms marked THIS RUN below (${N} per account, the least recently worked first; the others come up in later runs)` : ''}${tier.reelsPerRun ? `; at most ${tier.reelsPerRun} new reel${tier.reelsPerRun === 1 ? '' : 's'} (put a ready reel on this run's other platforms instead of making one for each)` : ''}${tier.searchesPerReel ? `; at most ${tier.searchesPerReel} web searches per reel` : ''}; about ${tier.engageMin} min of engagement a platform; one post per platform. Skip the learning step unless 3 or more new metric reads came in. Act on the snapshot you have before taking another one.`,
    );
    const wanted = nextRunNote();
    if (wanted) out.push(wanted);
    const longNote = longformNote(extraRun);
    if (longNote) out.push(longNote);
    // A long-form channel with no post target anywhere makes no reels: the reel plan stays out.
    const noReels = !!longNote && d.igAccounts.every((a) => sitesOf(a).every((site) => postTarget(a, site, d.sessions, today, d.reels).wanted === 0));
    const reelPlan = noReels ? 'No reels or Shorts in this profile for now: every post target is 0 (the user sets a number on the Accounts page if they want Shorts).' : reelPlanNote();
    if (reelPlan) out.push(reelPlan);
    const rules = trainingRules(d);
    if (rules) out.push(rules);
    const INBOX: Partial<Record<Site, string>> = {
      instagram: 'https://www.instagram.com/direct/inbox/',
      x: 'https://x.com/i/chat',
      tiktok: 'https://www.tiktok.com/messages',
      facebook: 'https://business.facebook.com/latest/inbox',
      threads: 'replies in the Activity tab: https://www.threads.com/activity',
      pinterest: 'https://www.pinterest.com/messages/',
    };
    const enabled = new Set<Site>();
    // Engagement is spread over the runs left today (this one included), aiming at about 70% of each ceiling.
    const runsLeft = runsLeftToday();
    const ENGAGE_KEYS: Array<keyof typeof GOAL_SHARE> = ['likes', 'comments', 'follows', 'reposts', 'saves'];
    // Setup > Performance: each run works K accounts (the ones worked least recently first; one with a Content Rewards
    // submission due always), and the plan can print its shared text once instead of under every platform.
    const pv = perf.values();
    const K = !extraRun && pv.accountsPerRun > 0 && d.igAccounts.length > pv.accountsPerRun ? pv.accountsPerRun : 0;
    const compact = pv.compactPlan;
    const lastWorked = (a: IgAccount): number => {
      let t = 0;
      for (const x of d.sessions) if (sameHandle(x.handle, a.handle)) t = Math.max(t, Date.parse(x.startedAt) || 0);
      for (const p of d.posts) if (p.handle && sameHandle(p.handle, a.handle)) t = Math.max(t, Date.parse(p.postedAt ?? p.addedAt) || 0);
      return t;
    };
    // store.submissions() first turns past-deadline ones to missed, so a stale "due" never holds a slot.
    const dueFor = new Set(store.submissions().filter((x) => x.status === 'due').map((x) => x.accountId));
    const picked = K
      ? new Set([...d.igAccounts.filter((a) => dueFor.has(a.id)), ...d.igAccounts.filter((a) => !dueFor.has(a.id) && a.status !== 'paused').sort((x, y) => lastWorked(x) - lastWorked(y))].slice(0, Math.max(K, dueFor.size)).map((a) => a.id))
      : null;
    if (picked) {
      const later = d.igAccounts.filter((a) => !picked.has(a.id)).map((a) => a.handle);
      if (later.length) out.push('', `NOT THIS RUN (the user's setting: ${K} account${K === 1 ? '' : 's'} a run, the ones worked least recently first; these come up in later runs, leave them alone): ${later.join(', ')}`);
    }
    // A run sees an account only in about K of every (accounts) runs: its share of the day is sized to the runs it gets.
    const runsFor = (): number => (K ? Math.max(1, Math.round((runsLeft * K) / d.igAccounts.length)) : runsLeft);
    const legendAt = out.length;
    const goals = new Map<string, string>();
    const goalRef = (text: string): string => {
      if (!compact) return text;
      let tag = goals.get(text);
      if (!tag) {
        tag = `G${goals.size + 1}`;
        goals.set(text, tag);
      }
      return `goal ${tag} (GOALS above)`;
    };
    for (const a of d.igAccounts) {
      if (picked && !picked.has(a.id)) continue;
      const runs = runsFor();
      const st = status.find((x) => x.accountId === a.id);
      const sites = sitesOf(a);
      // A tier with fewer platforms a run takes the ones this account worked on least recently (a session or a post).
      // A loop, not Math.max(...list): with a long history a spread can run out of stack.
      const lastOn = (site: Site): number => {
        let t = 0;
        for (const x of d.sessions) if ((x.site ?? 'instagram') === site && sameHandle(x.handle, a.handle)) t = Math.max(t, Date.parse(x.startedAt) || 0);
        for (const p of d.posts) if (p.site === site && (!p.handle || sameHandle(p.handle, a.handle))) t = Math.max(t, Date.parse(p.postedAt ?? p.addedAt) || 0);
        return t;
      };
      // YouTube is posting only: once today's posts are done there it has nothing for this run, so it goes last.
      const idle = (site: Site): number => {
        if (site !== 'youtube') return 0;
        const t = postTarget(a, site, d.sessions, today, d.reels, d.igAccounts.length === 1);
        return t.done >= t.target ? 1 : 0;
      };
      // A platform read-only after a human check can only be read: it takes a slot last.
      const onHold = (site: Site): number => (site !== 'youtube' && humanCheckUntil(a, site) ? 1 : 0);
      const thisRun = extraRun ? new Set(sites.filter((x) => dueNow.some((p) => p.site === x && sameHandle(p.handle, a.handle)))) : new Set(N && sites.length > N ? [...sites].sort((x, y) => onHold(x) - onHold(y) || idle(x) - idle(y) || lastOn(x) - lastOn(y)).slice(0, N) : sites);
      thisRun.forEach((x) => enabled.add(x));
      const where = a.browser === 'chrome' ? `in the user's Chrome${st?.connected === false ? ', CHROME NOT CONNECTED: tell the user' : ''}` : "in the user's Chrome";
      out.push('', `## ${a.handle} (${where})${a.status === 'paused' ? ' · PAUSED: leave it alone today' : ''}${sites.length ? '' : ' · no platform turned on (the user picks them on the Accounts page)'}`);
      for (const owed of seriesOwed(d.reels, d.posts, a.handle)) out.push(`- SERIES: ${owed} Post it there (counts as that platform's post) before a new series part goes anywhere else.`);
      for (const site of sites) {
        const L = SITE_LABEL[site];
        const signed = site === 'instagram' ? st?.loggedIn : site === 'youtube' ? st?.youtube?.loggedIn : st?.[site as Network]?.loggedIn;
        const who = site === 'youtube' ? (a.youtube?.channelName ? ` "${a.youtube.channelName}"` : '') : site === 'instagram' ? '' : netOf(a, site as Network)?.handle ? ` ${netOf(a, site as Network)!.handle}` : '';
        if (!thisRun.has(site)) {
          if (extraRun) {
            out.push(`- ${L}${who}: NOT THIS RUN (extra run: no post owed here now, or its spacing does not allow one yet). Leave it alone.`);
            continue;
          }
          out.push(`- ${L}${who}: NOT THIS RUN (usage tier ${tier.label}: ${N} platforms a run; it comes up in a later run). Leave it alone.`);
          continue;
        }
        const t = postTarget(a, site, d.sessions, today, d.reels, d.igAccounts.length === 1);
        // More than one post a run only comes up when the user asked for that many a day: the line then says how many and how far apart.
        // Never more than fits in a run of about an hour at that platform's spacing.
        const gapMin = postGap(a, site);
        const perRun = extraRun || tier.id === 'low' || tier.id === 'medium' ? 1 : Math.max(1, Math.min(Math.ceil((t.target - t.done) / runs), gapMin > 0 ? Math.floor(60 / gapMin) + 1 : Infinity));
        const ownPosts = limitsOf(a, site).posts !== undefined;
        const postBit =
          t.ceiling === 0
            ? ownPosts
              ? 'no posting: the user set the post limit to 0 here'
              : 'no posting yet in this warm-up phase'
            : `posts ${t.done}/${t.target} today${t.done >= t.target ? ' (target met)' : ` (${t.target - t.done} to go)`}${t.wanted > t.ceiling ? ` (the user's target is ${t.wanted}; today's post limit is ${t.ceiling})` : ''}${t.target - t.done > 0 && perRun > 1 ? ` · THIS RUN: up to ${perRun} posts here, ${gapMin > 0 ? `at least ${gapMin} min apart` : 'no set spacing (still not back to back)'}` : ''}`;
        // A long-form channel with no Shorts target: the long videos are the work here, and the Shorts warm-up and goal stay out.
        const longOnly = !!longNote && site === 'youtube' && t.wanted === 0;
        const parts = [longOnly ? 'no Shorts here (the target is 0): the long videos above are the work on this channel' : postBit];
        if (site === 'youtube' && !extraRun) {
          const warm = longOnly ? '' : ytWarmupLine(a);
          if (warm) parts.push(warm);
          const krypt = a.status === 'paused' ? [] : kryptFollowNow(a, site);
          if (krypt.length) parts.push(kryptFollowLine(site, krypt));
          const visit = kryptVisitNow(a, site);
          if (visit) parts.push(visit);
        }
        if (site !== 'youtube') {
          const plan = planFor(a, d.sessions, today, site);
          const watch = site === 'instagram' ? a.watchOnly : netOf(a, site as Network)?.watchOnly;
          const keys = quotaKeys(site).filter((k) => k !== 'posts' && k !== 'minutes');
          parts.push(watch ? 'WATCH-ONLY (no likes, follows, comments, messages or posts)' : `left: ${keys.map((k) => `${Math.round(plan.left[k])} ${quotaLabel(k, site)}`).join(', ')}, ${Math.round(plan.left.minutes)} min`);
          // After a human check the platform is read-only for a while; on Threads about one run in four only reads.
          const held = humanCheckUntil(a, site);
          const browse = !held && !watch && !extraRun && a.status !== 'paused' ? browser.browseRun(a, site) : null;
          const quiet = !!held || !!browse?.on;
          if (held) parts.push(`READ-ONLY until ${new Date(held).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}: ${L} asked this account to prove it is human, so only scroll and read there (no likes, follows, replies, reposts or posts; the hub refuses them)`);
          else if (browse?.on) parts.push(`BROWSE-ONLY RUN (the hub makes some runs just reading, as people do): 5-8 minutes of watching, reading and scrolling, answer replies on our own posts, post if one is due; no likes, follows, saves, reposts or replies to others this run`);
          if (!watch && !quiet && a.status !== 'paused' && !extraRun) {
            // The tier's minutes of engagement a run (15 on Max); with a time budget of the user's own, a full share of it.
            const mins = Math.max(Math.min(5, tier.engageMin), Math.min(Math.floor(plan.left.minutes / runs), plan.own.minutes !== undefined ? Infinity : tier.engageMin));
            // What fits in that time when every like follows a post watched or read to the end: the goal is never more than that.
            const fits = Math.max(1, Math.floor((mins * 60) / SECONDS_PER_ACTION[site]));
            const main = site === 'pinterest' ? 'saves' : 'likes';
            const goal = ENGAGE_KEYS.filter((k) => keys.includes(k) && plan.phase.quota[k] > 0)
              .map((k) => {
                // A recommended number is a ceiling to stay under; one the user set themselves is the number they want done.
                const mine = plan.own[k] !== undefined;
                const dayGoal = Math.round(plan.phase.quota[k] * (mine ? 1 : GOAL_SHARE[k]));
                const share = Math.max(0, Math.min(Math.ceil((dayGoal - plan.done[k]) / runs), Math.floor(plan.left[k])));
                const n = mine ? share : Math.min(share, k === main ? fits : Math.max(1, Math.ceil(fits / 2)));
                return n > 0 ? `~${n} ${quotaLabel(k, site)}` : '';
              })
              .filter(Boolean);
            if (plan.left.minutes < 2) parts.push('THIS RUN: time budget used up, no engagement today');
            else if (goal.length) parts.push(compact ? `THIS RUN: ${goal.join(', ')} in about ${mins} min` : `THIS RUN: ${goal.join(', ')} in about ${mins} min of real watching (sized to fit that time, so do all of it: it is half the job; ${runs} run${runs === 1 ? '' : 's'} left today)`);
          }
          const krypt = watch || quiet || a.status === 'paused' || extraRun ? [] : kryptFollowsNow(a, site, plan.left.follows);
          if (krypt.length) parts.push(kryptFollowLine(site, krypt));
          const visit = watch || quiet || extraRun ? '' : kryptVisitNow(a, site, plan.left);
          if (visit) parts.push(visit);
          const repost = watch || quiet || a.status === 'paused' || extraRun ? null : kryptRepostDue(a, site, d.settings.firstRunAt);
          if (repost) parts.push(kryptRepostLine(site, repost));
          if (a.status === 'warming' || site !== 'instagram') parts.push(`${plan.phase.name} phase, day ${plan.day}`);
          const inbox = d.sessions.filter((x) => x.kind === 'inbox' && (x.site ?? 'instagram') === site && sameHandle(x.handle, a.handle) && localDate(x.startedAt) === today);
          parts.push(inbox.length ? `inbox checked ${inbox.length}x today (${plan.done.messages} sent)` : compact ? 'inbox NOT checked today' : `inbox NOT checked today (${INBOX[site]})`);
        }
        const goal = longOnly ? '' : goalLine(a, site, d.brand);
        if (goal) parts.push(goalRef(goal));
        const mine = a.platformNotes?.[site]?.trim();
        if (mine) parts.push(`THE USER'S INSTRUCTIONS FOR ${L.toUpperCase()} (follow them here): ${mine.replace(/\s*\n+\s*/g, ' / ')}`);
        out.push(`- ${L}${who}${signed === false ? ' · NOT SIGNED IN: tell the user' : ''} · ${parts.join(' · ')}`);
      }
    }
    if (compact) {
      // The shared text, once (the user's own per-platform instructions stay on each line).
      const legend = [
        '',
        `HOW TO READ THE LINES BELOW: each THIS RUN engagement goal is sized to the minutes given, so do all of it: it is half the job (${runsLeft} run${runsLeft === 1 ? '' : 's'} left today). An inbox NOT checked today is checked at: ${Object.entries(INBOX).filter(([k]) => enabled.has(k as Site)).map(([k, v]) => `${SITE_LABEL[k as Site]} ${v}`).join('; ')}.`,
      ];
      if (goals.size) legend.push(`GOALS (each line below names the one it follows):\n${[...goals].map(([text, tag]) => `${tag}: ${text}`).join('\n')}`);
      out.splice(legendAt, 0, ...legend);
    }
    const NOT_ON: Array<[Site, (r: Reel) => boolean]> = [
      ...SITES.map((s): [Site, (r: Reel) => boolean] => [s, (r) => !linkOn(r, s)]),
    ];
    const ready = d.reels
      .filter((r) => r.renderPath && r.status !== 'draft')
      .map((r) => ({ r, missing: NOT_ON.filter(([site, f]) => enabled.has(site) && f(r)).map(([site]) => SITE_LABEL[site]) }))
      .filter((x) => x.missing.length)
      .sort((x, y) => (y.r.updatedAt ?? '').localeCompare(x.r.updatedAt ?? ''))
      .slice(0, 8);
    out.push('', ready.length ? `Rendered reels not yet on every platform (newest first; check each fits that platform's content before posting):\n${ready.map((x) => `- ${x.r.id} "${x.r.title}" · not yet on ${x.missing.join(', ')}`).join('\n')}` : noReels ? 'No reels to post: this profile makes none for now.' : 'No rendered reels waiting: make new ones for today\'s targets.');
    const recent = d.posts.filter((p) => Date.now() - Date.parse(p.postedAt ?? p.addedAt) < 14 * 86_400_000);
    const empty = SITES.filter((s) => d.igAccounts.some((acc) => siteOn(acc, s)) && !d.posts.some((p) => p.site === s));
    out.push('', recent.length ? `Posted in the last 14 days (post log; don't repeat these stories, list_posts with query to check an idea):\n${postGroups(recent, 20).map((l) => `- ${l}`).join('\n')}` : 'Nothing in the post log from the last 14 days.');
    if (empty.length && !noReels) out.push(`The post log has nothing on ${empty.map((s) => SITE_LABEL[s]).join(', ')} yet: open each profile, read its posts and log_posts them (title, date, story, tools, views) before making new ones.`);
    const DAY = 86_400_000;
    const due: string[] = [];
    for (const r of d.reels)
      for (const site of SITES) {
        const link = linkOn(r, site);
        if (!link?.at || !enabled.has(site)) continue;
        const age = Date.now() - Date.parse(link.at);
        const snaps = metricsOn(r, site);
        const lastAt = snaps.length ? Date.parse(snaps[snaps.length - 1].at) : 0;
        if (age > DAY && !snaps.length) due.push(`${r.id} "${r.title}" on ${SITE_LABEL[site]} (first read)`);
        else if (age > 7 * DAY && age < 30 * DAY && lastAt - Date.parse(link.at) < 6 * DAY) due.push(`${r.id} "${r.title}" on ${SITE_LABEL[site]} (7-day read)`);
      }
    if (due.length) out.push(`Metrics due: ${due.slice(0, 14).join('; ')}${due.length > 14 ? ` and ${due.length - 14} more` : ''}. Open each, read that platform's stats, record_reel_metrics with platform set.`);
    const camps = (d.campaigns ?? []).filter((c) => c.on && c.accounts.length);
    let showCamps = false;
    if (camps.length) {
      const subs = store.submissions();
      const handleOf = (id: string): string => d.igAccounts.find((x) => x.id === id)?.handle ?? id;
      const dueSubs = subs.filter((s) => s.status === 'due');
      // A test campaign (the user's own accounts, no payout) gets no daily reels: only its due submission shows.
      const lines = camps.filter((c) => !c.test).map((c) => {
        const target = c.perDay * c.accounts.length;
        const left = Math.max(0, target - madeToday(d.reels, c));
        return `- ${c.id} "${c.title}" (${c.platforms.map((s) => SITE_LABEL[s]).join(', ')}; ${c.accounts.map(handleOf).join(', ')}): ${left ? `${left} of ${target} campaign reels still to make today` : 'today\'s campaign reels made'}${c.rules ? '' : '; RULES NOT SAVED: read its page and save_campaign them before making any'}`;
      });
      showCamps = lines.length > 0 || dueSubs.length > 0;
      if (showCamps) out.push(
        '',
        `Content Rewards (paid per view; list_campaigns has the rules):${dueSubs.length ? `\nSUBMIT NOW: ${dueSubs.map((s) => submissionLine(s, d.campaigns?.find((c) => c.id === s.campaignId), handleOf(s.accountId))).join('; ')}` : ''}${lines.length ? `\n${lines.join('\n')}` : ''}\nCampaign reels: create_reel with campaign set, the caption starting with #ad and every required tag; post on the campaign's platforms, mark_posted, then submit the link within 30 minutes. Don't use Krypt's own accounts for them (only a TEST ONLY campaign allows them).`,
      );
    }
    const last = lastRun();
    if (last) {
      // Approval cards live 10 minutes in memory: an id in an old report is long gone unless it is listed here.
      const waiting = approvals.all().filter((a) => a.state === 'pending');
      out.push(
        '',
        `Last autopilot run (${last.at}${last.ended ? '' : ', did not finish'}). Don't redo what it did; pick up what it left:\n${last.summary}`,
        '',
        `Its NEEDS YOU lines are what was true then, not now: put one in your own report only if you checked this run that it still holds (the user may have fixed it since). Approval cards waiting right now: ${
          waiting.length ? waiting.map((a) => `${a.id} (${a.kind} on ${a.handle})`).join(', ') : 'none'
        }. Any other approval card id (ap_...) has expired: never report it again.`,
      );
    }
    if (noReels)
      out.push(
        '',
        "Order: 1) The long video: the LONG-FORM CHANNEL part above says what is due; list_long_videos gives the steps. 2) Studio's Comments on each channel: answer real ones in a line or two, written the way a person types (the hub turns back ones that read as machine-written). 3) The numbers of uploaded videos: save_long_video with stats. 4) log_session for YouTube. A limit the user set themselves is a number they want reached.",
      );
    else out.push(
      '',
      (showCamps ? 'Order: 0) Any SUBMIT NOW line above first (Content Rewards takes a post only within 30 minutes of it going up). 1) ' : 'Order: 1) ') +
        'Inbox on each platform: answer real DMs (rules in the instructions), log_session kind "inbox". 2) Engagement on each platform: do its THIS RUN goal above (get_warmup_plan first). Like what you watched and liked, follow niche accounts that post good content; comments and replies are one short line each, written like the ones already under that post, never the same shape twice (the hub turns back ones that read as machine-written); if a feed is off-niche, search the niche (its keywords, hashtags, the accounts you already follow) and engage there. Interleave it with the posts below rather than skipping it. 3) Today\'s post targets: one post per platform per run, unless that platform\'s line above says more for THIS RUN (posts on a platform are spaced by its gap: 2h, 90 min on X, or the user\'s own number; the hub refuses one that comes sooner), spread through the run; post ready reels where they fit, make and render new ones for the rest; read the playbook for what goes on which platform. 4) Reply to comments on recent posts. 5) Metrics due, then record_account_stats per platform. 6) log_session per platform. Stop at a target once it is met. A recommended limit is a ceiling to stay under, never to chase; a limit the user set themselves is a number they want reached.',
    );
    ctx.focus({ page: 'dashboard' });
    return ok(out.join('\n'));
  },

  list_accounts: async () => {
    const list = store.get().igAccounts;
    const status = await browser.statusAll();
    return ok(list.length ? list.map((a) => { const st = status.find((x) => x.accountId === a.id); return accountLine(a, st?.loggedIn, st); }).join('\n') : 'No accounts yet. save_account adds one; the user then signs it in on the Accounts page.');
  },

  save_account: async (a: z.infer<typeof S.save_account>, ctx) => {
    const existing = store.get().igAccounts.find((x) => sameHandle(x.handle, a.handle));
    const channel = a.youtube_channel?.trim() ? await resolveYtChannel(a.youtube_channel) : null;
    const acct = store.saveAccount({
      ...(existing ? { id: existing.id } : {}),
      handle: a.new_handle ?? a.handle,
      niche: a.niche,
      platformNotes: a.platform_notes ? Object.fromEntries(Object.entries({ ...(existing?.platformNotes ?? {}), ...a.platform_notes }).filter(([, v]) => !!v?.trim())) : undefined,
      styles: a.styles ? cleanStyles(a.styles) : undefined,
      tone: a.tone,
      goals: a.goals ? { ...(existing?.goals ?? {}), ...a.goals } : undefined,
      pushProduct: a.push_product,
      styleMix: a.style_mix ? Object.fromEntries(Object.entries(a.style_mix).map(([k, v]) => [styleById(k)?.id ?? k, v])) : undefined,
      status: a.status,
      browser: a.browser,
      instagram: a.instagram,
      watchOnly: a.watch_only,
      targets: a.posts_per_day ? { ...(existing?.targets ?? {}), ...a.posts_per_day } : undefined,
      limits: a.limits ? mergeLimits(existing?.limits, a.limits as Partial<Record<Site, Record<string, number | null>>>) : undefined,
      youtube:
        a.youtube === undefined && !a.forget_youtube_channel && !channel
          ? undefined
          : (() => {
              const y = { enabled: false, ...(existing?.youtube ?? {}) };
              if (a.youtube !== undefined) y.enabled = a.youtube;
              if (a.forget_youtube_channel) {
                delete y.channelId;
                delete y.channelName;
                delete y.channelHandle;
              }
              if (channel) {
                if (a.youtube === undefined) y.enabled = true;
                y.channelId = channel.id;
                y.channelName = channel.name;
                y.channelHandle = channel.handle;
              }
              return y;
            })(),
      x: netPatch(existing?.x, a.x, a.x_handle, a.x_warmup_start, a.x_watch_only, 'x'),
      tiktok: netPatch(existing?.tiktok, a.tiktok, a.tiktok_handle, a.tiktok_warmup_start, a.tiktok_watch_only, 'tiktok'),
      facebook: netPatch(existing?.facebook, a.facebook, a.facebook_handle, a.facebook_warmup_start, a.facebook_watch_only, 'facebook'),
      threads: netPatch(existing?.threads, a.threads, a.threads_handle, a.threads_warmup_start, a.threads_watch_only, 'threads'),
      pinterest: netPatch(existing?.pinterest, a.pinterest, a.pinterest_handle, a.pinterest_warmup_start, a.pinterest_watch_only, 'pinterest'),
      createdOn: a.created_on,
      warmupStart: a.warmup_start ?? (existing ? undefined : a.created_on),
      notes: a.notes,
      setup: a.setup ? { avatar: a.setup.avatar, bio: a.setup.bio, link: a.setup.link, firstPost: a.setup.first_post } : undefined,
    });
    if (a.make_active) store.updateSettings({ handle: acct.handle });
    ctx.focus({ page: 'accounts' });
    const xNote = NETWORKS.filter((n) => a[n])
      .map((n) => ` ${NETWORK_LABEL[n]} is on: the user signs in to ${netOf(acct, n)?.handle ?? `its ${NETWORK_LABEL[n]} account`} ${acct.browser === 'chrome' ? 'in the same Chrome profile' : `on the Accounts page (Open ${NETWORK_LABEL[n]})`}; get_warmup_plan with site "${n}" before using it.`)
      .join('');
    const ytNote = a.youtube ? ` YouTube Shorts is on: the user signs in to the channel's Google account ${acct.browser === 'chrome' ? 'in the same Chrome profile' : 'on the Accounts page (Open YouTube Studio)'}.` : '';
    const limitNote = a.limits || a.posts_per_day ? limitsNote(acct, [...new Set([...Object.keys(a.limits ?? {}), ...Object.keys(a.posts_per_day ?? {})])] as Site[]) : '';
    return ok(`${existing ? 'Updated' : 'Added'} ${accountLine(acct)}.${limitNote}${xNote}${ytNote}${existing ? '' : acct.browser === 'chrome' ? ' It runs in the user\'s own Chrome: they need the Krypt Marketo extension in the Chrome profile where it is signed in (Accounts page shows how).' : ' The user signs it in on the Accounts page (Open Instagram) before you can use the browser for it.'}`);
  },

  get_warmup_plan: (a: z.infer<typeof S.get_warmup_plan>, ctx) => {
    const acct = resolveAccount(a.handle);
    if (a.site && a.site !== 'instagram') {
      const n = a.site;
      const L = NETWORK_LABEL[n];
      const p = netOf(acct, n);
      if (!p?.enabled) throw new Error(`${L} is not turned on for ${acct.handle}. Ask the user; they turn it on on the Accounts page.`);
      const plan = planFor(acct, store.get().sessions, undefined, n);
      const q = plan.phase.quota;
      const keys = quotaKeys(n);
      const lbl = (k: (typeof keys)[number]): string => quotaLabel(k, n);
      ctx.focus({ page: 'accounts' });
      return ok(
        [
          `${acct.handle} on ${L} (${p.handle ?? 'handle not seen yet'}) · ${localDate()} · ${L} warm-up day ${plan.day} · ${plan.phase.name} phase${plan.next ? ` (${plan.next.name} from day ${plan.next.from})` : ''}.`,
          p.watchOnly ? `WATCH-ONLY ON ${L.toUpperCase()}: watch and scroll. The browser refuses ${keys.filter((k) => k !== 'minutes').map(lbl).join(', ')} there.` : acct.status === 'paused' ? 'PAUSED: no engagement at all until the user un-pauses it.' : '',
          `Use browser_open with site "${n}" for ${acct.handle}; its first lines say whether ${L} is signed in, and as whom.`,
          acct.niche ? `Niche: ${acct.niche}.` : '',
          `Today so far on ${L}: ${plan.done.sessions} session(s), ${keys.map((k) => `${plan.done[k]}/${q[k]} ${lbl(k)}`).join(', ')}.`,
          `Left today: ${keys.map((k) => `${Math.round(plan.left[k] * 10) / 10} ${lbl(k)}`).join(', ')}. ${ceilingNote(plan, n)} ${NET_CARE[n]}`,
          `Phase tasks: ${plan.phase.tasks.join('; ')}.`,
          kryptDue(acct, n, plan.left),
          `Active on ${L} ${plan.activeDays7} of the last 7 days. Posts and ${lbl('comments')} follow the user's approval setting. When done, log_session with site "${n}".`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
    }
    const plan = planFor(acct, store.get().sessions);
    const q = plan.phase.quota;
    const setupLeft = (Object.keys(SETUP_LABEL) as Array<keyof IgAccount['setup']>).filter((k) => !acct.setup[k]).map((k) => SETUP_LABEL[k]);
    ctx.focus({ page: 'warming' });
    return ok(
      [
        `${acct.handle} · ${acct.status} · ${localDate()} · warm-up day ${plan.day} · ${plan.phase.name} phase${plan.next ? ` (${plan.next.name} from day ${plan.next.from})` : ''}.`,
        acct.watchOnly ? 'WATCH-ONLY: scroll and watch. The browser refuses likes, saves, follows, comments and posts for this account.' : acct.status === 'paused' ? 'PAUSED: no engagement at all until the user un-pauses it.' : '',
        `Use browser_open for ${acct.handle}; its first lines say whether the account is signed in.`,
        acct.niche ? `Niche: ${acct.niche}.` : '',
        `Today so far: ${plan.done.sessions} session(s), ${QUOTA_KEYS.map((k) => `${plan.done[k]}/${q[k]} ${k}`).join(', ')}.`,
        `Left today: ${QUOTA_KEYS.map((k) => `${Math.round(plan.left[k] * 10) / 10} ${k}`).join(', ')}. ${ceilingNote(plan, 'instagram')}`,
        `Phase tasks: ${plan.phase.tasks.join('; ')}.`,
        kryptDue(acct, 'instagram', plan.left),
        setupLeft.length ? `Profile setup still open: ${setupLeft.join(', ')} (ask the user before changing the profile).` : 'Profile setup done.',
        `Active ${plan.activeDays7} of the last 7 days.${q.posts === 0 ? ' No posting yet in this phase.' : ''} Comments follow the user's approval setting.`,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  },

  krypt_tools: (a: z.infer<typeof S.krypt_tools>) => {
    if (!a.tool) return ok(`Krypt tools (krypt.cc/tools), ${KRYPT_TOOLS.length} in all. krypt_tools with a tool id returns everything about it: what it does in full, price, platforms, reel angles and what never to claim.\n${kryptToolsFeaturedFirst().map((t) => `- ${kryptToolSummary(t)}`).join('\n')}\n\nRules for reels about them:\n${KRYPT_PACK_RULES.map((r) => `- ${r}`).join('\n')}`);
    const t = kryptToolById(a.tool);
    if (!t) throw new Error(`No Krypt tool matches "${a.tool}". Ids: ${KRYPT_TOOLS.map((x) => x.id).join(', ')}.`);
    const doc = t.doc ? research.findDoc(t.doc) : undefined;
    const source = t.released === false ? 'Facts are from the app itself.' : `Facts are from ${t.url} and its own docs (read ${t.read ?? KRYPT_PACK_READ}). If the reel leans on a number, check the page first (browser tools only open Instagram; ask the user or use your own web access).`;
    const clip = screenRec.toolClip(t.id);
    const footage = clip ? `\n\nScreen recording of the app (silent, bundled with the hub): ${clip}. For a screen-tutorial reel, set fields.video to it and use screen beats; preview_reel to pick the seconds. Record a fresh one with record_screen when the reel needs a specific screen.` : '';
    // Marketo's best footage is what it makes: the example videos of its styles ship with the hub.
    const made = t.id === 'marketo' ? screenRec.exampleVideos() : [];
    const madeLine = made.length ? `\n\nVideos it made (silent example videos of its styles, bundled with the hub; use them as the footage of a Marketo reel: fields.video, one per beat or a few seconds each, then the hub at the end):\n${made.map((p) => `- ${p}`).join('\n')}` : '';
    return ok(`${kryptToolDetail(t)}${footage}${madeLine}\n\n${source}${doc ? `\n\nA longer feature catalog is in the playbook: get_playbook with doc "${t.doc}".` : ''}`);
  },

  set_brand: (a: z.infer<typeof S.set_brand>, ctx) => {
    const b = store.saveBrand({ ...Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)), setupDone: true });
    ctx.focus({ page: 'setup' });
    return ok(`Brand saved: ${b.name || '(no name yet)'}${b.site ? ` · ${b.site}` : ''}. ${b.what}\nNiche: ${b.niche || '—'}\nVoice: ${b.voice || '—'}\nNever: ${b.never || '—'}\nDisclaimer: ${b.disclaimer || '—'}`);
  },

  delete_playbook_note: (a: z.infer<typeof S.delete_playbook_note>) => {
    const d = research.deleteNote(a.doc);
    return ok(`Deleted the note ${d.file} ("${d.title}"). get_playbook no longer lists it${d.builtinBack ? '; the built-in doc of the same name is back in its place' : ''}. The file is kept in the playbook's "deleted" folder.`);
  },

  save_playbook_note: (a: z.infer<typeof S.save_playbook_note>, ctx) => {
    const file = research.saveNote(a.title, a.content);
    ctx.focus({ page: 'research' });
    return ok(`Saved to the playbook as ${file}. get_playbook lists it from now on.`);
  },

  browser_open: (a: z.infer<typeof S.browser_open>, ctx) => {
    const t = tabFor(ctx, a.handle, a.site ?? (a.url && /^https?:/i.test(a.url.trim()) ? (siteOfUrl(a.url.trim()) ?? undefined) : undefined), false);
    return browser.toolOpen(t.handle, a.url, a.site);
  },
  browser_snapshot: (a: z.infer<typeof S.browser_snapshot>, ctx) => {
    const t = tabFor(ctx, a.handle, a.site, false);
    return browser.toolSnapshot(t.handle, a.full, t.site);
  },
  browser_click: (a: z.infer<typeof S.browser_click>, ctx) => {
    const t = tabFor(ctx, a.handle, a.site, true);
    return browser.toolClick(t.handle, a.ref, ctx.client, t.site);
  },
  browser_type: (a: z.infer<typeof S.browser_type>, ctx) => {
    const t = tabFor(ctx, a.handle, a.site, true);
    return browser.toolType(t.handle, a.ref, a.text, { clear: a.clear, submit: a.submit }, ctx.client, t.site);
  },
  browser_press: (a: z.infer<typeof S.browser_press>, ctx) => {
    const t = tabFor(ctx, a.handle, a.site, true);
    return browser.toolPress(t.handle, a.key, ctx.client, t.site);
  },
  browser_scroll: (a: z.infer<typeof S.browser_scroll>, ctx) => {
    const t = tabFor(ctx, a.handle, a.site, false);
    return browser.toolScroll(t.handle, a.direction, a.amount, t.site);
  },
  browser_wait: (a: z.infer<typeof S.browser_wait>) => browser.toolWait(a.handle, a.seconds, a.site),
  browser_back: (a: z.infer<typeof S.browser_back>, ctx) => {
    const t = tabFor(ctx, a.handle, a.site, false);
    return browser.toolBack(t.handle, t.site);
  },
  browser_close: (a: z.infer<typeof S.browser_close>) => browser.toolClose(a.handle, a.site),
  post_failed: (a: z.infer<typeof S.post_failed>) => browser.postFailed(a.handle, a.platform),

  set_next_run: (a: z.infer<typeof S.set_next_run>) => {
    store.setNextRun(a.text);
    const n = store.get().nextRun?.note;
    return ok(n ? `Saved for the next autopilot run${profiles.count() > 1 ? ` of the profile "${profiles.active().name}"` : ''}. It is used once, and the user can read or change it under Create > Next run:\n"""\n${n.text}\n"""` : 'Cleared: the next autopilot run has no special instructions.');
  },

  save_style: (a: z.infer<typeof S.save_style>) => {
    const cur = a.id ? styleById(a.id) : undefined;
    if (a.id && !cur?.custom) throw new Error(`"${a.id}" is not one of the user's own styles. Built-in styles cannot be changed: make a new one built on it (base).`);
    const s = store.saveStyle({ ...a, id: cur?.id });
    return ok(`${cur ? 'Changed' : 'Made'} the style "${s.name}" (label ${s.label}), built on ${s.base}. It is on the Styles page. No account runs it yet unless one already did: save_account with styles (and style_mix for how often) switches it on, when the user says which account.`);
  },

  delete_style: (a: z.infer<typeof S.delete_style>) => {
    const s = store.deleteStyle(a.style);
    return ok(`Deleted the style "${s.name}". Accounts that ran it no longer do; reels already made keep their tag.`);
  },

  queue_reels: (a: z.infer<typeof S.queue_reels>) => {
    if (a.clear) store.clearQueue();
    for (const id of a.remove ?? []) store.unqueueRun(id);
    for (const t of a.add ?? []) store.queueRun(t);
    return ok(queueText());
  },

  propose_reels: (a: z.infer<typeof S.propose_reels>) => {
    store.proposeReels(a.ideas.map((i) => ({ ...i, style: i.style ? (styleById(i.style)?.id ?? undefined) : undefined })));
    return ok(`Left ${a.ideas.length} idea${a.ideas.length === 1 ? '' : 's'} for the user under Create > Next run. Nothing is made from an idea until they queue it.\n${queueText()}`);
  },

  list_profiles: () =>
    ok(
      `Profiles (each a separate set of accounts, brand, reels, post log, Training, learnings and notes):\n${profiles
        .list()
        .map((p) => `- "${p.name}" (${p.id})${p.active ? (p.running === undefined ? ' · OPEN' : ' · THIS WINDOW') : p.running ? ' · open in its own window' : ''}${p.autopilot ? ' · autopilot runs it' : ''}`)
        .join('\n')}\nThe user adds, renames and deletes profiles on the Multi run page. use_profile opens one${profiles.ownProfile() ? ' (each profile runs in its own window here: use_profile moves this conversation to that window, starting it if needed)' : ''}.`,
    ),
  use_profile: async (a: z.infer<typeof S.use_profile>, ctx) => {
    const before = profiles.active();
    // An autopilot run is working (the Multi run page refuses a switch then too). A run's own first use_profile still
    // goes through: it comes while no run is working on the open profile yet. Kip is never the run.
    if (autopilotRunning() && profiles.find(a.id).id !== before.id && (ctx.client === 'Kip' || currentReport()))
      throw new Error(`An autopilot run is working on "${before.name}" right now. Switching profiles would close its tabs and move its tools to another profile's data, so the hub stays on "${before.name}". Try again when the run has ended (the Autopilot page shows it).`);
    let p: Awaited<ReturnType<typeof profiles.use>>;
    switchBy = ctx.client;
    try {
      p = await profiles.use(a.id);
    } finally {
      switchBy = null;
    }
    if (p.id === before.id) return ok(`Profile "${p.name}" (${p.id}) is open already. Nothing changed.`);
    // The tabs listed before belong to the profile that was left.
    lastTab.clear();
    const d = store.get();
    return ok(
      `Profile "${p.name}" (${p.id}) is open now; "${before.name}" is closed and its tabs with it. This profile has ${d.igAccounts.length} account(s) (${d.igAccounts.map((x) => x.handle).join(', ') || 'none yet'}) and ${d.reels.length} reel(s)${d.brand.setupDone ? `, for ${d.brand.name || 'a brand with no name yet'}` : '; its brand is not set up yet (the user does that in the hub)'}. Everything you read before belongs to "${before.name}": call get_overview and get_today again before doing anything.`,
    );
  },
  browser_screenshot: (a: z.infer<typeof S.browser_screenshot>) => browser.toolScreenshot(a.handle, a.site),
  browser_attach_reel: (a: z.infer<typeof S.browser_attach_reel>) => {
    const r = store.findReel(a.id);
    if (!r.renderPath) throw new Error(`"${r.title}" has no render yet. render_reel first.`);
    // A render made before the hub stopped falling back to the free voice: it is not in the voice the reel was made with.
    if (r.fields.voice_free === '1') throw new Error(`"${r.title}" was rendered in the free stand-in voice because ElevenLabs failed, not in its own voice. It is not posted like that: render_reel it again (it now buys the lines or stops), then attach.`);
    if (a.site === 'rewards') throw new Error('Reels are posted on a platform, then their link is submitted on contentrewards.com.');
    const site: Site = a.site ?? 'instagram';
    // A later part of a series goes only where the part before it went (shared/series.ts).
    const sp = seriesProblem(store.get().reels, store.get().posts, r, site, store.findAccount(a.handle ?? store.get().settings.handle).handle);
    if (sp) throw new Error(sp);
    // A campaign reel goes up only with its disclosure and required tags, from an account that may post for it.
    const c = r.campaignId ? store.get().campaigns?.find((x) => x.id === r.campaignId) : undefined;
    if (c) {
      const acct = store.findAccount(a.handle ?? store.get().settings.handle);
      const problems = campaignProblems(r, c, acct, site);
      if (problems.length) throw new Error(`"${r.title}" can't go up for "${c.title}" yet: ${problems.join('; ')}. update_reel fixes the caption.`);
    }
    const after = async (o: Promise<browser.Outcome>): Promise<browser.Outcome> => {
      const out = await coverNote(o, r, site);
      return c && out.ok ? { ...out, text: `CAMPAIGN POST for "${c.title}": use the reel's caption as it is (it starts with #ad). ${DISCLOSURE_STEP[site] ?? ''} Right after it is live, mark_posted it: the link must be submitted within 30 minutes.\n${out.text}` } : out;
    };
    if (site === 'x') {
      // X gets the square version: vertical video takes the whole timeline there and reads as a reel repost.
      if (!r.squarePath) throw new Error(`X gets the square version of a reel. render_reel with id "${r.id}" and shape "square" first, then attach again.`);
      return after(browser.toolAttach(a.handle, r.squarePath, `the square version of "${r.title}" (${r.squarePath})`, site));
    }
    return after(browser.toolAttach(a.handle, r.renderPath, `"${r.title}" (${r.renderPath})`, site));
  },

  browser_attach_slides: (a: z.infer<typeof S.browser_attach_slides>) => {
    const r = store.findReel(a.id);
    if (a.site === 'rewards') throw new Error('Slides are posted on a platform, then the post link is submitted on contentrewards.com.');
    const site: Site = a.site ?? 'instagram';
    const sp = seriesProblem(store.get().reels, store.get().posts, r, site, store.findAccount(a.handle ?? store.get().settings.handle).handle);
    if (sp) throw new Error(sp);
    const def = SLIDE_SITES[site];
    if (!def)
      throw new Error(
        site === 'youtube'
          ? `YouTube takes video only, and counts a video of still slides as low-effort: leave YouTube out for "${r.title}" and post one of the account's video styles there.`
          : `${SITE_LABEL[site]} takes one picture a post, not a slideshow: render_image with shape "pin" at the second of the slide that says the most and browser_attach_image, or post the video version (render_reel, browser_attach_reel).`,
      );
    const files = r.slides?.[def.shape];
    const size = SHAPE_SIZE[def.shape];
    if (!files?.length) throw new Error(`"${r.title}" has no ${def.shape} slides saved${r.slides ? ' (the shapes it has are for other platforms)' : ' yet'}. render_slides with id "${r.id}" and shape "${def.shape}" first (${SITE_LABEL[site]} gets ${size.w}x${size.h}), then attach again.`);
    if (files.length > def.max)
      throw new Error(
        `${SITE_LABEL[site]} takes ${def.max} pictures a post and "${r.title}" has ${files.length} slides. Post its video version there instead (render_reel${site === 'x' ? ' with shape "square"' : ''}, then browser_attach_reel), or, once the other platforms are done, render_slides with shape "${def.shape}" and times for the ${def.max} slides that tell it best.`,
      );
    const c = r.campaignId ? store.get().campaigns?.find((x) => x.id === r.campaignId) : undefined;
    if (c) {
      const problems = campaignProblems(r, c, store.findAccount(a.handle ?? store.get().settings.handle), site);
      if (problems.length) throw new Error(`"${r.title}" can't go up for "${c.title}" yet: ${problems.join('; ')}. update_reel fixes the caption.`);
    }
    return browser.toolAttachSlides(a.handle, files, `the ${files.length} slides of "${r.title}"`, site, a.ref);
  },

  browser_attach_image: (a: z.infer<typeof S.browser_attach_image>) => {
    if (a.site === 'rewards') throw new Error('Nothing is uploaded on contentrewards.com; post links are pasted there.');
    return browser.toolAttachImage(a.handle, a.path, a.site, a.ref);
  },

  save_long_video: (a: z.infer<typeof S.save_long_video>, ctx) => {
    const old = a.id ? store.findLongVideo(a.id) : null;
    const acct = a.handle ? store.findAccount(a.handle) : old ? store.findAccount(old.accountId) : store.findAccount(store.get().settings.handle);
    if (!acct.youtube?.enabled) throw new Error(`${acct.handle} has no YouTube channel turned on.`);
    // A section whose words did not change keeps its narration.
    const sections = a.sections?.map((s) => {
      const was = old?.sections.find((x) => x.text === s.text);
      return was ? { ...was, heading: s.heading, visual: s.visual, kip: s.kip ?? was.kip, kipVideo: (s.kip ?? was.kip) === was.kip ? was.kipVideo : undefined } : { heading: s.heading, text: s.text, visual: s.visual, kip: s.kip };
    });
    const v = store.saveLongVideo({
      id: a.id,
      accountId: acct.id,
      title: a.title,
      topic: a.topic,
      tools: a.tools,
      sections,
      description: a.description,
      tags: a.tags,
      thumbnailText: a.thumbnail_text,
      thumbnailBg: a.thumbnail_bg,
      thumbnailSide: a.thumbnail_side,
      thumbnailPath: a.thumbnail_path,
      stats: a.stats ? { views: Math.round(a.stats.views), likes: a.stats.likes, comments: a.stats.comments, ctr: a.stats.ctr, avgViewed: a.stats.avg_viewed, subs: a.stats.subs, at: new Date().toISOString() } : undefined,
      projectPath: a.project_path,
      videoPath: a.video_path,
      status: a.status,
      visibility: a.visibility,
      url: a.url,
    });
    ctx.focus({ page: 'long' });
    return ok(longLine(v, true));
  },

  list_long_videos: (a: z.infer<typeof S.list_long_videos>) => {
    if (a.id) return ok(longLine(store.findLongVideo(a.id), true));
    const list = store.get().longVideos ?? [];
    return ok(`${list.length ? list.map((v) => longLine(v, false)).join('\n') : 'No long videos yet. save_long_video starts one.'}\n\n${isLongform(store.get().settings) ? longformSteps() : LONG_VIDEO_STEPS}`);
  },

  narrate_long_video: async (a: z.infer<typeof S.narrate_long_video>) => {
    const r = await longVideo.narrate(a.id, a.redo);
    const total = r.video.sections.reduce((n, s) => n + (s.seconds ?? 0), 0);
    return ok(`Narrated ${r.bought} section${r.bought === 1 ? '' : 's'} (${r.credits.toLocaleString()} ElevenLabs credits)${r.notes.length ? `; ${r.notes.join('; ')}` : ''}. Speech in all: ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')}.\n${r.video.sections.map((s, i) => `${i + 1}. ${s.heading}: ${s.seconds ?? '?'}s → ${s.audio ?? 'not bought'}`).join('\n')}\nNext: the edit in Krypt Editor (16:9): import these files in order onto one audio track, then build the picture over them.`);
  },

  browser_attach_long: (a: z.infer<typeof S.browser_attach_long>) => {
    const v = store.findLongVideo(a.id);
    if (!v.videoPath) throw new Error(`"${v.title}" has no exported video yet: export it in Krypt Editor, then save_long_video with video_path.`);
    const acct = store.findAccount(v.accountId);
    return browser.toolAttach(a.handle ?? acct.handle, v.videoPath, `the long video "${v.title}" (${v.videoPath})`, 'youtube', { id: v.id, title: v.title });
  },

  show: (a: z.infer<typeof S.show>, ctx) => {
    if (a.reel_id) store.findReel(a.reel_id);
    ctx.focus({ page: a.page, reelId: a.reel_id });
    return ok(`Showing ${a.page}${a.reel_id ? ` (${a.reel_id})` : ''}.`);
  },
};

/** After a reel is attached: how to set its cover on this platform (Create > Thumbnails; Setup switch "covers"). */
async function coverNote(o: Promise<browser.Outcome>, r: Reel, site: Site): Promise<browser.Outcome> {
  const out = await o;
  const step = COVER_STEP[site];
  if (!out.ok || !step || store.get().settings.covers === false) return out;
  const note = r.cover?.path
    ? `COVER: this reel has its own cover → ${r.cover.path}. ${step}`
    : `COVER: this reel has no cover yet. Before Post: render_cover with id "${r.id}" (2-5 big words over its strongest frame), look at it, then: ${step}`;
  return { ...out, text: `${note}\n${out.text}` };
}

/** Validate a reel id up front for renderer tools, so a typo fails fast without waking the window. */
export function checkRendererArgs(name: string, args: unknown): void {
  if (name === 'preview_reel' || name === 'render_reel' || name === 'render_image' || name === 'render_slides' || name === 'render_cover') {
    const id = (args as { id?: string })?.id;
    const r = store.findReel(String(id));
    if (!presetById(r.preset)) throw new Error(`Reel ${r.id} uses an unknown preset "${r.preset}".`);
  }
  if (name === 'add_reference_video') {
    const bad = refs.problemWith(String((args as { path?: string })?.path ?? ''));
    if (bad) throw new Error(bad);
  }
}

const longStats = (s: import('../../shared/types').LongStats): string =>
  [`${s.views.toLocaleString('en-US')} views`, s.ctr !== undefined ? `${s.ctr}% click-through` : '', s.avgViewed !== undefined ? `${s.avgViewed}% watched on average` : '', s.likes !== undefined ? `${s.likes} likes` : '', s.comments !== undefined ? `${s.comments} comments` : '', s.subs !== undefined ? `${s.subs >= 0 ? '+' : ''}${s.subs} subscribers` : '', `read ${s.at.slice(0, 10)}`].filter(Boolean).join(', ');

/**
 * Long-form mode: where each channel stands against the user's plan, for get_today. '' in any other mode.
 * A new video is due when none is in progress, the week is not full and the last upload is long enough ago.
 */
function longformNote(extraRun: boolean): string {
  const d = store.get();
  if (!isLongform(d.settings)) return '';
  const plan = longformPlan(d.settings);
  const channels = d.igAccounts.filter((a) => a.youtube?.enabled);
  const head = `LONG-FORM CHANNEL: this profile runs a long-form YouTube channel, and long videos are its main work (list_long_videos has the steps and who does what: Krypt Editor makes the video, these tools pick it, package it, upload it and answer the comments). The user's plan: ${plan.perWeek === 0 ? 'no new long videos for now (0 a week)' : `${plan.perWeek} long video${plan.perWeek === 1 ? '' : 's'} a week`}, about ${plan.length} minutes each, uploaded as ${plan.visibility === 'public' ? 'Public' : 'Unlisted (the user publishes them)'}.${plan.perWeek > LONGFORM_SOFT_CAP ? ` That is more than the recommended ${LONGFORM_SOFT_CAP} a week (one a day): the user's own number, so work to it, and say in the report that many near-alike long videos in a week can read as mass-produced to YouTube.` : ''}`;
  if (extraRun) return `${head}\nThis is an extra run: no long-video work now.`;
  if (!channels.length) return `${head}\nNo account has YouTube turned on yet, so there is no channel to make them for: tell the user (Accounts page, or the setup wizard).`;
  const day = (t: number): string => new Date(t).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric' });
  const lines = channels.map((a) => {
    const st = longformState(d.longVideos ?? [], a.id, plan);
    const name = `${a.handle}${a.youtube?.channelName ? ` "${a.youtube.channelName}"` : ''}`;
    const week = `${st.week} uploaded in the last 7 days`;
    if (a.status === 'paused') return `- ${name}: PAUSED, leave it alone.`;
    if (st.open.length) {
      const v = st.open[0];
      return `- ${name}: ${week}. IN PROGRESS: ${v.id} "${v.title}" (${v.status}): carry it on this run (${NEXT_STEP[v.status]}).${st.open.length > 1 ? ` ${st.open.length - 1} more started and waiting: ${st.open.slice(1, 4).map((x) => `${x.id} "${x.title}" (${x.status})`).join(', ')}.` : ''}`;
    }
    if (st.due) return `- ${name}: ${week}. A NEW LONG VIDEO IS DUE: pick it from the channel (step 1) and take it as far as this run's time allows.`;
    return `- ${name}: ${week}. No new video this run${plan.perWeek === 0 ? '' : st.nextAt ? ` (the next comes due about ${day(st.nextAt)}, so they are spread over the week)` : ' (this week is full)'}: the channel work only.`;
  });
  return `${head}\n${lines.join('\n')}\nEvery run, on each channel: Studio's Comments (answer real ones, heart the good ones) and the numbers of uploaded videos (save_long_video with stats). A long video takes most of a run: where the time in the USAGE TIER line runs out, stop after a finished step and say in the report where it stands.`;
}

/** A long video for the AI: one line, or in full. */
function longLine(v: import('../../shared/types').LongVideo, full: boolean): string {
  const acct = store.get().igAccounts.find((x) => x.id === v.accountId);
  const ch = acct?.youtube?.channelName ?? acct?.handle ?? '?';
  const total = v.sections.reduce((n, x) => n + (x.seconds ?? 0), 0);
  const head = `${v.id} · "${v.title}" · ${v.status}${v.visibility ? ` (${v.visibility})` : ''} · channel ${ch} · ${v.sections.length} sections${total ? `, ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, '0')} narrated` : ''}${v.uploadedAt ? ` · up since ${v.uploadedAt.slice(0, 10)}` : ''}${v.stats ? ` · ${longStats(v.stats)}` : ''}${v.url ? ` · ${v.url}` : ''}`;
  if (!full) return head;
  return [
    head,
    `Folder: ${longVideo.dirOf(v)}`,
    ...v.sections.map((x, i) => `${i + 1}. ${x.heading}${x.seconds ? ` (${x.seconds}s)` : ''}${x.audio ? '' : ' [not narrated]'}${x.visual ? `\n   on screen: ${x.visual}` : ''}\n   ${x.text}`),
    v.description ? `Description:\n${v.description}` : 'Description: not written yet',
    v.tags?.length ? `Tags: ${v.tags.join(', ')}` : '',
    `Thumbnail: ${v.thumbnailText ?? 'no text yet'}${v.thumbnailPath ? ` → ${v.thumbnailPath}` : ''}`,
    v.projectPath ? `Project: ${v.projectPath}` : '',
    v.videoPath ? `Video: ${v.videoPath}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
