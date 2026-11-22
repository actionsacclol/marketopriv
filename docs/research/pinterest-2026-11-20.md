# Pinterest research (2026-11-20)

Raw reports from the research swarm, kept as written (model output with sources; check claims before quoting them). The rules the app actually uses are in shared/goals.ts.

---

## How Pinterest distributes Pins in 2026: research report (as of 2026-11-20)

**Labels used below:** **[Official]** means a Pinterest page or paper. **[Multi]** means several outlets reported it. **[Single]** means one blog or vendor. **⚠pre-2025** means the source is from before 2025 and may be out of date.

### 1. Where Pins show up and what ranks them
- **Three places, all personalised.** Pins appear in the home feed, in search and in "related Pins". The home feed is personalised per person. [Official] create.pinterest.com/faq (undated); business.pinterest.com/blog/beginner-pinterest-content-guide (2022-10-21 ⚠pre-2025)
- **What decides distribution.** Pinterest uses engagement from searches, saves and other interactions to judge relevance. That relevance "can be impacted by language, location, seasons, holidays, formats and trending topics." [Official] help.pinterest.com/en/business/article/pin-performance-and-distribution (undated, current)
- **Saves are the main signal.** Pinterest's 2025 audience guide says saves "may lead to wider distribution", creating a "halo of additional reach over time". The 2022 guide called saves "the strongest metric". [Official] business.pinterest.com/blog/how-to-build-audience-pinterest/ (2025-07-31)
- **How the home feed is built.** It runs in stages: retrieval, pre-ranking, ranking, then a final re-ranking that balances several goals. That last step weighs engagement against long-term satisfaction, diversity and quality, with "soft-spacing" added in 2025. [Official, via secondary summaries of the Pinterest Engineering blog; I could not open the original post]
- **Real-time actions feed the ranking.** TransAct models what a person just did: repins (saves), hides, clicks and how long they looked, each tied to a PinSage embedding. TransAct V2 (2025) reported +6.35% home feed repins. [Official] arxiv.org/abs/2306.00248 (2023 ⚠pre-2025); arxiv.org/abs/2506.02267 (2025)
  - So saves, closeups, clicks and hides all matter.
  - Pinterest does not publish a closeup weight or an "engagement-rate" formula.
- **How Pinterest understands a Pin.** It turns text and images into embeddings, along with boards, queries and engagement. This matters most for brand-new Pins, which have no engagement yet. [Official] OmniSage, KDD 2025, arxiv.org/abs/2504.17811
  - The 2024 search model (OmniSearchSage) used LLM-generated captions of the image, board names and engagement. So the picture itself is "read" for search. [Official] arxiv.org/abs/2404.16260 (2024 ⚠pre-2025)
  - Pinterest does not confirm OCR of text printed on images. [Single]
- **"Domain quality / Pinner quality / Pin quality".** This three-factor model is Tailwind's reading of the 2013-2015 Smart Feed and "Pinnability" posts. It was never confirmed by Pinterest. [Single ⚠pre-2025] tailwindapp.com/blog/pinterest-smart-feed-pin-visibility; medium.com/pinterest-engineering/pinnability-machine-learning-in-the-home-feed-64be2074bf60 (2015)
- **Outbound clicks are a company priority.** Outbound clicks to advertisers rose 40% year on year in Q3 2025, credited to Pinterest's AI search and recommendation work. [Official] Q3 2025 earnings transcript, s204.q4cdn.com/369458543/files/doc_earnings/2025/q3/transcript/Q3-2025-Transcript.pdf

### 2. Pinterest SEO
- **Keywords go in the Pin title, description and board title.** Fill in every field, because some fields are not shown to people but still feed recommendations. Add topic tags whenever the option appears ("Always add topics when it's an option"). Give boards clear titles and descriptions, since boards also show up in search. [Official] how-to-build-audience (2025-07-31); pin-performance-and-distribution
- **Use Pinterest Trends.** Trends on Pinterest last "nearly twice as long" as on other platforms. Use trends.pinterest.com and Pinterest Predicts. [Official] same 2025 guide; Pinterest Predicts 2026 (2025-12-09), newsroom.pinterest.com/news/pinterest-predicts-nonconformity-self-preservation-and-escapism-drive-21-trends-for-2026/
- **Hashtags are effectively dead.** Pinterest's current guidance mentions keywords and topics, never hashtags. Hashtags have been "optional" and work like plain words since about 2020. [Multi: Tailwind 2025, Brand24 2025, Louise Myers] I found no dated official statement on this.
- **Keyword stuffing is banned** as a dishonest way to influence metrics. [Official] policy.pinterest.com/en/community-guidelines (updated November 2026)

### 3. Fresh Pins vs repins, claimed website, Rich Pins
- **Don't repeat yourself.** Pinterest says: "Try not to repeatedly save the same Pins or upload content that already exists on Pinterest." Doing so can get you "flagged as spam and… temporarily blocked from creating Pins." [Official] pin-performance-and-distribution
- **What counts as "fresh"** is not formally defined by Pinterest.
  - Tailwind's study (1M+ Pins, 2025-03-27) found:
    - A new image on a URL you have already pinned kept 64% of its reach even on the 11th-25th reuse.
    - The same image with only new text kept 11% after that many reuses.
    - About 20% of new Pins had no impressions after one week.
  - [Single/vendor] tailwindapp.com/pinterest-marketing/research/2025-benchmark-study-part-three
- **Claiming your website.** Claiming the site (HTML tag, file, TXT record or Merchant Center) links Pins from that site to your profile and unlocks analytics. A site can be claimed by only one Pinterest account. [Official] help.pinterest.com/en/business/article/claim-your-website
  - Pinterest does not say claiming boosts reach.
- **Rich Pins** pull Open Graph and Schema metadata from the page and refresh when the page changes. [Multi] No official claim that they lift reach.

### 4. Formats and aspect ratios
- **Recommended sizes.** Images: 2:3 (1000×1500); anything taller than 2:3 "might get cut off" in feeds. Video: 9:16 (1080×1920). Also supported: 1:2, 3:4, 4:5 and 1:1. "Fully vertical assets get more engagement." [Official] help.pinterest.com/en/article/review-pin-specs; create.pinterest.com
- **Video limits.** 4 seconds to 5 minutes, H.264 or H.265. Keep the top and bottom clear of the player controls. Make "your first 10 seconds count" and open with the takeaway. [Official] create.pinterest.com/create-content
- **Mix formats.** Pinterest says to mix video, carousels and collages, and that repurposing existing assets is fine. It publishes no head-to-head reach figures for video vs static. [Official] 2025-07-31 guide
  - Claims that 9:16 video gets a "massive reach boost" are unsourced. [Single]
- **Remove other platforms' watermarks** before posting. [Official] create.pinterest.com/faq

### 5. How long Pins keep getting traffic
- **No expiry.** "Pins last forever on Pinterest and high quality, relevant Pins can continue to resurface seasonally." "There's no set engagement window for Pins." [Official] pin-performance-and-distribution
- **Half-life estimates:**
  - About 3.5-4 months [Multi, older studies ⚠pre-2025].
  - About 16 weeks median active life (173k Pins, 2026) [Single/vendor: GenSumo].
  - Impressions grow over the first 90 days; judge a Pin over 2-3 months [Single: Tailwind 2025].

### 6. Changes in 2023-2026
- **Idea Pins merged into standard Pins** (2023-05-11). Links became available on all Pin types from June 2023, and links can be edited after posting. Multi-image uploads on mobile now render as a video Pin. [Official ⚠pre-2025 but still current] newsroom.pinterest.com/en-sg/news/introducing-an-easier-way-to-create-and-inspire-on-pinterest/; community.pinterest.biz June 2023 roundup
- **Gen AI labels** (2025-04-30). An "AI modified" label appears on image Pin closeups, detected from metadata and classifiers. Labels can be appealed. Owners can self-label, and labelling follows the IPTC metadata standard. [Official] newsroom.pinterest.com/news/introducing-gen-ai-labels; help.pinterest.com/en-gb/article/ai-at-pinterest
  - Pinterest does not say labels cut reach.
- **"See less AI" controls** (2025-10-16, updated 2025-12-12). Viewers can turn down Gen AI images per category, via Settings > Refine your recommendations or the ⋯ menu on a Pin.
  - Categories: art, beauty, fashion, home decor, health, sport, architecture, entertainment, and food and drink.
  - These viewer choices do lower the reach of AI images in those categories.
  - [Official] newsroom.pinterest.com/en-ca/news/pinterest-rolls-out-new-tools-to-give-users-more-control-over-gen-ai-content/
- **Pinterest Assistant** (2025-10-30). A visual-first AI shopping assistant (beta) taking voice, text and image input. [Official] newsroom.pinterest.com/news/pinterest-assistant-revolutionizing-the-way-you-shop-online/
  - Ask Pinterest, an experimental separate app, followed in June 2026. [Multi]
- **Policy rewrite effective 2026-11-12.** [Multi: Panstag, PPC Land; the live guidelines page now reads "Updated November 2026"]
  - The spam section was regrouped. New ban on Pins that "trick" people.
  - New "Scams" section bans:
    - "financial schemes promising unrealistic returns"
    - exaggerated product claims
    - synthetic media that misrepresents a product
    - deceptive redirection
    - artificially inflated metrics
  - The ad rules now treat crypto products (with narrow exceptions) and binary options as "predatory".

### 7. Posting frequency
- **Pinterest's own guidance:** publish "regularly—ideally on a weekly basis", and "focus on the content rather than a specific number of Pins". "Quality and relevance matter more than frequency" (2022). You can schedule up to two weeks ahead. [Official]
- **Vendor numbers:** Tailwind says 1-5 fresh Pins a day and calls the old 15-25 a day outdated. Adobe says 4-10. [Single/vendor]
- **Rate limits:** Doing the same action many times quickly (saving, commenting, following, logging in) triggers temporary "rate limit blocks". Most lift within 24 hours. Pinterest's advice is to "vary your actions". [Official] help.pinterest.com/en/article/rate-limit-blocks

### 8. Spam rules that cut reach
These are Community Guidelines, updated November 2026. [Official] policy.pinterest.com/en/community-guidelines
- No repetitive, deceptive or irrelevant content made for profit.
- No coordinated efforts to flood the platform or manipulate search.
- No multiple accounts used for manipulation.
- **No automation unless Pinterest approved it.** The text says: "Don't use automation that hasn't been explicitly approved by Pinterest."
- **Link rules:**
  - Links with excessive or deceptive redirection may be blocked.
  - URL shorteners abused for spam may be blocked.
  - Links to unoriginal or deceptive sites are not allowed.
  - Readers should be able to predict where a link leads; this "no surprises" rule now also covers profile links.
  - Re-pointing old Pins to new destinations has been named as a spam tactic.
- **Landing page checks:** The Pin's image, text and keywords should match the landing page. Don't block Pinterestbot. Keep load time under about 4 seconds. [Official] pin-performance-and-distribution
- **Adding UTM tags doesn't make a Pin "new".** Pinterest reads the canonical URL. [Single: Tailwind]
- **New domains are fragile.** New domains that upload many Pins quickly get spam-blocked. [Multi: Pinterest community forum threads 2025-2026]
- **Wrongful bans happen.** Pinterest had a wave of mistaken suspensions in April-May 2025 and blamed an internal error. [Multi: TechCrunch 2025-05-14, Fast Company, Social Media Today]

### 9. Myths that Pinterest's own sources contradict
1. **"Pins die within 48 hours."** Pinterest: "no set engagement window"; Pins "last forever" and come back seasonally.
2. **"There's a best time to post."** Pinterest's FAQ: no universal best time; test with your own audience.
3. **"Pin 15-30 times a day."** Pinterest asks for weekly, quality-first posting with no target number.
4. **"Re-save the same Pin to many boards for reach."** Pinterest says repeated saving can be flagged as spam and get you blocked.
5. **"Hashtags drive discovery."** Pinterest's current guidance names keywords and topics only.
6. **"Only Idea Pins get reach, and they can't link."** That format was merged in 2023, and every Pin can carry a link.
7. **"Any ratio works."** Images taller than 2:3 may be cut off; vertical gets more engagement.
8. **"An AI label means a shadowban."** Pinterest has never said labels lower reach. Only viewers' own "see less" choices do. (Not proven either way.)

### 10. Rules for an AI agent pinning on Pinterest for a small faceless business account
1. **Know the automation risk first.** The Community Guidelines ban "automation that hasn't been explicitly approved by Pinterest", and an AI driving Chrome is not approved. Keep volume human-paced and actions varied, never bulk. Accept that a ban is possible, and keep the website claimed so the domain survives an account loss.
2. **Post few, fresh Pins.** Start at 1-3 new Pins a day, never in bursts. Every Pin needs a new image or video. If a URL repeats, the image must be new. Never re-upload or re-save the same asset.
3. **Write for search.** Use a plain title with the search keyword first, for example "Free Windows debloat tool – speed up PC". Write a 1-2 sentence natural description and add topic tags. No hashtag stacks, no keyword stuffing. Check terms in Pinterest Trends and the search autocomplete.
4. **Keep boards specific and keyword-named.** For example "Free Windows PC Tools" or "Windows Performance Tweaks". Save each Pin first to its single most relevant board only.
5. **Get the formats right.**
   - Video: 9:16 at 1080×1920, put the payoff in the first 1-2 seconds, burned-in captions, top and bottom kept clear, 4 seconds to 5 minutes.
   - Image: 2:3 at 1000×1500.
   - Strip watermarks from other platforms before posting.
6. **Link straight to your own claimed domain.** No shorteners, no redirect chains, no tracking links that change the destination. The Pin must match the landing page. Never re-point a published Pin to a different page.
7. **Be careful with the trading-bot content.** Pinterest's November 2026 scams rules ban "financial schemes promising unrealistic returns". Its ad rules treat crypto as predatory, and Polymarket may be read as gambling.
   - Never claim profits or call it "easy money".
   - Keep these Pins to factual tool demos, or leave them off Pinterest entirely.
8. **Handle AI images honestly.** Disclose AI-generated or AI-edited images (IPTC metadata or self-label). Prefer real screen recordings, which are not labelled and fit Pinterest's own stated preference for showing the product in realistic settings.
9. **Engage sparingly and authentically.** Reply to comments on your own Pins and make a few genuine saves. No mass follows, likes or comments; those trigger rate-limit blocks. Stop for 24 hours after any block.
10. **Judge results slowly.** Measure over 2-3 months, not days, and track saves and outbound clicks. Don't delete and re-post Pins that start slow; about 20% get no impressions in their first week.

### Gaps
- I could not open three sources:
  - Pinterest's blocked-links help page (404).
  - The original 2025 Engineering post on home feed re-ranking (only secondary summaries were found).
  - Pinterest's own "Changes to our policies" notice for 2026-11-12 (the details come from Panstag and PPC Land, plus the live guidelines page dated November 2026).
- Pinterest publishes no official video-vs-static reach data and no pins-per-day number.

---

## Pinterest growth for a faceless, AI-run niche account (as of 2026-11-20)

How much to trust each source: **[C]** large vendor dataset with stated methods (closest we have to controlled data). **[P]** Pinterest's own statement or internal analysis, with no methods given. **[V]** vendor blog or opinion. **[S]** self-reported or forum. No independent, peer-reviewed Pinterest growth study exists.

### Two policy findings come first
1. **Automation.** Pinterest's Community Guidelines (updated November 2026) say: "Don't use automation that hasn't been explicitly approved by Pinterest." An AI agent driving Chrome is unapproved automation, so the whole setup is **grey** by definition. Keep it at human pace and vary its actions. Pinterest's own list of rate-limit triggers is: logging in a lot, commenting quickly, repeating a comment, mass follows, and saving many Pins from one site quickly. Most of these blocks lift within 24 hours. https://policy.pinterest.com/en/community-guidelines , https://help.pinterest.com/en/articles/limits-and-blocks
2. **Polymarket bots. Recommendation: keep them off Pinterest.** The same guidelines say Pinterest will "remove or limit the distribution of" content offering "Organic promotion of online gambling, lotteries, and wagering services." A prediction-market bot is very likely to be read as wagering. "Exploitative financial or investment schemes promising unrealistic returns" is also banned. This is **gets restricted** even with no profit claims, and it could pull down the whole account and the domain it links to.

### Tactics ranked by expected growth

**1. Fresh Pins: a new image for the same URL. Safe. Strongest evidence.**
- Tailwind studied about 1.2M Pins from more than 17k accounts (Part 3, 2025-03-27) [C]:
  - A new image on the same URL kept **64%** of its first Pin's distribution even at the 11th to 25th Pin of that URL.
  - The same image on the same URL kept only **11%**.
  - Over 90% of website traffic came from the account's own Creates, not from saving others' Pins.
- So: many designs per URL, never the same image again. https://tailwindapp.com/pinterest-marketing/research/2025-benchmark-study-part-three , https://t_pr6104-www.tailwindapp.com/pinterest-marketing/research/2025-benchmark-study-part-1 (2024-11-19)

**2. Keyword SEO in titles, descriptions, alt text, boards and topics. Safe.**
- Pinterest (2025-07-31) [P]: treat it like a search engine, fill in every field, always add topics, and give every board a title and description. https://business.pinterest.com/blog/how-to-build-audience-pinterest/
- Tailwind Part 2 (2024-12-09) [C], viral Pins:
  - About 80% had a keyword in the title, and about 60% of titles were at least 25 characters.
  - Descriptions ran about 220 characters with no more than 5 keywords.
  - Only 19% used hashtags.
  - Alt text was linked to about +25% impressions and +123% outbound clicks. The page's text and chart disagree, so these are correlation, not proof. https://www.tailwindapp.com/pinterest-marketing/research/2025-benchmark-study-part-2
- Where to find keywords: the search bar's guided suggestions, and Pinterest Trends (Business account > Analytics > Trends), which shows up to 2 years of history and when searches start rising. https://help.pinterest.com/en/business/article/pinterest-trends

**3. Steady volume. Safe at moderate levels, grey at bulk volume.**
- No published curve links Pins per day to reach.
- Tailwind's current advice [V]:
  - New accounts: 3–5 fresh Pins a week.
  - Creators: 1–3 a day.
  - High-volume ecommerce: 5–10 a day.
  - Save a Pin to at most 10 boards.
  - It warns that duplicates bring diminishing returns and spam flags. https://support.tailwindapp.com/en/articles/15621722-how-many-pins-should-you-post-per-day-on-pinterest
- The older "5–25 a day" figure appears in Tailwind's Part 1, attributed to Pinterest.
- Pinterest itself (2025) says not to anchor to a number and to add content every week.

**4. Format: static 2:3 first, then video, then collage. Safe.**
- Tailwind [C]: of the most viral Pins, **89% were images, 8% video and 2% collage**.
  - 76% of viral videos were 2:3 or taller.
  - Vertical videos got more saves and clicks per Pin despite fewer impressions.
  - Square and landscape video did poorly.
  - Use 1000×1500 images.
- GenSumo (2026-03-21, about 148k Pins) [V, weak: anonymous author, methods can't be checked]:
  - Saves per 1,000 impressions: static 5.2, video 13.5.
  - Outbound clicks per 1,000: static 4.8, carousel 4.1, video 1.6. https://gensumo.pages.dev/research/pinterest-marketing-benchmarks-report/
- Pinterest's home-decor analysis (2026-08-01) [P]: collages had a save rate about **50% higher** than single images. https://create.pinterest.com/blog/home-decor-content-ideas-examples/
- In short: images bring traffic, video brings saves and follows, collages bring saves.

**5. Pin design that earns saves. Safe.**
- Pinterest home-decor analysis [P]: most top Pins used overlay text, and over half of those overlays had **numbers in the title** (lists, "7 settings…").
- Tailwind [C]:
  - 87 of the top 100 colours in viral Pins were white or near-white.
  - Only 4% of viral designed Pins used brand colours.
  - About 50% of viral Pins were raw images, and more than 1 in 4 of those looked amateur. Polish matters less than being useful.
- Cheat sheets and infographics: no study measures them on their own. The "numbered list plus collage" evidence suggests they work.

**6. Board strategy. Safe.**
- One clear keyword phrase per board name, plus a description. Pinterest suggests sections grouped by category with the strongest Pins at the top. https://create.pinterest.com/blog/boards-gift-guides-curated-inspiration
- Pinterest's creator newsletter of 2026-04-21 reportedly said "Nearly 25% of Pinterest's organic traffic goes to boards." This is secondhand [S]: https://pingroupie.com/blog/pinterest-group-boards-are-back-2026
- 10–30 active boards was linked to 2.4× the impressions of fewer than 5 boards [V, weak, correlation only].

**7. Seasonal timing. Safe.**
- Pinterest gives no number of days.
- Tailwind's "3-month rule" [V]: plant the main Pins 90–60 days ahead, then branch out 60–30 days ahead. https://www.tailwindapp.com/blog/seasonal-keywords-pinterest/amp?nonamp=1
- Tailwind [C]: about 20% of new Pins still have **zero impressions after a week**, distribution builds over 90 days, and winning Pins peak after 1–2 years.
- Tech windows: back-to-school (pin June–July), Black Friday and holiday setups (Aug–Sept), New Year productivity (Oct–Nov), Steam sales.

**8. Group boards. Safe, low priority.**
- Tailwind [V] says they help less than before, and fresh Pins on your own boards beat them. https://www.tailwindapp.com/blog/pinterest-group-boards-create-join-leave
- Pinterest's 2026 newsletter reportedly encouraged them again [S].
- Join 2–3 active, on-topic ones at most.

**9. Saving others' Pins, following, commenting. Grey above light use.**
- No evidence that any of these grows your own reach. Over 90% of traffic comes from your own Creates.
- Following and commenting quickly are Pinterest's own block triggers.
- A few curated saves a day are fine for filling boards. Answer comments on your own Pins, which Pinterest recommends.

**10. Tailwind Communities. Skip.**
- Tailwind's support pages say Communities are "no longer being developed or supported." https://support.tailwindapp.com/en/collections/14528-tailwind-communities

### What kills reach
- **The same image on the same URL**: 11% of its first distribution versus 64% for a new image [C].
- **Saving many Pins from one site quickly**: Pinterest's own block trigger [P].
- **Link shorteners**: Pinterest says it doesn't allow them; link straight to the page. **Gets restricted.** https://help.pinterest.com/en/articles/blocked-links-and-websites
- **Repetitive, irrelevant or money-motivated spam, and engagement manipulation**: removed [P]. **Gets restricted.**
- **AI-generated images**: Pinterest labels them through detection and IPTC metadata (since 2025-04-30). Users can choose "see fewer" in beauty, art, fashion, home decor, and food (added 2025-12). Tech isn't on that list yet. Use real screenshots of the tools instead. **Grey.** https://techcrunch.com/2025/04/30/pinterest-launches-new-tools-to-fight-ai-slop/ , https://techcrunch.com/2025/10/16/pinterest-adds-controls-to-let-you-limit-the-amount-of-ai-slop-in-your-feed/
- **Domain-level "spam" blocks**: forum threads from 2026 report whole domains blocked with appeals auto-rejected, and a widespread impression drop from 2026-05-08 [S]. Use one claimed domain and keep the content clean. https://community.pinterest.biz/t/account-wide-impression-drop-since-may-8-2026-no-violation-found-still-unresolved-after-11-weeks/48798

### Does tech content work on Pinterest?
Yes, with the right angle.
- **Audience**: about 600M monthly users, and Gen Z is "over 50%" (Q3 2025 earnings, 2025-11-04). https://www.businesswire.com/news/home/20251104325182/en/
- **Men**: more than a third of users, mostly Gen Z. Gen Z men are more than twice as likely to call themselves gamers, and AI video searches rose about 800% [P, 2025]. https://newsroom.pinterest.com/news/the-pinterest-mens-trend-report
- **Setups**: "computer and gaming setup" searches grew over 150% from 2019 to 2020 [P, old data]. https://business.pinterest.com/en-gb/insights/personalized-technology-trends/
- Expected fit by niche (my judgement):

| Niche | Fit | Angle that works |
|---|---|---|
| Gaming and desk setups | Best | Visual, aesthetic, close to home decor |
| AI tools | Good | Lists and cheat sheets ("10 AI tools for…") |
| Windows tweaker, cleaner, macros | Medium | How-to infographics ("Windows 11 settings to turn off for FPS"), not app ads |
| Crosshair | Medium | Code lists per game |
| Video editor | Medium | Before/after |
| Polymarket bots | Avoid | Policy risk above |

- Expect lower save rates than food or decor.

### Realistic numbers for a new niche account
None of this is controlled data. Forum reports [S] show 1K–6K monthly views in months 1–2 with consistent posting, and as low as about 700 after 6 months for some accounts. One self-reported fashion account reached about 500K at about 60 days. https://community.pinterest.biz/t/monthly-views-targets/40785.md , https://community.pinterest.biz/t/how-i-reached-9-7m-monthly-views-on-pinterest/41909.md

My estimate for tech niches at 3–8 fresh Pins a day:

| Day | Monthly views | Followers |
|---|---|---|
| 30 | 0.5K–5K | 0–30 |
| 90 | 5K–50K | 30–300 |
| 180 | 20K–250K | 150–1,500 |

- **Outliers**: one Pin that breaks out can add 100K–1M views. The top 1% of Pins carry over 50% of impressions [C].
- **Per 1,000 impressions**:
  - Saves: about 2–5 for static Pins (WebFX's 0.2–0.5% save rate [V]), possibly about 10+ for video [V, weak].
  - Outbound clicks: about 2–8 [V].
- Followers barely affect distribution, so judge the account by views and saves.

### "Mass growth" playbook

**Before pinning (week 0)**
- Business account with a keyword name, e.g. "Krypt | Free PC Tools & Gaming Setups". Claim the domain.
- Pinterest has no separate warm-up rule. A few days of light, human browsing and saves is a safe choice.
- Build a 50–100 keyword list from search suggestions and Trends.
- 12–20 boards with one keyword each and real descriptions. Add sections once a board passes about 50 Pins.
- 6–10 design templates: light background, 2:3, numbered title, a real screenshot.
- Plan seasonal Pins for 60–90 days ahead.

**Daily**
- Weeks 1–2: 2–3 fresh Pins a day. Week 3: 3–5. From week 5: 5–8 if the account has no blocks.
- About 70% static, 20% vertical video of 6–15 seconds, 10% collage or carousel.
- At most 1 new Pin per URL per day. Never reuse an image.
- First save to the most relevant board. Extra boards several days apart, 10 boards at most.
- Full title, description, alt text and topics on every Pin. Direct links only.
- Spread actions through the session. At most about 5 saves of others' Pins. Few follows. Answer comments on your own Pins.
- Stop for 24 hours after any block.

**Weekly**
- Check Trends for rising terms and make Pins for them.
- Make 3–5 new designs of any Pin in the top 10%.
- Review boards and add sections.
- Look for any "AI modified" labels and replace those images with screenshots.

**What to measure (per cohort of Pins, by format, template and keyword cluster)**
- Impressions per Pin at 30, 60 and 90 days.
- Saves per 1,000 impressions.
- Outbound clicks per 1,000 impressions.
- Profile visits.
- Share of views from the top 10% of Pins.
- Never judge a Pin in its first week.

**When to double or drop**
- **Double**: once a format, template or keyword cluster has 10 or more Pins at least 30 days old, double it if it beats the account median by 2× on impressions or saves per 1,000, or if it produced a top-1% Pin.
- **Drop**: if after 60 days the median Pin gets under 30% of the account median impressions, drop it.
- **Account-wide drop of more than 40% in a week**: cut volume by half and check for duplicates or link problems before changing content.

---

# Pinterest to downloads/customers for Krypt (research as of 2026-11-20)

## Short answer: does software convert on Pinterest?
**Nobody has published solid evidence that it does or doesn't.** I found no controlled or first-party case study of Pinterest driving desktop software downloads or SaaS signups. What does exist:
- **Audience (official, self-reported).** 661M monthly users in Q3 2026 ([SEC 8-K, 2026-10-29](https://www.sec.gov/Archives/edgar/data/0001506293/000150629326000151/q3-26xpressrelease.htm)). Men are over a third of users. Searches by men grew sharply in 2025: "programming tutorial" +265%, "AI automation" +365%, "coding software" +120%, "investment app" +620%, "live wallpaper for PC" +465% ([Pinterest Men's Trend Report, 2025-07-08](https://newsroom.pinterest.com/news/the-pinterest-mens-trend-report)). Pinterest says 96% of top searches are unbranded ([Newsroom, 2025-09](https://newsroom.pinterest.com/en-sg/news/pinterest-introduces-top-of-search-ads-and-new-advertising-tools/)).
- **Referral share (third-party, not checked against StatCounter itself).** Pinterest sends 3.22% of social referral traffic worldwide and 6.63% in the US ([Searchlab citing StatCounter, Oct 2026](https://searchlab.nl/en/statistics/pinterest-statistics-2026)).
- **Device problem.** A Windows download needs a PC. Desktop is about 55-62% of visits to the Pinterest *website*, but nobody publishes the share of all use that happens in the app (Semrush via [Hootsuite](https://blog.hootsuite.com/pinterest-statistics-for-business/)). Plan for a large share of clicks coming from phones that cannot install anything.
- **2026 traffic drops (anecdotal).** Many forum reports describe outbound clicks falling 50-90% in April-May and October 2026. Pinterest has given no official explanation ([community thread](https://community.pinterest.biz/t/sudden-permanent-traffic-collapse-since-april-2026/49953)).

**Verdict.** Pinterest is plausible as a slow search channel for the free PC tools: tutorial-style, "how do I fix my PC" queries. It is a poor and risky channel for the Polymarket bots. Expect small numbers, and judge it on months of UTM data, not on belief.

## Rules that matter (official)
- **Automation.** "Don't use automation that hasn't been explicitly approved by Pinterest." This explicitly includes services that act on your behalf ([Community Guidelines, updated Nov 2026](https://policy.pinterest.com/en/community-guidelines)). The [Developer Guidelines](https://policy.pinterest.com/en/developer-guidelines) allow schedulers only if "the end user must choose each Pin to be published." They also say follows and comments need the user to choose each one.
- **Links.** Pinterest says it doesn't "allow certain redirects or URL shorteners" and "sometimes block[s] links that redirect," so link straight to the page ([Help: fix a broken link](https://help.pinterest.com/en/article/fix-a-broken-link)). Other rules: no "excessive or deceptive redirection"; "Pinners should be able to reasonably anticipate where your link will take them"; no "repetitive, deceptive, or irrelevant" content made to earn money (Community Guidelines).
- **Software.** Organic rules say nothing specific about software downloads or browser extensions. The ad rules ban "links to software that results in a malicious user experience" and landing pages that "start automatic downloads" ([Advertising Guidelines](https://policy.pinterest.com/en/advertising-guidelines), no date shown). Link to a tool page, never straight to an .exe. Unverified: whether unsigned .exe files on krypt.cc trip Pinterest's "unsafe site" link blocks. Test one Pin first.
- **Financial and crypto content.**
  - Organic: Pinterest removes "exploitative financial or investment schemes promising unrealistic returns" (Community Guidelines).
  - Ads: "All cryptocurrency products and services except those explicitly allowed" are banned. The only exceptions are licensed exchanges and wallets, with pre-approval and no return promises.
  - Ads also ban "services that promise large financial returns for minimal investment or effort." From 2026-11-12, binary options are banned and get-rich-quick schemes sit in a new scams section ([PPC Land, 2026-09](https://ppc.land/pinterest-bans-binary-options-ads-under-new-scam-and-deception-rules/)).
  - Merchant rules ban financial products "including cryptocurrency" and gambling products, so there can be no product or catalog Pins for the bots ([Merchant Guidelines](https://policy.pinterest.com/en/merchant-guidelines)).
- **Gambling and prediction markets.**
  - Pinterest will "remove or limit" "Organic promotion of online gambling, lotteries, and wagering services" (Community Guidelines).
  - Ads ban gambling websites and apps, plus "online prize-based games that require payment for entry."
  - No Pinterest rule mentions prediction markets by name. Whether Polymarket counts as "wagering" is unknown, so assume a real risk that it does.
- **Affiliate links and partnerships.** "All paid partnerships must disclose the commercial nature of their content." Affiliate rules say "Be transparent about … your links and their behavior" and ban fake accounts saving affiliate links. Paid partnerships must also follow the Advertising Guidelines' prohibited categories, so crypto and gambling affiliate content is effectively off-limits ([Commercial & Branded Content Guidelines, updated Apr 2025](https://policy.pinterest.com/en/commercial-and-branded-content-guidelines)). For something like the ElevenLabs link, write a disclosure ("#ad" or "paid link") in the Pin. Third parties say the word "affiliate" alone isn't enough ([Sirency](https://www.sirency.com/blog/pinterest-affiliate-links-rules)).
- **AI images.** Pinterest labels images it detects as AI-made. Users can choose "see fewer AI Pins," per category or per Pin ([Newsroom, 2025-04](https://newsroom.pinterest.com/news/introducing-gen-ai-labels); [Help](https://help.pinterest.com/en/article/see-fewer-ai-pins)). Real app screenshots avoid this.

## Tactics ranked by expected customers
Each tactic lists its evidence and how strong it is: official, vendor, self-reported, anecdotal, controlled, or none.

1. **How-to / tutorial Pins linking to a matching tool page.** Examples: "Boost FPS on Windows 11 in 3 steps" linking to the Tweaker page; "Free up 20GB on Windows" linking to the Cleaner page.
   - Matches unbranded search intent and the growing tech searches. Evidence: official, self-reported.
   - Nobody measures conversion. Evidence: none.
   - This is the best bet because it reaches people at the moment they have the problem.
2. **Many fresh designs per URL instead of reposting.** A study of 1M+ Pins from 17k accounts found that a new image on an already-used URL kept about 64% of distribution after the 11th-25th reuse. The same image with changed text kept only about 11%. Fresh Pins usually get no impressions for the first few days, and about 20% still had none after a week. Judge Pins over 2-3 months. ([Tailwind benchmark, 2025-03-27](https://tailwindapp.com/pinterest-marketing/research/2025-benchmark-study-part-three); evidence: vendor, observational, large sample.)
   - Pinterest community staff prefer "new Pins for the same URL" ([thread](https://community.pinterest.biz/t/how-often-can-you-reuse-the-same-url-with-a-fresh-pin-on-a-different-board/35245)).
   - No official per-day cap exists. Tailwind suggests at least 7 days between Pins that share a URL (vendor).
3. **Landing page that matches the Pin.** Use the same headline and screenshot, the steps shown on the Pin, one download button, and a "On your phone? Send the link to your PC" option (email or copy link).
   - Ad rules require consistent destinations. Evidence: official.
   - The phone-to-PC handoff is my inference from the device data. Nothing has tested its effect.
4. **Before/after and "vs paid tools" Pins.** Examples: FPS before/after; "Krypt Cleaner vs CCleaner Pro ($X/yr, source)."
   - No Pinterest-specific data. Evidence: none.
   - Claims must be accurate: Pinterest bans "deceptive or exaggerated claims." Use the versus style with sourced prices.
5. **Video Pins with a link.** Reuse the reels; every Pin has supported links since 2023 ([Pinterest Newsroom, 2023-05-11](https://newsroom.pinterest.com/news/introducing-an-easier-way-to-create-and-inspire-on-pinterest/); [Pinterest Business, 2023-08-25](https://create.pinterest.com/en-gb/blog/new-pin-format-update)).
   - No data on outbound click rate for video versus static. Evidence: none.
   - Cheap to test, since the clips already exist.
6. **Infographic / cheat-sheet Pins.** Examples: "Windows services safe to disable," "pro crosshair codes."
   - These likely earn saves, and saves correlate with distribution (Tailwind, vendor).
   - But the Pin answers the question on Pinterest, so it may get fewer clicks. Forum users suspect Pinterest now favors content that keeps people on the platform (anecdotal).
   - Always leave the last step on the site ("full list + one-click tool").
7. **Claimed website + article Rich Pins.** This is one-time setup.
   - Claiming adds attribution, your profile picture on Pins saved from krypt.cc, a follow button and site analytics ([Help: claim your website](https://help.pinterest.com/en/business/article/claim-your-website)). Evidence: official.
   - Article Rich Pins need Open Graph or Schema markup. Listicles and image-heavy pages don't qualify ([Help: Rich Pins](https://help.pinterest.com/en/business/article/rich-pins)).
   - Small direct effect, but it helps trust.
8. **Boards as a catalog.** One board per tool or problem: "Windows Speed Tweaks," "Gaming Crosshairs," "Free Video Editing," "Macros," "AI Trading Explained."
   - No data. Evidence: none.
   - It's mainly organization and keywords.
9. **Affiliate Pins (ElevenLabs etc.).** Allowed with disclosure. This brings in revenue, not Krypt customers, so it is low priority.
10. **AI trading bot Pins.** Lowest expected customers and highest risk.
    - Possible "wagering" classification, the crypto overlap, and the bans on financial schemes and return promises.
    - Ads are effectively off the table.
    - If you try it at all: a few educational Pins ("AI trades for you, easy": how an AI agent reads markets) linking to a krypt.cc page. No profit numbers, no "free to use," no "open source," no screenshots of P&L. Stop at the first warning.

## Measuring
- **UTMs.** Pinterest automatically adds `utm_source=Pinterest` and `utm_medium=Organic` to organic Pin links. You can turn this off in Business settings > URL parameters for organic content ([Help node 4228](https://help.pinterest.com/en/node/4228); evidence: official). The page doesn't say what happens to UTMs you've already put on a URL.
  - Keep Pinterest's defaults and add your own `utm_campaign=<tool>` and `utm_content=<pin-design-id>`.
  - Check once that your values survive by clicking a live Pin.
  - No shorteners: Pinterest's help says it doesn't allow certain shorteners or redirects.
- **Pinterest analytics, per Pin.** Impressions, saves, Pin clicks, outbound clicks, and outbound click rate (outbound clicks ÷ times the Pin was on screen). Outbound clicks count from the date the link was added ([Help: Pinterest analytics](https://help.pinterest.com/en/business/article/pinterest-analytics)). Help and the API glossary define "Pin clicks" differently, so rely on outbound clicks.
- **Site side.** Count download-button clicks and completed downloads per `utm_content`. That is the real customer metric.
- **Conversion tag (note only).** The Pinterest Tag plus the Conversions API, with Conversion Insights for organic last-touch attribution. Numbers won't match GA ([Help: Conversion Insights](https://help.pinterest.com/business/article/conversion-insights); [Dev docs](https://developers.pinterest.com/docs/api-features/pinterest-tag/)).

## "Push product" playbook

**Funnel**
1. Pinterest search
2. Tutorial, before/after or comparison Pin: 2:3 at 1000x1500, keyword in the first 40 characters of the title, real screenshots ([Pinterest creative best practices](https://business.pinterest.com/creative-best-practices/)).
3. A matching krypt.cc tool or how-to page: claimed site, article markup, steps written out, one download button, and a "send to my PC" option for phone visitors.
4. Download.
5. Optional: Discord, or follow Krypt on other platforms.

**Daily** (my suggestion; there is no official cap)
- 3-5 new Pins, each a fresh image.
- Rotate across the 5 tools so no URL gets a new Pin more often than about weekly.
- Every Pin links straight to its page with UTMs, and gets a human-sounding title and description.
- The user approves each Pin before it goes live.
- No mass follows or comments.

**Weekly**
- Review outbound clicks, saves and outbound click rate per design. Wait 4+ weeks before judging any Pin.
- Make new designs for the URLs that are winning.
- Add one new tutorial page or blog post for a rising search (check trends.pinterest.com).
- Watch for blocked links or warnings.

**Monthly measure**
- Downloads by `utm_campaign` and `utm_content`, against the hours and tokens spent.
- If one tool's page earns under ~10 downloads a month after 3 months, cut that tool's Pin count. This threshold is a judgment call, not data.

**Main risks for an AI agent**
1. **Unapproved automation, the biggest risk.** A browser-driving agent that posts on its own conflicts with the Community and Developer Guidelines. Turn Marketo's per-Pin approval switch on for Pinterest (it is off by default), or post through the official API with each Pin chosen by the user.
2. **Gambling and crypto classification** of the bot content, which could get Pins limited or the account restricted.
3. **Link blocks.** From shorteners or redirects, from repetitive same-URL posting, and possibly from flags on unsigned downloads (unverified).
4. **AI-image labels** and users choosing "see fewer AI Pins." Prefer real screenshots and footage.
5. **Platform-wide traffic swings in 2026** (anecdotal). Don't make Pinterest the main channel.
6. **Overstated claims.** Any FPS or speed number has to be measured and reproducible, and the bots never get profit claims.

All pages accessed 2026-11-20. No files were modified.

---

## Pinterest: limits, warm-up and restriction risks for a new business account run by an AI agent in Chrome (as of 2026-11-20)

Labels: **[O]** official (Pinterest Help Center, Guidelines, Terms or developer docs), **[S]** reported by several independent sources, **[A]** anecdotal (one forum post or a vendor claim).

### 0. Read this first: browser automation breaks Pinterest's rules
- **[O]** The Community Guidelines' spam section says: "Don't use automation that hasn't been explicitly approved by Pinterest." It also bans "buying or selling engagement", improperly influencing "distribution, clicks, or other metrics", repetitive content, and redirects or shorteners used for spam. https://policy.pinterest.com/en/community-guidelines (read 2026-11-20)
- **[O]** The Terms of Service (effective 12 Nov 2026) ban accessing Pinterest "by using automated means (without our express prior permission)". https://policy.pinterest.com/en/terms-of-service
- **[O]** The Developer Guidelines (page dated © 2026) apply to API apps. They forbid features that let users "automatically initiate actions without specifically considering each action", and name following and unfollowing, messages and comments. For scheduling, "the end user must choose each Pin", and for follows, "the end user must choose each account to follow". https://policy.pinterest.com/en/developer-guidelines
- An agent working the website in a real Chrome browser is not an approved route. Detection risk is about behaviour, but the rules risk exists whatever the volume. If the user approves each Pin, the agent's Pin publishing would come closest to the developer rules. AI-chosen follows, comments and messages are the riskiest actions under the rules.

### 1. Known limits
| Item | Status |
|---|---|
| **2,000 boards / 200,000 Pins / 50,000 follows** | **[S]** These are the figures people know and repeat (SEJ, LilachBullock, a moderator reply on community.pinterest.biz/t/total-pin-limit-200-000/19528). The current Help Center article no longer gives numbers. It says there is a board cap and a follow cap, and "There's no limit to how many Pins you can create" **[O]** https://help.pinterest.com/en/article/limits-for-pins-boards-and-follows (read 2026-11-20). Treat 2,000 boards as the safe ceiling. |
| Pins, saves, follows, comments or messages per day | **[O]** No numbers are published. "Rate limit blocks" are triggered when you "Log in a lot", "Comment on Pins very quickly", "Post the same comment many times", "Follow a lot of people in a short period of time", or "Add or save a lot of Pins from the same website quickly". "Most limits are removed automatically within 24 hours." https://help.pinterest.com/en/article/rate-limit-blocks |
| "You've hit your limit" | **[O]** For storage caps, the fix is to delete Pins or boards or to unfollow. I could not find the exact wording quoted officially. |
| "Suspended for spam" | **[O]** The account shows "a suspension notice when you try to log in". You appeal through the Contact us form, and Pinterest says "we'll take a look at it and get back to you", with no timeline given. https://help.pinterest.com/en-gb/article/account-suspension. **[S]** Many 2025-26 threads report automated rejections and multiple failed appeals. There was a mass false-suspension wave in Apr-May 2025 that Pinterest acknowledged (IBTimes, SocialMediaToday). |
| "We blocked this link" / "may redirect to spam" | **[O]** "We sometimes block links that redirect"; "we don't allow certain redirects or URL shorteners"; link directly to the source. You can edit the link only on Pins you created. https://help.pinterest.com/article/fix-a-broken-link. **[S]** Appeals go through the Help Center, and many go unanswered. |
| **API v5 rate limits** | **[O]** `org_write` covers creating, editing or deleting Pins, boards and sections: Trial 300 per day per app, Standard 100 per minute per user per app. `org_read` is 1,000 for both. Universal cap: Standard 100 per second. "Subject to change without notice." https://developers.pinterest.com/docs/reference/rate-limits.md |
| Is the API a sensible route? | **[O]** On Trial access, Pins and boards are "visible only to you" (sandbox). Standard access needs an OAuth demo video and review, and is denied to apps that collect credentials or cookies. https://developers.pinterest.com/docs/key-concepts/access-tiers/. **Verdict:** this is the only approved way to publish Pins, and it suits a downloadable product only if one approved Krypt app does OAuth for every install. The API has no route for comments or messages. The hours-to-days review and the user-picks-each-Pin rule are the costs. |
| Tailwind | **[A, vendor's own claim]** It calls itself an official partner since 2012 and says it publishes "through Pinterest's approved API". https://support.tailwindapp.com/en/articles/1577657-is-tailwind-an-official-pinterest-partner. I did not find this in a Pinterest partner directory. |

### 2. What gets new accounts suspended
- **Links to a new domain on the first Pins [S]:** threads such as "Pinterest Blocks Domain on 1st Pin" (7 Sep 2025; no staff answer and the appeal was auto-rejected) and "Domain blocked as spam since first Pin". There are June 2026 reports of new business accounts suspended with almost no activity. https://community.pinterest.biz/t/pinterest-blocks-domain-on-1st-pin/39035
- **Many Pins or saves from one domain quickly [O]**, as listed on the rate-limit page.
- **Shorteners and redirects [O]:** listed in the Guidelines and the broken-link article. Affiliate redirects count too.
- **Same link, image or caption repeated [S]:** ContentStudio docs, Tailwind ("fresh Pins"; save each Pin to 10 or fewer boards, several days apart). The Guidelines ban "repetitive" content **[O]**.
- **Mass following [O]**, and **the same comment repeated [O]**.
- **Logging in a lot or switching accounts [O]** (the rate-limit page lists "log in a lot"), plus **[S]** ContentStudio.
- **VPN, IP changes or a shared IP across accounts [A]:** Pinterest community posts, a Make.com forum reply and AdsPower, a vendor of anti-detect browser profiles. There is no official statement. A sticky proxy is better than a rotating one.
- **AI images [O, but not a ban]:** Pinterest adds "AI modified" labels (detected from metadata or classifiers) and gives users "see fewer" controls (Apr 2025, extended Oct and Dec 2025). https://newsroom.pinterest.com/en-ca/news/pinterest-rolls-out-new-tools-to-give-users-more-control-over-gen-ai-content/. Expect less reach, not suspension. The idea that "AI content leads to bans" is **[A]**.
- **Claiming a website [O]:** done via a meta tag, HTML file or DNS TXT record, takes about 24h, and a site can be claimed by only one account. https://help.pinterest.com/en/business/article/claim-your-website. That claiming protects you from link blocks is **[A]** (Pin Generator recommends doing it on day 1).
- **Checking status [O]:** the only official signal is the notice at login, plus emails. There is no status page. The agent should open pinterest.com each session and look for a suspension or block banner, and check the email inbox.

### 3. Does a warm-up help?
Pinterest publishes no warm-up guidance. Vendors and forums agree **[S]** that new accounts are judged more strictly, so a slow start with no links is advised. Pin Generator's month-1 plan: days 1-3, 1 image Pin a day with no link and 2-3 saves; days 4-7, 1-2 Pins and 3-5 saves; links only after week 1 (https://pingenerator.com/pinterest-growth-plan/month-1). Tailwind suggests 3-5 fresh Pins per week for new accounts and 1-5 a day once established, replacing the old 15-25 a day advice (https://support.tailwindapp.com/en/articles/15621722). ContentStudio puts 5-15 a day as "generally safe" depending on account age.

**7-day plan for a new business account:**
- **D1:** finish the profile (name, photo, short bio with no link yet), pick the business type, claim the website (meta tag), and create 3-5 niche boards with plain names. Save 5-8 Pins from many different domains and follow 2-3 accounts. Post nothing of your own.
- **D2-3:** browse and search for 15-20 min. Save 8-10 Pins from varied domains and react to 3-5. Make 1 own Pin a day with **no link**, image or short video.
- **D4-5:** after the site claim is confirmed, add 1 Pin a day with a direct, claimed-domain link (no shortener or redirect, no affiliate link). Save 10-12 Pins and follow 3-5 accounts.
- **D6-7:** 1-2 own Pins a day (at most 1 link to your own domain), 10-15 saves, 1-2 new boards, follows 5 or fewer, 0-1 comment.
- **Week 2+:** raise own Pins by about 1 a day each week, up to 3-5.

**Already-active account:** keep its current pace, raise by 25% or less a week, and do not add a new link domain and a volume jump in the same week.

**Do the app defaults fit?** The day 1-3 lurk numbers are close: 20 min, 5 reactions, 10 saves, 3 follows and 0 comments fit. Two changes are needed:
1. **The 1 post a day on days 1-3 should carry no link.** Links go in only after the site claim is confirmed, from about day 4. Otherwise the post is the main day-1 risk.
2. **The 2-week ramp is fine, but the cap for own Pins should be far lower than on IG or X** (about 5 a day by week 3). Pinterest rewards fresh Pins, not volume.

Saves should always come from varied domains, never mostly Krypt's.

### 4. Safe daily volumes (unofficial, my synthesis of [S] and [A] sources)
| Account age | Own Pins | of which with link | Saves of others | New boards | Follows | Comments | Messages |
|---|---|---|---|---|---|---|---|
| Days 1-3 | 0-1 | 0 | 5-10 | 3-5 (D1), then 0-1 | 2-3 | 0 | 0 |
| Days 4-7 | 1-2 | 1 | 10-15 | 0-2 | 3-5 | 0-1 | 0 |
| Weeks 2-4 | 2-3 | 1-2 | 10-20 | 0-1 | 5-10 | 1-3 | 0-1 (replies only) |
| Month 2-3 | 3-5 | 2-3 | 15-25 | 0-1 | 10-15 | 3-5 | 1-3 |
| Established (3 months+) | 5-10 (15 max) | up to about half | 20-30 | as needed (stay under 2,000 total) | 15-25 | 5-10 | 3-5 (replies) |

Space actions out with randomised gaps, at least 30-60 min between own Pins. **[A]** There is one report of 72 posts a day via an automated Make.com scenario with no block (Make community, 11 Jul 2025), but it is an outlier and do not copy it.

### 5. Hard rules for an AI agent on Pinterest in a browser
1. **Links:** link only to the claimed domain, directly. No shorteners, redirects, cloakers or affiliate redirect links. Never link on day 1-3 Pins.
2. **Fresh content:** every own Pin uses a new image or video. No identical title or description twice. Save one Pin to 10 or fewer boards, days apart.
3. **Domain share:** 30% or less of daily saves and Pins point to any one domain, Krypt's own included. Mix in saves from many other domains.
4. **Comments:** never post the same comment twice, and use no templates. Comments come only after week 1, are short and human, and the agent never comments fast (several minutes apart).
5. **Follows and messages:** follow only accounts relevant to the niche, never in bursts, and never unfollow in bulk. No unsolicited DMs: only reply to messages received.
6. **One identity:** one Chrome profile and one sticky IP per account. No VPN hopping, no logging in and out repeatedly, and no shared IP with other Pinterest accounts.
7. **Stop on any signal:** on a block, "hit a limit", a link block or a suspension notice, stop every Pinterest action for 24-48h and report to the user. Never retry the same action in a loop. Appeals are the user's to send, not the agent's.
8. **Check status at session start:** look for the login notice or banners and recent Pinterest emails. Log the result.
9. **AI images:** do not hide AI origin or strip metadata. Expect the "AI modified" label, and prefer real footage or screenshots of the tools.
10. **Engagement:** do not buy or swap engagement, run follow-for-follow, or coordinate engagement between the user's installs. The Guidelines ban "improperly influencing" metrics. Krypt-follow and visit features are the highest-rules-risk pattern on this platform.

### Key takeaways for Marketo
- **Rules risk:** Pinterest bans unapproved automation outright, so browser control always carries rules risk. The only approved way to publish is the API with OAuth, where the user picks each Pin and the app passes Standard review.
- **Main ban trigger for new accounts:** a link to a new or unclaimed domain on the first Pins. Claim the site on day 1 and keep links off until about day 4.
- **Limit numbers:** the 2,000-board, 200,000-Pin and 50,000-follow figures are folklore now. The current Help Center gives no numbers and says Pins are unlimited.
- **App defaults:** they fit if the day 1-3 post has no link and own Pins stay at about 5 a day or fewer for the first months.

---

## Pinterest tech niche research (as of 2026-11-20)

**How I checked:** Follower counts, pin counts and last-pin dates come from each public profile page, fetched 2026-11-20. That data is reliable. Recent pin titles come from each profile's public RSS feed (`/username/feed.rss`). Save counts come from public pin pages. Saves are added up across every repin, so they are only roughly comparable.

**What I could not verify:** Monthly views. They are not in the logged-out page data. One attempt to call Pinterest's internal API was blocked by the permission system, and I did not try again. Pinterest search and Pinterest Trends only load when signed in or need JavaScript, so I could not get keyword volumes either. No files were modified.

### Accounts

1. **MakeUseOf** – pinterest.com/muo_official – Windows, PC, apps and productivity. 357,215 followers, 45,558 pins, pins daily. Every article gets a pin that uses its headline as the title (e.g. "Windows 11 26H2 is rolling out automatically…", "The best way to use Android apps on PC is with Phone Link"). These link to makeuseof.com. Its "Productivity Tips & Tutorials" board holds 3,077 pins. New pins show about 1 save.
2. **PCMag** – pinterest.com/pcmag – PC how-tos and reviews. 632,870 followers. Has a keyword board called "Windows 11 Tips". Sample pin: "Keep It Tidy: How to Use Snap Layouts in Windows 11", 67 saves, linking to a pcmag.com how-to. It now also posts gaming memes and video.
3. **Gridfiti** – pinterest.com/gridfiti – desk setups, wallpapers, useful websites, Notion/GoodNotes. 21,691 followers. Its board "100 Best Home Office Ideas" alone has 20,429 followers. It posted 3 or more different pins for one listicle within a minute ("The 22 Best Whimsical Websites to Explore", 20 Nov 2026), all linking to gridfiti.com. This is the closest match to the user's mix.
4. **Kreafolk** – pinterest.com/kreafolk – design and desk setups. 19,761 followers. Its pin "30 Best Aesthetic Desk Setup Ideas You Should Check" has 6,674 saves and links to a kreafolk.com listicle.
5. **Minimal Desk Setups** – pinterest.com/minimaldesksetups – desk setup photos. 15,213 followers, but nothing pinned since Apr 2025. "Our Desk Setup Guide for 2023" has 69 saves and links to YouTube.
6. **Lifehacker** – pinterest.com/lifehacker – tips plus tech deals. 162,924 followers, 75,704 pins, pins daily. Headline pins link to lifehacker.com, and deals posts go through affiliate links.
7. **Canva** – pinterest.com/canva – a software company using Pinterest. 826,569 followers, 160,284 pins, verified, active daily. Mostly template pins.
8. **HubSpot** – pinterest.com/hubspot – a software company. 65,511 followers, last pin Jun 2024. Posted "free Google Sheets templates" pins linking to hubspot.com.
9. **View My Gadget** – pinterest.com/viewmygadget – only 809 followers. Its pin "3 Crazy Useful WindowsTricks" has **5,590 saves**. It was uploaded as a video-style post with no link (Sep 2024). Example: https://www.pinterest.com/pin/745486544602416343/
10. **Indish Tools** – pinterest.com/indishmarketer – 2,719 followers. "3 Websites to Make Your Life Easier" has 651 saves, also uploaded with no link.
11. **Keyboard Shortcut Keys** – pinterest.com/keyboardshortcutkeys – 7,624 followers. Text-heavy shortcut cheat sheets that link to a blogspot site. It also mixes in "earn money" pins and an "account for sale" pin.
12. **TechLog360** – pinterest.com/techlog360 – 2,688 followers. "Best Safe Websites for Downloading Free Software for Windows" has 118 saves and links to techlog360.com.
13. **AskVG** (Microsoft MVP) – pinterest.com/askvg – Windows tweaks and news. Only 268 followers after 525 pins. It mostly posts news ("Remote Lock in Windows 11", which links to X).

**Trading bots and prediction markets:** Almost nothing legitimate turned up.
- No real prediction-market account: the usernames "polymarket" and "kalshi" belong to empty, unrelated personal accounts.
- ClickAlgo (cTrader tools) has 362 followers. Binoption (binary options) has 701.
- The "tradingview" username is not TradingView. Its bio reads "double your $200 investment everyday" and it links through bit.ly.
- The "tradingsetup" account claims "nice profits within the first 20 mins", also through bit.ly.
- Pins with titles like "Quiron Luxora Reviews" are the typical trading-bot scam pattern.

Big brands mostly let their accounts go quiet: How-To Geek has 7,664 followers and 1 pin, Softpedia's last pin was in 2015, and most hardware brand usernames are squatted.

### Patterns across the winners

1. **Titles match search phrases.** Pin titles start with the same words as Pinterest's own topic pages ("Windows Keyboard Shortcuts Cheat Sheets", "Small Gaming Pc Setup").
2. **Numbered lists win.** "3 Crazy Useful Windows Tricks", "30 Aesthetic Desk Setups", "22 Best Whimsical Websites", "10 Cool Websites You Need to Know".
3. **Reference material gets saved for years.** Cheat sheets and charts keep collecting saves; shortcut charts from 2016–2024 still rank.
4. **Desk setups sell on the photo**, with style words in the title: aesthetic, minimal, cozy, small, bedroom, wood.
5. **Several fresh pins per link.** Gridfiti and MUO post multiple pins for one URL, each with a different image.
6. **Evergreen beats news.** AskVG's news pins and MUO's headline pins get about 1 save each; old how-tos keep working.
7. **Boards are named after keywords** ("Windows 11 Tips", "100 Best Home Office Ideas").
8. **Followers matter little.** An 809-follower account has a 5,590-save pin.
9. **Saves and clicks pull against each other.** Uploads without a link collect the most saves but send no traffic. Linked listicles bring the clicks.
10. **Stopping posting stalls the account** (Minimal Desk Setups, HubSpot).

### Keywords

Pinterest has its own topic pages for these phrases, which is evidence that people search them:
- windows 11 tips and tricks
- windows keyboard shortcut(s) cheat sheets
- pc keyboard shortcuts
- laptop hacks tips windows
- computer repair tips and tricks
- pc gaming room ideas
- small gaming pc setup
- pc gaming setup in bedroom
- work desk setup ideas
- productive desk setup aesthetic
- awesome websites
- good websites
- productivity tools
- daily productivity app recommendations

Related tags seen on tech pins: "best software for pc", "free software alternatives", "best security tools for windows", "useful websites for students", "laptop hack", "wood pc setup". Pinterest UK runs an official "rate my gaming setup" board.

I found no topic page for "ai tools", and the AI-tool accounts I found are all small. Search volumes for all of these are unverified. One third-party table (pininspect.com) gives "minimalist desk setup 2026" 12.1K, but it looks like sample data.

### What has stalled or gets penalized

- **AI-tool directory farms go nowhere.**
  - Toolsainet: 8 followers, near-identical repeated pin text (one copy even misspells "Bset").
  - "Free AI tools": 1,165 pins, 6 followers, generated-looking tech "news" pins.
  - AI Tool Mapper: 10 followers. Toolmodo: 37.
- **Pinterest's rules ban the farm tactics.** Its guidelines ban content that is "repetitive, deceptive, or irrelevant in an attempt to make money", "automation that hasn't been explicitly approved", creating accounts "en masse", and redirects to banned sites. **This is directly relevant to the hub: it posts automatically.**
- **Money claims are banned.** The guidelines also ban "exploitative financial or investment schemes promising unrealistic returns".
- **AI images get labelled.** Pinterest labels AI-made images, and since 2025 users can choose to see fewer of them in some categories.
- **New ad rules (effective 12 Nov 2026).** They list most crypto as a "predatory financial product", add a scams section that includes get-rich-quick schemes, and ban "tools or templates intended to facilitate, automate or scale scams". That last one could be applied to trading bots; ppc.land doesn't mention bots, so this is my inference.
- **Patterns that come with scams:** link shorteners, "Reviews" brand pins, and accounts that mix in "earn money" or "account for sale" pins.

### 10 Pin titles + text overlays

1. Windows 11 Gaming Settings: 7 to Check First — overlay: "7 settings gamers change first"
2. Windows 11 Keyboard Shortcuts Cheat Sheet — overlay: "20 shortcuts. One screen."
3. Free PC Cleaner for Windows: Clear Temp Files — overlay: "Temp files gone in one click"
4. Windows 11 Startup Apps: How to Turn Them Off — overlay: "Startup apps → off"
5. Useful Windows Apps: 5 Free Tools for a Tidy PC — overlay: "5 free tools for a tidy PC"
6. Gaming PC Setup Checklist: Windows + Free Tools — overlay: "Before your first game"
7. AI Trading Bot for Prediction Markets, Explained — overlay: "AI places the trades. You set the limits."
8. Polymarket Bot: Paper Mode vs Live Mode — overlay: "Practice in paper mode first"
9. Prediction Market Bot Setup in 3 Steps — overlay: "Connect → set limits → AI trades"
10. AI Tools for Prediction Markets: Rules You Set — overlay: "Your rules. AI does the clicking."

### 10 Pin descriptions

1. Windows 11 gaming settings worth checking: Game Mode, graphics preference, startup apps and more. Save this checklist for your next PC setup.
2. Windows keyboard shortcuts cheat sheet for Windows 11. Snap layouts, screenshots, virtual desktops and clipboard history in one chart.
3. Free PC cleaner for Windows that clears temp files and leftover junk in one click. Built for Windows 10 and 11.
4. How to turn off startup apps in Windows 11, step by step, plus a free tool that lists them all in one place.
5. Useful Windows apps for a cleaner desktop: tweaker, cleaner and more, all free for Windows 10 and 11. Links on the site.
6. Gaming PC setup checklist covering Windows settings, drivers and free tools to run after a fresh install.
7. AI trading bot for prediction markets: you pick the markets and the limits, the AI places the trades. Here is how it works.
8. Polymarket bot explained: try it in paper mode with no real money, then decide if you want live mode. You approve live orders.
9. Prediction market bot setup in 3 steps: connect your account, set your daily limits, let the AI trade. Trading carries risk.
10. AI tools for prediction markets: write standing rules, set caps, and review every trade in the history tab.

**Before posting, check two things:**
- **Descriptions 7–10 assume the bot works this way.** They say the user sets daily limits, can run in paper mode with no real money, and approves live orders. I took those from the PolyBot connection's own description, not from the product, so check they hold for the tool being promoted.
- **"Free" for the Windows tools.** Your memory note bans "free to use" for all reel content, not just the bots. I kept plain "free" for the Windows tools and never used "free", "free to use" or "open source" for the bots. Drop "free" from the Windows pins too if your rule covers it.

### Sources

- Profiles: https://www.pinterest.com/muo_official/ · /pcmag/ · /gridfiti/ · /kreafolk/ · /minimaldesksetups/ · /lifehacker/ · /canva/ · /hubspot/ · /viewmygadget/ · /indishmarketer/ · /keyboardshortcutkeys/ · /techlog360/ · /askvg/ · /clickalgo/ · /binoption_net/ · /tradingview/ · /tradingsetup/ · /toolsainet/ · /aitoolsfree/ (all on pinterest.com)
- Pins:
  - https://www.pinterest.com/pin/214343263507439793/
  - https://www.pinterest.com/pin/89157267620743050/
  - https://www.pinterest.com/pin/737112664042837292/
  - https://www.pinterest.com/pin/646407352804078519/
  - https://www.pinterest.com/pin/1136033074774638485/
- Topic pages:
  - https://www.pinterest.com/ideas/windows-keyboard-shortcuts-cheat-sheets/934618015575/
  - https://www.pinterest.com/ideas/small-gaming-pc-setup/943854373011/
  - https://www.pinterest.com/ideas/awesome-websites/923576399335/
- Pinterest rules and policy:
  - https://policy.pinterest.com/en/community-guidelines
  - https://newsroom.pinterest.com/news/introducing-gen-ai-labels
  - https://techcrunch.com/2025/04/30/pinterest-launches-new-tools-to-fight-ai-slop
  - https://ppc.land/pinterest-bans-binary-options-ads-under-new-scam-and-deception-rules/
- Keyword volumes (weak): https://pininspect.com/blog/pinterest-trends-2026
