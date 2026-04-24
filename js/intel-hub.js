// ═══════════════════════════════════════════════
// intel-hub.js — Strategic Intelligence Hub (Proxy-based)
// Fetches and renders AI-generated market pulses & articles via Proxy
// ═══════════════════════════════════════════════
import { api } from './services/api.js';
import { initNewsWire } from './news-wire.js';

/**
 * BlogsPro Strategic Intelligence Hub
 * Fetches and renders the latest AI-generated market pulses & articles on the homepage.
 */
export async function initIntelHub() {
    const hubContainer = document.getElementById('intel-hub-root');
    
    // Initialize News Wire (Institutional Pulse Hub)
    initNewsWire();
    window.refreshNewsWire = initNewsWire;

    if (!hubContainer) return;

    try {
        // 1. Fetch Latest Briefing & Article via Proxy
        const [pulseDocs, articleDocs] = await Promise.all([
            api.data.get('pulse_briefings', null, { orderBy: 'date desc', limit: 10 }),
            api.data.get('articles', null, { orderBy: 'date desc', limit: 10 })
        ]);

        const latestDaily = (pulseDocs || []).find(p => p.frequency === 'daily') || pulseDocs?.[0];
        const latestHourly = (pulseDocs || []).find(p => p.frequency === 'hourly');
        const latestWeekly = (articleDocs || []).find(a => a.frequency === 'weekly') || articleDocs?.[0];
        const latestMonthly = (articleDocs || []).find(a => a.frequency === 'monthly');

        if (!pulseDocs?.length && !articleDocs?.length) {
            hubContainer.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Waiting for first AI Intelligence pulse...</div>';
            return;
        }

        renderHub(hubContainer, { daily: latestDaily, hourly: latestHourly, weekly: latestWeekly, monthly: latestMonthly });
        
        // 2. Update Global Terminal Stats
        updateHeroStats({
            posts: (pulseDocs?.length || 0) + (articleDocs?.length || 0),
            experts: 13,
            version: "V6.5-HARDENED"
        });
        
    } catch (err) {
        console.error('[IntelHub] Failed to load briefings:', err);
        hubContainer.innerHTML = '<div style="padding:1rem;color:#fca5a5;font-size:0.8rem">⚠️ Briefing Terminal Offline (Sync Error)</div>';
    }
}

function updateHeroStats({ posts, experts, version }) {
    const elPosts = document.getElementById('stat-posts');
    const elWords = document.getElementById('stat-words');
    const elPrec = document.getElementById('stat-prec');

    if (elPosts) elPosts.innerText = experts; 
    if (elWords) elWords.innerText = "100k+";
    if (elPrec) elPrec.innerText = version;
}

function renderHub(container, { daily, hourly, weekly, monthly }) {
    const sentiment = daily?.sentimentScore || 50;
    const label = sentiment > 75 ? "EXTREME BULLISH" : (sentiment < 25 ? "EXTREME BEARISH" : (sentiment > 55 ? "BULLISH" : (sentiment < 45 ? "BEARISH" : "NEUTRAL")));
    const color = sentiment > 75 ? "#22c55e" : (sentiment < 25 ? "#ef4444" : "#eab308");

    container.innerHTML = `
        <div class="intel-card">
            <div class="intel-header">
                <div class="live-pulse"></div>
                <span class="intel-tag">STRATEGIC INTELLIGENCE TERMINAL</span>
                <span class="intel-date">${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            
            <div class="intel-tabs">
                <button class="intel-tab active" data-tab="active-pulse">MARKET PULSE</button>
                <button class="intel-tab" data-tab="master-strategy">MASTER STRATEGY</button>
            </div>

            <div id="active-pulse" class="hub-view active">
                <div class="intel-grid">
                    <div class="intel-sentiment">
                        <div class="sentiment-gauge-mini">
                            <svg viewBox="0 0 100 50">
                                <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="8" />
                                <path d="M 10 45 A 40 40 0 0 1 90 45" fill="none" stroke="${color}" stroke-width="8" stroke-dasharray="126" stroke-dashoffset="${126 - (sentiment/100)*126}" />
                            </svg>
                            <div class="sentiment-value" style="color:${color}">${sentiment}</div>
                        </div>
                        <div class="sentiment-label">${label}</div>
                    </div>

                    <div class="intel-content">
                        <h3 class="intel-title">${daily?.title || hourly?.title || "Daily Alpha Report"}</h3>
                        <p class="intel-excerpt">${(daily?.excerpt || hourly?.excerpt || "Analyzing sessions...").slice(0, 120)}...</p>
                        <div class="intel-actions">
                            ${daily ? `<a href="briefings/daily/${daily.fileName}" class="intel-btn">READ DAILY REPORT</a>` : ''}
                            ${hourly ? `<a href="briefings/hourly/${hourly.fileName}" class="intel-btn secondary">VIEW HOURLY PIVOTS</a>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <div id="master-strategy" class="hub-view">
                <div class="strategy-list">
                    <div class="strategy-item">
                        <div class="strat-label">MONTHLY OUTLOOK</div>
                        <h4 class="strat-title">${monthly?.title || "Preparing Next Roadmap..."}</h4>
                        ${monthly ? `<a href="articles/monthly/${monthly.fileName}" class="strat-link">VIEW MACRO DIRECTION →</a>` : ''}
                    </div>
                    <div class="strategy-item">
                        <div class="strat-label">WEEKLY ANALYSIS</div>
                        <h4 class="strat-title">${weekly?.title || "Synthesizing Sectoral Rotation..."}</h4>
                        ${weekly ? `<a href="articles/weekly/${weekly.fileName}" class="strat-link">VIEW WEEKLY ANALYSIS →</a>` : ''}
                    </div>
                </div>
            </div>

            <div class="intel-footer">
                <div class="ticker-wrap">
                    <div class="ticker">
                        <span>NSE/BSE SECTORAL ROTATION ACTIVE</span>
                        <span>•</span>
                        <span>RBI REGULATORY INGESTION COMPLETE</span>
                        <span>•</span>
                        <span>VIX VOLATILITY MONITORING LIVE</span>
                        <span>•</span>
                        <span>GLOBAL MACRO DRIFT SYNCED</span>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Tab Switching Logic
    container.querySelectorAll('.intel-tab').forEach(btn => {
        btn.onclick = () => {
            container.querySelectorAll('.intel-tab').forEach(b => b.classList.remove('active'));
            container.querySelectorAll('.hub-view').forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            container.querySelector(`#${btn.dataset.tab}`).classList.add('active');
        };
    });
}
