#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/zhijian-pro"
BACKUP_ROOT="/var/lib/zhijian-pro/deploy-backups"
BACKUP_RETENTION_COUNT="${DEPLOY_BACKUP_RETENTION_COUNT:-1}"
SERVICE_NAME="zhijian-pro"
HEALTH_URL="http://127.0.0.1:8787/api/health"
ORIGINAL_COMMAND="${SSH_ORIGINAL_COMMAND:-}"

read -r action release_sha expected_checksum extra <<<"$ORIGINAL_COMMAND"
if [[ "$action" != "deploy" || -n "${extra:-}" ]]; then
  echo "Only the restricted deploy command is allowed." >&2
  exit 64
fi
if [[ ! "$release_sha" =~ ^[0-9a-f]{40}$ || ! "$expected_checksum" =~ ^[0-9a-f]{64}$ ]]; then
  echo "Invalid release metadata." >&2
  exit 64
fi

find /opt -maxdepth 1 -type d -name 'zhijian-pro-stage.*' -prune -exec rm -rf {} +
stage_dir="$(mktemp -d /opt/zhijian-pro-stage.XXXXXX)"
archive_path="$stage_dir/release.tgz"
release_dir="$stage_dir/release"
backup_dir="$BACKUP_ROOT/$release_sha"
failed_dir="$BACKUP_ROOT/$release_sha.failed"
targets=(dist server shared src public deploy package.json package-lock.json node_modules)
service_stopped=0

available_kb="$(df -Pk /opt | awk 'NR == 2 { print $4 }')"
if [[ -z "$available_kb" || "$available_kb" -lt 1048576 ]]; then
  echo "Insufficient free disk space under /opt: ${available_kb:-unknown} KB; at least 1048576 KB is required before deployment." >&2
  exit 70
fi

node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
if [[ -z "$node_major" || "$node_major" -lt 20 ]]; then
  echo "Unsupported server Node.js version: ${node_major:-unknown}; Node.js 20 LTS or newer is required." >&2
  exit 71
fi

cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

cleanup_old_backups() {
  local kept=0 backup_path
  [[ "$BACKUP_RETENTION_COUNT" =~ ^[1-9][0-9]*$ ]] || {
    echo "Invalid DEPLOY_BACKUP_RETENTION_COUNT: $BACKUP_RETENTION_COUNT" >&2
    exit 72
  }

  while IFS= read -r backup_path; do
    if (( kept < BACKUP_RETENTION_COUNT )); then
      kept=$((kept + 1))
    else
      rm -rf -- "$backup_path"
    fi
  done < <(
    find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d ! -name '*.failed' \
      -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-
  )

  find "$BACKUP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '*.failed' \
    -exec rm -rf -- {} +
}

mkdir -p "$release_dir" "$BACKUP_ROOT"
cat > "$archive_path"
actual_checksum="$(sha256sum "$archive_path" | cut -d ' ' -f1)"
if [[ "$actual_checksum" != "$expected_checksum" ]]; then
  echo "Release checksum mismatch." >&2
  exit 65
fi

tar -xzf "$archive_path" -C "$release_dir"
for required in dist/index.html server/index.js package.json package-lock.json; do
  test -f "$release_dir/$required"
done

  cd "$release_dir"
  mkdir -p "$stage_dir/npm-home"
  chmod 755 "$stage_dir" "$release_dir" "$stage_dir/npm-home"
  chown -R www-data:www-data "$stage_dir/npm-home"
  chown -R www-data:www-data "$release_dir"
  reused_dependencies=0
  if [[ ! -d node_modules && -d "$APP_DIR/node_modules" ]] && cmp -s "$release_dir/package-lock.json" "$APP_DIR/package-lock.json"; then
    # Keep the deployment small: dependencies are already present on the
    # server and are read-only at runtime, so hard-link them instead of
    # duplicating hundreds of megabytes into the staging directory.
    cp -al "$APP_DIR/node_modules" "$release_dir/node_modules"
    reused_dependencies=1
  fi
  if [[ ! -d node_modules ]]; then
    echo "Installing production dependencies (10 minute timeout)."
    timeout --signal=TERM 600 \
      runuser -u www-data -- env HOME="$stage_dir/npm-home" \
      npm ci --omit=dev --no-audit --no-fund
  fi
  if [[ "$reused_dependencies" -eq 1 ]]; then
    # Hard links are safe for JavaScript dependencies, but a native addon is
    # tied to the Node ABI it was compiled against. Give better-sqlite3 its own
    # copy before rebuilding so the running release is never modified in place.
    rm -rf node_modules/better-sqlite3
    cp -a "$APP_DIR/node_modules/better-sqlite3" node_modules/better-sqlite3
    chown -R www-data:www-data node_modules/better-sqlite3
  fi
  echo "Rebuilding better-sqlite3 for server Node.js $node_major (10 minute timeout)."
  timeout --signal=TERM 600 \
    runuser -u www-data -- env HOME="$stage_dir/npm-home" \
    npm rebuild better-sqlite3 --build-from-source --no-audit --no-fund
chown -R root:root "$release_dir"

if [[ -e "$backup_dir" || -e "$failed_dir" ]]; then
  echo "This release has already been deployed." >&2
  exit 66
fi
mkdir -p "$backup_dir"

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ "$service_stopped" -eq 1 ]]; then
    mkdir -p "$failed_dir"
    for target in "${targets[@]}"; do
      if [[ -e "$APP_DIR/$target" ]]; then
        mv "$APP_DIR/$target" "$failed_dir/$target"
      fi
      if [[ -e "$backup_dir/$target" ]]; then
        mv "$backup_dir/$target" "$APP_DIR/$target"
      fi
    done
    systemctl restart "$SERVICE_NAME" || true
  fi
  exit "$exit_code"
}
trap rollback ERR

systemctl stop "$SERVICE_NAME"
service_stopped=1

for target in "${targets[@]}"; do
  if [[ -e "$APP_DIR/$target" ]]; then
    mv "$APP_DIR/$target" "$backup_dir/$target"
  fi
  if [[ -e "$release_dir/$target" ]]; then
    mv "$release_dir/$target" "$APP_DIR/$target"
  fi
done

for target in "${targets[@]}"; do
  if [[ -e "$APP_DIR/$target" ]]; then
    chown -R root:root "$APP_DIR/$target"
  fi
done
systemctl start "$SERVICE_NAME"

ready=0
for attempt in {1..30}; do
  if curl --fail --silent "$HEALTH_URL" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "Health check failed; rolling back." >&2
  false
fi

service_stopped=0
trap - ERR
cleanup_old_backups
echo "Deployment $release_sha succeeded."
