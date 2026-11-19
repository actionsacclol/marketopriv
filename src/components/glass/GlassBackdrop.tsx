import { cls } from '../../lib/format';
import { useHubActive } from '../../lib/hubActive';
import { useLiveGlass } from './glassQuality';

/**
 * The living backdrop behind the whole hub: slow aurora light in the Krypt
 * indigo / purple / pink, a faint grid and film grain. Glass only reads as
 * glass when there is something behind it to bend: over flat near-black a
 * refracting rim is invisible, so this layer is what every glass surface is
 * actually showing off.
 *
 * Cost rules: the blobs are pre-softened radial gradients (no CSS
 * `filter: blur`, which would re-run per frame) animated on `transform` only,
 * so each is one GPU texture the compositor slides around. Grid, grain and
 * vignette are static.
 *
 * `still` freezes the drift (Studio passes it while the reel preview canvas is
 * playing: a moving backdrop makes every frosted card re-blur every frame).
 * The drift also stops when live glass is off (Frost quality, or the Auto
 * watchdog demoted this machine), since that is the "this machine is slow"
 * signal. And it stops whenever nobody is using the hub (window unfocused, or
 * no input for a while): the hub sits open between autopilot runs, and the
 * drift alone cost 70-140% of a CPU core there (lib/hubActive.ts).
 */
export function GlassBackdrop({ still = false }: { still?: boolean }) {
  const live = useLiveGlass();
  const active = useHubActive();
  return (
    <div aria-hidden className={cls('glass-backdrop', (still || !live || !active) && 'glass-backdrop-still')}>
      <div className="glass-aurora glass-aurora-a" />
      <div className="glass-aurora glass-aurora-b" />
      <div className="glass-aurora glass-aurora-c" />
      <div className="glass-aurora glass-aurora-d" />
      <div className="glass-grid" />
      <div className="glass-grain" />
      <div className="glass-vignette" />
    </div>
  );
}
