#!/bin/bash
# 🏺 BlogsPro Minimum Hardening & Deployment

echo "📂 Syncing blog posts to public..."
mkdir -p public/p
cp -r p/* public/p/ 2>/dev/null

echo "🚀 Committing deployment update..."
git add .
git commit -m "🚀 [Hardening] Sync posts to public and activate automated deployment"

echo "📡 Pushing to main..."
git push origin main
