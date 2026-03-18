FROM node:20-slim

# Install Playwright dependencies + better-sqlite3 build tools
RUN apt-get update && apt-get install -y \
    python3 make g++ \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0 \
    fonts-liberation wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install

# Install Playwright Chromium
RUN npx playwright install chromium

# Copy source
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
