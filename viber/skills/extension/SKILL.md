---
name: extension
description: Creates or adapts an agent in the project's .claude/agents/ that a viber build runs at its close, just before the run is archived, with one forked skill in .claude/skills/ per phase when its work runs in phases one after another, and registers it as an entry of build.extensions in .claude/viber.yml. Use when the project needs a closing step of the project's own, for example end-user help files written after every task is committed.
allowed-tools: AskUserQuestion, Skill, Read, Write(./.claude/agents/**), Edit(./.claude/agents/**), Write(./.claude/skills/**), Edit(./.claude/skills/**), Bash(${CLAUDE_PLUGIN_ROOT}/skills/extension/scripts/extension.sh:*), Bash(${CLAUDE_PLUGIN_ROOT}/skills/extension/scripts/extension.sh --add:*)
user-invocable: true
disable-model-invocation: true
---

# extension

```!
"${CLAUDE_PLUGIN_ROOT}/skills/extension/scripts/extension.sh"
```

The block above is this project's extension state as the script measured it: `CONFIG=` (`ok`, `no-config` or `stale`), `LISTED=` (the entries of `build.extensions` that have an agent file, in run order), `MISSING=` (the entries with none, or invalid) and one `AGENT=<name> | contract | plain` line per file of `.claude/agents/`, `contract` meaning it already carries the extension marker. It is trusted: never open `.claude/viber.yml`, never list `.claude/agents/` yourself.

## 1. Gate and report

`CONFIG=no-config` or `CONFIG=stale` -> say the configuration is missing or has no `extensions:` key under `build:`, name `/viber:setup`, and stop: nothing is written, nothing is added.

Otherwise report in one short block: the listed names, the missing ones, and each agent with `contract` or `plain`.

## 2. Create or adapt

One `AskUserQuestion`: create a new agent, or adapt an existing one. Offer `create new` plus one `adapt <name>` option per `AGENT=` line while the list fits; past that, offer `create new` and `adapt an existing one`, and take the name from the free answer. No `AGENT=` line -> there is nothing to adapt: say so, ask nothing and create.

## 3. Interview

One prose message, five questions, then wait for the answer:

- what the agent produces
- where it writes, as repository-relative paths
- in which language
- from which inputs: the run's specification, its notes, the build's commits, files of the project
- whether the work runs in phases one after another, and if so each phase's name and what it produces for the next

On adapt, add what the agent should keep doing as it is. The name of a new agent is the user's: lowercase letters, digits and hyphens, starting with a letter or a digit. Ask nothing else.

## 4. Write the agent and its phase skills

Read `${CLAUDE_SKILL_DIR}/templates/extension.md` and `${CLAUDE_SKILL_DIR}/references/authoring.md` now, and write every file below by the authoring rules.

- Create -> fill the template into a new `.claude/agents/<name>.md` with `Write`: the `name`, a `description` that says what the agent produces and ends with the template's fixed closing sentence, and the task section from the interview answers. Keep every other line of the template as it stands.
- Adapt -> `Read` the agent, then `Edit` it, never a rewrite: keep its own role and rules, and add or correct only what the template carries that the file lacks (marker line, input lines, the way to find the build's commits, the output vocabulary, the bans, the refused-tool paragraph, `Stop what you started`, the read-back). Its `description` gains the closing sentence.
- Phases in the answers -> one forked skill per phase, so no phase's tool output fills the agent's context: `Write` each new `.claude/skills/<name>-<phase>/SKILL.md`; a phase skill that already exists is `Read`, then `Edit`ed, never rewritten. Wire the agent to them as the authoring rules' Task section says.
- Write only under `.claude/agents/` and `.claude/skills/`. Read each file's tail back after the write and delete a leaked bare closing tag.

Invoke `viber:skill-designer` through `Skill` once, naming the agent file and every phase skill directory written in this run in that one invocation: its step 7 asks the user and applies the chosen fixes; apply nothing more. `viber:skill-designer` absent from the skill listing -> say in one line that the review was skipped, call no `Skill`, and go on to step 5.

## 5. Register

Run one literal line, nothing chained after it:

```
"${CLAUDE_PLUGIN_ROOT}/skills/extension/scripts/extension.sh" --add <name>
```

- `STATUS=added` -> the name became an entry of `build.extensions` holding `parallel: false`: the agent runs alone. Tell the user to set that entry's `parallel` to `true` in `.claude/viber.yml` to run the agent together with the parallel entries next to it.
- `STATUS=present` -> the name already has an entry in `build.extensions`: the entries are left as they are.
- `STATUS=no-config` or `STATUS=stale` -> the agent file stays, nothing was registered: name `/viber:setup` and stop.
- `STATUS=invalid-name` -> ask for another name and rename the file, then run the line again.

## 6. Close

Nothing is staged and nothing is committed: say the agent file, every phase skill and `.claude/viber.yml` sit in the working tree for the user to commit. End on one line telling the user to reload the session before a build uses the agent, because the harness loads a new agent file only at session start.
