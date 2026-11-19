# Krypt Marketo

A desktop hub for making Instagram reels and running Instagram accounts with any AI. The AI drives it; the UI is for watching, approving and grabbing files.

- **Reels**: preset styles and story formats rendered to 1080×1920 MP4 on this computer, with an on-device narrator voice.
- **Voices**: 27 narrator voices on the Voices page: hear them, tune one (speed, pitch, warmth, clarity, a second voice blended in), save it under a name and make it what new reels start with. A "say it right" list fixes names the narrator gets wrong.
- **Instagram**: each account is signed in either inside the hub's own browser or in your own Chrome (through the Krypt Marketo extension, so Instagram keeps seeing the same device). The AI reads pages as numbered text and clicks by number, so it needs no vision.
- **X**: an account can also run its X profile, in the same place its Instagram runs, with its own warm-up ramp and daily limits: likes, reposts and follows are counted, and posts (reels as video posts, or text), replies, messages and unfollows wait for your Approve.
- **TikTok**: the same for TikTok, with its own ramp: mostly watching the For You feed early on; likes, favorites and follows counted; posts (through TikTok Studio), comments, messages and unfollows wait for your Approve.
- **Run it all from any AI session**: `get_today` lists, for every account on every platform, today's posts against its targets (Accounts page → Posts a day; defaults Instagram 1, Shorts 2, X 4, TikTok 1, never above the day's limit), the DM inbox (replies counted against a daily `messages` limit; never cold DMs), engagement left, reels ready to post and metrics due. Results shows each account grouped by platform.
- **YouTube Shorts**: an account can also have its YouTube channel turned on; the AI uploads the same rendered reels as Shorts through YouTube Studio, in the same place the account's Instagram runs.
- **Any AI**: an MCP server (Claude Code, Claude Desktop, Codex, Cursor, Windsurf, Gemini CLI, VS Code, or any MCP app), plus a built-in chat for people with just an API key (xAI/Grok, OpenAI, OpenRouter, Ollama, any OpenAI-compatible URL).
- **Krypt tools**: a built-in catalog of every krypt.cc tool with everything its page says, so anyone can make reels about them. It has its own page in the hub and every AI gets it (`krypt_tools`); it is compiled in, with no switch to turn it off.

## Run

```
npm install
npm start            # build + launch
npm run dev          # vite + electron with hot reload
npm run typecheck
npm run dist         # Windows installer in release/ (unsigned, no auto-update)
```

Renders land in `~/Videos/Krypt Marketo` (change it on the Connect page). Data lives in `%APPDATA%\Krypt Marketo\`: `marketo-db.json` (everything), `playbook/` (your own notes), `Partitions/ig-*` (one Instagram session per account in the hub's own browser), `agent-key.bin` (the chat API key, encrypted by the OS).

`KRYPT_MARKETO_DATA=<folder>` runs a second copy on its own data, next to the installed one (development, tests).

## First run

Setup page: describe the brand (or tell the AI and it calls `set_brand`), download the voices (one 340 MB download holds all of them), add an Instagram account and sign in, connect an AI. The brand profile is turned into the instructions every AI receives (`electron/mcp/tools.ts` → `serverInstructions`), and `get_overview` repeats them for apps that drop server instructions.

## Connect an AI

Connect page → **Connect** next to the app. That writes one `marketo` entry into the app's MCP config (a `.before-marketo` backup is kept) which runs the hub's own executable as Node on `resources/mcp/marketo-mcp.cjs`. Tool calls launch the hub if it is closed. For anything not listed, copy the JSON block shown there.

Smoke test without an AI:

```
node scripts/mcp-call.mjs list
node scripts/mcp-call.mjs get_overview
node scripts/mcp-call.mjs browser_open '{}'
node scripts/mcp-call.mjs preview_reel '{"id":"reel_…","times":[0,3,8]}' --out ./frames
```

## The Instagram browser and its rules

`electron/browser.ts`. An account runs in one of two places (Accounts page → *Where it is signed in*), behind the same `browser_*` tools:

- **Marketo's own browser**: a private session per account in a window of the hub. Nothing to install; Instagram sees it as a new browser.
- **Your own Chrome**: a tab in the Chrome profile the account already lives in, driven through the extension. Same cookies, device and fingerprint as normal use. Pick one per account and stay on it.

The rules are code, not instructions, so they hold for any model and for both places:

- Only instagram.com opens. While an account is not signed in, or Instagram shows a login / security page, the AI can read but not click or type. Passwords are never typed by an AI.
- Likes, saves and follows are counted by the browser and refused past the day's ceiling (`shared/warmup.ts`), with an uneven pause between them. Watch-only and paused accounts get none.
- **Approvals are a switch** (Accounts page, "Ask me before the AI posts", `settings.askApproval`), **off by default**: then posts, comments, replies, messages, unfollows and reposts go through when the AI clicks, still inside the daily limits. Deletes, blocks, reports (`Verdict.always`) and account settings always ask. The rest of this section describes the switch turned on.
- Posting a comment, publishing, sending a message, unfollowing and anything on the settings pages waits for the user's **Approve** in the bar at the top of the hub. A changed text after approval is not sent.
- **Text has to read like a person wrote it** (`shared/humanText.ts`), with approvals on or off: text that reads as machine-written is what gets accounts restricted. `HUMAN_RULES` is the writing bullet in the AI instructions; `textProblems()` is run by the browser before a comment, reply or message is typed (`toolType`) and again before anything is sent (`approve`). The level is set from real threads read on X (2026-11-17, Polymarket / Kalshi, PC tweaking, software): replies there run about 5 words, nearly all under 60 characters, usually no full stop at the end. It turns back long or polished comments (per-platform length and sentence caps), stock AI phrases and verdict lines, long dashes, lists, more than one comma, a remark with a question after it, a reuse of the rules' own example lines (`REGISTER_EXAMPLES`), and a comment shaped like the recent ones (same first word, near-same wording, two long ones close together, always a full stop, always the same casing; history from `store.recentTexts`). The AI gets the reasons and rewrites. Post text and captions get the lighter check (dashes, AI phrases, markup); `create_reel` / `update_reel` say so early.
- The wrong account signed in, or Instagram in a language other than English (the rules read button labels), locks the buttons.
- Every action is written to the session log by the browser itself; `log_session` only adds notes.

`electron/pageScript.ts` is the reader that runs inside the page (in an isolated world).

## X

Accounts page → edit an account → **Also run this account on X** (optional X handle if it differs, X warm-up day 1, **Watch only on X**). X runs where the account's Instagram runs: the same Marketo browser profile, or the same Chrome profile. Every `browser_*` tool takes `site: "x"` for it; an x.com URL in `browser_open` picks it by itself.

- Its own ramp (`X_PHASES` in `shared/warmup.ts`), counted apart from Instagram: sessions and follower snapshots carry `site: "x"`. Lurk days 1-3 (10 likes, 3 follows, 1 post, no replies or reposts), Engage 4-7, Ramp 8-14, Active 15+ (50 likes, 6 reposts, 15 follows, 10 replies, 4 posts). X's automation rules single out automated likes and aggressive following, so these stay low.
- Buttons are judged by X's `data-testid` names (`like`, `retweetConfirm`, `*-follow`, `tweetButton`, `tweetButtonInline`, `confirmationSheetConfirm`, `dmComposerSendButton`), not by their labels. Likes, reposts and follows count toward the day's ceiling; Post (a new post, or a reply on a post page / in a "Replying to" dialog), message Send, Unfollow, Delete, Block and settings saves wait for Approve; Log out and account switching are refused.
- The first X handle seen signed in becomes the account's (unless one was typed), then its user id (`twid` cookie); a different X account locks the buttons. X has to be in English.
- `browser_attach_reel` with `site: "x"` opens x.com/compose/post and puts the MP4 into its file input. `mark_posted` with `platform: "x"` (or an x.com link) stores `xUrl`; the Library shows it.
- `get_warmup_plan`, `log_session` and `record_account_stats` take `site: "x"`.

## TikTok

Accounts page → edit an account → **Also run this account on TikTok** (handle, TikTok warm-up day 1, **Watch only on TikTok**). Like X, it runs where the account's Instagram runs, and every `browser_*` tool takes `site: "tiktok"`.

- Its own ramp (`TT_PHASES` in `shared/warmup.ts`), counted apart: Lurk days 1-3 (30 min, 10 likes, 2 favorites, 2 follows, no comments or posts), Engage 4-7 (first video), Ramp 8-14, Active 15+ (60 likes, 10 favorites, 15 follows, 10 comments, 3 posts). Favorites use the `saves` quota.
- Buttons are judged by TikTok's `data-e2e` names, which sit on the icon inside each button (`like-icon`, `undefined-icon` = favorite, `feed-follow` / `follow-button`, `comment-post`, `post_video_button`), plus `aria-pressed` so un-liking isn't counted. "Following" / "Friends" unfollows when pressed, so it asks first. Reposts, deletes, DMs and settings ask too.
- TikTok's security checks (slider puzzles, "verify it's you") lock the buttons until the user solves them.
- Handle from the side bar's Profile link (`a[data-e2e=nav-profile]`), user id from the `multi_sids` cookie; signed in = a `sessionid` cookie.
- `browser_attach_reel` with `site: "tiktok"` opens tiktok.com/tiktokstudio/upload and fills its file input; Post asks the user. `mark_posted` with `platform: "tiktok"` stores `tiktokUrl`.

## YouTube Shorts

Accounts page → edit an account → **Also post Shorts to YouTube**. The channel runs where the account's Instagram runs: the same Marketo browser profile (`Partitions/ig-*`, one sign-in for both), or the same Chrome profile. Every `browser_*` tool takes `site: "youtube"` for it; a youtube.com URL in `browser_open` picks it by itself.

- Uploading goes through YouTube Studio's own upload dialog, not the YouTube Data API (an unaudited API project can only upload private videos, and every user would need their own Google Cloud project). `browser_attach_reel` with `site: "youtube"` opens youtube.com/upload and puts the MP4 in; a vertical video of 3 minutes or less becomes a Short by itself.
- The final **Publish / Save / Schedule** in the upload dialog waits for the user's Approve, and at most `YT_UPLOADS_PER_DAY` (3, `shared/warmup.ts`) go out per channel per day, counted in `youtube.uploads` on the account. Paused accounts publish nothing; watch-only is Instagram's and does not apply.
- The first channel Studio shows (its `UC…` id is in every Studio URL) is saved as the account's; another channel signed in later locks the buttons until the user switches back or presses **Forget channel**.
- On youtube.com outside Studio only links and search work: no likes, subscribes or comments. Channel settings and deletes in Studio ask first.
- `mark_posted` with `platform: "youtube"` (or a youtube.com link) stores `shortsUrl` next to the Instagram `postedUrl`; the Library shows both.
- Google sometimes refuses to sign in inside embedded browsers; an account that hits that uses **My Chrome**.

## The Chrome extension

`resources/extension` (Manifest V3, plain JS, no build step). Install: `chrome://extensions` → Developer mode → **Load unpacked** → that folder (the Accounts page has a button that shows it). Do it in each Chrome profile that holds an account. Works in Chrome, Edge and Brave.

```
hub (electron/chromeBridge.ts) ⇄ per-user pipe ⇄ resources/mcp/marketo-chrome-host.cjs ⇄ Chrome native messaging ⇄ extension ⇄ one Instagram tab
```

- No network port. At start the hub registers a native messaging host for the current user (`cc.krypt.marketo`: a registry value on Windows, a JSON file on macOS/Linux) that only this extension's id may use; Chrome starts the helper itself, and the helper reaches the hub with a token that changes every start.
- The extension id is fixed by the `key` in its manifest (`shared/chromeExt.ts` lists the ids the hub accepts; a Web Store listing would get a different id to add there). `chrome-extension-key.pem` is the matching private key: keep it out of any repo.
- The extension only passes on a short list of debugger commands (mouse, keys, text, screenshot, reading the page, file picker), only for its one tab, and only while that tab is on its own site. Limits and approvals stay in the hub.
- While an AI works Chrome shows "Krypt Marketo started debugging this browser". **Cancel** on that bar, or **Pause** in the extension's popup, stops AI control for 5 minutes. The extension lets go of the tab after 90 seconds without a command.
- Each Chrome profile is one connection. The hub matches a profile to an account by Instagram's user id (saved the first time the signed-in handle is confirmed there); "Use this Chrome profile in Marketo" in the popup settles it when several profiles are open.
- Attaching a reel to Instagram's (or YouTube Studio's) file picker needs "Allow access to file URLs" on the extension (on by default for an unpacked one).
- Since 0.2.0 it keeps one tab per site (Instagram, and YouTube for Shorts) and may only act on instagram.com and youtube.com; 0.3.0 adds x.com (and twitter.com), 0.4.0 tiktok.com. An older profile keeps working for what it has; the hub asks for a reload before using it for YouTube, X or TikTok.

## Presets

| id | style |
|---|---|
| `story` | one story told in beats, narrated, one diagram per beat |
| `list` | headline, then repo-style rows land one per beat |
| `post` | one of our posts types itself out, numbers tick up, punchline |
| `stats` | one giant number per beat, counting up with a glitch hit |
| `versus` | two columns, checks and crosses tick in, verdict |
| `terminal` | a dev terminal types commands under a hook |
| `clip` | screen recording, boxed hook on top, captions underneath |

Every frame is a pure function of `(preset, fields, t)` drawn on a 1080×1920 canvas (`src/render/engine.ts`). The Studio preview, `preview_reel` stills and the MP4 export all call the same `drawReel`. To add a style: add its fields + timing in `shared/presets.ts` and a draw function in `src/render/presets/`. Preset and format defaults are example content; the brand profile fills the end-card link, disclaimer, logo and card maker line on new reels.

## Voices

`shared/voice.ts` (the voice list, `VoiceTune`, cache keys), `shared/pronounce.ts` (pronunciation), `src/render/voice` (the engine), `src/pages/Voices.tsx`.

- A reel's voice is its `voice_*` fields: `voice`, `voice_speed`, `voice_pitch` (semitones), `voice_warmth` / `voice_clarity` (dB), `voice_blend` + `voice_blend_amount`. One voice per reel; a beat can only change its own pace (`speed=` flag).
- A voice saved on the Voices page is a named set of those values (`db.voices`). `fields.voice` accepts the name (from a person or an AI) and expands to all of them; "onyx" becomes `am_onyx`. `settings.voice` is what new story reels start with.
- Blending happens inside the model (the two style vectors are mixed). Pitch is done by generating the line slower or faster and resampling it back to its length, so the pace stays put; it moves the whole voice, so small steps sound best. Warmth and clarity are two shelf filters.
- Pronunciation: `BUILTIN_SAY` holds clear misreadings only ("AI" read as "eye"); the user's list (`settings.sayAs`, respellings like "KAL-shee") wins over it. Written forms are turned into words first (krypt.cc, $3B, 9.3M, +12%, 7.0.0).
- Clips are cached in `<userData>/voice` by voice + pace + text (+ tuning and whatever pronunciation applied), so a plain line keeps the key it had before tuning existed. Clips made on the Voices page are named `try-…`; clips no reel points at are cleared at start and after a delete (`electron/reelFiles.ts`).

## Deleting reels

Library: the bin on a card, the Delete button on the open reel, the Delete key, or tick several and delete them together. One dialog asks first; "Also move the rendered video to the Recycle Bin" is off unless ticked (the choice is remembered). `delete_reel` takes `delete_file: true` for the same. Nothing is erased outright: videos only ever go to the Recycle Bin / Trash.

## Reference videos ("edit like this")

Research → **Reference videos**: drop in a reel whose edit you like (or give an AI the file path: `add_reference_video`). The hub keeps its own copy in `%APPDATA%\Krypt Marketo\refs\<id>\` and measures it on this computer:

- **Rhythm**: sections (the picture changes a lot: a hard cut, or a new headline / graphic animating in), hard cuts, how long the opening holds, how often anything changes.
- **Look**: light / dark, dominant colours, the accent colour and the closest reel accent, how much moves.
- **Sound**: silence share, tempo, and whether the changes land on the beat.
- **Pictures**: the opening seconds frame by frame, and one frame per section. `get_reference_video` returns them, so a model that can see reads the hook, captions and transitions itself; `note_reference_video` saves what it saw for next time and for models that cannot see.

`create_reel` / `update_reel` take `like: <id or name>`: that sets what a preset can take from the reference (accent, light/dark, kinetic/calm, seconds per row, clip length) and returns the section timings to write the beats to. The reel is still drawn by Marketo's presets, so this matches pacing, structure and look; it is not a frame-for-frame clone. Style only: a reference's footage, audio and wording are never reused.

`shared/refAnalysis.ts` is the measuring (no browser or Node APIs), `src/render/refAnalyze.ts` decodes the video and makes the pictures, `shared/refStyle.ts` turns a profile into words and preset fields.

## Content that ships

- `shared/kryptPack.ts`: the Krypt tools catalog (from the public krypt.cc pages; `KRYPT_PACK_READ` is the day they were read). Shown on the Krypt tools page (`src/pages/KryptTools.tsx`). Krypt Marketo's own entry is marked `released: false` and links to krypt.cc/tools until it has a page: set its `url` and drop the flag then.
- `research/02`, `research/03`: the algorithm research and the reel playbook. The installer includes only these two; `01`, `04`, `05`, `06` are internal notes and stay out of the build (`build.files` in `package.json`).
- Users add their own notes with `save_playbook_note` (stored in their `playbook/` folder).

## House rules (also in the instructions every AI gets)

- No profit claims, no "proven edge". Trading reels carry "Not financial advice."
- Only the user's own accounts and brands in post cards. No impersonation.
- Daily limits are enforced in code; posts, comments and messages wait for the user's approval when "Ask me before the AI posts" is on (off by default). Deletes and account settings always ask.
