#!/usr/bin/env bash
# viber / PreToolUse hook for ExitPlanMode: the wrapper that runs
# plan-gate.ts beside it. The gate's rules live in the header of plan-gate.ts.
#
# Contract:
#   stdin  : the PreToolUse payload, handed to plan-gate.ts.
#   env    : PATH must resolve `node` (22.18 or newer, which runs a .ts file).
#   stdout : what plan-gate.ts prints: nothing to let the call pass, the deny
#            decision to refuse it. Nothing when node is absent or fails.
#   exit 0 : always (fail open).

set -u
# NB: no `set -e` -- fail open requires swallowing non-zero exits.

if ! command -v node >/dev/null 2>&1; then
  # Drain the payload so the writer never hits EPIPE.
  cat >/dev/null 2>&1
  exit 0
fi
node "${0%[/\\]*}/plan-gate.ts" 2>/dev/null || true
exit 0
