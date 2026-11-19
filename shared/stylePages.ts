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
};
