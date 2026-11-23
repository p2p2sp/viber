The summary is confirmed. Take the first branch that applies:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-done
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-handoff
```

Hand off, reached after any issue save and branch re-settle and never after a "Stop" answer. The content is the confirmed summary in the conversation's language (problem, acceptance criteria, out of scope, binding constraints, unknowns each with its way to resolve it), then each signal line that applies, one per line: `Issue: <URL>`, every `Attachment: <absolute path>` of the conversation (`viber:prototype`'s hand-off included) exactly as written, `Work:` / `Branch:` / the run branch line, `Roadmap: <path>`. Each `Attachment:` under `.temp/viber/prototype/` adds one acceptance criterion: the built screen reproduces that mockup's structure, element order, visible texts, states and interactions, every element but those marked `data-mock`, and each of its `Mockup remarks:` lines word for word.

- Outside plan mode: run `"${CLAUDE_SKILL_DIR}/scripts/summary-path.sh"`, `Write` the content to its `path:`, then invoke the `viber:planner` skill with that absolute path as its only argument.
- While plan mode is active (only the plan file may be written): write no file; invoke `viber:planner` restating the confirmed content verbatim in that invocation.
