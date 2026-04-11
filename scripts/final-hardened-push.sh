#!/bin/bash
# 🏺 BlogsPro Final Hardened Push

echo "🏗️ Step 1: Running build scripts to populate public/..."
node scripts/build-static.js
node scripts/generate-sitemap.js

echo "🛠️ Step 2: Staging all hardened assets..."
git add public/*
git add scripts/auth-proxy-worker.js
git add scripts/build-static.js
git add scripts/generate-sitemap.js
git add .gitignore

echo "📝 Step 3: Committing final production state..."
git commit -m "🚀 [Production] 100% Zero-SDK Unified Architecture complete. All assets consolidated in public/."

echo "📡 Step 4: Pushing to main..."
git push origin main
