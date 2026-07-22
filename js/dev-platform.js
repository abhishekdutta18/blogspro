// dev-platform.js
// Handles the Developer Testing Platform Dashboard

const API_BASE = 'http://localhost:8081'; // The unified local API server

document.addEventListener('DOMContentLoaded', () => {
    checkServerHealth();
    startHealthCheckInterval();
    loadActiveNodes();

    document.getElementById('testInstitutionalPipelineBtn').addEventListener('click', handleInstitutionalPipeline);
    document.getElementById('refreshHealthBtn').addEventListener('click', () => { checkServerHealth(); loadActiveNodes(); });
    
    // Individual component tests
    document.getElementById('testNewsBtn').addEventListener('click', () => testIndividualComponent('/data/news', 'News Data', 'var(--blue)'));
    document.getElementById('testWeatherBtn').addEventListener('click', () => testIndividualComponent('/data/weather', 'Weather API', 'var(--cyan)'));
    document.getElementById('testMarketBtn').addEventListener('click', () => testIndividualComponent('/data/markets', 'Market API', 'var(--emerald)'));
    document.getElementById('testEconBtn').addEventListener('click', () => testIndividualComponent('/data/economics', 'Macro Pulse', '#a855f7'));
    document.getElementById('testStockBtn').addEventListener('click', () => testIndividualComponent('/data/stocks', 'Stock Engine', '#10b981'));
    document.getElementById('testPredictiveBtn').addEventListener('click', () => testIndividualComponent('/data/predictive', 'Predictive Engine', '#f59e0b'));
    document.getElementById('testBacktestBtn').addEventListener('click', () => testIndividualComponent('/data/backtest', 'Backtest Engine', 'var(--red)'));
});

async function testIndividualComponent(endpoint, title, color) {
    const prompt = document.getElementById('promptInput').value.trim() || 'Global Equities';
    const outputDiv = document.getElementById('sandboxOutput');
    const loader = document.getElementById('loadingIndicator');
    
    loader.style.display = 'block';
    
    let fetchUrl = `${API_BASE}${endpoint}`;
    if (endpoint === '/data/news') {
        fetchUrl += `?q=${encodeURIComponent(prompt)}`;
    }
    
    outputDiv.innerHTML = `<span style="color: ${color}; font-style: italic;">Fetching ${title}...</span>`;
    
    try {
        const res = await fetch(fetchUrl);
        const data = await res.json();
        
        let displayHtml = `<h4 style="color: ${color}; margin-top: 0; margin-bottom: 1rem; border-bottom: 1px solid ${color}; padding-bottom: 0.5rem;">${title} Result</h4>`;
        
        if (data.error) {
            displayHtml += `<div style="color: var(--red);">${data.error}</div>`;
        } else if (endpoint === '/data/economics') {
            const pulseText = data.pulse && typeof data.pulse === 'object' ? (data.pulse.summary || JSON.stringify(data.pulse)) : data.pulse;
            const calText = data.calendar && typeof data.calendar === 'object' ? (data.calendar.summary || data.calendar.text || JSON.stringify(data.calendar)) : data.calendar;
            displayHtml += marked.parse(`**Macro Pulse**\n${pulseText}\n\n**Economic Calendar**\n${calText}`);
        } else {
            const text = data.summary || data.text || JSON.stringify(data, null, 2);
            displayHtml += marked.parse(text);
        }
        
        outputDiv.innerHTML = DOMPurify.sanitize(displayHtml);
    } catch (err) {
        outputDiv.innerHTML = `<div style="color: var(--red); font-family: var(--mono); font-size: 0.8rem;">Error: ${err.message}</div>`;
    } finally {
        loader.style.display = 'none';
    }
}

async function checkServerHealth() {
    const statusPill = document.getElementById('serverStatus');
    
    try {
        const healthRes = await fetch(`${API_BASE}/health`);
        if (!healthRes.ok) throw new Error('API server down');
        
        statusPill.textContent = 'API Server: Online';
        statusPill.className = 'status-pill online';
    } catch (err) {
        statusPill.textContent = 'API Server: Offline';
        statusPill.className = 'status-pill offline';
        console.error('Health Check Failed:', err);
    }
}

async function loadActiveNodes() {
    const nodeList = document.getElementById('nodeList');
    try {
        const aiRes = await fetch(`${API_BASE}/ai/status`);
        if (!aiRes.ok) throw new Error('AI Route down');
        
        const data = await aiRes.json();
        
        nodeList.innerHTML = '';
        if (data.nodes && data.nodes.length > 0) {
            data.nodes.forEach(node => {
                const li = document.createElement('li');
                li.className = 'node-item';
                li.innerHTML = `
                    <div>
                        <div class="node-name">${node.name}</div>
                        <div class="node-meta">Tier <span class="node-tier">${node.tier}</span></div>
                    </div>
                    <div style="font-size: 0.7rem; color: var(--emerald);">${node.roles.join(', ')}</div>
                `;
                nodeList.appendChild(li);
            });
        } else {
            nodeList.innerHTML = '<div style="text-align: center; color: var(--muted); font-size: 0.8rem; margin-top: 2rem;">No nodes in active pool. Check API keys.</div>';
        }
    } catch (err) {
        nodeList.innerHTML = `<div style="text-align: center; color: var(--red); font-size: 0.8rem; margin-top: 2rem;">Error loading nodes</div>`;
    }
}

function startHealthCheckInterval() {
    setInterval(() => {
        checkServerHealth();
        loadActiveNodes();
    }, 120000); // 2 minutes — reduced from 30s to prevent log flooding
}

async function handleInstitutionalPipeline() {
    const prompt = document.getElementById('promptInput').value.trim() || 'Global Equities';
    const outputDiv = document.getElementById('sandboxOutput');
    const loader = document.getElementById('loadingIndicator');
    const btn = document.getElementById('testInstitutionalPipelineBtn');
    
    btn.disabled = true;
    loader.style.display = 'block';
    outputDiv.innerHTML = `<span style="color: var(--gold); font-style: italic;">Triggering all data endpoints and generating article simultaneously...</span>`;
    
    try {
        let html = '';
        
        // Setup Grid Structure
        html += `<div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; margin-bottom: 2rem;">`;
        html += `<div id="econCell" style="padding: 1rem; border: 1px solid var(--purple); border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: var(--purple); margin-top: 0;">Macro Pulse</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `<div id="predictiveCell" style="padding: 1rem; border: 1px solid #f59e0b; border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: #f59e0b; margin-top: 0;">Predictive Engine</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `<div id="marketCell" style="padding: 1rem; border: 1px solid var(--emerald); border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: var(--emerald); margin-top: 0;">Global Markets</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `<div id="stockCell" style="padding: 1rem; border: 1px solid #10b981; border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: #10b981; margin-top: 0;">Stock Engine</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `<div id="currencyCell" style="padding: 1rem; border: 1px solid #8b5cf6; border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: #8b5cf6; margin-top: 0;">Currency Engine</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `<div id="weatherCell" style="padding: 1rem; border: 1px solid var(--cyan); border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: var(--cyan); margin-top: 0;">Weather Engine</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `<div id="newsCell" style="padding: 1rem; border: 1px solid var(--blue); border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: var(--blue); margin-top: 0;">News Data</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `<div id="backtestCell" style="padding: 1rem; border: 1px solid #ef4444; border-radius: 6px; overflow: auto; max-height: 300px;"><h4 style="color: #ef4444; margin-top: 0;">Backtesting Engine</h4><span style="color: var(--muted); font-style: italic;">Loading...</span></div>`;
        html += `</div>`; // End Grid
        
        html += `<h3 style="color: var(--gold); border-bottom: 1px solid var(--gold); padding-bottom: 0.5rem;">Institutional Generation Results</h3>`;
        html += `<div id="aiCell"><span style="color: var(--muted); font-style: italic;">Drafting institutional manuscript and auditing facts... (this takes 20-30 seconds)</span></div>`;
        
        outputDiv.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ['data-title', 'data-type', 'data-columns', 'data-rows', 'class', 'style'] });
        
        // Helper to update a cell safely
        const updateCell = (cellId, content) => {
            const cell = document.getElementById(cellId);
            if (cell) cell.innerHTML = DOMPurify.sanitize(content, { ADD_ATTR: ['data-title', 'data-type', 'data-columns', 'data-rows', 'class', 'style'] });
        };
        
        // Fire off all requests simultaneously, but handle their responses independently
        fetch(`${API_BASE}/data/economics`)
            .then(res => res.json())
            .then(data => {
                let text = '';
                if (data.pulse) {
                    const pulseText = typeof data.pulse === 'object' ? (data.pulse.summary || JSON.stringify(data.pulse)) : data.pulse;
                    text += `**Macro Pulse**\n${pulseText}\n\n`;
                }
                if (data.calendar) {
                    const calText = typeof data.calendar === 'object' ? (data.calendar.summary || data.calendar.text || JSON.stringify(data.calendar)) : data.calendar;
                    text += `**Economic Calendar**\n${calText}\n`;
                }
                updateCell('econCell', `<h4 style="color: var(--purple); margin-top: 0;">Macro Pulse</h4>${marked.parse(text || data.error || "No data")}`);
            }).catch(e => updateCell('econCell', `<h4 style="color: var(--purple); margin-top: 0;">Macro Pulse</h4>Error: ${e.message}`));

        fetch(`${API_BASE}/data/markets`)
            .then(res => res.json())
            .then(data => {
                updateCell('marketCell', `<h4 style="color: var(--emerald); margin-top: 0;">Global Markets</h4>${marked.parse(data.text || data.error || "No data")}`);
            }).catch(e => updateCell('marketCell', `<h4 style="color: var(--emerald); margin-top: 0;">Global Markets</h4>Error: ${e.message}`));

        fetch(`${API_BASE}/data/predictive`)
            .then(res => res.json())
            .then(data => {
                updateCell('predictiveCell', `<h4 style="color: #f59e0b; margin-top: 0;">Predictive Engine</h4>${marked.parse(data.summary || data.error || "No data")}`);
            }).catch(e => updateCell('predictiveCell', `<h4 style="color: #f59e0b; margin-top: 0;">Predictive Engine</h4>Error: ${e.message}`));

        fetch(`${API_BASE}/data/stocks`)
            .then(res => res.json())
            .then(data => {
                updateCell('stockCell', `<h4 style="color: #10b981; margin-top: 0;">Stock Engine</h4>${marked.parse(data.summary || data.error || "No data")}`);
            }).catch(e => updateCell('stockCell', `<h4 style="color: #10b981; margin-top: 0;">Stock Engine</h4>Error: ${e.message}`));

        fetch(`${API_BASE}/data/currency`)
            .then(res => res.json())
            .then(data => {
                updateCell('currencyCell', `<h4 style="color: #8b5cf6; margin-top: 0;">Currency Engine</h4>${marked.parse(data.summary || data.error || "No data")}`);
            }).catch(e => updateCell('currencyCell', `<h4 style="color: #8b5cf6; margin-top: 0;">Currency Engine</h4>Error: ${e.message}`));

        fetch(`${API_BASE}/data/weather`)
            .then(res => res.json())
            .then(data => {
                const text = data.summary || (data.text || data.error || "No data");
                updateCell('weatherCell', `<h4 style="color: var(--cyan); margin-top: 0;">Weather Engine</h4>${marked.parse(text)}`);
            }).catch(e => updateCell('weatherCell', `<h4 style="color: var(--cyan); margin-top: 0;">Weather Engine</h4>Error: ${e.message}`));

        fetch(`${API_BASE}/data/backtest`)
            .then(res => res.json())
            .then(data => {
                updateCell('backtestCell', `<h4 style="color: #ef4444; margin-top: 0;">Backtesting Engine</h4>${marked.parse(data.summary || data.error || "No data")}`);
            }).catch(e => updateCell('backtestCell', `<h4 style="color: #ef4444; margin-top: 0;">Backtesting Engine</h4>Error: ${e.message}`));

        fetch(`${API_BASE}/data/news?q=${encodeURIComponent(prompt)}`)
            .then(res => res.json())
            .then(data => {
                updateCell('newsCell', `<h4 style="color: var(--blue); margin-top: 0;">News Data</h4>${marked.parse(data.text || data.summary || data.error || "No data")}`);
            }).catch(e => updateCell('newsCell', `<h4 style="color: var(--blue); margin-top: 0;">News Data</h4>Error: ${e.message}`));

        // Wait for the AI generation to finish
        const aiRes = await fetch(`${API_BASE}/ai/institutional`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        const aiData = await aiRes.json();
        
        let aiHtml = '';
        if (aiData.error) {
            aiHtml = `<div style="color: var(--red);">AI Error: ${aiData.error}</div>`;
        } else {
            aiHtml += `<div id="aiContentWrap" style="margin-top: 1rem; padding: 1rem; background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 6px;">`;
            aiHtml += marked.parse(aiData.text);
            aiHtml += `</div>`;
            aiHtml += `<button id="downloadPdfBtn" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--blue); color: white; border: none; border-radius: 4px; cursor: pointer; font-family: var(--mono);">Download PDF</button>`;
            aiHtml += `<h4 style="margin-top: 2rem; color: var(--emerald);">Fact Check Audit</h4>`;
            aiHtml += `<pre style="margin-top: 1rem; color: var(--muted); background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 4px; overflow-x: auto;">${aiData.audit}</pre>`;
        }
        updateCell('aiCell', aiHtml);
        
        // Wire up the PDF download button programmatically (DOMPurify strips onclick)
        const pdfBtn = document.getElementById('downloadPdfBtn');
        if (pdfBtn) pdfBtn.addEventListener('click', () => window.downloadPdf());

        // 1. Find all mermaid code blocks and convert them to div.mermaid
        const mermaidBlocks = outputDiv.querySelectorAll('code.language-mermaid');
        for (let i = 0; i < mermaidBlocks.length; i++) {
            const block = mermaidBlocks[i];
            const div = document.createElement('div');
            div.className = 'mermaid';
            const textContent = block.textContent;
            block.parentElement.replaceWith(div);
            
            try {
                const { svg } = await mermaid.render(`mermaid_${Date.now()}_${i}`, textContent);
                div.innerHTML = svg;
            } catch (e) {
                console.warn("Mermaid failed, attempting Google Charts fallback...", e);
                if (window.google && google.visualization) {
                    try {
                        const lines = textContent.split('\n').map(l => l.trim()).filter(l => l);
                        let title = "Fallback Chart";
                        let isPie = false;
                        let dataRows = [];
                        
                        for (let line of lines) {
                            if (line.toLowerCase().startsWith('pie')) {
                                isPie = true;
                                const match = line.match(/title\s+(.+)/i);
                                if (match) title = match[1];
                            } else if (isPie && line.includes(':')) {
                                let [label, val] = line.split(':').map(s => s.trim());
                                label = label.replace(/['"]/g, '');
                                dataRows.push([label, parseFloat(val)]);
                            }
                        }
                        
                        if (isPie && dataRows.length > 0) {
                            const data = new google.visualization.DataTable();
                            data.addColumn('string', 'Category');
                            data.addColumn('number', 'Value');
                            data.addRows(dataRows);
                            
                            const options = {
                                title: title,
                                backgroundColor: 'transparent',
                                textStyle: { color: '#f4f4f5' },
                                titleTextStyle: { color: '#c9a84c' },
                                legend: { textStyle: { color: '#f4f4f5' } }
                            };
                            div.style.minHeight = '300px';
                            const chart = new google.visualization.PieChart(div);
                            chart.draw(data, options);
                        } else {
                            div.innerHTML = `<span style="color:var(--red)">Mermaid failed. Fallback to Google Charts failed (Not a Pie chart).</span>`;
                        }
                    } catch(fallbackErr) {
                        div.innerHTML = `<span style="color:var(--red)">Mermaid & Google Charts failed.</span>`;
                    }
                } else {
                    div.innerHTML = `<span style="color:var(--red)">Mermaid failed and Google Charts not loaded.</span>`;
                }
            }
        }
        
        // 2. Find and render Google Charts
        const googleCharts = outputDiv.querySelectorAll('.gchart');
        if (googleCharts.length > 0) {
            for (let index = 0; index < googleCharts.length; index++) {
                const el = googleCharts[index];
                let rendered = false;
                const title = el.getAttribute('data-title') || 'Chart';
                const type = el.getAttribute('data-type') || 'PieChart';
                const rowsRaw = el.getAttribute('data-rows') || '[]';
                
                if (window.google && google.visualization) {
                    try {
                        const columns = JSON.parse(el.getAttribute('data-columns') || '[]');
                        const rows = JSON.parse(rowsRaw);
                        
                        const data = new google.visualization.DataTable();
                        columns.forEach(col => {
                            data.addColumn(typeof rows[0][columns.indexOf(col)] === 'number' ? 'number' : 'string', col);
                        });
                        data.addRows(rows);
                        
                        const options = {
                            title: title,
                            backgroundColor: 'transparent',
                            textStyle: { color: '#f4f4f5' },
                            titleTextStyle: { color: '#c9a84c' },
                            legend: { textStyle: { color: '#f4f4f5' } }
                        };
                        
                        const chartId = `gchart_${index}_${Date.now()}`;
                        el.id = chartId;
                        el.style.minHeight = '300px';
                        
                        let chart;
                        if (type === 'PieChart') chart = new google.visualization.PieChart(document.getElementById(chartId));
                        else if (type === 'BarChart') chart = new google.visualization.BarChart(document.getElementById(chartId));
                        else chart = new google.visualization.LineChart(document.getElementById(chartId));
                        
                        chart.draw(data, options);
                        rendered = true;
                    } catch(e) {
                        console.warn("Google Chart rendering failed:", e);
                    }
                }
                
                if (!rendered && type === 'PieChart') {
                    try {
                        const rows = JSON.parse(rowsRaw);
                        let mermaidText = `pie title ${title}\n`;
                        rows.forEach(row => {
                            mermaidText += `"${row[0]}" : ${row[1]}\n`;
                        });
                        const { svg } = await mermaid.render(`mermaid_fb_${index}_${Date.now()}`, mermaidText);
                        el.innerHTML = svg;
                    } catch(fallbackErr) {
                        el.innerHTML = `<span style="color:red">Both Google Charts and Mermaid failed</span>`;
                    }
                } else if (!rendered) {
                    el.innerHTML = `<span style="color:red">Google Charts failed and Mermaid fallback only supports PieCharts</span>`;
                }
            }
        }
        
    } catch (err) {
        outputDiv.innerHTML = `<div style="color: var(--red); font-family: var(--mono); font-size: 0.8rem;">Error: ${err.message}</div>`;
    } finally {
        btn.disabled = false;
        loader.style.display = 'none';
    }
}

async function renderOutput(outputDiv, text) {
    // We need to allow class "language-mermaid" for marked
    outputDiv.innerHTML = DOMPurify.sanitize(marked.parse(text));
    
    // Find all mermaid code blocks and convert them to div.mermaid
    const mermaidBlocks = outputDiv.querySelectorAll('code.language-mermaid');
    mermaidBlocks.forEach(block => {
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = block.textContent;
        // Replace the parent <pre> with the new div
        block.parentElement.replaceWith(div);
    });
    
    if (mermaidBlocks.length > 0) {
        try {
            await mermaid.run({
                nodes: outputDiv.querySelectorAll('.mermaid')
            });
        } catch (e) {
            console.error("Mermaid rendering failed:", e);
        }
    }
}
// Add the download PDF function globally
window.downloadPdf = function() {
    const element = document.getElementById('aiContentWrap');
    if (!element) {
        alert('No manuscript content found to export.');
        return;
    }
    if (typeof html2pdf === 'undefined') {
        alert('PDF library failed to load. Please check your internet connection and refresh.');
        return;
    }
    
    // Clone the element so we don't mutate the live DOM
    const clone = element.cloneNode(true);
    
    // Recursively force print-friendly colors on the clone
    const forceColors = (el) => {
        el.style.color = '#000';
        el.style.background = '#fff';
        el.style.borderColor = '#ccc';
        for (const child of el.children) {
            forceColors(child);
        }
    };
    forceColors(clone);
    
    // Remove Mermaid SVGs (they render poorly in PDF) and replace with placeholder text
    clone.querySelectorAll('.mermaid, svg').forEach(svg => {
        const placeholder = document.createElement('p');
        placeholder.textContent = '[Chart — see interactive version]';
        placeholder.style.fontStyle = 'italic';
        placeholder.style.color = '#666';
        svg.replaceWith(placeholder);
    });
    
    const opt = {
        margin:       0.75,
        filename:     `Institutional_Manuscript_${new Date().toISOString().split('T')[0]}.pdf`,
        image:        { type: 'jpeg', quality: 0.95 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
    };
    
    html2pdf().set(opt).from(clone).save().catch(err => {
        console.error('PDF generation failed:', err);
        alert('PDF generation failed: ' + err.message);
    });
};
