#!/bin/bash
# 🏺 BlogsPro Final Orchestration & Deployment Activation

echo "🛠️ Patching deploy.yml with Hosting engine..."
cat > .github/workflows/deploy.yml <<EOF
name: BlogsPro CI

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write
  id-token: write

jobs:
  production-pipeline:
    name: Build & Deploy
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - name: Install dependencies
        run: npm ci --no-audit
      - name: Build & Consolidate
        env:
          FIREBASE_PROJECT_ID: "blogspro-ai"
          FIREBASE_SERVICE_ACCOUNT: \${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
        run: |
          bash scripts/consolidate-prod.sh
          node scripts/build-static.js
          node scripts/generate-sitemap.js
      - name: Commit & Push Updates
        run: |
          git config --global user.name "BlogsPro Bot"
          git config --global user.email "bot@blogspro.in"
          git add .
          git commit -m "chore: autonomous production build [skip ci]" || echo "No changes"
          git push || echo "Push skipped"
      - name: Deploy to Firebase Hosting
        uses: FirebaseExtended/action-hosting-deploy@v0
        with:
          repoToken: '\${{ secrets.GITHUB_TOKEN }}'
          firebaseServiceAccount: '\${{ secrets.FIREBASE_SERVICE_ACCOUNT }}'
          projectId: blogspro-ai
          channelId: live
EOF

echo "🚀 Committing final orchestration..."
git add .github/workflows/deploy.yml
git commit -m "🚀 [Orchestration] Activate automated Firebase Hosting deployment"

echo "📡 Pushing to main..."
git push origin main
