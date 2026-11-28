// The ink cartoon style: a narrated story acted out by our own caricature cast, drawn like a hand-inked cel (thin
// warm-brown pen lines that swell and taper, flat colours from one locked palette, short tick textures), in layered
// sets the camera never stops moving through, with a warm grainy print finish and yellow word captions.
// Drawing lives in src/render/ink/* and src/render/presets/ink.ts.
//
// A beat row: seconds | narration | acting | top label | props | say | flags
//   acting = what the cast does: one move for whoever the line is about ("shock"), or one per cast member ("talk/smug")
//   top    = a small label over the shot ("2013", "3 YEARS LATER"), empty = none
//   props  = "drive;B:cash": what they hold (B: / C: = theirs); an insert shot shows the first one big

export const INK_MOVES = ['idle', 'talk', 'point', 'shock', 'anger', 'smug', 'joy', 'grief', 'think', 'shrug', 'hold', 'phone', 'fear', 'laugh', 'facepalm', 'dig'] as const;
export type InkMove = (typeof INK_MOVES)[number];
export const isInkMove = (v: string): v is InkMove => (INK_MOVES as readonly string[]).includes(v);

export const INK_SETS = ['road', 'street', 'room', 'office', 'bar', 'farm', 'court', 'bank', 'city', 'dump'] as const;
export type InkSet = (typeof INK_SETS)[number];

export const INK_SHOTS = ['wide', 'two', 'mid', 'close', 'react', 'insert'] as const;
export type InkShot = (typeof INK_SHOTS)[number];

export const INK_TIMES = ['day', 'dusk', 'night'] as const;
export type InkTime = (typeof INK_TIMES)[number];

export const INK_PROPS = ['cash', 'bag', 'coin', 'phone', 'letter', 'laptop', 'chart', 'keys', 'briefcase', 'drive', 'trashbag', 'shovel', 'gavel', 'burger', 'mug', 'bottle', 'trophy', 'card', 'goldbar', 'ring'] as const;
export type InkProp = (typeof INK_PROPS)[number];

/** The locked colours of one video: one blue, one skin for the whole cast, one pale, two accents. */
export const INK_PALETTES = ['sunset', 'neon', 'rust'] as const;
export type InkPaletteId = (typeof INK_PALETTES)[number];
export interface InkPalette {
  blue: string;
  skin: string;
  /** Skin in cast shadow / where bone and fat catch light. */
  skinDark: string;
  skinLit: string;
  pale: string;
  accent: string;
  accent2: string;
}
export const INK_PALETTE: Record<InkPaletteId, InkPalette> = {
  sunset: { blue: '#3E5BB8', skin: '#F2967A', skinDark: '#D06A5C', skinLit: '#FFB89A', pale: '#F3E6C8', accent: '#F2B53A', accent2: '#C8423A' },
  neon: { blue: '#7C86E8', skin: '#F07AA0', skinDark: '#C9527E', skinLit: '#FFA3BF', pale: '#E4D6F2', accent: '#7FCB6A', accent2: '#F2C14A' },
  rust: { blue: '#2F55A8', skin: '#E9774E', skinDark: '#C2533A', skinLit: '#FF9B6E', pale: '#F2E2C4', accent: '#D9A33A', accent2: '#4E8A5A' },
};

/** A colour of the palette by its role, or a fixed colour. */
export type InkRole = keyof Omit<InkPalette, 'skin' | 'skinDark' | 'skinLit'> | 'dark' | 'white' | 'denim' | 'brown' | 'grey';
export const INK_FIXED: Record<'dark' | 'white' | 'denim' | 'brown' | 'grey', string> = { dark: '#2A2430', white: '#F7F2E8', denim: '#4F6FA8', brown: '#7A4A2C', grey: '#8E8C96' };

/** One of our own cast (no real people). Build sets the silhouette; one feature makes each one recognisable. */
export interface InkLook {
  build: 'huge' | 'big' | 'mid' | 'thin' | 'short';
  /** Head shape: jaw = wide lower face, egg = narrow top, long = long face, round. */
  head: 'jaw' | 'egg' | 'long' | 'round';
  nose: 'bulb' | 'long' | 'hook' | 'button';
  hair: 'slick' | 'mullet' | 'horseshoe' | 'buzz' | 'curly' | 'bob' | 'bowl' | 'tufts' | 'bun' | 'none';
  hairColor: InkRole;
  beard?: 'full' | 'stubble' | 'walrus' | 'pencil';
  hat?: 'cap' | 'cowboy' | 'beanie';
  hatColor?: InkRole;
  glasses?: boolean;
  goldTooth?: boolean;
  hairy?: boolean;
  top: 'shirt' | 'suit' | 'tank' | 'cardigan' | 'hoodie' | 'jacket' | 'vest';
  topColor: InkRole;
  pattern?: 'plaid' | 'stripes' | 'dots' | 'argyle';
  patternColor?: InkRole;
  pants: InkRole;
  ring?: boolean;
  chain?: boolean;
  woman?: boolean;
}

export const INK_CAST: Record<string, InkLook> = {
  bubba: { build: 'huge', head: 'jaw', nose: 'bulb', hair: 'horseshoe', hairColor: 'grey', beard: 'walrus', hairy: true, top: 'shirt', topColor: 'pale', pattern: 'plaid', patternColor: 'accent2', pants: 'brown' },
  vince: { build: 'thin', head: 'long', nose: 'long', hair: 'slick', hairColor: 'dark', beard: 'pencil', goldTooth: true, top: 'suit', topColor: 'blue', pants: 'blue', ring: true },
  dot: { build: 'short', head: 'round', nose: 'button', hair: 'bun', hairColor: 'accent2', glasses: true, top: 'cardigan', topColor: 'pale', pattern: 'dots', patternColor: 'blue', pants: 'dark', woman: true },
  rico: { build: 'big', head: 'jaw', nose: 'hook', hair: 'buzz', hairColor: 'dark', beard: 'stubble', hat: 'cap', hatColor: 'accent2', top: 'tank', topColor: 'white', pants: 'denim', chain: true, hairy: true },
  gramps: { build: 'short', head: 'egg', nose: 'bulb', hair: 'tufts', hairColor: 'white', top: 'vest', topColor: 'accent', pattern: 'argyle', patternColor: 'blue', pants: 'grey' },
  lulu: { build: 'thin', head: 'egg', nose: 'hook', hair: 'bob', hairColor: 'blue', top: 'jacket', topColor: 'accent2', pants: 'dark', woman: true, ring: true },
  tex: { build: 'big', head: 'long', nose: 'long', hair: 'mullet', hairColor: 'brown', beard: 'stubble', hat: 'cowboy', hatColor: 'brown', top: 'jacket', topColor: 'denim', pants: 'blue' },
  kev: { build: 'mid', head: 'round', nose: 'button', hair: 'bowl', hairColor: 'brown', glasses: true, top: 'hoodie', topColor: 'accent', pattern: 'stripes', patternColor: 'pale', pants: 'denim' },
};
export const INK_CAST_NAMES = Object.keys(INK_CAST);

/** The cast field ("bubba;vince") as names, unknown ones left out, at most three, at least one. */
export function inkCast(raw: string): string[] {
  const out = raw
    .split(/[;,]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => !!INK_CAST[x])
    .slice(0, 3);
  return out.length ? out : ['bubba'];
}

/** Each cast member's move in a beat ("talk/smug"); one move = the focus's, the others react quietly. */
export function inkMoves(acting: string, n: number, focus: number): InkMove[] {
  const parts = acting.split('/').map((x) => x.trim().toLowerCase());
  if (parts.length === 1) return Array.from({ length: n }, (_, k) => (k === focus ? (isInkMove(parts[0]) ? parts[0] : 'talk') : 'idle'));
  return Array.from({ length: n }, (_, k) => (isInkMove(parts[k] ?? '') ? (parts[k] as InkMove) : 'idle'));
}

/** The props column ("drive;B:cash") as kind + whose. */
export function inkProps(raw: string): Array<{ kind: InkProp; who: number }> {
  const out: Array<{ kind: InkProp; who: number }> = [];
  for (const part of raw.split(';')) {
    const m = /^\s*(?:([abc])\s*:\s*)?([a-z]+)\s*$/i.exec(part);
    if (m && (INK_PROPS as readonly string[]).includes(m[2].toLowerCase())) out.push({ kind: m[2].toLowerCase() as InkProp, who: m[1] ? 'abc'.indexOf(m[1].toLowerCase()) : 0 });
  }
  return out;
}

/** The latest key=value flag up to this beat (set=), '' when none. */
export function inkLast(tagsSoFar: string[][], key: string): string {
  let v = '';
  for (const tags of tagsSoFar) for (const t of tags) if (t.startsWith(key + '=')) v = t.slice(key.length + 1);
  return v;
}

/** Flags only this style reads. */
export const INK_FLAG = new RegExp(`^(?:who=[abc]|shot=(?:${INK_SHOTS.join('|')})|set=(?:${INK_SETS.join('|')})|${INK_TIMES.join('|')}|push|whip|solo)$`);

export const INK_HELP =
  'One line per row: seconds | narration | acting | top label | props | say | flags. narration = what the narrator says (the captions and the voice). ' +
  `acting = what the cast does on this line: ${INK_MOVES.join(', ')}; one move is for whoever the line is about (who=), or one per cast member, "talk/smug" (A talks, B is smug). Every line is acted out: change the move every line. ` +
  'top label = a small label over the shot ("2013", "3 YEARS LATER"), empty = none. ' +
  `props (; between them, B: / C: = that person's): ${INK_PROPS.join(', ')}. Every thing the line names gets drawn: give it a prop. ` +
  `Flags: who=a|b|c (who the line is about, default a), shot=${INK_SHOTS.join('|')} (wide = the whole set, two = everyone waist up, mid = the focus waist up, close = their face with the set blurred, react = the other one's face, insert = the first prop big; empty = the next shot in a natural cycle), set=${INK_SETS.join('|')} (a whip-pan to that place; stays until the next set=), ${INK_TIMES.join('|')} (the light from this line on), push (a slow move in), whip (a whip-pan even in the same place), solo (only whoever the line is about is in the picture), pause=0.6, speed=0.95, and the effects. `;
