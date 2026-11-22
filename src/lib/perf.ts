import { useSyncExternalStore } from 'react';
import { perfOf, type PerfSettings } from '@shared/perf';
import { setGlassQuality } from '../components/glass/glassQuality';

// Setup > Performance, in the window: one copy of the machine-wide settings, kept current by the main process.
// Applies the visual setting to the page (glass quality, and the flat look as a class on <html>).

let current: PerfSettings = {};
let snap = perfOf(current);
const listeners = new Set<() => void>();

function apply(p: PerfSettings): void {
  current = p;
  snap = perfOf(p);
  const v = snap.visuals;
  setGlassQuality(v === 'flat' ? 'frost' : v);
  try {
    document.documentElement.classList.toggle('perf-flat', v === 'flat');
  } catch {
    /* no document */
  }
  listeners.forEach((l) => l());
}

let started = false;
export function startPerf(): void {
  if (started || typeof window === 'undefined' || !window.marketo?.perf) return;
  started = true;
  void window.marketo.perf.get().then(apply).catch(() => {});
  window.marketo.perf.onChanged(apply);
}

/** The settings right now (renders read them when they start). */
export const perfNow = (): ReturnType<typeof perfOf> => snap;

export function usePerf(): ReturnType<typeof perfOf> {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => snap,
    () => snap,
  );
}

/** Saves a change (every profile window follows it). */
export async function setPerf(patch: PerfSettings): Promise<void> {
  apply(await window.marketo.perf.set(patch));
}
