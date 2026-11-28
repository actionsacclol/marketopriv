// The lecture preset: a short lesson. A cartoon teacher (the brand's character) talks in the bottom-right corner
// while a board over the rest of the frame builds the lesson: titles, steps, numbers and stamps landing on the exact
// word that names them. Drawing lives in src/render/presets/lecture.ts.

/** Flags only the lecture reads: at=<word> (the line's card lands on that word), clear (the board empties). */
export const LECTURE_FLAG = /^(?:at=[a-z0-9$%'+.-]{1,30}|clear)$/;

export const LECTURE_HELP =
  'One line per row: seconds | line | visual | a | b | say | flags. line = the caption and what the teacher says (*word* = highlight; say = something else to read, - = silent). ' +
  'visual = what lands on the board with this line, and stays there under the lines after it until one brings a new one: any of the story preset\'s diagrams with the same a and b (title, number, steps, bars, card, stamp, chart, flow, wallet, coin, dots, follow, poll, lag, screen = the screen recording in the video field from second a) or none (keep what is up). Say each idea out loud before or as it lands, never after. ' +
  'at=<word> makes the card land on that word of the line instead of at its start ("at=acceleration", the word as written, no spaces); the board keeps the last card until then. clear = the board empties (a new section). ' +
  'The last line: visual end (line = the closing sentence, a = the next step such as "Follow for *part two*", b = a small line). ' +
  'Other flags: act=<move> for the teacher (talk, point, present, shrug, shock, cheer, think, wave, facepalm, sad, laugh; default: present when a card lands, talk otherwise), pause=0.6, speed=0.95, and the effects. ';

const plain = (s: string): string => s.toLowerCase().replace(/[^a-z0-9$%'+.-]/g, '');

/** The index of the word an at= flag names in a line's words (-1 = not found: the card lands at the line's start). */
export function atWord(words: string[], tags: string[]): number {
  const t = tags.find((x) => x.startsWith('at='));
  if (!t) return -1;
  const want = plain(t.slice(3));
  const exact = words.findIndex((w) => plain(w) === want);
  if (exact >= 0) return exact;
  return words.findIndex((w) => plain(w).replace(/[.']+$/, '').startsWith(want.replace(/[.']+$/, '')));
}
