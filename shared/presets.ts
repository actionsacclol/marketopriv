import type { FieldValue, Fields } from './types';
import { ELEVEN_SPEED, TUNE_RANGE, VOICE_IDS, cleanTune, clipKey, hashKey, isEleven, readVoiceCache, tuneFromFields, voiceName, type VoiceTune } from './voice';
import { chatEnd, pollEnd, storySfx } from './sfx';
import { ACTION_HELP, ARTS } from './character';

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
}

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
        help: 'One beat per line: seconds | headline | visual | a | b | say | flags. say = what the voice reads (default: the headline; - = silent); write numbers as words. flags (space separated): light / dark (this beat\'s look), wipe (colour wipe into the beat), pause=1.2 (silence before the line, for suspense), speed=0.95 (this line\'s pace). A beat stretches to fit its line. *word* = accent. Visuals: title (a big, b small) · number (a counts up, b label) · chart (a = values "0.2,0.5,7.3,15.1,0.6" or labelled "2010:41;2013:7500000", b = format "$%M", or "$~" for compact $41 / $7.5M / $1.26B; draws live with the labels along the bottom, red bracket on a crash) · coin (a = symbol "₿" or "SOL", b = label "10,000 BTC"; a gold coin spins in and lands) · flow (a = source labels "A;B;C;D;E" or a count, b = arrow label "983 SOL") · dots (a = count "10,939", b label; a field of dots fills while it counts) · wallet (a title, b = "Label:value;Label:value"; checking… then values) · bars (a = "Label:-9.9;*Highlight:-4.7;!Bad outcome:82.5", b unit; * = highlight, ! = red) · wallets (a big, b label) · lag (a = leader tag, b = follower tag) · steps (a = "One;Two;!Bad") · card (a title, b = "row;row") · follow (a button text, b line; a cursor clicks it) · poll (a = \"Copy;Skip\", b line; two answers and a 3-2-1 countdown, pair with pause=0.4) · stamp (a = verdict \"BUSTED\" or \"−9.4%\", b line; slams in with a hit) · crosshair (a = shapes \"cross;dot;circle;t;chevron;x;plus;lineup\", each optionally :#colour, b line; a game scene where the crosshair snaps through each shape every 0.5s, its name under it) · radar (a = sounds \"Footsteps:left;Gunshot:right;Reload:front-left\", each a name and a side: ahead, left, right, behind, front-left... or degrees, optionally :#colour; b line; a game scene with a ring round the crosshair that lights up on each sound\'s side, one sound a second, its name and side under it; footsteps amber, shots cyan; for Krypt Radar) · tier (a = "S:Item", tiers S A B C D F; each tier beat drops one item onto a tier-list board that keeps the earlier ones, b = optional line under the board) · chat (a = messages separated by ; , ">text" = sent by me on the right, others received on the left; b = the contact name; the thread carries on across chat beats with the same contact, messages pop in as the line is read) · screen (shows the screen recording in, field video: a = the second to start at, optionally "@0.7,0.3 x2" to zoom 2x around that point; b = an optional callout under it) · cta (a title, b line) · none. ' + ACTION_HELP,
      },
      { key: 'card_by', label: 'Card maker line', type: 'text', default: 'by Krypt', help: 'Small line under the product name on card beats, e.g. "by Krypt" for a Krypt tool or "by <your brand>".' },
      { key: 'video', label: 'Screen recording', type: 'file', fileKind: 'video', default: '', help: 'The recording screen beats show (record_screen makes one). Each screen beat picks its own start second.' },
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
      { key: 'bed', label: 'Background music', type: 'select', default: 'none', options: ['none', 'lofi', 'ambient', 'pulse'], help: 'Music made by Marketo itself (nothing licensed, nothing a platform can mute): lofi = dusty keys, swung drums and vinyl crackle; ambient = slow pads; pulse = a driving synth groove. It dips under the voice. The key and chords change per reel.' },
      { key: 'bed_volume', label: 'Music level', type: 'number', default: 0.6, min: 0, max: 1, step: 0.05, help: 'Level in the gaps between lines; it drops to about 40% of this while someone talks.' },
      { key: 'vo_cache', label: 'Voice cache', type: 'longtext', default: '', hidden: true },
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
      { key: 'game', label: 'Gameplay area', type: 'text', default: '', help: 'Split framing: the part of the frame to show below the camera, as "x,y,w,h" fractions. Empty = the middle of the whole frame.' },
      { key: 'source', label: 'Source clip', type: 'text', default: '', help: 'The Twitch / Kick clip this reel is cut from (clipping style): keeps the same clip from being used twice.' },
      { key: 'sound', label: "Keep the clip's sound", type: 'toggle', default: false, help: 'Use the audio that is in the video file (a finished video with its own voice and music).' },
      { key: 'zoom', label: 'Slow punch-in', type: 'toggle', default: true },
      { key: 'headline', label: 'Hook', type: 'longtext', default: 'This app lets Claude\ntrade Kalshi on paper first' },
      { key: 'captions', label: 'Captions', type: 'lines', default: 'connect your AI\nit researches + forecasts\npaper trades only\nscored against the market', help: 'One per line; spread evenly over the clip. Prefix "4.5 | text" to set a start time; a line with only a time ("6.2 |") clears the caption until the next one. Split framing shows them stream style: white outlined text, the word being said lit up.' },
      ...COMMON.map((f) => (f.key === 'disclaimer' ? { ...f, default: 'Not financial advice.' } : f)),
    ],
  },
];

export const presetById = (id: string): PresetMeta | undefined => PRESETS.find((p) => p.id === id);

/** Whether a clip reel plays the audio that is in its video file. */
export const clipSound = (f: Fields): boolean => f.sound === true && typeof f.video === 'string' && !!f.video;

/** Whether a reel makes any sound: a voice, sound effects or music (story reels), a music file, or a clip's own audio when it is kept. Silent reels do badly on TikTok, Shorts and Reels. */
export function hasSound(preset: string, f: Fields): boolean {
  if (typeof f.music === 'string' && f.music) return true;
  if (preset === 'clip') return clipSound(f);
  if (preset !== 'story') return false;
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
    case 'story': {
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
  /** Length of the generated line in seconds (0 = none yet). */
  voDur: number;
  /** When the line starts, seconds into the beat (lead + any pause). */
  voStart: number;
  theme: 'light' | 'dark';
  /** Colour wipe into this beat. */
  wipe: boolean;
  /** Reel motion style: kinetic (pop-in words, zoom-through cuts, bursts) or calm (fades). */
  kinetic: boolean;
}

/** A voice line starts VO_LEAD into its beat, and the beat holds VO_TAIL after it ends. */
export const VO_LEAD = 0.15;
export const VO_TAIL = 0.45;

function beatFlags(raw: string): { theme: '' | 'light' | 'dark'; wipe: boolean; pause: number; speed: number | null } {
  const out = { theme: '' as '' | 'light' | 'dark', wipe: false, pause: 0, speed: null as number | null };
  for (const tok of raw.toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    if (tok === 'light' || tok === 'dark') out.theme = tok;
    else if (tok === 'wipe') out.wipe = true;
    else if (tok.startsWith('pause=')) out.pause = Math.min(3, Math.max(0, Number(tok.slice(6)) || 0));
    else if (tok.startsWith('speed=')) {
      const s = Number(tok.slice(6));
      if (Number.isFinite(s) && s > 0) out.speed = Math.min(1.5, Math.max(0.7, s));
    }
    // Anything else (an old per-line voice name) is ignored: one voice per reel.
  }
  return out;
}

const FLAGS_ONLY = /^(?:(?:light|dark|wipe|pause=[\d.]+|speed=[\d.]+)[\s,]*)+$/i;

/** A beat row's spoken line and its flags. */
function lineOf(r: string[]): { say: string; flagsRaw: string } {
  const headline = r[1] ?? '';
  let sayRaw = (r[5] ?? '').trim();
  let flagsRaw = r[6] ?? '';
  // A row one column short puts its flags where the line goes; never speak them.
  if (r.length === 6 && FLAGS_ONLY.test(sayRaw)) {
    flagsRaw = sayRaw;
    sayRaw = '';
  }
  return { say: sayRaw === '-' ? '' : sayRaw || headline.replace(/\*/g, ''), flagsRaw };
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
  const elKeyOf = (say: string): string => (el && voiceOn && say ? clipKey(elTune, elSpeed, say) : '');
  const allEl = el && voiceOn && !!cache && rows(f, 'beats').every((r) => {
    const { say } = lineOf(r);
    return !say || !!cache.clips[elKeyOf(say)];
  });
  // Not bought yet: the preview has no narration (timed from the text), so nobody hears a voice they did not pick.
  // Only a render that could not buy the lines (voice_free) falls back to the free voice.
  const silent = el && voiceOn && !allEl && !f.voice_free;
  const tune = el && !allEl && !silent ? standin : elTune;
  const voice = tune.voice;
  const baseSpeed = el && allEl ? elSpeed : num(f, 'voice_speed', 1.2);
  const look = str(f, 'theme') === 'dark' ? 'dark' : 'light';
  const kinetic = str(f, 'motion') !== 'calm';
  return rows(f, 'beats').map((r) => {
    const secs = Number(r[0]);
    let dur = Number.isFinite(secs) && secs > 0 ? Math.min(12, Math.max(1.2, secs)) : 3;
    const headline = r[1] ?? '';
    const { say, flagsRaw } = lineOf(r);
    const fl = beatFlags(flagsRaw);
    const speed = el && allEl ? baseSpeed : (fl.speed ?? baseSpeed);
    const elKey = elKeyOf(say);
    const key = voiceOn && say && !silent ? (el && allEl ? elKey : clipKey(tune, speed, say)) : '';
    const vo = key ? cache?.clips[key] : undefined;
    const est = silent && say ? elSpeechSecs(say, elSpeed) : 0;
    const voStart = VO_LEAD + fl.pause;
    if (vo) dur = Math.max(dur, voStart + vo.dur + VO_TAIL);
    else if (est) dur = Math.max(dur, voStart + est + VO_TAIL);
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
      voice,
      tune,
      speed,
      key,
      elKey,
      voDur: vo?.dur ?? est,
      voStart,
      theme: fl.theme || look,
      wipe: fl.wipe,
      kinetic,
    };
    t += dur;
    return beat;
  });
}

/** Story reels with screen beats: the second of the screen recording to show at reel time t, or null (no screen beat now). */
export function storyVideoTime(f: Fields, t: number, beats = storyBeats(f)): number | null {
  if (!str(f, 'video')) return null;
  const b = beats.find((x) => t >= x.start && t < x.start + x.dur) ?? beats[beats.length - 1];
  if (!b || b.visual !== 'screen') return null;
  return Math.max(0, screenStart(b.a) + Math.min(t, b.start + b.dur) - b.start);
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
