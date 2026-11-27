# viber plugin

## Scripts

- A skill runs a bundled script only as one literal Bash line matching its `allowed-tools` prefix `Bash(${CLAUDE_SKILL_DIR}/scripts/<name>.sh:*)` or `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/<name>.sh:*)`: no interpreter word, `cd`, variable or chain. A new or renamed script needs that frontmatter line.
- A script that prints a command for the model spells the plugin root as it was invoked, never resolved: `plugin_root_of` of the sourced `scripts/plugin-root.sh`, or `rootAbove` of the commit skill's `lib/plugin-root.ts`. A resolved or `C:\` path misses the `allowed-tools` prefix.
- A `.sh` beside a `.ts` is only `exec node "${0%[/\\]*}/<name>.ts"`: logic sits in the `.ts` entry and its `lib/`. The `Contract:` header of each entry is its contract: change it with the behaviour.
- `scripts/` holds what several skills share (`arg-kind`, `pr-*`), reached through `${CLAUDE_PLUGIN_ROOT}`.
- Hooks fail open, always exit 0: `plan-gate.sh` passes the call with no `node`; `session-start.sh` keeps `systemMessage` top-level (nested in `hookSpecificOutput` it is ignored).
- `bootstrap.sh` exits 0 always: a non-zero `!` preload aborts the skill load.

## Config and temp files

- `.claude/viber.yml` has no YAML parser: `linesOf` in `spec-implementor/scripts/lib/build-config.ts` (keys by indent, ` #` comments cut, quotes stripped), the awk of `spec/scripts/spec-paths.sh` and the `^schema:` grep of `session-start.sh`. Flow style, anchors and multi-line values are not read. Only `bootstrap.sh` (a seed copy) and `extension.ts` write it.
- `session-start.sh` compares the project's `schema:` with that of `skills/setup/templates/viber.yml` and tells the user to align or update.
- `branching:` of the setup template has no reader in the plugin.
- Setup ignores only `.temp/`: scripts keep run state in `.temp/viber/<id>/`, skills their scratch files in `.temp/viber/<kind>/`. The build refuses a coder's `FILES` path under `.temp/` and never reports `.temp/` as left uncommitted.

## Cross-skill code

- Beyond `build.ts`: `extension.ts` imports `AGENT_NAME`, `configPath`, `extensionMap` and `e2e-run.ts` imports `configPath`, `directoriesOf` from spec-implementor's `build-config.ts`; `rules-run.ts` imports `build-rules.ts`, the `Ctx` of `build-state.ts` and the planner's `globRegex`.
- `globRegex` (`planner/scripts/lib/plan-order.ts`) matches both plan `Files` globs and rule `paths:` globs: a change moves task order and rule matching together.

## Pull request feedback

- `pr-feedback` writes `.temp/viber/pr-feedback/<N>/review.md` (`## <k> - <problem|question> - <where>`, `- Comment: <key>`, `- Reply file: <path>`), which `pr-reply.sh --list` and `--all` read. Change the skill and the script together.
- `pr-reply.sh` opens each reply with `<!-- viber:pr-feedback <key> -->`; `pr-threads.sh` skips items answered by that marker. Change both together.
- The `pr` shapes of `lib/arg-kind.ts` must equal those `pr-threads.sh` and `pr-reply.sh` accept. Its `issue` mode has no caller; the `issue-facts.sh` its header names does not exist.
