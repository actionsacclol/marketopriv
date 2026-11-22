// The Resources page: links the user needs around Marketo (voice, proxies, guide videos, tools,
// growth services). Fill in a url when one is ready; an entry without one shows as "coming soon", unless it is
// an extension shipped with the app (`install`), which shows how to add it to Chrome.
// Affiliate links are always marked as such on the page.

import { ELEVEN_AFFILIATE_NOTE, ELEVEN_KEYS_URL, ELEVEN_SIGNUP_URL } from './voice';
import { REWARDS_REFERRAL_NOTE, REWARDS_REFERRAL_URL } from './campaigns';
import {
  CLIPPING_GUIDE_ID,
  CLIPPING_GUIDE_URL,
  GUIDE_VIDEO_ID,
  GUIDE_VIDEO_URL,
  PROXY_CHEAP_NOTE,
  PROXY_CHEAP_URL,
  PROXY_GUIDE_ID,
  PROXY_GUIDE_URL,
  SMM_GUIDE_ID,
  SMM_GUIDE_URL,
} from './brand';

export interface ResourceLink {
  title: string;
  about: string;
  /** Where the button goes. Leave out while the link isn't ready. */
  url?: string;
  /** The button's text (default "Open"). */
  button?: string;
  /** A second, smaller link. */
  extra?: { label: string; url: string };
  /** Krypt earns from it: the page says so next to the button. */
  affiliate?: string;
  /** Shown as a warning under the entry. */
  warning?: string;
  /** A YouTube video id: the card shows the video's picture, and clicking it opens `url`. */
  video?: string;
}

export interface ResourceSection {
  id: string;
  title: string;
  about: string;
  items: ResourceLink[];
}

export const RESOURCES: ResourceSection[] = [
  {
    id: 'guides',
    title: 'Guide videos',
    about: 'Short videos that walk through Marketo, step by step.',
    items: [
      { title: 'Getting started', about: 'Krypt walks through what Marketo does and how to set it up.', url: GUIDE_VIDEO_URL, button: 'Watch on YouTube', video: GUIDE_VIDEO_ID },
      { title: 'Clipping with Content Rewards', about: 'Sign up through Marketo, pick a streamer, join a campaign, and Kip makes, posts and submits the clips.', url: CLIPPING_GUIDE_URL, button: 'Watch on YouTube', video: CLIPPING_GUIDE_ID },
      { title: 'Multi run and proxies', about: 'Run more sets of accounts, each on its own static residential IP: ordering proxies and adding one to a profile.', url: PROXY_GUIDE_URL, button: 'Watch on YouTube', video: PROXY_GUIDE_ID },
      { title: 'SMM panels', about: 'What an SMM panel is, what to buy and what not to, and adding funds.', url: SMM_GUIDE_URL, button: 'Watch on YouTube', video: SMM_GUIDE_ID },
    ],
  },
  {
    id: 'earn',
    title: 'Earn from your posts',
    about: 'Get paid per view for posting brands\' campaigns from your accounts.',
    items: [
      {
        title: 'Content Rewards',
        about: 'Brands and streamers pay per 1,000 views for clips and posts from your accounts. Sign up, connect your accounts and join campaigns there; Marketo makes the posts and submits them (Create > Campaigns).',
        url: REWARDS_REFERRAL_URL,
        button: 'Sign up',
        affiliate: REWARDS_REFERRAL_NOTE,
      },
    ],
  },
  {
    id: 'voice',
    title: 'Voice',
    about: 'Narration for reels and long videos comes from your own ElevenLabs account.',
    items: [
      {
        title: 'ElevenLabs',
        about: 'Make an account, then copy an API key into Create > Voices. The free plan works for trying it; a paid plan for daily reels.',
        url: ELEVEN_SIGNUP_URL,
        button: 'Create an account',
        extra: { label: 'Your API keys', url: ELEVEN_KEYS_URL },
        affiliate: ELEVEN_AFFILIATE_NOTE,
      },
    ],
  },
  {
    id: 'proxies',
    title: 'Proxies',
    about: 'A proxy per profile keeps each set of accounts on one fixed IP (Multi run > Proxy).',
    items: [
      {
        title: 'Proxy-Cheap',
        about: 'Get static residential IPs (also called ISP proxies): one fixed home IP per profile that never changes, which is what Marketo needs. Not rotating or datacenter proxies. Use one IP per profile, and its HTTP details (host, port, user name, password) in Multi run > Proxy.',
        url: PROXY_CHEAP_URL,
        button: 'Get static residential IPs',
        affiliate: PROXY_CHEAP_NOTE,
        extra: { label: 'Watch the setup guide', url: PROXY_GUIDE_URL },
      },
    ],
  },
  {
    id: 'tools',
    title: 'Krypt tools',
    about: 'Free tools Marketo works with.',
    items: [
      { title: 'Krypt Editor', about: 'The free video editor your AI edits long videos in. Install it, then connect it to your AI the same way as Marketo.', url: 'https://krypt.cc/tools/editor', button: 'Get Krypt Editor' },
    ],
  },
  {
    id: 'growth',
    title: 'Growth services',
    about: 'Outside services. Marketo and its AI never use or buy these for you.',
    items: [
      {
        title: 'Boosted (SMM panel)',
        about: 'Bought followers, likes and views, for a new account that needs a starting number.',
        url: 'https://boosted.wtf/ref/r9kel',
        button: 'Open Boosted',
        affiliate: 'Krypt may earn a commission if you buy through it',
        warning:
          'Bought followers, likes and views break the rules of Instagram, TikTok, YouTube and X and can get an account restricted or banned. Bought views do not watch, so they pull down watch time, which is what the platforms (and Marketo\'s learning) go by. Content Rewards bans an account for good over bought views, so never on an account that posts for campaigns. Never during an account\'s warm-up; small amounts, your own call.',
        extra: { label: 'Watch the SMM guide', url: SMM_GUIDE_URL },
      },
    ],
  },
];
