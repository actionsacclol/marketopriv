// Token ids back to text for Whisper's byte-level BPE (GPT-2 style). Only
// decoding is needed, so no merges: each vocab entry is a string of stand-in
// characters, one per byte (GPT-2's bytes_to_unicode table), and the bytes
// of a run of tokens are decoded as UTF-8 together, because one character of
// Japanese or an emoji is often split across several tokens.

/** GPT-2's byte <-> printable-character table, inverted: stand-in char code -> byte. */
const BYTE_OF: Map<number, number> = (() => {
  const keep: number[] = [];
  for (let b = 0x21; b <= 0x7e; b++) keep.push(b);
  for (let b = 0xa1; b <= 0xac; b++) keep.push(b);
  for (let b = 0xae; b <= 0xff; b++) keep.push(b);
  const map = new Map<number, number>();
  for (const b of keep) map.set(b, b);
  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (keep.includes(b)) continue;
    map.set(256 + n, b);
    n++;
  }
  return map;
})();

export class Tokenizer {
  private readonly bytes: Array<Uint8Array | undefined> = [];

  /** `vocab` is vocab.json: token string -> id. */
  constructor(vocab: Record<string, number>) {
    for (const [tok, id] of Object.entries(vocab)) {
      const out = new Uint8Array(tok.length);
      let n = 0;
      for (const ch of tok) {
        const b = BYTE_OF.get(ch.codePointAt(0)!);
        if (b !== undefined) out[n++] = b;
      }
      this.bytes[id] = out.subarray(0, n);
    }
  }

  /** Text of these ids; ids with no vocab entry (special tokens, timestamps) are skipped. */
  decode(ids: readonly number[]): string {
    const parts: Uint8Array[] = [];
    let len = 0;
    for (const id of ids) {
      const b = this.bytes[id];
      if (!b) continue;
      parts.push(b);
      len += b.length;
    }
    const all = new Uint8Array(len);
    let off = 0;
    for (const p of parts) {
      all.set(p, off);
      off += p.length;
    }
    return new TextDecoder('utf-8').decode(all);
  }
}
