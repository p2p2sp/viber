---
name: skill-designer
description: Authoring rules for Claude Code skills and agents. Use when creating, auditing, shrinking or splitting a SKILL.md or agent file, choosing its model or effort, or fixing behaviour it shows on one model only.
---

# skill-designer

## Input

- The skill or agent to create or change, with its existing files.
- Optional: target directory, constraints, example inputs and outputs.

## Workflow

1. Classify the request: new, refactor, split, audit, or tune (model, effort or per-model wording only). Tune runs steps 4 and 8 only and writes no file. Read an existing file whole before changing it.
2. Run the responsibility check. If it fails or the request is a split: read `${CLAUDE_SKILL_DIR}/references/split-patterns.md` and build the split.
3. Decide where the work runs before writing it. If the skill drives noisy tool calls, chains stages, or repeats a behaviour other skills carry: read `${CLAUDE_SKILL_DIR}/references/architecture.md`.
4. Tune for the model when the request is tune, or the target is an agent or a forked skill, pins `model:`, or misbehaves on one model only. Model knowledge is as of 2026-11-17: a model with no profile below is not covered, say so and never extrapolate from a neighbour.
   - Resolve the target models: the file's `model:`, the model its caller dispatches it with, or the request. `inherit`, no `model:`, or a skill on the session model means several models.
   - Read `${CLAUDE_SKILL_DIR}/references/cross-model.md`: only it holds the rules several models share and the frontmatter mechanics.
   - One target model: also read its profile. Several or unknown models, or choosing a model or effort for a role: read a profile only to handle a quirk that model shows. Profiles in `${CLAUDE_SKILL_DIR}/references/`: `fable-5-2.md`, `opus-5-5.md`, `sonnet-5-5.md`, `haiku-5-5.md`.
   - Apply only the mitigations the file's task exposes it to: an unattended-loop mitigation goes to an unattended agent, a recall mitigation to a reviewer. Never paste a whole profile into a file.
   - Write each mitigation in the target file's own voice, merged into the rule it modifies when one exists. Carry it with the `model:` and `effort:` into step 6; tune returns them as the recommendation in step 8.
   - Quoted snippets are measured wording: shorten one only by whole clauses, and keep verbatim a sentence the profile marks so.
5. Writing a body from scratch: read `${CLAUDE_SKILL_DIR}/references/example.md` first.
6. Write frontmatter, then body, then scripts and references.
7. Lint: `bash "${CLAUDE_SKILL_DIR}/scripts/lint_skill.sh" <skill-dir-or-agent-file>`. Verify every FAIL and WARN against the file, real or false alarm, and draft a fix for each real one. With a user in the session, ask through `AskUserQuestion` which fixes to apply and apply only those; dispatched as a subagent, apply none.
8. Return per Output.

## Responsibility check

One skill, one responsibility: each extra one goes to its own skill, a forked skill where it can run out of the main context. Carry more only when no split is possible.

- Fails when: the body spells out modes with disjoint instructions; it both asks the user and does heavy work; several responsibilities can apply to one task at once; it scans a large set in the main context to find change sites.
- Passes when the modes share most of their instructions and differ by a short checklist.

## Frontmatter

- `description:` triggers the skill and is the only place for "when to use": put none of it in the body.
- Write it in the third person, never "I can" or "You can": it is injected into the system prompt.
- Skills undertrigger, so write the description pushy: what the skill does, then the contexts and phrasings that fire it, indirect ones included.
- Pushy only while nothing else owns the intent. Where a bundled or sibling skill covers the generic request, state what the skill is and stop: two pushy descriptions over one intent fire the wrong skill, and the user can still name the one they want.
- A trivial request never fires a skill, however well the description matches: spend the description on the multi-step case, never on the one-shot one.
- Routing guards ("invoked only by X, never directly") live here only.
- Name and description are always in context: aim for about 100 words.
- Platform caps: name 64 chars, lowercase letters, digits and single hyphens, no reserved word (anthropic, claude); description 1024 chars, no angle brackets. Text past 1024 is truncated with no error, so the trigger words in the tail vanish.

## Body

Write `input -> work -> output`: the skill never needs to know who called it or why.

- Cut caller narrative: the caller's name, its flow, the reason for the call. Keep a line only if it stays true for a different caller sending the same input.
- Frame input-driven behaviour on the input: "if `Report path:` present -> write there", never "X hands over `Report path:`, so...".
- Keep scope boundaries, even ones naming siblings ("you own ONLY X; Y and Z are out of scope"). State the range of a rule (every item, every file) and the sources to read wherever a wrong guess is costly.
- Design the interface instead of explaining it: an argument with a closed set of values (`mode: new|refactor|split|audit`), named input fields and a fixed return shape, never prose on how to call the skill.
- Write only the delta from what the model, or a competent developer, does unprompted: every extra instruction dilutes the rest. Set the goal and the limits, leave the how to the model.
- Where a rule would restate what the surrounding code or files show, point to them: "match the comment density and naming of the surrounding code", never "comments one line max".
- Most critical and most frequent instructions first, under headings: mid-paragraph content gets unreliable attention.
- Prevent, never correct: put constraints and profiles into the generation step. A fixer pass with no objective check costs more and never converges.
- A negative example only for one known, recurring failure. Never a positive example as a template to copy: examples narrow what the model explores.
- Where output quality is critical, loop against an objective validator (a script, or a checklist read against the output): validate, fix, validate again, with the stop condition and the step to return to named in the verify step itself.
- Before a batch or destructive operation, the skill writes its plan to a file and validates that file before executing it.
- Imperative, one rule per line: "Run X", "Never Y". No hedges ("try to", "if possible", "consider", "you may want"), no politeness, no narration of how.
- One rule, one clause of why, where it lets the model handle the unlisted case. State what holds now, never the history of a decision; prose for humans goes to CLAUDE.md or the script's header comment.
- ALWAYS, NEVER and CRITICAL only on rules whose violation is irreversible or breaks a caller contract: current models overtrigger on shouted rules.
- State the action and the fallback in the rule itself; "or ask the user" only where asking is the designed behaviour.
- Bullets and sub-points over prose. Shortening never reduces precision.
- Every character is a paid token, in a body, a template and a format an agent writes or reads: cut each mark that no reader and no script uses (a checkbox nobody ticks, a decorative label, a repeated marker).
- Name an MCP tool by its full callable name, `mcp__<server>__<tool>`: a bare name may not resolve when several servers are connected.

## Progressive disclosure

Metadata loads always, the body on trigger, a bundled file only when read or executed. Place content by the moment a run first needs it, never by length.

- Every run needs it before its first action: body. One step, some runs or one decision point needs it: a bundled file read at that step, however short the body is. `references/` holds instructions, checklists, examples and domain notes; `templates/` files the skill fills or copies into its output; `assets/` files shipped unchanged.
- Typical movers: an output or report template, a one-phase checklist, a worked example, the long procedure of one branch, notes consulted at one decision.
- Bundle the artifact, not its description: an HTML mockup over a described layout, a test suite or rubric over a described acceptance bar, a real code file over a summary of its pattern.
- The pointer replaces the content: one line at the step that consumes the file, with the condition and the purpose ("Writing the report: fill `${CLAUDE_SKILL_DIR}/templates/report.md`"). Never restate the file in the body.
- Point to every bundled file from the body, never only from another reference: a file reached through a chain gets a partial read.
- Read at the step, never up front: a "read all references first" opener loads every file on every run.
- Mode selected by a parsable argument: a router script that `!`-injects only the chosen playbook, at zero extra reads.
- Several domains or variants: one reference per variant, the body holds workflow and selection only. Split a reference by step when different steps read different parts of it.
- Address bundled files as `${CLAUDE_SKILL_DIR}/...`: a relative path does not resolve from the session cwd.
- Ceiling, not trigger: body under 500 lines; a reference over 100 lines opens with a table of contents listing every `##` heading, each entry starting with that heading's text, because a partial read sees only the head.

## Scripts

Replace reasoning with a script wherever the step is deterministic: parsing JSON, sorting, compiling, searching, API calls, math. For a fragile, irreversible or order-dependent step, give the exact command and forbid changing it or adding flags.

- Clean bash only, no `jq`, no `bc`. Name every other runtime dependency (interpreter, package, CLI) in the body; the script checks for it and, when absent, exits with a message carrying the install command. Never install anything without the user's consent.
- The script handles its own error cases, and every constant carries a one-line reason.
- Tell the skill to run the script and use its output, never to redo the work by hand.

## Formatting

- No italics, no tables, no emoji.
- Never hard-wrap a paragraph.
- Never tell the agent to read project instruction files: the harness injects them.

## Audit mode

Apply the Frontmatter, Body and Progressive disclosure rules, cutting hardest in forked skills and agents: every line is paid on every dispatch.

- In an orchestrator cut prose, never the precision of its flow, gates and handoffs.
- Never compress or rephrase a model mitigation (autonomy, scope creep, reviewer recall, approvals): its wording is measured per model. Drop one only through step 4, when the file no longer runs on that model.

Also remove or fix:

- Contradicting instructions.
- Overconstraint: a rule the surrounding context or the model's judgment already decides. Delete it unless a violation is irreversible or breaks a caller contract.
- Hedged, polite or narrated instructions: rewrite each as one imperative line.
- Situation-specific guidance not scoped to its situation.
- Documentation for tools or patterns no longer used.
- Decision history or change narration ("previously", "instead of", "renamed from").
- Information repeated within or across files.
- One concept under several terms: pick one and use it everywhere.

## Output

- The created or changed files under the target skill or agent directory, or, for a role to staff, the model and effort recommendation.
- After writing or linting a file: every FAIL and WARN with its verdict (real or false alarm), the proposed fix, and the user's choice, or "not applied" when no user was in the session.
- For a new skill or a behaviour change, never for tune: three evaluation scenarios, each with the request, the expected behaviour and the model to run it on.
- Three-line summary: responsibility, trigger, deliberate omissions.
- Per model mitigation added: one line naming the model behaviour it addresses.
