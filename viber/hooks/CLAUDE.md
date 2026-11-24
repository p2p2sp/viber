# viber/hooks - viber's harness hooks and its hooks module

This area owns `hooks.json`, the six hook scripts under `scripts/`, the three texts they inject under `content/` (`manifest.md`, `plan-hints.md`, `node-missing.md`), and the `register.tsx` module with its logic in `write/`. It does not own `.claude/viber.yml` parsing (`../scripts/config.sh`) or the reviewer agents the plan gate waits for.

## Terms

- Plan-mode episode: the transcript lines after the last `"type":"permission-mode"` record whose mode is not `plan` and that closed an episode: one reached before plan mode was entered (no `plan` record or `EnterPlanMode` tool_use since the last close), or one that follows an `ExitPlanMode` tool_use that was not refused (no `tool_result` with its id and `"is_error":true`). `plan-gate.sh` and `plan-hints.sh` look only inside it, so a plan approved and built earlier in the session never re-arms the gate, and plan mode left and entered again by hand closes nothing.
- Planner ownership: a `Skill` tool_use for `planner` (bare or `viber:`, never another plugin's `xyz:planner`) inside the episode, or one whose own following `EnterPlanMode` lies inside it, AND a plan file opening with a frontmatter `source:` line. Anything else is an outside plan.

## Relationships

- `hooks.json` wires PreToolUse `ExitPlanMode` -> `plan-gate.sh`, PreToolUse `Bash` -> `kill-guard.sh` then `shell-guard.sh`, UserPromptSubmit -> `plan-hints.sh`, SessionStart (matcher `startup|clear|compact`) -> `session-start.sh`, SubagentStop -> `verdict-nudge.sh`, each as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.sh"` with a 10 s timeout, plus `"modules": ["./register.tsx"]`.
- `session-start.sh` reads `content/manifest.md`, `content/node-missing.md` and the `schema:` of `../skills/setup/templates/viber.yml`; `plan-hints.sh` reads `content/plan-hints.md`; `plan-gate.sh` runs `../../scripts/config.sh` (relative to itself) in the payload's `cwd`.
- `register.tsx` is the only file importing `claude-code`; `write/report-name.ts` imports nothing, so its unit test loads it directly.
- Tests: `tests/viber/write-report-name.unit.test.ts` (unit); `plan-gate.test.ts`, `plan-hints.test.ts`, `kill-guard.test.ts`, `shell-guard.test.ts`, `verdict-nudge.test.ts`, `session-start.test.ts`, each with its `<name>.critical.test.ts` (legacy tests, `tests/CLAUDE.md`).

## Contracts

- Each script's header `Contract:` block is its authoritative I/O contract; the `description` of `hooks.json` summarizes all of them.
- Every hook exits 0 and fails open: empty stdin, a parse miss, an unreadable file or a malformed awk result allows (or prints nothing). The one exception: under a planner signal, an unreadable or missing plan file keeps `planner-review` rather than loosening to the outside path. JSON is read with grep/sed/awk or bash regexes, never `jq`.
- `plan-gate.sh` arms only on a Write/Edit whose `"file_path"` has a `plans` segment and ends `.md` (either separator), inside the episode. The outside path is gated only when `config.sh` prints `planning.outside-plan-review: true`, whatever files the plan names; no `cwd` in the payload means off. It allows only when a dispatch of the chosen reviewer after the last plan write paired with `VERDICT: PASS` and the plan file's mtime is no later than that verdict's transcript timestamp plus 2 s. A dispatch carrying a `toolu_` id pairs only with a verdict line holding that id; one without an id pairs with the first verdict after it; the last completed pair wins. `VERDICT: DENIED` denies with "grant the permission". Every deny reason opens with `Next step:`.
- Review set: a planner plan whose file holds more than 12 lines that are `<!-- TASK -->` alone (counted by plain grep, code fences not excluded) is gated on a latest PASS from `planner-spec-review`, `planner-graph-review` and task reviewers whose `tasks: T<a>-T<b>` prompt lines cover every task; a `planner-review` PASS counts for nothing there, and a plan of 12 tasks or fewer or one the gate cannot read keeps `planner-review`. The dispatches of the episode are tracked together: a verdict carrying a tracked id pairs with that dispatch in any order, an id-less verdict with the earliest open id-less one, the latest completed pair deciding per member and per task. A plan write closes every open dispatch; made while no member holds a FAIL it voids every verdict before it, made while one does (the fix of a finding) it keeps the PASS of the others, the gate never checking that the fix left their part alone (`review-round.sh` sends those members again). Refusals come in the order missing member, DENIED, FAIL, plan touched after the earliest deciding verdict that followed its last write; the last three name the whole set, slices of 8 over 1..n, the cut the review lines of `scripts/plan-index.sh` print too: one edit changes both.
- `session-start.sh` puts `manifest.md` verbatim into `additionalContext`; wrapping markers or a preamble belong in `manifest.md`, never in the script. The banner `viber loaded <version>` goes in the top-level `systemMessage`, shown to the user and never to the model; `<version>` is the basename of `CLAUDE_PLUGIN_ROOT`, `dev` when unset. The schema note compares the column-0 `schema:` of the project's `.claude/viber.yml` (git top level of `cwd`, else `cwd`) with the template's.
- The Node check of `session-start.sh` reads `node -v` once: usable is `v22.18` or newer; no `node`, an older one or an output not shaped `v<major>.<minor>...` is no Node. Then the banner ends ` - Node.js 22.18 or newer is required, found <node -v output | none>` and `additionalContext` opens with `content/node-missing.md` (the text that makes every viber skill answer with one refusal line), a blank line, then the manifest; with no readable manifest the refusal text is injected alone, with no readable `node-missing.md` the note still prints and the manifest alone is injected. With a usable Node the output is unchanged.
- `plan-hints.sh` prints only when stdin has `"permission_mode":"plan"`, and stays silent once the episode shows a `planner`, `intent` or `fixer` Skill tool_use or a typed `/viber:intent` or `/viber:fixer` command.
- `register.tsx` holds one `tool.call` handler, on `Write`: it runs `next(e)` first, and a handler error falls back to `next(e)` through `.catch`. The Write rescue fires only when all hold: the call came from an agent, it errored with text containing `Subagents should return findings as text`, the basename matches `^(report|summary|findings|analysis).*\.md$` (any case), the agent's type starts `viber:`, and the path is absolute, holds no `.` or `..` segment and lies under the session root (compared case-insensitively on a drive letter).

## Commands

- Unit tests of the module logic: `node --test tests/viber/write-report-name.unit.test.ts`

## Change together

- The episode window awk and the planner `Skill`/`EnterPlanMode` awk: `plan-gate.sh` and `plan-hints.sh` (the hint's copy widened to `intent`, `fixer` and their typed commands). A change on one side alone silently disarms the other.
- The `json_str` helper: `plan-gate.sh`, `plan-hints.sh`, `session-start.sh`.
- The Node requirement: the banner note and `content/node-missing.md` carry the same `Node.js 22.18` as `README.md`, `../README.md` and `help.html` (`tools/lint/data/node-requirement.ts`).
- The verdict regex in `plan-gate.sh`: the review set awk, the `pair_raw` awk and the `verdict_value` awk must stay identical, or a quoted `VERDICT: PASS is not...` ahead of the real FAIL reads as a pass.
- `plan-gate.sh`'s `dispatch_with` text, the set dispatch text of its deny messages and the input each reviewer expects: `../agents/planner-review.md` (plan path, `refs:`, `memory:`, `input:` as a summary file path, the summary text or a bug diagnosis), `../agents/planner-spec-review.md`, `../agents/planner-graph-review.md`, `../agents/planner-task-review.md` (`tasks:`) and `../agents/outside-plan-review.md` (plan path, the user's goal).
- The code allowed before a plan is approved: the first rule of `content/manifest.md` and Law 3 of `../skills/fixer/SKILL.md` (the reproduction test and its temporary instrumentation).
- A hook's behavior and the `description` string of `hooks.json`; the outside plan review rule also in `content/plan-hints.md`.

## Traps

- A transcript `"type":"api-request-blob"` record replays whole messages, a `VERDICT:` line or a Skill call included, and reads as a live event: every transcript scan of `plan-gate.sh` and `plan-hints.sh` skips it, so a new scan must too.
- No hook script uses `set -e`: fail-open needs every non-zero exit swallowed. Each awk result is checked for its numeric shape before use, because a broken awk on PATH must allow, never deny.
- `systemMessage` nested inside `hookSpecificOutput` is silently ignored by Claude Code: it must stay top-level.
- `resume` is excluded by the `hooks.json` matcher, not by `session-start.sh`; SessionStart never fires for subagents.
- `session-start.sh` runs on bash alone and calls `node` only to read its version: a missing Node is what it reports, so it must never need one.
- Claude Code can flush the old permission mode mid-turn between the planner's Skill call and its `EnterPlanMode`, putting the Skill line before the episode start: that is why the following `EnterPlanMode` also counts, ended early by a user prompt or a plan-mode record.
- Any write to the plan after its PASS voids it, applying a Minor finding included: for `planner-review` through the last-write scan and the mtime check, for the review set because a write with no member at FAIL voids every verdict.
- A refused planner leaves `plan-hints.sh` silent for the rest of the episode: it runs before any plan file exists, so it cannot check the frontmatter.
- Plan mode left by hand keeps the episode open until an `ExitPlanMode` is not refused: a plan written before the user switched the mode still needs its review, and a planner, intent or fixer call from before still silences the hint.
- The Write rescue keys on the harness guard's literal error text: a reworded guard disables it silently.

## Sections

- Read `CLAUDE.guards.md` before editing `kill-guard.sh`, `shell-guard.sh` or `verdict-nudge.sh`.
