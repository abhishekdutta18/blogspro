# [V1.0] BlogsPro Swarm Engine - Sovereign GKE Edition
FROM node:20-slim

# 🛠️ Install Puppeteer/Chromium dependencies
RUN apt-get update \
    && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 🚀 Set working directory
WORKDIR /app

# 📦 Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# 📂 Copy source code
COPY . .

# 🔐 Environment Variables Placeholder
# These will be populated by K8s Secrets
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# 🏁 Default Command: Execute Swarm (will be overridden by CronJob args)
CMD ["node", "scripts/generate-institutional-tome.js"]
