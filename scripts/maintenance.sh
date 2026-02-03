#!/usr/bin/env bash

# Maintenance script for container startup.
# Best-effort checks and lightweight repairs without relying on network access.

log() {
  printf '%s\n' "$*"
}

warn() {
  printf 'WARN: %s\n' "$*" >&2
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
}

get_project_root() {
  local script_dir
  script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  cd -- "${script_dir}/.." || return 1
  pwd
}

check_command() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    fail "Required command not found: $name"
    return 1
  fi
  return 0
}

check_node_version() {
  local raw version major
  raw=$(node -v 2>/dev/null)
  version=${raw#v}
  major=${version%%.*}
  if [ -z "$major" ] || [ "$major" -lt 20 ]; then
    fail "Node.js >= 20 is required (current: ${raw:-unknown})."
    return 1
  fi
  return 0
}

ensure_node_modules() {
  local project_root="$1"
  if [ ! -d "${project_root}/node_modules" ]; then
    if [ "${CCSTATUSLINE_BOOTSTRAP:-0}" = "1" ]; then
      log "node_modules missing. Running npm ci..."
      if ! npm ci; then
        fail "npm ci failed."
        return 1
      fi
    else
      fail "node_modules missing. Run: npm ci"
      return 1
    fi
  fi
  return 0
}

ensure_dist() {
  local project_root="$1"
  local dist_entry="${project_root}/dist/index.js"
  if [ ! -f "$dist_entry" ]; then
    log "dist/index.js missing. Running npm run build..."
    if ! npm run build; then
      fail "build failed."
      return 1
    fi
  fi
  if [ -f "$dist_entry" ]; then
    chmod u+x "$dist_entry" 2>/dev/null || true
  fi
  return 0
}

ensure_cache_dir() {
  local cache_dir="${CCSTATUSLINE_CACHE_DIR:-$HOME/.cache/cc-statusline-custom}"
  if [ -z "$cache_dir" ]; then
    fail "Cache directory is empty."
    return 1
  fi
  if [ ! -d "$cache_dir" ]; then
    if ! mkdir -p "$cache_dir"; then
      fail "Failed to create cache directory: $cache_dir"
      return 1
    fi
  fi
  chmod 700 "$cache_dir" 2>/dev/null || warn "Failed to set cache dir permissions: $cache_dir"
  return 0
}

main() {
  local project_root
  local had_error=0

  project_root=$(get_project_root)
  if [ $? -ne 0 ] || [ -z "$project_root" ]; then
    fail "Unable to resolve project root."
    exit 1
  fi

  log "cc-statusline-custom maintenance starting..."

  check_command node || had_error=1
  check_command npm || had_error=1
  check_node_version || had_error=1
  ensure_node_modules "$project_root" || had_error=1
  ensure_dist "$project_root" || had_error=1
  ensure_cache_dir || had_error=1

  if [ "$had_error" -ne 0 ]; then
    fail "Maintenance completed with errors."
    exit 1
  fi

  log "Maintenance completed."
  exit 0
}

main "$@"
