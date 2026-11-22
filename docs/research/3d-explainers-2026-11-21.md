# 3D animated explainer research (2026-11-21)

Content research for a Blender-rendered 3D explainer style (the Blender technical side is covered in a separate report). It answers four questions: which 3D short-form genres perform, what makes them work, which formats fit our topics and can be built from simple procedural shapes, and what to avoid.

**Method and limits**
- YouTube numbers (views, length, publish date, channel) come from the public YouTube watch and search pages, pulled on 2026-11-21. Channel totals come from vidIQ's public stats pages on the same day.
- **TikTok and Instagram numbers are mostly missing.** TikTok profiles don't load for automated reads, and Instagram showed only one follower count (Zack D. Films, 11.5M). Most of the big 3D explainer channels post the same videos on all three platforms, so the YouTube numbers are used as the guide.
- I couldn't get transcripts (the caption files came back empty) or watch videos frame by frame. Descriptions of how a video looks or is narrated come from titles, descriptions and write-ups. Anything I worked out myself is marked **(inferred)**. Vendor and blog claims are marked **(vendor, unverified)**.

---

## 1. Genres that perform

### Summary table

| Genre | Real examples (YouTube, views as of 2026-11-21) | Typical length | Voice? | Fit for us |
|---|---|---|---|---|
| **Narrated "How / Why" curiosity explainer** (stylised 3D scenes, story-led) | Zack D. Films: see the tech list below; 7-42M per tech Short | 25-64 s (most 30-45 s) | Yes, one narrator | **High** |
| **Zoom / scale dive** (one continuous zoom through scales) | [CPU Transistors vs Human Hair](https://youtube.com/shorts/odx5NLbYz8g), ConnectEd Videos, 31 s, **11.2M**, music only. [Ant vs the Universe](https://youtube.com/shorts/ppQmLxCxmGw), The Scale Dive, 50 s, **10.6M**. [Zooming Into a CPU](https://youtube.com/shorts/Bez-2cvYja0), Branch Education, 56 s, **530K** | 30-56 s | Often music only | **High** |
| **Low-poly narrated story explainer** | Low Poly Shorts: [Weirdest Nuclear Code Proposal](https://youtube.com/shorts/xbSWtRVHfr0), 29 s, **49.7M**; [Why Making The Ocean Soda Is Bad](https://youtube.com/shorts/iAhdUlUxlrw), 38 s, **3.8M** (Oct 2026). PolyAssets: [Chernobyl explained (in low poly)](https://youtube.com/shorts/22nfw7QoNgk), 18 s, **2.8M** | 18-44 s | Yes | **High** (the look suits procedural shapes) |
| **Mechanism "this vs that"** | [CVT vs Manual Transmission](https://youtube.com/shorts/6JjvQQTXTXs), TechMystX, 10 s, **1.05M in about a day** | 10-20 s | Usually none | **Medium-high** |
| **Satisfying 3D loop** | [Satisfying Dice Roll and Drop Perfect Loop](https://youtube.com/shorts/SbI5EWTE4Uk), Neilster, 8 s, **143.5M**. [Rubik's Slide and Quick Drop](https://youtube.com/shorts/eDzuw1je-Q8), Neilster, 7 s, **34.2M**. [3D Cloth Simulation](https://youtube.com/shorts/3SOY7a73Jzo), Render X, 16 s, **83.5M**. [THE PERFECT LOOP DOES NOT EXI—](https://youtube.com/shorts/lOPDr8C4z_A), David Beck, 7 s, **46.8M**. [This 3D loop is oddly relaxing](https://youtube.com/shorts/9AJ7dSEetSQ), AnimPulse, 12 s, **2.3M** (Sep 2026) | 7-16 s | None | **Medium.** Huge reach, but on its own it doesn't sell anything (see format 7) |
| **"Inside your body" medical 3D** | [Injection](https://youtube.com/shorts/b5F715xN1gI), Health Unlocked, 19 s, **9.9M**. [Cold water](https://youtube.com/shorts/vnGgFLmD_5o), HumanXRay, 32 s, **5.2M**. [Vomit](https://youtube.com/shorts/ZCVsYDrPsOI), VOKA 3D Medical, 18 s, **3.5M**. [Inside the Human Body](https://youtube.com/shorts/mWNfOLgG21w), Vitals Visualized, 10 s, **28.8M** (tagged #aiart) | 10-32 s | Mixed | **Low.** Off-topic, but the "what happens inside your ___ when you ___" title borrows well |
| **3D "what if" POV / character skit** | [What if a Megalodon Swallows You?](https://youtube.com/shorts/haoO3129wgE), Nolas Studio, 24 s, **16.9M**. Zany3D (anime-character fights) grew from 2.7K to 347K subscribers in 3 months ([vidIQ](https://vidiq.com/youtube-stats/channel/@zany3d-g5r/)), but it is built on characters it doesn't own | 12-25 s | Some | **Low-medium.** Characters need hand-made models, and the IP-remix channels are an IP risk |
| **3D product reveal / CGI ad** | [3D product animation - Soda Can](https://youtube.com/shorts/2yGKKDZUggI), PiRi 3D, 10 s, **1.7M** (a freelancer's portfolio). Maybelline's fake-out-of-home (FOOH) mascara ads: 9.3M-12M (sources conflict; [Econsultancy](https://econsultancy.com/fake-outdoor-advertising-fooh), [fooh.com](https://www.fooh.com/blog/fooh-trends-in-2025)) | 8-15 s | None | **Low-medium.** We sell software, not objects (see format 4 for the screen-as-object version) |
| **3D data / money visualisation** | [Spending 1 Billion](https://youtube.com/shorts/O9tSF4T67rw), Big Data Factor, 33 s, **384K** | 20-40 s | Mixed | **Medium** for stat reels, if every number has a source |
| **Generic "X explained in 3D" definitions** | [How Does a CPU Actually Work? — Explained in 40 Seconds](https://youtube.com/shorts/sLAB9R9dPZQ), CoreView 3D, 37 s, **8.4K**. [How Does a Computer Work? – Explained with 3D Animation](https://youtube.com/shorts/J8Cc20QQpyY), Snap Study, 33 s, **9.5K**. [How Does RAM Actually Work?](https://youtube.com/shorts/2oVNmgHIvKU), STORY EXPLAINER, 30 s, **72K**. Dozens more "CPU/RAM explained in 3D 🔥" Shorts sit at **30-3,000 views** | 30-60 s | Yes | **The anti-pattern.** Same topics as ours, flops |

### 1a. Narrated curiosity explainers: Zack D. Films is the benchmark

- **Channel:** 29.8M subscribers, 83.7B views, 4,253 videos. +900K subscribers and +4.43B views in October 2026 alone ([vidIQ](https://vidiq.com/youtube-stats/channel/@zackdfilms/)). Instagram: 11.5M followers (profile page). A write-up from public job listings says he pays animators about $1,000 per video ([Digital Craft Workshop](https://danielrusnok.substack.com/p/how-a-faceless-channel-engineered), unverified).
- **His tech and security Shorts are directly in our lane:**

| Short | Length | Views | Posted |
|---|---|---|---|
| [How Tiny Delays Reveal Your Password 😨](https://youtube.com/shorts/Rli8DjQExxM) | 44 s | 18.6M | 2026-08-27 |
| [How Does An AI Like ChatGPT Learn 😮](https://youtube.com/shorts/nFRYgfitomc) | 64 s | 18.4M | 2026-04-08 |
| [Storing The Entire Internet On One Hard Drive 😱](https://youtube.com/shorts/5HgnE0Pk0Do) | 36 s | 16.8M | 2026-07-25 |
| [How RAM Works 🤔](https://youtube.com/shorts/fXpTLFTfN_w) | 36 s | 7.0M | 2026-09-26 |
| [The Hacked Baby Monitor 😱](https://youtube.com/shorts/a-5Uxws7rM0) | 34 s | 21.3M | 2025-12-16 |
| [How Angry Birds Exposed Users 😨](https://youtube.com/shorts/yXkZTu9ViSU) | 39 s | 5.5M | 2025-09-19 |
| [Why Chip Readers Are So Secure 🤨](https://youtube.com/shorts/L3u_3KJwk8g) | 32 s | 11.2M | 2024-02-26 |
| [How A Touch Screen Works 🤨](https://youtube.com/shorts/7wT2IXU1nVs) | 25 s | 14.0M | 2024-01-11 |
| [Why Your Laptop Need Its Own Bin at The Airport 🤔](https://youtube.com/shorts/OqdFFb2xXGU) | 26 s | 41.8M | 2023-08-04 |
| [Is your computer always listening? 🙁](https://youtube.com/shorts/fadyHWLLZq0) | 56 s | 6.9M | 2022-03-11 |

- **Patterns that can be checked:**
  - Length is 25-64 s; most are 30-45 s.
  - Titles are "How… / Why… / The [object] that…" plus one emoji. The Digital Craft write-up says "exactly one emoji, every time".
  - **The descriptions are empty**, with no hashtags and no links (checked on these videos).
  - Per the write-up, the video "ends the moment it answers" its question. Its featured 31 s Short "How Stitches Work" had 253M views.
- **The key contrast:** the same topic ("how RAM works") gets 7M on Zack D. Films and 72K for a copycat, and generic "CPU explained in 3D" uploads get hundreds. **(Inferred)** The topic isn't what carries it. What carries it is a specific, surprising mechanism told as a small story (an attacker timing your password, a hacked baby monitor, the whole internet on one drive), plus craft and an established channel. A definition with labelled parts doesn't.

### 1b. Zoom and scale dives

- **ConnectEd Videos**, ["CPU Transistors vs Human Hair"](https://youtube.com/shorts/odx5NLbYz8g): 31 s, **11.2M**. The description calls it "a music-only visual": a side-by-side zoom showing how small chip parts are.
- **The Scale Dive** started on Sep 17, 2026. Its 16 videos have 14M views and its subscribers are at 15.6K. ["Ant vs the Universe"](https://youtube.com/shorts/ppQmLxCxmGw) (50 s, **10.6M**) is one zoom from a 5 mm ant to the edge of the observable universe, counted in ants. Its other uploads get 286K-1.76M ([vidIQ](https://vidiq.com/youtube-stats/channel/@thescaledive/)). This is a very new channel that hit fast with one recurring format and a 💀 in every title.
- **Branch Education** (2.6M+ subscribers, photorealistic hand-built 3D; [site](https://brancheducation.pages.dev/)), ["Zooming Into a CPU (It's Incredible)"](https://youtube.com/shorts/Bez-2cvYja0): 56 s, **530K**. That is good, but far below the music-only zoom hits.
- **(Inferred)** A zoom is one continuous camera move, which costs nothing to keep consistent. With procedural geometry it is the cheapest way to get "wow". It also works muted, since the numbers on screen carry it.

### 1c. Low-poly narrated stories

- **Low Poly Shorts:** 1.25M subscribers and 882M views from only **99 videos**. It gains +10-50K subscribers and 11-39M views a month through 2026 ([vidIQ](https://vidiq.com/youtube-stats/channel/@lowpolyshorts/)).
- **Top videos:** "You've Never Touched Anything" (53.3M), "Weirdest Nuclear Code Proposal" (29 s, 49.7M), "He Wore Upside-Down Glasses For 124 Days" (36.2M). The latest, ["Jetpacks Are Real"](https://youtube.com/shorts/9Wj47d-AoSk), is 44 s with 683K on day one.
- **How it's made:** stories are true odd facts ("In 1980s, a Harvard professor suggested..."). It credits CC-BY models in descriptions and uses commissioned music (Bert Cole).
- **Why this matters for us (inferred):**
  - Low-poly reads as a deliberate style, not as cheap, and is the closest of any proven look to "built from simple shapes".
  - The PS1-era low-poly look has been a deliberate art style for years ([GamesRadar](https://www.gamesradar.com/exploring-the-resurgence-of-the-low-fi-3d-visual-style-of-the-ps1-era)). Note the difference: modern low-poly is flat-shaded and crisp, while PS1 style uses pixelated textures and wobbly geometry ([3D AI Studio](https://www.3daistudio.com/blog/ps1-graphics-how-to-make-ps1-style-3d-models)).
  - **Don't copy Low Poly Shorts' own look and title voice.** Use our own palette and finish (section 2g).

### 1d. Satisfying loops

- **The biggest raw numbers in the whole survey:**
  - Neilster's dice loop: 8 s, 143.5M
  - Render X's cloth sim: 16 s, 83.5M
  - David Beck's perfect loop: 7 s, 46.8M
- They are 7-16 s long, have no words, and the last frame matches the first.
- Neilster's description earns from affiliate links to graphics cards ("We use the GFX card in the links below and Blender 4.1"). That is the only monetisation visible.
- **(Inferred)** These clips grow channels and views but say nothing. For us, a loop can carry **one true, useful line** (format 7). That keeps the replay value and adds a reason to follow.

### 1e. Body / medical 3D

- The "What Happens Inside Your Body When You…" title family is big: 0.1-10M per Short ([search sample](https://youtube.com/shorts/vnGgFLmD_5o)).
- Many uploads are visibly AI-generated: "ultra realistic" in the title, #aiart tags. Real medical-viz studios (VOKA) post there too.
- Not our niche. **(Inferred)** The title shape transfers: "What happens inside your PC when you open 40 tabs".

### 1f. Product reveals and FOOH

- 3D product reveals on Shorts are mostly freelancer portfolios (PiRi 3D's soda can, 1.7M).
- FOOH (fake out-of-home: CGI placed into real street footage) went viral for Maybelline, Jacquemus and others ([Marketing Brew](https://www.marketingbrew.com/stories/2023/10/26/why-some-brands-are-embracing-fake-out-of-home), [Adweek](https://www.adweek.com/creativity/cgi-ads-are-taking-over-your-city/)).
- Some viewers felt misled when they found out the ads weren't real ([Creative Bloq](https://www.creativebloq.com/news/maybelline-tube-train-campaign)).
- **(Inferred)** FOOH needs real footage plus camera tracking, so it's outside a procedural pipeline. It also risks "fake" backlash.

### 1g. Mechanism versus

- TechMystX's ["CVT vs Manual Transmission"](https://youtube.com/shorts/6JjvQQTXTXs) (10 s, 1.05M within a day of posting) shows two mechanisms working side by side with labels and no voice.
- **(Inferred)** This is the 3D cousin of the stickman report's wordless "X vs Y" winner.

---

## 2. What makes them work

### 2a. The first 1-2 seconds

- **The opening states a question or a stake the viewer can't answer**, before anything else happens. The Digital Craft write-up calls the first second "a contract" ([source](https://danielrusnok.substack.com/p/how-a-faceless-channel-engineered)). Vendor guides put the hook window at 3 s and say most swipes happen in the first 1-2 s ([longstories](https://longstories.ai/blog/complete-guide-ai-3d-animation-youtube), [ContentStudio](https://contentstudio.io/blog/youtube-shorts-analytics-guide); vendor, unverified).
- **The only documented signal** is YouTube's "viewed vs swiped away" figure in Shorts analytics. YouTube has not said this is a ranking signal ([ContentStudio](https://contentstudio.io/blog/youtube-shorts-analytics-guide)).
- **Hook shot (inferred, from titles and genre patterns):**
  - Frame 1 is already the strangest image in the video: a RAM stick the size of a city, a password leaking as timed pulses, an ant next to the universe.
  - Never a logo, a title card, or an empty orbit around a grey object.
  - The hook line is short and specific, with a number or a named object ("Your password leaks in milliseconds", "There are 40 programs running before you click anything").
- **Hook line patterns from the hits:**
  - "How tiny ___ reveal your ___"
  - "Why your ___ needs ___"
  - "Storing ___ on one ___"
  - "___ vs ___"
  - "What happens inside your ___ when you ___"
  - "Zooming into a ___"

### 2b. Length, shot length and pace

- **Two length clusters show up in the data:**
  - **7-16 s wordless** (loops, mechanism versus)
  - **25-50 s narrated or zoom** (Zack D. Films' tech Shorts are 25-64 s, Low Poly Shorts 29-44 s, zoom dives 31-56 s)
- Nothing in our sample over 64 s was a 3D Short hit.
- Zack D. Films' videos are said to average 20-45 s ([longstories](https://longstories.ai/blog/complete-guide-ai-3d-animation-youtube), vendor).
- **Beats:**
  - The vendor rule of thumb is 6-10 beats per story ([longstories](https://longstories.ai/blog/complete-guide-ai-3d-animation-youtube)), so a new shot every **3-5 s** in a 30-45 s piece.
  - Zack D. Films-style edits are described as "short scenes that each carry one clear idea" and "zooms, pans, and cuts that keep energy high" ([Snaplama](https://www.snaplama.com/blog/how-to-create-animation-videos-like-zack-d-films-in-2026), vendor).
  - Community descriptions say "something is constantly happening on screen".
- **Exploded views:** one studio puts an exploded-view animation at 4-10 s depending on the object ([XO3D](https://xo3d.co.uk/resources/3d-animation/product-animation/exploded-animations/)). Use that as the longest a single "take it apart" shot should run.
- **(Inferred) Rule:** one idea per shot. A cut or a big camera change on every new sentence. No shot without motion (at least a slow drift). Stop the moment the question is answered.

### 2c. Camera moves that do the explaining

| Move | What it explains | Where it shows up |
|---|---|---|
| **Continuous push-in / zoom dive** through scales | "How small / how big / what's inside" | ConnectEd, The Scale Dive, Branch "Zooming Into a CPU" |
| **X-ray / cutaway** (the shell turns transparent or slices open) | Hidden internals: what runs inside the PC | Branch Education teardowns ([site](https://brancheducation.pages.dev/)); studios list cutaways and virtual camera moves as things "real cameras cannot see" ([XO3D](https://xo3d.co.uk/resources/3d-animation/educational-animations/)) |
| **Exploded view** (parts fly apart, then back) | Which part does what | XO3D, 4-10 s per explode |
| **Fly-through / follow-the-object** | A journey: a packet, a click, a password | (inferred) the natural shot for latency and phishing |
| **Slow orbit** | Reveal of a single hero object | Product reveals (PiRi 3D) |
| **Side-by-side static camera** | Versus comparisons | TechMystX |
| **Locked camera + perfect loop** | Satisfying loops | Neilster, Render X |

**(Inferred)** Use one hero move per shot. Ease in and out, with a small overshoot on stops. Add motion blur on fast moves. Never let a simple shape sit centre frame with a dead-still camera.

### 2d. Text on screen

- **Captions:** in a 2019 Verizon Media / Publicis survey (5,616 US adults), 69% watch video with the sound off in public, and 80% said they are more likely to watch a whole video when it has captions ([3Play Media summary](https://www.3playmedia.com/blog/verizon-media-and-publicis-media-find-viewers-want-captions/); survey, not a retention test).
- **(Inferred) Split the text into two kinds:**
  - **Flat burned-in captions** for the narration: our existing word-timed captions, inside the safe area, never angled.
  - **3D text inside the world** only for labels that belong to an object: "16 GB", "62¢", "ping 84 ms", "Startup apps: 41". It should face the camera and be thick, short (1-3 words) and lit like the scene.
  - Angled or thin 3D text that you have to read is a cost, not a style.
- Music-only zoom videos use a single on-screen number or scale label per step (ConnectEd's description: "side by side").

### 2e. Narration and voice

- **Narrated hits (Zack D. Films, Low Poly Shorts)** use one narrator per channel, every video. Vendors describe the delivery as "rapid-fire" ([Snaplama](https://www.snaplama.com/blog/how-to-create-animation-videos-like-zack-d-films-in-2026), vendor).
- **The zoom and loop hits** have no voice, just music.
- **(Inferred) Narration rules for us:**
  - One male voice per reel: the user's default (Jarnathan) or Young Jamal.
  - About 2.5-3 words a second, the same range as the stickman report's vendor numbers.
  - Short declarative sentences in the second person ("your PC", "your password").
  - The script's first sentence is the hook. No "Have you ever wondered".

### 2f. Sound design

- Low Poly Shorts uses commissioned music. ConnectEd and The Scale Dive are music-only.
- **(Inferred)** In 3D, sound sells weight and scale, so every visible motion gets a sound:
  - a soft whoosh on camera moves
  - a click or clack when parts seat or snap
  - a rising tone on a zoom
  - a thud and bass hit on the reveal
- Loops need the audio to loop seamlessly too.
- Music sits under the voice at about 15-20% (stickman report, vendor).

### 2g. Looks that read as "made", not "default"

| Look | Proven by | Procedural fit | Note |
|---|---|---|---|
| **Low-poly, flat-shaded** | Low Poly Shorts, PolyAssets (millions of views) | **Excellent** | Our own palette and lighting. Not PS1 grime, not Low Poly Shorts' look |
| **Clay / matte toy** (soft, rounded, pastel, soft shadows) | Common in satisfying loops (dice, Rubik's) | **Excellent**: bevelled primitives | Pairs well with the existing "toy" mascot style |
| **Glossy studio / product** (dark background, rim light, reflections) | Product reveals, CPU zooms | Good | Easy to tip into "stock tech" cliché (blue glowing circuit boards) |
| **Isometric diorama** (orthographic camera, tilt-shift blur) | Freelance and SaaS explainers; no viral Shorts example found | Excellent | Clear diagrams, but **no proven Shorts hit** in my searches |
| **Photoreal** | Branch Education, medical 3D | Poor | Needs real models; reads as AI if done cheaply |
| **Cel-shaded / outlined** | No Shorts data found | Good (outline modifier) | Untested |

**(Inferred) What separates good from cheap, for simple shapes:**
- Bevel every edge so it catches a highlight; sharp cubes look like placeholder boxes.
- One key light, a rim light and soft shadows, plus contact shadows or ambient occlusion so objects sit on surfaces.
- A **limited palette**: a background colour, a neutral and **one accent colour** for the thing that matters (the same rule as the stickman report).
- Shallow depth of field on close-ups.
- Slight film grain to stop colour banding in dark gradients after H.264 compression.

### 2h. Loop endings and CTA

- **Loops:** the satisfying-loop hits end on the first frame. Creator guides say replays are weighted heavily, but **YouTube hasn't confirmed this** ([vidIQ](https://vidiq.com/blog/post/youtube-shorts-algorithm/), [socialync](https://www.socialync.io/blog/youtube-shorts-algorithm-2026.md); vendor, unverified).
- **(Inferred)** For narrated explainers, end on a shot that matches the opening framing, so the loop isn't jarring and the hook line plays again.
- **CTA:** Zack D. Films has no CTA and an empty description. The answer is the ending.
- **(Inferred) Ours:**
  - One quiet line in the last 2 s ("Tweaker does this in one click. Link in bio."), or the tool shown for 2-3 s on a 3D monitor as a real screen recording.
  - The stickman report's finding carries over: the product works as the story's "fix" move, not as a pitch.

---

## 3. Formats that fit our topics and simple procedural shapes

**Building blocks** (all procedural, no bought or hand-made models):
- Primitives with bevels: box, rounded box, cylinder, sphere, torus, plane.
- Instancing for grids of cells, transistors and app blocks; curves and tubes for cables and paths.
- Extruded 3D text, emissive materials, boolean slices for cutaways.
- Simple particle trails, plus a "screen" plane that plays our own real screen recording.

**Rules every format follows:**
- One male narrator per reel (or none).
- Prediction bots are pitched as "AI trades for you, easy", with **no bot screens or visuals**, no profit or win claims, and a plain risk line.
- Never "open source" or "free to use" for Krypto Bot or Krypto Mirror.
- Every number is real (from krypt_tools or the recording itself).
- A genre may be reused; no specific creator's look, characters or series.

### Format 1: "Zoom inside" (scale dive)
- **Topics:** RAM, CPU, SSD, how much a tab really takes, how small transistors are.
- **Length:** 30-45 s. Music-only with one label per step, or narrated.
- **Example: "Zoom into your RAM until you find your Chrome tabs"** (narrated, 35 s)

| t | Shot / camera | On screen | Narration |
|---|---|---|---|
| 0-2 s | Already mid-zoom: a desk-sized RAM stick (rounded box plus chip boxes), the camera diving at it | "16 GB" (3D label on the stick) | "Your 40 Chrome tabs live in here." |
| 2-7 s | Push through a chip's lid (boolean cutaway) into a grid of glowing cells (instanced cubes) | "8 chips" → "billions of cells" | "Every one of these cells holds one bit. On or off." |
| 7-14 s | The camera pulls back a little; blocks of cells light up in the accent colour, one block per tab | "1 tab ≈ ___ MB" (real number from our own Task Manager recording) | "Each open tab grabs its own block. Some take more than a whole game used to." |
| 14-22 s | Cells fill up until the grid is full; overflow cubes spill toward a slow grey drive cylinder | "Full → swaps to disk" | "When it's full, Windows moves the extras to your drive. That's the stutter." |
| 22-30 s | The 3D monitor plane plays a real recording of the Krypt tool or Task Manager closing background hogs; cells go dark | (real screen) | "Close what you're not using. Or let Cleaner find the hogs." (only if Cleaner really does this) |
| 30-35 s | Pull back out to the opening framing (loop) | "16 GB" | "Now you know where your tabs live." |

### Format 2: "X-ray your PC" (cutaway: what's really running)
- **Topics:** startup apps, background processes, bloat, why boot is slow, telemetry.
- **Length:** 30-45 s, narrated.
- **Example: "Your PC runs 40 programs before you click anything"**
  1. **0-2 s:** a closed PC tower (bevelled box) on a desk; the power button glows. 3D label: "0 clicks". Narration: "Before you click anything, your PC already starts dozens of programs."
  2. **2-8 s:** the case turns to glass (x-ray). Coloured blocks (app tiles) slide on a conveyor (a curve path) into a CPU tile. Narration: "Updaters, launchers, chat apps, all lining up for your CPU."
  3. **8-16 s:** the conveyor jams; a progress ring above the monitor spins. A 3D counter ticks to the **real** count from our recording. Narration: "That's why boot takes ages."
  4. **16-26 s:** the camera pushes into the 3D monitor showing the real recording of the Krypt tool's startup list being trimmed (2-4 s). Blocks drop off the conveyor.
  5. **26-32 s:** the conveyor flows, the ring vanishes, the case goes solid again; back to the opening framing. CTA: "Startup list: Task Manager, or one click in [tool]. Link in bio."

### Format 3: "Follow the packet" (fly-through: latency and internet)
- **Topics:** ping, Wi-Fi vs cable, why servers far away lag, what DNS does.
- **Length:** 30-45 s, narrated.
- **Example: "Where your ping actually goes"**

| t | Shot | On screen | Narration |
|---|---|---|---|
| 0-2 s | Macro on a glowing cube (the packet) launching from a mouse click | "ping 84 ms" | "You click. This tiny packet has to cross the planet and come back." |
| 2-8 s | Follow-cam: the cube shoots from the PC to a router (low-poly box with antennas), then wall rings (Wi-Fi as expanding torus shapes hitting a wall plane, some breaking up) | "Wi-Fi: walls slow it" | "First, your Wi-Fi. Every wall makes it resend." |
| 8-16 s | The cube rides a tube (cable) to an ISP tower, then dives into an undersea tube on a low-poly ocean | "+ ___ km" (a real distance for a named server region) | "Then the cable. Light in glass still needs time to cross an ocean." |
| 16-24 s | It reaches the game server (stacked boxes) and turns back; a 3D stopwatch | "there and back" | "And it has to come back again. That's your ping." |
| 24-32 s | Split: a cable plugged in, and a cube with a shorter path | "cable vs Wi-Fi" | "Want less? Plug in a cable and pick the closest server." |
| 32-35 s | Back to the click macro (loop) | | |

Only claims we can back up (cable vs Wi-Fi, distance adds delay). No made-up ms numbers.

### Format 4: "Same PC, two paths" (3D versus, wordless)
- **Topics:** default vs tweaked Windows, a cleaned vs cluttered drive, crosshair visible vs invisible.
- **Length:** 10-20 s, music only, labels, loop on.
- **Example: "Default Windows vs Tweaked Windows: same PC"**
  1. **0-1 s:** two identical isometric desks side by side; labels "Default" / "Tweaked". One identical game cube spins on each monitor.
  2. **1-6 s:** on the left, grey blocks (background apps) drop onto the desk one by one and pile around the PC; the left monitor cube stutters (stepped animation). The right stays clean.
  3. **6-10 s:** the left pile topples; the right monitor shows 2-3 s of the **real** Tweaker recording.
  4. **10-14 s:** the accent colour floods the right side. Big 3D word: "Smooth". The left PC wears a sweat-drop particle.
  5. **14-15 s:** reset to frame 1 (loop). Post caption: "Which one is yours?"
- **No FPS numbers** unless they come from a real recording.

### Format 5: "Anatomy of a scam" (security explainer)
- **Topics:** fake login pages, look-alike URLs, fake "you won" pop-ups, fake downloads.
- **Length:** 30-40 s, narrated.
- **Example: "How a fake login page steals your password in 3 seconds"**
  1. **0-2 s:** an envelope (folded plane) flies at the camera and opens. 3D text: "Your account is locked". Narration: "This email looks real. It isn't."
  2. **2-8 s:** the camera flies into a 3D doorway (the login page as a door frame). The URL is spelled in big 3D letters; one letter swaps ("rn" sliding apart to reveal it isn't "m"). Narration: "Look at the address. 'rn' is not 'm'."
  3. **8-16 s:** a 3D key (password) goes in the lock, gets copied by a second key mould, and the copy flies away down a tube. Narration: "Type your password and a copy goes straight to them."
  4. **16-24 s:** the same door with a green padlock and the right URL; the key works. Narration: "Always type the site yourself, or use your bookmark."
  5. **24-30 s:** back to the envelope, now stamped "SCAM" (loop). Narration: "Send this to someone who clicks everything."
- **No scare claims, no invented stats.** Tool mention only where a Krypt tool really helps.

### Format 6: "The price machine" (prediction markets, AI trades for you)
- **Topics:** what a prediction-market price means, why prices move, an AI that trades for you while you sleep.
- **Length:** 30-45 s, narrated. **No bot screens. No profit or win claims. A plain risk line.**
- **Example: "Why 'rain tomorrow' costs 62 cents"**

| t | Shot | On screen | Narration |
|---|---|---|---|
| 0-2 s | A giant coin (cylinder) labelled 62¢ drops onto a balance beam | "62¢" | "Someone just paid 62 cents for 'it rains tomorrow'." |
| 2-10 s | The beam has two bins, YES and NO; marbles (spheres) pour into YES and the beam tips; the price label slides | "YES / NO" | "Every buyer pushes the price. 62 cents means the crowd thinks 62%." |
| 10-18 s | Marbles shift to NO; the price label slides down | "price = crowd's guess" | "News comes out, people change sides, the price moves." |
| 18-28 s | Night falls (sun sphere sets, moon rises); a small robot arm made of cylinders keeps nudging marbles at a slow, steady pace while a desk chair sits empty | "AI trades for you" | "Some people let an AI place the trades for them. Easy, even while you sleep." |
| 28-34 s | Sun rises; the beam is still moving; the caption holds | "It can lose too. Only use money you can lose." | "It's still a market. It can lose. Link in bio." |
| 34-36 s | Back to the coin drop (loop) | | |

The robot arm is an abstract machine, not the bot's interface. No balances, charts or trade results are shown.

### Format 7: "Loop + one true fact" (satisfying loop, wordless)
- **Topics:** a PC fact that fits in one line.
- **Length:** 7-12 s, music only, perfect loop.
- **Example: "RAM sticks that click into place forever"**
  1. **0-4 s:** two clay-look RAM sticks (bevelled boxes) slide into slots on a motherboard plane, with a satisfying click and clack.
  2. **4-8 s:** the stick lights up and the board pulses in the accent colour. Caption: "2 sticks > 1 stick (dual channel)". The fact is true; per-reel facts must be checked.
  3. **8-10 s:** the sticks slide back out and the shot returns to frame 1 seamlessly. Post caption: "Check yours: Task Manager > Performance > Memory > Slots used."
- **Variants:** a fan spin-up loop ("Clean your fans every few months"), a cable plugging in ("Cable beats Wi-Fi for ping").

### Format 8 (optional): "How much is that?" (3D stat stack)
- **Topics:** storage, data and RAM sizes, only with numbers we can source.
- **Length:** 20-30 s. Music plus one label per step, or narrated.
- **Example:** "How many photos fit on 1 TB": a stack of photo tiles (instanced planes) grows into a tower next to a person-height cylinder for scale, the camera rising with it. One sourced average photo size is stated on screen. The end loops to the empty desk. **Medium confidence**: the only data-viz example found had 384K views.

**What fits best (inferred):** formats 1, 2 and 5 copy the proven narrated-curiosity pattern on our exact topics. Format 4 and format 7 are cheap wordless tests with no narration cost. Format 6 is the only 3D way to pitch the bots without showing them. Format 3 is the most "3D-native" and suits Shorts.

---

## 4. Pitfalls

### Looks cheap or reads as AI slop (inferred unless linked)
- **Default-Blender look:** grey or white untextured primitives, flat light, no shadows, no bevels, a sky-grey background.
- **Floaty objects:** no contact shadow or ambient occlusion, so things hover.
- **Linear, robotic motion:** everything starts, stops and moves at the same speed. No easing, no overshoot, no secondary motion.
- **A dead camera:** a slow orbit around one object for 5+ seconds. Or the reverse: random camera shake everywhere.
- **Stock-tech clichés:** blue glowing circuit boards, binary rain, a hooded hacker. Too many colours, neon on everything.
- **Unreadable 3D text:** thin, angled or long, or competing with the captions.
- **Render faults:** noisy low-sample renders, flicker between frames, banding in dark gradients after compression.
- **AI-video habits:** shapes or objects that change between frames. This is the most-cited complaint about AI animation ("her shirt morphs between designs", "can't achieve any sense of cohesion and continuity"; [Creative Bloq, 2023](https://www.creativebloq.com/news/ai-animation-needs-to-stop)). Writers also point to the "uncanny valley… body parts that aren't quite right" ([UX Magazine](https://uxmag.com/articles/what-exactly-am-i-looking-at)). A procedural Blender scene avoids morphing by design. **Avoid humanlike faces**: abstract shapes and mascots don't fall into the uncanny valley.
- **Packaging that screams "content farm":** titles like "CPU Explained in 3D! 🔥🧠 #shorts #viral #trending", hashtag-stuffed descriptions, and "Inspired by Zack D. Films" in the title (a real example at [550 views](https://youtube.com/shorts/tuXqWLTsf0c)).

### Content mistakes
- **Definitions instead of stories.** "How a CPU works in 3D" Shorts get 30-9,500 views; the same topic told as a mystery gets millions. Lead with a stake or a surprise, never "This is a CPU."
- **Wrong facts.** Tech audiences correct mistakes in the comments (inferred). One wrong number undermines the tool pitch. Every number comes from a source or our own recording.
- **Going long.** No 3D Short in our sample over 64 s was a hit. Stop when the question is answered.
- **Copying a specific creator.** The Zack D. Films copycat wave ("Zack D Films style" Fiverr gigs, "Inspired by Zack D. Films" uploads) gets hundreds to thousands of views. Low Poly Shorts and The Scale Dive have recognisable looks and title voices. Use the genres, but our own palette, camera language, title voice and series names.
- **Borrowed characters.** IP-remix 3D channels (Zany3D's Goku/Hulk fights) grow fast but run on characters they don't own. Never.

### Platform labels and policy
- **YouTube:** no AI disclosure is needed for "AI-generated or altered animation… in a fully animated video" or unrealistic content. Disclosure is needed for realistic scenes, real people, or real events altered ([YouTube Help](https://support.google.com/youtube/answer/14328491)). A procedural 3D explainer is animation. Blender renders aren't generative AI in any case, but the scripts and voice are.
- **TikTok:** requires a label on AI content with realistic images, audio or video, and may auto-label content carrying C2PA Content Credentials ([TikTok support](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content)). Hootsuite says generic text-to-speech voiceovers don't need a label ([Hootsuite](https://blog.hootsuite.com/ai-disclosure-policy-for-tiktok/), secondary). An ElevenLabs voice sounds realistic, so **switching the AIGC label on is the safe choice** (inferred; the stickman report reached the same conclusion). TikTok added a "see less AI" slider in Nov 2025 ([TikTok newsroom](https://newsroom.tiktok.com/more-ways-to-spot-shape-and-understand-ai-generated-content?lang=en-GB)).
- **Meta:** may require a label for realistic-sounding AI audio (see the stickman report, Report 5; the Meta help page did not load for me).
- **Mass-production rules:**
  - YouTube's "inauthentic content" policy (Jul 2025) names "AI-generated content made with generic or unoriginal templates giving the impression of mass production" ([YouTube Help](https://support.google.com/youtube/answer/1311392)).
  - Instagram cuts recommendations for mostly-unoriginal accounts over 30-day windows ([TechCrunch](https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/)).
  - **A procedural style is a template by nature (inferred).** Vary the palette per series, the camera language, the props, the hook and the length. Never reuse a scene sequence. Keep mixing in the account's other styles.
- **Wrongly accused of AI:** genuine Blender work gets accused of being AI ([Creative Bloq](https://www.creativebloq.com/art/digital-art/blender-artist-has-to-prove-their-work-isnt-ai)). A consistent, clearly designed look and real screen recordings of our tools are the best defence (inferred).

---

## 5. Short checklist for the style rules (inferred, from all of the above)

1. Pick one of formats 1-7. Narrated pieces run 30-45 s, wordless ones 7-20 s.
2. Frame 1 is the strangest image and the first line is the stake. No logo, no "Have you ever wondered".
3. A new shot or camera change on every sentence (every 3-5 s). One hero move per shot. Ease everything.
4. Bevelled primitives, a limited palette with one accent colour, a key light and a rim light, contact shadows, slight grain. No humanlike faces.
5. Flat word-timed captions for speech. 3D labels of 1-3 words only for objects and numbers.
6. One male narrator (the user's default), or music only. Sound on every motion.
7. A real screen recording on a 3D monitor for the fix (2-4 s). One quiet CTA line. The end matches the start.
8. Bots: a price machine or robot-arm metaphor only. "AI trades for you, easy". A risk line. No screens, no profit claims.
9. Every number is sourced or recorded. Vary everything between videos. AIGC label on TikTok for the ElevenLabs voice.

---

## Sources

**Channel stats (vidIQ, 2026-11-21):**
- [Zack D. Films](https://vidiq.com/youtube-stats/channel/@zackdfilms/)
- [Low Poly Shorts](https://vidiq.com/youtube-stats/channel/@lowpolyshorts/)
- [The Scale Dive](https://vidiq.com/youtube-stats/channel/@thescaledive/)
- [Jared Owen](https://vidiq.com/youtube-stats/channel/@jaredowen/) (4.45M subscribers, long-form "How X works", +10K a month)
- [Zany3D](https://vidiq.com/youtube-stats/channel/@zany3d-g5r/)
- [Branch Education site](https://brancheducation.pages.dev/)

**YouTube Shorts cited (views from the watch pages, 2026-11-21):**
- Zack D. Films: [fXpTLFTfN_w](https://youtube.com/shorts/fXpTLFTfN_w), [Rli8DjQExxM](https://youtube.com/shorts/Rli8DjQExxM), [5HgnE0Pk0Do](https://youtube.com/shorts/5HgnE0Pk0Do), [nFRYgfitomc](https://youtube.com/shorts/nFRYgfitomc), [a-5Uxws7rM0](https://youtube.com/shorts/a-5Uxws7rM0), [yXkZTu9ViSU](https://youtube.com/shorts/yXkZTu9ViSU), [L3u_3KJwk8g](https://youtube.com/shorts/L3u_3KJwk8g), [7wT2IXU1nVs](https://youtube.com/shorts/7wT2IXU1nVs), [OqdFFb2xXGU](https://youtube.com/shorts/OqdFFb2xXGU), [fadyHWLLZq0](https://youtube.com/shorts/fadyHWLLZq0)
- Zoom and scale: [odx5NLbYz8g](https://youtube.com/shorts/odx5NLbYz8g), [ppQmLxCxmGw](https://youtube.com/shorts/ppQmLxCxmGw), [Bez-2cvYja0](https://youtube.com/shorts/Bez-2cvYja0)
- Low-poly: [xbSWtRVHfr0](https://youtube.com/shorts/xbSWtRVHfr0), [iAhdUlUxlrw](https://youtube.com/shorts/iAhdUlUxlrw), [qjo933gBeb0](https://youtube.com/shorts/qjo933gBeb0), [9Wj47d-AoSk](https://youtube.com/shorts/9Wj47d-AoSk), [22nfw7QoNgk](https://youtube.com/shorts/22nfw7QoNgk)
- Loops: [SbI5EWTE4Uk](https://youtube.com/shorts/SbI5EWTE4Uk), [eDzuw1je-Q8](https://youtube.com/shorts/eDzuw1je-Q8), [3SOY7a73Jzo](https://youtube.com/shorts/3SOY7a73Jzo), [lOPDr8C4z_A](https://youtube.com/shorts/lOPDr8C4z_A), [9AJ7dSEetSQ](https://youtube.com/shorts/9AJ7dSEetSQ)
- Body: [b5F715xN1gI](https://youtube.com/shorts/b5F715xN1gI), [vnGgFLmD_5o](https://youtube.com/shorts/vnGgFLmD_5o), [ZCVsYDrPsOI](https://youtube.com/shorts/ZCVsYDrPsOI), [mWNfOLgG21w](https://youtube.com/shorts/mWNfOLgG21w)
- Other: [haoO3129wgE](https://youtube.com/shorts/haoO3129wgE), [2yGKKDZUggI](https://youtube.com/shorts/2yGKKDZUggI), [6JjvQQTXTXs](https://youtube.com/shorts/6JjvQQTXTXs), [O9tSF4T67rw](https://youtube.com/shorts/O9tSF4T67rw)
- Flops on our topics: [sLAB9R9dPZQ](https://youtube.com/shorts/sLAB9R9dPZQ), [J8Cc20QQpyY](https://youtube.com/shorts/J8Cc20QQpyY), [2oVNmgHIvKU](https://youtube.com/shorts/2oVNmgHIvKU), [tuXqWLTsf0c](https://youtube.com/shorts/tuXqWLTsf0c)

**Write-ups and guides:**
- [Digital Craft Workshop on Zack D. Films](https://danielrusnok.substack.com/p/how-a-faceless-channel-engineered)
- [longstories guide](https://longstories.ai/blog/complete-guide-ai-3d-animation-youtube) (vendor)
- [Snaplama guide](https://www.snaplama.com/blog/how-to-create-animation-videos-like-zack-d-films-in-2026) (vendor)
- XO3D on [educational](https://xo3d.co.uk/resources/3d-animation/educational-animations/) and [exploded](https://xo3d.co.uk/resources/3d-animation/product-animation/exploded-animations/) animation
- [ContentStudio Shorts analytics](https://contentstudio.io/blog/youtube-shorts-analytics-guide)
- [vidIQ Shorts algorithm](https://vidiq.com/blog/post/youtube-shorts-algorithm/)
- [3Play Media on the Verizon/Publicis caption survey](https://www.3playmedia.com/blog/verizon-media-and-publicis-media-find-viewers-want-captions/)
- [GamesRadar on the PS1 low-poly look](https://www.gamesradar.com/exploring-the-resurgence-of-the-low-fi-3d-visual-style-of-the-ps1-era)
- [3D AI Studio on PS1 vs modern low-poly](https://www.3daistudio.com/blog/ps1-graphics-how-to-make-ps1-style-3d-models)

**FOOH:**
- [Marketing Brew](https://www.marketingbrew.com/stories/2023/10/26/why-some-brands-are-embracing-fake-out-of-home)
- [Adweek](https://www.adweek.com/creativity/cgi-ads-are-taking-over-your-city/)
- [Econsultancy](https://econsultancy.com/fake-outdoor-advertising-fooh)
- [Creative Bloq on Maybelline](https://www.creativebloq.com/news/maybelline-tube-train-campaign)

**AI-look complaints:**
- [Creative Bloq, "AI animation needs to stop"](https://www.creativebloq.com/news/ai-animation-needs-to-stop)
- [Creative Bloq, Blender artist accused of AI](https://www.creativebloq.com/art/digital-art/blender-artist-has-to-prove-their-work-isnt-ai)
- [UX Magazine](https://uxmag.com/articles/what-exactly-am-i-looking-at)
- [NPR on AI slop](https://www.npr.org/2025/08/28/nx-s1-5493485/ai-slop-videos-youtube-tiktok)

**Policy:**
- [YouTube altered/synthetic disclosure](https://support.google.com/youtube/answer/14328491)
- [YouTube channel monetization policies](https://support.google.com/youtube/answer/1311392)
- [TikTok AI-generated content](https://support.tiktok.com/en/using-tiktok/creating-videos/ai-generated-content)
- [Hootsuite on TikTok AI disclosure](https://blog.hootsuite.com/ai-disclosure-policy-for-tiktok/)
- [TikTok newsroom, Nov 2025](https://newsroom.tiktok.com/more-ways-to-spot-shape-and-understand-ai-generated-content?lang=en-GB)
- [TechCrunch on Instagram's aggregator crackdown](https://techcrunch.com/2026/04/30/instagram-restricts-reach-of-content-aggregators-in-new-crackdown/)
- Meta's AI label rules: see the stickman report (docs/research/stickman-2026-11-21.md), Report 5
