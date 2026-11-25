import { ACTIONS } from './character';

// The duo preset ("Ask the AI" reels): a person asks, an AI character answers, in a small 3D room. After a cold open
// the top half of the frame is a board with the answer's parts as tabs and one diagram per line.

export const DUO_SETS = ['studio', 'diner', 'terminal'] as const;
export type DuoSet = (typeof DUO_SETS)[number];

/** Flags only the duo preset reads (cam=wide|a|b|close and who=a|b are shared with the stickman). */
export const DUO_FLAG = new RegExp(`^(?:part=[1-4]|full|act=(?:${ACTIONS.join('|')}))$`);

export const DUO_HELP =
  'One line per row: seconds | line | visual | a | b | say | flags. line = the caption and what the voice reads (*word* = highlight; say = something else to read, - = silent). ' +
  'Who talks: the AI character, unless the flag who=a makes it the asker\'s line. With a second voice (asker_voice, which the hub fills in when the user has two voices) the asker\'s lines are spoken in it: write them to be heard, a short question or a full sentence, seconds 1. Without one they are speech bubbles and are not read out: 2-6 words, about 1.5 seconds. ' +
  'The reel opens full screen on the two of them (the cold open: the claim, the asker\'s question, the promise of the parts). The flag part=1 on a line brings the board down with part 1 open; part=2, part=3 move on (the parts field names the tabs). full = this line is full screen again (a reaction, the last exchange). ' +
  'visual = what the board shows from this line on, kept by the lines after it until one names a new visual: any of the story preset\'s diagrams with the same a and b (title, number, steps, bars, card, stamp, chart, flow, wallet, coin, dots, follow, poll, lag, screen = the screen recording in the video field from second a) or none. On a full-screen line: chip (a = a big word or number, b = a small tag under it; a card in the top corner that stays for the rest of the cold open) or none. ' +
  'The last line: visual end (line = the "send this to..." sentence, a = the next step such as "Comment *GUIDE* for the steps" or the link, b = a small line). ' +
  `Other flags: cam=wide / cam=a / cam=b (full-screen lines: default wide on the first, then on whoever talks), act=<move> for the one talking (${ACTIONS.join(', ')}), pause=0.6, speed=0.95, and the effects. `;

/** The tabs' names ("What it is;How to do it;Is it real?"), at most four. */
export const duoParts = (s: string): string[] =>
  s
    .split(/[;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 4);

interface Line {
  visual: string;
  tags: string[];
}

export interface DuoLine {
  /** The part its board shows (0-based), -1 = full screen. */
  part: number;
  /** The part the reel has reached by this line (-1 = still in the cold open): which tabs are ticked. */
  reached: number;
  /** The line whose visual the board shows (-1 = none yet in this part). */
  held: number;
  asker: boolean;
  end: boolean;
}

/** Where each line sits: its part, whether it is full screen, and which earlier line's visual the board still shows. */
export function duoLines(beats: Line[]): DuoLine[] {
  let reached = -1;
  let held = -1;
  return beats.map((b, i) => {
    const p = b.tags.map((t) => /^part=(\d)$/.exec(t)).find(Boolean);
    if (p) {
      const next = Number(p[1]) - 1;
      if (next !== reached) held = -1;
      reached = next;
    }
    const end = b.visual === 'end';
    const full = end || reached < 0 || b.tags.includes('full');
    if (!full && b.visual !== 'none' && b.visual !== 'chip' && b.visual !== '') held = i;
    return { part: full ? -1 : reached, reached, held: full ? -1 : held, asker: b.tags.includes('who=a'), end };
  });
}
