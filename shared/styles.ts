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
const BG_RULE = "Background: rotate the built-in ones (bg runner, bounce, slice) so reels in a row differ, or a video: list_media kind backgrounds lists the user's own (gameplay, parkour, soap cutting); set bg video, video = its path, bg_start somewhere random in it. A YouTube video the user gave for backgrounds: save_clip a part of it (up to 90 s; it loops) and use that file. Prefer footage without its own captions or big watermarks. Old public-domain films work too (find_archive kind film, then save_archive: it lands in the Footage folder; its credit line goes in the post caption).";
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
      "Source: a part of a clip (screen panels on fields.video: a saved stream clip, the user's own footage from the Memes folder via list_media, a screen recording), a picture from the Memes folder, an old public-domain film (find_archive kind film, save_archive; credit in the post caption), or the mascot (char panels). Captions in the voice of shitpost pages: \"bro thought...\", \"nah because why did he...\", \"the way he...\", lowercase, a few words.",
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
      "Make it look made, not empty: put the story in places (set=bedroom, office, street, door, kitchen, store, park, camp...), a new place every 1-3 lines, with weather when it fits (weather=night, rain, storm, snow), the figure walking in (enter=left) on a new place, and held things (torch, bottle, bag, key, money). figure cartoon (the default) is the polished look; captions box suits relatable skits. Places render as real 3D sets the flat figures stand in (world 3d, the default: the 2.5D look of the biggest stickman story channels), with the camera always gliding, so keep the frame busy too: every line gets an action the figure does on that word and a new framing (cam=close, cam=a/b, push) every line or two; every noun said gets something on screen (a prop, a place, a big word); and in about a quarter of the scenes a second or third figure reacts (\"talk/laugh/shock\" with labels for three). Narration with almost no pauses reads best (gap 0.08, the default).",
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
    id: 'ps2',
    label: 'ps2',
    name: 'PS2 cutscene',
    about: 'Our own low-poly 3D characters act out a relatable moment like a cutscene from an old console game: faceted faces, warm light, a hard cut to a new shot every line, blocky subtitles and a soft, slightly fuzzy picture.',
    preview: 'ps2-skit',
    bestOn: 'Reels, TikTok, Shorts',
    format: 'ps2-skit',
    rules: [
      "create_reel format ps2-skit (preset ps2), 15-35 s, a short scene between two or three people from our own cast (the cast field: jay, brad, mia, gus, kai, zoe, max, ava): a conversation everyone has had, told in short lines, one line a row, who=a/b/c on each. A new move on every line (talk, cross, smirk, drink, shrug, facepalm, laugh, shock...), props that fit (cup, glass, phone). Leave the shots to the hub (it cuts like a cutscene: two-shot, close-up, over the shoulder) and add shot=close or push only on the line that lands. The punchline is the last line or the one before it; a time jump with a top label (\"3 HOURS LATER\", \"2:14 AM\") in a new set is a good tag. Subtitles say exactly what is said, and the funniest version is the shortest.",
      "Voice: off by default (music under console subtitles is the look). When the user wants it voiced, one voice reads every line (one voice per reel), so keep it to lines that still work in one voice, or leave it voice-off.",
      "Keep a cast and a set per series (\"jay and brad\" at the cafe) so people come back for the characters. A product or tool comes in only as part of the joke (\"I closed one.\" after a Cleaner run), by name in a line, never the hook and never a pitch; scenes and characters are made up, anything said about a real tool or setting is true (krypt_tools for Krypt tools).",
      "Trading and prediction-market tools: never in a cutscene about money won, a chart or \"bet\"; at most \"AI trades for you, easy\" said once, a plain risk line (\"It can lose too.\") and disclaimer \"Not financial advice.\".",
      "Our own characters, sets and words only: never a real person, celebrity or creator, never a real game's characters, logo, map, menu or music, never another account's series name, catchphrase or captions line for line. No swearing or anything a brand would not post, whatever the account's tone.",
      "Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new situation and a new opening line each time, never the same first line twice, and keep mixing in the account's other styles. Post caption: the situation as a question (\"who is this in your friend group?\"), 3-5 hashtags (#relatable plus the niche).",
    ].join(' '),
  },
  {
    id: 'ink',
    label: 'ink',
    name: 'Ink cartoon',
    about: 'A true, strange story told fast by a narrator while our own caricature cast acts out every line, drawn like hand-inked cartoon cels: thin warm-brown pen lines, flat colours, big lumpy heads, plaid and stubble, a camera that never stops moving and a warm grainy print look.',
    preview: 'ink-story',
    bestOn: 'Shorts, Reels, TikTok',
    format: 'ink-story',
    rules: [
      "create_reel format ink-story (preset ink), 30-60 s (90 at most), narrated at about 3.5 words a second with almost no pauses (gap 0.05). Open in the middle of the worst or strangest moment, present tense, one line; then who it is, what they wanted, the turn, the twist, one closing line. Short sentences. Titles like \"He [did X] for [Y]\" or \"How [someone] [outcome]\".",
      "Every line is a shot: who it is about (who=), a move that acts it out (shock, anger, smug, grief, joy, dig, hold, phone, point...), a new move every line, and a prop for every thing the line names (drive, cash, coin, letter, phone, gavel...): never leave a noun as just a word. Change places with set= (it whip-pans), use solo on lines about one person, a top label for a time jump (\"2013\", \"3 YEARS LATER\"). Leave the shots to the hub (it cycles close, wide, insert and reaction and never holds one framing twice); shot=close on the closing line.",
      "True stories only, and every fact checked from a source (dates, amounts, what a court or company did); say \"reportedly\" or leave out what is not confirmed. The people in it are drawn as our own cast, never named or drawn as a real person's likeness; never the source creator's characters or words.",
      "Cast: pick builds that differ (one huge, one thin, one short) from our own cast (bubba, vince, dot, rico, gramps, lulu, tex, kev), and give a new story a new cast and places where it can. Colours: one palette per video (sunset, neon or rust).",
      "Money and crypto stories are fine as stories (a lost drive, a scam, a famous mistake), told straight: no profit claims, no \"you could have made\", no price calls, and \"Not financial advice.\" on the end. A Krypt tool comes in only where the story makes it the lesson, never as the hook.",
      "Voice: one voice reads the whole story (one voice per reel), the user's default voice. Every video different: a new story and a new first line each time, and keep mixing in the account's other styles.",
    ].join(' '),
  },  {
    id: 'pixel',
    label: 'pixel',
    name: 'Pixel Theater',
    about: 'A story played like a little 16-bit game: our own pixel cast acts every line, the words type out in a game text box, choices pop up as a menu and the last line types out alone on black.',
    preview: 'pixel-story',
    bestOn: 'Shorts, Reels, TikTok',
    format: 'pixel-story',
    rules: [
      'create_reel format pixel-story (preset pixel), 30-60 s, narrated at about 3 words a second (gap 0.1). Open on the strangest moment in one line; then who, when and what they wanted, the choice, what it cost or brought, and one quiet last line on black (end).',
      'Play it like a game: a new move every line (talk, think, shock, happy, sad, walk, run, jump, type, phone, fall...), a prop for every thing the line names (coin, cash, phone, letter, key, chest, chart, laptop, pizza...), the decision as a menu (choice=pay/wait: the first one is what they did), the HUD when money or chances move (coins=, hp=), a title card for a time jump ("YEARS LATER", "LEVEL 2", "GAME OVER"), set= to change places, a top label for dates.',
      'True stories checked from a source (dates, amounts), or a relatable everyday one told as a level; never a real game\'s characters, names, sprites, music or logos, and never a real person\'s likeness. Our own pixel cast only (pip, mo, ivy, zed, tok, lux), a new cast for a new story where it can.',
      'Money and crypto stories told straight: no profit claims, no "you could have", no price calls, "Not financial advice." on the end; a Krypt tool comes in only where the story makes it the lesson, never as the hook.',
      'Voice: one voice reads it all (the user\'s default). Every video different: a new story and a new first line each time, and keep mixing in the account\'s other styles.',
    ].join(' '),
  },  {
    id: 'hose',
    label: 'hose',
    name: 'Rubber hose',
    about: 'A true, strange story told like a 1930s ink-and-paint cartoon: our own bouncing bean-bodied cast with hose arms and white gloves on old black-and-white film, irises between places and art-deco title cards.',
    preview: 'hose-story',
    bestOn: 'Shorts, Reels, TikTok',
    format: 'hose-story',
    rules: [
      'create_reel format hose-story (preset hose), 30-60 s, narrated at about 3.3 words a second (gap 0.05). Open on the strangest moment, present tense; then where and when, the trick or mistake, a title card for the turn, what happened, one closing line (shot=close end).',
      'Every line is acted: who it is about (who=), a new move every line (talk, point, shock, laugh, sneak, run, sad, anger, whistle, shrug, fall...), a prop for every thing the line names (cash, bag, letter, paper, phone, key, safe, clock, bomb, pie...), set= for a new place (it irises), solo for lines about one person, a top sign for dates, title for "THE NEXT DAY" or "MEANWHILE".',
      'True stories checked from a source; history, cons, blunders and odd inventions suit it best; say "reportedly" where accounts differ. The people are our own cast (bert, mabel, gus, skip, otto, pearl), never named or drawn as a real person, and never an old studio\'s characters (no mouse, cat, sailor or cup characters from real cartoons). Film: mono most of the time, sepia or twostrip for variety.',
      'Money and crypto stories told straight: no profit claims, no price calls, "Not financial advice." on the end; a Krypt tool only where the story makes it the lesson, never as the hook.',
      'Voice: one voice reads it all (the user\'s default). Every video different: a new story and a new first line each time, and keep mixing in the account\'s other styles.',
    ].join(' '),
  },  {
    id: 'tv',
    label: 'tv',
    name: 'Retro TV',
    about: 'A calm true story or explainer played on an old CRT: our own glowing figures drawn in light on a dark screen, glowing line-art places, scanlines and bloom, static between channels and a switch-off at the end.',
    preview: 'tv-story',
    bestOn: 'Shorts, Reels, TikTok',
    format: 'tv-story',
    rules: [
      'create_reel format tv-story (preset tv), 30-60 s, narrated calmly at about 3 words a second (gap 0.1). Open on the strangest fact; then what and where, the problem, the fix or turn (a title like "SIGNAL BACK"), one calm closing line (end: the set switches off).',
      'Every line is acted by a glowing figure: who=, a new move every line (talk, point, think, type, phone, shock, sad, happy, wave, walk, run, shrug...), a prop for every thing the line names (laptop, chart, chart- for one going down, clock, phone, coin, letter, lock, bulb...), set= for a new place (static and a new channel), solo for lines about one person, a corner label for dates ("NOV 2023", "LIVE").',
      'Tech, space, internet history and how-things-work stories suit it best. True stories checked from a source; say "reportedly" where accounts differ. Our own glowing cast only (neo, vee, rex, ada, max, kai), never a real person\'s likeness and never a real TV show\'s characters, logos or idents. Screen: color most of the time, green or amber for variety.',
      'Money and crypto stories told straight: no profit claims, no price calls, "Not financial advice." on the end; a Krypt tool only where the story makes it the lesson, never as the hook.',
      'Voice: one voice reads it all (the user\'s default), calm and close. Every video different: a new story and a new first line each time, and keep mixing in the account\'s other styles.',
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
    id: "whatif",
    label: "whatif",
    name: "What if",
    about: "One impossible question answered step by step with real numbers: \"What if the Sun vanished?\" in bright, flat space scenes with a little astronaut, or \"What if you never slept?\" as a stick-figure cartoon at dusk. People stay to hear how it ends.",
    preview: "whatif-space",
    bestOn: "Shorts, TikTok, Reels",
    format: "whatif-space",
    rules: "Two looks, rotated. whatif-space (preset space, 25-40 s, narrated): a space or Earth-scale question (\"What if the Moon disappeared?\", \"What if Earth stopped spinning?\", \"What if you fell into a black hole?\"), a new scene every line or two (title, earth, sun, orbit, compare, number, clock, impact, blackhole, surface, astronaut), the big moment on its own line with cam=close, the last line a strange true fact that makes people rewatch or comment. stick-whatif (preset stickman, bg dusk, 25-45 s, narrated): an everyday-life question (\"What if you stayed awake for 24 hours?\", \"What if you only ate fast food for a month?\", \"What if you never used your phone again?\"), the figure living through it one scene a line, each scene in a place (set=bedroom, office, street, park...) with weather when it fits, a big word on each number, the props that fit (clock, zzz, phone, coffee, sign=...). Open on the question itself, 6-10 words, and answer it in order of time (\"After 8 minutes...\", \"Within a week...\", \"A year later...\"): the clock is what keeps people watching. Every number and fact is real and from a source you checked (NASA, a university, a health agency or a peer-reviewed paper); say \"about\" when a source rounds. When scientists do not know, say so. No made-up deaths, disasters or \"experts say\" without a name. A Krypt tool only when the question really is about it (\"What if your PC never restarted?\" for Cleaner or Tweaker): the last scene, by name, as the answer; never the hook. Most of these reels have no product at all: they grow the account. Those leave the logo, end card and disclaimer off (cta_seconds 0, disclaimer empty). Our own drawings and mascot only: never another channel's characters, art style copied scene for scene, intro or music; the look is flat and bright, the words are ours. Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new topic, a new opening line and new scenes each time, never the same first line twice, and keep mixing in the account's other styles. Narrated ones use a realistic AI voice: turn on TikTok's AI-generated label and Meta's AI info label when posting them. Post caption: the question, one line that dares a guess (\"guess what happens at minute 9\"), 3-5 hashtags (#space #science #whatif).",
  },
  {
    id: "survival",
    label: "survival",
    name: "Survival story",
    about: "A second-person survival series drawn as a stickman: \"You wake up. The power is out.\" A bar with the day, the time and a phone battery runs down, a rule card and a real survival fact land, and every part ends on a choice the comments vote on.",
    preview: "stick-survival",
    bestOn: "TikTok, Shorts, Reels",
    format: "stick-survival",
    rules: "create_reel format stick-survival (preset stickman), 25-40 s a part, narrated, told to the viewer in the second person (\"You wake up...\", \"You hear...\"). The hud field turns on the bar (\"Day 1;06:40;100%\"); flags day=, clock= and battery= move it on as the story goes (the battery only ever goes down unless the story charges it). One rule card a part (a prop rule=..., said out loud as a rule the viewer must follow), one fact card a part (a prop fact=..., a real survival fact from a source: the Red Cross, a government ready.gov-style guide, a wilderness manual), a new pose and prop every beat, cam=close on the twist. Put each scene in a place (set=bedroom, street, door, kitchen, store, forest, camp...) with weather that fits (weather=night, rain, storm, snow, fog), the figure walking in on a new place (enter=left), knock on a door scene, held things that matter to the story (torch, bottle, food, bag, key). Every part ends on a vote: the last beat has the prop vote=option A/option B, the line names both and ends \"Comment A or B.\" Pass vote: {series, part, a, b} to create_reel with style survival, so the hub tracks the series like the vote style: count the votes about 12 hours after posting (record_votes, each person once, never invented), and the next part opens with the result (\"Most of you said stay quiet.\"). 3-6 parts, then a finale. Keep it tense, not gory: no blood, no deaths shown, nothing a parent would mind; the danger is the clock, the battery and the choice. Made-up story, real facts. A Krypt tool only where the story really needs it (a VPN on hotel Wi-Fi, a cleaner on the only laptop that works) and never in part 1; most parts have no product: logo, end card and disclaimer off. Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new topic, a new opening line and new scenes each time, never the same first line twice, and keep mixing in the account's other styles. Narrated ones use a realistic AI voice: turn on TikTok's AI-generated label and Meta's AI info label when posting them. Post caption: \"Part N.\" plus the situation in one line, then \"Comment A or B. Most votes decides part N+1.\" and 3-5 hashtags.",
  },
  {
    id: "cutaway",
    label: "cutaway",
    name: "Backyard cutaway",
    about: "The ground under a house cut open like a cake in 3D: each line builds one thing (a pool, a basement, a bunker, a tunnel) and it stays, while a total of what it all costs climbs in the corner. People watch to see how far it goes.",
    preview: "cutaway-build",
    bestOn: "Shorts, TikTok, Reels",
    format: "cutaway-build",
    rules: "create_reel format cutaway-build (preset cutaway), 25-40 s, narrated, one build a line (pool, basement, well, pipe, cable, septic, tunnel, bunker, cave, tree, garden, water, house), each with a short tag and its real cost. A story with an escalation: \"You just bought a house with a big backyard.\" then builds that get bigger and stranger, the biggest on its own line with cam=close, the last line a question (\"Would you build this?\", \"Which one would you skip?\"). Another angle: the price of one dream backyard, or how deep things really go (a well, a mine, a bunker), with depths as tags. Every cost and depth is real and from a source you checked that day (a cost guide like HomeGuide, Angi or Fixr, a builder's price list, a government page), in one currency, said as \"about\" when the source gives a range; the total only adds what was said. No invented records or \"the deepest ever\". A Krypt tool almost never fits; leave the logo, end card and disclaimer off (cta_seconds 0, disclaimer empty) unless the reel is about one. Our own drawing and words: never another channel's intro, captions style copied line for line or music. Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new topic, a new opening line and new scenes each time, never the same first line twice, and keep mixing in the account's other styles. Narrated ones use a realistic AI voice: turn on TikTok's AI-generated label and Meta's AI info label when posting them. Post caption: the hook, \"which one would you build?\", 3-5 hashtags (#diy #home #backyard).",
  },
  {
    id: 'diorama',
    label: 'diorama',
    name: '3D diorama',
    about: 'A little 3D world on a floating block of ground, any scene (a yard, a city block, a farm, a desert, the moon...): each line adds pieces that stay, takes some away or makes something happen (a storm, a fire, a flood, years passing), with a tag on what changed and a number climbing in the corner.',
    preview: 'dio-grow',
    bestOn: 'Shorts, TikTok, Reels',
    format: 'dio-grow',
    rules: [
      'create_reel format dio-grow, dio-time, dio-disaster or dio-versus (preset diorama), 25-45 s, narrated. Pick the scene base (set) that fits the story: yard, park, farm, city, desert, beach, snow, forest, moon, studio (a clean stand for one object). Each line adds pieces that stay, takes some away (-car, -all) or makes something happen (mow, rain, snow, storm, fire, flood, drain, grow, clear, night, day, launch, quake, tornado, meteor, erupt, tsunami), so the little world changes every line. Buildings go up floor by floor, cars drive in, people wander; money is a pile that follows the counter; text=... puts words on signs, billboards and shop fronts; Blocks two puts two blocks one over the other (block=1 / block=2 lines) for before / after and us / them.',
      'Angles that suit it: how something grows (a company from a garage to a tower, a farm, a town, a launch site), what years do to a place (age=10, 100, 1000, 10000 with a YEAR counter and a title for each jump), what something costs as it fills up (counter total with real prices), weather and disasters, and what is under the ground (basement, bunker, tunnel, well... cut the front open). Use the tag (label) for the newest piece and a title with nothing new ("100 YEARS LATER"); cam=close on the piece the line is about (or on=<piece>), cam=low for something tall, cam=orbit for the big reveal, cam=wide to end.',
      'Every fact, price, date and number is real and from a source you checked that day; a made-up "you" story says so by being told to "you" and claims no records; time-passing stories say "could" and follow real estimates. Never draw or name a real company\'s logo or building as theirs, never a real person\'s likeness. A Krypt tool almost never fits; leave the logo, end card and disclaimer off (cta_seconds 0, disclaimer empty) unless the reel is about one.',
      'Our own drawing and words: never another channel\'s intro or captions copied line for line. Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new scene, a new opening line and new pieces each time, never the same first line twice, and keep mixing in the account\'s other styles. Narrated ones use a realistic AI voice: turn on TikTok\'s AI-generated label and Meta\'s AI info label when posting them. Post caption: the hook, a question, 3-5 hashtags.',
    ].join(' '),
  },
  {
    id: "lecture",
    label: "lecture",
    name: "Lecture",
    about: "A one-minute lesson: your character stands in the corner like a teacher while a board above builds the lesson, a title, steps, a number or a stamp landing on the exact word that names it. Saved by people who want to remember it.",
    preview: "lecture-reel",
    bestOn: "Reels, Shorts, TikTok",
    format: "lecture-reel",
    rules: "create_reel format lecture-reel (preset lecture), 40-60 s, narrated, one lesson a reel: a setting, a habit, a term, a mistake, a how-to people in the niche search for. The first line names the thing and why it matters in one breath; then what it is, why it happens, how to fix or use it, and the result. Each line puts one card on the board at the word that names it (at=word: the card lands as that word is said), a new card every one or two lines (title, steps, number, stamp, bars, card, a screen line with the real recording), clear to wipe the board between sections, act= for the teacher's gesture on a big moment. Menu paths, settings and numbers exactly as they are on a real machine today (record_screen or the tool's bundled recording when a step is shown); a Krypt tool is the \"how\" in the fix section when it really does it (krypt_tools), never the hook. A series name in the topic field (\"PC BASICS #4\") makes people follow for the next one. The last line is the end card: something to do next (\"Save this for your next fresh install\", \"Follow for *one fix a day*\"), never a promise the account does not keep. Trading and prediction-market tools: \"AI trades for you, easy\" in words only, never the bot's screens, a chart going up, P&L, wins, profit or \"bet\"; a plain risk line (\"It can lose too.\") and disclaimer \"Not financial advice.\". Every video different (platforms cut reach for whole accounts whose videos look mass-produced): a new topic, a new opening line and new scenes each time, never the same first line twice, and keep mixing in the account's other styles. Narrated ones use a realistic AI voice: turn on TikTok's AI-generated label and Meta's AI info label when posting them. Post caption: the lesson's name, the steps in one line when there are steps, \"save this\", 3-5 hashtags.",
  },
  {
    id: "uimotion",
    label: "uimotion",
    name: "UI motion",
    about: "One shape that keeps morphing through an app's screens, a button into a toggle into a search bar into a chart, with a cursor clicking each change on the beat. A satisfying loop that shows what the app does without a word.",
    preview: "ui-morph",
    bestOn: "X, Reels, TikTok",
    format: "ui-morph",
    rules: "create_reel format ui-morph (preset morph), 8-16 s, 8-12 states, no voice, music only (bed pulse at bpm 120, or phonk), loop on so the last state morphs back into the first. The states tell the app's story in order: the button that starts it, what you set (toggle, slider, input, search), what happens (loader, progress, notify, message), and the payoff (graph, panel, player, window with the real recording), ending on the logo or one word. Every text on the states is the app's real wording, short (1-3 words a state); numbers only as the app really shows them. A Krypt tool: its real feature names from krypt_tools, the logo state last. The post caption says what the app is in one line. Pick look light or dark to match the app, the accent from the brand colours; vary the order of states, the colours and the speed between reels so no two look the same. Trading and prediction-market tools: \"AI trades for you, easy\" in words only, never a chart going up, P&L, wins, profit or \"bet\"; a plain risk line (\"It can lose too.\") and disclaimer \"Not financial advice.\". Post caption: what it does in one line, the link, 2-4 hashtags (#uidesign #motiondesign plus the niche).",
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
/**
 * The built-in styles best first (the user, 2026-11-27: "move our best styles to the top and have styles be sorted by
 * what we think is best"). Our call, from what did well (screen recordings, voiced stories), proven viral formats
 * (cutaway worlds, stream clips, Reddit stories) and how good each looks. Only the order they are SHOWN in: an
 * account's saved list keeps its own order. The default mix follows the ranking (rankWeight).
 */
export const STYLE_RANK = ['diorama', 'screen', 'main', 'clipping', 'reddit', 'ink', 'stickman', 'ask', 'hose', 'proof', 'versus', 'top', 'cutaway', 'ps2', 'blox', 'meme', 'greentext', 'pov', 'slides', 'whatif', 'series', 'speed', 'survival', 'tv', 'pixel', 'lecture', 'uimotion', 'myth', 'wyr', 'quiz', 'tier', 'chat', 'tips', 'case', 'dumb', 'vote', 'retro', 'toy'];

/**
 * How much of the default mix a style gets, from its place in STYLE_RANK (the user, 2026-11-27, yes to "the top 5
 * styles get most of the reels and the rest rotate less"): the top 5 count 8, the next 5 count 3, the rest 1. A style
 * of the user's own counts 3. With every style on, the top 5 get about half the reels between them.
 */
export function rankWeight(id: string): number {
  const i = STYLE_RANK.indexOf(id);
  if (i < 0) return 3;
  return i < 5 ? 8 : i < 10 ? 3 : 1;
}

/** Any list of styles in STYLE_RANK order; styles it does not name (the user's own) keep their order after them. */
export function bestFirst<T extends { id: string }>(xs: T[]): T[] {
  const at = (id: string): number => {
    const i = STYLE_RANK.indexOf(id);
    return i < 0 ? STYLE_RANK.length : i;
  };
  return xs.map((x, i) => ({ x, i })).sort((a, b) => at(a.x.id) - at(b.x.id) || a.i - b.i).map((o) => o.x);
}

export const allStyles = (): ChannelStyle[] => (custom.length ? [...STYLES, ...custom] : STYLES);

/** Every style best first, for showing (the Styles page, the lists the AI reads). */
export const rankedStyles = (): ChannelStyle[] => bestFirst(allStyles());

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
    if (!s) throw new Error(`No style "${x}". Styles: ${rankedStyles().map((y) => y.label).join(', ')} (krypt = main).`);
    if (!out.includes(s.id)) out.push(s.id);
  }
  return out;
}

/**
 * The share of reels each of an account's styles gets, in percent, adding up to about 100. The user's own mix
 * when one is set (Styles page); otherwise the ranking decides (rankWeight): the best styles get the most.
 */
export function styleMix(a: Pick<IgAccount, 'styles' | 'styleMix'>): Array<{ id: string; share: number }> {
  const ids = stylesOf(a);
  if (ids.length === 1) return [{ id: ids[0], share: 100 }];
  const own = a.styleMix ?? {};
  const set = ids.some((id) => Number(own[id]) > 0);
  // A style switched on after the mix was saved has no number yet: it gets the smallest share in the mix, so it is tried.
  const least = Math.min(...ids.map((id) => Number(own[id]) || 0).filter((n) => n > 0));
  const raw = ids.map((id) => (set ? (id in own ? Math.max(0, Number(own[id]) || 0) : least) : rankWeight(id)));
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
