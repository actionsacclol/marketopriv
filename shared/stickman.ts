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
  'sweat', 'robot', 'coffee', 'clock', 'zzz', 'fire', 'arrow',
] as const;
export type StickPropKind = (typeof STICK_PROPS)[number];
/** Props that can show the screen recording (value = the second to start at). */
export const SCREEN_PROPS: StickPropKind[] = ['laptop', 'monitor', 'screen', 'phone'];

export const STICK_GEAR = ['cap', 'headphones', 'glasses', 'tie', 'hair'] as const;

export interface StickProp {
  kind: StickPropKind;
  /** 0 = figure A, 1 = figure B. */
  who: 0 | 1;
  value: string;
}

/** A beat's props column. Unknown names are dropped. */
export function stickProps(raw: string): StickProp[] {
  const out: StickProp[] = [];
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

/** The two poses of a beat ("think/type" = A thinks, B types; one pose = both). Unknown = idle. */
export function stickPoses(visual: string): [StickPose, StickPose] {
  const [a, b] = visual.split('/').map((x) => x.trim().toLowerCase());
  const pa = isStickPose(a) ? a : 'idle';
  const pb = b === undefined ? pa : isStickPose(b) ? b : 'idle';
  return [pa, pb];
}

/** Flags only the stickman reads: cam=close|wide|a|b, push, win / win=a|b, who=a|b. */
export const STICK_FLAG = /^(?:cam=(?:close|wide|a|b)|push|win(?:=[ab])?|who=[ab])$/;

export const STICK_HELP =
  'One beat per line: seconds | caption | pose | word | props | say | flags. caption = the on-screen text (captions setting) and, by default, what the voice reads (say = something else to read, - = silent). ' +
  `pose = what the figure does: ${STICK_POSES.join(', ')} (sit, type, sleep and phone bring their chair, desk, laptop or phone; type with a desk and laptop). Two figures (versus): "poseA/poseB", e.g. "think/type"; the labels field names them; one pose = both do it. The pose changes with a quick anticipation and overshoot, the mouth moves while the line is read. ` +
  'word = a big word that pops in above the figure ("FREE", "WHY?", "3 AM"), empty = none. ' +
  `props (; between them, B: = figure B's): ${STICK_PROPS.join(', ')}. =value sets its text: sign=FREE (a sign the figure holds), bubble=text (speech bubble), think=text (thought bubble), arrow=text (an arrow at the figure with a label), chart=up|down|flat (a line chart that draws itself, no numbers). laptop, monitor, phone and screen show the screen recording (video field) from a second: laptop=12.5, screen=4 (screen = a big wall screen the figure points at: use it for real app footage people must read). robot = a little helper robot (for "the AI does it"). ` +
  'Flags: cam=close (zoom on the speaker) / cam=a / cam=b (zoom on one figure) / cam=wide, push (slow push-in), win or win=a / win=b (that figure lights up in the highlight colour: the payoff), who=b (figure B speaks), pause=0.6, speed=0.95, and the effects. ';
