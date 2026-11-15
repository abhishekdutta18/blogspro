import { renderBody, escapeShellFields } from './templates.js';
import { escapeHtml } from './html-sanitizer.js';

const STABLE_BASELINE = "Pulse Baseline: Stable.";
const NEUTRAL = "Neutral.";
const ITEM_SEPARATOR = ' | ';
const GLOBAL_MARKER = ' | GLOBAL: ';

/**
 * Live news-wire block. Items are scraped headlines (untrusted), so each one is escaped;
 * only the labels and layout are markup. Accepts the legacy string shape or { rbi, sebi, summary }.
 * @param {string | { rbi?: string, sebi?: string, summary?: string } | null | undefined} liveNews
 * @returns {string} HTML, or '' when there is nothing worth showing
 */
function renderLiveNews(liveNews) {
    if (!liveNews || liveNews === STABLE_BASELINE) return "";
    const rows = typeof liveNews === 'string'
        ? liveNews.split(ITEM_SEPARATOR).map(item => `<div>${escapeHtml(item)}</div>`)
        : newsObjectItems(liveNews).map(item => `<div style="margin-bottom:0.5rem">${item}</div>`);
    if (!rows.length) return "";
    return `
            <div class="terminal-block">
                <div style="margin-bottom: 1rem; color: var(--accent); font-weight: bold;">LIVE_DATA_STREAM_PRIMED</div>
                <div style="display: grid; grid-template-columns: 1fr; gap: 0.5rem; opacity: 0.8;">
                    ${rows.join('')}
                </div>
            </div>`;
}

function newsObjectItems({ rbi, sebi, summary }) {
    const items = [];
    if (rbi && rbi !== NEUTRAL) items.push(`<strong>RBI:</strong> ${escapeHtml(rbi)}`);
    if (sebi && sebi !== NEUTRAL) items.push(`<strong>SEBI:</strong> ${escapeHtml(sebi)}`);
    const globalOnly = String(summary || "").split(GLOBAL_MARKER)[1];
    if (globalOnly) {
        globalOnly.split(ITEM_SEPARATOR).forEach(item => items.push(`<strong>GLOBAL:</strong> ${escapeHtml(item)}`));
    }
    return items;
}

/**
 * [V16.0] Institutional Briefing Template
 * Designed for maximum readability and zero fluff.
 */
export function getBriefingTemplate({ title, excerpt, content, dateLabel, type, freq, fileName, rel = "../../", scripts = "", liveNews = "" }) {
    const finalBody = renderBody(content);
    const safe = escapeShellFields({ title, excerpt, dateLabel, freq, rel });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safe.title} | Institutional Briefing</title>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0A0A0A;
            --surface: #121212;
            --accent: #FF3B30; /* Institutional Red */
            --text-main: #F8FAFC;
            --text-muted: #94A3B8;
            --border: rgba(255,255,255,0.08);
        }
        * { box-sizing: border-box; }
        body { 
            background: var(--bg); 
            color: var(--text-main); 
            font-family: 'Inter', sans-serif; 
            margin: 0; 
            line-height: 1.6;
        }
        
        .container { 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 4rem 2rem; 
        }

        header {
            margin-bottom: 4rem;
            border-bottom: 1px solid var(--border);
            padding-bottom: 2rem;
        }

        .meta-strip {
            display: flex;
            justify-content: space-between;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem;
            color: var(--accent);
            text-transform: uppercase;
            letter-spacing: 2px;
            margin-bottom: 1rem;
        }

        h1 {
            font-size: 2.5rem;
            font-weight: 800;
            letter-spacing: -0.04em;
            margin: 0 0 1.5rem 0;
            line-height: 1.1;
        }

        .abstract {
            font-size: 1.1rem;
            color: var(--text-muted);
            border-left: 2px solid var(--accent);
            padding-left: 1.5rem;
            margin: 2rem 0;
        }

        article {
            font-size: 1.05rem;
        }

        article h2 {
            font-size: 1.5rem;
            margin-top: 3rem;
            color: var(--text-main);
            border-bottom: 1px solid var(--border);
            padding-bottom: 0.5rem;
        }

        article p {
            margin-bottom: 1.5rem;
            color: #CBD5E1;
        }

        article strong { color: var(--text-main); }

        .terminal-block {
            background: var(--surface);
            border: 1px solid var(--border);
            padding: 1.5rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            margin: 2rem 0;
            position: relative;
            overflow: hidden;
        }
        
        .terminal-block::before {
            content: "SECURE_PULSE_STREAM";
            position: absolute;
            top: 0;
            right: 0;
            background: var(--accent);
            color: white;
            font-size: 0.6rem;
            padding: 2px 8px;
        }

        footer {
            margin-top: 6rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border);
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.7rem;
            color: var(--text-muted);
            display: flex;
            justify-content: space-between;
        }

        .back-link {
            text-decoration: none;
            color: var(--text-muted);
            transition: color 0.2s;
        }
        .back-link:hover { color: var(--accent); }

        /* Custom Bullet points for institutional look */
        ul { list-style: none; padding-left: 0; }
        li { position: relative; padding-left: 1.5rem; margin-bottom: 0.75rem; }
        li::before {
            content: "→";
            position: absolute;
            left: 0;
            color: var(--accent);
        }

        @media (max-width: 600px) {
            h1 { font-size: 2rem; }
            .container { padding: 2rem 1.5rem; }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="meta-strip">
                <span>Registry: Institutional-AI</span>
                <span>${safe.freq} Pulse • ${safe.dateLabel}</span>
            </div>
            <h1>${safe.title}</h1>
            <div class="abstract">${safe.excerpt}</div>
        </header>

        <article>
            ${finalBody}
        </article>

        ${renderLiveNews(liveNews)}

        <footer>
            <a href="/" class="back-link">← Return to Terminal</a>
            <span>Institutional Strategic Research • All Rights Reserved</span>
        </footer>
    </div>
    ${scripts || ''}
</body>
</html>`;
}
