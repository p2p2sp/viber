DoD.1 (backtick-wrapped Verification) already held through T1's plan-index.sh unwrap, so its test was green in red.log; it guards red-check end to end. DoD.4 is the header edit alone (a test would read the script as text).
The mangled check looks only at the control run section of the log, and takes the first word of the verify command literally (a leading VAR=value is the first word).
The DoD.2 test uses `bash tests/check.sh && nosuchword_t8`: the red run short-circuits on the failing check, so only the control run reaches the 127.
