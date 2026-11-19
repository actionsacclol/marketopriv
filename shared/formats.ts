import type { Fields } from './types';

// Reel formats: proven story structures to start from. A format is a preset
// (all of these use the story engine) plus a beat skeleton, the job of each
// beat and hook patterns to test. The skeleton's numbers are examples: the
// dateline says so until it is replaced, so an unedited format can't pass
// for real data.

export interface ReelFormat {
  id: string;
  name: string;
  /** When to pick it. */
  pitch: string;
  preset: string;
  /** What each beat is for, in order. */
  structure: string[];
  /** Openings to A/B test (make_hook_variants). */
  hooks: string[];
  fields: Fields;
  caption: string;
}

const EXAMPLE = 'EXAMPLE DATA · REPLACE BEFORE RENDERING';
const beats = (lines: string[]): string => lines.join('\n');

export const FORMATS: ReelFormat[] = [
  {
    id: 'vote-story',
    name: 'Comment vote story',
    pitch: 'One part of a story series (the vote style): the mascot hits a choice, viewers vote A or B in the comments, the most votes decide the next part. Pass vote: {series, part, a, b} to create_reel.',
    preset: 'story',
    structure: [
      'Part 2 on: the result first ("You picked B."), then what happened (character beat).',
      'The situation, big and specific (character beat with a big word or number).',
      'The twist that forces a choice (character beat).',
      'The choice: the headline names both options ("*A:* ... *B:* ..."), poll visual with a = "A;B", said out loud, ending "Comment A or B." (pause=0.4).',
      'Most votes decides part N+1 (wave).',
    ],
    hooks: ['The stakes first (“KIP found 10,000 SOL.”)', 'The result first, from part 2 on (“You picked B. Bad idea.”)', 'The question first (“What would you do?”)'],
    fields: {
      kicker: 'PART 1',
      art: 'ps2',
      bed: 'pulse',
      disclaimer: '',
      beats: beats([
        '3.2 | KIP finds his old laptop. The wallet on it holds *10,000 SOL*. | shock | 10,000 SOL | | Kip finds his old laptop. The wallet on it holds ten thousand sol.',
        '2.8 | One problem: he *forgot* the password. | facepalm | | | One problem. He forgot the password.',
        '3.2 | An hour later, a "recovery expert" *DMs* him. | think | NEW MESSAGE | | An hour later, a recovery expert DMs him.',
        '4.2 | *A:* pay the expert. *B:* guess the password himself. | poll | A;B | comment your pick | What should Kip do? A, pay the expert. Or B, guess the password himself. Comment A or B. | pause=0.4',
        '2.4 | Most votes decides *part 2*. | wave | PART 2 | | Most votes decides part two.',
      ]),
      loop: false,
      cta_seconds: 0,
    },
    caption: 'Part 1. KIP found 10,000 SOL on an old laptop, and forgot the password.\n\nComment A or B. Most votes decides part 2.',
  },
  {
    id: 'would-you-copy',
    name: 'Would you copy this?',
    pitch: 'Show a wallet that looks great, ask the viewer to commit in the comments, then reveal what copiers actually got. Drives comments and watch-through.',
    preset: 'story',
    structure: [
      'Hook: the wallet’s best number, big (number).',
      'Its record, checked row by row (wallet).',
      'The question, with a silence so people answer (poll, pause=0.4).',
      'The reveal: what copying it did (chart, dark wipe).',
      'The verdict, stamped (stamp).',
      'Why: the mechanism in one picture (lag / flow / steps).',
      'What to do instead, with the tool (card).',
      'Follow for the next one (follow).',
    ],
    hooks: ['The wallet’s profit first (“This wallet made $48K last month.”)', 'The question first (“Would you copy this wallet?”)', 'The twist first (“Everyone who copied this wallet lost money.”)', 'A dare (“Pick before the reveal.”)'],
    fields: {
      kicker: EXAMPLE,
      beats: beats([
        '2.6 | This wallet made *$48,210* last month. | number | +$48,210 | 30-day PnL, recorded on-chain | This wallet made forty eight thousand dollars last month.',
        '3.2 | 214 trades. *71%* of them won. | wallet | Wallet 7xKp…3fQ | Trades:214;Win rate:71%;Avg hold:9 min | Two hundred fourteen trades. Seventy one percent of them won.',
        '3.0 | Would you *copy* it? | poll | Copy;Skip | answer in the comments before the reveal | Would you copy it? Answer before the reveal. | pause=0.4',
        '3.4 | Here’s what copiers got. | chart | 1000,1012,1020,1004,961,906 | $% | Here is what copiers got. | dark wipe',
        '2.6 | Same wallet. *Opposite* result. | stamp | −9.4% | copiers, same 30 days | Same wallet. Opposite result. Copiers lost nine point four percent. | dark',
        '3.4 | Copiers buy *after* the wallet does. The price already moved. | lag | WALLET | COPIERS | | light wipe',
        '3.0 | Replay a wallet on paper before you risk a cent. | card | Krypto Mirror | Paper mode first;Replays recorded trades;Runs on your PC',
        '2.6 | I replay a new wallet every week. | follow | Follow | the next replay drops next week',
      ]),
      theme: 'light',
      loop: true,
    },
    caption: 'Would you have copied it? Comment before you watch the reveal.\n\nReplay of recorded trades. Not financial advice.',
  },
  {
    id: 'explainer',
    name: '30-second explainer',
    pitch: 'One idea (copy lag, slippage, front-running, fees) explained with one diagram per beat. Gets saves.',
    preset: 'story',
    structure: [
      'Hook: the question people actually have (title).',
      'The setup in one picture (lag / flow / steps).',
      'The cost, as one number (number).',
      'Where it goes (flow / bars).',
      'The takeaway in one line (title, dark).',
      'Follow (follow).',
    ],
    hooks: ['The question (“Why does copy trading lose money?”)', 'The number (“Copying costs you 2.4% per trade. Here’s where it goes.”)', '“In 30 seconds:”', 'The myth (“Copying a winner doesn’t make you a winner.”)'],
    fields: {
      kicker: EXAMPLE,
      beats: beats([
        '2.6 | Why copy trading *loses* money, in 30 seconds. | title | 30s | copy lag, explained | Why copy trading loses money, in thirty seconds.',
        '3.4 | A wallet buys. Your bot sees it *seconds* later. | lag | WALLET | YOUR BOT',
        '3.0 | By then the price is up. | chart | 1,1.02,1.05,1.09,1.1 | $% | By then, the price is up.',
        '3.0 | You pay the difference on every copy. | number | -2.4% | per copied trade (example) | You pay the difference on every copy.',
        '3.0 | Their win is *your* entry price. | title | | | | dark wipe',
        '2.6 | More of these every week. | follow | Follow | one idea per reel',
      ]),
      theme: 'light',
      loop: true,
    },
    caption: 'Copy lag in 30 seconds. Save it for later.\n\nNot financial advice.',
  },
  {
    id: 'myth-vs-data',
    name: 'Myth vs data',
    pitch: 'Put a popular claim on screen, test it with our recorded data, stamp the verdict. Gets shares and comment arguments.',
    preset: 'story',
    structure: [
      'The myth, quoted (title with a/“MYTH?”).',
      'How we tested it (dots / steps).',
      'The data (bars / chart).',
      'The verdict (stamp, dark wipe).',
      'The nuance: why (lag / flow).',
      'The tool (card), then follow.',
    ],
    hooks: ['The myth as a quote (“Just copy the top wallet.”)', 'The verdict first (“Copying the top wallet lost money. We checked.”)', '“Is this true? We tested it.”'],
    fields: {
      kicker: EXAMPLE,
      beats: beats([
        '2.6 | “Just copy the *top* wallet.” | title | MYTH? | the most repeated advice in crypto | Just copy the top wallet.',
        '3.0 | We replayed the top 10 for 30 days. | dots | 10 | wallets replayed | We replayed the top ten for thirty days.',
        '3.4 | What they made, and what copiers made. | bars | Wallets:+31;*Copiers:-6 | % in 30 days',
        '2.4 | Busted. | stamp | BUSTED | copying them ≠ their results | | dark wipe pause=0.3',
        '3.2 | Copiers fill later, at worse prices. | lag | WALLET | COPIERS | | dark',
        '3.0 | Check what *you* would have kept first. | card | Krypto Mirror | Replays recorded trades;Paper mode first;Runs on your PC | | light wipe',
        '2.4 | Next myth on Friday. | follow | Follow | one myth per week',
      ]),
      theme: 'light',
      loop: true,
    },
    caption: 'Tested it so you don’t have to. Which myth next?\n\nReplay of recorded trades. Not financial advice.',
  },
  {
    id: 'paper-diary',
    name: 'Paper-trade diary',
    pitch: 'An episode series: “Day N of copying the top wallet, paper money.” Gives people a reason to follow. Show losses as plainly as wins.',
    preset: 'story',
    structure: [
      'Day number + “paper money” (title).',
      'What it did today (wallet).',
      'Balance so far (chart).',
      'Today’s result, signed (number).',
      'One thing learned (title, dark).',
      'Tomorrow’s episode (follow).',
    ],
    hooks: ['“Day 4 of copying the top wallet. Paper money.”', 'The result first (“Day 4: down 3.1%.”)', 'A tease (“Day 4 is where it went wrong.”)'],
    fields: {
      kicker: EXAMPLE,
      beats: beats([
        '2.6 | Day *4* of copying the top wallet. Paper money. | title | DAY 4 | paper mode · $1,000 start | Day four of copying the top wallet. Paper money.',
        '3.2 | Today it opened three trades. | wallet | Today | Trade 1:+4.1%;Trade 2:-7.8%;Trade 3:-1.2%',
        '3.2 | The balance so far. | chart | 1000,1018,1009,997,966 | $%',
        '2.6 | Four days in: | number | -3.4% | paper balance, day 4 | Four days in: down three point four percent.',
        '3.0 | Its losers were *bigger* than its winners. | title | | | | dark wipe',
        '2.4 | Day 5 tomorrow. | follow | Follow | the diary continues',
      ]),
      theme: 'light',
      loop: true,
    },
    caption: 'Day 4. Paper money, real wallet. Follow for day 5.\n\nPaper trading. Not financial advice.',
  },
  {
    id: 'news',
    name: 'Same-day news story',
    pitch: 'A real on-chain event told in beats the day it happens (the Sable-style news desk). Speed matters more than polish.',
    preset: 'story',
    structure: [
      'Dateline + the event in one line (title / number).',
      'What happened, step by step (flow / steps / chart).',
      'The number that matters (number / dots).',
      'Why it matters to a normal trader (title, dark).',
      'What we built for it (card), follow.',
    ],
    hooks: ['The event (“Yesterday one wallet dumped $2M of a coin in 4 seconds.”)', 'The victim (“10,939 wallets were still holding.”)', 'The question (“How did one wallet see it first?”)'],
    fields: {
      kicker: 'EXAMPLE · DATE · SOURCE',
      beats: beats([
        '3.0 | Yesterday, one wallet sold *$2.1M* of a coin in four seconds. | number | $2.1M | sold in 4 seconds | Yesterday, one wallet sold two point one million dollars of a coin in four seconds.',
        '3.4 | It had bought in early, from five wallets. | flow | A;B;C;D;E | 983 SOL',
        '3.2 | The price after the sale: | chart | 0.2,0.5,7.3,15.1,0.6 | $%M | The price after the sale.',
        '3.0 | 10,939 wallets were still holding. | dots | 10,939 | wallets holding at the top | Ten thousand nine hundred thirty nine wallets were still holding.',
        '3.2 | If you copy wallets, you’re *last* in line. | title | | | | dark wipe',
        '2.6 | I break down one of these every week. | follow | Follow | real data, no hype',
      ]),
      theme: 'light',
      loop: true,
    },
    caption: 'One wallet, four seconds. Here’s how it played out.\n\nReplay of recorded trades. Not financial advice.',
  },
  {
    id: 'pov',
    name: 'POV meme (no voice)',
    pitch: 'A 6–9 second text-and-diagram joke that loops. Cheap to post often; add a trending sound in the Instagram app when posting.',
    preset: 'story',
    structure: ['The POV line with the situation (lag / chart).', 'The punchline (stamp).', 'Loops back to the start.'],
    hooks: ['“POV: you copied the whale 4 seconds late.”', '“Me after copying the top wallet:”', '“The whale vs the people copying the whale:”'],
    fields: {
      kicker: '',
      beats: beats([
        '2.4 | POV: you copied the whale *4 seconds* late. | lag | WHALE | YOU | -',
        '2.2 | You bought the top. | chart | 1,1.4,2.6,2.7 | $% | -',
        '2.0 | He already sold. | stamp | −31% | | - | dark',
      ]),
      voiceover: false,
      sfx: true,
      theme: 'light',
      loop: true,
    },
    caption: 'Every time.\n\nNot financial advice.',
  },
];

export const formatById = (id: string): ReelFormat | undefined => FORMATS.find((f) => f.id === id);

export function formatSummary(f: ReelFormat): string {
  return [
    `${f.id} · ${f.name} (${f.preset})`,
    `  ${f.pitch}`,
    `  Beats: ${f.structure.map((s, i) => `${i + 1}. ${s}`).join(' ')}`,
    `  Hooks to test: ${f.hooks.join(' | ')}`,
  ].join('\n');
}
