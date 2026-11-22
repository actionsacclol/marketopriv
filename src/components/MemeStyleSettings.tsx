import { FolderOpen } from 'lucide-react';
import type { IgAccount } from '@shared/types';
import { TONES, TONE_ABOUT, TONE_LABEL, stylesOf, type ToneId } from '@shared/styles';
import { Card, GhostButton } from './ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// The meme styles' settings on their Styles pages (reddit, greentext, meme, dumb):
// how rough each account's videos may be, and the folders the user fills with
// their own background videos and meme pictures.

export function MemeStyleSettings({ styleId, accounts }: { styleId: string; accounts: IgAccount[] }) {
  const toast = useApp((s) => s.toast);
  const running = accounts.filter((a) => stylesOf(a).includes(styleId));
  const kind: 'backgrounds' | 'memes' = styleId === 'reddit' || styleId === 'greentext' ? 'backgrounds' : 'memes';
  const setTone = async (a: IgAccount, tone: ToneId): Promise<void> => {
    const r = await window.marketo.db.saveAccount({ id: a.id, tone });
    if (!r.ok) return toast('error', r.message ?? 'Could not save.');
    toast(tone === 'clean' ? 'ok' : 'warn', tone === 'clean' ? `${a.handle}: clean.` : `${a.handle}: ${TONE_LABEL[tone].toLowerCase()}. Swearing can limit reach on some platforms; slurs and attacks on real people are never made.`);
  };
  const open = async (): Promise<void> => {
    const r = await window.marketo.app.openMediaFolder(kind);
    if (!r.ok) toast('error', r.message ?? 'Could not open the folder.');
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <div className="text-sm font-semibold text-white">Tone</div>
        <p className="mt-1 text-xs text-krypt-muted">How rough this account's Reddit stories, greentexts, memes and dumb edits may be. Your call, per account.</p>
        <div className="mt-3 space-y-3">
          {running.length === 0 && <span className="text-xs text-krypt-muted">Switch the style on for an account first.</span>}
          {running.map((a) => {
            const cur: ToneId = a.tone ?? 'clean';
            return (
              <div key={a.id}>
                <div className="mb-1.5 text-sm text-white">{a.handle}</div>
                <div className="flex flex-wrap gap-1.5">
                  {TONES.map((t) => (
                    <button key={t} title={TONE_ABOUT[t]} onClick={() => void setTone(a, t)} className={cls('rounded-full border px-3 py-1 text-sm transition', cur === t ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-100' : 'border-white/10 text-krypt-muted hover:text-white')}>
                      {TONE_LABEL[t]}
                    </button>
                  ))}
                </div>
                <div className="mt-1 text-[11px] text-krypt-muted">{TONE_ABOUT[cur]}</div>
              </div>
            );
          })}
        </div>
      </Card>
      <Card>
        <div className="text-sm font-semibold text-white">{kind === 'backgrounds' ? 'Your background videos' : 'Your meme pictures'}</div>
        <p className="mt-1 text-xs leading-relaxed text-krypt-muted">
          {kind === 'backgrounds'
            ? 'Drop gameplay, parkour, soap cutting or any footage into the Backgrounds folder and your AI plays it behind the stories (muted, looped). Empty is fine: the hub draws its own moving backgrounds. You can also give your AI a YouTube link to use.'
            : 'Drop meme templates, reaction pictures and short clips into the Memes folder (sub-folders are fine) and your AI picks ones that fit each joke. Empty is fine: it uses the mascot and text panels.'}
        </p>
        <div className="mt-3">
          <GhostButton small onClick={() => void open()}>
            <FolderOpen className="h-3.5 w-3.5" /> Open {kind === 'backgrounds' ? 'Backgrounds' : 'Memes'} folder
          </GhostButton>
        </div>
      </Card>
    </div>
  );
}
