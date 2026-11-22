/**
 * Institutional JSON & Content Sanitizer (BlogsPro V4.20)
 * Specialized for stripping LLM "echoes" and fixing chart-data syntax.
 */
import { parsePayload } from '../../js/chart-engine/index.js';

// LLM echoes (prompt leaks, "Here is…") only appear near the start or end of a response.
const ECHO_WINDOW = 1000;

/** True when the chart engine can already parse this payload (strict or bounded repair). */
function isEngineParseable(raw) {
    try {
        parsePayload(raw);
        return true;
    } catch {
        return false;
    }
}

function sanitizeInstitutionalContent(content) {
    if (!content) return "";
    
    // 1. Strip LLM "Echoes" (Buffered Head/Tail only V16.5)
    // Short content is cleaned whole; the old split dropped everything past char 1,000
    // whenever 1,000 < length <= 2,000 (body and tail were both empty).
    const isLong = content.length > 2 * ECHO_WINDOW;
    const head = isLong ? content.substring(0, ECHO_WINDOW) : content;
    const tail = isLong ? content.substring(content.length - ECHO_WINDOW) : "";
    const body = isLong ? content.substring(ECHO_WINDOW, content.length - ECHO_WINDOW) : "";

    const cleanPart = (part) => part
        .replace(/^(ROLE|TASK|TASK DESCRIPTION|MANDATORY|INSTRUCTION|SYSTEM|USER|RESEARCH INPUT|PROMPT):.*$/gim, "")
        .replace(/--- (SYSTEM CONTEXT|UNIVERSAL NEWS|TOP NEWS) ---[\s\S]*?--- (END|CLOSE) ---/gi, "")
        .replace(/^(Here is|In this|This is|Clean this|As an institutional|I have generated)[^\n]*/gim, "")
        .replace(/⚠️ ABSOLUTE WORD MINIMUM:.*$/gim, "")
        .replace(/MANDATORY (CHAPTER|STRUCTURAL|OUTPUT) (STRUCTURE|REQUIREMENT):.*$/gim, "");

    let clean = cleanPart(head) + body + cleanPart(tail);
    clean = clean.trim();

    // 2. Fix common AI syntax errors in <chart-data> blocks
    const chartRegex = /<chart-data>([\s\S]*?)<\/chart-data>/g;
    clean = clean.replace(chartRegex, (match, raw) => {
        if (isEngineParseable(raw)) return match; // valid JSON: regex "fixes" would only corrupt it (e.g. India's -> India"s)
        let fixed = raw.trim();
        // Fix missing quotes around labels & text values
        fixed = fixed.replace(/\[\s*([a-zA-Z0-9$%\/][a-zA-Z0-9\s\-_&$.\/%()]*)\s*,/g, '["$1",');
        fixed = fixed.replace(/,\s*([a-zA-Z0-9$%\/\.][a-zA-Z0-9\s\-_&$.\/%()]*)\s*\]/g, ', "$1"]');
        // Standard cleanup
        fixed = fixed.replace(/'/g, '"'); // Single quotes to double quotes
        fixed = fixed.replace(/,\s*\]/g, ']'); // Trailing commas in arrays
        fixed = fixed.replace(/,\s*\}/g, '}'); // Trailing commas in objects
        return `<chart-data>${fixed}</chart-data>`;
    });

    return clean;
}

/**
 * extractJson
 * Institutional Resilience Utility: Finds and parses the first JSON block within ANY string payload.
 * Useful for stripping [DRY-RUN] or other log-utility noise prefixes.
 */
function extractJson(text) {
    if (!text || typeof text !== 'string') return null;
    try {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace === -1 || lastBrace === -1) return null;
        
        const jsonStr = text.substring(firstBrace, lastBrace + 1)
                            .replace(/[\u0000-\u001F\u007F-\u009F]/g, ""); // Purge control chars
        return JSON.parse(jsonStr);
    } catch (e) {
        return null;
    }
}

/**
 * normalizeInstitutionalPem
 * Institutional Hardening Utility: Re-chunks RSA private keys into the strict 
 * 64-character line format required by Node.js and WebCrypto.
 */
function normalizeInstitutionalPem(pem) {
    if (!pem || typeof pem !== 'string') return "";
    
    // 1. Purge all existing headers, footers, whitespace, and both escaped and raw newlines
    const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----/g, "")
                      .replace(/-----END PRIVATE KEY-----/g, "")
                      .replace(/\\n/g, "")
                      .replace(/\n/g, "")
                      .replace(/\r/g, "")
                      .replace(/\s+/g, "");
                      
    // 2. Re-chunk into 64-character rows
    const lines = base64.match(/.{1,64}/g) || [];
    
    // 3. Re-wrap with strict headers
    return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

export { sanitizeInstitutionalContent as sanitizeJSON, extractJson, normalizeInstitutionalPem };
