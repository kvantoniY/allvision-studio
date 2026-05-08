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

if [ -n "$CURRENT_RELEASE" ] && [ -f "$CURRENT_RELEASE/infra/prod/docker-compose.prod.yml" ]; then
  compose_for_release "$CURRENT_RELEASE" down || true
fi

ln -sfn "$PREVIOUS_RELEASE" "$CURRENT_LINK"
if [ -n "$CURRENT_RELEASE" ]; then
  ln -sfn "$CURRENT_RELEASE" "$PREVIOUS_LINK"
fi

compose_for_release "$PREVIOUS_RELEASE" up -d
echo "Rolled back to $PREVIOUS_RELEASE"
