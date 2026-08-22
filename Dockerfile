# Multi-stage production build for Mail2WhatsApp AI
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ sqlite

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

# Stage 2: Runtime image
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache sqlite bash

ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/scripts ./scripts

# Create unprivileged application user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

CMD ["npm", "run", "start"]
