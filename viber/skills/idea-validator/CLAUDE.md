# viber/skills/idea-validator - the side-project idea validation skill

Owns `idea-validator/`: the orchestrating `SKILL.md`, its references (`process.md`, `dimensions.md`, `council.md` with the seven `council/<nn>-<member>.md` files, `experiments.md`, `report-schema.md`), `scripts/build_report.mjs`, `templates/report-template.html` and `evals/evals.json`. It turns an idea into a sourced Go / Pivot / No-Go HTML report.

## Terms

- Key dimensions: Problem strength, Distribution, Autopilot fit. Any of them scoring 2 or less forbids a Go; Problem strength and Distribution carry weight 2, the other seven weight 1, so the weighted total divides by 11.
- Moderator: the main context in step 12. It adds no argument of its own, attributes every sentence to a member and never resolves a dispute; the dissenting opinion is mandatory.

## Relationships

- User-only (`disable-model-invocation: true`); it invokes no other viber skill and dispatches no viber agent.
- `SKILL.md` runs steps 0-15 and sends each step into one reference by `${CLAUDE_SKILL_DIR}/references/...`; only the main context reads references.
- Subagents are `general-purpose` and cannot see the skill: every research prompt carries the pasted brief plus the pasted Research rules of `process.md`, every council prompt the pasted member file. Pass working-file paths, never a skill path.
- `build_report.mjs` finds the template by its own location (`../templates/report-template.html`) and is called through the literal `node ${CLAUDE_SKILL_DIR}/scripts/build_report.mjs` prefix that `allowed-tools` pre-approves.
- `evals/evals.json` holds three hand-run scenarios (full run, `--quick` on a Polish file, an enterprise idea that cannot be Go); the skill run itself has no automated suite.
- Tested by `tests/viber/`: `build_report.unit.test.ts` (every validation rule in `RULES`, label merge, template fill, import safety) and `build_report.test.ts` (the file-writing CLI cases, integration tier), both starting from `validReport()` in `build_report-fixture.ts`.

## Contracts

- Host writes are exactly two, sharing one slug: working files under `.temp/viber/idea-validator/<slug>-<YYYY-MM-DD>/` and the deliverable `docs/business/<slug>/report.html`.
- Runtime needs are web access (`WebSearch`, `WebFetch`) and Node.js 18 or newer: `build_report.mjs` imports only `node:` built-ins and uses no API newer than Node 18.
- Determinism: same steps, same seven members, same numbered working files (`00-input.md` to `13-experiments.md`, `report-data.json`) and same report layout every run. Member output headings in `council.md` are verbatim.
- Round-1 isolation: each member is its own subagent, all seven in one turn, told never to read `10-council-r1/` or `11-council-r2/`, and never given a summary, other opinions or an expected verdict.
- `build_report.mjs <report-data.json> <output.html>` validates before rendering (nine dimension keys in canonical order, integer scores 1-5, weights, confidence, evidence, `scorecard.total` within 0.06, the key-dimension Go floor, `conditional_on`, `pivot_suggestion`, exactly 7 members, dissent, `round2_held` unless `quick_mode`, 3-8 experiments, thresholds). Exit 1 lists every problem (the skill fixes the JSON, never the HTML), exit 2 on a wrong argument count. `main(argv, log)` returns the exit code; the script sets `process.exitCode` only when run as the process entry.
- Rendering: the script merges English `DEFAULT_LABELS` under the JSON's `labels`, embeds the JSON (every `<` escaped as the six characters `<`) at `__REPORT_DATA__` and fills `__LANG__` and `__TITLE__` in one pass; the template's JavaScript renders every section, so the output is one self-contained file.
- Language: every skill file is English; the report, its labels and the council's writing follow the language of the idea text.

## Change together

- A `report-data.json` field or label key: `report-schema.md`, `build_report.mjs` (`validate`, `DIMENSION_KEYS`, `KEY_DIMENSIONS`, `DEFAULT_LABELS`), the template's renderer, and `validReport()` when the field is required.
- The verdict rules of `dimensions.md`, the checks in `build_report.mjs` and their `RULES` rows; the 3-8 experiment count in `experiments.md` and the script; the council of seven in `council.md`, `council/` and the script.
- Each dimension's weight and primary owner in `dimensions.md`, the member list in `council.md` and the "Primary dimensions" line of each `council/<nn>-<member>.md`.
- The working-file list in `SKILL.md` and the paths named in `process.md`, `dimensions.md`, `council.md`, `experiments.md` and `evals.json`.
- The skill's user-facing shape (dimensions, advisors, verdict, experiment count, `--quick`, report path): its card in `setup/assets/help.html` and `viber/README.md`.

## Traps

- Passing `build_report.mjs` does not prove the verdict follows `dimensions.md`: the Go floor (total 3.5 or more), the Pivot and No-Go bands and the unfixed-killer rule are checked nowhere but in the moderator's prose.
- A schema `labels` value is an example in Polish only; a missing label silently renders in English.
