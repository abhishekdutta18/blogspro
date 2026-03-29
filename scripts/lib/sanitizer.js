/**
 * Institutional JSON Sanitizer (BlogsPro V1.0)
 * Fixes common AI syntax errors in <chart-data> blocks.
 */
function sanitizeJSON(content) {
    const chartMatch = content.match(/<chart-data>([\s\S]*?)<\/chart-data>/);
    if (!chartMatch) return content;
    
    let raw = chartMatch[1].trim();
    
    // 1. Total-Fidelity: Fix missing quotes around labels & text values
    // Fix first element: [[Label, ... (Updated for digits, /, $, %, ., (, ))
    raw = raw.replace(/\[\s*([a-zA-Z0-9$%\/][a-zA-Z0-9\s\-_&$.\/%()]*)\s*,/g, '["$1",');
    // Fix second element if it's unquoted text: ..., Value]] (Updated for digits)
    raw = raw.replace(/,\s*([a-zA-Z0-9$%\/\.][a-zA-Z0-9\s\-_&$.\/%()]*)\s*\]/g, ', "$1"]');
    
    // 2. Standard cleanup
    raw = raw.replace(/'/g, '"'); // Single quotes to double quotes
    raw = raw.replace(/,\s*\]/g, ']'); // Trailing commas in arrays
    raw = raw.replace(/,\s*\}/g, '}'); // Trailing commas in objects
    
    return content.replace(chartMatch[1], "\n" + raw + "\n");
}

module.exports = { sanitizeJSON };
