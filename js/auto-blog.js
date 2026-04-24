import { callAI } from "./ai-core.js";
import { generateImage } from "./services/ai-image-service.js";
import { showToast, sanitize, validateImageUrl } from "./config.js";

let generating = false;

export function initAutoBlog() {

  const btn = document.getElementById("autoBlogBtn");
  const topicInput = document.getElementById("autoBlogTopic");

  if (!btn || !topicInput) return;

  btn.addEventListener("click", async () => {

    if (generating) return;

    const topic = topicInput.value.trim();

    if (!topic) {
      showToast("Enter a topic first", "error");
      return;
    }

    try {

      generating = true;

      btn.disabled = true;
      btn.innerText = "Generating...";

      const titlePrompt = `
Generate a catchy blog title about:
${topic}
`;

      const title = await callAI(titlePrompt);

      const blogPrompt = `
Write a detailed SEO blog post about:
${topic}

Include headings and useful information.
`;

      const content = await callAI(blogPrompt);

      const imagePrompt = `Blog illustration for ${topic}`;

      const imageUrl = await generateImage(imagePrompt);

      fillEditor(title, content, imageUrl);

    }
    catch (err) {

      console.error("Auto Blog Error:", err);
      showToast("Auto blog generation failed: " + err.message, "error");

    }
    finally {

      generating = false;

      btn.disabled = false;
      btn.innerText = "Generate Blog";

    }

  });

}



function fillEditor(title, content, imageUrl) {

  const titleInput = document.getElementById("postTitle");
  const editor = document.getElementById("editor");

  if (titleInput) {
    titleInput.value = title;
  }

  if (!editor) return;

  // Validate imageUrl before inserting and sanitize content to prevent XSS
  const safeImageUrl = validateImageUrl(imageUrl) || '';
  const safeContent  = sanitize(content || '');
  const html = (safeImageUrl
    ? `<img src="${safeImageUrl}" style="max-width:100%;margin-bottom:20px;">\n`
    : '') + safeContent;

  if (editor.tagName === "TEXTAREA") {
    editor.value = html;
  }
  else {
    editor.innerHTML = html;
  }

}
