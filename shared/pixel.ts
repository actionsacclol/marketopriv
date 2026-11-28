// Pixel Theater: a story told like a little 16-bit game. Our own white pixel cast acts every line in pixel places
// (each with its own small palette), the words type out in a game text box, choices pop up as a menu, the HUD
// counts coins and hearts, big pixel title cards mark the turns ("LEVEL 2", "GAME OVER"), and the last line types
// out alone on black. Drawing lives in src/render/presets/pixel.ts.
//
// A beat row: seconds | narration | move | top label | props | say | flags
//   move  = what the cast does: one move for whoever the line is about ("shock"), or one each ("talk/sad")
//   top   = a small pixel label over the scene ("2013", "DAY 1"), empty = none
//   props = "coin;B:phone": what they hold or what pops up (B: / C: = theirs)

export const PIXEL_MOVES = ['idle', 'talk', 'walk', 'run', 'jump', 'shock', 'happy', 'sad', 'think', 'point', 'sit', 'type', 'phone', 'fall', 'dance', 'sleep'] as const;
export type PixelMove = (typeof PIXEL_MOVES)[number];
export const isPixelMove = (v: string): v is PixelMove => (PIXEL_MOVES as readonly string[]).includes(v);

export const PIXEL_SETS = ['city', 'room', 'office', 'street', 'forest', 'desert', 'space', 'shop', 'bank', 'void'] as const;
export type PixelSet = (typeof PIXEL_SETS)[number];

export const PIXEL_PROPS = ['coin', 'cash', 'phone', 'letter', 'key', 'chest', 'heart', 'star', 'bag', 'laptop', 'chart', 'clock', 'gift', 'cup', 'pizza', 'trophy'] as const;
export type PixelProp = (typeof PIXEL_PROPS)[number];

/** Our own pixel cast: white figures, each with one coloured thing that makes them easy to tell apart. */
export interface PixelLook {
  /** The coloured thing. */
  mark: 'cap' | 'scarf' | 'bow' | 'tie' | 'phones' | 'spikes';
  color: string;
  glasses?: boolean;
  /** Taller or shorter than the rest (px). */
  height: number;
}
export const PIXEL_CAST: Record<string, PixelLook> = {
  pip: { mark: 'cap', color: '#E8423F', height: 0 },
  mo: { mark: 'scarf', color: '#3F8CE8', height: 2 },
  ivy: { mark: 'bow', color: '#F07AB4', height: -1 },
  zed: { mark: 'tie', color: '#F2C33A', glasses: true, height: 3 },
  tok: { mark: 'phones', color: '#45C46A', height: 0 },
  lux: { mark: 'spikes', color: '#F29A3A', height: 1 },
};
export const PIXEL_CAST_NAMES = Object.keys(PIXEL_CAST);

export function pixelCast(raw: string): string[] {
  const out = raw
    .split(/[;,]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => !!PIXEL_CAST[x])
    .slice(0, 3);
  return out.length ? out : ['pip'];
}

export function pixelMoves(acting: string, n: number, focus: number): PixelMove[] {
  const parts = acting.split('/').map((x) => x.trim().toLowerCase());
  if (parts.length === 1) return Array.from({ length: n }, (_, k) => (k === focus ? (isPixelMove(parts[0]) ? parts[0] : 'talk') : 'idle'));
  return Array.from({ length: n }, (_, k) => (isPixelMove(parts[k] ?? '') ? (parts[k] as PixelMove) : 'idle'));
}

export function pixelProps(raw: string): Array<{ kind: PixelProp; who: number }> {
  const out: Array<{ kind: PixelProp; who: number }> = [];
  for (const part of raw.split(';')) {
    const m = /^\s*(?:([abc])\s*:\s*)?([a-z]+)\s*$/i.exec(part);
    if (m && (PIXEL_PROPS as readonly string[]).includes(m[2].toLowerCase())) out.push({ kind: m[2].toLowerCase() as PixelProp, who: m[1] ? 'abc'.indexOf(m[1].toLowerCase()) : 0 });
  }
  return out;
}

/** Flags only this style reads. choice=sell/hold shows a menu (the first is picked); coins=, hp= set the HUD. */
export const PIXEL_FLAG = new RegExp(`^(?:who=[abc]|shot=(?:wide|close)|set=(?:${PIXEL_SETS.join('|')})|day|night|title|end|choice=[^\\s]{1,40}|coins=\\d{1,9}|hp=[0-5]|rain|shake|solo)$`);

export const PIXEL_HELP =
  'One line per row: seconds | narration | move | top label | props | say | flags. narration = what is said, typed out in the game text box (and read by the voice when there is one). ' +
  `move = what the cast does: ${PIXEL_MOVES.join(', ')}; one move for whoever the line is about (who=), or one each, "talk/sad". A new move every line. ` +
  'top label = a small pixel label over the scene ("2013", "DAY 1"), empty = none. ' +
  `props (; between them, B: / C: = theirs): ${PIXEL_PROPS.join(', ')}. ` +
  `Flags: who=a|b|c (who the line is about), shot=wide|close (empty = the hub picks), set=${PIXEL_SETS.join('|')} (a block wipe to that place), day|night, title (the narration as a big pixel title card: "LEVEL 2", "GAME OVER", "3 YEARS LATER"), choice=sell/hold (a menu; the first one gets picked, _ for spaces: choice=keep_it/sell_it), coins=120 / hp=3 (the HUD from here on), rain, shake, solo (only whoever the line is about), end (the last line typed alone on black), pause=0.6, speed=0.95, and the effects. `;
