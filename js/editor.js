import { cleanEditorHTML } from "./config.js";
import { callAI } from "./ai-core.js";

let editor = null;

let history = [];
let historyIndex = -1;


/* =========================================
   INIT EDITOR
========================================= */

export function initEditor() {

  editor = document.getElementById("editor");

  if (!editor) return;

  editor.contentEditable = true;

  console.log("[editor] initialized");

  setupEvents();

  saveHistory();

}



/* =========================================
   EVENTS
========================================= */

function setupEvents() {

  editor.addEventListener("input", () => { saveHistory(); updateWordCount(); });

  editor.addEventListener("paste", handlePaste);

  editor.addEventListener("click", handleClick);

  editor.addEventListener("keydown", handleSlashCommands);

  editor.addEventListener("drop", handleDrop);

  editor.addEventListener("dragover", e => e.preventDefault());

  document.addEventListener("keydown", handleShortcuts);

}



/* =========================================
   PASTE SANITIZATION
========================================= */

function handlePaste(e) {

  e.preventDefault();

  const text = (e.clipboardData || window.clipboardData).getData("text/plain");

  document.execCommand("insertText", false, text);

}



/* =========================================
   DRAG DROP IMAGE
========================================= */

function handleDrop(e) {

  e.preventDefault();

  const file = e.dataTransfer.files[0];

  if (!file || !file.type.startsWith("image/")) return;

  const reader = new FileReader();

  reader.onload = function(evt) {

    insertImage(evt.target.result);

  };

  reader.readAsDataURL(file);

}



/* =========================================
   SHORTCUTS
========================================= */

function handleShortcuts(e) {

  if (e.ctrlKey && e.key === "z") undo();

  if (e.ctrlKey && e.key === "y") redo();

}



/* =========================================
   HISTORY
========================================= */

function saveHistory() {

  const html = editor.innerHTML;

  if (history[historyIndex] === html) return;

  history.push(html);

  historyIndex = history.length - 1;

}

function undo() {

  if (historyIndex <= 0) return;

  historyIndex--;

  editor.innerHTML = history[historyIndex];

}

function redo() {

  if (historyIndex >= history.length - 1) return;

  historyIndex++;

  editor.innerHTML = history[historyIndex];

}



/* =========================================
   SLASH COMMANDS
========================================= */

async function handleSlashCommands(e) {

  if (e.key !== "/") return;

  setTimeout(showSlashMenu, 10);

}


function showSlashMenu() {

  removeSlashMenu();

  const menu = document.createElement("div");

  menu.id = "slashMenu";

  menu.style.position = "absolute";
  menu.style.background = "#111";
  menu.style.padding = "10px";
  menu.style.borderRadius = "8px";
  menu.style.zIndex = "999";

  menu.innerHTML = `
    <div data-cmd="ai">AI Write</div>
    <div data-cmd="image">Insert Image</div>
    <div data-cmd="quote">Quote</div>
  `;

  document.body.appendChild(menu);

  menu.addEventListener("click", async e => {

    const cmd = e.target.dataset.cmd;

    removeSlashMenu();

    if (cmd === "quote") {

      document.execCommand("insertHTML", false, "<blockquote>Quote</blockquote>");

    }

    if (cmd === "image") {

      const url = window.prompt("Image URL");

      if (url) insertImage(url);

    }

    if (cmd === "ai") {

      // Bug fix: must use window.prompt — declaring `const prompt` in the same
      // block shadows window.prompt and causes a TDZ ReferenceError.
      const userPrompt = window.prompt("AI prompt");

      if (!userPrompt) return;

      const text = await callAI(userPrompt);

      document.execCommand("insertText", false, text);

    }

  });

}


function removeSlashMenu() {

  const m = document.getElementById("slashMenu");

  if (m) m.remove();

}



/* =========================================
   IMAGE CLICK
========================================= */

function handleClick(e) {

  const img = e.target.closest("img");

  removeImgToolbar();

  if (!img) return;

  showImageToolbar(img);

}



/* =========================================
   IMAGE TOOLBAR
========================================= */

function showImageToolbar(img) {

  const toolbar = document.createElement("div");

  toolbar.id = "imgToolbar";

  toolbar.style.position = "absolute";
  toolbar.style.background = "#111";
  toolbar.style.padding = "6px";
  toolbar.style.borderRadius = "6px";
  toolbar.style.display = "flex";
  toolbar.style.gap = "6px";
  toolbar.style.zIndex = "999";

  const rect = img.getBoundingClientRect();

  toolbar.style.top = rect.top + window.scrollY - 40 + "px";
  toolbar.style.left = rect.left + "px";


  toolbar.append(
    createBtn("Left", () => img.style.float = "left"),
    createBtn("Center", () => {
      img.style.display = "block";
      img.style.margin = "auto";
      img.style.float = "none";
    }),
    createBtn("Right", () => img.style.float = "right"),
    createBtn("Resize", () => enableResize(img)),
    createBtn("Remove", () => {
      img.remove();
      removeImgToolbar();
    })
  );

  document.body.appendChild(toolbar);

}


function createBtn(label, action) {

  const btn = document.createElement("button");

  btn.innerText = label;

  btn.onclick = action;

  return btn;

}



/* =========================================
   RESIZE
========================================= */

function enableResize(img) {

  img.style.resize = "both";

  img.style.overflow = "auto";

}



/* =========================================
   REMOVE TOOLBAR
========================================= */

export function removeImgToolbar() {

  const tb = document.getElementById("imgToolbar");

  if (tb) tb.remove();

}



/* =========================================
   INSERT IMAGE
========================================= */

export function insertImage(url) {

  const img = document.createElement("img");

  img.src = url;

  img.style.maxWidth = "100%";

  img.style.margin = "10px 0";

  editor.appendChild(img);

}



/* =========================================
   GET HTML
========================================= */

export function getEditorHTML() {

  return cleanEditorHTML(editor.innerHTML);

}



/* =========================================
   SET HTML
========================================= */

export function setEditorHTML(html) {

  editor.innerHTML = html;

}


/* =========================================
   WORD COUNT  (Bug 3 fix — was missing)
   Imported by ai-editor.js
========================================= */

export function updateWordCount() {
  const ed = document.getElementById("editor");
  if (!ed) return;
  const count   = (ed.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  const readMin = Math.max(1, Math.ceil(count / 200));

  // Top bar
  const wcTop = document.getElementById("wordCount");
  if (wcTop) wcTop.textContent = count.toLocaleString();

  const rtTop = document.getElementById("readingTimeTop");
  if (rtTop) rtTop.textContent = readMin;

  // Bottom bar
  const wcBot = document.getElementById("wordCountBottom");
  if (wcBot) wcBot.textContent = count.toLocaleString();

  const rtBot = document.getElementById("readingTimeDisplay");
  if (rtBot) rtBot.textContent = readMin;

  // v2 panel
  const v2wc = document.getElementById("v2WordCount");
  if (v2wc) v2wc.textContent = count.toLocaleString() + " words";
}
window.updateWordCount = updateWordCount;


/* =========================================
   CLEAR EDITOR  (Bug 3b — missing export
   used by nav.js clearEditor import)
========================================= */

export function clearEditor() {
  const ed = document.getElementById("editor");
  if (ed) ed.innerHTML = "";
  // Reset metadata fields
  ["postTitle","postExcerpt","postSlug","postImage","postMeta","postTags"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  const cat = document.getElementById("postCategory");
  if (cat) cat.selectedIndex = 0;
  const heading = document.getElementById("editorHeading");
  if (heading) heading.textContent = "New Post";
  const saveStatus = document.getElementById("saveStatus");
  if (saveStatus) saveStatus.textContent = "";
  // Import state lazily to avoid circular deps
  import("./state.js").then(({ state }) => {
    state.editingPostId = null;
    state.isPremium     = false;
  });
  updateWordCount();
}
window.clearEditor = clearEditor;


/* =========================================
   FMT / FMTBLOCK — Editor formatting toolbar
   These were missing entirely — every toolbar
   button (Bold, Italic, H2, etc.) was broken.
========================================= */

window.fmt = function(command) {
  document.execCommand(command, false, null);
  saveHistory();
  updateWordCount();
};

window.fmtBlock = function(tag) {
  document.execCommand('formatBlock', false, tag);
  saveHistory();
  updateWordCount();
};


/* =========================================
   INSERT LINK — Link toolbar button
========================================= */

window.insertLink = function() {
  const url = window.prompt('Enter URL:');
  if (url) {
    document.execCommand('createLink', false, url);
    saveHistory();
  }
};


/* =========================================
   TOGGLE PREMIUM — Premium content switch
========================================= */

window.togglePremium = function() {
  import('./state.js').then(({ state }) => {
    state.isPremium = !state.isPremium;
    const sw = document.getElementById('premiumSwitch');
    if (sw) sw.classList.toggle('on', state.isPremium);
  });
};


/* =========================================
   CLEAR FEATURED IMAGE — X button on preview
========================================= */

window.clearFeaturedImage = function() {
  const input = document.getElementById('postImage');
  if (input) input.value = '';
  const preview = document.getElementById('featuredPreview');
  if (preview) preview.style.display = 'none';
  const img = preview?.querySelector('img');
  if (img) img.src = '';
};


/* =========================================
   GENERATE FEATURED IMAGE — AI Gen button
   Uses Pollinations (free, no key needed)
========================================= */

window.generateFeaturedImage = async function() {
  const topic = document.getElementById('v2TopicPrompt')?.value.trim()
             || document.getElementById('aiPrompt')?.value.trim()
             || document.getElementById('postTitle')?.value.trim() || '';
  if (!topic) {
    import('./config.js').then(({ showToast }) => showToast('Enter a topic or title first.', 'error'));
    return;
  }
  const style = 'professional, high quality, blog featured image';
  const prompt = encodeURIComponent(`${topic}, ${style}`);
  const seed = Math.floor(Math.random() * 999999);
  const url = `https://image.pollinations.ai/prompt/${prompt}?width=1280&height=720&seed=${seed}&nologo=true&enhance=true`;

  const input = document.getElementById('postImage');
  if (input) input.value = url;
  if (typeof window.updateFeaturedPreview === 'function') window.updateFeaturedPreview(url);
  import('./config.js').then(({ showToast }) => showToast('Featured image generated!', 'success'));
};


/* =========================================
   CONFIRM OUTLINE — Modal confirm button
   Triggers the article writer after outline review
========================================= */

window.confirmOutline = function() {
  const modal = document.getElementById('aiModal');
  if (modal) modal.classList.remove('open');
  if (typeof window.generateAIPost === 'function') {
    window.generateAIPost();
  }
};


/* =========================================
   INSERT/SET IMAGE FROM MODAL
========================================= */

window.insertImageFromModal = function() {
  import('./state.js').then(({ state }) => {
    const url = state.currentModalImgUrl;
    if (!url) return;
    const ed = document.getElementById('editor');
    if (ed) {
      const img = document.createElement('img');
      img.src = url;
      img.style.maxWidth = '100%';
      img.style.margin = '10px 0';
      ed.appendChild(img);
    }
    const modal = document.getElementById('imgModal');
    if (modal) modal.style.display = 'none';
    import('./config.js').then(({ showToast }) => showToast('Image inserted!', 'success'));
  });
};

window.setFeaturedFromModal = function() {
  import('./state.js').then(({ state }) => {
    const url = state.currentModalImgUrl;
    if (!url) return;
    const input = document.getElementById('postImage');
    if (input) input.value = url;
    if (typeof window.updateFeaturedPreview === 'function') window.updateFeaturedPreview(url);
    const modal = document.getElementById('imgModal');
    if (modal) modal.style.display = 'none';
    import('./config.js').then(({ showToast }) => showToast('Set as featured image!', 'success'));
  });
};


/* =========================================
   RUN AUTO BLOG — Standalone button alias
   admin.html calls runAutoBlog() but the
   function is named aitRunAutoBlog in ai-tools.js
========================================= */

window.runAutoBlog = function() {
  if (typeof window.aitRunAutoBlog === 'function') {
    window.aitRunAutoBlog();
  }
};
