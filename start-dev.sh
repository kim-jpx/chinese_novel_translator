#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR"
BACKEND_DIR="$ROOT_DIR/translation-agent"

FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
FRONTEND_HOST="${FRONTEND_HOST:-localhost}"
API_BASE_URL="${NEXT_PUBLIC_API_BASE:-http://$BACKEND_HOST:$BACKEND_PORT}"

FRONTEND_PID=""
BACKEND_PID=""

cleanup() {
  local exit_code=$?

  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  wait "${FRONTEND_PID:-}" 2>/dev/null || true
  wait "${BACKEND_PID:-}" 2>/dev/null || true
  exit "${exit_code}"
}

require_file() {
  local path="$1"
  local message="$2"
  if [[ ! -f "$path" ]]; then
    echo "$message" >&2
    exit 1
  fi
}

require_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi
  return 1
}

require_command npm
require_file "$FRONTEND_DIR/package.json" "Missing frontend package.json in $FRONTEND_DIR"
require_file "$BACKEND_DIR/backend/.env" "Missing backend env file: $BACKEND_DIR/backend/.env"
require_file "$BACKEND_DIR/venv/bin/uvicorn" "Missing backend virtualenv. Create it in $BACKEND_DIR/venv first."

if port_in_use "$FRONTEND_PORT"; then
  echo "Frontend port $FRONTEND_PORT is already in use. Set FRONTEND_PORT to a free port and try again." >&2
  exit 1
fi

if port_in_use "$BACKEND_PORT"; then
  echo "Backend port $BACKEND_PORT is already in use. Set BACKEND_PORT to a free port and try again." >&2
  exit 1
fi

trap cleanup INT TERM EXIT

echo "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT"
(
  cd "$BACKEND_DIR"
  ./venv/bin/uvicorn backend.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT" --reload
) &
BACKEND_PID=$!

echo "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT"
(
  cd "$FRONTEND_DIR"
  NEXT_PUBLIC_API_BASE="$API_BASE_URL" PORT="$FRONTEND_PORT" npm run dev
) &
FRONTEND_PID=$!

echo
echo "Frontend: http://$FRONTEND_HOST:$FRONTEND_PORT"
echo "Backend:  http://$BACKEND_HOST:$BACKEND_PORT"
echo "Health:   http://$BACKEND_HOST:$BACKEND_PORT/api/health"
echo "API Base: $API_BASE_URL"
echo "Press Ctrl+C to stop both processes."
echo

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID"
    break
  fi

  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    wait "$FRONTEND_PID"
    break
  fi

  sleep 1
done
