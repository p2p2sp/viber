---
name: code-auditor
description: Multi-agent code audit through one lens (bugs, security, web-performance, runtime-performance, tests or design) over one scope (the current diff, one directory or the whole repository), every finding verified by an independent agent. Use when the user asks to audit, review or hunt defects in code for one of those lenses or scopes, such as "audit security of my branch" or "check the tests in src/api".
user-invocable: true
argument-hint: "[<lens>] [diff | diff:<sha> | <directory> | repo]"
allowed-tools: Agent, Read, Write, Edit, Glob, Grep, Bash, AskUserQuestion
---

# Code Auditor - one lens, one scope, many agents

A run audits one scope through one lens. Scripts do the mechanical work and print directives; this skill runs each script and acts on what it prints. It composes no brief and reads no lens file and no verdict file: the results live in the files under the run workspace `<ws>`, never in this context.

## Arguments

`/viber:code-auditor [<lens>] [diff | diff:<sha> | <directory> | repo]`: `$ARGUMENTS` holds up to two tokens, each read on its own:

- a lens name (`bugs`, `security`, `web-performance`, `runtime-performance`, `tests`, `design`) -> that lens, even when a directory of that name exists; `./<name>` addresses the directory;
- `performance` or `quality` -> that group, only its follow-up question is asked;
- `diff` -> the diff scope; `diff:<sha>` -> the diff scope measured from `<sha>`;
- `repo` -> the repository scope;
- anything else -> a directory.

## Lenses

1. `bugs`: wrong results, lost failures, crashes and hangs, races, producer and consumer mismatches.
2. `security`: injection, access control, authentication, untrusted input, secrets and supply chain, LLM agents.
3. `web-performance`: entry JS weight, LCP, layout shifts, hydration, asset delivery.
4. `runtime-performance`: complexity cliffs, I/O per item, unbounded growth, blocking calls, repeated setup, query shape.
5. `tests`: pseudo-tested code, hollow assertions, over-mocking, untested error paths, flaky, dead and wasteful tests.
6. `design`: duplicated knowledge, change preventers, wrong abstractions, coupling, untestable decisions, dead code, rule drift.

## Run

Start with `sh "${CLAUDE_SKILL_DIR}/scripts/frame.sh" '<token>'...`: one single-quoted argument per token of `$ARGUMENTS`, in place of a token holding an apostrophe the word `--apostrophe`. Where a stop line reads `<token>`, write that token.

Every script prints report lines (`<key>: <value>`), then directive lines, each followed by its body lines. Run each script as one literal Bash line, never changed, and act on each directive:

- `RUN: <line>`: run that line, the `sh "<skill dir>/scripts/map-signals.sh" "<ws>"` call of `frame.sh` among them, then act on its output.
- `STOP: <line>`: print the line and end the run.
- `ASK: <answer> -> <token> | ...`: one `AskUserQuestion` offering the answers, then act on the token of the answer given:
  - scope question (`lens:` in its body): `diff` or `repo` reruns `frame.sh` with the lens and that scope; `directory` asks in prose for the path, then reruns it with the lens and that path;
  - `wave`: run `sh "${CLAUDE_SKILL_DIR}/scripts/keep-units.sh" "<ws>" --wave` and act on its output; `end`: no call.
- `NEXT: ask-lens | numbers: <n>`: print the numbered lines of those numbers from Lenses, in the conversation's language, never through `AskUserQuestion`, and end the turn for the user's number. A listed number or a lens name selects that lens, any other reply prints the lines again. Then rerun `frame.sh` with the lens and the body's `scope:` value, when there is one.
- `NEXT: mapper | scout | hunter | critic | <field> ...`: one `Agent` call, `subagent_type` `viber:mapper`, `viber:scout`, `viber:hunter` or `viber:critic`, its prompt the body lines verbatim, its description naming the `id:` field. `model: sonnet` passes that `model`, `background` runs it in the background, `retry` marks the second and last attempt. When it returns:
  - mapper: run `sh "${CLAUDE_SKILL_DIR}/scripts/keep-units.sh" "<ws>"`;
  - scouts: once every scout of the batch has returned, run `keep-units.sh` again;
  - hunter: run `sh "${CLAUDE_SKILL_DIR}/scripts/hunt-return.sh" "<ws>" hunter <hunt id>`;
  - critic: run `sh "${CLAUDE_SKILL_DIR}/scripts/hunt-return.sh" "<ws>" critic <hunt id>-<k>`.
- `NEXT: merge`: for each `merge?:` pair, judge from its two `finding:` lines whether one root cause explains both, then run `sh "${CLAUDE_SKILL_DIR}/scripts/synthesize.sh" "<ws>"` with one `--merge <id>,<id>` per group of findings merged (a chain of pairs is one group), or `--merge none` when no pair merges.
- `NEXT: fill | findings: <path>`: fill each `entry:` as `${CLAUDE_SKILL_DIR}/references/synthesis.md` `## Fill rules` says, reading that section once.
- `NEXT: none`: nothing to dispatch.

A script's exit 2 is reported with its `error:` line and ends the run.

## Pool

At most 16 agents run at once in every phase: scouts in successive batches, hunters and critics together as one rolling pool, each return freeing a slot for the next queued agent, critics ahead of hunters. The `hunters-at-once:` value caps the hunters of the pool. Dispatch every hunter and critic in the background and end the turn between returns, never poll.

## Synthesize

Run `sh "${CLAUDE_SKILL_DIR}/scripts/synthesize.sh" "<ws>"` only once no hunter or critic is running or queued. Once the entries are filled, show the `summary:` line and the path of `findings.md`: it is the one report of the run. The run's last message, after any wave, ends on the `last-line:` value.

After a wave, with the pool empty, run `synthesize.sh` again: it rebuilds `findings.md`, keeps the entries already filled and prints the next fill block. Show the summary again. A run offers one wave.
