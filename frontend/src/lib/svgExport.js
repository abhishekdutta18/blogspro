/**
 * "Download SVG" for the homepage charts. The on-page charts are coloured by CSS classes and theme
 * variables, which a saved file cannot see, so the copy gets each element's computed paint written in as
 * attributes, a background in the page colour, a title, and loses the hover-only parts
 * ([data-export="skip"]). The file therefore matches the theme the reader is looking at.
 */

// Presentation properties that decide how a chart mark or label looks.
export const PAINT_PROPS = Object.freeze([
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray', 'stroke-linejoin',
  'stroke-linecap', 'opacity', 'paint-order', 'font-family', 'font-size', 'font-weight', 'font-variant-numeric',
]);

/** "yield-curve-2026-11-23.svg" from a title and a date. */
export function svgFileName(title, date = new Date()) {
  const base = String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'chart';
  return `${base}-${date.toISOString().slice(0, 10)}.svg`;
}

/** A standalone SVG document (text) of `svg` as it currently looks. */
export function serializeChart(svg, title) {
  const copy = svg.cloneNode(true);
  copy.querySelectorAll('[data-export="skip"]').forEach((node) => node.remove());
  const originals = [...svg.querySelectorAll('*')].filter((node) => !node.closest('[data-export="skip"]'));
  [...copy.querySelectorAll('*')].forEach((node, i) => {
    const style = getComputedStyle(originals[i]);
    PAINT_PROPS.forEach((prop) => {
      const value = style.getPropertyValue(prop);
      if (value && value !== 'normal') node.setAttribute(prop, value);
    });
    node.removeAttribute('class');
  });
  const paper = getComputedStyle(document.body).backgroundColor;
  const ns = 'http://www.w3.org/2000/svg';
  const background = document.createElementNS(ns, 'rect');
  ['width', 'height'].forEach((a) => background.setAttribute(a, '100%'));
  background.setAttribute('fill', paper);
  const titleEl = document.createElementNS(ns, 'title');
  titleEl.textContent = title;
  copy.prepend(titleEl, background);
  copy.setAttribute('xmlns', ns);
  copy.removeAttribute('class');
  copy.removeAttribute('hidden');
  copy.removeAttribute('tabindex');
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(copy)}\n`;
}

/** Saves the chart as an .svg file through a temporary object URL. */
export function downloadChart(svg, title) {
  const url = URL.createObjectURL(new Blob([serializeChart(svg, title)], { type: 'image/svg+xml' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: svgFileName(title) });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Wires every [data-svg-download] button inside `root` to the chart in its figure. */
export function wireDownloads(root) {
  root.querySelectorAll('[data-svg-download]').forEach((button) => {
    button.addEventListener('click', () => {
      const svg = button.closest('figure')?.querySelector('svg[data-lc-svg]:not([hidden]), svg[data-detail-svg]:not([hidden])');
      if (svg) downloadChart(svg, button.dataset.svgDownload);
    });
  });
}
