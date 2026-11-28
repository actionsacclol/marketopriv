// The diorama preset: the cutaway look (a block of ground floating in the sky, turning slowly in 3D, soil on its
// sides) for any story. Pick a scene base (a yard, a city block, a farm, a desert, a beach, snow, a forest, the moon,
// a clean studio stand); each line adds pieces that stay (a house, a shop, a tower, cars, people, servers, a rocket),
// takes them away, or makes something happen (mow the lawn, rain, snow, a storm, a fire, a flood, years passing).
// Underground builds from the backyard cutaway (basement, bunker, tunnel, well...) cut the front face open.
// Drawing lives in src/render/presets/diorama.ts.
//
// A row: seconds | line | things | label | number | say | flags
// things = pieces and actions joined with +, a count with * (tree*3), - in front takes one away (-car).

import { CUT_ITEMS } from './cutaway';

export const DIO_GROUNDS = ['yard', 'park', 'farm', 'city', 'desert', 'beach', 'snow', 'forest', 'moon', 'studio'] as const;
export type DioGround = (typeof DIO_GROUNDS)[number];

/** Pieces that stand on top, grouped so the help and the editor can list them by scene. */
export const DIO_PIECE_GROUPS = {
  buildings: ['house', 'cabin', 'mansion', 'shop', 'office', 'tower', 'factory', 'warehouse', 'barn', 'castle', 'tent', 'shed', 'garage', 'stand'],
  nature: ['tree', 'pine', 'palm', 'bush', 'rock', 'flowers', 'cactus', 'crops', 'hay', 'volcano'],
  vehicles: ['car', 'truck', 'tractor', 'boat', 'rocket', 'van'],
  things: ['fence', 'mailbox', 'lamp', 'bench', 'sign', 'statue', 'fountain', 'flag', 'campfire', 'solar', 'windmill', 'dish', 'server', 'desk', 'coins', 'gold', 'chest', 'grill', 'swing', 'trampoline', 'hottub', 'crane', 'billboard', 'atm', 'money'],
  living: ['person', 'crowd', 'dog', 'cow', 'robot'],
} as const;
export const DIO_PIECES = Object.values(DIO_PIECE_GROUPS).flat() as string[];
export type DioPiece = string;
export const isDioPiece = (v: string): boolean => DIO_PIECES.includes(v);

/** Underground builds, dug out on the front face like the backyard cutaway (house, tree and garden are pieces here). */
export const DIO_UNDER = CUT_ITEMS.filter((x) => x !== 'house' && x !== 'tree' && x !== 'garden') as string[];
export const isDioUnder = (v: string): boolean => DIO_UNDER.includes(v);

/** Things that happen. They act on what is there; most last for the line, some leave a mark (burnt, flooded, snowy). */
export const DIO_ACTIONS = ['mow', 'rain', 'snow', 'storm', 'fire', 'flood', 'drain', 'grow', 'clear', 'night', 'day', 'launch', 'quake', 'tornado', 'meteor', 'erupt', 'tsunami', 'none'] as const;
export const isDioAction = (v: string): boolean => (DIO_ACTIONS as readonly string[]).includes(v);

export interface DioThing {
  kind: 'piece' | 'under' | 'action';
  name: string;
  count: number;
  remove: boolean;
}

/** "house+tree*3+-car+mow" → the things in it, unknown names dropped. */
export function dioThings(visual: string): DioThing[] {
  const out: DioThing[] = [];
  for (const raw of visual.toLowerCase().split('+')) {
    let s = raw.trim();
    if (!s) continue;
    const remove = s.startsWith('-');
    if (remove) s = s.slice(1).trim();
    let count = 1;
    const m = /^([a-z]+)\s*(?:\*|x)\s*(\d+)$/.exec(s);
    if (m) {
      s = m[1];
      count = Math.max(1, Math.min(24, Number(m[2])));
    }
    if (s === 'all' && remove) out.push({ kind: 'piece', name: 'all', count: 1, remove: true });
    else if (isDioPiece(s)) out.push({ kind: 'piece', name: s, count, remove });
    else if (isDioUnder(s)) out.push({ kind: 'under', name: s, count: 1, remove });
    else if (isDioAction(s) && s !== 'none') out.push({ kind: 'action', name: s, count: 1, remove: false });
  }
  return out;
}

/** Flags only the diorama reads. */
export const DIO_FLAG = /^(?:cam=(?:close|top|front|wide|low|orbit)|age=\d{1,7}|season=(?:spring|summer|autumn|fall|winter)|sky=(?:day|dusk|night)|grass=(?:long|short)|at=(?:left|right|back|front|center)|on=[a-z]+|block=[12]|text=[a-z0-9_$%&!.+'-]{1,24})$/;

/** Buildings go up floor by floor: how many floors each has (the rest pop in). */
export const DIO_RISE: Record<string, number> = { house: 2, cabin: 2, mansion: 3, shop: 2, office: 5, tower: 9, factory: 3, warehouse: 2, barn: 2, castle: 4, garage: 1, shed: 1 };
/** Seconds a building takes to go up (0 = it pops in). */
export const dioRiseTime = (name: string): number => (DIO_RISE[name] ? Math.min(3, 0.5 + 0.28 * DIO_RISE[name]) : 0);

export const DIO_HELP =
  'One line per row: seconds | line | things | label | number | say | flags. line = the caption and what the voice reads (*word* = highlight; say = something else to read, - = silent). ' +
  'things = what this line adds, takes away or makes happen, joined with + ("shop+person*2", "-car", "tower+crane", "mow"); pieces stay for the rest of the reel. ' +
  `Pieces: buildings ${DIO_PIECE_GROUPS.buildings.join(', ')} · nature ${DIO_PIECE_GROUPS.nature.join(', ')} · vehicles ${DIO_PIECE_GROUPS.vehicles.join(', ')} · things ${DIO_PIECE_GROUPS.things.join(', ')} · living ${DIO_PIECE_GROUPS.living.join(', ')}. ` +
  'tree*3 adds three, -tree takes the newest one away, -all clears every piece. Buildings go up floor by floor; cars, vans, trucks and tractors drive in from the edge (and drive off when taken away); people and animals wander; money = a pile of cash that grows and shrinks with the counter; volcano = a volcano (erupt makes it go off). ' +
  `Underground (cuts the front face open, like the backyard cutaway): ${DIO_UNDER.join(', ')}. ` +
  'Actions: mow (a mower cuts the long grass in stripes), rain, snow (the ground and roofs go white), storm (rain + lightning), fire (the newest building, or on=<piece>, burns and is left charred), flood (water rises over the ground), drain (it goes down), grow (plants grow big), clear (snow, water and scorch marks go; a burnt building stays charred), night / day, launch (the rocket lifts off and flies away; "rocket+launch" on one line works), quake (the block shakes, the ground cracks, buildings are left leaning), tornado (crosses the block: people, cars and loose things go up with it, roofs come off), meteor (falls on on=<piece> or the newest building: a flash, a blast, a crater), erupt (the newest volcano, or on=volcano: lava down the sides, rocks, a smoke column), tsunami (a wave sweeps the block from the back, washes away people, cars and loose things, and leaves it flooded until drain). none = nothing new: talk over what is there. ' +
  'label = a tag that points at what this line added ("HQ", "Year 1"); with nothing new it is a title across the top ("100 YEARS LATER"). number = the counter in the corner: with Counter total it adds up ("$45,000", "+12 staff"), with Counter show it shows this line\'s value and counts to it ("2126", "1,000,000"). ' +
  'Flags: age=100 (years passed: paint fades, metal rusts, roofs fall in, buildings crumble to grassy mounds and a forest takes over by age=10000; people leave), season=winter/autumn/spring/summer, sky=day/dusk/night, grass=long/short, at=left/right/back/front/center (where this line\'s pieces go), on=<piece> (what fire, meteor, launch or erupt hits), text=KRYPT_HQ (the words on the signs, billboards, shop fronts, offices and towers this line adds; _ is a space), block=1 / block=2 (with Blocks two: which block the line is about; a line without one changes both), cam=close (moves in on what this line added), cam=top, cam=low, cam=front (straight at the cut face), cam=orbit (swings round), cam=wide, pause=0.6, speed=0.95, and the effects. Fields: Blocks two puts two blocks one over the other (before / after, us / them), each with its own name, weather, counter and camera; Sign text puts words on every sign and billboard. Real numbers only, from a real source. ';
