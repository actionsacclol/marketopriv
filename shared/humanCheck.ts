import type { IgAccount, Site } from './types';

// After a platform asks an account to prove it is human (Threads' "Confirm you're human", Instagram's challenge,
// Facebook's checkpoint, X's locked-account page, TikTok's puzzle), that platform stays read-only for the account for a
// while: scrolling and reading, nothing liked, followed, replied, reposted or posted. Asked for by the user on 2026-11-22
// after Threads checkpointed @yuhgodev.

export const HUMAN_CHECK_HOURS = 48;

/** When the read-only time after the last human check on this platform ends (null = none going). */
export function humanCheckUntil(a: Pick<IgAccount, 'humanCheck'>, site: Site, now = Date.now()): number | null {
  const at = Date.parse(a.humanCheck?.[site] ?? '');
  if (!Number.isFinite(at)) return null;
  const until = at + HUMAN_CHECK_HOURS * 3_600_000;
  return until > now ? until : null;
}
