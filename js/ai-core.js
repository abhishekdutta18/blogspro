// ═══════════════════════════════════════
// ai-core.js — AI request handler
// ═══════════════════════════════════════

export async function callAI(prompt, expectJson = true) {

  try {

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: prompt
      })
    });

    if (!response.ok) {
      throw new Error("AI request failed");
    }

    const data = await response.json();

    return {
      text: data.text || "",
      error: null
    };

  } catch (error) {

    console.error("AI Error:", error);

    return {
      text: "",
      error: error.message
    };
  }
}
