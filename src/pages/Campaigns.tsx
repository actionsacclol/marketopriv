import { useState } from 'react';
import { BadgeDollarSign, ExternalLink, FolderOpen, ImagePlus, Trash2 } from 'lucide-react';
import type { Campaign, IgAccount, Site, Submission, SubmissionStatus } from '@shared/types';
import { REWARDS_REFERRAL_NOTE, REWARDS_REFERRAL_URL, REWARDS_SITES, campaignIdOf, isKryptAccountOn } from '@shared/campaigns';
import { SITE_LABEL } from '@shared/warmup';
import { Card, Empty, GhostButton, Page, PrimaryButton, Section, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';

// Create > Campaigns: Content Rewards (contentrewards.com). Brands pay per 1,000 views for posts from the user's own
// accounts. The user signs up, connects their accounts and joins campaigns there; the AI makes reels to each
// campaign's rules, posts them with the ad disclosure and submits each link within 30 minutes of posting.

const open = (url: string): void => void window.marketo.app.openExternal(url);

const STATUS_STYLE: Record<SubmissionStatus, string> = {
  due: 'bg-amber-400/15 text-amber-200',
  submitted: 'bg-sky-400/15 text-sky-200',
  approved: 'bg-emerald-400/15 text-emerald-200',
  rejected: 'bg-red-400/15 text-red-200',
  missed: 'bg-white/10 text-white/50',
};

function GetStarted() {
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <BadgeDollarSign className="h-4 w-4 text-krypt-purple" /> Get paid per view for your posts
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-white/75">
        <li>Make a Content Rewards account (it signs in with Whop) in the Chrome profile your accounts run in.</li>
        <li>In Content Rewards, Settings &gt; Accounts: connect the TikTok, Instagram, YouTube, X and Facebook accounts that will post (Instagram needs to be a Business account there). On Instagram the disclosure is the #ad at the start of the caption; its "Paid partnership" label is phone-only, so you can add it from the app if you like.</li>
        <li>Join a campaign that fits an account (its rules show once you join), then paste its link below and pick which accounts post for it.</li>
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <PrimaryButton onClick={() => open(REWARDS_REFERRAL_URL)}>
          <ExternalLink className="h-4 w-4" /> Sign up for Content Rewards
        </PrimaryButton>
        <GhostButton small onClick={() => open('https://contentrewards.com/c/discover')}>
          Find campaigns
        </GhostButton>
      </div>
      <p className="text-[11px] text-krypt-muted">Referral link: {REWARDS_REFERRAL_NOTE}.</p>
      <p className="text-xs leading-relaxed text-white/55">
        Every campaign post starts its caption with #ad and gets the platform's paid-partnership label where it has one. Bought or traded views, likes and follows get a Content Rewards account banned for good, so Krypt's own accounts never post for campaigns.
      </p>
    </Card>
  );
}

function CampaignCard({ c, accounts }: { c: Campaign; accounts: IgAccount[] }) {
  const toast = useApp((s) => s.toast);
  const save = async (patch: Partial<Campaign>): Promise<void> => {
    const r = await window.marketo.db.saveCampaign({ id: c.id, ...patch });
    if (!r.ok) toast('warn', r.message ?? 'Could not save.');
  };
  const toggleSite = (s: Site): void => void save({ platforms: c.platforms.includes(s) ? c.platforms.filter((x) => x !== s) : [...c.platforms, s] });
  const toggleAccount = (id: string): void => void save({ accounts: c.accounts.includes(id) ? c.accounts.filter((x) => x !== id) : [...c.accounts, id] });
  const remove = async (): Promise<void> => {
    const r = await window.marketo.db.deleteCampaign(c.id);
    if (r.ok) toast('ok', `Removed "${c.title}" from Marketo (you are still in it on Content Rewards).`);
  };
  const folder = async (): Promise<void> => {
    const r = await window.marketo.app.openCampaignFolder(c.title);
    if (!r.ok) toast('warn', r.message ?? 'Could not open the folder.');
  };
  return (
    <Card className="space-y-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{c.title}</div>
          <div className="text-xs text-krypt-muted">{[c.brand, c.pay].filter(Boolean).join(' · ') || 'The AI fills in the details from the campaign page.'}</div>
        </div>
        <Toggle on={c.on} onChange={(on) => void save({ on })} label={c.on ? 'On' : 'Off'} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {REWARDS_SITES.map((s) => (
          <button key={s} onClick={() => toggleSite(s)} className={cls('rounded-full border px-2.5 py-0.5 text-xs', c.platforms.includes(s) ? 'border-krypt-purple/60 bg-krypt-purple/20 text-white' : 'border-white/10 text-white/45')}>
            {SITE_LABEL[s]}
          </button>
        ))}
      </div>
      <div>
        <div className="mb-1 text-[11px] uppercase tracking-wider text-krypt-muted">Accounts that post for it</div>
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((a) => {
            const krypt = !c.test && c.platforms.some((s) => isKryptAccountOn(a, s));
            return (
              <button
                key={a.id}
                disabled={krypt && !c.accounts.includes(a.id)}
                title={krypt ? "One of Krypt's own accounts: every Marketo install engages with those, which Content Rewards bans." : undefined}
                onClick={() => toggleAccount(a.id)}
                className={cls('rounded-full border px-2.5 py-0.5 text-xs', krypt ? 'cursor-not-allowed border-white/5 text-white/25 line-through' : c.accounts.includes(a.id) ? 'border-krypt-purple/60 bg-krypt-purple/20 text-white' : 'border-white/10 text-white/45')}
              >
                {a.handle}
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <Toggle on={!!c.test} onChange={(test) => void save({ test })} label="Test only: my own accounts, no payout" />
        {c.test && (
          <p className="mt-1 text-[11px] leading-relaxed text-amber-200/80">
            Krypt's own accounts can post for it, and the AI makes a reel for it only when you ask. Every Marketo install likes and comments on those accounts, so Content Rewards may flag or ban the Content Rewards account. Use it to test submitting, not to earn.
          </p>
        )}
      </div>
      <div className={cls('flex flex-wrap items-center gap-3 text-sm text-white/75', c.test && 'hidden')}>
        <label className="flex items-center gap-2">
          Reels a day per account
          <input type="number" min={0} value={c.perDay} onChange={(e) => void save({ perDay: Number(e.target.value) })} className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-white" />
        </label>
        {!c.rules && <span className="text-xs text-amber-200/80">Rules not read yet: the AI reads them from the campaign page on its next run.</span>}
      </div>
      {(c.hashtags?.length || c.mentions?.length || c.links?.length) && (
        <div className="text-xs text-white/60">Caption needs: {[...(c.hashtags ?? []), ...(c.mentions ?? []), ...(c.links ?? [])].join(' ')}</div>
      )}
      <BannerRow c={c} />
      <div className="flex flex-wrap gap-2">
        <GhostButton small onClick={() => open(c.url)}>
          <ExternalLink className="h-3.5 w-3.5" /> Campaign page
        </GhostButton>
        <GhostButton small onClick={() => void folder()}>
          <FolderOpen className="h-3.5 w-3.5" /> Files (logos, footage)
        </GhostButton>
        <GhostButton small destructive onClick={() => void remove()}>
          <Trash2 className="h-3.5 w-3.5" /> Remove
        </GhostButton>
      </div>
    </Card>
  );
}

/** Some campaigns want their ad banner on every clip: the user uploads it here, or the AI fetches it from the campaign page. */
function BannerRow({ c }: { c: Campaign }) {
  const toast = useApp((s) => s.toast);
  const [busy, setBusy] = useState(false);
  const set = async (source: string): Promise<void> => {
    setBusy(true);
    try {
      const r = await window.marketo.db.setCampaignBanner(c.id, source);
      if (!r.ok) return toast('warn', r.message ?? 'Could not save the banner.');
      const redo = r.data?.redo ? ` ${r.data.redo} rendered reel${r.data.redo === 1 ? '' : 's'} went back to draft to render again with it.` : '';
      toast('ok', source ? `Banner saved: it shows near the bottom of every reel for this campaign.${redo}` : `Banner removed.${redo}`);
    } finally {
      setBusy(false);
    }
  };
  const upload = async (): Promise<void> => {
    const f = await window.marketo.app.pickFile('image');
    if (f) await set(f);
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-2.5">
      <div className="flex h-12 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/5">
        {c.banner ? <img src={window.marketo.app.mediaUrl(c.banner)} alt="" className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-4 w-4 text-white/30" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-white">Ad banner</div>
        <p className="text-[11px] leading-relaxed text-krypt-muted">
          {c.banner ? 'Shown near the bottom of every reel for this campaign, with the captions kept above it.' : 'Only if the campaign asks for one. Upload it, or ask Kip to get it from the campaign page.'}
        </p>
      </div>
      <GhostButton small disabled={busy} onClick={() => void upload()}>
        {c.banner ? 'Replace' : 'Upload'}
      </GhostButton>
      {c.banner && (
        <GhostButton small destructive disabled={busy} onClick={() => void set('')}>
          Remove
        </GhostButton>
      )}
    </div>
  );
}

function Submissions({ list, campaigns, accounts }: { list: Submission[]; campaigns: Campaign[]; accounts: IgAccount[] }) {
  if (!list.length) return <p className="text-sm text-krypt-muted">Nothing submitted yet. Each campaign post shows here once it is live, with its 30-minute deadline.</p>;
  return (
    <Card padded={false} className="divide-y divide-white/5">
      {list.slice(0, 60).map((s) => {
        const c = campaigns.find((x) => x.id === s.campaignId);
        const late = s.status === 'due' ? Math.max(0, Math.round((Date.parse(s.deadline) - Date.now()) / 60_000)) : null;
        return (
          <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className={cls('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', STATUS_STYLE[s.status])}>{s.status}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-white">{c?.title ?? 'Removed campaign'}</div>
              <div className="truncate text-xs text-krypt-muted">
                {SITE_LABEL[s.site]} · {accounts.find((a) => a.id === s.accountId)?.handle ?? ''} · posted {new Date(s.postedAt).toLocaleString()}
                {late !== null ? ` · ${late} min left to submit` : ''}
                {s.note ? ` · ${s.note}` : ''}
              </div>
            </div>
            <GhostButton small onClick={() => open(s.postUrl)}>
              <ExternalLink className="h-3.5 w-3.5" />
            </GhostButton>
          </div>
        );
      })}
    </Card>
  );
}

export default function Campaigns() {
  const db = useApp((s) => s.db)!;
  const toast = useApp((s) => s.toast);
  const [link, setLink] = useState('');
  const campaigns = db.campaigns ?? [];
  const accounts = db.igAccounts;
  const add = async (): Promise<void> => {
    if (!campaignIdOf(link)) return toast('warn', 'Paste the link of a campaign page (contentrewards.com/c/campaigns/…).');
    const r = await window.marketo.db.saveCampaign({ url: link.trim() });
    if (r.ok) {
      setLink('');
      toast('ok', 'Added. Pick its platforms and accounts; the AI reads its rules on the next run.');
    } else toast('warn', r.message ?? 'Could not add it.');
  };
  return (
    <Page title="Campaigns" subtitle="Content Rewards: brands pay per view for posts from your accounts. You join campaigns; Marketo makes the posts and submits them.">
      <div className="space-y-6">
        <GetStarted />
        <Section title="Your campaigns" description="Only campaigns you joined on Content Rewards. Marketo never joins or leaves one for you.">
          <div className="mb-3 flex gap-2">
            <input value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void add()} placeholder="https://contentrewards.com/c/campaigns/…" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30" />
            <PrimaryButton onClick={() => void add()}>Add campaign</PrimaryButton>
          </div>
          {campaigns.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {campaigns.map((c) => (
                <CampaignCard key={c.id} c={c} accounts={accounts} />
              ))}
            </div>
          ) : (
            <Empty icon={<BadgeDollarSign className="h-6 w-6" />} title="No campaigns yet">
              Join one on Content Rewards, then paste its link above.
            </Empty>
          )}
        </Section>
        <Section title="Submissions" description="Each campaign post has to be submitted within 30 minutes of going live. The brand then approves or rejects it.">
          <Submissions list={db.submissions ?? []} campaigns={campaigns} accounts={accounts} />
        </Section>
      </div>
    </Page>
  );
}
