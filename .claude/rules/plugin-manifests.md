---
paths:
  - "*/.claude-plugin/plugin.json"
  - ".claude-plugin/marketplace.json"
---

# Plugin manifest shape

- Two-space indent, a trailing newline, no trailing commas.
- Write a `skills[]` entry as the skill's DIRECTORY, with both a leading `./` and a trailing slash: `"./skills/rules/"`. Write an `agents[]` entry as the file itself: `"./agents/rules-writer.md"`.
- Keep `skills[]` in pipeline order rather than alphabetical: viber lists setup, talk, triage, issue-create, prototype, intent, planner, implementor, fixer, e2e, pr-create, pr-feedback, pr-feedback-reply, memory, rules, extension, code-auditor, help, handoff, commit, pro-designer, idea-validator, skill-designer - the order a user meets them in, with the workers the chain pulls in sitting where they are first reached, `help`, `handoff` and `commit`, used at any point, after them, and the domain skills outside the pipeline last.
- NEVER add a `"hooks"` field. Claude Code auto-loads `hooks/hooks.json` from that path, and a `hooks` field in `plugin.json` is a hard install error.
- Carry the author block verbatim (`Dariusz Lenartowicz` / `dariusz.lenartowicz@p2p2.com.pl`). `version` is written by `.github/scripts/release.sh`, never edited by hand.
- Renaming the plugin updates this file, `.claude-plugin/marketplace.json` and the root `README.md` together.
