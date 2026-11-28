// The PS2 cutscene style: our own low-poly 3D characters acting a short skit in a
// small set, framed like an old console cutscene (hard cuts between shots, a soft
// low-resolution picture, blocky subtitles). Drawing lives in src/render/ps23d.ts
// and src/render/presets/ps2.ts.
//
// A beat row: seconds | subtitle | move | top label | props | say | flags
//   move  = what the speaker does; "talk/cross" = A talks while B crosses their arms (up to three: a/b/c)
//   top   = a small label over the shot ("2:14 AM", "RAN INTO MY EX"), empty = none
//   props = "cup;B:phone": a cup, a phone or a glass in a character's hand (B: / C: = theirs)

export const PS2_MOVES = ['idle', 'talk', 'laugh', 'shock', 'shrug', 'point', 'facepalm', 'cross', 'drink', 'nod', 'angry', 'sad', 'smirk', 'wave', 'think', 'phone'] as const;
export type Ps2Move = (typeof PS2_MOVES)[number];
export const isPs2Move = (v: string): v is Ps2Move => (PS2_MOVES as readonly string[]).includes(v);

export const PS2_SETS = ['cafe', 'office', 'street', 'living', 'party', 'bar', 'garage'] as const;
export type Ps2Set = (typeof PS2_SETS)[number];

export const PS2_SHOTS = ['two', 'close', 'ots', 'wide', 'low', 'group'] as const;
export type Ps2Shot = (typeof PS2_SHOTS)[number];

export const PS2_PROPS = ['cup', 'phone', 'glass'] as const;

/** Our own cast (no real people): pick them by name in the cast field. */
export interface Ps2Look {
  skin: string;
  hair: 'curly' | 'slick' | 'long' | 'short' | 'bun' | 'bald';
  hairColor: string;
  beard?: boolean;
  glasses?: boolean;
  cap?: string;
  top: 'tee' | 'shirt' | 'hoodie' | 'coat' | 'vest';
  topColor: string;
  /** The shirt under a vest or a coat. */
  under?: string;
  pants: string;
  shoes: string;
}

export const PS2_CAST: Record<string, Ps2Look> = {
  jay: { skin: '#C99A78', hair: 'curly', hairColor: '#2A1C14', top: 'tee', topColor: '#9A9893', pants: '#2C2F36', shoes: '#E8E4DA' },
  brad: { skin: '#E2B898', hair: 'slick', hairColor: '#C9A86A', top: 'vest', topColor: '#1F2A44', under: '#A9C4E2', pants: '#B8A888', shoes: '#4A3424' },
  mia: { skin: '#EAC3A6', hair: 'long', hairColor: '#D9B77A', top: 'shirt', topColor: '#EFE7D8', pants: '#E6DDCC', shoes: '#D8CFC0' },
  gus: { skin: '#B98A68', hair: 'bald', hairColor: '#8A8378', beard: true, top: 'shirt', topColor: '#3D5A80', pants: '#5A4630', shoes: '#2A2018' },
  kai: { skin: '#7A5038', hair: 'short', hairColor: '#141010', cap: '#C0392B', top: 'hoodie', topColor: '#56603C', pants: '#2A2C30', shoes: '#F2F2F2' },
  zoe: { skin: '#B98868', hair: 'bun', hairColor: '#3A2418', glasses: true, top: 'coat', topColor: '#8A6440', under: '#E8E0D0', pants: '#2C2A2A', shoes: '#3A2A20' },
  max: { skin: '#E0B494', hair: 'short', hairColor: '#5A3A22', glasses: true, top: 'hoodie', topColor: '#26272C', pants: '#3A4658', shoes: '#DADADA' },
  ava: { skin: '#F0CDB2', hair: 'long', hairColor: '#17120F', top: 'tee', topColor: '#4E7A5A', pants: '#2E3442', shoes: '#F0F0F0' },
};
export const PS2_CAST_NAMES = Object.keys(PS2_CAST);

/** The cast field ("jay;brad;mia") as looks, unknown names left out, at least one. */
export function ps2Cast(raw: string): Ps2Look[] {
  const out = raw
    .split(/[;,]/)
    .map((x) => PS2_CAST[x.trim().toLowerCase()])
    .filter((x): x is Ps2Look => !!x)
    .slice(0, 3);
  return out.length ? out : [PS2_CAST.jay, PS2_CAST.brad];
}

/** Each cast member's move in a beat ("talk/cross/idle"); one move = the speaker's, the others idle. */
export function ps2Moves(visual: string, n: number, who: number): Ps2Move[] {
  const parts = visual.split('/').map((x) => x.trim().toLowerCase());
  if (parts.length === 1) return Array.from({ length: n }, (_, k) => (k === who ? (isPs2Move(parts[0]) ? parts[0] : 'talk') : 'idle'));
  return Array.from({ length: n }, (_, k) => (isPs2Move(parts[k] ?? '') ? (parts[k] as Ps2Move) : 'idle'));
}

/** The latest value of a key=value flag up to this beat (set=), '' when none. */
export function ps2Last(tagsSoFar: string[][], key: string): string {
  let v = '';
  for (const tags of tagsSoFar) for (const t of tags) if (t.startsWith(key + '=')) v = t.slice(key.length + 1);
  return v;
}

/** Flags only this style reads: who=a|b|c, shot=..., set=..., push, night. */
export const PS2_FLAG = new RegExp(`^(?:who=[abc]|shot=(?:${PS2_SHOTS.join('|')})|set=(?:${PS2_SETS.join('|')})|push|night)$`);

export const PS2_HELP =
  'One line per row: seconds | subtitle | move | top label | props | say | flags. subtitle = what the speaker says, shown as a console-style subtitle (and read by the voice when there is one). ' +
  `move = what the speaker does: ${PS2_MOVES.join(', ')}; or one move per cast member, "talk/cross" (A talks, B crosses arms), "laugh/facepalm/idle" for three. ` +
  'top label = a small black label over the shot ("2:14 AM", "RAN INTO MY EX", "1 YEAR LATER"), empty = none. ' +
  `props (; between them, B: / C: = that person's): ${PS2_PROPS.join(', ')} (in the hand). ` +
  `Flags: who=a|b|c (who speaks, default a), shot=${PS2_SHOTS.join('|')} (two = both in frame, close = the speaker's face, ots = over the listener's shoulder, wide = the whole set, low = looking up at the speaker, group = all three; empty = the next shot in a natural order, a hard cut every line), set=${PS2_SETS.join('|')} (stays until the next set=), push (slow move in), night (from this line on), pause=0.6, speed=0.95, and the effects. `;
