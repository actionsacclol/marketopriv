// The page for each channel style (Styles > a style): why it works, hooks that
// work, how one video is built, and how long it runs. The style itself (name,
// label, rules for the AI) is in shared/styles.ts.

export interface StylePage {
  length: string;
  /** Why it works, one benefit per line. */
  benefits: string[];
  /** Openings that work for it (examples of the first line). */
  hooks: string[];
  /** How one video is built, beat by beat. */
  structure: string[];
}

export const STYLE_PAGES: Record<string, StylePage> = {
  reddit: {
    length: '40-75s per part',
    benefits: [
      'People stay to hear how it ends: a good story holds a viewer far longer than a list or a demo.',
      'The question at the end ("am I the jerk?") turns viewers into commenters, and the comments push the video further.',
      'Long stories come in parts, and parts are the strongest reason to follow an account.',
      'Nothing to film: the hub draws the background, or uses gameplay from your Backgrounds folder.',
    ],
    hooks: ['"AITA for eating my roommate\'s labelled leftovers after she ate mine for a month?"', '"My sister sold my car while I was on vacation."', '"I found out why my neighbour mows his lawn at 6am."', '"Part 2: she finally answered the door."'],
    structure: ['A post card with the title: the hook', 'The setup, with one specific detail', 'It builds, line by line', 'The twist, with a zoom and a boom', 'What happened after', 'The question to the viewer, or "Part 2"'],
  },
  greentext: {
    length: '20-45s',
    benefits: [
      'Short and absurd: people watch it twice to catch the lines, which is what the feeds reward.',
      'A deadpan voice over a self-own is a format everyone already knows how to read.',
      'The board fills up line by line, so there is always a reason to keep watching.',
      'No footage needed: the board and the background are made by the hub.',
    ],
    hooks: ['">be me / >first day at new job"', '">be me / >decide to get my life together"', '">tfw you realise the meeting was about you"', '">be me / >24 / >still scared of the self checkout"'],
    structure: ['">be me" and who you are', 'The setup, one tiny line at a time', 'It escalates', 'The twist or the self-own, with a hit', 'One last deadpan line'],
  },
  meme: {
    length: '8-20s',
    benefits: [
      'Relatable memes are the content people send to friends most, and every send is reach.',
      'Short and looping: a slideshow gets watched more than once, which the feeds count.',
      'Uses the meme pictures you collect in your Memes folder, or the mascot when none fit.',
      'Works for any niche: the jokes are about your audience\'s life.',
    ],
    hooks: ['"me when the code works and I don\'t know why"', '"nobody: / my brain at 3am:"', '"pov: you said you\'d sleep early"', '"them: are you ok? / me:"'],
    structure: ['The most relatable meme first (it is the thumbnail)', 'Two to five more on the same feeling', 'The strongest last, with an effect', 'Hard cuts with a pop, hub-made music, loops'],
  },
  dumb: {
    length: '5-15s',
    benefits: [
      'Absurd edits are made to be rewatched and shared, the two things that push a video furthest.',
      'Tiny to make: one setup and one hit, so an account can post a lot of them.',
      'The zoom, boom, shake and deep-fry effects and the sounds are built in and made by the hub, so nothing gets muted.',
      'Works on any clip, meme picture or the mascot.',
    ],
    hooks: ['"bro thought..."', '"nah because why did he..."', '"the way he..."', '"me trying to act normal after..."'],
    structure: ['The setup, played straight', 'The punchline: zoom onto the face with a boom and a shake', 'Optional: a deep-fried freeze to end on', 'Loops back to the start'],
  },
  clipping: {
    length: '10-45s',
    benefits: [
      'The moments are already proven: top clips by views are the ones people chose to watch and share.',
      'A new clip every day without filming or writing anything.',
      'Facecam on top, gameplay below and captions on every line is the layout viewers expect from clip pages, and it works with sound off.',
      'Fans of the streamer search for and share these, so a clip channel grows with the streamer.',
    ],
    hooks: ['"He did NOT expect that"', '"Chat called it 10 seconds before"', '"The worst timing on stream this week"', '"Nobody in chat believed him"'],
    structure: ['Start on the action, no intro', 'Facecam on top, gameplay below, the streamer\'s own sound', 'Captions on every line, a few words at a time', 'Cut before it drags: 10-45s', 'The streamer named in the post caption'],
  },
  main: {
    length: '20-40s',
    benefits: [
      'Real stories people would watch anyway, so reach does not depend on the product.',
      'Numbers on screen (live charts, counters, wallets) make it feel like proof, not an ad.',
      'The product shows up as the lesson at the end, which reads as useful instead of salesy.',
      'Built-in tests (art style, voice, hooks, music) keep learning what works on each platform.',
    ],
    hooks: ['"This wallet made $48,210 last month."', '"Everyone who copied this wallet lost money."', '"A coin went up 4,000% and its buyers still lost."', '"Here\'s what happened to the people who bought the top."'],
    structure: ['Hook: the biggest number or the twist, readable with sound off', 'The story in 3-5 beats, each with one visual (chart, wallet, flow, steps)', 'The turn: what actually happened (stamp or dark chart)', 'Why it happened, in one picture', 'The tool, where it fits (card)', 'Follow for the next one'],
  },
  vote: {
    length: '20-35s per part',
    benefits: [
      'Every part asks for a comment, and comments push a video to more people.',
      'Viewers come back for the next part to see if their side won, so followers grow with the series.',
      'Each part is short and cheap to make: one situation, one choice.',
      'The mascot as the main character makes it a recognisable series.',
    ],
    hooks: ['"KIP found 10,000 SOL on an old laptop."', '"You picked B. Bad idea."', '"Part 3: the stranger answered."', '"What would you do?"'],
    structure: ['From part 2: the result of the vote ("You picked B")', 'The situation, big and specific', 'The twist that forces a choice', 'The choice: A or B, with a countdown, "Comment A or B"', '"Most votes decides part N+1"'],
  },
  tips: {
    length: '15-25s',
    benefits: [
      'People save tips to use later, and saves are one of the signals that push a video further.',
      'One tip per video means a lot of videos from one topic.',
      'The cartoon mascot makes a dry how-to fun to watch.',
      'Exact steps (real keys and menu names) build trust in the account.',
    ],
    hooks: ['"Your PC takes forever to start?"', '"Stop doing this in Windows."', '"This setting is costing you FPS."', '"Nobody tells you about this shortcut."'],
    structure: ['The problem, as the viewer feels it', 'Why it happens, in one line', 'The exact steps on screen', 'The result', '"Follow for one tip a day"'],
  },
  retro: {
    length: '15-30s',
    benefits: [
      'The early-2000s console look stops the scroll: it looks like nothing else in the feed.',
      'Framing a checklist as a "side quest" makes it feel like a game, not a lecture.',
      'Nostalgia gets shares from people who grew up with that look.',
    ],
    hooks: ['"Side quest: check a coin before you buy it."', '"New quest unlocked: a faster PC."', '"Boss fight: the rug pull."'],
    structure: ['"Side quest:" and the goal', 'Each step a stage, in the dialogue box', '"Quest complete." with the result'],
  },
  toy: {
    length: '15-25s',
    benefits: [
      'A friendly, polished mascot gives the account a face people remember.',
      'Works for warnings without feeling preachy.',
      'Calm look and music suit Facebook and Reels audiences.',
    ],
    hooks: ['"You download a setup.exe..."', '"Ever clicked this by accident?"', '"Your PC after one free download:"'],
    structure: ['A relatable moment', 'The mascot reacts', 'The fix, shown simply', 'A friendly sign-off'],
  },
  wyr: {
    length: '20-30s',
    benefits: [
      'Answering costs one word, so lots of people comment.',
      'People argue in the replies, and every reply counts as engagement.',
      'Easy to make in series: one theme, new choices every time.',
      'Watch time stays high because each countdown makes people wait for the next choice.',
    ],
    hooks: ['"Would you rather have 1 bitcoin from 2015, or $10,000 today?"', '"Only 1% pick the second one."', '"Choose fast."'],
    structure: ['3-5 choices, each a poll with a 3-2-1 countdown', 'Both sides tempting, from your niche', '"Comment your picks"'],
  },
  case: {
    length: '30-45s',
    benefits: [
      'True crime is one of the most watched genres; crypto rugs and hacks are true crime with numbers.',
      'People share warnings to protect friends, so these travel.',
      'Teaches red flags, which makes the account trusted (and makes the tool\'s value obvious without a pitch).',
      'Real cases come out every week, so the ideas never run out.',
    ],
    hooks: ['"This coin hit $2,861. Its buyers could not sell."', '"$60 million vanished 20 hours after launch."', '"The red flags were public."', '"He lost everything with one signature."'],
    structure: ['The loss or the twist, with the number', 'How the scam worked (wallet, flow, steps)', 'The moment it collapsed (stamp)', 'Where the money went', 'The red flags anyone could check', 'Follow for the next case'],
  },
  quiz: {
    length: '20-30s',
    benefits: [
      'A guess makes the viewer part of the video, so they watch to the reveal.',
      'People rewatch to check what they guessed, which raises watch time.',
      'Comments fill with guesses and "I knew it".',
      'Real charts teach history without a lecture.',
    ],
    hooks: ['"Bitcoin just hit $20,000. Where was it a year later?"', '"Guess before the reveal."', '"Most people get this wrong."'],
    structure: ['The setup chart, cut at the big moment', 'The question, with a countdown', 'The real chart continuing (dark wipe)', 'The result, stamped', '"Did you guess right?"'],
  },
  myth: {
    length: '20-30s',
    benefits: [
      'Saying "everyone believes this, and it is wrong" is one of the strongest hooks there is.',
      'People share it to settle arguments.',
      'The verdict stamp gives a satisfying ending people rewatch.',
    ],
    hooks: ['"Myth: a RAM cleaner makes your PC faster."', '"You\'ve been told this your whole life."', '"Busted in 20 seconds."'],
    structure: ['The myth, the way people say it', 'What is actually true, with a number or the screen', 'The verdict: BUSTED / TRUE / HALF TRUE', 'What to do instead', 'Follow for the next myth'],
  },
  top: {
    length: '20-30s',
    benefits: [
      'Lists promise a clear payoff, and countdowns keep people waiting for number one.',
      'Voiced, with sound effects and music, so the algorithm does not treat it as a silent post.',
      'Easy series: part 1, part 2, part 3.',
    ],
    hooks: ['"3 Windows shortcuts nobody uses."', '"5 apps I install on every PC."', '"Number one is the one you need."'],
    structure: ['The promise ("3 shortcuts...")', 'One item per beat, counting down, each voiced', 'Number one last', 'Follow for part 2'],
  },
  chat: {
    length: '25-40s',
    benefits: [
      'Text-message stories are one of the biggest formats on TikTok: people read along and stay to the end.',
      'The twist lands as a message, which makes it feel real and personal.',
      'Perfect for scam awareness: the viewer learns the trick by watching it happen.',
      'Cheap to make: no footage, just a conversation.',
    ],
    hooks: ['"I got this DM yesterday."', '"My friend sent me this at 3am."', '"Read this before you reply to support."'],
    structure: ['The first message, with the setup line', 'The conversation, building tension (2-3 messages a beat)', 'The twist', 'The lesson: how to spot it (stamp or steps)', 'Follow'],
  },
  versus: {
    length: '15-30s',
    benefits: [
      'A price on screen is an instant reaction: "people pay HOW much for that?" gets comments and shares.',
      'The free tool doing the same job right after is the proof, so the reel sells without a pitch.',
      'Every paid app is a new part, so it runs as a series.',
    ],
    hooks: ['"People pay $45 a year for this."', '"Stop paying for a crosshair."', '"This costs $180 a year. This one costs $0."'],
    structure: ['The paid app and its real price, stamped', 'What that money buys', 'The free Krypt tool doing the same thing on a real screen', '"$0" stamp with the real difference', 'Where to get it'],
  },
  tier: {
    length: '25-35s',
    benefits: [
      'Rankings start arguments, and arguments are comments.',
      'The board filling up keeps people watching to see where the last item lands.',
      'Every niche has a hundred things to rank, so it is an endless series.',
    ],
    hooks: ['"Ranking every way to store a seed phrase."', '"Tier list: Windows settings you should change."', '"You will disagree with the F tier."'],
    structure: ['What is being ranked', 'One item per beat, dropped onto its tier, with the reason', 'The most surprising one last', '"Where would you put them?"'],
  },
  screen: {
    length: '15-30s',
    benefits: [
      'The screen is the proof: people see the app do the thing, so they trust it.',
      'Exact steps on a real screen get saved and shared.',
      'Screen-recorded tips are doing well for PC accounts on TikTok (one tweak video there passed 21K likes).',
      'Zooming in on each button keeps a landscape recording readable on a phone.',
    ],
    hooks: ['"Your whole PC on one screen."', '"This one click freed 20 GB."', '"Do this before your next match."'],
    structure: ['The result first', 'Each step: the recording, zoomed on the button, with a callout', 'The result again', 'Where to get it'],
  },
  stickman: {
    length: '10-25s versus, 45-65s explainers',
    benefits: [
      'Two stick figures doing the same thing differently is one of the biggest short formats of 2026: people watch to see who wins and comment which one they are.',
      'A narrated "why does this happen?" explainer gets watched to the end and saved.',
      'The stickman shows the problem and a real screen recording shows the fix, so the product is the payoff, not an ad.',
      'Nothing to film: the hub draws the figures, props and camera moves, and the mouth moves with the voice.',
    ],
    hooks: ['"Same game. Same PC."', '"Why does your PC get slower every year?"', '"Why your mouse feels like it\'s on ice."', '"Overthinker vs Doer: the 3 AM fix."'],
    structure: ['Versus: two named figures in the same situation', 'Each beat: what each one does', 'The payoff: the smart one lights up, the real screen for 2-3 s', '"Which one are you?"', 'Explainer: the question, the cause in scenes, the fix on a real screen, the result'],
  },
  ps2: {
    length: '15-35s',
    benefits: [
      'The early-2000s console look is instant nostalgia: people stop on it before they know what the video is about.',
      'A hard cut every line keeps the picture moving, so even a two-person chat feels edited.',
      'Short relatable lines with subtitles work with the sound off and get sent to "the friend who does this".',
      'Nothing to film or animate: the hub builds the characters, the set, the moves, the mouths and every shot.',
    ],
    hooks: ['"So... what are you up to these days?"', '"Bro, why does your PC sound like a jet?"', '"Wait. You still have that on?"'],
    structure: ['The setup line', 'Back and forth, a new move each line', 'The line everyone recognises, close up', 'The reaction', 'A time jump as the tag'],
  },
  pixel: {
    length: '30-60s',
    benefits: [
      'The game look is instantly familiar and plays to a huge gaming audience, so people stop on it.',
      'A choice menu and a HUD turn a story into a level: people watch to see what was picked and what it cost.',
      'The quiet typed ending lands the lesson and gets replays and shares.',
      'Nothing to film or animate: the hub draws the cast, the places, the menu, the HUD and every move.',
    ],
    hooks: ['"He is about to pay 10,000 bitcoin. For pizza."', '"Level 1: quit your job."', '"She had 3 lives left. She used 2 in one week."'],
    structure: ['The strangest moment, HUD set', 'Who, when, what they wanted', 'The choice, as a menu', 'What it cost, the HUD changes', 'One last line typed on black'],
  },
  hose: {
    length: '30-60s',
    benefits: [
      'The 1930s cartoon look is rare in a modern feed and instantly reads as fun, so people stop and watch.',
      'Everything bounces on the beat, so the picture never sits still even when the story slows down.',
      'Cons, blunders and old inventions are made for this look: they are history people love to share.',
      'Nothing to film or animate: the hub draws the cast, the places, the old film and every iris.',
    ],
    hooks: ['"This man is selling the Eiffel Tower."', '"In 1929 a man sold a bridge. Twice."', '"Nobody believed the bank was empty."'],
    structure: ['The strangest moment', 'Where, when, what they wanted', 'The trick, acted out', 'A title card, then what happened', 'One closing line, the iris closes'],
  },
  tv: {
    length: '30-60s',
    benefits: [
      'Glowing figures on a dark screen look nothing like the rest of the feed, so they stop the scroll.',
      'The calm, cosy look keeps people watching a slower story or explainer to the end.',
      'Static and channel numbers between places make every change feel like an event.',
      'Nothing to film or animate: the hub draws the glowing cast, the places, the tube and every move.',
    ],
    hooks: ['"A computer from 1977 starts talking nonsense."', '"This signal has been travelling for 40 years."', '"The internet once fit on one floppy disk."'],
    structure: ['The strangest fact', 'What and where, one channel per place', 'The problem, acted out', 'An on-screen title for the turn', 'One calm line, the set switches off'],
  },
  ink: {
    length: '30-60s',
    benefits: [
      'A true story told fast keeps people to the end: they want to know how it turns out, so watch time and shares go up.',
      'The hand-inked old-cartoon look stands out in a feed of screen recordings and talking heads.',
      'Every line is acted out and every thing is drawn, so the picture changes as fast as the story.',
      'Nothing to film or animate: the hub draws the cast, the places, the props and every camera move.',
    ],
    hooks: ['"This man wants to dig up a whole landfill."', '"He paid 10,000 bitcoin for two pizzas."', '"She found $400 in a jacket. It was hers."'],
    structure: ['The worst moment, present tense', 'Who, and what they wanted', 'The turn, acted out with the thing it is about', 'The twist, a number on a big prop', 'One closing line, close up'],
  },
  blox: {
    length: '7-12s dances, 12-25s skits, 25-45s rants',
    benefits: [
      'Blocky-avatar animation is a look a huge young audience already watches all day, so the video feels at home in their feed.',
      'One recognisable avatar turns a run of videos into a channel people follow for the character.',
      'Three lengths from one style: a narrated rant, a wordless two-avatar skit, a looping dance under one line.',
      'Nothing to film or animate: the hub builds the avatar, the world, the moves and the camera, and moves the mouth with the voice.',
    ],
    hooks: ['"Your PC is not slow. It is busy."', '"My PC with 40 tabs open"', '"me after fixing one bug"', '"Day 1 me vs day 30 me"'],
    structure: ['Rant: the complaint, the reasons one scene a line, the big moment, the fix, the result', 'Skit: two named avatars, bubbles, a fall as the punchline', 'Dance: one line, three moves, a new camera each beat, loops'],
  },
  slides: {
    length: '5-8 slides (10 at most)',
    benefits: [
      'People swipe at their own pace, so a list or a how-to gets read to the end and saved for later.',
      'One slideshow becomes a photo post on Instagram, TikTok, Threads, Facebook and X, and a short video with music for Pinterest.',
      'Nothing to film or narrate: the hub draws the slides from your text, screenshots and screen recordings.',
      'Each platform gets the picture shape that fills its feed (4:5 on Instagram, full screen on TikTok).',
    ],
    hooks: ['"4 Windows settings to turn off today"', '"Stop apps from starting with Windows"', '"5 things your PC does behind your back"', '"3 mistakes every new streamer makes"'],
    structure: ['The cover: a number or a promise, big', 'One idea a slide: a short title and two lines at most', 'A real screenshot every second or third slide', 'The last slide: a reason to save or send it'],
  },
  whatif: {
    length: "25-40s space, 25-45s stickman",
    benefits: ["A question nobody can answer keeps people watching to the end, and the end is what makes them comment and rewatch.","Told in order of time (\"after 8 minutes\", \"within a week\"), so there is always a next thing to wait for.","Two looks from one style: bright space scenes with a little astronaut, or a stick-figure cartoon at dusk.","Nothing to film: the hub draws every scene and times the captions to the voice."],
    hooks: ["\"What if the Sun vanished right now?\"","\"What if Earth stopped spinning?\"","\"What if you stayed awake for 24 hours?\""],
    structure: ["The question","The first thing that happens, with its time","What changes, scene by scene","The big moment, close up","A strange true fact to end on"],
  },
  survival: {
    length: "25-40s per part",
    benefits: ["Told to \"you\", so the viewer is the one in trouble and stays to see if they make it.","The day, time and battery bar runs down on screen: a clock people can see makes every part tense.","Each part ends on an A or B vote, so the comments decide part 2 and people come back for it.","A rule card and a real fact card in every part make it worth saving."],
    hooks: ["\"You wake up. The power is out.\"","\"Your phone has 9% left.\"","\"You hear knocking. It is 3 AM.\""],
    structure: ["The vote result (part 2 on)","The situation, second person","A rule card","A real fact card","The twist, the bar moving on","A or B: comment to decide part N+1"],
  },
  cutaway: {
    length: "25-40s",
    benefits: ["Seeing under the ground is something people never get to see, so they stop scrolling.","Every line adds something that stays, so the picture keeps getting fuller and people wait for the next build.","A running total in the corner turns it into a \"how much?\" game that people argue about in the comments.","Nothing to film: the hub builds the 3D yard, digs every build and moves the camera."],
    hooks: ["\"You just bought a house with a big backyard.\"","\"This is what a $200,000 backyard looks like.\"","\"How deep can you dig under your house?\""],
    structure: ["The setup","A small, normal build first","Bigger and stranger, one a line, each with its cost","The biggest, close up","\"Would you build this?\""],
  },
  diorama: {
    length: '25-45s',
    benefits: [
      'A little world that changes every line is satisfying to watch, so people stay to see the next piece land.',
      'Growth and time-lapse stories ("from a garage to a tower", "your house in 10,000 years") are made for it and get shared.',
      'A number climbing in the corner turns it into a game people argue about in the comments.',
      'Nothing to film: the hub builds the 3D world, places every piece, runs the weather and moves the camera.',
    ],
    hooks: ['"Day one. A garage, a desk and you."', '"This is your house. Today."', '"Watch this empty lot turn into a city."'],
    structure: ['The start', 'It grows or changes, one line at a time', 'The counter climbs', 'The big change, close or low', 'One line to end on'],
  },
  lecture: {
    length: "40-60s",
    benefits: ["A teacher and a board read as a real lesson, so people save it to come back to.","Each card lands on the exact word that names it, which keeps eyes on the screen while the voice talks.","A series name on the board (\"PC BASICS #4\") turns single lessons into a show people follow.","Nothing to film: the hub draws the character, the board and every card, and moves the mouth with the voice."],
    hooks: ["\"Windows has a mouse setting called Enhance pointer precision.\"","\"Your PC has a setting that slows your games down.\"","\"This is why your Wi-Fi drops at night.\""],
    structure: ["What it is and why it matters","Why it happens","How to fix or use it, step by step","The result","What to do next"],
  },
  uimotion: {
    length: "8-16s, loops",
    benefits: ["Smooth, satisfying motion gets watched twice, and a loop with no clear end gets watched many times.","It shows what an app does in its own words, with no voice and no talking head.","Clicks land on the beat of the music, so it feels made with care.","Nothing to design: the hub morphs one shape through the states you list."],
    hooks: ["The first state is the hook: one word people want (\"Get started\", \"Clean\", \"Boost\")"],
    structure: ["The button that starts it","What you set","What happens","The payoff","The logo, then it loops"],
  },
  ask: {
    length: '45-70s',
    benefits: [
      "The asker says what the viewer is thinking, so the answer plays as a conversation, not a lecture.",
      "Three named parts on a board show people how far along they are and what is still coming.",
      "The last part is an honest check, and every episode ends on \"send this to the friend who...\".",
      "Nothing to film: the hub draws the room, both characters, the board and its diagrams, and moves the mouths with the voice.",
    ],
    hooks: ["\"One Windows setting is messing with your aim.\"", "\"People say this one click frees 20 GB.\"", "\"Everyone says you need a new PC for this.\""],
    structure: ["Cold open: the claim, the asker's question, \"three parts\"", "Part 1: what it is", "Part 2: how to do it, on the board or a real screen", "Part 3: is it real? The answer on a stamp", "\"Send this to the friend who...\""],
  },
};
