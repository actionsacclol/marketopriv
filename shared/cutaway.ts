// The cutaway preset ("You Built It" backyard builds): a block of ground cut open like a cake, with the house on top.
// Each line builds one thing (a pool, a bunker, a tunnel...), dug out on the cut face or standing on top, and stays
// there, so the yard fills up over the reel. A running total adds up what each build costs. Drawing lives in
// src/render/presets/cutaway.ts.
//
// A row: seconds | line | build | label | cost | say | flags

export const CUT_ITEMS = ['house', 'basement', 'pool', 'pond', 'well', 'pipe', 'cable', 'septic', 'tunnel', 'bunker', 'cave', 'tree', 'garden', 'water'] as const;
export type CutItem = (typeof CUT_ITEMS)[number];
export const isCutItem = (v: string): v is CutItem => (CUT_ITEMS as readonly string[]).includes(v);

/** Flags only the cutaway reads: where the camera goes for this line. */
export const CUT_FLAG = /^cam=(?:close|top|front|wide)$/;

export const CUT_HELP =
  'One build per row: seconds | line | build | label | cost | say | flags. line = the caption and what the voice reads (*word* = highlight; say = something else to read, - = silent). Every build stays in the yard for the rest of the reel. ' +
  'Builds: house (the house on top; the house field puts it there from the start) · basement (a room under the house) · pool (a swimming pool, cut in half on the face) · pond · well (a stone well, its shaft down to the water) · pipe (a water main across the face) · cable (a power line under the lawn) · septic (a septic tank) · tunnel (a tunnel along the bottom, lit) · bunker (a room deep down, with a hatch and a ladder) · cave (a natural cave in the rock) · tree (a tree, its roots on the face) · garden (raised beds) · water (the water table: the rock goes wet at the bottom) · none (no new build: talk over what is there). ' +
  'label = a tag that points at the build ("3 m deep", "Bunker"); cost = what it costs, added to the running total in the corner ("$45,000"; empty = no total). Flags: cam=close (the camera moves in on this build), cam=top (from above), cam=front (straight at the cut face), cam=wide (back to the whole block), pause=0.6, speed=0.95, and the effects. Real prices and depths only, from a real source. ';
