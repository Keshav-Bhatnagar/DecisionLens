# ==============================================================================
# DecisionLens Unified Production Dockerfile
# Multi-stage build combining Next.js Frontend and FastAPI Backend
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Build Next.js Frontend
# ------------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN mkdir -p public && npm run build

# ------------------------------------------------------------------------------
# Stage 2: Final Production Runner (Python 3.11 + Node 20 Runtime)
# ------------------------------------------------------------------------------
FROM python:3.11-slim

WORKDIR /app

# Install system utilities: ffmpeg (audio transcription), curl, and Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python backend dependencies
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy backend source code
COPY backend/ ./backend/

# Copy built frontend assets and dependencies
COPY --from=frontend-builder /app/frontend/package*.json ./frontend/
COPY --from=frontend-builder /app/frontend/.next ./frontend/.next
COPY --from=frontend-builder /app/frontend/public ./frontend/public
COPY --from=frontend-builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=frontend-builder /app/frontend/next.config.mjs ./frontend/

# Copy startup orchestration script
COPY start.sh ./
RUN chmod +x ./start.sh

# Environment variables
ENV PORT=3000
ENV INTERNAL_API_URL=http://127.0.0.1:8000
ENV NEXT_PUBLIC_API_URL=""
ENV PYTHONUNBUFFERED=1

EXPOSE 3000

CMD ["./start.sh"]
