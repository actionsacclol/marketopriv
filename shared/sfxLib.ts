// Recorded sound effects shipped in resources/sfx (all CC0, see resources/sfx/CREDITS.txt). Each kind is a folder of
// variants <kind>/01.ogg ... (n of them); every one-shot is trimmed so its hit is at the very start, so a cue lands
// on its time. amb_* are seamless background loops for a place. Rebuilt with the scratch build script; when the
// folder changes, update the counts here (resources/sfx/index.json has them).

export const SAMPLE_COUNTS = {
  coin: 14,
  cash: 12,
  paper: 37,
  book: 5,
  door: 11,
  creak: 3,
  keys: 18,
  knock: 13,
  step: 17,
  stepgrass: 10,
  punch: 10,
  thud: 20,
  clang: 23,
  bell: 5,
  glass: 16,
  drink: 6,
  cloth: 13,
  splash: 15,
  bubble: 3,
  squish: 16,
  phone: 2,
  ring: 1,
  camera: 3,
  chop: 6,
  swish: 13,
  stone: 3,
  engine: 2,
  cardoor: 2,
  dog: 9,
  cat: 4,
  squeak: 4,
  thunder: 1,
  applause: 1,
  fire: 1,
  uiclick: 15,
  uiok: 4,
  uierror: 8,
  uiopen: 13,
  uiclose: 13,
  laser: 9,
  zap: 6,
  powerup: 12,
  jump: 5,
  blip: 10,
  nes: 17,
  pizzi: 17,
  sax: 17,
  stinger: 17,
  steel: 17,
  amb_outdoor: 1,
  amb_birds: 1,
  amb_rain: 2,
  amb_traffic: 1,
  amb_construction: 1,
  amb_machine: 1,
  amb_water: 2,
} as const;
export type SampleKind = keyof typeof SAMPLE_COUNTS;
export const isSampleKind = (k: string): k is SampleKind => Object.prototype.hasOwnProperty.call(SAMPLE_COUNTS, k);

/** The one-shots a line can ask for by name (flags), with what each is. */
export const SAMPLE_FLAGS = {
  coin: 'coins',
  cash: 'banknotes',
  paper: 'paper / a page',
  book: 'a book',
  door: 'a door',
  creak: 'a creak',
  keys: 'keys / a lock',
  step: 'footsteps',
  punch: 'a punch',
  thud: 'a body or bag hitting the floor',
  clang: 'metal',
  bell: 'a bell',
  glass: 'glass',
  drink: 'a sip',
  cloth: 'clothes moving',
  splash: 'a splash',
  squish: 'a squish',
  phone: 'a phone buzz',
  ring: 'a phone ringing',
  camera: 'a camera shutter',
  chop: 'a knife / a chop',
  swish: 'a fast swish',
  engine: 'a car starting',
  cardoor: 'a car door',
  dog: 'a dog',
  cat: 'a cat',
  squeak: 'a squeaky toy',
  thunder: 'thunder',
  applause: 'applause',
  uiclick: 'an app click',
  uiok: 'an app confirm chime',
  uierror: 'an app error',
  laser: 'an 8-bit laser',
  zap: 'an 8-bit zap',
  powerup: 'an 8-bit power-up',
  jump: 'an 8-bit jump',
  blip: 'an 8-bit blip',
  nes: 'an 8-bit jingle',
  pizzi: 'a plucky comedy sting',
  sax: 'a sax sting',
  stinger: 'a short music hit',
} as const;
export type SampleFlag = keyof typeof SAMPLE_FLAGS;
export const isSampleFlag = (k: string): k is SampleFlag => Object.prototype.hasOwnProperty.call(SAMPLE_FLAGS, k);

/** Places as background sound (a seamless loop under the whole scene; room = a quiet made-up room tone). */
export const AMBIENCES = ['outdoor', 'birds', 'rain', 'traffic', 'construction', 'machine', 'water', 'room'] as const;
export type Ambience = (typeof AMBIENCES)[number];

/** The relative level each kind plays at (the files are all at the same peak). */
export const SAMPLE_GAIN: Partial<Record<SampleKind, number>> = {
  coin: 0.55,
  cash: 0.6,
  paper: 0.55,
  step: 0.4,
  stepgrass: 0.4,
  cloth: 0.4,
  swish: 0.45,
  punch: 0.75,
  thud: 0.75,
  clang: 0.6,
  glass: 0.6,
  applause: 0.55,
  thunder: 0.8,
  uiclick: 0.45,
  dog: 0.6,
  nes: 0.5,
  pizzi: 0.55,
  sax: 0.5,
  stinger: 0.55,
  steel: 0.5,
};

/** One place's background sound for a set / world name, '' for none. */
export function ambienceFor(set: string, time = ''): Ambience | '' {
  const s = set.toLowerCase();
  if (/rain|storm/.test(s)) return 'rain';
  if (/dump|landfill|site|build|mine/.test(s)) return 'construction';
  if (/street|city|road|highway|parking|town|downtown/.test(s)) return 'traffic';
  if (/farm|park|forest|garden|yard|field|camp|beach|village/.test(s)) return time === 'night' ? 'outdoor' : 'birds';
  if (/lake|river|sea|ocean|pool|dock|harbor|pier/.test(s)) return 'water';
  if (/factory|server|lab|engine|ship|train/.test(s)) return 'machine';
  if (/desert|snow|dune|tundra|mountain/.test(s)) return 'outdoor';
  if (/space|moon|void|none|studio/.test(s)) return '';
  return 'room';
}
