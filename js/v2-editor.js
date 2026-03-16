// ═══════════════════════════════════════
// v2-editor.js — Blog Editor Logic
// ═══════════════════════════════════════

import { callAI } from "./ai-core.js";
import { showToast, slugify, sanitize, setBtnLoading, parseAIJson } from "./config.js";
import { state, savePosts } from "./state.js";


// ═══════════════════════════════════════
// UPDATE SLUG WHEN TITLE CHANGES
// ═══════════════════════════════════════

window.updateSlug = function () {

  const title = document.getElementById("postTitle")?.value || "";

  const slugField = document.getElementById("postSlug");

  if (slugField) slugField.value = slugify(title);
};


// ═══════════════════════════════════════
// CLEAR EDITOR
// ═══════════════════════════════════════

window.clearEditor = function () {

  document.getElementById("postTitle").value = "";
  document.getElementById("postSlug").value = "";
  document.getElementById("postContent").value = "";
  document.getElementById("aiPrompt").value = "";

  state.currentPostId = null;
};


// ═══════════════════════════════════════
// SAVE POST
// ═══════════════════════════════════════

window.savePost = function () {

  const title = document.getElementById("postTitle").value.trim();
  const slug = document.getElementById("postSlug").value.trim();
  const content = document.getElementById("postContent").value.trim();

  if (!title) {
    showToast("Title is required", "error");
    return;
  }

  const postData = {

    id: state.currentPostId || Date.now().toString(),

    title: title,

    slug: slug,

    content: content,

    status: "draft",

    date: new Date().toISOString()

  };

  if (state.currentPostId) {

    const index = state.allPosts.findIndex(p => p.id === state.currentPostId);

    if (index !== -1) state.allPosts[index] = postData;

  } else {

    state.allPosts.push(postData);
  }

  savePosts();

  showToast("Post saved!", "success");
};


// ═══════════════════════════════════════
// DELETE POST
// ═══════════════════════════════════════

window.deletePost = function () {

  if (!state.currentPostId) {

    showToast("No post selected", "error");
    return;
  }

  state.allPosts = state.allPosts.filter(p => p.id !== state.currentPostId);

  savePosts();

  clearEditor();

  showToast("Post deleted", "success");
};


// ═══════════════════════════════════════
// PUBLISH POST
// ═══════════════════════════════════════

window.publishPost = function () {

  if (!state.currentPostId) {

    showToast("Save the post first", "error");
    return;
  }

  const post = state.allPosts.find(p => p.id === state.currentPostId);

  if (!post) return;

  post.status = "published";

  savePosts();

  showToast("Post published!", "success");
};


// ═══════════════════════════════════════
// AI ARTICLE GENERATOR
// ═══════════════════════════════════════

window.generateAIContent = async function () {

  const prompt = document.getElementById("aiPrompt").value.trim();

  if (!prompt) {

    showToast("Enter a topic first", "error");
    return;
  }

  setBtnLoading("btnGenerateAI", "aiBtnTxt", "aiSpinner", true, "Generating…");

  const result = await callAI(
`Write a detailed SEO optimized blog article about: "${prompt}"

Return ONLY JSON:

{
"title":"",
"content":"HTML formatted article"
}`
  );

  setBtnLoading("btnGenerateAI", "aiBtnTxt", "aiSpinner", false, "Generate Article");

  const parsed = parseAIJson(result.error ? "" : result.text);

  if (!parsed) {

    showToast(result.error || "AI failed to generate article", "error");
    return;
  }

  document.getElementById("postTitle").value = parsed.title || prompt;

  document.getElementById("postSlug").value = slugify(parsed.title || prompt);

  document.getElementById("postContent").value = sanitize(parsed.content || "");

  showToast("AI article generated!", "success");
};
