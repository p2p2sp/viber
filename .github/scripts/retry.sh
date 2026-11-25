#!/usr/bin/env bash
# retry.sh - sourced by release.sh and release-version.yml: defines `retry`, so a
# passing GitHub failure (a 5xx, a dropped connection) does not stop a release.
#
# Usage:  retry <command> [args...]
#         Runs the command up to 5 times, waiting 10, 20, 40 and 80 seconds in
#         between. Every failure is retried, so the command must be safe to repeat.
#         Returns the last attempt's exit status; its messages go to stderr.
# Env:    RETRY_DELAY - the first wait in seconds (default 10; tests pass 0).
# Cwd:    whatever the command needs; retry reads no file.
retry() {
  local attempt=1 delay="${RETRY_DELAY:-10}" status
  while true; do
    status=0
    "$@" || status=$?
    if [ "$status" -eq 0 ] || [ "$attempt" -ge 5 ]; then return "$status"; fi
    echo "retry: attempt $attempt of 5 failed with exit $status: $1; next in ${delay}s" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
  done
}
