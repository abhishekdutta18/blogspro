const path = require("path");

function parseMD(md) {
    if (!md) return "";
    let html = md
        .replace(/### (.*$)/gim, '<h3>$1</h3>')
        .replace(/## (.*$)/gim, '<h2>$1</h2>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/\n\n/gim, '</p><p>')
        .replace(/<li>/g, '<ul><li>').replace(/<\/li>/g, '</li></ul>').replace(/<\/ul><ul>/g, '');

    // Advanced Table Parsing (Markdown -> HTML) with Trend Icons
    const tableRegex = /\|(.+)\|\n\|([\s\-\|]+)\|\n((\|.+\|\n)+)/g;
    html = html.replace(tableRegex, (match, header, separator, body) => {
        const headers = header.split('|').map(h => h.trim()).filter(h => h).map(h => `<th>${h}</th>`).join('');
        const rows = body.trim().split('\n').map(row => {
            const cols = row.split('|').map(c => c.trim()).filter(c => c).map(c => {
                let cell = c;
                if (c.includes('+') || c.includes('▲')) cell = `<span style="color:#22c55e">▲ ${c.replace(/[\+\^▲]/g,'')}</span>`;
                else if (c.includes('-') || c.includes('▼')) cell = `<span style="color:#ef4444">▼ ${c.replace(/[\-\▼]/g,'')}</span>`;
                return `<td style="font-family: monospace;">${cell}</td>`;
            }).join('');
            return `<tr>${cols}</tr>`;
        }).join('');
        return `<div class="table-container"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`;
    });
    return html;
}

function getBaseTemplate({ title, excerpt, content, dateLabel, finalKit, type, freq, fileName, rel = "../../", symbol = "NSE:NIFTY", sentimentScore = 50 }) {
    const sentimentLabel = sentimentScore > 70 ? "EXTREME BULLISH" : (sentimentScore < 30 ? "EXTREME BEARISH" : (sentimentScore > 55 ? "BULLISH" : (sentimentScore < 45 ? "BEARISH" : "NEUTRAL")));
    const sentimentColor = sentimentScore > 70 ? "#22c55e" : (sentimentScore < 30 ? "#ef4444" : "#eab308");
    const gaugeRotation = (sentimentScore / 100) * 180 - 90; // Translate 0-100 to -90deg to 90deg
    const canonical = `https://blogspro.in/${type === 'post' ? 'posts/' : (type + 's/' + freq + '/')}${fileName || (type + '-' + new Date().toISOString().split('T')[0] + '.html')}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — BlogsPro ${type.toUpperCase()}</title>
    <meta name="description" content="${excerpt}">
    <link rel="canonical" href="${canonical}">
    
    <!-- OpenGraph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${canonical}">
    <meta property="og:title" content="${title} — BlogsPro">
    <meta property="og:description" content="${excerpt}">
    <meta property="og:image" content="https://blogspro.in/assets/og-preview.png">

    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${canonical}">
    <meta name="twitter:title" content="${title} — BlogsPro">
    <meta name="twitter:description" content="${excerpt}">
    <meta name="twitter:image" content="https://blogspro.in/assets/og-preview.png">

    <!-- JSON-LD Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "BlogPosting",
      "headline": "${title.replace(/"/g, '&quot;')}",
      "description": "${excerpt.replace(/"/g, '&quot;')}",
      "author": {"@type": "Organization", "name": "BlogsPro Intelligence"},
      "datePublished": "${new Date().toISOString()}",
      "image": "https://blogspro.in/assets/og-preview.png",
      "publisher": {
        "@type": "Organization",
        "name": "BlogsPro",
        "logo": { "@type": "ImageObject", "url": "https://blogspro.in/assets/logo.png" }
      }
    }
    </script>
    <style>
        :root { --navy:#080d1a; --gold:#c9a84c; --gold2:#f0cc6e; --cream:#f5f0e8; --muted:#8896b3; --serif:'Cormorant Garamond',serif; --sans:'DM Sans',sans-serif; }
        body { background: var(--navy); color: var(--cream); font-family: var(--sans); margin: 0; line-height: 1.6; }
        nav { position: sticky; top: 0; background: rgba(8,13,26,0.95); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(201,168,76,0.2); padding: 0 2rem; height: 64px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
        .brand { font-family: var(--serif); font-size: 1.5rem; font-weight: 700; color: var(--gold); text-decoration: none; }
        .article-container { max-width: 800px; margin: 0 auto; padding: 4rem 2rem; }
        .meta { color: var(--gold); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 1rem; display: block; letter-spacing: 0.1em; }
        h1 { font-family: var(--serif); font-size: clamp(2.2rem, 5vw, 3.8rem); line-height: 1.1; margin-bottom: 1.5rem; }
        .content h2 { font-family: var(--serif); color: var(--gold); font-size: 2rem; margin: 3.5rem 0 1.2rem; border-left: 4px solid var(--gold); padding-left: 1rem; }
        .content h3 { font-family: var(--serif); color: var(--gold2); font-size: 1.5rem; margin: 2.5rem 0 1rem; }
        .content table { width: 100%; border-collapse: collapse; margin: 2rem 0; font-size: 0.95rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(201,168,76,0.1); border-radius: 8px; overflow: hidden; }
        .content th { background: rgba(201,168,76,0.1); color: var(--gold); text-align: left; padding: 1rem; font-weight: 700; text-transform: uppercase; font-size: 0.75rem; border-bottom: 2px solid var(--gold); }
        .content td { padding: 1rem; border-bottom: 1px solid rgba(201,168,76,0.05); }
        .content tr:nth-child(even) { background: rgba(255,255,255,0.01); }
        .content tr:hover { background: rgba(201,168,76,0.05); }
        .table-container { overflow-x: auto; margin: 2rem 0; border-radius: 12px; border: 1px solid rgba(201,168,76,0.15); box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
        
        /* Premium Dashboard Components */
        .command-center { position: relative; background: linear-gradient(145deg, rgba(201,168,76,0.08), rgba(8,13,26,0.5)); border: 1px solid rgba(201,168,76,0.2); border-radius: 16px; padding: 2.5rem; margin: 2rem 0 4rem; backdrop-filter: blur(20px); box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
        .live-blinker { display: inline-flex; align-items: center; gap: 0.5rem; font-size: 0.7rem; font-weight: 900; color: #ef4444; letter-spacing: 0.2em; text-transform: uppercase; margin-bottom: 2rem; }
        .live-blinker::before { content: ""; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; animation: blink 1s infinite; box-shadow: 0 0 10px #ef4444; }
        @keyframes blink { 0% { opacity: 1; } 50% { opacity: 0.3; } 100% { opacity: 1; } }

        .gauge-wrap { position: relative; width: 140px; height: 75px; flex-shrink: 0; }
        .gauge-arc { width: 140px; height: 140px; border: 15px solid rgba(255,255,255,0.05); border-radius: 50%; border-bottom-color: transparent; border-left-color: transparent; transform: rotate(-45deg); position: absolute; }
        .gauge-color { width: 140px; height: 140px; border: 15px solid transparent; border-radius: 50%; border-top-color: ${sentimentColor}; border-right-color: ${sentimentColor}; transform: rotate(-45deg); position: absolute; filter: drop-shadow(0 0 5px ${sentimentColor}); }
        .gauge-needle { position: absolute; bottom: 0; left: 50%; width: 4px; height: 60px; background: var(--cream); border-radius: 4px; transform-origin: bottom center; transform: translateX(-50%) rotate(${gaugeRotation}deg); transition: 1s cubic-bezier(0.17, 0.67, 0.83, 0.67); }
        .gauge-center { position: absolute; bottom: -5px; left: 50%; width: 14px; height: 14px; background: var(--gold); border-radius: 50%; transform: translateX(-50%); border: 2px solid var(--navy); }
        .sentiment-label { text-align: center; margin-top: 0.5rem; font-size: 0.75rem; font-weight: 800; color: ${sentimentColor}; text-shadow: 0 0 10px rgba(0,0,0,0.5); }

        .dashboard-grid { display: grid; grid-template-columns: 140px 1fr; gap: 3rem; align-items: start; }
        .chart-container { width: 100%; height: 420px; border-radius: 12px; border: 1px solid rgba(201,168,76,0.1); overflow: hidden; position: relative; }
        .chart-container::after { content: "LIVE MARKET FEED"; position: absolute; bottom: 10px; right: 10px; font-size: 10px; color: var(--muted); font-weight: 900; opacity: 0.5; }

        .audio-summary { margin: 3rem 0; padding: 2.5rem; background: linear-gradient(to right, rgba(201,168,76,0.08), transparent); border: 1px solid var(--gold); border-radius: 16px; }
        .audio-player { width: 100%; margin-top: 1rem; filter: sepia(20%) saturate(70%) grayscale(1) contrast(99%) invert(12%); }
        .share-btn { background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.3); color: var(--gold); padding: 0.6rem 1.2rem; border-radius: 4px; font-size: 0.85rem; font-weight: 700; cursor: pointer; text-decoration: none; transition: 0.2s; }
        .share-btn:hover { background: var(--gold); color: var(--navy); }
        .footer-actions { margin-top: 4rem; padding-top: 2rem; border-top: 1px solid rgba(201,168,76,0.1); display: flex; gap: 1rem; }
    </style>
</head>
<body>
    <nav>
        <a href="${rel}index.html" class="brand">BlogsPro</a>
        <a href="${rel}index.html" style="color:var(--muted);text-decoration:none;font-size:0.8rem;">← Back</a>
    </nav>
    <article class="article-container">
        <div class="live-blinker">Live Terminal Status: Optimal</div>
        <header>
            <span class="meta">${type.toUpperCase()} • ${dateLabel}</span>
            <h1>${title}</h1>
            <p style="font-size:1.3rem;color:var(--muted);font-style:italic;line-height:1.4">${excerpt}</p>
        </header>

        <section class="command-center">
            <div class="dashboard-grid">
                <div>
                    <div class="gauge-wrap">
                        <div class="gauge-arc"></div>
                        <div class="gauge-color"></div>
                        <div class="gauge-needle"></div>
                        <div class="gauge-center"></div>
                    </div>
                    <div class="sentiment-label">${sentimentLabel}</div>
                </div>
                <div style="border-left: 1px solid rgba(201,168,76,0.15); padding-left: 2.5rem;">
                    <div style="font-size: 0.75rem; color: var(--gold); font-weight: 800; margin-bottom: 0.5rem;">STRATEGIC INTEL</div>
                    <div style="font-size: 0.95rem; color: var(--cream);">This report synthesizes real-time regulatory ingestion from SEBI/RBI with multi-asset global macro trends.</div>
                </div>
            </div>
            
            <div class="chart-container" style="margin-top: 3rem;">
                <div class="tradingview-widget-container" style="height:100%;width:100%">
                    <div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>
                    <script type="text/javascript" src="https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js" async>
                    {
                    "symbols": [ [ "${symbol}|1D" ] ],
                    "chartOnly": false,
                    "width": "100%",
                    "height": "100%",
                    "locale": "en",
                    "colorTheme": "dark",
                    "autosize": true,
                    "showVolume": false,
                    "showMA": false,
                    "hideDateRanges": false,
                    "hideMarketStatus": false,
                    "hideSymbolLogo": false,
                    "scalePosition": "right",
                    "scaleMode": "Normal",
                    "fontFamily": "-apple-system, BlinkMacSystemFont, Trebuchet MS, Roboto, Ubuntu, sans-serif",
                    "fontSize": "10",
                    "noOverlays": false,
                    "valuesTracking": "1",
                    "changeMode": "price-and-percent",
                    "chartType": "area",
                    "headerFontSize": "medium",
                    "lineWidth": 2,
                    "lineType": 0,
                    "dateRanges": [ "1d", "1m", "3m", "12m", "all" ]
                    }
                    </script>
                </div>
            </div>
        </section>
        ${finalKit?.audioScript ? `
        <div class="audio-summary">
            <h3 style="margin-top:0;color:var(--gold);">🔊 AI Audio Summary</h3>
            <p style="font-size:0.95rem;color:var(--muted);">${finalKit.audioScript}</p>
            <audio controls class="audio-player">
                <source src="${finalKit.audioUrl || '#'}" type="audio/mpeg">
                Your browser does not support the audio element.
            </audio>
        </div>` : ''}
        <div class="content"><p>${parseMD(content)}</p></div>
        <div class="footer-actions">
            <button class="share-btn" onclick="navigator.share({title: '${title}', url: window.location.href})">📤 Share Report</button>
            <a href="mailto:compliance@blogspro.in?subject=Report Abuse: ${fileName}" class="share-btn" style="opacity:0.6">🚩 Report Analysis</a>
        </div>
        ${finalKit?.pollQuestion ? `
        <section style="margin-top:4rem;padding:2rem;background:rgba(201,168,76,0.05);border-radius:8px;">
            <h3 style="color:var(--gold);margin-top:0;">🗳️ Poll: ${finalKit.pollQuestion}</h3>
            <div style="display:flex;gap:1rem;margin-top:1rem;">
                ${(finalKit.pollOptions || []).map(opt => `<button class="share-btn" onclick="alert('Thanks!')">${opt}</button>`).join('')}
            </div>
        </section>` : ''}
    </article>
</body>
</html>`;
}

module.exports = { getBaseTemplate };
