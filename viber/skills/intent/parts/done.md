The summary is confirmed. Take the first branch that applies:

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" github.issues "${CLAUDE_SKILL_DIR}" issues-done
```

```!
"${CLAUDE_PLUGIN_ROOT}/scripts/switch-text.sh" branching.""mode "${CLAUDE_SKILL_DIR}" branching-handoff
```

Hand off, reached after any issue save and branch re-settle and never after a "Stop" answer. The content is the confirmed summary in the conversation's language (problem, acceptance criteria, out of scope, binding constraints, unknowns each with its way to resolve it), then each signal line that applies, one per line: `Issue: <URL>`, every `Attachment: <absolute path>` of the conversation (`viber:prototype`'s hand-off included) exactly as written, `Work:` / `Branch:` / the run branch line, `Roadmap: <path>`, the user's request to stop at a specification, the draft run key.

- Outside plan mode: get the stamp with `date +%Y-%m-%d-%H-%M-%S`, `Write` that content to `<project root>/.temp/viber/intent/summary-<YYYY-MM-DD-HH-MM-SS>.md`, then invoke the `viber:planner` skill with that absolute path (forward slashes, a Windows drive as `C:/`) as its only argument.
- While plan mode is active (only the plan file may be written): write no file; invoke `viber:planner` restating the confirmed content verbatim in that invocation.
