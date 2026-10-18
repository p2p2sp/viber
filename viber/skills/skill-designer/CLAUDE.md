# viber/skills/skill-designer - the authoring doctrine, model profiles and linter

Owns `skill-designer/`: authoring, audit and model tuning doctrine in `SKILL.md`, three doctrine references (`architecture.md`, `example.md`, `split-patterns.md`), `references/cross-model.md` plus one profile per covered model, and the `scripts/lint_skill.sh` linter. The deliverable is the user's own skill or agent file: the skill writes no `docs/<layer>/` output.

## Relationships

- `SKILL.md` step 4 reads `cross-model.md` on every model tuning pass and a profile only per target model, then carries `model:`, `effort:` and mitigations into the write step; `references/architecture.md` (Fork) defers a fork's model and effort to that step.
- `SKILL.md` step 7 runs the linter as `bash "${CLAUDE_SKILL_DIR}/scripts/lint_skill.sh" <skill-dir-or-agent-file>`.
- `SKILL.md` step 1 gives a tune request (model, effort or per-model wording only) its own path: steps 2, 3, 5, 6 and 7 are skipped, no file is written and step 4's model and effort recommendation is the output; the three evaluation scenarios belong to a new skill or a behaviour change only.
- `extension/SKILL.md` invokes `viber:skill-designer` through `Skill` once, on the agent file and every phase skill directory together, and skips the step with one line when the skill is absent from the listing.

## Contracts

- The skill obeys its own doctrine and lints clean (`FAIL=0 WARN=0`) under `lint_skill.sh` on its directory: no tables, italics, emoji or em/en dashes, no hedges, at most five all-caps directives per file.
- Every bundled file is named from the `SKILL.md` body at the step that reads it, as `${CLAUDE_SKILL_DIR}/references/<file>.md`; the linter warns on a reference whose basename neither the `SKILL.md` nor a `fragments/*.md` beside it contains, since a fragment is preloaded into the body.
- Profiles are named `<family>-<major>-<minor>.md`. Step 4 states "Model knowledge is as of <date>" and refuses to extrapolate to a model with no profile.
- Quoted snippets in the profiles are measured wording: step 4 and Audit mode forbid rephrasing them, and a sentence a profile marks verbatim (the first sentence of the Fable 5.1 autonomy block) stays verbatim in the profile too.
- `lint_skill.sh`: a directory target lints every `.md` under it plus its `scripts/` and `references/`; a file target lints that file alone unless it is named `SKILL.md`. Prints `FAIL`/`WARN` lines, then `FAIL=<n> WARN=<m>`; exit 1 on any FAIL, 2 on missing argument, else 0. It skips itself in the `scripts/` sweep. A reference over 100 lines needs a table of contents matching its `##` headings both ways: WARN up to 300 lines, FAIL past.

## Commands

- Lint a skill or file: `bash viber/skills/skill-designer/scripts/lint_skill.sh <skill-dir | file.md>` (exit 1 on any FAIL).
- The linter's own regression suite is `tests/viber/lint_skill.test.ts` (integration tier, CI only).

## Change together

- The platform caps and style rules in `SKILL.md` (name 64 chars and charset, description 1024 chars and no angle brackets, reserved words, body 500 lines, reference table of contents past 100 lines, no tables/italics/emoji, no `jq`/`bc`, emphasis budget, hedges, caller narrative, no reads of project memory files) each have a check in `lint_skill.sh`: changing one changes the other.
- The set of covered models: the profiles under `references/`, the `SKILL.md` description and step 4 profile list, and `cross-model.md`'s comparison bullets (knowledge, context, effort defaults, prices, model choice); adding or retiring a profile also updates the "Model knowledge is as of" date.

## Traps

- The doctrine lists reserved words (anthropic, claude) among hard platform caps, but the linter reports them as WARN only.
- `lint_skill.sh` stays 100644 because every caller runs it through `bash`; calling it bare would require the 100755 exec bit.
