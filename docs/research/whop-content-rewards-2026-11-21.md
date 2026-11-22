# Whop "Content Rewards": research for auto-submitting Marketo reels (2026-11-21)

Research only: nothing was signed into, downloaded or changed. Items marked **(inferred)** are my conclusions, not something a source says. Sources are linked inline and listed at the end.

## 0. The headline: it is not really "Whop" any more

- Content Rewards **started on Whop in late 2024**. Its operator set up **Content Rewards Inc.** (Delaware, 5 June 2025, based in Beverly Hills) and launched **its own app at contentrewards.com in August 2026**. Campaigns, submissions, view counting, fraud checks and reviews now run there. **Whop only processes payouts** (withdrawals, KYC). ([About](https://contentrewards.com/about), [Is Content Rewards part of Whop?](https://contentrewards.com/articles/is-content-rewards-part-of-whop), [Creator Terms §3](https://contentrewards.com/terms))
- Content Rewards says it "can still be used inside Whop", but contentrewards.com is the recommended route. Campaigns from the old Whop-hosted version keep running on their old terms (the legacy Clippers Terms and a 7% fee). **Connected social accounts did not carry over** to the new app. ([previous-version article](https://help.contentrewards.com/en/articles/16829642-what-happened-to-your-previous-version-submissions-and-payouts))
- Most blog posts about "Whop Content Rewards" (Opus, Postiz, Sirency and others) describe the **old Whop-hosted version**. Where they conflict with contentrewards.com, this report follows contentrewards.com and its help centre, help.contentrewards.com.
- **For Marketo, the thing to integrate with is contentrewards.com**, with Whop as the payout wallet behind it.

## 1. How it works today

### Campaigns (brand side)
- Brands and agencies fund campaigns. There are 4 campaign types: **clipping** (cut clips from the brand's long videos), **sound** (use a named song), **logo** (show a logo) and **UGC** (film your own product video). ([What is Content Rewards](https://contentrewards.com/articles/what-is-content-rewards))
- There are 4 pay models: **CPM** (pay per 1,000 views, with a minimum and a maximum per clip), **per post** (a flat amount per approved post that reaches minimum views), **retainer** (a set amount per cycle) and **pool** (the budget is split by views at the end).
- Visibility is **public** (join instantly), **application only** (the brand approves creators first) or **private** (invite only).
- **The minimum budget is $1,000.** There is no subscription. After launch the model, platforms, access type and budget are locked; you can only top up. ([Create a campaign](https://help.contentrewards.com/en/articles/16822142), [Pricing](https://contentrewards.com/pricing))
- The site reported 740 live campaigns on 18 Nov 2026, "$18M+ paid out" and "600k+ creators who have posted". These are the company's own figures.

### Creator (clipper) side: the submit flow
From [How Content Rewards works](https://help.contentrewards.com/en/articles/15319790-how-content-rewards-works), [Find and apply](https://help.contentrewards.com/en/articles/16817237) and [Submit a video](https://help.contentrewards.com/en/articles/15319814-submit-a-video):
1. **Connect accounts**: Settings > Connected accounts > Connect account > pick the platform.
   - TikTok, Instagram, YouTube and X connect by OAuth sign-in. Instagram must be a **Business** account (the help article says "only connects Instagram Business accounts"; Terms §14.1 says "Professional/Business or Creator", so the two conflict). For YouTube, keep every Google permission box checked.
   - **Facebook connects with a code**: post a **public** Facebook Reel with the code in its caption, paste the Reel link, then press Verify.
   - Access is read-only: "We do not post on your behalf" (Terms §14.2). Accounts linked in Whop's settings **do not count**. ([Connect your social accounts](https://help.contentrewards.com/en/articles/16746780))
2. **Discover**: search, or filter by platform, model and category. Each card shows the accepted platforms and the budget left. The campaign page shows the rate, minimum, maximum, brief and requirements.
3. **Join Campaign** puts you in at once. **Apply** opens a short form instead: pick the account you will post from, say why you fit and answer the brand's questions. The button then reads "Application pending", then either "Submit clip" or "Not eligible". You need at least one connected, verified account, or the Apply button stays grey.
4. **Post the video on your own connected account**, following the brief.
5. **Submit within 30 minutes of posting**: open the campaign > **Submit clip** > paste the post link into "Submit video link" (Share-button short links work, and you can paste several links one per line) > tick "I've read the requirements and accept that non-compliant submissions may be auto-rejected" > **Submit clip**.
6. Three checks run when you submit, and a failed check turns red: **posted from one of your linked accounts**, **not already submitted anywhere** ("a post can only be submitted once, ever, to any campaign") and **posted within the last 30 minutes**. The post must also be public.
7. The clip then appears under **Submissions > Pending**. "Nothing is approved automatically."
- Some campaigns use **pre-approval drafts**: you send a draft first, and its status moves through Needs changes, Pending, Approved, Posted or Rejected.

### Platforms
- The marketing pages say **TikTok, Instagram and YouTube**. The connect article also covers **X** and **Facebook** (by code). Each campaign picks the platforms it accepts.
- **Threads and Pinterest are not mentioned anywhere (inferred: not supported).**
- The old Whop version listed TikTok, Reels, Shorts and X. ([Opus](https://www.opus.pro/blog/whop-content-rewards))

### Review and approval
- **The brand, or its campaign manager, reviews every clip.** Content Rewards does not approve clips.
- A clip only gets a review deadline once it reaches the payout threshold. Brands are asked to review **within 72 h** of that. If a clip stays Pending for more than 7 days, Content Rewards *may* step in, but it does not promise to. ([Org Terms §6](https://contentrewards.com/brands-terms), [Review submissions](https://help.contentrewards.com/en/articles/16822143-review-submissions))
- Rejecting a clip needs a typed reason, and the reason must rest on the **written requirements**. "A rule not written here isn't a valid reason to reject."
- You can appeal a rejection once ("Start appeal"); the decision usually takes 2 to 7 days. **Rejections by Verified agencies are final.** ([Approval and review](https://help.contentrewards.com/en/articles/15319801-approval-and-review))
- A rejected post can never be submitted again, to any campaign (§7.11).

### How views are counted and verified
- Content Rewards **reads the platform's public view count on a schedule**, so its numbers lag the platform's. Views count **from the moment you submit**, not from when you posted. ([View count article](https://help.contentrewards.com/en/articles/16829638-why-your-view-count-does-not-match-ours))
- On CPM campaigns, a clip **earns for up to 30 days after submission**, paid in rounds of 7 days of earning, then a 3-day hold, then settlement (about every 10 days). Clips sent before 25 Sep 2026 used the old rule of 7 days after approval.
- Every clip gets a **Bot Score (0–100)**, produced with a third-party fraud provider. A high score flags the clip automatically and freezes its payout for a person to review. The score never approves or rejects a clip by itself (Terms §9).
- If a post goes private or is deleted, views it already earned still count. Counting resumes if it comes back.

### Money
- **Rates.** Brands set them. The typical rate is about **$1 per 1k views**: the site reports a median of $1.0875 across 707 live campaigns on 10 Nov 2026 ([payouts explained](https://contentrewards.com/articles/clipping-payouts-explained)). Typical range is $0.50–$3 for clipping and $2+ for UGC. ([Opus](https://www.opus.pro/blog/whop-content-rewards))
- **Minimum per clip.** Set by the brand. A clip earns nothing until it reaches the minimum; for example, a $2 minimum at a $1 rate means 2,000 views.
- **Maximum per clip.** Set by the brand. **$200 is typical.**
- **Creator fee: 10%** on CPM and pool campaigns. Per-post and retainer campaigns charge 10% under a $5k budget and 0% at $5k or more. Legacy campaigns charge 7%. ([Terms §5](https://contentrewards.com/terms))
- **Withdrawals.** Content Rewards balance to Whop balance is free and starts at $1. Whop balance to bank, PayPal or wallet uses Whop's fees and timing: standard payouts take up to 5 business days; instant payouts are faster and cost a fee. KYC is done by Whop.
- **Per-post timing.** These campaigns settle about 15–30 minutes after approval.
- **Brand fees.** Brands pay a **10% platform fee** (8% if Verified) on approved work only, plus Whop's payment-processing fee at funding. Unspent budget is refundable to the Content Rewards balance, minus **up to a 20% refund fee**; the processing fee is not refunded. ([Org Terms §4, §10](https://contentrewards.com/brands-terms))
- **Clawbacks.** A payout that has not settled can be reversed if the clip is later rejected. A settled payout is not reversed, except that losses from confirmed fraud can be offset against your balance (§11, §13.4).

## 2. Requirements and rules

### Who can join
- You must be **18 or older**. **One Content Rewards account per person** (§2.1, §13.3).
- **No follower or account-age minimum** in the Terms ("no follower count is required"). Individual campaigns can still set their own rules.
- Content Rewards can treat accounts that look related as one person (§9.4). After a ban, it can block every social account linked to the banned account, and can refuse submissions from any social account a banned user has held (§7.14, §13.3).
- Submission throttling: Content Rewards "may pause your new Submissions while too many Submissions are unapproved". This counts every submission ever made from that social account, including by previous holders (§7.14).

### Content rules ([Terms §12](https://contentrewards.com/terms))
- Content must not be illegal, infringing, sexual, harassing, deceptive or "designed to inflate views or engagement". It must also **not break the rules of the platform it is posted on**.
- **No fake engagement**: "You will not buy, generate, or otherwise obtain non-genuine views, likes, followers, or engagement, and you will not coordinate to do so." Doing this means a **permanent ban**, which you can appeal once. A ban also **rejects all pending and approved submissions** (§13.2, §13.5).
- You warrant that you hold the rights to everything in the clip, music included (§17.2). The old Whop terms required "wholly original" content apart from brand-supplied material, and banned duplicate deliverables. ([Whop CR terms](https://whop.com/content-rewards-terms-of-service/))
- **AI content.** There is no platform-wide ban apart from AI sexual imagery of real people. **Individual briefs do ban it**, for example "No AI-made or staged footage", "do not use fake AI Creator accounts" and "AI-generated videos are not allowed". ([AI clipping article](https://contentrewards.com/articles/ai-clipping))
- **Political clips** must be disclosed and **cannot run on TikTok or X**.
- **Licence.** When a brand approves a clip, the creator grants the brand a **perpetual, worldwide, royalty-free, sublicensable licence** to reuse it (Org Terms §12.2).

### Disclosure (FTC)
- Under Terms §12.9 **the creator alone** is responsible for FTC compliance, and for video "**the disclosure must appear at the beginning of the video**". A missing disclosure "may result in rejection and loss of payment". Content Rewards does not check disclosures.
- The [FTC guide](https://contentrewards.com/ftc-compliance) (13 Nov 2026) accepts wording such as "#Ad", "Paid partnership with [Brand]", "Sponsored by [Brand]", "Advertisement" and "I was paid to post this". It does **not** accept #Collab, #Sp, #Spon, just tagging the brand, a disclosure buried in hashtags or at the end of the caption, one behind "more", or one only in the comments or the bio.
- What the guide asks for on each platform:
  - **TikTok**: the commercial content / paid partnership toggle, plus a spoken or on-screen disclosure **in the first 10 s**, plus the caption.
  - **Instagram and Facebook**: the "Paid partnership" label, plus #Ad at the start of the caption. Reels follow the same short-video rules.
  - **YouTube**: the paid-promotion box, plus a spoken disclosure and one in the description.
  - **X**: "#Ad" or "Paid by [Brand]" in the main post text.
- Whop's older [FTC policy](https://whop.com/ftc/) says the same, and adds that remixing a seller's video with your own voiceover is a grey area that should carry #Ad anyway.

### Rejection reasons seen in practice
From [Why clips get rejected](https://contentrewards.com/articles/why-clips-get-rejected) (9 Nov 2026):
- missing a detail from the brief (a tag, handle or link)
- posting from an unlinked account
- submitting after the 30-minute window
- **reusing the same final edit in two campaigns**
- fake-looking views or engagement
- a **missing disclosure**
- co-posting with Instagram Collab without permission
- third-party guides add: a source not on the authorised list, an untracked platform, and a banned editing style ([OpenClip](https://openclip.app/clipping/clipping-campaign-rules))

### Automation, bots and scripts
- **Content Rewards Creator Terms (17 Nov 2026)** contain **no clause banning automated access, scraping, browser automation or third-party submit tools**. I searched for "automated", "scrape", "crawl", "third-party tool" and "credentials". The only bans are on **fake engagement** and on **content "designed to inflate views"**. Content Rewards itself uses automated review (§7.1).
- **Whop's Terms** (10/9/2026, §5) forbid "accessing or monitoring any material or information from the Service using any automated means, including robots, spiders, or scrapers" without written consent. This covers whop.com, which includes withdrawals and any campaigns still hosted on Whop. ([Whop ToS](https://whop.com/tos/)) The old [Whop Content Rewards terms](https://whop.com/content-rewards-terms-of-service/) exclude views "generated by, or suspected to be generated by any bots, script, macro or other automated means".
- **(inferred)** Driving contentrewards.com from a browser extension to submit your own real posts is **not explicitly banned**, but it is not explicitly allowed either. Driving whop.com (withdrawals) by automation would breach Whop's ToS. Content Rewards can change its terms at any time (§23).

## 3. API: Whop has one, Content Rewards does not

### Content Rewards (contentrewards.com)
- **No public API, developer docs, webhooks or integrations were found.** I checked the site, the help centre (collections and changelog), the Terms and the Partner Program Agreement.
- **Submission is web-only**, through the steps in section 1.

### Whop
Whop has a full REST API, SDKs and an MCP server, but **nothing for Content Rewards campaigns or CPM submissions**:
- **Base URL.** `https://api.whop.com/api/v1` (sandbox: `https://sandbox-api.whop.com/api/v1`), with an OpenAPI spec at `/api/v1/openapi.json`. Auth is a Bearer API key or a user OAuth token, with an optional `Api-Version-Date` header.
- **MCP.** Docs MCP at `https://docs.whop.com/mcp`; API MCP at `https://mcp.whop.com/mcp` (or `/sse`); npm package `@whop/mcp`. ([AI and MCP](https://docs.whop.com/developer/guides/ai_and_mcp))
- **Bounties** are Whop's own paid-task product. They are the closest match, but **a different product**:
  - They pay a **fixed reward per accepted submission**, not per view. The escrow must be at least $5 (reward × accepted-submissions limit).
  - `business_goal_type` includes `clipping`, `post_engagement`, `ugc_content`, `owned_account_growth`, `local_activation`, `data_capture` and `other`. ([Run a bounty program](https://docs.whop.com/developer/bounties/run-a-bounty-program.md), [Bounty object](https://docs.whop.com/api-reference/bounties/bounty.md))
  - Bounty endpoints: `GET /bounties`, `GET /bounties/{id}`, `POST /bounties` (key scopes `bounty:create` + `payout:transfer_funds`), `PATCH /bounties/{id}`, `POST /bounties/{id}/cancel`, `GET /bounties/{bounty_id}/submissions`, `GET /bounties/{bounty_id}/submissions/{id}`.
  - Submission endpoints: `POST /bounty_submissions` (**user credential only**, scope `bounty:submission:create`; body `bounty_id` + `deliverable {urls[≤10], file_ids[≤10], caption}` + optional `affiliate_code`), `GET /bounty_submissions` (filter by `bounty_id`, `status`; scope `bounty:basic:read`), `GET /bounty_submissions/{id}`, `POST /bounty_submissions/{id}/submit`, `DELETE /bounty_submissions/{id}`. ([Create bounty submission](https://docs.whop.com/api-reference/bounty-submissions/create-bounty-submission.md))
  - Statuses are `in_progress`, `submitted`, `approved` and `denied`. **There is no approve or deny endpoint** (that happens in the dashboard) and **no webhooks** (poll `GET /bounty_submissions`).
- **Social accounts.** The old `social-accounts` endpoints are deprecated and replaced by `GET/POST /external_accounts`, `POST /external_accounts/connect` and `DELETE /external_accounts/{id}`. There are no view or stat fields.
- **Takeaway.** If Krypt ran a **fixed-fee clipping bounty on Whop**, app users could submit to it by API, using a user OAuth token with `bounty:submission:create`. That is the only official submit API anywhere in this space. It does not cover Content Rewards CPM campaigns.

## 4. How others automate it
- **AutoClip (autoclip.dev)** is the clearest example. Its paid "Auto-Earn" mode **picks Content Rewards campaigns that fit your accounts, joins them, clips only the footage each campaign provides, posts to TikTok, Instagram and YouTube, and submits "from your own Chrome" through its free extension inside the 30-minute window**. It says Chrome must stay open on an awake computer, and it syncs approvals and payouts every hour. **No API is involved: it is browser automation**, which is the same approach Marketo would take. ([AutoClip](https://autoclip.dev/for/bounty-clippers)) I found no public statement from Content Rewards approving or banning it.
- **Videotto, OpusClip and Postiz** automate the clipping and scheduling; **submission stays manual** in their guides. ([Videotto](https://www.videotto.com/blog/maximize-content-rewards-videotto), [Postiz](https://postiz.com/blog/whop-clipping-how-to-make-money-automate-it))
- **Content Rewards' own AI clipping guide** (18 Nov 2026) endorses AI tools, Claude Code included, for cutting clips. It still says "watch every clip before you post it", and its workflow has the creator submit by hand.
- I found no Discord bot or script that submits. Clipper Discords mostly share campaigns and rates. **(inferred)** A tool is allowed as long as views stay genuine and posts follow the brief, but there is no written permission, and Whop's ToS bans automated access to whop.com.

## 5. What matters for Krypt

### 5a. App users submitting their reels to campaigns they joined
**Fit**
- **Most campaigns pay for content about *their* brand, often cut from *their* footage.** Marketo's normal reels, about the user's own niche or Krypt tools, will rarely meet a brief.
- So the feature has to be **"make a reel *for* campaign X and submit it"**, not "submit the reels we already posted". Sound and logo campaigns, where you add a song or logo, are the easiest fit for generated reels. UGC usually wants a real person on camera, and some briefs ban AI. **(inferred)**
- Users must check the brief for AI bans, required tags, handles and links, the required sound, minimum length and language. Only the *written* requirements bind them.

**Timing**
- The **30-minute rule** means the submit step must run **right after the post goes live, in the same session**.
- Scheduled uploads (YouTube Studio scheduling, TikTok schedule) would miss the window unless the run is awake when they publish. **(inferred)**
- Marketo's 2 h spacing between posts is fine; the submit just has to follow each post.

**Accounts**
- Each social account must be connected **inside contentrewards.com** (OAuth). Whop-linked accounts do not count.
- **Instagram must be Business.** The help article says Business only, so a Creator account may not connect. That change is the user's call.
- Facebook needs a public verification Reel carrying the code. Threads and Pinterest are not supported.
- **One Content Rewards account per person.** Multi-profile users can presumably connect several social accounts to their single account (no maximum is stated). Running several Content Rewards accounts, one per Marketo profile, would break §13.3. **(inferred)**

**One post, one campaign, ever**
- Each post can be submitted once only. Never send the same edit to two campaigns, and never resubmit a rejected link.

**Disclosure must be built into the reel**
- Every campaign reel needs a disclosure **at the start of the video**: an on-screen "Ad" or "Paid partnership" in the first seconds, and it should be spoken if there is narration. It also needs #Ad at the **start** of the caption, not in the hashtag block.
- Where possible, also set the platform toggle:
  - **YouTube Studio**: "paid promotion" checkbox; Studio is web, so it can be ticked. ([YouTube help](https://support.google.com/youtube/answer/154235))
  - **TikTok**: Commercial content disclosure > Branded content, which adds a "Paid partnership" label. ([TikTok help](https://ads.tiktok.com/help/article/how-to-turn-on-the-commercial-content-disclosure-setting-in-tiktok)) Whether the web uploader shows this toggle is **unverified**.
  - **Instagram**: per Meta, "adding the paid partnership label is only available on the Instagram app". Marketo posts from desktop Chrome, so it **probably cannot set the label** and would rely on #Ad plus the on-screen text. **(inferred; verify)**
  - **X**: has had a "Paid Partnership" label since March 2026, through the composer's flag icon or "Add content disclosure". ([TechCrunch](https://techcrunch.com/2026/03/02/x-ads-paid-partnership-labels-for-creators-so-they-can-ditch-the-hashtags/), [X policy](https://help.x.com/en/rules-and-policies/paid-partnerships)) Whether it works on web is unverified.
- This conflicts with Marketo's "human-sounding" and hook rules. Campaign reels need a separate, disclosed variant.

**Engagement automation is the biggest ban risk**
- Content Rewards bans "generating" or "coordinating" non-genuine views, likes, followers or engagement, permanently, and the ban rejects all pending pay.
- Anything in Marketo that drives other accounts or installs to view or like a user's **campaign clips** must be off for those posts. That includes cross-install visits, the follower-visit loop and Krypt reposts. **(inferred, high importance)**
- The account's own warm-up likes and comments on *other people's* posts are not engagement on the clip, but they could still raise the Bot Score, whose signals are not published. **(inferred)**

**Tracking**
- Read the Submissions page (Pending, Approved or Rejected, plus the rejection reason) and the Earnings page (Queued, Arriving, Received) in the user's Chrome.
- **Leave withdrawals manual**: that is money plus KYC on whop.com, where Whop's ToS bans automated access.

**Gray area**
- Submitting through the Chrome extension is the same thing AutoClip already does openly, and Content Rewards' terms do not forbid it.
- To be safe, ask Content Rewards in writing (support or the partner programme) before shipping. Keep the submit step a visible, user-approved action, not a hidden one. **(recommendation)**

### 5b. Krypt running its own campaign
**Cost**
- The minimum is **$1,000** of budget, plus a 10% platform fee on approved work and Whop's processing fee. Refunds carry a fee of up to 20%.
- Example: at $1/1k, $1,000 buys roughly 900k paid views, before the 10% fees **(inferred)**.
- Set a sensible maximum per clip, such as $50–$200, and a minimum, such as $2–$5, so tiny clips never reach the review queue.

**Work**
- **Krypt must review every clip by hand**: there is no auto-approve, and the target is 72 h from the payout threshold. Overdue reviews can pause new submissions.
- Approving a clip gives Krypt a perpetual licence to reuse it, which is useful for Krypt's own channels.

**Category risk**
- Content Rewards calls **crypto and finance "regulated"**. Some claims are banned whatever the disclosure.
- Prediction-market bots pitched as "AI trades for you, easy" amount to an **earnings or financial claim**, which is risky under the FTC Endorsement Guides and platform branded-content rules.
- X still blocks paid crypto and gambling promotions in the UK, EU and Australia (reports conflict). TikTok's branded content policy blocks its Prohibited Industries.
- **A campaign for the Windows tools (Tweaker, Cleaner, Larp, Ghost and so on) is far safer than one for the trading bots.** **(inferred)**

**Write the requirements as enforceable text**
- Put required disclosure wording and placement, required link and handle, banned claims (no profit promises), minimum length and platforms into the Requirements field. Only written rules can justify a rejection.

**Self-dealing and FTC**
- If Marketo's own AI writes and posts the paid Krypt reels, **Krypt is the advertiser and effectively the author**. Krypt is responsible for the claims and for making sure disclosures appear (Org Terms §13; FTC).
- Marketo would have to insert the disclosure automatically on every campaign reel.

**Fraud risk**
- Marketo installs already follow Krypt and visit or like Krypt's posts every 1–3 days. If installs ever see, view or like **other users' Krypt-campaign clips**, that is coordinated engagement. It would get clips rejected and accounts banned, and could get Krypt's own organisation actioned.
- Keep campaign clips out of every install-to-install engagement loop. **(inferred, high importance)**

**Earning on the side**
- The Content Rewards **Partner Program** pays **3% of creator payouts for 12 months** on creators you refer, and **30% of Content Rewards' fee** on businesses you introduce. ([Partner agreement](https://contentrewards.com/partner-terms), 19 Nov 2026)
- If Marketo links users to Content Rewards with a partner link, disclose it, as Marketo already does for the ElevenLabs affiliate link.

**Alternative: a Whop bounty**
- A fixed reward per approved post, with Krypt approving in the Whop dashboard.
- **Pros (inferred):** it has a real API (`POST /bounty_submissions`), so Marketo could submit without browser automation.
- **Cons (inferred):** it pays per post, not per view; the user needs a Whop OAuth token with `bounty:submission:create`; and Whop bounties are not the Content Rewards marketplace, so far fewer creators will see them.

**Related program**
- **X Original Content Rewards** (launched Aug 2026; a clip feature since 9 Nov 2026) is X's own pay-for-views scheme. It is not part of Content Rewards and needs X Premium plus about 500 verified followers. ([Tubefilter](https://www.tubefilter.com/2026/08/11/x-monetization-original-content-rewards-program-creators/), [X help](https://help.x.com/en/using-x/original-content-rewards))

## 6. Open questions to confirm before building
- Does Content Rewards object to extension-driven submission? Ask support or partners in writing.
- Exactly which platforms are accepted today. Is X live for submissions? Are Threads and Pinterest really out?
- Can an Instagram *Creator* account connect, or only Business? The help article and the Terms disagree.
- Whether TikTok web and X web offer the paid-partnership toggles when Marketo posts from desktop Chrome.
- The logged-in Discover and campaign pages: field names for required hashtags, sound and links, used for matching briefs to accounts. Not public, so they need checking in a signed-in session.

## Sources
- Content Rewards: [About](https://contentrewards.com/about) · [What is Content Rewards](https://contentrewards.com/articles/what-is-content-rewards) · [Part of Whop?](https://contentrewards.com/articles/is-content-rewards-part-of-whop) · [Creator Terms (17 Nov 2026)](https://contentrewards.com/terms) · [Organization Terms (13 Nov 2026)](https://contentrewards.com/brands-terms) · [Partner agreement](https://contentrewards.com/partner-terms) · [Pricing](https://contentrewards.com/pricing) · [FTC guide](https://contentrewards.com/ftc-compliance) · [Payouts explained](https://contentrewards.com/articles/clipping-payouts-explained) · [Why clips get rejected](https://contentrewards.com/articles/why-clips-get-rejected) · [AI clipping](https://contentrewards.com/articles/ai-clipping) · [Changelog](https://contentrewards.com/changelog)
- Help centre: [How it works](https://help.contentrewards.com/en/articles/15319790-how-content-rewards-works) · [Connect accounts](https://help.contentrewards.com/en/articles/16746780) · [Find and apply](https://help.contentrewards.com/en/articles/16817237) · [Submit a video](https://help.contentrewards.com/en/articles/15319814-submit-a-video) · [Approval and review](https://help.contentrewards.com/en/articles/15319801-approval-and-review) · [Fake views](https://help.contentrewards.com/en/articles/15319803-when-a-clip-is-rejected-for-fake-views) · [View counts](https://help.contentrewards.com/en/articles/16829638-why-your-view-count-does-not-match-ours) · [Suspensions](https://help.contentrewards.com/en/articles/16829639-your-account-was-suspended-or-you-were-removed-from-a-campaign) · [Previous version](https://help.contentrewards.com/en/articles/16829642-what-happened-to-your-previous-version-submissions-and-payouts) · [Create a campaign](https://help.contentrewards.com/en/articles/16822142) · [Review submissions](https://help.contentrewards.com/en/articles/16822143-review-submissions)
- Whop: [Content Rewards (business docs)](https://docs.whop.com/manage-your-business/growth-marketing/content-rewards) · [Content Rewards terms](https://whop.com/content-rewards-terms-of-service/) · [Whop ToS](https://whop.com/tos/) · [Whop FTC policy](https://whop.com/ftc/) · [Whop blog (Mar 2025)](https://whop.com/blog/content-rewards/) · [Bounties guide](https://docs.whop.com/developer/bounties/run-a-bounty-program.md) · [Bounty object](https://docs.whop.com/api-reference/bounties/bounty.md) · [Create bounty submission](https://docs.whop.com/api-reference/bounty-submissions/create-bounty-submission.md) · [AI and MCP](https://docs.whop.com/developer/guides/ai_and_mcp) · [llms.txt](https://docs.whop.com/llms.txt)
- Third party: [OpusClip (Aug 2026)](https://www.opus.pro/blog/whop-content-rewards) · [AutoClip](https://autoclip.dev/for/bounty-clippers) · [Postiz](https://postiz.com/blog/whop-clipping-how-to-make-money-automate-it) · [Videotto](https://www.videotto.com/blog/maximize-content-rewards-videotto) · [OpenClip rules](https://openclip.app/clipping/clipping-campaign-rules)
- Platforms: [YouTube paid promotion](https://support.google.com/youtube/answer/154235) · [TikTok commercial content disclosure](https://ads.tiktok.com/help/article/how-to-turn-on-the-commercial-content-disclosure-setting-in-tiktok) · [TikTok branded content policy](https://www.tiktok.com/legal/bc-policy) · [Instagram branded content](https://creators.instagram.com/earn-money/branded-content) · [X paid partnerships](https://help.x.com/en/rules-and-policies/paid-partnerships) · [X paid partnership label (TechCrunch)](https://techcrunch.com/2026/03/02/x-ads-paid-partnership-labels-for-creators-so-they-can-ditch-the-hashtags/) · [FTC Endorsement Guides](https://www.ftc.gov/business-guidance/resources/ftcs-endorsement-guides-what-people-are-asking)
