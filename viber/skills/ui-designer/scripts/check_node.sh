#!/bin/sh
# viber - skills/ui-designer/scripts/check_node.sh
# Node.js runtime preflight for the ui-designer skill, which runs a
# bundled .ts step. The bundled scripts are TypeScript executed directly by Node's
# native type stripping (no build step, no npm install), which is on by default
# from Node 22.18 on the 22 line and from 23.6 above it. Tells the skill whether
# `node` can run them, so it skips the step with a clear note instead of the agent
# hitting a raw `node: command not found` or an unsupported-syntax error on an
# old Node.
#
# IN : (no args)
# OUT: exactly one line on stdout -
#        NODE_OK node    version >= 22.18, except 23.0 to 23.5
#        NODE_MISSING    node absent, version unparsable, < 22.18, or 23.0 to 23.5
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

if [ "$major" -ge 24 ] ||
   { [ "$major" -eq 23 ] && [ "$minor" -ge 6 ]; } ||
   { [ "$major" -eq 22 ] && [ "$minor" -ge 18 ]; }; then
  echo "NODE_OK node"
else
  echo "NODE_MISSING"
fi
exit 0
