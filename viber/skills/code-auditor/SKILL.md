---
name: code-auditor
description: Multi-agent code audit through one lens (bugs, security, web-performance, runtime-performance, tests or design) over one scope (the current diff, one directory or the whole repository), every finding verified by an independent agent. Use when the user asks to audit, review or hunt defects in code for one of those lenses or scopes, such as "audit security of my branch" or "check the tests in src/api".
user-invocable: true
disable-model-invocation: false
argument-hint: "[<lens>] [diff | diff:<sha> | <directory> | repo]"
allowed-tools: Agent, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

# Code Auditor - one lens, one scope, many agents

A run audits one scope through one lens in five phases: Frame, Map, Hunt, Verify, Synthesize. Intermediate results live in files under the run workspace, never in this context.

## Arguments

`/viber:code-auditor [<lens>] [diff | diff:<sha> | <directory> | repo]`: `$ARGUMENTS` holds up to two tokens, each read on its own:

- a lens name (`bugs`, `security`, `web-performance`, `runtime-performance`, `tests`, `design`) -> that lens, even when a directory of that name exists; `./<name>` addresses the directory;
- `performance` or `quality` -> that group, only its follow-up question is asked;
- `diff` -> the diff scope; `diff:<sha>` -> the diff scope measured from `<sha>`;
- `repo` -> the repository scope;
- anything else -> a directory.

## Frame

No agent is dispatched before Map, and every stop below prints its one line and ends the run.

1. Settle what is missing, the lens first:
   - No lens given: print this numbered list in the conversation's language, never through `AskUserQuestion`, and end the turn to wait for the user's number. A group token prints only its two lines with their numbers (`performance`: 3 and 4, `quality`: 5 and 6).
     1. `bugs`: wrong results, lost failures, crashes and hangs, races, producer and consumer mismatches.
     2. `security`: injection, access control, authentication, untrusted input, secrets and supply chain, LLM agents.
     3. `web-performance`: entry JS weight, LCP, layout shifts, hydration, asset delivery.
     4. `runtime-performance`: complexity cliffs, I/O per item, unbounded growth, blocking calls, repeated setup, query shape.
     5. `tests`: pseudo-tested code, hollow assertions, over-mocking, untested error paths, flaky, dead and wasteful tests.
     6. `design`: duplicated knowledge, change preventers, wrong abstractions, coupling, dead code, rule drift.
   - A reply of a listed number or a lens name selects that lens; any other reply prints the list again.
   - No scope given: once the lens is settled, ask How much through `AskUserQuestion`: Changes -> `diff`, Directory -> a directory, Whole repository -> `repo`. After a Directory answer, ask in prose for its path.
2. `<root>`: the output of `git rev-parse --show-toplevel` in the current directory, else the current directory.
3. A directory is read against `<root>`; an absolute one is accepted only under `<root>` and rewritten root-relative, and a leading `./` is dropped; a result of `diff` or `repo` is recorded as `./diff` or `./repo`, however it was given. One that does not exist, lies outside `<root>` or carries a `..` segment or an apostrophe -> stop with `code-auditor: area directory not found under <root>: <value> (lenses: bugs, security, web-performance, runtime-performance, tests, design)`.
4. `<lens-file>` is the absolute path of the selected one of `${CLAUDE_SKILL_DIR}/references/lenses/bugs.md`, `references/lenses/security.md`, `references/lenses/web-performance.md`, `references/lenses/runtime-performance.md`, `references/lenses/tests.md` and `references/lenses/design.md`. Read only the selected lens file, never the other five. Its `## Hunts` gives the angle slugs, its `## Verify` the `Worktree:` line. `<signals-file>` is the same path ending in `.signals.md` in place of `.md`, read only by the mapper. On a directory or repo scope under a lens reading `Worktree: required`, `git -C "<root>" rev-parse --verify -q HEAD` printing no hash -> stop with `code-auditor: <lens> verifies on a clean checkout and <root> holds no git commit: commit first, or pick the design lens`.
5. Diff scope only: run `sh "${CLAUDE_SKILL_DIR}/scripts/diff-files.sh" "<root>"`, with `<sha>` appended as its base argument for `diff:<sha>`. Then, in this order:
   - `BAD_BASE` -> stop with `code-auditor: diff base not found: <sha>`;
   - `NOT_A_REPO` -> stop: the diff scope needs a git repository;
   - a `BASE <base>` line and no path -> stop with `code-auditor: nothing changed against <base>`;
   - `BASE none` under a lens reading `Worktree: required` -> stop with `code-auditor: <lens> verifies on a clean checkout and this repository has no commit yet: commit first, or pick the design lens`.
6. `<ws>` is `<root>/.temp/viber/code-auditor/<run-id>`, `<run-id>` the output of `date +%Y%m%d-%H%M%S`. Create `<ws>/reports` and `<ws>/worktrees`, then write `<ws>/run.md` in the shape of `## Run file` in `${CLAUDE_SKILL_DIR}/references/synthesis.md`: `Lens:`, `Lens file: <lens-file>`, `Scope: diff | repo | <directory>`, `Target root: <root>`, and on the diff scope `Base: <base>` and `## Changed files` with every printed path.

## Map

7. Dispatch `viber:mapper` on every scope with `Run file: <ws>/run.md`, `Lens file: <lens-file>`, `Signals file: <signals-file>` and `Output: <ws>/map.md`. It takes the signal scope from the run file's `Scope:` line: `.` for `diff` and `repo`, the directory otherwise.
8. Map gate: `map.md` must hold `## Conventions`, `## History`, `## Severity calibration` and `## Units`. A missing file or heading -> dispatch the mapper once more with the same brief; a second miss -> stop with `code-auditor: map unavailable after two attempts`.
9. `## Units` reading `none: <reason>` -> stop with `code-auditor: nothing to audit for <lens>: <reason>`.
10. Append `## Map` and then `map.md` verbatim to `run.md`.

## Hunt

Hunter budget: one hunter per lens angle on the diff scope, 8 for a directory, 16 for the repository. At most 16 agents run at once in every phase: scouts in successive batches, hunters and critics together as one rolling pool, where each return frees a slot for the next queued agent, critics ahead of hunters.

Dispatch every hunter and critic in the background, its description naming its hunt id or `<hunt id>-<k>`, so each return arrives alone and names its own work. Between returns end the turn; never poll.

- Diff scope: no scout. One hunter per angle of the lens's `## Hunts`, hunt id `A-<angle slug>`, carrying `Angle: <angle slug>`.
- Directory and repository: with no more units than the budget, hunt every unit. Only above the budget, dispatch `viber:scout`s, passing `model` `sonnet` on the security lens (Haiku's cyber classifiers refuse with no fallback) and no `model` on the others, each with `Run file:`, `Lens file:` and up to 8 unit lines verbatim. One hunter per kept unit, hunt id `U<n>`, carrying `Unit: <unit line verbatim>`.
- Scout retry: once every scout has returned, the units with no score line go once more to scouts, in batches of up to 8, with the same brief and `model`.
- Kept units: the budget's count, highest score first, equal scores in map order, and units still unscored after the retry after every scored unit, in map order.

Every `viber:hunter` brief: `Run file: <ws>/run.md`, `Lens file: <lens-file>`, `Schema: ${CLAUDE_SKILL_DIR}/references/synthesis.md`, `Hunt: <hunt id>`, its `Unit:` or `Angle:` line and `Reports: <ws>/reports/<hunt id>`. Only for a lens reading `Worktree: required`, add `Worktree script: ${CLAUDE_SKILL_DIR}/scripts/worktree.sh` and `Worktree: <ws>/worktrees/<hunt id>`, and on the diff scope `Overlay script: ${CLAUDE_SKILL_DIR}/scripts/diff-overlay.sh`. A `Worktree: none` lens reserves no worktree.

## Verify

Verify runs alongside Hunt: handle each hunter on its own return, never waiting for the other hunters. Look in `<ws>/reports/` only for that hunt's files:

- No `<hunt id>-<digit>.md` (a hyphen and one digit right after the full id, so `A-x` never counts an `A-x-y` file): dispatch the hunt once more with the same brief and, for a worktree lens, the worktree path suffixed `-retry`; after a second miss the hunt goes under `synthesis.md`'s `- Hunts with no report:` and a `U<n>` hunt's unit counts toward `J`.
- Each `<hunt id>-<k>.claim.md`, `k` one digit: dispatch one `viber:critic` with `Claim: <sidecar path>`, `Run file: <ws>/run.md` and `Lens file: <lens-file>`; for a worktree lens add `Worktree script:` as above and `Worktree: <ws>/worktrees/critic-<hunt id>-<k>`, never the hunter's, and on the diff scope `Overlay script:` as above. Never hand a critic the report or its path.

A critic whose final message carries no `VERDICT:` line is dispatched once more with the same brief and, for a worktree lens, the worktree path suffixed `-retry`; after a second miss the finding is filed `INCONCLUSIVE` with `critic returned no verdict`.

## Synthesize

Start only when no hunter or critic is running or queued. Read `${CLAUDE_SKILL_DIR}/references/synthesis.md` and write `<ws>/findings.md` exactly as it specifies, reading only what its `## What the moderator reads` allows. It is the sole authority on folding verdicts, deduplication, severity and the shape of `findings.md`: never restate or reinterpret its rules.

Show the user the path of `findings.md` and one short summary: units mapped, hunts dispatched, confirmed findings, units not investigated. With at least one confirmed finding, the run's last message, after any variant wave, ends on the line `/viber:intent <absolute path of findings.md>`.

## Variant wave

Offer one variant wave through `AskUserQuestion` only when at least one finding was confirmed (`VERIFIED` or `PARTIALLY VERIFIED`), and on the directory and repository scopes only while mapped units remain uninvestigated. Start none unasked: a no ends the run. Each confirmed class gives one `Seed: <angle slug>: <specific class>` line, taken from its `CLASS:` line.

- Diff scope: one `V-<n>` hunt per confirmed class, `n` from 1, carrying `Angle: <its angle slug>` and that class's `Seed:` line, searching the repository outside the changed files.
- Directory and repository: one `U<n>` hunt per uninvestigated unit, best first within the scope's budget, each carrying every `Seed:` line.

Every other brief line and the rolling pool are as in Hunt. Verify the new claims the same way, each critic brief adding `Variant: yes`, then, with the pool empty, rebuild `findings.md` from every report and verdict of the run and show it again. A run offers one wave only.
