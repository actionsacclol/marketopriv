// The UI motion preset: one rounded shape morphs from UI state to UI state (a button, a toggle, a loader, a
// notification, a player...) while a cursor clicks every change, cut to a beat (120 BPM by default). Drawing lives
// in src/render/presets/morph.ts.
//
// A row: seconds | label | state | a | b | say | flags

export const MORPH_STATES = [
  'button', 'pill', 'toggle', 'checkbox', 'slider', 'loader', 'progress', 'search', 'input', 'notify', 'panel',
  'player', 'graph', 'message', 'avatar', 'tabs', 'icon', 'window', 'logo', 'word',
] as const;
export type MorphState = (typeof MORPH_STATES)[number];
export const isMorphState = (v: string): v is MorphState => (MORPH_STATES as readonly string[]).includes(v);

/** Flags only the UI motion preset reads: the shape's fill for this state, and a change with no click. */
export const MORPH_FLAG = /^(?:fill=(?:accent|surface|ink|[0-9a-f]{6})|noclick)$/;

export const MORPH_HELP =
  'One UI state per row: seconds | label | state | a | b | say | flags. The one shape on screen becomes each state in turn, with a springy morph, and the cursor clicks it just before every change. ' +
  'seconds: keep to the beat. At 120 BPM a beat is 0.5 s, so 1 (two beats) for most states, 0.5 for a quick one, 1.5 or 2 to let one breathe; 8 to 12 states in all. label = a small line under the shape naming what it is ("Dark mode", "Upload"), empty = none (*word* = the accent colour). ' +
  'States and what a and b are: button (a = its text) · pill (a = a short tag, "New") · toggle (switches on) · checkbox (ticks) · slider (a = where it ends, 0-100) · loader (a spinner) · progress (a = where it fills to, 0-100) · search (a = what gets typed) · input (a = what gets typed, b = the field\'s name, "Email") · notify (a notification: a = title, b = the message) · panel (a card: a = title, b = the line under it) · player (a = the track, b = the artist) · graph (a = the values, "3,5,4,8,12", drawn as a line) · message (a chat bubble: a = the text) · avatar (a = initials) · tabs (a = "Home;Search;Profile", b = the tab it moves to, 1-3) · icon (an app icon: a = one letter or a short word) · window (the screen recording in the video field: a = its start second) · logo (the logo field\'s picture, or the brand\'s) · word (a = one big word). ' +
  'Flags: fill=accent / fill=surface / fill=ink / fill=<6 hex digits> (the shape\'s colour for this state; buttons, pills, icons and logos are accent by default, the rest the surface colour), noclick (changes without a click), and the effects. say = a voice line, only with voice-over on (it is off by default: these are music only). ';
