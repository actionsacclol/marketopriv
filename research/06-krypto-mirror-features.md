# Krypto Mirror: feature catalog

Source: `C:\Users\Krypt\Desktop\Krypto Copy` (git HEAD `a0a4f15`, 4 commits; forked from Krypto Bot 6.0.1). Read-only review of code, config defaults and in-repo docs on 2026-10-31. Nothing was run. No `.env`, key or wallet files were opened. Paths below are relative to that folder.

**Product name confirmed:** `package.json` → `"name": "krypto-mirror"`, `"productName": "Krypto Mirror"`, `appId cc.krypt.mirror`; `index.html` `<title>Krypto Mirror</title>`; About page shows "Krypto Mirror v1.0.0". The folder name ("Krypto Copy") is the app's earlier name. Older docs still say "Krypto Copy", and the app still reads `%APPDATA%\Krypto Copy` if that folder exists.

---

## 1. What it is

A desktop app for **copy-trading memecoin wallets**. It ranks wallets by what a *follower* would have kept, not by what the wallet made. Every follow starts as a harsh paper simulation. Live copies are signed locally from a key that stays on the user's machine. It is the copy-trading half of Krypto Bot as a separate app, using the same engine, signer and RPC layer.

- **For:** Solana memecoin traders (pump.fun and PumpSwap first) who want to follow other wallets and check the follower's real result before they risk money. Robinhood Chain and BNB Chain are opt-in extras.
- **Platform:** Electron 43.4.1 desktop app. A Windows NSIS installer has been built (`release/Krypto Mirror-Setup-1.0.0.exe`, 169 MB, with SHA256SUMS). macOS (dmg/zip) and Linux (AppImage/deb) targets are configured in `package.json` and `.github/workflows/release.yml`, but none has been built locally. **No build is code-signed**, so Windows shows a SmartScreen warning and macOS Gatekeeper blocks the app (`release.yml` header).
- **Price/licence:** free download with no ads, no subscription and no Krypt account (`README.md`, About page). A flat **0.5% fee on each live buy and sell** (`shared/fees.ts` `FEE_BPS = 50`). There is no holder discount: `holderFeeBps()` in `shared/krypto.ts` returns the base fee. The referrer named at onboarding gets 20% of that fee (`REFERRAL_SHARE_BPS = 2000`, i.e. 0.1% of each trade), paid out of Krypt's share. Paper trades pay no fee. The licence is proprietary ("UNLICENSED", `LICENSE`). The main process ships obfuscated and compiled to V8 bytecode.
- **Download:** homepage `https://krypt.cc/mirror` (`package.json` homepage, About page). The update check is **switched off**: `shared/version.ts` `UPDATE_CHECK_ENABLED = false`, with the comment "Off for the private beta (2026-10-25)… a private beta among friends". Version 1.0.0.

---

## 2. Features

Top bar (`src/shell/TopNav.tsx`): **Home · Discover · Check · Following · Activity · Wallet · AI**, plus Guides and Settings icons. The bar also has a chain picker, a Paper/Live master switch per chain, a balance display and a light/dark toggle.

### 2.1 Discover: the wallet leaderboard ("Scout")
*Files: `src/pages/Discover.tsx`, `shared/walletScout.ts`, `shared/walletScore.ts`, `shared/scoutSort.ts`, `electron/engine/walletScout.ts`, `electron/engine/scoutScan.ts`*

- **Views (segmented control):** Best to copy · Copier return · Week total · Most profitable · Most active · pump.fun top · Saved · The test.
- **Default ranking is "Least bad to copy" (`fLowerPct`).** Each wallet's follower result is a median that is pulled toward the week's market by an empirical-Bayes prior, then ranked on its **lower confidence bound** (z = 0.84). This stops "five lucky trades" from reaching the top. The prior is re-estimated weekly from the wallet universe, needing at least 30 wallets with 10+ copies. Otherwise it falls back to μ = −15.5% and k = 10. A wallet's own median is treated as its own evidence at **80 copies** (`RELIABLE_COPIES`).
- **Follower model:** the copy enters **2 s** after the leader on both legs (`FOLLOWER_LAG_MS = 2000`). The fill is the market as it stood when the leg was due. A coin that stops printing settles at its last mark after 10 min. Trades the wallet closed before a follower could land are "too fast" and count as unreachable. Costs are the paper model's (below). **Slippage is not modelled**, and the UI tooltips say so.
- **Columns:** Score (0–100 ring), median result per copy at the chosen size, the lower bound, "Copyable" (the share of their trades a copy could have joined), and Week total (with a tooltip for "mean without best 5").
- **Size picker:** 0.05 / 0.1 / 0.25 / 0.5 SOL (`SIMPLE_SIZES`). The figures re-price at that size because fixed network fees take a larger share of a small copy.
- **Filters (chips, each with a "why" tooltip):** No bots (sub-10 s median hold with 10+ trips, or 40+ trades in one minute) · Enough trades (5+) · You could have copied (25%+ reachable) · Holds over a minute · Trades most days (3+) · No hard exclusions (coin creators, launch-bundle buyers, buys within 5 slots of a coin's first trade, wash trades in one transaction, shared fee-payer).
- **Warning tags on rows** (`src/components/copy/WalletTags.tsx`): Bot, Few trades, Too fast to copy, Same few coins, Partly measured, Creates coins, **Mayhem coins**, Large size.
- **Weekly verdict banner** above the list:
  - **"Nobody to recommend this week."** It shows the least-bad wallet's per-copy result next to the **fee floor**, which is "a copy that goes nowhere".
  - Or it says "N wallets clear the fee floor this week", with the caveat that past winners were luck that reverted.
- **Compare:** up to 3 wallets side by side (Copy score, copier result, copier win rate, copyable share, their profit, median hold, days active, coins traded). Those wallets can then be followed "as a crowd".
- **Data sources:**
  - **Record live:** the live trade feed records wallets as they trade.
  - **Scan 1h / 6h / 24h:** up to 60 tokens × 3 pages. It reads the chain first through the user's Helius key and falls back to pump.fun history (free, one request every 2 s).
  - **Scan the week's winners:** up to 24 coins (16 young coins with market cap ≥150k and liquidity ≥20k, plus 8 runners with market cap ≥1M and 24h volume ≥500k). Each coin's whole week is read, at most 4,000 credits per coin.
  - **Check on the chain:** chain-checks the top 30 plus a random fifth of the rest, about 350–700 credits per wallet.
  - A credit meter shows usage against the monthly **backtest allowance (100,000 credits default)** (`shared/credits.ts`).
- **Record limits:** 45 days kept per wallet. Up to 6,000 ranked wallets plus 25,000 candidates per chain. Saved wallets are never evicted.
- **pump.fun top** (`src/components/copy/PumpBoard.tsx`): pump.fun's own top 100 by their own profit over a day, week or month. A **"Replay the top N"** button fills a "copying them" column with what a copy would have done.

### 2.2 Copy score (0–100)
*File: `shared/walletScore.ts`*

- Weighted checks:
  - follower return ×3
  - follower win rate ×2
  - reachable trips ×2
  - active days ×1
  - coins per trip ×1
- No score is given without the follower-return check, which needs 10 copied trips. A score also needs 5+ closed trips and 3+ resolved checks.
- Tones: 70 and above is good, 40 and above is mid. The code says the score "ranks LEAST-BAD TO FOLLOW. It is never an edge and the UI must not call it one." The UI tooltip reads: "Least bad to follow, not an edge."
- A **"Why this score"** panel on the wallet profile lists each check with its value and a note.

### 2.3 Wallet profile
*File: `src/pages/WalletProfile.tsx`*

- Opens from any Discover row. Panels: What they did / **What a copy of them would have got** (side by side) · Their profit over time · Why this score · How long they hold · How copies of those trades ended (distribution) · Your copies of them · Recent trades (They put in / They made / **A copy made**).
- "Check it on the chain's explorer" link.
- Once the chain has been read, the profile leads with the chain's figure and labels the feed's figure as "what the feed saw". The code comment gives the reason: one wallet showed 12 trades in a week where the chain held 508, and +17% where the replay read −21%.

### 2.4 Check: replay any wallet before following
*Files: `src/pages/Check.tsx`, `src/components/copy/ReplayPanel.tsx`, `shared/copyReplay.ts`, `electron/engine/copyReplay.ts`, `electron/engine/chainPrice.ts`*

- **Input:** a Solana address, a pump.fun username or a pump.fun profile link. The replay starts at once. Tags shown: "verified", "banned on pump.fun", "you follow them".
- **Newest:** the newest **30** finished trades. **Whole week:** every trade opened in the last 7 days, **up to 400 trips** and up to 5,000 transactions read. It shows the week total, the mean without the best 5 copies, and each day.
- **Pricing:** via the chain with a Helius key (about 300 credits, done in seconds). Without a key it uses pump.fun's swap API (free, one call every 2 s, about 2 minutes for 30 trips).
- **Sizing:** a fixed amount or a % of each of their trades with a cap, the same as a follow. "Follow" then opens the Follow page pre-filled. **Solana only** ("Replays read Solana only").
- **Extra checks on board labels:** wash trades, shared payer, sniper (within 5 slots of the coin's birth), launch-bundle membership, and a lag ablation at 0/1/2/4/9 slots.

### 2.5 Follow page: setup for a single follow
*Files: `src/pages/Follow.tsx`, `shared/copytrade.ts` (`followConfig`, `defaultConfig`, `validateConfig`)*

- **Whose trades:** paste an address, a pump.fun username, or pick one of Discover's suggestions. It shows their average buy, buys this week, finished trades and median hold.
- **How much per copy:** fixed SOL (0.05/0.1/0.25/0.5 offered, max 25 SOL) or % of their buy (10/25/50/100%, up to 500%) with a cap. A preview shows the copy against their buys of several sizes.
- **Limits (derived from the most one copy can spend):**
  - "Stop for the day after losing" = **3× copy size**
  - "Pause this wallet after losing" = **4× copy size**
  - At most **20** copies a day
  - At most **10** copies a minute
- **Defaults for every new follow:**
  - **Paper** mode, switched on
  - Copies their sells
  - **Ignores leader trims under 50% of their bag.** The leader's final sell is always mirrored.
  - **30-minute max-hold backstop**, which sells if a leader's sell was missed
  - Min liquidity $5,000
  - **Max slippage 8%** (comment: 87 sandwiches per 10k swaps at 10–20% slippage against 8 at 1–3%, Bitquery)
  - Delay 0
- **Advanced (on/off rows):**
  - **Strategy › Direction:** Copy / **Reverse** (buy when they sell; own exits default to TP +25%, SL −20%, max hold 30 min) / **Convergence** (Solana only; buy when ≥3 wallets from a set buy the same coin within 180 s; exit when 50% of them sell; the set can be followed wallets, saved Scout wallets, tracked wallets, top-N Scout wallets by any board sort, or a hand-picked list of up to 200) / **Watch only** (never trades; alerts on first buy, bought more, sold part, sold all, moved it away).
  - **Your own exits:** take profit, stop loss, trailing stop, sell after holding X min, **sell if the creator sells** (≥X% of their bag), **sell when it graduates** (to PumpSwap).
  - **Their sells:** ignore small trims; **"Follow them out another way"** (they leave via a stablecoin sale, a token-for-token swap or a transfer out).
  - **Which trades:** leader size band, buy each coin only N times, **one position per coin across all follows**, **trading hours** (presets Day 08–22, Work 09–17, Evening 17–01, Overnight 22–08).
  - **Which coins:** min liquidity, market-cap band, coin-age band, minimum Krypt score, pump.fun coins only, **"Never copy these"** blocklists of mints and creators (up to 100 each).
  - **Execution:** wait before copying (0–60 s), max slippage, copies per minute, **which wallet signs**.
  - **Your AI decides:** see 2.10.
- **"What will happen"** box: a plain-English summary of the config.
- All filters **fail closed**. A fact the engine cannot read refuses the copy, and the refusal is recorded.

### 2.6 Paper mode vs live mode
*Files: `shared/copytrade.ts` (paper cost model `PAPER_MODEL = 2`), `shared/exitBudget.ts`, `electron/engine/copyTrade.ts`, `src/shell/TopNav.tsx`*

- **Paper is deliberately harsh:**
  - It fills at the price *after* the user's delay, never at the leader's price.
  - It charges the venue fee per side (pump curve **1.25%**; EVM curves 1%) plus Krypt's 0.5%.
  - It charges the fast lane's fixed fees per transaction (priority floor, base fee and mean Jito/Helius tip, about 0.0035 SOL per round trip, which is about 7% of a 0.05 SOL copy).
  - Each skipped copy is recorded with its reason. Rows carry `paperModel` so older, kinder records are never mixed in.
  - EVM gas is not modelled.
- **Fee floor** ("a copy that goes nowhere"): **−10.5% at 0.05 SOL, −7.0% at 0.1 SOL** on pump (`feeFloorPct`, `walletScore.ts` comment).
- **Live:**
  - Arming takes three separate acts. First the follow is switched to Live, which disarms it. Then it is armed with a confirmation dialog. The top-bar master switch must also be on Live, and that asks "Switch to Live… real transactions".
  - **A live config never comes back armed after a restart** (`copyTrade.ts` ~L368).
  - **Smallest live Solana copy is about 0.03 SOL**, the size at which priority fees stay ≤10% of the copy (`MIN_LIVE_COPY_SOL`).
  - Pausing a follow stops entries only. Open copies are still sold out.
  - Live PnL is priced from the wallet's own confirmed fills: base units for sells, plus "Awaiting fill" or "unpriced" counts until the chain is read.
- Paper and live are **never added together** on Home, Following or stats ("different experiments").

### 2.7 Copy engine: detection, execution and latency
*Files: `electron/engine/walletWatcher.ts`, `electron/engine/copyTrade.ts`, `electron/engine/liveSigner.ts`, `electron/engine/broadcast.ts`, `electron/engine/dontFront.ts`, `electron/engine/pumpSwapBuilder.ts`, `electron/engine/txBuilder.ts`, `src/components/copy/CopyLatencyPanel.tsx`*

- **Detection:** each followed Solana wallet gets its own `logsSubscribe`. Two faster transports are used when available. Helius `transactionSubscribe` (paid plans) removes the read-back. **Helius Parsed Streams** (all plans, including Free) hears trades about **120 ms** before `logs`, and a clean curve buy needs no read-back. Swaps are decoded from the wallet's own **balance deltas**, so trades through any DEX are seen (pump curve, PumpSwap, routed Jupiter/Raydium/Meteora).
- **Missed-sell recovery:** a sell missed during a socket gap is recovered within **30 min** (`RECOVER_WINDOW_MS`). Anything older is recorded and never traded hours late.
- **Execution path** (same as Krypto Bot):
  - local transaction builder → simulate → loss guard → send lanes (RPC, **Helius Sender**, **Jito** bundle)
  - prewarmed blockhash and sockets
  - **exact-in buys** (spend is exact)
  - every buy carries Jito's **`jitodontfront`** marker. The code comment says it is "not protection, and the app never says it is".
  - **Mint guard** on Jupiter-routed copy buys refuses freeze authority, permanent delegate, non-transferable, transfer hook, transfer fee and default-frozen mints.
- **Graduation handling:** a trade refused because a coin is mid-migration (`BondingCurveComplete`) never counts as a failure. Its sell retries every 15 s for up to 10 min until the PumpSwap pool exists.
- **Copy-speed panel**, "Where a copy's time goes" (Following page and a Home card):
  - Their fill → ours · Heard about it · Read the tx · Decode · Checks · Your delay · Our order
  - "Landed after the leader: N slots" (live copies only)
  - medians over the session; an unmeasured stage shows "—", never 0
  - one timing log line per copy
- **Supported venues/chains:**
  - Solana: pump.fun curve, PumpSwap, plus Jupiter routing for anything else.
  - Robinhood Chain: Pons curve, Pons v4 / Uniswap v4, Uniswap v3 (`shared/evm.ts`).
  - BNB Chain: four.meme curve, PancakeSwap v2.
  - EVM leaders are seen only through that chain's scanner poll, which the app auto-starts when a follow needs it. EVM chains are **off by default**, with live caps of 0.003 (Robinhood) and 0.02 BNB per trade (`shared/evm.ts` defaults).

### 2.8 Risk controls and guardrails
*Files: `shared/copytrade.ts`, `electron/engine/copyTrade.ts`, `docs/copy-guardrails-2026-10-23.md`*

| Control | Default |
|---|---|
| Daily loss limit per follow | 3× copy size (simple/Follow page); 0.25 SOL in raw `defaultConfig` |
| Per-wallet loss stop (since switched on) | 4× copy size |
| Daily copy limit | 20 (max 500) |
| Burst wall | 10 copies per rolling 60 s (max 120); a refusal, not a queue |
| Max open copies across all follows | 5 (`DEFAULT_MAX_OPEN_COPIES`), paper and live counted apart |
| Pause after failed live buys | 3 in a row, always on (`COPY_FAIL_PAUSE`) |
| Max per trade | 25 SOL ceiling |
| Slippage | 8% default, 50% max |
| Live minimum | ~0.03 SOL |
| Max-hold backstop | 30 min, also checked on a 15 s clock for coins that stopped printing |

- House rules from the README: "An exit is never blocked by a fee, a breaker or anti-tamper" and "A budget is a refusal, not a clamp."
- The card shows engine pauses in amber, e.g. "Paused by the app 2 m ago — down 0.42 since it was switched on, past its 0.4 stop".

### 2.9 Following, Activity and Home
- **Following** (`src/pages/Following.tsx`): one card per follow.
  - Your copies: Result, Open, Copies, Skipped, Awaiting fill.
  - **Them over the same time:** Their profit, Trades, Won, Typical hold, **Too fast to copy**, Holding now. The gap between the two is "what following costs".
  - A Rules line.
  - Paper/Live and Following/Paused switches.
  - Watch status of each leader (watching / connecting / over-cap / off, plus "N trades could not be read").
  - The Address Book (names, tags, notes; import/export CSV/JSON; `src/pages/AddressBook.tsx`).
- **Activity** (`src/pages/Activity.tsx`), three tabs:
  - **Copies:** every copy, exit and skip in plain words, with skip reasons.
  - **Positions:** from Krypto Bot's portfolio page, including a **PnL share card** drawn on a canvas and exported as PNG with optional GIF backgrounds (`src/components/terminal/PnlCard.tsx`).
  - **Trade history:** includes **Trade replay**, an animated candle replay of a real trade with a running PnL, recorded straight to **WebM video** (`src/components/terminal/TradeReplay.tsx`).
- **Home** (`src/pages/Home.tsx`):
  - A "Getting started" checklist with 6 steps (follow first wallet → see first copy → add a free Helius key → create a wallet → optional pump.fun account → "Go live — only when the paper record earns it").
  - **Results:** realised after every fee, paper and live apart, with a **"Day by day"** chart covering the last 60 days.
  - Recent activity, your follows, Discover's least-bad suggestions ("Every one still lost on average"), and a Copy speed card.

### 2.10 AI desk (MCP: Claude Code, Codex, Cursor and others)
*Files: `src/pages/Ai.tsx`, `shared/aiDesk.ts`, `electron/engine/aiDesk.ts`, `shared/mcp.ts`, `electron/engine/mcpTools.ts`, `electron/system/mcpServer.ts`, `docs/ai-desk-2026-10-28.md`*

- **Server:** a local MCP server on loopback over Streamable HTTP at `/mcp`. Default port **8797**. Auth is a bearer token (64 hex characters) plus an Origin check. Server name `krypto-mirror`.
- **Access ladder:** Off / Read only / Paper trading / Live trading. The default is off; when enabled it starts at read.
- **Budget defaults:** max buy 0.1 SOL, 0.5 SOL per hour, 4 trades a minute.
- **Copy-paste setup snippets** for Claude Code, Codex, Claude Desktop, Cursor, VS Code, Windsurf, Gemini CLI, Cline, Zed and LM Studio, plus a stdio bridge and a generic option.
- **About 21 advertised tools**, e.g. `get_wallet_scores`, `get_wallet_record`, `get_copy_configs`, `wait_for_events` (a long-poll feed of leader trades, copies, skips and finished scans), `decide_trade`, `sell_copy`, `buy_token`, `sell_token`, `place_order`. "Tools take intents, never transactions." There are no settings writes, no withdrawals and no arming of follows.
- **Per follow ("Your AI decides"):**
  - The AI gets the final say on each buy and/or each sell, with a 15 s wait by default (3–45 s).
  - Timeout default: **skip** the buy. Exits always go ahead.
  - The AI can only *narrow* a decision: skip, buy smaller, hold, sell less.
  - **Protective exits (stop-loss, trailing, creator dump) do not wait** unless the user turns that on.
- **AI page:** a **starter prompt** that runs the desk loop, the follows the AI decides for, a live list of pending decisions, and a decision log (verdict, reason, time, what the follow did). It refreshes every 1 s.
- **Built-in research note:** the starter prompt and server instructions say "The app's own research found copying wallets loses money on average — skipping is a fine answer."

### 2.11 Wallets and key storage
*Files: `electron/system/wallet.ts`, `electron/system/walletStore.ts`, `electron/system/signPolicy.ts`, `electron/evm/evmWalletStore.ts`, `src/pages/WalletHub.tsx`*

- **Generated in-app** as a dedicated hot wallet. Import is also supported.
- **Key storage:** the secret is encrypted with **Electron `safeStorage`** (Windows DPAPI / macOS Keychain). The app **refuses to store a key** if OS secure storage is unavailable. The key is decrypted only transiently inside one module and is never sent to the UI, logs or config.
- **Signer outflow policy** (`signPolicy.ts`): before decrypting, it decodes every transaction and refuses any top-level SOL transfer that is not a tip account, the user's own withdrawal address, or a bounded relayer fee.
- **Wallet limits:** several Solana wallets are allowed, and each follow can sign with its own. The code allows `MAX_WALLETS = 15`, although a comment says ten. A per-wallet max balance defaults to 2 SOL.
- **EVM:** one EVM key list with one active signer per chain (Robinhood, BNB).
- **Wallet tabs:** Solana · pump.fun · (Robinhood Chain, BNB Chain when enabled). Actions: create/import, Paper/Live, per-trade max, send, back up.
- **Data folder:** `%APPDATA%\Krypto Mirror`. It is separate from Krypto Bot, so both can run side by side.

### 2.12 pump.fun accounts and auto-callouts
*Files: `src/pages/PumpTab.tsx`, `electron/engine/autoCallout.ts`, `electron/system/pumpRewards.ts`*

- **Accounts:** one per wallet. **Every account made or signed in here is referred by Krypt with code "kryptcc", which is mandatory** and disclosed on the screen, in the terms and in the privacy policy.
- **Callouts:** after a **live** copy's confirmed buy, the app posts a callout from that wallet's pump.fun account. Limited to once per 15 min per account, and only while the copy still holds. Paper posts nothing.
- **Rewards:** a callout-rewards panel. The Home checklist says "pump pays callers USDC rewards", which is a third-party program.

### 2.13 Other
- **Onboarding** (`src/components/Onboarding.tsx`): a hard legal gate. The clickwrap opens with **"You can lose everything"** and "This is not financial advice". The fee is disclosed in the accept summary, followed by a referral field, API keys and a tour.
- **Guides** (Settings › Guides): **7 bundled tutorial videos** with captions (quickstart, api-keys, follow-settings, discover-check, convergence, wallet-live, ai-desk; `resources/guides/videos/*.mp4/.vtt`).
- **Settings:** RPC endpoints, API keys (Helius key, credit meter, backtest allowance), market-data providers, EVM chains, display/lite mode for slow machines, logs.
- **Privacy:** no analytics SDKs found. Fonts are bundled locally so that no remote font request is made (`index.html` comment). The only krypt.cc network call found is the update check, which is disabled.

---

## 3. Research findings and data in the repo (reel stories)

The large datasets ("tapes") are **not in the repo**. They were recorded pump.fun curve firehoses, about 24 GB of JSONL per day, kept on an external drive (`E:/data/...` in `docs/wallet-convergence-2026-09-14.md`). The repo holds the write-ups and the shipped constants derived from them. The app itself does not replay the tapes. Check replays a wallet from the chain or pump.fun API, and the Scout records live trades into a local record.

| # | Story | Exact figures | Source | How solid |
|---|---|---|---|---|
| 1 | **Copying top memecoin wallets loses money** | Mirroring both legs of top wallets: median **−4.06% (Sept) / −6.64% (July)** per position net of 0.85%; win rate 36.9% / 33.3%; **median hold 0.1 min** | `docs/wallet-convergence-2026-09-14.md` | Strong for its scope: **9.3M curve trades**, two day-pairs six weeks apart (09-10→09-11, 07-26→07-27), 122,071 / 198,813 positions, train/test split. Survivorship flatters these numbers, so the truth is worse. Uses the older, kinder 800 ms lag and a lower cost model. |
| 2 | **The median profitable pump wallet holds 6 seconds** | "the median leader holds a position for six seconds"; their edge is latency | same doc; repeated in `shared/copytrade.ts` `COPY_LATENCY_FLOOR_MS` comment | Same dataset. A good hook. |
| 3 | **Top wallets beat random by a lot and still lose** | 60-min median: random buy **−59.7% / −59.5%** vs following one top wallet **−14.9% / −10.3%** (45–49 pts better); 85.0% / 85.1% of profitable wallets traded again the next day | same doc | Same dataset, with a random control. |
| 4 | **The more wallets pile in, the worse it gets** | Convergence of K top wallets within 5 min, 60-min median: K=1 **−14.9%**, K=2 −23.2%, K=3 −28.7%, K=4 **−32.1%** (8,016 four-wallet events in a day) | same doc; shown on the Follow page's Convergence row | Monotone in both periods. Solid. |
| 5 | **Ranking by follower result halves the loss, but no decile is profitable** | Top-N by the leader's own PnL: −6.52% / −10.99%; by follower result: **−3.42% / −4.11%**, win rate ~45%; best decile −1.2/−1.3%; **decile 9 beat decile 10 in both periods** | same doc (addendum) | Monotone across 10 deciles, 200k+ test positions, two periods. Basis for the Copy score. |
| 6 | **0 of 630 cells break even** | 3 held-out day-pairs, **3.03M leader trips**, lags 0.4–120 s, 2 sizes, 3 fill models: **0/630** decile cells reach breakeven at the median; best decile sits on the fee floor (−10.8% at 0.05 SOL, −7.6% at 0.1 SOL) | `docs/copy-trader-swarm-2026-10-23.md` §1, `docs/swarm-2026-10-23/lag.md` | Strong: an adversarial re-run reproduced it to the second decimal (`skeptic.md`). Tapes predate Alpenglow / 200 ms slots. PumpSwap/Raydium-stage leaders are not covered. |
| 7 | **Speed won't save you** | 1 s instead of 2 s improves the pooled median by only **0.4–0.8 pts**; pooled median −14.5 to −19.1% at 0.4 s, −15.6 to −20.4% at 2 s, −17.2 to −32.9% at 120 s; "$49/mo prebuild never reaches 0" | `docs/copy-trader-swarm-2026-10-23.md` §1, `docs/wallet-scout-research-2026-10-25.md` | Same lag study. |
| 8 | **Where an −18% copy loss comes from** | Fees ≈3.5 pts, fixed network fees ≈3.5, own impact ≈0.7, lag 0.4→2 s 1.1–1.6, dead coins 0.3–0.4, leader impact + adverse selection + bleed ≈8–11 | `docs/wallet-scout-research-2026-10-25.md` | A skeptic-derived decomposition. Partly estimated. Good for an explainer reel. |
| 9 | **The best self-traders are the worst to copy** | 9keCU8mg made **+71 SOL**, copies **−19.9%**; EqiFgyNw +64 SOL → −28.8%; DQMqCjCi +60 SOL → −28.6%; 47 leaders made >5 SOL that week, and their copies' median of medians was −10.3% | `docs/copy-candidates-2026-10-27.md` | Chain-priced, one week (10-20→10-27), 96 judged wallets. Use as anecdote, not statistics. Do not show addresses (see §7). |
| 10 | **Looks great on 30 trades, loses over the week** | 12 of 12 shortlisted Scout wallets failed a full-week chain check; the one that looked profitable on 30 trips lost **−9.8 SOL** over its week; 15 of 263 eligible were above zero, "about what luck alone produces" | `docs/copy-candidates-2026-10-24.md` | One week, 263 wallets. Clear method. |
| 11 | **Searched 7,828 traders, found two thin positives** | Winner-coin search: 21 coins, 7,828 traders, 42,070 credits → 47 replayed → **2 wallets week-positive**: +0.57 SOL on 59 copies at 0.1 SOL (median **−4.4%**, mean +9.6%, carried by 5 trips) and +0.18 SOL on 14 copies. "No wallet in either search has a copy median above zero." | `docs/copy-candidates-2026-10-27.md` | One week, thin samples, and the doc says so itself. Only usable framed as "even the best we found is luck-shaped". |
| 12 | **Bigger copies beat the fixed-fee floor** | The same wallet copied at 0.05 SOL: week median −5.7%; at 0.1: −2.2%; at 0.5: +0.6%; at 1 SOL: +1.0%; the confidence interval spans zero at every size | `docs/copy-candidates-2026-10-27.md` | n = 11 trips. **Anecdote only.** It illustrates fixed fees, not an edge. |
| 13 | **The winner's curse** | The week's top board wallet reads ~**15–35 pts** above its true value (30-trip median SE ≈ 9 pts; top of 263 ≈ 3.3 SE high) | `docs/wallet-scout-research-2026-10-25.md` | Labelled an estimate in the doc. Good explainer. |
| 14 | **Population prior: the typical wallet's copy loses ~15–20%** | Median per-wallet follower median: **−15.5%** (09-16 tape, 10,901 wallets); −18.2 / −19.5 / −19.0 / −18.0% on four other tapes | `shared/walletScore.ts` `RECORDED_POPULATION_MEDIAN_PCT`; `docs/copy-trader-swarm-2026-10-23.md` §3 | Measured across 5 tapes. Uses the 1.5%/side model with no fixed fees. |
| 15 | **pump.fun's #1 was +362,824% on one coin** | "the weekly #1 that day was +362,824 % on one coin" | `src/components/copy/PumpBoard.tsx` header comment | A single observation. Good hook, not a stat. |
| 16 | **Coin creators and mayhem coins copy worse** | Creators' copies −16.2% vs −9.5% for everyone else (09-16 tape); mayhem-coin trades 9–90 pts worse; large-size wallets −13.6% vs −9.8% (120 wallets only) | `shared/walletScout.ts` warning texts; `docs/copy-trader-swarm-2026-10-23.md` §4 | The creator figure is from one tape. Mayhem and size are held-out but small samples, and the swarm calls them "chips, not skips". |
| 17 | **Skipping small trims saves fees** | Ignoring leader sells under 50% of their bag: **+0.5 to +1.7 pts per copy**, all from fees; missing 15% of leader sells costs 0.6–2.1 pts, and the 30-min backstop recovers about a fifth | `shared/copytrade.ts` comments; swarm §4 | Held out on 3 day-pairs. A modest, honest product story. |
| 18 | **External corroboration** (quoted in repo) | White Whale Labs: 384M swaps / 7.7M wallets, copying 2 min behind clusters lost **41% per coin**. eToro: mirrored trades −61.24 bps vs −6.88 bps for users' own trades. The only positive paper (+3%) assumes **zero latency** | `docs/wallet-scout-research-2026-10-25.md`, swarm §2 | Third-party. Cite the original source, not Krypt. |

**Open experiment:** "The test" view (`shared/prereg.ts`, `src/components/copy/PreregPanel.tsx`) is a **pre-registered** weekly test. The picks are frozen and hashed before each week, and four arms are compared: TOP (the board's 10), RAND (10 random wallets), LEAD (pump.fun's leaderboard) and FLOOR/NONE. Each week settles from the chain at 0.1 SOL. It needs **8 weeks to a verdict** (futility check at week 4). It started around 2026-10-25, so **no result exists yet**. A reel could revisit it as an "honest experiment in progress" series.

---

## 4. What sets it apart (only what the code supports)

1. **It ranks by the follower's result, not the leader's PnL.** Copies are modelled 2 s late with all fees, and the ranking uses a shrinkage lower bound. Bots, too-fast traders, creators, bundlers and wash traders are filtered out. The repo's competitor table says GMGN, Bloom, Trojan, Axiom, Fomo and Maestro rank by the leader's own return (`docs/best-copy-trader-research-2026-10-21.md` §2; vendor docs, not re-verified here).
2. **It will say "Nobody to recommend this week."** The board shows the fee floor and labels results "least bad, not recommended".
3. **Paper is the default, and paper is realistic.** It charges delay, venue and Krypt fees, and fixed network fees. Every skip is recorded with its reason. Per the same table, no listed competitor has a paper mode (Maestro has "track only").
4. **You can replay any wallet before following.** It works on any Solana address or pump.fun username, for the newest 30 trades or a whole week (up to 400), priced 2 s behind on both legs.
5. **The keys stay local.** They are OS-encrypted, and a signer outflow policy re-checks where SOL goes before every signature. Competitors in the table hold server-side bot wallets.
6. **It measures copy latency per stage** (heard, read, decode, checks, delay, order, slot gap) and shows "—" instead of 0 when a stage was not measured.
7. **An AI desk over MCP** lets the user's own Claude Code, Cursor, Codex and similar tools approve or veto each copy. The AI can only narrow a decision, it works within a spend budget, and protective exits never wait for it.
8. **Guardrails are on by default:** 3× daily stop, 4× per-wallet stop, 5 open copies app-wide, pause after 3 failed buys, 30-min backstop, 8% slippage, no auto-arm and no armed restart.
9. **Unusual directions:** Reverse, Convergence (crowd) and Watch-only. These ship with the research numbers on the form (e.g. the Convergence −15% → −32% figure).
10. **The fee is 0.5% flat per side.** The doc lists competitors at about 1%. Note: pump.fun's own app charges 0.45%, so the doc says do **not** claim "cheaper than pump.fun".

---

## 5. Planned / not wired

- **Chat-bot alerts (Telegram/Discord).** The backend and IPC exist (`electron/system/bots.ts`, `ipc.ts` `bots:*`), but **no UI calls them** (`grep window.krypt.bots` in `src/` finds nothing). The Follow page still says Watch-only alerts are "sent to your chat bots", so a user has no way to pair a bot. Only in-app toasts and desktop pop-ups are usable.
- **Update check:** disabled (`UPDATE_CHECK_ENABLED = false`, "private beta").
- **macOS/Linux installers:** configured in CI but not built locally. All builds are unsigned.
- **Live copying has not been tested end to end with real money, per the docs.** `docs/copy-trader-swarm-2026-10-23.md` §7 says "nothing was signed or sent". `docs/engineering-2026-10-24.md` says "Not exercised live: everything above". `docs/copy-guardrails-2026-10-23.md` says "nothing here was run against a real wallet". Docs say **no live copy timing measurement exists**. The live order pipeline is Krypto Bot's. Whether that pipeline has a live track record was not checked here, but no live Mirror copy has been measured.
- **Pre-registered test:** running, no verdict for about 8 weeks.
- **Slippage** is not modelled in the Copy score, the board or the replay; the UI says so. **EVM gas** is not modelled in paper.
- **Check/replay and Convergence are Solana-only.** EVM follow only sees launchpad-curve and DEX trades via the scanner poll.
- **Translations are partial.** 8 locales exist (en, es, ko, pt-BR, ru, tr, vi, zh-CN; about 110 strings each), but most UI text is hard-coded English (only about 18 `t()` calls across pages). Do not claim "8 languages".
- **From the 10-23 "Next" list, not built:** rent read from RPC, mayhem/large-size as *skip* filters (they are warnings only), a sandwich detector on fills, and replication on a post-Alpenglow tape.
- **Inherited Krypto Bot code** sits in the tree but has no page here: Krypto Trader/Krypto Mode sessions (MCP tools hidden), launch tools, farming, bridge and others. Do not present any of it as a Mirror feature.

---

## 6. Visual moments for video

1. **"Nobody to recommend this week."** Discover › Best to copy, amber verdict banner with the least-bad wallet's result vs the fee floor. *Trigger:* open Discover with a populated record; pick a 0.05 SOL size for the starkest floor.
2. **Most profitable vs Best to copy flip.** Switch the view between Most profitable and Best to copy and the list reshuffles; the profit kings carry Bot / Too fast to copy tags. *Trigger:* Discover view segmented control.
3. **pump.fun leaderboard replay.** Discover › pump.fun top › "Replay the top N"; the "copying them" column fills row by row with red numbers next to huge profit figures.
4. **Check a wallet by pump.fun username.** Type a username into Check, and the replay starts; trades fill in with "They made" vs "A copy made" side by side. *Trigger:* Check page, then the Whole week toggle for the week total and "mean without best 5".
5. **Size toggle moving the fee floor.** On Discover or Check, click 0.05 → 0.1 → 0.25 → 0.5 SOL and watch the figures and the floor re-price (−10.5% → −7.0% → …).
6. **Copy score ring and "Why this score".** Open a wallet profile from Discover; the ScoreRing plus five weighted checks with notes.
7. **Compare three wallets.** Tick 3 rows → Compare panel → "Follow these as a crowd" button.
8. **Follow page "What will happen".** Paste an address, switch fixed ↔ % of their trade, and the preview against several buy sizes plus the plain-English summary update. Open Advanced to show the Direction segmented control (Copy / Reverse / Convergence / Watch only) with its research text.
9. **Going live friction.** Follow card Paper → Live (it disarms) → arm confirmation → top-bar "Switch to Live" modal ("REAL transactions"). Shows the safety story.
10. **Copy-speed panel.** Following, "Where a copy's time goes": seven stage tiles plus the "Landed after the leader: N slots" line. *Trigger:* needs a few copies this session (fewer than 5 shows "too few to read").
11. **Following card gap.** Your copies' Result next to "Their profit" and "Too fast to copy" for the same period.
12. **Activity › Copies skip reasons.** A scrolling list of skips in plain words (e.g. "limit: N copies open across all follows").
13. **AI desk live.** AI page with Claude Code connected: pending decisions appear and the decision log fills with buy/skip verdicts and one-line reasons. *Trigger:* turn the AI on (Paper trading access), paste the Claude Code command, run the starter prompt, and set "Your AI decides" on a paper follow.
14. **Trade replay to WebM.** Activity › Trade history: open a trade, candles animate with entry/exit markers and a running PnL, then export to video. The PnL card is the PNG equivalent (Positions tab).
15. **Onboarding "You can lose everything".** The first-run clickwrap, as an honesty beat.

Note: the board needs data. Use "Record live" or "Scan the week's winners" (needs a Helius key and spends allowance credits) before recording Discover shots.

---

## 7. Claims to avoid

- **Any profit, "make money copying", "find winning wallets", "smart money", or "beat the market" claim.** The app's own research and UI say copying loses on average. The Copy score is "least bad, not an edge".
- **"Fastest" or speed claims.** No live copy timing has been measured (docs §5). The research says speed is worth only 0.4–0.8 pts.
- **"Protected from sandwiches/MEV".** The `jitodontfront` marker is explicitly "not protection" (`dontFront.ts`).
- **"Safe" or "can't lose your funds".** Say instead: the key is encrypted locally, there is an outflow policy, and there are limits. The legal summary says "You can lose everything".
- **"Cheaper than pump.fun".** pump.fun's own app charges 0.45%, below 0.5% (swarm §6).
- **"Tested live" / "battle-tested copy engine".** The docs say the guardrails and fixes are offline-tested only.
- **Naming or promoting the two "week-positive" wallets** (CyrZnTp2…, DxBphjLC…) or any other real address as picks. That implies a recommendation, the samples are thin (14–59 copies), and these are real people's wallets.
- **Presenting the pre-registered test as a result.** It has no verdict yet.
- **"Telegram/Discord alerts".** Not pairable in the UI.
- **"8 languages".** Translation is partial.
- **"Works on Mac/Linux"** until signed builds exist. Even the Windows build is unsigned.
- **Hiding the mandatory pump.fun referral ("kryptcc")** when showing the auto-callout feature.
- **The Scout's pump.fun reads (swap-api scans, home-feed) may conflict with pump.fun's updated Terms** (§6.1, §21; swarm §6, "a decision for the user"). Avoid making "scrapes pump.fun" a headline.

**Existing repo copy that over-claims or is inconsistent:**
- Follow page Watch-only text, "sent to your chat bots" (`src/pages/Follow.tsx` L327, L646, L875): the bots cannot be paired.
- `package.json` `build.extraMetadata.description` "local-first **Solana** copy trading" and Linux `synopsis: "Solana copy trading"` conflict with the three-chain description.
- README "Discover: … ranked by Copy score": the default board sort is actually "Least bad to copy" (the EB lower bound, `SCOUT_RANK_SORT = 'fLowerPct'`). The Copy score is a separate column/sort.
- README "with the fast execution path of Krypto Bot underneath" and package description "fast execution path": true as code lineage, but not backed by any measured Mirror live latency.
- `walletStore.ts` comment says "at most ten Solana wallets", but the code allows 15.
- `src/pages/Home.tsx` checklist: "pump pays callers USDC rewards" is a third-party program claim. Verify it before reuse.
- About/README "No telemetry": no analytics found and the update check is off. Fair as written, but the app does call third-party APIs (pump.fun, Jupiter, GeckoTerminal, Helius, Dexscreener, Birdeye and others).

---

## 8. Existing marketing copy in the repo

- `package.json` description: "A free, local-first copy trading app for Solana, Robinhood Chain and BNB Chain. Find wallets worth following, copy them on paper first, then live — with the fast execution path of Krypto Bot underneath. Part of the Krypt free tools suite."
- `README.md`: "Free to download. No ads, no telemetry, no subscription, no Krypt account."
- `README.md`: "Measured over two separate periods on our own recorded data, **copying memecoin wallets loses money on average**."
- `README.md`: "it ranks the least bad, not a winner. Nothing in this app predicts what a wallet will do next."
- `README.md`: "That is why every follow starts on **paper**, and why paper is deliberately harsh".
- `README.md` safety rules: "A live config never comes back armed after a restart." / "An exit is never blocked by a fee, a breaker or anti-tamper." / "A budget is a refusal, not a clamp."
- `src/pages/About.tsx`: "Free. No ads. No telemetry." / "It ranks wallets by what a follower would actually keep, follows them on paper first, and copies live from a wallet whose key never leaves your machine, for a flat 0.5% a side. Everything unknown renders as a dash, never a fabricated zero."
- `src/pages/WalletHub.tsx`: "Keys are encrypted on this computer and never leave it."
- `src/components/Onboarding.tsx`: "Find someone worth following" / "Paper first, always: Every follow starts on paper… so a flat round trip loses."
- `src/pages/Discover.tsx`: "Nobody to recommend this week." / "ranked least bad, not recommended." / "Measured across 9.3 million trades, ranking wallets by what a copier keeps beats ranking by their own profit — and still no group of wallets was profitable to copy after costs."
- `src/pages/Home.tsx`: "Go live — only when the paper record earns it" / "Least bad to copy this week… Every one still lost on average."
- `src/pages/Following.tsx`: "Pick a wallet… and follow it on paper. Nothing is spent until you say so."
- `shared/aiDesk.ts` starter prompt: "The app's own research found copying wallets loses money on average — skipping is a fine answer."
- `shared/legal/documents.ts` clickwrap: "You can lose everything" / "This is not financial advice".
- `docs/wallet-scout-research-2026-10-25.md` title (internal): "Build the Scout That Can Recommend Nobody", a strong reel line.
