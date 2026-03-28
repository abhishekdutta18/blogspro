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

function getBaseTemplate({ title, excerpt, content, dateLabel, finalKit, type, freq, fileName, rel = "../../", pairId = "179", sentimentScore = 50, priceInfo = { last: "0", high: "0", low: "0" } }) {
    const isHourly = freq === 'hourly';
    const isDaily = freq === 'daily';
    const isWeekly = freq === 'weekly';
    const isMonthly = freq === 'monthly';

    const sentimentLabel = sentimentScore > 75 ? "EXTREME BULLISH" : (sentimentScore < 25 ? "EXTREME BEARISH" : (sentimentScore > 55 ? "BULLISH" : (sentimentScore < 45 ? "BEARISH" : "NEUTRAL")));
    const sentimentColor = sentimentScore > 75 ? "#22c55e" : (sentimentScore < 25 ? "#ef4444" : "#eab308");
    const gaugeRotation = (sentimentScore / 100) * 180 - 90; 
    
    const lastNum = parseFloat(priceInfo.last.replace(/,/g,'')) || 100;
    const lowNum = parseFloat(priceInfo.low.replace(/,/g,'')) || lastNum * 0.95;
    const highNum = parseFloat(priceInfo.high.replace(/,/g,'')) || lastNum * 1.05;
    const range = highNum - lowNum || 1;
    const lastPos = ((lastNum - lowNum) / range) * 100;
    const sparkPath = `M 0,50 Q 25,${100 - lastPos * 0.5} 50,50 T 100,${100 - lastPos}`;
    const canonical = `https://blogspro.in/${type === 'post' ? 'posts/' : (type + 's/' + freq + '/')}${fileName || (type + '-' + new Date().toISOString().split('T')[0] + '.html')}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — BlogsPro ${freq.toUpperCase()}</title>
    <meta name="description" content="${excerpt}">
    <link rel="canonical" href="${canonical}">
    <style>
        :root { 
            --navy:#080d1a; --gold:#c9a84c; --gold2:#f0cc6e; --cream:#f5f0e8; --muted:#8896b3; 
            --serif:'Cormorant Garamond',serif; --sans:'DM Sans',sans-serif; --mono:'Space Mono', monospace;
            --accent: ${sentimentColor};
        }
        body { background: var(--navy); color: var(--cream); font-family: var(--sans); margin: 0; line-height: 1.6; transition: 0.3s ease; }
        
        /* Frequency Variants */
        .variant-hourly { --bg-paper: rgba(255,255,255,0.03); --font-body: var(--mono); font-size: 0.9rem; }
        .variant-daily { --bg-paper: linear-gradient(180deg, rgba(201,168,76,0.05) 0%, transparent 100%); }
        .variant-weekly { --bg-paper: transparent; max-width: 900px !important; }
        .variant-monthly { --bg-paper: rgba(201,168,76,0.08); background: #0c1221; }

        nav { position: sticky; top: 0; background: rgba(8,13,26,0.95); backdrop-filter: blur(10px); border-bottom: 1px solid rgba(201,168,76,0.2); padding: 0 2rem; height: 64px; display: flex; align-items: center; justify-content: space-between; z-index: 100; }
        .brand { font-family: var(--serif); font-size: 1.5rem; font-weight: 700; color: var(--gold); text-decoration: none; }
        .article-container { max-width: 800px; margin: 0 auto; padding: 4rem 2rem; background: var(--bg-paper); border-radius: 0 0 24px 24px; }
        
        .meta { color: var(--gold); font-size: 0.75rem; font-weight: 700; text-transform: uppercase; margin-bottom: 1rem; display: block; letter-spacing: 0.2em; }
        h1 { font-family: var(--serif); font-size: clamp(2.2rem, 6vw, 4rem); line-height: 1.1; margin-bottom: 1.5rem; letter-spacing: -0.02em; }
        
        .variant-hourly h1 { font-family: var(--mono); text-transform: uppercase; font-size: 2.2rem; }
        .variant-monthly h1 { font-family: var(--serif); border-bottom: 2px solid var(--gold); padding-bottom: 1.5rem; }

        .content h2 { font-family: var(--serif); color: var(--gold); font-size: 2.2rem; margin: 4rem 0 1.5rem; position: relative; }
        .content h2::after { content: ""; position: absolute; left: 0; bottom: -8px; width: 60px; height: 4px; background: var(--accent); }
        .content p { font-size: 1.15rem; opacity: 0.9; margin-bottom: 2rem; }
        
        /* Table Styles */
        .table-container { overflow-x: auto; margin: 3rem 0; border-radius: 12px; border: 1px solid rgba(201,168,76,0.2); box-shadow: 0 10px 30px rgba(0,0,0,0.5); background: rgba(0,0,0,0.2); }
        table { width: 100%; border-collapse: collapse; }
        th { background: rgba(201,168,76,0.1); color: var(--gold); padding: 1.2rem; text-align: left; font-size: 0.75rem; font-weight: 900; letter-spacing: 0.1em; text-transform: uppercase; }
        td { padding: 1.2rem; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 1rem; }
        
        /* Terminal Components */
        .command-center { position: relative; background: #000; border: 1px solid rgba(201,168,76,0.3); border-radius: 16px; padding: 2.5rem; margin: 3rem 0; box-shadow: 0 0 50px rgba(0,0,0,0.8); }
        .live-tag { display: inline-block; padding: 4px 12px; background: #ef4444; color: white; border-radius: 4px; font-size: 0.65rem; font-weight: 900; margin-bottom: 1.5rem; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }

        .dashboard-grid { display: grid; grid-template-columns: 180px 1fr; gap: 3rem; align-items: center; }
        .gauge-wrap { position: relative; width: 160px; height: 85px; }
        .gauge-needle { position: absolute; bottom: 0; left: 50%; width: 5px; height: 75px; background: #fff; border-radius: 5px; transform-origin: bottom center; transform: translateX(-50%) rotate(${gaugeRotation}deg); transition: 1.5s cubic-bezier(0.19, 1, 0.22, 1); }
        
        .chart-box { height: ${isHourly ? '320px' : '520px'}; border-radius: 12px; overflow: hidden; margin-top: 2rem; border: 1px solid rgba(255,255,255,0.1); }
        
        .social-bar { margin-top: 5rem; padding-top: 2rem; border-top: 1px solid rgba(201,168,76,0.2); display: flex; justify-content: space-between; align-items: center; }
        .cta-btn { background: var(--gold); color: var(--navy); padding: 1rem 2rem; border-radius: 8px; font-weight: 800; text-decoration: none; display: inline-block; transition: 0.3s; }
        .cta-btn:hover { background: var(--gold2); transform: translateY(-2px); box-shadow: 0 5px 15px rgba(201,168,76,0.4); }

        @media (max-width: 768px) {
            .dashboard-grid { grid-template-columns: 1fr; text-align: center; }
            .gauge-wrap { margin: 0 auto; }
            .article-container { padding: 2rem 1rem; }
        }
    </style>
</head>
<body class="variant-${freq}">
    <nav>
        <a href="${rel}index.html" class="brand">BlogsPro</a>
        <div style="display:flex;gap:1.5rem;align-items:center;">
            <span style="font-size:0.7rem;color:var(--gold);font-weight:900;">${freq.toUpperCase()} TERMINAL</span>
            <a href="${rel}index.html" style="color:var(--muted);text-decoration:none;font-size:0.8rem;">← Home</a>
        </div>
    </nav>

    <article class="article-container">
        <header>
            <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                <span class="meta">${isHourly ? '⚡ Intraday' : (isMonthly ? '🏛️ Institutional' : '📉 Market')} • ${dateLabel}</span>
                ${isHourly ? '<div class="live-tag">LIVE TERMINAL</div>' : ''}
            </div>
            <h1>${title}</h1>
            <p style="font-size:1.4rem; color:var(--muted); font-style: italic; line-height: 1.4; border-left: 4px solid var(--accent); padding-left: 1.5rem; margin: 2rem 0;">
                ${excerpt}
            </p>
        </header>

        <section class="command-center">
            <div class="dashboard-grid">
                <div>
                    <div style="text-align:center; margin-bottom: 1rem; font-size: 0.7rem; font-weight: 900; color: var(--muted); letter-spacing: 0.2em;">SENTIMENT PULSE</div>
                    <div class="gauge-wrap">
                        <svg viewBox="0 0 200 100" style="width:100%; height:100%;">
                            <path d="M 20 90 A 80 80 0 0 1 180 90" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="20" />
                            <path d="M 20 90 A 80 80 0 0 1 180 90" fill="none" stroke="url(#sentiment-grad)" stroke-width="20" stroke-dasharray="251" stroke-dashoffset="${251 - (sentimentScore/100)*251}" />
                            <defs>
                                <linearGradient id="sentiment-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" style="stop-color:#ef4444" />
                                    <stop offset="50%" style="stop-color:#eab308" />
                                    <stop offset="100%" style="stop-color:#22c55e" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div class="gauge-needle"></div>
                    </div>
                    <div style="text-align: center; margin-top: 1rem; font-size: 0.8rem; font-weight: 900; color: var(--accent);">${sentimentLabel}</div>
                </div>
                <div style="border-left: 1px solid rgba(255,255,255,0.1); padding-left: 2rem;">
                    <div style="font-size: 0.7rem; color: var(--gold); font-weight: 900; margin-bottom: 0.5rem; letter-spacing: 0.1em;">TERMINAL ALPHA</div>
                    <div style="font-size: 1rem; color: var(--cream); margin-bottom: 1.5rem;">${isHourly ? 'Intraday technicals synthesized from NSE/BSE and Crypto liquidity streams.' : 'Institutional outlook mapping regulatory shifts against global macro drifts.'}</div>
                    
                    <svg width="100%" height="40" viewBox="0 0 100 40" preserveAspectRatio="none">
                        <path d="${sparkPath}" fill="none" stroke="var(--accent)" stroke-width="2" />
                    </svg>
                    <div style="display:flex; justify-content: space-between; font-size: 0.6rem; color: var(--muted); margin-top: 5px;">
                        <span>L: ${priceInfo.low}</span>
                        <span style="color:var(--accent)">LAST: ${priceInfo.last}</span>
                        <span>H: ${priceInfo.high}</span>
                    </div>
                </div>
            </div>

            <div class="chart-box">
                <iframe 
                    src="https://www.investing.com/common/technical_chart.php?pair_id=${pairId}&height=${isHourly ? '320' : '520'}&width=800&interval=${isHourly ? '60' : 'daily'}&style=candle" 
                    width="100%" height="100%" frameborder="0" allowtransparency="true" scrolling="no">
                </iframe>
            </div>
        </section>

        <div class="content">${parseMD(content)}</div>

        ${finalKit?.pollQuestion ? `
        <section style="margin: 5rem 0; padding: 3rem; background: rgba(201,168,76,0.05); border: 1px solid var(--gold); border-radius: 16px;">
            <h3 style="margin-top:0; color:var(--gold); font-family:var(--serif); font-size: 1.8rem;">🗳️ Strategic Poll</h3>
            <p style="font-size:1.1rem; color:var(--muted); margin-bottom: 2rem;">${finalKit.pollQuestion}</p>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
                ${(finalKit.pollOptions || []).map(opt => `<button class="cta-btn" style="background:rgba(255,255,255,0.05); color:var(--gold); border: 1px solid var(--gold);" onclick="this.style.background='var(--gold)'; this.style.color='var(--navy)'; alert('Vote registered!')">${opt}</button>`).join('')}
            </div>
        </section>` : ''}

        <footer class="social-bar">
            <div>
                <a href="#" class="cta-btn" onclick="navigator.share({title: '${title}', url: window.location.href})">📤 Share Report</a>
            </div>
            <div style="font-size: 0.7rem; color: var(--muted); letter-spacing: 0.1em;">© ${new Date().getFullYear()} BLOGSPRO INTELLIGENCE UNIT</div>
        </footer>
    </article>
</body>
</html>`;
}

module.exports = { getBaseTemplate };
