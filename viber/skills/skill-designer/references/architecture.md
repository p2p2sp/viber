# Execution architecture

Read when a skill drives noisy tool calls, chains stages, or repeats a behaviour other skills already carry. Decide the shape here, then express it in frontmatter.

## Cost comes from what a skill invokes

Every tool response, MCP payload and fetch a skill receives stays in the conversation for the rest of the session. A skill that is cheap on one item degrades over fifty: the window fills, auto-compaction summarises earlier turns mid-run, and late items get thinner work than early ones. One raw scrape repeated fifty times costs far more than a 500-line body, so optimise invocation before length.

Three moves stack: isolate with `context: fork`, compress with file handoff, preload with `!`.

## Fork

`context: fork` runs the skill in an isolated subagent. The conversation is snapshotted, the subagent works in a private window, and only its final return value comes back; its tool calls, file reads and intermediate reasoning never reach the caller. Nested forks fire, so an orchestrator and each of its stage skills can all fork.

- Single task with bloaty tool calls: fork alone is usually enough.
- Chain of stages: fork plus file handoff plus preload. Drop one layer and the bloat returns.
- Return one short line, never the raw output. A verdict plus a path is the whole contract: `VERDICT: PASS`, or `VERDICT: FAIL` with `REVIEW: <path>`.

Do not fork when:

- The skill asks the user mid-run. `AskUserQuestion` runs only in the main session; split it instead, see `split-patterns.md`.
- The output belongs in the main chat because the user keeps reasoning over it. The fork discards everything but its return value.
- The skill is reference or doctrine with no task to run.
- The run often has nothing to do. Bail early first, fork second, never fork an empty pipeline.

Model and effort in the fork come from the model tuning step: an unpinned fork runs on whatever model the session uses, and an unset `effort:` on that model's default.

## File handoff

A chained skill writes intermediate state to files instead of carrying it through the conversation. Each file is a compression checkpoint: the stage that produced the raw data distils it, and downstream stages read only the distillate.

- Fork saves the sub-skill, files save the orchestrator. Without files a stage returns its payload into the orchestrator context and the orchestrator ends up holding every stage; with files it holds one confirmation line each.
- Pass paths, never payloads. Short fields go inline as args, anything large or multiline goes as a path.
- Write run-scoped state under `.temp/<skill>/<slug>/`, namespaced by slug so parallel runs do not collide. Sweep old slug directories.
- Distil, do not dump. A 4000-token intermediate file defeats the checkpoint.
- Keep no long-lived state inside the skill directory, it can be wiped on upgrade.

One skill running N stages that write files is fine. Split into sub-skills when stages plausibly run standalone, get reused by more than one orchestrator, each carry heavy tool bloat, or you want to debug one stage without rerunning the chain. Stay monolithic when stages are tightly coupled and the data between them is small.

## Preload with `!`

A backticked `!` command in the body runs before the model reads the skill, and its output replaces the expression. It is preprocessing, not a tool call, so it removes the announce-read-receive-reason round trip from every stage that would otherwise open a file.

- Filter in the shell, not in context. Sort, slice and cut so only the needed rows enter the prompt; that is where a preload beats a `Read`.
- Output still costs tokens. A preloaded 500-token file is still 500 tokens.
- A missing file substitutes an empty string with no error. Guard with `|| echo <fallback>`.
- Never preload a mutating command, it runs on every skill load.
- Never splice `$ARGUMENTS` into a quoted string. A literal quote, backtick or paren in the args breaks the shell and the injection comes back empty; pass it single-quoted as one argument to a bundled script that parses it with bash builtins, and state in the description or `argument-hint` that the arguments never carry an apostrophe. `$ARGUMENTS` does substitute inside a forked skill, including a fork dispatched through the `Skill` tool.
- Single-quote any argument carrying `?`, `*` or `[`. An unmatched glob is a literal under bash but aborts the whole preload under zsh.
- Pre-approve the preload with a pattern entry in `allowed-tools` and call the bundled script directly rather than through an interpreter. A bare `Bash` allowance does not cover it, and an unmatched preload aborts the load so the fork starts with no input.
- Shell execution can be disabled by policy, so never make correctness depend on a preload.

## Skill or agent

A skill is a task recipe: given this input, do these steps, produce this output. An agent is an identity: system prompt, tool allowlist, model, reused across tasks.

- Promote a behaviour to an agent when three or more skills would copy the same system prompt, when a tool allowlist has to hold at identity level, or when a class of work must be pinned to one model. For a single caller keep the behaviour inline in `references/`.
- `allowed-tools` pre-approves permissions for one turn, it does not restrict the pool. A strictly read-only worker needs `disallowed-tools` on a skill or a `tools:` allowlist on an agent, plus one line in the body naming the only tools it has. On native macOS and Linux builds a worker that holds `Bash` gets no `Glob` or `Grep` (a call returns `No such tool available`), while one without `Bash` keeps both, as on Windows: never add `Bash` to a read-only agent, and give every worker that holds `Bash` one line saying that error is no permission refusal and to search with `find` and `grep` through `Bash` instead. Never put `disallowed-tools` on a skill that dispatches agents: until the next user message it strips those tools from every agent dispatched meanwhile, for that agent's whole run; state its limits in the body instead, and since a body limit is soft, put a hard one in each dispatched agent's `tools:` or in permissions.
