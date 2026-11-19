import type { Brand, CustomStyle, IgAccount } from './types';
import { isKryptBrand } from './brand';

// Channel styles (the Styles page): what an account's videos are, as a whole —
// the kind of story, the look, how it ends. Each has a short label so the user
// can say "run the vote style on @x". An account runs one or more (IgAccount.styles,
// first = its main); the AI alternates between them. Each style's preview is one
// of the example videos (shared/examples.ts).

export interface ChannelStyle {
  id: string;
  /** What the user calls it ("run the vote style"). */
  label: string;
  name: string;
  /** One or two lines for the card. */
  about: string;
  /** Example video id (resources/examples/<id>.mp4). */
  preview: string;
  bestOn: string;
  /** Format to start from (list_formats), if any. */
  format?: string;
  /** How the AI makes it. */
  rules: string;
  /** One of the user's own styles (made on the Styles page or by their AI), built on the built-in style `base`. */
  custom?: boolean;
  base?: string;
}

export const STYLES: ChannelStyle[] = [
  {
    id: 'main',
    label: 'main',
    name: 'Brand stories',
    about: 'Real stories in beats with live charts and numbers, and your product where it fits. The main style: everything else in the AI\'s instructions describes it.',
    preview: 'story-flat',
    bestOn: 'Every platform',
    rules: 'The brand\'s own reels: the formats, the art style test and the voice test as described above.',
  },
  {
    id: 'vote',
    label: 'vote',
    name: 'Comment vote story',
    about: 'A story told in parts. Each part ends on a choice, viewers vote A or B in the comments, and the most votes decide what happens in the next part. The comments are the point, so each part pulls people back for the next.',
    preview: 'story-vote',
    bestOn: 'TikTok, Shorts, Reels',
    format: 'vote-story',
    rules: [
      'A series of short parts (20-35s) with the mascot as the main character (art ps2 or cartoon, the same art for the whole series). Start from format vote-story, and pass vote: {series, part, a, b} to create_reel.',
      'Part 1 sets up one situation people care about (in the brand\'s world: a wallet, a coin, a PC that will not boot, a sketchy download). Every part ends on a real choice with two options, both tempting, shown with a poll beat: the headline names both options ("*A:* pay the expert. *B:* guess it himself."), the poll field a is just "A;B" (the pills fit about 8 letters), and the line is said out loud, ending "Comment A or B."',
      'Title the video and the caption "Part N", and end the caption with "Comment A or B. Most votes decides part N+1."',
      'From about 12 hours after a part is posted, read its comments on every platform it is on, count each person once, only for a clear A or B, and record_votes. Never invent or round up votes. With no votes at all, pick the option that makes the better story and say so in the next part ("Nobody voted, so KIP chose...").',
      'The next part opens with the result ("You picked B: ...") and what happened, then the next choice. Post it on the same platforms as the last part. End a series after 3-6 parts with a finale that wraps it up, then start a new one.',
      'Keep it honest: choices with money in them show what really tends to happen (no promised profits; "Not financial advice." when trading is in it). The product appears only where the story naturally needs it.',
    ].join(' '),
  },
  {
    id: 'tips',
    label: 'tips',
    name: 'One-tip tutorial',
    about: 'One useful tip per video with the exact steps on screen, acted out by a cartoon mascot. Fast to watch, easy to save.',
    preview: 'story-cartoon',
    bestOn: 'TikTok, Shorts',
    rules: 'Story reels in art cartoon, 15-25s: the problem in the first beat, the exact steps (steps visual, real menu names and keys), the result, then "Follow for one tip a day." One tip per video; a tool appears only when it is the tip.',
  },
  {
    id: 'retro',
    label: 'retro',
    name: 'PS2 quest',
    about: 'An early-2000s console look: the story is a "side quest" told in a game dialogue box, in a foggy low-poly world.',
    preview: 'story-ps2',
    bestOn: 'Shorts, TikTok',
    rules: 'Story reels in art ps2, framed as a game: "Side quest:" in the first line, each step a stage, "Quest complete." at the end. Works for checklists, how-tos and explainers.',
  },
  {
    id: 'toy',
    label: 'toy',
    name: '3D mascot',
    about: 'A glossy, toy-like 3D mascot in a soft studio. Friendly, brand-mascot feel for explainers and warnings.',
    preview: 'story-3d',
    bestOn: 'Reels, Facebook',
    rules: 'Story reels in art 3d: a short relatable moment, the mascot reacts, then the fix. Calm music (bed lofi or ambient).',
  },
  {
    id: 'wyr',
    label: 'wyr',
    name: 'Would you rather',
    about: 'Rapid A-or-B choices with a 3-2-1 countdown on each. Everyone has an opinion, so the comments fill up on their own.',
    preview: 'story-wyr',
    bestOn: 'TikTok, Shorts, Reels',
    rules: 'Story reels of 3-5 poll beats: each headline is one "Would you rather" choice naming both sides (*accent* the two), the poll field a holds two short labels that fit the pills (about 9 letters each, e.g. "1 BTC;$10K"), said out loud with pause=0.3. Choices from the brand\'s world, both sides tempting. Last beat: "Comment your picks." (follow). No profit promises inside the choices.',
  },
  {
    id: 'case',
    label: 'case',
    name: 'Scam autopsy',
    about: 'True-crime for crypto: one real rug, hack or scam, taken apart beat by beat. Where the money went, and the red flags anyone could have seen.',
    preview: 'story-case',
    bestOn: 'Shorts, Reels, X',
    rules: 'Story reels, dark look (theme dark, bed ambient), 30-45s. Only real, reported cases: the date and sources in the kicker, every number from those sources. The hook is the loss or the twist; then how it worked (wallet / flow / chart), the moment it collapsed (stamp), and the red flags as steps. Say "reportedly" where the sources do; never name a private person as a criminal. The tool appears only if it would have shown a red flag, without promising it would have saved anyone.',
  },
  {
    id: 'quiz',
    label: 'quiz',
    name: 'Guess what happened',
    about: 'A real chart cut off at the big moment, a poll ("up or down?"), then the reveal stamped on screen. People rewatch to check their guess.',
    preview: 'story-quiz',
    bestOn: 'Shorts, TikTok, X',
    rules: 'Story reels: the setup chart (real data up to the moment), a poll beat "Up;Down" (or two outcomes) with "Guess before the reveal.", then the real chart continuing (dark wipe) and a stamp with the result. Real, sourced data only, the date in the kicker. Never frame the answer as a trading signal; "Not financial advice." on market ones.',
  },
  {
    id: 'myth',
    label: 'myth',
    name: 'Myth busted',
    about: 'A thing everyone believes, the evidence, then BUSTED or TRUE slammed on screen.',
    preview: 'story-myth',
    bestOn: 'Every platform',
    format: 'myth-vs-data',
    rules: 'Start from format myth-vs-data. One myth per reel, stated in the first beat the way people say it; then what is actually true, with the number or the screen; then the verdict stamp (BUSTED / TRUE / HALF TRUE); then what to do instead. Sources in the kicker.',
  },
  {
    id: 'top',
    label: 'top',
    name: 'Voiced top 5',
    about: 'A countdown, one item per beat, every line voiced with sound effects and music. The talking version of a "top 5" list.',
    preview: 'story-top',
    bestOn: 'TikTok, Shorts',
    rules: 'Story reels, never the silent list preset: a hook beat ("3 Windows shortcuts nobody uses"), then one beat per item counting down (title visual: a = "#3", b = the item; or steps / card for what it does), each line saying what it does in one sentence, then a follow beat. 3-5 items, all real and checked.',
  },
  {
    id: 'chat',
    label: 'chat',
    name: 'Text story',
    about: 'A phone chat that types itself out, message by message, with pops and music. The story is in the messages: a scam DM, a friend with a bad idea, a deal that is too good.',
    preview: 'story-chat',
    bestOn: 'TikTok, Reels, Shorts',
    rules: 'Story reels made of chat beats (a = messages, ">" = mine; b = the contact). 4-6 beats, 2-3 messages each; the narrator reads them. Kicker "STORY" (they are made up, so never present one as a real conversation or use a real person\'s name or handle). Build to a twist, then the lesson (stamp or steps): how to spot it, what to do. Scam stories show the scam failing, never a working how-to.',
  },
  {
    id: 'tier',
    label: 'tier',
    name: 'Tier list',
    about: 'Things ranked S to F on a tier board, one at a time, with a one-line reason each. Rankings start arguments, and arguments are comments.',
    preview: 'story-tier',
    bestOn: 'TikTok, Shorts, Reels',
    rules: 'Story reels: a hook beat ("Ranking every way to store a seed phrase"), then one tier beat per item (a = "S:Item", the line gives the reason), 5-7 items, then "Where would you put them? Comment." (follow). Rank on facts you can say out loud. Never rank trading tools by profit, and never put a competitor in F without a fact that shows why.',
  },
  {
    id: 'screen',
    label: 'screen',
    name: 'Screen tutorial',
    about: 'A real screen recording of the app doing the thing, with a voice walking through the steps and callouts on screen. The proof is the screen.',
    preview: 'story-screen',
    bestOn: 'TikTok, Shorts',
    rules: 'Use the app\'s bundled recording (krypt_tools shows its path) or record_screen a fresh one (launch: its Start menu name), look at the frames, set fields.video to the recording, then story beats: a hook beat with the result, screen beats for each step (a = the second in the recording, "@x,y x2" to zoom on the button, b = the callout like "Click Scan"), and a follow beat. Only real recordings of real results on this PC; never fake or edit numbers. Trading tools (Krypto Bot, Krypto Mirror, the PolyBots, Krypt Trader) only in paper / demo mode, with "Demo data" in the kicker, and never show demo PnL as earnings. Not financial advice on those.',
  },
  {
    id: 'clipping',
    label: 'clipping',
    name: 'Stream clips',
    about: 'The best moments from the Twitch and Kick streamers you pick: their top clips of the last day or week, cut vertical with the facecam on top, the gameplay below and captions on every line.',
    preview: 'clip-split',
    bestOn: 'TikTok, Shorts, Reels',
    rules: [
      'Reels cut from the Twitch / Kick clips of the streamers set for this account on the Styles page (the user picks the streamers and last day or last week there). find_clips lists their top clips by views and marks the ones already used.',
      'Take the most-viewed clip that is not used yet and has a moment worth watching in 8-60s. save_clip it: it downloads the clip, captions the speech on this computer and returns frames.',
      'Look at the frames for the streamer\'s webcam. create_reel with preset clip: video = the saved file, source = the clip address, fit split, cam = the webcam area as "x,y,w,h" fractions of the frame (empty when there is no webcam), game = the gameplay area (empty = the middle of the frame; keep the webcam out of it when you can), sound on, zoom off, start and seconds on the best 8-45s (start on the action, cut dead air), headline = a short hook from what happens or what is said (never promise what the clip does not show), captions = save_clip\'s caption lines for that span (leave captions empty when the frames show the stream\'s own captions already burned into the video: two sets of captions look broken; or set game to leave them out), disclaimer empty (it is not a trading reel). preview_reel to check the webcam sits right before render_reel.',
      'It is only the clip: no end card, no logo, no brand, product, link or call to action on the video or in the post caption (create_reel leaves the end card off for clip reels). Add them only when the user asked for it.',
      'Name the streamer in the post caption ("Clip: <name> on Kick" or "on Twitch", with their @ on a platform where you know it). Never post as if you were the streamer or speak for them.',
      'Skip clips with nudity, slurs, violence or anything the platform would strike. Casino and gambling clips get limited or removed on TikTok, Instagram and YouTube: skip them unless the user said to post them, and never add a casino link or code.',
    ].join(' '),
  },
];

// The user's own styles. They live in the hub's data (Db.customStyles); whoever loads or changes that data
// hands them over here, so every lookup below knows them too.
let custom: ChannelStyle[] = [];
export function setCustomStyles(list: CustomStyle[] | undefined): void {
  custom = (list ?? []).map((c) => {
    const b = STYLES.find((s) => s.id === c.base) ?? STYLES[0];
    const rules = b.id === 'main' ? c.rules : `${c.rules} It is built on the ${b.label} style: where this says nothing, make it the way that one is made (${b.rules})`;
    return { id: c.id, label: c.label, name: c.name, about: c.about, preview: b.preview, bestOn: b.bestOn, format: b.format, rules, custom: true, base: b.id };
  });
}
/** The built-in styles, then the user's own. */
export const allStyles = (): ChannelStyle[] => (custom.length ? [...STYLES, ...custom] : STYLES);

export const styleById = (id: string): ChannelStyle | undefined => {
  const k = id.trim().toLowerCase();
  return allStyles().find((s) => s.id === k || s.label === k || s.name.toLowerCase() === k) ?? (k === 'krypt' ? STYLES[0] : undefined);
};

/** The main style's name and label follow the brand (Krypt's is "Krypt"). */
export function styleName(s: ChannelStyle, brand: Pick<Brand, 'name'>): { name: string; label: string } {
  if (s.id !== 'main') return { name: s.name, label: s.label };
  if (isKryptBrand(brand)) return { name: 'Krypt', label: 'krypt' };
  return { name: brand.name.trim() ? `${brand.name.trim()} stories` : s.name, label: 'main' };
}

/** The styles an account runs, main first (missing = just the main style). */
export const stylesOf = (a: Pick<IgAccount, 'styles'>): string[] => (a.styles?.length ? a.styles : ['main']);

/** Clean a list of style names/ids into ids; throws on an unknown one. */
export function cleanStyles(input: string[]): string[] {
  const out: string[] = [];
  for (const x of input) {
    const s = styleById(x);
    if (!s) throw new Error(`No style "${x}". Styles: ${allStyles().map((y) => y.label).join(', ')} (krypt = main).`);
    if (!out.includes(s.id)) out.push(s.id);
  }
  return out;
}

/**
 * The share of reels each of an account's styles gets, in percent, adding up to about 100. The user's own mix
 * when one is set (Styles page); otherwise the main style gets half and the others share the rest.
 */
export function styleMix(a: Pick<IgAccount, 'styles' | 'styleMix'>): Array<{ id: string; share: number }> {
  const ids = stylesOf(a);
  if (ids.length === 1) return [{ id: ids[0], share: 100 }];
  const own = a.styleMix ?? {};
  const set = ids.some((id) => Number(own[id]) > 0);
  const raw = ids.map((id, i) => (set ? Math.max(0, Number(own[id]) || 0) : i === 0 ? ids.length - 1 : 1));
  const total = raw.reduce((n, x) => n + x, 0) || 1;
  return ids.map((id, i) => ({ id, share: Math.round((raw[i] / total) * 100) }));
}

/** The style the next reel should be in so the recent reels match the mix: the one furthest behind its share. */
export function nextStyle(mix: Array<{ id: string; share: number }>, recent: string[]): string {
  let best = mix[0].id;
  let gap = -Infinity;
  for (const m of mix) {
    if (m.share <= 0) continue;
    const g = (m.share / 100) * (recent.length + 1) - recent.filter((x) => x === m.id).length;
    if (g > gap + 1e-9) {
      gap = g;
      best = m.id;
    }
  }
  return best;
}

/** A mix as saved: whole percents for the styles the account runs, scaled to 100. null when it says nothing (back to the default). */
export function cleanMix(input: Record<string, unknown>, ids: string[]): Record<string, number> | null {
  const raw = ids.map((id) => Math.max(0, Math.min(100, Number(input[id]) || 0)));
  const total = raw.reduce((n, x) => n + x, 0);
  if (ids.length < 2 || total <= 0) return null;
  return Object.fromEntries(ids.map((id, i) => [id, Math.round((raw[i] / total) * 100)]));
}
