// Types shared by main (store + MCP) and the renderer (hub UI + reel engine).

import type { SavedVoice, VoiceTune } from './voice';
import type { SayAs } from './pronounce';
import type { RunUsage, UsageTier } from './aiUsage';
import type { PerfReadout, PerfSettings, ProcessReadout } from './perf';

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
/** Pictures also come as portrait = 1080x1350 (4:5: Instagram, Threads, Facebook and X photo posts) and pin = 1080x1620 (2:3: Pinterest). */
export type StillShape = RenderShape | 'portrait' | 'pin';
export const STILL_SHAPES: StillShape[] = ['vertical', 'square', 'portrait', 'pin'];
/** Width x height of each shape. */
export const SHAPE_SIZE: Record<StillShape, { w: number; h: number }> = { vertical: { w: 1080, h: 1920 }, square: { w: 1080, h: 1080 }, portrait: { w: 1080, h: 1350 }, pin: { w: 1080, h: 1620 } };
/** The most pictures one photo post takes (render_slides saves at most this many). */
export const MAX_SLIDES = 10;

export interface Reel {
  id: string;
  title: string;
  preset: string;
  fields: Fields;
  status: ReelStatus;
  renderPath?: string;
  /** The square (1080x1080) version for X: the vertical frame's content band on a blurred fill. */
  squarePath?: string;
  /** Its slides saved as pictures for a photo post (render_slides), in order, per shape. Cleared when its content changes. */
  slides?: Partial<Record<StillShape, string[]>>;
  renderedAt?: string;
  renderSeconds?: number;
  /** When its rendered files went to the Recycle Bin (Setup > Performance, clean up posted reels): render again to post again. */
  filesCleaned?: string;
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
  /** Its cover for the platforms (Create > Thumbnails, render_cover): a frame plus a few words; path once saved. */
  cover?: ReelCover;
  /** The channel style it was made in (shared/styles.ts; missing = main). */
  style?: string;
  /** A part of a comment vote story. */
  vote?: VoteStory;
  /** Made for a Content Rewards campaign (Campaign id): posted with the ad disclosure and submitted to it. */
  campaignId?: string;
  /** Newest last. */
  metrics?: ReelMetrics[];
  /** What the user thinks of it (Training page). */
  feedback?: ReelFeedback;
  createdAt: string;
  updatedAt: string;
}

export type CoverLook = 'bold' | 'box' | 'bar' | 'frame';
export type CoverPlace = 'top' | 'middle' | 'bottom';
/** A reel's cover (shared/covers.ts): its frame at t (or a picture, bg) with the words drawn over it. */
export interface ReelCover {
  /** 2-5 words; one in *stars* gets the accent colour. Empty with look "frame". */
  text: string;
  /** The second of the reel the frame is taken from. */
  t: number;
  look: CoverLook;
  place: CoverPlace;
  /** The accent colour (#RRGGBB). */
  color: string;
  /** A picture to use instead of the reel's frame (absolute path). */
  bg?: string;
  /** The saved 1080x1920 PNG. Cleared when the reel's content changes (the settings stay, save it again). */
  path?: string;
  at?: string;
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
  /** The thread a comment, reply or message went into (the per-thread cap counts by it); missing = url. */
  thread?: string;
  creator?: string;
  title?: string;
  actions: SessionAction[];
  note?: string;
}

export interface Session {
  id: string;
  /** Its per-item list (each like, follow, comment) moved to the activity archive (Setup > Performance); its counts stay. */
  itemsArchived?: number;
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

/** An Instagram account we run. It is signed in in the user's own Chrome (through the Krypt Marketo extension). */
/** A streamer whose clips the clipping style cuts into reels. */
export interface ClipSource {
  site: ClipSite;
  /** The channel name as in its address (kick.com/<channel>, twitch.tv/<channel>). */
  channel: string;
}
export type ClipSite = 'twitch' | 'kick';
/** Where a saved clip came from: a streamer's Twitch / Kick clip, or a part of a YouTube video (save_clip recorded it). */
export type ClipOrigin = ClipSite | 'youtube';
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
 * chat replay starts there). YouTube: `youtube:<video id>`, start in seconds into the video.
 */
export interface ClipMoment {
  stream: string;
  start: number;
}

export interface IgAccount {
  id: string;
  handle: string;
  /** Where it is signed in and driven: always the user's own Chrome through the extension (same device and fingerprint as their normal use). 'hub' (the old built-in browser) is read as 'chrome'. */
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
  /** The account's YouTube channel, for uploading reels as Shorts. Runs in the same place as its Instagram (the same Chrome profile). */
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
  /** When each platform last asked this account to prove it is human (shared/humanCheck.ts: read-only there for a while after). */
  humanCheck?: Partial<Record<string, string>>;
  /** Which of Krypt's accounts each follow went to (its id, else its handle), so a corrected id gets followed again (same keys). */
  kryptFollowedTo?: Partial<Record<string, string>>;
  /** When it last commented on one of each Krypt account's posts (as far as the hub could tell; same keys). */
  kryptCommented?: Partial<Record<string, string>>;
  /** What the account is for on each platform (shared/goals.ts): grow followers or push a product. Missing = grow. */
  goals?: Partial<Record<Site, GoalId>>;
  /** What "Push product" pushes: a Krypt tool id or the user's own product (name and link). Missing = the brand (Krypt: all tools, one per reel). */
  pushProduct?: string;
  /** The user's own instructions for the AI on each platform (Home > click a platform). get_today and browser_open pass them on. */
  platformNotes?: Partial<Record<Site, string>>;
  /** Channel styles it runs (Styles page, shared/styles.ts), main first. Missing = every built-in style (they all start on; the user switches some off). */
  styles?: string[];
  /** Clipping style: whose Twitch / Kick clips to cut into reels, and how far back to look (Styles page, shared/clipping.ts). */
  clipping?: ClipSettings;
  /** How rough its meme-style videos may be (reddit, greentext, meme, dumb): clean, edgy or raw (Styles page). Missing = clean. */
  tone?: 'clean' | 'edgy' | 'raw';
  /** The share of reels each of its styles gets, in percent (Styles page). Missing = the default mix, from the style ranking (rankWeight). */
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
  /**
   * The channel id (UC…): set by the user (a pasted channel link, Accounts page) or saved the first time Studio shows a
   * channel. One Google account can own many channels, so several accounts may share one Chrome profile's YouTube: the
   * hub switches Studio to this channel before acting for the account.
   */
  channelId?: string;
  channelName?: string;
  /** Its @handle, when known. */
  channelHandle?: string;
  /** When Shorts were published (ISO), newest last; counts the day's uploads. */
  uploads?: string[];
  /** YYYY-MM-DD of YouTube warm-up day 1 (the wizard's "Warm up for 1 week"). Missing = an established channel, no warm-up. */
  warmupStart?: string;
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
/** Where the browser tools can open a tab: the platforms, plus contentrewards.com for campaign submissions. */
export type BrowserSite = Site | 'rewards';
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

/** What an account is for on a platform (shared/goals.ts). */
export type GoalId = 'grow' | 'product';

export type AccountInput = Partial<Omit<IgAccount, 'createdAt' | 'updatedAt' | 'setup'>> & { setup?: Partial<AccountSetup> };

/** What the hub counts and limits per platform per day; gap = minutes between two posts there. */
export type LimitKey = 'minutes' | 'likes' | 'saves' | 'follows' | 'comments' | 'posts' | 'reposts' | 'messages' | 'gap';
/** The user's own number for each limit they changed. They are the user's to set: there is no upper bound. */
export type SiteLimits = Partial<Record<LimitKey, number>>;

/** Krypt's tools (creator program), the user's own business, or a clip channel (clipping style only). */
export type PromoteMode = 'krypt' | 'own' | 'clips' | 'longform';

/** The long-form YouTube channel's plan (the long-form mode; Create > Long videos). Every number is the user's own. */
export interface LongformPlan {
  /** Long videos a week (0 = none for now). */
  perWeek: number;
  /** How long each one aims to be, in minutes. */
  length: '5-7' | '8-12' | '12-20';
  /** How a finished video goes up. */
  visibility: 'public' | 'unlisted';
}
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
  /** Set on a profile made from Multi run / the profile menu: its first open lands on the setup wizard even when it came prefilled (with a Skip button then). Cleared once the wizard is finished, skipped or closed. */
  firstOpen?: boolean;
  /** Each mode's own copy, kept when switching away so switching back restores it: the brand form, and every account's styles. */
  brandModes?: Partial<Record<PromoteMode, PromoteModeSave>>;
  /** The long-form channel's plan (long-form mode). Not set = the defaults (shared/longform.ts). */
  longform?: LongformPlan;
  /** The voice new story reels start with (Voices page). Not set = the built-in default. */
  voice?: VoiceTune;
  /** ElevenLabs (the user's own key; Voices page). */
  eleven?: ElevenSettings;
  /** The user's "say it like this" list for the narrator (Voices page). */
  sayAs?: SayAs[];
  /** Custom covers on posts (Create > Thumbnails): the AI makes one per reel and sets it on Instagram, TikTok, Facebook and YouTube Shorts. Missing = on. */
  covers?: boolean;
  /** Ask the user before an AI posts, comments, messages, unfollows or reposts (Accounts page). Off by default: those go through at once, still inside the daily limits. Deletes, blocks, reports and account settings always ask. */
  askApproval?: boolean;
  /** The most comments, replies and messages an account sends into one thread (a post's comments, an X or Threads conversation, a DM chat). The user's number (Accounts page); missing = 2, the recommended one. Keeps the AI out of long back-and-forths, which on X turn into AI accounts replying to each other. */
  perThread?: number;
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
  voiceTest?: string[];
  /** Only from an earlier build: a profile's proxy is now its own file (proxy.json in the profile's folder). */
  proxy?: ProxySettings;
}

export type ProxyScheme = 'http' | 'https' | 'socks5';
export interface ProxySettings {
  on: boolean;
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  /** A password is saved (encrypted, in the profile's folder). */
  hasPassword?: boolean;
  /** When the password was last set (so other windows know to read it again). */
  passAt?: string;
  /** The exit IP the profile is kept to ("sticky"): the first one a check saw. Pages refuse to open from any other. */
  ip?: string;
  country?: string;
  city?: string;
  /** The last check: when, the IP it saw, and what went wrong if it failed. */
  checkedAt?: string;
  seenIp?: string;
  error?: string;
}

/** What the Proxy card shows. */
export interface ProxyState {
  settings: ProxySettings | null;
  /** The OS can encrypt the password (without it, the password is kept in memory until the app quits). */
  canEncrypt: boolean;
  /** The last check found a different exit IP than the sticky one. */
  ipChanged: boolean;
}

/** One profile's line in the Multi run page's proxy list. */
export interface ProxyRow {
  id: string;
  name: string;
  /** The profile this window has open. */
  active: boolean;
  /** Multi-instance mode: its window is open. */
  running?: boolean;
  /** A Chrome profile's own proxy (Setup > Performance, a proxy for each Chrome profile): the accounts that run in it. */
  accounts?: string[];
  state: ProxyState;
}

/** A proxy in the proxy manager's list that is no profile's yet. */
export interface ProxyPoolItem {
  id: string;
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  hasPassword?: boolean;
  /** The last check: where it goes out, how long the answer took, or what went wrong. */
  ip?: string;
  country?: string;
  city?: string;
  ms?: number;
  checkedAt?: string;
  error?: string;
}
export interface ProxyPoolImport {
  added: number;
  /** Lines left out and why (line 0 = a proxy that was already there). */
  skipped: Array<{ line: number; why: string }>;
  items: ProxyPoolItem[];
}

/** One of Chrome's own profiles on this computer, and what uses it here (Multi run > Chrome profiles). */
export interface ChromeLocalRow {
  dir: string;
  name: string;
  /** Partly hidden ("sk***ow@gmail.com"). */
  email: string;
  hasExtension: boolean;
  connected: boolean;
  /** The Marketo profile made for it. */
  profile?: { id: string; name: string };
  /** Accounts that run in it, as "handle (profile)" when they are another profile's. */
  accounts: string[];
  /** Its Marketo profile has no account yet (its sign-ins can be read and added). */
  empty?: boolean;
}

/** What reading one Chrome profile's sign-ins added (Multi run > Chrome profiles). */
export interface ChromeImportResult {
  dir: string;
  /** The Marketo profile it was for. */
  profile: string;
  /** The account added (its handle), when one was. */
  added?: string;
  /** The platforms switched on for it. */
  sites: string[];
  /** Why nothing was added, or what is left to do by hand. */
  note?: string;
}

export interface ProxyInput {
  on: boolean;
  scheme: ProxyScheme;
  host: string;
  port: number;
  username?: string;
  /** Left out = keep the saved one; '' = remove it. */
  password?: string;
}

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
  /** Goal-driven extra runs a day (shared/extraRuns.ts), only with the token saver off. Missing = the default; 0 = none. */
  extraRuns?: number;
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
  /** A short goal-driven extra run between the scheduled ones. */
  extra?: boolean;
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
  /** Goal-driven extra runs: how many a day, how many ran today, and what the planner sees now. */
  extra: { max: number; today: number; note: string };
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
  /** slides = a photo post of several pictures to swipe through (a slideshow / carousel). */
  kind?: 'video' | 'short' | 'text' | 'image' | 'slides' | 'live';
  views?: number;
  likes?: number;
  comments?: number;
  reelId?: string;
  /** marketo = posted through the hub (mark_posted); imported = read off the profile. */
  source: 'marketo' | 'imported';
  addedAt: string;
  updatedAt?: string;
}

/** One part of a long video's script: a chapter, spoken as one narration file. */
export interface LongSection {
  heading: string;
  /** What the narrator says (the whole section). */
  text: string;
  /** What is on screen meanwhile (for the edit): footage, a card, a list. */
  visual?: string;
  /** The narration MP3, once bought (narrate_long_video), and its length. */
  audio?: string;
  seconds?: number;
  /** The text that audio says (a changed text is narrated again). */
  spoken?: string;
  /** Kip's moves in this section, "0:wave, 3:talk, 9:point" (seconds into the section). Empty = automatic. */
  kip?: string;
  /** Kip presenting this section (render_kip): green-screen MP4. */
  kipVideo?: string;
}

/** A long video's numbers from YouTube Studio. */
export interface LongStats {
  views: number;
  likes?: number;
  comments?: number;
  /** Impressions click-through rate, percent. */
  ctr?: number;
  /** Average percentage viewed. */
  avgViewed?: number;
  /** Subscribers it brought. */
  subs?: number;
  at: string;
}

export type LongStatus = 'script' | 'narrated' | 'edited' | 'ready' | 'uploaded';

/** A long YouTube video (5-20 min, 16:9): script in the hub, edit in Krypt Editor, upload through YouTube Studio. */
export interface LongVideo {
  id: string;
  /** The account whose YouTube channel it goes to. */
  accountId: string;
  /** The YouTube title (search words first, under 70 characters). */
  title: string;
  topic?: string;
  /** krypt_tools ids it is about. */
  tools?: string[];
  sections: LongSection[];
  /** The YouTube description (SEO: what it covers, chapters, links). */
  description?: string;
  tags?: string[];
  /** The few words on the thumbnail; *word* is drawn in the accent colour. */
  thumbnailText?: string;
  /** A picture or video behind the thumbnail text (a video: one frame of it). */
  thumbnailBg?: string;
  /** A second picture on the thumbnail's right side (a screenshot of the product). */
  thumbnailSide?: string;
  thumbnailPath?: string;
  /** The Krypt Editor project and its export. */
  projectPath?: string;
  videoPath?: string;
  status: LongStatus;
  visibility?: 'unlisted' | 'public' | 'private';
  /** The video's link once uploaded. */
  url?: string;
  /** When its upload was saved in Studio. */
  uploadedAt?: string;
  /** Its numbers as last read off YouTube Studio (the AI saves them; they decide what gets made next). */
  stats?: LongStats;
  voice?: string;
  createdAt: string;
  updatedAt: string;
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
  /** Long YouTube videos (Create > Long videos). */
  longVideos?: LongVideo[];
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
  /** Content Rewards campaigns the user joined (Create > Campaigns). */
  campaigns?: Campaign[];
  /** Posts sent (or due) to a Content Rewards campaign, newest first. */
  submissions?: Submission[];
}

/** A Content Rewards (contentrewards.com) campaign the user joined. Its reels are made to its rules and their links submitted after posting. */
export interface Campaign {
  id: string;
  /** contentrewards.com/c/campaigns/<id> */
  url: string;
  title: string;
  brand?: string;
  /** Where it pays (Content Rewards connects TikTok, Instagram, YouTube, X and Facebook). */
  platforms: Site[];
  /** What it pays, as shown ("$1/1K views, max $150 a clip"). */
  pay?: string;
  /** The campaign's rules and brief, copied from its page once joined. */
  rules?: string;
  /** Must be in every caption. */
  hashtags?: string[];
  mentions?: string[];
  links?: string[];
  /** Streamer / channel links to clip from, for clipping campaigns. */
  sources?: string[];
  /** The campaign's ad banner (a picture in its folder): drawn near the bottom of every reel made for it. */
  banner?: string;
  /** Marketo account ids that make reels for it. */
  accounts: string[];
  /** Campaign reels a day per account (the user's number). */
  perDay: number;
  on: boolean;
  /** Set by the user only: a test of the submit flow from their own (Krypt) accounts, no payout expected.
   *  Lifts the Krypt-account block, and no reels are made for it unless the user asks. */
  test?: boolean;
  addedAt: string;
  updatedAt: string;
}

export type SubmissionStatus = 'due' | 'submitted' | 'approved' | 'rejected' | 'missed';

/** One post sent to a campaign. A post goes to one campaign, once. */
export interface Submission {
  id: string;
  campaignId: string;
  reelId: string;
  accountId: string;
  site: Site;
  postUrl: string;
  postedAt: string;
  /** Content Rewards takes a post only within 30 minutes of it going up. */
  deadline: string;
  status: SubmissionStatus;
  submittedAt?: string;
  note?: string;
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

export type PageId = 'dashboard' | 'styles' | 'warming' | 'accounts' | 'next-run' | 'long' | 'thumbnails' | 'studio' | 'examples' | 'library' | 'results' | 'research' | 'train-rank' | 'train-hooks' | 'train-topics' | 'train-notes' | 'voices' | 'krypt' | 'chat' | 'agents' | 'autopilot' | 'usage' | 'kip' | 'multi-run' | 'resources' | 'campaigns' | 'setup';

// ── Instagram browser ───────────────────────────────────────────────────────
/** One account's Instagram session, in the hub's browser or in the user's Chrome. */
/** A channel of the Google sign-in in a Chrome profile, as YouTube's channel switcher lists it. */
export interface YtChannelOption {
  name: string;
  /** Without the @. Channels without one can't be added from the list (paste their link instead). */
  handle?: string;
  photo?: string;
  /** Google's current channel in that profile. */
  selected: boolean;
  /** The Marketo account that already runs it. */
  owner?: { id: string; handle: string };
}

/** What a Chrome profile is signed in to, per platform (the setup wizard reads it when a profile is picked). */
export interface ProfileScan {
  /** pages: Facebook only, the names of the Pages the signed-in user manages (read best effort from Facebook's own list). */
  sites: Partial<Record<Site, { signedIn: boolean; handle?: string; channels?: YtChannelOption[]; pages?: string[]; error?: string }>>;
}

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

/** Kip, the hub's manager (the Kip page): his chat, and whether he can think (he uses one of the user's AI apps: Claude Code, Codex, Gemini CLI, Cursor's or GitHub Copilot's command-line agent). */
export interface KipState {
  available: boolean;
  /** Why he cannot answer, when he cannot. */
  reason?: string;
  busy: boolean;
  steps: ChatStep[];
  /** The AI app he thinks with right now, when one of them is installed. */
  engine?: { id: string; name: string };
  /** Every AI app he can think with, and whether it is on this computer. */
  engines?: Array<{ id: string; name: string; installed: boolean }>;
  /** The user's pick: 'auto' (the one the scheduled runs use, else the first installed) or one app's id. */
  pick?: string;
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
  /** Multi-instance mode only: its own window is open now. */
  running?: boolean;
  /** Running, and its window is on screen (false = running in the background). */
  visible?: boolean;
  /** Runs in the background (no window) whenever Main is open or a run needs it. */
  background?: boolean;
  /** The Chrome profile (its folder) this profile was made for: its accounts start out in that one. */
  chromeDir?: string;
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

/** Krypt Editor on this computer (long videos are made in it). */
export interface EditorStatus {
  installed: boolean;
  version?: string;
  /** The AI apps it is connected to (their settings hold its tools). */
  connected: string[];
}

export interface MarketoApi {
  app: {
    version(): Promise<string>;
    editorStatus(): Promise<EditorStatus>;
    update(): Promise<UpdateInfo>;
    profiles(): Promise<ProfileInfo[]>;
    /** New profile, empty or with this one's settings and voices (never its accounts, brand or content). */
    /** A new profile; it can start with the open one's settings and/or its Training and knowledge (never its accounts). */
    createProfile(name: string, copySettings: boolean, copyKnowledge: boolean): Promise<ProfilesResult>;
    renameProfile(id: string, name: string): Promise<ProfilesResult>;
    /** Its folder goes to the Recycle Bin. */
    deleteProfile(id: string): Promise<ProfilesResult>;
    /** Open it: the window reloads on that profile. */
    useProfile(id: string): Promise<ProfilesResult>;
    setProfileAutopilot(id: string, on: boolean): Promise<ProfilesResult>;
    /** Multi-instance mode: run the profile in the background (no window); on starts it now. */
    setProfileBackground(id: string, on: boolean): Promise<ProfilesResult>;
    /** Multi-instance mode: quit another profile's window or background run. */
    stopProfile(id: string): Promise<ProfilesResult>;
    /** Multi-instance mode: start every background profile that is not running. */
    startBackground(): Promise<ProfilesResult>;
    /** Multi-instance mode: as saved (takes effect at the next start), and whether this window runs in it. */
    profilesMulti(): Promise<{ saved: boolean; running: boolean }>;
    setProfilesMulti(on: boolean): Promise<ProfilesResult>;
    /** Quit and start again (multi-instance mode is read at start). */
    restart(): Promise<void>;
    /** Where the shipped example videos are, and which ones exist. */
    examples(): Promise<{ dir: string; have: string[]; slides?: Record<string, number> }>;
    /** The folder of the recorded sound effects (resources/sfx). */
    sfxDir(): Promise<string>;
    openExternal(url: string): Promise<void>;
    showItemInFolder(p: string): Promise<void>;
    /** Open the Backgrounds or Memes folder (made when missing) for the meme styles. */
    openMediaFolder(kind: 'backgrounds' | 'memes'): Promise<ActionResult<string>>;
    /** A Content Rewards campaign's own folder under Campaigns/ (made when missing). */
    openCampaignFolder(title: string): Promise<ActionResult<string>>;
    /** A YouTube channel from a pasted link, @handle or UC… id: its id, name and handle. */
    resolveYtChannel(input: string): Promise<ActionResult<{ id: string; name?: string; handle?: string }>>;
    /** Setup > Help: save the logs as one zip (emails, user name and keys blanked). data null = the user closed the save box. */
    exportLogs(): Promise<ActionResult<{ file: string; files: number; bytes: number } | null>>;
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
    deleteLongVideo(id: string): Promise<ActionResult>;
    /** Remove reels from the hub; with trashFiles their rendered videos go to the Recycle Bin / Trash. */
    deleteReels(ids: string[], trashFiles: boolean): Promise<ActionResult<DeleteReelsResult>>;
    updateSettings(patch: Partial<Settings>): Promise<ActionResult<Settings>>;
    deleteReference(id: string): Promise<ActionResult>;
    saveAccount(a: AccountInput): Promise<ActionResult<IgAccount>>;
    /** Another YouTube channel of the same Google sign-in: a new YouTube-only account in this account's Chrome profile. */
    addYtChannel(fromAccountId: string, link: string): Promise<ActionResult<IgAccount>>;
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
    /** A reel went live (pasted link): its link, the post log, and a Content Rewards submission if it is a campaign reel. */
    markPosted(id: string, site: Site, url: string): Promise<ActionResult<Reel>>;
    saveCampaign(input: Partial<Campaign> & { url?: string; id?: string }): Promise<ActionResult<Campaign>>;
    deleteCampaign(id: string): Promise<ActionResult>;
    /** A picture file or https link as the campaign's ad banner ("" removes it); redo = reels sent back to draft. */
    setCampaignBanner(id: string, source: string): Promise<ActionResult<{ path?: string; redo: number }>>;
    setSubmission(id: string, status: SubmissionStatus): Promise<ActionResult>;
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
    /** Every channel of the Google sign-in in the account's Chrome profile (opens YouTube's channel switcher there). */
    ytChannels(accountId: string): Promise<ActionResult<YtChannelOption[]>>;
  };
  refs: {
    /** Store an analysed reference video (the hub keeps its own copy of the file). */
    add(input: RefVideoInput): Promise<ActionResult<RefVideo>>;
    update(id: string, patch: { name?: string; notes?: string }): Promise<ActionResult<RefVideo>>;
    delete(id: string): Promise<ActionResult>;
  };
  /** Setup > Performance: one set of settings for the whole PC (every profile window follows it). */
  perf: {
    get(): Promise<PerfSettings>;
    set(patch: PerfSettings): Promise<PerfSettings>;
    onChanged(cb: (p: PerfSettings) => void): () => void;
    readout(): Promise<PerfReadout>;
    /** Chrome and AI processes, read once from the process list. */
    measure(): Promise<ProcessReadout>;
    /** A render started (true) or ended (false): low-priority rendering lowers the hub's own processes meanwhile. */
    rendering(on: boolean): Promise<void>;
    /** One render at a time across profiles: whether this window's render may start, or whose is going. */
    renderTurn(): Promise<{ ok: boolean; holder?: string }>;
    renderDone(): Promise<void>;
  };
  autopilot: {
    status(): Promise<AutopilotStatus>;
    enable(input: { ai: AutopilotAi; times: string[]; model?: string }): Promise<ActionResult<AutopilotStatus>>;
    /** Which model the runs use ('' = the AI app's own setting). */
    setModel(model: string): Promise<ActionResult<AutopilotStatus>>;
    setSaver(on: boolean): Promise<ActionResult<AutopilotStatus>>;
    setExtraRuns(n: number): Promise<ActionResult<AutopilotStatus>>;
    /** Pick a usage tier: sets the model, run times and token saver to the tier's, and sizes each run to it. */
    setTier(tier: UsageTier): Promise<ActionResult<AutopilotStatus>>;
    disable(): Promise<ActionResult<AutopilotStatus>>;
    /** `ai`: the one picked on the Autopilot page (used while autopilot is off; a schedule that is on keeps its own). */
    runNow(ai?: AutopilotAi): Promise<ActionResult<AutopilotStatus>>;
    openFolder(): Promise<void>;
  };
  proxy: {
    /** Every profile and its proxy (any window can set any profile's). */
    list(): Promise<ProxyRow[]>;
    /** The open profile's Chrome profiles, each with its own proxy (Setup > Performance, a proxy for each Chrome profile). Their ids work in save, check and acceptIp. */
    chromeRows(): Promise<ProxyRow[]>;
    save(profileId: string, input: ProxyInput): Promise<ActionResult<ProxyState>>;
    /** The exit IP through that profile's proxy now (the first good one becomes the sticky IP). */
    check(profileId: string): Promise<ActionResult<ProxyState>>;
    /** Keep the IP the last check saw as the sticky one. */
    acceptIp(profileId: string): Promise<ActionResult<ProxyState>>;
    /** The proxy manager's list: proxies that are no profile's yet. */
    pool(): Promise<ProxyPoolItem[]>;
    /** Add a pasted list (one proxy a line). */
    poolImport(text: string): Promise<ActionResult<ProxyPoolImport>>;
    poolCheck(id: string): Promise<ActionResult<ProxyPoolItem[]>>;
    poolRemove(ids: string[]): Promise<ActionResult<ProxyPoolItem[]>>;
    /** Give one to a profile (the proxy it had goes back into the list). */
    poolAssign(id: string, owner: string): Promise<ActionResult<ProxyPoolItem[]>>;
    /** One each for the profiles with no proxy on. */
    poolAuto(): Promise<ActionResult<{ given: Array<{ profile: string; id: string; proxy: string }>; items: ProxyPoolItem[] }>>;
    /** Take a profile's proxy back into the list. */
    poolRelease(owner: string): Promise<ActionResult<ProxyPoolItem[]>>;
  };
  chrome: {
    status(): Promise<ChromeStatus>;
    onStatus(cb: (s: ChromeStatus) => void): () => void;
    /** Open a window of that Chrome profile (its folder, from the status list). */
    open(dir: string): Promise<ActionResult>;
    /** Who that Chrome profile ('' = the only one connected) is signed in as on each platform, and its YouTube channels. */
    scan(dir: string): Promise<ActionResult<ProfileScan>>;
    /** Every Chrome profile on this computer and what uses it. */
    locals(): Promise<ChromeLocalRow[]>;
    /** Make new Chrome profiles with these names (each opens once). */
    make(names: string[]): Promise<ActionResult<Array<{ dir: string; name: string }>>>;
    /** A Marketo profile for each of these Chrome profiles (ones that already have one are skipped). */
    importProfiles(dirs: string[], copySettings: boolean, copyKnowledge: boolean, autopilot: boolean): Promise<ProfilesResult & { made?: number }>;
    /** Read that Chrome profile's sign-ins and add them as the account of the Marketo profile made for it. */
    addAccounts(dir: string, fresh: boolean): Promise<ActionResult<ChromeImportResult>>;
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
    /** Which AI app he thinks with: 'auto' or one id. Another one starts a new chat. */
    setEngine(id: string): Promise<KipState>;
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
    /**
     * Download a Twitch / Kick clip the way its page plays it, or record a part of a YouTube video off its page
     * (start / seconds; kind 'rec' = a recording that still needs remuxing into a plain MP4).
     */
    fetch(url: string, span?: { start?: number; seconds?: number }): Promise<ActionResult<{ bytes: Uint8Array; kind: 'mp4' | 'ts' | 'rec'; site: ClipOrigin; channel: string; url: string; title: string; moment: ClipMoment | null }>>;
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
    saveImage(reelId: string, png: string, t: number, shape?: StillShape): Promise<ActionResult<string>>;
    /** Write a reel's slides (base64 JPEGs, in order) into its slides folder and keep their paths on the reel; returns the paths. */
    saveSlides(reelId: string, images: string[], shape: StillShape): Promise<ActionResult<string[]>>;
    /** A reel's cover: the picture (base64 PNG) and the settings it was drawn with. */
    saveCover(reelId: string, png: string, cover: ReelCover): Promise<ActionResult<string>>;
    /** A long video's thumbnail words (then render it again). */
    setLongThumbText(id: string, text: string): Promise<ActionResult<void>>;
    /** A long video's thumbnail (1280x720 PNG) into its folder; saved on the video. */
    saveLongThumb(id: string, png: string): Promise<ActionResult<string>>;
    /** A file of a long video (a Kip clip) into its folder; with section, saved on that section as its Kip clip. */
    saveLongFile(id: string, name: string, data: Uint8Array, section?: number): Promise<ActionResult<string>>;
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
