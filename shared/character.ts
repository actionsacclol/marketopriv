// The story mascot: art styles and the actions a beat can give it.

export const ARTS = ['flat', 'cartoon', 'ps2', '3d'] as const;
export type Art = Exclude<(typeof ARTS)[number], 'flat'>;

export const ACTIONS = ['talk', 'point', 'present', 'shrug', 'shock', 'cheer', 'think', 'wave', 'facepalm', 'sad', 'laugh'] as const;
export type Action = (typeof ACTIONS)[number];

export const isAction = (v: string): v is Action => (ACTIONS as readonly string[]).includes(v);

export const ACTION_HELP =
  'Character beats (any art style; the mascot acts the line out, its mouth moves with the voice): talk · point (at the headline) · present · shrug · shock · cheer · think · wave · facepalm · sad · laugh. a = an optional big word or number that pops in above it ("−90%", "RUGGED"), b = a small line under that.';
