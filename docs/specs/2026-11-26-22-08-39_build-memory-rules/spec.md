# Build steps: memory growth limit and rules step

A mechanical size bar on what a full build writes into project memory, and a new close step that only corrects project rules.

## Goal

The plugin author wants a high bar on everything the build writes into project memory (`CLAUDE.md` nodes) and project rules (`.claude/rules/`), because in the older `viber` plugin both layers bloated. A bar stated only in an agent prompt does not hold, since the model always judges its own conclusion important, so the bar must be counted by the build script. The bar concerns additions only: correcting or removing what the build made false always passes, because a false rule or fact harms more than a missing one (D1).

Today the close of a full build runs `final-review`, `tests`, `memory`, `extensions`, `finalize`, `end`. The `memory` step dispatches `viber:memory-writer`; on `UPDATED` the script commits the reported files that match the node pattern (a `CLAUDE.md` node or `CLAUDE.<topic>.md` section below the root) as `docs(viber): project memory`, notes any other path as not committed, and sends the lines of `suggest.md` to the outcome as suggestions for the root `CLAUDE.md`. There is no size limit on what the writer adds. The rules writer is a stub nothing dispatches.

## Requirements

- R1: After the memory writer returns, the script measures the net growth in bytes, work tree against HEAD, summed over every path the node pattern lets through (nodes `CLAUDE.md` and sections `CLAUDE.<topic>.md` below the root). A deleted file counts negative, a new file counts whole.
- R2: The limit is 600 bytes of net growth per build, a constant in the script, not configurable (D2).
- R3: Corrections and removals have no limit of their own: only the net sum is held.
- R4: Sections count toward the limit (D3).
- R5: Root-cause traps count toward the limit with no exemption; the writer writes them before any other fact, so they displace the rest (D4).
- R6: On the first overrun the writer is dispatched once more and told the number of bytes to take off.
- R7: On a second overrun in a row the script restores every node and section to HEAD (a file new since HEAD is removed), commits nothing for memory, and notes in `outcome.md` the number of bytes over the limit (D5).
- R8: Root suggestions (`suggest.md` to outcome) keep working as today, also on a discarded write.
- R9: A new close step `rules` runs right after `memory`, so the order is `tests`, `memory`, `rules`, `extensions` (D6). Its commit is `docs(viber): project rules`.
- R10: The step dispatches `viber:rules-writer` only when the `paths:` globs of at least one rule file under `.claude/rules/` match a file of `changes.md`. Rules of the plugin's zone (`.claude/rules/viber/`) and the user's rules (every other file under `.claude/rules/`) both count (D7).
- R11: A user rule with no `paths:` never triggers the step.
- R12: When no rule matches, the step is skipped with no agent dispatched.
- R13: The agent writes only inside `.claude/rules/viber/`. Everything else under `.claude/rules/` is the user's: the plugin reads it and never writes it. The directory name is lowercase `viber`.
- R14: The agent only corrects or removes a rule the build made false. It never adds a convention: no new file, no new line in an existing rule. It does not judge whether a rule should exist (D8).
- R15: The agent corrects or removes a rule only when no file under its `paths:` still follows the old convention.
- R16: A partial contradiction (new code breaks the rule, older files still follow it) changes no rule and goes to `outcome.md` as a note naming the rule and the file (D9).
- R17: A user rule the build made false is never written: it goes to `outcome.md` as a suggestion, as the root `CLAUDE.md` does today.
- R18: The script discards, with a note in the outcome as the memory step does today, every reported path outside `.claude/rules/viber/` and every file under it that did not exist at HEAD (the build step creates no rule).
- R19: The script holds the net growth of `.claude/rules/viber/`, work tree against HEAD, to 200 bytes per build: a corrected sentence may be longer, a new rule does not fit (D10).
- R20: A rule overrun is handled as in memory: one more dispatch with the bytes to take off, then on a second overrun in a row a restore from HEAD and a note in `outcome.md` (R6, R7).
- R21: A rule file left with no convention is removed by the step. The agent writes the file empty (zero bytes) and reports it among its returned files; the script removes every reported file of length 0 under the plugin's rules directory, and that directory once it is empty. The agent gets no Bash (D13).
- R22: The open item "Bramka przyjęcia nowej reguły w skillu `rules`" in the migration notes stops being open. It is settled as the gate in D11; a later run implements it for the `rules` skill, not this change.
- R23: The header of the build script, the root `CLAUDE.md` and the target-design overview stop describing `rules-writer` as a stub and describe the new step and the memory limit [CHANGED - was: `rules-writer` described as postponed].
- R24: The description in the frontmatter of `rules-writer` loads into every session: keep it minimal.

## Out of scope

- The skills `memory` and `rules` (review, completion, rewrite), the adoption of old rules into `viber/`, absolute budgets per node or rule, the ban on a plugin rule with no `paths:`.
- The simple flow: it gets neither step (D12).
- Any switch in the project configuration file for the two steps or their limits.
- Known gap, accepted by the user: a build that removed a large passage may add as much; the limit holds growth, not the quality of one fact. Quality stays with the writer's four criteria.

## Must not change

- The order and behaviour of every other close step.
- The resume of a run from `state.json`: a new step and a retry counter must survive a resume.
- Commits through a private index with hooks, and the run directory committed with every commit.
- The contract `implementor` relays: `DISPATCH: <agent> | id: <id> [| model: <m>]` blocks, returns as `<id> <WORD> [<FILES>]`, free text only in files. A return line or body label changes together in the build script's header, the skill and the agent.

## Decisions

- D1: The high bar applies to additions only; correcting or removing what the build made false always passes. Rejected: a high bar on every write. Reason: a false rule or fact harms more than a missing one. Decided after the assistant challenged "a high bar on every write".
- D2: The memory limit is 600 bytes. Rejected: 1200 bytes (weaker selection) and 300 bytes (a new node impossible in a build).
- D3: Sections count toward the memory limit. Rejected: limiting `CLAUDE.md` only, because the writer could dump facts into sections to pass the limit.
- D4: Traps count with no exemption. Rejected: a separate first pass for traps (two agent calls a build) and a limit growing per `Root cause` line. Reason: the script cannot tell a trap from another fact.
- D5: A second overrun restores from HEAD and notes it. Rejected: leaving the changes uncommitted in the tree, because the build would end with a dirty tree and the next build would start with them.
- D6: `rules` is its own step after `memory`. Rejected: dispatching memory and rules together in one message, because the overrun loop would handle two agents at once.
- D7: Plugin and user rules both trigger the step. Rejected: triggering on `viber/` rules only, because a false user rule misleads agents as much as a false plugin rule.
- D8: The agent never adds a rule. Rejected: at most one new rule a build on review evidence, because one build is weak evidence of a convention. New rules come only from a later `rules` skill.
- D9: A partial contradiction yields a note. Rejected: no note at all, and narrowing the rule's `paths:` so the new code falls outside it. Reason: the agent cannot tell a changed convention from a coder's violation.
- D10: The script holds rules growth to 200 bytes. Rejected: discarding new files only and trusting the prompt for added lines.
- D11: A prose rule records only a deviation from what the model or a competent developer would do by default, and only when no linter, type, schema or fast unit test reading the code statically can detect its violation; what remains is what needs understanding of intent. Rejected: "impossible to cover by any test, integration included" (nearly everything is testable at some cost, so the agent would decide by whim) and "only when a check already exists".
- D12: The simple flow gets neither step. Rejected: giving it both steps.
- D13: The agent empties the file and the script removes it. Rejected: a separate `remove:` list file (a new dispatch label to keep in three places) and giving the agent Bash (it could reach outside its directory and the script could not undo it).

## Constraints

- `.ts` runs directly on Node 22.18+: `.ts` import extensions, erasable syntax only, no dependencies. Bash scripts target bash 3.2.
- The repository has no build, linter or test suite.
- Agent and skill text follows the project's authoring rule: compressed, one rule per line, written for Opus and Fable. Never an em dash or en dash in any file.
