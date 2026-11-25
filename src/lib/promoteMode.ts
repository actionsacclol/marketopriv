import type { ActionResult, Brand, Db, IgAccount, PromoteMode, PromoteModeSave } from '@shared/types';
import { CLIPS_BRAND, EMPTY_BRAND, isKryptBrand, kryptBrandFor } from '@shared/brand';

// What a profile is for: Krypt's tools, the user's own business, a clip channel, or a long-form YouTube channel
// (long videos made in Krypt Editor; shared/longform.ts; known only by settings.promoting). Each mode keeps its own copy
// (the brand form, and every account's styles), so switching away and back restores it as it was.

export const clipsOnly = (a?: Pick<IgAccount, 'styles'>): boolean => a?.styles?.length === 1 && a.styles[0] === 'clipping';

export function modeOf(db: Pick<Db, 'settings' | 'brand' | 'igAccounts'>): PromoteMode {
  if (db.settings.promoting) return db.settings.promoting;
  if (isKryptBrand(db.brand)) return 'krypt';
  // Saved before the mode was stored: the clip-channel description, or accounts that only clip.
  if (db.brand.what.trim() === CLIPS_BRAND.what) return 'clips';
  return db.igAccounts.length > 0 && db.igAccounts.every(clipsOnly) ? 'clips' : 'own';
}

/** The brand form a mode starts from: its saved copy, else Krypt's built-in brand, the clip-channel defaults or an empty form. */
export function brandFor(db: Pick<Db, 'settings' | 'brand'>, mode: PromoteMode, current: Brand): Brand {
  const keep = { setupDone: current.setupDone, ...(current.creator ? { creator: current.creator } : {}) };
  if (mode === 'krypt') return kryptBrandFor({ ...current, ...keep });
  const saved = db.settings.brandModes?.[mode]?.brand;
  if (saved) return { ...saved, ...keep };
  return { ...(mode === 'clips' ? CLIPS_BRAND : EMPTY_BRAND), ...keep };
}

/**
 * Save `brand` as the profile's brand in `to` mode. When the mode changes, the old mode's brand form and account
 * styles are kept, and the new mode's styles come back (a clip channel runs only the clipping style).
 */
export async function savePromoting(db: Db, from: PromoteMode, to: PromoteMode, fromBrand: Brand, brand: Brand): Promise<ActionResult<Brand>> {
  const r = await window.marketo.brand.save({ ...brand, setupDone: true });
  if (!r.ok || !r.data) return r;
  const modes = { ...(db.settings.brandModes ?? {}) };
  if (from !== to) {
    const styles: PromoteModeSave['styles'] = {};
    for (const a of db.igAccounts) styles[a.id] = { ...(a.styles ? { styles: a.styles } : {}), ...(a.styleMix ? { styleMix: a.styleMix } : {}) };
    modes[from] = { ...(from === 'krypt' ? {} : { brand: fromBrand }), styles };
    const back = modes[to]?.styles;
    for (const a of db.igAccounts) {
      const saved = back?.[a.id];
      // [] = the starting point (every built-in style on); a clip channel runs the clipping style alone.
      const next = saved ? { styles: saved.styles ?? [], ...(saved.styleMix ? { styleMix: saved.styleMix } : {}) } : to === 'clips' ? { styles: ['clipping'] } : clipsOnly(a) ? { styles: [] } : null;
      if (!next) continue;
      const s = await window.marketo.db.saveAccount({ id: a.id, ...next });
      if (!s.ok) return { ok: false, message: s.message ?? `Could not change ${a.handle}'s styles.` };
    }
  }
  if (to !== 'krypt') modes[to] = { ...(modes[to] ?? {}), brand: r.data };
  const st = await window.marketo.db.updateSettings({ promoting: to, brandModes: modes });
  if (!st.ok) return { ok: false, message: st.message ?? 'Could not save.' };
  return r;
}
