// Hook styles: the kinds of opening a reel can have. Every reel is tagged with the one it opens on (Reel.hookStyle),
// so the results can say which kind of opening gets watched on each platform.

export interface HookStyle {
  id: string;
  name: string;
  /** How to write one. */
  how: string;
  /** The pattern, with blanks. */
  pattern: string;
}

export const HOOK_STYLES: HookStyle[] = [
  { id: 'outcome', name: 'Result first', how: 'Frame 0 is the finished result, already happening on screen; the line says what the viewer is looking at. Explain how afterwards.', pattern: '[The result, as a plain fact about the viewer\'s own thing]. [The detail that makes it strange].' },
  { id: 'pain', name: 'Their problem', how: 'Name a problem the viewer has right now, in the words they would use, then promise the cause or the fix.', pattern: 'Your [thing] [does the annoying thing]. [It is not what you think / here is why].' },
  { id: 'mistake', name: 'Stop doing this', how: 'Call out something the viewer is doing that hurts them. The video shows what it costs and what to do instead.', pattern: 'Stop [common habit]. [What it really does].' },
  { id: 'gap', name: 'Curiosity gap', how: 'Say that something exists and hold back what it is. The answer comes late, and it has to be worth the wait.', pattern: '[Familiar thing] has [a hidden thing]. [A hint at which one matters most].' },
  { id: 'callout', name: 'Call the viewer out', how: 'Name the exact viewer (a game, a job, a device), then ask the question they cannot answer.', pattern: '[Exact group]: why [odd thing they all put up with]?' },
  { id: 'myth', name: 'Everyone is wrong', how: 'A belief the viewer holds, then the flip, in one breath. The video proves it.', pattern: '[Popular belief]. [It is wrong / it is the other way round].' },
  { id: 'test', name: 'Real test', how: 'A test that was really run, with its numbers: what was tried, on how many, for how long. The result comes at the end. Never invent one.', pattern: 'I [gave / ran / tried] [exact thing] [exact count or time]. [Tease the result].' },
  { id: 'number', name: 'Counted list', how: 'A number and a promise, with one item flagged as the surprise so people stay for it.', pattern: '[N] [things] [the viewer wants]. [Number N is the one nobody knows].' },
];

export const HOOK_STYLE_IDS = HOOK_STYLES.map((h) => h.id);
export const hookStyleById = (id: string | undefined): HookStyle | undefined => HOOK_STYLES.find((h) => h.id === id);

/** The rules every opening has to pass, whatever its style. */
export const HOOK_RULES: string[] = [
  'Three things land together in the first second: the picture (frame 0 already shows the result or the problem, and it moves), the words on screen (7 or fewer, the biggest thing in the frame), and the spoken line (starts at 0s, done by about 2.5s).',
  'The viewer or the result is the subject, never the product. No product or brand name in the first beat, on screen, spoken or in the small line at the top.',
  'Open a loop the video closes: the first line makes a promise that a later beat pays off. A first line that finishes its own thought gives nobody a reason to stay.',
  'Specific beats general: a named game, device, app, number or time. If the line would work unchanged for a competitor, rewrite it.',
  'True: no invented tests, comments, numbers or reactions, and nothing the product does not do.',
  'The second beat keeps the promise moving (the cause, the first proof, the first step). It is never a logo, a product name or a feature list.',
  'Write five openings in five different styles before picking one. Say each out loud: if it takes longer than one breath, cut it.',
];

/** The hook part of the AI's instructions. */
export function hooksNote(): string {
  return [
    `- Hooks decide whether anything else gets watched. Every reel opens in ONE named hook style; pass it as hook_style to create_reel (or update_reel): ${HOOK_STYLES.map((h) => `${h.id} (${h.name}: ${h.how})`).join(' ')}`,
    `  Rules for every opening: ${HOOK_RULES.map((r, i) => `(${i + 1}) ${r}`).join(' ')}`,
    '  Rotate the styles: get_performance has a hook style test per platform and names the style to use next there. Do not use the same style twice in a row on one platform while the test is running.',
  ].join('\n');
}
