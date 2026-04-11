#!/bin/bash
# 🚀 BlogsPro CI/CD Final Push

echo "🛠️ Staging deploy.yml fix..."
git add .github/workflows/deploy.yml || echo "Already staged"
git commit -m "🚀 [CI/CD] Fixed SEO build paths to point to public/ folder" || echo "Already committed"

echo "📡 Pushing to main..."
git push origin main
