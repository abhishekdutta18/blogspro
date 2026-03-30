function parseMD(md) {
    if (!md) return "";
    
    // 1. Structural Preservation (Protecting Industrial Markers)
    let processed = md
        // We no longer strip chart-data here, as the Template Worker needs to pass it to the UI
        .replace(/SENTIMENT_SCORE:\s*[\d\w\[\]\/\-\s]*/gi, '')
        .replace(/PRICE_INFO:\s*[\d\w\:\.\,\|\s\[\]\(\)\-\%]*/gi, '')
        .replace(/Weekend Price Info:\s*[\d\w\:\.\,\|\s\[\]\(\)\-\%]*/gi, '')
        .replace(/--- SYSTEM CONTEXT ---[\s\S]*?--- UNIVERSAL NEWS ---/gi, '')
        .trim();

    // 2. Industrial Table Parser (High Density Resilience)
    const lines = processed.split('\n');
    let inTable = false;
    let tableHtml = "";
    let midStage = "";

    lines.forEach(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('|')) {
            if (trimmed.includes('---')) return;

            const cols = trimmed.split('|')
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
            } else {
                tableHtml += '<tr>' + cols.map(c => {
                    let content = c;
                    content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
                    if (c.includes('+') || c.includes('▲')) content = `<span style="color:#22c55e;">▲ ${c.replace(/[\+\^▲]/g,'')}</span>`;
                    else if (c.includes('-') || c.includes('▼')) content = `<span style="color:#ef4444;">▼ ${c.replace(/[\-\▼]/g,'')}</span>`;
                    return `<td>${content}</td>`;
                }).join('') + '</tr>';
            }
        } else {
            if (inTable) {
                tableHtml += '</tbody></table></div>';
                midStage += tableHtml + '\n';
                inTable = false;
                tableHtml = "";
            }
            midStage += line + '\n';
        }
    });
    if (inTable) midStage += tableHtml + '</tbody></table></div>';

    // 3. Final HTML Synthesis
    let finalHtml = midStage
        .replace(/### (.*$)/gim, '<h3>$1</h3>')
        .replace(/## (.*$)/gim, '<h2>$1</h2>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>');
        
    finalHtml = finalHtml.split('\n\n').map(block => {
        block = block.trim();
        if (!block) return '';
        if (block.startsWith('<div') || block.startsWith('<h') || block.startsWith('<ul') || block.startsWith('<li')) return block;
        return '<p>' + block + '</p>';
    }).join('\n');
    
    return finalHtml.replace(/<li>/g, '<ul><li>').replace(/<\/li>/g, '</li></ul>').replace(/<\/ul>\s*<ul>/g, '').trim();
}

function getBaseTemplate({ title, excerpt, content, dateLabel, type, freq, fileName, rel = "../../", sentimentScore = 50, priceInfo = { last: "0", high: "0", low: "0" }, scripts = "" }) {
    const seoDescription = excerpt || "BlogsPro Institutional Strategic Manuscript - 16-Vertical Specialized Market Synthesis.";
    const seoKeywords = "Banking, Cards, Payments, Mutual Fund Inflows, PE/VC Deal Tracking, Institutional Market Intelligence, BlogsPro";
    
    // Auto-parse content if it's still raw markdown
    const finalBody = content.includes('<h') ? content : parseMD(content);

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} | Nexus Institutional Terminal</title>
    <meta name="description" content="${seoDescription}">
    <meta name="keywords" content="${seoKeywords}">
    <link href="https://fonts.googleapis.com/css2?family=Mulish:wght@400;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
    <script type="text/javascript" src="https://www.gstatic.com/charts/loader.js"></script>
    <style>
        :root {
            --nexus-bg: #050505;
            --nexus-sidebar: #0A0A0A;
            --nexus-accent: #BFA100;
            --nexus-amber: #FFB800;
            --nexus-border: rgba(191, 161, 0, 0.2);
            --nexus-text-h1: #F8FAFC;
            --nexus-text-p: #D1D5DB;
            --sidebar-width: 260px;
        }

        body { background: var(--nexus-bg); color: var(--nexus-text-p); font-family: 'Mulish', sans-serif; display: flex; margin: 0; min-height: 100vh; }
        
        .sidebar { width: var(--sidebar-width); background: var(--nexus-sidebar); border-right: 1px solid var(--nexus-border); padding: 1.5rem; position: fixed; height: 100vh; overflow-y: auto; }
        .logo { font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--nexus-text-h1); text-decoration: none; border-bottom: 2px solid var(--nexus-accent); padding-bottom: 0.5rem; display: block; margin-bottom: 2rem; }
        .logo span { color: var(--nexus-amber); }

        .main-content { margin-left: var(--sidebar-width); flex: 1; padding: 4rem; max-width: 1100px; }
        
        .status-tag { font-family: 'JetBrains Mono', monospace; background: rgba(191, 161, 0, 0.1); color: var(--nexus-accent); padding: 0.3rem 0.7rem; font-size: 0.7rem; text-transform: uppercase; margin-bottom: 1.5rem; display: inline-block; border: 1px solid var(--nexus-border); }
        h1 { font-size: 3rem; color: var(--nexus-text-h1); margin-bottom: 1.5rem; letter-spacing: -1px; font-weight: 800; }
        h2 { font-family: 'JetBrains Mono', monospace; color: var(--nexus-accent); margin-top: 4rem; font-size: 1.4rem; text-transform: uppercase; border-top: 1px solid var(--nexus-border); padding-top: 2rem; }
        
        .excerpt { border-left: 4px solid var(--nexus-amber); padding-left: 1.5rem; margin: 2rem 0; font-size: 1.2rem; opacity: 0.9; font-style: italic; }

        .table-container { margin: 2.5rem 0; background: #0A0A0A; border: 1px solid var(--nexus-border); }
        table { width: 100%; border-collapse: collapse; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; }
        th { text-align: left; padding: 1rem; background: rgba(191,161,0,0.05); color: var(--nexus-accent); border-bottom: 2px solid var(--nexus-accent); }
        td { padding: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); }

        .nav-item { display: block; padding: 0.6rem 0.8rem; color: rgba(255,255,255,0.6); text-decoration: none; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; border-left: 2px solid transparent; }
        .nav-item:hover { background: rgba(191, 161, 0, 0.05); color: var(--nexus-accent); border-left: 2px solid var(--nexus-accent); }
    </nav>
    </aside>

    <main class="main-content">
        <header>
            <div class="status-tag">${freq.toUpperCase()} Institutional Manuscript • ${dateLabel}</div>
            <h1>${title}</h1>
            <div class="excerpt">${excerpt}</div>
        </header>

        <section class="manuscript-body">
            ${finalBody}
        </section>

        <footer style="margin-top: 8rem; padding-top: 4rem; border-top: 1px solid var(--nexus-border); color: rgba(248, 250, 252, 0.4); font-size: 0.7rem; text-align: center;">
            © ${new Date().getFullYear()} BLOGSPRO TERMINAL • ALL RIGHTS RESERVED • INSTITUTIONAL USE ONLY
        </footer>
    </main>
    ${scripts || ''}
</body>
</html>`;
}

function getEmailTemplate({ title, excerpt, content, dateLabel, fileName, freq, priceInfo = { last: "N/A", high: "N/A", low: "N/A" } }) {
    const finalBody = parseMD(content);
    return `<!DOCTYPE html><html><body style="background: #050505; color: #D1D5DB; font-family: sans-serif; padding: 20px;">
        <h1 style="color: #F8FAFC;">${title}</h1>
        <div style="border-left: 4px solid #FFB800; padding-left: 15px; margin: 20px 0;">${excerpt}</div>
        <div>${finalBody}</div>
    </body></html>`;
}

export { getBaseTemplate, getEmailTemplate, parseMD };
