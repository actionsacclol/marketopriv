import { Eye } from 'lucide-react';
import { SITE_COLOR, SITE_ICON, SITE_SHORT, TONE_DOT, TONE_TEXT, openSite, type SiteState } from '../lib/platforms';
import { cls } from '../lib/format';
import { quotaLabel } from '@shared/warmup';

/** A progress ring: posts done against today's target. */
function Ring({ done, target, color }: { done: number; target: number; color: string }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  const k = target > 0 ? Math.min(1, done / target) : 0;
  return (
    <div className="relative h-11 w-11 shrink-0">
      <svg viewBox="0 0 44 44" className="h-11 w-11 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        {k > 0 && <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * k} ${c}`} className="transition-[stroke-dasharray] duration-700" />}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center font-mono text-[11px] text-white">
        {done}/{target}
      </div>
    </div>
  );
}

function Meter({ label, m }: { label: string; m?: { done: number; cap: number } }) {
  if (!m || m.cap <= 0) return null;
  const k = Math.min(1, m.done / m.cap);
  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] text-krypt-muted">
        <span>{label}</span>
        <span>
          {m.done}/{m.cap}
        </span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full bg-krypt-gradient transition-all duration-700" style={{ width: `${k * 100}%` }} />
      </div>
    </div>
  );
}

/** One platform of an account: status dot, who it runs as, today's posts ring and warm-up meters. Click opens the platform. */
export function PlatformTile({ s, accountId, compact, onSelect }: { s: SiteState; accountId: string; compact?: boolean; onSelect?: () => void }) {
  const Icon = SITE_ICON[s.site];
  const color = SITE_COLOR[s.site];
  return (
    <button
      onClick={() => (onSelect ? onSelect() : void openSite(accountId, s.site))}
      title={onSelect ? `${s.detail}. Click for the breakdown and your AI instructions.` : `${s.detail}. Click to open ${SITE_SHORT[s.site]}.`}
      className="glass-tile group relative flex flex-col gap-2.5 overflow-hidden rounded-2xl p-3.5 text-left transition hover:-translate-y-0.5"
    >
      <div className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-[0.12] blur-2xl transition group-hover:opacity-25" style={{ background: color }} />
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10" style={{ background: `${color}22` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            {SITE_SHORT[s.site]}
            {s.watchOnly && <Eye className="h-3 w-3 text-sky-300" />}
          </div>
          <div className="truncate font-mono text-[11px] text-krypt-muted">{s.who}</div>
        </div>
        <span className={cls('h-2 w-2 shrink-0 rounded-full', TONE_DOT[s.tone])} />
      </div>
      {compact ? (
        <div className="flex items-center justify-between text-[11px]">
          <span className={TONE_TEXT[s.tone]}>{s.state}</span>
          <span className="font-mono text-krypt-muted">
            {s.posts.done}/{s.posts.target} posts{s.day ? ` · day ${s.day}` : ''}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Ring done={s.posts.done} target={s.posts.target} color={color} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Meter label={s.site === 'pinterest' ? 'reactions' : 'likes'} m={s.likes} />
              <Meter label="follows" m={s.follows} />
              <Meter label={quotaLabel('saves', s.site)} m={s.saves} />
              <Meter label={quotaLabel('comments', s.site)} m={s.comments} />
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className={TONE_TEXT[s.tone]}>{s.state}</span>
            <span className="font-mono text-krypt-muted">{s.day ? `day ${s.day} · ${s.phase}` : (s.phase ?? 'posts today')}</span>
          </div>
        </>
      )}
    </button>
  );
}
