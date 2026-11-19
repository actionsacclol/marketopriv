// The built-in Krypt tools catalog: everything a Marketo user (and their AI)
// needs to make a reel about a krypt.cc tool. It is compiled into the app:
// there is no switch for it and nothing to delete.
//
// Facts come from the public pages (krypt.cc/tools and each tool's own page)
// and from each app's own source and docs at the version its page ships,
// read on KRYPT_PACK_READ. Pages change: when a reel leans on a number (a fee,
// a version, a count), check the tool's page first.

export const KRYPT_PACK_READ = '2026-11-13';

export interface KryptTool {
  id: string;
  name: string;
  tagline: string;
  category: 'Trading' | 'Utility' | 'Degen' | 'Donor';
  /** The link for end cards. */
  url: string;
  platforms: string;
  /** What the page says about price, in its own terms. */
  price: string;
  /** Version on its page when it was read. */
  version?: string;
  /** When it was read, if later than KRYPT_PACK_READ. */
  read?: string;
  /** What it is, in a few sentences. */
  about: string;
  /** The short list: what it does. */
  features: string[];
  /** Everything else its page says, grouped. */
  details: Array<{ title: string; points: string[] }>;
  /** Reel angles that fit it. */
  angles: string[];
  /** Things a reel about it must not say or do. */
  avoid: string[];
  /** False until the tool has its own public page. */
  released?: boolean;
  /** A longer catalog in the playbook (get_playbook doc), when one ships with this build. */
  doc?: string;
}

const TRADING_AVOID = ['Profit promises, win rates as a pitch, or a "proven edge"', 'Anything that reads as financial advice; keep "Not financial advice." on screen'];
const PREDICTION_SAFETY = ['Starts on Paper, and every engine ships switched off', 'Caps, a daily loss stop, approvals for live orders and a stop-all', 'Every trade and signal is logged locally', 'No Krypt account, no telemetry; your exchange key is encrypted on your machine'];

export const KRYPT_TOOLS: KryptTool[] = [
  {
    id: 'bot',
    name: 'Krypto Bot',
    tagline: 'Memecoin Trading Terminal',
    category: 'Trading',
    url: 'krypt.cc/bot',
    platforms: 'Windows, macOS, Linux',
    price: 'No purchase price. 0.5% fee per trade side (0.25% when holding 1,000,000 $KRYPTO), shown before you confirm',
    version: '7.0.0',
    about: 'A desktop terminal for trading memecoins on Solana, Robinhood Chain and BNB Smart Chain. It watches every launch live, says what it can actually measure about a coin, and lets you trade it from the same screen. It runs on your computer: no account, no telemetry, and your keys stay on your machine.',
    features: ['Live launch scanner across pump.fun, Raydium, Raydium LaunchLab, Meteora, Boop, Pons (Robinhood Chain) and four.meme (BNB): New, Graduating, Migrated and Trending columns filling in real time', 'A Krypt score on every coin that only counts what it could check ("averaged over 6 of 11 checks"); unknown stays unknown, never a zero', 'Launch analysis: replays a pump.fun coin\'s first block (dev buy, bundled, sniped, and what those wallets still hold)', 'Stop loss, take profit, trailing stop, limit and migration orders', 'Krypto Trader: a preset or your AI trades your own position on one coin under a budget, paper first', 'No-code automation rules and sandboxed scripts, each under its own budget; an AI can trade through it over MCP', 'Runs locally: no account, no server, no ads, no telemetry'],
    details: [
      { title: 'How it reads a launch', points: ['Detect: new launches the moment they land, fed from the live chain rather than rate-limited APIs', 'Read: holders, creator record, bundles, flow, security and a wallet scan on every token page', 'Score: a Krypt score that only counts what it could check', 'Act: a runner alert, a paper trade, or a live order with the fee shown before you confirm'] },
      { title: 'Scanner', points: ['Runner alerts from odds measured on tens of thousands of real launches, sent to the desktop or a Discord webhook, with your own filters', 'The Wire: rail status, and who is paying DexScreener for placement', 'Wallet Scout: what wallets actually do, as data (copy trading itself lives in Krypto Mirror)', 'Optional AI second opinion on any token, using your own key'] },
      { title: 'Trading', points: ['Candles built from the live feed, with several tokens open at once in tabs', 'One-click buy and sell, with the fee shown before you confirm', 'Orders keep working after a coin graduates', 'Land through your own RPC, Jito, Helius Sender or the public lane; transactions are built locally where possible, so a relayer outage does not stop an exit', 'Multiple wallets with one active signer; swap, bridge and a Wallet Lab built in', 'Launch your own token on pump.fun or the EVM launchpads without leaving the app'] },
      { title: 'Automation', points: ['No-code rules like "buy if the score is over 70", or paste a script an AI wrote', 'Every script runs in a sandbox under its own budget, starts on paper, and has a kill switch', 'Auto-callouts across several pump.fun accounts at once', 'A volume-farming calculator that measures the real friction with live quotes'] },
      { title: 'Workspace', points: ['Hub tiles: Terminal, Automation, Wallet Utilities, Guides, Wallet Scout, Launch a Token, Widgets', 'Build a free-form layout from panels: engine, wallet, positions, live launches, runner alerts, callouts, links, a chart, even a games panel', 'Six looks, five accent colours, eight languages, hotkeys, and a Lite mode that switches off the glass and 3D effects for slower machines', 'Profiles: separate copies of the app, each with its own wallets'] },
      { title: 'Security (new in 7.0.0)', points: ['Optional app password that encrypts your keys', 'Opt-in 2FA on withdrawals and key exports', 'Encrypted backups; a deposit / withdraw panel from the balance'] },
      { title: 'Honest by design', points: ['Unknown is unknown: when the app cannot verify something it says so instead of showing a zero', 'Paper first, live on purpose: every automated feature starts in Paper mode; switching to Live takes a confirmation that names what it will spend', 'The page itself says: memecoins are extremely volatile and high risk; Krypto Bot does not guarantee profits or predict which tokens will rise'] },
    ],
    angles: ['The scanner\'s four columns filling live during a busy hour', 'A rug, replayed: Launch analysis on a dead coin, bundled and sniped counting up', '"Unknown is not zero": a score that says "6 of 11 checks" instead of faking the rest', 'Stop loss vs no stop loss on the same chart'],
    avoid: [...TRADING_AVOID, 'Calling it "free to use" or "open source" (it takes a per-trade fee)', 'Pitching $KRYPTO as an investment; holding it halves the fee, that is all', 'Copy trading in Krypto Bot (it moved to Krypto Mirror in 7.0.0)'],
    doc: '05',
  },
  {
    id: 'mirror',
    name: 'Krypto Mirror',
    tagline: 'Crypto Copy Trading Bot',
    category: 'Trading',
    url: 'krypt.cc/mirror',
    platforms: 'Windows (the 1.4.1 notes say Mac and Linux are not part of this build)',
    price: 'No purchase price. A flat 0.5% of each buy and each sell, no holder discount',
    version: '1.4.1',
    about: 'A copy trading bot for Solana, Robinhood Chain and BNB Smart Chain. Check a wallet before you follow it, replay what copying it last week would really have kept, follow on paper first, and see exactly why your result differs from theirs.',
    features: ['Mirrors the buys and sells of any wallet on Solana, Robinhood Chain or BNB Smart Chain', 'Copy score: ranks wallets by what a follower would have kept after fees, 2 and 10 seconds late, not by their own PnL', 'Check: paste a wallet and replay last week of copying it, with stricter rules tried too', 'Paper / Live switch in the top bar: every follow starts on paper, and Live needs Arm plus a confirmation', '"You against them": the gap between their result and yours, split into lateness, fees and sell timing', 'Follow settings: take profit in up to 4 steps, break-even, exposure, price and lateness limits, sizing from balance, bulk follow from pasted text', 'Automatic callouts: each trade posted to pump.fun the moment you are in'],
    details: [
      { title: 'Directions', points: ['Copy, reverse, watch or crowd'] },
      { title: 'AI', points: ['An AI page: Claude Code, Codex or Cursor can decide each copy over MCP'] },
      { title: 'Speed', points: ['A speed page shows how many blocks behind you are, with an optional gRPC feed and send route'] },
      { title: 'Chains', points: ['Solana: copy, scan, check, and call out every trade on pump.fun', 'Robinhood Chain and BNB Smart Chain: copy, scan and check wallets'] },
      { title: 'Learning it', points: ['Guide videos in Settings, a liquid-glass look and a Lite mode'] },
      { title: 'Its own warning', points: ["Copy trading copies someone else's risk; copying memecoin wallets loses on average, so the score ranks the least bad, and paper fills are deliberately harsh", 'It does not guarantee profits'] },
    ],
    angles: ['"Would you copy this wallet?" Check runs the week replay, then the verdict lands', '"You against them": why copying a winning wallet still loses (you buy after it does)', 'The speed card: blocks behind, before and after a faster feed', 'The fee nobody reads: 0.5% a side vs a 1% bot across 100 trades'],
    avoid: [...TRADING_AVOID, 'Calling it "free to use" or "open source" (it takes a per-trade fee)', 'Naming a real person\'s wallet as a guaranteed winner', 'Saying the score finds wallets that win; it ranks what a follower would have kept, least bad first'],
    doc: '06',
  },
  {
    id: 'polyus',
    name: 'Polybot US',
    tagline: 'Polymarket bot for US',
    category: 'Trading',
    url: 'krypt.cc/tools/polyus',
    platforms: 'Windows, macOS, Linux',
    price: 'Free, per its page',
    version: '0.3.0',
    about: 'The PolyBot desk for Polymarket US, the CFTC-regulated exchange: you sign in with an API key, not a wallet. Hand it to your own AI over MCP or the built-in Autopilot, trade on paper first (paper needs no key at all), and see on a scoreboard whether an agent actually beats the market price.',
    features: ['AI Agents: connect Claude, Cursor, Codex, Windsurf or VS Code over MCP, or run the in-app Autopilot; named agents with caps and a daily loss stop', "A buy must beat the agent's own recorded forecast after fees; live orders wait for your approval by default", 'Agent Hub: a 3D view of your agents at work, in four scenes (Casino, High Stakes poker, Race Track, Penthouse)', 'One Paper / Live switch; paper fills walk the real order book with imaginary money and need no API key', 'Trading terminal: probability chart, order book, order ticket, a resolution-risk check and the Kalshi price for the same question', 'Crypto Up / Down markets for BTC, ETH, SOL and XRP in 5-minute, 15-minute and 1-hour windows', 'Python strategy scripts with a backtest page and shadow mode'],
    details: [
      { title: 'What this exchange does not have', points: ['Polymarket US publishes no per-trader data, so this version has no whale tracker, no copy trading and no perps'] },
      { title: 'Safe by design', points: PREDICTION_SAFETY },
      { title: 'Its own test', points: ['Across 3,106 fifteen-minute windows, its own model was not a better forecast than the market price; it says so in its changelog'] },
      { title: 'Good to know', points: ['The macOS build is unsigned: its page explains the one-time fix when macOS says the app is "damaged"'] },
    ],
    angles: ['Agent Hub Casino: AI agents playing blackjack and roulette between jobs, leaving the table when a real task comes in (play chips only)', "An AI agent's forecast vs the market price on a 15-minute BTC window, as the clock runs out", '"We tested our own model on 3,106 windows. The market won." An honest test story'],
    avoid: [...TRADING_AVOID, 'Whale tracking, copy trading or perps (not in this version)', 'Saying any preset, model or agent has an edge; its own changelog says the model did not beat the price'],
  },
  {
    id: 'polybot',
    name: 'Krypt PolyBot',
    tagline: 'Free Polymarket Bot',
    category: 'Trading',
    url: 'krypt.cc/tools/polybot',
    platforms: 'Windows, macOS, Linux',
    price: 'Free, per its page; source on GitHub',
    version: '3.5.0',
    about: 'A Polymarket desk you can hand to your own AI. Connect Claude, Cursor, Codex, Windsurf or VS Code over MCP (or use the built-in Autopilot) and it researches markets, records its own forecast and trades under caps you set, on paper first. A scoreboard tracks whether each agent actually beats the market price.',
    features: ['AI Agents: connect Claude, Cursor, Codex, Windsurf or VS Code over MCP, or run the in-app Autopilot; named agents with caps and a daily loss stop', "A buy must beat the agent's own recorded forecast after fees; live orders wait for your approval by default; a scoreboard shows whether each agent beats the market", 'Agent Hub: a 3D view of your agents at work, in four scenes (Casino, High Stakes poker, Race Track, Penthouse)', 'One Paper / Live switch for the whole app; paper fills walk the real order book with imaginary money', 'Trading terminal (Cockpit HUD): probability chart, order book, trade tape, order ticket, a resolution-risk check and the Kalshi price for the same question', 'Whale tracker (taker orders of $2.5k and up) and a momentum scanner', 'Crypto Up / Down markets in 5-minute, 15-minute, 1-hour and 4-hour windows', 'Copy trading, a perps market maker, and Python strategy scripts with a backtest page and shadow mode'],
    details: [
      { title: 'Strategies', points: ['Quick presets for 5-minute, 15-minute and hourly markets, a favorite-follow preset and script presets; every engine ships switched off'] },
      { title: 'Remote', points: ['Check on it and control it from a Discord or Telegram bot'] },
      { title: 'Safe by design', points: [...PREDICTION_SAFETY, 'The source is public and inspectable'] },
      { title: 'Its own words', points: ['No preset has a proven, fee-adjusted edge; live trades are real USDC'] },
      { title: 'Good to know', points: ['The macOS build is unsigned: its page explains the one-time fix when macOS says the app is "damaged"'] },
    ],
    angles: ['Agent Hub Casino: AI agents playing blackjack, roulette and slots between jobs, leaving the table when a real task comes in (play chips only)', 'High Stakes poker room: forecasts placed as chip bets, then the "WHO CALLED IT?" board', 'Race Track: every trade a horse in its own price lane, a live event as a race', "An agent's order refused on screen by the rail it tried to break"],
    avoid: [...TRADING_AVOID, 'Saying paper mode "simulates" the bot (paper sends no orders; it fills against the real book with imaginary money)', 'Saying any preset or agent has an edge; its own README says none is proven'],
  },
  {
    id: 'trader',
    name: 'Krypt Trader',
    tagline: 'Free Kalshi Trading Bot',
    category: 'Trading',
    url: 'krypt.cc/tools/trader',
    platforms: 'Windows, macOS, Linux',
    price: 'Free, per its page; source on GitHub',
    version: '6.4.0',
    about: "Put your own AI on Kalshi. Connect it over MCP, the local HTTP API or the built-in Autopilot (Anthropic, OpenAI, OpenRouter, Gemini, Ollama or LM Studio), let it trade on paper against Kalshi's real order books, and watch a scoreboard answer one question: does the AI beat the market?",
    features: ['AI agents over MCP, a local HTTP API or the in-app Autopilot (Anthropic, OpenAI, OpenRouter, Gemini, Ollama, LM Studio)', 'Scoreboard: "Does the AI beat the market?", Brier-scored, with no verdict before 30 settled markets', 'Paper mode on Kalshi\'s real order books, no Kalshi account needed', 'Named agents with their own emoji, colour, guide, rules and caps; approvals on by default and a Stop-all always on screen', 'Agent Hub: a 3D view in three scenes (Spaceship, The Council, Orbital) with walk mode and a cinematic camera', 'Trading terminal with an AI "Analyse" button (scored on the same board) and the Polymarket price for the same question', '15-minute crypto markets (BTC, ETH, SOL), whale tracker and momentum scanner', 'Python strategy scripts and a backtest page'],
    details: [
      { title: 'Strategies', points: ['Saved settings snapshots that you or your AI made; every engine ships switched off'] },
      { title: 'Perps', points: ["A maker-only volume farmer for Kalshi's one-time perps signup reward; its own words: not a profit strategy"] },
      { title: 'Safe by design', points: [...PREDICTION_SAFETY, 'The source is public and inspectable'] },
      { title: 'Its own words', points: ['"Nothing here has a proven edge. That includes your AI." The market price is usually the better forecast'] },
    ],
    angles: ['Orbital: signals arrive as comets, trades orbit in their price lane, settlements go nova or fall into the losses well', 'The Council: trading personas argue over a signal, then the gavel shows what the bot actually did', 'Spaceship: a crew carries each signal and order room to room, in first-person walk mode', '"I gave an AI a Kalshi account. With fake money." The scoreboard filling up to 30 settled markets'],
    avoid: [...TRADING_AVOID, 'Calling the perps farmer a way to make money', 'A "simulation" or "demo exchange" (Kalshi\'s demo is gone; it is paper on the real books)'],
  },
  {
    id: 'studio',
    name: 'Krypt Studio',
    tagline: 'Make any song easily',
    category: 'Utility',
    url: 'krypt.cc/tools/studio',
    platforms: 'Windows, macOS, Linux',
    price: 'Free (MIT licence), per its page; no account, ads, subscription or telemetry',
    version: '0.2.0 beta',
    about: 'A beat-making studio an AI can drive. Make beats the classic way with a step sequencer, piano roll, playlist and mixer, or connect Claude, Cursor or VS Code (or paste your own key into the built-in chat) and ask for a whole song: it writes the drums, picks the sounds, arranges, mixes, then listens back and fixes its own work while you watch.',
    features: ['Channel Rack, Piano Roll, Playlist and Mixer (sends, sidechain, 10 effects per insert)', 'AI agents over MCP or the built-in chat (Anthropic, OpenAI or OpenRouter key): 101 tools and producer recipes for 18 genres', 'Revert all AI edits in one click, plus a kill switch; destructive changes ask first and AI edits are labelled in History', 'Stem splitting, audio to MIDI, tempo and key detection, Auto Mashup, all on your PC', 'Vocal Booth with Krypt Tune (Natural, Pop, and Hard for the instant-snap trap sound); match a vocal to a beat', '227 instrument presets, 67 effect chains and 263 royalty-free sounds', 'WAV / MP3 export with song info and cover'],
    details: [
      { title: 'Vocals', points: ['Krypt Voice: type lyrics and it sings them', 'Optional cloud voices with your own Fish Audio key'] },
      { title: 'Mixing', points: ['Auto Mix & Master from presets or plain words ("warm and wide, -9 LUFS")'] },
      { title: 'Working with songs', points: ['Open any song as an editable project; warp and time-stretch', '"Make something like this song" reads only tempo, key and structure, with an originality check', 'Reference Library: teach it your sound from songs you own'] },
      { title: 'For producers', points: ['Your own VST3 / CLAP plugins (Windows)', 'Drum and instrument racks with macros, Krypt Scripts (sandboxed note generators an AI can write)', 'Session view for live clip launching, MIDI controllers, take comping'] },
      { title: 'Learning it', points: ['In-app guides, starting with a quickstart tutorial video'] },
    ],
    angles: ['One prompt, "dark trap beat for a boss fight", and the Channel Rack fills itself', 'The same vocal through Natural, Pop and Hard tune', 'Splitting a song into stems in seconds', 'Revert all AI edits: the whole song vanishes in one click'],
    avoid: ['Using copyrighted songs as the demo audio', 'Cloning a real artist\'s voice or presenting output as theirs', 'Saying it copies a song\'s melody, lyrics or hook', 'Implying a link to FL Studio or Image-Line'],
  },
  {
    id: 'editor',
    name: 'Krypt Editor',
    tagline: 'Free Video Editor',
    category: 'Utility',
    url: 'krypt.cc/tools/editor',
    platforms: 'Windows, macOS',
    price: 'Free, per its page; source on GitHub',
    version: '0.2.0',
    about: 'A desktop video editor made for Shorts, TikToks, Reels, gaming clips and montages, that your AI can drive: auto edit cuts the dead air, auto reframe turns 16:9 into 9:16 and keeps the action centred, and captions are made on your PC. Built on OpenCut.',
    features: ['AI agents over MCP: 44 tools for Claude Code, Cursor, Codex, VS Code and others; every call is one undo step, with an activity log and an off switch', 'Auto edit: cuts dead air with talking, podcast and gameplay presets; Speech mode ignores game audio, removes "um"s and retakes and can caption in the same pass', 'Edit by transcript: delete words to cut the video', 'Auto reframe to 9:16, 1:1 or 4:5 with face tracking; gameplay with a small facecam stays centred', 'Auto-captions on your PC with karaoke word highlighting, SRT / VTT', 'Voice: text to speech in 28 English voices plus Spanish, French, German, Portuguese and Korean; Re-voice swaps speech for an AI voice at the same timing', 'Audio: auto duck of music and game audio under the voice, -14 LUFS export, noise reduction', 'Record screen or a window with camera, mic and system audio'],
    details: [
      { title: 'Look and motion', points: ['Edit styles including Gaming hype, Viral short and Retro VHS; edit to match a reference video', 'Green screen and background removal, LUTs, glitch / VHS / CRT effects, 16 blend modes and masks', 'Keyframes and speed curves (Montage, Bullet), freeze frame and reverse'] },
      { title: 'Export', points: ['HEVC / AV1 up to 4K, starter templates'] },
      { title: 'Also', points: ['Lectures: slides from a PDF, key points and chapters'] },
    ],
    angles: ['A 16:9 gameplay clip to a captioned 9:16 Short in one screen recording', 'Auto edit on a raw stream VOD: the dead air turns red, then the timeline collapses', 'Auto duck: the game audio dips every time you talk', 'Bullet speed ramp on a clutch kill'],
    avoid: ['Naming other editors to put them down', '"AI-powered" as a pitch', 'Fake testimonials or download counts', 'Presenting it as written from scratch (it is built on OpenCut)'],
  },
  {
    id: 'cord',
    name: 'Krypt Cord',
    tagline: 'Discord Automation Client',
    category: 'Utility',
    url: 'krypt.cc/tools/cord',
    platforms: 'Windows, macOS, Linux',
    price: 'Free, per its page',
    version: '1.0.0',
    about: 'An automation-first Discord client: the real Discord web app with 50+ extras on top. Its own README says automating a user account breaches Discord\'s terms and can get it rate-limited, locked or terminated, so use an account you can afford to lose.',
    features: ['Unified inbox of every mention and DM across all servers', 'Logs of deleted and edited messages', 'Right-click translate and auto-translate', 'A // command palette: schedule a message, repeat it, purge your own messages, copy an emoji, check permissions', 'Clone your own server: categories, roles, colours and permissions', 'Themes and custom CSS', 'Nitro and giveaway auto-claim (its highest-risk automations; some servers post honeypot codes)'],
    details: [{ title: 'The warning on its own page', points: ['"Use at your own risk - discord bans selfbots"', 'It keeps a local archive of other people\'s messages'] }],
    angles: ['Auto-translate putting translations under messages live in a multilingual server', 'Cloning your own server layout for a new community', 'Theme presets cycling over the Discord view'],
    avoid: ["Hiding the page's own warning: Discord bans selfbots, use at your own risk", "Showing it used against other people's servers", '"Free Nitro" (Nitro and giveaway sniping are its riskiest features)'],
  },
  {
    id: 'larp',
    name: 'Krypt Larp',
    tagline: 'Editable Dashboard Examples',
    category: 'Utility',
    url: 'krypt.cc/tools/larp',
    platforms: 'Windows, macOS, Linux',
    price: 'Free, per its page',
    version: '2.0',
    about: 'A collection of 31 animated, editable dashboard mock-ups for entertainment, creative experimentation, UI inspiration, prototyping, demonstrations and education. Everything shown in them is user-controlled and fictional, and a "LARP · not a real app" watermark is on by default.',
    features: ['31 animated, editable mock-ups (wallets, payments, banking, markets, creator stats, health)', 'Serve them to your phone over Wi-Fi; triple-tap to edit any value', 'Your own dashboards: screenshot an interface, have an AI turn it into an HTML file, import it (sandboxed)', 'A "LARP · not a real app" watermark, on by default, drawn inside the frame', 'Not affiliated with any bank, exchange or platform'],
    details: [{ title: 'Its terms, in short', points: ['It does not represent, verify or guarantee real balances, earnings or transactions', 'Presenting a mock-up as a real balance or payout is fraud in most places', 'It provides no official copies of third-party services, branding, accounts or credentials', 'The user alone is responsible for how the files are used, changed, published or shown'] }],
    angles: ['"That balance screenshot could be fake": a number edited live on a phone, watermark in frame, as a warning', 'Desktop gallery to phone over Wi-Fi to triple-tap edit, in one take', 'Screenshot to AI to your own imported dashboard, as a UI-study speedrun'],
    avoid: ['Presenting an edited screen as real results, anywhere, ever', 'Any real bank, exchange or platform branding (older builds used real brand names; never show those)', 'Showing the watermark switched off', 'A Home-screen icon set to a real app\'s icon'],
  },
  {
    id: 'ghost',
    name: 'Krypt Ghost',
    tagline: 'Spoof your location',
    category: 'Utility',
    url: 'krypt.cc/tools/ghost',
    platforms: 'Windows (macOS and Linux builds exist but are not yet tested with a device); for an iPhone',
    price: 'Free, per its page',
    version: '1.0.0',
    about: "An iPhone location spoofer run from a computer over USB, no jailbreak: change the device's GPS location quickly from a map. Its page says it is for development, testing, privacy and entertainment, and that some apps verify location in other ways, so compatibility varies.",
    features: ['Pick any location on a map, or search worldwide', 'Routes at walk, cycle or drive speed, with distance and ETA', 'Bookmarks and a history of places you have spoofed to', 'Turns on iPhone Developer Mode without a Mac; a setup walkthrough that ticks steps off as they happen', 'Tray icon with one-click "Reset to real GPS"; on iOS 17.4 and later the location stays after unplugging', 'Diagnostics and a live console'],
    details: [{ title: 'Limits it states', points: ['Some apps use additional methods to verify real location, so compatibility may vary', 'Apple Find My is not affected', 'Only on devices you own; spoofing may break some apps\' terms, and some games detect it and ban'] }],
    angles: ['The pin drops on Tokyo and the iPhone\'s Maps jumps there, split screen', 'A drive route playing out along a road, ETA counting down', 'Testing a geofence in your own app without leaving the desk'],
    avoid: ['Pitching it for cheating in games or dodging app rules (some games detect it and ban)', 'Promising it works with every app (the page says compatibility varies)', 'Fooling Find My or location sharing', 'Use on someone else\'s device'],
  },
  {
    id: 'poker',
    name: 'Krypt Poker Lite',
    tagline: 'Stake Poker Assistant',
    category: 'Degen',
    url: 'krypt.cc/tools/poker',
    platforms: 'Windows, macOS',
    price: 'Free, per its page (the fully automatic Krypt Poker+ is handed out in the Krypt Discord)',
    version: '1.0.0',
    about: 'A lightweight poker assistant for Stake Poker (Stake.us and Stake.com) that reads the table and shows fast, easy-to-read insights while you play: hand strength, equity, board texture and key spots. Lite only advises; it never takes a game action.',
    features: ['Reads the table as text through the browser, no screenshots or calibration (Chrome, Edge, Brave or Chromium)', 'Hand strength, equity (exact heads-up on the turn and river) and board texture', 'Preflop charts by seat: the Strategy page draws the 13x13 chart the engine used', 'A click-through overlay in 7 designs (panel, glass, gauge, terminal, arcade, ticker, bare); Alt+H hides it', 'History of every hand it advised on and whether you took the advice', 'Optional written explanations with your own AI key, off by default'],
    details: [{ title: 'Its own warning', points: ['"Essentially every online poker room forbids real-time assistance in their terms of service. Enforcement is not a warning: it is a closed account and a confiscated balance."'] }],
    angles: ['Seven overlay designs in seven seconds, over a play-money table', 'The 13x13 preflop chart changing seat by seat', 'One reviewed hand, street by street: outs and equity'],
    avoid: ['Promising winnings', 'Encouraging anyone to gamble', "Hiding its own warning: poker rooms forbid real-time assistance and can close the account and keep the balance", 'Calling Lite a bot or autoplay (it only advises)'],
  },
  {
    id: 'scout',
    name: 'Krypt Scout +',
    tagline: 'Premium Sports Predictor',
    category: 'Donor',
    url: 'krypt.cc/tools/scout',
    platforms: 'Donors only (access through the Krypt Discord)',
    price: 'Donors only',
    about: 'A sports prediction tool that brings matchups, trends, team performance and win probabilities into one dashboard, instead of digging through several stats sites.',
    features: ['Matchup predictions', 'Win probability estimates', 'Team trends and performance data', 'Game and matchup analysis', 'Multiple sports'],
    details: [{ title: 'Access', points: ['Not a public download: donors get it through the Krypt Discord'] }],
    angles: ["A model's probability vs the public's pick on one game", 'How a win probability is built'],
    avoid: ['Calling any pick a lock or promising results', 'Betting advice'],
  },
  {
    id: 'vpn',
    name: 'Krypt VPN',
    tagline: 'Free VPN with Multi-Hopping',
    category: 'Utility',
    url: 'krypt.cc/tools/vpn',
    platforms: 'Windows, macOS, Linux',
    price: 'Free nodes, per its page; source download on the page',
    version: '1.1.0',
    about: 'A VPN that lives in the tray and connects through public servers it has proven working: it pushes a real request through every server and speed-tests it before using it, rebuilds onto live servers when they die mid-session, and can route through more than one server with Multi-Hop. Krypt runs no servers of its own.',
    features: ['Every server proven with a real request and speed-tested before use', 'Repairs its own list mid-session (its own test: a proven set was 29% dead three hours later)', 'Multi-Hop through more than one server (off by default; roughly halves throughput)', 'Kill switch on Windows and Linux, DNS over HTTPS through the tunnel, split tunneling, auto-reconnect', 'DNS filtering for ads, trackers and malware; a leak test', 'Advanced window: sortable server list, speed tests and a server harvester'],
    details: [{ title: 'Its own warnings', points: ['"Every node here is run by a stranger. With one hop, that stranger sees both your real address and everywhere you go."', 'No kill switch on macOS', 'Some countries restrict VPNs; checking the law is up to you'] }],
    angles: ['The harvester filling the list with hundreds of servers, then most failing the proof test', 'Leak test before and after connecting', 'What multi-hop means, drawn in one picture'],
    avoid: ['Claims of total anonymity', '"Unblock Netflix", piracy or "military-grade"', 'A kill switch on macOS', 'Saying Krypt runs the servers (they are public servers run by strangers)'],
  },
  {
    id: 'macro',
    name: 'Krypt Macro',
    tagline: 'Automate Everything',
    category: 'Utility',
    url: 'krypt.cc/tools/macro',
    platforms: 'Windows',
    price: 'Free, per its page; source download on the page',
    version: '1.0.0',
    about: 'A macro program for automating repetitive tasks on a PC: record your mouse and keyboard once and replay it, build steps in a visual editor, or write a short AutoHotkey-style script. Its page says it does what paid macro programs do.',
    features: ['Record and replay mouse and keyboard, at 0.05x to 50x speed, N times or forever (F6 record, F7 play, F8 stop, rebindable)', 'Visual editor: drag-and-drop steps with waits, random sleeps, typed text, key presses, program launches and screen-point pickers', 'Image and text targeting: wait for an image or a word on screen (offline OCR), then click it', 'Control flow with if / else, loops, while, goto and variables', 'Scripting in an AutoHotkey-style language with live error checks and a command reference', 'Ready templates: auto-clicker, key spammer, click a button by its text, wait for an image then click, auto-typer, hold a key', 'Schedules: every N minutes, daily at a time on chosen weekdays, or once', 'Humanize (off by default): jittered clicks, varied hold times, typing cadence and a curved mouse glide with overshoot, with a live preview'],
    details: [
      { title: 'AI steps', points: ['Opt-in, with your own Anthropic or OpenAI key: send a screen region (read by OCR) or the clipboard and type the reply'] },
      { title: 'While it runs', points: ['An always-on-top status pill; it closes to the tray; macros share as .kmacro files or share codes'] },
      { title: 'How it works', points: ['It does not inject DLLs, read game memory or touch anti-cheat'] },
      { title: 'Its own warnings', points: ['Humanize "does not defeat real anti-bot detection"; automating games can get an account banned'] },
    ],
    angles: ['A boring daily task, recorded once and replayed at 5x', 'Robot mouse vs humanized mouse: the straight path next to the curved glide, side by side', 'Wait-for-image: the macro spots a prompt on screen and clicks it', 'Record once, replay forever: the step list running block by block next to the action'],
    avoid: ['Showing it used to cheat or farm in online games', 'Saying humanize gets past anti-bot or anti-cheat systems', 'Promising a game will not ban for it'],
  },
  {
    id: 'tweaker',
    name: 'Krypt Tweaker',
    tagline: "Free Tweaker - Don't pay for one.",
    category: 'Utility',
    url: 'krypt.cc/tools/tweaker',
    platforms: 'Windows',
    price: 'Free, per its page; source on GitHub',
    version: '2.0.0',
    about: 'A Windows optimizer for gamers. It applies the registry, service and power changes that move FPS and input latency, in a modern UI instead of a batch script you have to trust. It snapshots settings before touching anything, labels every tweak by risk, and can roll all of it back in one click.',
    features: ['One-click presets: Safe Optimize, Max FPS, Low Latency, Competitive, Debloat Only, Streamer, and Restore Defaults', 'Gaming, FPS, latency and network pages, each tweak labeled from safe to experimental', 'Fixer: pick a symptom ("stutter", "no sound", "slow after another tweaker") and it runs nine read-only checks, then shows the exact command for each repair', 'Debloat and privacy settings', 'A settings backup and a System Restore Point before any preset runs; every tweak can be reverted', 'Built-in benchmark, the Krypt Score out of 10,000'],
    details: [
      { title: 'Gaming and latency', points: ['Game Mode, GPU scheduling, mouse acceleration, TCP / network tuning, MMCSS, DWM overhead and animations, and more'] },
      { title: 'Fixer', points: ['Checks services, boot settings (HPET, dynamic tick), network, maintenance tasks, memory and scheduling, power, storage, crash and hardware history, and system integrity', 'Quick scan in seconds, deep scan in 10-20 minutes; scanning only reads'] },
      { title: 'Debloat and privacy', points: ['Switch off telemetry, Cortana, lock-screen ads, Copilot and other noise without uninstalling apps'] },
      { title: 'System control', points: ['Service manager, startup manager, UWP app remover, disk cleanup, DNS presets, Winsock reset, hosts editor and power plans (including Ultimate)'] },
      { title: 'Benchmark', points: ['A quick CPU, GPU, memory and disk test; run it before and after to see the difference; nothing leaves the PC'] },
      { title: 'Safe by design', points: ['Tweaks carry risk labels plus admin, reboot and permanent flags', 'Recovery files for Safe Mode in C:\\KrypTweaker-Recovery', 'No account, no telemetry, no background service'] },
    ],
    angles: ['Krypt Score before and after the Competitive preset, the real numbers on screen', 'Fixer: "my game stutters", and what it finds that another tweaker left behind', 'Tweaks people pay for, shown one by one with their risk labels', 'The riskiest tweak, and why it is labeled experimental'],
    avoid: ['FPS or score numbers that were not measured on screen', 'Promising the Fixer repairs every problem'],
  },
  {
    id: 'cleaner',
    name: 'Krypt Cleaner',
    tagline: 'Best PC Cleaner in the world',
    category: 'Utility',
    url: 'krypt.cc/tools/cleaner',
    platforms: 'Windows',
    price: 'Free, per its page; source on GitHub',
    version: '1.0.0',
    about: 'A PC cleaner that removes junk, frees space and clears privacy traces. It says exactly how much space can be reclaimed, labels every action by risk, and never auto-deletes your files.',
    features: ['One-click Health Check showing reclaimable space', 'Cleans temp files, update caches, shader caches, crash dumps, the Windows component store and the recycle bin', 'Game and app caches: Steam, Epic, Discord and the NVIDIA / AMD / Intel shader caches', 'Browser cleanup across major browsers, with sensitive data always opt-in', 'Old Files: big files nobody has opened in years, sorted by size and age', 'Disk tools: SSD TRIM / HDD defrag, storage analyzer, duplicate finder and drive health'],
    details: [
      { title: 'Browser cleanup', points: ['Cache, cookies, history, sessions and other browser data'] },
      { title: 'Privacy cleanup', points: ['Recent documents, Run history, Explorer search history, typed URLs; backed up first on the Backups page'] },
      { title: 'Safe by design', points: ['Every action has a risk label', 'Privacy data is backed up before cleanup, so changes can be rolled back', 'Never auto-deletes duplicates or old files: you choose what stays', 'Locked files, running apps and unsupported targets are reported instead of silently skipped', 'No account, no telemetry, no bundled adware, no background service'] },
    ],
    angles: ['How many GB of shader cache Steam and your GPU driver are sitting on, counted live', 'Old Files: the forgotten game installers on this PC, with the size the scan really shows', 'One click, one Health Check, the real number of GB', 'Cleaners that bundle adware vs one that shows every action'],
    avoid: ['Invented space-saved numbers', 'Promising more FPS from cleaning'],
  },
  {
    id: 'cursor',
    name: 'Krypt Cursor',
    tagline: 'Best Cursor Customizer',
    category: 'Utility',
    url: 'krypt.cc/tools/cursor',
    platforms: 'Windows',
    price: 'Free, per its page; source on GitHub',
    version: '1.0.0',
    about: 'A Windows cursor customizer: it replaces the standard pointer with a customizable overlay with glow, motion trails, click animations and sound feedback, previewed live and working system-wide on the desktop, in browsers, apps and windowed games.',
    features: ['Built-in styles (Dot, Ring, Glow, Crosshair, Diamond, Triangle, Arrow, Roulette) or your own cursor images', 'Roulette cursor: a red, black and green wheel that spins and slows with friction', 'Motion trails: comet, neon, ribbon, spark, bubble and particle, with length, fade, thickness and glow', 'Click animations: ripples, shockwaves, bursts, sparkles, confetti, stars, hearts, emojis, text', 'Colour modes: solid, gradient, rainbow cycling and velocity-reactive', 'Ten presets with live preview, plus your own'],
    details: [
      { title: 'Visual effects', points: ['Glow intensity, pulse, rotation, opacity, smoothing, motion echoes, outlines and click-pop'] },
      { title: 'Sound', points: ['Custom sounds on mouse clicks and key presses, with volume, pitch variation and your own audio files'] },
      { title: 'Presets', points: ['Krypt, Minimal, Neon Pulse, Rainbow Road, Gamer, Inferno, Sakura, Stardust, Party and Roulette; make and share your own'] },
      { title: 'Where it draws', points: ['Desktop, browsers, creative software and windowed games', 'In fullscreen games, the taskbar and admin apps it switches back to the normal Windows pointer by itself', 'Optional: hide the real Windows cursor (reversible), or match the Windows cursor to your style'] },
      { title: 'Lightweight by design', points: ['A hotkey turns it on and off', 'Settings, presets, sounds and assets stay on the PC', 'No subscriptions, ads, telemetry, account or background services'] },
    ],
    angles: ['Ten cursor looks in ten seconds', 'The Roulette cursor spinning down: where does it land?', 'A velocity-reactive trail on fast flicks, slow motion', 'Every click throws confetti: the Party preset on an aim-trainer page'],
    avoid: ['Showing the effects inside a fullscreen game (it switches to the normal pointer there)'],
  },
  {
    id: 'crosshair',
    name: 'Krypt Crosshair',
    tagline: 'Free Crosshair Overlay',
    category: 'Utility',
    url: 'krypt.cc/tools/crosshair',
    platforms: 'Windows, macOS',
    price: 'Free, per its page; source download on the page',
    version: '1.2.0',
    about: 'Draws a fully customizable crosshair on top of every window, game or not. It is an overlay only: a transparent window painted on top of the screen, with no game-process injection, no memory reads and no driver. Its page says to read a game\'s anti-cheat rules and terms before using it in a competitive title.',
    features: ['Eight shapes: cross, plus, dot, circle, T-shape, chevron, diagonal X, and a full-screen lineup cross for grenade and smoke lineups', 'Image crosshairs from your own PNG / JPG / WEBP / BMP', '32 built-in presets, including colorblind-safe and high-contrast sets, plus custom presets with one-click export and import', 'Import a Valorant profile code or a CS2 crosshair share code', 'Dynamic bloom and recorded spray patterns', 'Hide on ADS, per-game profiles and six rebindable hotkeys (overlay, cycle presets, settings, record spray, spray swap, magnifier)', 'An always-on-top live zoom lens (magnifier) and multi-monitor support'],
    details: [
      { title: 'Look', points: ['Colour, opacity, glow, outline, dot, thickness, gap, rotation and offset', 'Live preview that mirrors the overlay pixel for pixel'] },
      { title: 'Presets', points: ['Grouped by game-authentic styles (Valorant, CS, Apex, Fortnite), weapon roles (sniper, pistol, shotgun, SMG), utility (a full-screen lineup guide), accessibility (colorblind-safe and high-contrast) and pure style', 'Copy a preset string and share it'] },
      { title: 'Dynamic behaviour', points: ['Fire bloom and movement bloom that expand the crosshair', 'Spray patterns: record your counter-movement and replay it as crosshair drift, with a quick-swap popup between guns', 'Hide on ADS on right, middle or thumb button, in hold or toggle mode'] },
      { title: 'Per-game profiles', points: ["Map a game's .exe to a preset and the crosshair switches when that game takes focus"] },
      { title: 'How it works', points: ['Drawn by the GPU: the page says it adds no frames and no input delay', 'No services, no registry changes, no admin rights'] },
      { title: 'Its own warning', points: ['It cannot promise how any game treats an overlay; kernel-level anti-cheat (Valorant\'s Vanguard most of all) is the strictest; no liability for action taken against an account'] },
    ],
    angles: ['Pro crosshairs, rebuilt one by one', 'Paste a CS2 share code or Valorant code, get the same crosshair in any game', 'Cycling all 32 presets with one hotkey', 'Record a spray, then watch it replay as crosshair drift'],
    avoid: ["Claiming it is allowed in every game, or safe with every anti-cheat; each game's rules decide"],
  },
  {
    id: 'radar',
    name: 'Krypt Radar',
    tagline: 'See audio on screen',
    category: 'Utility',
    url: 'krypt.cc/tools/radar',
    platforms: 'Windows',
    price: 'Free, per the tools page; source on GitHub',
    version: '1.1.0',
    read: '2026-11-14',
    about: "A sound radar for games. It listens to the audio your PC is already playing and draws where each sound comes from: a glowing ring around your crosshair, a compact radar in a corner, or a glow along the screen edges, with bright pings for sudden sounds like footsteps and gunfire. It was built for deaf and hard-of-hearing players, and for anyone playing in a noisy room or with one earbud. It works from any game's stereo audio on Windows; it reads audio only, never game memory, and injects nothing.",
    features: ['Draws the direction of game sounds live, with pings for sudden ones like footsteps and gunfire', 'Three styles: a ring round your crosshair (nothing drawn inside it), a radar disc for a corner, or a glow along the screen edges', 'Coloured by pitch: amber and red for low rumble, purple for mids, cyan for highs, so low footsteps and high gunfire can point different ways at once; the three colours are yours to change', 'Works from system audio with no setup, on any game in Borderless / Windowed Fullscreen', 'A click-through overlay you drag onto your crosshair; it snaps to the exact middle of the screen', 'Game profiles: save a tuning per game and switch between them', 'Six one-click looks, including a colour-blind-safe palette and a high-contrast one', 'Streamer mode hides the overlay from OBS and recorders'],
    details: [
      { title: 'Who it is for', points: ['Deaf and hard-of-hearing players who cannot rely on stereo audio cues', 'Anyone gaming muted, in a noisy room or with a single earbud', 'Streamers who want an on-screen sound indicator'] },
      { title: 'How it hears direction', points: ['On speakers a sound to your right is louder in the right channel; on headphone 3D audio (Windows Sonic, Dolby Atmos, a game\'s own HRTF) it mostly arrives earlier at the near ear. It measures both', 'It splits the audio into frequency bands and finds each band\'s direction on its own', 'It measures how well the two channels agree, so music and ambience do not wash out the ring, and shows a live confidence figure', 'Automatic level: matches the radar to a quiet game or a low in-game volume slider; it changes what the radar analyses, never what you hear', 'Telling it you are on headphones (Detection > Spatial mode) is the biggest accuracy win'] },
      { title: 'Look', points: ['Size, thickness, sectors, opacity, glow and brightness; a smooth or segmented ring', 'Ping shapes: lens, bar, dot or arrow, with size, colour and fade', 'Colour modes: by pitch, by direction (one colour ahead, another behind), the Krypt gradient or a solid colour', 'A dark edge so the radar still reads over snow or a flash; direction marks at ahead / right / behind / left'] },
      { title: 'Controls', points: ['Hotkeys, all rebindable: Alt+L start / stop listening, Alt+O show / hide the overlay, Alt+P position the radar, Alt+Shift+O open the window', 'Lives in the system tray; can start with Windows', 'Capture from system audio or any input device (Stereo Mix, VB-Cable, VoiceMeeter) to keep music and voice chat off the ring'] },
      { title: 'Privacy', points: ['Audio never leaves the PC and is never stored: analysed in memory and discarded', 'The app makes no network requests: no telemetry, no accounts, no update pings', 'It never reads game memory or injects code', 'If Discord is running it shows a "Krypt Radar" status on your profile, which Discord can hide'] },
      { title: 'Its own limits (from its docs)', points: ['Left and right are reliable; it is least precise for sounds directly to your side', 'Front and behind cannot be told apart from plain stereo; the Front / back controls are experimental and off by default', 'A mono source has no direction: the app says so instead of inventing an angle', 'Its accuracy numbers come from benches on clean audio; no game-by-game validation has been done', 'Exclusive fullscreen draws over every overlay: the game has to be in Borderless', 'Its optional "Front / back from turning" also reads sideways mouse movement; its docs say to check a kernel anti-cheat\'s policy before turning that on'] },
    ],
    angles: ['A sound, then the ring lighting up on that side: footsteps left, a shot right', 'The same radar in every game, instead of one game\'s own sound visualizer', 'Three ways to wear it: ring on the crosshair, radar in a corner, glow on the screen edges', 'Built for deaf and hard-of-hearing players: what a footstep looks like', 'Low rumble amber, high zing cyan: two sounds pointing two ways at once'],
    avoid: ['Calling it a cheat, a wallhack or ESP, or promising wins or a higher rank', 'Saying it is allowed in every game or safe with every anti-cheat; each game\'s rules decide', 'Showing front vs behind as reliable (experimental, off by default)', 'Quoting its bench degrees as in-game accuracy, or inventing any accuracy number', 'Showing it over an exclusive-fullscreen game', "Saying it hears a game whose own volume is at zero: it draws the audio the PC is playing", "Real game footage, logos or characters you have no right to use; the hub's radar visual draws its own scene"],
  },
  {
    id: 'marketo',
    name: 'Krypt Marketo',
    tagline: 'Reels and Instagram accounts, run by your AI',
    category: 'Utility',
    url: 'krypt.cc/tools',
    platforms: 'Windows',
    price: 'Not stated yet',
    released: false,
    about: 'This app. A desktop hub that makes Instagram reels and runs Instagram accounts, driven by the AI you already use. It does not have its own page on krypt.cc yet, so the end card link is the tools list for now.',
    features: ['Ask your AI for a reel and watch it get written, previewed and rendered to an MP4', 'Reel styles: story (narrated), list, post card, stats, versus, terminal and clip', 'Narration made on your computer; nothing is sent anywhere', 'Reference videos: add a reel whose edit you like and say "like this one"', 'Hook tests: 2-4 openings of the same reel to post as Trial Reels', 'Account warm-up with daily limits the AI cannot pass, and your approval on every comment and post', 'Results: record each reel\'s numbers and keep what was learned'],
    details: [
      { title: 'Works with', points: ['Claude Code, Claude Desktop, Codex, Cursor, Windsurf, Gemini CLI and VS Code over MCP', 'A built-in chat for people with their own API key (Grok, GPT, OpenRouter or a local model)'] },
      { title: 'Instagram', points: ["Each account stays signed in where it already lives: the hub's own browser, or your own Chrome through the Marketo extension", 'You sign in yourself; the AI never sees a password'] },
      { title: 'Built in', points: ['A playbook of hook rules, formats, caption template and checklist', 'This catalog of Krypt tools'] },
    ],
    angles: ['"This reel was made by an AI. Here is the prompt."', 'One sentence in, a finished reel out, screen recorded', 'A new account\'s first two weeks, done slowly on purpose'],
    avoid: ['Promising views, followers or growth', 'Showing or suggesting spam, mass accounts or bot farms', 'Saying it keeps an account safe from Instagram restrictions', 'Calling it "free to use" or "open source"'],
  },
];

export const KRYPT_PACK_RULES = [
  'Reach first: tell a story people would watch anyway, and let the tool be the lesson at the end. The product is never the hook.',
  'Say what the tool does, with the screen or a number. Do not pitch with "open source" or "free to use"; never use those words for Krypto Bot or Krypto Mirror.',
  'Use the Krypt logo (set the reel\'s logo field to an empty string), card_by "by Krypt", and the tool\'s own link as the end card title (cta).',
  'No profit claims for the trading tools. Keep "Not financial advice." on those reels.',
];

export const kryptToolById = (key: string): KryptTool | undefined => {
  const k = key.trim().toLowerCase();
  return KRYPT_TOOLS.find((t) => t.id === k) ?? KRYPT_TOOLS.find((t) => t.name.toLowerCase() === k) ?? KRYPT_TOOLS.find((t) => t.name.toLowerCase().includes(k) || k.includes(t.id));
};

export function kryptToolSummary(t: KryptTool): string {
  return `${t.id} · ${t.name}: ${t.tagline} · ${t.category} · ${t.platforms} · ${t.url}${t.released === false ? ' · not released yet' : ''}`;
}

/** Names and one-liners, for the instructions every AI gets. */
export const kryptToolNames = (): string => KRYPT_TOOLS.map((t) => `${t.name} (${t.tagline.replace(/\s+-\s.*$/, '')})`).join(', ');

/** The prompt a user gives their AI for a reel about this tool. */
export const kryptToolPrompt = (t: KryptTool): string => `Make a reel about ${t.name}. Read krypt_tools for "${t.id}" first.`;

export function kryptToolDetail(t: KryptTool): string {
  const bullets = (xs: string[]): string => xs.map((f) => `- ${f}`).join('\n');
  return [
    `${t.name} (${t.tagline})`,
    t.released === false ? 'Not released yet: it has no page of its own on krypt.cc. Teasers and behind-the-scenes only; no "download now".' : '',
    `Link for the end card: ${t.url} · Platforms: ${t.platforms} · Price: ${t.price}${t.version ? ` · Version ${t.version} (on ${t.read ?? KRYPT_PACK_READ})` : ''}`,
    t.about,
    `What it does:\n${bullets(t.features)}`,
    ...t.details.map((d) => `${d.title}:\n${bullets(d.points)}`),
    `Reel angles:\n${bullets(t.angles)}`,
    t.avoid.length ? `Never:\n${bullets(t.avoid)}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
