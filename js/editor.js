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

  editor.addEventListener("input", saveHistory);

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

      const url = prompt("Image URL");

      if (url) insertImage(url);

    }

    if (cmd === "ai") {

      const prompt = prompt("AI prompt");

      if (!prompt) return;

      const text = await callAI(prompt);

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
