FROM node:20-slim

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm install --production=false

# Copy source code and public assets
COPY src/ ./src/
COPY tsconfig.json ./

# Create data directory for SQLite
RUN mkdir -p data

ENV DASHBOARD_ONLY=true

EXPOSE 3000

CMD ["npx", "tsx", "src/index.ts"]
