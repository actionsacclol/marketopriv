import { useState } from 'react';
import { ArrowRight, Boxes, Briefcase, Check, ImageIcon, Scissors, Wand2, X } from 'lucide-react';
import type { Brand, PromoteMode } from '@shared/types';
import { brandFor, clipsOnly, modeOf, savePromoting } from '../lib/promoteMode';
import { ClipSources } from '../components/ClipSourcesEditor';
import { UsageTierCard } from '../components/AiUsage';

const MODE_TITLE: Record<PromoteMode, string> = { krypt: 'Krypt tools, and get paid', own: 'My own business or product', clips: 'Clip streamers' };
import { KRYPT_TOOLS } from '@shared/kryptPack';
import { NETWORKS } from '@shared/warmup';
import { Card, GhostButton, Page, PrimaryButton, Section, Toggle } from '../components/ui';
import { useApp } from '../state/store';
import { cls } from '../lib/format';
import { VoiceInstall, useVoiceStatus } from '../components/VoiceInstall';
import { DEFAULT_TUNE, describeTune } from '@shared/voice';
import { creatorProblem } from '@shared/brand';
import { CreatorCard } from '../components/CreatorCard';
import { ProfilesSection } from '../components/Profiles';
import { ChromeProfilesSection } from '../components/ChromeProfiles';
import { KRYPT_FOLLOW_LIST } from '@shared/kryptFollow';

// What the reels are for. Everything here is turned into the instructions
// each connected AI receives, so it is written once instead of in every chat.

export const FIELDS: Array<{ key: keyof Brand & ('name' | 'what' | 'site' | 'niche' | 'voice' | 'never' | 'disclaimer'); label: string; placeholder: string; long?: boolean; help?: string }> = [
  { key: 'name', label: 'Brand or product name', placeholder: 'e.g. Northwind Coffee' },
  { key: 'what', label: 'What it is, and who it is for', placeholder: 'One or two sentences an AI could repeat to a stranger.', long: true },
  { key: 'site', label: 'Link for end cards', placeholder: 'example.com', help: 'Shown on the last frame and in captions.' },
  { key: 'niche', label: 'What the account posts about', placeholder: 'e.g. home espresso, cafe reviews, coffee myths' },
  { key: 'voice', label: 'How it should sound', placeholder: 'e.g. Blunt, short sentences. No emojis.', long: true },
  { key: 'never', label: 'Never say or claim', placeholder: 'e.g. health claims, competitor names, prices', long: true },
  { key: 'disclaimer', label: 'Small print (optional)', placeholder: 'e.g. Not financial advice.' },
];

function Step({ n, done, title, children, action }: { n: number; done: boolean; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className={cls('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold', done ? 'border-emerald-400/50 bg-emerald-500/20 text-emerald-200' : 'border-white/15 text-krypt-muted')}>{done ? <Check className="h-3.5 w-3.5" /> : n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-white">{title}</div>
        <div className="mt-0.5 text-sm text-krypt-muted">{children}</div>
      </div>
      {action}
    </div>
  );
}

export default function Setup() {
  const db = useApp((s) => s.db)!;
  const browser = useApp((s) => s.browser);
  const mcp = useApp((s) => s.mcp);
  const chat = useApp((s) => s.chat);
  const go = useApp((s) => s.go);
  const setWizard = useApp((s) => s.setWizard);
  const toast = useApp((s) => s.toast);
  const voiceStatus = useVoiceStatus();
  // The saved mode, and the one picked here (it takes effect on Save). Each mode keeps its own form: switching
  // restores what that mode had (src/lib/promoteMode.ts).
  const savedMode = modeOf(db);
  const [mode, setMode] = useState<PromoteMode>(savedMode);
  const [f, setF] = useState<Brand>(db.brand);
  /** Forms edited here but not saved yet, per mode, so clicking between the cards loses nothing. */
  const [drafts, setDrafts] = useState<Partial<Record<PromoteMode, Brand>>>({});
  const dirty = mode !== savedMode || JSON.stringify(f) !== JSON.stringify(db.brand);
  const krypt = mode === 'krypt';
  const pick = (m: PromoteMode): void => {
    if (m === mode) return;
    setDrafts((d) => ({ ...d, [mode]: f }));
    const carry = { setupDone: f.setupDone, ...(f.creator ? { creator: f.creator } : {}) };
    setF(drafts[m] ? { ...drafts[m]!, ...carry } : m === savedMode ? { ...db.brand, ...carry } : brandFor(db, m, f));
    setMode(m);
  };

  const save = async (): Promise<void> => {
    if (!f.name.trim() || !f.what.trim()) return toast('warn', 'Give it at least a name and one sentence on what it is.');
    const problem = krypt ? creatorProblem(f.creator) : null;
    if (problem) return toast('warn', problem);
    const r = await savePromoting(db, savedMode, mode, mode === savedMode ? f : (drafts[savedMode] ?? db.brand), f);
    if (!r.ok || !r.data) return toast('error', r.message ?? 'Could not save.');
    setF(r.data);
    setDrafts({});
    toast('ok', mode === savedMode ? 'Saved. Every connected AI now works from this.' : `Switched to ${MODE_TITLE[mode].toLowerCase()}. The other modes keep what they had.`);
  };
  const clipAccounts = db.igAccounts.filter((a) => clipsOnly(a) || mode === 'clips');
  const pickLogo = async (): Promise<void> => {
    const p = await window.marketo.app.pickFile('image');
    if (p) setF((x) => ({ ...x, logo: p }));
  };

  const hasAccount = db.igAccounts.length > 0;
  const signedIn = browser.some((b) => b.loggedIn || b.youtube?.loggedIn || NETWORKS.some((n) => b[n]?.loggedIn));
  const hasAi = (mcp?.clients.length ?? 0) > 0 || !!(chat?.hasKey && db.agent.model);

  return (
    <Page
      title="Setup"
      subtitle="Tell Marketo what you are promoting. Your AI reads this before every reel."
      actions={
        <GhostButton onClick={() => setWizard(true)}>
          <Wand2 className="h-4 w-4" /> Run the setup wizard
        </GhostButton>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div>
          <Section title="What you are promoting" description="Change it any time. Press Save below to switch.">
            <div className="grid gap-2 lg:grid-cols-3">
              {(
                [
                  { m: 'krypt', icon: <Boxes className="h-4 w-4" />, about: 'Everything about krypt.cc is built in. Join the creator program below.' },
                  { m: 'own', icon: <Briefcase className="h-4 w-4" />, about: 'You describe it in the form below.' },
                  { m: 'clips', icon: <Scissors className="h-4 w-4" />, about: "A clip channel: Twitch and Kick streamers' top clips as captioned videos." },
                ] as const
              ).map((o) => (
                <button
                  key={o.m}
                  onClick={() => pick(o.m)}
                  className={cls('flex items-start gap-3 rounded-2xl border p-3 text-left transition', o.m === mode ? 'border-krypt-purple/60 bg-krypt-purple/10' : 'border-white/10 bg-white/[0.03] hover:border-white/25')}
                >
                  <span className={cls('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border', o.m === mode ? 'border-krypt-purple/50 bg-krypt-purple/20 text-white' : 'border-white/10 text-krypt-muted')}>{o.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">{MODE_TITLE[o.m]}</span>
                    <span className="block text-xs text-krypt-muted">{o.about}</span>
                  </span>
                </button>
              ))}
            </div>
            {mode !== savedMode && (
              <p className="mt-2 text-xs text-amber-200/90">
                {mode === 'clips'
                  ? 'Save below to switch: every account then makes clip reels only. '
                  : savedMode === 'clips'
                    ? 'Save below to switch: your accounts get back the styles they had. '
                    : 'Save below to switch. '}
                {MODE_TITLE[savedMode]} keeps what it has, for when you switch back.
              </p>
            )}
            {krypt && <CreatorCard className="mt-3" value={f.creator} onChange={(c) => setF((v) => ({ ...v, creator: c }))} />}
            {mode === 'clips' && clipAccounts.length > 0 && (
              <div className="mt-3">
                <ClipSources accounts={clipAccounts} />
              </div>
            )}
          </Section>

          <Section title="Your brand">
            <Card className="space-y-3">
              {FIELDS.map((x) => (
                <div key={x.key}>
                  <label className="label">{x.label}</label>
                  {x.long ? (
                    <textarea className="input min-h-[64px]" placeholder={x.placeholder} value={f[x.key]} onChange={(e) => setF((v) => ({ ...v, [x.key]: e.target.value }))} />
                  ) : (
                    <input className="input" placeholder={x.placeholder} value={f[x.key]} onChange={(e) => setF((v) => ({ ...v, [x.key]: e.target.value }))} />
                  )}
                  {x.help && <p className="mt-1 text-[11px] text-krypt-muted">{x.help}</p>}
                </div>
              ))}
              <div>
                <label className="label">Logo (square image, optional)</label>
                <div className="flex items-center gap-2">
                  <div className="input truncate font-mono text-xs text-white/70">{f.logo || 'None'}</div>
                  <GhostButton small onClick={() => void pickLogo()}>
                    <ImageIcon className="h-3.5 w-3.5" /> Choose
                  </GhostButton>
                  {f.logo && (
                    <GhostButton small onClick={() => setF((x) => ({ ...x, logo: '' }))}>
                      <X className="h-3.5 w-3.5" />
                    </GhostButton>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <PrimaryButton onClick={() => void save()} disabled={!dirty && db.brand.setupDone}>
                  {db.brand.setupDone ? 'Save changes' : 'Save and continue'}
                </PrimaryButton>
                <span className="text-xs text-krypt-muted">You can also just tell your AI about the product; it can fill this in for you.</span>
              </div>
            </Card>
          </Section>

          <Section title="AI usage" description="How much of your AI plan the scheduled runs take. On a $20 plan like Claude Pro, pick Low: it is made to last the whole month. The Usage page (under AI) shows what runs really used.">
            <UsageTierCard />
          </Section>

          <Section title="Voice" description="The narrator of story reels. Hear every voice, tune one and make it your default on the Voices page.">
            <VoiceInstall st={voiceStatus} />
            <Card className="mt-3 flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-white/80">New reels use: {describeTune(db.settings.voice ?? DEFAULT_TUNE)}</p>
              <GhostButton small onClick={() => go('voices')}>
                Hear and tune voices <ArrowRight className="h-3.5 w-3.5" />
              </GhostButton>
            </Card>
          </Section>

          <Section title="Sound" description="The speaker button at the bottom of the sidebar mutes all of Marketo: the hub, its browser windows and the Chrome tabs it drives. Your own tabs are never touched.">
            <Card className="space-y-3">
              <label className="flex items-center gap-3">
                <Toggle on={!!db.settings.mute} onChange={(v) => void window.marketo.db.updateSettings({ mute: v })} />
                <span className="text-sm text-white/80">Mute Marketo</span>
              </label>
              <label className="flex items-center gap-3">
                <Toggle on={!!db.settings.autoMute} onChange={(v) => void window.marketo.db.updateSettings({ autoMute: v })} />
                <span className="text-sm text-white/80">Auto mute: quiet whenever Marketo is in the background (good while the autopilot watches videos)</span>
              </label>
            </Card>
          </Section>

          <Section title="Krypt tools" description={`All ${KRYPT_TOOLS.length} krypt.cc tools are built in: what each does in full, reel angles and what never to claim. Your AI always has them.`}>
            <p className="mb-3 text-[11px] text-krypt-muted">Each of your accounts follows Krypt once on the platforms it runs ({KRYPT_FOLLOW_LIST}). Unfollow whenever you like; it is not done again.</p>
            <Card className="flex items-center gap-3">
              <p className="min-w-0 flex-1 text-sm text-white/80">Try: "Make a reel about Krypt Tweaker" in your AI or on the Chat page.</p>
              <GhostButton small onClick={() => go('krypt')}>
                See every tool <ArrowRight className="h-3.5 w-3.5" />
              </GhostButton>
            </Card>
          </Section>
        </div>

        <div>
        <Section title="Get going">
          <Card className="space-y-4">
            <Step n={1} done={db.brand.setupDone && !!db.brand.name} title="Describe your brand">
              The form on the left.
            </Step>
            <Step
              n={2}
              done={hasAccount && signedIn}
              title="Add an account and sign in"
              action={
                <GhostButton small onClick={() => go('accounts')}>
                  Accounts <ArrowRight className="h-3.5 w-3.5" />
                </GhostButton>
              }
            >
              {hasAccount ? (signedIn ? 'Signed in.' : 'Added. Sign it in: the Accounts page shows where.') : "Pick its platforms (Instagram, TikTok, YouTube Shorts, X, Facebook, Threads, Pinterest). In Marketo's own browser, or in your own Chrome. Your passwords stay with the platforms."}
            </Step>
            <Step
              n={3}
              done={hasAi}
              title="Connect an AI"
              action={
                <GhostButton small onClick={() => go('agents')}>
                  Connect <ArrowRight className="h-3.5 w-3.5" />
                </GhostButton>
              }
            >
              Claude, Codex, Cursor, Windsurf, Gemini CLI, or the built-in chat with your own API key (Grok, GPT, …).
            </Step>
            <Step n={4} done={db.reels.length > 0} title="Ask for a reel">
              "Read the playbook and make a reel about {db.brand.name || 'my product'}." It shows up in Studio as it is written. Have a reel whose edit you like? Add it under Research → Reference videos and say "like this one".
            </Step>
          </Card>
        </Section>
        <ChromeProfilesSection />
        <ProfilesSection />
        </div>
      </div>
    </Page>
  );
}
