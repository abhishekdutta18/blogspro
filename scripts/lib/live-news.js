/**
 * Live news-wire items for the briefing (daily) and terminal (hourly) templates.
 * Items are scraped headlines and therefore untrusted: each item's text comes back
 * HTML-escaped, so templates only add their own label/layout markup around it.
 */
import { escapeHtml } from './html-sanitizer.js';

const STABLE_BASELINE = "Pulse Baseline: Stable.";
const NEUTRAL = "Neutral.";
const ITEM_SEPARATOR = ' | ';
const GLOBAL_MARKER = ' | GLOBAL: ';

/**
 * @typedef {{ label: string | null, html: string }} NewsItem  `html` is escaped item text; `label` is
 *   'RBI' | 'SEBI' | 'GLOBAL' for the object shape and null for the legacy string shape.
 * @param {string | { rbi?: string, sebi?: string, summary?: string } | null | undefined} liveNews
 * @param {{ splitRegulatorItems?: boolean }} [options]  split RBI/SEBI text on ' | ' into separate items
 * @returns {NewsItem[]} empty when there is nothing worth showing
 */
export function liveNewsItems(liveNews, { splitRegulatorItems = false } = {}) {
    if (!liveNews || liveNews === STABLE_BASELINE) return [];
    if (typeof liveNews === 'string') {
        return liveNews.split(ITEM_SEPARATOR).map(text => ({ label: null, html: escapeHtml(text) }));
    }
    const regulator = (label, text) => {
        if (!text || text === NEUTRAL) return [];
        const parts = splitRegulatorItems ? String(text).split(ITEM_SEPARATOR) : [text];
        return parts.map(part => ({ label, html: escapeHtml(part) }));
    };
    const globalOnly = String(liveNews.summary || "").split(GLOBAL_MARKER)[1];
    const global = globalOnly ? globalOnly.split(ITEM_SEPARATOR).map(text => ({ label: 'GLOBAL', html: escapeHtml(text) })) : [];
    return [...regulator('RBI', liveNews.rbi), ...regulator('SEBI', liveNews.sebi), ...global];
}
