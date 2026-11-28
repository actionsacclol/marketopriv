// Rubber hose: a story told like a 1930s ink-and-paint cartoon. Our own bean-bodied cast with bendy hose arms, white
// gloves, big shoes and pie-cut eyes acts every line; the whole world bounces on the beat (the houses and trees too),
// the picture is old film (grain, flicker, dust, scratches, a little gate weave), places change with an iris, turns
// get an art-deco title card, and the last line closes in an iris. Drawing lives in src/render/presets/hose.ts.
//
// A beat row: seconds | narration | move | top label | props | say | flags

export const HOSE_MOVES = ['idle', 'talk', 'walk', 'run', 'jump', 'shock', 'happy', 'sad', 'anger', 'think', 'point', 'laugh', 'whistle', 'sneak', 'fall', 'dance', 'shrug'] as const;
export type HoseMove = (typeof HOSE_MOVES)[number];
export const isHoseMove = (v: string): v is HoseMove => (HOSE_MOVES as readonly string[]).includes(v);

export const HOSE_SETS = ['street', 'house', 'park', 'farm', 'city', 'bank', 'stage', 'sea', 'office'] as const;
export type HoseSet = (typeof HOSE_SETS)[number];

export const HOSE_PROPS = ['cash', 'coin', 'bag', 'letter', 'phone', 'key', 'pie', 'bomb', 'anvil', 'umbrella', 'clock', 'paper', 'cup', 'flower', 'safe', 'ticker'] as const;
export type HoseProp = (typeof HOSE_PROPS)[number];

export const HOSE_FILMS = ['mono', 'sepia', 'twostrip'] as const;
export type HoseFilm = (typeof HOSE_FILMS)[number];

/** Our own cast: a head shape, a hat and a build each, so they read apart in black and white. */
export interface HoseLook {
  hat: 'bowler' | 'flower' | 'sailor' | 'beanie' | 'tophat' | 'curls';
  /** Body width and height scale. */
  w: number;
  h: number;
  /** Body fill: dark or a pattern. */
  body: 'black' | 'dots' | 'stripes' | 'grey';
  nose: 'button' | 'long' | 'round';
}
export const HOSE_CAST: Record<string, HoseLook> = {
  bert: { hat: 'bowler', w: 1, h: 1.08, body: 'black', nose: 'button' },
  mabel: { hat: 'flower', w: 0.92, h: 0.9, body: 'dots', nose: 'button' },
  gus: { hat: 'sailor', w: 1.3, h: 1, body: 'stripes', nose: 'round' },
  skip: { hat: 'beanie', w: 0.82, h: 0.78, body: 'grey', nose: 'button' },
  otto: { hat: 'tophat', w: 0.86, h: 1.25, body: 'black', nose: 'long' },
  pearl: { hat: 'curls', w: 1, h: 0.95, body: 'stripes', nose: 'button' },
};
export const HOSE_CAST_NAMES = Object.keys(HOSE_CAST);

export function hoseCast(raw: string): string[] {
  const out = raw
    .split(/[;,]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => !!HOSE_CAST[x])
    .slice(0, 3);
  return out.length ? out : ['bert'];
}

export function hoseMoves(acting: string, n: number, focus: number): HoseMove[] {
  const parts = acting.split('/').map((x) => x.trim().toLowerCase());
  if (parts.length === 1) return Array.from({ length: n }, (_, k) => (k === focus ? (isHoseMove(parts[0]) ? parts[0] : 'talk') : 'idle'));
  return Array.from({ length: n }, (_, k) => (isHoseMove(parts[k] ?? '') ? (parts[k] as HoseMove) : 'idle'));
}

export function hoseProps(raw: string): Array<{ kind: HoseProp; who: number }> {
  const out: Array<{ kind: HoseProp; who: number }> = [];
  for (const part of raw.split(';')) {
    const m = /^\s*(?:([abc])\s*:\s*)?([a-z]+)\s*$/i.exec(part);
    if (m && (HOSE_PROPS as readonly string[]).includes(m[2].toLowerCase())) out.push({ kind: m[2].toLowerCase() as HoseProp, who: m[1] ? 'abc'.indexOf(m[1].toLowerCase()) : 0 });
  }
  return out;
}

export const HOSE_FLAG = new RegExp(`^(?:who=[abc]|shot=(?:wide|close)|set=(?:${HOSE_SETS.join('|')})|day|night|title|end|rain|shake|solo)$`);

export const HOSE_HELP =
  'One line per row: seconds | narration | move | top label | props | say | flags. narration = what the narrator says (the captions, and the voice when there is one). ' +
  `move = what the cast does: ${HOSE_MOVES.join(', ')}; one move for whoever the line is about (who=), or one each, "talk/shock". A new move every line. ` +
  'top label = a small sign over the scene ("1929", "MONDAY"), empty = none. ' +
  `props (; between them, B: / C: = theirs): ${HOSE_PROPS.join(', ')}. ` +
  `Flags: who=a|b|c, shot=wide|close (empty = the hub picks), set=${HOSE_SETS.join('|')} (an iris closes and opens on that place), day|night, title (the narration as an art-deco title card: "MEANWHILE", "THE NEXT DAY"), rain, shake, solo (only whoever the line is about), end (the last line, then the iris closes), pause=0.6, speed=0.95, and the effects. `;
