# BlogsPro Swarm 5.4 — Institutional Intelligence Terminal

A professional-grade, autonomous research suite for high-fidelity institutional manuscript synthesis. Re-engineered for **Cloud-First Stability (Cerebras/Gemini/Groq)**, **MiroFish Multi-Agent Consensus**, and **Strategic News Wire Integration**.

---

## 🏗️ Architecture & Logic Flows (V5.4 Institutional)

### 1. Swarm Orchestration Pipeline (Hierarchical Consensus)
This flow illustrates the end-to-end synthesis of a 25,000-word institutional manuscript, leveraging a Tiered AI resource pool and autonomous fidelity verification.

```mermaid
graph TD
    Trigger[GitHub Action / Pulse Dispatch] --> Orchestrator[Swarm Orchestrator]
    Orchestrator --> Researcher[Researcher Agent]
    subgraph Research_Intelligence
        Researcher --> Search[Gemini-Fleet Search]
        Researcher --> Wire[Strategic News Wire Generator]
    end
    Researcher --> Brief[Institutional Research Brief]
    Brief --> 16Verticals[16-Vertical Swarm]
    subgraph Swarm_Verticals
        16Verticals --> Drafter[High-Density Drafter]
        16Verticals --> Critic[Fidelity Critic]
    end
    Swarm_Verticals --> MiroFish[MiroFish Consensus Desk (V5.4 Hardened)]
    MiroFish --> Editor[Chief Editor]
    Editor --> Governor[Fidelity Governor]
    Governor --> Export[HTML / PDF Institutional Tome]
    Export --> Firebase[Firebase Telemetry / Archival]
```

### 2. $Shield Strategy (Reinforcement Loop)
The system employs a local-to-cloud reinforcement loop via **Ollama (Tier-2 fallback)** to improve jargon suppression and structural density over 1,500 iterations.

---

## 🚀 Key Features (V5.4 Swarm)

- **Cloud-First AI Balancer**: Prioritizes Tier-1 Cloud nodes (Cerebras, Gemini, Groq) with a "High-Fidelity Retention" logic that avoids premature fallback to local models.
- **Dynamic News Wire Generator**: Synthesizes real-time market pulse into every research vertical, ensuring manuscripts are anchored in current-day events.
- **MiroFish Consensus Hardening**: A multi-agent board of 10-16 personas (Quant, Macro, ESG) audits every manuscript. Rejection triggers an autonomous self-healing rewrite loop.
- **Definitive Telemetry Bridge**: Robust JSON-to-OAuth restoration for Firebase, ensuring 0% loss of reinforcement learning data or archival tomes.
- **High-Fidelity PDF Engine**: Puppeteer-led export for pixel-perfect institutional layout, distributed via Firebase Storage.

---

## 🛠️ Tech Stack & Tiers

| Tier | Role | Provider |
|---|---|---|
| **Tier 1 (Cloud)** | Core Synthesis | Cerebras-70B, Gemini-1.5, Groq-70B |
| **Tier 2 (Remote)** | Bulk Research | Ollama-Prod (70B Swarm via Ngrok Bridge) |
| **Tier 3 (Local)** | Utility & Repair | Ollama-Local, Cloudflare, HuggingFace |

---

## 📂 Institutional Core

- `scripts/generate-institutional-tome.js`: The primary synthesis engine.
- `scripts/lib/ai-service.js`: The AI Balancer and Node Pool manager.
- `scripts/lib/mirofish-qa-service.js`: The hierarchical consensus auditor.
- `scripts/lib/firebase-service.js`: Hardened telemetry and archival bridge.

---

## 🏁 Operational Setup

### 1. Credential Hydro-Sync
Run the institutional pull script to hydrate your `.env` with repository secrets:
```bash
node scripts/pull-secrets.js
```

### 2. Infrastructure Restoration
Activate the background swarm bridge for remote node access:
```bash
/opt/homebrew/bin/ngrok start --config scripts/ngrok-swarm.yml --all
```

### 3. Swarm Diagnostic
Perform a live audit of all cloud and local nodes:
```bash
node scripts/audit-ai-nodes.js
```

---

## 🛡️ License & Institutional Disclaimer
This system is designed for high-fidelity market simulation and strategic forecasting. **BlogsPro Institutional** is released under the MIT License.
