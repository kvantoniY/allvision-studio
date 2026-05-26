#!/usr/bin/env sh
set -eu

BASE_DIR="${ALLVISION_BASE_DIR:-/opt/allvision-studio}"
CURRENT_LINK="$BASE_DIR/current"
PREVIOUS_LINK="$BASE_DIR/previous"

if [ ! -L "$PREVIOUS_LINK" ]; then
  echo "No previous release symlink at $PREVIOUS_LINK" >&2
  exit 1
fi

PREVIOUS_RELEASE="$(readlink -f "$PREVIOUS_LINK")"
CURRENT_RELEASE=""
if [ -L "$CURRENT_LINK" ]; then
  CURRENT_RELEASE="$(readlink -f "$CURRENT_LINK")"
fi

if [ ! -f "$PREVIOUS_RELEASE/infra/prod/docker-compose.prod.yml" ]; then
  echo "Previous release does not contain production compose file: $PREVIOUS_RELEASE" >&2
  exit 1
fi

compose_for_release() {
  release="$1"
  shift
  if [ -f "$release/infra/prod/.deploy.env" ]; then
    docker compose -f "$release/infra/prod/docker-compose.prod.yml" \
      --env-file "$release/infra/prod/.env" \
      --env-file "$release/infra/prod/.deploy.env" \
      "$@"
  else
    docker compose -f "$release/infra/prod/docker-compose.prod.yml" \
      --env-file "$release/infra/prod/.env" \
      "$@"
  fi
}

wait_for_container_healthy() {
  container="$1"
  status=""
  for _attempt in $(seq 1 60); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"
    if [ "$status" = "healthy" ] || [ "$status" = "none" ]; then
      return 0
    fi
    sleep 2
  done
  echo "Container $container did not become healthy; last status: ${status:-missing}" >&2
  return 1
}

ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
if [ -n "$CURRENT_RELEASE" ]; then
  ln -sfn "$CURRENT_RELEASE" "$PREVIOUS_LINK"
fi

compose_for_release "$PREVIOUS_RELEASE" up -d postgres redis
wait_for_container_healthy allvision-studio-postgres
wait_for_container_healthy allvision-studio-redis
compose_for_release "$PREVIOUS_RELEASE" up -d --force-recreate --no-deps --remove-orphans api worker web nginx
echo "Rolled back to $PREVIOUS_RELEASE"
