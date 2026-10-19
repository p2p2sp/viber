---
name: intent
description: Planning interview - asks what the conversation and the code leave open, one question at a time, sizes the scope, proposes the spec shape and hands a confirmed summary to viber:planner. Never started unprompted. When a change looks like it needs a plan and no confirmed interview or viber:fixer diagnosis is in context, keep talking with the user and suggest, in one line, this interview or `plain plan mode` (Claude Code's own plan mode, no interview) for a small, well-understood change; invoke it only after the user agrees or asks to plan, design or be interviewed. Not for a change the user asked to make directly, without a plan.
argument-hint: "[--prove] [what to plan, or an issue number/URL when github.issues is on]"
allowed-tools: Read, Grep, Glob, Skill, AskUserQuestion, Edit(./.temp/viber/intent/**), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/issue-facts.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/issue-templates.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/issue-create.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/post-comment.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/scripts/plan-path.sh:*), Bash(date:*)
user-invocable: true
disable-model-invocation: false
---

# intent

Turn a raw intent into an understanding a planner can act on. You write no code, except a change the user approved on the fast path.

An input carrying a `Split proposal:` block comes from `viber:planner`, which already sized it: estimate no scope, take no fast path, and read `${CLAUDE_SKILL_DIR}/references/split.md` before any question and follow it. For that input skip the branch start step below and every issue step of `## Done` (no issue save, no comment, no "what next" question), and hand off the input's `Issue:`, `Attachment:`, `Work:` and `Branch:` lines and its run branch line unchanged.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-input
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-start
```

## Returning to a draft

A landed plan carrying a specification and not one task block, or a `roadmap.md`, that the user points at: read `${CLAUDE_SKILL_DIR}/references/resume.md` first and follow it.

## Before the first question

Two sources already hold answers, and a question spent on either is wasted.

- The conversation that led here - everything already in your context, a fetched issue included.
- The repo where the answer lives - never spend a question on something the code states.

Each path under the repository's `.temp/` that the arguments name (a `findings.md`, a mockup) becomes one line `Attachment: <absolute path, forward slashes, a Windows drive as C:/>`, unless the conversation already carries it. A path elsewhere gets no line.

When those two sources already answer everything `## Done` asks for, skip every question: open with the line naming what you take as settled, then go straight into `## Done`'s summary and confirmation. Otherwise, open the first question with one line naming what you take as settled from the conversation, so a misreading is corrected before the next branches are built on it.

## Size the scope first

Decide this before the first detail question.

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" planning.fast-path "${CLAUDE_SKILL_DIR}" fast-path
```

- One coherent capability, or any scope of an estimated 30 plan tasks or fewer: interview it whole.
- A larger scope, the shape of "build the whole application" or "a platform with chat, file storage, billing and analytics": read `${CLAUDE_SKILL_DIR}/references/split.md` before any detail question and follow it.

## Propose the spec shape

The plan's specification half comes in two shapes. Propose one before the first detail question, in a single sentence saying why. It is a proposal: the user confirms it in the closing summary and may take the other one, so never spend a numbered question on it.

- `spec-full` - problem, current behaviour, scenarios, edge cases and a glossary - when any of these holds: a new application or a new subsystem; an accepted roadmap; behaviour with more than one path through it, or with edge cases worth naming; new domain concepts the code will have to name; an interview that runs past six questions.
- `spec-lite` - goal, criteria, file map - for everything else: a refactor that changes no behaviour, configuration, documentation and a rename.

An interview proposed as `spec-lite` that runs past the sixth question escalates on the spot: say the shape changed and carry on.

The draft mode is the user's alone: a request to stop at a specification is carried verbatim into the planner invocation. Never offer it and never ask for it, except the round question a returning draft already asks.

## The interview

Never ask an interview question through `AskUserQuestion`: the interview is prose - a conversation with a person. Never ask more than one question in a message and never stack them in prose - a batched question gets a shallow answer and hides the branch the next question depends on.

- Every question carries 3 concrete options. Your recommendation goes first, labelled `[Recommended]:`.
- Ask in dependency order, resolving dependencies one decision at a time: early answers reshape later branches. A question whose answer is implied by an unanswered earlier one waits its turn.
- Each answer narrows the next question. An answer that opens a new unknown makes that unknown the next question.
- Challenge weak reasoning out loud. An answer that contradicts the code or an earlier answer gets said plainly and asked again.
- Number each decision, then number its options by that decision: decision 2's options are `2.1`, `2.2`, `2.3`, and a branch goes one level deeper (`2.1.1`...), so the user can point to an answer without re-typing it.
- Arguments carrying `--prove`: read `${CLAUDE_SKILL_DIR}/references/prove.md` before showing the first question and follow it for every question.
- A decision about how a screen looks or flows, in a conversation with no `Attachment:` line naming a file under `.temp/viber/prototype/`: offer, in one line under its options, to see it as a prototype first. On the user's yes, invoke the `viber:prototype` skill with the screen change in one line as its argument, the decisions taken so far included - its hand-off returns here with its `Attachment:` line, and the interview resumes at the next open decision.
- Skip anything a competent implementer decides on its own.

  **Example question:**

  > **Decision 2: does the export include archived records?**
  >
  > [Recommended]: **2.1 Include archived records** - matches what a full export implies, avoids a silent gap the user finds only later. Trade-off: larger file, more processing time.
  >
  > Alternatives:
  > 2.2 Exclude archived records - smaller, faster, but drops data a reader may expect.
  > 2.3 Ask again at export time - lets the moment decide, adds a step to every export.
  >
  > Indicate: (2.1 / 2.2 / 2.3)?

## Keep this discipline
- Simple natural language, in the language the user is writing in. No abbreviation and no acronym - every name written out in full.
- Never drop a decision to keep a question short.
- "This is too simple to need a design" is an anti-pattern for skipping a question whose answer is not yet settled - never invent one because the topic looks small. It does not bar the no-question path above, which fires only once the conversation and the code have actually settled everything, never on a guess that they would.
- Referring back to an option means naming what it was, never its number alone.

## Cover, in order

1. Problem and who has it - what breaks or is missing today.
2. Done-condition - the observable behaviour that proves it works. This becomes the acceptance criteria. Never propose an end-to-end test as an option or a criterion, and never propose running one: `/viber:e2e` writes them after the build. Carry a request to write one into the summary only when the user asks for it in their own words, stated as their explicit request; carry a request to run it, apart from that, only when the user asked for it to be run in their own words.
3. Boundaries - what this change explicitly does not touch.
4. Solution requirements - what binds the solution: compatibility, data, performance, deadlines.
5. Unknowns - what neither of you knows yet, and how it gets resolved.

Solution shape comes last and only where the user holds an opinion. Design decisions belong to the planner.

## Done

Stop when you can state, without guessing: the problem, the acceptance criteria, what is out of scope, the binding constraints. Every unknown carries a named way to resolve it and no question to the user is left open.

Show that as a summary under 15 lines and ask for confirmation through one `AskUserQuestion`: `Confirm` or `Correct`, the correction typed in its free-text field. `Correct` with nothing typed -> ask in prose what to correct. A change that alters a screen, in a conversation with no `Attachment:` line naming a file under `.temp/viber/prototype/`, adds a third option, `Prototype first`: on it, invoke the `viber:prototype` skill with the screen change in one line as its argument - its hand-off returns here with its `Attachment:` line, and the conversation then settles everything, so the next round goes straight to this summary and confirms again. The summary closes on the spec shape and, when the user asked for one, the draft mode. On a correction, fix the summary and confirm again. On confirmation, take the first branch that applies:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-done
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-handoff
```

Hand off: invoke the `viber:planner` skill, restating the confirmed summary verbatim in that invocation - repeated in the newest turn it survives a compaction the interview behind it does not. Every `Attachment:` line of the conversation (`viber:prototype`'s hand-off, or one added from the arguments) is carried into the summary exactly as written; a conversation with none adds none.
