// ═══════════════════════════════════════════════
// v2-editor.js — Blog Editor Logic
// ═══════════════════════════════════════════════

import { callAI } from './ai-core.js';
import { showToast, slugify, sanitize, setBtnLoading, parseAIJson } from './config.js';
import { state } from './state.js';


// ═════════════════════════════════════
// LOAD POST INTO EDITOR
// ═════════════════════════════════════
export function loadPostEditor(postId) {

  const post = state.allPosts.find(p => p.id === postId);

  if (!post) {
    showToast("Post not found", "error");
    return;
  }

  document.getElementById("postTitle").value = post.title || "";
  document.getElementById("postSlug").value = post.slug || "";
  document.getElementById("postCategory").value = post.category || "General";
  document.getElementById("postContent").value = post.content || "";

  state.currentPostId = postId;

  showToast("Post loaded", "success");
}



// ═════════════════════════════════════
// NEW POST
// ═════════════════════════════════════
export function clearEditor() {

  document.getElementById("postTitle").value = "";
  document.getElementById("postSlug").value = "";
  document.getElementById("postContent").value = "";
  document.getElementById("aiPrompt").value = "";

  state.currentPostId = null;
}



// ═════════════════════════════════════
// AUTO SLUG
// ═════════════════════════════════════
window.updateSlug = () => {

  const title = document.getElementById("postTitle").value;

  document.getElementById("postSlug").value = slugify(title);
};



// ═════════════════════════════════════
// SAVE POST
// ═════════════════════════════════════
window.savePost = () => {

  const title = document.getElementById("postTitle").value.trim();
  const slug = document.getElementById("postSlug").value.trim();
  const content = document.getElementById("postContent").value.trim();
  const category = document.getElementById("postCategory").value;

  if (!title) {
    showToast("Title required", "error");
    return;
  }

  const postData = {
    id: state.currentPostId || Date.now().toString(),
    title,
    slug,
    category,
    content,
    status: "draft",
    date: new Date().toISOString()
  };

  if (state.currentPostId) {

    const index = state.allPosts.findIndex(p => p.id === state.currentPostId);

    state.allPosts[index] = postData;

  } else {

    state.allPosts.push(postData);
  }

  localStorage.setItem("blogspro_posts", JSON.stringify(state.allPosts));

  showToast("Post saved!", "success");
};



// ═════════════════════════════════════
// AI GENERATE CONTENT
// ═════════════════════════════════════
window.generateAIContent = async () => {

  const prompt = document.getElementById("aiPrompt").value.trim();

  if (!prompt) {
    showToast("Enter a prompt", "error");
    return;
  }

  setBtnLoading("btnGenerateAI","aiBtnTxt","aiSpinner",true,"Generating…");

  const result = await callAI(
`Write a detailed SEO optimized blog article about:
"${prompt}"

Return ONLY JSON:
{
"title":"",
"content":"HTML formatted blog article"
}`, true);

  setBtnLoading("btnGenerateAI","aiBtnTxt","aiSpinner",false,"Generate Article");

  const parsed = parseAIJson(result.error ? "" : result.text || "");

  if (!parsed) {
    showToast(result.error || "AI failed", "error");
    return;
  }

  document.getElementById("postTitle").value = parsed.title || prompt;
  document.getElementById("postSlug").value = slugify(parsed.title || prompt);
  document.getElementById("postContent").value = sanitize(parsed.content || "");

  showToast("AI content generated", "success");
};



// ═════════════════════════════════════
// DELETE POST
// ═════════════════════════════════════
window.deletePost = () => {

  if (!state.currentPostId) {
    showToast("No post selected", "error");
    return;
  }

  if (!confirm("Delete this post?")) return;

  state.allPosts = state.allPosts.filter(p => p.id !== state.currentPostId);

  localStorage.setItem("blogspro_posts", JSON.stringify(state.allPosts));

  clearEditor();

  showToast("Post deleted", "success");
};



// ═════════════════════════════════════
// PUBLISH POST
// ═════════════════════════════════════
window.publishPost = () => {

  const id = state.currentPostId;

  if (!id) {
    showToast("Save post first", "error");
    return;
  }

  const post = state.allPosts.find(p => p.id === id);

  if (!post) return;

  post.status = "published";

  localStorage.setItem("blogspro_posts", JSON.stringify(state.allPosts));

  showToast("Post published!", "success");
};
