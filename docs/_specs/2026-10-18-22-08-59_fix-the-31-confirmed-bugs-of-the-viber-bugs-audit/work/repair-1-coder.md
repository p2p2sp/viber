Root cause: LC_ALL=C was already set, yet bash 3.2 (macOS /bin/bash) still took ~1.8 s on an 11 KB command because ${var//\\\"/"} rescans the string per match (about 1000 matches); under the full suite's load that passed 10 s.
Fix: the JSON unescape of kill-guard.sh and verdict-nudge.sh is one left-to-right awk pass (value via ENVIRON, no apostrophe in the program); 25 ms now.
Same unescape in shell-guard.sh (lines 103-113) still uses ${var//} and has the same quadratic cost: not in this report, left unfixed.
