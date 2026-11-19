import { hashKey } from './hash';

// How the narrator says things the dictionary gets wrong: a built-in table of
// crypto / tech words, the user's own "say it like this" list (Voices page),
// and rewrites for written forms a voice can't read ("$3B", "+12%", "krypt.cc").
// Pure text in, text out: the speech engine (src/render/voice) applies it, and
// the clip cache key carries a signature of whatever applied to a line, so a
// line only regenerates when its own pronunciation changed.

export interface SayAs {
  /** The word as written in a reel. */
  word: string;
  /** How to say it, respelled in plain words ("so-lah-nah", "krypt dot see see"). A hyphen joins syllables into one word. */
  say: string;
}

/**
 * Built-in fixes. "/…/" is Kokoro phonemes; anything else is a respelling.
 * A lowercase key matches any capitalisation; a key with capitals matches only as written.
 * Only clear misreadings belong here ("AI" read as "eye"); words people say two ways
 * (SOL, ETH) are left to the user's own list.
 */
export const BUILTIN_SAY: Record<string, string> = {
  AI: '/ˌAˈI/',
  xAI: '/ˌɛksˌAˈI/',
  openai: '/ˈOpənˌAˈI/',
  chatgpt: '/ʧˈætʤˌipˌitˈi/',
  codex: '/kˈOdɛks/',
  defi: '/dˈifˌI/',
  fomo: '/fˈOmO/',
  hodl: '/hˈɑdəl/',
  degen: '/dˈiʤɛn/',
  ethereum: '/ɪθˈɪɹiəm/',
  binance: '/bˈInæns/',
  marketo: '/mɑɹkˈɛɾO/',
  pepe: '/pˈɛpA/',
  shiba: '/ʃˈibə/',
  macos: '/mˌækOˈɛs/',
  tokenomics: '/tˌOkənˈɑmɪks/',
  ROI: '/ˌɑɹˌOˈI/',
  KOL: '/kˌAˌOˈɛl/',
  OG: '/ˌOʤˈi/',
  WIF: '/wˈɪf/',
  PnL: '/pˌiənˈɛl/',
  PNL: '/pˌiənˈɛl/',
  vs: 'versus',
};

let user: SayAs[] = [];
let table: Record<string, string> = { ...BUILTIN_SAY };
let tests: Array<{ key: string; re: RegExp }> = [];
const memo = new Map<string, { spoken: string; lexicon: Record<string, string>; sig: string }>();

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rebuild(): void {
  table = { ...BUILTIN_SAY };
  // The user's entries match any capitalisation and win over the built-in ones.
  for (const e of user) {
    const k = e.word.trim().toLowerCase();
    if (!k || !e.say.trim()) continue;
    for (const b of Object.keys(table)) if (b.toLowerCase() === k) delete table[b];
    table[k] = e.say.trim();
  }
  tests = Object.keys(table).map((key) => ({ key, re: new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(key)}(?:['’]s|s)?(?=$|[^\\p{L}\\p{N}])`, key === key.toLowerCase() ? 'iu' : 'u') }));
  memo.clear();
}
rebuild();

/** Install the user's list (main: when settings load or change; renderer: on every database update). */
export function setSayAs(list: SayAs[] | undefined): void {
  const next = (list ?? []).filter((e) => e && typeof e.word === 'string' && typeof e.say === 'string');
  if (JSON.stringify(next) === JSON.stringify(user)) return;
  user = next;
  rebuild();
}

/** Trim and de-duplicate a list from the UI (last entry for a word wins). */
export function cleanSayAs(list: SayAs[]): SayAs[] {
  const out = new Map<string, SayAs>();
  for (const e of list) {
    const word = String(e?.word ?? '').trim().slice(0, 60);
    const say = String(e?.say ?? '').trim().slice(0, 120);
    if (word && say && !/\s/.test(word)) out.set(word.toLowerCase(), { word, say });
  }
  return [...out.values()];
}

// ── Written forms → words ──────────────────────────────────────────────────
const TLD: Record<string, string> = {
  cc: 'C C', com: 'com', io: 'I O', ai: 'AI', fun: 'fun', org: 'org', net: 'net', xyz: 'X Y Z', gg: 'G G', app: 'app', co: 'co', dev: 'dev', tv: 'T V', fm: 'F M', me: 'me', so: 'so', sh: 'S H', finance: 'finance', exchange: 'exchange', trade: 'trade', bot: 'bot', pro: 'pro', live: 'live', us: 'U S', uk: 'U K',
};
const SCALE: Record<string, string> = { k: 'thousand', K: 'thousand', m: 'million', M: 'million', b: 'billion', B: 'billion', bn: 'billion', T: 'trillion' };
const UNIT: Record<string, [string, string]> = { ms: ['millisecond', 'milliseconds'], s: ['second', 'seconds'], h: ['hour', 'hours'] };

function speakable(core: string): string {
  let m = /^(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*)\.([a-z]{2,10})((?:\/[\w.-]*)*)$/i.exec(core);
  if (m && /[a-z]/i.test(m[1]) && Object.prototype.hasOwnProperty.call(TLD, m[2].toLowerCase())) {
    const path = m[3].split('/').filter(Boolean).map((p) => `slash ${p}`);
    return [m[1].split('.').join(' dot '), 'dot', TLD[m[2].toLowerCase()], ...path].join(' ');
  }
  m = /^([+\-−–])(\$?\d[\d,]*(?:\.\d+)?(?:%|x|[kKmMbB]|bn)?)$/.exec(core);
  if (m) return `${m[1] === '+' ? 'plus' : 'minus'} ${speakable(m[2])}`;
  m = /^(\$?)(\d[\d,]*(?:\.\d+)?)(k|K|m|M|b|B|bn|T)$/.exec(core);
  if (m) {
    const [, dollar, n, s] = m;
    // Without a dollar sign, "5m" may be minutes and "4K" a screen: only the clear ones are amounts.
    const amount = dollar || s === 'M' || s === 'B' || s === 'bn' || s === 'T' || s === 'k' || (s === 'K' && !['2', '4', '8'].includes(n));
    if (amount) return `${n} ${SCALE[s]}${dollar ? ' dollars' : ''}`;
  }
  m = /^(v?)(\d+(?:\.\d+){2,3})$/i.exec(core);
  if (m) return `${m[1] ? 'version ' : ''}${m[2].split('.').join(' point ')}`;
  m = /^(\d[\d,]*(?:\.\d+)?)(ms|s|h)$/.exec(core);
  if (m) return `${m[1]} ${UNIT[m[2]][m[1] === '1' ? 0 : 1]}`;
  return core;
}

const LEAD = /^["'(\[{*¿¡“‘]+/;
const TRAIL = /[,.!?;:…"')\]}*”’]+$/;

function rewrite(text: string): string {
  return text
    .split(/(\s+)/)
    .map((tok) => {
      if (!tok.trim()) return tok;
      const lead = LEAD.exec(tok)?.[0] ?? '';
      const rest = tok.slice(lead.length);
      const trail = TRAIL.exec(rest)?.[0] ?? '';
      const core = rest.slice(0, rest.length - trail.length);
      return core ? `${lead}${speakable(core)}${trail}` : tok;
    })
    .join('');
}

function resolve(text: string): { spoken: string; lexicon: Record<string, string>; sig: string } {
  const hit = memo.get(text);
  if (hit) return hit;
  const spoken = rewrite(text);
  const lexicon: Record<string, string> = {};
  for (const t of tests) if (t.re.test(spoken)) lexicon[t.key] = table[t.key];
  const keys = Object.keys(lexicon).sort();
  // Short all-caps plurals ("NFTs", "DMs") are spelled out by the engine since the same change.
  const acronyms = /(?:^|[^\p{L}\p{N}])[A-Z]{2,5}s(?=$|[^\p{L}\p{N}])/u.test(spoken);
  const sig = spoken === text && !keys.length && !acronyms ? '' : hashKey(`${spoken}|${keys.map((k) => `${k}=${lexicon[k]}`).join(';')}|${acronyms ? 'a' : ''}|p1`);
  const out = { spoken, lexicon, sig };
  if (memo.size > 4000) memo.clear();
  memo.set(text, out);
  return out;
}

/** The text handed to the speech engine. */
export const spokenText = (text: string): string => resolve(text).spoken;
/** The word overrides that apply to a line (for the engine). */
export const lexiconFor = (text: string): Record<string, string> => resolve(text).lexicon;
/** '' when a line is read as written; otherwise a signature of what was changed (part of the clip cache key). */
export const pronounceSig = (text: string): string => resolve(text).sig;
