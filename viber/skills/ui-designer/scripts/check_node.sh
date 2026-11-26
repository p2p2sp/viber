#!/bin/sh
# viber - skills/ui-designer/scripts/check_node.sh
# Node.js runtime preflight for the ui-designer skill, which runs a
# bundled .ts step. The bundled scripts are TypeScript executed directly by Node's
# native type stripping (no build step, no npm install), which needs Node >= 22.6
# (behind --experimental-strip-types) or >= 23.6 (on by default). Resolves the exact
# command able to run them so the skill can substitute it (or skip the step with a
# clear note) before any `node …` step - instead of the agent hitting a raw
# `node: command not found` or an unsupported-syntax error on an old Node.
#
# IN : (no args)
# OUT: exactly one line on stdout -
#        NODE_OK <cmd>   <cmd> is `node` (>= 23.6: type stripping is on by default)
#                        or `node --experimental-strip-types` (22.6 <= version < 23.6)
#        NODE_MISSING    node absent, version unparsable, or version < 22.6
#      ALWAYS exits 0 (fail-open: a missing runtime must never break skill load).
set -eu

command -v node >/dev/null 2>&1 || { echo "NODE_MISSING"; exit 0; }
ver=$(node -v 2>/dev/null) || { echo "NODE_MISSING"; exit 0; }
ver=${ver#v}
major=${ver%%.*}
rest=${ver#*.}
minor=${rest%%.*}
case "$major" in *[!0-9]*|"") echo "NODE_MISSING"; exit 0 ;; esac
case "$minor" in *[!0-9]*|"") minor=0 ;; esac

if [ "$major" -ge 24 ] || { [ "$major" -eq 23 ] && [ "$minor" -ge 6 ]; }; then
  echo "NODE_OK node"
elif [ "$major" -eq 23 ] || { [ "$major" -eq 22 ] && [ "$minor" -ge 6 ]; }; then
  echo "NODE_OK node --experimental-strip-types"
else
  echo "NODE_MISSING"
fi
exit 0
