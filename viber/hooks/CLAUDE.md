# viber/hooks - viber's harness hooks and its hooks module

This area owns `hooks.json`, the seven hook scripts under `scripts/` with the one entry `file-guard.ts` beside them, the three texts they inject under `content/` (`manifest.md`, `plan-hints.md`, `node-missing.md`), and the `register.tsx` module with its logic in `write/`. It does not own `.claude/viber.yml` parsing (`../scripts/config.sh`), the core of the file guard (`../lib/file-guard.ts`) or the reviewer agents the plan gate waits for.

## Terms

- Plan-mode episode: the transcript lines after the last `"type":"permission-mode"` record whose mode is not `plan` and that closed an episode: one reached before plan mode was entered (no `plan` record or `EnterPlanMode` tool_use since the last close), or one that follows an `ExitPlanMode` tool_use that was not refused (no `tool_result` with its id and `"is_error":true`). `plan-gate.sh` and `plan-hints.sh` look only inside it, so a plan approved and built earlier in the session never re-arms the gate, and plan mode left and entered again by hand closes nothing.
- Planner ownership: a `Skill` tool_use for `planner` (bare or `viber:`, never another plugin's `xyz:planner`) inside the episode, or one whose own following `EnterPlanMode` lies inside it, AND a plan file opening with a frontmatter `source:` line. Anything else is an outside plan.

## Relationships

- `hooks.json` wires PreToolUse `ExitPlanMode` -> `plan-gate.sh`, PreToolUse `Bash` -> `kill-guard.sh` then `shell-guard.sh`, PreToolUse `Edit|Write` -> `file-guard.sh`, UserPromptSubmit -> `plan-hints.sh`, SessionStart (matcher `startup|clear|compact`) -> `session-start.sh`, SubagentStop -> `verdict-nudge.sh`, each as `bash "${CLAUDE_PLUGIN_ROOT}/hooks/scripts/<name>.sh"` with a 10 s timeout, plus `"modules": ["./register.tsx"]`.
- `session-start.sh` reads `content/manifest.md`, `content/node-missing.md` and the `schema:` of `../skills/setup/templates/viber.yml`; `plan-hints.sh` reads `content/plan-hints.md`; `plan-gate.sh` runs `../../scripts/config.sh` (relative to itself) in the payload's `cwd`, for an outside plan only.
- `file-guard.sh` is a wrapper: for a `viber:task-coder` call alone it pipes stdin to `node` on `scripts/file-guard.ts` beside it, which runs `runFileGuard` of `../lib/file-guard.ts` and prints its answer. It is the only hook that starts `node` to decide.
- `register.tsx` is the only file importing `claude-code`; `write/report-name.ts` imports nothing, so its unit test loads it directly.
- Tests: `tests/viber/write-report-name.unit.test.ts` and `tests/viber/lib/file-guard.unit.test.ts` (unit); `plan-gate.test.ts`, `plan-hints.test.ts`, `kill-guard.test.ts`, `shell-guard.test.ts`, `verdict-nudge.test.ts`, `session-start.test.ts`, each with its `<name>.critical.test.ts` (legacy tests, `tests/CLAUDE.md`). `file-guard.sh` has no legacy file: `tests/viber/guard-prose.unit.test.ts` reads its filter and its `hooks.json` entry as text.

## Contracts

- Each script's header `Contract:` block is its authoritative I/O contract (`file-guard.ts` holds the guard's); the `description` of `hooks.json` summarizes all of them.
- Every hook exits 0 and fails open: empty stdin, a parse miss, an unreadable file or a malformed awk result allows (or prints nothing). The one exception: under a planner signal, an unreadable or missing plan file keeps `plan-judge` rather than loosening to the outside path. The bash hooks read JSON with grep/sed/awk or bash regexes, never `jq`.
- `plan-gate.sh` arms only on a Write/Edit whose `"file_path"` has a `plans` segment and ends `.md` (either separator), inside the episode; that write alone names the plan file. The reviewer is `viber:plan-judge` under planner ownership, else `viber:outside-plan-review`, and the outside path is gated only when `config.sh` prints `planning.outside-plan-review: true`, whatever files the plan names; no `cwd` in the payload means off. A verdict of the other reviewer never counts.
- The gate asks for a trace of the review, never for the reviewed text: of the plan file it reads the frontmatter alone. With `V` the verdict of the last completed (dispatch, verdict) pair of the reviewer inside the episode, it denies in three cases only, every reason opening with `Next step:`:
  - no pair completed, the reviewer never dispatched or its dispatch with no verdict yet ("review the plan");
  - `V` is `DENIED` and no `Bash` call of `plan-build.sh` with `judged`, a `plans/....md` path and the word `DENIED` after it follows the verdict line ("grant the permission"); an outside plan has no such call, so there a `DENIED` denies until a new review returns;
  - `V` is `FAIL` and nothing answers it after the verdict line ("answer the review"): a Write/Edit of a `plans/....md` file, a `Bash` call of `plan-build.sh` with `apply` or `open` naming such a path, or one with `judged`, that path and the word `none` after it. The `none` call answers no `FAIL` of round 1 (a dispatch prompt holding `round: 1`): there the script ends on `STOP:`.
- Everything else allows: a `PASS` whatever is written to the plan after it, an answered `DENIED` or `FAIL`, a verdict value that cannot be read back. A `judged` call with `PASS` or `FAIL` answers nothing. An answering `Bash` call needs `"name":"Bash"` unescaped on its line; the subcommand and the word after the plan path may stand in quotes of either kind or in none.
- Pairing: a dispatch carrying a `toolu_` id pairs only with a verdict line holding that id; one without an id pairs with the first verdict after it; the last completed pair wins, so a later dispatch still running leaves the earlier completed pair deciding. A pair counts only past the last assembly of a plan surveyed anew: a `plan-build.sh survey` call, then a tool_result opening on `assembled: <n> tasks`.
- `file-guard.sh` refuses, inside `viber:task-coder` alone, the `Edit` or `Write` of a file another task of the run neither done nor skipped claims, unless the coder's own task claims it too; it is silent for every other caller and never answers `allow`. What it reads and whom it names: `CLAUDE.guards.md`.
- `plan-hints.sh` prints `content/plan-hints.md` only when stdin has `"permission_mode":"plan"`, and stays silent once the episode shows a `planner`, `intent` or `fixer` Skill tool_use or a typed `/viber:intent` or `/viber:fixer` command. The hint is the whole rule of an outside plan review, held by the session and by no script: one `outside-plan-review` dispatch, at most one more after a `FAIL`, what is left under `## Open items`, then `ExitPlanMode` with no question about a finding.
- `register.tsx` holds one `tool.call` handler, on `Write`: it runs `next(e)` first, and a handler error falls back to `next(e)` through `.catch`. The Write rescue fires only when all hold: the call came from an agent, it errored with text containing `Subagents should return findings as text`, the basename matches `^(report|summary|findings|analysis).*\.md$` (any case), the agent's type starts `viber:`, and the path is absolute, holds no `.` or `..` segment and lies under the session root (compared case-insensitively on a drive letter).

## Commands

- Unit tests of the module logic: `node --test tests/viber/write-report-name.unit.test.ts`
- The file guard: `node --test tests/viber/lib/file-guard.unit.test.ts`

## Change together

- The episode window awk and the planner `Skill`/`EnterPlanMode` awk: `plan-gate.sh` and `plan-hints.sh` (the hint's copy widened to `intent`, `fixer` and their typed commands). A change on one side alone silently disarms the other.
- The `json_str` helper: `plan-gate.sh`, `plan-hints.sh`, `session-start.sh`.
- The verdict regex in `plan-gate.sh`: the `pair_raw` awk and the `verdict_value` awk must stay identical, or a quoted `VERDICT: PASS is not...` ahead of the real FAIL reads as a pass.
- The answering calls: the subcommands `judged`, `apply` and `open` of `../skills/planner/scripts/plan-build.sh`, the verdict words `DENIED` and `none` its `judged` takes, and the literal call lines of `../skills/planner/SKILL.md`, every argument double-quoted, are what the gate's patterns match, with the `round: <r>` line of the judge block and the `assembled:` line of `assemble`; `judged` answers the `FAIL` report of a file it cannot use with `NEXT: judged | none`, the call the gate then finds.
- `plan-gate.sh`'s `steps_first` text (the planner steps its missing-review refusal names ahead of the dispatch) and the steps of `../skills/planner/SKILL.md`.
- `plan-gate.sh`'s `dispatch_with` and `answer_with` texts and what each reviewer takes and returns: `../agents/plan-judge.md` (the block `plan-build.sh judge` prints; its verdict goes to `plan-build.sh judged`) and `../agents/outside-plan-review.md` (the plan path and the user's goal, on its second review the `CRITICAL:` lines of the first and what was changed for each; `CRITICAL:` and `NOTE:` lines), with `content/plan-hints.md`.
- The code allowed before a plan is approved: the first rule of `content/manifest.md` and Law 3 of `../skills/fixer/SKILL.md` (the reproduction test and its temporary instrumentation).
- A hook's behavior and the `description` string of `hooks.json`; the outside plan review rule also in `content/plan-hints.md`.

## Traps

- A transcript `"type":"api-request-blob"` record replays whole messages, a `VERDICT:` line or a Skill call included, and reads as a live event: every transcript scan of `plan-gate.sh` and `plan-hints.sh` skips it, so a new scan must too.
- No hook script uses `set -e`: fail-open needs every non-zero exit swallowed. Each awk result is checked for its numeric shape before use, because a broken awk on PATH must allow, never deny.
- Claude Code can flush the old permission mode mid-turn between the planner's Skill call and its `EnterPlanMode`, putting the Skill line before the episode start: that is why the following `EnterPlanMode` also counts, ended early by a user prompt or a plan-mode record.
- The approved plan is by design not the reviewed text (at most two review rounds, the fix of the second checked by script alone), so a `PASS` stands through every later write to the plan, a plan assembled anew after a `survey` excepted.
- An answering call counts from its call line alone: a `plan-build.sh apply` the script refused still answers a `FAIL`, as a failed `Edit` of the plan does.
- The file guard identifies the coder's task from the first record of the coder's own transcript and allows the edit whenever it cannot tell: no `agent_id`, no transcript at any path it tries, a first record of another shape or agent, no `task:` line, a task file that does not exist, a run with no `status.md`, any unreadable input. Its unit test runs on fakes with payloads it builds itself, the `C:\`, `C:/` and `/c/` spellings of one path among them: the values a real payload carries (`agent_id`, `agent_type`, `transcript_path`, `agent_transcript_path`), whether the transcript record is on disk before the coder's first edit, and the path spelling a real payload carries on Windows are covered by no test. A guard that cannot find the task is silent, so a changed payload or transcript layout shows only as collisions it no longer stops.
- A refused planner leaves `plan-hints.sh` silent for the rest of the episode: it runs before any plan file exists, so it cannot check the frontmatter.
- Plan mode left by hand keeps the episode open until an `ExitPlanMode` is not refused: a plan written before the user switched the mode still needs its review, and a planner, intent or fixer call from before still silences the hint.
- The Write rescue keys on the harness guard's literal error text: a reworded guard disables it silently.

## Sections

- Read `CLAUDE.guards.md` before editing `kill-guard.sh`, `shell-guard.sh`, `verdict-nudge.sh`, `file-guard.sh` or `scripts/file-guard.ts`.
- Read `CLAUDE.session-start.md` before editing `session-start.sh`, `content/manifest.md` or `content/node-missing.md`.
