// ═══════════════════════════════════════════════
// analytics.js — GA4 and UTM Injection Utilities
// ═══════════════════════════════════════════════

/**
 * Safely appends UTM parameters to a URL.
 * @param {string} url - The base URL.
 * @param {string} source - utm_source (e.g., 'admin', 'newsletter').
 * @param {string} medium - utm_medium (e.g., 'share', 'email').
 * @param {string} campaign - utm_campaign (optional).
 * @returns {string} - The URL with injected UTMs.
 */
export function injectUtm(url, source, medium = 'direct', campaign = 'blogspro') {
  if (!url) return '';
  try {
    const u = new URL(url, window.location.origin);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    if (campaign) u.searchParams.set('utm_campaign', campaign);
    return u.toString();
  } catch (e) {
    console.warn('[analytics] Failed to inject UTM, returning original URL:', e);
    return url;
  }
}

/**
 * Wrapper for GA4 gtag to track custom events and log to Sentry.
 * @param {string} eventName - The name of the event.
 * @param {object} params - Event parameters.
 */
export function trackEvent(eventName, params = {}) {
  // 1. Send to GA4
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  } else {
    console.debug('[analytics] gtag not found, skipping event:', eventName);
  }

  // 2. Add Sentry breadcrumb if available
  if (window.Sentry && typeof window.Sentry.addBreadcrumb === 'function') {
    window.Sentry.addBreadcrumb({
      category: 'analytics',
      message: `Event: ${eventName}`,
      data: params,
      level: 'info'
    });
  }
}

// Global exposure for non-module scripts
window.analytics = { injectUtm, trackEvent };
