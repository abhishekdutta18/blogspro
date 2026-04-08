/**
 * BlogsPro Swarm Rules Engine (V2.0)
 * ===================================
 * Deterministic Structural Guardrails.
 * Responsible for:
 * 1. Table Reconstruction (Markdown Repair).
 * 2. Visual Injection (Slot-filling for charts).
 * 3. JSON Hardening (Context-aware unique IDs).
 * 4. Institutional Sections (Abstract, Abbreviations, Citations).
 * 5. $Shield Governance (Sanitization & Anti-Hallucination).
 */
export function sanitizePayload(content) {
  if (!content) return "";
  // 🛡️ GHOST SCRIPT / PROMPT STRIPPING
  let sanitized = content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "") // Remove inline event handlers
    .replace(/{{[\s\S]*?}}/g, ""); // Remove unfinished mustache tokens

  // 🛡️ ABSOLUTE JARGON PURGE: Enforce on entire document
  const jargon = ["MultiPipe", "Multi-Pipe", "PipeFail", "Hallucinate", "NaN", "null_ref", "undefined"];
  jargon.forEach(word => {
    sanitized = sanitized.replace(new RegExp(`\\b${word}\\b|▼\\s*${word}|▲\\s*${word}`, 'gi'), "N/A (AUDIT)");
  });

  // 🛡️ ZERO-ECHO ISOLATION: Strict content extraction
  sanitized = stripEchos(sanitized);
  
  // 🛡️ GHOST PROMPT REMOVAL
  sanitized = stripGhostPrompts(sanitized);

  return sanitized.trim();
}

/**
 * Strips everything outside [[BPRO_INTEL_START]] and [[BPRO_INTEL_END]]
 */
export function stripEchos(content) {
  if (!content) return "";
  const match = content.match(/\[\[BPRO_INTEL_START\]\]([\s\S]*?)\[\[BPRO_INTEL_END\]\]/i);
  if (match) return match[1].trim();
  
  // Fallback: If markers missing, strip common AI intro phrases
  return content
    .replace(/^(Certainly|Here is|Below is|Based on|As a|As an AI)[\s\S]*?:/i, "")
    .replace(/(Hope this|Let me know|If you need)[\s\S]*$/i, "");
}

/**
 * Purges system instructions that leaked into the manuscript
 */
export function stripGhostPrompts(content) {
  if (!content) return "";
  const ghostPatterns = [
    /ROLE:\s*[A-Z\s]+/gi,
    /TASK:\s*[\s\S]*?(?=\n|$)/gi,
    /INSTITUTIONAL_PERSONA:[\s\S]*?(?=\n|$)/gi,
    /VERTICAL DATA:[\s\S]*?(?=\n|$)/gi,
    /RESEARCH INPUT:[\s\S]*?(?=\n|$)/gi,
    /BANNED:[\s\S]*?(?=\n|$)/gi,
    /MANDATORY:[\s\S]*?(?=\n|$)/gi,
    /\[\[BPRO_INTEL_START\]\]/gi,
    /\[\[BPRO_INTEL_END\]\]/gi
  ];
  
  let cleared = content;
  ghostPatterns.forEach(pattern => {
    cleared = cleared.replace(pattern, "");
  });
  return cleared;
}

/**
 * Recursive check for AI jargon in tabular cells.
 */
function validateCellFidelity(cell) {
  const jargon = ["MultiPipe", "PipeFail", "Hallucinate", "NaN", "null_ref", "undefined"];
  let clean = cell.trim();
  jargon.forEach(word => {
    if (clean.includes(word)) {
      console.warn(`🚨 [Shield] Purging AI Jargon: ${word}`);
      clean = clean.replace(new RegExp(word, 'g'), "N/A (AUDIT)");
    }
  });
  return clean;
}

export function repairTables(content) {
  if (!content) return "";
  
  const lines = content.split('\n');
  let inTable = false;
  let repaired = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    
    // Detect potential table start or continuation
    const hasPipes = line.includes('|');
    const isSeparator = /^[|\s-]*(:?---:?|[|\s-]*)+$/.test(line) && line.includes('---');

    if (hasPipes || isSeparator) {
      inTable = true;
      
      // 🛡️ Normalization: Ensure Leading and Trailing Pipes
      if (!line.startsWith('|')) line = '| ' + line;
      if (!line.endsWith('|')) line = line + ' |';
      
      // 🛡️ TABLE HARDENING: Ensure internal alignment and clean pipes
      line = line.replace(/\|{2,}/g, '|'); // Collapse multiple pipes
      
      // 🛡️ ANTI-HALLUCINATION: Validate each cell in the row
      const cells = line.split('|').map(c => validateCellFidelity(c));
      line = cells.join('|');

      // 🛡️ Separator Hardening: If it's a separator line, ensure it has pipes for every column
      if (isSeparator && !line.includes('|')) {
         // This handles the "--- --- ---" case by converting to "|---|---|---|"
         line = '| ' + line.split(/\s+/).map(() => '---').join(' | ') + ' |';
      }

      repaired.push(line);
    } else {
      if (inTable) inTable = false;
      repaired.push(lines[i]); // Keep original formatting for non-table lines
    }
  }

  return repaired.join('\n');
}

/**
 * Ensures every <chart-data> has a matching .terminal-chart placeholder.
 * If no charts or placeholders exist, injects a fallback at the top.
 */
export function injectVisuals(content, verticalName, verticalId) {
  let updated = content;
  
  // 1. Identify all chart data IDs (after hardening) or existing placeholders
  const chartDataMatches = [...updated.matchAll(/<chart-data>[\s\S]*?"id":\s*"(chart_[^"]+)"[\s\S]*?<\/chart-data>/gi)];
  const chartDataIds = chartDataMatches.map(m => m[1]);
  const existingDivIds = [...updated.matchAll(/id="(chart_[^"]+)"/gi)].map(m => m[1]);
  
  // 2. For every chart data block, ensure a container exists before it
  updated = updated.replace(/<chart-data>([\s\S]*?"id":\s*"(chart_[^"]+)"[\s\S]*?)<\/chart-data>/gi, (match, inner, id) => {
    if (!existingDivIds.includes(id)) {
      console.log(`📡 [RulesEngine] Slot-filling missing container for ${id}`);
      return `<div class="card terminal-chart" id="${id}"></div>\n${match}`;
    }
    return match;
  });

  // 3. Absolute Fallback: If ZERO charts/placeholders exist, inject a baseline at top
  if (!updated.includes('terminal-chart') && !updated.includes('<chart-data>')) {
    console.log(`⚠️ [RulesEngine] Visual Deficit detected for ${verticalName}. Injecting baseline fallback.`);
    const fallbackId = `chart_${verticalId}_fallback`;
    const injection = `\n<div class="card terminal-chart" id="${fallbackId}"></div>\n<chart-data>{"id": "${fallbackId}", "type": "bar", "data": [["Baseline", 0]]}</chart-data>\n`;
    
    if (updated.includes('<section class="manuscript-body">')) {
      updated = updated.replace('<section class="manuscript-body">', '<section class="manuscript-body">' + injection);
    } else if (updated.includes('</h2>')) {
      updated = updated.replace('</h2>', '</h2>' + injection);
    } else {
      updated = injection + updated;
    }
  }
  
  return updated;
}

/**
 * Sanitizes JSON and ensures unique IDs for multiple charts.
 */
export function hardenJson(content, verticalId = "default") {
  let chartIndex = 0;
  return content.replace(/<chart-data>([\s\S]*?)<\/chart-data>/gi, (match, inner) => {
    try {
      let clean = inner.trim()
        .replace(/```json\n?|```/g, '') 
        .replace(/'/g, '"')           
        .replace(/,\s*([\}\]])/g, '$1'); 
      
      let payload = JSON.parse(clean);
      const uniqueId = `chart_${verticalId}_${chartIndex++}`;
      
      if (Array.isArray(payload)) {
        payload = { id: uniqueId, data: payload };
      } else {
        payload.id = uniqueId;
      }
      
      return `<chart-data>${JSON.stringify(payload)}</chart-data>`;
    } catch (e) {
      const fallbackId = `chart_${verticalId}_err_${chartIndex++}`;
      return `<chart-data>{"id": "${fallbackId}", "data": [["Error", 0]]}</chart-data>`;
    }
  });
}

/**
 * Wraps mandatory sections in semantic tags for targeted styling and word-count exclusion.
 */
export function enforceInstitutionalSections(content) {
  let updated = content;

  // 1. Wrap ABSTRACT
  if (updated.includes('ABSTRACT:')) {
    updated = updated.replace(/ABSTRACT:\s*([\s\S]*?)(?=\n\n|\n[A-Z]+:|$)/i, (match, body) => {
      return `<section class="institutional-abstract"><h3>EXECUTIVE ABSTRACT</h3><p>${body.trim()}</p></section>\n\n`;
    });
  }

  // 2. Wrap ABBREVIATIONS
  if (updated.match(/ABBREVIATIONS:|\bGlossary:/i)) {
    updated = updated.replace(/(?:ABBREVIATIONS:|Glossary:)\s*([\s\S]*?)(?=\n\n|\n[A-Z]+:|$)/i, (match, body) => {
      const list = body.trim().split('\n').filter(l => l.trim()).map(item => `<li>${item.replace(/^- /, '')}</li>`).join('');
      return `<section class="institutional-glossary"><h3>ABBREVIATIONS</h3><ul>${list}</ul></section>\n\n`;
    });
  }

  // 3. Wrap CITATIONS
  updated = updated.replace(/\[SOURCE\s*\|\s*([^\]]+)\]\(([^)]+)\)/gi, (match, title, url) => {
    return `<span class="institutional-citation">[<a href="${url}" target="_blank">${title}</a>]</span>`;
  });

  return updated;
}

export function enforceTemporalGrounding(content) {
  const has2025 = content.includes('2025');
  const has2026 = content.includes('2026');
  
  if (!has2025 || !has2026) {
    return content + `\n\n> [!NOTE]\n> **Quantitative Alignment**: 2025 (LFY) vs 2026 (Operational) baseline shift monitored.`;
  }
  return content;
}
