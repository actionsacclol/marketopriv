// Retro TV: a story played on an old CRT set. Our own cast are glowing phosphor figures drawn in light on a dark
// screen, the places are glowing line art, and the picture is a real tube: scanlines, bloom, a rolling hum bar, a soft
// colour split, curved dark corners. Places change with a burst of static and a channel number, turns get an on-screen
// title, and the last line ends with the set switching off to a dot. Drawing lives in src/render/presets/tv.ts.
//
// A beat row: seconds | narration | move | top label | props | say | flags

export const TV_MOVES = ['idle', 'talk', 'walk', 'run', 'jump', 'shock', 'happy', 'sad', 'think', 'point', 'sit', 'type', 'phone', 'wave', 'shrug', 'fall', 'dance'] as const;
export type TvMove = (typeof TV_MOVES)[number];
export const isTvMove = (v: string): v is TvMove => (TV_MOVES as readonly string[]).includes(v);

export const TV_SETS = ['city', 'room', 'road', 'desert', 'space', 'office', 'ocean', 'mountains', 'studio'] as const;
export type TvSet = (typeof TV_SETS)[number];

export const TV_PROPS = ['coin', 'cash', 'phone', 'letter', 'laptop', 'chart', 'clock', 'key', 'bag', 'heart', 'star', 'cup', 'card', 'lock', 'bulb'] as const;
export type TvProp = (typeof TV_PROPS)[number];

export const TV_PHOSPHORS = ['green', 'amber', 'cyan', 'color'] as const;
export type TvPhosphor = (typeof TV_PHOSPHORS)[number];

/** Our own glowing cast: one feature each, and their own colour on a colour set. */
export interface TvLook {
  mark: 'none' | 'cap' | 'ponytail' | 'glasses' | 'hat' | 'phones' | 'bun';
  /** Their colour on a colour set. */
  hue: string;
  /** Height scale. */
  h: number;
}
export const TV_CAST: Record<string, TvLook> = {
  neo: { mark: 'cap', hue: '#4DF2FF', h: 1 },
  vee: { mark: 'ponytail', hue: '#FF5FD2', h: 0.94 },
  rex: { mark: 'glasses', hue: '#7CFF6B', h: 1.08 },
  ada: { mark: 'bun', hue: '#FFC24D', h: 0.92 },
  max: { mark: 'hat', hue: '#FF7A4D', h: 1.04 },
  kai: { mark: 'phones', hue: '#B48CFF', h: 1 },
};
export const TV_CAST_NAMES = Object.keys(TV_CAST);

export function tvCast(raw: string): string[] {
  const out = raw
    .split(/[;,]/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => !!TV_CAST[x])
    .slice(0, 3);
  return out.length ? out : ['neo'];
}

export function tvMoves(acting: string, n: number, focus: number): TvMove[] {
  const parts = acting.split('/').map((x) => x.trim().toLowerCase());
  if (parts.length === 1) return Array.from({ length: n }, (_, k) => (k === focus ? (isTvMove(parts[0]) ? parts[0] : 'talk') : 'idle'));
  return Array.from({ length: n }, (_, k) => (isTvMove(parts[k] ?? '') ? (parts[k] as TvMove) : 'idle'));
}

export function tvProps(raw: string): Array<{ kind: TvProp; who: number; down: boolean }> {
  const out: Array<{ kind: TvProp; who: number; down: boolean }> = [];
  for (const part of raw.split(';')) {
    const m = /^\s*(?:([abc])\s*:\s*)?([a-z]+)(-)?\s*$/i.exec(part);
    if (m && (TV_PROPS as readonly string[]).includes(m[2].toLowerCase())) out.push({ kind: m[2].toLowerCase() as TvProp, who: m[1] ? 'abc'.indexOf(m[1].toLowerCase()) : 0, down: !!m[3] });
  }
  return out;
}

export const TV_FLAG = new RegExp(`^(?:who=[abc]|shot=(?:wide|close)|set=(?:${TV_SETS.join('|')})|title|end|static|rain|shake|solo|ch=\\d{1,2})$`);

export const TV_HELP =
  'One line per row: seconds | narration | move | top label | props | say | flags. narration = what is said (the glowing captions, and the voice when there is one). ' +
  `move = what the cast does: ${TV_MOVES.join(', ')}; one move for whoever the line is about (who=), or one each, "talk/shock". A new move every line. ` +
  'top label = the on-screen label in the corner ("2013", "LIVE", "DAY 3"), empty = none. ' +
  `props (; between them, B: / C: = theirs): ${TV_PROPS.join(', ')}; chart- = a chart going down. ` +
  `Flags: who=a|b|c, shot=wide|close (empty = the hub picks), set=${TV_SETS.join('|')} (static and a new channel number; ch=7 picks the number), title (the narration as a big on-screen title: "PART 2", "SIGNAL LOST"), static (a burst of static on a line), rain, shake, solo (only whoever the line is about), end (the last line, then the set switches off), pause=0.6, speed=0.95, and the effects. `;
