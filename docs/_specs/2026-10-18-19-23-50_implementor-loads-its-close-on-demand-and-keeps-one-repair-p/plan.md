---
source: /Users/dario/Projects/p2p2.claude/docs/_specs/2026-10-18-19-23-50_implementor-loads-its-close-on-demand-and-keeps-one-repair-p/plan.md
---

To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Implementor loads its close on demand and keeps one repair pass

## Goal

`implementor` holds the text of steps 5 to 7 and their switch fragments (about 14 KB) in context through the whole of step 4, where agent failures are handled, although step 4 never uses it. Its held-task pass and owed-path pass also repeat almost the same rules. A smaller step 4 context leaves more room for handling failing agents and costs less on every orchestrator turn. The merged pass keeps every rule of both kinds, so the kinds differ in four places (tiers, extra dispatch lines, commit, failure of both attempts), not only in tier and commit.

## Acceptance criteria

1. The loaded `implementor` SKILL.md carries no text of steps 5 to 7 and no `switch-text.sh` call of their fragments: one literal `skill-part.sh` call, made before the first action of step 5, 6 or 7 (an `abort` reaching step 7 included), fetches them, and `allowed-tools` lists the script.
2. `skill-part.sh` printing `implementor`'s `close` part yields steps 5 to 7 exactly as SKILL.md holds them today, each fragment block replaced by the fragment `switch-text.sh` selects for the project's switch value.
3. Step 3 creates the close entries of the task list from the config block's switches, never from text loaded later.
4. The held-task pass and the owed-path pass form one `Repair pass` section keeping every rule of both, and `repair-prose.unit.test.ts` pins each of those rules with no fewer cases than its current 78.
5. The fragment-call sweep of `tests/portability.unit.test.ts` counts a `switch-text.sh` call inside a skill's `parts/*.md` as a call of that skill, and its preload-quoting sweep and exec-bit corpus cover those files.
6. `viber/skills/implementor/SKILL.md` size is measured and reported before (28,826 bytes) and after the change; the plan's estimate for after is below 23,500 bytes, checked in the merge task's `Verification`.

## Scope

### File map

- add - viber/scripts/skill-part.sh - prints one part of a skill with its switch fragment blocks resolved; plugin level because it is generic over skill dirs, like `switch-text.sh`, though `implementor` is its first caller
- add - tests/viber/skill-part.test.ts - the script's contract, and the real `implementor` close part per switch value
- add - viber/skills/implementor/parts/close.md - steps 5 to 7 of `implementor`, moved verbatim with their fragment blocks
- add - tests/viber/close-part-prose.unit.test.ts - pins the body pointer, the `allowed-tools` entry, the step 3 entries, the absence of steps 5 to 7 from SKILL.md and the `switch-fragments.md` wording
- modify - viber/skills/implementor/SKILL.md - steps 5 to 7 replaced by the pointer, step 3 entries keyed on switches, the two repair passes merged
- modify - tests/portability.unit.test.ts - fragment-call sweep, preload-quoting sweep and exec-bit corpus read `parts/*.md`
- modify - tests/viber/repair-prose.unit.test.ts - reads the closing sentence from the part, the passes from the merged section, step 4 ending at the new heading
- modify - tests/viber/roadmap-prose.unit.test.ts - reads both close forms from the part
- modify - tests/viber/ruling-prose.unit.test.ts - its whole-file absence checks read SKILL.md and `parts/close.md`
- modify - tests/viber/extras-prose.unit.test.ts - its whole-file absence and count checks read SKILL.md and `parts/close.md`
- modify - .claude/rules/viber/switch-fragments.md - names where `implementor` calls its close fragments now

### Out of scope

- Build behaviour: every dispatch, gate, commit, question and summary line stays as it is.
- The agents, `commit-task.sh`, `switch-text.sh`, the arbiter and every other step 4 branch.
- Every other skill, and any compression of the body beyond merging the two repair passes.
- The `CLAUDE.md` nodes (`viber/CLAUDE.md`, `viber/skills/CLAUDE.md`, `viber/scripts/CLAUDE.md`, `tests/viber/CLAUDE.md`): the build's memory close updates them.
- `tests/viber/nudge-prose.unit.test.ts`: the text it reads stays in the body.

## Tasks

<!-- TASK -->
### T1 - Print a skill part with its switch fragments resolved
- TDD: required
- Covers: AC2
- Uses: C1
- Depends-on: none
- Files: viber/scripts/skill-part.sh, tests/viber/skill-part.test.ts
- Delivers: a bundled script that prints one part file of a skill, each switch fragment block replaced by the fragment `switch-text.sh` selects, both root placeholders expanded, and a test file proving that contract on a skill dir planted in a temporary repository
- Verification: `node --test tests/viber/skill-part.test.ts` -> every case passes; `git ls-files -s viber/scripts/skill-part.sh` -> one line starting `100755`; `grep -n '<<' viber/scripts/skill-part.sh` -> no output
- DoD: a part file with no fragment block prints byte for byte, its `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PLUGIN_ROOT}` placeholders expanded to the skill dir as passed and that path without its last two segments, never canonicalised; a fragment block prints the fragment of the configured switch value in its place, fence lines removed, and nothing when that value has no fragment file; a line ending in a carriage return still matches as a fence or a call line; a fenced block that is not exactly one `switch-text.sh` call prints unchanged and is never run; a missing argument, a part name outside `[a-z0-9-]+` or an absent part file exits 1 with one `error:` line on stderr and nothing on stdout; the script starts with `#!/usr/bin/env bash`, is staged at mode 100755 in the git index, uses no heredoc and no tool missing from macOS or Windows Git Bash, and its header comment states the C1 contract
<!-- /TASK -->

<!-- TASK -->
### T2 - Sweep switch fragment calls in skill parts
- TDD: required
- Covers: AC5
- Uses: none
- Depends-on: none
- Files: tests/portability.unit.test.ts
- Delivers: the fragment-call sweep, the preload-quoting sweep and the exec-bit corpus read every `parts/*.md` found on disk beside each indexed SKILL.md, a call there counting as a call of that skill
- Verification: `node --test tests/portability.unit.test.ts` -> every case passes
- DoD: a self-check proves a fragment called only from a skill's part file is not reported as called by no SKILL.md; a self-check proves an unknown key in a part file's call is reported with the part file's path and line; the preload-quoting sweep checks every fenced `!` block of every part file; the exec-bit corpus includes every part file; the part files are found on disk, so an untracked part file of a task in progress is swept too
<!-- /TASK -->

<!-- TASK -->
### T3 - Load steps 5 to 7 of implementor on demand
- TDD: required
- Covers: AC1, AC2, AC3
- Uses: C1
- Depends-on: T1, T2
- Files: viber/skills/implementor/SKILL.md, viber/skills/implementor/parts/close.md, tests/viber/close-part-prose.unit.test.ts, tests/viber/repair-prose.unit.test.ts, tests/viber/roadmap-prose.unit.test.ts, tests/viber/ruling-prose.unit.test.ts, tests/viber/extras-prose.unit.test.ts
- Delivers: steps 5 to 7 moved verbatim from SKILL.md into `parts/close.md`, SKILL.md holding in their place one pointer that runs `skill-part.sh` for the `close` part before the first action of step 5, 6 or 7, step 3 creating the close entries from the config block, and the prose tests reading the moved text from the part
- Verification: `diff <(git show HEAD:viber/skills/implementor/SKILL.md | sed -n '/^## 5\. Close$/,$p') viber/skills/implementor/parts/close.md` -> no output; `node --test tests/viber/close-part-prose.unit.test.ts tests/viber/repair-prose.unit.test.ts tests/viber/roadmap-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts tests/portability.unit.test.ts` -> every case passes
- DoD: `parts/close.md` equals the text from `## 5. Close` to the end of the SKILL.md this task starts from, with its seven `switch-text.sh` blocks; SKILL.md holds no `## 5. Close`, `## 6.` or `## 7.` heading, no `Closing sentence` and no `switch-text.sh` call naming `final-review`, `baseline-close`, `memory`, `rules`, `qa`, `extensions` or `cleanup`; SKILL.md holds under its one heading `## 5 to 7. Close and archive` exactly one `skill-part.sh` call, `"${CLAUDE_PLUGIN_ROOT}/scripts/skill-part.sh" "${CLAUDE_SKILL_DIR}" "close"`, run once before the first action of step 5, 6 or 7, an `abort` reaching step 7 included, stopping on a non-zero exit with its stderr reason reported; `allowed-tools` lists `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/skill-part.sh:*)`; step 3 creates `Final review`, `Update project memory`, `Update project rules`, `Write QA and E2E scenarios`, `Run extensions` and `Archive the run` from the config block's `build.final-review`, `build.memory`, `build.rules`, `build.qa`, `build.extensions` with `build.extensions-missing`, and `build.cleanup` lines, and `Final test run` always; `repair-prose` ends step 4 at `## 5 to 7. Close and archive` and, with `roadmap-prose`, reads the close forms, the closing sentence and the pull request question from `parts/close.md`, every current case kept, while the whole-file absence and count checks of `ruling-prose` and `extras-prose` read SKILL.md and `parts/close.md` together
<!-- /TASK -->

<!-- TASK -->
### T4 - Prove the implementor close part per switch value
- TDD: none
- Covers: AC2
- Uses: C1
- Depends-on: T3
- Files: tests/viber/skill-part.test.ts, tests/viber/close-part-prose.unit.test.ts, .claude/rules/viber/switch-fragments.md
- Delivers: cases running `skill-part.sh` on the real `implementor` skill dir for every close switch value, and the `switch-fragments.md` rule naming `parts/close.md` as where `implementor` calls its close fragments, pinned by `close-part-prose`
- Verification: `node --test tests/viber/skill-part.test.ts tests/viber/close-part-prose.unit.test.ts` -> every case passes
- DoD: `skill-part.sh` run on the real `implementor` skill dir and `close` prints, for each of `build.final-review`, `build.memory`, `build.rules`, `build.qa`, `build.cleanup` and `build.extensions`, its fragment's text only when the switch is on; it prints the `baseline-close` text of `fast` or `full` under that `build.baseline-tests` value and none under `off`; `close-part-prose` asserts that `switch-fragments.md` names `parts/close.md` as where `implementor` calls `final-review`, `baseline-close`, `memory`, `rules`, `qa`, `extensions` and `cleanup`
<!-- /TASK -->

<!-- TASK -->
### T5 - Merge the held-task and owed-path passes into one repair pass
- TDD: required
- Covers: AC4, AC6
- Uses: none
- Depends-on: T3
- Files: viber/skills/implementor/SKILL.md, tests/viber/repair-prose.unit.test.ts
- Delivers: one `Repair pass:` section in step 4 stating once the rules both kinds share (start condition, entry, attempts, the ordinary dispatch lines with the `repair:` line, a coder dispatch never step 5's repair dispatch) and per kind only what differs (tiers, extra dispatch lines, commit, failure of both attempts), with `repair-prose` pinning every rule of both kinds on the merged section
- Verification: `node --test tests/viber/repair-prose.unit.test.ts tests/viber/ruling-prose.unit.test.ts tests/viber/extras-prose.unit.test.ts` -> every case passes; `node --test tests/viber/repair-prose.unit.test.ts | grep '^# tests'` -> 78 or more; `wc -c < viber/skills/implementor/SKILL.md` -> below 23500, printed as the after size
- DoD: step 4 holds exactly one `Repair pass:` section and no `Held-task pass:` or `Owed-path pass:` heading line, the names `held-task pass` and `owed-path pass` still naming its two kinds and the step 2 `owed:` line unchanged; every phrase `repair-prose` pins today on either pass is found in the merged section, scoped to the kind it governs today, the held-task passes running before every owed-path pass and before step 5; `repair-prose` runs at least 78 cases; SKILL.md measures below 23,500 bytes
<!-- /TASK -->

## Contracts

### C1 - skill-part.sh

File: viber/scripts/skill-part.sh

```
argv   : <skill dir> <part>
         skill dir : the skill's directory as passed, never canonicalised
         part      : [a-z0-9-]+
         <plugin root> is <skill dir> without its last two path segments
         (separator / or \, a trailing separator ignored), as switch-text.sh derives it.
cwd    : any directory inside the host project (switch-text.sh resolves the config).
file   : <skill dir>/parts/<part>.md
stdout : that file's content, where every fenced block whose opening line is
         ```! and whose only body line is
         "${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" <key> "${CLAUDE_SKILL_DIR}" <name>
         is replaced, fence lines included, by the stdout of
         switch-text.sh <key, quotes stripped> <skill dir> <name>;
         every other line verbatim; then every literal ${CLAUDE_SKILL_DIR} replaced
         by <skill dir> and every literal ${CLAUDE_PLUGIN_ROOT} by
         <plugin root>. A trailing carriage return is ignored when matching a line.
stderr : error: <reason>, one line, on exit 1 only.
exit   : 0 printed; 1 on a missing argument, a name outside its pattern or an
         absent part file, nothing on stdout.
```
