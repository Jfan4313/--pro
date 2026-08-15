#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="/opt/zhijian-pro"
BACKUP_ROOT="/var/lib/zhijian-pro/deploy-backups"
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

stage_dir="$(mktemp -d /opt/zhijian-pro-stage.XXXXXX)"
archive_path="$stage_dir/release.tgz"
release_dir="$stage_dir/release"
backup_dir="$BACKUP_ROOT/$release_sha"
failed_dir="$BACKUP_ROOT/$release_sha.failed"
targets=(dist server shared src public deploy package.json package-lock.json node_modules)
service_stopped=0

cleanup() {
  rm -rf "$stage_dir"
}
trap cleanup EXIT

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
chown -R www-data:www-data "$stage_dir/npm-home"
chown -R www-data:www-data "$release_dir"
runuser -u www-data -- env HOME="$stage_dir/npm-home" npm ci --omit=dev --no-audit --no-fund
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
echo "Deployment $release_sha succeeded."
