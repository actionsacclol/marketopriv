import { useState, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cls } from '../lib/format';

/**
 * A slideshow's example, shown the way it is posted: one picture at a time,
 * with arrows to swipe. The arrows are spans, not buttons, because a style's
 * tile is itself a button.
 */
export function SlidePreview({ urls, big }: { urls: string[]; big?: boolean }) {
  const [at, setAt] = useState(0);
  const n = urls.length;
  const i = Math.min(at, n - 1);
  const step = (d: number) => (e: MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
    setAt((i + d + n) % n);
  };
  const arrow = cls('absolute top-1/2 flex -translate-y-1/2 cursor-pointer items-center justify-center rounded-full border border-white/25 bg-black/65 text-white backdrop-blur hover:bg-black/85', big ? 'h-10 w-10' : 'h-8 w-8');
  return (
    <div className="relative h-full w-full select-none bg-black">
      {urls.map((u, k) => (
        <img key={u} src={u} alt="" draggable={false} loading={k === 0 ? 'eager' : 'lazy'} className={cls('absolute inset-0 h-full w-full object-cover transition-opacity duration-200', k === i ? 'opacity-100' : 'opacity-0')} />
      ))}
      <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
        {i + 1}/{n}
      </span>
      <span role="button" tabIndex={0} aria-label="Previous slide" onClick={step(-1)} className={cls(arrow, 'left-2')}>
        <ChevronLeft className={big ? 'h-5 w-5' : 'h-4 w-4'} />
      </span>
      <span role="button" tabIndex={0} aria-label="Next slide" onClick={step(1)} className={cls(arrow, 'right-2')}>
        <ChevronRight className={big ? 'h-5 w-5' : 'h-4 w-4'} />
      </span>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
        {urls.map((u, k) => (
          <span key={u} className={cls('h-1.5 rounded-full transition-all', k === i ? 'w-4 bg-white' : 'w-1.5 bg-white/45')} />
        ))}
      </div>
    </div>
  );
}

/** The addresses of an example's slide pictures (resources/examples/<id>-1.jpg ...), [] when it has none. */
export function slideUrls(m: { dir: string; slides?: Record<string, number> }, id: string): string[] {
  const n = m.slides?.[id] ?? 0;
  return Array.from({ length: n }, (_, k) => window.marketo.app.mediaUrl(`${m.dir}\\${id}-${k + 1}.jpg`));
}
