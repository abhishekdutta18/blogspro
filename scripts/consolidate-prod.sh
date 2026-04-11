#!/bin/bash
# 🏺 BlogsPro Production Consolidation Script

echo "📂 Creating public structure..."
mkdir -p public/p
mkdir -p public/js
mkdir -p public/css

echo "🚚 Moving essential production assets to public/..."
cp logo.svg logo-crop.png favicon.ico favicon.png favicon.svg ads.txt robots.txt sitemap.xml public/ || echo "Some assets missing, skipping..."

echo "🧹 Deleting legacy root entry points..."
rm -f login.html admin.html index.html post.html register.html dashboard.html account.html deploy.html

echo "✨ Hardening Complete."
