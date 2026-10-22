# Review T1 - round 1

Verification `node --test tests/viber/config.test.ts`: 200 pass, 0 fail (matches). The red log shows the new `--questions` cases failing. DoD.1 to DoD.6 are implemented in `viber/scripts/config.sh` (`questions_prog`, the `local_prog` `planning.questions-per-round` branch, the `--questions` exit before the block) and each one has a test that pins it.

## Blocking

1. tests/viber/config.test.ts:1572-1580 - the parameterised test "--questions leaves the shared 3 for an invalid local value (...) and the block names the key under ignored" makes two acts in one body: it runs `config.sh --questions` and asserts `3`, then runs `config.sh` with no argument and asserts the `# local:` line. That breaks the test-strategy rule "Every test ... carries one act: several actions in one body means several tests" (blocking). Fix: split it into two parameterised tests over the same rows. One asserts `--questions` prints `3` for the invalid local value (DoD.5, first half). The other asserts the no-argument block's `# local: none | ignored: planning.questions-per-round` line (DoD.5, second half).

## Minor

1. viber/scripts/config.sh:394 - the `local_prog` comment still says "one of the four overridable keys". There are five now. Change it to "five".
2. viber/scripts/config.sh header (the `file :` paragraph for viber.local.yml) - the reflowed line "leaves the shared value. The min-above-max reset runs on the merged range." runs past the width of the surrounding comment lines. Rewrap it.
