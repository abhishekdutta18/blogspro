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
            --nexus-bg: #050505;
            --nexus-sidebar: rgba(18, 18, 18, 0.98);
            --nexus-glass: rgba(10, 10, 10, 0.9);
            --nexus-accent: #BFA100; /* Bloomberg Gold */
            --nexus-amber: #FFB800;  /* Data Amber */
            --nexus-border: rgba(191, 161, 0, 0.15);
            --nexus-text-h1: #F8FAFC;
            --nexus-text-p: #D1D5DB;
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

        /* Bloomberg Sidebar - High Density */
        .sidebar {
            width: var(--sidebar-width);
            background: var(--nexus-sidebar);
            border-right: 1px solid var(--nexus-border);
            padding: 1rem;
            position: fixed;
            height: 100vh;
            display: flex;
            flex-direction: column;
            z-index: 100;
            overflow-y: auto;
        }

        .logo {
            font-family: 'JetBrains Mono', monospace;
            font-weight: 700;
            font-size: 1rem;
            color: var(--nexus-text-h1);
            margin-bottom: 2rem;
            letter-spacing: -0.5px;
            display: flex;
            align-items: center;
            text-decoration: none;
            padding-bottom: 1rem;
            border-bottom: 2px solid var(--nexus-accent);
        }
        .logo span { color: var(--nexus-amber); margin-left: 0.4rem; }

        .nav-group { margin-bottom: 1.5rem; }
        .nav-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.6rem;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 700;
            margin-bottom: 0.8rem;
            color: var(--nexus-accent);
            padding-left: 0.5rem;
            opacity: 0.6;
        }

        .nav-item {
            display: flex;
            align-items: center;
            padding: 0.5rem 0.8rem;
            border-radius: 4px;
            color: rgba(255,255,255,0.6);
            text-decoration: none;
            font-size: 0.8rem;
            font-family: 'JetBrains Mono', monospace;
            transition: all 0.1s;
            margin-bottom: 0.2rem;
            border-left: 2px solid transparent;
        }

        .nav-item:hover {
            background: rgba(191, 161, 0, 0.05);
            color: var(--nexus-accent);
            border-left: 2px solid var(--nexus-accent);
        }

        /* Terminal Body Architecture */
        .main-content {
            margin-left: var(--sidebar-width);
            flex: 1;
            padding: 3rem 4rem;
            max-width: 1200px;
        }

        header { margin-bottom: 3rem; }
        .status-tag {
            font-family: 'JetBrains Mono', monospace;
            background: rgba(191, 161, 0, 0.1);
            color: var(--nexus-accent);
            padding: 0.2rem 0.6rem;
            border-radius: 2px;
            font-size: 0.65rem;
            font-weight: 700;
            text-transform: uppercase;
            margin-bottom: 1rem;
            display: inline-block;
            border: 1px solid var(--nexus-border);
        }

        h1 {
            font-family: 'Inter', sans-serif;
            font-size: 2.8rem;
            color: var(--nexus-text-h1);
            line-height: 1.1;
            margin-bottom: 1rem;
            letter-spacing: -1px;
            font-weight: 800;
        }

        .excerpt {
            font-size: 1.15rem;
            color: var(--nexus-text-p);
            max-width: 850px;
            border-left: 4px solid var(--nexus-amber);
            padding-left: 1.5rem;
            margin: 1.5rem 0;
            opacity: 0.8;
        }

        /* Terminal Typography */
        .manuscript-body h2 {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.3rem;
            color: var(--nexus-accent);
            margin: 3.5rem 0 1.2rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-top: 1px solid var(--nexus-border);
            padding-top: 1.5rem;
        }

        .manuscript-body p {
            font-size: 1.05rem;
            margin-bottom: 1.5rem;
            color: rgba(209, 213, 219, 0.85);
        }

        /* Bloomberg Table & Card Logic */
        .card {
            background: rgba(20, 20, 20, 0.5);
            border: 1px solid var(--nexus-border);
            border-left: 4px solid var(--nexus-accent);
            padding: 1.5rem;
            margin: 2.5rem 0;
        }

        .card-title {
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--nexus-amber);
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 1.5rem;
        }

        table {
            width: 100%;
            border-collapse: collapse;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.75rem;
        }

        th { text-align: left; padding: 0.8rem; border-bottom: 2px solid var(--nexus-accent); color: var(--nexus-accent); font-weight: 800; }
        td { padding: 0.8rem; border-bottom: 1px solid var(--nexus-border); color: var(--nexus-amber); }

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
