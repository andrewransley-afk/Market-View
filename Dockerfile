FROM node:20-slim

# Build tools for native modules (libsql)
RUN apt-get update && apt-get install -y \
    python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install ALL deps (need typescript for build)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and compile TypeScript
COPY . .
RUN npx tsc

# Copy static assets to dist so Express can serve them
RUN cp -r src/dashboard/public dist/dashboard/public

# Remove dev dependencies to shrink image
RUN npm prune --omit=dev

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/index.js"]
