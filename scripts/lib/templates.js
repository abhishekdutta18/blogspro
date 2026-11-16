import { extractChartBlocks, chartPageAssets } from "../../js/chart-engine/index.js";
import { reportChartFailures, reportChartDegradations } from "./chart-telemetry.js";
import { escapeHtml, renderLink, shieldMarkup } from "./html-sanitizer.js";

const MD_LINK_RE = /\[([^\]]+)\]\(([^)]+)\)/g;

/** A whole cell that is a signed change: "+0.25", "-18bps", "▲ 2%", "−3.5" (U+2212). */
const DELTA_CELL_RE = /^([+\-−▲▼])\s*([$₹]?\d[\d,]*(?:\.\d+)?\s*(?:%|bps|bp|pp)?)$/i;
const UP_SIGNS = new Set(['+', '▲']);
const DELTA_UP_STYLE = 'color:#00D166; font-weight:700;';
const DELTA_DOWN_STYLE = 'color:#FF3B30; font-weight:700;';

/**
 * Table body cell. Only a cell that is entirely a signed number gets ▲/▼ styling, so labels,
 * dates and links containing '-' or '+' ("10Y G-Sec", "2026-11-15", "AA+") render untouched.
 * @param {string} cell  escaped cell text (may contain shield tokens)
 * @param {(match: string, label: string, url: string) => string} toLink  markdown link renderer
 * @returns {string} cell HTML
 */
function formatTableCell(cell, toLink) {
    const delta = cell.match(DELTA_CELL_RE);
    if (delta) {
        const isUp = UP_SIGNS.has(delta[1]);
        return `<span style="${isUp ? DELTA_UP_STYLE : DELTA_DOWN_STYLE}">${isUp ? '▲' : '▼'} ${delta[2]}</span>`;
    }
    // Numbers render as written: units can't be inferred from magnitude (6.25% is not "$6.25").
    return cell.replace(MD_LINK_RE, toLink);
}

/**
 * Markdown -> HTML for untrusted LLM output.
 * Raw HTML is reduced to an allowlist and shielded behind tokens before any markdown regex runs
 * (see html-sanitizer.js), so every transform below only ever sees escaped text.
 */
function parseMD(md) {
    if (!md) return "";

    const cleaned = md
        .replace(/SENTIMENT_SCORE:\s*[\d\w\[\]\/\-\s]*/gi, '')
        .replace(/PRICE_INFO:\s*[\d\w\:\.\,\|\s\[\]\(\)\-\%]*/gi, '')
        .replace(/Weekend Price Info:\s*[\d\w\:\.\,\|\s\[\]\(\)\-\%]*/gi, '')
        .replace(/--- SYSTEM CONTEXT ---[\s\S]*?--- UNIVERSAL NEWS ---/gi, '')
        .trim();
    const { text: processed, stash, restore } = shieldMarkup(cleaned);
    const toLink = (_, label, url) => renderLink(label, url, stash);

    const lines = processed.split('\n');
    let inTable = false;
    let tableHtml = "";
    let midStage = "";

    lines.forEach(line => {
        const trimmed = line.trim();
        const hasPipes = trimmed.includes('|');
        const isSeparator = /^[|\s-]*(:?---:?|[|\s-]*)+$/.test(trimmed) && trimmed.includes('---');

        if (hasPipes || isSeparator) {
            if (isSeparator && !inTable) return; 

            const cols = (trimmed.startsWith('|') ? trimmed : '| ' + trimmed + ' |')
                .split('|')
                .map(c => c.trim())
                .filter((c, i, a) => i > 0 && i < a.length - 1);
            
            if (cols.length < 2) {
                if (inTable) {
                    tableHtml += '</tbody></table></div>';
                    midStage += tableHtml + '\n';
                    inTable = false;
                    tableHtml = "";
                }
                midStage += line + '\n';
                return;
            }

            if (!inTable) {
                inTable = true;
                tableHtml = '<div class="table-container"><table><thead><tr>' + 
                            cols.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
            } else if (!isSeparator) {
                tableHtml += '<tr>' + cols.map(c => `<td>${formatTableCell(c, toLink)}</td>`).join('') + '</tr>';
            }
        } else {
            if (inTable) {
                tableHtml += '</tbody></table></div>';
                midStage += '\n' + tableHtml + '\n\n';
                inTable = false;
                tableHtml = "";
            }
            midStage += line + '\n';
        }
    });
    if (inTable) midStage += '\n' + tableHtml + '</tbody></table></div>\n\n';

    let finalHtml = midStage
        .replace(/^[#\s]*### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^[#\s]*## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^[#\s]*# (.*$)/gim, '<h1>$1</h1>')
        .replace(MD_LINK_RE, toLink)
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/---/g, '<hr class="institutional-divider">');
    // Tags come back only now: block detection below needs them, the inline regexes must not see them.
    finalHtml = restore(finalHtml);

    finalHtml = finalHtml.split('\n\n').map(block => {
        const trimmed = block.trim();
        if (!trimmed) return '';
        if (/^<(div|table|section|h[1-6]|ul|li|hr|span|header|aside|footer)/i.test(trimmed)) return trimmed;
        if (trimmed.indexOf('class="table-container"') !== -1) return trimmed;
        return `<p style="color:var(--nexus-text-muted); line-height:1.7;">${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');
    
    return finalHtml.replace(/<li>/g, '<ul><li>').replace(/<\/li>/g, '</li></ul>').replace(/<\/ul>\s*<ul>/g, '').trim();
}

/**
 * Markdown -> HTML with charts rendered server-side as static SVG.
 * Charts are shielded from parseMD via placeholder tokens, then restored.
 * Invalid payloads are reported (never leaked as raw JSON) so telemetry can track LLM chart quality.
 */
function renderBody(md, chartOptions = {}) {
    const target = chartOptions.target ?? 'web';
    const { text, restore, failures, degraded, count } = extractChartBlocks(md || "", chartOptions);
    reportChartFailures(failures, { target });
    reportChartDegradations(degraded, { target });
    // Web pages with charts get the narrow-layout CSS + tap tooltips once; email clients strip scripts.
    const assets = target === 'web' && count > 0 ? chartPageAssets() : "";
    return restore(parseMD(text)) + assets;
}

/**
 * Escape every payload field interpolated into a page shell. Model-generated title/excerpt are
 * untrusted; freq/rel/dateLabel are escaped too so no caller has to reason about their origin.
 */
function escapeShellFields({ title, excerpt, dateLabel, freq, rel }) {
    return {
        title: escapeHtml(title),
        excerpt: escapeHtml(excerpt),
        dateLabel: escapeHtml(dateLabel),
        freq: escapeHtml(String(freq ?? "").toUpperCase()),
        rel: escapeHtml(rel),
    };
}

/**
 * `scripts` is trusted, caller-supplied markup (never model output) and is inserted verbatim.
 */
function getBaseTemplate({ title, excerpt, content, dateLabel, type, freq, fileName, rel = "../../", sentimentScore = 50, priceInfo = { last: "0", high: "0", low: "0" }, scripts = "" }) {
    const finalBody = renderBody(content);
    const safe = escapeShellFields({ title, excerpt, dateLabel, freq, rel });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safe.title} | Nexus Institutional Terminal</title>
    <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --nexus-bg: #030303;
            --nexus-sidebar: #050505;
            --nexus-accent: #9B1C1C; /* Deep Institutional Crimson */
            --nexus-text-main: #E2E8F0; 
            --nexus-text-muted: #64748B; 
            --nexus-border: rgba(155,28,28,0.25);
            --nexus-glow: rgba(155,28,28,0.15);
        }
        body { background: var(--nexus-bg); color: var(--nexus-text-muted); font-family: 'Mulish', sans-serif; margin: 0; min-height: 100vh; overflow-x: hidden; }
        
        /* 🚀 MINIMALIST BRANDING: Icon Only */
        .global-logo { position: fixed; top: 1.5rem; left: 1.5rem; display: flex; align-items: center; justify-content: center; z-index: 200; background: rgba(10,10,10,0.9); backdrop-filter: blur(10px); width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--nexus-border); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); box-shadow: 0 0 20px rgba(0,0,0,0.5); }
        .global-logo:hover { transform: scale(1.1); border-color: var(--nexus-accent); box-shadow: 0 0 30px rgba(191,161,0,0.2); }
        .global-logo img { width: 24px; height: 24px; filter: contrast(1.1); }
        
        .app-container { display: flex; width: 100%; }
        .main-content { flex: 1; padding: 6rem 12% 4rem 12%; max-width: 1200px; margin: 0 auto; min-height: 100vh; position: relative; z-index: 10; }
        .rhs-sidebar { width: 380px; background: #070707; padding: 6rem 2.5rem; height: 100vh; position: sticky; top: 0; overflow-y: auto; border-left: 1px solid var(--nexus-border); flex-shrink: 0; }
        
        .status-tag { background: rgba(191, 161, 0, 0.1); color: var(--nexus-accent); padding: 0.4rem 0.8rem; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 2rem; display: inline-block; border: 1px solid var(--nexus-border); letter-spacing: 0.1rem; font-family: 'JetBrains Mono', monospace; }
        h1 { font-size: 3.5rem; color: var(--nexus-text-main); margin-bottom: 2rem; letter-spacing: -2px; font-weight: 800; line-height: 1; }
        h2 { font-family: 'Mulish', sans-serif; font-weight: 700; color: var(--nexus-accent); margin-top: 5rem; font-size: 1.8rem; text-transform: uppercase; border-top: 1px solid var(--nexus-border); padding-top: 2.5rem; letter-spacing: -0.5px; }
        h3 { font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: var(--nexus-accent); margin-top: 3rem; margin-bottom: 1.5rem; text-transform: uppercase; letter-spacing: 2px; border-left: 3px solid var(--nexus-accent); padding-left: 1rem; }
        
        .excerpt { font-size: 1.3rem; line-height: 1.6; color: var(--nexus-text-main); margin: 3rem 0; opacity: 0.9; font-weight: 400; border-left: 2px solid var(--nexus-accent); padding-left: 2rem; }

        .table-container { margin: 3rem 0; background: #080808; border: 1px solid var(--nexus-border); overflow-x: auto; box-shadow: 0 20px 40px rgba(0,0,0,0.6); }
        table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }
        th { text-align: left; padding: 1.4rem; background: rgba(191,161,0,0.1); color: var(--nexus-accent); border-bottom: 2px solid var(--nexus-accent); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 1.2rem; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(248, 250, 252, 0.85); }
        tr:hover { background: rgba(191, 161, 0, 0.04); }

        .institutional-abstract { background: rgba(191, 161, 0, 0.03); border: 1px solid var(--nexus-border); padding: 2.5rem; margin: 3rem 0; position: relative; }
        .institutional-abstract h3 { border: none; padding: 0; margin-top: 0; font-size: 0.75rem; opacity: 0.6; }
        .institutional-glossary { margin: 5rem 0; padding: 3rem 0; }
        .institutional-glossary li { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; padding: 1rem 0; border-bottom: 1px dotted rgba(191, 161, 0, 0.1); list-style: none; }
        .institutional-glossary li strong { color: var(--nexus-accent); }

        .terminal-chart { min-height: 450px; background: #070707; border: 1px solid var(--nexus-border); margin: 4rem 0; position: relative; border-radius: 4px; }
        .terminal-chart::after { content: "DATA_VISUALIZATION_ENCLAVE"; position: absolute; bottom: 10px; right: 15px; font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; color: rgba(191,161,0,0.2); }

        /* RHS Interlinks */
        .rhs-title { font-family: 'JetBrains Mono', monospace; font-size: 0.6rem; color: var(--nexus-accent); margin-bottom: 2rem; letter-spacing: 4px; padding-bottom: 0.8rem; text-transform: uppercase; }
        .interlink-card { background: #0A0A0A; border: 1px solid var(--nexus-border); padding: 1.2rem; margin-bottom: 1.2rem; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; text-decoration: none; display: block; }
        .interlink-card:hover { transform: translateY(-3px); border-color: var(--nexus-accent); box-shadow: 0 10px 20px rgba(0,0,0,0.4); }
        .interlink-card h4 { margin: 0 0 0.6rem 0; font-size: 0.85rem; color: var(--nexus-text-main); font-weight: 700; line-height: 1.4; }
        .interlink-card .meta { font-family: 'JetBrains Mono', monospace; font-size: 0.55rem; color: var(--nexus-accent); opacity: 0.5; }

        .vertical-flow-item { display: flex; justify-content: space-between; align-items: center; padding: 1rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); font-family: 'JetBrains Mono', monospace; font-size: 0.7rem; color: var(--nexus-text-muted); text-decoration: none; transition: color 0.2s; }
        .vertical-flow-item:hover { color: var(--nexus-accent); }
        .vertical-flow-item .score { font-weight: 700; color: #00D166; }
        
        /* AdSense Helper */
        .institutional-adsense { margin: 4rem 0; text-align: center; background: rgba(5,5,5,0.5); padding: 1rem; border: 1px solid rgba(255,255,255,0.02); }
        .ads-label { font-size: 0.5rem; color: var(--nexus-accent); opacity: 0.3; letter-spacing: 3px; font-family: 'JetBrains Mono', monospace; margin-bottom: 1rem; }
    </style>
</head>
<body>
    <a href="/" class="global-logo" title="Back to Intelligence Hub">
        <img src="${safe.rel}favicon.svg" alt="Nexus Icon">
    </a>

    <div class="app-container">
        <main class="main-content">
            <div class="status-tag">${safe.freq} STRATEGIC MANUSCRIPT • ${safe.dateLabel}</div>
            <h1>${safe.title}</h1>
            <div class="excerpt">${safe.excerpt}</div>
            
            <div class="institutional-adsense">
                <div class="ads-label">COMMERCIAL PROTOCOL</div>
                <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-PLACEHOLDER" data-ad-slot="PLACEHOLDER" data-ad-format="auto" data-full-width-responsive="true"></ins>
                <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
            </div>

            <section class="manuscript-body">
                ${finalBody}
                <div class="institutional-glossary">
                    <h2>INSTITUTIONAL GLOSSARY</h2>
                    <ul>
                        <li><strong>Alpha (α):</strong> Superiority of returns relative to benchmark performance.</li>
                        <li><strong>Basis Point:</strong> A unit of measure for interest rates (1/100th of 1%).</li>
                        <li><strong>Liquidity Drift:</strong> Cumulative variance in market depth metrics.</li>
                    </ul>
                </div>
            </section>
        </main>

        <aside class="rhs-sidebar">
            <div class="rhs-title">STRATEGIC ANCHORS</div>
            <a href="#sector-macro" class="interlink-card">
                <h4>Global Macro Resilience Protocol</h4>
                <div class="meta">Vertical: MACRO • Pulse: STABLE</div>
            </a>
            <a href="#sector-equities" class="interlink-card">
                <h4>Institutional Alpha Rotation v2</h4>
                <div class="meta">Vertical: EQUITIES • Pulse: ACTIVE</div>
            </a>
            <a href="#sector-debt" class="interlink-card">
                <h4>Debt & Liquidity Surveillance</h4>
                <div class="meta">Vertical: DEBT • Pulse: MONITOR</div>
            </a>

            <div class="rhs-title" style="margin-top: 4rem;">VERTICAL FLOWS</div>
            <a href="#sector-banking" class="vertical-flow-item"><span>BANKING</span> <span class="score">98%</span></a>
            <a href="#sector-cards" class="vertical-flow-item"><span>CARDS</span> <span class="score">94%</span></a>
            <a href="#sector-mutualunds" class="vertical-flow-item"><span>MUTUAL FUNDS</span> <span class="score">89%</span></a>
        </aside>
    </div>

    <script>
        // 🚀 HASH-FREE SMOOTH SCROLL (Institutional Integration)
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a[href^="#"]');
            if (link) {
                e.preventDefault();
                const target = document.getElementById(link.getAttribute('href').substring(1));
                if (target) {
                    window.scrollTo({
                        top: target.getBoundingClientRect().top + window.pageYOffset - 120,
                        behavior: 'smooth'
                    });
                }
            }
        });
    </script>
    ${scripts || ''}
</body>
</html>`;
}

function getEmailTemplate({ title, excerpt, content, dateLabel, fileName, freq, priceInfo = { last: "N/A", high: "N/A", low: "N/A" } }) {
    const finalBody = renderBody(content, { target: 'email' }); // Gmail/Outlook strip inline SVG: charts ship as tables
    return `<!DOCTYPE html><html><body style="background: #050505; color: #D1D5DB; font-family: sans-serif; padding: 20px;">
        <h1 style="color: #F8FAFC;">${escapeHtml(title)}</h1>
        <div style="border-left: 4px solid #FFB800; padding-left: 15px; margin: 20px 0;">${escapeHtml(excerpt)}</div>
        <div>${finalBody}</div>
    </body></html>`;
}

import { getApexTemplate } from './apex-template.js';

export { getBaseTemplate, getEmailTemplate, getApexTemplate, parseMD, renderBody, escapeShellFields };
