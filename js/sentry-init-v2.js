/**
 * BlogsPro Sentry Unified Configuration & Loader
 * Consolidated from multiple HTML files to enable "All Features" globally.
 * If the Sentry SDK is not already loaded, this script will fetch it automatically.
 */
(function() {
  const SENTRY_VERSION = "10.44.0";
  const CACHE_BUST = Date.now(); // Cache-busting timestamp
  const BUNDLE_URL = `https://browser.sentry-cdn.com/${SENTRY_VERSION}/bundle.tracing.replay.min.js?v=${CACHE_BUST}`;
  const CAPTURE_CONSOLE_URL = `https://browser.sentry-cdn.com/${SENTRY_VERSION}/captureconsole.min.js?v=${CACHE_BUST}`;

  function initSentry() {
    if (typeof Sentry === 'undefined' || !Sentry.init) {
      console.error('[Sentry] SDK failed to load. Tracking unavailable.');
      return;
    }

    if (Sentry.getOptions?.()) {
      console.log('[Sentry] Already initialized.');
      return;
    }

    // Known transient domains — CORS/network failures from these are expected
    // and should not be sent to Sentry.
    const NOISY_HOSTS = [
      "blogspro-upstox",
      "abhishek-dutta1996.workers.dev",
      "ticker.json",
      "tradingview.com",
      "s3.tradingview.com",
    ];

    Sentry.init({
      dsn: "https://c75786fd93da9331cedca5e3ec8bd9cd@o4511069230530560.ingest.de.sentry.io/4511069332832336",
      environment: window.location.hostname === "blogspro.in" ? "production" : "development",
      release: "blogspro@2026-03-26",

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
        // Drop events whose stack or request URL contains a known noisy host
        const msg = (event.message || "") + JSON.stringify(hint?.originalException || "");
        if (NOISY_HOSTS.some(h => msg.includes(h))) return null;

        // Drop fetch/network errors that are just market-data polling failures
        const err = hint?.originalException;
        if (err instanceof TypeError && /fetch|network/i.test(err.message)) return null;

        return event;
      },
    });

    window.setSentryUser = function(u) { Sentry.setUser(u); };
    window.trackEvent   = function(name, data) {
      Sentry.addBreadcrumb({ message: name, data: data, level: "info" });
    };
    
    console.log('[Sentry] Unified configuration initialized (Full Bundle + 100% sampling)');
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
  if (typeof Sentry === 'undefined') {
    Promise.all([
      loadScript(BUNDLE_URL),
      loadScript(CAPTURE_CONSOLE_URL)
    ]).then(initSentry).catch(err => {
      console.error('[Sentry] Failed to load one or more SDK bundles:', err);
    });
  } else {
    initSentry();
  }
})();
