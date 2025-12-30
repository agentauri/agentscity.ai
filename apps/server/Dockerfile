# AgentsCity Server - Multi-stage Dockerfile for Bun
# Optimized for Fly.io deployment
#
# Build context should be the repository root:
#   docker build -f apps/server/Dockerfile .

# ============================================================================
# Stage 1: Dependencies installer
# ============================================================================
FROM oven/bun:1-alpine AS deps

WORKDIR /app

# Copy workspace package files for dependency resolution
COPY package.json bun.lock* ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# ============================================================================
# Stage 2: Builder (install all deps including dev for type checking)
# ============================================================================
FROM oven/bun:1-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
COPY tsconfig.json ./
COPY apps/server/tsconfig.json ./apps/server/

# Install all dependencies (including devDependencies for typecheck)
RUN bun install --frozen-lockfile

# Copy source code
COPY packages/shared ./packages/shared
COPY apps/server/src ./apps/server/src

# Run type check (optional but recommended)
WORKDIR /app/apps/server
RUN bun run typecheck || echo "Typecheck warnings (non-blocking)"

# ============================================================================
# Stage 3: Production runner
# ============================================================================
FROM oven/bun:1-alpine AS runner

# Install dependencies for health checks and debugging
RUN apk add --no-cache curl

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 agentscity && \
    adduser --system --uid 1001 agentscity

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy shared package (needed at runtime)
COPY --from=builder /app/packages/shared ./packages/shared

# Copy server source (Bun runs TypeScript directly)
COPY --from=builder /app/apps/server/src ./apps/server/src
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/apps/server/tsconfig.json ./apps/server/
COPY --from=builder /app/tsconfig.json ./

# Set ownership
RUN chown -R agentscity:agentscity /app

# Switch to non-root user
USER agentscity

# Set working directory to server
WORKDIR /app/apps/server

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the server (Bun runs TypeScript directly)
CMD ["bun", "run", "src/index.ts"]
