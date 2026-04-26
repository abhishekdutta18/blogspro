/**
 * BlogsPro Institutional News Wire (V2.0)
 * Fetches and renders synchronized global news for the HIL station.
 */
import { workerUrl } from './worker-endpoints.js';

export async function initNewsWire() {
    const newsContainer = document.getElementById('institutionalNewsWire');
    if (!newsContainer) return;

    renderLoading(newsContainer);
    
    try {
        // Targeted Institutional Feeds (Financial, Macro, Tech)
        const feeds = [
            { id: 'BLOOMBERG', label: 'Bloomberg Financial', icon: '📈' },
            { id: 'REUTERS', label: 'Reuters Markets', icon: '🌐' },
            { id: 'NIFTY', label: 'NSE/BSE Pulse', icon: '🇮🇳' },
            { id: 'RBI', label: 'RBI Updates', icon: '🏛️' }
        ];

        // Fetch from Strategic Pulse Gateway
        const response = await fetch(workerUrl('news'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feeds: feeds.map(f => f.id) })
        });

        if (!response.ok) throw new Error('Institutional News Gateway Offline');
        
        const data = await response.json();
        renderNews(newsContainer, data.articles || []);
    } catch (err) {
        console.error('[NewsWire] Failed to sync:', err);
        newsContainer.innerHTML = `<div class="news-error">⚠️ News sync interrupted: ${err.message}</div>`;
    }
}

function renderLoading(container) {
    container.innerHTML = `
        <div class="news-skeleton">
            <div class="skeleton-line shimmer"></div>
            <div class="skeleton-line shorter shimmer"></div>
            <div class="skeleton-line shimmer"></div>
        </div>
    `;
}

function renderNews(container, articles) {
    if (!articles.length) {
        container.innerHTML = '<div class="news-empty">No critical global pulses detected.</div>';
        return;
    }

    container.innerHTML = articles.map(article => {
        const sourceClass = (article.source || '').toLowerCase().includes('bloomberg') ? 'bloomberg' : 
                           (article.source || '').toLowerCase().includes('reuters') ? 'reuters' : '';
        
        return `
            <div class="news-item ${sourceClass}">
                <div class="news-meta">
                    <span class="news-source">${article.source || 'GLOBAL'}</span>
                    <span class="news-time">${new Date(article.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <h4 class="news-title">${article.title}</h4>
                <a href="${article.url || '#'}" target="_blank" class="news-link">SOURCE ↗</a>
            </div>
        `;
    }).join('');
}
