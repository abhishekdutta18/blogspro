import { parseMD } from './templates.js';

/**
 * [V17.0] Institutional Terminal V2.0 Template
 * Optimized for high-density strategic pulse delivery.
 * Features: Dark-mode terminal aesthetics, structural data ribbons, 
 * and advanced regulatory snippet rendering.
 */
export function getTerminalV2Template({ title, excerpt, content, dateLabel, type, freq, fileName, rel = "../../", scripts = "", liveNews = "" }) {
    // Sanitize content: Strip DOCTYPE, html, head, body if AI hallucinations included them
    let sanitizedContent = content;
    if (content.includes('<!DOCTYPE html>') || content.includes('<html')) {
        const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        if (bodyMatch) {
            sanitizedContent = bodyMatch[1];
        } else {
            // If no body tag, strip head if present
            sanitizedContent = content.replace(/<head[\s\S]*?<\/head>/gi, '')
                                     .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
                                     .replace(/<\/?html[^>]*>/gi, '')
                                     .replace(/<\/?body[^>]*>/gi, '');
        }
    }
    const finalBody = parseMD(sanitizedContent);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Institutional Terminal</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&family=Cormorant+Garamond:ital,wght@1,600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #05070A;
            --surface: #0C111A;
            --accent: #E11D48; /* BlogsPro Crimson */
            --text-main: #F8FAFC;
            --text-muted: #64748B;
            --border: rgba(225, 29, 72, 0.15);
            --neon-glow: 0 0 15px rgba(225, 29, 72, 0.2);
        }
        
        * { box-sizing: border-box; }
        body { 
            background: var(--bg); 
            color: var(--text-main); 
            font-family: 'Inter', sans-serif; 
            margin: 0; 
            line-height: 1.6;
            overflow-x: hidden;
        }

        /* --- TERMINAL GRID --- */
        .terminal-layout {
            display: grid;
            grid-template-columns: 1fr;
            min-height: 100vh;
        }

        .header-ribbon {
            background: var(--surface);
            border-bottom: 1px solid var(--border);
            padding: 0.75rem 2rem;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem;
            letter-spacing: 1px;
            color: var(--accent);
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(12px);
        }

        .container { 
            max-width: 900px; 
            margin: 0 auto; 
            padding: 4rem 2rem; 
        }

        .title-block {
            margin-bottom: 4rem;
            border-left: 4px solid var(--accent);
            padding-left: 2rem;
        }

        h1 {
            font-size: 3.5rem;
            font-weight: 800;
            letter-spacing: -0.05em;
            margin: 0 0 1rem 0;
            line-height: 1;
            font-family: 'Inter', sans-serif;
        }

        .abstract {
            font-size: 1.25rem;
            color: var(--text-muted);
            margin: 1.5rem 0;
            font-family: 'Cormorant Garamond', serif;
            font-style: italic;
            line-height: 1.4;
        }

        /* --- DATA BLOCKS --- */
        .data-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 1.5rem;
            margin-bottom: 4rem;
        }

        .data-card {
            background: var(--surface);
            border: 1px solid var(--border);
            padding: 1.5rem;
            position: relative;
        }

        .data-card::before {
            content: "INTEL_NODE";
            position: absolute;
            top: 0;
            right: 0;
            background: var(--accent);
            color: white;
            font-size: 0.5rem;
            padding: 2px 6px;
            font-family: 'JetBrains Mono', monospace;
        }

        .data-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.65rem;
            color: var(--text-muted);
            text-transform: uppercase;
            margin-bottom: 0.5rem;
            display: block;
        }

        .data-value {
            font-size: 0.9rem;
            color: var(--text-main);
            display: block;
        }

        /* --- CONTENT --- */
        article {
            font-size: 1.1rem;
            color: #CBD5E1;
        }

        article h2 {
            font-size: 1.8rem;
            margin-top: 4rem;
            color: var(--text-main);
            border-bottom: 1px solid var(--border);
            padding-bottom: 0.5rem;
            font-weight: 800;
        }

        article p { margin-bottom: 1.5rem; }

        /* --- NEWS TERMINAL --- */
        .news-terminal {
            background: #000;
            border: 1px solid var(--accent);
            padding: 2rem;
            margin: 4rem 0;
            font-family: 'JetBrains Mono', monospace;
            box-shadow: var(--neon-glow);
        }

        .news-header {
            color: var(--accent);
            font-weight: bold;
            margin-bottom: 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
        }

        .news-header::after {
            content: "";
            flex: 1;
            height: 1px;
            background: var(--border);
        }

        .news-item {
            margin-bottom: 1rem;
            font-size: 0.8rem;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            padding-bottom: 0.75rem;
        }

        .news-tag { color: var(--accent); margin-right: 0.5rem; }

        footer {
            margin-top: 8rem;
            padding: 4rem 0;
            border-top: 1px solid var(--border);
            text-align: center;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem;
            color: var(--text-muted);
        }

        .back-link {
            display: inline-block;
            margin-bottom: 2rem;
            color: var(--accent);
            text-decoration: none;
            border: 1px solid var(--accent);
            padding: 0.5rem 1.5rem;
            transition: all 0.2s;
        }
        .back-link:hover { background: var(--accent); color: white; }

        @media (max-width: 768px) {
            h1 { font-size: 2.5rem; }
            .header-ribbon { padding: 0.75rem 1rem; font-size: 0.6rem; }
            .container { padding: 2rem 1.5rem; }
        }
    </style>
</head>
<body>
    <div class="terminal-layout">
        <div class="header-ribbon">
            <span>TERMINAL_ID: BPRO-INST-PULSE</span>
            <span>SYSTEM_STATUS: ONLINE</span>
            <span>TIMESTAMP: ${dateLabel.toUpperCase()}</span>
        </div>

        <div class="container">
            <div class="title-block">
                <h1>${title}</h1>
                <div class="abstract">${excerpt}</div>
            </div>

            <div class="data-grid">
                <div class="data-card">
                    <span class="data-label">Pulse Frequency</span>
                    <span class="data-value">${freq.toUpperCase()} STRATEGIC UPDATE</span>
                </div>
                <div class="data-card">
                    <span class="data-label">Analytical Density</span>
                    <span class="data-value">INSTITUTIONAL GRADE V5</span>
                </div>
                <div class="data-card">
                    <span class="data-label">Source Reliability</span>
                    <span class="data-value">CRYSTAL_GROUNDED_S1</span>
                </div>
            </div>

            <article>
                ${finalBody}
            </article>

            ${liveNews ? (function() {
                let newsHtml = "";
                if (typeof liveNews === 'string') {
                    if (liveNews === "Pulse Baseline: Stable.") return "";
                    newsHtml = liveNews.split(' | ').map(item => `
                        <div class="news-item">
                            <span class="news-tag">LIVE_WIRE</span> ${item}
                        </div>
                    `).join('');
                } else {
                    const items = [];
                    if (liveNews.rbi && liveNews.rbi !== "Neutral.") {
                        liveNews.rbi.split(' | ').forEach(i => items.push(`<span class="news-tag">RBI</span> ${i}`));
                    }
                    if (liveNews.sebi && liveNews.sebi !== "Neutral.") {
                        liveNews.sebi.split(' | ').forEach(i => items.push(`<span class="news-tag">SEBI</span> ${i}`));
                    }
                    const summaryText = liveNews.summary || "";
                    const globalOnly = summaryText.split(' | GLOBAL: ')[1];
                    if (globalOnly) {
                        globalOnly.split(' | ').forEach(gi => items.push(`<span class="news-tag">GLOBAL</span> ${gi}`));
                    }
                    newsHtml = items.map(item => `<div class="news-item">${item}</div>`).join('');
                }
                if (!newsHtml) return "";
                return `
                <div class="news-terminal">
                    <div class="news-header">STRATEGIC_NEWS_WIRE</div>
                    <div class="news-feed">
                        ${newsHtml}
                    </div>
                </div>`;
            })() : ''}

            <footer>
                <a href="/" class="back-link">ACCESS TERMINAL_CORE</a>
                <div>BlogsPro Institutional Research • Sovereign Intelligence Pipeline • ${new Date().getFullYear()}</div>
            </footer>
        </div>
    </div>
    ${scripts || ''}
</body>
</html>`;
}
