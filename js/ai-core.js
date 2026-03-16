// ═══════════════════════════════════════
// ai-core.js — AI request handler
// ═══════════════════════════════════════

export async function callAI(prompt, json = true) {
  try {
    const res = await fetch("/api/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt })
    });

    const data = await res.json();

    return {
      text: data.text || "",
      error: null
    };

  } catch (err) {
    return {
      text: "",
      error: err.message
    };
  }
}
