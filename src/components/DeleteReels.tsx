import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { Reel } from '@shared/types';
import { GhostButton } from './ui';
import { useApp } from '../state/store';

// One place that deletes reels (Library and Studio): it asks once, says what
// goes with them, and can send the rendered videos to the Recycle Bin too.

const BIN = navigator.platform.toLowerCase().includes('win') ? 'Recycle Bin' : 'Trash';
const KEY = 'marketo.delete.files';

const remembered = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export function DeleteReelsDialog({ reels, onClose }: { reels: Reel[]; onClose: (deleted: boolean) => void }) {
  const toast = useApp((s) => s.toast);
  const [files, setFiles] = useState(remembered);
  const [busy, setBusy] = useState(false);
  const withFile = reels.filter((r) => r.renderPath).length;
  const posted = reels.filter((r) => r.status === 'posted').length;
  const many = reels.length > 1;

  const run = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      localStorage.setItem(KEY, files ? '1' : '0');
    } catch {
      /* not remembered */
    }
    const r = await window.marketo.db.deleteReels(
      reels.map((x) => x.id),
      files && withFile > 0,
    );
    setBusy(false);
    if (!r.ok || !r.data) {
      toast('error', r.message ?? 'Could not delete.');
      return onClose(false);
    }
    const d = r.data;
    if (d.failed.length) toast('warn', `Deleted ${d.deleted} reel${d.deleted === 1 ? '' : 's'}, but ${d.failed.length} video file${d.failed.length === 1 ? '' : 's'} could not be moved to the ${BIN} (open in another app?).`);
    else toast('ok', `Deleted ${d.deleted} reel${d.deleted === 1 ? '' : 's'}${d.trashed ? `. ${d.trashed} video file${d.trashed === 1 ? '' : 's'} moved to the ${BIN}` : ''}.`);
    onClose(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose(false);
      else if (e.key === 'Enter') void run();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, busy]);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose(false)}>
      <div role="dialog" aria-modal="true" className="w-[440px] max-w-[92vw] animate-pop-in rounded-2xl border border-white/10 bg-krypt-panel p-5 shadow-krypt-card">
        <div className="flex items-center gap-2 text-lg font-semibold text-white">
          <Trash2 className="h-5 w-5 text-rose-300" /> {many ? `Delete ${reels.length} reels?` : 'Delete this reel?'}
        </div>
        <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-sm text-white/85">
          {reels.slice(0, 8).map((r) => (
            <li key={r.id} className="truncate">
              {r.title} <span className="text-xs text-krypt-muted">· {r.status}</span>
            </li>
          ))}
          {reels.length > 8 && <li className="text-xs text-krypt-muted">and {reels.length - 8} more</li>}
        </ul>
        {posted > 0 && (
          <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            {posted === 1 && !many ? 'It is posted.' : `${posted} ${posted === 1 ? 'is' : 'are'} posted.`} The recorded numbers go with {many ? 'them' : 'it'}; the post on Instagram is not touched.
          </div>
        )}
        {withFile > 0 && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-white/85">
            <input type="checkbox" className="mt-0.5 accent-[#A855F7]" checked={files} onChange={(e) => setFiles(e.target.checked)} />
            <span>
              Also move the rendered video{withFile === 1 ? '' : 's'} to the {BIN} ({withFile} file{withFile === 1 ? '' : 's'})
              <span className="block text-xs text-krypt-muted">Off: the MP4{withFile === 1 ? ' stays' : 's stay'} in your output folder.</span>
            </span>
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <GhostButton onClick={() => onClose(false)}>Cancel</GhostButton>
          <GhostButton destructive disabled={busy} onClick={() => void run()}>
            <Trash2 className="h-4 w-4" /> Delete
          </GhostButton>
        </div>
      </div>
    </div>
  );
}
