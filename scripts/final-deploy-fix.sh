#!/bin/bash
# 🏺 BlogsPro "No-Popup" Finalization & Deployment

echo "🛠️ Committing Auth Proxy Worker updates (Google OAuth implementation)..."
git add scripts/auth-proxy-worker.js public/login.html .github/workflows/deploy.yml
git commit -m "🚀 [Hardening] Implemented server-side OAuth to eliminate client-side popups"

echo "📡 Pushing to main to trigger production deploy..."
git push origin main
