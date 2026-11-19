# Krypto Bot: feature catalog

Source: `C:\Users\Krypt\Desktop\kryptware\kryptsniper` (folder name is the old "Krypt Sniper"). Version **6.2.0** (package.json, built installer `release/Krypto Bot-Setup-6.2.0.exe`, 2026-10-26). Read-only audit, 2026-10-31. Every item below was checked in source; paths are relative to the repo root. Secrets and wallet files were not opened.

**Naming:** the product name is **Krypto Bot** (package.json `productName`, installer, About subtitle, Discord presence, watermarks). The UI is not consistent, though:
- Onboarding header reads "KRYPT TERMINAL" (`src/components/Onboarding.tsx:319`).
- The About card wordmark reads "Krypto Terminal" (`src/pages/About.tsx`).
- The npm name is `krypto-terminal`.

Use "Krypto Bot" in reels and expect the old names to show up in screen recordings.

---

## 1. What it is

Krypto Bot is a free desktop trading terminal for **Solana memecoins**, with secondary support for **Robinhood Chain (Pons launchpad)** and **BNB Smart Chain (four.meme)**. You use it to:
- find new, graduating and migrated tokens;
- check a token's security and launch history: the dev's buys, bundles, snipers and what they still hold;
- chart a token down to 1-second candles;
- trade by hand from a local hot wallet.

Underneath sits the original "Krypt Sniper" engine. It watches pump.fun on-chain in real time, flags potential runners and paper-trades for research. It **never trades on its own**: `autoLiveActive()` returns `false` (`electron/engine/engine.ts:3013`).

**Who it's for:** active Solana memecoin traders, mainly pump.fun, who want trench tools (scanner, bundle/sniper analysis, stops and take-profits, copy trading, scripts) without a Telegram bot custodying their keys. The terminal is local-first and has no Krypt account.

**Platform and distribution:**
- Electron 43 desktop app.
- Targets: Windows NSIS installer (the shipped build), macOS dmg/zip and Linux AppImage/deb (`package.json` → `build`).
- PUBLISHING.md says macOS and Linux are configured but "untested".
- Builds are **unsigned**: Windows shows SmartScreen and macOS Gatekeeper blocks the app.
- GitHub Actions builds draft releases (`.github/workflows/release.yml`).
- Download points to **krypt.cc**:
  - `homepage` is `krypt.cc/tools/terminal`;
  - the in-app update link is `https://krypt.cc`;
  - watermarks use `krypt.cc/bot` and `krypt.cc/tools/krypto`.
  - These are three different URLs. Pick one for the reels.

**Price and licence:**
- Free download. No subscription, no ads, no telemetry.
- Krypt takes a **0.5% fee per side on every trade** (1% round trip) (`shared/fees.ts` FEE_BPS=50).
- Holding ≥1,000,000 $KRYPTO cuts it to 0.25%/side (`shared/krypto.ts`).
- Licence is **contradictory**:
  - README and package.json say MIT, but package.json also has `private: true` and there's no LICENSE file;
  - the in-app Terms grant a personal, revocable, non-redistributable licence.
  - **Do not call it open source.**

---

## 2. Features

App structure (`src/workspaces.ts`, `src/components/Sidebar.tsx`):
- The app opens on a **Hub** with 9 workspace cards: Terminal, Automation, Main Engine, Wallet Utilities, Guides, Wallet Scout, Launch a Token, Widgets, Settings & Legal.
- The sidebar then shows only that workspace's pages.

### 2.1 Discover: live token columns
**Files:** `src/pages/Discover.tsx`, `src/components/terminal/TokenCard.tsx`, `FilterBar.tsx`, `SortBar.tsx`, `shared/market.ts`, `electron/data/market.ts`

**Columns.** There are four live columns: **New / Graduating / Migrated / Trending**.

| Column | Sources | Refresh |
|---|---|---|
| New | pump.fun, Jupiter recent, GeckoTerminal LaunchLab/Boop pools, plus the engine's own tape every 1s (top 40) | ~4s |
| Graduating | pump.fun, GeckoTerminal DBC/LaunchLab/Boop with curve progress read on-chain, plus engine live curves | ~8s |
| Migrated | pump.fun migrated, GeckoTerminal new pools, Raydium pools read on-chain | ~16s |
| Trending | Jupiter top-traded | ~8s |

- The base refresh is 8s (settable 2–300s); the column cadences above are multiples of it.
- Columns show 40 rows by default (5–80). Clicking a column title expands it into wide one-line rows.

**Token card**
- Header: MC, liquidity, volume, buy/sell count, holders, Krypt score, age.
- Launchpad tag: PUMP, BONK, MOON, BLV, BOOP, RAY, MET, PONS, HOOD, 4MEME.
- Social icons and a "DEX" paid chip.
- Bars for Dev %, Top-10 %, Bundle % and curve %, drawn on a purple→gold gradient.
- A green glowing dot means "this app has its own live tape for this token".
- An odds chip, e.g. "Grad · Top 1–5 % · 17 in 100".
- A rose rug-rule badge. There is deliberately never a green "safe" badge.

**Filter bar**
- Window: 5m / 1h / 6h / 24h.
- Launchpad chips with live counts: Pump.fun, LetsBonk, Meteora DBC, Boop, Moonshot, Believe, Raydium, Pons, four.meme.
- "Hide flagged launches", **on by default**.
- "Odds ≥" bucket filter and a text search.

**Filters panel**
- 18 min/max ranges: age, MC, liquidity, volume, txns, buys, sells, B/S ratio, holders, holder growth, top-10 %, dev %, insider %, sniper %, bundled %, smart holders, curve %, score.
- Requires X / Telegram / Website / DEX-paid, and a "Hide bad creators" toggle.
- A filter on a metric that hasn't loaded yet **skips** that token instead of hiding it.

**Six built-in presets** (`shared/market.ts`):

| Preset | Rules |
|---|---|
| Fresh Pump.fun | ≤900s old, curve 2–60% |
| Safe Migrated | liq ≥$25k, top10 ≤30%, dev ≤3%, score ≥70 |
| High Momentum | 5m vol ≥$15k, B/S ≥1.4 |
| Low Bundles | bundled ≤8%, sniper ≤12%, dev ≤2% |
| Smart Money | ≥1 smart holder |
| Degenerate | ≤300s old, 5m vol ≥$2k |

**Quick buy**
- A ⚡ button on every card. Default 0.1 SOL (0.01 ETH on Robinhood, 0.02 BNB on BNB).
- It's a real one-click broadcast on Solana when live is armed and the wallet is funded.

### 2.2 Token page: chart, trades, trader scan
**Files:** `src/pages/Token.tsx`, `src/components/terminal/KryptChart.tsx`, `electron/engine/chartTicks.ts`, `electron/data/tape.ts`, `TradesPanel.tsx`

**Chart** (TradingView lightweight-charts)
- Intervals **1s, 5s, 15s, 1m, 5m, 15m, 1h, 4h**. Default 1m, 500 candles.
- **MC / Price toggle**, default MC.
- Live ticks are throttled to 125 ms (~8 updates/s).
- Sub-minute candles come from the app's own tape ("Taped live" badge) when the engine is scanning, or from Birdeye with a key. That's how a coin no provider has indexed yet still gets a 1s chart.
- Armed orders draw as coloured price lines: SL/TRAIL rose, BUY emerald, TP accent, paused orders gold and dashed.
- Buy and sell fill markers are **not** drawn (markers array hard-coded empty, `Token.tsx:583`).

**Header and tabs**
- Header: price, MC, liquidity, holders, 24h, age, score, Solscan, "Open in Krypto Trader".
- Tabs: Security | Links | Launch | Holders | Live trades | Trader scan | AI.
- Right column: graduation odds, trade panel, position, orders, alerts, top 5 pools.
- **Live trades:** time, side, wallet and MC from the app's own tape. Last 80 trades, refreshed every 3s.
- **Trader scan:** per-wallet bought, sold, holding, realized and time held.
- Tape coverage: up to 8 mints, 20k ticks each.
- Wallets are missing on LaunchLab and Raydium AMM trades. The row says why.

**Token tabs:** up to 12 open tokens. Ctrl+T / Ctrl+Tab / Alt+1–9 (`src/components/TokenTabs.tsx`).

**Search:** Ctrl+K: "Search or paste a contract address…". A pasted CA opens even with every provider off (`TokenSearch.tsx`).

### 2.3 Launch analysis and creator record (pump.fun only)
**Files:** `src/components/terminal/LaunchPanel.tsx`, `electron/data/launchIntel.ts`, `shared/launchintel.ts`, `electron/engine/creators.ts`

**Launch cohorts**
- Works on any pump.fun CA, however old.
- Rebuilds the first trades from pump's keyless trade API, then one on-chain balance read.
- **Dev / Bundle / Snipers** cards show % of supply bought, **still holds now**, % kept, wallets still in, and SOL spent.
- Bundle = same slot as the first trade. Sniper = within 20 slots (~8s).
- Danger colours: dev ≥10%, bundle ≥20%, snipers ≥25%.
- "Launch buyers" table: wallet, cohort, slot +N, bought, holds now.
- If the launch block can't be isolated, the panel says "Launch cohorts not measured" and shows no numbers.

**Creator track record**
- Launches, graduated count and rate, busiest 24h, median peak, recent launches as chips. Capped at 200 launches.
- Verdicts:
  - "Launch factory" at ≥10 launches in 24h;
  - "N launches, none graduated" at ≥8 launches with no graduations.
- The local creator DB adds "Seen by this app: N launches, M dumped".

### 2.4 Security report and rug rules
**Files:** `src/components/terminal/SecurityPanel.tsx`, `shared/market.ts` (securityChecks/scoreChecks), `shared/rugrules.ts`, `electron/data/providers/rugcheck.ts`, `electron/data/onchain.ts`

**Krypt Score** (ring out of 100) is a weighted average over the gates that **actually answered**:
- **10 gates on pump.fun, 9 elsewhere:**
  - mint authority, freeze authority, token program (warns on Token-2022);
  - liquidity (pass ≥$25k);
  - sellable (Jupiter Shield);
  - creator rug history and insider network (RugCheck);
  - launch factory, pump.fun ban, creator history.
- With **fewer than 4 answered**, it shows no score: "Not scored. Only N of M gates returned an answer — too few to average honestly."
- **Mint and freeze authority** are read from the user's own RPC ("Read from the chain by this app"), not from a third-party flag.

**Measured rug rules R1–R5**, from n=27,937 pump.fun launches on 2026-07-27:
- R1 one buy is half the SOL
- R2 sells ≥1.5× buys
- R3 creator sold with curve <2%
- R4 wash volume (≤2 buyers, ≥3 SOL)
- R5 launch factory (warn only)

R1–R4 drive Discover's default-on "Hide flagged launches". The UI's own claim is that it "removes about 70 % of launches that die within 10 minutes… What remains is still ~77 % dead or dumped".

**Volatility notes:** top-3 ≥25%, ≥40% bundled, ≥25% sniped, creator ≥10%, creator sold. Each shows its historical dumped %, graduated % and n.

**Descriptive section**, labelled "no measured edge": socials, DEX paid, boosts, CTO.

**Limits**
- Rug and odds features are **pump.fun only**.
- They're display and filters: they do **not** block a manual buy or an order. Only the scanner's paper pipeline hard-rejects (`electron/engine/risk.ts`).

### 2.5 Holders and holder map
**Files:** `HoldersPanel.tsx`, `HolderMap.tsx`, `holderLayout.ts`, `electron/data/holderGraph.ts`

**Holder list**
- 50 holders shown. RPC gives the top 20; Birdeye with a key gives up to 100; RugCheck is the fallback.
- Tags: DEV, SMART (wallets you labelled), WHALE (≥5%), LP, INSIDER (RugCheck fallback only).

**Holder map**
- An SVG bubble chart: area = share of supply, colour = role.
- **"Analyse funding"** traces the first funder of up to 25 holders (~60 RPC calls).
  - It ignores CEX hot wallets (Binance, Coinbase, Bybit, Kraken, OKX, Bitget, KuCoin).
  - It draws funder→holder edges, lists "N funding clusters found", and tags wallets under a day old as FRESH.
- Caveat on screen: "A shared funder means SOL moved between wallets — not that one person controls them."

### 2.6 Graduation odds and Runners
**Files:** `OddsPanel.tsx`, `shared/odds.ts`, `shared/odds-model.json`, `src/pages/Runners.tsx`, `shared/runners.ts`

**Odds model**
- A logistic model on rank features from a pump.fun launch's first 60s or 120s of trades (buy count, unique sellers, net SOL, creator share, top-3 buyer share, sniper share, …).
- Fitted on 2026-07-25/26 data and tested on held-out 07-27, ~27.9k launches per window. AUC ~0.79–0.96 by label.
- The UI shows **observed bucket rates, not a probability**: "About N in 100 launches like this graduated (n=…). Base: …", footer "Past rates, not a prediction for this token."
- Buckets: Top 1% / 1–5% / 5–10% / 10–25% / 25–50% / Bottom 50%.
- At +60s it also shows 3× and 5× within-the-hour lines.

**Runners page ("Potential runners")**
- Launches the model puts in the **Top 5%** bucket.
- Defaults: on, at most 12 pushed alerts per hour, flags expire after 15 min.
- Each row: observed vs base rate, sparkline, move since flag, net SOL, % of supply sold, Krypt score, plus Buy/Sell buttons.
- Desktop notification: "Potential runner: SYM … nothing is bought for you".
- Optional Discord webhook, off by default.
- **Requires the scanner running.** Pump.fun only.

### 2.7 Trade panel and execution
**Files:** `src/components/terminal/TradePanel.tsx`, `PositionPanel.tsx`, `electron/engine/liveSigner.ts`, `txBuilder.ts`, `pumpSwapBuilder.ts`, `jupiterRoute.ts`, `relayer.ts`, `broadcast.ts`, `jitoTips.ts`, `prewarm.ts`, `src/pages/Execution.tsx`, defaults in `shared/types.ts` DEFAULT_SETTINGS

**Trade panel**
- Buy presets 0.05 / 0.1 / 0.25 / 0.5 / 1 SOL (default 0.1). Sell presets 10 / 25 / 50 / 75 / 100% (default 100%).
- Buys and sells are **one click**, with no confirm dialog.

**All-in cost line, shown before you click**
- "Est. fees …", itemised on hover:
  - pump.fun 1%
  - Krypt 0.5% (or 0.25% for holders)
  - priority fee (0.001 SOL fast)
  - tips (~0.0005)
  - network fee
  - refundable token-account rent ~0.002 SOL
- Also shown: slippage cap and MEV mode.
- A 100% sell closes the token account and reclaims rent.

**Build path**, tried in order: local pump.fun curve builder → local PumpSwap builder → Jupiter (keyless, routed only through allow-listed DEXes) → **PumpPortal** `trade-local` relayer (unsigned tx, +0.5% relayer fee).
- The local builder is on by default and pays no relayer fee.

**What can be traded on Solana**
- Built locally: pump.fun bonding curve and PumpSwap.
- Via Jupiter or PumpPortal: Raydium (v4/CPMM/CLMM), LaunchLab, Meteora (DLMM/DAMM/DBC), Orca.
- **Boop curve coins are not tradable**: their program isn't allow-listed.

**Landing**
- One signed tx goes to three lanes at once:
  - your RPC;
  - **Helius Sender** (free, staked);
  - **Jito** bundle-only, tip at the live p75 tip floor (sells p95).
- Resent every 2.5s until confirmed or expired.
- No bloXroute, Nozomi, 0slot or NextBlock.
- On arm, connections are pre-warmed (TLS, tip floor, blockhash, lookup tables).
- Every trade log or toast carries real per-hop timing ("build · tips · sim · send · land · total").

**Defaults**

| Setting | Default |
|---|---|
| Buy slippage | 12% (sells floored at 15%; a failed sell retries once at up to 35–50%) |
| Priority fee | floor 0.001 SOL buy / 0.002 SOL sell, cap 0.01 |
| Fee lane | fast |
| MEV mode | fast |
| Compute units | 120k |

**Execution page**
- Live priority-fee ladder (p50–p95 µlamports/CU) and live Jito tip floor.
- Fee mode Fast/Lean (Lean ≈0.00001 SOL/side, "Lands in seconds rather than the first slot").
- Fee urgency normal / competitive / high / emergency.
- Sandwich protection: Public / Fast / Private. Private sends buys only through Jito, and the page itself says the protection is "unmeasured".
- Banner: "Nothing on this page buys on its own."

**Safety checks before signing**
- Every trade is **simulated before signing**, with a loss bound.
- The signer (`electron/system/signPolicy.ts`) refuses:
  - unknown programs, including ones hidden in lookup tables;
  - SOL transfers anywhere except tip accounts, the fee addresses (exact amounts), a capped relayer fee, or your own withdrawal address;
  - a foreign fee payer.

### 2.8 Advanced orders and auto-sell templates
**Files:** `shared/orders.ts`, `electron/engine/advOrders.ts`, `src/components/terminal/OrdersPanel.tsx`, `src/pages/Orders.tsx`, `shared/orderTemplates.ts`, `TemplatePanel.tsx`

**Order types**
- Stop loss, trailing stop, take profit.
- Limit buy and limit sell, triggered on USD market cap or SOL price.
- **Sell if dev sells**, **Sell on migration**, **Buy on migration**.
- Partial sells 1–100%.
- Form defaults: stop 30%, TP +50% selling 25%, trailing 15%. At most 200 orders, optional expiry.

**Evaluation:** on every tape trade for taped mints; otherwise polled every 12s.

**Guarantees, pinned in code**
- Exactly-once: the state is written to disk before signing.
- No retry after broadcast.
- Orders come back **paused** after a restart, with "Resume all".
- A blocked order stays armed and warns instead of being spent.
- Breakers block buys, never sells.

**Live only.** "Orders are live-only — switch to Live to arm them. There is no paper version of a stop loss."

**Auto-sell templates** ("On every manual buy:"), off by default:

| Template | Rules |
|---|---|
| Runner | −35% stop, +100% sell 40%, +300% sell 50%, 30% trail, exit if dev sells |
| Scalp | −20% stop, +40% sell all, exit if dev sells |
| Stop only | −30% |

You can save up to 8 custom templates.

### 2.9 Paper mode
**Files:** `shared/paper.ts`, `electron/engine/paperBook.ts`, `SwitchToPaper.tsx`, `ResetPaperButton.tsx`

- Top-bar Live/Paper switch.
- **Live is the default once a wallet exists.** With no wallet, everything runs on paper.
- Any disarm (by you, a breaker, or a pump.fun program upgrade) persists Paper.
- How paper buys are priced:
  - normally the real build→sign→simulate pipeline runs and stops before broadcast;
  - with no wallet, the fill is the live price minus 1.5% (1% pump + 0.5% Krypt).
- Paper sells fill at the last price −1%.
- There's no virtual starting balance. Limits: 200 open / 500 closed paper positions; "Reset paper trades".

### 2.10 Portfolio, Trades, PnL cards and trade replay
**Files:** `src/pages/Portfolio.tsx`, `src/pages/Trades.tsx`, `shared/portfolio.ts`, `electron/engine/ledger.ts`, `PnlCard.tsx`, `TradeReplay.tsx`, `SimulateTrade.tsx`, `gifExport.ts`

**Portfolio**
- Chain holdings joined with a local fill ledger.
- Cost basis is the wallet's **actual lamport change** per transaction, so fees, tips, rent and slippage are all included.
- **Average-cost PnL.** An unknown basis shows "—", never 0.
- Tiles: total value, unrealized, realized, win rate, profit factor, fees paid. Plus a realized equity curve.
- **CSV and JSON export.**
- An "All chains" toggle aggregates across chains.

**Trades page:** one row per round trip, read from the chain.

**PnL card**
- 16:9 canvas in Void, Gold or Crimson style.
- Background: GIPHY/Tenor GIF (your own key) or your own image or video.
- Exports PNG, GIF (≤60 frames, 800px) or MP4/WebM with audio.
- Only available for positions with a known cost basis.

**Trade replay**
- Animated candles appear one by one with entry and exit marks and a running PnL counter.
- **9:16 (720×1280, "TikTok, Reels, Shorts")** or 16:9; speeds 1/2/4×; "Save video".

**Simulate trade** builds a made-up trade (Dip-then-run / Spike-then-fade / Steady / Chop) for the card and replay. It's always labelled simulated.

### 2.11 Alerts, watchlist, hotkeys
**Files:** `shared/alerts.ts`, `electron/engine/alerts.ts`, `AlertsPanel.tsx`, `src/pages/Watchlist.tsx`, `shared/hotkeys.ts`, `HotkeySettings.tsx`

**Alerts**
- 12 kinds: price above/below, MC above/below, 5m volume, liquidity below, holders, curve passes X%, creator sells, migrates, tracked wallet buys/sells.
- Once or repeat (60s cooldown). At most 300.
- Delivered as desktop notifications; the engine doesn't need to be armed.

**Watchlist:** local, cross-chain, refreshes every 20s. "nothing about this list leaves your machine."

**Hotkeys**
- **Off by default**, with confirmation **on** by default.
- Bindings: 1/2/3 = buy 0.1 / 0.25 / 0.5 SOL; q/w/e = sell 25 / 50 / 100%; Shift+S = emergency sell 100%.
- Ignored while you're typing.

### 2.12 Live engine, scanner and Observatory
**Files:** `electron/engine/feed.ts`, `pumpDecoder.ts`, `ammDecoder.ts`, `dbcWatcher.ts`, `launchLabWatcher.ts`, `boopWatcher.ts`, `raydiumWatcher.ts`, `liveCurves.ts`, `scoring.ts`, `programWatch.ts`, `decoderVerify.ts`, `src/pages/Dashboard.tsx`, `src/components/viz/Radar3D.tsx`, `src/components/AutomationBar.tsx`

**Racing socket pool**
- Parallel `logsSubscribe` sockets; the first arrival wins via a shared dedupe.
- Built after measuring ~20% silent event loss on one public socket.
- Default sockets: Solana mainnet-beta + publicnode. Helius is optional with your key.
- Plus a `blockSubscribe` standby, default on.

**What's watched**
- **pump.fun is watched program-wide** and decoded locally from Anchor events. This is the only full launch scanner.
- PumpSwap migrations and new Raydium pools are also watched program-wide.
- **Meteora DBC (LetsBonk/Believe), LaunchLab and Boop** get a live tape **only for the token you have open** (DBC max 3 pools).
- Graduating and Migrated lists are computed locally from the firehose.

**Pump upgrade watchdog:** if the pump.fun program is upgraded, live trading disarms, the decoder is re-verified against the chain, and it re-arms only if verification passes.

**AutomationBar:** pulsing feed dot, Ev/s, "Latency" (local decode time only, **not** detection speed) and slot. Plus a "Kill switch".

**Observatory** ("The Scrying Orb")
- A three.js globe where every pump.fun launch is a spark. Gold shockwaves mark paper entries, crimson ones rejections.
- Animated "Launches observed" counter and a "Session ledger" with an equity chart, labelled "Paper session · research positions, not real money".
- Launch-rate bars, pipeline strip.

**Observatory · Robinhood (Pons) / · BNB (four.meme):** launch tables with buys and buyers at 60s and 120s, polled every 4s / 6s. Measured only, no score.

**Opportunity score** (out of 100) is hand-weighted. The tooltip says "no measured hit rate".

**Other pages**
- Launches: live pump.fun creations, "Potential runners", "Blacklist creator".
- Strategy: paper-entry gates; "Paper entries (research)" is **off by default** because "the measured record is negative".
- Backtest: 9 sliders over recorded trades.
- History: needs the recorder, which is **off by default**.
- Console: live engine log.

### 2.13 Copy trading (paper-first)
**Files:** `src/pages/CopySimple.tsx`, `src/pages/Wallets.tsx`, `electron/engine/copyTrade.ts`, `walletWatcher.ts`, `shared/copytrade.ts`, `shared/walletScore.ts`

**Copy Simple**
- Paste a wallet (Solana or 0x), pick 0.05 / 0.1 / 0.25 / 0.5 per trade.
- The only button is "**Follow on paper**". The daily loss limit is 10× the trade size.

**Copy Trading** (full controls)
- Three directions: **copy**, **reverse** (buy when they sell), **fomo** (N wallets buy within a window; default 3 wallets / 180s).
- Defaults: 0.05 SOL, max 0.1, min liquidity $5k, slippage 15%, mirror sells, daily loss 0.25 SOL, 20 trades/day, delay 0–60s.
- Optional filters: MC, score, pump-only, token age, blocklists. At most 25 configs.

**Honest paper record**
- Fills are priced **after your configured delay**, with both-side fees.
- Skipped trades are logged with reasons.
- Going live is a separate confirmed modal ("Arm LIVE copy trading"). After a restart, live configs return exits-only.

**Coverage**
- Solana: any DEX (watches the wallet itself, decodes balance deltas).
- Robinhood and BNB: curve trades.

**"Where a copy's time goes" panel:** per-stage median latency (their fill→ours, heard, read tx, decode, checks, delay, order).

### 2.14 Wallet Scout
**Files:** `src/pages/Scout.tsx`, `electron/engine/walletScout.ts`, `scoutScan.ts`, `shared/walletScout.ts`

- Leaderboard of wallets on Solana / Robinhood / BNB over Today / 7d / 30d / All.
- Built from the engine's live decoders or a manual "Scan the past": 1/6/24h of pump.fun trade pages, Pons or four.meme logs.
- **Copy score** = median net per copied trip, **assuming fills 2s late with costs**. Also: reachable %, their win rate, trips, median hold, bot marks.
- Five quality filters (off by default, one-click all on).
- "Add to copy trading on PAPER".
- The code calls the Copy score "LEAST-BAD TO FOLLOW. It is never an edge".

### 2.15 Krypto Trader: one-coin bot with presets or AI
**Files:** `src/pages/KryptoTrader.tsx`, `src/components/trader/*`, `electron/engine/kryptoTrader.ts`, `shared/kryptoTrader.ts`, `shared/botStrategy.ts`, `shared/ai.ts`, `electron/data/aiAnalysis.ts`

**What it is:** one coin, one of your wallets, one budget, on Solana, Robinhood or BNB. "**Start (paper)**" is the only start button; "Go live…" is separate and confirmed.

**Presets**

| Preset | Rules |
|---|---|
| Hold with a stop | default |
| Trim and rebuy | — |
| Take profit in steps | +50 / +100 / +200%, 25% each |
| Buy dips | 4 lots at −20%; "never a 2× Martingale" |

Each preset card shows its tested result, mostly a negative median (e.g. "survivors n=176 median −15.1%").

**Drivers**
- Preset rules: "Nothing leaves your machine".
- **AI (your key)**: Claude Haiku 4.5 / Sonnet 5 / Opus 5.5 or GPT-5 mini / GPT-5, called directly from the app to api.anthropic.com or api.openai.com. Shows a daily $ cost estimate and cap (default $2/day).
  - The AI can only act inside the preset envelope and your limits.
- MCP: an external AI.

**Budget and limits**
- Budget 0.02–100 SOL (default 0.5). Max loss 35%, 24h limit.
- Anti-wash pacing: 120s minimum hold, 600s no-rebuy, 6 trades/hour, each buy ≤1% of pool depth, all editable. Turning one off warns "is wash trading — you are responsible".
- Fit-check card: venue, depth, budget cap, age, activity, creator, safety, round-trip cost.
- Session cards: equity, fees, "**vs just holding**", next trade.

### 2.16 AI connection (MCP) and in-app AI analysis
**Files:** `electron/system/mcpServer.ts`, `electron/engine/mcpTools.ts`, `shared/mcp.ts`, `src/pages/AiConnection.tsx`, `AiPanel.tsx`, `AiSettingsPanel.tsx`

**MCP server**
- Local **MCP server** on `127.0.0.1:8787/mcp`: Streamable HTTP, bearer token (32 random bytes), loopback origin only.
- **Off by default**. Access ladder: off / read / paper / live.
- **22 tools.**
  - 16 read: get_wallet, get_positions, get_token, find_tokens, get_chart, get_runner_alerts, get_trade_history, …
  - 6 trade: buy_token, sell_token, place_order, cancel_orders, krypto_mode_trade, trader_act.
  - No tool can export keys, withdraw, transfer or change settings.
- Live AI budget: 0.1 SOL per buy, 0.5 SOL/hour, 4 trades/min.

**Supported clients**
- Copy-paste configs for **Claude Code** (`claude mcp add --transport http …`), Claude Desktop, ChatGPT desktop/Codex, Cursor, VS Code Copilot, Windsurf, Gemini CLI, Cline, Zed, LM Studio, and stdio apps via `mcp-remote`.
- Cloud chat apps (claude.ai web, ChatGPT web) are explicitly listed as unable to connect.

**AI tab on a token**
- Off by default. Bring your own OpenAI or Anthropic key (defaults gpt-4o-mini / claude-sonnet-5).
- Runs only when you click "Analyze <SYM>".
- Output: AI score 0–100, a verdict of ≤4 words, For/Against bullets.
- Disclaimer "automated, often wrong, and NOT financial advice". Token text is fenced as untrusted (prompt-injection guard).

### 2.17 Scripts (sandboxed automation)
**Files:** `src/pages/Scripts.tsx`, `electron/system/scriptSandbox.ts`, `shared/automation.ts`, `electron/engine/automation.ts`, `bundled/scripts/*.js`

**Two kinds**
- **No-code rules:** ≤20 conditions, ≤8 actions.
- **JavaScript:** runs in a hidden sandboxed Chromium window with no Node, no filesystem and no network. Every action is checked by main.

**API and events**
- ~60 `bot.*` methods: buy/sell/order, holders/trades/candles, launchIntel, security, callout, discord, AI analyze, aioMove.
- Events: launch, runner, migration, devSell, tick, schedule, …
- An `@inputs` comment block renders a settings form.
- The Reference tab has an "**AI prompt**" pack for getting any LLM to write a script.

**Budget defaults**
- 0.05 SOL per trade, 20 buys/day.
- Daily loss stop 0.5 SOL (or 25% of the wallet, whichever is smaller), which disables the script.
- 3-loss pause (configurable 0–50), 5 open positions, 30 actions/min.

**Safety:** paper by default; live is separate and never comes back armed after a restart. 7 example scripts.

**Two shipped scripts** (installed off, paper):
- **"Callout Farm"**: buys a tiny bag in a flagged runner, posts a pump.fun callout, then exits. Its own header says it "will on average breakeven or lose slightly, where we win is callout rewards".
- **"Graduation Scalper"**: buys at 95% curve and sells ~8s after graduation. Its header says "Expect a few percent NEGATIVE per trade".

### 2.18 Wallets and key handling
**Files:** `electron/system/wallet.ts`, `walletStore.ts`, `signPolicy.ts`, `seedPhrase.ts`, `aioWallet.ts`, `electron/evm/evmWalletStore.ts`, `src/pages/Wallet.tsx`, `AioWallet.tsx`, `src/pages/lab/Creator.tsx`, `Funder.tsx`

**Key storage**
- Keys are generated in-app (ed25519) or imported.
- Encrypted with **Electron safeStorage** (Windows DPAPI / macOS Keychain). If secure storage is unavailable, the app refuses to store a key.
- A key is decrypted only at signing, zeroed afterwards, and never sent to the UI.
- Changing the withdrawal address needs an **OS-native dialog**. Sends to typed addresses need a native confirm, valid for 120s.

**Wallet list:** up to **15 Solana wallets** (20 EVM), one active signer, each with its own pump.fun account.

**Funder:** sends SOL to selected wallets, **12 transfers per tx** (so 15 wallets = 2 txs), and "Collect back". Destinations are restricted to the install's own wallets.

**All-in-One wallet** (v6.0)
- One 12-word phrase for Solana + BNB + Robinhood. Phantom/MetaMask derivation, plus a scan of alternative paths on import.
- One **USD total** (also reads Ethereum/Base/Arbitrum balances).
- Cross-chain moves via **Relay** ("about 2–6 seconds" per release notes).
- "**Top up + buy**": funds a buy on one chain from another.
- Optional float, gas refuel, and "Compress" everything into one coin.

**Housekeeping**
- Swap page: any→any via Jupiter, slippage 1%.
- "Reclaim rent" closes empty token accounts, ~0.002 SOL each.
- "Sell dust" sells tokens under $0.50.
- USDC auto-swap to SOL is **on by default** while live.

**Bridge:** native coins across Solana/BNB/Robinhood via Relay, **off by default**, $5 minimum, 0.5% fee.

**Send:** pay any address, address book, **no Krypt fee**.

### 2.19 pump.fun social: accounts, auto-callout, launch a token
**Files:** `src/pages/PumpAccounts.tsx`, `electron/system/pumpAuth.ts`, `pumpBrowserSignIn.ts`, `shared/pumpProfile.ts`, `shared/pumpReferral.ts`, `src/pages/AutoCallout.tsx`, `shared/calloutAuto.ts`, `src/pages/Launch.tsx`, `shared/launch.ts`, `shared/kryptoMode.ts`

**pump.fun accounts**
- Sign every wallet's pump.fun account in at once, and renew sessions for all in one click.
- Import an existing account, or sign in with email/Google/Apple through your own Chrome or Edge.
- Bulk names, follow/like, and caller stats (share of calls peaking at 1.2× / 1.5× / 2×, time to peak).
- Rewards panel reads pump.fun callout rewards (USDC).
- pump.fun creator-fee claim for coins you launched.

**Auto-callout** (off by default)
- Posts a public pump.fun callout from the account of the wallet that bought. Checks pump's eligibility endpoint first (≥$1 held, one per coin).
- Options: like your own callout, call out your launches, mirror to a Discord webhook.

**Launch a token** (off by default)
- Needs a dedicated launch wallet.
- Solana → pump.fun (create + first buy, min 0.01 SOL); Robinhood → Pons (atomic launch+buy).
- Optional **$Krypto Mode** bot that trades your own launch from a disclosed bot wallet (written into the coin metadata).
- The page states that ~2% of launches graduate.

**Forced attribution on the user's public posts**
- pump.fun bio line "Using krypt.cc/bot", re-added if removed.
- Rotating credit lines on callouts and launches.
- Krypt's referral code `kryptcc` on every pump.fun account made or signed in here.

### 2.20 Chat bots, Discord, notifications
**Files:** `electron/system/bots.ts`, `telegramBot.ts`, `discordBot.ts`, `shared/botTrading.ts`, `electron/system/discord.ts`, `discordWebhook.ts`

**Telegram and Discord bots**
- You bring your own bot token and pair it with a 6-digit code.
- Commands: /status /positions /pnl /wallet /alerts /orders /price, and /buy /sell.
- Chat trading is **off by default**, and buys need a second switch.
- Limits: 0.1 SOL per buy, 0.5 SOL/hour, confirm code within 60s, 4 trades/min. No withdraw command.

**Discord Rich Presence**, **on by default**: "Scanning Pump.fun launches · N seen", paper PnL, buttons "Free Tools" and "$KRYPTO".

**Discord webhooks:** runner flags, callouts, script embeds.

### 2.21 Customisation, Widgets, Guides, Profiles
**Files:** `src/pages/Workspace.tsx`, `src/panels/registry.tsx`, `src/panels/GamesBody.tsx`, `src/state/skin.ts`, `shared/theme.ts`, `shared/i18n/*`, `src/pages/Guides.tsx`, `src/guideVideos.ts`, `electron/system/profiles.ts`

**Widgets**
- 17 widgets on a drag/resize grid: engine, wallet, session PnL, positions, live launches, orders, fills, chart, links webview, runner alerts, callouts, games, …
- **Any widget pops out into its own frameless window.**
- **Games widget: Snake, Flappy Crypto, Dino, Tetris, 2048.**

**Looks**
- 6 skins: Classic (Cinzel, engraved), Futuristic (Orbitron), Minimal, **Hacker** (VT323, scanlines, blinking cursor), **Retro** (Press Start 2P, CRT), **XP/Y2K** (Luna blue, Bliss sky).
- 5 accent colours. Liquid-glass panels and a WebGL "poured chrome" backdrop.
- Tome3D spinning spellbook on the Sol Wallet page.
- Lite mode ("Laggy? Lite mode").

**Languages (8):** English, 简体中文, 한국어, Русский, Español, Português (BR), Türkçe, Tiếng Việt.

**Guides:** 11 written guides, 8 bundled offline videos (~1.5–2.5 min each), YouTube links.

**Profiles:** up to 20 isolated copies of the app running side by side, each with its own wallets and settings. Clones start in Paper.

### 2.22 Data sources and privacy
**Files:** `electron/data/http.ts`, `MarketDataSettings.tsx`, `electron/data/images.ts`, `electron/system/updateCheck.ts`

**No Krypt backend.**
- The only call to krypt.cc is `version.json` (30s after start, then every 6h). The code notes the site currently answers it with HTML, so the check likely shows "could not check".
- No analytics SDK.

**Market and on-chain sources**
- Keyless, on by default: **Jupiter** (lite-api.jup.ag), **DexScreener**, **pump.fun** (frontend-api-v3 and swap-api), **GeckoTerminal**, **RugCheck**.
- Key required: **Birdeye** (sub-minute candles, full holders, trade backfill).
- **Helius** RPC/Sender with a free key, recommended.
- Your Solana RPC is authoritative for mint/freeze authority and holders.

**Market data settings**
- Lists every provider with live calls, errors and latency.
- **One switch turns all providers off**; the on-chain feed and engine keep working.
- Hosts are hard-coded; the UI can't supply a URL.

**Token images** go through a hardened `krypt-img://` handler: https only, private IPs refused, 1.5MB cap.

**Telemetry:** none. Logs are local with keys redacted. The support bundle is user-initiated.

---

## 3. What sets it apart (code-backed only)

1. **Keys stay on your machine, encrypted by the OS.** It isn't a Telegram bot holding your keys. A transaction-level signer policy refuses unknown programs and unexpected transfers before the key is even decrypted.
2. **Launch forensics on any pump.fun CA**: dev / bundle / sniper cohorts **and how much they still hold now**, plus a creator track record that catches "launch factories". Free, no API key.
3. **"Unknown is a dash, never a zero."**
   - The security score averages only the checks that answered, and refuses to score below 4.
   - Mint and freeze authority come from your own RPC read.
   - PnL with an unknown basis shows "—".
4. **Its own on-chain feed**: a racing socket pool decoding pump.fun events locally. This gives **1-second candles and live trades for coins no chart site has indexed yet**.
5. **Measured, published odds.** Runner flags show the historical graduation rate for the bucket next to the base rate, not a "100x gem" score. Rug rules quote their measured trade-off.
6. **Paper-first for anything automated** (copy, Krypto Trader, scripts, AI over MCP). Copy-trade paper fills include your real delay and both-side fees.
7. **Real stop-loss engine semantics**: exactly-once, paused after restart, never retried after broadcast, breakers never block sells. Dev-sell and migration triggers too.
8. **AI-native:** a local MCP server lets Claude Code, Claude Desktop, Cursor and others read the app and, if you allow it, trade paper or live within a hard budget. There's also a BYO-key AI driver for Krypto Trader.
9. **Multi-chain from one phrase:** Solana + Robinhood Chain (Pons) + BNB (four.meme), a USD total, and "Top up + buy" across chains.
10. **Content-creator tooling built in:** a 9:16 animated trade-replay video export, PnL cards with GIF/video backgrounds, and 6 skins.
11. **Honest costs:** an itemised all-in fee estimate before you click, and portfolio cost basis taken from the actual on-chain lamport change.

---

## 4. Planned / not wired

| Item | Status | Where |
|---|---|---|
| Farming page | "Not built yet… none of it is wired". Only a friction calculator works. | `src/pages/Farming.tsx` |
| Discover "All chains" | "the every-chain feed is coming". Shows one chain at a time. | `src/pages/Discover.tsx:227` |
| Buy/sell markers on chart | Hard-coded empty array; only order lines draw | `src/pages/Token.tsx:583` |
| SNIPER holder tag | Styled, never assigned | `HoldersPanel.tsx` / `market.ts` |
| Token-2022 extension warnings in Security tab | Only a generic Token-2022 warning there; extension details show on holdings and sell failures | `mintExtensions.ts` |
| Launch scanning for DBC / LaunchLab / Boop / Raydium | Per-open-token tapes only; full launch scan is pump.fun only | `dbcWatcher.ts` etc. |
| Boop trading | Program not allow-listed | `signPolicy.ts` |
| Local builders for Raydium / Meteora / LaunchLab | Jupiter or PumpPortal relayer only | `liveSigner.ts` |
| Copy trading on LaunchLab / DBC | Trades carry no wallet | `launchLabWatcher.ts` |
| Paper versions of advanced orders | Live-only | `OrdersPanel.tsx` |
| Launching on BNB / four.meme | Only Solana (pump.fun) and Robinhood (Pons) | `shared/launch.ts` |
| KryptCurveRouter contract (EVM fee router) | Written, **not deployed** (`kryptRouter: ''`) | `contracts/`, `electron/evm/chain.ts:57` |
| Max-balance cap (2 SOL) | UI warning only; nothing enforces it | `src/pages/Wallet.tsx:715` |
| Script backtest | "Not done yet" | `docs/user-scripting.md` |
| Update check | Code done, but krypt.cc serves HTML for version.json | `electron/system/updateCheck.ts` |
| Simultaneous multi-wallet bundle buys | Deliberately removed (Groups/Copier gone) | `shared/multiWallet.ts` |
| Code signing; macOS/Linux builds | Unsigned; mac/Linux untested | `PUBLISHING.md` |
| Odds / rug rules / runners outside pump.fun | Not modelled | `shared/odds.ts` |

**Default-off features.** These are wired, but footage of them needs the switch flipped first:
- Bridge, Launch, auto-callout, MCP, AI analysis, chat-bot trading, hotkeys;
- auto-sell templates, live loss breakers, recorder, paper auto-entries, shadow strategy labs;
- Birdeye (needs a key), Helius socket.

---

## 5. Visual moments for video

1. **Observatory "Scrying Orb".** Main Engine → Observatory. Click Scanners → Solana in the AutomationBar and wait ~1 min. Launch sparks hit a spinning 3D globe, gold/crimson shockwaves fire, and the "Launches observed" counter ticks. Lite mode must be off.
2. **Discover columns filling live.** Terminal → Discover with the scanner running, preset "Degenerate" or "Fresh Pump.fun". The New column refreshes every ~4s, with green live-tape dots and purple→gold curve bars. Click a column title for the wide view.
3. **1-second chart on a brand-new coin.** Open a just-launched pump coin from New while scanning ("Taped live" badge), pick 1s. Candles update ~8×/s. Flip the MC/Price toggle.
4. **Order lines on the chart.** On the token page, add a stop loss and a take profit. Rose and accent lines appear on the chart; pause one and it turns gold and dashed.
5. **Launch tab forensics.** Paste any pump.fun CA with Ctrl+K → Launch tab. Dev / Bundle / Snipers cards with "still holds" and the launch-buyers table.
6. **Holder map funding trace.** Holders tab → Map → "Analyse funding". Bubbles get funder edges and the cluster list appears.
7. **Security tab.** Score ring and rose rug-rule cards. Pick a fresh pump coin to show "Not scored. Only N of M gates…", which shows the honesty angle.
8. **One-click buy with cost breakdown.** Trade panel: hover "Est. fees" to show the itemised breakdown, then click Buy 0.1 SOL. The toast shows per-hop timing. Use Paper mode for a safe take: it shows "Paper buy".
9. **Runner notification.** With the scanner on, a desktop toast pops: "Potential runner: SYM … nothing is bought for you". Then cut to the Runners page sparklines.
10. **Trade replay in 9:16.** Trades → Simulate trade ("Dip, then run") → replay in 9:16 at 2×, candles drawing with a PnL counter. Must be labelled simulated on screen. Save video is native to the Reels format.
11. **PnL card with a GIF background.** Portfolio or Trades → card → Gold style + GIF → Save GIF. Use a real position, or label it simulated.
12. **Claude driving the app over MCP.** Automation → AI connection, set access to Read, copy the Claude Code command. In a terminal, ask Claude "what are the current potential runners?" and it calls `get_runner_alerts`.
13. **Copy Simple.** Paste a wallet, click "Follow on paper", then show the "Where a copy's time goes" latency strip on Copy Trading.
14. **Skins montage.** Settings → Looks: Classic → Hacker (scanlines) → Retro (arcade) → XP (Bliss sky).
15. **Widgets + pop-out + games.** Widgets: drag panels around, pop the chart into its own window, play Tetris in the Games widget "between candles".

Also good: the Sol Wallet Tome3D spellbook, and the Hub's liquid-chrome backdrop with frosted tiles.

**Recording hygiene**
- Never show the wallet page's private key, the MCP token, API key fields, recovery phrases, or "Export keys".
- Note that Discord presence is on by default and broadcasts session PnL.

---

## 6. Claims to avoid

**Profit and performance**
- **No profit, ROI, win-rate or "alpha" claims.** The repo itself says six months of research "failed to find a profitable automated memecoin strategy". The shipped scripts' headers say they break even or lose. Krypto Trader preset cards show negative medians. Wallet Scout's Copy score is "never an edge".
- Don't present odds as predictions. Say "about 17 in 100 launches like this graduated historically", not "17% chance". Never "finds 100x gems" or "catches runners early".

**Speed**
- **No "fastest" or guaranteed speed edge.** The UI's own copy is "Best landing odds" and "Lands in seconds". The "Latency" readout is local decode time, not detection speed.
- Code comments hold internal measurements (e.g. "build 213 · … · total 1036ms", "Helius delivers 92% of pump events FIRST, a median 150ms ahead") but these are not product guarantees. Don't claim "first slot" or "beats other bots".
- Private/MEV mode: the app says the protection is "unmeasured". Don't claim "sandwich-proof" or "MEV protection".

**Safety and security**
- **No "rug-proof", "safe" or "scam detector".** The rug filter's own tooltip says what remains is "~77% dead or dumped". Rug checks are display-only and don't block manual buys. Mint/freeze checks are pump.fun-guaranteed facts, not general safety.
- "Your keys never leave your machine" is true for **wallet keys** (OS-encrypted). It is **not** true that all secrets are encrypted:
  - AI keys, the Helius key and the MCP token sit in plaintext `settings.json`, and the settings object is sent to the renderer (`electron/ipc.ts:1027`);
  - the comment "a key never crosses to the renderer" in `shared/ai.ts` is false.
- Don't say "encrypted by Windows" for Mac or Linux (the onboarding copy does). Don't claim the 2 SOL balance cap protects you (not enforced).

**Price and licence**
- **"Free"** applies to the download only: trades pay 0.5%/side to Krypt, plus pump.fun 1%, priority fees and tips. Say "free to download, 0.5% per trade".
- **"Open source / MIT"**: contradicted by the in-app Terms. Avoid.

**Automation and AI**
- **"Bot trades for you / autopilot"**: the scanner never trades. Automation (copy, scripts, Krypto Trader, MCP) is opt-in, paper-first and budget-capped.
- "Krypto **Bot**" as a name invites "it trades for you" assumptions. Counter it in the script.
- Krypto Mode's AI goal "**Support the price**" ("lift the coin's price and market cap") reads as market-making on your own coin. Don't feature it.
- Avoid "launch your own coin and make money": the app itself states ~2% of launches graduate.
- **"AI picks winners"**: the AI tab says "automated, often wrong, and NOT financial advice".

**Platform**
- Mac and Linux are configured but **untested and unsigned**. Market as Windows.

**Repo copy that over-claims or conflicts with code**
- `src/pages/Backtest.tsx:81`: "Find edge before shipping it live." Implies edge exists.
- `src/pages/Dashboard.tsx:252` and History: a "Win rate" stat coloured green at ≥50% on paper sessions. Fine in-app; don't screenshot it as a claim.
- Strategy hints cite in-sample stats ("Winners averaged 0.75 sells…"). A `shared/types.ts` comment says "lifted win 43%→51%" (in-sample).
- README: "Linux… refuses to create or import a wallet" without a keyring. Code guarantees this only for the All-in-One phrase.
- README: "Copy Trading… Group Wallets / Funder… fund them… in one transaction". The code batches 12 per tx, and Groups were removed.
- `src/components/terminal/BotsPanel.tsx` comment "The bots are READ-ONLY". Chat trading exists (default off).
- Games widget description lists 4 games; there are 5.
- PUBLISHING.md says "There is no updater and no version check yet". A version check exists.
- `shared/types.ts` calls the local tx builder "EXPERIMENTAL — default off". It is on.

---

## 7. Existing marketing copy found in the repo

**`package.json`, description**
> "A free, local-first Solana memecoin trading terminal. Discover, analyse and trade — with a live launch scanner and automation engine built in. Part of the Krypt free tools suite."

**`README.md`**
> "**A local-first Solana memecoin trading terminal.** Free to download. No ads, no telemetry, no subscription, no Krypt account. Krypt takes 0.5% of each side of a trade you execute through it"

> "Every number on screen carries where it came from, and **a number nobody could produce is shown as an em dash, never as zero.**"

> "Krypt charts a token **from its own live feed**, which is why 1-second candles exist here for coins that no chart provider has indexed yet."

> "Krypt has **no backend**. Your machine talks to these hosts directly, so Krypt never learns what you trade"

> "That negative result is why this is now a terminal you drive rather than a bot you trust, and why there is no win-rate claim anywhere in this README."

**`src/pages/About.tsx`**
> "Free. No ads. No telemetry."

> "A local-first Solana memecoin trading terminal. It reads new launches directly on-chain across Pump.fun, LaunchLab, Meteora and Boop, scores the first seconds of real trading, checks holders, the dev's history and bundle/sniper cohorts, and lets you trade manually from a wallet whose key never leaves your machine. Everything unknown renders as a dash, never a fabricated zero."

Note: "reads new launches… across Pump.fun, LaunchLab, Meteora and Boop" overstates it. Only pump.fun is scanned program-wide; the others are taped per opened token.

**Workspace blurbs, `src/workspaces.ts`**
> Terminal: "Find a token, read it, and trade it by hand."

> Wallet Scout: "What wallets actually did, on every chain. Find someone worth following — or find out nobody is."

> Launch a Token: "Create your own token. Off by default, with a wallet of its own — and honest about what it is worth."

> Widgets: "Your own screen, made of widgets. Choose them, drag them where you want."

**`src/pages/CopySimple.tsx`**
> "Most wallets lose money to follow; the record shows you before you pay."

**`src/pages/Wire.tsx`**
> "The state of the rails you trade on, and who is paying for placement. No headlines"

**`docs/RELEASE-NOTES-6.0.0.md` (also `release/RELEASE-NOTES-6.0.0.md`)**
> "One wallet for every chain. The All-in-One wallet holds Solana, BNB and Robinhood Chain on one recovery phrase, shows one balance in dollars, moves money between its chains in seconds, and can fund a buy on one chain from another in a single click."

**Watermarks** (`shared/calloutAuto.ts`, `shared/launch.ts`, `shared/pumpProfile.ts`)
> "Called with krypt.cc/bot", "via Krypto Bot", "Launched with krypt.cc/bot", "made with Krypto Bot", bio: "Using krypt.cc/bot"

**Discord Rich Presence** (`shared/presence.ts`)
> "Scanning Pump.fun launches · N seen", "Idle in Krypto Bot", buttons "Free Tools" → krypt.cc/tools, "$KRYPTO"

**$KRYPTO card** (`src/components/KryptoCard.tsx:159`)
> "Use Krypto Bot at half the fee" / "Half fees on Krypto Bot — active"

**Sidebar hints** (`src/components/Sidebar.tsx`)
> AI connection: "Let an AI like Claude read the app (MCP) and, if you allow it, trade through it"

> Krypto Trader: "Trade one coin from one wallet with a preset or an AI — paper first"
