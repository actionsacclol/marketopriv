import { useEffect, useRef, useState } from 'react';
import { Film, Volume2, VolumeX, Wand2 } from 'lucide-react';
import { EXAMPLES, type Example } from '@shared/examples';
import { presetById } from '@shared/presets';
import { Page, PrimaryButton } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Create > Examples: one finished video per style. Hover to play, click for
// sound, "Make one like this" starts a reel in Studio from the same style.

function ExampleCard({ ex, dir, have }: { ex: Example; dir: string; have: boolean }) {
  const toast = useApp((s) => s.toast);
  const go = useApp((s) => s.go);
  const video = useRef<HTMLVideoElement>(null);
  const [sound, setSound] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = (ext: string): string => window.marketo.app.mediaUrl(`${dir}\\${ex.id}.${ext}`);

  const start = (): void => void video.current?.play().catch(() => {});
  const stop = (): void => {
    if (sound || !video.current) return;
    video.current.pause();
    video.current.currentTime = 0;
  };
  const toggleSound = (): void => {
    const v = video.current;
    if (!v) return;
    const on = !sound;
    v.muted = !on;
    if (on) {
      // One example talks at a time.
      document.querySelectorAll<HTMLVideoElement>('video[data-example]').forEach((o) => {
        if (o !== v) {
          o.muted = true;
          o.pause();
        }
      });
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
    setSound(on);
  };
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const onVol = (): void => setSound(!v.muted);
    v.addEventListener('volumechange', onVol);
    return () => v.removeEventListener('volumechange', onVol);
  }, []);

  const make = async (): Promise<void> => {
    setBusy(true);
    const r = await window.marketo.db.createReel(ex.preset, `${ex.name} reel`);
    if (!r.ok || !r.data) {
      setBusy(false);
      return toast('error', r.message ?? 'Could not create the reel.');
    }
    if (Object.keys(ex.fields).length) await window.marketo.db.updateReel(r.data.id, { fields: ex.fields });
    setBusy(false);
    toast('warn', 'This starts from the example copy. Swap in your own story and numbers before you render.');
    go('studio', r.data.id);
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="relative aspect-[9/16] bg-black" onMouseEnter={start} onMouseLeave={stop}>
        {have ? (
          <>
            <video data-example ref={video} src={file('mp4')} poster={file('jpg')} muted loop playsInline preload="metadata" className="h-full w-full cursor-pointer object-cover" onClick={toggleSound} />
            <button aria-label={sound ? 'Mute' : 'Play with sound'} onClick={toggleSound} className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur hover:bg-black/80">
              {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-krypt-muted">
            <Film className="h-8 w-8" />
            <span className="text-xs">Example video not made yet</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="text-base font-semibold text-white">{ex.name}</div>
        <p className="flex-1 text-xs leading-relaxed text-krypt-muted">{ex.about}</p>
        <div className="flex flex-wrap gap-1">
          {ex.tags.map((t) => (
            <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/60">
              {t}
            </span>
          ))}
        </div>
        <PrimaryButton className="mt-1 justify-center" disabled={busy || !presetById(ex.preset)} onClick={() => void make()}>
          <Wand2 className="h-4 w-4" /> Make one like this
        </PrimaryButton>
      </div>
    </div>
  );
}

export default function Examples() {
  const [info, setInfo] = useState<{ dir: string; have: string[] } | null>(null);
  useEffect(() => void window.marketo.app.examples().then(setInfo), []);
  return (
    <Page title="Examples" subtitle="One video of every style. Hover to play, click for sound. Your AI can make any of them: just name the style.">
      {info && (
        <div className={cls('grid gap-5', 'grid-cols-[repeat(auto-fill,minmax(230px,1fr))]')}>
          {EXAMPLES.map((ex) => (
            <ExampleCard key={ex.id} ex={ex} dir={info.dir} have={info.have.includes(ex.id)} />
          ))}
        </div>
      )}
    </Page>
  );
}
