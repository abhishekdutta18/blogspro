/**
 * Share-link button for article pages (market editions, briefings, manuscripts, posts). Pairs with the markup
 * from scripts/lib/share-button.js (generated pages) and frontend/src/components/ArticleView.astro (posts).
 *
 * Click: share the article through the system share sheet where the browser has one; otherwise copy the link
 * and say "Link copied"; if copying is blocked, show the URL and select it so the reader can copy it. A
 * cancelled share sheet stays quiet. The URL is read at click time — the canonical link if it has an href,
 * else this address with its query (posts are `post.html?id=…`) but not its hash — so a page that sets its
 * canonical link after loading still shares the right address. The button ships `hidden` and is revealed
 * here, so without this script no dead button is ever shown. Loading the script twice binds each button once.
 * Plain ES5 on purpose: no build step, runs as-is on every page.
 */
(function () {
  var STATUS_MS = 3000;

  function articleUrl() {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.getAttribute('href')) return canonical.href;
    return location.href.split('#')[0];
  }

  function bind(box) {
    if (box.dataset.bpShareReady) return;
    box.dataset.bpShareReady = '1';
    var button = box.querySelector('button');
    var status = box.querySelector('.bp-share-status');
    var timer = 0;

    function say(text) {
      status.textContent = text;
      clearTimeout(timer);
      timer = setTimeout(function () { status.textContent = ''; }, STATUS_MS);
    }

    function showForManualCopy(url) {
      clearTimeout(timer);
      status.textContent = url;
      try {
        var range = document.createRange();
        range.selectNodeContents(status);
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      } catch (error) { /* the URL is still visible to copy by hand */ }
    }

    function copy(url) {
      var canCopy = navigator.clipboard && window.isSecureContext;
      var done = canCopy ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard'));
      done.then(function () { say('Link copied'); }, function () { showForManualCopy(url); });
    }

    button.hidden = false;
    button.addEventListener('click', function () {
      var url = articleUrl();
      if (!navigator.share) return copy(url);
      navigator.share({ title: document.title, url: url }).catch(function (error) {
        if (!error || error.name !== 'AbortError') copy(url);
      });
    });
  }

  var boxes = document.querySelectorAll('.bp-share');
  for (var i = 0; i < boxes.length; i += 1) bind(boxes[i]);
})();
