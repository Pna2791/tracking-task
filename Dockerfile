# ---------------------------------------------------------------------------
# Multi-stage production image (linux/amd64 + linux/arm64).
# Stage 1 builds the Vite frontend; stage 2 installs native deps; stage 3 is
# a slim runtime (no compiler toolchain) running as non-root.
# ---------------------------------------------------------------------------

# --- Stage 1: frontend -----------------------------------------------------
FROM node:20-bookworm-slim AS frontend
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend deps (needs toolchain for better-sqlite3) ------------
FROM node:20-bookworm-slim AS backend-deps
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 3: runtime ------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/app.db

# Non-root user (uid/gid 1001) owns the app + data directory.
RUN groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --home-dir /app --shell /usr/sbin/nologin app \
  && mkdir -p /app/data /app/seed \
  && chown -R app:app /app

COPY --from=backend-deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app backend/package.json backend/package-lock.json ./
COPY --chown=app:app backend/src ./src
COPY --from=frontend --chown=app:app /app/frontend/dist ./public

# Optional seed DB — copied into the volume on first boot if app.db is missing.
COPY --chown=app:app data/app.db /app/seed/app.db
COPY --chown=app:app docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER app

EXPOSE 3000

# node:20-bookworm-slim has no curl/wget; Node 20's global fetch probes /api/health.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "src/index.js"]
