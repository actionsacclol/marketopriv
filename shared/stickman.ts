// The stickman style: pose and prop names, how a beat's columns are read, and the
// help text the AI gets. Drawing lives in src/render/presets/stickman.ts.
//
// A stickman beat row: seconds | caption | pose | word | props | say | flags
//   pose  = one pose, or "poseA/poseB" when two figures are on stage (versus)
//   word  = a big word that pops in above the figure ("FREE", "?!")
//   props = "desk;laptop=12.5;B:phone;sign=FREE": ; between props, B: = figure B's,
//           =value is the prop's text, or the second of the screen recording it shows

export const STICK_POSES = [
  'idle', 'talk', 'point', 'present', 'shrug', 'shock', 'cheer', 'think', 'wave', 'facepalm', 'sad', 'laugh',
  'thumbsup', 'angry', 'walk', 'run', 'sit', 'type', 'phone', 'sleep', 'fall',
] as const;
export type StickPose = (typeof STICK_POSES)[number];
export const isStickPose = (v: string): v is StickPose => (STICK_POSES as readonly string[]).includes(v);

export const STICK_PROPS = [
  'desk', 'laptop', 'monitor', 'screen', 'phone', 'chart', 'sign', 'bubble', 'think', 'bulb', 'question', 'exclaim',
  'sweat', 'robot', 'coffee', 'clock', 'zzz', 'fire', 'arrow', 'rule', 'fact', 'vote',
  'torch', 'bottle', 'bag', 'key', 'food', 'money', 'tear',
] as const;
export type StickPropKind = (typeof STICK_PROPS)[number];
/** Props that can show the screen recording (value = the second to start at). */
export const SCREEN_PROPS: StickPropKind[] = ['laptop', 'monitor', 'screen', 'phone'];

export const STICK_GEAR = ['cap', 'headphones', 'glasses', 'tie', 'hair', 'bun'] as const;

/** Places a story happens in (the set= flag; it stays until another set= or set=none). */
export const STICK_SETS = ['bedroom', 'kitchen', 'office', 'classroom', 'hospital', 'store', 'street', 'city', 'door', 'forest', 'park', 'camp'] as const;
/** Weather and time (weather=; stays until weather=clear). */
export const STICK_WEATHER = ['rain', 'snow', 'storm', 'wind', 'fog', 'night'] as const;

/** The latest value of a key=value flag up to this beat (set=, weather=), '' when none or cleared. */
export function stickLast(tagsSoFar: string[][], key: string): string {
  let v = '';
  for (const tags of tagsSoFar)
    for (const t of tags) {
      if (!t.startsWith(key + '=')) continue;
      const x = t.slice(key.length + 1);
      // set= names from other styles (house, room, bank...) are tags for every preset; stickman keeps its own.
      if (key === 'set' && x !== 'none' && !(STICK_SETS as readonly string[]).includes(x)) continue;
      v = x;
    }
  return v === 'none' || v === 'clear' ? '' : v;
}

/** When a storm's lightning flashes in its beat, and when the knocks land (s, from the beat's start): the picture and the sounds share these. */
export const STICK_LIGHTNING_AT = 0.35;
export const STICK_KNOCKS = [0.25, 0.5, 0.75];

/** Shirt colours for the cartoon figure (the shirts field: "blue;orange"). */
export const STICK_SHIRTS: Record<string, string> = { blue: '#2F6FD6', orange: '#F28C28', red: '#D94A3A', green: '#3F9B5A', yellow: '#F2C230', purple: '#7B5AC9', black: '#2A2A30', white: '#F4F4F2', grey: '#8A8F98', pink: '#E77FA8' };

export interface StickProp {
  kind: StickPropKind;
  /** 0 = figure A, 1 = figure B, 2 = figure C. */
  who: 0 | 1 | 2;
  value: string;
}

/** A beat's props column. Unknown names are dropped. */
export function stickProps(raw: string): StickProp[] {
  const out: StickProp[] = [];
  for (const part of raw.split(';')) {
    let s = part.trim();
    if (!s) continue;
    let who: 0 | 1 | 2 = 0;
    const own = /^([abc])\s*:\s*/i.exec(s);
    if (own) {
      who = 'abc'.indexOf(own[1].toLowerCase()) as 0 | 1 | 2;
      s = s.slice(own[0].length);
    }
    const eq = s.indexOf('=');
    const kind = (eq < 0 ? s : s.slice(0, eq)).trim().toLowerCase();
    if (!(STICK_PROPS as readonly string[]).includes(kind)) continue;
    out.push({ kind: kind as StickPropKind, who, value: eq < 0 ? '' : s.slice(eq + 1).trim() });
  }
  return out;
}

/** The second of the screen recording a beat's screen prop starts at, or null when no prop shows it. */
export function stickScreenStart(raw: string): number | null {
  for (const p of stickProps(raw)) {
    if (!SCREEN_PROPS.includes(p.kind)) continue;
    const m = /^(\d+(?:\.\d+)?)/.exec(p.value);
    if (m) return Number(m[1]);
  }
  return null;
}

/** The poses of a beat ("think/type" = A thinks, B types; "talk/laugh/shock" for three; one pose = all of them). Unknown = idle. */
export function stickPoses(visual: string): [StickPose, StickPose, StickPose] {
  const [a, b, c] = visual.split('/').map((x) => x.trim().toLowerCase());
  const pa = isStickPose(a) ? a : 'idle';
  const pb = b === undefined ? pa : isStickPose(b) ? b : 'idle';
  const pc = c === undefined ? (b === undefined ? pa : 'idle') : isStickPose(c) ? c : 'idle';
  return [pa, pb, pc];
}

/** Flags only the stickman reads: cam=close|wide|a|b|c, push, win / win=a|b|c, who=a|b|c, and the survival HUD's day=, clock=, battery=. */
export const STICK_FLAG = new RegExp(
  `^(?:cam=(?:close|wide|a|b|c)|push|win(?:=[abc])?|who=[abc]|day=\\d{1,3}|clock=\\d{1,2}:\\d{2}|battery=\\d{1,3}|set=(?:none|${STICK_SETS.join('|')})|weather=(?:clear|${STICK_WEATHER.join('|')})|enter=(?:left|right)|exit=(?:left|right)|knock|crowd)$`,
);

/** The survival HUD at a beat: the hud field's starting values, changed by every day= / clock= / battery= flag so far. */
export function hudAt(start: string, tagsSoFar: string[][]): { day: string; clock: string; battery: number } | null {
  if (!start.trim()) return null;
  const [d, c, b] = start.split(';').map((x) => x.trim());
  const out = { day: (d || '1').replace(/^day\s*/i, ''), clock: c || '', battery: Math.min(100, Math.max(0, Number((b || '').replace(/[^\d]/g, '')) || 0)) };
  const hasBattery = !!b;
  for (const tags of tagsSoFar)
    for (const t of tags) {
      if (t.startsWith('day=')) out.day = t.slice(4);
      else if (t.startsWith('clock=')) out.clock = t.slice(6);
      else if (t.startsWith('battery=')) out.battery = Math.min(100, Number(t.slice(8)) || 0);
    }
  return hasBattery || tagsSoFar.some((x) => x.some((t) => t.startsWith('battery='))) ? out : { ...out, battery: -1 };
}

export const STICK_HELP =
  'One beat per line: seconds | caption | pose | word | props | say | flags. caption = the on-screen text (captions setting) and, by default, what the voice reads (say = something else to read, - = silent). ' +
  `pose = what the figure does: ${STICK_POSES.join(', ')} (sit, type, sleep and phone bring their chair, desk, laptop or phone; type with a desk and laptop). Two figures (versus): "poseA/poseB", e.g. "think/type"; three: "talk/laugh/shock" (C: props, who=c, cam=c); the labels field names them; one pose = all do it. A third figure reacting in some scenes keeps the frame alive. The pose changes with a quick anticipation and overshoot, the mouth moves while the line is read. ` +
  'word = a big word that pops in above the figure ("FREE", "WHY?", "3 AM"), empty = none. ' +
  `props (; between them, B: = figure B's): ${STICK_PROPS.join(', ')}. =value sets its text: sign=FREE (a sign the figure holds), bubble=text (speech bubble), think=text (thought bubble), arrow=text (an arrow at the figure with a label), chart=up|down|flat (a line chart that draws itself, no numbers). laptop, monitor, phone and screen show the screen recording (video field) from a second: laptop=12.5, screen=4 (screen = a big wall screen the figure points at: use it for real app footage people must read). robot = a little helper robot (for "the AI does it"). rule=text and fact=text = a card at the top instead of the captions ("rule=Never answer the door after dark", "fact=A person can last about 3 days without water"): the survival series' rule card and fact card. vote=option A/option B = the part's last beat, two choices at the top and "Comment A or B" ("vote=Break the door/Wait for help"). ` +
  `set=<place> puts the scene in a place: a real 3D set the flat figures stand in, with ink outlines and small things moving (world field: 3d, or flat for 2D ink lines) (it stays until the next set=; set=none clears it): ${STICK_SETS.join(', ')} (door = the front of a house, camp = a tent and a campfire). Give every reel places: a new place every few lines keeps it moving, and changing place whips the camera across. weather=<kind> (stays until weather=clear): ${STICK_WEATHER.join(', ')} (storm flashes lightning on the beat that sets it). enter=left|right = the figure walks in from that side; exit=left|right = it walks out at the end of the line. knock = the door (set=door) shakes three times. crowd = people walk by in the back (street, city, park; leave it off for an empty street). More props: torch (a flashlight with a beam), bottle (water), bag (a backpack), key, food, money, tear (crying). ` +
  'Flags: cam=close (zoom on the speaker) / cam=a / cam=b (zoom on one figure) / cam=wide, push (slow push-in), win or win=a / win=b (that figure lights up in the highlight colour: the payoff), who=b (figure B speaks), day=3 / clock=06:40 / battery=40 (change the survival HUD from this beat on; the hud field turns it on), pause=0.6, speed=0.95, and the effects. ';
