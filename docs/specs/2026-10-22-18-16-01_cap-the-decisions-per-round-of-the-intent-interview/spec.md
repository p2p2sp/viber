To build this plan you must invoke skill `viber:implementor` with `source:` path as its only argument.

# Cap the decisions per round of the intent interview

## Goal

Let a project, or one person, cap how many decisions one round of the `/viber:intent` interview carries, five by default, so a wide change no longer arrives as ten questions at once. The cap is a `.claude/viber.yml` setting with a personal override, and the interview's start text grows as little as the rule needs.

## Problem

The interview sends every decision whose prerequisites are settled in one message. On a wide change that is ten or more numbered decisions with three options each: the user did not expect it, and answering them all at once is hard. Nothing lets a project or a person limit it.

## Current behaviour

`viber/skills/intent/SKILL.md` says "One message carries every decision whose prerequisites are settled"; only a decision depending on one still open waits for a later round. The split interview (`references/split.md`) asks each part with the questions of `## The interview`, and the draft or roadmap resume (`references/resume.md`) asks what the remarks changed, both without any count limit. `.claude/viber.yml` has no interview setting, and `.claude/viber.local.yml` overrides exactly four keys.

### Must not change

- The resolved block `config.sh` prints with no argument keeps its lines and their order; `--branching` and `--red-check` print what they print today.
- The four existing local overrides (`tiers.min`, `tiers.max`, `build.baseline-tests`, `github.issues`) resolve as today.
- A round's format stays: numbered decisions, three options, the recommendation first, "yes" taking every recommendation.

## Behaviour

### S1 - A round holds at most the cap [CHANGED - was: every ready decision in one message]

Given an interview with 8 decisions whose prerequisites are settled and the default cap
When the interview shows a round
Then it carries 5 decisions, prerequisites of others and earlier topics of the cover order first, and ends on one line saying 3 more decisions follow in a later round

### S2 - The cap comes from the config, a personal value winning [NEW]

Given `.claude/viber.yml` sets `planning.questions-per-round: 3` and `.claude/viber.local.yml` sets it to `7`
When the interview starts
Then its round rule reads a cap of 7

### S3 - `all` restores the uncapped round [NEW]

Given the resolved value is `all`
When the interview shows a round
Then every decision whose prerequisites are settled goes out in one message, as before this change

### S4 - A project set up by an older version gains the key [NEW]

Given a `.claude/viber.yml` at `schema: 5` without the key
When `/viber:setup` runs
Then the file gains `planning.questions-per-round: 5` with its comment inside `planning:`, its `schema:` reads 6, and every value the user set stays

### Edge cases

- No config file, the key absent, empty, a comment alone, `0`, `11`, `05`, `abc`, a column-0 key or the key under another group -> 5.
- `all` lowercase only; `ALL` or `All` -> 5; a trailing ` # comment` or a CR is no part of the value.
- An invalid local value -> the shared value stands and the block's `# local:` line names the key under ignored; a valid one -> it wins and the line names it among the overridden keys.
- Fewer ready decisions than the cap -> the round carries them all and no remaining-count line.

## Glossary

- Questions per round - the most decisions one interview message carries; a decision past it is asked in a later round, never dropped.

## Acceptance criteria

1. The resolved `planning.questions-per-round` is an integer 1 to 10 or `all` as `.claude/viber.yml` writes it, and 5 for any other value or none; resolving it never fails a skill load.
2. A valid `planning.questions-per-round` in `.claude/viber.local.yml` wins over the shared value; an invalid one leaves the shared value and is named under ignored.
3. The `/viber:setup` template carries `planning.questions-per-round: 5` with a comment, names the key among the personal overrides and ships `schema: 6`, so a schema-5 project gains the key on the next setup run with its own values kept.
4. A round of the intent interview carries at most the resolved number of decisions, prerequisites first, then the cover order, and ends on one line counting the decisions that wait; `all` lifts the cap.
5. The cap governs the split interview and the draft or roadmap resume as it governs the main interview.
6. The intent start text stays within today's word cap of 1128 and grows by at most 30 words over its count before the change.
7. `docs/configuration.md`, `README.md` and `help.html` (English and Polish) describe the setting, the fifth personal override and the capped round.

## Scope

### File map

- modify - viber/scripts/config.sh - resolves `planning.questions-per-round` from the shared and the local file and reports it on its own
- modify - tests/viber/config.test.ts - proves the resolved value and the local override of the key
- modify - viber/skills/setup/templates/viber.yml - the key with its comment, the five personal overrides, `schema: 6`
- modify - tests/viber/bootstrap.test.ts - binds the schema-6 key list and proves a schema-5 config gains the key
- modify - viber/skills/setup/assets/help.html - the key entry, the fifth local override and the capped round of the intent card, both languages
- modify - viber/skills/intent/SKILL.md - the capped round rule reading the resolved value at skill load
- modify - tests/viber/help.unit.test.ts - pins the overrides paragraph and the capped round of the intent card
- modify - viber/skills/intent/references/resume.md - its questions asked in the rounds of `## The interview`
- modify - tests/viber/intent-prose.unit.test.ts - pins the capped round wording and the preload
- modify - viber/docs/configuration.md - the key and the five personal overrides
- modify - viber/README.md - the capped round in "How a run works"
- modify - docs/viber-functions.html - its settings list, its count of personal overrides and its intent round line

### Out of scope

- `viber/skills/intent/references/split.md` - already asks every part "with the questions of the skill's `## The interview`", so the capped rule reaches it unchanged.
- `viber/skills/setup/scripts/bootstrap.sh` - it already restores any missing child of `planning:` from the template; its hard-coded list is the legacy flat switches, which this key never was.
- `fixer`, `talk` and every other skill asking questions; the format of a round.
- The no-argument block of `config.sh` gains no line for the key (like `build.red-check-tests`, it is read only through its own flag).
- `viber/CLAUDE.md` and the other `CLAUDE.md` nodes naming the four local overrides: `build.memory` is on, so the build's close updates them.
- `viber/hooks/scripts/session-start.sh` reads the template's `schema:` at run time, and `tests/viber/session-start.test.ts` writes its own template fixture, so both keep their behaviour at schema 6.
- `help.html`'s walkthrough lines (the intent step and "viber does") and the root `README.md`'s "asks in short rounds" stay true of a capped round; `viber/.claude-plugin/plugin.json` only lists the skill.

## Solution requirements

- Skill text follows the `viber:skill-designer` rules: the round rule is rewritten in place, no new bullet.
- `config.sh` keeps working under Git Bash on Windows and bash 3.2 on macOS and always exits 0.
