# Missing video styles: research (2026-11-21)

The owner asked "lets really think of anything missing" in our video styles. This report checks short-form formats that are working in 2025-2026 for faceless, AI-made or small accounts in tech, PC, AI tools, finance-adjacent and internet culture. It ranks the ones we don't have yet, best first. The 3D explainer is researched separately, so it is left out here.

## How this was checked

- **YouTube Shorts numbers are live.** I pulled them on 2026-11-21 from YouTube search and the Shorts pages: views, publish date, length and channel. Each claim below links the Short. View counts are as of that day.
- **TikTok and Instagram figures** come from our own 2026-11-20 research (docs/research/tiktok-2026-11-20.md and instagram-2026-11-20.md) and from articles. TikTok and Instagram pages could not be scraped directly.
- **How far the evidence goes.** View counts show that a format can travel. They don't show that it will for a new account. Many of the big examples are from established channels.
- **"Inferred"** marks anything I concluded without direct evidence: whether a channel shows a face, why a format works, how much work a build takes.
- **The baseline to beat.** Our current prediction-bot Shorts on YouTube ("Inside a Kalshi trading bot", "Inside a US Polymarket bot", Krypt Toolbench) had 75-134 views each on 2026-11-21.

**What the renderer can make:**
- Canvas beats: title, number, chart, flow, steps, card, poll, stamp, tier, chat, screen, post card, terminal.
- Presets: clip (with split layout), narrated (post card plus background footage), meme, and stickman.
- Footage and audio: record_screen, saved clips, ffmpeg, and one male ElevenLabs voice.

**Owner's rules applied to every candidate:**
- One male voice per reel.
- No profit claims for trading tools.
- Prediction bots are pitched as "AI trades for you, easy", and the bot's screens are never shown.
- Never call Krypto Bot or Mirror "open source" or "free to use".
- No copying a specific creator's series, characters or look.
- Short text that sounds human.

---

## Ranked: the formats we are missing

### 1. Numbered "one find a day" screen series (sites, Windows settings, free tools)  - Fit HIGH, effort LOW

**What it is:** a 8-35 s real screen recording of one thing: a useful website, a hidden Windows setting, or a free tool. The result is on screen in the first second, with a one-line benefit caption. It runs as a numbered series with the same title every time ("... part 214").

**Evidence:**
- **@lucaswebq (TikTok):** grew from 93K followers (Nov 2024) to 1.1M (Nov 2026) on 11-19 s website demos, about one a day. Samples got 0.3-2M plays. Source: our TikTok research.
- **@setupsaitony:** past part 838. Top recent videos had 24.4M and 22.2M views. Source: our Instagram research, CreatorDB.
- **Matty McTech:** [Powerful Websites You Should Know](https://www.youtube.com/shorts/MelGG-NZju0), 918K views, 35 s, Dec 2025.
- **Tech Bytes:** [part 170](https://www.youtube.com/shorts/9NMBkQ_MX68), 357K views, 9 s, Jan 2025.
- **The Windows-settings version:**
  - Zach's Tech Turf, [I'd Disable this One Windows Setting](https://www.youtube.com/shorts/14QnH138BaM): 1.41M views, Sep 2026.
  - META PCs, [New Gaming PC? Change These 4 Settings](https://www.youtube.com/shorts/iHRv5s9j1mA): 4.24M views, Jun 2026.
  - META PCs, [New Gaming PC Must-Have Apps](https://www.youtube.com/shorts/_qXJAsAaqu8): 9.12M views, Jan 2026.
  - Zack Shutt, [Free Tool That Fixes Windows Privacy](https://www.youtube.com/shorts/6w0gQ4oZivU): 2.42M views, Jul 2026.
  - Tech Wise, [Speed Up a Slow PC in 15 Seconds](https://www.youtube.com/shorts/mwfVqqSTI88): 11.4M views, 19 s, 2023.

**Why it works:**
- An instant payoff, saved for later.
- "What's the site?" comments.
- The numbered title builds habit, so people follow for the next part.

**Platforms:** TikTok, Shorts, Reels. Threads and X as a native clip.

**Topic fit:** the core of our PC / AI-tools niche. A Krypt tool can be one part in roughly five, so the account does not read as an ad.

**How the AI makes it:** record_screen of Chrome on a site, or of Windows Settings, then the clip preset (fit cover, stamps on the result, a short caption). An optional fast voice line.

**Overlap:**
- screen, speed and proof are about **our own apps**.
- top is a canvas countdown.
- This one is third-party and Windows content with a series identity.

**Cautions:**
- Pick our own series name. "Powerful Websites You Should Know" is setupspawn's original title, and the owner's no-copy rule applies.
- Never show a "paste this into PowerShell" step. Those videos spread password stealers and were removed (our TikTok research).
- Check every frame for private data.
- Our research saw broad "AI tools" lists flatten out (@aisavvy), so keep the angle narrow: Windows, PC and free tools.

### 2. Photo carousels / TikTok photo-mode slideshows  - Fit HIGH, effort MEDIUM-HIGH (posting, not rendering)

**What it is:** 5-10 swipeable images with music: a cheat sheet ("Windows settings to turn off"), a "free alternatives to paid apps" list, or a hook image with the tool on slide 2-3.

**Evidence:**
- **Instagram:**
  - Socialinsider 2025: carousels got the most views at every account size, including 1-5K followers (993 vs 580 for Reels).
  - Mosseri calls carousels "a deeper, richer format", and Instagram re-shows them to people who swiped past (our Instagram research).
- **TikTok:**
  - TikTok's own figures: 2.9x comments and 1.9x likes vs video ([Modern Retail](https://www.modernretail.co/technology/tiktok-is-pushing-brands-to-post-photos-instead-of-videos/), pre-2025).
  - [TTCalculator](https://ttcalculator.net/learn/tiktok-photo-carousel-engagement/): 15-35% more engagement under 100K followers. Their method is unverified.
  - @strongermobile: about 98% of its top posts are slideshows, and 11 of them passed 1M views (founder figures).
- **Pinterest:** static Pins and carousels get more outbound clicks than video (4.8 / 4.1 vs 1.6 per 1,000; our Pinterest research).
- **Against:** Buffer 2026 says video gets 77% more engagement. Photo posts don't earn TikTok Creator Rewards.

**Why it works:** saves and sends, swipe dwell time, and a cheap second format.

**Platforms:** Instagram, TikTok, Facebook, Threads, Pinterest.

**How the AI makes it:** the canvas renders the slides as PNGs, so rendering is easy. The work is the hub: it doesn't post photos yet (styles.ts: "photo slideshows are not posted by the hub yet"), and each platform needs its own upload flow.

**Overlap:** meme (posted as a video today).

**Note:** shared/goals.ts already asks for a weekly "top 5 free tools" photo carousel on Facebook. That can't happen until this exists.

### 3. Side-by-side race (split-screen test)  - Fit HIGH, effort MEDIUM

**What it is:** two real recordings stacked, doing the same task at the same moment, with a running timer or counter and a winner stamp. Examples:
- Chrome vs Edge RAM.
- Default vs tweaked startup.
- Windows Disk Cleanup vs Krypt Cleaner, space found.

**Evidence:**
- Tech Terminus, [Macbook vs Windows Laptop Boot Time Test](https://www.youtube.com/shorts/ymjv_ZemUrA): 5.30M views, 20 s, Jun 2026. Camera-filmed.
- Qntern AI, [Which Browser Uses the Most Memory?](https://www.youtube.com/shorts/vkr3Cg8DTtg): 176K views, 12 s, Jun 2025.
- Makhir, [Windows 11 is SLOWER than Windows XP!](https://www.youtube.com/shorts/TkjiRX5ezgE): 487K views, Jan 2026.
- [Windows XP vs 7 vs 8 vs 10 vs 11](https://www.youtube.com/shorts/wR9HiiFQyTw): 2.19M views, 14 s, Jul 2025.
- [SSD vs HDD Windows 11 boot test](https://www.youtube.com/shorts/GlRPze9CqKE): 675K views (older).

**Why it works (inferred):**
- Viewers pick a side in the first second and stay to see who wins.
- The loser's fans argue in the comments.
- Short and loopable.

**Platforms:** Shorts, TikTok, Reels, X.

**Topic fit:** Tweaker, Cleaner, Crosshair and Macro, plus neutral tests (browsers, settings) that build trust.

**How the AI makes it:**
- Two record_screen runs, or one window split in two.
- ffmpeg vstack, a timer overlay and stamps on the real numbers.
- The clip preset already has a split layout (fit split) that could be reused.
- Voice optional.

**Rules:**
- Same PC, same conditions, and numbers only as the screens show them.
- Not for the trading tools.

**Overlap:**
- proof is before then after, one after the other.
- versus is about price.
- The race shows both at once.

**Limit:** boot tests need a camera or a VM, so stick to tasks inside Windows.

### 4. Meme / trend origin explainer (numbered)  - Fit MEDIUM-HIGH, effort LOW-MEDIUM

**What it is:** "Where X really started". It explains a meme, slang word, trend or coin mascot in 15-50 s, with dates and the original post, as a numbered series.

**Evidence:**
- Fave Scope, [The Origins Of Meme Sounds #23](https://www.youtube.com/shorts/Lj5vn85c_iQ): 18.6M views, 48 s, Jul 2026.
- cardogjones, [The Origins Of Popular Memes](https://www.youtube.com/shorts/fZlUzxvPwK4): 12M views. Part #2 got 4.9M.
- cardogjones, [What Is Italian Brainrot?](https://www.youtube.com/shorts/bZBpMONeCrM): 1.24M views, 28 s, May 2025.
- Nimboot, [Where the "6 7" Meme REALLY Started](https://www.youtube.com/shorts/Ole6wQJNUaU): 5.57M views, 14 s, Aug 2025.
- Dum-E, [Origins of Memes explained #37](https://www.youtube.com/shorts/XSuTg2ClEco): 374K views, May 2026. #61 got 167K and #84 got 33K, so results vary a lot.

**Why it works:**
- A curiosity gap.
- People send it to a friend who uses the meme.
- Comments add more lore.
- The series number brings people back.

**Platforms:** Shorts, TikTok, Reels.

**Topic fit:**
- Internet culture directly.
- Crypto: memecoin mascots and origins (DOGE / Kabosu), real and sourced.
- PC culture: "download more RAM", "it's not a bug, it's a feature".

**How the AI makes it:** narrated, with pictures from the Memes folder, a canvas date stamp and timeline beats, and sources in the caption.

**Faceless?** Whether these channels show a face is inferred: Fave Scope and Dum-E look faceless, cardogjones shows his face.

**Cautions:**
- Use stills, not other people's clips or sounds (Content ID risk, inferred).
- Never mock a private person.

**Overlap:** myth (true / false verdict) and meme (jokes, no explaining).

### 5. Loophole / "how he actually did it" true story  - Fit MEDIUM-HIGH, effort LOW

**What it is:** a real, reported story of someone who found a clever gap in a system (a rule, a market, a program, a bug), told in beats with diagrams and sources.

**Evidence:**
- How Money Works (faceless documentary style; inferred from the format), [How This Man Used A Dumb Government Program to Make $3,000](https://www.youtube.com/shorts/yyJ4BbKSyUc): 2.99M views, 58 s.
- How Money Works, [How Insider Trading is Conducted "Legally"](https://www.youtube.com/shorts/v2j9Z8F-jLw): 225K views.
- The Spiffing Brit, [Polymarket Has A Design Flaw?](https://www.youtube.com/shorts/kjOXLcX5tHg): 1.92M views, 105 s, Apr 2026.
- Lectec, [These 'bikes' are a loophole](https://www.youtube.com/shorts/ePlBJvlfHjI): 5.66M views, Oct 2026.

**Why it works:**
- "Wait, that's allowed?"
- Shared with "look at this".
- Comments argue about whether it's fair.

**Platforms:** Shorts, Reels, TikTok, X, Facebook.

**Topic fit:** finance-adjacent and tech (prediction-market quirks, software bugs, pricing loopholes).

**Rules:**
- Real, sourced cases only.
- Never a how-to for anything illegal, and never "you can do this too".
- No profit framing anywhere near our trading tools.
- Don't copy the Spiffing Brit's catchphrase or look.

**How the AI makes it:** the story preset (flow, steps, chart, stamp), the one voice, and stock footage.

**Overlap:** **case** (scam autopsy) is the mirror image on the same engine. It could ship as a case variant ("loophole" mode) instead of a whole new style.

### 6. Odds on the news ("traders say 73%")  - Fit HIGH for prediction-market accounts, effort LOW-MEDIUM

**What it is:** a 7-20 s clip on a trending headline (sports, politics, tech), the live market odds on it as a bar or number, and one line on what would move it.

**Evidence (our TikTok research):**
- **@kalshi:** grew from 33.4K to 875K followers in a year with 7-17 s news and sports clips. One got 507K plays. That growth was helped by heavy ads.
- **@polymarketsports:** about 122K average views and 10.9% engagement, on clips with odds in the captions.
- **@polymarket:** 71K average views, with "Traders predict X%" captions.
- 60 Minutes, [What is Polymarket?](https://www.youtube.com/shorts/18p0tugu0LE): 406K views, Dec 2025.

**Why it works:**
- It rides search and trending topics.
- A number people disagree with gets comments.

**Platforms:** TikTok, X, Threads, Shorts.

**Fit:** gives PolyBot / Kalshi accounts daily content without ever showing the bot. The end line can be "an AI can trade markets like this for you". No profit, no "bet" or "free money".

**How the AI makes it:** read the public market (the PolyBot MCP get_market, or the Polymarket site), then a headline card, an odds bar and the voice.

**Cautions:**
- TikTok bans finance and crypto in branded content and removes get-rich content.
- Kalshi's TikTok push drew criticism from regulators. Keep it news, not promotion.

**Overlap:** the main style's "news" format (on-chain events) and quiz (chart cut off). This one is the prediction-market version.

### 7. Reply-to-comment video (an opener mode, not a whole style)  - Fit HIGH, effort LOW, evidence WEAK

**What it is:** the video opens on a real viewer comment as a card ("does this delete my files?"), then answers it in any style: tips, screen, speed.

**Evidence:**
- Only vendor claims that video replies lift reach ([Brand24](https://brand24.com/blog/how-to-respond-to-tiktok-comments), [Sprout](https://sproutsocial.com/insights/tiktok-comments/)). There is no measured study.
- YouTube examples are small: [Replying To Your Comments (Part 2)](https://www.youtube.com/shorts/MdM6QVgey7s), 22K views.

**Why it might work (inferred):**
- The commenter and others see their question answered, which invites more questions.
- Comments are the meter the owner judges by.

**How the AI makes it:**
- A "comment" card visual (like the Reddit post card) with the handle shortened or left off.
- Questions picked from our own posts' comments, which the hub already reads for the vote style.
- TikTok's native "reply with video" sticker is likely app-only (inferred), so render our own card.

**Overlap:** vote also reads comments. Ship it as a switch on every style.

### 8. Evolution / then-vs-now timeline  - Fit MEDIUM, effort MEDIUM

**What it is:** "Evolution of X, 1985-2026". One item per year, flashing past with a year counter. Or "then vs now" side by side.

**Evidence:**
- [Evolution of windows](https://www.youtube.com/shorts/tuwIVqRjLFE): 5.57M views, 14 s, Dec 2024.
- [Evolution of Windows Characters](https://www.youtube.com/shorts/u-PYlBWD6t0): 9.11M views, Aug 2026 (animated, personified).
- Rayly Retro, [Why did everyone do this in Windows XP?](https://www.youtube.com/shorts/aUAn4XWVGjE): 760K views, 10 s, Mar 2026.
- ["The old internet is gone, let it go."](https://www.youtube.com/shorts/LNJDufMmtVk): 6.52M views, 2024.
- [Evolution of Windows Error Sounds](https://www.youtube.com/shorts/QiUbGafjtGM): 5.5M views.

**Why it works:** nostalgia ("XP was the best" comments), it's short and loops, and it gets rewatched.

**Topic fit:**
- PC and internet culture.
- Crypto: logo history, or a coin's price story by year with real data.

**How the AI makes it:** a canvas timeline with a year counter and our own drawn take on each era.

**Cautions (inferred):**
- Real Windows screenshots, wallpapers and startup / error sounds belong to Microsoft. The sounds risk Content ID.
- Old Windows in a VM needs licences.
- So draw it ourselves rather than copy it.

**Overlap:** retro shares only the look.

---

## Next tier (real, but weaker fit, more work, or covered)

| # | Format | Evidence | Why lower | Overlap |
|---|---|---|---|---|
| 9 | **"What happens if..." PC experiment** in a VM (delete System32, run XP on new hardware) | mryeester [deleting system32](https://www.youtube.com/shorts/cFkcu8ZK0jA) 24.2M (2021); CarterPCs [Deleting system 32](https://www.youtube.com/shorts/KJD3gBJRBUo) 2.72M (2023) | Must never run on the user's real PC. Needs a throwaway VM / Windows Sandbox that the AI drives. Effort HIGH. The big hits are older | screen |
| 10 | **Ranking setups / things from photos** | RankZenith [Ranking The Craziest PC Setups Ever](https://www.youtube.com/shorts/6vj9geF-AJU) 32.2M (Aug 2025, 26 s); Ninye [Gaming setup tier list](https://www.youtube.com/shorts/jx0kF1RDHSw) 4.22M | Needs other people's photos (rights, and Meta/YouTube originality rules). Best as follower-submitted "rate your setup" with permission. Better as **photo items inside the tier style** | tier |
| 11 | **Personified objects** ("if PC parts could talk") | META PCs [What if PC Parts Could Talk??](https://www.youtube.com/shorts/cHuwy0CLI_U) 6.41M (live action, Jul 2026); Nexovix [If PC Components Were People](https://www.youtube.com/shorts/yoNUwQ-4S9s) 55K (animated) | Many characters clash with one voice per reel. Workable wordless with speech bubbles (stickman / mascot). The faceless animated version gets far fewer views | stickman (stick-versus), toy |
| 12 | **AI chat screen** ("I asked ChatGPT...") | [ChatGPT, Show Me an Apple](https://www.youtube.com/shorts/vy-5CeyOKkQ) 52.3M (2024) | The hits are mostly voice-mode or people on camera. Copying ChatGPT's interface is a brand risk. Better as a chat-style variant (our own "AI" chat look, narrator reads both sides) | chat |
| 13 | **Whiteboard / doodle explainer** | Mostly long-form; Brainy Byte [This is How Wi-Fi Signal Works](https://www.youtube.com/shorts/0uc3_k-j_aU) 2.68M (9 s, Sep 2026; the look isn't known) | The hand-drawn look is already covered by stickman | stickman |
| 14 | **"If you invested $1000" / money counters** | Infomapas Global [S&P 500 vs Gold since 1995](https://www.youtube.com/shorts/UaP9OuwxqDQ) 375K; Makeshift Project [How Much Elon Makes Every Second](https://www.youtube.com/shorts/NWwS8k3LSNs) 436K; most others under 20K | Close to profit framing (FOMO), especially for crypto. Main already draws charts | main, quiz |
| 15 | **Physics sims** (bouncing ball / marble race) | Peak 2023-24: satisfying.ba11s 67M and 38M, CodeCraftedPhysics 4.4M ([Know Your Meme](https://knowyourmeme.com/memes/will-the-ball-escape-ball-bouncing-brainrot)); 2025-26 country marble races about 1K each ([example](https://www.youtube.com/shorts/eRPBNspKlPM)) | Saturated, and hard to tie to our topics | none |
| 16 | **Map animations** | [Cryptocurrency Legal Status by Country](https://www.youtube.com/shorts/AZfLFybUcf4) 32K; Geo Map Animations 26.6K subs / 12.2M views ([OutlierKit](https://outlierkit.com/channel/geomapanimations)) | Weak fit, modest numbers | none |
| 17 | **Beat-synced setup edits** (phonk) | Mostly under 50K ([example](https://www.youtube.com/shorts/0akS2EJifrs) 49K); one outlier at 650K | Needs good footage we don't have | dumb, clipping |
| 18 | **Kinetic typography / unpopular-opinion takes** | "Unpopular opinion" PC / gaming Shorts: 0.4K-14K | Weak evidence | top, myth |
| 19 | **"Only 1% can solve" puzzles, app-icon quizzes, spot the fake website** | Search results mostly 1-22K, e.g. [Only 1% Can Solve This](https://www.youtube.com/shorts/nkgi2NwYBog) 22K, [app icon quiz](https://www.youtube.com/shorts/X7AXb-mRIZE) 4.4K; Quiz Alien 453K subs total ([NexLev](https://www.nexlev.io/youtube-stats/@quizalientv)) | Saturated and low. Evidence **against** a new style. A "which site is real?" round can live inside quiz | quiz, wyr |

**Left out, with the reason:**

| Format | Reason |
|---|---|
| Two-character AI podcast / interviews | Needs two voices, and the hits use cartoon IP ([AI Peter / Know Your Meme](https://knowyourmeme.com/memes/sites/ai_peter-ai-generated-family-guy)) |
| ASMR PC cleaning | Needs a camera (Salem Techsperts [dusty gaming PC](https://www.youtube.com/shorts/wP95tlktaGE) 6.7M is filmed) |
| Duet / stitch | Native app features, already in our TikTok plan |
| "Day N of..." | The series style covers it |
| Breaking-news card and tweet-screenshot commentary | The main style's news format and the post-card preset already exist |
| Countdown timers and "wait for it" | Effects inside other styles, not styles of their own |
| Satisfying 3D loops (Neilster [dice loop](https://www.youtube.com/shorts/SbI5EWTE4Uk) 143M) | 3D is out of scope, and off-niche |

---

## Suggested build order

1. **Screen series (#1)** first. Almost no new code, it has the strongest proof, and it fits every PC account.
2. **Reply-to-comment card (#7).** A small visual that works in every style and feeds the engagement meters.
3. **Split race (#3).** A clip-preset layout plus a timer overlay.
4. **Odds on the news (#6)** for prediction-market accounts, then **meme origins (#4)** and **loophole (#5)** as narrated story-preset styles (or a case variant).
5. **Carousels (#2).** The biggest job (a photo posting flow on each platform) but the strongest second format on Instagram and Pinterest.
6. **Evolution (#8)** once there is a timeline / year-counter beat.

## Sources

- **Live YouTube data:** pulled 2026-11-21 from YouTube search results and Shorts pages. Every Short is linked inline above.
- **Our earlier research:** docs/research/tiktok-2026-11-20.md (lucaswebq, setupspawn, kalshi / polymarket accounts, strongermobile, banned PowerShell videos), instagram-2026-11-20.md (setupsaitony, Socialinsider carousels), pinterest-2026-11-20.md (static vs video clicks).
- [Modern Retail: TikTok pushes photo posts](https://www.modernretail.co/technology/tiktok-is-pushing-brands-to-post-photos-instead-of-videos/)
- [TTCalculator: TikTok photo carousel engagement](https://ttcalculator.net/learn/tiktok-photo-carousel-engagement/)
- [Buffer: TikTok carousels](https://buffer.com/resources/tiktok-carousel/)
- [Know Your Meme: Will the Ball Escape?](https://knowyourmeme.com/memes/will-the-ball-escape-ball-bouncing-brainrot)
- [Know Your Meme: AI Peter](https://knowyourmeme.com/memes/sites/ai_peter-ai-generated-family-guy)
- [OutlierKit: Geo Map Animations](https://outlierkit.com/channel/geomapanimations)
- [NexLev: Quiz Alien](https://www.nexlev.io/youtube-stats/@quizalientv)
- [Brand24: TikTok comments](https://brand24.com/blog/how-to-respond-to-tiktok-comments)
- [Sprout Social: TikTok comments](https://sproutsocial.com/insights/tiktok-comments/)
- [AIR Media-Tech: 13 types of Shorts](https://air.io/en/youtube-hacks/13-types-of-shorts-that-always-go-viral-with-examples) (no examples or numbers given; read but not relied on)
