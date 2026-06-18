#!/usr/bin/env bash
# Manual production deploy, run ON the VM. Mirrors .github/workflows/deploy.yml "Build and switch
# release" so we can deploy without GitHub Actions (e.g. when Actions billing is blocked).
# Usage (on the VM):  bash manual-deploy-remote.sh <git-sha>
# The code for <git-sha> must already be extracted into /opt/allvision-studio/releases/<git-sha>.
set -Eeuo pipefail

GIT_SHA="${1:?usage: manual-deploy-remote.sh <git-sha>}"
BASE=/opt/allvision-studio
RELEASE_DIR="$BASE/releases/$GIT_SHA"
ENV_FILE="$BASE/shared/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE. Create it from infra/prod/.env.example before deploying." >&2
  exit 1
fi

chmod +x "$RELEASE_DIR/scripts/sync-prod-env.sh"
"$RELEASE_DIR/scripts/sync-prod-env.sh" "$RELEASE_DIR/infra/prod/.env.example" "$ENV_FILE"

ln -sfn "$ENV_FILE" "$RELEASE_DIR/infra/prod/.env"
{
  printf 'IMAGE_TAG=%s\n' "$GIT_SHA"
  printf 'GIT_SHA=%s\n' "$GIT_SHA"
} > "$RELEASE_DIR/infra/prod/.deploy.env"
mkdir -p "$BASE/scripts"
cp "$RELEASE_DIR/scripts/rollback.sh" "$BASE/scripts/rollback.sh"
cp "$RELEASE_DIR/scripts/sync-prod-env.sh" "$BASE/scripts/sync-prod-env.sh"
chmod +x "$BASE/scripts/rollback.sh"
chmod +x "$BASE/scripts/sync-prod-env.sh"

compose_for_release() {
  local release="$1"
  shift
  local args=(-f "$release/infra/prod/docker-compose.prod.yml" --env-file "$release/infra/prod/.env")
  if [ -f "$release/infra/prod/.deploy.env" ]; then
    args+=(--env-file "$release/infra/prod/.deploy.env")
  fi
  docker compose "${args[@]}" "$@"
}

wait_for_container_healthy() {
  local container="$1"
  local status=""
  for attempt in $(seq 1 60); do
    status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"
    if [ "$status" = "healthy" ] || [ "$status" = "none" ]; then
      return 0
    fi
    sleep 2
  done
  echo "Container $container did not become healthy; last status: ${status:-missing}" >&2
  return 1
}

cleanup_stale_renamed_containers() {
  docker ps -a --format '{{.Names}}' \
    | grep -E '^[0-9a-f]{12}_allvision-studio-' \
    | xargs -r docker rm -f || true
}

cleanup_old_releases() {
  local keep_limit="$1"
  local current_release=""
  local previous_release=""
  local keep=0
  if [ -L "$BASE/current" ]; then current_release="$(readlink -f "$BASE/current")"; fi
  if [ -L "$BASE/previous" ]; then previous_release="$(readlink -f "$BASE/previous")"; fi
  while read -r _ path; do
    if { [ "$path" = "$RELEASE_DIR" ] \
      || { [ -n "$current_release" ] && [ "$path" = "$current_release" ]; } \
      || { [ -n "$previous_release" ] && [ "$path" = "$previous_release" ]; }; }; then
      continue
    fi
    keep=$((keep + 1))
    if [ "$keep" -gt "$keep_limit" ]; then
      case "$path" in
        "$BASE/releases"/*) rm -rf "$path" ;;
        *) echo "Refusing to remove unexpected path: $path" >&2; exit 1 ;;
      esac
    fi
  done < <(find "$BASE/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn)
}

cd "$RELEASE_DIR"
export BUILDKIT_PROGRESS=plain
export COMPOSE_PARALLEL_LIMIT=1
echo "Pruning old release directories before build"
cleanup_old_releases 2
echo "Pruning unused Docker build cache, stopped containers and dangling images"
docker builder prune -af || true
docker container prune -f || true
docker image prune -af || true

echo "Ensuring stateful services are running"
compose_for_release "$RELEASE_DIR" up -d postgres redis
wait_for_container_healthy allvision-studio-postgres
wait_for_container_healthy allvision-studio-redis

echo "Building runtime images for $GIT_SHA"
compose_for_release "$RELEASE_DIR" build api
compose_for_release "$RELEASE_DIR" build worker
compose_for_release "$RELEASE_DIR" build web

OLD_RELEASE=""
if [ -L "$BASE/current" ]; then OLD_RELEASE="$(readlink -f "$BASE/current")"; fi

ln -sfn "$RELEASE_DIR" "$BASE/current"
cd "$BASE/current"
echo "Recreating runtime containers for $GIT_SHA"
cleanup_stale_renamed_containers
compose_for_release "$RELEASE_DIR" up -d --force-recreate --no-deps --remove-orphans api worker web nginx

healthy=0
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:80/healthz >/dev/null \
    && curl -fsS http://127.0.0.1:80/api/ready >/dev/null; then
    healthy=1
    break
  fi
  sleep 5
done

if [ "$healthy" != "1" ]; then
  echo "New release failed healthcheck; rolling back." >&2
  if [ -n "$OLD_RELEASE" ] && [ -f "$OLD_RELEASE/infra/prod/docker-compose.prod.yml" ]; then
    ln -sfn "$OLD_RELEASE" "$BASE/current"
    cd "$OLD_RELEASE"
    cleanup_stale_renamed_containers
    compose_for_release "$OLD_RELEASE" up -d --force-recreate --no-deps --remove-orphans api worker web nginx
  fi
  echo "DEPLOY_FAILED"
  exit 1
fi

if [ -n "$OLD_RELEASE" ]; then ln -sfn "$OLD_RELEASE" "$BASE/previous"; fi

cleanup_old_releases 4
echo "DEPLOY_OK"
