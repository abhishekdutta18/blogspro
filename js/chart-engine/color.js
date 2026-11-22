// color.js — Perceptual color mixing for heatmap ramps. Interpolating in OKLab keeps equal data
// steps looking like equal color steps (sRGB mixing goes muddy and uneven mid-ramp). Pure.

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = n => Math.min(1, Math.max(0, n));

/** #rrggbb -> [L, a, b] in OKLab. */
function hexToOklab(hex) {
  const [r, g, b] = [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** [L, a, b] in OKLab -> #rrggbb (out-of-gamut channels clamped). */
function oklabToHex([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return `#${rgb.map(c => Math.round(clamp01(toGamma(clamp01(c))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Color `t` of the way from `a` to `b` (0 -> a, 1 -> b), mixed in OKLab.
 * @param {string} a #rrggbb
 * @param {string} b #rrggbb
 * @param {number} t
 * @returns {string} #rrggbb
 */
export function mix(a, b, t) {
  const [p, q] = [hexToOklab(a), hexToOklab(b)];
  const k = clamp01(t);
  return oklabToHex(p.map((v, i) => v + (q[i] - v) * k));
}

/** WCAG relative luminance of #rrggbb. */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Whichever of two inks reads better on `background` (higher WCAG contrast). */
export function readableInk(background, dark = '#000000', light = '#ffffff') { // pure black/white: one always clears 4.58:1
  const bg = luminance(background);
  const ratio = ink => {
    const [hi, lo] = [luminance(ink), bg].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  return ratio(dark) >= ratio(light) ? dark : light;
}
