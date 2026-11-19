# viber/skills/pro-designer - the design-standards skill, its references and scripts

Owns `pro-designer/`: `SKILL.md`, its fifteen on-demand references under `references/` and its two bundled scripts under `scripts/`. The skill holds any interface the host builds or reviews to professional UI/UX standards and measures WCAG contrast.

## Terms

- Surface mode: Persuade, Operate, Read or Experience, named from the requested surface (never the product) before any design decision; several rules apply only to new Persuade/Experience surfaces (concept brief, template test, screenshot QA).
- Design pass: the fixed eight-step order in `SKILL.md` (direction, layout, type, color, components, motion, flow psychology, QA), each step pointing at its reference.

## Relationships

- `SKILL.md` reaches every reference by `${CLAUDE_SKILL_DIR}/references/<file>.md`; nothing else loads them. A reference no line of `SKILL.md` names is unreachable.
- The scripts are called only from `SKILL.md`'s Final QA, through an interpreter (`sh`, then the resolved `node` command), pre-approved by `Bash(sh:*)` and `Bash(node:*)` in its `allowed-tools`.
- `agents/prototype-writer.md` invokes this skill as `viber:pro-designer` when `impeccable` is not in its skill listing; `agents/task-coder.md` and `agents/task-reviewer.md` read the short `viber/references/ui-tells.md` instead of `references/anti-slop.md`. The skill's `description` names work where the interface's look is the goal and carries no "ALWAYS"; it stays model-invoked so that fallback works.
- Tested by `tests/viber/`: `check_contrast.unit.test.ts` (input validation, exit codes), `check_contrast-import.unit.test.ts` (importing the script runs no CLI), `check_node.test.ts` with `check_node.critical.test.ts` (version matrix, logic and critical tiers); `help.unit.test.ts` imports `contrastRatio` and `parseColor`.

## Contracts

- Load order: the first action of every invocation reads `references/anti-slop.md` in full; it stays out of the Reference routing list because it is already loaded. Every other reference is read on demand, from the Design pass or the Reference routing list.
- Design-system precedence: a host's own token set, spec or brand guidelines override the skill's generic absolutes; the user's brief overrides its anti-generic warnings, except accessibility and anti-dark-pattern rules. The skill proposes and critiques, the user decides.
- Runtime dependency: Node.js 22.6 or newer, optional, used only for the contrast check through Node's native type stripping; without a usable Node the skill skips that one check with a note.
- `scripts/check_node.sh`: no args; prints exactly one line, `NODE_OK <cmd>` (`node` at 23.6 or newer, `node --experimental-strip-types` from 22.6 below 23.6) or `NODE_MISSING`; always exits 0.
- `scripts/check_contrast.ts`: `FG BG [TYPE] [FG BG [TYPE] ...]` or `--json <file>` of `{fg, bg, type?, label?}` records; colors `#rgb`, `#rrggbb`, `rgb(r,g,b)`; TYPE `normal` (AA 4.5, AAA 7), `large` (AA 3, AAA 4.5), `ui` (AA 3, no AAA). Exit 0 all pass, 1 a pair fails AA for its own type, 2 bad input or usage. It exports `parseColor`, `contrastRatio` and `main`, and runs `main` only when executed directly.

## Change together

- The Node minimum (22.6): `scripts/check_node.sh`, the skip note in `SKILL.md`, `help.html` and the root `README.md` requirements table; a new threshold also goes into the version arrays of `tests/viber/check_node.test.ts`.
- The usage text of `check_contrast.ts` sits twice in the file (header comment and the `DOC` string); its TYPE thresholds and exit codes are restated in `SKILL.md` Final QA.
- A reference added, renamed or removed changes its line in `SKILL.md` Reference routing (and its Design pass step, if any).
- `references/anti-slop.md` and `viber/references/ui-tells.md` share the same `##` sections, held by `tests/viber/ui-tells.unit.test.ts`: a section added, renamed or removed in one changes the other (the checklist stays within 4096 bytes).

## Traps

- `anti-slop.md` (about 18 KB) is read on every invocation: every byte added there is paid by every design task. Grow an on-demand reference instead where the rule fits one.
- In `--json` mode an unreadable file or invalid JSON is not caught: it exits 1 with a stack trace, the same code as an AA failure. Only a parsed record with a bad field exits 2.
- The output formatting helpers in `check_contrast.ts` (`pyStr`, `pyReprStr`, `pyFloatStr`) are deliberate: thresholds print as `3.0`, error messages quote input Python-style.
- `check_node.sh` is `#!/bin/sh`: its tests run it through `forEachShell("posix", ...)`, and "no node on PATH" is built by stripping every directory holding a `node` from the real `PATH`.
