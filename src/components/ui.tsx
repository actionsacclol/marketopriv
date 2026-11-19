import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cls } from '../lib/format';
import { useApp } from '../state/store';
import type { ReelStatus } from '@shared/types';
import { GlassPanel } from './glass/GlassPanel';
import { GlassSwitch } from './glass/GlassSwitch';
import { GLASS_TINTS } from './glass/glassPresets';
import { useLiveGlass } from './glass/glassQuality';

// Krypt UI kit (same look as Krypt Editor / kryptguidelines §3.6), in the
// liquid-glass material: Card is CSS frost glass (cheap enough for every page),
// Stat is live glass, buttons are frosted capsules. See components/glass/.

export function Page({ title, subtitle, actions, children, flush }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-end justify-between gap-4 px-8 pb-5 pt-7">
        <div>
          <h1 className="glass-title text-3xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-krypt-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      <div className={cls('min-h-0 flex-1', flush ? '' : 'overflow-auto px-8 pb-8')}>{children}</div>
    </div>
  );
}

export function Section({ title, description, actions, children, className }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cls('mb-8', className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            {title && <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-krypt-muted">{title}</h2>}
            {description && <p className="mt-1 text-xs text-krypt-muted/80">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Card({ className, children, hoverable, padded = true, onClick }: { className?: string; children: ReactNode; hoverable?: boolean; padded?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cls(
        'glass-card rounded-2xl',
        padded && 'p-5',
        hoverable && 'glass-card-hover cursor-pointer',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({ onClick, disabled, children, className }: { onClick?: () => void; disabled?: boolean; children: ReactNode; className?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cls(
        'krypt-btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition',
        'hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function GhostButton({ onClick, disabled, children, className, destructive, small }: { onClick?: () => void; disabled?: boolean; children: ReactNode; className?: string; destructive?: boolean; small?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cls(
        'inline-flex items-center justify-center gap-2 rounded-xl border font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        small ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm',
        destructive ? 'krypt-btn-danger text-rose-200' : 'krypt-btn-ghost text-white/90 hover:text-white',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * The whole row (switch + label) stays one click target, as before. With live
 * glass the thumb is the library's glass switch (the lens IS the thumb); it
 * owns its own clicks and drags, so the row ignores events from inside it,
 * otherwise one tap would toggle twice. Keyboard users get the real
 * <input role="switch"> inside it. Frost quality gets a plain CSS switch.
 */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  const live = useLiveGlass();
  return (
    <div onClick={() => onChange(!on)} className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-white/90">
      <span className="inline-flex shrink-0" onClick={(e) => e.stopPropagation()}>
        {live ? <GlassSwitch checked={on} onCheckedChange={onChange} ariaLabel={label} width={38} height={21} /> : <FrostSwitch on={on} onChange={onChange} label={label} />}
      </span>
      {label}
    </div>
  );
}

/** The switch without an SVG lens (Frost quality): same box and colours, a CSS thumb, still a real <input role="switch">. */
function FrostSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="relative inline-flex h-[21px] w-[38px] cursor-pointer items-center">
      <input type="checkbox" role="switch" className="peer sr-only" checked={on} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span
        className={cls(
          'absolute inset-0 rounded-full border transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-krypt-purple/60',
          on ? 'border-krypt-purple/60 bg-krypt-gradient shadow-[0_0_12px_-2px_rgba(168,85,247,0.7)]' : 'border-white/10 bg-white/[0.12]',
        )}
      />
      <span className={cls('absolute left-[3px] h-[15px] w-[15px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out', on && 'translate-x-[17px]')} />
    </label>
  );
}

/** Stat tiles are live glass: there are only a few per page, so they fit the live-glass budget. */
export function Stat({ label, value, sub, accent }: { label: string; value: ReactNode; sub?: ReactNode; accent?: boolean }) {
  return (
    <GlassPanel preset="card" tint={GLASS_TINTS.card} className="min-w-0 rounded-2xl p-5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-krypt-muted">{label}</div>
      <div className={cls('mt-2 truncate font-mono text-3xl font-semibold', accent ? 'text-krypt-gradient' : 'text-white [text-shadow:0_1px_12px_rgba(0,0,0,0.5)]')}>{value}</div>
      {sub && <div className="mt-1 truncate text-xs text-krypt-muted">{sub}</div>}
    </GlassPanel>
  );
}

const STATUS: Record<ReelStatus, string> = {
  draft: 'border-white/15 bg-white/5 text-white/70',
  rendered: 'border-indigo-400/40 bg-indigo-500/15 text-indigo-200',
  posted: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200',
};

export function StatusChip({ status }: { status: ReelStatus }) {
  return <span className={cls('rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', STATUS[status])}>{status}</span>;
}

export function Tag({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <span onClick={onClick} className={cls('rounded-full border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/70', onClick && 'cursor-pointer hover:border-krypt-purple/50')}>
      {children}
    </span>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 py-14 text-center">
      <div className="mb-3 text-krypt-purple">{icon}</div>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-krypt-muted">{children}</div>}
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-[360px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cls(
            'pointer-events-auto flex animate-pop-in items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_22px_44px_-18px_rgba(0,0,0,0.85)] backdrop-blur-md backdrop-saturate-150',
            t.kind === 'ok' && 'border-emerald-400/30 bg-emerald-950/80 text-emerald-100',
            t.kind === 'warn' && 'border-amber-400/30 bg-amber-950/80 text-amber-100',
            t.kind === 'error' && 'border-rose-400/30 bg-rose-950/85 text-rose-100',
          )}
        >
          <div className="flex-1 break-words">{t.text}</div>
          <button onClick={() => dismiss(t.id)} className="opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
