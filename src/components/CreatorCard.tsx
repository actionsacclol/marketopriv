import { CircleAlert, CircleCheck, ExternalLink, Wallet } from 'lucide-react';
import type { KryptCreator } from '@shared/types';
import { CREATOR_PITCH, CREATOR_STEPS, KRYPT_DISCORD, cleanInvite, creatorProblem, isSolAddress } from '@shared/brand';
import { Card, GhostButton } from './ui';

// The Krypt creator program: the user's Solana address (payouts + Mirror/Bot
// referrer) and Discord name. Used by the setup wizard and the Setup page.

export function CreatorCard({ value, onChange, className }: { value: KryptCreator | undefined; onChange: (c: KryptCreator) => void; className?: string }) {
  const c = value ?? { wallet: '', discord: '' };
  const wallet = c.wallet.trim();
  const valid = isSolAddress(wallet);
  const invite = (c.invite ?? '').trim();
  const inviteOk = !!invite && !!cleanInvite(invite) && !creatorProblem({ wallet: '', discord: '', invite });
  return (
    <Card className={className}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-400/40 bg-emerald-500/15 text-emerald-200">
          <Wallet className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">Krypt creator program</div>
          <p className="mt-0.5 text-sm text-krypt-muted">{CREATOR_PITCH}</p>
        </div>
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-xs leading-relaxed text-white/70">
        {CREATOR_STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <GhostButton small className="mt-3" onClick={() => void window.marketo.app.openExternal(KRYPT_DISCORD)}>
        <ExternalLink className="h-3.5 w-3.5" /> Join the Krypt Discord
      </GhostButton>
      <div className="mt-4">
        <label className="label">Your own Krypt Discord invite (never expires)</label>
        <input className="input font-mono text-xs" spellCheck={false} placeholder="discord.gg/…  (made by you, not Krypt's main link)" value={c.invite ?? ''} onChange={(e) => onChange({ ...c, invite: e.target.value })} />
        {invite && (
          <div className={inviteOk ? 'mt-1 flex items-center gap-1 text-[11px] text-emerald-300' : 'mt-1 flex items-center gap-1 text-[11px] text-amber-300'}>
            {inviteOk ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
            {inviteOk ? `Your AI shares ${cleanInvite(invite)}. Make sure it is set to never expire.` : creatorProblem({ wallet: '', discord: '', invite })}
          </div>
        )}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_220px]">
        <div>
          <label className="label">Your Solana address (payouts and referral code)</label>
          <input className="input font-mono text-xs" spellCheck={false} placeholder="e.g. 7xKX…  (public address only)" value={c.wallet} onChange={(e) => onChange({ ...c, wallet: e.target.value })} />
          {wallet && (
            <div className={valid ? 'mt-1 flex items-center gap-1 text-[11px] text-emerald-300' : 'mt-1 flex items-center gap-1 text-[11px] text-amber-300'}>
              {valid ? <CircleCheck className="h-3 w-3" /> : <CircleAlert className="h-3 w-3" />}
              {valid ? 'Looks like a Solana address. Double-check it: payouts cannot be reversed.' : 'Not a Solana address yet (32-44 letters and numbers).'}
            </div>
          )}
        </div>
        <div>
          <label className="label">Your Discord name</label>
          <input className="input" spellCheck={false} placeholder="e.g. yourname" value={c.discord} onChange={(e) => onChange({ ...c, discord: e.target.value })} />
        </div>
      </div>
      <p className="mt-2 text-[11px] text-krypt-muted">Optional. Leave it empty to run Krypt pages without the program; you can join any time on the Setup page.</p>
    </Card>
  );
}
