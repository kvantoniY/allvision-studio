#!/usr/bin/env bash
set -Eeuo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <example-env> <target-env>" >&2
  exit 2
fi

EXAMPLE_ENV="$1"
TARGET_ENV="$2"

if [ ! -f "$EXAMPLE_ENV" ]; then
  echo "Example env not found: $EXAMPLE_ENV" >&2
  exit 1
fi

if [ ! -f "$TARGET_ENV" ]; then
  echo "Target env not found: $TARGET_ENV" >&2
  exit 1
fi

BACKUP_ENV="${TARGET_ENV}.bak.$(date -u +%Y%m%d%H%M%S)"
cp "$TARGET_ENV" "$BACKUP_ENV"

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cp "$TARGET_ENV" "$tmp"

# Existing secrets stay untouched. These operational defaults are intentionally
# managed by deploy so rate-limit behavior changes without manual prod edits.
DEPLOY_MANAGED_ENV_KEYS="${DEPLOY_MANAGED_ENV_KEYS:-AUTH_RATE_LIMIT_WINDOW_MS AUTH_REGISTER_RATE_LIMIT AUTH_LOGIN_RATE_LIMIT PASSWORD_RESET_RATE_LIMIT EMAIL_VERIFICATION_RATE_LIMIT}"

is_managed_key() {
  local key="$1"
  case " $DEPLOY_MANAGED_ENV_KEYS " in
    *" $key "*) return 0 ;;
    *) return 1 ;;
  esac
}

replace_or_append() {
  local key="$1"
  local line="$2"
  local file="$3"
  local next
  next="$(mktemp)"

  if grep -Eq "^${key}=" "$file"; then
    awk -v key="$key" -v replacement="$line" '
      BEGIN { replaced = 0 }
      $0 ~ "^" key "=" {
        if (!replaced) {
          print replacement
          replaced = 1
        }
        next
      }
      { print }
    ' "$file" > "$next"
  else
    cp "$file" "$next"
    printf '\n%s\n' "$line" >> "$next"
  fi

  mv "$next" "$file"
}

while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) continue ;;
    *=*) ;;
    *) continue ;;
  esac

  key="${line%%=*}"
  case "$key" in
    ''|*[!A-Za-z0-9_]*)
      continue
      ;;
  esac

  if is_managed_key "$key"; then
    replace_or_append "$key" "$line" "$tmp"
    echo "env: managed $key"
    continue
  fi

  if ! grep -Eq "^${key}=" "$tmp"; then
    replace_or_append "$key" "$line" "$tmp"
    echo "env: added missing $key"
  fi
done < "$EXAMPLE_ENV"

chmod --reference="$TARGET_ENV" "$tmp" 2>/dev/null || true
mv "$tmp" "$TARGET_ENV"
trap - EXIT

echo "env: synced $TARGET_ENV (backup: $BACKUP_ENV)"
