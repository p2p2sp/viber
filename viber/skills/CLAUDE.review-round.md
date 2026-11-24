# viber/skills - the planner's review round script

Read for a change to `planner/scripts/review-round.sh` or to how `planner` dispatches and re-dispatches its plan reviewers. It covers the script's directives, not the reviewers' own agent files.

## Contracts

- `planner/scripts/review-round.sh <plan> start|returned|retry-denied|override|stop` answers in `NEXT:`, `ASK:` and `STOP:` blocks, its header defining events and fields: the `NEXT: review` blocks are `planner`'s exact dispatches, a member with no verdict is redispatched once and then counts FAIL, DENIED outranks FAIL, a round after a fix dispatches with `add: previous` only the members without a PASS and those whose part of the plan (compared by `cksum`, kept per member in the state file) differs from the part they passed on, and the whole set after an `override` or when the slices changed; `start --answered` (a user's answer to a finding) also sends the readers of the `Answered:` lines (`planner-review`, `planner-spec-review`), and a round after a member returned no verdict at all carries no `add: previous`, since a reviewer given the previous findings checks the fixes alone: `plan-gate.sh` voids every verdict on a plan write made with no member at FAIL, so the two change together.
