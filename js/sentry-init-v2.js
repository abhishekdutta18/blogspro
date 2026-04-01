/**
 * BlogsPro Sentry Unified Configuration & Loader
 * Consolidated from multiple HTML files to enable "All Features" globally.
 * If the Sentry SDK is not already loaded, this script will fetch it automatically.
 */
(function() {
  const SENTRY_VERSION = "10.44.0";
  const BUNDLE_URL = `https://browser.sentry-cdn.com/${SENTRY_VERSION}/bundle.tracing.replay.min.js`;
  const SENTRY_RELEASE = "blogspro@2026-04-01";
  const INIT_FLAG = "__BLOGSPRO_SENTRY_INIT_V2__";

  function initSentry() {
    if (typeof Sentry === 'undefined' || !Sentry.init) {
      console.error('[Sentry] SDK failed to load. Tracking unavailable.');
      return;
    }

    if (Sentry.getOptions?.()) {
      console.log('[Sentry] Already initialized.');
      return;
    }

    // Known transient domains — routine CORS/network poll failures from these
    // hosts are expected and should not flood Sentry. Auth/token errors are
    // still allowed through so expired Upstox tokens surface in the dashboard.
    const NOISY_HOSTS = [
      "ticker.json",
      "tradingview.com",
      "s3.tradingview.com",
    ];

    Sentry.init({
      dsn: "https://c75786fd93da9331cedca5e3ec8bd9cd@o4511069230530560.ingest.de.sentry.io/4511069332832336",
      environment: window.location.hostname === "blogspro.in" ? "production" : "development",
      release: SENTRY_RELEASE,

      // Reduced from 1.0 — capture 10% of traces in production to avoid quota burn
      tracesSampleRate: window.location.hostname === "blogspro.in" ? 0.1 : 1.0,
      profilesSampleRate: 0.1,

      sampleRate: 1.0,
      attachStacktrace: true,
      autoSessionTracking: true,

      replaysSessionSampleRate: 0.05,   // 5% of sessions
      replaysOnErrorSampleRate: 1.0,    // 100% of sessions with errors

      integrations: [
        Sentry.browserTracingIntegration(),
        Sentry.replayIntegration({
          maskAllText: false,
          blockAllMedia: false,
        }),
        Sentry.httpContextIntegration(),
        // captureConsoleIntegration excluded — it was capturing every pollMarkets CORS failure
      ],

      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
        "Network request failed",
        /Failed to fetch/,
        /NetworkError/,
        /Load failed/,
        /CORS/i,
      ],

      beforeSend(event, hint) {
        const msg = (event.message || "") + JSON.stringify(hint?.originalException || "");

        // Always let Upstox auth/token errors through to Sentry
        const isUpstoxAuth = msg.includes("tokenExpired") || msg.includes("TOKEN EXPIRED") ||
          (msg.includes("upstox") && /401|auth|token/i.test(msg));
        if (isUpstoxAuth) return event;

        // Drop events from known noisy polling hosts (CORS/network transients only)
        if (NOISY_HOSTS.some(h => msg.includes(h))) return null;

        // Drop generic fetch/network errors from market-data background polling
        const err = hint?.originalException;
        if (err instanceof TypeError && /fetch|network/i.test(err.message) &&
            msg.includes("workers.dev")) return null;

        return event;
      },
    });

    window.setSentryUser = function(u) { Sentry.setUser(u); };
    window.trackEvent   = function(name, data) {
      Sentry.addBreadcrumb({ message: name, data: data, level: "info" });
    };

    // BlogsPro Intelligence Pulse Tracking
    window.trackPulse = function(freq, status, metadata = {}) {
      Sentry.withScope((scope) => {
        scope.setTag("pulseFrequency", freq);
        scope.setTag("ingestionStatus", status);
        scope.setContext("pulse_metadata", metadata);
        Sentry.captureMessage(`Pulse Sync: ${freq.toUpperCase()} - ${status}`, "info");
      });
    };
    
    console.log('[Sentry] BlogsPro Intelligence V4.0 Observability Active');
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Load bundles and initialize
  if (window[INIT_FLAG]) {
    return;
  }
  window[INIT_FLAG] = true;

  if (typeof Sentry === 'undefined') {
    loadScript(BUNDLE_URL).then(initSentry).catch(err => {
      console.error('[Sentry] Failed to load SDK bundle:', err);
    });
  } else {
    initSentry();
  }
})();
