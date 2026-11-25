import type { LongVideo, LongformPlan, Settings } from './types';

// The long-form YouTube mode: a profile that runs a channel of long videos. Krypt Editor makes each video (the AI
// builds it there with the Editor's own tools); Marketo decides what to make, writes the title, description and
// thumbnail, uploads it and looks after the comments. The plan here is the user's own: how many a week, how long,
// and how a finished one goes up.

export const EDITOR_URL = 'https://krypt.cc/tools/editor';
/** Krypt Editor's name in an AI app's settings (its MCP server). */
export const EDITOR_SERVER = 'krypt-editor';

export const LONG_LENGTHS: Array<LongformPlan['length']> = ['5-7', '8-12', '12-20'];
export const DEFAULT_LONGFORM: LongformPlan = { perWeek: 2, length: '8-12', visibility: 'public' };
/** Recommended most: one long video a day. More is the user's call (the hub and the AI say so plainly; nothing stops it). */
export const LONGFORM_SOFT_CAP = 7;

export const isLongform = (s: Pick<Settings, 'promoting'>): boolean => s.promoting === 'longform';

export function cleanLongform(input: unknown): LongformPlan {
  const x = (input && typeof input === 'object' ? input : {}) as Partial<LongformPlan>;
  const n = Number(x.perWeek);
  return {
    perWeek: Number.isFinite(n) ? Math.max(0, Math.min(99, Math.round(n))) : DEFAULT_LONGFORM.perWeek,
    length: LONG_LENGTHS.includes(x.length as LongformPlan['length']) ? (x.length as LongformPlan['length']) : DEFAULT_LONGFORM.length,
    visibility: x.visibility === 'unlisted' ? 'unlisted' : x.visibility === 'public' ? 'public' : DEFAULT_LONGFORM.visibility,
  };
}

export const longformPlan = (s: Pick<Settings, 'longform'>): LongformPlan => cleanLongform(s.longform);

/** When a long video went up (older entries have no uploadedAt: the last change to an uploaded one). */
export const uploadedAt = (v: LongVideo): number => (v.status === 'uploaded' ? Date.parse(v.uploadedAt ?? v.updatedAt) || 0 : 0);

export interface LongformState {
  /** Uploaded in the last 7 days. */
  week: number;
  /** Started and not uploaded yet, the one changed last first. */
  open: LongVideo[];
  /** A new one should be started (none is in progress, the week is not full and the last upload is long enough ago). */
  due: boolean;
  /** When the next one comes due, if it is spacing that holds it. */
  nextAt?: number;
  lastAt?: number;
}

/** Where one channel stands against the plan. Uploads are spread over the week: the next comes due after about 60% of an even gap. */
export function longformState(videos: LongVideo[], accountId: string, plan: LongformPlan, now = Date.now()): LongformState {
  const mine = videos.filter((v) => v.accountId === accountId);
  const ups = mine.map(uploadedAt).filter((t) => t > 0);
  const week = ups.filter((t) => now - t < 7 * 86_400_000).length;
  const lastAt = ups.length ? Math.max(...ups) : undefined;
  const open = mine.filter((v) => v.status !== 'uploaded').sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  if (plan.perWeek <= 0) return { week, open, due: false, lastAt };
  const gapMs = (7 * 86_400_000 * 0.6) / plan.perWeek;
  const spaced = !lastAt || now - lastAt >= gapMs;
  const due = !open.length && week < plan.perWeek && spaced;
  return { week, open, due, lastAt, ...(!open.length && week < plan.perWeek && !spaced && lastAt ? { nextAt: lastAt + gapMs } : {}) };
}

/** What comes next for a video that is in progress. */
export const NEXT_STEP: Record<LongVideo['status'], string> = {
  script: 'the script is saved: narrate it if the user has an ElevenLabs voice, then build it in Krypt Editor',
  narrated: 'the narration is bought: build it in Krypt Editor with each section\'s MP3 as that section\'s audio',
  edited: 'the video is exported: thumbnail, then upload',
  ready: 'ready to go up: upload it',
  uploaded: 'uploaded',
};
