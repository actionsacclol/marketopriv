// Reference videos, in words: what the measurements say, and what "make it
// like this" turns into for each preset. Pure functions, shared by the MCP
// tools and the hub UI.

import { ACCENTS } from './presets';
import type { Fields, RefProfile, RefShot, RefVideo } from './types';

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const r1 = (x: number): number => Math.round(x * 10) / 10;
const pct = (x: number): string => `${Math.round(x * 100)}%`;

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

function hue(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const mx = Math.max(r, g, b);
  const d = mx - Math.min(r, g, b);
  if (!d) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The preset accent whose colours sit closest to this one on the colour wheel. */
export function nearestAccent(hex: string): string {
  const h = hue(hex);
  let best = 'krypt';
  let bestD = Infinity;
  for (const [name, stops] of Object.entries(ACCENTS)) {
    for (const s of stops) {
      const d = Math.min(Math.abs(hue(s) - h), 360 - Math.abs(hue(s) - h));
      if (d < bestD) {
        bestD = d;
        best = name;
      }
    }
  }
  return best;
}

export const aspectOf = (p: RefProfile): string => {
  const a = p.width / p.height;
  return Math.abs(a - 9 / 16) < 0.03 ? '9:16' : Math.abs(a - 1) < 0.03 ? '1:1' : Math.abs(a - 16 / 9) < 0.05 ? '16:9' : Math.abs(a - 4 / 5) < 0.03 ? '4:5' : a < 1 ? 'portrait' : 'landscape';
};

const movement = (m: number): string => (m < 0.12 ? 'still (text and graphics)' : m < 0.4 ? 'some movement' : 'a lot of movement (footage)');

/** Do its changes follow the music? Only said when the numbers are clear. */
function onBeat(p: RefProfile): boolean {
  const a = p.audio;
  return a.bpm !== null && a.beatStrength >= 0.25 && a.cutsOnBeat !== null && a.cutsOnBeat >= 0.7;
}

/** One line for lists and cards. */
export function profileLine(p: RefProfile): string {
  const cuts = p.shots.length - 1;
  const parts = [`${r1(p.seconds)}s`, aspectOf(p), `${p.sections.length} section${p.sections.length === 1 ? '' : 's'} (about ${r1(p.medianSection)}s each)`, `${cuts} hard cut${cuts === 1 ? '' : 's'}`, `${p.look} look`];
  if (!p.audio.present) parts.push('no sound');
  else if (p.audio.bpm !== null && p.audio.beatStrength >= 0.25) parts.push(`~${p.audio.bpm} BPM`);
  return parts.join(' · ');
}

const stretch = (s: RefShot, i: number): string => `${i + 1}) ${r1(s.start)}s, ${r1(s.dur)}s long${s.motion >= 0.4 ? ', moving' : ''}`;

/** What "like this" sets on a new reel of this preset, and what the AI has to do by hand. */
export function styleFor(presetId: string, p: RefProfile): { fields: Fields; guide: string[] } {
  const fields: Fields = {};
  const guide: string[] = [];
  const n = p.sections.length;
  const each = clamp(p.medianSection, 0.3, 6);
  if (p.accent) fields.accent = nearestAccent(p.accent);

  guide.push(`Length: the reference runs ${r1(p.seconds)}s. Aim for about that.`);
  guide.push(`Opening: its first frame holds ${r1(p.hookHold)}s before anything big changes. Give your hook the same time.`);

  switch (presetId) {
    case 'story': {
      if (p.look !== 'mixed') fields.theme = p.look;
      // Fast references are kinetic. A slow one may be either (pop-ins or plain fades): that shows in the pictures, not in the numbers.
      if (p.changesPerSec >= 0.8 || each < 1.6) fields.motion = 'kinetic';
      else guide.push('Motion: its sections change slowly. If the pictures show plain fades rather than words popping in, set motion to calm.');
      const secs = p.sections.slice(0, 14).map((s) => r1(clamp(s.dur, 0.8, 8)));
      guide.push(n > 1 ? `Rhythm: ${n} sections. Write about ${n} beats and set each beat's seconds from the reference, in order: ${secs.join(', ')}${n > 14 ? ', …' : ''}. (A narrated beat stretches to fit its line: keep lines short enough to fit, or turn voiceover off to hold the timing exactly.)` : `Rhythm: one continuous section with something changing about every ${r1(1 / Math.max(0.2, p.changesPerSec))}s. Keep beats short.`);
      if (p.look === 'mixed') guide.push('Look: it switches between light and dark. Use the light / dark flag on single beats where the reference switches.');
      break;
    }
    case 'list':
      if (n >= 3) fields.beat = r1(clamp(each, 0.6, 5));
      guide.push(`Rhythm: a new row every ${r1(clamp(each, 0.6, 5))}s; ${Math.max(2, n - 2)} rows fit the reference's length.`);
      break;
    case 'stats':
      if (n >= 3) fields.beat = r1(clamp(each, 0.8, 5));
      guide.push(`Rhythm: a new number every ${r1(clamp(each, 0.8, 5))}s; about ${Math.max(2, n - 1)} numbers.`);
      break;
    case 'versus':
      if (n >= 3) fields.beat = r1(clamp(each, 0.3, 4));
      guide.push(`Rhythm: a new row every ${r1(clamp(each, 0.3, 4))}s.`);
      break;
    case 'clip':
      fields.seconds = clamp(Math.round(p.seconds * 2) / 2, 2, 90);
      guide.push(`Rhythm: write about ${Math.max(2, n)} caption lines so the text changes as often as it does in the reference (it needs the user's own recording as the video).`);
      break;
    default:
      guide.push(`Rhythm: the reference changes about every ${r1(each)}s. Set this preset's typing speed and hold so its steps land at that pace.`);
  }

  if (onBeat(p)) {
    const beat = 60 / p.audio.bpm!;
    guide.push(`Music: its changes land on a ~${p.audio.bpm} BPM beat (one beat = ${beat.toFixed(2)}s). Make section lengths whole beats (${[1, 2, 4, 8].map((k) => r1(k * beat)).join(' / ')}s). If the user gives you a track at that tempo, set it as music.`);
  } else if (p.audio.present && p.audio.bpm !== null && p.audio.beatStrength >= 0.25) {
    guide.push(`Music: it has a steady ~${p.audio.bpm} BPM beat, but its changes don't follow it.`);
  }
  return { fields, guide };
}

/** Which preset is closest, said as a hint. */
function closest(p: RefProfile): string {
  if (p.motion >= 0.4) return 'It is mostly footage: the clip preset (with the user\'s own recording) is the closest. If they have no footage, story tells the same thing with graphics.';
  return 'It is mostly text and graphics: story is the closest (list, stats or versus when it is rows of items, numbers or a comparison).';
}

export const REF_RULES = 'A reference is for style only: pacing, structure, look, sound choices. Never reuse its footage, audio, wording, logo or its creator\'s name, and never present the reel as theirs.';

/** Everything an AI needs to know about a reference video, as text. */
export function refReport(r: RefVideo, presetId?: string): string {
  const p = r.profile;
  const cuts = p.shots.length - 1;
  const a = p.audio;
  const steady = a.bpm !== null && a.beatStrength >= 0.25;
  const sound = !a.present
    ? 'none (silent).'
    : `yes, silent ${pct(a.quiet)} of the time${!steady && a.quiet >= 0.2 ? ' (pauses like these usually mean someone talking; a guess from the loudness, not from hearing words)' : a.quiet < 0.03 ? ' (wall to wall: music or constant sound)' : ''}. ${
        steady ? `Steady beat about ${a.bpm} BPM${a.cutsOnBeat !== null ? `; ${pct(a.cutsOnBeat)} of its changes land on a beat` : ''}.` : 'No steady beat found.'
      }`;
  const lines = [
    `"${r.name}" (${r.id}) · ${r1(p.seconds)}s · ${p.width}×${p.height} (${aspectOf(p)})`,
    `Rhythm: ${p.sections.length} sections, typically ${r1(p.medianSection)}s (shortest ${r1(Math.min(...p.sections.map((s) => s.dur)))}s, longest ${r1(Math.max(...p.sections.map((s) => s.dur)))}s). A section ends when the picture changes a lot: a cut, or a new headline or graphic coming in. The opening holds ${r1(p.hookHold)}s. Something on screen changes about every ${r1(1 / Math.max(0.05, p.changesPerSec))}s.`,
    `Sections (start, length): ${p.sections.slice(0, 30).map(stretch).join(' · ')}${p.sections.length > 30 ? ' · …' : ''}`,
    cuts > 0 ? `Hard cuts: ${cuts}, at ${p.shots.slice(1, 31).map((s) => `${r1(s.start)}s`).join(', ')}${cuts > 30 ? ', …' : ''}.` : 'Hard cuts: none (one continuous background; the changes are text and graphics).',
    `Movement: ${movement(p.motion)}.`,
    `Look: ${p.look}. Colours: ${p.colors.map((c) => `${c.hex} ${pct(c.share)}`).join(', ') || 'n/a'}.${p.accent ? ` Accent colour ${p.accent} (closest reel accent: ${nearestAccent(p.accent)}).` : ' No accent colour stands out.'}`,
    `Sound: ${sound}`,
    r.notes ? `Notes (what the frames show): ${r.notes}` : 'Notes: none yet. If you can see the pictures, save what they show with note_reference_video (how the hook is worded and placed, caption position, size and colour, transitions, what kind of visuals). If you cannot see images, ask the user to describe it and save that.',
    closest(p),
  ];
  if (presetId) {
    const s = styleFor(presetId, p);
    lines.push(`For a ${presetId} reel, like: "${r.id}" sets ${Object.keys(s.fields).length ? Object.entries(s.fields).map(([k, v]) => `${k}=${v}`).join(', ') : 'nothing by itself'}. The rest is yours:`, ...s.guide.map((g) => `- ${g}`));
  } else {
    lines.push(`To make a reel like it: create_reel with like: "${r.id}" (it sets what a preset can take from the reference: accent, light/dark, pace) and follow the matching notes it returns.`);
  }
  lines.push(REF_RULES);
  return lines.join('\n');
}
