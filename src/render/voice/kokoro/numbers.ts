/**
 * Numbers → English words for the G2P front end ("1990" → "nineteen
 * ninety", "3.5" → "three point five", "21st" → "twenty first"). Words are
 * space-separated (no hyphens) because the G2P looks words up one at a time.
 * Ported from Krypt Studio's analyzer (engine/crates/analyzer/src/tts/numbers.rs).
 */

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const SCALES: Array<[number, string]> = [
  [1e12, 'trillion'],
  [1e9, 'billion'],
  [1e6, 'million'],
  [1e3, 'thousand'],
];

function below100(n: number, out: string[]): void {
  if (n < 20) out.push(ONES[n]);
  else {
    out.push(TENS[Math.floor(n / 10)]);
    if (n % 10 !== 0) out.push(ONES[n % 10]);
  }
}

function below1000(n: number, out: string[]): void {
  if (n >= 100) {
    out.push(ONES[Math.floor(n / 100)], 'hundred');
    if (n % 100 !== 0) below100(n % 100, out);
  } else below100(n, out);
}

/** "one hundred twenty three". Numbers ≥ 10^15 are read digit by digit. */
export function cardinal(n: number): string {
  if (n >= 1e15) return digits(String(n));
  if (n === 0) return 'zero';
  const out: string[] = [];
  let rest = n;
  for (const [scale, name] of SCALES) {
    if (rest >= scale) {
      below1000(Math.floor(rest / scale), out);
      out.push(name);
      rest %= scale;
    }
  }
  if (rest > 0) below1000(rest, out);
  return out.join(' ');
}

/** Each digit as a word ("314" → "three one four"). */
export function digits(s: string): string {
  return [...s].filter((c) => c >= '0' && c <= '9').map((c) => ONES[+c]).join(' ');
}

/** "first", "twenty second", "one hundredth". */
export function ordinal(n: number): string {
  const c = cardinal(n);
  const i = c.lastIndexOf(' ');
  const head = i >= 0 ? c.slice(0, i + 1) : '';
  const last = i >= 0 ? c.slice(i + 1) : c;
  const irregular: Record<string, string> = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
  const word = irregular[last] ?? (last.endsWith('y') ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return head + word;
}

/** Years as spoken: 1990 → "nineteen ninety", 1905 → "nineteen oh five", 2000 → "two thousand", 2024 → "twenty twenty four". */
export function year(n: number): string {
  if (n < 1000 || n > 2999) return cardinal(n);
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if ((n >= 2000 && n <= 2009) || (lo === 0 && n % 1000 === 0)) return cardinal(n);
  const out: string[] = [];
  below100(hi, out);
  if (lo === 0) out.push('hundred');
  else if (lo < 10) out.push('oh', ONES[lo]);
  else below100(lo, out);
  return out.join(' ');
}

/** Plural of a number's last word for decades: "nineties", "twenties". */
export function plural(words: string): string {
  if (words.endsWith('y')) return `${words.slice(0, -1)}ies`;
  if (words.endsWith('x') || words.endsWith('s')) return `${words}es`;
  return `${words}s`;
}

/** A non-negative integer from plain digits (like Rust's u64 parse), else null. */
export function parseUint(s: string): number | null {
  return /^\d{1,20}$/.test(s) ? Number(s) : null;
}

/**
 * Spoken form of one numeric token (digits with optional `,` grouping, a
 * decimal part, an ordinal suffix, an `s` decade suffix or a `%`). Null when
 * the token is not a number this understands.
 */
export function spellToken(tok: string): string | null {
  const t = tok.trim();
  if (!t || !(t[0] >= '0' && t[0] <= '9')) return null;
  const lower = t.toLowerCase();
  const pct = lower.endsWith('%');
  const body = pct ? lower.slice(0, -1) : lower;
  const tail = (s: string): string => (pct ? `${s} percent` : s);
  for (const suf of ['st', 'nd', 'rd', 'th']) {
    if (body.endsWith(suf)) {
      const n = parseUint(body.slice(0, -suf.length).replace(/,/g, ''));
      return n === null ? null : tail(ordinal(n));
    }
  }
  const decade = body.endsWith("'s") ? body.slice(0, -2) : body.endsWith('s') ? body.slice(0, -1) : null;
  if (decade !== null) {
    const n = parseUint(decade);
    if (n === null) return null;
    return tail(plural(n >= 1000 && n <= 2999 ? year(n) : cardinal(n)));
  }
  const dot = body.indexOf('.');
  if (dot >= 0) {
    const int = body.slice(0, dot);
    const frac = body.slice(dot + 1);
    if (!frac || !/^\d+$/.test(frac)) return null;
    const i = int ? parseUint(int.replace(/,/g, '')) : 0;
    return i === null ? null : tail(`${cardinal(i)} point ${digits(frac)}`);
  }
  if (!/^[\d,]+$/.test(body)) return null;
  const grouped = body.includes(',');
  const digitsOnly = body.replace(/,/g, '');
  // A leading zero ("007") reads digit by digit.
  if (digitsOnly.length > 1 && digitsOnly.startsWith('0')) return tail(digits(digitsOnly));
  const n = parseUint(digitsOnly);
  if (n === null) return null;
  if (digitsOnly.length >= 16) return tail(digits(digitsOnly));
  // Four-digit numbers without grouping that look like years read as years.
  if (!grouped && !pct && digitsOnly.length === 4 && n >= 1100 && n <= 2099) return year(n);
  return tail(cardinal(n));
}
