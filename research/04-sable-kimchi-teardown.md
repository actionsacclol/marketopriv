# Teardown: Sable "Kimchi" reel (frame + audio level)

Reel: instagram.com/p/De2qUu-OXZl (@sableonchain, posted 2026-10-23). 53.9 s, 1080x1920. 3,296 likes, 39 comments when measured (2026-10-30).
Method: 36 frames sampled every 1.5 s; the reel's own audio track decoded and measured (loudness every 20 ms, stereo side channel, YIN pitch). The same pitch measurement was run on our Kokoro track for comparison.

## The story (what is said, in order)

| Time | Line (from frames + caption) | Visual |
|---|---|---|
| 0.0 | "Somebody sent Kimchi half of a brand new coin." | 3D grey coin labelled KIMCHI, dateline `KIMCHI · 22 OCT · 20:29 UTC`; the coin **cracks in half** at "half"; a wallet card pops in: `500,000,000 · 50%` |
| 4.5 | "Six minutes later: $7.3M … $15.1M" | Line chart draws upward, the market cap number **counts** above it and turns green; a `6 min` span bracket |
| 7.5 | "One minute after that? $626K, −96% in one minute" | Line falls off a cliff, number flips to red, red `1 min` bracket |
| 10.5 | "It started with a QR code on Kimchi's X account. Pump.fun's co-founder reposted it. Then the repost was undone. And the post was deleted." | **Dark scene.** A mock post card; the QR code builds from dots; the repost counter goes 0 → 1 (green) → 0; the card empties |
| 19.5 | "So who made money?" | Light again. A pill button `follow the money →`; `$225K+` counts to `$385K+` "according to Lookonchain"; five wallet dots |
| 25.5 | "They sent their SOL to one address … 983 SOL … in a single transfer." | The five dots **curve into one** address; a blue arrow drops down: `983 SOL`; blue wipe |
| 33.0 | "And Kimchi's wallet?" (1.5 s of silence) | Dark scene; wallet card shows `checking…` |
| 34.5 | "Not one token sold." | Holds counts up to `500,010,000`, Sold `0 tokens` underlined in blue, `verified on-chain` chip |
| 39.0 | "Almost eleven thousand wallets bought this coin." | A field of dots fills while a counter runs `10,850 → 10,939` (1 dot = 10 wallets) |
| 42.0 | "Today the whole thing is worth …" | `$15.1M` struck through; the dots fade out |
| 45.0 | (transition) | Full-screen **blue wipe** |
| 46.5 | "When a coin shows up in your feed, the early wallets are already in. Check who bought before the post." | Bar chart: grey bars after a dashed `the post` line, blue `early wallets` bars before it; a **cursor drags a selection box** over the blue bars |
| 51.0 | "I'll show you the next one before your feed." | A **cursor clicks Follow** → `Following` |

The CTA is a follow, set up by the story itself (here is what you missed, follow to see the next one first). It isn't a product pitch.

## Visual system

- **Two looks, switched by subject.** On-chain facts are on light grey (#ECECEF-ish) with two soft dark blobs drifting in opposite corners. Social media / "who" scenes are near-black. The switch itself marks a new chapter.
- **Small captions, top third.** Headline type is about 1/20 of the frame width: medium weight, black on light / white on dark, centred. There's no giant text; the visual carries the frame.
- **Word reveal = blur-in.** Each new word fades in from a soft blur (not dim → lit). The not-yet-spoken words aren't shown at all.
- **Accent words** are greyed until spoken, then go solid ("money**?**", "**coin.**", "**before** your **feed**").
- **Every beat has its own small animated diagram**, built for this story: coin split, live line chart, QR build, repost counter, wallet-flow merge, transfer arrow, holdings card, dot field, bar chart. They are UI-like, flat and thin-lined.
- **Numbers always move.** Each figure counts up or ticks between states ($7.3M → $15.1M → $626K; $225K → $385K; 10,850 → 10,939; checking… → 0 → 500,010,000).
- **Colour is meaning, not decoration.** Green = up/profit, red = crash, blue = the subject's money trail / the thing to notice. There are no brand gradients.
- **A cursor acts on screen.** It drags a marquee and clicks Follow, which makes the viewer feel they're using a tool.
- **Transitions:** a hard cut light→dark, a full-frame blue wipe, cross-fades between states inside a beat.
- **Dateline only on the first beat**, then gone.

## Audio

- **No music.** In the 1.5 s pause at 32.6 s the level drops to about −60 dB (silence). Between phrases the floor is about −33 dB (breaths/tails), not a bed. The voice carries the whole reel.
- **Voice:** male, median pitch 125 Hz. Phrase-to-phrase pitch range (10th–90th percentile) is **13.7 semitones**, with p90 at 204 Hz, so it lifts sharply on key words ("*fifteen* million", "*not one*"). Phrase endings mostly fall (statements), with questions lifted. Only 13 pauses ≥ 0.2 s in 54 s, so it's dense and fast. The pauses are placed: 0.6 s after the hook, and **1.5 s of silence before "And Kimchi's wallet?"** for suspense.
- **Our Kokoro track** (same measurement): 118 Hz median, range **7.7 semitones**, p90 150 Hz. That's about half the expressiveness. It reads as calm and flat next to Sable.
- **Sound effects: 24 stereo events, each tied to an on-screen change.** The voice is mono; the effects are the only stereo content, mixed 15–20 dB under the voice:
  - 1.7 s crack (coin splits)
  - 3.4 s pop (wallet card)
  - **4.1–6.5 s rising tick/riser while the chart climbs**
  - **8.1 s impact on the crash**
  - 9.0 s stamp (−96%)
  - 0.08 s UI ticks on state changes (QR build 11.5, repost 15.3, undo 16.5, $385K 23.7, 24.9, 30.9, 35.6, 39.0)
  - whooshes on the transfer arrow (28.4) and the blue wipes (31.5, 45.0)
  - a counter whirr (34.3, holdings counting)
  - clicks on the cursor actions (50.1, 53.2)

## What this means for our reels (gaps in the story preset)

1. **Voice emotion.** Kokoro delivers about half Sable's pitch range. Options: (a) a more expressive TTS (Fish Audio, already supported by Krypt Studio with the user's own key; or another cloud voice); (b) push Kokoro: write lines with punctuation for lift ("Fifteen. Million."), split emphasis words into their own clips with higher speed/variation, and add placed silences.
2. **Sound effects.** Add a synthesized SFX layer: crack, pop, tick, riser, impact, whoosh, click, counter whirr. Original sounds generated in code, keyed to visual events and mixed −16 dB under the voice. This is the cheapest big win.
3. **No music under voice.** Default to no music for story reels; at most a very low bed.
4. **Placed silence.** Let a beat start with a pause ("…" or a `pause` column) for the suspense moment.
5. **Captions smaller; the visual is the hero.** Our headlines are 88 px bold and fill the top third. Use about 54 px medium with blur-in words, and hide unspoken words instead of dimming them.
6. **Light/dark per scene.** A per-beat theme, not per reel.
7. **New visuals:** line chart with a live counting value + bracket annotations, flow diagram (N wallets → one address → arrow), dot field with counter, holdings/wallet card with a counting value and a "checking…" state, bar chart with a marquee, an animated cursor (drag, click), a full-frame colour wipe transition, a split/crack object.
8. **CTA = follow, earned by the story.** "I'll show you the next one before your feed" beats "link in bio". For Krypt: "Follow, I'll post the next replay."
