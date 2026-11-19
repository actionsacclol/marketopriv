import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, ScanLine } from 'lucide-react';
import { clipSound, num, storyVideoTime, storyVoiceTrack, str, timingFor } from '@shared/presets';
import type { Fields } from '@shared/types';
import { H, SAFE, W, drawReel, loadFonts, loadLogo } from '../render/engine';
import { MUSIC_UNDER_VOICE, mediaUrl, seek, videoElement, waitMeta } from '../render/media';
import '../render/presets';
import { cls } from '../lib/format';

// Live preview: the same drawReel the export uses, driven by rAF. Video (clip
// preset) and music play along and are re-synced when they drift.

/** `jump` moves the preview to a time whenever its `n` changes (the beat cards use it). */
export function ReelPlayer({ preset, fields, jump }: { preset: string; fields: Fields; jump?: { t: number; n: number } }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(true);
  const [t, setT] = useState(0);
  const [safe, setSafe] = useState(false);
  const state = useRef({ t: 0, last: 0, playing: true, preset, fields, logo: null as HTMLImageElement | null, video: null as HTMLVideoElement | null, music: null as HTMLAudioElement | null, voice: null as HTMLAudioElement | null, frame: 0, dirty: true });
  const timing = timingFor(preset, fields);

  state.current.preset = preset;
  state.current.fields = fields;
  state.current.playing = playing;
  state.current.dirty = true;

  // The reel's own logo, or the built-in one.
  const logoPath = str(fields, 'logo');
  useEffect(() => {
    let alive = true;
    void loadLogo(logoPath).then((logo) => {
      if (!alive) return;
      state.current.logo = logo;
      state.current.dirty = true;
    });
    return () => {
      alive = false;
    };
  }, [logoPath]);

  // Video for the clip preset.
  const videoPath = preset === 'clip' || preset === 'story' ? str(fields, 'video') : '';
  useEffect(() => {
    if (!videoPath) {
      state.current.video = null;
      return;
    }
    const v = videoElement(videoPath);
    state.current.video = v;
    void waitMeta(v)
      .then(() => seek(v, num(state.current.fields, 'start', 0)))
      .then(() => (state.current.dirty = true))
      .catch(() => {});
    v.addEventListener('seeked', () => (state.current.dirty = true));
    return () => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      if (state.current.video === v) state.current.video = null;
    };
  }, [videoPath]);

  // Music.
  const musicPath = str(fields, 'music');
  useEffect(() => {
    if (!musicPath) {
      state.current.music = null;
      return;
    }
    const a = new Audio(mediaUrl(musicPath));
    a.crossOrigin = 'anonymous';
    state.current.music = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      if (state.current.music === a) state.current.music = null;
    };
  }, [musicPath]);

  // Voice-over (story preset), once generated for the current beats.
  const voicePath = preset === 'story' ? storyVoiceTrack(fields) : null;
  useEffect(() => {
    if (!voicePath) {
      state.current.voice = null;
      return;
    }
    const a = new Audio(mediaUrl(voicePath));
    a.crossOrigin = 'anonymous';
    state.current.voice = a;
    return () => {
      a.pause();
      a.removeAttribute('src');
      if (state.current.voice === a) state.current.voice = null;
    };
  }, [voicePath]);

  useEffect(() => {
    let raf = 0;
    let alive = true;
    const ctx = canvas.current!.getContext('2d', { alpha: false })!;
    void loadFonts().then(() => {
      state.current.dirty = true;
    });
    const tick = (now: number): void => {
      if (!alive) return;
      const s = state.current;
      const total = timingFor(s.preset, s.fields).total;
      const dt = s.last ? (now - s.last) / 1000 : 0;
      s.last = now;
      if (s.playing) {
        s.t += dt;
        if (s.t >= total) s.t = 0;
        s.dirty = true;
      }
      const story = s.preset === 'story';
      const storyT = story && s.video ? storyVideoTime(s.fields, s.t) : null;
      const clipT = story ? (storyT ?? 0) : num(s.fields, 'start', 0) + Math.min(s.t, num(s.fields, 'seconds', 12));
      const inClip = story ? storyT !== null : s.t < num(s.fields, 'seconds', 12);
      if (s.video && s.video.readyState >= 1) {
        s.video.muted = !(s.preset === 'clip' && clipSound(s.fields));
        if (s.playing && inClip) {
          if (s.video.paused) void s.video.play().catch(() => {});
          if (Math.abs(s.video.currentTime - clipT) > 0.3) s.video.currentTime = clipT;
        } else {
          if (!s.video.paused) s.video.pause();
          if (!s.playing && Math.abs(s.video.currentTime - clipT) > 0.05) s.video.currentTime = clipT;
        }
      }
      if (s.music) s.music.volume = Math.max(0, Math.min(1, num(s.fields, 'music_volume', 0.8) * (s.voice ? MUSIC_UNDER_VOICE : 1)));
      for (const a of [s.music, s.voice]) {
        if (!a) continue;
        if (s.playing) {
          if (a.paused) void a.play().catch(() => {});
          if (Math.abs(a.currentTime - s.t) > 0.3) a.currentTime = s.t;
        } else if (!a.paused) a.pause();
      }
      if (s.dirty) {
        s.dirty = false;
        s.frame++;
        const v = s.video && s.video.readyState >= 2 && inClip ? s.video : null;
        drawReel(ctx, { preset: s.preset, fields: s.fields, t: s.t, frame: s.frame, logo: s.logo, video: v, videoSize: v ? { w: v.videoWidth, h: v.videoHeight } : null });
        setT(s.t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      state.current.video?.pause();
      state.current.music?.pause();
      state.current.voice?.pause();
    };
  }, []);

  const scrub = (v: number): void => {
    state.current.t = v;
    state.current.dirty = true;
    setT(v);
  };
  useEffect(() => {
    if (jump) scrub(jump.t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jump?.n]);

  return (
    <div className="flex h-full flex-col items-center gap-3">
      <div className="relative min-h-0 flex-1" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvas} width={W} height={H} className="h-full w-full rounded-2xl border border-white/10 bg-black shadow-krypt-card" />
        {safe && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div className="absolute inset-x-0 top-0 bg-rose-500/20" style={{ height: `${(220 / H) * 100}%` }} />
            <div className="absolute inset-x-0 bottom-0 bg-rose-500/20" style={{ height: `${(380 / H) * 100}%` }} />
            <div className="absolute right-0 bg-rose-500/20" style={{ top: `${(1100 / H) * 100}%`, bottom: `${(380 / H) * 100}%`, width: `${(120 / W) * 100}%` }} />
            <div className="absolute border border-dashed border-emerald-300/60" style={{ left: `${(SAFE.left / W) * 100}%`, right: `${((W - SAFE.right) / W) * 100}%`, top: `${(SAFE.top / H) * 100}%`, bottom: `${((H - SAFE.bottom) / H) * 100}%` }} />
          </div>
        )}
      </div>
      <div className="flex w-full max-w-[520px] items-center gap-3">
        <button onClick={() => setPlaying((p) => !p)} className="flex h-9 w-9 items-center justify-center rounded-full bg-krypt-gradient shadow-krypt-glow">
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-px" />}
        </button>
        <button onClick={() => scrub(0)} className="text-krypt-muted hover:text-white" title="Restart">
          <RotateCcw className="h-4 w-4" />
        </button>
        <input type="range" min={0} max={timing.total} step={0.01} value={Math.min(t, timing.total)} onChange={(e) => scrub(Number(e.target.value))} className="flex-1 accent-[#A855F7]" />
        <span className="w-[92px] text-right font-mono text-xs text-krypt-muted">
          {t.toFixed(1)} / {timing.total.toFixed(1)}s
        </span>
        <button onClick={() => setSafe((s) => !s)} className={cls('rounded-lg p-1.5', safe ? 'bg-white/10 text-white' : 'text-krypt-muted hover:text-white')} title="Show Instagram UI zones">
          <ScanLine className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
