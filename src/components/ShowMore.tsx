import { useState, type ReactNode } from 'react';
import { usePerf } from '../lib/perf';
import { GhostButton } from './ui';
import { cls } from '../lib/format';

// Setup > Performance "long lists show 50 at a time": slow PCs and users with
// hundreds of accounts or thousands of sessions render one page of a list and
// grow it on demand. Off (the default), every list renders whole, as before.

export const PAGE_SIZE = 50;

/**
 * The part of `items` to render, and the "Show more" row to put under it.
 * `resetKey` is the list's filter or search: when it changes the list goes back to one page.
 */
export function useShowMore<T>(items: T[], resetKey: string | number | boolean | null = null, size = PAGE_SIZE): { shown: T[]; more: ReactNode; on: boolean } {
  const on = usePerf().pageLists;
  const [st, setSt] = useState<{ key: typeof resetKey; n: number }>({ key: resetKey, n: size });
  const n = st.key === resetKey ? st.n : size;
  if (!on || items.length <= n) return { shown: items, more: null, on };
  const left = items.length - n;
  return {
    shown: items.slice(0, n),
    more: <ShowMore left={left} size={size} onMore={() => setSt({ key: resetKey, n: n + size })} onAll={() => setSt({ key: resetKey, n: items.length })} />,
    on,
  };
}

/** "Show more (X left)" plus a "Show all" link. */
export function ShowMore({ left, size = PAGE_SIZE, onMore, onAll, className }: { left: number; size?: number; onMore: () => void; onAll: () => void; className?: string }) {
  if (left <= 0) return null;
  return (
    <div className={cls('flex items-center justify-center gap-3 py-3', className)}>
      <GhostButton small onClick={onMore}>
        Show more ({left} left)
      </GhostButton>
      {left > size && (
        <button onClick={onAll} className="text-xs text-krypt-muted hover:text-white">
          Show all
        </button>
      )}
    </div>
  );
}
