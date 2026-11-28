// The space preset ("what if" explainers): flat, bright, Kurzgesagt-style space scenes drawn in code (a turning
// Earth, the Sun, planets side by side, an orbit, an impact, a black hole) with a small astronaut mascot and
// narration timed to the word. Drawing lives in src/render/presets/space.ts.
//
// A row: seconds | line | scene | a | b | say | flags

export const SPACE_SCENES = ['title', 'earth', 'sun', 'moon', 'planet', 'orbit', 'impact', 'blackhole', 'compare', 'number', 'clock', 'surface', 'astronaut'] as const;
export type SpaceScene = (typeof SPACE_SCENES)[number];
export const isSpaceScene = (v: string): v is SpaceScene => (SPACE_SCENES as readonly string[]).includes(v);

export const SPACE_BODIES = ['mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'sun'] as const;
/** Radii in Earth radii, for compare scenes. */
export const BODY_RADIUS: Record<string, number> = { mercury: 0.38, venus: 0.95, earth: 1, moon: 0.27, mars: 0.53, jupiter: 11.2, saturn: 9.45, uranus: 4.0, neptune: 3.88, pluto: 0.19, sun: 109 };

/** Flags only the space preset reads: the camera (close, far, drift), and the mascot taking the stage. */
export const SPACE_FLAG = /^(?:cam=(?:close|far|drift)|astro)$/;

export const SPACE_HELP =
  'One scene per row: seconds | line | scene | a | b | say | flags. line = the caption and what the voice reads (*word* = highlight; say = something else to read, - = silent). A new scene every line or two, a cut on a new idea, 25-40 s in all. ' +
  'Scenes and what a and b are: title (a = the question, big, "What if the Sun *vanished*?"; b = a small line) · earth (a = normal, dark = no sunlight, only city lights, ice = frozen over, hot = scorched; b = a label) · sun (a = normal, gone = it blinks out during the line, giant = a red giant) · moon (b = a label) · planet (a = mercury, venus, mars, jupiter, saturn, uranus, neptune or pluto; b = a label) · orbit (Earth going round the Sun; a = gone = the Sun vanishes halfway and the Earth flies off in a straight line) · impact (an asteroid hits the Earth; a = a label for the rock, "10 km") · blackhole (a = a label) · compare (bodies side by side at their real sizes: a = "earth;jupiter" or "moon;earth;mars", up to 4; b = a caption under them) · number (a = a big number or amount, it counts up; b = what it is) · clock (a timer counting: a = from, b = to, "0:00" and "8:20") · surface (the astronaut standing on a planet: a = day, night, ice or mars) · astronaut (the mascot full size: a = wave, point, shock or float). ' +
  'Flags: cam=close (push in on the scene), cam=far (pull back), cam=drift (slide sideways), astro (the astronaut floats in front of this scene), pause=0.6, speed=0.95, and the effects. Every fact and number said is real and checked; the scenes are drawings, not to scale unless the scene is compare. ';
