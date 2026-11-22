import { useEffect, useRef } from 'react';
import type { Reel } from '@shared/types';
import { isVoiced, storyBeats, timingFor } from '@shared/presets';
import { H, W, drawReel, loadBanner, loadFonts, loadLogo } from '../render/engine';
import { bannerOf } from '@shared/campaigns';
import { useApp } from '../state/store';
import '../render/presets';
import { cls } from '../lib/format';

// 9:16 thumbnail: the rendered MP4 when there is one (hover plays it),
// otherwise a still of the hook frame drawn by the engine.

/** The hook frame: the first beat once its words are all in (story), or a moment in for the other styles. */
function thumbTime(reel: Reel): number {
  try {
    if (isVoiced(reel.preset)) {
      const b = storyBeats(reel.fields)[0];
      if (b) return Math.max(0.6, b.start + b.dur * 0.82);
    }
    return Math.min(2.4, Math.max(0.6, timingFor(reel.preset, reel.fields).total * 0.3));
  } catch {
    return 0.6;
  }
}

export function ReelThumb({ reel, className }: { reel: Reel; className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const useVideo = !!reel.renderPath && reel.status !== 'draft';
  const THUMB_T = thumbTime(reel);
  const bannerPath = useApp((s) => bannerOf(reel, s.db?.campaigns));
  const fieldsKey = useVideo ? '' : JSON.stringify(reel.fields) + (bannerPath ?? '');

  useEffect(() => {
    if (useVideo) return;
    let alive = true;
    void (async () => {
      await loadFonts();
      const logo = await loadLogo(reel.fields.logo);
      const banner = await loadBanner(bannerPath);
      const c = canvas.current;
      if (!alive || !c) return;
      const full = document.createElement('canvas');
      full.width = W;
      full.height = H;
      drawReel(full.getContext('2d')!, { preset: reel.preset, fields: reel.fields, t: THUMB_T, frame: 0, logo, banner });
      c.getContext('2d')!.drawImage(full, 0, 0, c.width, c.height);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // Keyed on what the reel's fields say, not on the object: every db update hands over new objects, and redrawing
    // every thumbnail at full 1080x1920 on each one adds up with many reels.
  }, [reel.preset, fieldsKey, useVideo]);

  if (useVideo) {
    return (
      <video
        src={`${window.marketo.app.mediaUrl(reel.renderPath!)}#t=${THUMB_T}`}
        muted
        playsInline
        loop
        preload="metadata"
        onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})}
        onMouseLeave={(e) => {
          e.currentTarget.pause();
          e.currentTarget.currentTime = THUMB_T;
        }}
        className={cls('aspect-[9/16] w-full bg-black object-cover', className)}
      />
    );
  }
  return <canvas ref={canvas} width={270} height={480} className={cls('aspect-[9/16] w-full bg-black', className)} />;
}
