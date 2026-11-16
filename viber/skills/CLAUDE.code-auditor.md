# viber/skills - editing the code-auditor lenses, map and signals

What binds `code-auditor/SKILL.md`, its `references/` (lens files, `<lens>.signals.md`, `synthesis.md`) and the four auditor agents to each other. The agents' own rules belong to the agents node.

## Contracts

- `code-auditor` reads one lens file of `references/lenses/` per run, never the other five; the `<lens>.signals.md` beside it holds its map-signal commands, read only by `mapper`. A lens's `Worktree:` line under `## Verify` (`required` or `none`) decides whether its hunters and critics get reserved worktrees from `worktree.sh` and, on the diff scope, the working tree's uncommitted changes through `diff-overlay.sh`.

## Change together

- The four map headings (`## Conventions`, `## History`, `## Severity calibration`, `## Units`): `agents/mapper.md` writes them, `code-auditor/SKILL.md`'s map gate checks them, `code-auditor/references/synthesis.md` and `agents/scout.md`, `hunter.md` and `critic.md` read them.
- The lens set (`bugs`, `security`, `web-performance`, `runtime-performance`, `tests`, `design`): the files under `code-auditor/references/lenses/`, `code-auditor/SKILL.md` (description, `argument-hint`, Arguments, the numbered list and group numbers of Frame step 1, Frame step 4 and the `lenses:` list of its directory message), `help.html` and `tests/viber/code-auditor.unit.test.ts`. Each lens file keeps the four headings `## Hunts`, `## Excluded`, `## Verify`, `## Severity` in that order and no bash block, its `<lens>.signals.md` holding the bash blocks, which `tests/viber/lenses.unit.test.ts` holds. `code-auditor/README.md` (for people, no agent loads it) lists every lens, its angles by slug and an ownership table: each hand-off clause in a lens intro or `## Excluded` names a class that an angle of the receiving lens covers, and the table names that angle, so a lens or angle added, renamed or re-homed changes the README row too.

## Traps

- A map-signal command in a `<lens>.signals.md` tells a test file by its path alone, never by a substring of the whole output line, and its test-or-spec filter matches a path shape (`tests/`, `.test.`, `test_`), never the bare substring `test`, which drops `src/latest.ts` and `src/inspector.ts`; `git grep -E` patterns use bracket classes, never `\b`. `tests/viber/lens-map-signals.test.ts` pins each of these cases.
