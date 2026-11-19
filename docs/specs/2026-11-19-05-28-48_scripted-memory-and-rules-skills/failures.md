# Failures

- task | review-T1-1 | tests/viber/memory-map.test.ts:1021 - DoD.3: no test fails if a --removed section path stopped emptying its directory
- task | review-T3-1 | viber/skills/memory/scripts/memory-map.sh:470 - DoD.5 broken: a node that a --done dispatch deletes changes which nodes are off, because `existing` (the set the off judgement reads) is taken from the tree as it stands after the reconcile waves
- task | review-T8-1 | tests/viber/rules-map.test.ts:1146 - DoD.3 and DoD.2 keep-set filter only half pinned: no test seeds a dead rule, or an OVER-FILE rule, that is left out of the `--confirm` call, so dropping the `contains_line "$kept_set"` check on `dead_lines` (rules-map.sh:760) or the OVER-FILE branch (rules-map.sh:749) passes every case.
