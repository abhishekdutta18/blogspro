const path = require("path");

function parseMD(md) {
    if (!md) return "";
    
    // 1. Mask AI Metadata (SENTIMENT_SCORE)
    let cleanMd = md.replace(/SENTIMENT_SCORE:\s*\d+/gi, '').trim();

    let html = cleanMd
        .replace(/### (.*$)/gim, '<h3>$1</h3>')
        .replace(/## (.*$)/gim, '<h2>$1</h2>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/\n\n/gim, '</p><p>')
        .replace(/<li>/g, '<ul><li>').replace(/<\/li>/g, '</li></ul>').replace(/<\/ul><ul>/g, '');

    // 2. High-Fidelity Table Parsing (Markdown -> Institutional HTML)
    const tableRegex = /\|(.+)\|\n\|([\s\-\|]+)\|\n((\|.+\|\n)+)/g;
    html = html.replace(tableRegex, (match, header, separator, body) => {
        const headers = header.split('|').map(h => h.trim()).filter(h => h).map(h => `<th>${h}</th>`).join('');
        const rows = body.trim().split('\n').map(row => {
            const cols = row.split('|').map(c => c.trim()).filter(c => c).map(c => {
                let cell = c;
                if (c.includes('+') || c.includes('▲')) cell = `<span style="color:#22c55e;font-weight:700;">▲ ${c.replace(/[\+\^▲]/g,'')}</span>`;
                else if (c.includes('-') || c.includes('▼')) cell = `<span style="color:#ef4444;font-weight:700;">▼ ${c.replace(/[\-\▼]/g,'')}</span>`;
                return `<td style="font-family: monospace; font-size: 0.9rem; border-bottom: 1px solid rgba(255,255,255,0.05);">${cell}</td>`;
            }).join('');
            return `<tr>${cols}</tr>`;
        }).join('');
        return `<div class="table-container"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    });
    return html;
}

function getBaseTemplate({ title, excerpt, content, dateLabel, type, freq, fileName, rel = "../../", sentimentScore = 50, priceInfo = { last: "0", high: "0", low: "0" } }) {
    const seoDescription = excerpt || "BlogsPro Institutional Strategic Manuscript - 13-Vertical Recursive Market Synthesis.";
    const seoKeywords = "GIFT City, IFSCA, Mutual Fund Inflows, PE/VC Deal Tracking, Institutional Market Intelligence, BlogsPro";
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Nexus Institutional Terminal</title>
    <meta name="description" content="${seoDescription}">
    <meta name="keywords" content="${seoKeywords}">
    
    <!-- Nexus Core Typography -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    
    <!-- Google Charts SDK -->
    <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
    <script type="text/javascript">
        google.charts.load('current', {'packages':['corechart', 'table']});
    </script>
    
    <style>
        :root {
            --nexus-bg: #0B0E11;
            --nexus-sidebar: rgba(26, 29, 33, 0.95);
            --nexus-glass: rgba(30, 31, 35, 0.7);
            --nexus-accent: #00F2FF;
            --nexus-border: rgba(255, 255, 255, 0.08);
            --nexus-text-h1: #F8FAFC;
            --nexus-text-p: #94A3B8;
            --nexus-success: #4ADE80;
            --nexus-warning: #F87171;
            --sidebar-width: 260px;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            background-color: var(--nexus-bg);
            color: var(--nexus-text-p);
            font-family: 'Inter', sans-serif;
            display: flex;
            min-height: 100vh;
            overflow-x: hidden;
            line-height: 1.6;
        }

        /* Expert Sidebar - 13 Institutional Verticals */
        .sidebar {
            width: var(--sidebar-width);
            background: var(--nexus-sidebar);
            border-right: 1px solid var(--nexus-border);
            padding: 1.5rem 1rem;
            position: fixed;
            height: 100vh;
            display: flex;
            flex-direction: column;
            backdrop-filter: blur(20px);
            z-index: 100;
            overflow-y: auto;
        }

        .logo {
            font-weight: 700;
            font-size: 1.2rem;
            color: var(--nexus-text-h1);
            margin-bottom: 2.5rem;
            letter-spacing: -0.5px;
            display: flex;
            align-items: center;
            text-decoration: none;
        }
        .logo span { color: var(--nexus-accent); margin-left: 0.4rem; }

        .nav-group { margin-bottom: 2rem; }
        .nav-label {
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
            margin-bottom: 1rem;
            color: rgba(255,255,255,0.3);
            padding-left: 0.5rem;
        }

        .nav-item {
            display: flex;
            align-items: center;
            padding: 0.7rem 0.8rem;
            border-radius: 8px;
            color: var(--nexus-text-p);
            text-decoration: none;
            font-size: 0.85rem;
            font-weight: 500;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            margin-bottom: 0.3rem;
        }

        .nav-item:hover {
            background: rgba(0, 242, 255, 0.08);
            color: var(--nexus-accent);
            transform: translateX(4px);
        }

        /* Content Architecture */
        .main-content {
            margin-left: var(--sidebar-width);
            flex: 1;
            padding: 4rem 5rem;
            max-width: 1100px;
        }

        header { margin-bottom: 4rem; }
        .status-tag {
            background: rgba(0, 242, 255, 0.1);
            color: var(--nexus-accent);
            padding: 0.3rem 0.8rem;
            border-radius: 4px;
            font-size: 0.7rem;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 1.5rem;
            display: inline-block;
            border: 1px solid rgba(0, 242, 255, 0.2);
        }

        h1 {
            font-size: 3rem;
            color: var(--nexus-text-h1);
            line-height: 1.1;
            margin-bottom: 1.5rem;
            letter-spacing: -1px;
        }

        .excerpt {
            font-size: 1.25rem;
            color: var(--nexus-text-p);
            max-width: 800px;
            border-left: 3px solid var(--nexus-accent);
            padding-left: 1.5rem;
            margin: 2rem 0;
        }

        /* Manuscript Typography */
        .manuscript-body h2 {
            font-size: 1.8rem;
            color: var(--nexus-text-h1);
            margin: 4rem 0 1.5rem;
            letter-spacing: -0.5px;
            display: flex;
            align-items: center;
        }
        .manuscript-body h2::before {
            content: "";
            width: 8px;
            height: 8px;
            background: var(--nexus-accent);
            display: inline-block;
            margin-right: 1rem;
            border-radius: 50%;
        }

        .manuscript-body p {
            font-size: 1.1rem;
            margin-bottom: 1.8rem;
            color: rgba(148, 163, 184, 0.9);
        }

        /* Data Visualization Containers */
        .card {
            background: var(--nexus-glass);
            border: 1px solid var(--nexus-border);
            border-radius: 16px;
            padding: 2rem;
            margin: 3rem 0;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }

        .card-title {
            font-size: 0.85rem;
            font-weight: 700;
            color: var(--nexus-accent);
            text-transform: uppercase;
            letter-spacing: 1.5px;
            margin-bottom: 2rem;
            border-bottom: 1px solid rgba(0, 242, 255, 0.2);
            padding-bottom: 0.5rem;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
        }

        th { text-align: left; padding: 1rem; border-bottom: 1px solid var(--nexus-border); color: rgba(255,255,255,0.4); }
        td { padding: 1.2rem 1rem; border-bottom: 1px solid var(--nexus-border); }

        .f-success { color: var(--nexus-success); font-weight: 600; }
        .f-warning { color: var(--nexus-warning); font-weight: 600; }

        @media (max-width: 1024px) {
            .sidebar { display: none; }
            .main-content { margin-left: 0; padding: 2rem; }
        }
    </style>
</head>
<body>
    <aside class="sidebar">
        <a href="${rel}index.html" class="logo">NEXUS<span>TERMINAL</span></a>
        
        <div class="nav-group">
            <div class="nav-label">Institutional Verticals</div>
            <nav>
                <a href="#macro" class="nav-item">Global Macro Drift</a>
                <a href="#debt" class="nav-item">Debt & Sovereignty</a>
                <a href="#digital" class="nav-item">Digital Rails</a>
                <a href="#equities" class="nav-item">Equities & Alpha</a>
                <a href="#reg" class="nav-item">Regulatory Ledger</a>
                <a href="#fx" class="nav-item">FX & Cross-Border</a>
                <a href="#commodity" class="nav-item">Commodity Pulse</a>
                <a href="#em" class="nav-item">Emerging Markets</a>
                <a href="#asset" class="nav-item">Asset Allocation</a>
                <a href="#scribe" class="nav-item">Scribe Analytics</a>
                <a href="#capital" class="nav-item">Capital Flows (PE/VC)</a>
                <a href="#insurance" class="nav-item">Insurance & Risk</a>
                <a href="#gift" class="nav-item">Offshore & GIFT City</a>
            </nav>
        </div>
        
        <div style="margin-top:auto; padding-top:2rem; border-top: 1px solid var(--nexus-border);">
            <div style="font-size:0.6rem; color:rgba(255,255,255,0.2); text-transform:uppercase;">BlogsPro Intel Unit</div>
            <div style="font-size:0.75rem; color:var(--nexus-accent); font-weight:600;">V6.30 Sovereign Pass</div>
        </div>
    </aside>

    <main class="main-content">
        <header>
            <div class="status-tag">Status: Institutional Manuscript • ${dateLabel}</div>
            <h1>${title}</h1>
            <div class="excerpt">${excerpt}</div>
        </header>

        <div class="manuscript-body">
            ${parseMD(content)}
        </div>

        <footer style="margin-top: 10rem; padding-top: 3rem; border-top: 1px solid var(--nexus-border); text-align: center;">
            <p style="font-size: 0.75rem; color: rgba(248, 250, 252, 0.4); letter-spacing: 1px;">
                © ${new Date().getFullYear()} BLOGSPRO TERMINAL • ALL RIGHTS RESERVED • INSTITUTIONAL USE ONLY
            </p>
        </footer>
    </main>
</body>
</html>`;
}

module.exports = { getBaseTemplate };
