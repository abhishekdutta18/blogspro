const path = require("path");

function getBaseTemplate({ title, excerpt, content, dateLabel, finalKit, type, freq, fileName, rel = "../../" }) {
    const canonical = `https://blogspro.in/${type === 'post' ? 'posts/' : (type + 's/' + freq + '/')}${fileName || (type + '-' + new Date().toISOString().split('T')[0] + '.html')}`;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} — BlogsPro ${type.toUpperCase()}</title>
    <meta name="description" content="${excerpt}">
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
        .content table { width: 100%; border-collapse: collapse; margin: 2rem 0; font-size: 0.95rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(201,168,76,0.1); }
        .content th { background: rgba(201,168,76,0.1); color: var(--gold); text-align: left; padding: 0.8rem 1rem; font-weight: 700; text-transform: uppercase; font-size: 0.75rem; border-bottom: 2px solid var(--gold); }
        .content td { padding: 0.8rem 1rem; border-bottom: 1px solid rgba(201,168,76,0.05); }
        .audio-summary { margin: 2rem 0; padding: 1.5rem; background: rgba(201,168,76,0.08); border: 2px solid var(--gold); border-radius: 8px; }
        .share-btn { background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.3); color: var(--gold); padding: 0.6rem 1.2rem; border-radius: 4px; font-size: 0.85rem; font-weight: 700; cursor: pointer; text-decoration: none; }
    </style>
</head>
<body>
    <nav>
        <a href="${rel}index.html" class="brand">BlogsPro</a>
        <a href="${rel}index.html" style="color:var(--muted);text-decoration:none;font-size:0.8rem;">← Back</a>
    </nav>
    <article class="article-container">
        <header>
            <span class="meta">${type.toUpperCase()} • ${dateLabel}</span>
            <h1>${title}</h1>
            <p style="font-size:1.2rem;color:var(--muted);font-style:italic;">${excerpt}</p>
        </header>
        ${finalKit?.audioScript ? `
        <div class="audio-summary">
            <h3 style="margin-top:0;color:var(--gold);">🔊 AI Audio Summary</h3>
            <p>${finalKit.audioScript}</p>
        </div>` : ''}
        <div class="content">${content}</div>
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
