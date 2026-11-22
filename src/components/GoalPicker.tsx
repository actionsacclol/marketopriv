import { Rocket, ShoppingBag } from 'lucide-react';
import type { IgAccount, Site } from '@shared/types';
import { GOAL_ABOUT, GOAL_IDS, GOAL_LABEL, goalOf, presetFor, productName, type GoalId } from '@shared/goals';
import { KRYPT_TOOLS } from '@shared/kryptPack';
import { isKryptBrand } from '@shared/brand';
import { DEFAULT_TARGETS, SITE_LABEL } from '@shared/warmup';
import { cls } from '../lib/format';
import { useApp } from '../state/store';
import { GhostButton } from './ui';

// Mass growth or Push product, for one account on one platform (shared/goals.ts).

export const GOAL_ICON: Record<GoalId, typeof Rocket> = { grow: Rocket, product: ShoppingBag };

/** The two goals as big buttons. Used here and in the setup wizard. */
export function GoalButtons({ value, onChange }: { value: GoalId; onChange: (g: GoalId) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {GOAL_IDS.map((g) => {
        const Icon = GOAL_ICON[g];
        const on = value === g;
        return (
          <button
            key={g}
            onClick={() => onChange(g)}
            className={cls('rounded-xl border p-3 text-left transition', on ? 'border-krypt-purple/60 bg-krypt-purple/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Icon className={cls('h-4 w-4', on ? 'text-krypt-purple' : 'text-krypt-muted')} /> {GOAL_LABEL[g]}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-krypt-muted">{GOAL_ABOUT[g]}</p>
          </button>
        );
      })}
    </div>
  );
}

/** What to push: a Krypt tool (or all of them, one per reel) for the Krypt brand, free text otherwise. */
export function ProductField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const brand = useApp((s) => s.db!.brand);
  if (isKryptBrand(brand))
    return (
      <select className="input text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">All Krypt tools, one per reel</option>
        {KRYPT_TOOLS.filter((t) => t.released !== false && t.id !== 'marketo').map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );
  return <input className="input text-sm" placeholder={brand.name ? `${brand.name}${brand.site ? ` (${brand.site})` : ''}` : 'Product name and link'} value={value} onChange={(e) => onChange(e.target.value)} />;
}

/** Home > a platform: the goal for this account there. */
export function GoalPicker({ a, site }: { a: IgAccount; site: Site }) {
  const brand = useApp((s) => s.db!.brand);
  const toast = useApp((s) => s.toast);
  const goal = goalOf(a, site);
  const preset = presetFor(site, goal);
  const L = SITE_LABEL[site];
  const save = async (patch: Partial<IgAccount>, msg: string): Promise<void> => {
    const r = await window.marketo.db.saveAccount({ id: a.id, ...patch });
    toast(r.ok ? 'ok' : 'error', r.ok ? msg : r.message ?? 'Could not save.');
  };
  const target = a.targets?.[site] ?? DEFAULT_TARGETS[site];
  return (
    <div className="space-y-3">
      <GoalButtons value={goal} onChange={(g) => void save({ goals: { ...(a.goals ?? {}), [site]: g } }, `${L}: ${GOAL_LABEL[g]}. Runs follow it from the next one.`)} />
      {goal === 'product' && (
        <div className="space-y-1">
          <label className="label">What to push</label>
          <ProductField value={a.pushProduct ?? ''} onChange={(v) => void save({ pushProduct: v }, `Pushing ${productName({ pushProduct: v }, brand)}.`)} />
        </div>
      )}
      {preset ? (
        <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs leading-relaxed text-white/75">
          <p>{preset.summary.split('{product}').join(productName(a, brand))}</p>
          <p className="text-krypt-muted">Judged by: {preset.measure}</p>
          {preset.postsPerDay > target && (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-krypt-muted">
                Built for {preset.postsPerDay} posts a day on {L}; this account aims for {target}. Your post limit still decides.
              </p>
              <GhostButton small onClick={() => void save({ targets: { ...(a.targets ?? {}), [site]: preset.postsPerDay } }, `${L}: aiming for ${preset.postsPerDay} posts a day.`)}>
                Aim for {preset.postsPerDay} a day
              </GhostButton>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs text-krypt-muted">The researched playbook for {L} comes soon; until then runs here work as before, and the goal is saved for when it lands.</p>
      )}
    </div>
  );
}
