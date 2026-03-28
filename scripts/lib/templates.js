const path = require("path");

function parseMD(md) {
    if (!md) return "";
    return md
        .replace(/### (.*$)/gim, '<h3>$1</h3>')
        .replace(/## (.*$)/gim, '<h2>$1</h2>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/^\- (.*$)/gim, '<li>$1</li>')
        .replace(/\n\n/gim, '</p><p>')
        .replace(/<li>/g, '<ul><li>').replace(/<\/li>/g, '</li></ul>').replace(/<\/ul><ul>/g, '');
}

function getBaseTemplate({ title, excerpt, content, dateLabel, finalKit, type, freq, fileName, rel = "../../" }) {
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
        .content table { width: 100%; border-collapse: collapse; margin: 2rem 0; font-size: 0.95rem; background: rgba(255,255,255,0.02); border: 1px solid rgba(201,168,76,0.1); }
        .content th { background: rgba(201,168,76,0.1); color: var(--gold); text-align: left; padding: 0.8rem 1rem; font-weight: 700; text-transform: uppercase; font-size: 0.75rem; border-bottom: 2px solid var(--gold); }
        .content td { padding: 0.8rem 1rem; border-bottom: 1px solid rgba(201,168,76,0.05); }
        .audio-summary { margin: 3rem 0; padding: 2rem; background: rgba(201,168,76,0.05); border: 1px solid var(--gold); border-radius: 12px; }
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
        <header>
            <span class="meta">${type.toUpperCase()} • ${dateLabel}</span>
            <h1>${title}</h1>
            <p style="font-size:1.2rem;color:var(--muted);font-style:italic;">${excerpt}</p>
        </header>
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
