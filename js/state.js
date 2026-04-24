// ═══════════════════════════════════════════════
// state.js — All shared mutable state
// ═══════════════════════════════════════════════

export const state = {
  currentUser:         null,
  currentUserProfile:  null,
  editingPostId:       null,
  allPosts:            [],
  allSubs:             [],
  isPremium:           false,
  pendingOutline:      '',
  lastSavedContent:    '',
  generatedImages:     [],
  imgSelectedStyle:    'photorealistic',
  imgSelectedW:        1280,
  imgSelectedH:        720,
  imgSelectedCount:    2,
  currentModalImgUrl:  '',
  autoPlaceCancelled:  false,
  generatedNewsletter: '',
  abSessionTotal:      0,
  abSessionPublished:  0,
  isGeneratingAI:      false,
  isGeneratingImages:  false,
  pendingWordTarget:    null,
  isSaving:            false,
  csrfToken:           '',
  subChart:            null,
};


// ── Legacy shims (used by v2-editor.js) ──────
// In Firebase mode, data is persisted via Firestore — these are no-ops.
// They exist only to prevent import errors from modules that call them.
export function savePosts() {}
export function saveSubscribers() {}
