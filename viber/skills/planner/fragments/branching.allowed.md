Once `plan-index.sh` has passed, run `"${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh" --branch "<plan-path>"`, adding `--work <value>` for an input `Work:` line and `--name <value>` for an input `Branch:` line. Act on its lines from `next:` on:

- `next: write`: write `work:` into the frontmatter's `work:` key (no key for `-`) and `branch:` into its `branch:` key, then show `show:`.
- `next: ask`: one `AskUserQuestion`, one option per `option: <answer> | <work> | <branch> | <effect>` line with its effect as the description, every `note:` in the question; write the chosen option's work and branch as above and show its effect. `stop` ends the planner with no review, no hand-off and nothing landed.
- `next: ask-entry`: one `AskUserQuestion` for the work entry, the first four `option:` lines (the first is suggested), others by free text; run the command again adding `--entry <chosen key>` and act on it the same way.
- `next: errors`: show the `error:` lines and record nothing.
- `next: stop`: show the `note:` and end the planner with no review, no hand-off and nothing landed.

Show every `show:` or effect line once, in the conversation's language, never opening with `Work:` or `Branch:`.
