---
paths:
  - "*/agents/*.md"
---

# Agent frontmatter

- End the `description` with "Invoked only by <caller>, never directly." Every agent does: `Invoked only by the code-auditor skill, never directly.` (`viber/agents/critic.md`), `Invoked only by the implementor skill, never directly.` (`viber/agents/task-coder.md`).
- Declare `tools:` and `model:` explicitly on every agent - every one carries both. `tools:` is the agent-side equivalent of a skill's `disallowed-tools`: it is the actual restriction, so a read-only agent lists only the readers (`viber/agents/outside-plan-review.md` has `tools: Read, Grep, Glob`). Never add `Bash` to a read-only agent: on native macOS and Linux builds `Bash` in `tools:` removes `Glob` and `Grep`.
- Write the fields in the order `name, description, tools, model, effort, color` and give every agent a `color:`. No agent carries `background:`: its default is already `false`, and `true` would only pin the agent in the background when its caller asks for the foreground. The field is a skill's too, with the opposite default: `viber/skills/commit/SKILL.md` keeps `background: false` so its `context: fork` result is awaited.
- Set `effort:` on an agent pinned to `model: haiku` as on any other tier: Haiku 5.5 honours it, so `viber/agents/scout.md` carries `effort: medium`. An agent dispatched across tiers carries one value for all of them: `viber/agents/task-coder.md` has `effort: medium`.
- Open the body with the agent's role and state that its input is fully resolved so it never asks the user: "Input is fully resolved - never ask the user." (`viber/agents/memory-writer.md`, `viber/agents/qa-writer.md`), or the role sentence "You are a Senior Developer..." followed by the fixed order of its steps (`viber/agents/task-coder.md`).
- Register the file in the owning plugin's `.claude-plugin/plugin.json` `agents[]` in the same edit that adds, renames or removes it. A worker must never appear in both `agents[]` and `skills[]`.
- No agent carries `permissionMode:`: plugin subagents ignore the field, so it decides nothing at any dispatch.
