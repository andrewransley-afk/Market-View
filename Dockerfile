FROM node:20-slim

# Install Playwright dependencies + build tools for @libsql/client
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
RUN npm install --production=false

# Install Playwright Chromium
RUN npx playwright install chromium

# Copy source code and public assets
COPY src/ ./src/
COPY tsconfig.json ./

# Create data directory
RUN mkdir -p data

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
