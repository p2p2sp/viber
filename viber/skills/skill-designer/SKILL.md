---
name: skill-designer
description: Authoring doctrine for Claude Code skills and agents: one responsibility per skill, triggering description, imperative body, progressive disclosure, fork placement, lint, and per-model prompting profiles for Fable 5.2, Opus 5.5, Sonnet 5.5 and Haiku 5.5. Also for auditing or shrinking an existing SKILL.md or agent file, choosing `model:` or `effort:` for one, porting it to another model, or when an agent misbehaves on one model only (stops early, overreaches its scope, under-reports findings, skips parallel calls, fabricates to fill a format).
---

# skill-designer

## Input

- A request naming the skill or agent to create or change, plus any existing files.
- Optional: target directory, constraints, example inputs and outputs.

## Workflow

1. Classify the request: new, refactor, split, audit, or tune (model, effort or per-model wording only, which skips steps 2, 3, 5, 6 and 7, writes no file and ends after step 4 on the model and effort recommendation). For an existing file read it whole before touching it.
2. Run the responsibility check. If it fails or the request is a split, read `${CLAUDE_SKILL_DIR}/references/split-patterns.md` and build the split, not a bigger monolith.
3. Decide where the work runs before writing it: read `${CLAUDE_SKILL_DIR}/references/architecture.md` when the skill drives noisy tool calls, chains stages, or repeats a behaviour other skills already carry.
4. Tune for the model when the request is tune, the target is an agent or a forked skill, pins `model:`, or misbehaves on one model only. Model knowledge is as of 2026-11-17: a model with no profile below is not covered, say so and never extrapolate from a neighbour.
   - Resolve the target models: the file's `model:` frontmatter, the model its caller dispatches it with, or the request. `inherit`, an absent `model:`, or a skill that runs on the session model means several models.
   - Read `${CLAUDE_SKILL_DIR}/references/cross-model.md`: only it holds the rules several models share and the frontmatter mechanics.
   - One target model: also read its profile. Several or unknown models, or choosing a model or effort for a role: read a profile only to handle a quirk that model shows. Fable 5.2 `${CLAUDE_SKILL_DIR}/references/fable-5-2.md`, Opus 5.5 `${CLAUDE_SKILL_DIR}/references/opus-5-5.md`, Sonnet 5.5 `${CLAUDE_SKILL_DIR}/references/sonnet-5-5.md`, Haiku 5.5 `${CLAUDE_SKILL_DIR}/references/haiku-5-5.md`.
   - Apply only the mitigations the file's task exposes it to: an unattended-loop fix goes to an unattended agent, a recall fix to a reviewer. Never paste a whole profile into a file.
   - Write each mitigation in the target file's own voice, merged into the rule it modifies when one exists, and carry it with the `model:` and `effort:` into step 6; a tune request returns them as the recommendation and goes to step 8. Quoted snippets are measured wording: shorten one only by whole clauses, and keep verbatim a sentence the profile marks so.
5. Writing a body from scratch: read `${CLAUDE_SKILL_DIR}/references/example.md` first.
6. Write frontmatter, then body, then scripts and references.
7. Lint: `bash "${CLAUDE_SKILL_DIR}/scripts/lint_skill.sh" <skill-dir-or-agent-file>`. Verify every FAIL and WARN against the file, real or false alarm, and draft a fix for each real one. With a user in the session, ask through `AskUserQuestion` which fixes to apply and apply only those; dispatched as a subagent, apply none and return the findings per Output.
8. Return per Output.

## Responsibility check

One skill = one concern. Extra concerns become noise and drift, so each one goes to its own skill, preferably a fork out of the main context. Carry more only when a split is genuinely impossible, and keep the count minimal.

- Fails when: the body spells out modes with disjoint instructions; it both asks the user and does heavy work; several concerns can apply to one task at once; it scans a large set in the main context to find change sites.
- Passes when the modes share most of their instructions and differ by a short checklist.

## Frontmatter

- `description:` is the primary triggering mechanism and the only place for "when to use". Put none of it in the body. Write it in the third person, never "I can" or "You can": it is injected into the system prompt, and a shifting point of view hurts discovery.
- Skills undertrigger, so write the description pushy: what it does, then explicit contexts and phrasings that should fire it, including indirect ones.
- Pushy only while nothing else owns the intent. Where a bundled or sibling skill already covers the generic request, state what the skill is and stop, accepting the misses: two pushy descriptions over one intent fire the wrong skill, and the user can still name the one they want.
- A skill is consulted only for work the model cannot already do in one step. A trivial request will not fire it however well the description matches, so spend the description on the multi-step case, never on the one-shot one.
- Routing guards ("invoked only by X, never directly") live here and nowhere else.
- Metadata (name + description) is always in context: aim for about 100 words.
- Hard platform caps, not style: name 64 chars, lowercase letters, digits and single hyphens, no reserved word (anthropic, claude); description 1024 chars, no angle brackets. Everything past 1024 is truncated, so the trigger words in the tail vanish with no error.

## Body

Write `input -> work -> output`. The skill receives input, works, returns output; it never needs to know who called it or why.

- Cut caller narrative: the caller's name, its surrounding flow, the rationale for the call. Litmus: would the line still be true for a different caller sending the same input? Keep it. Only true of this caller's world? Cut.
- Frame input-driven behaviour on the input: "if `Report path:` present -> write there", never "X hands over `Report path:`, so...".
- Keep real scope boundaries even when they name siblings ("you own ONLY X; Y and Z are out of scope"). State the range of a rule (every item, every file) and the sources to read where a wrong guess is costly; elsewhere the model infers them from context.
- Design the interface instead of explaining it: an argument with a closed set of values (`mode: new|refactor|split|audit`), named input fields and a fixed return shape steer usage better than prose on how to call the skill.
- Document only the delta from sensible defaults. Always skip what the model already knows or a competent developer would do anyway. Set the goal and the limits, leave the how to the model, and where a rule would only restate what the surrounding code or files show, point to them instead ("match the comment density and naming of the surrounding code", never "comments one line max"): every extra instruction dilutes the rest and spends context the work needs.
- Most critical and most frequent instructions first, under clear headings. Mid-paragraph content gets unreliable attention.
- Prevention over correction: put constraints and profiles into the generation step, and a negative example only for one known, recurring failure. Never give a positive example as a template to copy: examples narrow what the model explores. A separate fixer pass with no objective check costs more and never converges. Where output quality is critical, add a loop against an objective validator (a script, or a checklist read against the output): validate, fix, validate again, with a stop condition and the step to return to named in the verify step itself. Before a batch or destructive operation, have the skill write its plan to a file and validate that file before executing it.
- Address the model in the imperative, one rule per line: "Run X", "Never Y". No hedges ("try to", "if possible", "consider", "you may want"), no politeness, no narration of how.
- One rule, one short why. A clause of rationale lets the model generalize to the unlisted case; a paragraph of rationale is narrative and gets cut. State only what holds now, never the history of a decision; prose meant for humans goes to CLAUDE.md or the script's header comment.
- Emphasis budget: ALWAYS, NEVER and CRITICAL only on the few rules whose violation is irreversible or breaks a caller contract. Current models overtrigger on shouted rules, and shouting everything ranks nothing.
- State the action and the fallback in the rule itself; "or ask the user" appears only where asking is the designed behaviour.
- Bullets and sub-points over prose, closer to code than narrative. Shortening never reduces precision.
- Name an MCP tool by its full callable name, `mcp__<server>__<tool>`: a bare tool name may not resolve when several servers are connected.

## Progressive disclosure

Three layers load at different times: metadata always, body on trigger, bundled files only when read or executed. Place content by the moment an invocation first needs it, never by total length: what every run needs before its first action goes in the body; what one step, some runs, or a single decision point needs goes in a bundled file read exactly at that step.

- Litmus per paragraph: does every invocation need this before it starts working? Yes -> body. No -> `references/` (instructions, checklists, examples, domain notes), `templates/` (files the skill fills or copies into its output: output formats, boilerplate, seed configs) or `assets/` (files shipped unchanged: images, fonts, static pages), regardless of how short the body already is.
- Typical movers: an output or report template, a checklist for one phase, a worked example, the long procedure of one branch, notes consulted once at a decision. Inlined, each costs full context on every run; on demand, near zero on the runs that skip it.
- Bundle the artifact, not its description: an HTML mockup over a described layout or a screenshot, a test suite or rubric over a described acceptance bar, a real code file over a summary of its pattern. A file in code carries the detail prose loses.
- The pointer replaces the content: one line at the exact step that consumes the file, stating the condition and the purpose, e.g. "Writing the report: fill `${CLAUDE_SKILL_DIR}/templates/report.md`" or "If the check fails, read `${CLAUDE_SKILL_DIR}/references/split-patterns.md`". Never restate the file in the body. Point to every bundled file from the body, never only from another reference: a file reached through a chain gets previewed with a partial read, not read whole.
- Read at the step, never up front. A "read all references first" opener loads every file on every run and cancels the layer; a file read before its step is body text with extra tool calls.
- Mode selected by a parsable argument: a router script that `!`-injects only the chosen playbook beats references, because it costs zero extra reads.
- Multiple domains or variants: one reference per variant, body holds workflow and selection only. Split a reference by step when different steps read different parts of it.
- Address bundled files as `${CLAUDE_SKILL_DIR}/...`; a relative path does not resolve from the session cwd.
- Ceiling, not trigger: body under 500 lines; a reference over 100 lines gets a table of contents at the top listing every `##` heading, each entry starting with that heading's text, because a partial read sees only the head.
- The agent can read any bundled file even if undocumented; still name the ones that matter and the step that needs them.

## Scripts

Replace reasoning with a script wherever the step is deterministic: parsing JSON, sorting, compiling, searching, API calls, math. Scripts are repeatable, cheaper and pre-tested. The same holds for a fragile, irreversible or order-dependent step even when it needs judgment around it: give the exact command and forbid changing it or adding flags.

- Clean bash only, no `jq`, no `bc`. Name every other runtime dependency (interpreter, package, CLI) in the body; the script checks it is present and, if not, exits with a message carrying the install command. Never install anything without the user's consent.
- The script handles its own error cases instead of failing for the model to sort out, and every constant carries a one-line reason.
- Tell the skill to run the script and use its output, not to redo the work by hand.

## Formatting and don'ts

- Clean text: no italics, no tables, no emoji.
- Do not chop paragraphs into multiline text.
- Do not instruct the agent to read project instruction files; the harness injects them.

## Audit mode

Review like a codebase and remove mercilessly, everything costs context. Cut hardest in forked skills and agents: they run usually many times, so every line is paid on every dispatch. An orchestrator stays exact about its flow, gates and handoffs: cut its prose, never its precision, since bare instructions drift less than narrated ones. Never compress or rephrase a model mitigation (autonomy, scope creep, reviewer recall, approvals): its wording is measured per model, so drop one only through step 4, when the file no longer runs on that model. Beyond the Frontmatter, Body and Progressive disclosure rules above, hunt for:

- Contradicting instructions.
- Overconstraint: a rule where the surrounding context or the model's own judgment already decides. Delete it unless a violation is irreversible or breaks a caller contract.
- Hedged, polite or narrated instructions: rewrite each as one imperative line.
- Situation-specific guidance never scoped to its situation.
- Documentation for tools or patterns no longer used.
- Decision history or change narration ("previously", "instead of", "renamed from").
- Information repeated within or across files.
- One concept named by several terms: pick one and use it everywhere.

## Output

- Created or changed files under the target skill or agent directory, or, for a role to staff, the model and effort recommendation.
- For a request that wrote or linted a file, the lint result: every FAIL and WARN with its verdict (real or false alarm), the proposed fix, and the user's choice, or "not applied" when no user was in the session.
- For a new skill or a behaviour change, never for a tune request: three evaluation scenarios, each the request, the expected behaviour and the model to run it on.
- Three-line summary: responsibility, trigger, deliberate omissions.
- Per model mitigation added, one line naming the model behaviour it addresses.
