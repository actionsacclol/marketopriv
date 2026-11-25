// What an account is for on each platform: grow followers any way the rules allow ("Mass growth"), or
// turn viewers into customers for a product ("Push product"). Set per account and platform (Home > a
// platform, the setup wizard, save_account goals). Each platform gets its own researched playbook;
// Instagram is the first (research 2026-11-20). A platform without one yet runs as before.

import type { Brand, GoalId, IgAccount, Site } from './types';
import { isKryptBrand } from './brand';
import { kryptToolById } from './kryptPack';

export type { GoalId };
export const GOAL_IDS: GoalId[] = ['grow', 'product'];

export const GOAL_LABEL: Record<GoalId, string> = { grow: 'Mass growth', product: 'Push product' };
export const GOAL_ABOUT: Record<GoalId, string> = {
  grow: 'Followers first: original Reels made to be sent to friends, series that give people a reason to follow, and engagement that brings them to the profile.',
  product: 'Customers first: demos that show the product working, a clear way to get it, and replies that answer questions until people try it.',
};

export interface GoalPreset {
  /** One line for the plan and the Home panel. */
  summary: string;
  /** What to judge the account by. */
  measure: string;
  /** The playbook, one rule per line. "{product}" is the product being pushed. */
  rules: string[];
  /** Posts a day the preset is built for (the user's post limit still decides). */
  postsPerDay: number;
}

const IG_SHARED = [
  "Originals only: Instagram stops recommending an account to non-followers when most of its last 30 days of posts are unoriginal (since 2026-04-30). Our own renders, recordings and voiceovers are original; a re-uploaded clip is not, even with a caption, credit, border or subtitles. Keep at least 80% of the last 30 days clearly ours; a stream clip on Instagram needs our own voiceover or commentary on top.",
  'Clean export: 9:16, no watermark or logo from another app, no borders, no wall of text, 3 minutes at most (longer is never recommended). Never post the same file twice.',
  'Frame 1 carries the hook (the payoff or the tension), never a logo or intro card: Instagram predicts who skips in the first 2-3 seconds.',
  'Caption: the first line in plain search words (what it is, the way people would search it), then at most 5 specific hashtags (Instagram allows 5).',
  "Check Account Status (profile > menu > Account Status) once a day before posting. If it says the account can't be recommended or a feature is limited: report it as NEEDS YOU, post only original content, and do engagement at half volume until it clears.",
];

// YouTube Shorts (research 2026-11-20, docs/research/youtube-2026-11-20.md).
const YT_SHARED = [
  "Originals only: since 2026-10-01 Shorts recommendations cut reach for channels that mostly re-upload other people's clips, and a voiceover that only describes what is on screen does not count as original. Our own screen recordings with our own point (a result, a comparison, an opinion) do. A stream clip on YouTube needs real commentary or analysis of ours on top; credit in the description is not enough.",
  'No template farming: every Short gets its own hook, script and footage. The same intro or outro is fine; the same narration over swapped clips is "inauthentic content" (YouTube judges it channel-wide, and one spam-flagged channel can take down every channel on the same Google account).',
  'Frame 1 is the result (the after, the tool doing its thing), never a logo or "hey guys". Judge Shorts by engaged views and "stayed to watch" in Studio, never by raw views (since March 2025 a view counts the moment a Short starts).',
  'Title: plain search words that name the tool or the problem ("Free crosshair overlay", "Debloat Windows 11 in 30 seconds"). 1-3 hashtags; #shorts is optional (any vertical video up to 3 minutes is a Short).',
  'Links in a Short\'s description or comments are not clickable, and comments with links get held as spam: never put a link there. Never delete and re-upload a Short that started slow (YouTube can read it as spam, and Shorts often take off days later); make a new one instead.',
  'Over 60 seconds: no copyrighted or Shorts-library music (any Content ID claim blocks a 1-3 minute Short worldwide). Default length 20-45 seconds; 60-90 only for a full demo.',
  'The "AI use" question in Studio (Details): Yes only for realistic synthetic people, events or a voice that imitates a real person. Text-to-speech narration over our own screen recordings, AI scripts and captions: No. Never present the narrator as a human financial expert.',
  'If Studio says "Daily upload limit reached", stop uploading for 24 hours. If a comment of ours is held or vanishes, commenting is paused, or a warning or strike arrives: stop all engagement there for 24-72 hours and report it as NEEDS YOU. Never work around it.',
];

// X (research 2026-11-20, docs/research/x-2026-11-20.md). X's rules ban scripting the website and it suspends
// AI reply accounts, so these rules keep volume low and every word human; the user decides how far to go.
const X_SHARED = [
  "X's own rules forbid automating the website and it has been suspending accounts that send AI-written replies (May-July 2026). Act like a person: read and scroll between actions, irregular gaps, no bursts. At the first lock, puzzle, \"temporarily limited\" banner or warning: stop on X for the day, report it as NEEDS YOU, never solve or retry it.",
  'One post at a time, at the user\'s gap: a small account\'s new post gets a free feed slot only in its first 2 hours (picked by its early like rate), and back-to-back posts compete with each other. Stay to answer the first replies.',
  'Every text is its own: never the same or nearly the same post, reply or link text twice (X filters duplicates out of search). Replies sound like people type on X (a few words, loose, lowercase is fine) and stay on the post\'s topic; no @mentions of people who never engaged with us.',
  'Negative signals cost the most: "not interested", mute, block and report weigh far more than any like. Anything that could read as spam is not worth posting.',
  'Links: never in the post itself on a free account (link posts get almost no engagement); in our own first reply or the bio. No links in replies to strangers unless they asked.',
  'Check Settings > Your account > Account status once a day; if anything shows a restriction, halve everything on X for a week and say so in the report.',
];

// TikTok (research 2026-11-20, docs/research/tiktok-2026-11-20.md). TikTok's guidelines (in force 2026-09-24) forbid
// automation tools and scripts outright, so the pace stays human and every word our own.
const TT_SHARED = [
  'TikTok\'s Community Guidelines "strictly prohibit automation tools, scripts, or other tricks designed to bypass our systems". Act like a person: watch a video before liking, following or commenting on it, irregular gaps, no bursts. At the first "tapping too fast" / "following too fast" message, puzzle, action block or warning: stop that action on TikTok for 24 hours (the whole session if it happens twice), report it as NEEDS YOU, never solve or retry it.',
  'Originals only: "unoriginal or reused material without anything new" is not eligible for the For You feed, and repeated ineligible videos make the whole account ineligible for a while. Our own screen recordings with our narration and edits are original; a stream clip needs real commentary or edits of ours. Upload our own clean export, never a file with another app\'s watermark, no QR codes, no slideshow-only videos (a slideshow goes up here as a photo post through browser_attach_slides, or not at all).',
  'Frame 1 is the result (the tool doing its thing, the after) with a 4-7 word on-screen hook; skips count against a video and watch time and finishing count most. Keep text clear of the right side and the bottom (TikTok\'s buttons and caption sit there).',
  'Search: say the main search phrase in the first spoken sentence, show it as on-screen text in the first seconds and start the caption with it, plus 3-5 specific hashtags (never #fyp: hashtags only describe the video).',
  'No engagement bait: never "follow for part 2", "like to win" or follow-for-follow (TikTok makes those videos ineligible for For You). "part 2 is on my page" is fine. Giveaways never require a follow.',
  'The "AI-generated content" label: on only for realistic AI-made people or scenes. Text-to-speech narration over our own screen recordings does not need it. Never present the narrator as a real person or a financial expert.',
  'Comments: short and loose like people type on TikTok (a few words: "wait this actually helped lol", "does it work on win 10"), on the video\'s topic, never the same text twice, no links, no "follow me" or "check my profile". No cold DMs before day 14; DMs answer people who wrote first, never a link in a first message.',
  'Never delete and re-upload a slow video (TikTok treats duplicates as spam); re-cut it with a new hook instead. After each video, check its analytics for a "not eligible for For You" notice. If one shows, two videos are flagged within 30 days, or the account shows any restriction: stop posting and engaging on TikTok for 48 hours and report it as NEEDS YOU. On a run of near-zero-view videos, slow down, never speed up.',
  'Never a "paste this into PowerShell" step on screen (fake activation videos built that way spread password stealers and got removed), never scare claims ("your PC is infected"), and macro or crosshair tools are never framed as cheats.',
  'Trading and prediction-market tools: TikTok bans marketing gambling and "get-rich-quick" or too-good-to-be-true financial offers. Never "bet", odds-to-win, payouts, P&L, wins or profit; say what the tool does (you pick the markets and set limits, the AI does the trading) and add a plain risk line ("it can lose too").',
];

// Threads (research 2026-11-20, docs/research/threads-2026-11-20.md). A conversation app: replies carry about half
// of all views. It runs on the Instagram login, so a Threads strike can cost the Instagram account too.
const TH_SHARED = [
  'Meta\'s spam rules cover posting or engaging "at very high frequencies", manual or automated, and repetitive content. Act like a person: read between actions, irregular gaps, no bursts. At the first "Try again later" or "We limit how often you can do certain things": stop that action on Threads for 48 hours, never retry it (retrying makes the block longer), report it as NEEDS YOU.',
  'Threads runs on the Instagram login, so treat both as one account. Check Threads Account status (Settings > Account > Account status) once a day: if it or Instagram\'s shows a restriction or "not recommended", only read and post on Threads (no follows, likes or replies to strangers) and say so in the report.',
  'Replies are almost half of all views on Threads (Meta), and likes in a post\'s first 15 minutes and reply depth are ranking inputs. Answer every reply on our new post within its first hour.',
  'Every text is its own and written for Threads: never a copy of an Instagram caption or an X post, never the same reply twice. Replies are short and loose like people type on Threads ("wait this actually worked lol", "which one did u use"), on the post\'s topic and adding a fact, a number or a joke; never "great post" or emoji-only.',
  'One topic tag per post (Threads allows one; tagged posts get more views), matching an existing community or trending topic where it fits. Media posts always carry a line of text (Meta: media with text does much better); videos readable in a 4:5 crop.',
  'No engagement bait or rage bait: no "comment YES", follow-for-follow, "let\'s connect" follow trains or giveaways for follows (Meta limits their reach and bans engagement swaps). Opinionated is fine, angry is not.',
  'Links: never in a post (the hub refuses them), and none at all on Threads during its warm-up; after that the link goes in our own first reply or the bio, never in replies to strangers. DMs only answer people who wrote first (links are blocked in message requests anyway).',
  'What Threads gets (the user\'s rule, 2026-11-22, after Threads asked the account to prove it was human): mostly Threads-native text, conversation posts and useful tips; finance, crypto, trading and betting topics only as news commentary or a question, never with a product link; at most one product post (a reel or text about our own product) in every four Threads posts, the rest plain posts. Every post is written fresh for Threads: never the reel\'s caption as it is, never "#Shorts" (the hub refuses copies, "#Shorts" and more than one tag).',
  'Trading and prediction-market tools: Meta bans offers that are "guaranteed or risk-free", promise quick returns, reference past performance or returns, or promise financial reward for minimal effort. Never P&L, wins or returns; say what the tool does (you set the limits, the AI does the trading) with a plain risk line. The account never tells made-up stories of using it itself.',
];

// Facebook, posting as a Page (research 2026-11-20, docs/research/facebook-2026-11-20.md). Reels bring new people,
// links are scarce (2 a month on many Pages), and the Page, its owner's profile and Instagram share one risk.
const FB_SHARED = [
  'Meta\'s spam rules cover posting or engaging "at very high frequencies", manual or automated, and repetitive content. Act like a person: read and watch between actions, irregular gaps, no bursts. At "You can\'t use this feature right now" or "We limit how often you can post, comment or do other things": stop that action on Facebook for 72 hours and report it as NEEDS YOU. At any checkpoint, selfie or ID request: stop everything on Facebook and report it; never solve or retry it.',
  'Before every like or comment, check you are acting as the Page, not the owner\'s profile. The Page, its owner\'s profile and the linked Instagram account are one risk: check the Page status (Professional dashboard or Support home) once a day, and at any warning, restriction or "not recommended" only post (no comments, likes, follows or Groups) and say so in the report.',
  'Originals only: since 2025-2026 Facebook cuts reach on everything a Page posts when it keeps reusing other people\'s content. Original = filmed or produced by the Page; stitched clips, our watermark on someone else\'s footage, added captions, borders or a speed change do not count. Our own Instagram Reel on our own Page is fine. Upload our clean export, never a file with another app\'s watermark. A stream clip only with real commentary of ours that adds something new.',
  'Reels are ranked by watch time, finishing, skips and private shares; "see less" and hide cost the most. The result in the first 1-2 seconds, speech starting in the first 3 seconds, on-screen text, vertical, one complete point per Reel.',
  'Captions: short (about 150 characters), about what the video shows, no link, few capitals, 0-3 hashtags (never more than 5: too many hashtags limits a Page to its followers).',
  'Meta asks for the "AI info" label on a Reel narrated with a realistic AI-generated voice: turn it on for Reels with an AI voiceover.',
  'No engagement bait ("comment YES", "tag a friend", "share this", "vote"): Facebook cuts its reach and keeps cutting for repeat offenders. A real, specific question is fine. No giveaway that asks for shares.',
  'Comments are short and loose like people type on Facebook ("wait the right click fix works", "does this work on win 10"), on the post\'s topic, never the same text twice, no links for the Page\'s first 30 days. Messenger: only answer people who wrote first, never a cold message.',
  'Groups: read the group\'s rules first, nothing in a group within 48 hours of joining it, never the same text in more than one group a day, a comment before any post. Help first; a link only when someone asked and the rules allow it.',
  'Trading and prediction-market tools: Meta bans offers that are "guaranteed or risk-free", reference past performance or returns, promise quick returns, or promise financial reward for minimal effort. Never P&L, wins or returns; say what the tool does with a plain risk line; "easy" describes using it, never money. Fake Polymarket bots stole wallets in 2026, so say plainly where the real one comes from (its own page). Never boost or advertise these posts.',
];

// Pinterest (research 2026-11-20, docs/research/pinterest-2026-11-20.md). A search engine, not a feed: saves and
// keywords carry reach, Pins keep working for months, and new accounts get suspended mostly over links.
const PIN_SHARED = [
  'Pinterest\'s guidelines ban "automation that hasn\'t been explicitly approved by Pinterest", and it rate-limits logging in a lot, quick comments, repeated comments, mass follows and saving many Pins from one site quickly. Act like a person: browse and search between actions, at least 30-60 minutes between our own Pins, no bursts. At any block, "hit your limit", blocked link or suspension notice: stop everything on Pinterest for 48 hours and report it as NEEDS YOU; appeals are the user\'s.',
  'Links: only straight to the page itself (never a shortener, redirect or affiliate redirect chain), never on the account\'s first 3 days, and never re-point a published Pin to another page. The Pin\'s picture, title and text must match the page it opens. A new or unclaimed website on the first Pins is the most common reason new accounts get suspended: suggest claiming the account\'s own website to the user (a site can be claimed by only one account, so other people\'s sites, krypt.cc included, are just linked).',
  'Fresh Pins only: every Pin gets its own new image or video. A new image on a page we already pinned kept about 64% of its reach in a 1.2M-Pin study; the same image with new text kept 11%. Never upload the same file twice, never save one of our Pins to more than a few boards (days apart), at most one new Pin per page a day, and no more than about a third of the day\'s Pins and saves pointing at one website.',
  'Write for search: the keyword people type first in the title ("Windows 11 Gaming Settings: 7 to Check First"), a natural 1-2 sentence description (about 200 characters, a few keywords, no keyword stuffing, no hashtag piles), alt text, and a topic whenever Pinterest offers one. Boards are named after searches ("Windows 11 Tips", "Small Gaming PC Setup").',
  'Formats: 2:3 images (1000x1500) and 9:16 video (4 seconds to 5 minutes, the payoff in the first 1-2 seconds, captions burned in, top and bottom kept clear). Real screenshots and screen recordings, never AI-made images (Pinterest labels them and people can turn them down). No other app\'s watermark.',
  'Pins grow for 2-3 months and come back every season: never judge one in its first week (about 1 in 5 has no views yet then), never delete and re-pin a slow one. Pin seasonal ideas 60-90 days ahead (back to school, Black Friday setups, New Year productivity, Steam sales).',
  'Comments and saves stay light: answer comments on our Pins, a few real saves of others\' Pins from many different websites, few follows, no messages to people who did not write first. Saving others\' Pins fills boards but brings almost none of our traffic (over 90% comes from our own Pins).',
  'Trading and prediction-market tools stay off Pinterest: its guidelines remove or limit "organic promotion of online gambling, lotteries, and wagering services" and "exploitative financial or investment schemes promising unrealistic returns", and its 2026 rules treat most crypto as predatory. A strike there can take the account and the linked website with it.',
];

const PRESETS: Partial<Record<Site, Record<GoalId, GoalPreset>>> = {
  instagram: {
    grow: {
      summary: 'Mass growth: original, sendable Reels in one niche, numbered series, 2 a day when the limit allows.',
      measure: 'Follows per 1,000 views and sends per reach (not likes). A format under 1 follow per 1,000 views gets dropped; one over 5 gets made more.',
      postsPerDay: 2,
      rules: [
        ...IG_SHARED,
        'Make every Reel make sense to a stranger, with one "send this to a friend" reason (relatable, useful, "this is you"). Sends weigh most for reaching non-followers.',
        'What the fastest faceless tech / AI-tool pages do: one item per Reel (one tool, site, setting or trick), shown working on screen and ending on the result; hooks like "everyone uses X. almost nobody opens this", "stop paying for X", "send this to the friend whose games stutter". "Hidden" / "secret" wording only when it is true. Readable with the sound off (on-screen text).',
        'Length: as long as the payoff needs, usually 30-60 seconds (45-60 s had the best median views in a 2026 study of 9.8M Reels); cut every dead second.',
        'Run series: a recurring, numbered format the account can post every day ("tools you\'ll wish you found sooner, part 12", "Day 3", "#4 of 10") with "part 2 tomorrow" in the last seconds. Never "like / comment to see part 2": that is engagement bait and loses recommendation.',
        'Volume: 2 Reels a day, at least 2 hours apart, when the day\'s post limit allows; more posts kept raising follower growth in large studies, but never at the cost of originality.',
        'Trial Reels, once the account has about 1,000 followers: post hook and format tests as Trial Reels (the Trial toggle on the share screen; only non-followers see them), and make the winners (about 2x the usual views) into regular Reels.',
        'Engagement that brings followers: reply to every comment on our new Reel in its first hour (one short reply each); specific comments early (within about 30 minutes) on new posts from the biggest accounts in the niche; likes and saves only on niche posts. No bulk follows and never follow/unfollow.',
        'No links and no "link in bio" in growth Reels: the call to action is following ("follow for part 2").',
        'Profile (suggest to the user in the report; profile changes are theirs): the niche keyword in the name field, a one-line bio that says what followers get and how often, and the 3 Reels with the best follows per view pinned.',
      ],
    },
    product: {
      summary: 'Push product ({product}): demo Reels that show it working, a clear way to get it, replies that answer every question.',
      measure: 'Profile visits, link taps, keyword comments, DMs asking for it and downloads, per Reel. Views are only the top of the funnel.',
      postsPerDay: 1,
      rules: [
        ...IG_SHARED,
        'The product is {product}. Every fact about it comes from its own page or krypt_tools; never invent numbers, users or reviews.',
        'Trading and prediction-market tools: never show winnings, P&L, "free money" reactions or fake bets (paid campaigns doing exactly that are now under regulator investigation). Say what the tool does, not what it earns.',
        'Mix: about half problem-then-demo Reels with a soft call to action, about a third reach Reels (tips, trends, comparisons) with none, about a fifth with a hard call to action.',
        'Demo Reels: the result in the first 1-2 seconds, then 10-30 seconds of the real screen doing it (a before / after, "the tool I wish I knew", a free-vs-paid comparison under the versus rules). Real testimonials only, and only once they exist.',
        'Call to action: "comment KEYWORD and I\'ll send it" (one short keyword per product) on screen, in the caption and in a pinned comment that also says "or link in bio". The link DM to commenters is sent by the user\'s Meta Business Suite or ManyChat automation, never typed by you to each commenter (the same link DM over and over is the riskiest thing an account can do). Without that automation, the call to action is "link in bio".',
        'Never put links in DMs to people who did not write first, or in comments on other people\'s posts. In a DM someone started, answer the question, and give the link when they ask for it (two messages at most per thread).',
        'Reply to every question about {product} on our posts quickly and plainly; a question answered in public sells to everyone who reads it.',
        'Profile as the landing page (suggest to the user in the report): bio = what {product} does, for whom, and the keyword line; one link in bio that leads to everything (the product page, or a page listing the tools); the link in bio goes to its page (on a new account, only after about day 30); highlights for Demo, FAQ / "is it safe?", and Reviews.',
        "Our own product needs no paid-partnership label; a paid or gifted collab with another creator does.",
      ],
    },
  },
  youtube: {
    grow: {
      summary: 'Mass growth: original Shorts with the result in frame 1, search-word titles, series that give people a reason to subscribe, up to 3 a day when the limit allows.',
      measure: 'Subscribers per 1,000 engaged views and "stayed to watch" %, on Shorts at least 7 days old. Judge a format after about 10 Shorts by its median: under 0.5 subscribers per 1,000 engaged views gets dropped; a Short at 5x the channel median gets a part 2 within 48 hours.',
      postsPerDay: 3,
      rules: [
        ...YT_SHARED,
        'What the fastest faceless tech channels do: one tool, setting or trick per Short, shown working and ending on the result; a numbered daily series ("free tools you\'ll wish you found sooner, part 12"). Readable with the sound off.',
        'Titles that work in this niche: one concrete result named outright ("Check your SSD health without any app", "3 things to turn off on a new Windows PC"), "without upgrading / without any app" framing, "you didn\'t know" or "3 / 5" lists. Ride news pegs: a new game out means a Short on its settings that week. Series wear out after many parts: start a new one when views fall. Hooks in this style: "fps drops in every game? check this first", "stop paying for a pc cleaner", "3 things to turn off on a new windows pc".',
        'Subscribe call to action: one short spoken line after the payoff, tied to the series ("part 3 tomorrow, subscribe"). Never in the first 3 seconds.',
        'Volume: up to 3 Shorts a day at the user\'s spacing when the post limit allows; more uploads mean more chances at a breakout, they do not lift the average Short. Never near-identical uploads.',
        'Set each Short\'s "Related video" (Studio > Details) to the matching long video when the channel has one: it is the only tappable link on a Short.',
        'Pin one comment on each new Short that asks a real question ("which tool next?") when the channel can pin; reply to early comments in the first hours in short, human text (2 per thread at most). A few real comments a day on niche channels at most; never the same text twice.',
        'A slow Short is not dead: leave it up and read it again after 7 days.',
      ],
    },
    product: {
      summary: 'Push product ({product}): demo Shorts that link through "Related video" to a long tutorial whose description has the download link.',
      measure: 'The linked long video\'s "Shorts" traffic divided by the Short\'s views (the bridge rate), and downloads per 1,000 Shorts views by tool and format. Views are only the top of the funnel.',
      postsPerDay: 2,
      rules: [
        ...YT_SHARED,
        'The product is {product}. Every fact about it comes from its own page or krypt_tools; never invent numbers, users or reviews.',
        'The funnel: Short (result in the first 2 seconds, the site name on screen, spoken "full setup: tap the video under my name") -> its "Related video" set to that product\'s long tutorial (Studio > Details) -> the tutorial\'s first description line is the download link -> download. When the product has no long tutorial yet, say so in the report as the next long video to make (Create > Long videos).',
        'What works for product channels in this niche (Hone, an FPS optimizer: 95M views on 23K subscribers): one Short per new game or problem ("Phantom Blade Zero FPS boost"), so every search finds a fresh one. Judge them by views and downloads, not subscribers.',
        'Formats: before / after with real, repeatable numbers, the free-vs-paid comparison (versus rules), "one setting" tips, plain demos. Real testimonials only, and only once they exist.',
        'Replies to "where do I get it?": "it\'s on my channel" or "tap the video under my name", in your own words each time, never a link (2 per thread at most).',
        'Never scare claims ("your PC is infected", "your PC is slow"): Google treats misleading system-performance claims as unwanted software, and a flagged download gets links stripped or videos removed. Macro and crosshair tools are never framed as cheats or anti-cheat bypasses.',
        'Trading and prediction-market tools: no profit claims, P&L, wins or "easy money"; say what the tool does. Link to the tool\'s own page, never to Polymarket (YouTube removes content that steers people to unapproved gambling sites and age-restricts betting content).',
        'If this channel is paid or rewarded for promoting {product} and is not the product\'s own channel (the Krypt creator program counts), tick "Includes paid promotion" in Studio. The brand\'s own channel promoting its own product does not need it.',
      ],
    },
  },
  x: {
    grow: {
      summary: 'Mass growth: original posts that people reply to, quote and share, a demo video or a short tip at a time, and a few real replies a day where they add something.',
      measure: 'New follows per 1,000 impressions and profile visits per 1,000 impressions, per format over 8-10 posts. A format at 2x the account median gets made more; one under half of it for 10 posts gets dropped. Visit-to-follow under 2% = the bio and pinned post need work (tell the user).',
      postsPerDay: 4,
      rules: [
        ...X_SHARED,
        'Originals carry growth; replies are for being seen. Mix: a native demo video (10+ seconds, payoff in the first 2 seconds, captioned so it works muted), a 100-200 character tip, an image or meme, sometimes a quote post of a big niche post with a short take of our own.',
        'Hooks that work in this niche: one concrete surprise in the first line, no preamble; "free tools i put on every new pc", "stop paying for pc optimizer apps", "bookmark this before your next windows reinstall". Write for replies, quotes and shares (they weigh about 7x a like in X\'s published ranking code), never engagement bait ("reply X", "RT to win": X downranks it).',
        'Replies: a few a day, only on fresh posts (under ~20 minutes old) from mid-size niche accounts, only where the reply adds a fact, a number or a joke; never polished agreement ("Great point!"), never the same words twice, never chosen by keyword alone. Answer everyone who replies to our posts: mutuals\' replies rank first, so follow back the relevant ones.',
        'No hashtags (one at most, only if it truly fits) and no off-topic trend-jacking.',
      ],
    },
    product: {
      summary: 'Push product ({product}): demo videos and free-vs-paid comparisons, the link in the first reply and the pinned post, real answers to people asking for a tool.',
      measure: 'Downloads per link placement (first reply, pinned post, bio), link clicks per 1,000 impressions and profile visits per post. Make more of what brings downloads, not likes.',
      postsPerDay: 2,
      rules: [
        ...X_SHARED,
        'The product is {product}. Every fact about it comes from its own page or krypt_tools; never invent numbers, users or reviews. No fake or AI-made testimonials; quote-post a real user only.',
        'Posts: a native demo video of one tool at a time (before / after with real, repeatable numbers, or a free-vs-paid comparison under the versus rules). The post itself has no link: the link goes in our own first reply under it. Never the same link text twice.',
        'The pinned post is the landing page: the best demo with a one-line "what it does", its link in the first reply (suggest a new pin to the user when a better demo exists).',
        'Replies to people who ask for a tool or describe the exact problem ("good free fps booster?"): answer the question first, mention the tool only when it fits, the link only when they asked for one; 2 per thread at most. Never DM anyone who did not write first.',
        'Trading and prediction-market tools: what the tool does ("you pick the markets, set limits, the ai does the trading"), never profit, P&L, win rates or "passive income"; add a plain risk line ("it can lose too"). Never a paid creator post about them on X (X bans paid promotion of gambling and financial risk since 2026-02). Crypto words can trip an automatic lock on first use: stop and report it if one appears.',
      ],
    },
  },
  tiktok: {
    grow: {
      summary: 'Mass growth: one numbered series of original screen demos with the result in the first second, made for search, 2 a day (3 once views hold).',
      measure: 'Follows per 1,000 views (the main number), 3-second hold, % watched in full and search share in TikTok Studio. A format with 2 of its last 5 videos above 3x the account median (or over 8 follows per 1,000 views) gets 3 variants and a part 2 within 48 hours; one with no video above 2x the median after 6-8 tries gets dropped. Under 2 follows per 1,000 views on a video that did well = the profile or the niche (tell the user).',
      postsPerDay: 2,
      rules: [
        ...TT_SHARED,
        'What the fastest faceless accounts in this niche do (@lucaswebq, 93K to 1.1M in two years): one series title on every video ("Powerful Websites You Should Know (Part 797)"), one site, tool or setting per video, 11-20 second screen recordings with captions, a one-line benefit caption in plain words. A narrow, repeatable angle keeps growing; general "AI tools" lists flatten out.',
        'Mix per day: one short result video (7-20 seconds, made to loop) and one search-led walkthrough (45-90 seconds) when the post limit allows; sometimes a part N of the latest winner or a video reply to the best question in our comments. Longer videos reach more people in large data sets, short ones finish more: judge each by average % watched.',
        'Hooks that fit: "this windows setting is on by default. i turn it off first", "3 windows tools i put on every new pc", "skip the random discord fps boosters. check this first", "pc websites you didn\'t know existed (part 1)". "part N" on screen; pin part 1 (playlists open at about 10K followers).',
        'Volume: more videos mean more chances at a breakout (the median small-account video stays near 500 views at any pace); at least 3 hours apart at the user\'s gap, never a batch, and step up at most once a week, only while our recent videos keep getting views.',
        'Engagement: reply to every comment on a new video in its first hour (2 per thread at most) and answer one good question a day with a video reply. Comments on others in 3-4 short sessions, on niche videos posted 15-60 minutes ago by creators with 10K-500K followers (skip huge or day-old ones), only where it adds something.',
        'Stitches and duets of big niche videos only when ours adds a screen recording ("here is the free version"); a bare reaction counts as unoriginal. Trending formats over trending songs; music stays low under the voice.',
        'Profile (suggest to the user in the report; profile changes are theirs): the niche keyword in the name, a one-line bio that says what followers get and how often, the 3 videos with the best follows per view pinned. Keep the account public with "Suggest your account to others" on.',
      ],
    },
    product: {
      summary: 'Push product ({product}): search-phrase demos and before / afters of it, the bio link and pinned videos as the landing page, video replies to "what app is this?".',
      measure: 'Profile views, bio-link clicks and downloads per 1,000 views by format (link clicks show in analytics on a Business account), and searches for the brand after posts. Views are only the top of the funnel.',
      postsPerDay: 2,
      rules: [
        ...TT_SHARED,
        'The product is {product}. Every fact about it comes from its own page or krypt_tools; never invent numbers, users or reviews. Real testimonials only, and only once they exist.',
        'Formats: a demo named after the exact phrase people search ("best free fps booster", "remove bloatware windows 11"), before / after with real, repeatable numbers from a real PC, the free-vs-paid comparison (versus rules; every price sourced, since TikTok removes misleading claims). One product per video, the result in the first second.',
        'The way to get it: the site name on screen and spoken ("search krypt cc") until the profile has a link; then "link in bio" (no evidence it costs reach). The bio link needs 1,000 followers on a personal account and is set in the phone app; a Business account may get it sooner (suggest it to the user, it limits sounds to the Commercial Music Library). The bio sells: what {product} does in one line plus "download below".',
        'Video replies to "what app is this?" and "link?" comments: each is a new searchable video. Text replies name the site in a few of your own words, never a link (2 per thread at most). No "comment KEYWORD" funnels: TikTok\'s keyword auto-replies are only for verified Business accounts, and you never send the same DM to commenter after commenter.',
        'Pinned videos (suggest to the user): what {product} is / which tool to get, the best before / after, and how to download and install it.',
        'TikTok requires the content disclosure setting when promoting your own business: turn it on with "Your brand" for every video that pushes {product} (TikTok says it does not change reach; an undisclosed one loses For You after 24 hours). If this account is paid or rewarded for promoting a product that is not its own (the Krypt creator program counts), use "Branded content" instead.',
        'Trading and prediction-market tools: walkthroughs of the settings, limits and paper mode, never results. Suggest to the user that they live on their own TikTok account, so a strike there never hits the PC-tools account.',
      ],
    },
  },
  threads: {
    grow: {
      summary: 'Mass growth: fast, real replies on fresh niche posts, plus 2-3 Threads-native posts a day that start conversations.',
      measure: 'Follows per 1,000 views by format and for our replies vs our own posts, replies per post, profile visits from replies. Judge a format after 8 posts over 2 weeks: 1.5x the account median gets made more, under 0.5x gets dropped. Drop a reply target that brought no profile visits after 10 replies.',
      postsPerDay: 3,
      rules: [
        ...TH_SHARED,
        'Replies carry growth here: most of the session goes to direct replies on fresh posts (under about 30 minutes old) from niche accounts with 20K-500K followers (PC gaming, Windows, AI tools, prediction markets), within the user\'s comment limit. Keep a list of the accounts that bring profile visits; a late reply on a 2-hour-old post is mostly wasted.',
        'Posts: about 60% conversation posts (a question or a mild opinion under 200 characters: "whats the first thing u install on a fresh windows pc"), about 30% media (a screenshot or a 10-30 second screen clip with a one-line take), about 10% product mentions with the link in our reply.',
        'Hooks: one line, one concrete fact or number ("task manager says 140 processes. i have chrome open. thats it", "turned off like 30 startup apps i never open. boot feels new"). The whole point goes in the first post (long self-reply chains did worse); humor gets more views (Meta).',
        'Volume: 2-4 posts a day at the user\'s gap (reach per post fell past about 6 a day in one study). Ride news the day it drops (a Windows update, a new AI model, a prediction-market headline) with our own take.',
        'What worked in this space: no faceless Windows-tips or free-tools account was found on Threads, so the niche looks open; the biggest faceless AI account (@chatgptricks, 759K) posts relatable one-liners every day and keeps the product in the bio, never in posts.',
        'Profile (suggest to the user in the report): the niche in the bio, up to 10 profile topics, one pinned demo post. The week\'s best post can go to the Instagram Story (Threads\' one-tap share) if the user wants.',
      ],
    },
    product: {
      summary: 'Push product ({product}): answers to people asking for a tool, demo posts with the link in our first reply, and the profile (bio links plus a pinned demo) as the landing page.',
      measure: 'Downloads per 1,000 views by format and link placement (UTM tags with utm_source=threads and utm_content=bio, pinned, reply or search-reply), profile views and follows. Threads removed in-app link-click insights, so downloads on the site are the real number.',
      postsPerDay: 2,
      rules: [
        ...TH_SHARED,
        'The product is {product}. Every fact about it comes from its own page or krypt_tools; never invent numbers, users or reviews.',
        'Answer people who ask: search Threads for "fps boost", "debloat windows", "free crosshair", "macro software", "free video editor", "polymarket bot" and the like, posts from the last 24-48 hours. Answer the question first in your own words; the link only when they asked for a tool, otherwise "its on my profile"; never the same wording twice, 2 replies per thread at most.',
        'Posts: a 10-30 second screen demo or a before / after screenshot of {product} with one line of what it does, its link in our own first reply (1-2 links a day at most); about 1 in 4 can be a link-card post instead, to compare. Free-vs-paid comparisons under the versus rules, prices sourced (Meta bans product misrepresentation).',
        'Weekly: one build-in-public post ("added X because you asked", only true ones), one how-to as a text attachment, and suggest a fresher pinned demo to the user when a better one exists.',
        'Profile as the landing page (suggest to the user): up to 5 bio links with the {product} page first, a pinned 20-30 second demo with what it does and "link in bio". The page a link opens must match the post exactly (Meta bans misleading links).',
        'No "comment KEYWORD" DM funnels (nothing supports them on Threads). If this account is paid or rewarded for promoting a product that is not its own (the Krypt creator program counts), use the paid partnership label.',
      ],
    },
  },
  facebook: {
    grow: {
      summary: 'Mass growth: original vertical Reels with a spoken hook in the first second, 2-3 named series, 2 a day (3 at most), plus comments as the Page on fresh niche posts.',
      measure: 'Follows per 1,000 views, shares per 1,000 views, 3-second hold and average watch time, per Reel after 48 hours. After 6-8 Reels of a format: 2x the Page median in follows per 1,000 views, or one Reel at 5x the median views, gets made more; under 0.5x or a 3-second hold under 30% gets dropped. If reach halves for a week, check the Page status before changing the content.',
      postsPerDay: 2,
      rules: [
        ...FB_SHARED,
        'Reels carry growth: Facebook recommends them to people who do not follow the Page, and views of original Reels roughly doubled in 2025. Mostly 30-75 seconds, a 2-3 minute full walkthrough a few times a week; under 10 seconds earns nothing. Reels from the same day get extra reach: post steadily, never in a batch.',
        'Run 2-3 named series ("free tool #12", "one windows setting a day"). Hooks that fit: "windows hides file extensions by default. one toggle fixes it", "this brings back the old right click menu on windows 11", "3 free tools worth installing on a fresh pc", "check if your game is capped at 60 fps".',
        'One photo or text post a day for followers when the post limit allows (a meme, or "which tool do you use for X?"): photos and text get the most engagement from followers, Reels bring the new ones. Weekly: a "top 5 free tools" photo carousel (preset slides, render_slides, browser_attach_slides).',
        'Comments as the Page on posts under an hour old from bigger niche Pages (PC gaming, Windows tips, AI tools, prediction-market news), only where it adds something, within the comment limit. Reply to every comment on our posts (2 per thread at most).',
        'A few "invite to follow" taps for people who reacted to our posts, spread across a session, never in bulk.',
        'Groups, from the Page\'s day 8: 1-2 helpful posts or answers a day in groups whose rules allow it, different text and visuals each time.',
        'Profile (suggest to the user in the report): category, a bio that says what followers get, cover, the best Reel pinned; the week\'s best Reel shared to the Page\'s Story.',
      ],
    },
    product: {
      summary: 'Push product ({product}): demo and before / after Reels, the Page button, website field and a pinned post as the landing page, and real answers in Groups where people ask for tools.',
      measure: 'Downloads by channel (UTM tags with utm_source=facebook and utm_medium=reel, dm, group, button or pin), button clicks and Page visits in Page insights, follows. Views are only the top of the funnel.',
      postsPerDay: 1,
      rules: [
        ...FB_SHARED,
        'The product is {product}. Every fact about it comes from its own page or krypt_tools; never invent numbers, users or reviews.',
        'Links are scarce: many Pages get 2 clickable links a month in posts and Page comments without a paid Meta plan (the composer shows a counter; past it links turn to plain text), links in Reel captions are not clickable, and link posts get little reach. Spend the 2 on the pinned demo and the month\'s best post (more links can go in the comments of a post that already has one). Note the counter in the report.',
        'The landing page (suggest to the user): the Page button ("Use app" or "Learn more") and the website field pointing to the {product} page with UTM tags, and a pinned demo post that uses link 1 of the month.',
        'Formats: demo Reels with the result first, before / after with real numbers (FPS, RAM, boot time), free-vs-paid comparisons under the versus rules with dated, sourced prices. Rotate which tool is featured each week.',
        '"Comment KEYWORD" only when the user has set up a Meta Business Suite comment auto-reply for it (Inbox > Automations); without it the call to action is "it\'s on our page". You never type the same link DM to commenter after commenter.',
        'Groups where people ask for tools ("any free fps booster?", Windows help, PC gaming): answer with 2-3 real steps first, mention {product} only when it fits, the link only when they asked and the rules allow it (some groups only allow promotion in a pinned thread or on set days); 2 per thread at most.',
        'If this Page is paid or rewarded for promoting a product that is not its own (the Krypt creator program counts), use the paid partnership label. Marketplace does not allow software.',
      ],
    },
  },
  pinterest: {
    grow: {
      summary: 'Mass growth: fresh, keyword-first Pins every day (numbered lists, cheat sheets, setups, short screen demos) on boards named after searches, judged over months.',
      measure: 'Impressions, saves per 1,000 impressions and outbound clicks per 1,000, per Pin at 30, 60 and 90 days, by format, design and keyword group; followers matter little. Once a format or keyword group has 10+ Pins at least 30 days old: 2x the account median (or a top-1% Pin) gets 3-5 new designs; under 30% of the median after 60 days gets dropped. A drop over 40% in a week: halve the volume and check for repeats or link problems first.',
      postsPerDay: 3,
      rules: [
        ...PIN_SHARED,
        'What works for tech on Pinterest: numbered lists and cheat sheets saved for years ("3 Crazy Useful Windows Tricks": 5,590 saves on an 809-follower account; "Windows Keyboard Shortcuts Cheat Sheet"), desk and gaming setups sold on the picture with style words (aesthetic, minimal, cozy, small), several different designs for one page. Evergreen how-tos beat news. AI-tool directory farms with repeated text went nowhere.',
        'Searches with their own Pinterest topic pages: windows 11 tips and tricks, windows keyboard shortcuts cheat sheet, pc keyboard shortcuts, laptop hacks windows, computer repair tips, pc gaming room ideas, small gaming pc setup, pc gaming setup in bedroom, work desk setup ideas, awesome websites, productivity tools. Check rising ones in Pinterest Trends (Analytics > Trends).',
        'Mix: about 70% 2:3 images (light background, a number in the title, a real screenshot), 20% 6-15 second vertical videos (they earn more saves), 10% collages (about 50% more saves than single images in Pinterest\'s own data). Overlay text short and plain ("7 settings gamers change first", "20 shortcuts. One screen.").',
        'Volume: 2-3 fresh Pins a day in weeks 1-2, 3-5 from week 3, up to the user\'s limit only while there are no blocks; each Pin saved first to its single best board. 12-20 boards with real descriptions; sections once a board passes about 50 Pins; 2-3 active group boards on the topic at most.',
        'Weekly: new Pins for rising searches in Pinterest Trends, 3-5 new designs for the top 10% of Pins, and replace any image that got an "AI modified" label with a real screenshot.',
        'Profile (suggest to the user in the report): a keyword name ("Free PC Tools & Gaming Setups"), a one-line bio of what the boards hold, the website claimed.',
      ],
    },
    product: {
      summary: 'Push product ({product}): how-to, before / after and comparison Pins that link straight to the matching {product} page, slow and search-driven.',
      measure: 'Outbound clicks per 1,000 impressions and downloads by Pin design (Pinterest adds utm_source=Pinterest and utm_medium=Organic itself; add utm_campaign for the tool and utm_content for the design). Judge after 4+ weeks; downloads on the site are the real number.',
      postsPerDay: 3,
      rules: [
        ...PIN_SHARED,
        'The product is {product}. Every fact about it comes from its own page or krypt_tools; never invent numbers, users or reviews. If {product} is a trading or prediction-market tool, do not pin it: say so in the report and pin nothing for it.',
        'The best bet is a how-to Pin that answers a search and ends on the tool: "Boost FPS on Windows 11 in 3 steps" to the Tweaker page, "Free up space on Windows" to the Cleaner page, crosshair code lists per game, before / after of an edit. Leave the last step on the site ("full list + the one-click tool"): Pins that answer everything get saves but no clicks.',
        'Free-vs-paid comparison Pins under the versus rules (sourced, dated prices; Pinterest bans deceptive or exaggerated claims). FPS or speed numbers only when measured and repeatable. Never a scare claim.',
        'Link to the tool\'s page, never straight to a download file (Pinterest blocks pages that start downloads). Many clicks come from phones that cannot install a Windows tool: suggest to the user a "send this to my PC" option on the page.',
        'Rotate the tools so no page gets a new Pin more than about once a week; weekly, a new design for each page whose Pins bring clicks.',
        'Affiliate links (the ElevenLabs one, for example) only with a clear disclosure in the Pin ("#ad" or "paid link"); if this account is paid or rewarded for promoting a product that is not its own (the Krypt creator program counts), disclose that too.',
      ],
    },
  },
};

export const goalOf = (a: Pick<IgAccount, 'goals'>, site: Site): GoalId => a.goals?.[site] ?? 'grow';
export const presetFor = (site: Site, goal: GoalId): GoalPreset | undefined => PRESETS[site]?.[goal];
export const sitesWithPresets = (): Site[] => Object.keys(PRESETS) as Site[];

/** What "Push product" pushes for this account: its own pick, else the brand. */
export function productName(a: Pick<IgAccount, 'pushProduct'>, brand: Pick<Brand, 'name' | 'site'>): string {
  const p = a.pushProduct?.trim();
  if (p) {
    const t = kryptToolById(p);
    return t ? `${t.name} (${t.url})` : p;
  }
  if (isKryptBrand(brand)) return 'the Krypt tools, one per Reel (krypt_tools)';
  if (!brand.name.trim()) return 'the brand';
  return brand.site ? `${brand.name} (${brand.site})` : brand.name;
}

const fill = (s: string, product: string): string => s.split('{product}').join(product);

/** One line for get_today's platform line. */
export function goalLine(a: IgAccount, site: Site, brand: Brand): string {
  const g = goalOf(a, site);
  const p = presetFor(site, g);
  if (!p) return a.goals?.[site] ? `GOAL: ${GOAL_LABEL[g]}` : '';
  return `GOAL: ${fill(p.summary, productName(a, brand))} Judge it by: ${p.measure}`;
}

/** The whole playbook, for the first browser_open of the day on that platform. */
export function goalPlaybook(a: IgAccount, site: Site, brand: Brand): string {
  const g = goalOf(a, site);
  const p = presetFor(site, g);
  if (!p) return '';
  const product = productName(a, brand);
  return `GOAL ON THIS PLATFORM: ${GOAL_LABEL[g].toUpperCase()} (the user's pick; inside the limits and rules):\n${p.rules.map((r) => `- ${fill(r, product)}`).join('\n')}\nJudge it by: ${p.measure}`;
}
