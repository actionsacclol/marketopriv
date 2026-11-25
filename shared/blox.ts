// The blox preset ("blocky avatars"): one or two blocky game-style avatars in a small 3D world, acting a story, a
// rant or a skit out with stiff, snappy moves. The rows read like the stickman's, so the AI learns one grammar:
//   seconds | caption | move | word | props | say | flags
// Drawing lives in src/render/blox3d.ts (the world and the avatars) and src/render/presets/blox.ts (the frame).

export const BLOX_MOVES = [
  'idle', 'talk', 'point', 'present', 'shrug', 'shock', 'cheer', 'think', 'wave', 'facepalm', 'sad', 'laugh',
  'thumbsup', 'angry', 'walk', 'run', 'jump', 'dance', 'groove', 'spin', 'sit', 'type', 'phone', 'sleep', 'fall',
] as const;
export type BloxMove = (typeof BLOX_MOVES)[number];
export const isBloxMove = (v: string): v is BloxMove => (BLOX_MOVES as readonly string[]).includes(v);

/** Moves that carry the avatar along: the world slides past while they play (units a second). */
export const BLOX_SPEED: Partial<Record<BloxMove, number>> = { walk: 1.7, run: 3.9 };

export const BLOX_PROPS = ['sign', 'bubble', 'think', 'question', 'exclaim', 'screen', 'coin', 'robot', 'crate', 'trophy', 'zzz'] as const;
export type BloxPropKind = (typeof BLOX_PROPS)[number];

export interface BloxProp {
  kind: BloxPropKind;
  /** 0 = avatar A, 1 = avatar B. */
  who: 0 | 1;
  value: string;
}

/** A beat's props column ("sign=FREE;B:bubble=no way;screen=12.5"). Unknown names are dropped. */
export function bloxProps(raw: string): BloxProp[] {
  const out: BloxProp[] = [];
  for (const part of raw.split(';')) {
    let s = part.trim();
    if (!s) continue;
    let who: 0 | 1 = 0;
    const own = /^([ab])\s*:\s*/i.exec(s);
    if (own) {
      who = own[1].toLowerCase() === 'b' ? 1 : 0;
      s = s.slice(own[0].length);
    }
    const eq = s.indexOf('=');
    const kind = (eq < 0 ? s : s.slice(0, eq)).trim().toLowerCase();
    if (!(BLOX_PROPS as readonly string[]).includes(kind)) continue;
    out.push({ kind: kind as BloxPropKind, who, value: eq < 0 ? '' : s.slice(eq + 1).trim() });
  }
  return out;
}

/** The two moves of a beat ("sad/dance" = A is sad, B dances; one move = both). Unknown = idle. */
export function bloxMoves(visual: string): [BloxMove, BloxMove] {
  const [a, b] = visual.split('/').map((x) => x.trim().toLowerCase());
  const ma = isBloxMove(a) ? a : 'idle';
  const mb = b === undefined ? ma : isBloxMove(b) ? b : 'idle';
  return [ma, mb];
}

export const BLOX_SETS = ['baseplate', 'park', 'obby', 'city'] as const;
export type BloxSet = (typeof BLOX_SETS)[number];
export const BLOX_TIMES = ['day', 'sunset', 'night'] as const;
export type BloxTime = (typeof BLOX_TIMES)[number];

// ── What an avatar looks like ──────────────────────────────────────────────
export const BLOX_SKINS: Record<string, string> = { light: '#F2CDA8', tan: '#DDA872', brown: '#9A6240', dark: '#5E3A24' };
export const BLOX_HAIR = ['none', 'short', 'swoop', 'long', 'spiky'] as const;
export const BLOX_HATS = ['none', 'cap', 'beanie', 'crown', 'tophat', 'headphones'] as const;
export const BLOX_WEAR = ['shades', 'backpack', 'cape'] as const;
export const BLOX_PRINTS = ['none', 'stripe', 'star', 'bolt'] as const;

export interface BloxLook {
  skin: string;
  shirt: string;
  pants: string;
  hair: (typeof BLOX_HAIR)[number];
  hairColor: string;
  hat: (typeof BLOX_HATS)[number];
  hatColor: string;
  print: (typeof BLOX_PRINTS)[number];
  wear: string[];
}

export const BLOX_LOOK_A = 'skin=tan;shirt=#F97316;pants=#1F2937;hair=swoop:#2B1B10;print=bolt';
export const BLOX_LOOK_B = 'skin=brown;shirt=#22B8A6;pants=#111827;hair=short:#15121C;hat=headphones:#EDEDF2';

const HEX = /^#[0-9a-f]{6}$/i;
const hex = (v: string, d: string): string => (HEX.test(v.trim()) ? v.trim() : d);
const pick = <T extends string>(v: string, list: readonly T[], d: T): T => ((list as readonly string[]).includes(v) ? (v as T) : d);

/** "skin=tan;shirt=#F97316;pants=#1F2937;hair=swoop:#2B1B10;hat=cap:#F97316;print=bolt;wear=shades+backpack" as a look. */
export function bloxLook(raw: string, fallback: string): BloxLook {
  const read = (s: string): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const part of s.split(/[;\n]+/)) {
      const eq = part.indexOf('=');
      if (eq > 0) o[part.slice(0, eq).trim().toLowerCase()] = part.slice(eq + 1).trim();
    }
    return o;
  };
  const o = { ...read(fallback), ...read(raw) };
  const [hair, hairColor = ''] = (o.hair ?? '').toLowerCase().split(':');
  const [hat, hatColor = ''] = (o.hat ?? '').toLowerCase().split(':');
  const skin = (o.skin ?? '').toLowerCase();
  const shirt = hex(o.shirt ?? '', '#F97316');
  return {
    skin: BLOX_SKINS[skin] ?? hex(skin, BLOX_SKINS.tan),
    shirt,
    pants: hex(o.pants ?? '', '#1F2937'),
    hair: pick(hair.trim(), BLOX_HAIR, 'none'),
    hairColor: hex(hairColor, '#2B1B10'),
    hat: pick(hat.trim(), BLOX_HATS, 'none'),
    hatColor: hex(hatColor, shirt),
    print: pick((o.print ?? '').toLowerCase(), BLOX_PRINTS, 'none'),
    wear: (o.wear ?? '')
      .toLowerCase()
      .split(/[+,\s]+/)
      .filter((w) => (BLOX_WEAR as readonly string[]).includes(w)),
  };
}

/** Flags only the blox preset reads (cam=close|wide|a|b, push, win and who=b are shared with the stickman). */
export const BLOX_FLAG = /^(?:cam=(?:low|far)|orbit)$/;

export const BLOX_LOOK_HELP =
  `; between the parts: skin=${Object.keys(BLOX_SKINS).join('|')} (or #RRGGBB), shirt=#RRGGBB, pants=#RRGGBB, hair=${BLOX_HAIR.join('|')} with its colour after a colon (hair=swoop:#2B1B10), ` +
  `hat=${BLOX_HATS.join('|')} (hat=cap:#F97316), print=${BLOX_PRINTS.join('|')} (on the shirt), wear=${BLOX_WEAR.join('+')} (any of them, + between). Keep one look per series so the account is recognisable.`;

export const BLOX_HELP =
  'One beat per line: seconds | caption | move | word | props | say | flags. caption = the on-screen text (captions setting) and, by default, what the voice reads (say = something else to read, - = silent). ' +
  `move = what the avatar does: ${BLOX_MOVES.join(', ')}. The moves are stiff and snappy on purpose (straight arms and legs, a quick snap into each one); the face changes with the move and the mouth moves while the line is read. walk and run turn the avatar sideways and slide the world past; sit brings a block to sit on, type a desk and a laptop, phone a phone, sleep lies down. Two avatars: "moveA/moveB", e.g. "sad/dance"; the names field puts a name tag over each head; one move = both do it. ` +
  'word = a big word that pops in over the scene ("FREE", "BRO?", "3 AM"), empty = none. ' +
  `props (; between them, B: = avatar B's): ${BLOX_PROPS.join(', ')}. sign=TEXT (a sign held over the head), bubble=text (a chat bubble over the head: what that avatar says, never read out), think=text (a thought bubble), question / exclaim (a big ? or ! over the head), coin (a spinning coin beside the avatar), robot (a little helper robot hovering beside it, for "the AI does it"), crate, trophy (on the ground next to the avatar, or between the two), zzz. screen=second shows the screen recording (video field) on a big panel over the scene from that second, "screen=12.5 @0.7,0.3 x2" zoomed on a point: use it for real app footage people must read (point + screen = the avatar points up at it). ` +
  'Flags: cam=close (on the one talking) / cam=a / cam=b / cam=wide / cam=low (from below, looking up: the big moment) / cam=far (small avatar, big world: openers and walking), orbit (the camera circles slowly), push (slow push-in), win or win=a / win=b (that avatar wins: a burst behind it and its name lights up), who=b (avatar B speaks), pause=0.6, speed=0.95, and the effects. ';
