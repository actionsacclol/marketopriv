import type { FieldValue, Fields } from './types';
import { ELEVEN_SPEED, TUNE_RANGE, VOICE_IDS, cleanTune, clipKey, hashKey, isEleven, readVoiceCache, tuneFromFields, voiceId, voiceName, type VoiceTune } from './voice';
import { chatEnd, pollEnd, storySfx } from './sfx';
import { ACTION_HELP, ARTS } from './character';
import { STICK_FLAG, STICK_GEAR, STICK_HELP, stickScreenStart } from './stickman';
import { DUO_FLAG, DUO_HELP, DUO_SETS, duoLines } from './duo';
import { BLOX_FLAG, BLOX_HELP, BLOX_LOOK_A, BLOX_LOOK_B, BLOX_LOOK_HELP, BLOX_SETS, BLOX_TIMES } from './blox';

// Preset styles: the schema, defaults and timing of every reel format. Pure
// data so the main process (MCP tool listing / validation) and the renderer
// (form + drawing) agree on fields and durations. Drawing lives in
// src/render/presets.

export type FieldType = 'text' | 'longtext' | 'lines' | 'number' | 'select' | 'toggle' | 'file';

export interface PresetField {
  key: string;
  label: string;
  type: FieldType;
  default: FieldValue;
  help?: string;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  fileKind?: 'video' | 'audio' | 'image';
  /** Kept with the reel but not shown in the form (written by the app). */
  hidden?: boolean;
}

export interface PresetMeta {
  id: string;
  name: string;
  tagline: string;
  /** What in the niche it imitates (style only). */
  inspiredBy: string;
  fields: PresetField[];
  /** Not a brand reel (memes, Reddit stories): new ones get no brand logo, end card or disclaimer unless asked. */
  brandFree?: boolean;
}

/** Music Marketo makes itself, for the voiced presets. */
export const BEDS = ['none', 'lofi', 'ambient', 'pulse', 'phonk', 'goofy', 'creepy'];
const BED_HELP =
  'Music made by Marketo itself (nothing licensed, nothing a platform can mute): lofi = dusty keys, swung drums and vinyl crackle; ambient = slow pads; pulse = a driving synth groove; phonk = cowbell riff, sliding 808 and hard drums (meme edits); goofy = bouncy tuba and xylophone (dumb / funny reels); creepy = a low drone and a music box (scary stories). It dips under the voice. The key and chords change per reel.';

/** Effects a beat can carry in its flags (meme and narrated reels; story reels too). Sounds play at their time; picture effects change the frame from their time on. */
export const FX_SOUNDS = ['boom', 'horn', 'scratch', 'ding', 'buzzer', 'boing', 'honk', 'sad', 'bass', 'whoosh', 'pop', 'impact', 'riser'] as const;
export const FX_LOOKS = ['zoom', 'shake', 'fry', 'flash', 'freeze', 'slowzoom'] as const;
export type FxKind = (typeof FX_SOUNDS)[number] | (typeof FX_LOOKS)[number];
export interface Fx {
  kind: FxKind;
  /** Seconds into the beat. */
  at: number;
  /** Zoom: the point to zoom onto, fractions of the frame. */
  x: number;
  y: number;
}
export const FX_HELP =
  'Effects (flags, any number): sounds boom (deep vine-boom hit), horn (air horn), scratch (record scratch), ding, buzzer (wrong answer), boing, honk (clown horn), sad (sad trombone), bass (distorted bass drop), whoosh, pop, impact, riser; picture effects zoom (sudden punch-in, zoom=0.5,0.3 onto that point of the frame), shake, fry (deep-fried colours), flash (white flash), freeze (the video stops), slowzoom (slow push-in). Each plays at the start of the beat, or add @seconds into the beat: "zoom@1.2=0.45,0.3 boom@1.2 shake@1.2". Use them on the punchline, not on every beat.';

const FX_TOKEN = /^([a-z]+)(?:@(\d+(?:\.\d+)?))?(?:=(\d*\.?\d+),(\d*\.?\d+))?(?:@(\d+(?:\.\d+)?))?$/;
const isFxKind = (k: string): k is FxKind => (FX_SOUNDS as readonly string[]).includes(k) || (FX_LOOKS as readonly string[]).includes(k);
export const isFxSound = (k: string): boolean => (FX_SOUNDS as readonly string[]).includes(k);

/** One flag token as an effect, or null. */
export function parseFx(tok: string): Fx | null {
  const m = FX_TOKEN.exec(tok.toLowerCase());
  if (!m || !isFxKind(m[1])) return null;
  const at = Number(m[2] ?? m[5] ?? 0);
  const x = m[3] !== undefined ? Math.min(1, Math.max(0, Number(m[3]))) : 0.5;
  const y = m[4] !== undefined ? Math.min(1, Math.max(0, Number(m[4]))) : 0.42;
  return { kind: m[1], at: Number.isFinite(at) ? Math.max(0, at) : 0, x, y };
}

/** Presets that speak their beats (the story engine's voice, effects and music). */
export const VOICED_PRESETS = ['story', 'narrated', 'meme', 'stickman', 'blox', 'slides', 'duo'];
export const isVoiced = (preset: string): boolean => VOICED_PRESETS.includes(preset);

export const ACCENTS: Record<string, [string, string, string]> = {
  krypt: ['#6366F1', '#A855F7', '#EC4899'],
  green: ['#10B981', '#22C55E', '#A3E635'],
  gold: ['#F59E0B', '#FBBF24', '#FDE68A'],
  cyan: ['#06B6D4', '#38BDF8', '#818CF8'],
  red: ['#EF4444', '#F43F5E', '#FB7185'],
};

// Fields every preset ends with: the end card, a footer disclaimer and music.
const COMMON: PresetField[] = [
  { key: 'accent', label: 'Accent', type: 'select', default: 'krypt', options: Object.keys(ACCENTS), help: 'Highlight colour. krypt = the brand gradient; green reads as "trading".' },
  { key: 'logo', label: 'Logo', type: 'file', fileKind: 'image', default: '', help: 'Square logo image for the end card and product cards. Empty = the Krypt logo (for reels about Krypt tools). none = no logo.' },
  { key: 'cta', label: 'End card title', type: 'text', default: 'krypt.cc' },
  { key: 'cta_sub', label: 'End card line', type: 'text', default: 'link in bio' },
  { key: 'cta_seconds', label: 'End card seconds', type: 'number', default: 2.4, min: 0, max: 6, step: 0.1, help: '0 = no end card' },
  { key: 'disclaimer', label: 'Footer disclaimer', type: 'text', default: '', help: 'Small print on every frame, e.g. "Not financial advice."' },
  { key: 'music', label: 'Music', type: 'file', fileKind: 'audio', default: '', help: 'Optional audio file, trimmed to the reel and faded out.' },
  { key: 'music_volume', label: 'Music volume', type: 'number', default: 0.8, min: 0, max: 1, step: 0.05 },
];

// Memes and Reddit stories carry no brand: no logo, no end card, no small print (the caller can still set them).
const BRAND_FREE: PresetField[] = COMMON.map((f) => (f.key === 'cta_seconds' ? { ...f, default: 0 } : f.key === 'logo' ? { ...f, default: 'none' } : f.key === 'cta' ? { ...f, default: '' } : f.key === 'cta_sub' ? { ...f, default: '' } : f));

// The voice, effects and music fields every voiced preset (story, narrated, meme) has.
const VOICE_FIELDS: PresetField[] = [
  { key: 'voiceover', label: 'Voice-over', type: 'toggle', default: true, help: 'On-device AI voice (Kokoro). Generated on preview and render.' },
  { key: 'voice', label: 'Voice', type: 'select', default: 'am_michael', options: VOICE_IDS, help: 'One voice for the whole reel. A voice the user saved on the Voices page also works here by its name (it sets all the voice_* fields). An ElevenLabs voice is "el:<voice id>" or its name: it is bought only at render_reel; previews have no narration until then.' },
  { key: 'voice_standin', label: 'Fallback voice', type: 'text', default: '', hidden: true, help: 'The free voice a render falls back to when the ElevenLabs lines cannot be bought (default Michael).' },
  { key: 'voice_free', label: 'Rendered with the free voice', type: 'text', default: '', hidden: true, help: 'Set by the hub when a render could not buy the ElevenLabs lines and used the free voice.' },
  { key: 'voice_speed', label: 'Voice speed', type: 'number', default: 1.2, min: 0.7, max: 1.5, step: 0.05 },
  { key: 'voice_pitch', label: 'Voice pitch', type: 'number', default: 0, ...TUNE_RANGE.pitch, help: 'Semitones: below 0 is deeper, above 0 is higher.' },
  { key: 'voice_warmth', label: 'Voice warmth', type: 'number', default: 0, ...TUNE_RANGE.warmth, help: 'More or less low end, in dB.' },
  { key: 'voice_clarity', label: 'Voice clarity', type: 'number', default: 0, ...TUNE_RANGE.clarity, help: 'More or less high end, in dB.' },
  { key: 'voice_blend', label: 'Blend with', type: 'select', default: 'none', options: ['none', ...VOICE_IDS], help: 'A second voice mixed into the first (still one voice for the whole reel).' },
  { key: 'voice_blend_amount', label: 'Blend amount', type: 'number', default: 0, ...TUNE_RANGE.blendAmount, help: 'Share of the second voice: 0.3 = 30%.' },
  { key: 'voice_volume', label: 'Voice volume', type: 'number', default: 1, min: 0, max: 1.5, step: 0.05 },
  { key: 'sfx', label: 'Sound effects', type: 'toggle', default: true, help: 'Synthesized ticks, pops, whooshes, risers and hits on every on-screen change, mixed under the voice.' },
  { key: 'sfx_volume', label: 'Effects volume', type: 'number', default: 0.5, min: 0, max: 1, step: 0.05 },
  { key: 'bed', label: 'Background music', type: 'select', default: 'none', options: BEDS, help: BED_HELP },
  { key: 'bed_volume', label: 'Music level', type: 'number', default: 0.6, min: 0, max: 1, step: 0.05, help: 'Level in the gaps between lines; it drops to about 40% of this while someone talks.' },
  { key: 'vo_cache', label: 'Voice cache', type: 'longtext', default: '', hidden: true },
];

export const PRESETS: PresetMeta[] = [
  {
    id: 'story',
    name: 'Story',
    tagline: 'One real story told in beats: a narrated line per beat with words blurring in as they are spoken, one animated diagram per beat, sound effects on every change, loops back to the start.',
    inspiredBy: 'Faceless news-desk story reels (the format behind the reference accounts’ top reels)',
    fields: [
      { key: 'kicker', label: 'Dateline', type: 'text', default: 'KRYPTO MIRROR · OUR DATA · 9.3M TRADES', help: 'Small caps line on the first beat: TOPIC · DATE · SOURCE' },
      {
        key: 'beats',
        label: 'Beats',
        type: 'lines',
        default: [
          '3.6 | Everyone says *copy the smart money*. We tested it. | title | 9.3M | pump.fun trades, replayed',
          '3.4 | Every group of wallets *lost* money. | wallets | 0 of 10 | wallet groups made money after costs',
          '3.6 | The best ranking we found still lost: | bars | Leaderboard pick:-14.3;Average wallet:-9.9;*Best ranking:-4.7 | % median per copy',
          '4.0 | So Krypto Mirror shows what *you* would have kept. | card | Krypto Mirror | Copy score: what a follower keeps;Every follow starts on paper;Keys never leave your PC',
          '3.4 | Not a money printer. An *honest* record. | cta | krypt.cc | link in bio',
        ].join('\n'),
        help: 'One beat per line: seconds | headline | visual | a | b | say | flags. say = what the voice reads (default: the headline; - = silent); write numbers as words. flags (space separated): light / dark (this beat\'s look), wipe (colour wipe into the beat), pause=1.2 (silence before the line, for suspense), speed=0.95 (this line\'s pace). A beat stretches to fit its line. *word* = accent. Visuals: title (a big, b small) · number (a counts up, b label) · chart (a = values "0.2,0.5,7.3,15.1,0.6" or labelled "2010:41;2013:7500000", b = format "$%M", or "$~" for compact $41 / $7.5M / $1.26B; draws live with the labels along the bottom, red bracket on a crash) · coin (a = symbol "₿" or "SOL", b = label "10,000 BTC"; a gold coin spins in and lands) · flow (a = source labels "A;B;C;D;E" or a count, b = arrow label "983 SOL") · dots (a = count "10,939", b label; a field of dots fills while it counts) · wallet (a title, b = "Label:value;Label:value"; checking… then values) · bars (a = "Label:-9.9;*Highlight:-4.7;!Bad outcome:82.5", b unit; * = highlight, ! = red) · wallets (a big, b label) · lag (a = leader tag, b = follower tag) · steps (a = "One;Two;!Bad") · card (a title, b = "row;row") · follow (a button text, b line; a cursor clicks it) · poll (a = \"Copy;Skip\", b line; two answers and a 3-2-1 countdown, pair with pause=0.4) · stamp (a = verdict \"BUSTED\" or \"−9.4%\", b line; slams in with a hit) · crosshair (a = shapes \"cross;dot;circle;t;chevron;x;plus;lineup\", each optionally :#colour, b line; a game scene where the crosshair snaps through each shape every 0.5s, its name under it) · radar (a = sounds \"Footsteps:left;Gunshot:right;Reload:front-left\", each a name and a side: ahead, left, right, behind, front-left... or degrees, optionally :#colour; b line; a game scene with a ring round the crosshair that lights up on each sound\'s side, one sound a second, its name and side under it; footsteps amber, shots cyan; for Krypt Radar) · tier (a = "S:Item", tiers S A B C D F; each tier beat drops one item onto a tier-list board that keeps the earlier ones, b = optional line under the board) · chat (a = messages separated by ; , ">text" = sent by me on the right, others received on the left; b = the contact name; the thread carries on across chat beats with the same contact, messages pop in as the line is read) · screen (shows the screen recording in, field video: a = the second to start at, optionally "@0.7,0.3 x2" to zoom 2x around that point; b = an optional callout under it) · cta (a title, b line) · none. ' + ACTION_HELP + ' ' + FX_HELP,
      },
      { key: 'card_by', label: 'Card maker line', type: 'text', default: 'by Krypt', help: 'Small line under the product name on card beats, e.g. "by Krypt" for a Krypt tool or "by <your brand>".' },
      { key: 'video', label: 'Screen recording', type: 'file', fileKind: 'video', default: '', help: 'The recording screen beats show (record_screen makes one). Each screen beat picks its own start second.' },
      ...VOICE_FIELDS,
      { key: 'wps', label: 'Reading speed (words/s)', type: 'number', default: 3.4, min: 1.5, max: 8, step: 0.1, help: 'How fast the headline words light up' },
      { key: 'motion', label: 'Motion', type: 'select', default: 'kinetic', options: ['kinetic', 'calm'], help: 'kinetic = words pop in with highlight boxes on accents, zoom-through cuts with a whoosh, slow camera push, bursts when numbers and stamps land; calm = soft fades and blur' },
      { key: 'theme', label: 'Look', type: 'select', default: 'light', options: ['dark', 'light'], help: 'Default look; a beat can switch with the light / dark flag. light = clean keynote, dark = Krypt desk' },
      { key: 'art', label: 'Art style', type: 'select', default: 'flat', options: [...ARTS], help: 'flat = clean motion graphics (the look and light / dark flags apply). cartoon = a toon-shaded mascot with ink outlines on bold colour, comic lettering. ps2 = an early-2000s console look: low-res, wobbly low-poly world, fog, dithering, the line in a game dialogue box. 3d = a glossy toy-like 3D mascot in a soft studio. In cartoon / ps2 / 3d the mascot is on screen every beat: character beats make it the star, diagram beats show it small, presenting.' },
      { key: 'char_name', label: 'Character name', type: 'text', default: 'KIP', help: 'The mascot\'s name (shown on the ps2 dialogue box).' },
      { key: 'char_color', label: 'Character colour', type: 'text', default: '#8B5CF6', help: 'Body colour as #RRGGBB (the brand colour).' },
      { key: 'loop', label: 'Loop back to the opening', type: 'toggle', default: true, help: 'The last beat fades into the first frame so the reel replays seamlessly (no end card)' },
      ...COMMON.map((f) => (f.key === 'disclaimer' ? { ...f, default: 'Replay of recorded trades · not financial advice' } : f.key === 'cta_seconds' ? { ...f, default: 0 } : f)),
    ],
  },
  {
    id: 'list',
    name: 'Top-N list',
    tagline: 'Headline, then repo-style rows land one per beat.',
    inspiredBy: '"5 GitHub repos that make you money" list reels',
    fields: [
      { key: 'kicker', label: 'Kicker', type: 'text', default: 'KRYPT TOOLS ▽' },
      { key: 'headline', label: 'Headline', type: 'longtext', default: '3 crypto tools that run on your own PC' },
      {
        key: 'items',
        label: 'Rows',
        type: 'lines',
        default: 'krypt / polybot | AI agents on Polymarket, under hard rails | FREE\nkrypt / trader | Put your AI on Kalshi. Paper first. | FREE\nkrypt / editor | CapCut-style editor. No watermark. | FREE',
        help: 'One row per line: name | description | badge',
      },
      { key: 'beat', label: 'Seconds per row', type: 'number', default: 1.7, min: 0.6, max: 5, step: 0.1 },
      { key: 'hold', label: 'Hold after last row', type: 'number', default: 1.6, min: 0, max: 6, step: 0.1 },
      ...COMMON,
    ],
  },
  {
    id: 'post',
    name: 'Post card',
    tagline: 'A social post types itself out, numbers tick up, a punchline lands.',
    inspiredBy: 'Tweet-screenshot story reels',
    fields: [
      { key: 'name', label: 'Display name', type: 'text', default: 'Krypt' },
      { key: 'handle', label: 'Handle', type: 'text', default: '@krypt.cc', help: 'Use our own accounts only, never someone else\'s.' },
      { key: 'verified', label: 'Badge', type: 'toggle', default: true },
      {
        key: 'text',
        label: 'Post text',
        type: 'longtext',
        default: 'most AI trading "edges" are just the model being wrong.\n\nso we built a scoreboard that tells you before a dollar is at risk.',
      },
      { key: 'likes', label: 'Likes', type: 'text', default: '12.4K' },
      { key: 'reposts', label: 'Reposts', type: 'text', default: '1,982' },
      { key: 'views', label: 'Views', type: 'text', default: '481K' },
      { key: 'punch', label: 'Punchline', type: 'longtext', default: 'Krypto Bot.\nBuilt for memecoins.' },
      { key: 'cps', label: 'Typing speed (chars/s)', type: 'number', default: 42, min: 10, max: 200 },
      { key: 'hold', label: 'Punchline seconds', type: 'number', default: 2.2, min: 0.5, max: 6, step: 0.1 },
      ...COMMON.map((f) => (f.key === 'disclaimer' ? { ...f, default: 'Not financial advice.' } : f)),
    ],
  },
  {
    id: 'stats',
    name: 'Big numbers',
    tagline: 'One giant number per beat, counting up, with a glitch hit.',
    inspiredBy: '"+807% in 15h" result-card reels',
    fields: [
      { key: 'headline', label: 'Headline', type: 'longtext', default: 'Krypt PolyBot\nin 4 numbers' },
      {
        key: 'stats',
        label: 'Numbers',
        type: 'lines',
        default: '$0 | price. MIT licensed.\n0 | times your wallet key leaves your PC\n3 | hard rails on every AI trader\n1 | scoreboard against the market',
        help: 'One per line: value | label. Digits in the value count up.',
      },
      { key: 'beat', label: 'Seconds per number', type: 'number', default: 1.9, min: 0.8, max: 5, step: 0.1 },
      ...COMMON.map((f) => (f.key === 'disclaimer' ? { ...f, default: 'Not financial advice. Trading carries risk.' } : f)),
    ],
  },
  {
    id: 'versus',
    name: 'Versus',
    tagline: 'Two columns, rows tick in, verdict at the end.',
    inspiredBy: '"This is paid. This is free. Same thing." comparisons',
    fields: [
      { key: 'headline', label: 'Headline', type: 'longtext', default: 'Your AI on Kalshi.\nTwo ways.' },
      { key: 'left_name', label: 'Left name', type: 'text', default: 'A script you babysit' },
      { key: 'left_price', label: 'Left price', type: 'text', default: 'your weekend' },
      { key: 'right_name', label: 'Right name', type: 'text', default: 'Krypt Trader' },
      { key: 'right_price', label: 'Right price', type: 'text', default: '$0' },
      {
        key: 'rows',
        label: 'Rows',
        type: 'lines',
        default: 'Desktop UI | no | yes\nPaper trading first | maybe | yes\nKeys stay on your PC | maybe | yes\nScored vs the market | no | yes\nHard risk rails | no | yes',
        help: 'feature | left | right. "yes"/"no" become ticks and crosses.',
      },
      { key: 'beat', label: 'Seconds per row', type: 'number', default: 0.9, min: 0.3, max: 4, step: 0.1 },
      { key: 'verdict', label: 'Verdict', type: 'text', default: 'Paper first. Live when you choose.' },
      { key: 'hold', label: 'Verdict seconds', type: 'number', default: 2, min: 0.5, max: 6, step: 0.1 },
      ...COMMON.map((f) => (f.key === 'disclaimer' ? { ...f, default: 'Not financial advice.' } : f)),
    ],
  },
  {
    id: 'terminal',
    name: 'Terminal',
    tagline: 'A dev terminal types commands and prints results under a hook.',
    inspiredBy: 'Trading-bot dashboard / GitHub repo demo reels',
    fields: [
      { key: 'headline', label: 'Hook (top)', type: 'longtext', default: 'I gave Claude a Kalshi account.\nWith fake money first.' },
      { key: 'title', label: 'Window title', type: 'text', default: 'krypt-trader — agent' },
      {
        key: 'lines',
        label: 'Lines',
        type: 'lines',
        default:
          '$ claude mcp add krypt-trader\n✓ agent server on localhost\n$ forecast FED-DEC-CUT yes 0.62\n> market 0.55 · your edge +0.07\n$ trade --paper 25\n✓ filled 25 @ 0.55 (paper)\n! scored when the market settles',
        help: '"$ " = typed command, "✓ " = success, "! " = highlight, "> " = output, anything else = plain.',
      },
      { key: 'cps', label: 'Typing speed (chars/s)', type: 'number', default: 30, min: 8, max: 120 },
      { key: 'punch', label: 'Punchline', type: 'longtext', default: 'Find out if your AI beats the market\nbefore a dollar is at risk.' },
      { key: 'hold', label: 'Punchline seconds', type: 'number', default: 2.4, min: 0.5, max: 6, step: 0.1 },
      ...COMMON.map((f) => (f.key === 'disclaimer' ? { ...f, default: 'Not financial advice.' } : f)),
    ],
  },
  {
    id: 'clip',
    name: 'Clip + hook',
    tagline: 'A screen recording with a big hook on top and captions underneath.',
    inspiredBy: 'Screen-record demo reels with top-third hooks',
    fields: [
      { key: 'video', label: 'Video', type: 'file', fileKind: 'video', default: '', help: 'Screen recording or any clip.' },
      { key: 'start', label: 'Start at (s)', type: 'number', default: 0, min: 0, max: 3600, step: 0.1 },
      { key: 'seconds', label: 'Length (s)', type: 'number', default: 12, min: 2, max: 90, step: 0.5 },
      { key: 'fit', label: 'Framing', type: 'select', default: 'blur', options: ['blur', 'cover', 'full', 'split'], help: 'blur = whole frame over a blurred copy (landscape recordings). cover = fill 9:16, slightly dimmed for the hook. full = fill 9:16 untouched (a finished vertical video made elsewhere). split = a stream clip: the facecam on top, the gameplay below.' },
      { key: 'cam', label: 'Facecam area', type: 'text', default: '', help: 'Split framing: where the streamer\'s camera is in the video, as "x,y,w,h" fractions of the frame (0.72,0.05,0.26,0.3 = top right). Empty = no camera: the gameplay fills the screen.' },
      { key: 'game', label: 'Area to show', type: 'text', default: '', help: 'Split framing: the part of the frame to show below the camera (the gameplay). Cover framing: the part of the recording that fills the screen, e.g. the one panel that matters in a wide app window (desktop text is too small to read at phone width otherwise); it can move: "0 | x,y,w,h; 8.5 | x,y,w,h" glides to each area at its time (follow the action). "x,y,w,h" fractions of the frame. Empty = the middle of the whole frame.' },
      { key: 'source', label: 'Source clip', type: 'text', default: '', help: 'The Twitch / Kick clip, or the YouTube video at the part\'s start (…&t=123s), this reel is cut from (clipping style): keeps the same clip from being used twice.' },
      { key: 'sound', label: "Keep the clip's sound", type: 'toggle', default: false, help: 'Use the audio that is in the video file (a finished video with its own voice and music).' },
      { key: 'zoom', label: 'Slow punch-in', type: 'toggle', default: true },
      { key: 'look', label: 'Text look', type: 'select', default: 'box', options: ['box', 'meme'], help: 'box = the hook and captions in solid boxes. meme = white heavy text with a black outline and no box, the way TikTok and meme pages write on video (POV reels).' },
      { key: 'headline', label: 'Hook', type: 'longtext', default: 'This app lets Claude\ntrade Kalshi on paper first' },
      { key: 'stamps', label: 'Stamps', type: 'lines', default: '', help: 'Big text slammed onto the middle of the video at a moment: "2.1 | 41 FPS", "7.5 | 144 FPS / after". "2.1-4 | text" sets how long it stays (else until the next one, at most 2.5 s); " / " adds a small line under it. Only numbers and words that are on the recording itself.' },
      { key: 'punches', label: 'Zoom punches', type: 'lines', default: '', help: 'A quick zoom onto a spot of the video: "3.2 | 0.7,0.4" zooms at 3.2 s onto the point 70% across and 40% down (fractions of the video), "3.2 | 0.7,0.4 | 2 | 1.8" = 2x for 1.8 s (default 1.7x for 1.4 s). Not in split framing.' },
      { key: 'captions', label: 'Captions', type: 'lines', default: 'connect your AI\nit researches + forecasts\npaper trades only\nscored against the market', help: 'One per line; spread evenly over the clip. Prefix "4.5 | text" to set a start time; a line with only a time ("6.2 |") clears the caption until the next one. Split framing shows them stream style: white outlined text, the word being said lit up.' },
      ...COMMON.map((f) => (f.key === 'disclaimer' ? { ...f, default: 'Not financial advice.' } : f)),
    ],
  },
  {
    id: 'narrated',
    name: 'Narrated story',
    tagline: 'A story read out over moving background footage, with big captions popping in a few words at a time. Opens on a forum post card (Reddit-style stories) or builds a greentext board.',
    inspiredBy: 'Reddit story and greentext channels: a post card, then the story narrated over gameplay with word-by-word captions',
    brandFree: true,
    fields: [
      {
        key: 'beats',
        label: 'Lines',
        type: 'lines',
        default: [
          '1 | AITA for eating my roommate\'s "labelled" leftovers after she ate mine for a month? | post | r/AmItheAsshole · u/fridge_wars_22 · 6h | 18.4K;2,113 | Am I the jerk for eating my roommate\'s labelled leftovers, after she ate mine for a month?',
          '1 | So my roommate labels everything. Milk, eggs, even one single lemon. | none',
          '1 | For a month my leftovers kept disappearing. She swore it wasn\'t her. | none',
          '1 | Then I found my lasagna container in HER room. Licked clean. | none | | | | zoom boom',
          '1 | So last night I ate her labelled curry. All of it. | none',
          '1 | Now she\'s telling the whole building I\'m a thief. | none',
          '1 | So, am I the jerk? | none',
        ].join('\n'),
        help:
          'One line per sentence or two: seconds | text | visual | a | b | say | flags. The text is what the captions show and, by default, what the voice reads (say = something else to read, - = silent); write numbers the way they are said. A line lasts as long as its voice (seconds is the least). Visuals: post (the opening post card: text = the post title, a = "r/sub · u/name · 7h", b = "upvotes;comments" like "18.4K;2,113"; the card stays up while the title is read) · green (greentext: the text is one or more lines of the post, each starting ">", separated by " / "; the lines stack up on one board across green lines in a row, the newest lit; the voice reads them without the ">") · image (a = an image file shown above the captions, b = an optional line under it) · none (just the captions over the background). Flags: pause=0.8 (silence before the line), speed=0.95. ' +
          FX_HELP,
      },
      { key: 'part', label: 'Part', type: 'text', default: '', help: 'A long story split into parts: "Part 1" shows on the post card and in the top corner. Empty = one video.' },
      { key: 'board', label: 'Board name', type: 'text', default: 'Anonymous', help: 'Greentext: the poster name at the top of the board.' },
      { key: 'board_look', label: 'Board look', type: 'select', default: 'classic', options: ['classic', 'dark'], help: 'Greentext: classic = the pale board with green text; dark = a dark board.' },
      {
        key: 'bg',
        label: 'Background',
        type: 'select',
        default: 'runner',
        options: ['runner', 'bounce', 'slice', 'video', 'none'],
        help: "What plays behind the captions. Made by Marketo itself (no footage needed, nothing to claim): runner = a neon endless-runner track, bounce = a ball bouncing inside a spinning ring, slice = colour layers sliced off a block one by one (satisfying). video = the background video file (gameplay, parkour, soap cutting: the user's own from the Backgrounds folder, or a part saved from a YouTube video with save_clip), muted and looped. none = plain dark.",
      },
      { key: 'video', label: 'Background video', type: 'file', fileKind: 'video', default: '', help: 'With background "video": the footage behind the story (muted, loops, fills the screen).' },
      { key: 'bg_start', label: 'Background starts at (s)', type: 'number', default: 0, min: 0, max: 36000, step: 0.5 },
      { key: 'bg_dim', label: 'Background dim', type: 'number', default: 0.15, min: 0, max: 0.8, step: 0.05, help: 'Darkens the background so the captions read.' },
      { key: 'captions', label: 'Captions', type: 'select', default: 'words', options: ['words', 'line', 'off'], help: 'words = 1-3 words at a time, big in the middle, popping in as they are said (the Reddit-story look); line = the whole line, the word being said lit up; off = none.' },
      { key: 'caption_color', label: 'Word colour', type: 'select', default: 'yellow', options: ['yellow', 'green', 'white', 'accent'], help: 'Colour of the word being said.' },
      { key: 'gap', label: 'Pause between lines (s)', type: 'number', default: 0.12, min: 0, max: 1.5, step: 0.02, help: 'Story channels read fast: a short gap keeps it moving.' },
      ...VOICE_FIELDS.map((f) => (f.key === 'sfx_volume' ? { ...f, default: 0.35 } : f.key === 'bed_volume' ? { ...f, default: 0.35 } : f)),
      { key: 'wps', label: 'Reading speed (words/s)', type: 'number', default: 3.2, min: 1.5, max: 8, step: 0.1, help: 'How fast the captions go when there is no voice.' },
      { key: 'motion', label: 'Motion', type: 'select', default: 'calm', options: ['calm', 'kinetic'], hidden: true },
      { key: 'loop', label: 'Loop back to the opening', type: 'toggle', default: false },
      ...BRAND_FREE,
    ],
  },
  {
    id: 'meme',
    name: 'Meme',
    tagline: 'Meme panels cut hard one after another: a picture, a clip or the mascot, with meme text, effects (zoom, shake, deep fry, flash) and meme sounds.',
    inspiredBy: 'Meme pages and shitpost edits: relatable meme slideshows, vine-boom zooms, deep-fried punchlines',
    brandFree: true,
    fields: [
      {
        key: 'beats',
        label: 'Panels',
        type: 'lines',
        default: [
          '2.4 | me opening the fridge for the 9th time hoping new food appeared | char | think',
          '2.0 | the same 3 eggs: | char | shock | | | zoom boom shake',
          '2.4 | me after doing one (1) thing today | char | cheer',
          '2.4 | my body: time for a 4 hour nap | char | sad | | | fry bass',
        ].join('\n'),
        help:
          'One panel per line: seconds | caption | media | a | b | say | flags. caption = the meme text (where it goes: layout). media: image (a = an image file: a meme template, a screenshot, a photo; b = bottom text in the impact layout) · screen (a part of the video field: a = the second to start at, optionally "@0.6,0.4 x2" to zoom there; b = bottom text in the impact layout) · char (the mascot acting it out: a = its move: talk, point, present, shrug, shock, cheer, think, wave, facepalm, sad, laugh; b = a big word over it) · text (just the caption, big: a = white, black or notes for the look). Panels cut hard, each with a pop. say = what the voice reads on that panel when voice-over is on (default the caption; - = silent). Flags: top / impact / over (this panel\'s layout), pause=0.5. ' +
          FX_HELP,
      },
      { key: 'layout', label: 'Text layout', type: 'select', default: 'top', options: ['top', 'impact', 'over'], help: 'top = the caption in a white bar above the picture (the modern meme); impact = big white outlined text at the top and the bottom of the picture (classic); over = the meme-look caption over the picture, which fills the screen (POV / reaction edits).' },
      { key: 'video', label: 'Video', type: 'file', fileKind: 'video', default: '', help: 'The clip screen panels show (a stream clip, a screen recording, the user\'s own footage).' },
      { key: 'art', label: 'Mascot look', type: 'select', default: '3d', options: ['3d', 'cartoon', 'ps2'], help: 'How the mascot in char panels looks.' },
      { key: 'char_name', label: 'Character name', type: 'text', default: 'KIP' },
      { key: 'char_color', label: 'Character colour', type: 'text', default: '#8B5CF6', help: 'Body colour as #RRGGBB.' },
      { key: 'gap', label: 'Pause after a line (s)', type: 'number', default: 0.35, min: 0, max: 1.5, step: 0.05, hidden: true },
      ...VOICE_FIELDS.map((f) => (f.key === 'voiceover' ? { ...f, default: false } : f.key === 'sfx_volume' ? { ...f, default: 0.7 } : f.key === 'bed' ? { ...f, default: 'goofy' } : f.key === 'bed_volume' ? { ...f, default: 0.55 } : f)),
      { key: 'wps', label: 'Reading speed (words/s)', type: 'number', default: 3.4, min: 1.5, max: 8, step: 0.1, hidden: true },
      { key: 'motion', label: 'Motion', type: 'select', default: 'calm', options: ['calm', 'kinetic'], hidden: true },
      { key: 'loop', label: 'Loop', type: 'toggle', default: true, help: 'No end card: the reel replays from the first panel.' },
      ...BRAND_FREE,
    ],
  },
  {
    id: 'stickman',
    name: 'Stickman',
    tagline: 'A hand-drawn stick figure (or two side by side) acting the story out: poses with anticipation and overshoot, props, a moving camera, captions, the mouth moving with the voice. Narrated "why / how" explainers, or wordless versus clips where the payoff lights up in one colour.',
    inspiredBy: 'Stickman explainer and "X vs Y" shorts: one simple figure, ink on paper or white on black, one highlight colour, a new scene every few seconds',
    fields: [
      {
        key: 'beats',
        label: 'Beats',
        type: 'lines',
        default: [
          '1 | Why does your aim feel like it\'s on ice? | shock | ?! | desk;monitor | | cam=close',
          '1 | Same hand speed. But move fast, and the cursor flies further. | point | | chart=up',
          '1 | That\'s Windows\' "Enhance pointer precision". Mouse acceleration. | think | | think=why?',
          '1 | Mouse settings, additional mouse settings, pointer options. Untick it. | type | | | | push',
          '1 | Now the same move lands in the same spot. Every time. | cheer | STEADY | | | win',
          '1 | Save this for your next match. | thumbsup',
        ].join('\n'),
        help: STICK_HELP + FX_HELP,
      },
      { key: 'labels', label: 'Figure names', type: 'text', default: '', help: 'Two figures (versus): their names over their heads, "Overthinker;Doer". Empty = one figure, or two without names.' },
      { key: 'gear', label: 'Gear', type: 'text', default: '', help: `What the figures wear, so a channel's figure is its own: "A:headphones;B:cap". Choices: ${STICK_GEAR.join(', ')}.` },
      { key: 'bg', label: 'Look', type: 'select', default: 'paper', options: ['paper', 'white', 'dark', 'chalk'], help: 'paper = black ink on warm paper; white = black on white; dark = white figures on black; chalk = chalk on a green board.' },
      { key: 'highlight', label: 'Highlight colour', type: 'select', default: 'orange', options: ['orange', 'yellow', 'red', 'green', 'cyan', 'accent'], help: 'The one colour on screen: the big word, the spoken word in the captions, the winner (win flag), charts and screens. Keep everything else ink.' },
      { key: 'line', label: 'Line weight', type: 'number', default: 16, min: 8, max: 28, step: 1, help: 'Ink thickness at full size.' },
      { key: 'captions', label: 'Captions', type: 'select', default: 'words', options: ['words', 'line', 'title', 'off'], help: 'words = 1-3 words at a time popping in as they are said; line = the whole line, the word being said lit up; title = the caption as plain text at the top (wordless versus clips); off = none.' },
      { key: 'video', label: 'Screen recording', type: 'file', fileKind: 'video', default: '', help: 'The recording laptop, monitor, phone and screen props show (record_screen or a tool\'s bundled recording).' },
      { key: 'gap', label: 'Pause between lines (s)', type: 'number', default: 0.15, min: 0, max: 1.5, step: 0.02 },
      ...VOICE_FIELDS.map((f) => (f.key === 'sfx_volume' ? { ...f, default: 0.45 } : f.key === 'bed' ? { ...f, default: 'lofi' } : f.key === 'bed_volume' ? { ...f, default: 0.35 } : f)),
      { key: 'wps', label: 'Reading speed (words/s)', type: 'number', default: 3, min: 1.5, max: 8, step: 0.1, help: 'How fast the captions go when there is no voice.' },
      { key: 'motion', label: 'Motion', type: 'select', default: 'calm', options: ['calm', 'kinetic'], hidden: true },
      { key: 'loop', label: 'Loop back to the opening', type: 'toggle', default: true, help: 'The last beat runs back into the first (no end card).' },
      ...COMMON.map((f) => (f.key === 'cta_seconds' ? { ...f, default: 0 } : f)),
    ],
  },
  {
    id: 'blox',
    name: 'Blocky avatars',
    tagline: 'One or two blocky game-style avatars in a small 3D world (a studded baseplate, a park, an obby path over lava, a city street) acting it out with stiff, snappy moves: narrated rants and stories, wordless two-avatar skits with chat bubbles, or a dance under one relatable line. Captions, a big word, name tags over the heads, a moving camera.',
    inspiredBy: 'Blocky-avatar animation shorts (the Roblox-style story, rant and skit channels): one recognisable avatar, quick cuts, a new move on every line',
    fields: [
      {
        key: 'beats',
        label: 'Beats',
        type: 'lines',
        default: [
          '1 | Your PC is not slow. It is *busy*. | shrug | BRO? | question | | cam=close',
          '1 | Every app you install asks to start with Windows. | point | | sign=START ME',
          '1 | Launchers. Updaters. Chat apps. They all said yes for you. | angry | | | | cam=low',
          '1 | So your PC starts twenty things before it starts you. | run | | | | cam=far',
          '1 | Open Task Manager. Startup apps. Turn off what you never use. | type | | | | push',
          '1 | Same PC. Faster start. | cheer | FAST | trophy | | win',
          '1 | Save this for your next fresh install. | thumbsup',
        ].join('\n'),
        help: BLOX_HELP + FX_HELP,
      },
      { key: 'names', label: 'Name tags', type: 'text', default: '', help: 'The name over each head: "Me;My PC" for two avatars, or one name. Empty = none. A ; here, or a "moveA/moveB" beat, puts two avatars on stage.' },
      { key: 'avatar', label: 'Avatar', type: 'text', default: BLOX_LOOK_A, help: `What avatar A looks like, ${BLOX_LOOK_HELP}` },
      { key: 'avatar_b', label: 'Second avatar', type: 'text', default: BLOX_LOOK_B, help: 'Avatar B (two-avatar reels), written the same way.' },
      { key: 'set', label: 'World', type: 'select', default: 'baseplate', options: [...BLOX_SETS], help: 'baseplate = a studded grey plate with a few big coloured blocks; park = grass, blocky trees, a path and a bench; obby = a rainbow path over lava with floating platforms; city = a pavement, buildings and a road.' },
      { key: 'time', label: 'Time of day', type: 'select', default: 'day', options: [...BLOX_TIMES], help: 'day, sunset, or night (stars, lit windows).' },
      { key: 'highlight', label: 'Highlight colour', type: 'select', default: 'yellow', options: ['yellow', 'green', 'orange', 'red', 'cyan', 'white', 'accent'], help: 'The big word, the spoken word in the captions, signs, the winner\'s burst and name.' },
      { key: 'captions', label: 'Captions', type: 'select', default: 'words', options: ['words', 'line', 'title', 'off'], help: 'words = 1-3 words at a time popping in as they are said; line = the whole line, the word being said lit up; title = the caption as plain text at the top (wordless skits and dances); off = none.' },
      { key: 'video', label: 'Screen recording', type: 'file', fileKind: 'video', default: '', help: 'The recording a screen prop shows (record_screen or a tool\'s bundled recording).' },
      { key: 'gap', label: 'Pause between lines (s)', type: 'number', default: 0.15, min: 0, max: 1.5, step: 0.02 },
      ...VOICE_FIELDS.map((f) => (f.key === 'sfx_volume' ? { ...f, default: 0.5 } : f.key === 'bed' ? { ...f, default: 'goofy' } : f.key === 'bed_volume' ? { ...f, default: 0.3 } : f)),
      { key: 'wps', label: 'Reading speed (words/s)', type: 'number', default: 3, min: 1.5, max: 8, step: 0.1, help: 'How fast the captions go when there is no voice.' },
      { key: 'motion', label: 'Motion', type: 'select', default: 'calm', options: ['calm', 'kinetic'], hidden: true },
      { key: 'loop', label: 'Loop back to the opening', type: 'toggle', default: true, help: 'The last beat runs back into the first (no end card).' },
      ...COMMON.map((f) => (f.key === 'cta_seconds' ? { ...f, default: 0 } : f)),
    ],
  },
  {
    id: 'slides',
    name: 'Slideshow',
    tagline: 'Slides to swipe through: a cover with the hook, one point per slide (text, a picture, or a frame of a screen recording), a closing slide. render_slides saves them as pictures for a photo post (an Instagram carousel, a TikTok photo post, Threads, Facebook, X); render_reel makes the same slides a video with music.',
    inspiredBy: 'TikTok photo slideshows and Instagram carousels: lists, step-by-steps and cheat sheets people save and send',
    fields: [
      {
        key: 'beats',
        label: 'Slides',
        type: 'lines',
        default: [
          '3 | 4 Windows settings to turn *off* today | text | WINDOWS 11 | Each one takes ten seconds',
          '3.5 | 1. Startup apps | text | | Open Task Manager / Go to Startup apps / Turn off what you never use',
          '3.5 | 2. Background recording | text | | Settings / Gaming / Captures / Record what happened: off',
          '3.5 | 3. Visual effects | text | | Search "performance" / Adjust the appearance of Windows / Adjust for best performance',
          '3.5 | 4. Pointer precision | text | | Mouse settings / Additional mouse settings / Untick Enhance pointer precision',
          '3 | Save this for your next *fresh install* | end | Save it | One PC tip a day',
        ].join('\n'),
        help:
          'One slide per line: seconds | title | kind | a | b | say | flags. seconds = how long it shows in the video version. *word* = highlight colour. Kinds: text (a = a small caps line above the title, like "STEP 1" or the topic; b = the text under it; " / " between parts makes a list) · image (a = a picture file; b = the text under it) · screen (one frame of the screen recording in the video field: a = its second; b = the text under it). A picture or a frame can show only a part of itself, so the panel that matters reads on a phone: after the file or the second, "@0.7,0.3 x2" = 2x around that point, or "@0.05,0.2,0.4,0.7" = that area (x,y of its top-left corner, then its width and height), all as fractions of the frame · photo (the TikTok photo-slideshow look: a = a picture file that fills the whole slide, the title written on it the way TikTok\'s own text looks, b = a smaller line under it; flags: pos=30 puts the text 30% down the slide (default 50), style=outline / shadow / plain / box for this slide, and to make the picture your own: "@..." crop, flip (mirrored), bw, warm, cool, grain, dim=0.3 (darker, 0-0.8), blur=8) · end (the closing slide: a = a button-like word such as "Save it", b = a line under it; the logo shows above when the reel has one). The first slide is the cover: its title is drawn biggest and is what people see in the feed, so it carries the hook. Flag over = the picture fills the whole slide with the text on top (image and screen slides). Keep each slide to one idea: a title of 2-8 words and at most 3 short lines. say = what the voice reads on that slide when voice-over is on (default: the title). ' +
          FX_HELP,
      },
      { key: 'look', label: 'Look', type: 'select', default: 'dark', options: ['dark', 'light', 'color'], help: 'dark = white text on near-black with the accent glow; light = dark text on off-white; color = white text on the accent colour.' },
      { key: 'font', label: 'Lettering', type: 'select', default: 'bold', options: ['bold', 'brand'], help: 'bold = a heavy round sans, the way text reads on TikTok and Instagram; brand = the squarer brand face.' },
      { key: 'align', label: 'Text', type: 'select', default: 'left', options: ['left', 'center'] },
      { key: 'text_style', label: 'Text on photos', type: 'select', default: 'outline', options: ['outline', 'shadow', 'plain', 'box'], help: 'How the words sit on photo slides, like TikTok\'s own text: outline = a dark edge around each letter; shadow = a soft shadow; plain = nothing; box = each line on a solid label.' },
      { key: 'text_color', label: 'Photo text colour', type: 'text', default: '#FFFFFF', help: 'The colour of the words on photo slides (hex). With box it is the label\'s colour.' },
      { key: 'text_size', label: 'Photo text size', type: 'select', default: 'medium', options: ['small', 'medium', 'large'] },
      { key: 'footer', label: 'Footer', type: 'text', default: '', help: 'A small line at the bottom of every slide: the account\'s handle ("@name"), so a slide that gets sent around still says whose it is.' },
      { key: 'counter', label: 'Slide numbers', type: 'toggle', default: true, help: '"2/6" in the bottom corner.' },
      { key: 'video', label: 'Screen recording', type: 'file', fileKind: 'video', default: '', help: 'The recording screen slides take their frame from (record_screen makes one; krypt_tools names a tool\'s bundled one).' },
      { key: 'gap', label: 'Pause after a line (s)', type: 'number', default: 0.35, min: 0, max: 1.5, step: 0.05, hidden: true },
      ...VOICE_FIELDS.map((f) => (f.key === 'voiceover' ? { ...f, default: false } : f.key === 'sfx_volume' ? { ...f, default: 0.4 } : f.key === 'bed' ? { ...f, default: 'lofi' } : f.key === 'bed_volume' ? { ...f, default: 0.5 } : f)),
      { key: 'wps', label: 'Reading speed (words/s)', type: 'number', default: 3.4, min: 1.5, max: 8, step: 0.1, hidden: true },
      { key: 'motion', label: 'Motion', type: 'select', default: 'calm', options: ['calm', 'kinetic'], hidden: true },
      { key: 'loop', label: 'Loop', type: 'toggle', default: true, help: 'The video version replays from the cover (no end card: the closing slide is the end).' },
      ...COMMON.map((f) => (f.key === 'cta_seconds' ? { ...f, default: 0 } : f)),
    ],
  },
  {
    id: 'duo',
    name: 'Ask the AI',
    tagline: 'Two low-poly 3D characters in a small room: a person asks, the AI character answers. A full-screen cold open (the claim, the question, "three parts"), then a board comes down over the top half with the parts as tabs and one animated diagram per line while the two keep talking underneath. Ends on a send-this card.',
    inspiredBy: 'Explainer reels built as a conversation with an AI character: a claim people are already talking about, answered in three named parts with a fact check last',
    fields: [
      {
        key: 'beats',
        label: 'Lines',
        type: 'lines',
        default: [
          '1 | One Windows setting is *messing with your aim*. | chip | YOUR AIM | 1 SETTING',
          '1.5 | wait, which one? | none | | | | who=a',
          '1 | Let me show you. *Three parts*. | none | | | | act=present',
          '1 | It is called *Enhance pointer precision*. On by default. | title | Enhance pointer precision | Windows mouse settings | | part=1',
          '1 | Move fast, and the cursor flies *further*. Same hand, different distance. | steps | Same hand movement;Slow swipe: short;Fast swipe: far',
          '1.5 | so it is acceleration? | none | | | | who=a',
          '1 | Exactly. *Mouse acceleration*. | stamp | ACCELERATION | built into Windows',
          '1 | Open Settings. Bluetooth and devices. Mouse. | steps | Settings;Bluetooth & devices;Mouse | | | part=2',
          '1 | Additional mouse settings, Pointer Options. *Untick it*. | steps | Additional mouse settings;Pointer Options;!Enhance pointer precision',
          '1.5 | and now I never miss? | none | | | | who=a part=3',
          '1 | No. But the same move lands in the *same spot*. Every time. | stamp | CONSISTENT | not a skill upgrade | | act=shrug',
          '3 | Send this to the friend who blames his mouse | end | Follow for *part two* | one PC fix a day',
        ].join('\n'),
        help: DUO_HELP + FX_HELP,
      },
      { key: 'parts', label: 'Parts', type: 'text', default: 'What it is;How to turn it off;Does it matter?', help: 'The board\'s tabs, ; between them (two to four, three reads best). The last one is the honest check: "Is it real?", "Does it matter?", "What it costs".' },
      { key: 'board_title', label: 'Board title', type: 'text', default: 'THE AIM FIX', help: 'Small caps line in the board\'s corner: the episode\'s name.' },
      { key: 'set', label: 'Room', type: 'select', default: 'studio', options: [...DUO_SETS], help: 'studio = a warm podcast desk with a slat wall; diner = a night booth with a neon window; terminal = a dark room lit by green screens.' },
      { key: 'sign', label: 'Wall sign', type: 'text', default: 'ASK KIP', help: 'The glowing sign on the wall: the series\' name, two or three words.' },
      { key: 'char_name', label: 'AI character name', type: 'text', default: 'KIP' },
      { key: 'char_color', label: 'AI character colour', type: 'text', default: '#8B5CF6', help: 'Body colour as #RRGGBB (the brand colour).' },
      { key: 'asker_color', label: 'Asker\'s hoodie', type: 'text', default: '#2F6F6A', help: '#RRGGBB' },
      { key: 'asker_skin', label: 'Asker\'s skin', type: 'select', default: 'brown', options: ['light', 'tan', 'brown', 'dark'] },
      { key: 'asker_voice', label: 'Asker\'s voice', type: 'text', default: '', help: 'A second voice, for the asker\'s lines only ("el:<voice id>" or the voice\'s name; the same kind of voice as the reel\'s). A new reel gets the user\'s other voice by itself: leave it alone. "none" = no second voice.' },
      { key: 'asker_speaks', label: 'Asker speaks', type: 'toggle', default: false, help: 'Only without a second voice. Off = the asker\'s lines are speech bubbles and only the AI character is heard. On = the reel\'s voice reads them too.' },
      { key: 'captions', label: 'Captions', type: 'select', default: 'line', options: ['line', 'words', 'off'], help: 'line = a few words at a time with the word being said lit up; words = one to three words popping in.' },
      { key: 'highlight', label: 'Highlight colour', type: 'select', default: 'yellow', options: ['yellow', 'accent', 'green', 'white'], help: 'The word being said, the open tab and *marked* words.' },
      { key: 'video', label: 'Screen recording', type: 'file', fileKind: 'video', default: '', help: 'The recording screen lines show on the board (record_screen makes one; krypt_tools names a tool\'s bundled one).' },
      { key: 'gap', label: 'Pause between lines (s)', type: 'number', default: 0.12, min: 0, max: 1.5, step: 0.02 },
      ...VOICE_FIELDS.map((f) => (f.key === 'sfx_volume' ? { ...f, default: 0.4 } : f.key === 'bed' ? { ...f, default: 'lofi' } : f.key === 'bed_volume' ? { ...f, default: 0.3 } : f)),
      { key: 'wps', label: 'Reading speed (words/s)', type: 'number', default: 3, min: 1.5, max: 8, step: 0.1, help: 'How fast the captions go when there is no voice.' },
      { key: 'motion', label: 'Motion', type: 'select', default: 'calm', options: ['calm', 'kinetic'], hidden: true },
      { key: 'theme', label: 'Look', type: 'select', default: 'dark', options: ['dark', 'light'], hidden: true },
      { key: 'card_by', label: 'Card maker line', type: 'text', default: 'by Krypt', help: 'Small line under the product name on card lines.' },
      ...COMMON.map((f) => (f.key === 'cta_seconds' ? { ...f, default: 0 } : f)),
    ],
  },
];

/** The band of the 1080x1920 frame a preset keeps its content in (top and bottom y): the part that makes the square, 4:5 and 2:3 pictures. */
export const contentBand = (preset: string): { top: number; bottom: number } => (preset === 'slides' ? { top: 225, bottom: 1575 } : { top: 220, bottom: 1680 });

/**
 * The seconds of a reel to save as the pictures of a photo post: one per slide, panel or beat, once everything on it
 * has landed. Empty for presets without beats (give times yourself).
 */
export function slideTimes(preset: string, f: Fields): number[] {
  if (!isVoiced(preset)) return [];
  return storyBeats(f).map((b) => Math.round((b.start + (preset === 'slides' ? b.dur - 0.05 : Math.max(b.dur - 0.6, b.dur * 0.6))) * 100) / 100);
}

export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The part of a picture or video frame a slide shows, from the end of its column: "@x,y x2" = 2x around that point,
 * "@x,y,w,h" = that area (its top-left corner and size). Fractions of the frame; nothing given = all of it.
 */
export function areaOf(a: string): Area {
  const m = /@\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+)\s*,\s*([\d.]+))?(?:\s+x\s*([\d.]+))?\s*$/i.exec(a);
  if (!m) return { x: 0, y: 0, w: 1, h: 1 };
  const c = (v: string): number => Math.min(1, Math.max(0, Number(v) || 0));
  if (m[3] !== undefined) {
    const w = Math.max(0.05, c(m[3]));
    const h = Math.max(0.05, c(m[4]));
    return { x: Math.min(c(m[1]), 1 - w), y: Math.min(c(m[2]), 1 - h), w, h };
  }
  const z = m[5] ? Math.min(4, Math.max(1, Number(m[5]) || 1)) : 2;
  const w = 1 / z;
  return { x: Math.min(1 - w, Math.max(0, c(m[1]) - w / 2)), y: Math.min(1 - w, Math.max(0, c(m[2]) - w / 2)), w, h: w };
}

/** A slide's picture column: the file path, without the area that may follow it ("shot.png @0.5,0.3 x2"). */
export function imageRef(a: string): { path: string; area: Area } {
  const m = /^(.*?)\s+(@[\d.,\sx]+)$/i.exec(a.trim());
  return m ? { path: m[1].trim(), area: areaOf(m[2]) } : { path: a.trim(), area: { x: 0, y: 0, w: 1, h: 1 } };
}

export const presetById = (id: string): PresetMeta | undefined => PRESETS.find((p) => p.id === id);

/** Whether a clip reel plays the audio that is in its video file. */
export const clipSound = (f: Fields): boolean => f.sound === true && typeof f.video === 'string' && !!f.video;

/** Whether a reel makes any sound: a voice, sound effects or music (story reels), a music file, or a clip's own audio when it is kept. Silent reels do badly on TikTok, Shorts and Reels. */
export function hasSound(preset: string, f: Fields): boolean {
  if (typeof f.music === 'string' && f.music) return true;
  if (preset === 'clip') return clipSound(f);
  if (!isVoiced(preset)) return false;
  const voiced = f.voiceover === true && rows(f, 'beats').some((r) => (r[5] ?? '').trim() !== '-');
  return voiced || f.sfx === true || (!!f.bed && f.bed !== 'none');
}


export function defaultsFor(p: PresetMeta): Fields {
  return Object.fromEntries(p.fields.map((f) => [f.key, f.default]));
}

/** Fill missing keys with defaults and coerce types to the field schema; unknown keys are dropped. */
export function normalizeFields(p: PresetMeta, given: Fields, base?: Fields): { fields: Fields; warnings: string[] } {
  const out: Fields = {};
  const warnings: string[] = [];
  for (const f of p.fields) {
    const raw = f.key in given ? given[f.key] : base && f.key in base ? base[f.key] : f.default;
    let v: FieldValue = raw;
    if (f.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      if (!Number.isFinite(n)) {
        warnings.push(`${f.key}: "${String(raw)}" isn't a number; kept ${String(f.default)}`);
        v = f.default;
      } else {
        v = Math.min(f.max ?? Infinity, Math.max(f.min ?? -Infinity, n));
      }
    } else if (f.type === 'toggle') {
      v = raw === true || raw === 'true' || raw === 1;
    } else {
      v = String(raw ?? '');
      if (f.type === 'select' && f.options && !f.options.includes(v) && !(f.key === 'voice' && isEleven(v))) {
        warnings.push(`${f.key}: "${v}" isn't one of ${f.options.join(', ')}; kept ${String(f.default)}`);
        v = f.default;
      }
    }
    out[f.key] = v;
  }
  for (const k of Object.keys(given)) if (!p.fields.some((f) => f.key === k)) warnings.push(`unknown field "${k}" ignored`);
  return { fields: out, warnings };
}

// ── Parsing + timing ───────────────────────────────────────────────────────
export const num = (f: Fields, k: string, d = 0): number => {
  const v = Number(f[k]);
  return Number.isFinite(v) ? v : d;
};
export const str = (f: Fields, k: string): string => String(f[k] ?? '');
export const rows = (f: Fields, k: string): string[][] =>
  str(f, k)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split('|').map((c) => c.trim()));

export const INTRO = 1.1; // headline-only time at the start of list/stats/versus

export interface Timing {
  /** Seconds before the end card. */
  body: number;
  cta: number;
  total: number;
}

export function timingFor(presetId: string, f: Fields): Timing {
  const cta = Math.max(0, num(f, 'cta_seconds', 2.4));
  let body = 6;
  switch (presetId) {
    case 'list':
      body = INTRO + rows(f, 'items').length * num(f, 'beat', 1.7) + num(f, 'hold', 1.6);
      break;
    case 'stats':
      body = INTRO + rows(f, 'stats').length * num(f, 'beat', 1.9);
      break;
    case 'versus':
      body = INTRO + 0.6 + rows(f, 'rows').length * num(f, 'beat', 0.9) + 0.4 + num(f, 'hold', 2);
      break;
    case 'post':
      body = 0.7 + postTyping(f) + 1.0 + num(f, 'hold', 2.2);
      break;
    case 'terminal':
      body = 0.6 + terminalSchedule(f).end + 0.8 + num(f, 'hold', 2.4);
      break;
    case 'clip':
      body = num(f, 'seconds', 12);
      break;
    case 'story':
    case 'narrated':
    case 'meme':
    case 'stickman':
    case 'blox':
    case 'duo':
    case 'slides': {
      const b = storyBeats(f);
      body = b.length ? b[b.length - 1].start + b[b.length - 1].dur : 3;
      if (f.loop === true) return { body, cta: 0, total: body };
      break;
    }
  }
  body = Math.max(1, body);
  return { body, cta, total: body + cta };
}

export const postTyping = (f: Fields): number => str(f, 'text').length / Math.max(1, num(f, 'cps', 42));

export interface TermLine {
  kind: 'cmd' | 'ok' | 'hi' | 'out' | 'plain';
  text: string;
  start: number;
  end: number;
}

/** When each terminal line starts and finishes (commands type out, output prints after a short pause). */
export function terminalSchedule(f: Fields): { lines: TermLine[]; end: number } {
  const cps = Math.max(1, num(f, 'cps', 30));
  let t = 0;
  const lines: TermLine[] = [];
  for (const raw of str(f, 'lines').split('\n')) {
    if (!raw.trim()) continue;
    const kind: TermLine['kind'] = raw.startsWith('$ ') ? 'cmd' : raw.startsWith('✓ ') ? 'ok' : raw.startsWith('! ') ? 'hi' : raw.startsWith('> ') ? 'out' : 'plain';
    const text = kind === 'plain' ? raw : raw.slice(2);
    if (kind === 'cmd') {
      const start = t + 0.25;
      const end = start + text.length / cps;
      lines.push({ kind, text, start, end });
      t = end + 0.35;
    } else {
      lines.push({ kind, text, start: t, end: t });
      t += 0.45;
    }
  }
  return { lines, end: t };
}

export function presetSummary(p: PresetMeta): string {
  const fields = p.fields
    .filter((f) => !f.hidden)
    .map((f) => `  - ${f.key} (${f.type}${f.options ? `: ${f.options.join('|')}` : ''}) — ${f.label}${f.help ? `. ${f.help}` : ''}. Default: ${JSON.stringify(f.default)}`)
    .join('\n');
  return `${p.id} — ${p.name}: ${p.tagline} (style: ${p.inspiredBy})\n${fields}`;
}

export interface StoryBeat {
  start: number;
  dur: number;
  headline: string;
  visual: string;
  a: string;
  b: string;
  /** What the voice-over reads ('' = silent). */
  say: string;
  voice: string;
  /** The reel's voice with its tuning (speed here is the reel's; `speed` is this line's). */
  tune: VoiceTune;
  speed: number;
  /** Voice clip cache key ('' = no voice). */
  key: string;
  /** The ElevenLabs clip this line is rendered with ('' = not an ElevenLabs reel). */
  elKey: string;
  /** The ElevenLabs voice that line is bought in (the reel's, or the asker's on ask reels); '' = not an ElevenLabs line. */
  elVoice: string;
  /** Length of the generated line in seconds (0 = none yet). */
  voDur: number;
  /** When the line starts, seconds into the beat (lead + any pause). */
  voStart: number;
  theme: 'light' | 'dark';
  /** Colour wipe into this beat. */
  wipe: boolean;
  /** Reel motion style: kinetic (pop-in words, zoom-through cuts, bursts) or calm (fades). */
  kinetic: boolean;
  /** Effects from its flags (meme sounds, zoom, shake, fry...). */
  fx: Fx[];
  /** Layout named in its flags (meme panels: top / impact / over), '' = the reel's. */
  layout: string;
  /** Other flags a preset reads itself (stickman and blox: cam=close, push, win=a, who=b). */
  tags: string[];
  /** When each spoken word starts, seconds into the voice clip (from ElevenLabs' timings; absent = estimate). */
  voWords?: number[];
}

/** A voice line starts VO_LEAD into its beat, and the beat holds VO_TAIL after it ends. */
export const VO_LEAD = 0.15;
export const VO_TAIL = 0.45;

/** Flag tokens: spaces between them; commas too, except inside an effect's point (zoom=0.5,0.3). */
const flagTokens = (raw: string): string[] => raw.toLowerCase().split(/\s+/).flatMap((t) => (/=\d*\.?\d+,\d/.test(t) ? [t] : t.split(','))).filter(Boolean);
const LAYOUTS = ['top', 'impact', 'over'];
/** Flags a slideshow's photo slide reads itself: where and how its text sits, and how the picture is changed. */
export const SLIDE_FLAG = /^(?:pos=\d{1,3}|style=(?:outline|shadow|plain|box)|flip|bw|warm|cool|grain|dim=\d*\.?\d+|blur=\d*\.?\d+)$/;

function beatFlags(raw: string): { theme: '' | 'light' | 'dark'; wipe: boolean; pause: number; speed: number | null; fx: Fx[]; layout: string; tags: string[] } {
  const out = { theme: '' as '' | 'light' | 'dark', wipe: false, pause: 0, speed: null as number | null, fx: [] as Fx[], layout: '', tags: [] as string[] };
  for (const tok of flagTokens(raw)) {
    const fx = parseFx(tok);
    if (fx) {
      out.fx.push(fx);
      continue;
    }
    if (LAYOUTS.includes(tok)) {
      out.layout = tok;
      continue;
    }
    if (tok === 'light' || tok === 'dark') out.theme = tok;
    else if (tok === 'wipe') out.wipe = true;
    else if (tok.startsWith('pause=')) out.pause = Math.min(3, Math.max(0, Number(tok.slice(6)) || 0));
    else if (tok.startsWith('speed=')) {
      const s = Number(tok.slice(6));
      if (Number.isFinite(s) && s > 0) out.speed = Math.min(1.5, Math.max(0.7, s));
    } else if (STICK_FLAG.test(tok) || SLIDE_FLAG.test(tok) || DUO_FLAG.test(tok) || BLOX_FLAG.test(tok)) out.tags.push(tok);
    // Anything else (an old per-line voice name) is ignored: one voice per reel.
  }
  return out;
}

/** Whether a column holds only flags (never spoken). */
const flagsOnly = (s: string): boolean => {
  const toks = flagTokens(s);
  return toks.length > 0 && toks.every((t) => /^(?:light|dark|wipe|pause=[\d.]+|speed=[\d.]+)$/.test(t) || LAYOUTS.includes(t) || STICK_FLAG.test(t) || SLIDE_FLAG.test(t) || DUO_FLAG.test(t) || BLOX_FLAG.test(t) || !!parseFx(t));
};

/** A beat row's spoken line and its flags. */
function lineOf(r: string[]): { say: string; flagsRaw: string } {
  const headline = r[1] ?? '';
  let sayRaw = (r[5] ?? '').trim();
  // Anything past the flags column (a row with one | too many) counts as flags too.
  let flagsRaw = r.slice(6).join(' ');
  // A row one column short puts its flags where the line goes; never speak them.
  if (r.length === 6 && flagsOnly(sayRaw)) {
    flagsRaw = sayRaw;
    sayRaw = '';
  }
  return { say: sayRaw === '-' ? '' : sayRaw || spokenHeadline(headline), flagsRaw };
}

/** A headline as read out: no *accent* marks; greentext lines (" / ", ">be me") as sentences. */
export function spokenHeadline(headline: string): string {
  return headline
    .replace(/\*/g, '')
    .split(/\s+\/\s+/)
    .map((x) => x.replace(/^\s*>+\s*/, '').trim())
    .filter(Boolean)
    .join('. ');
}

/** What the preview sounds like when the reel's voice is ElevenLabs ('' otherwise). */
export function elVoiceNote(beats: StoryBeat[], voice: string): string {
  if (!isEleven(voice) || !beats.some((b) => b.say)) return '';
  const name = voiceName(voice);
  if (beats.some((b) => b.say && !b.key)) return `No narration in the preview: ${name} is added when you render, so nothing is spent until then.`;
  if (beats.some((b) => b.elKey && b.key !== b.elKey)) return `The last render could not buy ${name}'s lines and used the free voice. Render again to try ${name} again.`;
  return `You're hearing ${name}, the voice the rendered reel uses.`;
}

/** Seconds an ElevenLabs line takes, before it is bought (measured: about 18 characters a second at speed 1). */
const elSpeechSecs = (say: string, speed: number): number => (0.1 + say.length / 18) / speed;

export function storyBeats(f: Fields): StoryBeat[] {
  let t = 0;
  const voiceOn = f.voiceover === true;
  const cache = voiceOn ? readVoiceCache(f.vo_cache) : null;
  const elTune = tuneFromFields(f);
  const el = isEleven(elTune.voice);
  // ElevenLabs lines are bought at render; until every line has one, the whole reel uses the free stand-in (one voice per reel).
  const standin = el ? cleanTune({ ...elTune, voice: str(f, 'voice_standin') || 'am_michael', speed: num(f, 'voice_speed', 1.2) }) : elTune;
  const elSpeed = Math.min(ELEVEN_SPEED.max, Math.max(ELEVEN_SPEED.min, num(f, 'voice_speed', 1)));
  // Ask reels, the one place a reel has two voices: the asker speaks in their own voice (asker_voice, the same kind
  // as the reel's). Without one, their lines are speech bubbles (asker_speaks off) or the reel's voice reads them too.
  const askId = f.asker_voice !== undefined ? voiceId(str(f, 'asker_voice')) : null;
  const askTune = askId && askId !== elTune.voice && isEleven(askId) === el ? cleanTune({ ...elTune, voice: askId, blend: '', blendAmount: 0 }) : null;
  const mute = f.asker_speaks === false && !askTune;
  const lineFor = (r: string[]): { say: string; flagsRaw: string; ask: VoiceTune | null } => {
    const l = lineOf(r);
    const asker = flagTokens(l.flagsRaw).includes('who=a');
    return { ...l, say: mute && asker ? '' : l.say, ask: asker ? askTune : null };
  };
  const elKeyOf = (say: string, by: VoiceTune | null): string => (el && voiceOn && say ? clipKey(by ?? elTune, elSpeed, say) : '');
  const allEl = el && voiceOn && !!cache && rows(f, 'beats').every((r) => {
    const { say, ask } = lineFor(r);
    return !say || !!cache.clips[elKeyOf(say, ask)];
  });
  // Not bought yet: the preview has no narration (timed from the text), so nobody hears a voice they did not pick.
  // Only a render that could not buy the lines (voice_free) falls back to the free voice.
  const silent = el && voiceOn && !allEl && !f.voice_free;
  const tune = el && !allEl && !silent ? standin : elTune;
  const baseSpeed = el && allEl ? elSpeed : num(f, 'voice_speed', 1.2);
  const look = str(f, 'theme') === 'dark' ? 'dark' : 'light';
  const kinetic = str(f, 'motion') !== 'calm';
  // Narrated and meme reels set their own gap between lines (story channels read fast).
  const tail = f.gap !== undefined && f.gap !== '' ? Math.min(1.5, Math.max(0, num(f, 'gap', VO_TAIL))) : VO_TAIL;
  const lead = tail < VO_TAIL ? 0.04 : VO_LEAD;
  return rows(f, 'beats').map((r) => {
    const secs = Number(r[0]);
    let dur = Number.isFinite(secs) && secs > 0 ? Math.min(12, Math.max(0.6, secs)) : 3;
    const headline = r[1] ?? '';
    const { say, flagsRaw, ask } = lineFor(r);
    const fl = beatFlags(flagsRaw);
    const speed = el && allEl ? baseSpeed : (fl.speed ?? baseSpeed);
    const elKey = elKeyOf(say, ask);
    // A render that fell back to the free voice reads both speakers in it.
    const lineTune = ask && tune === elTune ? ask : tune;
    const key = voiceOn && say && !silent ? (el && allEl ? elKey : clipKey(lineTune, speed, say)) : '';
    const vo = key ? cache?.clips[key] : undefined;
    const est = silent && say ? elSpeechSecs(say, elSpeed) : 0;
    const voStart = lead + fl.pause;
    if (vo) dur = Math.max(dur, voStart + vo.dur + tail);
    else if (est) dur = Math.max(dur, voStart + est + tail);
    else if (fl.pause) dur += fl.pause;
    const visual = (r[2] ?? 'none').toLowerCase();
    if (visual === 'poll') dur = Math.max(dur, pollEnd({ voStart, voDur: vo?.dur ?? 0 }));
    if (visual === 'chat') dur = Math.max(dur, chatEnd({ a: r[3] ?? '', voStart, voDur: vo?.dur ?? est }));
    const beat: StoryBeat = {
      start: t,
      dur,
      headline,
      visual,
      a: r[3] ?? '',
      b: r[4] ?? '',
      say,
      voice: lineTune.voice,
      tune: lineTune,
      speed,
      key,
      elKey,
      elVoice: elKey ? (ask ?? elTune).voice : '',
      voDur: vo?.dur ?? est,
      voStart,
      theme: fl.theme || look,
      wipe: fl.wipe,
      kinetic,
      fx: fl.fx,
      layout: fl.layout,
      tags: fl.tags,
      ...(vo?.words?.length ? { voWords: vo.words } : {}),
    };
    t += dur;
    return beat;
  });
}

/** Story reels with screen beats: the second of the screen recording to show at reel time t, or null (no screen beat now). */
export function storyVideoTime(f: Fields, t: number, beats = storyBeats(f), videoLen = 0, still = false): number | null {
  if (!str(f, 'video')) return null;
  // Slideshows: a screen slide is one frame of the recording, the same in the picture and in the video version.
  if (still) {
    const s = beats.find((x) => t >= x.start && t < x.start + x.dur) ?? beats[beats.length - 1];
    return s && s.visual === 'screen' ? Math.max(0, screenStart(s.a)) : null;
  }
  // Narrated reels: the background video runs under everything, looped.
  if (str(f, 'bg') === 'video') {
    const start = Math.max(0, num(f, 'bg_start', 0));
    const at = start + Math.max(0, t);
    return videoLen > start + 1 ? start + ((at - start) % (videoLen - start - 0.05)) : at;
  }
  const b = beats.find((x) => t >= x.start && t < x.start + x.dur) ?? beats[beats.length - 1];
  if (!b) return null;
  // Ask reels: the board keeps a recording running under the lines that follow the one that opened it.
  if (f.parts !== undefined) {
    const h = beats[duoLines(beats)[beats.indexOf(b)]?.held ?? -1];
    return h && h.visual === 'screen' ? Math.max(0, screenStart(h.a) + Math.min(t, b.start + b.dur) - h.start) : null;
  }
  // Story and meme screen beats: a = the start second. Stickman beats: a laptop / monitor / screen / phone prop's value.
  const from = b.visual === 'screen' ? screenStart(b.a) : stickScreenStart(b.b);
  if (from === null) return null;
  let local = Math.min(t, b.start + b.dur) - b.start;
  // A freeze effect stops the video from its time on.
  const freeze = b.fx.find((x) => x.kind === 'freeze');
  if (freeze) local = Math.min(local, freeze.at);
  return Math.max(0, from + local);
}

/** A screen beat's a: "12.5" (start second in the recording), optionally "@0.7,0.3 x2" (zoom 2x around that point of the frame). */
export function screenStart(a: string): number {
  const m = /^\s*(\d+(?:\.\d+)?)/.exec(a);
  return m ? Number(m[1]) : 0;
}
export function screenZoom(a: string): { x: number; y: number; z: number } {
  const at = /@\s*([\d.]+)\s*,\s*([\d.]+)/.exec(a);
  const z = /x\s*([\d.]+)/i.exec(a);
  return { x: at ? Math.min(1, Math.max(0, Number(at[1]))) : 0.5, y: at ? Math.min(1, Math.max(0, Number(at[2]))) : 0.5, z: z ? Math.min(4, Math.max(1, Number(z[1]))) : 1 };
}

/** Signature of the soundtrack the current beats need (voice clips at their times + effects). */
export function storyVoiceSig(f: Fields): string {
  const beats = storyBeats(f);
  const voice = beats.map((b) => `${b.key}@${(b.start + b.voStart).toFixed(3)}`).join(';');
  const sfx = f.sfx === true ? storySfx(beats).map((e) => `${e.kind}${e.t.toFixed(2)}/${(e.dur ?? 0).toFixed(2)}/${e.gain ?? 1}`).join(';') : '';
  const bed = f.bed && f.bed !== 'none' ? `${f.bed}@${num(f, 'bed_volume', 0.6)}` : '';
  return hashKey(`${voice}|${num(f, 'voice_volume', 1)}|${sfx}|${num(f, 'sfx_volume', 0.5)}|${bed}|mix5`);
}

/** The mixed soundtrack (voice + effects) if one was made for the current beats, else null. */
export function storyVoiceTrack(f: Fields): string | null {
  if (f.voiceover !== true && f.sfx !== true && (!f.bed || f.bed === 'none')) return null;
  const c = readVoiceCache(f.vo_cache);
  return c.track && c.sig === storyVoiceSig(f) ? c.track : null;
}
