# ---- Stage 1: Build frontend ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install all deps (including devDeps for build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build Vite frontend
COPY . .
RUN npm run build

# ---- Stage 2: Production image ----
FROM node:20-alpine AS production

WORKDIR /app

# Copy package files and install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy backend source files
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/db.ts ./
COPY --from=builder /app/ai.ts ./
COPY --from=builder /app/gmail.ts ./
COPY --from=builder /app/whatsapp.ts ./
COPY --from=builder /app/logger.service.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/vite.config.ts ./
COPY --from=builder /app/index.html ./

# Copy built frontend assets
COPY --from=builder /app/dist ./dist

# Copy public assets
COPY --from=builder /app/public ./public

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

CMD ["npx", "tsx", "server.ts"]
