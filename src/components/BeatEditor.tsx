import { useState } from 'react';
import { ArrowDown, ArrowUp, Code2, Copy, Play, Plus, Trash2, VolumeX } from 'lucide-react';
import { SLIDE_FLAG, parseFx } from '@shared/presets';
import { STICK_FLAG, STICK_POSES } from '@shared/stickman';
import { DUO_FLAG } from '@shared/duo';
import { BLOX_FLAG, BLOX_MOVES } from '@shared/blox';
import { MORPH_FLAG, MORPH_STATES } from '@shared/morph';
import { LECTURE_FLAG } from '@shared/lecture';
import { SPACE_FLAG } from '@shared/space';
import { CUT_FLAG, CUT_ITEMS } from '@shared/cutaway';
import { DIO_ACTIONS, DIO_FLAG, DIO_PIECES, DIO_UNDER } from '@shared/diorama';
import { PS2_FLAG, PS2_MOVES } from '@shared/ps2';
import { INK_FLAG, INK_MOVES } from '@shared/ink';
import { TV_FLAG, TV_MOVES } from '@shared/tv';
import { HOSE_FLAG, HOSE_MOVES } from '@shared/hose';
import { PIXEL_FLAG, PIXEL_MOVES } from '@shared/pixel';
import { cls } from '../lib/format';

// Story beats as cards: one card per beat instead of the raw
// "seconds | headline | visual | a | b | say | flags" text. Reads and writes
// exactly that text, so the AI, the renderer and the raw editor all agree.

interface Beat {
  secs: string;
  headline: string;
  visual: string;
  a: string;
  b: string;
  say: string;
  theme: '' | 'light' | 'dark';
  wipe: boolean;
  pause: string;
  speed: string;
  /** Other flags kept as written: effects (zoom boom shake...) and a meme panel's layout. */
  extra: string;
}

/** Each visual's two inputs (empty label = the visual doesn't use it). */
export const VISUALS: Array<{ id: string; name: string; a: string; b: string; aHint?: string; bHint?: string }> = [
  { id: 'title', name: 'Title', a: 'Big text', b: 'Small line' },
  { id: 'number', name: 'Number counting up', a: 'Number', b: 'Label', aHint: '9.3M' },
  { id: 'chart', name: 'Line chart', a: 'Values', b: 'Format', aHint: '0.2,0.5,7.3,15.1 or 2010:41;2013:7500000', bHint: '$%M, or $~ for $41 / $7.5M' },
  { id: 'bars', name: 'Bar comparison', a: 'Bars', b: 'Unit', aHint: 'Label:-9.9;*Highlight:-4.7;!Bad:82.5', bHint: '% median per copy' },
  { id: 'stamp', name: 'Verdict stamp', a: 'Verdict', b: 'Line', aHint: 'BUSTED or −9.4%' },
  { id: 'card', name: 'Product card', a: 'Title', b: 'Rows', bHint: 'row;row;row' },
  { id: 'wallet', name: 'Wallet check', a: 'Title', b: 'Rows', bHint: 'Label:value;Label:value' },
  { id: 'wallets', name: 'Wallet groups', a: 'Big text', b: 'Label' },
  { id: 'dots', name: 'Dot field', a: 'Count', b: 'Label', aHint: '10,939' },
  { id: 'flow', name: 'Money flow', a: 'Sources', b: 'Arrow label', aHint: 'A;B;C;D or a count', bHint: '983 SOL' },
  { id: 'coin', name: 'Spinning coin', a: 'Symbol', b: 'Label', aHint: '₿ or SOL', bHint: '10,000 BTC' },
  { id: 'lag', name: 'Copy lag', a: 'Leader tag', b: 'Follower tag' },
  { id: 'steps', name: 'Steps', a: 'Steps', b: '', aHint: 'One;Two;!Bad step' },
  { id: 'poll', name: 'Poll + countdown', a: 'Answers', b: 'Line', aHint: 'Copy;Skip' },
  { id: 'crosshair', name: 'Crosshair demo', a: 'Shapes', b: 'Line', aHint: 'cross;dot:#22C55E;circle' },
  { id: 'radar', name: 'Sound radar demo', a: 'Sounds', b: 'Line', aHint: 'Footsteps:left;Gunshot:right' },
  { id: 'follow', name: 'Follow button', a: 'Button text', b: 'Line' },
  { id: 'cta', name: 'End card', a: 'Title', b: 'Line' },
  { id: 'none', name: 'Text only', a: '', b: '' },
];

type Visual = (typeof VISUALS)[number];
/** Narrated reels (Reddit-style and greentext stories). */
const NARRATED_VISUALS: Visual[] = [
  { id: 'post', name: 'Post card', a: 'Community · poster · age', b: 'Votes;comments', aHint: 'r/AmItheAsshole · u/name · 6h', bHint: '18.4K;2,113' },
  { id: 'green', name: 'Greentext lines', a: '', b: '' },
  { id: 'image', name: 'Picture', a: 'Image file', b: 'Line under it' },
  { id: 'none', name: 'Captions only', a: '', b: '' },
];
/** Meme panels. */
const MEME_VISUALS: Visual[] = [
  { id: 'image', name: 'Picture', a: 'Image file', b: 'Bottom text (impact)' },
  { id: 'screen', name: 'Video part', a: 'Start second', b: 'Bottom text (impact)', aHint: '12.5 or 12.5 @0.6,0.4 x2' },
  { id: 'char', name: 'Mascot', a: 'Move', b: 'Big word', aHint: 'shock, laugh, think, cheer...' },
  { id: 'text', name: 'Text only', a: 'Look', b: '', aHint: 'white, black or notes' },
];
/** Stickman beats: a pose (or "poseA/poseB" for two figures), a big word and props. */
const STICK_VISUALS: Visual[] = STICK_POSES.map((p) => ({ id: p, name: p, a: 'Big word', b: 'Props', aHint: 'FREE', bHint: 'desk;laptop=12.5;B:phone;sign=FREE' }));
/** Blocky-avatar beats: a move (or "moveA/moveB" for two avatars), a big word and props. */
const BLOX_VISUALS: Visual[] = BLOX_MOVES.map((p) => ({ id: p, name: p, a: 'Big word', b: 'Props', aHint: 'BRO?', bHint: 'sign=FREE;B:bubble=no way;screen=12.5' }));
/** Slideshow slides: words, a picture, a frame of the screen recording, or the closing slide. */
const SLIDE_VISUALS: Visual[] = [
  { id: 'text', name: 'Words', a: 'Small line above', b: 'Text under the title', aHint: 'STEP 1', bHint: 'First part / second part' },
  { id: 'image', name: 'Picture', a: 'Picture file', b: 'Text under it', aHint: 'C:\\...\\shot.png @0.5,0.3 x2' },
  { id: 'photo', name: 'Photo with text on it', a: 'Picture file', b: 'Smaller line', aHint: 'C:\\...\\Images\\beach.jpg' },
  { id: 'screen', name: 'Recording frame', a: 'Second', b: 'Text under it', aHint: '12.5 @0.5,0.3 x2' },
  { id: 'end', name: 'Closing slide', a: 'Button word', b: 'Line under it', aHint: 'Save it' },
];
/** Ask reels: a chip in the cold open, a story diagram on the board, the closing card. */
const DUO_VISUALS: Visual[] = [
  { id: 'none', name: 'Keep the board as it is', a: '', b: '' },
  { id: 'chip', name: 'Corner chip (cold open)', a: 'Big word or number', b: 'Small tag', aHint: '$1,080', bHint: 'PER CLIP' },
  ...VISUALS.filter((v) => !['none', 'cta', 'tier', 'chat', 'crosshair', 'radar', 'wallets'].includes(v.id)),
  { id: 'end', name: 'Closing card', a: 'Next step', b: 'Small line', aHint: 'Follow for *part two*' },
];
/** UI motion: the state the shape morphs into, and its text. */
const MORPH_VISUALS: Visual[] = MORPH_STATES.map((s) => ({ id: s, name: s, a: 'Text', b: 'Second line', aHint: s === 'slider' || s === 'progress' ? '72' : 'Get started' }));
/** Lecture lines: the card that lands on the board on the at= word (keep, a diagram, or the closing card). */
const LECTURE_VISUALS: Visual[] = [
  { id: 'none', name: 'Keep the board as it is', a: '', b: '' },
  ...VISUALS.filter((v) => !['none', 'cta', 'tier', 'chat', 'crosshair', 'radar', 'wallets'].includes(v.id)),
  { id: 'screen', name: 'Screen recording', a: 'Start second', b: 'Line under it', aHint: '12.5' },
  { id: 'end', name: 'Closing card', a: 'Next step', b: 'Small line', aHint: 'Follow for *one fix a day*' },
];
/** Space what-if scenes. */
const SPACE_VISUALS: Visual[] = [
  { id: 'title', name: 'Question', a: 'The question', b: 'Small line', aHint: 'What if the Sun *vanished*?' },
  { id: 'earth', name: 'Earth', a: 'Look', b: 'Label', aHint: 'normal, dark, ice or hot' },
  { id: 'sun', name: 'Sun', a: 'Look', b: 'Label', aHint: 'normal, gone or giant' },
  { id: 'moon', name: 'Moon', a: '', b: 'Label' },
  { id: 'planet', name: 'Planet', a: 'Which', b: 'Label', aHint: 'mars, jupiter, saturn...' },
  { id: 'orbit', name: 'Orbit', a: 'gone = the Sun vanishes', b: 'Label' },
  { id: 'impact', name: 'Asteroid impact', a: 'Rock label', b: '', aHint: '10 km' },
  { id: 'blackhole', name: 'Black hole', a: 'Label', b: '' },
  { id: 'compare', name: 'Sizes side by side', a: 'Bodies', b: 'Line under them', aHint: 'earth;jupiter' },
  { id: 'number', name: 'Number counting up', a: 'Number', b: 'Label', aHint: '-18°C' },
  { id: 'clock', name: 'Timer', a: 'From', b: 'To', aHint: '0:00', bHint: '8:20' },
  { id: 'surface', name: 'Astronaut on the ground', a: 'Where', b: '', aHint: 'day, night, ice or mars' },
  { id: 'astronaut', name: 'Astronaut', a: 'Move', b: '', aHint: 'wave, point, shock or float' },
];
/** Backyard cutaway builds. */
const CUT_VISUALS: Visual[] = [
  ...CUT_ITEMS.map((s) => ({ id: s, name: s, a: 'Tag', b: 'Cost', aHint: 'Bunker', bHint: '$80,000' })),
  { id: 'none', name: 'No new build', a: '', b: '' },
];
/** PS2 cutscene: what the speaker does, the label over the shot and the props. */
const PS2_VISUALS: Visual[] = PS2_MOVES.map((m) => ({ id: m, name: m, a: 'Top label', b: 'Props', aHint: '2:14 AM', bHint: 'cup;B:phone' }));
/** Ink cartoon: what the cast does, the label over the shot and the props. */
const INK_VISUALS: Visual[] = INK_MOVES.map((m) => ({ id: m, name: m, a: 'Top label', b: 'Props', aHint: '2013', bHint: 'drive;B:cash' }));
const PIXEL_VISUALS: Visual[] = PIXEL_MOVES.map((m) => ({ id: m, name: m, a: 'Top label', b: 'Props', aHint: 'DAY 1', bHint: 'coin;B:phone' }));
const HOSE_VISUALS: Visual[] = HOSE_MOVES.map((m) => ({ id: m, name: m, a: 'Top label', b: 'Props', aHint: '1925', bHint: 'bag;B:letter' }));
const TV_VISUALS: Visual[] = TV_MOVES.map((m) => ({ id: m, name: m, a: 'Top label', b: 'Props', aHint: 'NOV 2023', bHint: 'chart-;B:laptop' }));
/** 3D diorama: pieces, underground builds and actions (join several with +). */
const DIO_VISUALS: Visual[] = [...DIO_PIECES, ...DIO_UNDER, ...DIO_ACTIONS].map((s) => ({ id: s, name: s, a: 'Tag', b: 'Number', aHint: 'HQ', bHint: '300' }));
const visualsFor = (preset: string): Visual[] => (preset === 'diorama' ? DIO_VISUALS : preset === 'tv' ? TV_VISUALS : preset === 'hose' ? HOSE_VISUALS : preset === 'pixel' ? PIXEL_VISUALS : preset === 'ink' ? INK_VISUALS : preset === 'ps2' ? PS2_VISUALS : preset === 'morph' ? MORPH_VISUALS : preset === 'lecture' ? LECTURE_VISUALS : preset === 'space' ? SPACE_VISUALS : preset === 'cutaway' ? CUT_VISUALS : preset === 'duo' ? DUO_VISUALS : preset === 'narrated' ? NARRATED_VISUALS : preset === 'meme' ? MEME_VISUALS : preset === 'stickman' ? STICK_VISUALS : preset === 'blox' ? BLOX_VISUALS : preset === 'slides' ? SLIDE_VISUALS : VISUALS);

/** Flag tokens (spaces between them; commas too, except inside an effect's point like zoom=0.5,0.3). */
const tokens = (s: string): string[] => s.split(/\s+/).flatMap((t) => (/=\d*\.?\d+,\d/.test(t) ? [t] : t.split(','))).filter(Boolean);
const KNOWN = /^(?:light|dark|wipe|pause=[\d.]+|speed=[\d.]+|top|impact|over)$/i;
const onlyFlags = (s: string): boolean => tokens(s).length > 0 && tokens(s).every((t) => KNOWN.test(t) || STICK_FLAG.test(t.toLowerCase()) || SLIDE_FLAG.test(t.toLowerCase()) || DUO_FLAG.test(t.toLowerCase()) || BLOX_FLAG.test(t.toLowerCase()) || MORPH_FLAG.test(t.toLowerCase()) || LECTURE_FLAG.test(t.toLowerCase()) || SPACE_FLAG.test(t.toLowerCase()) || CUT_FLAG.test(t.toLowerCase()) || DIO_FLAG.test(t.toLowerCase()) || PS2_FLAG.test(t.toLowerCase()) || INK_FLAG.test(t.toLowerCase()) || TV_FLAG.test(t.toLowerCase()) || HOSE_FLAG.test(t.toLowerCase()) || PIXEL_FLAG.test(t.toLowerCase()) || !!parseFx(t));

const clean = (v: string): string => v.replace(/\|/g, '/').replace(/\n/g, ' ');

function parse(text: string): Beat[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const c = l.split('|').map((x) => x.trim());
      let say = c[5] ?? '';
      let flags = c.slice(6).join(' ');
      // A row one column short has its flags where the line goes (same rule as the renderer).
      if (c.length === 6 && onlyFlags(say)) {
        flags = say;
        say = '';
      }
      const b: Beat = { secs: c[0] ?? '3', headline: c[1] ?? '', visual: (c[2] || 'none').toLowerCase(), a: c[3] ?? '', b: c[4] ?? '', say, theme: '', wipe: false, pause: '', speed: '', extra: '' };
      const extra: string[] = [];
      for (const t of tokens(flags.toLowerCase())) {
        if (t === 'light' || t === 'dark') b.theme = t;
        else if (t === 'wipe') b.wipe = true;
        else if (t.startsWith('pause=')) b.pause = t.slice(6);
        else if (t.startsWith('speed=')) b.speed = t.slice(6);
        else extra.push(t);
      }
      b.extra = extra.join(' ');
      return b;
    });
}

function serialize(beats: Beat[]): string {
  return beats
    .map((b) => {
      const flags = [b.theme, b.wipe ? 'wipe' : '', b.pause ? `pause=${b.pause}` : '', b.speed ? `speed=${b.speed}` : '', b.extra.replace(/\|/g, ' ').trim()].filter(Boolean).join(' ');
      const cols = [b.secs || '3', clean(b.headline), b.visual || 'none', clean(b.a), clean(b.b), clean(b.say), flags];
      while (cols.length > 3 && !cols[cols.length - 1]) cols.pop();
      return cols.join(' | ');
    })
    .join('\n');
}

const blankFor = (preset: string): Beat => ({ secs: preset === 'story' ? '3' : preset === 'slides' ? '3.5' : '1', headline: preset === 'story' ? 'New beat' : preset === 'slides' ? 'New slide' : 'New line', visual: preset === 'narrated' || preset === 'duo' || preset === 'lecture' || preset === 'cutaway' || preset === 'diorama' ? 'none' : preset === 'morph' ? 'button' : preset === 'space' ? 'earth' : preset === 'meme' ? 'image' : preset === 'stickman' || preset === 'blox' || preset === 'ps2' || preset === 'ink' || preset === 'pixel' || preset === 'hose' || preset === 'tv' ? 'talk' : preset === 'slides' ? 'text' : 'title', a: '', b: '', say: '', theme: '', wipe: false, pause: '', speed: '', extra: '' });

export function BeatEditor({ value, onChange, starts, onSeek, help, preset = 'story' }: { value: string; onChange: (v: string) => void; starts: number[]; onSeek: (t: number) => void; help?: string; preset?: string }) {
  const visuals = visualsFor(preset);
  const blox = preset === 'blox';
  const ink = preset === 'ink';
  const toon = preset === 'pixel' ? PIXEL_MOVES : preset === 'hose' ? HOSE_MOVES : preset === 'tv' ? TV_MOVES : null;
  const ps2 = preset === 'ps2' || ink || !!toon;
  const stick = preset === 'stickman' || blox || ps2;
  const dio = preset === 'diorama';
  // Stickman poses, avatar moves and cutscene moves are typed (two figures: "think/type"), so any text is kept as written.
  const visualOf = (id: string): Visual => (dio ? { id, name: id || 'none', a: 'Tag', b: 'Number', aHint: 'HQ', bHint: '300' } : stick ? { ...(preset === 'pixel' ? PIXEL_VISUALS : preset === 'hose' ? HOSE_VISUALS : preset === 'tv' ? TV_VISUALS : ink ? INK_VISUALS : ps2 ? PS2_VISUALS : blox ? BLOX_VISUALS : STICK_VISUALS)[0], id, name: id || 'idle' } : (visuals.find((v) => v.id === id) ?? visuals[visuals.length - 1]));
  const BLANK = blankFor(preset);
  const [raw, setRaw] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const beats = parse(value);
  const put = (next: Beat[]): void => onChange(serialize(next));
  const edit = (i: number, p: Partial<Beat>): void => put(beats.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const move = (i: number, d: -1 | 1): void => {
    const j = i + d;
    if (j < 0 || j >= beats.length) return;
    const next = [...beats];
    [next[i], next[j]] = [next[j], next[i]];
    put(next);
    setOpen(j);
  };

  if (raw)
    return (
      <div>
        <div className="mb-1 flex justify-end">
          <button onClick={() => setRaw(false)} className="text-[11px] font-semibold text-krypt-purple hover:text-white">
            Back to cards
          </button>
        </div>
        <textarea className="input min-h-[220px] resize-y font-mono text-xs leading-relaxed" rows={10} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />
        {help && <div className="mt-1 text-[11px] text-krypt-muted">{help}</div>}
      </div>
    );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-krypt-muted">
        <span>
          {beats.length} beat{beats.length === 1 ? '' : 's'} · click one to edit · <span className="text-white/70">*word*</span> = accent colour
        </span>
        <button onClick={() => setRaw(true)} className="inline-flex items-center gap-1 font-semibold text-krypt-purple hover:text-white" title="Edit the beats as text">
          <Code2 className="h-3 w-3" /> Text
        </button>
      </div>
      {beats.map((b, i) => {
        const v = visualOf(b.visual);
        const isOpen = open === i;
        const silent = b.say === '-';
        return (
          <div key={i} className={cls('rounded-xl border transition', isOpen ? 'border-krypt-purple/50 bg-krypt-purple/[0.07]' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setOpen(isOpen ? null : i);
                onSeek((starts[i] ?? 0) + 0.05);
              }}
              onKeyDown={(e) => e.key === 'Enter' && setOpen(isOpen ? null : i)}
              className="flex cursor-pointer items-center gap-2 px-3 py-2"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-krypt-gradient font-mono text-[10px] font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-white">{b.headline.replace(/\*/g, '') || <span className="text-white/30">no headline</span>}</div>
                <div className="truncate font-mono text-[10px] text-krypt-muted">
                  {(starts[i] ?? 0).toFixed(1)}s · {v.name}
                  {silent ? ' · silent' : ''}
                  {b.theme ? ` · ${b.theme}` : ''}
                  {b.wipe ? ' · wipe' : ''}
                  {b.extra ? ` · ${b.extra}` : ''}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek((starts[i] ?? 0) + 0.05);
                }}
                className="rounded-md p-1 text-krypt-muted hover:bg-white/10 hover:text-white"
                title="Preview from this beat"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
            {isOpen && (
              <div className="space-y-2 border-t border-white/5 px-3 pb-3 pt-2.5">
                <div>
                  <label className="label">Headline (on screen)</label>
                  <textarea className="input min-h-[52px] resize-y text-sm" rows={2} value={b.headline} onChange={(e) => edit(i, { headline: e.target.value })} />
                </div>
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  <div>
                    <label className="label">{dio ? 'Things (shop+person*2, -car, mow)' : ink || toon ? 'Acting (one each: talk/smug)' : ps2 ? 'Move (one each: talk/cross)' : blox ? 'Move (two avatars: sad/dance)' : stick ? 'Pose (two figures: think/type)' : 'Visual'}</label>
                    {stick || dio ? (
                      <>
                        <input className="input font-mono text-xs" list="stick-poses" value={b.visual} onChange={(e) => edit(i, { visual: e.target.value.toLowerCase() })} />
                        <datalist id="stick-poses">
                          {(dio ? [...DIO_PIECES, ...DIO_UNDER, ...DIO_ACTIONS] : toon ?? (ink ? INK_MOVES : ps2 ? PS2_MOVES : blox ? BLOX_MOVES : STICK_POSES)).map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <select className="input" value={v.id} onChange={(e) => edit(i, { visual: e.target.value })}>
                        {visuals.map((x) => (
                          <option key={x.id} value={x.id} className="bg-krypt-panel">
                            {x.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div>
                    <label className="label">Seconds</label>
                    <input type="number" min={1.2} max={12} step={0.1} className="input font-mono" value={b.secs} onChange={(e) => edit(i, { secs: e.target.value })} />
                  </div>
                </div>
                {(v.a || v.b) && (
                  <div className={cls('grid gap-2', v.a && v.b ? 'grid-cols-2' : 'grid-cols-1')}>
                    {v.a && (
                      <div>
                        <label className="label">{v.a}</label>
                        <input className="input font-mono text-xs" placeholder={v.aHint} value={b.a} onChange={(e) => edit(i, { a: e.target.value })} />
                      </div>
                    )}
                    {v.b && (
                      <div>
                        <label className="label">{v.b}</label>
                        <input className="input font-mono text-xs" placeholder={v.bHint} value={b.b} onChange={(e) => edit(i, { b: e.target.value })} />
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <label className="label flex items-center justify-between">
                    <span>Voice reads</span>
                    <button onClick={() => edit(i, { say: silent ? '' : '-' })} className={cls('inline-flex items-center gap-1 normal-case tracking-normal', silent ? 'text-amber-300' : 'text-krypt-muted hover:text-white')}>
                      <VolumeX className="h-3 w-3" /> {silent ? 'Silent' : 'Make silent'}
                    </button>
                  </label>
                  {!silent && <input className="input text-xs" placeholder="Same as the headline (write numbers as words)" value={b.say} onChange={(e) => edit(i, { say: e.target.value })} />}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-2">
                    <label className="label">Look</label>
                    <div className="flex gap-1">
                      {(['', 'light', 'dark'] as const).map((t) => (
                        <button key={t || 'reel'} onClick={() => edit(i, { theme: t })} className={cls('flex-1 rounded-lg border px-1.5 py-1 text-[11px]', b.theme === t ? 'border-krypt-purple/60 bg-krypt-purple/20 text-white' : 'border-white/10 text-krypt-muted hover:text-white')}>
                          {t || 'Reel'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label" title="Silence before the line, for suspense">
                      Pause
                    </label>
                    <input type="number" min={0} max={3} step={0.1} className="input py-1 font-mono text-xs" placeholder="0" value={b.pause} onChange={(e) => edit(i, { pause: e.target.value })} />
                  </div>
                  <div>
                    <label className="label" title="This line's voice speed">
                      Speed
                    </label>
                    <input type="number" min={0.7} max={1.5} step={0.05} className="input py-1 font-mono text-xs" placeholder="reel" value={b.speed} onChange={(e) => edit(i, { speed: e.target.value })} />
                  </div>
                </div>
                <div>
                  <label className="label" title="zoom, shake, fry, flash, freeze, slowzoom; sounds boom, horn, scratch, ding, buzzer, boing, honk, sad, bass. Add @seconds into the beat: zoom@1.2=0.5,0.3 boom@1.2">
                    Effects
                  </label>
                  <input className="input font-mono text-xs" placeholder="zoom boom shake" value={b.extra} onChange={(e) => edit(i, { extra: e.target.value })} />
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <label className="mr-auto inline-flex cursor-pointer items-center gap-1.5 text-[11px] text-krypt-muted">
                    <input type="checkbox" className="accent-[#A855F7]" checked={b.wipe} onChange={(e) => edit(i, { wipe: e.target.checked })} /> Colour wipe in
                  </label>
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded-md p-1.5 text-krypt-muted hover:bg-white/10 hover:text-white disabled:opacity-30" title="Move up">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === beats.length - 1} className="rounded-md p-1.5 text-krypt-muted hover:bg-white/10 hover:text-white disabled:opacity-30" title="Move down">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      put([...beats.slice(0, i + 1), { ...b }, ...beats.slice(i + 1)]);
                      setOpen(i + 1);
                    }}
                    className="rounded-md p-1.5 text-krypt-muted hover:bg-white/10 hover:text-white"
                    title="Duplicate"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      put(beats.filter((_, j) => j !== i));
                      setOpen(null);
                    }}
                    disabled={beats.length <= 1}
                    className="rounded-md p-1.5 text-rose-300/80 hover:bg-rose-500/10 hover:text-rose-200 disabled:opacity-30"
                    title="Delete beat"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={() => {
          put([...beats, { ...BLANK }]);
          setOpen(beats.length);
        }}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 py-2 text-xs font-semibold text-krypt-muted transition hover:border-krypt-purple/50 hover:text-white"
      >
        <Plus className="h-3.5 w-3.5" /> Add beat
      </button>
    </div>
  );
}
