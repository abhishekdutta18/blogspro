import { db, showToast } from './config.js';
import { state }     from './state.js';
import { collection, getDocs, deleteDoc, doc, query, orderBy, limit, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Loads all subscribers and updates the main list.
 */
export async function loadSubscribers() {
  const listEl = document.getElementById('subscribersList');
  if (!listEl) return;
  
  try {
    const snap = await getDocs(query(collection(db,'subscribers'), orderBy('createdAt','desc')));
    state.allSubs = snap.docs.map(d=>({id:d.id,...d.data()}));
    
    // Update Stats & Chart
    loadSubscriberAnalytics();
    renderGrowthChart(state.allSubs);
    
    renderSubs(state.allSubs);
  } catch(e) { 
    console.error('loadSubscribers:', e);
    listEl.innerHTML = `<div style="padding:2rem;text-align:center;color:#ef4444">Failed to load subscribers.</div>`; 
  }
}

/**
 * Renders the subscriber list into the admin UI.
 */
function renderSubs(subs) {
  const listEl = document.getElementById('subscribersList');
  if (!listEl) return;
  
  if (!subs.length) {
    listEl.innerHTML = `<div style="padding:3rem;text-align:center;color:var(--muted)">No subscribers found.</div>`;
    return;
  }

  const escHtml = (s) => (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  
  listEl.innerHTML = subs.map((s, i) => {
    const date = s.createdAt?.toDate?.()?.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})||'—';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem;border-bottom:1px solid var(--border);background:${i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'}">
        <div style="display:flex;align-items:center;gap:1rem">
          <div style="width:36px;height:36px;border-radius:50%;background:rgba(201,168,76,0.1);display:flex;align-items:center;justify-content:center;color:var(--gold);font-weight:700">${(s.email || '?')[0].toUpperCase()}</div>
          <div>
            <div style="font-weight:600;font-size:0.9rem">${escHtml(s.email)}</div>
            <div style="font-size:0.72rem;color:var(--muted)">Subscribed on ${date}</div>
          </div>
        </div>
        <button onclick="deleteSub('${s.id}')" style="background:transparent;border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:0.4rem 0.8rem;border-radius:3px;font-size:0.72rem;cursor:pointer;transition:all 0.2s" onmouseover="this.style.background='rgba(239,68,68,0.1)'" onmouseout="this.style.background='transparent'">Remove</button>
      </div>`;
  }).join('');
}

/**
 * Updates the statistic cards in the dashboard.
 */
window.loadSubscriberAnalytics = () => {
  const totalEl = document.getElementById('totalSubscribers');
  const activeEl = document.getElementById('activeSubscribers');
  const dateEl = document.getElementById('statsLastUpdated');
  
  if (totalEl) totalEl.textContent = state.allSubs.length;
  if (activeEl) activeEl.textContent = state.allSubs.length; // Future: track active/inactive state
  if (dateEl) dateEl.textContent = new Date().toLocaleTimeString();
  
  showToast('Statistics refreshed', 'success');
};

/**
 * Adds a subscriber manually from the admin panel.
 */
window.addSubscriberManual = async () => {
  const emailInput = document.getElementById('addSubEmail');
  const statusEl   = document.getElementById('addSubStatus');
  const email      = emailInput?.value.trim();

  if (!email || !email.includes('@')) {
    showToast('Please enter a valid email.', 'error');
    return;
  }

  if (statusEl) statusEl.textContent = '⏳ Adding…';
  
  try {
    // Check if already exists
    if (state.allSubs.some(s => s.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('Subscriber already exists.');
    }

    await addDoc(collection(db, 'subscribers'), {
      email,
      createdAt: serverTimestamp(),
      source: 'Admin Manual'
    });

    if (emailInput) emailInput.value = '';
    if (statusEl) statusEl.textContent = '✓ Added successfully!';
    showToast('Subscriber added!', 'success');
    
    loadSubscribers(); // Refresh list
  } catch (err) {
    if (statusEl) statusEl.textContent = '✕ ' + err.message;
    showToast(err.message, 'error');
  }
};

window.filterSubs = (q) => {
  const filtered = state.allSubs.filter(s => s.email?.toLowerCase().includes(q.toLowerCase()));
  renderSubs(filtered);
};

window.deleteSub = async (id) => {
  if (!confirm('Permanently remove this subscriber?')) return;
  try {
    await deleteDoc(doc(db,'subscribers',id));
    state.allSubs = state.allSubs.filter(s=>s.id!==id);
    renderSubs(state.allSubs);
    loadSubscriberAnalytics();
    showToast('Subscriber removed.','success');
  } catch(e) { showToast('Failed: '+e.message,'error'); }
};

window.exportSubscribers = () => {
  if (!state.allSubs.length) { showToast('No subscribers to export.','error'); return; }
  const csv  = 'Email,Date,Source\n' + state.allSubs.map(s => {
    const date = s.createdAt?.toDate?.()?.toISOString() || '';
    return `${s.email},${date},${s.source || 'Website'}`;
  }).join('\n');
  
  const blob = new Blob([csv],{type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `blogspro-subscribers-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV Exported!', 'success');
};

/**
 * Renders a line chart showing subscriber growth over time.
 */
function renderGrowthChart(subs) {
  const canvas = document.getElementById('subGrowthChart');
  if (!canvas || !window.Chart) return;

  // Process data for Chart.js
  const growthMap = {};
  subs.forEach(s => {
    const date = s.createdAt?.toDate?.()?.toISOString().split('T')[0] || new Date(s.timestamp).toISOString().split('T')[0];
    growthMap[date] = (growthMap[date] || 0) + 1;
  });

  const sortedDates = Object.keys(growthMap).sort();
  let cumulative = 0;
  const dataPoints = sortedDates.map(date => {
    cumulative += growthMap[date];
    return { x: date, y: cumulative };
  });

  // Destroy existing chart if it exists
  if (state.subChart) state.subChart.destroy();

  state.subChart = new Chart(canvas, {
    type: 'line',
    data: {
      datasets: [{
        label: 'Total Subscribers',
        data: dataPoints,
        borderColor: '#c9a84c',
        backgroundColor: 'rgba(201,168,76,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#c9a84c'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { 
          type: 'time', 
          time: { unit: 'day' }, 
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8896b3' }
        },
        y: { 
          beginAtZero: true,
          grid: { color: 'rgba(255,255,255,0.05)' },
          ticks: { color: '#8896b3', stepSize: 1 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0f1628',
          titleColor: '#c9a84c',
          bodyColor: '#f5f0e8',
          borderColor: 'rgba(201,168,76,0.2)',
          borderWidth: 1
        }
      }
    }
  });
}
