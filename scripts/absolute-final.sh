#!/bin/bash
# 🏺 BlogsPro Absolute Final Deployment & Popup Elimination

echo "🛠️ Stage 1: Force-syncing public directory..."
git add .gitignore
git add public/login.html
git add public/p/*
git add public/js/services/api.js

echo "🛠️ Stage 2: Committing hardened production assets..."
git commit -m "🚀 [Hardening] Track public assets and finalize zero-popup OAuth flow"

echo "📡 Stage 3: Pushing to main..."
git push origin main
