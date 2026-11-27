# Execution architecture

Every tool response, MCP payload and fetch stays in the conversation for the rest of the session: over a long run the window fills, auto-compaction summarises earlier turns, and late items get thinner work than early ones. Optimise what a skill invokes before its length. Three moves stack: isolate with `context: fork`, compress with file handoff, preload with `!`.

## Fork

`context: fork` runs the skill in an isolated subagent on a snapshot of the conversation. Only its final return value reaches the caller, never its tool calls, file reads or reasoning. Forked skills nest: an orchestrator and each of its stage skills can all fork.

- Single task with noisy tool calls: fork alone is usually enough.
- Chain of stages: fork plus file handoff plus preload. Drop one and the noise returns.
- Return one short line, never the raw output: a verdict plus a path, `VERDICT: PASS`, or `VERDICT: FAIL` with `REVIEW: <path>`.

Never fork when:

- The skill asks the user mid-run: `AskUserQuestion` runs only in the main session. Split it, see `split-patterns.md`.
- The user keeps reasoning over the output in the main chat: the fork discards everything but its return value.
- The skill is reference or doctrine with no task to run.
- The run often has nothing to do: bail early first, fork second.

Model and effort come from the model tuning step: an unpinned forked skill runs on the session model, an unset `effort:` on that model's default.

## File handoff

A chained skill writes intermediate state to files: the stage that produced the raw data distils it, downstream stages read only the distillate.

- Fork saves the sub-skill's context, files save the orchestrator's: without files the orchestrator holds every stage's payload, with files one confirmation line each.
- Pass paths, never payloads: short fields inline as args, anything large or multiline as a path.
- Write run-scoped state under `.temp/<skill>/<slug>/`, so parallel runs do not collide. Sweep old slug directories.
- Distil, never dump: a 4000-token intermediate file defeats the handoff.
- Keep no long-lived state inside the skill directory: an upgrade can wipe it.

Split the stages into sub-skills when they plausibly run standalone, are reused by more than one orchestrator, each drive noisy tool calls, or one must be debugged without rerunning the chain. Keep one skill when the stages are tightly coupled and the data between them is small.

## Preload with `!`

A backticked `!` command in the body runs before the model reads the skill, and its output replaces the expression: no tool call, no read round trip.

- Filter in the shell: sort, slice and cut so only the needed rows enter the prompt. The output still costs its tokens.
- A missing file substitutes an empty string with no error: guard with `|| echo <fallback>`.
- Never preload a mutating command: it runs on every skill load.
- Never splice `$ARGUMENTS` into a quoted string: a literal quote, backtick or paren in the args breaks the shell and the injection comes back empty. Pass it single-quoted as one argument to a bundled script that parses it with bash builtins, and state in the description or `argument-hint` that the arguments never carry an apostrophe.
- `$ARGUMENTS` substitutes inside a forked skill too, including one dispatched through the `Skill` tool.
- Single-quote any argument carrying `?`, `*` or `[`: an unmatched glob is a literal under bash but aborts the whole preload under zsh.
- Pre-approve the preload with a pattern entry in `allowed-tools` and call the bundled script directly, never through an interpreter: a bare `Bash` allowance does not cover it, and an unmatched preload aborts the load, so the forked skill starts with no input.
- Shell execution can be disabled by policy: never make correctness depend on a preload.

## Skill or agent

A skill is a task recipe: input, steps, output. An agent is an identity: system prompt, tool allowlist, model, reused across tasks.

- Promote a behaviour to an agent when three or more skills would copy the same system prompt, when a tool allowlist has to hold at identity level, or when a class of work must be pinned to one model. For a single caller keep the behaviour inline in `references/`.
- `allowed-tools` pre-approves permissions for one turn, it does not restrict the pool. A strictly read-only worker needs `disallowed-tools` on a skill or a `tools:` allowlist on an agent, plus one body line naming the only tools it has.
- On native macOS and Linux builds a worker that holds `Bash` gets no `Glob` or `Grep` (a call returns `No such tool available`), while one without `Bash` keeps both, as on Windows. Never add `Bash` to a read-only agent. Give every worker that holds `Bash` one line saying that error is no permission refusal and to search with `find` and `grep` through `Bash`.
- Never put `disallowed-tools` on a skill that dispatches agents: until the next user message it strips those tools from every agent dispatched meanwhile, for that agent's whole run. State its limits in the body, and since a body limit is soft, put a hard one in each dispatched agent's `tools:` or in permissions.
