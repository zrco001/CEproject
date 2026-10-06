#!/usr/bin/env sh
# Docker runtime smoke test (Phase 1 review fix #4).
# Starts every compose service (including the api/web app profile), waits for health, probes
# HTTP endpoints, and prints diagnostics on failure. Teardown (`docker compose down -v`) is the
# caller's responsibility so it also runs when this script fails.
#
# Requires POSTGRES_PASSWORD, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY in the environment
# (CI uses placeholder values only).
set -eu

TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-180}"
COMPOSE="docker compose --profile app"

fail() {
  echo "::error::$1"
  echo "----- docker compose ps -a -----"
  $COMPOSE ps -a || true
  echo "----- docker compose logs -----"
  $COMPOSE logs --no-color || true
  exit 1
}

container_of() {
  $COMPOSE ps -a -q "$1"
}

wait_until() {
  description="$1"
  shift
  elapsed=0
  until "$@"; do
    if [ "$elapsed" -ge "$TIMEOUT_SECONDS" ]; then
      fail "Timed out after ${TIMEOUT_SECONDS}s waiting for: $description"
    fi
    sleep 3
    elapsed=$((elapsed + 3))
  done
  echo "✔ $description"
}

is_healthy() {
  id="$(container_of "$1")"
  [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Health.Status}}' "$id")" = "healthy" ]
}

is_running() {
  id="$(container_of "$1")"
  [ -n "$id" ] && [ "$(docker inspect -f '{{.State.Running}}' "$id")" = "true" ]
}

has_exited_successfully() {
  id="$(container_of "$1")"
  [ -n "$id" ] || return 1
  status="$(docker inspect -f '{{.State.Status}}' "$id")"
  code="$(docker inspect -f '{{.State.ExitCode}}' "$id")"
  if [ "$status" = "exited" ] && [ "$code" != "0" ]; then
    fail "$1 exited with code $code"
  fi
  [ "$status" = "exited" ] && [ "$code" = "0" ]
}

http_ok() {
  [ "$(curl -s -o /dev/null -w '%{http_code}' "$1")" = "200" ]
}

echo "Building and starting services…"
$COMPOSE up -d --build || fail "docker compose up failed"

wait_until "postgres healthy" is_healthy postgres
wait_until "minio healthy" is_healthy minio
wait_until "minio-init completed (exit 0)" has_exited_successfully minio-init
wait_until "mailpit running" is_running mailpit
wait_until "mailpit UI responds 200" http_ok "http://localhost:${MAILPIT_UI_PORT:-8025}/"
wait_until "api healthy" is_healthy api
wait_until "web running" is_running web

wait_until "API GET /api/v1/health → 200" http_ok "http://localhost:${API_PORT:-4000}/api/v1/health"
wait_until "Web GET / → 200" http_ok "http://localhost:${WEB_PORT:-3000}/"
wait_until "Web → API rewrite GET /api/v1/health → 200" http_ok "http://localhost:${WEB_PORT:-3000}/api/v1/health"

echo "----- docker compose ps -a -----"
$COMPOSE ps -a
echo "Docker runtime smoke test passed."
