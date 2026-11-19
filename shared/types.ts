// Types shared by main (store + MCP) and the renderer (hub UI + reel engine).

import type { SavedVoice, VoiceTune } from './voice';
import type { SayAs } from './pronounce';
import type { RunUsage, UsageTier } from './aiUsage';

export type FieldValue = string | number | boolean;
export type Fields = Record<string, FieldValue>;

export type ReelStatus = 'draft' | 'rendered' | 'posted';

export interface ReelMetrics {
  views?: number;
  likes?: number;
  comments?: number;
  saves?: number;
  shares?: number;
  follows?: number;
  /** Accounts reached. */
  reach?: number;
  /** Average watch time, seconds. */
  avgWatch?: number;
  /** Instagram's skip rate, percent of views that swiped away in the first seconds. */
  skipRate?: number;
  /** Which platform the numbers are from (missing = Instagram). */
  site?: Site;
  at: string;
}

/** vertical = 1080x1920 (Instagram, TikTok, Shorts); square = 1080x1080 (X). */
export type RenderShape = 'vertical' | 'square';

export interface Reel {
  id: string;
  title: string;
  preset: string;
  fields: Fields;
  status: ReelStatus;
  renderPath?: string;
  /** The square (1080x1080) version for X: the vertical frame's content band on a blurred fill. */
  squarePath?: string;
  renderedAt?: string;
  renderSeconds?: number;
  caption?: string;
  hashtags?: string[];
  postedUrl?: string;
  postedAt?: string;
  /** The account (Instagram handle) that posted it, on any platform. */
  postedBy?: string;
  /** The same reel as a YouTube Short. */
  shortsUrl?: string;
  shortsPostedAt?: string;
  /** The same reel posted on X. */
  xUrl?: string;
  xPostedAt?: string;
  /** The same reel posted on TikTok. */
  tiktokUrl?: string;
  tiktokPostedAt?: string;
  /** The same reel on Facebook, Threads and Pinterest: its link and when. */
  links?: Partial<Record<LinkSite, { url: string; at: string }>>;
  /** Posted as a Trial Reel (shown to non-followers first). */
  trial?: boolean;
  /** Reel format it started from (shared/formats.ts). */
  format?: string;
  /** Hook test: reels sharing a group are versions of one idea with different openings. */
  group?: string;
  /** Version label in its group (A, B, C, ...). */
  variant?: string;
  /** The hook angle in a few words ("loss number first", "question"). */
  hook?: string;
  /** The kind of opening it has (shared/hooks.ts: outcome, pain, mistake, ...), for the hook style test. */
  hookStyle?: string;
  /** The reference video whose editing style it follows (RefVideo id). */
  like?: string;
  /** The channel style it was made in (shared/styles.ts; missing = main). */
  style?: string;
  /** A part of a comment vote story. */
  vote?: VoteStory;
  /** Newest last. */
  metrics?: ReelMetrics[];
  /** What the user thinks of it (Training page). */
  feedback?: ReelFeedback;
  createdAt: string;
  updatedAt: string;
}

/** The user's own verdict on a reel (Training page): their taste, next to what the numbers say. */
export interface ReelFeedback {
  /** 1 (never again) to 5 (more like this). */
  rating?: number;
  /** The opening on its own: 1 = liked it, -1 = did not. */
  hook?: 1 | -1;
  /** What they said about it. */
  note?: string;
  at: string;
}

/** Something the user told the AI on the Training page. A rule holds for every reel; more / less steer what gets made. */
export interface TrainingNote {
  id: string;
  at: string;
  kind: 'rule' | 'more' | 'less';
  /** What it is about, so the hook and topic sections can show their own. */
  about: 'general' | 'hooks' | 'topics';
  text: string;
}

/** A topic the user wants more or less of (a Krypt tool, or one they named). */
export interface TrainingTopic {
  /** "tool:<id>" for a krypt.cc tool, otherwise the name in lower case. */
  key: string;
  name: string;
  want: 'more' | 'less';
  at: string;
}

/** The Training brief: one page the AI writes from the user's verdicts and its own lessons. Runs read it in place of every single row. */
export interface TrainingBrief {
  text: string;
  at: string;
}

export interface Training {
  notes: TrainingNote[];
  topics: TrainingTopic[];
  brief?: TrainingBrief;
  /** When something the brief is written from last changed (a verdict, note, topic or lesson added, changed or removed). */
  touched?: string;
  /** The user pressed Update: the next AI that reads the Training writes the brief first. Cleared when one is saved. */
  briefAsked?: string;
}

export interface AccountSnapshot {
  handle: string;
  /** Which network the numbers are from (missing = Instagram). */
  site?: Site;
  followers: number;
  following: number;
  posts: number;
  at: string;
}

export type SessionAction = 'watch' | 'like' | 'save' | 'follow' | 'comment' | 'repost' | 'message';

export interface SessionItem {
  url: string;
  creator?: string;
  title?: string;
  actions: SessionAction[];
  note?: string;
}

export interface Session {
  id: string;
  kind: 'warmup' | 'engage' | 'post' | 'research' | 'inbox';
  handle: string;
  /** Which network (missing = Instagram). X sessions count toward X's limits only. */
  site?: Site;
  startedAt: string;
  minutes: number;
  niche?: string;
  likes: number;
  saves: number;
  follows: number;
  comments: number;
  /** X reposts. */
  reposts?: number;
  /** Direct messages sent (DM replies). */
  messages?: number;
  watched: number;
  notes?: string;
  items: SessionItem[];
  /** Reels/posts published in this session (older sessions: kind 'post' counts as one). */
  posts?: number;
  /** When each of those posts was sent (Post / Share / Publish pressed), so one that never went live can be given back. */
  postClicks?: string[];
  /** Posts given back because they never showed up on the profile (post_failed). */
  postsLost?: number;
  /** Still being recorded by the built-in browser (it counts every action itself). */
  live?: boolean;
  /** Last tool call of a recorded session. */
  endedAt?: string;
  /** Active milliseconds so far (idle gaps left out). */
  activeMs?: number;
}

export interface Reference {
  id: string;
  url: string;
  creator?: string;
  title?: string;
  notes?: string;
  tags: string[];
  savedAt: string;
}

// ── Reference videos ("edit like this") ─────────────────────────────────────
/** One stretch of a reference video: a shot (between two cuts) or a section (between two big on-screen changes). */
export interface RefShot {
  start: number;
  dur: number;
  /** 0 = a still frame or graphic, 1 = a lot of movement. */
  motion: number;
}

/** What the hub measured in a reference video. Numbers only; what the frames show is for the AI (or the user) to describe. */
export interface RefProfile {
  seconds: number;
  width: number;
  height: number;
  /** Between hard cuts. A text-and-graphics reel often has only one or two. */
  shots: RefShot[];
  /** Between big on-screen changes: every cut, plus a new headline or graphic coming in. This is the reel's rhythm. */
  sections: RefShot[];
  /** Seconds the opening holds before the first big change (the whole video when there is none). */
  hookHold: number;
  /** Typical shot length, seconds. */
  medianShot: number;
  /** Typical section length, seconds. */
  medianSection: number;
  /** Times anything visibly changes on screen (sections, plus single words or small graphics popping in), per second. */
  changesPerSec: number;
  /** Overall movement, 0..1. */
  motion: number;
  look: 'light' | 'dark' | 'mixed';
  /** Most common colours first; share is 0..1 of the picture. */
  colors: Array<{ hex: string; share: number }>;
  /** The most common vivid colour, if one stands out. */
  accent: string | null;
  audio: {
    present: boolean;
    /** Share of the time that is silent or nearly. */
    quiet: number;
    /** Steady tempo, when there is one. */
    bpm: number | null;
    /** How regular that beat is, 0..1. */
    beatStrength: number;
    /** Share of section changes that land on a beat (null without a beat or with too few changes). */
    cutsOnBeat: number | null;
  };
}

/** A video the user uploaded to copy the editing style of. Style only: its footage, sound and words are never reused. */
export interface RefVideo {
  id: string;
  name: string;
  /** The hub's own copy of the video. */
  file: string;
  /** Where it came from (the original path). */
  source?: string;
  /** What the frames show, in words: hook, captions, transitions. Written by the user or by an AI that looked at them. */
  notes?: string;
  profile: RefProfile;
  /** Pictures of it (JPEG paths): poster, the opening seconds, and one frame per shot. */
  sheets: { poster: string; hook: string; shots: string };
  addedAt: string;
}

/** What the renderer hands to main after analysing a video. */
export interface RefVideoInput {
  path: string;
  name?: string;
  notes?: string;
  profile: RefProfile;
  poster: Uint8Array;
  hook: Uint8Array;
  shots: Uint8Array;
}

/** Something we learned from results, kept so the next reels use it. */
export interface Learning {
  id: string;
  at: string;
  text: string;
  reelIds?: string[];
}

/** The on-device voice model (about 340 MB, downloaded once). */
export interface VoiceStatus {
  installed: boolean;
  installing: boolean;
  /** Bytes fetched so far in this download. */
  done: number;
  total: number;
  error: string | null;
}

/** The on-device speech-to-text model for clip captions (about 137 MB, downloaded on first use). */
export interface WhisperStatus extends VoiceStatus {
  /** The model folder once every file is in place, else null. */
  dir: string | null;
}

/** A markdown note in research/ (playbook, teardowns). */
export interface ResearchDoc {
  file: string;
  title: string;
  content: string;
  /** One of the user's own notes (saved by them or their AI): these can be deleted. The ones that come with the app cannot. */
  mine?: boolean;
}

export type AccountStatus = 'warming' | 'active' | 'paused';

export interface AccountSetup {
  avatar: boolean;
  bio: boolean;
  link: boolean;
  firstPost: boolean;
}

/** An Instagram account we run. It is signed in either inside the hub's own browser (one private session per account) or in the user's own Chrome (through the Krypt Marketo extension). */
/** A streamer whose clips the clipping style cuts into reels. */
export interface ClipSource {
  site: ClipSite;
  /** The channel name as in its address (kick.com/<channel>, twitch.tv/<channel>). */
  channel: string;
}
export type ClipSite = 'twitch' | 'kick';
export type ClipRange = 'day' | 'week';
export interface ClipSettings {
  sources: ClipSource[];
  /** Top clips of the last day or the last week. */
  range: ClipRange;
}
/** One clip from a streamer's clips page (top by views). */
export interface ClipListing {
  site: ClipSite;
  channel: string;
  url: string;
  title: string;
  seconds: number | null;
  views: number | null;
  /** As the page says it ("4 days ago"). */
  age: string;
  /** Where in the stream it starts (read off the clip page); null when the page does not say. */
  moment?: ClipMoment | null;
}

/**
 * Where a clip starts in its stream, for spotting the same moment clipped twice. Twitch: `twitch:<vod id>`, start in
 * seconds into that VOD ("Watch Full Video" link). Kick: `kick:<channel>`, start as unix seconds (the clip page's
 * chat replay starts there).
 */
export interface ClipMoment {
  stream: string;
  start: number;
}

export interface IgAccount {
  id: string;
  handle: string;
  /** Where it is signed in and driven: the hub's built-in browser, or the user's own Chrome through the extension (same device and fingerprint as their normal use). */
  browser?: 'hub' | 'chrome';
  /** false = Instagram is not run for this account (only its other platforms); the handle is then just the account's name. Missing = on. */
  instagram?: boolean;
  /** Legacy: the Chrome profile it used to be driven in (accounts that have one start out on 'chrome'). */
  chromeProfile?: string;
  /** The Chrome profile the user picked for it on the Setup page (Chrome's folder for it: "Default", "Profile 2"). Not set = automatic: the one signed in as the account. */
  chromeDir?: string;
  /** Instagram's numeric user id, saved the first time the signed-in handle was confirmed. */
  igUserId?: string;
  /** Watch only: on Instagram the browser refuses likes, saves, follows, comments and posts (e.g. while Instagram restricts the account). YouTube uploads are not affected. */
  watchOnly?: boolean;
  /** The account's YouTube channel, for uploading reels as Shorts. Runs in the same place as its Instagram (the hub's browser or the same Chrome profile). */
  youtube?: YtChannel;
  /** The account's X profile: engagement and posting there, with its own warm-up and limits. Runs in the same place as its Instagram. */
  x?: NetProfile;
  /** Posts a day the AI aims for on each platform (missing = DEFAULT_TARGETS); never above that day's post limit. */
  targets?: Partial<Record<Site, number>>;
  /** The user's own daily limits on each platform, in place of the recommended ones (shared/warmup.ts). A missing platform or key = the recommended number. */
  limits?: Partial<Record<Site, SiteLimits>>;
  /** The account's TikTok profile: the same, with TikTok's own warm-up and limits. */
  tiktok?: NetProfile;
  /** Its Facebook (a Page it posts as), Threads and Pinterest profiles, each with its own warm-up and limits. */
  facebook?: NetProfile;
  threads?: NetProfile;
  pinterest?: NetProfile;
  niche?: string;
  /** When it followed each of Krypt's accounts (shared/kryptFollow.ts, keyed by kryptKey: the platform for Krypt's first account there, "site:handle" for the others); done once each. */
  kryptFollowed?: Partial<Record<string, string>>;
  /** When it last looked in on each of Krypt's accounts (watching its newest posts, liking; same keys). */
  kryptVisited?: Partial<Record<string, string>>;
  /** When it last reposted one of Krypt's posts on each platform (one a day per platform, keyed by the platform). */
  kryptReposted?: Partial<Record<string, string>>;
  /** Which of Krypt's accounts each follow went to (its id, else its handle), so a corrected id gets followed again (same keys). */
  kryptFollowedTo?: Partial<Record<string, string>>;
  /** When it last commented on one of each Krypt account's posts (as far as the hub could tell; same keys). */
  kryptCommented?: Partial<Record<string, string>>;
  /** Channel styles it runs (Styles page, shared/styles.ts), main first. Missing = just the main style. */
  styles?: string[];
  /** Clipping style: whose Twitch / Kick clips to cut into reels, and how far back to look (Styles page, shared/clipping.ts). */
  clipping?: ClipSettings;
  /** The share of reels each of its styles gets, in percent (Styles page). Missing = the main style half, the others the rest. */
  styleMix?: Record<string, number>;
  status: AccountStatus;
  /** Local date (YYYY-MM-DD) the account was made. */
  createdOn: string;
  /** Local date warm-up day 1 counts from. */
  warmupStart: string;
  setup: AccountSetup;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** A YouTube channel linked to an account. Only uploading Shorts is done there. */
export interface YtChannel {
  enabled: boolean;
  /** The channel id (UC…) seen in YouTube Studio, saved the first time; another channel signed in there locks the buttons. */
  channelId?: string;
  channelName?: string;
  /** When Shorts were published (ISO), newest last; counts the day's uploads. */
  uploads?: string[];
}

/** An X or TikTok profile linked to an account. */
export interface NetProfile {
  enabled: boolean;
  /** The handle there (it can differ from the Instagram one). Empty = the first one seen signed in becomes it. */
  handle?: string;
  /** The network's numeric user id (X: twid cookie; TikTok: multi_sids), saved the first time the handle was confirmed. */
  userId?: string;
  /** Local date (YYYY-MM-DD) that network's warm-up day 1 counts from. */
  warmupStart: string;
  /** Watch only there: no likes, reposts/favorites, follows, replies/comments or posts. */
  watchOnly?: boolean;
}
export type XProfile = NetProfile;

export type ElevenModel = 'eleven_multilingual_v2' | 'eleven_flash_v2_5' | 'eleven_v3';
export interface ElevenVoice {
  id: string;
  name: string;
  /** premade, cloned, professional, generated */
  category: string;
  preview?: string;
  about?: string;
}
/** A voice in ElevenLabs' public Voice Library (Voices page, "Top ElevenLabs voices"). */
export interface LibraryVoice {
  id: string;
  /** Its public owner, needed to add it to an account. */
  owner: string;
  name: string;
  /** Gender, accent, age, style, use. */
  about: string;
  /** Sample MP3 (public; plays without a key). */
  preview: string;
  /** Characters spoken with it over the last year (how popular it is). */
  uses: number;
  useCase: string;
}
export type LibrarySort = 'trending' | 'usage_character_count_1y' | 'cloned_by_count';

export interface ElevenSettings {
  /** Model for final renders (default Multilingual v2). */
  model?: ElevenModel;
  /** Most credits to spend per billing cycle (0 / unset = the plan's whole allowance). */
  budget?: number;
  /** The free on-device voice previews use while a reel's ElevenLabs lines aren't bought yet. */
  standin?: string;
  /** The account's voices, as last listed. */
  voices?: ElevenVoice[];
  /** Credits used when today started (for today's share of the budget). */
  day?: { date: string; startUsed: number };
}
export interface ElevenStatus {
  hasKey: boolean;
  tier?: string;
  /** Credits used this billing cycle (whole account). */
  used?: number;
  /** The plan's credits per cycle. */
  limit?: number;
  /** min(limit, budget). */
  cap?: number;
  resetAt?: string;
  todaySpent?: number;
  todayAllowance?: number;
  error?: string;
}
export interface ElevenTtsRequest {
  voice: string;
  text: string;
  speed: number;
  /** The lines around it, so the delivery flows (not spoken, not billed). */
  prev?: string;
  next?: string;
}
export interface ElevenTtsResult {
  audio: Uint8Array;
  alignment?: { chars: string[]; starts: number[]; ends: number[] };
  model: string;
  credits: number;
  note?: string;
}

export type Site = 'instagram' | 'youtube' | 'x' | 'tiktok' | 'facebook' | 'threads' | 'pinterest';
/** The networks run with their own warm-up next to Instagram. */
export type Network = 'x' | 'tiktok' | 'facebook' | 'threads' | 'pinterest';
/** The platforms whose reel links live in Reel.links. */
export type LinkSite = 'facebook' | 'threads' | 'pinterest';

/** An account's X or TikTok window, as the hub sees it. */
export interface NetStatus {
  open: boolean;
  loggedIn: boolean;
  /** The handle seen signed in there. */
  signedInAs?: string;
  /** Chrome accounts: the connected extension is too old for this network. */
  outdated?: boolean;
  url?: string;
}

/** Create (no id) or patch (id) an account. */
/** One part of a comment vote story: viewers pick A or B in the comments, the winner decides the next part. */
export interface VoteStory {
  /** The series' name (the same on every part). */
  series: string;
  part: number;
  a: string;
  b: string;
  /** Counted from the comments (record_votes). */
  votes?: { a: number; b: number; at: string };
  winner?: 'a' | 'b';
  /** The last part of the series. */
  finale?: boolean;
}

export type AccountInput = Partial<Omit<IgAccount, 'createdAt' | 'updatedAt' | 'setup'>> & { setup?: Partial<AccountSetup> };

/** What the hub counts and limits per platform per day; gap = minutes between two posts there. */
export type LimitKey = 'minutes' | 'likes' | 'saves' | 'follows' | 'comments' | 'posts' | 'reposts' | 'messages' | 'gap';
/** The user's own number for each limit they changed. They are the user's to set: there is no upper bound. */
export type SiteLimits = Partial<Record<LimitKey, number>>;

/** Krypt's tools (creator program), the user's own business, or a clip channel (clipping style only). */
export type PromoteMode = 'krypt' | 'own' | 'clips';
export interface PromoteModeSave {
  brand?: Brand;
  /** Account id → its styles and style mix while this mode was on. */
  styles?: Record<string, { styles?: string[]; styleMix?: Record<string, number> }>;
}

export interface Settings {
  /** The active account (Dashboard, defaults for tools). */
  handle: string;
  outputDir: string;
  fps: number;
  /** MCP tools answer only while this is on (Connect page switch). */
  agentAccess: boolean;
  /** When this install first ran (backfilled from the oldest session). Krypt reposts start two weeks after it (shared/kryptFollow.ts). */
  firstRunAt?: string;
  /** What this profile promotes (Setup and the wizard). Missing on older data: worked out from the brand and the accounts' styles. */
  promoting?: PromoteMode;
  /** Each mode's own copy, kept when switching away so switching back restores it: the brand form, and every account's styles. */
  brandModes?: Partial<Record<PromoteMode, PromoteModeSave>>;
  /** The voice new story reels start with (Voices page). Not set = the built-in default. */
  voice?: VoiceTune;
  /** ElevenLabs (the user's own key; Voices page). */
  eleven?: ElevenSettings;
  /** The user's "say it like this" list for the narrator (Voices page). */
  sayAs?: SayAs[];
  /** Ask the user before an AI posts, comments, messages, unfollows or reposts (Accounts page). Off by default: those go through at once, still inside the daily limits. Deletes, blocks, reports and account settings always ask. */
  askApproval?: boolean;
  /** Autopilot (Autopilot page): the AI app Windows starts a few times a day to run Marketo. */
  autopilot?: AutopilotSettings;
  /** Sound off everywhere in Marketo: the hub, its browser windows and the Chrome tabs it drives (sidebar button). */
  mute?: boolean;
  /** Mute Marketo while none of its windows is in front (Setup page). */
  autoMute?: boolean;
  /** Who picks each reel's topic: the AI (the queue still comes first), or only the user's queue (Create > Next run). Missing = the AI. */
  reelPick?: 'ai' | 'me';
  /** How much the runs experiment (Styles page). Missing = balanced. */
  variety?: Variety;
  /** Voice test (Voices page): ElevenLabs voices ("el:<id>") rotated with the default voice on story reels until each has measured posts on every platform. */
  voiceTest?: string[];}

export type AutopilotAi = 'claude' | 'codex';
export interface AutopilotSettings {
  on: boolean;
  ai: AutopilotAi;
  /** Local times of day, HH:MM. */
  times: string[];
  /** The exact minute each run starts (times plus a random 0-29 min), re-picked daily so runs aren't at the same minute every day. */
  picked?: string[];
  /** Local date (YYYY-MM-DD) the minutes were last picked. */
  pickedOn?: string;
  /** The model the runs use (what the AI app's model option takes). Missing = the app's own setting. */
  model?: string;
  /** Token saver: the AI app summarises its conversation earlier, so each step re-reads less. */
  saver?: boolean;
  /** Usage tier (shared/aiUsage.ts): how much one run takes on. Missing = max (full runs, as before tiers). */
  tier?: UsageTier;
}
export interface AutopilotReport {
  file: string;
  /** When the run started (local, YYYY-MM-DDTHH:MM). */
  at: string;
  running: boolean;
  ended: boolean;
  /** The report's "NEEDS YOU" lines. */
  needs: string[];
  /** Sign-in / login warnings and errors from the AI app. */
  warnings: string[];
  text: string;
  /** The profile it worked on (id and name), when the hub has more than one. */
  profileId?: string;
  profile?: string;
  /** The tokens it used, when the AI app reports them. */
  usage?: RunUsage;
}
export interface AutopilotStatus extends AutopilotSettings {
  /** Windows only for now. */
  supported: boolean;
  ais: Array<{ id: AutopilotAi; name: string; found: boolean; path?: string; client: string; note?: string; /** Marketo can pick this app's model for the runs. */ picksModel?: boolean; /** It reports the tokens a run used. */ measured?: boolean; /** The token saver works with it. */ saves?: boolean }>;
  /** What runs and the built-in chat used over the last 30 days, oldest first. */
  usage: RunUsage[];
  task: { registered: boolean; nextRun?: string; lastRun?: string; lastResult?: number; state?: string };
  running: boolean;
  reports: AutopilotReport[];
  folder: string;
  prompt: string;
  /** The profiles a run works through, when the hub has more than one. */
  profiles?: string[];
}

/** What the reels are for. Turned into the instructions every connected AI gets. */
export interface Brand {
  /** Brand / product name ("" until set up). */
  name: string;
  /** One or two sentences: what it is and who it is for. */
  what: string;
  /** Site or link the end card shows (no protocol), e.g. "krypt.cc". */
  site: string;
  /** Topics the account posts about. */
  niche: string;
  /** How the copy should sound. */
  voice: string;
  /** Claims and words that must never appear. */
  never: string;
  /** Small print added where it applies, e.g. "Not financial advice." */
  disclaimer: string;
  /** Square logo image (path) for end cards and product cards. Empty = the Krypt logo. */
  logo: string;
  /** First-run setup finished. */
  setupDone: boolean;
  /** Krypt creator program (only while the brand is Krypt): where Krypt pays this user, and their referrer address. */
  creator?: KryptCreator;
}

/** A Marketo user who runs Krypt videos. Krypt pays them by hand; they claim in the Krypt Discord. */
export interface KryptCreator {
  /** Solana address: donations they bring in are sent here, and people enter it as the referrer in Krypto Mirror and Krypto Bot. */
  wallet: string;
  /** Their Discord name, so Krypt can match their claims. */
  discord: string;
  /** Their own never-expiring invite to the Krypt Discord (discord.gg/…), so the people they bring in are counted as theirs. */
  invite?: string;
}

/** The built-in chat agent (bring your own API key; any OpenAI-compatible endpoint). */
export interface AgentConfig {
  provider: string;
  baseUrl: string;
  model: string;
  /** Send preview frames / screenshots to the model as images. */
  vision: boolean;
}

/** One post that went up on a platform, made with Marketo or not. The AI checks this before making a reel so it doesn't repeat itself. */
export interface PostLog {
  id: string;
  /** Normalized link (shared/posts.ts postKey): the same post is logged once. */
  key: string;
  site: Site;
  /** The Marketo account (its Instagram handle). */
  handle: string;
  /** The name on that platform (@kryptfarm, "krypt cc", @yuhgosl), when it differs. */
  account?: string;
  url: string;
  postedAt?: string;
  /** What it is, one line (the title or the caption's first line). */
  title: string;
  /** The story or angle, so a later reel can avoid repeating it. */
  topic?: string;
  /** krypt_tools ids it features. */
  tools?: string[];
  kind?: 'video' | 'short' | 'text' | 'image' | 'live';
  views?: number;
  likes?: number;
  comments?: number;
  reelId?: string;
  /** marketo = posted through the hub (mark_posted); imported = read off the profile. */
  source: 'marketo' | 'imported';
  addedAt: string;
  updatedAt?: string;
}

export interface Db {
  version: 1;
  settings: Settings;
  /** Follower snapshots (all accounts). */
  accounts: AccountSnapshot[];
  igAccounts: IgAccount[];
  sessions: Session[];
  reels: Reel[];
  /** Every post on every platform (see PostLog). */
  posts: PostLog[];
  references: Reference[];
  /** Uploaded videos to copy the editing style of. */
  refVideos: RefVideo[];
  learnings: Learning[];
  /** What the user told the AI about their taste (Training page). Missing = nothing yet. */
  training?: Training;
  /** Voices the user tuned and named (Voices page). */
  voices: SavedVoice[];
  brand: Brand;
  agent: AgentConfig;
  /** What the user wants the next autopilot run to do (Create > Next run). Missing = nothing. */
  nextRun?: NextRun;
  /** The user's own channel styles (Styles page). */
  customStyles?: CustomStyle[];
  /** Reels the AI suggested and the user has not queued or dropped yet, newest first. */
  reelIdeas?: ReelIdea[];
}

/** The user's instructions for the next autopilot run. Handed to one run, then kept in `done`. */
export interface NextRun {
  note?: {
    text: string;
    setAt: string;
    /** The run it was handed to (its report file), from the moment that run read it. */
    givenTo?: string;
    givenAt?: string;
  };
  /** What the runs after that one do, in order: when the note is used, the first of these becomes the note. */
  queue?: QueuedRun[];
  /** Notes that runs have used, newest first. */
  done?: Array<{ text: string; setAt: string; usedAt: string; report?: string }>;
}

/** A channel style of the user's own (Styles page): written rules on top of one of the built-in styles. */
export interface CustomStyle {
  id: string;
  /** The short word the user calls it ("run the speedrun style"). */
  label: string;
  name: string;
  about: string;
  /** How a video in this style is made, for the AI that makes it. */
  rules: string;
  /** The built-in style it builds on (its format and preview are used). */
  base: string;
  createdAt: string;
  updatedAt: string;
}

export type StyleInput = { id?: string; name: string; label?: string; about?: string; rules: string; base?: string };

/** One set of instructions waiting in the reel queue (Create > Next run). */
export interface QueuedRun {
  id: string;
  text: string;
  addedAt: string;
}

/** A reel the AI suggests. The user queues it or drops it (Create > Next run). */
export interface ReelIdea {
  id: string;
  topic: string;
  /** The opening line it would start with. */
  hook?: string;
  /** Channel style id (shared/styles.ts). */
  style?: string;
  /** One line on why it should work. */
  why?: string;
  at: string;
}

/** How much the runs experiment with openings, art styles and voices: none, the usual test-then-lean, or always. */
export type Variety = 'proven' | 'balanced' | 'experimental';

/** What deleting reels did. */
export interface DeleteReelsResult {
  deleted: number;
  /** Video files moved to the Recycle Bin / Trash. */
  trashed: number;
  /** Video files that could not be moved (still on disk). */
  failed: string[];
}

export interface ActionResult<T = undefined> {
  ok: boolean;
  message?: string;
  data?: T;
}

// ── MCP ─────────────────────────────────────────────────────────────────────
export interface McpActivity {
  id: string;
  ts: number;
  client: string;
  tool: string;
  args: string;
  state: 'running' | 'ok' | 'error';
  ms: number;
  result: string;
}

export interface McpClientInfo {
  id: number;
  name: string;
  since: number;
  calls: number;
}

export interface McpStatus {
  enabled: boolean;
  listening: boolean;
  error: string | null;
  clients: McpClientInfo[];
  activity: McpActivity[];
  shimPath: string | null;
  exePath: string;
  toolCount: number;
  installCommand: string;
}

/** A tool call the main process hands to the renderer (preview / render need canvas + WebCodecs). */
export interface McpToolCall {
  rid: number;
  tool: string;
  args: unknown;
  client: string;
}

export interface McpToolResult {
  ok: boolean;
  text: string;
  images?: Array<{ data: string; mimeType: string }>;
}

/** Main → renderer: "show this" (the hub follows what the agent is doing). */
export interface UiFocus {
  page: PageId;
  reelId?: string;
}

export type PageId = 'dashboard' | 'styles' | 'warming' | 'accounts' | 'next-run' | 'studio' | 'examples' | 'library' | 'results' | 'research' | 'train-rank' | 'train-hooks' | 'train-topics' | 'train-notes' | 'voices' | 'krypt' | 'chat' | 'agents' | 'autopilot' | 'usage' | 'kip' | 'setup';

// ── Instagram browser ───────────────────────────────────────────────────────
/** One account's Instagram session, in the hub's browser or in the user's Chrome. */
export interface BrowserStatus {
  accountId: string;
  handle: string;
  via: 'hub' | 'chrome';
  /** Chrome accounts: a Chrome profile with the extension is connected for it. */
  connected?: boolean;
  /** Its window (or Chrome tab) is open. */
  open: boolean;
  /** Instagram session cookies are present. */
  loggedIn: boolean;
  /** The handle Instagram shows as signed in, once seen. */
  signedInAs?: string;
  url?: string;
  /** Its YouTube channel, when the account has one turned on. */
  youtube?: {
    open: boolean;
    /** Google / YouTube session cookies are present. */
    loggedIn: boolean;
    /** Chrome accounts: the connected extension is too old for YouTube (it has to be reloaded). */
    outdated?: boolean;
    url?: string;
  };
  /** Its X profile, when the account has X turned on. */
  x?: NetStatus;
  /** Its TikTok profile, when the account has TikTok turned on. */
  tiktok?: NetStatus;
  facebook?: NetStatus;
  threads?: NetStatus;
  pinterest?: NetStatus;
}

/** The Krypt Marketo Chrome extension, as the hub sees it. */
export interface ChromeStatus {
  /** The folder to pick in Chrome's "Load unpacked". */
  extensionDir: string | null;
  /** The version of the extension in that folder (what Chrome should be running). */
  extensionVersion?: string;
  /** Chrome has been told where the hub's helper is. */
  registered: boolean;
  error?: string;
  /** One per Chrome profile that has the extension and is running. */
  profiles: Array<{ id: number; loggedIn: boolean; userId?: string; me?: string; tabOpen: boolean; stopped: boolean; version: string; ytLoggedIn?: boolean; xLoggedIn?: boolean; ttLoggedIn?: boolean; nets?: Partial<Record<Network, boolean>>; /** The Chrome profile folder it is in, when the hub can tell. */ dir?: string }>;
  /** Every Chrome profile on this computer, as Chrome's own profile picker lists them (the picker on the Setup page). The email stays in the hub window. */
  local: Array<{ dir: string; name: string; email: string; hasExtension: boolean; connected: boolean }>;
  /** Connected Chrome profiles the hub cannot tell apart (an extension from before 0.8 in more than one of them). */
  unplaced: number;
}

export type ApprovalKind = 'comment' | 'post' | 'message' | 'profile' | 'unfollow' | 'other';

/** Something an AI wants to do on Instagram that the user has to allow first. */
export interface Approval {
  id: string;
  handle: string;
  kind: ApprovalKind;
  /** What will happen, in words ("Post this comment"). */
  action: string;
  /** The text that will be posted, if any. */
  text?: string;
  url: string;
  client: string;
  createdAt: number;
  state: 'pending' | 'approved' | 'rejected' | 'expired' | 'done';
  /** Went through without asking (approvals switched off). */
  auto?: boolean;
}

/** An AI app the hub can connect itself to. */
export interface ClientInfo {
  id: string;
  name: string;
  /** Where its MCP config lives (shown to the user). */
  configPath: string;
  /** The app looks installed on this computer. */
  detected: boolean;
  /** Krypt Marketo is in its config. */
  connected: boolean;
  /** What the user does after connecting. */
  hint: string;
}

// ── Built-in agent ──────────────────────────────────────────────────────────
export interface ChatStep {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'error';
  text: string;
  /** Tool steps: the tool's name and how it ended. */
  tool?: string;
  state?: 'running' | 'ok' | 'error';
  images?: Array<{ data: string; mimeType: string }>;
}

export interface ChatState {
  busy: boolean;
  hasKey: boolean;
  steps: ChatStep[];
}

/** Kip, the hub's manager (the Kip page): his chat, and whether he can think (he uses the user's Claude Code). */
export interface KipState {
  available: boolean;
  /** Why he cannot answer, when he cannot. */
  reason?: string;
  busy: boolean;
  steps: ChatStep[];
}

export interface RenderProgress {
  reelId: string;
  ratio: number;
  phase: string;
}

/** One complete, separate set of everything the hub keeps: accounts, brand, reels, post log, Training, learnings, notes, settings. */
export interface ProfileInfo {
  id: string;
  name: string;
  createdAt: string;
  /** The one that is open now. */
  active: boolean;
  /** Scheduled autopilot runs work on it. */
  autopilot: boolean;
}

/** What the profile calls answer with. */
export interface ProfilesResult {
  ok: boolean;
  message?: string;
  data?: ProfileInfo[];
}

/** This install's version, and the newer one on krypt.cc when there is one (the hub never updates itself). */
export interface UpdateInfo {
  current: string;
  latest?: string;
  url?: string;
  notes?: string;
  checkedAt?: string;
}

export interface MarketoApi {
  app: {
    version(): Promise<string>;
    update(): Promise<UpdateInfo>;
    profiles(): Promise<ProfileInfo[]>;
    /** New profile, empty or with this one's settings and voices (never its accounts, brand or content). */
    createProfile(name: string, copySettings: boolean): Promise<ProfilesResult>;
    renameProfile(id: string, name: string): Promise<ProfilesResult>;
    /** Its folder goes to the Recycle Bin. */
    deleteProfile(id: string): Promise<ProfilesResult>;
    /** Open it: the window reloads on that profile. */
    useProfile(id: string): Promise<ProfilesResult>;
    setProfileAutopilot(id: string, on: boolean): Promise<ProfilesResult>;
    /** Where the shipped example videos are, and which ones exist. */
    examples(): Promise<{ dir: string; have: string[] }>;
    openExternal(url: string): Promise<void>;
    showItemInFolder(p: string): Promise<void>;
    pickFile(kind: 'video' | 'audio' | 'image'): Promise<string | null>;
    pickDirectory(): Promise<string | null>;
    copyText(text: string): Promise<void>;
    mediaUrl(p: string): string;
    /** The path of a file dropped onto the window. */
    pathForFile(file: File): string;
  };
  db: {
    get(): Promise<Db>;
    onChanged(cb: (db: Db) => void): () => void;
    updateReel(id: string, patch: Partial<Reel>): Promise<ActionResult<Reel>>;
    createReel(preset: string, title?: string, format?: string): Promise<ActionResult<Reel>>;
    deleteLearning(id: string): Promise<ActionResult>;
    /** Training page: the user's verdict on a reel (fields left out stay; null clears one). */
    reelFeedback(id: string, patch: { rating?: number | null; hook?: 1 | -1 | null; note?: string | null }): Promise<ActionResult<Reel>>;
    addTrainingNote(note: { kind: TrainingNote['kind']; about?: TrainingNote['about']; text: string }): Promise<ActionResult<TrainingNote>>;
    deleteTrainingNote(id: string): Promise<ActionResult>;
    /** want null = back to normal (the topic is dropped from the list). */
    setTrainingTopic(topic: { key?: string; name: string; want: TrainingTopic['want'] | null }): Promise<ActionResult>;
    /** Training pages, Update: mark the brief as wanted, so the next AI that reads the Training writes it. */
    askBrief(): Promise<ActionResult>;
    duplicateReel(id: string): Promise<ActionResult<Reel>>;
    deleteReel(id: string): Promise<ActionResult>;
    /** Remove reels from the hub; with trashFiles their rendered videos go to the Recycle Bin / Trash. */
    deleteReels(ids: string[], trashFiles: boolean): Promise<ActionResult<DeleteReelsResult>>;
    updateSettings(patch: Partial<Settings>): Promise<ActionResult<Settings>>;
    deleteReference(id: string): Promise<ActionResult>;
    saveAccount(a: AccountInput): Promise<ActionResult<IgAccount>>;
    /** The user's instructions for the next autopilot run ('' clears them). */
    setNextRun(text: string): Promise<ActionResult>;
    /** The reel queue (Create > Next run). */
    /** The user's own channel styles (Styles page). */
    saveStyle(input: StyleInput): Promise<ActionResult>;
    deleteStyle(id: string): Promise<ActionResult>;
    queueRun(text: string): Promise<ActionResult>;
    unqueueRun(id: string): Promise<ActionResult>;
    moveQueued(id: string, by: -1 | 1): Promise<ActionResult>;
    /** A reel idea from the AI: into the queue, or gone. */
    queueIdea(id: string): Promise<ActionResult>;
    dropIdea(id: string): Promise<ActionResult>;
    deleteAccount(id: string): Promise<ActionResult>;
  };
  research: {
    docs(): Promise<ResearchDoc[]>;
    /** Delete one of the user's own playbook notes (by file name). It is kept in the playbook's "deleted" folder. */
    deleteNote(file: string): Promise<ActionResult>;
  };
  voice: {
    /** Where the Kokoro model is (the hub's own copy, or Krypt Editor's / Studio's); dir null = not installed. */
    model(): Promise<{ dir: string | null; voices: string[] }>;
    status(): Promise<VoiceStatus>;
    onStatus(cb: (s: VoiceStatus) => void): () => void;
    /** Start downloading the voice model; progress arrives through onStatus. */
    install(): Promise<void>;
    /** Path of a cached clip in the voice folder, or null. */
    find(name: string): Promise<string | null>;
    save(name: string, data: Uint8Array): Promise<ActionResult<string>>;
    /** Save a tuned voice under a name (same name = replace). */
    saveVoice(v: VoiceTune & { name: string; id?: string }): Promise<ActionResult<SavedVoice>>;
    deleteVoice(id: string): Promise<ActionResult>;
  };
  whisper: {
    status(): Promise<WhisperStatus>;
    onStatus(cb: (s: WhisperStatus) => void): () => void;
    /** Start downloading the speech-to-text model; progress arrives through onStatus. */
    install(): Promise<void>;
  };
  browser: {
    status(): Promise<BrowserStatus[]>;
    onStatus(cb: (s: BrowserStatus[]) => void): () => void;
    /** Open the account's Instagram (or YouTube Studio) window, to sign in or to watch. */
    open(accountId: string, url?: string, site?: Site): Promise<ActionResult>;
    close(accountId: string, site?: Site): Promise<ActionResult>;
    /** Sign the account out here: closes the window and wipes its session. */
    clear(accountId: string): Promise<ActionResult>;
  };
  refs: {
    /** Store an analysed reference video (the hub keeps its own copy of the file). */
    add(input: RefVideoInput): Promise<ActionResult<RefVideo>>;
    update(id: string, patch: { name?: string; notes?: string }): Promise<ActionResult<RefVideo>>;
    delete(id: string): Promise<ActionResult>;
  };
  autopilot: {
    status(): Promise<AutopilotStatus>;
    enable(input: { ai: AutopilotAi; times: string[]; model?: string }): Promise<ActionResult<AutopilotStatus>>;
    /** Which model the runs use ('' = the AI app's own setting). */
    setModel(model: string): Promise<ActionResult<AutopilotStatus>>;
    setSaver(on: boolean): Promise<ActionResult<AutopilotStatus>>;
    /** Pick a usage tier: sets the model, run times and token saver to the tier's, and sizes each run to it. */
    setTier(tier: UsageTier): Promise<ActionResult<AutopilotStatus>>;
    disable(): Promise<ActionResult<AutopilotStatus>>;
    runNow(): Promise<ActionResult<AutopilotStatus>>;
    openFolder(): Promise<void>;
  };
  chrome: {
    status(): Promise<ChromeStatus>;
    onStatus(cb: (s: ChromeStatus) => void): () => void;
    /** Open a window of that Chrome profile (its folder, from the status list). */
    open(dir: string): Promise<ActionResult>;
  };
  approvals: {
    list(): Promise<Approval[]>;
    onChanged(cb: (a: Approval[]) => void): () => void;
    answer(id: string, approve: boolean): Promise<void>;
  };
  brand: {
    save(patch: Partial<Brand>): Promise<ActionResult<Brand>>;
  };
  kip: {
    state(): Promise<KipState>;
    onState(cb: (s: KipState) => void): () => void;
    send(text: string): Promise<void>;
    stop(): Promise<void>;
    reset(): Promise<void>;
  };
  agent: {
    state(): Promise<ChatState>;
    onState(cb: (s: ChatState) => void): () => void;
    saveConfig(patch: Partial<AgentConfig>, apiKey?: string): Promise<ActionResult>;
    models(): Promise<ActionResult<string[]>>;
    send(text: string): Promise<void>;
    stop(): Promise<void>;
    reset(): Promise<void>;
  };
  /** Stream clips for the clipping style (electron/clips.ts). */
  clips: {
    /** Download a Twitch / Kick clip the way its page plays it. */
    fetch(url: string): Promise<ActionResult<{ bytes: Uint8Array; kind: 'mp4' | 'ts'; site: ClipSite; channel: string; url: string; title: string; moment: ClipMoment | null }>>;
    /** Save a clip MP4 in the output folder's Clips folder; returns its path. */
    save(bytes: Uint8Array, name: string): Promise<ActionResult<string>>;
    /** Keep a saved clip's length and speech; returns the reels whose clip is the same moment. */
    check(url: string, seconds: number, said: string): Promise<ActionResult<string[]>>;
  };
  /** Screen recordings for screen-tutorial reels (record_screen). */
  screen: {
    /** The bundled recordings of the Krypt apps (resources/tools/<tool id>.mp4). */
    toolClips(): Promise<{ dir: string; have: string[] }>;
    /** Open windows that can be recorded. */
    sources(): Promise<ActionResult<Array<{ id: string; name: string }>>>;
    /** Start an app by path or Start menu name; returns its name. */
    launch(target: string): Promise<ActionResult<string>>;
    /** Save a recording in the output folder; returns its path. */
    save(bytes: Uint8Array, name: string): Promise<ActionResult<string>>;
  };
  eleven: {
    status(refresh?: boolean): Promise<ElevenStatus>;
    setKey(key: string): Promise<ActionResult<ElevenStatus>>;
    voices(): Promise<ActionResult<ElevenVoice[]>>;
    /** Add a Voice Library voice (link or id) to the account's voices. */
    addVoice(input: string, name?: string, owner?: string): Promise<ActionResult<ElevenVoice>>;
    /** The Voice Library's top voices right now (needs the key). */
    library(sort: LibrarySort, useCase?: string): Promise<ActionResult<LibraryVoice[]>>;
    tts(req: ElevenTtsRequest): Promise<ActionResult<ElevenTtsResult>>;
  };
  render: {
    /** Write a finished render to disk and mark the reel rendered. */
    save(reelId: string, data: Uint8Array, seconds: number, shape?: RenderShape): Promise<ActionResult<string>>;
    /** Write one frame (base64 PNG) next to the renders; returns its path. */
    saveImage(reelId: string, png: string, t: number, shape?: RenderShape): Promise<ActionResult<string>>;
  };
  ui: {
    onFocus(cb: (f: UiFocus) => void): () => void;
  };
  mcp: {
    status(): Promise<McpStatus>;
    onStatus(cb: (s: McpStatus) => void): () => void;
    setEnabled(on: boolean): Promise<McpStatus>;
    clients(): Promise<ClientInfo[]>;
    connect(clientId: string): Promise<ActionResult>;
    disconnect(clientId: string): Promise<ActionResult>;
    /** The JSON block for any other MCP client. */
    genericConfig(): Promise<string>;
    serve(run: (call: McpToolCall, progress: (fraction: number, message: string) => void) => Promise<McpToolResult>): () => void;
  };
}
