#!/bin/bash
set -e

echo "=================================================="
echo "🚀 Starting DecisionLens Full-Stack System"
echo "=================================================="

# 1. Start FastAPI Backend in background on internal port 8000 with auto-restart and 120s keep-alive
echo "Starting FastAPI Backend on 127.0.0.1:8000 (keep-alive: 120s)..."
cd /app/backend
(
  while true; do
    uvicorn app.main:app --host 127.0.0.1 --port 8000 --timeout-keep-alive 120
    echo "Uvicorn exited with status $?. Restarting in 2 seconds..."
    sleep 2
  done
) &
BACKEND_PID=$!

# 2. Start Next.js Frontend on the public container PORT
PUBLIC_PORT="${PORT:-10000}"
echo "Starting Next.js Frontend on port ${PUBLIC_PORT}..."
cd /app/frontend
export INTERNAL_API_URL="http://127.0.0.1:8000"
export NEXT_PUBLIC_API_URL=""

npm run start -- -p "${PUBLIC_PORT}" &
FRONTEND_PID=$!

# Graceful termination
trap "kill -TERM $BACKEND_PID $FRONTEND_PID 2>/dev/null || true" INT TERM EXIT

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID
