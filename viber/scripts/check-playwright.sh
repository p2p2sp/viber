#!/usr/bin/env bash
#
# check-playwright.sh - reports whether the Playwright tooling the e2e skill
# needs is present in the host project, never installing it.
#
# It exists because the probe is a compound command (a `command -v`, a
# `--version` whose failure must not matter, and a grep over a package.json
# that may not be there), and Claude Code asks for approval on every member of
# one - which stalls the step on any permission mode that does not auto-accept
# everything. One script is ONE command to the permission engine.
#
# The single caller is the `e2e` skill's `!` preload. viber carries its own copy
# rather than reaching into another plugin: a plugin's scripts are its own, and
# an install of viber alone must still probe.
#
# Contract:
#   argv   : none.
#   cwd    : any directory inside the host project - the repository root is
#            resolved here for the package.json lookup. Outside a repository,
#            the cwd is the base.
#   env    : none.
#   file   : <repo root>/package.json plus every OTHER package.json `git
#            ls-files -z` reports as tracked from the repo root (nested, any
#            depth, any path spelling - none is quoted). Untracked ones (gitignored, new-but-unstaged) are never
#            read. Outside a repository - or wherever `git` itself is not on
#            PATH - only the root package.json is checked, matching the prior
#            behaviour. Absent, untracked or unreadable -> "@playwright/test:
#            not found".
#   stdout : exactly two lines, always in this order -
#              "playwright-cli: found <version>"         - `command -v
#                playwright-cli` succeeds and `playwright-cli --version` prints
#                a first line, or
#              "playwright-cli: found (version unknown)" - `command -v`
#                succeeds but `--version` fails or prints nothing, or
#              "playwright-cli: not found"               - not on PATH;
#              "@playwright/test: found"                 - the root package.json
#                or any tracked nested one names `"@playwright/test"`, or
#              "@playwright/test: not found"             - otherwise.
#   exit   : ALWAYS 0. It reports, it installs nothing, and a non-zero exit in a
#            `!` preload would abort the whole skill load.
#
set -u

root="$(git rev-parse --show-toplevel 2>/dev/null)" || root="$(pwd)"

if command -v playwright-cli >/dev/null 2>&1; then
  version_output="$(playwright-cli --version 2>/dev/null)"
  version_status=$?
  version="$(printf '%s\n' "$version_output" | head -n1)"
  if [ "$version_status" -eq 0 ] && [ -n "$version" ]; then
    echo "playwright-cli: found ${version}"
  else
    echo "playwright-cli: found (version unknown)"
  fi
else
  echo "playwright-cli: not found"
fi

found="not found"
if [ -f "${root}/package.json" ] && grep -q '"@playwright/test"' "${root}/package.json" 2>/dev/null; then
  found="found"
fi

if [ "$found" = "not found" ] && command -v git >/dev/null 2>&1; then
  # -z lists every path verbatim: the default listing wraps a non-ASCII or
  # special-character path in quotes with octal escapes, which names no file.
  while IFS= read -r -d '' nested; do
    case "$nested" in
      package.json | */package.json) ;;
      *) continue ;;
    esac
    if grep -q '"@playwright/test"' "${root}/${nested}" 2>/dev/null; then
      found="found"
      break
    fi
  done < <(git -C "$root" ls-files -z 2>/dev/null)
fi

echo "@playwright/test: ${found}"

exit 0
