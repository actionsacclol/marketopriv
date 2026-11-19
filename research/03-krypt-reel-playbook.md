# Krypt reel playbook

What 01 (reference teardown) and 02 (algorithm research) mean for our reels. Read this before making one. These are rules, not suggestions, unless marked "test".

## The format that wins: the story reel

The reference accounts didn't blow up on lists or tool showcases. They blew up on **one fresh, specific story, told in beats, with receipts.** Our version:

> **A real memecoin / crypto event or data story, from the last 1–3 days when possible, told beat by beat with exact numbers and sources, ending on the lesson one of our tools (Krypto Bot, Krypto Mirror) exists for.**

The account is crypto-wide (2026-10-31): any memecoin or crypto topic that will get views. Goal: reach first, then showcase the tool. Never say "open source" or "free to use". Facts and features: 05 (Krypto Bot) and 06 (Krypto Mirror).

The lesson is the bridge to Krypt. The product is never the hook.

### Story beats (45–55s, ~8–12 beats)

1. **Poster + dateline** (0–1.5s). Hero visual plus `TOPIC · DATE · TIME UTC` kicker. The first words appear by ~0.5s.
2. **Hook line** (by 1.5s). Named actor, strange action, number. "X did Y. Z minutes later, N."
3. **Twist** (≈3–6s). The reversal: "One minute later it was down 96%."
4. **Receipts** (6–40s). One fact per beat, each with its own visual: chart spike, big number, card, flow diagram, step list. Timestamps and sources on screen.
5. **Payoff** (last 20–30%). What it means: the lesson.
6. **Bridge** (1 line). "This is why Krypt Trader paper-trades first" / "PolyBot scores your AI against the market before a dollar moves."
7. **Loop.** The last frame returns to the opening poster. No hard end card. Put the CTA in the caption and on the last beat as one line.

### Story sources that fit us (fresh + specific + no profit claims)

- Prediction-market moves: a Kalshi/Polymarket market that swung hard on news, with the timeline and resolution. No "you could have made".
- AI agents trading badly: bot blowups, prompt-injection drains, agents that bought the top. Sourced.
- Open-source trading repos going viral: stars in a week, what the repo actually does, the catch.
- Our own honest experiments: "Claude vs the market on 50 Kalshi markets, paper money, week 1". Losses included, scored with our scoreboard.
- Platform and regulatory news that changes what bots can do (API changes, rule changes).

Check every fact against a primary source and name the source in the caption. If a number can't be sourced, cut it.

## Story formats (start here: `list_formats`, `create_reel` with `format`)

All run on the story engine (voice, effects, light/dark beats). Each comes with a beat skeleton and hooks to test. The skeleton's numbers are examples and the dateline says EXAMPLE DATA until replaced.

| Format | Use for | Signal it chases |
|---|---|---|
| `would-you-copy` | A wallet that looks great → poll with a 3-2-1 countdown → reveal what copiers got → verdict stamp | Comments, watch-through |
| `explainer` | One idea (copy lag, slippage, fees) in ~30s | Saves |
| `myth-vs-data` | A popular claim tested with our recorded data, verdict stamped | Shares, comment arguments |
| `paper-diary` | Episode series: "Day N of copying the top wallet, paper money" | Follows |
| `news` | A real on-chain event the day it happens | Reach |
| `pov` | 6–9s joke that loops, no voice; add a trending sound in the Instagram app | Rewatches, cheap volume |

Numbers about a third-party wallet's on-chain record (its PnL, win rate) are data, not claims, when sourced and labelled. What our tools or the viewer would earn is never claimed.

## Other styles (keep, but second to the story formats)

| Preset | Use for | Fix it needs |
|---|---|---|
| `list` | "3 crypto tools" evergreen explainers | Stretch to 25–35s with a beat per tool showing it running |
| `versus` | Saveable comparisons; also as carousels | Fine as is |
| `stats` | Sourced numbers about our tools (stars, price $0) | Keep it about facts, not results |
| `terminal` | Demos: Claude driving the tool | First frame shows the result, not the command |
| `post` | Our own takes only | Never other people's posts |
| `clip` | Real screen recordings | Crop and zoom on the line that matters |

## Hook rules

The hook decides whether anything after it gets watched. Most viewers decide inside two seconds. A hook is three things landing together, not a sentence:

1. **The picture.** Frame 0 already shows the result or the problem, and something in it moves. Never a title card, a logo or a fade from black.
2. **The words on screen.** Seven or fewer, the biggest thing in the frame, readable with the sound off.
3. **The spoken line.** Starts at 0s and is over by about 2.5s.

### Every hook has to pass these

- **The viewer or the result is the subject, never the product.** No product or brand name in the first beat: not on screen, not spoken, not in the small line at the top.
- **It opens a loop the video closes.** The first line makes a promise that a later beat pays off. A first line that finishes its own thought gives nobody a reason to stay. "Your iPhone thinks it's in Tokyo. You're at your desk." is finished. "Your iPhone says Tokyo. It never left your desk. One cable." still owes the how.
- **Specific beats general.** A named game, device, app, number or time. If the line would work unchanged for a competitor's product, rewrite it.
- **True.** No invented tests, comments, numbers or reactions, and nothing the product does not do. No profit claims.
- **Beat 2 keeps the promise moving**: the cause, the first proof or the first step. Never a logo, a product name or a feature list.
- **Write five, in five different styles, then pick.** Say each out loud. If it takes more than one breath, cut it.

### Hook styles (pass one as `hook_style`)

Every reel opens in one of these, and the hook style test in `get_performance` says which to use next on each platform.

| Style | How | Example (PC tool) | Example (prediction-market bot) |
|---|---|---|---|
| `outcome` Result first | Frame 0 is the finished result, already happening. Explain how afterwards. | "This iPhone says Tokyo. It's on a desk in Ohio." | "This AI just refused its own trade." |
| `pain` Their problem | Their problem, in their words, then the cause or the fix. | "Your PC stutters in every fight. It isn't your GPU." | "Your bot bets on every market it sees. That's the bug." |
| `mistake` Stop doing this | A habit that hurts them, what it costs, what to do instead. | "Stop running tweak files you can't read." | "Stop letting an AI trade before it's been scored." |
| `gap` Curiosity gap | Something exists; hold back what. The answer has to be worth the wait. | "Windows hides five junk piles. The fourth is the big one." | "There's one number that says if an AI can trade. Nobody checks it." |
| `callout` Call the viewer out | Name the exact viewer, then the question they can't answer. | "Valorant players: why is your crosshair different in every game?" | "Polymarket traders: who checks your bot's forecasts?" |
| `myth` Everyone is wrong | A belief they hold, then the flip. The video proves it. | "Tweak packs don't make your PC faster. Most undo each other." | "An AI that sounds sure is not an AI that's right." |
| `test` Real test | A test that was really run, with its numbers. Result at the end. | "I ran one cleaner on a three-year-old PC. Here's what it found." | "I gave an AI paper money and fifty markets." |
| `number` Counted list | A number and a promise, with one item flagged as the surprise. | "Three apps I'd put on any new PC. The last one is tiny." | "Three rules my trading bot can't break." |

The `test` style needs a test that happened. If it did not, pick another style.

### What weak hooks look like (ours, so far)

- The product name first: "Krypt Tweaker: stop paying for tweak packs."
- A finished thought: "Ten wins in a row. Then one trade."
- A feature as the opener: "Paste a share code. It rebuilds it."
- A label at the top of frame 0 that names the product.
- A slow first beat: three seconds of one sentence over a title card.

### Testing

- Tag every reel with its `hook_style`. Do not use the same style twice in a row on one platform while the test is running.
- For a direct test, `make_hook_variants` makes 2-4 versions that differ only in the opening.
- Judge a hook by how many people stayed, not by views alone: YouTube Studio's "Viewed vs swiped away", Instagram's skip rate, average watch time. Record them with `record_reel_metrics`.

## Visual rules (our house style)

- Keep both looks from the references, in Krypt colours:
  - **dark desk** (default): near-black, faint grid, purple/pink gradient accent, green for up and red for down, used sparingly.
  - **light keynote** (test): for story reels that need a "clean news" feel.
- **Dateline kicker** on every beat, small mono caps at the top: `KALSHI · 29 OCT · 14:02 ET`.
- **Kinetic word reveal**: the headline appears word by word, with upcoming words dimmed, timed to the voiceover.
- **One visual per beat** that literally shows the sentence: a chart for "spiked", a number for "$15M", a card for "posted", steps for "how it works".
- **Burned-in text, high contrast, inside the safe zone** (top 250px and bottom 400px are UI).
- **Voiceover:** both winners carry an audio track paced like narration, so a voiceover is likely part of the format (test). Krypt Editor already ships Kokoro TTS.

## Caption template

```
[Hook line, same as on screen.]

What happened ([market/topic], [date], UTC):
1. [time]: [fact]
2. [time]: [fact]
...

[One-line lesson.]

[Bridge: what Krypt does about it, plainly. No promises.]

Link in bio.
Sources: [A], [B]. Not financial advice. Trading carries risk of loss.
#tag1 #tag2 #tag3   (3–5 specific tags)
```

## CTA policy

- Default: **"link in bio"** plus "save this" for receipts and lists.
- "Comment [KEYWORD]" only once a Meta-API DM tool is set up and actually sends the link. Once per reel, at the end, never in the hook.
- Never "comment YES", "tag a friend", or a follow-for-follow ask.

## Cadence and testing

- **3–5 reels a week** to start, daily once quality holds. Fresh stories go out within 24–48h of the event.
- First 20–30 reels are experiments. After each one (24h, then ~72h), read the reel's Insights and record views, reach, average watch time, skip rate, likes, comments, saves, shares and follows (`record_reel_metrics`). Compare against our own reels (`get_performance`, the Results page), not against followers.
- **Hook tests:** for any reel worth posting, `make_hook_variants` makes 2–4 versions that differ only in the opening. Post each as its own Trial Reel; the version with the best hold and skip rate tells us which kind of hook to use next.
- After every comparison that shows something, `add_learning` with the evidence. Read the learnings before writing the next reel; remove ones later results contradict (`delete_learning`).
- Double down on whatever beats the median by 3x or more: same format, new story.
- Use collabs (co-author posts) with open-source maintainers and dev/quant creators whenever a story is about their project.

## Pre-publish checklist

- [ ] Hook: frame 0 shows the result or the problem, 7 words or fewer on screen, spoken line done by 2.5s, no product name in beat 1, a named hook_style on the reel
- [ ] Every number sourced (caption names the source), no profit, win-rate or P&L claims
- [ ] "Not financial advice" on trading reels; paper and backtests labelled as such
- [ ] Only our own posts in post cards; no other apps' watermarks
- [ ] 45–55s for stories, 20–35s for lists and demos, under 90s always
- [ ] Ends in a loop or one-line CTA, not a long end card
- [ ] Caption follows the template, 3–5 specific hashtags
- [ ] Correct account and Chrome profile (Warming page) before posting

## Engine work this implies (hub backlog)

1. **`story` preset:** beat list (`time | headline | visual | data`), dateline kicker, word-by-word reveal, beat visuals (chart spike/drop, big number, card, step list, flow), dark and light themes, loop-back ending.
2. **Voiceover track:** TTS per beat (Kokoro, as in Krypt Editor), with beat timing driven by the narration length and captions burned in.
3. **Loop ending** as an option on every preset (replaces the end card; the CTA goes in a last-beat line).
4. **Longer timings** on `list` and `terminal` (more beats, 25–35s).
5. ~~Metrics after posting~~ done: `record_reel_metrics` takes reach, average watch and skip rate; Results page + `get_performance` rank reels; hook tests via `make_hook_variants`.
6. Next: real screen recordings of the apps with auto-zoom and a highlighted cursor (`clip`), data import (wallet / trade export → beats), voice + effects on the other styles, a pronunciation list for Kokoro, carousels, a safe-zone overlay for Instagram's buttons and caption.
