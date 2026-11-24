Settle the run branch first, before any question. Run `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh" --start` as one literal Bash line with the flags the input carries and no others: `--pr` for an input naming a `review.md` under `.temp/viber/pr-feedback/`, `--roadmap` for a `roadmap.md` the user points at, and `"<issue URL>"` last when the run is tied to an issue. The report decides; this step only shows or asks what it says.

- `mode: off` -> say nothing about branches; hand off no branch line.
- Show every `error:` and `note:` line, in the conversation's language.
- `next: settled` -> the `settled:` value stands. An entry key: show one run branch line, never opening with `Work:` or `Branch:`, holding the key, the branch (its `name:` pattern), its `base:` and its `target:` from its `entry:` line. `no-branch` ("no branch"), `current` ("build on `current:`") and `pr` ("pull request branch"): show one line saying no run branch is made and commits land on `current:`.
- `next: ask-entry` or `next: ask-base` -> ask through one `AskUserQuestion` with one option per `option:` line, described by its last field; at most four options, any further one by free text.
- `next: none` or `next: abort` -> hand off no branch line; `abort` also stops here.
- `next: errors` -> nothing is asked; hand off no branch line.
- An answer -> run its `run:` command as one literal Bash line when it is not `-`, then settle its `settle:` value, shown as `next: settled` shows it: `-` settles nothing yet (a `run:` re-running `--start` prints a new report, handled as above), `abort` stops here and runs nothing else. A `run:` that fails settles nothing.
- A `--checkout` failing with exit 5 -> show its error. When it names uncommitted changes, tell the user to commit or stash first and ask the same question again. Any other failure: ask the same report's options again without `switch`.
