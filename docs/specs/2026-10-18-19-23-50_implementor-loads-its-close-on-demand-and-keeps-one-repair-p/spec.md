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
