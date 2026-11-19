// Text that goes out under an account's name (comments, replies, messages, captions, text posts) has to read like a
// person typed it. Text that reads as machine-written is what gets accounts restricted, so the rules live here once:
// HUMAN_RULES is what every connected AI is told, textProblems() is what the hub checks before anything is sent.
//
// The numbers come from reading real threads on X (2026-11-17: Polymarket / Kalshi bots, PC tweaking, software
// builders; about 45 replies, a dozen posts). Replies there: median about 5 words, nearly all under 60 characters,
// mostly no full stop at the end, about a third lowercase, a lone reaction or a lone question, never a remark with a
// question after it. Accounts with a million views reply the same way ("cc in terminal yep", "facts").
import type { Site } from './types';

export type TextKind = 'comment' | 'message' | 'post';

/**
 * Lines in the register people really use, written for these rules (not copied from anyone). They show the AI the
 * level to write at; a comment that reuses one is turned back, so no two installs post the same line.
 */
export const REGISTER_EXAMPLES = [
  'wait this works on kalshi too?',
  'been doing this by hand for a year lol',
  'the 13 min old wallet tho',
  'does it handle partial fills',
  'ok the prefetch one actually helped',
  'which windows build is this on',
  'not on a laptop it doesnt',
  'need this for the ipad',
  'fees eat most of that tbh',
  'so who took the other side',
];

/** The writing rules, as one bullet of the instructions. */
export const HUMAN_RULES =
  'Writing for the platforms (comments, replies, DMs, captions, text posts, threads, bios): type like the real people and the big accounts in the niche do, on every platform. Text that reads as machine-written gets accounts restricted or banned, so this matters more than hitting a number. The level to hit was measured on real X threads in these niches: replies run about 5 words, nearly all under 60 characters, usually with no full stop at the end, about a third of them all lowercase. ' +
  'Comments and replies: first read the replies already under that post, then write one that would not stand out among them. One short line: a reaction to one thing in the post, OR one question, OR one thing you know from doing it. Never two of those joined, and never a remark with a question after it. Type it the way they do: contractions, everyday words, their abbreviations and slang where the thread uses them (tbh, rn, lol, bro), lowercase and no end punctuation more often than not, a missing apostrophe is fine. ' +
  `The register, as examples (the level only: never reuse these or any line you already sent): ${REGISTER_EXAMPLES.slice(0, 7).map((e) => `"${e}"`).join(', ')}. ` +
  'What gives an AI away, so never: a full, tidy sentence with a clause on each side of a comma, the post summed up back to its author, analysis, recomputed maths or several numbers, a verdict line ("that\'s the whole trick", "X is the part most people skip", "X, not Y"), openers like "Agreed", "Right", "Worth knowing", "For scale", "Great point", "I totally get it", their own words in quotation marks, em dashes, semicolons, colons, lists, hashtags. They are not brand copy: no slogans, no pitch. ' +
  'Change the shape every time: a different first word, a different length, mostly no question, not always lowercase and not always capitalised. A longer reply (still under about 25 words, typed the same loose way) is for answering someone who asked something that needs it; never several long ones in a row. ' +
  'DMs: answer what they asked in a line or two, the way you would text. No greeting formula, no "happy to help", no "feel free to", no lists. ' +
  'Text posts and threads (X, Threads): write them the way accounts that get read there do. First person ("I built", "we tested") or a plain news line, one thought per line with a line break in place of the full stop, real numbers, the last line without a full stop, no hashtags on X. ' +
  'Captions keep the brand\'s voice and the playbook. In every post and caption leave out the tells: no em dashes, no "it\'s not X, it\'s Y", no stock AI words (delve, game-changer, landscape, seamless, deep dive), no bold or bullet marks, and not the same opening as the last few posts. ' +
  'The hub reads comments, replies, messages and post text before they go out and refuses text with these tells, saying what to change: write it again (browser_type with clear: true) and send again. That is a rewrite, not a failed post. Nothing specific to say about a post: like it and move on; the comment goal is met with short real ones on other posts, never with filler.';

/** Longest comment or reply, in characters and sentences. The longest real reply seen was about 125 characters. */
const COMMENT_MAX: Record<Site, [number, number]> = {
  instagram: [140, 2],
  tiktok: [120, 2],
  pinterest: [120, 2],
  facebook: [150, 2],
  youtube: [150, 2],
  threads: [160, 2],
  x: [160, 2],
};
const MESSAGE_MAX = 500;
/** A comment longer than this is a long one: about one real reply in ten is. */
const LONG = 60;

const DASH = /[—–]/;
const MARKUP = /\*\*|__|^\s*[-•*]\s+\S|^#{1,3}\s/m;
const LIST = /^\s*\d+[.)]\s+\S/m;

/** Words and turns of phrase people know as machine-written, in any kind of text. */
const AI_WORDS: RegExp[] = [
  /\bdelv(e|es|ing)\b/i,
  /\bgame[- ]?changers?\b/i,
  /\btestament to\b/i,
  /\b(landscape|tapestry|realm|treasure trove)\b/i,
  /\bresonat(e|es|ed|ing)\b/i,
  /\b(insightful|invaluable|pivotal|seamless(ly)?|robust|crucial|nuanced?)\b/i,
  /\b(moreover|furthermore|additionally|in conclusion|ultimately)\b/i,
  /\b(deep dive|dive in(to)?|let'?s (break|dive|unpack)|here'?s the (thing|kicker))\b/i,
  /\b(it'?s worth noting|the truth is|that said|at its core|ever[- ]evolving|sheds? light|stands out)\b/i,
  /\bin today'?s (world|market|digital|fast)\b/i,
  /\bnot (just|only|merely)\b[^.?!]*\bbut\b/i,
  /\bnot (just|only|merely)\b[^.?!]{2,50}[,;—–-] ?(it'?s|it is|they'?re|that'?s)\b/i,
  /\b(isn'?t|aren'?t|wasn'?t|it'?s not|that'?s not|this is not|is not)\b[^.?!,;]{2,40}[,;] ?(it'?s|it is|they'?re|that'?s|this is)\b/i,
];

/** The verdict lines and openers that mark a comment as written by a model. Short plain praise is not here: people do write "best tweaks". */
const COMMENT_TELLS: RegExp[] = [
  /\b(is|are|was|were|'s) the (part|step|line|one|bit|detail|thing|number|setting|tip|trick) (that )?(most|people|nobody|everyone|everybody|no one|few)\b/i,
  /\b(most|many) (people|guides|bots|clips|videos|versions|folks|traders|tutorials) (skip|miss|forget|ignore|overlook|never|don'?t)\b/i,
  /\bthe (whole|real|actual|entire) (trick|thing|point|race|trade|story|game|detail|tell|question|answer|edge|account|problem|issue|deal)\b/i,
  /\bthe (odd|strange|hard|open|bold|useful|interesting|scary|wild|key|important|funny|sad|sane|safe) (part|one|bit|version)\b/i,
  /\b(worth (knowing|noting|remembering|logging|checking|adding|mentioning|another look|a look)|the one worth)\b/i,
  /^(for (scale|context|reference)|careful with|respect for|credit for|props (for|to)|straight answer|that tracks|(fair|good|great|solid) point|i (totally|completely) (get|agree|understand))\b/i,
  /^(agreed|exactly|correct|indeed|absolutely|precisely)[.,!]/i,
  /^right[.,!] /i,
  /\b(great|good|nice|solid|excellent|insightful) (point|breakdown|take|explanation|write-?up|analysis|insight|perspective)\b/i,
  /\b(love (how|the way)|well (said|put)|spot on|couldn'?t agree more|thanks for sharing)\b/i,
  /\bthis is (such|exactly)\b/i,
  /\bcurious (if|whether|how|what|about)\b/i,
  /\b(says more than|that one (line|number|detail))\b/i,
  /\w, not (a|an|the|just|on|in|by|for|what|how|\w+ing)\b/i,
];

/** How a helpdesk bot writes a direct message. */
const MESSAGE_TELLS: RegExp[] = [
  /\b(happy|glad) to help\b/i,
  /\bfeel free to\b/i,
  /\b(don'?t|do not) hesitate\b/i,
  /\b(i )?hope (this|that) helps\b/i,
  /\bgreat question\b/i,
  /\bthank(s| you) for reaching out\b/i,
  /\blet me know if you (have|need)\b/i,
  /\bi'?d be (happy|glad)\b/i,
  /^(certainly|absolutely|of course)[!.,]/i,
];

const sentences = (t: string): string[] =>
  t
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => /[a-z0-9]/i.test(s));

const firstWord = (t: string): string => (t.trim().match(/^[^a-z0-9@]*([a-z0-9@']+)/i)?.[1] ?? '').toLowerCase();

const words = (t: string): Set<string> => new Set(t.toLowerCase().match(/[a-z0-9']{3,}/g) ?? []);

/** Share of words two texts have in common (0 to 1). */
function overlap(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size < 3 || y.size < 3) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

const hit = (text: string, list: RegExp[]): string[] => list.map((re) => text.match(re)?.[0]?.trim()).filter((m): m is string => !!m);

const quote = (list: string[]): string => list.slice(0, 3).map((m) => `"${m}"`).join(', ');

const size = (t: string): number => Array.from(t.trim()).length;
const long = (t: string): boolean => size(t) > LONG;
const asks = (t: string): boolean => /\?\s*$/.test(t.trim());
const stops = (t: string): boolean => /[a-z0-9)]\.\s*$/i.test(t.trim());
const capital = (t: string): boolean => /^[^a-z0-9]*[A-Z]/.test(t.trim());

/**
 * Why a text would read as machine-written, each as an instruction for the rewrite. Empty = fine to send.
 * `earlier` is what the hub already sent of the same kind, newest first.
 */
export function textProblems(kind: TextKind, site: Site, text: string, earlier: string[] = []): string[] {
  const t = text.trim();
  if (!t) return [];
  const out: string[] = [];
  const n = size(t);
  const sent = sentences(t);
  if (DASH.test(t)) out.push('take out the long dash (use a comma or a full stop)');
  const ai = hit(t, AI_WORDS);
  if (ai.length) out.push(`reword ${quote(ai)}: a stock AI phrase`);

  if (kind === 'post') {
    if (MARKUP.test(t)) out.push('no bold marks or bullet marks: platforms show them as raw symbols');
    return out;
  }

  if (MARKUP.test(t) || LIST.test(t)) out.push('no lists or formatting marks');
  if (kind === 'message') {
    if (n > MESSAGE_MAX) out.push(`${n} characters is too long for a DM: answer in a line or two (under ${MESSAGE_MAX})`);
    const m = hit(t, MESSAGE_TELLS);
    if (m.length) out.push(`drop ${quote(m)}: support-desk wording`);
    if (earlier.some((e) => size(e) > 40 && overlap(t, e) >= 0.7)) out.push('nearly the same wording as a message already sent: say it differently');
    return out;
  }

  // Comments and replies.
  const [maxChars, maxSent] = COMMENT_MAX[site];
  if (n > maxChars) out.push(`${n} characters is too long here: under ${maxChars}, and most under ${LONG} (real replies run about 5 words)`);
  if (sent.length > maxSent) out.push(`${sent.length} sentences: one thought, one short line`);
  const tells = hit(t, COMMENT_TELLS);
  if (tells.length) out.push(`reword ${quote(tells)}: a verdict line or stock opener that marks a comment as written by an AI`);
  if (/;/.test(t)) out.push('no semicolon');
  if (/[a-z)"']:\s/i.test(t)) out.push('no colon lead-in');
  if (/(^|\s)#[a-z]\w*/i.test(t)) out.push('no hashtags in a comment');
  if (/["“][^"”]{3,}["”]/.test(t)) out.push('do not put their words in quotation marks');
  if ((t.match(/,/g) ?? []).length > 1) out.push('more than one comma: that is a composed sentence, people type one loose line');
  // Whole number tokens only ($4K, 96.9%, 627ms), so a wallet address or a version in a link is not counted.
  const numbers = t.split(/\s+/).filter((w) => /^[($~+-]*\d[\d,.:/]*(k|m|b|x|c|s|ms|gb|mb|fps|hz|%|¢)?[).,!?]*$/i.test(w));
  if (numbers.length > 2) out.push(`${numbers.length} numbers reads like a calculation: one number at most`);
  if (asks(t) && sent.length > 1) out.push('a remark with a question after it: keep the remark or the question, not both');
  else if (asks(t) && earlier.slice(0, 4).filter(asks).length >= 2) out.push('too many of the recent comments are questions: make this one a remark');
  if (REGISTER_EXAMPLES.some((e) => overlap(t, e) >= 0.6)) out.push("that is one of the hub's example lines: write your own about this post");

  // Against what was sent before: the same shape again and again is as visible as one bad comment.
  const first = firstWord(t);
  if (first && earlier.slice(0, 4).some((e) => firstWord(e) === first)) out.push(`a recent comment also started with "${first}": start differently`);
  if (earlier.slice(0, 40).some((e) => overlap(t, e) >= 0.55)) out.push('nearly the same wording as an earlier comment: say something else');
  if (long(t) && earlier.slice(0, 3).some(long)) out.push(`one of the last comments was long too: make this one a short line (under ${LONG} characters, a few words)`);
  if (stops(t) && earlier.slice(0, 2).length === 2 && earlier.slice(0, 2).every(stops)) out.push('the last comments all ended with a full stop: leave it off, most real replies have none');
  const last4 = earlier.slice(0, 4);
  const last6 = earlier.slice(0, 6);
  if (last6.length === 6 && capital(t) && last6.every(capital)) out.push('every recent comment starts with a capital letter: type this one lowercase, about a third of real replies are');
  if (last4.length === 4 && !capital(t) && last4.every((e) => !capital(e))) out.push('every recent comment is lowercase: start this one with a capital, so they do not all look alike');
  return out;
}

/** The refusal an AI gets when a text would read as machine-written. */
export function rewriteNote(kind: TextKind, problems: string[], typed: boolean): string {
  const what = kind === 'comment' ? 'comment or reply' : kind === 'message' ? 'message' : 'post text';
  const how =
    kind === 'comment'
      ? 'Write it the way the other replies under this post are written: a few plain words about one thing, typed loosely.'
      : kind === 'message'
        ? 'Write it the way you would text someone back.'
        : 'Keep what it says and fix the wording.';
  return `${typed ? 'Not sent' : 'Not typed'}: this ${what} would read as machine-written, and that is what gets accounts restricted. Change this: ${problems.slice(0, 5).join('; ')}. ${how} Then browser_type it again${typed ? ' with clear: true' : ''} and send. This is a rewrite, not a failed post.`;
}
