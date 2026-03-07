FROM node:20-slim

# Install build tools needed by @libsql/client native modules
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install --production=false

# Copy source code and public assets
COPY src/ ./src/
COPY tsconfig.json ./

# Create data directory
RUN mkdir -p data

ENV DASHBOARD_ONLY=true

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
