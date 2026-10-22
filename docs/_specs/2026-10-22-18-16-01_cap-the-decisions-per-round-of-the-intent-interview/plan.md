---
source: C:/Projects/viber/docs/_specs/2026-10-22-18-16-01_cap-the-decisions-per-round-of-the-intent-interview/plan.md
---

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

## Tasks

<!-- TASK -->
### T1 - Resolve the questions-per-round setting in config.sh
- TDD: required
- Covers: AC1, AC2
- Uses: C1
- Depends-on: none
- Files: viber/scripts/config.sh, tests/viber/config.test.ts
- Delivers: a `--questions` report of the resolved `planning.questions-per-round`, read group-bound from `.claude/viber.yml` and overridable in `.claude/viber.local.yml`, documented in the script header's contract.
- Verification: node --test tests/viber/config.test.ts -> every case passes, the new `--questions` cases among them
- DoD: `--questions` with no config file prints `5` and exits 0; a shared value 1 to 10 prints as written and `all` prints `all`, a trailing comment and a CR ignored; `ALL`, `All`, `0`, `11`, `05`, `abc`, an empty value, a comment alone, the key absent from an existing file, a commented-out key, a column-0 key and the key under another group each print `5`; a valid local value wins over the shared one and the no-argument block's `# local:` line names `planning.questions-per-round` after `tiers.max` among the overridden keys; an invalid local value, a local `ALL` among them, leaves the shared value on `--questions` and the `# local:` line names the key under ignored; the no-argument block, `--branching` and `--red-check` print what they printed before for a config carrying the key
<!-- /TASK -->

<!-- TASK -->
### T2 - Ship the setting in the setup template and the help page
- TDD: required
- Covers: AC3, AC7
- Uses: C1
- Depends-on: T1
- Files: viber/skills/setup/templates/viber.yml, tests/viber/bootstrap.test.ts, viber/skills/setup/assets/help.html, tests/viber/help.unit.test.ts
- Delivers: the template key `planning.questions-per-round: 5` with its comment and `schema: 6`, the template's personal-overrides comment naming five keys, and `help.html` describing the key, the fifth local override and the capped interview round in English and Polish.
- Verification: node --test tests/viber/bootstrap.test.ts tests/viber/help.unit.test.ts -> every case passes, the schema-5 upgrade case among them
- DoD: `SCHEMA_KEYS` records schema 6 with `planning-questions-per-round` and the template ships `schema: 6` with the key at `5` under `planning:`, the `planning:` group comment and the file header covering a setting that is not a switch; the `GROUPED` fixture and every existing case treating a schema-5 config as complete or asserting `schema: 5` move to schema 6 with the key, the case proving a higher schema stands moving to `schema: 7`; a schema-5 config without the key gains it inside `planning:` with its comment, reaches `schema: 6` and keeps every value the user set; the template's overrides comment names `planning.questions-per-round` among five keys; `help.html` carries an entry `id="key-planning-questions-per-round"` describing 1 to 10, `all` and the default 5, its local-overrides paragraph names five keys and the intent card says a round carries at most that many decisions, each in both `lang="en"` and `lang="pl"`, the overrides paragraph and the intent card pinned in `help.unit.test.ts` in both languages
<!-- /TASK -->

<!-- TASK -->
### T3 - Cap the decisions of an intent round
- TDD: required
- Covers: AC4, AC5, AC6
- Uses: C1
- Depends-on: T2
- Files: viber/skills/intent/SKILL.md, viber/skills/intent/references/resume.md, tests/viber/intent-prose.unit.test.ts
- Delivers: the intent round rule capped at the value `config.sh --questions` prints, inlined as a preload, with the order of what goes first and the closing remaining-count line; the resume reference asking in those rounds.
- Verification: node --test tests/viber/intent-prose.unit.test.ts tests/portability.unit.test.ts -> every case passes, the new cap cases among them
- DoD: the round bullet of `SKILL.md` rewrites "One message carries every decision whose prerequisites are settled" in place to hold at most the value of the inline preload `!`"${CLAUDE_PLUGIN_ROOT}/scripts/config.sh" --questions``, which closes its line, `all` lifting the cap, prerequisites first, then the cover order, the round ending on one line counting the decisions that wait only when some wait; `allowed-tools` lists `Bash(${CLAUDE_PLUGIN_ROOT}/scripts/config.sh:*)`; `resume.md` asks its questions in the rounds of the skill's `## The interview`; `intent-prose.unit.test.ts` pins the preload, the `allowed-tools` entry, `all` lifting the cap, the prerequisites-first order, the remaining-count line written only when decisions wait and `resume.md` asking in those rounds; `START_TEXT_WORD_CAP` stays 1128 and the start text the test counts rises by at most 30 words over its count at the commit the build starts from
<!-- /TASK -->

<!-- TASK -->
### T4 - Document the setting in the configuration reference and the guide
- TDD: none
- Covers: AC7
- Uses: C1
- Depends-on: T2
- Files: viber/docs/configuration.md, viber/README.md, docs/viber-functions.html
- Delivers: the configuration reference describing `planning.questions-per-round` and listing it among five personal overrides, the usage guide's "How a run works" describing the capped round, and the functions page listing the setting, counting five personal overrides and describing the capped round.
- Verification: grep -n "questions-per-round" viber/docs/configuration.md viber/README.md docs/viber-functions.html viber/scripts/config.sh -> each of the four files prints at least one line
- DoD: `docs/configuration.md` describes `planning.questions-per-round` with its values 1 to 10 and `all` and its default 5; its "Personal overrides" section names five keys, the new one among them; `README.md`'s "How a run works" says a round carries at most `planning.questions-per-round` decisions, five by default; `docs/viber-functions.html` lists `planning.questions-per-round` among its settings, says the local file overrides 5 keys and says a round carries at most that many decisions
<!-- /TASK -->

## Contracts

### C1 - planning.questions-per-round

File: viber/scripts/config.sh, viber/skills/setup/templates/viber.yml

```
# .claude/viber.yml and .claude/viber.local.yml
planning:
  questions-per-round: 5      # 1..10 or all

# config.sh --questions  (stdout, exit always 0)
<n>|all                       # one line: 1..10 as written, or all; anything else -> 5
```

Read group-bound (a child of `planning:` only), the first assignment wins, the value cut at the first blank or `#`, a CR dropped; valid when it matches `^([1-9]|10|all)$`, case-sensitive. A valid local value replaces the shared one. The intent skill reads it only as the inline preload of this flag, never the whole config block.
