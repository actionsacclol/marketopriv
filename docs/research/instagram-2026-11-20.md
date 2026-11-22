# Instagram research (2026-11-20)

Raw reports from the research swarm, kept as written (model output with sources; check claims before quoting them). The rules the app actually uses are in shared/goals.ts.

---

## Instagram reach for small accounts: what Instagram itself says (as of 2026-11-20)

Confidence: **official** means Instagram, Meta or Mosseri's own words. **Several** means reported by several outlets. **Single** means one blog. Anything dated before 2025 is marked as possibly outdated.

### Ranked signals and rules

1. **Recommendation eligibility (the gate before any ranking).** Content flagged as non-recommendable is removed before Reels ranking even runs. A Reel can't reach non-followers if any of these apply:
   - the account is private
   - it has a watermark
   - it is low-resolution or blurry
   - it has borders, or text covers most of the screen
   - it is a re-upload of something already on Instagram, or is unoriginal or aggregated
   - it is longer than 3 minutes
   - it breaks the Recommendation Guidelines (violence, regulated goods, sexual content)
   - **Account-level:** repeated violations, or a profile photo or bio that breaks the guidelines, make the whole account ineligible for a time. Account Status shows this.
   - **Do:** export clean 9:16 HD with no watermark, borders or wall of text. Check Account Status before posting.
   - **Sources:** https://transparency.meta.com/features/explaining-ranking/ig-reels-chaining/ (updated 2025-11-11); https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators (2022, updated 2023, possibly outdated, but the same list appears in the 2023 Ranking Explained page). **Official.**

2. **Originality (account-wide, rolling 30 days).** Since 2026-04-30, accounts that mostly post unoriginal Reels, photos or carousels are not recommended to non-followers. Followers still see them.
   - Does not count as original: adding only a border, watermark, subtitles or a credit in the caption, changing the speed, or adding a screenshot of the original poster's name.
   - Counts as original: your own footage, your own design, or third-party material with new information, context or a point of view (your own text, graphics, voiceover, remix).
   - Eligibility comes back once a significant share of the last 30 days' posts are original. Instagram says 75% of US recommendations now come from original posts.
   - Since 2026-11-17, "content protection" lets eligible originals find matching reposts and hide them, which cuts their reach. Meta says it is "exploring" reach limits for repeated AI-generated copies of other people's videos.
   - Since 2026-08-31, AI-generated profiles without a label lose recommendation eligibility (per a creators-blog post cited by one tracker; I didn't open it).
   - **Sources:** https://creators.instagram.com/blog/rewarding-original-creators-on-instagram/ (2026-04-30); https://creators.instagram.com/blog/introducing-content-protection/ (2026-11-17). **Official.**

3. **The opening seconds (skip rate).** Meta's Reels model predicts "watch less than three seconds of a reel". Its inputs include 3-second view counts and skips within 2 seconds. Instagram's creator blog says to "hook in the first 3 seconds". Skip rate is now a metric in Insights and in the API (added 2025-12-03).
   - **Do:** put the payoff or tension in frame 1, with no logo or intro card.
   - **Sources:** transparency page above; https://creators.instagram.com/blog/helping-creators-of-all-sizes-break-through (2025-02-26). **Official.**

4. **Watch time and completion.** Mosseri names watch time as one of the top three signals (2025-01). Meta's models predict:
   - "watch more of a reel than 95% of users who watched reels of the same length", so length is normalised and short is not automatically better
   - Explore: watch over 95% or the full length
   - **Do:** cut dead air and make the Reel only as long as its payoff needs.
   - **Sources:** https://www.socialmediatoday.com/news/instagram-shares-algorithm-2025/738034/ (2025-01-22); https://transparency.meta.com/features/explaining-ranking/ig-explore/ (2026-06-22). **Official.**

5. **Sends (DM shares) per reach.** Mosseri: "sends are slightly more important for unconnected content" (non-followers), while likes are slightly more important for followers. In a 2026 interview he said sends per reach is "probably one of the most important metrics" for new creators. Meta's models also predict reshares and shares off Instagram.
   - **Do:** make Reels people send to a friend: relatable, useful, "this is you".
   - **Sources:** Social Media Today 2025-01-22 (official quote); https://uppbeat.io/blog/creator-news/whats-working-on-instagram-right-now-carousels-and-sends-says-adam-mosseri (2026-11-03). **Official quote, reported by several.**

6. **Likes per reach.** One of the top three signals, and weighted more for follower (connected) reach. **Official**, same January 2025 source.

7. **Follows from the Reel.** Both the Reels and Explore models predict "follow the author of a reel". One of the inputs is "followers gained through the reel".
   - **Do:** make Reels that make sense to strangers (Instagram's own advice), keep a consistent niche so the profile is worth following, and put a clear bio on the profile.
   - **Sources:** transparency pages above. **Official.**

8. **Comments, saves, "use audio", "Interested".** These are all predicted. The Explore model weighs saves. Audio reuse ("use audio", save audio) is predicted in both Reels and Explore. Meta does not publish the weights. **Official.**

9. **Staged distribution to strangers.** A Reel first goes to a small group of non-followers who are likely to enjoy it, then expands in waves if it performs. Instagram says this depends on engagement, not follower count, and that reach will be unpredictable.
   - Since Q3 2026, Reels ranks sequences of Reels (earnings call), not single Reels.
   - **Sources:** creators blog 2025-02-26 (**official**); the sequence ranking comes from the 2026-10-21 earnings call, cited by https://keywordseverywhere.com/news/instagram-algorithm-updates/ (**official source, reported second-hand**).

10. **Trial Reels.** A toggle shows the Reel to non-followers only. It stays off your grid and Reels tab, and followers don't see it in their feeds.
    - Metrics arrive after about 24 hours and are compared with your other trials.
    - Optional auto-share to followers if it does well on views in the first 72 hours.
    - Instagram says to use them for testing new topics, formats and editing styles.
    - "Available to everyone" since June 2025. Guides say you need a public account, about 200 followers on a professional account or 1,000 on a personal one, and recommendation eligibility (**single/several blogs, not verified**).
    - Instagram reports 80% of creators who posted more after trying trials saw more non-follower reach ("not guaranteed").
    - **Sources:** https://creators.instagram.com/blog/instagram-trial-reels (2024-12-10, possibly outdated); https://about.instagram.com/blog/announcements/inspiring-instagram-creativity (about mid-2025). **Official.**

11. **Length.** Reels up to 3 minutes can be recommended (since 2025-01-21). Longer ones show the alert "won't be recommended to new audiences".
    - Buffer found Reels of 180 seconds or more reached about 49% fewer people (data study, single).
    - **Source:** https://creators.instagram.com/blog/the-latest-with-instagram (2025-01-21). **Official.**

12. **Hashtags.** Capped at 5 per post (announced 2025-12-18). Mosseri says hashtags "don't work" for reach. They only label the topic.
    - **Do:** use 3 to 5 specific tags at most, and spend the effort on caption keywords.
    - **Source:** https://www.socialmediatoday.com/news/instagrams-implementing-new-limits-on-hashtag-use/808309/. **Official, reported by several.**

13. **Search and captions.** Search text is the main factor in Instagram search (Mosseri; reported by several, undated). Since about July 2025, public professional accounts' posts can be indexed by Google and Bing (several).
    - **Do:** put plain keywords in the caption, the first line of on-screen text, the name field and the bio.

14. **Carousels and other formats.**
    - Carousels with music can appear in the Reels tab and can resurface showing the second slide. Mosseri calls them "a deeper, richer format" (2026, official quote via one blog).
    - **Stories** are ranked for existing connections, not discovery (likelihood of a tap, like or reply; 2025 Mosseri video, several).
    - **Broadcast channels and Close Friends** are "underrated" for loyal followers, not for reach (2026, single).
    - **Collabs:** reported but not confirmed by an official source: a collab doesn't hurt reach, ranking follows the account that starts it, and the larger account should start it (several, 2024-2026).
    - **Edits app:** exports without a watermark (official, 2025-01-21).

15. **Posting frequency and timing.** Mosseri: posting more generally helps reach, but there is "no perfect number" and you shouldn't trade quality for volume. There is no official best time to post (several, 2025).

16. **User controls (new in 2026).** "Your Algorithm" lets viewers edit the topics they're recommended. It reached Reels on 2025-12-10, Explore on 2026-04-15 and Feed on 2026-06-10. Posts are labelled with the interest that led to them ("From Running").
    - **Implication:** a clear, consistent topic helps Instagram match your Reels to interest buckets.
    - **Source:** https://about.instagram.com/blog/announcements/reels-algorithm-control. **Official.**

17. **Authenticity direction.** In his 2026-01-01 year-end memo, Mosseri predicted raw, imperfect, clearly human content will gain ground as AI content floods feeds. This was not announced as a ranking change. **Official statement, reported by several.**

### Myths (contradicted or unsupported by official sources)
- **"Hashtags boost reach" / "use 30":** contradicted by Mosseri, and now capped at 5.
- **"Sends count 3-5x a like":** no published weight exists. Mosseri said "slightly more".
- **"Editing in CapCut or TikTok is penalised":** the editing app isn't the issue. The visible watermark is.
- **"Crediting the creator makes a repost OK":** officially it doesn't.
- **"Shadowbans":** the real mechanism is recommendation eligibility, shown in Account Status.
- **"A July 2026 skip-rate algorithm update," "Year of Raw Content algorithm," "original content gets 40-60% more reach," "watch-X-times thresholds":** none has an official source.
- **"Short Reels always win":** completion is compared against Reels of the same length, and up to 3 minutes is recommendable.
- **"Collabs split or hurt reach":** reported as false, though there is no official confirmation.
- **"There's a magic posting time":** no official guidance exists.

### Rules for an AI agent posting Reels for a small account
1. **Originals only.** Use your own footage, or third-party material you clearly change with new text, graphics or a voiceover that adds a point of view. Never re-upload, even with credit. Keep at least 80% of every 30-day window clearly original, because eligibility is judged account-wide.
2. **Clean export.** 9:16, 1080p, no watermark or logo from another app, no borders, no full-screen text walls, sound on, 3 minutes or shorter (aim for the shortest length that delivers the payoff). Never repost the same file.
3. **Payoff in frame 1, no intro.** Track skip rate and the retention chart, and change the opener when skip rate is high.
4. **Make each Reel sendable to strangers.** Every Reel should be understandable without context and have one "send this to X" angle. Judge Reels by sends per reach and follows per reach, not likes.
5. **Test with Trial Reels when eligible.** Run new hooks or formats as trials, turn on 72-hour auto-share, and compare only against other trials.
6. **Captions are keyword-first, with at most 5 specific hashtags.** Keep one consistent niche so "Your Algorithm" topic matching and profile follows line up.
7. **Check Account Status before each batch.** If anything shows "not eligible for recommendation", stop posting, fix the profile or remove the flagged post, then resume.
8. **Post steadily, quality first.** Keep a steady cadence with no fixed "best time". Use Stories and broadcast channels for existing followers, and carousels with audio as a second format. Collab with larger accounts only when they start the post.

Gaps I couldn't close: I didn't find the exact current Help Center eligibility text for Trial Reels (the follower minimums are from blogs). I also found no official 2025-2026 statement on how Collabs affect ranking.

---

## How a faceless, AI-run Instagram account can grow fastest (2025-2026)

**Main finding:** follower growth comes mostly from how many views turn into follows, more than from total reach. The measured rates for a faceless account vary by up to about 200 times:
- A trend Trial Reel with 1.4M views got 130 follows, about 0.09 per 1,000 views (Kapwing, 2025-10-07, https://www.kapwing.com/resources/instagram-trial-reels-study-what-we-learned-after-a-trial-reel-hit-1-million-views/).
- A faceless TikTok page got 33M views and 68.5K followers in about 90 days, about 2 per 1,000 views. It is self-reported (Skool, 2025-01, https://www.skool.com/content-academy/10k-and-70k-followers-with-faceless-content-in-90-days).
- A faceless page explaining why viral videos work got about 20 per 1,000 views over its life. One Reel got 615K views and 11.6K follows. It went from 0 to 15K followers in 30 days with about 20 posts and 2K followers in week one. This is Stan's own case study, so it is marketing (https://stan.store/blog/creator-strategies-case-study/).

So a narrow niche with real value plus a reason to come back beats chasing trends. Most sources below are vendor blogs or self-reports. I say so where it matters.

### Tactics ranked by expected follower gain (faceless, AI-run)

**1. Original, clearly transformed Reels in one narrow niche that people share.** This is the largest effect. Risk: safe, and the only route that keeps you eligible for recommendations.
- Instagram first shows each eligible Reel to a small group of non-followers, then widens the audience for the ones that do well. Its guidance: hook in the first 3 seconds, make each Reel make sense to a stranger, add audio, post regularly (Instagram for Creators, 2025-02-26, https://creators.instagram.com/blog/helping-creators-of-all-sizes-break-through).
- Mosseri's top three ranking signals are watch time, likes per reach and sends per reach. Sends (people DMing the Reel to a friend) weigh more for reaching non-followers (Jan 2025, https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/).
- Length: 45-60s Reels had the highest median views (10.4K) and engagement (0.35%). Under 30s got 4.7K. Over 3 minutes fell to 4.4K, apparently because they stop being recommended to non-followers (Socialinsider, 9.8M Reels, Jan-Jun 2026, https://socialinsider.io/blog/instagram-reels-length/).
- Originality rule:
  - Visible watermarks make a Reel ineligible for recommendations (https://creators.instagram.com/recommendations-and-originality).
  - Since 2026-04-30, accounts that mostly post others' content stop being recommended to non-followers, judged across the whole account. That now covers photos and carousels too.
  - Memes and clips are fine only with real added work: commentary, a new voiceover, humor, a creative edit. Changing the speed, adding a watermark, or screenshotting a post with credit does not count (TechCrunch, https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/).
  - **Re-uploading TikToks or raw memes gets an account restricted from recommendations.**

**2. Recurring series ("Part N") with a reason to follow.** High gain. Safe if the phrasing stays soft.
- One creator credits "follow along for part two" with about 800 follows on the day of posting. Her account grew from 654 followers a month to about 228K a month, with one scripted series episode per week. This is anecdotal, she admits the video was also an outlier, and she films herself on camera (https://sozai.app/transcript/100k-instagram-followers-in-4-days/).
- Instagram added a "Watch Part 2" link that chains Reels into a series (https://www.socialsamosa.com/topical-spot/instagram-new-engagement-tools-explained-9762802).
- Clickbait and engagement bait are not eligible for recommendations. Use "Part 2 drops tomorrow" in the closing seconds, and never "like/comment X to see part 2".
- No controlled data on follow CTAs exists. Hootsuite and Later have not tested one.

**3. Volume plus Trial Reels.** High gain. Safe.
- Buffer, 2.1M posts from 102K accounts (2025-08-13, https://buffer.com/library/how-often-to-post-on-instagram/). Weekly follower growth rose with posting volume, with diminishing returns:

| Posts per week | Weekly follower growth (vs. no-post weeks) | Reach per post (vs. 1-2/week) |
|---|---|---|
| 3-5 | +0.26% | +12% |
| 6-9 | +0.44% | +18% |
| 10+ | +0.66% | +24% |

- Metricool (700M posts, Jan-Jun 2025): about 19% growth at 2-3 posts a week versus about 79% at 10+ (https://metricool.com/press-release-instagram-content-playbook/). Both are correlations, not proof of cause.
- Trial Reels go to non-followers only. They became available to public accounts with 1,000+ followers in July 2025, with up to 20 a day (Kapwing). Use them to test hooks, then share the winners to followers.

**4. A profile that turns visits into follows.** Medium gain. Cheap and safe.
- Put the searchable keyword in the name field, for example "Polymarket Bots | AI Trading".
- Bio: one line saying what a follower gets and how often ("Daily AI trading bot breakdowns").
- Pin the 3 Reels with the best follow rate. Make the top 9 grid posts look like one series with numbered covers.
- Evidence is weak (vendor SEO advice, https://sproutsocial.com/insights/instagram-seo/). Public professional accounts became indexable by Google from 2025-07-10, which helps a little.

**5. Carousels with music, 2-3 a week.** Medium gain. Safe.
- Socialinsider 2025: carousels got the most views at every size, including 1-5K accounts (993 vs. 580 for Reels), and the highest engagement (0.55%) (https://www.socialinsider.io/blog/instagram-benchmark-study/).
- Metricool says Reels lead reach across all follower tiers, so the data conflicts. Both datasets are brand accounts.
- Instagram re-shows carousels to people who swiped past them.
- Use carousels for saves and sends (lists, cheat sheets) and Reels for discovery.

**6. Reply to every comment, plus comment-to-DM.** Medium gain. Safe.
- Replying to comments meant about 21% more engagement (Buffer, 700K posts from 68K accounts, 2026-01-28, https://buffer.com/resources/instagram-comments-engagement/).
- Comment-keyword-to-DM automation through Meta's official API (ManyChat) is allowed. It drives comments and DMs.

**7. Collabs with niche peers.** Medium gain. Safe.
- Very small brands' accepted collab posts got 5x the interactions of their normal posts (Emplifi, 2026, https://emplifi.io/resources/instagram-collaborations-boost-organic-engagement/).
- Later reports +34% engagement (secondhand).
- A collab started by the bigger account reaches further. Pitch accounts of similar size by DM.

**8. Useful comments early on big niche accounts.** Low to medium gain. Grey if repetitive or fast.
- There is no controlled data, only practitioner advice. A test on three accounts found most followers gained from commenting unfollowed quickly.
- Keep it to roughly 20-30 specific, human-sounding comments a day, spread out. Fast identical comments are what spam detection flags.

**9. Hashtags.** Minor. Safe. Maximum 5 per post since December 2025 (https://www.socialmediatoday.com/news/instagram-implements-new-limits-on-hashtag-use/808309/).

**10. Stories.** Close to zero for growth, because only followers see them. Use them to keep followers (polls, "new part up").

**11. Giveaways and shoutout-for-shoutout.** Low lasting gain. Grey.
- Giveaway followers churn. One measured case: after counting unfollows, cost per follower rose from about $0.06-0.09 to $0.16-0.23, and engagement dropped (https://www.socialmediaexaminer.com/do-sponsored-instagram-contests-really-work-case-study/).
- Shoutout swaps are allowed but bring followers who don't fit the niche.

**Gets restricted:**
- Follow/unfollow. The official cap is 7,500 accounts followed. Bulk unfollows are a classic bot signal and lead to action blocks lasting hours to weeks.
- Engagement pods.
- Bought followers or likes.
- Reposting without transformation.
- Note: Instagram's Terms bar automated account creation and automated data collection without permission, and its Community Guidelines bar artificially inflating likes and followers. An AI driving a browser should act at human pace and volume, and never mass-follow.

### Realistic numbers
- Typical brand accounts: 1-5K accounts grew 22% in all of 2025, down from 38% in 2024 (Socialinsider). The average brand grows 3.4% a month (Dash Social).
- Typical new faceless page: about 10K followers in 90-180 days (vendor estimate).
- Faceless page doing it well: 2-15K at 30 days, 20-70K at 90 days. Those figures are self-reported, at 2-20 follows per 1,000 views.
- Outlier: @pov_husband reached 2M followers in under a year (Instagram's own case study).
- Claims of 100K in 30-60 days come from course sellers. Treat them as unverified.

### Playbook for "mass growth" mode

**Before posting (days 1-3):** for about an hour a day, only watch niche content. Like or save 10-20 posts a day, no follows. Set up the keyword name field, the one-line bio and series-style covers.

**Daily:**
- 2 original Reels, 45-60s, at least 2 hours apart.
  - First 1.5s: on-screen text plus a voiceover hook.
  - Middle: payoff.
  - Last 3s: "Part X tomorrow" or "follow for the full series".
  - Caption: one keyword line plus 3-5 hashtags.
- Once at 1,000 followers: 2-5 Trial Reels testing hook variants. Promote any that beat the account's median views by 2x.
- Reply to every comment in the first 60 minutes. Comment-keyword-to-DM on one post a day.
- 15-30 specific comments on the top 10-20 accounts in the niche within about 30 minutes of their posts. 10-20 likes. Follow no one in bulk.
- 1-3 Stories pointing to the newest episode.

**Weekly:**
- 12-14 Reels plus 2-3 carousels with music (one shareable list or cheat sheet).
- 1 collab pitch or collab post.
- Repin the top 3 by follows per reach, not by views.
- Cut formats under 1 follow per 1,000 views. Double the ones above 5.
- Track 3-second hold (aim for 70%+), average watch percentage (aim for 50%+), sends per reach and follows per 1,000 views.
- Check Account Status weekly. If recommendations are switched off, stop anything borrowed for 30 days.

**Volume ceiling:** Buffer's returns still rise at 10+ posts a week. Past about 2 a day, quality and originality matter more than extra posts, especially under the account-wide originality rule.

---

## Instagram product promotion for a small account run by an AI agent (research as of 2026-11-20)

**How good the evidence is:** there is almost no independent conversion data. Most numbers come from vendors that sell DM automation, from Meta case studies about big brands, or from single anecdotes. Wherever a figure below is weak, I say so.

**Baseline expectation:** a Reel from an account under 5K followers gets about 300 views on average (Socialinsider 2025 benchmarks, 2023-24 data: https://www.socialinsider.io/data-geeks/instagram_benchmarks_2025.pdf). The only real software-tool funnel I found is Kapwing's viral Trial Reel (Oct 2025): 1.4M views led to 8.6K profile visits (0.6%), which led to 290 link taps (3.4% of visits, 0.02% of views) and 130 follows. Kapwing's own conclusion was that Trial Reels are for discovery, not conversion (https://www.kapwing.com/resources/instagram-trial-reels-study-what-we-learned-after-a-trial-reel-hit-1-million-views/). Plan for a few link taps per 1,000 views unless something closes the gap.

## Tactics ranked by expected customers

**1. Demo-first Reels with a "comment KEYWORD" CTA and the DM sent by an official tool**
- **Evidence:**
  - Vendors report comment-to-DM conversion anywhere from 2% to 37%, with no standard definition of "conversion" (Planoly roundup, 2026-10-23: https://www.planoly.com/blog/do-automated-instagram-dms-work).
  - Inrō, a vendor, looked at 798K conversations (2026). Putting the link in the 2nd message converted 42% vs 29% in the 1st. A first message under 120 characters converted 39% vs 22% for one over 320. One button converted 32% vs 2% for three buttons.
  - Kidnest: one "Comment SELF" post got 2,000 comments and 100 sales (https://www.inro.social/case-studies/how-kidnest-turned-one-instagram-post-into-100-direct-sales).
  - Claims that keyword DMs beat "link in bio" 4-6x are vendor numbers only.
  - Instagram said in 2024 that single-word comment CTAs and tools like ManyChat are not engagement bait when used to sell or generate leads (https://www.socialmediatoday.com/news/instagram-clarifies-advice-single-word-ctas-longer-reels/718151/, 2024-06-05).
- **Rules that apply to the official route (Meta API):**
  - One private reply per comment, sent within 7 days.
  - No follow-up unless the person answers. Their answer opens a 24h window, and promotional messages are allowed inside it.
  - The reply goes to Message Requests if the person doesn't follow you (https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies; policy: https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy).
- **By hand vs official tool:** this matters.
  - Instagram's Terms ban "collecting information in an automated way without our express permission" (https://help.instagram.com/581066165581870).
  - Meta's spam policy covers posting or engaging at high volume "whether done manually or by automation," and lower volumes too when content is repetitive (https://transparency.meta.com/policies/community-standards/spam/).
  - A non-follower can get only one DM from you until they accept it, and links in such DMs reportedly get filtered more often (vendor claim).
  - So an agent typing the same link DM to every commenter through a browser is the riskiest version of this. Send the keyword DM through Meta Business Suite's comment-to-message automation (free, per vendor guides; I could not confirm it on Meta's own pages) or through ManyChat. Let the agent handle only the follow-up conversation.
- **Risk:** medium if done through the official route, high if done by browser at volume.

**2. Treat the profile as a landing page** (multiplies the effect of #1)
- **Evidence:** reported profile-visit-to-bio-link-tap rates are 0.5-4% (vendor ranges, weak). Kapwing's was 3.4%. Once someone reaches a Linktree page, about 83% of Instagram visitors click out (Linktree, 2026-05-13: https://linktr.ee/blog/not-all-clicks-are-equal-a-year-of-linktree-traffic-by-source). Up to 5 bio links are allowed.
- **Setup:**
  - Bio: one line on what the tool does, plus "free" and "Windows" if they apply. Then a keyword line ("comment TWEAK on any reel").
  - Bio link: your own domain with a per-channel tracking path, for example /ig.
  - Pinned Reels: the best demo, a before/after, and proof (a user count or a reply screenshot).
  - Highlights: Demo, FAQ/Safe?, Reviews, How to install.
- **On "bio link on a new account causes restrictions":** I found no official source. It is anecdotal, apart from Meta's general rule that spam signals add up on new accounts. Adding the link after a warm-up is cheap caution, but it is not proven.
- **Risk:** low.

**3. Stories to followers with a link sticker**
- **Evidence:** weak. About 1-5% of Story viewers tap the sticker, with no primary benchmark (https://creatorflow.so/blog/instagram-story-link-sticker/).
- **Use:** these are the warmest viewers. Post the Reel to Stories, then a poll, then the link-sticker frame.
- **Risk:** low.

**4. Collab posts with niche creators** (Windows tweaks, PC gaming, AI tools)
- **Evidence:**
  - Emplifi, a vendor (H1 2026): accepted collab posts from extra-small brands got 5x the interactions of their normal posts (https://emplifi.io/resources/instagram-collaborations-boost-organic-engagement/).
  - A study of 100 collab posts found reach behaves like a weighted average of the two accounts, not their sum. Reach is bigger when the larger account starts the post.
  - Creator demos converted better than graphic ads for one app (vendor claim).
- **Rules:** paid or gifted posts need the Paid partnership label (https://help.instagram.com/1109894795810258). Promoting your own product does not.
- **Risk:** low. The bottleneck is outreach, which needs a human.

**5. Trial Reels to test hooks**
- **Evidence:** weak. Instagram says 80% of creators who used them saw more non-follower reach. Kapwing's product-focused Trial Reel lost to its regular version. Use them for reach and hook tests, not for the CTA Reels.

**6. Fast, human-sounding replies to comments and DMs**
- **Evidence:** 73% of consumers expect a reply within 24h (Sprout Social 2025, via Planoly). Sends per reach and watch time are the top ranking signals (Mosseri, Jan 2025: https://www.socialmediatoday.com/news/instagram-shares-algorithm-2025/738034/).
- **Risk:** browser automation itself, so keep volume low and the text varied.

**7. Broadcast channel**
- **Evidence:** for keeping existing followers, not finding new ones. The "10x" claims have no source.
- **Use:** worth starting once you have a few hundred followers, for release and update posts.

**8. Giveaways**
- **Evidence:** I found no reach or conversion data. A free product makes a poor prize. If you run one, offer a Pro or early-access licence.
- **Rules:** Instagram's promotion rules require a full release of Instagram and a statement that Instagram doesn't run the promotion.
- **Risk:** reach-only entrants who never install.

**Hard constraints:**
- Links in captions and comments are not clickable. Meta Verified users are testing 10 caption links a month (Mar 2026).
- Maximum 5 hashtags per post (Dec 2025).
- Watermarked or reposted content can't be recommended. Check Account Status (https://creators.instagram.com/recommendations-and-originality).
- Meta has tested limits on link posts for unverified Facebook accounts (Dec 2025). That is Facebook only.

## Content that sells
I found no data comparing formats for app installs. Meta's case studies show Reels lifting installs (Webull: +50% installs and registrations, ads only) but don't split by format. The best-supported pattern:
- **Problem, then the result on screen in the first 1-2 seconds, then a 10-30s screen demo.** This serves watch time, and these posts get sent to friends.
- **Before/after** (FPS, RAM, startup time, a cluttered desktop vs a clean one) for proof.
- **"Tool I wish I knew" or a comparison** for sends.
- **Founder or behind-the-scenes posts** occasionally, for trust.
- **Testimonials and reply screenshots** once real ones exist. Never fake them.

Pure viral stunts brought views but "terrible" conversion in one indie app case. The mix ratio (80/20, 40/40/20) is a rule of thumb with no data behind it.

## "Push product" playbook

**The funnel:**
1. **Reel:** show the result in second 1, then demo. On-screen text and caption say "comment TWEAK and I'll send it". Pin a comment saying the same, plus "or link in bio".
2. **Keyword DM through the official tool:** a first message under 120 characters with one question or button ("want the Windows link?"). The link goes in the 2nd message, a page with a /igdm tracking path.
3. **Download.**
4. **Agent follow-up:** answer questions within the 24h window, at most 2 messages per thread.
5. **Backups:** the bio link (/ig) and the Story link sticker (/igs).

**Daily:**
- 1-2 Reels spaced out.
- Mix: about 50% problem-to-demo with a soft CTA, 30% reach posts (tips, trends, Trial Reels) with no CTA, 20% hard keyword CTA.
- 3-5 Stories: Reel share, poll, link sticker.
- Reply to comments in the first hour.
- No copy-paste comments or DMs.

**Weekly:**
- Send 2-3 collab pitches and post 1 collab when one lands.
- Swap the pinned Reels for the top converters.
- Refresh the Highlights.
- 1-2 Broadcast posts once there are enough followers.
- Rotate keywords per tool.

**Measure per Reel:** views, sends per reach, profile visits, external link taps, keyword comments, DMs that reply, and installs per tracking path. Compare against your own baseline, not vendor benchmarks.

**Main risks for an AI agent:**
- Repetitive DMs or comments sent through the browser (Terms and spam policy).
- Link DMs to non-followers.
- Adding a bio link early on a new or restricted account (anecdotal).
- Unlabelled paid collabs.

---

## Research report: fast-growing faceless tech, AI-tool and prediction-market accounts (as of 2026-11-20)

**How reliable the numbers are:** Follower counts come from CreatorDB snapshots (Sep to Nov 2026). Its tables come from public profiles, but its FAQ text is AI-written, and its 90-day and 365-day figures often match, which looks like a data bug. Treat every count as an estimate. Instagram, TikTok and imginn would not load for me, so I could not quote the top-post captions of the big AI pages. The hooks I quote are from TikTok video titles, Bored Panda, and press about the fake-win campaigns.

### Accounts

1. **@setupspawn** (websites and PC tips; TikTok, Instagram, YouTube). Unverified CreatorDB estimate: about 10.3M across platforms, 1.5M on YouTube, 3.7% engagement. It started as an Instagram setups page in 2016 and switched to short videos showing one site at a time, which it says were "immediately well received." By 2023 it had 200+ videos. Sample hooks: "If you go to this website…", "Did you know if you go to this website…", "So everyone knows about amazon.com, but…". Each video demos the site live and ends on the result. I found no stated monetization.
   https://2.boredpanda.com/powerful-websites-people-should-know-setupspawn · https://creatordb.app/creatorstats/setupspawn/
2. **@setupsaitony** (websites and AI tools). Estimate: Instagram 3.72M, TikTok 1.8M, YouTube 553K. It runs a numbered series, "Powerful Websites You Should Know," now past part 838, posting about 6.5 times a week on each platform. Its top recent videos had 24.4M and 22.2M views. The series name matches setupspawn, so it may be a sister account (unconfirmed).
   https://creatordb.app/creatorstats/setupsaitony/
3. **@evolving.ai** (AI news and AI-made clips; Netherlands). About 4.83 to 4.89M Instagram followers, roughly +149K in 90 days. Posts about 38 times a week, 3.5% engagement. It has had paid deals with Higgsfield AI.
   https://creatordb.app/creatorstats/evolvingai/
4. **@chatgptricks** (AI news and prompt tips). About 2.74M Instagram followers, +98K in 90 days. Posts about 22 times a week, but engagement is low (0.9%). Its bio offers a "ChatGPT Playbook" lead magnet.
   https://creatordb.app/creatorstats/chatgptricks/
5. **@gptprompts.ai** (AI prompts and tools). The fastest grower I found: about 861K, up 33% in 90 days. Posts about 30 times a week and sells a 1,000+ prompt bundle through its bio link.
   https://creatordb.app/creatorstats/gptpromptsai/
6. **@power.ai** (rapid AI-tool roundups). About 812K on Instagram and 121K on TikTok, posting about 18 times a week. Top video had 2.9M views. Its bio links to a directory of 5,000+ AI tools, and it has done deals with Higgsfield, Lovable and Pippit.
   https://creatordb.app/creatorstats/power.ai
7. **@ninjaaitools** (lists of about 8 AI tools or sites). About 436K on Instagram, posting about 5 times a week. Each video points to a numbered page on its own site, and the bio offers a free "Top 100 AI Tools" list.
   https://creatordb.app/creatorstats/ninjaaitools/
8. **@tech_wizzdom** (AI tools, "second brain"). About 536K on Instagram and 240K on TikTok, 3.6% engagement.
   https://creatordb.app/creatorstats/tech_wizzdom/
9. **@godofprompt** (prompts). About 351K on Instagram, but growth has stalled (+0.1% in 30 days). It funnels people to godofprompt.ai. I list it as a warning: a prompts-only page plateaus.
   https://creatordb.app/creatorstats/godofprompt/
10. **@ai.innovator** (faceless AI page). About 314K, +8% in 30 days, but it has had no upload for about 6 months. Its bio claims "$100K from one faceless page" (unverified), so the page itself sells the faceless-page dream.
    https://creatordb.app/creatorstats/ai.innovator
11. **Small TikTok Windows-trick accounts** (follower counts unknown). Titles show the hook style:
    - @mysecrethacks, "Create invisible folder on Windows with this hidden trick!" (60.7K likes)
    - @cubesetups, "Check What Anyone Opened on Your PC 🤯 This Hidden Windows Trick…" (30.9K likes)
    - @derjotech, "Secret Way To Hide Windows Activation Watermark" (19K likes)
    - @thetechieguy, "Use THIS Hidden Windows Tool You Didn't Know About 👀"

    https://www.tiktok.com/@cubesetups/video/7669029690979503382 · https://www.tiktok.com/@mysecrethacks/video/7167348693295828225
12. **FR33THY** (Windows and FPS optimization; mainly YouTube). Long "Ultimate Windows Optimization Guide" videos plus a GitHub repo where every change can be reverted. Sponsor and affiliate links (Windows keys, a PC service) sit in the description. Around this niche, many TikTok tweak sellers sell $3 to $75 "FPS packs" on Payhip, with unverified FPS claims.
    https://github.com/fr33thytweaks/Ultimate-Windows-Optimization-Guide · https://payhip.com/LoopTweaks
13. **Prediction markets: I found no legitimate faceless page that grew organically.** What exists:
    - **Polymarket's paid campaign.** The WSJ reviewed 1,105 videos from 10 creators (Dec 2025 to May 2026), totalling 140M+ views. About 70% showed fake bets placed on clone sites such as "poiymarket.com." Scripted reactions included "free money," "BRO, WHAT?" and "Am I missing something?" Creators were paid $2–3K a month, often without disclosure. The CFTC is reportedly investigating, and senators have asked it to.
    - **Kalshi.** Ads called it a "money hack." One undisclosed student TikTok passed 50M views, and Kalshi has reportedly been referred to the FTC over its disclosures.
    - **"AI trading bot" posts on X.** Example: "A 19-year-old student built a trading bot with Claude Code in 2 days, first night: $6,732 profit." That exact post went out 14 times from 7 accounts. A separate Grok-bot video got a Community Note saying its dashboard was fake.

    https://techstartups.com/2026/07/03/polymarket-paid-influencers-to-fake-winning-bets-in-140-million-view-marketing-campaign-wsj-investigation-finds/ · https://www.mediamatters.org/tiktok/kalshi-aggressively-advertising-tiktok-seemingly-targeting-young-people-while-promising · https://creatormagic.ai/blog/do-ai-trading-bots-work/ · https://dev.to/__747bb5a1521/the-ai-quant-bot-mirage-inside-the-polymarket-copytrade-scam-network-flooding-crypto-twitter-1856

### Patterns that repeat across the winners

1. **One item per video, demoed live.** One website, tool or trick, shown on screen and ending on the payoff (a screen recording plus voiceover or text). An AI-run account can copy this directly.
2. **Numbered series.** "Part 838" trains viewers to come back and lets the account post daily without new ideas. Copyable.
3. **Very high volume on Instagram.** The big AI pages post 18 to 38 times a week; setupspawn-style pages about 6 to 7. Growth tracks volume more than polish.
4. **"Hidden / secret / didn't know" wording** and a promise of something forbidden-feeling ("see what anyone opened on your PC"). Use with care.
5. **Turn familiar into new:** "Everyone knows X, but…", or "stop paying for X" against a free alternative.
6. **One hub link.** A directory, numbered link pages, or a free "Top 100" list behind the bio link. The free item is the lead magnet; the product (prompt pack, sponsor) comes after.
7. **Sponsorship is the main money for big AI pages** (AI video tools such as Higgsfield, Lovable and Pippit), not their own products.
8. **Built for sharing.** Mosseri lists watch time, likes per reach and sends per reach as the main ranking signals. "Send this to your friend who games" fits utility content well.
https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/
9. **Short and readable with the sound off.** Most guides say 15–60 seconds with on-screen text. This is practitioner advice; I found no real study of top tech Reels.
10. **Prompt-only and news-only pages stall** (godofprompt flat, chatgptricks at 0.9% engagement). Demos of things people can actually use hold up better.
11. **Prediction-market virality so far has been fake wins and "easy money,"** and it now draws regulator and platform attention. Copying it is a ban and legal risk.

### 10 hook lines (no profit promises)

These are kept short and loose to match the human-sounding-text rule. I left out "open source" and "free to use" (the reel-content-direction rule).

1. "your PC has a setting that's eating FPS. here's where"
2. "everyone uses Task Manager. almost nobody opens this tab"
3. "stop paying for a PC cleaner. this does the same thing"
4. "3 tools I install on every gaming PC"
5. "Windows has been hiding this from you since 2015"
6. "send this to the friend whose games stutter"
7. "part 12 of tools you'll wish you found sooner"
8. "this AI places Polymarket trades for you. here's what it actually does"
9. "no fake wins here. here's how an AI trading bot works, step by step"
10. "an AI trading bot that shows every trade. wins and losses"

**Caveat for hooks 8–10:** they show the bot's process. The reel-content-direction memory says prediction-bot reels should pitch "AI trades for you, easy" and never show the visuals. If that rule covers bot screens or trade logs, rework 8–10 into the "AI trades for you, easy" framing before using them. Never use dollar results, P&L screenshots or "free money" reactions. That is exactly what got Polymarket and Kalshi investigated.

---

## Instagram automation: safe limits, warm-up and triggers (research as of 2026-11-20)

**Main finding:** Meta publishes no per-action limits for likes, follows, comments or DMs done by hand in the app or a browser. Every number below is a vendor estimate or a forum anecdote. Recent 2026 sources (ChatPlace, Aug 2026) say limits are "dynamic and tied to behaviour, account history and reputation". The pattern of activity matters more than the count: even timing, identical text, cold outreach, and actions without normal browsing.

The only official numbers I found:
- **Following cap:** you can't follow more than 7,500 people (Help Center, quoted by Unfollr).
- **Hashtags:** at most 5 per post or Reel, announced by Mosseri around Dec 19, 2025.
- **Accounts per device:** up to 5 logged-in accounts in one app (Help Center). This is a per-device limit, not a limit on how many accounts a person can own.
- **API limits (official, but they apply only to the Graph API, not browser use):** 750 private replies an hour, and a 24-hour reply window.

### Action limits per day (unofficial; confidence low to medium)

| Action | New, week 1 | New, weeks 2-4 | Aged (6+ months, never blocked) |
|---|---|---|---|
| Likes | 5 to 20, rising daily | 70-150 (10-15 an hour) | 300-500. Some vendors say up to 1,000, which is risky. |
| Follows | 5-10, spread out | 30-50 (5-10 an hour) | 80-200 (20-30 an hour at most) |
| Unfollows | 0 | 20 or fewer | 100-200, at most 50-80 per session |
| Comments | 0 on days 1-3, then 1-3 | 10-30 (2-3 an hour) | 50-80. Some say 100-150. |
| DMs (new chats) | 0, only replies | 10-30 (2-4 an hour), no links | 20-50 cold, up to 100 to people who follow you |
| Story views | Natural, around 20-50 | Natural | Not a known trigger at normal rates |
| Posts | 1 photo a day plus stories, first Reel on day 7 | 1 a day, a Reel every 2-3 days | Feed 1-3 a day, Reels 5-6 a day at most |
| Total actions | ~50 | Under 150 | Several hundred |

Spread rates: Unfollr suggests one action every 30-60 seconds. Unfollr also says to halve all limits for accounts under 6 months old, and accounts blocked before should drop to 5-10 follows an hour.

**What has changed recently:**
- Sources have moved from fixed numbers to pattern detection.
- The hashtag cap went from 30 to 5.
- A large bot and inactive-account purge happened in early May 2026, the "Great Purge". It was widely reported, but Meta never confirmed a count. Normal creators reportedly lost 2-5% of followers.
- The Account Status page was updated on Oct 14, 2025.

### 7-day warm-up for a new account
Source: Genviral 2026, a vendor. Forums broadly agree.

1. **Day 1:** Create the account on mobile data, not a VPN. Add a name, photo and a bio with no link. Switch to a Creator account. Watch 10-15 Reels, like about 5 posts, follow 5-10 accounts in your niche, spaced out. Post 1 photo. No comments and no links.
2. **Day 2:** Watch 10-20 Reels, like 5 or more posts, follow 5-10 accounts. Post 1 Story and 1 photo.
3. **Day 3:** Like 10 or more posts and follow 5-10. Post 1 Story and 1 photo. Still no written comments.
4. **Day 4:** Watch and like 10-15 posts, like a few comments, write 1-3 genuine comments. Post a Story.
5. **Day 5:** Same as day 4. Reply to any DMs or comments you received. Post a Story.
6. **Day 6:** Engage at a natural pace, follow naturally, reply to people. Post a Story.
7. **Day 7:** Post the first Reel. About 15-20 engagements spread across the day, plus a Story.

After that:
- Keep the first 10-20 posts manual.
- Post a Reel every 2-3 days.
- Use 3-5 hashtags.
- Leave the bio link off until about day 30. Other blogs say at least 1 week.

**Existing account that has been used normally:** no full warm-up needed. Aged accounts with steady history can handle bursts that would restrict a 2-week-old account (ChatPlace, 2026). The one thing to do is ramp automation up over 1-2 weeks from the account's past daily volume, rather than jumping to a new level.

### Triggers, ranked by risk
Mostly anecdotal or vendor sources, except where marked.

1. **Buying followers or likes (SMM panels), or tools that ask for your password.** Officially against the rules: Instagram removes the fake engagement and may limit features or suspend the account. Meta sued an automation vendor and won in Madrid in 2020.
2. **Mass DMs or comments with the same text or links**, especially to people who never interacted with you. Meta's API docs also flag identical repeated reply text as spam.
3. **High activity on a new account, or a sudden spike** of 2-5x the usual volume.
4. **Bio link on a brand-new account.** Anecdotal, but widely reported, and it matches the @yuhgodev case. Instagram only denies that the phrase "link in bio" reduces reach (Jul 2025).
5. **Follow/unfollow churn.**
6. **Many accounts sharing one device fingerprint or IP.** Proxy vendors report linked bans: one flagged account took down others within 48 hours (BlackHatWorld anecdote).
7. **Datacenter or VPN IPs, and jumping between IPs or devices** (vendor and forum sources).
8. **Machine-like timing:** even intervals, replies within seconds, actions with no scrolling or watching between them.
9. **Engagement pods.** No official rule names them, but they fall under "artificial engagement". They show little effect on reach beyond followers (one creator's self-test).
10. **Recycled or unoriginal media, and repeated captions or hashtags.** These mostly hurt reach rather than causing blocks.

### Account Status (official)
**Where to find it:** profile > menu > Account Status.

**What it shows:**
- removed content
- "Features you can't use"
- recommendation eligibility (professional accounts)
- issues to fix
- "Request a Review"

**What eligibility means:** if your account is eligible, Instagram may show it and its posts to non-followers in Reels, Explore, Feed, Search and Suggested Accounts. If not, followers still see your posts.

**Recovering eligibility:**
1. Edit or delete the flagged posts.
2. Fix the photo or bio if they are flagged.
3. Request a review.

Instagram only says ineligibility lasts "for a period of time" and gives no exact duration.

**How long restrictions last:**
- Action blocks: no official durations. Reports say 24-48 hours for a first block and 1-2 weeks or more for repeats; some say up to 30 days.
- Suspensions: around 30 days to appeal (blogs).
- The Markup (2024) found that some restrictions, such as comment bans, don't appear in Account Status at all.

**Recovering from an action block (anecdotal):**
- Stop all actions.
- Stay on the same device and IP.
- Don't keep logging out or appealing over and over.
- Wait 48-72 hours.
- Resume at about 50% of the volume that triggered the block, and avoid that action type for 48 more hours.

**Rules on automation:** the Terms of Use ban creating accounts or collecting information "in an automated way without our express permission". The Community Guidelines spam rule bans "artificially collecting likes, followers, or shares" and repetitive comments. Browser automation of likes, follows and DMs is therefore against the rules regardless of rate; low rates only lower the chance of being detected.

### Hard rules for the automation
1. Check Account Status before every session. If anything is restricted, the session is browsing only: no likes, follows, comments or DMs.
2. On any "Try again later" or "We restrict certain activity" message: stop at once, pause 48-72 hours, then resume at 50% of that volume. Never retry in a loop.
3. Use random gaps of 30-120 seconds or more, and mix in real scrolling and Reel watching. Never use fixed intervals.
4. Never send identical comment or DM text. No links in cold DMs or comments. The bio link waits about 30 days on new accounts.
5. Daily volume rises by at most about 20-30% a week, and stays within the table's column for the account's age.
6. One account per Chrome profile, on a stable residential IP. Never datacenter or VPN IPs, and don't switch IPs mid-session. At most 5 accounts per device, and don't stack many accounts on one IP.
7. No follow/unfollow churn: unfollow at most a third of daily follows, and none in weeks 1-2.
8. Never buy engagement or join pods. These are the only clearly official violations, and they hit reach as well as account standing.
9. Hashtags: 3-5, never the same block every time. Reels: 5-6 a day at most.
10. Keep logs per account so that a block can be traced back to the action that caused it.

### Sources
**Official**
- Instagram, Account Status blog (2021, updated Oct 14, 2025): https://about.instagram.com/blog/announcements/instagram-outages-and-account-status
- Instagram Help Center, Account Status: https://help.instagram.com/539126347315373
- Instagram creators blog on recommendations (2022, updated 2023): https://creators.instagram.com/blog/instagram-recommendations-eligibility-tips-creators
- Instagram, Reducing Inauthentic Activity (2018): https://about.instagram.com/blog/announcements/reducing-inauthentic-activity-on-instagram/
- Help Center, why not to use apps for likes and followers: https://help.instagram.com/263751177667145
- Meta, automation lawsuits (2020-21): https://about.fb.com/news/2020/06/automation-software-lawsuits/
- Help Center, adding up to 5 accounts: https://help.instagram.com/1696686240613595
- Terms of Use, automated creation and collection: https://help.instagram.com/581066165581870

**Press**
- Hashtag cap of 5 (Dec 2025): https://www.socialmediatoday.com/news/instagrams-implementing-new-limits-on-hashtag-use/808309/ and https://betanews.com/2025/12/19/instagram-puts-a-limit-on-hashtag-usage/
- May 2026 purge: https://gulfnews.com/technology/instagram-follower-counts-fall-after-major-bot-and-inactive-account-cleanup-1.500532316
- The Markup on Account Status gaps (Feb 2024): https://themarkup.org/automated-censorship/2024/02/25/what-to-do-if-you-think-youve-been-shadowbanned-on-instagram

**Vendor (unofficial)**
- ChatPlace (Aug 30, 2026): https://blog.chatplace.io/?p=8725
- Inssist (Aug 1, 2025): https://inssist.com/knowledge-base/instagram-bans-blocks-and-limits
- Metricool (Jan 21, 2026): https://metricool.com/instagram-limits/
- Unfollr (Jun 6, 2026): https://www.unfollr.com/blog/instagram-follow-unfollow-limits
- Genviral warm-up (2026): https://www.genviral.io/blog/warm-up-instagram-account
- SuperProfile DM limits (Nov 16, 2026): https://superprofile.bio/guides/instagram-dm-limits.md
- Multilogin: https://multilogin.com/blog/managing-multiple-instagram-accounts/

**Anecdotal**
- BlackHatWorld threads (page blocked from fetching; only seen in search results): https://www.blackhatworld.com/posts/20747288/ and https://www.blackhatworld.com/posts/20578804/
- Bio-link reports: https://windowsreport.com/we-restrict-certain-activity-to-protect-our-community/

None of the Reddit threads I looked for came up in search results.
