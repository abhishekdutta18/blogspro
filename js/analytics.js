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

  // 3. Forward to Microsoft Clarity
  if (typeof window.clarity === 'function') {
    window.clarity('event', eventName, params);
  }
}

/**
 * Identifies the user in Sentry and Microsoft Clarity, and sets custom session tags.
 * @param {object|null} user - User identity object, or null for signed-out.
 * @param {'admin'|'user'|'guest'} role - User role for Clarity segmentation.
 */
export function identifyUser(user, role = 'guest') {
  // Sentry
  if (window.Sentry && typeof window.Sentry.setUser === 'function') {
    window.Sentry.setUser(user
      ? { id: user.uid, email: user.email, username: user.displayName }
      : null
    );
  }

  if (!user) {
    if (typeof window.clarity === 'function') {
      window.clarity('set', 'user_role',   'guest');
      window.clarity('set', 'auth_status', 'signed_out');
    }
    return;
  }

  const { uid, email, displayName } = user;

  if (typeof window.clarity === 'function') {
    // clarity('identify', customUserId) — links this session to a user in the dashboard
    window.clarity('identify', uid);
    // clarity('set', key, value) — custom tags visible in session filters
    window.clarity('set', 'user_role',    role);
    window.clarity('set', 'auth_status',  'signed_in');
    window.clarity('set', 'user_email',   email       || 'none');
    window.clarity('set', 'display_name', displayName || 'none');
  }
}

// Global exposure for non-module scripts
window.analytics = { injectUtm, trackEvent, identifyUser };
