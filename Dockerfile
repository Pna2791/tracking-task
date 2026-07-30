# ---------------------------------------------------------------------------
# Multi-stage build: compile the React frontend, then run it from Express so
# the whole app ships as ONE container.
# ---------------------------------------------------------------------------

# --- Stage 1: build the frontend -------------------------------------------
FROM node:20-bookworm-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build   # outputs to /app/frontend/dist

# --- Stage 2: backend runtime ----------------------------------------------
FROM node:20-bookworm-slim AS backend
WORKDIR /app

# better-sqlite3 is a native module; it needs a compiler toolchain to build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY backend/package.json ./
RUN npm install --omit=dev

COPY backend/ ./
# Serve the built frontend from Express's ./public directory.
COPY --from=frontend /app/frontend/dist ./public

ENV NODE_ENV=production
ENV PORT=3000
# SQLite file lives under /app/data, which is mounted as a volume.
ENV DB_PATH=/app/data/app.db

EXPOSE 3000
CMD ["node", "src/index.js"]
