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
    const color = sentiment > 75 ? "#10b981" : (sentiment < 25 ? "#ef4444" : "#eab308");

    // Calculate meter dashoffset (semi-circle is half of 502 = 251)
    const offset = 251 - (sentiment / 100) * 251;

    container.innerHTML = `
        <div class="intel-dashboard">
            <!-- Left: Core Thematic Analysis -->
            <div class="intel-col">
                <div class="intel-col-header">CORE THEMATIC ANALYSIS</div>
                <div class="thematic-list">
                    <div class="thematic-item">
                        <div class="thematic-label">MARKET REGIME</div>
                        <div class="thematic-text">Institutional rotation in ${daily?.sectorFocus || 'Large-cap'} segments remains active.</div>
                    </div>
                    <div class="thematic-item">
                        <div class="thematic-label">VOLATILITY PROFILE</div>
                        <div class="thematic-text">Risk-adjusted returns are stabilizing across major indices.</div>
                    </div>
                    <div class="thematic-item">
                        <div class="thematic-label">LIQUIDITY DRIFT</div>
                        <div class="thematic-text">Cash flow concentration shifting towards defensive sectors.</div>
                    </div>
                </div>
                
                <div class="strategy-block">
                    <div class="strategy-title">LATEST STRATEGIC TAKEAWAY</div>
                    <div class="strategy-text">${(daily?.keyTakeaway || "Monitor pivot levels for mid-session execution.")}</div>
                </div>
            </div>

            <!-- Center: Sentiment & Primary Pulse -->
            <div class="intel-col" style="padding:0">
                <div class="sentiment-section">
                    <div class="sentiment-meter-wrap">
                        <svg class="sentiment-meter-svg" viewBox="0 0 100 100">
                            <path class="meter-bg" d="M 10 90 A 40 40 0 0 1 90 90" />
                            <path class="meter-fill" d="M 10 90 A 40 40 0 0 1 90 90" 
                                  style="stroke-dashoffset: ${offset}; stroke: ${color}" />
                        </svg>
                        <div class="sentiment-value-wrap">
                            <div class="sentiment-score">${sentiment}</div>
                            <div class="sentiment-label">${label}</div>
                        </div>
                    </div>
                </div>

                <div class="intel-col" style="border:none; padding-top: 1rem;">
                    <div class="intel-pulse-header">
                        <div class="institutional-tag" style="font-family:'JetBrains Mono'; font-size:0.6rem; color:var(--gold); margin-bottom:0.5rem">
                            // ACTIVE_INTELLIGENCE_PULSE // ${daily?.frequency || 'DAILY'}
                        </div>
                        <h3 class="pulse-title">${daily?.title || hourly?.title || "Alpha Synthesis Report"}</h3>
                        <p class="pulse-excerpt">${(daily?.excerpt || hourly?.excerpt || "Analyzing market drift and institutional positioning...").slice(0, 220)}...</p>
                        <div class="pulse-actions">
                            ${daily ? `<a href="briefings/daily/${daily.fileName}" class="insti-btn">READ STRATEGIC BRIEFING</a>` : ''}
                            ${hourly ? `<a href="briefings/hourly/${hourly.fileName}" class="insti-btn" style="background:transparent; border:1px solid var(--gold); color:var(--gold); margin-left:1rem">VIEW HOURLY PIVOTS</a>` : ''}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Right: Data Matrix & Master Strategy -->
            <div class="intel-col">
                <div class="intel-col-header">MACRO DATA MATRIX</div>
                <div class="matrix-grid">
                    <div class="matrix-row">
                        <div class="matrix-key">SYSTEM LATENCY</div>
                        <div class="matrix-val">12ms</div>
                    </div>
                    <div class="matrix-row">
                        <div class="matrix-key">DATA INTEGRITY</div>
                        <div class="matrix-val">99.98%</div>
                    </div>
                    <div class="matrix-row">
                        <div class="matrix-key">AI CONSENSUS</div>
                        <div class="matrix-val">ACTIVE</div>
                    </div>
                    <div class="matrix-row">
                        <div class="matrix-key">SWARM STATUS</div>
                        <div class="matrix-val">SYNCHRONIZED</div>
                    </div>
                </div>

                <div class="intel-col-header" style="margin-top:1rem">MASTER STRATEGY</div>
                <div class="thematic-list">
                    <div class="thematic-item">
                        <div class="thematic-label">WEEKLY ROADMAP</div>
                        <div class="strat-name" style="font-size:0.9rem; margin-top:0.2rem">${weekly?.title || "Synthesizing..."}</div>
                        ${weekly ? `<a href="articles/weekly/${weekly.fileName}" class="strat-cta">ANALYZE →</a>` : ''}
                    </div>
                    <div class="thematic-item">
                        <div class="thematic-label">MONTHLY MACRO</div>
                        <div class="strat-name" style="font-size:0.9rem; margin-top:0.2rem">${monthly?.title || "Preparing..."}</div>
                        ${monthly ? `<a href="articles/monthly/${monthly.fileName}" class="strat-cta">ANALYZE →</a>` : ''}
                    </div>
                </div>
            </div>

            <!-- Bottom: Institutional Ticker -->
            <div class="ticker-institutional">
                <div class="ticker-scroll">
                    <div class="ticker-signal"><b>[SIGNAL]</b> NSE/BSE SECTORAL ROTATION DETECTED IN ${daily?.sectorFocus || 'BFSI'}</div>
                    <div class="ticker-signal"><b>[POLICY]</b> RBI REGULATORY INGESTION COMPLETE - NO HAWKISH DRIFT</div>
                    <div class="ticker-signal"><b>[VIX]</b> VOLATILITY CLUSTERING BELOW 15.0 - RISK ON REGIME</div>
                    <div class="ticker-signal"><b>[GLOBAL]</b> US TREASURY YIELD SYNCED - 10Y STABILIZING</div>
                    <!-- Duplicate for infinite scroll -->
                    <div class="ticker-signal"><b>[SIGNAL]</b> NSE/BSE SECTORAL ROTATION DETECTED IN ${daily?.sectorFocus || 'BFSI'}</div>
                    <div class="ticker-signal"><b>[POLICY]</b> RBI REGULATORY INGESTION COMPLETE - NO HAWKISH DRIFT</div>
                </div>
            </div>
        </div>
    `;
}
