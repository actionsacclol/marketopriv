import type { Brand, CustomStyle, IgAccount } from './types';
import { isKryptBrand } from './brand';

// Channel styles (the Styles page): what an account's videos are, as a whole —
// the kind of story, the look, how it ends. Each has a short label so the user
// can say "run the vote style on @x". An account runs one or more (IgAccount.styles,
// first = its main); the AI alternates between them. Each style's preview is one
// of the example videos (shared/examples.ts).

export interface ChannelStyle {
  id: string;
  /** What the user calls it ("run the vote style"). */
  label: string;
  name: string;
  /** One or two lines for the card. */
  about: string;
  /** Example video id (resources/examples/<id>.mp4). */
  preview: string;
  bestOn: string;
  /** Format to start from (list_formats), if any. */
  format?: string;
  /** How the AI makes it. */
  rules: string;
  /** One of the user's own styles (made on the Styles page or by their AI), built on the built-in style `base`. */
  custom?: boolean;
  base?: string;
}

// Shared by the meme styles (reddit, greentext, meme, dumb).
const BG_RULE = "Background: rotate the built-in ones (bg runner, bounce, slice) so reels in a row differ, or a video: list_media kind backgrounds lists the user's own (gameplay, parkour, soap cutting); set bg video, video = its path, bg_start somewhere random in it. A YouTube video the user gave for backgrounds: save_clip a part of it (up to 90 s; it loops) and use that file. Prefer footage without its own captions or big watermarks.";
const TONE_RULE = "Follow the account's tone (its account line; Styles page): clean = nothing a parent would mind, no swearing (\"jerk\", not \"a-hole\"); edgy = dark humour and mild swearing, strong words censored on screen and in the voice line (\"f*ck\" on screen, \"freaking\" read out); raw = swearing allowed, written and said as people say it. In every tone: no slurs, no sexual content, nothing about minors and sex or self-harm, no real violence shown, nothing that targets a real private person; those get accounts struck.";
const FREE_RULE = "It is not a brand reel: no product, logo, end card, link or disclaimer on the video or in the caption (the preset leaves them off), unless the user asked for them. The account's niche is the topic when there is one.";

export const STYLES: ChannelStyle[] = [
  {
    id: 'main',
    label: 'main',
    name: 'Brand stories',
    about: 'Real stories in beats with live charts and numbers, and your product where it fits. The main style: everything else in the AI\'s instructions describes it.',
    preview: 'story-flat',
    bestOn: 'Every platform',
    rules: 'The brand\'s own reels: the formats, the art style test and the voice test as described above.',
  },
  {
    id: 'vote',
    label: 'vote',
    name: 'Comment vote story',
    about: 'A story told in parts. Each part ends on a choice, viewers vote A or B in the comments, and the most votes decide what happens in the next part. The comments are the point, so each part pulls people back for the next.',
    preview: 'story-vote',
    bestOn: 'TikTok, Shorts, Reels',
    format: 'vote-story',
    rules: [
      'A series of short parts (20-35s) with the mascot as the main character (art ps2 or cartoon, the same art for the whole series). Start from format vote-story, and pass vote: {series, part, a, b} to create_reel.',
      'Part 1 sets up one situation people care about (in the brand\'s world: a wallet, a coin, a PC that will not boot, a sketchy download). Every part ends on a real choice with two options, both tempting, shown with a poll beat: the headline names both options ("*A:* pay the expert. *B:* guess it himself."), the poll field a is just "A;B" (the pills fit about 8 letters), and the line is said out loud, ending "Comment A or B."',
      'Title the video and the caption "Part N", and end the caption with "Comment A or B. Most votes decides part N+1."',
      'From about 12 hours after a part is posted, read its comments on every platform it is on, count each person once, only for a clear A or B, and record_votes. Never invent or round up votes. With no votes at all, pick the option that makes the better story and say so in the next part ("Nobody voted, so KIP chose...").',
      'The next part opens with the result ("You picked B: ...") and what happened, then the next choice. Post it on the same platforms as the last part. End a series after 3-6 parts with a finale that wraps it up, then start a new one.',
      'Keep it honest: choices with money in them show what really tends to happen (no promised profits; "Not financial advice." when trading is in it). The product appears only where the story naturally needs it.',
    ].join(' '),
  },
  {
    id: 'tips',
    label: 'tips',
    name: 'One-tip tutorial',
    about: 'One useful tip per video with the exact steps on screen, acted out by a cartoon mascot. Fast to watch, easy to save.',
    preview: 'story-cartoon',
    bestOn: 'TikTok, Shorts',
    rules: 'Story reels in art cartoon, 15-25s: the problem in the first beat, the exact steps (steps visual, real menu names and keys), the result, then "Follow for one tip a day." One tip per video; a tool appears only when it is the tip.',
  },
  {
    id: 'retro',
    label: 'retro',
    name: 'PS2 quest',
    about: 'An early-2000s console look: the story is a "side quest" told in a game dialogue box, in a foggy low-poly world.',
    preview: 'story-ps2',
    bestOn: 'Shorts, TikTok',
    rules: 'Story reels in art ps2, framed as a game: "Side quest:" in the first line, each step a stage, "Quest complete." at the end. Works for checklists, how-tos and explainers.',
  },
  {
    id: 'toy',
    label: 'toy',
    name: '3D mascot',
    about: 'A glossy, toy-like 3D mascot in a soft studio. Friendly, brand-mascot feel for explainers and warnings.',
    preview: 'story-3d',
    bestOn: 'Reels, Facebook',
    rules: 'Story reels in art 3d: a short relatable moment, the mascot reacts, then the fix. Calm music (bed lofi or ambient).',
  },
  {
    id: 'wyr',
    label: 'wyr',
    name: 'Would you rather',
    about: 'Rapid A-or-B choices with a 3-2-1 countdown on each. Everyone has an opinion, so the comments fill up on their own.',
    preview: 'story-wyr',
    bestOn: 'TikTok, Shorts, Reels',
    rules: 'Story reels of 3-5 poll beats: each headline is one "Would you rather" choice naming both sides (*accent* the two), the poll field a holds two short labels that fit the pills (about 9 letters each, e.g. "1 BTC;$10K"), said out loud with pause=0.3. Choices from the brand\'s world, both sides tempting. Last beat: "Comment your picks." (follow). No profit promises inside the choices.',
  },
  {
    id: 'case',
    label: 'case',
    name: 'Scam autopsy',
    about: 'True-crime for crypto: one real rug, hack or scam, taken apart beat by beat. Where the money went, and the red flags anyone could have seen.',
    preview: 'story-case',
    bestOn: 'Shorts, Reels, X',
    rules: 'Story reels, dark look (theme dark, bed ambient), 30-45s. Only real, reported cases: the date and sources in the kicker, every number from those sources. The hook is the loss or the twist; then how it worked (wallet / flow / chart), the moment it collapsed (stamp), and the red flags as steps. Say "reportedly" where the sources do; never name a private person as a criminal. The tool appears only if it would have shown a red flag, without promising it would have saved anyone.',
  },
  {
    id: 'quiz',
    label: 'quiz',
    name: 'Guess what happened',
    about: 'A real chart cut off at the big moment, a poll ("up or down?"), then the reveal stamped on screen. People rewatch to check their guess.',
    preview: 'story-quiz',
    bestOn: 'Shorts, TikTok, X',
    rules: 'Story reels: the setup chart (real data up to the moment), a poll beat "Up;Down" (or two outcomes) with "Guess before the reveal.", then the real chart continuing (dark wipe) and a stamp with the result. Real, sourced data only, the date in the kicker. Never frame the answer as a trading signal; "Not financial advice." on market ones.',
  },
  {
    id: 'myth',
    label: 'myth',
    name: 'Myth busted',
    about: 'A thing everyone believes, the evidence, then BUSTED or TRUE slammed on screen.',
    preview: 'story-myth',
    bestOn: 'Every platform',
    format: 'myth-vs-data',
    rules: 'Start from format myth-vs-data. One myth per reel, stated in the first beat the way people say it; then what is actually true, with the number or the screen; then the verdict stamp (BUSTED / TRUE / HALF TRUE); then what to do instead. Sources in the kicker.',
  },
  {
    id: 'top',
    label: 'top',
    name: 'Voiced top 5',
    about: 'A countdown, one item per beat, every line voiced with sound effects and music. The talking version of a "top 5" list.',
    preview: 'story-top',
    bestOn: 'TikTok, Shorts',
    rules: 'Story reels, never the silent list preset: a hook beat ("3 Windows shortcuts nobody uses"), then one beat per item counting down (title visual: a = "#3", b = the item; or steps / card for what it does), each line saying what it does in one sentence, then a follow beat. 3-5 items, all real and checked.',
  },
  {
    id: 'chat',
    label: 'chat',
    name: 'Text story',
    about: 'A phone chat that types itself out, message by message, with pops and music. The story is in the messages: a scam DM, a friend with a bad idea, a deal that is too good.',
    preview: 'story-chat',
    bestOn: 'TikTok, Reels, Shorts',
    rules: 'Story reels made of chat beats (a = messages, ">" = mine; b = the contact). 4-6 beats, 2-3 messages each; the narrator reads them. Kicker "STORY" (they are made up, so never present one as a real conversation or use a real person\'s name or handle). Build to a twist, then the lesson (stamp or steps): how to spot it, what to do. Scam stories show the scam failing, never a working how-to.',
  },
  {
    id: 'tier',
    label: 'tier',
    name: 'Tier list',
    about: 'Things ranked S to F on a tier board, one at a time, with a one-line reason each. Rankings start arguments, and arguments are comments.',
    preview: 'story-tier',
    bestOn: 'TikTok, Shorts, Reels',
    rules: 'Story reels: a hook beat ("Ranking every way to store a seed phrase"), then one tier beat per item (a = "S:Item", the line gives the reason), 5-7 items, then "Where would you put them? Comment." (follow). Rank on facts you can say out loud. Never rank trading tools by profit, and never put a competitor in F without a fact that shows why.',
  },
  {
    id: 'screen',
    label: 'screen',
    name: 'Screen tutorial',
    about: 'A real screen recording of the app doing the thing, with a voice walking through the steps and callouts on screen. The proof is the screen.',
    preview: 'story-screen',
    bestOn: 'TikTok, Shorts',
    rules: 'Use the app\'s bundled recording (krypt_tools shows its path) or record_screen a fresh one (launch: its Start menu name), look at the frames, set fields.video to the recording, then story beats: a hook beat with the result, screen beats for each step (a = the second in the recording, "@x,y x2" to zoom on the button, b = the callout like "Click Scan"), and a follow beat. Only real recordings of real results on this PC; never fake or edit numbers. Trading tools (Krypto Bot, Krypto Mirror, the PolyBots, Krypt Trader) only in paper / demo mode, with "Demo data" in the kicker, and never show demo PnL as earnings. Not financial advice on those.',
  },
  {
    id: 'proof',
    label: 'proof',
    name: 'Before / after',
    about: "The problem, then the fix, on a real recording: the full drive, the stutter, the failed check first, then the same thing fixed, with the numbers slammed on screen. 10-20 seconds, no slides.",
    preview: 'clip-proof',
    bestOn: 'TikTok, Shorts, Reels',
    rules: "create_reel preset clip with a real recording of the tool on this PC: the app's bundled recording (krypt_tools shows its path) or record_screen a fresh one (launch: its Start menu name). Look at every frame before using it: no personal data, wallets, emails or names on screen. The recording shows the before and then the after of the same thing (free space before and after Krypt Cleaner, the Fixer's checks before and after Krypt Tweaker, a game without and then with Krypt Crosshair). fit cover (blur for a wide window), look meme, zoom off, seconds 10-20: open on the problem, cut to the fix fast. stamps on the two numbers the recording itself shows (\"2.1 | 3.2 GB free / before\", \"9.4 | 41.8 GB free / after\"); never a number that is not on screen. punches on the button that does it. headline: the problem in the viewer's own words, 3-8 words, no product name (\"my PC after 2 years of games\"). captions: 2-4 short lines, or none. A voice is optional; music or the recording's own sound. No end card or logo: the tool is named in a short last caption and in the post caption. Not for the trading tools. A wide app window: fit cover with game set to the panel that matters (moving with the action: \"0 | x,y,w,h; 8 | x,y,w,h\", fractions read off the frames), so its text reads on a phone; never the whole window shrunk to phone width.",
  },
  {
    id: 'pov',
    label: 'pov',
    name: 'POV meme',
    about: "A 6-12 second screen clip with one meme line on top (\"pov: you finally found what was eating your FPS\"), no voice, cut to loop. The way meme pages post.",
    preview: 'clip-pov',
    bestOn: 'TikTok, Reels, Shorts',
    rules: "create_reel preset clip with a real recording of the tool on this PC: the app's bundled recording (krypt_tools shows its path) or record_screen a fresh one (launch: its Start menu name). Look at every frame before using it: no personal data, wallets, emails or names on screen. fit cover, look meme, zoom on, seconds 6-12, on the best moment of the recording (the result landing). headline = one meme line, lowercase, in a \"pov:\", \"me when\", \"nobody:\" or \"when the\" form, under 12 words, about the viewer's life, not the product (\"pov: you deleted 40gb you never downloaded\"). No captions, at most one stamp, no voice. music: an upbeat bed, or the recording's own sound. Cut it so the last frame flows back into the first (a loop). The tool is named only in the post caption. Trading tools: lines like \"pov: your ai placed a trade while you slept\" on the paper-mode screen, never money or profit. A wide app window: fit cover with game set to the panel that matters (moving with the action: \"0 | x,y,w,h; 8 | x,y,w,h\", fractions read off the frames), so its text reads on a phone; never the whole window shrunk to phone width.",
  },
  {
    id: 'speed',
    label: 'speed',
    name: 'Speed demo',
    about: "The app doing its one big thing in 12-18 seconds: fast, a zoom punch on every click, captions word by word. Shows how easy it is.",
    preview: 'story-screen',
    bestOn: 'TikTok, Shorts, X',
    rules: "create_reel preset clip with a real recording of the tool on this PC: the app's bundled recording (krypt_tools shows its path) or record_screen a fresh one (launch: its Start menu name). Look at every frame before using it: no personal data, wallets, emails or names on screen. fit cover or blur, look meme, zoom off, seconds 12-18: open on the result, then the clicks that get there, quick. punches on 3-5 clicks (the points from the frames). stamps on the payoff (\"DONE\", or the real number on screen). headline: what the viewer gets, 4-8 words (\"Your AI trades Kalshi for you\", \"Fix stutter in one click\"). captions: what happens, a few words each, timed to the clicks. Music only, or a voice reading the captions fast. The tool named in the last caption and the post caption, no end card. Trading tools in paper mode only, \"Not financial advice.\" in disclaimer. A wide app window: fit cover with game set to the panel that matters (moving with the action: \"0 | x,y,w,h; 8 | x,y,w,h\", fractions read off the frames), so its text reads on a phone; never the whole window shrunk to phone width.",
  },
  {
    id: 'series',
    label: 'series',
    name: 'AI trades for me',
    about: "For the trading bots: one AI trading Polymarket or Kalshi by itself, as a running series (\"I let Claude trade Kalshi. Day 3.\"). The real app screen, paper money, the result as it really went. People follow to see how it ends.",
    preview: 'story-screen',
    bestOn: 'TikTok, Shorts, X',
    rules: "Only for Krypt PolyBot, Polybot US and Krypt Trader. A series: each part is the next day of one AI trading by itself in paper mode. list_posts with query \"day\" finds the last part and its numbers; this part is the next day (day 1 when there is none). record_screen the app while its AI is trading (the bundled recording for day 1), look at every frame (no keys, emails or account numbers), then create_reel preset clip: fit cover or blur, look meme, seconds 12-25, headline \"I let Claude trade Kalshi. Day N.\" (the AI, the exchange, the day). stamps on what the screen shows: the market it picked, \"TRADE PLACED\", the paper balance or the scoreboard, as they really are. punches on the order and the result. captions: what it bet on and why, a few words each. Every number comes off the recording, and a losing day is shown like a winning one. \"paper money\" stays on screen (a caption or a stamp's small line) and disclaimer \"Not financial advice.\". Never \"profit\", \"easy money\" or a promise: the hook is the AI doing it by itself. End on the next part (\"day N+1 tomorrow\"). A wide app window: fit cover with game set to the panel that matters (moving with the action: \"0 | x,y,w,h; 8 | x,y,w,h\", fractions read off the frames), so its text reads on a phone; never the whole window shrunk to phone width.",
  },
  {
    id: 'versus',
    label: 'versus',
    name: 'Free vs paid',
    about: 'A paid app people really buy, its price slammed on screen, then the free Krypt tool doing the same job on a real screen. "Why are you paying for this?"',
    preview: 'story-myth',
    bestOn: 'Shorts, TikTok, Reels',
    rules: "Only for a Krypt tool whose krypt_tools entry lists paid rivals (Tweaker, Cleaner, Crosshair, Macro, Editor, Ghost; not Cursor, the user dropped it), and only the rivals listed there; follow its rules for comparing. Check the rival's price on its own store page that day. Story reels, 15-30 s: a hook beat with the paid thing and its price in the viewer's words (\"People pay $45 a year for this.\"; stamp the price, small line \"list price, per year\"), one beat on what that money buys, then screen beats of the Krypt tool doing the same thing for real (its bundled recording from krypt_tools or record_screen; look at every frame for private data), a verdict stamp (\"$0\" or \"FREE\", small line: the real difference, e.g. \"no account, no background service\"), then a follow beat with the tool's link. Or the clip preset: the same recording with the price stamp first and \"$0\" on the result. One rival per reel; a series across rivals works (\"Paid vs free, part 2\"). Never invent numbers: space freed, FPS or scores only as the recording shows them.",
  },
  {
    id: 'clipping',
    label: 'clipping',
    name: 'Stream clips',
    about: 'The best moments from the Twitch and Kick streamers you pick: their top clips of the last day or week, cut vertical with the facecam on top, the gameplay below and captions on every line.',
    preview: 'clip-split',
    bestOn: 'TikTok, Shorts, Reels',
    rules: [
      'Reels cut from the Twitch / Kick clips of the streamers set for this account on the Styles page (the user picks the streamers and last day or last week there). find_clips lists their top clips by views and marks the ones already used.',
      'When the user gives a YouTube video (in chat or in the reel queue), clip that instead: find_clips with video lists its most replayed parts; save_clip with the video address, start and seconds records the part. Same rules from here on, with the YouTube channel named in the post caption ("Clip: <channel> on YouTube").',
      'Take the most-viewed clip that is not used yet and has a moment worth watching in 8-60s. save_clip it: it downloads the clip, captions the speech on this computer and returns frames.',
      'Look at the frames for the streamer\'s webcam. create_reel with preset clip: video = the saved file, source = the clip address, fit split, cam = the webcam area as "x,y,w,h" fractions of the frame (empty when there is no webcam), game = the gameplay area (empty = the middle of the frame; keep the webcam out of it when you can), sound on, zoom off, start and seconds on the best 8-45s (start on the action, cut dead air), headline = a short hook from what happens or what is said (never promise what the clip does not show), captions = save_clip\'s caption lines for that span (leave captions empty when the frames show the stream\'s own captions already burned into the video: two sets of captions look broken; or set game to leave them out), disclaimer empty (it is not a trading reel). preview_reel to check the webcam sits right before render_reel.',
      'It is only the clip: no end card, no logo, no brand, product, link or call to action on the video or in the post caption (create_reel leaves the end card off for clip reels). Add them only when the user asked for it.',
      'Name the streamer in the post caption ("Clip: <name> on Kick" or "on Twitch", with their @ on a platform where you know it). Never post as if you were the streamer or speak for them.',
      'Skip clips with nudity, slurs, violence or anything the platform would strike. Casino and gambling clips get limited or removed on TikTok, Instagram and YouTube: skip them unless the user said to post them, and never add a casino link or code.',
    ].join(' '),
  },
  {
    id: 'reddit',
    label: 'reddit',
    name: 'Reddit story',
    about: 'A Reddit-style post card, then the story read out over moving background footage with big captions popping in a few words at a time. Long stories come in parts, and the parts are what bring people back and make them follow.',
    preview: 'narrated-reddit',
    bestOn: 'TikTok, Shorts, Reels',
    format: 'reddit-story',
    rules: [
      "create_reel preset narrated (or format reddit-story). The first line is the post card: visual post, text = the post title (the hook: a moral dilemma or a shocking detail in the first words, the way the title of a top post reads), a = \"r/<community> · u/<made-up name> · <hours>h\", b = votes;comments (believable for that community, e.g. \"14.2K;1,983\"). Then the story, one or two sentences per line (visual none): first person, specific details (ages, places, exact words people said), building to a twist, ending on the question to the viewer (\"So, am I the jerk?\", \"What would you have done?\") so people argue in the comments.",
      "Write original stories in the voice of the community (AmItheAsshole, tifu, pettyrevenge, MaliciousCompliance, ProRevenge, relationship_advice, entitledparents, nosleep for scary ones) and keep them believable. Made-up usernames only: never a real person's username, name or face, never a real business accused of something. When the user gives a Reddit post (a link in chat or in the queue), read it with WebFetch, retell it in your own words with its facts, and credit it in the post caption (\"Story: r/<community>\"); if it can't be read, ask them to paste it, or write an original one and say so.",
      "Length 40-75 s. A longer story is split: part \"Part 1\", \"Part 2\"... on the card and the corner, each part ends on a cliffhanger line (\"Part 2 is on my page.\"), the caption says the part; the next part (list_posts with the title as the query finds the last one) starts with a one-line recap on the post card line.",
      BG_RULE,
      "Voice: the user's voice, read fast (gap 0.1-0.15). captions words, caption_color yellow or green. Music: none, or creepy (bed_volume 0.25) for scary ones. Effects only on the twist line (zoom boom, or scratch), never on every line.",
      TONE_RULE,
      FREE_RULE,
      "Post caption: the title as a question or teaser, \"Part N\" when it is a series, 3-5 hashtags like #redditstories #aita #storytime.",
    ].join(' '),
  },
  {
    id: 'greentext',
    label: 'greentext',
    name: 'Greentext',
    about: 'A ">be me" story building up line by line on an imageboard-style post, read out deadpan, with a hit on the punchline. Short, absurd and very rewatchable.',
    preview: 'narrated-green',
    bestOn: 'TikTok, Shorts, Reels',
    format: 'greentext',
    rules: [
      "create_reel preset narrated (or format greentext). Every line is visual green: its text is one to three greentext lines separated by \" / \", each starting \">\" (\">be me / >24, works in IT\"); they stack up on one board and the voice reads them without the \">\". 8-16 lines, 20-45 s.",
      "Write it the way greentexts are written: \">be me\" first, tiny deadpan lines, \">mfw\" and \">tfw\" for reactions, a setup that escalates and a twist or self-own in the last line. Original stories only, posted as Anonymous (board field): never present it as a real person's post.",
      "The punchline line gets the edit: zoom boom, scratch, or sad. board_look classic (pale board, green text) or dark. " + BG_RULE,
      "Voice: the user's voice, deadpan and quick (gap 0.15). Music: none or goofy at a low level.",
      TONE_RULE,
      FREE_RULE,
      "Post caption: one short line, 3-5 hashtags like #greentext #storytime.",
    ].join(' '),
  },
  {
    id: 'meme',
    label: 'meme',
    name: 'Meme slideshow',
    about: 'Three to seven relatable memes in a row, a hard cut and a sound on each, with music made by the hub. The kind of post people send to a friend.',
    preview: 'meme-slides',
    bestOn: 'TikTok, Reels, Shorts',
    format: 'meme-slides',
    rules: [
      "create_reel preset meme (or format meme-slides): 3-7 panels, 1.8-3 s each, one joke per panel, all about the same thing (the audience's life in the account's niche: gamers, traders, students, gym, office...). layout top (the white caption bar) for most; impact for classic templates; over for reaction clips.",
      "Pictures: list_media kind memes (with look) shows the user's meme folder (templates, reaction pictures, screenshots): pick ones whose picture fits the joke and use them as image panels. No picture fits: a char panel (the mascot acting it out: shock, laugh, think, facepalm...), a text panel (notes for the notes-app look), or a screen panel on a part of a saved clip. Never a photo of a private person, and never a real person's name on a joke about them.",
      "Captions written like real meme pages: lowercase, short, the setups people use (\"me when\", \"nobody:\", \"pov:\", \"my brain at 3am:\", \"them: / me:\"), about a feeling everyone has had. One punchline panel gets an effect (zoom boom, fry bass, or sad); the rest are clean.",
      "Music: bed goofy or phonk (sfx on), or the user's own music file. loop on. Voice off, unless a panel's joke is spoken.",
      TONE_RULE,
      FREE_RULE,
      "Posted as a video; where the account also runs the slides style, the same panels can go up as a photo post (render_slides, browser_attach_slides). Post caption: a short relatable line and 3-5 niche hashtags.",
    ].join(' '),
  },
  {
    id: 'dumb',
    label: 'dumb',
    name: 'Dumb edit',
    about: 'Absurd 5-15 second shitpost edits: a normal moment, then a sudden zoom with a deep boom, a deep-fried freeze frame, an air horn. Made to be rewatched and sent around.',
    preview: 'meme-dumb',
    bestOn: 'TikTok, Shorts, Reels',
    format: 'dumb-edit',
    rules: [
      "create_reel preset meme (or format dumb-edit): 1-4 panels, 5-15 s in all, layout over (the picture fills the screen, the caption on top). The setup panel plays it straight; the punchline stacks the edit at one moment: zoom (onto the face or the detail: zoom=x,y) with boom and shake, or freeze with scratch, or fry with bass, or flash with horn. Effects at the exact second (zoom@1.4=0.5,0.35 boom@1.4 shake@1.4).",
      "Source: a part of a clip (screen panels on fields.video: a saved stream clip, the user's own footage from the Memes folder via list_media, a screen recording), a picture from the Memes folder, or the mascot (char panels). Captions in the voice of shitpost pages: \"bro thought...\", \"nah because why did he...\", \"the way he...\", lowercase, a few words.",
      "Music: none (the hits carry it) or phonk. loop on so the end runs back into the start.",
      TONE_RULE,
      FREE_RULE,
      "Post caption: a few words or one emoji-free line, 3-5 hashtags.",
    ].join(' '),
  },
  {
    id: 'stickman',
    label: 'stickman',
    name: 'Stickman',
    about: 'A hand-drawn stick figure acts it out: narrated "why does your PC..." explainers, or wordless "this guy vs that guy" clips where the smart move lights up. The stickman shows the problem, a real screen recording shows the fix.',
    preview: 'stick-versus',
    bestOn: 'Shorts, TikTok, Reels',
    format: 'stick-explainer',
    rules: [
      "create_reel preset stickman, alternating two formats. stick-versus (10-25 s, wordless): two figures named in labels (\"Default Windows guy;Tweaked guy\", \"Overthinker;Doer\"), the same situation for both, every beat \"poseA/poseB\", voiceover off, captions title with one short setup line per beat (*word* in the highlight colour), the payoff beat with win=a or win=b and a big word, the product (if any) for 2-3 s as a laptop or screen prop showing its real recording; bed phonk or lofi, sfx on, loop on; the post caption ends \"Which one are you?\". stick-explainer (45-65 s, narrated): a \"Why...\" / \"How...\" question the viewer can't answer in the first line, one or two sentences a beat and a new pose or prop every beat (a scene every 2-4 s), cam=close on the reveal, the fix on a real screen (a screen or laptop prop with the tool's bundled recording from krypt_tools or a record_screen one; look at every frame for private data first), captions words, the user's voice, bed lofi low.",
      "Frame the topic as a rivalry, a mystery or a mini-story, never a definition: \"stickman explains RAM\" style videos get a few hundred views. The stickman shows the problem; the real screen shows the fix.",
      "Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new script with a real point, different poses, props, camera and hook each time, never the same opening twice. Keep one figure per series (gear, look and highlight colour), change them between series, and keep mixing in the account's other styles.",
      "Scenes and characters are made up; every fact, setting, menu path and tool feature is real (krypt_tools for Krypt tools). Numbers only as the recording shows them.",
      "Trading and prediction-market tools: the figure hands the work to a robot prop (\"AI trades for you, easy\"), never the bot's screens, never a chart going up, P&L, wins, profit or \"bet\"; a plain risk line on screen or in the voice (\"It can lose too.\") and disclaimer \"Not financial advice.\".",
      "Our own figure only: never a look-alike of an existing stick-figure character (Alan Becker's coloured figures or the animator-fights-the-drawing idea, Henry Stickmin's bean head and hat), no meme characters, no real people.",
      "Narrated ones use a realistic AI voice: turn on TikTok's AI-generated label and Meta's AI info label when posting them. Post caption: the hook as a question, the series name when it is one (\"Windows crimes #4\"), the tool named once, 3-5 hashtags.",
    ].join(' '),
  },
  {
    id: 'blox',
    label: 'blox',
    name: 'Blocky avatars',
    about: 'Blocky game avatars act it out, the way Roblox-style story, rant and skit shorts do: a narrated rant with a new move on every line, a wordless two-avatar skit with chat bubbles, or one avatar dancing under a line everyone relates to. Our own avatar, worlds and moves, drawn by the hub.',
    preview: 'blox-rant',
    bestOn: 'Shorts, TikTok, Reels',
    format: 'blox-rant',
    rules: [
      "create_reel preset blox, rotating three formats. blox-rant (25-45 s, narrated): one avatar, a complaint or a small story the viewer knows from their own life, told in first person; one or two short sentences a beat, a new move on every beat and a camera change every second or third (cam=close on the punchline, cam=low for the big moment, cam=far for the opener or a walk), one big word on the turn, captions words, the user's voice, bed goofy or lofi low. blox-skit (12-25 s, wordless): two avatars named in names (\"Me;My PC\", \"Day 1 me;Day 30 me\"), every beat \"moveA/moveB\", voiceover off, captions title with one short setup line, what they say as bubble props (2-6 lowercase words, the way people type in a game chat), a fall, shock or cheer as the punchline with one effect on it (boom, shake), bed goofy or phonk, loop on. blox-dance (7-12 s, wordless): one avatar on dance, groove and spin for the whole clip under one relatable line as the title caption (\"me after fixing *one* bug\"), a new camera on each beat (cam=far, orbit, cam=low, push), bed phonk; the loop is the point, and the post caption does the talking.",
      "The avatar is the channel. Keep one look (the avatar field), one name and one world per series so people recognise it, and change the world or the time of day between series. A product or tool is the thing the avatar ends up using: type at the desk, then a screen=second panel with its real recording (krypt_tools names a Krypt tool's bundled one, or record_screen; look at every frame for private data first). It is never the hook.",
      "Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new script with a real point, different moves, props, cameras and a different hook each time, never the same opening twice, and keep mixing in the account's other styles.",
      "Scenes and characters are made up; every fact, setting, menu path and tool feature said in them is real (krypt_tools for Krypt tools). Numbers only with a source.",
      "Trading and prediction-market tools: the avatar hands the work to the robot prop (\"AI trades for you, easy\"), never the bot's screens, never a chart going up, P&L, wins, profit or \"bet\", no coin or trophy prop on those reels; a plain risk line on screen or in the voice (\"It can lose too.\") and disclaimer \"Not financial advice.\".",
      "Our own avatars and worlds only. Never the Roblox name or logo on the video or in a name tag, nothing that reads as made in or endorsed by Roblox, no copy of a known avatar, creator's character, face or catalog item, no real game's map or footage. Game hashtags (#roblox) only when the reel's topic really is that game.",
      "A lot of young people watch this look: keep it clean whatever the account's tone. No swearing, nothing sexual, no gore, no bullying, nothing that asks kids to buy, click or message.",
      "Narrated ones use a realistic AI voice: turn on TikTok's AI-generated label and Meta's AI info label when posting them. Post caption: the hook in other words or as a question, one line that invites a reply (\"which one are you?\"), 3-5 niche hashtags.",
    ].join(' '),
  },
  {
    id: 'ask',
    label: 'ask',
    name: 'Ask the AI',
    about: "A person asks, your AI character answers: two 3D characters at a desk, a claim everyone repeats, checked in three named parts on a board above them. Reads like an episode of a show, and every episode ends on \"send this to the friend who...\".",
    preview: 'ask-explainer',
    bestOn: 'Reels, TikTok, Shorts',
    format: 'ask-explainer',
    rules: [
      "create_reel format ask-explainer (preset duo), 45-70 s. The cold open, full screen, under 6 seconds: the AI character says a claim or a number people in the niche already repeat (a chip line puts it in the corner), the asker's bubble asks what the viewer is thinking (\"is that true?\", \"wait, which one?\"), the AI promises the parts (\"Let me show you. Three parts.\"). Then the board: part=1, part=2, part=3, each named in the parts field, 3-5 short lines a part and a new diagram every line or two (steps, number, bars, stamp, card, a screen line with the real recording). The last part is the honest check (\"Is it real?\", \"Does it matter?\", \"What it costs\") and lands on a stamp. The last line is the end card.",
      "Two voices, in this style only: the AI character has the reel's voice and the asker the user's other voice, which the hub puts in asker_voice by itself (leave both voice fields alone). Then the asker's lines are heard and the asker may open the reel with the claim (\"people say X. is that true?\"); with no second voice their lines are bubbles.",
      "The asker is the viewer. Every 8-12 seconds a bubble with the doubt a real person would have (\"so it's free?\", \"and if it breaks?\", \"so am I rich?\"): 2-6 lowercase words, never a setup for the product. The AI answers it straight, also when the answer is no (\"No. But...\").",
      "Topic: something people already argue about or want right now (a launch, a setting, a claim going round, a way to save time or money), answered with checked facts; a tool is the \"how\" in the middle part, shown with its real recording (krypt_tools), never the hook. One idea a reel. Lines of 3-9 words, written to be heard; numbers only with a source.",
      "Every reel different: a new claim, new part names, a different room, sign, board title and diagrams. Keep the two characters and their colours the same within a series so the account is recognisable, and keep mixing in the account's other styles.",
      "Trading and prediction-market tools: no \"people make $X\" claim as the hook, no chart going up, P&L, wins or profit on the board; \"AI trades for you, easy\" in words, the check part says plainly that it can lose, disclaimer \"Not financial advice.\".",
      "Our own two characters, rooms and words only: never another channel's characters, mascot, set or lines, and the AI character keeps its own name (char_name), never the name or look of a real AI product.",
      "The end card's next step is something the account really does: a keyword to comment (\"Comment *TWEAK* for the steps\") only when the steps are in the caption or the pinned comment and the run answers those comments (the per-thread limit applies); otherwise \"Follow for *part two*\" or the tool's link. Never promise a DM.",
      "Post caption: the hook as two short sentences, one line on what the reel shows, the same next step as the end card, \"send this to the friend who...\", 4-5 niche hashtags. It is narrated by an AI voice: turn on TikTok's AI-generated label and Meta's AI info label.",
    ].join(' '),
  },
  {
    id: 'slides',
    label: 'slides',
    name: 'Slideshow',
    about: 'A post people swipe through: a cover that makes them stop, then one idea a slide (a tip, a step, a setting, a screenshot), and a last slide worth saving. Goes up as pictures on Instagram, TikTok, Threads, Facebook and X; Pinterest gets it as a short video with music.',
    preview: 'slides-tips',
    bestOn: 'Instagram, TikTok, Threads, Facebook, X',
    format: 'slides-tips',
    rules: [
      "create_reel preset slides (or format slides-tips / slides-steps): 5-8 slides, 10 at most. Slide 1 is the cover and does the whole job of a hook: a number or a claim the viewer wants proven (\"4 Windows settings to turn *off* today\"), 3-9 words, one *word* in the highlight colour. Then one idea a slide: a headline of 2-6 words and at most two short lines under it, big enough to read on a phone without zooming. The last slide is the payoff: the thing to save or send, or an end slide with the link.",
      "Show, don't list: every second or third slide is an image slide (a real screenshot of the setting, the menu, the result; \"@x,y x2\" zooms onto the part that matters) or a screen slide (one frame of a recording: record_screen or a Krypt tool's bundled one; look at it for private data first). Words-only slideshows read as filler. Vary look, font and align between posts so no two look stamped out.",
      "Photo slideshows (format slides-photo; the look most TikTok slideshows have): every slide a photo slide, a picture filling it with a few words written on it. Pictures: find_images searches Pinterest, save_images keeps the ones you pick (list_media kind images shows what is already saved). One look for the whole post (same mood, light and colours), upright pictures, none with words, logos, watermarks or a recognisable person. They are other people's pictures, so every slide is made ours: our own words on it plus at least one change (a crop after the path \"@x,y,w,h\", flip, warm / cool / bw, grain, dim), and never the same picture in two posts. Words in lowercase, 3-12 a slide, the way people type on TikTok; slide 1 is the hook; pos= keeps them off the busy part of the picture. Alternate photo slideshows with the designed ones.",
      "Study before writing: find_slideshows with \"@creator\" lists a creator's slideshows with their likes and saves, and with a post's link shows its slides (creators in the niche are found in the account's TikTok tab: search, Photos). Look at two or three that did well and take the shape that works (the hook's angle, how many slides, how many words, the look), then write ours from scratch: never a post's own sentences, never its slides. add_references keeps what you saw.",
      "Write the way people type: short, plain, no \"unlock\", \"game-changer\", \"here's why\", no emoji rows. Every fact, setting and menu path is real and checked (krypt_tools for Krypt tools; never a feature it does not list). The product, if any, is one slide near the end, never the cover.",
      "Trading and prediction-market tools: \"AI trades for you, easy\" in words only, never the bot's screens, a chart going up, P&L, wins or profit; a plain risk line (\"It can lose too.\") and disclaimer \"Not financial advice.\" (on every other slideshow the disclaimer field stays empty). Never \"open source\" or \"free to use\" for Krypto Bot or Krypto Mirror.",
      "Posting: preview_reel, then render_slides (shape portrait for Instagram, Threads, Facebook and X; vertical for TikTok) and look at every picture, then browser_attach_slides per platform and mark_posted with kind slides. X takes 4 pictures: more than that goes up there as the square video. Pinterest gets the video (render_reel; its music is made by the hub) or one slide as a 2:3 picture (render_image shape pin). TikTok only as a photo post: when its uploader takes only video on this account, leave TikTok out for that slideshow. YouTube never (both count a video of still slides as low-effort): post another style there. One slideshow counts as that platform's post for the run, with the same gap as a reel.",
      "Post caption: the cover line in other words, a reason to save or send it (\"save this for your next reinstall\"), 3-5 niche hashtags. Not every post: keep mixing in the account's video styles.",
    ].join(' '),
  },
];

/** How rough an account's meme-style videos may be (Styles page, save_account tone). */
export const TONES = ['clean', 'edgy', 'raw'] as const;
export type ToneId = (typeof TONES)[number];
export const TONE_LABEL: Record<ToneId, string> = { clean: 'Clean', edgy: 'Edgy', raw: 'Raw' };
export const TONE_ABOUT: Record<ToneId, string> = {
  clean: 'Nothing a parent would mind. No swearing.',
  edgy: 'Dark humour and mild swearing; strong words censored (f*ck).',
  raw: 'Swearing allowed, the way people talk. Still no slurs.',
};
/** The styles the tone applies to. */
export const TONE_STYLES = ['reddit', 'greentext', 'meme', 'dumb'];

// The user's own styles. They live in the hub's data (Db.customStyles); whoever loads or changes that data
// hands them over here, so every lookup below knows them too.
let custom: ChannelStyle[] = [];
export function setCustomStyles(list: CustomStyle[] | undefined): void {
  custom = (list ?? []).map((c) => {
    const b = STYLES.find((s) => s.id === c.base) ?? STYLES[0];
    const rules = b.id === 'main' ? c.rules : `${c.rules} It is built on the ${b.label} style: where this says nothing, make it the way that one is made (${b.rules})`;
    return { id: c.id, label: c.label, name: c.name, about: c.about, preview: b.preview, bestOn: b.bestOn, format: b.format, rules, custom: true, base: b.id };
  });
}
/** The built-in styles, then the user's own. */
export const allStyles = (): ChannelStyle[] => (custom.length ? [...STYLES, ...custom] : STYLES);

export const styleById = (id: string): ChannelStyle | undefined => {
  const k = id.trim().toLowerCase();
  return allStyles().find((s) => s.id === k || s.label === k || s.name.toLowerCase() === k) ?? (k === 'krypt' ? STYLES[0] : undefined);
};

/** The main style's name and label follow the brand (Krypt's is "Krypt"). */
export function styleName(s: ChannelStyle, brand: Pick<Brand, 'name'>): { name: string; label: string } {
  if (s.id !== 'main') return { name: s.name, label: s.label };
  if (isKryptBrand(brand)) return { name: 'Krypt', label: 'krypt' };
  return { name: brand.name.trim() ? `${brand.name.trim()} stories` : s.name, label: 'main' };
}

/** Every built-in style, main first. */
export const BUILT_IN = (): string[] => STYLES.map((s) => s.id);

/**
 * The styles an account runs, main first. Nothing saved = every built-in style: they all start on, and the user
 * switches off the ones they do not want (Styles page). Once they switch one, the account keeps its own list.
 */
export const stylesOf = (a: Pick<IgAccount, 'styles'>): string[] => (a.styles?.length ? a.styles : BUILT_IN());

/** A list of styles as saved: nothing when it is exactly the built-in ones (so a style added later starts on too). */
export function savedStyles(ids: string[]): string[] | undefined {
  const all = BUILT_IN();
  return ids.length === all.length && all.every((id) => ids.includes(id)) ? undefined : ids;
}

/**
 * Why an account cannot make a style that is switched on, or '' when it can. The run's plan leaves these out of the
 * rotation, and the Styles page says what is missing.
 */
export function styleNeeds(id: string, a: Pick<IgAccount, 'clipping'>, brand: Pick<Brand, 'name'>): string {
  const base = styleById(id)?.base ?? id;
  if (base === 'clipping' && !a.clipping?.sources?.length) return 'Pick streamers to clip first';
  if ((base === 'series' || base === 'versus') && !isKryptBrand(brand)) return "Only for Krypt's tools";
  return '';
}

/** Clean a list of style names/ids into ids; throws on an unknown one. */
export function cleanStyles(input: string[]): string[] {
  const out: string[] = [];
  for (const x of input) {
    const s = styleById(x);
    if (!s) throw new Error(`No style "${x}". Styles: ${allStyles().map((y) => y.label).join(', ')} (krypt = main).`);
    if (!out.includes(s.id)) out.push(s.id);
  }
  return out;
}

/**
 * The share of reels each of an account's styles gets, in percent, adding up to about 100. The user's own mix
 * when one is set (Styles page); otherwise the main style gets half and the others share the rest.
 */
export function styleMix(a: Pick<IgAccount, 'styles' | 'styleMix'>): Array<{ id: string; share: number }> {
  const ids = stylesOf(a);
  if (ids.length === 1) return [{ id: ids[0], share: 100 }];
  const own = a.styleMix ?? {};
  const set = ids.some((id) => Number(own[id]) > 0);
  // A style switched on after the mix was saved has no number yet: it gets the smallest share in the mix, so it is tried.
  const least = Math.min(...ids.map((id) => Number(own[id]) || 0).filter((n) => n > 0));
  const raw = ids.map((id, i) => (set ? (id in own ? Math.max(0, Number(own[id]) || 0) : least) : i === 0 ? ids.length - 1 : 1));
  const total = raw.reduce((n, x) => n + x, 0) || 1;
  // Whole percents, but never 0 for a style that has a share: with many styles on, each one's is small.
  return ids.map((id, i) => ({ id, share: raw[i] > 0 ? Math.max(1, Math.round((raw[i] / total) * 100)) : 0 }));
}

/** How many of the latest reels the rotation looks at: ten, or enough for every style in the mix to come up. */
export const mixWindow = (mix: Array<{ share: number }>): number => Math.max(10, mix.filter((m) => m.share > 0).length * 2);

/** The style the next reel should be in so the recent reels match the mix: the one furthest behind its share. */
export function nextStyle(mix: Array<{ id: string; share: number }>, recent: string[]): string {
  let best = mix[0].id;
  let gap = -Infinity;
  // `recent` is newest first. Between styles equally far behind, the one made longest ago goes first, so with many
  // styles on the turns go round instead of back to the top of the list.
  const age = (id: string): number => {
    const i = recent.indexOf(id);
    return i < 0 ? Infinity : i;
  };
  for (const m of mix) {
    if (m.share <= 0) continue;
    const g = (m.share / 100) * (recent.length + 1) - recent.filter((x) => x === m.id).length;
    if (g > gap + 1e-9 || (Math.abs(g - gap) <= 1e-9 && age(m.id) > age(best))) {
      gap = g;
      best = m.id;
    }
  }
  return best;
}

/**
 * A mix as saved: whole percents for the styles the account runs, scaled to 100. null when it says nothing (back to
 * the default). `whole` = the mix was just set (by the user or their AI): a style it leaves out gets 0. Otherwise it
 * is an older mix carried along while the styles changed: a style it never mentioned stays unmentioned (styleMix
 * gives those a small share), and styles no longer run drop out.
 */
export function cleanMix(input: Record<string, unknown>, ids: string[], whole = true): Record<string, number> | null {
  const keep = whole ? ids : ids.filter((id) => id in input);
  const raw = keep.map((id) => Math.max(0, Math.min(100, Number(input[id]) || 0)));
  const total = raw.reduce((n, x) => n + x, 0);
  if (ids.length < 2 || total <= 0) return null;
  return Object.fromEntries(keep.map((id, i) => [id, Math.round((raw[i] / total) * 100)]));
}
