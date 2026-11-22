# Missing post types and distribution gaps (2026-11-21)

Scope: everything that is **not** a short vertical video, plus gaps in how posts are made and spread. Video styles are covered elsewhere. No code was changed.

Labels: **[O]** official or platform source · **[D]** dataset or study (vendor-run unless noted) · **[B]** blog or practitioner claim · **[I]** inferred by me, not verified.

---

## 1. Ranked list (value for effort)

| # | Gap | Platforms | Value | Effort | Faceless? |
|---|---|---|---|---|---|
| 1 | **Multi-image carousels** made from a reel's beats (render N stills + attach N files) | Instagram, Threads, Facebook (album), X (4 images), YouTube image posts | High | Medium | Yes |
| 2 | **Pinterest 2:3 images, plus a "finished-state" still** (cheat sheet or list with every row shown) | Pinterest (also 4:5 for IG/Threads/FB) | High for Pinterest | Low | Yes |
| 3 | **YouTube image posts / polls** (Posts now appear in the Shorts feed) | YouTube | Medium-high, unproven | Medium (needs #1, plus a rule change) | Yes |
| 4 | **Text, poll and image posts tracked as their own formats** (kinds, measurement, learnings) | X, Threads, Facebook, YouTube | Medium | Low | Yes |
| 5 | **One-reel-to-many repurpose step** (carousel + thread + Pin + text post from one script) | All | Medium-high (output multiplier) | Medium (after #1, #2) | Yes |
| 6 | **Pinned comment / first-reply link / pinned post as tracked steps** | IG, YT, TikTok, X, Threads, FB | Medium | Low | Yes |
| 7 | **Series containers**: YouTube playlists per series, Shorts series (YPP only), TikTok playlists at 10K | YouTube, TikTok | Low-medium | Low | Yes |
| 8 | **Facebook Page Stories** (share the week's best Reel; link sticker) | Facebook (IG Stories only via the phone) | Low (followers only) | Low on FB, not doable on IG web | Yes |
| 9 | **Quote posts as a tracked format** | X, Threads | Low-medium | Low | Yes |
| 10 | **Profile audit checklist** (bio, pinned, highlights, banner) the AI fills and reports | All | Low-medium | Low | Yes |
| 11 | TikTok photo mode | TikTok | Low until web upload is confirmed | Unknown | Yes |
| 12 | Collabs | Instagram mainly | Medium, but the user's job | n/a (cold DMs banned) | n/a |
| 13 | Trending audio | IG, TikTok | Low, weak evidence | High (mostly in-app only) | n/a |
| - | **LinkedIn**: do not add | - | Low fit, high ban risk | - | - |
| - | **Reddit posting**: do not add (read-only research at most) | - | High risk | - | - |

---

## 2. What the app already has (non-video)

- **Image posts, one image at a time.** `render_image` saves one frame of a reel, square 1080x1080 or vertical 1080x1920, "for an image post: X, Threads, a Facebook photo or a Pin" (electron/mcp/tools.ts:284-288, :613; src/render/agentTools.ts:109-116). `browser_attach_image` puts **one** file into a page's picker (electron/mcp/tools.ts:560-565, :674; electron/browser.ts:1999 `files: [full]`).
- **Shapes.** `RenderShape = 'vertical' | 'square'` (shared/types.ts:31). There is no 2:3 or 4:5.
- **Text posts.** X: "of about 4 posts a day at most 1-2 are videos; the rest are text posts (one sourced take, a stat with its source, a question, a 3-5 post thread) and images" (electron/mcp/tools.ts:739). Threads: about 60% conversation posts, 30% media, 10% product (shared/goals.ts:254). Threads text attachments weekly (shared/goals.ts:270). Facebook: one photo or text post a day, plus a weekly "top 5 free tools" photo carousel (shared/goals.ts:285). That carousel is **written into the rules but cannot be built**: there is no multi-image render or attach.
- **Post log kinds**: `'video' | 'short' | 'text' | 'image' | 'live'` (shared/types.ts:774; electron/mcp/tools.ts:454). There is no carousel, poll, story or quote kind. Detailed metrics (`record_reel_metrics`, saves, shares, hold) exist only per hub reel (electron/mcp/tools.ts:329-335), so text and image posts are not scored in get_performance **[I]**.
- **Post card preset** (an animated social-post card, shared/presets.ts:176-197). A frame of it can be an image post.
- **Comment vote stories** (series where viewers vote A/B in the comments; shared/types.ts:536-547). This is the app's only poll-like mechanic.
- **Pinned comment, first reply, pinned post, related video.** These are rules in the goal presets: the IG "comment KEYWORD" pinned comment (shared/goals.ts:146), a YT pinned question comment (:166), YT "Related video" (:165), the X link in the first reply and the pinned post (:57, :207-208), TikTok pin part 1 (:223). Nothing tracks whether they were done.
- **Profile.** "Suggest to the user in the report" on every platform (shared/goals.ts:133, :149, :227, :258, :291, :320). Profile saves always ask the user (electron/mcp/tools.ts:674; electron/browser.ts:839).
- **Facebook Groups**: rules exist (shared/goals.ts:100, :287, :306).
- **Quote posts on X**: mentioned in the mix (shared/goals.ts:194).
- **YouTube** is Studio-only. "On youtube.com nothing is pressed except that one Subscribe" (electron/mcp/tools.ts:733, :744). That rules out Posts (community/image posts) today.
- **Not supported at all**: Stories on any platform, polls (X, Threads, YT, FB), carousels, YouTube Posts, playlists, LinkedIn, Reddit.

---

## 3. The gaps in detail

### 1. Multi-image carousels from a reel's beats (top gap)

**Evidence**
- Socialinsider (62.7M brand posts, Jan-Sep 2026, published 2026-10-15) **[D]**: on Instagram, carousels beat Reels on average views at **every** follower tier. At 1-5K followers it is 700 vs 652 (images 273), and at 5-10K it is 1,525 vs 1,117. Reels lead engagement only under 5K (0.80% vs 0.75%). https://www.socialinsider.io/blog/what-to-post-on-social-media/
- Fanpage Karma (~700K posts, Jan-May 2025) **[D]**: Instagram carousels had about 13% more reach than Reels and 1.5x the engagement rate. On TikTok, photo carousels had about 3% more reach and 1.81x the engagement rate, but about a third fewer shares. https://www.fanpagekarma.com/insights/carousel-vs-video-performance-tiktok-instagram/
- Buffer 2026 (45M+ posts) **[D]**: Instagram engagement rate is 6.9% for carousels, 4.4% for single images and 3.3% for Reels. On Facebook, images lead at 5.20%. On Threads, images are at 4.55%, behind video at 5.55%. https://buffer.com/resources/data-best-content-format-social-media/
- **Contrary data** **[D]**: Metricool/HypeAuditor 2025 found that under 1K followers, Reels had a median reach of 134 vs 56 for carousels, and that Reels lead reach below 50K. https://liahaberman.substack.com/p/the-best-instagram-content-formats . Fanpage Karma (by size) also puts Reels ahead for accounts under 10K. https://www.fanpagekarma.com/insights/instagram-format-reach/ . Conclusion: **Reels for discovery, carousels for saves, sends and depth**. That matches docs/research/instagram-2026-11-20.md item 5.
- Mosseri **[O, reported]**: carousels get a second chance because Instagram re-shows them to followers who swiped past. Sends per reach is the strongest reach signal. https://uppbeat.io/blog/creator-news/whats-working-on-instagram-right-now-carousels-and-sends-says-adam-mosseri
- Facebook (Socialinsider) **[D]**: at 1-5K followers, albums have the highest engagement rate (0.33% vs Reels 0.30%). Reels still have 5x the views (262 vs 48).
- Instagram carousels hold up to 20 items (since Aug 2024) **[O, reported]**. https://www.techradar.com/computing/instagram/instagram-will-now-let-you-post-up-to-20-photos-or-videos-in-a-gallery-your-friends-should-be-thrilled
- Originality applies to photos and carousels too since 2026-04-30 (docs/research/instagram-2026-11-20.md:25). Our own renders are original.

**Faceless fit.** Yes. The canvas renderer already draws each beat (list rows, versus rows, stats, terminal lines, stickman scenes, meme panels). A carousel is the reel's beats as stills: slide 1 is the hook, slides 2-N are one beat each, and the last slide is the takeaway or "follow for part N". Screenshots and record_screen frames also work. A carousel should still show each beat finished, not mid-animation **[I]**.

**Today.** Not possible. render_image grabs one frame per call (agentTools.ts:112), attach takes one file (browser.ts:1999), and there is no 4:5 shape or `carousel` kind. The Facebook weekly carousel rule (goals.ts:285) cannot be carried out.

**Effort: medium.**
- (a) A `render_carousel` tool: N stills at each beat's settled time, shape 4:5 (1080x1350) or square, saved as numbered PNGs. The renderer already makes stills via `renderStills` (agentTools.ts:112).
- (b) Multi-file attach. CDP `DOM.setFileInputFiles` takes an array, and Instagram's Create dialog picker accepts multiple files **[I: verify per site]**.
- (c) A `carousel` kind in PostLog and mark_posted.
- (d) Per-site steps: IG Create > Post, Threads composer, FB Business Suite photo post, X up to 4 images.
- (e) Silent previews already exist, and a carousel needs no voice.
- Music on IG carousels appears to be added in the phone app only **[I]**, so web carousels will be silent. They still count.

**Rules to carry.** Slide text is short and human. No P&L or profit slides for Polymarket/Kalshi tools. No "open source"/"free to use" for Krypto Bot/Mirror. Affiliate links are disclosed in the caption.

### 2. Pinterest 2:3 images and a "finished-state" still

**Evidence.**
- Tailwind: 89% of the most viral Pins were images, and 1000x1500 is recommended. Pinterest's own home-decor analysis found numbered overlay titles and about 50% more saves for collages. GenSumo: static Pins get 4.8 outbound clicks per 1,000 vs 1.6 for video. All of this is in docs/research/pinterest-2026-11-20.md:170-190.
- Our own rule demands "2:3 images (1000x1500)" (shared/goals.ts:111) and a 70% image mix (:317).

**Gap.** render_image can only make square or 9:16 (tools.ts:287). **The Pinterest rule cannot be followed today**: every image Pin is either square or a 9:16 that Pinterest crops in the grid **[I]**. Cheat-sheet and infographic Pins ("Windows 11 settings to turn off", "20 shortcuts. one screen.") need all rows visible at once. A list reel's single frame shows the rows animated in so far, so the AI must guess the last frame **[I]**.

**Effort: low.** Add a `pin` shape (1000x1500) to RenderShape and the stills path. Add a "final" option that renders the preset's end state, or a tall list layout. Trading tools stay off Pinterest (goals.ts:114).

### 3. YouTube image posts and polls (Posts in the Shorts feed)

**Evidence.**
- YouTube Help **[O]**: Posts support polls, quizzes, GIFs, text, music, images and video. They "may show on homepage and Subscriptions feed, and **image posts may additionally show on the Shorts feed**." https://support.google.com/youtube/answer/9409631
- In the Dec 2025 test, all image posts made via Create could appear in the Shorts feed, with up to 10 images per post. From April 2026, views from image posts in the Shorts feed count toward the channel's total view count. In July 2026, 15 seconds of licensed music and text captions were added. https://www.tubefilter.com/2026/07/01/youtube-shorts-photo-post-music-update-images/ ; https://www.searchenginejournal.com/youtube-begins-showing-posts-in-the-shorts-feed/548807/
- There is **no performance data yet**, and YouTube calls it an experiment. Posts have no subscriber minimum (needs advanced features). https://www.socialmediatoday.com/news/youtube-community-posts-all-channels/651083/

**Faceless fit.** Yes: a carousel from #1, or a poll ("which tool next?").

**Today.** Blocked by design. Only Studio uploads plus one Subscribe click on youtube.com (tools.ts:733, :744). Posts are made from the channel's Posts tab or the Create button on youtube.com. Desktop availability of image carousels and music is **[I: verify]**.

**Effort: medium.** Needs #1, a narrow exception that allows the account's **own** channel Posts composer (youtube.com/@channel/posts), a `post`-kind classification in classifyYt, and a `youtube` post kind. Low risk because it is our own channel and no engagement with others. It is new reach for non-subscribers without making another video.

### 4. Text, poll and image posts as measured formats

**Evidence.**
- X: Buffer 2026 has text at 3.56%, images 3.40%, video 2.96% and links 2.25%. Ordinal found text-only posts got about 2x the impressions of image posts, with 100-200 characters doing best (docs/research/x-2026-11-20.md:207-210).
- Threads: replies are about half of all views (goals.ts:81), and media with text does better **[O]** (threads-2026-11-20.md:67).
- Facebook: at 5-10K followers, status posts have the highest engagement rate (0.30%) (Socialinsider).
- Polls: X, Threads (4 options, 24h), YouTube and Facebook all have them. **No platform publishes poll performance data**, and vendor claims only **[B]**. https://www.engadget.com/threads-now-has-polls-and-an-easy-way-to-post-gifs-184330729.html ; https://www.brandwatch.com/blog/x-polls/

**Today.** Text posts happen on X and Threads (tools.ts:739, goals.ts:254), but the post log records only kind/views/likes/comments, and `record_reel_metrics` is per reel (tools.ts:329). get_performance therefore cannot say "text tips beat images on X for this account" **[I]**. Polls are never mentioned outside the comment-vote reels.

**Effort: low.**
- Add the kinds `poll`, `thread`, `carousel` and `quote`.
- Give `log_posts` impressions, reposts and saves fields, and let get_performance rank formats per platform (the X goal already asks for "per format over 8-10 posts", goals.ts:190, with no way to compute it).
- Add a poll rule: one a week on X/Threads/YT, a real question with 2-4 options, never "vote to win", and nothing about which bet or market to take.
- Text follows HUMAN_RULES: ~5 words, under 60 characters, loose. Short posts on X/Threads can go to about 100-200 characters when they carry a sourced fact (current X rule).

### 5. Repurpose one reel into several formats

**Evidence.**
- Pinterest rewards **fresh images on the same page**: a new image kept about 64% of reach vs 11% for new text on the old image (goals.ts:109, from a 1.2M-Pin study).
- Meta rewards original and transformed content, and pushes down reposts of other people's work (facebook-2026-11-20.md:618). Re-cutting our own content into a new format counts as original **[I, from Meta's wording]**.
- Socialinsider/Buffer: each platform's best engagement format differs (carousel on IG, text on X, video on Threads, images on FB and Pinterest). One script can feed all of them.

**Shape.** A `repurpose_reel` step after a reel is rendered:
- a 4:5 carousel (IG, Threads, FB, YT post)
- a 3-5 post X thread from the narration (each post rewritten short and human, never the caption copied)
- 1-3 Pins (2:3, different designs per page)
- one X/Threads text take

Each derived post goes into the post log linked to `reel_id`, already supported (tools.ts:458). The hub should refuse identical text across platforms (the X duplicate filter, goals.ts:55).

**Effort: medium**, once #1 and #2 exist. Most of it is prompt and orchestration.

### 6. Pinned comment, first-reply link and pinned post as tracked steps

**Evidence.**
- Buffer (700K posts): replying to comments gave about 21% more engagement (instagram-2026-11-20.md:169).
- X's ranker predicts profile clicks, and a visit-to-follow rate under 2% means the bio or pinned post needs work (x-2026-11-20.md:236-240, weak).
- No study isolates pinned comments **[B]**. They are the only place on Shorts/TikTok/IG where a call to action or keyword stays visible.

**Today.** These are rules in prose only (goals.ts:146, :166, :208, :223). Nothing in get_today checks that a new post got its pinned comment or first-reply link. Pinning is a menu click, and approval handling for "Pin" is not classified per site **[I]**.

**Effort: low.** Add a post-checklist line in get_today after each mark_posted ("pin comment: done / skip"). Record `pinnedComment` / `firstReply` on the post log. Pinned profile posts stay a user suggestion.

### 7. Series containers: playlists and Shorts series

**Evidence.**
- YouTube Shorts series (seasons, episodes, sequential playback, custom thumbnails) rolled out on 2026-09-23 to **YPP creators only** **[O]**. https://blog.youtube/news-and-events/made-on-youtube-creators-shorts-series-tv-features/
- Playlists' effect on Shorts is unproven. Session time as a ranking signal is a vendor claim **[B]**.
- TikTok playlists unlock at about 10K followers (goals.ts:223).

**Today.** The app runs numbered series (goals.ts:128, :161, :221), but there is no playlist step.

**Effort: low.** In Studio Details, add each part to a playlist named after the series. This works inside Studio, so no rule change is needed. Shorts series only once the channel is in YPP.

### 8. Stories (Instagram, Facebook)

**Evidence.**
- Stories reach followers, not new people (Mosseri, instagram-2026-11-20.md:80, :184).
- Buffer: IG Story engagement is 5.1% on a small sample (n=520) **[D]**.
- Link-sticker taps are about 1-3% of Story viewers (vendor/unverified) **[B]**. https://www.socialinsider.io/blog/instagram-stories-report/
- The link sticker is available on organic Stories **[O]**. https://help.instagram.com/iphone-app/192168966243613

**Feasibility.**
- **Instagram web cannot post Stories.** The only routes are phone-emulation in devtools, Meta Business Suite or schedulers. https://metricool.com/post-instagram-stories-computer/ . Phone emulation would mean faking a mobile client: skip it.
- Facebook Page Stories are possible from Business Suite on desktop **[I: verify]**.
- Threads posts share to IG Stories from the phone only (goals.ts:258).

**Value:** low for growth, some for retention and product links ("new part up", link sticker to the product page).

**Effort:** low for FB (a weekly best-Reel Story). IG Stories and Highlights stay the user's, as a report suggestion.

### 9. Quote posts

**Evidence.** "Quote" is a scored action in X's ranker, but there is no outcome data (x-2026-11-20.md:232-235). On Threads, reposts with comment work the same way **[I]**.

**Today.** Mentioned (goals.ts:194). It is untracked and counted as a "post" by the classifier **[I]**.

**Effort: low.** Add a `quote` kind and a weekly cap. Only quote big niche posts with a real take of our own, never a dunk on a small account.

### 10. Profile audit

**Evidence.** The goals already define good profiles: the niche keyword in the name, a one-line bio of what followers get, the 3 best-follow posts pinned, and IG Highlights for Demo/FAQ/"is it safe?"/How to install (instagram-2026-11-20.md:263).

**Today.** Profiles are only suggested in reports, and saves ask the user (correctly).

**Effort: low.** A weekly `profile_audit` line in get_today: the AI reads each profile, checks it against the list, and puts **one** concrete suggestion in the report. Highlights need Stories, so they stay with the user.

### 11. TikTok photo mode

**Evidence.**
- Fanpage Karma 2025: +81% engagement and +3% reach vs video **[D]**.
- Buffer 2026: photos at 1.92% vs video at 3.39% **[D]**.
- Photo posts are excluded from Creator Rewards **[O]** (tiktok-2026-11-20.md:67).

**Feasibility.** Web upload of photo posts is **unclear**. Metricool says TikTok Studio web does not support carousels yet, and another blog says the web uploader only takes video. https://metricool.com/how-to-post-on-tiktok/ ; https://skedsocial.com/blog/schedule-tiktok-photo-carousels

**Recommendation:** check TikTok Studio once by hand. Until then, a carousel can go to TikTok as a slideshow video (a reel), which the app can already make.

### 12. Collabs

**Evidence.** Emplifi (vendor, 2026): accepted collab posts from very small brands got 5x their normal interactions. Reach is better when the larger account starts the post (instagram-2026-11-20.md:173-176, :272-275).

**Constraint.** Pitches are cold DMs, which the app forbids (tools.ts:732). This stays the user's job. The AI can list candidate accounts of similar size in the report. A paid or gifted collab needs the paid-partnership label (goals.ts:150).

### 13. Trending audio

**Evidence.** Vendor-only. Adobe says +29% reach, but that compares against silent videos, not original audio. Another vendor says trending sounds get about 47% higher initial reach on TikTok, with no stated method **[B]**. https://adobe.com/express/learn/blog/trending-audio-social-media-content

**Feasibility.** Trending sounds are picked in the platforms' phone apps. Web uploaders mostly cannot add licensed library audio **[I]**. Our reels carry their own voice and bed. Skip it; the voiced story reels already avoid the "silent video" penalty (tools.ts:728).

---

## 4. Not worth adding

### LinkedIn: no
- LinkedIn's help page bans "third-party software, including bots, browser plug-ins, or extensions, that scrape, alter the look of, or automate activity", and accounts risk restriction or shutdown **[O]**. https://www.linkedin.com/help/linkedin/answer/a1341387 . Marketo's whole posting path is a Chrome extension, so this is a direct conflict.
- Organic reach is falling, especially for company pages (company-page posts reach about 1.6% of followers, per one report) **[B]**. Posts flagged as low-effort AI reportedly get about 30% less reach **[B]**. https://www.entrepreneur.com/growing-a-business/organic-reach-on-linkedin-is-cratering-heres-how-to/497713 ; https://www.socialpilot.co/?p=694640
- Audience fit is weak: Windows tweaks, gaming PCs and memecoin bots are not professional-network topics. Trading bots on a professional network invite financial-promotion complaints **[I]**.
- The one strong format is document/PDF carousels (21.77% median engagement in Buffer 2026; native documents 7.28% for 1-5K in Socialinsider). If the user wants LinkedIn, the safe version is **export the #1 carousel as a PDF** for the user to post by hand.

### Reddit posting: no
- Self-promotion is set per subreddit. Common norms are the 90/10 rule, weekly promo threads, and karma and account-age minimums enforced by AutoModerator and the reputation filter (Contributor Quality Score) **[B]**. https://redship.io/blog/reddit-self-promotion-rules-2026
- In April 2025 Reddit called the AI-comment experiment in r/changemyview "improper and highly unethical", banned the accounts, considered legal action, and said it would tighten verification to keep out human-like bots **[O, reported]**. Many subs require AI disclosure or ban bots outright. https://decrypt.co/318649/reddit-cracks-down-ai-bots-infiltrated-debate-forum
- An AI account posting about Krypt tools, and above all trading bots, is the profile most likely to be banned and to hurt Krypt's name in the communities it targets **[I]**.
- The safe uses already exist or are read-only: the reddit/greentext *styles* (made-up stories rendered as video) and reading subreddits for topics and questions. Any real Reddit posting should be the user's own, by hand.

---

## 5. Owner rules that every new format must keep

- **Text** follows shared/humanText.ts: about 5 words, under 60 characters, loose. Slides and thread posts are the same register. Sourced facts are the only reason to run longer.
- **Trading tools (Polymarket, Kalshi, Krypto Bot)**: no profit, P&L, win rate or "returns" on any slide, poll or post. "AI trades for you, easy" plus a plain risk line. Never on Pinterest (goals.ts:114). Meta's ban on "guaranteed" or "past performance" applies to carousels and Stories too (goals.ts:86).
- **Krypto Bot/Mirror**: never "open source" or "free to use".
- **Affiliate links** (ElevenLabs, proxies) are always disclosed in the post or caption, including carousels and Pins.
- **Crypto posting freeze**: memory says it ran to the end of 2026-11-18. Confirm with the user before carousels go to @yuhgodev.
- **Limits**: carousels, polls and YT posts count toward the user's posts_per_day and post gap, and the hub enforces them.

---

## 6. Suggested build order

1. 4:5 and 2:3 shapes, plus a "settled frame" still (unblocks Pinterest rule goals.ts:111 now).
2. `render_carousel` plus multi-file attach plus `carousel` kind (IG, Threads, FB, X). This makes the existing FB weekly carousel rule real.
3. Post-format kinds (text, thread, poll, quote, carousel) and per-format numbers in get_performance.
4. repurpose_reel orchestration.
5. YouTube own-channel Posts exception (image carousel and poll), after a manual check that the desktop composer supports images.
6. Small checklist items: pinned comment, first reply, playlist per series, weekly profile audit, FB Page Story.

---

## Sources

- Socialinsider, What to post on social media (62.7M posts, 2026-10-15): https://www.socialinsider.io/blog/what-to-post-on-social-media/
- Buffer, Best content format 2026: https://buffer.com/resources/data-best-content-format-social-media/
- Buffer, State of social media engagement 2026: https://buffer.com/resources/state-of-social-media-engagement/
- Fanpage Karma, carousels vs video (TikTok + IG, 2025): https://www.fanpagekarma.com/insights/carousel-vs-video-performance-tiktok-instagram/
- Fanpage Karma, IG format reach by size: https://www.fanpagekarma.com/insights/instagram-format-reach/
- Lia Haberman on Metricool/HypeAuditor 2025 playbook: https://liahaberman.substack.com/p/the-best-instagram-content-formats
- Mosseri on carousels and sends: https://uppbeat.io/blog/creator-news/whats-working-on-instagram-right-now-carousels-and-sends-says-adam-mosseri
- IG 20-item carousels: https://www.techradar.com/computing/instagram/instagram-will-now-let-you-post-up-to-20-photos-or-videos-in-a-gallery-your-friends-should-be-thrilled
- IG Stories from desktop: https://metricool.com/post-instagram-stories-computer/
- IG link sticker help: https://help.instagram.com/iphone-app/192168966243613
- Socialinsider Stories benchmarks: https://www.socialinsider.io/blog/instagram-stories-report/
- TikTok photo posting on web: https://metricool.com/how-to-post-on-tiktok/ ; https://skedsocial.com/blog/schedule-tiktok-photo-carousels
- YouTube Posts help: https://support.google.com/youtube/answer/9409631
- YouTube image posts in Shorts feed: https://www.searchenginejournal.com/youtube-begins-showing-posts-in-the-shorts-feed/548807/ ; https://www.tubefilter.com/2026/07/01/youtube-shorts-photo-post-music-update-images/ ; https://9to5google.com/2026/04/15/youtube-tests-showing-creator-posts-in-your-shorts-feed/
- YouTube Posts for all channels: https://www.socialmediatoday.com/news/youtube-community-posts-all-channels/651083/
- YouTube Shorts series: https://blog.youtube/news-and-events/made-on-youtube-creators-shorts-series-tv-features/
- Threads polls: https://www.engadget.com/threads-now-has-polls-and-an-easy-way-to-post-gifs-184330729.html
- X polls (vendor): https://www.brandwatch.com/blog/x-polls/
- LinkedIn prohibited software: https://www.linkedin.com/help/linkedin/answer/a1341387
- LinkedIn reach: https://www.entrepreneur.com/growing-a-business/organic-reach-on-linkedin-is-cratering-heres-how-to/497713 ; https://www.socialpilot.co/?p=694640
- Reddit self-promotion norms (vendor): https://redship.io/blog/reddit-self-promotion-rules-2026
- Reddit and AI bots (r/changemyview, 2025): https://decrypt.co/318649/reddit-cracks-down-ai-bots-infiltrated-debate-forum
- Trending audio (vendor): https://adobe.com/express/learn/blog/trending-audio-social-media-content
- Facebook groups features: https://www.socialmediatoday.com/news/facebooks-testing-new-post-level-analytics-for-groups/583516/
- Internal: docs/research/{instagram,x,threads,facebook,pinterest,tiktok,youtube}-2026-11-20.md
