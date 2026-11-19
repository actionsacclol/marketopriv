import type { Brand, KryptCreator } from './types';

// The brand presets: a blank one for a new install, and Krypt's (the hub was built for it; the setup wizard offers it).

export const EMPTY_BRAND: Brand = { name: '', what: '', site: '', niche: '', voice: 'Blunt, short sentences. No emojis. No hype.', never: '', disclaimer: '', logo: '', setupDone: false };

/** The brand this hub was built for; installs that already hold its data keep it. */
export const KRYPT_BRAND: Brand = {
  name: 'Krypt',
  what: 'krypt.cc makes crypto and trading tools: Krypto Bot (a memecoin trading terminal) and Krypto Mirror (local-first copy trading), plus the rest of the krypt.cc/tools catalog. Reels can be any memecoin / crypto story that will get views (on-chain events, wallet breakdowns, explainers, myths, memes); the tools appear where they fit.',
  site: 'krypt.cc',
  niche: 'memecoins, on-chain stories, crypto trading tools',
  voice: 'Blunt, short sentences. No emojis. No hype claims.',
  never: 'Profit claims or a "proven edge" for trading tools. Impersonating a real person or company.',
  disclaimer: 'Not financial advice.',
  logo: '',
  setupDone: true,
};

/** A clip channel (setup's "Clip streamers"): the brand is the channel itself; its name is the user's to fill in. */
export const CLIPS_BRAND: Brand = {
  name: '',
  what: 'A clip channel: the best moments from Twitch and Kick streams, cut into short vertical videos with captions. Every clip names its streamer.',
  site: '',
  niche: 'stream clips, streamers, gaming moments',
  voice: 'Short and punchy, like a clip page. No emojis.',
  never: 'Passing a clip off as our own. Nudity or slurs.',
  disclaimer: '',
  logo: '',
  setupDone: false,
};

export const isKryptBrand =(b: Pick<Brand, 'name'>): boolean => b.name.trim().toLowerCase() === KRYPT_BRAND.name.toLowerCase();

/** Fill in Krypt's brand, keeping what belongs to this install (setup state, creator details). */
export const kryptBrandFor = (b: Brand): Brand => ({ ...KRYPT_BRAND, setupDone: b.setupDone, ...(b.creator ? { creator: b.creator } : {}) });

/** A Solana address: base58, 32-44 characters. */
export const isSolAddress = (s: string): boolean => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s.trim());

/** Krypt's video guide to Marketo (YouTube), shown on the first step of the setup wizard. */
export const GUIDE_VIDEO_ID = 'yLFVUZtf1Gs';
export const GUIDE_VIDEO_URL = `https://www.youtube.com/watch?v=${GUIDE_VIDEO_ID}`;
export const GUIDE_VIDEO_THUMB = `https://i.ytimg.com/vi/${GUIDE_VIDEO_ID}/mqdefault.jpg`;

/** Krypt's own Discord invite: creators join through it, then make their own invite. */
export const KRYPT_DISCORD = 'https://discord.com/invite/muzFKR657F';
const KRYPT_INVITE_CODE = 'muzFKR657F';

/** A Discord invite as "discord.gg/<code>" (short enough for captions), or null if it isn't one. */
export function cleanInvite(s: string): string | null {
  const m = s.trim().match(/^(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([A-Za-z0-9-]{2,32})\/?$/i);
  return m ? `discord.gg/${m[1]}` : null;
}

/** What is wrong with the creator details, or null. Empty fields are fine (the program is optional). */
export function creatorProblem(c: KryptCreator | undefined): string | null {
  if (!c) return null;
  const wallet = c.wallet.trim();
  const invite = (c.invite ?? '').trim();
  if (wallet && !isSolAddress(wallet)) return 'That is not a Solana address (32-44 letters and numbers, no 0, O, I or l).';
  if (invite) {
    const clean = cleanInvite(invite);
    if (!clean) return 'That is not a Discord invite link (it looks like discord.gg/abc123).';
    if (clean.endsWith(`/${KRYPT_INVITE_CODE}`)) return "That is Krypt's main invite. Make your own in the Krypt Discord, so the people you bring in count as yours.";
  }
  return null;
}

/** The creator details if they are complete enough to use (a valid Solana address). */
export const activeCreator = (b: Brand): KryptCreator | null => (isKryptBrand(b) && b.creator && isSolAddress(b.creator.wallet) ? b.creator : null);

// ── Krypt creator program ───────────────────────────────────────────────────
// Users who run Krypt videos keep 100% of the donations they bring in (a
// donation is $50 in crypto, made in the Krypt Discord), and they are the
// referrer on Krypto Mirror and Krypto Bot with their Solana address. Krypt
// pays by hand: the creator claims in the Krypt Discord. Shown in the setup
// wizard and on the Setup page; the AI's caption rules are in serverInstructions.

export const CREATOR_PITCH = 'Run your accounts for Krypt and get paid: you keep 100% of the donations your videos bring in ($50 in crypto each), and you are the referrer on Krypto Mirror and Krypto Bot.';

export const CREATOR_STEPS: string[] = [
  'Join the Krypt Discord (button below). In the server, use Invite People, then Edit invite link, set Expire After to Never, and paste that link here. Your AI shares it, so the people you bring in join through your link.',
  'Your Solana address is where Krypt sends what you earn, and the referral code people enter when they set up Krypto Mirror or Krypto Bot. Use an address you control; Marketo never asks for keys or seed phrases.',
  'Donations are made in the Krypt Discord. When someone donates because of your videos, tell Krypt there (your Discord name and who donated). Krypt sends 100% of it to your address by hand.',
  'Your AI puts your invite and referral code in captions where they fit, and helps people in your DMs join the Discord and set up Krypto Bot or Krypto Mirror with your referral.',
  'Your AI never promises anyone a profit, and keeps "Not financial advice." on trading tool reels. Earnings depend on who donates or signs up; nothing is guaranteed.',
];
