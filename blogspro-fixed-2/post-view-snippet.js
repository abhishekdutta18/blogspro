// ═══════════════════════════════════════════════
// ADD THIS TO YOUR post.html Firebase script block
// Paste it near the top, after db/auth init.
// ═══════════════════════════════════════════════

// 1. Import increment at the top of your import block:
//    import { getFirestore, doc, getDoc, updateDoc, increment }
//      from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 2. After you read the post ID from the URL, add:

const postId = new URLSearchParams(window.location.search).get('id');

async function trackAndLoadPost() {
  if (!postId) { window.location.href = 'index.html'; return; }

  // Track view — once per session per post
  const sessionKey = `bp_viewed_${postId}`;
  if (!sessionStorage.getItem(sessionKey)) {
    sessionStorage.setItem(sessionKey, '1');
    try {
      await updateDoc(doc(db, 'posts', postId), { views: increment(1) });
    } catch(_) {
      // Non-fatal — silently ignore if rules block it
    }
  }

  // Load the post as normal
  await loadPost(postId);
}

// 3. Replace your existing loadPost(postId) call with:
trackAndLoadPost();

// 4. Optionally show the view count in the post UI:
//    After loading post data, add:
//    const viewEl = document.getElementById('postViewCount');
//    if (viewEl && postData.views) {
//      viewEl.textContent = formatViews(postData.views) + ' views';
//    }

function formatViews(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'') + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1).replace(/\.0$/,'') + 'k';
  return String(n);
}
