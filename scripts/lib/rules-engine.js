/**
 * BlogsPro Swarm Rules Engine (V1.0)
 * ===================================
 * Deterministic Structural Guardrails.
 * Responsible for:
 * 1. Table Reconstruction (Markdown Repair).
 * 2. Visual Injection (Missing Chart detection).
 * 3. JSON Hardening (Chart-Data sanitization).
 */

export function repairTables(content) {
  // Regex to find malformed markdown tables (missing pipes, etc.)
  // Simplistic version for worker performance
  return content.replace(/\|.*\n\|? [-:| ]+\n\|.*/g, (match) => {
    // If table looks okay but needs alignment fix
    return match; // Placeholder for more complex logic
  });
}

export function injectVisuals(content, verticalName, verticalId) {
  let updated = content;
  
  // Rule 1: Ensure at least one terminal chart exists
  if (!updated.includes('terminal-chart') && !updated.includes(`id="chart_`)) {
    console.log(`⚠️ [RulesEngine] Visual Deficit detected for ${verticalName}. Injecting terminal-chart.`);
    const injection = `\n<div class="card terminal-chart" id="chart_${verticalId}"></div>\n`;
    
    // Inject after the first paragraph or H2
    if (updated.includes('</h2>')) {
      updated = updated.replace('</h2>', '</h2>' + injection);
    } else {
      updated = injection + updated;
    }
  }
  
  return updated;
}

export function hardenJson(content) {
  // Rule 2: Strict JSON enforcement for <chart-data>
  return content.replace(/<chart-data>([\s\S]*?)<\/chart-data>/gi, (match, inner) => {
    try {
      const clean = inner.trim().replace(/'/g, '"'); // Basic fix for single quotes
      JSON.parse(clean);
      return `<chart-data>${clean}</chart-data>`;
    } catch (e) {
      console.log(`⚠️ [RulesEngine] JSON Hardening failed for chart-data. Reverting to safe baseline.`);
      return `<chart-data>[["Baseline", 0]]</chart-data>`;
    }
  });
}
