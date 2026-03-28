/**
 * BlogsPro Strategic Intelligence Hub
 * Fetches and renders the latest AI-generated market pulses & articles on the homepage.
 */
export async function initIntelHub() {
    const hubContainer = document.getElementById('intel-hub-root');
    if (!hubContainer) return;

    try {
        // 1. Fetch Latest Briefing & Article Indexes (Root-Relative Paths)
        const [dailyRes, hourlyRes, weeklyRes, monthlyRes] = await Promise.all([
            fetch('/briefings/daily/index.json').then(r => r.ok ? r.json() : []),
            fetch('/briefings/hourly/index.json').then(r => r.ok ? r.json() : []),
            fetch('/articles/weekly/index.json').then(r => r.ok ? r.json() : []),
            fetch('/articles/monthly/index.json').then(r => r.ok ? r.json() : [])
        ]);

        const latestDaily = dailyRes[0];
        const latestHourly = hourlyRes[0];
        const latestWeekly = weeklyRes[0];
        const latestMonthly = monthlyRes[0];

        if (!latestDaily && !latestHourly && !latestWeekly && !latestMonthly) {
            hubContainer.innerHTML = '<div style="padding:2rem;text-align:center;color:var(--muted)">Waiting for first AI Intelligence pulse...</div>';
            return;
        }

        renderHub(hubContainer, { daily: latestDaily, hourly: latestHourly, weekly: latestWeekly, monthly: latestMonthly });
        
        if (window.trackPulse) {
            window.trackPulse('hub', 'loaded', { 
                daily: latestDaily?.fileName, 
                monthly: latestMonthly?.fileName 
            });
        }
    } catch (err) {
        console.error('[IntelHub] Failed to load:', err);
        hubContainer.innerHTML = '<div style="padding:1rem;color:#fca5a5;font-size:0.8rem">⚠️ Briefing Terminal Offline</div>';
    }
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
        <style>
            .intel-card { background: #0c1221; border: 1px solid rgba(201,168,76,0.2); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; position: relative; overflow: hidden; }
            .intel-header { display: flex; align-items: center; gap: 0.8rem; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.8rem; }
            .live-pulse { width: 8px; height: 8px; background: #ef4444; border-radius: 50%; animation: pulse-red 2s infinite; }
            @keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); } 70% { box-shadow: 0 0 0 10px rgba(239,68,68,0); } 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); } }
            .intel-tag { font-size: 0.65rem; font-weight: 900; letter-spacing: 0.15em; color: var(--gold); }
            .intel-date { margin-left: auto; font-size: 0.6rem; color: var(--muted); font-family: monospace; }
            
            .intel-tabs { display: flex; gap: 1rem; margin-bottom: 1.5rem; }
            .intel-tab { background: none; border: none; color: var(--muted); font-size: 0.7rem; font-weight: 900; letter-spacing: 0.1em; cursor: pointer; padding-bottom: 0.3rem; border-bottom: 2px solid transparent; transition: 0.2s; }
            .intel-tab.active { color: var(--gold); border-bottom-color: var(--gold); }
            
            .hub-view { display: none; }
            .hub-view.active { display: block; }

            .intel-grid { display: grid; grid-template-columns: 120px 1fr; gap: 2rem; align-items: center; }
            .sentiment-gauge-mini { position: relative; width: 100px; }
            .sentiment-value { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); font-size: 1.2rem; font-weight: 900; font-family: serif; }
            .sentiment-label { text-align: center; font-size: 0.6rem; font-weight: 900; margin-top: 0.5rem; letter-spacing: 0.05em; }

            .intel-title { font-family: serif; font-size: 1.4rem; color: var(--cream); margin: 0 0 0.5rem; line-height: 1.2; }
            .intel-excerpt { font-size: 0.85rem; color: var(--muted); margin-bottom: 1.2rem; line-height: 1.5; }
            .intel-actions { display: flex; gap: 1rem; }
            .intel-btn { padding: 0.6rem 1.2rem; background: var(--gold); color: #080d1a; font-size: 0.7rem; font-weight: 900; text-decoration: none; border-radius: 4px; transition: 0.2s; }
            .intel-btn.secondary { background: rgba(255,255,255,0.05); color: var(--gold); border: 1px solid rgba(201,168,76,0.3); }
            .intel-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(201,168,76,0.3); }

            .strategy-list { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
            .strategy-item { background: rgba(255,255,255,0.02); padding: 1.2rem; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); }
            .strat-label { font-size: 0.55rem; font-weight: 900; color: var(--gold); margin-bottom: 0.5rem; letter-spacing: 0.1em; }
            .strat-title { color: var(--cream); font-size: 1rem; margin-bottom: 1rem; line-height: 1.3; font-family: serif; }
            .strat-link { font-size: 0.65rem; color: var(--gold); font-weight: 900; text-decoration: none; transition: 0.2s; }
            .strat-link:hover { padding-left: 0.5rem; }

            .intel-footer { margin-top: 1.5rem; background: rgba(0,0,0,0.3); padding: 0.5rem; border-radius: 4px; overflow: hidden; }
            .ticker-wrap { width: 100%; overflow: hidden; }
            .ticker { display: flex; gap: 2rem; white-space: nowrap; animation: ticker-scroll 30s linear infinite; font-size: 0.6rem; font-weight: 900; color: var(--muted); letter-spacing: 0.1em; }
            @keyframes ticker-scroll { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }

            @media (max-width: 600px) {
                .intel-grid { grid-template-columns: 1fr; text-align: center; }
                .sentiment-gauge-mini { margin: 0 auto; }
                .intel-actions { justify-content: center; }
                .strategy-list { grid-template-columns: 1fr; }
            }
        </style>
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
