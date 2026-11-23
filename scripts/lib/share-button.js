/**
 * Share button for generated article pages (market editions, briefings, manuscripts). One self-contained
 * snippet — markup, scoped styles and a small inline script — that every page template drops in under its
 * title. Nothing is interpolated, so it carries no page data and needs no escaping.
 *
 * Behaviour: shares the page's canonical URL (else its address without query or hash) through the system
 * share sheet where the browser has one; otherwise copies the link and says "Link copied"; if copying is
 * blocked, shows the URL so the reader can copy it by hand. A cancelled share sheet stays quiet. The button
 * starts hidden and the script reveals it, so a page without JavaScript never shows a button that does nothing.
 * Colours come from `currentColor`, so it fits each template's theme in light and dark.
 */

const STATUS_MS = 3000;

const SCRIPT = `(function () {
  var canonical = document.querySelector('link[rel="canonical"]');
  var url = canonical ? canonical.href : location.origin + location.pathname;
  document.querySelectorAll('.bp-share').forEach(function (box) {
    var button = box.querySelector('button');
    var status = box.querySelector('.bp-share-status');
    var timer = 0;
    function say(text, keep) {
      status.textContent = text;
      clearTimeout(timer);
      if (!keep) timer = setTimeout(function () { status.textContent = ''; }, ${STATUS_MS});
    }
    function copy() {
      var canCopy = navigator.clipboard && window.isSecureContext;
      var done = canCopy ? navigator.clipboard.writeText(url) : Promise.reject(new Error('no clipboard'));
      done.then(function () { say('Link copied'); }, function () { say(url, true); });
    }
    button.hidden = false;
    button.addEventListener('click', function () {
      if (!navigator.share) return copy();
      navigator.share({ title: document.title, url: url }).catch(function (error) {
        if (!error || error.name !== 'AbortError') copy();
      });
    });
  });
})();`;

const STYLES = `.bp-share{display:flex;align-items:center;flex-wrap:wrap;gap:.6rem;margin:.9rem 0 1.4rem}
.bp-share-btn{font:inherit;font-size:.85rem;line-height:1;color:inherit;background:transparent;border:1px solid currentColor;border-radius:999px;padding:.55rem 1rem;min-height:2.25rem;cursor:pointer;opacity:.85}
.bp-share-btn:hover{opacity:1}.bp-share-btn:focus-visible{outline:2px solid currentColor;outline-offset:2px}
.bp-share-status{font-size:.8rem;opacity:.75;overflow-wrap:anywhere}`;

/** The share button snippet; place it once per page, under the title. */
export const SHARE_BUTTON = `<div class="bp-share"><button type="button" class="bp-share-btn" hidden>Share link</button><span class="bp-share-status" role="status" aria-live="polite"></span></div>
<style>${STYLES}</style>
<script>${SCRIPT}</script>`;
