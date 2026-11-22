import type { Campaign, IgAccount, Reel, Site, Submission } from './types';
import { isKryptOwn, kryptAccountsOn } from './kryptFollow';
import { SITE_LABEL, localDate } from './warmup';

// Content Rewards (contentrewards.com): brands and agencies pay per 1,000 views for clips posted from the
// creator's own accounts. No API: the creator joins a campaign on the site, posts, then pastes the post's
// link there ("Submit clip") within 30 minutes. The AI does that last step in the account's Chrome profile.

/** Krypt's referral link. The app always says it is one. */
export const REWARDS_REFERRAL_URL = 'https://contentrewards.com/r/johnsmithy';
export const REWARDS_REFERRAL_NOTE = 'Krypt may earn a referral reward if you sign up through it';
export const REWARDS_HOME = 'https://contentrewards.com/c/home';
export const REWARDS_SUBMISSIONS = 'https://contentrewards.com/c/submissions';
/** Platforms Content Rewards can connect. */
export const REWARDS_SITES: Site[] = ['tiktok', 'instagram', 'youtube', 'x', 'facebook'];
/** How long after posting a link can still be submitted. */
export const SUBMIT_WINDOW_MS = 30 * 60_000;

/** The campaign id in a contentrewards.com campaign link, or null. */
export function campaignIdOf(url: string): string | null {
  const m = /contentrewards\.com\/(?:c\/)?campaigns\/([0-9a-f-]{8,})/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

/** The ad banner a reel draws: its campaign's, if the campaign has one. */
export const bannerOf = (r: Pick<Reel, 'campaignId'>, campaigns: Campaign[] | undefined): string | undefined =>
  r.campaignId ? campaigns?.find((c) => c.id === r.campaignId)?.banner : undefined;

/** The canonical link of a campaign. */
export const campaignUrl = (id: string): string => `https://contentrewards.com/c/campaigns/${id}`;

/** One of Krypt's own accounts on that platform: every install likes, comments on and reposts those, which
 *  Content Rewards counts as coordinated engagement (a permanent ban), so they never post for a campaign. */
export const isKryptAccountOn = (a: IgAccount, site: Site): boolean => kryptAccountsOn(site).some((k) => isKryptOwn(a, site, k));

const lower = (s: string): string => s.toLowerCase();

/** Why a reel can't go up for its campaign on a platform yet (empty = fine). */
export function campaignProblems(r: Reel, c: Campaign, a: IgAccount | undefined, site: Site | null): string[] {
  const out: string[] = [];
  const caption = (r.caption ?? '').trim();
  const text = lower([caption, ...(r.hashtags ?? []).map((h) => (h.startsWith('#') ? h : `#${h}`))].join(' '));
  if (!c.on) out.push(`the campaign "${c.title}" is switched off on the Campaigns page`);
  if (!/^#ad\b/i.test(caption)) out.push('the caption must start with "#ad" (the paid-post disclosure)');
  for (const h of c.hashtags ?? []) if (!text.includes(lower(h.startsWith('#') ? h : `#${h}`))) out.push(`the caption is missing ${h.startsWith('#') ? h : `#${h}`}`);
  for (const m of c.mentions ?? []) if (!text.includes(lower(m.startsWith('@') ? m : `@${m}`))) out.push(`the caption is missing ${m.startsWith('@') ? m : `@${m}`}`);
  for (const l of c.links ?? []) if (!text.includes(lower(l.replace(/^https?:\/\//, '')))) out.push(`the caption is missing the link ${l}`);
  if (a && c.accounts.length && !c.accounts.includes(a.id)) out.push(`${a.handle} is not one of this campaign's accounts (the user picks them on the Campaigns page)`);
  if (site) {
    if (!c.platforms.includes(site)) out.push(`the campaign does not pay for ${SITE_LABEL[site]} (it pays on ${c.platforms.map((s) => SITE_LABEL[s]).join(', ')})`);
    if (a && !c.test && isKryptAccountOn(a, site)) out.push(`${a.handle} is one of Krypt's own accounts on ${SITE_LABEL[site]}; every Marketo install engages with those, which Content Rewards bans as coordinated engagement`);
  }
  return out;
}

/** What to switch on when posting a campaign reel, per platform (the paid-partnership label). */
export const DISCLOSURE_STEP: Partial<Record<Site, string>> = {
  tiktok: 'In TikTok Studio\'s upload form, turn on "Content disclosure" and tick "Branded content" before posting.',
  youtube: 'In YouTube Studio\'s Details step, open "Show more" and tick "My video contains paid promotion like a product placement, sponsorship or endorsement" before publishing.',
  facebook: 'In the Reels composer, turn on the "Paid partnership" label and add the brand if it offers it; if the Page has no such option, the #ad caption is the disclosure.',
  x: 'X has no label for this: the #ad at the start of the caption is the disclosure.',
  instagram: "Instagram's paid-partnership label exists only in the phone app: skip it. The #ad at the start of the caption is the disclosure.",
};

const minsLeft = (s: Submission, now: number): number => Math.round((Date.parse(s.deadline) - now) / 60_000);

/** One line per submission, for the AI. */
export function submissionLine(s: Submission, c: Campaign | undefined, handle: string, now = Date.now()): string {
  const when = s.status === 'due' ? `DUE, ${Math.max(0, minsLeft(s, now))} min left` : s.status;
  return `${s.id} · ${when} · "${c?.title ?? s.campaignId}" · ${SITE_LABEL[s.site]} ${handle} · ${s.postUrl}${s.note ? ` · ${s.note}` : ''}`;
}

/** Campaign reels an account already made today for a campaign. */
export const madeToday = (reels: Reel[], c: Campaign, today = localDate(new Date().toISOString())): number =>
  reels.filter((r) => r.campaignId === c.id && localDate(r.createdAt) === today).length;

/** One line per campaign, for the AI. */
export function campaignLine(c: Campaign, handles: string[]): string {
  return [
    `${c.id} · "${c.title}"${c.brand ? ` by ${c.brand}` : ''}${c.on ? '' : ' (OFF)'}`,
    c.test ? `TEST ONLY (the user testing submissions from their own accounts, no payout): make a reel for it only when the user asks, one at a time` : '',
    `on ${c.platforms.map((s) => SITE_LABEL[s]).join(', ')}`,
    c.pay ?? '',
    handles.length ? `accounts ${handles.join(', ')}${c.test ? '' : `, ${c.perDay} a day each`}` : 'no accounts picked yet',
    c.hashtags?.length || c.mentions?.length || c.links?.length ? `caption needs ${[...(c.hashtags ?? []), ...(c.mentions ?? []), ...(c.links ?? [])].join(' ')}` : '',
    c.rules ? '' : 'RULES NOT SAVED YET: open the campaign page (it shows them once the user joined) and save_campaign them',
    c.url,
  ]
    .filter(Boolean)
    .join(' · ');
}
