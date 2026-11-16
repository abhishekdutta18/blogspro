// runtime.js — Progressive enhancement for rendered charts. Charts are complete without it
// (static SVG, native <title> tooltips, data table); this adds what touch screens lack:
//   - tap / hover tooltips on every mark (native <title> never shows on touch),
//   - a crosshair on line charts that reads out every series at the nearest category,
//   - the container-query CSS that swaps the wide SVG for the narrow one in small columns.
//
// enhanceCharts must stay self-contained (no imports, no closure over module scope): the page
// version is its own source text, inlined via Function.prototype.toString().

/** Below this container width the narrow SVG is shown (wide min-width 480 + figure padding). */
const NARROW_BREAKPOINT = 519;

const CHART_CSS = [
  `@container (max-width:${NARROW_BREAKPOINT}px){.bp-plot>.bp-wide{display:none!important}.bp-plot>.bp-narrow{display:block!important}}`,
  // Horizontal drags on a narrow line chart move the crosshair; vertical drags still scroll the page.
  '.bp-narrow svg{touch-action:pan-y}',
  '.bp-tip{position:fixed;z-index:2147483000;pointer-events:none;max-width:240px;padding:6px 9px;border:1px solid;border-radius:4px;font:11px/1.45 system-ui,sans-serif;white-space:pre-line;box-shadow:0 2px 8px rgba(0,0,0,.25)}',
].join('');

/**
 * Attach tooltip + crosshair behaviour to every `.bp-chart` in `doc`, now and later (delegated
 * listeners, so charts mounted after this call work too). Idempotent per document.
 * @param {Document} doc
 */
export function enhanceCharts(doc) {
  const root = doc.documentElement;
  if (!root || root.hasAttribute('data-bp-charts')) return;
  root.setAttribute('data-bp-charts', '');
  const SVG_NS = 'http://www.w3.org/2000/svg';
  let tipEl = null;
  let activeCross = null;

  const tooltip = () => {
    if (tipEl) return tipEl;
    tipEl = doc.createElement('div');
    tipEl.className = 'bp-tip';
    tipEl.setAttribute('role', 'status');
    tipEl.hidden = true;
    doc.body.appendChild(tipEl);
    return tipEl;
  };

  // Move each mark's <title> into data-tip (+ aria-label) once, so the browser's own delayed
  // title tooltip does not appear on top of ours. The chart's root <title> stays.
  const prepare = svg => {
    if (svg.hasAttribute('data-bp-ready')) return;
    svg.setAttribute('data-bp-ready', '');
    svg.querySelectorAll('title').forEach(t => {
      const host = t.parentNode;
      if (!host || host === svg) return;
      host.setAttribute('data-tip', t.textContent || '');
      host.setAttribute('aria-label', t.textContent || '');
      t.remove();
    });
  };

  const clearCross = () => {
    if (activeCross) activeCross.replaceChildren();
    activeCross = null;
  };

  const hide = () => {
    if (tipEl) tipEl.hidden = true;
    clearCross();
  };

  const show = (fig, content, x, y) => {
    const el = tooltip();
    const style = doc.defaultView.getComputedStyle(fig);
    el.textContent = content;
    el.style.background = style.backgroundColor;
    el.style.borderColor = style.borderTopColor;
    el.style.color = fig.getAttribute('data-ink') || '';
    el.hidden = false;
    const { innerWidth, innerHeight } = doc.defaultView;
    const box = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, x + 12), innerWidth - box.width - 8);
    const top = y - box.height - 12 < 8 ? Math.min(y + 16, innerHeight - box.height - 8) : y - box.height - 12;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  };

  /** Pointer position in the SVG's own viewBox units. */
  const toSvg = (svg, e) => {
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(ctm.inverse());
  };

  const crosshair = (svg, cross, e) => {
    const p = toSvg(svg, e);
    const top = Number(cross.getAttribute('data-top'));
    const bottom = Number(cross.getAttribute('data-bottom'));
    if (!p || p.y < top - 8 || p.y > bottom + 8) return false;
    const xs = (cross.getAttribute('data-x') || '').split(',').map(Number);
    const i = xs.reduce((best, x, k) => (Math.abs(x - p.x) < Math.abs(xs[best] - p.x) ? k : best), 0);
    const points = [...svg.querySelectorAll(`[data-i="${i}"][data-label]`)];
    if (!points.length) return false;
    const fig = svg.closest('.bp-chart');
    const rule = doc.createElementNS(SVG_NS, 'line');
    [['x1', xs[i]], ['x2', xs[i]], ['y1', top], ['y2', bottom], ['stroke', fig.getAttribute('data-ink') || 'currentColor'], ['stroke-opacity', '0.35'], ['stroke-width', '1']]
      .forEach(([k, v]) => rule.setAttribute(k, String(v)));
    if (activeCross && activeCross !== cross) clearCross();
    cross.replaceChildren(rule);
    activeCross = cross;
    const lines = [points[0].getAttribute('data-cat'), ...points.map(pt => pt.getAttribute('data-label'))];
    show(fig, lines.join('\n'), e.clientX, e.clientY);
    return true;
  };

  const onPointer = e => {
    const target = e.target;
    const svg = target && target.closest ? target.closest('.bp-chart svg') : null;
    if (!svg) {
      if (e.type === 'pointerdown' || e.pointerType === 'mouse') hide();
      return;
    }
    prepare(svg);
    const cross = svg.querySelector('.bp-crosshair');
    if (cross && crosshair(svg, cross, e)) return;
    clearCross();
    const mark = target.closest('[data-tip]');
    if (mark) show(svg.closest('.bp-chart'), mark.getAttribute('data-tip'), e.clientX, e.clientY);
    else if (tipEl) tipEl.hidden = true;
  };

  // Listeners run on every pointer move: a bug here would raise an error per frame and flood
  // error reporting (the Sentry webhook files a GitHub issue per event). The first error is
  // reported once and the runtime switches off; charts stay readable as static SVG.
  const attached = [];
  let disabled = false;
  const disable = err => {
    disabled = true;
    attached.forEach(([type, fn, opts]) => doc.removeEventListener(type, fn, opts));
    root.setAttribute('data-bp-charts', 'off');
    try {
      hide();
    } catch (cleanupErr) {
      // Teardown is best effort; the original error below is the one worth reporting.
      void cleanupErr;
    }
    const view = doc.defaultView;
    if (view && typeof view.reportError === 'function') view.reportError(err);
    else setTimeout(() => { throw err; });
  };
  const on = (type, fn, opts) => {
    const guarded = e => {
      if (disabled) return;
      try {
        fn(e);
      } catch (err) {
        disable(err);
      }
    };
    attached.push([type, guarded, opts]);
    doc.addEventListener(type, guarded, opts);
  };

  on('pointermove', onPointer, { passive: true });
  on('pointerdown', onPointer, { passive: true });
  on('pointerout', e => {
    if (e.pointerType !== 'mouse') return;
    const into = e.relatedTarget;
    if (!into || !into.closest || !into.closest('.bp-chart svg')) hide();
  }, { passive: true });
  on('scroll', hide, { passive: true, capture: true });
  on('keydown', e => { if (e.key === 'Escape') hide(); });
}

/** CSS for the narrow/wide swap and the tooltip (for injecting into a live document's <head>). */
export const chartCss = () => CHART_CSS;

/**
 * Inline page assets: the CSS plus the enhancement script. Add once per page, after the charts.
 * @returns {string}
 */
export function chartPageAssets() {
  return `<style>${CHART_CSS}</style><script>(${enhanceCharts.toString()})(document)</script>`;
}
