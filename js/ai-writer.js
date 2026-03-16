import { generateText } from "./services/ai-text-service.js";

let aiWriting = false;

export function initAIWriter() {

  const btn = document.getElementById("aiWriteBtn");
  const promptInput = document.getElementById("aiPrompt");
  const editor = document.getElementById("editor");

  if (!btn || !promptInput) return;

  btn.addEventListener("click", async () => {

    if (aiWriting) return;

    const prompt = promptInput.value.trim();

    if (!prompt) {
      alert("Enter a prompt first");
      return;
    }

    try {

      aiWriting = true;

      btn.disabled = true;
      btn.innerText = "Generating...";

      const result = await generateText(prompt);

      insertIntoEditor(result, editor);

    }
    catch (err) {

      console.error("AI Writer Error:", err);
      alert("AI generation failed");

    }
    finally {

      aiWriting = false;

      btn.disabled = false;
      btn.innerText = "Generate";

    }

  });

}


function insertIntoEditor(text, editor) {

  if (!editor) return;

  if (editor.tagName === "TEXTAREA") {

    editor.value += "\n\n" + text;

  } else {

    editor.innerHTML += `<p>${text}</p>`;

  }

}
