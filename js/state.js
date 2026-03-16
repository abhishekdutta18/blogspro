// ═══════════════════════════════════════════════
// state.js — All shared mutable state
// ═══════════════════════════════════════════════

export const state = {
  currentUser:         null,
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
};
