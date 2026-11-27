---
name: intent
description: Planning interview - asks, what the conversation and the code leave open. When a change looks like it needs a plan and no confirmed interview or fixer diagnosis is in context, keep talking with the user and suggest, in one line, this interview; invoke it only after the user agrees or asks to plan, design or be interviewed. Not for a change the user asked to make directly, without a plan.
allowed-tools: Read, Grep, Glob, WebSearch, WebFetch, Agent, AskUserQuestion, Skill
---

# Intent

Run `ExitPlanMode` first, if plan mode is active.

Interview the user until you reach a shared understanding. Map the topic as a design tree: every decision branches into the decisions that hang off it. Until the user confirms that understanding, change nothing and build nothing.

## Rounds

The frontier is every decision whose prerequisites are settled: the questions you can ask now without guessing at answers you have not heard yet.

1. Ask the frontier in one round of at most 5 questions, in prose, never through `AskUserQuestion` (only the final confirmation uses it). Questions past the fifth stay in the frontier for the next round. A question whose answer depends on another question still open in this round belongs to a later round.
2. Wait for the user's answers.
3. Recompute the frontier from the answers: settled decisions unblock the questions that depended on them. Ask the next round.

Number the questions, give each your recommended answer. "yes" accepts all recommended answers in round.

Each option is the final text of its decision, since "yes" settles it: every value with its unit and boundaries (a day: from when to when), every group by its members, never an example value.

Format (never more than 3 options):
```
**1** - **<question title>**: <question body, might be multiple paragraphs>

`1.1` Recommended - <your recommended answer>
`1.2` - other option
`1.3` - another option

---

**2** - **<question title>**: <question body, might be multiple paragraphs>

`2.1` Recommended - <your recommended answer>
`2.2` - other option
`2.3` - another option
```

## Facts and decisions

- Finding facts is your job: never ask the user for anything you could look up yourself.
- A question needs a fact from the environment (filesystem, tools): dispatch an `Explore` sub-agent in a fresh context window.
- A running exploration is an unsettled prerequisite: hold back only the questions downstream of it and ask the rest of the frontier now, within the round limit.
- A change that alters or removes existing behaviour: have `Explore` find what relies on that behaviour (callers, tests asserting it, docs stating it). Each one whose own observable behaviour would change is a decision: it changes too, or it must keep working.
- Decisions are the user's: put each one to them and wait, never settle one yourself.

## Done

The interview ends when the frontier is empty: every branch of the tree visited, no exploration still running, nothing silently assumed. Then state the shared understanding in prose and ask the user to confirm it through one `AskUserQuestion` call, every field in the conversation's language.

If the interview shows that the change touches the UI and no prototype of it exists yet, propose running the `viber:ui-prototype` skill by adding the Prototype option; otherwise hide that option.

Format:

```
header: "Intent"
question: "<the change in one sentence>. Is this understanding correct?"
multiSelect: false
options:
  - label: "Spec -> Plan -> Build"
    description: "Full path: spec, task plan, build by agents"
  - label: "Short plan -> Build"
    description: "Skip the spec: approve a short plan, build in a fresh context"
  - label: "Build now"
    description: "No plan: build in this session from what was settled"
  - label: "Prototype"
    description: "Build an HTML mockup of <the UI part> first, then return to this question"
```

- Spec -> Plan -> Build: invoke the `viber:spec` skill.
- Short plan -> Build: invoke the `viber:simple-plan` skill.
- Build now: invoke the `viber:implementor` skill.
- Prototype: invoke the `viber:ui-prototype` skill.
