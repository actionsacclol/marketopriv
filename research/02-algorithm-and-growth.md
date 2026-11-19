# How Reels get distributed, and how new accounts grow

Compiled 2026-10-30. Each claim is tagged by source quality:
- **[OFFICIAL]**: Instagram, @creators, Mosseri or Meta, directly or in verbatim trade-press quotes.
- **[DATA]**: a named third-party study.
- **[FOLKLORE]**: repeated everywhere, with no primary source found.

Meta's Transparency Center and the Help Center didn't load during research, so some official wording comes via Social Media Today, TechCrunch and Tubefilter.

## Ranking signals

- **Watch time, likes and sends are the top three** [OFFICIAL, Mosseri, Jan 2025]. Watch average watch time, likes per reach and sends per reach. Sends matter slightly more for **non-followers**, likes slightly more for followers. A new account lives on non-follower reach, so **sends (DM shares) are the metric to design for.**
- **New reels go to a small non-follower test audience first,** and spread "based on its engagement, not just the creator's follower count" [OFFICIAL, Feb 2025]. This is why a 73-follower account can get 5K views.
- **Skip rate is the share of viewers who skip in the first 3 seconds** [OFFICIAL, Insights since Aug 2025]. "The flatter the [retention] line, the more engaged your audience is." Use the retention chart to find the beat that loses people.
- **Originality** [OFFICIAL, Apr 30 2026]. Accounts that mostly repost become ineligible for recommendations.
  - Counts as original: unique text, creative edits, voiceover, commentary.
  - Does **not** count: speed changes, adding a watermark, or a screenshot of someone else's post, even with the username visible.
- **Logos and quality** [OFFICIAL]. Reels with other apps' watermarks (TikTok, CapCut) get recommended less. Our own logo is fine. Muted, blurry, low-res or bordered reels also get recommended less.
- **Length:** in 2024 Instagram said reels over 90s aren't recommended to non-followers, and the upload limit is now 3 minutes. **The current recommendation cutoff is unverified.** Stay under 90s.
- **Account Status** (Settings) shows whether the account can be recommended at all. Check it after the first ~10 posts.

**Folklore, not official:** "sends weigh 3–5x likes" (Mosseri said "slightly"), "3 seconds is a hard threshold", "golden hour", "post N reels to unlock reach".

## Hooks and retention for faceless text reels

There's no rigorous public study on text reels. These are practices built on the official metrics:

- The point must land within ~1.5s. The first frame can be a clean poster (see 01), but **never** a fade from black, a logo sting or an empty terminal.
- One idea per screen, at most ~8–10 words visible at once, each card held long enough to read once plus ~0.5s.
- Keep text out of the top bar and the bottom ~30%. Burn in captions for any voiceover, because most people watch with sound off.
- **Length:** default to 15–45s, and 45–55s for a story with real beats.
  - [DATA] Socialinsider (9.77M reels, Jan–Jun 2026) found the highest median views at 45–60s and the lowest under 30s. That's correlational, but it matches the reference accounts.
  - Short isn't better; empty is worse.
- Open a loop in the hook and pay it off in the last 20–30%, **before** any CTA.
- **Loop it:** make the last frame flow into the first. Avoid an end card that tells people to leave.
- For screen recordings, crop to the relevant area, zoom on the line that matters, speed up dead time and say so, and add one caption line saying what's happening.

## Formats for our niche (finance, trading and AI tools)

No niche-specific primary data exists. These are sorted by the confirmed mechanism: sends bring non-follower reach, saves keep it.

| Format | Main signal | Rule |
|---|---|---|
| "N free open-source tools for X" list | sends + saves | Name each repo on screen; "links in bio". |
| Repo / terminal demo | watch time, sends | First frame is the result, not the install. |
| Versus table | saves | Also post the best ones as carousels. |
| Big-number stat | sends | Number sourced on screen (source + date). No P&L. |
| Post / tweet card | shares | **Only our own posts**, or real commentary on someone else's. |
| "I gave an AI $X" | watch time | Honest log with losses, fees and drawdown. Paper first. Never imply typical results. |
| **Story / receipts** (the reference winners) | sends + saves | A real, fresh, specific event, told beat by beat with sources. |

**"Comment KEYWORD" CTAs** [OFFICIAL, Jun 2024]. Instagram clarified that using a DM tool to actually deliver a link is fine. Engagement bait whose goal is "simply maximize the quantity of engagements" is not. Rules:
- Use it once, at the end, and only when a real link gets sent.
- Never as the hook. Never "comment YES if you agree" or "tag a friend".
- Only use Meta-API tools (ManyChat and similar).
- Also say "link in bio".

There's no public data on whether keyword CTAs cut reach.

## Growing a new account

- **Profile:**
  - Professional account (needed for Trial Reels).
  - Name field with search terms ("Krypt | open-source trading bots").
  - One-line bio + "free, open source" + link.
  - Pin 3 explainer reels.
- **Cadence:** at least 3–5 reels a week; daily only if quality holds. [DATA] Buffer (2.1M posts, 2025) found 3–5 a week roughly doubled follower growth vs 1–2, with diminishing returns past ~10 a week. Correlational.
- **Trial Reels** [OFFICIAL, Dec 2024]: shown only to non-followers and kept off the grid. You get stats after 24h. Use them to A/B test **hooks**: same body, 2–3 different openings. Most useful once there are followers to avoid fatiguing.
- **First 20–30 reels are experiments.** Judge them on skip rate, average watch time and sends per reach, not followers. No credible source gives a "posts before traction" number.
- **Hashtags:** max 5 since Dec 2025 [OFFICIAL]. They help categorisation and search, not reach. Use 3–5 specific tags. Keywords in the caption and on-screen text matter more.
- **Collabs:** up to 5 co-authors; the reel shows to each co-author's followers. Partnering with open-source maintainers or dev/quant creators is the strongest legitimate shortcut.
- **Reels vs carousels:** [DATA] Metricool 2025 found median reach for accounts under 1K followers was 134 for Reels vs 56 for carousels. Aim for ~80% Reels, and turn the best tables into carousels for saves.
- **Risk:** Meta publishes no like/follow limits; every number out there is folklore. Mass liking, following or commenting, non-API automation and engagement pods risk action blocks on new accounts. No follow/unfollow. Don't repost the same reel across our accounts. See the warm-up ramp in `shared/warmup.ts`.
- **Direction of travel:** Mosseri's Dec 2025 memo predicts a shift to raw, verifiably real content as AI floods feeds. Real screen recordings of real tools fit that; generated slop doesn't.

## Finance compliance (short)

- Instagram's guidelines exclude "risk-free investments" and deceptive business models [OFFICIAL].
- The FTC has said disclaimers don't fix misleading earnings claims (WealthPress). **Don't make the claim at all:** no returns, win rates or P&L as hooks, no "passive income", no "guaranteed".
- Standing line in the caption and bio: educational, not financial advice, trading involves risk of loss, backtests aren't future results. Label paper trading and backtests on screen.
- Prediction markets: legal status varies by jurisdiction. Avoid "bet" framing and implied winnings. How organic recommendations treat them is unclear.

## Sources

- Mosseri on top signals, Jan 22 2025: https://www.socialmediatoday.com/news/instagram-shares-algorithm-2025/738034/
- @creators, reels ranking, Feb 26 2025: https://creators.instagram.com/blog/helping-creators-of-all-sizes-break-through
- @creators, recommendations eligibility (2022, upd. 2023): https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators
- Recommendation Guidelines: https://help.instagram.com/313829416281232
- Originality crackdown, Apr 30 2026: https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/ and https://tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator
- Own logo OK, Oct 2024: https://www.socialmediatoday.com/news/instagram-clarifies-including-your-own-logo-on-a-reel-is-ok/730852/
- Keyword CTAs, Jun 2024: https://www.socialmediatoday.com/news/instagram-certain-ctas-impact-post-reach/717732/ and https://www.socialmediatoday.com/news/instagram-clarifies-advice-single-word-ctas-longer-reels/718151/
- Skip rate and retention, Aug 2025: https://www.socialmediatoday.com/news/instagram-adds-retention-insights-reels/758464/
- Carousels, Oct 2024: https://www.socialmediatoday.com/news/ig-chief-recommends-posting-carousels-improve-reach/730232/
- 5-hashtag limit, Dec 2025: https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/
- Trial Reels, Dec 2024: https://techcrunch.com/2024/12/10/instagram-rolls-out-trial-reels-that-arent-shown-to-a-creators-followers
- Buffer posting frequency, Aug 2025: https://buffer.com/resources/how-often-to-post-on-instagram/
- Socialinsider reel length, 2026: https://socialinsider.io/blog/instagram-reels-length/
- Metricool content playbook 2025: https://metricool.com/press-release-instagram-content-playbook/
- Mosseri year-end memo, Jan 2026: https://betanews.com/2026/01/01/adam-mosseri-suggests-highlighting-real-media-rather-than-ai-content-on-social-media/
- FTC earnings claims / WealthPress: https://advertisinglaw.fkks.com/post/102i5aw/ftcs-action-on-earnings-claims-has-important-lessons-for-all-advertisers
