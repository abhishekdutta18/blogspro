// theme.js — Visual tokens for the BlogsPro chart engine.
// Both categorical palettes were validated with the dataviz validator (lightness band, chroma,
// CVD adjacency, normal-vision floor, contrast). ORDER IS THE CVD-SAFETY MECHANISM — do not
// reorder or append without re-running it.
//   dark  vs #070707: all pass (gold stepped #BFA100 -> #a88e00 to sit in the dark L band)
//   light vs #ffffff: all pass; aqua contrast 2.82 < 3:1 -> relief = every chart ships a table view
// Status colors are reserved for gauge state and always paired with a text label.

const STATUS = Object.freeze({ good: '#0ca30c', warning: '#fab219', critical: '#d03b3b', normal: '#64748B' });

export const DARK_THEME = Object.freeze({
  name: 'dark',
  surface: '#070707',
  surface2: '#0d0d0d',
  border: 'rgba(255,255,255,0.08)',
  grid: 'rgba(255,255,255,0.07)',
  baseline: 'rgba(255,255,255,0.28)',
  track: 'rgba(255,255,255,0.08)',
  textPrimary: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  accent: '#a88e00',
  otherSlice: '#475569',
  status: STATUS,
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  series: Object.freeze(['#a88e00', '#3987e5', '#d95926', '#199e70', '#9085e9', '#d55181']),
});

export const LIGHT_THEME = Object.freeze({
  name: 'light',
  surface: '#ffffff',
  surface2: '#f4f6f8',
  border: '#d0d7de',
  grid: 'rgba(0,0,0,0.08)',
  baseline: 'rgba(0,0,0,0.35)',
  track: 'rgba(0,0,0,0.08)',
  textPrimary: '#111111',
  textSecondary: '#444444',
  textMuted: '#666666',
  accent: '#8f7600',
  otherSlice: '#94a3b8',
  status: STATUS,
  fontFamily: "'DM Sans', system-ui, sans-serif",
  series: Object.freeze(['#8f7600', '#2a78d6', '#eb6834', '#1baf7a', '#6250d6', '#d55181']),
});

/**
 * Resolve a theme from a name ('dark' | 'light') or a full theme object.
 * @param {unknown} theme
 * @returns {typeof DARK_THEME}
 */
export function resolveTheme(theme) {
  if (theme === 'light') return LIGHT_THEME;
  if (theme && typeof theme === 'object' && Array.isArray(theme.series)) return /** @type {any} */ (theme);
  return DARK_THEME;
}

/** Color for series/slice index i. Series are capped at palette length, so this never cycles. */
export function seriesColor(theme, i) {
  return theme.series[i] ?? theme.otherSlice;
}
