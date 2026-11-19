import { useEffect, useMemo, useRef, type ButtonHTMLAttributes } from 'react';
import { glassValue, useLensWobble } from '@samasante/liquid-glass';
import { cls } from '../../lib/format';
import { GlassPanel } from './GlassPanel';
import { GLASS_TINTS } from './glassPresets';

export type GlassButtonVariant = 'default' | 'primary' | 'danger' | 'active';

const TINT: Record<GlassButtonVariant, string> = {
  default: GLASS_TINTS.button,
  // Translucent brand gradient: opaque, it would hide the very refraction that
  // makes it glass. The text-shadow keeps white text legible on it.
  primary: 'linear-gradient(90deg, rgba(99,102,241,0.72), rgba(168,85,247,0.66) 50%, rgba(236,72,153,0.7))',
  danger: 'linear-gradient(180deg, rgba(244,63,94,0.3), rgba(244,63,94,0.1))',
  active: 'linear-gradient(180deg, rgba(168,85,247,0.38), rgba(168,85,247,0.16))',
};

const TEXT: Record<GlassButtonVariant, string> = {
  default: 'text-white/90 hover:text-white',
  primary: 'text-white [text-shadow:0_1px_1px_rgba(0,0,0,0.3)]',
  danger: 'text-rose-200',
  active: 'text-white',
};

/**
 * A hero button in live glass: it bends the backdrop through a small dome,
 * and on press it squashes and springs back through the library's lens wobble
 * (an underdamped spring: the overshoot on release is the "liquid"). The
 * spring only runs while pressed or settling, so it idles at zero cost.
 *
 * Budget: each one is an SVG backdrop filter. Use it for the one or two
 * buttons a page is framed around; everything else is PrimaryButton /
 * GhostButton, the CSS frost of the same look.
 */
export function GlassButton({
  variant = 'default', live = true, className, wrapClassName, children, disabled,
  onPointerDown, onPointerUp, onPointerLeave, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: GlassButtonVariant;
  live?: boolean;
  /** Classes for the glass wrapper (layout: flex-1, ml-auto...). */
  wrapClassName?: string;
}) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const mv = useMemo(() => ({ pos: glassValue(0), stretch: glassValue(0) }), []);
  const holdRef = useRef(0);
  const kickRef = useRef<() => void>(() => {});
  useLensWobble(mv.pos, mv.stretch, holdRef, kickRef);
  useEffect(() => mv.stretch.on('change', (s) => {
    const el = wrap.current;
    if (!el) return;
    el.style.transform = s === 0 ? '' : `scale(${1 - 0.1 * s}, ${1 - 0.2 * s})`;
  }), [mv]);

  const press = (on: boolean): void => {
    if (disabled) return;
    holdRef.current = on ? 0.22 : 0;
    kickRef.current();
  };

  return (
    <GlassPanel
      ref={wrap}
      preset="button"
      live={live}
      display="inline-flex"
      tint={TINT[variant]}
      className={cls(
        'glass-btn shrink-0 rounded-xl',
        `glass-btn-${variant}`,
        disabled && 'opacity-50',
        wrapClassName,
      )}
    >
      <button
        {...rest}
        disabled={disabled}
        onPointerDown={(e) => { press(true); onPointerDown?.(e); }}
        onPointerUp={(e) => { press(false); onPointerUp?.(e); }}
        onPointerLeave={(e) => { if (holdRef.current) press(false); onPointerLeave?.(e); }}
        className={cls(
          'relative inline-flex flex-1 select-none items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium outline-none transition-colors',
          'focus-visible:ring-2 focus-visible:ring-krypt-purple/60 disabled:cursor-not-allowed',
          TEXT[variant],
          className,
        )}
      >
        {children}
      </button>
    </GlassPanel>
  );
}
