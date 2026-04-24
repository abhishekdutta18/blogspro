import { generateImage } from "./services/ai-image-service.js";

let generatingImage = false;

export function initAIImages() {

  const btn = document.getElementById("aiImageBtn");
  const promptInput = document.getElementById("aiImagePrompt");

  if (!btn || !promptInput) return;

  btn.addEventListener("click", async () => {

    if (generatingImage) return;

    const prompt = promptInput.value.trim();

    if (!prompt) {
      alert("Enter an image prompt");
      return;
    }

    try {

      generatingImage = true;

      btn.disabled = true;
      btn.innerText = "Generating...";

      const imageUrl = await generateImage(prompt);

      insertImageIntoEditor(imageUrl);

    }
    catch (err) {

      console.error("AI Image Error:", err);
      alert("Image generation failed");

    }
    finally {

      generatingImage = false;

      btn.disabled = false;
      btn.innerText = "Generate Image";

    }

  });

}



function insertImageIntoEditor(url) {

  const editor = document.getElementById("editor");

  if (!editor) return;

  const img = document.createElement("img");

  img.src = url;
  img.style.maxWidth = "100%";
  img.style.margin = "10px 0";

  if (editor.tagName === "TEXTAREA") {

    editor.value += `\n<img src="${url}">\n`;

  }
  else {

    editor.appendChild(img);

  }

}
