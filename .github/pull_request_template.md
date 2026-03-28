## Summary

Describe what changed and why.

## Scope

- Type: `bugfix` | `feature` | `refactor` | `docs` | `infra`
- Area(s): `editor` | `audit` | `posts` | `auth` | `seo` | `ui` | `rules` | `ci`

## Regression Prevention Checklist (Required)

Mark all items before requesting review.

- [ ] `js/posts.js` still saves required author fields on post save: `authorUid`, `authorName`, `authorEmail`.
- [ ] Author fallback rendering is intact in all views:
  - [ ] [index.html](/Users/nandadulaldutta/Documents/New%20project/index.html) post cards (`name -> email prefix -> BlogsPro`)
  - [ ] [post.html](/Users/nandadulaldutta/Documents/New%20project/post.html) author bar fallback
  - [ ] [js/posts.js](/Users/nandadulaldutta/Documents/New%20project/js/posts.js) admin posts table author column
- [ ] Mobile editor remains single-scroll at small breakpoints (no nested scroll regressions in [css/admin.css](/Users/nandadulaldutta/Documents/New%20project/css/admin.css) for `.v2-shell`, `.v2-editor-main`, `.v2-editor-scroll`, `#editor`).
- [ ] Mobile editor focus hardening is preserved in [js/editor.js](/Users/nandadulaldutta/Documents/New%20project/js/editor.js) (`touchstart -> editor.focus()` and click-to-focus fallback).
- [ ] Admin account editing flow is still wired:
  - [ ] [admin.html](/Users/nandadulaldutta/Documents/New%20project/admin.html) has `People -> Account` and `#view-account`
  - [ ] [js/admin-account.js](/Users/nandadulaldutta/Documents/New%20project/js/admin-account.js) load/save works
  - [ ] [js/nav.js](/Users/nandadulaldutta/Documents/New%20project/js/nav.js) routes `data-view="account"`

## Smoke Tests (Required)

- [ ] Desktop: create draft, publish, edit, republish.
- [ ] Mobile: open `admin.html`, type in editor for 30+ seconds, save draft.
- [ ] Public: verify author appears on homepage card and post page.
- [ ] Admin: verify `People -> Account` save persists after refresh.

## Firestore / Security Impact

- [ ] No Firestore rule-impacting changes
- [ ] Firestore fields/rules changed (explain below)

If changed, explain migration or compatibility notes:

## Screenshots / Evidence

Attach before/after UI screenshots or logs for changed behavior.

## Risk & Rollback

- Risk level: `low` | `medium` | `high`
- Rollback plan:

