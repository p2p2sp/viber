#!/usr/bin/env bash
# release.sh - tag-driven version bump for the viber plugin.
#
# Computes the next MAJOR.MINOR.PATCH version (no "v" prefix) from the highest
# existing git tag, syncs it into the subdir plugin manifest's .version
# (viber/.claude-plugin/plugin.json -
# shared version, one tag namespace), commits the bump (`chore(bump): …`, no
# [skip ci]), creates + pushes the tag, then publishes a GitHub Release whose
# notes are built from the commits since the previous tag (grouped by conventional
# type) with GitHub's auto-generated notes appended.
#
# The bump commit (`chore(bump): …`) is pushed to main; no workflow runs on
# push, so there is no bump loop to guard against. This script runs only via
# manual workflow_dispatch (release-version.yml).
#
# Usage:    .github/scripts/release.sh <major|minor|patch>
# Source of truth: highest tag matching ^[0-9]+\.[0-9]+\.[0-9]+$ ; none => seed 0.1.0
#                  (seed taken as-is, no bump applied on the very first run).
# Requires: checkout with fetch-depth: 0 (+ tags), permissions: contents: write,
#           GH_TOKEN in env (for `gh release create`), jq + gh (preinstalled on
#           ubuntu-latest).
# Outputs:  new version on stdout and as `version=<v>` to $GITHUB_OUTPUT.
set -euo pipefail

# shellcheck source=/dev/null
. "$(dirname "${BASH_SOURCE[0]}")/retry.sh"

part="${1:?usage: release.sh <major|minor|patch>}"
manifests=(viber/.claude-plugin/plugin.json)
seed="0.1.0"

current="$(git tag --list --sort=-v:refname \
  | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | head -n1 || true)"

if [ -z "$current" ]; then
  new="$seed"
else
  IFS=. read -r MA MI PA <<<"$current"
  case "$part" in
    major) new="$((MA + 1)).0.0" ;;
    minor) new="${MA}.$((MI + 1)).0" ;;
    patch) new="${MA}.${MI}.$((PA + 1))" ;;
    *) echo "release.sh: invalid part '$part'" >&2; exit 2 ;;
  esac
fi

if git rev-parse -q --verify "refs/tags/$new" >/dev/null; then
  echo "release.sh: tag $new already exists" >&2; exit 3
fi

git config user.name  "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

# 1. Write the new version into the plugin manifest.
for manifest in "${manifests[@]}"; do
  tmp="$(mktemp)"
  jq --arg v "$new" '.version = $v' "$manifest" >"$tmp"
  mv "$tmp" "$manifest"
done

# 2. Commit the bump FIRST - this commit is what the release tag points at.
#    The no-diff branch is recovery only: a prior run already committed this exact
#    version but failed before tagging, so re-tag that commit instead of fabricating
#    an empty one (rerun-safe). A diff in ANY manifest counts as a change, so the
#    re-tag path fires only when NO manifest changed.
git add "${manifests[@]}"
if git diff --cached --quiet; then
  echo "release.sh: $new already committed; re-tagging existing release commit" >&2
else
  git commit -m "chore(bump): bump version to $new"
  retry git push origin "HEAD:${GITHUB_REF_NAME:-main}"
fi

# 3. Only now create + push the release tag, on the committed bump.
git tag "$new"
retry git push origin "refs/tags/$new"

# 4. Build a commit-based changelog: previous version tag → the just-tagged bump
#    commit. First release (no previous tag) → full history. The bump commit itself
#    is excluded. Conventional types group into Features / Fixes / Other; an optional
#    "T<n>: " task prefix is stripped before reading the type.
if [ -n "$current" ]; then range="${current}..HEAD"; else range="HEAD"; fi
feats=""; fixes=""; others=""
while IFS=$'\t' read -r hash subject; do
  [ -z "$subject" ] && continue
  case "$subject" in "chore(bump)"*) continue ;; esac
  core="$subject"
  [[ "$core" =~ ^T[0-9]+:\ (.*)$ ]] && core="${BASH_REMATCH[1]}"
  case "$core" in
    feat\(*|feat:*|feat!*) feats+="- ${subject} (${hash})"$'\n' ;;
    fix\(*|fix:*|fix!*)    fixes+="- ${subject} (${hash})"$'\n' ;;
    *)                     others+="- ${subject} (${hash})"$'\n' ;;
  esac
done < <(git log "$range" --pretty=format:'%h%x09%s')

body=""
[ -n "$feats" ]  && body+=$'### Features\n'"$feats"$'\n'
[ -n "$fixes" ]  && body+=$'### Fixes\n'"$fixes"$'\n'
[ -n "$others" ] && body+=$'### Other\n'"$others"$'\n'
[ -z "$body" ] && body=$'_No notable changes._\n'

# 5. Publish the GitHub Release: our commit-based notes first, GitHub's generated
#    notes appended. Re-run-safe: skip if a release for this tag already exists.
#    The notes go through a FILE, never a pipe: a body larger than the OS pipe
#    buffer (64 KiB on Linux) cannot be handed over in one write, so any gh exit
#    that does not drain stdin would SIGPIPE the writer and kill this script
#    (exit 141) under `set -o pipefail` - masking gh's own status.
#    Every retry looks for the release first: a create answered with a 5xx may
#    still have published it.
publish_release() {
  if gh release view "$new" >/dev/null 2>&1; then
    echo "release.sh: GitHub release $new already exists; skipping" >&2
  else
    gh release create "$new" \
      --title "$new" --notes-file "$notes_file" --generate-notes
  fi
}
notes_file="$(mktemp)"
trap 'rm -f "$notes_file"' EXIT
printf '%s' "$body" >"$notes_file"
retry publish_release

echo "$new"
echo "version=$new" >>"${GITHUB_OUTPUT:-/dev/null}"
