# {{Title}}

{{Optional. The change in a few words.}}

## Goal

{{2-4 sentences: the problem, who has it and why it matters. No description of the solution.}}

## Requirements

- R1: {{One observable, checkable condition per requirement; an edge case is a requirement too. A change to existing behaviour ends with `[CHANGED - was: ...]`, a removed behaviour with `[REMOVED - reason: ...]`. Given/When/Then, indented under the requirement, only where one sentence is not enough.}}

## Out of scope

- {{What the change leaves untouched although a reader could expect it to change.}}

## Must not change

- {{Conditional. Working behaviour this change could break.}}

## Decisions

- D1: {{Conditional. The choice, the strongest rejected option, the reason. A decision the agent made, not the user, ends with `[agent]`.}}

## Contracts

{{Conditional. Only shapes visible from outside: API, data schema, configuration key. Internal signatures belong to the plan. The only section where a code block is allowed.}}

## Constraints

- {{Conditional. Compatibility, data, performance, security, with a number wherever one exists.}}

## Tests

{{Conditional. The highest existing seam at which the requirements are visible, and the test layer. No list of tests.}}

## Root cause

{{Conditional, bugs only. 1-3 sentences on the cause, not the symptom.}}
