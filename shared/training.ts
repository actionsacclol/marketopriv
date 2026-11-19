import type { Db, PostLog, Reel, Training, TrainingBrief } from './types';
import { SITES, linkOn } from './warmup';
import { hookLine, metricsOn } from './score';
import { hookStyleById } from './hooks';
import { KRYPT_TOOLS } from './kryptPack';

// Training: what the user thinks of the reels, kept next to what the numbers say. The user rates posted reels,
// gives each opening a thumb, marks topics as more / less and writes notes (Training pages). The AI reads all of it
// back in get_performance and makes more of what the user liked. Only the user's own verdicts go in here.

export const EMPTY_TRAINING: Training = { notes: [], topics: [] };
export const trainingOf = (d: Pick<Db, 'training'>): Training => d.training ?? EMPTY_TRAINING;

export const RATING_LABEL: Record<number, string> = { 1: 'Never again', 2: 'Weak', 3: 'Fine', 4: 'Good', 5: 'More like this' };

/** Went up on at least one platform. */
export const isPosted = (r: Reel): boolean => r.status === 'posted' || SITES.some((s) => !!linkOn(r, s));

/** When it first went up anywhere. */
export function firstPostedAt(r: Reel): string | undefined {
  const dates = SITES.map((s) => linkOn(r, s)?.at).filter((x): x is string => !!x).sort();
  return dates[0];
}

/** Views added up over every platform it has numbers on (null = no numbers yet). */
export function totalViews(r: Reel): number | null {
  let sum = 0;
  let any = false;
  for (const s of SITES) {
    const m = metricsOn(r, s).slice(-1)[0];
    if (m?.views === undefined) continue;
    sum += m.views;
    any = true;
  }
  return any ? sum : null;
}

export const toolTopicKey = (id: string): string => `tool:${id}`;
export const topicKeyOf = (name: string): string => name.trim().toLowerCase().replace(/\s+/g, ' ');

/** The krypt.cc tools a reel is about: what the post log says, otherwise the tool named in its title. */
export function toolsOf(r: Reel, posts: PostLog[]): string[] {
  const logged = new Set<string>();
  for (const p of posts) if (p.reelId === r.id) for (const t of p.tools ?? []) logged.add(t);
  if (logged.size) return [...logged].filter((id) => KRYPT_TOOLS.some((t) => t.id === id));
  const title = r.title.toLowerCase();
  return KRYPT_TOOLS.filter((t) => title.includes(t.name.toLowerCase())).map((t) => t.id);
}

export interface Tally {
  key: string;
  name: string;
  /** Reels in the group. */
  n: number;
  /** How many of them the user rated, and the average. */
  rated: number;
  avg: number | null;
  /** Openings the user liked / did not like. */
  liked: number;
  disliked: number;
}

/** Group reels (a reel can sit in several groups) and add up the user's verdicts in each. */
export function tally(reels: Reel[], keysOf: (r: Reel) => string[], nameOf: (key: string) => string): Tally[] {
  const map = new Map<string, Reel[]>();
  for (const r of reels) for (const k of keysOf(r)) map.set(k, [...(map.get(k) ?? []), r]);
  return [...map.entries()]
    .map(([key, rs]) => {
      const ratings = rs.map((r) => r.feedback?.rating).filter((x): x is number => typeof x === 'number');
      return {
        key,
        name: nameOf(key),
        n: rs.length,
        rated: ratings.length,
        avg: ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null,
        liked: rs.filter((r) => r.feedback?.hook === 1).length,
        disliked: rs.filter((r) => r.feedback?.hook === -1).length,
      };
    })
    .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || b.liked - b.disliked - (a.liked - a.disliked) || b.n - a.n);
}

export const hookStyleName = (id: string): string => (id === 'none' ? 'No style set' : hookStyleById(id)?.name ?? id);
export const toolName = (id: string): string => KRYPT_TOOLS.find((t) => t.id === id)?.name ?? id;

export const byHookStyle = (reels: Reel[]): Tally[] => tally(reels, (r) => [r.hookStyle || 'none'], hookStyleName);
export const byTool = (reels: Reel[], posts: PostLog[]): Tally[] => tally(reels, (r) => toolsOf(r, posts), toolName);

const hasFeedback = (r: Reel): boolean => !!r.feedback && (typeof r.feedback.rating === 'number' || !!r.feedback.hook || !!r.feedback.note?.trim());

// ── The Training brief ─────────────────────────────────────────────────────
// One page the AI writes from every verdict and every lesson (save_brief). Once there is one, a run reads the page
// plus only what is newer than it, in place of every single row. The user's rules, notes and topics are not part of
// the trade: those are always sent word for word. The single rows stay in the hub, and full: true reads them all.

export const BRIEF_MAX_CHARS = 4000;
/** No brief yet: how many verdicts and lessons there have to be before a run writes the first one by itself. */
export const BRIEF_FIRST_AFTER = 8;
/** With a brief: how many verdicts and lessons have to be new before a run rewrites it by itself. */
export const BRIEF_REFRESH_AFTER = 10;
/** What the Update button on the Training pages says to Kip. */
export const BRIEF_PROMPT = 'Update my Training brief: read get_performance with full set to true, then write it with save_brief. Then tell me in two or three lines what it says now.';
const BRIEF_HOW = 'get_performance with full: true, then save_brief';

export interface BriefState {
  brief: TrainingBrief | null;
  /** New since the brief was written (everything there is, with no brief): reels judged, notes and topics, lessons. */
  verdicts: number;
  notes: number;
  lessons: number;
  fresh: number;
  /** Something it was written from was added, changed or removed since. */
  changed: boolean;
  /** Verdicts and lessons in all: nothing to write a brief from while this is 0. */
  material: number;
  /** The user pressed Update and it has not been written since. */
  asked: boolean;
  /** The AI that reads the Training next writes it first. */
  due: boolean;
}

export function briefState(d: Pick<Db, 'reels' | 'training' | 'learnings'>): BriefState {
  const t = trainingOf(d);
  const brief = t.brief ?? null;
  const since = brief?.at ?? '';
  const after = (at?: string): boolean => !!at && at > since;
  const judged = d.reels.filter(hasFeedback);
  const learnings = d.learnings ?? [];
  const verdicts = judged.filter((r) => after(r.feedback!.at)).length;
  const notes = t.notes.filter((n) => after(n.at)).length + t.topics.filter((x) => after(x.at)).length;
  const lessons = learnings.filter((l) => after(l.at)).length;
  const material = judged.length + learnings.length;
  const asked = !!t.briefAsked;
  return {
    brief,
    verdicts,
    notes,
    lessons,
    fresh: verdicts + notes + lessons,
    changed: !!brief && !!t.touched && t.touched > brief.at,
    material,
    asked,
    due: material > 0 && (asked || (brief ? verdicts + lessons >= BRIEF_REFRESH_AFTER : material >= BRIEF_FIRST_AFTER)),
  };
}

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** "3 reels judged, 1 note and 2 lessons": what is new since the brief, in words. '' when nothing is. */
export function briefNews(s: BriefState): string {
  // A reel counts once, whether it got stars, a thumb on its opening, a comment or all three.
  const parts = [s.verdicts ? `${plural(s.verdicts, 'reel')} judged` : '', s.notes ? plural(s.notes, 'note') : '', s.lessons ? plural(s.lessons, 'lesson') : ''].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0] ?? '';
}

/** The brief as the AI reads it (get_performance), and whether it is this AI's turn to write it. '' when there is nothing to say. */
export function briefText(d: Pick<Db, 'reels' | 'training' | 'learnings'>, full = false): string {
  const s = briefState(d);
  if (full) return 'Everything in single rows (full: true), for writing the Training brief with save_brief: write it from the rows below every time, never from the brief as it stands.';
  if (!s.brief) {
    if (!s.due) return '';
    return `Training brief: none yet${s.asked ? ', and the user asked for one (Update on the Training pages)' : `, and there is enough to write it from (${plural(s.verdicts, 'reel')} judged, ${plural(s.lessons, 'lesson')})`}. Write it now, before you plan anything: ${BRIEF_HOW}.`;
  }
  const head = `Training brief (written ${s.brief.at.slice(0, 10)} from every rating, opening thumb, comment and lesson up to then; it stands in for those single rows):\n"""\n${s.brief.text}\n"""`;
  const news = briefNews(s);
  const tail = s.due
    ? `The brief is behind: ${s.asked ? 'the user asked for an update (Update on the Training pages)' : `${news} since it was written`}. Rewrite it now, before you plan anything: ${BRIEF_HOW}.`
    : news
      ? `Newer than the brief, and listed below: ${news}.`
      : s.changed
        ? 'Something the brief was written from was changed or removed since. When that matters to what you are making, read the rows themselves (get_performance with full: true).'
        : '';
  return tail ? `${head}\n${tail}` : head;
}

/** The lessons from the numbers as the AI reads them: all of them, or with a brief only the ones newer than it. */
export function lessonsText(d: Pick<Db, 'training' | 'learnings'>, full = false): string {
  const all = d.learnings ?? [];
  if (!all.length) return 'Learnings: none yet (add_learning after a comparison shows something).';
  const row = (l: Db['learnings'][number]): string => `- ${l.id} · ${l.at.slice(0, 10)} · ${l.text}`;
  const brief = full ? undefined : trainingOf(d).brief;
  if (!brief) return `Learnings:\n${all.map(row).join('\n')}`;
  const newer = all.filter((l) => l.at > brief.at);
  const older = all.length - newer.length;
  const summed = older ? `${older} of ${all.length} are summed up in the Training brief ("From the numbers"); get_performance with full: true lists each one with its id, e.g. to delete one the newer numbers contradict.` : 'all newer than the Training brief.';
  return `Learnings: ${summed}${newer.length ? `\nNewer than the brief:\n${newer.map(row).join('\n')}` : ''}`;
}

/**
 * Everything the user said on the Training pages, as the AI reads it (get_performance). With a brief, the reels
 * judged before it are left to the brief and only the newer ones are listed; full lists every one.
 */
export function trainingText(d: Pick<Db, 'reels' | 'posts' | 'training'>, full = false): string {
  const t = trainingOf(d);
  const judged = d.reels.filter(hasFeedback);
  const posted = d.reels.filter(isPosted);
  const brief = full ? undefined : t.brief;
  if (!judged.length && !t.notes.length && !t.topics.length)
    return 'User feedback (Training pages): nothing yet. The user rates posted reels, their openings and topics there. When they tell you what they think of a reel or of the content, save it in their words with save_feedback; never rate a reel yourself.';
  const out: string[] = ["User feedback (Training pages): the user's own ratings and words. It is direction from the person the reels are made for; follow it next to the numbers."];
  const notes = (kind: 'rule' | 'more' | 'less'): string[] => t.notes.filter((n) => n.kind === kind).map((n) => `- ${n.id}${n.about === 'general' ? '' : ` (${n.about})`}: ${n.text}`);
  if (notes('rule').length) out.push(`Rules from the user (they hold for every reel):\n${notes('rule').join('\n')}`);
  if (notes('more').length) out.push(`The user wants more of:\n${notes('more').join('\n')}`);
  if (notes('less').length) out.push(`The user wants less of:\n${notes('less').join('\n')}`);
  const more = t.topics.filter((x) => x.want === 'more').map((x) => x.name);
  const less = t.topics.filter((x) => x.want === 'less').map((x) => x.name);
  if (more.length || less.length) out.push(`Topics: ${[more.length ? `more of ${more.join(', ')}` : '', less.length ? `less of ${less.join(', ')}` : ''].filter(Boolean).join(' · ')}.`);
  if (judged.length) {
    const listed = brief ? judged.filter((r) => r.feedback!.at > brief.at) : judged;
    const rows = [...listed]
      .sort((a, b) => (b.feedback!.rating ?? 0) - (a.feedback!.rating ?? 0) || (b.feedback!.at ?? '').localeCompare(a.feedback!.at ?? ''))
      .slice(0, full ? 200 : 40)
      .map((r) => {
        const f = r.feedback!;
        const views = totalViews(r);
        return `- ${typeof f.rating === 'number' ? `${f.rating}/5` : 'not rated'} · ${r.id} "${r.title}"${r.hookStyle ? ` · hook style ${r.hookStyle}` : ''}${hookLine(r) ? ` · opens "${hookLine(r)}"` : ''}${f.hook === 1 ? ' · opening liked' : f.hook === -1 ? ' · opening disliked' : ''}${views === null ? '' : ` · ${views} views`}${f.note?.trim() ? ` · user: "${f.note.trim()}"` : ''}`;
      });
    if (rows.length) out.push(`${brief ? 'Reels the user judged since the Training brief was written' : 'Reels the user judged'}, best first (5 = more like this, 1 = never again):\n${rows.join('\n')}`);
    const line = (xs: Tally[]): string =>
      xs
        .filter((x) => x.rated || x.liked || x.disliked)
        .map((x) => `${x.name}${x.avg === null ? '' : ` ${x.avg.toFixed(1)}/5 (${x.rated})`}${x.liked || x.disliked ? ` openings +${x.liked}/-${x.disliked}` : ''}`)
        .join(' · ');
    const hooks = line(byHookStyle(judged));
    if (hooks) out.push(`By hook style (the user's average): ${hooks}`);
    const tools = line(byTool(judged, d.posts ?? []));
    if (tools) out.push(`By tool: ${tools}`);
    const arts = line(tally(judged.filter((r) => r.preset === 'story'), (r) => [String(r.fields.art || 'flat')], (k) => k));
    if (arts) out.push(`By art style (story reels): ${arts}`);
  }
  const unrated = posted.filter((r) => typeof r.feedback?.rating !== 'number').length;
  out.push(`${posted.length - unrated} of ${posted.length} posted reels are rated by the user.`);
  return out.join('\n');
}

/** The user's rules alone, for the top of a run (get_today). '' when there are none. */
export function trainingRules(d: Pick<Db, 'training'>): string {
  const rules = trainingOf(d).notes.filter((n) => n.kind === 'rule');
  return rules.length ? `Rules from the user (Training pages; they hold for every reel and post):\n${rules.map((n) => `- ${n.text}`).join('\n')}` : '';
}
