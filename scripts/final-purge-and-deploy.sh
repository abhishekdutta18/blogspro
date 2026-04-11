#!/bin/bash
# 🏺 BlogsPro Final Purge & Hardened Deploy
# This script ensures all legacy root files are gone and the hardened public/ assets are pushed.

echo "🏗️ Step 1: Building static assets..."
node scripts/build-static.js
node scripts/generate-sitemap.js

echo "🧹 Step 2: Ensuring all legacy root files are staged for removal..."
# These were already deleted locally, but we want to make sure the deletions are pushed.
git add -A

echo "📝 Step 3: Committing final production hardening..."
git commit -m "🚀 [Production] Zero-SDK Hardening: Purged legacy root files and synchronized public/ directory" || echo "No new changes to commit"

echo "📡 Step 4: Pushing to main..."
git push origin main

echo "✅ Hardened push complete. CI/CD pipeline should now deploy the Zero-SDK version to Firebase Hosting."
