import type { GlassOptics } from '@samasante/liquid-glass';

// Tuned optics for the hub's glass surfaces, one bag per role.
//
// `strength` is deliberately absent: the library expresses refraction as a
// fraction of the box diagonal, so one number reads as a 4px rim on a button
// and a 50px smear on a full-width hero. Each preset instead names the
// displacement it wants in PIXELS (`bendPx`) and GlassPanel converts that to a
// strength from the measured box, so every surface bends by the same physical
// amount whatever its size.
//
// `frost` here is the backdrop blur in px (material mode). It must be 0 on any
// lens that sits ON TOP of text (the nav pill, the segmented lens): a blurred
// backdrop there is the label under it going soft.

/**
 * Displacement-map raster size, for EVERY lens. Measured in Krypt's Electron
 * apps: Blink re-decodes a backdrop filter's <feImage> map every frame once it
 * is large enough (one 256px map costs ~4 ms/frame whatever the lens size).
 * 64 made the cost vanish; the map is smooth and bilinearly stretched, so it
 * reads the same on a wide bar.
 */
export const GLASS_MAP_SIZE = 64;

// Dispersion (the RGB split) is the expensive part of a lens: it runs the
// displacement three times plus two composites. It is reserved for the sliding
// selection pill; every other preset bends without it.

export type GlassPreset = 'chrome' | 'hero' | 'button' | 'card' | 'pill' | 'modal';

export interface PresetSpec {
  /** Max displacement at the rim, in px. */
  bendPx: number;
  optics: Partial<GlassOptics>;
}

export const GLASS_PRESETS: Record<GlassPreset, PresetSpec> = {
  // The sidebar. Tall panel: no body dome (curvature 0), which is what stops a
  // stretched lens map "blooming an oval"; only a thin rim meniscus bends.
  chrome: {
    bendPx: 9,
    optics: {
      mapSize: GLASS_MAP_SIZE,
      depth: 0.22,
      curvature: 0,
      bend: 0.6,
      bendWidth: 0.1,
      dispersion: 0,
      frost: 22,
      saturate: 1.6,
      sheen: 0.32,
      sheenWidth: 2,
      sheenFalloff: 1.6,
      sheenAngle: 60,
      glow: 0.06,
      glowSpread: 0.6,
      specular: 0.9,
      brightness: 0,
    },
  },
  // The Home hero: a wide banner, so the same flat-centre rim as chrome with a
  // little more bend and sheen, and a lighter frost so the aurora glows through.
  hero: {
    bendPx: 12,
    optics: {
      mapSize: GLASS_MAP_SIZE,
      depth: 0.24,
      curvature: 0,
      bend: 0.55,
      bendWidth: 0.08,
      dispersion: 0,
      frost: 16,
      saturate: 1.7,
      sheen: 0.45,
      sheenWidth: 2,
      sheenFalloff: 1.5,
      sheenAngle: 55,
      glow: 0.08,
      glowSpread: 0.7,
      specular: 1,
      brightness: 0,
    },
  },
  // Hero buttons: a real little dome so the backdrop visibly magnifies.
  button: {
    bendPx: 6,
    optics: {
      mapSize: GLASS_MAP_SIZE,
      depth: 0.55,
      curvature: 0.3,
      bend: 0.55,
      bendWidth: 0.2,
      dispersion: 0,
      frost: 4,
      saturate: 1.5,
      sheen: 0.55,
      sheenWidth: 1.5,
      sheenFalloff: 1.4,
      sheenAngle: 50,
      glow: 0.16,
      glowSpread: 0.7,
      specular: 1.1,
      brightness: 0,
    },
  },
  // Stat tiles and the Home status cards. Frosted enough that the numbers on
  // top stay crisp against a moving backdrop; the rim carries the "glass" read.
  card: {
    bendPx: 10,
    optics: {
      mapSize: GLASS_MAP_SIZE,
      depth: 0.28,
      curvature: 0.08,
      bend: 0.5,
      bendWidth: 0.12,
      dispersion: 0,
      frost: 18,
      saturate: 1.5,
      sheen: 0.38,
      sheenWidth: 2,
      sheenFalloff: 1.5,
      sheenAngle: 55,
      glow: 0.08,
      glowSpread: 0.8,
      specular: 1,
      brightness: 0,
    },
  },
  // The sliding selection lens (nav pill, segmented controls). Sits over the
  // label: zero frost, flat centre (low depth, no dome) so the text in the
  // middle reads crisp while the rim bends and splits colour.
  pill: {
    bendPx: 7,
    optics: {
      mapSize: GLASS_MAP_SIZE,
      depth: 0.3,
      curvature: 0,
      bend: 0.75,
      bendWidth: 0.2,
      dispersion: 0.7,
      frost: 0,
      saturate: 1.25,
      sheen: 0.7,
      sheenWidth: 1.5,
      sheenFalloff: 1.3,
      sheenAngle: 45,
      glow: 0.22,
      glowSpread: 0.6,
      glowFalloff: 0.8,
      specular: 1.15,
      brightness: 0,
    },
  },
  // Dialogs and toasts. Moderate frost: the blur runs BEFORE the displacement,
  // so a thick frost leaves the rim nothing to bend. Legibility comes from the
  // darker modal tint instead.
  modal: {
    bendPx: 18,
    optics: {
      mapSize: GLASS_MAP_SIZE,
      depth: 0.2,
      curvature: 0.04,
      bend: 0.55,
      bendWidth: 0.08,
      dispersion: 0,
      frost: 12,
      saturate: 1.7,
      sheen: 0.42,
      sheenWidth: 2,
      sheenFalloff: 1.5,
      sheenAngle: 50,
      glow: 0.07,
      glowSpread: 0.6,
      specular: 1,
      brightness: 0,
    },
  },
};

/** The dark glass body every tinted surface sits on, so text keeps its
 *  contrast whatever the aurora is doing behind it. */
const BODY = 'linear-gradient(160deg, rgba(22,18,38,0.8), rgba(11,10,18,0.86))';

/** Tints (the translucent colour IS the glass tint in material mode: an
 *  opaque one hides the refraction entirely). */
export const GLASS_TINTS = {
  chrome: 'linear-gradient(180deg, rgba(16,13,28,0.76), rgba(9,8,15,0.72))',
  card: BODY,
  button: 'linear-gradient(180deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))',
  pill: 'linear-gradient(135deg, rgba(99,102,241,0.22), rgba(168,85,247,0.18) 50%, rgba(236,72,153,0.18))',
  modal: 'linear-gradient(170deg, rgba(24,20,42,0.82), rgba(12,11,20,0.88))',
  // Brand gradient over a dark body: the Home hero.
  hero: 'linear-gradient(135deg, rgba(99,102,241,0.30), rgba(168,85,247,0.16) 50%, rgba(236,72,153,0.18)), linear-gradient(160deg, rgba(14,11,26,0.58), rgba(10,9,18,0.66))',
  // Autopilot on: the same brand wash, card-dark underneath.
  brand: `linear-gradient(135deg, rgba(99,102,241,0.22), rgba(168,85,247,0.11) 50%, rgba(236,72,153,0.11)), ${BODY}`,
  warn: `linear-gradient(160deg, rgba(245,158,11,0.13), rgba(245,158,11,0.02) 60%), ${BODY}`,
  good: `linear-gradient(160deg, rgba(16,185,129,0.09), rgba(16,185,129,0.01) 60%), ${BODY}`,
} as const;

/** Coloured hairline + bloom for a tinted glass surface (box-shadow). */
export const GLASS_RINGS = {
  brand: 'inset 0 0 0 1px rgba(168,85,247,0.4), 0 0 28px -6px rgba(168,85,247,0.45), var(--glass-shadow)',
  warn: 'inset 0 0 0 1px rgba(251,191,36,0.3), 0 0 30px -14px rgba(245,158,11,0.5), var(--glass-shadow)',
  good: 'inset 0 0 0 1px rgba(52,211,153,0.2), 0 0 30px -16px rgba(16,185,129,0.45), var(--glass-shadow)',
} as const;
