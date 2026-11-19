// Things an AI wants to do on Instagram that only the user may allow: posting
// a comment, publishing a reel, sending a message, changing the profile. The
// browser asks here and waits; the hub shows the request with Approve / Reject.

import crypto from 'node:crypto';
import type { Approval } from '../shared/types';

const PENDING_TTL_MS = 10 * 60_000;
const APPROVED_TTL_MS = 5 * 60_000;

const list: Approval[] = [];
const listeners = new Set<(a: Approval[]) => void>();
const waiters = new Map<string, Array<() => void>>();
let onNew: ((a: Approval) => void) | null = null;

function sweep(): void {
  const t = Date.now();
  for (const a of list) {
    if (a.state === 'pending' && t - a.createdAt > PENDING_TTL_MS) a.state = 'expired';
    if (a.state === 'approved' && t - a.createdAt > PENDING_TTL_MS + APPROVED_TTL_MS) a.state = 'expired';
  }
  // Keep a short history so the hub can show what was decided.
  while (list.length > 30) list.shift();
}

/** Another profile was opened: what waited here was about the accounts of the one that closed. */
export function clear(): void {
  for (const a of list) if (a.state === 'pending' || a.state === 'approved') a.state = 'expired';
  for (const ws of waiters.values()) for (const w of ws) w();
  waiters.clear();
  list.length = 0;
  changed();
}

function changed(): void {
  sweep();
  const snapshot = all();
  for (const l of listeners) l(snapshot);
}

export const all = (): Approval[] => list.map((a) => ({ ...a }));

export function onChange(cb: (a: Approval[]) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Called once for every new request (bring the hub forward). */
export function onRequest(cb: (a: Approval) => void): void {
  onNew = cb;
}

const same = (a: Approval, b: Omit<Approval, 'id' | 'createdAt' | 'state'>): boolean => a.handle === b.handle && a.kind === b.kind && a.url === b.url && (a.text ?? '') === (b.text ?? '') && a.action === b.action;

/** Approvals are switched off for this kind of action: record it as already approved, without asking. */
export function auto(input: Omit<Approval, 'id' | 'createdAt' | 'state' | 'auto'>): Approval {
  sweep();
  const a: Approval = { ...input, id: `ap_${crypto.randomBytes(4).toString('hex')}`, createdAt: Date.now(), state: 'approved', auto: true };
  list.push(a);
  changed();
  return a;
}

/** Ask the user. The same request asked again (the AI retrying) returns the one already waiting or already approved. */
export function request(input: Omit<Approval, 'id' | 'createdAt' | 'state'>): Approval {
  sweep();
  const existing = list.find((a) => (a.state === 'pending' || a.state === 'approved') && same(a, input));
  if (existing) return existing;
  const a: Approval = { ...input, id: `ap_${crypto.randomBytes(4).toString('hex')}`, createdAt: Date.now(), state: 'pending' };
  list.push(a);
  changed();
  onNew?.(a);
  return a;
}

export function answer(id: string, approve: boolean): void {
  const a = list.find((x) => x.id === id);
  if (!a || a.state !== 'pending') return;
  a.state = approve ? 'approved' : 'rejected';
  changed();
  for (const w of waiters.get(id) ?? []) w();
  waiters.delete(id);
}

/** Resolve when the user answers, or after `ms` with whatever the state is then. */
export function wait(id: string, ms: number): Promise<Approval['state']> {
  const state = (): Approval['state'] => {
    sweep();
    return list.find((x) => x.id === id)?.state ?? 'expired';
  };
  if (state() !== 'pending') return Promise.resolve(state());
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      resolve(state());
    };
    const timer = setTimeout(done, ms);
    waiters.set(id, [...(waiters.get(id) ?? []), done]);
  });
}

/** The approved action was carried out: it can't be used twice. */
export function consume(id: string): void {
  const a = list.find((x) => x.id === id);
  if (a) a.state = 'done';
  changed();
}
