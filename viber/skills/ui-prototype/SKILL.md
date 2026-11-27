---
name: ui-prototype
description: HTML mockup of a UI change in the project's own look, one proposal or three variants. Use when the user wants to see or compare a UI change before planning it.
argument-hint: "[the UI change]"
allowed-tools: Read, Grep, Glob, Agent, Skill, AskUserQuestion, Edit(./.temp/viber/ui-prototype/**), Bash(${CLAUDE_SKILL_DIR}/scripts/open-page.sh:*)
---

# ui-prototype

Turn a UI change into one mockup the user sees in the browser, settle it in conversation, then carry the conclusions on. `viber:prototype-writer` alone writes and edits the mockup: never write or edit it yourself, and never edit host code.

Use `Skill` only for `viber:intent`.

Every script run is one literal Bash line spelled as in this skill: never prefixed with an interpreter word, never assigned to a variable, never preceded by `cd`, never chained with `;`.

`<root>` is the project root; every path below is absolute.

## 1. First question

Open with one line naming what you take as settled from the conversation and the argument. Then ask one `AskUserQuestion`: one proposal, or three alternative scenarios to choose from?

## 2. UI conversation

- Ask only what the conversation and the code leave open about the screen: layout, hierarchy, content, states, flow between screens, style. Read the screen first: never spend a question on what the code states.
- One question per message, never stacked in prose.
- Data, logic, an API, persistence, performance or scope beyond the screen -> never pursue it: say in one line that it is parked as an open point outside UI, and keep it for the conclusions.
- Nothing left open about the screen -> dispatch the writer.

The mockup path is `<root>/.temp/viber/ui-prototype/<slug>.html`, `<slug>` a short kebab-case name of the change. It stays the same for the whole run.

## 3. Writer dispatch

`Agent` with `subagent_type: viber:prototype-writer`, one labelled line each and nothing else. Pass no `model:`.

- `file: <the mockup path>`
- `mode: one` or `mode: three` - what the file holds before this round: the first answer on `create`, always `three` on `narrow`, always `one` after a narrow.
- `round: create`, `round: revise` or `round: narrow`
- `variant: <A|B|C>` - on `narrow` only.
- `brief:` - on `create` only, the settled UI conclusions on the lines below it.
- `remarks:` - on `revise` only, the user's change requests on the lines below it.

Branch on its `VERDICT:` line:

- `PASS` -> name what the mockup shows, one line per `VARIANT:` line, and its basis in one plain line: `design-system` built from the project's design system, `code` styled from the project's code, `brief` no UI code found, so it follows the conversation alone.
  - The run's first PASS -> run `"${CLAUDE_SKILL_DIR}/scripts/open-page.sh" "<FILE value>"` and show its line as it stands; any line but `opened in the browser` already tells the user where to open it by hand, and the conversation goes on.
  - Every later PASS -> remind the user to refresh the tab. Never run `open-page.sh` again.
  - Close on one `AskUserQuestion`; a change request travels through its free-text field:
    - One variant -> `Ready` or `Change it` (the change typed in its free-text field).
    - Three variants -> `Keep A`, `Keep B`, `Keep C` and `Ready`.
- `FAIL` -> show its `REASON:`, ask in prose for what is missing, end the turn. The answer re-dispatches the same round.
- `DENIED` -> quote its `REASON:` and `REFUSAL:` lines, ask through one `AskUserQuestion`: retry, or stop. Retry -> the same dispatch again.

## 4. Revision loop

Read the user's answer:

- Change requests, typed as the free-text answer or with `Change it` -> `round: revise` with them as `remarks:`.
- `Change it` with no change typed -> ask in prose what to change, end the turn.
- A variant picked while the mockup holds three -> `round: narrow` with that `variant:`. A pick when it holds one, or a variant it does not hold -> say so and ask again.
- Anything outside the screen -> park it as in step 2.
- Ready while three variants remain -> ask through one `AskUserQuestion` which one to keep; the pick runs the narrow round first.
- Ready -> step 5.

## 5. Exit

Print the conclusions, in the user's language: the change, the chosen variant and why (a three-variant run), the UI decisions, `Mockup remarks:` the user's change requests verbatim, the open points outside UI, and one line `Mockup: <the mockup path>`.

- An interview in this conversation still awaits its confirmation -> fold the conclusions into its shared understanding and ask its confirmation question again.
- No such interview -> one `AskUserQuestion`: hand off to `intent`, or stop.
  - Hand off -> invoke `viber:intent` with the conclusions as its argument.
  - Stop -> name the mockup path and end the turn.
