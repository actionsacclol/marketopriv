import { useSyncExternalStore } from 'react';

/**
 * "Is someone using the hub right now?" The hub's window is focused and was
 * touched (mouse, keys, wheel) in the last IDLE_MS.
 *
 * Decorative motion (the aurora drift behind the glass, Kip's idle animation)
 * runs only while this is true. The hub mostly sits open on a screen between
 * autopilot runs, and a moving backdrop under the frosted glass makes every
 * panel re-blur every frame: measured at 70-140% of a CPU core on its own
 * (2026-11-18), and ~0% with the drift held still.
 */
const IDLE_MS = 45_000;

let active = false;
let started = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let lastPoke = 0;
const listeners = new Set<() => void>();

function set(v: boolean): void {
  if (v === active) return;
  active = v;
  listeners.forEach((l) => l());
}

function rest(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  set(false);
}

function poke(): void {
  if (document.hidden || !document.hasFocus()) return;
  set(true);
  // pointermove fires constantly: re-arm the idle timer at most once a second.
  const now = Date.now();
  if (idleTimer && now - lastPoke < 1000) return;
  lastPoke = now;
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(rest, IDLE_MS);
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const opts = { passive: true, capture: true } as const;
  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel'] as const) window.addEventListener(ev, poke, opts);
  window.addEventListener('focus', poke);
  window.addEventListener('blur', rest);
  document.addEventListener('visibilitychange', () => (document.hidden ? rest() : poke()));
  poke();
}

function subscribe(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

const snapshot = (): boolean => active;

export function useHubActive(): boolean {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
