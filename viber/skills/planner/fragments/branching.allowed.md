Once `assemble`, or the `apply` of the last fix step after it, printed `NEXT: judge`, run `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh" --branch "<plan-path>"`, adding `--work <value>` for an input `Work:` line and `--name <value>` for an input `Branch:` line. Act on its lines from `next:` on:

- `next: write`: write `work:` into the frontmatter's `work:` key (no key for `-`) and `branch:` into its `branch:` key, through `Edit` after a `Read` of the plan's frontmatter alone (its first lines down to the second `---`), then show `show:`.
- `next: kept`: leave the keys as they stand and show nothing.
- `next: ask`, `next: ask-entry`: one `AskUserQuestion`, one option per `option: <answer> | <work> | <branch> | run: <command> | settle: <value> | <effect>` line with its effect as the description, every `note:` in the question; for `ask-entry` the first four options (the first is suggested), others by free text. Act on the chosen option: run its `run:` command when it is not `-` and act on its report as on this step's answer; `settle: write` writes the option's work and branch as above and shows its effect; `settle: stop` ends the planner with no review, no hand-off and nothing landed.
- `next: errors`: show the `error:` lines and record nothing.
- `next: stop`: show the `note:` and end the planner with no review, no hand-off and nothing landed.

Show every `show:` or effect line once, in the conversation's language, never opening with `Work:` or `Branch:`.
