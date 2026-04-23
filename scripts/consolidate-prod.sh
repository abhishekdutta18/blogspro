#!/bin/bash
# 🏺 BlogsPro Production Consolidation Script

echo "📂 Creating public structure..."
mkdir -p public/p
mkdir -p public/js
mkdir -p public/css

echo "🚚 Syncing essential production assets to public/..."
cp logo.svg logo-crop.png favicon.ico favicon.png favicon.svg ads.txt robots.txt sitemap.xml public/ || echo "Some assets missing, skipping..."

# Recursive sync for critical directories
cp -r js/ public/js/ || echo "js/ missing"
cp -r css/ public/css/ || echo "css/ missing"
cp -r briefings/ public/briefings/ || echo "briefings/ missing"

echo "🧹 Deleting legacy root entry points..."
rm -f login.html admin.html index.html post.html register.html dashboard.html account.html deploy.html

echo "✨ Hardening Complete."
