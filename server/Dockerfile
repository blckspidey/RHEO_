# ─────────────────────────────────────────────────────────────────
# DropShare / RHEO Server — Production Dockerfile
#
# Multi-stage build:
#   Stage 1 (builder): install dependencies & generate Prisma client
#   Stage 2 (runtime): lightweight production image
# ─────────────────────────────────────────────────────────────────

# ── Stage 1: Builder ─────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /build

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci
RUN npx prisma generate

# ── Stage 2: Production Runtime ──────────────────────────────────
FROM node:20-alpine AS runtime

WORKDIR /app

# Non-root user for security
USER node

# Copy node_modules (with generated Prisma client)
COPY --from=builder --chown=node:node /build/node_modules ./node_modules
COPY --from=builder --chown=node:node /build/prisma ./prisma

# Copy application source code
COPY --chown=node:node src/ ./src/
COPY --chown=node:node package.json ./

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:5000/health || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy || true; node src/server.js"]
