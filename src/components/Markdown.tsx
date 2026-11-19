import type { ReactNode } from 'react';

// Just enough Markdown for the research notes: headings, paragraphs, lists,
// task lists, tables, code fences, quotes, **bold**, *italic*, `code`, links.
// Builds React elements (no innerHTML).

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|\*[^*\s][^*]*\*|https?:\/\/[^\s)]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k} className="font-semibold text-white">{inline(t.slice(2, -2), i)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.85em] text-krypt-purple">{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const [, label, href] = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(t)!;
      out.push(<Link key={k} href={href}>{label}</Link>);
    } else if (t.startsWith('http')) out.push(<Link key={k} href={t}>{t}</Link>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  const external = /^https?:\/\//.test(href);
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (external) void window.marketo.app.openExternal(href);
      }}
      className={external ? 'text-krypt-purple underline decoration-krypt-purple/40 underline-offset-2 hover:decoration-krypt-purple' : 'text-white/80'}
    >
      {children}
    </a>
  );
}

const cells = (row: string): string[] => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = blocks.length;
    if (!line.trim()) {
      i++;
    } else if (line.startsWith('```')) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      i++;
      blocks.push(<pre key={k} className="my-3 overflow-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-white/80">{body.join('\n')}</pre>);
    } else if (/^#{1,4}\s/.test(line)) {
      const level = /^#+/.exec(line)![0].length;
      const text = line.replace(/^#+\s/, '');
      const cls = ['', 'mb-3 text-2xl font-bold text-white', 'mb-2 mt-8 text-lg font-semibold text-white', 'mb-2 mt-5 text-sm font-semibold uppercase tracking-[0.14em] text-krypt-muted', 'mb-1 mt-4 font-semibold'][level];
      blocks.push(<div key={k} className={cls}>{inline(text, k)}</div>);
      i++;
    } else if (line.startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={k} className="my-3 border-l-2 border-krypt-purple pl-4 text-white/85">{inline(body.join(' '), k)}</blockquote>);
    } else if (line.trim().startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) rows.push(lines[i++]);
      const [head, , ...body] = rows;
      blocks.push(
        <div key={k} className="my-3 overflow-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wider text-krypt-muted">
              <tr>{cells(head).map((c, j) => <th key={j} className="px-3 py-2 font-semibold">{inline(c, j)}</th>)}</tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="border-t border-white/5 align-top">
                  {cells(r).map((c, j) => <td key={j} className="px-3 py-2 text-white/80">{inline(c, ri * 100 + j)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    } else if (/^\s*([-*]|\d+\.)\s/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: Array<{ text: string; depth: number }> = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s/.test(lines[i])) {
        const depth = /^\s*/.exec(lines[i])![0].length >= 2 ? 1 : 0;
        items.push({ text: lines[i].replace(/^\s*([-*]|\d+\.)\s/, ''), depth });
        i++;
      }
      const Tag = ordered ? 'ol' : 'ul';
      blocks.push(
        <Tag key={k} className={`my-2 space-y-1.5 pl-5 text-white/80 ${ordered ? 'list-decimal' : 'list-disc'} marker:text-krypt-purple`}>
          {items.map((it, j) => {
            const task = /^\[( |x)\]\s/i.exec(it.text);
            return (
              <li key={j} className={it.depth ? 'ml-5' : ''} style={task ? { listStyle: 'none', marginLeft: '-1.25rem' } : undefined}>
                {task ? (
                  <span className="flex gap-2">
                    <span className="mt-1 inline-block h-3.5 w-3.5 shrink-0 rounded border border-white/30" />
                    <span>{inline(it.text.slice(4), j)}</span>
                  </span>
                ) : (
                  inline(it.text, j)
                )}
              </li>
            );
          })}
        </Tag>,
      );
    } else {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim() && !/^(#|>|\||```|\s*([-*]|\d+\.)\s)/.test(lines[i])) body.push(lines[i++]);
      blocks.push(<p key={k} className="my-2 leading-relaxed text-white/80">{inline(body.join(' '), k)}</p>);
    }
  }
  return <div className="max-w-[860px] text-sm">{blocks}</div>;
}
