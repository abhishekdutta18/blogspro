/**
 * BlogsPro Microsoft Clarity Loader + Custom Tags
 * Project ID: w1simalsnj
 */
(function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "w1simalsnj");

// Set page-level custom tags once Clarity is ready
(function applyClarityTags() {
  if (typeof window.clarity !== 'function') {
    // Clarity loads async — retry after a short delay
    setTimeout(applyClarityTags, 500);
    return;
  }
  window.clarity('set', 'page_type', 'homepage');
  window.clarity('set', 'site',      'blogspro');
  window.clarity('set', 'env',       window.location.hostname === 'blogspro.in' ? 'production' : 'development');
})();
