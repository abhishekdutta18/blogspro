#!/bin/bash
# 🏺 BlogsPro Production Consolidation Script

echo "📂 Creating public structure..."
mkdir -p public/p
mkdir -p public/js
mkdir -p public/css

echo "🚚 Syncing essential production assets to public/..."
cp logo.svg logo-crop.png favicon.ico favicon.png favicon.svg ads.txt robots.txt sitemap.xml public/ || echo "Some assets missing, skipping..."

# Copy core HTML pages to public/
cp index.html login.html admin.html register.html dashboard.html account.html post.html public/ || echo "Some HTML files missing, skipping..."

# Recursive sync for critical directories (using /. to copy contents, not the folder itself)
mkdir -p public/js public/css public/briefings
cp -r js/. public/js/ || echo "js/ contents missing"
cp -r css/. public/css/ || echo "css/ contents missing"
cp -r briefings/. public/briefings/ || echo "briefings/ contents missing"

echo "🧹 Purging root workspace..."
rm -f login.html admin.html index.html post.html register.html dashboard.html account.html deploy.html
rm -rf js/ css/ briefings/

echo "✨ Hardening Complete."
