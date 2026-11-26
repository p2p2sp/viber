---
name: setup
description: Prepares a project for viber - seeds .claude/viber.yml, .gitignore and the recommended .claude/settings.json permissions (asking whether to merge into or reset an existing one that differs from them), checks the gh CLI is installed, checks whether CLAUDE.md names the build and test commands.
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/bootstrap.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/skills/setup/scripts/merge-settings.sh:*), Read
user-invocable: true
disable-model-invocation: true
model: haiku
---

# setup

```!
"${CLAUDE_SKILL_DIR}/scripts/bootstrap.sh"
```

The lines above are the result. They are idempotent and self-verifying: report them as they stand, never re-check them.

The settings file is the one choice. On `ASK:`, ask with one `AskUserQuestion` (a prose question ends the turn and the script's pre-approval with it) which of its two `<name> -> <command>` options to run, described as:

- merge - fill in what is missing: the template's value wins a conflict, lists only gain entries, a template entry in `permissions.ask` leaves the host's `permissions.deny`, a key the template lacks is never touched.
- reset - replace the file with the template; the old one is kept in `.temp/viber/setup/`.

Run the chosen command once. A `RUN:` line runs once as printed. With neither, the file matches the template: its `settings.json:` line is the settings line. The command's line is carried into the close literally, never re-verified or retried; a non-zero exit is trusted the same way.

Then check the project's `CLAUDE.md` against the preload's `CLAUDE.md:` line:

- Never edit `CLAUDE.md`.
- `CLAUDE.md: present - <path>` - read that file with `Read`, fresh, never from session context. Five items count. The build, the whole test suite, a single test file and the fast command (every test but the integration and end-to-end ones) each count as named only when the file contains its literal command. The layer marker convention counts as named when the file states how a test is tagged with its layer.
- All five named - the line is `CLAUDE.md: names the build, test, single-test-file and fast commands and the layer marker convention`.
- Any item not named - the line is `CLAUDE.md: missing <the missing items> - paste this prompt:`, followed by the content of `${CLAUDE_SKILL_DIR}/templates/claude-md-prompt.txt`, read with `Read`, verbatim in a code block.
- `CLAUDE.md: missing` - read no `CLAUDE.md`; the line is `CLAUDE.md: missing - run /viber:memory, which writes the short root`, with no prompt block.

Close with one line per item: the preload's lines except its `settings.json:`, `CLAUDE.md:`, `ASK:` and `RUN:` ones, the settings line (the command's, or the preload's on a match), and the `CLAUDE.md:` check line with its prompt block when it has one.
