# ==============================================================================
# REPLOYTY — PRODUCTION MULTI-STAGE DOCKERFILE
# ==============================================================================

# Stage 1: Dependencies & Build
FROM node:22-alpine AS builder

WORKDIR /app

# Install system utilities needed for building native modules
RUN apk add --no-cache libc6-compat openssl

# Install package definitions
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# Copy source files
COPY . .

# Run Typecheck & Build SPA frontend bundle
RUN npm run build

# Stage 2: Production Runner
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install openssl for Prisma runtime
RUN apk add --no-cache openssl curl

# Create unprivileged user for container security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 reployty

# Copy build artifacts and production dependencies
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./

USER reployty

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Launch production server
CMD ["npm", "start"]
