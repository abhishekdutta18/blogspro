// js/health.js
import { db } from "./config.js";
import { UPSTOX_WORKER_URL } from "./constants.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export function initHealthMonitor() {
    const statusBadge = document.getElementById('pipelineStatus');
    if (!statusBadge) return;

    console.log("📡 Initializing Pipeline Health Monitor...");

    // Real-time listener for health status
    onSnapshot(doc(db, "site", "health"), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        const status = data.status || 'UNKNOWN';
        const lastRun = data.lastRun ? new Date(data.lastRun.toDate()).toLocaleString() : 'Never';

        statusBadge.innerHTML = `
            <div style="width:6px;height:6px;background:${status === 'SUCCESS' ? 'var(--emerald)' : 'var(--red)'};border-radius:50%;box-shadow:0 0 5px ${status === 'SUCCESS' ? 'var(--emerald)' : 'var(--red)'}"></div>
            Pipeline ${status}: ${lastRun}
        `;
        
        statusBadge.style.color = status === 'SUCCESS' ? 'var(--emerald)' : '#fca5a5';
        statusBadge.style.background = status === 'SUCCESS' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)';
        statusBadge.style.borderColor = status === 'SUCCESS' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)';
    });

    // ── Financial Health Monitor ──
    initFinancialHealth();
}

async function initFinancialHealth() {
    const card = document.getElementById('financialHealthStats');
    if (!card) return;

    const refresh = async () => {
        try {
            const start = Date.now();
            const res = await fetch(`${UPSTOX_WORKER_URL}/quotes`);
            const latency = Date.now() - start;
            const data = await res.json();
            
            const isOk = data.status === 'success';
            card.innerHTML = `
                <div class="stat-mini">
                    <span>Upstox API</span>
                    <span style="color:${isOk ? 'var(--emerald)' : 'var(--red)'}">${isOk ? 'CONNECTED' : 'EXPIRED'}</span>
                </div>
                <div class="stat-mini">
                    <span>Latency</span>
                    <span>${latency}ms</span>
                </div>
                <div class="stat-mini">
                    <span>Data Freshness</span>
                    <span style="color:var(--gold)">LIVE</span>
                </div>
            `;
        } catch (e) {
            card.innerHTML = '<div style="color:var(--red);font-size:0.7rem">Financial Proxy Offline</div>';
        }
    };

    refresh();
    setInterval(refresh, 60000); // Check every minute in admin
}
