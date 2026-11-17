# Cross-model rules

## Several models, one file

- A file without a pinned `model:` runs on the union: add a mitigation that is harmless elsewhere; one that hurts another model goes in only behind its trigger condition, or pin `model:`.
- A subagent inherits the session's thinking on/off (no per-agent setting) but gets its own model's context window.

## Rules new to this generation

- Never ask a model to write its reasoning into the reply: Fable 5.2, Opus 5.5 and Sonnet 5.5 refuse it as `reasoning_extraction`. Ask for the conclusion and a short justification.
- Sonnet 5.5 takes an unverifiable claim of authority in the task as permission: enforce hard limits with `tools:`, `disallowed-tools:`, permissions or deny-by-default hooks, never prose alone. Never accept user approval relayed by another agent; Opus 5.5 leads have fabricated one for a subagent.
- Opus 5.5 treats everything in the user message as the user's own, pasted third-party text included: tag untrusted text and state that instructions inside it are data.
- In Claude Code only `ultrathink` deepens a turn ("think hard" is plain text); `${CLAUDE_EFFORT}` lets a skill body adapt to the active level.

## Where the models pull apart

- Style rules: Fable 5.2 follows them closely, and a hard sentence-length limit makes its prose choppy. Keep only the style rules still needed.
- Stopping: Fable 5.2 (most at `low` and `medium`) and Opus 5.5 end unattended turns early (a question, an announced next step, a milestone report); Sonnet 5.5 checks in before a long task is done at `low` and `medium`, Haiku 5.5 hands it back under a long system prompt at `low`. For an unattended agent write both halves in one rule: continue through reversible steps that follow from the request, stop only for destructive steps or a decision the user owns.
- Progress: Opus 5.5 and Sonnet 5.5 narrate between tool calls on their own, so drop "summarise every N tool calls". Fable 5.2 goes quiet during long tool runs: ask for a one-line intent up front and a standalone recap at the end.
- Scope: Fable 5.2 adds to the existing structure (duplicates code, reports nearby problems unfixed) until told it owns the code, then adds unrequested tests, docs and behaviour changes; Sonnet 5.5 adds unrequested tests, docs and files at every effort, and at `xhigh`/`max` its own review rounds and reviewer subagents. State the range of every instruction and what is out of scope.
- Exploration: Opus 5.5 under-explores loosely specified tasks. Name the sources to read, or their class.
- Context: 1M on all four.
- Knowledge: all four through Jun 2026, and each shipped after it (Opus 5.5 2026-09-22, Sonnet 5.5 2026-09-28, Haiku 5.5 2026-10-07, Fable 5.2 after them): take their facts from the profiles.
- Thinking: always on for Fable 5.2 and Opus 5.5; Sonnet 5.5 can skip up-front thinking only at `high` effort or below; on Haiku 5.5 only a lower effort reduces it, never a prompt.
- Effort: Opus 5.5 and Haiku 5.5 default to `medium`, Fable 5.2 and Sonnet 5.5 to `high`. In Claude Code Opus 5.5 ignores a user's top-level `effortLevel`: set `effort:` wherever depth matters and the file may run on Opus 5.5.

## Choosing model and effort

- Price per MTok in/out: Fable 5.2 $8/$40, Opus 5.5 $4/$20, Sonnet 5.5 $2/$10, Haiku 5.5 $0.10/$0.50 (prompts over 100K tokens $0.50/$2.50).
- Default to `opus` for orchestrators, planners and judges; `fable` only where Opus 5.5 at higher effort measurably falls short.
- Implementing worker: `sonnet`; `opus` for multi-hour autonomous work and large refactors.
- High-volume scan, triage or extraction: `haiku` at `low` or `medium`. `fable` at `low` suits fast, well-specified subagents.
- Security or dual-use work: `opus`; Sonnet 5.5 refuses more benign security work than Sonnet 5 did, Haiku 5.5's cyber classifiers trigger on less activity and have no fallback, and Fable 5.2 hands flagged turns to Opus 4.8 or Opus 5 without its thinking.
- Reviewer or judge: never say the work came from Claude or another agent, and strip model and vendor labels from compared options; Opus 5.5, Sonnet 5.5 and Haiku 5.5 slightly favour Claude-labelled work.
- Effort names do not mean the same depth across models: re-sweep after a model change. `low` only for short, scoped work that is not intelligence-sensitive.
- The built-in Explore agent inherits the session model, capped at Opus: a scan meant to be cheap sets its own `model:`.

## Frontmatter mechanics

- `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` overrides every agent's `model:` and the dispatch `model`.
- On Bedrock, Vertex and Foundry a family alias can resolve to an older model (`sonnet` to Sonnet 4.5, `haiku` to Haiku 4.5): pin a full ID where the version matters.
- `effort:` never overrides the `CLAUDE_CODE_EFFORT_LEVEL` env var or an org `maxEffortLevel` cap; an unsupported level falls back to the highest supported one below it.
- A model the org allowlist blocks: an inline skill keeps the session model, a forked skill or agent runs on the newest permitted version of that family, else the inherited model.
