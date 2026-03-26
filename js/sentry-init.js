/**
 * BlogsPro Sentry Unified Configuration & Loader
 * Consolidated from multiple HTML files to enable "All Features" globally.
 * If the Sentry SDK is not already loaded, this script will fetch it automatically.
 */
(function() {
  const SENTRY_SDK_URL = "https://browser.sentry-cdn.com/10.44.0/bundle.min.js";

  function initSentry() {
    if (typeof Sentry === 'undefined') {
      console.error('[Sentry] SDK failed to load. Tracking unavailable.');
      return;
    }

    if (Sentry.getOptions?.()) {
      console.log('[Sentry] Already initialized.');
      return;
    }

    Sentry.init({
      dsn: "https://c75786fd93da9331cedca5e3ec8bd9cd@o4511069230530560.ingest.de.sentry.io/4511069332832336",
      environment: window.location.hostname === "blogspro.in" ? "production" : "development",
      release: "blogspro@2026-03-26",
      
      // ── PERFORMANCE (ALL FEATURES) ──────────────────────────────────
      tracesSampleRate: 1.0,    // Capture 100% of transactions
      profilesSampleRate: 1.0,  // Capture 100% of profiles

      // ── ERRORS & SESSIONS ───────────────────────────────────────────
      sampleRate: 1.0,          // Capture 100% of errors
      attachStacktrace: true,
      autoSessionTracking: true,

      // ── REPLAYS (ALL FEATURES) ─────────────────────────────────────
      replaysSessionSampleRate: 1.0, // Capture 100% of sessions
      replaysOnErrorSampleRate: 1.0, // Sample 100% of errors into replays

      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,     // Allow text masking to be more informative
          blockAllMedia: false,
        }),
        Sentry.captureConsoleIntegration({ levels: ['error'] }),
        Sentry.httpContextIntegration(),
      ],

      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
        "Network request failed",
        "Failed to fetch"
      ]
    });

    // Global Helpers preserved for backward compatibility
    window.setSentryUser = function(u) { Sentry.setUser(u); };
    window.trackEvent   = function(name, data) {
      Sentry.addBreadcrumb({ message: name, data: data, level: "info" });
    };
    
    console.log('[Sentry] Unified configuration initialized (100% sampling)');
  }

  // Check if SDK is already loaded
  if (typeof Sentry === 'undefined') {
    const script = document.createElement('script');
    script.src = SENTRY_SDK_URL;
    script.crossOrigin = "anonymous";
    script.onload = initSentry;
    script.onerror = () => console.error('[Sentry] Failed to load SDK script.');
    document.head.appendChild(script);
  } else {
    initSentry();
  }
})();
