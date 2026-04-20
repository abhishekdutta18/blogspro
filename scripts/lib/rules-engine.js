import { pushSovereignTrace } from './storage-bridge.js';

/**
 * BlogsPro Swarm Rules Engine (V2.3)
 * ===================================
 * Deterministic Structural Guardrails with Sovereign Audit Heartbeat.
 * Responsible for:
 * 1. Table Reconstruction (Markdown Repair).
 * 2. Visual Injection (Slot-filling for charts).
 * 3. JSON Hardening (Context-aware unique IDs).
 * 4. Institutional Sections (Abstract, Abbreviations, Citations).
 * 5. $Shield Governance (Sanitization & Anti-Hallucination).
 */
/**
 * [V16.5] isInstitutionalRefusal
 * Detects if the model returned a refusal, boilerplate error, or 'I am an AI' chatter.
 */
function isInstitutionalRefusal(content) {
  const refusalPatterns = [
    /i (cannot|am not able to|apologize|can't) (fulfill|generate|complete|provide)/i,
    /as an ai (language model|assistant)/i,
    /my programming does not allow/i,
    /unexpected error occurred/i,
    /please contact support/i
  ];
  return refusalPatterns.some(p => p.test(content));
}

export function sanitizePayload(content, auditContext = {}) {
  const { jobId = 'local', verticalId = 'global', env = {} } = auditContext;
  if (!content) return "";

  // 🛡️ [Cynical] Refusal Detection (Early Exit)
  if (isInstitutionalRefusal(content)) {
    pushSovereignTrace("SHIELD_ABORT", {
        jobId, vertical: verticalId, status: "fatal", role: "shield",
        message: "Institutional Refusal Detected. Aborting vertical synthesis."
    }, env).catch(() => {});
    throw new Error(`[Shield-Refusal] Model returned a refusal or non-institutional boilerplate.`);
  }

  // 🛡️ GHOST SCRIPT / PROMPT STRIPPING
  let sanitized = content
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?>[\s\S]*?<\/iframe>/gi, "")
    .replace(/on\w+="[^"]*"/gi, "") // Remove inline event handlers
    .replace(/{{[\s\S]*?}}/g, ""); // Remove unfinished mustache tokens

  const jargon = ["MultiPipe", "Multi-Pipe", "PipeFail", "Hallucinate", "NaN", "null_ref", "undefined"];
  jargon.forEach(word => {
    if (new RegExp(`\\b${word}\\b`, 'gi').test(sanitized)) {
      pushSovereignTrace("SHIELD_PURGE", {
        jobId, vertical: verticalId, status: "warn", role: "shield",
        message: `Purged AI Jargon: '${word}' from manuscript.`
      }, env).catch(() => {});
    }
    sanitized = sanitized.replace(new RegExp(`\\b${word}\\b|▼\\s*${word}|▲\\s*${word}`, 'gi'), "N/A (AUDIT)");
  });

  // 🛡️ ZERO-ECHO ISOLATION: Strict content extraction
  sanitized = stripEchos(sanitized);
  
  // 🛡️ GHOST PROMPT REMOVAL
  sanitized = stripGhostPrompts(sanitized);

  // 🛡️ TRUTH-FIRST SURGICAL PURGE: Remove content flagged for zero grounding
  if (sanitized.includes("<audit-purge")) {
    const purgeCount = (sanitized.match(/<audit-purge/g) || []).length;
    console.warn(`🛑 [RulesEngine] Performing surgical purge of ${purgeCount} ungrounded segments for ${verticalId}`);
    
    pushSovereignTrace("SHIELD_PURGE", {
        jobId, vertical: verticalId, status: "warn", role: "shield",
        message: `Surgically purged ${purgeCount} ungrounded segments.`
    }, env).catch(() => {});

    sanitized = sanitized.replace(/<audit-purge[\s\S]*?>[\s\S]*?<\/audit-purge>/gi, "<!-- [AUDIT] Ungrounded fragment purged to maintain institutional integrity. -->");
  }

  return sanitized.trim();
}

/**
 * Strips everything outside [[BPRO_INTEL_START]] and [[BPRO_INTEL_END]]
 */
export function stripEchos(content) {
  if (!content) return "";
  const markerMatch = content.match(/\[\[BPRO_INTEL_START\]\]([\s\S]*?)\[\[BPRO_INTEL_END\]\]/i);
  if (markerMatch) return markerMatch[1].trim();
  
  // [V16.5] Surgical Line-based Fallback
  // Only strip the first 3 lines if they contain common AI conversational chatter
  const lines = content.split('\n');
  const chattyPatterns = /^(certainly|here is|below is|based on|as a|as an ai|i have analyzed|this report)/i;
  
  let startIndex = 0;
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    if (chattyPatterns.test(lines[i].trim())) {
        startIndex = i + 1;
    }
  }

  // Also strip trailing chatter (last 2 lines)
  const trailingChatty = /(hope this|let me know|if you need|thank you)/i;
  let endIndex = lines.length;
  for (let i = lines.length - 1; i >= Math.max(0, lines.length - 2); i--) {
     if (trailingChatty.test(lines[i].trim())) {
         endIndex = i;
     }
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
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

export function repairTables(content, auditContext = {}) {
  const { jobId = 'local', verticalId = 'global', env = {} } = auditContext;
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
         pushSovereignTrace("SHIELD_REPAIR", {
           jobId, vertical: verticalId, status: "info", role: "shield",
           message: `Injected missing pipes for table separator.`
         }, env).catch(() => {});
      }

      // Trace line repair if line changed through normalization
      if (lines[i].trim() !== line) {
         pushSovereignTrace("SHIELD_REPAIR", {
           jobId, vertical: verticalId, status: "info", role: "shield",
           message: `Normalized table structure: ${line.substring(0, 50)}...`
         }, env).catch(() => {});
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
export function injectVisuals(content, verticalName, verticalId, auditContext = {}) {
  const { jobId = 'local', env = {} } = auditContext;
  let updated = content;
  
  // 1. Identify all chart data IDs (after hardening) or existing placeholders
  const chartDataMatches = [...updated.matchAll(/<chart-data>[\s\S]*?"id":\s*"(chart_[^"]+)"[\s\S]*?<\/chart-data>/gi)];
  const chartDataIds = chartDataMatches.map(m => m[1]);
  const existingDivIds = [...updated.matchAll(/id="(chart_[^"]+)"/gi)].map(m => m[1]);
  
  // 2. For every chart data block, ensure a container exists before it
  updated = updated.replace(/<chart-data>([\s\S]*?"id":\s*"(chart_[^"]+)"[\s\S]*?)<\/chart-data>/gi, (match, inner, id) => {
    if (!existingDivIds.includes(id)) {
      console.log(`📡 [RulesEngine] Slot-filling missing container for ${id}`);
      pushSovereignTrace("SHIELD_REPAIR", {
        jobId, vertical: verticalId, status: "info", role: "shield",
        message: `Injected interactive chart container: ${id}`
      }, env).catch(() => {});
      return `<div class="card terminal-chart" id="${id}"></div>\n${match}`;
    }
    return match;
  });

  // 3. Absolute Fallback: Removed. In a Truth-First system, we do not inject placeholders.
  // Visual deficits are handled as part of the manuscript's purely analytical narrative.
  
  return updated;
}

/**
 * Sanitizes JSON and ensures unique IDs for multiple charts.
 */
export function hardenJson(content, verticalId = "default", auditContext = {}) {
  const { jobId = 'local', env = {} } = auditContext;
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
        // Recovery for malformed array-only responses
        payload = { 
          id: uniqueId, 
          labels: payload.map(i => Array.isArray(i) ? i[0] : 'Item'),
          datasets: [{ name: "Value", values: payload.map(i => Array.isArray(i) ? i[1] : 0) }]
        };
      } else {
        payload.id = uniqueId;
      }
      
      return `<chart-data>${JSON.stringify(payload)}</chart-data>`;
    } catch (e) {
      const fallbackId = `chart_${verticalId}_err_${chartIndex++}`;
      return `<chart-data>{"id": "${fallbackId}", "labels": ["Error"], "datasets": [{"name": "Failure", "values": [0]}]}</chart-data>`;
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
